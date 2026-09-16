---
name: Obsidian Felt
colors:
  surface: '#121316'
  surface-dim: '#121316'
  surface-bright: '#38393c'
  surface-container-lowest: '#0d0e11'
  surface-container-low: '#1b1b1f'
  surface-container: '#1f1f23'
  surface-container-high: '#292a2d'
  surface-container-highest: '#343538'
  on-surface: '#e3e2e6'
  on-surface-variant: '#bbcac0'
  inverse-surface: '#e3e2e6'
  inverse-on-surface: '#303034'
  outline: '#85948b'
  outline-variant: '#3c4a42'
  surface-tint: '#45dfa4'
  primary: '#5af0b3'
  on-primary: '#003825'
  primary-container: '#34d399'
  on-primary-container: '#00563b'
  inverse-primary: '#006c4b'
  secondary: '#c0c7d6'
  on-secondary: '#2a313c'
  secondary-container: '#454c58'
  on-secondary-container: '#b5bccb'
  tertiary: '#ffc9cc'
  on-tertiary: '#67001b'
  tertiary-container: '#ffa1a7'
  on-tertiary-container: '#99002c'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#68fcbf'
  primary-fixed-dim: '#45dfa4'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#005137'
  secondary-fixed: '#dce3f2'
  secondary-fixed-dim: '#c0c7d6'
  on-secondary-fixed: '#151c27'
  on-secondary-fixed-variant: '#404753'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#121316'
  on-background: '#e3e2e6'
  surface-variant: '#343538'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 22px
    fontWeight: '500'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Geist
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.06em
  stat-mono-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  stat-mono-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: -0.01em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2.5rem
---

## Brand & Style

The design system is engineered as an ultra-sleek, minimalist fintech and poker utility. It fuses the quiet confidence of high-end wealth management tools with the precision metrics of professional card analytics. Rather than relying on loud, gamified casino tropes or aggressive crypto-speculative neon palettes, it embraces an elevated, architectural dark mode: deep obsidian voids, low-specularity graphite surfaces, and surgical typographic hierarchy.

The visual language communicates discipline, calculation, and effortless mastery. Every interactive affordance feels milled and intentional. Micro-interactions rely on tactile feedback, fine hairline strokes, and high-legibility tabular telemetry, giving players, analytical bettors, and high-stakes trackers an experience defined by discretion, speed, and uncompromising luxury.

## Colors

The palette is rooted in true deep obsidian and matte graphite backdrops, eliminating eye fatigue and elevating critical numerical telemetry. Color is applied with surgical austerity:

- **Background & Base Canvas:** The canvas begins at `#08090A` (true obsidian) with structural containers lifting subtly into `#0D0E11` and card planes resting at `#14161A` and `#1A1D23`.
- **Primary Accent (`#34D399`):** A clean, lime-tinted electric emerald. Reserved exclusively for net positive balances, active pot wins, confirmation micro-states, and singular primary actions. Never used across expansive surface fills.
- **Secondary Neutral Spectrum:** Primary body and headline text cuts through at `#FFFFFF` and `#F3F4F6`. Structural metadata and column headers use cool muted slate (`#8E95A3`), while quiet tertiary timestamps and inactive states step down to `#606775`.
- **Semantic Accents:** Losses, folds, and debt alerts leverage a precise crimson coral (`#F43F5E`), balanced in luminosity to match the primary green. Cautionary states and pending validations resolve into a warm, desaturated amber (`#F59E0B`).
- **Dividers & Strokes:** Borders rely strictly on whisper-thin boundaries (`rgba(255, 255, 255, 0.07)` or `#23272F`), maintaining separation without visual clutter.

## Typography

Typography establishes an analytical cadence. The headline hierarchy leverages **Hanken Grotesk** for structured, confident sectioning with tight negative tracking on major displays. 

All body copy, meta-labels, and quantitative metrics leverage **Geist**. Geist's geometric monoline forms and superior tabular numeral features (`font-variant-numeric: tabular-nums;`) ensure that volatile monetary sums, pot sizes, blind increments, and live percentages align cleanly across tables and cards without layout jitter. Labels and tags are set in elevated uppercase with tracked spacing (`0.04em` to `0.06em`) for immediate peripheral recognition.

## Layout & Spacing

Layout rhythm adheres to a strict 4px/8px modular scale, maintaining generous micro-spacing inside interactive tiles while preserving dense, scan-efficient screen layouts.

- **Mobile (< 768px):** A single-column vertical stack bounded by `1rem` margins. Navigation stays pinned to a low-profile bottom command pill. Cards flow edge-to-edge within the margin grid.
- **Tablet (768px - 1024px):** A 6-column fluid structure with `1.5rem` gutters and `2rem` margins. Metrics dashboards sit in dual-column modular grids.
- **Desktop (> 1024px):** A 12-column layout capped at a maximum container width of `1280px` centered within `3rem` section margins. Complex tables and live multi-table session trackers split into fixed-width tool sidebars (280px) and wide flexible analytics viewports.
- **Horizontal & Vertical Pacing:** Card padding strictly enforces `space-lg` (`1rem`) on mobile and `space-xl` (`1.5rem`) on desktop. Internal line-item rows rely on `space-sm` (`0.5rem`) vertical gaps paired with hairline boundaries.

## Elevation & Depth

This design system avoids heavy drop shadows and glowing neon auras. Instead, depth is achieved through **tonal stratification** and **hairline edge definition**:

1. **Layer 0 (Canvas Void):** `#08090A` — non-interactive, deep matte base.
2. **Layer 1 (Recessed/Input Track):** `#0D0E11` — inset panels, inactive slider runs, and text entry wells with a fine inset border `rgba(255, 255, 255, 0.04)`.
3. **Layer 2 (Primary Floating Surfaces):** `#14161A` — session cards, leaderboard containers, and hand detail trays. Outlined with a continuous 1px stroke of `rgba(255, 255, 255, 0.07)` or `#23272F`.
4. **Layer 3 (Overlays, Flyouts & Modals):** `#1A1D23` — supported by a 12px background blur (`backdrop-filter: blur(16px); background-color: rgba(26, 29, 35, 0.85)`). Shadows are strictly ambient: `0 12px 32px -4px rgba(0, 0, 0, 0.65)` with zero color tinting.
5. **Interactive Highlight (Top Rim Light):** High-priority active elements feature a subtle 1px inner top border (`box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.12)`), simulating a bevel under overhead studio lighting.

## Shapes

The geometric identity relies on softened pill forms contrasted with calibrated modular card corners:

- **Tokens & Pills:** Badges, chips, action toggles, and primary push buttons use full pill rounding (`9999px`), creating tactile, thumb-friendly targets reminiscent of physical clay poker tokens.
- **Cards & Data Modules:** Cards, table containers, and bottom sheets adopt balanced `rounded-xl` contours (16px to 24px), preserving structural screen density without aggressive sharpness.
- **Micro-Form Elements:** Form inputs, chip counts, and metric sub-boxes apply an intermediate 12px curve, establishing clear visual containment while anchoring tabular text cleanly within borders.

## Components

### Buttons
- **Primary:** Instead of solid neon green blocks, buttons feature a dark graphite base (`#1E2229`) with an elevated `1px` stroke tinted in primary green (`rgba(52, 211, 153, 0.4)`), crisp white typography, and a subtle glowing hover indicator. For ultimate calls-to-action (e.g., "Confirm Buy-In"), a solid `#34D399` pill with `#08090A` bold typography is applied.
- **Secondary / Ghost:** Matte black interior, 1px border (`#23272F`), text in `#FFFFFF`. On hover, the border transitions to `rgba(255, 255, 255, 0.2)` with background shifting to `#1A1D23`.
- **Destructive:** Frosted dark base with a fine coral outline (`rgba(244, 63, 94, 0.4)`) and text in `#F43F5E`.

### Chips & Stat Badges
- **Status Pills:** Pill geometry with low-opacity fills (`rgba(52, 211, 153, 0.08)` for positive gains; `rgba(244, 63, 94, 0.08)` for downswings). Paired with an interior 4px status dot and bold tabular digits.
- **Filter Chips:** Height `32px`, full pill radius, dark surface (`#14161A`), stroke `#23272F`. Selected state swaps border to `#FFFFFF` with typography brightening from `#8E95A3` to `#FFFFFF`.

### Cards & Trays
- Constructed with `#14161A` background fills and 1px hairline perimeter framing (`rgba(255, 255, 255, 0.07)`).
- Cards separate primary content from meta-actions via whisper-quiet dividers (`#1A1D23`). Hovering interactive cards prompts a subtle vertical shift (-1px) and an edge glow enhancement (`rgba(255, 255, 255, 0.14)`).

### Input Fields & Steppers
- **Inputs:** Dark recessed background (`#0D0E11`), 1px border (`#23272F`), text in `#FFFFFF`, placeholder in `#606775`. Focused state illuminates the boundary to `#34D399` with zero glow spill.
- **Numeric Steppers (Pot Sizing / Bet Sliders):** Tabular Geist metrics centered between minus/plus pill triggers. The slider track uses a 4px high groove in `#1A1D23` with the filled active track illuminated in `#34D399`.

### Lists & Ledger Rows
- Minimalist ledger rows separated by 1px horizontal dividers (`rgba(255, 255, 255, 0.04)`).
- Left-aligned metadata (Player, Stakes, Timestamp) uses Geist Regular and Slate (`#8E95A3`). Right-aligned chip/monetary valuations use Geist SemiBold with mandatory tabular layout. Positive deltas automatically prefix `+` in `#34D399`; losses prefix `-` in `#F43F5E`.

### Checkboxes & Radios
- Rounded 6px squircle (checkbox) or full circle (radio) with a 1.5px border in `#606775`. Selected state fills the container with `#34D399` and renders an obsidian check or center dot (`#08090A`).