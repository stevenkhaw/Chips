import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { ChipDenom, Settings } from '@/domain/types';
import * as repo from '@/repo/settings';

interface SettingsState {
  settings: Settings;
  denoms: ChipDenom[];
  load(): void;
  setDefaultBuyin(cents: number): void;
  addDenom(input: { label: string; colorHex: string; valueCents: number }): void;
  updateDenom(id: string, patch: Partial<Pick<ChipDenom, 'label' | 'colorHex' | 'valueCents'>>): void;
  removeDenom(id: string): void;
  reorderDenoms(ids: string[]): void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  const reload = () => set({ settings: repo.getSettings(getDb()), denoms: repo.listChipDenoms(getDb()) });
  return {
    settings: { defaultBuyinCents: 2000, currencySymbol: '$' },
    denoms: [],
    load: reload,
    setDefaultBuyin: (cents) => {
      repo.updateSettings(getDb(), { defaultBuyinCents: cents });
      reload();
    },
    addDenom: (input) => {
      repo.createChipDenom(getDb(), input);
      reload();
    },
    updateDenom: (id, patch) => {
      repo.updateChipDenom(getDb(), id, patch);
      reload();
    },
    removeDenom: (id) => {
      repo.deleteChipDenom(getDb(), id);
      reload();
    },
    reorderDenoms: (ids) => {
      repo.reorderChipDenoms(getDb(), ids);
      reload();
    },
  };
});
