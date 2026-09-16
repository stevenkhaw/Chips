import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Body, Button, Caption, Divider, NavHeader, Overline, Row, Screen, toastError,
} from '@/components/ui';
import { AmountPad } from '@/components/AmountPad';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCents, parseMoneyInput } from '@/domain/money';
import type { ChipDenom } from '@/domain/types';
import { CHIP_SWATCHES, colors, radius, space, textStyles } from '@/theme';

type DenomDraft = { id: string | null; label: string; colorHex: string; valueText: string };

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const denoms = useSettingsStore((s) => s.denoms);
  const setDefaultBuyin = useSettingsStore((s) => s.setDefaultBuyin);
  const addDenom = useSettingsStore((s) => s.addDenom);
  const updateDenom = useSettingsStore((s) => s.updateDenom);
  const removeDenom = useSettingsStore((s) => s.removeDenom);
  const reorderDenoms = useSettingsStore((s) => s.reorderDenoms);

  const [buyinPad, setBuyinPad] = useState(false);
  const [draft, setDraft] = useState<DenomDraft | null>(null);

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toastError(e);
    }
  };

  const saveDenom = () => {
    if (!draft) return;
    const valueCents = parseMoneyInput(draft.valueText);
    if (valueCents === null || valueCents <= 0) {
      toastError(new Error('Enter a chip value greater than zero'));
      return;
    }
    safe(() => {
      if (draft.id) updateDenom(draft.id, { label: draft.label.trim(), colorHex: draft.colorHex, valueCents });
      else addDenom({ label: draft.label.trim(), colorHex: draft.colorHex, valueCents });
      setDraft(null);
    });
  };

  const move = (d: ChipDenom, dir: -1 | 1) => {
    const ids = denoms.map((x) => x.id);
    const i = ids.indexOf(d.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    safe(() => reorderDenoms(ids));
  };

  const onLongPress = (d: ChipDenom) =>
    Alert.alert(d.label, undefined, [
      { text: 'Move up', onPress: () => move(d, -1) },
      { text: 'Move down', onPress: () => move(d, 1) },
      { text: 'Delete', style: 'destructive', onPress: () => safe(() => removeDenom(d.id)) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <Screen scroll>
      <NavHeader title="Settings" onBack={() => router.back()} />

      <Overline style={{ marginBottom: space.sm }}>Default buy-in</Overline>
      <Pressable
        accessibilityRole="button"
        onPress={() => setBuyinPad(true)}
        style={({ pressed }) => [s.panel, s.rowCard, pressed && { backgroundColor: colors.cardAlt }]}>
        <View style={{ flex: 1 }}>
          <Body>Amount added when you tap +</Body>
          <Caption tone="muted">Applies to new nights; each night keeps its own value.</Caption>
        </View>
        <Text style={s.value}>{formatCents(settings.defaultBuyinCents, settings.currencySymbol)}</Text>
      </Pressable>

      <Overline style={{ marginTop: space.xl, marginBottom: space.sm }}>Chip denominations</Overline>
      <Caption tone="muted" style={{ marginBottom: space.sm }}>
        Optional. With at least one denomination the cash-out pad offers "Use chips". Tap to edit,
        long-press to reorder or delete.
      </Caption>

      {denoms.length > 0 ? (
        <View style={s.panel}>
          {denoms.map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={d.label}
                onPress={() =>
                  setDraft({ id: d.id, label: d.label, colorHex: d.colorHex, valueText: formatCents(d.valueCents, '') })
                }
                onLongPress={() => onLongPress(d)}
                style={({ pressed }) => [s.denomRow, pressed && { backgroundColor: colors.cardAlt }]}>
                <View style={[s.badge, { backgroundColor: d.colorHex }]}>
                  <View style={s.badgeRing} />
                </View>
                <Text style={s.denomLabel} numberOfLines={1}>
                  {d.label}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={s.value}>{formatCents(d.valueCents, settings.currencySymbol)}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Button
        label="+ Add denomination"
        variant="secondary"
        size="md"
        onPress={() => setDraft({ id: null, label: '', colorHex: CHIP_SWATCHES[1], valueText: '' })}
        style={{ marginTop: space.md }}
      />

      <AmountPad
        visible={buyinPad}
        title="Default buy-in"
        initialCents={settings.defaultBuyinCents}
        onCancel={() => setBuyinPad(false)}
        onConfirm={(c) => {
          safe(() => setDefaultBuyin(c));
          setBuyinPad(false);
        }}
      />

      <Modal visible={draft !== null} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <View style={s.scrim}>
          <View style={s.dialog}>
            <Overline style={{ marginBottom: space.md }}>{draft?.id ? 'Edit chip' : 'New chip'}</Overline>
            <TextInput
              value={draft?.label ?? ''}
              onChangeText={(t) => setDraft((d) => (d ? { ...d, label: t } : d))}
              placeholder="Label (e.g. Red)"
              placeholderTextColor={colors.textMuted}
              style={s.input}
              returnKeyType="done"
            />
            <Row style={[s.input, { marginTop: space.md, paddingVertical: 0 }]}>
              <Text style={s.symbol}>{settings.currencySymbol}</Text>
              <TextInput
                value={draft?.valueText ?? ''}
                onChangeText={(t) => setDraft((d) => (d ? { ...d, valueText: t } : d))}
                keyboardType="decimal-pad"
                placeholder="Value per chip"
                placeholderTextColor={colors.textMuted}
                style={s.valueInput}
                returnKeyType="done"
              />
            </Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
              {CHIP_SWATCHES.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={`Colour ${c}`}
                  onPress={() => setDraft((d) => (d ? { ...d, colorHex: c } : d))}
                  style={[
                    s.swatch,
                    { backgroundColor: c, borderColor: draft?.colorHex === c ? colors.accent : colors.border, borderWidth: draft?.colorHex === c ? 3 : 1 },
                  ]}
                />
              ))}
            </ScrollView>
            <Row style={{ marginTop: space.lg }}>
              <Button label="Cancel" variant="secondary" onPress={() => setDraft(null)} style={{ flex: 1, marginRight: space.sm }} />
              <Button
                label="Save"
                onPress={saveDenom}
                disabled={!draft?.label.trim() || !draft?.valueText.trim()}
                style={{ flex: 1 }}
              />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', padding: space.lg },
  denomRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space.md },
  denomLabel: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginLeft: space.md },
  value: { ...textStyles.numericMd, color: colors.text },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.bg, opacity: 0.4 },
  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.lg,
  },
  input: {
    ...textStyles.bodyLg,
    color: colors.text,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  symbol: { ...textStyles.bodyLg, color: colors.textDim, marginRight: space.xs },
  valueInput: { ...textStyles.bodyLg, color: colors.text, flex: 1, paddingVertical: space.md },
  swatch: { width: 40, height: 40, borderRadius: 20, marginRight: space.md },
});
