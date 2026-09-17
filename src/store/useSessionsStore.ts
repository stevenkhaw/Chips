import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { Session, SessionDetail, SessionSummary } from '@/domain/types';
import * as repo from '@/repo/sessions';
import { buildHistory } from '@/domain/history';
import { playerColors } from '@/domain/playerColor';
import type { CreateSessionInput } from '@/repo/sessions';

interface SessionsState {
  summaries: SessionSummary[];
  /** playerId → all-time colour (white even, green up, red down); refreshed with `summaries`. */
  playerColors: Record<string, string>;
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
  addPayment(input: { fromPlayerId: string; toPlayerId: string; amountCents: number; note?: string | null }): void;
  removePayment(paymentId: string): void;
  lastPlayerIds(): string[];
  /** Every session with full detail, oldest first. Read-only; recompute when `summaries` changes. */
  listDetails(): SessionDetail[];
}

export const useSessionsStore = create<SessionsState>((set, get) => {
  const loadSummaries = () => {
    const db = getDb();
    set({ summaries: repo.listSessionSummaries(db), playerColors: playerColors(buildHistory(repo.listSessionDetails(db))) });
  };
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
    playerColors: {},
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
    addPayment: (input) => {
      repo.addPayment(getDb(), requireId(), input);
      refreshDetail();
    },
    removePayment: (id) => {
      repo.removePayment(getDb(), id);
      refreshDetail();
    },
    listDetails: () => repo.listSessionDetails(getDb()),
    lastPlayerIds: () => repo.lastSessionPlayerIds(getDb()),
  };
});
