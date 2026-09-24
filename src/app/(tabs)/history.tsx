import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar, Body, Button, Caption, Card, Divider, Headline, Overline, Row, Screen, Title } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { BalanceChart } from '@/components/BalanceChart';
import { HouseBar } from '@/components/HouseBar';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { buildHistory } from '@/domain/history';
import { formatSigned } from '@/domain/money';
import { formatDate } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

const NIGHT_COL = 128;
const PLAYER_COL = 88;

export default function HistoryScreen() {
  const router = useRouter();
  const summaries = useSessionsStore((s) => s.summaries);
  const listDetails = useSessionsStore((s) => s.listDetails);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  // `summaries` is the change signal: every store mutation reloads it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const history = useMemo(() => buildHistory(listDetails()), [summaries, listDetails]);
  const { nights, players } = history;

  if (nights.length === 0) {
    return (
      <Screen scroll>
        <Headline style={s.title}>History</Headline>
        <HouseBar style={{ marginBottom: space.md }} />
        <Card>
          <Title>Nothing to chart yet</Title>
          <Caption style={{ marginTop: space.xs, marginBottom: space.lg }}>
            Finish a night and everyone's running balance shows up here.
          </Caption>
          <Button label="Start New Night" onPress={() => router.push('/new-session')} />
        </Card>
      </Screen>
    );
  }

  const cellText = (v: number | null | undefined) =>
    v === null || v === undefined ? (
      <Text style={[s.cell, { color: colors.textMuted }]}>—</Text>
    ) : (
      <Text style={[s.cell, { color: v > 0 ? colors.pos : v < 0 ? colors.neg : colors.textDim }]}>
        {formatSigned(v, symbol)}
      </Text>
    );

  return (
    <Screen scroll>
      <Headline style={s.title}>History</Headline>
      <HouseBar style={{ marginBottom: space.md }} />
      <Caption style={{ marginBottom: space.lg }}>
        {nights.length} night{nights.length === 1 ? '' : 's'} · {players.length} player{players.length === 1 ? '' : 's'}
      </Caption>

      <Overline style={s.sectionHead}>Balances over time</Overline>
      <Card>
        <BalanceChart history={history} symbol={symbol} />
      </Card>

      <Overline style={s.sectionHead}>Standings</Overline>
      <View style={s.panel}>
        {players.map((p, i) => {
          const avg = p.nightsPlayed > 0 ? Math.round(p.totalNetCents / p.nightsPlayed) : 0;
          return (
            <View key={p.playerId}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${p.name} stats`}
                onPress={() => router.push(`/player/${p.playerId}`)}
                style={({ pressed }) => [s.standingRow, pressed && { backgroundColor: colors.cardAlt }]}>
                <Text style={s.rank}>{i + 1}</Text>
                <Avatar name={p.name} playerId={p.playerId} size={32} />
                <View style={{ flex: 1, marginLeft: space.sm }}>
                  <Text style={s.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Caption tone="muted">
                    {p.nightsPlayed} night{p.nightsPlayed === 1 ? '' : 's'} · avg {formatSigned(avg, symbol)}
                  </Caption>
                </View>
                <MoneyText cents={p.totalNetCents} signed />
                <Text style={s.chevron}>›</Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <Overline style={s.sectionHead}>Nights</Overline>
      <View style={s.panel}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
          <View>
            <Row style={s.tableHead}>
              <Caption style={{ width: NIGHT_COL }}>Night</Caption>
              {players.map((p) => (
                <View key={p.playerId} style={s.playerHead}>
                  <Avatar name={p.name} playerId={p.playerId} size={24} />
                  <Caption numberOfLines={1} style={{ marginTop: 2 }}>
                    {p.name}
                  </Caption>
                </View>
              ))}
            </Row>
            <Divider />
            {[...nights].reverse().map((nt) => {
              const label = nt.session.title?.trim() ? nt.session.title : formatDate(nt.session.date);
              return (
                <Pressable
                  key={nt.session.id}
                  accessibilityRole="button"
                  onPress={() => router.push(`/session/${nt.session.id}`)}
                  style={({ pressed }) => [s.tableRow, pressed && { backgroundColor: colors.cardAlt }]}>
                  <View style={{ width: NIGHT_COL, paddingRight: space.sm }}>
                    <Text style={s.nightTitle} numberOfLines={1}>
                      {label}
                    </Text>
                    <Caption tone="muted" numberOfLines={1}>
                      {formatDate(nt.session.date)}
                    </Caption>
                  </View>
                  {players.map((p) => (
                    <View key={p.playerId} style={s.playerCell}>
                      {cellText(nt.nets[p.playerId])}
                    </View>
                  ))}
                </Pressable>
              );
            })}
            <Divider />
            <Row style={[s.tableRow, { backgroundColor: colors.cardAlt }]}>
              <Text style={[s.nightTitle, { width: NIGHT_COL }]}>Total</Text>
              {players.map((p) => (
                <View key={p.playerId} style={s.playerCell}>
                  {cellText(p.totalNetCents)}
                </View>
              ))}
            </Row>
          </View>
        </ScrollView>
      </View>
      <Body dim style={{ marginTop: space.sm }}>
        Tap a player for their stats, or a night to open it. “—” means absent or not cashed out.
      </Body>
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { marginTop: space.sm },
  sectionHead: { marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.xs },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  standingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md },
  chevron: { ...textStyles.headlineMd, color: colors.textMuted, marginLeft: space.sm },
  rank: { ...textStyles.labelMd, color: colors.textMuted, width: 20 },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text },
  tableHead: { paddingHorizontal: space.md, paddingVertical: space.sm, alignItems: 'flex-end' },
  playerHead: { width: PLAYER_COL, alignItems: 'flex-end' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
  playerCell: { width: PLAYER_COL, alignItems: 'flex-end' },
  nightTitle: { ...textStyles.labelMd, fontSize: 14, color: colors.text },
  cell: { ...textStyles.numericSm },
});
