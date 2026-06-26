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

- **e1RM** uses RPE-percentage / Tuchscherer-style formula (`app.js` around line 1395):
  `e1RM = weight / (1 - ((reps - 1) + (10 - RPE)) * 0.0333)`
- **Variant multipliers** (`app.js` ~line 1362): squat 4, bench 5, deadlift 4. Multiplier scales e1RM so the chart compares competition-equivalent.
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
- `client_errors` — NEW table, populated by `send-client-error` edge fn.

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
migration-profiles-rls.sql         # NEW — UPDATE policies for coach/athlete disconnect
```

## Known gaps / pending work

- **Marketplace reviews/ratings** — not built. Social proof gap once 5+ coaches are listing.
- **Self-serve data export** — Privacy policy + FAQ promise it ("email us"). UI button doesn't exist. GDPR risk if scaled.
- **Cookie consent banner** — not built. Plausible alone doesn't require one but if you ever add a 3rd-party tracker you'll need it for EU.
- **Bodyweight class / cut-bulk tracking** — only raw bodyweight is tracked.
- **Marketplace search** — present but basic. No sort by price/popularity, no category filter.
- **Referral / affiliate program** — none.

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
