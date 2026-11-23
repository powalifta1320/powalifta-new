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
  /* a sheet's link as a coach copies it (the same rule as api/sheet.js): the address bar or Share's link, with or without
     /u/1/ (a second Google account) or /a/<domain>/ (an old Workspace link), a tab's #gid, or "Publish to the web".
     → { id } | { pub } | { drive: true } (a file in Drive, not a sheet) | { office: true, id } (an Excel file opened in Sheets) | null */
  function parseLink(text) {
    var t = String(text == null ? '' : text).trim(), m = /docs\.google\.com\/(?:a\/[^\/\s]+\/)?spreadsheets\/(?:u\/\d+\/)?d\/e\/(2PACX-[A-Za-z0-9_-]{20,140})(?![A-Za-z0-9_-])/.exec(t);
    if (m) return { pub: m[1] };
    m = /docs\.google\.com\/(?:a\/[^\/\s]+\/)?spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{25,100})(?![A-Za-z0-9_-])/.exec(t);
    if (m) return /[?&]rtpof=true/.test(t) ? { id: m[1], office: true } : { id: m[1] };
    if (/drive\.google\.com\/(?:file\/d\/|open\?id=)/.test(t)) return { drive: true };
    return null;
  }
  var short = function (t) { t = String(t || '').trim(); return t.length > 90 ? t.slice(0, 60) + '…' + t.slice(-20) : t; };

  function open(o) {
    o = o || {};
    var S = { src: 'paste', text: '', link: '', tables: [], tab: 0, over: {}, res: null, name: '', to: o.to || null, busy: '', err: '', from: '', seq: 0, closed: false };
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
      if (S.closed) return;
      /* a workbook is a zip: a small file can hold a very large sheet. Only so many tabs and rows are ever taken from it.
         IMPORT.prepare puts back the empty rows a workbook leaves out, offers week tabs as one program, and picks the tab
         that reads as the most programme */
      var pr = IM.prepare(tables, { names: names, maxTabs: MAX_TABS, maxRows: MAX_READ });
      S.tables = pr.tables; S.tab = pr.best;
      S.over = {}; S.err = ''; S.busy = ''; S.from = from || '';
      var t0 = S.tables[S.tab];
      if (!S.name && t0) S.name = (S.tables.length > 1 || !from ? (t0.of ? from || t0.name : t0.name) : from).replace(/\.(csv|tsv|txt|xlsx|xls|ods)$/i, '').slice(0, 60);
      analyse(); paint();
    }
    function fail(text) { if (S.closed) return; S.busy = ''; S.err = text; S.tables = []; S.res = null; paint(); }
    /* 22 Nov (sheets QA): every read is numbered. A second file dropped, or a second click on Read, while the first is
       still coming in wins; the first's answer is dropped, and nothing is painted after the screen is closed */
    function mine(n) { return !S.closed && n === S.seq; }
    function readBook(bytes, from, n) {
      n = n || ++S.seq;
      S.busy = 'Reading ' + (from || 'the workbook') + '…'; S.err = ''; paintSrc();
      libs().then(function (IC) {
        if (!mine(n)) return;
        var tables; try { tables = IC.readWorkbook(bytes, {}); } catch (e) { fail(e && e.user && e.message ? e.message : 'That file could not be read as a spreadsheet. Save it as .xlsx or .csv and try again.'); return; }
        if (!tables || !tables.length) { fail('That workbook has no tab with anything in it.'); return; }
        setTables(tables.filter(function (t) { return !t.hidden; }).length ? tables.filter(function (t) { return !t.hidden; }) : tables, from);
      }, function () { if (mine(n)) fail('The spreadsheet reader could not be loaded. Check the connection, or paste the cells instead.'); });
    }
    function readFile(f) {
      if (!f) return;
      var n = ++S.seq;
      if (!/\.(xlsx|xlsm|ods|csv|tsv|txt)$/i.test(f.name || '') && !/^text\//.test(f.type || '') && !/spreadsheet/.test(f.type || '')) { fail('“' + short(f.name) + '” is not a spreadsheet. Choose an .xlsx, .ods or .csv file' + (/\.xls$/i.test(f.name || '') ? ' (an old .xls: open it and save it as .xlsx first)' : '') + '.'); return; }
      if (f.size > MAX_FILE) { fail('That file is over 6 MB. Export just the program’s tab, or paste the cells.'); return; }
      var rd = new FileReader();
      if (/\.(csv|tsv|txt)$/i.test(f.name) || /^text\//.test(f.type || '')) { rd.onload = function () { if (mine(n)) setTables([{ name: f.name, rows: IM.table(String(rd.result || '')) }], f.name); }; rd.onerror = function () { if (mine(n)) fail('That file could not be read.'); }; rd.readAsText(f); return; }
      rd.onload = function () { if (mine(n)) readBook(new Uint8Array(rd.result), f.name, n); };
      rd.onerror = function () { if (mine(n)) fail('That file could not be read.'); };
      rd.readAsArrayBuffer(f);
    }
    /* the link, read once through the site's own function. What goes wrong is said with what to do, and the link the
       coach gave is said back to them, so a wrong copy is plain to see */
    function readLink() {
      var given = String(S.link || '').trim(), ref = parseLink(given);
      if (!given) { S.err = 'Paste the sheet’s link first: in Google Sheets, Share, then Copy link.'; paintSrc(); return; }
      if (ref && ref.drive) { S.err = 'That is a link to a file in Google Drive, not to a Google Sheet. Open it in Google Sheets and copy that link, or download it and choose the file. You gave: ' + short(given); paintSrc(); return; }
      if (!ref) { S.err = 'That is not a Google Sheets link. Copy it from the sheet’s address bar, or from Share, then Copy link. A Sheets link starts https://docs.google.com/spreadsheets/d/. You gave: ' + short(given); paintSrc(); return; }
      if (S.busy) return;
      var n = ++S.seq;
      S.busy = 'Reading the sheet…'; S.err = ''; paintSrc();
      var body = ref.pub ? { pub: ref.pub } : { id: ref.id };
      fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
        if (!mine(n)) return null;
        if (r.status === 200 && /spreadsheetml/.test(r.headers.get('content-type') || '')) return r.arrayBuffer().then(function (buf) { if (mine(n)) readBook(new Uint8Array(buf), 'Google Sheet', n); });
        return r.text().then(function (t) {
          if (!mine(n)) return;
          var code = ''; try { code = (JSON.parse(t) || {}).error || ''; } catch (e) { code = ''; }
          fail(linkWords(code, r.status, given, ref));
        }, function () { if (mine(n)) fail(linkWords('', r.status, given, ref)); });
      }).catch(function () { if (mine(n)) fail('The sheet could not be reached. Check the connection, or paste the cells instead.'); });
    }
    function linkWords(code, status, given, ref) {
      var you = ' The link you gave: ' + short(given);
      if (code === 'private') return 'That sheet is not shared with a link yet. In Google Sheets choose Share, then under General access pick Anyone with the link, as Viewer, and read it again.' + you;
      if (code === 'missing') return (ref && ref.office ? 'That is an Excel file opened in Google Sheets, which cannot be read by its link. In Sheets choose File, then Save as Google Sheets, and copy the new sheet’s link. Or download it and choose the file.' : 'Google has no sheet at that link, or it was deleted. Copy the link again from the sheet itself.') + you;
      if (code === 'big') return 'That sheet is over 4 MB. Copy the program’s tab into a new sheet and share that, or paste the cells.';
      if (code === 'busy') return 'Too many sheets have been read from here this hour. Paste the cells instead, or try again in an hour.';
      if (code === 'slow') return 'Google took too long to hand the sheet over. Try again, or paste the cells instead.';
      if (code === 'link') return 'That link has no sheet in it the reader can use. Copy it again from Share, then Copy link.' + you;
      if (code) return 'Google did not hand the sheet over. Try again, or download it as .xlsx and choose the file.';
      /* no answer from the function itself: a copy of the site with no /api (a local preview) */
      return 'The link reader runs on the live site, not on this copy. Paste the cells or choose the file instead.';
    }

    /* ---------- the picture ---------- */
    function srcHtml() {
      var tab = function (id, label) { return '<button type="button" data-im-src="' + id + '" aria-pressed="' + (S.src === id) + '">' + label + '</button>'; };
      var body = S.src === 'paste' ? '<textarea class="input im2-paste" id="im2-paste" spellcheck="false" placeholder="Select the cells in Google Sheets or Excel, copy, and paste them here" aria-label="Pasted cells">' + esc(S.text) + '</textarea>'
        : S.src === 'file' ? '<div class="im2-file"><button class="btn" type="button" id="im2-choose" data-im-choose>Choose a file</button><input type="file" id="im2-file" accept=".xlsx,.ods,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden><span class="im2-hint">.xlsx, .ods or .csv. You can also drop a file anywhere on this sheet.' + (S.from && S.tables.length ? ' Read: ' + esc(S.from) + '.' : '') + '</span></div>'
        : '<div class="im2-link"><label class="field"><input type="url" id="im2-link" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Google Sheets link" value="' + esc(S.link) + '"></label><button class="btn" type="button" id="im2-read" data-im-read' + (S.busy ? ' aria-disabled="true" aria-busy="true"' : '') + '>' + (S.busy ? 'Reading…' : 'Read the sheet') + '</button></div><p class="im2-hint">Share the sheet first: Share, then General access, Anyone with the link, Viewer. Every tab is read once, and you pick the one to import; nothing is kept and nothing in the sheet changes.</p>';
      return '<div class="seg im2-seg" role="group" aria-label="Where the program is">' + tab('paste', 'Paste') + tab('file', 'File') + tab('link', 'Google Sheets link') + '</div>' + body +
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
      var head = '<h3>What it becomes</h3><p class="im2-sum"><b>' + plural(res.lines.length, 'line') + '</b> on ' + plural(res.days.length, 'day') + ' over ' + plural(res.weeks, 'week') + '. ' + (nBad ? '<span class="im2-warn">' + plural(nBad, 'set') + ' could not be read.</span>' : plural(cells, 'set') + ' read' + ((res.notRead || []).some(function (x) { return !x.kept; }) ? '.' : ', none left out.')) + '</p>' +
        '<div class="im2-unit"><span>Loads are in</span><div class="seg" role="group" aria-label="Loads are in"><button type="button" data-im-unit="kg" aria-pressed="' + (unit === 'kg') + '">kg</button><button type="button" data-im-unit="lb" aria-pressed="' + (unit === 'lb') + '">lb</button></div></div>';
      /* 22 Nov (sheets QA): everything the reader did not take is listed here with the coach's own text and where it is:
         sets it could not read (kept as written, marked in the program), columns and rows it left out, and what it kept in
         a note instead. Nothing is dropped without a line here */
      var left = (res.notRead || []).filter(function (x) { return !x.kept; }), kept = (res.notRead || []).filter(function (x) { return x.kept; });
      var li = function (b, what) { return '<li><b>' + esc(what) + '</b><span title="' + esc(b.why || '') + '">' + esc((b.r >= 0 ? 'row ' + (b.r + 1) + ': ' : '') + '“' + b.text + '”' + (b.why ? '. ' + b.why : '')) + '</span></li>'; };
      var issues = nBad || left.length ? '<div class="im2-box"><h4>Not read</h4><ul class="im2-list">' +
        res.bad.slice(0, 12).map(function (b) { return li({ r: b.r, text: b.text, why: /date/.test(b.why) ? b.why : '' }, b.name); }).join('') +
        left.slice(0, 8).map(function (x) { return x.col != null ? '<li><b>' + esc(x.text) + '</b><span>' + esc(x.why) + '</span></li>' : x.row ? '<li><b>' + esc('Row ' + (x.r + 1)) + '</b><span>' + esc('“' + x.text + '”. ' + x.why) + '</span></li>' : li(x, x.name || 'Set'); }).join('') + '</ul>' +
        (nBad > 12 || left.length > 8 ? '<p class="im2-hint">And ' + plural(Math.max(0, nBad - 12) + Math.max(0, left.length - 8), 'more') + '.</p>' : '') +
        (nBad ? '<p class="im2-hint">' + (S.to === 'tpl' ? 'As a template, ' + (nBad === 1 ? 'that text goes' : 'their text goes') + ' in the exercise’s note. Into a lifter’s block, ' + (nBad === 1 ? 'it comes' : 'they come') + ' in as you wrote ' + (nBad === 1 ? 'it' : 'them') + ', marked unread, and that week cannot be sent until it is fixed.' : (nBad === 1 ? 'That set comes in' : 'Those sets come in') + ' as you wrote ' + (nBad === 1 ? 'it' : 'them') + ', marked unread in the program. A week with an unread set cannot be sent until it is fixed there, or fix the sheet and read it again.') + '</p>' : '') + '</div>' : '';
      var keptBox = kept.length ? '<div class="im2-box"><h4>Kept in a note</h4><ul class="im2-list">' + kept.slice(0, 8).map(function (x) { return li({ r: x.r, text: x.text }, x.name || 'Set'); }).join('') + '</ul></div>' : '';
      var t0 = S.tables[S.tab] || {}, facts = [];
      if (res.renumbered) facts.push('Your weeks ' + res.renumbered.from + ' to ' + res.renumbered.to + ' come in as weeks 1 to ' + (res.renumbered.to - res.renumbered.from + 1) + '. You choose where they start below.');
      if (t0.of) facts.push('Read from the tabs ' + t0.of.join(', ') + ', one week each.');
      if (t0.cut) facts.push('Only the first ' + MAX_READ.toLocaleString('en') + ' rows of ' + t0.cut.toLocaleString('en') + ' were read.');
      if (t0.dropped && t0.dropped.length) facts.push('Left out, as payment details: ' + t0.dropped.map(function (d) { return d && d.name ? d.name : String(d); }).join(', ') + '.');
      var factsHtml = facts.length ? facts.map(function (f) { return '<p class="im2-hint">' + esc(f) + '</p>'; }).join('') : '';
      var unk = res.unknown.length ? '<div class="im2-box"><h4>Names not in the library</h4><ul class="im2-list">' + res.unknown.slice(0, 16).map(function (n) { return '<li><b>' + esc(n) + '</b><button type="button" class="link" data-im-name="' + esc(n) + '" aria-haspopup="dialog">Match to an exercise…</button></li>'; }).join('') + '</ul><p class="im2-hint">Left alone, each comes in under its own name as your exercise.</p></div>' : '';
      var show = Math.min(res.weeks, 3);
      var prev = '<div class="im2-prev">' + res.days.map(function (d) {
        return '<h4>' + esc(d) + '</h4><table class="im2-p"><tbody>' + res.lines.filter(function (l) { return l.day === d; }).map(function (l) {
          var cells2 = ''; for (var w = 1; w <= show; w++) cells2 += '<td>' + esc(l.cells[w] || '') + '</td>';
          return '<tr><th scope="row"' + (l.line ? ' class="is-sub"' : '') + '>' + esc(l.line ? 'more sets' : l.name) + '</th>' + cells2 + '</tr>';
        }).join('') + '</tbody></table>';
      }).join('') + (res.weeks > show ? '<p class="im2-hint">Weeks 1 to ' + show + ' shown of ' + res.weeks + '.</p>' : '') + '</div>';
      return '<div class="im2-res">' + head + factsHtml + issues + keptBox + unk + prev + '</div>';
    }
    function saveHtml() {
      var ts = targets(); if (!S.to && ts[0]) S.to = ts[0].id;
      return '<div class="im2-save"><label class="im2-name"><span>Name</span><input class="input" id="im2-name" maxlength="60" aria-label="The program\u2019s name" value="' + esc(S.name) + '"></label>' +
        (ts.length ? '<div class="im2-to" role="radiogroup" aria-label="Import as">' + ts.map(function (t) { return '<button type="button" role="radio" class="im2-opt" aria-checked="' + (S.to === t.id) + '" data-im-to="' + esc(t.id) + '">' + esc(t.label) + '</button>'; }).join('') + '</div>' : '') +
        /* what the import will do where it lands, in the page's own words (22 Nov: a week was replaced with no warning) */
        (function () { var nt = typeof o.note === 'function' && S.res ? o.note({ lines: S.res.lines.length, weeks: S.res.weeks }, S.to) : ''; return nt ? '<p class="im2-note' + (nt.warn ? ' is-warn' : '') + '" role="note">' + esc(nt.text || nt) + '</p>' : ''; })() +
        /* 22 Nov (sheets QA): a template is saved without kilos (block.js asTemplate: they belong to one lifter's maxes) and
           without unread sets. Said before Import, never found out after */
        (function () { var k = S.to === 'tpl' && S.res ? kgOnly(S.res.block) : 0; return k ? '<p class="im2-note is-warn" role="note">' + esc('A template keeps sets, reps, RPE and percents, not kilos: ' + plural(k, 'load') + ' in kg ' + (k === 1 ? 'is' : 'are') + ' left out. Import into a lifter’s block to keep them.') + '</p>' : ''; })() + '</div>';
    }
    /* the sets whose only weight is kilos (no RPE, no percent): what a template cannot keep */
    function kgOnly(b) { var n = 0; (b && b.rows || []).forEach(function (row) { Object.keys(row.cells || {}).forEach(function (u) { var x = row.cells[u]; if (x && x.w != null && x.rpe == null && x.pct == null) n++; }); }); return n; }
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

    el = D.sheet.open({ label: 'Import a program', cls: 'is-import', html: '<div class="shb"><div class="shb-h"><h2>Import a program</h2><p>From your own spreadsheet. Check what was read, fix anything, then import.</p></div><div class="shb-b im2"><div class="im2-src"></div><div class="im2-check"></div></div><div class="shb-f"></div></div>', onClose: function () { clearTimeout(pasteT); S.closed = true; S.seq++; } });
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
        /* a template keeps no unread cells (block.js asTemplate): their text goes in the exercise's note, so it is not lost */
        if (S.to === 'tpl') S.res.block.rows.forEach(function (row) { if (!row.bad) return; var wk = S.res.block.weeks; var t = Object.keys(row.bad).map(function (u) { var i = wk.findIndex(function (w) { return w.uid === u; }); return 'week ' + (i + 1) + ': ' + row.bad[u]; }); if (t.length && (row.note || '').indexOf('Not read') < 0) row.note = (row.note ? row.note + ' · ' : '') + 'Not read from the sheet, ' + t.join('; '); });
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
    /* the ring goes when the file leaves the sheet, wherever inside it the pointer last was (it stayed lit when the drag
       left from a child: dragleave's target is the child) */
    el.ondragleave = function (e) { if (!e.relatedTarget || !el.contains(e.relatedTarget)) el.classList.remove('is-drop'); };
    el.ondrop = function (e) { el.classList.remove('is-drop'); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); S.src = 'file'; readFile(f); };
    return { el: el, state: S, setText: function (text) { S.src = 'paste'; S.text = String(text || ''); setTables([{ name: 'Pasted cells', rows: IM.table(S.text) }], ''); } };
  }

  W.IMPORTER = { open: open, parseLink: parseLink };
})();
