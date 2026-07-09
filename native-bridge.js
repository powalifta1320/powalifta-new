/* ============================================================
 * POWALIFTA native bridge (Capacitor).  Loaded on the app pages AFTER db.js.
 *
 * This file is a TOTAL NO-OP on the web (where `window.Capacitor` is undefined).
 * It only does anything inside the native iOS/Android shell, where Capacitor
 * injects `window.Capacitor` + `window.Capacitor.Plugins.*`. Because the web app
 * ships with no build step, we access the plugins through those runtime globals
 * rather than importing them — so the same source runs on web and native.
 *
 * Responsibilities on native:
 *   - dark status bar + brand background, hide the splash once the app is up
 *   - register for NATIVE push (APNs on iOS / FCM on Android) and store the
 *     device token in `push_subscriptions` with platform = ios|android
 *   - haptic feedback helper (falls back to navigator.vibrate on web)
 *   - route a tapped push notification to its deep link
 *
 * See docs/native-app-spike.md + native/README.md.
 * ============================================================ */
(function () {
  'use strict';

  var Cap = window.Capacitor;
  var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  var platform = (isNative && typeof Cap.getPlatform === 'function') ? Cap.getPlatform() : 'web'; // ios | android | web
  function plugins() { return (window.Capacitor && window.Capacitor.Plugins) || {}; }

  var PowaNative = {
    isNative: function () { return isNative; },
    platform: function () { return platform; },
    _subscribed: false,
    _perm: 'default',
    _token: null,

    // Haptic tap — native Haptics on the shell, navigator.vibrate on the web.
    haptic: function (style) {
      try {
        var H = plugins().Haptics;
        if (isNative && H) { H.impact({ style: style || 'MEDIUM' }); return; }
        if (navigator.vibrate) navigator.vibrate(30);
      } catch (e) {}
    },

    // Notification haptic — the richer SUCCESS/WARNING/ERROR buzz iOS reserves for
    // completed actions (timer done, PR hit, publish). Native Haptics.notification on
    // the shell; a distinctive vibrate pattern on the web. Feature-detected everywhere.
    notify: function (type) {
      var t = (type || 'SUCCESS').toUpperCase();
      try {
        var H = plugins().Haptics;
        if (isNative && H && H.notification) { H.notification({ type: t }); return; }
        if (navigator.vibrate) {
          navigator.vibrate(t === 'ERROR' ? [80, 60, 80] : t === 'WARNING' ? [40, 40, 40] : [30, 40, 120]);
        }
      } catch (e) {}
    },

    // Register for native push. Resolves true once the OS hands back a token and
    // we've stored it. No-op (false) on web — the web path stays on PowaPush/VAPID.
    registerPush: async function () {
      if (!isNative) return false;
      var Push = plugins().PushNotifications;
      if (!Push) return false;
      try {
        var perm = await Push.checkPermissions();
        if (perm.receive !== 'granted') perm = await Push.requestPermissions();
        this._perm = perm.receive;
        if (perm.receive !== 'granted') return false;
        var self = this;
        return await new Promise(function (resolve) {
          var done = false;
          Push.addListener('registration', async function (token) {
            if (done) return; done = true;
            try {
              var userId = window.DB ? await DB.getUserId() : null;
              if (userId && DB.saveNativePushToken) {
                await DB.saveNativePushToken(userId, token.value, platform, navigator.userAgent);
              }
              self._token = token.value;
              self._subscribed = true;
              resolve(true);
            } catch (e) { console.warn('native push save failed', e); resolve(false); }
          });
          Push.addListener('registrationError', function (e) {
            if (done) return; done = true;
            console.warn('native push registration error', e);
            resolve(false);
          });
          Push.register();
          setTimeout(function () { if (!done) { done = true; resolve(false); } }, 8000);
        });
      } catch (e) { console.warn('registerPush failed', e); return false; }
    },

    // Schedule a daily local notification nudging the athlete to log bodyweight.
    // Native-only, idempotent (fixed id → cancel + reschedule), fires ~8am local. Uses
    // @capacitor/local-notifications; a total no-op on the web and if the plugin/permission
    // isn't available. Caller gates on !demo + athlete.
    scheduleWeightReminder: async function () {
      if (!isNative) return false;
      var LN = plugins().LocalNotifications;
      if (!LN) return false;
      try {
        var perm = await LN.checkPermissions();
        if (perm.display !== 'granted') perm = await LN.requestPermissions();
        if (perm.display !== 'granted') return false;
        var ID = 8080; // stable id for the daily weigh-in reminder
        try { await LN.cancel({ notifications: [{ id: ID }] }); } catch (e) {}
        await LN.schedule({ notifications: [{
          id: ID,
          title: 'POWALIFTA',
          body: "Time to weigh in — log today's bodyweight.",
          schedule: { on: { hour: 8, minute: 0 }, allowWhileIdle: true },
          extra: { url: 'athlete.html' }
        }] });
        return true;
      } catch (e) { console.warn('weight reminder schedule failed', e); return false; }
    },

    // Turn the daily reminder off (used if we later add a settings toggle).
    cancelWeightReminder: async function () {
      if (!isNative) return;
      var LN = plugins().LocalNotifications;
      if (!LN) return;
      try { await LN.cancel({ notifications: [{ id: 8080 }] }); } catch (e) {}
    }
  };
  window.PowaNative = PowaNative;

  // Tag the document the INSTANT we know we're native (before first paint) so
  // CSS can adapt the shell: safe-area insets for the notch / home indicator,
  // no text-selection or long-press callouts, no rubber-band overscroll — the
  // things that otherwise make a WebView read as "a web page in a box".
  if (isNative) {
    document.documentElement.classList.add('native', 'native-' + platform);
    // Opt this WebView into the full screen so env(safe-area-inset-*) resolves
    // to the real notch / Dynamic Island / home-indicator sizes. Done in JS so
    // the web build's <meta viewport> is never touched (zero risk to the site).
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/.test(vp.getAttribute('content') || '')) {
      vp.setAttribute('content', vp.getAttribute('content') + ', viewport-fit=cover');
    }
  }

  if (!isNative) return; // ---- everything below is native-only ----

  // Keep the native status bar in sync with the in-app theme toggle: light
  // theme → dark text, dark theme → light text. (app.js fires 'themechange'.)
  function syncStatusBar(theme) {
    var SB = plugins().StatusBar;
    if (!SB) return;
    var light = theme === 'light';
    try { SB.setStyle({ style: light ? 'LIGHT' : 'DARK' }); } catch (e) {}
    try { SB.setBackgroundColor({ color: light ? '#ffffff' : '#0b0b0c' }); } catch (e) {}
  }
  window.addEventListener('themechange', function (e) {
    syncStatusBar(e && e.detail && e.detail.theme);
  });

  document.addEventListener('DOMContentLoaded', function () {
    var P = plugins();
    // Light haptic on primary tap targets — a big "this is a real app" tell.
    // Capture-phase + closest() so it fires once per logical control without
    // every handler needing to opt in.
    document.addEventListener('click', function (ev) {
      try {
        var hit = ev.target && ev.target.closest
          ? ev.target.closest('.btn, .dash-tab, .tab-btn, .bottom-tab, .bms-item, .sidebar-tab, .nav-user, .theme-toggle, .unit-toggle, .sig-bell, [role="button"]')
          : null;
        if (hit) PowaNative.haptic('LIGHT');
      } catch (e) {}
    }, true);
    // Status bar matched to the CURRENT theme (app.js has already applied
    // data-theme before paint), so a light-theme user doesn't get white text
    // on a white bar on first launch.
    syncStatusBar(document.documentElement.getAttribute('data-theme'));
    // Hide the splash once the web app has painted.
    if (P.SplashScreen) { setTimeout(function () { try { P.SplashScreen.hide(); } catch (e) {} }, 450); }
    // Tapping a push → follow its deep link.
    if (P.PushNotifications) {
      try {
        P.PushNotifications.addListener('pushNotificationActionPerformed', function (action) {
          var url = action && action.notification && action.notification.data && action.notification.data.url;
          if (url) { try { location.assign(url); } catch (e) {} }
        });
      } catch (e) {}
    }
    // Tapping the daily weigh-in reminder opens the athlete dashboard.
    if (P.LocalNotifications) {
      try {
        P.LocalNotifications.addListener('localNotificationActionPerformed', function (action) {
          var url = action && action.notification && action.notification.extra && action.notification.extra.url;
          if (url) { try { location.assign(url); } catch (e) {} }
        });
      } catch (e) {}
    }
  });
})();
