jest.mock('@/sync/push', () => ({ pushHouse: jest.fn() }));
jest.mock('@/sync/pull', () => ({ pullHouse: jest.fn() }));

import { createTestDb } from '../../test/nodeDb';
import { setDb } from '@/db/connection';
import { getCurrentHouseId } from '@/repo/houses';
import { markPublished } from '@/repo/sync';
import { setSyncClient } from '@/sync/registry';
import { pushHouse } from '@/sync/push';
import { reloadAll } from './houseActions';
import { PUSH_DEBOUNCE_MS, schedulePush, syncHouse } from './syncActions';
import { useSyncStore } from './useSyncStore';

const push = pushHouse as jest.Mock;

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
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
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
});
