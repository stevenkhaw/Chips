import { createTestDb } from '../../test/nodeDb';
import { createPlayer } from './players';
import { createHouse, getCurrentHouseId } from './houses';
import {
  createSession, updateSession, deleteSession, listSessionSummaries, listSessionDetails, getSessionDetail,
  addPlayerToSession, removePlayerFromSession, setCashout, addBuyin, updateBuyin, removeBuyin, lastSessionPlayerIds,
  addPayment, removePayment,
} from './sessions';

function setup() {
  const db = createTestDb();
  const h = getCurrentHouseId(db);
  const ann = createPlayer(db, h, 'Ann');
  const bob = createPlayer(db, h, 'Bob');
  const cat = createPlayer(db, h, 'Cat');
  return { db, h, ann, bob, cat };
}

describe('sessions repo', () => {
  it('creates a session with players in given order', () => {
    const { db, h, ann, bob } = setup();
    const s = createSession(db, h, { date: '2026-09-16', title: 'Home', defaultBuyinCents: 2000, playerIds: [bob.id, ann.id] });
    const d = getSessionDetail(db, s.id)!;
    expect(d.session).toEqual(expect.objectContaining({ date: '2026-09-16', title: 'Home', defaultBuyinCents: 2000 }));
    expect(d.players.map((p) => p.player.name)).toEqual(['Bob', 'Ann']);
    expect(d.players.map((p) => p.sp.sortOrder)).toEqual([0, 1]);
    expect(d.players[0].buyins).toEqual([]);
    expect(d.players[0].sp.cashoutCents).toBeNull();
  });

  it('adds and removes players, appending sort order', () => {
    const { db, h, ann, bob, cat } = setup();
    const s = createSession(db, h, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const spBob = addPlayerToSession(db, s.id, bob.id);
    expect(spBob.sortOrder).toBe(1);
    expect(() => addPlayerToSession(db, s.id, bob.id)).toThrow('Player already in session');
    addBuyin(db, spBob.id, 2000);
    removePlayerFromSession(db, spBob.id);
    const d = getSessionDetail(db, s.id)!;
    expect(d.players.map((p) => p.player.id)).toEqual([ann.id]);
    // re-adding after removal works
    expect(addPlayerToSession(db, s.id, bob.id).sortOrder).toBe(2);
    expect(getSessionDetail(db, s.id)!.players.find((p) => p.player.id === bob.id)!.buyins).toEqual([]);
    void cat;
  });

  it('buy-ins: add, update, remove, validation', () => {
    const { db, h, ann } = setup();
    const s = createSession(db, h, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    const b1 = addBuyin(db, sp.id, 2000);
    const b2 = addBuyin(db, sp.id, 1000);
    expect(() => addBuyin(db, sp.id, 0)).toThrow('Amount must be positive');
    updateBuyin(db, b2.id, 1500);
    removeBuyin(db, b1.id);
    const buyins = getSessionDetail(db, s.id)!.players[0].buyins;
    expect(buyins.map((b) => b.amountCents)).toEqual([1500]);
  });

  it('cashout set, cleared, validated', () => {
    const { db, h, ann } = setup();
    const s = createSession(db, h, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    setCashout(db, sp.id, 3500);
    expect(getSessionDetail(db, s.id)!.players[0].sp.cashoutCents).toBe(3500);
    setCashout(db, sp.id, null);
    expect(getSessionDetail(db, s.id)!.players[0].sp.cashoutCents).toBeNull();
    expect(() => setCashout(db, sp.id, -1)).toThrow('Amount must be non-negative');
  });

  it('summaries sorted by date desc with top winner', () => {
    const { db, h, ann, bob } = setup();
    const old = createSession(db, h, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const recent = createSession(db, h, { date: '2026-09-16', title: 'Big', defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    const d = getSessionDetail(db, recent.id)!;
    addBuyin(db, d.players[0].sp.id, 2000);
    addBuyin(db, d.players[1].sp.id, 2000);
    setCashout(db, d.players[0].sp.id, 500);
    setCashout(db, d.players[1].sp.id, 3500);
    const sums = listSessionSummaries(db, h);
    expect(sums.map((x) => x.session.id)).toEqual([recent.id, old.id]);
    expect(sums[0].playerCount).toBe(2);
    expect(sums[0].totalBuyinCents).toBe(4000);
    expect(sums[0].topWinner).toEqual({ name: 'Bob', netCents: 1500 });
    expect(sums[1].totalBuyinCents).toBe(0);
    expect(sums[1].topWinner).toBeNull();
  });

  it('updateSession patches fields', () => {
    const { db, h, ann } = setup();
    const s = createSession(db, h, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    updateSession(db, s.id, { title: 'Renamed', defaultBuyinCents: 2500 });
    expect(getSessionDetail(db, s.id)!.session).toEqual(expect.objectContaining({ title: 'Renamed', defaultBuyinCents: 2500 }));
  });

  it('deleteSession hides everything', () => {
    const { db, h, ann } = setup();
    const s = createSession(db, h, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    addBuyin(db, sp.id, 2000);
    deleteSession(db, s.id);
    expect(getSessionDetail(db, s.id)).toBeNull();
    expect(listSessionSummaries(db, h)).toEqual([]);
    expect(db.first('SELECT deleted_at FROM buyins WHERE session_player_id = ?', [sp.id])).toEqual({ deleted_at: expect.any(Number) });
  });

  it('payments: add, list order, validation, remove, deleteSession cascades', () => {
    const { db, h, ann, bob } = setup();
    const s = createSession(db, h, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });

    expect(() => addPayment(db, s.id, { fromPlayerId: bob.id, toPlayerId: ann.id, amountCents: 0 })).toThrow('Amount must be positive');
    expect(() => addPayment(db, s.id, { fromPlayerId: bob.id, toPlayerId: ann.id, amountCents: 1.5 })).toThrow('Amount must be positive');
    expect(() => addPayment(db, s.id, { fromPlayerId: ann.id, toPlayerId: ann.id, amountCents: 500 })).toThrow('Payer and payee must differ');

    const p1 = addPayment(db, s.id, { fromPlayerId: bob.id, toPlayerId: ann.id, amountCents: 1000, note: 'Venmo' });
    const p2 = addPayment(db, s.id, { fromPlayerId: ann.id, toPlayerId: bob.id, amountCents: 500 });
    expect(p1.note).toBe('Venmo');
    expect(p2.note).toBeNull();

    const d = getSessionDetail(db, s.id)!;
    expect(d.payments.map((p) => p.id)).toEqual([p1.id, p2.id]);

    removePayment(db, p1.id);
    const d2 = getSessionDetail(db, s.id)!;
    expect(d2.payments.map((p) => p.id)).toEqual([p2.id]);

    deleteSession(db, s.id);
    expect(db.first('SELECT deleted_at FROM payments WHERE id = ?', [p2.id])).toEqual({ deleted_at: expect.any(Number) });
  });

  it('lastSessionPlayerIds returns most recent session players', () => {
    const { db, h, ann, bob } = setup();
    expect(lastSessionPlayerIds(db, h)).toEqual([]);
    createSession(db, h, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    createSession(db, h, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [bob.id, ann.id] });
    expect(lastSessionPlayerIds(db, h)).toEqual([bob.id, ann.id]);
  });

  it('listSessionDetails returns non-deleted sessions oldest first with full detail', () => {
    const { db, h, ann, bob } = setup();
    const late = createSession(db, h, { date: '2026-09-20', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const early = createSession(db, h, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    const gone = createSession(db, h, { date: '2026-09-10', title: null, defaultBuyinCents: 2000, playerIds: [bob.id] });
    deleteSession(db, gone.id);
    const sp = getSessionDetail(db, early.id)!.players[0].sp.id;
    addBuyin(db, sp, 2000);
    setCashout(db, sp, 3500);

    const all = listSessionDetails(db, h);
    expect(all.map((d) => d.session.id)).toEqual([early.id, late.id]);
    expect(all[0].players.map((p) => p.player.name)).toEqual(['Ann', 'Bob']);
    expect(all[0].players[0].buyins.map((b) => b.amountCents)).toEqual([2000]);
    expect(all[0].players[0].sp.cashoutCents).toBe(3500);
  });
});

describe('sessions per house', () => {
  it('lists only the given house', () => {
    const { db, h, ann } = setup();
    const other = createHouse(db, { name: 'Work', currencySymbol: '$' });
    const zed = createPlayer(db, other.id, 'Zed');
    createSession(db, h, { date: '2026-09-01', title: 'Home', defaultBuyinCents: 2000, playerIds: [ann.id] });
    createSession(db, other.id, { date: '2026-09-02', title: 'Work', defaultBuyinCents: 2000, playerIds: [zed.id] });
    expect(listSessionSummaries(db, h).map((s) => s.session.title)).toEqual(['Home']);
    expect(listSessionDetails(db, other.id).map((d) => d.session.title)).toEqual(['Work']);
    expect(lastSessionPlayerIds(db, h)).toEqual([ann.id]);
    expect(lastSessionPlayerIds(db, other.id)).toEqual([zed.id]);
  });

  it('children inherit the session house_id', () => {
    const { db, ann, bob } = setup();
    const other = createHouse(db, { name: 'Work', currencySymbol: '$' });
    const s = createSession(db, other.id, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = addPlayerToSession(db, s.id, bob.id);
    const b = addBuyin(db, sp.id, 2000);
    const pay = addPayment(db, s.id, { fromPlayerId: bob.id, toPlayerId: ann.id, amountCents: 500 });
    const house = (table: string, id: string) =>
      db.first<{ house_id: string }>(`SELECT house_id FROM ${table} WHERE id = ?`, [id])?.house_id;
    expect(house('sessions', s.id)).toBe(other.id);
    expect(house('session_players', sp.id)).toBe(other.id);
    expect(house('buyins', b.id)).toBe(other.id);
    expect(house('payments', pay.id)).toBe(other.id);
    const firstSp = getSessionDetail(db, s.id)!.players[0].sp.id;
    expect(house('session_players', firstSp)).toBe(other.id);
  });

  it('every update marks the row dirty', () => {
    const { db, h, ann, bob } = setup();
    const s = createSession(db, h, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    const b = addBuyin(db, sp.id, 2000);
    const pay = addPayment(db, s.id, { fromPlayerId: bob.id, toPlayerId: ann.id, amountCents: 500 });
    const clean = () => {
      for (const t of ['sessions', 'session_players', 'buyins', 'payments']) db.run(`UPDATE ${t} SET dirty = 0`);
    };
    const dirty = (table: string, id: string) =>
      db.first<{ dirty: number }>(`SELECT dirty FROM ${table} WHERE id = ?`, [id])?.dirty;

    clean(); updateSession(db, s.id, { title: 'X' }); expect(dirty('sessions', s.id)).toBe(1);
    clean(); setCashout(db, sp.id, 1000); expect(dirty('session_players', sp.id)).toBe(1);
    clean(); updateBuyin(db, b.id, 2500); expect(dirty('buyins', b.id)).toBe(1);
    clean(); removeBuyin(db, b.id); expect(dirty('buyins', b.id)).toBe(1);
    clean(); removePayment(db, pay.id); expect(dirty('payments', pay.id)).toBe(1);
    clean(); removePlayerFromSession(db, sp.id); expect(dirty('session_players', sp.id)).toBe(1);
    clean(); deleteSession(db, s.id); expect(dirty('sessions', s.id)).toBe(1);
  });
});
