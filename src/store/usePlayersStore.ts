import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { Player } from '@/domain/types';
import * as repo from '@/repo/players';

interface PlayersState {
  players: Player[];
  load(): void;
  add(name: string): Player;
  rename(id: string, name: string): void;
  setArchived(id: string, archived: boolean): void;
  remove(id: string): void;
}

export const usePlayersStore = create<PlayersState>((set) => {
  const reload = () => set({ players: repo.listPlayers(getDb(), { includeArchived: true }) });
  return {
    players: [],
    load: reload,
    add: (name) => {
      const p = repo.createPlayer(getDb(), name);
      reload();
      return p;
    },
    rename: (id, name) => {
      repo.renamePlayer(getDb(), id, name);
      reload();
    },
    setArchived: (id, archived) => {
      repo.setPlayerArchived(getDb(), id, archived);
      reload();
    },
    remove: (id) => {
      repo.deletePlayer(getDb(), id);
      reload();
    },
  };
});
