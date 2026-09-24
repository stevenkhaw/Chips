import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Avatar, Banner, Body, Button, Caption, Divider, NavHeader, Overline, Row, Screen, toastError } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { TransferRow } from '@/components/TransferRow';
import { PaymentRow } from '@/components/PaymentRow';
import { PaymentSheet } from '@/components/PaymentSheet';
import { ShareCard, SHARE_CARD_WIDTH } from '@/components/ShareCard';
import { buildShareText, captureAndShare, copyToClipboard } from '@/share';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useCanEdit } from '@/store/useHousesStore';
import { summarize } from '@/domain/nets';
import { formatCents, formatSigned } from '@/domain/money';
import { formatDate } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

export default function SettleScreen() {
  const { id, share } = useLocalSearchParams<{ id: string; share?: string }>();
  const router = useRouter();
  const detail = useSessionsStore((s) => s.detail);
  const open = useSessionsStore((s) => s.open);
  const addPayment = useSessionsStore((s) => s.addPayment);
  const removePayment = useSessionsStore((s) => s.removePayment);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const canEdit = useCanEdit();
  const [showDetails, setShowDetails] = useState(false);
  const [paymentSheetVisible, setPaymentSheetVisible] = useState(false);
  const cardRef = useRef<View>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [sharing, setSharing] = useState(false);
  const autoShared = useRef(false);
  const { width } = useWindowDimensions();
  const previewWidth = width - space.lg * 2;
  const previewScale = previewWidth / SHARE_CARD_WIDTH;

  useEffect(() => {
    if (id && detail?.session.id !== id) open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const math = useMemo(() => (detail ? summarize(detail) : null), [detail]);

  const doShare = async () => {
    setSharing(true);
    try {
      await captureAndShare(cardRef);
    } catch (e) {
      toastError(e);
    } finally {
      setSharing(false);
    }
  };

  const doCopy = async () => {
    if (!detail || !math) return;
    try {
      await copyToClipboard(buildShareText(detail, math, symbol));
      Alert.alert('Copied', 'Settlement text copied to the clipboard.');
    } catch (e) {
      toastError(e);
    }
  };

  const markPaid = (t: { from: string; to: string; amountCents: number }) => {
    try {
      addPayment({ fromPlayerId: t.from, toPlayerId: t.to, amountCents: t.amountCents });
    } catch (e) {
      toastError(e);
    }
  };

  const removePaymentSafe = (paymentId: string) => {
    try {
      removePayment(paymentId);
    } catch (e) {
      toastError(e);
    }
  };

  const savePayment = (input: { fromPlayerId: string; toPlayerId: string; amountCents: number; note: string | null }) => {
    try {
      addPayment(input);
      setPaymentSheetVisible(false);
    } catch (e) {
      toastError(e);
    }
  };

  useEffect(() => {
    if (autoShared.current || share !== '1' || cardHeight <= 0 || !math || detail?.session.id !== id) return;
    autoShared.current = true;
    // The offscreen card has measured a height, but let the frame commit before capturing it.
    const t = setTimeout(doShare, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share, cardHeight, math, detail?.session.id, id]);

  if (!detail || !math || detail.session.id !== id) {
    return (
      <Screen>
        <Body dim>Loading…</Body>
      </Screen>
    );
  }

  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const disc = math.settlement.discrepancyCents;
  const balanced = disc === 0 && math.pendingCount === 0;
  const results = [...math.rows]
    .filter((r) => r.netCents !== null)
    .sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));
  const count = math.settlement.transfers.length;

  const explainStatus = () => {
    if (balanced) {
      Alert.alert('Books balanced', 'Everyone has cashed out and cash-outs match buy-ins. Settle up below.');
      return;
    }
    const lines: string[] = [];
    if (math.pendingCount > 0) {
      lines.push(
        `${math.pendingCount} player${math.pendingCount === 1 ? ' has' : 's have'} not cashed out yet and ${
          math.pendingCount === 1 ? 'is' : 'are'
        } left out of the transfers below.`,
      );
    }
    if (disc !== 0) {
      lines.push(
        `Cash-outs are off by ${formatCents(Math.abs(disc), symbol)}: ${
          disc > 0 ? 'more was cashed out than bought in' : 'less was cashed out than bought in'
        }. Check the buy-ins and cash-outs.`,
      );
    }
    Alert.alert('Not balanced yet', lines.join('\n\n'));
  };
  const nightTitle = detail.session.title?.trim() ? detail.session.title : formatDate(detail.session.date);

  return (
    <>
      <Screen
        scroll
        footer={
          <>
            <Button label={sharing ? 'Preparing…' : 'Share image'} onPress={doShare} disabled={sharing} />
            <Button label="Copy to clipboard" variant="secondary" size="md" onPress={doCopy} style={{ marginTop: space.sm }} />
          </>
        }>
        <NavHeader
          overline={nightTitle}
          overlineTone={balanced ? 'accent' : 'dim'}
          title="Settlements"
          onBack={() => router.back()}
          right={
            <Pressable
              onPress={explainStatus}
              accessibilityRole="button"
              accessibilityLabel={balanced ? 'Books balanced' : 'Books not balanced'}
              accessibilityHint="Explains the settlement status"
              style={({ pressed }) => [s.statusDisc, balanced ? s.statusOk : s.statusWarn, pressed && { opacity: 0.7 }]}>
              <Text style={[s.statusGlyph, { color: balanced ? colors.accent : colors.warn }]}>
                {balanced ? '✓' : '!'}
              </Text>
            </Pressable>
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

        {detail.payments.length > 0 ? (
          <>
            <Row style={s.sectionHead}>
              <Overline>Already paid</Overline>
            </Row>
            {detail.payments.map((p) => (
              <PaymentRow
                key={p.id}
                fromName={nameOf(p.fromPlayerId)}
                fromId={p.fromPlayerId}
                toName={nameOf(p.toPlayerId)}
                toId={p.toPlayerId}
                amountCents={p.amountCents}
                note={p.note}
                onDelete={canEdit ? () => removePaymentSafe(p.id) : undefined}
              />
            ))}
          </>
        ) : null}

        {canEdit ? (
          <Button
            label="+ Log a payment"
            variant="secondary"
            size="md"
            onPress={() => setPaymentSheetVisible(true)}
            style={{ marginTop: space.md }}
          />
        ) : null}

        <Row style={s.sectionHead}>
          <Overline>Still owed</Overline>
          <View style={{ flex: 1 }} />
          <View style={s.badge}>
            <Text style={s.badgeLabel}>
              {count} left{math.paidCount > 0 ? ` · ${math.paidCount} paid` : ''}
            </Text>
          </View>
        </Row>

        {count === 0 ? (
          <Body dim>{math.paidCount > 0 ? 'All settled ✓' : 'Nobody owes anything.'}</Body>
        ) : (
          math.settlement.transfers.map((t, i) => (
            <TransferRow
              key={`${t.from}-${t.to}-${i}`}
              fromName={nameOf(t.from)}
              fromId={t.from}
              toName={nameOf(t.to)}
              toId={t.to}
              amountCents={t.amountCents}
              onMarkPaid={canEdit ? () => markPaid(t) : undefined}
            />
          ))
        )}

        <Overline style={{ marginTop: space.xl, marginBottom: space.sm }}>Results</Overline>
        <View style={s.panel}>
          {results.map((r, i) => (
            <View key={r.playerId}>
              {i > 0 ? <Divider /> : null}
              <Row style={s.resultRow}>
                <Avatar name={r.name} playerId={r.playerId} size={28} />
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

        <Row style={s.sectionHead}>
          <Overline>Message card</Overline>
          <View style={{ flex: 1 }} />
          <Caption tone="muted">Live preview</Caption>
        </Row>
        <View style={[s.preview, { width: previewWidth, height: Math.max(cardHeight * previewScale, 120) }]}>
          <View
            pointerEvents="none"
            style={{ width: SHARE_CARD_WIDTH, transform: [{ scale: previewScale }], transformOrigin: 'top left' }}>
            <ShareCard detail={detail} math={math} symbol={symbol} />
          </View>
        </View>
      </Screen>

      {/* A sibling of Screen's ScrollView (not a clipped child of it), fully opaque but
          pushed far offscreen: captureRef's iOS useRenderInContext path needs an opaque,
          on-hierarchy view to reliably produce a non-blank image. */}
      <View style={s.offscreen} pointerEvents="none">
        <ShareCard
          ref={cardRef}
          detail={detail}
          math={math}
          symbol={symbol}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        />
      </View>

      <PaymentSheet
        visible={paymentSheetVisible}
        players={detail.players.map((p) => p.player)}
        math={math}
        onSave={savePayment}
        onCancel={() => setPaymentSheetVisible(false)}
      />
    </>
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
  preview: { overflow: 'hidden', borderRadius: radius.lg, marginBottom: space.md },
  offscreen: { position: 'absolute', left: -SHARE_CARD_WIDTH * 2, top: 0, opacity: 1 },
});
