import { computeRows } from './nets';
import type { Session, SessionDetail } from './types';

export interface HistoryNight {
  session: Session;
  /** Net (cash-out − buy-ins) per player in this night; `null` while their cash-out is pending. */
  nets: Record<string, number | null>;
}

export interface HistoryPlayer {
  playerId: string;
  name: string;
  /** Nights with a settled (non-pending) result. */
  nightsPlayed: number;
  totalNetCents: number;
  /**
   * One entry per night, aligned with `History.nights`: the running total after that
   * night, or `null` when the player was absent or pending (running total unchanged).
   */
  cumulative: (number | null)[];
}

export interface History {
  nights: HistoryNight[];
  /** Everyone who appears in at least one night, sorted by total net desc, then name. */
  players: HistoryPlayer[];
}

/** Builds the all-time picture from session details given in chronological order. */
export function buildHistory(details: SessionDetail[]): History {
  const nights: HistoryNight[] = details.map((detail) => {
    const nets: Record<string, number | null> = {};
    for (const r of computeRows(detail)) nets[r.playerId] = r.netCents;
    return { session: detail.session, nets };
  });

  const byId = new Map<string, HistoryPlayer>();
  details.forEach((detail, i) => {
    for (const { player } of detail.players) {
      let hp = byId.get(player.id);
      if (!hp) {
        hp = {
          playerId: player.id,
          name: player.name,
          nightsPlayed: 0,
          totalNetCents: 0,
          cumulative: new Array<number | null>(details.length).fill(null),
        };
        byId.set(player.id, hp);
      }
      const net = nights[i].nets[player.id];
      if (net === null || net === undefined) continue;
      hp.nightsPlayed += 1;
      hp.totalNetCents += net;
      hp.cumulative[i] = hp.totalNetCents;
    }
  });

  const players = [...byId.values()].sort(
    (a, b) => b.totalNetCents - a.totalNetCents || a.name.localeCompare(b.name),
  );
  return { nights, players };
}

export interface BalanceRunPoint {
  /** Aligned with `History.nights`; -1 is the "start" slot before the first night. */
  index: number;
  value: number;
}

export interface BalanceRun {
  /** true when this run should be drawn dotted (the player sat out or a cash-out is pending). */
  dashed: boolean;
  /** Chronological points for one Polyline segment; a run's first point equals the previous run's last point. */
  points: BalanceRunPoint[];
}

/**
 * Splits one player's `cumulative` series into drawable runs: a solid run for played,
 * settled nights, and a dashed run — flat at the last known total — for nights the
 * player missed or whose cash-out is still pending. Consecutive nights of the same
 * kind merge into a single run so each renders as one Polyline; adjacent runs share
 * their boundary point so the line stays continuous. Starts from the "start" slot
 * (index -1, value 0). Returns `[]` when there are no nights.
 */
export function balanceRuns(cumulative: (number | null)[]): BalanceRun[] {
  if (cumulative.length === 0) return [];

  const runs: BalanceRun[] = [];
  let prevPoint: BalanceRunPoint = { index: -1, value: 0 };
  let lastKnown = 0;
  let current: BalanceRun | null = null;

  cumulative.forEach((v, i) => {
    const dashed = v === null;
    const value = dashed ? lastKnown : v;
    const point: BalanceRunPoint = { index: i, value };

    if (!current || current.dashed !== dashed) {
      if (current) runs.push(current);
      current = { dashed, points: [prevPoint, point] };
    } else {
      current.points.push(point);
    }

    prevPoint = point;
    if (!dashed) lastKnown = value;
  });

  if (current) runs.push(current);
  return runs;
}

export interface PlayerNightStat {
  session: Session;
  /** Net for this night; `null` while the cash-out is pending. */
  netCents: number | null;
  /** Running total after this night; `null` when pending (total unchanged). */
  cumulativeCents: number | null;
}

export interface PlayerStats {
  player: HistoryPlayer;
  /** Nights the player attended, chronological (pending nights included). */
  nights: PlayerNightStat[];
  /** Highest / lowest settled net; `null` when no night is settled. */
  bestNight: PlayerNightStat | null;
  worstNight: PlayerNightStat | null;
  wins: number;
  losses: number;
  evens: number;
  /** Mean settled net per night (0 when nothing is settled). */
  avgNetCents: number;
}

/** One player's slice of the history, or `null` if they never appeared in a night. */
export function playerStats(history: History, playerId: string): PlayerStats | null {
  const player = history.players.find((p) => p.playerId === playerId);
  if (!player) return null;

  const nights: PlayerNightStat[] = [];
  history.nights.forEach((nt, i) => {
    if (!(playerId in nt.nets)) return;
    nights.push({ session: nt.session, netCents: nt.nets[playerId], cumulativeCents: player.cumulative[i] });
  });

  const settled = nights.filter((n): n is PlayerNightStat & { netCents: number } => n.netCents !== null);
  let bestNight: PlayerNightStat | null = null;
  let worstNight: PlayerNightStat | null = null;
  for (const n of settled) {
    if (!bestNight || n.netCents > (bestNight.netCents as number)) bestNight = n;
    if (!worstNight || n.netCents < (worstNight.netCents as number)) worstNight = n;
  }

  return {
    player,
    nights,
    bestNight,
    worstNight,
    wins: settled.filter((n) => n.netCents > 0).length,
    losses: settled.filter((n) => n.netCents < 0).length,
    evens: settled.filter((n) => n.netCents === 0).length,
    avgNetCents: settled.length ? Math.round(player.totalNetCents / settled.length) : 0,
  };
}
