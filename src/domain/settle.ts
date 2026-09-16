export interface Net {
  playerId: string;
  netCents: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountCents: number;
}

export interface SettlementResult {
  transfers: Transfer[];
  discrepancyCents: number;
}

/** Above this many non-zero players, skip the exact subset search. 2^12 = 4096 masks. */
const SUBSET_LIMIT = 12;

export function settle(nets: Net[]): SettlementResult {
  const discrepancyCents = nets.reduce((s, x) => s + x.netCents, 0);
  let remaining = nets.filter((x) => x.netCents !== 0);
  const transfers: Transfer[] = [];

  if (remaining.length <= SUBSET_LIMIT) {
    for (;;) {
      const subset = findSmallestZeroSubset(remaining);
      if (!subset) break;
      transfers.push(...greedy(subset));
      const used = new Set(subset.map((x) => x.playerId));
      remaining = remaining.filter((x) => !used.has(x.playerId));
    }
  }

  transfers.push(...greedy(remaining));
  return { transfers, discrepancyCents };
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** Smallest subset (size ≥ 2) of nets summing to exactly zero, or null. Ties → lowest mask (earliest players). */
function findSmallestZeroSubset(nets: Net[]): Net[] | null {
  const n = nets.length;
  if (n < 2) return null;
  let best = -1;
  let bestSize = Infinity;
  const limit = 1 << n;
  for (let mask = 1; mask < limit; mask++) {
    const size = popcount(mask);
    if (size < 2 || size >= bestSize) continue;
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += nets[i].netCents;
    if (sum === 0) {
      best = mask;
      bestSize = size;
      if (size === 2) break;
    }
  }
  if (best < 0) return null;
  return nets.filter((_, i) => best & (1 << i));
}

/** Largest debtor pays largest creditor, repeat. ≤ m−1 transfers. Stable sort keeps input-order ties. */
function greedy(nets: Net[]): Transfer[] {
  const debtors = nets
    .filter((x) => x.netCents < 0)
    .map((x) => ({ id: x.playerId, amt: -x.netCents }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = nets
    .filter((x) => x.netCents > 0)
    .map((x) => ({ id: x.playerId, amt: x.netCents }))
    .sort((a, b) => b.amt - a.amt);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amt, creditors[j].amt);
    out.push({ from: debtors[i].id, to: creditors[j].id, amountCents: amt });
    debtors[i].amt -= amt;
    creditors[j].amt -= amt;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return out;
}
