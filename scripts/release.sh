#!/usr/bin/env bash
# Build a release for both platforms on EAS:
#   iOS     -> production build, auto-submitted to TestFlight
#   Android -> preview APK; text the install link EAS prints to Android testers
# Both builds read the production EAS environment (Supabase keys).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is dirty; commit or stash before releasing." >&2
  exit 1
fi

npx jest
npx tsc --noEmit

eas build --platform ios --profile production --auto-submit --non-interactive --no-wait
eas build --platform android --profile preview --non-interactive --no-wait

echo
echo "Both builds are queued. Watch them at https://expo.dev (or: eas build:list)."
echo "When the Android build finishes, text its install link to Android testers."
