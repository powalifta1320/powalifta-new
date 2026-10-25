/* =====================================================================
   POWALIFTA — Continue with Apple · Continue with Google  (social-auth.js)
   ---------------------------------------------------------------------
   One file, two ways in, one finish.

   WEBSITE (index.html's Log in / Sign up modals, filled by mount()): start(provider, from)
   remembers what the modal already knew — the role tile, a typed name, an invite code, the
   16+ tick — in sessionStorage, then DB.signInWithProvider() sends the tab to Apple or
   Google. Supabase brings it back to the page it left from with the session in the URL
   hash; handleReturn() (index.html calls it before bootstrap) reads that and hands over to
   finish(). Nothing else on the site changes: email + password, the forgot-password flow
   and reset-password.html (db.js routeRecoveryLink) run exactly as before.

   IPHONE (html.native, the native-onboard.js sheets): native(provider, state, ui) opens the
   system sheet through the Capacitor plugins — SignInWithApple, GoogleAuth — trades the
   identity token for a Supabase session (DB.signInWithIdToken) and hands over to finish().
   Apple is given the SHA-256 of a random nonce and Supabase the raw one, so a token can be
   used only by the sign-in that asked for it. Google's access token rides along so Supabase
   can check the id token's at_hash. The Google client id comes from social-sign-in.js, which
   native/scripts/inject-social-sign-in.rb writes into the app bundle from
   native/social-sign-in.json; without it the Google button says so instead of crashing.

   finish(): a returning account goes straight to its dashboard. A first-time account — no
   role on record: no user_type in its metadata, no server marker — is asked what the sign-up
   form asks (lifter on my own / with a coach / coach, a name, the 16+ tick), unless the modal
   or sheet already knew; DB.finishSocialSignup() then writes the role once, server-side
   (finish_social_signup, sql/migration-social-sign-in-2026-10-25.sql), and the account lands
   on athlete.html / coach.html like any sign-up. Apple sends the lifter's name only the first
   time: it is captured from the credential and saved with the profile.

   Pure helpers (sha256Hex, roleRoute, isFirstTime, profileFromIdentity, parseReturnHash, the
   pending state) are unit-tested in tests.html ("social sign-in"). Browser proof with the
   providers mocked: test/social-sign-in.browser.mjs. Owner setup: docs/social-sign-in-runbook.md.
   Demo mode never reaches this file (the dashboards carry no sign-in buttons) and nothing
   here writes anywhere until a button is tapped or a sign-in returns.
   ===================================================================== */
(function () {
  'use strict';

  var PENDING_KEY = 'powa-social-pending';
  var PENDING_TTL_MS = 15 * 60 * 1000;
  var PROVIDERS = { apple: 'Apple', google: 'Google' };
  var APPLE_RELAY = /@privaterelay\.appleid\.com$/i;
  var WEBSITE = 'https://www.powalifta.com/';
  var BUNDLE_ID = 'com.powalifta.app';

  // Apple's mark (their button rules: the logo beside "Continue with Apple", on black or
  // white) and Google's four-colour G (their rules: the G on a neutral button).
  var ICONS = {
    apple: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
    google: '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>'
  };

  // ------------------------------------------------------------------
  // Pure helpers (tests.html "social sign-in")
  // ------------------------------------------------------------------

  // SHA-256 (FIPS 180-4) in plain JS: the Apple nonce is hashed here, so it works without
  // crypto.subtle (not guaranteed under the WKWebView's custom scheme) and runs headless.
  function utf8Bytes(str) {
    var s = String(str == null ? '' : str), out = [];
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  var K256 = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256Hex(message) {
    var bytes = utf8Bytes(message);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;   // 64-bit length, big-endian
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      var t;
      for (t = 0; t < 16; t++) w[t] = (bytes[off + 4 * t] << 24) | (bytes[off + 4 * t + 1] << 16) | (bytes[off + 4 * t + 2] << 8) | bytes[off + 4 * t + 3];
      for (t = 16; t < 64; t++) {
        var x = w[t - 15], y = w[t - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (t = 0; t < 64; t++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K256[t] + w[t]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var hex = '';
    for (var i = 0; i < 8; i++) hex += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return hex;
  }
  function randomHex(bytes) {
    var n = bytes || 32, arr = null;
    try {
      if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') { arr = new Uint8Array(n); crypto.getRandomValues(arr); }
    } catch (e) { arr = null; }
    if (!arr) { arr = []; for (var i = 0; i < n; i++) arr.push(Math.floor(Math.random() * 256)); }
    var s = '';
    for (var j = 0; j < n; j++) s += ('0' + arr[j].toString(16)).slice(-2);
    return s;
  }
  // The raw nonce goes to Supabase, its SHA-256 to Apple (which puts it in the token).
  function makeNonce() { var raw = randomHex(32); return { raw: raw, hashed: sha256Hex(raw) }; }

  function normalizeRole(r) {
    var v = String(r == null ? '' : r).trim().toLowerCase();
    return (v === 'solo' || v === 'athlete' || v === 'coach') ? v : null;
  }
  function userTypeOf(role) { return role === 'coach' ? 'coach' : 'athlete'; }
  // Where an account lands. opts.role is the sign-up tile ('athlete' = with a coach) and
  // opts.linked whether an invite code was claimed: a coached lifter without a coach yet
  // opens on the Coach tab, like the email sign-up does.
  function roleRoute(userType, opts) {
    opts = opts || {};
    if (userType === 'coach') return 'coach.html';
    if (userType === 'admin') return 'admin.html';
    if (opts.role === 'athlete' && !opts.linked) return 'athlete.html?tab=coach';
    return 'athlete.html';
  }
  var ROLE_RE = /^(athlete|coach|admin)$/;
  // The role the account already has, if any: the email sign-up writes user_type into the
  // metadata before the account exists; finish_social_signup writes the server-side marker.
  function knownUserType(user) {
    user = user || {};
    var app = user.app_metadata || {}, meta = user.user_metadata || {};
    if (ROLE_RE.test(String(app.user_type || ''))) return app.user_type;
    if (ROLE_RE.test(String(meta.user_type || ''))) return meta.user_type;
    return null;
  }
  function isFirstTime(user) {
    user = user || {};
    var app = user.app_metadata || {};
    if (app.powa_role_chosen) return false;
    return knownUserType(user) === null;
  }
  function cleanName(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, 80); }
  // What the provider told us about the person. `extra` is the native credential (Apple
  // gives the name only once, on the device, so it must win). Never invents a name from
  // the email: a blank name is asked for.
  function profileFromIdentity(user, extra) {
    user = user || {}; extra = extra || {};
    var m = user.user_metadata || {};
    var app = user.app_metadata || {};
    var name = cleanName(extra.name) || cleanName(m.full_name) || cleanName(m.name) ||
      cleanName([m.given_name, m.family_name].filter(Boolean).join(' ')) || '';
    var email = String(extra.email || user.email || m.email || '').trim().toLowerCase();
    var avatar = String(extra.avatarUrl || m.avatar_url || m.picture || '').trim();
    return {
      provider: extra.provider || app.provider || '',
      name: name,
      email: email,
      avatarUrl: /^https:\/\//.test(avatar) ? avatar : null,
      relayEmail: APPLE_RELAY.test(email)
    };
  }
  // The URL hash Supabase comes back with: tokens (a session), an error, or a password-reset
  // link (type=recovery), which db.js routeRecoveryLink owns and this file never touches.
  function parseReturnHash(hash) {
    var h = String(hash || '').replace(/^#/, '');
    var p = new URLSearchParams(h);
    var err = p.get('error_description') || p.get('error') || '';
    return {
      tokens: !!(p.get('access_token') || p.get('refresh_token')),
      error: err ? String(err).trim() : null,
      recovery: p.get('type') === 'recovery'
    };
  }
  function encodePending(state, now) {
    return JSON.stringify(Object.assign({}, state || {}, { v: 1, at: now || Date.now() }));
  }
  function decodePending(raw, now) {
    try {
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object' || s.v !== 1) return null;
      if ((now || Date.now()) - Number(s.at || 0) > PENDING_TTL_MS) return null;
      return s;
    } catch (e) { return null; }
  }
  // Back to the page that started it, without its query or hash (the invite code travels in
  // the pending state). The app shell has no web origin Supabase would accept: the website.
  function redirectTarget(loc) {
    loc = loc || location;
    var origin = String(loc.origin || '');
    var proto = String(loc.protocol || (origin.split(':')[0] + ':'));
    if (/^https?:$/.test(proto) && /^https?:\/\//.test(origin)) return origin + (loc.pathname || '/');
    return WEBSITE;
  }
  function consentNow(now) { return { age_16_plus: true, terms_accepted_at: new Date(now || Date.now()).toISOString() }; }
  // A closed sheet is not an error: Apple reports it as AuthorizationError 1001, Google as
  // "The user canceled the sign-in flow." (code -5), Supabase's redirect as access_denied.
  function isCancel(e) {
    var m = String((e && e.message) || e || '');
    var code = e && e.code;
    return /cancel/i.test(m) || /\b1001\b/.test(m) || /access_denied/i.test(m) || code === -5 || code === '-5' || code === '1001';
  }
  function friendlyError(e) {
    var m = String((e && e.message) || e || '');
    if (isCancel(e)) return '';
    if (/nonce/i.test(m)) return 'Apple sign-in didn\'t check out. Try again.';
    if (/failed to fetch|network|load failed|timed? ?out/i.test(m)) return 'No connection. Try again when you\'re online.';
    return m;
  }

  // ------------------------------------------------------------------
  // The pending state (web only: it survives the trip to the provider)
  // ------------------------------------------------------------------
  function savePending(state) { try { sessionStorage.setItem(PENDING_KEY, encodePending(state)); } catch (e) {} }
  function loadPending() { try { return decodePending(sessionStorage.getItem(PENDING_KEY)); } catch (e) { return null; } }
  function clearPending() { try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {} }

  // ------------------------------------------------------------------
  // Small DOM / environment helpers
  // ------------------------------------------------------------------
  function isNativeShell() { return !!(document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('native')); }
  function say(msg) { if (!msg) return; if (typeof window.toast === 'function') window.toast(msg); else console.warn(msg); }
  function plugin(name) { var C = window.Capacitor; return (C && C.Plugins && C.Plugins[name]) || null; }
  function cleanHash() {
    try { if (location.hash && typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  }
  function mk(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }

  var api = {};
  // Where the account goes once it is signed in (the browser test points this elsewhere).
  api._navigate = function (url) { location.href = url; };
  function go(dest, userType) {
    try { localStorage.setItem('powa-last-role', userType === 'coach' ? 'coach' : userType === 'admin' ? 'admin' : 'athlete'); } catch (e) {}
    api._navigate(dest);
    return dest;
  }

  // ------------------------------------------------------------------
  // WEBSITE: start → (provider) → handleReturn
  // ------------------------------------------------------------------
  // What the modal already knows, so the account can be finished without asking twice.
  function collectWebState(from) {
    var state = { from: from === 'signup' ? 'signup' : 'login' };
    if (state.from !== 'signup') return state;
    var val = function (id) { var n = document.getElementById(id); return (n && typeof n.value === 'string') ? n.value.trim() : ''; };
    state.role = normalizeRole(val('signupType'));
    state.name = cleanName(val('signupName'));
    state.code = state.role === 'athlete' ? val('signupCode').toUpperCase().slice(0, 6) : '';
    var age = document.getElementById('signupAge');
    if (age && age.checked) state.consent = consentNow();
    // The same content filter the form applies (it explains itself).
    if (state.name && typeof window.checkUserText === 'function' && !window.checkUserText([state.name], { name: true })) return null;
    return state;
  }
  async function startWeb(provider, state) {
    savePending(Object.assign({ provider: provider }, state || {}));
    // supabase-js sends the tab to the provider itself. The pending state above is what
    // handleReturn() picks up when the tab comes back.
    return DB.signInWithProvider(provider, redirectTarget(location));
  }
  // index.html calls this before bootstrap. Resolves true when it took the visit over (the
  // account is on its way to a dashboard), false when there is nothing to finish: then the
  // page boots exactly as before.
  async function handleReturn(ui) {
    var pending = loadPending();
    var parsed = parseReturnHash(location.hash);
    if (parsed.recovery) return false;
    if (!pending && !parsed.tokens && !parsed.error) return false;
    if (parsed.error) {
      clearPending(); cleanHash();
      say(isCancel({ message: parsed.error }) ? 'Sign-in was cancelled.' : parsed.error);
      return false;
    }
    var session = null;
    try { session = await DB.getSession(); } catch (e) { session = null; }   // supabase-js has read the hash by now
    cleanHash();
    if (!session) {
      clearPending();
      if (pending) say('Sign-in didn\'t finish. Try again.');
      return false;
    }
    clearPending();
    try {
      var dest = await finish(session, pending || {}, ui);
      return dest !== null;
    } catch (e) {
      say(friendlyError(e) || 'Could not finish signing in. Try again.');
      return false;
    }
  }

  // ------------------------------------------------------------------
  // IPHONE: the system sheets through Capacitor
  // ------------------------------------------------------------------
  var _googleReady = false;
  function nativeGoogleConfig() {
    var c = window.POWA_SOCIAL;
    var g = c && c.google;
    return (g && g.iosClientId && !/PLACEHOLDER/i.test(g.iosClientId)) ? g : null;
  }
  // The client id for Google lives in social-sign-in.js, written into the app bundle by
  // inject-social-sign-in.rb (never into git). Loaded once, only inside the shell.
  function loadNativeConfig() {
    try {
      if (!isNativeShell() || window.POWA_SOCIAL || document.querySelector('script[data-social-config]')) return;
      var s = mk('script'); s.src = 'social-sign-in.js'; s.async = true; s.setAttribute('data-social-config', '1');
      s.onerror = function () { window.POWA_SOCIAL = window.POWA_SOCIAL || { google: null }; };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }
  async function startNative(provider) {
    if (provider === 'apple') {
      var A = plugin('SignInWithApple');
      if (!A || typeof A.authorize !== 'function') throw new Error('Sign in with Apple isn\'t in this build yet. Update the app or use email for now.');
      var nonce = makeNonce();
      var res = await A.authorize({ clientId: BUNDLE_ID, redirectURI: WEBSITE, scopes: 'email name', state: randomHex(8), nonce: nonce.hashed });
      var r = (res && res.response) || {};
      if (!r.identityToken) throw new Error('Apple didn\'t return a sign-in token. Try again.');
      var data = await DB.signInWithIdToken('apple', r.identityToken, nonce.raw);
      return {
        session: data.session,
        identity: { provider: 'apple', name: cleanName([r.givenName, r.familyName].filter(Boolean).join(' ')), email: String(r.email || '').toLowerCase() }
      };
    }
    var G = plugin('GoogleAuth');
    if (!G || typeof G.signIn !== 'function') throw new Error('Google sign-in isn\'t in this build yet. Update the app or use email for now.');
    var cfg = nativeGoogleConfig();
    if (!cfg) throw new Error('Google sign-in isn\'t set up in this build yet. Use Apple or email for now.');
    if (!_googleReady) {
      await G.initialize({ clientId: cfg.iosClientId, scopes: ['profile', 'email'], grantOfflineAccess: false });
      _googleReady = true;
    }
    var u = await G.signIn();
    var auth = (u && u.authentication) || {};
    if (!auth.idToken) throw new Error('Google didn\'t return a sign-in token. Try again.');
    var g = await DB.signInWithIdToken('google', auth.idToken, null, auth.accessToken || null);
    return {
      session: g.session,
      identity: { provider: 'google', name: cleanName(u.name || [u.givenName, u.familyName].filter(Boolean).join(' ')), email: String(u.email || '').toLowerCase(), avatarUrl: u.imageUrl || '' }
    };
  }
  // The sheets call this: the system sheet, the Supabase session, then the shared finish.
  async function native(provider, state, ui) {
    var r = await startNative(provider);
    return finish(r.session, Object.assign({}, state || {}, { provider: provider, identity: r.identity }), ui);
  }

  // ------------------------------------------------------------------
  // SHARED FINISH: returning → dashboard; first time → the sign-up choice → profile
  // ------------------------------------------------------------------
  // Resolves with the destination, or null when the person signed out instead.
  async function finish(session, state, ui) {
    state = state || {}; ui = ui || {};
    var user = session && session.user;
    if (!user) throw new Error('Sign-in didn\'t finish. Try again.');
    // 2FA step-up, as after a password: an account with an authenticator owes its code.
    if (window.DB && typeof DB.mfaAssurance === 'function') {
      var aal = await DB.mfaAssurance();
      if (aal && aal.ok && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        var passed = typeof window.promptMfaChallenge === 'function' ? await window.promptMfaChallenge() : false;
        if (!passed) { try { await DB.signOut(); } catch (e) {} throw new Error('Two-factor verification is required.'); }
      }
    }
    var ident = profileFromIdentity(user, state.identity);
    if (!isFirstTime(user)) {
      var profile = await DB.getProfileOrNull(user.id);
      if (profile) return go(roleRoute(profile.user_type), profile.user_type);
      // A role on record but no row (the sign-up trigger didn't run): make it, no questions.
      var known = knownUserType(user);
      return createAccount(user, { role: known === 'coach' ? 'coach' : 'solo', name: ident.name || ident.email.split('@')[0], code: '', consent: null }, ident);
    }
    var choice = {
      role: normalizeRole(state.role),
      name: cleanName(state.name) || ident.name,
      code: String(state.code || '').toUpperCase().slice(0, 6),
      consent: state.consent || null,
      unit: state.unit || null
    };
    if (!(choice.role && choice.name.length >= 2 && choice.consent)) {
      var ask = typeof ui.askRole === 'function' ? ui.askRole : webAskRole;
      var picked = await ask({ role: choice.role, name: choice.name, code: choice.code, consent: choice.consent, email: ident.email, provider: ident.provider || state.provider || '' });
      if (!picked) return null;
      choice = Object.assign(choice, picked);
    }
    return createAccount(user, choice, ident);
  }
  async function createAccount(user, choice, ident) {
    var userType = userTypeOf(choice.role);
    var name = cleanName(choice.name);
    await DB.finishSocialSignup(userType, name);
    var linked = false;
    if (userType === 'athlete' && choice.role === 'athlete' && choice.code) {
      try { await DB.claimInviteCode(choice.code); linked = true; }
      catch (e) { say('That invite code didn\'t work. You can connect to your coach from the Coach tab.'); }
    }
    // The role, and the 16+ confirmation when it was given now, in the account's own
    // metadata: where the email sign-up keeps them.
    try { await DB.setUserMetadata(Object.assign({ user_type: userType }, choice.consent || {})); } catch (e) {}
    try { if (choice.unit === 'lbs' || choice.unit === 'kg') localStorage.setItem('powa-unit', choice.unit); } catch (e) {}
    // The welcome email, like the form sends. Not to Apple's private relay: it forwards only
    // senders registered with Apple (runbook, Apple step 5).
    if (typeof window.sendWelcomeEmail === 'function' && ident.email && !ident.relayEmail) {
      try { window.sendWelcomeEmail(ident.email, name, userType); } catch (e) {}
    }
    return go(roleRoute(userType, { role: choice.role, linked: linked }), userType);
  }

  // ------------------------------------------------------------------
  // WEBSITE: "Finish setting up" — the sign-up form's choice, after the provider
  // ------------------------------------------------------------------
  function input(type, placeholder, autocomplete) {
    var i = mk('input'); i.type = type; i.placeholder = placeholder || ''; if (autocomplete) i.setAttribute('autocomplete', autocomplete); return i;
  }
  function group(label, control) {
    var g = mk('div', 'form-group'); var l = mk('label'); l.textContent = label; g.appendChild(l); g.appendChild(control); return g;
  }
  function webAskRole(prefill) {
    prefill = prefill || {};
    return new Promise(function (resolve) {
      var old = document.getElementById('socialFinishModal'); if (old) old.remove();
      var back = mk('div', 'modal-backdrop'); back.id = 'socialFinishModal';
      var modal = mk('div', 'modal'); back.appendChild(modal);
      var h3 = mk('h3'); h3.textContent = 'Finish setting up'; modal.appendChild(h3);
      var hello = mk('p', 'dim text-sm mb-16');
      hello.textContent = (prefill.provider ? 'Signed in with ' + (PROVIDERS[prefill.provider] || prefill.provider) : 'Signed in') +
        (prefill.email ? ' as ' + prefill.email : '') + '. One more thing: how will you use POWALIFTA?';
      modal.appendChild(hello);
      var st = { role: normalizeRole(prefill.role) };
      var seg = mk('div', 'auth-seg auth-seg-3'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'I am a');
      var codeGroup;
      [['solo', 'Lifter', 'On my own'], ['athlete', 'Lifter', 'With a coach'], ['coach', 'Coach', 'I train people']].forEach(function (o) {
        var b = mk('button', st.role === o[0] ? 'on' : ''); b.type = 'button';
        b.setAttribute('data-v', o[0]); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', st.role === o[0] ? 'true' : 'false');
        var bb = mk('b'); bb.textContent = o[1]; var sp = mk('span'); sp.textContent = o[2]; b.appendChild(bb); b.appendChild(sp);
        b.addEventListener('click', function () {
          st.role = o[0];
          Array.prototype.forEach.call(seg.children, function (c) { var on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
          codeGroup.style.display = st.role === 'athlete' ? '' : 'none';
          err.textContent = '';
        });
        seg.appendChild(b);
      });
      modal.appendChild(seg);
      var name = input('text', 'Jane Doe', 'name'); name.id = 'sfName'; name.setAttribute('autocapitalize', 'words'); name.value = prefill.name || '';
      modal.appendChild(group('Full name', name));
      var code = input('text', '6-char code from your coach', 'off'); code.id = 'sfCode'; code.maxLength = 6; code.style.textTransform = 'uppercase'; code.value = prefill.code || '';
      codeGroup = group('Invite code (optional)', code); codeGroup.id = 'sfCodeGroup'; codeGroup.style.display = st.role === 'athlete' ? '' : 'none';
      modal.appendChild(codeGroup);
      var age = null;
      if (!prefill.consent) {
        var lab = mk('label', 'age-check'); lab.setAttribute('for', 'sfAge');
        age = mk('input'); age.type = 'checkbox'; age.id = 'sfAge';
        var txt = mk('span');
        txt.innerHTML = 'I\'m 16 or older and I agree to the <a href="terms.html" target="_blank" rel="noopener">Terms</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.';
        lab.appendChild(age); lab.appendChild(txt); modal.appendChild(lab);
      }
      var err = mk('div', 'text-xs'); err.id = 'sfErr'; err.setAttribute('role', 'alert'); err.style.cssText = 'color:var(--brand-red);min-height:16px;margin-bottom:8px'; modal.appendChild(err);
      var btn = mk('button', 'btn btn-primary btn-lg btn-block'); btn.type = 'button'; btn.id = 'sfGo'; btn.textContent = 'Continue'; modal.appendChild(btn);
      var fine = mk('p', 'dim text-sm center'); fine.style.marginTop = '14px';
      var out = mk('a'); out.href = '#'; out.id = 'sfOut'; out.textContent = 'Sign out';
      fine.appendChild(document.createTextNode('Not you? ')); fine.appendChild(out); modal.appendChild(fine);
      document.body.appendChild(back);
      void back.offsetWidth; back.classList.add('open');
      setTimeout(function () { try { (st.role ? name : seg.firstChild).focus({ preventScroll: true }); } catch (e) {} }, 60);
      function done(v) { back.classList.remove('open'); setTimeout(function () { back.remove(); }, 250); resolve(v); }
      btn.addEventListener('click', function () {
        var nm = cleanName(name.value);
        if (!st.role) { err.textContent = 'Pick how you\'ll use POWALIFTA.'; return; }
        if (nm.length < 2) { err.textContent = 'Add your name to keep going.'; name.focus(); return; }
        if (typeof window.checkUserText === 'function' && !window.checkUserText([nm], { name: true })) return;
        if (age && !age.checked) { err.textContent = 'Please confirm you\'re 16 or older.'; return; }
        done({ role: st.role, name: nm, code: st.role === 'athlete' ? code.value.trim().toUpperCase().slice(0, 6) : '', consent: prefill.consent || consentNow() });
      });
      name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); btn.click(); } });
      out.addEventListener('click', async function (e) {
        e.preventDefault();
        try { await DB.signOut(); } catch (x) {}
        clearPending();
        done(null);
      });
    });
  }

  // ------------------------------------------------------------------
  // The two buttons (website modals via mount(); the native sheets build their own row)
  // ------------------------------------------------------------------
  function buttonRow(opts) {
    opts = opts || {};
    var row = opts.into || mk('div', 'sa-row');
    ['apple', 'google'].forEach(function (p) {
      var b = mk('button', 'sa-btn sa-' + p); b.type = 'button'; b.setAttribute('data-provider', p);
      b.innerHTML = ICONS[p] + '<span>Continue with ' + PROVIDERS[p] + '</span>';
      b.addEventListener('click', function () { if (typeof opts.onPick === 'function') opts.onPick(p, b, row); });
      row.appendChild(b);
    });
    return row;
  }
  function setBusy(row, on, provider) {
    if (!row || !row.querySelectorAll) return;
    Array.prototype.forEach.call(row.querySelectorAll('.sa-btn'), function (b) {
      b.disabled = !!on;
      var span = b.querySelector('span'); if (!span) return;
      var p = b.getAttribute('data-provider');
      span.textContent = (on && p === provider) ? 'Opening ' + PROVIDERS[p] + '…' : 'Continue with ' + PROVIDERS[p];
    });
  }
  // A modal button was tapped. `from` is 'login' or 'signup' (what the modal knows).
  function start(provider, from, row) {
    provider = provider === 'apple' ? 'apple' : 'google';
    var state = collectWebState(from);
    if (!state) return;
    setBusy(row, true, provider);
    var run = isNativeShell() ? native(provider, state, null) : startWeb(provider, state);
    run.then(function (dest) { if (!dest) setBusy(row, false); })
      .catch(function (e) { setBusy(row, false); say(friendlyError(e) || 'Could not start the sign-in. Try again.'); });
  }
  function mount() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-social-buttons]'), function (box) {
      if (box.childElementCount) return;
      var from = box.getAttribute('data-social-buttons') || 'login';
      buttonRow({ into: box, onPick: function (p, b, row) { start(p, from, row); } });
    });
  }

  window.SocialAuth = Object.assign(api, {
    // pure
    sha256Hex: sha256Hex, utf8Bytes: utf8Bytes, randomHex: randomHex, makeNonce: makeNonce,
    normalizeRole: normalizeRole, userTypeOf: userTypeOf, roleRoute: roleRoute, knownUserType: knownUserType, isFirstTime: isFirstTime,
    cleanName: cleanName, profileFromIdentity: profileFromIdentity, parseReturnHash: parseReturnHash,
    encodePending: encodePending, decodePending: decodePending, redirectTarget: redirectTarget, consentNow: consentNow,
    isCancel: isCancel, friendlyError: friendlyError,
    // state
    savePending: savePending, loadPending: loadPending, clearPending: clearPending,
    // flows
    start: start, startWeb: startWeb, handleReturn: handleReturn, startNative: startNative, native: native, finish: finish,
    // ui
    buttonRow: buttonRow, setBusy: setBusy, mount: mount, webAskRole: webAskRole,
    ICONS: ICONS, PROVIDERS: PROVIDERS, PENDING_KEY: PENDING_KEY, PENDING_TTL_MS: PENDING_TTL_MS
  });
  loadNativeConfig();
})();
