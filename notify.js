/* notify.js: the allow-notifications moment (PowaNotify), 2026-10-28.
 *
 * Nobody had alerts on: nothing in the app asked, and the only way in was You → Notifications →
 * Enable on this device. This is the ask: one calm card with one line of value, Turn on and Not now.
 *
 *   LIFTER: Train's "Session done" screen (athlete.html renderToday, today's session only), with the
 *     reason that fits: coached → "Get a ping when your coach replies."; training alone in a club →
 *     a training buddy's nudge; the iPhone app → rest is up. Nothing to deliver → no card.
 *   COACH: PowaNotify.coachCard() returns the node for coach Home. The Home code places it:
 *       var n = window.PowaNotify && PowaNotify.coachCard({ lifters: rosterCount });
 *       if (n) home.appendChild(n);
 *     Put it after the lifters who need the coach (never above the one red fix), before meets and
 *     who's training now; phone and laptop alike (desktop browsers get Web Push). null = no card.
 *     Re-render freely: the decision is cached for the page and the entrance plays once.
 *
 * When (decide(), pure, tests.html "allow notifications (notify.js)"): never when alerts are already
 * on or blocked, switched off in the app (powa-push-off), "Not now" in the last 14 days, or in the
 * first minute of the first session on this device (powa-notify-first).
 * Turn on (the system prompt only ever follows that tap): the iPhone app asks iOS and registers with
 * APNs, the web subscribes where Web Push works (desktop browsers, Android, an iPhone Home Screen app
 * on iOS 16.4+); both through PowaPush.enable() in app.js. An iPhone browser tab can't get alerts,
 * so there the card says to use the app instead of offering a Turn on that can't work.
 * Demo (?demo=1): the card shows, and Turn on / Not now write nothing and ask for nothing.
 */
(function () {
  'use strict';

  var SNOOZE_KEY = 'powa-notify-snooze';   // when "Not now" was tapped (ms)
  var FIRST_KEY = 'powa-notify-first';     // when this device first opened a dashboard (ms)
  var OFF_KEY = 'powa-push-off';           // switched off in the app (app.js PowaPush.disable)
  var SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
  var FIRST_MS = 60 * 1000;
  var APP_STORE = 'https://apps.apple.com/app/powalifta/id6788506689';

  var LINES = {
    coach: 'Get a ping for PRs, messages and missed sessions.',
    coached: 'Get a ping when your coach replies.',
    buddy: 'Get a ping when a training buddy nudges you.',
    rest: 'Get a ping when rest is up, even with the app closed.'
  };
  var HOW_LINE = 'On iPhone, alerts come through the POWALIFTA app.';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function demoUrl() { try { return /[?&]demo=1\b/.test(location.search || ''); } catch (e) { return false; } }
  function isDemo() { return !!window._demoMode || demoUrl(); }

  // The start of this device's first session. Stamped when a dashboard first loads (never in a demo).
  var _firstSeen = Number(lsGet(FIRST_KEY)) || 0;
  if (!_firstSeen) { _firstSeen = Date.now(); if (!demoUrl()) lsSet(FIRST_KEY, String(_firstSeen)); }

  /* ---------- pure: what this device can do, what to say, whether to ask ---------- */

  // env: { native, secure, sw, pushManager, notification, ios }
  //  'native'  the iPhone app (APNs through the Capacitor plugin)
  //  'web'     Web Push works here (desktop browsers, Android, an iOS 16.4+ Home Screen app)
  //  'ios-app' an iPhone / iPad browser tab: no Web Push, the app is the way
  //  'none'    anything else (an in-app browser, an old browser, no HTTPS)
  function capability(env) {
    env = env || {};
    if (env.native) return 'native';
    if (env.secure && env.sw && env.pushManager && env.notification) return 'web';
    if (env.ios) return 'ios-app';
    return 'none';
  }

  // Which ping this person would get, or null when alerts would bring nothing.
  // ctx: { coached, club, native } for a lifter; role 'coach' for the coach (no lifters yet = null).
  function reasonKey(role, ctx) {
    ctx = ctx || {};
    if (role === 'coach') return ctx.lifters === 0 ? null : 'coach';
    if (ctx.coached) return 'coached';
    if (ctx.club) return 'buddy';
    if (ctx.native) return 'rest';
    return null;
  }
  // The one line of value for it.
  function reasonFor(role, ctx) { var k = reasonKey(role, ctx); return k ? LINES[k] : null; }
  // The bell wears the hue of where the ping comes from: Coach / Messages green (and the green of
  // the "Session done" card it sits under), Club gold for a training buddy.
  function hueFor(key) { return key === 'buddy' ? 'gold' : 'green'; }

  // o: { now, demo, reason, capability, permission ('default'|'granted'|'denied'|'unsupported'),
  //      subscribed, optedOut, snoozedAt, firstSeenAt }
  // → { show, why, mode: 'ask' (Turn on) | 'how' (use the app) | 'preview' (demo) }
  function decide(o) {
    o = o || {};
    var now = Number(o.now) || Date.now();
    var out = function (show, why, mode) { return { show: show, why: why, mode: mode || null }; };
    if (!o.reason) return out(false, 'no-reason');
    if (o.demo) return out(true, 'demo', 'preview');
    var cap = o.capability || 'none';
    if (cap === 'none') return out(false, 'unsupported');
    var perm = o.permission || 'default';
    if (perm === 'denied') return out(false, 'denied');
    if (o.optedOut) return out(false, 'opted-out');
    // On already. The iPhone app re-registers by itself at launch once iOS allows it (restorePush);
    // a browser that allows it but holds no subscription for this account (someone else signed out
    // here) still gets the card: Turn on then subscribes without a prompt.
    if (perm === 'granted' && (o.subscribed || cap === 'native')) return out(false, 'on');
    var snoozed = Number(o.snoozedAt) || 0;
    if (snoozed && Math.abs(now - snoozed) < SNOOZE_MS) return out(false, 'snoozed');
    var first = Number(o.firstSeenAt) || now;
    if (now - first < FIRST_MS) return out(false, 'first-minute');
    if (cap === 'ios-app') return out(true, 'ok', 'how');
    return out(true, 'ok', 'ask');
  }

  /* ---------- this device, now ---------- */

  function envNow() {
    var nav = window.navigator || {};
    var ua = nav.userAgent || '';
    return {
      native: !!(window.PowaNative && PowaNative.isNative && PowaNative.isNative()),
      secure: window.isSecureContext !== false,
      sw: 'serviceWorker' in nav,
      pushManager: 'PushManager' in window,
      notification: 'Notification' in window,
      // iPadOS Safari says "Macintosh"; a touch screen gives it away.
      ios: /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1)
    };
  }
  function within(p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(null); }, ms); })]); }

  var _state = null, _stateP = null;
  function readState() {
    var st = { capability: capability(envNow()), permission: 'unsupported', subscribed: false, optedOut: lsGet(OFF_KEY) === '1' };
    if (st.capability === 'native') {
      var P = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PushNotifications;
      if (!P || !P.checkPermissions) { st.capability = 'none'; return Promise.resolve(st); }   // a shell without the plugin
      return within(P.checkPermissions(), 3000).then(function (r) {
        var v = r && r.receive;
        st.permission = v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'default';
        st.subscribed = !!(window.PowaNative && PowaNative._subscribed);
        return st;
      }, function () { st.permission = 'default'; return st; });
    }
    if (st.capability === 'web') {
      var p = Notification.permission;
      st.permission = p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'default';
      if (st.permission !== 'granted') return Promise.resolve(st);
      return within(navigator.serviceWorker.getRegistration(), 3000).then(function (reg) {
        return reg && reg.pushManager ? within(reg.pushManager.getSubscription(), 3000) : null;
      }).then(function (sub) { st.subscribed = !!sub; return st; }, function () { return st; });
    }
    return Promise.resolve(st);
  }
  // Read once per page, and again in the background when the app comes back to the screen (iPhone
  // Settings may have changed it): the old answer stands until the new one lands, so nothing flickers.
  function state(fresh) {
    if (_state && !fresh) return Promise.resolve(_state);
    if (!_stateP || fresh) {
      _stateP = readState().then(function (s) { _state = s; return s; }, function () { _stateP = null; return _state; });
    }
    return _stateP;
  }
  try {
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !isDemo()) state(true); });
  } catch (e) {}

  /* ---------- the card ---------- */

  var _demoGone = false;           // the demo's Not now / Turn on: this page only, nothing stored
  var _shown = {};                 // placements whose entrance already played on this page
  var BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function node(tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
  function say(msg, ms) { try { if (typeof toast === 'function') toast(msg, ms); } catch (e) {} }
  function settingsPath() { return document.documentElement.classList.contains('desk') ? 'Settings → Notifications' : 'You → Notifications'; }

  function decisionFor(reason, st) {
    return decide({
      now: Date.now(), demo: isDemo(), reason: reason,
      capability: st ? st.capability : 'none', permission: st ? st.permission : 'unsupported',
      subscribed: st && st.subscribed, optedOut: st && st.optedOut,
      snoozedAt: Number(lsGet(SNOOZE_KEY)) || 0, firstSeenAt: _firstSeen
    });
  }

  // The card leaves the way it came in: it fades back down, then its space closes.
  function leave(card) {
    var slot = card.closest ? card.closest('.pn-slot') : null;
    var gone = function () { (slot || card).remove(); };
    if (!slot || reduced() || !card.animate || !slot.animate) { gone(); return; }
    var h = slot.getBoundingClientRect().height;
    var mt = getComputedStyle(slot).marginTop;
    var a = card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(0.98)' }],
      { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    a.onfinish = function () {
      slot.style.overflow = 'hidden';
      var b = slot.animate([{ height: h + 'px', marginTop: mt }, { height: '0px', marginTop: '0px' }],
        { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' });
      b.onfinish = gone;
    };
  }

  function done(card, sub) {
    var line = card.querySelector('.pn-text');
    card.classList.add('is-on');
    card.querySelector('.pn-ic').innerHTML = CHECK;
    line.innerHTML = '';
    line.appendChild(node('span', 'pn-line', 'Alerts on'));
    line.appendChild(node('span', 'pn-sub', sub));
    var acts = card.querySelector('.pn-acts');
    if (acts) acts.remove();
    try { if (window.PowaNative && PowaNative.notify) PowaNative.notify('SUCCESS'); } catch (e) {}
    setTimeout(function () { leave(card); }, 2200);
  }

  function build(placement, reason, mode, opts) {
    var card = node('div', 'pn-card pn-' + placement + ' hue-' + ((opts && opts.hue) || 'green') + (mode === 'how' ? ' is-how' : ''));
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Notifications');
    card.appendChild(node('span', 'pn-ic', BELL));
    var text = node('div', 'pn-text');
    text.setAttribute('aria-live', 'polite');
    text.appendChild(node('span', 'pn-line')).textContent = reason;
    if (mode === 'how') text.appendChild(node('span', 'pn-sub')).textContent = HOW_LINE;
    card.appendChild(text);

    var acts = node('div', 'pn-acts');
    var on;
    if (mode === 'how') {
      on = node('a', 'btn ui-btn-soft pn-on');
      on.href = APP_STORE; on.target = '_blank'; on.rel = 'noopener';
      on.textContent = 'Get the app';
      on.addEventListener('click', function () { lsSet(SNOOZE_KEY, String(Date.now())); setTimeout(function () { leave(card); }, 300); });
    } else {
      on = node('button', 'btn ui-btn-soft pn-on');
      on.type = 'button';
      on.textContent = 'Turn on';
      on.addEventListener('click', function () { turnOn(card, on, placement, opts); });
    }
    var later = node('button', 'ui-text-btn pn-later');
    later.type = 'button';
    later.textContent = 'Not now';
    later.addEventListener('click', function () {
      if (isDemo()) _demoGone = true; else lsSet(SNOOZE_KEY, String(Date.now()));
      leave(card);
    });
    acts.appendChild(on);
    acts.appendChild(later);
    card.appendChild(acts);

    if (!_shown[placement]) {
      _shown[placement] = true;
      card.classList.add('is-in');   // the entrance plays once per page; re-renders just show it
    }
    return card;
  }
  // Every card sits in a slot: the slot holds the gap above it and closes smoothly when it goes.
  function slotFor(placement) { return node('div', 'pn-slot pn-slot-' + placement); }

  // Must stay synchronous up to PowaPush.enable(): the browser only shows its prompt from a tap.
  function turnOn(card, btn, placement, opts) {
    if (btn.disabled) return;
    if (isDemo()) { _demoGone = true; done(card, 'Preview only in demo mode.'); return; }
    if (!window.PowaPush || !PowaPush.enable) return;
    btn.disabled = true;
    btn.textContent = 'Turning on…';
    var p;
    try { p = PowaPush.enable({ quiet: true }); } catch (e) { p = Promise.resolve(false); }
    Promise.resolve(p).then(function (ok) {
      var last = PowaPush._last || (ok ? 'on' : 'error');
      if (ok) {
        _state = { capability: (_state && _state.capability) || 'web', permission: 'granted', subscribed: true, optedOut: false };
        done(card, 'Change them any time in ' + settingsPath() + '.');
        try { if (opts && opts.onOn) opts.onOn(); } catch (e) {}
        return;
      }
      if (last === 'dismissed') {
        // The prompt was closed without a choice: that's a "not now" too.
        lsSet(SNOOZE_KEY, String(Date.now()));
        say('Alerts stay off. Turn them on any time in ' + settingsPath() + '.');
        leave(card);
        return;
      }
      if (last === 'error') {   // PowaPush.enable said why; the card stays for another go
        btn.disabled = false;
        btn.textContent = 'Turn on';
        return;
      }
      state(true);   // denied, unsupported, signed out: PowaPush.enable said why; the card goes
      leave(card);
    });
  }

  // The card for one placement (in its slot), or null. With this page's answer in hand it is built
  // at once, so a re-render never flickers; the first time, the slot fills in once the device answers.
  function card(placement, reason, opts) {
    if (!reason) return null;
    var slot = slotFor(placement);
    if (isDemo()) {
      if (_demoGone) return null;
      slot.appendChild(build(placement, reason, 'preview', opts));
      return slot;
    }
    if (_state) {
      var d = decisionFor(reason, _state);
      if (!d.show) return null;
      slot.appendChild(build(placement, reason, d.mode, opts));
      return slot;
    }
    state().then(function (st) {
      if (!slot.isConnected) return;
      var d = decisionFor(reason, st);
      if (!d.show) { slot.remove(); return; }
      slot.appendChild(build(placement, reason, d.mode, opts));
    });
    return slot;
  }

  // ctx: { coached, club, onOn }  (onOn: after alerts come on, e.g. the morning weigh-in reminder)
  function lifterCard(ctx) {
    ctx = ctx || {};
    var key = reasonKey('athlete', { coached: !!ctx.coached, club: !!ctx.club, native: capability(envNow()) === 'native' });
    return card('lifter', key ? LINES[key] : null, { onOn: ctx.onOn, hue: hueFor(key) });
  }
  // opts: { lifters } (0 = nothing to ping about yet, no card), onOn
  function coachCard(opts) {
    opts = opts || {};
    var key = reasonKey('coach', { lifters: opts.lifters });
    return card('coach', key ? LINES[key] : null, { onOn: opts.onOn, hue: hueFor(key) });
  }

  window.PowaNotify = {
    decide: decide, capability: capability, reasonFor: reasonFor, reasonKey: reasonKey, hueFor: hueFor, LINES: LINES,
    state: state, lifterCard: lifterCard, coachCard: coachCard,
    SNOOZE_MS: SNOOZE_MS, FIRST_MS: FIRST_MS,
    // For checks and support: forget "Not now" on this device and ask the device again.
    reset: function () { try { localStorage.removeItem(SNOOZE_KEY); } catch (e) {} _state = null; _stateP = null; _demoGone = false; _shown = {}; }
  };
})();
