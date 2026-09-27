# Shared houses phase 4: invite links and invite text — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner taps **Share invite** (or **Copy invite text**) and sends one message. A friend taps the link in it and Chips opens on a prefilled join screen. One tap on **Join house** makes them a reader. If Chips isn't installed, the link opens a web page with install buttons and an **Open in Chips** button.

**Architecture:**
- **Pure domain:** `src/domain/invite.ts` builds and parses both link forms and builds the invite text. It is fully unit tested and imported by `+native-intent.tsx`, so it must stay dependency-free.
- **Network:** `src/sync/remote.ts` gains `rpcJoinHouseByLink`, `fetchInviteSecret` and `rpcResetInviteLink`. `src/sync/join.ts` gains `joinByLink`, which shares its post-join tail with `joinByCode`.
- **Secrets on the phone:** `src/sync/passwords.ts` also caches the owner's invite secret in expo-secure-store, next to the password. The server remains the source of truth: an owner can always re-read `house_secrets` (RLS: owner only).
- **Routing:** `src/app/+native-intent.tsx` rewrites every incoming invite URL (https, `chips://`, Expo Go `exp://…/--/join`) to `/houses/join?h=…&s=…`. The join screen gains a link mode.
- **OS link verification:** `app.json` declares `associatedDomains` (iOS) and an auto-verified `intentFilter` (Android). The two `.well-known` files live at the root of a **user** GitHub Pages site (see Decision 1). The fallback page `docs/join/index.html` is served from this repo's existing project site.

**Tech Stack:** Expo SDK 57, expo-router `+native-intent`, expo-linking, React Native `Share`, expo-secure-store, supabase-js v2, Jest, Supabase CLI local stack.

**Spec:** `docs/superpowers/specs/2026-09-23-shared-houses-sync-design.md` §2.4, §2.5, §2.6 (reset link), §6.1 (link parsing and invite text), §6.3 and §7 (invalid invite). Server contract: `supabase/migrations/20260924120200_house_rpcs.sql` (`join_house_by_link`, `reset_house_link`, `remove_member`).

## Global Constraints

- **Expo docs.** Before writing Expo API code, read https://docs.expo.dev/versions/v57.0.0/ (AGENTS.md). For this phase that means these pages, at their SDK 57 versions:
  - Router "Customizing links" (`+native-intent`, `redirectSystemPath`);
  - "iOS Universal Links" and "Android App Links";
  - `expo-linking`.

  The config shapes below come from `@expo/config-types` in `node_modules`. Confirm them against the docs before building. (The docs site was unreachable from the environment that wrote this plan.)
- **Install commands.** `npx expo install <pkg>` only. This phase should need no new package: `expo-linking` and `expo-secure-store` are already installed, and `Share` is React Native core.
- **Verification.** `npx jest`, `npx tsc --noEmit` and `npx expo export --platform ios --output-dir <tmp>` must pass at the end of every task. Delete the tmp dir afterwards. Tasks 2 and 6 also run `npm run test:sync` against `supabase start`.
  - Do not run `expo lint`. Delete `eslint.config.js` if it appears.
- **Jest isolation** (unchanged from phase 3):
  - Tests never import `src/sync/client.ts`.
  - Stores never import `src/sync/*`.
  - `src/domain/invite.ts` imports nothing from the app, because `+native-intent.tsx` runs before the app mounts.
- **Secret hygiene.**
  - The invite secret never goes into a log, `console.*`, an error message or analytics.
  - In https links it sits in the URL **fragment**, which browsers never send to a server.
  - `docs/join/index.html` loads no third-party script, font or image, and sets `<meta name="referrer" content="no-referrer">`.
- **Server contract.**
  - `join_house_by_link(p_house_id uuid, p_secret text, p_display_name text default null)` returns the same jsonb as `join_house`, except it never returns `locked`: `{ok:true, house, role}` or `{ok:false, error:'invalid'}`. `invalid` covers a wrong secret, a rotated secret and a deleted house.
  - `reset_house_link(p_house_id)` returns the new secret.
  - `remove_member` returns the new secret.
  - The owner can `select invite_secret from house_secrets where house_id = …`. A reader gets zero rows (RLS).
  - Secret format: 43 characters of `[A-Za-z0-9_-]` (32 bytes, url-safe base64, no padding). House id: lowercase uuid.
- **Commits.**
  - Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Work on branch `feat/shared-houses-phase4`.
  - Do not merge or push without Steven's go-ahead.

## Decisions made for this plan

1. **Where the `.well-known` files live.** Apple and Android only look for `apple-app-site-association` and `assetlinks.json` at `https://<host>/.well-known/`. This repo's Pages site is a project site at `https://stevenkhaw.github.io/Chips/`, so spec §2.4's `docs/.well-known/` would be served at `/Chips/.well-known/`, where neither OS looks.
   - **Chosen:** a tiny user-site repo, `stevenkhaw/stevenkhaw.github.io`, that holds only `.nojekyll` and `.well-known/`. It serves at the domain root.
   - The canonical copies stay in this repo under `deploy/user-site/`, so they are reviewed in git.
   - The join page itself stays in this repo at `docs/join/index.html`.
   - Steven creates the user-site repo (Task 5). If Apple's CDN refuses GitHub's `application/octet-stream` content type for the extensionless file, the fallback is a free Cloudflare Pages site with a `_headers` file. Task 6 checks this.
2. **Link shapes.**
   - `https://stevenkhaw.github.io/Chips/join/#h=<house_id>&s=<secret>`. The trailing slash avoids a GitHub 301 from `/join` to `/join/`.
   - `chips://join?h=<house_id>&s=<secret>`.
   - Both are built from the constants `INVITE_WEB_BASE` and `APP_SCHEME` in `src/domain/invite.ts`.
3. **No house name in the link.** The join screen doesn't know the house name until the RPC succeeds, so it shows a generic "You've been invited to a Chips house" and names the house in the success alert. This keeps links short and avoids showing an unverified, attacker-chosen name.
4. **Tapping a link never joins silently.** It always lands on the confirm screen (spec §2.4). If the house is already on this phone, the screen says so and offers **Open** instead of **Join**.
5. **Invite secret source.**
   - The owner's phone caches the secret in secure store under `house-invite-<id>`, written by publish, reset link and remove member.
   - The Sharing section also re-reads it from the server whenever it opens and refreshes the cache. This covers houses published before phase 4, when `shareHouse` discarded the secret.
   - Offline with no cache, the invite text falls back to code only (and the password, if saved).
6. **Deleting, leaving or purging a house** also deletes its cached password and invite secret.
7. **Expo Go.**
   - Expo Go opens neither universal links nor `chips://`. It uses `exp://<ip>:8081/--/…`.
   - The parser also accepts `…/--/join?h=…&s=…`, so the flow can be tested in Expo Go by opening such a URL with `npx uri-scheme open` or a pasted link.
   - Universal and App Links can only be verified in an EAS build (TestFlight or preview APK).

## File Structure

| Path | Responsibility |
|---|---|
| `src/domain/invite.ts` (new) | `INVITE_WEB_BASE`, `APP_SCHEME`, `buildWebLink`, `buildAppLink`, `parseInviteUrl`, `buildInviteText` |
| `src/domain/invite.test.ts` (new) | Link round-trips, malformed links, invite text variants |
| `src/sync/remote.ts` | + `rpcJoinHouseByLink`, `fetchInviteSecret`, `rpcResetInviteLink` |
| `src/sync/join.ts` | + `joinByLink`; shared `finishJoin` |
| `src/sync/passwords.ts` | + `saveInviteSecret`, `loadInviteSecret`, `forgetHouseSecrets` |
| `src/store/syncActions.ts` | `shareHouse` caches the secret; + `joinHouseByLink`, `loadInvite`, `resetInviteLink`; `removeHouseMember` caches the new secret; leave, purge and delete forget secrets |
| `src/store/houseActions.ts` | `deleteHouse` forgets secrets (via an injected hook; stores must not import `src/sync/*`, see Task 2) |
| `src/sync/sync.integration.test.ts` | + link join, rotated link, reader can't read secrets |
| `src/store/syncActions.test.ts` | + secret caching and forgetting |
| `src/app/+native-intent.tsx` (new) | Rewrites invite URLs to `/houses/join?h&s` |
| `src/app/houses/join.tsx` | Link mode (prefilled, one-tap confirm, already-a-member, bad link) |
| `src/app/houses/[id].tsx` | Invite block: Share invite, Copy invite text, Reset link, "the invite is the house key" note |
| `app.json` | `ios.associatedDomains`, `android.intentFilters` |
| `deploy/user-site/.well-known/apple-app-site-association` (new) | Canonical AASA (copied to the user-site repo) |
| `deploy/user-site/.well-known/assetlinks.json` (new) | Canonical Digital Asset Links |
| `deploy/user-site/.nojekyll`, `deploy/user-site/README.md` (new) | What the repo is and how to deploy it |
| `docs/join/index.html` (new) | Fallback page: Open in Chips, install buttons |
| `README.md`, handoff, spec §2.4 | Docs |

---

### Task 1: Invite links and invite text (pure)

**Files:**
- Create: `src/domain/invite.ts`, `src/domain/invite.test.ts`

**Interfaces:**
```ts
export const INVITE_WEB_BASE = 'https://stevenkhaw.github.io/Chips/join/';
export const APP_SCHEME = 'chips';

export interface Invite { houseId: string; secret: string }
export type ParsedInvite = { kind: 'invite'; invite: Invite } | { kind: 'bad' } | null;

export function buildWebLink(i: Invite): string;   // `${INVITE_WEB_BASE}#h=…&s=…`
export function buildAppLink(i: Invite): string;   // `chips://join?h=…&s=…`
/**
 * null: not a join URL at all (let the router handle it).
 * bad: a join URL whose h/s are missing or malformed.
 */
export function parseInviteUrl(url: string): ParsedInvite;

export function buildInviteText(a: {
  houseName: string;
  joinCode: string | null;
  password: string | null;
  invite: Invite | null;
}): string;
```

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/shared-houses-phase4
```

- [ ] **Step 2: Write the failing tests** in `src/domain/invite.test.ts`

```ts
import { APP_SCHEME, INVITE_WEB_BASE, buildAppLink, buildInviteText, buildWebLink, parseInviteUrl } from './invite';

const houseId = '0b7a6c7e-3f7e-4f6e-9a55-1c2d3e4f5a6b';
const secret = 'Ab_-0123456789abcdefghijklmnopqrstuvwxyzABC'; // 43 chars
const inv = { houseId, secret };

describe('invite links', () => {
  it('builds both forms', () => {
    expect(buildWebLink(inv)).toBe(`${INVITE_WEB_BASE}#h=${houseId}&s=${secret}`);
    expect(buildAppLink(inv)).toBe(`${APP_SCHEME}://join?h=${houseId}&s=${secret}`);
  });

  it.each([
    ['web', buildWebLink(inv)],
    ['web without trailing slash', `https://stevenkhaw.github.io/Chips/join#h=${houseId}&s=${secret}`],
    ['app', buildAppLink(inv)],
    ['app, params reversed', `chips://join?s=${secret}&h=${houseId}`],
    ['app, triple slash', `chips:///join?h=${houseId}&s=${secret}`],
    ['expo go', `exp://192.168.1.5:8081/--/join?h=${houseId}&s=${secret}`],
    ['uppercase uuid', buildAppLink({ houseId: houseId.toUpperCase(), secret })],
  ])('parses %s', (_, url) => {
    expect(parseInviteUrl(url)).toEqual({ kind: 'invite', invite: { houseId, secret } });
  });

  it.each([
    ['missing secret', `chips://join?h=${houseId}`],
    ['short secret', `chips://join?h=${houseId}&s=abc`],
    ['secret with bad chars', `chips://join?h=${houseId}&s=${secret.slice(0, 42)}+`],
    ['bad uuid', `chips://join?h=not-a-uuid&s=${secret}`],
    ['web, secret in query not fragment', `${INVITE_WEB_BASE}?h=${houseId}&s=${secret}`],
    ['duplicate h', `chips://join?h=${houseId}&h=${houseId}&s=${secret}`],
  ])('rejects %s as bad', (_, url) => {
    expect(parseInviteUrl(url)).toEqual({ kind: 'bad' });
  });

  it.each([
    'chips://',
    'chips://houses/new',
    '/session/abc',
    'https://stevenkhaw.github.io/Chips/privacy-policy.html',
    'https://evil.example/Chips/join/#h=x&s=y',
    'https://stevenkhaw.github.io/Chips/joinery',
  ])('ignores non-invite url %s', (url) => {
    expect(parseInviteUrl(url)).toBeNull();
  });
});

describe('buildInviteText', () => {
  it('has every line when everything is known', () => {
    expect(buildInviteText({ houseName: 'Tuesday Crew', joinCode: 'K7QXM2PA', password: 'hunter22', invite: inv })).toBe(
      [
        'Join my Chips house "Tuesday Crew"',
        `Tap: ${buildWebLink(inv)}`,
        `Or: ${buildAppLink(inv)}`,
        'Or in the app → Join house:',
        '  Code: K7QX-M2PA',
        '  Password: hunter22',
      ].join('\n'),
    );
  });

  it('omits the password when this phone does not know it', () => {
    const t = buildInviteText({ houseName: 'H', joinCode: 'K7QXM2PA', password: null, invite: inv });
    expect(t).not.toMatch(/Password/);
    expect(t).toMatch(/Code: K7QX-M2PA$/);
  });

  it('falls back to code only without a secret', () => {
    const t = buildInviteText({ houseName: 'H', joinCode: 'K7QXM2PA', password: 'pw12', invite: null });
    expect(t).not.toMatch(/Tap:|Or:/);
    expect(t).toMatch(/Join house:\n  Code: K7QX-M2PA\n  Password: pw12$/);
  });
});
```

Run `npx jest src/domain/invite.test.ts`. Expect failure (module missing).

- [ ] **Step 3: Implement `src/domain/invite.ts`**

Rules:
- **Where the params come from.** A web link takes `h` and `s` from the fragment only. The `chips` and `exp` forms take them from the query only.
- **Hand-parse.** Split on `#` and `?`, then `&` and `=`. Do not use `URL`: RN's `URL` differs across engines and custom schemes, and this module runs inside `+native-intent`.
- **Which URLs are join URLs.**
  - Web: the scheme is `https:`, the host is exactly `stevenkhaw.github.io`, and the path is `/Chips/join` or `/Chips/join/`.
  - App: `chips:` whose path, with leading slashes stripped, is `join`.
  - Expo Go: any scheme whose path ends in `/--/join`.
  - Everything else returns `null`.
- **Validation.** UUID regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, lowercase it on output. Secret regex `/^[A-Za-z0-9_-]{43}$/`. Reject duplicate keys. Ignore unknown keys.
- **Formatting.** `buildInviteText` uses `formatJoinCode` from `./joinCode`. Omit the whole "Or in the app" block when `joinCode` is null.

- [ ] **Step 4: Verify and commit**

`npx jest`, `npx tsc --noEmit`, iOS export.

```bash
git add src/domain/invite.ts src/domain/invite.test.ts
git commit -m "feat(invite): build and parse invite links, invite text

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Join by link, invite secret, reset link (network + actions)

**Files:**
- Modify: `src/sync/remote.ts`, `src/sync/join.ts`, `src/sync/passwords.ts`, `src/store/syncActions.ts`, `src/store/houseActions.ts`, `src/app/_layout.tsx`
- Test: `src/sync/sync.integration.test.ts`, `src/store/syncActions.test.ts`

**Interfaces:**
- `remote.ts`:
  - `rpcJoinHouseByLink(client, houseId, secret, displayName?): Promise<JoinResponse>`
  - `fetchInviteSecret(client, houseId): Promise<string | null>`: null when RLS hides the row (reader).
  - `rpcResetInviteLink(client, houseId): Promise<string>`
- `join.ts`:
  - `joinByLink(db, client, invite: Invite, displayName?): Promise<LinkJoinOutcome>`
  - `type LinkJoinOutcome = { ok: true; houseId; role; added: boolean } | { ok: false; error: 'invalid' }`
  - `joinByCode` also returns `added`. `stores.test.ts` and `houses/join.tsx` must still compile.
- `passwords.ts`:
  - `saveInviteSecret(id, s)`, `loadInviteSecret(id)`
  - `forgetHouseSecrets(id)`: deletes both keys and never throws.
- `syncActions.ts`:
  - `joinHouseByLink(invite, displayName): Promise<LinkJoinOutcome>`: sets the current house and reloads on success.
  - `loadInvite(houseId): Promise<{ invite: Invite | null; password: string | null }>`: server first, then the cache; refreshes the cache.
  - `resetInviteLink(houseId): Promise<Invite>`
  - `shareHouse` saves the invite secret (after the password, before the push).
  - `removeHouseMember` saves the returned secret.
  - `leaveHouse`, `removeClosedHouse` and the "removed" purge path in `syncHouse` call `forgetHouseSecrets`.
- `houseActions.ts` must not import `src/sync/*` (Jest isolation). Add:

  ```ts
  let onHouseDeleted: ((houseId: string) => void) | null = null;
  export function setOnHouseDeleted(fn: typeof onHouseDeleted) { onHouseDeleted = fn; }
  ```

  `deleteHouse` calls `onHouseDeleted?.(id)` after the local delete succeeds. `_layout.tsx` wires it to `(id) => void forgetHouseSecrets(id)`.

- [ ] **Step 1: Failing integration tests** (append inside `describeIt`)

```ts
  it('a reader joins by link and gets the same ledger', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(ownerDb);
    const { inviteSecret } = await publishAndPush(ownerDb, owner, house.id, 'hunter22');
    expect(await remote.fetchInviteSecret(owner, house.id)).toBe(inviteSecret);

    const readerDb = createTestDb();
    const reader = newClient();
    expect(await joinByLink(readerDb, reader, { houseId: house.id, secret: inviteSecret }, 'Rae'))
      .toEqual({ ok: true, houseId: house.id, role: 'reader', added: true });
    expect(snapshot(readerDb, house.id)).toEqual(snapshot(ownerDb, house.id));
    expect(await remote.fetchInviteSecret(reader, house.id)).toBeNull(); // RLS: owner only
    expect(await joinByLink(readerDb, reader, { houseId: house.id, secret: inviteSecret }))
      .toEqual({ ok: true, houseId: house.id, role: 'reader', added: false });
  });

  it('reset link and remove member invalidate the old link', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(ownerDb);
    const { inviteSecret: first } = await publishAndPush(ownerDb, owner, house.id, 'hunter22');
    const second = await remote.rpcResetInviteLink(owner, house.id);
    expect(second).not.toBe(first);
    expect(await joinByLink(createTestDb(), newClient(), { houseId: house.id, secret: first })).toEqual({ ok: false, error: 'invalid' });

    const readerDb = createTestDb();
    const reader = newClient();
    await joinByLink(readerDb, reader, { houseId: house.id, secret: second });
    const readerId = await remote.currentUserId(reader);
    const third = await rpcRemoveMember(owner, house.id, readerId);
    expect(await remote.fetchInviteSecret(owner, house.id)).toBe(third);
    expect(await joinByLink(createTestDb(), newClient(), { houseId: house.id, secret: second })).toEqual({ ok: false, error: 'invalid' });
  });

  it('a link to a deleted house is invalid', async () => {
    // Owner publishes, soft-deletes the house locally, pushes; joinByLink → invalid.
  });
```

Write the third test in full following the existing "deleted house reads closed" test. Run `npm run test:sync` and expect failures.

- [ ] **Step 2: Failing unit tests** in `src/store/syncActions.test.ts`
- `shareHouse` stores the secret the (mocked) `rpcCreateHouse` returned: `loadInviteSecret(id)` resolves to it.
- `leaveHouse` clears both `loadPassword` and `loadInviteSecret`.
- `loadInvite`:
  - falls back to the cached secret when `fetchInviteSecret` rejects with a network error;
  - returns `invite: null` when both are empty.

  Mock `fetchInviteSecret` in the existing `jest.mock('@/sync/remote', …)` block.

- [ ] **Step 3: Implement**
- `remote.ts`: follow the existing `withStatus` pattern.
  - `fetchInviteSecret`: `client.from('house_secrets').select('invite_secret').eq('house_id', id).maybeSingle()`.
  - `rpcJoinHouseByLink`: calls `join_house_by_link` with `p_house_id`, `p_secret`, `p_display_name`.
- `join.ts`: extract the tail of `joinByCode` into `finishJoin(db, client, r)`, which returns `added`. `joinByLink` does `ensureSession(client, { allowNewUser: !hasPublishedHouses(db) })` → RPC → `finishJoin`.
- `syncActions.ts`: as in the interfaces above. `loadInvite` catches only the fetch: `describeSyncError(e).kind === 'offline'` → use the cache; anything else rethrows.

- [ ] **Step 4: Verify** (`supabase start`, `npm run test:sync`, `npx jest`, `npx tsc --noEmit`, iOS export) **and commit**

```bash
git commit -am "feat(sync): join by link, invite secret cache, reset link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Route invite URLs to the join screen

**Files:**
- Create: `src/app/+native-intent.tsx`
- Modify: `src/app/houses/join.tsx`

- [ ] **Step 1: `+native-intent.tsx`**

```tsx
import { parseInviteUrl } from '@/domain/invite';

/** Every invite URL (https, chips://, Expo Go) lands on the join screen, prefilled. Never joins by itself. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const p = parseInviteUrl(path);
    if (p?.kind === 'invite') return `/houses/join?h=${p.invite.houseId}&s=${p.invite.secret}`;
    if (p?.kind === 'bad') return '/houses/join?bad=1';
    return path;
  } catch {
    return '/'; // docs advise never throwing from here
  }
}
```

Confirm against the SDK 57 "Customizing links" page:
- the export name;
- whether `path` arrives as the full URL (with scheme, host and fragment) for both cold and warm starts. `node_modules/expo-router/build/link/linking.js` passes the raw URL on warm starts.

If the fragment is stripped on either platform, stop and raise it with Steven before switching the web link to a query string. The fragment choice is a privacy decision from spec §2.4.

- [ ] **Step 2: Join screen link mode.** Read `h`, `s` and `bad` with `useLocalSearchParams`.
- **Valid `h` and `s`** (re-validate them with `parseInviteUrl(buildAppLink(...))`; never trust params):
  - Title "Join a house". Caption "You've been invited to a Chips house. You'll see its nights and balances; only the owner can edit."
  - The "Your name (optional)" field. A **Join house** button.
  - A text button **Use a code instead**, which clears the params with `router.setParams({ h: undefined, s: undefined })`.
  - If `useHousesStore` already has `h`: the banner "This house is already on your phone." and an **Open** button, which runs `switchHouse(h)` then `router.dismissTo('/')`.
- **Success:** `Alert.alert('Joined', \`You're now viewing "${name}".\`)` with the name from the houses store after reload, then `router.dismissTo('/')`.
- **`invalid`:** the banner "This invite is no longer valid. Ask the owner for a new one." (spec §7), then fall back to code mode.
- **`bad=1`:** the banner "That invite link is incomplete. Ask the owner to send it again, or use the code." with code mode shown.
- **Errors:** thrown errors go through `describeSyncError` as today.
- **Code mode** is unchanged.

- [ ] **Step 3: Manual check in Expo Go**

```bash
npx expo start
# in another terminal, with the phone on the same LAN:
npx uri-scheme open "exp://<lan-ip>:8081/--/join?h=<uuid>&s=<43 chars>" --ios   # or paste the URL into Notes and tap it
```

Check four things:
- the screen prefills;
- a garbage secret shows the incomplete-link banner;
- a real link from the local stack joins;
- tapping it again shows "already on your phone".

- [ ] **Step 4: Verify and commit**

```bash
git add src/app/+native-intent.tsx src/app/houses/join.tsx
git commit -m "feat(houses): invite links open a prefilled join screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Invite actions in House settings

**Files:**
- Modify: `src/app/houses/[id].tsx`

- [ ] **Step 1: Invite block** at the top of `SharingSection`, above the join code. Call `loadInvite(house.id)` on mount and keep `{ invite, password }` in state.
  - **Share invite** (primary): `Share.share({ message: buildInviteText(…) })` from `react-native`. Ignore a dismissed sheet.
  - **Copy invite text** (secondary): `copyToClipboard`, then the existing "Copied" alert.
  - Caption, from spec §2.5: "Anyone with this invite can join as a viewer. Reset the link or password to stop new joins; current members stay."
  - With `invite === null`, add the caption "Link unavailable offline — the invite has the code only."
  - The existing saved-password display replaces its own `loadPassword` call with the `password` from `loadInvite`, so there is one source.
- [ ] **Step 2: Reset link** button, next to Reset password. It confirms with "Old invite links stop working. Current members stay.", calls `resetInviteLink` and updates state.
- [ ] **Step 3: Remove member.**
  - After `removeHouseMember`, re-run `loadInvite` (the secret rotated).
  - Change the alert copy to: "They lose access now and old invite links stop working. To keep them out, also reset the password."
- [ ] **Step 4: Unpublished owner.** Update the Share house success alert to offer **Share invite** right away. Buttons: `Later`, `Share invite`; the latter opens the share sheet with the new text.
- [ ] **Step 5: Verify and commit**

```bash
git commit -am "feat(houses): share and copy invite text, reset invite link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: OS link verification and the fallback page

**Files:**
- Modify: `app.json`
- Create: `deploy/user-site/.nojekyll`, `deploy/user-site/README.md`, `deploy/user-site/.well-known/apple-app-site-association`, `deploy/user-site/.well-known/assetlinks.json`, `docs/join/index.html`

- [ ] **Step 1: `app.json`**

```jsonc
"ios": {
  "bundleIdentifier": "com.stevenkhaw.chips",
  "associatedDomains": ["applinks:stevenkhaw.github.io"],
  …
},
"android": {
  …,
  "intentFilters": [
    {
      "action": "VIEW",
      "autoVerify": true,
      "data": [{ "scheme": "https", "host": "stevenkhaw.github.io", "pathPrefix": "/Chips/join" }],
      "category": ["BROWSABLE", "DEFAULT"]
    }
  ]
}
```

EAS turns on the Associated Domains capability for the App ID at build time. Check that the next build log says so.

- [ ] **Step 2: AASA** (`deploy/user-site/.well-known/apple-app-site-association`, no extension, JSON)

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["<TEAM_ID>.com.stevenkhaw.chips"],
        "components": [{ "/": "/Chips/join*", "comment": "Chips invite links; secret is in the fragment" }]
      }
    ]
  }
}
```

`<TEAM_ID>` is the Apple Developer Team ID (developer.apple.com → Membership, or `eas credentials -p ios`). It is not a secret. Ask Steven for it; don't guess.

- [ ] **Step 3: assetlinks** (`deploy/user-site/.well-known/assetlinks.json`)

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.stevenkhaw.chips",
      "sha256_cert_fingerprints": ["<SHA256 of the EAS Android upload/signing key>"]
    }
  }
]
```

Get the fingerprint with `eas credentials -p android` → the preview/production keystore → SHA-256. If a Play Store build is added later, append Play's app-signing fingerprint.

- [ ] **Step 4: `deploy/user-site/README.md`.** Explain:
  - These files are deployed to the `stevenkhaw/stevenkhaw.github.io` repo root, and why (Decision 1).
  - They are copied by hand when they change.
  - How to check them: see Task 6.

- [ ] **Step 5: `docs/join/index.html`.** Self-contained, same look as `privacy-policy.html` (dark, `#10B981` links), `<meta name="referrer" content="no-referrer">`, no external requests. Inline script:
  1. Parse `location.hash` with the same rules as `parseInviteUrl`: `h` must be a uuid and `s` 43 url-safe characters.
  2. If valid, show an **Open in Chips** button whose href is `chips://join?h=…&s=…`. If invalid, show "This invite link looks incomplete. Ask the person who sent it to share it again."
  3. The "Don't have Chips yet?" section has two buttons, **iPhone (TestFlight)** and **Android (APK)**. Their hrefs come from two constants at the top of the script: `TESTFLIGHT_URL` and `ANDROID_URL`. Phase 6 fills them in; while empty, hide the button and show "Ask the person who invited you for the install link."
  4. Then: "After installing, come back to this page and tap **Open in Chips**."
  5. Never write the secret into the visible page text.

- [ ] **Step 6: Verify** (`npx jest`, `npx tsc --noEmit`, iOS export; open `docs/join/index.html#h=…&s=…` in a desktop browser) **and commit**

```bash
git add app.json deploy docs/join
git commit -m "feat(links): universal/app link config, well-known files, join fallback page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Deploy, device check, docs (needs Steven)

**Files:**
- Modify: `README.md`, `docs/superpowers/handoffs/2026-09-27-shared-houses-handoff.md`, spec §5.4 status

- [ ] **Step 1: Full local verification**

```bash
supabase start && npm run test:sync && npx jest && npx tsc --noEmit
```

Also run the iOS export. All must pass.

- [ ] **Step 2: Steven deploys the well-known files**
1. Create the public repo `stevenkhaw/stevenkhaw.github.io`, copy `deploy/user-site/*` (including `.nojekyll` and `.well-known/`) into it, and push. Pages serves user sites from the default branch automatically.
2. Confirm the Chips project site still serves: `https://stevenkhaw.github.io/Chips/privacy-policy.html` and `https://stevenkhaw.github.io/Chips/join/`. A user site does not shadow project sites.
3. Check:

   ```bash
   curl -sI https://stevenkhaw.github.io/.well-known/apple-app-site-association   # 200
   curl -s  https://stevenkhaw.github.io/.well-known/assetlinks.json | python3 -m json.tool
   curl -s  https://app-site-association.cdn-apple.com/a/v1/stevenkhaw.github.io   # Apple's CDN copy; can lag up to ~24 h
   ```

   Also run Google's Statement List tester: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://stevenkhaw.github.io&relation=delegate_permission/common.handle_all_urls`.
4. If Apple's CDN never returns the file, fall back to Cloudflare Pages (Decision 1): move `.well-known/` there with a `_headers` file giving `Content-Type: application/json`, and update the host in `app.json` and `INVITE_WEB_BASE`.

- [ ] **Step 3: Builds.** Run `npm run release` (iOS TestFlight + Android preview APK). It needs a clean tree and green tests.

- [ ] **Step 4: Device check** (TestFlight iPhone as owner; Android APK phone, or a second iPhone, as reader)
1. The owner opens House settings → **Share invite** → sends it by iMessage/WhatsApp to the reader.
2. On the reader, tap the `https` line: Chips opens (not Safari) on the prefilled join screen. **Join house** → Home shows the house as Viewing.
3. Tap the same link again → "already on your phone" → **Open**.
4. Tap the `chips://` line in an app that makes it tappable (Notes, iMessage) → same screen.
5. Uninstall Chips on the reader and tap the https link → the web fallback page with install buttons. Reinstall, return and tap **Open in Chips** → the join screen.
6. The owner taps **Reset link**. The old link now shows "This invite is no longer valid…".
7. **Copy invite text** includes the password only on the phone that set it.
8. **Cold start:** force-quit Chips on the reader, tap a fresh link, and confirm the join screen (not Home) appears.

- [ ] **Step 5: Docs**
- **Handoff:** phase 4 done; what was verified on device; the Team ID and fingerprint locations; phase 5 notes (below).
- **README:** a "Invite links" subsection under Server: user-site repo, how to check the well-known files.
- **Spec §2.4:** replace "`docs/.well-known/…`" with a pointer to Decision 1 here.

**Phase 5 notes for the handoff:**
- Account deletion must also call `forgetHouseSecrets` for every owned house.
- A recovered owner (after sign-in on a new phone) gets the invite secret back through `loadInvite` automatically. The password is not recoverable, so prompt a reset.

```bash
git commit -am "docs: phase 4 done, phase 5 notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage check

| Spec item | Task |
|---|---|
| §2.4 https link with the secret in the fragment; `chips://` link | 1 (build/parse), 3 (routing) |
| §2.4 `.well-known` files so links open the app directly | 5, 6 (hosted at the user-site root: Decision 1) |
| §2.4 `docs/join/index.html` fallback with install buttons and "tap again" instructions | 5 (URLs filled in phase 6) |
| §2.4 lands on `/houses/join` prefilled; one-tap confirm; never silent | 3 (Decision 4) |
| §2.4 `join_house_by_link` | 2 |
| §2.5 Copy invite text and Share; password line only when known; "the invite is the house key" note | 1 (text), 4 (UI) |
| §2.6 Reset link (old links stop working, members stay) | 2, 4 |
| §6.1 Link parsing (https fragment and `chips://` query; malformed rejected); invite text with and without password | 1 |
| §6.2 Rotating the secret invalidates the old link | pgTAP (phase 2), plus the Task 2 integration test |
| §6.3 Join by https link and `chips://` link on devices | 6 |
| §7 "This invite is no longer valid. Ask the owner for a new one." | 3 |
