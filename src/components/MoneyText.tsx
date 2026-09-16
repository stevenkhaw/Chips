import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { formatCents, formatSigned } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, textStyles } from '@/theme';

export function MoneyText({
  cents,
  signed = false,
  variant = 'md',
  color = 'auto',
  style,
}: {
  cents: number;
  signed?: boolean;
  variant?: 'lg' | 'md' | 'sm';
  color?: 'auto' | 'default' | 'accent' | 'dim';
  style?: StyleProp<TextStyle>;
}) {
  const symbol = useSettingsStore((st) => st.settings.currencySymbol);
  const base = { lg: textStyles.numericLg, md: textStyles.numericMd, sm: textStyles.numericSm }[variant];
  const autoColor = signed ? (cents > 0 ? colors.pos : cents < 0 ? colors.neg : colors.textDim) : colors.text;
  const resolved = {
    auto: autoColor,
    default: colors.text,
    accent: colors.accent,
    dim: colors.textDim,
  }[color];
  return (
    <Text style={[base, { color: resolved }, style]} numberOfLines={1}>
      {signed ? formatSigned(cents, symbol) : formatCents(cents, symbol)}
    </Text>
  );
}
