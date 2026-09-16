import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { formatCents, formatSigned } from '@/domain/money';
import type { SessionSummaryMath } from '@/domain/nets';
import type { SessionDetail } from '@/domain/types';
import { formatDate } from '@/date';

export async function captureAndShare(ref: RefObject<View | null>): Promise<void> {
  if (!ref.current) throw new Error('Nothing to share yet');
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share settlement' });
}

/** Plain-text twin of the share card, for pasting into any chat app. */
export function buildShareText(detail: SessionDetail, math: SessionSummaryMath, symbol: string): string {
  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const title = detail.session.title?.trim() ? detail.session.title : 'Poker night';
  const lines: string[] = [`${title} — ${formatDate(detail.session.date)}`, ''];

  if (math.settlement.transfers.length === 0) {
    lines.push('Nobody owes anything.');
  } else {
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
  lines.push(
    '',
    disc === 0
      ? `Pool balanced: ${formatCents(math.totalBuyinCents, symbol)}`
      : `Off by ${formatCents(Math.abs(disc), symbol)} (${disc > 0 ? 'too much cashed out' : 'cash missing'})`,
  );
  return lines.join('\n');
}

export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
