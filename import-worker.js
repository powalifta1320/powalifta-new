/* import-worker.js — the import intake reads a spreadsheet or a zip here, off the page's main thread (2026-10-28).
   SheetJS's parse of a big workbook (ten tabs of logs) can hold a phone for a second, and a zip of CSVs can unpack
   to 80 MB; in this worker the intake keeps answering while they run. import-core.js posts { id, job: 'book' | 'zip',
   bytes, opts } and gets { id, tables } back ({ id, tables, skipped } for a zip): the same results readWorkbook and
   unzip + tablesFromZip give on the page, card and payment columns already gone, every zip limit checked here
   (a workbook is a zip too). A refusal comes back as { id, error, code, user }. Same origin, so the site's CSP
   (script-src 'self') allows it; when a worker can't start ({ ready } never arrives), the page reads the file
   itself. Started only when someone opens a spreadsheet or a zip in the intake. */
self.importScripts('switch-kit.js', 'import-core.js', 'import-lib-fflate.js', 'import-lib-xlsx.js');
self.onmessage = function (e) {
  var m = e.data || {}, IC = self.ImportCore;
  try {
    if (m.job === 'zip') {
      var z = IC.tablesFromZip(IC.unzip(m.bytes));
      self.postMessage({ id: m.id, tables: z.tables, skipped: z.skipped });
    } else self.postMessage({ id: m.id, tables: IC.readWorkbook(m.bytes, m.opts || {}) });
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.message) || err), code: err && typeof err.code === 'string' ? err.code : '', user: !!(err && err.user) });
  }
};
self.postMessage({ ready: true });
