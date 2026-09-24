export interface SyncErrorInfo {
  kind: 'offline' | 'error';
  message: string;
}

const RPC_MESSAGES: Record<string, string> = {
  weak_password: 'Password needs at least 4 characters',
  forbidden: 'Only the owner can do that',
  owner_cannot_leave: "Owners can't leave their own house",
  house_deleted: 'This house was deleted',
  not_authenticated: "Couldn't sign in. Try again.",
};

const OFFLINE = /network request failed|fetch failed|failed to fetch|network error|timed out/i;

/** Turns anything a sync call can throw into what the UI shows. */
export function describeSyncError(e: unknown): SyncErrorInfo {
  const err = (e ?? {}) as { code?: unknown; message?: unknown };
  const message = typeof err.message === 'string' ? err.message : typeof e === 'string' ? e : String(e);
  const code = typeof err.code === 'string' ? err.code : '';

  if (OFFLINE.test(message)) return { kind: 'offline', message: "You're offline" };
  if (code === 'P0001' && RPC_MESSAGES[message]) return { kind: 'error', message: RPC_MESSAGES[message] };
  if (code === '23514') return { kind: 'error', message: 'A name or symbol is too long' };
  if (code === '42501') {
    console.warn('Sync rejected by row-level security:', message); // spec §7: log as a bug
    return { kind: 'error', message: 'The server refused this change' };
  }
  return { kind: 'error', message };
}
