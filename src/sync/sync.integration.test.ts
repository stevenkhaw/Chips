/**
 * @jest-environment node
 *
 * Owner and reader phones against the local Supabase stack. Skipped unless CHIPS_SUPABASE_URL/KEY are set;
 * run with `npm run test:sync` after `supabase start`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureSession } from './remote';
import type { Db } from '@/db/types';
import { createTestDb } from '../../test/nodeDb';
import { createHouse, deleteHouse, getCurrentHouseId, getHouse } from '@/repo/houses';
import { createPlayer, renamePlayer } from '@/repo/players';
import { addBuyin, addPayment, createSession, deleteSession, removeBuyin, setCashout } from '@/repo/sessions';
import { SYNC_COLUMNS, pendingCount, type SyncTable } from '@/repo/sync';
import { LEDGER_TABLES } from '@/db/schema';
import { publishHouse } from './publish';
import { pushHouse } from './push';
import * as remote from './remote';
import { rpcLeaveHouse, rpcRemoveMember, upsertRows, PAGE_SIZE } from './remote';
import { joinByCode } from './join';
import { pullHouse } from './pull';

const URL = process.env.CHIPS_SUPABASE_URL;
const KEY = process.env.CHIPS_SUPABASE_KEY;
const describeIt = URL && KEY ? describe : describe.skip;

export function newClient(): SupabaseClient {
  return createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A house with two players, one night, buy-ins, cash-outs and a payment. */
export function seedHouse(db: Db, name = 'IT Crew') {
  const house = createHouse(db, { name, currencySymbol: '£' });
  const ann = createPlayer(db, house.id, 'Ann');
  const bo = createPlayer(db, house.id, 'Bo');
  const night = createSession(db, house.id, { date: '2026-09-24', title: 'Opening night', defaultBuyinCents: 2000, playerIds: [ann.id, bo.id] });
  const sps = db.all<{ id: string }>('SELECT id FROM session_players WHERE session_id = ? ORDER BY sort_order', [night.id]);
  addBuyin(db, sps[0].id, 2000);
  addBuyin(db, sps[1].id, 2000);
  const extra = addBuyin(db, sps[1].id, 500);
  removeBuyin(db, extra.id); // a soft-deleted row, so snapshot equality also covers deleted_at
  setCashout(db, sps[0].id, 3000);
  setCashout(db, sps[1].id, 1000);
  addPayment(db, night.id, { fromPlayerId: bo.id, toPlayerId: ann.id, amountCents: 1000 });
  return { house, ann, bo, night };
}

/** Every synced column of every ledger row in the house, keyed by table. Includes soft-deleted rows. */
export function snapshot(db: Db, houseId: string): Record<SyncTable, unknown[]> {
  const out = {} as Record<SyncTable, unknown[]>;
  for (const t of LEDGER_TABLES) {
    out[t] = db.all(`SELECT ${SYNC_COLUMNS[t].join(', ')} FROM ${t} WHERE house_id = ? ORDER BY id`, [houseId]);
  }
  return out;
}

async function serverSnapshot(client: SupabaseClient, houseId: string): Promise<Record<SyncTable, unknown[]>> {
  const out = {} as Record<SyncTable, unknown[]>;
  for (const t of LEDGER_TABLES) {
    const { data, error } = await client.from(t).select(SYNC_COLUMNS[t].join(', ')).eq('house_id', houseId).order('id');
    if (error) throw error;
    out[t] = data ?? [];
  }
  return out;
}

describeIt('sync against local Supabase', () => {
  jest.setTimeout(30000);

  it('signs in anonymously and keeps the same user', async () => {
    const c = newClient();
    const a = await ensureSession(c);
    const b = await ensureSession(c);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
  });

  it('publishes a house and pushes every row', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(db);
    const { joinCode, inviteSecret } = await publishHouse(db, owner, house.id, 'hunter22');
    expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(inviteSecret).toHaveLength(43);
    expect(pendingCount(db, house.id)).toBe(0);
    expect(await serverSnapshot(owner, house.id)).toEqual(snapshot(db, house.id));
    const { data: serverHouse } = await owner.from('houses').select('name, currency_symbol').eq('id', house.id).single();
    expect(serverHouse?.name).toBe(house.name);
    expect(serverHouse?.currency_symbol).toBe(house.currencySymbol);
  });

  it('does not push an unpublished house', async () => {
    const db = createTestDb();
    const owner = newClient();
    const myHouseId = getCurrentHouseId(db);
    expect(await pushHouse(db, owner, myHouseId)).toBe(0);
  });

  it('pushes the house row and later edits, and nothing when clean', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house, ann } = seedHouse(db);
    await publishHouse(db, owner, house.id, 'hunter22');
    expect(await pushHouse(db, owner, house.id)).toBe(0);

    db.run("UPDATE houses SET name = 'Renamed', updated_at = updated_at + 1, dirty = 1 WHERE id = ?", [house.id]);
    db.run("UPDATE players SET name = 'Annie', updated_at = updated_at + 1, dirty = 1 WHERE id = ?", [ann.id]);
    expect(await pushHouse(db, owner, house.id)).toBe(2);
    const { data } = await owner.from('houses').select('name').eq('id', house.id).single();
    expect(data?.name).toBe('Renamed');
    expect(await serverSnapshot(owner, house.id)).toEqual(snapshot(db, house.id));
  });

  it('is immune to a row created mid-push (transient FK race)', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house, ann, bo, night } = seedHouse(db);
    await publishHouse(db, owner, house.id, 'hunter22');

    // Dirty an existing session_players row so pushHouse's session_players pass runs.
    db.run("UPDATE session_players SET updated_at = updated_at + 1, dirty = 1 WHERE session_id = ?", [night.id]);

    // While that pass is in flight (mid-push, between two awaits), simulate a live night: a new
    // session with its own session_player + buy-in appears. With the old, buggy pushHouse this
    // new buy-in would be read fresh at the buyins pass (which runs after session_players) and get
    // pushed even though its parent session_player was created too late to be part of this push —
    // a transient FK violation (23503). The fix snapshots every table's dirty rows before the
    // first await, so the new rows are simply left dirty for the next push instead.
    const realUpsertRows = remote.upsertRows.bind(remote);
    const upsertSpy = jest.spyOn(remote, 'upsertRows');
    let injected = false;
    upsertSpy.mockImplementation(async (client, table, rows) => {
      if (table === 'session_players' && !injected) {
        injected = true;
        const night2 = createSession(db, house.id, {
          date: '2026-09-25', title: 'Night 2', defaultBuyinCents: 1000, playerIds: [ann.id, bo.id],
        });
        const sps2 = db.all<{ id: string }>('SELECT id FROM session_players WHERE session_id = ? ORDER BY sort_order', [night2.id]);
        addBuyin(db, sps2[0].id, 1000);
      }
      return realUpsertRows(client, table, rows);
    });

    await expect(pushHouse(db, owner, house.id)).resolves.toBeGreaterThan(0);
    upsertSpy.mockRestore();

    // The mid-push row is excluded from that push and stays dirty...
    expect(pendingCount(db, house.id)).toBeGreaterThan(0);
    // ...and a follow-up push picks it up cleanly.
    expect(await pushHouse(db, owner, house.id)).toBeGreaterThan(0);
    expect(pendingCount(db, house.id)).toBe(0);
    expect(await serverSnapshot(owner, house.id)).toEqual(snapshot(db, house.id));
  });

  it('publish is safe to retry', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(db);
    const a = await publishHouse(db, owner, house.id, 'hunter22');
    const b = await publishHouse(db, owner, house.id, 'hunter23');
    expect(b.joinCode).toBe(a.joinCode);
    expect(b.inviteSecret).toBe(a.inviteSecret);
    expect(pendingCount(db, house.id)).toBe(0);
    expect(await serverSnapshot(owner, house.id)).toEqual(snapshot(db, house.id));
  });

  it('a reader joins by code and gets the same ledger', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, owner, house.id, 'hunter22');

    const readerDb = createTestDb();
    const reader = newClient();
    const typed = `${joinCode.slice(0, 4).toLowerCase()}-${joinCode.slice(4)}`;
    expect(await joinByCode(readerDb, reader, typed, 'hunter22', 'Rae')).toEqual({ ok: true, houseId: house.id, role: 'reader' });
    expect(snapshot(readerDb, house.id)).toEqual(snapshot(ownerDb, house.id));
    expect(getHouse(readerDb, house.id)).toEqual(
      expect.objectContaining({ name: 'IT Crew', currencySymbol: '£', role: 'reader', published: true, joinCode }),
    );
  });

  it('wrong code and wrong password give the same answer', async () => {
    const ownerDb = createTestDb();
    const { house } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, newClient(), house.id, 'hunter22');
    const reader = newClient();
    const db = createTestDb();
    const badPw = await joinByCode(db, reader, joinCode, 'nope');
    const badCode = await joinByCode(db, reader, 'ZZZZZZZZ', 'hunter22');
    expect(badPw).toEqual({ ok: false, error: 'invalid' });
    expect(badCode).toEqual(badPw);
  });

  it('pulls later edits, soft deletes and renames incrementally', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const { house, ann, night } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, owner, house.id, 'hunter22');
    const readerDb = createTestDb();
    const reader = newClient();
    await joinByCode(readerDb, reader, joinCode, 'hunter22');

    renamePlayer(ownerDb, ann.id, 'Annie');
    deleteSession(ownerDb, night.id);
    ownerDb.run("UPDATE houses SET name = 'Tuesday', updated_at = updated_at + 1, dirty = 1 WHERE id = ?", [house.id]);
    await pushHouse(ownerDb, owner, house.id);

    expect(await pullHouse(readerDb, reader, house.id)).toBe('ok');
    expect(snapshot(readerDb, house.id)).toEqual(snapshot(ownerDb, house.id));
    expect(getHouse(readerDb, house.id)?.name).toBe('Tuesday');
    expect(await pullHouse(readerDb, reader, house.id)).toBe('ok'); // idempotent
    expect(snapshot(readerDb, house.id)).toEqual(snapshot(ownerDb, house.id));
  });

  it('pages through more rows than one page', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const house = createHouse(ownerDb, { name: 'Big', currencySymbol: '$' });
    for (let i = 0; i < PAGE_SIZE + 20; i++) createPlayer(ownerDb, house.id, `P${i}`);
    const { joinCode } = await publishHouse(ownerDb, owner, house.id, 'hunter22');
    const readerDb = createTestDb();
    await joinByCode(readerDb, newClient(), joinCode, 'hunter22');
    expect(snapshot(readerDb, house.id).players).toHaveLength(PAGE_SIZE + 20);
  });

  it('a reader cannot write to the server', async () => {
    const ownerDb = createTestDb();
    const { house, ann } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, newClient(), house.id, 'hunter22');
    const reader = newClient();
    await joinByCode(createTestDb(), reader, joinCode, 'hunter22');
    await expect(
      upsertRows(reader, 'players', [
        { ...(snapshot(ownerDb, house.id).players.find((p) => (p as { id: string }).id === ann.id) as Record<string, unknown>), name: 'Hacked' } as never,
      ]),
    ).rejects.toEqual(expect.objectContaining({ code: '42501' }));
  });

  it('removed and left readers get "removed"; a deleted house reads "closed"', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, owner, house.id, 'hunter22');

    const r1Db = createTestDb();
    const r1 = newClient();
    await joinByCode(r1Db, r1, joinCode, 'hunter22');
    const r1Id = await ensureSession(r1);
    await rpcRemoveMember(owner, house.id, r1Id);
    expect(await pullHouse(r1Db, r1, house.id)).toBe('removed');

    const r2Db = createTestDb();
    const r2 = newClient();
    await joinByCode(r2Db, r2, joinCode, 'hunter22');
    await rpcLeaveHouse(r2, house.id);
    expect(await pullHouse(r2Db, r2, house.id)).toBe('removed');

    const r3Db = createTestDb();
    const r3 = newClient();
    await joinByCode(r3Db, r3, joinCode, 'hunter22');
    deleteHouse(ownerDb, house.id); // owner db still has My House, so deleting is allowed
    await pushHouse(ownerDb, owner, house.id);
    expect(await pullHouse(r3Db, r3, house.id)).toBe('closed');
    expect(getHouse(r3Db, house.id)?.closed).toBe(true);
  });

  it('the owner joining their own code keeps owner role and pulls nothing', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(db);
    const { joinCode } = await publishHouse(db, owner, house.id, 'hunter22');
    expect(await joinByCode(db, owner, joinCode, 'hunter22')).toEqual({ ok: true, houseId: house.id, role: 'owner' });
    expect(pendingCount(db, house.id)).toBe(0);
  });
});
