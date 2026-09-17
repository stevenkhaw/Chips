import type { SessionSummaryMath } from './nets';

export interface PaymentHint {
  /** What the payer still owes overall (0 when they are owed instead); null if unknown or pending. */
  fromOwesCents: number | null;
  /** What the payee is still owed overall (0 when they owe instead); null if unknown or pending. */
  toOwedCents: number | null;
  /** Amount that settles this pair: the planned transfer, else min(owes, owed); null if either side is unknown. */
  suggestedCents: number | null;
}

function adjusted(math: SessionSummaryMath, id: string | null): number | null {
  if (!id) return null;
  const r = math.rows.find((x) => x.playerId === id);
  return r ? r.adjustedNetCents : null;
}

export function paymentHint(math: SessionSummaryMath, fromId: string | null, toId: string | null): PaymentHint {
  const fromNet = adjusted(math, fromId);
  const toNet = adjusted(math, toId);
  const fromOwesCents = fromNet === null ? null : Math.max(0, -fromNet);
  const toOwedCents = toNet === null ? null : Math.max(0, toNet);

  let suggestedCents: number | null = null;
  if (fromOwesCents !== null && toOwedCents !== null) {
    const planned = math.settlement.transfers.find((t) => t.from === fromId && t.to === toId);
    suggestedCents = planned ? planned.amountCents : Math.min(fromOwesCents, toOwedCents);
  }
  return { fromOwesCents, toOwedCents, suggestedCents };
}
