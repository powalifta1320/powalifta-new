# POWALIFTA — App Store submission kit

> v1.1 (2026-10-16): screenshots, header + search-results art and all paste-ready copy were generated into the gitignored `APP-STORE-1.1/` folder at the repo root (iPhone 6.3" 1206×2622 is now the REQUIRED iPhone size; 6.9" is optional; iPad 13" 2064×2752 required). Raw simulator captures live in `native/store/raw-*`.

Paste-ready metadata for App Store Connect + the pre-submit checklist. Everything
here is drawn from the live product; edit to taste. Character limits noted inline.

---

## App identity
- **Bundle ID:** `com.powalifta.app` (matches `native/capacitor.config.json`)
- **Primary category:** Health & Fitness
- **Secondary category:** Sports
- **Age rating:** 4+ (no objectionable content)
- **Price:** Free, with three auto-renewable coach subscriptions via Apple In-App Purchase (see "In-App Purchase setup" below). Web billing (Lemon Squeezy) continues to exist for web signups — allowed under 3.1.3(b) because the same tiers are also purchasable in-app.

## Listing copy (paste into App Store Connect → App Information / Version)

**App Name** (≤30 chars):
```
POWALIFTA
```
*(alt if you want keywords in the name: `POWALIFTA: Powerlifting` — 23 chars)*

**Subtitle** (≤30 chars):
```
Built for the barbell
```
*(ASO-heavier alt: `Powerlifting log & coaching` — 27 chars)*

**Promotional text** (≤170 chars, editable anytime without review):
```
New: share lifts with your club, climb your club's board, and a rest timer that adjusts to every set. Free for lifters. Built for squat, bench and deadlift.
```

**Keywords** (≤100 chars, comma-separated, no spaces after commas):
```
powerlifting,rpe,e1rm,strength,squat,bench,deadlift,coach,barbell,dots,program,gym,lifting,tracker
```

**Description** (≤4000 chars) — v1.1.1:
```
POWALIFTA is a powerlifting app built for the barbell. Log every set by weight, reps and RPE, watch your total climb, and train with your club and your coach in one place.

TRAIN
- The next set is always the first thing you see. Logging it is one tap.
- Log by RPE. Your e1RM updates automatically, competition-equivalent across squat, bench and deadlift variants.
- Smart rest timer: heavier and harder sets rest longer, and it keeps counting on your Lock Screen.
- No coach? Build an 8-week block from your best lifts, or write your own program.

PROGRESS
- e1RM over time for every lift, your PRs, DOTS, IPF GoodLift score and weight class.
- Weekly volume, a training calendar, lift balance and meet results.
- Plan meet day: openers, seconds and thirds from your real numbers.

CLUBS
- Join your gym team, uni club or barbell crew. Find clubs by name or city, or join with a code.
- Share any set, PR or whole session to your club's feed.
- Climb your club's leaderboard, ranked by DOTS or this week's training.
- Clubs can be public or private. Private clubs approve who joins.
- Your club sees what you share and your stats, never your program or logs.

COACHING
- Get your program from your coach, message them, send form-check videos and do weekly check-ins.
- Coaches: manage your roster, see who trained and who's stalling, build RPE programs, save templates and give one program to many athletes at once.
- Free for coaches with up to 3 athletes. Bigger rosters are available as in-app subscriptions.

Free for lifters. Built for the barbell.

Terms of Use: https://www.powalifta.com/terms.html
Privacy Policy: https://www.powalifta.com/privacy.html
```

**What's New** (version notes, ≤4000) — v1.2:
```
New in 1.2

- Smart next set: the weight adjusts to how your last set felt
- Log your next set from the Lock Screen while the rest timer runs (iOS 17+)
- Club boards anyone can win: this week, most improved, strongest and 8-week seasons
- Training buddies: pair up with a clubmate, see each other's week, send a nudge
- Meet mode for competition day, plus a plan for your first meet
- New to lifting? A starter program and a simple "reps left" effort scale
- Morning weigh-in reminder, a weekly goal and a readiness check
- Milestones for plates on the bar and bodyweight lifts
- Coaches: paste a program straight from your spreadsheet
- Share your club with a QR code, or put the board on the gym TV
- A calmer, cleaner design, TikTok on profiles and an automatic word filter in clubs
```

## URLs
- **Support URL:** https://www.powalifta.com/faq.html
- **Marketing URL:** https://www.powalifta.com
- **Privacy Policy URL:** https://www.powalifta.com/privacy.html  *(required)*

## Privacy nutrition labels (App Store Connect → App Privacy)
Source of truth is `privacy.html`. Declare:

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Name | Yes | Yes | No | App functionality (your profile, coach roster) |
| Email address | Yes | Yes | No | App functionality (account, auth, transactional email) |
| Health & Fitness (workouts, bodyweight) | Yes | Yes | No | App functionality (your training log) |
| User content (notes, form-check videos, messages, club posts + reactions) | Yes | Yes | No | App functionality |
| Photos or videos (profile photo, form-check videos) | Yes | Yes | No | App functionality |
| Other user contact info (Instagram and TikTok handles, optional) | Yes | Yes | No | App functionality (shown on your profile, club lifter card, coach page) |
| Coarse/precise location | No | — | — | — |
| Financial info / payment | No | — | — | Card data never touches us — Lemon Squeezy is Merchant of Record |
| Identifiers (device push token) | Yes | Yes | No | App functionality (push notifications) |
| Usage data (analytics) | Yes | No | No | Analytics — Plausible, cookieless, no cross-app tracking |

**Tracking:** NO. The app does not track users across apps/sites. (Plausible is privacy-first + cookieless; declare "Data Not Used to Track You".)

## Screenshots (you capture from the running app — 6.7" + 6.1" iPhone required)
Shot list — run the app (or powalifta.com on a phone), these screens sell it:
1. **Today session** — a coach-programmed day with sets/RPE (the core loop).
2. **Progress** — e1RM-over-time chart + strength score (DOTS/IPF GL).
3. **Strength score card** — DOTS, weight class, best lifts.
4. **Coach roster** (if pitching coaches) — the dashboard with attention flags.
5. **Meet planner** — openers/seconds/thirds.
Tip: use a real-looking demo account; hide any test data that looks fake.

## App Review notes (App Store Connect → submit)
Fill in the demo account line first: sign up as a lifter on a spare email, join a public club, post a set, then paste the login here.
```
POWALIFTA is a powerlifting training and coaching app. Lifters log sets by weight, reps and RPE; coaches run their athletes; lifters can join clubs to share lifts.

No account needed to look around: on the welcome screen tap "Athlete demo" or "Coach demo" at the bottom. The demo is seeded with sample data, including a club feed, and nothing in it is saved.

Demo account (live backend): [email] / [password]. An athlete in a club with posts, so you can post, report and block.

In-app purchases: coach plans (Basic, Pro, Premium) are auto-renewable subscriptions sold with In-App Purchase. On a coach account they're under You → Plan & billing, and the paywall also opens when a coach adds a 4th athlete. Lifters never pay. The app has no links or buttons to buy anything outside the App Store.

User-generated content (1.2): club posts, club names and profile names go through an automatic word filter (slurs, sexual content and threats are refused; swearing is starred). Any post or club can be reported (⋯ → Report), any lifter can be blocked, reports are reviewed within 24 hours, and the contact address is in the Terms: powalifta1320@gmail.com.

Age: POWALIFTA is for people 16 and older; sign-up asks people to confirm this.

Account deletion: You → Your data → Delete my account. It erases the account and its data straight away.

Live Activity: after a set is logged, the rest timer shows on the Lock Screen and in the Dynamic Island; on iOS 17+ it has a Log set button.
```

## Age rating (App Store Connect → App Information → Age Rating)
1.1 went out rated 4+, which doesn't fit: the app has clubs (people post to each other) and coach chat, and the Terms and Privacy Policy set a minimum age of 16. Answer the questionnaire honestly (user-generated content: yes; messaging/chat: yes) and set the rating to 16+, using the age-rating override if the questionnaire lands lower.

## Signing & capabilities checklist (Xcode — you drive)
- [ ] Signing & Capabilities → select your Team (your Apple Developer account).
- [ ] Add capability: **Push Notifications**.
- [ ] Add capability: **Background Modes** → Remote notifications (for push).
- [ ] Create an **APNs Auth Key (.p8)** in the Developer portal → Keys; note the
      Key ID + your Team ID. (These become the `send-push` secrets — see
      `docs/native-app-spike.md` Phase B. Not needed to UPLOAD, needed for push to
      actually deliver.)
- [ ] Bump build number, Product → Archive → Distribute → App Store Connect.

## ⚠️ Guideline gotchas to pre-empt
- **4.2 (minimum functionality / web wrapper):** we ship native value — push
  notification registration (APNs), camera capture for form checks (the video
  upload uses the device camera), offline logging (network-first service worker),
  and native chrome (status bar / splash / haptics). Say this in review notes if asked.
- **3.1.1 (in-app purchase):** RESOLVED by adding real StoreKit IAP (2026-07,
  after 5 rejection rounds). Coach tiers are purchasable in-app via the native
  paywall (`openNativePaywall` in app.js → StoreKitPlugin.swift). Still true:
  NEVER link to web payment or name the website as a place to pay from inside
  the app — steering remains prohibited. Web Lemon Squeezy billing coexists
  legally under 3.1.3(b) because the same tiers exist as IAP.

## In-App Purchase setup (App Store Connect — one-time)

1. **Agreements, Tax, and Banking** → sign the Paid Applications agreement +
   complete banking/tax. NOTHING below works until this clears.
2. **Small Business Program** → enroll (App Store Connect → Business). 15%
   commission instead of 30% under $1M/yr.
3. **App → Subscriptions** → create group **"Coach Plans"**, then three
   auto-renewable subscriptions, 1-month duration, EXACT product IDs
   (must match StoreKitPlugin.swift + supabase/functions/apple-iap/index.ts):
   - `com.powalifta.app.coach.basic`   — $24.99/mo — "Basic — up to 10 athletes"
   - `com.powalifta.app.coach.pro`     — $49.99/mo — "Pro — up to 25 athletes"
   - `com.powalifta.app.coach.premium` — $99.99/mo — "Premium — unlimited athletes"
   Each needs a localization (display name + description) and a review
   screenshot (screenshot the in-app paywall once it runs in the simulator).
4. **Xcode** → App target → Signing & Capabilities → **+ In-App Purchase**.
5. **Backend** → run `sql/migration-apple-iap.sql` in the SQL Editor, then
   `./deploy.sh` (deploys the `apple-iap` verifier — no new secret; optional
   `APPLE_ROOT_CA_B64` pins Apple's root cert offline).
6. **Submit** → with the next build, ATTACH all three subscriptions to the
   version submission (first-ever IAPs ride along with a binary review).
   App metadata also needs a Terms of Use (EULA) link — Apple's standard EULA
   (linked in App Store Connect's version page) is acceptable.
7. **Renewal/cancellation sync**: v1 syncs entitlements at purchase, restore,
   and app-launch (Transaction.currentEntitlements → apple-iap). App Store
   Server Notifications V2 (a webhook for server-pushed renewals/refunds) is
   the documented hardening step — add before scale.
- **5.1.1 (account deletion):** we have self-serve deletion (Settings → Delete my
  account, the `delete-account` function). Required by Apple. ✅ already built.
```
