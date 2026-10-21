# POWALIFTA — Lemon Squeezy payments runbook

Everything needed to go from "free for everyone" to actually charging coaches, plus how
the marketplace payout split works. Written 2026-07-12. Lemon Squeezy (LS) is **Merchant
of Record** — it collects payment, handles tax/VAT, and remits payouts, so POWALIFTA never
touches card data and never needs a payment processor account.

## The two money flows

| Flow | What it is | LS product type | Webhook | Writes |
|---|---|---|---|---|
| **Coach subscriptions** | Coaches pay monthly for a higher athlete cap (Basic $24.99 / Pro $49.99 / Premium $99.99) | **Subscription** ("POWALIFTA Coach Plan", 3 variants) | `ls-webhook` | `profiles.subscription_tier` + `subscription_status` + `billing_provider` + `subscription_period_end` |
| **Marketplace program sales** | Athletes buy a coach's program one-off | **Single-payment** products (created per listing) | `ls-marketplace-webhook` | `program_sales` row + grants access, 80% `coach_payout_cents` |

Tiers → athlete limits (source of truth `app.js` `TIER_LIMITS`, enforced server-side by
`enforce_athlete_limit()` trigger): **free 3 / basic 10 / pro 25 / premium unlimited**.

## Coach subscription checkout — how it's wired today (2026-10-21)

- **Two billers, one at a time.** iPhone app: Apple in-app subscriptions (StoreKit 2,
  `apple-iap` + `apple-notifications`). Web: Lemon Squeezy hosted checkout (`ls-webhook`).
  `profiles.billing_provider` (`apple` | `ls` | null) says who bills a coach now; each
  function ignores events from the other biller, so nobody is charged twice or downgraded
  by the wrong one.
- `app.js` `LS_CHECKOUT_URLS` holds the three hosted checkout URLs (one per variant of the
  product "POWALIFTA Coach Plan"). Checked 2026-10-21: all three load, $24.99 / $49.99 /
  $99.99 a month, **still in test mode**.
- `LS_CHECKOUT_LIVE` (app.js, `false` today): while the store is in test mode, the web
  checkout buttons show only for testers (admins, or a browser that opened any page with
  `?lstest=1`) and are labelled "(test)". Everyone else is told plans are on sale in the
  iPhone app. The webhook only honours test-mode events while `LS_ALLOW_TEST=1`, and only
  for buyers listed in `LS_TEST_EMAILS` when that is set.
- `buildCheckoutUrl(tier, user)` appends `checkout[email]` (prefill) + `checkout[custom][user_id]`
  (so the webhook can match the sub back to the coach) + `checkout[name]`.
- `openUpgradeModal()` (web) decides by biller: a new coach gets checkout; a Lemon Squeezy
  subscriber's Upgrade/Switch opens the billing portal (a second checkout would create a
  second subscription); an App Store subscriber is told to change it on their iPhone.
- `openNativePaywall()` (iPhone): StoreKit products; a coach billed on the web sees their
  plan but can't buy a second one in the app. Manage subscription opens Apple's own sheet
  (`AppStore.showManageSubscriptions`, StoreKitPlugin `manageSubscriptions`).
- **Every device at once:** `startPlanWatch()` (app.js, called by coach.html) re-reads the
  plan on a realtime UPDATE of the coach's own `profiles` row (the payments migration adds
  `profiles` to `supabase_realtime`), whenever the app/tab comes back, when the network
  returns, and every 5 minutes while visible. After a web checkout the plan picker waits
  on the page and polls every 4 s until the plan lands, then says "You're on Pro".
- **Apple entitlements:** `syncAppleEntitlements()` sends this device's current App Store
  entitlements (highest first) to `apple-iap` at launch, on resume (at most every 10 min),
  after a purchase whose first sync failed (backoff 20 s → 10 min) and after the manage
  sheet closes. It never clears a plan on its own.
- **Right duration:** every biller stores `subscription_period_end` (Apple `expiresDate`,
  LS `renews_at` / `ends_at`). The plan in force is the stored tier until 3 days after
  that date (`powa_effective_tier()` in SQL, `effectiveTier()` in app.js), so a missed
  expiry event can't leave a plan on forever. Renewals push the date forward: **LS must
  send `subscription_updated`**, and Apple must have the Server Notifications URL set,
  or a paying coach drops to Free 3 days after their first period.

## To START CHARGING — the checklist

### 1. Lemon Squeezy dashboard (outside this repo)
1. **Store** exists at `powalifta.lemonsqueezy.com` (it does — the checkout UUIDs resolve).
2. **Subscription product with 3 variants** named so `resolveTier()` matches — easiest is
   literally `Basic` / `Pro` / `Premium` (it also fuzzy-matches substrings + falls back to
   price $24.99/$49.99/$99.99). Confirm each variant's checkout URL equals the UUID in
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
6. **Going live:** copy the product to live mode in Lemon Squeezy, paste the three live
   checkout links into `app.js` `LS_CHECKOUT_URLS`, set `LS_CHECKOUT_LIVE = true`, point the
   live-mode webhook at the same URL with the same secret, delete `LS_ALLOW_TEST` and
   `LS_TEST_EMAILS` from the function secrets, and update the two "once it opens" lines in
   `support-kb.js` (coach-plans, upgrade-coach-plan).

### E2E test checklist (run in LS Test mode before going live)
Do this end-to-end at least once — the flow has moving parts across client, LS, webhook, and DB.

1. **Sign up a test coach** in the app; note the account email. Stay on Free (3-athlete limit).
2. **Fill the roster to the limit** (3 athletes via invites) → generating a 4th invite should show the
   "hit your plan limit → upgrade" state (`canAddAthlete` false).
3. **Click upgrade → Pro**, complete LS Test checkout with a test card. ⚠️ **Leave the prefilled email
   as-is** (see caveat below).
4. **Watch the webhook fire:** Supabase → Edge Functions → `ls-webhook` logs should show
   `success: true, tier: 'pro'`. The coach's `profiles.subscription_tier` should read `pro`.
5. **Watch the coach dashboard** → the plan picker turns into "You're on Pro" within seconds
   (realtime or the 4 s poll), the limit flips to 25, and a second signed-in device shows Pro
   too without a reload. Generating more invites should now work.
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
| `LS_ALLOW_TEST` | `1` while checkouts are in test mode; delete at go-live |
| `LS_TEST_EMAILS` | comma-separated buyer emails whose test-mode payments count; delete at go-live |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — never set them.

## Yearly plans (built 2026-10-22, switch on when the products exist)

Each coach plan can also be billed once a year at ten months' price ("2 months free"):
Basic $249.99, Pro $499.99, Premium $999.99 a year. The code is in place on both sides and
shows a Monthly | Yearly switch only once the yearly products are real, so nothing breaks
before then.

**Web (Lemon Squeezy).** In the product "POWALIFTA Coach Plan" add three variants billed
yearly, named exactly **Basic Yearly**, **Pro Yearly**, **Premium Yearly** (the webhook reads the
plan from the variant name; `resolveTier` also maps a yearly price as ten months). Paste their
checkout links into `LS_CHECKOUT_URLS_YEARLY` in `app.js` (all three, or the switch stays hidden)
and check `TIER_PRICES_YEARLY` matches. Do the same again with the live links at go-live.

**iPhone (App Store Connect).** In the subscription group **Coach Plans**, add three
auto-renewable subscriptions with a 1-year duration:
`com.powalifta.app.coach.basic.yearly`, `com.powalifta.app.coach.pro.yearly`,
`com.powalifta.app.coach.premium.yearly` (prices $249.99 / $499.99 / $999.99, a display name and
description, the review screenshot of the paywall). Give each the **same level** as its monthly
plan (Basic monthly and yearly on one level, and so on) so switching billing waits for the
renewal and changing plan is an upgrade or downgrade as before. The ids are already in
`StoreKitPlugin.swift`, `apple-iap`, `apple-notifications` and `IAP_TIER_META`; deploy the two
functions (`./deploy.sh functions`) so the server knows the new ids, then archive a build.

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
