import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Row } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { colors, radius, space, TAP, textStyles } from '@/theme';

export function TransferRow({
  fromName,
  fromId,
  toName,
  toId,
  amountCents,
  onMarkPaid,
}: {
  fromName: string;
  fromId: string;
  toName: string;
  toId: string;
  amountCents: number;
  onMarkPaid?: () => void;
}) {
  return (
    <View style={s.card} accessibilityLabel={`${fromName} pays ${toName}`}>
      <Row>
        <Avatar name={fromName} playerId={fromId} size={28} />
        <Text style={s.name} numberOfLines={1}>
          {fromName}
        </Text>
        <View style={s.pays}>
          <Text style={s.paysLabel}>pays →</Text>
        </View>
        <Avatar name={toName} playerId={toId} size={28} />
        <Text style={s.name} numberOfLines={1}>
          {toName}
        </Text>
        <View style={{ flex: 1 }} />
        <MoneyText cents={amountCents} color="accent" />
      </Row>
      {onMarkPaid ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Mark ${fromName} paid ${toName}`}
          onPress={onMarkPaid}
          style={({ pressed }) => [s.markPaid, pressed && { opacity: 0.7 }]}>
          <Text style={s.markPaidLabel}>Mark paid</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  name: { ...textStyles.labelMd, fontSize: 14, color: colors.text, marginLeft: space.sm, flexShrink: 1 },
  pays: {
    marginHorizontal: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
  },
  paysLabel: { ...textStyles.bodySm, color: colors.textDim },
  markPaid: {
    alignSelf: 'flex-end',
    minHeight: TAP,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    marginTop: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  markPaidLabel: { ...textStyles.labelCaps, color: colors.accent },
});
