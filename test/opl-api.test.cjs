// node test/opl-api.test.cjs — the OpenPowerlifting proxy (api/opl.js) offline: CSV parsing and
// the input it refuses, without calling openpowerlifting.org.
const assert = require('assert');
const handler = require('../api/opl.js');
const rows = handler._parseCsv('Name,MeetName,Date\r\nRay,"Nationals, Day 2",2025-04-03\nAl,"The ""Big"" One",2024-01-02\n');
assert.deepStrictEqual(rows, [['Name', 'MeetName', 'Date'], ['Ray', 'Nationals, Day 2', '2025-04-03'], ['Al', 'The "Big" One', '2024-01-02']]);
assert.deepStrictEqual(handler._parseCsv('a,b\n"x\ny",z'), [['a', 'b'], ['x\ny', 'z']]);
const call = (url, method) => new Promise((resolve) => {
  const headers = {};
  const res = { statusCode: 200, setHeader: (k, v) => { headers[k.toLowerCase()] = v; }, end: (b) => resolve({ status: res.statusCode, headers, body: b ? JSON.parse(b) : null }) };
  handler({ method: method || 'GET', url }, res);
});
(async () => {
  for (const [url, status] of [['/api/opl?u=../../etc', 400], ['/api/opl?u=Ray%20W', 400], ['/api/opl?q=a', 400], ['/api/opl?q=%3Cscript%3E', 400], ['/api/opl', 400]]) {
    const r = await call(url);
    assert.strictEqual(r.status, status, url);
    assert.strictEqual(r.headers['access-control-allow-origin'], '*');
  }
  assert.strictEqual((await call('/api/opl?q=ray', 'POST')).status, 405);
  assert.strictEqual((await call('/api/opl?q=ray', 'OPTIONS')).status, 204);
  console.log('opl-api: all passed');
})();
