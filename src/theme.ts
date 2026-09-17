import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Felt & Ledger palette, normalized.
 * See docs/design/stitch/felt_ledger/DESIGN.md — "Colors".
 */
export const colors = {
  bg: '#0D0D0E',            // canvas
  card: '#18191B',          // level 1 container
  cardAlt: '#222427',       // level 2 module (inputs, steppers, wells)
  border: '#2A2C30',        // hairline
  borderStrong: '#374151',  // sheet top hairline
  text: '#FFFFFF',
  textDim: '#9CA3AF',
  textMuted: '#4B5563',

  accent: '#10B981',                        // Felt Emerald
  accentSoft: 'rgba(16, 185, 129, 0.15)',
  accentBorder: 'rgba(16, 185, 129, 0.30)',
  onAccent: '#0D0D0E',

  orange: '#FF7A00',                        // Casino Orange
  orangeSoft: 'rgba(255, 122, 0, 0.15)',
  orangeBorder: 'rgba(255, 122, 0, 0.35)',
  onOrange: '#0D0D0E',

  info: '#3B82F6',                          // Chip Blue
  infoSoft: 'rgba(59, 130, 246, 0.15)',

  pos: '#10B981',
  neg: '#F43F5E',
  negSoft: 'rgba(244, 63, 94, 0.15)',
  warn: '#F59E0B',
  warnSoft: 'rgba(245, 158, 11, 0.15)',
  warnBorder: 'rgba(245, 158, 11, 0.35)',
  danger: '#F43F5E',

  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

/** Minimum tap target, per the design brief. */
export const TAP = 44;

export const fonts = {
  headline: 'Manrope_800ExtraBold',
  headlineBold: 'Manrope_700Bold',
  title: 'Manrope_600SemiBold',
  numeric: 'Manrope_800ExtraBold',
  numericMd: 'Manrope_700Bold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemi: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
};

/**
 * Type scale from the Felt & Ledger front-matter. Every money value carries
 * tabular figures so digits do not jitter while steppers run.
 */
export const textStyles = {
  headlineXl: { fontFamily: fonts.headline, fontSize: 32, lineHeight: 38, letterSpacing: -0.9 },
  headlineLg: { fontFamily: fonts.headlineBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  headlineMd: { fontFamily: fonts.headlineBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  titleLg: { fontFamily: fonts.title, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22 },
  bodyMd: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  numericLg: { fontFamily: fonts.numeric, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  numericMd: { fontFamily: fonts.numericMd, fontSize: 18, lineHeight: 22, fontVariant: ['tabular-nums'] },
  numericSm: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  labelMd: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, letterSpacing: 0.2 },
  labelCaps: { fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

/** Bottom sheets and pinned footers: ambient upward glow, no blur-lift. */
export const sheetShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOpacity: 0.6,
  shadowRadius: 32,
  shadowOffset: { width: 0, height: -12 },
  elevation: 24,
};

/** Chip token palette (Felt & Ledger "Chip Token Semantics" plus five spares). */
export const CHIP_SWATCHES = [
  '#F3F4F6', // white chip
  '#EF4444', // red chip
  '#3B82F6', // blue chip
  '#10B981', // green chip
  '#111827', // black chip
  '#F59E0B',
  '#A855F7',
  '#14B8A6',
  '#F43F5E',
  '#6B7280',
];
