import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Caption, Overline, Pill, Row } from '@/components/ui';
import type { Player } from '@/domain/types';
import type { SessionSummaryMath } from '@/domain/nets';
import { paymentHint } from '@/domain/paymentHint';
import { formatCents, parseMoneyInput } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, sheetShadow, space, textStyles } from '@/theme';

export function PaymentSheet({
  visible,
  players,
  math,
  onSave,
  onCancel,
}: {
  visible: boolean;
  players: Player[];
  /** Current session math; drives the "still owes / still owed" hints and the suggested amount. */
  math: SessionSummaryMath;
  onSave: (input: { fromPlayerId: string; toPlayerId: string; amountCents: number; note: string | null }) => void;
  onCancel: () => void;
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setFromId(null);
      setToId(null);
      setAmountText('');
      setNote('');
    }
  }, [visible]);

  const amountCents = parseMoneyInput(amountText);
  const valid = !!fromId && !!toId && amountCents !== null && amountCents > 0;

  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? '?';
  const hint = useMemo(() => paymentHint(math, fromId, toId), [math, fromId, toId]);
  const money = (c: number) => formatCents(c, symbol);

  const fromLine = !fromId
    ? null
    : hint.fromOwesCents === null
      ? `${nameOf(fromId)} hasn't cashed out yet`
      : hint.fromOwesCents === 0
        ? `${nameOf(fromId)} owes nothing — payments usually go the other way`
        : `${nameOf(fromId)} still owes ${money(hint.fromOwesCents)}`;
  const toLine = !toId
    ? null
    : hint.toOwedCents === null
      ? `${nameOf(toId)} hasn't cashed out yet`
      : hint.toOwedCents === 0
        ? `${nameOf(toId)} is owed nothing`
        : `${nameOf(toId)} is still owed ${money(hint.toOwedCents)}`;

  const typed = amountCents ?? 0;
  const overFrom = hint.fromOwesCents !== null && typed > hint.fromOwesCents;
  const overTo = hint.toOwedCents !== null && typed > hint.toOwedCents;
  const afterLine =
    fromId && toId && typed > 0 && hint.fromOwesCents !== null && hint.toOwedCents !== null
      ? `After this: ${nameOf(fromId)} owes ${money(Math.max(0, hint.fromOwesCents - typed))} · ${nameOf(toId)} owed ${money(
          Math.max(0, hint.toOwedCents - typed),
        )}`
      : null;

  const pickFrom = (id: string) => {
    setFromId(id);
    if (toId === id) setToId(null);
  };

  const save = () => {
    if (!valid || !fromId || !toId || amountCents === null) return;
    const trimmed = note.trim();
    onSave({ fromPlayerId: fromId, toPlayerId: toId, amountCents, note: trimmed ? trimmed : null });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={s.scrim} onPress={onCancel} accessibilityLabel="Dismiss" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <Overline style={{ marginBottom: space.md }}>Log a payment</Overline>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Overline style={{ marginBottom: space.sm }}>From</Overline>
            <Row style={s.pillWrap}>
              {players.map((p) => (
                <Pill key={p.id} label={p.name} tone={fromId === p.id ? 'accent' : 'default'} onPress={() => pickFrom(p.id)} />
              ))}
            </Row>
            {fromLine ? (
              <Caption tone={hint.fromOwesCents ? 'dim' : 'muted'} style={s.hintLine}>
                {fromLine}
              </Caption>
            ) : null}

            <Overline style={{ marginTop: space.md, marginBottom: space.sm }}>To</Overline>
            <Row style={s.pillWrap}>
              {players
                .filter((p) => p.id !== fromId)
                .map((p) => (
                  <Pill key={p.id} label={p.name} tone={toId === p.id ? 'accent' : 'default'} onPress={() => setToId(p.id)} />
                ))}
            </Row>
            {toLine ? (
              <Caption tone={hint.toOwedCents ? 'dim' : 'muted'} style={s.hintLine}>
                {toLine}
              </Caption>
            ) : null}

            {fromId && toId && hint.suggestedCents !== null && hint.suggestedCents > 0 ? (
              <Row style={s.suggest}>
                <View style={{ flex: 1 }}>
                  <Text style={s.suggestTitle}>
                    {nameOf(fromId)} → {nameOf(toId)}
                  </Text>
                  <Caption tone="dim">{money(hint.suggestedCents)} settles this pair</Caption>
                </View>
                <Pill
                  label={`Use ${money(hint.suggestedCents)}`}
                  tone="accent"
                  onPress={() => setAmountText(formatCents(hint.suggestedCents ?? 0, ''))}
                />
              </Row>
            ) : null}

            <Overline style={{ marginTop: space.md, marginBottom: space.sm }}>Amount</Overline>
            <Row style={s.well}>
              <Text style={s.symbol}>{symbol}</Text>
              <TextInput
                value={amountText}
                onChangeText={setAmountText}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                style={s.input}
              />
            </Row>
            {afterLine ? (
              <Caption style={[s.hintLine, (overFrom || overTo) && { color: colors.warn }]}>
                {afterLine}
                {overFrom ? ` — more than ${nameOf(fromId)} owes` : overTo ? ` — more than ${nameOf(toId)} is owed` : ''}
              </Caption>
            ) : null}

            <Overline style={{ marginTop: space.md, marginBottom: space.sm }}>Note (optional)</Overline>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. Venmo"
              placeholderTextColor={colors.textMuted}
              style={s.noteInput}
              returnKeyType="done"
            />
          </ScrollView>

          <Row style={{ marginTop: space.lg }}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1, marginRight: space.sm }} />
            <Button label="Save" onPress={save} disabled={!valid} style={{ flex: 1 }} />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    padding: space.lg,
    paddingBottom: space.xxl,
    maxHeight: '85%',
    ...sheetShadow,
  },
  pillWrap: { flexWrap: 'wrap' },
  hintLine: { marginTop: space.xs, paddingHorizontal: space.xs },
  suggest: {
    marginTop: space.md,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  suggestTitle: { ...textStyles.labelMd, color: colors.text },
  well: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  symbol: { ...textStyles.numericLg, color: colors.textDim, marginRight: space.sm },
  input: { ...textStyles.numericLg, color: colors.text, flex: 1, paddingVertical: space.md },
  noteInput: {
    ...textStyles.bodyLg,
    color: colors.text,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
