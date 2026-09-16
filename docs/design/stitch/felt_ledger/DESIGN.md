---
name: Felt & Ledger
colors:
  surface: '#121315'
  surface-dim: '#121315'
  surface-bright: '#38393b'
  surface-container-lowest: '#0d0e10'
  surface-container-low: '#1b1c1e'
  surface-container: '#1f2022'
  surface-container-high: '#292a2c'
  surface-container-highest: '#343537'
  on-surface: '#e3e2e4'
  on-surface-variant: '#e0c0af'
  inverse-surface: '#e3e2e4'
  inverse-on-surface: '#303032'
  outline: '#a78b7c'
  outline-variant: '#584235'
  surface-tint: '#ffb68b'
  primary: '#ffb68b'
  on-primary: '#522300'
  primary-container: '#ff7a00'
  on-primary-container: '#5c2800'
  inverse-primary: '#994700'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#adc6ff'
  on-tertiary: '#002e6a'
  tertiary-container: '#6d9fff'
  on-tertiary-container: '#003577'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbc8'
  primary-fixed-dim: '#ffb68b'
  on-primary-fixed: '#321200'
  on-primary-fixed-variant: '#753400'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#121315'
  on-background: '#e3e2e4'
  surface-variant: '#343537'
typography:
  headline-xl:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.01em
  title-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 22px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-numeric-lg:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.02em
  label-numeric-md:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 22px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-caps:
    fontFamily: Hanken Grotesk
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-desktop: 1.25rem
  margin: 1rem
  margin-desktop: 2rem
  space-2xs: 0.25rem
  space-xs: 0.375rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-base: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

This design system delivers a high-stakes, club-grade poker ledger and fintech companion. Crafted for serious home games, private card clubs, and fast-paced cash-game management, it blends the precision of modern fintech with the electric atmosphere of the felt.

The aesthetic philosophy balances pitch-black canvas depth (`#0D0D0E`) with high-voltage transactional signals: a glowing emerald green representing liquidity and finality, paired with a vibrant casino orange (`#FF7A00`) driving active game-state adjustments, buy-ins, and flow confirmations. Visual clutter is stripped away in favor of disciplined modular cards, crisp hairline borders, and monospaced numerical clarity. 

Interactions feel immediate, tangible, and tactile. High-contrast surfaces separate the bank from individual player seats, while chip counters, stepper controls, and ledger split breakdowns provide instant balance confirmation at a glance.

## Colors

The palette is engineered for high legibility in low-light social environments, anchored by deep carbon surfaces and intense chromatic accents:

- **Primary (`#FF7A00`)**: Casino Orange. Used for active game-state mutations, primary CTA triggers in setup screens, player rebuy/buy-in steppers, and active session badges.
- **Secondary (`#10B981`)**: Felt Emerald. Symbolizes liquidity, settled pots, balanced ledger confirmations, final cash-out executions, and sharing actions.
- **Tertiary (`#3B82F6`)**: Chip Blue. Utilized for chip denomination profiling and informative utility states.
- **Neutral Palette**:
  - `canvas`: `#0D0D0E` (pitch black background providing maximum contrast)
  - `surface-container`: `#18191B` (elevated card surface for player rows and summary panels)
  - `surface-elevated`: `#222427` (steppers, text inputs, chip trays, nested modules)
  - `border-subtle`: `#2A2C30` (hairline definition across all dark containers)
  - `text-primary`: `#FFFFFF` (high-contrast typographic hierarchy)
  - `text-secondary`: `#9CA3AF` (captions, subtitle metadata, denomination guides)
  - `text-muted`: `#4B5563` (inactive counters, disabled toggles)

### Chip Token Semantics
Specific poker chip tokens represent standard denominations:
- White Chip: `#F3F4F6` with `#1F2937` accent
- Red Chip: `#EF4444`
- Blue Chip: `#3B82F6`
- Green Chip: `#10B981`
- Black Chip: `#111827` with `#374151` rim

## Typography

Typography prioritizes fast scannability, structural alignment, and numerical authority.

- **Headlines (`Manrope`)**: Geometric, compact, and assertive. Used for game titles, table stakes, total pool figures, and primary screen banners. The extra-bold cuts ground the screen with high-impact club authority.
- **Body & Data (`Hanken Grotesk`)**: Sharp, modern, and neutral. Provides exceptional readability for player handles, chip breakdowns, calculation splits, and sub-labels.
- **Tabular Figures**: All monetary amounts, chip totals, and steppers enforce tabular lining (`font-variant-numeric: tabular-nums`) to prevent horizontal jitter during rapid adjustments.
- **Micro Labels**: Header overlines and metric tags leverage uppercase tracking (`label-caps`) to differentiate contextual guidance from editable parameters.

## Layout & Spacing

The layout model is built around a focused mobile-first single column, expanding to structured multi-panel views on desktop or tablet organizers.

- **Horizontal Bleed & Margins**: Native phone views maintain a strict `1rem` (`16px`) outer canvas margin to maximize playable density.
- **Stacking Rhythm**: Vertical sections follow a tight 4px baseline rhythm (`space-xs` through `space-base`), grouping related player data closely while isolating total pot cards and bottom actions.
- **Nested Card Densities**: Within card components, internal padding ranges from `12px` (`space-md`) for compact list rows to `16px` (`space-base`) for summary hero blocks.
- **Bottom Fixed Sheets & Actions**: Key interactive actions (`Confirm & Start`, `Go to Cash-Out`, `Apply to Cash-out`) sit pinned to the viewport bottom with safe-area offsets and a minimum tap height of `52px`.

## Elevation & Depth

This design system rejects fuzzy drop shadows in favor of crisp tonal tiering and razor-sharp border separation:

- **Base Layer (`#0D0D0E`)**: The pitch-black foundation.
- **Level 1 Containers (`#18191B`)**: Standard cards, player list blocks, metrics panels. Encased in a continuous 1px stroke of `#2A2C30`.
- **Level 2 Modules (`#222427`)**: Steppers, chip value wells, input fields, and pill selectors nestled inside cards. Separated by tonal contrast rather than blur.
- **Floating Modals & Drawers (`#18191B`)**: Bottom sheets and quick-buy popups feature a subtle ambient upward glow: `0 -12px 32px rgba(0, 0, 0, 0.6)` bounded by a top hairline border of `#374151`.
- **Active State Highlights**: Selected states and active buy-in elements do not lift in space; they emit an inner border stroke or back-layer glow keyed to either Casino Orange (`rgba(255, 122, 0, 0.15)`) or Felt Green (`rgba(16, 185, 129, 0.15)`).

## Shapes

The interface balances soft technical contours with functional, ergonomic touch targets:

- **Level 1 (Soft)**: Base elements (chips, inner inputs, denomination swatches) utilize `0.25rem` (4px) to `0.5rem` (8px) radius.
- **Cards & Containers**: Enclosed in smooth `0.75rem` (`12px`) to `1rem` (`16px`) corners, establishing a tailored, modern frame.
- **Interactive Action Buttons & Avatars**: Master call-to-actions, player avatar circles, and stepper pill buttons adopt full pill radii (`9999px`) to invite thumb contact and evoke physical casino tokens.
- **Chips & Steppers**: Stepper increment/decrement buttons feature symmetrically rounded pill geometries to facilitate rapid, tactile tapping.

## Components

### Primary & Action Buttons
- **Hero / Action Buttons**: Full-width pill buttons (`h: 52px`) with bold typography. Background is solid Emerald Green (`#10B981`) for settlement, starting nights, and messaging exports; and Casino Orange (`#FF7A00`) for mid-game cash-out transitions and buy-in confirmations. Text is rich dark `#0D0D0E` for maximum punch and legibility.
- **Secondary Ghost Buttons**: Transparent background with a `1px` stroke of `#2A2C30`, white text, and `#222427` on press.

### Cards & Player Rows
- **List Items**: Modular `#18191B` surface rows with `#2A2C30` borders. Houses the circular player initial badge on the left, player title and buy-in subtotal in the center, and the quick-action orange `+` rebuy pill or emerald final total on the right.
- **Summary Metrics Cards**: Two-column top split showcasing "All-Time Nights" and "Total Volume" in bold tabular type with glowing secondary color indicators.

### Chip Stepper Controls
- **Counter Row**: Dedicated rows matching official casino denominations (White, Red, Blue, Green, Black).
- **Structure**: Each row presents a circular chip badge with a distinct accent ring, followed by the per-chip value (`Value: $5.00`), flanked by unified `-` and `+` square-pill steppers around an active bold counter numeral.

### Balanced Pool Indicator
- **Status Pills**: Top indicator badge with a glowing green dot displaying `Balanced Pool` alongside current tally matching total pot pool (`$230.00 / $230.00`). Discrepancies drop to warning red (`#EF4444`).

### Settlement Split Cards
- **Transfer Map**: Clean summary modules illustrating "Player A pays Player B" with explicit emerald payout values aligned to the far right, optimized for single-tap WhatsApp / iMessage export card generation.