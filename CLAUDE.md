# POWALIFTA — context for Claude Code

POWALIFTA is a powerlifting platform — RPE-native programming, automatic e1RM tracking, free for athletes, paid tiers for coaches with rosters past 3 athletes. Tagline: **Built for the barbell.**

This file gets you up to speed fast. Read it before changing anything.

## Stack

- **Hosting:** Vercel (custom domain `powalifta.com`, `www` canonical)
- **Backend:** Supabase (Postgres + Auth + Edge Functions). Project URL is in `db.js`.
- **Payments:** Lemon Squeezy (handles subscriptions + marketplace as Merchant of Record)
- **Email:** Resend (transactional via edge functions)
- **Analytics:** Plausible (`powalifta.com`, GDPR-compliant, no cookie banner needed)
- **Error tracking:** local `error-log.js` + optional Sentry/Supabase forwarding
- **No build step.** Vanilla JS, plain HTML, hand-written CSS. Service Worker (`sw.js`) is **network-first**: online always fetches fresh (so a deploy is never stale), every successful same-origin GET is mirrored into the `powa-v2` cache, and the cache is read only when the network fails — so the app opens offline. `sw.js` also hosts the Web Push `push` + `notificationclick` handlers.
- **Push:** Web Push via VAPID. `push_subscriptions` table + `send-push` edge function. Client lives in `app.js` (`PowaPush` module). iOS Web Push only fires for a Home-Screen-installed PWA on iOS 16.4+.

## Architecture

Each top-level page is its own HTML file with its own inline `<script>` glue at the bottom:

- `index.html` — landing page (hero + features + how-it-works + coaches + marketplace teaser + pricing + CTA band)
- `athlete.html` — athlete dashboard (Today / Full program / Progress / Bodyweight / Coach / Library / Marketplace tabs)
- `coach.html` — coach dashboard (Roster / Program builder / Templates / Marketplace listings / Progress / Notes inbox)
- `coach-profile.html` — public coach profile (renders from URL param `?id=`)
- `marketplace.html` — public program marketplace (filters + search + buy flow)
- `admin.html` — admin dashboard (users, sales, invites, logs — restricted to `is_admin`)
- `about.html`, `faq.html`, `privacy.html`, `terms.html`, `reset-password.html`, `404.html` — static content
- `index.html` and the dashboards all share `app.js` (~2100 lines: store, modals, signup/login, plate calc, RPE math, charts, programming helpers) and `db.js` (~900 lines: Supabase client + mappers).

### Animation / FX layer (drop-in modules)

Loaded after `styles.css` on the marketing pages. Each is additive and removable:

| File | Purpose |
|---|---|
| `hero-fx.css/js` | Hero motion: gradient mesh, drifting grid, chalk-dust particles, dot pulse ring, headline shimmer, accent breathing glow, chart card glint, +18% pill pulse + counter tickup |
| `scroll-fx.css/js` | Declarative scroll reveals via `data-fx="up\|down\|left\|right\|scale\|blur"` + `data-fx-stagger`, `data-fx-count`, `data-fx-parallax`. IntersectionObserver-based. |
| `ui-fx.css/js` | Global polish: red selection color, smooth scroll, button hover glow + ripple, card hover lift, link underline grow, marquee edge fade + pause-on-hover, sticky nav blur on scroll, red focus rings, FOR COACHES pitch box styling |
| `insane-fx.css/js` | Signature moments: magnetic primary CTAs, hero headline scramble reveal on first paint. (Custom cursor + 2D scroll-barbell loader exist as dormant code but are no longer wired in — user rejected both.) |
| `three-fx.css/js` | DORMANT — Three.js 3D barbell in the hero with plate loading on scroll. User rejected, includes removed from `index.html`. Files left in repo as inert. |
| `error-log.js` | Captures `window.onerror` + `unhandledrejection`. Keeps last 50 in localStorage (`window.__powaErrors()` inspects). Optional Sentry / Supabase edge function forwarding via the two constants at the top of the file. |

Every fx file respects `prefers-reduced-motion`.

## Brand tokens

- Background: `#0b0b0c`
- Primary red: `#ff2d3f` (deep variant `#b71629`)
- Headlines: `Anton` (display)
- Body: `Plus Jakarta Sans` (400/500/600/700/800)
- Chart labels / monospace: `Space Grotesk`
- ALL CAPS for section eyebrows, headlines, hero stats; sentence case for body copy

## Core math

- **e1RM** uses RPE-percentage / Tuchscherer-style formula (`calcE1RM` in `app.js` ~line 1530):
  `e1RM = weight / (1 - ((reps - 1) + (10 - RPE)) * 0.0333)` (floored at `weight / 0.4`)
- **Variant multipliers** (`VARIANTS` object in `app.js` ~line 1499, applied by `multiplierFor()` ~line 1521): each main lift has several variants, each with its own multiplier. **Competition is the 1.0 baseline**; harder variants scale e1RM *up* so the chart compares competition-equivalent (e.g. squat Tempo 1.12, bench Incline 1.12, deadlift RDL 1.10). Variant counts: squat 4, bench 5, deadlift 4.
- **Plate calc** is in `athlete.html`. Tap any displayed weight → modal with plate breakdown.

## Critical fixes — do NOT regress

1. **Rest day in coach.html.** Three pieces around lines 634, 662, 880: "Add rest day" button, `isRestDay` heuristic (regex `/\b(rest|off|recovery)\b/i`), `addRestDay()` function. If you refactor the program builder, keep these alive.

2. **Pin re-render in athlete.html.** `pinDayToDate()` and `unpinDay()` both call `populateDaySelect()`, `refreshPinButtons()`, AND `renderToday()`. Without that third call the data saves but the main session panel doesn't refresh — looks broken.

3. **Demo mode** (`?demo=1`) sets `window._demoMode = true`. `persistProgram` and other write paths short-circuit on it. Don't break that — it's how the public hero demo works.

4. **CSP must allow same-origin framing.** `vercel.json`'s `Content-Security-Policy` keeps `frame-ancestors 'self'` and `frame-src 'self' https://*.lemonsqueezy.com` — NOT `'none'`. The in-app test harness nests same-origin iframes (`admin.html` → `tests.html` → `athlete.html?demo=1`); `'none'` (or a `frame-src` without `'self'`) makes the deployed site show "This content is blocked." `'self'` still blocks all cross-origin framing, so clickjacking protection is intact. Only bites on deploy — local static preview sends no CSP. Mirror any change in `docs/vercel-headers-snippet.json`.

## Roles & data model (Supabase)

- `profiles` — every user. `userType` is `athlete` | `coach` | `admin`. `coach_id` on an athlete row links them to a coach. Setting `coach_id = null` disconnects. `subscription_tier` is `free` | `basic` | `pro` | `premium` (athlete-limit 3/10/25/unlimited — see `migration-tier-enforcement.sql`); the LS subscription webhook writes it plus `subscription_status` / `ls_subscription_id` / `ls_customer_id` / `subscription_updated_at` (created by `migration-subscription-columns.sql`). `is_admin` boolean gates the admin dashboard. All three privileged columns are frozen against client self-escalation by `migration-profiles-privilege-guard.sql`.
- `programs` — coach-built week/day/exercise/sets per athlete. `athlete_id` + `coach_id`.
- `templates` — coach's reusable program payloads.
- `logs` — every set logged. Drives e1RM.
- `bodyweight` — daily weigh-ins.
- `goals` — SBD + bodyweight targets.
- `marketplace_programs` — public listings.
- `program_sales` — marketplace purchase records, with `coach_payout_cents` + `payout_status` (`pending` | `paid` | `cancelled`). `cancelled` = refunded/voided by the `order_refunded` webhook path. Idempotency keys `ls_order_id` + `ls_event_id` (both UNIQUE).
- `invites` — 6-char codes a coach generates to connect athletes.
- `session_notes` + `checkins` — coach feedback + weekly check-in form.
- `client_errors` — populated by `send-client-error` edge fn.
- `program_reviews` — marketplace ratings/reviews. Public read; verified-buyer writes (RLS `EXISTS` against `program_sales`). Denormalised `coach_id` + `buyer_name` so anon viewers don't read `profiles`.
- `messages` — coach↔athlete direct messages. `(coach_id, athlete_id)` is the thread; `sender_id` is who wrote it; `read_at` drives unread badges. Member-only RLS; insert gated on a live coach→athlete link.
- `form_checks` — athlete form-check video requests + coach reply. Video bytes live in the private `form-checks` Storage bucket (not this table); `storage_path` points at them.

All tables have RLS. Anon key in `db.js` is intentionally public (Supabase pattern). **Security depends entirely on RLS policies being correct.**

## RLS gotcha worth verifying

The new coach-removes-athlete + athlete-leaves-coach features both call `DB.updateProfile(userId, {coach_id: null})`. The RLS policy on `profiles` must allow:

- A coach to update `coach_id` to null on profiles where the existing `coach_id = auth.uid()`
- An athlete to update their own `coach_id` to null where `id = auth.uid()`

If the policy is "users can only update their own profile," the coach-remove path silently fails (no error, no toast). Worth checking + writing a permissive-enough policy.

## Edge functions

In `supabase/functions/<name>/index.ts` (Supabase CLI standard layout — deployed by name). **Deploy them + push secrets with `./deploy.sh`** (uses `npx supabase`, no global install; one-time `supabase login` + `supabase link --project-ref cxnotrikxvzncupswvio` first). The script already encodes the correct per-function Verify-JWT setting (the `--no-verify-jwt` group vs the JWT-required group), and pushes every secret from your local `.env` — see `.env.example` for the manifest of what key each function needs. Dashboard deploys still work as a fallback.

- `ls-webhook.ts` — Lemon Squeezy subscription webhook → updates `profiles.subscription_tier`. Env: `LEMON_SQUEEZY_WEBHOOK_SECRET`. Verify JWT OFF.
- `ls-marketplace-webhook.ts` — Lemon Squeezy marketplace webhook → records sale + grants program access. Env: `LEMON_SQUEEZY_WEBHOOK_SECRET`. Verify JWT OFF.
- `send-welcome.ts` — branded welcome email after signup. Env: `RESEND_API_KEY`. Verify JWT OFF.
- `send-client-error.ts` — NEW. Receives client-side error reports. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Verify JWT OFF.
- `send-program-assigned.ts` — NEW. Sends email to athlete when coach hits the "📧 Notify" button in the program builder. Env: `RESEND_API_KEY`. Verify JWT **ON** (only logged-in coach can fire).
- `send-invite.ts` — NEW. Auto-emails a prospective athlete ("X coach invited you") the moment a coach generates an invite code. The **code + coach name are resolved server-side** from the caller's own newest UNUSED `invites` row (`coach_id = caller` + `ilike email`), so a caller can only ever email an invite they actually made (anti-phishing gate, same spirit as `send-program-assigned`). Env: `RESEND_API_KEY` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Verify JWT **ON**. Client calls it fire-and-forget through `DB.sendInvite(email)` from `generateInvite()` (coach.html); the visible "📧 Send via email" mailto stays as a manual fallback, and demo mode skips the network. No new table/migration (uses existing `invites`).
- `send-push.ts` — NEW. Delivers a Web Push to every device a user registered (`push_subscriptions`). Caller is identified from their JWT and may push only to themselves OR the other party of a live coach↔athlete link (same gate as `messages` RLS); recipient's tokens read via service role, dead 404/410 endpoints pruned. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Verify JWT **ON**. Client calls it through `DB.sendPush()`. **To bring live:** `npx web-push generate-vapid-keys`, paste the *public* key into `VAPID_PUBLIC_KEY` at the top of `app.js`, set the keypair (+subject) as function secrets, run `migration-push-subscriptions.sql`, deploy. Until the public key is set, the in-app "🔔 Enable alerts" toggle degrades to a toast — nothing breaks.
- `ai-chat.ts` — NEW. Secure proxy for the AI assistant. Holds `GEMINI_API_KEY` server-side and forwards the browser's question + data snapshot to Google's Gemini (`gemini-2.5-flash`). Env: `GEMINI_API_KEY` (required), `AI_DAILY_CAP` (optional, default 20). Verify JWT **ON**. Maps our `user`/`assistant` turns to Gemini's `user`/`model` + `system_instruction` shape, clamps `maxOutputTokens`/system length/history server-side, and enforces a per-user daily cap via `ai_chat_usage` (service role). The browser calls it through `DB.aiChat()` (`sb.functions.invoke`), so no key is ever client-side. Provider is swappable in one file — only this function knows it's Gemini. (Note: Gemini's free tier returns a hard `429 "check your plan and billing"` for this account — billing must stay enabled on the Google Cloud project. Was briefly swapped to Groq during the billing outage; reverted once billing went through, since Gemini 2.0 Flash is ~4–6× cheaper per token.)

The signature verification in both LS webhooks uses HMAC-SHA-256. The old length pre-check that leaked length has been replaced with a `timingSafeEqual` helper (double-HMAC with a single-use random key → constant-time, no length side-channel) in both `ls-webhook.ts` and `ls-marketplace-webhook.ts`.

## SQL migrations

In `sql/`. Apply via Supabase SQL Editor in this order:

```
migration-coach-profile.sql
migration-feedback-checkins.sql
migration-self-coached.sql
migration-marketplace.sql
migration-marketplace-1rm.sql
migration-directory-hidden.sql
migration-subscription-columns.sql    # guarantees profiles' subscription_* + ls_* cols exist (LS sub-webhook writes them)
migration-tier-enforcement.sql
migration-client-errors.sql
migration-profiles-rls.sql            # UPDATE policies for coach/athlete disconnect
migration-profiles-privilege-guard.sql # freezes subscription_tier/user_type/is_admin vs client self-escalation (run AFTER profiles-rls)
migration-marketplace-reviews.sql     # program_reviews table + RLS (verified-buyer writes)
migration-messages.sql                # coach↔athlete direct messaging + RLS
migration-messages-realtime.sql       # adds `messages` to supabase_realtime publication (live threads/badges); run AFTER migration-messages
migration-form-checks.sql             # form_checks table + private `form-checks` Storage bucket + object policies
migration-ai-chat-usage.sql           # ai_chat_usage table (per-user daily AI cap; RLS-locked to service role)
migration-push-subscriptions.sql      # push_subscriptions table + RLS (own-rows-only; send-push reads via service role)
migration-referrals.sql               # referral_code/referred_by_code on profiles + referrals table + SECURITY DEFINER attribution trigger + RLS (run AFTER profiles-rls + privilege-guard)
migration-marketplace-taxonomy.sql    # marketplace_programs.category (training-focus taxonomy, distinct from tier/length) + index; nullable, no CHECK (keys ship client-side)
```

**Storage note:** `migration-form-checks.sql` also creates a private Storage bucket
(`form-checks`, 100 MB/file cap, video MIME types) and RLS policies on
`storage.objects`. Athlete videos live at `<athlete_id>/<ts>-<name>`; the leading
folder = owner uid, which the object policies key off. Playback uses short-lived
signed URLs (`DB.formCheckSignedUrl`), never public links.

## Recently shipped (reviews / messaging / form checks)

- **Marketplace reviews/ratings** — DONE. `program_reviews` table (`migration-marketplace-reviews.sql`), public read, verified-buyer writes (RLS `EXISTS` against `program_sales`), one review per buyer per program (upsert). Shared helpers in `app.js`: `reviewStats()`, `starString()`, `starsHtml()` (unit-tested in `tests.html`). UI: rating badges on `marketplace.html` browse cards, summary + list + gated write-form on the detail page, aggregate rating + testimonials section on `coach-profile.html`. db.js: `listProgramReviews`, `listReviewsForPrograms`, `listReviewsForCoach`, `hasPurchasedProgram`, `upsertProgramReview`, `deleteProgramReview`.
- **Coach ↔ athlete messaging** — DONE. `messages` table (`migration-messages.sql`), member-only RLS, insert gated on a live coach→athlete link. Shared UI `renderMessageThread()` in `app.js` (bubbles + composer, Enter sends). Athlete: Coach tab thread. Coach: 💬 button per roster card → `messageModal`, unread badges via `DB.listUnreadForUser`. db.js: `listMessages`, `sendMessage`, `markThreadRead`, `listUnreadForUser`.
- **Form-check video uploads** — DONE. `form_checks` table + private Storage bucket (`migration-form-checks.sql`). Athlete uploads a clip (Coach tab → Form checks) with optional lift + note; coach sees a Form-checks inbox on the roster, opens `formCheckModal` to watch (signed URL) + write a cue. db.js: `uploadFormCheck`, `listFormChecksForAthlete`, `listFormChecksForCoach`, `formCheckSignedUrl`, `replyToFormCheck`, `deleteFormCheck`. NOTE: messaging + form checks have **no demo path** (real Supabase only) — both are guarded by `window._demoMode` and skipped in the `?demo=1` hero demo.

## AI assistant ("Ask AI")

A floating assistant on both dashboards (`ai-chat.js` + `ai-chat.css`, loaded after the page's own scripts). Role is picked from the URL: `coach.html` → coaching assistant, else athlete training assistant.

**Two runtime modes, resolved in `init()`:**
- **LIVE** — a signed-in user on a real page. `liveReply()` → `DB.aiChat()` → `sb.functions.invoke('ai-chat')` → the `ai-chat` edge function → Google Gemini. The Gemini key lives only in the function's secrets; the browser never holds it. Supabase auto-attaches the session JWT, which the function (Verify JWT ON) validates.
- **MOCK** — demo mode (`?demo=1`), signed-out, or any live failure. Answers are computed locally in `ai-chat.js` from real Store data (`snapshotFor`, `athleteAnswer`, `coachAnswer`, `weekRecap`, `draftProgram`, etc.). No network, no key, no cost. Also the graceful fallback: first live failure flips `liveDown = true` and the rest of the session uses mock.

`LIVE_BACKEND` (const at top of `ai-chat.js`) is the master switch — set `false` to force mock everywhere.

**Cost is bounded three ways:** (1) the edge function clamps `maxOutputTokens` (800), system length, and history; (2) a per-user daily cap (`ai_chat_usage`, `AI_DAILY_CAP` env, default 20); (3) **the budget you set on the Google Cloud project.** Gemini 2.0 Flash is ~$0.10/1M input + $0.40/1M output, so at the per-user cap each chat costs fractions of a cent.

**Provider note:** the assistant is provider-agnostic above the edge function. Swapping Gemini for OpenAI / Anthropic / Groq means rewriting only `ai-chat.ts` (endpoint + request/response shape + secret name) — the client, mock fallback, and `ai_chat_usage` cap are untouched.

**Dual-provider with fallback:** `ai-chat.ts` tries **Gemini first** (`gemini-2.5-flash`, cheapest) and **automatically falls back to Groq** (`llama-3.3-70b-versatile`) whenever Gemini errors (billing/quota/outage). Only if *both* fail does it return 502 and the client flips to local mock. So the assistant stays Live as long as either provider works. Set `GEMINI_API_KEY` and/or `GROQ_API_KEY` (at least one required) as function secrets — set both for the fallback to engage. `callGemini`/`callGroq` are the only provider-specific code; everything else is shared.

**To bring it live:** deploy `supabase/functions/ai-chat/index.ts` (Verify JWT ON — `./deploy.sh` handles it), set `GEMINI_API_KEY` (key from aistudio.google.com/apikey — billing must be enabled on the Google Cloud project) **and** `GROQ_API_KEY` (free, no card, from console.groq.com/keys) as secrets, run `sql/migration-ai-chat-usage.sql`. Until then it runs in mock mode for everyone (graceful). `review.html` is a **local-only** dev tool and must NOT ship to main.

## Known gaps / pending work

- **Self-serve data export** — DONE this session (Settings → Export, JSON + CSV; program→spreadsheet CSV on both dashboards). Copy in privacy.html + faq.html updated to describe it.
- **Cookie consent banner** — DONE. Honest, privacy-first `cookie-consent.js` + `cookie-consent.css` drop-in (loaded after `styles.css` / `error-log.js` on every public page). The site sets no ad cookies; "Essential only" actually disables the cookieless Plausible via its `plausible_ignore` flag, "Accept" leaves it on. Choice persists in `localStorage['powa-consent']`, re-applied early on every load; banner only shows until a choice is made. privacy.html "Cookies and analytics" copy updated to match.
- **Bodyweight cut/bulk tracking** — DONE. Athlete Bodyweight tab now reads the weigh-in series, not just the latest number. New pure helpers in `app.js`: `linregSlope(xs, ys)` (least-squares), `bwCutBulkStats(series, goalKg, direction)` (7-day trailing moving average → smoothed "trend"; weekly rate via least-squares over the last 28 days; start→goal progress; ETA-to-goal when trending the right way; signed %BW/week), and `bwPace(slopeKgWk, curKg, direction)` (powerlifting pace read — cut sweet-spot ≈0.5–1.0 %BW/wk, lean bulk ≈0.2–0.5 kg/wk). `goalProgressPct` gained an optional 4th `start` arg (true start→goal fraction; the three existing 3-arg callers are untouched). `renderBodyweight()` (athlete.html) shows a pace chip + weekly rate + ETA in the goal card and overlays a slate 7-day-trend line (uses a new per-series `noArea` flag on `drawLineChart` so only the daily line keeps its area fill) with a Daily/Trend/Goal legend. No DB migration — `bodyweight` + `goals` (incl. `bw_direction`) already had the columns. Weight-class targets still not modelled (raw kg only).
- **Marketplace sort + filter** — DONE. `marketplace.html` has tier (category) filter chips (All / Short cycle / Full block / Premium), a sort dropdown (Featured / Most popular / Top rated / Price ↑ / Price ↓), and debounced search. Server side: `DB.listPublishedPrograms({tier, search})` filters by tier + `ilike` over title OR description, ordered by `sold_count`; sort is applied client-side in `sortPrograms()` after review stats aggregate (so "Top rated" reuses the same stats the cards show).
- **Marketplace training-focus taxonomy** — DONE. A real `category` axis ON TOP of `tier` (which is length/format). `marketplace_programs.category` (`migration-marketplace-taxonomy.sql`, nullable text + index, no CHECK). Client-side source of truth `MARKET_CATEGORIES` + `marketCategoryLabel()` in app.js (keys: strength/hypertrophy/peaking/beginner/bench/weakpoint → labels), exported on `window`. coach.html publish modal: the old "Category" select is relabeled **Length / format** (`pubTier`) and a new **Training focus** select (`pubCategory`, populated from the taxonomy on open) sits beside it; `confirmPublish()` reads + passes `category`; coach listing meta shows the label. marketplace.html: a second **Focus** filter-chip row (built from `MARKET_CATEGORIES`) filters **client-side** by `p.category` (never pushed into the query, so it's pre-migration-safe); a muted `.mk-cat-tag` pill renders on browse cards + the detail page next to the tier badge. db.js: `mapDbMarketplaceProgram` adds `category`; `mapJsMarketplaceProgram` includes it **only when truthy**; `submitMarketplaceProgram` + `updateMarketplaceProgram` **retry without `category`** on a column-missing error — so publishing/editing works before the migration runs. Demo-safe (publish still guarded by `_demoMode`). Null-category (legacy) listings show no pill and only match "All".
- **Referral / affiliate program** — DONE. Every profile gets a 6-char `referral_code` (unambiguous alphabet, auto-generated on insert + backfilled by `migration-referrals.sql`). A `?ref=CODE` link is captured to `localStorage['powa-ref']` at the top of `bootstrap()` (`captureReferralFromUrl`) so it survives the whole signup round-trip (incl. email confirmation), then stamped onto the new user's OWN `profiles.referred_by_code` once authenticated (`applyPendingReferral` → `DB.applyReferral`, mirroring the invite-claim pattern; idempotent, fire-and-forget). A SECURITY DEFINER trigger resolves code→referrer and writes one `referrals` row (self-referral-proof, unique per referred user; both code columns are write-once and silently pinned so a normal settings save can't rewrite attribution). The Settings modal shows a shared `renderReferralCard(container)` (link + Copy button + "N lifters joined through you" list via `DB.listMyReferrals`); demo users carry codes `DEMO42`/`COACH7` so it renders in the `?demo=1` showcase. db.js: `mapDbReferral`, `DB.listMyReferrals`, `DB.applyReferral`; profile mappers + `window._user` gained `referralCode`/`referredByCode`. Attribution + display only — no payout/credit/reward logic yet.
- **Messaging realtime** — DONE. `messages` is now on the `supabase_realtime` publication (`migration-messages-realtime.sql`). `DB.subscribeMessages(filter, onInsert)` (db.js) opens a `postgres_changes` INSERT channel (server-side filter + `mapDbMessage`) and returns a teardown fn. Open threads append live (`renderMessageThread` subscribes inside the non-demo branch, tearing down the prior channel on each re-render via `container._msgCleanup`); coach roster badges debounce-refresh off a `coach_id=eq.<uid>` channel (`subscribeRosterMessages` → `scheduleUnreadRefresh`); athlete Coach tab lights a `.tab-dot` off an `athlete_id=eq.<uid>` channel (`subscribeCoachMessages`). RLS still gates delivery (subscriber only gets rows `msg_member_read` would let them SELECT). Demo-safe: every subscribe early-returns on `window._demoMode`; modal close + tab re-render tear channels down (no leaks). Sender's own echo is a client-side no-op (id dedupe). Still no live read-receipts (insert-only; `REPLICA IDENTITY FULL` is set so a future `read_at` UPDATE stream would resolve).
- **Coach roster "needs attention" triage** — DONE. New Roster-tab panel (`buildAttentionPanel` in coach.html) surfaces who to look at first: inactive (`never`/`stale` flag), **stalling** (e1RM flat/down), low adherence (logged ÷ programmed <40%), plus a 🏆 wins ribbon for athletes who PR'd this week. Backed by two new pure helpers in `app.js`: `getE1RMMomentum(athleteId, windowDays=21)` (best `e1rmComp` in the last window vs the prior window per main lift → `stalling` when paired data exists and nothing beat tolerance — needed because `bestE1RM` is all-time and can't see a plateau) and `getRosterAttention(coachId)` (joins momentum + `getRosterOverview` adherence/recency + weekly PR count into a severity-ranked list). Deep per-athlete analytics already lived on the Progress tab (`renderRosterAnalytics`); this is the at-a-glance triage. Demo roster renders it. Styles: `.attention-panel`/`.att-*`/`.tab-dot` in styles.css.
- **Weight-class targets** — DONE (make-weight readout). `weightClassInfo(bwKg, sex)` in `app.js` (atop the existing `IPF_CLASSES`/`weightClassFor`) returns current class, kg under the ceiling, and kg to cut to drop a class. Surfaced as a `.wc-line` in the athlete strength-score card (`buildStrengthScoreCard`, athlete.html): "X under the 83kg ceiling · cut Y to make 74kg" (or "Right on the limit" / "Top class"). DOTS + class label + strength tiers already rendered there. Raw IPF/USAPL kg classes only — no weigh-in-day water-cut modelling or meet-date countdown.

## Hero coach-pitch (new this session)

In `index.html` between the 3 hero CTAs and the demo line:

```html
<p class="hero-coach-pitch" aria-label="Pitch for coaches" data-fx="up">
  <span class="hcp-label">FOR COACHES</span>
  <span class="hcp-body">Free with your first 3 athletes. Sell programs on the marketplace. Stop spreadsheeting. <a href="#pricing" class="hcp-link">See pricing →</a></span>
</p>
```

Styled in `ui-fx.css`. Anchor-jumps to `#pricing`. Red border + gradient bg + hover lift.

## Marketing assets generated this session

- `og.png` 1200x630 — Open Graph image (referenced in all page meta).
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` — PWA icons referenced by `manifest.json`.
- Plus some Higgsfield abstract images and Instagram launch assets that weren't downloaded into the repo (sandbox limitation). They live in the Higgsfield workspace if you want to grab them.

## Style conventions

- Inline `<script>` blocks at the bottom of each HTML page wire up the page-specific glue. `app.js` is the shared library.
- Don't introduce a build step. Vercel serves the files raw.
- Don't add new JS frameworks. Pure vanilla.
- Animation modules use the `fx-*` class prefix.
- All new tables/policies should be in their own `migration-*.sql` file at the repo root for the user to run manually.

## When in doubt

- Editing the hero markup: also update the inline `data-fx` attributes so scroll-fx still fires correctly.
- Adding a new feature that touches DB: write a migration + check if you need to add a mapper in `db.js`.
- Adding a new public page: include `styles.css`, `ui-fx.css`, `insane-fx.css`, `error-log.js`, and the Plausible tag, plus the standard nav + footer.
