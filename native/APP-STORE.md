# POWALIFTA — App Store submission kit

Paste-ready metadata for App Store Connect + the pre-submit checklist. Everything
here is drawn from the live product; edit to taste. Character limits noted inline.

---

## App identity
- **Bundle ID:** `com.powalifta.app` (matches `native/capacitor.config.json`)
- **Primary category:** Health & Fitness
- **Secondary category:** Sports
- **Age rating:** 4+ (no objectionable content)
- **Price:** Free (in-app: none on iOS v1 — coach subscriptions are billed on the web via Lemon Squeezy, NOT via Apple IAP; see the "IAP" note at the bottom)

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
RPE-native programming, automatic e1RM tracking, and real coaching — all in one place. Free for athletes. Built for squat, bench, and deadlift.
```

**Keywords** (≤100 chars, comma-separated, no spaces after commas):
```
powerlifting,rpe,e1rm,strength,squat,bench,deadlift,coach,barbell,dots,program,gym,lifting,tracker
```

**Description** (≤4000 chars):
```
POWALIFTA is powerlifting software built for the barbell — not a generic fitness app bent into shape. If you train squat, bench, and deadlift by RPE, this is your log, your programming, and your line to your coach, in one place.

FOR ATHLETES — free
• Log every set by weight, reps, and RPE. Your e1RM updates automatically, competition-equivalent across variants.
• Track your DOTS and IPF GoodLift score, weight class, and estimated total as you get stronger.
• See your progress: e1RM over time, a training calendar, PR timeline, weekly volume, and lift balance.
• Get programming from your coach — weights, reps, RPE, tempo, and notes, session by session.
• Send form-check videos to your coach and get cues back.
• Plan your meet: openers, seconds, and thirds from your real e1RMs, plus a warm-up ramp.

FOR COACHES
• Manage your whole roster from one dashboard — who logged, who's stalling, who just PR'd.
• Build programs in RPE and assign them in a click. Save templates, reuse them across athletes.
• Review form checks, message athletes, and track adherence.
• Free with your first 3 athletes.

WHY RPE
Powerlifting runs on autoregulation. POWALIFTA is RPE-native from the ground up — your e1RM math, your programming, and your progress all speak the same language your coach does.

Free for athletes, forever. Coaches start free and grow into paid tiers only when their roster does.

Built for the barbell.
```

**What's New** (version notes, ≤4000):
```
First release on iOS. Everything from powalifta.com, now native: push notifications from your coach, home-screen access, and offline logging at the gym.
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
| User content (notes, form-check videos, messages) | Yes | Yes | No | App functionality |
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
```
POWALIFTA is a powerlifting training + coaching platform. To review the full
experience without creating an account, open the app and tap "Try the demo"
(or visit powalifta.com/athlete.html?demo=1) for a seeded athlete dashboard.

For a real account: sign up as a Solo athlete (free, no card) — email + password
only. Coach features are visible by signing up as a Coach.

Subscriptions: coach paid tiers are sold on our website (Lemon Squeezy, Merchant
of Record) and are NOT offered as Apple in-app purchases. The iOS app contains no
purchasable content; athletes use it free. Please see guideline note below.
```

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
- **3.1.1 (in-app purchase):** the app sells NOTHING inside iOS. Athlete features
  are free; coach subscriptions are a separate web purchase (Merchant of Record =
  Lemon Squeezy). Do NOT add "buy/upgrade" buttons that link out to web payment
  from inside the iOS app — that violates 3.1.1. The upgrade/billing UI must be
  hidden or inert on native (see the TODO in docs/native-app-spike.md).
- **5.1.1 (account deletion):** we have self-serve deletion (Settings → Delete my
  account, the `delete-account` function). Required by Apple. ✅ already built.
```
