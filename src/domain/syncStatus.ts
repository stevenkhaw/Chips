import type { HouseRole } from './types';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatusInput {
  role: HouseRole;
  published: boolean;
  closed: boolean;
  phase: SyncPhase;
  pending: number;
  lastSyncedAt: number | null;
  now: number;
}

export interface SyncStatus {
  text: string;
  tone: 'dim' | 'warn' | 'error';
  /** Tapping retries the sync. */
  tappable: boolean;
}

function ago(from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const changes = (n: number) => `${n} change${n === 1 ? '' : 's'} waiting`;

/** The one-line status under the house name (spec §3.4). */
export function syncStatusLabel(i: SyncStatusInput): SyncStatus | null {
  if (!i.published) return null;
  if (i.closed) return { text: 'House closed by the owner', tone: 'warn', tappable: false };
  const when = i.lastSyncedAt === null ? null : ago(i.lastSyncedAt, i.now);

  if (i.role === 'owner') {
    switch (i.phase) {
      case 'syncing':
        return { text: 'Syncing…', tone: 'dim', tappable: false };
      case 'offline':
        return { text: i.pending > 0 ? `Offline · ${changes(i.pending)}` : 'Offline', tone: 'warn', tappable: true };
      case 'error':
        return { text: 'Sync failed · tap to retry', tone: 'error', tappable: true };
      default:
        if (i.pending > 0) return { text: changes(i.pending), tone: 'dim', tappable: true };
        return { text: when ? `Synced · ${when}` : 'Not synced yet', tone: 'dim', tappable: false };
    }
  }

  switch (i.phase) {
    case 'syncing':
      return { text: 'Updating…', tone: 'dim', tappable: false };
    case 'offline':
      return { text: when ? `Offline · updated ${when}` : 'Offline', tone: 'warn', tappable: true };
    case 'error':
      return { text: 'Update failed · tap to retry', tone: 'error', tappable: true };
    default:
      return { text: when ? `Updated ${when}` : 'Not updated yet', tone: 'dim', tappable: true };
  }
}
