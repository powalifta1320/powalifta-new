/* import-worker.js — the import intake reads a spreadsheet here, off the page's main thread (2026-10-28).
   SheetJS's parse of a big workbook (ten tabs of logs) can hold a phone for a second; in this worker the
   intake keeps answering while it runs. import-core.js readWorkbookAsync posts { id, bytes, opts } and gets
   { id, tables } back: the same tables readWorkbook makes on the page, card and payment columns already gone.
   Same origin, so the site's CSP (script-src 'self') allows it; when a worker can't start, the page reads the
   file itself. Started only when someone opens a spreadsheet in the intake. */
self.importScripts('switch-kit.js', 'import-core.js', 'import-lib-xlsx.js');
self.onmessage = function (e) {
  var m = e.data || {};
  try { self.postMessage({ id: m.id, tables: self.ImportCore.readWorkbook(m.bytes, m.opts || {}) }); }
  catch (err) { self.postMessage({ id: m.id, error: String((err && err.message) || err) }); }
};
