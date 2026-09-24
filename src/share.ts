import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { formatCents, formatSigned } from '@/domain/money';
import type { SessionSummaryMath } from '@/domain/nets';
import type { History, PlayerStats } from '@/domain/history';
import type { SessionDetail } from '@/domain/types';
import { formatDate } from '@/date';

export async function captureAndShare(ref: RefObject<View | null>, dialogTitle = 'Share settlement'): Promise<void> {
  if (!ref.current) throw new Error('Nothing to share yet');
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  // useRenderInContext (iOS-only) avoids the default drawViewHierarchyInRect path, which
  // react-native-view-shot's own source warns can return a blank image for large or
  // offscreen views. It is a no-op on Android.
  const uri = await captureRef(ref, { format: 'png', result: 'tmpfile', useRenderInContext: true });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle });
}

/** Plain-text twin of the share card, for pasting into any chat app. */
export function buildShareText(detail: SessionDetail, math: SessionSummaryMath, symbol: string): string {
  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const title = detail.session.title?.trim() ? detail.session.title : 'Poker night';
  const lines: string[] = [`${title} — ${formatDate(detail.session.date)}`, ''];

  if (math.paidCount > 0) {
    lines.push('Already paid:');
    for (const p of detail.payments) {
      lines.push(`• ${nameOf(p.fromPlayerId)} → ${nameOf(p.toPlayerId)}  ${formatCents(p.amountCents, symbol)}`);
    }
    lines.push('');
  }

  if (math.settlement.transfers.length === 0) {
    lines.push(math.paidCount > 0 ? 'All settled.' : 'Nobody owes anything.');
  } else {
    lines.push('Still owed:');
    for (const t of math.settlement.transfers) {
      lines.push(`• ${nameOf(t.from)} pays ${nameOf(t.to)}  ${formatCents(t.amountCents, symbol)}`);
    }
  }

  const results = [...math.rows]
    .filter((r) => r.netCents !== null)
    .sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));
  if (results.length > 0) {
    lines.push('', 'Results:');
    for (const r of results) lines.push(`  ${r.name}  ${formatSigned(r.netCents ?? 0, symbol)}`);
  }

  const disc = math.settlement.discrepancyCents;
  const pending = math.pendingCount;
  const balanced = pending === 0 && disc === 0;
  lines.push(
    '',
    balanced
      ? `Pool balanced: ${formatCents(math.totalBuyinCents, symbol)}`
      : disc !== 0
        ? `Off by ${formatCents(Math.abs(disc), symbol)} (${disc > 0 ? 'too much cashed out' : 'cash missing'})`
        : `${pending} player${pending === 1 ? '' : 's'} not cashed out`,
  );
  if (pending > 0 && disc !== 0) {
    lines.push(`${pending} player${pending === 1 ? '' : 's'} not cashed out`);
  }
  return lines.join('\n');
}

/** Plain-text twin of the player stats card. */
export function buildPlayerShareText(stats: PlayerStats, symbol: string): string {
  const { player } = stats;
  const lines: string[] = [
    `${player.name} — all-time ${formatSigned(player.totalNetCents, symbol)}`,
    `${player.nightsPlayed} night${player.nightsPlayed === 1 ? '' : 's'} · ${stats.wins}W ${stats.losses}L${
      stats.evens > 0 ? ` ${stats.evens}E` : ''
    } · avg ${formatSigned(stats.avgNetCents, symbol)}`,
  ];
  if (stats.bestNight && stats.bestNight.netCents !== null) {
    lines.push(`Best: ${formatSigned(stats.bestNight.netCents, symbol)} (${formatDate(stats.bestNight.session.date)})`);
  }
  if (stats.worstNight && stats.worstNight.netCents !== null) {
    lines.push(`Worst: ${formatSigned(stats.worstNight.netCents, symbol)} (${formatDate(stats.worstNight.session.date)})`);
  }
  lines.push('', 'Nights:');
  for (const n of [...stats.nights].reverse()) {
    const label = n.session.title?.trim() ? n.session.title : formatDate(n.session.date);
    const net = n.netCents === null ? 'pending' : formatSigned(n.netCents, symbol);
    const run = n.cumulativeCents === null ? '' : `  (${formatSigned(n.cumulativeCents, symbol)})`;
    lines.push(`• ${label}  ${net}${run}`);
  }
  return lines.join('\n');
}

/** Plain-text twin of the history card: standings, then nights newest first. */
export function buildHistoryShareText(history: History, symbol: string): string {
  const { nights, players } = history;
  const lines: string[] = ['Standings:'];
  players.forEach((p, i) => {
    const avg = p.nightsPlayed > 0 ? Math.round(p.totalNetCents / p.nightsPlayed) : 0;
    lines.push(
      `${i + 1}. ${p.name}  ${formatSigned(p.totalNetCents, symbol)}  (${p.nightsPlayed} night${p.nightsPlayed === 1 ? '' : 's'} · avg ${formatSigned(avg, symbol)})`,
    );
  });

  lines.push('', 'Nights:');
  for (const nt of [...nights].reverse()) {
    const label = nt.session.title?.trim() ? nt.session.title : formatDate(nt.session.date);
    const parts = players
      .filter((p) => p.playerId in nt.nets)
      .map((p) => {
        const net = nt.nets[p.playerId];
        return `${p.name} ${net === null ? 'pending' : formatSigned(net, symbol)}`;
      });
    lines.push(`• ${label}: ${parts.join(', ')}`);
  }

  return lines.join('\n');
}

/** RFC 4180 field quoting: wraps and doubles quotes when the value contains a comma, quote, or newline. */
function csvField(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Plain decimal dollars, no currency symbol, for spreadsheet parsing (e.g. `-7.00`). */
function csvCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}${dollars}.${rem.toString().padStart(2, '0')}`;
}

/** Full Nights table as CSV: header, one row per night oldest first, then a Total row. */
export function buildHistoryCsv(history: History): string {
  const { nights, players } = history;
  const header = ['Night', 'Date', ...players.map((p) => p.name)].map(csvField).join(',');

  const rows = nights.map((nt) => {
    const label = nt.session.title?.trim() ? nt.session.title : formatDate(nt.session.date);
    const cells = players.map((p) => {
      const net = nt.nets[p.playerId];
      return net === null || net === undefined ? '' : csvCents(net);
    });
    return [csvField(label), nt.session.date, ...cells].join(',');
  });

  const totalRow = ['Total', '', ...players.map((p) => csvCents(p.totalNetCents))].join(',');

  return [header, ...rows, totalRow].join('\n');
}

/** Writes CSV text to the cache directory and shares it. */
export async function shareCsv(csv: string, filename: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(csv);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Export history',
  });
}

export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
