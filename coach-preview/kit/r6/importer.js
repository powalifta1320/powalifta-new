/* importer.js: window.IMPORTER, the screen a coach's own spreadsheet comes in through (22 Nov; the owner: "Google Sheet
   importing should also be there, and it should automatically identify the program structure … let coaches correct
   column mappings before they save, and don't promise compatibility with every spreadsheet").

   Three ways in, one check screen:
     - paste the cells copied out of Google Sheets or Excel
     - choose or drop a file (.xlsx, .ods, .csv, .tsv): the workbook is read here in the browser, by the reader the main
       app already uses (import-core.js with the vendored SheetJS, loaded only when a workbook is opened)
     - paste a Google Sheets link: the sheet is read once through /api/sheet (it must be shared by link)
   Then the check: the coach's sheet as it is, with what each column and each row was read as. Any column or row can be
   changed and the programme beside it follows at once. What could not be read is listed with its own text. Names the
   library does not know can be matched through the exercise picker and are remembered. Nothing is saved until Import,
   and an import is a draft or a template: it never sends anything to a lifter.

     IMPORTER.open({ targets() → [{ id, label }], to, save({ block, name, lines, weeks }, targetId) → true | 'why not' })
   Loads after block.js, import.js, desk.js and picker.js. */
(function () {
  'use strict';
  var W = window, D = W.DESK, K = W.K, BL = W.BLOCK, IM = W.IMPORT;
  if (!D || !K || !BL || !IM) return;
  var esc = K.esc, ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } } };
  var NAMES = 'powa-r6-import-names';
  var HOME = (function () { var s = document.currentScript; return s && s.src ? s.src.replace(/coach-preview\/kit\/r6\/importer\.js.*$/, '') : '../../'; })();
  var LIBS = ['import-lib-fflate.js', 'import-lib-xlsx.js', 'switch-kit.js', 'import-core.js'];
  var MAX_ROWS = 80, MAX_FILE = 6 * 1024 * 1024, MAX_TABS = 12, MAX_READ = 3000;   /* rows shown; a file's size; tabs and rows taken from a workbook */
  var plural = function (n, w, ws) { return n + ' ' + (n === 1 ? w : (ws || w + 's')); };
  var low = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); };
  var libsP = null;
  /* the workbook reader, in order, once, only when a workbook is opened */
  function libs() {
    if (libsP) return libsP;
    W.__imNoWorker = true;   /* its worker's address is the main app's; here the workbook is read on the page */
    libsP = LIBS.reduce(function (p, f) {
      return p.then(function () { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = HOME + f; s.async = true; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('load')); }; document.head.appendChild(s); }); });
    }, Promise.resolve()).then(function () { return W.ImportCore; }, function (e) { libsP = null; throw e; });
    return libsP;
  }
  /* a sheet's link as a coach copies it (the same rule as api/sheet.js) */
  function parseLink(text) {
    var t = String(text == null ? '' : text).trim(), m = /docs\.google\.com\/spreadsheets\/d\/e\/(2PACX-[A-Za-z0-9_-]{20,140})/.exec(t);
    if (m) return { pub: m[1] };
    m = /docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{25,100})/.exec(t);
    return m ? { id: m[1] } : null;
  }

  function open(o) {
    o = o || {};
    var S = { src: 'paste', text: '', link: '', tables: [], tab: 0, over: {}, res: null, name: '', to: o.to || null, busy: '', err: '', from: '' };
    var names = {}; try { names = JSON.parse(ls.get(NAMES) || '{}') || {}; } catch (e) { names = {}; }
    var el, pasteT = 0;
    var overOf = function () { return S.over[S.tab] || (S.over[S.tab] = { roles: {}, kinds: {} }); };
    var targets = function () { return typeof o.targets === 'function' ? o.targets() || [] : []; };

    function analyse() {
      var t = S.tables[S.tab]; if (!t) { S.res = null; return; }
      var ov = overOf();
      S.res = IM.read(t.rows, { roles: ov.roles, kinds: ov.kinds, head: ov.head, unit: ov.unit, names: names, name: S.name || t.name });
    }
    /* the tab that reads as the most programme goes first */
    function setTables(tables, from) {
      /* a workbook is a zip: a small file can hold a very large sheet. Only so many tabs and rows are ever taken from it */
      S.tables = (tables || []).filter(function (t) { return t && t.rows && t.rows.length; }).slice(0, MAX_TABS).map(function (t) { return { name: String(t.name || 'Sheet').slice(0, 60), rows: t.rows.slice(0, MAX_READ), cut: t.rows.length > MAX_READ }; });
      S.over = {}; S.err = ''; S.from = from || '';
      var best = 0, most = -1;
      S.tables.forEach(function (t, i) { var r = IM.read(t.rows, { names: names }); var n = r.ok ? r.lines.length : -1; if (n > most) { most = n; best = i; } });
      S.tab = best;
      if (!S.name && S.tables[best]) S.name = (S.tables.length > 1 || !from ? S.tables[best].name : from).replace(/\.(csv|tsv|txt|xlsx|xls|ods)$/i, '').slice(0, 60);
      analyse(); paint();
    }
    function fail(text) { S.busy = ''; S.err = text; S.tables = []; S.res = null; paint(); }
    function readBook(bytes, from) {
      S.busy = 'Reading ' + (from || 'the workbook') + '…'; S.err = ''; paintSrc();
      libs().then(function (IC) {
        var tables; try { tables = IC.readWorkbook(bytes, {}); } catch (e) { fail(e && e.user && e.message ? e.message : 'That file could not be read as a spreadsheet. Save it as .xlsx or .csv and try again.'); return; }
        S.busy = '';
        if (!tables || !tables.length) { fail('That workbook has no tab with anything in it.'); return; }
        setTables(tables.filter(function (t) { return !t.hidden; }).length ? tables.filter(function (t) { return !t.hidden; }) : tables, from);
      }, function () { fail('The spreadsheet reader could not be loaded. Check the connection, or paste the cells instead.'); });
    }
    function readFile(f) {
      if (!f) return;
      if (f.size > MAX_FILE) { fail('That file is over 6 MB. Export just the programme’s tab, or paste the cells.'); return; }
      var rd = new FileReader();
      if (/\.(csv|tsv|txt)$/i.test(f.name) || /^text\//.test(f.type || '')) { rd.onload = function () { setTables([{ name: f.name, rows: IM.table(String(rd.result || '')) }], f.name); }; rd.onerror = function () { fail('That file could not be read.'); }; rd.readAsText(f); return; }
      rd.onload = function () { readBook(new Uint8Array(rd.result), f.name); };
      rd.onerror = function () { fail('That file could not be read.'); };
      rd.readAsArrayBuffer(f);
    }
    function readLink() {
      var ref = parseLink(S.link);
      if (!ref) { S.err = 'That is not a Google Sheets link. Copy it from the sheet’s address bar or its Share button.'; paintSrc(); return; }
      S.busy = 'Reading the sheet…'; S.err = ''; paintSrc();
      fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ref) }).then(function (r) {
        if (r.status === 200 && /spreadsheetml/.test(r.headers.get('content-type') || '')) return r.arrayBuffer().then(function (buf) { readBook(new Uint8Array(buf), 'Google Sheet'); });
        var words = { 403: 'That sheet is not shared. In Google Sheets choose Share, then General access, then Anyone with the link, and try again.', 404: 'Google has no sheet at that link. Copy the link again from the sheet itself.',
          413: 'That sheet is over 4 MB. Copy the programme’s tab into a new sheet, or paste the cells.', 429: 'Too many sheets have been read this hour. Paste the cells instead, or try again later.' }[r.status];
        fail(words || (r.status === 404 || r.status === 405 || r.status === 501 ? 'The link reader runs on the live site, not on this copy. Paste the cells or choose the file instead.' : 'Google did not hand the sheet over. Paste the cells or download it as .xlsx and choose the file.'));
      }, function () { fail('The sheet could not be reached. Check the connection, or paste the cells instead.'); });
    }

    /* ---------- the picture ---------- */
    function srcHtml() {
      var tab = function (id, label) { return '<button type="button" data-im-src="' + id + '" aria-pressed="' + (S.src === id) + '">' + label + '</button>'; };
      var body = S.src === 'paste' ? '<textarea class="input im2-paste" id="im2-paste" spellcheck="false" placeholder="Select the cells in Google Sheets or Excel, copy, and paste them here" aria-label="Pasted cells">' + esc(S.text) + '</textarea>'
        : S.src === 'file' ? '<div class="im2-file"><button class="btn" type="button" data-im-choose>Choose a file</button><input type="file" id="im2-file" accept=".xlsx,.ods,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><span class="im2-hint">.xlsx, .ods or .csv. You can also drop a file anywhere on this sheet.' + (S.from && S.tables.length ? ' Read: ' + esc(S.from) + '.' : '') + '</span></div>'
        : '<div class="im2-link"><label class="field"><input type="url" id="im2-link" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Google Sheets link" value="' + esc(S.link) + '"></label><button class="btn" type="button" data-im-read>Read the sheet</button></div><p class="im2-hint">The sheet has to be shared as Anyone with the link can view. It is read once; nothing is kept and nothing is changed in it.</p>';
      return '<div class="seg im2-seg" role="group" aria-label="Where the programme is">' + tab('paste', 'Paste cells') + tab('file', 'A file') + tab('link', 'Google Sheets link') + '</div>' + body +
        (S.busy ? '<p class="im2-busy" role="status">' + esc(S.busy) + '</p>' : '') + (S.err ? '<p class="im2-err" role="alert">' + esc(S.err) + '</p>' : '');
    }
    function roleSelect(c) {
      var cur = c.role || 'skip';
      return '<select class="im2-role" data-im-col="' + c.i + '" aria-label="' + esc('What column ' + (c.head || c.i + 1) + ' holds') + '"' + (cur === 'skip' ? ' data-skip' : '') + '>' +
        IM.ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === cur ? ' selected' : '') + '>' + esc((c.week != null && r[0] !== 'skip' ? 'Week ' + c.week + ': ' : '') + (c.week != null && r[0] === 'cell' ? 'whole set' : r[1])) + '</option>'; }).join('') + '</select>';
    }
    var KWORD = { line: 'Lift', day: 'Day', week: 'Week', head: 'Header', skip: 'Left out', blank: '' };
    function sheetHtml() {
      var res = S.res, A = res && res.analysis; if (!A || !A.rows.length) return '';
      var bad = {}; (res.bad || []).forEach(function (b) { bad[b.r + ':' + b.c] = b.why; });
      var rows = A.rows.slice(0, MAX_ROWS), more = A.rows.length - rows.length;
      return '<div class="im2-scroll" tabindex="0" role="region" aria-label="Your sheet"><table class="im2-t"><thead><tr><th class="im2-k" scope="col"><span class="sr">What the row is</span></th>' +
        A.cols.map(function (c) { return '<th scope="col">' + roleSelect(c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r, ri) {
          var k = (A.kinds[ri] || {}).kind || 'skip';
          if (k === 'blank') return '<tr class="is-blank"><td class="im2-k"></td><td colspan="' + A.width + '"></td></tr>';
          return '<tr class="is-' + k + '"><td class="im2-k"><button type="button" class="im2-kind" data-im-row="' + ri + '" aria-haspopup="menu" aria-label="' + esc('Row ' + (ri + 1) + ' is read as ' + (KWORD[k] || k) + '. Change') + '">' + esc(KWORD[k] || '') + '</button></td>' +
            r.map(function (x, ci) { var why = bad[ri + ':' + ci]; return '<td' + (why ? ' class="is-bad" title="' + esc(why) + '"' : '') + '>' + esc(x) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' + (more > 0 ? '<p class="im2-hint">And ' + plural(more, 'more row') + ', read the same way.</p>' : '');
    }
    function resultHtml() {
      var res = S.res; if (!res) return '';
      if (!res.ok) return '<div class="im2-res"><h3>Not read yet</h3><p class="im2-err" role="status">' + esc(res.why || 'This sheet could not be read.') + '</p><p class="im2-hint">Set what each column holds above the sheet, and mark which rows are lifts. If it still does not come through, paste one week at a time.</p></div>';
      var unit = (res.analysis && res.analysis.unit) || 'kg', nBad = res.bad.length, cells = (res.read && res.read.cells) || 0;
      var head = '<h3>What it becomes</h3><p class="im2-sum"><b>' + plural(res.lines.length, 'line') + '</b> on ' + plural(res.days.length, 'day') + ' over ' + plural(res.weeks, 'week') + '. ' + (nBad ? '<span class="im2-warn">' + plural(nBad, 'set') + ' could not be read.</span>' : plural(cells, 'set') + ' read, none left out.') + '</p>' +
        '<div class="im2-unit"><span>Loads are in</span><div class="seg" role="group" aria-label="Loads are in"><button type="button" data-im-unit="kg" aria-pressed="' + (unit === 'kg') + '">kg</button><button type="button" data-im-unit="lb" aria-pressed="' + (unit === 'lb') + '">lb</button></div></div>';
      var issues = nBad ? '<div class="im2-box"><h4>Not read</h4><ul class="im2-list">' + res.bad.slice(0, 12).map(function (b) { return '<li><b>' + esc(b.name) + '</b><span>' + esc('row ' + (b.r + 1) + ': “' + b.text + '”') + '</span></li>'; }).join('') + '</ul>' + (nBad > 12 ? '<p class="im2-hint">And ' + (nBad - 12) + ' more.</p>' : '') + '<p class="im2-hint">These sets are left empty. Fix them in the sheet and paste again, or write them in after importing.</p></div>' : '';
      var unk = res.unknown.length ? '<div class="im2-box"><h4>Names not in the library</h4><ul class="im2-list">' + res.unknown.slice(0, 16).map(function (n) { return '<li><b>' + esc(n) + '</b><button type="button" class="link" data-im-name="' + esc(n) + '" aria-haspopup="dialog">Match to an exercise…</button></li>'; }).join('') + '</ul><p class="im2-hint">Left alone, each comes in under its own name as your exercise.</p></div>' : '';
      var show = Math.min(res.weeks, 3);
      var prev = '<div class="im2-prev">' + res.days.map(function (d) {
        return '<h4>' + esc(d) + '</h4><table class="im2-p"><tbody>' + res.lines.filter(function (l) { return l.day === d; }).map(function (l) {
          var cells2 = ''; for (var w = 1; w <= show; w++) cells2 += '<td>' + esc(l.cells[w] || '') + '</td>';
          return '<tr><th scope="row"' + (l.line ? ' class="is-sub"' : '') + '>' + esc(l.line ? 'more sets' : l.name) + '</th>' + cells2 + '</tr>';
        }).join('') + '</tbody></table>';
      }).join('') + (res.weeks > show ? '<p class="im2-hint">Weeks 1 to ' + show + ' shown of ' + res.weeks + '.</p>' : '') + '</div>';
      return '<div class="im2-res">' + head + issues + unk + prev + '</div>';
    }
    function saveHtml() {
      var ts = targets(); if (!S.to && ts[0]) S.to = ts[0].id;
      return '<div class="im2-save"><label class="im2-name"><span>Name</span><input class="input" id="im2-name" maxlength="60" aria-label="The programme\u2019s name" value="' + esc(S.name) + '"></label>' +
        (ts.length ? '<div class="im2-to" role="radiogroup" aria-label="Import as">' + ts.map(function (t) { return '<button type="button" role="radio" class="im2-opt" aria-checked="' + (S.to === t.id) + '" data-im-to="' + esc(t.id) + '">' + esc(t.label) + '</button>'; }).join('') + '</div>' : '') +
        /* what the import will do where it lands, in the page's own words (22 Nov: a week was replaced with no warning) */
        (function () { var nt = typeof o.note === 'function' && S.res ? o.note({ lines: S.res.lines.length, weeks: S.res.weeks }, S.to) : ''; return nt ? '<p class="im2-note' + (nt.warn ? ' is-warn' : '') + '" role="note">' + esc(nt.text || nt) + '</p>' : ''; })() + '</div>';
    }
    function checkHtml() {
      if (!S.tables.length) return '<p class="im2-lede">Most layouts read: a line a row, a block for each day, weeks side by side or one under another. You check what was read before anything is saved. If a sheet does not come through, you will be told, and nothing is imported.</p>';
      var tabs = S.tables.length > 1 ? '<div class="im2-tabs" role="group" aria-label="Tabs in the workbook">' + S.tables.map(function (t, i) { return '<button type="button" class="im2-tab" data-im-tab="' + i + '" aria-pressed="' + (i === S.tab) + '">' + esc(t.name) + '</button>'; }).join('') + '</div>' : '';
      return tabs + '<div class="im2-cols"><div class="im2-left"><h3>Your sheet <small>Change what a column holds from the menu above it, or what a row is from the word beside it.</small></h3>' + sheetHtml() + '</div>' + resultHtml() + '</div>';
    }
    function footHtml() {
      var n = S.res && S.res.ok ? S.res.lines.length : 0;
      return (n ? saveHtml() : '<span class="im2-save"></span>') + '<button class="btn quiet" type="button" data-close>Cancel</button><button class="btn" type="button" data-primary data-im-go' + (n ? '' : ' disabled') + '>' + esc(n ? 'Import ' + plural(n, 'line') : 'Import') + '</button>';
    }
    function paintSrc() { var x = el && el.querySelector('.im2-src'); if (!x) return; var a = document.activeElement, id = a && a.id, pos = a && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; x.innerHTML = srcHtml(); if (D.segSync) [].forEach.call(x.querySelectorAll('.seg'), function (sg) { D.segSync(sg); }); if (id) { var n = el.querySelector('#' + id); if (n) { n.focus({ preventScroll: true }); if (pos) try { n.setSelectionRange(pos[0], pos[1]); } catch (e) { /* not text */ } } } }
    function paintCheck() {
      var x = el && el.querySelector('.im2-check'); if (!x) return;
      var sc = x.querySelector('.im2-scroll'), keep = sc ? [sc.scrollLeft, sc.scrollTop] : null, a = document.activeElement, nameHad = a && a.id === 'im2-name' ? [a.selectionStart, a.selectionEnd] : null;
      x.innerHTML = checkHtml();
      if (D.segSync) [].forEach.call(x.querySelectorAll('.seg'), function (sg) { D.segSync(sg); });
      var sc2 = x.querySelector('.im2-scroll'); if (sc2 && keep) { sc2.scrollLeft = keep[0]; sc2.scrollTop = keep[1]; }
      var f = el.querySelector('.shb-f'); if (f) f.innerHTML = footHtml();
      if (nameHad) { var nm = el.querySelector('#im2-name'); if (nm) { nm.focus({ preventScroll: true }); try { nm.setSelectionRange(nameHad[0], nameHad[1]); } catch (e) { /* fine */ } } }
      el.classList.toggle('has-sheet', S.tables.length > 0);
    }
    function paint() { paintSrc(); paintCheck(); }

    el = D.sheet.open({ label: 'Import a programme', cls: 'is-import', html: '<div class="shb"><div class="shb-h"><h2>Import a programme</h2><p>From your own spreadsheet. Check what was read, fix anything, then import.</p></div><div class="shb-b im2"><div class="im2-src"></div><div class="im2-check"></div></div><div class="shb-f"></div></div>', onClose: function () { clearTimeout(pasteT); } });
    paint();

    /* ---------- events ---------- */
    el.onclick = function (e) {
      var t = e.target, x;
      if ((x = t.closest('[data-im-src]'))) { S.src = x.getAttribute('data-im-src'); S.err = ''; paintSrc(); var f0 = el.querySelector(S.src === 'paste' ? '#im2-paste' : S.src === 'link' ? '#im2-link' : '[data-im-choose]'); if (f0) f0.focus(); return; }
      if (t.closest('[data-im-choose]')) { el.querySelector('#im2-file').click(); return; }
      if (t.closest('[data-im-read]')) { var li = el.querySelector('#im2-link'); S.link = li ? li.value : S.link; readLink(); return; }
      if ((x = t.closest('[data-im-tab]'))) { S.tab = +x.getAttribute('data-im-tab'); analyse(); paintCheck(); return; }
      if ((x = t.closest('[data-im-unit]'))) { overOf().unit = x.getAttribute('data-im-unit'); analyse(); paintCheck(); return; }
      if ((x = t.closest('[data-im-to]'))) { var nm0 = el.querySelector('#im2-name'); if (nm0) S.name = nm0.value; S.to = x.getAttribute('data-im-to'); paintCheck(); return; }
      if ((x = t.closest('[data-im-row]'))) {
        var ri = +x.getAttribute('data-im-row'), cur = ((S.res.analysis.kinds[ri] || {}).kind) || 'skip';
        D.menu.open(x, IM.KINDS.map(function (k) { return { id: k[0], label: k[1], checked: k[0] === cur }; }), { title: 'Row ' + (ri + 1) + ' is', run: function (id) { overOf().kinds[ri] = id; analyse(); paintCheck(); } });
        return;
      }
      if ((x = t.closest('[data-im-name]'))) {
        var nm = x.getAttribute('data-im-name'); if (!W.PICK) return;
        W.PICK.open(x, { title: 'What is ' + nm + '?', onPick: function (ex) { names[low(nm)] = ex.name; ls.set(NAMES, JSON.stringify(names)); analyse(); paintCheck(); if (D.toast) D.toast(nm + ' is read as ' + ex.name + ' from now on.'); } });
        return;
      }
      if (t.closest('[data-im-go]')) {
        if (!S.res || !S.res.ok) return;
        var nmEl = el.querySelector('#im2-name'); if (nmEl) S.name = nmEl.value.trim();
        var name = S.name || 'Imported program'; S.res.block.name = name;
        var out = typeof o.save === 'function' ? o.save({ block: S.res.block, name: name, lines: S.res.lines.length, weeks: S.res.weeks, bad: S.res.bad.length }, S.to) : 'Nowhere to save it.';
        if (out !== true) { S.err = typeof out === 'string' ? out : 'It could not be saved.'; paintSrc(); }
      }
    };
    el.onchange = function (e) {
      var t = e.target;
      if (t.id === 'im2-file') { readFile(t.files && t.files[0]); return; }
      if (t.matches('[data-im-col]')) { var ci = +t.getAttribute('data-im-col'), c = S.res.analysis.cols[ci]; overOf().roles[ci] = c && c.week != null ? { role: t.value, week: t.value === 'skip' ? null : c.week } : t.value; analyse(); paintCheck(); }
    };
    el.oninput = function (e) {
      var t = e.target;
      if (t.id === 'im2-paste') { S.text = t.value; clearTimeout(pasteT); pasteT = setTimeout(function () { if (!S.text.trim()) { S.tables = []; S.res = null; S.err = ''; paintCheck(); return; } S.name = S.name || ''; setTables([{ name: 'Pasted cells', rows: IM.table(S.text) }], ''); }, 200); }
      else if (t.id === 'im2-link') S.link = t.value;
      else if (t.id === 'im2-name') S.name = t.value;
    };
    el.onkeydown = function (e) { if (e.key === 'Enter' && e.target.id === 'im2-link') { e.preventDefault(); S.link = e.target.value; readLink(); } };
    /* a file dropped anywhere on the sheet */
    el.ondragover = function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); el.classList.add('is-drop'); } };
    el.ondragleave = function (e) { if (e.target === el) el.classList.remove('is-drop'); };
    el.ondrop = function (e) { el.classList.remove('is-drop'); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); S.src = 'file'; readFile(f); };
    return { el: el, state: S, setText: function (text) { S.src = 'paste'; S.text = String(text || ''); setTables([{ name: 'Pasted cells', rows: IM.table(S.text) }], ''); } };
  }

  W.IMPORTER = { open: open, parseLink: parseLink };
})();
