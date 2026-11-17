// node test/signup-confirm.test.cjs — sign-up with Supabase "Confirm email" on or off (security audit 2026-11-16 M1,
// scan blocker 1), offline: db.js runs in a vm against a stub supabase client that records every call, so nothing
// reaches Supabase. Covers where the confirmation link lands, the metadata a sign-up sends, that the invite code
// and the welcome email wait for a session (claimed and sent at the first log-in after confirming), and that they
// happen once only.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');

// Load db.js on a page at href, with a client whose auth answers as `auth` says. → { DB, calls, helpers }.
function load(href, auth) {
  auth = auth || {};
  const u = new URL(href);
  const calls = [];
  const store = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
      key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
  };
  let session = auth.session || null;
  let meta = {};
  const client = {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      async signUp(o) {
        calls.push(['signUp', o]);
        if (auth.signUpError) return { data: {}, error: auth.signUpError };
        meta = Object.assign({}, o.options.data);
        const user = { id: 'u1', email: o.email, user_metadata: meta };
        session = auth.confirm ? null : { access_token: 'AT1', user };
        return { data: { user, session }, error: null };
      },
      async signInWithPassword(o) {
        calls.push(['signIn', o]);
        if (auth.signInError) return { data: {}, error: auth.signInError };
        const user = { id: 'u1', email: o.email, user_metadata: Object.assign({}, meta) };
        session = { access_token: 'AT2', user };
        return { data: { user, session }, error: null };
      },
      async getSession() { return { data: { session }, error: null }; },
      async updateUser(o) {
        calls.push(['updateUser', o]);
        Object.keys(o.data || {}).forEach((k) => { meta[k] = o.data[k]; });
        return { data: {}, error: null };
      },
      async resend(o) { calls.push(['resend', o]); return { error: null }; }
    },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { data: auth.claimTo === undefined ? 'coach-1' : auth.claimTo, error: null }; },
    from() { return {}; }
  };
  const location = { href: u.href, origin: u.origin, protocol: u.protocol, pathname: u.pathname, search: u.search, hash: u.hash, replace() {} };
  const sandbox = {
    console: { warn() {}, error() {}, log() {} }, URL, URLSearchParams, Date, Promise, JSON, Object, String, Number, Array, RegExp, Error, Map,
    location, sessionStorage: store(), localStorage: store(),
    history: { state: null, replaceState() {} },
    document: { addEventListener() {}, visibilityState: 'visible' }, crypto: require('crypto').webcrypto,
    fetch: async (url, o) => { calls.push(['fetch', url, o]); return { ok: true, status: 200 }; },
    supabase: { createClient: () => client },
    setTimeout, clearTimeout
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC + '\n;globalThis.__H = { DB, powaSignupRedirect, powaSignupMeta, powaSignupOwed };', sandbox, { filename: 'db.js' });
  return Object.assign({ calls, meta: () => meta }, sandbox.__H);
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const named = (calls, n) => calls.filter((c) => c[0] === n);

(async () => {
  // ---- where the confirmation link lands (pure)
  const { powaSignupRedirect, powaSignupMeta, powaSignupOwed } = load('https://www.powalifta.com/');
  assert.strictEqual(powaSignupRedirect({ protocol: 'https:', origin: 'https://www.powalifta.com' }), 'https://www.powalifta.com/index.html');
  assert.strictEqual(powaSignupRedirect({ protocol: 'http:', origin: 'http://localhost:8080' }), 'http://localhost:8080/index.html', 'a local copy comes back to itself');
  assert.strictEqual(powaSignupRedirect({ protocol: 'capacitor:', origin: 'capacitor://localhost' }), 'https://www.powalifta.com/index.html?from=app', 'the iPhone app: the website, which offers the app');
  assert.strictEqual(powaSignupRedirect(null), 'https://www.powalifta.com/index.html?from=app');

  // ---- the metadata a sign-up sends (pure)
  let m = powaSignupMeta({ name: 'Ana', user_type: 'athlete', age_16_plus: true }, ' abc234 ');
  assert.strictEqual(m.name, 'Ana');
  assert.strictEqual(m.age_16_plus, true);
  assert.strictEqual(m.powa_welcome, 'athlete');
  assert.strictEqual(m.powa_invite, 'ABC234', 'the code, upper case and trimmed');
  m = powaSignupMeta({ name: 'Sam', user_type: 'coach' }, '');
  assert.strictEqual(m.powa_welcome, 'coach');
  assert.ok(!('powa_invite' in m), 'no code: no invite marker');
  assert.ok(!('powa_invite' in powaSignupMeta({ user_type: 'athlete' }, 'AB<1>')), 'a malformed code is dropped');
  assert.ok(!('powa_invite' in powaSignupMeta({ user_type: 'athlete' }, 'ABCDEFG')), 'seven characters is not a code');
  const base = { user_type: 'athlete' };
  powaSignupMeta(base, 'ABC234');
  assert.deepStrictEqual(base, { user_type: 'athlete' }, 'the caller\'s object is left alone');

  // ---- what a user still owes (pure)
  assert.strictEqual(powaSignupOwed(null), null);
  assert.strictEqual(powaSignupOwed({ user_metadata: { name: 'Old account', user_type: 'athlete' } }), null, 'an account from before: nothing');
  assert.strictEqual(powaSignupOwed({ user_metadata: { powa_welcome: null, powa_invite: null } }), null, 'cleared markers: nothing');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(powaSignupOwed({ user_metadata: { name: 'Ana', powa_welcome: 'athlete', powa_invite: 'abc234' } }))),
    { welcome: 'athlete', invite: 'ABC234', name: 'Ana' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(powaSignupOwed({ user_metadata: { powa_welcome: 'admin' } }))), null, 'only the two welcome kinds');

  // ---- Confirm email ON: a coached lifter signs up on the website. No session, so nothing is claimed or sent yet.
  let t = load('https://www.powalifta.com/index.html?code=ABC234', { confirm: true });
  let user = await t.DB.signUpAthlete('Ana', 'ana@example.com', 'longpassword', 'abc234', { age_16_plus: true });
  assert.strictEqual(user.needsConfirm, true);
  const su = named(t.calls, 'signUp')[0][1];
  assert.strictEqual(su.options.emailRedirectTo, 'https://www.powalifta.com/index.html');
  assert.strictEqual(su.options.data.powa_invite, 'ABC234', 'the invite code rides with the account');
  assert.strictEqual(su.options.data.user_type, 'athlete');
  await tick();
  assert.strictEqual(named(t.calls, 'rpc').length, 0, 'no claim without a session');
  assert.strictEqual(named(t.calls, 'fetch').length, 0, 'no welcome email before the address is confirmed');
  assert.strictEqual(named(t.calls, 'updateUser').length, 0);

  // ... they confirm, then log in: the code is claimed, the welcome goes out, both markers are cleared.
  await t.DB.signIn('ana@example.com', 'longpassword');
  await tick(); await tick();
  const rpc = named(t.calls, 'rpc');
  assert.strictEqual(rpc.length, 1);
  assert.deepStrictEqual([rpc[0][1], rpc[0][2].invite_code], ['claim_invite', 'ABC234']);
  const up = named(t.calls, 'updateUser');
  assert.strictEqual(up.length, 1);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(up[0][1].data)), { powa_welcome: null, powa_invite: null });
  let f = named(t.calls, 'fetch');
  assert.strictEqual(f.length, 1, 'one welcome email');
  assert.ok(/\/functions\/v1\/send-welcome$/.test(f[0][1]));
  assert.deepStrictEqual(JSON.parse(f[0][2].body), { email: 'ana@example.com', name: 'Ana', type: 'athlete' });
  assert.strictEqual(f[0][2].headers.Authorization, 'Bearer AT2', 'with the signed-in person\'s token');

  // ... and the next log-in does neither again.
  await t.DB.signIn('ana@example.com', 'longpassword');
  await tick(); await tick();
  assert.strictEqual(named(t.calls, 'rpc').length, 1, 'claimed once');
  assert.strictEqual(named(t.calls, 'fetch').length, 1, 'welcomed once');
  assert.strictEqual(named(t.calls, 'updateUser').length, 1, 'nothing left to clear');

  // ---- Confirm email ON, from the iPhone app: the link goes to the website with ?from=app. A coach: no claim.
  t = load('capacitor://localhost/index.html', { confirm: true });
  user = await t.DB.signUpCoach('Sam', 'sam@example.com', 'longpassword', '', {});
  assert.strictEqual(user.needsConfirm, true);
  assert.strictEqual(named(t.calls, 'signUp')[0][1].options.emailRedirectTo, 'https://www.powalifta.com/index.html?from=app');
  await t.DB.signIn('sam@example.com', 'longpassword');
  await tick(); await tick();
  assert.strictEqual(named(t.calls, 'rpc').length, 0, 'a coach claims no invite');
  f = named(t.calls, 'fetch');
  assert.strictEqual(f.length, 1);
  assert.strictEqual(JSON.parse(f[0][2].body).type, 'coach');

  // ---- Confirm email OFF (today's setting): signed straight in, so the claim and the welcome happen at sign-up.
  t = load('https://www.powalifta.com/index.html', { confirm: false });
  user = await t.DB.signUpAthlete('Kofi', 'kofi@example.com', 'longpassword', 'XYZ789', {});
  await tick(); await tick();
  assert.strictEqual(user.needsConfirm, false);
  assert.strictEqual(named(t.calls, 'rpc').length, 1);
  assert.strictEqual(named(t.calls, 'fetch').length, 1);
  assert.strictEqual(named(t.calls, 'fetch')[0][2].headers.Authorization, 'Bearer AT1');
  await t.DB.signIn('kofi@example.com', 'longpassword');
  await tick();
  assert.strictEqual(named(t.calls, 'rpc').length, 1, 'not again at the next log-in');
  assert.strictEqual(named(t.calls, 'fetch').length, 1);

  // ---- A solo lifter: no code, only the welcome.
  t = load('https://www.powalifta.com/index.html', { confirm: true });
  await t.DB.signUpAthlete('Lee', 'lee@example.com', 'longpassword', '', {});
  assert.ok(!('powa_invite' in named(t.calls, 'signUp')[0][1].options.data));
  await t.DB.signIn('lee@example.com', 'longpassword');
  await tick(); await tick();
  assert.strictEqual(named(t.calls, 'rpc').length, 0);
  assert.strictEqual(named(t.calls, 'fetch').length, 1);

  // ---- A log-in refused (not confirmed yet): the error reaches the screen, nothing else happens.
  t = load('https://www.powalifta.com/index.html', { signInError: Object.assign(new Error('Email not confirmed'), { code: 'email_not_confirmed' }) });
  await assert.rejects(() => t.DB.signIn('ana@example.com', 'x'), /Email not confirmed/);
  assert.strictEqual(named(t.calls, 'updateUser').length, 0);

  // ---- A sign-up Auth refuses throws, as before.
  t = load('https://www.powalifta.com/index.html', { signUpError: new Error('Password should be at least 8 characters.') });
  await assert.rejects(() => t.DB.signUpAthlete('A', 'a@example.com', 'short', '', {}), /at least 8/);

  // ---- Send it again: the confirmation email, back to the same landing page.
  t = load('capacitor://localhost/index.html', {});
  await t.DB.resendConfirmation('ana@example.com');
  const rs = named(t.calls, 'resend')[0][1];
  assert.deepStrictEqual([rs.type, rs.email, rs.options.emailRedirectTo], ['signup', 'ana@example.com', 'https://www.powalifta.com/index.html?from=app']);

  console.log('signup-confirm: all passed');
})().catch((e) => { console.error(e); process.exit(1); });
