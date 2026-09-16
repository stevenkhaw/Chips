import type { ChipDenom } from './types';

export function chipsToCents(counts: Record<string, number>, denoms: ChipDenom[]): number {
  let total = 0;
  for (const d of denoms) {
    const c = counts[d.id] ?? 0;
    total += c * d.valueCents;
  }
  return total;
}
