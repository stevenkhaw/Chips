import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import { computeRows } from '@/domain/nets';
import type { Buyin, Payment, Player, Session, SessionDetail, SessionPlayer, SessionSummary } from '@/domain/types';

const S_COLS = 'id, created_at, updated_at, deleted_at, date, title, default_buyin_cents, notes';
const SP_COLS = 'id, created_at, updated_at, deleted_at, session_id, player_id, cashout_cents, sort_order';
const B_COLS = 'id, created_at, updated_at, deleted_at, session_player_id, amount_cents, at';
const P_COLS = 'id, created_at, updated_at, deleted_at, name, color_seed, archived';
const PAY_COLS = 'id, created_at, updated_at, deleted_at, session_id, from_player_id, to_player_id, amount_cents, note, at';

export interface CreateSessionInput {
  date: string;
  title: string | null;
  defaultBuyinCents: number;
  playerIds: string[];
}

function getSession(db: Db, id: string): Session | null {
  const row = db.first<Record<string, unknown>>(`SELECT ${S_COLS} FROM sessions WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? mapRow<Session>(row) : null;
}

export function createSession(db: Db, input: CreateSessionInput): Session {
  const id = newId();
  const t = now();
  db.transaction(() => {
    db.run(
      'INSERT INTO sessions (id, created_at, updated_at, deleted_at, date, title, default_buyin_cents, notes) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL)',
      [id, t, t, input.date, input.title, input.defaultBuyinCents],
    );
    input.playerIds.forEach((pid, i) => insertSessionPlayer(db, id, pid, i, t));
  });
  return { id, createdAt: t, updatedAt: t, deletedAt: null, date: input.date, title: input.title, defaultBuyinCents: input.defaultBuyinCents, notes: null };
}

function insertSessionPlayer(db: Db, sessionId: string, playerId: string, sortOrder: number, t: number): SessionPlayer {
  const id = newId();
  db.run(
    'INSERT INTO session_players (id, created_at, updated_at, deleted_at, session_id, player_id, cashout_cents, sort_order) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)',
    [id, t, t, sessionId, playerId, sortOrder],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, sessionId, playerId, cashoutCents: null, sortOrder };
}

export function updateSession(
  db: Db,
  id: string,
  patch: Partial<Pick<Session, 'date' | 'title' | 'defaultBuyinCents' | 'notes'>>,
): void {
  const cur = getSession(db, id);
  if (!cur) throw new Error('Session not found');
  const next = { ...cur, ...patch };
  db.run('UPDATE sessions SET date = ?, title = ?, default_buyin_cents = ?, notes = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [
    next.date, next.title, next.defaultBuyinCents, next.notes, now(), id,
  ]);
}

export function deleteSession(db: Db, id: string): void {
  const t = now();
  db.transaction(() => {
    db.run(
      'UPDATE buyins SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND session_player_id IN (SELECT id FROM session_players WHERE session_id = ?)',
      [t, t, id],
    );
    db.run('UPDATE session_players SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND session_id = ?', [t, t, id]);
    db.run('UPDATE payments SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND session_id = ?', [t, t, id]);
    db.run('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [t, t, id]);
  });
}

export function getSessionDetail(db: Db, id: string): SessionDetail | null {
  const session = getSession(db, id);
  if (!session) return null;
  const sps = db
    .all<Record<string, unknown>>(`SELECT ${SP_COLS} FROM session_players WHERE session_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC`, [id])
    .map((r) => mapRow<SessionPlayer>(r));
  const players = sps.map((sp) => {
    const prow = db.first<Record<string, unknown>>(`SELECT ${P_COLS} FROM players WHERE id = ?`, [sp.playerId]);
    if (!prow) throw new Error('Player row missing');
    const p = mapRow<Omit<Player, 'archived'> & { archived: number }>(prow);
    const player: Player = { ...p, archived: !!p.archived };
    const buyins = db
      .all<Record<string, unknown>>(`SELECT ${B_COLS} FROM buyins WHERE session_player_id = ? AND deleted_at IS NULL ORDER BY at ASC, created_at ASC`, [sp.id])
      .map((r) => mapRow<Buyin>(r));
    return { sp, player, buyins };
  });
  const payments = db
    .all<Record<string, unknown>>(`SELECT ${PAY_COLS} FROM payments WHERE session_id = ? AND deleted_at IS NULL ORDER BY at ASC, created_at ASC`, [id])
    .map((r) => mapRow<Payment>(r));
  return { session, players, payments };
}

export function listSessionSummaries(db: Db): SessionSummary[] {
  const sessions = db
    .all<Record<string, unknown>>(`SELECT ${S_COLS} FROM sessions WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC`)
    .map((r) => mapRow<Session>(r));
  return sessions.map((session) => {
    const detail = getSessionDetail(db, session.id)!;
    const rows = computeRows(detail);
    let topWinner: SessionSummary['topWinner'] = null;
    let totalBuyinCents = 0;
    for (const r of rows) {
      totalBuyinCents += r.buyinCents;
      if (r.netCents !== null && r.netCents > 0 && (!topWinner || r.netCents > topWinner.netCents)) {
        topWinner = { name: r.name, netCents: r.netCents };
      }
    }
    return { session, playerCount: rows.length, totalBuyinCents, topWinner };
  });
}

export function addPlayerToSession(db: Db, sessionId: string, playerId: string): SessionPlayer {
  const dup = db.first<{ id: string }>(
    'SELECT id FROM session_players WHERE session_id = ? AND player_id = ? AND deleted_at IS NULL',
    [sessionId, playerId],
  );
  if (dup) throw new Error('Player already in session');
  const max = db.first<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM session_players WHERE session_id = ?', [sessionId]);
  return insertSessionPlayer(db, sessionId, playerId, (max?.m ?? -1) + 1, now());
}

export function removePlayerFromSession(db: Db, sessionPlayerId: string): void {
  const t = now();
  db.transaction(() => {
    db.run('UPDATE buyins SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND session_player_id = ?', [t, t, sessionPlayerId]);
    db.run('UPDATE session_players SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [t, t, sessionPlayerId]);
  });
}

export function setCashout(db: Db, sessionPlayerId: string, cents: number | null): void {
  if (cents !== null && (!Number.isInteger(cents) || cents < 0)) throw new Error('Amount must be non-negative');
  db.run('UPDATE session_players SET cashout_cents = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [cents, now(), sessionPlayerId]);
}

export function addBuyin(db: Db, sessionPlayerId: string, amountCents: number): Buyin {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Amount must be positive');
  const id = newId();
  const t = now();
  db.run(
    'INSERT INTO buyins (id, created_at, updated_at, deleted_at, session_player_id, amount_cents, at) VALUES (?, ?, ?, NULL, ?, ?, ?)',
    [id, t, t, sessionPlayerId, amountCents, t],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, sessionPlayerId, amountCents, at: t };
}

export function updateBuyin(db: Db, buyinId: string, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Amount must be positive');
  db.run('UPDATE buyins SET amount_cents = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [amountCents, now(), buyinId]);
}

export function removeBuyin(db: Db, buyinId: string): void {
  const t = now();
  db.run('UPDATE buyins SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [t, t, buyinId]);
}

export function addPayment(
  db: Db,
  sessionId: string,
  input: { fromPlayerId: string; toPlayerId: string; amountCents: number; note?: string | null },
): Payment {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Amount must be positive');
  if (input.fromPlayerId === input.toPlayerId) throw new Error('Payer and payee must differ');
  const id = newId();
  const t = now();
  const note = input.note ?? null;
  db.run(
    'INSERT INTO payments (id, created_at, updated_at, deleted_at, session_id, from_player_id, to_player_id, amount_cents, note, at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)',
    [id, t, t, sessionId, input.fromPlayerId, input.toPlayerId, input.amountCents, note, t],
  );
  return {
    id, createdAt: t, updatedAt: t, deletedAt: null,
    sessionId, fromPlayerId: input.fromPlayerId, toPlayerId: input.toPlayerId, amountCents: input.amountCents, note, at: t,
  };
}

export function removePayment(db: Db, paymentId: string): void {
  const t = now();
  db.run('UPDATE payments SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', [t, t, paymentId]);
}

export function lastSessionPlayerIds(db: Db): string[] {
  const last = db.first<{ id: string }>('SELECT id FROM sessions WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC LIMIT 1');
  if (!last) return [];
  return db
    .all<{ player_id: string }>('SELECT player_id FROM session_players WHERE session_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC', [last.id])
    .map((r) => r.player_id);
}
