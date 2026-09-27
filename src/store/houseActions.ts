import { getDb } from '@/db/connection';
import type { House } from '@/domain/types';
import * as repo from '@/repo/houses';
import { useHousesStore } from './useHousesStore';
import { useSettingsStore } from './useSettingsStore';
import { usePlayersStore } from './usePlayersStore';
import { useSessionsStore } from './useSessionsStore';

/** Reload every house-scoped store. Call after anything that changes which house is current or its currency. */
export function reloadAll(): void {
  repo.ensureCurrentHouse(getDb());
  useHousesStore.getState().load();
  useSettingsStore.getState().load();
  usePlayersStore.getState().load();
  useSessionsStore.setState({ detail: null });
  useSessionsStore.getState().loadSummaries();
}

export function switchHouse(id: string): void {
  repo.setCurrentHouse(getDb(), id);
  reloadAll();
}

export function createHouse(input: { name: string; currencySymbol: string }): House {
  const db = getDb();
  const house = repo.createHouse(db, input);
  repo.setCurrentHouse(db, house.id);
  reloadAll();
  return house;
}

export function renameHouse(id: string, name: string): void {
  repo.renameHouse(getDb(), id, name);
  useHousesStore.getState().load();
}

export function setHouseCurrency(id: string, symbol: string): void {
  repo.setHouseCurrency(getDb(), id, symbol);
  reloadAll();
}

let onHouseDeleted: ((houseId: string) => void) | null = null;

/** Lets the app clear a deleted house's saved password and invite secret (stores never import src/sync). */
export function setOnHouseDeleted(fn: ((houseId: string) => void) | null): void {
  onHouseDeleted = fn;
}

export function deleteHouse(id: string): void {
  repo.deleteHouse(getDb(), id);
  onHouseDeleted?.(id);
  reloadAll();
}
