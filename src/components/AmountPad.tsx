import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Overline, Row } from '@/components/ui';
import { formatCents, parseMoneyInput } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, sheetShadow, space, textStyles } from '@/theme';

export function AmountPad({
  visible,
  title,
  initialCents,
  allowZero = false,
  confirmLabel = 'Save',
  onConfirm,
  onCancel,
  onDelete,
  extraAction,
}: {
  visible: boolean;
  title: string;
  initialCents: number | null;
  allowZero?: boolean;
  confirmLabel?: string;
  onConfirm: (cents: number) => void;
  onCancel: () => void;
  onDelete?: () => void;
  extraAction?: { label: string; onPress: () => void };
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText(initialCents === null ? '' : formatCents(initialCents, ''));
  }, [visible, initialCents]);

  const cents = parseMoneyInput(text);
  const valid = cents !== null && (allowZero ? cents >= 0 : cents > 0);
  const submit = () => {
    if (valid && cents !== null) onConfirm(cents);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={s.scrim} onPress={onCancel} accessibilityLabel="Dismiss" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <Overline style={{ marginBottom: space.md }}>{title}</Overline>
          <Row style={s.well}>
            <Text style={s.symbol}>{symbol}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              keyboardType="decimal-pad"
              selectTextOnFocus
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={submit}
              style={s.input}
            />
          </Row>
          {extraAction ? (
            <Button label={extraAction.label} variant="secondary" onPress={extraAction.onPress} style={{ marginTop: space.md }} />
          ) : null}
          {onDelete ? (
            <Button label="Remove" variant="ghost" onPress={onDelete} size="md" style={{ marginTop: space.md }} />
          ) : null}
          <Row style={{ marginTop: space.md }}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1, marginRight: space.sm }} />
            <Button label={confirmLabel} onPress={submit} disabled={!valid} style={{ flex: 1 }} />
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
    ...sheetShadow,
  },
  well: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  symbol: { ...textStyles.numericLg, color: colors.textDim, marginRight: space.sm },
  input: { ...textStyles.numericLg, color: colors.text, flex: 1, paddingVertical: space.md },
});
