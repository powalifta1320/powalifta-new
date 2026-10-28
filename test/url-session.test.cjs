// node test/url-session.test.cjs — which sessions in a URL db.js lets supabase-js take (login CSRF,
// security sweep 2026-10-28 #9 and #12), offline: db.js runs in a vm against a stub createClient, so
// nothing reaches Supabase. Covers the pure verdict, the address it cleans, and what happens on load
// (the tokens leave the address, the client's detectSessionInUrl says no) for each page a link lands on.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
const NOW = 1761650000000;
const TOK = 'access_token=AT.x.y&expires_at=' + (NOW / 1000 + 3600) + '&expires_in=3600&refresh_token=RTSECRET&token_type=bearer';
const fresh = JSON.stringify({ v: 1, at: NOW - 60000, provider: 'google', from: 'login' });

// Load db.js as a page would: href, sessionStorage + localStorage contents. → what it did.
function load(href, opts) {
  opts = opts || {};
  const u = new URL(href);
  const out = { replaced: null, forwarded: null, opts: null };
  const store = (init) => {
    const m = new Map(Object.entries(init || {}));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  };
  const location = { href: u.href, origin: u.origin, pathname: u.pathname, search: u.search, hash: u.hash,
    replace: (x) => { out.forwarded = x; } };
  const sandbox = {
    console: { warn() {}, error() {}, log() {} }, URL, URLSearchParams, Date: { now: () => NOW },
    location, sessionStorage: store(opts.session), localStorage: store(opts.local),
    history: { state: null, replaceState: (s, t, x) => { out.replaced = x; } },
    document: { addEventListener() {}, visibilityState: 'visible' }, crypto: require('crypto').webcrypto,
    supabase: { createClient: (url, key, o) => { out.opts = o; return { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from() {}, rpc() {} }; } }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC + '\n;globalThis.__V = powaUrlSessionVerdict; globalThis.__W = powaUrlWithoutSession;', sandbox, { filename: 'db.js' });
  out.verdict = sandbox.__V; out.without = sandbox.__W;
  // What supabase-js would ask once it starts (it reads the URL as it is then, hash and query merged).
  out.detect = (atHref) => {
    const v = new URL(atHref || (out.replaced ? u.origin + out.replaced : u.href));
    const params = {};
    new URLSearchParams(v.hash.replace(/^#/, '')).forEach((x, k) => { params[k] = x; });
    v.searchParams.forEach((x, k) => { params[k] = x; });
    return out.opts.auth.detectSessionInUrl(v, params);
  };
  out.confirmed = !!sandbox._powaEmailConfirmed;
  return out;
}

// ---- the verdict (pure)
const { verdict, without } = load('https://www.powalifta.com/');
const P = (s) => Object.fromEntries(new URLSearchParams(s));
assert.strictEqual(verdict({ params: {}, path: '/index.html', now: NOW }), 'none');
assert.strictEqual(verdict({ params: P('error=access_denied&error_description=x'), path: '/index.html', now: NOW }), 'none');
assert.strictEqual(verdict({ params: P(TOK), path: '/athlete.html', now: NOW }), 'refuse', 'a link with someone\'s session');
assert.strictEqual(verdict({ params: P('refresh_token=R'), path: '/athlete.html', now: NOW }), 'refuse', 'a refresh token alone');
assert.strictEqual(verdict({ params: P(TOK), path: '/', pending: fresh, now: NOW }), 'adopt', 'this tab\'s own Google sign-in');
assert.strictEqual(verdict({ params: P(TOK), path: '/', pending: JSON.parse(fresh), now: NOW }), 'adopt');
assert.strictEqual(verdict({ params: P(TOK), path: '/', pending: JSON.stringify({ v: 1, at: NOW - 40 * 60000 }), now: NOW }), 'adopt', 'a slow sign-in (40 minutes at Apple) still comes in');
assert.strictEqual(verdict({ params: P(TOK), path: '/', pending: JSON.stringify({ v: 1, at: NOW - 61 * 60000 }), now: NOW }), 'refuse', 'a pending sign-in older than an hour');
assert.strictEqual(verdict({ params: P(TOK), path: '/', pending: JSON.stringify({ v: 2, at: NOW }), now: NOW }), 'refuse');
assert.strictEqual(verdict({ params: P(TOK), path: '/', pending: 'not json', now: NOW }), 'refuse');
assert.strictEqual(verdict({ params: P(TOK + '&type=signup'), path: '/', now: NOW }), 'refuse', 'an email confirmation');
assert.strictEqual(verdict({ params: P(TOK + '&type=recovery'), path: '/reset-password.html', now: NOW }), 'recovery');
assert.strictEqual(verdict({ params: P(TOK + '&type=recovery'), path: '/index.html', pending: fresh, now: NOW }), 'forward', 'a reset link is never this client\'s');

// ---- the cleaned address
assert.strictEqual(without('https://www.powalifta.com/athlete.html#' + TOK), '/athlete.html');
assert.strictEqual(without('https://www.powalifta.com/athlete.html?tab=club&access_token=A&refresh_token=R#' + TOK + '&type=signup'), '/athlete.html?tab=club');
assert.strictEqual(without('https://www.powalifta.com/coach.html#athlete=abc'), '/coach.html#athlete=abc', 'no session: untouched');
assert.strictEqual(without('https://www.powalifta.com/?ref=AB12CD#' + TOK + '&provider_token=PT'), '/?ref=AB12CD');

// ---- on load, page by page
let r = load('https://www.powalifta.com/athlete.html#' + TOK, { local: { 'sb-cxnotrikxvzncupswvio-auth-token': '{"user":{"id":"victim"}}' } });
assert.strictEqual(r.replaced, '/athlete.html', 'the tokens leave the address at once');
assert.strictEqual(r.detect(), false, 'and the client never takes them');
assert.strictEqual(r.detect('https://www.powalifta.com/athlete.html#' + TOK), false, 'even if it read the address first');
assert.strictEqual(r.forwarded, null);

r = load('https://www.powalifta.com/athlete.html?' + TOK);
assert.strictEqual(r.replaced, '/athlete.html', 'the query string too');

r = load('https://www.powalifta.com/#' + TOK + '&provider_token=PT', { session: { 'powa-social-pending': fresh } });
assert.strictEqual(r.replaced, null, 'a sign-in this tab started: the address is left for supabase-js');
assert.strictEqual(r.detect(), true, 'and it takes the session');
const ans = r.opts.auth.detectSessionInUrl(new URL('https://www.powalifta.com/#' + TOK), P(TOK));
assert.strictEqual(typeof ans, 'boolean', 'answers at once (2.110 calls it without await)');

r = load('https://www.powalifta.com/#' + TOK + '&type=signup');
assert.strictEqual(r.replaced, '/#login', 'an email confirmation, signed out: the log-in opens');
assert.strictEqual(r.confirmed, true);
r = load('https://www.powalifta.com/#' + TOK + '&type=signup', { local: { 'sb-cxnotrikxvzncupswvio-auth-token': '{}' } });
assert.strictEqual(r.replaced, '/', 'signed in as someone: nothing replaces them, no log-in sheet');
assert.strictEqual(r.confirmed, false);

r = load('https://www.powalifta.com/reset-password.html#' + TOK + '&type=recovery');
assert.strictEqual(r.replaced, null, 'the reset page keeps its link (its own client reads it)');
assert.strictEqual(r.detect(), false, 'the site\'s client never takes a reset session');

r = load('https://www.powalifta.com/index.html#' + TOK + '&type=recovery', { session: { 'powa-social-pending': fresh } });
assert.strictEqual(r.forwarded, '/reset-password.html#' + TOK + '&type=recovery', 'a stray reset link still goes to the reset page');
assert.strictEqual(r.replaced, null);
assert.strictEqual(r.detect(), false, 'and is not taken on the way');

r = load('https://www.powalifta.com/athlete.html?' + TOK + '&type=recovery');
assert.strictEqual(r.forwarded, null, 'a reset session in the query string is not a real link: nothing forwards it');
assert.strictEqual(r.replaced, '/athlete.html', 'so it leaves the address too');
assert.strictEqual(r.detect(), false);

r = load('https://www.powalifta.com/#error=access_denied&error_code=403&error_description=Cancelled');
assert.strictEqual(r.replaced, null);
assert.strictEqual(r.detect(), true, 'a provider\'s error still reaches supabase-js as before');

r = load('https://www.powalifta.com/coach.html#athlete=abc');
assert.strictEqual(r.replaced, null);
assert.strictEqual(r.detect(), false, 'an ordinary address: nothing to take');

console.log('url-session: all passed');
