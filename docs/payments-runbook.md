# POWALIFTA — Lemon Squeezy payments runbook

Everything needed to go from "free for everyone" to actually charging coaches, plus how
the marketplace payout split works. Written 2026-07-12. Lemon Squeezy (LS) is **Merchant
of Record** — it collects payment, handles tax/VAT, and remits payouts, so POWALIFTA never
touches card data and never needs a payment processor account.

## The two money flows

| Flow | What it is | LS product type | Webhook | Writes |
|---|---|---|---|---|
| **Coach subscriptions** | Coaches pay monthly for a higher athlete cap (Basic $25 / Pro $50 / Premium $100) | **Subscription** (3 variants) | `ls-webhook` | `profiles.subscription_tier` + `subscription_status` |
| **Marketplace program sales** | Athletes buy a coach's program one-off | **Single-payment** products (created per listing) | `ls-marketplace-webhook` | `program_sales` row + grants access, 80% `coach_payout_cents` |

Tiers → athlete limits (source of truth `app.js` `TIER_LIMITS`, enforced server-side by
`enforce_athlete_limit()` trigger): **free 3 / basic 10 / pro 25 / premium unlimited**.

## Coach subscription checkout — how it's wired today

- `app.js` `LS_CHECKOUT_URLS` holds three **hosted checkout URLs** (one per variant). These
  are already real store URLs (`powalifta.lemonsqueezy.com/checkout/buy/<variant-uuid>`).
- `buildCheckoutUrl(tier, user)` appends `checkout[email]` (prefill) + `checkout[custom][user_id]`
  (so the webhook can match the sub back to the coach) + `checkout[name]`.
- `openUpgradeModal()` renders the 3 tier cards → each CTA opens the checkout in a new tab.
- **Native shell:** the whole upgrade modal + buy paths are gated OFF (Apple 3.1.1 — no
  external web payment for digital goods). Coaches subscribe on the web.
- **Instant reflect:** LS checkout is a new tab; when the coach tabs back to `coach.html`
  the `visibilitychange` handler calls `refreshMyPlan()` → re-reads `profiles` → if the
  webhook already upgraded them, the roster cap + plan card + dunning banner update with a
  toast, no reload. (If they're faster than the webhook, next load catches it.)

## To START CHARGING — the checklist

### 1. Lemon Squeezy dashboard (outside this repo)
1. **Store** exists at `powalifta.lemonsqueezy.com` (it does — the checkout UUIDs resolve).
2. **Subscription product with 3 variants** named so `resolveTier()` matches — easiest is
   literally `Basic` / `Pro` / `Premium` (it also fuzzy-matches substrings + falls back to
   price $25/$50/$100). Confirm each variant's checkout URL equals the UUID in
   `app.js:LS_CHECKOUT_URLS`; if you recreate variants, **update those three URLs**.
3. **Webhook** → Settings → Webhooks → add endpoint pointing at the deployed function:
   `https://cxnotrikxvzncupswvio.supabase.co/functions/v1/ls-webhook`
   - Signing secret: generate one, paste it as the `LEMON_SQUEEZY_WEBHOOK_SECRET` function
     secret (below). **The same secret must be in both places or every event 401s.**
   - Events to send: `subscription_created`, `subscription_updated`, `subscription_cancelled`,
     `subscription_expired`, `subscription_resumed`, `subscription_unpaused`.
4. **Marketplace** (only if selling programs at launch): each published listing needs its own
   single-payment product; point a second webhook at `.../functions/v1/ls-marketplace-webhook`
   with the **same** signing secret, events `order_created` + `order_refunded`.
5. **Test mode first:** flip the store to Test, use LS test cards, confirm a `subscription_created`
   lands and the coach's `subscription_tier` flips. Then go Live.

### E2E test checklist (run in LS Test mode before going live)
Do this end-to-end at least once — the flow has moving parts across client, LS, webhook, and DB.

1. **Sign up a test coach** in the app; note the account email. Stay on Free (3-athlete limit).
2. **Fill the roster to the limit** (3 athletes via invites) → generating a 4th invite should show the
   "hit your plan limit → upgrade" state (`canAddAthlete` false).
3. **Click upgrade → Pro**, complete LS Test checkout with a test card. ⚠️ **Leave the prefilled email
   as-is** (see caveat below).
4. **Watch the webhook fire:** Supabase → Edge Functions → `ls-webhook` logs should show
   `success: true, tier: 'pro'`. The coach's `profiles.subscription_tier` should read `pro`.
5. **Tab back to the coach dashboard** → the `visibilitychange` `refreshMyPlan()` should flip the
   limit to 25 and toast "Plan updated". Generating more invites should now work.
6. **Dunning:** in LS, cancel the test subscription → `subscription_cancelled`/`subscription_status`
   updates → the coach dashboard should show the amber "set to cancel / Resume plan" banner (#35).
7. **Marketplace** (if selling): buy a listing with a test card → `ls-marketplace-webhook` records a
   `program_sales` row, the program appears in the buyer's library, `sold_count` increments.
8. **Refund:** refund the test order in LS → `order_refunded` → `payout_status` flips to `cancelled`,
   `sold_count` decrements. The already-claimed program stays (by design — refund stops billing, not access).
9. **`dryRun`:** `POST {dryRun:true}` to `send-weekly-digest` returns the audience without sending —
   useful to confirm secrets/DB wiring without spamming.

### ⚠️ CAVEAT — checkout email must match the account email (security binding)
As of the 2026-07-13 audit fix, **both** webhooks bind the entitlement to the buyer only when the
`custom_data.user_id`'s profile email **equals the HMAC-signed `user_email`** from checkout; otherwise
they fall back to resolving by that signed email. Practical consequences:
- `buildCheckoutUrl` / `onBuyClick` prefill the checkout email from the logged-in account, so the
  default happy path matches — nothing to do.
- If a buyer **changes the email** at LS checkout to one that isn't their POWALIFTA account email,
  the tier/purchase **won't apply** (webhook returns "no matching user"). This is intended (it stops
  paying to upgrade/entitle a different account), but it's a real support case: tell users to check out
  with the same email they signed up with. Consider locking/read-only-ing the email field at checkout
  in the LS product settings if the plan allows.

### 2. Deploy the backend
```
supabase login && supabase link --project-ref cxnotrikxvzncupswvio   # one-time
# fill .env from .env.example (at minimum LEMON_SQUEEZY_WEBHOOK_SECRET)
./deploy.sh                # deploys all functions + pushes secrets
```

### 3. Run the SQL (Supabase SQL Editor, idempotent, in the documented order)
The subscription columns + tier-enforcement + privilege guard must exist:
`migration-subscription-columns.sql`, `migration-tier-enforcement.sql`,
`migration-profiles-privilege-guard.sql`, and **new** `migration-admin-plan-comp.sql`
(admin comp policy + athlete-limit race fix — see Security below).

### 4. Secrets (`./deploy.sh secrets`)
| Secret | Gates |
|---|---|
| `LEMON_SQUEEZY_WEBHOOK_SECRET` | **required** — both webhooks reject everything without it |
| `LEMON_SQUEEZY_API_KEY` | optional — `ls-portal` signed billing deep-links; without it, coaches manage billing via the LS email-magic-link portal (works, just an extra click) |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — never set them.

## Security posture (audited 2026-07-12, Fable)

- **HMAC-SHA-256 signature verified before any DB write**, constant-time (double-HMAC, no
  length side-channel), fails closed when secret/signature absent. ✅
- **Replay / out-of-order guard** (added this pass): `ls-webhook` persists LS's monotonic
  `updated_at` into `subscription_updated_at` and refuses an event older than the last one
  stored — so a captured signed body can't be replayed to re-upgrade an expired sub or
  downgrade a paying one.
- **Target-user binding** (added this pass): `custom_data.user_id` is client-controlled (it
  rides the checkout URL), so the webhook now only trusts it when the profile at that id has
  an email equal to the signed `user_email`; otherwise it falls back to email lookup. Closes
  "pay to upgrade/downgrade a stranger's account."
- **No internal-error leakage**: DB error text / env hints / echoed email+variant are logged,
  never returned to the caller.
- **Marketplace webhook** already had idempotency (`ls_order_id` + `ls_event_id` UNIQUE) +
  refund handling (`order_refunded` → `payout_status='cancelled'`).

## Admin: comp a coach onto any plan (free for now)

- Admin dashboard → coaches table → the **plan `<select>`** writes `subscription_tier`.
- This was **silently failing** until `migration-admin-plan-comp.sql`: there was no RLS policy
  admitting an admin to another user's `profiles` row, so PostgREST updated 0 rows and returned
  no error (the toast lied). The migration adds `profiles_admin_update` (`USING is_admin()`),
  and the client now `.select()`s the row back and throws if 0 rows came back — so a missing
  policy surfaces as a real error instead of a fake success.
- The privilege-guard trigger still blocks normal users from self-setting their tier, so this
  admin path is not a self-escalation hole.

## Payout split (marketplace)

- Price is stored in **USD cents**; coach keeps **80%** (`coach_payout_cents`), platform take 20%.
- `program_sales.payout_status`: `pending` → `paid` (you mark paid when you remit) / `cancelled`
  (refund via `order_refunded`). LS as MoR pays POWALIFTA; POWALIFTA remits coach payouts
  out-of-band (no automated split — that's a manual/coach-earnings-dashboard workflow).
