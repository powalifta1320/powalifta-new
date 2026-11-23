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
    var rows = (raw || []).slice(0, 5000).map(function (ln) { ln = Array.isArray(ln) ? ln : ln && ln.cells ? ln.cells : []; return ln.slice(0, 80).map(function (x) { return x == null ? '' : String(x).slice(0, 400).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim(); }); });
    while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
    var width = Math.min(80, rows.reduce(function (m, r) { for (var i = r.length; i > 0; i--) if (r[i - 1]) return Math.max(m, i); return m; }, 0));   /* no programme is 80 columns wide */
    return rows.map(function (r) { r = r.slice(0, width); while (r.length < width) r.push(''); return r; });
  }

  /* ---------------- what a coach wrote, as the model's cell language reads it ---------------- */
  function tidy(text) {
    var t = String(text == null ? '' : text).replace(/\u00a0/g, ' ').trim();
    if (!t) return '';
    t = t.replace(/@\s*rpe\s*/ig, '@').replace(/\brpe\s*[:=]?\s*(\d)/ig, '@$1').replace(/(\d(?:\.\d)?)\s*rpe\b/ig, '@$1');
    t = t.replace(/@\s*(\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*%)/g, '$1');                       /* "@ 72.5%" is a percent */
    /* 22 Nov (sheets QA): a percent ladder, the way Sheiko-style sheets write it: percent x reps x sets.
       "50%x5, 60%x4, 70%x3x2" is one set of 5 at 50%, one of 4 at 60%, two of 3 at 70% */
    if (/\d\s*%\s*[x\u00d7*]\s*\d/i.test(t)) {
      t = t.replace(/(\d+(?:\.\d+)?)\s*%\s*[x\u00d7*]\s*(\d{1,2})(?:\s*[x\u00d7*]\s*(\d{1,2}))?(?![\d%])/gi, function (_, p, r, s) { return (s || 1) + 'x' + r + ' ' + p + '%'; });
      t = t.replace(/%\s*[;\s]\s*(?=\d{1,2}x\d)/g, '%, ');                                         /* steps split by spaces only */
    }
    t = t.replace(/(\d+)\s*sets?\s*(?:of|x|\u00d7)?\s*(\d+(?:\s*-\s*\d+)?\+?)(?:\s*reps?\b)?/ig, '$1x$2');
    t = t.replace(/(\d)\s*reps?\b/ig, '$1').replace(/x\s*amrap\b/ig, 'x1+').replace(/\bamrap\b/ig, '1+').replace(/\bmax reps?\b/ig, '1+');
    if (/^1\+(?:\s|$)/.test(t)) t = '1x' + t;                                                       /* "AMRAP" alone: one set, as many as they can */
    var eq = /^(\d{1,2})((?:\s*[,\/]\s*\1)+)$/.exec(t);                                           /* "8, 8, 8" is three eights */
    if (eq) t = (eq[2].split(/[,\/]/).length) + 'x' + eq[1];
    return t.replace(/\s+/g, ' ').trim();
  }
  /* "3x10 per leg", "3x12 each side": the side is said in the note, the set reads without it */
  var SIDE_RE = /\s*\(?\b(?:per|each|ea\.?)\s+(?:leg|side|arm|hand|way)s?\b\)?|\s*\(?(?:\/\s*(?:leg|side|arm)|\be\/s)\b\)?/i;
  function sideOf(text) { var m = SIDE_RE.exec(String(text || '')); return m ? { text: String(text).replace(m[0], ' ').replace(/\s+/g, ' ').trim(), side: m[0].replace(/[()]/g, '').trim() } : { text: text, side: '' }; }
  /* a cell Google Sheets or Excel turned into a date: "5/3/1" becomes 2001-05-03, "3/5" the 3rd of May */
  var DATEISH = /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-[a-z]{3}(?:-\d{2,4})?)$/i;

  /* the names coaches write in their own language, and the ways they shorten a variant, said as the library says them */
  var LANG = {};
  [['Squat', 'sentadilla|sentadillas|sentadilla trasera|kniebeuge|kniebeugen|agachamento|agachamento livre|accosciata|squat arriere|przysiad|przysiad ze sztanga|knaboj|kyykky|squat barre'],
    ['Bench', 'press de banca|press banca|banca|press plano|bankdrucken|bankdruecken|supino|supino reto|panca piana|panca|developpe couche|wyciskanie|wyciskanie lezac|bankpress|bankdrukken|penkkipunnerrus'],
    ['Deadlift', 'peso muerto|peso morto|kreuzheben|levantamento terra|terra|stacco|stacco da terra|souleve de terre|martwy ciag|marklyft|maastanveto'],
    ['Overhead press', 'press militar|schulterdrucken|desenvolvimento|lento avanti|developpe militaire'], ['Barbell row', 'remo con barra|langhantelrudern|remada curvada|rematore'],
    ['Paused squat', 'pause sq|pause squat|paused squat|squat pause|pausen kniebeuge'], ['Paused bench', 'pause bp|paused bp|pause bench|bench pause'], ['Paused deadlift', 'pause dl|paused dl']
  ].forEach(function (x) { x[1].split('|').forEach(function (a) { LANG[a] = x[0]; }); });
  var plain = function (s) { s = low(s); try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* old engine */ } return s.replace(/\u00df/g, 'ss').replace(/\u0142/g, 'l').replace(/[\-_\/]+/g, ' ').replace(/[.']/g, '').replace(/\s+/g, ' ').trim(); };
  /* "A1. Incline DB press", "B2) Face pull": a superset's label, said in the note; "Paused squat (2s)", "Pause bench 1ct":
     the extra said in the note, the exercise found without it */
  var SS_RE = /^\(?([A-Ha-h])\s?(\d{1,2})\s*(?:[.):\-\u2013\u2014]\s*|\s+)(?=[A-Za-z\u00c0-\u024f])/;
  function nameParts(raw) {
    var t = String(raw || '').replace(/\s+/g, ' ').trim(), ss = '', extra = [];
    var m = SS_RE.exec(t); if (m) { ss = m[1].toUpperCase() + m[2]; t = t.slice(m[0].length).trim(); }
    var core = t.replace(/\s*\(([^)]{1,40})\)\s*$/, function (_, x) { extra.push(x.trim()); return ''; })
      .replace(/\s+[\u2013\u2014-]\s+(.{1,40})$/, function (all, x) { return BL.libFind(t.replace(all, '')) ? (extra.push(x.trim()), '') : all; })
      .replace(/\s+(\d+\s*(?:ct|count|cnt|s|sec|secs|second|seconds)(?:\s+pause)?)$/i, function (_, x) { extra.push(x.trim()); return ''; }).trim();
    return { ss: ss, core: core || t, extra: extra.join(', ') };
  }
  function libName(t) {
    var hit = BL.libFind(t); if (hit) return hit.name;
    var p = plain(t); if (LANG[p]) return LANG[p];
    var pz = p.replace(/^pause\b/, 'paused'); hit = pz !== p && BL.libFind(pz); if (hit) return hit.name;
    return null;
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
    /* 22 Nov (sheets QA): a Sets cell that is the whole set ("3x30s") with no Reps beside it was dropped, line and all.
       It is the set as written now, so it reads or is listed as not read, never lost */
    if (!base && p.sets && !isNum(p.sets)) base = tidy(p.sets);
    else if (!base && p.sets && (p.pct || p.rpe || p.load || p.rir)) base = String(p.sets).trim() + 'x?';
    var bits = [base, p.pct ? pctText(p.pct) : '', p.rpe ? effortText(p.rpe) : '', rir ? rir.replace(/\s+/g, '') + 'RIR' : '', p.load && !p.pct ? loadText(p.load, unit) : ''];
    if (p.tempo && /^\d(?:\s*[-.]?\s*\d){2,3}$/.test(p.tempo)) bits.push('tempo ' + p.tempo.replace(/\D/g, '').split('').join('-'));
    return bits.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  /* a tempo the set cannot hold (31X0, "slow down"): kept in the note, said so */
  function tempoLeft(p) { return p.tempo && !/^\d(?:\s*[-.]?\s*\d){2,3}$/.test(p.tempo) ? String(p.tempo).trim() : ''; }
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
    /* 22 Nov (a cold review: an "Intensity" column of 7, 7.5, 8 was read as percent): the word is used for both. What
       the column holds decides: 5 to 10 in halves is RPE; a percent says so or is a fraction or a number over 10. */
    A.cols.forEach(function (x) { if (x.role !== 'pct' || x.week != null || !/^int/.test(low(x.head))) return; var s0 = st[x.i]; if (s0.n && s0.rpe >= 0.6 && s0.pct < 0.3 && !taken.rpe) { x.role = 'rpe'; taken.rpe = 1; delete taken.pct; } });
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

    /* 22 Nov (sheets QA): a sheet whose columns change part way (week 2 rewritten as Lift / Sets x Reps / RPE / Weight)
       was read under week 1's header, its lifts unread. Every later row that is a header in its own right now heads the
       rows under it, each column read by its own name there; the menus above the sheet still set the first header's. */
    var headText = best >= 0 ? rows[best].join('\u0001').toLowerCase() : null;
    A.alt = {};
    if (best >= 0 && A.layout === 'lines') for (i = best + 1; i < n; i++) {
      var hw = rows[i].filter(function (x) { return x && headRole(x); }).length;
      if (hw < 2 || rows[i].join('\u0001').toLowerCase() === headText || rows[i].some(function (x) { return x && !headRole(x); })) continue;
      var seen = {}, alt = rows[i].map(function (x, ci) { var r1 = headRole(x); if (!r1 || r1 === 'rest' || (seen[r1] && r1 !== 'note')) return 'skip'; seen[r1] = 1; return r1; });
      if (!seen.exercise) { var mainEx = A.cols.filter(function (x) { return x.role === 'exercise'; })[0]; if (mainEx && alt[mainEx.i] === 'skip' && !rows[i][mainEx.i]) { alt[mainEx.i] = 'exercise'; seen.exercise = 1; } }
      if (seen.exercise) A.alt[i] = alt;
    }
    var segOf = function (roleAt) {
      var ex = -1; for (var cc = 0; cc < width; cc++) if (ex < 0 && roleAt(cc) === 'exercise') ex = cc;
      var d = []; for (cc = 0; cc < width; cc++) if (roleAt(cc) && ['exercise', 'skip', 'week', 'day', 'note'].indexOf(roleAt(cc)) < 0) d.push({ i: cc, role: roleAt(cc) });
      return { ex: ex, data: d };
    };
    var main = segOf(function (cc) { return A.cols[cc].role; }), seg = main;
    /* the rows: a header again, a week's name, a day's name, a lift, or nothing */
    rows.forEach(function (r, ri) {
      var full = r.filter(Boolean), firstTxt = full[0] || '', k = { kind: 'skip' }, exCol = seg.ex, data = seg.data;
      if (A.alt[ri]) { seg = segOf(function (cc) { return A.alt[ri][cc]; }); A.kinds.push({ kind: 'head', alt: true }); return; }
      if (!full.length) k = { kind: 'blank' };
      else if (ri === best || ri === A.sub || (headText && r.join('\u0001').toLowerCase() === headText)) { k = { kind: 'head' }; seg = main; }
      else if (weekOf(firstTxt) != null && full.length <= 2 && !(A.layout === 'across' && ri <= best)) k = { kind: 'week', n: weekOf(firstTxt) };
      /* a day named above the column names ("DAY 1 - Lower", then Exercise / Sets / Reps): it is the first day */
      else if (best >= 0 && ri < best && full.length <= 2 && DAY_RE.test(firstTxt) && !headRole(firstTxt)) k = { kind: 'day', label: firstTxt };
      else if (ri < from) k = { kind: 'skip' };
      else {
        var ex = exCol >= 0 ? r[exCol] : '', has = data.some(function (x) { return r[x.i]; });
        if (ex && JUNK_RE.test(ex) && !BL.libFind(ex)) k = { kind: 'skip' };
        else if (ex && has) k = { kind: 'line' };
        else if (!ex && has) k = { kind: 'line' };                                   /* more sets of the lift above */
        else if (ex && !has) k = (BL.libFind(ex) || libName(nameParts(ex).core)) && !DAY_RE.test(ex) ? { kind: 'skip' } : { kind: 'day', label: ex };
        else if (full.length <= 2 && (DAY_RE.test(firstTxt) || full.length === 1) && /[a-z]/i.test(firstTxt)) k = { kind: 'day', label: firstTxt };
      }
      A.kinds.push(k);
    });
    Object.keys(o.kinds || {}).forEach(function (kk) { var ri = +kk, v = o.kinds[kk], r = rows[ri]; if (!r) return; var txt = r.filter(Boolean)[0] || ''; if (v !== 'head') delete A.alt[ri]; A.kinds[ri] = v === 'week' ? { kind: 'week', n: weekOf(txt) || 1 } : v === 'day' ? { kind: 'day', label: txt } : { kind: v === 'line' ? 'line' : 'skip' }; });
    return A;
  }

  /* ---------------- the programme ---------------- */
  var colName = function (c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; };
  var SET_ROLES = ['sets', 'reps', 'setsreps', 'cell', 'load', 'rpe', 'rir', 'pct', 'tempo'];
  function build(raw, A, o) {
    o = o || {}; A = A || analyse(raw, o);
    var rows = A.rows;
    /* the columns in force for a row: the first header's, or (22 Nov) the later header above it */
    var mainCols = { ex: null, day: null, week: null, notes: [], data: [] };
    A.cols.forEach(function (x) { if (x.week != null) return; if (x.role === 'exercise' && !mainCols.ex) mainCols.ex = x; else if (x.role === 'day' && !mainCols.day) mainCols.day = x; else if (x.role === 'week' && !mainCols.week) mainCols.week = x; else if (x.role === 'note') mainCols.notes.push(x); else if (SET_ROLES.indexOf(x.role) >= 0) mainCols.data.push(x); });
    var altCols = function (alt) { var c = { ex: null, day: null, week: null, notes: [], data: [] }; alt.forEach(function (rl, i) { var x = { i: i, role: rl, head: (A.rows[0] || [])[i] }; if (rl === 'exercise' && !c.ex) c.ex = x; else if (rl === 'day' && !c.day) c.day = x; else if (rl === 'week' && !c.week) c.week = x; else if (rl === 'note') c.notes.push(x); else if (SET_ROLES.indexOf(rl) >= 0) c.data.push(x); }); return c; };
    var cur = mainCols, exCol = mainCols.ex, dayCol = mainCols.day;
    if (!rows.length) return { ok: false, why: 'The sheet is empty.' };
    if (A.log) return { ok: false, why: 'This reads as a training log, with a column for every set, not a program. Nothing was imported.', unknown: [] };
    if (!exCol) return { ok: false, why: 'Which column holds the exercises? Mark it above.', unknown: [] };
    var across = A.cols.filter(function (x) { return x.week != null && x.role !== 'skip'; }), weeksAcross = [];
    across.forEach(function (x) { if (weeksAcross.indexOf(x.week) < 0) weeksAcross.push(x.week); });
    weeksAcross.sort(function (a, z) { return a - z; });
    var names = {}; Object.keys(o.names || {}).forEach(function (k) { names[low(k)] = o.names[k]; });
    /* the exercise a cell names: the coach's own match, the library's name (short names, other languages), else as written */
    var nameOf = function (t) {
      var k = low(t), pp = nameParts(t); if (names[k]) return { name: names[k], known: true, ss: '', extra: '' };
      if (names[low(pp.core)]) return { name: names[low(pp.core)], known: true, ss: pp.ss, extra: pp.extra };
      var whole = libName(t); if (whole) return { name: whole, known: true, ss: '', extra: '' };
      var lib = libName(pp.core); return lib ? { name: lib, known: true, ss: pp.ss, extra: pp.extra } : { name: cap1(pp.core), known: false, ss: pp.ss, extra: pp.extra && pp.core !== t ? '' : '', core: pp.core };
    };
    var titled = A.kinds.some(function (k) { return k.kind === 'day'; }) || !!dayCol || Object.keys(A.alt || {}).some(function (ri) { return A.alt[ri].indexOf('day') >= 0; });
    var week = 1, day = null, dayN = 0, gap = true, lastName = null, order = [], by = {}, count = {}, unknown = [], seenUnknown = {}, notRead = [], inDay = {};
    var put = function (wk, d, nm, text, note, at) {
      var ck = wk + '\u0001' + d + '\u0001' + low(nm), li = count[ck] || 0; count[ck] = li + 1;
      var key = d + '\u0001' + low(nm) + '\u0001' + li, e = by[key];
      if (!e) { e = by[key] = { day: d, name: nm, line: li, cells: {}, notes: {}, at: {} }; order.push(e); }
      e.cells[wk] = text; if (note) e.notes[wk] = note; e.at[wk] = at;
    };
    rows.forEach(function (r, ri) {
      var k = A.kinds[ri] || { kind: 'skip' };
      if (A.alt && A.alt[ri] && k.kind === 'head') { cur = altCols(A.alt[ri]); return; }
      if (k.kind === 'head') { cur = mainCols; return; }
      if (k.kind === 'blank') { gap = true; return; }
      if (k.kind === 'week') { week = k.n || week + 1; day = null; dayN = 0; gap = true; lastName = null; return; }   /* each week's days count from Day 1 again */
      if (k.kind === 'day') { day = cap1(String(k.label || '').replace(/[\s:\-\u2013\u2014]+$/, '')).slice(0, 40) || 'Day ' + (++dayN); gap = false; lastName = null; return; }
      if (k.kind !== 'line') return;
      var ex = cur.ex || exCol, dc = cur.day;
      if (dc && r[dc.i]) { var dv = r[dc.i]; day = /^\d{1,2}$/.test(dv) ? 'Day ' + dv : cap1(dv).slice(0, 40); }
      else if (!titled && (gap || !day)) { dayN++; day = 'Day ' + dayN; lastName = null; }
      if (!day) { dayN++; day = 'Day ' + dayN; }
      gap = false;
      var raw0 = r[ex.i] || '', nn = raw0 ? nameOf(raw0) : null, nm = nn ? nn.name : lastName;
      if (!nm) return;
      if (nn && !nn.known && !seenUnknown[low(nn.name)]) { seenUnknown[low(nn.name)] = 1; unknown.push(nn.name); }
      var wc = cur.week, wkNow = wc && /\d+/.test(r[wc.i] || '') ? Number(/\d+/.exec(r[wc.i])[0]) : week;
      /* 22 Nov (sheets QA): the same exercise again later in the day, another lift between, wrote over the first. It is
         its own exercise, "Bench (2)", never more sets of the first */
      if (raw0 && nm !== lastName) { var dk = (weeksAcross.length ? 0 : wkNow) + '\u0001' + day, seen = inDay[dk] || (inDay[dk] = {}), n0 = seen[low(nm)] || 0; seen[low(nm)] = n0 + 1; if (n0) nm = nm + ' (' + (n0 + 1) + ')'; }
      lastName = nm;
      /* everything said beside the set goes in its note: the Notes columns, a superset's label, a name's extra, a side */
      var notes = cur.notes.map(function (x) { return r[x.i]; }).filter(Boolean);
      var pre = [nn && nn.ss ? nn.ss + ' superset' : '', nn && nn.known && nn.extra ? nn.extra : ''].filter(Boolean);
      var one = function (wk, cols) {
        var p = {}, first = -1;
        cols.forEach(function (x) { var v = r[x.i]; if (!v) return; if (first < 0) first = x.i; if (!p[x.role]) p[x.role] = v; });
        if (first < 0) return;
        var side = '', tl = tempoLeft(p);
        ['cell', 'setsreps', 'reps'].forEach(function (f) { if (p[f]) { var sd = sideOf(p[f]); if (sd.side) { p[f] = sd.text; side = sd.side; } } });
        var text = compose(p, A.unit);
        if (!text) { notRead.push({ r: ri, c: first, text: cols.filter(function (x) { return r[x.i]; }).map(function (x) { return r[x.i]; }).join(', '), why: 'No sets or reps to read', name: nm, week: wk }); return; }
        if (tl) notRead.push({ r: ri, c: first, text: 'Tempo ' + tl, why: 'kept in the note', name: nm, week: wk, kept: true });
        var nt = pre.concat(side ? [side] : [], tl ? ['tempo ' + tl] : [], notes).join(' · ');
        groupsOf(text).forEach(function (g, gi) { put(wk, day, nm, g, gi ? '' : nt, { r: ri, c: first }); });
      };
      if (weeksAcross.length) weeksAcross.forEach(function (wk) { one(wk, across.filter(function (x) { return x.week === wk; })); });
      else one(wkNow, cur.data);
    });
    if (!order.length) return { ok: false, why: 'No lifts were read from this sheet. Check which column is the exercise and which rows are lifts.', unknown: unknown };
    var minWeek = Infinity, maxWeek = 1; order.forEach(function (e) { Object.keys(e.cells).forEach(function (w) { maxWeek = Math.max(maxWeek, +w); minWeek = Math.min(minWeek, +w); }); });
    /* 22 Nov (sheets QA): the last weeks of a prep (Week 10 to 12) came in as twelve weeks, nine of them empty. Weeks start
       at 1 here; the coach chooses where they go in a lifter's block, and is told */
    var shift = minWeek > 1 && minWeek !== Infinity ? minWeek - 1 : 0, renumbered = shift ? { from: minWeek, to: maxWeek } : null;
    if (shift) { order.forEach(function (e) { ['cells', 'notes', 'at'].forEach(function (f) { var o2 = {}; Object.keys(e[f]).forEach(function (w) { o2[+w - shift] = e[f][w]; }); e[f] = o2; }); }); notRead.forEach(function (x) { x.week -= shift; }); maxWeek -= shift; }
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
    /* the notes, written the way a coach's own typing would be. A set holds 140 characters of note; a longer one, or one
       beside a set that could not be read, is kept whole on the exercise (22 Nov: it was cut at 160, or lost) */
    order.forEach(function (e) {
      var r = -1; b.rows.forEach(function (row, i) { if (r < 0 && row.day === e.day && low(row.title) === low(e.name) && row.line === e.line) r = i; });
      if (r < 0) return;
      var row = b.rows[r], spill = [];
      Object.keys(e.notes).forEach(function (w) {
        var t = String(e.notes[w]), u = (b.weeks[+w - 1] || {}).uid;
        if (u && row.cells[u] && t.length <= 140) b.setField(r, +w - 1, 'note', t);
        else if (spill.indexOf(t) < 0) spill.push(t);
      });
      if (spill.length) row.note = (row.note ? row.note + ' · ' : '') + spill.join(' · ').slice(0, 600);
    });
    if (b._undo) { b._undo = []; b._redo = []; }
    var bad = (res.bad || []).map(function (x) {
      var e = src[x.row - 2], w = x.col - 1, at = e && e.at[w], why = x.why;
      if (DATEISH.test(String(x.text).replace(/^\d+x/, '').trim()) || DATEISH.test(String(x.text).split(' ')[0])) why = 'The spreadsheet turned this into a date (it was likely written as 5/3/1 or 3/5). Write it as 3x5, or put an apostrophe in front, and read the sheet again';
      return { r: at ? at.r : -1, c: at ? at.c : -1, text: x.text, why: why, day: e ? e.day : '', name: e ? e.name : '', week: w };
    });
    /* what was not read at all, said, never dropped: columns left out that hold something, rows left out under the header */
    var lineRows = []; A.kinds.forEach(function (k, ri) { if (k.kind === 'line') lineRows.push(ri); });
    var used = {}; (A.alt ? Object.keys(A.alt) : []).forEach(function (ri) { A.alt[ri].forEach(function (rl, ci) { if (rl !== 'skip') used[ci] = 1; }); });
    A.cols.forEach(function (x) {
      if (x.role !== 'skip' || used[x.i]) return;
      var n = lineRows.filter(function (ri) { return rows[ri][x.i]; }).length; if (!n) return;
      notRead.push({ col: x.i, r: -1, c: x.i, text: 'Column ' + colName(x.i) + (x.head ? ' \u201c' + x.head + '\u201d' : '') + (x.week != null ? ' (week ' + x.week + ')' : ''), why: plural0(n, 'cell') + ' left out. Choose what it holds from its menu to bring it in' });
    });
    var top = Math.max(A.head, A.sub);
    A.kinds.forEach(function (k, ri) { if (k.kind !== 'skip' || ri <= top) return; var t = rows[ri].filter(Boolean); if (!t.length) return; notRead.push({ r: ri, c: -1, text: t.join(', ').slice(0, 80), why: 'This row was left out. Mark it as a lift from the word beside it to bring it in', row: true }); });
    var days = []; order.forEach(function (e) { if (days.indexOf(e.day) < 0) days.push(e.day); });
    return { ok: true, block: b, read: res.read, weeks: maxWeek, days: days, lines: order, bad: bad, unknown: unknown, unit: A.unit, notRead: notRead, renumbered: renumbered };
  }
  var plural0 = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };

  /* ---------------- a workbook's tabs, as the import screen takes them ---------------- */
  /* rows as a reader hands them (arrays, or { cells, line } from import-core.js, which leaves out empty rows) → arrays,
     with the empty rows put back where the sheet had them (22 Nov: an empty row is how many coaches end a day, and an
     .xlsx or a link lost them, so two days read as one). Row numbers then match the coach's own sheet. */
  function rowsOf(t) {
    var src = (t && t.rows) || [], out = [], at = 0;
    src.forEach(function (r) {
      var line = r && !Array.isArray(r) && typeof r.line === 'number' ? r.line : null, cells = Array.isArray(r) ? r : (r && r.cells) || [];
      if (line != null) { if (!out.length) at = line - 1; var gap = Math.min(line - 1 - at - out.length, 200); for (var g = 0; g < gap; g++) out.push([]); }
      out.push(cells);
    });
    return out;
  }
  /* how much of a programme a tab reads as: sets read, less what could not be (22 Nov: a Maxes tab, four lines of
     unreadable kilos, was chosen over the programme) */
  function score(res) { return res && res.ok ? ((res.read && res.read.cells) || 0) - res.bad.length : -1; }
  /* → { tables: [{ name, rows, cut, dropped, of? }], best }. One tab per week ("Week 1", "Week 2" …) is offered as one
     programme, its weeks in order, first; each tab is still there on its own */
  function prepare(tables, o) {
    o = o || {};
    var list = (tables || []).filter(function (t) { return t && t.rows && t.rows.length; }).slice(0, o.maxTabs || 12).map(function (t) {
      var rows = rowsOf(t), max = o.maxRows || 3000;
      return { name: String(t.name || 'Sheet').slice(0, 60), rows: rows.slice(0, max), cut: rows.length > max ? rows.length : 0, dropped: (t.dropped || []).slice() };
    });
    var wk = list.filter(function (t) { return weekOf(t.name) != null; });
    if (wk.length >= 2) {
      wk = wk.slice().sort(function (a, z) { return weekOf(a.name) - weekOf(z.name); });
      var all = [];
      wk.forEach(function (t) {
        var A = analyse(t.rows), keep = t.rows.filter(function (r, ri) { return ri >= A.head || (A.kinds[ri] && (A.kinds[ri].kind === 'day' || A.kinds[ri].kind === 'blank')); });
        all.push(['Week ' + weekOf(t.name)]); all = all.concat(keep); all.push([]);
      });
      var nm = wk.length + ' week tabs as one program';
      list.unshift({ name: nm, rows: all, cut: 0, dropped: [], of: wk.map(function (t) { return t.name; }) });
    }
    var best = 0, most = -Infinity;
    list.forEach(function (t, i) { var s = score(read(t.rows, { names: o.names })); if (s > most) { most = s; best = i; } });
    return { tables: list, best: best };
  }

  function read(raw, o) { if (typeof raw === 'string') raw = table(raw); var A = analyse(raw, o), res = build(raw, A, o); res.analysis = A; return res; }

  W.IMPORT = { table: table, analyse: analyse, build: build, read: read, tidy: tidy, compose: compose, prepare: prepare, rowsOf: rowsOf, score: score, nameParts: nameParts, ROLES: ROLES, KINDS: KINDS };
})();
