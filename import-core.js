/* =====================================================================
   import-core.js — the import intake's reading side (2026-10-28)
   A coach switching to POWALIFTA brings whatever they have: a client list, years of logs, a
   program in a workbook, a zip from an athlete app. This file turns any of it into tables of text,
   finds the header row, recognises the files whose columns are published, classifies the layout
   (a client list, a log with one row per set, a wide "Set 1 / Set 2" sheet, a program grid of weeks
   across, a program table, a training journal) and maps each column to a field, asking the coach
   only about the columns it can't place. Pure: unit-tested in tests.html ("imports (import-core.js)").
   The screens are import-ui.js; sets are built by switch-kit.js (planHistoryRows), programs are
   checked in program-photo.js's review grid.

   Recognisers are only for files whose columns are published: TrueCoach's and CoachRx's client
   lists (every header, vendor help centre), Trainerize's and TrainHeroic's (the fields, not the
   header spelling, so they're matched by field), Strong / Hevy / FitNotes (the switch kit's own
   fingerprints), Hevy's API workouts (OpenAPI spec). Anything else goes through the mapper.
   Card, payment and revenue columns are dropped the moment a table is built: no screen, no
   mapping memory and no import ever sees them.

   Loaded lazily by switch-kit.js (SwitchKit.openIntake), never on page boot. The vendored readers
   load lazily too: import-lib-xlsx.js (SheetJS CE, .xlsx / .ods) and import-lib-fflate.js (.zip).
   ===================================================================== */
var ImportCore = (function () {
  'use strict';
  var SK = function () { return window.SwitchKit; };
  var hkey = function (h) { return SK().hkey(h); };
  var MAX_COLS = 80, ZIP_MAX_FILES = 400, ZIP_MAX_BYTES = 80 * 1024 * 1024, ZIP_MAX_ONE = 20 * 1024 * 1024;
  var EMAIL_RE = /^[^\s@,;<>"']+@[^\s@,;<>"']+\.[a-z]{2,}$/i;

  function toU8(b) {
    if (!b) return new Uint8Array(0);
    if (b instanceof Uint8Array) return b;
    if (typeof ArrayBuffer !== 'undefined' && b instanceof ArrayBuffer) return new Uint8Array(b);
    if (b.buffer && typeof b.byteLength === 'number') return new Uint8Array(b.buffer, b.byteOffset || 0, b.byteLength);
    return new Uint8Array(b);
  }
  function baseName(n) { return String(n || '').split(/[\\/]/).pop() || String(n || ''); }

  // ================================================================= bytes → text
  // A file's text, whatever saved it: UTF-8 (with or without a BOM), UTF-16 (Excel's "Unicode
  // text", with a BOM, or without one when every other byte is 0), else Windows-1252 (an old
  // Excel CSV with "José" or "€" that isn't valid UTF-8). → { text, encoding }
  function decodeBytes(bytes) {
    var u8 = toU8(bytes), enc = 'utf-8', start = 0;
    if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) start = 3;
    else if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) { enc = 'utf-16le'; start = 2; }
    else if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) { enc = 'utf-16be'; start = 2; }
    else {
      var n = Math.min(u8.length, 4000), zOdd = 0, zEven = 0;
      for (var i = 0; i < n; i++) if (u8[i] === 0) { if (i % 2) zOdd++; else zEven++; }
      if (n >= 4 && zOdd > n * 0.3 && zEven < n * 0.05) enc = 'utf-16le';
      else if (n >= 4 && zEven > n * 0.3 && zOdd < n * 0.05) enc = 'utf-16be';
    }
    var body = start ? u8.subarray(start) : u8;
    if (enc !== 'utf-8') return { text: new TextDecoder(enc).decode(body), encoding: enc };
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' }; }
    catch (e) { return { text: decode1252(body), encoding: 'windows-1252' }; }
  }
  var CP1252 = [0x20AC, 0, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017D, 0,
    0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0, 0x017E, 0x0178];
  function decode1252(u8) {
    try { return new TextDecoder('windows-1252').decode(u8); } catch (e) { /* a browser without the label: by hand */ }
    var out = '';
    for (var i = 0; i < u8.length; i++) { var b = u8[i]; out += String.fromCharCode(b >= 0x80 && b < 0xA0 ? (CP1252[b - 0x80] || b) : b); }
    return out;
  }

  // ================================================================= what a file is
  // A zip's file list from its central directory (no unpacking): [{ name, method, size, compSize, offset }].
  function zipEntries(bytes) {
    var u8 = toU8(bytes), out = [], n = u8.length;
    if (n < 22) return out;
    var rd16 = function (o) { return u8[o] | (u8[o + 1] << 8); };
    var rd32 = function (o) { return (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0; };
    var eocd = -1;
    for (var i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) {
      if (u8[i] === 0x50 && u8[i + 1] === 0x4B && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0) return out;
    var count = rd16(eocd + 10), at = rd32(eocd + 16);
    var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
    for (var k = 0; k < Math.min(count, 5000) && at + 46 <= n; k++) {
      if (rd32(at) !== 0x02014b50) break;
      var nl = rd16(at + 28), xl = rd16(at + 30), cl = rd16(at + 32);
      var nb = u8.subarray(at + 46, at + 46 + nl);
      out.push({ name: dec ? dec.decode(nb) : String.fromCharCode.apply(null, nb), method: rd16(at + 10), compSize: rd32(at + 20), size: rd32(at + 24), offset: rd32(at + 42) });
      at += 46 + nl + xl + cl;
    }
    return out;
  }
  // → 'pdf' | 'image' | 'xlsx' | 'ods' | 'xls' | 'xlsb' | 'numbers' | 'office' | 'zip' | 'json' | 'text'
  function sniff(name, bytes) {
    var u8 = toU8(bytes);
    var ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
    var at = function (arr, off) { off = off || 0; for (var i = 0; i < arr.length; i++) if (u8[off + i] !== arr[i]) return false; return true; };
    if (at([0x25, 0x50, 0x44, 0x46])) return 'pdf';
    if (at([0x89, 0x50, 0x4E, 0x47]) || at([0xFF, 0xD8, 0xFF]) || at([0x47, 0x49, 0x46, 0x38]) || (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8))) return 'image';
    if (at([0x66, 0x74, 0x79, 0x70], 4)) {
      var brand = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
      if (/^(heic|heix|hevc|heim|heis|mif1|msf1|avif)$/.test(brand)) return 'image';
    }
    if (at([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return 'xls';
    if (at([0x50, 0x4B, 0x03, 0x04]) || at([0x50, 0x4B, 0x05, 0x06])) {
      var names = zipEntries(u8).map(function (e) { return e.name; });
      var has = function (re) { return names.some(function (x) { return re.test(x); }); };
      if (has(/^xl\/workbook\.xml$/i)) return 'xlsx';
      if (has(/^xl\/workbook\.bin$/i)) return 'xlsb';
      if (has(/^Index\/Document\.iwa$/i) || ext === 'numbers') return 'numbers';
      if (has(/^content\.xml$/i) && (ext === 'ods' || zipMimetype(u8) === 'application/vnd.oasis.opendocument.spreadsheet')) return 'ods';
      if (has(/^(word|ppt)\//i) || has(/^content\.xml$/i)) return 'office';
      return 'zip';
    }
    var head = decodeBytes(u8.subarray(0, 4096)).text.replace(/^[\s\uFEFF]+/, '');
    if (/^[\[{]/.test(head) && (ext === 'json' || /^[\[{]\s*["\[{\]}]/.test(head))) return 'json';
    return 'text';
  }
  // An ODS file's first entry is "mimetype", stored uncompressed.
  function zipMimetype(u8) {
    if (u8.length < 38 || u8[0] !== 0x50 || u8[1] !== 0x4B) return '';
    var nl = u8[26] | (u8[27] << 8), xl = u8[28] | (u8[29] << 8), size = u8[18] | (u8[19] << 8);
    var name = String.fromCharCode.apply(null, u8.subarray(30, 30 + nl));
    if (name !== 'mimetype' || size > 100) return '';
    return String.fromCharCode.apply(null, u8.subarray(30 + nl + xl, 30 + nl + xl + size));
  }

  // ================================================================= tables
  // A table: { name, source, kind: 'csv' | 'text' | 'sheet' | 'json', rows: [{ cells, line, raw }], text?
  //   (the original text, only when nothing was dropped: the journal and written-program readers use it),
  //   dropped: [header names left out], noValue (formula cells with no saved value), hidden, recognised? }.
  // Card, payment and revenue columns: never past here.
  var PAY_ALWAYS = /\b(card|cards|payment|payments|revenue|stripe|billing|invoices?|iban|cvv|cvc|mrr|bank|routing|sort code|account number|amount paid|price|subscription)\b|\blast ?4\b/i;
  var PAY_ROSTER = /^(plan|plans|product|products|package|packages|membership|memberships|tier|rate|fee|fees|offer)$/i;
  function finishTable(t) {
    t.dropped = t.dropped || [];
    if (t.kind === 'text' || !t.rows.length) return t;
    dropColumns(t, function (key) { return PAY_ALWAYS.test(key); });
    return t;
  }
  // Takes columns out of every row (raw rebuilt from what's left, so a skipped row's example never
  // shows a dropped cell). test(key, raw header) → true to drop.
  function dropColumns(t, test) {
    var h = findHeader(t.rows), head = (t.rows[h.index] || { cells: [] }).cells;
    var drop = [];
    head.forEach(function (c, i) { if (String(c || '').trim() && test(hkey(c), String(c))) drop.push(i); });
    if (!drop.length) return [];
    var names = drop.map(function (i) { return String(head[i]).trim(); });
    t.rows = t.rows.map(function (r) {
      var cells = r.cells.filter(function (c, i) { return drop.indexOf(i) < 0; });
      return { cells: cells, line: r.line, raw: cells.filter(function (c) { return String(c || '').trim(); }).join(', ') };
    });
    t.dropped = (t.dropped || []).concat(names);
    t.text = null;
    return names;
  }
  function tablesFromText(text, name) {
    var s = String(text == null ? '' : text).replace(/^\uFEFF/, '');
    var delim = SK().detectDelim(s);
    var t = { name: baseName(name) || 'Pasted', source: name || '', kind: delim ? 'csv' : 'text', delim: delim, rows: SK().splitRows(s, delim), text: s };
    return [finishTable(t)];
  }

  // ---- workbooks (SheetJS's data model: { SheetNames, Sheets: { name: sheet }, Workbook }) ----
  // A spreadsheet's date number formats ("m/d/yy", "d-mmm-yyyy"): days or years in the format once
  // quoted text and [colour] parts are out. "h:mm" is a time, not a date.
  function stripFmt(z) { return String(z || '').replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, ''); }
  function isDateFormat(z) { var f = stripFmt(z).toLowerCase(); return /[dy]/.test(f) || /m{3,}/.test(f); }
  // Excel's day count → 'YYYY-MM-DD'. 1900 system: day 1 is 1 Jan 1900 and day 60 the 29 Feb 1900
  // Lotus invented; 1904 system (old Mac workbooks): day 0 is 1 Jan 1904. A time of day is dropped.
  function excelSerialToISO(n, date1904) {
    var x = Number(n);
    if (n === '' || n == null || !isFinite(x)) return null;
    var days = Math.floor(x);
    var base;
    if (date1904) { if (days < 0) return null; base = Date.UTC(1904, 0, 1); }
    else {
      if (days < 1 || days === 60) return null;
      base = days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
    }
    var d = new Date(base + days * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  // SheetJS builds dates at UTC midnight (checked across time zones), so the UTC day is the cell's day.
  function dateToISO(d) { return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : ''; }
  function fmtNum(v) { var r = Math.round(Number(v) * 1e6) / 1e6; return isFinite(r) ? String(r) : ''; }
  // One cell as the coach sees it: a date as ISO, 0.75 in a % format as "75%", a number in a
  // "0.0 "kg"" format with its unit, TRUE / FALSE, an error as nothing, a formula by its saved value.
  function cellText(cell, date1904) {
    if (!cell) return '';
    var v = cell.v;
    if (v === undefined || v === null || cell.t === 'e' || cell.t === 'z') return '';
    if (cell.t === 'b') return v ? 'TRUE' : 'FALSE';
    if (cell.t === 'd' || v instanceof Date) return v instanceof Date ? dateToISO(v) : String(v).slice(0, 10);
    if (cell.t === 'n' || typeof v === 'number') {
      var z = String(cell.z || '');
      if (z && z !== 'General' && isDateFormat(z)) return excelSerialToISO(v, date1904) || fmtNum(v);
      if (/%/.test(stripFmt(z))) return fmtNum(v * 100) + '%';
      var u = z.match(/"\s*(kgs?|lbs?)\s*"/i);
      return fmtNum(v) + (u ? ' ' + u[1].toLowerCase() : '');
    }
    return String(v).replace(/\r\n?/g, '\n');
  }
  function colName(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function decodeRange(ref) {
    var m = String(ref || '').toUpperCase().match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!m) return null;
    var col = function (s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n - 1; };
    return { s: { r: +m[2] - 1, c: col(m[1]) }, e: { r: +(m[4] || m[2]) - 1, c: col(m[3] || m[1]) } };
  }
  function sheetToTable(ws, date1904) {
    var t = { rows: [], noValue: 0 };
    var range = decodeRange(ws && ws['!ref']);
    if (!range) return t;
    // A quick look (sheetRows) keeps the tab's real size in !fullref: the tab picker says how big it is.
    var full = decodeRange(ws['!fullref'] || ws['!ref']);
    t.fullRows = full ? full.e.r - full.s.r + 1 : 0;
    var dense = Array.isArray(ws['!data']) ? ws['!data'] : null;
    var R0 = range.s.r, R1 = range.e.r, C0 = range.s.c, C1 = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
    var grid = [], lastCol = -1;
    for (var r = R0; r <= R1; r++) {
      var row = [];
      for (var c = C0; c <= C1; c++) {
        var cell = dense ? (dense[r] && dense[r][c]) : ws[colName(c) + (r + 1)];
        if (cell && cell.f != null && cell.v === undefined) t.noValue++;
        var v = cellText(cell, date1904);
        if (v !== '' && c - C0 > lastCol) lastCol = c - C0;
        row.push(v);
      }
      grid.push(row);
    }
    // Merged cells keep their value in the first cell only. A merge down one column (a date or an
    // exercise beside its sets) fills every row; one across a row only near the top (a "Week 1" over
    // its Sets / Reps / Load columns), never a banner in the body.
    (ws['!merges'] || []).forEach(function (m) {
      if (!m || !m.s || !m.e) return;
      var v = grid[m.s.r - R0] && grid[m.s.r - R0][m.s.c - C0];
      if (!v) return;
      var vertical = m.s.c === m.e.c, across = m.s.r === m.e.r && m.s.r - R0 <= 5;
      if (!vertical && !across) return;
      for (var rr = m.s.r; rr <= m.e.r; rr++) for (var cc = m.s.c; cc <= m.e.c; cc++) {
        var g = grid[rr - R0];
        if (g && cc - C0 < g.length && cc >= C0 && g[cc - C0] === '') { g[cc - C0] = v; if (cc - C0 > lastCol) lastCol = cc - C0; }
      }
    });
    grid.forEach(function (row, i) {
      var cells = row.slice(0, lastCol + 1);
      if (!cells.some(function (x) { return x !== ''; })) return;
      t.rows.push({ cells: cells, line: R0 + i + 1, raw: cells.filter(function (x) { return x !== ''; }).join(', ') });
    });
    return t;
  }
  function tablesFromWorkbook(wb, opts) {
    opts = opts || {};
    var out = [];
    var d1904 = !!(wb && wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);
    ((wb && wb.SheetNames) || []).forEach(function (nm, si) {
      var meta = wb.Workbook && wb.Workbook.Sheets && wb.Workbook.Sheets[si];
      if (meta && meta.Hidden === 2) return;   // "very hidden": a tool's own tab, never the coach's
      var ws = wb.Sheets && wb.Sheets[nm];
      if (!ws) return;
      var t = sheetToTable(ws, d1904);
      t.name = String(nm); t.source = opts.source || ''; t.kind = 'sheet'; t.hidden = !!(meta && meta.Hidden === 1);
      if (t.rows.length) out.push(finishTable(t));
    });
    return out;
  }
  // A real .xlsx / .ods through SheetJS (import-lib-xlsx.js, loaded first by loadXlsx).
  //   opts: { sheetRows (read only the first n rows: the tab picker's quick look), sheets (only these tabs), name }
  function readWorkbook(bytes, opts) {
    opts = opts || {};
    var X = window.XLSX;
    if (!X || !X.read) throw new Error('The spreadsheet reader isn\'t loaded');
    var o = { type: 'array', cellDates: true, cellNF: true, cellStyles: false, cellHTML: false, dense: true, WTF: false };
    if (opts.sheetRows) o.sheetRows = opts.sheetRows;
    if (opts.sheets) o.sheets = opts.sheets;
    var wb = X.read(toU8(bytes), o);
    return tablesFromWorkbook(wb, { source: opts.name || '' });
  }

  // ---- JSON ----
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function isHevyWorkout(o) { return isObj(o) && Array.isArray(o.exercises) && o.exercises.some(function (e) { return isObj(e) && Array.isArray(e.sets); }) && ('start_time' in o || 'title' in o); }
  function isRecord(o) { return isObj(o) && Object.keys(o).some(function (k) { var v = o[k]; return v == null || typeof v !== 'object'; }); }
  // The longest array whose items pass test: the root, or one or two keys down.
  function findArray(data, test) {
    var best = null;
    var look = function (v, depth) {
      if (Array.isArray(v)) { if (v.length && test(v[0]) && (!best || v.length > best.length)) best = v; return; }
      if (!isObj(v) || depth > 2) return;
      Object.keys(v).slice(0, 60).forEach(function (k) { look(v[k], depth + 1); });
    };
    look(data, 0);
    return best;
  }
  function textRow(cells, line) { cells = cells.map(function (c) { return c == null ? '' : String(c); }); return { cells: cells, line: line, raw: cells.filter(Boolean).join(', ') }; }
  // A workout's start as the day it was where the coach is (an ISO time with a zone), else as written.
  function localDay(s) {
    s = String(s || '');
    if (/T\d\d:\d\d/.test(s) && /(Z|[+-]\d\d:?\d\d)$/.test(s)) {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    return s.slice(0, 10);
  }
  var HEVY_TYPE = { failure: 'To failure', dropset: 'Drop set' };
  function hevyTable(workouts, name) {
    var rows = [textRow(['Date', 'Workout', 'Exercise', 'Set', 'Set type', 'Weight (kg)', 'Reps', 'RPE', 'Distance (m)', 'Seconds', 'Notes'], 1)];
    workouts.forEach(function (w) {
      if (!isHevyWorkout(w)) return;
      (w.exercises || []).forEach(function (e) {
        (e && e.sets || []).forEach(function (s, i) {
          if (!isObj(s)) return;
          var note = [String(e.notes || '').trim(), HEVY_TYPE[s.type] || ''].filter(Boolean).join(' · ');
          rows.push(textRow([localDay(w.start_time), w.title || '', e.title || '', s.index != null ? s.index + 1 : i + 1, s.type || '', s.weight_kg, s.reps, s.rpe, s.distance_meters, s.duration_seconds, note], rows.length + 1));
        });
      });
    });
    return finishTable({ name: baseName(name) || 'Workouts', source: name || '', kind: 'json', rows: rows, recognised: { id: 'hevy-api', label: 'Hevy', kind: 'history', sure: 'published' } });
  }
  var LIFT_NAME = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  function powaTable(data, name) {
    var names = {};
    (data.athletes || []).forEach(function (a) { if (a && a.id) names[a.id] = a.name || a.email || a.id; });
    var ids = {}; (data.logs || []).forEach(function (l) { if (l && (l.athleteId || l.athlete_id)) ids[l.athleteId || l.athlete_id] = 1; });
    var many = Object.keys(ids).length > 1;
    var rows = [textRow((many ? ['Athlete'] : []).concat(['Date', 'Exercise', 'Variant', 'Weight (kg)', 'Reps', 'RPE', 'Notes']), 1)];
    (data.logs || []).forEach(function (l) {
      if (!isObj(l)) return;
      var main = LIFT_NAME[l.lift];
      var ex = main || l.exerciseName || l.exercise_name || l.lift || '';
      rows.push(textRow((many ? [names[l.athleteId || l.athlete_id] || l.athleteId || ''] : []).concat([String(l.date || '').slice(0, 10), ex, main ? (l.variant || 'Competition') : '', l.weight, l.reps, l.rpe, l.note || '']), rows.length + 1));
    });
    return finishTable({ name: baseName(name) || 'everything.json', source: name || '', kind: 'json', rows: rows, recognised: { id: 'powalifta', label: 'POWALIFTA', kind: 'history', sure: 'known' } });
  }
  function recordsTable(list, name) {
    var keys = [];
    list.slice(0, 200).forEach(function (o) { if (isObj(o)) Object.keys(o).forEach(function (k) { var v = o[k]; if ((v == null || typeof v !== 'object') && keys.indexOf(k) < 0 && keys.length < MAX_COLS) keys.push(k); }); });
    var rows = [textRow(keys, 1)];
    list.forEach(function (o) { if (isObj(o)) rows.push(textRow(keys.map(function (k) { var v = o[k]; return v == null || typeof v === 'object' ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v; }), rows.length + 1)); });
    return finishTable({ name: baseName(name) || 'data.json', source: name || '', kind: 'json', rows: rows });
  }
  function tablesFromJson(text, name) {
    var data;
    try { data = typeof text === 'string' ? JSON.parse(text.replace(/^\uFEFF/, '')) : text; } catch (e) { return []; }
    if (!data || typeof data !== 'object') return [];
    var w = findArray(data, isHevyWorkout);
    if (w) return [hevyTable(w, name)];
    if (isObj(data) && data.source === 'powalifta.com' && Array.isArray(data.logs)) return [powaTable(data, name)];
    var arr = findArray(data, isRecord);
    return arr ? [recordsTable(arr, name)] : [];
  }

  // ---- zips ----
  var ZIP_JUNK = /(^|\/)(__MACOSX\/|\.DS_Store$|\._|Thumbs\.db$)|\/$/i;
  var ZIP_READABLE = /\.(csv|tsv|txt|json)$/i;
  // Unpacks the readable files of a zip (fflate, import-lib-fflate.js, loaded first by loadUnzip):
  // → [{ name, bytes }] (bytes null for a file it doesn't read: a photo, a PDF). A zip that would
  // unpack past 80 MB or hold more than 400 files is refused before anything is inflated.
  function unzip(bytes) {
    var F = window.fflate;
    if (!F || !F.unzipSync) throw new Error('The zip reader isn\'t loaded');
    var u8 = toU8(bytes), list = zipEntries(u8).filter(function (e) { return !ZIP_JUNK.test(e.name); });
    var total = list.reduce(function (a, e) { return a + (e.size || 0); }, 0);
    if (list.length > ZIP_MAX_FILES || total > ZIP_MAX_BYTES) throw Object.assign(new Error('That zip is too big to open here. Unzip it and pick the CSV files inside.'), { code: 'too_big' });
    var got = F.unzipSync(u8, { filter: function (f) { return ZIP_READABLE.test(f.name) && !ZIP_JUNK.test(f.name) && f.originalSize <= ZIP_MAX_ONE; } });
    return list.map(function (e) { return { name: e.name, bytes: got[e.name] || null }; });
  }
  function tablesFromZip(files) {
    var tables = [], skipped = [];
    (files || []).forEach(function (f) {
      if (ZIP_JUNK.test(f.name)) return;
      if (!f.bytes || !ZIP_READABLE.test(f.name)) { skipped.push(baseName(f.name)); return; }
      var text = decodeBytes(f.bytes).text;
      var ts = /\.json$/i.test(f.name) ? tablesFromJson(text, f.name) : tablesFromText(text, f.name);
      ts.forEach(function (t) { t.name = baseName(f.name); if (t.rows.length) tables.push(t); });
    });
    return { tables: tables, skipped: skipped };
  }

  // ================================================================= the columns
  // Header words, as SwitchKit.hkey normalises them ("Weight (kg)" → "weight (kg)", "weight_kg" →
  // "weight kg"). The first rule that fits a header wins; planned ("target …") before done.
  var U = '(?:kgs?|lbs?)';
  var LOG_DICT = [
    [/^(date|day date|session date|workout date|training date|date performed|start time|started|start|logged|logged on|performed|performed on|when|date time|datetime|completed on|done on|mydate|date of session)$/, 'date'],
    [/^(exercise|exercise name|exercise title|exercises|lift|lifts|movement|movements|exercisename|activity|ename)$/, 'ex'],
    [/^(athlete|athlete name|lifter|lifter name|client|client name|member|member name|user|username)$/, 'athlete'],
    [/^(variant|variation|style)$/, 'variant'],
    [/^(set type|type of set|settype|set kind)$/, 'type'],
    [/^(set|set order|set index|set #|set number|set no|set num|#)$/, 'order'],
    [/^(target|planned|plan|prescribed|goal|rx|programmed)\s*(weight|load|kg|kgs|lbs?)(\s*\(?(kgs?|lbs?)\)?)?$/, 'tWeight'],
    [/^(weight|load)\s*(target|planned|plan|prescribed|goal|rx)$/, 'tWeight'],
    [/^(target|planned|plan|prescribed|goal|rx|programmed)\s*(reps?|rep count)$/, 'tReps'],
    [/^reps?\s*(target|planned|plan|prescribed|goal)$/, 'tReps'],
    [/^(target|planned|plan|prescribed|goal|rx|programmed)\s*(rpe|@|effort|intensity)$/, 'tRpe'],
    [/^rpe\s*(target|planned|plan|prescribed|goal|rx)$/, 'tRpe'],
    [/^(target|planned|plan|prescribed|goal|rx|programmed)\s*sets$/, 'tSets'],
    [/^sets\s*(target|planned|plan|prescribed|goal)$/, 'tSets'],
    [/^(target|planned|plan|prescribed|prescription|scheme|rx|programmed|planned sets x reps|target sets x reps|sets x reps planned)$/, 'tText'],
    [/^(actual|done|completed|achieved|performed|lifted)\s*(weight|load|kg|kgs|lbs?)(\s*\(?(kgs?|lbs?)\)?)?$/, 'weight'],
    [/^(weight|load)\s*(actual|done|lifted|achieved|performed)$/, 'weight'],
    [/^(actual|done|completed|achieved|performed)\s*reps?$/, 'reps'],
    [/^reps?\s*(actual|done|achieved|performed|completed)$/, 'reps'],
    [/^(actual|done|achieved)\s*(rpe|@|effort)$/, 'rpe'],
    [/^rpe\s*(actual|done|achieved)$/, 'rpe'],
    [/^(actual|done|achieved)\s*rir$/, 'rir'],
    [/^(actual|done|completed|achieved|performed)\s*sets$/, 'sets'],
    [new RegExp('^(weight|load|wt|kg|kgs|lb|lbs|kilos|kilograms|pounds|weight lifted|kg lifted|lbs lifted|bar weight|top set weight|weight ' + U + '|load ' + U + '|weight \\(' + U + '\\)|load \\(' + U + '\\)|wt ' + U + '|wt \\(' + U + '\\))$'), 'weight'],
    [/^(reps?|repetitions|rep count|# reps|reps done|no of reps|number of reps)$/, 'reps'],
    [/^(rpe|@|effort|rpe done|rate of perceived exertion)$/, 'rpe'],
    [/^(rir|reps in reserve)$/, 'rir'],
    [/^(sets|# sets|set count|no of sets|number of sets|sets done)$/, 'sets'],
    [/^(%|% 1rm|%1rm|% of 1rm|% of max|% max|percent|percentage|pct|intensity %|% e1rm)$/, 'pct'],
    [/^(unit|units|weight unit|uom)$/, 'unitCol'],
    [/^(notes?|comments?|set notes?|exercise notes?|cues?|remarks?)$/, 'note'],
    [/^(result|results|performance|work|top set|sets x reps|sets reps|logged set|set details?|what i did)$/, 'text'],
    [/^tempo$/, 'tempo'],
    [/^(pause|paused|pause s|pause secs?|pause seconds)$/, 'pause'],
    [/^(pause at|pause where|pause position)$/, 'pauseAt'],
    [/^(bands?|chains?|bands chains|bands\/chains|bands and chains|accommodating( resistance)?)$/, 'acc'],
    [/^(bodyweight|body weight|bw|weigh in|weighin|bodyweight (kgs?|lbs?)|bodyweight \((kgs?|lbs?)\)|bw (kgs?|lbs?))$/, 'bw'],
    [/^(distance|distance km|distance m|distance mi|distance meters|distance miles|distance \((m|km|meters|miles|mi)\))$/, 'dist'],
    [/^(seconds|duration seconds|time)$/, 'secs'],
    [/^(e1rm|e1rm kg|e1rm lb|estimated 1rm|est 1rm|e1rm \((kgs?|lbs?)\)|1rm|estimated max)$/, 'e1rm'],
    [/^(week|wk|week #|week no|block|block name|phase|cycle|mesocycle|session|session name|workout|workout name|workout notes|title|routine|routine name|day name|training day|day|description|category|duration|duration \(sec\)|duration sec|distance unit|superset id|exercise template id|workout #|id|end time|done|completed|complete|source)$/, 'session']
  ];
  // Fields a log's planner reads (switch-kit.js makeExtractor) and the coach can pick.
  var LOG_FIELDS = ['date', 'ex', 'weight', 'reps', 'rpe', 'rir', 'sets', 'text', 'note', 'athlete', 'variant', 'order', 'type', 'unitCol', 'pct',
    'tWeight', 'tReps', 'tRpe', 'tSets', 'tText', 'tempo', 'pause', 'pauseAt', 'acc', 'bw', 'dist', 'secs', 'e1rm', 'session'];
  var ROSTER_DICT = [
    [/^(coach email|trainer email|coach e mail)$/, 'ignore'],
    [/^(client id|athlete id|member id|user id|id|customer id|external id)$/, 'ignore'],
    [/^(first|first name|firstname|given name|forename|fname)$/, 'first'],
    [/^(last|last name|lastname|surname|family name|lname)$/, 'last'],
    [/^(name|full name|fullname|client name|client|athlete|athlete name|lifter|lifter name|member|member name|display name|contact name|customer name|customer|student|player)$/, 'fullName'],
    [/^(email|e mail|email address|e mail address|client email|athlete email|member email|customer email|mail|email id)$/, 'email'],
    [/^(group|groups|team|teams|squad|squads|tags?|client type|category|cohort|class|program|programme)$/, 'group'],
    [/^(status|client state|client status|athlete status|membership status|account status|active|state of client)$/, 'status'],
    [/^(archive date|archived|archived on|archived at|end date|left on|date archived)$/, 'archiveDate'],
    [/^(start date|joined|join date|date joined|joined on|created|created at|created on|member since|start)$/, 'startDate'],
    [/^(coach|trainer|trainer name|assigned coach|assigned trainer|coach name)$/, 'coach'],
    [/^(phone|phone number|mobile|mobile number|cell|cell phone|telephone|tel)$/, 'phone'],
    [/^(sex|gender)$/, 'sex'],
    [/^(birthday|birth date|date of birth|dob|birthdate)$/, 'birthday'],
    [/^(weight|bodyweight|body weight|weight \((kgs?|lbs?)\)|weight (kgs?|lbs?))$/, 'bodyweight'],
    [/^(height|height \((cm|in|inches|ft)\)|height (cm|in))$/, 'height'],
    [/^(unit preference|units|unit|preferred units|measurement system)$/, 'unitPref'],
    [/^(timezone|time zone|location|address|city|country|emergency contact|t shirt size|tshirt size|referred by|referral|compliance score|total workouts completed|exercise sessions completed|lifestyle rxs completed|highest streak|last consultation|last active|last seen|last login|notes?|goals?|instagram|age)$/, 'ignore']
  ];
  var ROSTER_USED = ['first', 'last', 'fullName', 'email', 'group', 'status', 'archiveDate'];
  var ROSTER_FIELDS = ['fullName', 'first', 'last', 'email', 'group', 'status'];
  function dictField(dict, key) { for (var i = 0; i < dict.length; i++) if (dict[i][0].test(key)) return dict[i][1]; return null; }

  // ---- the header row ----
  var WEEK_HDR = /^(?:week|wk|w)\s*\.?\s*#?\s*(\d{1,2})\b/i;
  var SUBFIELD = /^(sets?|reps?|load|weight|kg|kgs|lbs?|rpe|@|rir|%|% 1rm|%1rm|percent|pct|intensity|notes?|cues?|scheme|sets x reps|tempo|rest)$/i;
  function known(key) { return !!(key && (dictField(LOG_DICT, key) || dictField(ROSTER_DICT, key) || WEEK_HDR.test(key) || wideToken(key))); }
  // The row that names the columns: the first ten rows scored by how many of their cells are header
  // words (numbers count against). A title above the table or a blank row is stepped over.
  function findHeader(rows) {
    var best = { index: 0, score: -1 };
    for (var i = 0; i < Math.min((rows || []).length, 10); i++) {
      var cells = rows[i].cells || rows[i], s = 0, filled = 0;
      for (var c = 0; c < cells.length; c++) {
        var t = String(cells[c] == null ? '' : cells[c]).trim();
        if (!t) continue;
        filled++;
        if (/^[-+]?[\d.,\s]+(%|kg|lb|lbs)?$/i.test(t)) s -= 0.5;
        else if (known(hkey(t))) s += 1;
      }
      if (filled < 2) continue;
      if (s > best.score) best = { index: i, score: s };
    }
    if (best.score < 0) best = { index: 0, score: 0 };
    return best;
  }

  // ---- wide sheets: a group of columns per set ----
  // "Set 1 Weight", "S1 Reps", "Set 2 - RPE", "Weight 3", "1st set reps", or one cell per set ("Set 1").
  function wideToken(key) {
    var m;
    if ((m = key.match(/^(?:set|s)\s*#?\s*(\d{1,2})\s*[-_:.·]?\s*(weight|load|kg|kgs|lbs?|reps?|rpe|rir|%|pct|percent|notes?|result|done)$/i))) return { n: +m[1], tok: m[2] };
    if ((m = key.match(/^(weight|load|kg|kgs|lbs?|reps?|rpe|rir)\s*(?:set\s*)?#?\s*(\d{1,2})$/i))) return { n: +m[2], tok: m[1] };
    if ((m = key.match(/^(\d{1,2})\s*(?:st|nd|rd|th)?\s*set\s*[-_:.]?\s*(weight|load|reps?|rpe|rir)$/i))) return { n: +m[1], tok: m[2] };
    if ((m = key.match(/^(?:set|s)\s*#?\s*(\d{1,2})$/i))) return { n: +m[1], tok: 'text' };
    return null;
  }
  function wideField(tok) {
    tok = String(tok).toLowerCase();
    if (/^(weight|load|kgs?|lbs?)$/.test(tok)) return 'weight';
    if (/^reps?$/.test(tok)) return 'reps';
    if (tok === 'rpe') return 'rpe';
    if (tok === 'rir') return 'rir';
    if (/^(%|pct|percent)$/.test(tok)) return 'pct';
    if (/^notes?$/.test(tok)) return 'note';
    return 'text';
  }
  function wideGroups(keys) {
    var by = {};
    keys.forEach(function (k, i) {
      var w = wideToken(k); if (!w) return;
      var f = wideField(w.tok), g = by[w.n] = by[w.n] || { n: w.n, cols: {}, unit: null };
      if (g.cols[f] == null) g.cols[f] = i;
      if (f === 'weight' && /^(kgs?|lbs?)$/i.test(w.tok)) g.unit = /lb/i.test(w.tok) ? 'lb' : 'kg';
    });
    var groups = Object.keys(by).map(function (n) { return by[n]; }).filter(function (g) { return (g.cols.weight != null && g.cols.reps != null) || g.cols.text != null; });
    groups.sort(function (a, b) { return a.n - b.n; });
    return groups.length >= 2 ? groups : null;
  }

  // ---- program grids: exercises down, weeks across ----
  function weekColumns(cells) {
    var out = [];
    (cells || []).forEach(function (c, i) { var m = String(c || '').trim().match(WEEK_HDR); if (m) out.push({ col: i, week: +m[1] }); });
    if (out.length >= 2) return out;
    // Bare week numbers 1, 2, 3 … in a row of their own.
    var nums = [];
    (cells || []).forEach(function (c, i) { if (/^\d{1,2}$/.test(String(c || '').trim())) nums.push({ col: i, week: +String(c).trim() }); });
    if (nums.length >= 2 && nums.every(function (x, i) { return x.week === i + 1; })) return nums;
    return [];
  }
  function readsAsRx(t) {
    t = String(t || '').trim();
    if (!t || typeof parsePrescription !== 'function') return false;
    var p = parsePrescription(t, 'kg');
    return p.sets > 0 && p.reps > 0;
  }
  // Where a grid's parts are: { headerIndex, exCol, dayCol, noteCol, weeks: [{ week, col }] (one cell
  // per week) or groups: [{ week, cols: { sets, reps, load, rpe, rir, pct, note, scheme } }] (a week over
  // sub-columns) }, or null.
  function gridInfo(rows, hi) {
    var head = (rows[hi] || { cells: [] }).cells, above = hi > 0 ? rows[hi - 1].cells : null, below = rows[hi + 1] ? rows[hi + 1].cells : null;
    var isSub = function (cells) { return cells && cells.filter(function (c) { return SUBFIELD.test(hkey(c)); }).length >= 2; };
    var weekRow = null, subRow = null, headerIndex = hi;
    if (weekColumns(head).length >= 2 && isSub(below)) { weekRow = head; subRow = below; headerIndex = hi + 1; }
    else if (above && weekColumns(above).length >= 2 && isSub(head)) { weekRow = above; subRow = head; }
    else if (weekColumns(head).length >= 2) weekRow = head;
    if (!weekRow) return null;
    var both = function (i) { return hkey((weekRow[i] || '') + ' ' + (subRow ? subRow[i] || '' : '')); };
    var find = function (re) { for (var i = 0; i < Math.max(weekRow.length, subRow ? subRow.length : 0); i++) { if (re.test(hkey(weekRow[i] || '')) || (subRow && re.test(hkey(subRow[i] || '')))) return i; } return -1; };
    var exCol = find(/^(exercise|exercises|lift|lifts|movement|movements|exercise name)$/);
    var weeks = weekColumns(weekRow);
    var firstWeek = weeks[0].col;
    if (exCol < 0) exCol = firstWeek > 0 ? 0 : -1;
    if (exCol < 0) return null;
    var info = { headerIndex: headerIndex, exCol: exCol, dayCol: find(/^(day|days|session|day name|training day)$/), noteCol: find(/^(notes?|cues?|comments?)$/) };
    if (info.dayCol === exCol) info.dayCol = -1;
    if (subRow) {
      // The week's label sits over its first sub-column; the sub-columns run to the next week.
      info.groups = weeks.map(function (w, k) {
        var end = k + 1 < weeks.length ? weeks[k + 1].col : Math.max(weekRow.length, subRow.length);
        var cols = {};
        for (var c = w.col; c < end; c++) {
          var s = hkey(subRow[c] || '');
          var f = /^sets?$/.test(s) ? 'sets' : /^reps?$/.test(s) ? 'reps' : /^(load|weight|kgs?|lbs?)$/.test(s) ? 'load' : /^(rpe|@|intensity)$/.test(s) ? 'rpe'
            : s === 'rir' ? 'rir' : /^(%|% 1rm|%1rm|percent|pct)$/.test(s) ? 'pct' : /^(notes?|cues?)$/.test(s) ? 'note' : /^(scheme|sets x reps)$/.test(s) ? 'scheme' : s === 'tempo' ? 'tempo' : null;
          if (f && cols[f] == null) cols[f] = c;
        }
        return { week: w.week, cols: cols };
      }).filter(function (g) { return g.cols.reps != null || g.cols.scheme != null; });
      if (info.groups.length < 2 && !(info.groups.length === 1 && weeks.length === 1)) return info.groups.length ? info : null;
      return info;
    }
    info.weeks = weeks;
    // Enough of the week cells must read as sets x reps, or it's a table that only looks like one.
    var n = 0, ok = 0;
    rows.slice(headerIndex + 1, headerIndex + 41).forEach(function (r) { weeks.forEach(function (w) { var t = String(r.cells[w.col] || '').trim(); if (t) { n++; if (readsAsRx(t)) ok++; } }); });
    return n && ok / n >= 0.4 ? info : null;
  }

  // ---- recognisers ----
  var TC_ONLY = ['compliance score', 'total workouts completed', 'client type', 'client state', 'unit preference'];
  var CRX_ONLY = ['coach email', 'exercise sessions completed', 'lifestyle rxs completed', 'highest streak', 'last consultation', 't shirt size', 'referred by', 'emergency contact', 'synced with stripe'];
  // TrueCoach's 15 published columns, and what each one is here.
  var TC_FIELDS = { 'first name': 'first', 'last name': 'last', 'email': 'email', 'client type': 'group', 'client state': 'status', 'phone number': 'phone',
    'gender': 'sex', 'birthday': 'birthday', 'weight': 'bodyweight', 'height': 'height', 'unit preference': 'unitPref' };
  var CRX_FIELDS = { 'client name': 'fullName', 'client email': 'email', 'coach': 'coach', 'status': 'status', 'start date': 'startDate', 'archive date': 'archiveDate',
    'tags': 'group', 'phone number': 'phone', 'sex': 'sex', 'birthday': 'birthday' };
  function recogniseByKeys(keys) {
    var has = function (k) { return keys.indexOf(k) >= 0; };
    var count = function (list) { return list.filter(has).length; };
    var f = SK().formatOf(keys);
    if (f && f !== 'Spreadsheet') return { id: f.toLowerCase(), label: f, kind: 'history', sure: 'known' };
    if (has('email') && count(TC_ONLY) >= 3) return { id: 'truecoach', label: 'TrueCoach', kind: 'roster', sure: 'published', preset: TC_FIELDS };
    if ((has('client name') || has('client email')) && count(CRX_ONLY) >= 1) return { id: 'coachrx', label: 'CoachRx', kind: 'roster', sure: 'published', preset: CRX_FIELDS };
    if (has('id') && has('name') && has('email') && has('joined') && keys.length <= 6) return { id: 'powalifta', label: 'POWALIFTA', kind: 'roster', sure: 'known' };
    return null;
  }
  // Trainerize and TrainHeroic publish which fields their client lists hold, not the header text:
  // matched by those fields and nothing else.
  function recogniseByFields(fields) {
    var set = fields.filter(function (f) { return f && f !== 'ignore'; }).sort().join(',');
    if (set === 'coach,email,first,last,phone' || set === 'coach,email,first,last') return { id: 'trainerize', label: 'Trainerize', kind: 'roster', sure: 'fields' };
    if (set === 'email,fullName,startDate' || set === 'email,fullName,group,startDate') return { id: 'trainheroic', label: 'TrainHeroic', kind: 'roster', sure: 'fields' };
    return null;
  }

  // ---- guessing an unplaced column from its values ----
  function sample(rows, col, n) {
    var out = [];
    for (var i = 0; i < rows.length && out.length < (n || 40); i++) { var v = String(rows[i].cells[col] == null ? '' : rows[i].cells[col]).trim(); if (v) out.push(v); }
    return out;
  }
  function share(vals, test) { if (!vals.length) return 0; return vals.filter(test).length / vals.length; }
  function looksLikeName(v) { return /^[A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(\s+[A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){1,3}$/.test(v) && v.length <= 40; }
  function looksLikeDate(v) { return !!SK().parseDate(v, 'dmy') || (/^\d{5}$/.test(v) && +v > 30000 && +v < 60000); }
  function looksLikeSet(v) { var p = SK().parseSetText(v); return !!(p && p.kg != null && p.reps > 0); }

  // ================================================================= analyse a table
  // → { table, kind: 'roster' | 'history' | 'program' | 'unknown', layout: 'roster' | 'log' | 'wide' |
  //   'grid' | 'program' | 'journal' | 'program-text' | 'unknown', headerIndex, headers, keys,
  //   fields: [field or null (not placed) per column], guessed: [bool], unplaced: [column],
  //   recognised: { id, label, kind, sure: 'published' | 'fields' | 'known' } | null, fromMemory,
  //   dropped: [header names], wide: groups | null, grid: info | null, rowsCount, unitFromHeader }
  //   opts: { remembered: { fingerprint: { h: { header key: field } } } (the coach's own mappings) }
  function analyse(table, opts) {
    opts = opts || {};
    var a = { table: table, kind: 'unknown', layout: 'unknown', headerIndex: 0, headers: [], keys: [], fields: [], guessed: [], unplaced: [],
      recognised: null, fromMemory: false, dropped: (table.dropped || []).slice(), wide: null, grid: null, rowsCount: 0, unitFromHeader: null };
    if (table.kind === 'text') return analyseText(a, table.text);
    var rows = table.rows;
    if (!rows.length) return a;
    var hdr = findHeader(rows);
    var gi = gridInfo(rows, hdr.index);
    if (gi && gi.headerIndex !== hdr.index) hdr = { index: gi.headerIndex, score: hdr.score };
    var keys = rows[hdr.index].cells.map(function (c) { return hkey(c); });
    var body = rows.slice(hdr.index + 1);
    var rec = table.recognised || recogniseByKeys(keys);
    // A client list: names or emails and no exercise, reps or weeks. Weight there is bodyweight.
    var exLike = keys.some(function (k) { var f = dictField(LOG_DICT, k); return f === 'ex' || f === 'reps' || f === 'sets' || f === 'text' || f === 'tText' || f === 'rpe' || f === 'rir'; }) || !!wideGroups(keys) || !!gi;
    var emailCol = keys.findIndex(function (k, i) { return dictField(ROSTER_DICT, k) === 'email' || (!k || !known(k)) && share(sample(body, i), function (v) { return EMAIL_RE.test(v); }) >= 0.6; });
    var nameish = keys.some(function (k) { var f = dictField(ROSTER_DICT, k); return f === 'first' || f === 'last' || f === 'fullName'; });
    var roster = opts.kind === 'roster' ? true : opts.kind === 'history' || opts.kind === 'program' ? false : rec ? rec.kind === 'roster' : (!exLike && (emailCol >= 0 || nameish));
    if (roster) {
      // Billing words a client list uses for its plans ("Plan", "Product"): out too, before the mapper.
      var gone = dropColumns(table, function (key) { return PAY_ROSTER.test(key); });
      if (gone.length) { var again = analyse(table, opts); again.dropped = a.dropped.concat(gone).filter(function (x, i, l) { return l.indexOf(x) === i; }); return again; }
    }
    a.headerIndex = hdr.index;
    a.headers = rows[hdr.index].cells.map(function (c) { return String(c == null ? '' : c).trim(); });
    a.keys = keys;
    a.rowsCount = body.length;
    a.recognised = rec || null;
    var dict = roster ? ROSTER_DICT : LOG_DICT;
    var wide = roster ? null : wideGroups(keys);
    var fields = keys.map(function (k, i) {
      if (!k) return null;
      if (rec && rec.preset && rec.preset[k]) return rec.preset[k];
      if (wide && wideToken(k)) return 'wide';
      return dictField(dict, k);
    });
    // In a recognised client list every other published column is known and not kept.
    if (rec && rec.preset) fields = fields.map(function (f, i) { return f || (keys[i] ? 'ignore' : null); });
    // One column per field: a second "Notes" waits for the coach.
    var seen = {};
    fields = fields.map(function (f) { if (!f || f === 'ignore' || f === 'wide' || f === 'session') return f; if (seen[f]) return null; seen[f] = 1; return f; });
    // The coach's own mapping for this set of columns wins over every guess.
    var fp = fingerprint(a.headers), mem = opts.remembered && opts.remembered[fp];
    if (mem && mem.h) {
      fields = keys.map(function (k, i) { return mem.h[k] !== undefined ? mem.h[k] : fields[i]; });
      a.fromMemory = true;
    }
    var guessed = fields.map(function () { return false; });
    // Unplaced columns, guessed from what's in them.
    fields.forEach(function (f, i) {
      if (f || !keys[i]) return;
      var vals = sample(body, i);
      if (!vals.length) return;
      var free = function (x) { return fields.indexOf(x) < 0; };
      if (free('email') && share(vals, function (v) { return EMAIL_RE.test(v); }) >= 0.6) { fields[i] = 'email'; guessed[i] = true; return; }
      if (roster) {
        if (free('fullName') && free('first') && share(vals, looksLikeName) >= 0.6) { fields[i] = 'fullName'; guessed[i] = true; }
        return;
      }
      if (free('date') && share(vals, looksLikeDate) >= 0.6) { fields[i] = 'date'; guessed[i] = true; return; }
      if (free('text') && free('weight') && share(vals, looksLikeSet) >= 0.5) { fields[i] = 'text'; guessed[i] = true; }
    });
    if (!rec) { var byF = roster ? recogniseByFields(fields) : null; if (byF) a.recognised = byF; }
    if (!roster && !opts.kind && !a.recognised && emailCol < 0 && !exLike && fields.indexOf('email') >= 0) roster = true;
    a.fields = fields;
    a.guessed = guessed;
    a.unplaced = fields.map(function (f, i) { return f == null && keys[i] ? i : -1; }).filter(function (i) { return i >= 0; });
    a.wide = wide;
    var wcol = fields.indexOf('weight');
    a.unitFromHeader = wcol >= 0 ? unitOfHeader(keys[wcol]) : null;
    if (roster) { a.kind = 'roster'; a.layout = 'roster'; return a; }
    if (gi) { a.kind = 'program'; a.layout = 'grid'; a.grid = gi; return a; }
    layoutOf(a);
    if (a.layout === 'unknown' && table.text) {
      var t = analyseText(Object.assign({}, a, { kind: 'unknown', layout: 'unknown' }), table.text);
      if (t.layout !== 'unknown') return t;
    }
    return a;
  }
  // Kind and layout from the fields (again after the coach changes a dropdown: setFields).
  function layoutOf(a) {
    var f = a.fields, has = function (k) { return f.indexOf(k) >= 0; };
    if (a.kind === 'roster') { a.layout = 'roster'; return a; }
    var work = (has('weight') && has('reps')) || has('text') || (has('sets') && has('reps')) || (has('tWeight') && has('tReps')) || has('tText');
    if (a.wide && has('ex')) { a.kind = 'history'; a.layout = 'wide'; }
    else if (has('ex') && has('date') && work) { a.kind = 'history'; a.layout = 'log'; }
    else if (has('ex') && !has('date') && (has('sets') || has('reps') || has('tText') || has('text'))) { a.kind = 'program'; a.layout = 'program'; }
    else { a.kind = 'unknown'; a.layout = 'unknown'; }
    return a;
  }
  // The coach picked fields in the mapper: the same analysis on their choices.
  function setFields(a, fields) {
    var b = Object.assign({}, a, { fields: fields.slice(), guessed: a.guessed.map(function (g, i) { return g && fields[i] === a.fields[i]; }) });
    b.unplaced = fields.map(function (f, i) { return f == null && a.keys[i] ? i : -1; }).filter(function (i) { return i >= 0; });
    var wcol = fields.indexOf('weight');
    b.unitFromHeader = wcol >= 0 ? unitOfHeader(a.keys[wcol]) : null;
    if (a.kind !== 'roster' && a.layout !== 'grid' && a.layout !== 'journal' && a.layout !== 'program-text') layoutOf(b);
    return b;
  }
  function analyseText(a, text) {
    a.kind = 'unknown'; a.layout = 'unknown';
    if (!text || !String(text).trim()) return a;
    var p = SK().planHistoryImport(text, { unit: 'kg', today: '2999-12-31' });
    if (p.format === 'Training journal') { a.kind = 'history'; a.layout = 'journal'; a.rowsCount = p.rows; }
    else if (p.kind === 'block') { a.kind = 'program'; a.layout = 'program-text'; a.rowsCount = p.block.stats.sets; }
    return a;
  }
  function unitOfHeader(key) { return /\blbs?\b|\(lbs?\)|pounds/.test(key || '') ? 'lb' : /\bkgs?\b|\(kgs?\)|kilos|kilograms/.test(key || '') ? 'kg' : null; }
  function bodyRows(a) { return a.table.rows.slice(a.headerIndex + 1); }
  // The fields as the switch kit's planner reads them: a column per field, -1 when there's none.
  function historyMap(a) {
    var m = { unit: a.unitFromHeader || null, accKey: '' };
    LOG_FIELDS.forEach(function (k) { m[k] = a.fields.indexOf(k); });
    if (m.acc >= 0) m.accKey = a.keys[m.acc] || '';
    return m;
  }
  // Wide → long: each set group of a row becomes a row of its own, the row's other cells with it.
  // → { body, map } for SwitchKit.planHistoryRows.
  function unpivotWide(a) {
    var groups = a.wide || [], base = historyMap(a);
    var width = a.headers.length, F = ['weight', 'reps', 'rpe', 'rir', 'pct', 'note', 'text'];
    var map = Object.assign({}, base);
    F.forEach(function (f, k) { map[f] = width + k; });
    map.order = width + F.length;
    var unitSet = groups.filter(function (g) { return g.unit; });
    if (!map.unit && unitSet.length) map.unit = unitSet[0].unit;
    var body = [];
    bodyRows(a).forEach(function (r) {
      groups.forEach(function (g) {
        var get = function (f) { return g.cols[f] != null ? String(r.cells[g.cols[f]] == null ? '' : r.cells[g.cols[f]]).trim() : ''; };
        if (!get('weight') && !get('reps') && !get('text')) return;
        var note = [base.note >= 0 ? String(r.cells[base.note] || '').trim() : '', get('note')].filter(Boolean).join(' · ');
        var cells = r.cells.slice(0, width);
        while (cells.length < width) cells.push('');
        cells = cells.concat([get('weight'), get('reps'), get('rpe'), get('rir'), get('pct'), note, get('text'), String(g.n)]);
        body.push({ cells: cells, line: r.line, raw: r.raw });
      });
    });
    return { body: body, map: map };
  }

  // ================================================================= effort, as coaches write it
  // "@8", "RPE 8.5", "8,5", "2 RIR", "RIR 1-2", "7-8" (an RPE column's range), "75%", 0.75 in a %
  // column, "3x5 @8" → { rpe, rpeHi, rir, pct, pctHi, sets, reps } (app.js parsePrescription underneath).
  //   opts: { rirColumn, pctColumn }
  function effort(cell, opts) {
    opts = opts || {};
    var s = String(cell == null ? '' : cell).trim().replace(/(\d),(\d)/g, '$1.$2');
    var out = { rpe: null, rpeHi: null, rir: false, pct: null, pctHi: null, sets: null, reps: null };
    if (!s) return out;
    if (opts.pctColumn && /^\d*\.\d+$/.test(s) && +s <= 1.5) { out.pct = Math.round(+s * 1000) / 10; return out; }
    if (opts.pctColumn && /^\d{2,3}(\.\d+)?$/.test(s)) { out.pct = +s; return out; }
    if (typeof parsePrescription !== 'function') return out;
    var q = opts.rirColumn ? 'rir ' + s : (/^\d/.test(s) && !/rir|%|x/i.test(s) ? '@' + s : s);
    var p = parsePrescription(q, 'kg');
    out.rpe = p.rpe; out.rpeHi = p.rpeHi; out.rir = !!p.rir; out.pct = p.pct; out.pctHi = p.pctHi; out.sets = p.sets; out.reps = p.reps;
    return out;
  }

  // ================================================================= mapping memory
  // A file's columns as a set, so the next export from the same app is one tap.
  function fingerprint(headers) {
    var keys = (headers || []).map(function (h) { return hkey(h); }).filter(Boolean).sort();
    return 'm1-' + SK().hash64(keys.join('|'));
  }
  // → the maps with this file's mapping in (thirty files at most, the oldest go first).
  function rememberMapping(maps, headers, fields, today) {
    var out = Object.assign({}, maps || {}), h = {};
    (headers || []).forEach(function (x, i) { var k = hkey(x); if (k) h[k] = fields[i] || null; });
    out[fingerprint(headers)] = { h: h, at: today || '' };
    var ks = Object.keys(out);
    if (ks.length > 30) {
      ks.sort(function (x, y) { return String(out[y].at || '').localeCompare(String(out[x].at || '')); });
      ks.slice(30).forEach(function (k) { delete out[k]; });
    }
    return out;
  }

  // ================================================================= client lists
  var ARCHIVED_RE = /archiv|inactive|former|cancel|ended|expired|paused|deleted|lost|lead|prospect|churn/i;
  function normName(n) { return String(n || '').toLowerCase().replace(/[^a-z0-9à-öø-ÿ]+/g, ' ').trim(); }
  // → { people: [{ i, line, name, email, groups, status, archived, state, picked }], counts, statuses, groups,
  //   leftOut: [header names read but not kept], dropped: [card and payment headers] }.
  //   state: 'new' | 'onRoster' | 'invited' | 'duplicate' | 'noEmail' | 'badEmail'. Only names, emails,
  //   groups and statuses are kept: phone numbers, birthdays and the rest stay in the file.
  //   ctx: { athletes: [{ name, email }], invites: [{ email, used }] }
  function planRoster(a, ctx) {
    ctx = ctx || {};
    var f = a.fields, col = function (k) { return f.indexOf(k); };
    var byEmail = {}, byName = {}, invited = {};
    (ctx.athletes || []).forEach(function (x) { if (x && x.email) byEmail[String(x.email).trim().toLowerCase()] = 1; if (x && x.name) byName[normName(x.name)] = 1; });
    (ctx.invites || []).forEach(function (x) { if (x && !x.used && x.email) invited[String(x.email).trim().toLowerCase()] = 1; });
    var seen = {}, people = [], statuses = {}, groups = {};
    var counts = { total: 0, new: 0, onRoster: 0, invited: 0, duplicate: 0, noEmail: 0, badEmail: 0, archived: 0, picked: 0 };
    bodyRows(a).forEach(function (r, i) {
      var get = function (k) { var c = col(k); return c >= 0 ? String(r.cells[c] == null ? '' : r.cells[c]).replace(/\s+/g, ' ').trim() : ''; };
      var name = (get('fullName') || [get('first'), get('last')].filter(Boolean).join(' ')).slice(0, 80);
      var email = get('email').toLowerCase().replace(/^mailto:/, '').trim();
      if (!name && !email) return;
      var ok = EMAIL_RE.test(email);
      var status = get('status').slice(0, 40), archived = ARCHIVED_RE.test(status) || !!get('archiveDate');
      var gl = get('group') ? get('group').split(/\s*[;|,]\s*/).filter(Boolean).map(function (g) { return g.slice(0, 40); }).slice(0, 6) : [];
      var key = ok ? email : 'n:' + normName(name);
      var state = seen[key] ? 'duplicate' : ((ok && byEmail[email]) || (!ok && name && byName[normName(name)])) ? 'onRoster'
        : ok && invited[email] ? 'invited' : !email ? 'noEmail' : !ok ? 'badEmail' : 'new';
      seen[key] = 1;
      var picked = (state === 'new' || state === 'noEmail' || state === 'badEmail') && !archived;
      people.push({ i: people.length, line: r.line, name: name || email.split('@')[0], email: ok ? email : '', emailRaw: ok ? '' : email.slice(0, 80), groups: gl, status: status, archived: archived, state: state, picked: picked });
      counts.total++; counts[state]++; if (archived) counts.archived++; if (picked) counts.picked++;
      if (status) statuses[status] = (statuses[status] || 0) + 1;
      gl.forEach(function (g) { groups[g] = (groups[g] || 0) + 1; });
    });
    var leftOut = a.headers.filter(function (h, i) { return h && ROSTER_USED.indexOf(f[i]) < 0; });
    return { people: people, counts: counts, statuses: statuses, groups: groups, leftOut: leftOut, dropped: a.dropped.slice() };
  }
  // The plan's seats: limit (TIER_LIMITS: 3 / 10 / 25 / 9999 = unlimited) less the lifters on the roster
  // and the invites not used yet (each holds a seat). → { limit, used, left, unlimited }
  function seats(o) {
    o = o || {};
    var limit = Number(o.limit) || 3, used = (Number(o.athletes) || 0) + (Number(o.pending) || 0);
    var unlimited = limit >= 9999;
    return { limit: limit, used: used, left: unlimited ? Infinity : Math.max(0, limit - used), unlimited: unlimited };
  }
  // Keeps the first n picked, unpicks the rest (marked overLimit). → the same people.
  function pickWithin(people, n) {
    var k = 0;
    (people || []).forEach(function (p) { if (!p.picked) { p.overLimit = false; return; } if (k < n) { k++; p.overLimit = false; } else { p.picked = false; p.overLimit = true; } });
    return people;
  }

  // ================================================================= programs → the review grid
  // program-photo.js's review takes a read: { name, unit, weeks, days: [{ name, exercises: [{ name, note,
  // cells: [text per week] }] }], unsure }: the same check a photo gets, so every cell is seen before saving.
  var DAY_RE = /^(day\s*\d+\b.*|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b.*|session\s*\d+.*|[a-z]+ day\b.*)$/i;
  function composeCell(get, unit) {
    var scheme = get('scheme'), sets = get('sets'), reps = get('reps');
    var t = scheme || (reps ? (sets || '1') + 'x' + reps : '');
    if (!t) return '';
    var load = get('load');
    if (load) t += ' ' + (/^\d+(\.\d+)?$/.test(load) ? load + (unit === 'lb' ? 'lb' : 'kg') : load);
    var pct = get('pct');
    if (pct && !load) t += ' ' + pct.replace(/\s*%$/, '') + '%';
    var rpe = get('rpe'), rir = get('rir');
    if (rpe) t += ' @' + rpe.replace(/^@\s*/, '');
    else if (rir) t += ' ' + rir + 'RIR';
    var tempo = get('tempo');
    if (tempo) t += ' tempo ' + tempo;
    return t.replace(/\s+/g, ' ').trim();
  }
  function gridToRead(a, opts) {
    opts = opts || {};
    var gi = a.grid;
    if (!gi) return null;
    var rows = a.table.rows.slice(gi.headerIndex + 1);
    var nWeeks = gi.groups ? gi.groups.length : gi.weeks.length;
    nWeeks = Math.min(16, nWeeks);
    var days = [], day = null, lastDayVal = '';
    var newDay = function (name) { day = { name: String(name || '').slice(0, 80) || 'Day ' + (days.length + 1), exercises: [] }; days.push(day); };
    rows.forEach(function (r) {
      var c = r.cells, val = function (i) { return i >= 0 ? String(c[i] == null ? '' : c[i]).trim() : ''; };
      var name = val(gi.exCol);
      var cells = [];
      for (var w = 0; w < nWeeks; w++) {
        if (gi.groups) { var g = gi.groups[w]; cells.push(composeCell(function (k) { return g.cols[k] != null ? val(g.cols[k]) : ''; }, opts.unit)); }
        else cells.push(val(gi.weeks[w].col));
      }
      var any = cells.some(Boolean);
      var dv = val(gi.dayCol);
      if (dv && dv !== lastDayVal) { lastDayVal = dv; newDay(/^\d+$/.test(dv) ? 'Day ' + dv : dv); }
      if (!any) { if (name && DAY_RE.test(name)) newDay(name); return; }
      if (!name) return;
      if (!day) newDay(opts.dayName || 'Day 1');
      if (day.exercises.length >= 20) return;
      day.exercises.push({ name: name.slice(0, 80), note: val(gi.noteCol).slice(0, 160), cells: cells });
    });
    days = days.filter(function (d) { return d.exercises.length; }).slice(0, 7);
    if (!days.length) return null;
    return { name: String(opts.name || a.table.name || 'Imported program').replace(/\.[a-z0-9]+$/i, '').slice(0, 80), unit: opts.unit === 'lb' ? 'lb' : 'kg', weeks: nWeeks, days: days, unsure: [] };
  }
  // A program table (Week / Day / Exercise / Sets / Reps rows) or a written program → the same read,
  // through app.js parseProgramSheet and gridCellText (the builder's own cell text).
  function weeksToRead(weeks, name, unit) {
    weeks = (weeks || []).slice(0, 16);
    var dayNames = [];
    weeks.forEach(function (w) { (w.days || []).forEach(function (d) { if (dayNames.indexOf(d.name) < 0) dayNames.push(d.name); }); });
    var exName = function (ex) {
      var L = typeof LIFT_LABELS !== 'undefined' ? LIFT_LABELS : LIFT_NAME;
      if (LIFT_NAME[ex.lift]) return (ex.variant && ex.variant !== 'Competition' ? ex.variant + ' ' : '') + (L[ex.lift] || LIFT_NAME[ex.lift]);
      return ex.exerciseName || L[ex.lift] || 'Exercise';
    };
    var days = dayNames.slice(0, 7).map(function (dn) {
      var list = [];
      weeks.forEach(function (w, wi) {
        var d = (w.days || []).find(function (x) { return x.name === dn; });
        if (!d) return;
        var seenK = {};
        (d.exercises || []).forEach(function (ex) {
          var key = ex.lift + '|' + (ex.variant || '') + '|' + (ex.exerciseName || '');
          var k = seenK[key] = (seenK[key] || 0) + 1;
          var row = list.find(function (x) { return x.key === key && x.k === k; });
          if (!row) { row = { key: key, k: k, name: exName(ex), note: ex.note || '', cells: [] }; list.push(row); }
          row.cells[wi] = typeof gridCellText === 'function' ? gridCellText(ex) : '';
        });
      });
      return { name: dn, exercises: list.slice(0, 20).map(function (x) { var cells = []; for (var w = 0; w < weeks.length; w++) cells.push(x.cells[w] || ''); return { name: x.name, note: x.note, cells: cells }; }) };
    }).filter(function (d) { return d.exercises.length; });
    if (!days.length) return null;
    return { name: String(name || 'Imported program').slice(0, 80), unit: unit === 'lb' ? 'lb' : 'kg', weeks: weeks.length, days: days, unsure: [] };
  }
  function programToRead(a, opts) {
    opts = opts || {};
    var text;
    if (a.layout === 'program-text') text = a.table.text;
    else text = a.table.rows.slice(a.headerIndex).map(function (r) { return r.cells.map(function (c) { return String(c == null ? '' : c).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }).join('\n');
    if (typeof parseProgramSheet !== 'function') return null;
    var p = parseProgramSheet(text, { unit: opts.unit === 'lb' ? 'lbs' : 'kg', name: opts.name || 'Imported program' });
    if (!p.stats.sets) return null;
    var read = weeksToRead(p.weeks, opts.name || String(a.table.name || '').replace(/\.[a-z0-9]+$/i, '') || 'Imported program', opts.unit);
    if (read) read.notRead = p.warnings.length;
    return read;
  }

  // ================================================================= loading the readers
  var loading = {};
  function loadScript(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loading[src]; reject(new Error('Couldn\'t load ' + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }
  function loadXlsx() { return window.XLSX && window.XLSX.read ? Promise.resolve(window.XLSX) : loadScript('import-lib-xlsx.js').then(function () { return window.XLSX; }); }
  function loadUnzip() { return window.fflate && window.fflate.unzipSync ? Promise.resolve(window.fflate) : loadScript('import-lib-fflate.js').then(function () { return window.fflate; }); }

  // ================================================================= built-in samples (the demo, the tests)
  // A client list in TrueCoach's published columns (the people and values are made up), a Strong export
  // (the switch kit's own fingerprint), a coach's wide sheet and a program grid.
  var SAMPLE_PEOPLE = [
    ['Maya', 'Chen', 'active', 'Online'], ['Leo', 'Grant', 'active', 'Online'], ['Priya', 'Nair', 'active', 'In person'], ['Sam', 'Okafor', 'active', 'Online'],
    ['Lena', 'Novak', 'active', 'Online'], ['Diego', 'Ruiz', 'active', 'In person'], ['Hana', 'Sato', 'active', 'Online'], ['Owen', 'Walsh', 'archived', 'Online'],
    ['Zoe', 'Adams', 'active', 'Online'], ['Ben', 'Carter', 'archived', 'In person'], ['Ava', 'Stone', 'active', 'Online'], ['Tom', 'Becker', 'active', 'Online'],
    ['Arjun', 'Mehta', 'active', 'In person', 'arjun@demo.com']
  ];
  var SAMPLES = {
    roster: { name: 'clients.csv', from: 'TrueCoach', text: ['First Name,Last Name,Email,Compliance Score,Total Workouts Completed,Birthday,Location,Timezone,Phone Number,Client Type,Client State,Height,Weight,Unit Preference,Gender']
      .concat(SAMPLE_PEOPLE.map(function (p, i) { return [p[0], p[1], p[4] || p[0].toLowerCase() + '.' + p[1].toLowerCase() + '@example.com', 70 + (i * 7) % 30, 40 + i * 11, '', '', '', '', p[3], p[2], '', '', i % 3 ? 'metric' : 'imperial', ''].join(','); })).join('\n') },
    history: { name: 'strong_workouts.csv', from: 'Strong', text: (function () {
      var lines = ['Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE'];
      var day = Date.UTC(2026, 7, 3), top = { 'Squat (Barbell)': 150, 'Bench Press (Barbell)': 100, 'Deadlift (Barbell)': 185, 'Barbell Row': 80 };
      for (var w = 0; w < 6; w++) {
        [['Lower', ['Squat (Barbell)', 'Deadlift (Barbell)']], ['Upper', ['Bench Press (Barbell)', 'Barbell Row']]].forEach(function (s, si) {
          var d = new Date(day + (w * 7 + si * 2) * 86400000).toISOString().slice(0, 10) + ' 07:30:00';
          s[1].forEach(function (ex) {
            var kg = top[ex] + w * 2.5;
            lines.push([d, s[0], '1h', ex, 'W', Math.round(kg * 0.5), 5, 0, 0, '', '', ''].join(';'));
            for (var k = 1; k <= 3; k++) lines.push([d, s[0], '1h', ex, k, kg, 5, 0, 0, k === 3 && w === 5 ? 'moved well' : '', '', k === 3 ? (w > 3 ? 8.5 : 8) : (w % 2 ? 7.5 : '')].join(';'));
          });
        });
      }
      return lines.join('\n');
    })() },
    wide: { name: 'training log.csv', from: 'a spreadsheet', text: ['Date,Exercise,Set 1 Weight,Set 1 Reps,Set 1 RPE,Set 2 Weight,Set 2 Reps,Set 2 RPE,Set 3 Weight,Set 3 Reps,Set 3 RPE',
      '05/10/2026,Squat,160,5,7,165,5,7.5,170,3,8.5', '05/10/2026,Bench,105,5,7.5,105,5,8,,,', '07/10/2026,Deadlift,190,3,7,200,3,8,205,2,8.5', '07/10/2026,Paused bench,95,4,7,95,4,7.5,95,4,8'].join('\n') },
    grid: { name: 'Block 3.csv', from: 'a spreadsheet', text: ['Exercise,Week 1,Week 2,Week 3,Week 4', 'Day 1 · Squat / Bench,,,,', 'Squat,"1x3 @8, 3x5 75%","1x2 @8, 3x4 78%","1x1 @8.5, 3x3 82%",3x3 70% @6',
      'Bench,4x6 72.5%,4x5 75%,4x4 80%,3x5 67.5%', 'Barbell Row,4x8 2RIR,4x8 2RIR,4x8 1RIR,3x8 3RIR', 'Day 2 · Deadlift,,,,', 'Deadlift,"1x3 @8, 2x3 75%","1x2 @8, 2x3 78%","1x1 @8.5, 2x2 82%",2x3 70% @6',
      'Paused Bench,4x5 @7,4x4 @7.5,4x3 @8,3x4 @6', 'Leg Curl,3x12,3x12,3x10,2x12'].join('\n') }
  };
  // The demo's workbook, built with SheetJS so it goes through the real reader: three tabs.
  function sampleWorkbookBytes() {
    var X = window.XLSX;
    var tab = function (text) { return X.utils.aoa_to_sheet(SK().splitRows(text, ',').map(function (r) { return r.cells.map(function (c) { return /^-?\d+(\.\d+)?$/.test(c) ? Number(c) : c; }); })); };
    var wb = X.utils.book_new();
    var log = tab(SAMPLES.wide.text);
    X.utils.book_append_sheet(wb, log, 'Training log');
    X.utils.book_append_sheet(wb, tab(SAMPLES.grid.text), 'Block 3');
    X.utils.book_append_sheet(wb, tab('Lift,Max (kg),Tested\nSquat,190,2026-09-12\nBench,125,2026-09-12\nDeadlift,225,2026-09-13'), 'Maxes');
    return new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
  }

  return {
    // bytes
    decodeBytes: decodeBytes, sniff: sniff, zipEntries: zipEntries,
    // tables
    tablesFromText: tablesFromText, tablesFromWorkbook: tablesFromWorkbook, readWorkbook: readWorkbook, tablesFromJson: tablesFromJson,
    unzip: unzip, tablesFromZip: tablesFromZip, cellText: cellText, excelSerialToISO: excelSerialToISO, isDateFormat: isDateFormat,
    // columns
    findHeader: findHeader, analyse: analyse, setFields: setFields, bodyRows: bodyRows, historyMap: historyMap, unpivotWide: unpivotWide,
    wideGroups: wideGroups, effort: effort, fingerprint: fingerprint, rememberMapping: rememberMapping,
    LOG_FIELDS: LOG_FIELDS, ROSTER_FIELDS: ROSTER_FIELDS, ROSTER_USED: ROSTER_USED,
    // client lists
    planRoster: planRoster, seats: seats, pickWithin: pickWithin, EMAIL_RE: EMAIL_RE,
    // programs
    gridToRead: gridToRead, programToRead: programToRead, weeksToRead: weeksToRead, composeCell: composeCell,
    // loading + samples
    loadXlsx: loadXlsx, loadUnzip: loadUnzip, SAMPLES: SAMPLES, sampleWorkbookBytes: sampleWorkbookBytes
  };
})();
if (typeof window !== 'undefined') window.ImportCore = ImportCore;
