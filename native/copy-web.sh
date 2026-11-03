#!/usr/bin/env bash
# Populate native/www with the repo's static web app.
# The website's own files stay out (2026-10-29): inside the app index.html is the welcome and never loads the
# homepage's pictures (site-img/), GSAP (vendor/), home.css or home.js. fonts/ stays: the public pages the app can
# show (terms, the FAQ, a coach's profile) read Archivo from it through site.css.
# Capacitor's CLI rejects webDir:"..", so we mirror the served files into a real
# subdirectory (www) that the native build bundles. www/ is a generated artifact
# (gitignored) — re-run this (or `npm run sync`) after changing the web app.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # native/
ROOT="$(cd "$HERE/.." && pwd)"                          # repo root
DEST="$HERE/www"

mkdir -p "$DEST"

rsync -a --delete \
  --exclude 'native' \
  --exclude 'api' \
  --exclude 'native-ios' \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'sql' \
  --exclude 'supabase' \
  --exclude 'docs' \
  --exclude 'tmp' \
  --exclude 'plates' \
  --exclude '/site-img' \
  --exclude '/vendor' \
  --exclude '/home.css' \
  --exclude '/home.js' \
  --exclude '*.md' \
  --exclude 'deploy.sh' \
  --exclude 'seed-demo.mjs' \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'ai-config.local.js' \
  --exclude 'tests.html' \
  --exclude 'test' \
  --exclude 'index-bold.html' \
  --exclude 'review.html' \
  --exclude 'vercel.json' \
  --exclude '.DS_Store' \
  --exclude '.claude' \
  --exclude '.claude-flow' \
  --exclude '.impeccable' \
  --exclude '*.db' \
  --exclude 'scratchpad' \
  --exclude 'scratchpad-shots' \
  --exclude 'ds-bundle' \
  --exclude '.design-sync' \
  --exclude 'showreel' \
  --exclude 'APP-STORE-*' \
  --exclude 'admin.html' \
  --exclude 'codemagic.yaml' \
  --exclude '* 2.*' \
  --delete-excluded \
  "$ROOT/" "$DEST/"

# The shell transmits no analytics (Apple 5.1.2): drop the Plausible tag from the bundled
# pages rather than loading a remote script into the privileged WebView and muting it.
for f in "$DEST"/*.html; do
  sed -i '' -E '/<script[^>]*plausible\.io\/js\/script[^>]*><\/script>/d' "$f"
done
# The bundle's stamp: which web code this build of the app carries. A problem report from the app (feedback.js) sends
# it as the app version until a build offers its own (Capacitor's App plugin). The commit and when, nothing else.
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf '{"commit":"%s","built":"%s"}\n' "$COMMIT" "$(date -u +%Y-%m-%dT%H:%MZ)" > "$DEST/bundle-info.json"
echo "Copied web app into $DEST"
