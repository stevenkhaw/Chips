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
import { createHouse } from '@/repo/houses';
import { createPlayer } from '@/repo/players';
import { addBuyin, addPayment, createSession, setCashout } from '@/repo/sessions';
import { SYNC_COLUMNS, pendingCount, type SyncTable } from '@/repo/sync';
import { LEDGER_TABLES } from '@/db/schema';
import { publishHouse } from './publish';
import { pushHouse } from './push';

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

  it('publish is safe to retry', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(db);
    const a = await publishHouse(db, owner, house.id, 'hunter22');
    const b = await publishHouse(db, owner, house.id, 'hunter23');
    expect(b.joinCode).toBe(a.joinCode);
  });
});
