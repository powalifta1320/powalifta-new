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
    }
  };
  window.PowaNative = PowaNative;

  if (!isNative) return; // ---- everything below is native-only ----

  document.addEventListener('DOMContentLoaded', function () {
    var P = plugins();
    // Dark status bar + brand background.
    if (P.StatusBar) {
      try { P.StatusBar.setStyle({ style: 'DARK' }); } catch (e) {}
      try { P.StatusBar.setBackgroundColor({ color: '#0b0b0c' }); } catch (e) {}
    }
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
  });
})();
