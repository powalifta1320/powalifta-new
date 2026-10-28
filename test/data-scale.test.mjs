// Data scale (2026-10-28) under Node: no browser, no network.
// 1. db.js's paged reads against a fake PostgREST that caps every read at 1000 rows (Supabase's max-rows)
//    and honours order / range / count, and can fail a page: every row comes back once and in order, a
//    failed page is tried again, then kept partial and said, the ceiling stops a read and says so, a set
//    logged or deleted mid-read neither comes twice nor takes another with it (the overlap, the key, the
//    page past the plan, the read that goes again), every paged read reads its own key, the hydrate's
//    lists are complete on both branches, gear falls back, the coach inbox is read fresh (one read under
//    500 messages; a reply Realtime missed is still the last word), and the pain channel is filtered to
//    the roster (100 ids a binding, no DELETE listener).
// 2. The desk's numbers on generated rosters: app.js as it was at 9cca10b (from git) against this one,
//    same rows, same clock. deskRows, coachAthleteStatus, isPRForLog, momentum, wins, trends, the roster
//    overview and attention, the builder's hints, streaks; then again after a push, a live burst, edits in
//    place (Store.update, Store.bump), a new list, a new day: the memos let go exactly when they must.
//    Skipped (said so) when git can't give the old app.js.
// Run: node test/data-scale.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e && e.message); } };
const eq = (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m || '') + ' expected ' + (y || '').slice(0, 300) + ' got ' + (x || '').slice(0, 300)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

// ---------------------------------------------------------------- a seeded random
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const hex = (r, n) => { let o = ''; for (let i = 0; i < n; i++) o += Math.floor(r() * 16).toString(16); return o; };
const uuid = (r) => hex(r, 8) + '-' + hex(r, 4) + '-4' + hex(r, 3) + '-a' + hex(r, 3) + '-' + hex(r, 12);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// ================================================================ 1. db.js paged reads
// A PostgREST stand-in: max-rows 1000, filters, order (nulls last asc / first desc), range / limit,
// Prefer count=exact, columns (an unknown one is 42703), page failures on demand.
function fakeSupabase(tables, opts) {
  opts = opts || {};
  const calls = [];
  const cmp = (a, b) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : (typeof a === 'number' && typeof b === 'number') ? a - b : (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0));
  function run(st) {
    calls.push(st);
    if (st.op !== 'select') return { data: [], error: null };
    const want = st.cols === '*' ? null : st.cols.split(',').map(c => c.trim()).filter(Boolean);
    const missing = (opts.missing && opts.missing[st.table]) || [];
    const bad = want && want.find(c => missing.includes(c));
    if (bad) return { data: null, error: { code: '42703', message: 'column ' + st.table + '.' + bad + ' does not exist' } };
    if (opts.fail) { const e = opts.fail(st); if (e) return { data: null, error: e }; }
    let rows = (tables[st.table] || []).filter(r => st.f.every(f => f(r)));
    if (st.orders.length) rows = rows.slice().sort((a, b) => { for (const [c, asc] of st.orders) { const d = cmp(a[c], b[c]); if (d) return asc ? d : (a[c] == null ? -1 : b[c] == null ? 1 : -d); } return 0; });
    const total = rows.length;
    const from = st.from || 0;
    const lim = Math.min(st.to != null ? st.to - st.from + 1 : st.lim != null ? st.lim : 1000, 1000);
    rows = rows.slice(from, from + lim);
    if (want) rows = rows.map(r => { const o = {}; want.forEach(c => { o[c] = r[c]; }); return o; });
    else rows = rows.map(r => Object.assign({}, r));
    if (opts.after) opts.after(st);
    if (st.single) return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
    if (st.maybe) return { data: rows[0] || null, error: null };
    return { data: rows, error: null, count: st.count ? total : null };
  }
  function from(table) {
    const st = { table, f: [], orders: [], from: null, to: null, lim: null, count: null, cols: '*', op: 'select', single: false, maybe: false };
    const b = {
      __st: st,
      select(c, o) { if (st.op === 'select') st.cols = c || '*'; if (o && o.count) st.count = o.count; return b; },
      eq(c, v) { st.f.push(r => r[c] != null && String(r[c]) === String(v)); return b; },
      neq(c, v) { st.f.push(r => r[c] != null && String(r[c]) !== String(v)); return b; },
      in(c, vs) { const s = new Set((vs || []).map(String)); st.inMax = Math.max(st.inMax || 0, (vs || []).length); st.inVals = (vs || []).slice(); st.f.push(r => r[c] != null && s.has(String(r[c]))); return b; },
      gte(c, v) { st.f.push(r => r[c] != null && String(r[c]) >= String(v)); return b; },
      gt(c, v) { st.f.push(r => r[c] != null && String(r[c]) > String(v)); return b; },
      lte(c, v) { st.f.push(r => r[c] != null && String(r[c]) <= String(v)); return b; },
      lt(c, v) { st.f.push(r => r[c] != null && String(r[c]) < String(v)); return b; },
      is(c, v) { st.f.push(r => (v === null ? r[c] == null : r[c] === v)); return b; },
      not(c, op, v) { if (op === 'is' && v === null) st.f.push(r => r[c] != null); return b; },
      contains(c, vs) { st.f.push(r => Array.isArray(r[c]) && vs.every(v => r[c].includes(v))); return b; },
      or(expr) {
        const parts = expr.split(',').map(p => { const [c, op, ...v] = p.split('.'); return { c, op, v: v.join('.') }; });
        st.f.push(r => parts.some(p => p.op === 'eq' && r[p.c] != null && String(r[p.c]) === p.v)); return b;
      },
      order(c, o) { st.orders.push([c, !o || o.ascending !== false]); return b; },
      range(a, z) { st.from = a; st.to = z; return b; },
      limit(n) { st.lim = n; return b; },
      single() { st.single = true; return b; },
      maybeSingle() { st.maybe = true; return b; },
      insert() { st.op = 'insert'; return b; }, upsert() { st.op = 'upsert'; return b; }, update() { st.op = 'update'; return b; }, delete() { st.op = 'delete'; return b; },
      then(res, rej) { return Promise.resolve().then(() => run(st)).then(res, rej); }
    };
    return b;
  }
  const chans = [];
  const client = {
    from, calls, chans,
    rpc(name, args) { calls.push({ rpc: name, args }); const v = opts.rpc && opts.rpc[name] ? opts.rpc[name](args) : []; return Promise.resolve({ data: v, error: null }); },
    channel(name) {
      const ch = { name, binds: [], removed: false, on(type, f, fn) { this.binds.push({ type, f, fn }); return this; }, subscribe(cb) { this.cb = cb; return this; } };
      chans.push(ch); return ch;
    },
    removeChannel(ch) { ch.removed = true; return Promise.resolve('ok'); },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    storage: { from: () => ({ upload: async () => ({}), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) }
  };
  return client;
}
// db.js in its own context, on that client. The timers it sets can be fired by hand (__timers).
function loadDb(tables, opts) {
  const client = fakeSupabase(tables, opts);
  const warns = [], timers = [];
  const store = new Map();
  const sbx = {
    console: { log() {}, warn: (...a) => warns.push(a.map(String).join(' ')), error: (...a) => warns.push(a.map(String).join(' ')) },
    location: { hash: '', pathname: '/coach.html', search: '', replace() {} },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: i => [...store.keys()][i] || null, get length() { return store.size; } },
    document: { visibilityState: 'visible', addEventListener() {} },
    crypto: webcrypto, Promise, Date, Math, JSON, Map, Set, Array, Object, String, Number, Error, RegExp,
    setTimeout: (fn, ms) => { if (ms >= 5000) { timers.push(fn); return timers.length; } return setTimeout(fn, ms); },
    clearTimeout, supabase: { createClient: () => client }
  };
  sbx.window = sbx; sbx.globalThis = sbx;
  sbx.__powaWarn = (msg, d) => warns.push('WARN ' + msg + ' ' + JSON.stringify(d || null));
  vm.createContext(sbx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8'), sbx, { filename: 'db.js' });
  return { DB: sbx.DB, sbx, client, warns, timers };
}
const logRow = (r, id, athleteId, date, k) => ({ id, athlete_id: athleteId, lift: ['squat', 'bench', 'deadlift', 'other'][k % 4], variant: 'Competition', exercise_name: k % 4 === 3 ? 'Row' : null,
  weight: 100 + (k % 50), reps: 3, rpe: 8, e1rm: 120 + (k % 60), e1rm_comp: 120 + (k % 60), note: null, date,
  created_at: date + 'T10:' + String(k % 60).padStart(2, '0') + ':' + String(Math.floor(k / 60) % 60).padStart(2, '0') + '.000000+00:00', source: null, import_key: null, imported_by: null, gear: null });

await t('_readAll: 2,500 rows in 3 reads (count planned), in order, each once', async () => {
  const rows = []; for (let i = 0; i < 2500; i++) rows.push({ id: 'r' + String(i).padStart(5, '0'), v: i % 7 });
  const { sbx, client } = loadDb({ t: rows });
  const res = await sbx._readAll('t', (c) => sbx.sb.from('t').select('id, v', c), { order: [['v', true]] });
  eq(res.rows.length, 2500); eq(res.count, 2500); eq(res.capped, false); eq(res.partial, false);
  const want = rows.slice().sort((a, b) => a.v - b.v || (a.id < b.id ? -1 : 1)).map(r => r.id);
  eq(res.rows.map(r => r.id), want, 'stable order by v, then the id tiebreak');
  eq(client.calls.length, 3);
  ok(client.calls.every(c => c.orders.length === 2 && c.orders[1][0] === 'id'), 'every page carries the tiebreak');
  ok(client.calls[0].count === 'exact' && !client.calls[1].count, 'only the first page asks for the count');
});
await t('_readAll: no count → a page at a time until a short one; each later page starts 50 rows into the one before', async () => {
  const rows = []; for (let i = 0; i < 2000; i++) rows.push({ id: 'r' + String(i).padStart(5, '0') });
  let x = loadDb({ t: rows });
  let res = await x.sbx._readAll('t', (c) => x.sbx.sb.from('t').select('id', c), { count: false });
  eq(res.rows.map(r => r.id), rows.map(r => r.id), 'every row once, in order');
  eq(x.client.calls.map(c => c.from), [0, 950, 1900], 'no count: the third read finds the end');
  x = loadDb({ t: rows });
  res = await x.sbx._readAll('t', (c) => x.sbx.sb.from('t').select('id', c), {});
  eq(res.rows.map(r => r.id), rows.map(r => r.id)); eq(x.client.calls.map(c => c.from), [0, 950, 1900], 'with the count: planned the same');
  const more = []; for (let i = 0; i < 3456; i++) more.push({ id: 'r' + String(i).padStart(5, '0') });
  x = loadDb({ t: more });
  res = await x.sbx._readAll('t', (c) => x.sbx.sb.from('t').select('id', c), {});
  eq(res.rows.length, 3456); eq(x.client.calls.map(c => c.from), [0, 950, 1900, 2850]);
  ok(x.client.calls.every(c => c.to - c.from === 999), 'never more than 1000 rows a read');
});
await t('_readAll: the ceiling stops a read and says so', async () => {
  const rows = []; for (let i = 0; i < 2500; i++) rows.push({ id: 'r' + String(i).padStart(5, '0') });
  const x = loadDb({ t: rows });
  const res = await x.sbx._readAll('roster logs', (c) => x.sbx.sb.from('t').select('id', c), { ceiling: 1000 });
  eq(res.rows.length, 1000); eq(res.capped, true);
  ok(x.warns.some(w => /roster logs: read stopped at 1000 rows/.test(w)), 'warned: ' + x.warns.join(' | '));
});
await t('_readAll: a failed page is tried again; one that keeps failing is kept partial and said', async () => {
  const rows = []; for (let i = 0; i < 3500; i++) rows.push({ id: 'r' + String(i).padStart(5, '0') });
  let n = 0;
  let x = loadDb({ t: rows }, { fail: (st) => (st.from === 950 && n++ < 1 ? { message: 'timeout' } : null) });
  let res = await x.sbx._readAll('t', (c) => x.sbx.sb.from('t').select('id', c), {});
  eq(res.rows.length, 3500); eq(res.partial, false); eq(x.client.calls.length, 5, '4 pages + 1 retry');
  x = loadDb({ t: rows }, { fail: (st) => (st.from === 1900 ? { message: 'down' } : null) });
  res = await x.sbx._readAll('t', (c) => x.sbx.sb.from('t').select('id', c), {});
  eq(res.partial, true); eq(res.rows.length, 1950, 'the pages before the failed one');
  eq(res.rows.map(r => r.id), rows.slice(0, 1950).map(r => r.id), 'in order, each once');
  ok(x.warns.some(w => /a page failed, 1950 rows kept/.test(w)), 'said: ' + x.warns.join(' | '));
  x = loadDb({ t: rows }, { fail: (st) => (st.from === 0 ? { message: 'nope', code: '42P01' } : null) });
  res = await x.sbx._readAll('t', (c) => x.sbx.sb.from('t').select('id', c), {});
  eq(res.rows.length, 0); ok(res.error && res.error.code === '42P01', 'the first page failing hands the error back');
});
await t('_readAll: a row written mid-read that shifts a page edge comes once', async () => {
  const rows = []; for (let i = 0; i < 1500; i++) rows.push({ id: 'r' + String(i).padStart(5, '0'), d: '2026-01-02' });
  let done = false;
  const x = loadDb({ t: rows }, { after: (st) => { if (!done && st.from === 0) { done = true; rows.unshift({ id: 'a-new', d: '2026-01-01' }); } } });
  const res = await x.sbx._readAll('t', (c) => x.sbx.sb.from('t').select('id, d', c), { order: [['d', true]] });
  eq(new Set(res.rows.map(r => r.id)).size, res.rows.length, 'no row twice');
});
// A set logged or deleted while the pages are read moves every row after it one place across the page
// edges (the newest first: a new set pushes every row down, a deleted one pulls them up). The real
// database sorts each page afresh, as this fake does.
const logsDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
const midRead = (logs, change) => { let done = false; return { after: (st) => { if (!done && st.table === 'workout_logs' && !st.from) { done = true; change(logs); } } }; };
const sameSets = (got, logs, m) => {
  const ids = got.map(l => l.id), have = new Set(ids);
  eq(ids.length, have.size, (m || '') + ' no set twice');
  const missing = logs.filter(l => !have.has(l.id));
  eq(missing.length, 0, (m || '') + ' every set on the server read');
};
await t('workout logs: a set logged mid-read comes once, and the oldest still comes (the lifter, and a roster group)', async () => {
  // 1,950: the plan ends exactly at the last set, so the new one pushes the oldest past it.
  for (const n of [1500, 1950, 2000, 2950]) {
    const r = rng(40 + n), A = uuid(r), logs = [];
    for (let i = 0; i < n; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2025, 0, 1) + Math.floor(i / 7) * 864e5), i));
    const oldest = logs.slice().sort(logsDesc).pop().id;
    const x = loadDb({ workout_logs: logs }, midRead(logs, (L) => L.push(logRow(r, 'zz-new-set', A, '2026-10-28', 4000))));
    const got = await x.DB.listLogsForAthlete(A);
    sameSets(got, logs.filter(l => l.id !== 'zz-new-set'), n + ' sets:');
    ok(got.some(l => l.id === oldest), n + ' sets: the oldest');
    ok(!x.warns.length, 'nothing to say: ' + x.warns.join(' | '));
  }
  // Ten lifters a read: one of them logs while the desk loads.
  const r = rng(48), ids = [], logs = [];
  for (let k = 0; k < 10; k++) { const A = uuid(r); ids.push(A); for (let i = 0; i < 190; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2025, 0, 1) + i * 864e5), i)); }
  const x = loadDb({ workout_logs: logs }, midRead(logs, (L) => L.push(logRow(r, 'zz-new-set', ids[3], '2026-10-28', 4000))));
  const got = await x.DB.listLogsForAthletes(ids);
  sameSets(got, logs.filter(l => l.id !== 'zz-new-set'), 'roster:');
});
await t('workout logs: a set deleted mid-read (the lifter\'s Undo) never takes another with it', async () => {
  for (const [n, gone] of [[1500, 1], [2400, 3], [1500, 40]]) {
    const r = rng(60 + n + gone), A = uuid(r), logs = [];
    for (let i = 0; i < n; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2025, 0, 1) + Math.floor(i / 7) * 864e5), i));
    const newest = logs.slice().sort(logsDesc).slice(0, gone).map(l => l.id);
    const x = loadDb({ workout_logs: logs }, midRead(logs, (L) => newest.forEach(id => L.splice(L.findIndex(l => l.id === id), 1))));
    const got = await x.DB.listLogsForAthlete(A);
    sameSets(got, logs, n + ' sets, ' + gone + ' deleted:');
    eq(x.client.calls.length, Math.ceil((n - 1000) / 950) + 1, 'no read again: the overlap covered it');
  }
  const r = rng(77), ids = [], logs = [];
  for (let k = 0; k < 10; k++) { const A = uuid(r); ids.push(A); for (let i = 0; i < 150; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2025, 0, 1) + i * 864e5), i)); }
  const victim = logs.slice().sort(logsDesc)[2].id;
  const x = loadDb({ workout_logs: logs }, midRead(logs, (L) => L.splice(L.findIndex(l => l.id === victim), 1)));
  sameSets(await x.DB.listLogsForAthletes(ids), logs, 'roster:');
});
await t('workout logs: more sets gone mid-read than the overlap covers: read again; still moving, kept and said', async () => {
  const r = rng(91), A = uuid(r), logs = [];
  for (let i = 0; i < 2500; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2024, 0, 1) + Math.floor(i / 5) * 864e5), i));
  const cut = (L) => L.sort(logsDesc).splice(0, 120);   // a session of 120 sets deleted at once
  let x = loadDb({ workout_logs: logs }, midRead(logs, cut));
  const got = await x.DB.listLogsForAthlete(A);
  sameSets(got, logs, 'once:');
  eq(got.length, 2380, 'the read that went again has none of the deleted');
  eq(x.client.calls.filter(c => !c.from).length, 2, 'read again from the start, once');
  ok(!x.warns.length, 'nothing to say: ' + x.warns.join(' | '));
  // Deleting again before every first page: kept, partial, said.
  const logs2 = []; for (let i = 0; i < 2500; i++) logs2.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2024, 0, 1) + Math.floor(i / 5) * 864e5), i));
  x = loadDb({ workout_logs: logs2 }, { after: (st) => { if (st.table === 'workout_logs' && !st.from) cut(logs2); } });
  const res = await x.sbx._readAll('roster logs', (c) => x.sbx.sb.from('workout_logs').select('id, date', c).in('athlete_id', [A]), { order: [['date', false], ['created_at', false], ['id', false]], tiebreak: ['id'] });
  eq(res.partial, true);
  eq(res.rows.length, new Set(res.rows.map(l => l.id)).size, 'still none twice');
  ok(x.warns.some(w => /roster logs: rows moved too far while it was read \(twice\)/.test(w)), 'said: ' + x.warns.join(' | '));
});
await t('_readAll: rows told apart by id whenever the order has it (created_at not read); a key the read lacks is said', async () => {
  const r = rng(8), A = uuid(r), logs = [];
  for (let i = 0; i < 1500; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2025, 0, 1) + Math.floor(i / 7) * 864e5), i));
  let x = loadDb({ workout_logs: logs }, midRead(logs, (L) => L.push(logRow(r, 'zz-new-set', A, '2026-10-28', 4000))));
  let res = await x.sbx._readAll('t', (c) => x.sbx.sb.from('workout_logs').select('id, date', c).in('athlete_id', [A]), { order: [['date', false], ['created_at', false], ['id', false]], tiebreak: [] });
  eq(res.rows.length, 1500); eq(new Set(res.rows.map(l => l.id)).size, 1500, 'by id: none twice');
  eq(JSON.stringify(x.sbx._raPlan({ order: [['date', false], ['created_at', false], ['id', false]], tiebreak: [] }).key), '["id"]');
  eq(JSON.stringify(x.sbx._raPlan({ order: [['day', false]], tiebreak: ['athlete_id'] }).key), '["day","athlete_id"]', 'no id: the whole order');
  // A key the read doesn't carry (date ordered, only id read, no id in the order): edge-to-edge pages, as before, and said.
  x = loadDb({ workout_logs: logs.filter(l => l.id !== 'zz-new-set') });
  res = await x.sbx._readAll('nokey', (c) => x.sbx.sb.from('workout_logs').select('id', c).in('athlete_id', [A]), { order: [['date', false]], tiebreak: [] });
  eq(res.rows.length, 1500); eq(x.client.calls.map(c => c.from), [0, 1000]);
  ok(x.warns.some(w => /nokey: its rows carry no date/.test(w)), 'said: ' + x.warns.join(' | '));
});
await t('every paged read in db.js reads its own key (what tells its rows apart), and each one is exercised', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'db.js'), 'utf8');
  const labels = new Set([...src.matchAll(/_readAll(?:In)?\('([^']+)'/g), ...src.matchAll(/_readLogs\('([^']+)'/g)].map(m => m[1]));
  ok(labels.size >= 30, 'found ' + labels.size + ' paged reads');
  const C = 'c0ffee00-0000-4000-8000-000000000001', A = 'a0000000-0000-4000-8000-000000000002';
  const x = loadDb({ program_groups: [{ id: 'g1', coach_id: C, name: 'Seniors', created_at: '2026-10-01T00:00:00Z' }] });
  const seen = {}, orig = x.sbx._readAll;
  x.sbx._readAll = function (label, build, opts) {
    const q = build({ count: 'exact' });   // the query as built: its columns (nothing is run)
    (seen[label] = seen[label] || []).push({ cols: q.__st.cols, key: x.sbx._raPlan(opts).key });
    return orig.apply(this, arguments);
  };
  const D = x.DB, ids = [A];
  await Promise.all([
    D.listAthletesForCoach(C), D.listInvites(C), D.listProgramsForAthlete(A), D.listProgramsForCoach(C), D.listNutritionDaily(ids), D.listHealthDaily(ids),
    D.listPainReports(ids), D.listProgramBlocks(ids), D.listCoachNotes(C), D.listClientBilling(C), D.listClientPayments(C), D.listIntakes(C, ids), D.listIntakes(C),
    D.listScheduleRequests(C), D.listTemplates(C), D.listLogsForAthlete(A), D.listLogsForAthletes(ids), D.listBwForAthlete(A), D.listBwForAthletes(ids),
    D.listMeetsForAthlete(A), D.listMeetsForAthletes(ids), D.listTeams(C), D.listNotesForAthlete(A), D.listNotesForAthletes(ids), D.listCheckins(A),
    D.listCheckinsForAthletes(ids), D.listCheckinAnswers('2026-01-01'), D.listGoalsForAthletes(ids), D.listRestForAthlete(A), D.listMyPublishedPrograms(C),
    D.listMyPurchases(A), D.listMySales(C), D._myVoicePaths(C), D.listUnreadForUser(C), D.listChallengeEntries(['ch1'], C, C)
  ]);
  const missed = [...labels].filter(l => !seen[l]);
  eq(missed, [], 'every paged read exercised');
  Object.keys(seen).forEach(l => seen[l].forEach(({ cols, key }) => {
    const have = cols === '*' ? null : String(cols).split(',').map(c => c.trim());
    ok(key.length && (have === null || key.every(k => have.includes(k))), l + ': its key ' + key.join(' + ') + ' is not among ' + cols);
  }));
});
await t('workout logs: a lifter past 1,000 sets gets all of them, oldest first and as logged; the roster too', async () => {
  const r = rng(3), A = uuid(r), roster = [A];
  const logs = [];
  for (let i = 0; i < 2345; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2025, 0, 1) + Math.floor(i / 9) * 864e5), i));
  for (let k = 0; k < 24; k++) { const B = uuid(r); roster.push(B); for (let i = 0; i < 140 + k * 13; i++) logs.push(logRow(r, uuid(r), B, isoDay(Date.UTC(2026, 0, 1) + (i % 200) * 864e5), i)); }
  logs.sort(() => r() - 0.5);   // the table's physical order is nobody's order
  const capped = await fakeSupabase({ workout_logs: logs }).from('workout_logs').select('*').in('athlete_id', [A]).order('date', { ascending: true });
  eq(capped.data.length, 1000, 'the fake caps a plain read at 1000, as Supabase does (the old read)');
  let x = loadDb({ workout_logs: logs });
  const mine = await x.DB.listLogsForAthlete(A);
  eq(mine.length, 2345);
  const want = logs.filter(l => l.athlete_id === A).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1)).map(l => l.id);
  eq(mine.map(l => l.id), want, 'date, then as logged (created_at), then id');
  ok(mine.every(l => typeof l.e1rmComp === 'number' && l.athleteId === A && !('source' in l)), 'mapped (mapDbLog)');
  ok(x.client.calls.every(c => !/source|import_key|created_at/.test(c.cols)), 'the import columns and created_at stay on the server');
  x = loadDb({ workout_logs: logs });
  const all = await x.DB.listLogsForAthletes(roster);
  eq(all.length, logs.length, 'every set of the roster');
  eq(new Set(all.map(l => l.id)).size, logs.length);
  ok(x.client.calls.every(c => (c.inMax || 0) <= 10), '10 lifters a read');
  roster.forEach(id => {
    const got = all.filter(l => l.athleteId === id).map(l => l.id);
    const exp = logs.filter(l => l.athlete_id === id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : 1)).map(l => l.id);
    eq(got, exp, 'each lifter in their own order');
  });
});
await t('a group of lifters whose read fails is tried again; one that keeps failing is said', async () => {
  const r = rng(6), ids = [], logs = [];
  for (let k = 0; k < 25; k++) { const A = uuid(r); ids.push(A); for (let i = 0; i < 30; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2026, 0, 1) + i * 864e5), i)); }
  const inGroup = (st, id) => !!(st.inVals && st.inVals.includes(id));
  let n = 0;
  let x = loadDb({ workout_logs: logs }, { fail: (st) => (inGroup(st, ids[12]) && st.from === 0 && n++ === 0 ? { message: 'blip' } : null) });
  let got = await x.DB.listLogsForAthletes(ids);
  eq(got.length, logs.length, 'a blip: tried again, every set');
  x = loadDb({ workout_logs: logs }, { fail: (st) => (inGroup(st, ids[0]) ? { message: 'down' } : null) });   // the first group never comes
  got = await x.DB.listLogsForAthletes(ids);
  eq(got.length, logs.length - 300, 'the group that keeps failing is left out');
  ok(x.warns.some(w => /listLogsForAthletes: 10 of 25 ids could not be read/.test(w)), 'and said: ' + x.warns.join(' | '));
});
await t('workout logs: a read that stops at its ceiling keeps the newest sets (and says so)', async () => {
  const r = rng(4), A = uuid(r), logs = [];
  for (let i = 0; i < 2500; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2024, 0, 1) + i * 864e5 / 3), i));
  const x = loadDb({ workout_logs: logs });
  const got = await x.DB._readLogs('listLogsForAthlete', [A], 1, 1000);
  eq(got.length, 1000);
  const newest = logs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1)).slice(0, 1000).reverse().map(l => l.id);
  eq(got.map(l => l.id), newest, 'the newest 1000, oldest first');
  ok(x.warns.some(w => /read stopped at 1000 rows/.test(w)), 'said');
});
await t('workout logs: before workout_logs.gear exists, the read goes again without it', async () => {
  const r = rng(5), A = uuid(r), logs = [];
  for (let i = 0; i < 1200; i++) logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2026, 0, 1) + i * 864e5 / 4), i));
  const x = loadDb({ workout_logs: logs }, { missing: { workout_logs: ['gear'] } });
  const got = await x.DB.listLogsForAthlete(A);
  eq(got.length, 1200);
  eq(vm.runInContext('_noLogGear', x.sbx), true);
});
await t('unread: every unread message (past 1,000), badge columns only', async () => {
  const r = rng(7), C = uuid(r), A = uuid(r), msgs = [];
  for (let i = 0; i < 1500; i++) msgs.push({ id: uuid(r), coach_id: C, athlete_id: A, sender_id: A, body: 'x'.repeat(200), created_at: new Date(Date.UTC(2026, 0, 1) + i * 6e4).toISOString(), read_at: null, meta: null });
  const x = loadDb({ messages: msgs });
  const un = await x.DB.listUnreadForUser(C);
  eq(un.length, 1500);
  ok(x.client.calls.every(c => !/body|meta/.test(c.cols)), 'no bodies');
});
await t('coach inbox: one read gives the digest and the unread when the coach has under 500 messages', async () => {
  const r = rng(9), C = uuid(r), ids = [uuid(r), uuid(r), uuid(r)], msgs = [];
  ids.forEach((A, k) => { for (let i = 0; i < 40; i++) msgs.push({ id: uuid(r), coach_id: C, athlete_id: A, sender_id: i % 2 ? C : A, body: 'm' + i, created_at: new Date(Date.UTC(2026, 9, 1) + (k * 40 + i) * 36e5).toISOString(), read_at: i > 34 && i % 2 === 0 ? null : '2026-10-02T00:00:00Z', meta: null }); });
  let x = loadDb({ messages: msgs });
  const inbox = await x.DB.coachInbox(C);
  eq(x.client.calls.length, 1, 'one read');
  const y = loadDb({ messages: msgs });
  const [threads, unread] = await Promise.all([y.DB.listThreadsForCoach(C), y.DB.listUnreadForUser(C)]);
  eq(inbox.threads, threads, 'the same digest');
  const count = (list) => { const m = {}; list.forEach(u => { m[u.athleteId] = (m[u.athleteId] || 0) + 1; }); return m; };
  eq(count(inbox.unread), count(unread), 'the same unread counts');
  // 500 or more: the unread are read on their own (one more read).
  const many = []; for (let i = 0; i < 520; i++) many.push({ id: uuid(r), coach_id: C, athlete_id: ids[i % 3], sender_id: ids[i % 3], body: 'b', created_at: new Date(Date.UTC(2026, 0, 1) + i * 6e4).toISOString(), read_at: i < 10 ? null : '2026-02-01T00:00:00Z', meta: null });
  x = loadDb({ messages: many });
  const big = await x.DB.coachInbox(C);
  eq(big.unread.length, 10, 'the oldest unread, past the newest 500, still counted');
  eq(x.client.calls.length, 2);
  // The badges and the desk asking at the same moment share the thread read.
  x = loadDb({ messages: msgs });
  await Promise.all([x.DB.coachInbox(C), x.DB.listThreadsForCoach(C)]);
  eq(x.client.calls.length, 1, 'one read for both');
  // Nothing is kept between refreshes: the coach's reply that Realtime never delivered (a socket half
  // open after sleep, websockets blocked) is the last word at the next one, on both sides of 500.
  const mk = (id, A, s, at, body, meta) => ({ id, coach_id: C, athlete_id: A, sender_id: s, body, created_at: at, read_at: null, meta: meta || null });
  for (const [name, base, reads] of [['under 500', msgs, 1], ['past 500', many, 2]]) {
    const T2 = { messages: base.slice() };
    x = loadDb(T2);
    T2.messages.push(Object.assign(mk(uuid(r), ids[1], ids[1], new Date(Date.UTC(2026, 9, 27, 6)).toISOString(), 'how was my squat?'), { read_at: '2026-10-27T07:00:00Z' }));
    let got = await x.DB.coachInbox(C);
    eq(got.threads.find(t => t.athleteId === ids[1]).lastSenderId, ids[1], name + ': their message waits');
    T2.messages.push(mk(uuid(r), ids[1], C, new Date(Date.UTC(2026, 9, 28, 12)).toISOString(), 'looked solid'));   // never heard live
    T2.messages.push(mk(uuid(r), ids[2], ids[2], new Date(Date.UTC(2026, 9, 28, 12, 5)).toISOString(), 'quick question'));   // the message that brings the refresh
    T2.messages.push(mk(uuid(r), ids[0], C, new Date(Date.UTC(2026, 9, 28, 12, 10)).toISOString(), 'Week 3 notes', { weekly: '2026-10-27' }));
    const n0 = x.client.calls.length;
    got = await x.DB.coachInbox(C);
    eq(x.client.calls.length - n0, reads, name + ': reads a refresh');
    eq(got.threads.find(t => t.athleteId === ids[1]).lastSenderId, C, name + ': the reply is the last word');
    const fresh = loadDb({ messages: T2.messages.slice() });
    const [th2, un2] = await Promise.all([fresh.DB.listThreadsForCoach(C), fresh.DB.listUnreadForUser(C)]);
    const lastOf = (list) => list.map(t => [t.athleteId, t.lastAt, t.lastSenderId, t.lastBody, t.weeklyAt || null]);
    eq(lastOf(got.threads), lastOf(th2), name + ': who wrote last, as a fresh read says');
    eq(count(got.unread), count(un2), name + ': the unread, as a fresh read says');
  }
  // A message heard live while a thread read is on its way: the read asked for after it is its own
  // (the one on its way can't have it); with nothing heard in between, the two share one.
  x = loadDb({ messages: msgs.slice() });
  x.DB.subscribeMessages({ column: 'coach_id', value: C }, () => {});
  const ch = x.client.chans[x.client.chans.length - 1];
  const first = x.DB.coachInbox(C);
  ch.binds[0].fn({ new: mk(uuid(r), ids[0], ids[0], '2026-10-28T13:00:00.000000+00:00', 'new') });
  await Promise.all([first, x.DB.coachInbox(C)]);
  eq(x.client.calls.length, 2, 'a read of its own after a message was heard');
  x = loadDb({ messages: msgs.slice() });
  await Promise.all([x.DB.coachInbox(C), x.DB.coachInbox(C)]);
  eq(x.client.calls.length, 1, 'nothing heard between: one read');
  // A failed read hands back no digest (the desk keeps what it shows), and the unread on their own.
  x = loadDb({ messages: msgs.slice() }, { fail: (st) => (st.table === 'messages' && st.lim === 500 ? { message: 'down' } : null) });
  const failed = await x.DB.coachInbox(C);
  eq(failed.threads, null); eq(count(failed.unread), count(unread));
});
await t('hydrate (coach): every list past 1,000 rows comes back whole', async () => {
  const r = rng(11), C = uuid(r), roster = [], T = { profiles: [{ id: C, user_type: 'coach', name: 'C' }] };
  const today = isoDay(Date.now()), day = (n) => isoDay(Date.now() - n * 864e5);
  for (let i = 0; i < 30; i++) { const A = uuid(r); roster.push(A); T.profiles.push({ id: A, user_type: 'athlete', coach_id: C, name: 'L' + i }); }
  const fill = (name, n, mk) => { T[name] = []; for (let i = 0; i < n; i++) T[name].push(mk(i, roster[i % roster.length])); };
  fill('workout_logs', 5500, (i, A) => logRow(r, uuid(r), A, day(i % 300), i));
  fill('bodyweight', 1500, (i, A) => ({ id: uuid(r), athlete_id: A, date: day(Math.floor(i / 30)), weight: 80, created_at: 'x' }));
  fill('session_notes', 1200, (i, A) => ({ id: uuid(r), athlete_id: A, date: day(i % 200), note: 'n', created_at: day(i % 200) + 'T10:00:00Z', week_id: 'w', day_id: 'd', coach_comment: null, coach_comment_at: null, coach_id: C }));
  fill('checkins', 1100, (i, A) => ({ id: uuid(r), athlete_id: A, week_start: day(7 * Math.floor(i / 30)), sleep: 3, soreness: 2, stress: 2, feel: 4, note: '', created_at: 'x' }));
  fill('checkin_answers', 2500, (i, A) => ({ id: uuid(r), question_id: 'q' + (i % 4), athlete_id: A, coach_id: C, period: day(i % 60), value_num: 3, value_text: null, created_at: 'x', updated_at: 'x' }));
  fill('health_daily', 1020, (i, A) => ({ athlete_id: A, day: day(Math.floor(i / 30)), sleep_min: 400, rhr_bpm: 55, hrv_ms: 60, updated_at: 'x' }));   // 34 days × 30
  fill('nutrition_daily', 300, (i, A) => ({ athlete_id: A, day: day(Math.floor(i / 30)), kcal: 2500, protein_g: 150, updated_at: 'x' }));
  fill('pain_reports', 1100, (i, A) => ({ id: uuid(r), athlete_id: A, coach_id: C, day: day(i % 50), body_part: 'knee', severity: 3, created_at: day(i % 50) + 'T10:00:00Z', resolved_at: null }));
  fill('coach_notes', 1300, (i, A) => ({ id: uuid(r), coach_id: C, athlete_id: A, body: 'b', created_at: new Date(Date.UTC(2026, 0, 1) + i * 6e4).toISOString(), updated_at: null }));
  fill('program_sales', 1100, (i) => ({ id: uuid(r), coach_id: C, buyer_id: uuid(r), amount_cents: 100, created_at: new Date(Date.UTC(2026, 0, 1) + i * 6e4).toISOString() }));
  fill('program_blocks', 1050, (i, A) => ({ id: uuid(r), athlete_id: A, coach_id: C, name: 'b', maxes: null, stats: null, started_on: day(i + 30), ended_on: day(i), created_at: 'x' }));
  fill('meets', 1020, (i, A) => ({ id: uuid(r), athlete_id: A, name: 'm', meet_date: day(i), created_at: 'x' }));
  T.goals = roster.map(A => ({ athlete_id: A, squat: 200 }));
  const x = loadDb(T);
  const S = await x.DB.hydrateAll({ id: C, user_type: 'coach' });
  eq(S.athletes.length, 30);
  eq(S.workoutLogs.length, 5500, 'sets');
  eq(S.bodyweight.length, 1500, 'weigh-ins');
  eq(S.sessionNotes.length, 1200, 'session notes');
  eq(S.checkins.length, 1100, 'check-ins');
  eq(S.checkinAnswers.length, 2500, 'check-in answers (70 days)');
  eq(S.healthDaily.length, 1020, 'health (35 days)');
  eq(S.painReports.length, 1100, 'pain (60 days)');
  eq(S.coachNotes.length, 1300, 'coach notes');
  eq(S.mySales.length, 1100, 'sales');
  eq(S.programBlocks.length, 1050, 'past blocks');
  eq(S.meets.length, 1020, 'meets');
  eq(S.goals.length, 30, 'goals');
  ok(!x.client.calls.some(c => c.lim === 2000 || c.lim === 5000 || c.lim === 500 || c.lim === 300), 'no read leans on a .limit() past the cap');
});
await t('hydrate (lifter): 3,000 sets, all of them, in order; weigh-ins and notes too', async () => {
  const r = rng(13), A = uuid(r), T = { profiles: [{ id: A, user_type: 'athlete' }] };
  T.workout_logs = []; for (let i = 0; i < 3000; i++) T.workout_logs.push(logRow(r, uuid(r), A, isoDay(Date.UTC(2024, 0, 1) + Math.floor(i / 8) * 864e5), i));
  T.bodyweight = []; for (let i = 0; i < 1100; i++) T.bodyweight.push({ id: uuid(r), athlete_id: A, date: isoDay(Date.UTC(2023, 0, 1) + i * 864e5), weight: 80 });
  T.session_notes = []; for (let i = 0; i < 1050; i++) T.session_notes.push({ id: uuid(r), athlete_id: A, date: isoDay(Date.UTC(2023, 6, 1) + i * 864e5), note: 'n', created_at: 'x' });
  T.rest_days = []; for (let i = 0; i < 1001; i++) T.rest_days.push({ id: uuid(r), athlete_id: A, date: isoDay(Date.UTC(2022, 0, 1) + i * 864e5), note: '' });
  const x = loadDb(T);
  const S = await x.DB.hydrateAll({ id: A, user_type: 'athlete', coach_id: null });
  eq(S.workoutLogs.length, 3000);
  ok(S.workoutLogs.every((l, i, a) => !i || a[i - 1].date <= l.date), 'oldest first');
  eq(S.bodyweight.length, 1100); ok(S.bodyweight.every((b, i, a) => !i || a[i - 1].date <= b.date), 'weigh-ins oldest first');
  eq(S.sessionNotes.length, 1050); eq(S.restDays.length, 1001);
});
await t('pain channel: the roster only (athlete_id=in, 100 ids a binding), INSERT + UPDATE, never DELETE', async () => {
  const r = rng(17), ids = []; for (let i = 0; i < 230; i++) ids.push(uuid(r));
  const x = loadDb({ pain_reports: [] });
  const seen = [];
  const off = x.DB.subscribePainReports((rep, ev) => seen.push([rep.id, ev]), ids);
  const ch = x.client.chans[x.client.chans.length - 1];
  eq(ch.binds.length, 6, '3 chunks × (INSERT, UPDATE)');
  ok(ch.binds.every(b => b.f.table === 'pain_reports' && (b.f.event === 'INSERT' || b.f.event === 'UPDATE') && /^athlete_id=in\.\(/.test(b.f.filter)), 'filtered, no DELETE / *');
  ok(ch.binds.every(b => b.f.filter.slice(15, -1).split(',').length <= 100), '≤ 100 ids each');
  const all = new Set(ch.binds.flatMap(b => b.f.filter.slice(15, -1).split(',')));
  eq(all.size, 230, 'every lifter covered');
  // A new report reaches the callback; looked up again after the Undo window, gone → DELETE.
  const rep = { id: uuid(r), athlete_id: ids[0], day: '2026-10-28', body_part: 'knee', severity: 4, created_at: 'x' };
  ch.binds[0].fn({ eventType: 'INSERT', new: rep });
  eq(seen, [[rep.id, 'INSERT']]);
  eq(x.timers.length, 1, 'one re-check, after the Undo window');
  x.timers[0](); await new Promise(res => setTimeout(res, 20));
  eq(seen, [[rep.id, 'INSERT'], [rep.id, 'DELETE']], 'gone on the server: DELETE');
  // Still there: nothing more.
  x.sbx.sb; const kept = { id: uuid(r), athlete_id: ids[1], day: '2026-10-28', body_part: 'knee', severity: 4, created_at: 'x' };
  const y = loadDb({ pain_reports: [kept] });
  const seen2 = [];
  y.DB.subscribePainReports((rp, ev) => seen2.push(ev), ids);
  const ch2 = y.client.chans[0];
  ch2.binds[0].fn({ eventType: 'INSERT', new: kept }); y.timers[0](); await new Promise(res => setTimeout(res, 20));
  eq(seen2, ['INSERT'], 'still there: no DELETE');
  // No roster: no channel at all (an unfiltered one would hear everyone).
  const z = loadDb({});
  z.DB.subscribePainReports(() => {}, []);
  eq(z.client.chans.length, 0);
  // The live roster changes: the channel follows it.
  z.DB._painRoster([ids[0], ids[1]]);
  eq(z.client.chans.length, 1); eq(z.client.chans[0].binds[0].f.filter, 'athlete_id=in.(' + [ids[0], ids[1]].sort().join(',') + ')');
  off && off();
});

// ================================================================ 2. old vs new app.js
// The unit runner's sandbox, cut down: a Proxy DOM, a real Map localStorage, the clock fixed.
function appSandbox(src, nowMs) {
  const stub = (() => { const f = function () { return P; }; const P = new Proxy(f, { get(t2, p) { if (p === Symbol.toPrimitive) return () => ''; if (p === Symbol.iterator) return function* () {}; if (p === 'length') return 0; if (p === 'style' || p === 'classList') return P; if (p === 'dataset') return {}; return P; }, set() { return true; }, apply() { return P; }, has() { return true; } }); return P; })();
  const ls = new Map();
  const sbx = {};
  sbx.window = sbx; sbx.globalThis = sbx; sbx.self = sbx;
  sbx.addEventListener = () => {}; sbx.removeEventListener = () => {}; sbx.dispatchEvent = () => true;
  sbx.localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(String(k), String(v)), removeItem: k => ls.delete(k), clear: () => ls.clear(), key: i => [...ls.keys()][i] ?? null, get length() { return ls.size; } };
  sbx.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sbx.console = { log() {}, warn() {}, error() {}, info() {} };
  sbx.document = new Proxy({}, { get(t2, p) { if (p === 'documentElement' || p === 'body' || p === 'head') return stub; if (p === 'cookie') return ''; if (p === 'readyState') return 'complete'; return () => stub; } });
  sbx.navigator = { userAgent: 'node', language: 'en-US', onLine: true };
  sbx.location = { href: 'http://localhost/coach.html', search: '', hash: '', pathname: '/coach.html', origin: 'http://localhost', reload() {} };
  sbx.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  sbx.requestAnimationFrame = () => 0; sbx.cancelAnimationFrame = () => {};
  sbx.setTimeout = () => 0; sbx.clearTimeout = () => {}; sbx.setInterval = () => 0; sbx.clearInterval = () => {};
  sbx.fetch = () => Promise.reject(new Error('no network'));
  sbx.CustomEvent = function () { return {}; }; sbx.Event = function () { return {}; };
  sbx.IntersectionObserver = function () { return { observe() {}, disconnect() {} }; }; sbx.MutationObserver = function () { return { observe() {}, disconnect() {} }; };
  sbx.getComputedStyle = () => stub; sbx.URL = URL; sbx.URLSearchParams = URLSearchParams; sbx.Intl = Intl; sbx.crypto = webcrypto;
  vm.createContext(sbx);
  vm.runInContext('Date.now = function () { return ' + nowMs + '; };', sbx);
  vm.runInContext(src, sbx, { filename: 'app.js', timeout: 30000 });
  return sbx;
}
let oldSrc = null;
try { oldSrc = execFileSync('git', ['show', '9cca10b:app.js'], { cwd: ROOT, maxBuffer: 64 << 20 }).toString(); } catch (e) { oldSrc = null; }
const busySrc = fs.readFileSync(path.join(ROOT, 'busy-week.js'), 'utf8');
const newSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

// A roster with the awkward cases in it: ties on a date, equal e1RMs, lifters with no sets, a lifter
// with numeric ids or a duplicated id (the slow path), dates with a time in them (momentum not kept),
// e1rmComp as a string or missing, programs part done / done / missing, answers, notes, pain, health,
// food, weigh-ins, meets (planned / done), a cut, an approved busy week.
function roster(seed, lifters, perLifter, todayIso, odd) {
  const r = rng(seed), C = 'coach-' + seed, S = { athletes: [], programs: [], workoutLogs: [], bodyweight: [], sessionNotes: [], goals: [], restDays: [], checkins: [],
    messages: [], meets: [], checkinQuestions: [], checkinAnswers: [], programBlocks: [], painReports: [], healthDaily: [], nutritionDaily: [], scheduleRequests: [], intakes: [], coaches: [], invites: [], programTemplates: [] };
  const T = Date.parse(todayIso + 'T12:00:00Z'), day = (n) => isoDay(T - n * 864e5);
  const qs = [{ id: 'q1', coachId: C, prompt: 'Any pain or niggles?', kind: 'yesno', cadence: 'daily', active: true }, { id: 'q2', coachId: C, prompt: 'Soreness', kind: 'scale', cadence: 'daily', active: true }, { id: 'q3', coachId: C, prompt: 'Sleep hours', kind: 'number', cadence: 'daily', active: true }];
  S.checkinQuestions = qs;
  for (let i = 0; i < lifters; i++) {
    const A = 'a' + seed + '-' + i;
    S.athletes.push({ id: A, name: 'Lifter ' + i, coachId: C, createdAt: T - 90 * 864e5 });
    const n = i % 7 === 3 ? 0 : Math.floor(perLifter * (0.3 + r() * 1.4));
    const numeric = i % 11 === 5, dup = i % 13 === 7, timed = odd && i % 9 === 2;   // a time in a date crashes the old desk too: odd rosters only
    for (let k = 0; k < n; k++) {
      const lift = ['squat', 'bench', 'deadlift', 'other', 'squat'][Math.floor(r() * 5)];
      const d = day(Math.floor(r() * 160) - (i % 17 === 1 ? -2 : 0));
      const e = Math.round((100 + r() * 120) * 2) / 2;
      const log = { id: numeric ? k * 7 + 1 : 'L' + seed + '-' + i + '-' + String(k).padStart(5, '0') + (r() < 0.5 ? 'x' : ''), athleteId: A, lift, variant: 'Competition', exerciseName: lift === 'other' ? 'Row' : '',
        weight: Math.round(e * 0.8), reps: 3, rpe: 8, e1rm: e, e1rmComp: k % 97 === 5 ? String(e) : k % 89 === 3 ? undefined : (r() < 0.1 ? 150 : e), note: '', date: timed && k % 5 === 0 ? d + 'T09:30' : d };
      S.workoutLogs.push(log);
    }
    if (dup && n > 3) S.workoutLogs.push(Object.assign({}, S.workoutLogs[S.workoutLogs.length - 2], { date: day(3) }));
    if (i % 5 !== 4) {
      const mon = isoDay(T - (((new Date(T).getUTCDay() + 6) % 7) * 864e5));
      const weeks = [];
      for (let w = 0; w < 3; w++) weeks.push({ id: 'w' + w, number: w + 1, days: [0, 1, 2].map(dd => ({ id: 'd' + w + dd, name: 'Day', exercises: [{ id: 'e' + w + dd, lift: 'squat', variant: 'Competition', exerciseName: '',
        sets: [0, 1, 2].map(s => { const done = i % 6 === 0 || (w === 0 && dd <= (i % 3)); return { id: 's' + w + dd + s, weight: 140, reps: 3, rpe: 8, completed: done, actualRpe: done ? 8 + (s === 0 && i % 4 === 1 ? 1.5 : 0) : null, completedAt: done ? isoDay(Date.parse(mon + 'T12:00:00Z') + dd * 864e5) : null }; }) }] })) });
      S.programs.push({ id: 'p-' + A, athleteId: A, coachId: C, name: 'Block', weeks });
    }
    for (let d = 0; d < 40; d += 1 + (i % 3)) S.bodyweight.push({ id: 'bw' + A + d, athleteId: A, date: day(d), weight: 82 + (i % 5) + r() });
    for (let d = 0; d < 20; d++) qs.forEach((q, k) => { if ((i + d) % 4) S.checkinAnswers.push({ id: 'ca' + A + d + k, questionId: q.id, athleteId: A, coachId: C, period: day(d), num: k === 0 ? (r() < 0.2 ? 1 : 0) : k === 1 ? Math.round(r() * 10) : 5 + r() * 3 }); });
    for (let w = 0; w < 6; w++) if ((i + w) % 3) S.checkins.push({ id: 'ci' + A + w, athleteId: A, weekStart: day(7 * w + 3), sleep: 3, soreness: 2, stress: 2, feel: 4, createdAt: day(7 * w + 2) + 'T09:00:00Z' });
    for (let d = 0; d < 12; d++) if ((i + d) % 3 === 0) S.sessionNotes.push({ id: 'sn' + A + d, athleteId: A, date: day(d * 2), note: d % 4 ? 'felt ok' : ' ', coachComment: d % 2 ? 'nice' : null });
    if (i % 4 === 1) S.painReports.push({ id: 'pr' + A, athleteId: A, coachId: C, day: day(i % 10), bodyPart: 'low_back', side: null, severity: 3 + (i % 6), phase: 'top', lift: 'deadlift', note: '', createdAt: day(i % 10) + 'T10:00:00Z', resolvedAt: null });
    if (i % 3 === 0) for (let d = 0; d < 35; d++) S.healthDaily.push({ athleteId: A, day: day(d), sleepMin: 400, rhr: 52 + (d < 3 && i % 2 ? 9 : Math.round(r() * 3)), hrv: 55 + r() * 10 });
    if (i % 4 === 0) for (let d = 0; d < 14; d += 2) S.nutritionDaily.push({ athleteId: A, day: day(d), kcal: 2500, proteinG: 150 });
    if (i % 5 === 2) S.meets.push({ id: 'm' + A, athleteId: A, name: 'Open', date: day(-(8 + i % 30)), weightClass: '83', status: 'planned', planned: true });
    if (i % 5 === 3) S.meets.push({ id: 'md' + A, athleteId: A, name: 'Classic', date: day(5), weightClass: '93', squat: 200, bench: 130, deadlift: 240 });
    if (i % 6 === 2) S.goals.push({ id: A, athleteId: A, targetClass: 83, cutBy: day(-30) });
    if (i % 8 === 6) S.scheduleRequests.push({ id: 'sr' + A, athleteId: A, coachId: C, weekStart: isoDay(T - (((new Date(T).getUTCDay() + 6) % 7) * 864e5)), days: ['Mon', 'Thu'], status: 'approved' });
    if (i % 7 === 0) S.intakes.push({ athleteId: A, submittedAt: day(3) });
    for (let m = 0; m < 6; m++) S.messages.push({ id: 'msg' + A + m, coachId: C, athleteId: A, senderId: m % 2 ? C : A, body: 'b' + m, createdAt: new Date(T - (6 - m) * 7 * 36e5 - i * 6e4).toISOString(), readAt: m === 5 && i % 2 ? null : 'x' });
  }
  return { C, S, formChecks: S.athletes.filter((a, i) => i % 6 === 1).map((a, i) => ({ id: 'fc' + i, athleteId: a.id, lift: 'squat', note: '', coachReply: null })) };
}
// What the desk computes, from one VM, as JSON (programs and lifters by value).
const PROBE = `(function (C, today, nowMs, fc, extra) {
  const S = Store.get(), out = {};
  const ids = S.athletes.map(a => a.id);
  const threads = deskThreadDigest(C);
  out.rows = deskRows(C, { today, now: nowMs, threads, formChecks: fc });
  out.rows2 = deskRows(C, { today, now: nowMs, threads, formChecks: fc });
  out.status = ids.map(id => coachAthleteStatus(id, { coachId: C, today }));
  out.wins = ids.map(id => deskWins(id, { today }));
  out.trend = ids.map(id => deskTotalTrend(id, today));
  out.reasons = ids.map(id => deskReasons(id, { coachId: C, today, now: nowMs, threads, formChecks: fc }));
  out.mom = ids.map(id => [getE1RMMomentum(id), getE1RMMomentum(id, 14), getE1RMMomentum(id, 28), getE1RMMomentum(id, 10.5)]);
  out.pr = S.workoutLogs.map(l => { try { return isPRForLog(l.athleteId, l); } catch (e) { return 'throw'; } });
  out.prOther = (extra || []).map(l => { try { return isPRForLog(l.athleteId, l); } catch (e) { return 'throw'; } });
  out.lifetime = ids.map(id => getLifetimePRs(id));
  out.delta = ids.map(id => getWeeklyDelta(id));
  out.overview = getRosterOverview(C);
  out.attention = getRosterAttention(C);
  out.hints = ids.map(id => [getLastSetForExercise(id, 'squat', 'Competition', ''), getLastSetForExercise(id, 'other', '', 'Row'), getProgressionHint(id, 'squat', 'Competition', '', 140, 8), getProgressionHint(id, 'bench', 'Competition', '', 90, 7)]);
  out.anyOn = ids.map(id => [hasAnyLogOnDate(id, today), hasAnyLogOnDate(id, _addDaysISO(today, -3))]);
  out.days = ids.map(id => Array.from(new Set((S.workoutLogs || []).filter(l => l.athleteId === id).map(l => l.date))).sort());
  out.series = ids.map(id => strengthSeries((S.workoutLogs || []).filter(l => l.athleteId === id), 'total', { weeks: 12, today }));
  return JSON.stringify(out);
})`;
const DAYSET = `(function () { return JSON.stringify(Store.get().athletes.map(a => Array.from(logDateSet(a.id)).sort())); })`;
// The leaf helpers on odd rows (dates with a time, numeric and repeated ids, e1RMs as text or missing):
// the desk itself throws on a date with a time in it (old and new alike), these don't.
const LEAF = `(function (today) {
  const S = Store.get(), ids = S.athletes.map(a => a.id), out = {};
  const safe = (f) => { try { return f(); } catch (e) { return 'throw ' + (e && e.name); } };
  out.pr = S.workoutLogs.map(l => safe(() => isPRForLog(l.athleteId, l)));
  out.mom = ids.map(id => safe(() => [getE1RMMomentum(id), getE1RMMomentum(id, 14), getE1RMMomentum(id, 7.5)]));
  out.lifetime = ids.map(id => safe(() => getLifetimePRs(id)));
  out.hints = ids.map(id => safe(() => [getLastSetForExercise(id, 'squat', 'Competition', ''), getProgressionHint(id, 'squat', 'Competition', '', 140, 8)]));
  out.anyOn = ids.map(id => safe(() => hasAnyLogOnDate(id, today)));
  return JSON.stringify(out);
})`;

if (!oldSrc) console.log('SKIP old-vs-new: git could not give 9cca10b:app.js (a shallow clone?)');
else {
  const today = isoDay(Date.now()), nowMs = Date.parse(today + 'T15:20:00Z');
  const pair = (seed, lifters, per) => {
    const R = roster(seed, lifters, per, today);
    const json = JSON.stringify(R.S);
    const O = appSandbox(oldSrc + '\n;\n' + busySrc, nowMs), N = appSandbox(newSrc + '\n;\n' + busySrc, nowMs);
    [O, N].forEach(v => { v.__json = json; vm.runInContext('Store.set(JSON.parse(__json))', v); });
    const extra = JSON.stringify([
      { id: 'zz-new', athleteId: R.S.athletes[0].id, lift: 'squat', e1rmComp: 260, date: today },
      { id: 'L0', athleteId: R.S.athletes[1].id, lift: 'bench', e1rmComp: 999, date: '2000-01-01' },
      { id: 12, athleteId: R.S.athletes[2].id, lift: 'deadlift', e1rmComp: 300, date: today },
      { id: 'zz', athleteId: R.S.athletes[2].id, lift: 'deadlift', e1rmComp: 300, date: undefined }
    ].concat(R.S.workoutLogs.slice(0, 40).map(l => Object.assign({}, l, { date: today, e1rmComp: 400 }))));
    const probe = (v, ctxToday, ctxNow) => { v.__x = extra; v.__fc = JSON.stringify(R.formChecks); return vm.runInContext(PROBE + '(' + JSON.stringify(R.C) + ', ' + JSON.stringify(ctxToday) + ', ' + ctxNow + ', JSON.parse(__fc), JSON.parse(__x))', v); };
    const same = async (label, ctxToday, ctxNow) => {
      const a = probe(O, ctxToday || today, ctxNow || nowMs), b = probe(N, ctxToday || today, ctxNow || nowMs);
      if (a !== b) {
        const A = JSON.parse(a), B = JSON.parse(b);
        const k = Object.keys(A).find(key => JSON.stringify(A[key]) !== JSON.stringify(B[key]));
        const i = Array.isArray(A[k]) ? A[k].findIndex((x, j) => JSON.stringify(x) !== JSON.stringify(B[k][j])) : -1;
        throw new Error(label + ': ' + k + (i >= 0 ? '[' + i + ']' : '') + ' old ' + JSON.stringify(i >= 0 ? A[k][i] : A[k]).slice(0, 400) + ' new ' + JSON.stringify(i >= 0 ? B[k][i] : B[k]).slice(0, 400));
      }
      // trainingDays' set (coach.html) = the old filter's dates.
      eq(JSON.parse(vm.runInContext(DAYSET + '()', N)), JSON.parse(a).days, label + ': logDateSet');
    };
    const both = (code) => [O, N].forEach(v => vm.runInContext(code, v));
    return { O, N, R, same, both };
  };
  for (const [seed, lifters, per] of [[101, 25, 200], [202, 40, 120], [303, 12, 900], [404, 60, 60]]) {
    await t('old = new on a generated roster (seed ' + seed + ', ' + lifters + ' lifters)', async () => {
      const P = pair(seed, lifters, per);
      await P.same('first');
      await P.same('warm (memos)');
      // A push straight onto the list (no Store.update), as the athlete page and the tests do.
      P.both(`Store.get().workoutLogs.push({ id: 'push-1', athleteId: Store.get().athletes[0].id, lift: 'squat', variant: 'Competition', weight: 250, reps: 1, rpe: 10, e1rm: 255, e1rmComp: 255, date: ${JSON.stringify(today)} })`);
      await P.same('after a push');
      // A live burst: a new set, an answer replaced in place (liveUpsertRow), a session note.
      P.both(`liveApplyBatch(Store.get(), [
        { kind: 'log', row: { id: 'live-1', athleteId: Store.get().athletes[1].id, lift: 'bench', variant: 'Competition', weight: 180, reps: 1, rpe: 10, e1rm: 180, e1rmComp: 180, date: ${JSON.stringify(today)} } },
        { kind: 'answer', row: Object.assign({}, Store.get().checkinAnswers[0], { num: 1, period: ${JSON.stringify(today)} }) },
        { kind: 'note', row: { id: 'live-n', athleteId: Store.get().athletes[2].id, date: ${JSON.stringify(today)}, note: 'help', coachComment: null } }
      ], { role: 'coach', me: ${JSON.stringify(P.R.C)} })`);
      await P.same('after a live burst');
      // An edit in place through Store.update (the athlete's edit-a-set path).
      P.both(`Store.update(s => { const l = s.workoutLogs.find(x => x.athleteId === s.athletes[3].id && x.lift === 'squat') || s.workoutLogs[5]; l.e1rmComp = 999; l.weight = 900; l.date = ${JSON.stringify(today)}; })`);
      await P.same('after Store.update edits a set');
      // An edit in place with Store.bump (the rule for writes outside Store.update; old app.js has no bump).
      P.both(`Store.get().workoutLogs.slice(0, 50).forEach(l => { if (typeof l.e1rmComp === 'number') l.e1rmComp += 30; }); if (Store.bump) Store.bump();`);
      await P.same('after an edit in place + Store.bump');
      // A new list (a filter-reassign), then a new day and a new hour.
      P.both(`Store.get().workoutLogs = Store.get().workoutLogs.filter((l, i) => i % 9)`);
      await P.same('after a new list');
      const tomorrow = isoDay(Date.parse(today + 'T12:00:00Z') + 864e5);
      [P.O, P.N].forEach(v => vm.runInContext('Date.now = function () { return ' + (nowMs + 864e5) + '; };', v));
      await P.same('a day later', tomorrow, nowMs + 864e5);
      // Momentum at the day's edge (ceil(now / day) moves at UTC midnight): either side of it.
      const mid = Date.parse(tomorrow + 'T00:00:00Z');
      for (const at of [mid - 1, mid, mid + 1]) {
        [P.O, P.N].forEach(v => vm.runInContext('Date.now = function () { return ' + at + '; };', v));
        await P.same('momentum at ' + new Date(at).toISOString(), tomorrow, at);
      }
    });
  }
  await t('old = new on odd rows: dates with a time, numeric and repeated ids, e1RMs as text or missing', async () => {
    const R = roster(606, 30, 150, today, true);
    const json = JSON.stringify(R.S);
    ok(R.S.workoutLogs.some(l => /T/.test(l.date)) && R.S.workoutLogs.some(l => typeof l.id === 'number'), 'the odd rows are there');
    for (const at of [nowMs, Date.parse(today + 'T00:00:00Z'), Date.parse(today + 'T23:59:59Z')]) {
      const O = appSandbox(oldSrc, at), N = appSandbox(newSrc, at);
      [O, N].forEach(v => { v.__json = json; vm.runInContext('Store.set(JSON.parse(__json))', v); });
      const a = vm.runInContext(LEAF + '(' + JSON.stringify(today) + ')', O), b2 = vm.runInContext(LEAF + '(' + JSON.stringify(today) + ')', N);
      const b3 = vm.runInContext(LEAF + '(' + JSON.stringify(today) + ')', N);   // warm
      eq(b2, a, 'new = old at ' + new Date(at).toISOString());
      eq(b3, a, 'kept = old');
    }
  });
  await t('the memos let go: a lifter whose sets did not change keeps theirs, the one who logged is redone', async () => {
    const P = pair(505, 10, 100);
    const N = P.N;
    vm.runInContext('Store.bump(); deskRows(' + JSON.stringify(P.R.C) + ', {});', N);
    const before = JSON.parse(vm.runInContext('JSON.stringify(Store.get().athletes.map(a => _lmemoOf(a.id).size))', N));
    ok(before.every(n => n > 0), 'everyone has their numbers kept');
    vm.runInContext(`liveApplyBatch(Store.get(), [{ kind: 'log', row: { id: 'live-x', athleteId: Store.get().athletes[4].id, lift: 'squat', variant: 'Competition', weight: 300, reps: 1, rpe: 10, e1rm: 300, e1rmComp: 300, date: ${JSON.stringify(today)} } }], { role: 'coach', me: ${JSON.stringify(P.R.C)} })`, N);
    const after = JSON.parse(vm.runInContext('JSON.stringify(Store.get().athletes.map(a => _lmemoOf(a.id).size))', N));
    after.forEach((n, i) => { if (i === 4) eq(n, 0, 'the lifter who logged starts again'); else eq(n, before[i], 'lifter ' + i + ' keeps theirs'); });
    vm.runInContext('Store.update(() => {})', N);
    const deep = JSON.parse(vm.runInContext('JSON.stringify(Store.get().athletes.map(a => [_lmemoOf(a.id).size, _logsOf(a.id).length]))', N));
    ok(deep.every(([n, sets]) => (sets ? n === 0 : true)), 'Store.update (may have edited sets in place): everyone with sets starts again');
    ok(deep.some(([n, sets]) => !sets), 'the roster has a lifter with no sets (nothing of theirs can have changed)');
  });
}

console.log((fail ? 'FAILED ' : 'ok ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
