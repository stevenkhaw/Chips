import { Alert, AppState } from 'react-native';
import { getDb } from '@/db/connection';
import * as housesRepo from '@/repo/houses';
import * as syncRepo from '@/repo/sync';
import { describeSyncError } from '@/sync/errors';
import { joinByCode, type JoinOutcome } from '@/sync/join';
import { savePassword } from '@/sync/passwords';
import { pullHouse } from '@/sync/pull';
import { publishHouse } from '@/sync/publish';
import { pushHouse } from '@/sync/push';
import { getSyncClient, requireSyncClient } from '@/sync/registry';
import { ensureSession, listMembers, rpcLeaveHouse, rpcRemoveMember, rpcResetPassword, type Member } from '@/sync/remote';
import { reloadAll } from './houseActions';
import { useHousesStore } from './useHousesStore';
import { usePlayersStore } from './usePlayersStore';
import { useSessionsStore } from './useSessionsStore';
import { useSettingsStore } from './useSettingsStore';
import { useSyncStore } from './useSyncStore';

export const PUSH_DEBOUNCE_MS = 2000;

export function refreshPending(): void {
  const db = getDb();
  const { setPending } = useSyncStore.getState();
  for (const h of syncRepo.listSyncHouses(db)) if (h.role === 'owner') setPending(h.id, syncRepo.pendingCount(db, h.id));
}

const inflight = new Map<string, Promise<void>>();

/** Push (owner) or pull (reader) one published house. Concurrent calls for the same house share one run. */
export function syncHouse(houseId: string): Promise<void> {
  const running = inflight.get(houseId);
  if (running) return running;
  const p = runSync(houseId).finally(() => inflight.delete(houseId));
  inflight.set(houseId, p);
  return p;
}

/**
 * Refreshes local stores from what a reader pull just wrote, without touching the open session
 * detail. `reloadAll` resets `detail` to null, which leaves an open session screen stuck on
 * "Loading…" since screens only call `open(id)` when `id` changes; this refreshes every other
 * house-scoped store and, only if a detail is open, recomputes it in place instead.
 * `useSessionsStore.refreshDetail` already calls `loadSummaries` itself (it ends with it), so
 * when a detail is open this calls only `refreshDetail` — calling `loadSummaries` first too would
 * just recompute summaries twice. `refreshDetail` also sets `detail` to null itself if the session
 * no longer exists after the pull.
 */
function refreshCurrentHouseViews(): void {
  useHousesStore.getState().load();
  useSettingsStore.getState().load();
  usePlayersStore.getState().load();
  if (useSessionsStore.getState().detail) {
    useSessionsStore.getState().refreshDetail();
  } else {
    useSessionsStore.getState().loadSummaries();
  }
}

async function runSync(houseId: string): Promise<void> {
  const client = getSyncClient();
  if (!client) return;
  const db = getDb();
  const h = syncRepo.getSyncHouse(db, houseId);
  if (!h || !h.published) return;
  const sync = useSyncStore.getState();
  sync.setPhase(houseId, 'syncing');
  try {
    if (h.role === 'owner') {
      await pushHouse(db, client, houseId);
      syncRepo.setLastSynced(db, houseId);
    } else {
      const result = await pullHouse(db, client, houseId);
      if (result === 'removed') {
        syncRepo.purgeHouse(db, houseId);
        reloadAll();
        Alert.alert('Removed from house', `You no longer have access to "${h.name}".`);
      } else if (houseId === useHousesStore.getState().currentHouseId) {
        refreshCurrentHouseViews();
      }
    }
    useSyncStore.getState().setPhase(houseId, 'idle');
  } catch (e) {
    const d = describeSyncError(e);
    useSyncStore.getState().setPhase(houseId, d.kind, d.message);
  } finally {
    refreshPending();
    useHousesStore.getState().load(); // lastSyncedAt / closed
  }
}

/**
 * Pushes every owner house with pending rows. If a house is already syncing, waits for that run
 * and then re-checks: a write that lands mid-push is not silently dropped until the next trigger.
 * The offline skip applies only to that trailing re-check, right after the run it waited on just
 * failed for lack of network — not to every push, or a single offline failure would silence every
 * later debounced push (spec §3.1) until the app foregrounds or the house is switched.
 */
export async function pushDirtyHouses(): Promise<void> {
  const db = getDb();
  for (const h of syncRepo.listSyncHouses(db)) {
    if (h.role !== 'owner') continue;
    const running = inflight.get(h.id);
    if (running) {
      await running;
      // Don't immediately retry a push that just failed for lack of network.
      if (useSyncStore.getState().byHouse[h.id]?.phase === 'offline') continue;
    }
    if (syncRepo.pendingCount(db, h.id) > 0) await syncHouse(h.id);
  }
}

/** Every published house, current first. */
export async function syncAll(): Promise<void> {
  const current = useHousesStore.getState().currentHouseId;
  const houses = syncRepo.listSyncHouses(getDb()).sort((a, b) => Number(b.id === current) - Number(a.id === current));
  for (const h of houses) await syncHouse(h.id);
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Called after local writes: push 2 s after the last one (spec §3.1). */
export function schedulePush(): void {
  refreshPending();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushDirtyHouses();
  }, PUSH_DEBOUNCE_MS);
}

const houseSignature = (s: ReturnType<typeof useHousesStore.getState>) =>
  s.houses.map((h) => `${h.id}:${h.updatedAt}`).join('|');

/**
 * Wires sync into the app. Store changes that come from local writes schedule a push; switching house
 * or returning to the foreground syncs. This cannot loop against a failing push: `pushDirtyHouses` only
 * ever pushes, never pulls, so it triggers no store subscriber; and a successful owner push only sets
 * `last_synced_at`, which is not part of `houseSignature`, so it doesn't re-trigger `schedulePush` either.
 * Returns an unsubscribe function.
 */
export function startSync(): () => void {
  const unsubs = [
    useSessionsStore.subscribe((s, prev) => {
      if (s.summaries !== prev.summaries) schedulePush();
    }),
    usePlayersStore.subscribe((s, prev) => {
      if (s.players !== prev.players) schedulePush();
    }),
    useHousesStore.subscribe((s, prev) => {
      if (s.currentHouseId && s.currentHouseId !== prev.currentHouseId) void syncHouse(s.currentHouseId);
      if (houseSignature(s) !== houseSignature(prev)) schedulePush();
    }),
  ];
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') void syncAll();
  });
  refreshPending();
  void syncAll();
  return () => {
    unsubs.forEach((u) => u());
    app.remove();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

// UI actions ------------------------------------------------------------------------------------

export async function shareHouse(houseId: string, password: string): Promise<{ joinCode: string }> {
  const client = requireSyncClient();
  const { joinCode } = await publishHouse(getDb(), client, houseId, password);
  await savePassword(houseId, password);
  useHousesStore.getState().load();
  refreshPending();
  return { joinCode };
}

export async function joinHouse(code: string, password: string, displayName: string | null): Promise<JoinOutcome> {
  const db = getDb();
  const r = await joinByCode(db, requireSyncClient(), code, password, displayName?.trim() || null);
  if (r.ok) {
    housesRepo.setCurrentHouse(db, r.houseId);
    reloadAll();
  }
  return r;
}

export async function leaveHouse(houseId: string): Promise<void> {
  await rpcLeaveHouse(requireSyncClient(), houseId);
  await inflight.get(houseId)?.catch(() => {});
  syncRepo.purgeHouse(getDb(), houseId);
  reloadAll();
}

export async function removeClosedHouse(houseId: string): Promise<void> {
  await inflight.get(houseId)?.catch(() => {});
  syncRepo.purgeHouse(getDb(), houseId);
  reloadAll();
}

export async function resetHousePassword(houseId: string, password: string): Promise<void> {
  await rpcResetPassword(requireSyncClient(), houseId, password);
  await savePassword(houseId, password);
}

export async function loadMembers(houseId: string): Promise<{ me: string; members: Member[] }> {
  const client = requireSyncClient();
  const me = await ensureSession(client);
  return { me, members: await listMembers(client, houseId) };
}

/** The removed reader's old link stops working; they can still rejoin with the code and password until it is reset. */
export async function removeHouseMember(houseId: string, userId: string): Promise<void> {
  await rpcRemoveMember(requireSyncClient(), houseId, userId);
}
