# ios-overlay — committed brand asset catalog

`native/ios/` is gitignored and rebuilt from scratch by every cloud build
(`npx cap add ios`), so it always starts with **Capacitor's placeholder AppIcon**
(a blue "X") and a default splash. That was the "logo doesn't show in Xcode /
App Store Connect" bug.

This folder is the fix. It holds the real brand asset catalog (`AppIcon.appiconset`
+ `Splash.imageset`, generated from `native/assets/icon.png` + `splash.png`) and is
**committed** (unlike `native/ios/`). The build copies it over the scaffolded
placeholder:

```
cp -Rf native/ios-overlay/App/App/Assets.xcassets/. native/ios/App/App/Assets.xcassets/
```

(See the "Apply committed brand icon + splash overlay" step in the repo-root
`codemagic.yaml`.) Plain `cp`, so unlike `capacitor-assets generate` it can't fail.

To refresh after changing the brand art: re-copy from `native/assets/`:

```
cp native/assets/icon.png   native/ios-overlay/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
cp native/assets/splash.png native/ios-overlay/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
cp native/assets/splash.png native/ios-overlay/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
cp native/assets/splash.png native/ios-overlay/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
```

The AppIcon is a single 1024×1024 "universal" image, which modern Xcode (15+)
accepts and expands to every size — no need for the old 20-slot icon set. The PNG
must have **no alpha channel** (App Store rejects transparent icons); the source
`native/assets/icon.png` is already opaque.
