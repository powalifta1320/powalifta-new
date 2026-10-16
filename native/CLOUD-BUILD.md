# Build + ship POWALIFTA iOS — no local Xcode (cloud build)

You do NOT need Xcode on your Mac. iOS apps must be *compiled* on macOS, but a
cloud CI does that for you. Recommended: **Codemagic** (built for Capacitor,
free tier, handles signing + uploads to App Store Connect).

## What you need first
- Apple Developer account ✅ (you have it)
- Your repo on GitHub ✅ (`powalifta1320/powalifta-new`)
- These files, committed: `native/capacitor.config.json`, `native/package.json`,
  **and `native/assets/` (the brand icon + splash source art)**. `native/ios`
  stays gitignored — the cloud rebuilds it fresh, which means it starts with
  Capacitor's placeholder icon and the build MUST regenerate the real one from
  `native/assets/` (see the icon step below). If `native/assets/` isn't committed,
  every build ships the blue placeholder icon — this was the original bug.
- Easiest path is **config-as-code**: commit the repo-root `codemagic.yaml`
  (already added). It encodes the correct order — install → copyweb → cap add →
  **generate icon/splash** → sync → pods → archive — so you can't miss a step.

## Step-by-step (Codemagic, UI-guided — easiest)
1. Go to **codemagic.io** → sign up with GitHub → authorize your `powalifta-new` repo.
2. Add app → pick the repo → when it asks project type, choose **Capacitor**.
3. Set the **project root / Capacitor path** to `native` (that's where
   `capacitor.config.json` + `package.json` live; the web app is one level up at `..`).
4. **Code signing (iOS):** choose **Automatic**. Codemagic asks for an
   **App Store Connect API key** — create one at
   App Store Connect → Users and Access → Integrations → App Store Connect API →
   generate a key (Admin/App Manager role), download the `.p8`, note the Key ID +
   Issuer ID, and paste those into Codemagic. This replaces certificates entirely.
5. **Bundle ID:** `com.powalifta.app`. Team: your Apple Developer team.
6. Distribution: **App Store / TestFlight**.
7. Hit **Start build**. With the root `codemagic.yaml` present Codemagic uses it
   automatically and runs, in its cloud Mac:
   `npm install` → `npm run copyweb` → `npx cap add ios` →
   **`npx capacitor-assets generate --ios`** (brand icon + splash) →
   `npx cap sync ios` → `pod install` → archive → sign → upload to App Store
   Connect. ~15–25 min. (If you use the UI script fields instead of the yaml, add
   those two extra lines — `npm run copyweb` and the `capacitor-assets generate`
   step — or the app ships blank + placeholder-iconned.)
8. When it lands in App Store Connect: add screenshots + the listing from
   `native/APP-STORE.md`, then submit for review.

> First, create the app record in App Store Connect (My Apps → + → New App,
> bundle id `com.powalifta.app`) so the upload has somewhere to go — OR let the
> first Codemagic upload create the TestFlight build and fill the listing after.

## `codemagic.yaml` (optional — the UI setup above is easier; use this only if
## you prefer config-as-code). Commit it at the REPO ROOT.
```yaml
workflows:
  ios-appstore:
    name: POWALIFTA iOS (App Store)
    instance_type: mac_mini_m2
    max_build_duration: 60
    integrations:
      app_store_connect: CODEMAGIC_ASC_KEY   # the API key name you saved in Codemagic → Teams → Integrations
    environment:
      ios_signing:
        distribution_type: app_store
        bundle_identifier: com.powalifta.app
      vars:
        XCODE_SCHEME: "App"
      node: 20
      xcode: latest
      cocoapods: default
    scripts:
      - name: Install native deps
        script: cd native && npm install
      - name: Add + sync iOS
        script: cd native && (npx cap add ios || true) && npx cap sync ios
      - name: Pods
        script: cd native/ios/App && pod install
      - name: Use provisioning profiles
        script: xcode-project use-profiles
      - name: Build IPA
        script: |
          xcode-project build-ipa \
            --workspace "$CM_BUILD_DIR/native/ios/App/App.xcworkspace" \
            --scheme "$XCODE_SCHEME"
    artifacts:
      - build/ios/ipa/*.ipa
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: true
```

## Alternatives if Codemagic isn't your thing
- **Ionic Appflow** (appflow.ionic.io) — same idea from Capacitor's makers; smaller free tier.
- **GitHub Actions + macOS runner** — free-ish, fully in-repo, but you write the
  Fastlane/xcodebuild yourself. More control, more setup.
- **Rent a cloud Mac** (MacinCloud, ~$20/mo) — remote Xcode GUI if you want to click through it.

## Freeing local space (only if you'd rather build locally after all)
You'd need ~40 GB free for Xcode; you have ~15 GB. Biggest easy wins: empty
`~/Downloads`, offload Photos to iCloud, `rm -rf node_modules` in old projects,
clear `~/Library/Caches`. Realistically the cloud path is less hassle than
clearing 30 GB.
