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
- **No build step.** Vanilla JS, plain HTML, hand-written CSS. Service Worker is network-passthrough.

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

## Roles & data model (Supabase)

- `profiles` — every user. `userType` is `athlete` | `coach` | `admin`. `coach_id` on an athlete row links them to a coach. Setting `coach_id = null` disconnects.
- `programs` — coach-built week/day/exercise/sets per athlete. `athlete_id` + `coach_id`.
- `templates` — coach's reusable program payloads.
- `logs` — every set logged. Drives e1RM.
- `bodyweight` — daily weigh-ins.
- `goals` — SBD + bodyweight targets.
- `marketplace_programs` — public listings.
- `marketplace_sales` — purchase records, with `coach_payout_cents` + `payout_status`.
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

In `edge-functions/` (need to be deployed via Supabase dashboard → Edge Functions; the folder is for organization only — Supabase functions are deployed by name, not by path):

- `ls-webhook.ts` — Lemon Squeezy subscription webhook → updates `profiles.subscription_tier`. Env: `LEMON_SQUEEZY_WEBHOOK_SECRET`. Verify JWT OFF.
- `ls-marketplace-webhook.ts` — Lemon Squeezy marketplace webhook → records sale + grants program access. Env: `LEMON_SQUEEZY_WEBHOOK_SECRET`. Verify JWT OFF.
- `send-welcome.ts` — branded welcome email after signup. Env: `RESEND_API_KEY`. Verify JWT OFF.
- `send-client-error.ts` — NEW. Receives client-side error reports. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Verify JWT OFF.
- `send-program-assigned.ts` — NEW. Sends email to athlete when coach hits the "📧 Notify" button in the program builder. Env: `RESEND_API_KEY`. Verify JWT **ON** (only logged-in coach can fire).
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
migration-tier-enforcement.sql
migration-client-errors.sql
migration-profiles-rls.sql            # UPDATE policies for coach/athlete disconnect
migration-marketplace-reviews.sql     # program_reviews table + RLS (verified-buyer writes)
migration-messages.sql                # coach↔athlete direct messaging + RLS
migration-form-checks.sql             # form_checks table + private `form-checks` Storage bucket + object policies
migration-ai-chat-usage.sql           # ai_chat_usage table (per-user daily AI cap; RLS-locked to service role)
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

**To bring it live:** deploy `edge-functions/ai-chat.ts` (Verify JWT ON), set `GEMINI_API_KEY` (key from aistudio.google.com/apikey — billing must be enabled on the Google Cloud project) **and** `GROQ_API_KEY` (free, no card, from console.groq.com/keys) as secrets, run `sql/migration-ai-chat-usage.sql`. Until then it runs in mock mode for everyone (graceful). `review.html` is a **local-only** dev tool and must NOT ship to main.

## Known gaps / pending work

- **Self-serve data export** — DONE this session (Settings → Export, JSON + CSV; program→spreadsheet CSV on both dashboards). Copy in privacy.html + faq.html updated to describe it.
- **Cookie consent banner** — not built. Plausible alone doesn't require one but if you ever add a 3rd-party tracker you'll need it for EU.
- **Bodyweight class / cut-bulk tracking** — only raw bodyweight is tracked.
- **Marketplace search** — present but basic. No sort by price/popularity, no category filter. (Reviews now give a `soldCount`/rating signal to sort on if you build it.)
- **Referral / affiliate program** — none.
- **Messaging realtime** — threads load on open + poll-free; no Supabase realtime subscription. Unread badges refresh on dashboard load and after closing a thread. Fine at current scale; revisit if users expect live chat.

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
