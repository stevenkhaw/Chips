import React, { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Avatar, Body, Button, Caption, Card, Divider, NavHeader, Overline, Row, Screen, StatTile, toastError,
} from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { BalanceChart } from '@/components/BalanceChart';
import { PlayerShareCard, PLAYER_CARD_WIDTH } from '@/components/PlayerShareCard';
import { useSessionsStore } from '@/store/useSessionsStore';
import { usePlayersStore } from '@/store/usePlayersStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { buildHistory, playerStats, type History } from '@/domain/history';
import { formatSigned } from '@/domain/money';
import { buildPlayerShareText, captureAndShare, copyToClipboard } from '@/share';
import { formatDate } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const summaries = useSessionsStore((s) => s.summaries);
  const listDetails = useSessionsStore((s) => s.listDetails);
  const players = usePlayersStore((s) => s.players);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const cardRef = useRef<View>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [sharing, setSharing] = useState(false);

  // `summaries` is the change signal: every store mutation reloads it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const history = useMemo(() => buildHistory(listDetails()), [summaries, listDetails]);
  const stats = useMemo(() => (id ? playerStats(history, id) : null), [history, id]);
  const name = stats?.player.name ?? players.find((p) => p.id === id)?.name ?? 'Player';

  const doShare = async () => {
    if (cardHeight <= 0) return;
    setSharing(true);
    try {
      await captureAndShare(cardRef, `Share ${name}'s stats`);
    } catch (e) {
      toastError(e);
    } finally {
      setSharing(false);
    }
  };

  const doCopy = async () => {
    if (!stats) return;
    try {
      await copyToClipboard(buildPlayerShareText(stats, symbol));
      Alert.alert('Copied', `${name}'s stats copied to the clipboard.`);
    } catch (e) {
      toastError(e);
    }
  };

  if (!stats) {
    return (
      <Screen scroll>
        <NavHeader title={name} overline="Player" onBack={() => router.back()} />
        <Card>
          <Body dim>No nights yet. Stats show up here once {name} finishes a night.</Body>
        </Card>
      </Screen>
    );
  }

  const { player } = stats;
  const solo: History = { nights: history.nights, players: [player] };
  const record = `${stats.wins}W · ${stats.losses}L${stats.evens > 0 ? ` · ${stats.evens}E` : ''}`;
  const netColor = (v: number | null) => (v === null ? colors.textMuted : v > 0 ? colors.pos : v < 0 ? colors.neg : colors.textDim);

  return (
    <>
      <Screen scroll>
        <NavHeader
          title={name}
          overline="Player"
          onBack={() => router.back()}
          right={<Button label={sharing ? 'Sharing…' : 'Share'} size="md" onPress={doShare} disabled={sharing || cardHeight <= 0} />}
        />

        <Card>
          <Row>
            <Avatar name={player.name} playerId={player.playerId} size={48} />
            <View style={{ flex: 1, marginLeft: space.md }}>
              <Overline>All-time</Overline>
              <MoneyText cents={player.totalNetCents} signed variant="lg" />
              <Caption style={{ marginTop: 2 }}>
                {player.nightsPlayed} night{player.nightsPlayed === 1 ? '' : 's'} · {record}
              </Caption>
            </View>
          </Row>
        </Card>

        <Row style={s.tiles}>
          <StatTile label="Avg / night" value={formatSigned(stats.avgNetCents, symbol)} style={s.tile} />
          <StatTile
            label="Best"
            value={stats.bestNight?.netCents != null ? formatSigned(stats.bestNight.netCents, symbol) : '—'}
            style={s.tile}
          />
          <StatTile
            label="Worst"
            value={stats.worstNight?.netCents != null ? formatSigned(stats.worstNight.netCents, symbol) : '—'}
            style={[s.tile, { marginRight: 0 }]}
          />
        </Row>

        <Overline style={s.sectionHead}>Balance over time</Overline>
        <Card>
          <BalanceChart history={solo} symbol={symbol} />
        </Card>

        <Overline style={s.sectionHead}>Nights</Overline>
        <View style={s.panel}>
          {[...stats.nights].reverse().map((n, i) => {
            const label = n.session.title?.trim() ? n.session.title : formatDate(n.session.date);
            return (
              <View key={n.session.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(`/session/${n.session.id}`)}
                  style={({ pressed }) => [s.nightRow, pressed && { backgroundColor: colors.cardAlt }]}>
                  <View style={{ flex: 1, paddingRight: space.sm }}>
                    <Text style={s.nightTitle} numberOfLines={1}>
                      {label}
                    </Text>
                    <Caption tone="muted" numberOfLines={1}>
                      {formatDate(n.session.date)}
                    </Caption>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.nightNet, { color: netColor(n.netCents) }]}>
                      {n.netCents === null ? 'pending' : formatSigned(n.netCents, symbol)}
                    </Text>
                    {n.cumulativeCents !== null ? (
                      <Caption tone="muted">{formatSigned(n.cumulativeCents, symbol)} total</Caption>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
        <Body dim style={{ marginTop: space.sm }}>
          Tap a night to open it.
        </Body>

        <Row style={{ marginTop: space.xl }}>
          <Button
            label={sharing ? 'Sharing…' : 'Share Image'}
            onPress={doShare}
            disabled={sharing || cardHeight <= 0}
            style={{ flex: 1, marginRight: space.sm }}
          />
          <Button label="Copy Text" variant="secondary" onPress={doCopy} style={{ flex: 1 }} />
        </Row>
      </Screen>

      {/* Sibling of Screen's ScrollView, opaque, pushed offscreen: see settle.tsx for why. */}
      <View style={s.offscreen} pointerEvents="none">
        <PlayerShareCard
          ref={cardRef}
          stats={stats}
          history={history}
          symbol={symbol}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  tiles: { marginTop: space.md },
  tile: { flex: 1, marginRight: space.sm },
  sectionHead: { marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.xs },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  nightRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 56 },
  nightTitle: { ...textStyles.labelMd, fontSize: 15, color: colors.text },
  nightNet: { ...textStyles.numericMd },
  offscreen: { position: 'absolute', left: -PLAYER_CARD_WIDTH * 2, top: 0, opacity: 1 },
});
