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

  it('maps signed_out by code or message', () => {
    const e = Object.assign(new Error('signed_out'), { code: 'signed_out' });
    expect(describeSyncError(e)).toEqual({ kind: 'error', message: 'Signed out of sharing' });
    expect(describeSyncError(new Error('signed_out'))).toEqual({ kind: 'error', message: 'Signed out of sharing' });
    expect(describeSyncError({ code: 'signed_out', message: 'whatever' })).toEqual({ kind: 'error', message: 'Signed out of sharing' });
  });

  it('treats a paused or down project (5xx, 540, HTML or non-JSON bodies) as offline (spec §7)', () => {
    const offline = { kind: 'offline', message: "You're offline" };
    // PostgREST behind a gateway: non-JSON body becomes { message: body }; remote.ts attaches the HTTP status.
    expect(describeSyncError({ message: '<html><head><title>502 Bad Gateway</title></head></html>', code: '', status: 502 })).toEqual(offline);
    expect(describeSyncError({ message: '<!DOCTYPE html><html><body>Service unavailable</body></html>', code: '' })).toEqual(offline);
    // A paused Supabase project answers 540.
    expect(describeSyncError({ message: 'Project paused', status: 540 })).toEqual(offline);
    expect(describeSyncError({ message: 'upstream error', status: 503 })).toEqual(offline);
    expect(describeSyncError({ message: 'upstream error', code: '500' })).toEqual(offline);
    // auth-js: a non-JSON body on a non-5xx status surfaces as AuthUnknownError with the parse error.
    expect(describeSyncError({ name: 'AuthUnknownError', message: 'Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON' })).toEqual(offline);
    expect(describeSyncError({ name: 'AuthUnknownError', message: 'JSON Parse error: Unexpected character: <' })).toEqual(offline);
  });

  it('does not mistake Postgres codes or 4xx errors for offline', () => {
    expect(describeSyncError({ code: '23514', message: 'violates check constraint', status: 400 }).kind).toBe('error');
    expect(describeSyncError({ code: 'P0001', message: 'forbidden', status: 400 })).toEqual({ kind: 'error', message: 'Only the owner can do that' });
    expect(describeSyncError({ message: 'bad request', status: 404 }).kind).toBe('error');
  });
});
