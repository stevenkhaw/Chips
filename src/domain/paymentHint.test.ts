import { paymentHint } from './paymentHint';
import type { SessionSummaryMath, PlayerNetRow } from './nets';

const row = (playerId: string, adjustedNetCents: number | null): PlayerNetRow => ({
  playerId, name: playerId, colorSeed: 0, buyinCents: 0, cashoutCents: adjustedNetCents, netCents: adjustedNetCents,
  paidOutCents: 0, receivedCents: 0, adjustedNetCents,
});
const math = (rows: PlayerNetRow[], transfers: { from: string; to: string; amountCents: number }[] = []): SessionSummaryMath => ({
  rows, totalBuyinCents: 0, totalCashoutCents: 0, pendingCount: rows.filter((r) => r.netCents === null).length,
  paidCount: 0, settlement: { transfers, discrepancyCents: 0 },
});

describe('paymentHint', () => {
  const m = math([row('bob', -4000), row('ann', 6000), row('cat', -2000), row('dan', null)], [
    { from: 'bob', to: 'ann', amountCents: 4000 },
    { from: 'cat', to: 'ann', amountCents: 2000 },
  ]);

  it('reports what the payer owes and the payee is owed', () => {
    expect(paymentHint(m, 'bob', null)).toEqual({ fromOwesCents: 4000, toOwedCents: null, suggestedCents: null });
    expect(paymentHint(m, null, 'ann')).toEqual({ fromOwesCents: null, toOwedCents: 6000, suggestedCents: null });
  });

  it('suggests the planned transfer for the pair when one exists', () => {
    expect(paymentHint(m, 'bob', 'ann').suggestedCents).toBe(4000);
    expect(paymentHint(m, 'cat', 'ann').suggestedCents).toBe(2000);
  });

  it('falls back to the smaller of owes / owed when the pair is not in the plan', () => {
    expect(paymentHint(m, 'cat', 'bob')).toEqual({ fromOwesCents: 2000, toOwedCents: 0, suggestedCents: 0 });
    const m2 = math([row('bob', -4000), row('ann', 1000), row('cat', 3000)]);
    expect(paymentHint(m2, 'bob', 'ann').suggestedCents).toBe(1000);
  });

  it('is null for pending players and treats a payer who is owed as owing nothing', () => {
    expect(paymentHint(m, 'dan', 'ann')).toEqual({ fromOwesCents: null, toOwedCents: 6000, suggestedCents: null });
    expect(paymentHint(m, 'ann', 'bob')).toEqual({ fromOwesCents: 0, toOwedCents: 0, suggestedCents: 0 });
  });

  it('is null for unknown ids', () => {
    expect(paymentHint(m, 'zzz', 'ann')).toEqual({ fromOwesCents: null, toOwedCents: 6000, suggestedCents: null });
  });
});
