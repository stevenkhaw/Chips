import { create } from 'zustand';
import type { SyncPhase } from '@/domain/syncStatus';

export interface HouseSync {
  phase: SyncPhase;
  message: string | null;
}

interface SyncState {
  byHouse: Record<string, HouseSync>;
  /** Dirty rows waiting to push, per house (owner houses only). */
  pending: Record<string, number>;
  setPhase(houseId: string, phase: SyncPhase, message?: string | null): void;
  setPending(houseId: string, n: number): void;
}

export const useSyncStore = create<SyncState>((set) => ({
  byHouse: {},
  pending: {},
  setPhase: (houseId, phase, message = null) => set((s) => ({ byHouse: { ...s.byHouse, [houseId]: { phase, message } } })),
  setPending: (houseId, n) => set((s) => (s.pending[houseId] === n ? s : { pending: { ...s.pending, [houseId]: n } })),
}));
