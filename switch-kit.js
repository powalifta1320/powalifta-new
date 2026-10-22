/* =====================================================================
   switch-kit.js — the Switch kit (2026-10-22)
   Coaches won't leave their spreadsheets if they lose years of records or
   fear lock-in. Three pieces:
     1. History import (coach): an athlete's past sets from a CSV / TSV / pasted
        sheet (Strong, Hevy, FitNotes, a coach's own log, a training journal) or a
        past block laid out like a program. Preview first (rows read, rows skipped
        and why, the date range, the PRs it makes), then confirm. Idempotent: every
        set carries an import key, so the same file twice adds nothing.
     2. Export everything: a zip of CSVs (plus everything.json) built in the
        browser by a store-only zip writer. Coach: every athlete's programs, past
        blocks, logs, check-ins, notes and messages. Athlete: all of their own.
     3. data.html, "Your data is yours" (a public page; this file isn't on it).
   Loaded by coach.html and athlete.html after app.js (it uses el, uiSheet,
   matchExercise, parseProgramSheet, calcE1RM, _csvEscape …). The parsing and
   planning functions are pure and unit-tested in tests.html. ?demo=1 never
   writes: an import lands in the in-memory Store only.
   Hooks into shared files (each marked "SWITCH KIT hook"): app.js openDataSheet,
   desk.js dkCommands + the roster preview, db.js (the DB methods at the end).
   Server side: sql/migration-history-import-2026-10-22.sql.
   ===================================================================== */
var SwitchKit = (function () {
  'use strict';
  var KG_LB = 0.45359237;
  var MAIN = ['squat', 'bench', 'deadlift'];
  var LABEL = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };

  // ---------------------------------------------------------------- text → rows
  // The delimiter of a sheet: tabs (pasted from Sheets/Excel) win, then whichever
  // of ; and , the header line has more of (Strong writes ; in some locales).
  function detectDelim(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 6);
    if (!lines.length) return null;
    if (lines.some(function (l) { return l.indexOf('\t') >= 0; })) return '\t';
    var count = function (l, ch) { var n = 0, q = false; for (var i = 0; i < l.length; i++) { if (l[i] === '"') q = !q; else if (!q && l[i] === ch) n++; } return n; };
    var semi = count(lines[0], ';'), comma = count(lines[0], ',');
    if (semi > comma && semi > 0) return ';';
    if (comma > 0 && lines.filter(function (l) { return count(l, ',') > 0; }).length >= Math.min(2, lines.length)) return ',';
    return null;
  }
  // RFC 4180-ish: quoted fields may hold the delimiter, "" and line breaks (Strong's
  // notes do). Each row remembers the line it started on, for "Row 14 · …".
  function splitRows(text, delim) {
    var s = String(text || '').replace(/^\uFEFF/, '');
    var rows = [];
    if (!delim) {
      s.split(/\r\n|\r|\n/).forEach(function (l, i) { if (l.trim()) rows.push({ cells: [l.trim()], line: i + 1, raw: l.trim() }); });
      return rows;
    }
    var row = [], field = '', q = false, line = 1, start = 1, rawStart = 0;
    var push = function (endIdx) {
      row.push(field.trim());
      if (row.some(function (c) { return c !== ''; })) rows.push({ cells: row, line: start, raw: s.slice(rawStart, endIdx).trim() });
      row = []; field = '';
    };
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else { if (ch === '\n') line++; field += ch; }
        continue;
      }
      if (ch === '"' && field.trim() === '') { field = ''; q = true; }
      else if (ch === delim) { row.push(field.trim()); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        push(i); line++; start = line; rawStart = i + 1;
      } else field += ch;
    }
    if (field !== '' || row.length) push(s.length);
    return rows;
  }
  // "82,5" (a decimal comma), "1,250" (thousands), "1.250,5" (European thousands),
  // "140kg", "142,5 kg", " 140 " → a number or NaN.
  function num(v) {
    var s = String(v == null ? '' : v).trim().replace(/\s+/g, '').replace(/(kgs?|lbs?|kilos?|pounds?)\.?$/i, '');
    if (!s) return NaN;
    if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    var m = s.match(/^-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  // ---------------------------------------------------------------- dates
  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) {
    y = +y; m = +m; d = +d;
    if (y < 100) y += 2000;
    if (!(y >= 1950 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return null;
    var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > dim) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  // A date as coaches and apps write it → 'YYYY-MM-DD', or null. order: 'dmy' | 'mdy'
  // decides "03/04/2025" when neither part is over 12 (day first unless told).
  function parseDate(raw, order) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    var m;
    if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:$|[T\s,])/))) return ymd(m[1], m[2], m[3]);
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return ymd(m[1], m[2], m[3]);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})(?:$|[T\s,])/))) {
      var a = +m[1], b = +m[2];
      if (a > 12) return ymd(m[3], b, a);
      if (b > 12) return ymd(m[3], a, b);
      return order === 'mdy' ? ymd(m[3], a, b) : ymd(m[3], b, a);
    }
    var t = s.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
    if ((m = t.match(/(?:^|\s)(\d{1,2})(?:st|nd|rd|th)?[\s\-]([a-z]{3,9})\.?[\s\-](\d{4}|\d{2})\b/)) && MON[m[2].slice(0, 3)]) return ymd(m[3], MON[m[2].slice(0, 3)], m[1]);
    if ((m = t.match(/(?:^|\s)([a-z]{3,9})\.?\s(\d{1,2})(?:st|nd|rd|th)?\s(\d{4})\b/)) && MON[m[1].slice(0, 3)]) return ymd(m[3], MON[m[1].slice(0, 3)], m[2]);
    // An Excel serial date (a date cell copied without its format).
    if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) {
      var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
      return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return null;
  }
  // Which way a file writes its dates: 'dmy', 'mdy', 'ambiguous' (all parts ≤ 12) or null.
  function dateOrderOf(values) {
    var seen = false, dmy = false, mdy = false;
    (values || []).forEach(function (v) {
      var m = String(v || '').trim().match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
      if (!m) return;
      seen = true;
      if (+m[1] > 12) dmy = true;
      if (+m[2] > 12) mdy = true;
    });
    if (dmy && !mdy) return 'dmy';
    if (mdy && !dmy) return 'mdy';
    return seen ? 'ambiguous' : null;
  }

  // ---------------------------------------------------------------- one set as text
  // "140x5 @8", "140kg x 5 x 3", "3x5 140", "5 x 140kg", "140 for 5", "315lb x 3 1 RIR",
  // "140kg 5 reps". → { kg (in the written unit), unit ('kg'|'lb'|null), reps, sets, rpe } or null.
  // Bare "3x5" has no load (a prescription, not a set).
  function parseSetText(raw) {
    // Tempo, pauses, bands / chains and "Key: value" come out first, so "w/ chains 20kg" is never
    // the load (app.js parseSetFields). They ride along as `fields`, into the set's note.
    var fields = {};
    // A bare "5-5-5" or "5-3-1" in a journal is reps, not a tempo: a bare one needs a 0 or an X ("3-1-0").
    if (typeof parseSetFields === 'function') { var sf = parseSetFields(raw, { bareTempo: 'strict' }); raw = sf.rest; fields = sf.fields; }
    var s = String(raw == null ? '' : raw).toLowerCase().replace(/[×*]/g, 'x').replace(/(\d),(\d)/g, '$1.$2').trim();
    if (!s) return null;
    var out = { kg: null, unit: null, reps: null, sets: 1, rpe: null }, m;
    if ((m = s.match(/(\d(?:\.5)?)\s*rir\b/)) || (m = s.match(/\brir\s*(\d(?:\.5)?)/))) { out.rpe = 10 - Number(m[1]); s = s.replace(m[0], ' '); }
    if ((m = s.match(/@\s*(?:rpe\s*)?(\d{1,2}(?:\.\d)?)/)) || (m = s.match(/\brpe\s*(\d{1,2}(?:\.\d)?)/))) { out.rpe = Number(m[1]); s = s.replace(m[0], ' '); }
    if ((m = s.match(/\d\s*(kgs?|lbs?)\b/))) out.unit = /lb/.test(m[1]) ? 'lb' : 'kg';
    var N = '(\\d+(?:\\.\\d+)?)', U = '\\s*(kgs?|lbs?)?';
    if ((m = s.match(new RegExp(N + U + '\\s*(?:for|f)\\s*(\\d+)\\b')))) { out.kg = +m[1]; out.reps = +m[3]; }
    else if ((m = s.match(new RegExp(N + U + '\\s*x\\s*' + N + U + '(?:\\s*x\\s*' + N + U + ')?')))) {
      var a = +m[1], ua = m[2], b = +m[3], ub = m[4], c = m[5] != null ? +m[5] : null, uc = m[6];
      var rest = s.replace(m[0], ' ');
      var lone = rest.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*(kgs?|lbs?)?(?=\s|$)/);
      if (c != null) {
        if (uc || (!ua && c > a)) { out.sets = a; out.reps = b; out.kg = c; } else { out.kg = a; out.reps = b; out.sets = c; }
      } else if (ub) { out.reps = a; out.kg = b; }
      else if (ua) { out.kg = a; out.reps = b; }
      else if (lone && +lone[1] >= 20 && a <= 20) { out.sets = a; out.reps = b; out.kg = +lone[1]; }
      else if (a >= b && a > 15) { out.kg = a; out.reps = b; }
      else if (a < b && b > 30) { out.reps = a; out.kg = b; }
      else { out.sets = a; out.reps = b; }
    } else if ((m = s.match(new RegExp(N + U + '\\s*(?:,|/)?\\s*(\\d+)\\s*reps?\\b')))) { out.kg = +m[1]; out.reps = +m[3]; }
    else return null;
    if (!(out.sets >= 1)) out.sets = 1;
    out.fields = fields;
    return out;
  }

  // ---------------------------------------------------------------- exercises
  // matchExercise (the program importer's) with two additions for app exports:
  // machine / dumbbell / specialty-bar work is never the competition lift ("Squat
  // (Smith Machine)", "Bench Press (Dumbbell)", "Trap Bar Deadlift"), and a variant
  // column ("Paused") is honoured when it names one of the lift's variants.
  function matchLift(name, variant) {
    var n = String(name || '').replace(/\s+/g, ' ').trim();
    var s = n.toLowerCase();
    if (/smith|machine|dumbbell|\bdb\b|kettlebell|\bkb\b|cable|landmine|trap bar|hex bar|belt squat|zercher|goblet/.test(s)) {
      var bucket = /squat|leg|lunge|calf|glute|hip|step/.test(s) ? 'legs' : /deadlift|row|pull|curl|shrug|chin/.test(s) ? 'pull' : /bench|press|dip|fly|raise|push|tricep/.test(s) ? 'push' : 'other';
      return { lift: bucket, variant: '', exerciseName: n };
    }
    var ex = (typeof matchExercise === 'function') ? matchExercise(n) : { lift: 'other', variant: '', exerciseName: n };
    var v = String(variant || '').trim();
    if (v && MAIN.indexOf(ex.lift) >= 0 && typeof VARIANTS !== 'undefined' && VARIANTS[ex.lift]) {
      var hit = Object.keys(VARIANTS[ex.lift]).find(function (k) { return k.toLowerCase() === v.toLowerCase(); });
      if (hit) ex = { lift: ex.lift, variant: hit, exerciseName: '' };
    }
    return ex;
  }

  // ---------------------------------------------------------------- headers
  function hkey(h) { return String(h || '').toLowerCase().replace(/[_\-]+/g, ' ').replace(/[^a-z0-9#@%() ]/g, '').replace(/\s+/g, ' ').trim(); }
  // One header row → where each field lives, or null when it isn't a log header.
  function mapHeader(cells) {
    var keys = cells.map(hkey), map = { unit: null };
    var find = function (re, skip) { for (var i = 0; i < keys.length; i++) { if (skip && skip.indexOf(i) >= 0) continue; if (re.test(keys[i])) return i; } return -1; };
    map.date = find(/^(date|day date|session date|workout date|training date|start time|started|start|logged|performed|when|date time|datetime)$/);
    if (map.date < 0) map.date = find(/\bdate\b/);
    map.ex = find(/^(exercise|exercise name|exercise title|exercises|lift|lifts|movement|name|exercisename|activity)$/);
    map.athlete = find(/^(athlete|athlete name|lifter|client|member)$/);
    map.weight = find(/^(weight|load|wt|kg|kgs|lb|lbs|weight (kgs?|lbs?)|weight \((kgs?|lbs?)\)|weight kgs?|weight lbs?|kg lifted|lbs lifted|weight lifted)$/);
    if (map.weight >= 0) { var hw = keys[map.weight]; map.unit = /\blbs?\b|\(lbs?\)/.test(hw) ? 'lb' : /\bkgs?\b|\(kgs?\)/.test(hw) ? 'kg' : null; }
    map.reps = find(/^(reps?|repetitions|rep count|# reps|reps done)$/);
    map.rpe = find(/^(rpe|@|effort|rpe done|actual rpe)$/);
    map.rir = find(/^(rir|reps in reserve)$/);
    map.sets = find(/^(sets|# sets|set count|no of sets|number of sets)$/);
    map.order = find(/^(set|set order|set index|set #|set number|set no)$/);
    map.type = find(/^(set type|type of set|settype)$/);
    map.variant = find(/^(variant|variation)$/);
    map.unitCol = find(/^(unit|units|weight unit)$/);
    map.note = find(/^(notes?|comments?|set notes?|exercise notes?)$/);
    map.dist = find(/^(distance|distance km|distance m|distance mi)$/);
    map.secs = find(/^(seconds|duration|duration seconds|time)$/);
    map.e1rm = find(/^(e1rm|e1rm kg|e1rm lb|estimated 1rm)$/);
    map.text = find(/^(result|results|performance|work|top set|sets x reps|actual|done|logged set|set details?)$/);
    map.tempo = find(/^tempo$/);
    map.pause = find(/^(pause|paused|pause s|pause secs?|pause seconds)$/);
    map.pauseAt = find(/^(pause at|pause where|pause position)$/);
    map.acc = find(/^(bands?|chains?|bands chains|bands\/chains|bands and chains|accommodating( resistance)?)$/);
    map.isLog = map.ex >= 0 && (map.date >= 0) && ((map.weight >= 0 && map.reps >= 0) || map.text >= 0);
    return map;
  }
  function formatOf(keys) {
    var k = keys.join('|');
    if (/exercise title/.test(k) && /set type/.test(k)) return 'Hevy';
    if (/exercise name/.test(k) && /set order/.test(k)) return 'Strong';
    if (/weight \((kgs?|lbs?)\)/.test(k) && /category/.test(k)) return 'FitNotes';
    if (/e1rm kg/.test(k) && /weight kg/.test(k)) return 'POWALIFTA';
    return 'Spreadsheet';
  }

  // ---------------------------------------------------------------- keys
  // FNV-1a over a string, twice with different seeds: 64 bits as 16 hex chars.
  function fnv(str, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function hash64(str) { return fnv(str, 2166136261) + fnv(str, 2166136261 ^ 0x5bd1e995); }
  // What makes two sets the same set: day, lift, variant, accessory name, load, reps, RPE.
  // loose: without the RPE (for a set whose RPE the coach assumed, not the file).
  function tupleOf(l, loose) {
    var t = [l.date, l.lift, l.variant || '', String(l.exerciseName || '').toLowerCase().trim(),
      (Math.round(Number(l.weight) * 100) / 100).toFixed(2), Number(l.reps) || 0];
    if (!loose) t.push(Number(l.rpe) || 0);
    return t.join('|');
  }
  // What the file itself says about a set: the date as written, the exercise and variant,
  // the load in the file's own unit ('' when the file doesn't say), reps, and the RPE
  // ('' when there isn't one). Never the coach's choices (kg/lb, day/month first, the RPE
  // assumed), so re-reading the same file another way gives the same keys.
  function fileTupleOf(c) {
    var rpe = c.rpe >= 1 && c.rpe <= 10 ? String(Math.round(c.rpe * 2) / 2) : '';
    return [String(c.rawDate || c.date || '').trim().toLowerCase(), String(c.name || '').replace(/\s+/g, ' ').trim().toLowerCase(),
      String(c.variant || '').trim().toLowerCase(), (Math.round(Number(c.kg) * 100) / 100).toFixed(2), c.unit || '', Number(c.reps) || 0, rpe].join('|');
  }
  // The import key: the set's file tuple plus how many identical sets came before it in
  // the file (three 140x5 on one day are three sets). Same file → same keys.
  function importKey(tuple, n) { return 'i1-' + hash64(tuple) + '-' + n; }
  // A logged set has no tempo or pause of its own: they go in its note ("Tempo 3-1-0 · Chains 20 kg").
  function noteWithFields(note, fx) {
    var t = fx && typeof setFieldsText === 'function' ? setFieldsText(fx) : '';
    return [String(note || '').trim(), t].filter(Boolean).join(' · ').slice(0, 500);
  }

  // ---------------------------------------------------------------- the plan
  // planHistoryImport(text, opts) → what an import would do, without doing it.
  //   opts: { athleteId, athleteName, unit ('kg'|'lbs'|'lb'), dateOrder ('dmy'|'mdy'),
  //           noRpe (RPE assumed for sets without one, default 8), existing (logs), today }
  // Returns { kind: 'logs'|'block'|'empty', format, logs (new sets to write), dupes,
  //   skipped [{ line, reason, text }], skippedBy {reason: n}, range {from, to}, sessions,
  //   noRpeCount, unitFromFile, dateOrder, dateAmbiguous, prs, block }.
  function planHistoryImport(text, opts) {
    opts = opts || {};
    var unit = /lb/.test(String(opts.unit || 'kg')) ? 'lb' : 'kg';
    var noRpe = Number(opts.noRpe) >= 5 && Number(opts.noRpe) <= 10 ? Number(opts.noRpe) : 8;
    var today = opts.today || (typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10));
    var res = { kind: 'empty', format: null, logs: [], dupes: 0, skipped: [], skippedBy: {}, range: null, sessions: 0,
      noRpeCount: 0, unitFromFile: null, dateOrder: null, dateAmbiguous: false, rows: 0, carried: 0, prs: null, block: null };
    var src = String(text || '');
    if (!src.trim()) return res;
    var delim = detectDelim(src);
    var rows = splitRows(src, delim);
    var cand = [];   // { line, raw, date, name, variant, kg, unit, reps, sets, rpe, note }
    var skip = function (r, reason) { res.skipped.push({ line: r.line, reason: reason, text: String(r.raw || '').slice(0, 140) }); };

    // 1. A sheet with a header row.
    var hi = -1, map = null;
    if (delim) for (var i = 0; i < Math.min(rows.length, 6); i++) { var mp = mapHeader(rows[i].cells); if (mp.isLog) { hi = i; map = mp; break; } }
    if (map) {
      res.format = formatOf(rows[hi].cells.map(hkey));
      res.unitFromFile = map.unit;
      var body = rows.slice(hi + 1);
      var dateVals = body.map(function (r) { return r.cells[map.date]; });
      var ord = dateOrderOf(dateVals);
      res.dateAmbiguous = ord === 'ambiguous';
      res.dateOrder = ord === 'ambiguous' ? (opts.dateOrder || 'dmy') : (ord || opts.dateOrder || 'dmy');
      // A sheet of several lifters (POWALIFTA's own coach export): keep this athlete's rows.
      var who = map.athlete >= 0 ? body.map(function (r) { return String(r.cells[map.athlete] || '').trim().toLowerCase(); }).filter(Boolean) : [];
      var many = who.length && who.some(function (w) { return w !== who[0]; });
      var mine = String(opts.athleteName || '').trim().toLowerCase();
      // Coach sheets write the date (and often the athlete and exercise) only on the first
      // row of a session or exercise; merged cells paste as blanks. A row that has a set on
      // it but a blank there takes the value from the row above, within this file.
      var last = { athlete: '', date: '', ex: '', variant: '' };
      body.forEach(function (r) {
        var c = r.cells, get = function (k) { return map[k] >= 0 ? String(c[map[k]] == null ? '' : c[map[k]]).trim() : ''; };
        res.rows++;
        var hasWork = (map.weight >= 0 && get('weight') !== '') || (map.reps >= 0 && get('reps') !== '') || (map.text >= 0 && get('text') !== '');
        var who1 = get('athlete'), rawDate = get('date'), name = get('ex'), variant = get('variant'), carried = false;
        if (name) { last.ex = name; last.variant = variant; }
        if (rawDate) last.date = rawDate;
        if (who1) last.athlete = who1;
        if (hasWork) {
          if (!who1 && map.athlete >= 0 && last.athlete) { who1 = last.athlete; }
          if (!name && last.ex) { name = last.ex; if (!variant) variant = last.variant; carried = true; }
          if (!rawDate && last.date) { rawDate = last.date; carried = true; }
        }
        if (many && who1.toLowerCase() !== mine) return skip(r, 'Another athlete');
        if (!name) return skip(r, 'No exercise');
        if (/^(body ?weight|bw|weigh ?in)$/i.test(name)) return skip(r, 'A weigh-in, not a set');
        var date = parseDate(rawDate, res.dateOrder);
        if (!date) return skip(r, rawDate ? 'Date not readable' : 'No date');
        if (carried) res.carried++;
        var type = get('type').toLowerCase(), order = get('order').toLowerCase();
        if (/warm/.test(type) || order === 'w') return skip(r, 'Warm-up set');
        var kg = NaN, reps = NaN, sets = 1, rpe = NaN, u = map.unit, fx = {};
        if (map.weight >= 0) kg = num(get('weight'));
        if (map.reps >= 0) reps = num(get('reps'));
        if (map.text >= 0 && (!(kg > 0) || !(reps > 0))) {
          var p = parseSetText(get('text'));
          if (p) { if (p.kg != null) kg = p.kg; if (p.reps != null) reps = p.reps; sets = p.sets || 1; if (p.rpe != null) rpe = p.rpe; if (p.unit) u = p.unit; fx = p.fields || {}; }
        }
        if (typeof parseSetFields === 'function') {
          if (get('tempo')) fx.tempo = parseSetFields('tempo ' + get('tempo')).fields.tempo || get('tempo').slice(0, 24);
          if (get('pause') && !/^(no|none|-|0)$/i.test(get('pause'))) { var pf = parseSetFields('pause ' + get('pause')).fields; if (pf.pause) fx.pause = pf.pause; if (pf.pauseAt) fx.pauseAt = pf.pauseAt; }
          if (get('pauseAt')) fx.pauseAt = get('pauseAt').toLowerCase().slice(0, 24);
          if (get('acc') && !/^(no|none|-)$/i.test(get('acc'))) { var af = parseSetFields(get('acc')).fields; if (!af.acc) af = parseSetFields((/chain/.test(hkey(rows[hi].cells[map.acc])) ? 'chains ' : '+ ') + get('acc') + (/chain/.test(hkey(rows[hi].cells[map.acc])) ? '' : ' bands')).fields; ['acc', 'accTxt', 'accKg'].forEach(function (k) { if (af[k] != null) fx[k] = af[k]; }); }
        }
        if (map.weight >= 0 && !u) { var wm = get('weight').toLowerCase().match(/\d\s*(kgs?|lbs?)\b/); if (wm) u = /lb/.test(wm[1]) ? 'lb' : 'kg'; }
        if (map.unitCol >= 0 && get('unitCol')) u = /lb/i.test(get('unitCol')) ? 'lb' : /kg/i.test(get('unitCol')) ? 'kg' : u;
        if (map.sets >= 0 && num(get('sets')) >= 1) sets = Math.floor(num(get('sets')));
        if (map.rpe >= 0 && get('rpe') !== '') rpe = num(get('rpe'));
        else if (map.rir >= 0 && get('rir') !== '' && isFinite(num(get('rir')))) rpe = 10 - num(get('rir'));
        if (!(reps > 0) && ((map.dist >= 0 && num(get('dist')) > 0) || (map.secs >= 0 && num(get('secs')) > 0))) return skip(r, 'Cardio or a timed set');
        cand.push({ r: r, date: date, rawDate: rawDate, name: name, variant: variant, kg: kg, unit: u, reps: reps, sets: sets, rpe: rpe, note: get('note'), fx: fx });
      });
    } else {
      // 2. A training journal: a date (on its own line or leading a line), then
      //    "Squat 140x5 @8, 145x3 @9" / "Bench: 100kg x 5 x 3".
      var cur = null, curRaw = '', journal = [], dates = [];
      rows.forEach(function (r) { var t = r.cells.join(' '); var dm = t.match(/^\s*([0-9]{1,4}[-\/.][0-9]{1,2}[-\/.][0-9]{1,4})/); if (dm) dates.push(dm[1]); });
      var jord = dateOrderOf(dates);
      res.dateAmbiguous = jord === 'ambiguous';
      res.dateOrder = jord === 'ambiguous' ? (opts.dateOrder || 'dmy') : (jord || opts.dateOrder || 'dmy');
      var SET_RE = /(\d+(?:[.,]\d+)?)\s*(?:kgs?|lbs?)?\s*(?:x|×|\*|for)\s*\d/i;
      rows.forEach(function (r) {
        var t = r.cells.join(delim === '\t' ? ' ' : (delim || ' ')).replace(/^[\s•\-*–]+/, '').trim();
        var lead = t.match(/^((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?([0-9]{4}[-\/.][0-9]{1,2}[-\/.][0-9]{1,2}|[0-9]{1,2}[-\/.][0-9]{1,2}[-\/.][0-9]{2,4}|[0-9]{1,2}(?:st|nd|rd|th)?\s+[a-z]{3,9}\.?,?\s+[0-9]{2,4}|[a-z]{3,9}\.?\s+[0-9]{1,2}(?:st|nd|rd|th)?,?\s+[0-9]{4})\b[\s:,\-–]*/i);
        var d = lead ? parseDate(lead[2], res.dateOrder) : null;
        if (d) { cur = d; curRaw = lead[2]; t = t.slice(lead[0].length).trim(); if (!t) return; }
        var at = t.search(SET_RE);
        if (at < 0) { journal.push({ r: r, kind: 'none' }); return; }
        var name = t.slice(0, at).replace(/[\s:–\-,|@]+$/, '').trim();
        if (!name || /^\d/.test(name)) { journal.push({ r: r, kind: 'none' }); return; }
        if (!cur) { journal.push({ r: r, kind: 'nodate' }); return; }
        // A decimal comma inside a set ("142,5x5", "142,5 kg x 5", "@8,5") isn't a separator.
        var work = t.slice(at).replace(/(\d),(\d{1,2})(?=\s*(?:kgs?|lbs?)?\s*(?:x|×|\*|for)\s*\d)/gi, '$1.$2')
          .replace(/(@\s*(?:rpe\s*)?\d),(5)(?!\d)/gi, '$1.$2').replace(/(\d),(5)(?=\s*rir\b)/gi, '$1.$2');
        work.split(/\s*[,;|]\s*|\s{2,}/).filter(Boolean).forEach(function (piece) {
          var p = parseSetText(piece);
          if (!p) return;
          journal.push({ r: r, kind: 'set', c: { r: r, date: cur, rawDate: curRaw, name: name, variant: '', kg: p.kg, unit: p.unit, reps: p.reps, sets: p.sets, rpe: p.rpe == null ? NaN : p.rpe, note: '', fx: p.fields } });
        });
      });
      var sets = journal.filter(function (j) { return j.kind === 'set'; });
      if (sets.length) {
        res.format = 'Training journal';
        journal.forEach(function (j) {
          if (j.kind === 'set') { res.rows++; cand.push(j.c); }
          else if (j.kind === 'nodate') { res.rows++; skip(j.r, 'No date above it'); }
          else { res.rows++; skip(j.r, 'Not a set'); }
        });
      }
    }

    // 3. Neither: a past block laid out like a program ("Week 1", "Squat 3x5 @8", or a
    //    Week | Day | Exercise | Sets | Reps sheet). It becomes a program_blocks entry.
    if (!cand.length && !res.rows && typeof parseProgramSheet === 'function') {
      var prog = parseProgramSheet(src, { unit: unit === 'lb' ? 'lbs' : 'kg', name: opts.blockName || 'Imported block' });
      if (prog.stats.sets > 0) {
        res.kind = 'block';
        res.format = 'Program';
        res.block = planBlock(prog, src, opts);
        res.skipped = prog.warnings.map(function (w) { return { line: null, reason: 'Not read', text: String(w).slice(0, 140) }; });
        res.skipped.forEach(function (s) { res.skippedBy[s.reason] = (res.skippedBy[s.reason] || 0) + 1; });
        return res;
      }
      return res;
    }

    // 4. Candidates → sets (kg), each with its key; skip what can't be a set.
    var built = [];
    cand.forEach(function (c) {
      var u = c.unit || res.unitFromFile || unit;
      if (!(c.reps > 0)) return skip(c.r, 'No reps');
      if (c.reps > 50 || Math.floor(c.reps) !== c.reps) return skip(c.r, 'Reps don\'t look right');
      if (!(c.kg > 0)) return skip(c.r, 'No weight');
      var kg = u === 'lb' ? c.kg * KG_LB : c.kg;
      if (kg > 600) return skip(c.r, 'Weight too heavy to be real');
      if (c.date > today) return skip(c.r, 'Date in the future');
      var rpe = c.rpe, assumed = false;
      if (!(rpe >= 1 && rpe <= 10)) {
        if (isFinite(rpe) && rpe !== 0) return skip(c.r, 'RPE not between 1 and 10');
        rpe = noRpe; assumed = true;
      }
      rpe = Math.round(rpe * 2) / 2;
      var ex = matchLift(c.name, c.variant);
      var main = MAIN.indexOf(ex.lift) >= 0;
      var w = Math.round(kg * 100) / 100;
      var n = Math.max(1, Math.min(20, Math.floor(c.sets || 1)));
      var ft = fileTupleOf(c);
      for (var k = 0; k < n; k++) {
        var e1 = typeof calcE1RM === 'function' ? calcE1RM(w, c.reps, rpe) : 0;
        built.push({ athleteId: opts.athleteId || null, lift: ex.lift, variant: main ? (ex.variant || 'Competition') : '', exerciseName: main ? '' : ex.exerciseName,
          weight: w, reps: c.reps, rpe: rpe, e1rm: e1, e1rmComp: main && typeof calcCompE1RM === 'function' ? calcCompE1RM(w, c.reps, rpe, ex.lift, ex.variant || 'Competition') : e1,
          note: noteWithFields(c.note, c.fx), date: c.date, source: 'import', _assumed: assumed, _line: c.r.line, _ft: ft });
      }
    });

    // 5. Keys and duplicates: a set already in POWALIFTA (by key from an earlier import,
    //    or the same set logged in the app or re-imported from an export) is left out.
    //    The key comes from what the file says; the match against sets already there
    //    leaves the RPE out when the coach assumed it.
    var existing = (opts.existing || []).filter(function (l) { return !opts.athleteId || l.athleteId === opts.athleteId; });
    var haveKeys = {}, haveTuples = {}, haveLoose = {};
    existing.forEach(function (l) {
      if (l.importKey) haveKeys[l.importKey] = 1;
      var t = tupleOf(l), tl = tupleOf(l, true);
      haveTuples[t] = (haveTuples[t] || 0) + 1; haveLoose[tl] = (haveLoose[tl] || 0) + 1;
    });
    var seenK = {}, seenT = {}, seenL = {};
    built.forEach(function (l) {
      var kn = seenK[l._ft] = (seenK[l._ft] || 0) + 1;
      l.importKey = importKey(l._ft, kn);
      var t = tupleOf(l), tl = tupleOf(l, true);
      var n = seenT[t] = (seenT[t] || 0) + 1, nl = seenL[tl] = (seenL[tl] || 0) + 1;
      if (haveKeys[l.importKey] || (l._assumed ? nl <= (haveLoose[tl] || 0) : n <= (haveTuples[t] || 0))) { res.dupes++; return; }
      if (l._assumed) res.noRpeCount++;
      res.logs.push(l);
    });
    res.allKeys = built.map(function (l) { return l.importKey; });
    res.kind = (res.logs.length || res.dupes) ? 'logs' : 'empty';
    res.skipped.forEach(function (s) { res.skippedBy[s.reason] = (res.skippedBy[s.reason] || 0) + 1; });
    if (res.logs.length) {
      var ds = res.logs.map(function (l) { return l.date; }).sort();
      res.range = { from: ds[0], to: ds[ds.length - 1] };
      res.sessions = Object.keys(res.logs.reduce(function (a, l) { a[l.date] = 1; return a; }, {})).length;
    }
    res.prs = planPRs(existing, res.logs);
    return res;
  }

  // PRs the import makes, per main lift: running bests over everything already there
  // plus the new sets in date order. A set counts when it beats the best before it
  // (the very first set of a lift sets the bar; it isn't a PR).
  //   → { squat: { best: {kg,date,weight,reps,rpe}, prs, newBest, wasKg } , … , total }
  function planPRs(existing, fresh) {
    var out = { total: 0 };
    MAIN.forEach(function (L) {
      var all = (existing || []).filter(function (l) { return l.lift === L && Number(l.e1rmComp) > 0; }).map(function (l) { return { l: l, mine: false }; })
        .concat((fresh || []).filter(function (l) { return l.lift === L && Number(l.e1rmComp) > 0; }).map(function (l) { return { l: l, mine: true }; }));
      if (!all.some(function (x) { return x.mine; })) return;
      all.sort(function (a, b) { return String(a.l.date).localeCompare(String(b.l.date)) || (a.mine === b.mine ? 0 : a.mine ? 1 : -1); });
      var best = 0, prs = 0, top = null;
      all.forEach(function (x) {
        var v = Number(x.l.e1rmComp);
        if (x.mine && best > 0 && v > best + 0.05) prs++;
        if (v > best) best = v;
        if (x.mine && (!top || v > Number(top.e1rmComp))) top = x.l;
      });
      var was = (existing || []).filter(function (l) { return l.lift === L; }).reduce(function (m, l) { return Math.max(m, Number(l.e1rmComp) || 0); }, 0);
      out[L] = { best: { kg: Number(top.e1rmComp), date: top.date, weight: top.weight, reps: top.reps, rpe: top.rpe, variant: top.variant },
        prs: prs, newBest: Number(top.e1rmComp) > was + 0.05, wasKg: was || null };
      out.total += prs;
    });
    return out;
  }

  // A past block: every set counts as done (it's history), dated across the block's
  // weeks ending `endedOn` (default yesterday) unless the coach sets the dates.
  function planBlock(prog, src, opts) {
    opts = opts || {};
    var weeks = JSON.parse(JSON.stringify(prog.weeks));
    var nW = weeks.length || 1;
    var end = opts.blockEnd || addDays(opts.today || (typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10)), -1);
    var start = opts.blockStart || addDays(end, -(nW * 7 - 1));
    if (start > end) { var t = start; start = end; end = t; }
    weeks.forEach(function (w, wi) {
      (w.days || []).forEach(function (d, di) {
        var day = addDays(start, Math.min(wi * 7 + Math.round(di * 7 / Math.max(1, (w.days || []).length)), dayDiff(start, end)));
        (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { s.completed = true; s.actualRpe = s.rpe != null ? s.rpe : null; s.completedAt = day; }); });
      });
    });
    // The key ignores spacing and blank lines, so a re-pasted sheet is the same block.
    var key = 'b1-' + hash64(String(src).split(/\r?\n/).map(function (l) { return l.replace(/[ \t]+/g, ' ').trim().toLowerCase(); }).filter(Boolean).join('\n'));
    return { name: (opts.blockName || prog.name || 'Imported block').slice(0, 120), weeks: weeks, stats: prog.stats, startedOn: start, endedOn: end, importKey: key };
  }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000); }

  // ---------------------------------------------------------------- export
  function csvCell(v) {
    if (typeof _csvEscape === 'function') return _csvEscape(v);
    if (v == null) return '';
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCsv(header, rows) {
    return [header.map(csvCell).join(',')].concat(rows.map(function (r) { return r.map(csvCell).join(','); })).join('\r\n') + '\r\n';
  }
  var pick = function (o, a, b) { return o[a] != null ? o[a] : o[b]; };
  function r2(v) { return v == null || v === '' || !isFinite(Number(v)) ? '' : Math.round(Number(v) * 100) / 100; }
  function exName(l) {
    var lift = l.lift, ex = pick(l, 'exerciseName', 'exercise_name');
    if (LABEL[lift]) return LABEL[lift];
    return ex || (typeof LIFT_LABELS !== 'undefined' && LIFT_LABELS[lift]) || lift || '';
  }
  // The training log, in the shape the importer reads back (weights in kg).
  function logsCsv(logs, nameOf) {
    var withAth = !!nameOf;
    var rows = (logs || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).map(function (l) {
      var aid = pick(l, 'athleteId', 'athlete_id');
      return (withAth ? [nameOf(aid)] : []).concat([l.date, exName(l), LABEL[l.lift] ? (l.variant || 'Competition') : '', r2(l.weight), l.reps, l.rpe,
        r2(pick(l, 'e1rmComp', 'e1rm_comp') || l.e1rm), l.note || '', l.source || 'app']);
    });
    return toCsv((withAth ? ['athlete'] : []).concat(['date', 'exercise', 'variant', 'weight_kg', 'reps', 'rpe', 'e1rm_kg', 'note', 'source']), rows);
  }
  // A program (or past block, or template) one row per set, as written and as done.
  function programRows(prefix, weeks) {
    var out = [];
    (weeks || []).forEach(function (w) {
      (w.days || []).forEach(function (d) {
        var exs = d.exercises || [];
        if (!exs.length) { out.push(prefix.concat([w.number, d.name || '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])); return; }
        exs.forEach(function (e) {
          var nm = LABEL[e.lift] ? LABEL[e.lift] : (e.exerciseName || (typeof LIFT_LABELS !== 'undefined' && LIFT_LABELS[e.lift]) || e.lift || '');
          var sets = e.sets || [];
          if (!sets.length) { out.push(prefix.concat([w.number, d.name || '', nm, e.variant || '', '', '', '', '', '', '', '', '', '', '', '', '', '', e.note || '', '', '', '', ''])); return; }
          sets.forEach(function (s, i) {
            out.push(prefix.concat([w.number, d.name || '', nm, e.variant || '', i + 1, r2(s.weight), r2(s.weightHi), s.pct != null ? s.pct : '', s.pctHi != null ? s.pctHi : '',
              s.reps != null ? s.reps : '', s.rpe != null ? s.rpe : '', s.rpeHi != null ? s.rpeHi : '', s.rir ? 'yes' : '', s.tempo || '',
              s.completed ? 'yes' : '', s.actualRpe != null ? s.actualRpe : '', s.completedAt ? String(s.completedAt).slice(0, 10) : '', i === 0 ? (e.note || '') : (s.note || '')].concat(fieldCells(s))));
          });
        });
      });
    });
    return out;
  }
  // Set fields (app.js setFieldsOf): the pause, the bands or chains, and the coach's own columns
  // as "Bar: SSB · Belt: no" (the program importer reads that column back).
  function fieldCells(s) {
    var f = typeof setFieldsOf === 'function' ? setFieldsOf(s) : {};
    var acc = f.acc === 'chains' ? ['chains', f.accKg ? r2(f.accKg) + 'kg' : '', f.accTxt ? '(' + f.accTxt + ')' : ''].filter(Boolean).join(' ')
      : f.acc === 'bands' ? [f.accTxt || '', 'bands', f.accKg ? r2(f.accKg) + 'kg' : ''].filter(Boolean).join(' ') : '';
    var cx = f.cx ? Object.keys(f.cx).map(function (k) { return k + ': ' + f.cx[k]; }).join(' · ') : '';
    return [f.pause != null ? f.pause : '', f.pauseAt || '', acc, cx];
  }
  var SET_COLS = ['week', 'day', 'exercise', 'variant', 'set', 'weight_kg', 'weight_hi_kg', 'percent', 'percent_hi', 'reps', 'rpe', 'rpe_hi', 'rir', 'tempo', 'done', 'done_rpe', 'done_on', 'note', 'pause_s', 'pause_at', 'bands_chains', 'custom'];
  // Any list of records → CSV: the union of their keys, nested values as JSON.
  // `drop` leaves out keys covered elsewhere (a program's weeks have their own file).
  function recordsCsv(list, nameOf, drop) {
    drop = drop || [];
    var cols = [];
    (list || []).forEach(function (o) { Object.keys(o || {}).forEach(function (k) { if (cols.indexOf(k) < 0 && drop.indexOf(k) < 0 && k.charAt(0) !== '_') cols.push(k); }); });
    var aidCol = cols.indexOf('athleteId') >= 0 ? 'athleteId' : cols.indexOf('athlete_id') >= 0 ? 'athlete_id' : null;
    var header = (nameOf && aidCol ? ['athlete'] : []).concat(cols);
    var rows = (list || []).map(function (o) {
      return (nameOf && aidCol ? [nameOf(o[aidCol])] : []).concat(cols.map(function (k) { var v = o[k]; return v != null && typeof v === 'object' ? JSON.stringify(v) : v; }));
    });
    return toCsv(header, rows);
  }
  // data: { role, account, athletes, logs, programs, blocks, templates, checkins, checkinAnswers,
  //   checkinQuestions, sessionNotes, coachNotes, messages, bodyweight, goals, meets, restDays,
  //   formChecks, health, listings, sales, notIncluded } → [{ name, text }]
  function buildExportFiles(data) {
    data = data || {};
    var coach = data.role === 'coach';
    var names = {};
    (data.athletes || []).forEach(function (a) { names[a.id] = a.name || a.email || a.id; });
    if (data.account) names[data.account.id] = data.account.name || 'Me';
    var nameOf = coach ? function (id) { return names[id] || id || ''; } : null;
    var files = [];
    var add = function (name, text, n) { files.push({ name: name, text: text, count: n }); };
    var progName = function (p) { return p.name || 'Program'; };
    if (coach) add('athletes.csv', recordsCsv((data.athletes || []).map(function (a) { return { id: a.id, name: a.name, email: a.email, country: a.countryCode || a.country_code || '', joined: a.createdAt ? new Date(Number(a.createdAt) || a.createdAt).toISOString().slice(0, 10) : '' }; })), (data.athletes || []).length);
    add('training-log.csv', logsCsv(data.logs, nameOf), (data.logs || []).length);
    var progRows = [];
    (data.programs || []).forEach(function (p) { progRows = progRows.concat(programRows((coach ? [nameOf(pick(p, 'athleteId', 'athlete_id'))] : []).concat([progName(p)]), p.weeks)); });
    add(coach ? 'programs.csv' : 'program.csv', toCsv((coach ? ['athlete'] : []).concat(['program'], SET_COLS), progRows), (data.programs || []).length);
    var blkRows = [];
    (data.blocks || []).forEach(function (b) {
      blkRows = blkRows.concat(programRows((coach ? [nameOf(pick(b, 'athleteId', 'athlete_id'))] : []).concat([b.name || 'Block', pick(b, 'startedOn', 'started_on') || '', pick(b, 'endedOn', 'ended_on') || '']), b.weeks));
    });
    add('past-blocks.csv', toCsv((coach ? ['athlete'] : []).concat(['block', 'started', 'ended'], SET_COLS), blkRows), (data.blocks || []).length);
    if (coach) {
      var tplRows = [];
      (data.templates || []).forEach(function (t) { tplRows = tplRows.concat(programRows([t.name || 'Template'], (t.payload && t.payload.weeks) || t.weeks)); });
      add('templates.csv', toCsv(['template'].concat(SET_COLS), tplRows), (data.templates || []).length);
    }
    var simple = [
      ['check-ins.csv', data.checkins], ['check-in-answers.csv', data.checkinAnswers], ['check-in-questions.csv', coach ? data.checkinQuestions : null],
      ['session-notes.csv', data.sessionNotes], ['coach-notes.csv', coach ? data.coachNotes : null], ['messages.csv', data.messages],
      ['bodyweight.csv', data.bodyweight], ['goals.csv', data.goals], ['meets.csv', data.meets], ['rest-days.csv', data.restDays],
      ['form-checks.csv', data.formChecks], ['health.csv', data.health], ['marketplace-listings.csv', coach ? data.listings : null], ['sales.csv', coach ? data.sales : null]
    ];
    simple.forEach(function (x) { if (x[1] && x[1].length) add(x[0], recordsCsv(x[1], nameOf, ['weeks', 'payload']), x[1].length); });
    var json = {
      exportedAt: new Date().toISOString(), source: 'powalifta.com', units: 'kg', role: data.role || null, account: data.account || null,
      athletes: coach ? (data.athletes || []) : undefined, logs: data.logs || [], programs: data.programs || [], pastBlocks: data.blocks || [],
      templates: coach ? (data.templates || []) : undefined, checkins: data.checkins || [], checkinAnswers: data.checkinAnswers || [],
      checkinQuestions: coach ? (data.checkinQuestions || []) : undefined, sessionNotes: data.sessionNotes || [], coachNotes: coach ? (data.coachNotes || []) : undefined,
      messages: data.messages || [], bodyweight: data.bodyweight || [], goals: data.goals || [], meets: data.meets || [], restDays: data.restDays || [],
      formChecks: data.formChecks || [], health: data.health || [], marketplaceListings: coach ? (data.listings || []) : undefined, sales: coach ? (data.sales || []) : undefined
    };
    add('everything.json', JSON.stringify(json, null, 2));
    add('README.txt', readme(data, files));
    return files;
  }
  function readme(data, files) {
    var coach = data.role === 'coach';
    var lines = [
      'POWALIFTA export',
      'Made ' + new Date().toISOString().slice(0, 10) + (data.account && data.account.name ? ' for ' + data.account.name : '') + '.',
      '',
      'Every file opens in Excel, Numbers or Google Sheets. Weights are in kilograms.',
      'everything.json holds the same data in one file, for moving it to another app.',
      '',
      'Files:'
    ];
    var what = {
      'athletes.csv': 'everyone on your roster',
      'training-log.csv': 'every set logged, one row per set' + (coach ? ', with the athlete' : ''),
      'programs.csv': 'each athlete\'s current program, one row per set: what was written and what was done',
      'program.csv': 'your current program, one row per set: what was written and what was done',
      'past-blocks.csv': 'the blocks before it, the same way',
      'templates.csv': 'your saved templates',
      'check-ins.csv': 'weekly check-ins', 'check-in-answers.csv': 'answers to check-in questions', 'check-in-questions.csv': 'your check-in questions',
      'session-notes.csv': 'notes on sessions', 'coach-notes.csv': 'your private notes', 'messages.csv': 'messages',
      'bodyweight.csv': 'weigh-ins', 'goals.csv': 'goals', 'meets.csv': 'meets and results', 'rest-days.csv': 'rest days',
      'form-checks.csv': 'form-check requests and replies (the videos stay in the app)', 'health.csv': 'sleep and resting heart rate shared from Apple Health',
      'marketplace-listings.csv': 'your marketplace listings', 'sales.csv': 'marketplace sales'
    };
    files.forEach(function (f) { if (what[f.name]) lines.push('  ' + f.name + ' - ' + what[f.name] + (f.count != null ? ' (' + f.count + ')' : '')); });
    lines.push('');
    lines.push('Your profile (name, email, country, bio, handles) is under "account" in everything.json.');
    lines.push('Not in this export: photos and videos (your avatar, form-check videos), emoji reactions on messages, club posts, and reviews you wrote of marketplace programs. Ask us at powalifta1320@gmail.com and we will send those too.');
    if (data.notIncluded && data.notIncluded.length) { lines.push(''); lines.push('Not included this time (the server didn\'t answer): ' + data.notIncluded.join(', ') + '. Try the export again later.'); }
    lines.push('');
    lines.push('training-log.csv imports back into POWALIFTA as it is. Importing it twice adds nothing.');
    lines.push('How POWALIFTA handles your data: https://www.powalifta.com/data.html');
    return lines.join('\r\n') + '\r\n';
  }

  // ---------------------------------------------------------------- zip (store only)
  var CRC_T = null;
  function crc32(bytes) {
    if (!CRC_T) { CRC_T = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_T[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var bin = unescape(encodeURIComponent(s)), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // files: [{ name, text | bytes }] → Uint8Array of a .zip (no compression: CSV is small
  // next to the gain of not shipping a deflate library). UTF-8 names, DOS timestamps.
  function zip(files, when) {
    var d = when || new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var parts = [], central = [], offset = 0;
    var le = function (arr, v, n) { for (var i = 0; i < n; i++) arr.push((v >>> (8 * i)) & 0xFF); };
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.bytes || utf8(f.text || ''), crc = crc32(data);
      var h = [];
      le(h, 0x04034b50, 4); le(h, 20, 2); le(h, 0x0800, 2); le(h, 0, 2); le(h, time, 2); le(h, date, 2);
      le(h, crc, 4); le(h, data.length, 4); le(h, data.length, 4); le(h, name.length, 2); le(h, 0, 2);
      parts.push(new Uint8Array(h), name, data);
      var c = [];
      le(c, 0x02014b50, 4); le(c, 20, 2); le(c, 20, 2); le(c, 0x0800, 2); le(c, 0, 2); le(c, time, 2); le(c, date, 2);
      le(c, crc, 4); le(c, data.length, 4); le(c, data.length, 4); le(c, name.length, 2); le(c, 0, 2); le(c, 0, 2);
      le(c, 0, 2); le(c, 0, 2); le(c, 0, 4); le(c, offset, 4);
      central.push(new Uint8Array(c), name);
      offset += h.length + name.length + data.length;
    });
    var cdSize = central.reduce(function (a, p) { return a + p.length; }, 0);
    var e = [];
    le(e, 0x06054b50, 4); le(e, 0, 2); le(e, 0, 2); le(e, files.length, 2); le(e, files.length, 2); le(e, cdSize, 4); le(e, offset, 4); le(e, 0, 2);
    var all = parts.concat(central, [new Uint8Array(e)]);
    var out = new Uint8Array(all.reduce(function (a, p) { return a + p.length; }, 0)), at = 0;
    all.forEach(function (p) { out.set(p, at); at += p.length; });
    return out;
  }

  // =====================================================================
  // UI (browser only below)
  // =====================================================================
  var CSS = [
    '.sk-sheet .sk-for{display:flex;align-items:center;gap:10px;margin:2px 0 12px}',
    '.sk-sheet .sk-for b{font-weight:650;color:var(--text)}',
    '.sk-sheet .sk-for span{color:var(--text-3);font-size:var(--fs-meta,13px)}',
    '.sk-sheet .sk-src{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}',
    '.sk-sheet .sk-src .sk-hint{font-size:var(--fs-meta,13px);color:var(--text-3)}',
    '.sk-sheet .imp-text{min-height:120px;font-size:14px;white-space:pre;overflow:auto}',
    '.sk-sheet .imp-text.is-drop{box-shadow:inset 0 0 0 2px var(--acc)}',
    '.sk-opts{display:grid;gap:8px;margin-top:12px}',
    '.sk-opt{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:var(--fs-sm,14px);color:var(--text-2)}',
    '.sk-opt > span{flex:1;min-width:0}',
    '.sk-sheet .sk-opt select{flex:0 0 170px;width:170px;min-height:0}',
    '.sk-opt .ui-seg{flex:0 0 auto;min-width:170px}',
    '.sk-opt .ui-seg button{min-height:32px;font-size:13px;padding:0 10px}',
    '.sk-opt select{font:inherit;font-size:13px;padding:6px 10px;border-radius:var(--r-ctl);background:var(--fill-2,rgba(255,255,255,.06));color:var(--text);border:1px solid var(--line)}',
    '.sk-sum{margin-top:14px}',
    '.sk-sheet label,.sk-sheet label > span{text-transform:none;letter-spacing:normal;font-weight:500}',
    '.sk-sheet .imp-acts[hidden]{display:none}',
    '.sk-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}',
    '.sk-big{font-size:20px;font-weight:700;color:var(--text);font-variant-numeric:tabular-nums;letter-spacing:-.01em}',
    '.sk-range{font-size:var(--fs-sm,14px);color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.sk-meta{margin-top:4px;font-size:var(--fs-meta,13px);color:var(--text-3)}',
    '.sk-sum .ui-list{margin-top:12px}',
    '.sk-pr{font-size:12px;font-weight:650;color:var(--pr,#f2c25b);white-space:nowrap}',
    '.sk-note{margin-top:10px;font-size:var(--fs-meta,13px);color:var(--text-2);line-height:1.5}',
    '.sk-skip-row{display:flex;gap:10px;justify-content:space-between}',
    '.sk-skip-row b{font-weight:600;color:var(--text-2)}',
    '.sk-skip-eg{display:block;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
    '.sk-skip .imp-skip-list{white-space:normal;font-family:inherit;font-size:12.5px;display:grid;gap:8px}',
    '.sk-dates{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}',
    '.sk-dates label{display:flex;flex-direction:column;gap:4px;font-size:var(--fs-meta,13px);color:var(--text-3)}',
    '.sk-dates input{font:inherit;font-size:14px;padding:8px 10px;border-radius:var(--r-ctl);background:var(--fill-2,rgba(255,255,255,.06));color:var(--text);border:1px solid var(--line);min-height:0}',
    '.sk-quiet{display:block;margin:10px auto 0;background:none;border:0;color:var(--text-3);font:inherit;font-size:var(--fs-meta,13px);text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
    '.sk-quiet:hover{color:var(--text-2)}',
    '.sk-pick .ui-list{margin-top:4px;max-height:min(52vh,460px);overflow:auto}',
    '.sk-data-acts{display:grid;gap:10px;margin:4px 0 6px}',
    '.sk-data-acts .sk-data-sub{font-size:var(--fs-meta,13px);color:var(--text-3);line-height:1.5;text-align:center}',
    '.sk-data-links{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;margin:8px 0 4px}',
    '.sk-data-links a,.sk-data-links button{background:none;border:0;padding:0;color:var(--text-2);font:inherit;font-size:var(--fs-meta,13px);text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
    '.sk-busy{opacity:.7;pointer-events:none}',
    '@media (prefers-reduced-motion:no-preference){.sk-sum{animation:sk-in .2s ease-out}@keyframes sk-in{from{opacity:.4;transform:translateY(3px)}to{opacity:1;transform:none}}}'
  ].join('\n');
  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('sk-style')) return;
    var st = document.createElement('style'); st.id = 'sk-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function me() { return (typeof getCurrentUser === 'function' && getCurrentUser()) || window._user || null; }
  function isDemo() { return !!window._demoMode; }
  function nf(n) { try { return Number(n).toLocaleString(); } catch (e) { return String(n); } }
  function plural(n, one, many) { return nf(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function wtxt(kg) {
    var u = typeof unitLabel === 'function' ? unitLabel() : 'kg';
    var v = typeof kgToDisplay === 'function' ? kgToDisplay(kg) : kg;
    return (Math.round(v * 10) / 10) + ' ' + (u === 'lbs' ? 'lb' : u);
  }
  function dshort(iso) { try { return typeof fmtDate === 'function' ? fmtDate(iso) : iso; } catch (e) { return iso; } }
  function rosterAthletes() {
    var u = me();
    return ((Store.get().athletes) || []).filter(function (a) { return u && a.coachId === u.id; })
      .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
  }
  function athleteById(id) { return ((Store.get().athletes) || []).find(function (a) { return a.id === id; }) || null; }
  // After an import: the roster, the desk and an open athlete page read the new sets.
  function repaint() {
    ['dkRepaint', 'renderRoster'].forEach(function (fn) { try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {} });
    try {
      var open = /#athlete=([\w-]+)/.exec(location.hash || '');
      var pg = document.querySelector('[data-pane="athlete"]:not(.hidden)');
      if (pg && open && typeof renderAthletePage === 'function') renderAthletePage(open[1]);
    } catch (e) {}
  }

  // ---------- Import history (coach) ----------
  // athleteId: whose history. None: pick an athlete first.
  function openHistoryImport(athleteId) {
    ensureCss();
    var u = me();
    if (!u) return;
    if (!athleteId) return pickAthlete();
    var a = athleteById(athleteId);
    if (!a) { toast('That athlete isn\'t on your roster'); return; }
    var first = String(a.name || 'athlete').split(' ')[0];
    uiSheet('Import training history', function (sheet, close) {
      var forRow = el('div', { class: 'sk-for' });
      var av = el('span', { class: 'ui-av av-h' + (typeof avatarHue === 'function' ? avatarHue(a.name || '?') : 0), 'data-name': a.name || '?' }, typeof initials === 'function' ? initials(a.name || '?') : '');
      forRow.appendChild(av);
      var who = el('div', {});
      who.appendChild(el('b', {}, a.name || 'Athlete'));
      var countEl = el('span', {}, '');
      who.appendChild(el('br'));
      who.appendChild(countEl);
      forRow.appendChild(who);
      sheet.appendChild(forRow);
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'One row per set: date, exercise, weight, reps, and RPE if you have it. Exports from Strong, Hevy and FitNotes work as they are, and so does a past block written like a program.'));
      var src = el('div', { class: 'sk-src' });
      var fileIn = el('input', { type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain', hidden: 'hidden', 'aria-label': 'Choose a CSV file' });
      var fileBtn = el('button', { type: 'button', class: 'btn ui-btn-soft' }, 'Choose a CSV file');
      fileBtn.addEventListener('click', function () { fileIn.click(); });
      src.appendChild(fileBtn); src.appendChild(fileIn);
      src.appendChild(el('span', { class: 'sk-hint' }, 'or paste below'));
      sheet.appendChild(src);
      var ta = el('textarea', { class: 'imp-text', rows: '7', spellcheck: 'false', 'aria-label': 'History to import', wrap: 'off',
        placeholder: 'Date\tExercise\tWeight\tReps\tRPE\n2026-03-02\tSquat\t180\t5\t8\n2026-03-02\tSquat\t180\t5\t8.5\n\nor a journal:\n2 Mar 2026\nSquat 180x5 @8, 185x3 @9' });
      sheet.appendChild(ta);
      var opts = el('div', { class: 'sk-opts' });
      sheet.appendChild(opts);
      var sum = el('div', { class: 'sk-sum', 'aria-live': 'polite' });
      sheet.appendChild(sum);
      var acts = el('div', { class: 'imp-acts', hidden: 'hidden' });
      var go = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button', disabled: 'disabled' }, 'Import');
      acts.appendChild(go);
      sheet.appendChild(acts);

      var state = { unit: (typeof getUnit === 'function' && getUnit() === 'lbs') ? 'lb' : 'kg', dateOrder: null, noRpe: 8, plan: null, busy: false, blockName: '', blockStart: '', blockEnd: '' };
      var existing = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === athleteId; });
      // Past blocks already kept (with their import keys: the Store's block list doesn't carry them).
      var blockKeys = [];
      if (!isDemo() && window.DB && DB.skBlockKeys) DB.skBlockKeys(athleteId).then(function (rows) { blockKeys = rows || []; if (state.plan && state.plan.kind === 'block') paint(); }).catch(function () {});
      var paintCount = function () { countEl.textContent = existing.length ? plural(existing.length, 'set') + ' in POWALIFTA so far' : 'Nothing logged yet'; };
      paintCount();
      // Live: the Store can hold a capped slice of a big roster's logs. Read this athlete's
      // whole log so duplicates and PRs are judged against everything.
      if (!isDemo() && window.DB && DB.skListAll) {
        countEl.textContent = 'Reading their log…';
        DB.skListAll('workout_logs', 'athlete_id', [athleteId], 'date').then(function (r) {
          if (r && r.rows) {
            existing = r.rows.map(function (x) { var l = typeof mapDbLog === 'function' ? mapDbLog(x) : x; l.importKey = x.import_key || null; l.source = x.source || null; return l; });
          }
          paintCount(); paint();
        }).catch(function () { paintCount(); });
      }

      var seg = function (label, choices, cur, onPick) {
        var row = el('div', { class: 'sk-opt' });
        row.appendChild(el('span', {}, label));
        var s = el('div', { class: 'ui-seg', role: 'radiogroup', 'aria-label': label });
        choices.forEach(function (c) {
          var b = el('button', { type: 'button', role: 'radio', 'aria-checked': c[0] === cur ? 'true' : 'false', class: c[0] === cur ? 'on' : '' }, c[1]);
          b.addEventListener('click', function () { onPick(c[0]); paint(); });
          s.appendChild(b);
        });
        row.appendChild(s);
        return row;
      };
      var timer = null;
      var paint = function () {
        var text = ta.value;
        var plan = state.plan = planHistoryImport(text, { athleteId: athleteId, athleteName: a.name, unit: state.unit, dateOrder: state.dateOrder,
          noRpe: state.noRpe, existing: existing, blockName: state.blockName || ((a.name ? first + '\'s ' : '') + 'imported block'), blockStart: state.blockStart || null, blockEnd: state.blockEnd || null });
        opts.innerHTML = ''; sum.innerHTML = '';
        go.disabled = true; go.textContent = 'Import'; acts.hidden = true;
        if (!text.trim()) return;
        if (plan.kind === 'empty' && !plan.rows) {
          sum.appendChild(el('p', { class: 'imp-none' }, 'Nothing read yet. Each set needs a date, an exercise, a weight and reps, like "2026-03-02, Squat, 180, 5, 8". A header row helps.'));
          return;
        }
        // Options, only where the file leaves a question open.
        if (plan.kind === 'logs' || plan.kind === 'empty') {
          if (!plan.unitFromFile) opts.appendChild(seg('Weights are in', [['kg', 'kg'], ['lb', 'lb']], state.unit, function (v) { state.unit = v; }));
          if (plan.dateAmbiguous) opts.appendChild(seg('Dates are written', [['dmy', 'Day first'], ['mdy', 'Month first']], plan.dateOrder, function (v) { state.dateOrder = v; }));
          if (plan.noRpeCount) {
            var row = el('div', { class: 'sk-opt' });
            row.appendChild(el('span', {}, plural(plan.noRpeCount, 'set') + ' without an RPE count as'));
            var sel = el('select', { 'aria-label': 'RPE for sets without one' });
            [10, 9.5, 9, 8.5, 8, 7.5, 7].forEach(function (v) { var o = el('option', { value: String(v) }, 'RPE ' + v); if (v === state.noRpe) o.selected = true; sel.appendChild(o); });
            sel.addEventListener('change', function () { state.noRpe = Number(sel.value); paint(); });
            row.appendChild(sel);
            opts.appendChild(row);
          }
        }
        if (plan.kind === 'block') return paintBlock(plan);
        paintLogs(plan);
      };
      var paintLogs = function (plan) {
        var n = plan.logs.length;
        if (n) {
          var head = el('div', { class: 'sk-head' });
          head.appendChild(el('span', { class: 'sk-big' }, plural(n, 'set') + ' · ' + plural(plan.sessions, 'session')));
          head.appendChild(el('span', { class: 'sk-range' }, plan.range.from === plan.range.to ? dshort(plan.range.from) : dshort(plan.range.from) + ' – ' + dshort(plan.range.to)));
          sum.appendChild(head);
          var meta = [];
          if (plan.format && plan.format !== 'Spreadsheet') meta.push(plan.format === 'Training journal' ? 'Read as a training journal' : 'Read as a ' + plan.format + ' export');
          if (plan.carried) meta.push(plural(plan.carried, 'row') + ' took the date or exercise from the row above');
          if (meta.length) sum.appendChild(el('div', { class: 'sk-meta' }, meta.join(' · ')));
          var prRows = MAIN.filter(function (L) { return plan.prs && plan.prs[L]; }).map(function (L) {
            var p = plan.prs[L], b = p.best;
            var end = p.newBest ? 'New best' : p.prs ? plural(p.prs, 'PR') : '';
            return uiRow({ lead: el('span', { class: 'lift-dot lift-' + L, 'aria-hidden': 'true' }), title: LABEL[L],
              sub: 'Best ' + wtxt(b.kg) + ' e1RM · ' + wtxt(b.weight) + ' × ' + b.reps + ' @ ' + b.rpe + ' · ' + dshort(b.date) + (p.newBest && p.prs ? ' · ' + plural(p.prs, 'PR') : ''),
              endNode: end ? el('span', { class: 'sk-pr' }, end) : null });
          });
          if (prRows.length) sum.appendChild(uiList(prRows));
          var acc = plan.logs.filter(function (l) { return MAIN.indexOf(l.lift) < 0; }).length;
          if (acc) sum.appendChild(el('p', { class: 'sk-note' }, plural(acc, 'accessory set') + (acc === 1 ? ' comes in too, under its own name.' : ' come in too, under their own names.')));
        } else if (plan.dupes) {
          sum.appendChild(el('div', { class: 'sk-big' }, 'All of it is already here'));
        } else {
          sum.appendChild(el('p', { class: 'imp-none' }, 'No sets could be read. The rows skipped below say why.'));
        }
        if (plan.dupes) sum.appendChild(el('p', { class: 'sk-note' }, plural(plan.dupes, 'set') + (plan.dupes === 1 ? ' is' : ' are') + ' already in POWALIFTA and won\'t be added again.'));
        paintSkipped(plan);
        if (n) {
          go.disabled = false; acts.hidden = false;
          go.textContent = 'Import ' + plural(n, 'set') + (first ? ' for ' + first : '');
        } else if (plan.dupes && plan.allKeys && plan.allKeys.length) {
          // The same file again: offer to take the import back out (a wrong unit, say).
          var mineKeys = existing.filter(function (l) { return l.importKey && plan.allKeys.indexOf(l.importKey) >= 0; });
          if (mineKeys.length) {
            var rm = el('button', { type: 'button', class: 'sk-quiet' }, 'Remove the ' + plural(mineKeys.length, 'set') + ' this file imported');
            rm.addEventListener('click', function () {
              uiActionSheet('Remove ' + plural(mineKeys.length, 'imported set') + ' from ' + first + '\'s log?', [{ label: 'Remove them', danger: true, onClick: function () { removeImported(athleteId, mineKeys).then(function (ok) { if (ok) { existing = existing.filter(function (l) { return mineKeys.indexOf(l) < 0; }); paintCount(); paint(); } }); } }]);
            });
            sum.appendChild(rm);
          }
        }
      };
      var paintSkipped = function (plan) {
        if (!plan.skipped.length) return;
        var det = el('details', { class: 'imp-skip sk-skip' });
        det.appendChild(el('summary', {}, plural(plan.skipped.length, 'row') + ' skipped'));
        var list = el('div', { class: 'imp-skip-list' });
        Object.keys(plan.skippedBy).sort(function (x, y) { return plan.skippedBy[y] - plan.skippedBy[x]; }).forEach(function (reason) {
          var eg = plan.skipped.filter(function (s) { return s.reason === reason; });
          var item = el('div', {});
          var r = el('div', { class: 'sk-skip-row' });
          r.appendChild(el('b', {}, reason));
          r.appendChild(el('span', {}, eg.length + (eg[0].line ? ' · row' + (eg.length === 1 ? ' ' : 's ') + eg.slice(0, 4).map(function (s) { return s.line; }).join(', ') + (eg.length > 4 ? '…' : '') : '')));
          item.appendChild(r);
          item.appendChild(el('span', { class: 'sk-skip-eg' }, eg[0].text));
          list.appendChild(item);
        });
        det.appendChild(list);
        sum.appendChild(det);
      };
      var paintBlock = function (plan) {
        var b = plan.block, st = b.stats;
        var head = el('div', { class: 'sk-head' });
        head.appendChild(el('span', { class: 'sk-big' }, 'A past block · ' + plural(st.weeks, 'week')));
        head.appendChild(el('span', { class: 'sk-range' }, plural(st.days, 'day') + ' · ' + plural(st.sets, 'set')));
        sum.appendChild(head);
        sum.appendChild(el('div', { class: 'sk-meta' }, 'Read as a program. It\'s kept with ' + first + '\'s past blocks, every set marked done.'));
        var nm = el('input', { type: 'text', class: 'imp-name', value: b.name, 'aria-label': 'Block name', maxlength: '120' });
        nm.addEventListener('input', function () { state.blockName = nm.value.trim(); if (state.plan && state.plan.block) state.plan.block.name = (state.blockName || b.name).slice(0, 120); });
        sum.appendChild(el('label', { class: 'imp-name-row' }, el('span', {}, 'Name'), nm));
        var dates = el('div', { class: 'sk-dates' });
        var mk = function (label, val, key) {
          var inp = el('input', { type: 'date', value: val });
          inp.addEventListener('change', function () { state[key] = inp.value; paint(); });
          return el('label', {}, label, inp);
        };
        dates.appendChild(mk('Started', b.startedOn, 'blockStart'));
        dates.appendChild(mk('Ended', b.endedOn, 'blockEnd'));
        sum.appendChild(dates);
        var same = function (name, stats, key) { return key === b.importKey || (name === b.name && stats && stats.sets === st.sets); };
        var dupe = (Store.get().programBlocks || []).some(function (x) { return x.athleteId === athleteId && same(x.name, x.stats, x.importKey); })
          || blockKeys.some(function (x) { return same(x.name, x.stats, x.import_key); });
        paintSkipped(plan);
        if (dupe) { sum.appendChild(el('p', { class: 'sk-note' }, 'This block is already with ' + first + '\'s past blocks.')); return; }
        go.disabled = false; acts.hidden = false;
        go.textContent = 'Keep as a past block';
      };
      ta.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(paint, 160); });
      var readFile = function (f) {
        if (!f) return;
        if (/\.(xlsx|xls|numbers|ods)$/i.test(f.name || '')) { sum.innerHTML = ''; sum.appendChild(el('p', { class: 'imp-none' }, 'That\'s a spreadsheet file, not a CSV. Save it as CSV first: in Google Sheets, File → Download → CSV; in Excel or Numbers, export as CSV.')); return; }
        if (f.size > 8 * 1024 * 1024) { sum.innerHTML = ''; sum.appendChild(el('p', { class: 'imp-none' }, 'That file is over 8 MB. Split it by year and import each part.')); return; }
        var rd = new FileReader();
        rd.onload = function () { ta.value = String(rd.result || ''); state.dateOrder = null; paint(); };
        rd.readAsText(f);
      };
      fileIn.addEventListener('change', function () { readFile(fileIn.files && fileIn.files[0]); fileIn.value = ''; });
      ta.addEventListener('dragover', function (e) { e.preventDefault(); ta.classList.add('is-drop'); });
      ta.addEventListener('dragleave', function () { ta.classList.remove('is-drop'); });
      ta.addEventListener('drop', function (e) { ta.classList.remove('is-drop'); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); readFile(f); } });
      go.addEventListener('click', function () {
        var plan = state.plan;
        if (!plan || state.busy) return;
        state.busy = true; go.disabled = true;
        var done = function () { state.busy = false; };
        if (plan.kind === 'block') commitBlock(athleteId, plan.block, go).then(function (ok) { done(); if (ok) close(); });
        else commitLogs(athleteId, plan.logs, go, first).then(function (ok) { done(); if (ok) close(); else { go.disabled = false; go.textContent = 'Try again'; } });
      });
      setTimeout(function () { try { if (!('ontouchstart' in window)) ta.focus(); } catch (e) {} }, 350);
    }, { cls: 'imp-sheet sk-sheet' });
  }
  function pickAthlete() {
    var list = rosterAthletes();
    if (!list.length) { toast('Invite an athlete first. Their history comes in once they\'re on your roster.'); return; }
    if (list.length === 1) return openHistoryImport(list[0].id);
    uiSheet('Whose history?', function (sheet, close) {
      sheet.classList.add('sk-pick');
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Pick the athlete the sets belong to.'));
      var logs = Store.get().workoutLogs || [];
      sheet.appendChild(uiList(list.map(function (a) {
        var n = logs.filter(function (l) { return l.athleteId === a.id; }).length;
        return uiRow({ av: a.name || '?', title: a.name || 'Athlete', sub: n ? plural(n, 'set') + ' logged' : 'Nothing logged yet', chevron: true,
          onClick: function () { close(); setTimeout(function () { openHistoryImport(a.id); }, 220); } });
      })));
    }, { cls: 'imp-sheet sk-sheet' });
  }
  // Writes the sets. Demo: into the Store only. Live: chunked upserts that skip a key
  // the server already has; the Store gets what the server says it inserted.
  function commitLogs(athleteId, logs, btn, first) {
    var u = me();
    var rows = logs.map(function (l) {
      var o = {}; Object.keys(l).forEach(function (k) { if (k.charAt(0) !== '_') o[k] = l[k]; });
      o.id = typeof uid === 'function' ? uid('log') : String(Math.random());
      o.athleteId = athleteId; o.importedBy = u ? u.id : null;
      return o;
    });
    var finish = function (added) {
      if (added.length) Store.update(function (s) { s.workoutLogs = (s.workoutLogs || []).concat(added); });
      repaint();
      var msg = 'Imported ' + plural(added.length, 'set') + (isDemo() ? '. Demo: nothing is saved.' : '');
      if (!added.length) { toast('Nothing new: those sets were already there'); return true; }
      if (isDemo()) { toast(msg, 3600); return true; }
      toastAction(msg, 'Undo', function () { removeImported(athleteId, added); }, 8000);
      return true;
    };
    if (isDemo() || !(window.DB && DB.skImportLogs)) return Promise.resolve(finish(rows));
    var total = rows.length;
    btn.textContent = 'Importing… 0 of ' + nf(total);
    return DB.skImportLogs(rows, function (doneN) { btn.textContent = 'Importing… ' + nf(doneN) + ' of ' + nf(total); }).then(function (r) {
      var ids = {}; (r.insertedIds || []).forEach(function (id) { ids[id] = 1; });
      var added = rows.filter(function (x) { return ids[x.id]; });
      if (!r.ok) {
        if (added.length) finish(added);
        toast(r.notReady ? 'Importing history switches on with the next server update. Nothing was lost: try again after it.'
          : (added.length ? 'Imported ' + plural(added.length, 'set') + ', then the connection dropped. Import the same file again: it picks up where it stopped.' : 'Couldn\'t import: check the connection and try again.'), 6000);
        return !!added.length;
      }
      return finish(added);
    });
  }
  function removeImported(athleteId, logs) {
    var ids = logs.map(function (l) { return l.id; });
    var drop = function () { Store.update(function (s) { s.workoutLogs = (s.workoutLogs || []).filter(function (l) { return ids.indexOf(l.id) < 0; }); }); repaint(); };
    if (isDemo() || !(window.DB && DB.skRemoveImported)) { drop(); toast('Removed ' + plural(ids.length, 'imported set')); return Promise.resolve(true); }
    return DB.skRemoveImported(athleteId, ids).then(function (r) {
      if (r.ok) { drop(); toast('Removed ' + plural(ids.length, 'imported set')); return true; }
      toast('Couldn\'t remove them: check the connection and try again.', 4000); return false;
    });
  }
  function commitBlock(athleteId, b, btn) {
    var u = me();
    var block = { id: typeof uid === 'function' ? uid('blk') : String(Math.random()), athleteId: athleteId, coachId: u ? u.id : null, name: b.name, weeks: b.weeks, maxes: null,
      stats: typeof blockStats === 'function' ? blockStats(b.weeks) : null, startedOn: b.startedOn, endedOn: b.endedOn, createdAt: new Date().toISOString(), importKey: b.importKey };
    var keep = function (saved) {
      Store.update(function (s) { s.programBlocks = (s.programBlocks || []).concat([Object.assign(block, saved || {}, { weeks: b.weeks, importKey: b.importKey })]); });
      repaint();
      toast('Kept “' + b.name + '” with the past blocks' + (isDemo() ? '. Demo: nothing is saved.' : ''), 3600);
      return true;
    };
    if (isDemo() || !(window.DB && DB.skAddImportedBlock)) return Promise.resolve(keep());
    btn.textContent = 'Saving…';
    return DB.skAddImportedBlock(block).then(function (r) {
      if (r.ok) return keep(r.block);
      if (r.duplicate) { toast('This block is already with their past blocks'); return true; }
      toast(r.notReady ? 'Past blocks are kept once a quick database update runs.' : 'Couldn\'t save the block: check the connection and try again.', 5000);
      btn.disabled = false; btn.textContent = 'Keep as a past block';
      return false;
    });
  }

  // ---------- Export everything ----------
  // Collects what this account owns (live: straight from the database, paged, so
  // nothing is cut at 1,000 rows; demo/offline: the Store) → a zip download.
  function collect() {
    var u = me(), s = Store.get();
    var coach = u.userType === 'coach';
    var ids = coach ? rosterAthletes().map(function (a) { return a.id; }) : [u.id];
    var mineOnly = function (list) { return (list || []).filter(function (x) { return ids.indexOf(x.athleteId != null ? x.athleteId : x.athlete_id) >= 0; }); };
    // A coach's export holds what they wrote: a block or program a previous coach kept
    // with the athlete stays out (null = written by the athlete themselves).
    var byMe = function (x) { var c = x.coachId !== undefined ? x.coachId : x.coach_id; return !coach || c == null || c === u.id; };
    var coachOwn = function (list) { return (list || []).filter(function (x) { var c = x.coachId !== undefined ? x.coachId : x.coach_id; return c === u.id; }); };
    var base = {
      role: coach ? 'coach' : 'athlete',
      account: { id: u.id, name: u.name, email: u.email, userType: u.userType, countryCode: u.countryCode || null, coachId: u.coachId || null,
        bio: u.bio || null, instagram: u.instagram || null, tiktok: u.tiktok || null },
      athletes: coach ? rosterAthletes().map(function (a) { return { id: a.id, name: a.name, email: a.email, countryCode: a.countryCode || null, createdAt: a.createdAt || null }; }) : [],
      logs: mineOnly(s.workoutLogs), programs: coach ? mineOnly(s.programs).filter(byMe) : mineOnly(s.programs),
      blocks: mineOnly(s.programBlocks).filter(byMe), templates: coach ? coachOwn(s.programTemplates) : [],
      checkins: mineOnly(s.checkins), checkinAnswers: mineOnly(s.checkinAnswers), checkinQuestions: coach ? coachOwn(s.checkinQuestions) : [],
      sessionNotes: mineOnly(s.sessionNotes), coachNotes: coach ? coachOwn(s.coachNotes) : [], messages: mineOnly(s.messages),
      bodyweight: mineOnly(s.bodyweight), goals: mineOnly(s.goals), meets: mineOnly(s.meets), restDays: mineOnly(s.restDays),
      formChecks: mineOnly(s.formChecks), health: mineOnly(s.healthDaily), listings: coach ? (s.marketplacePrograms || []).filter(function (p) { return p.coachId === u.id; }) : [],
      sales: coach ? (s.mySales || []) : [], notIncluded: []
    };
    if (isDemo() || !(window.DB && DB.skListAll) || !ids.length) return Promise.resolve(base);
    var T = [
      ['logs', 'workout_logs', 'athlete_id', ids, 'date'], ['programs', 'programs', 'athlete_id', ids, null], ['blocks', 'program_blocks', 'athlete_id', ids, 'ended_on'],
      ['checkins', 'checkins', 'athlete_id', ids, null], ['checkinAnswers', 'checkin_answers', 'athlete_id', ids, null], ['sessionNotes', 'session_notes', 'athlete_id', ids, null],
      ['messages', 'messages', 'athlete_id', ids, 'created_at'], ['bodyweight', 'bodyweight', 'athlete_id', ids, 'date'], ['goals', 'goals', 'athlete_id', ids, null],
      ['meets', 'meets', 'athlete_id', ids, null], ['restDays', 'rest_days', 'athlete_id', ids, null], ['formChecks', 'form_checks', 'athlete_id', ids, null],
      ['health', 'health_daily', 'athlete_id', ids, null]
    ];
    if (coach) T.push(['templates', 'program_templates', 'coach_id', [u.id], null], ['checkinQuestions', 'checkin_questions', 'coach_id', [u.id], null],
      ['coachNotes', 'coach_notes', 'coach_id', [u.id], null], ['listings', 'marketplace_programs', 'coach_id', [u.id], null], ['sales', 'program_sales', 'coach_id', [u.id], 'created_at']);
    var out = Object.assign({}, base);
    var i = 0;
    var next = function () {
      if (i >= T.length) return Promise.resolve(out);
      var t = T[i++];
      return DB.skListAll(t[1], t[2], t[3], t[4]).then(function (r) {
        if (r && r.rows) {
          // A program row from the server keeps weeks as JSON: that's what the CSV reads.
          var rows = t[0] === 'templates' ? r.rows.map(function (x) { return Object.assign({}, x, { weeks: x.payload && x.payload.weeks }); }) : r.rows;
          // RLS lets a coach read blocks a previous coach kept: those aren't theirs to take.
          if (t[0] === 'blocks' || t[0] === 'programs') rows = rows.filter(byMe);
          out[t[0]] = rows;
        } else if (r && r.missing) { /* the table isn't there (a migration not run): nothing to export */ }
        else out.notIncluded.push(t[1].replace(/_/g, ' '));
      }, function () { out.notIncluded.push(t[1].replace(/_/g, ' ')); }).then(next);
    };
    return next();
  }
  function exportEverything(btn) {
    ensureCss();
    var u = me();
    if (!u) return Promise.resolve(false);
    var label = btn ? btn.textContent : '';
    if (btn) { btn.classList.add('sk-busy'); btn.textContent = 'Packing your data…'; }
    else toast('Packing your data…', 1800);
    var reset = function () { if (btn) { btn.classList.remove('sk-busy'); btn.textContent = label; } };
    return collect().then(function (data) {
      var files = buildExportFiles(data);
      var bytes = zip(files);
      var safe = String(u.name || 'powalifta').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'powalifta';
      var stamp = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
      var name = 'powalifta-' + safe + '-' + stamp + '.zip';
      var blob = new Blob([bytes], { type: 'application/zip' });
      window._skLastExport = { name: name, size: bytes.length, files: files.map(function (f) { return f.name; }) };
      var inApp = false; try { inApp = typeof _inAppShell === 'function' && _inAppShell(); } catch (e) {}
      var p = inApp && typeof _shareFileInApp === 'function' ? _shareFileInApp(blob, name) : (function () { _anchorDownload(blob, name); return Promise.resolve('downloaded'); })();
      return p.then(function (done) {
        reset();
        var sets = (data.logs || []).length;
        if (done) toast('Exported ' + plural(files.length - 2, 'file') + ' · ' + plural(sets, 'set') + (data.notIncluded.length ? '. Some parts didn\'t load: see README.txt' : ''), 4200);
        return !!done;
      });
    }).catch(function (e) { console.error('export', e); reset(); toast('Couldn\'t build the export. Try again.'); return false; });
  }

  // ---------- hooks ----------
  // app.js openDataSheet (both You hubs, phone and laptop): one export that has
  // everything, the import for coaches, and the page that explains it all.
  function dataSheet(sheet, close, row) {
    ensureCss();
    var u = me();
    if (!u) return;
    var sub = sheet.querySelector('.ui-sheet-sub');
    if (sub) sub.textContent = 'Everything you\'ve put into POWALIFTA, as spreadsheets you can open anywhere. Take it whenever you like.';
    var box = el('div', { class: 'sk-data-acts' });
    var all = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Download everything');
    all.addEventListener('click', function () { exportEverything(all); });
    box.appendChild(all);
    box.appendChild(el('p', { class: 'sk-data-sub' }, u.userType === 'coach'
      ? 'A zip of CSV files: every athlete\'s programs, past blocks, sets, check-ins, notes and messages.'
      : 'A zip of CSV files: every set, program, past block, weigh-in, check-in and message.'));
    if (row && row.parentNode) { row.parentNode.insertBefore(box, row); row.hidden = true; row.style.display = "none"; }
    else sheet.appendChild(box);
    var links = el('div', { class: 'sk-data-links' });
    var logOnly = el('button', { type: 'button' }, 'Just the training log');
    logOnly.addEventListener('click', function () { if (typeof exportMyData === 'function') exportMyData('csv'); });
    links.appendChild(logOnly);
    var page = el('a', { href: 'data.html', target: '_blank', rel: 'noopener' }, 'How we handle your data');
    // In the iPhone app a policy page opens in Safari (openDoc); on the web, a new tab.
    page.addEventListener('click', function (e) { if (typeof openDoc === 'function' && openDoc(page) === false) e.preventDefault(); });
    links.appendChild(page);
    box.parentNode.insertBefore(links, box.nextSibling);
    if (u.userType === 'coach') {
      var imp = uiList([uiRow({ title: 'Import an athlete\'s history', sub: 'Past sets or a past block from a spreadsheet', chevron: true,
        onClick: function () { close(); setTimeout(function () { openHistoryImport(null); }, 220); } })]);
      imp.style.marginTop = '14px';
      links.parentNode.insertBefore(imp, links.nextSibling);
    }
  }
  // desk.js dkCommands: two palette commands.
  function deskCommands() {
    return [
      { group: 'Actions', label: 'Import history…', keys: 'import csv strong hevy fitnotes spreadsheet sheet past logs block upload', run: function () { openHistoryImport(null); } },
      { group: 'Actions', label: 'Export everything', keys: 'download zip backup data csv all', run: function () { exportEverything(); } }
    ];
  }

  return {
    // pure (tests.html)
    detectDelim: detectDelim, splitRows: splitRows, num: num, parseDate: parseDate, dateOrderOf: dateOrderOf,
    parseSetText: parseSetText, matchLift: matchLift, mapHeader: mapHeader, tupleOf: tupleOf, importKey: importKey,
    planHistoryImport: planHistoryImport, planPRs: planPRs, buildExportFiles: buildExportFiles, logsCsv: logsCsv,
    crc32: crc32, zip: zip, utf8: utf8,
    // UI
    openHistoryImport: openHistoryImport, exportEverything: exportEverything, dataSheet: dataSheet, deskCommands: deskCommands
  };
})();
if (typeof window !== 'undefined') {
  window.SwitchKit = SwitchKit;
  window.openHistoryImport = SwitchKit.openHistoryImport;
  window.exportEverything = SwitchKit.exportEverything;
}
