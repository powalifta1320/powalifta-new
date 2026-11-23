// A Google Sheet a coach shared by link, read once so POWALIFTA can import it (22 Nov 2026).
//   POST /api/sheet   { "id": "<the sheet's id>" }  or  { "pub": "<a published sheet's id>" }
//   → 200, the workbook's bytes (.xlsx)            the browser reads the tabs itself
//   → 400 { error: 'link' }    the id is not a sheet's id
//   → 403 { error: 'private' } the sheet is not shared with "anyone with the link"
//   → 404 { error: 'missing' } Google has no such sheet
//   → 413 { error: 'big' }     over 4 MB
//   → 429 { error: 'busy' }    too many reads this hour
//   → 502 { error: 'upstream' } Google answered with something else
//   → 504 { error: 'slow' }     Google took longer than 9 s
// Why a function: Google's export sends no CORS headers, so a page cannot read it directly. This reads
// one fixed host, follows Google's own redirect to its download host and nowhere else, keeps nothing,
// logs nothing about the sheet, and answers only this site's own pages. The id comes in the body, never
// in the address, because a link-shared sheet's id is its key.
// Not for the iPhone app as written: its web view calls from another origin, and this sends no CORS headers
// and refuses cross-site requests (api/opl.js does the opposite, on purpose). Import lives on the laptop site.
'use strict';

const DOCS = 'https://docs.google.com';
const UA = 'POWALIFTA/1.0 (+https://www.powalifta.com)';
const MAX_BYTES = 4 * 1024 * 1024;
const PER_IP_HOUR = 30;
const ALL_HOUR = 400;
// Google's export answers 307 to its download host: doc-08-4o-sheets.googleusercontent.com (checked 22 Nov).
const DOWNLOAD_HOST = /^[a-z0-9-]+\.googleusercontent\.com$/;
const ID_RE = /^[A-Za-z0-9_-]{25,100}$/;
const PUB_RE = /^2PACX-[A-Za-z0-9_-]{20,140}$/;

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
// A sheet's link, as a coach copies it → { id } or { pub } or null. The page uses the same rule.
//   https://docs.google.com/spreadsheets/d/<id>/edit#gid=0        the share link (also ?usp=sharing, ?gid=, /htmlview)
//   https://docs.google.com/spreadsheets/u/1/d/<id>/edit          the same, signed in to a second Google account
//   https://docs.google.com/a/<domain>/spreadsheets/d/<id>/edit   an old Workspace link
//   https://docs.google.com/spreadsheets/d/e/<2PACX-…>/pubhtml    "Publish to the web" (also /pub?output=csv)
const PATH = 'docs\\.google\\.com\\/(?:a\\/[^\\/\\s]+\\/)?spreadsheets\\/(?:u\\/\\d+\\/)?d\\/';
const PUB_LINK = new RegExp(PATH + 'e\\/(2PACX-[A-Za-z0-9_-]+)'), ID_LINK = new RegExp(PATH + '([A-Za-z0-9_-]+)');
function parseLink(text) {
  const t = String(text == null ? '' : text).trim();
  if (!/^(?:https?:\/\/)?docs\.google\.com\//i.test(t) && /[\/:]/.test(t)) return null;   // a link to anywhere else, even one that names docs.google.com in its path
  let m = PUB_LINK.exec(t);
  if (m && PUB_RE.test(m[1])) return { pub: m[1] };
  m = ID_LINK.exec(t);
  if (m && ID_RE.test(m[1])) return { id: m[1] };
  if (PUB_RE.test(t)) return { pub: t };
  if (ID_RE.test(t)) return { id: t };
  return null;
}
function exportUrl(ref) {
  return ref.pub ? DOCS + '/spreadsheets/d/e/' + ref.pub + '/pub?output=xlsx' : DOCS + '/spreadsheets/d/' + ref.id + '/export?format=xlsx';
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null;
  if (raw == null && typeof req.on === 'function') {
    raw = await new Promise((resolve, reject) => {
      let s = '', n = 0;
      req.on('data', (c) => { n += c.length; if (n > 4096) { reject(new Error('body')); return; } s += c; });
      req.on('end', () => resolve(s)); req.on('error', reject);
    });
  }
  try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
}
const looksHtml = (buf) => /<html|<!doctype/i.test(buf.slice(0, 200).toString('utf8'));
// Google's sign-in page, served in place of the file: the sheet is not shared by link. Any other page is Google's error.
const looksSignIn = (buf) => /accounts\.google\.com|ServiceLogin|\bsign[ -]?in\b/i.test(buf.slice(0, 20000).toString('utf8'));
// The body, read as it arrives and dropped the moment it passes the cap: Google sends no Content-Length on some
// exports, and a whole oversized sheet must never sit in the function's memory. → Buffer, or null when too big.
async function readCapped(r, max) {
  if (!r.body || typeof r.body.getReader !== 'function') { const all = Buffer.from(await r.arrayBuffer()); return all.length > max ? null : all; }
  const reader = r.body.getReader(), chunks = [];
  let n = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    n += step.value.length;
    if (n > max) { try { await reader.cancel(); } catch (e) { /* already closed */ } return null; }
    chunks.push(Buffer.from(step.value));
  }
  return Buffer.concat(chunks);
}
// One hop at a time, so a redirect is only ever followed to Google's download host.
async function fetchSheet(ref, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs || 9000);
  try {
    let url = exportUrl(ref);
    for (let hop = 0; hop < 4; hop++) {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctl.signal, redirect: 'manual' });
      if (r.status >= 300 && r.status < 400) {
        let next;
        try { next = new URL(r.headers.get('location') || '', url); } catch (e) { return { status: 502, error: 'upstream' }; }
        if (next.protocol !== 'https:') return { status: 502, error: 'upstream' };
        // Google sends a reader who may not see the sheet to its sign-in page: the sheet is not shared by link.
        if (/(^|\.)accounts\.google\.com$/.test(next.hostname) || /ServiceLogin|signin/i.test(next.pathname)) return { status: 403, error: 'private' };
        if (!(next.hostname === 'docs.google.com' || DOWNLOAD_HOST.test(next.hostname))) return { status: 502, error: 'upstream' };
        url = next.href; continue;
      }
      if (r.status === 401 || r.status === 403) return { status: 403, error: 'private' };
      if (r.status === 400 || r.status === 404 || r.status === 410) return { status: 404, error: 'missing' };
      if (!r.ok) return { status: 502, error: 'upstream' };
      const len = Number(r.headers.get('content-length') || 0);
      if (len > MAX_BYTES) return { status: 413, error: 'big' };
      const buf = await readCapped(r, MAX_BYTES);
      if (!buf) return { status: 413, error: 'big' };
      // An .xlsx is a zip. Anything else (Google's sign-in page as HTML, an error page) is not the sheet.
      if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return looksHtml(buf) && looksSignIn(buf) ? { status: 403, error: 'private' } : { status: 502, error: 'upstream' };
      return { status: 200, bytes: buf };
    }
    return { status: 502, error: 'upstream' };
  } catch (e) {
    if (ctl.signal.aborted) return { status: 504, error: 'slow' };
    return { status: 502, error: 'upstream' };
  } finally { clearTimeout(t); }
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

module.exports = handler;
module.exports._parseLink = parseLink;   // for test/sheet-api.test.cjs and the import screen's own copy
module.exports._allow = allow;
module.exports._exportUrl = exportUrl;
module.exports._fetchSheet = fetchSheet;
async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method' }); }
  // This site's own pages only: no CORS headers are sent, and a request a browser marks as coming from
  // another site is refused before anything is fetched.
  const h = req.headers || {};
  const site = String(h['sec-fetch-site'] || '').toLowerCase();
  if (site && site !== 'same-origin' && site !== 'none') return send(res, 403, { error: 'origin' });
  // A request that names where it came from must name this site (a browser always does on a POST; a script
  // that sends none is held only by the limiter, which is per running instance: a courtesy, not a cap).
  if (h.origin) {
    let from = '';
    try { from = new URL(String(h.origin)).host.toLowerCase(); } catch (e) { from = ''; }
    const here = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim().toLowerCase();
    if (!from || (from !== here && !/^(www\.)?powalifta\.com$/.test(from))) return send(res, 403, { error: 'origin' });
  }
  if (!/^application\/json\b/i.test(String(h['content-type'] || ''))) return send(res, 415, { error: 'type' });
  let body;
  try { body = await readBody(req); } catch (e) { return send(res, 400, { error: 'link' }); }
  const ref = body && typeof body.pub === 'string' && PUB_RE.test(body.pub) ? { pub: body.pub } : body && typeof body.id === 'string' && ID_RE.test(body.id) ? { id: body.id } : null;
  if (!ref) return send(res, 400, { error: 'link' });
  if (!allow(clientIp(req))) { res.setHeader('Retry-After', '3600'); return send(res, 429, { error: 'busy' }); }
  let out;
  try { out = await fetchSheet(ref); } catch (e) { out = { status: 502, error: 'upstream' }; }
  if (out.status !== 200) return send(res, out.status, { error: out.error });
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Length', String(out.bytes.length));
  res.end(out.bytes);
}
