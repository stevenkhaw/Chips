import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { formatCents, formatSigned } from '@/domain/money';
import type { SessionSummaryMath } from '@/domain/nets';
import type { SessionDetail } from '@/domain/types';
import { formatDate } from '@/date';
import { avatarColor, colors, fonts } from '@/theme';

export const SHARE_CARD_WIDTH = 1080;

const PAD = 56;

export const ShareCard = forwardRef<
  View,
  {
    detail: SessionDetail;
    math: SessionSummaryMath;
    symbol: string;
    onLayout?: (e: LayoutChangeEvent) => void;
  }
>(function ShareCard({ detail, math, symbol, onLayout }, ref) {
  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const seedOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.colorSeed ?? 0;
  const disc = math.settlement.discrepancyCents;
  const balanced = disc === 0;
  const title = detail.session.title?.trim() ? detail.session.title : 'Poker night';
  const results = [...math.rows]
    .filter((r) => r.netCents !== null)
    .sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));

  return (
    <View ref={ref} collapsable={false} onLayout={onLayout} style={s.canvas}>
      <View style={s.card}>
        <View style={s.header}>
          <Text style={s.brand}>CHIPS</Text>
          <Text style={s.title}>{title}</Text>
        </View>

        <View style={s.rule} />

        {math.settlement.transfers.length === 0 ? (
          <Text style={s.empty}>Nobody owes anything.</Text>
        ) : (
          math.settlement.transfers.map((t, i) => (
            <View key={`${t.from}-${t.to}-${i}`} style={s.transfer}>
              <View style={[s.dot, { backgroundColor: avatarColor(seedOf(t.from)) }]} />
              <Text style={s.transferText} numberOfLines={1}>
                {nameOf(t.from)} pays {nameOf(t.to)}
              </Text>
              <View style={s.spacer} />
              <Text style={s.transferAmount}>{formatCents(t.amountCents, symbol)}</Text>
            </View>
          ))
        )}

        {results.length > 0 ? (
          <>
            <Text style={s.sectionLabel}>RESULTS</Text>
            {results.map((r) => (
              <View key={r.playerId} style={s.resultRow}>
                <View style={[s.dot, { backgroundColor: avatarColor(r.colorSeed) }]} />
                <Text style={s.resultName} numberOfLines={1}>
                  {r.name}
                </Text>
                <View style={s.spacer} />
                <Text
                  style={[
                    s.resultNet,
                    { color: (r.netCents ?? 0) > 0 ? colors.pos : (r.netCents ?? 0) < 0 ? colors.neg : colors.textDim },
                  ]}>
                  {formatSigned(r.netCents ?? 0, symbol)}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={s.sectionLabel}>DETAILS</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.colName]}>Player</Text>
          <Text style={[s.th, s.col]}>In</Text>
          <Text style={[s.th, s.col]}>Out</Text>
          <Text style={[s.th, s.col]}>Net</Text>
        </View>
        {math.rows.map((r) => (
          <View key={r.playerId} style={s.tableRow}>
            <Text style={[s.td, s.colName]} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={[s.td, s.col]}>{formatCents(r.buyinCents, symbol)}</Text>
            <Text style={[s.td, s.col]}>{r.cashoutCents === null ? '—' : formatCents(r.cashoutCents, symbol)}</Text>
            <Text style={[s.td, s.col]}>{r.netCents === null ? '—' : formatSigned(r.netCents, symbol)}</Text>
          </View>
        ))}

        <View style={s.rule} />
        <View style={s.footer}>
          <Text style={s.date}>{formatDate(detail.session.date)}</Text>
          <View style={s.spacer} />
          <View style={[s.poolPill, balanced ? s.poolOk : s.poolWarn]}>
            <View style={[s.pillDot, { backgroundColor: balanced ? colors.accent : colors.warn }]} />
            <Text style={[s.poolText, { color: balanced ? colors.accent : colors.warn }]}>
              {balanced
                ? `Pool balanced: ${formatCents(math.totalBuyinCents, symbol)}`
                : `Off by ${formatCents(Math.abs(disc), symbol)}`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  canvas: { width: SHARE_CARD_WIDTH, backgroundColor: colors.bg, padding: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: colors.border,
    padding: PAD,
  },
  header: { marginBottom: 28 },
  brand: { fontFamily: fonts.bodyBold, fontSize: 30, letterSpacing: 6, color: colors.accent, marginBottom: 10 },
  title: { fontFamily: fonts.headline, fontSize: 64, lineHeight: 72, color: colors.text },
  rule: { height: 2, backgroundColor: colors.border, marginVertical: 28 },
  empty: { fontFamily: fonts.body, fontSize: 40, color: colors.textDim },
  transfer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  dot: { width: 20, height: 20, borderRadius: 10, marginRight: 20 },
  spacer: { flex: 1, minWidth: 24 },
  transferText: { fontFamily: fonts.mono, fontSize: 42, lineHeight: 52, color: colors.text, flexShrink: 1 },
  transferAmount: {
    fontFamily: fonts.numeric,
    fontSize: 46,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 26,
    letterSpacing: 4,
    color: colors.textDim,
    marginTop: 40,
    marginBottom: 16,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  resultName: { fontFamily: fonts.bodySemi, fontSize: 40, color: colors.text, flexShrink: 1 },
  resultNet: { fontFamily: fonts.numeric, fontSize: 42, fontVariant: ['tabular-nums'] },
  tableHead: { flexDirection: 'row', paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: colors.border },
  tableRow: { flexDirection: 'row', paddingVertical: 12 },
  th: { fontFamily: fonts.bodyBold, fontSize: 26, letterSpacing: 2, color: colors.textDim },
  td: { fontFamily: fonts.bodyMedium, fontSize: 32, color: colors.text, fontVariant: ['tabular-nums'] },
  colName: { flex: 2 },
  col: { flex: 1, textAlign: 'right' },
  footer: { flexDirection: 'row', alignItems: 'center' },
  date: { fontFamily: fonts.body, fontSize: 30, color: colors.textDim },
  poolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  poolOk: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  poolWarn: { backgroundColor: colors.warnSoft, borderColor: colors.warnBorder },
  pillDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
  poolText: { fontFamily: fonts.bodySemi, fontSize: 28, fontVariant: ['tabular-nums'] },
});
