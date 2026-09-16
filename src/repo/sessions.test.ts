import { createTestDb } from '../../test/nodeDb';
import { createPlayer } from './players';
import {
  createSession, updateSession, deleteSession, listSessionSummaries, getSessionDetail,
  addPlayerToSession, removePlayerFromSession, setCashout, addBuyin, updateBuyin, removeBuyin, lastSessionPlayerIds,
} from './sessions';

function setup() {
  const db = createTestDb();
  const ann = createPlayer(db, 'Ann');
  const bob = createPlayer(db, 'Bob');
  const cat = createPlayer(db, 'Cat');
  return { db, ann, bob, cat };
}

describe('sessions repo', () => {
  it('creates a session with players in given order', () => {
    const { db, ann, bob } = setup();
    const s = createSession(db, { date: '2026-09-16', title: 'Home', defaultBuyinCents: 2000, playerIds: [bob.id, ann.id] });
    const d = getSessionDetail(db, s.id)!;
    expect(d.session).toEqual(expect.objectContaining({ date: '2026-09-16', title: 'Home', defaultBuyinCents: 2000 }));
    expect(d.players.map((p) => p.player.name)).toEqual(['Bob', 'Ann']);
    expect(d.players.map((p) => p.sp.sortOrder)).toEqual([0, 1]);
    expect(d.players[0].buyins).toEqual([]);
    expect(d.players[0].sp.cashoutCents).toBeNull();
  });

  it('adds and removes players, appending sort order', () => {
    const { db, ann, bob, cat } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
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
    const { db, ann } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
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
    const { db, ann } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    setCashout(db, sp.id, 3500);
    expect(getSessionDetail(db, s.id)!.players[0].sp.cashoutCents).toBe(3500);
    setCashout(db, sp.id, null);
    expect(getSessionDetail(db, s.id)!.players[0].sp.cashoutCents).toBeNull();
    expect(() => setCashout(db, sp.id, -1)).toThrow('Amount must be non-negative');
  });

  it('summaries sorted by date desc with top winner', () => {
    const { db, ann, bob } = setup();
    const old = createSession(db, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const recent = createSession(db, { date: '2026-09-16', title: 'Big', defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    const d = getSessionDetail(db, recent.id)!;
    addBuyin(db, d.players[0].sp.id, 2000);
    addBuyin(db, d.players[1].sp.id, 2000);
    setCashout(db, d.players[0].sp.id, 500);
    setCashout(db, d.players[1].sp.id, 3500);
    const sums = listSessionSummaries(db);
    expect(sums.map((x) => x.session.id)).toEqual([recent.id, old.id]);
    expect(sums[0].playerCount).toBe(2);
    expect(sums[0].totalBuyinCents).toBe(4000);
    expect(sums[0].topWinner).toEqual({ name: 'Bob', netCents: 1500 });
    expect(sums[1].totalBuyinCents).toBe(0);
    expect(sums[1].topWinner).toBeNull();
  });

  it('updateSession patches fields', () => {
    const { db, ann } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    updateSession(db, s.id, { title: 'Renamed', defaultBuyinCents: 2500 });
    expect(getSessionDetail(db, s.id)!.session).toEqual(expect.objectContaining({ title: 'Renamed', defaultBuyinCents: 2500 }));
  });

  it('deleteSession hides everything', () => {
    const { db, ann } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    addBuyin(db, sp.id, 2000);
    deleteSession(db, s.id);
    expect(getSessionDetail(db, s.id)).toBeNull();
    expect(listSessionSummaries(db)).toEqual([]);
    expect(db.first('SELECT deleted_at FROM buyins WHERE session_player_id = ?', [sp.id])).toEqual({ deleted_at: expect.any(Number) });
  });

  it('lastSessionPlayerIds returns most recent session players', () => {
    const { db, ann, bob } = setup();
    expect(lastSessionPlayerIds(db)).toEqual([]);
    createSession(db, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [bob.id, ann.id] });
    expect(lastSessionPlayerIds(db)).toEqual([bob.id, ann.id]);
  });
});
