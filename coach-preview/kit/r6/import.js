/* import.js: window.IMPORT, a coach's own spreadsheet read into a programme (22 Nov; the owner: "it should automatically
   identify the program structure … all coaches use different formats … let coaches correct column mappings before
   they save, and don't promise compatibility with every spreadsheet").

   Coaches lay a programme out in a handful of ways, and this reads them without being told which:
     - one line a row under a header (Exercise, Sets, Reps, Load, RPE …), with or without Week and Day columns
     - day blocks: a row that only names the day ("Day 1", "Monday", "Upper A"), its lifts under it
     - weeks across: "Week 1 | Week 2 | …" each holding a whole set ("3x5 @8"), or each over its own Sets / Reps / Load
     - weeks stacked: a "Week 2" row, then that week's days
     - no header at all: the columns are told apart by what they hold
   It works out the header row, what every column holds, which rows are week titles, day titles, lines or nothing, and
   whether loads are kilos or pounds. Every one of those guesses can be overridden (the check screen does), and a sheet
   it cannot read says so in plain words. It builds nothing itself: the lines go to the model's own reader
   (BLOCK.fromTable) as its plainest table, so an imported programme is the same thing as one written by hand.

     IMPORT.table(text)                  → rows (tab, comma or semicolon separated; quotes read)
     IMPORT.analyse(rows, o)             → A = { rows, width, head, sub, layout: 'lines' | 'across', unit: 'kg' | 'lb',
                                                 cols: [{ i, head, role, week }], kinds: [{ kind, n?, label? }] }
          o: { head (row index, -1 for none), roles: { col: role | { role, week } }, kinds: { row: kind }, unit }
     IMPORT.build(rows, A, o)            → { ok, why?, block, read: { days, lines, weeks, cells }, weeks, days,
                                             lines: [{ day, name, line, cells: { week: text }, at: { week: { r, c } } }],
                                             bad: [{ r, c, text, why }], unknown: [exercise names not in the library] }
          o: { name, id, maxes, names: { 'comp sq': 'Squat' } (the coach's own names for exercises) }
     IMPORT.read(rows | text, o)         → build(rows, analyse(rows, o), o), with .analysis
     IMPORT.ROLES, IMPORT.KINDS          → [[id, words]] for the check screen's menus
   Needs block.js; no DOM. Loads after it. */
(function () {
  'use strict';
  var W = window, BL = W.BLOCK;
  if (!BL) return;
  var ROLES = [['exercise', 'Exercise'], ['sets', 'Sets'], ['reps', 'Reps'], ['setsreps', 'Sets \u00d7 reps'], ['cell', 'The whole set (3x5 @8)'], ['load', 'Load'], ['rpe', 'RPE'], ['rir', 'RIR (reps left)'], ['pct', '% of max'],
    ['tempo', 'Tempo'], ['note', 'Notes'], ['week', 'Week'], ['day', 'Day'], ['skip', 'Leave it out']];
  var KINDS = [['line', 'A lift'], ['day', 'A day\u2019s name'], ['week', 'A week\u2019s name'], ['skip', 'Leave it out']];
  var WEEK_RE = /^(?:week|wk|w)\s*[-#:.]?\s*(\d{1,2})(?!\d)/i;
  var DAY_RE = /^(?:(?:day|session|workout|training)\s*[-#:.]?\s*(?:\d{1,2}|[a-d])\b|(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|rsday|urday)?\b)/i;
  var JUNK_RE = /^(?:total|totals|sum|average|avg|volume|tonnage|notes?|warm[- ]?up|cool[- ]?down)\b/i;
  var HEADS = [
    ['exercise', /^(exercises?|movements?|lifts?|exercise name|name)$/],
    ['setsreps', /^(sets? ?[x\u00d7*\/&] ?reps?|sets and reps|s ?x ?r|sxr|prescription|scheme|sets\/reps)$/],
    ['sets', /^(sets?|# ?sets|no\.? of sets|set count)$/],
    ['reps', /^(reps?|repetitions?|rep range|target reps)$/],
    ['load', /^(load|weight|kgs?|lbs?|(?:load|weight) ?\(?(?:kgs?|lbs?)\)?|target (?:weight|load)|working weight)$/],
    ['rpe', /^(rpe|target rpe|effort)$/],
    ['rir', /^(rir|reps in reserve|reps left)$/],
    ['pct', /^(%|percent|percentage|% ?(?:of )?(?:1rm|rm|max|e1rm)|intensity|int\.?)$/],
    ['tempo', /^(tempo)$/],
    ['note', /^(notes?|comments?|cues?|coach(?:ing)? notes?|instructions?)$/],
    ['week', /^(week|wk)$/],
    ['day', /^(day|session|workout|training day)$/],
    ['rest', /^(rest|rest time|rest ?\(?(?:s|sec|secs|min|mins)\)?|rest period)$/]
  ];
  var low = function (s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); };
  var headRole = function (t) { var k = low(t).replace(/[:.]+$/, ''); if (!k || k.length > 28) return null; for (var i = 0; i < HEADS.length; i++) if (HEADS[i][1].test(k)) return HEADS[i][0]; return null; };
  var weekOf = function (t) { var m = WEEK_RE.exec(String(t || '').trim()); return m ? Number(m[1]) : null; };
  var isNum = function (t) { return /^-?\d+(?:[.,]\d+)?$/.test(String(t).trim()); };
  var num = function (t) { return Number(String(t).trim().replace(',', '.')); };
  var cap1 = function (s) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* text → rows. A pasted range is tabs; a file is commas or, from a European Excel, semicolons */
  function table(text) {
    var t = String(text == null ? '' : text).replace(/^\ufeff/, '');
    if (!/\t/.test(t)) { var first = t.split(/\r?\n/).slice(0, 8).join('\n'); if ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) t = t.replace(/;/g, '\t'); }
    return BL.readTable(t);
  }
  function norm(raw) {
    var rows = (raw || []).map(function (ln) { ln = Array.isArray(ln) ? ln : ln && ln.cells ? ln.cells : []; return ln.map(function (x) { return x == null ? '' : String(x).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }); });
    while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
    var width = rows.reduce(function (m, r) { for (var i = r.length; i > 0; i--) if (r[i - 1]) return Math.max(m, i); return m; }, 0);
    return rows.map(function (r) { r = r.slice(0, width); while (r.length < width) r.push(''); return r; });
  }

  /* ---------------- what a coach wrote, as the model's cell language reads it ---------------- */
  function tidy(text) {
    var t = String(text == null ? '' : text).replace(/\u00a0/g, ' ').trim();
    if (!t) return '';
    t = t.replace(/@\s*rpe\s*/ig, '@').replace(/\brpe\s*[:=]?\s*(\d)/ig, '@$1').replace(/(\d(?:\.\d)?)\s*rpe\b/ig, '@$1');
    t = t.replace(/@\s*(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*%)/g, '$1');                       /* "@ 72.5%" is a percent */
    t = t.replace(/(\d+)\s*sets?\s*(?:of|x|\u00d7)?\s*(\d+(?:\s*-\s*\d+)?\+?)(?:\s*reps?\b)?/ig, '$1x$2');
    t = t.replace(/(\d)\s*reps?\b/ig, '$1').replace(/x\s*amrap\b/ig, 'x1+').replace(/\bamrap\b/ig, '1+').replace(/\bmax reps?\b/ig, '1+');
    var eq = /^(\d{1,2})((?:\s*[,\/]\s*\1)+)$/.exec(t);                                           /* "8, 8, 8" is three eights */
    if (eq) t = (eq[2].split(/[,\/]/).length) + 'x' + eq[1];
    return t.replace(/\s+/g, ' ').trim();
  }
  function effortText(v) {
    var t = String(v || '').trim(); if (!t) return '';
    if (/%/.test(t)) return t.replace(/\s+/g, '');
    if (/rir/i.test(t)) { var m = /(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)/.exec(t); return m ? m[1].replace(/\s+/g, '') + 'RIR' : ''; }
    t = t.replace(/^(?:@|rpe)\s*/i, '').replace(/\s+/g, '');
    return /^\d+(?:[.,]\d+)?(?:-\d+(?:[.,]\d+)?)?$/.test(t) ? '@' + t.replace(/,/g, '.') : tidy(v);
  }
  function pctText(v) {
    var t = String(v || '').trim(); if (!t) return '';
    if (/%/.test(t)) return t.replace(/\s+/g, '');
    if (isNum(t)) { var n = num(t); return (n > 0 && n <= 1.5 ? Math.round(n * 1000) / 10 : n) + '%'; }
    return /^\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?$/.test(t) ? t.replace(/\s+/g, '') + '%' : t;
  }
  function loadText(v, unit) {
    var t = String(v || '').trim(); if (!t) return '';
    if (/%/.test(t)) return pctText(t);
    if (/^(?:bw|body ?weight)$/i.test(t)) return 'bw';
    if (/(kgs?|lbs?)\s*$/i.test(t)) return t.replace(/\s+/g, '').replace(/kgs$/i, 'kg').replace(/lbs$/i, 'lb');
    return /^\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?$/.test(t) ? t.replace(/\s+/g, '').replace(/,/g, '.') + (unit === 'lb' ? 'lb' : 'kg') : t;
  }
  /* one line's parts → one cell's text: "3x5 @8 100kg" */
  function compose(p, unit) {
    var base = p.cell ? tidy(p.cell) : p.setsreps ? tidy(p.setsreps) : '';
    if (!base && p.reps) base = (isNum(p.sets || '') ? String(Math.round(num(p.sets))) : '1') + 'x' + tidy(p.reps).replace(/\s+/g, '');
    var rir = p.rir ? (/(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)/.exec(String(p.rir)) || [])[1] : '';
    /* a percent and the kilos it comes to: the percent is the rule; the kilos follow from this lifter's max */
    var bits = [base, p.pct ? pctText(p.pct) : '', p.rpe ? effortText(p.rpe) : '', rir ? rir.replace(/\s+/g, '') + 'RIR' : '', p.load && !p.pct ? loadText(p.load, unit) : ''];
    if (p.tempo && /^\d(?:\s*[-.]?\s*\d){2,3}$/.test(p.tempo)) bits.push('tempo ' + p.tempo.replace(/\D/g, '').split('').join('-'));
    return bits.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  /* "1x3 @8, 3x5 75%" is a top set and its back-offs: each its own line. A comma that is not between sets stays */
  function groupsOf(text) {
    if (!/,/.test(text)) return [text];
    var res = BL.parse(text); if (!res.ok || !res.groups || res.groups.length < 2) return [text];
    var parts = text.split(/\s*,\s*/).filter(Boolean);
    return parts.length === res.groups.length ? parts : [text];
  }

  /* ---------------- the structure ---------------- */
  function analyse(raw, o) {
    o = o || {};
    var rows = norm(raw), n = rows.length, width = n ? rows[0].length : 0, c, i;
    var A = { rows: rows, width: width, head: -1, sub: -1, layout: 'lines', unit: 'kg', cols: [], kinds: [] };
    if (!n || !width) return A;
    /* the header: the row, among the first thirty, with the most column names in it, or two or more weeks */
    var best = -1, bestScore = 0;
    for (i = 0; i < Math.min(n, 30); i++) {
      var words = 0, wks = 0;
      rows[i].forEach(function (x) { if (!x) return; if (headRole(x)) words++; else if (weekOf(x) != null && x.length < 18) wks++; });
      var score = words + (wks >= 2 ? wks : 0);
      if ((words >= 2 || wks >= 2) && score > bestScore) { best = i; bestScore = score; }
    }
    /* week names on the row above the field names (Week 1 over Sets, Reps, Load): that row is the header, the names under it */
    if (best > 0 && rows[best - 1].filter(function (x) { return weekOf(x) != null && x.length < 18; }).length >= 2) best--;
    if (o.head != null && o.head >= -1 && o.head < n) best = o.head;
    A.head = best;
    /* a training log (a column for every set) is not a programme: it is refused, never guessed at */
    A.log = rows.slice(0, 30).some(function (r) { return r.filter(function (x) { return /^set\s*#?\d+\b/i.test(x); }).length >= 2; });
    for (c = 0; c < width; c++) A.cols.push({ i: c, head: best >= 0 ? rows[best][c] : '', role: null, week: null });
    var weekCols = best >= 0 ? A.cols.filter(function (x) { return weekOf(x.head) != null && x.head.length < 18; }) : [];
    if (weekCols.length >= 2) {
      A.layout = 'across';
      var nx = rows[best + 1] || [], under = nx.filter(function (x) { return headRole(x); }).length;
      if (under >= 2) {                        /* each week over its own Sets / Reps / Load: the names are on the row under */
        A.sub = best + 1;
        weekCols.forEach(function (wc, k) {
          var end = k + 1 < weekCols.length ? weekCols[k + 1].i : width, wn = weekOf(wc.head);   /* read before the name under it replaces the head */
          for (var cc = wc.i; cc < end; cc++) { var r = headRole(nx[cc]); A.cols[cc].week = wn; A.cols[cc].role = r && r !== 'rest' && r !== 'week' && r !== 'day' ? r : 'skip'; if (nx[cc]) A.cols[cc].head = nx[cc]; }
        });
        for (c = 0; c < weekCols[0].i; c++) { var r0 = headRole(rows[best][c]) || headRole(nx[c]); if (r0) { A.cols[c].role = r0 === 'rest' ? 'skip' : r0; if (!A.cols[c].head) A.cols[c].head = nx[c]; } }
      } else weekCols.forEach(function (wc) { wc.role = 'cell'; wc.week = weekOf(wc.head); });
    }
    var taken = {};
    A.cols.forEach(function (x) { if (x.role && x.week == null) taken[x.role] = 1; });
    if (best >= 0) A.cols.forEach(function (x) { if (x.role != null) return; var r = headRole(x.head); if (!r) return; if (r === 'rest') { x.role = 'skip'; return; } if (taken[r]) { x.role = 'skip'; return; } x.role = r; taken[r] = 1; });
    /* what is left is told apart by what it holds */
    var from = Math.max(best, A.sub) + 1, body = [];
    for (i = from; i < n; i++) if (rows[i].some(Boolean)) body.push(rows[i]);
    var stat = function (cc) {
      var v = body.map(function (r) { return r[cc]; }).filter(Boolean), k = v.length || 1, f = function (fn) { return v.filter(fn).length / k; };
      return { n: v.length,
        lib: f(function (x) { return !!BL.libFind(x); }), text: f(function (x) { return /[a-z]{3}/i.test(x) && !/^\d+\s*[x\u00d7*]/i.test(x); }),
        sxr: f(function (x) { return /^\d{1,2}\s*[x\u00d7*]\s*\d/i.test(x); }), pct: f(function (x) { return /%/.test(x) || (isNum(x) && num(x) > 0 && num(x) <= 1); }),
        small: f(function (x) { return /^\d{1,2}$/.test(x) && +x <= 12; }), reps: f(function (x) { return /^\d{1,2}(?:\s*-\s*\d{1,2})?\+?$/.test(x) || /^amrap$/i.test(x); }),
        rpe: f(function (x) { var y = x.replace(/^(?:@|rpe)\s*/i, ''); return isNum(y) && num(y) >= 5 && num(y) <= 10 && (num(y) * 2) % 1 === 0; }), big: f(function (x) { return (isNum(x) && num(x) >= 15) || /\d\s*(kgs?|lbs?)$/i.test(x); }) };
    };
    var st = A.cols.map(function (x) { return stat(x.i); });
    if (!taken.exercise) {
      var pick = -1, top = 0;
      A.cols.forEach(function (x) { if (x.role != null) return; var s = st[x.i]; if (s.n < 1 || s.text < 0.5) return; var sc = s.lib * 3 + s.text + Math.min(s.n, 20) / 40 - x.i * 0.01; if (sc > top) { top = sc; pick = x.i; } });
      if (pick >= 0) { A.cols[pick].role = 'exercise'; taken.exercise = 1; }
    }
    A.cols.forEach(function (x) {
      if (x.role != null) return; var s = st[x.i], r = 'skip';
      if (!s.n) r = 'skip';
      else if (s.sxr >= 0.5) r = taken.cell || taken.setsreps ? 'skip' : 'cell';
      else if (s.pct >= 0.6 && !taken.pct) r = 'pct';
      else if (s.text >= 0.6) r = taken.note ? 'skip' : 'note';
      else if (s.small >= 0.7 && !taken.sets && !taken.cell && !taken.setsreps) r = 'sets';
      else if (s.reps >= 0.7 && !taken.reps && !taken.cell && !taken.setsreps) r = 'reps';
      else if (s.rpe >= 0.6 && !taken.rpe) r = 'rpe';
      else if (s.big >= 0.6 && !taken.load) r = 'load';
      x.role = r; if (r !== 'skip') taken[r] = 1;
    });
    /* the coach's corrections win */
    Object.keys(o.roles || {}).forEach(function (k) { var x = A.cols[+k], v = o.roles[k]; if (!x) return; if (v && typeof v === 'object') { x.role = v.role || 'skip'; x.week = v.week == null ? null : Number(v.week); } else x.role = v || 'skip'; });
    var load = A.cols.filter(function (x) { return x.role === 'load'; });
    A.unit = o.unit === 'lb' || o.unit === 'kg' ? o.unit : (load.some(function (x) { return /lb/i.test(x.head); }) || body.some(function (r) { return load.some(function (x) { return /\d\s*lbs?$/i.test(r[x.i]); }); }) || (!load.length && body.some(function (r) { return r.some(function (x) { return /\d\s*lbs?\b/i.test(x); }); })) ? 'lb' : 'kg');

    /* the rows: a header again, a week's name, a day's name, a lift, or nothing */
    var exCol = -1; A.cols.forEach(function (x) { if (exCol < 0 && x.role === 'exercise') exCol = x.i; });
    var data = A.cols.filter(function (x) { return x.role && ['exercise', 'skip', 'week', 'day', 'note'].indexOf(x.role) < 0; });
    var headText = best >= 0 ? rows[best].join('\u0001').toLowerCase() : null;
    rows.forEach(function (r, ri) {
      var full = r.filter(Boolean), firstTxt = full[0] || '', k = { kind: 'skip' };
      if (!full.length) k = { kind: 'blank' };
      else if (ri === best || ri === A.sub || (headText && r.join('\u0001').toLowerCase() === headText)) k = { kind: 'head' };
      else if (weekOf(firstTxt) != null && full.length <= 2 && !(A.layout === 'across' && ri <= best)) k = { kind: 'week', n: weekOf(firstTxt) };
      else if (ri < from) k = { kind: 'skip' };
      else {
        var ex = exCol >= 0 ? r[exCol] : '', has = data.some(function (x) { return r[x.i]; });
        if (ex && JUNK_RE.test(ex) && !BL.libFind(ex)) k = { kind: 'skip' };
        else if (ex && has) k = { kind: 'line' };
        else if (!ex && has) k = { kind: 'line' };                                   /* more sets of the lift above */
        else if (ex && !has) k = BL.libFind(ex) && !DAY_RE.test(ex) ? { kind: 'skip' } : { kind: 'day', label: ex };
        else if (full.length <= 2 && (DAY_RE.test(firstTxt) || full.length === 1) && /[a-z]/i.test(firstTxt)) k = { kind: 'day', label: firstTxt };
      }
      A.kinds.push(k);
    });
    Object.keys(o.kinds || {}).forEach(function (kk) { var ri = +kk, v = o.kinds[kk], r = rows[ri]; if (!r) return; var txt = r.filter(Boolean)[0] || ''; A.kinds[ri] = v === 'week' ? { kind: 'week', n: weekOf(txt) || 1 } : v === 'day' ? { kind: 'day', label: txt } : { kind: v === 'line' ? 'line' : 'skip' }; });
    return A;
  }

  /* ---------------- the programme ---------------- */
  function build(raw, A, o) {
    o = o || {}; A = A || analyse(raw, o);
    var rows = A.rows, role = function (r) { return A.cols.filter(function (x) { return x.role === r && x.week == null; })[0] || null; };
    var exCol = role('exercise'), dayCol = role('day'), weekCol = role('week'), noteCol = role('note');
    if (!rows.length) return { ok: false, why: 'The sheet is empty.' };
    if (A.log) return { ok: false, why: 'This reads as a training log, with a column for every set, not a programme. Nothing was imported.', unknown: [] };
    if (!exCol) return { ok: false, why: 'Which column holds the exercises? Mark it above.', unknown: [] };
    var across = A.cols.filter(function (x) { return x.week != null && x.role !== 'skip'; }), weeksAcross = [];
    across.forEach(function (x) { if (weeksAcross.indexOf(x.week) < 0) weeksAcross.push(x.week); });
    weeksAcross.sort(function (a, z) { return a - z; });
    var names = {}; Object.keys(o.names || {}).forEach(function (k) { names[low(k)] = o.names[k]; });
    var nameOf = function (t) { var k = low(t); if (names[k]) return names[k]; var lib = BL.libFind(t); return lib ? lib.name : cap1(t); };
    var titled = A.kinds.some(function (k) { return k.kind === 'day'; }) || !!dayCol;
    var week = 1, day = null, dayN = 0, gap = true, lastName = null, order = [], by = {}, count = {}, unknown = [], seenUnknown = {};
    var put = function (wk, d, nm, text, note, at) {
      var ck = wk + '\u0001' + d + '\u0001' + low(nm), li = count[ck] || 0; count[ck] = li + 1;
      var key = d + '\u0001' + low(nm) + '\u0001' + li, e = by[key];
      if (!e) { e = by[key] = { day: d, name: nm, line: li, cells: {}, notes: {}, at: {} }; order.push(e); }
      e.cells[wk] = text; if (note) e.notes[wk] = note; e.at[wk] = at;
    };
    rows.forEach(function (r, ri) {
      var k = A.kinds[ri] || { kind: 'skip' };
      if (k.kind === 'blank') { gap = true; return; }
      if (k.kind === 'week') { week = k.n || week + 1; day = null; gap = true; lastName = null; return; }
      if (k.kind === 'day') { day = cap1(String(k.label || '').replace(/[\s:\-\u2013\u2014]+$/, '')).slice(0, 40) || 'Day ' + (++dayN); gap = false; lastName = null; return; }
      if (k.kind !== 'line') return;
      if (dayCol && r[dayCol.i]) { var dv = r[dayCol.i]; day = /^\d{1,2}$/.test(dv) ? 'Day ' + dv : cap1(dv).slice(0, 40); }
      else if (!titled && (gap || !day)) { dayN++; day = 'Day ' + dayN; lastName = null; }
      if (!day) { dayN++; day = 'Day ' + dayN; }
      gap = false;
      var raw0 = r[exCol.i] || '', nm = raw0 ? nameOf(raw0) : lastName; if (!nm) return;
      if (raw0 && !names[low(raw0)] && !BL.libFind(raw0) && !seenUnknown[low(raw0)]) { seenUnknown[low(raw0)] = 1; unknown.push(cap1(raw0)); }
      lastName = nm;
      var note = noteCol ? r[noteCol.i] : '', wkNow = weekCol && /\d+/.test(r[weekCol.i] || '') ? Number(/\d+/.exec(r[weekCol.i])[0]) : week;
      var one = function (wk, cols) {
        var p = {}, first = -1;
        cols.forEach(function (x) { var v = r[x.i]; if (!v) return; if (first < 0) first = x.i; if (!p[x.role]) p[x.role] = v; });
        if (first < 0) return;
        var text = compose(p, A.unit); if (!text) return;
        groupsOf(text).forEach(function (g, gi) { put(wk, day, nm, g, gi ? '' : note, { r: ri, c: first }); });
      };
      if (weeksAcross.length) weeksAcross.forEach(function (wk) { one(wk, across.filter(function (x) { return x.week === wk; })); });
      else one(wkNow, A.cols.filter(function (x) { return x.week == null && ['sets', 'reps', 'setsreps', 'cell', 'load', 'rpe', 'rir', 'pct', 'tempo'].indexOf(x.role) >= 0; }));
    });
    if (!order.length) return { ok: false, why: 'No lifts were read from this sheet. Check which column is the exercise and which rows are lifts.', unknown: unknown };
    var maxWeek = 1; order.forEach(function (e) { Object.keys(e.cells).forEach(function (w) { maxWeek = Math.max(maxWeek, +w); }); });
    if (maxWeek > 52) return { ok: false, why: 'That reads as ' + maxWeek + ' weeks. Check which rows are week names.', unknown: unknown };
    /* the model's plainest table: Day, Exercise, Week 1 … Week N, each cell a whole set */
    var canon = [['Day', 'Exercise'].concat(Array.apply(null, { length: maxWeek }).map(function (_, w) { return 'Week ' + (w + 1); }))], src = [];
    order.forEach(function (e) {
      var ln = [e.day, e.name + (e.line ? ', back-offs' : '')];
      for (var w = 1; w <= maxWeek; w++) ln.push(e.cells[w] || '');
      canon.push(ln); src.push(e);
    });
    var res = BL.fromTable(canon, { header: true, name: o.name || 'Imported program', id: o.id, maxes: o.maxes });
    if (!res || !res.ok) return { ok: false, why: (res && res.why) || 'The sheet could not be read.', unknown: unknown };
    var b = res.block;
    /* the notes, written the way a coach's own typing would be */
    order.forEach(function (e) {
      Object.keys(e.notes).forEach(function (w) {
        var r = -1; b.rows.forEach(function (row, i) { if (r < 0 && row.day === e.day && low(row.title) === low(e.name) && row.line === e.line) r = i; });
        if (r >= 0 && b.rows[r].cells[(b.weeks[+w - 1] || {}).uid]) b.setField(r, +w - 1, 'note', String(e.notes[w]).slice(0, 160));
      });
    });
    if (b._undo) { b._undo = []; b._redo = []; }
    var bad = (res.bad || []).map(function (x) { var e = src[x.row - 2], w = x.col - 1, at = e && e.at[w]; return { r: at ? at.r : -1, c: at ? at.c : -1, text: x.text, why: x.why, day: e ? e.day : '', name: e ? e.name : '', week: w }; });
    var days = []; order.forEach(function (e) { if (days.indexOf(e.day) < 0) days.push(e.day); });
    return { ok: true, block: b, read: res.read, weeks: maxWeek, days: days, lines: order, bad: bad, unknown: unknown, unit: A.unit };
  }
  function read(raw, o) { if (typeof raw === 'string') raw = table(raw); var A = analyse(raw, o), res = build(raw, A, o); res.analysis = A; return res; }

  W.IMPORT = { table: table, analyse: analyse, build: build, read: read, tidy: tidy, compose: compose, ROLES: ROLES, KINDS: KINDS };
})();
