import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Caption, Pill, Row } from '@/components/ui';
import { formatCents } from '@/domain/money';
import type { PlayerNetRow } from '@/domain/nets';
import type { Buyin } from '@/domain/types';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, space, TAP, textStyles } from '@/theme';

export function BuyinRow({
  row,
  buyins,
  onAddDefault,
  onCustomBuyin,
  onEditBuyin,
  onLongPress,
}: {
  row: PlayerNetRow;
  buyins: Buyin[];
  onAddDefault: () => void;
  onCustomBuyin: () => void;
  onEditBuyin: (b: Buyin) => void;
  onLongPress: () => void;
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  return (
    <Pressable
      accessibilityLabel={`${row.name}, bought in for ${formatCents(row.buyinCents, symbol)}`}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.card, pressed && { borderColor: colors.orangeBorder }]}>
      <Avatar name={row.name} seed={row.colorSeed} />
      <View style={s.middle}>
        <Text style={s.name} numberOfLines={1}>
          {row.name}
        </Text>
        <Row style={s.pills}>
          <Caption style={{ marginRight: space.xs, marginBottom: space.xs }}>In:</Caption>
          {buyins.length === 0 ? (
            <Caption tone="muted" style={{ marginBottom: space.xs }}>
              —
            </Caption>
          ) : (
            buyins.map((b) => (
              <Pill
                key={b.id}
                label={formatCents(b.amountCents, symbol)}
                onPress={() => onEditBuyin(b)}
                style={s.buyinPill}
              />
            ))
          )}
        </Row>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add buy-in for ${row.name}`}
        onPress={onAddDefault}
        onLongPress={onCustomBuyin}
        style={({ pressed }) => [s.plus, pressed && { opacity: 0.8 }]}>
        <Text style={s.plusGlyph}>+</Text>
      </Pressable>
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
  middle: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginBottom: space.xs },
  pills: { flexWrap: 'wrap' },
  buyinPill: { paddingHorizontal: space.sm, paddingVertical: 2, marginRight: space.xs, marginBottom: space.xs },
  plus: {
    width: TAP,
    height: TAP,
    borderRadius: radius.md,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusGlyph: { ...textStyles.headlineMd, color: colors.onOrange, fontSize: 24, lineHeight: 28 },
});
