# User-site files for invite links

These files are the canonical copies of what is deployed at the root of
`https://stevenkhaw.github.io/`, from the repo `stevenkhaw/stevenkhaw.github.io`.

iOS (universal links) and Android (App Links) only read `/.well-known/` at the root of a
domain. This repo's Pages site lives under `/Chips/`, so the files can't be served from
`docs/`. See Decision 1 in `docs/superpowers/plans/2026-09-27-shared-houses-phase4-links.md`.

| File | What it does |
|---|---|
| `.well-known/apple-app-site-association` | Lets the app with Team ID `W7A3PP782Z` open `/Chips/join*` links |
| `.well-known/assetlinks.json` | Lets `com.stevenkhaw.chips`, signed with the EAS keystore, open them on Android |
| `.nojekyll` | Makes Pages serve the dot-folder |

When one changes (a new Team ID, a new signing key, or a Play Store app-signing key to add):

1. Edit the file here and commit it.
2. Copy it into `stevenkhaw/stevenkhaw.github.io` at the same path, then push.
3. Check that it's live:

   ```bash
   curl -sI https://stevenkhaw.github.io/.well-known/apple-app-site-association   # 200
   curl -s  https://app-site-association.cdn-apple.com/a/v1/stevenkhaw.github.io   # Apple's cached copy; can lag ~24 h
   curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://stevenkhaw.github.io&relation=delegate_permission/common.handle_all_urls"
   ```

The fallback page for people without the app is `docs/join/index.html`, served from this
repo at `https://stevenkhaw.github.io/Chips/join/`.
