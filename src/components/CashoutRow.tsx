import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Caption, IconButton } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { formatCents } from '@/domain/money';
import type { PlayerNetRow } from '@/domain/nets';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, space, textStyles } from '@/theme';

export function CashoutRow({
  row,
  onPress,
  onLongPress,
  onCountChips,
}: {
  row: PlayerNetRow;
  onPress: () => void;
  onLongPress: () => void;
  onCountChips?: () => void;
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const pending = row.cashoutCents === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cash-out for ${row.name}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.card, pending && s.cardPending, pressed && { borderColor: colors.accentBorder }]}>
      <Avatar name={row.name} seed={row.colorSeed} />
      <View style={s.middle}>
        <Text style={s.name} numberOfLines={1}>
          {row.name}
        </Text>
        <Caption>In: {formatCents(row.buyinCents, symbol)}</Caption>
      </View>
      <View style={s.right}>
        {pending ? (
          <Text style={s.placeholder}>Tap to enter</Text>
        ) : (
          <MoneyText cents={row.cashoutCents as number} color="accent" />
        )}
        {row.netCents === null ? (
          <Caption tone="muted">net —</Caption>
        ) : (
          <MoneyText cents={row.netCents} signed variant="sm" />
        )}
      </View>
      {onCountChips ? (
        <View style={s.chipBtn}>
          <IconButton glyph="🪙" onPress={onCountChips} accessibilityLabel="Count chips" variant="circle" />
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  cardPending: { borderStyle: 'dashed' },
  middle: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginBottom: 2 },
  right: { alignItems: 'flex-end' },
  placeholder: { ...textStyles.labelMd, color: colors.textMuted },
  chipBtn: { marginLeft: space.sm },
});
