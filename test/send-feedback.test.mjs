// send-feedback (supabase/functions/send-feedback) end to end under Node, no Deno and no network: Deno.env / Deno.serve
// are stubbed, the esm.sh supabase client is an in-memory fake (Auth that knows a few tokens and users, the admin API's
// getUserById, a small PostgREST with count, and the table's guard: the 20-a-day cap, which test/feedback-sql.test.mjs
// proves in PGlite), and fetch records Resend. Then the real handler runs: CORS, the method, the token (never the body)
// for who sent it, two-factor, every check on the kind, the words and the details (allow-listed, scrubbed, 8 KB), the
// cap counted with the service role, the row as saved, the email to every admin (subject, escaping, reply-to, the
// details), an email that fails or can't be sent (still 200, the row saved), no table yet (503), the guard's cap (429).
// And the app's details (feedback.js) against the server's: the same keys, the same scrubbing.
// Run: node test/send-feedback.test.mjs
import { registerHooks } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGS = [];
console.warn = (...a) => LOGS.push(a.join(' '));
console.error = (...a) => LOGS.push(a.join(' '));
console.log = ((log) => (...a) => { if (String(a[0] || '').startsWith('send-feedback:')) LOGS.push(a.join(' ')); else log(...a); })(console.log);

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.info('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

const SARAH = 'a0000000-0000-4000-8000-0000000000a1', SAM = 'c0000000-0000-4000-8000-0000000000c1', OWNER = 'd0000000-0000-4000-8000-0000000000d1',
  OWNER2 = 'd0000000-0000-4000-8000-0000000000d2';
const FAKE_SUPABASE = `
class Q {
  constructor(W, t) { this.W = W; this.t = t; this.f = []; this.op = 'select'; this.one = null; this.lim = null; this.count = false; }
  select(cols, opts) { if (this.op === 'select' && opts && opts.count) this.count = true; this.ret = cols; return this; }
  eq(c, v) { this.f.push(r => r[c] === v); return this; }
  gte(c, v) { this.f.push(r => String(r[c]) >= String(v)); return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }
  single() { this.one = 'single'; return this; }
  insert(row) { this.op = 'insert'; this.row = row; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const W = globalThis.__W;
    W.calls.push('from:' + this.t + ':' + this.op + (this.count ? ':count' : ''));
    if (W.missing && W.missing.includes(this.t)) return { data: null, count: null, error: { code: 'PGRST205', message: "Could not find the table 'public." + this.t + "' in the schema cache" } };
    const rows = W.tables[this.t] || (W.tables[this.t] = []);
    if (this.op === 'insert') {
      if (this.t === 'feedback') {
        const recent = rows.filter(r => r.user_id === this.row.user_id && r.created_at > new Date(Date.now() - 864e5).toISOString()).length;
        if (recent >= 20) return { data: null, error: { code: 'P0001', message: 'feedback_cap: 20 in 24 hours' } };
        if (W.insertFails) return { data: null, error: { code: '23514', message: 'new row violates check constraint' } };
      }
      const r = Object.assign({ id: 'fb-' + (rows.length + 1), created_at: new Date().toISOString(), status: 'new' }, JSON.parse(JSON.stringify(this.row)));
      rows.push(r);
      return { data: this.one ? { id: r.id, created_at: r.created_at } : [r], error: null };
    }
    let out = rows.filter(r => this.f.every(fn => fn(r)));
    if (this.count) return { data: null, count: out.length + (W.countOffset || 0), error: null };
    if (this.lim) out = out.slice(0, this.lim);
    out = JSON.parse(JSON.stringify(out));
    if (this.one === 'maybe') return { data: out[0] || null, error: null };
    if (this.one === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { code: 'PGRST116' } };
    return { data: out, error: null };
  }
}
export function createClient() {
  const W = globalThis.__W;
  return {
    auth: {
      async getUser(jwt) { W.calls.push('auth:getUser'); const uid = W.tokens[jwt]; return uid ? { data: { user: JSON.parse(JSON.stringify(W.users[uid])) }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }; },
      admin: { async getUserById(id) { W.calls.push('auth:getUserById'); if (W.adminApiDown) throw new Error('down'); const u = W.users[id]; return u ? { data: { user: { id, email: u.email } }, error: null } : { data: { user: null }, error: { message: 'not found' } }; } },
    },
    from: (t) => new Q(W, t),
  };
}`;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) return { url: 'data:text/javascript,' + encodeURIComponent(FAKE_SUPABASE), shortCircuit: true };
    return next(specifier, context);
  }
});
const ENV = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service-role', RESEND_API_KEY: 're_test_key' };
let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };
const SENT = [];
let resendStatus = 200, resendThrows = false;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    if (resendThrows) throw new Error('network down');
    SENT.push(JSON.parse(init.body)); return new Response(resendStatus === 200 ? '{"id":"em"}' : 'nope', { status: resendStatus });
  }
  throw new Error('unexpected fetch ' + url);
};
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (sub, aal) => b64url({ alg: 'HS256' }) + '.' + b64url({ sub, role: 'authenticated', aal: aal || 'aal1' }) + '.sig';
const TOK = { sarah: tok(SARAH), sam: tok(SAM), sarah2fa1: tok(SARAH, 'aal1'), sarah2fa2: tok(SARAH, 'aal2') };
function world(o) {
  o = o || {};
  const W = {
    calls: [], tokens: { [TOK.sarah]: SARAH, [TOK.sam]: SAM, [TOK.sarah2fa1]: SARAH, [TOK.sarah2fa2]: SARAH },
    users: {
      [SARAH]: Object.assign({ id: SARAH, email: 'sarah.kim@example.com' }, o.factors ? { factors: [{ id: 'f', status: 'verified' }] } : {}),
      [SAM]: { id: SAM, email: 'sam@coach.test' }, [OWNER]: { id: OWNER, email: 'Owner@Powalifta.com' }, [OWNER2]: { id: OWNER2, email: 'second@admin.test' } },
    tables: {
      profiles: [{ id: SARAH, name: 'Sarah Kim', user_type: 'athlete', is_admin: false }, { id: SAM, name: 'Sam <b>Ellis</b>\nhttps://evil.test', user_type: 'coach', is_admin: false },
        { id: OWNER, name: 'The Owner', user_type: 'coach', is_admin: true }].concat(o.twoAdmins ? [{ id: OWNER2, name: 'Second', user_type: 'coach', is_admin: true }] : []),
      feedback: (o.prior || []).slice(),
    },
    missing: o.missing, adminApiDown: o.adminApiDown, insertFails: o.insertFails, countOffset: o.countOffset,
  };
  globalThis.__W = W;
  return W;
}
const call = async (body, o) => {
  o = o || {};
  const headers = { 'content-type': 'application/json' };
  if (o.token !== null) headers.authorization = 'Bearer ' + (o.token || TOK.sarah);
  const res = await handler(new Request('https://fn.test/send-feedback', { method: o.method || 'POST', headers, body: o.method === 'GET' || o.method === 'OPTIONS' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }));
  let j = null; try { j = await res.json(); } catch (e) {}
  return { status: res.status, body: j, headers: res.headers };
};
const PROBLEM = { kind: 'problem', body: 'The Log set button did nothing on my second set.\r\nI tapped it three times.', context: {
  screen: 'Train', route: '/athlete.html', app: 'iphone', version: 'bundle 1a2b3c4 · 2026-11-03', device: 'iPhone · iOS 26.0', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
  viewport: '393×852 @3x', theme: 'dark', layout: 'phone', errors: [{ kind: 'error', msg: 'TypeError: x is undefined', at: '2026-11-03T10:42:00.000Z' }] } };

world();
const FN = await import('../supabase/functions/send-feedback/index.ts');
ok(typeof handler === 'function', 'the function registered a handler');

await t('CORS preflight allows supabase-js\'s headers; GET is refused; bad JSON is 400', async () => {
  const r = await call(null, { method: 'OPTIONS' });
  eq(r.status, 200); ok(/x-client-info/.test(r.headers.get('access-control-allow-headers')), 'x-client-info allowed'); eq(r.headers.get('access-control-allow-origin'), '*');
  eq((await call(null, { method: 'GET' })).status, 405);
  eq((await call('not json')).status, 400);
});
await t('who sent it comes from the token only: no token 401, an unknown one 401, a user_id in the body is ignored', async () => {
  let W = world(); SENT.length = 0;
  eq((await call(PROBLEM, { token: null })).status, 401);
  eq((await call(PROBLEM, { token: 'nope' })).status, 401);
  eq(W.tables.feedback.length, 0, 'nothing saved');
  W = world();
  const r = await call(Object.assign({}, PROBLEM, { user_id: SAM, userId: SAM }));
  eq(r.status, 200); eq(W.tables.feedback[0].user_id, SARAH, 'the token\'s user');
});
await t('two-factor: an account with an authenticator at aal1 gets 403 and nothing is read or saved; aal2 sends', async () => {
  let W = world({ factors: true });
  const r = await call(PROBLEM, { token: TOK.sarah2fa1 });
  eq(r.status, 403); eq(r.body.code, 'aal2_required'); eq(W.calls, ['auth:getUser'], 'nothing after Auth');
  W = world({ factors: true });
  eq((await call(PROBLEM, { token: TOK.sarah2fa2 })).status, 200); eq(W.tables.feedback.length, 1);
});
await t('the checks: kind, an empty or blank body, 4,001 characters, details that are not an object or over 8 KB', async () => {
  const W = world();
  for (const [b, why] of [[{ kind: 'bug', body: 'x' }, 'kind'], [{ kind: 'idea' }, 'no body'], [{ kind: 'idea', body: '' }, 'empty'], [{ kind: 'idea', body: ' \n\t \r\n ' }, 'blank'],
    [{ kind: 'idea', body: 42 }, 'not text'], [{ kind: 'problem', body: 'x'.repeat(4001) }, '4,001'], [{ kind: 'problem', body: 'ok', context: [1] }, 'array context'],
    [{ kind: 'problem', body: 'ok', context: 'screen=Train' }, 'string context'], [{ kind: 'problem', body: 'ok', context: { ua: 'x'.repeat(9000) } }, 'over 8 KB'], [[1, 2], 'an array'], [null, 'null']]) {
    const r = await call(b);
    eq(r.status, 400, why); eq(r.body.error, 'invalid', why); ok(r.body.message, why + ' has words');
  }
  eq(W.tables.feedback.length, 0, 'nothing saved');
  eq((await call({ kind: 'problem', body: '😀'.repeat(4000) })).status, 200, '4,000 characters counted as characters (code points), as Postgres does');
});
await t('the details: allow-listed keys only, typed, cut, scrubbed; an idea keeps none', async () => {
  const W = world();
  const r = await call({ kind: 'problem', body: 'Programs froze', context: {
    screen: 'Programs\u0007', route: '/coach.html?code=ABC234#access_token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghij', app: 'iphone', version: 'v'.repeat(100),
    theme: 'purple', layout: 'desk', ua: 'UA', viewport: '1440×800', password: 'hunter2', program: { weeks: [] }, token: 'abc',
    errors: [1, 2, 3, 4, 5, 6].map(i => ({ kind: i === 6 ? 'weird' : 'error', msg: 'Error ' + i + ' for sarah.kim@example.com with Bearer abcdefghijklmnop1234 at https://x.test/a?token=zzz', at: i === 5 ? 'yesterday' : '2026-11-03T10:4' + i + ':00.000Z', stack: 'secret stack' })) } });
  eq(r.status, 200);
  const c = W.tables.feedback[0].context;
  eq(Object.keys(c).sort(), ['app', 'errors', 'layout', 'route', 'screen', 'ua', 'version', 'viewport'], 'only allow-listed keys (theme dropped: not dark or light)');
  eq(c.screen, 'Programs'); eq(c.route, '/coach.html'); eq(c.version.length, 60); eq(c.layout, 'desk');
  eq(c.errors.length, 5, 'the last five'); eq(c.errors[0].msg, 'Error 2 for [email] with Bearer [token] at https://x.test/a');
  eq(c.errors[3], { kind: 'error', msg: 'Error 5 for [email] with Bearer [token] at https://x.test/a' }, 'a time that isn\'t one is dropped, never a stack');
  eq(c.errors[4].kind, 'error', 'an unknown kind reads as error');
  ok(!JSON.stringify(c).includes('hunter2') && !JSON.stringify(c).includes('secret') && !JSON.stringify(c).includes('weeks'), 'nothing else rides along');
  const W2 = world();
  eq((await call({ kind: 'idea', body: 'Dark mode on the website', context: PROBLEM.context })).status, 200);
  eq(W2.tables.feedback[0].context, {}, 'an idea carries no details');
});
await t('details near 8 KB (4-byte characters) are trimmed oldest error first, so the table\'s jsonb check never trips', async () => {
  const W = world();
  const err = (i) => ({ kind: 'error', msg: '😀'.repeat(300), at: '2026-11-03T10:4' + i + ':00.000Z' });
  const over = { screen: '😀'.repeat(80), ua: '😀'.repeat(250), errors: [1, 2, 3, 4, 5, 6, 7, 8].map(err) };
  ok(Buffer.byteLength(JSON.stringify(over)) > 8192, 'the first is over 8 KB as sent');
  eq((await call({ kind: 'problem', body: 'x', context: over })).status, 400, 'over 8 KB as sent: refused');
  const near = { screen: '😀'.repeat(80), ua: '😀'.repeat(250), errors: [1, 2, 3, 4, 5].map(err) };
  const raw = Buffer.byteLength(JSON.stringify(near));
  ok(raw <= 8192 && raw > 7000, 'the second is under 8 KB as sent, over 7 KB (' + raw + ')');
  eq((await call({ kind: 'problem', body: 'x', context: near })).status, 200);
  const c = W.tables.feedback[0].context;
  const bytes = Buffer.byteLength(JSON.stringify(c));
  ok(bytes <= 7000, 'kept at ' + bytes + ' bytes');
  eq(c.errors.length, 4, 'one error went');
  eq(c.errors[0].at, '2026-11-03T10:42:00.000Z', 'the oldest went first');
  eq(Array.from(c.ua).length, 250, 'the browser line stays while errors can go');
});
await t('cut by character, never through an emoji; a lone half of one is dropped (Postgres refuses it in jsonb)', async () => {
  const W = world();
  eq((await call({ kind: 'problem', body: 'ok \ud83d then \ude00 end 😀', context: { screen: 'S' + '😀'.repeat(100), ua: 'a' + '😀'.repeat(400), errors: [{ kind: 'error', msg: 'x\ud800y', at: '2026-11-03T10:41:00.000Z' }] } })).status, 200);
  const row = W.tables.feedback[0];
  const lone = /\p{Cs}/u;
  ok(!lone.test(row.body) && row.body === 'ok  then  end 😀', 'the words keep whole emoji, lose lone halves: ' + JSON.stringify(row.body));
  ok(!lone.test(JSON.stringify(row.context).replace(/\\u[0-9a-f]{4}/g, '')) && ![row.context.screen, row.context.ua, row.context.errors[0].msg].some((v) => lone.test(v)), 'no half emoji in the details');
  eq(Array.from(row.context.screen).length, 80); eq(Array.from(row.context.ua).length, 300); eq(row.context.errors[0].msg, 'x y');
});
await t('the row as saved: kind, the words (line breaks kept, control characters out, trimmed), the details', async () => {
  const W = world(); SENT.length = 0;
  const r = await call(Object.assign({}, PROBLEM, { body: '  ' + PROBLEM.body + '\u0000\u0007  ' }));
  eq(r.status, 200); eq(r.body, { ok: true, id: 'fb-1' });
  const row = W.tables.feedback[0];
  eq(row.kind, 'problem'); eq(row.body, 'The Log set button did nothing on my second set.\nI tapped it three times.');
  eq(row.context.screen, 'Train'); eq(row.context.errors[0].msg, 'TypeError: x is undefined');
  ok(W.calls.includes('from:feedback:select:count'), 'the cap was counted with the service role first');
});
await t('the email: every admin, "Problem from Sarah Kim (lifter)", the words escaped, who and the details, reply-to the sender', async () => {
  const W = world({ twoAdmins: true }); SENT.length = 0;
  await call(Object.assign({}, PROBLEM, { body: 'It says <script>alert("x")</script> & then crashes' }));
  eq(SENT.length, 1);
  const m = SENT[0];
  eq(m.to, ['owner@powalifta.com', 'second@admin.test'], 'every admin account, from the admin API, lower case');
  eq(m.from, 'POWALIFTA <noreply@powalifta.com>'); eq(m.subject, 'Problem from Sarah Kim (lifter)'); eq(m.reply_to, 'sarah.kim@example.com');
  ok(m.html.includes('It says &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; then crashes') && !m.html.includes('<script>'), 'the words are escaped');
  ok(m.html.includes('sarah.kim@example.com') && m.html.includes('Sarah Kim') && m.html.includes('(lifter)'), 'who: name, role, email');
  ok(m.html.includes('iPhone app bundle 1a2b3c4') && m.html.includes('TypeError: x is undefined') && m.html.includes('393×852 @3x'), 'the details');
  ok(m.text.includes('Problem from Sarah Kim · lifter · sarah.kim@example.com') && m.text.includes('  Screen: Train (/athlete.html)') && m.text.includes('10:42 UTC TypeError'), 'the text part: ' + m.text.slice(0, 200));
  ok(m.html.includes('https://www.powalifta.com/admin.html#feedback'), 'a link to the admin page');
  eq(W.tables.feedback.length, 1);
});
await t('a coach\'s idea: the subject and role, a name with markup and a link made safe', async () => {
  world(); SENT.length = 0;
  eq((await call({ kind: 'idea', body: 'Let me copy a week to every lifter at once' }, { token: TOK.sam })).status, 200);
  const m = SENT[0];
  eq(m.subject, 'Idea from Sam <b>Ellis</b> (coach)', 'the subject is plain text (no link, no line break)');
  ok(!m.html.includes('<b>Ellis') && m.html.includes('Sam &lt;b&gt;Ellis&lt;/b&gt;') && !m.html.includes('evil.test'), 'the name is escaped and loses its link in the email');
  ok(!/Technical details/.test(m.text), 'an idea has no details section');
});
await t('email is best-effort: refused, thrown, no key, no admins or the admin API down: still 200 and saved', async () => {
  for (const [label, setup] of [['Resend refuses', () => { resendStatus = 500; }], ['the network throws', () => { resendThrows = true; }],
    ['no key', () => { ENV.RESEND_API_KEY = ''; }], ['admin API down', () => {}]]) {
    const W = world({ adminApiDown: label === 'admin API down' }); SENT.length = 0;
    setup();
    const r = await call(PROBLEM);
    resendStatus = 200; resendThrows = false; ENV.RESEND_API_KEY = 're_test_key';
    eq(r.status, 200, label); eq(r.body.ok, true, label); eq(W.tables.feedback.length, 1, label + ': saved');
  }
  const W = world(); W.tables.profiles.forEach(p => { p.is_admin = false; }); SENT.length = 0;
  eq((await call(PROBLEM)).status, 200); eq(SENT.length, 0, 'no admin: no email');
  ok(!LOGS.some(l => l.includes('Log set button')), 'the words never reach the function log');
});
await t('the cap: 20 in 24 hours (older ones don\'t count), the 21st is 429 and nothing is saved or emailed', async () => {
  const now = Date.now();
  const prior = Array.from({ length: 19 }, (_, i) => ({ id: 'p' + i, user_id: SARAH, kind: 'idea', body: 'x', created_at: new Date(now - i * 3600e3).toISOString() }))
    .concat(Array.from({ length: 30 }, (_, i) => ({ id: 'o' + i, user_id: SARAH, kind: 'idea', body: 'old', created_at: new Date(now - 2 * 864e5).toISOString() })))
    .concat([{ id: 's1', user_id: SAM, kind: 'idea', body: 'x', created_at: new Date(now).toISOString() }]);
  const W = world({ prior }); SENT.length = 0;
  eq((await call(PROBLEM)).status, 200, 'the 20th');
  const before = W.calls.length;
  const r = await call(PROBLEM);
  eq(r.status, 429); eq(r.body.error, 'rate_limited'); ok(/20/.test(r.body.message));
  eq(W.calls.slice(before), ['auth:getUser', 'from:feedback:select:count'], 'the function\'s own count refuses it: no insert is even tried');
  eq(W.tables.feedback.filter(x => x.user_id === SARAH).length, 50, 'the 21st was not saved'); eq(SENT.length, 1, 'only the 20th was emailed');
  eq((await call(PROBLEM, { token: TOK.sam })).status, 200, 'someone else is not capped by her');
});
await t('two at once past the count: the table\'s guard refuses (feedback_cap) and the answer is 429', async () => {
  // The count says 19 (the 20th landed between the count and the insert); the table's guard sees 20.
  const W = world({ countOffset: -1, prior: Array.from({ length: 20 }, (_, i) => ({ id: 'p' + i, user_id: SARAH, kind: 'idea', body: 'x', created_at: new Date().toISOString() })) });
  SENT.length = 0;
  const r = await call(PROBLEM);
  eq(r.status, 429); eq(r.body.error, 'rate_limited'); eq(W.tables.feedback.length, 20, 'nothing saved'); eq(SENT.length, 0, 'nothing emailed');
});
await t('no table yet (the migration isn\'t in): 503 not_ready, nothing emailed; any other save error is 500', async () => {
  world({ missing: ['feedback'] }); SENT.length = 0;
  const r = await call(PROBLEM);
  eq(r.status, 503); eq(r.body.error, 'not_ready'); eq(SENT.length, 0);
  world({ insertFails: true });
  const r2 = await call(PROBLEM);
  eq(r2.status, 500); eq(r2.body.error, 'save_failed'); eq(SENT.length, 0);
});
await t('the pure helpers: scrub, roleWord, mailName, the subject for each kind', async () => {
  eq(FN.scrub('mail me: a.b+c@x-y.io, token=abcdefghijklmnopqrstuv123 then eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_part_here ok'), 'mail me: [email], token=[token] then [token] ok');
  eq(FN.scrub('see https://www.powalifta.com/coach.html?demo=1#settings?sec=help now'), 'see https://www.powalifta.com/coach.html now');
  eq(FN.scrub('Failed to fetch dynamically imported module'), 'Failed to fetch dynamically imported module', 'ordinary words are kept');
  eq(FN.scrub('id 5f8a2c1e9b7d4e3fa1b2c3d4e5f60718 here'), 'id [token] here', 'a long hex id');
  eq([FN.roleWord('athlete'), FN.roleWord('coach'), FN.roleWord('admin'), FN.roleWord(null)], ['lifter', 'coach', 'admin', 'lifter']);
  eq(FN.mailName('  Sarah\nKim https://x.test  ', 'Someone'), 'Sarah Kim'); eq(FN.mailName('', 'Someone'), 'Someone');
  eq(FN.feedbackEmail({ kind: 'problem', body: 'x', context: {}, sender: { name: 'Nina Park', role: 'coach' } }).subject, 'Problem from Nina Park (coach)');
  ok(/turned them off/.test(FN.feedbackEmail({ kind: 'problem', body: 'x', context: {}, sender: {} }).text), 'a problem without details says so');
});

// ---------------------------------------------------------------- the app's details against the server's
await t('feedback.js and the function agree: the same keys, the same scrubbing, and what the app builds passes as it is', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'feedback.js'), 'utf8');
  const sb = { window: {}, console: { log() {}, warn() {}, error() {} } };
  sb.window = sb; sb.self = sb;
  vm.createContext(sb);
  vm.runInContext(src, sb, { filename: 'feedback.js' });
  const PF = sb.PowaFeedback;
  ok(PF, 'feedback.js defines PowaFeedback without a page');
  eq(Array.from(PF.CONTEXT_KEYS).slice().sort(), FN.CONTEXT_KEYS.slice().sort(), 'the same allow-list');
  eq(PF.MAX_BODY, FN.MAX_BODY); eq(PF.MAX_CONTEXT, FN.MAX_CONTEXT);
  for (const s of ['mail me: a.b+c@x-y.io, token=abcdefghijklmnopqrstuv123 then eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_part_here ok',
    'see https://www.powalifta.com/coach.html?demo=1#settings?sec=help now', 'id 5f8a2c1e9b7d4e3fa1b2c3d4e5f60718 here', 'TypeError: Cannot read properties of undefined (reading \'weeks\')']) eq(PF.scrub(s), FN.scrub(s), 'scrub: ' + s);
  const ctx = PF.buildContext({ kind: 'problem', include: true, screen: 'Train', path: '/athlete.html', shell: 'ios', version: 'bundle 1a2b3c4 · 2026-11-03',
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    w: 393, h: 852, dpr: 3, theme: 'dark', desk: false, errors: [{ kind: 'error', msg: 'TypeError: x', ts: '2026-11-03T10:42:00.000Z', stack: 'at y' }] });
  eq(FN.cleanContext(JSON.parse(JSON.stringify(ctx))), JSON.parse(JSON.stringify(ctx)), 'the server keeps the app\'s details exactly');
});

console.info(`RESULT send-feedback: ${pass} passed, ${fail} failed`);
if (fail && LOGS.length) console.log('function logs:\n  ' + LOGS.slice(-12).join('\n  '));
process.exit(fail ? 1 : 0);
