import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Row } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { colors, radius, space, textStyles } from '@/theme';

export function TransferRow({
  fromName,
  fromSeed,
  toName,
  toSeed,
  amountCents,
}: {
  fromName: string;
  fromSeed: number;
  toName: string;
  toSeed: number;
  amountCents: number;
}) {
  return (
    <View style={s.card} accessibilityLabel={`${fromName} pays ${toName}`}>
      <Row>
        <Avatar name={fromName} seed={fromSeed} size={28} />
        <Text style={s.name} numberOfLines={1}>
          {fromName}
        </Text>
        <View style={s.pays}>
          <Text style={s.paysLabel}>pays →</Text>
        </View>
        <Avatar name={toName} seed={toSeed} size={28} />
        <Text style={s.name} numberOfLines={1}>
          {toName}
        </Text>
        <View style={{ flex: 1 }} />
        <MoneyText cents={amountCents} color="accent" />
      </Row>
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
});
