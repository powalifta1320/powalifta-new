/*
 * RestTimer — JS side of the native rest-timer bridge.
 *
 * This file is ONLY for the Capacitor native build. The Vercel web app never
 * loads it. In the browser/PWA there is no window.Capacitor, so athlete.html's
 * nativeRest* helpers already short-circuit and the pure-web timer runs as-is.
 *
 * The web app calls window.Capacitor.Plugins.RestTimer.{start,update,stop}.
 * The native CAP_PLUGIN macro (RestTimerPlugin.m) already exposes the plugin on
 * Capacitor.Plugins.RestTimer, so this file is a convenience for typed access /
 * a global handle. Load it with a <script> in the native build, or import it
 * from a bundled entry. It is a no-op anywhere window.Capacitor is absent.
 *
 * ── BUILD / RUN (do this on a Mac with Xcode, once the Apple Developer
 *    account is active) ───────────────────────────────────────────────────────
 *   1.  cd native-ios && npm install
 *   2.  mkdir -p www && printf '<!doctype html><title>POWALIFTA</title>' > www/index.html
 *       (Capacitor requires a webDir; the app loads server.url at runtime so this
 *        is just a placeholder. To ship fully offline instead, copy the repo's
 *        web files into www/ and delete the "server" block in capacitor.config.json.)
 *   3.  npx cap add ios
 *   4.  Copy ios/App/App/RestTimerPlugin.swift and RestTimerPlugin.m into the
 *       generated App target. Add the contents of Info.plist.additions.xml to
 *       ios/App/App/Info.plist.
 *   5.  In Xcode: File ▸ New ▸ Target ▸ Widget Extension named "PowaliftaWidget"
 *       (tick "Include Live Activity"). Replace its generated files with the
 *       three Swift files in ios/PowaliftaWidget/. Add RestActivityAttributes.swift
 *       to BOTH the App target AND the PowaliftaWidget target (Target Membership).
 *   6.  npx cap sync ios && npx cap open ios, then Run on a device
 *       (Live Activities don't show in the simulator's Dynamic Island reliably;
 *        test on an iPhone 14 Pro or newer for the pill, any iOS 16.2+ for the
 *        Lock Screen activity).
 */
(function () {
  if (typeof window === 'undefined') return;
  if (!window.Capacitor || typeof window.Capacitor.registerPlugin !== 'function') return;
  try {
    window.RestTimer = window.Capacitor.registerPlugin('RestTimer');
  } catch (e) { /* not native — ignore */ }
})();
