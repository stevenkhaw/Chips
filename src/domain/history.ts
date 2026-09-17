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
