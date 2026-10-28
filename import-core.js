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
  // The page, or import-worker.js (a workbook is read off the main thread there).
  var G = typeof window !== 'undefined' ? window : self;
  var SK = function () { return G.SwitchKit; };
  var hkey = function (h) { return SK().hkey(h); };
  var MB = 1024 * 1024, MAX_COLS = 80, MAX_ROWS = 200000;
  // A .zip of CSVs: 400 files at most (2,000 entries with folders and macOS's __MACOSX copies), 80 MB once
  // unpacked, 20 MB for any one file. A workbook is a zip too (.xlsx, .ods): 4,000 parts, 256 MB unpacked.
  var ZIP = { files: 400, entries: 2000, bytes: 80 * MB, one: 20 * MB };
  var BOOK = { entries: 4000, bytes: 256 * MB, one: 256 * MB, run: MB };
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

  // ================================================================= zips, read with limits
  // One reader for every zip the intake opens: a .zip of CSVs (unzip) and an .xlsx or .ods before SheetJS
  // reads it (checkWorkbook). The central directory is read strictly: one disk, its two entry counts equal
  // (SheetJS counts the entries "on this disk", the spec's total is the other), no ZIP64 sizes, the
  // directory and every entry inside the file. What's unpacked is exactly what was checked, and each
  // entry is inflated a slice at a time with what comes out counted: an entry that inflates past the size
  // it declared stops within one slice (a zip bomb costs milliseconds, not minutes or gigabytes).
  // Errors carry code 'bad_zip' or 'too_big'; unzip and checkWorkbook word them for the coach.
  function zipFail(code) { return Object.assign(new Error(code === 'too_big' ? 'The zip is too big' : 'The zip didn\'t open'), { code: code }); }
  function rd16(u8, o) { return u8[o] | (u8[o + 1] << 8); }
  function rd32(u8, o) { return (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0; }
  // → { entries: [{ name, flags, method, compSize, size, offset, xAt, xLen (its extra field) }], cdAt }
  function zipDir(u8, maxEntries) {
    var n = u8.length, eocd = -1;
    // The last end record, looking from the very end as SheetJS does: one inside the last 22 bytes can't be whole.
    for (var i = n - 4; i >= Math.max(0, n - 22 - 65535); i--) {
      if (u8[i] === 0x50 && u8[i + 1] === 0x4B && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
    }
    if (eocd < 0 || eocd + 22 > n) throw zipFail('bad_zip');
    var onDisk = rd16(u8, eocd + 8), total = rd16(u8, eocd + 10), cdSize = rd32(u8, eocd + 12), cdAt = rd32(u8, eocd + 16);
    if (rd16(u8, eocd + 4) || rd16(u8, eocd + 6) || onDisk !== total) throw zipFail('bad_zip');
    // ZIP64 (past 65,535 entries or 4 GB) is never a file this size: refused, not read another way.
    if (total === 0xFFFF || cdSize === 0xFFFFFFFF || cdAt === 0xFFFFFFFF) throw zipFail('bad_zip');
    if (total > maxEntries) throw zipFail('too_big');
    if (cdAt + cdSize > eocd) throw zipFail('bad_zip');
    var out = [], at = cdAt, end = cdAt + cdSize;
    var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
    for (var k = 0; k < total; k++) {
      if (at + 46 > end || rd32(u8, at) !== 0x02014b50) throw zipFail('bad_zip');
      var nl = rd16(u8, at + 28), xl = rd16(u8, at + 30), cl = rd16(u8, at + 32);
      if (at + 46 + nl + xl + cl > end) throw zipFail('bad_zip');
      var e = { flags: rd16(u8, at + 8), method: rd16(u8, at + 10), compSize: rd32(u8, at + 20), size: rd32(u8, at + 24), offset: rd32(u8, at + 42), xAt: at + 46 + nl, xLen: xl };
      if (e.compSize === 0xFFFFFFFF || e.size === 0xFFFFFFFF || e.offset === 0xFFFFFFFF) throw zipFail('bad_zip');
      // Names as UTF-8 whatever the flag says (macOS writes UTF-8 without it).
      var nb = u8.subarray(at + 46, at + 46 + nl);
      e.name = dec ? dec.decode(nb) : String.fromCharCode.apply(null, nb);
      out.push(e);
      at += 46 + nl + xl + cl;
    }
    return { entries: out, cdAt: cdAt };
  }
  // An entry's local header: where its bytes start, and the method, flags and size it gives (SheetJS goes
  // by these). Its bytes must sit before the central directory.
  function zipLocal(u8, e, cdAt) {
    var at = e.offset;
    if (at + 30 > cdAt || rd32(u8, at) !== 0x04034b50) throw zipFail('bad_zip');
    var nl = rd16(u8, at + 26), xl = rd16(u8, at + 28), start = at + 30 + nl + xl;
    if (start + e.compSize > cdAt) throw zipFail('bad_zip');
    return { flags: rd16(u8, at + 6), method: rd16(u8, at + 8), compSize: rd32(u8, at + 18), size: rd32(u8, at + 22), start: start, xAt: at + 30 + nl, xLen: xl };
  }
  // The sizes a ZIP64 extra field (type 1) gives, read the way SheetJS reads them: the first 8 bytes the
  // uncompressed size, the next 8 the compressed one, whatever the 32-bit sizes say (bytes past the extra
  // field count as 0). → { usz, csz }, 0 when there's none.
  function zip64Sizes(u8, from, len) {
    var end = from + len, at = from, out = { usz: 0, csz: 0 };
    var b = function (i) { return i < end ? u8[i] : 0; };
    var q = function (i) { return ((b(i + 4) | (b(i + 5) << 8) | (b(i + 6) << 16) | (b(i + 7) << 24)) >>> 0) * 4294967296 + ((b(i) | (b(i + 1) << 8) | (b(i + 2) << 16) | (b(i + 3) << 24)) >>> 0); };
    while (at <= end - 4) {
      var type = b(at) | (b(at + 1) << 8), sz = b(at + 2) | (b(at + 3) << 8);
      if (type === 1) { out.usz = Math.max(out.usz, q(at + 4)); out.csz = Math.max(out.csz, q(at + 12)); }
      at += 4 + sz;
    }
    return out;
  }
  // A run of text with no '<' in it, watched as a part comes out: a cell holding megabytes of text is no
  // cell anyone typed (Excel stops at 32,767 characters), and SheetJS takes about 130 bytes of memory per
  // character of one (a 40 MB cell: gigabytes). Every part is watched whatever its name (a workbook can
  // call its sheet anything); a binary part has a '<' every few hundred bytes. → see(chunk), throws long_cell.
  function textRuns(max) {
    var base = 0, last = 0;
    return function (chunk) {
      var n = chunk.length, i = 0;
      for (;;) {
        var limit = last + max - base;    // the next '<' has to come at or before this index
        if (limit >= n) { var r0 = chunk.lastIndexOf(60); if (r0 >= i) last = base + r0; break; }
        var r = chunk.lastIndexOf(60, limit);
        if (r < i) throw zipFail('long_cell');
        last = base + r; i = r + 1;
      }
      base += n;
      if (base - last > max) throw zipFail('long_cell');
    };
  }
  // Far more bytes in than the entry says come out: refused before inflating anything. A deflater grows data
  // that won't compress by a few bytes a block (old .NET ones by a few percent), a bomb by a thousand times.
  function sizeLies(e) { return e.compSize > e.size * 1.25 + 1024; }
  var ZIP_STEP = 16 * 1024;
  // One entry's bytes: stored ones as they are; deflated ones through fflate's streaming inflater 16 KB at a
  // time, what comes out counted, refused the moment it passes max (16 KB of input can make about 16 MB, so
  // that's the most a bomb ever costs). The deflate stream must end inside the entry. keep false: only counts.
  function inflateEntry(F, data, method, max, keep, see) {
    if (method === 0) { if (data.length > max) throw zipFail('too_big'); if (see) see(data); return keep ? data : data.length; }
    if (!data.length) throw zipFail('bad_zip');
    var parts = [], got = 0;
    var inf = new F.Inflate(function (chunk) {
      got += chunk.length;
      if (got > max) throw zipFail('too_big');
      if (see) see(chunk);
      if (keep && chunk.length) parts.push(chunk);
    });
    try {
      for (var i = 0; i < data.length; i += ZIP_STEP) inf.push(data.subarray(i, Math.min(data.length, i + ZIP_STEP)), i + ZIP_STEP >= data.length);
    } catch (err) { throw err && typeof err.code === 'string' ? err : zipFail('bad_zip'); }
    if (!keep) return got;
    if (parts.length === 1) return parts[0];
    var out = new Uint8Array(got), o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }
  var ZIP_WORDS = {
    zip: { too_big: 'That zip is too big to open here. Unzip it and choose the CSV files inside.', bad_zip: 'That zip didn\'t open here. Unzip it and choose the CSV files inside.' },
    book: { too_big: 'That file is too big to open here. Save the tabs you need into a smaller copy.', bad_zip: 'That spreadsheet didn\'t open here. Open it in Excel or Sheets, save a copy as .xlsx and choose that.',
      long_cell: 'A cell in that file holds more text than a spreadsheet cell can. Open it in Excel or Sheets, save a copy as .xlsx and choose that.' }
  };
  function zipWords(e, kind) {
    var w = e && typeof e.code === 'string' && ZIP_WORDS[kind][e.code];
    return w ? Object.assign(new Error(w), { code: e.code, user: true }) : e;
  }
  // A workbook is a zip, and SheetJS unpacks every part of it before reading a cell, allocating what each
  // part's header says. The same checks run first: at most 4,000 parts and 256 MB declared, no part whose
  // header (or ZIP64 field) asks for more than that, every deflate stream ending inside its part and
  // inflating to no more than the directory declares, no run of over 1 MB of text without a tag. So a
  // small file can't make the reader allocate gigabytes or inflate for minutes.
  function checkWorkbook(bytes) {
    var F = G.fflate;
    if (!F || !F.Inflate) throw new Error('The zip reader isn\'t loaded');
    var u8 = toU8(bytes);
    try {
      var dir = zipDir(u8, BOOK.entries), declared = 0, used = 0;
      dir.entries.forEach(function (e) { declared += e.size; });
      if (declared > BOOK.bytes) throw zipFail('too_big');
      dir.entries.forEach(function (e) {
        var loc = zipLocal(u8, e, dir.cdAt), lx = zip64Sizes(u8, loc.xAt, loc.xLen), cx = zip64Sizes(u8, e.xAt, e.xLen);
        if (Math.max(loc.size, lx.usz, cx.usz) > BOOK.one) throw zipFail('too_big');
        if (loc.flags & 0x2041) return;   // encrypted: SheetJS refuses it
        var see = textRuns(BOOK.run);
        // Stored: SheetJS takes the bytes as they are, as many as the largest size any header gives.
        if (loc.method === 0) { see(u8.subarray(loc.start, Math.min(u8.length, loc.start + Math.max(e.compSize, loc.compSize, lx.csz, cx.csz)))); return; }
        if (loc.method !== 8) return;   // SheetJS refuses any other method
        if (sizeLies(e)) throw zipFail('too_big');
        used += inflateEntry(F, u8.subarray(loc.start, loc.start + e.compSize), 8, Math.min(e.size, BOOK.one), false, see);
        if (used > BOOK.bytes) throw zipFail('too_big');
      });
    } catch (e) { throw zipWords(e, 'book'); }
  }
  // A zip's file list (nothing unpacked), for telling an .xlsx from an .ods or a zip of CSVs:
  // [{ name, method, size, compSize, offset }], [] when it isn't a zip this reader opens.
  function zipEntries(bytes) {
    try { return zipDir(toU8(bytes), 65535).entries.map(function (e) { return { name: e.name, method: e.method, size: e.size, compSize: e.compSize, offset: e.offset }; }); }
    catch (e) { return []; }
  }

  // ================================================================= what a file is
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
      if (!names.length && /^(xlsx|xlsm|ods)$/.test(ext)) return ext === 'ods' ? 'ods' : 'xlsx';   // a zip this reader refuses: the workbook check says why
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
  // Card, payment and revenue columns: never past here. By their header (words a training log never uses
  // for a column; a currency sign anywhere in it), and by what's in them: a column holding a card number
  // goes whatever it's called, a headerless list's included.
  var PAY_ALWAYS = new RegExp('\\b(card|cards|cc|credit|debit|visa|mastercard|amex|payments?|pay|paid|payouts?|payer|revenue|stripe|paypal|venmo|zelle|cash ?app|' +
    'billing|billed|invoices?|iban|swift|bic|cvv|cvc|mrr|arr|ltv|lifetime value|bank|routing|sort code|account number|acct|amounts?|prices?|pricing|costs?|fees?|' +
    'charges?|charged|balances?|owed?|owes|owing|outstanding|arrears|due|refunds?|refunded|discounts?|coupons?|promo|deposits?|subscriptions?|earnings|income|profit|' +
    'sales|tax|taxes|vat|gst|currency|usd|eur|gbp|aud|cad|expiry|expiration|transactions?)\\b|\\blast ?(4|four)\\b|\\b(total|amount|money) spent\\b|^spent$', 'i');
  var MONEY_SIGN = /[$€£¥₹]/;
  var PAY_ROSTER = /^(plan|plans|product|products|package|packages|membership|memberships|tier|tiers|rate|rates|fee|fees|offer|offers|monthly|yearly|annual|annually)$/i;
  function finishTable(t) {
    t.dropped = t.dropped || [];
    if (t.kind === 'text' || !t.rows.length) return t;
    dropColumns(t, function (key, raw) { return PAY_ALWAYS.test(key) || MONEY_SIGN.test(raw); });
    var cards = cardColumns(t.rows);
    if (cards.length) {
      var h = findHeader(t.rows), head = h.none ? [] : t.rows[h.index].cells;
      removeColumns(t, cards, cards.map(function (i) { var n = String(head[i] == null ? '' : head[i]).trim(); return n && !dataCell(n) ? n : 'Column ' + colName(i); }));
    }
    return t;
  }
  // A card number: 13 to 19 digits (spaces or dashes between the groups allowed) passing the Luhn check, from
  // the ranges cards are issued in (2 to 6: a 13-digit timestamp in milliseconds starts with 1).
  function cardLike(v) {
    var s = String(v == null ? '' : v).trim();
    if (s.length < 13 || s.length > 23 || !/^[2-6][\d -]*\d$/.test(s)) return false;
    var d = s.replace(/[ -]/g, '');
    if (d.length < 13 || d.length > 19 || /\D/.test(d)) return false;
    var sum = 0;
    for (var i = 0; i < d.length; i++) { var x = d.charCodeAt(d.length - 1 - i) - 48; if (i % 2) { x *= 2; if (x > 9) x -= 9; } sum += x; }
    return sum % 10 === 0;
  }
  function cardColumns(rows) {
    var out = [];
    rows.forEach(function (r) { (r.cells || []).forEach(function (c, i) { if (c && String(c).length >= 13 && out.indexOf(i) < 0 && cardLike(c)) out.push(i); }); });
    return out.sort(function (a, b) { return a - b; });
  }
  // Takes columns out of every row (raw rebuilt from what's left, so a skipped row's example never
  // shows a dropped cell). drop: [column], names: what the coach is told was left out.
  function removeColumns(t, drop, names) {
    if (!drop.length) return [];
    t.rows = t.rows.map(function (r) {
      var cells = r.cells.filter(function (c, i) { return drop.indexOf(i) < 0; });
      return { cells: cells, line: r.line, raw: cells.filter(function (c) { return String(c || '').trim(); }).join(', ') };
    });
    t.dropped = (t.dropped || []).concat(names);
    t.text = null;
    return names;
  }
  // The columns whose header passes test(key, raw header), taken out. A file with no header row has none.
  function dropColumns(t, test) {
    var h = findHeader(t.rows), head = h.none ? [] : (t.rows[h.index] || { cells: [] }).cells;
    var drop = [];
    head.forEach(function (c, i) { if (String(c || '').trim() && test(hkey(c), String(c))) drop.push(i); });
    return removeColumns(t, drop, drop.map(function (i) { return String(head[i]).trim(); }));
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
  // One tab → { rows, noValue, fullRows, cut (a quick look that filled its rows), capped (past 200,000 rows) }.
  // Only the cells that exist are visited: a size tag claiming a million rows, or a stray cell in the last
  // row, costs nothing for the rows in between, and a row is built only once something is in it.
  function sheetToTable(ws, date1904, sheetRows) {
    var t = { rows: [], noValue: 0 };
    var range = decodeRange(ws && ws['!ref']);
    if (!range) return t;
    // A quick look (sheetRows) keeps the size the tab's own tag gives in !fullref (the tab picker shows it).
    // A tab without that tag says nothing about the rest: one whose quick look filled every row it read
    // may go on, so it's read again in full when picked.
    var full = decodeRange(ws['!fullref'] || ws['!ref']);
    t.fullRows = full ? full.e.r - full.s.r + 1 : 0;
    if (sheetRows && range.e.r - range.s.r + 1 >= sheetRows) t.cut = true;
    var R0 = range.s.r, R1 = range.e.r, C0 = range.s.c, C1 = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
    var got = [], byRow = {};
    var put = function (r, c, cell) {
      if (cell && cell.f != null && cell.v === undefined) t.noValue++;
      var v = cellText(cell, date1904);
      if (v === '') return;
      var g = byRow[r];
      if (!g) { if (got.length >= MAX_ROWS) { t.capped = true; return; } g = byRow[r] = { r: r, vals: {} }; got.push(g); }
      g.vals[c - C0] = v;
    };
    var dense = Array.isArray(ws['!data']) ? ws['!data'] : null;
    if (dense) {
      for (var r = R0, rEnd = Math.min(R1, dense.length - 1); r <= rEnd; r++) {
        var dr = dense[r];
        if (!dr) continue;
        for (var c = C0, cEnd = Math.min(C1, dr.length - 1); c <= cEnd; c++) if (dr[c]) put(r, c, dr[c]);
      }
    } else {
      Object.keys(ws || {}).forEach(function (k) {
        var p = k.charCodeAt(0) !== 33 && decodeRange(k);   // '!ref', '!merges' … aren't cells
        if (p && p.s.r === p.e.r && p.s.c === p.e.c && p.s.r >= R0 && p.s.r <= R1 && p.s.c >= C0 && p.s.c <= C1) put(p.s.r, p.s.c, ws[k]);
      });
      got.sort(function (a, b) { return a.r - b.r; });
    }
    got.forEach(function (g, i) { g.at = i; });
    // Merged cells keep their value in the first cell only. A merge down one column (a date or an
    // exercise beside its sets) fills the rows inside it that hold something; one across a row only near
    // the top (a "Week 1" over its Sets / Reps / Load columns), never a banner in the body. A budget
    // bounds the work whatever the merges claim.
    var budget = 1000000;
    (ws['!merges'] || []).forEach(function (m) {
      if (budget <= 0 || !m || !m.s || !m.e) return;
      var top = byRow[m.s.r], v = top && top.vals[m.s.c - C0];
      if (!v) return;
      var vertical = m.s.c === m.e.c, across = m.s.r === m.e.r && m.s.r - R0 <= 5;
      if (across && !vertical) {
        for (var cc = Math.max(m.s.c, C0); cc <= Math.min(m.e.c, C1) && budget-- > 0; cc++) if (top.vals[cc - C0] == null) top.vals[cc - C0] = v;
        return;
      }
      if (!vertical) return;
      for (var k = top.at + 1; k < got.length && got[k].r <= m.e.r && budget-- > 0; k++) if (got[k].vals[m.s.c - C0] == null) got[k].vals[m.s.c - C0] = v;
    });
    var lastCol = -1;
    got.forEach(function (g) { Object.keys(g.vals).forEach(function (c) { if (+c > lastCol) lastCol = +c; }); });
    got.forEach(function (g) {
      var cells = [];
      for (var c = 0; c <= lastCol; c++) cells.push(g.vals[c] != null ? g.vals[c] : '');
      t.rows.push({ cells: cells, line: g.r + 1, raw: cells.filter(function (x) { return x !== ''; }).join(', ') });
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
      var t = sheetToTable(ws, d1904, opts.sheetRows);
      t.name = String(nm); t.source = opts.source || ''; t.kind = 'sheet'; t.hidden = !!(meta && meta.Hidden === 1);
      if (t.rows.length) out.push(finishTable(t));
    });
    return out;
  }
  // A real .xlsx / .ods through SheetJS (import-lib-xlsx.js and import-lib-fflate.js, loaded first by
  // loadXlsx; in import-worker.js off the main thread), its zip checked first (checkWorkbook).
  //   opts: { sheetRows (read only the first n rows: the tab picker's quick look), sheets (only these tabs), name }
  function readWorkbook(bytes, opts) {
    opts = opts || {};
    var X = G.XLSX;
    if (!X || !X.read) throw new Error('The spreadsheet reader isn\'t loaded');
    var u8 = toU8(bytes);
    if (u8[0] === 0x50 && u8[1] === 0x4B) checkWorkbook(u8);
    var o = { type: 'array', cellDates: true, cellNF: true, cellStyles: false, cellHTML: false, dense: true, WTF: false };
    if (opts.sheetRows) o.sheetRows = opts.sheetRows;
    if (opts.sheets) o.sheets = opts.sheets;
    var wb = X.read(u8, o);
    return tablesFromWorkbook(wb, { source: opts.name || '', sheetRows: opts.sheetRows || 0 });
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
  // Unpacks the readable files of a zip (fflate's inflater, import-lib-fflate.js, loaded first by loadUnzip;
  // in import-worker.js off the page's main thread): → [{ name, bytes }] (bytes null for a file it doesn't
  // read: a photo, a PDF, one over 20 MB, an encrypted one). Refused before anything is inflated when the
  // directory holds more than 400 files or declares more than 80 MB, or a file declares less than its
  // compressed bytes; refused while inflating when a file comes out bigger than declared or the files pass
  // 80 MB together.
  function unzip(bytes) {
    var F = G.fflate;
    if (!F || !F.Inflate) throw new Error('The zip reader isn\'t loaded');
    var u8 = toU8(bytes);
    try {
      var dir = zipDir(u8, ZIP.entries), used = 0;
      var list = dir.entries.filter(function (e) { return !ZIP_JUNK.test(e.name); });
      var declared = list.reduce(function (a, e) { return a + e.size; }, 0);
      if (list.length > ZIP.files || declared > ZIP.bytes) throw zipFail('too_big');
      return list.map(function (e) {
        if (!ZIP_READABLE.test(e.name) || e.size > ZIP.one || (e.flags & 1) || (e.method !== 0 && e.method !== 8)) return { name: e.name, bytes: null };
        var loc = zipLocal(u8, e, dir.cdAt);
        if (e.method === 0 ? e.compSize !== e.size : sizeLies(e)) throw zipFail(e.method === 0 ? 'bad_zip' : 'too_big');
        var out = inflateEntry(F, u8.subarray(loc.start, loc.start + e.compSize), e.method, e.size, true);
        used += out.length;
        if (used > ZIP.bytes) throw zipFail('too_big');
        return { name: e.name, bytes: out };
      });
    } catch (e) { throw zipWords(e, 'zip'); }
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
  // → { index, score }, or { index: -1, score: 0, none: true } when the file has no header row: the best
  // row holds an email or a card number, or scores nothing and holds a date or a number. Its columns
  // are then Column A, B, C… and every row is data: a client list exported without headers keeps its
  // first person, and nothing in that row is ever taken for a column's name (or remembered as one).
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
    var head = rows && rows[best.index] ? (rows[best.index].cells || rows[best.index]) : [];
    var vals = head.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean);
    if (vals.some(function (v) { return EMAIL_RE.test(v) || cardLike(v); }) || (best.score <= 0 && vals.some(dataCell))) return { index: -1, score: 0, none: true };
    return best;
  }
  // A cell that's data, never a column's name: an email, a card number, a date, a plain number.
  function dataCell(v) {
    v = String(v == null ? '' : v).trim();
    return !!v && (EMAIL_RE.test(v) || cardLike(v) || /^[-+]?[\d.,\s]+(%|kg|lb|lbs)?$/i.test(v) || !!SK().parseDate(v, 'dmy'));
  }
  function letters(n) { var out = []; for (var i = 0; i < n; i++) out.push('Column ' + colName(i)); return out; }

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
    var gi = hdr.none ? null : gridInfo(rows, hdr.index);
    if (gi && gi.headerIndex !== hdr.index) hdr = { index: gi.headerIndex, score: hdr.score };
    // No header row: the columns are named by letter, and the first row is data like the rest.
    var width = 0;
    if (hdr.none) rows.forEach(function (r) { if (r.cells.length > width) width = r.cells.length; });
    var headCells = hdr.none ? letters(Math.min(width, MAX_COLS)) : rows[hdr.index].cells;
    var keys = headCells.map(function (c) { return hkey(c); });
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
    a.noHeader = !!hdr.none;
    a.headers = headCells.map(function (c) { return String(c == null ? '' : c).trim(); });
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
    // The coach's own mapping for these columns wins over every guess (a file with no header row has none:
    // any other headerless file would match it).
    var fp = a.noHeader ? null : fingerprint(a.headers), mem = fp && opts.remembered ? opts.remembered[fp] : null;
    if (mem && Array.isArray(mem.f) && mem.f.length === keys.length) {
      fields = keys.map(function (k, i) { var f = mem.f[i]; return f === null || MEM_FIELDS.indexOf(f) >= 0 ? f : fields[i]; });
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
  // A coach's own column choices, so the next export from the same app is one tap. Kept (coach_settings,
  // or the lifter's device) as a hash of the columns in order and the field of each column by its place:
  // never a header's text, so nothing a file holds is ever kept by it.
  var MEM_FIELDS = LOG_FIELDS.concat(ROSTER_DICT.map(function (d) { return d[1]; }), ['wide']);
  function fingerprint(headers) {
    var keys = (headers || []).map(function (h) { return hkey(h); });
    return 'm2-' + SK().hash64(keys.join('|'));
  }
  // → the maps with this file's choices in (thirty files at most, the oldest go first; maps kept the older
  // way, by header text, go), or null when there's nothing to keep: a "header" holding an email, a card
  // number, a date or a number is data (the screens never remember a file with no header row).
  function rememberMapping(maps, headers, fields, today) {
    headers = headers || [];
    if (!headers.length || headers.some(dataCell)) return null;
    var out = {};
    Object.keys(maps || {}).forEach(function (k) { var m = maps[k]; if (/^m2-/.test(k) && m && Array.isArray(m.f)) out[k] = m; });
    out[fingerprint(headers)] = { f: headers.map(function (h, i) { var f = fields[i]; return MEM_FIELDS.indexOf(f) >= 0 ? f : null; }), at: today || '' };
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
    // Keyed by what the file says: maps with no prototype, so a status of "toString" or a person called
    // "constructor" is a word like any other.
    var dict = function () { return Object.create(null); };
    var byEmail = dict(), byName = dict(), invited = dict();
    (ctx.athletes || []).forEach(function (x) { if (x && x.email) byEmail[String(x.email).trim().toLowerCase()] = 1; if (x && x.name) byName[normName(x.name)] = 1; });
    (ctx.invites || []).forEach(function (x) { if (x && !x.used && x.email) invited[String(x.email).trim().toLowerCase()] = 1; });
    var seen = dict(), people = [], statuses = dict(), groups = dict();
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
  function count(n, one, many) { var s; try { s = Number(n).toLocaleString(); } catch (e) { s = String(n); } return s + ' ' + (n === 1 ? one : (many || one + 's')); }
  // The seats box of a client list in words → { big, title, sub, bar }. s: seats() plus { athletes, pending,
  // plan (its name) }; picked: how many are ticked. blind: the iPhone app before in-app purchase is live (or
  // its demo), tier-blind like the rest of the app there (Apple 3.1.1): no plan name and no seat count,
  // only the room left for lifters.
  function seatText(s, picked, blind) {
    var after = s.unlimited ? Infinity : Math.max(0, s.left - (picked || 0));
    if (blind) {
      if (s.unlimited) return { big: '∞', title: 'Room for everyone you pick', sub: '', bar: false };
      return { big: String(after), title: (after === 1 ? 'more lifter' : 'more lifters') + ' after these',
        sub: 'Room for ' + count(s.left, 'more lifter') + (s.pending ? ' · ' + count(s.pending, 'unused invite') + (s.pending === 1 ? ' holds a place' : ' hold a place each') : ''), bar: false };
    }
    return { big: s.unlimited ? '∞' : String(after), title: s.unlimited ? 'Unlimited seats' : (after === 1 ? 'seat' : 'seats') + ' left after these',
      sub: (s.plan || 'Free') + ' plan · ' + count(s.athletes || 0, 'lifter') + (s.pending ? ' and ' + count(s.pending, 'unused invite') : '') + (s.unlimited ? '' : ' of ' + s.limit + ' seats'),
      bar: !s.unlimited && s.limit <= 30 };
  }
  // What the wall says when the ticks reach the room left (waiting: people still unticked; on: a tick was
  // refused just now). Tier-blind wording in the app before in-app purchase, like openUpgradeModal's.
  function wallText(s, waiting, on, blind) {
    if (s.left === 0) return blind ? 'You\'ve reached your athlete limit: each lifter and each unused invite counts toward it.' : 'Your plan has no seats left. Each lifter and each unused invite holds one.';
    return (blind ? 'There\'s room for ' : 'Your plan has room for ') + count(s.left, 'more lifter') + (waiting ? ': ' + count(waiting, 'other person', 'other people') + ' stay' + (waiting === 1 ? 's' : '') + ' unticked.' : '.') + (on ? ' Untick someone first.' : '');
  }
  // What a column holds, in a word: a client list's left-out columns show this, never their values (only
  // names, emails, groups and statuses are kept, so nothing else is ever shown).
  function describeColumn(a, i) {
    var vals = sample(bodyRows(a), i, 30);
    if (!vals.length) return 'Empty';
    var is = function (test) { return share(vals, test) >= 0.6; };
    if (is(function (v) { return EMAIL_RE.test(v); })) return 'Emails';
    if (is(looksLikeDate)) return 'Dates';
    if (is(function (v) { return /^\+?[\d\s().-]{7,}$/.test(v) && v.replace(/\D/g, '').length >= 7; })) return 'Phone numbers';
    if (is(function (v) { return /^[-+]?[\d.,\s]+(%|kg|kgs|lb|lbs|cm|in)?$/i.test(v); })) return 'Numbers';
    if (is(looksLikeName)) return 'Names';
    return 'Text';
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
    else text = a.table.rows.slice(Math.max(0, a.headerIndex)).map(function (r) { return r.cells.map(function (c) { return String(c == null ? '' : c).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }).join('\n');
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
  function loadXlsx() { return G.XLSX && G.XLSX.read ? Promise.resolve(G.XLSX) : loadScript('import-lib-xlsx.js').then(function () { return G.XLSX; }); }
  function loadUnzip() { return G.fflate && G.fflate.Inflate ? Promise.resolve(G.fflate) : loadScript('import-lib-fflate.js').then(function () { return G.fflate; }); }
  // A workbook and a zip are read off the page's main thread (import-worker.js): SheetJS can take a second on
  // a phone for a big workbook, and a zip can unpack to 80 MB. The same results as reading here. No worker
  // (or one that can't start): read here, after a frame. A worker that started and then fell over on a
  // file doesn't hand that file to the main thread: it's refused.
  var worker = null, workerUp = false, wid = 0, waiting = {};
  function readHere(job, bytes, opts) {
    return Promise.all([loadUnzip(), job === 'zip' ? null : loadXlsx()]).then(function () { return new Promise(function (res) { setTimeout(res, 16); }); }).then(function () {
      if (job === 'zip') { var z = tablesFromZip(unzip(bytes)); return { tables: z.tables, skipped: z.skipped }; }
      return { tables: readWorkbook(bytes, opts) };
    });
  }
  function inWorker(job, bytes, opts) {
    if (typeof Worker === 'undefined' || G.__imNoWorker) return readHere(job, bytes, opts);
    return new Promise(function (resolve, reject) {
      var here = function () { readHere(job, bytes, opts).then(resolve, reject); };
      try {
        if (!worker) {
          worker = new Worker('import-worker.js');
          workerUp = false;
          worker.onmessage = function (e) {
            var m = e.data || {};
            if (m.ready) { workerUp = true; return; }
            var w = waiting[m.id];
            if (!w) return;
            delete waiting[m.id];
            if (m.error) w.reject(Object.assign(new Error(m.error), { code: m.code || undefined, user: !!m.user })); else w.resolve(m);
          };
          worker.onerror = function (e) {
            if (e && e.preventDefault) e.preventDefault();
            var ws = waiting, up = workerUp;
            waiting = {}; worker = null;
            // It never started (offline, an old WebView): everything waiting is read here instead.
            if (!up) G.__imNoWorker = true;
            Object.keys(ws).forEach(function (k) { if (up) ws[k].reject(new Error('The worker stopped reading that file')); else ws[k].here(); });
          };
        }
        var id = ++wid, copy = toU8(bytes).slice();
        waiting[id] = { resolve: resolve, reject: reject, here: here };
        worker.postMessage({ id: id, job: job, bytes: copy, opts: opts || {} }, [copy.buffer]);
      } catch (e) { G.__imNoWorker = true; here(); }
    });
  }
  // → the tables readWorkbook makes.
  function readWorkbookAsync(bytes, opts) { return inWorker('book', bytes, opts).then(function (m) { return m.tables; }); }
  // → { tables, skipped } (tablesFromZip of unzip).
  function readZipAsync(bytes) { return inWorker('zip', bytes, {}).then(function (m) { return { tables: m.tables || [], skipped: m.skipped || [] }; }); }

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
    wide: { name: 'training log.csv', from: 'a spreadsheet', text: ['Date,Exercise,Set 1 Weight,Set 1 Reps,Set 1 RPE,Set 2 Weight,Set 2 Reps,Set 2 RPE,Set 3 Weight,Set 3 Reps,Set 3 RPE,Feel',
      '05/10/2026,Squat,160,5,7,165,5,7.5,170,3,8.5,Strong', '05/10/2026,Bench,105,5,7.5,105,5,8,,,,Fine', '07/10/2026,Deadlift,190,3,7,200,3,8,205,2,8.5,Heavy', '07/10/2026,Paused bench,95,4,7,95,4,7.5,95,4,8,Fine'].join('\n') },
    grid: { name: 'Block 3.csv', from: 'a spreadsheet', text: ['Exercise,Week 1,Week 2,Week 3,Week 4', 'Day 1 · Squat / Bench,,,,', 'Squat,"1x3 @8, 3x5 75%","1x2 @8, 3x4 78%","1x1 @8.5, 3x3 82%",3x3 70% @6',
      'Bench,4x6 72.5%,4x5 75%,4x4 80%,3x5 67.5%', 'Barbell Row,4x8 2RIR,4x8 2RIR,4x8 1RIR,3x8 3RIR', 'Day 2 · Deadlift,,,,', 'Deadlift,"1x3 @8, 2x3 75%","1x2 @8, 2x3 78%","1x1 @8.5, 2x2 82%",2x3 70% @6',
      'Paused Bench,4x5 @7,4x4 @7.5,4x3 @8,3x4 @6', 'Leg Curl,3x12,3x12,3x10,2x12'].join('\n') }
  };
  // The demo's workbook, built with SheetJS so it goes through the real reader: three tabs.
  function sampleWorkbookBytes() {
    var X = G.XLSX;
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
    tablesFromText: tablesFromText, tablesFromWorkbook: tablesFromWorkbook, readWorkbook: readWorkbook, readWorkbookAsync: readWorkbookAsync, tablesFromJson: tablesFromJson,
    unzip: unzip, readZipAsync: readZipAsync, checkWorkbook: checkWorkbook, tablesFromZip: tablesFromZip, cellText: cellText, excelSerialToISO: excelSerialToISO, isDateFormat: isDateFormat,
    cardLike: cardLike, MAX_ROWS: MAX_ROWS,
    // columns
    findHeader: findHeader, analyse: analyse, setFields: setFields, bodyRows: bodyRows, historyMap: historyMap, unpivotWide: unpivotWide,
    wideGroups: wideGroups, effort: effort, fingerprint: fingerprint, rememberMapping: rememberMapping,
    LOG_FIELDS: LOG_FIELDS, ROSTER_FIELDS: ROSTER_FIELDS, ROSTER_USED: ROSTER_USED,
    // client lists
    planRoster: planRoster, seats: seats, pickWithin: pickWithin, seatText: seatText, wallText: wallText, describeColumn: describeColumn, EMAIL_RE: EMAIL_RE,
    // programs
    gridToRead: gridToRead, programToRead: programToRead, weeksToRead: weeksToRead, composeCell: composeCell,
    // loading + samples
    loadXlsx: loadXlsx, loadUnzip: loadUnzip, SAMPLES: SAMPLES, sampleWorkbookBytes: sampleWorkbookBytes
  };
})();
if (typeof window !== 'undefined') window.ImportCore = ImportCore;
