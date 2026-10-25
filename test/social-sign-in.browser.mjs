#!/usr/bin/env node
/*
 * Continue with Apple / Google — browser proof (Playwright; nothing leaves this machine).
 *
 * Serves the repo (or uses BASE=…), then, with Supabase and both providers refused at the network
 * layer and the sign-in calls mocked inside the page:
 *   - screenshots the Log in and Sign up modals with the two buttons (390×844 @3x and 1440×775,
 *     dark and light) and the "Finish setting up" step a first-time account gets
 *   - checks the web start: what the modal knew is kept for the return, the redirect goes back to
 *     this page, Google is asked for its account picker
 *   - plays the web return four ways: a first-time account from Log in (asks, then coach.html),
 *     a sign-up that already answered (straight to athlete.html, the code claimed), a returning
 *     account (straight in), and a cancelled / unreachable one (a toast, the page boots as usual)
 *   - plays the iPhone sheets with a fake Capacitor: Apple from Log in (the role step appears and
 *     the nonce Apple got is the SHA-256 of the one Supabase got), Google from Sign up (no extra
 *     questions), and the 16+ tick guarding both
 * Needs playwright-core and a Chromium (CHROME_PATH=… points at a headless shell). Screenshots go
 * to scratchpad-shots/ (gitignored) or the folder given as the first argument.
 *     node test/social-sign-in.browser.mjs [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch (e) { console.log('social-sign-in.browser: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(0); }

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'scratchpad-shots'));
fs.mkdirSync(OUT, { recursive: true });

let BASE = process.env.BASE, server = null;
if (!BASE) {
  const port = await new Promise((res) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  BASE = `http://127.0.0.1:${port}/`;
  // Wait for the port to answer (a TCP connect; Node's fetch trips over http.server's connection close).
  for (let i = 0; i < 60; i++) {
    const up = await new Promise((res) => { const c = net.createConnection({ host: '127.0.0.1', port }, () => { c.end(); res(true); }); c.on('error', () => res(false)); });
    if (up) break;
    await new Promise(r => setTimeout(r, 100));
  }
}
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
let fails = 0;
const shots = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const shot = async (page, name) => { const p = path.join(OUT, name + '.png'); await page.screenshot({ path: p }); shots.push(p); };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const SIZES = [[390, 844, 3, '390'], [1440, 775, 1, '1440']];
const THEMES = ['dark', 'light'];

async function open({ w, h, scale, theme, native }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, deviceScaleFactor: scale, isMobile: w < 600, hasTouch: w < 600, serviceWorkers: 'block',
    userAgent: w < 600 ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' : undefined,
  });
  // Nothing reaches Supabase, Apple or Google (fonts are allowed so the screenshots are honest).
  await ctx.route(/supabase\.co|appleid\.apple\.com|accounts\.google\.com|oauth2\.googleapis\.com|plausible\.io/, (r) => r.abort());
  await ctx.addInitScript(({ theme, native }) => {
    try { localStorage.setItem('powa-consent', 'essential'); localStorage.setItem('powa-theme', theme); } catch (e) {}
    if (native) {
      // A fake Capacitor: the two sign-in plugins answer like the real ones; every other plugin is a quiet no-op.
      const noop = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? undefined : noop), apply: () => Promise.resolve({}) });
      const real = {
        SignInWithApple: { authorize: async (o) => { window.__appleReq = o; return { response: { user: '001.fake', email: 'k4xq7m2tz@privaterelay.appleid.com', givenName: 'Jane', familyName: 'Doe', identityToken: 'fake.apple.token', authorizationCode: 'fake' } }; } },
        GoogleAuth: { initialize: async (o) => { window.__gInit = o; }, signIn: async () => ({ id: '1', email: 'jane@gmail.com', name: 'Jane Doe', givenName: 'Jane', familyName: 'Doe', imageUrl: 'https://lh3.googleusercontent.com/a', authentication: { accessToken: 'fake-access', idToken: 'fake.google.token' } }) },
      };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: new Proxy(real, { get: (t, k) => (k in t ? t[k] : noop) }) };
      window.POWA_SOCIAL = { google: { iosClientId: 'test-ios.apps.googleusercontent.com', webClientId: 'test-web.apps.googleusercontent.com' } };
    }
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}';
      document.head.appendChild(st);
    });
  }, { theme, native: !!native });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  if (native) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, topMax: 59, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } }).catch(() => {});
  }
  return { ctx, page };
}
// The data layer, mocked in the page: a session for `user`, a profile row (or none), and recorders.
const mockDb = (user, profileRow) => `
  window.__calls = {};
  DB.getSession = async () => ({ user: ${JSON.stringify(user)}, access_token: 'fake' });
  DB.mfaAssurance = async () => ({ ok: true, currentLevel: 'aal1', nextLevel: 'aal1' });
  DB.getProfileOrNull = async () => (${JSON.stringify(profileRow || null)});
  DB.finishSocialSignup = async (t, n) => { window.__calls.finish = { t, n }; return { ok: true, user_type: t }; };
  DB.setUserMetadata = async (d) => { window.__calls.meta = d; };
  DB.claimInviteCode = async (c) => { window.__calls.code = c; return 'coach-1'; };
  DB.signOut = async () => { window.__calls.signOut = true; };
  DB.signInWithIdToken = async (p, t, n, a) => { window.__idt = { p, t, n, a }; return { session: { user: ${JSON.stringify(user)} }, user: ${JSON.stringify(user)} }; };
  window.sendWelcomeEmail = (e, n, t) => { window.__calls.welcome = { e, n, t }; };
  SocialAuth._navigate = (u) => { window.__dest = u; };
`;
const googleUser = { id: 'u-google', email: 'jane@gmail.com', user_metadata: { name: 'Jane Doe', full_name: 'Jane Doe', picture: 'https://lh3.googleusercontent.com/a' }, app_metadata: { provider: 'google', providers: ['google'] } };
const appleUser = { id: 'u-apple', email: 'k4xq7m2tz@privaterelay.appleid.com', user_metadata: {}, app_metadata: { provider: 'apple', providers: ['apple'] } };
const returningUser = { id: 'u-old', email: 'old@example.com', user_metadata: { name: 'Old Lifter', user_type: 'athlete' }, app_metadata: { provider: 'email', providers: ['email', 'google'] } };

// ------------------------------------------------------------------ 1. the website modals
for (const [w, h, scale, sz] of SIZES) {
  for (const theme of THEMES) {
    const { ctx, page } = await open({ w, h, scale, theme });
    await page.goto(BASE + 'index.html#login', { waitUntil: 'load' });
    await wait(1200);
    ok(await page.locator('#loginModal .sa-btn').count() === 2, `web ${sz} ${theme}: Log in has the two buttons`);
    ok(await page.locator('#loginModal .sa-apple').evaluate(b => /Continue with Apple/.test(b.textContent) && !!b.querySelector('svg')), `web ${sz} ${theme}: Apple button carries the mark and the words`);
    await shot(page, `web-login-${sz}-${theme}`);
    await page.evaluate(() => { closeModal('loginModal'); openSignupModal('solo'); });
    await wait(400);
    ok(await page.locator('#signupModal .sa-btn').count() === 2, `web ${sz} ${theme}: Sign up has the two buttons`);
    await shot(page, `web-signup-${sz}-${theme}`);
    // The "Finish setting up" step a first-time account sees when it comes back from Google.
    await page.evaluate(() => closeModal('signupModal'));
    await page.evaluate(mockDb(googleUser, null));
    await page.evaluate(() => { sessionStorage.setItem(SocialAuth.PENDING_KEY, SocialAuth.encodePending({ provider: 'google', from: 'login' })); window.__handled = SocialAuth.handleReturn(); });
    await page.waitForSelector('#socialFinishModal.open', { timeout: 5000 });
    await wait(300);
    await shot(page, `web-finish-${sz}-${theme}`);
    if (sz === '390' && theme === 'dark') {
      ok(await page.inputValue('#sfName') === 'Jane Doe', 'web return (first time): the name comes pre-filled from Google');
      ok(await page.locator('#sfAge').count() === 1, 'web return (first time): the 16+ tick is asked because the form never was');
      await page.click('#sfGo');
      ok(/Pick how/.test(await page.textContent('#sfErr')), 'web return (first time): Continue without a tile explains');
      await page.click('#socialFinishModal [data-v="coach"]');
      await page.click('#sfGo');
      ok(/16 or older/.test(await page.textContent('#sfErr')), 'web return (first time): Continue without the tick explains');
      await page.check('#sfAge');
      await page.click('#sfGo');
      const handled = await page.evaluate(() => window.__handled);
      const r = await page.evaluate(() => ({ calls: window.__calls, dest: window.__dest, role: localStorage.getItem('powa-last-role') }));
      ok(handled === true, 'web return (first time): handleReturn took the visit over');
      ok(r.calls.finish && r.calls.finish.t === 'coach' && r.calls.finish.n === 'Jane Doe', 'web return (first time): finish_social_signup(coach, Jane Doe)');
      ok(r.dest === 'coach.html' && r.role === 'coach', 'web return (first time): lands on coach.html, role remembered for the app shell');
      ok(r.calls.meta && r.calls.meta.user_type === 'coach' && r.calls.meta.age_16_plus === true && /^\d{4}-/.test(r.calls.meta.terms_accepted_at), 'web return (first time): role + 16+ consent written to the account metadata');
      ok(r.calls.welcome && r.calls.welcome.e === 'jane@gmail.com' && r.calls.welcome.t === 'coach', 'web return (first time): welcome email sent');
      ok(!await page.locator('#socialFinishModal.open').count(), 'web return (first time): the modal closed');
    }
    ok(page.errors.length === 0, `web ${sz} ${theme}: no page errors` + (page.errors.length ? ' — ' + page.errors.join(' | ') : ''));
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 2. the web start (mocked OAuth call)
{
  const { ctx, page } = await open({ w: 390, h: 844, scale: 3, theme: 'dark' });
  await page.goto(BASE + 'index.html', { waitUntil: 'load' });
  await wait(800);
  await page.evaluate(() => { sb.auth.signInWithOAuth = async (o) => { window.__oauth = o; return { data: { provider: o.provider, url: 'https://mock.invalid/authorize' }, error: null }; }; });
  await page.evaluate(() => openSignupModal('coach'));
  await page.fill('#signupName', 'Jane Doe');
  await page.check('#signupAge');
  await page.click('#signupModal .sa-google');
  await wait(300);
  const s = await page.evaluate(() => ({ o: window.__oauth, pending: JSON.parse(sessionStorage.getItem(SocialAuth.PENDING_KEY)), label: document.querySelector('#signupModal .sa-google span').textContent, disabled: document.querySelector('#signupModal .sa-apple').disabled }));
  ok(s.o && s.o.provider === 'google', 'web start: signInWithOAuth called for google');
  ok(s.o.options.redirectTo === BASE + 'index.html', 'web start: redirects back to this page (no query, no hash): ' + s.o.options.redirectTo);
  ok(s.o.options.queryParams && s.o.options.queryParams.prompt === 'select_account', 'web start: Google asked for its account picker');
  ok(s.pending.provider === 'google' && s.pending.from === 'signup' && s.pending.role === 'coach' && s.pending.name === 'Jane Doe' && s.pending.consent && s.pending.consent.age_16_plus === true, 'web start: the tile, name and 16+ tick travel with the sign-in');
  ok(/Opening Google/.test(s.label) && s.disabled === true, 'web start: the row shows "Opening Google…" and is disabled while the tab leaves');
  await page.evaluate(() => { closeModal('signupModal'); openLoginModal(); });
  await page.click('#loginModal .sa-apple');
  await wait(200);
  const a = await page.evaluate(() => ({ o: window.__oauth, pending: JSON.parse(sessionStorage.getItem(SocialAuth.PENDING_KEY)) }));
  ok(a.o.provider === 'apple' && a.pending.from === 'login' && !a.pending.role, 'web start: Apple from Log in carries no role (asked on return)');
  ok(page.errors.length === 0, 'web start: no page errors');
  await ctx.close();
}

// ------------------------------------------------------------------ 3. the web return: sign-up that already answered, returning account
{
  const { ctx, page } = await open({ w: 390, h: 844, scale: 3, theme: 'dark' });
  await page.goto(BASE + 'index.html', { waitUntil: 'load' });
  await wait(800);
  await page.evaluate(mockDb(appleUser, null));
  await page.evaluate(() => {
    sessionStorage.setItem(SocialAuth.PENDING_KEY, SocialAuth.encodePending({ provider: 'apple', from: 'signup', role: 'athlete', name: 'Sam Lee', code: 'ABC123', consent: { age_16_plus: true, terms_accepted_at: '2026-10-25T10:00:00.000Z' } }));
    window.__handled = SocialAuth.handleReturn();
  });
  await wait(600);
  const r = await page.evaluate(async () => ({ handled: await window.__handled, calls: window.__calls, dest: window.__dest, modal: !!document.querySelector('#socialFinishModal') }));
  ok(r.handled === true && r.modal === false, 'web return (sign-up knew everything): no questions asked');
  ok(r.calls.finish && r.calls.finish.t === 'athlete' && r.calls.finish.n === 'Sam Lee', 'web return (sign-up): finish_social_signup(athlete, Sam Lee)');
  ok(r.calls.code === 'ABC123' && r.dest === 'athlete.html', 'web return (sign-up): the invite code was claimed, lands on athlete.html');
  ok(!r.calls.welcome, 'web return (sign-up): no welcome email to an Apple private-relay address');

  await page.evaluate(mockDb(returningUser, { id: 'u-old', user_type: 'athlete', name: 'Old Lifter' }));
  await page.evaluate(() => { window.__dest = null; sessionStorage.setItem(SocialAuth.PENDING_KEY, SocialAuth.encodePending({ provider: 'google', from: 'login' })); window.__handled = SocialAuth.handleReturn(); });
  await wait(400);
  const r2 = await page.evaluate(async () => ({ handled: await window.__handled, calls: window.__calls, dest: window.__dest, modal: !!document.querySelector('#socialFinishModal') }));
  ok(r2.handled === true && r2.dest === 'athlete.html' && !r2.calls.finish && r2.modal === false, 'web return (returning account): straight to athlete.html, nothing created, nothing asked');

  // "Not you? Sign out" hands the page back to the normal boot.
  await page.evaluate(mockDb(googleUser, null));
  await page.evaluate(() => { window.__dest = null; sessionStorage.setItem(SocialAuth.PENDING_KEY, SocialAuth.encodePending({ provider: 'google', from: 'login' })); window.__handled = SocialAuth.handleReturn(); });
  await page.waitForSelector('#socialFinishModal.open', { timeout: 5000 });
  await page.click('#sfOut');
  await wait(400);
  const r3 = await page.evaluate(async () => ({ handled: await window.__handled, calls: window.__calls, dest: window.__dest, pending: sessionStorage.getItem(SocialAuth.PENDING_KEY) }));
  ok(r3.handled === false && r3.calls.signOut === true && !r3.dest && r3.pending === null, 'web return: "Not you? Sign out" signs out and lets the page boot normally');
  ok(page.errors.length === 0, 'web return: no page errors');
  await ctx.close();
}

// ------------------------------------------------------------------ 4. the web return when the provider said no / Supabase is unreachable
{
  const { ctx, page } = await open({ w: 1440, h: 775, scale: 1, theme: 'dark' });
  await page.addInitScript(() => { try { sessionStorage.setItem('powa-social-pending', JSON.stringify({ v: 1, at: Date.now(), provider: 'google', from: 'login' })); } catch (e) {} });
  await page.goto(BASE + 'index.html#error=access_denied&error_code=user_cancelled&error_description=The+user+denied+access', { waitUntil: 'load' });
  await wait(1500);
  const e1 = await page.evaluate(() => ({ toast: (document.querySelector('.toast') || {}).textContent || '', hash: location.hash, pending: sessionStorage.getItem('powa-social-pending'), nav: !!document.querySelector('#nav .brand, #nav a, #nav button') }));
  ok(/cancelled/i.test(e1.toast), 'web return (denied): a quiet toast "' + e1.toast + '"');
  ok(e1.hash === '' && e1.pending === null, 'web return (denied): the hash is cleaned and the pending state cleared');
  ok(e1.nav, 'web return (denied): the page booted as usual (nav rendered)');

  await page.goto(BASE + 'index.html#access_token=fake&refresh_token=fake&token_type=bearer&expires_in=3600', { waitUntil: 'load' });
  await wait(3500);
  const e2 = await page.evaluate(() => ({ toast: (document.querySelector('.toast') || {}).textContent || '', hash: location.hash, nav: !!document.querySelector('#nav .brand, #nav a, #nav button') }));
  ok(/didn.t finish/i.test(e2.toast), 'web return (tokens, Supabase unreachable): says the sign-in didn\'t finish: "' + e2.toast + '"');
  ok(e2.hash === '' && e2.nav, 'web return (unreachable): hash cleaned, page booted');
  await ctx.close();
}

// ------------------------------------------------------------------ 5. the iPhone sheets
const ROLE_STEP = '.ob-sheet .ob-track .ob-step:last-child';
for (const [w, h, scale, sz] of SIZES) {
  for (const theme of THEMES) {
    const { ctx, page } = await open({ w, h, scale, theme, native: true });
    await page.goto(BASE + 'index.html', { waitUntil: 'load' });
    await wait(1200);
    ok(await page.evaluate(() => document.documentElement.classList.contains('native') && typeof obOpen === 'function'), `native ${sz} ${theme}: the shell's welcome is up`);
    await page.evaluate(() => obOpen('login'));
    await wait(700);
    ok(await page.locator('.ob-sheet .ob-step:nth-child(1) .sa-btn').count() === 2, `native ${sz} ${theme}: Log in sheet has the two buttons`);
    await shot(page, `native-login-${sz}-${theme}`);

    // Apple from Log in: a first-time account → the role step in the same sheet.
    await page.evaluate(mockDb(appleUser, null));
    await page.click('.ob-sheet .ob-track .ob-step:nth-child(1) .sa-apple');
    await page.waitForSelector(ROLE_STEP + ' h2', { timeout: 5000 });
    await wait(500);
    ok(/How will you use/.test(await page.textContent(ROLE_STEP + ' h2')), `native ${sz} ${theme}: Apple → the role step`);
    await shot(page, `native-role-${sz}-${theme}`);
    if (sz === '390' && theme === 'dark') {
      const n = await page.evaluate(() => ({ req: window.__appleReq, idt: window.__idt, hashedRaw: SocialAuth.sha256Hex(window.__idt.n), back: getComputedStyle(document.querySelector('.ob-sheet .ob-back')).visibility }));
      ok(n.req && n.req.nonce === n.hashedRaw && n.idt.n.length === 64, 'native Apple: Apple got the SHA-256 of the nonce Supabase got');
      ok(n.req.scopes === 'email name' && n.idt.p === 'apple' && n.idt.t === 'fake.apple.token' && !n.idt.a, 'native Apple: email + name asked, the identity token went to Supabase');
      ok(n.back === 'hidden', 'native Apple: the back arrow is hidden on the role step');
      ok(await page.inputValue(ROLE_STEP + ' input[aria-label="Full name"]') === 'Jane Doe', 'native Apple: the name Apple sent (only ever once) is pre-filled');
      await page.click(ROLE_STEP + ' .nw-btn-primary');
      ok(/Pick how/.test(await page.textContent(ROLE_STEP + ' .ob-err')), 'native Apple: Continue without a card explains');
      await page.click(ROLE_STEP + ' .ob-card.t-violet');
      await page.click(ROLE_STEP + ' .nw-btn-primary');
      ok(/16 or older/.test(await page.textContent(ROLE_STEP + ' .ob-err')), 'native Apple: Continue without the tick explains');
      await page.click(ROLE_STEP + ' .ob-check');
      await page.click(ROLE_STEP + ' .nw-btn-primary');
      await wait(400);
      const r = await page.evaluate(() => ({ calls: window.__calls, dest: window.__dest, role: localStorage.getItem('powa-last-role') }));
      ok(r.calls.finish && r.calls.finish.t === 'coach' && r.calls.finish.n === 'Jane Doe' && r.dest === 'coach.html' && r.role === 'coach', 'native Apple: coach created with Apple\'s name, lands on coach.html');
      ok(!r.calls.welcome, 'native Apple: no welcome email to the private relay');
    }
    // Google from Sign up (coach): everything known from the steps → no questions.
    await page.evaluate(() => obOpen('signup', { role: 'coach' }));
    await wait(600);
    await page.fill('.ob-sheet .ob-track .ob-step:nth-child(2) input[aria-label="Full name"]', 'Jane Doe');
    await page.click('.ob-sheet .ob-track .ob-step:nth-child(2) .nw-btn-primary');
    await wait(600);
    ok(await page.locator('.ob-sheet .ob-track .ob-step:nth-child(3) .sa-btn').count() === 2, `native ${sz} ${theme}: Sign up step 3 has the two buttons`);
    await shot(page, `native-signup-${sz}-${theme}`);
    if (sz === '390' && theme === 'dark') {
      await page.evaluate(mockDb(googleUser, null));
      await page.evaluate(() => { window.__dest = null; window.__idt = null; });
      await page.click('.ob-sheet .ob-track .ob-step:nth-child(3) .sa-google');
      await wait(300);
      const g0 = await page.evaluate(() => ({ idt: window.__idt, err: document.querySelector('.ob-sheet .ob-track .ob-step:nth-child(3) .ob-err').textContent }));
      ok(!g0.idt && /16 or older/.test(g0.err), 'native Google: without the 16+ tick nothing is sent and the step says why');
      await page.click('.ob-sheet .ob-track .ob-step:nth-child(3) .ob-check');
      await page.click('.ob-sheet .ob-track .ob-step:nth-child(3) .sa-google');
      await wait(500);
      const g = await page.evaluate(() => ({ init: window.__gInit, idt: window.__idt, calls: window.__calls, dest: window.__dest, steps: document.querySelectorAll('.ob-sheet .ob-track .ob-step').length }));
      ok(g.init && g.init.clientId === 'test-ios.apps.googleusercontent.com', 'native Google: the plugin is initialised with the iOS client id from the injected config');
      ok(g.idt && g.idt.p === 'google' && g.idt.t === 'fake.google.token' && g.idt.a === 'fake-access' && !g.idt.n, 'native Google: id token + access token went to Supabase, no nonce');
      ok(g.calls.finish && g.calls.finish.t === 'coach' && g.calls.finish.n === 'Jane Doe' && g.dest === 'coach.html', 'native Google: coach created with the typed name, lands on coach.html');
      ok(g.steps === 3, 'native Google: no extra step was needed (role, name and tick were known)');
      ok(g.calls.meta && g.calls.meta.user_type === 'coach' && g.calls.meta.age_16_plus === true, 'native Google: role + consent written to the account metadata');
      ok(g.calls.welcome && g.calls.welcome.e === 'jane@gmail.com', 'native Google: welcome email sent to the Google address');
    }
    ok(page.errors.length === 0, `native ${sz} ${theme}: no page errors` + (page.errors.length ? ' — ' + page.errors.join(' | ') : ''));
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 6. the demos still boot (no sign-in code runs there)
{
  const { ctx, page } = await open({ w: 390, h: 844, scale: 2, theme: 'dark' });
  for (const p of ['athlete.html?demo=1', 'coach.html?demo=1']) {
    await page.goto(BASE + p, { waitUntil: 'load' });
    await wait(1500);
    ok(await page.evaluate(() => !!window._demoMode && !!document.querySelector('.dash-main, main')), `demo ${p} boots`);
  }
  ok(page.errors.length === 0, 'demos: no page errors' + (page.errors.length ? ' — ' + page.errors.join(' | ') : ''));
  await ctx.close();
}

await browser.close();
if (server) server.kill();
console.log('\nscreenshots:');
shots.forEach(s => console.log('  ' + s));
console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
