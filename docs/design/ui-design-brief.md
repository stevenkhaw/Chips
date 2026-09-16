# Chips — UI Design Brief (hand this to a UI design agent)

Copy everything below the line into your design tool of choice. Replace anything in `[brackets]` with your own preference first — those are the personalization knobs.

---

## Prompt

You are designing the complete UI for **Chips**, a mobile app (iOS + Android, built in React Native / Expo) that one person uses on poker night to track everyone's money and share the result with the group.

### What the app does
- One person (the bookkeeper) opens the app at the table.
- They start a **night**: pick a date, optionally a title ("Dave's place"), choose players from a saved roster, set a default buy-in (e.g. $20).
- During play, each time someone rebuys they tap **+** next to that player. Each buy-in shows as a small pill (`$20 $20 $35`).
- At the end, each player's **cash-out** is typed in (or computed by counting chips by color).
- The app computes each player's **net** (cash-out minus total buy-ins) and the **fewest transfers** needed to settle up ("Ann pays Bob $25").
- The bookkeeper taps **Share** and gets an **image card** to drop into the group chat.
- Past nights are listed and can be reopened and edited.

### Who uses it
- Casual home-game poker players, 4–10 people, phone in one hand, beer in the other. Dim room.
- The bookkeeper needs **speed**: one tap to log a rebuy, minimal typing.
- The **shared image** is the product everyone else sees. It must look good in iMessage/WhatsApp at thumbnail size and be legible when tapped.

### Design direction
- Mood: `[premium casino-adjacent but not kitsch — think felt, chips, brass accents / OR minimalist fintech / OR playful neon]`
- Theme: **dark-first** (dim rooms). A light theme is optional, not required for v1.
- Accent color: `[one accent; default suggestion: green #3DDC97 for "positive money"]`. Negative = red/coral. Keep money colors semantic and consistent.
- Typography: large, tabular-figures for all money. Numbers are the hero. `[Font preference: system (SF/Roboto) or a specific one]`
- Tone of copy: short, friendly, no jargon. "Who pays who", not "Settlement ledger".
- Personality hooks you may use sparingly: chip stacks, card suits, felt texture. Avoid stock photo poker imagery.
- No onboarding flow, no login, no tabs bar. Home → Night → Settle is the spine.

### Hard constraints (from engineering)
- React Native. Use standard mobile components: stack navigation, bottom-sheet modals for numeric entry, native share sheet. No gestures that need a custom library (no swipe-to-delete; long-press → action sheet instead).
- Money is always shown from integer cents. Format: `$20`, `$12.50`, `-$7.25`, `+$30`.
- Phone widths 360–430 pt. Design at 390×844 (iPhone 14/15) and check 360×800 (Android).
- Share card is a **fixed 1080 px wide** image, any height, dark background, designed to be screenshotted-then-shared. It is rendered by code, so it must be buildable with plain boxes, text, circles — no photos, no complex illustration.
- Every interactive element ≥ 44 pt tap target.
- Icons: only if simple (line icons). Text buttons are fine.

### Screens to design (skeleton + required elements)

**1. Home — Nights list**
- Header: app name "Chips". Right side: two small icon buttons → Players, Settings.
- List of night cards, newest first. Each card: title (or formatted date if no title), date line if titled, "N players", and right side either top winner name + "+$X" in green, or "In progress" if not all cashed out.
- Floating "+" action button bottom-right → New night.
- Empty state: one friendly line + arrow to "+".
- Long-press a card → action sheet: Share / Delete / Cancel.

**2. New night (modal sheet)**
- Fields in order: Date (native picker, default today), Title (optional text), Default buy-in (numeric, prefilled), Players.
- Players = roster shown as toggle chips (selected = accent). Below them an inline "New player" text field + Add button. Players from the most recent night come pre-selected.
- Primary button "Start" (disabled until ≥1 player and valid buy-in). Ghost "Cancel".

**3. Night — session editor (the workhorse, most important screen)**
- Header: back, title/date, primary "Settle up" button.
- One **player row** per player, vertically stacked:
  - Avatar (colored circle, initial) + name on left; live **net** on right (`+$30` green / `-$20` red / `—` if not cashed out).
  - "Buy-ins · $60" caption, then a wrap of pills: one pill per buy-in (`$20`), plus an accent **+** pill at the end. Tap + = add default buy-in instantly. Long-press + = custom amount.
  - Tapping an existing pill opens an edit sheet (change amount / remove).
  - Cash-out field: full-width tappable strip: "Cash-out" label, right side "Tap to enter" (dim) or the amount.
- Long-press a row → "Remove from night".
- Footer: "+ Add player" secondary button; "Total buy-ins $X / Total cash-out $Y"; status banners:
  - Info (neutral): "2 not cashed out"
  - Warning (amber): "Off by $20 — cash missing. Recount?"
- Must stay usable with 10 players → rows compact, scroll.

**4. Amount pad (bottom sheet, reused)**
- Title ("Buy-in amount" / "Edit buy-in" / "Cash-out"), big currency symbol + big numeric input (system decimal keypad, no custom keypad needed), optional secondary button "Use chips" (cash-out only, only when chip denominations exist), footer: [Remove] [Cancel] [Save].

**5. Chip counter (full sheet)**
- One row per chip denomination: color swatch circle, label ("Red"), "$1 each"; right side: − [count] + stepper.
- Big running total at bottom. Primary button "Use $47.25". Ghost "Cancel".

**6. Settle up**
- Header: back, title, date.
- Banners (same as editor) if pending or discrepancy.
- Section "WHO PAYS WHO": list rows "Ann → Bob   $25" with both avatars; amount bold right.
- Section "RESULTS": players sorted by net, "+$30" / "-$20".
- Collapsible "Details": table Player | In | Out | Net.
- Primary button "Share" at bottom.

**7. Share card (1080 px wide image)**
- Header: title or "Poker night", date.
- WHO PAYS WHO list (largest visual weight).
- RESULTS list with colored nets.
- DETAILS table (In / Out / Net).
- Discrepancy line in amber if books don't balance.
- Tiny "Chips" wordmark bottom-right.
- Must read at thumbnail size: transfers must be the biggest text after the title.

**8. Players (roster)**
- Header: back, "Players", "+ New".
- List: avatar + name; "archived" tag for archived ones at the bottom. Tap = rename (modal with text field). Long-press → Rename / Archive / Delete.

**9. Settings**
- "Default buy-in" row → tap opens Amount pad.
- "Chip denominations" section: list of swatch + label + value; "+ Add denomination". Editing modal: label, value, color swatch picker (10 preset colors). Long-press → move up / move down / delete.

### Deliverables I want from you
1. Full-fidelity dark mockups for screens 1–9 at 390×844, plus the 1080-wide share card.
2. A **design tokens** sheet: colors (bg, card, cardAlt, border, text, textDim, accent, positive, negative, warn), spacing scale (4/8/12/16/24), radii (8/12/16/pill), type scale with weights.
3. A **component list** with states: Button (primary/secondary/danger/ghost, disabled, pressed), Pill (default/accent), Card, Banner (info/warn), Avatar, MoneyText (pos/neg/zero), Amount pad, list row.
4. Empty states for Home and Players.
5. One "10 players, long names" stress mockup of the session editor.
6. Export: PNGs of every screen + a Figma (or equivalent) file. If you can, also export tokens as JSON.

### Do not
- Add features not listed (no charts, no leaderboard, no login, no multi-user sync).
- Use photos or heavy illustration on the share card.
- Use light theme as primary.
- Rely on swipe gestures.

---

## Recommended tools / where to run this

Ranked for this kind of job (mobile app UI from a text brief):

1. **Google Stitch** (stitch.withgoogle.com) — free, built for generating mobile app screens from text, exports to Figma and produces usable layout code. Best fit for "give me 9 dark screens from a brief." Paste the prompt above screen by screen for better results than one shot. This repo's toolchain can also generate a Stitch `DESIGN.md` for you (ask Claude: "make a Stitch DESIGN.md for Chips").
2. **Figma + Figma Make / First Draft** — if you already live in Figma. Best when you'll iterate by hand afterward. Paste the brief into Make, then clean up.
3. **Claude Design canvas** (available in this Claude Code session via the `design` skill) — I can draft all screens as an editable multi-artboard canvas you can tweak visually, then export PNG. Zero setup. Ask: "draft the Chips screens on a design canvas."
4. **Uizard / Galileo AI (now part of Google Stitch)** — fast text-to-mockup, weaker on system consistency across 9 screens.
5. **v0.dev / Lovable** — web-first. Fine for a moodboard or the share card, poor for native mobile patterns.
6. **Image models** (Midjourney, GPT image, Nano Banana) — only for **mood / direction boards**, not for buildable screens. I can also generate polished phone-mockup concept images here via the `imagegen-frontend-mobile` skill if you want to pick a vibe before committing.
7. **A human designer** (Dribbble hire, Contra, Toptal) — hand them this brief verbatim; it already has the skeleton, tokens ask, and constraints they'd normally have to extract from you.

Suggested flow: pick a mood with option 6 or 3 (30 min) → generate screens with 1 or 2 → hand PNGs + tokens JSON back to Claude Code, which will update `src/theme.ts` and components to match.
