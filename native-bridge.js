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

    // Selection tick: the light click iOS gives a picker wheel, a stepper or a
    // switch. Native only (on the web it would buzz on every pick).
    _selArmed: false,
    tick: function () {
      try {
        var H = plugins().Haptics;
        if (!isNative || !H || !H.selectionChanged) return;
        if (!PowaNative._selArmed && H.selectionStart) { H.selectionStart(); PowaNative._selArmed = true; }
        H.selectionChanged();
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
    // quiet = never show the permission prompt (the launch refresh below).
    registerPush: async function (quiet) {
      if (!isNative) return false;
      var Push = plugins().PushNotifications;
      if (!Push) return false;
      try {
        var perm = await Push.checkPermissions();
        if (perm.receive !== 'granted' && !quiet) perm = await Push.requestPermissions();
        this._perm = perm.receive;
        if (perm.receive !== 'granted') return false;
        var self = this;
        var handles = [];
        var finish = function (ok, resolve) {
          handles.forEach(function (h) { try { Promise.resolve(h).then(function (x) { if (x && x.remove) x.remove(); }); } catch (e) {} });
          resolve(ok);
        };
        return await new Promise(function (resolve) {
          var done = false;
          handles.push(Push.addListener('registration', async function (token) {
            if (done) return; done = true;
            try {
              var userId = window.DB ? await DB.getUserId() : null;
              if (userId && DB.saveNativePushToken) {
                await DB.saveNativePushToken(userId, token.value, platform, navigator.userAgent);
              }
              self._token = token.value;
              self._subscribed = true;
              finish(true, resolve);
            } catch (e) { console.warn('native push save failed', e); finish(false, resolve); }
          }));
          handles.push(Push.addListener('registrationError', function (e) {
            if (done) return; done = true;
            console.warn('native push registration error', e);
            finish(false, resolve);
          }));
          Push.register();
          setTimeout(function () { if (!done) { done = true; finish(false, resolve); } }, 8000);
        });
      } catch (e) { console.warn('registerPush failed', e); return false; }
    },

    // At launch, once signed in: if this iPhone already allows POWALIFTA's
    // notifications and the lifter didn't switch them off in the app, register
    // again without a prompt. Apple can change a device's push token, and this is
    // also how You → Notifications knows alerts are on after a restart.
    restorePush: async function () {
      if (!isNative) return false;
      var Push = plugins().PushNotifications;
      if (!Push) return false;
      try {
        var perm = await Push.checkPermissions();
        this._perm = perm.receive;
        var off = false;
        try { off = localStorage.getItem('powa-push-off') === '1'; } catch (e) {}
        if (perm.receive !== 'granted' || off) return false;
      } catch (e) { return false; }
      // Once per app session: later pages reuse this session's token.
      try {
        var t = sessionStorage.getItem('powa-push-token');
        if (t) { this._token = t; this._subscribed = true; return true; }
      } catch (e) {}
      var ok = await this.registerPush(true);
      try { if (ok && this._token) sessionStorage.setItem('powa-push-token', this._token); } catch (e) {}
      return ok;
    },

    // Schedule a daily local notification nudging the athlete to log bodyweight.
    // Native-only, idempotent (fixed id → cancel + reschedule), fires ~8am local. Uses
    // @capacitor/local-notifications; a total no-op on the web and if the plugin/permission
    // isn't available. Caller gates on !demo + athlete.
    // The lifter picks the time (powa-weigh-time, default 08:00) or turns it off
    // (powa-weigh-remind = '0') in the weigh-in sheet. Press-and-hold the
    // notification and type the number: the "Log weight" text action opens the
    // app with it, and the athlete dashboard saves it (applyPendingWeighIn).
    scheduleWeightReminder: async function () {
      if (!isNative) return false;
      var LN = plugins().LocalNotifications;
      if (!LN) return false;
      try {
        var ID = 8080; // stable id for the daily weigh-in reminder
        try { await LN.cancel({ notifications: [{ id: ID }] }); } catch (e) {}
        var on = true, hh = 8, mm = 0;
        try {
          on = localStorage.getItem('powa-weigh-remind') !== '0';
          var t = localStorage.getItem('powa-weigh-time');
          if (t && /^\d{1,2}:\d{2}$/.test(t)) { hh = Number(t.split(':')[0]); mm = Number(t.split(':')[1]); }
        } catch (e) {}
        if (!on) return true;
        var perm = await LN.checkPermissions();
        if (perm.display !== 'granted') perm = await LN.requestPermissions();
        if (perm.display !== 'granted') return false;
        try {
          await LN.registerActionTypes({ types: [{ id: 'POWA_WEIGH_IN', actions: [
            { id: 'log', title: 'Log weight', input: true, inputButtonTitle: 'Save', inputPlaceholder: "Today's weight", foreground: true }
          ] }] });
        } catch (e) {}
        await LN.schedule({ notifications: [{
          id: ID,
          title: 'Morning weigh-in',
          body: "Press and hold to type today's weight.",
          schedule: { on: { hour: hh, minute: mm }, allowWhileIdle: true },
          actionTypeId: 'POWA_WEIGH_IN',
          extra: { url: 'athlete.html', kind: 'weigh-in' }
        }] });
        return true;
      } catch (e) { console.warn('weight reminder schedule failed', e); return false; }
    },

    // REST IS UP (2026-10-22). The Live Activity shows the countdown on the Lock Screen but
    // can't make a sound when it ends, so a lifter with the phone in a pocket missed it. When
    // the app leaves the screen mid-rest the page schedules one local notification for the
    // end; coming back, stopping, pausing or finishing cancels it. Never asks for permission
    // mid-set: it only schedules when notifications are already allowed (the weigh-in
    // reminder asks once, at sign-in).
    scheduleRestEnd: async function (endTimeMs, nextLabel) {
      if (!isNative) return false;
      var LN = plugins().LocalNotifications;
      if (!LN) return false;
      try {
        try { await LN.cancel({ notifications: [{ id: 8090 }] }); } catch (e) {}
        if (!(endTimeMs > Date.now() + 2000)) return false;
        var perm = await LN.checkPermissions();
        if (perm.display !== 'granted') return false;
        await LN.schedule({ notifications: [{
          id: 8090,
          title: "Rest's up",
          body: nextLabel ? 'Next: ' + String(nextLabel).slice(0, 60) : 'Time for your next set.',
          schedule: { at: new Date(Math.round(endTimeMs)), allowWhileIdle: true },
          sound: 'default',   // the plugin is silent on iOS unless a sound is named; an unknown name plays the system sound
          extra: { url: 'athlete.html', kind: 'rest-end' }
        }] });
        return true;
      } catch (e) { console.warn('rest-end schedule failed', e); return false; }
    },
    cancelRestEnd: async function () {
      if (!isNative) return;
      var LN = plugins().LocalNotifications;
      if (!LN) return;
      try { await LN.cancel({ notifications: [{ id: 8090 }] }); } catch (e) {}
    },

    // Turn the daily reminder off (used if we later add a settings toggle).
    cancelWeightReminder: async function () {
      if (!isNative) return;
      var LN = plugins().LocalNotifications;
      if (!LN) return;
      try { await LN.cancel({ notifications: [{ id: 8080 }] }); } catch (e) {}
    },

    // ---- Apple In-App Purchase (StoreKitPlugin, JS name "PowaIAP") ----------
    // Thin feature-detected wrappers; every path resolves to a safe null/false
    // on web, on old iOS, or when the plugin isn't injected.
    iapSupported: async function () {
      var P = plugins().PowaIAP;
      if (!isNative || !P) return false;
      try { return !!(await P.isSupported()).supported; } catch (e) { return false; }
    },
    iapProducts: async function () {
      var P = plugins().PowaIAP;
      if (!isNative || !P) return [];
      try { return (await P.getProducts()).products || []; } catch (e) { return []; }
    },
    // uid rides along as Apple's appAccountToken so the server can bind the
    // signed transaction to THIS account (anti-replay).
    iapPurchase: async function (productId, uid) {
      var P = plugins().PowaIAP;
      if (!isNative || !P) return { state: 'unavailable' };
      try { return await P.purchase({ productId: productId, appAccountToken: uid }); }
      catch (e) { return { state: 'error', message: String(e && e.message || e) }; }
    },
    iapRestore: async function () {
      var P = plugins().PowaIAP;
      if (!isNative || !P) return [];
      try { return (await P.restore()).entitlements || []; } catch (e) { return []; }
    },
    iapEntitlements: async function () {
      var P = plugins().PowaIAP;
      if (!isNative || !P) return [];
      try { return (await P.getEntitlements()).entitlements || []; } catch (e) { return []; }
    },
    // Apple's manage-subscriptions sheet inside the app (iOS 15+). True once it has
    // been shown and closed; false on builds without it (the caller opens the
    // App Store's subscriptions page instead).
    iapManage: async function () {
      var P = plugins().PowaIAP;
      if (!isNative || !P || typeof P.manageSubscriptions !== 'function') return false;
      try { await P.manageSubscriptions(); return true; } catch (e) { return false; }
    },

    // ---- Home Screen (AppIconPlugin "PowaIcon", WidgetBridgePlugin "PowaWidget") ----
    // The icon's asset name ("" = the red primary), or null where icons can't change.
    appIcon: async function () {
      var P = plugins().PowaIcon;
      if (!isNative || !P) return null;
      try { var r = await P.get(); return r && r.supported ? (r.name || '') : null; } catch (e) { return null; }
    },
    setAppIcon: async function (name) {
      var P = plugins().PowaIcon;
      if (!isNative || !P) return false;
      try { return !!(await P.set({ name: name || '' })).ok; } catch (e) { return false; }
    },
    // What the widgets queued while the app was away (weigh-ins logged from the Home
    // Screen) and the powalifta:// URL that opened the app, cleared on read.
    takeWidgetPending: async function () {
      var P = plugins().PowaWidget;
      if (!isNative || !P || !P.takePending) return null;
      try { return await P.takePending(); } catch (e) { return null; }
    },
    // One snapshot of display-ready strings for the widgets; fire-and-forget.
    // null clears it (sign-out, account deletion): the widget shows its empty state.
    updateWidget: function (snapshot) {
      var P = plugins().PowaWidget;
      if (!isNative || !P) return;
      try { P.update({ json: snapshot ? JSON.stringify(snapshot) : '' }).catch(function () {}); } catch (e) {}
    }
  };
  window.PowaNative = PowaNative;

  // Tag the document the INSTANT we know we're native (before first paint) so
  // CSS can adapt the shell: safe-area insets for the notch / home indicator,
  // no text-selection or long-press callouts, no rubber-band overscroll — the
  // things that otherwise make a WebView read as "a web page in a box".
  if (isNative) {
    document.documentElement.classList.add('native', 'native-' + platform);
    // Apple 5.1.2(i): force analytics fully OFF in the shell BEFORE the deferred
    // Plausible tag fires (this non-deferred bridge executes during parse, ahead
    // of any defer script). Cookieless Plausible isn't "tracking" by Apple's
    // definition, but the app should transmit ZERO analytics so "we do not track"
    // is provable at the network layer. Web untouched — native branch only.
    try { localStorage.setItem('plausible_ignore', 'true'); } catch (e) {}
    // Opt this WebView into the full screen so env(safe-area-inset-*) resolves
    // to the real notch / Dynamic Island / home-indicator sizes. Done in JS so
    // the web build's <meta viewport> is never touched (zero risk to the site).
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/.test(vp.getAttribute('content') || '')) {
      vp.setAttribute('content', vp.getAttribute('content') + ', viewport-fit=cover');
    }
    // Kill pinch / double-tap zoom INSIDE the shell only — zooming then panning
    // sideways is the #1 "this is a website in a box" tell. The WEB build keeps
    // the zoomable viewport (WCAG 1.4.4 — the a11y audit deliberately left it);
    // native apps handle text size via OS settings instead.
    if (vp && !/maximum-scale/.test(vp.getAttribute('content') || '')) {
      vp.setAttribute('content', vp.getAttribute('content') + ', maximum-scale=1, user-scalable=no');
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
          ? ev.target.closest('.btn, .dash-tab, .tab-btn, .bottom-tab, .bms-item, .sidebar-tab, .nav-user, .theme-toggle, .unit-toggle, .sig-bell, button.ui-row, .ui-chip, .ui-seg button, .ui-icon-btn, .ui-text-btn, .ui-btn-soft, .prog-subtab, .nw-btn, .ob-card, [role="button"]')
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
          // Only a path on our own origin: a push is server-filtered, but never trust it alone.
          if (url) { try { var u = new URL(url, location.origin); if (u.origin === location.origin && u.pathname.indexOf('//') !== 0) location.assign(u.pathname + u.search); } catch (e) {} }
        });
      } catch (e) {}
    }
    // IAP wiring: mark availability (drives whether the tier UI shows at all —
    // no StoreKit means the app stays tier-blind, Apple 3.1.1), re-render the
    // plan pill once known, and sync any renewal/Ask-to-Buy transaction that
    // lands while the app is open.
    if (P.PowaIAP) {
      PowaNative.iapSupported().then(function (ok) {
        window._iapReady = !!ok;
        try { if (window.renderPlanPill) renderPlanPill(); } catch (e) {}
        // Send this device's App Store plans to the server (no-op until a coach is signed in).
        try { if (ok && window.syncAppleEntitlements) syncAppleEntitlements(true); } catch (e) {}
      });
      try {
        P.PowaIAP.addListener('iapTransaction', function (ev) {
          var jws = ev && ev.jws;
          if (window._demoMode || !jws || !window.DB || !DB.appleIapSync) return;
          DB.appleIapSync(jws).then(function (res) {
            if (res && res.ok) { if (window.refreshMyPlan) refreshMyPlan(true); }
            // Not taken yet (not signed in, offline): the entitlement stays on the
            // device, and the launch/resume sync sends it again.
            else if (window.syncAppleEntitlements) syncAppleEntitlements(true);
          }).catch(function () {});
        });
      } catch (e) {}
    }
    // Tapping the daily weigh-in reminder opens the athlete dashboard.
    if (P.LocalNotifications) {
      try {
        P.LocalNotifications.addListener('localNotificationActionPerformed', function (action) {
          // A weight typed into the morning reminder: keep it until the athlete
          // dashboard is up, which saves it as today's weigh-in.
          if (action && action.actionId === 'log' && action.inputValue) {
            try { localStorage.setItem('powa-pending-weighin', JSON.stringify({ v: String(action.inputValue).slice(0, 16), at: Date.now() })); } catch (e) {}
            if (typeof window.applyPendingWeighIn === 'function') { window.applyPendingWeighIn(); return; }
          }
          var url = action && action.notification && action.notification.extra && action.notification.extra.url;
          if (url && location.pathname.indexOf(url) < 0) { try { location.assign(url); } catch (e) {} }
        });
      } catch (e) {}
    }
  });
})();
