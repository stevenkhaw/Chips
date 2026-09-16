import { CHIP_SWATCHES } from '@/theme';

/** A chip denomination preset — the shape addDenom expects, independent of any persisted id. */
export interface ChipPreset {
  label: string;
  colorHex: string;
  valueCents: number;
}

/**
 * The "standard" five-chip set (White/Red/Blue/Green/Black). Colours are sourced from
 * CHIP_SWATCHES[0..4] in theme.ts so they stay in sync with the rest of the app instead of
 * duplicating hex values here.
 */
export const STANDARD_CHIP_PRESETS: ChipPreset[] = [
  { label: 'White', colorHex: CHIP_SWATCHES[0], valueCents: 100 },
  { label: 'Red', colorHex: CHIP_SWATCHES[1], valueCents: 500 },
  { label: 'Blue', colorHex: CHIP_SWATCHES[2], valueCents: 1000 },
  { label: 'Green', colorHex: CHIP_SWATCHES[3], valueCents: 2500 },
  { label: 'Black', colorHex: CHIP_SWATCHES[4], valueCents: 5000 },
];

/** Seeds the standard chip set, in ascending value order, via the given addDenom function. */
export function seedStandardDenoms(
  addDenom: (input: { label: string; colorHex: string; valueCents: number }) => void,
): void {
  for (const preset of STANDARD_CHIP_PRESETS) addDenom(preset);
}
