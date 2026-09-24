import { currentUserId, ensureSession } from './remote';

/**
 * A tiny fake client, not a real SupabaseClient. This file never imports `./client`, so it stays
 * within the rule that tests never touch the real client: only `currentUserId`/`ensureSession`'s
 * own logic against `client.auth.getSession()`/`signInAnonymously()` is under test here.
 */
function fakeClient(opts: { session?: { user: { id: string } } | null; error?: unknown; signInAnonymously?: jest.Mock }) {
  return {
    auth: {
      getSession: async () => ({ data: { session: opts.session ?? null }, error: opts.error ?? null }),
      signInAnonymously: opts.signInAnonymously ?? jest.fn(),
    },
  } as never;
}

const retryableError = () => Object.assign(new Error('Network request failed'), { name: 'AuthRetryableFetchError' });

describe('remote: currentUserId / ensureSession session handling', () => {
  it('currentUserId returns the session user id', async () => {
    const client = fakeClient({ session: { user: { id: 'user-1' } } });
    await expect(currentUserId(client)).resolves.toBe('user-1');
  });

  it('currentUserId rethrows a getSession error (a failed offline token refresh) instead of treating it as signed out', async () => {
    const error = retryableError();
    const client = fakeClient({ session: null, error });
    await expect(currentUserId(client)).rejects.toBe(error);
  });

  it('currentUserId throws signed_out for a null session with no error', async () => {
    const client = fakeClient({ session: null });
    await expect(currentUserId(client)).rejects.toMatchObject({ code: 'signed_out' });
  });

  it('ensureSession returns the session user id without signing in', async () => {
    const signIn = jest.fn();
    const client = fakeClient({ session: { user: { id: 'user-1' } }, signInAnonymously: signIn });
    await expect(ensureSession(client)).resolves.toBe('user-1');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('ensureSession rethrows a getSession error and never signs in, even with allowNewUser', async () => {
    const error = retryableError();
    const signIn = jest.fn();
    const client = fakeClient({ session: null, error, signInAnonymously: signIn });
    await expect(ensureSession(client, { allowNewUser: true })).rejects.toBe(error);
    expect(signIn).not.toHaveBeenCalled();
  });

  it('ensureSession throws signed_out for a null session with no error and allowNewUser unset', async () => {
    const signIn = jest.fn();
    const client = fakeClient({ session: null, signInAnonymously: signIn });
    await expect(ensureSession(client)).rejects.toMatchObject({ code: 'signed_out' });
    expect(signIn).not.toHaveBeenCalled();
  });

  it('ensureSession signs in a new anonymous user only when allowNewUser is set and there is no error', async () => {
    const signIn = jest.fn().mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
    const client = fakeClient({ session: null, signInAnonymously: signIn });
    await expect(ensureSession(client, { allowNewUser: true })).resolves.toBe('new-user');
    expect(signIn).toHaveBeenCalledTimes(1);
  });
});
