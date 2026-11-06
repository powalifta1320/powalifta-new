// send-program-assigned (supabase/functions/send-program-assigned) end to end under Node, no Deno and no network:
// Deno.env / Deno.serve are stubbed, the esm.sh supabase client is an in-memory fake (Auth that knows a few tokens and
// users, the rate meter's rl_bump, and a small PostgREST for the profiles lookup: coach_id plus a case-blind literal
// ilike on the email), and fetch records Resend. Then the real handler runs: CORS, the method, the JSON, the email,
// the token (never the body) for who sends it, two-factor, the per-coach cap, "not your athlete", the key, the email
// itself (subject, text and HTML, the names cleaned and escaped), and the optional week a published draft week sends
// ("week 3": the email names it; a missing or bad week gets the program's email, word for word as before).
// Run: node test/send-program-assigned.test.mjs
import { registerHooks } from 'node:module';
const LOGS = [];
console.warn = (...a) => LOGS.push(a.join(' '));
console.error = (...a) => LOGS.push(a.join(' '));

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.info('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

const SAM = 'c0000000-0000-4000-8000-0000000000c1', NINA = 'c0000000-0000-4000-8000-0000000000c2', SARAH = 'a0000000-0000-4000-8000-0000000000a1';
const FAKE_SUPABASE = `
class Q {
  constructor(t) { this.t = t; this.f = []; this.lim = null; }
  select() { return this; }
  eq(c, v) { this.f.push(r => r[c] === v); return this; }
  // PostgREST's ilike with the function's escaping: \\\\ \\% \\_ are literal; % and _ are wildcards.
  ilike(c, pat) {
    let re = '', s = String(pat);
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\\\' && i + 1 < s.length) { re += s[++i].replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'); continue; }
      re += ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&');
    }
    const rx = new RegExp('^' + re + '$', 'i');
    this.f.push(r => rx.test(String(r[c] || '')));
    return this;
  }
  limit(n) { this.lim = n; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const W = globalThis.__W;
    W.calls.push('from:' + this.t);
    let out = (W.tables[this.t] || []).filter(r => this.f.every(fn => fn(r)));
    if (this.lim) out = out.slice(0, this.lim);
    return { data: JSON.parse(JSON.stringify(out)), error: null };
  }
}
export function createClient() {
  const W = globalThis.__W;
  return {
    auth: { async getUser(jwt) { W.calls.push('auth:getUser'); const uid = W.tokens[jwt]; return uid ? { data: { user: JSON.parse(JSON.stringify(W.users[uid])) }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }; } },
    async rpc(name, args) {
      W.calls.push('rpc:' + name);
      if (W.noMeter) return { data: null, error: { message: 'Could not find the function public.rl_bump' } };
      W.bumps = (W.bumps || 0) + 1;
      return { data: [{ allowed: W.bumps <= (W.cap || args.p_limit), cur: W.bumps, limit_val: args.p_limit, reset_at: new Date(Date.now() + 600000).toISOString() }], error: null };
    },
    from: (t) => new Q(t),
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
    SENT.push(JSON.parse(init.body)); return new Response(resendStatus === 200 ? '{"id":"em_1"}' : 'nope', { status: resendStatus });
  }
  throw new Error('unexpected fetch ' + url);
};
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = (sub, aal) => b64url({ alg: 'HS256' }) + '.' + b64url({ sub, role: 'authenticated', aal: aal || 'aal1' }) + '.sig';
const TOK = { sam: tok(SAM), nina: tok(NINA), sam2fa1: tok(SAM, 'aal1'), sam2fa2: tok(SAM, 'aal2') };
function world(o) {
  o = o || {};
  const W = {
    calls: [], tokens: { [TOK.sam]: SAM, [TOK.nina]: NINA, [TOK.sam2fa1]: SAM, [TOK.sam2fa2]: SAM },
    users: { [SAM]: Object.assign({ id: SAM, email: 'sam@coach.test' }, o.factors ? { factors: [{ id: 'f', status: 'verified' }] } : {}), [NINA]: { id: NINA, email: 'nina@coach.test' } },
    tables: { profiles: [{ id: SARAH, coach_id: SAM, email: 'Sarah.Kim@Example.com' }, { id: 'x', coach_id: NINA, email: 'sarahxkim@example.com' }] },
    noMeter: o.noMeter, cap: o.cap,
  };
  globalThis.__W = W;
  SENT.length = 0; resendStatus = 200; resendThrows = false;
  return W;
}
const call = async (body, o) => {
  o = o || {};
  const headers = { 'content-type': 'application/json' };
  if (o.token !== null) headers.authorization = 'Bearer ' + (o.token || TOK.sam);
  const res = await handler(new Request('https://fn.test/send-program-assigned', { method: o.method || 'POST', headers, body: o.method === 'GET' || o.method === 'OPTIONS' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) }));
  let j = null; try { j = await res.json(); } catch (e) {}
  return { status: res.status, body: j, headers: res.headers };
};
const BODY = { athleteEmail: ' sarah.kim@example.com ', athleteName: 'Sarah Kim', coachName: 'Sam Ellis', programName: 'Strength Block' };

world();
const FN = await import('../supabase/functions/send-program-assigned/index.ts');
ok(typeof handler === 'function', 'the function registered a handler');

await t('CORS preflight, GET refused, bad JSON 400, a bad email 400', async () => {
  const r = await call(null, { method: 'OPTIONS' });
  eq(r.status, 200); eq(r.headers.get('access-control-allow-origin'), '*'); ok(/authorization/i.test(r.headers.get('access-control-allow-headers')), 'Authorization allowed');
  eq((await call(null, { method: 'GET' })).status, 405);
  eq((await call('not json')).status, 400);
  eq((await call(Object.assign({}, BODY, { athleteEmail: 'no-at-sign' }))).status, 400);
  eq(SENT.length, 0, 'nothing sent');
});
await t('who sends it comes from the token: none 401, an unknown one 401', async () => {
  world();
  eq((await call(BODY, { token: null })).status, 401);
  eq((await call(BODY, { token: 'nope' })).status, 401);
  eq(SENT.length, 0);
});
await t('two-factor: an account with an authenticator at aal1 gets 403 before anything is read; aal2 sends', async () => {
  let W = world({ factors: true });
  const r = await call(BODY, { token: TOK.sam2fa1 });
  eq(r.status, 403); eq(r.body.code, 'aal2_required'); eq(W.calls, ['auth:getUser'], 'nothing after Auth'); eq(SENT.length, 0);
  W = world({ factors: true });
  eq((await call(BODY, { token: TOK.sam2fa2 })).status, 200); eq(SENT.length, 1);
});
await t('only the caller’s own lifter: another coach’s, or a pattern in the address, is 403 and sends nothing', async () => {
  world();
  eq((await call(BODY, { token: TOK.nina })).status, 403, 'Nina doesn’t coach Sarah');
  eq((await call(Object.assign({}, BODY, { athleteEmail: 'sarah_kim@example.com' }))).status, 403, '_ is a literal, never a wildcard');
  eq((await call(Object.assign({}, BODY, { athleteEmail: 'sarah%@example.com' }))).status, 403, '% is a literal too');
  eq(SENT.length, 0);
  eq((await call(Object.assign({}, BODY, { athleteEmail: 'SARAH.KIM@EXAMPLE.COM' }))).status, 200, 'case-blind on the address');
});
await t('the per-coach cap: over it 429 with Retry-After; no meter yet (fails open) still sends', async () => {
  world({ cap: 1 });
  eq((await call(BODY)).status, 200);
  const r = await call(BODY);
  eq(r.status, 429); ok(Number(r.headers.get('retry-after')) > 0, 'Retry-After');
  eq(SENT.length, 1);
  world({ noMeter: true });
  eq((await call(BODY)).status, 200, 'rl_bump missing: allowed');
});
await t('no Resend key 500; Resend refusing 502 (its words stay in the log); Resend unreachable 500', async () => {
  world(); delete ENV.RESEND_API_KEY;
  try { eq((await call(BODY)).status, 500); } finally { ENV.RESEND_API_KEY = 're_test_key'; }
  world(); resendStatus = 422;
  const r = await call(BODY);
  eq(r.status, 502); eq(r.body, { error: 'Email send failed', status: 422 });
  world(); resendThrows = true;
  eq((await call(BODY)).status, 500);
});
await t('the program’s email: to the lifter, from POWALIFTA, the words as they always were', async () => {
  world();
  const r = await call(BODY);
  eq(r.status, 200); eq(r.body, { sent: true, id: 'em_1' });
  const m = SENT[0];
  eq(m.to, ['sarah.kim@example.com'], 'trimmed, lower case'); eq(m.from, 'POWALIFTA <noreply@powalifta.com>');
  eq(m.subject, 'Sam Ellis just programmed you — open POWALIFTA');
  ok(m.text.startsWith('Hey Sarah,\n\nSam Ellis just assigned you a new program on POWALIFTA: "Strength Block".\n\nOpen your dashboard to see this week:'), 'the text');
  ok(m.html.includes('>Sam Ellis programmed you, Sarah.</h1>') && m.html.includes('Your new program <strong style="color:#f4f4f6;">Strength Block</strong> is live on your dashboard.'), 'the HTML');
  ok(!/week \d/i.test(m.subject + m.text + m.html), 'no week named');
});
await t('a published week: the email names it (subject, text, HTML); digits as text count too', async () => {
  world();
  eq((await call(Object.assign({}, BODY, { week: 3 }))).status, 200);
  const m = SENT[0];
  eq(m.subject, 'Sam Ellis published week 3 — open POWALIFTA');
  ok(m.text.startsWith('Hey Sarah,\n\nSam Ellis just published week 3 of "Strength Block" on POWALIFTA.\n\nOpen your dashboard to see this week:'), 'the text');
  ok(m.html.includes('>Sam Ellis published week 3, Sarah.</h1>') && m.html.includes('Week 3 of <strong style="color:#f4f4f6;">Strength Block</strong> is live on your dashboard.'), 'the HTML');
  world();
  await call(Object.assign({}, BODY, { week: '12' }));
  eq(SENT[0].subject, 'Sam Ellis published week 12 — open POWALIFTA');
});
await t('a week with no program name says “your program”; the app’s “a new program” placeholder too', async () => {
  for (const programName of ['', 'a new program']) {
    world();
    await call(Object.assign({}, BODY, { programName, week: 2 }));
    ok(SENT[0].text.includes('just published week 2 of your program on POWALIFTA.'), 'text: ' + JSON.stringify(programName));
    ok(SENT[0].html.includes('Week 2 of your program is live on your dashboard.'), 'html: ' + JSON.stringify(programName));
  }
});
await t('a bad week is ignored, never echoed: the program’s email', async () => {
  for (const week of [0, -1, 100, 3.5, '3; DROP TABLE', 'three', ' ', true, null, {}, [3], '1e1', '0x3', '<b>3</b>']) {
    world();
    eq((await call(Object.assign({}, BODY, { week }))).status, 200, 'still sends: ' + JSON.stringify(week));
    eq(SENT[0].subject, 'Sam Ellis just programmed you — open POWALIFTA', 'the program’s email for ' + JSON.stringify(week));
    ok(!/DROP|three|<b>3/.test(SENT[0].text + SENT[0].html), 'nothing of it in the email');
  }
});
await t('the names: links and line breaks out, 80 characters at most, HTML escaped in the HTML', async () => {
  world();
  await call(Object.assign({}, BODY, { coachName: 'Sam <b>Ellis</b>\nhttps://evil.test/x', programName: 'Peak & Taper "2026" ' + 'x'.repeat(120), week: 4 }));
  const m = SENT[0];
  ok(!/evil\.test|\n.*Ellis/.test(m.subject), 'no link, no line break in the subject'); ok(!m.subject.includes('\n'), 'one line');
  ok(m.html.includes('Sam &lt;b&gt;Ellis&lt;/b&gt;') && !m.html.includes('<b>Ellis'), 'escaped in the HTML');
  ok(m.html.includes('Peak &amp; Taper &quot;2026&quot;'), 'the program escaped');
  ok(!m.text.includes('x'.repeat(81)), 'the program cut to 80');
});
await t('weekOf and buildEmail, directly', async () => {
  eq([1, 3, 99, '7', ' 8 '].map(FN.weekOf), [1, 3, 99, 7, 8]);
  eq([0, 100, 2.5, '', '1.0', 'a', null, undefined, false, NaN, Infinity].map(FN.weekOf), [null, null, null, null, null, null, null, null, null, null, null]);
  const a = FN.buildEmail({ athleteName: '', coachName: '', programName: '' });
  eq(a.subject, 'Your coach just programmed you — open POWALIFTA'); ok(a.text.startsWith('Hey lifter,'), 'no names: the defaults');
  const b = FN.buildEmail({ athleteName: 'Sarah Kim', coachName: 'Sam', programName: 'Peak', week: 5 });
  eq(b.subject, 'Sam published week 5 — open POWALIFTA');
});

console.info(`RESULT send-program-assigned: ${pass} passed, ${fail} failed`);
if (fail && LOGS.length) console.log('function logs:\n  ' + LOGS.slice(-12).join('\n  '));
process.exit(fail ? 1 : 0);
