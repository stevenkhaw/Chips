import { buildHistory } from './history';
import type { Buyin, Player, SessionDetail, SessionPlayer } from './types';

const base = { createdAt: 0, updatedAt: 0, deletedAt: null };
const player = (id: string, name: string, colorSeed = 1): Player => ({ ...base, id, name, colorSeed, archived: false });
const sp = (sessionId: string, playerId: string, cashoutCents: number | null, sortOrder: number): SessionPlayer => ({
  ...base, id: `${sessionId}-${playerId}`, sessionId, playerId, cashoutCents, sortOrder,
});
const buyin = (sessionPlayerId: string, amountCents: number): Buyin => ({
  ...base, id: `${sessionPlayerId}-b${amountCents}`, sessionPlayerId, amountCents, at: 0,
});
const night = (
  id: string,
  date: string,
  rows: { p: Player; buyin: number; cashout: number | null }[],
): SessionDetail => ({
  session: { ...base, id, date, title: null, defaultBuyinCents: 2000, notes: null },
  players: rows.map((r, i) => {
    const s = sp(id, r.p.id, r.cashout, i);
    return { sp: s, player: r.p, buyins: [buyin(s.id, r.buyin)] };
  }),
  payments: [],
});

const ann = player('p1', 'Ann', 0);
const bob = player('p2', 'Bob', 3);
const cat = player('p3', 'Cat', 5);

describe('buildHistory', () => {
  it('returns empty history for no nights', () => {
    expect(buildHistory([])).toEqual({ nights: [], players: [] });
  });

  it('computes per-night nets and running totals in the given order', () => {
    const n1 = night('s1', '2026-09-01', [
      { p: ann, buyin: 2000, cashout: 5000 },
      { p: bob, buyin: 2000, cashout: 0 },
      { p: cat, buyin: 2000, cashout: 1000 },
    ]);
    const n2 = night('s2', '2026-09-08', [
      { p: ann, buyin: 2000, cashout: 1000 },
      { p: bob, buyin: 4000, cashout: 6000 },
    ]);
    const h = buildHistory([n1, n2]);

    expect(h.nights.map((n) => n.session.id)).toEqual(['s1', 's2']);
    expect(h.nights[0].nets).toEqual({ p1: 3000, p2: -2000, p3: -1000 });
    expect(h.nights[1].nets).toEqual({ p1: -1000, p2: 2000 });

    expect(h.players.map((p) => p.playerId)).toEqual(['p1', 'p2', 'p3']); // sorted by total desc
    expect(h.players[0]).toEqual({
      playerId: 'p1', name: 'Ann', nightsPlayed: 2, totalNetCents: 2000, cumulative: [3000, 2000],
    });
    expect(h.players[1]).toEqual({
      playerId: 'p2', name: 'Bob', nightsPlayed: 2, totalNetCents: 0, cumulative: [-2000, 0],
    });
    // Cat missed night 2: running total unchanged, cumulative entry null for that night.
    expect(h.players[2]).toEqual({
      playerId: 'p3', name: 'Cat', nightsPlayed: 1, totalNetCents: -1000, cumulative: [-1000, null],
    });
  });

  it('treats a pending cash-out as null and leaves the running total unchanged', () => {
    const n1 = night('s1', '2026-09-01', [{ p: ann, buyin: 2000, cashout: 3000 }]);
    const n2 = night('s2', '2026-09-08', [{ p: ann, buyin: 2000, cashout: null }]);
    const n3 = night('s3', '2026-09-15', [{ p: ann, buyin: 2000, cashout: 2500 }]);
    const h = buildHistory([n1, n2, n3]);
    expect(h.nights[1].nets).toEqual({ p1: null });
    expect(h.players[0]).toEqual(
      expect.objectContaining({ nightsPlayed: 2, totalNetCents: 1500, cumulative: [1000, null, 1500] }),
    );
  });

  it('breaks total ties by name', () => {
    const n1 = night('s1', '2026-09-01', [
      { p: cat, buyin: 2000, cashout: 2000 },
      { p: ann, buyin: 2000, cashout: 2000 },
    ]);
    expect(buildHistory([n1]).players.map((p) => p.name)).toEqual(['Ann', 'Cat']);
  });
});
