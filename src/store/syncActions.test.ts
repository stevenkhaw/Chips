jest.mock('@/sync/push', () => ({ pushHouse: jest.fn() }));
jest.mock('@/sync/pull', () => ({ pullHouse: jest.fn() }));
jest.mock('@/sync/remote', () => ({
  ...jest.requireActual('@/sync/remote'),
  ensureSession: jest.fn(),
  rpcCreateHouse: jest.fn(),
  rpcLeaveHouse: jest.fn(),
}));

import { Alert } from 'react-native';
import { createTestDb } from '../../test/nodeDb';
import { setDb } from '@/db/connection';
import { createHouse, getCurrentHouseId, getHouse, setCurrentHouse } from '@/repo/houses';
import { createSession } from '@/repo/sessions';
import { markPublished, insertJoinedHouse, type ServerHouse } from '@/repo/sync';
import { setSyncClient } from '@/sync/registry';
import { pushHouse } from '@/sync/push';
import { pullHouse } from '@/sync/pull';
import { reloadAll } from './houseActions';
import { ensureSession, rpcCreateHouse, rpcLeaveHouse } from '@/sync/remote';
import { loadPassword } from '@/sync/passwords';
import { PUSH_DEBOUNCE_MS, leaveHouse, loadMembers, pushDirtyHouses, schedulePush, shareHouse, syncHouse, startSync } from './syncActions';
import { useSessionsStore } from './useSessionsStore';
import { useSyncStore } from './useSyncStore';
import { getDb } from '@/db/connection';

const push = pushHouse as jest.Mock;
const pull = pullHouse as jest.Mock;
const session = ensureSession as jest.Mock;
const createRpc = rpcCreateHouse as jest.Mock;
const leaveRpc = rpcLeaveHouse as jest.Mock;

describe('syncActions', () => {
  let houseId: string;

  beforeEach(() => {
    jest.useFakeTimers();
    const db = createTestDb();
    setDb(db);
    reloadAll();
    houseId = getCurrentHouseId(db);
    markPublished(db, houseId, 'ABCDEFGH'); // My House starts dirty, so it has pending rows
    setSyncClient({} as never);
    push.mockReset();
    pull.mockReset();
    session.mockReset();
    createRpc.mockReset();
    leaveRpc.mockReset();
    useSyncStore.setState({ byHouse: {}, pending: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
    setSyncClient(null);
  });

  it('debounces bursts of writes into one push', async () => {
    push.mockResolvedValue(1);
    schedulePush();
    schedulePush();
    schedulePush();
    expect(push).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    expect(push).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().byHouse[houseId]).toEqual({ phase: 'idle', message: null });
  });

  it('marks the house offline and keeps changes waiting when the network fails', async () => {
    push.mockRejectedValue(new TypeError('Network request failed'));
    await syncHouse(houseId);
    expect(useSyncStore.getState().byHouse[houseId]).toEqual({ phase: 'offline', message: "You're offline" });
    expect(useSyncStore.getState().pending[houseId]).toBeGreaterThan(0);
  });

  it('shares one in-flight sync per house', async () => {
    let release!: () => void;
    push.mockImplementation(() => new Promise<number>((r) => (release = () => r(1))));
    const a = syncHouse(houseId);
    const b = syncHouse(houseId);
    release();
    await Promise.all([a, b]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a client', async () => {
    setSyncClient(null);
    await syncHouse(houseId);
    expect(push).not.toHaveBeenCalled();
  });

  it('a reader pull does not drop an open session detail', async () => {
    const db = getDb();
    // Build a reader house distinct from the (owner) seeded one, with a session to open.
    const server: ServerHouse = {
      id: 'reader-house-1',
      name: 'Reader House',
      currency_symbol: '$',
      join_code: 'READERHH',
      created_at: 1,
      updated_at: 1,
      deleted_at: null,
    };
    insertJoinedHouse(db, server, 'reader');
    setCurrentHouse(db, server.id);
    reloadAll();
    const session = createSession(db, server.id, { date: '2026-01-01', title: 'Night 1', defaultBuyinCents: 2000, playerIds: [] });
    useSessionsStore.getState().open(session.id);
    expect(useSessionsStore.getState().detail?.session.id).toBe(session.id);

    pull.mockResolvedValue('ok');
    await syncHouse(server.id);

    expect(useSessionsStore.getState().detail?.session.id).toBe(session.id);
  });

  it('pushes again for a write that lands mid-push', async () => {
    let release!: () => void;
    push.mockResolvedValue(1);
    push.mockImplementationOnce(() => new Promise<number>((r) => (release = () => r(1))));

    schedulePush();
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(1);

    schedulePush(); // a write lands while the first push is still in flight
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(1); // the second run is waiting on the first; no new push yet

    release();
    await jest.advanceTimersByTimeAsync(0);
    expect(push).toHaveBeenCalledTimes(2);
    expect(useSyncStore.getState().byHouse[houseId]).toEqual({ phase: 'idle', message: null });
    expect(useSyncStore.getState().pending[houseId]).toBeGreaterThan(0); // pushHouse is mocked; rows never actually clear

    // Nothing calls pushDirtyHouses again without a new schedulePush.
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 5);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('pushes again for a new write after an earlier push failed offline', async () => {
    push.mockRejectedValueOnce(new TypeError('Network request failed'));
    push.mockResolvedValue(1);

    schedulePush();
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().byHouse[houseId].phase).toBe('offline');

    schedulePush(); // a new write; the offline skip must not silence this debounced push too
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(2);
    expect(useSyncStore.getState().byHouse[houseId]).toEqual({ phase: 'idle', message: null });
  });

  it('pushDirtyHouses waits for an in-flight push before re-checking pending rows', async () => {
    let release!: () => void;
    push.mockImplementationOnce(() => new Promise<number>((r) => (release = () => r(1))));
    push.mockResolvedValue(1);
    const first = syncHouse(houseId);
    const second = pushDirtyHouses();
    release();
    await Promise.all([first, second]);
    expect(push).toHaveBeenCalledTimes(2);
  });

  it('does not loop when a push keeps failing, even across one new write (no-loop property)', async () => {
    push.mockRejectedValue(new TypeError('Network request failed'));
    const stop = startSync();
    await jest.advanceTimersByTimeAsync(0); // let the initial `syncAll()` push settle to 'offline'
    expect(push).toHaveBeenCalledTimes(1);

    schedulePush(); // a write landing after the failure — must still get its own debounced push
    await jest.advanceTimersByTimeAsync(10 * PUSH_DEBOUNCE_MS);
    // Exactly 2: the initial `syncAll()` push, plus the one push `schedulePush()` above produces
    // once its debounce fires (this is the case fix round 2 restores — an offline failure must not
    // silence every later debounced push). That second push also fails and sets 'offline' again,
    // and nothing else in this test ever calls `schedulePush` or `syncHouse` again: `pushDirtyHouses`
    // only pushes, never pulls, so it never touches a store any subscriber watches, and a failed
    // push's `finally` only updates `useSyncStore`/`refreshPending()` plus `useHousesStore.load()`,
    // whose house signature and pending counts are unchanged (the mock never clears `dirty`). So
    // advancing eight more debounce periods with no further write produces no further push.
    expect(push).toHaveBeenCalledTimes(2);
    stop();
  });

  it('startSync cleanup clears a pending debounce timer', async () => {
    push.mockResolvedValue(1);
    const stop = startSync();
    await jest.advanceTimersByTimeAsync(0);
    push.mockClear();
    schedulePush();
    stop();
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2);
    expect(push).not.toHaveBeenCalled();
  });

  it('shareHouse keeps the password and the published state when the first push fails', async () => {
    const db = getDb();
    const house = createHouse(db, { name: 'Share Me', currencySymbol: '$' });
    session.mockResolvedValue('user-1');
    createRpc.mockResolvedValue({ join_code: 'K7QXM2PA', invite_secret: 's'.repeat(43) });
    push.mockRejectedValue(new TypeError('Network request failed'));

    await expect(shareHouse(house.id, 'hunter22')).resolves.toEqual({ joinCode: 'K7QXM2PA' });
    expect(await loadPassword(house.id)).toBe('hunter22');
    expect(getHouse(db, house.id)).toEqual(expect.objectContaining({ published: true, joinCode: 'K7QXM2PA' }));

    // The push runs in the background and its failure lands in the status line.
    await jest.advanceTimersByTimeAsync(0);
    expect(push).toHaveBeenCalled();
    expect(useSyncStore.getState().byHouse[house.id]).toEqual({ phase: 'offline', message: "You're offline" });
    expect(useSyncStore.getState().pending[house.id]).toBeGreaterThan(0);
  });

  it('loadMembers never signs in: no session means signed out', async () => {
    const signIn = jest.fn();
    setSyncClient({ auth: { getSession: async () => ({ data: { session: null } }), signInAnonymously: signIn } } as never);
    await expect(loadMembers(houseId)).rejects.toMatchObject({ code: 'signed_out' });
    expect(signIn).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
  });

  it('leaveHouse waits for an in-flight pull before leaving, and never shows "Removed from house"', async () => {
    const db = getDb();
    const server: ServerHouse = {
      id: 'reader-house-2', name: 'Leaving', currency_symbol: '$', join_code: 'LEAVEHHH', created_at: 1, updated_at: 1, deleted_at: null,
    };
    insertJoinedHouse(db, server, 'reader');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let finishPull!: (r: string) => void;
    pull.mockImplementation(() => new Promise<string>((r) => (finishPull = r)));
    leaveRpc.mockResolvedValue(undefined);

    const syncing = syncHouse(server.id);
    const leaving = leaveHouse(server.id);
    await jest.advanceTimersByTimeAsync(0);
    expect(leaveRpc).not.toHaveBeenCalled(); // still waiting on the pull

    finishPull('removed'); // the pull raced the leave on the server
    await Promise.all([syncing, leaving]);
    expect(leaveRpc).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
    expect(getHouse(db, server.id)).toBeNull();
    alert.mockRestore();
  });

  it('a pull that finds the reader removed still alerts when not leaving', async () => {
    const db = getDb();
    const server: ServerHouse = {
      id: 'reader-house-3', name: 'Kicked', currency_symbol: '$', join_code: 'KICKEDHH', created_at: 1, updated_at: 1, deleted_at: null,
    };
    insertJoinedHouse(db, server, 'reader');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    pull.mockResolvedValue('removed');
    await syncHouse(server.id);
    expect(alert).toHaveBeenCalledWith('Removed from house', expect.any(String));
    alert.mockRestore();
  });
});
