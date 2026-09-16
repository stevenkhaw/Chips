import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { Session, SessionDetail, SessionSummary } from '@/domain/types';
import * as repo from '@/repo/sessions';
import type { CreateSessionInput } from '@/repo/sessions';

interface SessionsState {
  summaries: SessionSummary[];
  detail: SessionDetail | null;
  loadSummaries(): void;
  create(input: CreateSessionInput): Session;
  open(id: string): void;
  refreshDetail(): void;
  updateSession(patch: Partial<Pick<Session, 'date' | 'title' | 'defaultBuyinCents' | 'notes'>>): void;
  deleteSession(id: string): void;
  addPlayer(playerId: string): void;
  removePlayer(sessionPlayerId: string): void;
  setCashout(sessionPlayerId: string, cents: number | null): void;
  addBuyin(sessionPlayerId: string, cents: number): void;
  updateBuyin(buyinId: string, cents: number): void;
  removeBuyin(buyinId: string): void;
  lastPlayerIds(): string[];
}

export const useSessionsStore = create<SessionsState>((set, get) => {
  const loadSummaries = () => set({ summaries: repo.listSessionSummaries(getDb()) });
  const refreshDetail = () => {
    const id = get().detail?.session.id;
    set({ detail: id ? repo.getSessionDetail(getDb(), id) : null });
    loadSummaries();
  };
  const requireId = () => {
    const id = get().detail?.session.id;
    if (!id) throw new Error('No session open');
    return id;
  };
  return {
    summaries: [],
    detail: null,
    loadSummaries,
    create: (input) => {
      const s = repo.createSession(getDb(), input);
      loadSummaries();
      return s;
    },
    open: (id) => {
      set({ detail: repo.getSessionDetail(getDb(), id) });
    },
    refreshDetail,
    updateSession: (patch) => {
      repo.updateSession(getDb(), requireId(), patch);
      refreshDetail();
    },
    deleteSession: (id) => {
      repo.deleteSession(getDb(), id);
      if (get().detail?.session.id === id) set({ detail: null });
      loadSummaries();
    },
    addPlayer: (playerId) => {
      repo.addPlayerToSession(getDb(), requireId(), playerId);
      refreshDetail();
    },
    removePlayer: (spId) => {
      repo.removePlayerFromSession(getDb(), spId);
      refreshDetail();
    },
    setCashout: (spId, cents) => {
      repo.setCashout(getDb(), spId, cents);
      refreshDetail();
    },
    addBuyin: (spId, cents) => {
      repo.addBuyin(getDb(), spId, cents);
      refreshDetail();
    },
    updateBuyin: (id, cents) => {
      repo.updateBuyin(getDb(), id, cents);
      refreshDetail();
    },
    removeBuyin: (id) => {
      repo.removeBuyin(getDb(), id);
      refreshDetail();
    },
    lastPlayerIds: () => repo.lastSessionPlayerIds(getDb()),
  };
});
