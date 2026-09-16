import { settle, type SettlementResult } from './settle';
import type { SessionDetail } from './types';

export interface PlayerNetRow {
  playerId: string;
  name: string;
  colorSeed: number;
  buyinCents: number;
  cashoutCents: number | null;
  netCents: number | null;
}

export interface SessionSummaryMath {
  rows: PlayerNetRow[];
  totalBuyinCents: number;
  totalCashoutCents: number;
  pendingCount: number;
  settlement: SettlementResult;
}

export function computeRows(detail: SessionDetail): PlayerNetRow[] {
  return [...detail.players]
    .sort((a, b) => a.sp.sortOrder - b.sp.sortOrder)
    .map(({ sp, player, buyins }) => {
      const buyinCents = buyins.reduce((s, b) => s + b.amountCents, 0);
      const cashoutCents = sp.cashoutCents;
      return {
        playerId: player.id,
        name: player.name,
        colorSeed: player.colorSeed,
        buyinCents,
        cashoutCents,
        netCents: cashoutCents === null ? null : cashoutCents - buyinCents,
      };
    });
}

export function summarize(detail: SessionDetail): SessionSummaryMath {
  const rows = computeRows(detail);
  const totalBuyinCents = rows.reduce((s, r) => s + r.buyinCents, 0);
  const totalCashoutCents = rows.reduce((s, r) => s + (r.cashoutCents ?? 0), 0);
  const pendingCount = rows.filter((r) => r.netCents === null).length;
  const settlement = settle(
    rows.filter((r) => r.netCents !== null).map((r) => ({ playerId: r.playerId, netCents: r.netCents as number })),
  );
  return { rows, totalBuyinCents, totalCashoutCents, pendingCount, settlement };
}
