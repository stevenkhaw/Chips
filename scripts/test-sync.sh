#!/usr/bin/env bash
# Runs the sync integration test against the local Supabase stack (supabase start).
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
# jest-expo's default (native) fetch is stubbed to no-ops for unit tests, so it can't reach a
# real server. EXPO_PUBLIC_USE_RN_FETCH=1 is expo/src/winter's own escape hatch back to React
# Native's fetch polyfill, which does perform real network requests under Jest.
CHIPS_SUPABASE_URL="$API_URL" CHIPS_SUPABASE_KEY="$PUBLISHABLE_KEY" EXPO_PUBLIC_USE_RN_FETCH=1 npx jest src/sync/sync.integration.test.ts --runInBand
