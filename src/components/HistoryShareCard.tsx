import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { BalanceChart } from '@/components/BalanceChart';
import { formatSigned } from '@/domain/money';
import type { History } from '@/domain/history';
import { formatDate } from '@/date';
import { useSessionsStore } from '@/store/useSessionsStore';
import { EVEN_COLOR } from '@/domain/playerColor';
import { colors, fonts } from '@/theme';

export const HISTORY_CARD_WIDTH = 1080;

/** Outer breathing room between the canvas edge and the card (`s.canvas.padding`). */
const CANVAS_PADDING = 40;
/** The card's own border (`s.card.borderWidth`); counts against the usable content width. */
const CARD_BORDER_WIDTH = 2;
/** Inner padding between the card's border and its content (`s.card.padding`). */
const PAD = 56;
/** Most recent nights shown on the card; the rest collapse into "+K earlier nights". */
const MAX_NIGHTS = 12;
/** Fixed width of the Night label column in the nights table. */
const NIGHT_COL = 260;
/** Smallest a player column can shrink to before we drop players from the table. */
const MIN_PLAYER_COL = 96;

const netColor = (v: number | null) => (v === null ? colors.textMuted : v > 0 ? colors.pos : v < 0 ? colors.neg : colors.textDim);

export const HistoryShareCard = forwardRef<
  View,
  {
    history: History;
    symbol: string;
    houseName?: string | null;
    onLayout?: (e: LayoutChangeEvent) => void;
  }
>(function HistoryShareCard({ history, symbol, houseName, onLayout }, ref) {
  const { nights, players } = history;
  const colorMap = useSessionsStore((s) => s.playerColors);
  const colorOf = (pid: string) => colorMap[pid] ?? EVEN_COLOR;

  const title = houseName?.trim() ? houseName : 'History';
  const lastDate = nights[nights.length - 1]?.session.date;

  // Fit player columns into the card's actual content width (canvas padding + card border +
  // card padding all eat into HISTORY_CARD_WIDTH); if even the minimum doesn't fit everyone,
  // show the top players by standing and point to the CSV/text for the rest.
  const innerWidth = HISTORY_CARD_WIDTH - (CANVAS_PADDING + CARD_BORDER_WIDTH + PAD) * 2;
  const availForPlayers = Math.max(innerWidth - NIGHT_COL, 0);
  const maxCols = Math.max(1, Math.floor(availForPlayers / MIN_PLAYER_COL));
  const shownPlayers = players.slice(0, maxCols);
  const hiddenPlayerCount = players.length - shownPlayers.length;
  const playerColWidth = shownPlayers.length > 0 ? Math.max(availForPlayers / shownPlayers.length, MIN_PLAYER_COL) : MIN_PLAYER_COL;

  const recentNights = [...nights].reverse();
  const shownNights = recentNights.slice(0, MAX_NIGHTS);
  const hiddenNightCount = recentNights.length - shownNights.length;

  return (
    <View ref={ref} collapsable={false} onLayout={onLayout} style={s.canvas}>
      <View style={s.card}>
        <View style={s.header}>
          <Text style={s.brand}>CHIPS</Text>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={s.subLine}>
            {nights.length} night{nights.length === 1 ? '' : 's'} · {players.length} player{players.length === 1 ? '' : 's'}
          </Text>
        </View>

        <Text style={s.sectionLabel}>BALANCE OVER TIME</Text>
        <View style={s.chart}>
          <BalanceChart history={history} symbol={symbol} scale={2.6} legend={false} />
          <View style={s.legend}>
            {players.map((p) => (
              <View key={p.playerId} style={s.legendItem}>
                <View style={[s.dot, { backgroundColor: colorOf(p.playerId) }]} />
                <Text style={s.legendName} numberOfLines={1}>
                  {p.name}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={s.sectionLabel}>STANDINGS</Text>
        {players.map((p, i) => {
          const avg = p.nightsPlayed > 0 ? Math.round(p.totalNetCents / p.nightsPlayed) : 0;
          return (
            <View key={p.playerId} style={s.standingRow}>
              <Text style={s.rank}>{i + 1}</Text>
              <View style={[s.avatar, { borderColor: colorOf(p.playerId) }]}>
                <Text style={[s.avatarText, { color: colorOf(p.playerId) }]}>
                  {p.name.trim().charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.standingName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={s.standingSub}>
                  {p.nightsPlayed} night{p.nightsPlayed === 1 ? '' : 's'} · avg {formatSigned(avg, symbol)}
                </Text>
              </View>
              <Text style={[s.standingNet, { color: netColor(p.totalNetCents) }]}>{formatSigned(p.totalNetCents, symbol)}</Text>
            </View>
          );
        })}

        <Text style={s.sectionLabel}>NIGHTS</Text>
        {hiddenPlayerCount > 0 ? (
          <Text style={s.note}>
            +{hiddenPlayerCount} more player{hiddenPlayerCount === 1 ? '' : 's'} in the CSV / text
          </Text>
        ) : null}
        <View style={s.tableHead}>
          <Text style={[s.tableHeadCell, { width: NIGHT_COL }]}>Night</Text>
          {shownPlayers.map((p) => (
            <Text key={p.playerId} style={[s.tableHeadCell, { width: playerColWidth }]} numberOfLines={1}>
              {p.name}
            </Text>
          ))}
        </View>
        {shownNights.map((nt) => {
          const label = nt.session.title?.trim() ? nt.session.title : formatDate(nt.session.date);
          return (
            <View key={nt.session.id} style={s.tableRow}>
              <View style={{ width: NIGHT_COL }}>
                <Text style={s.nightTitle} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={s.nightDate}>{formatDate(nt.session.date)}</Text>
              </View>
              {shownPlayers.map((p) => {
                const net = nt.nets[p.playerId];
                return (
                  <Text
                    key={p.playerId}
                    style={[s.tableCell, { width: playerColWidth, color: net === null || net === undefined ? colors.textMuted : netColor(net) }]}>
                    {net === null || net === undefined ? '—' : formatSigned(net, symbol)}
                  </Text>
                );
              })}
            </View>
          );
        })}
        {hiddenNightCount > 0 ? (
          <Text style={s.more}>
            +{hiddenNightCount} earlier night{hiddenNightCount === 1 ? '' : 's'}
          </Text>
        ) : null}

        <View style={[s.tableRow, s.totalRow]}>
          <Text style={[s.nightTitle, { width: NIGHT_COL }]}>Total</Text>
          {shownPlayers.map((p) => (
            <Text key={p.playerId} style={[s.tableCell, { width: playerColWidth, color: netColor(p.totalNetCents) }]}>
              {formatSigned(p.totalNetCents, symbol)}
            </Text>
          ))}
        </View>

        <View style={s.rule} />
        <View style={s.footer}>
          <Text style={s.date}>{lastDate ? `Through ${formatDate(lastDate)}` : ''}</Text>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  canvas: { width: HISTORY_CARD_WIDTH, backgroundColor: colors.bg, padding: CANVAS_PADDING },
  card: {
    backgroundColor: colors.card,
    borderRadius: 48,
    borderWidth: CARD_BORDER_WIDTH,
    borderColor: colors.border,
    padding: PAD,
  },
  header: { marginBottom: 12 },
  brand: { fontFamily: fonts.bodyBold, fontSize: 30, letterSpacing: 6, color: colors.accent, marginBottom: 18 },
  title: { fontFamily: fonts.headline, fontSize: 64, lineHeight: 72, color: colors.text },
  subLine: { fontFamily: fonts.bodyMedium, fontSize: 30, color: colors.textDim, marginTop: 8 },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 26,
    letterSpacing: 4,
    color: colors.textDim,
    marginTop: 40,
    marginBottom: 12,
  },
  chart: { backgroundColor: colors.cardAlt, borderRadius: 28, borderWidth: 2, borderColor: colors.border, padding: 24 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 24, marginBottom: 8, maxWidth: 260 },
  dot: { width: 16, height: 16, borderRadius: 8, marginRight: 10 },
  legendName: { fontFamily: fonts.bodySemi, fontSize: 24, color: colors.textDim },
  standingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 2, borderBottomColor: colors.border },
  rank: { fontFamily: fonts.bodyBold, fontSize: 28, color: colors.textMuted, width: 44 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.cardAlt,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
  },
  avatarText: { fontFamily: fonts.bodySemi, fontSize: 24 },
  standingName: { fontFamily: fonts.bodySemi, fontSize: 34, color: colors.text },
  standingSub: { fontFamily: fonts.body, fontSize: 22, color: colors.textDim, marginTop: 2 },
  standingNet: { fontFamily: fonts.numeric, fontSize: 34, fontVariant: ['tabular-nums'] },
  note: { fontFamily: fonts.body, fontSize: 22, color: colors.textDim, marginBottom: 12, fontStyle: 'italic' },
  tableHead: { flexDirection: 'row', paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: colors.border },
  tableHeadCell: { fontFamily: fonts.bodyBold, fontSize: 20, letterSpacing: 2, color: colors.textDim, textAlign: 'right' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalRow: { marginTop: 4, borderBottomWidth: 0, borderTopWidth: 2, borderTopColor: colors.border },
  nightTitle: { fontFamily: fonts.bodySemi, fontSize: 28, color: colors.text },
  nightDate: { fontFamily: fonts.body, fontSize: 20, color: colors.textDim, marginTop: 2 },
  tableCell: { fontFamily: fonts.numeric, fontSize: 26, fontVariant: ['tabular-nums'], textAlign: 'right' },
  more: { fontFamily: fonts.body, fontSize: 26, color: colors.textDim, marginTop: 12 },
  rule: { height: 2, backgroundColor: colors.border, marginVertical: 28 },
  footer: { flexDirection: 'row', alignItems: 'center' },
  date: { fontFamily: fonts.body, fontSize: 30, color: colors.textDim },
});
