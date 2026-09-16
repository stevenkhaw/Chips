import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Overline, Pill, Row } from '@/components/ui';
import type { Player } from '@/domain/types';
import { parseMoneyInput } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, sheetShadow, space, textStyles } from '@/theme';

export function PaymentSheet({
  visible,
  players,
  onSave,
  onCancel,
}: {
  visible: boolean;
  players: Player[];
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

            <Overline style={{ marginTop: space.md, marginBottom: space.sm }}>To</Overline>
            <Row style={s.pillWrap}>
              {players
                .filter((p) => p.id !== fromId)
                .map((p) => (
                  <Pill key={p.id} label={p.name} tone={toId === p.id ? 'accent' : 'default'} onPress={() => setToId(p.id)} />
                ))}
            </Row>

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
