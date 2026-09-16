import { computeRows, summarize } from './nets';
import type { SessionDetail, Player, SessionPlayer, Buyin, Payment } from './types';

const base = { createdAt: 0, updatedAt: 0, deletedAt: null };
const player = (id: string, name: string): Player => ({ ...base, id, name, colorSeed: 1, archived: false });
const sp = (id: string, playerId: string, cashoutCents: number | null, sortOrder: number): SessionPlayer => ({
  ...base, id, sessionId: 's1', playerId, cashoutCents, sortOrder,
});
const buyin = (id: string, sessionPlayerId: string, amountCents: number): Buyin => ({
  ...base, id, sessionPlayerId, amountCents, at: 0,
});
const payment = (id: string, fromPlayerId: string, toPlayerId: string, amountCents: number): Payment => ({
  ...base, id, sessionId: 's1', fromPlayerId, toPlayerId, amountCents, note: null, at: 0,
});

const detail: SessionDetail = {
  session: { ...base, id: 's1', date: '2026-09-16', title: null, defaultBuyinCents: 2000, notes: null },
  players: [
    { sp: sp('sp1', 'p1', 5000, 0), player: player('p1', 'Ann'), buyins: [buyin('b1', 'sp1', 2000)] },
    { sp: sp('sp2', 'p2', 1000, 1), player: player('p2', 'Bob'), buyins: [buyin('b2', 'sp2', 2000), buyin('b3', 'sp2', 2000)] },
    { sp: sp('sp3', 'p3', null, 2), player: player('p3', 'Cat'), buyins: [buyin('b4', 'sp3', 2000)] },
  ],
  payments: [],
};

describe('computeRows', () => {
  it('sums buy-ins and computes net; null cashout → null net', () => {
    const rows = computeRows(detail);
    expect(rows).toEqual([
      { playerId: 'p1', name: 'Ann', colorSeed: 1, buyinCents: 2000, cashoutCents: 5000, netCents: 3000, paidOutCents: 0, receivedCents: 0, adjustedNetCents: 3000 },
      { playerId: 'p2', name: 'Bob', colorSeed: 1, buyinCents: 4000, cashoutCents: 1000, netCents: -3000, paidOutCents: 0, receivedCents: 0, adjustedNetCents: -3000 },
      { playerId: 'p3', name: 'Cat', colorSeed: 1, buyinCents: 2000, cashoutCents: null, netCents: null, paidOutCents: 0, receivedCents: 0, adjustedNetCents: null },
    ]);
  });

  it('orders by sortOrder', () => {
    const swapped: SessionDetail = { ...detail, players: [detail.players[1], detail.players[0]] };
    expect(computeRows(swapped).map((r) => r.playerId)).toEqual(['p1', 'p2']);
  });

  it('(a) full payment reduces owed transfer to zero', () => {
    const d: SessionDetail = { ...detail, payments: [payment('pay1', 'p2', 'p1', 3000)] };
    const rows = computeRows(d);
    const bob = rows.find((r) => r.playerId === 'p2')!;
    const ann = rows.find((r) => r.playerId === 'p1')!;
    expect(bob.paidOutCents).toBe(3000);
    expect(bob.adjustedNetCents).toBe(0);
    expect(ann.receivedCents).toBe(3000);
    expect(ann.adjustedNetCents).toBe(0);
    expect(summarize(d).settlement.transfers).toEqual([]);
  });

  it('(b) partial payment leaves remainder', () => {
    const d: SessionDetail = { ...detail, payments: [payment('pay1', 'p2', 'p1', 1000)] };
    expect(summarize(d).settlement.transfers).toEqual([{ from: 'p2', to: 'p1', amountCents: 2000 }]);
  });

  it('(c) overpayment flips transfer direction', () => {
    const d: SessionDetail = { ...detail, payments: [payment('pay1', 'p2', 'p1', 4000)] };
    expect(summarize(d).settlement.transfers).toEqual([{ from: 'p1', to: 'p2', amountCents: 1000 }]);
  });

  it('(d) payment referencing unknown player id is ignored', () => {
    const d: SessionDetail = { ...detail, payments: [payment('pay1', 'zzz', 'p1', 1000)] };
    const rows = computeRows(d);
    const ann = rows.find((r) => r.playerId === 'p1')!;
    expect(ann.receivedCents).toBe(0);
    expect(ann.adjustedNetCents).toBe(ann.netCents);
  });
});

describe('summarize', () => {
  it('(e) totals include pending buy-ins, exclude pending from settlement', () => {
    const s = summarize(detail);
    expect(s.totalBuyinCents).toBe(8000);
    expect(s.totalCashoutCents).toBe(6000);
    expect(s.pendingCount).toBe(1);
    expect(s.settlement.transfers).toEqual([{ from: 'p2', to: 'p1', amountCents: 3000 }]);
    expect(s.settlement.discrepancyCents).toBe(0);
    expect(s.paidCount).toBe(0);
  });

  it('paidCount reflects all logged payments', () => {
    const d: SessionDetail = { ...detail, payments: [payment('pay1', 'p2', 'p1', 1000), payment('pay2', 'p1', 'p2', 500)] };
    expect(summarize(d).paidCount).toBe(2);
  });
});
