import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Avatar, Banner, Body, Caption, Divider, NavHeader, Overline, Row, Screen } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { TransferRow } from '@/components/TransferRow';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { summarize } from '@/domain/nets';
import { formatCents, formatSigned } from '@/domain/money';
import { formatDate } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

export default function SettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detail = useSessionsStore((s) => s.detail);
  const open = useSessionsStore((s) => s.open);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (id && detail?.session.id !== id) open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const math = useMemo(() => (detail ? summarize(detail) : null), [detail]);
  if (!detail || !math || detail.session.id !== id) {
    return (
      <Screen>
        <Body dim>Loading…</Body>
      </Screen>
    );
  }

  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const seedOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.colorSeed ?? 0;
  const disc = math.settlement.discrepancyCents;
  const balanced = disc === 0 && math.pendingCount === 0;
  const results = [...math.rows]
    .filter((r) => r.netCents !== null)
    .sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));
  const count = math.settlement.transfers.length;
  const nightTitle = detail.session.title?.trim() ? detail.session.title : formatDate(detail.session.date);

  return (
    <Screen scroll>
      <NavHeader
        overline={nightTitle}
        overlineTone={balanced ? 'accent' : 'dim'}
        title="Settlements"
        onBack={() => router.back()}
        right={
          <View style={[s.statusDisc, balanced ? s.statusOk : s.statusWarn]}>
            <Text style={[s.statusGlyph, { color: balanced ? colors.accent : colors.warn }]}>
              {balanced ? '✓' : '!'}
            </Text>
          </View>
        }
      />

      <Row style={s.totalCard}>
        <View style={s.coin}>
          <Text style={s.coinGlyph}>{symbol}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Overline>Total cash handled</Overline>
          <Caption tone={balanced ? 'dim' : 'muted'}>
            {balanced
              ? 'Balanced pot pool'
              : disc !== 0
                ? `Off by ${formatCents(Math.abs(disc), symbol)}`
                : `${math.pendingCount} still to cash out`}
          </Caption>
        </View>
        <MoneyText cents={math.totalBuyinCents} variant="lg" color="accent" />
      </Row>

      {math.pendingCount > 0 ? (
        <Banner
          kind="info"
          text={`${math.pendingCount} player${math.pendingCount === 1 ? '' : 's'} not cashed out — excluded below`}
          style={{ marginTop: space.md }}
        />
      ) : null}
      {disc !== 0 ? (
        <Banner
          kind="warn"
          text={`Books off by ${formatCents(Math.abs(disc), symbol)} (${disc > 0 ? 'too much cashed out' : 'cash missing'})`}
          style={{ marginTop: space.md }}
        />
      ) : null}

      <Row style={s.sectionHead}>
        <Overline>Fewest transfers required</Overline>
        <View style={{ flex: 1 }} />
        <View style={s.badge}>
          <Text style={s.badgeLabel}>
            {count} transaction{count === 1 ? '' : 's'}
          </Text>
        </View>
      </Row>

      {count === 0 ? (
        <Body dim>Nobody owes anything.</Body>
      ) : (
        math.settlement.transfers.map((t, i) => (
          <TransferRow
            key={`${t.from}-${t.to}-${i}`}
            fromName={nameOf(t.from)}
            fromSeed={seedOf(t.from)}
            toName={nameOf(t.to)}
            toSeed={seedOf(t.to)}
            amountCents={t.amountCents}
          />
        ))
      )}

      <Overline style={{ marginTop: space.xl, marginBottom: space.sm }}>Results</Overline>
      <View style={s.panel}>
        {results.map((r, i) => (
          <View key={r.playerId}>
            {i > 0 ? <Divider /> : null}
            <Row style={s.resultRow}>
              <Avatar name={r.name} seed={r.colorSeed} size={28} />
              <Text style={s.resultName} numberOfLines={1}>
                {r.name}
              </Text>
              <View style={{ flex: 1 }} />
              <MoneyText cents={r.netCents ?? 0} signed />
            </Row>
          </View>
        ))}
        {results.length === 0 ? (
          <Row style={s.resultRow}>
            <Body dim>No cash-outs entered yet.</Body>
          </Row>
        ) : null}
      </View>

      <Pressable onPress={() => setShowDetails((v) => !v)} style={s.detailsToggle} accessibilityRole="button">
        <Overline>{showDetails ? 'Details ▾' : 'Details ▸'}</Overline>
      </Pressable>
      {showDetails ? (
        <View style={s.panel}>
          <Row style={s.detailRow}>
            <Caption style={s.colName}>Player</Caption>
            <Caption style={s.col}>In</Caption>
            <Caption style={s.col}>Out</Caption>
            <Caption style={s.col}>Net</Caption>
          </Row>
          <Divider />
          {math.rows.map((r, i) => (
            <View key={r.playerId}>
              {i > 0 ? <Divider /> : null}
              <Row style={s.detailRow}>
                <Text style={[s.cell, s.colName]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[s.cell, s.col]}>{formatCents(r.buyinCents, symbol)}</Text>
                <Text style={[s.cell, s.col]}>
                  {r.cashoutCents === null ? '—' : formatCents(r.cashoutCents, symbol)}
                </Text>
                <Text style={[s.cell, s.col]}>{r.netCents === null ? '—' : formatSigned(r.netCents, symbol)}</Text>
              </Row>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  statusDisc: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusOk: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  statusWarn: { backgroundColor: colors.warnSoft, borderColor: colors.warnBorder },
  statusGlyph: { ...textStyles.labelMd, fontSize: 16 },
  totalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  coin: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.orangeSoft,
    borderWidth: 1,
    borderColor: colors.orangeBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinGlyph: { ...textStyles.labelMd, fontSize: 16, color: colors.orange },
  sectionHead: { marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.xs },
  badge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 2,
  },
  badgeLabel: { ...textStyles.labelCaps, color: colors.accent },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  resultRow: { paddingHorizontal: space.md, paddingVertical: space.md },
  resultName: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginLeft: space.sm, flexShrink: 1 },
  detailsToggle: { marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.xs },
  detailRow: { paddingHorizontal: space.md, paddingVertical: space.sm },
  cell: { ...textStyles.numericSm, color: colors.text },
  colName: { flex: 2 },
  col: { flex: 1, textAlign: 'right' },
});
