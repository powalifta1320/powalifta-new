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
  var SUPABASE_ERROR_ENDPOINT = '';

  var STORAGE_KEY = 'powa_errors';
  var MAX_KEEP = 50;

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

    if (SUPABASE_ERROR_ENDPOINT) {
      try {
        fetch(SUPABASE_ERROR_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
          keepalive: true
        }).catch(function () {});
      } catch (e) {}
    }
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
