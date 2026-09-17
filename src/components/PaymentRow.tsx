import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Caption, Row } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { colors, radius, space, TAP, textStyles } from '@/theme';

export function PaymentRow({
  fromName,
  fromId,
  toName,
  toId,
  amountCents,
  note,
  onDelete,
}: {
  fromName: string;
  fromId: string;
  toName: string;
  toId: string;
  amountCents: number;
  note?: string | null;
  onDelete: () => void;
}) {
  const confirmDelete = () => {
    Alert.alert('Delete payment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Pressable
      onLongPress={confirmDelete}
      accessibilityRole="button"
      accessibilityLabel={`${fromName} paid ${toName}. Long-press to delete`}
      style={({ pressed }) => [s.card, pressed && { backgroundColor: colors.cardAlt }]}>
      <Row>
        <Avatar name={fromName} playerId={fromId} size={28} />
        <Text style={s.name} numberOfLines={1}>
          {fromName}
        </Text>
        <View style={s.arrowWrap}>
          <Text style={s.arrow}>→</Text>
        </View>
        <Avatar name={toName} playerId={toId} size={28} />
        <Text style={s.name} numberOfLines={1}>
          {toName}
        </Text>
        <View style={{ flex: 1 }} />
        <MoneyText cents={amountCents} color="accent" />
      </Row>
      {note ? (
        <Caption tone="muted" style={s.note} numberOfLines={1}>
          {note}
        </Caption>
      ) : null}
    </Pressable>
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
    minHeight: TAP,
  },
  name: { ...textStyles.labelMd, fontSize: 14, color: colors.text, marginLeft: space.sm, flexShrink: 1 },
  arrowWrap: {
    marginHorizontal: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
  },
  arrow: { ...textStyles.bodySm, color: colors.textDim },
  note: { marginTop: space.xs, marginLeft: space.xs },
});
