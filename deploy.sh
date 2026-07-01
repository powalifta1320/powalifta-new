#!/usr/bin/env bash
# ============================================================
# POWALIFTA — one-command Supabase ops.
#
# Deploys all edge functions with the CORRECT per-function JWT setting and
# pushes secrets, so you never touch the Supabase dashboard for either.
#
# ONE-TIME SETUP:
#   npx --yes supabase login
#   npx --yes supabase link --project-ref cxnotrikxvzncupswvio
#   cp .env.example .env        # then fill in real values
#
# USAGE:
#   ./deploy.sh                 # deploy all functions + push secrets
#   ./deploy.sh functions       # functions only
#   ./deploy.sh secrets         # secrets only
#
# Needs Node (for npx). No global install required — falls back to `npx supabase`
# unless a `supabase` binary is already on PATH.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

# Prefer a globally-installed binary; otherwise use npx.
if command -v supabase >/dev/null 2>&1; then SB=(supabase); else SB=(npx --yes supabase); fi

# Public webhooks / unauthenticated callers — deploy WITHOUT JWT verification.
# send-weekly-digest is cron-triggered (no user session) → gates on CRON_SECRET.
NO_JWT=(ls-webhook ls-marketplace-webhook send-welcome send-client-error send-weekly-digest unsubscribe)
# Require a logged-in caller's JWT.
WITH_JWT=(send-program-assigned send-push ai-chat send-invite delete-account ls-portal)

deploy_functions() {
  for fn in "${NO_JWT[@]}"; do
    echo "→ deploy $fn  (no JWT)"
    "${SB[@]}" functions deploy "$fn" --no-verify-jwt
  done
  for fn in "${WITH_JWT[@]}"; do
    echo "→ deploy $fn  (JWT required)"
    "${SB[@]}" functions deploy "$fn"
  done
}

push_secrets() {
  [[ -f .env ]] || { echo "✗ no .env — run:  cp .env.example .env  then fill it in"; exit 1; }
  # Supabase reserves the SUPABASE_ prefix — strip those, comments, and blanks.
  grep -vE '^[[:space:]]*(#|SUPABASE_|$)' .env > .env.deploy.tmp || true
  if [[ -s .env.deploy.tmp ]]; then
    echo "→ pushing $(grep -c . .env.deploy.tmp) secrets from .env"
    "${SB[@]}" secrets set --env-file .env.deploy.tmp
  else
    echo "! no pushable secrets found in .env"
  fi
  rm -f .env.deploy.tmp
}

case "${1:-all}" in
  functions) deploy_functions ;;
  secrets)   push_secrets ;;
  all)       deploy_functions; push_secrets ;;
  *) echo "usage: ./deploy.sh [functions|secrets|all]"; exit 1 ;;
esac
echo "✓ done"
