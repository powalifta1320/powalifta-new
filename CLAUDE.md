# POWALIFTA — context for Claude Code

POWALIFTA is a powerlifting platform — RPE-native programming, automatic e1RM tracking, free for athletes, paid tiers for coaches with rosters past 3 athletes. Tagline: **Built for the barbell.**

This file gets you up to speed fast. Read it before changing anything.

## Project memory lives in the Obsidian vault

`~/Documents/Obsidian Vault/` is the primary memory for everything that isn't "how the code works". Read `Current state.md` first (what's live, what's built, what's next), then only what the task needs:
- `Roadmap.md` (the plan) · `Changelog.md` (dated log) · `App Store 1.2.md` (the current release checklist) · `Fundraising.md` (applications, deck, videos).
- `History/Shipped log - October 2026.md` and `History/Shipped log - before October 2026.md`: every shipped feature in full technical detail, with the gotchas found while building it. Search there before re-deriving how a feature works.
- `Features/` (one note per feature; `Features.base` is the board), `Decisions.md`, `Deploy checklist.md`, `Ideas.md` (the owner's inbox).
- `Code/`: the long code reference that used to sit in this file, word for word: `SQL migrations.md` (apply order + what each file does), `Edge functions.md`, `Go-live runbook.md` (deploy + secrets), `Ask AI internals.md`, `Architecture detail.md` (the full Stack / Architecture / Website / Brand / data-model text) and `Gotchas.md` (the full list).

When work lands, update `Current state.md`, `Roadmap.md` and `Changelog.md` (plus the feature note). **Keep this file under ~25 KB**: it loads into every session and every subagent. New detail goes to the vault (`Code/` for how the code works, `History/` for what shipped) with at most a one-line pointer here.

## Stack

- **Hosting:** Vercel (custom domain `powalifta.com`, `www` canonical)
- **Backend:** Supabase (Postgres + Auth + Edge Functions). Project URL is in `db.js`.
- **Payments:** iPhone app: Apple in-app subscriptions for coach plans (StoreKit 2; `apple-iap` + `apple-notifications` edge functions). Web: Lemon Squeezy, checkouts still in test mode (`LS_CHECKOUT_LIVE` false = web checkout for testers only). One biller per coach (`profiles.billing_provider`); the plan in force is `effectiveTier()` in app.js = `powa_effective_tier()` in SQL. Runbook: `docs/payments-runbook.md`.
- **Email:** Resend (transactional via edge functions)
- **Analytics:** Plausible (`powalifta.com`, GDPR-compliant, no cookie banner needed)
- **Error tracking:** local `error-log.js` + optional Sentry/Supabase forwarding
- **No build step.** Vanilla JS, plain HTML, hand-written CSS. `sw.js` is network-first: the `powa-v2` cache is read only when the network fails (or after 1.5 s when a copy exists), so a deploy is never stale and the app opens offline. It also hosts the Web Push handlers.
- **Push:** Web Push via VAPID. `push_subscriptions` table + `send-push` edge function. Client lives in `app.js` (`PowaPush` module). iOS Web Push only fires for a Home-Screen-installed PWA on iOS 16.4+.

## Architecture

Each top-level page is its own HTML file with its own inline `<script>` glue at the bottom:

- `index.html` — the website's homepage: hero, one section per app tab, pricing. The website lives in `<div class="s-home">`; inside the iOS app it shows `#nativeWelcome` + the `native-onboard.js` sign-up / log-in sheets instead. The log-in / sign-up / forgot modals and the calculator ids must stay.
- `athlete.html` — athlete dashboard. Five destinations: Train (`today` pane, `renderToday`) · Progress · Club · Coach (Program when self-coached) · You (`renderAthleteYou` → app.js `renderYouHub`). Sub-screens (Bodyweight, Library, Marketplace, Full program) carry `data-parent` on their `.sidebar-tab`, which hides them from the bars; `syncPaneBack()` adds the "‹ Parent" link. Also here: `openExerciseDetail`, meet day (`openMeetMode`, the bouncer), Finish session (`setOpen()` is what every next-set finder uses), the rest-end alert, Lift mode (`openLiftMode`). The full map: vault `Code/Architecture detail.md`.
- `coach.html` — coach dashboard. Five destinations: Roster · Program · Messages · Club · You (`renderCoachYou`); Templates (parent Program), Athlete progress + Marketplace listings (parent You) are sub-screens.
- `clubs.js` — the Club tab for both dashboards (`renderClubTab`): Feed (`club_posts`), Board (This week / Most improved / Strongest from one shared stats row, never programs or logs; pure `rankClubMembers` / `clubWeekScore` / `clubImprovePct` unit-tested), Find / Got a code? / Start a club. One club per lifter. `?demo=1` runs on a seeded club, no network.
- `coach-profile.html` — public coach profile (renders from URL param `?id=`)
- `marketplace.html` — public program marketplace (filters + search + buy flow)
- `admin.html` — admin dashboard (users, sales, invites, logs — restricted to `is_admin`)
- `about.html`, `faq.html`, `privacy.html`, `terms.html`, `reset-password.html`, `404.html` — static content. Password reset links land on `reset-password.html` (db.js `routeRecoveryLink` moves a stray recovery hash there).
- `join.html` — the invite-link landing page (`/j/CODE`), see `invites` below.
- `leaderboard.html` — public opt-in DOTS leaderboard (`renderLeaderboard` in app.js; sex filter + sign-in/up CTA)
- `guides.html` + `guide-rpe|e1rm|dots|peaking.html` — SEO articles (JSON-LD; their math mirrors `app.js`), all in `sitemap.xml`.
- `api/opl.js` — the only Vercel function (the OpenPowerlifting proxy, see Gotchas).
- The website and both dashboards share `app.js` (store, modals, sign-up / log-in, RPE math, charts, programming helpers) and `db.js` (Supabase client + mappers).
- **`supabase.js` (repo root) is the VENDORED `@supabase/supabase-js` v2.110.0 UMD build** — never re-add a CDN `<script>` for it (a hung jsDelivr once froze every page). Any third-party script: vendor it or load it `async`.

### Website (public pages) — `site.css` + `site.js`

Every public page has `<body class="site">` and loads `site.css` after `styles.css` and `site.js` (deferred); never the dashboards. Classes are `s-*`. One red action per screen (the nav's "Get started" is an ink pill). Homepage sections show real app screens (`site-img/app-*.webp`, captured from `?demo=1` at 393×852 @2x) in a CSS phone; `#desk` shows the laptop view (`site-img/desk-*.webp`, from `coach.html?demo=1` at 1440×900). Programs-shop links (`data-needs-programs`) stay hidden until `siteProgramsReady()` counts 3+ programs. Reveals never hide content by default. One footer (`footer.s-foot`) is pasted into every page. Full notes: vault `Code/Architecture detail.md`.

## Brand tokens

**Rebranded 2026-10** (user decisions: keep the POWALIFTA name, new look; "Red, but rationed"; take a reference app's organisation, never copy its look).

- Background: `#0b0b0c`; neutral graphite surfaces (`--bg-1..3`), hairlines `--line/--line-2`
- **Colour with a job:** brand fire (`--fire`: `#ff3b4a → #ff6a3d`) is the one primary action per screen (`.btn-primary`); true alerts keep `--brand-red`. Each destination owns a hue, set as `body[data-accent]` by `initScreenAccent()` and read as `--acc/--acc-2`: Train/Roster fire, Progress/Program cyan, Club gold, Coach/Messages green, You violet. Lifts: squat `#38c6ff`, bench `#a98bff`, deadlift `#ffbf3c` (`liftColors()`). Avatars: `avatarHue()` → `.av-h0..7` (pass `data-name`). Status: `--ok`, `--warn`.
- **Type: one family, Archivo** (variable `wdth 62–125`, `wght 100–900`, Google Fonts link on every page) in three role tokens — `--font-display` (wide + heavy: `font-stretch: var(--display-stretch)` 125%, weight 800), `--font-body`, `--font-num` (tabular, `--num-stretch` 112%). Anton / Plus Jakarta Sans / Space Grotesk are gone — never reference them; canvas share cards use `800 …px Archivo`.
- ONE display headline per screen (the page title). Section titles (`.ui-label`, `.prog-sec`, `.yg-title`) are 20px bold sentence case (native-app style, not caps eyebrows). Each screen leads with a lit hero in its accent (`.ui-hero`, `uiRingHero()` ring + headline + three numbers).
- Logo: one sleeve of a loaded bar side-on — a red 25 kg plate + ink plate + collar (`BRAND_MARK` in app.js, `favicon.svg`, app icon 1024 in `native/assets` + `native/ios-overlay`), all-ink `POWALIFTA` wordmark (`.brand-word`).

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

5. **Internal files stay off the website.** Vercel publishes everything in git unless `.vercelignore` drops it. Until 2026-10-17 `www.powalifta.com/CLAUDE.md`, `/sql/*.sql`, `/supabase/functions/*/index.ts`, `/docs/payments-runbook.md`, `/deploy.sh` and `/ruvector.db` were all public. `.vercelignore` now drops `*.md`, `docs/`, `sql/`, `supabase/`, `native/`, `test/`, tooling state and scripts. Adding a new internal folder or file type? Add it there. Never ignore anything a page loads (`tests.html` must stay: admin.html runs it). Check after a deploy with `curl -o /dev/null -w '%{http_code}' https://www.powalifta.com/CLAUDE.md` → 404.

## Roles & data model (Supabase)

- `profiles` — every user. `userType` is `athlete` | `coach` | `admin`. `coach_id` on an athlete row links them to a coach. Setting `coach_id = null` disconnects. `subscription_tier` is `free` | `basic` | `pro` | `premium` (athlete-limit 3/10/25/unlimited — see `migration-tier-enforcement.sql`); the LS subscription webhook writes it plus `subscription_status` / `ls_subscription_id` / `ls_customer_id` / `subscription_updated_at` (created by `migration-subscription-columns.sql`). `is_admin` boolean gates the admin dashboard. All three privileged columns are frozen against client self-escalation by `migration-profiles-privilege-guard.sql`.
- `programs` — coach-built week/day/exercise/sets per athlete. `athlete_id` + `coach_id`.
- `templates` — coach's reusable program payloads.
- `workout_logs` — every set logged (client-side: `workoutLogs`, mapped in db.js). Drives e1RM. Older notes sometimes say "logs" — the real table is `workout_logs`.
- `bodyweight` — daily weigh-ins.
- `goals` — SBD + bodyweight targets.
- `marketplace_programs` — public listings.
- `program_sales` — marketplace purchase records, with `coach_payout_cents` + `payout_status` (`pending` | `paid` | `cancelled`). `cancelled` = refunded/voided by the `order_refunded` webhook path. Idempotency keys `ls_order_id` + `ls_event_id` (both UNIQUE).
- `invites` — 6-char codes a coach generates, handed out as links `powalifta.com/j/CODE` (Vercel rewrite → `join.html`, `invite_preview(code)`); the app routes `powalifta://join?code=` to sign-up or to Join coach. An unused invite holds a seat.
- `session_notes` + `checkins` — coach feedback + weekly check-in form.
- `client_errors` — populated by `send-client-error` edge fn.
- `program_reviews` — marketplace ratings/reviews. Public read; verified-buyer writes (RLS `EXISTS` against `program_sales`). Denormalised `coach_id` + `buyer_name` so anon viewers don't read `profiles`.
- `messages` — coach↔athlete direct messages. `(coach_id, athlete_id)` is the thread; `sender_id` is who wrote it; `read_at` drives unread badges. Member-only RLS; insert gated on a live coach→athlete link.
- `form_checks` — athlete form-check video requests + coach reply. Video bytes live in the private `form-checks` Storage bucket (not this table); `storage_path` points at them.

All tables have RLS. Anon key in `db.js` is intentionally public (Supabase pattern). **Security depends entirely on RLS policies being correct.**

## Edge functions

`supabase/functions/<name>/index.ts`, deployed with `./deploy.sh` (it also pushes the secrets from `.env` and knows each function's Verify-JWT setting). Billing: `apple-iap`, `apple-notifications`, `ls-webhook`, `ls-marketplace-webhook`, `ls-portal`. Email: `send-welcome`, `send-invite`, `send-program-assigned`, `send-weekly-digest` (cron), `unsubscribe`. Other: `send-push`, `send-client-error`, `ai-chat`, `delete-account`. Functions acting for a user take the user from the JWT only; webhooks check a signature in constant time. What each does, its env and auth: vault `Code/Edge functions.md`.

## SQL migrations

In `sql/`; the owner runs them in the Supabase SQL Editor. Every file is idempotent (safe to run twice). New tables and policies always get their own `migration-*.sql`, tested in PGlite before shipping, and the app must cope until it runs (db.js `_isNotReady` / `_missingCol`). `sql/STATUS-check.sql` (read-only) prints one row per migration with applied true/false: add a row for each new one. Apply order and what each file does: vault `Code/SQL migrations.md` (append new ones there).

## Deploying

The website deploys on every push to `main` (Vercel). The backend go-live (migrations, `./deploy.sh`, which secret gates which feature, dashboard wiring): vault `Code/Go-live runbook.md` and `Deploy checklist.md`.

## AI assistant ("Ask AI")

`ai-chat.js` + `ai-chat.css` on both dashboards. LIVE (signed in) → `DB.aiChat()` → the `ai-chat` edge function (Gemini first, Groq fallback, per-user daily cap in `ai_chat_usage`); MOCK (demo, signed out, or any failure) answers locally from Store data. `LIVE_BACKEND` is the master switch. Support mode answers from `support-kb.js` first: give each new user-facing feature an entry there. Details: vault `Code/Ask AI internals.md`.

## Gotchas worth remembering

The full list, with context, is in the vault (`Code/Gotchas.md`, `History/`). The ones that bite most:
- `section:not([data-pane])` pads every `<section>`: use a `div` for new in-app containers.
- iOS WebKit drops a tap when the tapped content is animating up from `opacity: 0`. Entrances start at 0.45 or more; the Log set button commits on finger-up (`uiFastTap`). Every sheet swallows clicks for 400 ms after opening (`_sheetSwallowEarlyClicks`).
- `_feltRpe` and `_pbOpen` are declared next to `let user`: the demo boot renders Train synchronously, and a later `const` hits the TDZ and blanks the screen on iOS.
- Inside the app `--red` is ink (it renders white). Use `--acc` / `--brand-red` by name.
- Apple 3.1.1 in the shell: anything billed outside the App Store wears `.web-only` (hidden under `html.native`), every public page carries the one-line native-detect snippet in its `<head>` (so `html.native` rules apply to terms/faq/coach-profile too), and policy links inside sheets use `onclick="return openDoc(this)"` (Safari in the shell, a plain link on the web). The bundle never carries the Plausible tag (`copy-web.sh` strips it) nor admin.html.
- Program JSON (`programs.weeks`, marketplace payloads) is coach/seller-authored: every render of `reps` / `rpe` / `number` goes through `escHtml` or `Number()`.
- Hover sticks after taps on iOS: neutralise `:hover` in the app.
- A chart built inside a `display:none` tab measures 0 wide: render sub-views when they're shown.
- `mondayOf()` (athlete.html) returns a `'YYYY-MM-DD'` string, not a Date. `toggleUnit()` reloads the page. There is no `ICONS.share`.
- The iPhone app bundles the web app: a web fix reaches the app only through `native/copy-web.sh` + a copy into `ios/App/App/public` + a new archive. After any `cap sync`, run `bash native/scripts/inject-all.sh` (Live Activity, IAP, home-screen widgets + icons; skipping it silently drops them). Every widget reads one snapshot (`PowaSnapshot`, built by `syncHomeWidget`); keep `PowaSnapshot.sample` complete. iCloud evicts files under `native/ios`: a Ruby injector at 0% CPU means that, and `brctl download native/ios/App/App.xcodeproj` fixes it.
- iOS simulator: screenshots often capture before a tap's result paints, and the first Live Activity start can freeze WKWebView painting. Check on a real device.
- Messaging and form checks have no demo path (real Supabase only).
- Set fields: `rpeHi`, `rir`, `pct`, `weightHi`, `pctHi` (prescriptions and ranges), `extra`, `attempt`, `skipped`, `plannedReps` (what happened on the day). Every set copy must carry them: use `rxOf(set)`. Display through `setEffortText` / `setLoadText`; typed loads parse through `parseLoadInput`, pasted programs through `parsePrescription`.
- Coach demo code that runs during the first render must not use a `const`/`let` declared later in coach.html (TDZ): use function declarations and lazily set `var`s.
- `api/opl.js` is plain CommonJS (no package.json). The iPhone app calls `https://www.powalifta.com/api/opl`; the local python server has no `/api`, so browser tests mock it (Playwright: `serviceWorkers: 'block'`, or the service worker re-issues the fetch past the mock). `copy-web.sh` leaves `api/` out of the bundle.
- Apple product ids (`com.powalifta.app.coach.{basic,pro,premium}` and `.yearly`) must match in `StoreKitPlugin.swift`, `apple-iap`, `apple-notifications` and `IAP_TIER_META`.
- Coach branding paints `--fire` under `html body.powa-app.is-branded` (to out-rank the dark theme); the gradient's second stop is `brandTint` in JS, not `color-mix`.
- Demos: `athlete.html?demo=1` (coached lifter), `&solo=1` (training alone), `&brand=1` (coach branding), `coach.html?demo=1` (full roster; Arjun `demo-a1` carries the showcase block, a past block and meets), `coach.html?demo=1&fresh=1` (a brand-new coach). Never let a first-run screen be an empty black page.
- The app's generic `input[type=…]` and `body.site a` rules out-rank single-class rules: the onboarding pins its own field and link styles under `.ob-sheet` (native-onboard.css end), and the light theme has its own darker text shades for lift, RPE, PR and alert colours (styles.css "Light theme legibility").
- Where recent features live (full notes in the vault's feature notes): Train v9 `openSessionPicker`; Grid view `buildProgramGrid`; laptop roster `_rosterWide()` / `renderRosterTable` / `coachAthleteStatus` / `renderAthletePage`; maxes + blocks `programMaxKg` / `archiveProgramIfTrained` / `nextBlockWeeks`; custom check-ins `dueCheckinQuestions` / `openCustomCheckinSheet`; coach first run `buildCoachSetup`; yearly plans `_periodSwitch` / `buildCheckoutUrl(tier, user, period)`; branding `applyCoachBrand` / `openBrandSheet`; OpenPowerlifting `openOplSheet` / `oplPlan`.
- Apple Health (1.3, branch `feat/apple-health`, NOT in 1.2): `native/ios-native/App/HealthPlugin.swift` (JS `PowaHealth`), added by `native/scripts/inject-health.rb` (run by inject-all.sh); the logic is `health.js`. Every write to Health carries a sync identifier, so saving again replaces and never duplicates. Simulator testing needs an ad-hoc signed build. Full notes: vault `Features/Apple Health.md`, `Code/Gotchas.md`.

## Testing

- `node test/run-unit-tests.js` runs the `tests.html` suite headlessly (open `tests.html` in a browser for the full count); `node test/opl-api.test.cjs`; `node test/uiscan.mjs` is the layout scanner (~110 screens, dark + light).
- Browser checks run on the demos above. The iPhone app needs a re-bundled build to show a web change (see Gotchas).

## Style conventions

- Inline `<script>` blocks at the bottom of each HTML page wire up the page-specific glue. `app.js` is the shared library.
- Don't introduce a build step. Vercel serves the files raw.
- Don't add new JS frameworks. Pure vanilla.
- Website classes use the `s-*` prefix (site.css); app motion lives in styles.css / dash-fx.css.
- New tables and policies go in their own `sql/migration-*.sql` file for the owner to run.

## When in doubt

- Editing the homepage: keep the calculator ids, the three modals, `#nativeWelcome`, `#pricing` and `#marketplace-teaser` (the iPhone app hides those two by id for Apple 3.1.1).
- Adding a new feature that touches DB: write a migration + check if you need to add a mapper in `db.js`.
- Adding a new public page: `<body class="site">`, include `styles.css` then `site.css`, `site.js` (defer), `error-log.js`, the Plausible tag and the native-detect snippet, plus `<nav class="nav" id="nav">` (renderNav) and the shared `footer.s-foot` (copy it from any public page). Use `.s-page-head` + `.s-wrap.s-narrow` + `.s-prose` for a text page.
