import { create } from 'zustand';

interface NewNightDraft {
  date: string;
  title: string;
  defaultBuyinCents: number;
  start(init: { date: string; defaultBuyinCents: number }): void;
  patch(p: Partial<Pick<NewNightDraft, 'date' | 'title' | 'defaultBuyinCents'>>): void;
}

/** UI-only draft for the two-step "new night" flow. Never reads or writes the database. */
export const useNewNightDraft = create<NewNightDraft>((set) => ({
  date: '',
  title: '',
  defaultBuyinCents: 2000,
  start: ({ date, defaultBuyinCents }) => set({ date, title: '', defaultBuyinCents }),
  patch: (p) => set(p),
}));
