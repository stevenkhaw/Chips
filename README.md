# Chips

Poker-night balance tracker. Log buy-ins and cash-outs per player, get the fewest transfers to settle, share a settlement card.

## Run

    npm install
    npx expo start        # then press i (iOS simulator) or a (Android)

## Test

    npm test              # Jest: domain math, repositories, stores
    npx tsc --noEmit

## Layout

- `src/domain` pure math (nets, minimal-transfer settlement, money, chips)
- `src/db` SQLite schema, migrations, adapters (expo-sqlite on device, node:sqlite in tests)
- `src/repo` SQL-backed CRUD
- `src/store` Zustand stores
- `src/app` Expo Router screens
- `src/components` UI

Design spec: `docs/superpowers/specs/2026-09-16-poker-balance-tracker-design.md`
Plan: `docs/superpowers/plans/2026-09-16-poker-balance-tracker.md`
Design system: `docs/design/stitch/felt_ledger/DESIGN.md` (screens: `docs/design/stitch/`)

## Build for a phone

    npm install -g eas-cli
    eas login
    eas build:configure
    eas build --profile preview --platform ios      # or android → APK

## Device checklist (not yet run)

No iOS simulator or Android emulator is available in the environment this app was built in
(Xcode and the Android SDK are not installed). The checklist below has not been run on a device.
To run it: `npm install`, then `npx expo start`, then scan the QR code with the iPhone Camera app
(opens in Expo Go) or with the Expo Go app on Android. Uninstall any previous copy of the app
first so the on-device database starts fresh.

1. **Home, empty.** Only the "Ready to deal?" card — no stat tiles, no past-nights list. The CHIPS
   wordmark and its orange chip glyph sit top-left, the Players and Settings icon buttons top-right.
   Fonts are Manrope (headlines) and Hanken Grotesk (body), not the system face.
2. **New night, step 1.** "Start New Night" → "STEP 1 OF 2 / New Night". Title "Dave's place",
   date today, buy-in preset $20 (emerald). Tap "Custom" → pad → 20 → still $20. "Select Players →".
3. **New night, step 2.** Add "Ann", "Bob", "Cat" through the add-new field — each appears checked.
   Counter reads "3 of 3 players selected". "CLEAR ALL" empties and disables the CTA; re-select all
   three. "Confirm & Start Game →" opens the night. Press back once → home.
4. **Buy-ins view.** Header shows the orange "ACTIVE NIGHT" dot, "Dave's place", and the green
   Pot Pool badge. Tap Ann's `+` twice ($20 $20). Long-press Bob's `+` → 35. Tap Cat's `+` once.
   Pot Pool reads $75. Tap one of Ann's pills → change to $25 → reopen → "Remove" → back to one pill,
   then re-add with `+`.
5. **Edit night.** Tap the header title → rename to "Friday Night Lights", change the date, Save.
   Header updates.
6. **Cash-out view.** "Go to Cash-Out →". Status pill reads "3 still to cash out" in amber and
   "Settle up →" is disabled. Enter Ann 10, Bob 80, Cat 5 → the amber "Off by $20 — cash missing.
   Recount?" banner appears. Fix Cat to 25 → pill turns green "Balanced Pool $115 / $115" and
   "Settle up →" enables.
7. **Settle.** Ann −$35, Bob +$45, Cat −$10 → two transfers (Ann pays Bob $35, Cat pays Bob $10),
   "2 transactions" badge, green ✓ disc, RESULTS sorted descending, DETAILS expands to the table.
8. **Share.** The live preview shows the whole message card. "Share image" → share sheet → Save
   Image → open Photos: 1080 px wide, dark, green CHIPS overline, bulleted transfers, footer pill
   "Pool balanced: $115". "Copy to clipboard" → paste into Notes → matching plain text.
9. **Home again.** The night row shows the title, "date · 3 players" and a green $115 Pot Pool;
   the stat tiles read 1 night / $115 volume. Long-press → Share opens the settle screen and fires
   the share sheet automatically; Cancel it.
10. **Players.** 👤 → rename Cat → Catherine (the night updates). Archive Bob → he vanishes from the
    step-2 checklist. Try to delete Ann → "Player has sessions" error.
11. **Settings.** ⚙︎ → default buy-in 25 → a brand-new night presets to $25 while the old night
    still adds $20. Add chips White $1, Red $5, Blue $10 → long-press → Move down / Delete work.
12. **Chip counter.** Back in the night's cash-out view, tap a row → "Use chips" → count 5 Red and
    2 Blue → tally $45 → "Apply to …'s cash-out" writes $45. Reopen: counts are back to zero.
13. **Editability.** Re-open a settled night, change a cash-out and a buy-in — nothing is locked and
    the settlement recomputes.
14. **Kill the app and relaunch** → every night, player, denomination and setting is still there.
15. **Long-name / 10-player stress.** Create a night with 10 players including "Bartholomew
    Wintersmith" → buy-in rows, cash-out rows, transfer rows and the share preview all stay on one
    line each without clipping at 390 pt.
16. **Confirm & Start Game → back once.** After step 3, the session screen (Buy-ins view) appears
    immediately with Home underneath it — pressing back once goes straight to Home, not back into
    the New Night steps.
17. **Long-press Share fires automatically.** From Home, long-press a settled night and choose
    Share: the settle screen opens and the native share sheet must open on its own once that screen
    has finished laying out, with no extra tap needed.

## Status

Verified by unit tests, type check and Expo bundle export. Not yet run on a device or simulator —
see Device checklist.

No Android emulator or device was available in this environment either, so the Android-specific
checks (platform date dialog instead of the iOS sheet, bottom sheets sitting above the navigation
bar, Manrope loading) have not been run. They are covered by the same Device checklist once an
Android device with Expo Go is available.

v1 on-device only. Sync, leaderboard and charts deferred (see spec §11).
