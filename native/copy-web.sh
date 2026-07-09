#!/usr/bin/env bash
# Populate native/www with the repo's static web app.
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
  --exclude 'native-ios' \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'sql' \
  --exclude 'supabase' \
  --exclude 'docs' \
  --exclude 'tmp' \
  --exclude 'plates' \
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
  "$ROOT/" "$DEST/"

echo "Copied web app into $DEST"
