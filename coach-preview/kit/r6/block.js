/* kit/r6/block.js: window.BLOCK, the one program model and its one engine (round 6; r6/sheet-spec.md §5 to §7).
   The Builder, the Sheet, the store and every page that works out a load read it here, so a load is the same number
   wherever it shows.

   Loads after ../kit/data.js, ../kit/kit.js and ../kit/coach.js; needs no DOM, no storage and no store.js, and never
   changes window.DEMO (a block works on its own copy). The store keeps a block's JSON as the draft both views share:
     var g = PL.programs.get(id).data;  var b = BLOCK.from(g);  ...  PL.programs.save(id, b.toJSON());

   THE ENGINE (sheet-spec §6)
     BLOCK.math.chart(n) · pct(reps, rpe, table) · round(kg, step) · e1rm(w, reps, rpe, table) · rpeOfPct(share, reps)
       · load({ max, reps, rpe, pct, factor = 1, step = 2.5, table = 'rts' }) → { kg, why }
       The RTS chart: the share of a max for n = reps + (10 - RPE), n = 1, 1.5 ... 16, a straight line between half
       steps, 2.5 points a rep past 16 and never under 40%. table 'linear' is round 4's line (K.pct), kept for the guard.
       Rounding is to the step (2.5 kg) with a 1e-9 tolerance.
     BLOCK.math.working(sets, today, days = 21) → { kg, set, on, n, sessions: [{ on, kg, set }] } | null: the middle of the
       last three sessions' best counting sets (§6.4); sessions are those three (or fewer), oldest first · offer(sets, max, today, step) → { kg, up, from, since } | null (§6.5) · curve(sets, start,
       today) · BLOCK.liftSets(lifter, lift): every rated set of a lift, the program's done sets and the logs it lacks
     A load in the block, b.loadAt(row, cell, uid?, paper?) and b.load(r, c, { paper }), is
       { kind: 'typed'|'pct'|'rpe'|'top'|'nomax'|'feel'|'lifted'|'none', kg, kgHi?, mx?, f?, p?, top?, topLifted? }:
       typed as typed (never re-rounded) · a percent of the max (no ratio) · reps at RPE from the max ÷ the variant's ratio
       on the chart · a back-off (off) under the same week's top set, as lifted or, on paper, as written · row.mx[uid], a
       max pinned to one week by a re-base, wins over b.maxes. A range counts at its middle; kgHi is a range's top.
     BLOCK.loadOf(cell, lift, max, opts | variant) is the same sum for one cell with no block around it (opts: variant,
       factor, table, step, top: the top set's load for an off cell, paper).

   THE CELL LANGUAGE (sheet-spec §5.3). Every round-4 form reads exactly as it did: 3x5 @7 · 3 x 5 @ 7.5 · 5 @8 ·
   3x5 @7-8 · 3x4 70% · 3x5 100 or 100kg · 180x3 @8 (a first number over 20 is a load) · 3x8-10 @7 · and, on the cell
   to the left: +2.5, -5%, +0.5rpe, -1rep, +1set, = (the same), @8, 70%, 150 (they complete it). Added: 3x8 2RIR, RIR 1-2,
   80-85%, 140-145kg, 1x5+ (as many as possible), x1 @8, tempo 3-1-0, paused 2s, 225lb (converted once), on a line
   under a top set -10% or top (a back-off), until @8.5 (a stop rule), several groups in one cell ("1 @8, 4x3 -10%",
   "50%x5, 60%x4, 70%x3x2"), and 3x5 7 asks whether 7 is an RPE or kilos.
     BLOCK.parse(text, ctx?) → { ok: true, cell, groups?, note? } | { ok: false, why, ask? }      cell null = empty
       ctx: { left (the cell to the left), leftLoad, line (this line's number), hasTop (a top set above it),
       ask ('rpe'|'kg': the answer this line gave before), step }
     BLOCK.text(cell) → the canonical text (copy, CSV, the field) · BLOCK.gridText(cell, { row, mark }) → the grid's
       line 1 (× between thin spaces, an en dash in ranges, a true minus; its tail gives way to a mark) ·
       BLOCK.readBack(cell, load) → the cell in words · BLOCK.stepOf(row, cell, k, load) → the cell k weeks on by row.prog
       ('same' | 'kg2.5' | 'kg5' | 'rpe0.5' | 'pct2.5' | 'rep-1'), its own words kept and a rep range keeping its width;
       the block's fills and the Sheet's use it · BLOCK.step is round 4's on round 4's keys (the reference tables)
   A cell is { n, r, rHi?, amrap?, pct?, pctHi?, rpe?, rpeHi?, rir?, off?, until?, w?, wHi?, tempo?, pause? } (the keys in
   BLOCK.CKEYS; absent keys left out), plus lifted in weeks lifted: { of, done, w, kind, felt, on, at, top: { w, r, felt },
   sets: [{ w, r (done), want, felt, rated, at, on, note, video, skipped, plan (the load the phone planned) }] }.

   A BLOCK: one lifter's program as a grid, exercise lines down (by day, in order), weeks across.
     BLOCK.build(lifter) · BLOCK.from(json | the program PL.programs.get answers) · BLOCK.blank(lifter, { days, name })
       build and from read every key a set carries into its cell, and every lifted set into the cell's lifted.
     b.weeks[c] = { uid, n, state: 'lifted'|'now'|'next', sent, sentAt, version, deload, pre, started: { dayName: 1 }, was }
       was: what a sent week held when it was sent, by row key (lines added after the send are not in it); taken: was
       holds the week's current send. The text is taken at the first write after the week is sent, before it changes
     b.rows[r]  = { key, day, ex, line, name, title, label, base ('top' on back-off lines), lift, cat, variant, note,
                    pause, tempo, prog, cells, mx?, nod? (a draft kept as it was), bad? (text kept as typed, unread),
                    cn? (the coach's note on a cell), ask?, askq? }
     b.days = [{ name, wd }]   b.maxes = { squat, bench, deadlift }   b.today = { lift: { kg, why } }
     b.maxFrom = { lift: 'typed' | 'lifting' | null }: a max the coach typed (the program's, or set here), else one from the
       lifting: the working e1RM rounded to the step (today's e1RM rounded when no set counts), and then b.today carries
       that same number (13 Nov: sheet-spec §11 "Max not set", §10.13). toJSON and from keep it; setMax makes a max typed
   READS
     b.cell(r, c) → { text, kg, kgHi?, kind, ro, rx, lifted? }   ro: a lifted week, or a day of this week under way
     b.load(r, c, o) · b.loadFor(r, c, cell) · b.paper(r, c) · b.explain(r, c) · b.stats(c) · b.exercises(day)
     b.mark(r, c, ctx) → the one mark on a lifted cell (§5.4): pain, short, skipped, over, off, note, video, or null
     b.writeCol() → the week to write · b.drafts(c) → { r: { kg, from, keep, why, rule } }: next week from what was
       lifted, by the coach's rules (DEMO.rules, else BLOCK.rules' defaults), only where a rule changes the cell
     b.changes(c) → { n, cells, base } · b.isSent(c) · b.changed(r, c) · b.badIn(c) · b.weekFact(c, o) → the week
       header's one fact (§5.7; o: { meet, sentAt(c) }) · b.rebasePreview(lift, kg, { withSent }) → what a new max moves
     BLOCK.draft(b, c) and BLOCK.weekFact(b, c, o) are the same reads for a caller holding BLOCK.
   WRITES answer { data, label? } or { error: { code: 'invalid' | 'locked' | 'nothing_to_undo', message } }. Every
   write is one step back; a write that changes nothing is not a step (data.changed false). Editing a week marks it
   unsent (weeks[c].sent false); markSent(c, { at }) after the store has sent it.
     set(r, c, text) · clear(range) · paste(range, tsv) → { wrote, locked, bad, past } · copy(range) → tsv
     fillRight(range) (⌘R) · fillDown(range) (⌘D) · addWeek() → { c } · removeWeek(c) · writeFrom(c, { same })
     deload(c) · undeload(c) · clearWeek(c) · markSent(c, { at }) · setMax(lift, kg) · setProg(r, prog)
     addExercise(day, name, { lift, variant }) → { r } · addLine(r) → { r } · lines(r, count) · removeRow(r)
     renameRow(r, name) · setVariant(r, variant) · setNote(r, note) · rename(name) · addDay(name) · renameDay(day, name)
     removeDay(day) · undo() / redo() → { label } · history() → { undo, redo, steps }
     put(r, c, cell): one cell, inside a b.commit(label, fn) only
     toJSON() → plain JSON, v 2 (BLOCK.from(b.toJSON()) is the same block) · toCSV() → RFC 4180 text
   range = { r0, c0, r1, c1 }, inclusive (r1, c1 default to r0, c0). Paste follows the round-4 Sheet: one value fills
   the range, a rectangle lands from the top-left, an empty field clears its cell, lifted cells are left alone
   (locked), unreadable values too (bad), values past the last row or week are dropped (past). The Sheet's own writes
   (kit/r6/sheet.js) keep unreadable text as typed instead.

   SPEC C (13 Nov evening; function-polish F2.1, F3.1, F3.3, P20, P24, P33; first-time-coach §7.1, §7.3). Additive: every
   read above answers as it did.
     BLOCK.placeDays(tplDays, liftDays, o?) → { days: [{ name, wd }], spare: ['Sat'], text, left? }: the one day-placing
       call. The template's days in its order on the lifter's weekdays, nearest first (ties: the most rest, then the
       earlier days); days with no weekday (a starter) take the most rest. text "Mon Tue Thu. Sat free." / "Tue Thu Sat,
       his days." (o: the lifter, { sex } or 'his' | 'her' | 'their') / "Sat’s session has no day: add a 4th day or
       merge it." (left: the template days with no day). With no lifter days the template keeps its own.
     BLOCK.setText(cell) → "3 × 3 @8, 85%" (plain spaces): one set line for Programs and Teams; a back-off "2 × 5, 12% off top set"
     BLOCK.offWords(cell) → "12% off top set"; BLOCK.fieldText(cell, 'effort', { words: true }) and the parsers read it back
       ("12% off top set", "12% off", "12 off"; "top set load"); gridText(cell, { words: true }) → "2 × 5 12% off";
       b.phoneText(r, c, { words: true }) → "2 × 5 at 72.5 kg, 12% lighter than your top set". An off cell's load is the
       same week's top set as lifted or as worked out, × (1 − off/100), to the step; with no top load it is a noload check.
     b.loadWords(r, c) (BLOCK.loadWords(b, r, c)) → { text, acts }: the status line's words for a load, led by the number and
       its unit ("105 kg: 10% under week 2’s 117.5 (deload).", "About 70 kg: 3 @8 from her 82.5 training max."); a typed
       load a progression put there reads "200 kg: from your +2.5 kg rule. By RPE it would be 197.5.", never "typed".
       b.whyOf keeps its spec-B words.
     b.checks(c, ctx) gains kind 'noload' ("Squat back-offs have no load. Give them an RPE or a percent.": a main-lift line
       with neither RPE, percent nor kilos, or a back-off whose top set has no load) and answers in the order the week
       reads (day by day, line by line), each check with group ('fix' unread, 'first' noload and limit, 'rpe' heavy and
       light, 'other'; BLOCK.CHECK_GROUP) and i of n in its group, for "1 of 2: …".
     Week kinds: week.kind 'Build' | 'Deload' | 'Heavy' | 'Peak' | 'Meet week' | 'New maxes' (BLOCK.KINDS), carried by
       toJSON, build (a program week's kind), asTemplate and append; b.weekKind(c, { meet }) → the kind to show beside the
       week's name ("Week 4, Deload"), from week.kind, a deload, or the meet's week; null for a recovery week (its name says
       it). BLOCK.KIND_TERM names the dictionary word each kind is marked with (deload, phase).
     BLOCK.fitStarter(json, { meetIso, startIso, perWeek, days, maxes, lifter, lifterId, meetName }) →
       { data: block JSON | null, meta: { weeks, meetWeek, disabled, title, placed, kinds, perWeek } } | { error }: a
       data.js starter fitted to a lifter (its version for the day count, its days placed, week 1 on the Monday of
       startIso's week); First meet to the meet date (8 to 16 weeks, else data null with "Too close: 6 weeks to the meet" or
       "21 weeks to the meet. Start with First 8 weeks."), its last heavy singles, Opener practice and Last session placed
       by BLOCK.TAPER. See the function for the rules.
     BLOCK.recovery(b).tag → "Lighter than week 2" (function-polish P20: the week bar's tag; the week is "Recovery week"). */
(function () {
  'use strict';
  var W = window, K = W.K, D = W.DEMO;
  if (!K) throw new Error('kit/r6/block.js loads after kit/kit.js');
  if (W.BLOCK && W.BLOCK.__block) return;

  var UNIT = (D && D.unit) || 'kg', STEP = 2.5, LB = 0.45359237;
  var LIFTS = ['squat', 'bench', 'deadlift'], MAIN = { squat: 1, bench: 1, deadlift: 1 };
  /* [id, the sentence form, the menu's word under "Each week" (request #48: one vocabulary; BLOCK.PROGS[i].label is the menu's)] */
  var PROGS = [['same', 'Same every week', 'Same'], ['kg2.5', '+2.5 kg a week', '+2.5 kg'], ['kg5', '+5 kg a week', '+5 kg'], ['rpe0.5', '+0.5 RPE a week', '+0.5 RPE'], ['pct2.5', '+2.5% a week', '+2.5%'], ['rep-1', '−1 rep a week', '−1 rep']];
  var PROG_IDS = PROGS.map(function (p) { return p[0]; });
  /* the app's own variants and how much harder each is than the competition lift (app.js VARIANTS) */
  var VARS = { squat: [['Competition', 1], ['Paused', 1.07], ['Tempo', 1.12], ['Pin', 1.08]], bench: [['Competition', 1], ['Paused', 1.06], ['Close Grip', 1.09], ['Pin Press', 1.08], ['Incline', 1.12]], deadlift: [['Competition', 1], ['Paused', 1.07], ['Deficit', 1.06], ['RDL', 1.1]] };
  var VNAME = { squat: { Competition: 'Squat', Paused: 'Paused squat', Tempo: 'Tempo squat', Pin: 'Pin squat' }, bench: { Competition: 'Bench', Paused: 'Paused bench', 'Close Grip': 'Close-grip bench', 'Pin Press': 'Pin press', Incline: 'Incline bench' }, deadlift: { Competition: 'Deadlift', Paused: 'Paused deadlift', Deficit: 'Deficit deadlift', RDL: 'Romanian deadlift' } };
  var HELP = 'Try 3x5 @7, 3x4 70%, 3x5 100, +2.5 or =.';
  var LIFTED = 'Lifted already. Change a week that is still to come.';
  var WD3 = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  var MINUS = '−', THIN = ' ', TIMES = '×', EN = '-';   /* 13 Nov: no en dash in visible text (skills addendum); a range reads 7.5-8 */

  var r2 = function (v) { return Math.round(v * 100) / 100; }, nf = function (v) { return String(r2(Number(v))); };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var plural = function (k, w, ws) { return k + ' ' + (k === 1 ? w : (ws || w + 's')); };
  var clone = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };
  var words0 = function (s) { return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : ''; };
  var low1 = function (s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); };
  var signed = function (v) { return (v > 0 ? '+' : v < 0 ? MINUS : '') + nf(Math.abs(v)); };
  var x3 = function (a, b) { return a + THIN + TIMES + THIN + b; };        // "3 × 5": the times sign between thin spaces
  function mult(lift, variant) { var a = VARS[lift] || []; for (var i = 0; i < a.length; i++) if (a[i][0] === variant) return a[i][1]; return 1; }
  function sentence(t) { return String(t || '').trim().split(/\s+/).map(function (w, i) { return !i ? w.charAt(0).toUpperCase() + w.slice(1) : /^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase(); }).join(' '); }
  function nameOf(e) { return (MAIN[e.lift] && VNAME[e.lift][e.variant || 'Competition']) || sentence(e.title); }
  function liftOfName(name) { return /squat/i.test(name) ? 'squat' : /bench|pin press/i.test(name) ? 'bench' : /deadlift|rdl|block pull|rack pull/i.test(name) ? 'deadlift' : null; }
  function refuse(code, message) { return { error: { code: code, message: message } }; }
  /* a line's ratio to its competition lift: the coach's own (row.factor) or the app's for its variant */
  function factorOf(row) { return row && row.lift && MAIN[row.lift] ? (row.factor || mult(row.lift, row.variant || 'Competition') || 1) : 1; }

  /* ================= the maths: one engine (sheet-spec §6) ================= */
  /* the RTS chart: the percent of a max for n = reps + (10 - RPE), n = 1, 1.5 ... 16 (§6.1) */
  var CHART = [100, 97.8, 95.5, 93.9, 92.2, 90.7, 89.2, 87.8, 86.3, 85.0, 83.7, 82.4, 81.1, 79.9, 78.6, 77.4, 76.2, 75.1, 73.9, 72.3, 70.7, 69.4, 68.0, 66.7, 65.3, 64.0, 62.6, 61.3, 59.9, 58.6, 57.4];
  function chartAt(n) {
    if (!(n > 1)) return 100;
    if (n >= 16) return Math.max(40, 57.4 - 2.5 * (n - 16));             // past the chart: 2.5 points a rep, never under 40
    var i = Math.floor((n - 1) * 2), t = (n - 1) * 2 - i;                 // between two half steps: the straight line
    return CHART[i] + (CHART[i + 1] - CHART[i]) * t;
  }
  function pct(reps, rpe, table) {
    if (table === 'linear') return K.pct(reps, rpe == null ? 10 : rpe);
    return chartAt(Number(reps) + (10 - Number(rpe == null ? 10 : rpe))) / 100;
  }
  function round(kg, step) { step = step || STEP; return r2(Math.round(kg / step + 1e-9) * step); }
  function e1rm(w, reps, rpe, table) { return Number(w) / pct(reps, rpe, table); }
  /* the RPE a share of the max reads as for these reps, to the half point (the band's hard sets, §5.5) */
  function rpeOfPct(share, reps) {
    var target = share * 100, lo = 1, hi = 80;
    if (target >= 100) return 10;
    for (var k = 0; k < 48; k++) { var mid = (lo + hi) / 2; if (chartAt(mid) > target) lo = mid; else hi = mid; }
    return Math.round((10 - ((lo + hi) / 2 - reps)) * 2) / 2;
  }
  function load(o) {
    o = o || {}; var step = o.step || STEP, f = o.factor || 1, mx = o.max;
    if (!isNum(mx) || mx <= 0) return { kg: null, why: 'No max yet.' };
    if (o.pct != null) return { kg: round(mx * o.pct / 100, step), why: nf(o.pct) + '% of ' + nf(mx) };
    var p = pct(o.reps, o.rpe, o.table);
    return { kg: round(mx / f * p, step), why: nf(Math.round(p * 1000) / 10) + '% of ' + nf(mx) + (f !== 1 ? ' ÷ ' + f.toFixed(2) : '') };
  }
  /* every rated set of a lift: the program's done sets, and logs the program does not hold */
  function liftSets(l, lift) {
    var out = [], seen = {}, p = l && l.program;
    var add = function (s) { var k = s.on + '|' + s.w + '|' + s.r + '|' + s.felt; if (seen[k]) return; seen[k] = 1; out.push(s); };
    if (p) p.weeks.forEach(function (w) { (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) {
      if (e.lift !== lift) return;
      var comp = !e.variant || e.variant === 'Competition';
      (e.sets || []).forEach(function (s) { if (!s.done) return; add({ on: String(s.on || d.date || '').slice(0, 10), w: s.w || 0, r: s.rDone != null ? s.rDone : s.r, felt: s.felt == null ? null : s.felt, rated: s.felt != null, comp: comp, skipped: false }); });
    }); }); });
    ((l && l.logs) || []).forEach(function (g) { if (g.lift !== lift || !g.d) return; add({ on: String(g.d).slice(0, 10), w: g.w || 0, r: g.r, felt: g.rpe == null ? null : g.rpe, rated: g.rpe != null, comp: !g.title || g.title === K.LIFT[lift], skipped: false }); });
    return out.sort(function (a, b) { return a.on < b.on ? -1 : a.on > b.on ? 1 : 0; });
  }
  /* the working e1RM (§6.4): each session's best counting set in the last 21 days, the middle of the last three */
  function working(sets, today, days) {
    var lim = K.add(today, -(days || 21)), by = {};
    (sets || []).forEach(function (s) {
      if (!s.rated || !s.comp || s.skipped || !(s.r >= 1 && s.r <= 6) || !(s.felt >= 7) || !s.w || !s.on || s.on > today || s.on < lim) return;
      var e = e1rm(s.w, s.r, s.felt); if (!by[s.on] || e > by[s.on].e1 + 1e-9) by[s.on] = { e1: e, set: s, on: s.on };
    });
    var ses = Object.keys(by).sort().map(function (k) { return by[k]; }).slice(-3);
    if (!ses.length) return null;
    var pick, v;
    if (ses.length === 3) { v = ses.map(function (x) { return x.e1; }).sort(function (a, b) { return a - b; })[1]; pick = ses.filter(function (x) { return Math.abs(x.e1 - v) < 1e-6; }).pop(); }
    else if (ses.length === 2) { v = Math.min(ses[0].e1, ses[1].e1); pick = ses.filter(function (x) { return Math.abs(x.e1 - v) < 1e-6; }).pop(); }
    else pick = ses[0];
    return { kg: pick.e1, set: pick.set, on: pick.on, n: ses.length, sessions: ses.map(function (x) { return { on: x.on, kg: x.e1, set: x.set }; }) };
  }
  /* the weekly checks are Sunday 18:00: the last Sunday on or before today, and the one before it */
  function lastSunday(iso) { var d = K.d(iso).getDay(); return K.add(iso, -d); }
  /* a re-base is offered when the working e1RM sits 2.5% or more off the max, the same way, at two checks in a row (§6.5) */
  function offer(sets, max, today, step) {
    if (!isNum(max) || !max) return null;
    var s1 = lastSunday(today), s0 = K.add(s1, -7), a = working(sets, s1), z = working(sets, s0), now = working(sets, today);
    if (!a || !z || !now) return null;
    var da = (a.kg - max) / max, dz = (z.kg - max) / max;
    if (Math.abs(da) < 0.025 - 1e-9 || Math.abs(dz) < 0.025 - 1e-9 || (da > 0) !== (dz > 0)) return null;
    var kg = round(now.kg, step); if (kg === max) return null;
    return { kg: kg, up: kg > max, from: now, since: z.on ? s0 : s1 };
  }
  /* the working e1RM after each session in the block (the lift card's one picture) */
  function curve(sets, start, today) {
    var days = []; (sets || []).forEach(function (s) { if (s.comp && s.on && s.on >= (start || '0') && s.on <= today && days.indexOf(s.on) < 0) days.push(s.on); });
    return days.sort().map(function (d) { var w = working(sets, d); return w ? { on: d, kg: w.kg, set: w.set } : null; }).filter(Boolean);
  }
  var MATH = { chart: chartAt, pct: pct, round: round, e1rm: e1rm, rpeOfPct: rpeOfPct, load: load, working: working, offer: offer, curve: curve };

  /* ================= cells ================= */
  /* rest (seconds), pauseAt, acc (bands or chains) and cx (the coach's own named columns, { Bar: 'SSB' }) are the extra
     columns of programs.md §5.3 (request #20) */
  var CKEYS = ['n', 'nHi', 'upTo', 'r', 'rHi', 'amrap', 'pct', 'pctHi', 'rpe', 'rpeHi', 'rir', 'off', 'until', 'w', 'wHi', 'bw', 'tempo', 'pause', 'note', 'rest', 'pauseAt', 'acc', 'cx'];
  /* a cell's written form: what the coach wrote, nothing the lifter did */
  function cellOf(c) { if (!c) return null; var o = {}; CKEYS.forEach(function (k) { if (c[k] != null && c[k] !== false && c[k] !== '') o[k] = k === 'cx' ? (typeof c.cx === 'object' && Object.keys(c.cx).length ? clone(c.cx) : undefined) : c[k]; if (o[k] === undefined) delete o[k]; }); return o; }
  /* round 4's keys only */
  function plain(c) { if (!c) return null; var o = { n: c.n, r: c.r }; if (c.rHi != null) o.rHi = c.rHi; if (c.pct != null) o.pct = c.pct; if (c.rpe != null) o.rpe = c.rpe; if (c.rpeHi != null) o.rpeHi = c.rpeHi; if (c.w != null) o.w = c.w; return o; }
  /* a cell as the block keeps it: its written form in key order, and what was lifted */
  function stored(c) { var o = cellOf(c); if (o && c.lifted) o.lifted = c.lifted; return o; }
  /* what the lifter has of a line: its text, and this week's note when there is one (a note change is a change to send) */
  function sig(c) { var x = cellOf(c); return text(x) + (x && x.note ? ' | ' + x.note : ''); }
  var effReps = function (c) { return c.rHi != null ? (c.r + c.rHi) / 2 : c.r; };
  var effRpe = function (c) { return c.rpeHi != null ? (c.rpe + c.rpeHi) / 2 : c.rpe; };
  var isSingle = function (c) { return c.n === 1 && c.nHi == null && !c.upTo && c.rpe != null && c.pct == null; };
  var rirOf = function (c) { return c.rpeHi != null ? nf(10 - c.rpeHi) + '-' + nf(10 - c.rpe) : nf(10 - c.rpe); };

  /* ---------------- round 4's language: the reference tables in block.test.mjs ---------------- */
  function norm(t) { return String(t == null ? '' : t).replace(/ /g, ' ').trim().toLowerCase().replace(/[×✕*х]/g, 'x').replace(/[−–—]/g, '-').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' '); }
  function check(c) {
    if (!(c.n >= 1) || c.n % 1) return 'Sets are a whole number, 1 or more.';
    if (c.n > 20) return 'More than 20 sets is a lot. A first number over 20 is read as a load: 180x3.';
    if (!(c.r >= 1) || c.r % 1 || c.r > 100) return 'Reps are a whole number from 1 to 100.';
    if (c.rHi != null && (c.rHi <= c.r || c.rHi % 1 || c.rHi > 100)) return 'A rep range goes up: 8-10.';
    if (c.rpe != null && (c.rpe < 1 || c.rpe > 10 || (c.rpe * 2) % 1)) return 'RPE runs from 1 to 10, in halves.';
    if (c.rpeHi != null && (c.rpeHi <= c.rpe || c.rpeHi > 10 || (c.rpeHi * 2) % 1)) return 'An RPE range goes up: @7-8.';
    if (c.pct != null && (c.pct < 1 || c.pct > 120)) return 'A percent of the max runs from 1 to 120.';
    if (c.w != null && (c.w <= 0 || c.w > 1000)) return 'A load is more than 0 and under 1000 ' + UNIT + '.';
    if (c.pct != null && c.w != null) return 'A percent or a load, not both.';
    return '';
  }
  function core(raw, ctx) {
    ctx = ctx || {};
    var t = norm(raw), shown = String(raw == null ? '' : raw).trim(), left = ctx.left ? plain(ctx.left) : null, m, c = null, rest;
    var bad = function (why) { return { ok: false, why: why }; }, ok = function (x) { var e = check(x); return e ? bad(e) : { ok: true, cell: plain(x) }; };
    if (!t) return { ok: true, cell: null };
    if (t === '=') return left ? ok(left) : bad('There is nothing to the left to repeat.');
    if ((m = /^([+-])\s*(\d+(?:\.\d+)?)\s*(kgs?|%|rpe|reps?|r|sets?|s)?$/.exec(t))) {
      if (!left) return bad('There is nothing to the left to change.');
      var d = Number(m[2]) * (m[1] === '-' ? -1 : 1), u = m[3] || 'kg', base = left.w != null ? left.w : ctx.leftLoad;
      if (u.charAt(0) === 'k') { if (base == null) return bad('The cell to the left has no load to add to.'); delete left.pct; left.w = r2(base + d); }
      else if (u === '%') { if (left.pct != null) left.pct = r2(left.pct + d); else { if (base == null) return bad('The cell to the left has no load to change.'); left.w = K.round(base * (1 + d / 100)); } }
      else if (u === 'rpe') { if (left.rpe == null) return bad('The cell to the left has no RPE to change.'); left.rpe = r2(left.rpe + d); if (left.rpeHi != null) left.rpeHi = r2(left.rpeHi + d); }
      else if (u.charAt(0) === 'r') { left.r += d; if (left.rHi != null) left.rHi += d; }
      else left.n += d;
      return ok(left);
    }
    if ((m = /^(?:@|rpe)\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/.exec(t))) { if (!left) return bad('How many sets and reps? Try 3x5 ' + shown + '.'); left.rpe = Number(m[1]); if (m[2]) left.rpeHi = Number(m[2]); else delete left.rpeHi; return ok(left); }
    if ((m = /^(\d+(?:\.\d+)?)\s*%$/.exec(t))) { if (!left) return bad('How many sets and reps? Try 3x4 ' + shown + '.'); left.pct = Number(m[1]); delete left.w; return ok(left); }
    if ((m = /^(\d+(?:\.\d+)?)\s*(kgs?)?$/.exec(t))) {
      var v = Number(m[1]);
      if (!m[2] && v <= 20) return bad('“' + shown + '” alone could be sets, reps or an RPE. ' + HELP);
      if (!left) return bad('A load needs its reps: ' + nf(v) + 'x3 @8.');
      left.w = v; delete left.pct; return ok(left);
    }
    if ((m = /^(\d+(?:\.\d+)?)\s*x\s*(\d+)(?:\s*-\s*(\d+))?(?:\s*x\s*(\d+(?:\.\d+)?))?/.exec(t))) {
      var a = Number(m[1]), c3 = m[4] != null ? Number(m[4]) : null;
      if (a > 20 || a % 1) c = { n: c3 != null ? c3 : 1, r: Number(m[2]), w: a }; else { c = { n: a, r: Number(m[2]) }; if (c3 != null) c.w = c3; }
      if (m[3]) c.rHi = Number(m[3]);
      rest = t.slice(m[0].length);
    } else if ((m = /^(\d+)(?:\s*-\s*(\d+))?(?=\s*(?:@|rpe)|\s+\d)/.exec(t))) {
      c = { n: 1, r: Number(m[1]) }; if (m[2]) c.rHi = Number(m[2]);
      rest = t.slice(m[0].length);
    }
    if (!c && !/\d/.test(t)) return bad('Write it as 3x3 @8 or 180x3.');       /* words alone ("heavy triple"): programs.md §14.3, request #22 */
    if (!c) return bad('Did not understand “' + shown + '”. ' + HELP);
    rest = rest.trim(); var seen = {};
    while (rest) {
      if ((m = /^(?:@|rpe)\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?/.exec(rest))) { if (seen.rpe) return bad('Two RPEs in one cell. One is enough: 3x5 @7.'); seen.rpe = 1; c.rpe = Number(m[1]); if (m[2]) c.rpeHi = Number(m[2]); }
      else if ((m = /^(\d+(?:\.\d+)?)\s*%/.exec(rest))) { if (seen.pct) return bad('Two percents in one cell. One is enough: 3x4 70%.'); seen.pct = 1; c.pct = Number(m[1]); }
      else if ((m = /^(\d+(?:\.\d+)?)\s*(?:kgs?)?(?=\s|@|$)/.exec(rest))) { if (c.w != null) return bad('Two loads in one cell. One is enough: 3x5 100.'); c.w = Number(m[1]); }
      else if ((m = /^(?:at|,|;)\s*/.exec(rest))) { /* a filler word */ }
      else return bad('Did not understand “' + rest + '”. ' + HELP);
      rest = rest.slice(m[0].length).trim();
    }
    return ok(c);
  }

  /* ---------------- the whole language: round 4's, and §5.3's forms ---------------- */
  function bad(why) { return { ok: false, why: why }; }
  function parse(raw, ctx) {
    ctx = ctx || {};
    var t = norm(raw), m;
    if (!t) return { ok: true, cell: null };
    if (t === '=') return ctx.left ? { ok: true, cell: cellOf(ctx.left) } : bad('There is nothing to the left to repeat.');
    /* several groups in one cell: a top set and its back-offs, or a ladder (D8) */
    if (/,/.test(t) && /\d\s*,\s*\d|\d\s*%?\s*,\s*\S/.test(t)) {
      var parts = t.split(/\s*,\s*/).filter(Boolean);
      if (parts.length > 1) {
        if (ctx.line) return bad('Several groups go on a top-set line, where each becomes a line of its own.');
        var groups = [], why = null;
        parts.some(function (p, i) {
          var lad = /^(\d+(?:\.\d+)?)\s*%\s*x\s*(\d+)(?:\s*x\s*(\d+))?$/.exec(p);
          if (lad) { groups.push({ n: lad[3] ? Number(lad[3]) : 1, r: Number(lad[2]), pct: Number(lad[1]) }); return false; }
          var res = parse(p, { line: i, hasTop: i > 0, step: ctx.step });
          if (!res.ok || !res.cell || res.groups) { why = res.why || 'Did not understand “' + p + '”.'; return true; }
          groups.push(res.cell); return false;
        });
        if (why) return bad(why);
        return { ok: true, cell: groups[0], groups: groups };
      }
    }
    /* 3x5 7: RPE 7, or 7 kg? A number that could be an RPE asks once; the answer sticks for the line (M3) */
    if ((m = /^(\d+)\s*x\s*(\d+(?:-\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(t))) {
      var v = Number(m[3]), base = m[1] + 'x' + m[2];
      if (v >= 1 && v <= 10 && (v * 2) % 1 === 0) {
        if (ctx.ask === 'rpe') t = base + ' @' + nf(v);
        else if (ctx.ask === 'kg') t = base + ' ' + nf(v) + 'kg';
        else return { ok: false, why: x3(m[1], m[2].replace('-', EN)) + ' at RPE ' + nf(v) + ', or with ' + nf(v) + ' kg?', ask: [base + ' @' + nf(v), base + ' ' + nf(v) + 'kg'] };
      }
    }
    var ext = {}, err = null, rest = ' ' + t + ' ';
    rest = rest.replace(/^\s*up to\s*(\d+)\s*x/, function (_, n) { ext.upTo = true; return ' ' + n + 'x'; });
    rest = rest.replace(/^\s*(\d+)\s*-\s*(\d+)\s*x(?=\s*\d)/, function (_, a, b2) { if (!(Number(b2) > Number(a)) || Number(b2) > 20) err = 'A range of sets goes up, to 20 at most: 3-4x5.'; ext.nHi = Number(b2); return ' ' + a + 'x'; });
    rest = rest.replace(/\s(?:bw|bodyweight)(?=\s)/, function () { ext.bw = true; return ' '; });
    rest = rest.replace(/\stempo\s*(\d-\d-\d(?:-\d)?)(?=\s)/, function (_, x) { ext.tempo = x; return ' '; });
    rest = rest.replace(/\spaus(?:e|ed)(?:\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?)?(?=\s)/, function (_, x) { ext.pause = x ? Number(x) : 2; return ' '; });
    rest = rest.replace(/\suntil\s*@?\s*(\d+(?:\.\d+)?)(?=\s)/, function (_, x) { ext.until = Number(x); return ' '; });
    /* spec C (F3.1): a back-off in the grid's words, "2x5 12% off top set" (also "12% off top", "12% off", "12 off") */
    rest = rest.replace(/\s(\d+(?:\.\d+)?)\s*%?\s*off(?:\s+(?:the\s+)?top(?:\s+set)?)?(?=\s)/, function (_, x) { ext.off = Number(x); return ' '; });
    rest = rest.replace(/\s(?:top set load|same as (?:the )?top set)(?=\s)/, function () { ext.off = 0; return ' '; });
    rest = rest.replace(/\s(?:top|repeat|same load)(?=\s)/, function () { ext.off = 0; return ' '; });
    rest = rest.replace(/\s(?:@\s*)?(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*rir(?=\s)|\srir\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?(?=\s)/, function (_, a, b2, c2, d2) {
      var lo = Number(a != null ? a : c2), hi = (b2 != null ? b2 : d2) != null ? Number(b2 != null ? b2 : d2) : null;
      if (hi != null && hi <= lo) { err = 'An RIR range goes up: RIR 1-2.'; return ' '; }
      ext.rir = true; if (hi != null) { ext.rpe = 10 - hi; ext.rpeHi = 10 - lo; } else ext.rpe = 10 - lo;
      return ' ';
    });
    rest = rest.replace(/\s(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%(?=\s)/, function (_, a, b2) { if (Number(b2) <= Number(a)) err = 'A percent range goes up: 80-85%.'; ext.pct = Number(a); ext.pctHi = Number(b2); return ' '; });
    rest = rest.replace(/\s(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*kgs?(?=\s)/, function (_, a, b2) { if (Number(b2) <= Number(a)) err = 'A load range goes up: 140-145kg.'; ext.w = Number(a); ext.wHi = Number(b2); return ' '; });
    rest = rest.replace(/\s(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)(?=\s)/, function (_, a) { ext.lb = Number(a); return ' '; });
    rest = rest.replace(/^(\s*\d+\s*x\s*\d+(?:\s*-\s*\d+)?\+?)\s*-\s*(\d+(?:\.\d+)?)\s*%(?=\s)/, function (_, head, x) { ext.off = Number(x); return head + ' '; });
    rest = rest.replace(/^(\s*\d+\s*x\s*\d+)\+/, function (_, head) { ext.amrap = true; return head; });
    rest = rest.replace(/^\s*x\s*(\d+)/, ' 1x$1');
    if (err) return bad(err);
    if (ext.off != null && !ctx.hasTop) return bad(ext.off ? MINUS + nf(ext.off) + '% means under the top set. Put it on the line under one, or write 3x5 70%.' : '“top” repeats the top set’s load. Put it on the line under one.');
    var cr = rest.replace(/\s+/g, ' ').trim();
    var res = cr ? core(cr, { left: ctx.left ? plain(ctx.left) : null, leftLoad: ctx.leftLoad }) : { ok: true, cell: ctx.left ? plain(ctx.left) : null };
    if (!res.ok) return bad(res.why);
    if (!res.cell) return bad('How many sets and reps? Try 3x5 @7.');
    var c = res.cell;
    if (ext.rir) { if (c.rpe != null) return bad('An RPE or an RIR, not both: 3x8 @8 or 3x8 2RIR.'); c.rpe = ext.rpe; if (ext.rpeHi != null) c.rpeHi = ext.rpeHi; c.rir = true; }
    if (ext.pct != null) { if (c.pct != null || c.w != null) return bad('A percent or a load, not both.'); c.pct = ext.pct; c.pctHi = ext.pctHi; }
    if (ext.w != null) { if (c.w != null || c.pct != null) return bad('Two loads in one cell. One is enough: 4x3 140-145kg.'); c.w = ext.w; c.wHi = ext.wHi; }
    if (ext.lb != null) { if (c.w != null || c.pct != null) return bad('Two loads in one cell. One is enough: 3x5 225lb.'); c.w = round(ext.lb * LB, ctx.step || STEP); }
    if (ext.off != null) { if (c.w != null || c.pct != null) return bad('A back-off works from the top set: drop the load, or the minus.'); c.off = ext.off; }
    if (ext.until != null) {
      if (c.rpe != null && ext.until < c.rpe) return bad('Stop at an RPE at or above the line’s own: ' + c.n + 'x' + c.r + ' @' + nf(c.rpe) + ' until @' + nf(c.rpe + 0.5) + '.');
      if (ext.until < 1 || ext.until > 10 || (ext.until * 2) % 1) return bad('RPE runs from 1 to 10, in halves.');
      c.until = ext.until;
    }
    if (ext.amrap) c.amrap = true;
    if (ext.nHi != null) c.nHi = ext.nHi;
    if (ext.upTo) c.upTo = true;
    if (ext.bw) { if (c.w != null || c.pct != null) return bad('A load or bw, not both.'); c.bw = true; }
    if (ext.tempo) c.tempo = ext.tempo;
    if (ext.pause) c.pause = ext.pause;
    if (c.r > 30 && !c.amrap) return bad('Reps run from 1 to 30 in a set.');
    var out = { ok: true, cell: cellOf(c) };
    if (ext.lb != null) out.note = nf(ext.lb) + ' lb is ' + nf(c.w) + ' kg on her plates.';
    return out;
  }
  /* the canonical text (copy, CSV, the field): round 4's order for its own parts, so a plain cell reads exactly as round 4
     wrote it; §5.3's parts follow */
  function text(c) {
    if (!c) return '';
    var s = (c.upTo ? 'up to ' + c.n + 'x' : c.nHi != null ? c.n + '-' + c.nHi + 'x' : isSingle(c) ? '' : (c.n == null ? 1 : c.n) + 'x') + (c.r == null ? '?' : c.r) + (c.rHi != null ? '-' + c.rHi : '') + (c.amrap ? '+' : '');
    if (c.pct != null) s += ' ' + nf(c.pct) + (c.pctHi != null ? '-' + nf(c.pctHi) : '') + '%';
    /* FIX-LOGIC (FP F3.5): a back-off's part comes before its RPE ("2x5 -15% @7"), the order parse reads back */
    if (c.off != null) s += c.off ? ' -' + nf(c.off) + '%' : ' top';
    if (c.rpe != null) s += c.rir ? ' ' + rirOf(c) + 'RIR' : ' @' + nf(c.rpe) + (c.rpeHi != null ? '-' + nf(c.rpeHi) : '');
    if (c.until != null) s += ' until @' + nf(c.until);
    if (c.w != null) s += ' ' + nf(c.w) + (c.wHi != null ? '-' + nf(c.wHi) : '') + UNIT;
    else if (c.bw) s += ' bw';
    if (c.tempo) s += ' tempo ' + c.tempo;
    if (c.pause) s += ' pause ' + nf(c.pause) + 's';
    return s;
  }
  /* the grid's line 1: × between thin spaces, an en dash in ranges, a true minus; the tail (RIR, a stop rule, this week's
     tempo or pause) gives way to a mark, numbers never do (§5.3) */
  function gridText(c, o) {
    o = o || {}; if (!c) return '';
    var row = o.row || {}, rp = (c.r == null ? '?' : c.r) + (c.rHi != null ? EN + c.rHi : '') + (c.amrap ? '+' : '');
    var s = c.upTo ? 'up to ' + x3(c.n, rp) : c.nHi != null ? x3(c.n + EN + c.nHi, rp) : c.n === 1 && c.r === 1 && !c.amrap && c.rHi == null ? '1' : x3(c.n, rp);
    var tail = '';
    var gr = c.rpe != null && !c.rir ? ' @' + nf(c.rpe) + (c.rpeHi != null ? EN + nf(c.rpeHi) : '') : '';
    if (c.off == null) s += gr;
    if (c.pct != null) s += ' ' + nf(c.pct) + (c.pctHi != null ? EN + nf(c.pctHi) : '') + '%';
    /* o.words (spec C, F3.1): a back-off reads "2 × 5 10% off" on the Block view, never a bare −10%; its own RPE follows
       (FIX-LOGIC, FP F3.5: "2 × 5 15% off @7", the order the cell's text and parse use) */
    if (c.off != null) s += (c.off ? ' ' + (o.words ? nf(c.off) + '% off' : MINUS + nf(c.off) + '%') : (o.words ? ' top set load' : ' top')) + gr;
    if (c.rpe != null && c.rir) tail += ' · ' + rirOf(c).replace('-', EN) + ' RIR';
    if (c.until != null) tail += ' to @' + nf(c.until);
    if (c.tempo && c.tempo !== row.tempo) tail += ' · ' + c.tempo;
    if (c.pause && c.pause !== row.pause) tail += ' paused';
    return o.mark ? s : s + tail;
  }
  /* the cell read back in words while it is typed (M3); L: its load */
  function readBack(c, L) {
    if (!c) return '';
    var s = c.upTo ? 'Up to ' + c.n + ' sets of ' + c.r : c.nHi != null ? c.n + ' to ' + c.nHi + ' sets of ' + c.r : c.n === 1 ? (c.r === 1 && !c.amrap ? 'A single' : 'One set of ' + c.r) : c.n + ' sets of ' + c.r;
    if (c.rHi != null) s += ' to ' + c.rHi;
    if (c.amrap) s += ' or more';
    if (c.rpe != null) s += c.rir ? ', ' + rirOf(c).replace('-', ' to ') + ' in reserve' : ' at RPE ' + nf(c.rpe) + (c.rpeHi != null ? ' to ' + nf(c.rpeHi) : '');
    if (c.pct != null) s += ' at ' + nf(c.pct) + (c.pctHi != null ? ' to ' + nf(c.pctHi) : '') + '% of the max';
    if (c.off != null) s += c.off ? ' at ' + nf(c.off) + '% under the top set' : ' at the top set’s load';
    if (c.until != null) s += ', stopping at the first @' + nf(c.until);
    if (c.tempo) s += ', tempo ' + c.tempo;
    if (c.pause) s += ', ' + nf(c.pause) + ' s pause';
    if (L && L.kg != null) s += ': ' + nf(L.kg) + (L.kgHi != null ? ' to ' + nf(L.kgHi) : '') + (L.kind === 'top' ? ' on paper' : L.kind === 'rpe' ? ', about' : '');
    return s + '.';
  }
  /* round 4's six progressions, on round 4's keys */
  function step4(row, cell, k, load) {
    var c = plain(cell), b; if (!c || !k) return c;
    var prog = row && row.prog;
    if (prog === 'kg2.5' || prog === 'kg5') { b = c.w != null ? c.w : load; if (b != null) { c.w = r2(b + (prog === 'kg5' ? 5 : 2.5) * k); delete c.pct; } }
    else if (prog === 'rpe0.5') { if (c.rpe != null) { c.rpe = Math.min(10, c.rpe + 0.5 * k); if (c.rpeHi != null) { c.rpeHi = Math.min(10, c.rpeHi + 0.5 * k); if (c.rpeHi <= c.rpe) delete c.rpeHi; } } }
    else if (prog === 'pct2.5') { if (c.pct != null) c.pct = Math.min(120, r2(c.pct + 2.5 * k)); else { b = c.w != null ? c.w : load; if (b != null) c.w = K.round(b * (1 + 0.025 * k)); } }
    else if (prog === 'rep-1') { c.r = Math.max(1, c.r - k); if (c.rHi != null) { c.rHi = Math.max(1, c.rHi - k); if (c.rHi <= c.r) delete c.rHi; } }
    return plain(c);
  }
  /* the cell k weeks on by its row's progression, its own words kept (AMRAP, RIR, a stop rule, tempo, pause, a back-off,
     the top of a range moving with its bottom) */
  function stepOf(row, cell, k, load) {
    var c = cellOf(cell); if (!c || !k) return c;
    var out = cellOf(step4(row, plain(c), k, load));
    ['nHi', 'upTo', 'amrap', 'rir', 'until', 'tempo', 'pause', 'bw', 'note'].forEach(function (key) { if (c[key] != null) out[key] = c[key]; });
    if (out.nHi != null && !(out.nHi > out.n)) delete out.nHi;
    if (c.off != null && out.w == null) out.off = c.off;
    if (c.pctHi != null && out.pct != null) out.pctHi = r2(c.pctHi + (out.pct - c.pct));
    if (c.wHi != null && out.w != null && c.w != null) out.wHi = r2(c.wHi + (out.w - c.w));
    if (c.rHi != null && out.r != null && out.rHi == null && c.rHi - c.r + out.r > out.r) out.rHi = out.r + (c.rHi - c.r);
    return out;
  }
  /* one cell's load with no block around it: opts = { variant, factor, table: 'rts'|'linear', step, top, paper } (a string
     is a variant, as round 4 passed it) */
  function loadOf(c, lift, max, opts) {
    var o = typeof opts === 'string' ? { variant: opts } : opts || {}, sp = o.step || STEP;
    if (!c) return { kind: 'none', kg: null };
    if (c.lifted && !o.paper) return { kind: 'lifted', kg: c.lifted.top ? c.lifted.top.w || null : c.lifted.w || null };
    if (c.w != null) return { kind: 'typed', kg: c.w, kgHi: c.wHi != null ? c.wHi : null };
    if (c.off != null) { if (!isNum(o.top)) return { kind: 'feel', kg: null }; return { kind: 'top', kg: round(o.top * (1 - c.off / 100), sp), top: o.top }; }
    if (lift && MAIN[lift]) {
      var mx = isNum(max) && max > 0 ? max : null;
      if (c.pct != null) return mx ? { kind: 'pct', kg: round(mx * c.pct / 100, sp), kgHi: c.pctHi != null ? round(mx * c.pctHi / 100, sp) : null, mx: mx } : { kind: 'nomax', kg: null };
      if (c.rpe != null) { if (!mx) return { kind: 'nomax', kg: null }; var f = o.factor || mult(lift, o.variant || 'Competition') || 1, p = pct(effReps(c), effRpe(c), o.table); return { kind: 'rpe', kg: round(mx / f * p, sp), mx: mx, f: f, p: p }; }
    }
    return { kind: 'feel', kg: null };
  }

  /* ================= a lifter's program, read into a block ================= */
  /* today's e1RM: the app's own, or the heaviest set of the last session lifted in this block if that says more;
     with nothing logged, the intake's best set */
  function todayE1(l, lift) {
    var app = l.lifts && l.lifts[lift] && l.lifts[lift].e1 ? l.lifts[lift].e1 : null, best = null, p = l.program;
    if (p) for (var wi = p.weeks.length - 1; wi >= 0 && !best; wi--) p.weeks[wi].days.forEach(function (d) { (d.exercises || []).forEach(function (e) {
      if (e.lift !== lift || (e.variant && e.variant !== 'Competition')) return;
      e.sets.forEach(function (s) { if (s.done && s.w && s.felt != null && (!best || s.w > best.w)) best = { w: s.w, r: s.r, felt: s.felt, on: String(s.on || d.date || '').slice(0, 10) }; });
    }); });
    var kg = best ? Math.round(K.e1(best.w, best.r, best.felt) * 10) / 10 : null;
    if (kg != null && (app == null || kg > app)) return { kg: kg, why: nf(best.w) + ' × ' + best.r + ' at RPE ' + nf(best.felt) + (best.on ? ' ' + K.when(best.on) : '') };
    if (app != null) return { kg: app, why: 'the e1RM from the logged sets' };
    var ib = l.intake && l.intake.best && l.intake.best[lift];
    if (ib && ib.kg) return { kg: Math.round(K.e1(ib.kg, ib.reps) * 10) / 10, why: 'the intake, ' + nf(ib.kg) + ' × ' + ib.reps };
    return null;
  }
  function detect(row, weeks) {
    var cs = weeks.map(function (w) { return row.cells[w.uid] || null; }).filter(Boolean), pairs = [], i;
    for (i = 1; i < cs.length; i++) pairs.push([cs[i - 1], cs[i]]);
    if (!pairs.length) return 'same';
    var mode = function (f) { var cnt = {}, best = null; pairs.forEach(function (pr) { var v = f(pr[0], pr[1]); if (v == null) return; v = r2(v); cnt[v] = (cnt[v] || 0) + 1; }); Object.keys(cnt).forEach(function (k) { if (best == null || cnt[k] > cnt[best] || (cnt[k] === cnt[best] && Math.abs(k) > Math.abs(best))) best = k; }); return best == null ? null : { v: Number(best), share: cnt[best] / pairs.length }; };
    var ld = function (c) { return c.lifted && c.lifted.w ? c.lifted.w : c.w != null ? c.w : null; }, x;
    x = mode(function (a, b) { return a.pct != null && b.pct != null ? b.pct - a.pct : null; }); if (x && x.v === 2.5 && x.share >= 0.5) return 'pct2.5';
    x = mode(function (a, b) { return a.pct == null && b.pct == null && ld(a) != null && ld(b) != null ? ld(b) - ld(a) : null; }); if (x && x.share >= 0.5 && (x.v === 2.5 || x.v === 5)) return x.v === 5 ? 'kg5' : 'kg2.5';
    x = mode(function (a, b) { return a.rpe != null && b.rpe != null ? b.rpe - a.rpe : null; }); if (x && x.v === 0.5 && x.share >= 0.5) return 'rpe0.5';
    x = mode(function (a, b) { return b.r - a.r; }); if (x && x.v === -1 && x.share >= 0.5) return 'rep-1';
    return 'same';
  }
  /* an exercise's sets in lines: consecutive sets written the same are one line (warm-ups and extra sets aside) */
  function groupsOf(e) {
    var gs = [];
    (e.sets || []).forEach(function (s) {
      if (s.extra) return;
      /* spec C (F3.1): a back-off written "off the top set" never joins the top set's line, whatever its reps */
      var q = { w: s.w || 0, r: s.r, rpe: s.rpe == null ? null : s.rpe, rpeHi: s.rpeHi == null ? null : s.rpeHi, pct: s.pct == null ? null : s.pct, off: s.off == null ? null : s.off }, g = gs[gs.length - 1];
      if (g && g.w === q.w && g.r === q.r && g.rpe === q.rpe && g.rpeHi === q.rpeHi && g.pct === q.pct && g.off === q.off) g.sets.push(s); else { q.sets = [s]; gs.push(q); }
    });
    return gs;
  }
  /* what a lifted line holds: each set as lifted (load, reps done, felt or not rated, its time and note, the load the
     phone planned), the top set (the heaviest load × the most reps done at it, felt as the hardest rated set) */
  function liftedOf(sets, prev) {
    var out = { of: prev.of, done: prev.done, kind: prev.kind, felt: prev.felt, on: prev.on, w: prev.w, sets: [] };
    sets.forEach(function (s) {
      out.sets.push({ w: s.w || 0, r: s.rDone != null ? s.rDone : s.r, want: s.r, felt: s.felt == null ? null : s.felt, rated: s.felt != null, at: s.at || null,
        on: s.on ? String(s.on).slice(0, 10) : null, note: s.note || '', video: !!s.video, skipped: !s.done, plan: s.planW != null ? s.planW : null });
      if (s.by === 'coach') out.sets[out.sets.length - 1].by = 'coach';
    });
    if (out.sets.some(function (x) { return x.by === 'coach' && !x.skipped; }) || prev.by === 'coach') out.by = 'coach';   /* the coach typed what the lifter texted (PL.lifters.logFor) */
    var done = out.sets.filter(function (x) { return !x.skipped; }), top = null, felt = null;
    done.forEach(function (x) { if (!top || x.w > top.w || (x.w === top.w && x.r > top.r)) top = { w: x.w, r: x.r }; });
    done.forEach(function (x) { if (x.rated && (felt == null || x.felt > felt)) felt = x.felt; });
    if (top) { top.felt = felt; out.top = top; out.w = top.w; }
    out.done = done.length; out.of = sets.length;
    var last = done[done.length - 1]; out.at = last && last.at ? last.at : null; out.on = (done[0] && done[0].on) || prev.on;
    return out;
  }
  /* the keys a line's first set carries beyond round 4's (a back-off only under a top set; a tempo or pause only where
     this week's differs from the line's own) */
  function extOf(s0, li, row, cell) {
    var ext = {};
    if (s0.rHi != null && cell.rHi == null && s0.rHi > cell.r) ext.rHi = s0.rHi;
    if (s0.off != null && li > 0) ext.off = s0.off;
    if (s0.until != null) ext.until = s0.until;
    if (s0.amrap) ext.amrap = true;
    if (s0.tempo && row.tempo && String(s0.tempo) !== row.tempo) ext.tempo = String(s0.tempo);
    if (s0.pause && row.pause && s0.pause !== row.pause) ext.pause = s0.pause;
    if (s0.rir === true && cell.rpe != null) ext.rir = true;
    else if (isNum(s0.rir) && cell.rpe == null && s0.rir >= 0 && s0.rir <= 9) { ext.rpe = 10 - s0.rir; ext.rir = true; }
    if (isNum(s0.pctHi) && cell.pct != null && s0.pctHi > cell.pct) ext.pctHi = s0.pctHi;
    var wh = s0.wHi != null ? s0.wHi : s0.weightHi; if (isNum(wh) && cell.w != null && wh > cell.w) ext.wHi = wh;
    return ext;
  }
  /* those keys in the cell, where it says nothing of its own; a back-off from the top set has no load of its own */
  function joinExt(row, uid, ext) {
    var x = row.cells[uid], on = function (k) { return ext[k] != null && x[k] == null && (k !== 'rHi' || ext.rHi > x.r); };
    if (!x || !Object.keys(ext).some(on)) return;
    var y = {}, k; for (k in x) y[k] = x[k];
    for (k in ext) if (on(k)) y[k] = ext[k];
    if (ext.off != null && x.off == null) { delete y.w; delete y.wHi; }
    row.cells[uid] = stored(y);
  }
  /* the program read into the block's cells: each line's own keys and each lifted set. fresh: the whole reading (a
     block just built, or a draft saved before block.js kept them); else only lifted cells that lack their sets */
  function readProgram(b, p, fresh) {
    var byKey = {};
    b.rows.forEach(function (row) { byKey[row.key] = row; });
    if (p && p.weeks) p.weeks.forEach(function (w, wi) {
      var wk = b.weeks[wi]; if (!wk || !w || !w.days) return;
      var uid = wk.uid;
      w.days.forEach(function (d) {
        if (!d.exercises || !d.exercises.length) return;
        var seen = {};
        d.exercises.forEach(function (e) {
          var occ = seen[e.title] = (seen[e.title] || 0) + 1, ek = d.name + '|' + e.title + '|' + occ;
          groupsOf(e).forEach(function (g, li) {
            var row = byKey[ek + '|' + li], cell = row && row.cells[uid];
            if (!cell) return;
            if (fresh) { var ext = extOf(g.sets[0], li, row, cell); if (ext.off != null) row.base = 'top'; joinExt(row, uid, ext); cell = row.cells[uid]; }
            if (cell.lifted && !(cell.lifted.sets && !fresh)) cell.lifted = liftedOf(g.sets, cell.lifted);
          });
        });
      });
    });
    if (fresh) b.rows.forEach(function (row, r) {
      /* a line whose weeks to come all read the same is written "the same each week" (=), whatever the lifted weeks did */
      var fut = b.weeks.map(function (w, c) { return b.isRO(r, c) ? undefined : row.cells[w.uid] || null; }).filter(function (x) { return x !== undefined; });
      if (fut.length >= 2 && fut.every(function (x) { return x && text(cellOf(x)) === text(cellOf(fut[0])); })) row.prog = 'same';
      if (row.line && !row.base && b.weeks.some(function (w) { var x = row.cells[w.uid]; return x && x.off != null; })) row.base = 'top';
      /* spec C (F3.1, P26): a line written "N% off the top set" is the back-offs, by its label too (the load it carries
         from the program is 0 before the top set is worked out, so the reading above called it "Then") */
      if (row.line && row.base === 'top' && b.weeks.some(function (w) { var x = row.cells[w.uid]; return x && x.off > 0; })) row.label = 'Back-offs';
    });
  }
  var RANK = { over: 4, hard: 3, easy: 2, '': 1, none: 0 };
  function newWeek(uid, n) { return { uid: uid, n: n, state: 'next', sent: false, sentAt: null, version: 0, deload: false, pre: null, started: {}, was: null, taken: false, dates: {}, off: {} }; }
  function build(l) {
    if (!l || typeof l !== 'object') return null;
    var p = l.program;
    var o = { id: l.id || null, name: p ? p.name : 'New program', maxes: {}, today: {}, weeks: [], rows: [], days: [], seq: 0, start: p ? p.startsOn || null : null, perWeek: (l.week && l.week.perWeek) || 0 };
    if (p && p.defaults && typeof p.defaults === 'object') o.defaults = { prog: p.defaults.prog == null ? null : p.defaults.prog, deloadAt: p.defaults.deloadAt == null ? null : p.defaults.deloadAt };   /* LOGIC-FIX-3: a start's defaults (programs.start) */
    /* a max the coach typed is the program's (maxFrom 'typed'); else it comes from the lifting (maxFrom 'lifting'): the working
       e1RM rounded to the step (sheet-spec §11 "Max not set", §10.13: no number that cannot go on a bar), or today's e1RM
       rounded when no set counts. Then today says where it came from and carries the same number, so a page that compares
       the max with today reads it as not typed */
    o.maxFrom = {};
    LIFTS.forEach(function (L) {
      var t = todayE1(l, L), typed = p && p.maxes && p.maxes[L] ? p.maxes[L] : null;
      if (typed) { o.today[L] = t; o.maxes[L] = typed; o.maxFrom[L] = 'typed'; return; }
      var w = l && (l.program || l.logs) ? working(liftSets(l, L), K.today) : null;
      if (w) { var kg = round(w.kg); o.maxes[L] = kg; o.maxFrom[L] = 'lifting'; o.today[L] = { kg: kg, why: 'the working e1RM, ' + nf(Math.round(w.kg * 10) / 10) + ': ' + x3(nf(w.set.w), w.set.r) + ' at RPE ' + nf(w.set.felt) + ' ' + K.when(w.on) }; return; }
      if (t) { var k2 = round(t.kg); o.maxes[L] = k2; o.maxFrom[L] = 'lifting'; o.today[L] = { kg: k2, why: t.why }; return; }
      o.today[L] = null; o.maxes[L] = null; o.maxFrom[L] = null;
    });
    if (!p) return new Block(o);
    var rowBy = {}, exIdx = {}, dayIdx = {}, nEx = 0;
    p.weeks.forEach(function (w, wi) {
      var sent = w.published !== false;
      var wk = { uid: 'w' + (++o.seq), n: w.n || wi + 1, state: wi < p.weekIdx ? 'lifted' : wi === p.weekIdx ? 'now' : 'next', sent: sent, sentAt: w.sentAt || null, version: isNum(w.version) ? w.version : sent ? 1 : 0, deload: false, pre: null, started: {}, was: null, taken: false, dates: {}, off: {} };
      if (kindOf(w.kind)) wk.kind = kindOf(w.kind);   /* spec C: the week's phase (first-time-coach §7.1) */
      o.weeks.push(wk);
      (w.days || []).forEach(function (d) {
        var hasEx = d.exercises && d.exercises.length;
        if (!hasEx && /^rest\b/i.test(d.name || '')) return;                 // a rest day
        if (dayIdx[d.name] == null) { dayIdx[d.name] = o.days.length; o.days.push({ name: d.name, wd: d.date ? K.d(String(d.date).slice(0, 10)).getDay() : null }); }
        else if (o.days[dayIdx[d.name]].wd == null && d.date) o.days[dayIdx[d.name]].wd = K.d(String(d.date).slice(0, 10)).getDay();
        if (!hasEx) return;
        if (d.date) wk.dates[d.name] = String(d.date).slice(0, 10);    /* one date per session (programs §6.7) */
        /* LOGIC-FIX-4 (walk 2, Kofi): the week's own dates as the store gives them (w.dates) when the day carries none, so a
           this-week move (Deadlift Day Sat 14) never drags the weeks after it (Fri 20 stays Fri 20) */
        else if (w.dates && typeof w.dates === 'object' && isIso(String(w.dates[d.name] || '').slice(0, 10))) wk.dates[d.name] = String(w.dates[d.name]).slice(0, 10);
        var started = wk.state === 'lifted' || (wk.state === 'now' && d.done > 0), seen = {};
        if (started) wk.started[d.name] = 1;
        d.exercises.forEach(function (e) {
          var occ = seen[e.title] = (seen[e.title] || 0) + 1, ek = d.name + '|' + e.title + '|' + occ;
          if (exIdx[ek] == null) exIdx[ek] = nEx++;
          groupsOf(e).forEach(function (g, li) {
            var key = ek + '|' + li, row = rowBy[key], s0 = g.sets[0];
            if (!row) { row = rowBy[key] = { key: key, day: d.name, ex: exIdx[ek], line: li, title: e.title, name: nameOf(e), label: '', lift: MAIN[e.lift] ? e.lift : null, cat: e.lift || null, variant: MAIN[e.lift] ? e.variant || 'Competition' : '', note: e.note || '', pause: 0, tempo: '', prog: 'same', cells: {} }; o.rows.push(row); }
            if (s0.pause && !row.pause) row.pause = s0.pause; if (s0.tempo && !row.tempo) row.tempo = String(s0.tempo);
            var c = plain({ n: g.sets.length, r: g.r, pct: g.pct, rpe: g.rpe, rpeHi: g.rpeHi, w: g.pct == null && g.w > 0 ? g.w : null });
            if (started) {
              var done = g.sets.filter(function (s) { return s.done; }), kind = null, felt = null;
              done.forEach(function (s) { var k = K.feltOf(s); if (k == null) return; if (kind == null || RANK[k] > RANK[kind] || (RANK[k] === RANK[kind] && s.felt != null && s.felt > felt)) { kind = k; felt = s.felt == null ? null : s.felt; } });
              c.lifted = { of: g.sets.length, done: done.length, w: g.w || 0, kind: kind, felt: felt, on: String((done[0] && done[0].on) || d.date || '').slice(0, 10) };
              if (done.some(function (s) { return s.by === 'coach'; }) || (d.by === 'coach' && done.length)) c.lifted.by = 'coach';
            }
            row.cells[wk.uid] = c;
            /* FIX-LOGIC (build C walk 2): a check the starter settled for its own pick (program week kept: [{ day, title,
               line, kind }], from the fitted block) stays settled on the line it names */
            if (Array.isArray(w.kept)) w.kept.forEach(function (k) { if (k && k.day === d.name && k.title === e.title && (k.line || 0) === li && typeof k.kind === 'string') { wk.kept = wk.kept || {}; wk.kept[key + '|' + k.kind] = 1; } });
          });
        });
      });
    });
    o.rows.sort(function (a, b) { return dayIdx[a.day] - dayIdx[b.day] || a.ex - b.ex || a.line - b.line; });
    o.rows.forEach(function (row) {
      /* a row whose weeks to come carry no fixed load is written by RPE: the loads in its lifted weeks were the lifter's */
      var fut = o.weeks.map(function (w) { return row.cells[w.uid]; }).filter(function (c) { return c && !c.lifted; });
      if (fut.length && !fut.some(function (c) { return c.w != null; })) o.weeks.forEach(function (w) { var c = row.cells[w.uid]; if (c && c.lifted && c.rpe != null) delete c.w; });
      row.prog = detect(row, o.weeks);
      if (row.line) {
        var first = rowBy[row.key.slice(0, row.key.lastIndexOf('|')) + '|0'], lab = 'Then';
        o.weeks.some(function (w) { var a = first && first.cells[w.uid], b = row.cells[w.uid]; if (!a || !b) return false; var la = a.lifted ? a.lifted.w : a.w, lb = b.lifted ? b.lifted.w : b.w; if ((la && lb && lb < la) || (!(la && lb) && a.rpe != null && b.rpe != null && b.rpe < a.rpe)) lab = 'Back-offs'; return true; });
        row.label = lab;
      }
    });
    /* the weekday of a day that was never dated: the intake's training days, in order */
    var iw = ((l.intake && l.intake.days) || []).map(function (x) { return WD3[x]; }).filter(function (x) { return x != null; });
    o.days.forEach(function (d, i) { if (d.wd == null && iw[i] != null) d.wd = iw[i]; });
    if (!o.perWeek) o.perWeek = o.days.length;
    var d1 = p.weeks[0] && p.weeks[0].days.filter(function (d) { return d.date; })[0]; if (d1) o.start = String(d1.date).slice(0, 10);
    var b = new Block(o);
    readProgram(b, p, true);
    return b;
  }
  function blank(l, opt) {
    opt = opt || {};
    var b = build({ id: l && l.id, lifts: l && l.lifts, intake: l && l.intake, program: null, week: null });
    var iw = ((l && l.intake && l.intake.days) || []).map(function (x) { return WD3[x]; }).filter(function (x) { return x != null; });
    var nd = opt.days || iw.length || 3, wds = iw.length ? iw : [1, 3, 5];
    b.name = opt.name || 'New program';
    for (var i = 0; i < nd; i++) b.days.push({ name: 'Day ' + (i + 1), wd: wds[i] != null ? wds[i] : null });
    b.weeks.push(newWeek('w' + (++b.seq), 1));
    b.perWeek = nd;
    return b;
  }
  /* a draft saved before block.js kept every key (v 1): the Sheet kept a cell's other words beside it (row.px) and each
     sent week's text on its rows (row.sx). Both go where they live now: into the cell, and onto the week (week.was) */
  function upgrade(b, id) {
    var sheetRead = b.rows.some(function (row) { return row.v6; });
    if (sheetRead) {
      b.rows.forEach(function (row) { if (row.px) Object.keys(row.px).forEach(function (uid) { if (row.cells[uid] && row.px[uid]) joinExt(row, uid, row.px[uid]); }); });
      b.weeks.forEach(function (w) {
        var was = null; b.rows.forEach(function (row) { if (row.sx && row.sx[w.uid] !== undefined) { was = was || {}; was[row.key] = row.sx[w.uid]; } });
        w.was = was; w.taken = !!(w.sent && was);
      });
      b.rows.forEach(function (row) { delete row.px; delete row.sx; delete row.v6; });
    }
    var l = id != null && K.L ? K.L(id) : null;
    if (l && l.program) readProgram(b, l.program, !sheetRead);
  }
  /* from block JSON (toJSON), or from a program as PL.programs.get answers one ({ lifterId, name, maxes, weeks: [{ days }] }) */
  function from(json) {
    if (!json || typeof json !== 'object') return null;
    if (Array.isArray(json.rows) && Array.isArray(json.weeks)) {
      var o = clone(json);
      var bb = new Block({ id: o.id == null ? null : o.id, name: o.name || 'Program', maxes: o.maxes || {}, maxFrom: o.maxFrom || null, today: o.today || {}, weeks: o.weeks, rows: o.rows, days: o.days || [], seq: o.seq || 0, start: o.start || null, perWeek: o.perWeek || 0, steps: o.steps, defaults: o.defaults, rules: o.rules, deloadKind: o.deloadKind, kind: o.blockKind || null, meet: o.meet });
      if (!(o.v >= 2)) upgrade(bb, o.id);
      return bb;
    }
    if (Array.isArray(json.weeks)) {
      var src = json.lifterId && K.L ? K.L(json.lifterId) : null;
      var b = build({ id: json.lifterId || (src && src.id) || null, program: clone(json), lifts: src ? src.lifts : null, logs: src ? src.logs : null, intake: src ? src.intake : null, week: src ? src.week : null });   /* the logs too: the working e1RM reads every rated set (§6.4) */
      if (json.maxes) LIFTS.forEach(function (L) { if (json.maxes[L] != null) { b.maxes[L] = json.maxes[L]; b.maxFrom[L] = json.maxFrom && json.maxFrom[L] === 'lifting' && b.today[L] && b.today[L].kg === json.maxes[L] ? 'lifting' : 'typed'; } });
      return b;
    }
    return null;
  }

  /* ================= next week from what was lifted: the coach's rules (sheet-spec M8, §7 B) ================= */
  var DEFAULT_RULES = [
    { rel: true, easier: 1, add: 5, text: 'When the top set feels a point or more easier than written, add 5 kg' },
    { rel: true, within: 0.5, add: 2.5, text: 'When it feels as written, within half a point, add 2.5 kg' },
    { rel: true, harder: 1, keep: true, text: 'When it feels a point or more harder, keep the load' }
  ];
  function rules() {
    var out = [];
    ((D && D.rules) || []).forEach(function (t) {
      var m;
      if ((m = /feels? (?:rpe )?([\d.]+) or easier,? add ([\d.]+) ?kg/i.exec(t))) out.push({ max: +m[1], add: +m[2], text: t });
      else if ((m = /feels? (?:rpe )?([\d.]+) or harder,? take ([\d.]+) ?% off/i.exec(t))) out.push({ min: +m[1], offPct: +m[2], text: t });
    });
    return out.length ? out : DEFAULT_RULES;
  }
  function draftFor(row, cell, prev) {
    var lt = prev.lifted, top = lt && lt.top; if (!top || !top.w) return null;
    if (cell.rHi != null) {                                     /* a rep range: double progression */
      var sets = (lt.sets || []).filter(function (s) { return !s.skipped; }), hi = prev.rHi != null ? prev.rHi : cell.rHi;
      var tgt = prev.rpe != null ? (prev.rpeHi != null ? prev.rpeHi : prev.rpe) : null;
      if (!sets.length || !sets.every(function (s) { return s.r >= hi && (tgt == null || !s.rated || s.felt <= tgt); })) return null;
      var base = sets.reduce(function (m, s) { return Math.max(m, s.w || 0); }, 0) || cell.w, kg = r2(base + STEP);
      if (!(kg > cell.w)) return null;
      return { kg: kg, from: base, keep: cell.w, why: 'Every set hit ' + hi + ' at ' + nf(base) + '. Up ' + nf(STEP) + ' by your rule.', rule: 'double' };
    }
    if (cell.rpe == null || top.felt == null) return null;      /* nothing to judge it by, or not rated: no draft */
    var rs = rules(), wr = prev.rpe != null ? effRpe(prev) : null;
    for (var i = 0; i < rs.length; i++) {
      var ru = rs[i], hit = false;
      if (ru.rel) { if (wr == null) continue; var d = top.felt - wr; hit = ru.easier != null ? d <= -ru.easier : ru.within != null ? Math.abs(d) <= ru.within : ru.harder != null ? d >= ru.harder : false; }
      else hit = ru.max != null ? top.felt <= ru.max : ru.min != null ? top.felt >= ru.min : false;
      if (!hit) continue;
      var said = x3(nf(top.w), top.r) + ' felt ' + nf(top.felt) + '. ';
      if (ru.add != null) { var cap = ru.rel ? round(top.w * 1.025 - 1e-9, STEP) : null, a = r2(top.w + ru.add); if (cap != null && a > cap) a = Math.max(r2(top.w + STEP), Math.min(a, cap)); if (!(a > cell.w)) return null; return { kg: a, from: top.w, keep: cell.w, why: said + 'Up ' + nf(r2(a - top.w)) + ' by your rule.', rule: ru.text }; }
      if (ru.offPct != null) { var o = round(top.w * (1 - ru.offPct / 100)); if (!(o < cell.w)) return null; return { kg: o, from: top.w, keep: cell.w, why: said + nf(ru.offPct) + '% off by your rule.', rule: ru.text }; }
      if (ru.keep) { if (!(top.w < cell.w)) return null; return { kg: top.w, from: top.w, keep: cell.w, why: said + 'Your rule keeps the load.', rule: ru.text }; }
    }
    return null;
  }

  /* ================= a block ================= */
  function Block(o) {
    this.id = o.id; this.name = o.name; this.maxes = { squat: o.maxes.squat == null ? null : o.maxes.squat, bench: o.maxes.bench == null ? null : o.maxes.bench, deadlift: o.maxes.deadlift == null ? null : o.maxes.deadlift };
    /* which maxes the coach typed: 'typed' | 'lifting' | null (a block saved before maxFrom: typed unless it is today's number) */
    var mf = o.maxFrom || {}, td = o.today || {}, self0 = this; this.maxFrom = {};
    LIFTS.forEach(function (L) { var m = self0.maxes[L]; self0.maxFrom[L] = m == null ? null : mf[L] === 'typed' || mf[L] === 'lifting' ? mf[L] : td[L] && td[L].kg === m ? 'lifting' : 'typed'; });
    this.today = o.today || {}; this.weeks = o.weeks; this.rows = o.rows; this.days = o.days || []; this.seq = o.seq || 0; this.start = o.start || null; this.perWeek = o.perWeek || this.days.length;
    /* spec B (13 Nov): steps per lift, the block's defaults for new lines and weeks, this lifter's own rules, the deload
       kind, what kind of block it is ('recovery' | 'runin' | null) and the meet it runs to */
    /* the plate step: the block's own, else the coach's (D.coach.plateStep: 2.5, 1.25 or 0.5, Settings), else 2.5 (request #49) */
    var st = o.steps || {}, ps = D && D.coach && [2.5, 1.25, 0.5].indexOf(D.coach.plateStep) >= 0 ? D.coach.plateStep : STEP;
    this.steps = { squat: isNum(st.squat) && st.squat > 0 ? st.squat : ps, bench: isNum(st.bench) && st.bench > 0 ? st.bench : ps, deadlift: isNum(st.deadlift) && st.deadlift > 0 ? st.deadlift : ps };
    this.defaults = o.defaults ? clone(o.defaults) : { prog: null, deloadAt: null };
    this.rules = o.rules ? clone(o.rules) : null; this.deloadKind = o.deloadKind || null; this.kind = o.kind || null; this.meet = o.meet ? clone(o.meet) : null;
    if (!this.days.length) { var seen = {}, self = this; this.rows.forEach(function (r) { if (!seen[r.day]) { seen[r.day] = 1; self.days.push({ name: r.day, wd: null }); } }); }
    this.weeks.forEach(function (w) { if (!w.started) w.started = {}; if (w.pre === undefined) w.pre = null; if (w.was === undefined) w.was = null; if (w.taken === undefined) w.taken = false; if (w.sentAt === undefined) w.sentAt = null; if (w.version === undefined) w.version = w.sent ? 1 : 0; if (!w.dates) w.dates = {}; if (!w.off) w.off = {}; });
    Object.defineProperty(this, '_undo', { value: [], writable: true });
    Object.defineProperty(this, '_redo', { value: [], writable: true });
  }
  var P = Block.prototype;
  P.snap = function () { return JSON.stringify({ name: this.name, maxes: this.maxes, maxFrom: this.maxFrom, weeks: this.weeks, rows: this.rows, days: this.days, steps: this.steps, defaults: this.defaults, rules: this.rules, deloadKind: this.deloadKind, start: this.start, seq: this.seq, meet: this.meet }); };
  P.restore = function (j) { var o = JSON.parse(j); this.name = o.name; this.maxes = o.maxes; this.maxFrom = o.maxFrom || {}; this.weeks = o.weeks; this.rows = o.rows; this.days = o.days; if (o.steps) this.steps = o.steps; if (o.defaults) this.defaults = o.defaults; this.rules = o.rules || null; this.deloadKind = o.deloadKind || null; this.start = o.start || null; if (o.seq != null) this.seq = Math.max(this.seq, o.seq); this.meet = o.meet || null; };
  /* what a sent week holds, by row key: taken once a send, before the first write after it, so a change is counted against
     what the lifter has (b.changes); a line added after the send is not in it, as the round-6 Sheet kept it */
  P.texts = function (uid) {
    var o = {}, self = this, c = -1; this.rows.forEach(function (row) { o[row.key] = sig(row.cells[uid] || null); });
    this.weeks.forEach(function (w, i) { if (w.uid === uid) c = i; });
    if (c >= 0 && typeof this.dateOf === 'function') this.days.forEach(function (d) { o['@' + d.name] = self.daySig(c, d.name); });
    return o;
  };
  P.daySig = function (c, day) { var w = this.weeks[c]; return w && w.off && w.off[day] ? 'off' : this.dateOf(c, day); };
  P.keepSent = function () { var self = this; this.weeks.forEach(function (w) { if (w.sent && w.state !== 'lifted' && !(w.was && w.taken)) { w.was = self.texts(w.uid); w.taken = true; } }); };
  /* every write goes through here: a refusal leaves the block as it was; a change is one step back; no change, no step */
  P.commit = function (label, fn) {
    this.keepSent();
    var before = this.snap(), res;
    try { res = fn.call(this) || {}; } catch (e) { this.restore(before); throw e; }
    if (res.error) { this.restore(before); return res; }
    this.weeks.forEach(function (w) { if (!w.sent && w.taken) w.taken = false; });   /* changed since its send: the next send takes it anew */
    var data = res.data || {};
    if (this.snap() === before) { data.changed = false; return { data: data }; }
    this._undo.push({ label: label, before: before }); if (this._undo.length > 400) this._undo.shift();
    this._redo = [];
    data.changed = true; data.label = label;
    return { data: data, label: label };
  };
  /* several public writes as one undo step (request #17): b.batch('Paste 6 cells', function (b) { b.set(..); b.set(..); }).
     The inner writes' own steps fold into this one; a batch that changed nothing leaves no step */
  P.batch = function (label, fn) {
    var st = this._undo, n0 = st.length, self = this;
    var res = this.commit(label, function () { var r = fn.call(self, self); return r && r.error ? r : { data: (r && r.data) || {} }; });
    if (this._undo === st) { if (res && res.data && res.data.changed) { if (st.length > n0 + 1) st.splice(n0, st.length - n0 - 1); } else if (st.length > n0) st.splice(n0); }
    return res;
  };
  P.undo = function () { var u = this._undo.pop(); if (!u) return refuse('nothing_to_undo', 'Nothing to undo.'); this._redo.push({ label: u.label, before: this.snap() }); this.restore(u.before); return { data: { label: 'Undone: ' + u.label + '.' }, label: u.label }; };
  P.redo = function () { var u = this._redo.pop(); if (!u) return refuse('nothing_to_undo', 'Nothing to redo.'); this._undo.push({ label: u.label, before: this.snap() }); this.restore(u.before); return { data: { label: 'Redone: ' + u.label + '.' }, label: u.label }; };
  P.history = function () { var u = this._undo[this._undo.length - 1], r = this._redo[this._redo.length - 1]; return { undo: u ? u.label : null, redo: r ? r.label : null, steps: this._undo.length }; };
  P.newWeek = function (n) { return newWeek('w' + (++this.seq), n); };
  P.weekByUid = function (uid) { for (var i = 0; i < this.weeks.length; i++) if (this.weeks[i].uid === uid) return this.weeks[i]; return null; };
  /* the step a line's loads round to: its lift's (b.steps, programs §6.9), else 2.5 */
  P.stepFor = function (row) { var s0 = row && row.lift && this.steps ? this.steps[row.lift] : null; return isNum(s0) && s0 > 0 ? s0 : STEP; };

  /* ---------------- reading ---------------- */
  P.raw = function (r, c) { var row = this.rows[r], w = this.weeks[c]; return (row && w && row.cells[w.uid]) || null; };
  P.isRO = function (r, c) { var w = this.weeks[c], row = this.rows[r]; if (!w || !row) return true; return w.state === 'lifted' || (w.state === 'now' && !!w.started[row.day]); };
  /* the top-set line above a back-off line (line 0 of the same exercise) */
  P.topRow = function (row) { if (!row || !row.line) return null; for (var i = 0; i < this.rows.length; i++) { var x = this.rows[i]; if (x.day === row.day && x.ex === row.ex && x.line === 0) return x; } return null; };
  /* the max a line's week works from: one pinned to that week by a re-base, else the block's */
  P.rowMax = function (row, uid) { var m = row.mx && uid && row.mx[uid] != null ? row.mx[uid] : row.lift ? this.maxes[row.lift] : null; return isNum(m) && m > 0 ? m : null; };
  /* THE ENGINE: a load, whoever asks (paper: a lifted cell as it was written) */
  function engine(b, row, cell, uid, paper) {
    var L = engine0(b, row, cell, uid, paper);
    /* a sent week keeps its loads as numbers (b.lock, shared.md §4.11): a new max moves weeks not sent */
    if (cell && !cell.lifted && cell.w == null && L.kg != null && !paper && uid) {
      var wk = b.weekByUid(uid), lk = wk && wk.lock ? wk.lock[row.key] : null;
      if (isNum(lk)) { L = clone(L); L.kg = lk; L.locked = true; delete L.kgHi; }
    }
    return L;
  }
  function engine0(b, row, cell, uid, paper) {
    if (!cell) return { kind: 'none', kg: null };
    if (cell.lifted && !paper) return { kind: 'lifted', kg: cell.lifted.top ? cell.lifted.top.w || null : cell.lifted.w || null };
    if (cell.w != null) return { kind: 'typed', kg: cell.w, kgHi: cell.wHi != null ? cell.wHi : null };
    var sp = b.stepFor(row);
    if (cell.off != null) {
      var tr = b.topRow(row), tc = tr && uid ? tr.cells[uid] || null : null;
      if (!tc) return { kind: 'feel', kg: null };
      var tl = tc.lifted && !paper ? (tc.lifted.top ? tc.lifted.top.w : tc.lifted.w) : engine(b, tr, tc, uid, paper).kg;
      if (tl == null) return { kind: row.lift ? 'nomax' : 'feel', kg: null };
      return { kind: 'top', kg: round(tl * (1 - cell.off / 100), sp), top: tl, topLifted: !!(tc.lifted && !paper) };
    }
    if (row.lift && MAIN[row.lift]) {
      /* a variant's own max (row.max, shared.md §4.14) works at ratio 1; else the lift's max ÷ the variant's ratio */
      var own = isNum(row.max) && row.max > 0 ? row.max : null, mx = own || b.rowMax(row, uid);
      if (cell.pct != null) { if (!mx) return { kind: 'nomax', kg: null }; return { kind: 'pct', kg: round(mx * cell.pct / 100, sp), kgHi: cell.pctHi != null ? round(mx * cell.pctHi / 100, sp) : null, mx: mx }; }
      if (cell.rpe != null && cell.r != null) { if (!mx) return { kind: 'nomax', kg: null }; var f = own ? 1 : factorOf(row), p = pct(effReps(cell), effRpe(cell)); return { kind: 'rpe', kg: round(mx / f * p, sp), mx: mx, f: f, p: p, own: !!own }; }
    }
    return { kind: 'feel', kg: null };
  }
  function uidOf(row, cell) { if (!cell) return null; for (var k in row.cells) if (row.cells[k] === cell) return k; return null; }
  /* a load for a line's cell; uid names its week when the cell is not the one the block holds there */
  P.loadAt = function (row, cell, uid, paper) { return engine(this, row, cell, uid != null ? uid : uidOf(row, cell), !!paper); };
  P.load = function (r, c, o) { var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return { kind: 'none', kg: null }; return engine(this, row, row.cells[w.uid] || null, w.uid, !!(o && o.paper)); };
  /* a cell as typed, not yet kept: the load it would work out to in that place */
  P.loadFor = function (r, c, cell) {
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w || !cell) return { kind: 'none', kg: null };
    var u = w.uid, was = row.cells[u]; row.cells[u] = cell;
    try { return engine(this, row, cell, u, true); } finally { if (was === undefined) delete row.cells[u]; else row.cells[u] = was; }
  };
  /* what was on paper for a lifted cell: the phone's own plan when it is known, else the engine on what was written */
  P.paper = function (r, c) {
    var x = this.raw(r, c); if (!x) return null;
    var lt = x.lifted, pl = lt && lt.sets ? lt.sets.filter(function (s) { return s.plan != null; })[0] : null;
    if (pl) return pl.plan;
    return this.load(r, c, { paper: true }).kg;
  };
  P.cell = function (r, c) {
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return null;
    var x = row.cells[w.uid] || null, L = this.loadAt(row, x, w.uid), cx = cellOf(x), out = { text: text(cx), kg: L.kg == null ? null : L.kg, kind: L.kind, ro: this.isRO(r, c), rx: cx };
    if (L.kgHi != null) out.kgHi = L.kgHi;
    if (x && x.lifted) out.lifted = clone(x.lifted);
    return out;
  };
  P.label = function (r) { var row = this.rows[r]; return row ? row.name + (row.line ? ', ' + String(row.label || 'then').toLowerCase() : '') : ''; };
  P.where = function (r, c) { return 'week ' + (c + 1) + ', ' + this.label(r); };
  /* what the language reads beside a cell: the cell to its left and that cell's load, its line and its answers */
  P.ctxFor = function (r, c) {
    var row = this.rows[r], o = { line: row ? row.line : 0, hasTop: !!this.topRow(row), ask: row && row.ask ? row.ask : null };
    if (c > 0) { var left = this.raw(r, c - 1); if (left) { o.left = cellOf(left); o.leftLoad = left.lifted ? (left.lifted.top ? left.lifted.top.w : null) : this.load(r, c - 1).kg; } }
    return o;
  };
  P.srcLoad = function (row, cell) { return cell.lifted ? (cell.lifted.w || null) : this.loadAt(row, cell).kg; };
  /* one cell, inside a commit only: a change marks the week unsent and clears what the Sheet kept for that cell */
  P.put = function (r, c, cell) {
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return false;
    var u = w.uid, was = row.cells[u] || null, now = cell ? cellOf(cell) : null;
    if (JSON.stringify(was ? cellOf(was) : null) === JSON.stringify(now) && !(row.bad && row.bad[u] != null)) return false;
    if (now) row.cells[u] = now; else delete row.cells[u];
    if (row.bad) delete row.bad[u];
    if (row.nod) delete row.nod[u];
    if (w.lock) delete w.lock[row.key];
    w.sent = false;
    return true;
  };
  P.range = function (rg) {
    if (!rg || typeof rg !== 'object') return null;
    var r0 = rg.r0, c0 = rg.c0, r1 = rg.r1 == null ? rg.r0 : rg.r1, c1 = rg.c1 == null ? rg.c0 : rg.c1;
    if ([r0, c0, r1, c1].some(function (x) { return !isNum(x) || x % 1; })) return null;
    if (r0 < 0 || c0 < 0 || r0 > r1 || c0 > c1 || r1 >= this.rows.length || c1 >= this.weeks.length) return null;
    return { r0: r0, c0: c0, r1: r1, c1: c1 };
  };
  var NORANGE = refuse('invalid', 'That range is not on the sheet.');
  P.loadMap = function () { var o = {}, self = this; this.weeks.forEach(function (w) { self.rows.forEach(function (row) { var c = row.cells[w.uid]; if (c && !c.lifted) { var L = self.loadAt(row, c, w.uid); o[row.key + '~' + w.uid] = L.kg != null ? L.kg : L.kind; } }); }); return o; };
  /* the sum behind a load, in words (the Builder's sum line) */
  P.explain = function (r, c) {
    var row = this.rows[r], x = this.raw(r, c); if (!row || !this.weeks[c]) return '';
    if (!x) return this.isRO(r, c) ? 'Nothing was written here.' : 'Empty. Type 3x5 @7, 3x4 70% or 3x5 100.';
    var lf = row.lift ? K.LIFT[row.lift].toLowerCase() : '', L = this.load(r, c), rx = text(cellOf(x));
    if (x.lifted) {
      var lt = x.lifted, said = { over: ', a point or more harder than written', hard: ', harder than written', easy: ', easier than written', '': ', as written', none: '' }[lt.kind || ''] || '';
      return lt.done ? 'Lifted ' + (lt.w ? nf(lt.w) + ' × ' : '') + x.r + (lt.felt != null ? ' at RPE ' + nf(lt.felt) : '') + said + (lt.done < lt.of ? ' (' + lt.done + ' of ' + lt.of + ' sets)' : '') + '. You wrote ' + rx + '.' : 'Not logged. You wrote ' + rx + '.';
    }
    if (L.kind === 'typed') return 'You typed ' + nf(L.kg) + ' ' + UNIT + '.' + (row.lift ? ' Clear the load and it is worked out from the ' + lf + ' max again.' : '');
    if (L.kind === 'pct') return nf(x.pct) + '% of the ' + nf(L.mx) + ' ' + UNIT + ' ' + lf + ' max: ' + nf(L.kg) + ' ' + UNIT + '.';
    if (L.kind === 'rpe') return plural(effReps(x), 'rep') + ' at RPE ' + nf(effRpe(x)) + ' is ' + nf(Math.round(L.p * 1000) / 10) + '% of the ' + nf(L.mx) + ' ' + UNIT + ' ' + lf + ' max' + (L.f !== 1 ? ', ' + Math.round((1 - 1 / L.f) * 100) + '% lighter for a ' + row.name.toLowerCase() : '') + ': ' + nf(L.kg) + ' ' + UNIT + '.';
    if (L.kind === 'top') return nf(L.kg) + ' ' + UNIT + ' on paper: ' + (x.off ? nf(x.off) + '% under the ' : 'the load of the ') + nf(L.top) + ' ' + UNIT + ' top set.';
    if (L.kind === 'nomax') return 'No ' + lf + ' max yet. Set one, or type a load.';
    return row.lift ? 'No RPE or percent, so no load is worked out. Type one, or leave it to feel.' : row.name + ' has no max: type a load, or leave it to feel.';
  };
  /* a week in numbers: sets, hard sets (RPE 7 and up) per lift, and each lift's top set against its max */
  P.stats = function (c) {
    var w = this.weeks[c]; if (!w) return null;
    var self = this, out = { c: c, n: w.n || c + 1, state: w.state, sets: 0, hard: { squat: 0, bench: 0, deadlift: 0, all: 0 }, top: { squat: null, bench: null, deadlift: null } };
    this.rows.forEach(function (row, r) {
      var x = row.cells[w.uid]; if (!x) return;
      out.sets += x.n;
      var rpe = x.lifted && x.lifted.felt != null ? x.lifted.felt : x.rpe;
      if (row.lift && rpe != null && rpe >= 7) { out.hard[row.lift] += x.n; out.hard.all += x.n; }
      if (row.lift) { var kg = self.cell(r, c).kg; if (kg != null) { var t = out.top[row.lift], mx = self.maxes[row.lift]; if (!t || kg > t.kg) out.top[row.lift] = { kg: kg, r: x.r, share: mx ? Math.round(kg / mx * 100) / 100 : null, row: r }; } }
    });
    return out;
  };
  /* the Builder's view of a day: its exercises, each with its lines (row indices) */
  P.exercises = function (day) {
    var out = [], by = {};
    this.rows.forEach(function (row, r) { if (row.day !== day) return; var e = by[row.ex]; if (!e) { e = by[row.ex] = { ex: row.ex, name: row.name, title: row.title, lift: row.lift, variant: row.variant, note: row.note, rows: [] }; out.push(e); } e.rows.push(r); });
    return out;
  };
  P.unsent = function () { var self = this, out = []; this.weeks.forEach(function (w, c) { if (w.state !== 'lifted' && !self.isSent(c) && self.rows.some(function (row) { return row.cells[w.uid]; })) out.push(c); }); return out; };
  P.copy = function (rg) {
    var b = this.range(rg); if (!b) return '';
    var out = [], r, c, ln; for (r = b.r0; r <= b.r1; r++) { ln = []; for (c = b.c0; c <= b.c1; c++) ln.push(text(cellOf(this.raw(r, c)))); out.push(ln.join('\t')); }
    return out.join('\n');
  };

  /* ---------------- what was lifted: its one mark (sheet-spec §5.4) ---------------- */
  /* ctx: { pain: [{ lift, day, sev, part }] } */
  P.mark = function (r, c, ctx) {
    var row = this.rows[r], x = this.raw(r, c); if (!row || !x || !x.lifted || !row.lift) return null;
    var lt = x.lifted, sets = lt.sets || [], done = sets.filter(function (s) { return !s.skipped; });
    var pain = ((ctx && ctx.pain) || []).filter(function (p) { return p.lift && String(p.lift).toLowerCase() === row.lift && p.day === lt.on && !row.line && (!row.variant || row.variant === 'Competition'); })[0];
    if (pain) return { kind: 'pain', text: 'pain ' + nf(pain.sev), label: 'pain ' + nf(pain.sev) + ' of 10, ' + low1(pain.part) };
    var short = 0; done.forEach(function (s) { var want = s.want != null ? s.want : x.r; if (s.r < want) short += want - s.r; });
    if (short) return { kind: 'short', text: short + ' short', label: plural(short, 'rep') + ' short' };
    if (sets.length && done.length < sets.length) return { kind: 'skipped', text: done.length + ' of ' + sets.length, label: done.length + ' of ' + sets.length + ' sets done' };
    var wr = x.rpe != null ? (x.rpeHi != null ? x.rpeHi : x.rpe) : null;
    if (wr != null && lt.top && lt.top.felt != null && lt.top.felt - wr >= 1) return { kind: 'over', text: '', label: 'felt ' + nf(lt.top.felt) + ', written ' + nf(wr) };
    var paper = this.paper(r, c);
    if (paper != null && lt.top && lt.top.w && Math.abs(lt.top.w - paper) > STEP + 1e-9) return { kind: 'off', text: signed(lt.top.w - paper), label: signed(lt.top.w - paper) + ' kg from the written load' };
    var ns = sets.filter(function (s) { return s.note || s.video; })[0];
    if (ns) return { kind: ns.video ? 'video' : 'note', text: '', label: ns.video ? 'a video' : 'a note' };
    return null;
  };

  /* ---------------- drafts, sends and the week's one fact (sheet-spec M8, M9, §5.7) ---------------- */
  P.writeCol = function () { for (var c = 0; c < this.weeks.length; c++) if (this.weeks[c].state === 'next') return c; return -1; };
  /* the drafts of a week: only the week to write, only where a rule changes what the week already says */
  P.drafts = function (c) {
    var out = {}, w = this.weeks[c], pw = this.weeks[c - 1], self = this;
    if (!w || !pw || c !== this.writeCol()) return out;
    this.rows.forEach(function (row, r) {
      var cell = row.cells[w.uid] || null, prev = row.cells[pw.uid] || null;
      if (!cell || !prev || !prev.lifted || cell.w == null || self.isRO(r, c) || (row.nod && row.nod[w.uid]) || (row.bad && row.bad[w.uid] != null)) return;
      var d = draftFor(row, cell, prev); if (d && d.kg !== cell.w) out[r] = d;
    });
    return out;
  };
  /* what changed since a week was sent: base says whether the week was sent at all */
  P.changes = function (c) {
    var w = this.weeks[c], n = 0, cells = [], base = false; if (!w) return { n: 0, cells: cells, base: false };
    if (w.sent) return { n: 0, cells: cells, base: w.state !== 'lifted' && this.rows.length > 0 };
    var was = w.was; if (!was) return { n: 0, cells: cells, base: false };
    this.rows.forEach(function (row, r) {
      if (was[row.key] === undefined) return;
      base = true;
      if (was[row.key] !== sig(row.cells[w.uid] || null)) { n++; cells.push(r); }
    });
    var self = this, days = [];
    this.days.forEach(function (d) { if (was['@' + d.name] !== undefined && was['@' + d.name] !== self.daySig(c, d.name)) { n++; days.push(d.name); } });
    var out = { n: n, cells: cells, base: base }; if (days.length) out.days = days;
    return out;
  };
  P.isSent = function (c) { var w = this.weeks[c]; if (!w) return false; var ch = this.changes(c); return ch.base ? !ch.n : !!w.sent; };
  /* the cell differs from what the lifter has */
  P.changed = function (r, c) { var row = this.rows[r], w = this.weeks[c]; if (!row || !w || w.sent || !w.was || w.was[row.key] === undefined) return false; return w.was[row.key] !== sig(row.cells[w.uid] || null); };
  /* the rows holding unread text in week c: a whole cell (row.bad) or one field of it (row.badf, request #16); either holds back Send */
  P.badIn = function (c) { var w = this.weeks[c], out = []; if (!w) return out; this.rows.forEach(function (row, r) { if ((row.bad && row.bad[w.uid] != null) || (row.badf && row.badf[w.uid] && Object.keys(row.badf[w.uid]).length)) out.push(r); }); return out; };
  P.weekStart = function (c) { return this.start ? K.add(this.start, 7 * c) : null; };
  /* o: { meet (its date), sentAt(c) } */
  P.weekFact = function (c, o) {
    o = o || {}; var w = this.weeks[c]; if (!w) return null;
    if (w.state === 'lifted') return { kind: 'lifted', text: 'Lifted' };
    if (w.state === 'now') return { kind: 'now', text: 'This week' };
    var cw = this.writeCol(), ch = this.changes(c), has = this.rows.some(function (row) { return row.cells[w.uid] || (row.bad && row.bad[w.uid] != null); });
    if (c === cw) { var dn = Object.keys(this.drafts(c)).length; if (dn) return { kind: 'drafts', text: 'Use ' + plural(dn, 'draft'), n: dn }; }
    if (ch.n) return { kind: 'changes', text: plural(ch.n, 'change') + ' to send', n: ch.n };
    if (!has) return { kind: 'towrite', text: 'To write' };
    if (c > cw && o.meet) { var dd = K.daysTo(o.meet) - K.daysTo(this.weekStart(c) || o.meet); if (dd >= 0 && dd < 7) return { kind: 'meet', text: 'Meet week' }; }
    if (w.deload) return { kind: 'deload', text: 'Deload' };
    if (c > cw && o.meet) { var wo = Math.floor((K.daysTo(o.meet) - K.daysTo(this.weekStart(c) || o.meet)) / 7); if (wo > 0) return { kind: 'out', text: plural(wo, 'week') + ' out' }; }
    if (!this.isSent(c)) return { kind: 'notsent', text: 'Not sent yet' };
    var at = o.sentAt ? o.sentAt(c) : w.sentAt || null;
    return { kind: 'sent', text: at ? 'Sent ' + K.wd3(String(at).slice(0, 10)) : 'Sent' };
  };
  /* what a new max moves: the weeks not sent yet (and, asked, the sent ones not lifted); typed, lifted and sent stay */
  P.rebasePreview = function (lift, kg, o) {
    o = o || {}; var b = this, was = b.maxes[lift], moves = [], typed = 0, c0 = -1, weeks = [];
    b.weeks.forEach(function (w, c) {
      if (w.state === 'lifted') return;
      var sent = b.isSent(c);
      if (sent && !o.withSent) return;
      if (c0 < 0 && !sent) c0 = c;
      weeks.push(c);
    });
    weeks.forEach(function (c) {
      b.rows.forEach(function (row, r) {
        if (row.lift !== lift || b.isRO(r, c)) return;
        var x = row.cells[b.weeks[c].uid]; if (!x) return;
        if (x.w != null) { typed++; return; }
        var A = b.load(r, c).kg; b.maxes[lift] = kg; var Z; try { Z = b.load(r, c).kg; } finally { b.maxes[lift] = was; }
        if (A != null && Z != null && A !== Z) moves.push({ r: r, c: c, was: A, now: Z });
      });
    });
    var d = moves.map(function (m) { return Math.abs(m.now - m.was); }), lo = d.length ? Math.min.apply(null, d) : 0, hi = d.length ? Math.max.apply(null, d) : 0, up = !moves.length || moves[0].now > moves[0].was;
    var n0 = c0 >= 0 ? b.weeks[c0].n : b.weeks.length + 1, keep = n0 > 1 ? (n0 === 2 ? 'Week 1 stays.' : 'Weeks 1 to ' + (n0 - 1) + ' stay.') : '';
    var words = K.LIFT[lift] + ' ' + nf(was) + ' → ' + nf(kg) + ' from week ' + n0 + '. ' + (moves.length ? plural(moves.length, 'load') + (moves.length === 1 ? ' goes ' : ' go ') + (up ? 'up ' : 'down ') + (lo === hi ? nf(hi) : nf(lo) + ' to ' + nf(hi)) + ' kg.' : 'No worked-out load moves.') + (typed ? ' ' + plural(typed, 'load') + ' you typed stay.' : '') + (keep ? ' ' + keep : '');
    return { from: c0, n0: n0, moves: moves, typed: typed, lo: lo, hi: hi, up: up, text: words };
  };

  /* ---------------- writing cells ---------------- */
  /* the lines of an exercise from line r on, made as they are needed (a cell holding several groups, D8) */
  P.lines = function (r, count) {
    var row = this.rows[r], rs = [];
    this.rows.forEach(function (x, i) { if (x.day === row.day && x.ex === row.ex) rs.push(i); });
    while (rs.length < count) {
      var last = rs[rs.length - 1], lr = this.rows[last], nl = lr.line + 1;
      var nr = { key: row.key.replace(/\|[^|]*$/, '') + '|n' + (++this.seq) + '|' + nl, day: row.day, ex: row.ex, line: nl, title: row.title, name: row.name, label: 'Back-offs', lift: row.lift, cat: row.cat, variant: row.variant, note: '', pause: row.pause || 0, tempo: row.tempo || '', prog: row.prog, base: 'top', cells: {} };
      this.rows.splice(last + 1, 0, nr);
      rs.push(last + 1);
    }
    return rs;
  };
  P.set = function (r, c, t) {
    if (!this.rows[r] || !this.weeks[c]) return refuse('invalid', 'There is no cell there.');
    if (this.isRO(r, c)) return refuse('locked', LIFTED);
    var res = parse(t, this.ctxFor(r, c)); if (!res.ok) return refuse('invalid', res.why);
    if (res.groups) return this.commit('Write ' + this.where(r, c), function () { var rs = this.lines(r, res.groups.length); res.groups.forEach(function (g, i) { this.put(rs[i], c, g); }, this); return { data: { r: r, c: c, lines: res.groups.length } }; });
    return this.commit('Write ' + this.where(r, c), function () { this.put(r, c, res.cell); return { data: { r: r, c: c, cell: this.cell(r, c) } }; });
  };
  P.clear = function (rg) {
    var b = this.range(rg); if (!b) return NORANGE;
    var k = 0, ro = 0, r, c;
    for (r = b.r0; r <= b.r1; r++) for (c = b.c0; c <= b.c1; c++) { if (!this.raw(r, c)) continue; if (this.isRO(r, c)) ro++; else k++; }
    if (!k) return ro ? refuse('locked', LIFTED) : { data: { cleared: 0, locked: 0, changed: false } };
    return this.commit('Clear ' + plural(k, 'cell'), function () { for (r = b.r0; r <= b.r1; r++) for (c = b.c0; c <= b.c1; c++) if (!this.isRO(r, c) && this.raw(r, c)) this.put(r, c, null); return { data: { cleared: k, locked: ro } }; });
  };
  P.paste = function (rg, tsv) {
    var b = this.range(rg); if (!b) return NORANGE;
    var t = String(tsv == null ? '' : tsv).replace(/\r\n?/g, '\n'); if (t.charAt(t.length - 1) === '\n') t = t.slice(0, -1);
    if (!t.replace(/\s/g, '')) return { data: { wrote: 0, locked: 0, bad: 0, past: 0, changed: false } };
    var grid = t.split('\n').map(function (ln) { return ln.split('\t'); }), single = grid.length === 1 && grid[0].length === 1, self = this;
    var tally = { wrote: 0, locked: 0, bad: 0, past: 0, badText: '', r0: b.r0, c0: b.c0, r1: b.r0, c1: b.c0 };
    var put = function (rr, cc, raw) {
      if (rr >= self.rows.length || cc >= self.weeks.length) { if (norm(raw)) tally.past++; return; }
      if (self.isRO(rr, cc)) { if (norm(raw) || self.raw(rr, cc)) tally.locked++; return; }
      var res = parse(raw, self.ctxFor(rr, cc)); if (!res.ok) { tally.bad++; tally.badText = tally.badText || String(raw).trim(); return; }
      self.put(rr, cc, res.cell); tally.wrote++; tally.r1 = Math.max(tally.r1, rr); tally.c1 = Math.max(tally.c1, cc);
    };
    var cells = single ? (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1) : grid.length * grid[0].length;
    return this.commit('Paste ' + (single ? 'into ' : '') + plural(cells, 'cell'), function () {
      var r, c;
      if (single) { for (r = b.r0; r <= b.r1; r++) for (c = b.c0; c <= b.c1; c++) put(r, c, grid[0][0]); }
      else grid.forEach(function (ln, i) { ln.forEach(function (raw, j) { put(b.r0 + i, b.c0 + j, raw); }); });
      if (!tally.wrote && tally.locked && !tally.bad) return refuse('locked', LIFTED);
      if (!tally.wrote && tally.bad) return refuse('invalid', 'Did not understand “' + tally.badText + '”' + (tally.bad > 1 ? ' and ' + (tally.bad - 1) + ' more.' : '.') + ' ' + HELP);
      return { data: tally };
    });
  };
  /* rows b.r0..b.r1: the cell in week cs written on through week ce, each row by its own progression */
  /* b.fill(range, field, text): one field into every cell of the range (spec B); b.fill(range, c0, c1, label) is the span fill */
  P.fill = function (a, b2, c2, d2) { if (typeof b2 === 'string') return this.fillField(a, b2, c2); return this.fillSpan(a, b2, c2, d2); };
  P.fillSpan = function (b, cs, ce, label) {
    var tally = { wrote: 0, locked: 0 };
    return this.commit(label, function () {
      for (var r = b.r0; r <= b.r1; r++) {
        var row = this.rows[r], src = this.raw(r, cs), base = src ? this.srcLoad(row, src) : null;
        for (var c = cs + 1; c <= ce; c++) { if (this.isRO(r, c)) { tally.locked++; continue; } this.put(r, c, src ? stepOf(row, src, c - cs, base) : null); tally.wrote++; }
      }
      if (!tally.wrote && tally.locked) return refuse('locked', LIFTED);
      return { data: tally };
    });
  };
  P.fillRight = function (rg) {
    var b = this.range(rg); if (!b) return NORANGE;
    if (b.c0 === b.c1) { if (b.c0 === 0) return refuse('invalid', 'Nothing to the left to fill from.'); return this.fillSpan(b, b.c0 - 1, b.c0, 'Fill ' + 'week ' + (b.c0 + 1) + ' from week ' + b.c0); }
    return this.fillSpan(b, b.c0, b.c1, 'Fill weeks ' + (b.c0 + 2) + ' to ' + (b.c1 + 1) + ' from week ' + (b.c0 + 1));
  };
  P.fillDown = function (rg) {
    var b = this.range(rg); if (!b) return NORANGE;
    var src = b.r0, targets = [], r;
    if (b.r0 === b.r1) { if (b.r0 === 0) return refuse('invalid', 'Nothing above to fill from.'); src = b.r0 - 1; targets = [b.r0]; }
    else for (r = b.r0 + 1; r <= b.r1; r++) targets.push(r);
    var tally = { wrote: 0, locked: 0 };
    return this.commit('Fill down from ' + this.label(src), function () {
      for (var c = b.c0; c <= b.c1; c++) {
        var s = this.raw(src, c);
        targets.forEach(function (t) { if (this.isRO(t, c)) { if (s || this.raw(t, c)) tally.locked++; return; } this.put(t, c, s ? cellOf(s) : null); tally.wrote++; }, this);
      }
      if (!tally.wrote && tally.locked) return refuse('locked', LIFTED);
      return { data: tally };
    });
  };

  /* ---------------- weeks ---------------- */
  P.addWeek = function () {
    var C = this.weeks.length, last = this.weeks[C - 1], nw = this.newWeek(C + 1);
    return this.commit('Add week ' + (C + 1), function () {
      this.weeks.push(nw);
      if (last) this.rows.forEach(function (row) { if (row.only) return; var s = (last.deload && last.pre && last.pre[row.key]) || row.cells[last.uid]; if (s) row.cells[nw.uid] = cellOf(stepOf(row, s, 1, this.srcLoad(row, s))); }, this);
      if (this.defaults && this.defaults.deloadAt === nw.n) {                       /* the block's deload week (b.defaults) */
        var kd = deloadKindOf(this), pre = {}, self = this;
        this.rows.forEach(function (row) { var x = row.cells[nw.uid]; if (!x) return; pre[row.key] = cellOf(x); row.cells[nw.uid] = deloadCell(x, kd, self.stepFor(row)); });
        nw.deload = true; nw.pre = pre; nw.deloadKind = kd;
      }
      return { data: { c: C } };
    });
  };
  P.removeWeek = function (c) {
    var w = this.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (w.state !== 'next') return refuse('locked', w.state === 'now' ? 'This week is under way. It stays.' : 'Week ' + (c + 1) + ' was lifted. It stays.');
    return this.commit('Remove week ' + (c + 1), function () { this.weeks.splice(c, 1); this.rows.forEach(function (row) { delete row.cells[w.uid]; }); this.weeks.forEach(function (x, i) { x.n = i + 1; }); return { data: { c: c } }; });
  };
  P.writeFrom = function (c, opt) {
    opt = opt || {};
    var w = this.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    var fc = opt.from != null ? Number(opt.from) : c - 1;
    if (c === 0 && opt.from == null) return refuse('invalid', 'Week 1 has no week before it.');
    if (!(fc >= 0 && fc < c) || !this.weeks[fc]) return refuse('invalid', 'Write a week from an earlier one.');
    if (w.state === 'lifted') return refuse('locked', 'Week ' + (c + 1) + ' was lifted. It stays as it was.');
    var prev = this.weeks[fc], tally = { wrote: 0, locked: 0 };
    return this.commit('Write week ' + (c + 1) + ' from week ' + (fc + 1) + (opt.same ? ', unchanged' : ''), function () {
      this.rows.forEach(function (row, r) {
        if (this.isRO(r, c)) { tally.locked++; return; }
        if (row.only) return;
        var s = (prev.deload && prev.pre && prev.pre[row.key]) || row.cells[prev.uid];
        this.put(r, c, s ? (opt.same ? cellOf(s) : stepOf(row, s, 1, opt.from != null ? this.loadAt(row, s, prev.uid, true).kg : this.srcLoad(row, s))) : null); tally.wrote++;
      }, this);
      w.deload = false; w.pre = null; delete w.deloadKind; if (w.why) w.why = {}; if (w.ruled) w.ruled = {};
      return { data: tally };
    });
  };
  /* one deload, the same in both views (sheet-spec D5): half the sets, 1.5 RPE easier, % lines 10 points lower, typed loads
     10% lighter, a stop rule 1.5 easier. The week as it was is kept (w.pre) for "back to normal" */
  P.deload = function (c, kind) {
    var w = this.weeks[c], self = this; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (w.state === 'lifted') return refuse('locked', 'Week ' + w.n + ' was lifted. It stays as it was.');
    var kd = deloadKindOf(this, kind);
    if (w.deload && (w.deloadKind || 'half-easier') === kd) return { data: { c: c, changed: false } };
    return this.commit('Make week ' + w.n + ' a deload' + (kd !== 'half-easier' ? ': ' + low1(DELOADS.filter(function (x) { return x.id === kd; })[0].label) : ''), function () {
      var pre = w.deload && w.pre ? w.pre : {};
      self.rows.forEach(function (row, r) {
        var x = (w.deload && w.pre && w.pre[row.key]) || row.cells[w.uid]; if (!x || self.isRO(r, c)) return;
        if (!(w.deload && w.pre && w.pre[row.key])) pre[row.key] = cellOf(x);
        self.put(r, c, deloadCell(x, kd, self.stepFor(row)));
      });
      w.pre = pre; w.deload = true; w.deloadKind = kd;
      return { data: { c: c, kind: kd } };
    });
  };
  P.undeload = function (c) {
    var w = this.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (!w.deload) return { data: { c: c, changed: false } };
    return this.commit('Week ' + w.n + ' back to normal', function () {
      this.rows.forEach(function (row, r) { if (w.pre && w.pre[row.key] && !this.isRO(r, c)) this.put(r, c, w.pre[row.key]); }, this);
      w.pre = null; w.deload = false; delete w.deloadKind;
      return { data: { c: c } };
    });
  };
  P.clearWeek = function (c) {
    var w = this.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (w.state === 'lifted') return refuse('locked', 'Week ' + (c + 1) + ' was lifted. It stays as it was.');
    return this.clear({ r0: 0, c0: c, r1: Math.max(0, this.rows.length - 1), c1: c });
  };
  /* the store has sent the week: what it holds now is what the lifter has (o.at: when; each send is a version) */
  P.markSent = function (c, o) {
    o = o || {};
    var w = this.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    return this.commit('Send week ' + (c + 1), function () { w.sent = true; w.was = null; w.taken = false; w.sentAt = o.at || w.sentAt || null; w.version = (w.version || 0) + 1; return { data: { c: c, version: w.version } }; });
  };

  /* ---------------- maxes, progressions, lines, days ---------------- */
  P.setMax = function (lift, kg) {
    if (!MAIN[lift]) return refuse('invalid', 'A max is for the squat, the bench or the deadlift.');
    if (kg !== null && !(isNum(kg) && kg >= 20 && kg <= 600)) return refuse('invalid', 'A max is a number of ' + UNIT + ' from 20 to 600, like 152.5.');
    var v = kg == null ? null : r2(kg), before = this.loadMap();
    if (this.maxes[lift] === v && (v == null || (this.maxFrom && this.maxFrom[lift] === 'typed'))) return { data: { lift: lift, kg: v, moved: 0, changed: false } };   /* setting the max the lifting gave makes it the coach's own */
    var res = this.commit(K.LIFT[lift] + ' max ' + (v == null ? 'cleared' : nf(v)), function () { this.maxes[lift] = v; this.maxFrom = this.maxFrom || {}; this.maxFrom[lift] = v == null ? null : 'typed'; return { data: { lift: lift, kg: v } }; });
    if (res.data) { var after = this.loadMap(), moved = 0; Object.keys(after).forEach(function (k) { if (before[k] !== undefined && before[k] !== after[k]) moved++; }); res.data.moved = moved; }
    return res;
  };
  P.setProg = function (r, prog) {
    var row = this.rows[r]; if (!row) return refuse('invalid', 'There is no line there.');
    if (PROG_IDS.indexOf(prog) < 0) return refuse('invalid', 'A line moves ' + PROGS.map(function (p) { return p[1].toLowerCase(); }).join(', ') + '.');
    var self = this;
    return this.commit('How ' + this.label(r).toLowerCase() + ' moves', function () {
      row.prog = prog;
      /* LOGIC-FIX-4 (walk 2, Callum's template block: "+2.5 kg each week" left 197.5 three weeks running): weeks still to come
         (not lifted, not sent) written exactly as the first of them move by the rule from it; a week written its own way
         keeps its words. A typed load and an RPE load both step (the RPE line becomes a load) */
      var c0 = -1, moved = 0;
      self.weeks.forEach(function (w, c) { if (c0 < 0 && w.state !== 'lifted' && !w.sent && row.cells[w.uid] && !row.cells[w.uid].lifted) c0 = c; });
      if (c0 >= 0 && prog !== 'same') {
        var base = row.cells[self.weeks[c0].uid], bkey = JSON.stringify(plain(base)), bl = self.load(r, c0).kg;
        for (var c = c0 + 1; c < self.weeks.length; c++) {
          var w = self.weeks[c], x = row.cells[w.uid]; if (!x || x.lifted || w.sent || w.state === 'lifted' || w.deload) continue;
          if (JSON.stringify(plain(x)) !== bkey) continue;
          if ((prog === 'kg2.5' || prog === 'kg5') && base.off != null) continue;   /* a back-off taken off the top set follows it */
          var nx = stepOf(row, base, c - c0, bl); if (nx) { row.cells[w.uid] = nx; moved++; }
        }
      }
      return { data: { r: r, prog: prog, moved: moved } };
    });
  };
  P.dayAt = function (day) { for (var i = 0; i < this.days.length; i++) if (this.days[i].name === day) return i; return -1; };
  P.insertAt = function (day) {   /* the row index a new line of this day goes before */
    var last = -1; this.rows.forEach(function (row, r) { if (row.day === day) last = r; });
    if (last >= 0) return last + 1;
    var di = this.dayAt(day), self = this, at = this.rows.length;
    for (var r = 0; r < this.rows.length; r++) if (self.dayAt(self.rows[r].day) > di) { at = r; break; }
    return at;
  };
  P.maxEx = function () { var m = -1; this.rows.forEach(function (row) { if (row.ex > m) m = row.ex; }); return m; };
  P.addExercise = function (day, name, opt) {
    opt = opt || {};
    var nm = words0(name); if (!nm) return refuse('invalid', 'A line needs a name.');
    if (this.dayAt(day) < 0) return refuse('invalid', 'There is no day called ' + (typeof day === 'string' && day ? '“' + day + '”' : 'that') + '.');
    var lift = MAIN[opt.lift] ? opt.lift : liftOfName(nm), variant = lift ? (opt.variant && mult(lift, opt.variant) && VARS[lift].some(function (v) { return v[0] === opt.variant; }) ? opt.variant : 'Competition') : '';
    var at = this.insertAt(day), row = { key: day + '|' + nm + '|n' + (++this.seq) + '|0', day: day, ex: this.maxEx() + 1, line: 0, title: nm, name: nm, label: '', lift: lift, cat: lift, variant: variant, note: '', pause: 0, tempo: '', prog: this.defaults && PROG_IDS.indexOf(this.defaults.prog) >= 0 ? this.defaults.prog : 'same', cells: {} };
    return this.commit('Add ' + nm + ' to ' + day, function () { this.rows.splice(at, 0, row); return { data: { r: at } }; });
  };
  P.addLine = function (r) {
    var row = this.rows[r]; if (!row) return refuse('invalid', 'There is no line there.');
    var lastR = r, maxLine = row.line; this.rows.forEach(function (x, i) { if (x.day === row.day && x.ex === row.ex) { lastR = Math.max(lastR, i); maxLine = Math.max(maxLine, x.line); } });
    var nr = { key: row.key.replace(/\|\d+$/, '') + '|n' + (++this.seq) + '|' + (maxLine + 1), day: row.day, ex: row.ex, line: maxLine + 1, title: row.title, name: row.name, label: 'Back-offs', lift: row.lift, cat: row.cat, variant: row.variant, note: '', pause: row.pause || 0, tempo: row.tempo || '', prog: row.prog, cells: {} };
    return this.commit('Add a line to ' + row.name, function () { this.rows.splice(lastR + 1, 0, nr); return { data: { r: lastR + 1 } }; });
  };
  P.removeRow = function (r) {
    var row = this.rows[r]; if (!row) return refuse('invalid', 'There is no line there.');
    var self = this; if (this.weeks.some(function (w, c) { return row.cells[w.uid] && self.isRO(r, c); })) return refuse('locked', 'This line was lifted. Clear the weeks to come instead.');
    return this.commit('Take out ' + this.label(r), function () {
      this.rows.splice(r, 1);
      var rest = this.rows.filter(function (x) { return x.day === row.day && x.ex === row.ex; }).sort(function (a, b) { return a.line - b.line; });
      rest.forEach(function (x, i) { x.line = i; if (!i) x.label = ''; });
      return { data: { r: r } };
    });
  };
  P.renameRow = function (r, name) {
    var row = this.rows[r]; if (!row) return refuse('invalid', 'There is no line there.');
    var nm = words0(name); if (!nm) return refuse('invalid', 'A line needs a name.');
    return this.commit('Rename ' + row.name + ' to ' + nm, function () { this.rows.forEach(function (x) { if (x.day === row.day && x.ex === row.ex) { x.name = nm; x.title = nm; } }); return { data: { r: r } }; });
  };
  /* the row menu's Move up and Move down (programs.md §5.8, request #19): the exercise (all its lines) trades places with the
     one above or below it on the same day */
  P.moveRow = function (r, dir) {
    var row = this.rows[r], self = this; if (!row) return refuse('invalid', 'There is no line there.');
    var d = dir === 'up' || dir < 0 ? -1 : 1, exs = [];
    this.rows.forEach(function (y) { if (y.day === row.day && exs.indexOf(y.ex) < 0) exs.push(y.ex); });
    var i = exs.indexOf(row.ex), j = i + d; if (j < 0 || j >= exs.length) return refuse('invalid', row.name + (d < 0 ? ' is first on ' : ' is last on ') + row.day + ' already.');
    var a = exs[i], z = exs[j];
    return this.commit('Move ' + row.name.toLowerCase() + (d < 0 ? ' up' : ' down'), function () {
      self.rows.forEach(function (y) { if (y.day !== row.day) return; if (y.ex === a) y.ex = z; else if (y.ex === z) y.ex = a; });
      self.rows.sort(function (p, q) { return self.dayAt(p.day) - self.dayAt(q.day) || p.ex - q.ex || p.line - q.line; });
      return { data: { r: self.rows.indexOf(row), dir: d < 0 ? 'up' : 'down' } };
    });
  };
  /* renaming an exercise with lifted weeks (programs.md §5.6, request #19): it becomes the new exercise from week c on; the
     lifted weeks keep the old name, lift and ratio. o: { lift, variant } (the new exercise's) */
  P.swapFrom = function (r, c, name, o) {
    o = o || {}; var row = this.rows[r], w = this.weeks[c], self = this;
    if (!row || !w) return refuse('invalid', 'There is no line there.');
    var nm = words0(name); if (!nm) return refuse('invalid', 'A line needs a name.');
    var lines = []; this.rows.forEach(function (y, i) { if (y.day === row.day && y.ex === row.ex) lines.push(i); });
    var firstFree = c; while (firstFree < this.weeks.length && lines.some(function (i) { return self.isRO(i, firstFree); })) firstFree++;
    if (firstFree >= this.weeks.length) return refuse('locked', LIFTED);
    var lib = libFind(nm), lift = o.lift !== undefined ? o.lift : lib ? lib.lift : liftOfName(nm), variant = MAIN[lift] ? o.variant || (VARS[lift].some(function (v) { return VNAME[lift][v[0]] && VNAME[lift][v[0]].toLowerCase() === nm.toLowerCase(); }) ? VARS[lift].filter(function (v) { return VNAME[lift][v[0]].toLowerCase() === nm.toLowerCase(); })[0][0] : 'Competition') : '';
    var lifted = this.weeks.some(function (w0, c0) { return c0 < firstFree && lines.some(function (i) { return self.rows[i].cells[w0.uid]; }); });
    if (!lifted) return this.renameRow(r, nm);
    return this.commit('Swap ' + row.name.toLowerCase() + ' for ' + nm.toLowerCase() + ' from week ' + (this.weeks[firstFree].n || firstFree + 1), function () {
      var ex = self.maxEx() + 1, at = lines[lines.length - 1] + 1, made = [];
      lines.forEach(function (i, k) {
        var y = self.rows[i], nr = clone(y); nr.key = y.day + '|' + nm + '|f' + (++self.seq) + '|' + y.line; nr.ex = ex; nr.title = nm; nr.name = MAIN[lift] && VNAME[lift][variant] && variant !== 'Competition' ? VNAME[lift][variant] : lib ? lib.name : sentence(nm);
        nr.lift = MAIN[lift] ? lift : null; nr.cat = lift || null; nr.variant = MAIN[lift] ? variant : ''; delete nr.factor; delete nr.mx; delete nr.max; nr.cells = {};
        self.weeks.forEach(function (w0, c0) { if (c0 >= firstFree && y.cells[w0.uid]) { nr.cells[w0.uid] = y.cells[w0.uid]; delete y.cells[w0.uid]; } });
        made.push(nr);
      });
      Array.prototype.splice.apply(self.rows, [at, 0].concat(made));
      return { data: { r: at, from: firstFree } };
    });
  };
  P.setVariant = function (r, variant) {
    var row = this.rows[r]; if (!row) return refuse('invalid', 'There is no line there.');
    if (!row.lift) return refuse('invalid', row.name + ' is not a squat, bench or deadlift, so it has no variants.');
    if (!VARS[row.lift].some(function (v) { return v[0] === variant; })) return refuse('invalid', 'The ' + K.LIFT[row.lift].toLowerCase() + ' variants are ' + VARS[row.lift].map(function (v) { return v[0]; }).join(', ') + '.');
    var nm = VNAME[row.lift][variant];
    return this.commit(row.name + ' becomes ' + nm.toLowerCase(), function () { this.rows.forEach(function (x) { if (x.day === row.day && x.ex === row.ex) { x.variant = variant; x.name = nm; x.title = nm; } }); return { data: { r: r, variant: variant } }; });
  };
  P.setNote = function (r, note) {
    var row = this.rows[r]; if (!row) return refuse('invalid', 'There is no line there.');
    var t = typeof note === 'string' ? note.trim() : '';
    return this.commit('Note on ' + row.name, function () { row.note = t; return { data: { r: r } }; });
  };
  P.rename = function (name) { var nm = words0(name); if (!nm) return refuse('invalid', 'A program needs a name.'); return this.commit('Rename the block', function () { this.name = nm; return { data: { name: nm } }; }); };
  P.addDay = function (name) {
    var nm = words0(name) || 'Day ' + (this.days.length + 1);
    if (this.dayAt(nm) >= 0) return refuse('invalid', 'There is a day called ' + nm + ' already.');
    return this.commit('Add ' + nm, function () { this.days.push({ name: nm, wd: null }); return { data: { day: nm } }; });
  };
  P.renameDay = function (day, name) {
    var i = this.dayAt(day); if (i < 0) return refuse('invalid', 'There is no day called ' + (typeof day === 'string' && day ? '“' + day + '”' : 'that') + '.');
    var nm = words0(name); if (!nm) return refuse('invalid', 'A day needs a name.');
    if (nm !== day && this.dayAt(nm) >= 0) return refuse('invalid', 'There is a day called ' + nm + ' already.');
    return this.commit('Rename ' + day + ' to ' + nm, function () {
      this.days[i].name = nm; this.rows.forEach(function (row) { if (row.day === day) row.day = nm; });
      this.weeks.forEach(function (w) { if (w.started[day]) { delete w.started[day]; w.started[nm] = 1; } });
      return { data: { day: nm } };
    });
  };
  P.removeDay = function (day) {
    var i = this.dayAt(day); if (i < 0) return refuse('invalid', 'There is no day called ' + (typeof day === 'string' && day ? '“' + day + '”' : 'that') + '.');
    var self = this, lifted = this.rows.some(function (row, r) { return row.day === day && self.weeks.some(function (w, c) { return row.cells[w.uid] && self.isRO(r, c); }); });
    if (lifted) return refuse('locked', day + ' has lifted sessions. Clear the weeks to come instead.');
    return this.commit('Delete ' + day, function () { this.days.splice(i, 1); this.rows = this.rows.filter(function (row) { return row.day !== day; }); return { data: { day: day } }; });
  };

  /* ---------------- saving and exporting ---------------- */
  P.toJSON = function () {
    var WK = ['label', 'phase', 'pn', 'kind', 'deloadKind', 'moved', 'why', 'ruled', 'capped', 'out', 'merged', 'lock', 'kept', 'swaps', 'meet'];
    return clone({ v: 2, kind: 'block', id: this.id == null ? null : this.id, name: this.name, maxes: this.maxes, maxFrom: this.maxFrom || {}, today: this.today || {}, start: this.start || null, perWeek: this.perWeek || 0, seq: this.seq,
      steps: this.steps, defaults: this.defaults, rules: this.rules || null, deloadKind: this.deloadKind || null, blockKind: this.kind || null, meet: this.meet || null,
      days: this.days, weeks: this.weeks.map(function (w) {
        var o = { uid: w.uid, n: w.n || null, state: w.state, sent: !!w.sent, sentAt: w.sentAt || null, version: isNum(w.version) ? w.version : null, deload: !!w.deload, pre: w.pre || null, started: w.started || {}, was: w.was || null, taken: !!w.taken, dates: w.dates || {}, off: w.off || {} };
        WK.forEach(function (k) { if (w[k] != null && !(typeof w[k] === 'object' && !Object.keys(w[k]).length)) o[k] = w[k]; });
        return o;
      }), rows: this.rows });
  };
  var csvField = function (s) { s = String(s == null ? '' : s); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  P.toCSV = function () {
    var self = this, lines = [['Day', 'Exercise'].concat(this.weeks.map(function (w, i) { return 'Week ' + (i + 1); }))];
    this.rows.forEach(function (row, r) { lines.push([row.day, self.label(r)].concat(self.weeks.map(function (w, c) { return text(cellOf(self.raw(r, c))); }))); });
    return lines.map(function (ln) { return ln.map(csvField).join(','); }).join('\r\n');
  };


  /* ======================================================================================================================
     SPEC B (13 Nov 2026): programs.md §5.5, §6 and §14.4, shared.md §4. Every rule a coach's week obeys lives below, so
     the Week view, the Block view, the store, Overview, the lifter page, Messages and Meets show one number.
     ==================================================================================================================== */
  var DAYMS = 86400000;
  var isIso = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); };
  var daysBetween = function (a, z) { return Math.round((K.d(z) - K.d(a)) / DAYMS); };         // z − a, in days
  var dayWords = function (iso) { return K.wd3(iso) + ' ' + K.dm(iso); };                      // "Sun 1 Nov"
  var cap1 = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  var liftWord = function (lift) { return lift && K.LIFT[lift] ? K.LIFT[lift].toLowerCase() : ''; };
  var LIFT_ORDER = { squat: 0, bench: 1, deadlift: 2 };
  function lifterOf(b) { return b && b.id != null && K.L ? K.L(b.id) : null; }
  /* his / her / their, from the lifter's sex when the data has it */
  function pronoun(l) {
    var s = String((l && (l.sex || l.gender)) || '').toLowerCase();
    return /^(f|female|w|woman|women)$/.test(s) ? 'her' : /^(m|male|man|men)$/.test(s) ? 'his' : 'their';
  }
  function joinAnd(a) { a = a.filter(Boolean); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

  /* ---------------- the exercise library: the lift a name counts toward, and the parts it loads (shared.md §4.16) ---------------- */
  var LIB = [
    ['Squat', 'squat', ['knee', 'hip']], ['Paused squat', 'squat', ['knee', 'hip']], ['Tempo squat', 'squat', ['knee', 'hip']], ['Pin squat', 'squat', ['knee', 'hip']],
    ['Box squat', 'squat', ['knee', 'hip']], ['Front squat', 'squat', ['knee']], ['Safety bar squat', 'squat', ['knee']], ['High bar squat', 'squat', ['knee']],
    ['Hack squat', null, ['knee']], ['Leg press', null, ['knee']], ['Lunge', null, ['knee']], ['Walking lunge', null, ['knee']], ['Split squat', null, ['knee']],
    ['Bulgarian split squat', null, ['knee']], ['Step-up', null, ['knee']], ['Leg extension', null, ['knee']], ['Goblet squat', null, ['knee']],
    ['Bench', 'bench', ['shoulder', 'pec']], ['Paused bench', 'bench', ['shoulder', 'pec']], ['Close-grip bench', 'bench', ['shoulder', 'elbow']],
    ['Pin press', 'bench', ['shoulder']], ['Incline bench', 'bench', ['shoulder', 'pec']], ['Larsen press', 'bench', ['shoulder', 'pec']], ['Spoto press', 'bench', ['shoulder', 'pec']],
    ['Board press', 'bench', ['shoulder', 'elbow']], ['Floor press', 'bench', ['shoulder']], ['Overhead press', null, ['shoulder']], ['Push press', null, ['shoulder']],
    ['DB shoulder press', null, ['shoulder']], ['Dumbbell bench', null, ['shoulder', 'pec']], ['Dip', null, ['shoulder', 'elbow', 'pec']], ['Push-up', null, ['shoulder']],
    ['Tricep pushdown', null, ['elbow']], ['Skull crusher', null, ['elbow']], ['Lateral raise', null, ['shoulder']],
    ['Deadlift', 'deadlift', ['low back', 'hip']], ['Paused deadlift', 'deadlift', ['low back', 'hip']], ['Deficit deadlift', 'deadlift', ['low back', 'hip']],
    ['Romanian deadlift', 'deadlift', ['low back', 'hamstring']], ['Stiff-leg deadlift', 'deadlift', ['low back', 'hamstring']], ['Block pull', 'deadlift', ['low back']],
    ['Rack pull', 'deadlift', ['low back']], ['Sumo deadlift', 'deadlift', ['low back', 'hip']], ['Good morning', null, ['low back', 'hamstring']],
    ['Barbell row', null, ['low back']], ['Pendlay row', null, ['low back']], ['Back extension', null, ['low back']], ['Ab wheel', null, ['low back']],
    ['Dumbbell row', null, []], ['Cable row', null, []], ['Lat pulldown', null, []], ['Pull-ups', null, ['elbow']], ['Chin-ups', null, ['elbow']], ['Face pull', null, []],
    ['Hanging leg raise', null, []], ['Plank', null, []], ['Hip thrust', null, ['hip']], ['Hamstring curl', null, ['hamstring']], ['Calf raise', null, []],
    ['Biceps curl', null, ['elbow']], ['Reverse hyper', null, ['low back']],
    ['Belt squat', null, ['hip']], ['Trap bar deadlift', null, ['hip']]
  ].map(function (x) { return { name: x[0], lift: x[1], loads: x[2] }; });
  var LIB_BY = {}; LIB.forEach(function (e) { LIB_BY[e.name.toLowerCase()] = e; });
  var ALIAS = { rdl: 'romanian deadlift', 'close grip bench': 'close-grip bench', 'pull up': 'pull-ups', 'pullups': 'pull-ups', 'pull-up': 'pull-ups', ohp: 'overhead press', 'press': 'overhead press', dips: 'dip', 'lunges': 'lunge', 'leg raise': 'hanging leg raise', 'rdl deadlift': 'romanian deadlift', 'db row': 'dumbbell row', 'ssb squat': 'safety bar squat' };
  function libFind(name) {
    var k = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim(); if (!k) return null;
    if (LIB_BY[k]) return LIB_BY[k];
    if (ALIAS[k] && LIB_BY[ALIAS[k]]) return LIB_BY[ALIAS[k]];
    var sing = k.replace(/s$/, ''); if (LIB_BY[sing]) return LIB_BY[sing];
    return null;
  }
  /* FIX-LOGIC (F27, a coach's own sheet imported): the lift and variant a typed name means. A dumbbell, machine, cable or
     Smith line is an accessory, never the competition lift ("DB incline bench" landed on Tom's bench top set); a plural or a
     longer name keeps its variant ("Paused Deadlifts", "Close Grip Bench Press" read as the competition lift). → { lift, variant, lib } */
  function readLiftName(name) {
    var lib = libFind(name), k = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!lib) lib = libFind(k.replace(/\b(press|presses)$/, '').trim()) || libFind(k.replace(/s\b/g, '').trim()) || null;
    var acc = /\b(db|dumbbells?|dumbell|machine|cable|smith|kettlebell|kb|band(ed)?|landmine|belt squat|hack|goblet|leg press|split|bulgarians?|lunges?|step-?ups?)\b/.test(k);
    var lift = lib ? lib.lift : acc ? null : liftOfName(name);
    if (!MAIN[lift]) return { lift: lift || null, variant: '', lib: lib };
    var exact = VARS[lift].filter(function (v) { return VNAME[lift][v[0]] && (VNAME[lift][v[0]].toLowerCase() === k || (lib && VNAME[lift][v[0]] === lib.name)); })[0];
    if (exact) return { lift: lift, variant: exact[0], lib: lib };
    var kw = { squat: [[/paus/, 'Paused'], [/tempo/, 'Tempo'], [/\bpin\b/, 'Pin']], bench: [[/paus/, 'Paused'], [/close[- ]?grip|\bcgbp?\b/, 'Close Grip'], [/\bpin\b/, 'Pin Press'], [/incline/, 'Incline']], deadlift: [[/paus/, 'Paused'], [/deficit/, 'Deficit'], [/\brdl\b|romanian/, 'RDL']] }[lift];
    var hit = kw.filter(function (x) { return x[0].test(k); })[0];
    return { lift: lift, variant: hit ? hit[1] : 'Competition', lib: lib || (hit ? libFind(VNAME[lift][hit[1]]) : null) };
  }
  /* the parts a line loads: the library's, else read from its words */
  function loadsOf(name) {
    var e = libFind(name); if (e) return e.loads.slice();
    var k = String(name || '').toLowerCase(), out = [];
    if (/squat|lunge|leg press|step-up|leg extension/.test(k)) out.push('knee');
    if (/deadlift|good morning|\bpull\b|barbell row|back extension/.test(k)) out.push('low back');
    if (/bench|press|dip/.test(k)) out.push('shoulder');
    return out;
  }
  /* a part as the intake names it ("Left knee", "Lower back") → the library's word */
  function partOf(t) {
    var k = String(t || '').toLowerCase();
    if (/back/.test(k)) return /upper|mid/.test(k) ? 'upper back' : 'low back';
    var m = /(knee|hip|shoulder|elbow|wrist|pec|hamstring|ankle|neck|groin|quad|glute|adductor)/.exec(k);
    return m ? m[1] : k.replace(/^(left|right)\s+/, '').trim();
  }
  /* FIX-LOGIC (first-time walk 2, FTC §7.3): the Swap box's three suggestions for a line, around the lifter's injury.
     BLOCK.swapIdeas(name, { intake, lift }) → { part, injured, ideas: [3 names], every }. The part is the one the line loads
     that the intake names (else the line's own part); a main lift gets a variant of itself that spares that part (knee:
     Box squat, Tempo squat, Belt squat), an accessory gets lines that train round it (a knee: Hip thrust, Romanian deadlift,
     Back extension; Jess's leg press found an empty box). every: true when the part is the intake's injury, since a knee
     is not one week long. Never the line itself. */
  var SWAP_MAIN = { knee: ['Box squat', 'Tempo squat', 'Belt squat'], hip: ['Box squat', 'Tempo squat', 'Belt squat'], 'low back': ['Block pull', 'Trap bar deadlift', 'Hip thrust'], hamstring: ['Block pull', 'Trap bar deadlift', 'Hip thrust'], shoulder: ['Floor press', 'Close-grip bench', 'Dumbbell bench'], pec: ['Floor press', 'Close-grip bench', 'Dumbbell bench'], elbow: ['Floor press', 'Dumbbell bench', 'Paused bench'] };
  var SWAP_ACC = { knee: ['Hip thrust', 'Romanian deadlift', 'Back extension'], hip: ['Back extension', 'Hamstring curl', 'Leg extension'], 'low back': ['Hip thrust', 'Cable row', 'Hamstring curl'], hamstring: ['Hip thrust', 'Back extension', 'Leg extension'], shoulder: ['Floor press', 'Tricep pushdown', 'Face pull'], pec: ['Floor press', 'Tricep pushdown', 'Face pull'], elbow: ['Floor press', 'Face pull', 'Lateral raise'] };
  function swapIdeas(name, o) {
    o = o || {}; var e = libFind(name), lift = o.lift !== undefined ? o.lift : e ? e.lift : liftOfName(name), loads = loadsOf(name);
    var intake = o.intake || null, hurt = ((intake && intake.injuries && intake.injuries.parts) || []).map(partOf);
    var part = loads.filter(function (x) { return hurt.indexOf(x) >= 0; })[0] || null, injured = !!part;
    if (!part) part = MAIN[lift] ? { squat: 'knee', bench: 'shoulder', deadlift: 'low back' }[lift] : loads[0] || null;
    var own = String((e && e.name) || name || '').toLowerCase(), list = part ? ((MAIN[lift] ? SWAP_MAIN : SWAP_ACC)[part] || []) : [];
    return { part: part, injured: injured, ideas: list.filter(function (x) { return x.toLowerCase() !== own; }).slice(0, 3), every: injured };
  }
  var PART_LIFT = { knee: 'squat', hip: 'squat', quad: 'squat', adductor: 'squat', groin: 'squat', glute: 'squat', 'low back': 'deadlift', hamstring: 'deadlift', shoulder: 'bench', elbow: 'bench', pec: 'bench', wrist: 'bench' };

  /* ---------------- pain words (shared.md §4.17, overview-lifters §4.1) ---------------- */
  var COMPLAIN = /^(tight|tightness|sore|soreness|hurt|hurts|hurting|pain|painful|sharp|tweak|tweaked|ache|aches|aching|achy|pinch|pinched|pinching|cranky|niggle|niggly|bites|biting)$/;
  var BODY = ['low back', 'lower back', 'upper back', 'back', 'knee', 'knees', 'hip', 'hips', 'shoulder', 'shoulders', 'elbow', 'elbows', 'wrist', 'wrists', 'pec', 'hamstring', 'hamstrings', 'ankle', 'neck', 'groin', 'quad', 'glute', 'adductor', 'si joint', 'tendon', 'patellar tendon'];
  function painWords(textIn) {
    var t = ' ' + String(textIn || '').toLowerCase().replace(/[“”"’']/g, '').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ') + ' ';
    /* never inside "back squat", "back-off(s)", "get back", "back to" */
    t = t.replace(/\bback squats?\b/g, ' xsq ').replace(/\bback-offs?\b/g, ' xbo ').replace(/\bback offs?\b/g, ' xbo ').replace(/\bget back\b/g, ' xgb ').replace(/\bback to\b/g, ' xbt ');
    var w = t.trim().split(' '), hits = [];
    for (var i = 0; i < w.length; i++) {
      var part = null, len = 1;
      for (var j = 0; j < BODY.length && !part; j++) { var bw = BODY[j].split(' '); if (w.slice(i, i + bw.length).join(' ') === BODY[j]) { part = BODY[j]; len = bw.length; } }
      if (!part) continue;
      for (var k2 = Math.max(0, i - 4); k2 <= Math.min(w.length - 1, i + len - 1 + 4); k2++) {
        if (k2 >= i && k2 < i + len) continue;
        if (COMPLAIN.test(w[k2])) { hits.push({ part: partOf(part === 'knees' ? 'knee' : part), at: i, words: (k2 < i ? w.slice(k2, i + len) : w.slice(i, k2 + 1)).join(' ') }); break; }
      }
    }
    if (!hits.length) return { pain: false };
    return { pain: true, part: hits[0].part, words: hits[0].words, lift: PART_LIFT[hits[0].part] || null, all: hits };
  }
  /* the pain items that hold a lift's rule increases (shared.md §4.3): a pain report in the last 7 days not resolved, and a
     set note with pain words from the last 14 days. o.settled: lifts (or item words) the coach has answered */
  function holdsOf(l, o) {
    o = o || {}; var out = [], seen = {}, today = o.today || K.today, settled = o.settled || [];
    var add = function (lift, why, src) { if (!lift || seen[lift] || settled.indexOf(lift) >= 0) return; seen[lift] = 1; out.push({ lift: lift, why: why, source: src }); };
    ((l && l.pain) || []).forEach(function (p) {
      if (p.resolved || !p.day || daysBetween(String(p.day).slice(0, 10), today) > 7) return;
      var lift = p.lift ? String(p.lift).toLowerCase() : PART_LIFT[partOf(p.part)];
      add(lift, low1(partOf(p.part)) + ' ' + nf(p.sev) + '/10', 'pain');
    });
    var pr = l && l.program;
    if (pr) pr.weeks.forEach(function (w) { (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) {
      if (!s.note || !s.done) return; var on = String(s.on || d.date || '').slice(0, 10); if (!on || daysBetween(on, today) > 14) return;
      var pw = painWords(s.note); if (!pw.pain) return;
      add(MAIN[e.lift] ? e.lift : pw.lift, pw.part + ' note', 'note');
    }); }); }); });
    return out;
  }
  function normHolds(h) {
    var o = {};
    if (Array.isArray(h)) h.forEach(function (x) { if (typeof x === 'string') o[x] = { lift: x, why: 'pain' }; else if (x && x.lift) o[String(x.lift).toLowerCase()] = x; });
    else if (h && typeof h === 'object') Object.keys(h).forEach(function (k) { o[k] = typeof h[k] === 'string' ? { lift: k, why: h[k] } : h[k]; });
    return o;
  }

  /* ---------------- the coach's rules, relative to what was written, per lift (shared.md §4.4) ---------------- */
  var RULES = { under: 0.5, over: 1, add: { squat: 2.5, bench: 2.5, deadlift: 5, other: 2.5 }, off: 5 };
  function rulesFor(b, given) {
    /* the coach's rules: given, else D.rules when it is an object, else D.rulesBy (the store writes it from Settings, request #49) */
    var base = clone(RULES), d = given || (D && D.rules && !Array.isArray(D.rules) && typeof D.rules === 'object' ? D.rules : D && D.rulesBy && typeof D.rulesBy === 'object' ? D.rulesBy : null), own = b && b.rules;
    var join = function (x) { if (!x) return; ['under', 'over', 'off'].forEach(function (k) { if (isNum(x[k])) base[k] = x[k]; }); if (x.add) Object.keys(x.add).forEach(function (k) { if (isNum(x.add[k])) base.add[k] = x.add[k]; }); };
    join(d); join(own);
    base.own = !!own;
    return base;
  }
  /* what the rule does to one line from the week before as lifted: { kg, why, rule, dir } or null */
  function ruleFor(b, row, cell, prev, rs) {
    var lt = prev && prev.lifted, top = lt && lt.top, sp = b.stepFor(row);
    if (!top || !top.w || cell.w == null) return null;
    var add = row.lift ? rs.add[row.lift] : rs.add.other; if (!isNum(add)) add = rs.add.other;
    if (cell.rHi != null || prev.rHi != null) {                     /* a rep range: double progression */
      var sets = (lt.sets || []).filter(function (s) { return !s.skipped; }), hi = prev.rHi != null ? prev.rHi : cell.rHi;
      var tgt = prev.rpe != null ? (prev.rpeHi != null ? prev.rpeHi : prev.rpe) : null;
      if (!sets.length || !sets.every(function (s) { return s.r >= hi && (tgt == null || !s.rated || s.felt <= tgt); })) return null;
      var base = sets.reduce(function (m, s) { return Math.max(m, s.w || 0); }, 0) || cell.w, kg = r2(base + add);
      if (!(kg > cell.w)) return null;
      return { kg: kg, from: base, dir: 'up', rule: 'double', why: 'every set hit ' + hi + ' at ' + nf(base) + '.', felt: null, wrote: null };
    }
    if (prev.rpe == null || top.felt == null) return null;
    var wrote = prev.rpeHi != null ? prev.rpeHi : prev.rpe, d = top.felt - wrote;
    if (d <= -rs.under + 1e-9) {
      var up = r2(top.w + add); if (!(up > cell.w)) return null;
      return { kg: up, from: top.w, dir: 'up', rule: 'under', why: 'felt ' + nf(top.felt) + ' against ' + nf(wrote) + '.', felt: top.felt, wrote: wrote };
    }
    if (d >= rs.over - 1e-9) {
      var dn = round(top.w * (1 - rs.off / 100), sp); if (!(dn < cell.w)) return null;
      return { kg: dn, from: top.w, dir: 'down', rule: 'over', why: 'felt ' + nf(top.felt) + ' against ' + nf(wrote) + '.', felt: top.felt, wrote: wrote };
    }
    return null;
  }

  /* ---------------- lighter means fewer kilos (shared.md §4.1, programs §6.12) ---------------- */
  /* line = { r, rHi, rpe, rpeHi, w (as written that week, before this week's rule step), kg (the load now), max, factor, step }
     → { kg, other, chart, scaled }: the lighter of the chart load at the new RPE and the written load scaled by the chart,
     rounded to the step, never above the load now */
  function lighter(line, rpe, ctx) {
    line = line || {}; ctx = ctx || {};
    var reps = line.rHi != null ? (line.r + line.rHi) / 2 : line.r, sp = line.step || ctx.step || STEP, f = line.factor || ctx.factor || 1, mx = isNum(line.max) ? line.max : ctx.max;
    var wrote = line.rpeHi != null ? (line.rpe + line.rpeHi) / 2 : line.rpe, now = isNum(line.kg) ? line.kg : line.w;
    var a = isNum(mx) && mx > 0 && reps ? round(mx / f * pct(reps, rpe), sp) : null;
    var z = isNum(line.w) && wrote != null && reps ? round(line.w * pct(reps, rpe) / pct(reps, wrote), sp) : null;
    var cands = [a, z].filter(isNum);
    if (!cands.length) return { kg: isNum(now) ? now : null, other: null, chart: a, scaled: z };
    var kg = Math.min.apply(null, cands), other = cands.length > 1 ? Math.max.apply(null, cands) : null;
    if (isNum(now)) { kg = Math.min(kg, now); if (other != null && other > now) other = null; }
    if (other === kg) other = null;
    return { kg: kg, other: other, chart: a, scaled: z, pct: reps ? Math.round(pct(reps, rpe) * 1000) / 10 : null, max: mx };
  }

  /* ---------------- the field grammar (programs §5.5) ---------------- */
  var FIELDS = ['sets', 'reps', 'effort', 'load', 'tempo', 'note', 'rest', 'pauseAt', 'acc'];
  var FKEYS = { sets: ['n', 'nHi', 'upTo'], reps: ['r', 'rHi', 'amrap'], effort: ['rpe', 'rpeHi', 'rir', 'pct', 'pctHi', 'off', 'until'], load: ['w', 'wHi', 'bw'], tempo: ['tempo', 'pause'], note: ['note'], rest: ['rest'], pauseAt: ['pauseAt'], acc: ['acc'] };
  var FWHY = {
    sets: 'Sets are 1 to 20, a range like 3-4, or up to 5.',
    reps: 'Reps are 1 to 30, a range like 8-12, or 5+.',
    effort: 'Type an RPE like 8 or 7.5, a percent like 75%, or 2 RIR.',
    load: 'A load is a number of kg, like 142.5.',
    tempo: 'Write a tempo like 3-1-0, or a pause like 2 s.',
    note: 'Notes are 140 characters at most.',
    rest: 'Write a rest like 90 s, 3 min or 2:30.',
    pauseAt: 'Say where in a few words, like 2 cm off the chest.',
    acc: 'Name the bands or chains in a few words, like light bands.'
  };
  /* a column of the coach's own ("cx:Bar") */
  function cxName(f) { var m = /^cx:(.{1,24})$/.exec(String(f || '')); return m ? m[1].trim() : null; }
  function restText(sec) { sec = Number(sec); if (!(sec > 0)) return ''; if (sec % 60 === 0) return sec / 60 + ' min'; if (sec < 120) return sec + ' s'; return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  var OFFWHY = MINUS + '10% means under the top set. Put it on a back-off line.';
  function fieldName(f) { if (cxName(f)) return 'cx:' + cxName(f); f = String(f || '').toLowerCase(); return f === 'notes' ? 'note' : f === 'rpe' || f === 'pct' || f === '%' ? 'effort' : f === 'kg' || f === 'weight' ? 'load' : f === 'pause' ? 'tempo' : f === 'pause at' || f === 'pauseat' ? 'pauseAt' : f === 'bands' || f === 'chains' || f === 'bands or chains' ? 'acc' : f; }
  var isHalf = function (v) { return isNum(v) && v >= 1 && v <= 10 && (v * 2) % 1 === 0; };
  /* BLOCK.parseField(field, text, ctx) → { ok: true, field, keys, rel?, whole?, text?, note? } | { ok: false, why }
     ctx: { cell (the cell now, for relative entries), load (its load now), line, hasTop, step } */
  function parseField(field, raw, ctx) {
    ctx = ctx || {}; field = fieldName(field);
    var no = function (why) { return { ok: false, field: field, why: why || FWHY[field] }; }, yes = function (keys, extra) { var o = { ok: true, field: field, keys: keys }; if (extra) for (var k in extra) o[k] = extra[k]; return o; };
    var cxn = cxName(field);
    if (cxn) { var cv = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim(); if (cv.length > 40) return no('A column of your own holds 40 characters at most.'); var cxo = clone((ctx.cell && ctx.cell.cx) || {}); if (cv) cxo[cxn] = cv; else delete cxo[cxn]; return yes({ cx: cxo }); }
    if (FIELDS.indexOf(field) < 0) return { ok: false, field: field, why: 'A line has Sets, Reps, RPE or %, Load, Tempo and Notes.' };
    if (field === 'pauseAt' || field === 'acc') { var tx = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim(); if (tx.length > 40) return no(); var kk = {}; if (tx) kk[field] = tx; return yes(kk); }
    if (field === 'rest') {
      var rt = String(raw == null ? '' : raw).trim().toLowerCase(), rm, sec = null; if (!rt) return yes({});
      if ((rm = /^(\d+):([0-5]\d)$/.exec(rt))) sec = Number(rm[1]) * 60 + Number(rm[2]);
      else if ((rm = /^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?)$/.exec(rt))) sec = Math.round(Number(rm[1]) * 60);
      else if ((rm = /^(\d+)\s*(s|sec|secs|seconds?)?$/.exec(rt))) sec = Number(rm[1]);
      return sec > 0 && sec <= 1200 ? yes({ rest: sec }) : no();
    }
    if (field === 'note') { var nt = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim(); return nt.length > 140 ? no() : yes(nt ? { note: nt } : {}); }
    var t = norm(raw), m, cur = ctx.cell || {}, num;
    if (!t) return yes({});
    if (field === 'sets') {
      if ((m = /^([+-])\s*(\d+)$/.exec(t))) { if (cur.n == null) return no(); num = cur.n + (m[1] === '-' ? -1 : 1) * Number(m[2]); if (!(num >= 1 && num <= 20)) return no(); var ks = { n: num }; if (cur.nHi != null && cur.nHi > num) ks.nHi = cur.nHi; if (cur.upTo) ks.upTo = true; return yes(ks, { rel: true }); }
      if (/x/.test(t)) {                                         /* a whole line: 3x5 @7, 3x5 70%, 3x5 */
        if ((m = /^(\d+\s*x\s*\d+(?:\s*-\s*\d+)?\+?)\s+(\d+(?:\.\d+)?)$/.exec(t)) && isHalf(Number(m[2]))) { var b0 = m[1].replace(/\s+/g, ''); return no('Write it as ' + b0 + ' @' + nf(Number(m[2])) + ' or ' + b0 + ' 70%.'); }
        var pw = parse(raw, { line: ctx.line || 0, hasTop: !!ctx.hasTop, step: ctx.step });
        if (!pw.ok || !pw.cell) return no(pw.why);
        if (!(pw.cell.n >= 1 && pw.cell.n <= 20)) return no();
        return yes(pw.cell, { whole: true, note: pw.note || null });
      }
      if ((m = /^up\s*to\s*(\d+)$/.exec(t))) { num = Number(m[1]); return num >= 1 && num <= 20 ? yes({ n: num, upTo: true }) : no(); }
      if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(t))) { var a0 = Number(m[1]), z0 = Number(m[2]); return a0 >= 1 && z0 > a0 && z0 <= 20 ? yes({ n: a0, nHi: z0 }) : no(); }
      if ((m = /^(\d+)$/.exec(t))) { num = Number(m[1]); return num >= 1 && num <= 20 ? yes({ n: num }) : no('Sets are 1 to 20.'); }
      return no();
    }
    if (field === 'reps') {
      if ((m = /^([+-])\s*(\d+)$/.exec(t))) { if (cur.r == null) return no(); var d0 = (m[1] === '-' ? -1 : 1) * Number(m[2]), rr = cur.r + d0; if (!(rr >= 1 && rr <= 30)) return no(); var kr = { r: rr }; if (cur.rHi != null) kr.rHi = cur.rHi + d0; if (cur.amrap) kr.amrap = true; return yes(kr, { rel: true }); }
      if ((m = /^(\d+)\s*\+$/.exec(t))) { num = Number(m[1]); return num >= 1 && num <= 30 ? yes({ r: num, amrap: true }) : no(); }
      if ((m = /^(\d+)\s*-\s*(\d+)$/.exec(t))) { var ra = Number(m[1]), rz = Number(m[2]); return ra >= 1 && rz > ra && rz <= 30 ? yes({ r: ra, rHi: rz }) : no(); }
      if ((m = /^(\d+)$/.exec(t))) { num = Number(m[1]); return num >= 1 && num <= 30 ? yes({ r: num }) : no(); }
      return no();
    }
    if (field === 'effort') {
      var back = (ctx.line || 0) > 0 || ctx.hasTop;
      if ((m = /^-\s*(\d+(?:\.\d+)?)\s*%(?:\s*(?:to|until)\s*@?\s*(\d+(?:\.\d+)?))?(?:\s*,?\s*@\s*(\d+(?:\.\d+)?))?$/.exec(t))) {
        if (!back) return no(OFFWHY);
        var ko = { off: Number(m[1]) }; if (!(ko.off > 0 && ko.off < 60)) return no();
        if (m[2] != null) { ko.until = Number(m[2]); if (!isHalf(ko.until)) return no(); }
        if (m[3] != null) { ko.rpe = Number(m[3]); if (!isHalf(ko.rpe) || ko.rpe < 5 || ko.rpe > 10) return no(); }   /* FIX-LOGIC (FP F3.5): "−15% @7" */
        return yes(ko);
      }
      /* spec C (F3.1): the words the grid writes, read back: "12% off top set" (also "12% off top", "12% off", "12 off") */
      if ((m = /^(\d+(?:\.\d+)?)\s*%?\s*off(?:\s+(?:the\s+)?top(?:\s+set)?)?(?:\s*,?\s*(?:to|until)\s*@?\s*(\d+(?:\.\d+)?))?(?:\s*,?\s*@\s*(\d+(?:\.\d+)?))?$/.exec(t))) {
        if (!back) return no('A back-off works off the top set. Put it on the line under one, or write 70%.');
        var kw = { off: Number(m[1]) }; if (!(kw.off > 0 && kw.off < 60)) return no();
        if (m[2] != null) { kw.until = Number(m[2]); if (!isHalf(kw.until)) return no(); }
        if (m[3] != null) { kw.rpe = Number(m[3]); if (!isHalf(kw.rpe) || kw.rpe < 5 || kw.rpe > 10) return no(); }   /* FIX-LOGIC (FP F3.5): "15% off top set, @7" */
        return yes(kw);
      }
      if ((m = /^(?:top set load|same as (?:the )?top set|top|repeat|same load)(?:\s*,?\s*(?:to|until)\s*@?\s*(\d+(?:\.\d+)?))?$/.exec(t))) {
        if (!back) return no('“top” repeats the top set’s load. Put it on a back-off line.');
        var kt = { off: 0 }; if (m[1] != null) { kt.until = Number(m[1]); if (!isHalf(kt.until)) return no(); } return yes(kt);
      }
      if ((m = /^([+-])\s*(\d+(?:\.\d+)?)$/.exec(t))) {                /* RPE +0.5, -1 */
        if (cur.rpe == null) return no();
        var dr = (m[1] === '-' ? -1 : 1) * Number(m[2]), nr = r2(cur.rpe + dr); if (!isHalf(nr)) return no();
        var ke = { rpe: nr }; if (cur.rpeHi != null && isHalf(r2(cur.rpeHi + dr))) ke.rpeHi = r2(cur.rpeHi + dr); if (cur.rir) ke.rir = true; if (cur.pct != null) { ke.pct = cur.pct; if (cur.pctHi != null) ke.pctHi = cur.pctHi; }
        if (cur.until != null) ke.until = Math.max(nr, cur.until + dr);
        return yes(ke, { rel: true, by: dr });
      }
      var k = {}, s0 = ' ' + t + ' ', err = null;
      s0 = s0.replace(/\s(?:to|until)\s*@?\s*(\d+(?:\.\d+)?)(?=\s)/, function (_, x) { k.until = Number(x); return ' '; });
      s0 = s0.replace(/\s(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*%(?=\s)/, function (_, a, z) { k.pct = Number(a); if (z != null) { k.pctHi = Number(z); if (!(k.pctHi > k.pct)) err = 'A percent range goes up: 75-80%.'; } return ' '; });
      s0 = s0.replace(/\s(?:@\s*)?(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*rir(?=\s)|\srir\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?(?=\s)/, function (_, a, z, a2, z2) {
        var lo = Number(a != null ? a : a2), hi = (z != null ? z : z2) != null ? Number(z != null ? z : z2) : null;
        if (hi != null && !(hi > lo)) err = 'An RIR range goes up: RIR 1-2.';
        k.rir = true; if (hi != null) { k.rpe = 10 - hi; k.rpeHi = 10 - lo; } else k.rpe = 10 - lo; return ' ';
      });
      if (!k.rir) s0 = s0.replace(/\s(?:@|rpe)?\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?(?=\s)/, function (_, a, z) { k.rpe = Number(a); if (z != null) { k.rpeHi = Number(z); if (!(k.rpeHi > k.rpe)) err = 'An RPE range goes up: 7.5-8.'; } return ' '; });
      if (err) return no(err);
      if (s0.trim() || (k.rpe == null && k.pct == null)) return no();
      if (k.rpe != null && (!isHalf(k.rpe) || (k.rpeHi != null && !isHalf(k.rpeHi)))) return no();
      if (k.pct != null && (k.pct < 1 || k.pct > 120 || (k.pctHi != null && k.pctHi > 120))) return no('A percent of the max runs from 1 to 120.');
      if (k.until != null && (!isHalf(k.until) || (k.rpe != null && k.until < k.rpe))) return no();
      return yes(k);
    }
    if (field === 'load') {
      var base = isNum(ctx.load) ? ctx.load : cur.w, sp = ctx.step || STEP;
      if ((m = /^([+-])\s*(\d+(?:\.\d+)?)\s*(%|kgs?)?$/.exec(t))) {
        if (!isNum(base)) return no('There is no load here to change. Type one, like 142.5.');
        var dv = (m[1] === '-' ? -1 : 1) * Number(m[2]), nw = m[3] === '%' ? round(base * (1 + dv / 100), sp) : r2(base + dv);
        return nw > 0 && nw <= 1000 ? yes({ w: nw }, { rel: true }) : no();
      }
      if (/^(?:bw|bodyweight)$/.test(t)) return yes({ bw: true });
      if ((m = /^(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)$/.exec(t))) { var lb = Number(m[1]), kgv = r2(lb * LB); return kgv > 0 && kgv <= 1000 ? yes({ w: kgv }, { lb: lb, text: nf(round(kgv, sp)), note: nf(lb) + ' lb is ' + nf(round(kgv, sp)) + ' kg on the plates.' }) : no(); }
      if ((m = /^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(?:kgs?)?$/.exec(t))) {
        var lw = Number(m[1]), hw = m[2] != null ? Number(m[2]) : null;
        if (!(lw > 0 && lw <= 1000)) return no('A load is more than 0 and under 1000 kg.');
        if (hw != null && !(hw > lw && hw <= 1000)) return no('A load range goes up: 140-145.');
        return yes(hw != null ? { w: lw, wHi: hw } : { w: lw });
      }
      return no();
    }
    if (field === 'tempo') {
      if ((m = /^(\d-\d-\d(?:-\d)?)$/.exec(t))) return yes({ tempo: m[1] });
      if ((m = /^([0-9x]{3,4})$/.exec(t)) && /\d/.test(m[1])) return yes({ tempo: m[1].toUpperCase() });
      if ((m = /^(?:paus(?:e|ed)\s*)?(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds?)?$/.exec(t)) && (/s|paus/.test(t))) { num = Number(m[1]); return num > 0 && num <= 10 ? yes({ pause: num }) : no(); }
      if (/^paus(?:e|ed)$/.test(t)) return yes({ pause: 2 });
      return no();
    }
    return no();
  }
  /* a back-off in words: "12% off top set", "top set load"; a stop rule follows ("12% off top set to @8.5") */
  function offWords(c) { if (!c || c.off == null) return ''; return (c.off ? nf(c.off) + '% off top set' : 'top set load') + (c.until != null ? ' to @' + nf(c.until) : ''); }
  /* a field as its cell reads it (o.ascii: a hyphen for the minus, as an input holds it; o.words: a back-off in words) */
  function fieldText(c, field, o) {
    o = o || {}; field = fieldName(field); if (!c) return '';
    var mn = o.ascii ? '-' : MINUS, s = '';
    if (field === 'sets') s = c.n == null ? '' : c.upTo ? 'up to ' + c.n : c.nHi != null ? c.n + '-' + c.nHi : String(c.n);
    else if (field === 'reps') s = c.r == null ? '' : c.r + (c.rHi != null ? '-' + c.rHi : '') + (c.amrap ? '+' : '');
    else if (field === 'effort') {
      /* o.words (spec C, F3.1): a back-off reads "12% off top set" in the RPE or % column, where a bare % reads as a share
         of the max; the canonical form stays "−12%" for the old readers */
      if (c.off != null) s = (o.words ? offWords(c) : (c.off ? mn + nf(c.off) + '%' : 'top') + (c.until != null ? ' to ' + nf(c.until) : ''))
        /* FIX-LOGIC (FP F3.5): a back-off with its own RPE keeps it: "15% off top set, @7" ("−15% @7") */
        + (c.rpe != null && !c.rir ? (o.words ? ', @' : ' @') + nf(c.rpe) + (c.rpeHi != null ? '-' + nf(c.rpeHi) : '') : '');
      else {
        var p = [];
        if (c.pct != null) p.push(nf(c.pct) + (c.pctHi != null ? '-' + nf(c.pctHi) : '') + '%');
        if (c.rpe != null) p.push(c.rir ? rirOf(c) + ' RIR' : (c.pct != null ? '@' : '') + nf(c.rpe) + (c.rpeHi != null ? '-' + nf(c.rpeHi) : ''));
        s = p.join(' ') + (c.until != null ? ' to ' + nf(c.until) : '');
      }
    } else if (field === 'load') s = c.bw ? 'bw' : c.w != null ? nf(c.w) + (c.wHi != null ? '-' + nf(c.wHi) : '') : o.load != null ? nf(o.load) : '';
    else if (field === 'tempo') s = c.tempo ? c.tempo : c.pause ? nf(c.pause) + ' s' : '';
    else if (field === 'note') s = c.note || '';
    else if (field === 'rest') s = restText(c.rest);
    else if (field === 'pauseAt') s = c.pauseAt || '';
    else if (field === 'acc') s = c.acc || '';
    else if (cxName(field)) s = c.cx && c.cx[cxName(field)] != null ? String(c.cx[cxName(field)]) : '';
    return s;
  }
  /* the cell after a field is written: the field's keys replaced; a percent and a load never both; a back-off has no load */
  function withField(cur, field, keys, whole) {
    var c = cellOf(cur) || {}, own = whole ? FKEYS.sets.concat(FKEYS.reps, FKEYS.effort, keys.w != null || keys.bw ? FKEYS.load : []) : cxName(field) ? ['cx'] : FKEYS[field] || [];
    own.forEach(function (k) { delete c[k]; });
    Object.keys(keys).forEach(function (k) { if (CKEYS.indexOf(k) >= 0 && keys[k] != null && keys[k] !== false) c[k] = keys[k]; });
    if (field === 'effort' && (keys.pct != null || keys.off != null)) { delete c.w; delete c.wHi; delete c.bw; }
    if (field === 'load' && (keys.w != null || keys.bw)) { delete c.pct; delete c.pctHi; delete c.off; if (keys.bw) { delete c.w; delete c.wHi; } }
    if (c.cx && !Object.keys(c.cx).length) delete c.cx;
    var any = Object.keys(c).some(function (k) { return k !== 'note'; });
    if (!any) return c.note ? { n: 1, note: c.note } : null;
    if (c.n == null) c.n = 1;
    return c;
  }

  /* ---------------- fields on the block (programs §5.5): one cell per field, read when the cell is left ---------------- */
  P.fieldCtx = function (r, c) {
    var row = this.rows[r], w = this.weeks[c], x = row && w ? row.cells[w.uid] || null : null, L = x ? this.load(r, c) : null;
    return { cell: cellOf(x), load: L ? L.kg : null, line: row ? row.line : 0, hasTop: !!this.topRow(row), step: this.stepFor(row), lift: row ? row.lift : null };
  };
  P.badField = function (r, c, field) { var row = this.rows[r], w = this.weeks[c]; field = fieldName(field); return row && w && row.badf && row.badf[w.uid] && row.badf[w.uid][field] != null ? row.badf[w.uid][field] : null; };
  P.fieldText = function (r, c, field, o) {
    var bad = this.badField(r, c, field); if (bad != null) return bad;
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return '';
    return fieldText(row.cells[w.uid] || null, field, o);
  };
  /* what writing a field does to the cell, without writing it (the WEEK-GRID's preview and the fill) */
  P.withField = function (r, c, field, t) {
    var pf = parseField(field, t, this.fieldCtx(r, c)), row = this.rows[r], w = this.weeks[c];
    if (!pf.ok || !row || !w) return pf;
    return { ok: true, field: pf.field, cell: withField(row.cells[w.uid] || null, pf.field, pf.keys, pf.whole), rel: !!pf.rel, whole: !!pf.whole };
  };
  /* one field of one cell, as one step back: unreadable text stays as typed, beside the cell (row.badf), and holds back Send */
  P.setField = function (r, c, field, t) {
    field = fieldName(field);
    var row = this.rows[r], w = this.weeks[c], self = this;
    if (!row || !w) return refuse('invalid', 'There is no cell there.');
    if (FIELDS.indexOf(field) < 0 && !cxName(field)) return refuse('invalid', 'A line has Sets, Reps, RPE or %, Load, Tempo and Notes.');
    if (this.isRO(r, c)) return refuse('locked', LIFTED);
    var pf = parseField(field, t, this.fieldCtx(r, c)), u = w.uid;
    if (!pf.ok) {
      var raw = String(t == null ? '' : t).trim();
      return this.commit('Write ' + this.where(r, c), function () {
        row.badf = row.badf || {}; row.badf[u] = row.badf[u] || {}; row.badf[u][field] = raw; w.sent = false;
        return { data: { r: r, c: c, field: field, bad: true, why: pf.why } };
      });
    }
    if (field === 'load' && row.line === 0 && row.lift && pf.keys.w != null && pf.keys.wHi == null && pf.lb == null) {
      var cur0 = row.cells[u];
      if (cur0 && cur0.w !== pf.keys.w) return this.setTopLoad(r, c, pf.keys.w, { clearBad: 'load' });
    }
    return this.commit('Write ' + this.where(r, c), function () {
      var cur = row.cells[u] || null, now = withField(cur, field, pf.keys, pf.whole), lt = null;
      if (pf.lb != null && now && now.w != null) now.w = round(now.w, self.stepFor(row));          /* converted once, to the lifter's step */
      if (field === 'effort' && cur && cur.w != null && now && now.w != null && now.rpe != null && cur.rpe != null && now.rpe < cur.rpe) {
        lt = self.lighterOf(r, c, now.rpe); if (lt && lt.kg != null) now.w = lt.kg;                  /* an easier RPE on a typed load: fewer kilos */
      }
      if (row.badf && row.badf[u]) { if (pf.whole) delete row.badf[u]; else { delete row.badf[u][field]; if (!Object.keys(row.badf[u]).length) delete row.badf[u]; } }
      var oldTop = row.line === 0 && cur ? self.load(r, c).kg : null;
      self.put(r, c, now);
      if (w.why && w.why[row.key] && w.why[row.key].field === 'load' && (field === 'load' || pf.whole || lt)) delete w.why[row.key];
      if (lt && lt.kg != null) { w.why = w.why || {}; w.why[row.key] = { kind: 'lighter', field: 'load', was: cur.w, now: now.w, other: lt.other, rpe: now.rpe }; }
      if (row.line === 0 && isNum(oldTop) && lt && lt.kg != null) self.followBackoffs(r, c, oldTop, lt.kg);
      return { data: { r: r, c: c, field: field, cell: self.cell(r, c), note: pf.note || null, other: lt ? lt.other : null } };
    });
  };
  /* one field typed into several cells (a relative entry applies to each cell's own value), one step back */
  P.fillField = function (rg, field, t) {
    var b = this.range(rg); if (!b) return NORANGE;
    field = fieldName(field); if (FIELDS.indexOf(field) < 0) return refuse('invalid', 'A line has Sets, Reps, RPE or %, Load, Tempo and Notes.');
    var self = this, tally = { wrote: 0, locked: 0, bad: 0, why: null }, cells = (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1);
    return this.commit('Fill ' + plural(cells, 'cell'), function () {
      for (var r = b.r0; r <= b.r1; r++) for (var c = b.c0; c <= b.c1; c++) {
        var row = self.rows[r], w = self.weeks[c], u = w.uid;
        if (self.isRO(r, c)) { tally.locked++; continue; }
        var pf = parseField(field, t, self.fieldCtx(r, c));
        if (!pf.ok) { row.badf = row.badf || {}; row.badf[u] = row.badf[u] || {}; row.badf[u][field] = String(t == null ? '' : t).trim(); w.sent = false; tally.bad++; tally.why = tally.why || pf.why; continue; }
        var now = withField(row.cells[u] || null, field, pf.keys, pf.whole);
        if (pf.lb != null && now && now.w != null) now.w = round(now.w, self.stepFor(row));
        if (row.badf && row.badf[u]) { delete row.badf[u][field]; if (!Object.keys(row.badf[u]).length) delete row.badf[u]; }
        self.put(r, c, now); tally.wrote++;
      }
      if (!tally.wrote && !tally.bad && tally.locked) return refuse('locked', LIFTED);
      return { data: tally };
    });
  };

  /* ---------------- dates: one date per session (programs §6.7, §6.4) ---------------- */
  P.dayOf = function (day) { var i = this.dayAt(day); return i < 0 ? null : this.days[i]; };
  /* the date a day keeps by its pattern: this week's own (a one-week move aside), else the same day in the nearest dated
     week ± 7 days a week, else the block's start (else the Monday of this week) plus the day's weekday */
  P.patternDate = function (c, day) {
    var w = this.weeks[c]; if (!w) return null;
    var own = function (wk) { if (!wk) return null; if (wk.moved && wk.moved[day]) return wk.moved[day]; return wk.dates && wk.dates[day] ? wk.dates[day] : null; };
    var x = own(w); if (x) return x;
    for (var k = 1; k < this.weeks.length; k++) {
      var a = own(this.weeks[c - k]); if (a) return K.add(a, 7 * k);
      var z = own(this.weeks[c + k]); if (z) return K.add(z, -7 * k);
    }
    var d = this.dayOf(day), start = this.start || K.monday(K.today), base = K.add(start, 7 * c), wd = d && d.wd != null ? d.wd : null;
    if (wd == null) { var i = this.dayAt(day); return K.add(base, i < 0 ? 0 : i * 2); }
    return K.add(base, (wd - K.d(base).getDay() + 7) % 7);
  };
  P.dateOf = function (c, day) { var w = this.weeks[c]; if (!w) return null; return (w.dates && w.dates[day]) || this.patternDate(c, day); };
  P.rowsOfDay = function (day) { var out = []; this.rows.forEach(function (row, r) { if (row.day === day) out.push(r); }); return out; };
  /* the days of a week, in date order: { name, iso, off, moved (the date it had), lines, merged (the session's name) } */
  P.daysOf = function (c) {
    var w = this.weeks[c], self = this; if (!w) return [];
    return this.days.map(function (d, i) {
      var lines = self.rows.filter(function (row) { return row.day === d.name && row.cells[w.uid]; }).length, mg = (w.merged || []).filter(function (m) { return m.days.indexOf(d.name) >= 0; })[0];
      return { name: d.name, i: i, iso: self.dateOf(c, d.name), off: !!(w.off && w.off[d.name]), moved: (w.moved && w.moved[d.name]) || null, lines: lines, merged: mg ? self.sessionName(c, mg.days) : null };
    })
    /* LOGIC-FIX-4 (walk 2, Arjun's run-in): a meet-week day (Openers, Last session) is a day only in a week that holds lines on
       it, never an empty day in the weeks before */
      .filter(function (x) { return x.lines || !PEAKDAY.test(x.name); })
      .sort(function (a, z) { return a.iso < z.iso ? -1 : a.iso > z.iso ? 1 : a.i - z.i; });
  };
  P.moveDay = function (c, day, iso, o) {
    o = o || {}; var w = this.weeks[c], i = this.dayAt(day), self = this;
    if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (i < 0) return refuse('invalid', 'There is no day called ' + (day ? '“' + day + '”' : 'that') + '.');
    if (!isIso(iso)) return refuse('invalid', 'A date is written like 2026-11-14.');
    if (w.state === 'lifted' || w.started[day]) return refuse('locked', day + ' was lifted. It stays on its day.');
    var from = this.dateOf(c, day), scope = o.scope === 'on' ? 'on' : 'week';
    if (from === iso && scope === 'week') return { data: { c: c, day: day, from: from, to: iso, changed: false } };
    return this.commit('Move ' + day + ' to ' + dayWords(iso) + (scope === 'on' ? ', from week ' + (w.n || c + 1) + ' on' : ''), function () {
      if (scope === 'week') {
        w.moved = w.moved || {}; if (!w.moved[day]) w.moved[day] = self.patternDate(c, day);
        w.dates[day] = iso; if (w.moved[day] === iso) delete w.moved[day]; w.sent = false;
      } else {
        var delta = daysBetween(from, iso), was = self.weeks.map(function (x, k) { return self.dateOf(k, day); });
        self.weeks.forEach(function (x, k) { if (k < c || x.state === 'lifted' || x.started[day]) return; x.dates[day] = K.add(was[k], delta); if (x.moved) delete x.moved[day]; x.sent = false; });
        self.days[i].wd = K.d(iso).getDay();
      }
      return { data: { c: c, day: day, from: from, to: iso, scope: scope } };
    });
  };
  P.swapDays = function (c, a, z) {
    var w = this.weeks[c], self = this; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (this.dayAt(a) < 0 || this.dayAt(z) < 0 || a === z) return refuse('invalid', 'Swap two days of this week.');
    if (w.state === 'lifted' || w.started[a] || w.started[z]) return refuse('locked', 'A day that was lifted stays on its day.');
    var da = this.dateOf(c, a), dz = this.dateOf(c, z);
    return this.commit('Swap ' + a + ' and ' + z + ' in week ' + (w.n || c + 1), function () {
      w.moved = w.moved || {};
      [a, z].forEach(function (d) { if (!w.moved[d]) w.moved[d] = self.patternDate(c, d); });
      w.dates[a] = dz; w.dates[z] = da; w.sent = false;
      [a, z].forEach(function (d) { if (w.moved[d] === w.dates[d]) delete w.moved[d]; });
      return { data: { c: c, days: [a, z], dates: [dz, da] } };
    });
  };
  P.dropDay = function (c, day) {
    var w = this.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (this.dayAt(day) < 0) return refuse('invalid', 'There is no day called ' + (day ? '“' + day + '”' : 'that') + '.');
    if (w.state === 'lifted' || w.started[day]) return refuse('locked', day + ' was lifted. It stays.');
    if (w.off[day]) return { data: { c: c, day: day, changed: false } };
    return this.commit('Take ' + day + ' out of week ' + (w.n || c + 1), function () { w.off[day] = true; w.sent = false; return { data: { c: c, day: day } }; });
  };
  P.restoreDay = function (c, day) {
    var w = this.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (!w.off[day]) return { data: { c: c, day: day, changed: false } };
    return this.commit('Put ' + day + ' back in week ' + (w.n || c + 1), function () { delete w.off[day]; w.sent = false; return { data: { c: c, day: day } }; });
  };

  /* ---------------- sessions, minutes and merges (programs §6.10, shared.md §4.13) ---------------- */
  P.minutesOfRows = function (rs, c) {
    var w = this.weeks[c], self = this, mins = 0, lifts = {}; if (!w) return 0;
    rs.forEach(function (r) { var row = self.rows[r], x = row && row.cells[w.uid]; if (!x) return; var n = x.n == null ? 1 : x.n; if (row.lift) { mins += 4 * n; lifts[row.lift] = 1; } else mins += 2.5 * n; });
    mins += 10 * Object.keys(lifts).length;
    return Math.round(mins / 5) * 5;
  };
  P.sessionName = function (c, days) {
    var self = this, w = this.weeks[c], lifts = [];
    this.rows.forEach(function (row) { if (days.indexOf(row.day) >= 0 && row.lift && row.line === 0 && w && row.cells[w.uid] && lifts.indexOf(row.lift) < 0) lifts.push(row.lift); });
    lifts.sort(function (a, z) { return LIFT_ORDER[a] - LIFT_ORDER[z]; });
    return lifts.length ? cap1(joinAnd(lifts.map(liftWord))) : joinAnd(days);
  };
  /* a week's sessions in date order: two days merged are one session (its rows in the merge's order) */
  P.sessions = function (c) {
    var w = this.weeks[c], self = this, out = [], by = {}; if (!w) return out;
    var rowsOf = function (day, has) { var rs = []; self.rows.forEach(function (row, r) { if (row.day === day && (has ? row.cells[w.uid] : w.out && w.out[row.key])) rs.push(r); }); return rs; };
    var idx = function (key) { for (var i = 0; i < self.rows.length; i++) if (self.rows[i].key === key) return i; return -1; };
    this.days.forEach(function (d) {
      var rs = rowsOf(d.name, true), outs = rowsOf(d.name, false);
      if (!rs.length && !outs.length) return;
      var mg = (w.merged || []).filter(function (m) { return m.days.indexOf(d.name) >= 0; })[0];
      if (mg && !w.off[d.name]) {
        var key = 'm' + mg.days.join('|');
        if (!by[key]) {
          var ord = mg.order.map(idx).filter(function (r) { return r >= 0 && self.rows[r].cells[w.uid]; });
          mg.days.forEach(function (dn) { rowsOf(dn, true).forEach(function (r) { if (ord.indexOf(r) < 0) ord.push(r); }); });
          by[key] = { iso: mg.iso, days: mg.days.slice(), name: self.sessionName(c, mg.days), merged: true, rows: ord, out: [], limit: mg.minutes || null };
          out.push(by[key]);
        }
        outs.forEach(function (r) { by[key].out.push(r); });
        return;
      }
      out.push({ iso: self.dateOf(c, d.name), days: [d.name], name: d.name, merged: false, rows: rs, out: outs, off: !!w.off[d.name], limit: null });
    });
    out.forEach(function (s) { s.minutes = self.minutesOfRows(s.rows, c); });
    return out.sort(function (a, z) { return a.iso < z.iso ? -1 : a.iso > z.iso ? 1 : self.dayAt(a.days[0]) - self.dayAt(z.days[0]); });
  };
  P.minutes = function (c, day) {
    var ss = this.sessions(c); for (var i = 0; i < ss.length; i++) if (ss[i].days.indexOf(day) >= 0 || ss[i].iso === day) return ss[i].minutes;
    return 0;
  };
  /* two days as one session on one date: the main lifts of both in lift order, then accessories while the session stays
     inside the minutes; the rest are out this week, with a tick to put each back (b.restoreLine) */
  P.mergeDays = function (c, pair, o) {
    o = o || {}; var w = this.weeks[c], self = this, a = pair && pair[0], z = pair && pair[1];
    if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (this.dayAt(a) < 0 || this.dayAt(z) < 0 || a === z) return refuse('invalid', 'Merge two days of this week.');
    if (w.state === 'lifted' || w.started[a] || w.started[z]) return refuse('locked', 'A day that was lifted stays as it was.');
    var into = isIso(o.into) ? o.into : this.dateOf(c, z), l = lifterOf(this), lim = isNum(o.minutes) ? o.minutes : (l && l.intake && isNum(l.intake.sessionMinutes) ? l.intake.sessionMinutes : null);
    var all = []; this.rows.forEach(function (row, r) { if ((row.day === a || row.day === z) && row.cells[w.uid]) all.push(r); });
    var exLift = function (row) { var top = self.topRow(row) || row; return top.lift || row.lift; };
    var main = all.filter(function (r) { return self.rows[r].lift; }).sort(function (p, q) {
      var x = self.rows[p], y = self.rows[q];
      return (LIFT_ORDER[exLift(x)] - LIFT_ORDER[exLift(y)]) || (self.dayAt(x.day) - self.dayAt(y.day)) || (x.ex - y.ex) || (x.line - y.line) || (p - q);
    });
    var acc = all.filter(function (r) { return !self.rows[r].lift; }), keep = main.slice(), out = [];
    acc.forEach(function (r) { if (lim == null || self.minutesOfRows(keep.concat([r]), c) <= lim) keep.push(r); else out.push(r); });
    var name = this.sessionName(c, [a, z]);
    return this.commit('Merge ' + a + ' and ' + z + ' on ' + dayWords(into), function () {
      w.moved = w.moved || {};
      [a, z].forEach(function (d) { if (!w.moved[d]) w.moved[d] = self.patternDate(c, d); w.dates[d] = into; });
      w.out = w.out || {};
      out.forEach(function (r) { var row = self.rows[r]; w.out[row.key] = row.cells[w.uid]; self.put(r, c, null); });
      w.merged = (w.merged || []).filter(function (m) { return m.days.indexOf(a) < 0 && m.days.indexOf(z) < 0; });
      w.merged.push({ days: [a, z], iso: into, order: keep.map(function (r) { return self.rows[r].key; }), out: out.map(function (r) { return self.rows[r].key; }), minutes: lim });
      w.sent = false;
      var minutes = self.minutesOfRows(keep, c);
      return { data: { c: c, iso: into, name: name, rows: keep, out: out, minutes: minutes, limit: lim, text: dayWords(into) + '  ' + name + '  about ' + minutes + (lim ? ' of ' + lim : '') + ' min' } };
    });
  };
  /* a line out this week (a merge past the minutes, a swap) comes back */
  P.restoreLine = function (r, c) {
    var row = this.rows[r], w = this.weeks[c], self = this;
    if (!row || !w || !w.out || !w.out[row.key]) return refuse('invalid', 'That line is in this week already.');
    return this.commit('Put ' + row.name + ' back in week ' + (w.n || c + 1), function () {
      var x = w.out[row.key]; delete w.out[row.key]; self.put(r, c, x);
      (w.merged || []).forEach(function (m) { var i = m.out.indexOf(row.key); if (i >= 0) { m.out.splice(i, 1); m.order.push(row.key); } });
      return { data: { r: r, c: c } };
    });
  };
  /* one week only: the exercise's lines are out of week c, and a line `to` (with its cell) sits under them for that week */
  P.swapWeek = function (r, c, to, cell, o) {
    o = o || {}; var row = this.rows[r], w = this.weeks[c], self = this;
    if (!row || !w) return refuse('invalid', 'There is no line there.');
    if (this.isRO(r, c)) return refuse('locked', LIFTED);
    /* coach.js names a swap { name, lift, variant }; a name alone still reads (request #8) */
    if (to && typeof to === 'object') { if (o.lift === undefined && to.lift !== undefined) o.lift = to.lift; to = to.name; }
    var nm = words0(to); if (!nm) return refuse('invalid', 'A swap needs an exercise.');
    var lib = libFind(nm), lift = o.lift !== undefined ? o.lift : lib ? lib.lift : liftOfName(nm);
    var x = typeof cell === 'string' ? parse(cell, { step: MAIN[lift] ? this.steps[lift] : STEP }) : { ok: true, cell: cellOf(cell) };
    if (!x.ok || !x.cell) return refuse('invalid', x.why || 'Type the sets of the swap, like 3x5 @6.');
    /* a back-off line named on its own (Dev: 'Bench Day|Bench|1|1') swaps that line only; line 0 swaps the exercise */
    var lines = []; this.rows.forEach(function (y, i) { if (y.day === row.day && y.ex === row.ex && (row.line === 0 || i === r)) lines.push(i); });
    var at = lines[lines.length - 1] + 1, u = w.uid;
    var nr = { key: row.day + '|' + nm + '|s' + (++this.seq) + '|0', day: row.day, ex: this.maxEx() + 1, line: 0, title: nm, name: lib ? lib.name : sentence(nm), label: '', lift: MAIN[lift] ? lift : null, cat: lift || null, variant: MAIN[lift] ? 'Competition' : '', note: '', pause: 0, tempo: '', prog: 'same', cells: {}, only: u, swapFor: row.key };
    if (MAIN[lift]) nr.factor = isNum(o.ratio) ? o.ratio : 1;
    return this.commit('Swap ' + row.name + ' for ' + nr.name.toLowerCase() + ' in week ' + (w.n || c + 1), function () {
      w.out = w.out || {};
      lines.forEach(function (i) { var y = self.rows[i]; if (y.cells[u]) { w.out[y.key] = y.cells[u]; self.put(i, c, null); } });
      self.rows.splice(at, 0, nr); nr.cells[u] = x.cell; w.sent = false;
      w.swaps = w.swaps || []; w.swaps.push({ from: lines.map(function (i) { return self.rows[i < at ? i : i + 1].key; }), to: nr.key, lift: row.lift, name: row.name, why: o.why || null });
      return { data: { r: at, c: c, cell: self.cell(at, c) } };
    });
  };

  /* ---------------- lighter, caps, top sets and follow (shared.md §4.1, §4.2, §4.6) ---------------- */
  /* BLOCK.lighter for one line: from the line as written that week (a rule's change taken out), never above the load now */
  P.lighterOf = function (r, c, rpe, x) {
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return null;
    var cur = row.cells[w.uid]; x = x || cellOf(cur); if (!x) return null;
    var why = w.why && w.why[row.key], written = x.w;
    if (why && why.kind === 'rule' && isNum(why.was) && x.w === why.now) written = why.was;
    var now = cur ? this.loadAt(row, cur, w.uid, true).kg : null, own = isNum(row.max) && row.max > 0 ? row.max : null;
    return lighter({ r: x.r, rHi: x.rHi, rpe: x.rpe, rpeHi: x.rpeHi, w: written, kg: isNum(now) ? now : written, max: own || (row.lift ? this.rowMax(row, w.uid) : null), factor: own ? 1 : factorOf(row), step: this.stepFor(row) }, rpe);
  };
  /* the typed back-offs under a top set move by the top set's ratio, rounded to the step (inside a commit) */
  P.followBackoffs = function (r, c, oldTop, newTop) {
    var row = this.rows[r], w = this.weeks[c], self = this, out = [];
    if (!row || !w || !isNum(oldTop) || !isNum(newTop) || !(oldTop > 0) || oldTop === newTop) return out;
    this.rows.forEach(function (y, i) {
      if (y.day !== row.day || y.ex !== row.ex || y.line <= row.line || self.isRO(i, c)) return;
      if (w.why && w.why[y.key] && w.why[y.key].kind === 'rule') return;                     /* its own rule moved it already */
      var x = y.cells[w.uid]; if (!x || x.w == null) return;
      var nk = round(x.w * newTop / oldTop, self.stepFor(y)); if (nk === x.w) return;
      var z = cellOf(x); z.w = nk; if (z.wHi != null) z.wHi = round(x.wHi * newTop / oldTop, self.stepFor(y)); var was = x.w; self.put(i, c, z);
      w.why = w.why || {}; w.why[y.key] = { kind: 'follow', field: 'load', was: was, now: nk, top: newTop };
      out.push({ r: i, was: was, now: nk });
    });
    return out;
  };
  /* every later week not lifted re-steps the line (and its typed back-offs) by its weekly rule from week c (inside a commit) */
  P.followWeeks = function (r, c) {
    var row = this.rows[r], w = this.weeks[c], self = this, out = []; if (!row || !w) return out;
    var lines = []; this.rows.forEach(function (y, i) { if (y.day === row.day && y.ex === row.ex) lines.push(i); });
    for (var k = c + 1; k < this.weeks.length; k++) {
      var wk = this.weeks[k], top = null; if (wk.state === 'lifted') continue;
      lines.forEach(function (i) {
        var y = self.rows[i], base = y.cells[w.uid], x = y.cells[wk.uid]; if (!base || base.w == null || !x || x.w == null || self.isRO(i, k)) return;
        var st = stepOf(y, base, k - c, base.w), z = cellOf(x); if (!st || st.w == null || st.w === x.w) { if (i === r) top = x.w; return; }
        z.w = st.w; self.put(i, k, z); if (i === r) top = st.w;
        wk.why = wk.why || {}; wk.why[y.key] = { kind: 'follow', field: 'load', was: x.w, now: st.w, from: c };
      });
      if (top != null) out.push({ c: k, n: wk.n || k + 1, kg: top });
    }
    return out;
  };
  P.setTopLoad = function (r, c, kg, o) {
    o = o || {}; var row = this.rows[r], w = this.weeks[c], self = this;
    if (!row || !w) return refuse('invalid', 'There is no line there.');
    if (row.line !== 0) return refuse('invalid', 'The top set is the first line of an exercise.');
    if (this.isRO(r, c)) return refuse('locked', LIFTED);
    if (!(isNum(kg) && kg > 0 && kg <= 1000)) return refuse('invalid', 'A load is a number of kg, like 142.5.');
    var cur = row.cells[w.uid] || null, old = cur ? this.load(r, c).kg : null;
    return this.commit('Set ' + row.name.toLowerCase() + ' to ' + nf(kg) + ' in week ' + (w.n || c + 1), function () {
      var x = cellOf(cur) || { n: 1 }; delete x.pct; delete x.pctHi; delete x.off; delete x.bw; delete x.wHi; x.w = r2(kg);
      if (o.clearBad && row.badf && row.badf[w.uid]) { delete row.badf[w.uid][o.clearBad]; if (!Object.keys(row.badf[w.uid]).length) delete row.badf[w.uid]; }
      self.put(r, c, x);
      if (w.why) delete w.why[row.key];
      var back = self.followBackoffs(r, c, old, x.w), later = w.state === 'now' || o.only ? [] : self.followWeeks(r, c);   /* o.only: this week only, later weeks keep theirs */
      var said = cap1(row.name.toLowerCase()) + ' ' + nf(x.w) + (x.r != null ? ' × ' + x.r : '') + (x.rpe != null ? ' @' + nf(x.rpe) : '') + ' in week ' + (w.n || c + 1) + '.' + (later.length ? ' Week ' + later[0].n + ' follows: ' + nf(later[0].kg) + '.' : '');
      return { data: { r: r, c: c, kg: x.w, backoffs: back, follows: later, text: said } };
    });
  };
  /* one line easier: its RPE no higher than rpe and, typed, fewer kilos by BLOCK.lighter (o.use 'other': the other number) */
  P.lighter = function (r, c, rpe, o) {
    o = o || {}; var row = this.rows[r], w = this.weeks[c], self = this;
    if (!row || !w) return refuse('invalid', 'There is no line there.');
    if (this.isRO(r, c)) return refuse('locked', LIFTED);
    if (!isHalf(Number(rpe))) return refuse('invalid', 'RPE runs from 1 to 10, in halves.');
    var cur = row.cells[w.uid]; if (!cur) return refuse('invalid', 'There is nothing written there.');
    return this.commit('Make ' + row.name.toLowerCase() + ' lighter in week ' + (w.n || c + 1), function () { return { data: self.easeLine(r, c, Number(rpe), 'lighter', o.use === 'other') }; });
  };
  /* inside a commit: one line at an RPE ceiling (lighter or cap) */
  P.easeLine = function (r, c, rpe, kind, useOther) {
    var row = this.rows[r], w = this.weeks[c], cur = row.cells[w.uid], x = cellOf(cur), why = w.why && w.why[row.key];
    if (why && why.kind === 'rule' && isNum(why.was) && x.w === why.now) x.w = why.was;          /* a rule's change taken out */
    var before = this.loadAt(row, cur, w.uid, true).kg, lt = null, oldTop = row.line === 0 ? before : null;
    if (x.rpe != null && (x.rpe > rpe || (x.rpeHi != null && x.rpeHi > rpe))) {
      if (x.w != null) { lt = this.lighterOf(r, c, rpe, x); if (lt && lt.kg != null) x.w = useOther && lt.other != null ? lt.other : lt.kg; }
      x.rpe = Math.min(x.rpe, rpe); delete x.rpeHi; if (x.until != null && x.until < x.rpe) delete x.until;
    }
    this.put(r, c, x);
    w.why = w.why || {};
    var after = this.loadAt(row, row.cells[w.uid], w.uid, true).kg;
    if (kind === 'cap') { w.capped = w.capped || {}; w.capped[row.key] = rpe; }
    if (kind === 'cap' || lt) w.why[row.key] = { kind: kind, field: 'load', was: before, now: after, other: lt && lt.other != null ? (useOther ? lt.kg : lt.other) : null, rpe: rpe };
    else if (why && why.kind === 'rule') delete w.why[row.key];
    var back = row.line === 0 && isNum(oldTop) && isNum(after) ? this.followBackoffs(r, c, oldTop, after) : [];
    return { r: r, c: c, was: before, now: after, other: lt ? lt.other : null, backoffs: back };
  };
  /* "Make this week lighter": every top set of a main lift not lifted yet, at that RPE (an item's light act) */
  P.lighterWeek = function (c, rpe) {
    var w = this.weeks[c], self = this; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (!isHalf(Number(rpe))) return refuse('invalid', 'RPE runs from 1 to 10, in halves.');
    var rs = []; this.rows.forEach(function (row, r) { var x = row.cells[w.uid]; if (row.line === 0 && row.lift && (!row.variant || row.variant === 'Competition') && x && x.rpe != null && x.rpe > rpe && !self.isRO(r, c)) rs.push(r); });
    if (!rs.length) return { data: { c: c, lines: [], changed: false } };
    return this.commit('Make week ' + (w.n || c + 1) + ' lighter', function () { return { data: { c: c, lines: rs.map(function (r) { return self.easeLine(r, c, Number(rpe), 'lighter'); }) } }; });
  };
  /* a cap: an RPE ceiling for one lift on one day in week c; no rule adds to those lines that week (programs §6.5) */
  P.cap = function (c, o) {
    o = o || {}; var w = this.weeks[c], self = this, lift = o.lift, rpe = Number(o.rpe);
    if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    if (!MAIN[lift]) return refuse('invalid', 'A cap is for the squat, the bench or the deadlift.');
    if (!isHalf(rpe)) return refuse('invalid', 'RPE runs from 1 to 10, in halves.');
    var rs = []; this.rows.forEach(function (row, r) { if (row.lift === lift && (!o.day || row.day === o.day) && row.cells[w.uid] && !self.isRO(r, c)) rs.push(r); });
    if (!rs.length) return refuse('invalid', 'There is no ' + liftWord(lift) + ' line ' + (o.day ? 'on ' + o.day + ' ' : '') + 'in week ' + (w.n || c + 1) + ' to cap.');
    rs.sort(function (p, q) { return self.rows[p].line - self.rows[q].line || p - q; });
    return this.commit('Cap ' + liftWord(lift) + 's at RPE ' + nf(rpe) + ' in week ' + (w.n || c + 1), function () {
      var lines = [], done = {};
      rs.forEach(function (r) {
        var row = self.rows[r]; if (done[row.key]) return;
        var top = self.topRow(row);
        if (row.line > 0 && top && rs.indexOf(self.rows.indexOf(top)) >= 0 && row.cells[w.uid] && row.cells[w.uid].w != null) {  /* typed back-offs follow the top set */
          var y = cellOf(row.cells[w.uid]); if (y.rpe != null && y.rpe > rpe) { y.rpe = rpe; delete y.rpeHi; self.put(r, c, y); }
          w.capped = w.capped || {}; w.capped[row.key] = rpe; done[row.key] = 1; return;
        }
        lines.push(self.easeLine(r, c, rpe, 'cap')); done[row.key] = 1;
      });
      var top0 = lines.filter(function (x) { return self.rows[x.r].line === 0 && (!self.rows[x.r].variant || self.rows[x.r].variant === 'Competition'); })[0] || lines[0];
      return { data: { c: c, lift: lift, rpe: rpe, lines: lines, kg: top0 ? top0.now : null, other: top0 ? top0.other : null } };
    });
  };
  P.uncap = function (c, o) {
    o = o || {}; var w = this.weeks[c], self = this; if (!w || !w.capped) return { data: { changed: false } };
    return this.commit('Take the cap off', function () {
      self.rows.forEach(function (row, r) {
        if (w.capped[row.key] == null || (o.lift && row.lift !== o.lift) || (o.day && row.day !== o.day)) return;
        delete w.capped[row.key];
        var why = w.why && w.why[row.key];
        if (why && why.kind === 'cap' && isNum(why.was) && row.cells[w.uid] && row.cells[w.uid].w != null) { var x = cellOf(row.cells[w.uid]); x.w = why.was; self.put(r, c, x); }
        if (why && why.kind === 'cap') delete w.why[row.key];
      });
      return { data: { c: c } };
    });
  };

  /* ---------------- weeks: writing from another, deload kinds, defaults, steps, names, locks ---------------- */
  var DELOADS = [{ id: 'half-easier', label: 'Half the sets, 1.5 easier' }, { id: 'half', label: 'Half the sets, same RPE' }, { id: 'easier', label: 'Same sets, 1.5 easier' }];
  var DELOAD_IDS = DELOADS.map(function (d) { return d.id; });
  function deloadKindOf(b, kind) { if (DELOAD_IDS.indexOf(kind) >= 0) return kind; if (b && DELOAD_IDS.indexOf(b.deloadKind) >= 0) return b.deloadKind; var dk = D && D.coach && (D.coach.deload || D.coach.deloadKind); return DELOAD_IDS.indexOf(dk) >= 0 ? dk : 'half-easier'; }
  /* one cell as a deload of that kind: half the sets rounded up; 1.5 RPE easier, % lines 10 points lower, typed loads 10%
     lighter, a stop rule 1.5 easier; every note carried */
  function deloadCell(x, kind, step) {
    var y = cellOf(x); if (!y) return y;
    var half = kind !== 'easier', easier = kind !== 'half';
    if (half) { y.n = Math.max(1, Math.ceil((y.n == null ? 1 : y.n) / 2)); if (y.nHi != null) { y.nHi = Math.ceil(y.nHi / 2); if (!(y.nHi > y.n)) delete y.nHi; } }
    if (easier) {
      if (y.rpe != null) { y.rpe = Math.max(1, y.rpe - 1.5); if (y.rpeHi != null) y.rpeHi = Math.max(y.rpe + 0.5, y.rpeHi - 1.5); }
      if (y.pct != null) { y.pct = Math.max(1, y.pct - 10); if (y.pctHi != null) y.pctHi = Math.max(y.pct + 1, y.pctHi - 10); }
      if (y.w != null) { y.w = round(y.w * 0.9, step); if (y.wHi != null) y.wHi = round(y.wHi * 0.9, step); }
      if (y.until != null) y.until = Math.max(y.rpe != null ? y.rpe : 1, y.until - 1.5);
    }
    return y;
  }
  P.weekName = function (c) {
    var w = this.weeks[c]; if (!w) return '';
    if (w.label) return w.label;
    if (w.phase) return w.phase + ' ' + (w.pn || 1);
    return 'Week ' + (w.n || c + 1);
  };
  P.setStep = function (lift, kg) {
    if (!MAIN[lift]) return refuse('invalid', 'Steps are for the squat, the bench and the deadlift.');
    if ([0.5, 1, 1.25, 2, 2.5, 5].indexOf(Number(kg)) < 0) return refuse('invalid', 'A step is 1.25, 2.5 or 5 kg.');
    if (this.steps[lift] === Number(kg)) return { data: { lift: lift, kg: kg, changed: false } };
    var self = this; return this.commit(K.LIFT[lift] + ' in ' + nf(kg) + ' kg steps', function () { self.steps[lift] = Number(kg); return { data: { lift: lift, kg: Number(kg) } }; });
  };
  P.setDefaults = function (o) {
    o = o || {}; var self = this;
    if (o.prog != null && PROG_IDS.indexOf(o.prog) < 0) return refuse('invalid', 'A line moves ' + PROGS.map(function (p) { return p[1].toLowerCase(); }).join(', ') + '.');
    if (o.deloadAt != null && !(isNum(o.deloadAt) && o.deloadAt >= 2 && o.deloadAt % 1 === 0)) return refuse('invalid', 'A deload week is week 2 or later.');
    return this.commit('How new lines move', function () { if (o.prog !== undefined) self.defaults.prog = o.prog; if (o.deloadAt !== undefined) self.defaults.deloadAt = o.deloadAt; return { data: clone(self.defaults) }; });
  };
  P.setRules = function (o) {
    var self = this, l = lifterOf(this);
    return this.commit('Rules for ' + ((l && l.first) || 'this lifter'), function () { self.rules = o ? clone(o) : null; return { data: { rules: self.rules } }; });
  };
  /* a sent week keeps its loads as numbers (shared.md §4.11): call when the store sends it */
  P.lock = function (c) {
    var w = this.weeks[c], self = this; if (!w) return refuse('invalid', 'There is no week ' + (Number(c) + 1) + '.');
    var lk = {}; this.rows.forEach(function (row) { var x = row.cells[w.uid]; if (!x || x.lifted || x.w != null) return; var L = engine0(self, row, x, w.uid, false); if (isNum(L.kg)) lk[row.key] = L.kg; });
    return this.commit('Keep week ' + (w.n || c + 1) + '’s loads', function () { w.lock = lk; return { data: { c: c, n: Object.keys(lk).length } }; });
  };
  P.unlock = function (c) { var w = this.weeks[c]; if (!w || !w.lock) return { data: { changed: false } }; return this.commit('Week ' + (w.n || c + 1) + '’s loads from the maxes', function () { delete w.lock; return { data: { c: c } }; }); };
  P.isLocked = function (r, c) { var row = this.rows[r], w = this.weeks[c]; return !!(row && w && w.lock && isNum(w.lock[row.key])); };

  /* ---------------- a variant's own max (shared.md §4.14) ---------------- */
  P.setRowMax = function (r, kg) {
    var row = this.rows[r], self = this; if (!row) return refuse('invalid', 'There is no line there.');
    if (!row.lift) return refuse('invalid', row.name + ' does not count toward a main lift, so it has no max.');
    if (kg !== null && !(isNum(kg) && kg >= 20 && kg <= 600)) return refuse('invalid', 'A max is a number of kg from 20 to 600, like 152.5.');
    return this.commit(kg == null ? row.name + ' max from the ' + liftWord(row.lift) + ' again' : row.name + ' max ' + nf(kg), function () {
      self.rows.forEach(function (y) { if (y.day === row.day && y.ex === row.ex) { if (kg == null) { delete y.max; delete y.maxFrom; } else { y.max = r2(kg); y.maxFrom = 'typed'; } } });
      return { data: { r: r, kg: kg } };
    });
  };
  /* worked out from 3 or more rated sets of its own in the last 6 weeks: the middle of its sessions' best e1RMs */
  P.variantOffer = function (r, o) {
    o = o || {}; var row = this.rows[r], self = this, today = o.today || K.today; if (!row || !row.lift || !row.variant || row.variant === 'Competition') return null;
    var by = {}, n = 0;
    this.rows.forEach(function (y) {
      if (y.day !== row.day || y.ex !== row.ex) return;
      self.weeks.forEach(function (w) { var x = y.cells[w.uid], lt = x && x.lifted; (lt && lt.sets || []).forEach(function (s) {
        if (s.skipped || !s.rated || !s.w || !(s.r >= 1 && s.r <= 10) || !(s.felt >= 6) || !s.on || daysBetween(s.on, today) > 42 || s.on > today) return;
        n++; var e = e1rm(s.w, s.r, s.felt); if (!by[s.on] || e > by[s.on]) by[s.on] = e;
      }); });
    });
    var es = Object.keys(by).sort().map(function (k) { return by[k]; }).slice(-3); if (n < 3 || !es.length) return null;
    var mid = es.slice().sort(function (a, z) { return a - z; })[Math.floor((es.length - 1) / 2)], mx = this.maxes[row.lift];
    if (!isNum(mx) || !mx) return null;
    var ratio = Math.round(mx / mid * 100) / 100, app = mult(row.lift, row.variant), l = lifterOf(this);
    return { kg: round(mid, this.stepFor(row)), e1: Math.round(mid * 10) / 10, ratio: ratio, app: app, n: n, text: row.name + ' runs ' + ratio.toFixed(2) + ' for ' + ((l && l.first) || 'this lifter') + ', the app says ' + app.toFixed(2) + ': use ' + (pronoun(l) === 'their' ? 'theirs' : pronoun(l) === 'her' ? 'hers' : 'his') + '?' };
  };

  /* ---------------- the Last week column (programs §5.3): every set of the line as lifted, compact ---------------- */
  function compactSets(lt, x) {
    var sets = (lt.sets || []).filter(function (s) { return !s.skipped; }), felt = null;
    if (!sets.length) return lt.w ? nf(lt.w) + ' × ' + (x && x.r != null ? x.r : '') : '';
    sets.forEach(function (s) { if (s.rated && (felt == null || s.felt > felt)) felt = s.felt; });
    var w0 = sets[0].w, same = sets.every(function (s) { return s.w === w0; }), reps = sets.map(function (s) { return s.r; }).join(', ');
    var t = !w0 && same ? reps : same ? nf(w0) + ' × ' + reps : sets.map(function (s) { return (s.w ? nf(s.w) + ' × ' : '') + s.r; }).join(', ');
    return t + (felt != null ? ' @' + nf(felt) : '');
  }
  var MARKWORD = function (m) { return !m ? null : m.kind === 'short' || m.kind === 'skipped' || m.kind === 'pain' ? m.text : m.kind === 'note' || m.kind === 'video' ? m.kind : null; };
  /* b.lastWeek(r, c, { from }) → { text, mark, state ('lifted' | 'tocome' | 'missed' | 'swapped' | 'intake' | 'none'), head } */
  P.lastWeek = function (r, c, o) {
    o = o || {}; var row = this.rows[r]; if (!row) return null;
    var today = o.today || K.today, src = o.from != null ? o.from : c - 1, head = o.from != null && this.weeks[o.from] ? this.weekName(o.from) : 'Last week';
    var read = function (x, iso, mark) {
      var lt = x && x.lifted;
      if (lt && lt.done > 0) return { text: compactSets(lt, x) + (lt.by === 'coach' ? ', logged by you' : ''), mark: MARKWORD(mark), state: 'lifted', on: lt.on || iso || null };
      if (iso && iso >= today && !(lt && lt.done === 0 && iso < today)) return { text: K.wd3(iso) + ', to come', mark: null, state: 'tocome', on: iso };
      return { text: 'missed', mark: 'missed', state: 'missed', on: iso || null };
    };
    var out;
    if (src < 0 || !this.weeks[src]) {
      if (row.last && row.last.cell) { out = read(row.last.cell, row.last.iso, null); out.head = 'Week ' + row.last.n; return out; }
      var l = lifterOf(this), ib = row.line === 0 && row.lift && (!row.variant || row.variant === 'Competition') && l && l.intake && l.intake.best && l.intake.best[row.lift];
      /* polish-d2 (first-time walk 3): a lifter the coach added by hand carries by 'coach' and a head in the coach's words */
      if (ib && ib.kg) { var iw = { text: nf(ib.kg) + ' × ' + ib.reps, mark: null, state: 'intake', head: 'Intake' }; if (l.intake.by === 'coach') { iw.by = 'coach'; iw.head = 'What you typed'; } return iw; }
      return { text: '', mark: null, state: 'none', head: head };
    }
    var w = this.weeks[src], x = this.raw(r, src);
    if (!x) return w.out && w.out[row.key] ? { text: 'swapped', mark: 'swapped', state: 'swapped', head: head } : { text: '', mark: null, state: 'none', head: head };
    out = read(x, this.dateOf(src, row.day), x.lifted ? this.mark(r, src, o) : null); out.head = head;
    return out;
  };

  /* ---------------- checks (programs §6.8): shown in the status line, counted in the week bar ---------------- */
  function injuryWords(intake) {
    var t = String((intake && intake.injuries && intake.injuries.note) || ''), m = /(patellar tendon|achilles|rotator cuff|meniscus|labrum|\bacl\b|\bmcl\b|\bdisc\b|[a-z]+ tendon|tendinopathy|bursitis)/i.exec(t);
    if (m) return m[1].toLowerCase();
    var p = intake && intake.injuries && intake.injuries.parts && intake.injuries.parts[0]; return p ? String(p).toLowerCase() : 'an injury';
  }
  function squatLimit(intake) {
    var t = String((intake && intake.injuries && intake.injuries.note) || '').toLowerCase(), m = /squat[^.]*?more than (once|twice|two times|2 times|three times|3 times)/.exec(t) || /(once|twice|two times|three times) a week/.exec(t);
    if (!m || !/squat/.test(t)) return null;
    return { once: 1, twice: 2, 'two times': 2, '2 times': 2, 'three times': 3, '3 times': 3 }[m[1]] || null;
  }
  var ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];
  P.topKg = function (r, c) { var row = this.rows[r], x = this.raw(r, c); if (!row || !x) return null; if (x.lifted) return x.lifted.top ? x.lifted.top.w || null : x.lifted.w || null; return this.load(r, c).kg; };
  /* LOGIC-FIX-4 (walk 2, Hannah's +2.5 kg a week at a fixed @7): b.ahead(ctx) reads every week still to come at once, so a rule
     chosen or weeks added warn before anyone pages through them: per line, the first week it goes heavy for the lifter's
     max, [{ r, c, n, lift, name, said, text: "Squat reaches about @10 by week 4. Raise the RPE with the load, or use +0.5 RPE." }]
     (one entry per line, the earliest week); [] when nothing to come is off */
  P.ahead = function (ctx) {
    var self = this, out = [], seen = {};
    this.weeks.forEach(function (w, c) {
      if (w.state === 'lifted' || w.deload) return;
      var ck = []; try { ck = self.checks(c, ctx); } catch (e) { ck = []; }
      ck.forEach(function (x) {
        if (x.kind !== 'heavy') return; var row = self.rows[x.r]; if (!row || seen[row.key]) return; seen[row.key] = 1;
        var said = isNum(x.said) ? Math.min(10, Math.round(x.said * 2) / 2) : null;
        var nm = row.line ? row.name + ' ' + String(row.label && !/^then$/i.test(row.label) ? row.label : 'back-offs').toLowerCase() : row.name;
        out.push({ r: x.r, c: c, n: w.n || c + 1, lift: row.lift, name: nm, said: said, text: cap1(nm) + (row.line ? ' reach' : ' reaches') + ' about @' + nf(said == null ? 10 : said) + ' by week ' + (w.n || c + 1) + '. Raise the RPE with the load, or use +0.5 RPE.' });
      });
    });
    return out;
  };
  /* b.checks(c, ctx) → [{ r, c, kind, words, fixes, ... }]; ctx: { intake, pain, meet (iso), today, lifter } (the lifter's own by default) */
  P.checks = function (c, ctx) {
    ctx = ctx || {}; var w = this.weeks[c], self = this, out = []; if (!w) return out;
    var l = ctx.lifter || lifterOf(this), intake = ctx.intake !== undefined ? ctx.intake : (l && l.intake) || null, pains = ctx.pain || (l && l.pain) || [];
    var meet = ctx.meet !== undefined ? ctx.meet : (l && l.meet && l.meet.date) || (this.meet && this.meet.iso) || null, today = ctx.today || K.today, pro = pronoun(l), Pro = cap1(pro);
    var push = function (r, kind, words, fixes, x) {
      var row = self.rows[r]; if (row && w.kept && w.kept[row.key + '|' + kind]) return;
      var o = { r: r, c: c, kind: kind, words: words, fixes: fixes || [] }; if (x) for (var k in x) o[k] = x[k]; out.push(o);
    };
    var parts = ((intake && intake.injuries && intake.injuries.parts) || []).map(partOf);
    this.rows.forEach(function (row, r) {
      var bb = row.bad && row.bad[w.uid], bf = row.badf && row.badf[w.uid];
      if (bb != null) push(r, 'unread', 'Could not read “' + bb + '”. ' + (parse(bb, self.ctxFor(r, c)).why || HELP), ['Clear']);
      if (bf) Object.keys(bf).forEach(function (f) { push(r, 'unread', 'Could not read “' + bf[f] + '”. ' + FWHY[f], ['Clear'], { field: f }); });
      var x = row.cells[w.uid]; if (!x || x.lifted) return;
      var isTop = row.line === 0 && !!row.lift, comp = !row.variant || row.variant === 'Competition';
      /* spec C (first-time-coach §7.3): no load, no send. A main-lift line (a lift, not an accessory) with neither RPE,
         percent nor kilos, or a back-off "off the top set" whose top set has no load */
      if (row.lift && MAIN[row.lift] && !x.bw && (x.off != null ? !isNum(self.load(r, c, { paper: true }).kg) : x.rpe == null && x.pct == null && x.w == null)) {
        var bo = row.line > 0 && (x.off != null || row.base === 'top' || /^back-offs$/i.test(row.label || ''));
        push(r, 'noload', (row.line > 0 ? row.name + (bo ? ' back-offs have' : ', line ' + (row.line + 1) + ', has') : row.name + ' has') + ' no load. Give ' + (bo ? 'them' : 'it') + ' an RPE or a percent.', []);
      }
      /* a deload or recovery week is light on purpose: no light check there (request #18) */
      if (isTop && x.w != null && x.rpe != null && x.r != null && !w.deload && self.kind !== 'recovery') {
        var own = isNum(row.max) && row.max > 0 ? row.max : null, mx = own || self.rowMax(row, w.uid), f = own ? 1 : factorOf(row);
        if (mx) {
          var said = rpeOfPct(Math.min(1, x.w * f / mx), effReps(x)), wrote = effRpe(x);
          var head = nf(x.w) + ' × ' + x.r + ' is ' + (said < 5 ? 'under @5' : 'about @' + nf(Math.min(10, said))) + ' for ' + pro + ' ' + nf(mx) + ' max.';
          if (wrote - said > 1 + 1e-9) push(r, 'light', head + ' You wrote @' + nf(wrote) + '.', ['Let RPE set it'], { said: said });
          else if (said - wrote >= 1 - 1e-9 || x.w * f > mx) push(r, 'heavy', head, ['Let RPE set it'], { said: said });
        }
      }
      /* LOGIC-FIX-4 (walk 2, Nina): a later line of a main lift written with its own load and RPE is checked for heavy too, so
         fixing the top line alone never clears the count while 90 × 5 @8 (about @10) stays under it */
      if (!isTop && row.lift && row.line > 0 && x.w != null && x.rpe != null && x.r != null && !w.deload && self.kind !== 'recovery') {
        var own2 = isNum(row.max) && row.max > 0 ? row.max : null, mx2 = own2 || self.rowMax(row, w.uid), f2 = own2 ? 1 : factorOf(row);
        if (mx2) {
          var said2 = rpeOfPct(Math.min(1, x.w * f2 / mx2), effReps(x)), wrote2 = effRpe(x);
          if (said2 - wrote2 >= 1 - 1e-9 || x.w * f2 > mx2) push(r, 'heavy', nf(x.w) + ' × ' + x.r + ' is about @' + nf(Math.min(10, said2)) + ' for ' + pro + ' ' + nf(mx2) + ' max.', ['Let RPE set it'], { said: said2 });
        }
      }
      if (isTop && c >= 2) {
        var ks = [c - 2, c - 1, c].map(function (k) { return self.topKg(r, k); }), cs = [c - 2, c - 1, c].map(function (k) { return cellOf(self.raw(r, k)); });
        var move = cs.every(Boolean) && ((cs[2].rpe != null && cs[0].rpe != null && cs[2].rpe > cs[0].rpe) || (cs[2].pct != null && cs[0].pct != null && cs[2].pct > cs[0].pct) || (cs[2].r != null && cs[0].r != null && cs[2].r < cs[0].r));
        if (ks.every(isNum) && ks[0] === ks[1] && ks[1] === ks[2] && move) push(r, 'flat', 'Same load 3 weeks running: ' + nf(ks[2]) + '.', ['Add 2.5 a week', 'Use 1.25 kg steps']);
      }
      if (isTop && comp && c >= 1) {
        var last = self.topKg(r, c - 1), now = self.load(r, c).kg;
        /* LOGIC-FIX-4 (walk 2, Kofi): a rise the prescription asks for (RPE 7 last week, @8 at 85% now; fewer reps) is written
           on purpose, not a jump: "Hold at 152.5" there would cut his week 3 squat by 30 kg */
        var pc0 = cellOf(self.raw(r, c - 1)), pc1 = cellOf(self.raw(r, c)), harder = !!(pc0 && pc1 && ((pc1.rpe != null && pc0.rpe != null && pc1.rpe >= pc0.rpe + 0.5) || (pc1.pct != null && pc0.pct != null && pc1.pct > pc0.pct) || (pc1.pct != null && pc0.pct == null) || (pc1.r != null && pc0.r != null && pc1.r < pc0.r)));
        if (!harder && isNum(last) && isNum(now) && last > 0 && now > last * 1.075 + 1e-9) push(r, 'jump', 'Up ' + Math.round((now / last - 1) * 100) + '% on last week’s ' + nf(last) + '.', ['Hold at ' + nf(r2(last + self.stepFor(row)))], { last: last, now: now });
      }
      if (row.line === 0 && c >= 1) { var lw = self.lastWeek(r, c, { today: today }); if (lw && lw.state === 'missed') push(r, 'missed', 'Missed last week. Written as week ' + (self.weeks[c - 1].n || c) + '.', []); }
      if (row.line === 0 && parts.length && !(row.lift && comp)) {
        var hit = loadsOf(row.name).filter(function (p) { return parts.indexOf(p) >= 0; })[0];
        if (hit) push(r, 'limit', row.name + ' loads the ' + hit + '. ' + Pro + ' intake: ' + injuryWords(intake) + '.', ['Swap this week only…', 'Keep it'], { part: hit });
      }
    });
    /* pain on a lift in the last 7 days: on the first line of that lift this week */
    pains.forEach(function (p) {
      if (p.resolved || !p.lift || !p.day || daysBetween(String(p.day).slice(0, 10), today) > 7 || daysBetween(String(p.day).slice(0, 10), today) < 0) return;
      var lift = String(p.lift).toLowerCase(), r0 = -1; self.rows.forEach(function (row, r) { if (r0 < 0 && row.lift === lift && row.cells[w.uid] && !row.cells[w.uid].lifted) r0 = r; });
      if (r0 >= 0 && !out.some(function (x) { return x.kind === 'pain' && x.r === r0; })) push(r0, 'pain', cap1(String(p.part || 'pain')) + ' ' + nf(p.sev) + '/10 on ' + lift + ' ' + K.when(String(p.day).slice(0, 10)) + '.', [], { lift: lift });
    });
    var ss = this.sessions(c).filter(function (s) { return !s.off && s.rows.length; });
    /* a third squat day when the intake says two at most */
    var sl = squatLimit(intake);
    if (sl) {
      var sq = ss.filter(function (s) { return s.rows.some(function (r) { return self.rows[r].lift === 'squat'; }); });
      if (sq.length > sl) { var s3 = sq[sl], r3 = s3.rows.filter(function (r) { return self.rows[r].lift === 'squat'; })[0]; push(r3, 'limit', (ORD[sl] || 'Another') + ' squat day this week. ' + Pro + ' ' + (parts[0] || 'injury') + ': ' + sl + ' at most.', ['Take it out of week ' + (w.n || c + 1)], { part: parts[0] || null }); }
    }
    /* a session over the intake's minutes */
    var lim = intake && isNum(intake.sessionMinutes) ? intake.sessionMinutes : null;
    if (lim) ss.forEach(function (s) { if (s.minutes > lim) push(s.rows[0], 'limit', 'About ' + s.minutes + ' min. ' + Pro + ' sessions: ' + lim + ' at most.', ['Take a line out of week ' + (w.n || c + 1)], { minutes: s.minutes }); });
    /* training on or after the meet, in the meet's week */
    if (isIso(meet) && ss.length && ss[0].iso <= meet) ss.forEach(function (s) { if (s.iso >= meet && daysBetween(meet, s.iso) < 7) push(s.rows[0], 'after-meet', 'Training on or after the meet.', ['Move this week…']); });
    /* lines a pain item holds */
    Object.keys(w.why || {}).forEach(function (key) { var y = w.why[key]; if (y.kind !== 'held') return; var r = -1; self.rows.forEach(function (row, i) { if (row.key === key) r = i; }); if (r >= 0) push(r, 'held', self.whyOf(r, c).text, y.acts || [], { lift: y.lift }); });
    /* spec C (first-time-coach §7.3, "1 of 2"): the checks in the order the week reads, day by day and line by line, so ⌘G
       walks them top to bottom and the status line can say "1 of 2". Each carries its group (what the Programs crimson
       does with it, function-polish F4: 'fix' C1, 'first' C1b, 'rpe' C2, 'other') and its place in that group: i of n */
    var at = {}; this.days.forEach(function (d, i) { at[d.name] = (self.dateOf(c, d.name) || '9999') + '|' + (100 + i); });
    var pos = function (k) { var row = self.rows[k.r]; return (row ? at[row.day] || '9999|999' : '9999|999') + '|' + (10000 + k.r); };
    out.forEach(function (k, i) { k._p = pos(k); k._i = i; });
    out.sort(function (a, z) { return a._p < z._p ? -1 : a._p > z._p ? 1 : a._i - z._i; });
    var by = {};
    out.forEach(function (k) { delete k._p; delete k._i; k.group = CHECK_GROUP[k.kind] || 'other'; by[k.group] = (by[k.group] || 0) + 1; k.i = by[k.group]; });
    out.forEach(function (k) { k.of = by[k.group]; });
    return out;
  };
  /* what the Programs crimson does with a check (function-polish F4): C1 fix the cell, C1b check the line first, C2 let RPE set it */
  var CHECK_GROUP = { unread: 'fix', noload: 'first', limit: 'first', heavy: 'rpe', light: 'rpe' };
  P.keepCheck = function (r, c, kind) {
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return refuse('invalid', 'There is no line there.');
    return this.commit('Keep ' + row.name.toLowerCase() + ' in week ' + (w.n || c + 1), function () { w.kept = w.kept || {}; w.kept[row.key + '|' + kind] = 1; return { data: { r: r, c: c, kind: kind } }; });
  };

  /* ---------------- why a cell reads what it reads (the status line, programs §5.2) ---------------- */
  P.whyOf = function (r, c) {
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return { text: '', acts: [] };
    var x = row.cells[w.uid], y = w.why && w.why[row.key], L = this.load(r, c), lf = liftWord(row.lift), l = lifterOf(this);
    if (!x) return { text: this.isRO(r, c) ? 'Nothing was written here.' : 'Empty. Type the sets, reps and RPE or %.', acts: [] };
    if (x.lifted) return { text: 'Already lifted. Only weeks still to come can change.', acts: [] };
    var kg = L.kg != null ? nf(L.kg) : null;
    if (y && y.kind === 'held') return { text: (kg || '') + ', held: ' + y.why + '.' + (y.add ? ' Your rule would add ' + nf(y.add) + '.' : ''), acts: (y.acts || []).concat(y.add ? ['Add the ' + nf(y.add)] : []) };
    if (y && y.kind === 'swap-held') return { text: y.text, acts: y.acts || [] };
    if (y && y.kind === 'rule') {
      var who = this.rules ? ((l && l.first) || 'Their') + '’s rule' : 'Your ' + (row.lift ? lf + ' ' : '') + 'rule', d = r2(y.now - y.was);
      return { text: nf(y.now) + ', ' + (d >= 0 ? 'up ' : 'down ') + nf(Math.abs(d)) + ': ' + y.why + ' ' + (y.rule === 'double' ? 'Your rule.' : who + '.'), acts: ['Back to ' + nf(y.was)] };
    }
    if (y && y.kind === 'step') { var ds = r2(y.now - y.was); return { text: nf(y.now) + ', ' + (ds >= 0 ? 'up ' : 'down ') + nf(Math.abs(ds)) + ': each week ' + low1((PROGS.filter(function (p) { return p[0] === row.prog; })[0] || ['', 'the same'])[1]).replace(/ a week$/, '') + '.', acts: ['Same as last week'] }; }
    if (y && y.kind === 'follow') return { text: nf(y.now) + ': follows the ' + nf(y.top != null ? y.top : this.load(this.rows.indexOf(this.topRow(row) || row), c).kg) + ' top set.', acts: [] };
    if (y && (y.kind === 'cap' || y.kind === 'lighter')) {
      var p0 = x.r != null && x.rpe != null ? Math.round(pct(effReps(x), x.rpe) * 1000) / 10 : null, mx = this.rowMax(row, w.uid);
      return { text: kg + ': ' + (y.kind === 'cap' ? 'capped at RPE ' + nf(y.rpe) + '. ' : '') + (p0 != null && mx ? x.r + ' @' + nf(x.rpe) + ' is ' + nf(p0) + '% of the ' + nf(mx) + ' max.' : ''), acts: (y.other != null ? ['Use ' + nf(y.other)] : []).concat(y.kind === 'cap' ? ['Take the cap off'] : []) };
    }
    if (w.deload && w.pre && w.pre[row.key] && L.kind === 'typed') { var pw = w.pre[row.key]; return { text: kg + ': ' + (this.kind === 'recovery' && row.last ? 'week ' + row.last.n + '’s ' : 'the normal week’s ') + nf(pw.w) + ', 10% lighter for the deload.', acts: [] }; }
    if (this.kind === 'recovery' && row.last && row.last.cell && L.kind === 'typed' && row.last.cell.w != null) return { text: kg + ': week ' + row.last.n + '’s ' + nf(row.last.cell.w) + ', 10% lighter for the deload.', acts: [] };
    if (L.kind === 'typed') {
      var by = row.lift && x.rpe != null && x.r != null ? engine0(this, row, (function () { var z = cellOf(x); delete z.w; delete z.wHi; return z; })(), w.uid, true).kg : null;
      return { text: kg + ', typed.' + (by != null && by !== L.kg ? ' By RPE it would be ' + nf(by) + '.' : ''), acts: by != null && by !== L.kg ? ['Let RPE set it'] : [] };
    }
    if (L.kind === 'rpe') return { text: 'About ' + kg + ': ' + effReps(x) + ' @' + nf(effRpe(x)) + ' is ' + nf(Math.round(L.p * 1000) / 10) + '% of ' + (L.f !== 1 ? nf(L.mx) + ' ÷ ' + L.f.toFixed(2) : 'the ' + nf(L.mx) + ' max') + '.', acts: [] };
    if (L.kind === 'pct') return { text: kg + ': ' + nf(x.pct) + '% of the ' + nf(L.mx) + ' max.', acts: [] };
    if (L.kind === 'top') return { text: kg + ': ' + (x.off ? nf(x.off) + '% under the ' : 'the load of the ') + nf(L.top) + ' top set.', acts: [] };
    if (L.kind === 'nomax') return { text: 'No ' + lf + ' max yet. Set it in Maxes, or type a load.', acts: ['Set the max'] };
    return { text: 'By feel. Type a load to set one.', acts: [] };
  };

  /* ---------------- a proposal saved as one step (the first edit saves it: "Week 5 filled from week 4") ---------------- */
  P.useProposal = function (p) {
    if (!p || !p.block || !Array.isArray(p.block.rows)) return refuse('invalid', 'There is no proposal to use.');
    var src = p.block, self = this;
    return this.commit(p.label || 'Week ' + (p.c + 1) + ' filled', function () {
      self.rows = clone(src.rows); self.weeks = clone(src.weeks); self.days = clone(src.days); self.seq = Math.max(self.seq, src.seq);
      if (src.start) self.start = src.start;
      return { data: { c: p.c, changes: (p.changes || []).length } };
    });
  };

  /* ---------------- a block after this one: a template's weeks with their phase name (programs §8.3) ---------------- */
  /* LOGIC-FIX-3 (Programs' request, programs.md §9 "Add to"): b.importWeeks(fromWeek, blocks) writes imported weeks (BLOCK.fromTable
     blocks, each of its weeks in turn) into this block from week fromWeek on, as one undo step. Each imported line goes onto
     the line it is: the same lift, variant and line (top set, back-offs) on the same day, else on another day, else an
     accessory with the same name; only a line that matches nothing becomes a new row. So the weeks before feed Last week from
     the first day. A week already lifted is left alone (counted in skipped); a week to come loses the lines the sheet leaves
     out. → { data: { wrote, matched, added, weeks: [n], skipped: [n] } } */
  var keyAt = function (b, key) { for (var r = 0; r < b.rows.length; r++) if (b.rows[r].key === key) return r; return -1; };
  P.importWeeks = function (fromWeek, blocks, o) {
    o = o || {};
    if (!isNum(fromWeek) || fromWeek < 1 || fromWeek % 1) return refuse('invalid', 'Import from week 1 or later.');
    var list = (Array.isArray(blocks) ? blocks : [blocks]).map(function (x) { return x && x.rows && Array.isArray(x.weeks) && typeof x.toJSON === 'function' ? x : x && x.block && x.block.rows ? x.block : from(x); }).filter(function (x) { return x && x.weeks.length; });
    if (!list.length) return refuse('invalid', 'There is nothing to import.');
    var nWk = list.reduce(function (s, x) { return s + x.weeks.length; }, 0), self = this;
    var vOf = function (row) { return row.lift ? row.lift + '|' + (row.variant || 'Competition') : null; };
    var nameOf = function (row) { return norm(row.name || row.title || ''); };
    var same = function (a, b) { var va = vOf(a), vb = vOf(b); return va || vb ? va === vb : nameOf(a) === nameOf(b) && nameOf(a) !== ''; };
    return this.commit(o.label || 'Import ' + nWk + (nWk === 1 ? ' week' : ' weeks') + ' from week ' + fromWeek, function () {
      var c = fromWeek - 1, wrote = 0, matched = 0, added = 0, weeks = [], skipped = [];
      list.forEach(function (src) {
        src.weeks.forEach(function (sw) {
          var cc = c++; while (self.weeks.length <= cc) self.weeks.push(self.newWeek(self.weeks.length + 1));
          var w = self.weeks[cc]; if (w.state === 'lifted') { skipped.push(cc + 1); return; }
          self.rows.forEach(function (row, r) { if (!self.isRO(r, cc)) delete row.cells[w.uid]; });
          var used = {};
          src.rows.forEach(function (sr) {
            var x = sr.cells[sw.uid]; if (!x) return;
            var sdi = src.dayAt(sr.day), day = sdi >= 0 && self.days[sdi] ? self.days[sdi].name : sr.day;
            if (self.dayAt(day) < 0) self.days.push({ name: day, wd: null });
            var pick = function (sameDay) { for (var r = 0; r < self.rows.length; r++) { var row = self.rows[r]; if (used[r] || self.isRO(r, cc) || row.line !== sr.line || (sameDay && row.day !== day) || !same(row, sr)) continue; return r; } return -1; };
            var ri = pick(true); if (ri < 0) ri = pick(false);
            if (ri < 0) {
              var y = clone(sr); y.key = day + '|' + sr.name + '|i' + (++self.seq) + '|' + sr.line; y.day = day; y.cells = {}; delete y.bad; delete y.badf;
              if (sr.line) { var top = self.rows.filter(function (z) { return z.day === day && z.line === 0 && same(z, sr); })[0]; if (top) { y.ex = top.ex; y.key = top.key.replace(/\|\d+$/, '') + '|' + sr.line; if (keyAt(self, y.key) >= 0) y.key = day + '|' + sr.name + '|i' + self.seq + '|' + sr.line; } else y.ex = self.maxEx() + 1; } else y.ex = self.maxEx() + 1;
              self.rows.splice(self.insertAt(day), 0, y); ri = keyAt(self, y.key); added++;
            } else matched++;
            used[ri] = 1; self.rows[ri].cells[w.uid] = cellOf(x); wrote++;
            if (sr.bad && sr.bad[sw.uid] != null) { self.rows[ri].bad = self.rows[ri].bad || {}; self.rows[ri].bad[w.uid] = sr.bad[sw.uid]; }
            if (sr.badf && sr.badf[sw.uid]) { self.rows[ri].badf = self.rows[ri].badf || {}; self.rows[ri].badf[w.uid] = clone(sr.badf[sw.uid]); }
          });
          weeks.push(cc + 1);
        });
      });
      return { data: { wrote: wrote, matched: matched, added: added, weeks: weeks, skipped: skipped } };
    });
  };
  var phaseOf = function (name) { var w0 = String(name || '').trim().split(/\s+/)[0] || 'Block'; return /^(week|after|the|a|new)$/i.test(w0) ? cap1(String(name || 'Block')) : cap1(w0); };
  P.append = function (tpl, o) {
    o = o || {}; var t = tpl && tpl.rows && typeof tpl.toJSON === 'function' ? tpl : from(tpl && tpl.block ? tpl.block : tpl), self = this;
    if (!t || !t.weeks.length) return refuse('invalid', 'That template has no weeks.');
    var phase = o.phase || phaseOf(t.name), mine = o.was || phaseOf(this.name);
    return this.commit('Add ' + t.name + ' after the block', function () {
      self.weeks.forEach(function (w, i) { if (!w.phase && !w.label) { w.phase = mine; w.pn = self.weeks.slice(0, i + 1).filter(function (x) { return !x.label; }).length; } });
      var map = {};
      t.days.forEach(function (d, i) { var mineDay = self.days.filter(function (x) { return x.name.toLowerCase() === d.name.toLowerCase(); })[0] || self.days[i]; if (!mineDay) { mineDay = { name: d.name, wd: d.wd }; self.days.push(mineDay); } map[d.name] = mineDay.name; });
      var c0 = self.weeks.length, rowFor = {}, exMap = {};
      t.rows.forEach(function (tr) {
        var day = map[tr.day] || tr.day, hit = null;
        self.rows.forEach(function (row) { if (!hit && row.day === day && row.name === tr.name && row.line === tr.line && !row.only && !rowFor['used' + row.key]) hit = row; });
        var ek = tr.day + '|' + tr.ex;
        if (!hit) {
          hit = clone(tr); hit.key = day + '|' + tr.name + '|a' + (++self.seq) + '|' + tr.line; hit.day = day; hit.cells = {};
          if (exMap[ek] == null) exMap[ek] = self.maxEx() + 1; hit.ex = exMap[ek];
          var at = self.insertAt(day); self.rows.splice(at, 0, hit);
        } else if (exMap[ek] == null) exMap[ek] = hit.ex;
        rowFor['used' + hit.key] = 1; rowFor[tr.key] = hit;
      });
      t.weeks.forEach(function (tw, i) {
        var nw = self.newWeek(self.weeks.length + 1); nw.phase = phase; nw.pn = i + 1; if (tw.deload) nw.deload = true; if (tw.label) nw.label = tw.label; if (tw.kind) nw.kind = tw.kind;
        self.weeks.push(nw);
        t.rows.forEach(function (tr) { var x = tr.cells[tw.uid]; if (x) rowFor[tr.key].cells[nw.uid] = cellOf(x); });
      });
      return { data: { from: c0, weeks: t.weeks.length, phase: phase } };
    });
  };

  /* ---------------- labels and the lifter's one leading target (shared.md §4.10, §4.12) ---------------- */
  /* "Back-offs" only for a drop: a −% entry, a lower load or a lower percent than line 0; else the exercise's name */
  function lineLabel(row, cell, ctx) {
    ctx = ctx || {}; if (!row) return '';
    if (!row.line) return row.name;
    var c = cellOf(cell), t = ctx.top ? cellOf(ctx.top) : null;
    if (c && c.off != null) return c.off > 0 ? 'Back-offs' : row.name;
    /* FIX-LOGIC (P-PROGRAMS, FTC FC-22): a back-off line of a main lift whose RPE, % and off were cleared is still the
       back-offs (the no-load check walks to it by that name), never the lift's own name */
    if (c && c.rpe == null && c.pct == null && c.w == null && !c.bw && (row.base === 'top' || /^back-offs$/i.test(row.label || '') || (row.lift && MAIN[row.lift]))) return 'Back-offs';
    if (isNum(ctx.kg) && isNum(ctx.topKg)) return ctx.kg < ctx.topKg ? 'Back-offs' : row.name;
    if (c && t && c.pct != null && t.pct != null) return c.pct < t.pct ? 'Back-offs' : row.name;
    if (c && t && c.w != null && t.w != null) return c.w < t.w ? 'Back-offs' : row.name;
    if (c && t && c.rpe != null && t.rpe != null && c.w == null && t.w == null) return c.rpe < t.rpe ? 'Back-offs' : row.name;
    return row.name;
  }
  P.lineLabel = function (r, c) {
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return '';
    var top = this.topRow(row), tc = top ? top.cells[w.uid] : null;
    return lineLabel(row, row.cells[w.uid], { top: tc, kg: this.load(r, c, { paper: true }).kg, topKg: top ? this.load(this.rows.indexOf(top), c, { paper: true }).kg : null });
  };
  /* one leading target: a typed load leads ("47.5 kg, 4 × 6, should feel about 8"); a worked-out load keeps the RPE as the
     order ("4 × 6 at RPE 7, about 42.5 kg"). ctx: { kg } (the load the engine works out) */
  function phoneText(row, cell, ctx) {
    ctx = ctx || {}; var c = cellOf(cell); if (!c) return '';
    var reps = c.r == null ? '' : c.r + (c.rHi != null ? '-' + c.rHi : '') + (c.amrap ? '+' : '');
    var sr = (c.nHi != null ? c.n + '-' + c.nHi : String(c.n == null ? 1 : c.n)) + ' × ' + reps, kg = isNum(ctx.kg) ? ctx.kg : null;
    var rp = c.rpe == null ? null : c.rir ? rirOf(c) + ' in reserve' : nf(c.rpe) + (c.rpeHi != null ? '-' + nf(c.rpeHi) : '');
    var stop = c.until != null ? '. Stop when one feels ' + nf(c.until) + '.' : '';
    if (c.upTo) return 'Up to ' + c.n + ' sets' + (reps ? ' of ' + reps : '') + (c.off != null ? ', ' + (c.off ? nf(c.off) + '% under your top set' : 'at your top set’s load') : c.w != null ? ', ' + nf(c.w) + ' kg' : rp ? ' at RPE ' + rp : '') + (stop || (kg != null && c.w == null ? ', about ' + nf(kg) + ' kg' : ''));
    if (c.w != null) return nf(c.w) + (c.wHi != null ? '-' + nf(c.wHi) : '') + ' kg, ' + sr + (rp ? (c.rir ? ', about ' + rp : ', should feel about ' + rp) : '') + (stop ? stop : '');
    /* ctx.words (spec C, function-polish F3.1): a back-off leads with its kilos, "2 × 5 at 72.5 kg, 12% lighter than your top set" */
    if (c.off != null && ctx.words && kg != null) return sr + ' at ' + nf(kg) + ' kg, ' + (c.off ? nf(c.off) + '% lighter than your top set' : 'the same as your top set') + stop;
    if (c.off != null) return sr + (c.off ? ' at ' + nf(c.off) + '% under your top set' : ' at your top set’s load') + (kg != null ? ', about ' + nf(kg) + ' kg' : '') + stop;
    if (c.pct != null) return sr + ' at ' + nf(c.pct) + (c.pctHi != null ? '-' + nf(c.pctHi) : '') + '%' + (rp ? ', RPE ' + rp : '') + (kg != null ? ', ' + nf(kg) + ' kg' : '') + stop;
    if (rp) return sr + ' at ' + (c.rir ? rp : 'RPE ' + rp) + (kg != null ? ', about ' + nf(kg) + ' kg' : '') + stop;
    if (c.bw) return sr + ', bodyweight';
    return sr;
  }
  P.phoneText = function (r, c, o) { var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return ''; return phoneText(row, row.cells[w.uid], { kg: this.load(r, c, { paper: true }).kg, words: !!(o && o.words) }); };

  /* ---------------- the proposal (programs §6.2, shared.md §4.3 to §4.5) ---------------- */
  var PEAKDAY = /opener|taper|meet day|platform|last session/i;
  function weekRange(b, c) {
    var w = b.weeks[c]; if (!w) return null;
    var ds = b.days.filter(function (d) { return b.rows.some(function (row) { return row.day === d.name && (row.cells[w.uid] || (w.out && w.out[row.key])); }); }).map(function (d) { return b.dateOf(c, d.name); });
    if (!ds.length) ds = b.days.map(function (d) { return b.dateOf(c, d.name); });
    ds = ds.filter(Boolean).sort(); return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
  }
  function isPeakWeek(b, c) {
    var w = b.weeks[c]; if (!w) return false;
    var days = b.days.filter(function (d) { return b.rows.some(function (row) { return row.day === d.name && row.cells[w.uid]; }); });
    if (days.some(function (d) { return PEAKDAY.test(d.name); })) return true;
    var tops = b.rows.filter(function (row) { return row.line === 0 && row.lift && (!row.variant || row.variant === 'Competition') && row.cells[w.uid]; });
    return tops.length > 0 && tops.every(function (row) { return row.cells[w.uid].r === 1; });
  }
  function holdText(name, kg, cell, why) { return cap1(String(name).toLowerCase()) + ': back to ' + nf(kg) + (cell && cell.r != null ? ' × ' + cell.r : '') + '?' + (why ? ' ' + cap1(why) + '.' : ''); }
  /* BLOCK.propose(b, c, ctx) → { c, block (a copy, not saved), changes: [{ r, key, field, was, now, why, kind }], held, waits,
     missed, kind ('step' | 'rules' | 'taper'), label, sent, toSend, waitText } | { error }
     ctx: { holds ([{ lift, why, act }] or { lift: why }), rules (the coach's, per lift), sent, meet (iso), today } */
  function propose(b, c, ctx) {
    ctx = ctx || {}; if (!b || !b.weeks) return null;
    var k = from(b.toJSON()), today = ctx.today || K.today, l = lifterOf(b);
    if (c == null) c = k.writeCol();
    if (c < 0) c = k.weeks.length;
    if (c === k.weeks.length && c > 0) k.weeks.push(k.newWeek(c + 1));
    var w = k.weeks[c]; if (!w) return { error: { code: 'invalid', message: 'There is no week ' + (Number(c) + 1) + '.' } };
    if (w.state !== 'next') return { error: { code: 'locked', message: k.weekName(c) + ' is under way or lifted. Propose a week still to come.' } };
    var pw = k.weeks[c - 1] || null, n = w.n || c + 1;
    var meet = ctx.meet !== undefined ? ctx.meet : (l && l.meet && l.meet.date) || null, rg = weekRange(k, c);
    if (isIso(meet) && rg && meet >= rg.from && daysBetween(rg.from, meet) < 7 && !ctx.noTaper && daysBetween(today, meet) >= 0) {
      var wc = k.writeCol(), tp = taper(b, meet, { c: wc >= 0 && wc < c ? wc : c, upTo: c, today: today });
      if (tp && tp.block) { tp.kind = 'taper'; tp.c = c; tp.label = k.weekName(c) + ' as the taper'; tp.changes = tp.changes || []; tp.held = []; tp.waits = []; tp.missed = []; tp.sent = !!w.sent; tp.toSend = tp.block.changes(c).n; return tp; }
    }
    var out = { c: c, block: k, changes: [], held: [], waits: [], missed: [], kind: 'rules', label: k.weekName(c) + ' filled from ' + (pw ? k.weekName(c - 1).toLowerCase() : 'nothing'), source: c - 1, sent: !!w.sent || !!ctx.sent, toSend: 0 };
    k.keepSent();
    w.why = w.why || {}; w.ruled = w.ruled || {};
    var empty = !k.rows.some(function (row) { return row.cells[w.uid]; });
    if (empty && pw) {                                                         /* 1. an empty week: one step on from the week before */
      out.kind = 'step';
      k.rows.forEach(function (row, r) {
        if (PEAKDAY.test(row.day) || row.only) return;
        var s = (pw.deload && pw.pre && pw.pre[row.key]) || row.cells[pw.uid]; if (!s) return;
        var was = k.loadAt(row, s, pw.uid, true).kg;
        k.put(r, c, stepOf(row, s, 1, k.srcLoad(row, s)));
        var now = k.load(r, c).kg;
        if (isNum(was) && isNum(now) && now !== was && row.prog !== 'same' && row.cells[w.uid].w != null) {
          w.why[row.key] = { kind: 'step', field: 'load', was: was, now: now };
          out.changes.push({ r: r, key: row.key, field: 'load', was: was, now: now, kind: 'step', why: k.whyOf(r, c).text });
        }
      });
    }
    if (!pw) return out;
    var rs = rulesFor(k, ctx.rules), holds = normHolds(ctx.holds), swapHold = {}, tops = {};
    (pw.swaps || []).forEach(function (sw) { if (sw.lift) swapHold[sw.lift] = sw; });
    var noRule = !!w.deload || k.kind === 'recovery';
    k.rows.forEach(function (row, r) {                                         /* 3. the coach's rules from what was lifted */
      var cell = row.cells[w.uid]; if (!cell) return;
      var prev = row.cells[pw.uid] || null, sw = row.lift && swapHold[row.lift];
      if (sw && sw.from.indexOf(row.key) >= 0) {                               /* after a pain change: held until the coach decides */
        var kgS = k.load(r, c).kg, rowS = k.rows.filter(function (y) { return y.key === sw.to; })[0], nm = rowS ? rowS.name.toLowerCase() + 's' : 'the swap';
        var txt = row.line === 0 ? holdText(sw.name, kgS, cell, sw.why) : nf(kgS) + ', held: ' + (sw.why ? low1(sw.why) : 'the swap') + '.';
        var acts = row.line === 0 ? ['Back to ' + nf(kgS), 'Keep ' + nm] : [];
        w.why[row.key] = { kind: 'swap-held', field: 'load', text: txt, acts: acts, lift: row.lift, now: kgS };
        out.held.push({ r: r, key: row.key, lift: row.lift, kg: kgS, add: null, why: sw.why || 'the swap', text: txt, acts: acts, kind: 'swap' });
        return;
      }
      var hd = row.lift && holds[row.lift];
      if (hd && hd.swap != null) {                                             /* after a pain change made elsewhere (the store's hold, request #42) */
        var kgW = k.load(r, c).kg, nmW = hd.swap ? String(hd.swap).toLowerCase().replace(/s$/, '') + 's' : 'the change';
        var txW = row.line === 0 ? holdText(row.name, kgW, cell, hd.why) : nf(kgW) + ', held: ' + (hd.why ? low1(hd.why) : 'the change') + '.';
        var acW = row.line === 0 ? ['Back to ' + nf(kgW), hd.swap ? 'Keep ' + nmW : 'Keep it out'] : [];
        w.why[row.key] = { kind: 'swap-held', field: 'load', text: txW, acts: acW, lift: row.lift, now: kgW };
        out.held.push({ r: r, key: row.key, lift: row.lift, kg: kgW, add: null, why: hd.why || 'the change', text: txW, acts: acW, kind: 'swap' });
        return;
      }
      if (hd) {                                                                /* the pain hold: no rule increase on that lift */
        var would = prev && prev.lifted && cell.w != null ? ruleFor(k, row, cell, prev, rs) : null, kg0 = k.load(r, c).kg;
        var add = would && would.dir === 'up' ? r2(would.kg - cell.w) : null, hacts = hd.act ? [hd.act] : [];
        w.why[row.key] = { kind: 'held', field: 'load', why: hd.why || 'pain', add: add, acts: hacts, lift: row.lift, now: kg0 };
        out.held.push({ r: r, key: row.key, lift: row.lift, kg: kg0, add: add, why: hd.why || 'pain', text: k.whyOf(r, c).text, acts: hacts.concat(add ? ['Add the ' + nf(add)] : []), kind: 'pain' });
        return;
      }
      if (w.why[row.key] && (w.why[row.key].kind === 'held' || w.why[row.key].kind === 'swap-held')) delete w.why[row.key];
      if (!prev) return;
      var iso = k.dateOf(c - 1, row.day);
      if (!prev.lifted) { (iso && iso >= today ? out.waits : out.missed).push({ r: r, key: row.key, day: row.day, iso: iso }); return; }
      if (!prev.lifted.done) { out.missed.push({ r: r, key: row.key, day: row.day, iso: iso }); return; }
      if (w.ruled[row.key]) return;
      w.ruled[row.key] = 1;
      if (noRule || cell.w == null || (w.capped && w.capped[row.key] != null) || (row.nod && row.nod[w.uid]) || row.only) return;
      if (row.line === 0 && row.lift && cell.rpe != null && cell.r != null) {     /* a typed top set far under its RPE gets no add */
        var own = isNum(row.max) && row.max > 0 ? row.max : null, mx = own || k.rowMax(row, w.uid);
        if (mx && effRpe(cell) - rpeOfPct(Math.min(1, cell.w * (own ? 1 : factorOf(row)) / mx), effReps(cell)) > 1 + 1e-9) return;
      }
      var d = ruleFor(k, row, cell, prev, rs); if (!d) return;
      var was = cell.w, x = cellOf(cell); x.w = d.kg;
      if (row.line === 0) tops[r] = { was: k.load(r, c).kg, now: d.kg };
      k.put(r, c, x);
      w.why[row.key] = { kind: 'rule', field: 'load', was: was, now: d.kg, why: d.why, rule: d.rule, dir: d.dir };
      out.changes.push({ r: r, key: row.key, field: 'load', was: was, now: d.kg, kind: 'rule', rule: d.rule, why: k.whyOf(r, c).text });
    });
    Object.keys(tops).forEach(function (r0) {                                  /* 4. back-offs follow their top set */
      r0 = Number(r0); var t = tops[r0], top = k.rows[r0];
      out.later = (out.later || []).concat(k.followWeeks(r0, c).map(function (f) { return { r: r0, key: top.key, c: f.c, n: f.n, kg: f.kg }; }));   /* later weeks re-step from the new value (request #23: Mei's week 6 leg press) */
      k.followBackoffs(r0, c, t.was, t.now).forEach(function (f) { out.changes.push({ r: f.r, key: k.rows[f.r].key, field: 'load', was: f.was, now: f.now, kind: 'follow', why: k.whyOf(f.r, c).text }); });
      k.rows.forEach(function (y, i) {
        var x = y.cells[w.uid]; if (y.day !== top.day || y.ex !== top.ex || !y.line || !x || x.off == null) return;
        var was = round(t.was * (1 - x.off / 100), k.stepFor(y)), now = k.load(i, c).kg; if (was === now) return;
        w.why[y.key] = { kind: 'follow', field: 'load', was: was, now: now, top: t.now };
        out.changes.push({ r: i, key: y.key, field: 'load', was: was, now: now, kind: 'follow', why: k.whyOf(i, c).text });
      });
    });
    out.toSend = out.sent ? k.changes(c).n : 0;
    if (out.waits.length) {
      var by = {}; out.waits.forEach(function (x) { if (!by[x.day]) by[x.day] = x.iso; });
      var dn = Object.keys(by).sort(function (a, z) { return by[a] < by[z] ? -1 : 1; });
      var names = dn.map(function (d) { var top0 = k.rows.filter(function (y) { return y.day === d && y.line === 0 && y.lift; })[0]; return top0 ? liftWord(top0.lift) : d.toLowerCase(); });
      out.waitText = cap1(joinAnd(names)) + ' wait' + (names.length === 1 ? 's' : '') + ' on ' + joinAnd(dn.map(function (d) { return K.wd3(by[d]); }));
    }
    return out;
  }

  /* ---------------- after a meet: the recovery week (programs §6.3) ---------------- */
  function liftedDays(b) { var out = []; b.rows.forEach(function (row) { b.weeks.forEach(function (w) { var x = row.cells[w.uid], lt = x && x.lifted; if (lt && lt.done > 0 && lt.on) out.push(lt.on); }); }); return out.sort(); }
  function recovery(b, ctx) {
    ctx = ctx || {}; if (!b || !b.weeks || !b.weeks.length) return null;
    var l = lifterOf(b), m = ctx.meet || (l && l.meet) || b.meet, iso = m && (m.date || m.iso), name = (m && m.name) || 'meet';
    if (!isIso(iso)) return null;
    var last = b.weeks.length - 1, ws = weekStartOf(b, last), rg = ws ? { from: ws } : weekRange(b, last);
    var ses = []; b.weeks.forEach(function (w, c) { b.days.forEach(function (d) { if (b.rows.some(function (row) { return row.day === d.name && row.cells[w.uid]; })) ses.push(b.dateOf(c, d.name)); }); });
    ses.sort(); var lastSession = ses[ses.length - 1];
    var ends = (rg && iso >= rg.from && daysBetween(rg.from, iso) < 7) || (lastSession && iso >= lastSession && daysBetween(lastSession, iso) <= 7);
    if (!ends && !ctx.force) return null;
    var src = last; while (src > 0 && isPeakWeek(b, src)) src--;
    if (isPeakWeek(b, src)) return null;
    var kind = deloadKindOf(b, ctx.kind), sw = b.weeks[src];
    var nb = new Block({ id: b.id, name: 'After the ' + name, maxes: clone(b.maxes), maxFrom: clone(b.maxFrom), today: clone(b.today), weeks: [], rows: [], days: [], seq: 0, steps: b.steps, rules: b.rules, defaults: b.defaults, deloadKind: b.deloadKind, kind: 'recovery', meet: { iso: iso, name: name } });
    var w = nb.newWeek(1); w.label = 'Recovery week'; w.deload = true; w.deloadKind = kind; w.pre = {}; nb.weeks.push(w);
    var days = b.days.filter(function (d) { return !PEAKDAY.test(d.name) && b.rows.some(function (row) { return row.day === d.name && !row.only && row.cells[sw.uid]; }); });
    var at = K.add(iso, 2);                                                     /* the first day at least two days after the meet */
    days.forEach(function (d) {
      var wd = K.d(b.dateOf(src, d.name)).getDay(), dt = at; while (K.d(dt).getDay() !== wd) dt = K.add(dt, 1);
      nb.days.push({ name: d.name, wd: wd }); w.dates[d.name] = dt; at = K.add(dt, 1);
    });
    b.rows.forEach(function (row) {
      if (row.only || !days.some(function (d) { return d.name === row.day; })) return;
      var x = row.cells[sw.uid]; if (!x) return;
      var y = clone(row); y.cells = {}; delete y.nod; delete y.bad; delete y.badf; delete y.mx;
      y.last = { n: sw.n || src + 1, cell: clone(x), iso: b.dateOf(src, row.day) };
      var wr = cellOf(x); w.pre[y.key] = wr; y.cells[w.uid] = deloadCell(wr, kind, b.stepFor(row));
      nb.rows.push(y);
    });
    nb.start = days.length ? w.dates[days[0].name] : K.add(iso, 2); nb.perWeek = days.length;
    var logged = b.rows.some(function (row) { var x = row.cells[sw.uid]; return x && x.lifted && x.lifted.done > 0; }), ld = liftedDays(b);
    var kd = DELOADS.filter(function (x) { return x.id === kind; })[0];
    return { block: nb, c: 0, source: src, n: sw.n || src + 1, label: 'After the ' + name, kind: 'recovery', deload: kind, deloadText: kd ? kd.label : '', from: nb.start,
      words: logged ? '' : ld.length ? 'Nothing logged since ' + dayWords(ld[ld.length - 1]) + '.' : 'Nothing logged yet.', sourceText: 'Week ' + (sw.n || src + 1) + ' as a deload',
      /* spec C (function-polish P20): one name for this week, "Recovery week", and its tag "Lighter than week 2" (the week bar
         shows tag; sourceText stays for the readers of spec B) */
      tag: 'Lighter than week ' + (sw.n || src + 1), changes: [], held: [], waits: [], missed: [] };
  }

  /* ---------------- the taper and the run-in (programs §6.11, shared.md §4.8) ---------------- */
  var TAPER = { squat: { lo: 8, hi: 12, at: 8 }, bench: { lo: 6, hi: 10, at: 6 }, deadlift: { lo: 10, hi: 14, at: 10 }, rehearsal: { lo: 4, hi: 10, at: 5, place: [5, 7] }, accessories: 14, last: { lo: 3, hi: 4, at: 3, pct: [70, 80] }, within: 21, far: 112 };
  /* the windows also read as { min, max } (days out), the form the flows and Meets' run-in check read */
  ['squat', 'bench', 'deadlift', 'rehearsal', 'last'].forEach(function (k) { TAPER[k].min = TAPER[k].lo; TAPER[k].max = TAPER[k].hi; });
  function weekStartOf(k, c) { var ds = k.days.map(function (d) { return k.patternDate(c, d.name); }).filter(Boolean).sort(); return ds[0] || null; }
  function weekIndexOf(k, iso) { for (var c = k.weeks.length - 1; c >= 0; c--) { var s = weekStartOf(k, c); if (s && s <= iso) return c; } return 0; }
  function taperRow(k, day, lift, after) {
    var hit = k.rows.filter(function (row) { return row.day === day && row.lift === lift && row.line === 0; })[0]; if (hit) return hit;
    var row = { key: day + '|' + K.LIFT[lift] + '|t' + (++k.seq) + '|0', day: day, ex: k.maxEx() + 1, line: 0, title: K.LIFT[lift], name: K.LIFT[lift], label: '', lift: lift, cat: lift, variant: 'Competition', note: '', pause: 0, tempo: '', prog: 'same', cells: {} };
    k.rows.splice(k.insertAt(day), 0, row); return row;
  }
  function addDay(k, name, iso) { if (k.dayAt(name) < 0) k.days.push({ name: name, wd: K.d(iso).getDay() }); }
  /* fill weeks c0.. of k (a copy) as the taper to the meet on M; returns where each piece went */
  function taperFill(k, M, c0) {
    for (var g = 0; g < 20; g++) {                                              /* weeks through the meet's */
      var lc = k.weeks.length - 1, s0 = weekStartOf(k, lc); if (!s0 || s0 > M || daysBetween(s0, M) < 7) break;
      var pw = k.weeks[lc], nw = k.newWeek(k.weeks.length + 1); k.weeks.push(nw);
      k.rows.forEach(function (row) { var x = (pw.deload && pw.pre && pw.pre[row.key]) || row.cells[pw.uid]; if (x && !PEAKDAY.test(row.day) && !row.only) row.cells[nw.uid] = cellOf(x); });
    }
    var mainDay = {}, dayLift = {};
    LIFTS.forEach(function (L) { k.days.forEach(function (d) { if (mainDay[L] || PEAKDAY.test(d.name) || dayLift[d.name]) return; if (k.rows.some(function (row) { return row.day === d.name && row.line === 0 && row.lift === L && (!row.variant || row.variant === 'Competition'); })) { mainDay[L] = d.name; dayLift[d.name] = L; } }); });
    var placed = { squat: { heavy: null, rehearsal: null }, bench: { heavy: null, rehearsal: null }, deadlift: { heavy: null, rehearsal: null }, last: null, c0: c0 };
    var first = weekStartOf(k, c0) || K.today;
    LIFTS.forEach(function (L) {                                                /* the last heavy single, at 10, 8 and 6 days out */
      var d = mainDay[L]; if (!d) return;
      var h = K.add(M, -TAPER[L].at); if (h < first || h <= K.today) return;
      var ch = weekIndexOf(k, h); if (ch < c0) return;
      var wk = k.weeks[ch]; if (wk.state !== 'next') return;
      wk.moved = wk.moved || {}; if (!wk.moved[d] && k.patternDate(ch, d) !== h) wk.moved[d] = k.patternDate(ch, d);
      wk.dates[d] = h; if (wk.moved[d] === h) delete wk.moved[d];
      placed[L].heavy = h; placed[L].c = ch;
    });
    for (var c = c0; c < k.weeks.length; c++) {
      var w = k.weeks[c], step = c - c0 + 1;
      k.days.forEach(function (dd) {
        var d = dd.name; if (PEAKDAY.test(d)) return;
        var rs = []; k.rows.forEach(function (row, r) { if (row.day === d && row.cells[w.uid] && !row.cells[w.uid].lifted && !k.isRO(r, c)) rs.push(r); });
        if (!rs.length) return;
        var iso = k.dateOf(c, d), out = daysBetween(iso, M), L = dayLift[d], heavy = L && placed[L].heavy === iso;
        if (!heavy && (out < 7 || (L && placed[L].heavy && iso > placed[L].heavy))) { w.off[d] = true; return; }   /* the taper's own days take over */
        rs.forEach(function (r) {
          var row = k.rows[r], x = cellOf(row.cells[w.uid]);
          if (!row.lift) { if (out <= TAPER.accessories) { w.out = w.out || {}; w.out[row.key] = row.cells[w.uid]; delete row.cells[w.uid]; } return; }
          if (row.line === 0 && (!row.variant || row.variant === 'Competition') && row.lift === L) { row.cells[w.uid] = { n: 1, r: 1, rpe: 8 }; if (heavy) row.cells[w.uid].note = 'Last heavy single'; return; }
          x.n = Math.max(1, Math.ceil((x.n || 1) / Math.pow(2, step))); if (x.nHi != null) delete x.nHi;
          row.cells[w.uid] = x;
        });
      });
    }
    var R = K.add(M, -TAPER.rehearsal.at), cr = weekIndexOf(k, R);              /* the opener practice, 5 days out */
    if (R > K.today && cr >= c0 && k.weeks[cr].state === 'next') {
      addDay(k, 'Openers', R); var wr = k.weeks[cr]; wr.dates.Openers = R;
      LIFTS.forEach(function (L) { var row = taperRow(k, 'Openers', L); row.cells[wr.uid] = { n: 1, r: 1, rpe: 7, note: 'Opener practice' }; placed[L].rehearsal = R; });
    }
    var Z = K.add(M, -TAPER.last.at), cz = weekIndexOf(k, Z);                   /* the last session, 3 days out, 70 to 80% */
    if (Z > K.today && cz >= c0 && k.weeks[cz].state === 'next') {
      addDay(k, 'Last session', Z); var wz = k.weeks[cz]; wz.dates['Last session'] = Z;
      ['squat', 'bench'].forEach(function (L) { var row = taperRow(k, 'Last session', L); row.cells[wz.uid] = { n: 2, r: 2, pct: 75 }; });
      placed.last = Z;
    }
    /* the week that holds the meet (request #46, programs.md §6.2 rule 9): the meet is its own day (w.meet), and no session
       of the block's pattern stays in it on the days the taper took over or after the meet (Elena: no squats on Sat 21,
       no bench or deadlift days on Mon 23 and Tue 24) */
    var cm = weekIndexOf(k, M);
    if (cm >= c0 && k.weeks[cm]) {
      k.weeks[cm].meet = M; placed.meetWeek = cm;
      for (var c2 = cm; c2 < k.weeks.length; c2++) {
        var w2 = k.weeks[c2];
        k.days.forEach(function (dd) {
          var d = dd.name, iso2 = k.dateOf(c2, d); if (PEAKDAY.test(d) && iso2 && iso2 <= M) return;
          if (!(w2.off && w2.off[d]) && !(iso2 && iso2 > M)) return;
          k.rows.forEach(function (row, r) { if (row.day === d && row.cells[w2.uid] && !row.cells[w2.uid].lifted && !k.isRO(r, c2)) delete row.cells[w2.uid]; });
          if (w2.off) delete w2.off[d];
        });
      }
    }
    k.weeks.forEach(function (w0, c1) { if (c1 >= c0) { w0.sent = w0.sent && false; } });
    return placed;
  }
  function blockForRunIn(b, o) {
    var src = b.weeks.length - 1; while (src > 0 && isPeakWeek(b, src)) src--;
    var sw = b.weeks[src] || null;
    var nb = new Block({ id: b.id, name: o.name || 'Run-in', maxes: clone(b.maxes), maxFrom: clone(b.maxFrom), today: clone(b.today), weeks: [], rows: [], days: [], seq: 0, steps: b.steps, rules: b.rules, defaults: b.defaults, deloadKind: b.deloadKind, kind: 'runin' });
    var days = b.days.filter(function (d) { return !PEAKDAY.test(d.name) && sw && b.rows.some(function (row) { return row.day === d.name && !row.only && row.cells[sw.uid]; }); });
    days.forEach(function (d) { nb.days.push({ name: d.name, wd: K.d(b.dateOf(src, d.name)).getDay() }); });
    for (var i = 0; i < (o.weeks || 3); i++) nb.weeks.push(nb.newWeek(i + 1));
    b.rows.forEach(function (row) {
      if (row.only || !sw || !days.some(function (d) { return d.name === row.day; }) || !row.cells[sw.uid]) return;
      var y = clone(row); y.cells = {}; delete y.nod; delete y.bad; delete y.badf; delete y.mx; delete y.last;
      nb.weeks.forEach(function (w) { y.cells[w.uid] = cellOf(row.cells[sw.uid]); });
      nb.rows.push(y);
    });
    return nb;
  }
  /* date a block's weeks back from the meet: its last week holds the meet day, its last session 3 or 4 days before */
  function dateBack(nb, M, o) {
    o = o || {}; if (!nb.days.length || !nb.weeks.length) return null;
    var lc = nb.weeks.length - 1, w = nb.weeks[lc], ds = nb.days, wd0 = ds[0].wd != null ? ds[0].wd : K.d(M).getDay();
    var S = K.add(M, -((K.d(M).getDay() - wd0 + 7) % 7)), at = S, dates = {};
    ds.forEach(function (d, i) { var dt = i ? K.add(at, 1) : at; if (d.wd != null) while (K.d(dt).getDay() !== d.wd) dt = K.add(dt, 1); dates[d.name] = dt; at = dt; });
    ds.forEach(function (d) { w.dates[d.name] = dates[d.name]; });
    if (o.last) {                           /* the last session lands 3 or 4 days before the meet: later ones move back */
      var used = {}; ds.forEach(function (d) { if (daysBetween(dates[d.name], M) >= TAPER.last.lo) used[dates[d.name]] = 1; });
      ds.slice().reverse().forEach(function (d) {
        if (daysBetween(dates[d.name], M) >= TAPER.last.lo) return;
        var dt = K.add(M, -TAPER.last.lo); while (used[dt] && daysBetween(dt, M) < 7) dt = K.add(dt, -1);
        w.moved = w.moved || {}; w.moved[d.name] = dates[d.name]; w.dates[d.name] = dt; used[dt] = 1;
      });
    }
    w.meet = M; nb.start = nb.dateOf(0, ds[0].name);
    return nb.start;
  }
  /* BLOCK.taper(b, meetIso, o): within 21 days, the weeks from the next one to the meet as a proposal ({ block, c, placed });
     further out, the run-in: o.template (a template dated back from the meet) or the app's last 3 weeks ({ block, starts }) */
  function taper(b, M, o) {
    o = o || {}; if (!b || !isIso(M)) return null;
    var today = o.today || K.today, away = daysBetween(today, M), l = lifterOf(b), mname = (l && l.meet && l.meet.date === M && l.meet.name) || (o.name) || 'the meet';
    if (away < 0) return null;
    if (o.template) {
      var t = o.template && o.template.rows && typeof o.template.toJSON === 'function' ? o.template : from(o.template.block || o.template);
      if (!t) return null;
      var tj = asTemplate(t); tj.id = b.id; tj.maxes = clone(b.maxes); tj.maxFrom = clone(b.maxFrom); tj.blockKind = 'runin'; tj.steps = b.steps;
      var nb = from(tj); nb.kind = 'runin'; nb.meet = { iso: M, name: mname };
      var pat = b.days.filter(function (d) { return !PEAKDAY.test(d.name); }).map(function (d) { var lc = b.weeks.length - 1; return K.d(b.dateOf(lc, d.name)).getDay(); });
      nb.days.forEach(function (d, i) { if (pat[i] != null) d.wd = pat[i]; });
      var starts = dateBack(nb, M, { last: true });
      return { block: nb, kind: 'runin', from: 'template', starts: starts, weeks: nb.weeks.length, label: 'Run-in to ' + mname };
    }
    if (o.from === 'app' || away > TAPER.within) {
      var rb = blockForRunIn(b, { name: 'Run-in to ' + mname, weeks: 3 }); rb.meet = { iso: M, name: mname };
      var st = dateBack(rb, M);
      var pl = taperFill(rb, M, 0);
      return { block: rb, kind: 'runin', from: 'app', starts: st, placed: pl, weeks: rb.weeks.length, label: 'Run-in to ' + mname };
    }
    var k = from(b.toJSON()), c0 = o.c != null ? o.c : k.writeCol();
    while (o.c != null && Math.max(o.c, o.upTo || 0) >= k.weeks.length) { var pw0 = k.weeks[k.weeks.length - 1], nw0 = k.newWeek(k.weeks.length + 1); k.weeks.push(nw0); k.rows.forEach(function (row) { var x = pw0 && row.cells[pw0.uid]; if (x && !PEAKDAY.test(row.day) && !row.only) row.cells[nw0.uid] = cellOf(x); }); }
    if (c0 < 0) { var pw = k.weeks[k.weeks.length - 1], nw = k.newWeek(k.weeks.length + 1); k.weeks.push(nw); k.rows.forEach(function (row) { var x = pw && row.cells[pw.uid]; if (x && !PEAKDAY.test(row.day) && !row.only) row.cells[nw.uid] = cellOf(x); }); c0 = k.weeks.length - 1; }
    k.keepSent();
    var placed = taperFill(k, M, c0), ws = []; for (var c = c0; c < k.weeks.length; c++) ws.push(c);
    return { block: k, c: c0, weeks: ws, placed: placed, kind: 'taper', label: 'The taper to ' + mname };
  }

  /* ---------------- templates (programs §9) ---------------- */
  /* the block's lines and rules, not its loads: a typed main-lift load with an RPE is dropped (the RPE sets each lifter's),
     a percent stays, a typed load alone becomes a percent of the source max; accessory loads are dropped */
  function asTemplate(b, o) {
    o = o || {}; if (!b) return null;
    var j = typeof b.toJSON === 'function' ? b.toJSON() : clone(b), src = j.maxes || {};
    j.id = null; j.name = o.name || j.name; j.maxes = { squat: null, bench: null, deadlift: null }; j.maxFrom = {}; j.today = {}; j.start = null; j.meet = null; j.blockKind = 'template';
    var keep = {}; j.rows = j.rows.filter(function (row) { return !row.only; });
    j.weeks = j.weeks.map(function (w) {
      var o2 = { uid: w.uid, n: w.n, state: 'next', sent: false, sentAt: null, version: 0, deload: !!w.deload, pre: null, started: {}, was: null, taken: false, dates: {}, off: {} };
      if (w.label) o2.label = w.label; if (w.phase) { o2.phase = w.phase; o2.pn = w.pn; } if (w.kind) o2.kind = w.kind; if (w.deloadKind) o2.deloadKind = w.deloadKind; keep[w.uid] = 1; return o2;
    });
    j.rows.forEach(function (row) {
      ['nod', 'bad', 'badf', 'mx', 'max', 'maxFrom', 'last', 'swapFor', 'only'].forEach(function (k0) { delete row[k0]; });
      Object.keys(row.cells).forEach(function (uid) {
        var x = cellOf(row.cells[uid]); if (!keep[uid] || !x) { delete row.cells[uid]; return; }
        if (x.w != null) {
          var mx = row.lift && MAIN[row.lift] ? src[row.lift] : null;
          if (row.lift && MAIN[row.lift] && x.rpe == null && isNum(mx) && mx > 0) x.pct = Math.round(x.w / mx * 200) / 2;
          delete x.w; delete x.wHi;
        }
        row.cells[uid] = x;
      });
    });
    return j;
  }

  /* ---------------- import a sheet (programs §9): a week (one line per row) or a whole block (Week 1 … Week N) ---------------- */
  var HEADS = [['day', /^(day|session|workout|training day)$/], ['exercise', /^(exercise|exercises|movement|lift)$/], ['sets', /^sets?$/], ['reps', /^reps?$/],
    ['effort', /^(rpe|rpe or %|rpe\/%|%|percent|rir|effort)$/], ['load', /^(load|load \(kg\)|weight|kg)$/], ['tempo', /^(tempo|pause)$/], ['note', /^(notes?|cues?)$/], ['week', /^(week|wk)$/]];
  function readTable(t) {
    t = String(t || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (/\t/.test(t)) return t.split('\n').map(function (ln) { return ln.split('\t'); });
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (q) { if (ch === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; continue; }
      if (ch === '"') { q = true; continue; }
      if (ch === ',') { row.push(f); f = ''; continue; }
      if (ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; continue; }
      f += ch;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  /* BLOCK.fromTable(rows | text, { header (default true), map: { 'Intensity': 'effort', 'Junk': null }, name, id, maxes })
     → { ok, block, read: { days, lines, weeks, cells }, bad: [{ row, col, text, why }], unknown: [headers no one mapped], cols } */
  function fromTable(rows, o) {
    o = o || {}; if (typeof rows === 'string') rows = readTable(rows);
    rows = (rows || []).map(function (ln) { return (ln || []).map(function (x) { return x == null ? '' : String(x).trim(); }); });
    while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
    if (!rows.length) return { ok: false, why: 'The sheet is empty.' };
    var header = o.header === false ? null : rows[0], body = header ? rows.slice(1) : rows, map = o.map || {}, cols = {}, unknown = [], weekCols = [];
    if (header) header.forEach(function (h, i) {
      var key = h.toLowerCase().replace(/\s+/g, ' ').trim(); if (!key) return;
      if (Object.prototype.hasOwnProperty.call(map, h)) { var f = map[h] ? fieldName(map[h]) : null; if (f && cols[f] == null) cols[f] = i; return; }
      var wm = /^(?:week|wk)\s*(\d+)$/.exec(key); if (wm) { weekCols.push({ i: i, n: Number(wm[1]) }); return; }
      var hit = HEADS.filter(function (x) { return x[1].test(key); })[0]; if (hit && cols[hit[0]] == null) { cols[hit[0]] = i; return; }
      unknown.push(h);
    });
    else ['day', 'exercise', 'sets', 'reps', 'effort', 'load', 'tempo', 'note'].forEach(function (f, i) { cols[f] = i; });
    if (cols.exercise == null) return { ok: false, why: 'Which column holds the exercises? Name it Exercise, or map it.', unknown: unknown, cols: cols };
    var b = new Block({ id: o.id == null ? null : o.id, name: o.name || 'Imported block', maxes: o.maxes || {}, weeks: [], rows: [], days: [], seq: 0 });
    var bad = [], cells = 0, wk = function (n) { while (b.weeks.length < n) b.weeks.push(b.newWeek(b.weeks.length + 1)); return b.weeks[n - 1]; };
    var exOf = {}, lastDay = 'Day 1', lastEx = null, lineAt = {};
    var rowFor = function (day, name, line) {
      if (b.dayAt(day) < 0) b.days.push({ name: day, wd: WD3[String(day).slice(0, 3)] != null ? WD3[String(day).slice(0, 3)] : null });
      var key = day + '|' + name + '|' + line, hit = b.rows.filter(function (row) { return row.key === key; })[0]; if (hit) return hit;
      var rd = readLiftName(name), lib = rd.lib, lift = rd.lift, ek = day + '|' + name; if (exOf[ek] == null) exOf[ek] = Object.keys(exOf).length;
      var vr = MAIN[lift] ? rd.variant : '';
      hit = { key: key, day: day, ex: exOf[ek], line: line, title: name, name: lib ? lib.name : sentence(name), label: line ? 'Back-offs' : '', lift: MAIN[lift] ? lift : null, cat: lift || null, variant: vr, note: '', pause: 0, tempo: '', prog: 'same', cells: {} };
      if (line) hit.base = 'top';
      b.rows.push(hit); return hit;
    };
    body.forEach(function (ln, i) {
      var day = cols.day != null && ln[cols.day] ? ln[cols.day] : lastDay, exT = ln[cols.exercise] || '';
      var has = weekCols.length ? weekCols.some(function (x) { return ln[x.i]; }) : ['sets', 'reps', 'effort', 'load', 'note'].some(function (f) { return cols[f] != null && ln[cols[f]]; });
      if (!exT && !has) return;
      var m = /^(.*?),\s*(back-offs|then|backoffs)$/i.exec(exT), name = m ? m[1] : exT || lastEx, n = cols.week != null && /\d+/.test(ln[cols.week] || '') ? Number(/\d+/.exec(ln[cols.week])[0]) : 1;
      if (!name) return;
      var lk = day + '|' + name + '|' + (weekCols.length ? 'all' : n), line = (m || !exT || (name === lastEx && day === lastDay)) && lineAt[lk] != null ? lineAt[lk] + 1 : 0;
      lineAt[lk] = line; lastDay = day; lastEx = name;
      var row = rowFor(day, name, line), sp = row.lift ? STEP : STEP, rn = i + (header ? 2 : 1);
      if (weekCols.length) weekCols.forEach(function (x) {
        var t = ln[x.i]; if (!t) return; var w = wk(x.n), res = parse(t, { line: line, hasTop: line > 0, step: sp });
        if (res.ok && res.cell) { row.cells[w.uid] = res.cell; cells++; } else { row.bad = row.bad || {}; row.bad[w.uid] = t; bad.push({ row: rn, col: x.i, text: t, why: res.why || 'Unreadable.' }); }
      });
      else {
        var w = wk(n), cell = null;
        ['sets', 'reps', 'effort', 'load', 'tempo', 'note'].forEach(function (f) {
          if (cols[f] == null) return; var t = ln[cols[f]]; if (!t) return;
          var pf = parseField(f, t, { cell: cell, line: line, hasTop: line > 0, step: sp });
          if (!pf.ok) { row.badf = row.badf || {}; row.badf[w.uid] = row.badf[w.uid] || {}; row.badf[w.uid][f] = t; bad.push({ row: rn, col: cols[f], text: t, why: pf.why }); return; }
          cell = withField(cell, f, pf.keys, pf.whole);
          if (pf.lb != null && cell && cell.w != null) cell.w = round(cell.w, sp);
        });
        if (cell) { row.cells[w.uid] = cell; cells++; }
      }
    });
    if (!b.weeks.length) b.weeks.push(b.newWeek(1));
    b.rows.sort(function (p, q) { return b.dayAt(p.day) - b.dayAt(q.day) || p.ex - q.ex || p.line - q.line; });
    b.perWeek = b.days.length;
    return { ok: true, block: b, read: { days: b.days.length, lines: b.rows.length, weeks: b.weeks.length, cells: cells }, bad: bad, unknown: unknown, cols: cols };
  }

  /* ======================================================================================================================
     SPEC C (13 Nov evening): function-polish F2.1, F3.1, F3.3, P20, P24, P33; first-time-coach §7.1, §7.3
     ==================================================================================================================== */
  var WD7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /* a weekday from 'Mon', 'Monday', 1, { wd } or { name: 'Mon' } (Sun = 0, Mon = 1, as Date.getDay) */
  function wdOf(x) {
    if (isNum(x)) return x >= 0 && x <= 7 && x % 1 === 0 ? x % 7 : null;
    if (typeof x === 'string') { var k = x.trim().slice(0, 3).toLowerCase(); for (var i = 0; i < 7; i++) if (WD7[i].toLowerCase() === k) return i; return null; }
    if (x && typeof x === 'object') return x.wd != null ? wdOf(x.wd) : x.day != null ? wdOf(x.day) : x.name != null ? wdOf(x.name) : null;
    return null;
  }
  var monFirst = function (wd) { return (wd + 6) % 7; };                     // Mon 0 … Sun 6: the order of a training week
  var circ = function (a, z) { var d = Math.abs(a - z) % 7; return Math.min(d, 7 - d); };
  /* the rest between sessions on these weekdays (the week repeats): the gaps, smallest first */
  function gapsOf(wds) {
    var s = wds.map(monFirst).sort(function (a, z) { return a - z; }), g = [];
    for (var i = 0; i < s.length; i++) g.push(i + 1 < s.length ? s[i + 1] - s[i] : s[0] + 7 - s[i]);
    return g.sort(function (a, z) { return a - z; });
  }
  /* -1 when a rests more than z: the smallest gap first, then the next (leximin) */
  function restCmp(a, z) { var ga = gapsOf(a), gz = gapsOf(z); for (var i = 0; i < Math.min(ga.length, gz.length); i++) if (ga[i] !== gz[i]) return gz[i] - ga[i]; return 0; }
  function combos(n, k) { var out = [], pick = []; (function go(i) { if (pick.length === k) { out.push(pick.slice()); return; } for (var j = i; j < n; j++) { pick.push(j); go(j + 1); pick.pop(); } })(0); return out; }
  function proOf(o) {
    if (typeof o === 'string') return /^(his|her|their)$/.test(o) ? o : pronoun({ sex: o });
    if (!o || typeof o !== 'object') return 'their';
    if (o.pronoun || o.who) return proOf(String(o.pronoun || o.who));
    if (o.lifter) return proOf(o.lifter);
    return pronoun(o);
  }
  /* BLOCK.placeDays(tplDays, liftDays, o?) → { days: [{ name, wd }], spare: ['Sat'], text, left? } (function-polish F2.1;
     first-time-coach §7.2's pickDays is this call). Pure. tplDays: the template's days in its order ({ name, wd }, wd null
     for a starter); liftDays: the lifter's weekdays ('Mon' … or numbers or { wd }). Picks, in the template's order, the
     lifter's days with the smallest total distance to the template's weekdays; ties go to the most rest between sessions
     (the largest smallest gap, then the next), then the earlier days. Days with no weekday take the most rest. A spare day
     is named, never dropped: "Mon Tue Thu. Sat free."; all of them: "Tue Thu Sat, his days." (o: the lifter, or { sex },
     or 'his' | 'her' | 'their'); a template with more days than the lifter has places the nearest and names the rest in
     left: "Sat's session has no day: add a 4th day or merge it." With no lifter days the template keeps its own (or, with
     none, the most rest in the week). */
  function placeDays(tplDays, liftDays, o) {
    var T = (Array.isArray(tplDays) ? tplDays : []).map(function (d, i) { return d && typeof d === 'object' ? { name: d.name != null ? String(d.name) : 'Day ' + (i + 1), wd: wdOf(d.wd != null ? d.wd : null) } : { name: 'Day ' + (i + 1), wd: wdOf(d) }; });
    var seen = {}, L = (Array.isArray(liftDays) ? liftDays : []).map(wdOf).filter(function (x) { if (x == null || seen[x]) return false; seen[x] = 1; return true; });
    L.sort(function (a, z) { return monFirst(a) - monFirst(z); });
    var named = T.every(function (d) { return d.wd != null; }), pro = proOf(o);
    if (!T.length) return { days: [], spare: L.map(function (x) { return WD7[x]; }), text: '' };
    if (!L.length) {
      if (named) return { days: T.map(function (d) { return { name: d.name, wd: d.wd }; }), spare: [], text: T.map(function (d) { return WD7[d.wd]; }).join(' ') + '.' };
      L = [1, 2, 3, 4, 5, 6, 0]; var none = true;
    }
    var m = T.length, k = L.length, best = null, cost = function (tw, lw) { var s = 0; for (var i = 0; i < tw.length; i++) s += circ(tw[i], lw[i]); return s; };
    if (m <= k) {
      combos(k, m).forEach(function (ix) {
        var lw = ix.map(function (i) { return L[i]; }), c0 = named ? cost(T.map(function (d) { return d.wd; }), lw) : 0;
        if (!best || c0 < best.c || (c0 === best.c && restCmp(lw, best.lw) < 0)) best = { c: c0, lw: lw };
      });
      var placed = T.map(function (d, i) { return { name: d.name, wd: best.lw[i] }; }), spare = L.filter(function (x) { return best.lw.indexOf(x) < 0; }).map(function (x) { return WD7[x]; });
      var said = best.lw.map(function (x) { return WD7[x]; }).join(' ');
      if (none) return { days: placed, spare: [], text: said + '.' };            /* no days of theirs yet: the most rest in the week */
      return { days: placed, spare: spare, text: spare.length ? said + '. ' + joinAnd(spare) + ' free.' : said + ', ' + pro + ' days.' };
    }
    /* more sessions than days: the template's days that land nearest; the others are named, with what to do */
    combos(m, k).forEach(function (ix) {
      var tw = ix.map(function (i) { return T[i].wd; }), c0 = named ? cost(tw, L) : 0;
      if (!best || c0 < best.c) best = { c: c0, ix: ix };
    });
    var days = best.ix.map(function (i, j) { return { name: T[i].name, wd: L[j] }; }), left = T.filter(function (d, i) { return best.ix.indexOf(i) < 0; });
    var ln = left.map(function (d) { return d.wd != null ? WD7[d.wd] + '’s session' : d.name; }), more = left.length;
    var nth = function (n) { return n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'); };
    var text = joinAnd(ln) + (more === 1 ? (left[0].wd != null ? ' has' : ' has') : ' have') + ' no day: ' + (more === 1 ? 'add a ' + nth(k + 1) + ' day or merge it.' : 'add ' + more + ' days or merge them.');
    return { days: days, spare: [], text: cap1(text), left: left.map(function (d) { return { name: d.name, wd: d.wd }; }) };
  }

  /* BLOCK.setText(cell) → "3 × 3 @8, 85%" (function-polish P33): one written set line for Programs and Teams. Sets × reps,
     the RPE after an @, then a percent, a back-off ("12% off top set"), a load or a stop rule after a comma. Plain spaces
     around the ×, so the line reads the same wherever it is printed */
  function setText(c) {
    c = cellOf(c); if (!c) return '';
    var reps = (c.r == null ? '?' : c.r) + (c.rHi != null ? '-' + c.rHi : '') + (c.amrap ? '+' : '');
    var s = (c.upTo ? 'up to ' + c.n : c.nHi != null ? c.n + '-' + c.nHi : String(c.n == null ? 1 : c.n)) + ' × ' + reps, tail = [];
    /* FIX-LOGIC (FP F3.5): a back-off's RPE follows its words: "2 × 5, 15% off top set, @7" */
    var rpeW = c.rpe != null && !c.rir ? '@' + nf(c.rpe) + (c.rpeHi != null ? '-' + nf(c.rpeHi) : '') : null;
    if (c.rpe != null) { if (c.rir) tail.push(rirOf(c) + ' RIR'); else if (c.off == null) s += ' ' + rpeW; }
    if (c.pct != null) tail.push(nf(c.pct) + (c.pctHi != null ? '-' + nf(c.pctHi) : '') + '%');
    if (c.off != null) { tail.push(c.off ? nf(c.off) + '% off top set' : 'top set load'); if (rpeW) tail.push(rpeW); }
    if (c.w != null) tail.push(nf(c.w) + (c.wHi != null ? '-' + nf(c.wHi) : '') + ' kg');
    else if (c.bw) tail.push('bodyweight');
    if (c.until != null) tail.push('stop at @' + nf(c.until));
    return s + (tail.length ? ', ' + tail.join(', ') : '');
  }

  /* the week's kind beside its name (shared.md §8, first-time-coach §7.1): Build, Deload, Heavy, Peak, Meet week, New maxes.
     A recovery week's name already says it. o: { meet (iso) } */
  var KINDS = ['Build', 'Deload', 'Heavy', 'Peak', 'Meet week', 'New maxes'];
  var KIND_TERM = { Deload: 'deload', Build: 'phase', Heavy: 'phase', Peak: 'phase' };
  function kindOf(x) { if (!x) return null; var k = String(x).trim().toLowerCase(); for (var i = 0; i < KINDS.length; i++) if (KINDS[i].toLowerCase() === k) return KINDS[i]; return k === 'deload week' ? 'Deload' : k === 'meet' ? 'Meet week' : null; }
  P.weekKind = function (c, o) {
    var w = this.weeks[c]; if (!w) return null;
    var k = kindOf(w.kind); if (k) return k;
    if (w.label === 'Recovery week' || this.kind === 'recovery') return null;
    if (w.deload) return 'Deload';
    var meet = (o && o.meet) || w.meet || (this.meet && this.meet.iso) || null, st = this.weekStart(c);
    if (isIso(meet) && st && meet >= st && daysBetween(st, meet) < 7) return 'Meet week';
    return null;
  };

  /* ---------------- the status line's words for a load (function-polish F3.3, P24, §4.2) ----------------
     b.loadWords(r, c) → { text, acts }: b.whyOf's reading in the desk's spec-C words, every load led by its number and unit
     ("105 kg: 10% under week 2’s 117.5 (deload)."), the training max named as such, and a load a progression put there
     said so ("200 kg: from your +2.5 kg rule. By RPE it would be 197.5."), never "typed". whyOf keeps its spec-B words. */
  function byRpe(b, row, x, w, kg) {
    if (!row.lift || !MAIN[row.lift] || x.rpe == null || x.r == null) return null;
    var y = cellOf(x); delete y.w; delete y.wHi; var by = engine0(b, row, y, w.uid, true).kg;
    return isNum(by) && by !== kg ? by : null;
  }
  /* the progression that put a typed load in week c: the week before stepped by the line's own rule (+2.5 kg a week …) */
  function stepMade(b, r, c, x) {
    var row = b.rows[r]; if (!row || c < 1 || !x || x.w == null || !/^(kg2\.5|kg5|pct2\.5)$/.test(row.prog || '')) return null;
    var pw = b.weeks[c - 1], s = pw && ((pw.deload && pw.pre && pw.pre[row.key]) || row.cells[pw.uid]); if (!s) return null;
    var srcs = [b.srcLoad(row, s), s.w, b.loadAt(row, s, pw.uid, true).kg].filter(isNum);
    for (var i = 0; i < srcs.length; i++) { var nx = stepOf(row, cellOf(s), 1, srcs[i]); if (nx && nx.w != null && Math.abs(nx.w - x.w) < 1e-9) return (PROGS.filter(function (p) { return p[0] === row.prog; })[0] || [])[2] || null; }
    return null;
  }
  /* an exercise's name inside a sentence: lower case, a name that is a person's or a place's kept ("Romanian deadlift") */
  function exWord(name) { var n = String(name || ''); return /^(Romanian|Bulgarian|Larsen|Spoto|Zercher|Jefferson|Pendlay|Anderson)\b/.test(n) ? n : n.toLowerCase(); }
  P.loadWords = function (r, c) {
    var row = this.rows[r], w = this.weeks[c]; if (!row || !w) return { text: '', acts: [] };
    var base = this.whyOf(r, c), x = row.cells[w.uid], y = w.why && w.why[row.key], L = this.load(r, c), lf = liftWord(row.lift), l = lifterOf(this), pro = pronoun(l);
    if (!x || x.lifted || (y && y.kind === 'swap-held')) return base;
    var kg = L.kg != null ? nf(L.kg) + (L.kgHi != null && L.kgHi !== L.kg ? '-' + nf(L.kgHi) : '') + ' kg' : null;
    var tmax = function (mx) { return pro + ' ' + nf(mx) + ' training max'; };
    var rpeTail = function (kv) { var by = byRpe(this, row, x, w, kv); return by != null ? ' By RPE it would be ' + nf(by) + '.' : ''; }.bind(this);
    if (y && y.kind === 'held') return { text: (kg || '') + ': held (' + y.why + ').' + (y.add ? ' Your rule would add ' + nf(y.add) + '.' : ''), acts: base.acts };
    if (y && y.kind === 'rule') {
      var who = this.rules ? ((l && l.first) || 'Their') + '’s rule' : 'your ' + (row.lift ? lf + ' ' : '') + 'rule', d = r2(y.now - y.was);
      return { text: nf(y.now) + ' kg: ' + (d >= 0 ? 'up ' : 'down ') + nf(Math.abs(d)) + ' by ' + (y.rule === 'double' ? 'your rule' : who) + '. ' + cap1(String(y.why || '').trim()), acts: base.acts };
    }
    if (y && y.kind === 'step') {
      var pl = (PROGS.filter(function (p) { return p[0] === row.prog; })[0] || [])[2];
      return { text: nf(y.now) + ' kg: ' + (pl && pl !== 'Same' ? 'from your ' + pl + ' rule.' : 'the same as last week.') + rpeTail(y.now), acts: base.acts };
    }
    if (y && y.kind === 'follow') return { text: nf(y.now) + ' kg: follows the ' + nf(y.top != null ? y.top : this.load(this.rows.indexOf(this.topRow(row) || row), c).kg) + ' top set.', acts: base.acts };
    if (y && (y.kind === 'cap' || y.kind === 'lighter')) {
      var mx = this.rowMax(row, w.uid);
      return { text: kg + ': ' + (y.kind === 'cap' ? 'capped at RPE ' + nf(y.rpe) + '. ' : '') + (x.r != null && x.rpe != null && mx ? x.r + ' @' + nf(x.rpe) + ' from ' + tmax(mx) + '.' : ''), acts: base.acts };
    }
    if (w.deload && w.pre && w.pre[row.key] && L.kind === 'typed') { var pw = w.pre[row.key]; return { text: kg + ': 10% under ' + (this.kind === 'recovery' && row.last ? 'week ' + row.last.n + '’s ' : 'the normal week’s ') + nf(pw.w) + ' (deload).', acts: base.acts }; }
    if (this.kind === 'recovery' && row.last && row.last.cell && L.kind === 'typed' && row.last.cell.w != null) return { text: kg + ': 10% under week ' + row.last.n + '’s ' + nf(row.last.cell.w) + ' (deload).', acts: base.acts };
    if (L.kind === 'typed') { var pr = stepMade(this, r, c, x); return { text: kg + ': ' + (pr ? 'from your ' + pr + ' rule.' : 'typed.') + rpeTail(L.kg), acts: base.acts }; }
    if (L.kind === 'rpe') return { text: 'About ' + kg + ': ' + effReps(x) + ' @' + nf(effRpe(x)) + ' from ' + (L.own ? 'its own ' + nf(L.mx) + ' max' : tmax(L.mx) + (L.f !== 1 ? ' ÷ ' + L.f.toFixed(2) + ' for ' + exWord(row.name) : '')) + '.', acts: base.acts };
    if (L.kind === 'pct') return { text: kg + ': ' + nf(x.pct) + (x.pctHi != null ? '-' + nf(x.pctHi) : '') + '% of ' + tmax(L.mx) + '.', acts: base.acts };
    if (L.kind === 'top') return { text: kg + ': ' + (x.off ? nf(x.off) + '% off the ' : 'the load of the ') + nf(L.top) + ' top set.', acts: base.acts };
    if (L.kind === 'nomax') return { text: 'No ' + lf + ' training max yet. Set one, or type a load.', acts: base.acts };
    return base;
  };

  /* ---------------- starter programs fitted to a lifter (first-time-coach §7.1, §7.2, §13) ----------------
     BLOCK.fitStarter(json, { meetIso, startIso, perWeek, days, maxes, meetName, lifter, lifterId }) →
       { data: block JSON (v 2) | null, meta: { weeks, meetWeek, disabled: null | 'Too close: 6 weeks to the meet', title,
         placed: placeDays' answer, kinds: ['Build', …] } } | { error: { code: 'invalid', message } }
     json: a starter (data.js starters: a block's v 2 JSON with id, for, how, phases; or { id, name, block, phases }).
     Its weeks keep their kind from week.kind, week.phase or json.phases (one name per week, or runs { name, weeks }).
     Versions by days: json.versions / json.byPerWeek ({ 3: json, 4: json }); else rows or days carrying per: [3] | [4];
     else the days past perWeek drop (First meet moves the dropped day's first lift line onto the last day kept).
     Fits to a meet (First meet: id 'first-meet', json.weeks 'fit', or phases that end on a Meet week): N = weeks from the
     start week to the meet's week, inclusive, 8 to 16. The last three weeks are Peak, Peak, Meet week, the two before them
     Heavy, the first N − 5 cycles of three Build weeks and a Deload, the last cycle cut short (a cut cycle has no deload).
     Main lifts: Build 1 × 5 @7, @7.5, @8 (later cycles 1 × 3 @7.5, @8, @8.5); Deload half the sets, 1.5 easier; Heavy
     1 × 2 @8, @8.5, back-offs 3 × 3 10% off; Peak singles @8.5, then the last heavy singles @9 on the latest training day
     in each lift's window (BLOCK.TAPER: deadlift 10 to 14 days out, squat 8 to 12, bench 6 to 10); the meet week holds
     Opener practice (4 to 10 days out, placed 5 to 7) and a Last session 3 or 4 days out at 75%. Accessories leave in the
     last 2 weeks. Too close (N < 8) or too far (N > 16) answers data null and meta.disabled. Dates: week 1 is the Monday of
     startIso's week (default next Monday); the days go on the lifter's by placeDays. */
  var PHASE_TOP = { build1: [7, 7.5, 8], build2: [7.5, 8, 8.5], heavy: [8, 8.5] };
  function phaseList(src, json) {
    var n = src.weeks.length, out = [], ph = json.phases || src.phases;
    if (Array.isArray(ph) && ph.length) {
      if (ph.every(function (x) { return typeof x === 'string'; })) ph.forEach(function (x, i) { out[i] = kindOf(x) || x; });
      else ph.forEach(function (x) {
        if (!x || typeof x !== 'object') return; var nm = kindOf(x.kind || x.name || x.label) || x.kind || x.name || x.label;
        var ws = Array.isArray(x.weeks) ? x.weeks : isNum(x.from) ? (function () { var a = []; for (var i = x.from; i <= (isNum(x.to) ? x.to : x.from); i++) a.push(i); return a; })() : isNum(x.n) ? [x.n] : null;
        if (ws) ws.forEach(function (wn) { out[wn - 1] = nm; });
        else if (isNum(x.weeks)) { for (var i = 0; i < x.weeks; i++) out.push(nm); }
      });
    }
    for (var c = 0; c < n; c++) { var w = src.weeks[c]; if (!kindOf(out[c])) out[c] = kindOf(w.kind) || kindOf(w.phase) || (w.deload ? 'Deload' : out[c] || null); }
    return out.slice(0, Math.max(n, out.length));
  }
  /* the version for this many days a week: json.blocks / versions / byPerWeek ({ 3: json, 4: json }), else the block */
  function versionsOf(json, src) { var v = json.blocks || json.versions || json.byPerWeek || src.versions || null; return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  function versionOf(json, src, per) {
    var v = versionsOf(json, src);
    if (v && per && v[per]) { var x = v[per]; return x.block && Array.isArray(x.block.rows) ? x.block : x; }
    return src;
  }
  function inPer(x, per) { var p = x && (x.per != null ? x.per : x.perWeek != null && !isNum(x.perWeek) ? x.perWeek : null); if (p == null || !per) return true; return (Array.isArray(p) ? p : [p]).map(Number).indexOf(per) >= 0; }
  function fitStarter(json, o) {
    o = o || {}; if (!json || typeof json !== 'object') return refuse('invalid', 'There is no starter to fit.');
    var id = json.id || (json.block && json.block.id) || null, src0 = json.block && Array.isArray(json.block.rows) ? json.block : json;
    if (!Array.isArray(src0.rows) || !Array.isArray(src0.weeks) || !src0.weeks.length) return refuse('invalid', 'That starter has no weeks.');
    /* the day count: the coach's, else the lifter's days, to the versions there are (3 or 4 days a week) */
    var vs = versionsOf(json, src0), counts = vs ? Object.keys(vs).map(Number).filter(isNum).sort(function (a, z) { return a - z; }) : Array.isArray(json.perWeek) ? json.perWeek.map(Number) : [];
    var days0 = (src0.days || []).filter(function (d) { return !PEAKDAY.test(d.name); }), want = Array.isArray(o.days) && o.days.length ? o.days.length : null;
    var per = isNum(o.perWeek) ? o.perWeek : counts.length ? (want ? counts.filter(function (k) { return k <= want; }).pop() || counts[0] : counts[counts.length - 1]) : want ? Math.min(want, days0.length) : days0.length;
    var src = clone(versionOf(json, src0, per));
    var ph0 = phaseList(src, json), fm = json.fit && typeof json.fit === 'object' ? json.fit : {};
    var fit = id === 'first-meet' || json.weeks === 'fit' || src.fit === 'meet' || json.fit === 'meet' || !!json.fit && typeof json.fit === 'object' || ph0.indexOf('Meet week') >= 0;
    /* rows and days that say which version they belong to; else the days past the count drop (First meet moves the dropped
       day's first lift line onto the last day kept, as its 3-day version does) */
    src.days = (src.days || []).filter(function (d) { return !PEAKDAY.test(d.name) && inPer(d, per); });
    src.rows = src.rows.filter(function (row) { return !PEAKDAY.test(row.day) && inPer(row, per) && src.days.some(function (d) { return d.name === row.day; }); });
    if (src.days.length > per) {
      var drop = src.days.slice(per), keep = src.days.slice(0, per), lastDay = keep[keep.length - 1];
      if (fit && lastDay) drop.forEach(function (d) {
        var first = src.rows.filter(function (row) { return row.day === d.name && row.line === 0 && row.lift; })[0];
        if (first && !src.rows.some(function (row) { return row.day === lastDay.name && row.name === first.name; })) { var cp = clone(first); cp.day = lastDay.name; cp.key = lastDay.name + '|' + first.name + '|f|0'; src.rows.push(cp); }
      });
      src.days = keep; src.rows = src.rows.filter(function (row) { return keep.some(function (d) { return d.name === row.day; }); });
    }
    var placed = placeDays(src.days.map(function (d) { return { name: d.name, wd: d.wd == null ? null : d.wd }; }), o.days || [], o.lifter || o);
    var start = K.monday(isIso(o.startIso) ? o.startIso : K.add(K.today, 7)), meta = { weeks: src.weeks.length, meetWeek: null, disabled: null, title: null, placed: placed, kinds: [], perWeek: src.days.length };
    var M = isIso(o.meetIso) ? o.meetIso : null, N = src.weeks.length;
    if (fit) {
      var lo = isNum(fm.min) ? fm.min : 8, hi = isNum(fm.max) ? fm.max : 16;
      if (!M) { meta.disabled = 'No meet date yet. Start with First 8 weeks.'; meta.weeks = null; return { data: null, meta: meta }; }
      N = Math.round(daysBetween(start, K.monday(M)) / 7) + 1; meta.weeks = N; meta.meetWeek = N;
      if (N < lo) { meta.disabled = 'Too close: ' + plural(Math.max(0, N), 'week') + ' to the meet'; meta.title = 'Write a short peak from Blank instead.'; return { data: null, meta: meta }; }
      if (N > hi) { meta.disabled = plural(N, 'week') + ' to the meet. Start with First 8 weeks.'; meta.title = meta.disabled; return { data: null, meta: meta }; }
    }
    /* the block: the starter's own rows on the placed days */
    var b = new Block({ id: o.lifterId != null ? o.lifterId : null, name: json.name || src.name || 'Starter', maxes: o.maxes || {}, maxFrom: null, today: {}, weeks: [], rows: [], days: [], seq: src.seq || 0, start: start, perWeek: src.days.length, steps: src.steps, defaults: src.defaults, rules: null, deloadKind: src.deloadKind, kind: null, meet: M && fit ? { iso: M, name: o.meetName || null } : null });
    placed.days.forEach(function (d) { b.days.push({ name: d.name, wd: d.wd }); });
    src.rows.forEach(function (row) { var y = clone(row); y.cells = {}; delete y.per; delete y.perWeek; b.rows.push(y); });
    var srcCell = function (row, c) { var s = src.rows.filter(function (x) { return x.key === row.key; })[0], w = src.weeks[c]; return s && w && s.cells[w.uid] ? cellOf(s.cells[w.uid]) : null; };
    /* week c of the block from week sc of the starter: its cells, deload, kind */
    var copyWeek = function (c, sc, kind) {
      var sw = src.weeks[sc], w = b.newWeek(c + 1); b.weeks.push(w);
      if (sw.deload) { w.deload = true; w.pre = {}; if (sw.deloadKind) w.deloadKind = sw.deloadKind; }
      if (sw.label) w.label = sw.label;
      b.rows.forEach(function (row) { var x = srcCell(row, sc); if (x) row.cells[w.uid] = x; });
      if (w.deload && c > 0) { var pw = b.weeks[c - 1]; b.rows.forEach(function (row) { if (pw && row.cells[pw.uid]) w.pre[row.key] = cellOf(row.cells[pw.uid]); }); }
      w.kind = kind || 'Build'; meta.kinds.push(w.kind);
      return w;
    };
    if (!fit) {
      src.weeks.forEach(function (sw, c) {
        var k = ph0[c] || null;
        if (!k && c === src.weeks.length - 1 && c > 0) { var tops = src.rows.filter(function (row) { return row.line === 0 && row.lift && (!row.variant || row.variant === 'Competition') && row.cells[sw.uid]; }); if (tops.length && tops.every(function (row) { return row.cells[sw.uid].r === 1; })) k = 'New maxes'; }
        copyWeek(c, c, k || (sw.deload ? 'Deload' : 'Build'));
      });
      mindIntake(b, o.lifter, meta);
      return { data: b.toJSON(), meta: meta };
    }
    /* First meet: N weeks by phase. The build weeks come from the starter's cycles (fit.cycles, else its weeks before the
       first Heavy), cut short or repeated; the tail (Heavy, Heavy, Peak, Peak, Meet week) from fit.tail or its last weeks */
    var role = function (row) { return !row.lift ? 'acc' : row.line > 0 ? 'back' : (!row.variant || row.variant === 'Competition') ? 'top' : 'var'; };
    var nb = N - 5, buildIdx = [], tailIdx = null, cycles = [];
    if (Array.isArray(fm.tail) && fm.tail.length === 5) tailIdx = fm.tail.map(function (n) { return n - 1; });
    else { var h0 = ph0.indexOf('Heavy'); if (h0 >= 0 && ph0.length - h0 === 5) tailIdx = [h0, h0 + 1, h0 + 2, h0 + 3, h0 + 4]; }
    if (Array.isArray(fm.cycles) && fm.cycles.length) cycles = fm.cycles.map(function (cy) { return cy.map(function (n) { return n - 1; }); });
    else if (tailIdx) { var cur = []; for (var i0 = 0; i0 < tailIdx[0]; i0++) { cur.push(i0); if (ph0[i0] === 'Deload') { cycles.push(cur); cur = []; } } if (cur.length) cycles.push(cur); }
    var full = !!tailIdx && cycles.length > 0 && tailIdx.concat.apply(tailIdx, cycles).every(function (i) { return i >= 0 && i < src.weeks.length; });
    if (full) {
      for (var ci = 0; buildIdx.length < nb; ci++) { var cy = cycles[Math.min(ci, cycles.length - 1)]; for (var j = 0; j < cy.length && buildIdx.length < nb; j++) buildIdx.push(cy[j]); }
      buildIdx.concat(tailIdx).forEach(function (sc, c) { copyWeek(c, sc, ph0[sc] || (c < nb ? (src.weeks[sc].deload ? 'Deload' : 'Build') : ['Heavy', 'Heavy', 'Peak', 'Peak', 'Meet week'][c - nb])); });
    } else {
      /* a starter with one written week: the weeks by the table above, from that week's lines */
      var plan = [], cyc = 0, inCyc = 0;
      for (var i = 0; i < nb; i++) { if (inCyc === 3) { plan.push({ kind: 'Deload', cyc: cyc }); cyc++; inCyc = 0; } else { plan.push({ kind: 'Build', cyc: cyc, k: inCyc }); inCyc++; } }
      plan.push({ kind: 'Heavy', k: 0 }, { kind: 'Heavy', k: 1 }, { kind: 'Peak', k: 0 }, { kind: 'Peak', k: 1 }, { kind: 'Meet week', k: 0 });
      var base1 = -1; src.weeks.forEach(function (sw, c) { if (base1 < 0 && ph0[c] === 'Build') base1 = c; });
      var wk0 = function (row) { return (base1 >= 0 && srcCell(row, base1)) || srcCell(row, 0); };
      var prevBuild = null;
      plan.forEach(function (p, c) {
        var w = b.newWeek(c + 1); w.kind = p.kind; b.weeks.push(w); meta.kinds.push(p.kind);
        b.rows.forEach(function (row) {
          var rl = role(row), s = wk0(row); if (!s) return;
          var y = cellOf(s), out = daysBetween(b.patternDate(c, row.day), M);
          if (p.kind === 'Build') {
            if (rl === 'top') y = { n: 1, r: p.cyc ? 3 : 5, rpe: (p.cyc ? PHASE_TOP.build2 : PHASE_TOP.build1)[p.k] };
            else if (rl === 'back') { delete y.w; if (y.off == null && y.rpe == null && y.pct == null) y.off = 10; }
          } else if (p.kind === 'Deload') {
            var pb = prevBuild && row.cells[prevBuild.uid]; y = deloadCell(pb || y, 'half-easier', b.stepFor(row));
          } else if (p.kind === 'Heavy') {
            if (rl === 'top') y = { n: 1, r: 2, rpe: PHASE_TOP.heavy[p.k] };
            else if (rl === 'back') y = { n: 3, r: 3, off: 10 };
          } else if (p.kind === 'Peak') {
            if (rl === 'top') y = { n: 1, r: 1, rpe: p.k ? 9 : 8.5 };
            else if (rl === 'back') y = p.k ? null : { n: 2, r: 2, off: 10 };
            else if (rl === 'var') { if (p.k) y = null; else { y.n = Math.max(1, Math.ceil((y.n || 1) / 2)); delete y.nHi; } }
            else if (rl === 'acc') { if (p.k || out <= TAPER.accessories) y = null; else { y.n = Math.max(1, Math.ceil((y.n || 1) / 2)); delete y.nHi; } }
          } else y = null;
          if (y) row.cells[w.uid] = cellOf(y);
        });
        if (p.kind === 'Build') prevBuild = w;
        if (p.kind === 'Deload') { w.deload = true; w.deloadKind = 'half-easier'; w.pre = {}; b.rows.forEach(function (row) { var pb = prevBuild && row.cells[prevBuild.uid]; if (pb) w.pre[row.key] = cellOf(pb); }); }
      });
    }
    /* the taper's dates (shared.md §4.8): each lift's last heavy single on the latest training day in its window (deadlift
       first, its window the earliest), its day moved to that date in that week with its own lines; a day left with nothing
       is off that week. Then the meet week: Opener practice and a Last session, each a session of its own, and the meet */
    var mainDay = {};
    LIFTS.forEach(function (L) { b.days.forEach(function (d) { if (mainDay[L]) return; if (b.rows.some(function (row) { return row.day === d.name && role(row) === 'top' && row.lift === L; })) mainDay[L] = d.name; }); });
    var cands = []; for (var cc = Math.max(0, N - 4); cc < N; cc++) b.days.forEach(function (d) { var iso = b.patternDate(cc, d.name); if (iso && iso < M) cands.push({ iso: iso, c: cc, day: d.name }); });
    cands.sort(function (a, z) { return a.iso < z.iso ? -1 : a.iso > z.iso ? 1 : 0; });
    var used = {}, heavy = {};
    ['deadlift', 'squat', 'bench'].forEach(function (L) {
      if (!mainDay[L]) return; var win = TAPER[L], pick = null;
      cands.forEach(function (x) { var o2 = daysBetween(x.iso, M); if (o2 >= win.lo && o2 <= win.hi && !used[x.iso]) pick = x; });
      if (!pick) cands.forEach(function (x) { var o2 = daysBetween(x.iso, M); if (o2 >= win.lo && o2 <= win.hi) pick = x; });
      if (!pick) { var hd = K.add(M, -win.at); pick = { iso: hd, c: Math.min(N - 2, Math.max(0, Math.floor(daysBetween(start, hd) / 7))) }; }
      used[pick.iso] = 1; heavy[L] = pick;
    });
    var touched = {};
    LIFTS.forEach(function (L) {
      var h = heavy[L]; if (!h) return; var w = b.weeks[h.c], d = mainDay[L]; if (!w) return;
      var was = b.patternDate(h.c, d); w.dates[d] = h.iso; if (was !== h.iso) { w.moved = w.moved || {}; w.moved[d] = was; }
      touched[h.c] = touched[h.c] || {}; touched[h.c][d] = 1;
      b.rows.forEach(function (row) { if (row.day === d && role(row) === 'top' && row.lift === L) row.cells[w.uid] = { n: 1, r: 1, rpe: 9, note: 'Last heavy single' }; });
    });
    Object.keys(touched).forEach(function (c0) {
      var w = b.weeks[+c0], isos = {}; Object.keys(touched[c0]).forEach(function (d) { isos[w.dates[d]] = 1; });
      b.days.forEach(function (d) {
        if (touched[c0][d.name]) return;
        var iso = b.patternDate(+c0, d.name);
        if (isos[iso] || b.rows.some(function (row) { return row.day === d.name && role(row) === 'top' && heavy[row.lift] && +heavy[row.lift].c === +c0; })) b.rows.forEach(function (row) { if (row.day === d.name) delete row.cells[w.uid]; });
      });
    });
    var cm = N - 1, wm = b.weeks[cm], meetDays = b.days.map(function (d) { return b.patternDate(cm, d.name); }).filter(function (iso) { return iso && iso < M; });
    b.rows.forEach(function (row) { delete row.cells[wm.uid]; });                       /* the meet week holds its own sessions */
    var near = function (a, z, at) { var hit = null; meetDays.forEach(function (iso) { var o2 = daysBetween(iso, M); if (o2 >= a && o2 <= z) hit = iso; }); return hit || K.add(M, -at); };
    var R = (function () { var hit = null; meetDays.forEach(function (iso) { var o2 = daysBetween(iso, M); if (o2 >= TAPER.rehearsal.place[0] && o2 <= TAPER.rehearsal.place[1]) hit = hit || iso; }); return hit || near(TAPER.rehearsal.lo, TAPER.rehearsal.hi, TAPER.rehearsal.at); })();
    var Z = near(TAPER.last.lo, TAPER.last.hi, TAPER.last.at); if (Z === R) Z = K.add(M, -TAPER.last.at);
    var mw = fm.meetWeek || {}, opener = mw.opener && typeof mw.opener === 'object' ? cellOf(mw.opener) : null, last = mw.last && typeof mw.last === 'object' ? mw.last : null;
    var dayRow = function (day, L) { var row = { key: day + '|' + K.LIFT[L] + '|s' + (++b.seq) + '|0', day: day, ex: b.maxEx() + 1, line: 0, title: K.LIFT[L], name: K.LIFT[L], label: '', lift: L, cat: L, variant: 'Competition', note: '', pause: 0, tempo: '', prog: 'same', cells: {} }; b.rows.push(row); return row; };
    if (R < M) { b.days.push({ name: 'Openers', wd: K.d(R).getDay() }); wm.dates.Openers = R; LIFTS.forEach(function (L) { var x = opener ? cellOf(opener) : { n: 1, r: 1, rpe: 7 }; x.note = 'Opener practice'; dayRow('Openers', L).cells[wm.uid] = x; }); }
    if (Z < M) {
      b.days.push({ name: 'Last session', wd: K.d(Z).getDay() }); wm.dates['Last session'] = Z;
      var lx = last ? cellOf({ n: last.n || 2, r: last.r || 2, pct: isNum(last.pct) ? last.pct : 75 }) : { n: 2, r: 2, pct: 75 };
      ((last && Array.isArray(last.lifts) && last.lifts.length) ? last.lifts : ['squat', 'bench']).forEach(function (L) { if (MAIN[L]) dayRow('Last session', L).cells[wm.uid] = cellOf(lx); });
    }
    wm.meet = M;
    /* a day of the pattern left with nothing in the last two weeks is off that week ("Off this week"), not an empty day */
    [N - 2, N - 1].forEach(function (c) { var w = b.weeks[c]; if (!w) return; b.days.forEach(function (d) { if (PEAKDAY.test(d.name)) return; if (!b.rows.some(function (row) { return row.day === d.name && row.cells[w.uid]; })) w.off[d.name] = true; }); });
    mindIntake(b, o.lifter, meta);
    return { data: b.toJSON(), meta: meta };
  }
  /* FIX-LOGIC (build C walk 2, Jess's knee): a starter fitted to a lifter does not flag its own picks. A line it wrote that
     loads a part her intake names (paused squat or leg press for a knee) is kept in each week it is in, so the grid never
     asks the coach to judge the app's own choice and Send never goes out past an open check the app raised against itself.
     The squat-day limit is not kept (a starter that broke it would still say so), and a line the coach adds or changes later
     is checked as before. meta.minded: [{ name, part }] and meta.mindedText, the start panel's one line */
  function mindIntake(b, l, meta) {
    var ik = l && l.intake, parts = ((ik && ik.injuries && ik.injuries.parts) || []).map(partOf); if (!parts.length || !b.weeks.length) return;
    var hits = [];
    b.weeks.forEach(function (w, c) {
      var ck = []; try { ck = b.checks(c, { lifter: l, intake: ik, pain: [], today: K.today }); } catch (e) { ck = []; }
      ck.forEach(function (x) {
        if (x.kind !== 'limit' || !x.part || x.fixes.indexOf('Keep it') < 0) return;
        var row = b.rows[x.r]; if (!row) return;
        w.kept = w.kept || {}; w.kept[row.key + '|limit'] = 1;
        if (!hits.some(function (h) { return h.name === row.name; })) hits.push({ name: row.name, part: x.part });
      });
    });
    if (!hits.length) return;
    var her = pronoun(l), names = hits.map(function (h) { return exWord(h.name); }), lim = squatLimit(ik);
    meta.minded = hits;
    meta.mindedText = cap1(names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0]) + ' stay' + (names.length > 1 ? '' : 's') + ', picked with ' + her + ' ' + hits[0].part + ' in mind' + (lim ? ': ' + lim + ' squat days a week at most.' : '.');
  }

  W.BLOCK = {
    __block: true,
    parse: parse, text: text, gridText: gridText, readBack: readBack, step: step4, stepOf: stepOf, loadOf: loadOf, build: build, from: from, blank: blank,
    plain: plain, cellOf: cellOf, norm: norm, CKEYS: CKEYS.slice(), nameOf: nameOf, mult: mult, factor: factorOf, todayE1: todayE1, liftSets: liftSets,
    math: MATH, rules: rules,
    /* spec B (13 Nov) */
    FIELDS: FIELDS.slice(), FIELD_KEYS: clone(FKEYS), parseField: parseField, fieldText: fieldText, withField: withField, lighter: lighter, propose: propose, recovery: recovery,
    taper: taper, TAPER: clone(TAPER), DELOADS: clone(DELOADS), RULES: clone(RULES), rulesFor: rulesFor, asTemplate: asTemplate, fromTable: fromTable, readTable: readTable,
    lineLabel: lineLabel, phoneText: phoneText, painWords: painWords, holdsOf: holdsOf, LIBRARY: clone(LIB), libFind: function (n) { var e = libFind(n); return e ? clone(e) : null; },
    loadsOf: loadsOf, swapIdeas: function (n, o) { return clone(swapIdeas(n, o)); }, isPeakWeek: isPeakWeek, deloadCell: deloadCell, dayWords: dayWords,
    draft: function (b, c) { return b.drafts(c); },
    weekFact: function (b, c, o) { return b.weekFact(c, o); },
    x3: x3, nf: nf, STEP: STEP, UNIT: UNIT,
    PROGS: PROGS.map(function (p) { return { id: p[0], label: p[2], long: p[1] }; }), VARIANTS: clone(VARS), VNAME: clone(VNAME), HELP: HELP,
    /* spec C (13 Nov evening) */
    placeDays: placeDays, setText: setText, offWords: offWords, fitStarter: fitStarter, kindOf: kindOf, KINDS: KINDS.slice(), KIND_TERM: clone(KIND_TERM),
    CHECK_GROUP: clone(CHECK_GROUP), loadWords: function (b, r, c) { return b.loadWords(r, c); }
  };
  /* a store loaded before this file replays the writes that waited for the engine (pages that load store.js first) */
  try { if (W.PL && typeof W.PL.__onBlock === 'function') W.PL.__onBlock(); } catch (e) { /* the store keeps them for the next page */ }
})();
