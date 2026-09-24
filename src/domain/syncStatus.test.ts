import { syncStatusLabel, type SyncStatusInput } from './syncStatus';

const base: SyncStatusInput = {
  role: 'owner', published: true, closed: false, phase: 'idle', pending: 0, lastSyncedAt: 1_000_000, now: 1_000_000 + 2 * 60_000,
};

describe('syncStatusLabel', () => {
  it('shows nothing for unpublished houses', () => {
    expect(syncStatusLabel({ ...base, published: false })).toBeNull();
  });

  it('owner states', () => {
    expect(syncStatusLabel(base)).toEqual({ text: 'Synced · 2m ago', tone: 'dim', tappable: false });
    expect(syncStatusLabel({ ...base, phase: 'syncing' })?.text).toBe('Syncing…');
    expect(syncStatusLabel({ ...base, phase: 'offline', pending: 3 })).toEqual({ text: 'Offline · 3 changes waiting', tone: 'warn', tappable: true });
    expect(syncStatusLabel({ ...base, phase: 'offline', pending: 1 })?.text).toBe('Offline · 1 change waiting');
    expect(syncStatusLabel({ ...base, phase: 'error' })).toEqual({ text: 'Sync failed · tap to retry', tone: 'error', tappable: true });
    expect(syncStatusLabel({ ...base, pending: 2 })).toEqual({ text: '2 changes waiting', tone: 'dim', tappable: true });
    expect(syncStatusLabel({ ...base, lastSyncedAt: null })?.text).toBe('Not synced yet');
  });

  it('reader states', () => {
    const r = { ...base, role: 'reader' as const };
    expect(syncStatusLabel(r)).toEqual({ text: 'Updated 2m ago', tone: 'dim', tappable: true });
    expect(syncStatusLabel({ ...r, phase: 'syncing' })?.text).toBe('Updating…');
    expect(syncStatusLabel({ ...r, phase: 'offline' })?.text).toBe('Offline · updated 2m ago');
    expect(syncStatusLabel({ ...r, phase: 'error' })?.text).toBe('Update failed · tap to retry');
    expect(syncStatusLabel({ ...r, closed: true })).toEqual({ text: 'House closed by the owner', tone: 'warn', tappable: false });
  });

  it('formats age', () => {
    const at = (ms: number) => syncStatusLabel({ ...base, now: base.lastSyncedAt! + ms })?.text;
    expect(at(10_000)).toBe('Synced · just now');
    expect(at(3 * 3_600_000)).toBe('Synced · 3h ago');
    expect(at(2 * 86_400_000)).toBe('Synced · 2d ago');
  });
});
