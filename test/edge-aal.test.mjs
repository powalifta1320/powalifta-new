// Two-factor in the edge functions (supabase/functions/_shared/aal.ts; sql/migration-mfa-aal2-2026-10-28.sql).
// Under Node, no Deno and no network: Deno.env / Deno.serve are stubbed, the supabase client and web-push are
// in-memory fakes (an Auth that knows a few tokens and users, a small PostgREST, Storage), and fetch answers for
// Resend, Lemon Squeezy and Gemini. Then the nine functions that act for a signed-in user run for real:
//   - an account with a verified authenticator and a token at aal1 / without aal / with unreadable claims gets
//     403 { code: 'aal2_required' } and NOTHING happens after Auth's check (no rate-limit bump, no read, no
//     email, no push, no deletion, no call to a model);
//   - at aal2, and for accounts without a verified factor (none, or an abandoned unverified one), each function
//     answers exactly as it does without the guard: same status, same body, same reads, writes and calls.
// The "without the guard" copy is the same source with the guard's line taken out (EDGE_BASELINE_DIR can point
// at another functions/ tree instead, e.g. the commit before the guard).
// Run: node test/edge-aal.test.mjs
import { registerHooks } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN = path.join(ROOT, 'supabase', 'functions');
const LOGS = [];
console.warn = (...a) => LOGS.push(a.join(' '));
console.error = (...a) => LOGS.push(a.join(' '));

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

// ---------------------------------------------------------------- the fakes
const FAKE_SUPABASE = `
function cell(r, c) { const m = /^(\\w+)->>(\\w+)$/.exec(c); return m ? (r[m[1]] || {})[m[2]] : r[c]; }
function term(r, s) {                       // col.eq.val
  const m = /^(\\w+)\\.eq\\.(.*)$/.exec(s); return !!m && String(r[m[1]]) === m[2];
}
function orMatch(r, expr) {                 // a,b  |  and(a,b),and(c,d)
  const parts = []; let depth = 0, cur = '';
  for (const ch of expr) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  if (cur) parts.push(cur);
  return parts.some((p) => p.startsWith('and(') ? p.slice(4, -1).split(',').every((s) => term(r, s)) : term(r, p));
}
class Q {
  constructor(W, t) { this.W = W; this.t = t; this.f = []; this.op = 'select'; this.lim = null; this.one = false; }
  select(cols, o) { if (this.op === 'select' && o && o.count) this.count = true; return this; }
  eq(c, v) { this.f.push((r) => cell(r, c) === v); return this; }
  gte(c, v) { this.f.push((r) => String(cell(r, c)) >= String(v)); return this; }
  in(c, vs) { this.f.push((r) => vs.includes(cell(r, c))); return this; }
  ilike(c, p) { const lit = String(p).replace(/\\\\([\\\\%_])/g, '$1').toLowerCase(); this.f.push((r) => String(cell(r, c) || '').toLowerCase() === lit); return this; }
  or(expr) { this.f.push((r) => orMatch(r, expr)); return this; }
  order() { return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  update(p) { this.op = 'update'; this.patch = p; return this; }
  insert(p) { this.op = 'insert'; this.patch = p; return this; }
  upsert(p) { this.op = 'upsert'; this.patch = p; return this; }
  delete() { this.op = 'delete'; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    this.W.effects.push('from:' + this.t + ':' + this.op);
    const rows = (this.W.db[this.t] || []).filter((r) => this.f.every((fn) => fn(r)));
    if (this.op !== 'select') { this.W.effects.push('write:' + this.t + ':' + JSON.stringify(this.patch || null)); return { data: null, error: null }; }
    if (this.count) return { data: null, count: rows.length, error: null };
    let list = this.lim ? rows.slice(0, this.lim) : rows;
    list = JSON.parse(JSON.stringify(list));
    if (this.one === 'single') return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not one row' } };
    if (this.one === 'maybe') return { data: list[0] || null, error: null };
    return { data: list, error: null };
  }
}
export function createClient(url, key, opts) {
  const W = globalThis.__W;
  const header = (opts && opts.global && opts.global.headers && opts.global.headers.Authorization) || '';
  return {
    auth: {
      async getUser(jwt) {
        W.effects.push('auth:getUser');
        const uid = W.tokens[jwt || String(header).replace(/^Bearer\\s+/i, '')];
        if (!uid) return { data: { user: null }, error: { message: 'invalid JWT', status: 401 } };
        return { data: { user: JSON.parse(JSON.stringify(W.users[uid])) }, error: null };
      },
      admin: { async deleteUser(uid) { W.effects.push('auth:deleteUser:' + uid); return { data: {}, error: null }; } },
    },
    async rpc(name, a) { W.effects.push('rpc:' + name + ':' + ((a && a.p_bucket) || '')); return { data: [{ allowed: true, cur: 1, limit_val: a && a.p_limit, reset_at: null }], error: null }; },
    from: (t) => new Q(W, t),
    storage: { from: (b) => ({
      async list(prefix) { W.effects.push('storage:list:' + b); return { data: (W.storage[b] || []).filter((n) => n.startsWith(prefix + '/')).map((n) => ({ name: n.slice(prefix.length + 1) })), error: null }; },
      async remove(paths) { W.effects.push('storage:remove:' + b + ':' + paths.length); return { data: [], error: null }; },
    }) },
  };
}`;
const FAKE_WEBPUSH = `
export default {
  setVapidDetails() {},
  async sendNotification(sub, body) { globalThis.__W.effects.push('webpush:' + sub.endpoint + ':' + JSON.parse(body).title); return { statusCode: 201 }; }
};`;
// apple-iap verifies Apple's signature with jose; a made-up transaction must fail that check, as it would live.
const FAKE_JOSE = `
export function decodeProtectedHeader() { throw new Error('Invalid Token or Protected Header formatting'); }
export async function importSPKI() { throw new Error('not used'); }
export async function compactVerify() { throw new Error('signature verification failed'); }`;
registerHooks({
  resolve(specifier, context, next) {
    if (/^(https:\/\/esm\.sh\/|npm:)@supabase\/supabase-js/.test(specifier)) return { url: 'data:text/javascript,' + encodeURIComponent(FAKE_SUPABASE), shortCircuit: true };
    if (/^npm:web-push/.test(specifier)) return { url: 'data:text/javascript,' + encodeURIComponent(FAKE_WEBPUSH), shortCircuit: true };
    if (/^npm:jose/.test(specifier)) return { url: 'data:text/javascript,' + encodeURIComponent(FAKE_JOSE), shortCircuit: true };
    return next(specifier, context);
  },
});
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', SUPABASE_ANON_KEY: 'test-anon',
  LEMON_SQUEEZY_API_KEY: 'test-ls', RESEND_API_KEY: 're_test', VAPID_PUBLIC_KEY: 'test-vapid-public', VAPID_PRIVATE_KEY: 'test-vapid-private',
  GEMINI_API_KEY: 'test-gemini',
};
// One clock for every run, so timings in a reply (program-read's ms) can't differ between two runs.
Date.now = () => Date.parse('2026-10-28T12:00:00Z');
globalThis.fetch = async (url, init) => {
  const u = new URL(String(url));
  globalThis.__W.effects.push('fetch:' + u.host + u.pathname + (init && init.body ? ':' + String(init.body).length : ''));
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.host === 'api.resend.com') return reply(200, { id: 'email_1' });
  if (u.host === 'api.lemonsqueezy.com') return reply(200, { data: { attributes: { urls: { customer_portal: 'https://powalifta.lemonsqueezy.com/billing/x' } } } });
  if (u.host === 'generativelanguage.googleapis.com') return reply(200, { candidates: [{ content: { parts: [{ text: '{"name":"Block","unit":"kg","weeks":1,"days":[{"name":"Day 1","exercises":[{"name":"Squat","cells":["3x5 @8"]}]}],"unsure":[]}' }] } }] });
  throw new Error('unexpected fetch ' + u.href);
};

// ---------------------------------------------------------------- the people and their tokens
const COACH = 'c0000000-0000-4000-8000-0000000000c1', LIFTER = 'a0000000-0000-4000-8000-0000000000a1';
const b64url = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const token = (sub, aal, extra) => b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url(Object.assign({ sub, role: 'authenticated', exp: 4102444800 }, aal ? { aal } : {}, extra || {})) + '.sig';
const TOK = {
  aal1: token(COACH, 'aal1'), aal2: token(COACH, 'aal2'), none: token(COACH, null),
  // claims Auth accepted but nobody can read (fails closed), and a name with accents (UTF-8 in the payload)
  garbled: b64url({ alg: 'HS256' }) + '.' + 'not*json*at*all' + '.sig',
  utf8: token(COACH, 'aal2', { user_metadata: { name: 'José Müller' } }),
  stranger: 'not-a-token-auth-knows',
};
const FACTORS = {
  verified: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'POWALIFTA' }],
  unverified: [{ id: 'f2', factor_type: 'totp', status: 'unverified' }],
  none: undefined,                         // GoTrue leaves the key out when the list is empty
};
function world(factors) {
  const user = { id: COACH, email: 'coach@example.com', aud: 'authenticated', role: 'authenticated' };
  if (factors) user.factors = factors;
  return {
    effects: [],
    tokens: { [TOK.aal1]: COACH, [TOK.aal2]: COACH, [TOK.none]: COACH, [TOK.garbled]: COACH, [TOK.utf8]: COACH },
    users: { [COACH]: user },
    db: {
      profiles: [
        { id: COACH, name: 'Coach Mia', email: 'coach@example.com', user_type: 'coach', coach_id: null, ls_subscription_id: 'sub_1', subscription_status: 'active', billing_provider: 'ls' },
        { id: LIFTER, name: 'Lee Lifter', email: 'lee@example.com', user_type: 'athlete', coach_id: COACH },
      ],
      invites: [{ code: 'ABCDEF', coach_id: COACH, email: 'new.lifter@example.com', used: false, created_at: '2026-10-28T08:00:00Z' }],
      messages: [{ id: 'm1', coach_id: COACH, athlete_id: LIFTER, meta: { type: 'voice', path: `${COACH}/${LIFTER}/${COACH}/v1.m4a` } }],
      push_subscriptions: [{ id: 's1', user_id: COACH, endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'k', auth: 'a', platform: 'web' }],
      email_preferences: [], club_buddies: [], club_members: [], feedback: [],
    },
    storage: { 'form-checks': [`${COACH}/1-squat.mp4`], avatars: [`${COACH}/avatar.png`] },
  };
}
const CALLS = {
  'delete-account': {},
  'ls-portal': {},
  'apple-iap': { signedTransaction: 'not-a-real-jws' },
  'send-invite': { athleteEmail: 'new.lifter@example.com' },
  'send-program-assigned': { athleteEmail: 'lee@example.com', athleteName: 'Lee', coachName: 'Mia', programName: 'Block 1' },
  'send-push': { toUserId: COACH, title: 'Test', body: 'Hello' },
  'program-read': { file: Buffer.from('a tiny picture').toString('base64'), mime: 'image/png' },
  'ai-chat': { role: 'coach', system: 'You help coaches.', messages: [{ role: 'user', content: 'Who is stalled?' }] },
  'send-feedback': { kind: 'problem', body: 'The Log set button did nothing on my second set.', context: { screen: 'Train', app: 'web', theme: 'dark' } },
};
const NAMES = Object.keys(CALLS);

// ---------------------------------------------------------------- load each function twice: with and without the guard
const handlers = { guarded: {}, baseline: {} };
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { globalThis.__served = h; } };
async function load(file) {
  globalThis.__served = null;
  await import(pathToFileURL(file).href);
  if (typeof globalThis.__served !== 'function') throw new Error('no Deno.serve handler in ' + file);
  return globalThis.__served;
}
const GUARD_LINE = /^[ \t]*if \((?:owesSecondFactor\(|caller\.owes2fa\)).*SECOND_FACTOR.*\n/m;
let baselineDir = process.env.EDGE_BASELINE_DIR ? path.resolve(process.env.EDGE_BASELINE_DIR) : null;
if (!baselineDir) {
  baselineDir = fs.mkdtempSync(path.join(os.tmpdir(), 'powa-aal-baseline-'));
  fs.cpSync(FN, baselineDir, { recursive: true });
  for (const n of NAMES) {
    const f = path.join(baselineDir, n, 'index.ts');
    const src = fs.readFileSync(f, 'utf8');
    const stripped = src.replace(GUARD_LINE, '');
    if (stripped === src || GUARD_LINE.test(stripped)) throw new Error(n + ': expected exactly one guard line');
    fs.writeFileSync(f, stripped);
  }
}
for (const n of NAMES) {
  handlers.guarded[n] = await load(path.join(FN, n, 'index.ts'));
  handlers.baseline[n] = await load(path.join(baselineDir, n, 'index.ts'));
}

async function call(kind, name, tok, factors) {
  globalThis.__W = world(factors);
  const req = new Request('https://example.supabase.co/functions/v1/' + name, {
    method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', apikey: 'test-anon' }, body: JSON.stringify(CALLS[name]),
  });
  const log = console.log;
  console.log = (...a) => LOGS.push(a.join(' '));   // the functions' own one-line logs
  let res;
  try { res = await handlers[kind][name](req); } finally { console.log = log; }
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, effects: globalThis.__W.effects, cors: res.headers.get('access-control-allow-origin') };
}

// ---------------------------------------------------------------- the shared check itself
const { owesSecondFactor, jwtAal, SECOND_FACTOR } = await import(pathToFileURL(path.join(FN, '_shared', 'aal.ts')).href);
await t('aal.ts: who owes the code', () => {
  const v = { factors: FACTORS.verified }, u = { factors: FACTORS.unverified };
  eq([owesSecondFactor(TOK.aal1, v), owesSecondFactor(TOK.none, v), owesSecondFactor(TOK.garbled, v), owesSecondFactor('', v)], [true, true, true, true], 'verified factor, not aal2');
  eq([owesSecondFactor(TOK.aal2, v), owesSecondFactor(TOK.utf8, v)], [false, false], 'verified factor, aal2');
  eq([owesSecondFactor(TOK.aal1, u), owesSecondFactor(TOK.aal1, {}), owesSecondFactor(TOK.aal1, null), owesSecondFactor(TOK.aal1, { factors: 'odd' })], [false, false, false, false], 'no verified factor');
  eq([jwtAal(TOK.aal1), jwtAal(TOK.aal2), jwtAal(TOK.none), jwtAal(TOK.garbled), jwtAal(TOK.utf8)], ['aal1', 'aal2', null, null, 'aal2']);
  ok(/not authenticated/i.test(SECOND_FACTOR.error) && SECOND_FACTOR.code === 'aal2_required', 'the refusal reads as a dead session to app.js _isAuthError');
});

// ---------------------------------------------------------------- every function, every case
for (const n of NAMES) {
  for (const [label, tok] of [['aal1 (password only)', TOK.aal1], ['no aal claim', TOK.none], ['claims nobody can read', TOK.garbled]]) {
    await t(`${n}: verified factor + ${label} -> 403, nothing done`, async () => {
      const r = await call('guarded', n, tok, FACTORS.verified);
      eq(r.status, 403, 'status');
      eq(r.body, SECOND_FACTOR, 'body');
      eq(r.effects, ['auth:getUser'], 'effects after Auth');
      eq(r.cors, '*', 'CORS header (the browser can read the refusal)');
    });
  }
  for (const [label, tok, f] of [['verified factor at aal2', TOK.aal2, FACTORS.verified], ['verified factor at aal2, accents in the claims', TOK.utf8, FACTORS.verified],
    ['no factor at aal1', TOK.aal1, FACTORS.none], ['no factor, no aal claim', TOK.none, FACTORS.none], ['unverified factor only at aal1', TOK.aal1, FACTORS.unverified],
    ['a token Auth refuses', TOK.stranger, FACTORS.verified]]) {
    await t(`${n}: ${label} -> same as without the guard`, async () => {
      const a = await call('guarded', n, tok, f);
      const b = await call('baseline', n, tok, f);
      eq(a.status, b.status, 'status');
      eq(a.body, b.body, 'body');
      eq(a.effects, b.effects, 'effects');
      if (tok !== TOK.stranger) ok(a.effects.length > 1, 'it went past Auth (' + a.status + ')');
    });
  }
  await t(`${n}: without the guard, a password alone gets through (the gap this closes)`, async () => {
    const b = await call('baseline', n, TOK.aal1, FACTORS.verified);
    ok(b.status !== 403 || !b.body || b.body.code !== 'aal2_required', 'baseline refused');
    ok(b.effects.length > 1, 'baseline did nothing');
  });
}
await t('delete-account: the gap was real, and is closed', async () => {
  const before = await call('baseline', 'delete-account', TOK.aal1, FACTORS.verified);
  ok(before.status === 200 && before.effects.includes('auth:deleteUser:' + COACH), 'without the guard the account is erased at aal1: ' + JSON.stringify(before.effects));
  const after = await call('guarded', 'delete-account', TOK.aal1, FACTORS.verified);
  ok(!after.effects.some((e) => /deleteUser|storage:remove/.test(e)), 'with the guard nothing is erased');
  const ok2 = await call('guarded', 'delete-account', TOK.aal2, FACTORS.verified);
  ok(ok2.status === 200 && ok2.effects.includes('auth:deleteUser:' + COACH), 'at aal2 the account is erased as asked');
});

console.log(`edge two-factor: ${pass} passed, ${fail} failed (${NAMES.length} functions x 10 cases + the shared check)` + (process.env.EDGE_BASELINE_DIR ? `; baseline ${baselineDir}` : ''));
if (fail && LOGS.length) console.log('function logs:\n  ' + LOGS.slice(-20).join('\n  '));
process.exit(fail ? 1 : 0);
