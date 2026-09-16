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

/** Above this many non-zero players, skip the exact partition search (O(n·2^n)). */
const SUBSET_LIMIT = 12;

export function settle(nets: Net[]): SettlementResult {
  const discrepancyCents = nets.reduce((s, x) => s + x.netCents, 0);
  const active = nets.filter((x) => x.netCents !== 0);
  const transfers: Transfer[] = [];
  let remainder = active;

  if (active.length > 0 && active.length <= SUBSET_LIMIT) {
    const { blocks, rest } = partitionZeroSum(active);
    for (const block of blocks) transfers.push(...greedy(block));
    remainder = rest;
  }

  transfers.push(...greedy(remainder));
  return { transfers, discrepancyCents };
}

/**
 * Splits nets into the maximum number of disjoint zero-sum blocks (exact), plus a
 * remainder that does not sum to zero (empty when the books balance).
 * Transfers = players − blocks, so maximising blocks minimises transfers.
 * dp[mask] = max number of complete zero-sum blocks inside mask.
 * Ties: lowest player index wins at every step, so output is deterministic.
 */
function partitionZeroSum(nets: Net[]): { blocks: Net[][]; rest: Net[] } {
  const n = nets.length;
  const size = 1 << n;
  const full = size - 1;

  const sum = new Int32Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    sum[mask] = sum[mask ^ low] + nets[i].netCents;
  }

  const dp = new Int8Array(size);
  const choice = new Int8Array(size);
  for (let mask = 1; mask < size; mask++) {
    let best = -1;
    let bestI = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const v = dp[mask ^ (1 << i)];
      if (v > best) {
        best = v;
        bestI = i;
      }
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
    choice[mask] = bestI;
  }

  // Walk the chosen path from full down to 0. Every zero-sum mask on the path closes a
  // segment: the first segment (above the first zero-sum mask) is the remainder, later
  // ones are blocks.
  const blocks: Net[][] = [];
  let rest: number[] = [];
  let segment: number[] = [];
  let seenZero = false;
  let mask = full;
  while (mask !== 0) {
    if (sum[mask] === 0) {
      if (seenZero) blocks.push(toBlock(segment, nets));
      else rest = segment;
      seenZero = true;
      segment = [];
    }
    const i = choice[mask];
    segment.push(i);
    mask ^= 1 << i;
  }
  if (seenZero) blocks.push(toBlock(segment, nets));
  else rest = segment;

  blocks.sort((a, b) => nets.indexOf(a[0]) - nets.indexOf(b[0]));
  return { blocks, rest: toBlock(rest, nets) };
}

function toBlock(indices: number[], nets: Net[]): Net[] {
  return [...indices].sort((a, b) => a - b).map((i) => nets[i]);
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
