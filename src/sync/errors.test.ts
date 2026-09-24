import { describeSyncError } from './errors';

describe('describeSyncError', () => {
  it('treats fetch failures as offline', () => {
    expect(describeSyncError(new TypeError('Network request failed'))).toEqual({ kind: 'offline', message: "You're offline" });
    expect(describeSyncError(new TypeError('fetch failed'))).toEqual({ kind: 'offline', message: "You're offline" });
    expect(describeSyncError({ message: 'TypeError: Failed to fetch' })).toEqual({ kind: 'offline', message: "You're offline" });
  });

  it('treats AbortError and AuthRetryableFetchError as offline', () => {
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(describeSyncError(abort)).toEqual({ kind: 'offline', message: "You're offline" });

    expect(describeSyncError({ name: 'AuthRetryableFetchError', message: 'fetch failed after retries' })).toEqual({
      kind: 'offline',
      message: "You're offline",
    });
  });

  it('maps RPC messages and Postgres codes', () => {
    expect(describeSyncError({ code: 'P0001', message: 'weak_password' }).message).toBe('Password needs at least 4 characters');
    expect(describeSyncError({ code: 'P0001', message: 'forbidden' }).message).toBe('Only the owner can do that');
    expect(describeSyncError({ code: 'P0001', message: 'owner_cannot_leave' }).message).toBe("Owners can't leave their own house");
    expect(describeSyncError({ code: 'P0001', message: 'house_deleted' }).message).toBe('This house was deleted');
    expect(describeSyncError({ code: 'P0001', message: 'not_authenticated' }).message).toBe("Couldn't sign in. Try again.");
    expect(describeSyncError({ code: '23514', message: 'violates check constraint' }).message).toBe('A name or symbol is too long');
    expect(describeSyncError({ code: '42501', message: 'row-level security' }).message).toBe('The server refused this change');
  });

  it('falls back to the message', () => {
    expect(describeSyncError(new Error('boom'))).toEqual({ kind: 'error', message: 'boom' });
    expect(describeSyncError('weird')).toEqual({ kind: 'error', message: 'weird' });
  });
});
