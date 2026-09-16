import { computeRows, summarize } from './nets';
import type { SessionDetail, Player, SessionPlayer, Buyin } from './types';

const base = { createdAt: 0, updatedAt: 0, deletedAt: null };
const player = (id: string, name: string): Player => ({ ...base, id, name, colorSeed: 1, archived: false });
const sp = (id: string, playerId: string, cashoutCents: number | null, sortOrder: number): SessionPlayer => ({
  ...base, id, sessionId: 's1', playerId, cashoutCents, sortOrder,
});
const buyin = (id: string, sessionPlayerId: string, amountCents: number): Buyin => ({
  ...base, id, sessionPlayerId, amountCents, at: 0,
});

const detail: SessionDetail = {
  session: { ...base, id: 's1', date: '2026-09-16', title: null, defaultBuyinCents: 2000, notes: null },
  players: [
    { sp: sp('sp1', 'p1', 5000, 0), player: player('p1', 'Ann'), buyins: [buyin('b1', 'sp1', 2000)] },
    { sp: sp('sp2', 'p2', 1000, 1), player: player('p2', 'Bob'), buyins: [buyin('b2', 'sp2', 2000), buyin('b3', 'sp2', 2000)] },
    { sp: sp('sp3', 'p3', null, 2), player: player('p3', 'Cat'), buyins: [buyin('b4', 'sp3', 2000)] },
  ],
};

describe('computeRows', () => {
  it('sums buy-ins and computes net; null cashout → null net', () => {
    const rows = computeRows(detail);
    expect(rows).toEqual([
      { playerId: 'p1', name: 'Ann', colorSeed: 1, buyinCents: 2000, cashoutCents: 5000, netCents: 3000 },
      { playerId: 'p2', name: 'Bob', colorSeed: 1, buyinCents: 4000, cashoutCents: 1000, netCents: -3000 },
      { playerId: 'p3', name: 'Cat', colorSeed: 1, buyinCents: 2000, cashoutCents: null, netCents: null },
    ]);
  });

  it('orders by sortOrder', () => {
    const swapped: SessionDetail = { ...detail, players: [detail.players[1], detail.players[0]] };
    expect(computeRows(swapped).map((r) => r.playerId)).toEqual(['p1', 'p2']);
  });
});

describe('summarize', () => {
  it('totals include pending buy-ins, exclude pending from settlement', () => {
    const s = summarize(detail);
    expect(s.totalBuyinCents).toBe(8000);
    expect(s.totalCashoutCents).toBe(6000);
    expect(s.pendingCount).toBe(1);
    expect(s.settlement.transfers).toEqual([{ from: 'p2', to: 'p1', amountCents: 3000 }]);
    expect(s.settlement.discrepancyCents).toBe(0);
  });
});
