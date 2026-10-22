// OpenPowerlifting for POWALIFTA (2026-10-22): find a lifter by name, or read one lifter's meets.
//   GET /api/opl?q=Ray%20Williams  → { lifters: [{ username, name, federation, country, sex, equipment, weightClass, total, dots, date }] }
//   GET /api/opl?u=raywilliams1    → { username, name, meets: [{ date, name, federation, ..., attempts }] }
// openpowerlifting.org sends no CORS headers and the iPhone app calls from its own origin, so the
// app asks here. Read-only, one fixed host, answers cached at Vercel's edge so a lifter checking
// for new meets doesn't reach OpenPowerlifting each time. The data is public domain; the app
// credits OpenPowerlifting wherever it shows it.
'use strict';

const OPL = 'https://www.openpowerlifting.org';
const UA = 'POWALIFTA/1.0 (+https://www.powalifta.com)';
const MAX_BYTES = 2000000;
// Each request that gets past the edge cache reaches openpowerlifting.org under our name, so it is
// limited here (2026-10-22 security pass): a search makes at most 3 round trips (6 fetches), and
// one client IP gets 40 uncached requests an hour, all clients 600, per running instance. In
// memory, so best-effort across instances, but enough that a loop from one host can't turn this
// into a 16x amplifier that gets POWALIFTA's user agent blocked for every lifter.
const SEARCH_ROUNDS = 3;
const PER_IP_HOUR = 40;
const ALL_HOUR = 600;
const hits = new Map();
let hitsHour = 0;
function allow(ip, now) {
  const hour = Math.floor((now || Date.now()) / 3600000);
  if (hour !== hitsHour) { hits.clear(); hitsHour = hour; }
  const all = (hits.get('*') || 0) + 1;
  const mine = (hits.get(ip) || 0) + 1;
  if (all > ALL_HOUR || mine > PER_IP_HOUR) return false;
  hits.set('*', all); hits.set(ip, mine);
  if (hits.size > 20000) hits.clear();   // never grows without bound
  return true;
}
function clientIp(req) {
  const h = (req && req.headers) || {};
  const one = (v) => String(Array.isArray(v) ? v[0] : (v || '')).split(',')[0].trim();
  return (one(h['x-real-ip']) || one(h['x-forwarded-for']) || 'unknown').slice(0, 64);
}

async function get(path, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 6000);
  try {
    return await fetch(OPL + path, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctl.signal, redirect: 'error' });
  } finally { clearTimeout(t); }
}

const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v, max) => (v == null ? '' : String(v)).slice(0, max || 120);

// One rankings row: [rank, rank, name, username, instagram, vk, country, state, federation, date,
// meetCountry, meetState, meetPath, sex, equipment, age, division, bodyweight, weightClass,
// squat, bench, deadlift, total, dots]
function lifterFromRow(r) {
  return { username: str(r[3], 64), name: str(r[2], 80), country: str(r[6], 40), federation: str(r[8], 40), date: str(r[9], 10),
    sex: str(r[13], 4), equipment: str(r[14], 20), weightClass: str(r[18], 10), total: num(r[22]), dots: num(r[23]) };
}

// Each search answers the index of the next ranking row whose name matches; the row says who.
async function search(q) {
  const out = [], seen = new Set();
  const until = Date.now() + 7000;
  let start = 0;
  for (let i = 0; i < SEARCH_ROUNDS && out.length < 6 && Date.now() < until; i++) {
    const r = await get('/api/search/rankings?q=' + encodeURIComponent(q) + '&start=' + start);
    if (!r.ok) throw new Error('search ' + r.status);
    const j = await r.json();
    const idx = j && Number.isInteger(j.next_index) ? j.next_index : null;
    if (idx == null || idx < 0) break;
    const rr = await get('/api/rankings?start=' + idx + '&end=' + idx + '&lang=en&units=kg');
    if (!rr.ok) throw new Error('rows ' + rr.status);
    const row = (((await rr.json()) || {}).rows || [])[0];
    if (row && /^[a-z0-9]{1,64}$/.test(String(row[3] || '')) && !seen.has(row[3])) { seen.add(row[3]); out.push(lifterFromRow(row)); }
    start = idx + 1;
  }
  return out;
}

// RFC 4180: quoted fields may hold commas, quotes ("") and line breaks.
function parseCsv(text) {
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

async function lifter(u) {
  const r = await get('/api/liftercsv/' + u, 8000);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('lifter ' + r.status);
  const text = await r.text();
  if (text.length > MAX_BYTES) throw new Error('too big');
  const rows = parseCsv(text);
  const head = rows.shift() || [];
  const ix = {};
  head.forEach((h, i) => { ix[h] = i; });
  if (ix.Date == null || ix.MeetName == null) throw new Error('format');
  const v = (row, k) => (ix[k] == null ? '' : row[ix[k]]);
  const att = (row, lift) => [1, 2, 3, 4].map(n => num(v(row, lift + n + 'Kg')));
  const meets = rows.filter(row => /^\d{4}-\d{2}-\d{2}$/.test(v(row, 'Date'))).slice(0, 400).map(row => ({
    date: v(row, 'Date'), name: str(v(row, 'MeetName'), 120), federation: str(v(row, 'Federation'), 40), parentFederation: str(v(row, 'ParentFederation'), 40),
    country: str(v(row, 'MeetCountry'), 40), town: str(v(row, 'MeetTown'), 60),
    event: str(v(row, 'Event'), 4), equipment: str(v(row, 'Equipment'), 20), division: str(v(row, 'Division'), 40), sex: str(v(row, 'Sex'), 4),
    age: num(v(row, 'Age')), bodyweightKg: num(v(row, 'BodyweightKg')), weightClassKg: str(v(row, 'WeightClassKg'), 10),
    squat: num(v(row, 'Best3SquatKg')), bench: num(v(row, 'Best3BenchKg')), deadlift: num(v(row, 'Best3DeadliftKg')),
    total: num(v(row, 'TotalKg')), place: str(v(row, 'Place'), 6), dots: num(v(row, 'Dots')), tested: v(row, 'Tested') === 'Yes',
    attempts: { squat: att(row, 'Squat'), bench: att(row, 'Bench'), deadlift: att(row, 'Deadlift') }
  })).sort((a, b) => b.date.localeCompare(a.date));
  return { username: u, name: str(rows[0] ? v(rows[0], 'Name') : u, 80), meets };
}

function send(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Cache-Control', cache || 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = handler;
module.exports._parseCsv = parseCsv;   // for test/opl-api.test.cjs
module.exports._allow = allow;
async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  if (req.method !== 'GET') return send(res, 405, { error: 'method' });
  const url = new URL(req.url || '/', 'http://localhost');
  const q = (url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim();
  const u = (url.searchParams.get('u') || '').trim().toLowerCase();
  if ((u || q) && !allow(clientIp(req))) {
    res.setHeader('Retry-After', '3600');
    return send(res, 429, { error: 'busy' });
  }
  try {
    if (u) {
      if (!/^[a-z0-9]{1,64}$/.test(u)) return send(res, 400, { error: 'username' });
      const l = await lifter(u);
      if (!l) return send(res, 404, { error: 'not_found' }, 'public, s-maxage=3600');
      return send(res, 200, l, 'public, max-age=300, s-maxage=43200, stale-while-revalidate=604800');
    }
    if (q.length < 2 || q.length > 60 || /[<>{}\\[\]`"%]/.test(q)) return send(res, 400, { error: 'query' });
    return send(res, 200, { lifters: await search(q) }, 'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400');
  } catch (e) {
    return send(res, 502, { error: 'upstream' });
  }
}
