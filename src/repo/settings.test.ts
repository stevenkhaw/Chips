import { createTestDb } from '../../test/nodeDb';
import {
  getSettings, updateSettings, listChipDenoms, createChipDenom, updateChipDenom, deleteChipDenom, reorderChipDenoms,
} from './settings';

describe('settings', () => {
  it('reads seeded defaults', () => {
    expect(getSettings(createTestDb())).toEqual({ defaultBuyinCents: 2000, currencySymbol: '$' });
  });
  it('patches', () => {
    const db = createTestDb();
    expect(updateSettings(db, { defaultBuyinCents: 5000 })).toEqual({ defaultBuyinCents: 5000, currencySymbol: '$' });
    expect(getSettings(db).defaultBuyinCents).toBe(5000);
  });
});

describe('chip denoms', () => {
  it('starts empty, appends in order', () => {
    const db = createTestDb();
    expect(listChipDenoms(db)).toEqual([]);
    const w = createChipDenom(db, { label: 'White', colorHex: '#ffffff', valueCents: 25 });
    const r = createChipDenom(db, { label: 'Red', colorHex: '#ff0000', valueCents: 100 });
    expect(listChipDenoms(db).map((d) => d.id)).toEqual([w.id, r.id]);
    expect(listChipDenoms(db).map((d) => d.sortOrder)).toEqual([0, 1]);
  });

  it('validates', () => {
    const db = createTestDb();
    expect(() => createChipDenom(db, { label: ' ', colorHex: '#fff', valueCents: 25 })).toThrow('Label required');
    expect(() => createChipDenom(db, { label: 'X', colorHex: '#fff', valueCents: 0 })).toThrow('Value must be positive');
    expect(() => createChipDenom(db, { label: 'X', colorHex: '#fff', valueCents: 12.5 })).toThrow('Value must be positive');
  });

  it('updates and soft deletes', () => {
    const db = createTestDb();
    const w = createChipDenom(db, { label: 'White', colorHex: '#fff', valueCents: 25 });
    updateChipDenom(db, w.id, { valueCents: 50, label: 'Whitey' });
    expect(listChipDenoms(db)[0]).toEqual(expect.objectContaining({ valueCents: 50, label: 'Whitey' }));
    deleteChipDenom(db, w.id);
    expect(listChipDenoms(db)).toEqual([]);
  });

  it('reorders', () => {
    const db = createTestDb();
    const a = createChipDenom(db, { label: 'A', colorHex: '#fff', valueCents: 1 });
    const b = createChipDenom(db, { label: 'B', colorHex: '#fff', valueCents: 2 });
    reorderChipDenoms(db, [b.id, a.id]);
    expect(listChipDenoms(db).map((d) => d.label)).toEqual(['B', 'A']);
  });
});
