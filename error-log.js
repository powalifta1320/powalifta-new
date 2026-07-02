/* ============================================================
 * POWALIFTA error-log — lightweight client-side error capture.
 *
 * Catches:
 *   - window.onerror (uncaught exceptions)
 *   - unhandledrejection (broken promises)
 *
 * For each error:
 *   - logs to console with [POWA-ERR] prefix
 *   - keeps last 50 errors in localStorage (key: powa_errors)
 *     so you can inspect window.__powaErrors() in DevTools
 *   - if SENTRY_DSN is set below, forwards to Sentry
 *   - if SUPABASE_ERROR_ENDPOINT is set, POSTs to a Supabase edge fn
 *
 * Network forwarding is throttled (per-session cap + per-signature dedupe +
 * offline skip + optional sampling) so a hot error loop can't flood the
 * endpoint. Local capture (localStorage + console) is never throttled.
 * Inspect the throttle at runtime with window.__powaErrorStats().
 *
 * To wire to Sentry: replace YOUR_SENTRY_DSN_HERE below with the DSN
 * from sentry.io (signup is free) and the loader script will fire.
 *
 * To wire to a Supabase edge function: see send-client-error.ts in
 * this folder for a copy-paste edge function. Replace
 * SUPABASE_ERROR_ENDPOINT below with its URL.
 * ============================================================ */
(function () {
  'use strict';

  var SENTRY_DSN = '';
  var SUPABASE_ERROR_ENDPOINT = 'https://cxnotrikxvzncupswvio.supabase.co/functions/v1/send-client-error';

  var STORAGE_KEY = 'powa_errors';
  var MAX_KEEP = 50;

  // --- Forwarding guardrails ------------------------------------------------
  // Local capture (localStorage, console) is always unthrottled. These caps
  // apply ONLY to the network forward, so a hot error loop (e.g. a render that
  // throws every animation frame) can't flood the edge function / Sentry.
  var FORWARD_MAX_PER_SESSION = 40; // hard ceiling on network posts per page-load
  var FORWARD_SAMPLE_RATE = 1;      // 0..1 — fraction of *new* signatures to forward
  var DEDUPE_SIGNATURES = true;     // forward each unique signature at most once/session
  var _forwardCount = 0;
  var _seenSigs = Object.create(null);

  function signatureOf(entry) {
    // Collapses "same bug firing repeatedly" into one network post per session.
    return (entry.kind || '') + '|' + (entry.msg || '') + '|' + (entry.src || '') + '|' + (entry.line || '');
  }

  function maybeForward(entry) {
    if (!SUPABASE_ERROR_ENDPOINT) return;
    // Offline? The SW + localStorage still hold it; skip the doomed request.
    try { if (navigator && navigator.onLine === false) return; } catch (e) {}
    if (_forwardCount >= FORWARD_MAX_PER_SESSION) return;
    if (DEDUPE_SIGNATURES) {
      var sig = signatureOf(entry);
      if (_seenSigs[sig]) { _seenSigs[sig]++; return; }
      _seenSigs[sig] = 1;
    }
    if (FORWARD_SAMPLE_RATE < 1 && Math.random() > FORWARD_SAMPLE_RATE) return;
    _forwardCount++;
    try {
      fetch(SUPABASE_ERROR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
        keepalive: true
      }).catch(function () {});
    } catch (e) {}
  }

  function read() {
    try {
      var s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s) : [];
    } catch (e) { return []; }
  }
  function write(arr) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(arr.slice(-MAX_KEEP))); } catch (e) {}
  }

  function record(kind, payload) {
    var entry = {
      kind: kind,
      ts: new Date().toISOString(),
      url: location.href,
      ua: (navigator.userAgent || '').slice(0, 200),
      msg: payload.msg,
      stack: payload.stack ? String(payload.stack).slice(0, 4000) : null,
      src: payload.src || null,
      line: payload.line || null,
      col: payload.col || null
    };
    var list = read();
    list.push(entry);
    write(list);
    try { console.warn('[POWA-ERR]', entry.msg, entry); } catch (e) {}

    maybeForward(entry);
  }

  window.addEventListener('error', function (e) {
    record('error', {
      msg: (e && e.message) || 'Unknown error',
      stack: e && e.error && e.error.stack,
      src: e && e.filename,
      line: e && e.lineno,
      col: e && e.colno
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    var reason = e && e.reason;
    record('promise', {
      msg: reason && (reason.message || String(reason)) || 'Unhandled promise rejection',
      stack: reason && reason.stack
    });
  });

  window.__powaErrors = function () { return read(); };
  window.__powaErrorsClear = function () { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} };
  // Inspect forwarding throttle in prod: { forwarded, uniqueSignatures, cap }.
  window.__powaErrorStats = function () {
    return { forwarded: _forwardCount, uniqueSignatures: Object.keys(_seenSigs).length, cap: FORWARD_MAX_PER_SESSION };
  };

  if (SENTRY_DSN) {
    var s = document.createElement('script');
    s.src = 'https://browser.sentry-cdn.com/7.119.0/bundle.tracing.min.js';
    s.crossOrigin = 'anonymous';
    s.onload = function () {
      try {
        window.Sentry.init({
          dsn: SENTRY_DSN,
          tracesSampleRate: 0.1,
          environment: location.hostname.includes('powalifta.com') ? 'production' : 'development'
        });
      } catch (e) { console.warn('Sentry init failed', e); }
    };
    document.head.appendChild(s);
  }
})();
