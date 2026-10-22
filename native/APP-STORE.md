# POWALIFTA — App Store submission kit

> v1.1 (2026-10-16): screenshots, header + search-results art and all paste-ready copy were generated into the gitignored `APP-STORE-1.1/` folder at the repo root (iPhone 6.3" 1206×2622 is now the REQUIRED iPhone size; 6.9" is optional; iPad 13" 2064×2752 required). Raw simulator captures live in `native/store/raw-*`.

Paste-ready metadata for App Store Connect + the pre-submit checklist. Everything
here is drawn from the live product; edit to taste. Character limits noted inline.

---

## App identity
- **Bundle ID:** `com.powalifta.app` (matches `native/capacitor.config.json`)
- **Primary category:** Health & Fitness
- **Secondary category:** Sports
- **Age rating:** 16+ (clubs + chat + a 16+ policy; see the age-rating section) (no objectionable content)
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
- Progress: one strength chart with PR weeks in gold, drag to read, projected to meet day
- Tap any exercise for its sets, last time, warm-up and form cues
- Lift mode: the session as a full-screen player, one set at a time, the rest as a ring
- A bigger PR moment, a lifter card that tilts with your phone, Story-size share cards
- Meet day: hand in the next attempt on the clock, practise the referee's commands, and the app stops a heavy single in the last ten days
- Your RPE, checked: which rep ranges you call easier than they are
- Pick your app icon in plate colours, and five Home Screen widgets: your total, today's session (log a set right from it on iOS 17), this week, the weigh-in and meet day
- Your gym's plates: no 25s? Plate math, warm-ups and load jumps use only the plates your gym has
- Help & support inside the assistant, with a WhatsApp or email hand-off to a real person
- Exports open the share sheet: save your data to Files or send it with AirDrop
- Coach plans: manage your subscription without leaving the app
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
| Fitness (the sets and sessions a lifter logs, the weigh-ins they type) | Yes | Yes | No | App functionality (your training log) |
| Health (1.3, read from Apple Health; see "Apple Health" below for exactly which data and when) | Yes | Yes | No | App functionality: the lifter's own log and their own current coach. Never advertising, never sold |
| User content (notes, form-check videos, messages, club posts + reactions) | Yes | Yes | No | App functionality |
| Photos or videos (profile photo, form-check videos) | Yes | Yes | No | App functionality |
| Other user contact info (Instagram and TikTok handles, optional) | Yes | Yes | No | App functionality (shown on your profile, club lifter card, coach page) |
| Coarse/precise location | No | — | — | — |
| Financial info / payment | No | — | — | Card data never touches us — Lemon Squeezy is Merchant of Record |
| Identifiers (device push token) | Yes | Yes | No | App functionality (push notifications) |
| Usage data (analytics) | No | — | — | Plausible is disabled inside the app (native-bridge.js; the bundle carries no analytics tag) |
| Purchases (coach subscription status) | Yes | Yes | No | App functionality — Apple in-app subscription, from Apple's signed transaction; no card data |
| User ID (account id) | Yes | Yes | No | App functionality — the account the data belongs to |
| Diagnostics (Other diagnostic data: an uncaught error's message, stack, page and user agent) | Yes | No | No | App functionality — `error-log.js` posts it to the `send-client-error` edge function (table `client_errors`), with no account id. Declared in `PrivacyInfo.xcprivacy` as `NSPrivacyCollectedDataTypeOtherDiagnosticData` (not linked, no tracking). In App Store Connect tick **Diagnostics → Other Diagnostic Data**: not linked, not tracking, App Functionality |

### Apple Health (1.3, branch feat/apple-health)
Checked against the code on 22 Oct 2026: `native/ios-native/App/HealthPlugin.swift`, `health.js`, `db.js` (APPLE HEALTH SHARING), `sql/migration-health-2026-10-22.sql`, `sql/migration-readiness-cut-2026-10-22.sql` (both live), `native/scripts/inject-health.rb`. If any of those change, re-check this list, `privacy.html` → Apple Health and `data.html` → What we keep.

**Asked for (one permission sheet).** Read: body mass, sleep analysis, resting heart rate, heart rate variability (SDNN), dietary energy consumed, dietary protein, workouts. Write: body mass, workouts. No clinical records, no background delivery. Workouts are in the read set but no code reads them (see "Before submitting" below).

**What leaves the phone (= "collected" for App Privacy).** All of it: Health category, linked to the user (the account id), not used for tracking, purpose App functionality.

| From Apple Health | Stored where | When it goes up | Who can read it (RLS) | Deleted when |
|---|---|---|---|---|
| Bodyweight (a scale or another app) | `bodyweight`, as an ordinary weigh-in | Whenever Health is on and a day has no POWALIFTA weigh-in (or the lifter picks Health's number) | The lifter; their current coach (`bw_coach_read`). The latest one also feeds club boards / the leaderboard if the lifter is on them and the weekly email (via Resend). Never the AI assistant: a weigh-in from Health carries a marked id (`healthBwUid`, a version-8 UUID) and `ai-chat.js` sends Gemini only the latest weigh-in the lifter typed | The lifter deletes the weigh-in, or deletes the account. Turning Health off keeps it |
| Sleep minutes, resting HR (bpm), HRV (ms) per day | `health_daily` (`sleep_min`, `rhr_bpm`, `hrv_ms`) | Only while `profiles.share_health_with_coach` is on (off by default; the insert/update policies refuse otherwise). The first upload is the last 14 nights and 35 days | The lifter; their current coach only while sharing is on (`health_daily_coach_read`) | At once when sharing goes off (trigger `trg_health_share_off`), which also happens when Health is turned off in the app and whenever `coach_id` changes (leave, removed, new coach: `trg_health_share_reset`). Account deletion cascades |
| Calories and protein eaten per day (two totals, no foods) | `nutrition_daily` (`kcal`, `protein_g`) | Only while `profiles.share_nutrition_with_coach` is on (a separate switch, off by default). The first upload is the last 14 days; a day with nothing logged sends no row | The lifter; their current coach only while food sharing is on | Same rules as `health_daily` (`trg_nutrition_share_off`, `trg_nutrition_share_reset`, cascade) |
| Last night's sleep, as a number | `checkin_answers` | Only if the coach asked a check-in question with "sleep" in it and the lifter taps Send (pre-filled, labelled "From Apple Health", editable) | The lifter and their current coach, like any check-in answer | With the account (cascade) |

**What stays on the phone (not collected).** The 14 nights of sleep, 35 days of resting HR and HRV, 14 days of calories and protein, the readiness / rest suggestion worked out from them (WebView localStorage, per account), and the Readiness / Lock Screen widget snapshot. Nothing is put in iCloud.

**Written to Health (not collected).** Weigh-ins logged in POWALIFTA (sync id `powa-bw-<id>`), and finished sessions as traditional strength training workouts with the session name, set count, total kg and the lifts (sync id `powa-session-<id>`; undo deletes it).

- **Xcode:** App target → Signing & Capabilities → **+ HealthKit** (inject-health.rb already adds the entitlement, the capability flag and both permission texts; with automatic signing, Xcode registers HealthKit on the App ID). Leave "Clinical Health Records" and "Background Delivery" off.
- **App Store Connect → App Privacy:** under Health & Fitness tick **Health** (and Fitness, as in the table above). For Health: *Is it linked to the user's identity?* **Yes**. *Used for tracking?* **No**. *Purposes:* **App Functionality** only. Nothing goes to advertising, analytics or data brokers; it is never sold and never in iCloud (privacy.html → Apple Health). The data written to Health and the data that stays on the phone are not declared.
- **Review notes:** the Apple Health paragraph is in the App Review notes block below.
- **Guidelines:** 5.1.3 (Health data only for the lifter's health and fitness features; shared with their coach only with the lifter's switch; not used for advertising or data mining; not in iCloud) and 5.1.1 (permission texts that say what is read and why; ask only for what's used). The app shows clearly what it does with Health (the Apple Health sheet) and the privacy policy covers it.
- **Before submitting 1.3:**
  1. DONE 2026-10-22: `HealthPlugin.swift` → `requestAccess`: take `HKObjectType.workoutType()` out of the **read** set (keep it in the share set). Nothing reads workouts, and asking for data the app doesn't use invites a 5.1.1 rejection. Then drop the sentence about Workouts in privacy.html → Apple Health.
  2. DONE 2026-10-22 (applies after the next cap sync + inject-all.sh): `inject-health.rb` → `NSHealthShareUsageDescription` ended "It stays on your phone unless you choose to share it with your coach", but weigh-ins brought in from Health are saved to the account and the coach sees them. Suggested: "POWALIFTA reads your bodyweight to fill in your weigh-ins, which are saved to your account like any weigh-in; last night's sleep, your resting heart rate and heart rate variability to suggest longer rests on harder days; and the calories and protein you log to show your daily averages while you make weight. Sleep, heart and food data stay on your phone unless you choose to share them with your coach."
  3. DONE 2026-10-22: no Apple Health data reaches the AI assistant (Google Gemini). `ai-chat.js` `promptSnapshot` sends the latest weigh-in the lifter typed (`app.js aiBodyweight`), never one from Health: imports get a marked id (`healthBwUid`) that every device recognises, and `PowaHealthJS.fromHealth` also catches older imports and a clash settled in Health's favour on the phone that has them. Sleep, resting HR, HRV, calories, protein and readiness are never read into any prompt. privacy.html → Apple Health says so. Known gap: a Health weigh-in imported before this fix, on a phone that's since been reset, isn't recognisable on another device.

**Tracking:** NO. The app does not track users across apps/sites. (Plausible is privacy-first + cookieless; declare "Data Not Used to Track You".)

## Screenshots (you capture from the running app — 6.7" + 6.1" iPhone required)
Shot list for 1.2 (captured from the simulator build in the athlete + coach demos; raw 1320×2868 in `native/store/raw-iphone-1.2/`):
1. **Train** — the hero: the next set, the loaded bar, the RPE scale, Log set.
2. **Lift mode** — the set as a full-screen player.
3. **Rest ring** — Lift mode's rest with the next set under it.
4. **PR moment** — the gold plate and the count-up.
5. **Progress** — the strength chart with PR weeks and the meet projection.
6. **Club feed** and 7. **Club board**.
8. **Meet mode** — the minute: SAFE / PLAN / SEND.
9. **Coach roster** and 10. **Program builder**.
Tip: the demos are seeded with real-looking data; keep the status bar (9:41) and hide nothing.

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

Apple Health (optional, off until the lifter turns it on under You → Apple Health): it reads bodyweight, sleep, resting heart rate, heart rate variability, and dietary energy and protein; it saves the lifter's weigh-ins and finished sessions (as strength training workouts). Weigh-ins brought in from Health become ordinary weigh-ins in the lifter's account. Sleep, resting heart rate and HRV leave the phone only if the lifter switches on sharing with their coach, and calories and protein only under a separate food-sharing switch; both are off by default, only the lifter and their current coach can read the shared data, and turning a switch off (or leaving the coach) deletes it on our server at once. Health data is linked to the account, never used for advertising or tracking, never sold, and never stored in iCloud. To try it on the review account: turn it on and allow access, log a weigh-in (Health → Body Measurements → Weight), finish a session (Health → Workouts). The demos do not use Apple Health.
```

## Age rating (App Store Connect → App Information → Age Rating)
1.1 went out rated 4+, which doesn't fit: the app has clubs (people post to each other) and coach chat, and the Terms and Privacy Policy set a minimum age of 16. Answer the questionnaire honestly (user-generated content: yes; messaging/chat: yes) and set the rating to 16+, using the age-rating override if the questionnaire lands lower.

## Signing & capabilities checklist (Xcode — you drive)
- [ ] Signing & Capabilities → select your Team (your Apple Developer account).
- [ ] Add capability: **Push Notifications**.
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
   **Yearly (2026-10-22, optional):** in the same group add three more, 1-year duration:
   `com.powalifta.app.coach.basic.yearly` $249.99, `com.powalifta.app.coach.pro.yearly`
   $499.99, `com.powalifta.app.coach.premium.yearly` $999.99, each on the SAME level as its
   monthly plan. The app already asks for them and shows a Monthly | Yearly switch as soon as
   they exist; deploy apple-iap + apple-notifications so the server knows the ids, and attach
   them to the version submission like the monthly ones.
4. **Xcode** → App target → Signing & Capabilities → **+ In-App Purchase**.
5. **Backend** → run `sql/migration-apple-iap.sql` in the SQL Editor, then
   `./deploy.sh` (deploys the `apple-iap` verifier — no new secret; optional
   `APPLE_ROOT_CA_B64` pins Apple's root cert offline).
6. **Submit** → with the next build, ATTACH all three subscriptions to the
   version submission (first-ever IAPs ride along with a binary review).
   App metadata also needs a Terms of Use (EULA) link — Apple's standard EULA
   (linked in App Store Connect's version page) is acceptable.
7. **Renewal/cancellation sync** (2026-10-21): the app sends this device's
   entitlements (Transaction.currentEntitlements, highest plan first) to
   `apple-iap` at purchase, restore, launch, every resume (at most every 10
   minutes), after a failed sync (backoff) and after Apple's manage sheet closes
   (`app.js` `syncAppleEntitlements`). Renewals that land while the app runs come
   through Transaction.updates (`iapTransaction`, retained until the page
   listens). **App Store Server Notifications V2 is required, not optional:**
   the database treats a plan as Free 3 days after its stored period end, so
   renewals of coaches who never reopen the app must arrive from Apple. Set
   App Store Connect → App Information → App Store Server Notifications →
   Production AND Sandbox URL
   `https://cxnotrikxvzncupswvio.supabase.co/functions/v1/apple-notifications`,
   Version 2, then Request a Test Notification (it should answer 200).
8. **Manage subscription** opens Apple's own sheet inside the app
   (`AppStore.showManageSubscriptions`, StoreKitPlugin `manageSubscriptions`;
   older builds fall back to apps.apple.com/account/subscriptions). A coach
   billed on the web sees their plan in the paywall but has no buy buttons:
   the app says the plan is billed outside the App Store, with no link.
- **5.1.1 (account deletion):** we have self-serve deletion (Settings → Delete my
  account, the `delete-account` function). Required by Apple. ✅ already built.
```
