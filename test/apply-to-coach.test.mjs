// apply-to-coach (supabase/functions/apply-to-coach) end to end under Node, no Deno and no network: Deno.env /
// Deno.serve are stubbed, the esm.sh supabase client and npm:web-push are in-memory fakes (rl_bump counts like the SQL
// one; apply_to_coach / confirm_coach_application / coach_applications_open answer as the migration does, which
// scratchpad/pgtest/coach-applications-test.mjs proves in PGlite), and fetch records Resend. Then the real handler runs:
// the gate, the limits (per IP, per email silently, everyone), the honeypot, the link and its hash, the database's
// words, a failed email, the confirm and the coach's push and email (never the note), muted alerts, a second open.
// Run: node test/apply-to-coach.test.mjs
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
const LOGS = [];
console.warn = (...a) => LOGS.push(a.join(' '));
console.error = (...a) => LOGS.push(a.join(' '));
console.log = ((log) => (...a) => { if (String(a[0] || '').startsWith('apply:')) LOGS.push(a.join(' ')); else log(...a); })(console.log);

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.info('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

const SAM = '11111111-2222-4333-8444-555555555555', HIDDEN = '99999999-2222-4333-8444-555555555555';
const FAKE_SUPABASE = `
class Q {
  constructor(W, t) { this.W = W; this.t = t; this.f = []; this.op = 'select'; this.one = false; }
  select() { return this; }
  eq(c, v) { this.f.push(r => r[c] === v); return this; }
  in(c, vs) { this.f.push(r => vs.includes(r[c])); return this; }
  limit() { return this; }
  maybeSingle() { this.one = true; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    this.W.calls.push('from:' + this.t + ':' + this.op);
    const rows = (this.W.tables[this.t] || []).filter(r => this.f.every(fn => fn(r)));
    if (this.op === 'delete') { this.W.tables[this.t] = (this.W.tables[this.t] || []).filter(r => !rows.includes(r)); return { data: null, error: null }; }
    return this.one ? { data: rows[0] || null, error: null } : { data: rows, error: null };
  }
}
export function createClient() {
  const W = globalThis.__W;
  return { from: (t) => new Q(W, t), rpc: async (name, p) => { W.calls.push('rpc:' + name); return W.rpc(name, p); } };
}`;
const FAKE_WEBPUSH = `
export default {
  setVapidDetails() {},
  async sendNotification(sub, body) { globalThis.__PUSH.push({ endpoint: sub.endpoint, payload: JSON.parse(body) }); }
};`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) return { url: 'data:text/javascript,' + encodeURIComponent(FAKE_SUPABASE), shortCircuit: true };
    if (specifier === 'npm:web-push@3.6.7') return { url: 'data:text/javascript,' + encodeURIComponent(FAKE_WEBPUSH), shortCircuit: true };
    return next(specifier, context);
  }
});
const ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', RESEND_API_KEY: 're_test_key', VAPID_PUBLIC_KEY: 'vp', VAPID_PRIVATE_KEY: 'vk' };
let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
const SENT = [];
let resendStatus = 200;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com/')) { SENT.push(JSON.parse(init.body)); return new Response(resendStatus === 200 ? '{"id":"em"}' : 'nope', { status: resendStatus }); }
  throw new Error('unexpected fetch ' + url);
};
globalThis.__PUSH = [];

// A world: the database as the migration behaves (the SQL itself is PGlite-tested).
function world(o) {
  o = o || {};
  const W = { calls: [], counters: new Map(), apps: [], tables: {
    profiles: [{ id: SAM, name: 'Sam Ellis', email: 'sam@coach.test', user_type: 'coach' }],
    email_preferences: o.muted ? [{ user_id: SAM, push_alerts: false }] : [],
    push_subscriptions: [{ id: 'ps1', user_id: SAM, endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'p', auth: 'a', platform: 'web' }] } };
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  W.rpc = (name, p) => {
    if (name === 'rl_bump') {
      if (o.noMeter) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.rl_bump' } };
      const k = p.p_bucket + '|' + p.p_identity; const n = (W.counters.get(k) || 0) + 1; W.counters.set(k, n);
      return { data: [{ allowed: n <= p.p_limit, cur: n, limit_val: p.p_limit, reset_at: new Date(Date.now() + p.p_window_secs * 1000).toISOString() }], error: null };
    }
    if (o.notReady && name !== 'rl_bump') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + name + ' in the schema cache' } };
    if (name === 'coach_applications_open') return { data: p.p_coach === SAM, error: null };
    if (name === 'apply_to_coach') {
      if (p.p_coach !== SAM) return { data: null, error: { code: 'P0001', message: 'This coach isn’t taking applications here.' } };
      if (!String(p.p_name || '').trim() || String(p.p_name).length > 80) return { data: null, error: { code: 'P0001', message: 'Your name is 1 to 80 characters.' } };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.p_email)) return { data: null, error: { code: 'P0001', message: 'That email doesn’t look right.' } };
      if (!/^[0-9a-f]{64}$/.test(p.p_confirm_hash || '')) return { data: null, error: { code: '22023', message: 'a confirm hash is 64 hex characters' } };
      W.apps = W.apps.filter(a => !(a.email === p.p_email && !a.confirmed));
      const id = 'app-' + (W.apps.length + 1) + '-' + Math.random().toString(36).slice(2, 6);
      W.apps.push({ id, p, email: p.p_email, hash: p.p_confirm_hash, confirmed: false });
      return { data: { result: 'pending', id, coach_name: 'Sam' }, error: null };
    }
    if (name === 'confirm_coach_application') {
      const a = W.apps.find(x => x.hash === p.p_hash);
      if (!a) return { data: { result: 'unknown' }, error: null };
      const was = a.confirmed; a.confirmed = true;
      return { data: { result: was ? 'already' : 'confirmed', id: a.id, coach_id: SAM, coach_name: 'Sam', name: a.p.p_name, training_years: a.p.p_training_years,
        squat_kg: a.p.p_squat, bench_kg: a.p.p_bench, deadlift_kg: a.p.p_deadlift, bodyweight_kg: a.p.p_bodyweight, next_meet: a.p.p_next_meet, goals: a.p.p_goals }, error: null };
    }
    return { data: null, error: { message: 'no rpc ' + name } };
  };
  W.sha = sha;
  globalThis.__W = W;
  return W;
}
const call = async (body, o) => {
  o = o || {};
  const headers = { 'content-type': 'application/json', 'cf-connecting-ip': o.ip || '203.0.113.7' };
  if (o.xff) { delete headers['cf-connecting-ip']; headers['x-forwarded-for'] = o.xff; }
  const res = await handler(new Request('https://fn.test/apply-to-coach', { method: o.method || 'POST', headers, body: o.method === 'GET' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }));
  let j = null; try { j = await res.json(); } catch (e) {}
  return { status: res.status, body: j, headers: res.headers };
};
const MIA = { action: 'apply', coachId: SAM, name: 'Mia Lane', email: 'Mia@Example.com', trainingYears: 3, squat: 140, bench: 82.5, deadlift: 170, bodyweight: 82.4, nextMeet: '2026-12-12', goals: 'First meet in spring', note: 'Knee was cranky last year.' };
const tokenOf = (mail) => (/#confirm=([A-Za-z0-9_-]+)/.exec(mail.text) || [])[1];

world();
await import('../supabase/functions/apply-to-coach/index.ts');
ok(typeof handler === 'function', 'the function registered a handler');

await t('CORS preflight allows supabase-js\'s headers; GET is refused', async () => {
  const r = await call(null, { method: 'OPTIONS' });
  eq(r.status, 200); ok(/x-client-info/.test(r.headers.get('access-control-allow-headers')), 'x-client-info allowed');
  eq((await call(null, { method: 'GET' })).status, 405);
  eq((await call('not json')).status, 400);
  eq((await call({ action: 'nope' })).status, 400);
});
await t('open: a coach in the directory yes; anyone else, a bad id, or no migration: no (the form stays hidden)', async () => {
  world();
  eq((await call({ action: 'open', coachId: SAM })).body, { open: true });
  eq((await call({ action: 'open', coachId: HIDDEN })).body, { open: false });
  eq((await call({ action: 'open', coachId: 'nope' })).body, { open: false });
  world({ notReady: true });
  eq((await call({ action: 'open', coachId: SAM })).body, { open: false });
});
await t('apply: stored unconfirmed with the hash of a fresh token; the applicant gets the link; the coach nothing yet', async () => {
  const W = world(); SENT.length = 0; __PUSH.length = 0;
  const r = await call(MIA);
  eq(r.status, 200); eq(r.body, { ok: true });
  eq(W.apps.length, 1); eq(W.apps[0].email, 'mia@example.com', 'email lower case');
  eq(SENT.length, 1); eq(SENT[0].to, ['mia@example.com']); eq(SENT[0].subject, 'Confirm your application to Sam');
  const tok = tokenOf(SENT[0]);
  ok(tok && tok.length >= 40, 'a long random token in the link');
  ok(SENT[0].text.indexOf('https://www.powalifta.com/coach-profile.html?id=' + SAM + '#confirm=' + tok) >= 0, 'the link opens the coach\'s profile, the token in the hash');
  eq(W.apps[0].hash, W.sha(tok), 'only its hash is stored');
  ok(!SENT.some(m => m.to[0] === 'sam@coach.test') && !__PUSH.length, 'the coach hears nothing before the link is opened');
  eq(W.apps[0].p.p_bodyweight, 82.4); eq(W.apps[0].p.p_next_meet, '2026-12-12');
});
await t('two applications get two different tokens', async () => {
  world(); SENT.length = 0;
  await call(MIA, { ip: '198.51.100.1' }); await call(Object.assign({}, MIA, { email: 'ana@example.com' }), { ip: '198.51.100.2' });
  ok(tokenOf(SENT[0]) !== tokenOf(SENT[1]));
});
await t('the honeypot: a bot\'s filled-in field gets the same answer, and nothing is kept or sent', async () => {
  const W = world(); SENT.length = 0;
  const r = await call(Object.assign({}, MIA, { company: 'Acme SEO' }));
  eq(r.body, { ok: true }); eq(W.apps.length, 0); eq(SENT.length, 0);
});
await t('per IP: 10 a day; the 11th from one place is refused, said plainly', async () => {
  const W = world(); SENT.length = 0;
  for (let i = 0; i < 10; i++) eq((await call(Object.assign({}, MIA, { email: 'p' + i + '@example.com' }))).status, 200);
  const r = await call(Object.assign({}, MIA, { email: 'p10@example.com' }));
  eq(r.status, 429); ok(/a lot of applications from here today/.test(r.body.message)); eq(W.apps.length, 10);
});
await t('the IP is Cloudflare\'s, else the LAST x-forwarded-for hop (a spoofed first hop changes nothing)', async () => {
  world();
  for (let i = 0; i < 10; i++) await call(Object.assign({}, MIA, { email: 'x' + i + '@example.com' }), { xff: '10.0.0.' + i + ', 192.0.2.50' });
  eq((await call(Object.assign({}, MIA, { email: 'x10@example.com' }), { xff: '10.9.9.9, 192.0.2.50' })).status, 429);
});
await t('per email: 3 a day, then the same answer with nothing kept or sent (no oracle; a repeat counts)', async () => {
  const W = world(); SENT.length = 0;
  const answers = [];
  for (let i = 0; i < 5; i++) answers.push(JSON.stringify((await call(MIA, { ip: '198.51.100.' + i })).body));
  eq(new Set(answers).size, 1, 'one answer for all five'); eq(answers[0], '{"ok":true}');
  eq(SENT.length, 3, 'three emails, then none'); eq(W.counters.get('apply-email|mia@example.com'), 5, 'every attempt counted');
});
await t('everyone: 300 an hour, then busy', async () => {
  const W = world();
  W.counters.set('apply-all|all', 300);
  const r = await call(MIA);
  eq(r.status, 429); ok(/busy/.test(r.body.message)); eq(W.apps.length, 0);
});
await t('the database\'s own words come back as 400; a missing migration is 503; a failed email is 502 (and not "ok")', async () => {
  world();
  let r = await call(Object.assign({}, MIA, { name: '   ' }));
  eq(r.status, 400); eq(r.body, { error: 'invalid', message: 'Your name is 1 to 80 characters.' });
  r = await call(Object.assign({}, MIA, { coachId: HIDDEN, email: 'h@example.com' }));
  eq(r.status, 400); ok(/isn.t taking applications/.test(r.body.message));
  world({ notReady: true });
  eq((await call(MIA)).status, 503);
  world(); resendStatus = 500;
  r = await call(MIA);
  eq(r.status, 502); eq(r.body.error, 'email_failed');
  resendStatus = 200;
});
await t('the meter missing (rl_bump not there): fails open, as every function does', async () => {
  const W = world({ noMeter: true }); SENT.length = 0;
  eq((await call(MIA)).body, { ok: true }); eq(W.apps.length, 1);
});
await t('confirm: the coach hears at once (push to their devices, email naming who), never the note; the page gets the coach\'s name', async () => {
  const W = world(); SENT.length = 0; __PUSH.length = 0;
  await call(MIA);
  const tok = tokenOf(SENT[0]);
  const r = await call({ action: 'confirm', token: tok });
  eq(r.body, { ok: true, state: 'confirmed', coach: 'Sam' });
  eq(__PUSH.length, 1); eq(__PUSH[0].payload.title, 'New application'); eq(__PUSH[0].payload.body, 'Mia Lane wants to train with you');
  eq(__PUSH[0].payload.url, '/coach.html?lead=' + W.apps[0].id);
  const m = SENT.find(x => x.to[0] === 'sam@coach.test');
  ok(m, 'an email to the coach'); eq(m.subject, 'Mia Lane applied to train with you');
  ok(/3 years training · 140 \/ 82\.5 \/ 170 kg · 82\.4 kg bodyweight · next meet 2026-12-12/.test(m.text), 'one line of who: ' + m.text.split('\n')[0]);
  ok(!/Knee/.test(m.text + m.html), 'never their note');
  ok(m.text.indexOf('https://www.powalifta.com/coach.html?lead=' + W.apps[0].id) >= 0, 'the link opens the lead');
});
await t('confirm again: "already", and the coach isn\'t told twice', async () => {
  world(); SENT.length = 0; __PUSH.length = 0;
  await call(MIA); const tok = tokenOf(SENT[0]);
  await call({ action: 'confirm', token: tok });
  const n = SENT.length;
  eq((await call({ action: 'confirm', token: tok })).body, { ok: true, state: 'already', coach: 'Sam' });
  eq(SENT.length, n); eq(__PUSH.length, 1);
});
await t('confirm: a wrong or malformed token is unknown, and says nothing more', async () => {
  world();
  eq((await call({ action: 'confirm', token: 'A'.repeat(43) })).body, { ok: false, state: 'unknown' });
  eq((await call({ action: 'confirm', token: '<script>' })).body, { ok: false, state: 'unknown' });
  eq((await call({ action: 'confirm' })).body, { ok: false, state: 'unknown' });
});
await t('confirm: 30 an hour from one IP', async () => {
  world();
  for (let i = 0; i < 30; i++) await call({ action: 'confirm', token: 'B'.repeat(43) });
  eq((await call({ action: 'confirm', token: 'B'.repeat(43) })).status, 429);
});
await t('a coach who muted alerts gets no push, still the email', async () => {
  world({ muted: true }); SENT.length = 0; __PUSH.length = 0;
  await call(MIA); await call({ action: 'confirm', token: tokenOf(SENT[0]) });
  eq(__PUSH.length, 0); ok(SENT.some(m => m.to[0] === 'sam@coach.test'));
});
await t('names in the emails: no links, no line breaks, no direction tricks, HTML escaped', async () => {
  const { mailName, coachEmail, confirmEmail, leadSummary } = await import('../supabase/functions/apply-to-coach/index.ts');
  eq(mailName('Mia‮Lane http://evil.example\nnew line', 'x'), 'Mia Lane new line');
  eq(mailName('', 'Someone'), 'Someone');
  const m = coachEmail({ name: '<img src=x onerror=alert(1)>', summary: '', link: 'https://www.powalifta.com/coach.html?lead=1' });
  ok(!/<img/.test(m.html) && /&lt;img/.test(m.html));
  ok(/^Send your application to Sam/.test(/<h1[^>]*>([^<]+)/.exec(confirmEmail({ coach: 'Sam', link: 'https://x' }).html)[1]));
  eq(leadSummary({ training_years: 0 }), 'under a year training'); eq(leadSummary({}), '');
});
console.info('apply-to-coach: ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail ? 1 : 0;
