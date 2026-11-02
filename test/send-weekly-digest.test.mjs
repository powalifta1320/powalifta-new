// send-weekly-digest end to end under Node, no Deno and no network: Deno.env / Deno.serve are stubbed,
// the esm.sh supabase client and npm:web-push are swapped for in-memory fakes (a small PostgREST that
// caps a read at 1000 rows and refuses an .in() of more than 200 ids), and fetch records Resend and
// APNs calls. Then the real handler runs: the secret gate, the job by weekday, dry runs that write
// nothing, the coach report's push + email (mutes, opt-outs, a minted unsubscribe token, a 429 retried),
// missing tables and a missing migration, the Thursday push, paging, and the lifters' digest untouched.
// Run: node test/send-weekly-digest.test.mjs
import { registerHooks } from 'node:module';
import { world, rpcAnswer, rowsFor as worldRows } from './coach-report-fixture.mjs';
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
  update(row) { this.op = 'update'; this.row = row; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const db = this.db;
    db.calls.push({ t: this.t, op: this.op });
    if (db.missing.has(this.t)) return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public." + this.t + "' in the schema cache" } };
    const cols = this.cols === '*' ? [] : this.cols.split(',').map(s => s.trim());
    const gone = cols.map(c => c.split(':').pop()).find(c => (db.missingCols[this.t] || []).includes(c));
    if (gone) return { data: null, error: { code: '42703', message: 'column ' + this.t + '.' + gone + ' does not exist' } };
    if (this.inMax > 100) return { data: null, error: { message: 'URI too long: ' + this.inMax + ' ids' } };
    db.reads.push({ t: this.t, cols: this.cols, ids: this.inMax, range: this.rng });
    if (db.onRead) db.onRead(this.t, this.rng, db);   // a test changes the table between pages
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
    if (this.op === 'update') {
      list.forEach(r => Object.assign(r, this.row));
      db.writes.push({ t: this.t, op: 'update', row: this.row, n: list.length });
      return { data: list.map(r => cols.length ? Object.fromEntries(cols.map(c => [c, r[c] === undefined ? null : r[c]])) : Object.assign({}, r)), error: null };
    }
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
    // alias:column, and the computed fields programs_planned and programs_weeks_left (sql/migration-data-scale-2026-10-28.sql,
    // sql/migration-coach-report-v2-2026-11-02.sql), worked out as the SQL functions do (PGlite-tested against coach-report.js).
    const CR = globalThis.CoachReport;
    const field = (r, c) => (this.t === 'programs' && c === 'programs_planned' ? CR.plannedPerWeek(r.weeks) : this.t === 'programs' && c === 'programs_weeks_left' ? CR.weeksLeft(r.weeks) : r[c]);
    const proj = r => cols.length ? Object.fromEntries(cols.map(c => { const [a, b] = c.includes(':') ? c.split(':') : [c, c]; const v = field(r, b); return [a, v === undefined ? null : v]; })) : Object.assign({}, r);
    if (this.one) return { data: list[0] ? proj(list[0]) : null, error: null };
    return { data: list.map(proj), error: null };
  }
}
// The RPCs answer as the SQL does (test/coach-report-fixture.mjs rpcAnswer: PGlite-tested in coach-report-sql.test.mjs).
export function createClient() {
  const db = globalThis.__DB;
  return {
    from: (t) => new Q(db, t),
    rpc: async (name, p) => {
      db.calls.push({ t: 'rpc:' + name, op: 'rpc', n: (p.p_athletes || []).length, p });
      if ((name === 'coach_week_stats' && db.noStats) || (db.missingFns && db.missingFns.has(name)))
        return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + name + ' in the schema cache' } };
      if ((p.p_athletes || []).length > 100) return { data: null, error: { message: 'too many ids' } };
      try { return { data: globalThis.__RPC(db, name, p), error: null }; } catch (e) { return { data: null, error: { message: e.message } }; }
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
globalThis.__RPC = (db, name, p) => {
  if (db.failBefore && name === 'coach_week_stats' && p.p_from === db.failBefore) throw new Error('canceling statement due to statement timeout');
  const rows = rpcAnswer(globalThis.CoachReport, db.tables, name, p);
  // Before the v2 migration, coach_week_stats has no recent / prior.
  if (name === 'coach_week_stats' && db.oldStats) rows.forEach(r => Object.values(r.lifts).forEach(x => { delete x.recent; delete x.prior; }));
  return rows;
};
await import('../supabase/functions/send-weekly-digest/index.ts');
ok(typeof handler === 'function', 'Deno.serve got a handler');

// ---------------------------------------------------------------- the data
const block = (perWeek, doneWeeks) => Array.from({ length: 4 }, (_, wi) => ({ days: Array.from({ length: perWeek }, () => ({ exercises: [{ lift: 'squat', sets: [{ completed: wi < doneWeeks }] }] })) }));
function freshDB() {
  const db = { tables: {}, calls: [], writes: [], reads: [], missing: new Set(), missingCols: {}, noStats: false };
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
  ok(mia.text.includes('- Autumn Open, Sat 7 Nov (in 12 days)\n  Arjun Mehta\n'), 'the meet');
  eq(db.writes, [], 'no writes in a dry run');
  eq([SENT.length, globalThis.__PUSH.length], [0, 0], 'nothing sent');
  ok(r.json.digest && r.json.digest.dryRun === true && r.json.digest.preview.length === 1, 'the lifters\' digest dry run as before');
});
await t('Monday for real: pushes to /coach.html?report=week (and the week), emails with a one-click unsubscribe', async () => {
  const db = reset();
  const r = await call({ today: '2026-10-26' });
  const cr = r.json['coach-report'];
  eq([cr.emails, cr.pushes, cr.failed, cr.quiet], [2, 2, 0, 1]);
  const pushes = globalThis.__PUSH.map(p => [p.endpoint.split('/').pop(), p.payload.url, p.payload.tag]);
  eq(pushes.sort(), [['c1', '/coach.html?report=week&w=2026-10-19', 'powa-report'], ['c2', '/coach.html?report=week&w=2026-10-19', 'powa-report'], ['gone-c1', '/coach.html?report=week&w=2026-10-19', 'powa-report']].sort(),
    'the report in the app, the week it covers (an older app matches report=week)');
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
await t('a coach with 1,050 lifters: every one read (pages of 1000, ids in 100s)', async () => {
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
  ok(db.calls.filter(c => c.t === 'rpc:coach_week_stats').every(c => c.n <= 100), 'stats asked 100 ids at a time');
  ok(db.reads.every(r => r.ids <= 100), 'every read 100 ids at most');
});

// ---------------------------------------------------------------- the programs, lean
await t('programs: only who, when and the planned sessions (programs_planned); before the migration, the JSON 25 lifters a read, same report', async () => {
  let db = reset();
  const lean = await call({ today: '2026-10-26', job: 'coach-report', dryRun: true });
  const progReads = db.reads.filter(r => r.t === 'programs');
  ok(progReads.length && progReads.every(r => !/(^|,\s*)weeks(\s*,|$)/.test(r.cols) && /planned:programs_planned/.test(r.cols) && /weeks_left:programs_weeks_left/.test(r.cols)), 'no JSON: ' + JSON.stringify(progReads.map(r => r.cols)));
  db = reset();
  db.missingCols.programs = ['programs_planned'];   // before sql/migration-data-scale-2026-10-28.sql
  const old = await call({ today: '2026-10-26', job: 'coach-report', dryRun: true });
  const jsonReads = db.reads.filter(r => r.t === 'programs' && /(^|,\s*)weeks(\s*,|$)/.test(r.cols));
  ok(jsonReads.length && jsonReads.every(r => r.ids <= 25), 'the JSON read 25 lifters at a time');
  eq(old.json['coach-report'], lean.json['coach-report'], 'the same report either way');
  db = reset(); db.missingCols.programs = ['programs_planned'];
  const thu = await call({ today: '2026-10-29', dryRun: true });
  eq([thu.json.midweek.pushes, thu.json.midweek.preview.length], [0, 2], 'Thursday the same without it');
});

// ---------------------------------------------------------------- v2: the report with more of what a coach decides on (2 Nov)
// The world of test/coach-report-fixture.mjs, Monday 2 Nov: Sam Ellis and the demo team (20), Mia (3, lbs), Big Barbell
// (60), Dan (5, no billing or meets) and a dormant coach. The server's reads must give coach-report.js exactly what the
// fixture's rows give it (the core's own tests check what that says).
const WD = world();
const resetWorld = () => {
  const db = { tables: JSON.parse(JSON.stringify(WD.tables)), calls: [], writes: [], reads: [], missing: new Set(), missingCols: {}, noStats: false };
  db.tables.push_subscriptions = ['c-sam', 'c-mia', 'c-big', 'c-dan', 'c-quiet'].map((c, i) => ({ id: 'ps' + i, user_id: c, platform: 'web', endpoint: 'https://fcm.googleapis.com/fcm/send/' + c, p256dh: 'k', auth: 'a' }));
  db.missing.add('schedule_requests');
  globalThis.__DB = db; globalThis.__PUSH = []; SENT.length = 0; resendScript = [];
  return db;
};
const withNow = async (ms, fn) => { const real = Date.now; Date.now = () => ms; try { return await fn(); } finally { Date.now = real; } };
const CR2 = globalThis.CoachReport;
const W2 = CR2.lastWeek(WD.today);
const coreMail = (c, unit) => {
  const name = WD.tables.profiles.find(p => p.id === c).name;
  const team = CR2.teamWeek(CR2.fromRows(worldRows(CR2, WD.tables, c, W2), { coachId: c, today: WD.today, now: WD.now }), Object.assign({ now: WD.now, unit: unit || 'kg' }, W2));
  const pref = WD.tables.email_preferences.find(p => p.user_id === c);
  return CR2.reportEmail(team, { coachName: name, unsubUrl: 'https://powalifta.com/unsubscribe.html?token=token-made-at-send&r=coach', appUrl: 'https://www.powalifta.com/coach.html', unit: unit || 'kg', schedule: CR2.scheduleOf(pref) });
};
await t('v2, Monday dry run over five coaches: 20, 3 and 60 lifters, one with no billing or meets, one dormant', async () => {
  resetWorld();
  const r = await withNow(WD.now, () => call({ today: WD.today, job: 'coach-report', dryRun: true }));
  const cr = r.json['coach-report'];
  eq([cr.coaches, cr.quiet, cr.failed, cr.preview.length], [5, 1, 0, 4], 'the dormant team gets nothing');
  const by = Object.fromEntries(cr.preview.map(p => [p.coach, p]));
  eq(Object.keys(by).sort(), ['c-big', 'c-dan', 'c-mia', 'c-sam']);
  [['c-sam'], ['c-mia', 'lbs'], ['c-big'], ['c-dan']].forEach(([c, unit]) => {
    const want = coreMail(c, unit);
    eq(by[c].subject, want.subject, c + ' subject');
    eq(by[c].text, want.text, c + ' text: the server read what the fixture holds');
  });
  eq(by['c-sam'].push, { title: 'Your team’s week', body: '18 of 20 trained · 3 PRs · 3 behind' }, 'the push stays short');
  const sam = by['c-sam'].text;
  ['54 of 64 sessions (5 more than the week before)', 'Wrote you: Arjun Mehta (2 days), Mei Tanaka (2 days), Kofi Mensah (1 day)', 'Ran hot: Marcus Doyle, Leo Grant, Ines Duarte',
    '- 15 of 17 lifters stronger', '- 84% at or under', '  Elena Rossi: 58.4 kg for the 57 kg, 1.4 over', '- Block finished: Callum Ward', '- 2 due this week: $420',
    '- 2 applications waiting', '- Seats: 22 of 25 used (20 lifters, 2 open invites)', '- Hannah Berg: no sessions · No block'].forEach(line => ok(sam.includes(line), 'Sam\'s report says: ' + line));
  ok(by['c-big'].text.includes('- and 35 more in the app'), 'the 60-lifter report stays short');
  ok(!by['c-dan'].text.includes('Meets (') && !by['c-dan'].text.includes('overdue'), 'no billing, no meets: those parts left out');
  ok(/lbs/.test(by['c-mia'].text) && by['c-mia'].text.includes('- Seats: 3 of 3 used: full'), 'Mia in lbs, her plan full');
});
await t('v2 reads stay lean: no raw sets or messages, 100 lifters a call, the week before as one more stats call', async () => {
  const db = resetWorld();
  await withNow(WD.now, () => call({ today: WD.today, job: 'coach-report', dryRun: true }));
  ok(!db.reads.some(r => r.t === 'workout_logs' || r.t === 'messages'), 'never a set or a message row: ' + [...new Set(db.reads.map(r => r.t))].join(','));
  const rpc = db.calls.filter(c => c.op === 'rpc');
  eq([...new Set(rpc.map(c => c.t))].sort(), ['rpc:coach_threads_last', 'rpc:coach_week_effort', 'rpc:coach_week_stats']);
  eq(rpc.filter(c => c.t === 'rpc:coach_week_stats').map(c => c.p.p_from), ['2026-10-26', '2026-10-19'], 'last week, then the week before');
  ok(rpc.every(c => c.n <= 100) && db.reads.every(r => r.ids <= 100), '100 ids at most');
  const notes = db.reads.filter(r => r.t === 'session_notes'), bw = db.reads.filter(r => r.t === 'bodyweight');
  const meetLifters = new Set(WD.tables.meets.filter(m => m.meet_date >= WD.today && m.meet_date <= CR2.addDays(WD.today, 56)).map(m => m.athlete_id)).size;
  ok(notes.length && bw.length === 1 && bw[0].ids === meetLifters && meetLifters < 20, 'weigh-ins only for the ' + meetLifters + ' lifters with a meet coming: ' + JSON.stringify(bw.map(r => r.ids)));
});
await t('v2 before its migration: the report still goes, without the parts it adds, the blocks read as JSON', async () => {
  const db = resetWorld();
  db.missingFns = new Set(['coach_week_effort', 'coach_threads_last']); db.oldStats = true; db.missingCols.programs = ['programs_weeks_left'];
  const r = await withNow(WD.now, () => call({ today: WD.today, job: 'coach-report', dryRun: true }));
  const cr = r.json['coach-report'];
  eq([cr.failed, cr.preview.length], [0, 4]);
  const sam = cr.preview.find(p => p.coach === 'c-sam').text;
  ok(!sam.includes('Strength (') && !sam.includes('Effort (') && !sam.includes('Ran hot') && !sam.includes('No lift up'), 'no strength or effort');
  ok(sam.includes('- Wrote you: Mei Tanaka (2 days)\n'), 'their notes still (a table, not the migration); their messages left out');
  ok(sam.includes('- Block finished: Callum Ward'), 'the blocks to write, from the JSON');
  ok(sam.includes('(5 more than the week before)') && sam.includes('- Pain reported: Priya Shah (2 times), Sarah Kim'), 'the rest as before');
  ok(db.reads.some(r => r.t === 'programs' && /(^|,\s*)weeks(\s*,|$)/.test(r.cols) && r.ids <= 25), 'the JSON, 25 lifters a read');
  ok(LOGS.some(l => /coach_week_effort left out/.test(l)) && LOGS.some(l => /coach_threads_last left out/.test(l)), 'it says what it left out');
});
await t('v2: the week before can fail on its own; the report goes without the comparison', async () => {
  const db = resetWorld(); db.failBefore = '2026-10-19';
  const r = await withNow(WD.now, () => call({ today: WD.today, job: 'coach-report', dryRun: true }));
  const sam = r.json['coach-report'].preview.find(p => p.coach === 'c-sam').text;
  ok(sam.startsWith('Your team’s week · 26 Oct – 1 Nov\n\n18 of 20 trained · 54 of 64 sessions · 3 PRs'), sam.slice(0, 120));
});
await t('v2 for real: no message, note or body part reaches an email, its text, its subject or a push', async () => {
  resetWorld();
  const r = await withNow(WD.now, () => call({ today: WD.today, job: 'coach-report' }));
  eq([r.json['coach-report'].emails, r.json['coach-report'].pushes, r.json['coach-report'].failed], [4, 4, 0]);
  const all = SENT.map(m => [m.subject, m.html, m.text].join(' ')).join(' ') + JSON.stringify(globalThis.__PUSH);
  WD.tables.messages.concat(WD.tables.session_notes).forEach(m => { const w = String(m.body || m.note || '').trim(); if (w) ok(!all.includes(w), 'quoted: ' + w); });
  ['knee', 'low back', 'low_back', 'elbow', 'hip', 'shoulder', 'sore'].forEach(p => ok(!new RegExp('\\b' + p + '\\b', 'i').test(all), 'names ' + p));
  const sam = SENT.find(m => m.to[0] === 'sam@coach.test');
  ok(sam && sam.html.includes('>Every lifter') && (sam.html.match(/background:#ff3b4a/g) || []).length === 1, 'Sam\'s email, one red');
});
await t('v2 leaves Thursday as it was: the same reads, the same pushes', async () => {
  const db = resetWorld();
  const r = await withNow(Date.parse('2026-11-05T14:00:00Z'), () => call({ today: '2026-11-05', dryRun: true }));
  eq(r.json.jobs, ['midweek']);
  const prog = db.reads.filter(x => x.t === 'programs');
  ok(prog.length && prog.every(x => x.cols === 'id, athlete_id, coach_id, updated_at, planned:programs_planned'), 'Thursday\'s programs read: ' + JSON.stringify(prog.map(x => x.cols)));
  eq([...new Set(db.calls.filter(c => c.op === 'rpc').map(c => c.t))], ['rpc:coach_week_stats'], 'no v2 calls on Thursday');
  ok(!db.reads.some(x => ['session_notes', 'bodyweight', 'coach_applications', 'invites', 'meets', 'client_billing'].includes(x.t)), 'none of the Monday reads');
  ok(r.json.midweek.failed === 0 && r.json.midweek.preview.length >= 1, 'pushes as before: ' + JSON.stringify(r.json.midweek.preview.map(p => p.push.title)));
});

// ---------------------------------------------------------------- each coach's own time (the owner's poll, 2 Nov: "Their pick, Sunday 6 pm default")
// The world's coaches pick: Sam Sunday 18:00 in New York (the Sunday clocks go back), Mia Monday 07:00 in Sydney, Big
// Barbell Sunday 18:00 in Kolkata (+5:30), Dan no zone (UTC, the default 18:00), the dormant coach the default.
const SCHED = { 'c-sam': { report_day: 'sun', report_hour: 18, tz: 'America/New_York' }, 'c-mia': { report_day: 'mon', report_hour: 7, tz: 'Australia/Sydney' },
  'c-big': { report_day: 'sun', report_hour: 18, tz: 'Asia/Kolkata' }, 'c-dan': { report_day: 'sun', report_hour: 18, tz: null }, 'c-quiet': { report_day: 'sun', report_hour: 18, tz: null } };
const resetPicks = () => { const db = resetWorld(); db.tables.email_preferences.forEach(p => Object.assign(p, SCHED[p.user_id] || {}, { report_sent_week: null })); return db; };
const hourly = (iso, body) => withNow(Date.parse(iso), () => call(body || {}));
const H = (h, day) => new Date(Date.parse((day || '2026-11-01') + 'T00:00:00Z') + h * 3600000).toISOString();
await t('hourly: nobody due is two small reads (the coaches, their picks) and nothing else', async () => {
  const db = resetPicks();
  const r = await hourly('2026-11-01T12:00:00Z');
  eq(r.json.jobs, ['coach-report']);
  eq([r.json['coach-report'].coaches, r.json['coach-report'].due, r.json['coach-report'].emails], [5, 0, 0]);
  eq(db.reads.map(x => x.t + ':' + x.cols), ['profiles:id', 'email_preferences:user_id, weekly_digest, unsub_token, push_alerts, report_day, report_hour, tz, report_sent_week']);
  eq([db.calls.filter(c => c.op === 'rpc').length, db.writes.length, SENT.length, globalThis.__PUSH.length], [0, 0, 0, 0]);
});
await t('hourly over Sunday 1 Nov and Monday 2 Nov: each coach once, at their own hour where they are, the week their pick gives', async () => {
  const db = resetPicks();
  const got = {}, weeks = {};
  for (let h = 0; h < 48; h++) {
    const iso = H(h), r = await hourly(iso);
    if (r.status !== 200 || r.json['coach-report'].failed) throw new Error(iso + ' ' + JSON.stringify(r.json));
    SENT.splice(0).forEach(m => { const c = WD.tables.profiles.find(p => p.email === m.to[0]); (got[c.id] = got[c.id] || []).push(iso.slice(0, 13)); weeks[c.id] = m.text.split('\n')[0]; });
    if (iso === '2026-11-02T14:00:00.000Z') eq(r.json.jobs, ['digest', 'coach-report'], 'the lifters\' digest: Monday 14:00 UTC, as before');
    else if (r.json.jobs.includes('digest')) throw new Error('the digest at ' + iso);
  }
  eq(got, { 'c-big': ['2026-11-01T13'], 'c-dan': ['2026-11-01T18'], 'c-mia': ['2026-11-01T20'], 'c-sam': ['2026-11-01T23'] },
    'Kolkata 18:30, UTC 18:00, Sydney Monday 07:00, New York 18:00 (EST that day)');
  eq(weeks, { 'c-big': 'Your team’s week · This week, 26 Oct – 1 Nov', 'c-dan': 'Your team’s week · This week, 26 Oct – 1 Nov', 'c-mia': 'Your team’s week · 26 Oct – 1 Nov', 'c-sam': 'Your team’s week · This week, 26 Oct – 1 Nov' },
    'Sunday\'s report: this week; Monday\'s: the week that ended yesterday');
  const sent = Object.fromEntries(db.tables.email_preferences.filter(p => SCHED[p.user_id]).map(p => [p.user_id, p.report_sent_week]));
  eq(sent, { 'c-sam': '2026-10-26', 'c-mia': '2026-10-26', 'c-big': '2026-10-26', 'c-dan': '2026-10-26', 'c-quiet': '2026-10-26' }, 'every week marked, the dormant team too (nothing to send)');
  eq(globalThis.__PUSH.filter(x => x.payload.tag === 'powa-report').map(x => x.endpoint.split('/').pop()).sort(), ['c-big', 'c-dan', 'c-mia', 'c-sam'], 'one push each, with the email');
  ok(globalThis.__PUSH.every(x => x.payload.url === '/coach.html?report=week&w=2026-10-26'), 'the push opens that week');
});
await t('hourly: a missed hour catches up later that day; a dry run sends and marks nothing; Thursday\'s push stays at 14:00 UTC', async () => {
  const db = resetPicks();
  const dry = await hourly('2026-11-01T21:00:00Z', { dryRun: true });
  eq(dry.json['coach-report'].preview.map(p => [p.coach, p.week]), [['c-dan', '2026-10-26'], ['c-mia', '2026-10-26']],
    'Dan three hours after his 18:00, Mia an hour after her Monday 07:00 in Sydney (the runs before didn\'t happen); Big\'s Sunday has ended in Kolkata');
  ok(db.writes.length === 0 && SENT.length === 0, 'a dry run writes and sends nothing');
  ok(dry.json['coach-report'].preview[0].text.includes('Sent to Dan on Sundays at 6 pm. Change it in Settings, Notifications.'), 'the footer says when it comes');
  const real = await hourly('2026-11-01T21:00:00Z');
  eq([real.json['coach-report'].emails, db.tables.email_preferences.find(p => p.user_id === 'c-dan').report_sent_week], [2, '2026-10-26']);
  eq((await hourly('2026-11-01T22:00:00Z')).json['coach-report'].due, 0, 'never twice');
  eq((await hourly('2026-11-05T14:00:00Z')).json.jobs, ['midweek', 'coach-report']);
  eq((await hourly('2026-11-05T15:00:00Z')).json.jobs, ['coach-report']);
});
await t('hourly: an email that fails sends nothing and marks nothing; the next hour sends both, once', async () => {
  const db = resetPicks();
  db.tables.email_preferences.forEach(p => { if (p.user_id !== 'c-dan') p.report_sent_week = '2026-10-26'; });   // only Dan to send
  resendScript = [500];
  const a = await hourly('2026-11-01T18:00:00Z');
  eq([a.json['coach-report'].failed, a.json['coach-report'].emails, globalThis.__PUSH.filter(x => x.endpoint.endsWith('/c-dan')).length], [1, 0, 0], 'no push without the email');
  eq(db.tables.email_preferences.find(p => p.user_id === 'c-dan').report_sent_week, null);
  const b = await hourly('2026-11-01T19:00:00Z');
  eq([b.json['coach-report'].emails, globalThis.__PUSH.filter(x => x.endpoint.endsWith('/c-dan')).length], [1, 1]);
  eq((await hourly('2026-11-01T20:00:00Z')).json['coach-report'].emails, 0, 'and not again');
});
await t('by hand: a job by name is every coach, each with the week their pick gives that day, and marks it; dueOnly only those due', async () => {
  let db = resetPicks();
  const r = await hourly('2026-11-01T09:00:00Z', { job: 'coach-report', today: '2026-11-01', dryRun: true });
  eq(r.json['coach-report'].preview.map(p => [p.coach, p.week]).sort(), [['c-big', '2026-10-26'], ['c-dan', '2026-10-26'], ['c-mia', '2026-10-19'], ['c-sam', '2026-10-26']],
    'on a Sunday: Sunday coaches this week, Mia (Monday) the week before');
  db = resetPicks();
  await hourly('2026-11-01T09:00:00Z', { job: 'coach-report', today: '2026-11-01' });
  eq(db.tables.email_preferences.find(p => p.user_id === 'c-big').report_sent_week, '2026-10-26', 'marked');
  eq((await hourly('2026-11-01T13:00:00Z')).json['coach-report'].due, 0, 'so the hourly job doesn\'t send Big\'s week again');
  db = resetPicks();
  eq((await hourly('2026-11-01T09:00:00Z', { job: 'coach-report', dueOnly: true, dryRun: true })).json['coach-report'].due, 0, 'dueOnly: nobody yet');
});
await t('before the schedule\'s migration: the hourly job keeps every coach\'s report on Mondays at 14:00 UTC, last week, and marks nothing', async () => {
  const db = resetPicks();
  db.missingCols.email_preferences = ['report_day'];
  for (const iso of ['2026-11-01T13:00:00Z', '2026-11-01T23:00:00Z', '2026-11-02T13:00:00Z']) eq((await hourly(iso)).json['coach-report'].due, 0, iso);
  const r = await hourly('2026-11-02T14:00:00Z');
  eq([r.json['coach-report'].due, r.json['coach-report'].emails], [5, 4]);
  ok(SENT.every(m => m.text.startsWith('Your team’s week · 26 Oct – 1 Nov') && m.text.includes('Sent to') && m.text.includes('on Mondays. Change it')), 'last week, "Mondays"');
  ok(!db.writes.some(w => w.t === 'email_preferences' && w.op === 'update'), 'no week marked (no column to hold it)');
  eq((await hourly('2026-11-02T15:00:00Z')).json['coach-report'].due, 0, 'and only at 14:00');
});

// ---------------------------------------------------------------- the lifters' digest, paged
await t('the lifters\' digest: 1,200 opted-in lifters and 1,500 sets one week, all of them read (ids 100 a read, pages of 1000)', async () => {
  const db = reset();
  for (let i = 0; i < 1200; i++) {
    const id = 'dg-' + String(i).padStart(4, '0');
    db.tables.profiles.push({ id, name: 'Digest ' + i, user_type: 'athlete', coach_id: null, email: id + '@example.com', unit: 'kg' });
    db.tables.email_preferences.push({ user_id: id, weekly_digest: true, unsub_token: 'tok-' + id });
    if (i % 100 === 0) db.tables.workout_logs.push({ id: 'dl' + i, athlete_id: id, date: '2026-10-22', lift: 'squat', e1rm_comp: 150, weight: 120, reps: 3 });
  }
  for (let k = 0; k < 1500; k++) db.tables.workout_logs.push({ id: 'big' + String(k).padStart(5, '0'), athlete_id: 'dg-0000', date: '2026-10-2' + (k % 5), lift: 'bench', e1rm_comp: 100 + (k % 40), weight: 80, reps: 5 });
  for (let k = 0; k < 1100; k++) db.tables.bodyweight = (db.tables.bodyweight || []).concat([{ id: 'bw' + k, athlete_id: 'dg-0001', date: '2026-' + String(8 + Math.floor(k / 400)).padStart(2, '0') + '-01', weight: 80 }]);
  const r = await call({ today: '2026-10-26', job: 'digest', dryRun: true });
  const d = r.json.digest;
  eq(d.audience, 1201, 'every opted-in lifter with an email (Arjun + 1,200)');
  const big = d.preview.find(p => p.email === 'dg-0000@example.com');
  eq(big && big.sets, 1501, 'all 1,501 sets of the week (the read used to stop at 1000 rows)');
  eq(d.preview.length, 13, 'everyone who trained: Arjun + 12');
  ok(db.reads.every(x => x.ids <= 100), 'every read 100 ids at most');
  ok(db.reads.filter(x => x.t === 'email_preferences').length >= 2, 'the preferences paged');
});

// A set deleted or logged while the 1,500-set read is between pages (Monday 14:00 UTC is a busy hour).
for (const [what, change, want] of [
  ['deleted', (db) => { db.tables.workout_logs = db.tables.workout_logs.filter(l => l.id !== 'big00010'); }, 1501],
  ['logged', (db) => { db.tables.workout_logs.push({ id: 'big00005a', athlete_id: 'dg-0000', date: '2026-10-23', lift: 'bench', e1rm_comp: 101, weight: 80, reps: 5 }); }, 1501],
]) {
  await t('the lifters\' digest: a set ' + what + ' between two pages of a read neither comes twice nor pushes another set out', async () => {
    const db = reset();
    for (let i = 0; i < 3; i++) {
      const id = 'dg-' + String(i).padStart(4, '0');
      db.tables.profiles.push({ id, name: 'Digest ' + i, user_type: 'athlete', coach_id: null, email: id + '@example.com', unit: 'kg' });
      db.tables.email_preferences.push({ user_id: id, weekly_digest: true, unsub_token: 'tok-' + id });
    }
    db.tables.workout_logs.push({ id: 'dl0', athlete_id: 'dg-0000', date: '2026-10-22', lift: 'squat', e1rm_comp: 150, weight: 120, reps: 3 });
    for (let k = 0; k < 1500; k++) db.tables.workout_logs.push({ id: 'big' + String(k).padStart(5, '0'), athlete_id: 'dg-0000', date: '2026-10-2' + (k % 5), lift: 'bench', e1rm_comp: 100 + (k % 40), weight: 80, reps: 5 });
    let done = false;
    db.onRead = (tb, rng) => { if (tb === 'workout_logs' && rng && rng[0] > 0 && !done) { done = true; change(db); } };
    const r = await call({ today: '2026-10-26', job: 'digest', dryRun: true });
    ok(done, 'the read went past one page');
    const big = r.json.digest.preview.find(p => p.email === 'dg-0000@example.com');
    eq(big && big.sets, want, 'every set the read started with, once (a set ' + what + ' mid-read)');
  });
}

if (fail) console.log('server logs:\n  ' + LOGS.join('\n  '));
console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
