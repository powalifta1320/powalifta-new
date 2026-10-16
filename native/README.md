# POWALIFTA — native shell (Capacitor)

Wraps the existing vanilla-JS web app (the repo root) in a native iOS/Android
shell via [Capacitor](https://capacitorjs.com). The web app is unchanged;
Capacitor loads the SAME `index.html`/`app.js`/`styles.css` in a native WebView
and adds App Store distribution + native APIs (push, camera, health, haptics).

**Only `capacitor.config.json` is tracked.** `node_modules/`, `ios/`, `android/`
are gitignored build artifacts — regenerate them with the commands below.

---

## No local Xcode? (low disk) → build in the cloud
Xcode needs ~40 GB free. If you don't have it, **skip Xcode entirely and build in
the cloud** — see **`native/CLOUD-BUILD.md`** (Codemagic, free tier, no local
install). The rest of this file is the LOCAL-Xcode path; use whichever fits.

## Prerequisites — LOCAL build (do these first — they're the real gate)

1. **Full Xcode** — install from the Mac App Store (~7 GB, ~1 hr). You currently
   only have Command Line Tools. Then run once:
   ```
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
2. **CocoaPods** (Capacitor iOS needs it):
   ```
   sudo gem install cocoapods
   ```
   (or `brew install cocoapods` if you use Homebrew)
3. **Apple Developer account** — ✅ you have this. Sign in inside Xcode →
   Settings → Accounts.

## Scaffold (run from THIS `native/` directory)

```
cd native
npm init -y
npm i @capacitor/core@latest @capacitor/ios@latest @capacitor/android@latest \
      @capacitor/push-notifications@latest @capacitor/splash-screen@latest \
      @capacitor/status-bar@latest @capacitor/haptics@latest \
      @capacitor/local-notifications@latest   # daily weigh-in reminder
npm i -D @capacitor/cli@latest @capacitor/assets@latest

# capacitor.config.json is already here (tracked) — DON'T run `cap init`, it'd overwrite it.
npx cap add ios          # needs Xcode + CocoaPods
npx cap add android      # optional now; needs Android Studio
npx cap sync
npx cap open ios         # opens the project in Xcode
```

## App icons + splash (from the existing brand assets)

```
# put a 1024x1024 icon at native/assets/icon.png and a splash at native/assets/splash.png
npx @capacitor/assets generate --ios
```
Source art: repo root has `icon-512.png` / `og.png` — upscale a 1024 icon from
the brand mark; splash = red mark centered on `#0b0b0c`.

## 🏝️ FLAGSHIP — Dynamic Island / Live Activity rest timer

The marquee native feature and the strongest answer to guideline 4.2: when you tick a
set inside the shell, the rest timer lights up the **Dynamic Island + Lock Screen** with
a live countdown, progress bar, lift name, and brand colors — something a plain website
categorically cannot do.

**How it's wired (no change to the web UI):** `athlete.html` already calls the
feature-detected `window.Capacitor.Plugins.RestTimer.start/update/stop`. This ships the
missing native half.

### Committed sources (survive the `cap add ios` wipe)

`native/ios/` is gitignored and rebuilt every cloud build, so the native code lives in
**`native/ios-native/`** (committed) and is re-applied onto the fresh project each build:

| File | Target | Role |
|---|---|---|
| `ios-native/App/RestActivityAttributes.swift` | App **and** Widget | Shared ActivityKit model (endDate, paused, lift, total) |
| `ios-native/App/RestTimerPlugin.swift` | App | Capacitor plugin `RestTimer` (start/update/stop → manages the `Activity`) |
| `ios-native/Widget/RestLiveActivity.swift` | Widget | SwiftUI: Lock Screen + Dynamic Island (compact/minimal/expanded) |
| `ios-native/Widget/PowaWidgetBundle.swift` | Widget | `@main` widget bundle |
| `ios-native/Widget/Info.plist` | Widget | WidgetKit extension Info.plist |
| `scripts/inject-live-activity.rb` | — | Adds the plugin to the App target + creates the `PowaWidget` app-extension target + embeds it + flips `NSSupportsLiveActivities` |

The injector runs automatically in `codemagic.yaml` (step **"Inject Live Activity"**,
after `pod install`, before signing). It's idempotent and everything is gated on
iOS 16.1+ / ActivityKit being enabled — older devices are a graceful no-op and the
in-page timer is unchanged. **No APNs, no app group** — the countdown self-ticks from
`endDate` via `Text(timerInterval:)`.

### Manual steps you must do ONCE (can't be scripted — Apple account gated)

1. **Register the widget App ID.** In the Apple Developer portal (or let Xcode automatic
   signing create it), add **`com.powalifta.app.PowaWidget`** as an App ID. The extension
   can't sign/embed without it.
2. **Make Codemagic sign it.** The `environment.ios_signing` block only names the main
   bundle id. Either (a) switch that build to **automatic** signing so Codemagic's ASC key
   provisions *every* bundle id in the project, or (b) add a second entry for
   `com.powalifta.app.PowaWidget`. Optionally export `DEVELOPMENT_TEAM=<teamId>` as a
   Codemagic env var so the injector stamps it onto the widget target.
3. **Local Xcode (if you build locally instead of cloud):** after `npx cap add ios`, run
   `ruby native/scripts/inject-live-activity.rb`, then in Xcode select your Team on **both**
   the `App` and `PowaWidget` targets under Signing & Capabilities.

### See it live (on a physical device — the Simulator's Dynamic Island support is flaky)

1. Build/install the app on an **iPhone 14 Pro or newer** (Dynamic Island) running
   **iOS 16.1+**. Any iPhone on 16.1+ still gets the **Lock Screen** Live Activity.
2. Settings → Face ID & Passcode / Live Activities → ensure Live Activities are enabled.
3. Open the athlete dashboard → **Today** → tick a set complete. The rest timer starts →
   the Dynamic Island shows the countdown (long-press to expand), and it appears on the
   Lock Screen. **Pause / −15s / +30s / Skip** update it live; at zero it ends and you
   get the success haptic.

### Plugin registration (the piece that makes it actually fire)

Capacitor's `registerPlugins()` does **not** scan the runtime for `CAPBridgedPlugin`
classes — it only registers the class names in the bundle's generated
`capacitor.config.json` → `packageClassList` (built by `cap sync` from npm packages).
`RestTimerPlugin` is an **app-target** class, so it's never in that list and stays
**unregistered** (`window.Capacitor.Plugins.RestTimer` is `undefined`, every timer call
no-ops). The injector fixes this by appending `"RestTimerPlugin"` to `packageClassList`
**after** `cap sync`. ⚠️ **`cap sync` regenerates that file and drops it** — so if you
ever re-sync, **re-run `ruby native/scripts/inject-live-activity.rb`** before building.

### Verify / troubleshoot on device (Safari Web Inspector)

Mac Safari → Develop → [your iPhone] → the app's WebView → Console:
- `window.Capacitor.Plugins.RestTimer` → should be an **object** (not `undefined`). If
  `undefined`, the plugin isn't registered — re-run the injector, re-sync/rebuild.
- Tick a set: the console logs `[PowaRest] start → {started:true}`. `{started:false,
  reason:"disabled"}` = Live Activities off in Settings; `reason:"unsupported"` = pre-iOS-16.1.
- No Dynamic Island but console says `started:true` → the **PowaWidget** extension didn't
  build/embed (check the target exists + "Embed App Extensions" phase) or
  `NSSupportsLiveActivities` is missing from the built App Info.plist.

## ⚠️ Apple guideline 4.2 — DON'T submit a bare wrapper

A WebView of the website with no native features **gets rejected** as a
"repackaged website." Ship these first (the code for them is the next dev task,
tracked in `docs/native-app-spike.md` Phase B/C):
- **Native push** via APNs (not Web Push) — the biggest single "it's a real app" signal.
- Native **camera** capture for form-check videos.
- Native **splash / status bar / haptics** (this config already sets them up).
- Offline (the network-first `sw.js` already gives this).

## Ship checklist (App Store Connect — you drive these)

- [ ] Xcode: select your Team under Signing & Capabilities, bump build number.
- [ ] Add the **Push Notifications** capability + upload an APNs key.
- [ ] Product → Archive → Distribute App → App Store Connect → Upload.
- [ ] App Store Connect: create the app (bundle id `com.powalifta.app`), fill
      name/subtitle/description/keywords.
- [ ] Screenshots (6.7" + 6.1" iPhone at minimum) — capture from the running app.
- [ ] **Privacy nutrition labels** — the data map is already written in
      `privacy.html` (name/email, training data, no card data, sub-processors);
      copy it across.
- [ ] Submit for review. Budget for 1–2 rejection cycles (4.2 is the usual one).
