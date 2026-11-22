// node test/sheet-api.test.cjs: the Google Sheets link reader (api/sheet.js), offline. Google is mocked, so this
// checks what the function refuses, which hosts it will follow a redirect to, and what it hands back; it never calls
// docs.google.com. (The real route was checked by hand on 22 Nov against Google's public sample sheet.)
const assert = require('assert');
const handler = require('../api/sheet.js');

const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(60, 1)]);
// a fetch that answers from a script of [status, headers, body] by url
let calls = [];
const mock = (routes) => { calls = []; global.fetch = async (url, o) => { calls.push({ url: String(url), redirect: o && o.redirect }); const hit = routes.find((r) => String(url).indexOf(r[0]) === 0) || [null, 599, {}, '']; const body = Buffer.isBuffer(hit[3]) ? hit[3] : Buffer.from(String(hit[3] || '')); return { status: hit[1], ok: hit[1] >= 200 && hit[1] < 300, headers: { get: (k) => (hit[2] || {})[k.toLowerCase()] || null }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length) }; }; };
let ipN = 0;
const call = (body, o) => new Promise((resolve) => {
  o = o || {};
  const headers = {};
  const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: (b) => resolve({ status: res.statusCode, headers, body: b, json: (() => { try { return JSON.parse(b); } catch (e) { return null; } })() }) };
  handler({ method: o.method || 'POST', url: '/api/sheet', headers: Object.assign({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', 'x-real-ip': o.ip || '198.51.100.' + (++ipN) }, o.headers || {}), body }, res);
});

(async () => {
  // a coach's links, as copied
  assert.deepStrictEqual(handler._parseLink('https://docs.google.com/spreadsheets/d/' + ID + '/edit?usp=sharing#gid=0'), { id: ID });
  assert.deepStrictEqual(handler._parseLink('  https://docs.google.com/spreadsheets/d/' + ID + '  '), { id: ID });
  assert.deepStrictEqual(handler._parseLink('https://docs.google.com/spreadsheets/d/e/2PACX-1vQabcdefghijklmnopqrstuvwxyz0123456789/pubhtml'), { pub: '2PACX-1vQabcdefghijklmnopqrstuvwxyz0123456789' });
  assert.deepStrictEqual(handler._parseLink(ID), { id: ID });
  for (const bad of ['', 'https://example.com/spreadsheets/d/' + ID, 'https://docs.google.com/document/d/' + ID, 'https://docs.google.com/spreadsheets/d/../../etc/passwd', 'not a link']) assert.strictEqual(handler._parseLink(bad), null, bad);
  assert.strictEqual(handler._exportUrl({ id: ID }), 'https://docs.google.com/spreadsheets/d/' + ID + '/export?format=xlsx');

  // a sheet shared by link: Google redirects once to its download host, and the bytes come back as they are
  mock([['https://docs.google.com/spreadsheets/d/' + ID, 307, { location: 'https://doc-08-4o-sheets.googleusercontent.com/export/abc' }, ''], ['https://doc-08-4o-sheets.googleusercontent.com/', 200, { 'content-length': String(XLSX.length) }, XLSX]]);
  let r = await call({ id: ID });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['content-type'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  assert.strictEqual(r.headers['access-control-allow-origin'], undefined, 'no other site may read this');
  assert.ok(Buffer.isBuffer(r.body) && r.body.equals(XLSX));
  assert.ok(calls.every((c) => c.redirect === 'manual'), 'every hop is followed by hand');
  assert.strictEqual(calls.length, 2);

  // what it refuses before any fetch
  mock([]);
  assert.strictEqual((await call({ id: ID }, { method: 'GET' })).status, 405);
  assert.strictEqual((await call({ id: ID }, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.strictEqual((await call({ id: ID }, { headers: { 'content-type': 'text/plain' } })).status, 415);
  for (const body of [{}, { id: 'short' }, { id: '../../../etc/passwd' }, { id: 'https://evil.example/x' }, { url: 'https://evil.example/x' }, { id: 12345 }, { pub: 'nope' }, null]) assert.strictEqual((await call(body)).status, 400, JSON.stringify(body));
  assert.strictEqual(calls.length, 0, 'nothing was fetched for any of those');

  // a sheet that is not shared: Google sends the reader to sign in, or answers with its sign-in page
  mock([['https://docs.google.com/', 302, { location: 'https://accounts.google.com/ServiceLogin?continue=x' }, '']]);
  r = await call({ id: ID }); assert.deepStrictEqual([r.status, r.json], [403, { error: 'private' }]);
  mock([['https://docs.google.com/', 200, {}, '<!DOCTYPE html><html>Sign in</html>']]);
  r = await call({ id: ID }); assert.deepStrictEqual([r.status, r.json], [403, { error: 'private' }]);
  mock([['https://docs.google.com/', 401, {}, '']]);
  assert.strictEqual((await call({ id: ID })).status, 403);
  // no such sheet
  mock([['https://docs.google.com/', 400, {}, '']]);
  r = await call({ id: ID }); assert.deepStrictEqual([r.status, r.json], [404, { error: 'missing' }]);
  // a redirect anywhere else is never followed
  mock([['https://docs.google.com/', 307, { location: 'https://evil.example/steal' }, ''], ['https://evil.example/', 200, {}, XLSX]]);
  r = await call({ id: ID }); assert.strictEqual(r.status, 502); assert.strictEqual(calls.length, 1, 'the other host was never asked');
  mock([['https://docs.google.com/', 307, { location: 'http://doc-1-sheets.googleusercontent.com/x' }, '']]);
  assert.strictEqual((await call({ id: ID })).status, 502, 'never over plain http');
  mock([['https://docs.google.com/', 307, { location: 'https://googleusercontent.com.evil.example/x' }, '']]);
  assert.strictEqual((await call({ id: ID })).status, 502, 'a look-alike host is not Google’s');
  // too big, by its header or by its bytes
  mock([['https://docs.google.com/', 200, { 'content-length': String(5 * 1024 * 1024) }, XLSX]]);
  assert.strictEqual((await call({ id: ID })).status, 413);
  mock([['https://docs.google.com/', 200, {}, Buffer.concat([XLSX, Buffer.alloc(4 * 1024 * 1024 + 8)])]]);
  assert.strictEqual((await call({ id: ID })).status, 413);
  // not a workbook
  mock([['https://docs.google.com/', 200, {}, 'a,b,c']]);
  assert.strictEqual((await call({ id: ID })).status, 502);
  // a published sheet
  mock([['https://docs.google.com/spreadsheets/d/e/2PACX-1vQabcdefghijklmnopqrstuvwxyz0123456789/pub?output=xlsx', 200, {}, XLSX]]);
  assert.strictEqual((await call({ pub: '2PACX-1vQabcdefghijklmnopqrstuvwxyz0123456789' })).status, 200);

  // one reader: 30 sheets an hour, then 429 without reaching Google
  const T0 = 1700000000000;
  for (let i = 0; i < 30; i++) assert.strictEqual(handler._allow('203.0.113.1', T0), true);
  assert.strictEqual(handler._allow('203.0.113.1', T0), false);
  assert.strictEqual(handler._allow('203.0.113.2', T0), true);
  assert.strictEqual(handler._allow('203.0.113.1', T0 + 3600000), true);
  console.log('sheet-api: all passed');
})().catch((e) => { console.error('sheet-api: FAILED', e.message); process.exit(1); });
