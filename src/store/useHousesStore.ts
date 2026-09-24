import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { House } from '@/domain/types';
import * as repo from '@/repo/houses';

export interface HousesState {
  houses: House[];
  currentHouseId: string | null;
  /** Dev aid: show the current house the way a reader sees it. Never persisted. */
  previewAsReader: boolean;
  load(): void;
  setPreviewAsReader(on: boolean): void;
}

export const useHousesStore = create<HousesState>((set) => ({
  houses: [],
  currentHouseId: null,
  previewAsReader: false,
  load: () => {
    const db = getDb();
    set({ houses: repo.listHouses(db), currentHouseId: repo.getCurrentHouseId(db) });
  },
  setPreviewAsReader: (on) => set({ previewAsReader: on }),
}));

export function selectCurrentHouse(s: HousesState): House | null {
  return s.houses.find((h) => h.id === s.currentHouseId) ?? null;
}

/** UX gate only. Once houses sync, the server enforces who may write. */
export function selectCanEdit(s: HousesState): boolean {
  return selectCurrentHouse(s)?.role === 'owner' && !s.previewAsReader;
}

export const useCurrentHouse = () => useHousesStore(selectCurrentHouse);
export const useCanEdit = () => useHousesStore(selectCanEdit);
