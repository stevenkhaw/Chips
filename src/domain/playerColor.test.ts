import { EVEN_COLOR, LOSS_COLOR, WIN_COLOR, netColor, playerColors } from './playerColor';
import type { History } from './history';

describe('netColor', () => {
  it('is white at zero and when there is no spread', () => {
    expect(netColor(0, 5000)).toBe(EVEN_COLOR);
    expect(netColor(1000, 0)).toBe(EVEN_COLOR);
  });

  it('reaches full green / red at the extremes', () => {
    expect(netColor(5000, 5000)).toBe(WIN_COLOR);
    expect(netColor(-5000, 5000)).toBe(LOSS_COLOR);
    expect(netColor(9000, 5000)).toBe(WIN_COLOR); // clamped
  });

  it('blends between white and the pole for partial results', () => {
    const half = netColor(2500, 5000);
    expect(half).not.toBe(EVEN_COLOR);
    expect(half).not.toBe(WIN_COLOR);
    expect(half).toMatch(/^#[0-9A-F]{6}$/);
    // Green pole has low red; a half-win sits between white (FF) and the pole (10).
    const r = parseInt(half.slice(1, 3), 16);
    expect(r).toBeGreaterThan(0x10);
    expect(r).toBeLessThan(0xff);
  });
});

describe('playerColors', () => {
  it('scales by the largest absolute net across players', () => {
    const history: History = {
      nights: [],
      players: [
        { playerId: 'a', name: 'A', nightsPlayed: 1, totalNetCents: 8000, cumulative: [] },
        { playerId: 'b', name: 'B', nightsPlayed: 1, totalNetCents: -8000, cumulative: [] },
        { playerId: 'c', name: 'C', nightsPlayed: 1, totalNetCents: 0, cumulative: [] },
      ],
    };
    expect(playerColors(history)).toEqual({ a: WIN_COLOR, b: LOSS_COLOR, c: EVEN_COLOR });
  });
});
