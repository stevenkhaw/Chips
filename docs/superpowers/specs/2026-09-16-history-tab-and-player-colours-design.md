# History tab, player colours, settle status tap, dark nav container

Date: 2026-09-16. Approved in chat.

## 1. White background behind screens during swipe-back (bug)

expo-router's native stack paints the `UINavigationController` view with the
React Navigation theme `colors.background`. The app provides no theme, so the
light `DefaultTheme` (`rgb(242,242,242)`) applies. `contentStyle` only paints
each screen, not that container, so it shows through during an interactive pop.

Fix: wrap the root `Stack` in `ThemeProvider` (exported by `expo-router`) with
`DarkTheme` and the Felt & Ledger colours (`background: colors.bg`, `card`,
`border`, `text`, `primary: colors.accent`).

## 2. Settlements status disc explains itself on tap

The `✓` / `!` disc in the Settlements header is a status indicator. Tapping it
now opens an alert saying why: balanced, off by X (too much cashed out / cash
missing), or N players not cashed out. No data change.

## 3. Player avatar colour

`Player.colorSeed` already selects `avatarColor(seed)` from an 8-colour palette
(`seed % 8`). A chosen colour is stored as its palette index in `colorSeed`, so
no schema migration is needed. New players still get a random seed.

- Repo: `setPlayerColor(db, id, seed)`; store: `setColor(id, seed)`.
- Players screen: the edit dialog (rename / new) shows the 8 swatches with the
  live avatar preview. Selecting a swatch persists on Save.

## 4. History tab

### Routes
```
src/app/_layout.tsx            root Stack: (tabs) + pushed screens
src/app/(tabs)/_layout.tsx     Tabs: index (Home), history
src/app/(tabs)/index.tsx       moved from src/app/index.tsx
src/app/(tabs)/history.tsx     new
```
`players`, `settings`, `new-session`, `session/[id]/*` stay in the root stack
so they push over the tab bar. Tab bar: card background, hairline top border,
accent active tint, SF Symbols via `expo-symbols` with text fallback.

### Domain (`src/domain/history.ts`, pure, unit-tested)
Input: all `SessionDetail` in chronological order (date asc, createdAt asc).
Output:
- `nights[]`: `{ session, nets: Record<playerId, number | null> }` where net is
  cashout − buy-ins for players in that night, `null` while pending cash-out.
- `players[]`: `{ playerId, name, colorSeed, nightsPlayed, totalNetCents,
  cumulative: (number | null)[] }` — one entry per night; `null` when the
  player was not in that night or is pending; otherwise running total.
  Sorted by `totalNetCents` desc. Only players who appear in ≥1 night.
Pending or absent nights leave the running total unchanged.

### Repo / store
`listSessionDetails(db)` returns every non-deleted session's detail in
chronological order. The History screen calls it and memoises on
`useSessionsStore.summaries` so edits elsewhere refresh it.

### UI (top → bottom)
1. Graph — cumulative net per player, one polyline per player in the avatar
   colour, x = nights in date order, y = cents with a zero baseline, legend of
   avatar dots + names. `react-native-svg` only; no chart library.
2. Standings — player · nights · total net (signed, coloured) · avg per night.
3. Nights table — rows = nights (title/date), columns = players, cell = that
   night's net ("—" when pending or absent); horizontal scroll; last row =
   running totals. Tapping a night opens the session.
Empty state when there are no nights.

### Verification
`jest` (domain + repo), `tsc --noEmit`, `expo lint`. Device behaviour (swipe
back, tabs) checked by the developer on Expo Go / TestFlight — no simulator
on this machine.
