import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Body, Button, Caption, NavHeader, Overline, Row, Screen } from '@/components/ui';
import { chipsToCents } from '@/domain/chips';
import { formatCents } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, fonts, radius, space, TAP, textStyles } from '@/theme';

export function ChipSheet({
  visible,
  playerName,
  onUse,
  onCancel,
}: {
  visible: boolean;
  playerName: string;
  onUse: (cents: number) => void;
  onCancel: () => void;
}) {
  const denoms = useSettingsStore((s) => s.denoms);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (visible) setCounts({});
  }, [visible]);

  const total = useMemo(() => chipsToCents(counts, denoms), [counts, denoms]);
  const setCount = (id: string, n: number) =>
    setCounts((c) => ({ ...c, [id]: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0 }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <Screen
        footer={
          <>
            <Button label={`Apply to ${playerName}'s cash-out`} onPress={() => onUse(total)} />
            <Button label="Cancel" variant="ghost" size="md" onPress={onCancel} style={{ marginTop: space.sm }} />
          </>
        }>
        <NavHeader overline="Chip counter" overlineTone="accent" title={`${playerName}'s chips`} onClose={onCancel} />

        <Row style={{ marginBottom: space.md }}>
          <View style={{ flex: 1 }}>
            <Overline>Chip by colour counter</Overline>
            <Caption tone="muted">Tap + or − to tally the stack</Caption>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Overline>Tally total</Overline>
            <Text style={s.total}>{formatCents(total, symbol)}</Text>
          </View>
        </Row>

        {denoms.length === 0 ? (
          <Body dim>No chip denominations yet. Add them in Settings.</Body>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {denoms.map((d) => {
              const count = counts[d.id] ?? 0;
              return (
                <Row key={d.id} style={s.row}>
                  <View style={[s.badge, { backgroundColor: d.colorHex }]}>
                    <View style={s.badgeRing} />
                  </View>
                  <View style={s.labels}>
                    <Text style={s.label}>{d.label}</Text>
                    <Text style={s.value}>Value: {formatCents(d.valueCents, symbol)}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`One less ${d.label} chip`}
                    onPress={() => setCount(d.id, count - 1)}
                    style={({ pressed }) => [s.step, s.stepMinus, pressed && { opacity: 0.7 }]}>
                    <Text style={s.stepMinusGlyph}>−</Text>
                  </Pressable>
                  <TextInput
                    value={String(count)}
                    onChangeText={(t) => setCount(d.id, parseInt(t, 10))}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    accessibilityLabel={`${d.label} chip count`}
                    style={s.count}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`One more ${d.label} chip`}
                    onPress={() => setCount(d.id, count + 1)}
                    style={({ pressed }) => [s.step, s.stepPlus, pressed && { opacity: 0.85 }]}>
                    <Text style={s.stepPlusGlyph}>+</Text>
                  </Pressable>
                </Row>
              );
            })}
            <Caption tone="muted" style={{ marginTop: space.sm }}>
              Counts are never saved — only the total is written to the cash-out.
            </Caption>
          </ScrollView>
        )}
      </Screen>
    </Modal>
  );
}

const s = StyleSheet.create({
  total: { ...textStyles.numericLg, color: colors.accent },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.bg, opacity: 0.4 },
  labels: { flex: 1, marginLeft: space.md },
  label: { ...textStyles.labelMd, fontSize: 15, color: colors.text },
  value: { ...textStyles.bodySm, fontFamily: fonts.mono, color: colors.textDim },
  step: { width: TAP, height: TAP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stepMinus: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  stepPlus: { backgroundColor: colors.orange },
  stepMinusGlyph: { ...textStyles.headlineMd, color: colors.textDim },
  stepPlusGlyph: { ...textStyles.headlineMd, color: colors.onOrange },
  count: {
    width: 44,
    textAlign: 'center',
    ...textStyles.numericMd,
    fontFamily: fonts.mono,
    color: colors.text,
    paddingVertical: space.xs,
  },
});
