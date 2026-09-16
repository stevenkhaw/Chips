import { settle, type SettlementResult } from './settle';
import type { SessionDetail } from './types';

export interface PlayerNetRow {
  playerId: string;
  name: string;
  colorSeed: number;
  buyinCents: number;
  cashoutCents: number | null;
  netCents: number | null;
  /** Sum of manual payments this player made to others (fromPlayerId === playerId). */
  paidOutCents: number;
  /** Sum of manual payments this player received from others (toPlayerId === playerId). */
  receivedCents: number;
  /** netCents + paidOutCents − receivedCents; null when netCents is null (pending cash-out). */
  adjustedNetCents: number | null;
}

export interface SessionSummaryMath {
  rows: PlayerNetRow[];
  totalBuyinCents: number;
  totalCashoutCents: number;
  pendingCount: number;
  /** Total number of manual payments logged for this session (including any referencing unknown/removed players). */
  paidCount: number;
  settlement: SettlementResult;
}

export function computeRows(detail: SessionDetail): PlayerNetRow[] {
  const knownIds = new Set(detail.players.map((p) => p.player.id));
  // Payments referencing a player no longer in this session (e.g. removed) are ignored
  // for the purposes of adjusting nets — they still appear in detail.payments verbatim.
  const knownPayments = detail.payments.filter((p) => knownIds.has(p.fromPlayerId) && knownIds.has(p.toPlayerId));

  return [...detail.players]
    .sort((a, b) => a.sp.sortOrder - b.sp.sortOrder)
    .map(({ sp, player, buyins }) => {
      const buyinCents = buyins.reduce((s, b) => s + b.amountCents, 0);
      const cashoutCents = sp.cashoutCents;
      const netCents = cashoutCents === null ? null : cashoutCents - buyinCents;
      const paidOutCents = knownPayments
        .filter((p) => p.fromPlayerId === player.id)
        .reduce((s, p) => s + p.amountCents, 0);
      const receivedCents = knownPayments
        .filter((p) => p.toPlayerId === player.id)
        .reduce((s, p) => s + p.amountCents, 0);
      return {
        playerId: player.id,
        name: player.name,
        colorSeed: player.colorSeed,
        buyinCents,
        cashoutCents,
        netCents,
        paidOutCents,
        receivedCents,
        adjustedNetCents: netCents === null ? null : netCents + paidOutCents - receivedCents,
      };
    });
}

export function summarize(detail: SessionDetail): SessionSummaryMath {
  const rows = computeRows(detail);
  const totalBuyinCents = rows.reduce((s, r) => s + r.buyinCents, 0);
  const totalCashoutCents = rows.reduce((s, r) => s + (r.cashoutCents ?? 0), 0);
  const pendingCount = rows.filter((r) => r.netCents === null).length;
  // Settlement runs on ADJUSTED nets of non-pending players. A payment where the other
  // side is still pending (excluded here) nonetheless adjusts this side's balance — that
  // half of the payment is "banked" against this player and will only be fully reflected
  // in the settlement once the pending player cashes out. This is accepted behaviour.
  const settlement = settle(
    rows
      .filter((r) => r.netCents !== null)
      .map((r) => ({ playerId: r.playerId, netCents: r.adjustedNetCents as number })),
  );
  return { rows, totalBuyinCents, totalCashoutCents, pendingCount, paidCount: detail.payments.length, settlement };
}
