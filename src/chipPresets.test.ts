import { STANDARD_CHIP_PRESETS } from './chipPresets';

describe('STANDARD_CHIP_PRESETS', () => {
  it('has exactly 5 entries', () => {
    expect(STANDARD_CHIP_PRESETS).toHaveLength(5);
  });

  it('is in strictly ascending value order', () => {
    const values = STANDARD_CHIP_PRESETS.map((p) => p.valueCents);
    const sorted = [...values].sort((a, b) => a - b);
    expect(values).toEqual(sorted);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has unique colours', () => {
    const colorHexes = STANDARD_CHIP_PRESETS.map((p) => p.colorHex);
    expect(new Set(colorHexes).size).toBe(colorHexes.length);
  });

  it('has unique, non-empty labels', () => {
    const labels = STANDARD_CHIP_PRESETS.map((p) => p.label.trim());
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
