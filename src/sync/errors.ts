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

const OFFLINE_NAMES = new Set(['AbortError', 'AuthRetryableFetchError']);

/**
 * A paused or down project (spec §7). PostgREST turns a non-JSON body into `{ message: body }`,
 * so a gateway error page arrives as HTML; auth-js surfaces one as a JSON parse error.
 */
const NOT_JSON = /^\s*<(!doctype|html|head|body)|<\/html>|is not valid JSON|JSON Parse error|Unexpected token '?</i;

/** HTTP status from remote.ts or auth-js, or a 3-digit HTTP code. Postgres codes (5 characters) never match. */
function httpStatus(err: { status?: unknown; code?: unknown }): number | null {
  if (typeof err.status === 'number') return err.status;
  if (typeof err.code === 'string' && /^\d{3}$/.test(err.code)) return Number(err.code);
  if (typeof err.code === 'number') return err.code;
  return null;
}

/** Turns anything a sync call can throw into what the UI shows. */
export function describeSyncError(e: unknown): SyncErrorInfo {
  const err = (e ?? {}) as { code?: unknown; message?: unknown; name?: unknown; status?: unknown };
  const message = typeof err.message === 'string' ? err.message : typeof e === 'string' ? e : String(e);
  const code = typeof err.code === 'string' ? err.code : '';
  const name = typeof err.name === 'string' ? err.name : '';

  if (code === 'signed_out' || message === 'signed_out') return { kind: 'error', message: 'Signed out of sharing' };
  const status = httpStatus(err);
  if (OFFLINE.test(message) || OFFLINE_NAMES.has(name) || NOT_JSON.test(message) || (status !== null && status >= 500)) return { kind: 'offline', message: "You're offline" };
  if (code === 'P0001' && RPC_MESSAGES[message]) return { kind: 'error', message: RPC_MESSAGES[message] };
  if (code === '23514') return { kind: 'error', message: 'A name or symbol is too long' };
  if (code === '42501') {
    console.warn('Sync rejected by row-level security:', message); // spec §7: log as a bug
    return { kind: 'error', message: 'The server refused this change' };
  }
  return { kind: 'error', message };
}
