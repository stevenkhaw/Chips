import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Caption, Row } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { formatDate } from '@/date';
import type { SessionSummary } from '@/domain/types';
import { colors, space, textStyles } from '@/theme';

export function NightRow({
  summary,
  onPress,
  onLongPress,
}: {
  summary: SessionSummary;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { session, playerCount, totalBuyinCents } = summary;
  const title = session.title?.trim() ? session.title : formatDate(session.date);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}>
      <View style={s.left}>
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        <Caption numberOfLines={1}>
          {formatDate(session.date)} · {playerCount} player{playerCount === 1 ? '' : 's'}
        </Caption>
      </View>
      <Row style={s.right}>
        <View style={{ alignItems: 'flex-end' }}>
          <MoneyText cents={totalBuyinCents} color="accent" />
          <Caption tone="muted">Pot Pool</Caption>
        </View>
      </Row>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md },
  left: { flex: 1, paddingRight: space.md },
  right: { alignItems: 'flex-end' },
  title: { ...textStyles.bodyLg, fontFamily: textStyles.labelMd.fontFamily, fontSize: 15, color: colors.text, marginBottom: 2 },
});
