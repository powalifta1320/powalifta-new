/* feedback.js: the Feedback box (3 Nov 2026; the owner: "Everyone, admin page + email"). Every signed-in coach and
   lifter sends an idea or reports a problem, on the phone and the laptop; it reaches the owner on admin.html › Feedback
   and by email (the send-feedback edge function, sql/migration-feedback-2026-11-03.sql).

   Where it opens: You › Help › Feedback and Report a problem (the lifter app and the coach phone, PowaFeedback.youRows),
   the laptop rail's Feedback, Settings › Help & account › Report a problem and the ⌘K palette (desk.js).

   PowaFeedback.open(opts)         the sheet: uiSheet, a bottom sheet on the phone and the desk's centred dialog on a
                                   laptop. opts: { kind: 'idea' | 'problem', from: the control to focus again on close }
   PowaFeedback.buildContext(env)  a problem's technical details from what the page knows (pure: tested). An idea, or a
                                   problem with "Include technical details" off, sends {}.
   PowaFeedback.envNow()           what the page knows now: the screen, the path, web or the iPhone app, the browser,
                                   the window, the theme, the last few error messages (error-log.js). Never a query or
                                   hash, a name, training data, a token or an email.
   PowaFeedback.scrub(s)           emails, tokens and links' queries out (the function scrubs the same: a test holds them equal)
   PowaFeedback.deviceLabel(ua)    "iPhone · iOS 26.0 · Safari 26" (pure)
   PowaFeedback.draft              the unsent words, kept on this device for this account until they're sent
   PowaFeedback.youRows()          You's two rows

   The demo (window._demoMode): everything works up to Send, which says "In the demo, nothing is sent." and sends nothing. */
(function () {
  'use strict';
  var hasDom = typeof document !== 'undefined' && !!document.createElement;
  var KINDS = ['idea', 'problem'];
  var MAX_BODY = 4000, MAX_CONTEXT = 8192, MAX_ERRORS = 5;
  // The details' keys: the send-feedback function keeps exactly these (CONTEXT_KEYS there).
  var CONTEXT_KEYS = ['screen', 'route', 'app', 'version', 'device', 'ua', 'viewport', 'theme', 'layout', 'errors'];
  var INCLUDES = 'The screen, app version, web or iPhone app, device, screen size, theme and recent error messages. Never your training data.';
  var DRAFT_KEY = 'powa-feedback-draft-';
  var DRAFT_DAYS = 30;

  /* ---------------------------------------------------------------- pure */
  // What never belongs in the details: an email becomes [email], a token (a JWT, a Bearer value, 32+ characters of hex
  // or base64 with a digit in it) becomes [token], a link loses its query and fragment. Control characters go.
  function scrub(v) {
    return String(v == null ? '' : v)
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .replace(/\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, '$1')
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[token]')
      .replace(/\b(Bearer|token|apikey|access_token|refresh_token)([\s:=]+)[A-Za-z0-9._~+\/-]{8,}=*/gi, '$1$2[token]')
      .replace(/\b[A-Za-z0-9_\-+\/]{32,}={0,2}/g, function (m) { return /[0-9]/.test(m) && /[A-Za-z]/.test(m) ? '[token]' : m; })
      .replace(/\s{2,}/g, ' ').trim();
  }
  function clip(v, n) { var s = scrub(v); return s.length > n ? s.slice(0, n).trim() : s; }
  // "iPhone · iOS 26.0 · Safari 26", "Mac · Chrome 141", "Android 14 · Chrome 141", the iPhone app's web view: "… · app".
  function deviceLabel(ua) {
    ua = String(ua || '');
    var dev = '', m;
    if ((m = /iPhone OS (\d+)[._](\d+)/.exec(ua))) dev = 'iPhone · iOS ' + m[1] + '.' + m[2];
    else if ((m = /iPad; CPU OS (\d+)[._](\d+)/.exec(ua))) dev = 'iPad · iPadOS ' + m[1] + '.' + m[2];
    else if ((m = /Android (\d+(?:\.\d+)?)/.exec(ua))) dev = 'Android ' + m[1];
    else if (/Macintosh|Mac OS X/.test(ua)) dev = 'Mac';
    else if (/Windows/.test(ua)) dev = 'Windows';
    else if (/CrOS/.test(ua)) dev = 'Chromebook';
    else if (/Linux/.test(ua)) dev = 'Linux';
    var br = '';
    if ((m = /Edg(?:iOS|A)?\/(\d+)/.exec(ua))) br = 'Edge ' + m[1];
    else if ((m = /(?:OPR|OPiOS)\/(\d+)/.exec(ua))) br = 'Opera ' + m[1];
    else if ((m = /(?:FxiOS|Firefox)\/(\d+)/.exec(ua))) br = 'Firefox ' + m[1];
    else if ((m = /(?:CriOS|Chrome)\/(\d+)/.exec(ua))) br = 'Chrome ' + m[1];
    else if ((m = /Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari/.exec(ua))) br = 'Safari ' + m[1];
    else if (/AppleWebKit/.test(ua) && /(iPhone|iPad)/.test(ua)) br = 'app';
    return [dev, br].filter(Boolean).join(' · ');
  }
  function isoish(t) { return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(t) ? t.slice(0, 30) : null; }
  // env: { kind, include, screen, path, shell: 'web' | 'ios' | 'android', version, ua, w, h, dpr, theme, desk, native,
  //        errors: error-log.js entries ({ kind, msg, ts, ... }), now (ms, for "recent") }
  // → the details as sent (only CONTEXT_KEYS, each cut to the function's sizes), or {}.
  function buildContext(env) {
    env = env || {};
    if (env.kind !== 'problem' || !env.include) return {};
    var c = {};
    var put = function (k, v) { if (v != null && v !== '') c[k] = v; };
    put('screen', clip(env.screen, 80));
    put('route', clip(String(env.path || '').replace(/[?#].*$/, ''), 200));
    put('app', env.shell === 'ios' ? 'iphone' : env.shell === 'android' ? 'android' : 'web');
    put('version', clip(env.version, 60));
    put('device', clip(deviceLabel(env.ua), 120));
    put('ua', clip(env.ua, 300));
    var w = Math.round(Number(env.w) || 0), h = Math.round(Number(env.h) || 0), dpr = Number(env.dpr) || 1;
    put('viewport', w > 0 && h > 0 ? w + '×' + h + (dpr > 1 ? ' @' + (Math.round(dpr * 10) / 10) + 'x' : '') : null);
    put('theme', env.theme === 'light' || env.theme === 'dark' ? env.theme : null);
    put('layout', env.desk ? 'desk' : env.native ? 'phone' : null);
    // The last few error messages from the last 24 hours: the message and when, never a stack, a file or a payload.
    var now = Number(env.now) || Date.now();
    var errs = (Array.isArray(env.errors) ? env.errors : []).filter(function (e) {
      if (!e || typeof e !== 'object' || !e.msg) return false;
      var t = Date.parse(e.ts || e.at || '');
      return !t || now - t < 864e5;
    }).slice(-MAX_ERRORS).map(function (e) {
      var o = { kind: e.kind === 'promise' || e.kind === 'warn' ? e.kind : 'error', msg: clip(e.msg, 200) };
      var at = isoish(e.ts || e.at);
      if (at) o.at = at;
      return o;
    }).filter(function (e) { return e.msg; });
    if (errs.length) c.errors = errs;
    return c;
  }
  // The details as label: value lines, for "See what's sent" (pure).
  function contextLines(c) {
    c = c || {};
    var L = [];
    var APP = { web: 'Web', iphone: 'iPhone app', android: 'Android app' };
    if (c.screen) L.push(['Screen', c.screen]);
    if (c.route) L.push(['Page', c.route]);
    L.push(['App', [APP[c.app] || 'Web', c.version || ''].filter(Boolean).join(' ')]);
    if (c.device) L.push(['Device', c.device]);
    if (c.viewport) L.push(['Screen size', c.viewport + (c.layout === 'desk' ? ', laptop layout' : c.layout === 'phone' ? ', phone layout' : '')]);
    if (c.theme) L.push(['Theme', c.theme === 'light' ? 'Light' : 'Dark']);
    L.push(['Recent errors', c.errors && c.errors.length ? c.errors.map(function (e) { return e.msg; }).join(' · ') : 'None']);
    return L;
  }
  // The words as sent: line breaks kept, other control characters out, trimmed. → { ok, body, why }
  function checkBody(s) {
    var body = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
    if (!/\S/.test(body)) return { ok: false, body: '', why: 'empty' };
    if (Array.from(body).length > MAX_BODY) return { ok: false, body: body, why: 'long' };
    return { ok: true, body: body };
  }
  // A failed send in words for the sheet (the draft is kept in every case). r: DB.sendFeedback's answer.
  function failWords(r) {
    r = r || {};
    if (r.error === 'rate_limited' || r.status === 429) return 'That’s 20 today. Your words are saved on this device: send it tomorrow.';
    if (r.error === 'network' || r.error === 'timeout' || r.status === 0) return 'No connection. Your words are saved on this device: try again when you’re back online.';
    if (r.status === 401 || r.status === 403) return 'Your session ended. Sign in again to send it: your words are saved on this device.';
    return 'It didn’t go through. Your words are saved on this device: try again in a moment.';
  }

  /* ---------------------------------------------------------------- the draft (this device, this account) */
  function ls() { try { return window.localStorage || null; } catch (e) { return null; } }
  var draft = {
    key: function (uid) { return DRAFT_KEY + (uid || 'signed-out'); },
    load: function (uid, now) {
      var s = ls(); if (!s) return null;
      try {
        var d = JSON.parse(s.getItem(draft.key(uid)) || 'null');
        if (!d || typeof d.body !== 'string' || !/\S/.test(d.body)) return null;
        if (d.at && (Number(now) || Date.now()) - d.at > DRAFT_DAYS * 864e5) { draft.clear(uid); return null; }
        return { kind: KINDS.indexOf(d.kind) >= 0 ? d.kind : 'idea', body: d.body.slice(0, MAX_BODY), include: d.include !== false, at: d.at || null };
      } catch (e) { return null; }
    },
    save: function (uid, d, now) {
      var s = ls(); if (!s) return false;
      try {
        if (!d || !/\S/.test(String(d.body || ''))) { s.removeItem(draft.key(uid)); return false; }
        s.setItem(draft.key(uid), JSON.stringify({ kind: d.kind === 'problem' ? 'problem' : 'idea', body: String(d.body).slice(0, MAX_BODY), include: d.include !== false, at: Number(now) || Date.now() }));
        return true;
      } catch (e) { return false; }
    },
    clear: function (uid) { var s = ls(); if (s) { try { s.removeItem(draft.key(uid)); } catch (e) {} } }
  };

  /* ---------------------------------------------------------------- the page (DOM) */
  function root() { return hasDom ? document.documentElement : null; }
  function isDesk() { var r = root(); return !!(r && r.classList.contains('desk')); }
  function uidNow() { try { var u = typeof getCurrentUser === 'function' ? getCurrentUser() : window._user; return u && u.id ? u.id : null; } catch (e) { return null; } }
  // The screen in words, never a name: the desk's rail item (and a Settings section's title), else the app's tab.
  function screenName() {
    if (!hasDom) return '';
    try {
      if (isDesk()) {
        var on = document.querySelector('#deskRail .dk-item.on .dk-item-label');
        var base = on ? on.textContent.trim() : '';
        var sec = document.querySelector('.dk-set-panel .dk-h1');
        if (base === 'Settings' && sec && sec.textContent.trim()) return 'Settings › ' + sec.textContent.trim();
        if (base) return base;
      }
      var t = document.querySelector('.sidebar-tab.active');
      if (t) return (t.textContent || '').trim() || t.getAttribute('data-tab') || '';
    } catch (e) {}
    return (document.title || '').replace(/\s*\|\s*POWALIFTA.*$/, '').trim();
  }
  // Where they were before this screen (a report from You is usually about another one): the last few screens, from
  // the tab and rail clicks and the desk's address changes. In memory only.
  var _trail = [];
  function noteScreen() { var n = screenName(); if (n && _trail[_trail.length - 1] !== n) { _trail.push(n); if (_trail.length > 4) _trail.shift(); } }
  function screenNow() {
    var cur = screenName(), prev = '';
    for (var i = _trail.length - 1; i >= 0; i--) if (_trail[i] !== cur) { prev = _trail[i]; break; }
    return prev ? cur + ' (from ' + prev + ')' : cur;
  }
  if (hasDom && typeof window !== 'undefined' && window.addEventListener) {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('.sidebar-tab, #deskRail .dk-item, .ca-tab, [data-tab]');
      if (t) setTimeout(noteScreen, 60);
    }, true);
    window.addEventListener('hashchange', function () { setTimeout(noteScreen, 60); });
    window.addEventListener('load', function () { setTimeout(noteScreen, 1200); });
  }
  function shellNow() {
    try { if (window.PowaNative && PowaNative.isNative && PowaNative.isNative()) return PowaNative.platform ? PowaNative.platform() : 'ios'; } catch (e) {}
    return 'web';
  }
  function envNow() {
    var r = root();
    var errs = [];
    try { errs = typeof window.__powaErrors === 'function' ? window.__powaErrors() : []; } catch (e) { errs = []; }
    return {
      screen: screenNow(),
      path: hasDom ? location.pathname : '',
      shell: shellNow(),
      ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      w: typeof innerWidth === 'number' ? innerWidth : 0, h: typeof innerHeight === 'number' ? innerHeight : 0,
      dpr: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
      theme: r ? r.getAttribute('data-theme') : null,
      desk: isDesk(), native: !!(r && r.classList.contains('native')),
      errors: Array.isArray(errs) ? errs : [], now: Date.now()
    };
  }
  // Which build this is: the iPhone app's own version when a later build offers it (Capacitor's App plugin), else the
  // stamp native/copy-web.sh writes into the app's bundle (bundle-info.json: the commit and when). The website is
  // always the live deploy: null (the report's time says which).
  var _version;
  function appVersion() {
    if (_version !== undefined) return Promise.resolve(_version);
    if (shellNow() === 'web') { _version = null; return Promise.resolve(null); }
    var within = function (p, ms) { return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(null); }, ms); })]); };
    var info = null;
    try { var App = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App; if (App && App.getInfo) info = App.getInfo(); } catch (e) { info = null; }
    return within(Promise.resolve(info).catch(function () { return null; }), 800).then(function (i) {
      if (i && i.version) return i.version + (i.build ? ' (' + i.build + ')' : '');
      // The bundle's own files are served from the app (capacitor://localhost, or localhost on Android): never ask a website.
      var local = typeof location !== 'undefined' && (location.protocol === 'capacitor:' || location.protocol === 'ionic:' || location.hostname === 'localhost');
      if (!local) return null;
      return within(fetch('bundle-info.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }), 800)
        .then(function (b) { return b && b.commit ? 'bundle ' + String(b.commit).slice(0, 12) + (b.built ? ' · ' + String(b.built).slice(0, 10) : '') : null; });
    }).then(function (v) { _version = v; return v; }, function () { _version = null; return null; });
  }

  /* ---------------------------------------------------------------- the sheet */
  var IC = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l9 16H3z"/><path d="M12 10v4.2M12 17h.01"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>'
  };
  var _seq = 0;
  function mk(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'html') n.innerHTML = v; else n.setAttribute(k, v === true ? '' : String(v));
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  var fmt = function (n) { return Number(n).toLocaleString('en-US'); };
  var reduced = function () { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };
  var fine = function () { try { return !!(window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches); } catch (e) { return false; } };

  function open(opts) {
    opts = opts || {};
    if (!hasDom || typeof uiSheet !== 'function') return null;
    var from = opts.from || document.activeElement;
    var uid = uidNow();
    var env = envNow();   // the screen under the sheet, as it is when the sheet opens
    var saved = draft.load(uid);
    var S = {
      kind: opts.kind === 'problem' || opts.kind === 'idea' ? opts.kind : (saved ? saved.kind : 'idea'),
      include: saved ? saved.include : true,
      body: saved ? saved.body : '',
      state: 'compose', restored: !!saved, sent: false
    };
    var id = 'fb' + (++_seq);
    var api = {};
    var close = uiSheet('Feedback', function (sheet, done) {
      sheet.classList.add('fb-sheet');
      sheet.setAttribute('data-state', 'compose');
      var veil = sheet.parentNode;
      var h = sheet.querySelector('.ui-sheet-h');
      if (h) { h.id = id + 'T'; h.setAttribute('tabindex', '-1'); }
      if (veil) { veil.removeAttribute('aria-label'); veil.setAttribute('aria-labelledby', id + 'T'); veil.setAttribute('aria-describedby', id + 'L'); }

      // --- compose
      var form = mk('div', { class: 'fb-form' });
      form.appendChild(mk('p', { class: 'ui-sheet-sub fb-lead', id: id + 'L', text: 'Tell us what would make POWALIFTA better, or what isn’t working.' }));
      var seg = mk('div', { class: 'ui-seg fb-seg', role: 'radiogroup', 'aria-label': 'What is it?' });
      var segBtn = {};
      KINDS.forEach(function (k) {
        var b = mk('button', { type: 'button', role: 'radio', 'data-kind': k, text: k === 'idea' ? 'Idea' : 'Problem' });
        segBtn[k] = b;
        seg.appendChild(b);
      });
      form.appendChild(seg);
      var label = mk('label', { class: 'fb-label', for: id + 'X' });
      form.appendChild(label);
      var ta = mk('textarea', { id: id + 'X', class: 'fb-text', rows: '6', maxlength: String(MAX_BODY), autocapitalize: 'sentences', spellcheck: 'true',
        'aria-describedby': id + 'C ' + id + 'H' });
      ta.value = S.body;
      form.appendChild(mk('div', { class: 'fb-field' }, [ta]));
      var hint = mk('span', { class: 'fb-hint', id: id + 'H' });
      var count = mk('span', { class: 'fb-count', id: id + 'C', 'aria-live': 'off' });
      form.appendChild(mk('div', { class: 'fb-meta' }, [hint, count]));

      // A problem: the technical details, on by default, and exactly what goes with it.
      var tech = mk('div', { class: 'ui-list fb-tech' });
      var techRow = mk('div', { class: 'ui-row fb-tech-row' });
      var techMain = mk('span', { class: 'ui-row-main' });
      techMain.appendChild(mk('span', { class: 'ui-row-title', id: id + 'IT', text: 'Include technical details' }));
      techMain.appendChild(mk('span', { class: 'ui-row-sub', id: id + 'ID', text: INCLUDES }));
      techRow.appendChild(techMain);
      var sw = typeof uiSwitch === 'function' ? uiSwitch(S.include, function (on) { S.include = on; paintPeek(); }, 'Include technical details') : null;
      if (sw) { sw.input.removeAttribute('aria-label'); sw.input.setAttribute('aria-labelledby', id + 'IT'); sw.input.setAttribute('aria-describedby', id + 'ID'); techRow.appendChild(sw); }
      tech.appendChild(techRow);
      var peekBtn = mk('button', { type: 'button', class: 'fb-peek', 'aria-expanded': 'false', 'aria-controls': id + 'P', html: '<span>See what’s sent</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' });
      var peek = mk('dl', { class: 'fb-peek-body', id: id + 'P', hidden: true });
      tech.appendChild(peekBtn);
      tech.appendChild(peek);
      form.appendChild(tech);

      var status = mk('p', { class: 'fb-status', id: id + 'S', role: 'status', 'aria-live': 'polite' });
      form.appendChild(status);
      var send = mk('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block fb-send' });
      form.appendChild(send);
      sheet.appendChild(form);

      // --- sent (and the demo's)
      var doneBox = mk('div', { class: 'fb-done', hidden: true });
      var mark = mk('span', { class: 'fb-done-mark', html: IC.check, 'aria-hidden': 'true' });
      var doneH = mk('h4', { class: 'fb-done-h', id: id + 'D', tabindex: '-1' });
      var doneP = mk('p', { class: 'fb-done-sub' });
      var doneBtn = mk('button', { type: 'button', class: 'btn btn-lg btn-block fb-close', text: 'Done' });
      doneBox.appendChild(mark); doneBox.appendChild(doneH); doneBox.appendChild(doneP); doneBox.appendChild(doneBtn);
      sheet.appendChild(doneBox);
      doneBtn.addEventListener('click', function () { done(); });

      // --- painting
      var paintKind = function () {
        KINDS.forEach(function (k) {
          var on = S.kind === k;
          segBtn[k].classList.toggle('on', on);
          segBtn[k].setAttribute('aria-checked', on ? 'true' : 'false');
          segBtn[k].tabIndex = on ? 0 : -1;
        });
        sheet.setAttribute('data-kind', S.kind);
        label.textContent = S.kind === 'problem' ? 'What happened?' : 'Your idea';
        ta.placeholder = S.kind === 'problem' ? 'What did you tap, and what happened instead?' : 'What would make your training or coaching easier?';
        tech.hidden = S.kind !== 'problem';
        paintPeek();
      };
      var paintCount = function () {
        var n = ta.value.length;
        count.textContent = fmt(n) + ' / ' + fmt(MAX_BODY);
        count.classList.toggle('is-near', n >= MAX_BODY - 200);
        count.setAttribute('aria-label', fmt(MAX_BODY - n) + ' characters left');
        hint.textContent = S.restored && ta.value ? 'Your unsent words from last time.' : '';
      };
      var ctxNow = function () { return buildContext(Object.assign({}, env, { kind: S.kind, include: S.include, version: _version })); };
      var paintPeek = function () {
        var open = peekBtn.getAttribute('aria-expanded') === 'true';
        peekBtn.hidden = S.kind !== 'problem' || !S.include;
        peek.hidden = !open || peekBtn.hidden;
        if (peek.hidden) return;
        peek.innerHTML = '';
        contextLines(ctxNow()).forEach(function (l) {
          peek.appendChild(mk('dt', { text: l[0] }));
          peek.appendChild(mk('dd', { text: l[1] }));
        });
      };
      var paintSend = function () {
        var busy = S.state === 'sending';
        send.disabled = busy;
        send.setAttribute('aria-busy', busy ? 'true' : 'false');
        send.innerHTML = busy ? '<span class="fb-spin" aria-hidden="true"></span><span>Sending…</span>'
          : '<span>' + (S.state === 'error' ? 'Try again' : 'Send') + '</span>';
        ta.readOnly = busy;
        sheet.setAttribute('data-state', S.state);
      };
      var say = function (text, tone) {
        status.innerHTML = '';
        status.className = 'fb-status' + (tone ? ' is-' + tone : '');
        if (!text) return;
        if (tone === 'error') status.appendChild(mk('span', { class: 'fb-status-ic', html: IC.warn, 'aria-hidden': 'true' }));
        status.appendChild(mk('span', { text: text }));
      };
      var keep = function () { draft.save(uid, { kind: S.kind, body: ta.value, include: S.include }); };

      // --- the done state: sent, or the demo's
      var finish = function (demo) {
        S.state = 'sent'; S.sent = true;
        draft.clear(uid);
        sheet.setAttribute('data-state', demo ? 'demo' : 'sent');
        doneH.textContent = demo ? 'In the demo, nothing is sent.' : 'Thanks. Every one is read.';
        doneP.textContent = demo ? 'In your own account, this goes straight to the founder, with the details you chose.'
          : (S.kind === 'problem' ? 'If we need more to fix it, we’ll email you.' : 'If we have a question about it, we’ll email you.');
        mark.classList.toggle('is-demo', !!demo);
        form.hidden = true;
        doneBox.hidden = false;
        if (!reduced()) { doneBox.classList.remove('is-in'); void doneBox.offsetWidth; doneBox.classList.add('is-in'); }
        setTimeout(function () { try { doneH.focus({ preventScroll: true }); } catch (e) { doneH.focus(); } }, 30);
      };

      // --- send
      var go = async function () {
        if (S.state === 'sending') return;
        var c = checkBody(ta.value);
        if (!c.ok) {
          S.state = 'compose'; paintSend();
          say(c.why === 'long' ? 'That’s over 4,000 characters.' : (S.kind === 'problem' ? 'Say what happened first.' : 'Write your idea first.'), 'error');
          ta.setAttribute('aria-invalid', 'true');
          ta.focus();
          return;
        }
        ta.removeAttribute('aria-invalid');
        if (window._demoMode) { finish(true); return; }
        S.state = 'sending'; paintSend(); say('Sending…', 'sr');
        var r;
        try {
          if (S.kind === 'problem' && S.include) await appVersion();
          var payload = { kind: S.kind, body: c.body, context: buildContext(Object.assign({}, env, { kind: S.kind, include: S.include, version: _version })) };
          r = window.DB && DB.sendFeedback ? await DB.sendFeedback(payload) : { ok: false, status: 0, error: 'network' };
        } catch (e) { r = { ok: false, status: 0, error: 'network' }; }
        if (r && r.ok) { finish(false); return; }
        keep();
        S.state = 'error'; paintSend();
        say(failWords(r), 'error');
        try { send.focus({ preventScroll: true }); } catch (e) { send.focus(); }
      };

      // --- wiring
      seg.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-kind]');
        if (!b || S.state === 'sending') return;
        S.kind = b.getAttribute('data-kind');
        if (typeof hapticTick === 'function') hapticTick();
        paintKind();
      });
      seg.addEventListener('keydown', function (e) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(e.key) < 0 || S.state === 'sending') return;
        e.preventDefault();
        S.kind = e.key === 'Home' ? 'idea' : e.key === 'End' ? 'problem' : (S.kind === 'idea' ? 'problem' : 'idea');
        paintKind();
        segBtn[S.kind].focus();
      });
      ta.addEventListener('input', function () {
        if (S.state === 'error' || status.textContent) { S.state = 'compose'; paintSend(); say(''); ta.removeAttribute('aria-invalid'); }
        paintCount();
      });
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
      peekBtn.addEventListener('click', function () {
        peekBtn.setAttribute('aria-expanded', peekBtn.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
        appVersion().then(function () { paintPeek(); });
        paintPeek();
      });
      send.addEventListener('click', go);
      // Keyboard: Tab stays inside the sheet.
      if (veil) veil.addEventListener('keydown', function (e) {
        if (e.key !== 'Tab') return;
        var f = Array.prototype.filter.call(sheet.querySelectorAll('button, textarea, input, [tabindex="0"]'), function (n) { return !n.disabled && n.offsetParent !== null && n.tabIndex >= 0; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || !sheet.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });

      paintKind(); paintCount(); paintSend();
      // Focus: the text box with a keyboard and a pointer (a laptop); the title on a touch screen, so VoiceOver starts
      // at the top and no keyboard jumps up over the sheet. After the early-tap guard (400 ms).
      setTimeout(function () {
        try {
          if (fine()) { ta.focus({ preventScroll: true }); var n = ta.value.length; ta.setSelectionRange(n, n); }
          else if (h) h.focus({ preventScroll: true });
        } catch (e) {}
      }, reduced() ? 0 : 420);
      api.sheet = sheet; api.state = function () { return S.state; }; api.send = go;
    }, { cls: 'fb-sheet-wrap', onClose: function () {
      // Closed without sending: the words wait here for next time (cleared when the box is emptied).
      if (!S.sent) { var t = api.sheet && api.sheet.querySelector('.fb-text'); if (t) draft.save(uid, { kind: S.kind, body: t.value, include: S.include }); }
      try { if (from && from.focus && document.contains(from)) from.focus({ preventScroll: true }); } catch (e) {}
    } });
    api.close = close;
    return api;
  }

  /* ---------------------------------------------------------------- entry points */
  // You's two rows (the lifter app and the coach phone): renderYouHub rows.
  function youRows() {
    return [
      { label: 'Feedback', icon: IC.send, tint: 'iris', onClick: function (row) { open({ from: row }); } },
      { label: 'Report a problem', icon: IC.flag, tint: 'orange', onClick: function (row) { open({ kind: 'problem', from: row }); } }
    ];
  }

  var api = { KINDS: KINDS, MAX_BODY: MAX_BODY, MAX_CONTEXT: MAX_CONTEXT, CONTEXT_KEYS: CONTEXT_KEYS, INCLUDES: INCLUDES,
    scrub: scrub, deviceLabel: deviceLabel, buildContext: buildContext, contextLines: contextLines, checkBody: checkBody, failWords: failWords,
    draft: draft, envNow: envNow, screenName: screenName, appVersion: appVersion, open: open, youRows: youRows, ICON: IC.send };
  if (typeof window !== 'undefined') window.PowaFeedback = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
