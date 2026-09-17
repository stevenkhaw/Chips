import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSessionsStore } from '@/store/useSessionsStore';
import { EVEN_COLOR } from '@/domain/playerColor';
import { colors, radius, sheetShadow, space, TAP, textStyles } from '@/theme';

type TextProps = { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number };

export function Screen({
  children,
  scroll = false,
  padded = true,
  footer,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: React.ReactNode;
}) {
  const pad: ViewStyle = padded ? { paddingHorizontal: space.lg } : {};
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
      {scroll ? (
        <ScrollView
          style={s.flex}
          contentContainerStyle={[pad, { paddingBottom: space.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[s.flex, pad]}>{children}</View>
      )}
      {footer ? <View style={[s.footer, pad]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function NavHeader({
  title,
  onBack,
  onClose,
  overline,
  overlineTone = 'dim',
  dot = false,
  center = false,
  right,
  onTitlePress,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  overline?: string;
  overlineTone?: 'dim' | 'accent' | 'orange';
  dot?: boolean;
  center?: boolean;
  right?: React.ReactNode;
  onTitlePress?: () => void;
}) {
  const dotColor = overlineTone === 'accent' ? colors.accent : overlineTone === 'orange' ? colors.orange : colors.textDim;
  const middle = (
    <View style={center ? s.headerMiddleCenter : s.headerMiddleLeft}>
      {overline ? (
        <Row style={{ justifyContent: center ? 'center' : 'flex-start' }}>
          {dot ? <View style={[s.dot, { backgroundColor: dotColor }]} /> : null}
          <Overline tone={overlineTone}>{overline}</Overline>
        </Row>
      ) : null}
      <Headline numberOfLines={1} style={center ? { textAlign: 'center' } : undefined}>
        {title}
      </Headline>
    </View>
  );
  return (
    <Row style={s.header}>
      {onBack ? (
        <IconButton glyph="‹" onPress={onBack} accessibilityLabel="Go back" />
      ) : (
        <View style={s.headerSlot} />
      )}
      {onTitlePress ? (
        <Pressable onPress={onTitlePress} style={s.flex} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
          {middle}
        </Pressable>
      ) : (
        middle
      )}
      {right ? (
        <View style={s.headerRight}>{right}</View>
      ) : onClose ? (
        <IconButton glyph="✕" onPress={onClose} accessibilityLabel="Close" />
      ) : (
        <View style={s.headerSlot} />
      )}
    </Row>
  );
}

export const Headline = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[s.headline, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Title = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[s.title, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Body = ({ children, dim = false, style, numberOfLines }: TextProps & { dim?: boolean }) => (
  <Text style={[s.body, dim && { color: colors.textDim }, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Caption = ({ children, tone = 'dim', style, numberOfLines }: TextProps & { tone?: 'dim' | 'muted' }) => (
  <Text style={[s.caption, tone === 'muted' && { color: colors.textMuted }, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Overline = ({ children, tone = 'dim', style }: TextProps & { tone?: 'dim' | 'accent' | 'orange' }) => (
  <Text
    style={[
      s.overline,
      tone === 'accent' && { color: colors.accent },
      tone === 'orange' && { color: colors.orange },
      style,
    ]}>
    {children}
  </Text>
);

export const Label = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[s.label, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'orange' | 'secondary' | 'ghost' | 'danger';
  size?: 'lg' | 'md';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = {
    primary: colors.accent,
    orange: colors.orange,
    secondary: colors.cardAlt,
    ghost: 'transparent',
    danger: colors.danger,
  }[variant];
  const fg = {
    primary: colors.onAccent,
    orange: colors.onOrange,
    secondary: colors.text,
    ghost: colors.text,
    danger: colors.text,
  }[variant];
  const borderColor = variant === 'secondary' || variant === 'ghost' ? colors.border : bg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor, height: size === 'lg' ? 52 : TAP, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}>
      <Text style={[s.btnLabel, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.row, style]}>{children}</View>
);

export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [s.card, pressed && (onPress || onLongPress) ? { backgroundColor: colors.cardAlt } : null, style]}>
      {children}
    </Pressable>
  );
}

export function Banner({ kind, text, style }: { kind: 'info' | 'warn' | 'success'; text: string; style?: StyleProp<ViewStyle> }) {
  const bg = { info: colors.infoSoft, warn: colors.warnSoft, success: colors.accentSoft }[kind];
  const fg = { info: colors.info, warn: colors.warn, success: colors.accent }[kind];
  const bc = { info: colors.border, warn: colors.warnBorder, success: colors.accentBorder }[kind];
  return (
    <View style={[s.banner, { backgroundColor: bg, borderColor: bc }, style]}>
      <Text style={[s.bannerText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** Initial in the player's all-time colour: white at even, green when up, red when down. */
export function Avatar({ name, playerId, size = 40 }: { name: string; playerId: string; size?: number }) {
  const color = useSessionsStore((st) => st.playerColors[playerId]) ?? EVEN_COLOR;
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ ...textStyles.labelMd, color, fontSize: size * 0.4 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export function Pill({
  label,
  tone = 'default',
  onPress,
  onLongPress,
  style,
}: {
  label: string;
  tone?: 'default' | 'accent' | 'orange' | 'muted';
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { default: colors.cardAlt, accent: colors.accent, orange: colors.orange, muted: 'transparent' }[tone];
  const fg = { default: colors.text, accent: colors.onAccent, orange: colors.onOrange, muted: colors.textDim }[tone];
  const bc = { default: colors.border, accent: colors.accent, orange: colors.orange, muted: colors.border }[tone];
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.pill, { backgroundColor: bg, borderColor: bc, opacity: pressed ? 0.8 : 1 }, style]}>
      <Text style={[s.pillLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  glyph,
  onPress,
  accessibilityLabel,
  variant = 'plain',
}: {
  glyph: string;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'plain' | 'circle';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        s.iconBtn,
        variant === 'circle' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        pressed && { opacity: 0.6 },
      ]}>
      <Text style={s.iconGlyph}>{glyph}</Text>
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  style,
}: {
  segments: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.segmentWrap, style]}>
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(seg.key)}
            style={({ pressed }) => [s.segment, active && { backgroundColor: colors.accent }, pressed && !active && { backgroundColor: colors.cardAlt }]}>
            <Text style={[s.segmentLabel, { color: active ? colors.onAccent : colors.textDim }]} numberOfLines={1}>
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatTile({ label, value, style }: { label: string; value: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.card, s.statTile, style]}>
      <Overline>{label}</Overline>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

export function StatusPill({
  tone,
  label,
  value,
  style,
}: {
  tone: 'ok' | 'warn';
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = tone === 'ok' ? colors.accent : colors.warn;
  const bg = tone === 'ok' ? colors.accentSoft : colors.warnSoft;
  const bc = tone === 'ok' ? colors.accentBorder : colors.warnBorder;
  return (
    <Row style={[s.statusPill, { backgroundColor: bg, borderColor: bc }, style]}>
      <View style={[s.dot, { backgroundColor: fg }]} />
      <Text style={[s.statusLabel, { color: fg }]}>{label}</Text>
      <View style={s.flex} />
      <Text style={[s.statusValue, { color: fg }]}>{value}</Text>
    </Row>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[s.checkbox, checked && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
      {checked ? <Text style={s.checkGlyph}>✓</Text> : null}
    </View>
  );
}

export function ChipGlyph({ size = 32 }: { size?: number }) {
  const inner = Math.round(size * 0.42);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, borderWidth: 2, borderColor: colors.text }} />
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  return <View style={[s.divider, style]} />;
}

export function toastError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  Alert.alert('Error', msg);
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.bg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    ...sheetShadow,
  },
  header: { minHeight: 56, paddingTop: space.sm, paddingBottom: space.md, alignItems: 'flex-start' },
  headerSlot: { width: TAP },
  headerRight: { marginLeft: space.sm },
  headerMiddleLeft: { flex: 1, justifyContent: 'center' },
  headerMiddleCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headline: { ...textStyles.headlineLg, color: colors.text },
  title: { ...textStyles.headlineMd, color: colors.text },
  body: { ...textStyles.bodyLg, color: colors.text },
  caption: { ...textStyles.bodySm, color: colors.textDim },
  overline: { ...textStyles.labelCaps, color: colors.textDim },
  label: { ...textStyles.labelMd, color: colors.textDim },
  btn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  btnLabel: { ...textStyles.bodyLg, fontFamily: textStyles.labelMd.fontFamily, fontSize: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  banner: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm },
  bannerText: { ...textStyles.labelMd },
  avatar: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  pillLabel: { ...textStyles.numericSm },
  iconBtn: { width: TAP, height: TAP, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { ...textStyles.headlineMd, color: colors.text },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xs,
  },
  segment: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { ...textStyles.labelMd },
  statTile: { flex: 1, padding: space.lg, justifyContent: 'center' },
  statValue: { ...textStyles.numericLg, color: colors.text, marginTop: space.xs },
  statusPill: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm },
  statusLabel: { ...textStyles.labelMd },
  statusValue: { ...textStyles.numericSm },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: space.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkGlyph: { ...textStyles.labelMd, color: colors.onAccent, fontSize: 14, lineHeight: 16 },
  divider: { height: 1, backgroundColor: colors.border },
});
