# Native iOS / Android app (#32) — PROMOTED TO BUILD

**Status (updated):** promoted from spike to an active build. The web-side code is
DONE and web-safe; the native shell itself (Xcode/CocoaPods/`cap add ios`) + App
Store submission are the remaining GUI/account-gated steps on the developer.

**DONE (in-repo, all feature-detected — total no-op on the web):**
- `native/capacitor.config.json` + `native/README.md` (scaffold commands) + `native/APP-STORE.md` (listing copy, privacy labels, review notes, 3.1.1 guidance).
- `native-bridge.js` — Capacitor detection, dark status bar + splash hide, haptics, and NATIVE push registration (APNs/FCM token → `push_subscriptions`). Loaded on index/athlete/coach/marketplace after `db.js`.
- `PowaPush` (app.js) made native-aware: `enable/disable/isSubscribed/permission` route to the native plugin inside the shell, Web Push path byte-for-byte unchanged on the web.
- `DB.saveNativePushToken` (db.js) + `sql/migration-push-platform.sql` (platform column + nullable Web-Push keys). Client fails open pre-migration.
- **Apple 3.1.1 compliance:** coach upgrade (`openUpgradeModal`), billing (`openBillingPortal`), and the marketplace Buy button are gated OFF inside the native shell (no external web-payment path). Web monetization untouched.
- Camera: the form-check `<input type=file accept="video/*">` already invokes the iOS native camera — no change needed.

**REMAINING (developer, outside the repo):** install full Xcode + CocoaPods; run the `native/README.md` scaffold; `cap add ios`; app icons via `@capacitor/assets`; Xcode signing + Push capability + APNs key; App Store Connect listing (use `native/APP-STORE.md`) + screenshots; submit. Push DELIVERY to iOS also needs the `send-push` APNs branch + the APNs key secret (Phase B).

---

_Original spike write-up below (still the reference for the decision + phases)._

## The decision: Capacitor, not a rewrite

**Wrap the existing PWA in a thin native shell with [Capacitor](https://capacitorjs.com).**
The web app stays exactly as it is — vanilla JS, no build step — and Capacitor loads
the *same* HTML/JS/CSS inside a native WebView, adding App Store / Play Store
distribution and a bridge to native APIs (push, health, camera, haptics).

### Why not the alternatives

| Option | Verdict |
|---|---|
| **React Native / Flutter** | ❌ Full rewrite of ~7k lines into a new language + framework. Violates the "no frameworks, vanilla JS" rule, creates a second codebase to keep in sync, throws away every page we already shipped. |
| **Pure PWA only** (what we have) | ⚠️ Already installable + offline (network-first SW) + Web Push. But: **no App Store presence on iOS** (Home-Screen install only), iOS Web Push needs a manual Home-Screen install and is limited, and there's no native HealthKit/camera. Doesn't satisfy a store-front "app". |
| **TWA (Trusted Web Activity)** | ⚠️ Cheap Android→Play path that wraps the PWA. But **iOS has no TWA equivalent**, so we'd need Capacitor for iOS anyway — simpler to use one tool (Capacitor) for both. |
| **Capacitor** | ✅ One web codebase, two thin native shells. Preserves the no-build-step web app (Capacitor's build is separate, lives in `native/`). Native push + health + camera via plugins. The pragmatic path. |

## The foundation is already here

Capacitor loads the current site verbatim, so most of the work is done:

- **`manifest.json`** — complete (standalone, portrait, `#0b0b0c` theme, maskable
  icons `icon-192/512/512-maskable.png`, fitness categories).
- **`sw.js`** — network-first Service Worker; offline-capable, cache mirror.
- **Web Push (VAPID)** — `PowaPush` in `app.js` + `push_subscriptions` + `send-push`.
- **Responsive UI** — verified 0 horizontal overflow at 375px on every page (#7).
- **Icons / splash source** — `og.png` + the icon PNGs generate all native sizes.

## Build plan (phased)

### Phase A — scaffold (isolated, does not touch the web app)
A separate `native/` workspace with its own `package.json`/`node_modules` (gitignored).
The web app keeps zero dependencies.

```bash
mkdir native && cd native
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init POWALIFTA com.powalifta.app --web-dir ../   # loads the repo's static files
npx cap add ios
npx cap add android
npx cap sync
```

Decision to make at `cap init`: **bundle** the static files (`webDir` copies them into
the app → loads from `capacitor://localhost`, fully offline, CSP from `vercel.json`
does not apply) **vs. remote** (WebView points at `https://www.powalifta.com` →
always-fresh, but needs connectivity + the site's `frame-ancestors 'self'` CSP still
holds, which is fine — we never frame cross-origin). **Recommendation: bundle**, so
the app opens offline and store review can't be gated on our uptime; ship web updates
via a `cap sync` + store release (or Capacitor Live Updates later).

### Phase B — native push (replaces Web Push on native)
Native uses **APNs (iOS)** + **FCM (Android)** tokens via `@capacitor/push-notifications`,
*not* Web Push subscriptions. Keep `send-push` + `push_subscriptions`; add a
`platform` column (`web` | `ios` | `android`) and branch delivery: Web Push for `web`
rows, APNs/FCM for native rows. The per-category mute prefs (`migration-notification-prefs.sql`)
and the send gate (self or live coach↔athlete link) carry over unchanged.

### Phase C — native plugins (the "why it's an app, not a bookmark")
- **HealthKit / Health Connect** — `bodyweight` auto-sync (unlocks #23 Tier 2; the
  Tier-1 Shortcuts endpoint is forward-compatible, same upsert underneath).
- **Camera / Filesystem** — native capture for form-check videos (today it's an
  `<input type=file>`; native gives direct record + better upload).
- **Haptics, StatusBar, SplashScreen** — brand the chrome (`#0b0b0c` / red).

### Phase D — store submission
- Generate icon/splash sets from `og.png` + PNGs (`@capacitor/assets`).
- Privacy nutrition labels — the data map is already written in `privacy.html`
  (name/email, training data, no card data, sub-processors) — copy it across.
- App Store Connect + Play Console listings, screenshots, review.

## Why this stays a spike right now

Everything past Phase A is **account- and tooling-gated outside the repo**: Xcode +
Android Studio, an **Apple Developer account ($99/yr)** and **Play Console ($25
one-time)**, signing certificates, APNs keys / FCM project, and store review. Per the
build rules (build what needs no secrets/deploy; PREP the gated parts; SPIKE the
native path), the deliverable today is this decision + the scaffold commands, not a
half-installed toolchain committed to the repo.

**Apple review caveat:** guideline 4.2 rejects thin web wrappers. The app must add
native value — which is exactly Phase B + C (push, health, camera, offline). Ship
those with v1, don't submit a bare WebView.

## If we promote this to a build — concrete checklist

- [ ] `native/` workspace scaffolded (Phase A); `native/node_modules`, `native/ios`,
      `native/android` added to `.gitignore` (build artifacts, not source).
- [ ] `capacitor.config.json` committed (config is source; see template below).
- [ ] `sql/migration-push-platform.sql` — `push_subscriptions.platform` text default
      `'web'` + backfill; add to the ordered list in CLAUDE.md.
- [ ] `send-push/index.ts` — branch Web Push vs APNs/FCM on `platform`; add FCM/APNs
      secrets to `.env.example` + `deploy.sh`.
- [ ] `PowaPush` (app.js) — on native, register via the Capacitor plugin and POST the
      APNs/FCM token to `push_subscriptions` with the right `platform`.
- [ ] Phase C plugins wired behind capability checks (`Capacitor.isNativePlatform()`)
      so the same code no-ops on web.
- [ ] Apple Developer + Play Console accounts; signing + push credentials.
- [ ] Store listings + privacy labels (reuse `privacy.html` data map).

### Inert scaffold template — `capacitor.config.json`
```json
{
  "appId": "com.powalifta.app",
  "appName": "POWALIFTA",
  "webDir": "..",
  "server": { "androidScheme": "https" },
  "backgroundColor": "#0b0b0c",
  "plugins": {
    "SplashScreen": { "backgroundColor": "#0b0b0c", "showSpinner": false },
    "PushNotifications": { "presentationOptions": ["badge", "sound", "alert"] }
  }
}
```

### Inert scaffold template — `.gitignore` additions (when `native/` lands)
```
# Capacitor native shells — build artifacts, regenerated by `cap sync`. Source of
# truth is the web app + capacitor.config.json; the platform folders are not tracked.
native/node_modules/
native/ios/
native/android/
```
