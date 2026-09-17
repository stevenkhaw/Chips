import type { History } from './history';

export const EVEN_COLOR = '#FFFFFF';
export const WIN_COLOR = '#10B981'; // Felt Emerald (theme colors.pos)
export const LOSS_COLOR = '#F43F5E'; // theme colors.neg

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `#${[c(ar, br), c(ag, bg), c(ab, bb)].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/**
 * Diverging colour for an all-time net: white at zero, blending to green for
 * winners and red for losers. `maxAbsCents` is the largest |net| across all
 * players, so only the extremes reach full colour. A mild curve (t^0.75) lets
 * small results show a visible tint.
 */
export function netColor(netCents: number, maxAbsCents: number): string {
  if (netCents === 0 || maxAbsCents <= 0) return EVEN_COLOR;
  const t = Math.pow(Math.min(1, Math.abs(netCents) / maxAbsCents), 0.75);
  return mix(EVEN_COLOR, netCents > 0 ? WIN_COLOR : LOSS_COLOR, t);
}

/** playerId → colour for everyone in the history. Players with no nights are simply absent (treat as even). */
export function playerColors(history: History): Record<string, string> {
  const maxAbs = history.players.reduce((m, p) => Math.max(m, Math.abs(p.totalNetCents)), 0);
  const out: Record<string, string> = {};
  for (const p of history.players) out[p.playerId] = netColor(p.totalNetCents, maxAbs);
  return out;
}
