import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { Player } from '@/domain/types';
import * as repo from '@/repo/players';
import { getCurrentHouseId } from '@/repo/houses';

interface PlayersState {
  players: Player[];
  load(): void;
  add(name: string): Player;
  rename(id: string, name: string): void;
  setArchived(id: string, archived: boolean): void;
  remove(id: string): void;
}

export const usePlayersStore = create<PlayersState>((set) => {
  const reload = () => {
    const db = getDb();
    const houseId = getCurrentHouseId(db);
    set({ players: repo.listPlayers(db, houseId, { includeArchived: true }) });
  };
  return {
    players: [],
    load: reload,
    add: (name) => {
      const db = getDb();
      const houseId = getCurrentHouseId(db);
      const p = repo.createPlayer(db, houseId, name);
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
