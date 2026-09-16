import { chipsToCents } from './chips';
import type { ChipDenom } from './types';

const base = { createdAt: 0, updatedAt: 0, deletedAt: null };
const denoms: ChipDenom[] = [
  { ...base, id: 'w', label: 'White', colorHex: '#fff', valueCents: 25, sortOrder: 0 },
  { ...base, id: 'r', label: 'Red', colorHex: '#f00', valueCents: 100, sortOrder: 1 },
  { ...base, id: 'g', label: 'Green', colorHex: '#0f0', valueCents: 500, sortOrder: 2 },
];

describe('chipsToCents', () => {
  it('sums count × value', () => {
    expect(chipsToCents({ w: 4, r: 3, g: 1 }, denoms)).toBe(100 + 300 + 500);
  });
  it('ignores unknown ids and missing counts', () => {
    expect(chipsToCents({ zzz: 10, r: 2 }, denoms)).toBe(200);
  });
  it('empty → 0', () => {
    expect(chipsToCents({}, denoms)).toBe(0);
  });
});
