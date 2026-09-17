import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { BalanceChart } from '@/components/BalanceChart';
import { formatSigned } from '@/domain/money';
import type { History, PlayerStats } from '@/domain/history';
import { formatDate } from '@/date';
import { useSessionsStore } from '@/store/useSessionsStore';
import { EVEN_COLOR } from '@/domain/playerColor';
import { colors, fonts } from '@/theme';

export const PLAYER_CARD_WIDTH = 1080;

const PAD = 56;
/** Most recent nights shown on the card; the rest collapse into "+N earlier". */
const MAX_NIGHTS = 10;

const netColor = (v: number | null) => (v === null ? colors.textMuted : v > 0 ? colors.pos : v < 0 ? colors.neg : colors.textDim);

export const PlayerShareCard = forwardRef<
  View,
  {
    stats: PlayerStats;
    history: History;
    symbol: string;
    onLayout?: (e: LayoutChangeEvent) => void;
  }
>(function PlayerShareCard({ stats, history, symbol, onLayout }, ref) {
  const { player } = stats;
  const color = useSessionsStore((s) => s.playerColors[player.playerId]) ?? EVEN_COLOR;
  const solo: History = { nights: history.nights, players: [player] };
  const recent = [...stats.nights].reverse();
  const shown = recent.slice(0, MAX_NIGHTS);
  const hidden = recent.length - shown.length;
  const record = `${stats.wins}W · ${stats.losses}L${stats.evens > 0 ? ` · ${stats.evens}E` : ''}`;
  const lastDate = stats.nights[stats.nights.length - 1]?.session.date;

  return (
    <View ref={ref} collapsable={false} onLayout={onLayout} style={s.canvas}>
      <View style={s.card}>
        <View style={s.header}>
          <Text style={s.brand}>CHIPS</Text>
          <View style={s.nameRow}>
            <View style={s.avatar}>
              <Text style={[s.avatarText, { color }]}>{player.name.trim().charAt(0).toUpperCase() || '?'}</Text>
            </View>
            <Text style={s.title} numberOfLines={1}>
              {player.name}
            </Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>ALL-TIME</Text>
        <Text style={[s.hero, { color: netColor(player.totalNetCents) }]}>{formatSigned(player.totalNetCents, symbol)}</Text>
        <Text style={s.heroSub}>
          {player.nightsPlayed} night{player.nightsPlayed === 1 ? '' : 's'} · {record}
        </Text>

        <View style={s.tiles}>
          <Tile label="AVG / NIGHT" value={formatSigned(stats.avgNetCents, symbol)} color={netColor(stats.avgNetCents)} />
          <Tile
            label="BEST NIGHT"
            value={stats.bestNight?.netCents != null ? formatSigned(stats.bestNight.netCents, symbol) : '—'}
            color={colors.pos}
          />
          <Tile
            label="WORST NIGHT"
            value={stats.worstNight?.netCents != null ? formatSigned(stats.worstNight.netCents, symbol) : '—'}
            color={colors.neg}
          />
        </View>

        <Text style={s.sectionLabel}>BALANCE OVER TIME</Text>
        <View style={s.chart}>
          <BalanceChart history={solo} symbol={symbol} scale={2.6} legend={false} />
        </View>

        <Text style={s.sectionLabel}>NIGHTS</Text>
        {shown.map((n) => {
          const label = n.session.title?.trim() ? n.session.title : formatDate(n.session.date);
          return (
            <View key={n.session.id} style={s.nightRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.nightTitle} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={s.nightDate}>{formatDate(n.session.date)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.nightNet, { color: netColor(n.netCents) }]}>
                  {n.netCents === null ? 'pending' : formatSigned(n.netCents, symbol)}
                </Text>
                {n.cumulativeCents !== null ? (
                  <Text style={s.nightRun}>{formatSigned(n.cumulativeCents, symbol)} total</Text>
                ) : null}
              </View>
            </View>
          );
        })}
        {hidden > 0 ? <Text style={s.more}>+{hidden} earlier night{hidden === 1 ? '' : 's'}</Text> : null}

        <View style={s.rule} />
        <View style={s.footer}>
          <Text style={s.date}>{lastDate ? `Through ${formatDate(lastDate)}` : ''}</Text>
        </View>
      </View>
    </View>
  );
});

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileLabel}>{label}</Text>
      <Text style={[s.tileValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  canvas: { width: PLAYER_CARD_WIDTH, backgroundColor: colors.bg, padding: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: colors.border,
    padding: PAD,
  },
  header: { marginBottom: 12 },
  brand: { fontFamily: fonts.bodyBold, fontSize: 30, letterSpacing: 6, color: colors.accent, marginBottom: 18 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.cardAlt,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 24,
  },
  avatarText: { fontFamily: fonts.bodySemi, fontSize: 40 },
  title: { fontFamily: fonts.headline, fontSize: 64, lineHeight: 72, color: colors.text, flexShrink: 1 },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 26,
    letterSpacing: 4,
    color: colors.textDim,
    marginTop: 40,
    marginBottom: 12,
  },
  hero: { fontFamily: fonts.numeric, fontSize: 112, lineHeight: 120, letterSpacing: -3, fontVariant: ['tabular-nums'] },
  heroSub: { fontFamily: fonts.bodyMedium, fontSize: 34, color: colors.textDim, marginTop: 6 },
  tiles: { flexDirection: 'row', marginTop: 32 },
  tile: {
    flex: 1,
    backgroundColor: colors.cardAlt,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    marginRight: 16,
  },
  tileLabel: { fontFamily: fonts.bodyBold, fontSize: 22, letterSpacing: 3, color: colors.textDim, marginBottom: 10 },
  tileValue: { fontFamily: fonts.numeric, fontSize: 46, fontVariant: ['tabular-nums'] },
  chart: { backgroundColor: colors.cardAlt, borderRadius: 28, borderWidth: 2, borderColor: colors.border, padding: 24 },
  nightRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 2, borderBottomColor: colors.border },
  nightTitle: { fontFamily: fonts.bodySemi, fontSize: 36, color: colors.text },
  nightDate: { fontFamily: fonts.body, fontSize: 26, color: colors.textDim, marginTop: 2 },
  nightNet: { fontFamily: fonts.numeric, fontSize: 40, fontVariant: ['tabular-nums'] },
  nightRun: { fontFamily: fonts.bodyMedium, fontSize: 24, color: colors.textDim, fontVariant: ['tabular-nums'], marginTop: 2 },
  more: { fontFamily: fonts.body, fontSize: 28, color: colors.textDim, marginTop: 16 },
  rule: { height: 2, backgroundColor: colors.border, marginVertical: 28 },
  footer: { flexDirection: 'row', alignItems: 'center' },
  date: { fontFamily: fonts.body, fontSize: 30, color: colors.textDim },
});
