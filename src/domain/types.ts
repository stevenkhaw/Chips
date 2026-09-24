export interface BaseRow {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Player extends BaseRow {
  name: string;
  colorSeed: number;
  archived: boolean;
}

export interface Session extends BaseRow {
  date: string; // YYYY-MM-DD local
  title: string | null;
  defaultBuyinCents: number;
  notes: string | null;
}

export interface SessionPlayer extends BaseRow {
  sessionId: string;
  playerId: string;
  cashoutCents: number | null;
  sortOrder: number;
}

export interface Buyin extends BaseRow {
  sessionPlayerId: string;
  amountCents: number;
  at: number;
}

export interface ChipDenom extends BaseRow {
  label: string;
  colorHex: string;
  valueCents: number;
  sortOrder: number;
}

export interface Settings {
  defaultBuyinCents: number;
  currencySymbol: string;
}

export interface SessionPlayerDetail {
  sp: SessionPlayer;
  player: Player;
  buyins: Buyin[];
}

export interface Payment extends BaseRow {
  sessionId: string;
  fromPlayerId: string;
  toPlayerId: string;
  amountCents: number;
  note: string | null;
  at: number;
}

export interface SessionDetail {
  session: Session;
  players: SessionPlayerDetail[];
  payments: Payment[];
}

export interface SessionSummary {
  session: Session;
  playerCount: number;
  totalBuyinCents: number;
  topWinner: { name: string; netCents: number } | null;
}

export type HouseRole = 'owner' | 'reader';

export interface House extends BaseRow {
  name: string;
  role: HouseRole;
  joinCode: string | null;
  currencySymbol: string;
  published: boolean;
}
