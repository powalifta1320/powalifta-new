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
      @capacitor/status-bar@latest @capacitor/haptics@latest
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
