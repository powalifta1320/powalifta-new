// send-weekly-digest end to end under Node, no Deno and no network: Deno.env / Deno.serve are stubbed,
// the esm.sh supabase client and npm:web-push are swapped for in-memory fakes (a small PostgREST that
// caps a read at 1000 rows and refuses an .in() of more than 200 ids), and fetch records Resend and
// APNs calls. Then the real handler runs: the secret gate, the job by weekday, dry runs that write
// nothing, the coach report's push + email (mutes, opt-outs, a minted unsubscribe token, a 429 retried),
// missing tables and a missing migration, the Thursday push, paging, and the lifters' digest untouched.
// Run: node test/send-weekly-digest.test.mjs
import { registerHooks } from 'node:module';
// The function logs what it leaves out and what failed; here those are expected, so keep them, quietly.
const LOGS = [];
console.warn = (...a) => LOGS.push(a.join(' '));
console.error = (...a) => LOGS.push(a.join(' '));

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

// ---------------------------------------------------------------- the fakes
const FAKE_SUPABASE = `
const PAGE_CAP = 1000;
function rowsOf(db, t) { return db.tables[t] || (db.tables[t] = []); }
class Q {
  constructor(db, t) { this.db = db; this.t = t; this.f = []; this.ord = null; this.rng = null; this.lim = null; this.op = 'select'; this.cols = '*'; this.one = false; this.inMax = 0; }
  select(c) { this.cols = c || '*'; return this; }
  eq(c, v) { this.f.push(r => r[c] === v); return this; }
  in(c, vs) { this.inMax = Math.max(this.inMax, vs.length); this.f.push(r => vs.includes(r[c])); return this; }
  gte(c, v) { this.f.push(r => r[c] != null && String(r[c]) >= String(v)); return this; }
  lte(c, v) { this.f.push(r => r[c] != null && String(r[c]) <= String(v)); return this; }
  lt(c, v) { this.f.push(r => r[c] != null && String(r[c]) < String(v)); return this; }
  is(c, v) { this.f.push(r => (r[c] == null ? null : r[c]) === v); return this; }
  not(c, op, v) { if (op === 'is' && v === null) this.f.push(r => r[c] != null); return this; }
  order(c) { this.ord = c; return this; }
  range(a, b) { this.rng = [a, b]; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = true; return this; }
  upsert(row, opts) { this.op = 'upsert'; this.row = row; this.opts = opts || {}; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const db = this.db;
    db.calls.push({ t: this.t, op: this.op });
    if (db.missing.has(this.t)) return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public." + this.t + "' in the schema cache" } };
    const cols = this.cols === '*' ? [] : this.cols.split(',').map(s => s.trim());
    const gone = cols.find(c => (db.missingCols[this.t] || []).includes(c));
    if (gone) return { data: null, error: { code: '42703', message: 'column ' + this.t + '.' + gone + ' does not exist' } };
    if (this.inMax > 200) return { data: null, error: { message: 'URI too long: ' + this.inMax + ' ids' } };
    const rows = rowsOf(db, this.t);
    if (this.op === 'upsert') {
      db.writes.push({ t: this.t, op: 'upsert', row: this.row, opts: this.opts });
      const k = this.opts.onConflict;
      const had = rows.find(r => r[k] === this.row[k]);
      if (had) { if (!this.opts.ignoreDuplicates) Object.assign(had, this.row); }
      else rows.push(Object.assign({ weekly_digest: true, product_emails: true, unsub_token: 'tok-' + this.row[k] }, this.row));
      return { data: null, error: null };
    }
    let list = rows.filter(r => this.f.every(fn => fn(r)));
    if (this.op === 'delete') {
      db.writes.push({ t: this.t, op: 'delete', n: list.length });
      db.tables[this.t] = rows.filter(r => !list.includes(r));
      return { data: null, error: null };
    }
    if (this.ord) list = list.slice().sort((a, b) => String(a[this.ord]).localeCompare(String(b[this.ord])));
    const [a, b] = this.rng || [0, PAGE_CAP - 1];
    if (b - a + 1 > PAGE_CAP) return { data: null, error: { message: 'range over the cap' } };
    list = list.slice(a, Math.min(b + 1, a + PAGE_CAP));
    if (this.lim) list = list.slice(0, this.lim);
    const proj = r => cols.length ? Object.fromEntries(cols.map(c => [c, r[c] === undefined ? null : r[c]])) : Object.assign({}, r);
    if (this.one) return { data: list[0] ? proj(list[0]) : null, error: null };
    return { data: list.map(proj), error: null };
  }
}
function stats(db, p) {
  const out = [];
  for (const id of new Set(p.p_athletes)) {
    const logs = rowsOf(db, 'workout_logs').filter(l => l.athlete_id === id && l.date <= p.p_to);
    const days = new Set(logs.filter(l => l.date >= p.p_from).map(l => l.date));
    const lifts = {};
    logs.forEach(l => { if (!['squat', 'bench', 'deadlift'].includes(l.lift) || !(l.e1rm_comp > 0)) return;
      const x = lifts[l.lift] || (lifts[l.lift] = { during: null, before: null });
      if (l.date >= p.p_from) x.during = Math.max(x.during || 0, l.e1rm_comp); else x.before = Math.max(x.before || 0, l.e1rm_comp); });
    out.push({ athlete_id: id, sessions: days.size, lifts });
  }
  return out;
}
export function createClient() {
  const db = globalThis.__DB;
  return {
    from: (t) => new Q(db, t),
    rpc: async (name, p) => {
      db.calls.push({ t: 'rpc:' + name, op: 'rpc', n: p.p_athletes.length });
      if (db.noStats) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.coach_week_stats(p_athletes, p_from, p_to) in the schema cache' } };
      if (p.p_athletes.length > 200) return { data: null, error: { message: 'too many ids' } };
      return { data: stats(db, p), error: null };
    }
  };
}`;
const FAKE_WEBPUSH = `
export default {
  setVapidDetails() {},
  async sendNotification(sub, body) {
    globalThis.__PUSH.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
    if (String(sub.endpoint).includes('gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; }
  }
};`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) return { url: 'data:text/javascript,' + encodeURIComponent(FAKE_SUPABASE), shortCircuit: true };
    if (specifier === 'npm:web-push@3.6.7') return { url: 'data:text/javascript,' + encodeURIComponent(FAKE_WEBPUSH), shortCircuit: true };
    return next(specifier, context);
  }
});
const ENV = { CRON_SECRET: 'test-cron-secret', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', RESEND_API_KEY: 're_test_key',
  VAPID_PUBLIC_KEY: 'test-vapid-public', VAPID_PRIVATE_KEY: 'test-vapid-private', UNSUB_BASE: 'https://powalifta.com/unsubscribe.html?token=' };
let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
// The lifters' digest counts its 7 days back from Date.now() (unchanged code): pin it to a Monday.
Date.now = () => Date.parse('2026-10-26T14:00:00Z');
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);   // no real waits between sends
const SENT = [];
let resendScript = [];   // statuses to answer, in order (then 200)
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.resend.com/')) {
    const body = JSON.parse(init.body);
    const status = resendScript.length ? resendScript.shift() : 200;
    SENT.push({ to: body.to, subject: body.subject, html: body.html, text: body.text, headers: body.headers || null, status });
    return new Response(status === 200 ? '{"id":"x"}' : '{"error":"slow down"}', { status, headers: status === 429 ? { 'retry-after': '1' } : {} });
  }
  throw new Error('unexpected fetch ' + u);
};
await import('../supabase/functions/send-weekly-digest/index.ts');
ok(typeof handler === 'function', 'Deno.serve got a handler');

// ---------------------------------------------------------------- the data
const block = (perWeek, doneWeeks) => Array.from({ length: 4 }, (_, wi) => ({ days: Array.from({ length: perWeek }, () => ({ exercises: [{ lift: 'squat', sets: [{ completed: wi < doneWeeks }] }] })) }));
function freshDB() {
  const db = { tables: {}, calls: [], writes: [], missing: new Set(), missingCols: {}, noStats: false };
  const P = (id, name, user_type, coach_id, email) => ({ id, name, user_type, coach_id: coach_id || null, email: email || null, unit: 'kg' });
  db.tables.profiles = [
    P('c1', 'Mia Coach', 'coach', null, 'mia.coach@example.com'), P('c2', 'Dan Coach', 'coach', null, 'dan@example.com'), P('c3', 'Quiet Coach', 'coach', null, 'quiet@example.com'),
    P('a1', 'Arjun Mehta', 'athlete', 'c1', 'arjun@example.com'), P('a2', 'Tom Becker', 'athlete', 'c1', 'tom@example.com'), P('a3', 'Sarah Kim', 'athlete', 'c1', 'sarah@example.com'),
    P('b1', 'Leo <script>Park</script>', 'athlete', 'c2', 'leo@example.com'), P('q1', 'Idle Ivy', 'athlete', 'c3', 'ivy@example.com'), P('s1', 'Solo Sam', 'athlete', null, 'sam@example.com')
  ];
  db.tables.email_preferences = [
    { user_id: 'c1', weekly_digest: true, unsub_token: '11111111-1111-4111-8111-111111111111', push_alerts: true },
    { user_id: 'c3', weekly_digest: false, unsub_token: '33333333-3333-4333-8333-333333333333', push_alerts: false },
    { user_id: 'a1', weekly_digest: true, unsub_token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
  ];   // c2 has no row: one gets made at send time
  db.tables.programs = [
    { id: 'p1', athlete_id: 'a1', coach_id: 'c1', weeks: block(4, 1), updated_at: '2026-10-01' }, { id: 'p2', athlete_id: 'a2', coach_id: 'c1', weeks: block(4, 1), updated_at: '2026-10-01' },
    { id: 'p3', athlete_id: 'a3', coach_id: 'c1', weeks: JSON.stringify(block(3, 1)), updated_at: '2026-10-01' }, { id: 'p4', athlete_id: 'b1', coach_id: 'c2', weeks: block(3, 0), updated_at: '2026-10-01' }
  ];
  const L = (athlete_id, date, lift, e1rm_comp) => ({ id: 'l' + Math.random().toString(36).slice(2), athlete_id, date, lift, e1rm_comp, weight: 100, reps: 3 });
  db.tables.workout_logs = [
    L('a1', '2026-09-20', 'squat', 200), L('a1', '2026-10-19', 'squat', 206), L('a1', '2026-10-21', 'bench', 140), L('a1', '2026-10-23', 'deadlift', 250), L('a1', '2026-10-25', 'squat', 180),
    L('a2', '2026-10-20', 'squat', 150), L('a3', '2026-10-20', 'bench', 80), L('a3', '2026-10-22', 'bench', 80),
    L('b1', '2026-10-21', 'squat', 170), L('s1', '2026-10-21', 'squat', 120),
    L('a1', '2026-10-26', 'squat', 210), L('a3', '2026-10-27', 'bench', 81)   // this week (the Thursday check)
  ];
  db.tables.pain_reports = [{ id: 'r1', athlete_id: 'a3', day: '2026-10-22', body_part: 'knee', resolved_at: null }];
  db.tables.form_checks = [{ id: 'f1', athlete_id: 'b1', coach_id: 'c2', coach_reply: null }];
  db.tables.client_billing = [{ id: 'cb1', athlete_id: 'a2', coach_id: 'c1', amount_cents: 22000, currency: 'USD', next_due: '2026-10-20', status: 'active' }];
  db.tables.meets = [{ id: 'm1', athlete_id: 'a1', name: 'Autumn Open', meet_date: '2026-11-07' }];
  db.tables.checkins = []; db.tables.checkin_answers = [];
  db.tables.push_subscriptions = [
    { id: 'ps1', user_id: 'c1', platform: 'web', endpoint: 'https://fcm.googleapis.com/fcm/send/c1', p256dh: 'k', auth: 'a' },
    { id: 'ps2', user_id: 'c1', platform: 'web', endpoint: 'https://fcm.googleapis.com/fcm/send/gone-c1', p256dh: 'k', auth: 'a' },
    { id: 'ps3', user_id: 'c2', platform: 'web', endpoint: 'https://web.push.apple.com/c2', p256dh: 'k', auth: 'a' },
    { id: 'ps4', user_id: 'c3', platform: 'web', endpoint: 'https://fcm.googleapis.com/fcm/send/c3', p256dh: 'k', auth: 'a' }
  ];
  db.missing.add('schedule_requests');   // the busy-weeks table isn't there yet
  return db;
}
const call = async (body, secret = ENV.CRON_SECRET) => {
  const res = await handler(new Request('https://fn.test/send-weekly-digest', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, secret ? { Authorization: 'Bearer ' + secret } : {}), body: body == null ? '' : JSON.stringify(body) }));
  return { status: res.status, json: await res.json() };
};
const reset = () => { globalThis.__DB = freshDB(); globalThis.__PUSH = []; SENT.length = 0; resendScript = []; return globalThis.__DB; };

// ---------------------------------------------------------------- the gate
await t('no secret, a wrong secret: 401, and the body is never read', async () => {
  reset();
  eq((await call({ job: 'nope' }, null)).status, 401);
  eq((await call({ job: 'nope' }, 'wrong-secret')).status, 401);
  eq(globalThis.__DB.calls.length, 0, 'no reads before the secret');
});
await t('behind the secret: a bad job or day is a 400', async () => {
  reset();
  eq((await call({ job: 'everything' })).status, 400);
  eq((await call({ today: '2026-13-40' })).status, 400);
});
await t('a Tuesday with an empty body does nothing', async () => {
  reset();
  const r = await call({ today: '2026-10-27' });
  eq([r.status, r.json.jobs], [200, []]);
  eq(globalThis.__DB.calls.length, 0);
});

// ---------------------------------------------------------------- the Monday report
await t('Monday, dry run: both jobs, previews only, nothing written or sent', async () => {
  const db = reset();
  const r = await call({ today: '2026-10-26', dryRun: true });
  eq(r.json.jobs, ['digest', 'coach-report']);
  const cr = r.json['coach-report'];
  eq([cr.coaches, cr.quiet, cr.preview.length], [3, 1, 2], 'c3\'s idle team gets nothing');
  const mia = cr.preview.find(p => p.coach === 'c1');
  eq(mia.to, 'm•••h@example.com');
  eq(mia.push, { title: 'Your team’s week', body: '3 of 3 trained · 1 PR · 1 behind' });
  ok(/^Your team’s week: 3 of 3 trained/.test(mia.subject), mia.subject);
  ok(mia.text.includes('Pain reported: Sarah Kim') && !/knee/i.test(mia.text), 'pain without the body part');
  ok(mia.text.includes('1 payment overdue: $220'), 'money');
  ok(mia.text.includes('Autumn Open, Sat 7 Nov (in 12 days): Arjun Mehta'), 'the meet');
  eq(db.writes, [], 'no writes in a dry run');
  eq([SENT.length, globalThis.__PUSH.length], [0, 0], 'nothing sent');
  ok(r.json.digest && r.json.digest.dryRun === true && r.json.digest.preview.length === 1, 'the lifters\' digest dry run as before');
});
await t('Monday for real: pushes to /coach.html?report=week, emails with a one-click unsubscribe', async () => {
  const db = reset();
  const r = await call({ today: '2026-10-26' });
  const cr = r.json['coach-report'];
  eq([cr.emails, cr.pushes, cr.failed, cr.quiet], [2, 2, 0, 1]);
  const pushes = globalThis.__PUSH.map(p => [p.endpoint.split('/').pop(), p.payload.url, p.payload.tag]);
  eq(pushes.sort(), [['c1', '/coach.html?report=week', 'powa-report'], ['c2', '/coach.html?report=week', 'powa-report'], ['gone-c1', '/coach.html?report=week', 'powa-report']].sort());
  ok(!db.tables.push_subscriptions.some(s => s.id === 'ps2'), 'the dead endpoint is pruned');
  const mia = SENT.find(s => s.to[0] === 'mia.coach@example.com');
  eq(mia.headers, { 'List-Unsubscribe': '<https://powalifta.com/unsubscribe.html?token=11111111-1111-4111-8111-111111111111&r=coach>' });
  ok(mia.html.includes('href="https://www.powalifta.com/coach.html"') && mia.html.includes('>Open Today<'), 'one red, Open Today');
  const dan = SENT.find(s => s.to[0] === 'dan@example.com');
  ok(dan && /token=tok-c2&r=coach/.test(dan.headers['List-Unsubscribe']), 'c2\'s token was made at send time');
  const made = db.writes.find(w => w.t === 'email_preferences' && w.op === 'upsert');
  eq([made.row, made.opts.ignoreDuplicates], [{ user_id: 'c2', product_emails: false }, true], 'only defaults, product emails off, never overwriting');
  ok(dan.html.includes('Leo &lt;script&gt;Park&lt;/script&gt;') && !dan.html.includes('<script>'), 'names escaped');
  eq(SENT.filter(s => /^Your week:/.test(s.subject)).map(s => s.to[0]), ['arjun@example.com'], 'the lifters\' digest: Arjun only (opted in, trained)');
});
await t('a coach who switched alerts off still gets the email; one who switched the email off still gets the push', async () => {
  const db = reset();
  db.tables.email_preferences.find(p => p.user_id === 'c1').push_alerts = false;
  db.tables.email_preferences.push({ user_id: 'c2', weekly_digest: false, unsub_token: '22222222-2222-4222-8222-222222222222', push_alerts: true });
  const r = await call({ today: '2026-10-26', job: 'coach-report' });
  eq(r.json.jobs, ['coach-report']);
  eq(globalThis.__PUSH.map(p => p.endpoint.split('/').pop()), ['c2']);
  eq(SENT.map(s => s.to[0]), ['mia.coach@example.com']);
  eq(r.json['coach-report'].emailOff, 1);
});
await t('Resend says slow down once: retried and sent', async () => {
  reset(); resendScript = [429];
  const r = await call({ today: '2026-10-26', job: 'coach-report' });
  eq([r.json['coach-report'].emails, r.json['coach-report'].failed], [2, 0]);
  eq(SENT.filter(s => s.to[0] === SENT[0].to[0]).map(s => s.status), [429, 200]);
});
await t('a table that isn\'t there yet leaves its part out; the rest goes', async () => {
  const db = reset();
  db.missing.add('pain_reports'); db.missing.add('client_billing');
  const r = await call({ today: '2026-10-26', job: 'coach-report', dryRun: true });
  const mia = r.json['coach-report'].preview.find(p => p.coach === 'c1');
  ok(!mia.text.includes('Pain reported') && !mia.text.includes('overdue'), 'no pain, no money');
  ok(mia.text.includes('Behind:'), 'still behind');
});
await t('without the migration the coach jobs say so, and Monday\'s lifters still get their digest', async () => {
  const db = reset();
  db.noStats = true; db.missingCols.email_preferences = ['push_alerts'];
  const r = await call({ today: '2026-10-26' });
  ok(/run sql\/migration-coach-alerts-2026-10-28\.sql/.test(r.json['coach-report'].error), JSON.stringify(r.json['coach-report']));
  eq(r.json.digest.sent, 1);
  eq(r.status, 200);
});
await t('no Resend key: the pushes still go, no email', async () => {
  reset(); const key = ENV.RESEND_API_KEY; ENV.RESEND_API_KEY = '';
  try {
    const r = await call({ today: '2026-10-26', job: 'coach-report' });
    eq([r.json['coach-report'].pushes, r.json['coach-report'].emails, SENT.length], [2, 0, 0]);
  } finally { ENV.RESEND_API_KEY = key; }
});

// ---------------------------------------------------------------- Thursday
await t('Thursday: one push per coach with someone behind, nothing else', async () => {
  const db = reset();
  const r = await call({ today: '2026-10-29' });
  eq(r.json.jobs, ['midweek']);
  const m = r.json.midweek;
  eq([m.coaches, m.pushes, m.nobody], [3, 2, 1]);
  const toC1 = globalThis.__PUSH.find(p => p.endpoint.endsWith('/c1'));
  eq(toC1.payload, { title: 'Tom hasn’t trained this week', body: '0 of 4 sessions so far', url: '/coach.html', tag: 'powa-midweek' });
  const toC2 = globalThis.__PUSH.find(p => p.endpoint.endsWith('/c2'));
  eq(toC2.payload.title, 'Leo hasn’t trained this week');
  eq(SENT.length, 0, 'no email on Thursday');
  ok(!db.writes.some(w => w.t === 'email_preferences'), 'nothing made on Thursday');
});

// ---------------------------------------------------------------- paging
await t('a coach with 1,050 lifters: every one read (pages of 1000, ids in 200s)', async () => {
  const db = reset();
  for (let i = 0; i < 1050; i++) {
    const id = 'big-' + String(i).padStart(4, '0');
    db.tables.profiles.push({ id, name: 'Lifter ' + i, user_type: 'athlete', coach_id: 'c3', email: null, unit: 'kg' });
    if (i % 2 === 0) db.tables.workout_logs.push({ id: 'bl' + i, athlete_id: id, date: '2026-10-21', lift: 'squat', e1rm_comp: 100, weight: 80, reps: 5 });
  }
  const r = await call({ today: '2026-10-26', job: 'coach-report', dryRun: true });
  const big = r.json['coach-report'].preview.find(p => p.coach === 'c3');
  ok(big, 'c3 now has a report');
  eq(big.push.body, '525 of 1051 trained');
  ok(db.calls.filter(c => c.t === 'rpc:coach_week_stats').every(c => c.n <= 200), 'stats asked 200 ids at a time');
});

if (fail) console.log('server logs:\n  ' + LOGS.join('\n  '));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
