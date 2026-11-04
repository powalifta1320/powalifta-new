/* desk-program.js: the laptop's program editor, "the week as a program" (2 Nov 2026, coach-desk-v3; rebuilt 3 Nov, the
   owner: "clean understandable and easy to edit/rebuild", "no coach would wanna work on it" as it was).
   A coach writes twenty lifters' weeks every weekend: the whole week in view, every set read at a glance, a load changed in
   one keystroke, Publish, next lifter. The page, top to bottom: a sticky head (the lifter, the block, the week they're in,
   the meet; Preview, the one crimson, ⋯; then the maxes, the save state and Week | Block), the block as a strip of week
   tiles (dates, sessions done, the week's effort, its phase, the countdown to the meet), one quiet row of rebuild tools
   (Copy, Progress with a preview, Templates, Clear, undo and redo, last week's suggestions as a chip), the week's days as
   chips that stay in view, then one card per day: its status and date, its size and length, and each exercise as a title
   row (a lift tile, the name in the lift's ink, the variant, the max its loads come from) over its lines of sets on one
   column grid for the whole day (role · sets × reps · load · effort · notes · what they lifted), each cell a real input
   that reads as text until it's touched. Exercises drag within a day and between days; + Add exercise opens a picker.
   Drafts (the owner's poll, "When I press Publish"): a week the lifter hasn't started can carry draft: true; only trailing
   weeks can be drafts (app.js liftWeeks hides them from the lifter). The one crimson says the next job, in this order:
   Take N suggestions, Publish week N, Send the changes to Arjun, Write week N (brief, 3 Nov).
   desk.js hands its builder over (deskBuilderHead / deskBuilderBody, behind dkWpOn(): ?pb=v1, ?oldbuilder=1 or localStorage
   powa-desk-pb=v1 bring the previous editor back); the Teams screen's program and loads come from team(). Every edit is one
   path, apply(op): the same app.js block loops the phone's helpers use (blockPatch / blockResize / blockAppend / blockRemove),
   one undo entry (desk.js dkPbRemember), persistProgram (the demo writes nothing). Coach-authored text is drawn as text.
   The pure part (model, cells, the planner, mutate, drafts, the demo's accessories) is unit-tested in tests.html
   "desk program (desk-program.js)"; no top-level function declarations (test/run-unit-tests.js checks names). */
(function () {
  'use strict';
  var MAIN = ['squat', 'bench', 'deadlift'];
  var REST_RX = /\b(rest|off|recovery)\b/i;   // the builder's isRestDay heuristic (coach.html, critical fix #1)
  var RX_KEYS = ['weight', 'reps', 'rpe', 'rpeHi', 'rir', 'pct', 'pctHi', 'weightHi', 'pctFeel'];
  var FIELD_KEYS = ['tempo', 'pause', 'pauseAt', 'acc', 'accTxt', 'accKg'];

  /* ====================================================================================================
     PURE
     ==================================================================================================== */
  function n2(v) { var x = Number(v); return isFinite(x) ? Math.round(x * 100) / 100 : 0; }
  function num(v) { return v != null && v !== '' && isFinite(Number(v)) ? Number(v) : null; }
  function isMain(lift) { return MAIN.indexOf(lift) >= 0; }
  function isLogged(s) { return !!(s && (s.completed || s.skipped || s.missed)); }
  // The editor's draft UI (the Draft mark, Publish week N, "Week 3 draft") waits on app.js DRAFTS_ON, as making one does;
  // the lifter's side hides a flagged week whatever the switch (app.js weekIsDraft).
  function isDraft(w) { return draftsOn() && typeof weekIsDraft === 'function' ? weekIsDraft(w) : false; }
  function draftsOn() { return typeof DRAFTS_ON !== 'undefined' && !!DRAFTS_ON; }
  function isRest(day) { return !!day && !(day.exercises || []).length && REST_RX.test(day.name || ''); }
  function weekSets(w) { var out = []; ((w && w.days) || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { out.push(s); }); }); }); return out; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  // What the coach wrote for each set (a logged set keeps its planned load and reps beside what was lifted).
  function planOf(ex) { return ((ex && ex.sets) || []).map(function (s) { return Object.assign({}, s, { weight: typeof planWeight === 'function' ? planWeight(s) : s.weight, reps: s.plannedReps || s.reps }); }); }
  function titleOf(ex) {
    if (!ex) return '';
    if (typeof _exShortTitle === 'function') return _exShortTitle(ex);
    return isMain(ex.lift) ? ((ex.variant && ex.variant !== 'Competition' ? ex.variant + ' ' : '') + ex.lift) : (ex.exerciseName || ex.lift || 'Exercise');
  }
  function swapOf(ex) { var sw = typeof exSwap === 'function' ? exSwap(ex) : null; return sw && sw.to !== sw.from ? sw : null; }
  function topRpe(g) { var lo = num(g.rpe); if (lo == null) return null; var hi = num(g.rpeHi); return hi != null && hi > lo ? hi : lo; }
  // -1 lighter, 1 heavier, 0 the same or not comparable (a % against a %, else kg against kg).
  function cmpLoad(a, b) {
    var pa = num(a.pct), pb = num(b.pct);
    if (pa != null && pb != null) return pa < pb ? -1 : pa > pb ? 1 : 0;
    var wa = Number(a.weight) || 0, wb = Number(b.weight) || 0;
    if (wa > 0 && wb > 0) return wa < wb ? -1 : wa > wb ? 1 : 0;
    return 0;
  }
  // An exercise's lines: one per block of sets as written (groupSets). Sets the lifter added on the day (extra) are never
  // a written line: an all-extra block counts toward "+1 extra". → { lines: [{ g, start, count, real }], extras }
  function exLines(ex) {
    var sets = (ex && ex.sets) || [];
    var groups = typeof groupSets === 'function' ? groupSets(planOf(ex)) : [];
    var lines = [], extras = 0;
    groups.forEach(function (g) {
      var real = sets.slice(g.startIdx, g.startIdx + g.count);
      var nx = real.filter(function (s) { return s && s.extra; }).length;
      if (nx === real.length) { extras += nx; return; }
      lines.push({ g: g, start: g.startIdx, count: g.count - nx, real: real });
    });
    return { lines: lines, extras: extras };
  }
  // The role a line plays: one line says nothing; the first single is "top set" ("single" for one rep); a later line
  // lighter or easier than the first is "back-off".
  function roleOf(lines, i) {
    if (!lines || lines.length < 2) return '';
    var g0 = lines[0].g, g = lines[i].g;
    if (i === 0) return lines[0].count === 1 ? (Number(g0.reps) === 1 ? 'single' : 'top set') : '';
    var e0 = topRpe(g0), e = topRpe(g);
    return cmpLoad(g, g0) < 0 || (e != null && e0 != null && e < e0) ? 'back-off' : '';
  }
  // A logged set against its block's written RPE: + over its top, − under its bottom, 0 inside (desk.js _dkSetGap).
  function setGap(s, g) {
    if (!s || !s.completed || s.actualRpe == null || s.actualRpe === '' || g.rir || g.rpe == null || g.rpe === '') return null;
    var lo = Number(g.rpe), hi = Number(g.rpeHi) > lo ? Number(g.rpeHi) : lo, f = Number(s.actualRpe);
    return f > hi ? Math.round((f - hi) * 10) / 10 : f < lo ? Math.round((f - lo) * 10) / 10 : 0;
  }
  // The gap's colour: alert ≥1 over (coral), warn ≥0.5 over (amber), cool ≤ −0.5 (blue), '' on target (plain).
  function gapCls(gap) { return gap == null ? '' : gap >= 1 ? 'alert' : gap >= 0.5 ? 'warn' : gap <= -0.5 ? 'cool' : ''; }
  function rangeText(lo, hi, show, sep) { return show(lo) + (Number(hi) > Number(lo) ? (sep || '–') + show(hi) : ''); }
  // The load cell. env: { unit, show(kg), maxKg(lift), estKg(ex, g), team }.
  // → { text (at rest), edit (when typing), ph (a placeholder), kind: kg | pct | rpe | feel, noMax }
  function loadCell(g, ex, env) {
    var show = env.show || n2, u = env.unit || 'kg';
    var pct = num(g.pct), w = Number(g.weight) > 0 ? Number(g.weight) : 0, wHi = Number(g.weightHi) > w ? Number(g.weightHi) : 0;
    if (pct != null) {
      var pTxt = rangeText(pct, g.pctHi, n2) + '%', pEdit = rangeText(pct, g.pctHi, n2, '-') + '%';
      if (env.team) return { text: pTxt, edit: pEdit, ph: '', kind: 'pct', noMax: false };
      var mx = isMain(ex.lift) && env.maxKg ? Number(env.maxKg(ex.lift)) || 0 : 0;
      var kg = w || (mx && typeof pctLoadKg === 'function' ? pctLoadKg(pct, mx) : 0);
      var kgHi = w ? wHi : (mx && num(g.pctHi) > pct && typeof pctLoadKg === 'function' ? pctLoadKg(g.pctHi, mx) : 0);
      return { text: kg ? pTxt + ' · ' + rangeText(kg, kgHi, show) : pTxt, edit: pEdit, ph: '', kind: 'pct', noMax: !kg && isMain(ex.lift) };
    }
    if (w) return { text: rangeText(w, wHi, show) + ' ' + u, edit: rangeText(w, wHi, show, '-'), ph: '', kind: 'kg', noMax: false };
    if (num(g.rpe) != null) {
      var est = !env.team && env.estKg ? Number(env.estKg(ex, g)) || 0 : 0;
      return { text: '', edit: '', ph: est ? '≈' + show(est) + ' ' + u : '', kind: 'rpe', noMax: false, est: est };
    }
    return { text: '', edit: '', ph: 'by feel', kind: 'feel', noMax: false };
  }
  function effortCell(g) {
    if (num(g.rpe) == null) return { text: '', edit: '', rir: !!g.rir };
    var r = !!g.rir, t = typeof effortInputText === 'function' ? effortInputText(g, r) : String(g.rpe);
    return r ? { text: t.replace('-', '–') + ' RIR', edit: t + ' RIR', rir: true } : { text: '@' + t.replace('-', '–'), edit: '@' + t, rir: false };
  }
  function fieldsCell(g, unit) {
    return { text: typeof setFieldsShort === 'function' ? setFieldsShort(g) : '', edit: typeof setFieldsCellText === 'function' ? setFieldsCellText(g, unit === 'lb' ? 'lb' : 'kg') : '' };
  }
  // What they lifted on a line: "185 × 3 @9" (one set), "3 × 5 @7.5" (+ " · 165" when the load wasn't what was written),
  // "2 of 3 × 5", "Skipped". gap: the colour of the line's top set against the RPE written. null: nothing logged.
  function liftedOf(line, env) {
    var real = line.real || [], g = line.g, show = env.show || n2;
    if (!real.some(isLogged)) return null;
    var done = real.filter(function (s) { return s.completed; });
    if (!done.length) return { text: real.some(function (s) { return s.skipped; }) ? 'Skipped' : 'Missed', gap: '', top: null };
    var top = done.reduce(function (b, s) { var w = Number(s.weight) || 0, bw = Number(b.weight) || 0; return w > bw || (w === bw && (Number(s.actualRpe) || 0) > (Number(b.actualRpe) || 0)) ? s : b; }, done[0]);
    var rpe = top.actualRpe != null && top.actualRpe !== '' ? ' @' + n2(top.actualRpe) : '';
    var w = Number(top.weight) || 0, reps = Number(top.reps) || 0, text;
    if (line.count === 1 && done.length === 1) text = (w ? show(w) + ' × ' : '') + reps + (w ? '' : reps === 1 ? ' rep' : ' reps') + rpe;
    else if (done.length >= line.count) text = done.length + ' × ' + reps + rpe + (w && Math.abs(w - (Number(g.weight) || 0)) >= 0.05 ? ' · ' + show(w) : '');
    else text = done.length + ' of ' + line.count + ' × ' + (Number(g.reps) || reps) + rpe;
    return { text: text, gap: gapCls(setGap(top, g)), gapN: setGap(top, g), top: top };
  }
  // A line's lifted status, for its dot: ok (on the RPE written), warn (harder: half a point over), alert (a point or more
  // over, as the roster marks it), easy (easier: half a point under), done (lifted, nothing written to compare with),
  // missed (skipped or missed), '' (nothing logged). L: liftedOf's answer.
  function liftedTone(L) {
    if (!L) return '';
    if (L.top == null) return 'missed';
    var g = L.gapN;
    if (g == null) return 'done';
    return g >= 1 ? 'alert' : g >= 0.5 ? 'warn' : g <= -0.5 ? 'easy' : 'ok';
  }
  /* ---------- the week at a glance: each day's status, date, size and length ---------- */
  function d10(v) { return String(v == null ? '' : v).slice(0, 10); }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function isoAdd(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function monISO(iso) { var d = new Date(d10(iso) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
  function topOf(lo, hi) { var a = num(lo), b = num(hi); return b != null && a != null && b > a ? b : a; }
  // A session's length from what's written: a warm-up for each main lift (15 min for the first, 5 for each after; 5 for a
  // day of accessories), then about 5 min a heavy main-lift set (@8 and up, 3 reps or fewer, or 80% and up), 4 any other
  // main-lift set, 2.5 an accessory set; to the nearest 5, 15 at least. → minutes (0: nothing written)
  function dayMinutes(D) {
    var m = 0, mains = {};
    ((D && D.exercises) || []).forEach(function (e) {
      var sets = (e.sets || []).filter(function (s) { return !s.extra; });
      if (!sets.length) return;
      var main = isMain(e.lift);
      if (main && !mains[e.lift]) { m += Object.keys(mains).length ? 5 : 15; mains[e.lift] = 1; }
      sets.forEach(function (s) {
        if (!main) { m += 2.5; return; }
        var r = topOf(s.rpe, s.rpeHi), reps = Number(s.plannedReps || s.reps) || 0, p = topOf(s.pct, s.pctHi);
        m += (r != null && r >= 8) || (reps > 0 && reps <= 3) || (p != null && p >= 80) ? 5 : 4;
      });
    });
    if (!m) return 0;
    if (!Object.keys(mains).length) m += 5;
    return Math.max(15, Math.round(m / 5) * 5);
  }
  // A day as its card and its chip say it. ctx: { today, start (its week's Monday), live (a set landed in the last half
  // hour) }. The date is only one we know: the day it was lifted, else the day it's pinned to (never a guessed weekday).
  // → { rest, empty, total, done, skipped, lifts, sets, minutes, liftsIn, date, dateKind: done | pinned | '',
  //     status: rest | empty | live | done | part | today | missed | planned }
  function daySummary(D, ctx) {
    ctx = ctx || {};
    var exs = (D && D.exercises) || [], all = [], doneOn = '', liftsIn = [];
    exs.forEach(function (e) {
      (e.sets || []).forEach(function (s) {
        if (!s.extra) all.push(s);
        if (s.completed && s.completedAt) { var x = d10(s.completedAt); if (x > doneOn) doneOn = x; }
      });
      if (isMain(e.lift) && (e.sets || []).length && liftsIn.indexOf(e.lift) < 0) liftsIn.push(e.lift);
    });
    var done = all.filter(function (s) { return s.completed; }).length, skipped = all.filter(function (s) { return !s.completed && (s.skipped || s.missed); }).length;
    var pinned = isIso(d10(D && D.scheduledDate)) ? d10(D.scheduledDate) : '';
    var rest = isRest(D), t = d10(ctx.today), ended = !!(ctx.start && t && isoAdd(d10(ctx.start), 7) <= t);
    var out = { rest: rest, empty: !rest && !all.length, total: all.length, done: done, skipped: skipped, lifts: exs.length, sets: all.length,
      minutes: dayMinutes(D), liftsIn: liftsIn, date: doneOn || pinned, dateKind: doneOn ? 'done' : pinned ? 'pinned' : '', status: 'planned' };
    if (rest) out.status = 'rest';
    else if (!all.length) out.status = 'empty';
    else if (ctx.live) out.status = 'live';
    else if (done >= all.length) out.status = 'done';
    else if (done) out.status = doneOn === t && !ended ? 'today' : 'part';
    else if (skipped) out.status = 'missed';
    else if (pinned && pinned === t) out.status = 'today';
    else if (ended) out.status = 'missed';
    return out;
  }
  /* ---------- the block strip: a tile per week ---------- */
  // The week's effort as written: the average of each main-lift exercise's top set, '@8.3' (RPE; RIR counts as the RPE it
  // equals), else the average top % ('78%'), else ''. → { text, n, kind: rpe | pct | '' }
  function weekEffort(W) {
    var rs = [], ps = [];
    ((W && W.days) || []).forEach(function (d) {
      (d.exercises || []).forEach(function (e) {
        if (!isMain(e.lift)) return;
        var r = null, p = null;
        (e.sets || []).forEach(function (s) {
          if (s.extra) return;
          var a = topOf(s.rpe, s.rpeHi), q = topOf(s.pct, s.pctHi);
          if (a != null && (r == null || a > r)) r = a;
          if (q != null && (p == null || q > p)) p = q;
        });
        if (r != null) rs.push(r); else if (p != null) ps.push(p);
      });
    });
    var avg = function (a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; };
    if (rs.length) { var v = Math.round(avg(rs) * 10) / 10; return { text: '@' + v, n: v, kind: 'rpe' }; }
    if (ps.length) { var q2 = Math.round(avg(ps)); return { text: q2 + '%', n: q2, kind: 'pct' }; }
    return { text: '', n: null, kind: '' };
  }
  // The block as tiles. o: { today, starts: [Monday | null per week], nowIdx, meet: { date, name } | null, gap: the weeks
  // between the block's end and the meet }. A week's phase is its intensity against the block's (app.js teamWeekPhases:
  // build · heavy · peak · deload), said only when the block has a shape (a flat block says nothing).
  // → { tiles: [{ idx, n, start, end, state, draft, now, written, sessions: [{ name, state: done | part | missed | todo }],
  //      done, planned, effort, phase, wOut }], gap: { from, to, n } | null, meet: { name, date, wOut } | null }
  function stripModel(weeks, o) {
    o = o || {};
    weeks = weeks || [];
    var starts = o.starts || [], nowIdx = o.nowIdx == null ? -1 : o.nowIdx;
    var phases = typeof teamWeekPhases === 'function' ? teamWeekPhases(weeks) : [];
    var shaped = phases.some(function (p) { return p && p !== 'build'; });
    var meetMon = o.meet && isIso(d10(o.meet.date)) ? monISO(o.meet.date) : null;
    var outOf = function (st) { if (!meetMon || !st) return null; var w = Math.round((Date.parse(meetMon) - Date.parse(st)) / 6048e5); return w >= 0 && w <= 52 ? w : null; };
    var tiles = weeks.map(function (W, i) {
      var st = isIso(starts[i]) ? starts[i] : null, sessions = [];
      (W.days || []).forEach(function (D) {
        var ds = daySummary(D, { today: o.today, start: st });
        if (ds.status === 'rest' || ds.status === 'empty') return;
        sessions.push({ name: D.name || '', state: ds.status === 'done' ? 'done' : ds.status === 'part' || (ds.status === 'today' && ds.done) ? 'part' : ds.status === 'missed' ? 'missed' : 'todo' });
      });
      return { idx: i, n: Number(W.number) || i + 1, start: st, end: st ? isoAdd(st, 6) : null, state: weekState(W, i, nowIdx), draft: isDraft(W), now: i === nowIdx,
        written: weekSets(W).length > 0, sessions: sessions, done: sessions.filter(function (x) { return x.state === 'done' || x.state === 'part'; }).length,
        planned: sessions.length, effort: weekEffort(W), phase: shaped ? (phases[i] || '') : '', wOut: outOf(st) };
    });
    var last = tiles[tiles.length - 1];
    var gap = o.gap >= 1 && last ? { from: last.n + 1, to: last.n + o.gap, n: o.gap } : null;
    var meet = o.meet && isIso(d10(o.meet.date)) ? { name: o.meet.name || 'Meet', date: d10(o.meet.date), wOut: last && last.start ? outOf(last.start) : null } : null;
    return { tiles: tiles, gap: gap, meet: meet };
  }
  /* ---------- the add-exercise picker ---------- */
  var ALIASES = [[/\bpause\b/g, 'paused'], [/\bcg\b/g, 'close grip'], [/\bohp\b/g, 'overhead press'], [/\bdb\b/g, 'dumbbell'], [/\bcomp\b/g, 'competition'],
    [/\bdl\b/g, 'deadlift'], [/\bdeads?\b/g, 'deadlift'], [/\bsquats\b/g, 'squat'], [/\bbp\b/g, 'bench'], [/\bsldl\b/g, 'stiff leg deadlift']];
  function normQ(s) { var t = String(s == null ? '' : s).toLowerCase().replace(/[-_/]+/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(); ALIASES.forEach(function (a) { t = t.replace(a[0], a[1]); }); return t; }
  // Everything the picker offers: what's in this block (latest first, up to five), each main lift's variants, then the
  // accessories by group. o: { recent: [{ lift, variant, exerciseName }], variants(lift), accessories: { push: [..] } }.
  // → [{ key, group: recent | squat | bench | deadlift | push | pull | legs, lift, variant, exerciseName, title, hay }]
  function pickerItems(o) {
    o = o || {};
    var out = [], seen = {};
    var vs = o.variants || (typeof variantsFor === 'function' ? variantsFor : function () { return ['Competition']; });
    var acc = o.accessories || (typeof ACCESSORY_EXERCISES !== 'undefined' ? ACCESSORY_EXERCISES : {});
    var add = function (x) { x.hay = normQ(x.title + ' ' + (x.variant && x.variant !== 'Competition' ? x.variant : '') + ' ' + (isMain(x.lift) ? x.lift + ' competition' : x.lift)); out.push(x); };
    (o.recent || []).forEach(function (r) {
      if (!r || !r.lift) return;
      var t = titleOf(r), k = t.toLowerCase();
      if (!t || seen[k] || Object.keys(seen).length >= 5) return;
      seen[k] = 1;
      add({ key: 'recent:' + k, group: 'recent', lift: r.lift, variant: r.variant || '', exerciseName: r.exerciseName || '', title: t });
    });
    MAIN.forEach(function (L) { vs(L).forEach(function (v) { var x = { lift: L, variant: v, exerciseName: '' }; add({ key: L + ':' + v, group: L, lift: L, variant: v, exerciseName: '', title: titleOf(x) }); }); });
    ['push', 'pull', 'legs'].forEach(function (G) { (acc[G] || []).forEach(function (n) { add({ key: G + ':' + n, group: G, lift: G, variant: '', exerciseName: n, title: n }); }); });
    return out;
  }
  // The picker's search: every word typed starts a word of the exercise (pause, cg, ohp, db, rdl understood), a name that
  // starts with it first, this block's own before the rest among equals; one entry per exercise. → items, best first
  function pickerSearch(items, q) {
    var t = normQ(q);
    var once = function (list) { var seen = {}; return list.filter(function (x) { var k = String(x.title).toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); };
    if (!t) return once((items || []).slice());
    var words = t.split(' '), scored = [];
    (items || []).forEach(function (x, i) {
      var hw = String(x.hay || normQ(x.title)).split(' ');
      var all = words.every(function (w) { return hw.some(function (h) { return h.indexOf(w) === 0; }); });
      var sub = !all && String(x.hay || '').indexOf(t) >= 0;
      if (!all && !sub) return;
      scored.push({ x: x, i: i, s: (normQ(x.title).indexOf(t) === 0 ? 4 : 0) + (all ? 2 : 1) + (x.group === 'recent' ? 0.5 : 0) });
    });
    scored.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    return once(scored.map(function (o2) { return o2.x; }));
  }
  // A line typed into the picker: "Pause squat 3x4 @7" → { name: 'Pause squat', rx: '3x4 @7' }.
  function splitTyped(v) {
    var s = String(v == null ? '' : v).trim(), m = s.match(/^(.*?)[\s:–-]*(\d+\s*(?:x|×|\*|sets?\b).*)$/i);
    return { name: (m ? m[1] : s).replace(/[\s:–-]+$/, '').trim(), rx: m ? m[2].trim() : '' };
  }
  // A week's state on its tab: write (nothing written) · done (every set logged) · now (the week they're in) · past · next.
  function weekState(w, i, nowIdx) {
    var sets = weekSets(w).filter(function (s) { return !s.extra; });
    if (!sets.length) return 'write';
    if (sets.every(isLogged)) return 'done';
    if (i === nowIdx) return 'now';
    return nowIdx >= 0 && i < nowIdx ? 'past' : 'next';
  }
  // The week as the editor draws it. weeks: the block's; wi: the week; env: { unit, show, maxKg, estKg, nowIdx, team,
  // today, starts (each week's Monday), live(set) }.
  // → { weeks: [{ idx, n, state, draft }], week: { idx, n, state, draft, empty, lifted }, days: [{ key, idx, name, rest,
  //     empty, total, done, skipped, doneOn, sum (daySummary), exercises: [{ key, idx, cell, title, full, name, tag, lift,
  //     main, maxKg, note, athleteNote, swap, lock, lines: [{ key, idx, start, count, sid, role, sets, reps, load, effort,
  //     fields, lock, lifted }], extras }] }] }
  function model(weeks, wi, env) {
    env = env || {};
    weeks = weeks || [];
    var nowIdx = env.nowIdx == null ? -1 : env.nowIdx;
    var W = weeks[wi] || null;
    var out = { weeks: weeks.map(function (w, i) { return { idx: i, n: Number(w.number) || i + 1, state: weekState(w, i, nowIdx), draft: isDraft(w) }; }), week: null, days: [] };
    if (!W) return out;
    out.week = Object.assign({}, out.weeks[wi], { empty: !weekSets(W).length, lifted: !env.team && weekSets(W).some(isLogged), prevLifted: false });
    // A week nothing's been lifted in yet shows, beside each line, what the same line lifted the week before.
    var PW = !env.team && !out.week.lifted && wi > 0 ? weeks[wi - 1] : null;
    var start = env.starts && isIso(env.starts[wi]) ? env.starts[wi] : null;
    (W.days || []).forEach(function (D, di) {
      var exs = D.exercises || [];
      var all = []; exs.forEach(function (e) { (e.sets || []).forEach(function (s) { all.push(s); }); });
      var doneOn = '';
      all.forEach(function (s) { if (s.completed && s.completedAt) { var x = String(s.completedAt).slice(0, 10); if (x > doneOn) doneOn = x; } });
      var live = !env.team && typeof env.live === 'function' && all.some(function (s) { return env.live(s); });
      var day = { key: String(D.id != null ? D.id : 'd' + di), idx: di, name: D.name || '', rest: isRest(D), empty: !exs.length, total: all.length,
        done: all.filter(function (s) { return s.completed; }).length, skipped: all.filter(function (s) { return s.skipped || s.missed; }).length, doneOn: doneOn,
        sum: daySummary(D, { today: env.team ? '' : env.today, start: env.team ? null : start, live: live }), exercises: [] };
      var pd = PW && (PW.days || [])[di];
      exs.forEach(function (ex, ei) {
        var sw = env.team ? null : swapOf(ex), wx = sw && typeof exAsWritten === 'function' ? exAsWritten(ex) : ex;
        var pm = pd ? matchIn(pd, ex, ei) : -1, prevL = pm >= 0 ? exLines(pd.exercises[pm]).lines : [];
        var L = exLines(wx), anyDone = (ex.sets || []).some(function (s) { return s.completed; });
        var main = isMain(ex.lift), vr = main && wx.variant && wx.variant !== 'Competition' ? String(wx.variant) : '';
        var X = { key: String(ex.id != null ? ex.id : 'e' + ei), idx: ei, cell: wi + '.' + di + '.' + ei, title: titleOf(wx), full: typeof exTitle === 'function' ? exTitle(wx) : titleOf(wx),
          // the title row: the lift's name in its ink and the variant as a tag ("Squat" · "Paused"); an accessory by its own name
          name: main ? (typeof LIFT_LABELS !== 'undefined' && LIFT_LABELS[ex.lift]) || ex.lift : titleOf(wx), tag: vr ? vr.split(' ').map(function (w, k) { return /^[A-Z]{2,}$/.test(w) || !k ? w : w.toLowerCase(); }).join(' ') : '',
          maxKg: main && !env.team && env.maxKg ? Number(env.maxKg(ex.lift)) || 0 : 0,
          lift: ex.lift, main: main, note: ex.note || '', athleteNote: env.team ? '' : (ex.athleteNote || ''), lock: !env.team && (!!sw || anyDone), swapped: !!sw,
          swap: sw ? (anyDone && typeof variantName === 'function' ? 'Lifted as ' + variantName(ex.lift, sw.to) : (typeof swapLine === 'function' ? swapLine(ex) : 'Swapped')) : '',
          extras: env.team ? 0 : L.extras, lines: [] };
        L.lines.forEach(function (ln, li) {
          var g = ln.g, s0 = (ex.sets || [])[ln.start] || {};
          var lockd = !env.team && (!!sw || ln.real.some(isLogged));
          X.lines.push({ key: X.key + ':' + String(s0.id != null ? s0.id : ln.start), idx: li, start: ln.start, count: ln.count, sid: s0.id != null ? String(s0.id) : '',
            role: roleOf(L.lines, li), sets: String(ln.count), reps: g.reps != null && g.reps !== '' ? String(n2(g.reps)) : '', g: g,
            load: loadCell(g, ex, env), effort: effortCell(g), fields: fieldsCell(g, env.unit), lock: lockd,
            lifted: env.team ? null : liftedOf(ln, env), prev: prevL[li] ? liftedOf(prevL[li], env) : null });
          if (X.lines[X.lines.length - 1].prev) out.week.prevLifted = true;
        });
        day.exercises.push(X);
      });
      out.days.push(day);
    });
    return out;
  }

  /* ---------- cells: what a coach types, read back ---------- */
  // A load as typed: "160", "140-145", "75%", "70-75%", "" (by feel). The display text pasted back reads too ("~185 kg
  // est." is the estimate: nothing written).
  // → { kind: kg | pct | feel, lo, hi } in the typed unit, or null when it doesn't read.
  function parseLoadCell(text) {
    var t = String(text == null ? '' : text).trim();
    if (/^[≈~].*\best\.?$/i.test(t)) return { kind: 'feel', lo: null, hi: null };
    t = t.replace(/^[≈~]\s*/, '');
    if (!t || /^by\s*feel$/i.test(t)) return { kind: 'feel', lo: null, hi: null };
    var pct = /%/.test(t);
    t = t.split('·')[0].replace(/%/g, '').replace(/\s*(kgs?|lbs?)\s*$/i, '').trim();
    var r = typeof parseLoadInput === 'function' ? parseLoadInput(t) : null;
    if (!r || r.lo == null) return null;
    if (pct && (r.lo > 150 || (r.hi != null && r.hi > 150))) return null;
    if (!pct && (r.lo > 1500 || (r.hi != null && r.hi > 1500))) return null;
    return { kind: pct ? 'pct' : 'kg', lo: r.lo, hi: r.hi };
  }
  // An effort as typed: "8", "@8.5", "7-8", "2 RIR", "1-2rir", "" (none). wasRir: the line is in RIR, so a bare "2" is 2 RIR.
  // → { rpe, rpeHi, rir: true | null } or null.
  function parseEffortCell(text, wasRir) {
    var t = String(text == null ? '' : text).trim();
    if (!t) return { rpe: null, rpeHi: null, rir: null };
    var rir = /rir/i.test(t);
    var x = t.replace(/rir/ig, '').replace(/^@\s*/, '').replace(/^rpe\s*/i, '').trim();
    var r = typeof parseEffortInput === 'function' ? parseEffortInput(x, rir) : null;
    if ((!r || r.rpe == null) && !rir && wasRir) { r = parseEffortInput(x, true); if (r && r.rpe != null) rir = true; }
    if (!r || r.rpe == null) return null;
    return { rpe: r.rpe, rpeHi: r.rpeHi != null ? r.rpeHi : null, rir: rir ? true : null };
  }
  // Set fields as typed (the grid's words): a patch for applySetFieldPatch that also clears the fields the text dropped.
  // g: the line's block (its current fields). null when part of the text doesn't read as a field.
  function fieldsPatch(g, text, o) {
    o = o || {};
    var r = typeof parseSetFields === 'function' ? parseSetFields(text, { anywhere: true, unit: o.unit === 'lb' || o.unit === 'lbs' ? 'lbs' : 'kg', cols: o.cols || [] }) : { fields: {}, rest: text };
    if (String(r.rest || '').replace(/[\s·|;,+]+/g, '')) return null;
    var f = r.fields || {}, old = typeof setFieldsOf === 'function' ? setFieldsOf(g) : {}, p = {};
    FIELD_KEYS.forEach(function (k) { p[k] = f[k] != null ? f[k] : (k === 'tempo' ? '' : null); });
    Object.keys(old.cx || {}).forEach(function (k) { p['cx:' + k] = null; });
    Object.keys(f.cx || {}).forEach(function (k) { p['cx:' + k] = f.cx[k]; });
    return p;
  }
  // One cell typed into → the change it means for its line, or why it can't.
  // line: a model line; col: n (sets) | r (reps) | l (load) | e (effort) | f (fields);
  // ctx: { unit, toKg(v), maxKg (this lift's, 0 = none), main, team, cols }.
  // → { t: 'resize', to } | { t: 'patch', patch } | { t: 'fields', patch } | { none: true } | { error }
  function planCell(line, col, text, ctx) {
    ctx = ctx || {};
    var t = String(text == null ? '' : text).trim(), g = line.g || {};
    if (col === 'n') {
      if (!/^\d{1,2}$/.test(t) || +t < 1 || +t > 50) return { error: 'Sets: a number from 1 to 50' };
      return +t === line.count ? { none: true } : { t: 'resize', to: +t };
    }
    if (col === 'r') {
      if (!/^\d{1,3}$/.test(t) || +t < 1 || +t > 100) return { error: 'Reps: a number from 1 to 100' };
      return +t === Number(g.reps) ? { none: true } : { t: 'patch', patch: { reps: +t } };
    }
    if (col === 'l') {
      var L = parseLoadCell(t);
      if (!L) return { error: 'A load: 160, 140-145 or 75%' };
      var toKg = ctx.toKg || function (v) { return v; };
      var kg = function (v) { return Math.round(Number(toKg(v)) * 100) / 100; };
      var patch;
      if (L.kind === 'feel') patch = { weight: 0, weightHi: null, pct: null, pctHi: null, pctFeel: null };
      else if (L.kind === 'kg') patch = { weight: kg(L.lo), weightHi: L.hi ? kg(L.hi) : null, pct: null, pctHi: null, pctFeel: null };
      else {
        patch = { pct: L.lo, pctHi: L.hi || null, pctFeel: null };
        if (ctx.main) {
          // The team's main lifts carry no kg (each lifter's comes from their own max: desk-season.js dsParseMaster).
          var mx = ctx.team ? 0 : Number(ctx.maxKg) || 0;
          var lo = mx && typeof pctLoadKg === 'function' ? pctLoadKg(L.lo, mx) : 0, hi = mx && L.hi && typeof pctLoadKg === 'function' ? pctLoadKg(L.hi, mx) : 0;
          patch.weight = lo; patch.weightHi = hi > lo ? hi : null;
        }
      }
      var same = Object.keys(patch).every(function (k) { var a = patch[k], b = g[k]; return (a == null || a === 0) && (b == null || b === 0 || b === '') ? true : Number(a) === Number(b); });
      return same ? { none: true } : { t: 'patch', patch: patch };
    }
    if (col === 'e') {
      var E = parseEffortCell(t, !!g.rir);
      if (!E) return { error: 'Effort: @8, @7-8 or 2 RIR' };
      if (Number(E.rpe) === Number(g.rpe) && (E.rpeHi == null ? g.rpeHi == null : Number(E.rpeHi) === Number(g.rpeHi)) && !!E.rir === !!g.rir && !(E.rpe == null && g.rpe != null)) return { none: true };
      return { t: 'patch', patch: E };
    }
    if (col === 'f') {
      var P = fieldsPatch(g, t, ctx);
      if (!P) return { error: 'Set fields read like tempo 3-1-0, paused 2s, + light bands, Bar: SSB' };
      var cur = fieldsCell(g, ctx.unit).edit;
      return t === cur ? { none: true } : { t: 'fields', patch: P };
    }
    return { error: 'That cell can’t be changed here' };
  }
  // ↑ / ↓ on a cell: sets and reps by 1, load by the lifter's jump (2.5 kg, 5 lb) or 2.5 for a %, RPE by 0.5 (5 to 10),
  // RIR by 0.5 (0 to 5). → the new text, or null when there's nothing to step.
  function stepCell(col, text, dir, o) {
    o = o || {};
    var t = String(text == null ? '' : text).trim(), d = dir > 0 ? 1 : -1;
    var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
    if (col === 'n' || col === 'r') { var v = parseInt(t, 10); if (!(v >= 0)) v = col === 'n' ? 1 : 5; return String(clamp(v + d, 1, col === 'n' ? 50 : 100)); }
    if (col === 'l') {
      var L = parseLoadCell(t);
      if (!L || L.kind === 'feel') { if (o.est > 0 && o.show) return String(o.show(o.est)); return null; }
      var st = L.kind === 'pct' ? 2.5 : (o.unit === 'lb' || o.unit === 'lbs' ? 5 : 2.5);
      var f = function (x) { return n2(Math.max(0, Math.round((x + d * st) / st * 100) / 100 * st)); };
      var a = f(L.lo), b = L.hi != null ? f(L.hi) : null;
      return a + (b != null && b > a ? '-' + b : '') + (L.kind === 'pct' ? '%' : '');
    }
    if (col === 'e') {
      var E = parseEffortCell(t, !!o.rir);
      if (!E || E.rpe == null) return o.rir ? '2 RIR' : '@8';
      if (E.rir) {
        var r0 = 10 - (E.rpeHi != null ? E.rpeHi : E.rpe), r1 = 10 - E.rpe;
        var lo = clamp(r0 + d * 0.5, 0, 5), hi = clamp(r1 + d * 0.5, 0, 5);
        return n2(lo) + (hi > lo ? '-' + n2(hi) : '') + ' RIR';
      }
      var p0 = clamp(E.rpe + d * 0.5, 5, 10), p1 = E.rpeHi != null ? clamp(E.rpeHi + d * 0.5, 5, 10) : null;
      return '@' + n2(p0) + (p1 != null && p1 > p0 ? '-' + n2(p1) : '');
    }
    return null;
  }
  // A whole line typed (the add row, ⌘D, an exercise with nothing written yet): the parsed sets into the old ones. A set
  // not yet lifted keeps its id (a merge matches sets by id) and takes every prescription field of the new one, ranges
  // included (140-145 → 140-150 used to be dropped, 2 Nov); a logged set is never rewritten here.
  function typedLineSets(oldSets, parsed) {
    oldSets = oldSets || [];
    return (parsed || []).map(function (ns, i) {
      var old = oldSets[i];
      if (!old || isLogged(old)) return ns;
      var changed = false;
      RX_KEYS.forEach(function (k) {
        var v = ns[k], has = v != null && v !== '' && v !== false;
        if (k === 'weight' || k === 'reps') { if (Number(old[k]) !== (Number(v) || 0)) changed = true; old[k] = Number(v) || 0; return; }
        if (k === 'rpe') { var nv = has ? Number(v) : null; if (old.rpe !== nv) changed = true; old.rpe = nv; return; }
        if (has) { if (old[k] !== v) changed = true; old[k] = v; } else if (k in old) { changed = true; delete old[k]; }
      });
      if (changed) delete old.adj;   // a suggestion's mark answered the old load, not this one
      return typeof assignSetFields === 'function' ? assignSetFields(old, ns) : old;
    });
  }

  /* ---------- ops on a block's weeks (both the lifter's program and a team's) ---------- */
  function exAt(weeks, op) {
    var W = (weeks || [])[op.wi], D = W && (W.days || [])[op.di], ex = D && (D.exercises || [])[op.ei];
    if (!ex || (op.exId != null && String(ex.id) !== String(op.exId))) return null;
    return { W: W, D: D, ex: ex };
  }
  function dayAt(weeks, op) {
    var W = (weeks || [])[op.wi], D = W && (W.days || [])[op.di];
    if (!D || (op.dayId != null && String(D.id) !== String(op.dayId))) return null;
    return { W: W, D: D };
  }
  // The line an op points at, from the live block: the same start and the same first set. null = stale.
  function lineAt(ex, op) {
    var L = exLines(ex).lines;
    var i = L.findIndex(function (l) { return l.start === op.start && String(((ex.sets || [])[l.start] || {}).id) === String(op.sid); });
    return i < 0 ? null : { line: L[i], idx: i, all: L };
  }
  var LINE_OPS = { patch: 1, resize: 1, fields: 1, removeGroup: 1 };
  // Why an op can't run on these weeks: 'stale' (it moved), 'logged' (a set in it was lifted), 'swapped' (lifted as a
  // variant that day), 'only' (the last block of an exercise), or '' when it can.
  function refuse(weeks, op, o) {
    o = o || {};
    if (LINE_OPS[op.t] || op.t === 'addGroup' || op.t === 'addSet' || op.t === 'sets') {
      var at = exAt(weeks, op);
      if (!at) return 'stale';
      if (!o.team && swapOf(at.ex)) return 'swapped';
      if (op.t === 'addGroup') return '';
      if (op.t === 'addSet') return !o.team && (at.ex.sets || []).some(isLogged) ? 'logged' : '';
      if (op.t === 'sets') return !o.team && (at.ex.sets || []).some(isLogged) ? 'logged' : '';
      var ln = lineAt(at.ex, op);
      if (!ln) return 'stale';
      if (!o.team && ln.line.real.some(isLogged)) return 'logged';
      if (op.t === 'removeGroup' && ln.all.length <= 1) return 'only';
      return '';
    }
    if (/^(note|removeEx|moveEx|dupEx|variant)$/.test(op.t)) { var a2 = exAt(weeks, op); if (!a2) return 'stale'; if (op.t === 'variant' && !o.team && (a2.ex.sets || []).some(isLogged)) return 'logged'; return ''; }
    // Moved to another place or day: what was lifted stays on the day it was lifted; a rest day takes nothing.
    if (op.t === 'moveExTo') {
      var a3 = exAt(weeks, op), to = dayAt(weeks, { wi: op.wi, di: op.toDi, dayId: op.toDayId });
      if (!a3 || !to) return 'stale';
      if (!o.team && (a3.ex.sets || []).some(isLogged)) return 'logged';
      return isRest(to.D) ? 'rest' : '';
    }
    if (/^(renameDay|removeDay|moveDay|dupDay|addEx|clearDay)$/.test(op.t)) return dayAt(weeks, op) ? '' : 'stale';
    if (op.t === 'addDay' || op.t === 'addRest' || op.t === 'clearWeek') return (weeks || [])[op.wi] ? '' : 'stale';
    return 'stale';
  }
  // Clear a day: every exercise nothing was lifted in goes (what was lifted stays). → how many went
  function clearOut(D) {
    var before = (D.exercises || []).length;
    D.exercises = (D.exercises || []).filter(function (e) { return (e.sets || []).some(isLogged); });
    return before - D.exercises.length;
  }
  // The same exercise in another week's day: at its place, else the same lift, variant and name (desk.js _dkPbMatch).
  function matchIn(day, src, ei) {
    var same = function (e) { return !!e && e.lift === src.lift && (e.variant || '') === (src.variant || '') && String(e.exerciseName || '') === String(src.exerciseName || ''); };
    var exs = (day && day.exercises) || [];
    if (same(exs[ei])) return ei;
    return exs.findIndex(same);
  }
  function planWeightOf(s) { return typeof planWeight === 'function' ? planWeight(s) : s.weight; }
  function cloneEx(ex) {
    var uidF = typeof uid === 'function' ? uid : function (p) { return p + Math.random().toString(36).slice(2); };
    return { id: uidF('ex'), lift: ex.lift, variant: ex.variant || '', exerciseName: ex.exerciseName || '', note: ex.note || '',
      sets: (ex.sets || []).filter(function (s) { return !s.extra; }).map(function (s) {
        return Object.assign({ id: uidF('set'), weight: typeof planWeight === 'function' ? planWeight(s) : s.weight, reps: s.plannedReps || s.reps, rpe: s.rpe == null ? null : s.rpe, tempo: s.tempo || '', completed: false, actualRpe: null, completedAt: null, note: '' }, typeof rxOf === 'function' ? rxOf(s) : {});
      }) };
  }
  function moveIn(arr, i, dir) { var j = i + dir; if (j < 0 || j >= arr.length) return false; var x = arr.splice(i, 1)[0]; arr.splice(j, 0, x); return true; }
  // Run an op on a block's weeks, in place. op.claim: a team program's exercise changed for this lifter is theirs from
  // now on (ovr: the next push asks). → true when it ran, false when it's stale or refused (nothing changed).
  function mutate(weeks, op, o) {
    o = o || {};
    if (!op || refuse(weeks, op, o)) return false;
    var at, ln;
    if (LINE_OPS[op.t] || op.t === 'addGroup' || op.t === 'addSet' || op.t === 'sets' || /^(note|removeEx|moveEx|moveExTo|dupEx|variant)$/.test(op.t)) at = exAt(weeks, op);
    switch (op.t) {
      case 'patch': ln = lineAt(at.ex, op); blockPatch(at.ex.sets, ln.line.start, ln.line.count, op.patch); break;
      case 'resize': ln = lineAt(at.ex, op); blockResize(at.ex.sets, ln.line.start, ln.line.count, op.to); break;
      case 'fields': ln = lineAt(at.ex, op); for (var i = ln.line.start; i < ln.line.start + ln.line.count; i++) applySetFieldPatch(at.ex.sets[i], op.patch); break;
      case 'removeGroup': ln = lineAt(at.ex, op); blockRemove(at.ex.sets, ln.line.start, ln.line.count); break;
      case 'addGroup': blockAppend(at.ex.sets = at.ex.sets || []); break;
      // + Set: one more set like the last one written, every prescription field with it (3 × 4 → 4 × 4)
      case 'addSet': {
        var ss = at.ex.sets = at.ex.sets || [], lastW = null;
        for (var k = ss.length - 1; k >= 0 && !lastW; k--) if (!ss[k].extra) lastW = ss[k];
        if (!lastW) { blockAppend(ss); break; }
        var nw = Object.assign(typeof newSet === 'function' ? newSet(planWeightOf(lastW), lastW.plannedReps || lastW.reps, lastW.rpe, lastW.tempo) : { weight: planWeightOf(lastW), reps: lastW.reps, rpe: lastW.rpe, tempo: lastW.tempo || '', completed: false }, typeof rxOf === 'function' ? rxOf(lastW) : {});
        ss.push(nw);
        break;
      }
      case 'sets': at.ex.sets = typedLineSets(at.ex.sets, op.sets); break;
      case 'note': at.ex.note = String(op.text || '').slice(0, 300); break;
      case 'variant': at.ex.variant = op.variant; break;
      case 'removeEx': at.D.exercises.splice(op.ei, 1); break;
      case 'moveEx': if (!moveIn(at.D.exercises, op.ei, op.dir)) return false; break;
      // To place toEi of day toDi (counted without the one moving); the same place is no change.
      case 'moveExTo': {
        var dst = weeks[op.wi].days[op.toDi];
        var ti = Math.max(0, Math.min(((dst.exercises || []).length) - (dst === at.D ? 1 : 0), Number(op.toEi) || 0));
        if (dst === at.D && ti === op.ei) return false;
        var mv = at.D.exercises.splice(op.ei, 1)[0];
        (dst.exercises = dst.exercises || []).splice(ti, 0, mv);
        break;
      }
      case 'clearDay': if (!clearOut(dayAt(weeks, op).D)) return false; break;
      case 'clearWeek': { var gone = 0; (weeks[op.wi].days || []).forEach(function (d) { gone += clearOut(d); }); if (!gone) return false; break; }
      case 'dupEx': at.D.exercises.splice(op.ei + 1, 0, cloneEx(at.ex)); break;
      case 'addEx': { var d0 = dayAt(weeks, op); (d0.D.exercises = d0.D.exercises || []).push(op.ex); break; }
      case 'renameDay': dayAt(weeks, op).D.name = String(op.name || '').slice(0, 60); break;
      case 'removeDay': weeks[op.wi].days.splice(op.di, 1); break;
      case 'moveDay': if (!moveIn(weeks[op.wi].days, op.di, op.dir)) return false; break;
      case 'dupDay': { var d1 = dayAt(weeks, op).D, uidF = typeof uid === 'function' ? uid : String;
        weeks[op.wi].days.splice(op.di + 1, 0, { id: uidF('day'), name: d1.name, exercises: (d1.exercises || []).map(cloneEx) }); break; }
      case 'addDay': weeks[op.wi].days.push(newDay(op.name || 'Day ' + (weeks[op.wi].days.length + 1))); break;
      case 'addRest': weeks[op.wi].days.push(newDay('Rest')); break;
      default: return false;
    }
    if (op.claim && at && at.ex && at.ex.srcId != null && op.t !== 'removeEx') at.ex.ovr = true;
    return true;
  }

  /* ---------- weeks: write, copy, append, publish ---------- */
  // The week "Write week N" copies: the nearest week before it with something written. -1 when there's none.
  function writeSource(weeks, wi) {
    for (var i = Math.min(wi, (weeks || []).length) - 1; i >= 0; i--) if (weekSets(weeks[i]).length) return i;
    return -1;
  }
  // Write week wi: a copy of its source week (app.js deskCopyWeekDays: rxOf, fresh ids, a swap undone, team links kept),
  // a draft when it can be (canDraftWeek). Refused when the week has logged sets or nothing comes before it.
  // Mutates weeks. → { ok, from, draft, why }
  function writeWeek(weeks, wi) {
    var W = (weeks || [])[wi];
    if (!W) return { ok: false, why: 'stale' };
    if (weekSets(W).some(isLogged)) return { ok: false, why: 'logged' };
    var src = writeSource(weeks, wi);
    if (src < 0) return { ok: false, why: 'nothing' };
    W.days = deskCopyWeekDays(weeks[src].days, W.days);
    return { ok: true, from: src, draft: draftWeekFrom(weeks, wi) };
  }
  // Append n empty weeks to the block (the same day names as its last week), numbered on: drafts while drafts are on
  // (app.js appendBlockWeek, the one append every path uses). → the first index.
  function appendWeeks(weeks, n) {
    var last = weeks[weeks.length - 1], at = weeks.length;
    var num = last ? (Number(last.number) || weeks.length) : 0;
    var uidF = typeof uid === 'function' ? uid : String;
    for (var i = 0; i < n; i++) {
      var w = { id: uidF('wk'), number: num + 1 + i, days: ((last && last.days) || [{ name: 'Day 1' }, { name: 'Day 2' }, { name: 'Day 3' }]).map(function (d) { return { id: uidF('day'), name: d.name || 'Day', exercises: [] }; }) };
      if (typeof appendBlockWeek === 'function') appendBlockWeek(weeks, w, { draft: true }); else weeks.push(w);
    }
    return at;
  }
  // The trailing rule, repaired (app.js keepWeeksDraftsTrailing, also run on every save). → changes
  function keepDraftsTrailing(weeks) { return typeof keepWeeksDraftsTrailing === 'function' ? keepWeeksDraftsTrailing(weeks) : 0; }

  /* ---------- the Programs list: a lifter's status ---------- */
  // o: { prog, week (status.week), reasons, live, toWrite (a week number with suggestions), today, nowIdx }
  // → { write: bool, text, line } ("Week 3 to write", "Week 3 draft", "Block ends Sun"; line: "Strength · week 2 of 3").
  function listStatus(o) {
    o = o || {};
    var prog = o.prog, wk = o.week;
    var name = prog ? String(prog.name || 'Program').replace(/\s+block$/i, '') || 'Program' : '';
    var weeksN = prog ? (prog.weeks || []).length : 0;
    var nowN = prog && o.nowIdx != null && o.nowIdx >= 0 && prog.weeks[o.nowIdx] ? (Number(prog.weeks[o.nowIdx].number) || o.nowIdx + 1) : null;
    var line = !prog ? 'No program' : name + (nowN != null ? ' · week ' + nowN + ' of ' + weeksN : wk ? (wk.finished ? ' · done' : ' · week ' + wk.number + ' of ' + wk.total) : '');
    if (!prog) return { write: true, text: 'No block yet', line: line };
    var weeks = prog.weeks || [];
    var dr = weeks.findIndex(function (w) { return isDraft(w) && weekSets(w).length; });
    if (dr >= 0) return { write: true, text: 'Week ' + (Number(weeks[dr].number) || dr + 1) + ' draft', line: line };
    var from = wk && !wk.finished && wk.idx != null ? wk.idx : -1;
    for (var i = Math.max(0, from + 1); from >= 0 && i < weeks.length; i++) if (!weekSets(weeks[i]).length) return { write: true, text: 'Week ' + (Number(weeks[i].number) || i + 1) + ' to write', line: line };
    if (o.toWrite) return { write: true, text: 'Week ' + o.toWrite + ' suggestions', line: line };
    var rs = o.reasons || [];
    if (rs.some(function (x) { return x.type === 'blockdone'; })) return { write: true, text: 'Block done', line: line };
    if (rs.some(function (x) { return x.type === 'blockend'; })) return { write: true, text: 'Block ends ' + (o.endDay || 'this week'), line: line };
    if (o.live) return { write: false, text: 'Training now', line: line };
    return { write: false, text: '', line: line };
  }

  /* ---------- the demo: accessories under each main lift ---------- */
  // Two or three accessories after each day's main lift (which stays first), loads from the lifter's own base, the
  // variant up 2.5 kg a week, logged on the days the main lift was (actualRpe null, no workout logs: e1RM, PRs, the
  // roster's lines and next week's suggestions read exactly as before). opts.skip: athlete ids left as they are.
  function seedAccessories(store, opts) {
    opts = opts || {};
    var skip = opts.skip || [], n = 0;
    var r25 = function (v) { return Math.max(0, Math.round(v / 2.5) * 2.5); };
    var uidF = typeof uid === 'function' ? uid : function (p) { return p + (++n); };
    var mk = function (lift, variant, name, count, reps, o2) {
      var ex = { id: uidF('ex'), lift: lift, variant: variant || '', exerciseName: name || '', note: '', sets: [] };
      for (var i = 0; i < count; i++) {
        var s = { id: uidF('set'), weight: o2.kg || 0, reps: reps, rpe: o2.rpe == null ? null : o2.rpe, tempo: o2.tempo || '', completed: false, actualRpe: null, completedAt: null, note: '' };
        if (o2.pct) s.pct = o2.pct;
        if (o2.pause) s.pause = o2.pause;
        ex.sets.push(s);
      }
      return ex;
    };
    ((store && store.programs) || []).forEach(function (p) {
      if (!p || !/^demo-d\d+$/.test(String(p.athleteId)) || skip.indexOf(p.athleteId) >= 0) return;
      (p.weeks || []).forEach(function (w, wi) {
        (w.days || []).forEach(function (d) {
          var main = (d.exercises || [])[0];
          if (!main || !isMain(main.lift) || (d.exercises || []).length > 1) return;
          var top = Number(((main.sets || [])[0] || {}).weight) || 0;
          if (!(top > 0)) return;
          var max = top / 0.86, add = [];
          if (main.lift === 'squat') add = [mk('squat', 'Paused', '', 3, 4, { pct: 70 + 2.5 * wi, kg: r25(max * (0.70 + 0.025 * wi)), rpe: 7, pause: 2 }), mk('legs', '', 'Leg Press', 3, 10, { kg: r25(top * 1.4), rpe: 8 }), mk('legs', '', 'Hanging Leg Raise', 3, 12, {})];
          else if (main.lift === 'bench') add = [mk('bench', 'Close Grip', '', 3, 6, { kg: r25(top * 0.78) + 2.5 * wi, rpe: 8 }), mk('pull', '', 'Dumbbell Row', 3, 10, { kg: r25(top * 0.3), rpe: 8 }), mk('push', '', 'Tricep Pushdown', 3, 12, { kg: r25(top * 0.25) })];
          else add = [mk('deadlift', 'RDL', '', 3, 8, { kg: r25(top * 0.6) + 2.5 * wi, rpe: 7, tempo: '3-1-0' }), mk('pull', '', 'Lat Pulldown', 3, 10, { kg: r25(top * 0.3), rpe: 8 }), mk('legs', '', 'Back Extension', 3, 12, {})];
          // Logged when the main lift was: the same day, felt not asked.
          var done = (main.sets || []).filter(function (s) { return s.completed; });
          if (done.length === (main.sets || []).length && done.length) {
            var at = done[done.length - 1].completedAt;
            add.forEach(function (ex) { ex.sets.forEach(function (s) { s.completed = true; s.completedAt = at; s.actualRpe = null; }); });
          }
          d.exercises = d.exercises.concat(add);
        });
      });
    });
    return store;
  }

  /* ====================================================================================================
     DOM: the editor (desk only; every global it reaches for is desk.js's or coach.html's, used inside functions)
     ==================================================================================================== */
  var S = { aid: null, prog: null, wi: 0, adopted: null, root: null, head: null, busy: false, sug: null, sugOff: {}, sugSkip: {}, teamUndo: [], team: null, teamWi: 0,
    view: 'sessions', pv: false, pvDay: null, drag: null, pub: null, pop: null, actions: null };
  function svg(d, w, fill) { return '<svg viewBox="0 0 24 24" fill="' + (fill ? 'currentColor' : 'none') + '"' + (fill ? '' : ' stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round"') + ' aria-hidden="true">' + d + '</svg>'; }
  var IC = {
    copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>'),
    up: svg('<path d="m4 16 5-5 4 3 7-7"/><path d="M15 7h5v5"/>'),
    layers: svg('<path d="M12 4 3.5 8.5 12 13l8.5-4.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/>'),
    undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 2.4),
    flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>', 2.1),
    prev: svg('<path d="M15 6l-6 6 6 6"/>', 2.2),
    next: svg('<path d="M9 6l6 6-6 6"/>', 2.2),
    chev: svg('<path d="M6 9l6 6 6-6"/>', 2.2),
    more: svg('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>', 0, true),
    grip: svg('<circle cx="9" cy="6.5" r="1.6"/><circle cx="15" cy="6.5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="17.5" r="1.6"/><circle cx="15" cy="17.5" r="1.6"/>', 0, true),
    eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
    clear: svg('<path d="M20 20H9.5l-5-5a2 2 0 0 1 0-2.8l8.7-8.7a2 2 0 0 1 2.8 0l4.3 4.3a2 2 0 0 1 0 2.8L13.5 20"/><path d="m8 11.5 5.5 5.5"/>'),
    print: svg('<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v6H7z"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.1),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    spark: svg('<path d="M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7z"/>'),
    push: svg('<path d="M12 20V9"/><path d="m7 13 5-5 5 5"/><path d="M5 4h14"/>', 2.2),
    pull: svg('<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>', 2.2),
    legs: svg('<path d="M8 3v7.5l6 3.5-1.5 6.5"/><path d="M12.5 20.5H17"/>', 2.2),
    other: svg('<circle cx="12" cy="12" r="4"/>', 2)
  };
  var LIFT_GLYPH = { squat: 'S', bench: 'B', deadlift: 'D' };
  function E() { return window.el.apply(window, arguments); }
  function mac() { return typeof _dkMac === 'function' ? _dkMac() : /Mac/.test(navigator.platform || ''); }
  function undoKey() { return mac() ? '⌘Z' : 'Ctrl Z'; }
  function reduced() { return typeof _dkReduced === 'function' && _dkReduced(); }
  function first(n) { return typeof _dkFirst === 'function' ? _dkFirst(n) : String(n || '').split(' ')[0]; }
  function tip(node, text, kbd) { if (typeof dkTip === 'function') dkTip(node, text, kbd); else if (text) node.title = text; return node; }
  function say(t) { if (typeof toast === 'function') toast(t); }
  function progOf(aid) { return (Store.get().programs || []).find(function (p) { return p.athleteId === aid; }) || null; }
  function athleteOf(aid) { return (Store.get().athletes || []).find(function (a) { return a.id === aid; }) || null; }
  function wn(prog, wi) { var w = prog && prog.weeks[wi]; return w ? Number(w.number) || wi + 1 : wi + 1; }
  function unitTag() { return typeof getUnit === 'function' && getUnit() === 'lbs' ? 'lb' : 'kg'; }
  function showKg(kg) { return n2(typeof kgToDisplay === 'function' ? kgToDisplay(kg) : kg); }
  function today() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function fmtDay(iso) { return iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : ''; }
  function fmtWd(iso) { return iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }) : ''; }
  function fmtMd(iso) { return iso ? (typeof fmtDateShort === 'function' ? fmtDateShort(iso) : iso) : ''; }
  function fmtRange(a, b) {
    if (!a || !b) return fmtMd(a);
    var x = new Date(a + 'T12:00:00'), y = new Date(b + 'T12:00:00');
    return x.getMonth() === y.getMonth() ? fmtMd(a) + '–' + y.getDate() : fmtMd(a) + ' – ' + fmtMd(b);
  }
  function daysTo(iso) { return Math.round((Date.parse(d10(iso) + 'T12:00:00Z') - Date.parse(today() + 'T12:00:00Z')) / 864e5); }
  function envFor(prog, aid) {
    var starts = typeof dkPbStarts === 'function' ? dkPbStarts(prog) : [];
    var now = typeof dkPbNow === 'function' ? dkPbNow(prog, starts) : { now: -1 };
    return { unit: unitTag(), show: showKg, toKg: function (v) { return typeof displayToKg === 'function' ? displayToKg(v) : v; },
      maxKg: function (lift) { return isMain(lift) && typeof programMaxKg === 'function' ? programMaxKg(prog, aid, lift) : 0; },
      estKg: function (ex, g) { return typeof _dkBxEstKg === 'function' ? _dkBxEstKg(prog, aid, ex, g) : 0; },
      nowIdx: now.now, starts: starts, today: today(), live: function (s) { return typeof _dkLiveSet === 'function' && _dkLiveSet(s); },
      cols: typeof programSetFields === 'function' ? programSetFields(prog).cols : [] };
  }
  // The week on show: the desk's (_dk.pbWk), adopting activeWeekIdx when something else moved it since the last paint.
  function curWeek(prog) {
    var wi = typeof dkPbWeekIdx === 'function' ? dkPbWeekIdx(prog) : 0;
    try {
      if (S.adopted && S.adopted.prog === prog.id && typeof activeWeekIdx === 'number' && activeWeekIdx !== S.adopted.awi && activeWeekIdx >= 0 && activeWeekIdx < prog.weeks.length) {
        wi = activeWeekIdx; _dk.pbWk = { prog: prog.id, wi: wi };
      }
    } catch (e) {}
    return wi;
  }
  function setWeek(prog, wi) {
    wi = Math.max(0, Math.min(prog.weeks.length - 1, wi));
    _dk.pbWk = { prog: prog.id, wi: wi };
    try { activeWeekIdx = wi; } catch (e) {}
    S.adopted = { prog: prog.id, awi: wi };
    return wi;
  }
  // The lifter's own session length (their intake), in minutes, or 0.
  function intakeMinutes(aid) {
    var ik = (Store.get().intakes || []).find(function (i) { return i.athleteId === aid && i.answers; });
    var m = ik && Number(ik.answers.sessionMinutes);
    return m > 0 ? m : 0;
  }

  /* ---------- the crimson: one per screen, the next job ---------- */
  // Next week's suggestions still to take: the week about to be trained (deskWeekReview's nextIdx), less the ones put off
  // with Not now. → { wi, rows, last } | null
  function pendingSuggestions(prog) {
    if (typeof deskWeekReview !== 'function') return null;
    var rev = deskWeekReview(prog);
    if (rev.nextIdx < 0) return null;
    var skip = (S.sugSkip || {})[prog.id + ':' + rev.nextIdx] || {};
    var rows = rev.rows.filter(function (x) { return (typeof deskSuggestActionable === 'function' ? deskSuggestActionable(x) : !!(x.suggest && x.suggest.delta)) && !skip[x.key]; });
    return rows.length ? { wi: rev.nextIdx, rows: rows, last: rev.lastIdx } : null;
  }
  // The weeks between the block's last week and the meet (0 when there's no meet ahead, or none between).
  function meetGap(prog, aid) {
    var meet = typeof dkPbMeet === 'function' ? dkPbMeet(prog, aid) : null;
    var starts = typeof dkPbStarts === 'function' ? dkPbStarts(prog) : [];
    var ls = starts[starts.length - 1];
    if (!meet || !ls) return 0;
    var g = Math.round((Date.parse(monISO(meet.date)) - Date.parse(ls)) / 6048e5) - 1;
    return g >= 1 && g <= 12 ? g : 0;
  }
  // 1 Take N suggestions (the week about to be trained: what's lifted next comes first, and a draft takes them before it
  // goes out) · 2 Publish week N (a draft, drafts on) · 3 Send the changes to Arjun · 4 Write week N (an unwritten week in
  // the block, or the next one up to the meet) · 5 Start the next block (a finished block, as the phone) · else no crimson:
  // a quiet "Next: <name> ›" (a block written ahead isn't nagged).
  function crimson(prog, aid, wi, o) {
    o = o || {};
    var weeks = prog.weeks || [], a = athleteOf(aid) || { name: '' };
    var W = weeks[wi];
    var sug = o.sug !== undefined ? o.sug : pendingSuggestions(prog);
    if (sug && !(S.sugOff && S.sugOff[prog.id + ':' + sug.wi])) return { k: 'take', wi: sug.wi, rows: sug.rows, label: sug.rows.length === 1 ? 'Take 1 suggestion' : 'Take ' + sug.rows.length + ' suggestions' };
    var drafts = weeks.map(function (w, i) { return isDraft(w) && weekSets(w).length ? i : -1; }).filter(function (i) { return i >= 0; });
    if (drafts.length) { var pi = isDraft(W) && weekSets(W).length ? wi : drafts[0]; return { k: 'publish', wi: pi, label: 'Publish week ' + wn(prog, pi) }; }
    var ch = typeof dkPbChanges === 'function' ? dkPbChanges(prog).length : 0;
    if (ch) return { k: 'send', label: 'Send the changes to ' + first(a.name), n: ch };
    if (W && !weekSets(W).length) return { k: 'write', wi: wi, label: 'Write week ' + wn(prog, wi) };
    var empty = weeks.findIndex(function (w) { return !weekSets(w).length; });
    if (empty >= 0) return { k: 'write', wi: empty, label: 'Write week ' + wn(prog, empty) };
    var gap = o.gap !== undefined ? o.gap : meetGap(prog, aid);
    if (gap >= 1 && weeks.length) return { k: 'next', wi: weeks.length, label: 'Write week ' + (wn(prog, weeks.length - 1) + 1) };
    if (weeks.length && weeks.every(function (w) { var st = weekSets(w).filter(function (x) { return !x.extra; }); return st.length && st.every(isLogged); })) return { k: 'block', label: 'Start the next block' };
    return { k: 'none', label: '' };
  }
  function runCrimson(c) {
    var aid = S.aid;
    if (!commitOpen()) return;
    closePop();
    if (c.k === 'publish') publishWeek(aid, c.wi);
    else if (c.k === 'take') { if (S.wi !== c.wi) pickWeek(c.wi, false); takeSuggestions(aid, c.wi, c.rows); }
    else if (c.k === 'send') { if (typeof dkPublish === 'function') dkPublish(aid); repaintHead(); }
    else if (c.k === 'write') doWriteWeek(aid, c.wi);
    else if (c.k === 'next') addWeek(aid, true);
    else if (c.k === 'block' && typeof openNextBlockSheet === 'function') openNextBlockSheet(S.prog, aid);
  }

  /* ---------- the head: who, the block, the week they're in, the meet; Preview, the crimson, ⋯; the maxes, the save
     state, Week | Block. It stays on screen while the week scrolls under it. ---------- */
  function head(prog, aid, actions, view) {
    S.aid = aid; S.prog = prog.id; S.actions = actions; S.view = view === 'progress' ? 'progress' : 'sessions';
    var h = E('div', { class: 'dp-head is-pb' });
    S.head = h;
    paintHeadInto(h, prog, aid);
    return h;
  }
  // A quiet tool: an icon and its words (short words on a narrower centre, the icon alone below that; the name stays in
  // its tooltip and for assistive tech). o: { label, short, icon, tip, kbd, cls, menu }. A disabled one says why on click.
  function toolBtn(o, run) {
    var b = E('button', { type: 'button', class: 'dp-tool' + (o.cls ? ' ' + o.cls : ''), 'aria-label': o.label });
    if (o.icon) b.insertAdjacentHTML('beforeend', o.icon);
    if (!o.iconOnly) {
      b.appendChild(E('span', { class: 'dp-tool-l' }, o.label));
      b.appendChild(E('span', { class: 'dp-tool-s', 'aria-hidden': 'true' }, o.short || o.label));
    }
    if (o.menu) { b.setAttribute('aria-haspopup', o.menu === 'dialog' ? 'dialog' : 'menu'); b.setAttribute('aria-expanded', 'false'); if (o.menu !== 'dialog') b.insertAdjacentHTML('beforeend', '<span class="dp-tool-caret" aria-hidden="true">' + IC.chev + '</span>'); }
    tip(b, o.tip || o.label, o.kbd);
    hold(b);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (b.getAttribute('aria-disabled') === 'true') { say(b._why || ''); return; }
      if (!commitOpen()) return;
      // The commit may have drawn the row again: a menu anchors to the button that's on screen now.
      var live = b, lab = b.getAttribute('aria-label');
      if (!b.isConnected) live = (S.root && S.root.querySelector('.dp-tool[aria-label="' + lab + '"]')) || (S.head && S.head.querySelector('.dp-tool[aria-label="' + lab + '"]')) || b;
      run(live);
    });
    return b;
  }
  function offTool(b, why) { b.setAttribute('aria-disabled', 'true'); b.classList.add('is-off'); b._why = why; tip(b, why); return b; }
  function paintHeadInto(h, prog, aid) {
    var a = athleteOf(aid) || { name: '' };
    var wi = curWeek(prog), env = envFor(prog, aid);
    h.innerHTML = '';
    var r1 = E('div', { class: 'dp-h1' });
    var nav = E('div', { class: 'dp-nav', role: 'group', 'aria-label': 'Lifters' });
    [['prev', -1, 'Previous lifter', 'K'], ['next', 1, 'Next lifter', 'J']].forEach(function (x) {
      var b = E('button', { type: 'button', class: 'dp-navb', 'aria-label': x[2], html: IC[x[0]] });
      tip(b, x[2], x[3]);
      hold(b, true);   // a cell's blur can't re-render the button away mid-click: the press keeps the focus where it is
      b.addEventListener('click', function () { step(x[1]); });
      nav.appendChild(b);
    });
    r1.appendChild(nav);
    // Their face inside the ring of this week's sessions (Today's and the roster's).
    var row = typeof dkRow === 'function' ? dkRow(aid) : null;
    var face = row && typeof dkRingAv === 'function' ? dkRingAv(row) : (typeof dkAv === 'function' ? dkAv(a) : E('span'));
    face.classList.add('dp-face');
    r1.appendChild(face);
    var id = E('div', { class: 'dp-id' });
    id.appendChild(E('h1', { class: 'dp-name' }, a.name || 'Lifter'));
    var facts = E('div', { class: 'dp-facts' });
    facts.appendChild(blockChip(prog));
    var wk = weekFact(prog, aid, env);
    if (wk) facts.appendChild(E('span', { class: 'dp-fact dp-wkf is-l1' }, wk));
    var mt = meetFact(prog, aid);
    if (mt) { mt.classList.add('is-l1'); facts.appendChild(mt); }
    id.appendChild(facts);
    r1.appendChild(id);
    r1.appendChild(actionsEl(prog, aid, wi, a));
    h.appendChild(r1);
    var r2 = E('div', { class: 'dp-h2' });
    if (wk) r2.appendChild(E('span', { class: 'dp-fact dp-wkf is-l2', 'aria-hidden': 'true' }, wk));
    var mt2 = meetFact(prog, aid);
    if (mt2) { mt2.classList.add('is-l2'); mt2.setAttribute('aria-hidden', 'true'); mt2.removeAttribute('tabindex'); r2.appendChild(mt2); }
    r2.appendChild(maxesEl(prog, aid));
    r2.appendChild(stateEl(prog, wi, a));
    r2.appendChild(E('span', { class: 'dp-h2-gap' }));
    r2.appendChild(viewSeg());
    h.appendChild(r2);
    watchHead(h);
  }
  // The block's name as a chip, typed in place: Enter or leaving saves, Esc puts it back, ⌘Z undoes it.
  function blockChip(prog) {
    var bn = E('input', { type: 'text', class: 'dp-bname', 'aria-label': 'Block name', spellcheck: 'false', maxlength: '80', placeholder: 'Name the block', 'data-k': 'head:bname' });
    bn.value = prog.name || '';
    var save = function () {
      var cur = progOf(S.aid);
      if (!cur) return true;
      var v = bn.value.trim().slice(0, 80);
      if (!v) { bn.value = cur.name || ''; return true; }
      if (v === (cur.name || '')) return true;
      dkPbRemember(cur, 'Rename the block');
      Store.update(function (s) { var x = s.programs.find(function (y) { return y.id === cur.id; }); if (x) x.name = v; });
      persistProgram(cur.id);
      var l = document.getElementById('dkPbList'); if (l && typeof dkPaintPbRows === 'function') dkPaintPbRows(l);
      if (typeof dkPbPaintUndo === 'function') dkPbPaintUndo();
      return true;
    };
    bn._commit = save;
    bn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); bn.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var cur = progOf(S.aid); bn.value = (cur && cur.name) || ''; bn.blur(); }
    });
    bn.addEventListener('blur', function () { if (bn.isConnected) save(); });
    tip(bn, 'The block’s name. Click to rename it');
    return bn;
  }
  // "Week 2 of 3", "Starts Nov 9", "Block done", "3 weeks".
  function weekFact(prog, aid, env) {
    if (env.nowIdx >= 0) return 'Week ' + wn(prog, env.nowIdx) + ' of ' + prog.weeks.length;
    var st = env.starts[0];
    if (st && env.today < st) return 'Starts ' + fmtMd(st);
    var r = typeof dkRow === 'function' ? dkRow(aid) : null, wk = r && r.status && r.status.week;
    if (wk && wk.finished) return 'Block done';
    return plural(prog.weeks.length, 'week');
  }
  function meetFact(prog, aid) {
    var meet = typeof dkPbMeet === 'function' ? dkPbMeet(prog, aid) : null;
    if (!meet) return null;
    var d = daysTo(meet.date);
    var s = E('span', { class: 'dp-fact dp-meetf', tabindex: '0' });
    s.insertAdjacentHTML('beforeend', IC.flag);
    s.appendChild(E('span', { class: 'dp-meetf-n' }, meet.name));
    s.appendChild(E('span', { class: 'dp-meetf-d' }, ' · ' + (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : d + ' days')));
    s.setAttribute('aria-label', meet.name + ', ' + fmtDay(meet.date) + ', ' + (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days'));
    tip(s, meet.name + ' · ' + fmtDay(meet.date));
    return s;
  }
  // Preview (as the lifter sees it), the one crimson (the next job, or a quiet "Next: Callum" when nothing's due), ⋯.
  function actionsEl(prog, aid, wi, a) {
    var act = E('div', { class: 'dp-hact' });
    var pv = toolBtn({ label: 'Preview', icon: IC.eye, tip: 'Week ' + wn(prog, wi) + ' as ' + first(a.name) + ' sees it in the app', cls: 'dp-pvbtn', menu: 'dialog' }, function () { togglePreview(); });
    pv.setAttribute('aria-pressed', String(!!S.pv));
    pv.removeAttribute('aria-expanded');
    act.appendChild(pv);
    var c = crimson(prog, aid, wi);
    if (c.k === 'none') {
      var ids = order(), at = ids.indexOf(aid), nx = ids.length > 1 ? athleteOf(ids[(at + 1 + ids.length) % ids.length]) : null;
      if (nx) {
        var q = E('button', { type: 'button', class: 'dp-tool dp-next' }, 'Next: ' + first(nx.name));
        q.insertAdjacentHTML('beforeend', IC.next);
        tip(q, first(a.name) + '’s block is written ahead. ' + nx.name + ' next', 'J');
        hold(q);
        q.addEventListener('click', function () { step(1); });
        act.appendChild(q);
      }
    } else {
      var b = (typeof dkBtn === 'function' ? dkBtn : function (l) { return E('button', { type: 'button' }, l); })(c.label, { primary: true, cls: 'dp-cta', onClick: function () { runCrimson(c); } });
      hold(b);
      tip(b, c.k === 'publish' ? first(a.name) + ' sees week ' + wn(prog, c.wi) + ' once it’s published, with a heads-up. Until then it’s your draft'
        : c.k === 'take' ? 'Writes ' + (c.rows.length === 1 ? 'the suggestion' : 'the ' + c.rows.length + ' suggestions') + ' from how week ' + wn(prog, Math.max(0, c.wi - 1)) + ' was lifted into week ' + wn(prog, c.wi)
        : c.k === 'send' ? 'Your edits are live as you type. This sends ' + first(a.name) + ' a heads-up about the ' + plural(c.n, 'change')
        : c.k === 'write' ? 'Copies the week before it' + (draftsOn() ? ' as a draft: change it, then publish' : ': change what needs changing')
        : c.k === 'block' ? 'Every set of this block is lifted. The next block, from a template or this one moved on'
        : 'Adds week ' + c.label.replace(/\D+/g, '') + (draftsOn() ? ' as a draft' : '') + ', a copy of the last week');
      act.appendChild(b);
    }
    var more = E('button', { type: 'button', class: 'dp-tool dp-more', 'aria-label': 'More for this block', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: IC.more });
    tip(more, 'More');
    hold(more);
    more.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!commitOpen()) return;
      var live = more.isConnected ? more : (S.head && S.head.querySelector('.dp-hact .dp-more')) || more;
      dkPopMenu(live, blockMenu(aid, S.wi), { alignRight: true });
    });
    act.appendChild(more);
    return act;
  }
  // The maxes % loads and the estimates come from, a lift dot beside each; a click opens them.
  function maxesEl(prog, aid) {
    var b = E('button', { type: 'button', class: 'dp-maxes' });
    var said = [], est = false;
    MAIN.forEach(function (L) {
      var v = typeof programMaxKg === 'function' ? programMaxKg(prog, aid, L) : 0;
      if (!(v > 0)) return;
      if (!(prog.maxes && Number(prog.maxes[L]) > 0)) est = true;
      var t = String(Math.round(typeof kgToDisplay === 'function' ? kgToDisplay(v) : v));
      said.push(((typeof LIFT_LABELS !== 'undefined' && LIFT_LABELS[L]) || L) + ' ' + t);
      b.appendChild(E('span', { class: 'dp-max lift-' + L }, E('i', { class: 'dp-ldot', 'aria-hidden': 'true' }), t));
    });
    if (said.length) b.appendChild(E('span', { class: 'dp-max-u' }, unitTag() + (est ? ' · from their e1RM' : '')));
    else b.appendChild(E('span', { class: 'dp-max-none' }, 'Set maxes for % sets'));
    b.setAttribute('aria-label', said.length ? 'Maxes: ' + said.join(', ') + ' ' + unitTag() + '. Change them' : 'Set maxes for % sets');
    tip(b, 'The maxes % loads and the estimates work from' + (est ? '. A lift with none set uses their best e1RM' : '') + '. Click to change them');
    hold(b);
    b.addEventListener('click', function () { if (commitOpen() && typeof openMaxesSheet === 'function') openMaxesSheet(prog.id, aid); });
    return b;
  }
  function stateEl(prog, wi, a) {
    var draft = isDraft(prog.weeks[wi]);
    var s = E('span', { class: 'dp-state' + (draft ? ' is-draft' : ''), role: 'status' }, E('i', { class: 'dp-sdot', 'aria-hidden': 'true' }), E('span', {}, draft ? 'Draft' : 'Saved', E('span', { class: 'dp-state-x' }, draft ? ' · only you see it' : ' · ' + first(a.name) + ' sees it')));
    tip(s, draft ? 'Week ' + wn(prog, wi) + ' is your draft: ' + first(a.name) + ' sees it once you publish it' : 'Saved as you type: ' + first(a.name) + ' sees every change in the app');
    return s;
  }
  // Week | Block: the week day by day, or each lift across the block (V).
  function viewSeg() {
    var seg = E('div', { class: 'dk-seg dp-vseg', role: 'radiogroup', 'aria-label': 'View' });
    [['sessions', 'Week', 'The week, day by day'], ['progress', 'Block', 'Each lift across the block']].forEach(function (x) {
      var on = S.view === x[0];
      var b = E('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) }, x[1]);
      tip(b, x[2], 'V');
      hold(b);
      b.addEventListener('click', function () { if (on || !commitOpen()) return; closePop(); deskSetPbView(x[0]); loadProgram(); });
      seg.appendChild(b);
    });
    return seg;
  }
  // The head stays in view; the days' chips dock under it (--dp-hh), and the head takes a hairline once the week is under it.
  function watchHead(h) {
    var sc = document.getElementById('programArea');
    if (!sc) return;
    var set = function () { if (h.isConnected) sc.style.setProperty('--dp-hh', Math.max(0, h.offsetHeight - 16) + 'px'); };
    set();
    requestAnimationFrame(set);
    if (window.ResizeObserver && !h._ro) { h._ro = new ResizeObserver(set); h._ro.observe(h); }
    if (!sc._dpScroll) {
      sc._dpScroll = true;
      sc.addEventListener('scroll', function () { stuck(sc); spyDays(sc); }, { passive: true });
    }
  }
  // The head and the days' chips take a solid ground (and one hairline) once the week scrolls under them.
  function stuck(sc) {
    var hd = sc.querySelector('.dp-head.is-pb'), ch = S.root && S.root.isConnected ? S.root.querySelector('.dp-dchips') : null;
    if (hd) { hd.classList.toggle('is-stuck', sc.scrollTop > 18); hd.classList.toggle('no-chips', !ch); }
    if (ch) { var hh = hd ? Math.max(0, hd.offsetHeight - 16) : 0; ch.classList.toggle('is-stuck', ch.getBoundingClientRect().top - sc.getBoundingClientRect().top <= hh + 1 && sc.scrollTop > 18); }
  }
  // ⋯: the week (days, publish, print, remove), the block (maxes, set fields, rename, the team, import or photo, export,
  // the next block), the previous editor, Delete apart at the end.
  function blockMenu(aid, wi) {
    var prog = progOf(aid), W = prog.weeks[wi], n = wn(prog, wi), items = [];
    var title = function (t) { return { node: E('div', { class: 'dk-menu-title', role: 'presentation' }, t) }; };
    items.push(title('Week ' + n));
    items.push({ label: 'Add a training day', run: function () { dkPbRemember(progOf(aid), 'Add a day'); addDay(wi); } });
    // Critical fix #1: Add rest day stays (addRestDay names it "Rest", the isRestDay heuristic reads it).
    items.push({ label: 'Add a rest day', run: function () { dkPbRemember(progOf(aid), 'Add a rest day'); addRestDay(wi); } });
    if (isDraft(W) && weekSets(W).length) items.push({ label: 'Publish week ' + n, run: function () { publishWeek(aid, wi); } });
    items.push({ label: 'Print week ' + n, hint: mac() ? '⌘P' : 'Ctrl P', run: function () { printWeek(); } });
    if (prog.weeks.length > 1) items.push({ label: 'Remove week ' + n, danger: true, run: function () { removeWeek(aid, wi); } });
    items.push('-', title('The block'));
    items.push({ label: S.view === 'progress' ? 'The week' : 'Across the block', hint: 'V', run: function () { deskSetPbView(S.view === 'progress' ? 'sessions' : 'progress'); loadProgram(); } });
    items.push({ label: 'Maxes for % sets…', run: function () { openMaxesSheet(prog.id, aid); } });
    items.push({ label: 'Set fields…', run: function () { openSetFieldsSheet(prog.id, function () { loadProgram(); }); } });
    items.push({ label: 'Rename the block', run: function () { var bn = S.head && S.head.querySelector('.dp-bname'); if (bn) { bn.focus(); bn.select(); } } });
    if (typeof window.deskBuilderTeam === 'function') {
      var onTeam = typeof dsTeamOf === 'function' && dsTeamOf(aid);
      items.push({ label: onTeam ? 'Open ' + (onTeam.name || 'the team') : 'Make it a team program…', run: function () { window.deskBuilderTeam(aid); } });
    }
    var acts = (S.actions || []).filter(Boolean).filter(function (x) { return !/^(Notify |Maxes for|Set fields|Add week|Save as template|Rename|Start the next block|Replace with an imported)/.test(x.label); });
    acts.forEach(function (x) { if (!x.danger) items.push({ label: typeof _dkPbActLabel === 'function' ? _dkPbActLabel(x.label) : x.label, run: x.onClick }); });
    if (prog.weeks.length && wi === prog.weeks.length - 1 && typeof openNextBlockSheet === 'function') items.push({ label: 'Start the next block…', run: function () { openNextBlockSheet(prog.id, aid); } });
    items.push({ label: 'Change it set by set', run: function () { _dk.pbWk = { prog: prog.id, wi: wi }; deskSetPbView('sets'); loadProgram(); } });
    items.push({ label: 'Use the previous editor', hint: 'This release', run: function () { try { localStorage.setItem('powa-desk-pb', 'v1'); } catch (e) {} loadProgram(); } });
    var del = acts.filter(function (x) { return x.danger; });
    if (del.length) { items.push('-'); del.forEach(function (x) { items.push({ label: x.label, danger: true, run: x.onClick }); }); }
    return items;
  }
  function repaintHead() {
    var prog = progOf(S.aid);
    if (!prog || !S.head || !S.head.isConnected) return;
    var a = document.activeElement, k = a && S.head.contains(a) ? (a.getAttribute('data-k') || (a.classList.contains('dk-seg-btn') ? 'seg' : '')) : '';
    paintHeadInto(S.head, prog, S.aid);
    if (k && k !== 'head:bname') { var t = k === 'seg' ? S.head.querySelector('.dp-vseg .on') : S.head.querySelector('[data-k="' + cssEsc(k) + '"]'); if (t) t.focus({ preventScroll: true }); }
  }

  /* ---------- the body: the block strip, the rebuild tools, the days ---------- */
  function body(prog, aid, view) {
    S.aid = aid; S.prog = prog.id; S.view = view === 'progress' ? 'progress' : 'sessions';
    var root = E('div', { class: 'dp dk-bxv' + (S.view === 'progress' ? ' is-block' : '') });
    // The old editor's hooks still find it: ⌘Z, ← → 1–9 V, dkPbLive, dkPbAfterBulk, dkBxStep (desk.js dkBxFill, dkBxPick).
    root._o = { aid: aid, view: S.view, ro: false };
    root._fill = function () { fill(root); repaintHead(); };   // the desk's ← → 1–9 (dkBxPick) move the week: its tile too
    root._wp = { refresh: function () { fill(root); }, focusExercise: focusExercise };
    S.root = root;
    fill(root);
    return root;
  }
  function fill(root) {
    var prog = progOf(root._o.aid);
    var keep = focusKey();
    var sc = document.getElementById('programArea'), top = sc ? sc.scrollTop : 0;
    S.busy = true;
    try {
      root.innerHTML = '';
      if (!prog || !(prog.weeks || []).length) { root.appendChild(noWeeks(root._o.aid)); return; }
      // The week on show, and activeWeekIdx kept in step with it (anything that moves activeWeekIdx later is adopted).
      var wi = setWeek(prog, curWeek(prog));
      S.wi = wi;
      var env = envFor(prog, root._o.aid);
      root.appendChild(stripEl(prog, root._o.aid, wi, env));
      if (S.view === 'progress' && typeof dkPgView === 'function') {
        root.appendChild(dkPgView(root, prog, env.starts, wi, env.nowIdx, dkPbMeet(prog, root._o.aid)));
        return;
      }
      var m = model(prog.weeks, wi, env);
      root.appendChild(toolsEl(prog, root._o.aid, wi));
      root.appendChild(chipsEl(prog, wi, m));
      root.appendChild(weekEl(prog, root._o.aid, wi, m, env));
    } finally {
      S.busy = false;
      remember(prog);
    }
    if (sc) sc.scrollTop = Math.min(top, sc.scrollHeight);
    if (keep) restoreFocus(keep);
    if (S.pv) paintPreview();
    if (sc) { stuck(sc); spyDays(sc); }
  }
  // The state at the last paint: a save outside the editor's own undo is recorded from here (desk.js deskOnPersist).
  function remember(prog) { if (prog && typeof dkPbSnapLast === 'function') dkPbSnapLast(prog); }
  function noWeeks(aid) {
    var box = E('div', { class: 'dp-empty' });
    box.appendChild(E('p', {}, 'This block has no weeks yet.'));
    box.appendChild(dkBtn('Add the first week', { icon: IC.plus, cls: 'dp-tool', onClick: function () { addWeek(aid, false); } }));
    return box;
  }

  /* ---------- the block strip: a tile per week, the weeks to write up to the meet, the meet ---------- */
  var PHASE_WORD = { build: 'Build', heavy: 'Heavy', peak: 'Peak', deload: 'Deload' };
  function stripEl(prog, aid, wi, env) {
    var meet = typeof dkPbMeet === 'function' ? dkPbMeet(prog, aid) : null;
    var sm = stripModel(prog.weeks, { today: env.today, starts: env.starts, nowIdx: env.nowIdx, meet: meet, gap: meetGap(prog, aid) });
    var wrap = E('div', { class: 'dp-strip' });
    var tabs = E('div', { class: 'dp-strip-wks', role: 'tablist', 'aria-label': 'Weeks of ' + (prog.name || 'the block') });
    tabs.style.flexGrow = String(Math.max(1, sm.tiles.length));
    sm.tiles.forEach(function (t) { tabs.appendChild(tileEl(t, wi, prog, aid)); });
    tabs.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      var n = prog.weeks.length;
      S.keyPick = true;
      pickWeek(e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : Math.max(0, Math.min(n - 1, wi + (e.key === 'ArrowRight' ? 1 : -1))), true);
    });
    wrap.appendChild(tabs);
    var nx = (prog.weeks.length ? wn(prog, prog.weeks.length - 1) : 0) + 1;
    var add = E('button', { type: 'button', class: 'dp-tile-add', 'aria-label': 'Add week ' + nx, html: IC.plus });
    tip(add, 'Add week ' + nx + (draftsOn() ? ' as a draft' : '') + ': its days, nothing written yet');
    hold(add);
    add.addEventListener('click', function () { addWeek(aid, false); });
    wrap.appendChild(add);
    if (sm.gap) {
      var g = sm.gap, gb = E('button', { type: 'button', class: 'dp-tile dp-tile-gap' });
      gb.appendChild(E('span', { class: 'dp-tile-r1' }, E('b', { class: 'dp-tile-n' }, g.n === 1 ? 'Week ' + g.from : 'Weeks ' + g.from + '–' + g.to)));
      gb.appendChild(E('span', { class: 'dp-tile-r2' }, E('span', { class: 'dp-tile-gtx' }, g.n === 1 ? 'Not written' : g.n + ' not written'), E('span', { class: 'dp-tile-go' }, 'Write', E('span', { html: IC.next, 'aria-hidden': 'true' }))));
      gb.setAttribute('aria-label', (g.n === 1 ? 'Week ' + g.from : 'Weeks ' + g.from + ' to ' + g.to) + ', not written. Write ' + (g.n === 1 ? 'it' : 'them'));
      tip(gb, 'The weeks between the block’s end and ' + (meet ? meet.name : 'the meet') + '. Adds them to this block' + (draftsOn() ? ' as drafts' : '') + ' and writes the first from the week before');
      hold(gb);
      gb.addEventListener('click', function () { writeThem(aid, g.n); });
      wrap.appendChild(gb);
    }
    if (sm.meet) {
      var mt = E('div', { class: 'dp-tile dp-tile-meet', tabindex: '0', role: 'note' });
      mt.appendChild(E('span', { class: 'dp-tile-r1' }, E('span', { class: 'dp-tile-flag', html: IC.flag, 'aria-hidden': 'true' }), E('b', { class: 'dp-tile-n' }, sm.meet.name)));
      mt.appendChild(E('span', { class: 'dp-tile-r2' }, E('span', {}, fmtDay(sm.meet.date))));
      mt.setAttribute('aria-label', sm.meet.name + ', ' + fmtDay(sm.meet.date));
      tip(mt, sm.meet.name + ' · ' + fmtDay(sm.meet.date) + (daysTo(sm.meet.date) > 0 ? ' · in ' + daysTo(sm.meet.date) + ' days' : ''));
      wrap.appendChild(mt);
    }
    // The week on show stays in view in a long block.
    var ends = function () { var over = wrap.scrollWidth > wrap.clientWidth + 2; wrap.classList.toggle('more-r', over && wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 2); wrap.classList.toggle('more-l', over && wrap.scrollLeft > 2); };
    wrap.addEventListener('scroll', ends, { passive: true });
    requestAnimationFrame(function () {
      var sel = tabs.querySelector('.dp-tile.is-sel');
      if (sel && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, sel.offsetLeft - wrap.clientWidth / 2 + sel.offsetWidth / 2);
      ends();
    });
    return wrap;
  }
  function tileEl(t, wi, prog, aid) {
    var on = t.idx === wi;
    var pub = S.pub && S.pub.prog === prog.id && S.pub.wi === t.idx && Date.now() - S.pub.at < 4000;
    var b = E('button', { type: 'button', role: 'tab', class: 'dp-tile' + (on ? ' is-sel' : '') + (t.now ? ' is-now' : '') + (t.draft ? ' is-draft' : '') + (t.state === 'done' ? ' is-done' : '') + (!t.written ? ' is-write' : '') + (pub ? ' is-pub' : ''),
      'aria-selected': String(on), tabindex: on ? '0' : '-1', 'data-wi': String(t.idx) });
    var mark = pub ? E('span', { class: 'dp-tile-m is-live' }, E('i', { 'aria-hidden': 'true' }), 'Live')
      : t.draft ? E('span', { class: 'dp-tile-m is-draft' }, 'Draft')
      : t.now ? E('span', { class: 'dp-tile-m is-now' }, 'Now')
      : t.state === 'done' ? E('span', { class: 'dp-tile-ok', html: IC.check, 'aria-hidden': 'true' })
      : !t.written ? E('span', { class: 'dp-tile-m' }, 'To write') : null;
    var w = t.wOut != null ? E('span', { class: 'dp-tile-w' }, t.wOut === 0 ? 'Meet week' : 'W-' + t.wOut) : null;
    b.appendChild(E('span', { class: 'dp-tile-r1' }, E('b', { class: 'dp-tile-n' }, E('span', { class: 'dp-tile-nl' }, 'Week '), E('span', { class: 'dp-tile-ns', 'aria-hidden': 'true' }, 'W'), String(t.n)), mark, w));
    var r2 = E('span', { class: 'dp-tile-r2' });
    r2.appendChild(E('span', { class: 'dp-tile-date' }, t.start ? fmtMd(t.start) : plural(t.planned, 'session')));
    if (t.phase) r2.appendChild(E('span', { class: 'dp-tile-ph ph-' + t.phase }, PHASE_WORD[t.phase] || ''));
    if (t.effort.text) r2.appendChild(E('span', { class: 'dp-tile-eff' }, t.effort.text));
    b.appendChild(r2);
    // The week's sessions: one mark each, done filled, missed hatched, still to come an empty track.
    var bar = E('span', { class: 'dp-tile-bar', 'aria-hidden': 'true' });
    if (t.sessions.length) t.sessions.forEach(function (s) { bar.appendChild(E('i', { class: 'dp-sg t-' + s.state })); });
    else bar.appendChild(E('i', { class: 'dp-sg t-none' }));
    b.appendChild(bar);
    var missed = t.sessions.filter(function (s) { return s.state === 'missed'; }).length;
    var said = 'Week ' + t.n + (t.start ? ', ' + fmtRange(t.start, t.end) : '') + (t.now ? ', this week' : '') + (t.draft ? ', a draft' : '') +
      (!t.written ? ', nothing written' : ', ' + t.done + ' of ' + plural(t.planned, 'session') + ' done' + (missed ? ', ' + missed + ' missed' : '')) +
      (t.effort.text ? ', top sets average ' + t.effort.text + ' as written' : '') + (t.phase ? ', ' + (PHASE_WORD[t.phase] || '').toLowerCase() + ' week' : '') +
      (t.wOut != null ? (t.wOut === 0 ? ', meet week' : ', ' + plural(t.wOut, 'week') + ' to the meet') : '');
    b.setAttribute('aria-label', said);
    tip(b, said.replace(/^Week \d+, /, ''));
    hold(b);
    b.addEventListener('click', function (e) { if (on) return; S.keyPick = e.detail === 0; pickWeek(t.idx, true); });
    return b;
  }

  /* ---------- the rebuild tools: one quiet row under the strip; last week's suggestions as a chip at its end ---------- */
  function toolsEl(prog, aid, wi) {
    var bar = E('div', { class: 'dp-tools dp-rebuild', role: 'toolbar', 'aria-label': 'Week ' + wn(prog, wi) + ' tools' });
    var W = prog.weeks[wi], logged = weekSets(W).some(isLogged), lastWk = wi >= prog.weeks.length - 1, n0 = wn(prog, wi), n1 = n0 + 1;
    var whyCp = wi === 0 ? 'Week ' + n0 + ' is the first week: nothing before it to copy' : logged ? 'Week ' + n0 + ' has sets logged: ' + (lastWk ? 'add week ' + n1 + ' with + and copy it there' : 'copy it to week ' + n1 + ' instead') : '';
    var whyPg = wi === 0 ? 'Week ' + n0 + ' is the first week: nothing before it to progress from' : logged ? 'Week ' + n0 + ' has sets logged: ' + (lastWk ? 'add week ' + n1 + ' with + and progress into it' : 'progress it into week ' + n1 + ' instead') : '';
    var cp = toolBtn({ label: 'Copy last week', short: 'Copy', icon: IC.copy, tip: 'Week ' + wn(prog, Math.max(0, wi - 1)) + ' into week ' + n0 + (draftsOn() ? ' as a draft' : '') }, function () { copyLastWeek(aid, wi); });
    if (whyCp) offTool(cp, whyCp);
    bar.appendChild(cp);
    var pg = toolBtn({ label: 'Progress the week', short: 'Progress', icon: IC.up, menu: true, tip: 'Week ' + wn(prog, Math.max(0, wi - 1)) + ' a step on, into week ' + n0 + ': you see the changes before they’re written' }, function (b) {
      var items = [{ node: E('div', { class: 'dk-menu-title', role: 'presentation' }, 'Week ' + wn(prog, wi - 1) + ' a step on, into week ' + n0) }].concat((typeof dkPbKinds === 'function' ? dkPbKinds() : []).map(function (k) {
        return { label: k[1], hint: k[2], run: function () { setTimeout(function () { var live = (S.root && S.root.querySelector('.dp-rebuild .dp-tool[aria-label="Progress the week"]')) || b; openProgressPreview(live, aid, wi, k[0], k[1]); }, 0); } };
      }));
      dkPopMenu(b, items);
    });
    if (whyPg) offTool(pg, whyPg);
    bar.appendChild(pg);
    bar.appendChild(toolBtn({ label: 'Templates', icon: IC.layers, menu: true, tip: 'Save this block as a template, or start from one' }, function (b) {
      var p = progOf(aid), items = [{ label: 'Save as a template…', run: function () { openSaveTemplate(p); } }];
      var me = typeof _dkCoachMeId === 'function' ? _dkCoachMeId() : null;
      if ((Store.get().programTemplates || []).some(function (t) { return t.coachId === me; })) items.push({ label: 'Start from a template…', run: function () { dkAssignTemplate([aid], b); } });
      items.push({ label: 'Replace with an imported block…', run: function () { openSheetImport(aid); } });
      dkPopMenu(b, items);
    }));
    var clearable = (W.days || []).some(function (d) { return (d.exercises || []).some(function (e) { return !(e.sets || []).some(isLogged); }); });
    var cl = toolBtn({ label: 'Clear', icon: IC.clear, tip: 'Clears week ' + n0 + '’s exercises to write it again. What was lifted stays; ' + undoKey() + ' brings it back' }, function () { clearWeek(aid, wi); });
    if (!clearable) offTool(cl, logged ? 'Everything in week ' + n0 + ' was lifted: it stays' : 'Nothing written in week ' + n0 + ' to clear');
    bar.appendChild(cl);
    bar.appendChild(E('span', { class: 'dp-tools-sep', 'aria-hidden': 'true' }));
    var u = toolBtn({ label: 'Undo', icon: IC.undo, iconOnly: true, cls: 'dp-undo', kbd: undoKey() }, function () { dkPbUndo(); });
    var r = toolBtn({ label: 'Redo', icon: IC.redo, iconOnly: true, cls: 'dp-redo', kbd: mac() ? '⇧⌘Z' : 'Ctrl ⇧Z' }, function () { if (typeof dkPbRedo === 'function') dkPbRedo(); });
    bar.appendChild(u);
    bar.appendChild(r);
    setTimeout(function () { if (typeof dkPbPaintUndo === 'function') dkPbPaintUndo(); }, 0);
    bar.appendChild(E('span', { class: 'dp-tools-gap' }));
    var sug = pendingSuggestions(prog);
    if (sug && !(S.sugOff && S.sugOff[prog.id + ':' + sug.wi])) {
      var here = sug.wi === wi;
      var chip = E('button', { type: 'button', class: 'dp-sugchip', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
      chip.insertAdjacentHTML('beforeend', IC.spark);
      chip.appendChild(E('span', {}, plural(sug.rows.length, 'suggestion') + (here ? ' from week ' + wn(prog, Math.max(0, sug.last)) : ' for week ' + wn(prog, sug.wi))));
      tip(chip, 'From how week ' + wn(prog, Math.max(0, sug.last)) + ' was lifted: take them one by one, or all');
      hold(chip);
      chip.addEventListener('click', function (e) { e.stopPropagation(); if (!commitOpen()) return; openSugPop(chip, aid); });
      bar.appendChild(chip);
    }
    return bar;
  }

  /* ---------- the week's days at a glance: a chip per day that stays in view and jumps to its card ---------- */
  var STATUS_WORD = { done: 'Done', part: 'Part done', live: 'Lifting now', today: 'Today', missed: 'Missed', planned: 'Planned', rest: 'Rest', empty: 'Nothing written' };
  function shortDay(name, i) { var s = String(name || '').replace(/\s+day$/i, '').trim(); return s || 'Day ' + (i + 1); }
  function chipsEl(prog, wi, m) {
    var nav = E('nav', { class: 'dp-dchips', 'aria-label': 'Week ' + wn(prog, wi) + ', day by day' });
    m.days.forEach(function (d) {
      var s = d.sum;
      var b = E('button', { type: 'button', class: 'dp-dchip t-' + s.status, 'data-di': String(d.idx) });
      if (s.date) b.appendChild(E('span', { class: 'dp-dchip-wd' }, fmtWd(s.date)));
      if (s.liftsIn.length) { var dots = E('span', { class: 'dp-dchip-dots', 'aria-hidden': 'true' }); s.liftsIn.forEach(function (L) { dots.appendChild(E('i', { class: 'dp-ldot lift-' + L })); }); b.appendChild(dots); }
      b.appendChild(E('span', { class: 'dp-dchip-n' }, shortDay(d.name, d.idx)));
      if (s.status === 'done') b.insertAdjacentHTML('beforeend', '<span class="dp-dchip-ok" aria-hidden="true">' + IC.check + '</span>');
      else if (s.status === 'today' || s.status === 'live' || s.status === 'missed') b.appendChild(E('span', { class: 'dp-dchip-s' }, s.status === 'live' ? 'Now' : STATUS_WORD[s.status]));
      b.setAttribute('aria-label', (d.name || 'Day ' + (d.idx + 1)) + ', ' + STATUS_WORD[s.status].toLowerCase() + (s.date ? ', ' + fmtDay(s.date) : ''));
      hold(b);
      b.addEventListener('click', function () { jumpTo(d.idx); });
      nav.appendChild(b);
    });
    return nav;
  }
  function stickyTop(sc) {
    var h = sc.querySelector('.dp-head.is-pb'), c = S.root && S.root.querySelector('.dp-dchips');
    return (h ? Math.max(0, h.offsetHeight - 16) : 0) + (c ? c.offsetHeight : 0);
  }
  function jumpTo(di) {
    var sc = document.getElementById('programArea'), card = S.root && S.root.querySelector('.dp-day[data-di="' + di + '"]');
    if (!sc || !card || !commitOpen()) return;
    var y = sc.scrollTop + card.getBoundingClientRect().top - sc.getBoundingClientRect().top - stickyTop(sc) - 12;
    sc.scrollTo({ top: Math.max(0, y), behavior: reduced() ? 'auto' : 'smooth' });
    var nm = card.querySelector('.dp-day-name, .dp-day-title');
    if (nm && nm.focus) nm.focus({ preventScroll: true });
  }
  // The chip of the day at the top of the view.
  function spyDays(sc) {
    var chips = S.root && S.root.isConnected ? S.root.querySelectorAll('.dp-dchip') : [];
    if (!chips.length) return;
    var line = sc.getBoundingClientRect().top + stickyTop(sc) + 24, at = -1;
    S.root.querySelectorAll('.dp-day').forEach(function (c) { if (c.getBoundingClientRect().top <= line) at = Number(c.getAttribute('data-di')); });
    if (sc.scrollTop < 8) at = -1;
    chips.forEach(function (c) { var on = Number(c.getAttribute('data-di')) === at; c.classList.toggle('is-at', on); if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current'); });
  }
  /* ---------- the week: one card per day ---------- */
  function weekEl(prog, aid, wi, m, env) {
    var lifted = !!(m.week && m.week.lifted), prevCol = !lifted && !!(m.week && m.week.prevLifted) ? 'Week ' + wn(prog, wi - 1) + ' lifted' : '';
    var wrap = E('div', { class: 'dp-week' + (lifted || prevCol ? ' has-lifted' : '') + (prevCol ? ' has-prev' : '') + (isDraft(prog.weeks[wi]) ? ' is-draft' : ''), 'data-wi': String(wi) });
    if (m.week && m.week.empty) {
      var src = writeSource(prog.weeks, wi);
      wrap.appendChild(E('p', { class: 'dp-note-line' }, src >= 0 ? 'Nothing written for week ' + m.week.n + ' yet. Write week ' + m.week.n + ' copies week ' + wn(prog, src) + (draftsOn() ? ' as a draft' : '') + ', or add exercises to the days below.' : 'Nothing written for week ' + m.week.n + ' yet. Add exercises to the days below, or start from a template.'));
    }
    var days = E('div', { class: 'dp-days' });
    m.days.forEach(function (d) { d.weekN = wn(prog, wi); days.appendChild(dayEl(prog, aid, wi, d, env, lifted ? 'Lifted' : prevCol)); });
    wrap.appendChild(days);
    var add = E('div', { class: 'dp-adddays' });
    add.appendChild(dkBtn('Training day', { icon: IC.plus, cls: 'is-quiet dp-tool', onClick: function () { if (!commitOpen()) return; dkPbRemember(progOf(aid), 'Add a day'); addDay(wi); } }));
    // Critical fix #1: the rest-day button (addRestDay → "Rest", read by the isRestDay heuristic).
    add.appendChild(dkBtn('Rest day', { icon: IC.plus, cls: 'is-quiet dp-tool', onClick: function () { if (!commitOpen()) return; dkPbRemember(progOf(aid), 'Add a rest day'); addRestDay(wi); } }));
    wrap.appendChild(add);
    return wrap;
  }
  // The day's status as a badge: a mark in its colour and the word in ink (the desk's one badge style).
  function badgeEl(s) {
    var b = E('span', { class: 'dp-badge t-' + s.status });
    if (s.status === 'done') b.insertAdjacentHTML('beforeend', '<span class="dp-badge-ok" aria-hidden="true">' + IC.check + '</span>');
    else if (s.status !== 'rest' && s.status !== 'empty') b.appendChild(E('i', { class: 'dp-badge-dot', 'aria-hidden': 'true' }));
    b.appendChild(document.createTextNode(s.status === 'part' ? s.done + ' of ' + s.total + ' sets' : STATUS_WORD[s.status]));
    return b;
  }
  // "2 lifts · 7 sets · ≈ 45 min": the length as written, amber past the time the lifter said they have.
  function sumEl(s, aid) {
    var w = E('span', { class: 'dp-day-sum' }, plural(s.lifts, 'lift') + ' · ' + plural(s.sets, 'set'));
    if (s.minutes) {
      var has = aid ? intakeMinutes(aid) : 0, over = has && s.minutes > has + 10;
      var mn = E('span', { class: 'dp-day-min' + (over ? ' is-over' : '') }, '≈ ' + s.minutes + ' min');
      tip(mn, 'About ' + s.minutes + ' min as written: 15 to warm up, about 5 a heavy set, 4 a main-lift set, 2½ an accessory set' + (over ? '. Over the ' + has + ' min ' + first((athleteOf(aid) || {}).name) + ' said a session can take' : ''));
      w.appendChild(E('span', { class: 'dp-day-sep' }, ' · '));   // its own span: a narrow editor hides it with the minutes
      w.appendChild(mn);
    }
    return w;
  }
  function dayEl(prog, aid, wi, d, env, lifted) {
    var D = prog.weeks[wi].days[d.idx], s = d.sum;
    var card = E('article', { class: 'dp-day t-' + s.status + (d.rest ? ' is-rest' : ''), 'data-di': String(d.idx), 'data-day': d.key, 'aria-label': d.name || 'Day ' + (d.idx + 1) });
    var hd = E('header', { class: 'dp-day-head' });
    var idw = E('div', { class: 'dp-day-id' });
    var nm = E('input', { type: 'text', class: 'dp-day-name', 'aria-label': 'Day name', spellcheck: 'false', maxlength: '60', 'data-k': wi + ':day:' + d.key });
    nm.value = d.name; nm.placeholder = 'Day ' + (d.idx + 1);
    // Compared with the Store's name now, never the one drawn (a rename and back again both save).
    var storeName = function () { var p = progOf(aid), dd = p && p.weeks[wi] && p.weeks[wi].days[d.idx]; return dd && String(dd.id) === String(D.id) ? dd.name || '' : null; };
    var saveName = function () {
      var cur = storeName(), v = nm.value.trim();
      if (cur == null || v === cur) return true;
      var r = run({ t: 'renameDay', wi: wi, di: d.idx, dayId: D.id, name: v, label: 'Rename ' + (cur || 'the day') }, { scope: isRest(Object.assign({}, D, { name: v })) !== isRest(D) ? 'all' : 'head' });
      card.setAttribute('aria-label', v || 'Day ' + (d.idx + 1));
      return !!(r && r.ok);
    };
    nm._commit = saveName;
    nm.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') { var c0 = storeName(); nm.value = c0 == null ? d.name : c0; } nm.blur(); } });
    nm.addEventListener('change', function () { if (nm.isConnected) saveName(); });
    idw.appendChild(nm);
    idw.appendChild(badgeEl(s));
    if (s.date) { var dt = E('span', { class: 'dp-day-date' }, fmtDay(s.date)); tip(dt, s.dateKind === 'done' ? 'The day it was lifted' : 'The day ' + first((athleteOf(aid) || {}).name) + ' pinned it to'); idw.appendChild(dt); }
    hd.appendChild(idw);
    if (!d.rest && s.sets) hd.appendChild(sumEl(s, aid));
    var more = E('button', { type: 'button', class: 'dp-day-more', 'aria-label': (d.name || 'Day') + ' options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: IC.more });
    tip(more, 'Duplicate, move, rest day, clear');
    hold(more);
    more.addEventListener('click', function (e) { e.stopPropagation(); if (commitOpen()) dkPopMenu(more, dayMenu(aid, wi, d.idx), { alignRight: true }); });
    hd.appendChild(more);
    card.appendChild(hd);
    if (d.rest) {
      var rb = E('div', { class: 'dp-restrow' });
      rb.appendChild(E('p', { class: 'dp-rest' }, 'No training. Recovery is part of the plan.'));
      rb.appendChild(dkBtn('Make it a training day', { cls: 'is-quiet dp-tool', onClick: function () { if (!commitOpen()) return; run({ t: 'renameDay', wi: wi, di: d.idx, dayId: D.id, name: 'Day ' + (d.idx + 1), label: 'Make it a training day' }, { scope: 'all', want: wi + ':day:' + d.key }); } }));
      card.appendChild(rb);
      return card;
    }
    if (d.exercises.length) card.appendChild(colsEl(lifted));
    d.exercises.forEach(function (x) { card.appendChild(exEl(prog, aid, wi, d, x, env)); });
    card.appendChild(addExBtn({ aid: aid, wi: wi, di: d.idx, dayId: D.id, dayName: d.name || 'Day ' + (d.idx + 1), dayKey: d.key }));
    return card;
  }
  // The columns' names, once at the top of the day (the lines under every exercise sit on this grid).
  function colsEl(lifted) {
    var c = E('div', { class: 'dp-cols', 'aria-hidden': 'true' });
    ['', 'Sets × reps', 'Load', 'Effort', 'Notes', typeof lifted === 'string' ? lifted : lifted ? 'Lifted' : ''].forEach(function (t, i) { c.appendChild(E('span', { class: 'dp-col dp-col-' + i }, t)); });
    return c;
  }
  function dayMenu(aid, wi, di) {
    var prog = progOf(aid), W = prog.weeks[wi], D = W.days[di], items = [];
    var lg = (D.exercises || []).some(function (e) { return (e.sets || []).some(isLogged); });
    var rest = isRest(D), base = { wi: wi, di: di, dayId: D.id };
    items.push({ label: 'Duplicate', run: function () { run(Object.assign({ t: 'dupDay', label: 'Duplicate ' + (D.name || 'the day') }, base), { scope: 'all' }); } });
    if (di > 0) items.push({ label: 'Move up', run: function () { run(Object.assign({ t: 'moveDay', dir: -1, label: 'Move ' + (D.name || 'the day') }, base), { scope: 'all' }); } });
    if (di < W.days.length - 1) items.push({ label: 'Move down', run: function () { run(Object.assign({ t: 'moveDay', dir: 1, label: 'Move ' + (D.name || 'the day') }, base), { scope: 'all' }); } });
    if (!rest && !(D.exercises || []).length) items.push({ label: 'Make it a rest day', run: function () { run(Object.assign({ t: 'renameDay', name: 'Rest', label: 'Make it a rest day' }, base), { scope: 'all' }); } });
    if (rest) items.push({ label: 'Make it a training day', run: function () { run(Object.assign({ t: 'renameDay', name: 'Day ' + (di + 1), label: 'Make it a training day' }, base), { scope: 'all' }); } });
    if (!rest && (D.exercises || []).some(function (e) { return !(e.sets || []).some(isLogged); })) items.push({ label: 'Clear', hint: lg ? 'Lifted stays' : '', run: function () {
      var r = run(Object.assign({ t: 'clearDay', label: 'Clear ' + (D.name || 'the day') }, base), { scope: 'all' });
      if (r && r.ok) say((D.name || 'The day') + ' cleared' + (lg ? ': what was lifted stays' : '') + '. ' + undoKey() + ' brings it back');
    } });
    if (!rest) items.push({ label: 'Add an exercise with the form…', run: function () { dkPbRemember(progOf(aid), 'Add an exercise'); openAddExercise(wi, di); } });
    items.push('-', { label: 'Remove this day', danger: true, run: function () {
      if (lg && !confirm('This day has logged sets. Remove it anyway? Undo brings it back.')) return;
      run(Object.assign({ t: 'removeDay', label: 'Remove ' + (D.name || 'the day') }, base), { scope: 'all' });
      say((D.name || 'Day') + ' removed. ' + undoKey() + ' brings it back');
    } });
    return items;
  }

  /* ---------- an exercise: its title row, its lines on the day's grid, + Set, the cue ---------- */
  function liftTile(x) {
    var g = x.main ? LIFT_GLYPH[x.lift] : null;
    var t = E('span', { class: 'dp-lt lift-' + (x.main ? x.lift : 'acc'), 'aria-hidden': 'true' });
    if (g) t.textContent = g; else t.innerHTML = IC[x.lift] || IC.other;
    return t;
  }
  // o.team: { T, W } on the Teams screen (its own edit path: wireTeam, teamRun); else the lifter's program.
  function exEl(prog, aid, wi, d, x, env, o) {
    o = o || {};
    var team = o.team || null;
    var blk = E('div', { class: 'dp-ex lift-' + (x.main ? x.lift : 'acc') + (x.lock ? ' is-lock' : '') + (x.lines.length ? '' : ' is-new'), 'data-ex': x.key, role: 'group', 'aria-label': x.full || x.title });
    if (!team) blk.setAttribute('data-cell', x.cell);
    var hd = E('div', { class: 'dp-ex-head' });
    hd.appendChild(liftTile(x));
    var nm = E('span', { class: 'dp-exn' }, x.name || x.title);
    if (x.full && x.full !== x.title) tip(nm, x.full);
    hd.appendChild(nm);
    if (x.tag) hd.appendChild(E('span', { class: 'dp-vtag' }, x.tag));
    if (x.swap) hd.appendChild(E('span', { class: 'dp-swap' }, x.swap));
    if (x.maxKg > 0) {
      var mx = E('span', { class: 'dp-exmax' }, 'max ' + Math.round(typeof kgToDisplay === 'function' ? kgToDisplay(x.maxKg) : x.maxKg) + ' ' + (env.unit || 'kg'));
      tip(mx, 'The ' + String(x.name || '').toLowerCase() + ' max this block’s % loads and estimates come from');
      hd.appendChild(mx);
    } else hd.appendChild(E('span', { class: 'dp-exmax' }));
    var more = E('button', { type: 'button', class: 'dp-more', tabindex: '-1', 'aria-label': (x.title || 'Exercise') + ' options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: IC.more });
    tip(more, 'Variant, move, duplicate, remove');
    more.addEventListener('mousedown', function (e) { e.preventDefault(); });
    more.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!commitOpen()) return;
      var focused = document.activeElement && blk.contains(document.activeElement) ? document.activeElement.closest('.dp-line') : null;
      dkPopMenu(more, team ? teamExMenu(team.T, team.W, wi, d, x) : exMenu(aid, wi, d.idx, x.key, focused ? focused.getAttribute('data-line') : null, more), { alignRight: true });
    });
    hd.appendChild(more);
    if (!team) {
      var grip = E('button', { type: 'button', class: 'dp-grip', tabindex: '-1', 'aria-label': 'Drag ' + (x.title || 'the exercise') + ' to move it', html: IC.grip });
      tip(grip, x.lock ? 'Lifted: it stays on the day it was lifted' : 'Drag to move it, here or to another day. ⋯ › Move to day from the keys');
      grip.addEventListener('pointerdown', function (e) { gripDown(e, aid, wi, d.idx, x.key); });
      hd.appendChild(grip);
    }
    blk.appendChild(hd);
    var wire = team ? function (inp, ln) { wireTeam(inp, team.T, team.W, wi, d, x, ln); } : function (inp, ln) { wireLine(inp, aid, wi, d, x, ln); };
    var kp = team ? 't' + wi : String(wi);
    if (!x.lines.length) {
      var rw = E('div', { class: 'dp-line is-write' });
      var w = E('div', { class: 'dp-c-write' });
      var inp = E('input', { type: 'text', class: 'dp-cell dp-wline', spellcheck: 'false', autocomplete: 'off', placeholder: team ? 'Write the sets, like 3x5 75% @8' : 'Write the sets, like 3x5 @8 or 1x3 180, 3x5 75%', 'aria-label': (x.title || 'Exercise') + ': its sets', 'data-k': kp + ':' + x.key + '::w', 'data-col': 'w', 'data-ex': x.key, 'data-gi': '0' });
      w.appendChild(inp);
      rw.appendChild(w);
      blk.appendChild(rw);
      wire(inp, null);
    } else x.lines.forEach(function (ln, li) { blk.appendChild(lineEl(x, ln, li, d, wi, env, wire, kp, !!team, o)); });
    if (!x.lock) {
      var foot = E('div', { class: 'dp-ex-foot' });
      var as = E('button', { type: 'button', class: 'dp-addset', tabindex: '-1' });
      as.insertAdjacentHTML('beforeend', IC.plus);
      as.appendChild(E('span', {}, 'Set'));
      as.setAttribute('aria-label', 'Add a set to ' + (x.title || 'the exercise'));
      tip(as, 'One more set like the last one. Enter in the last notes starts a new line below');
      hold(as);
      as.addEventListener('click', function () {
        if (!commitOpen()) return;
        var op = { t: 'addSet', wi: wi, di: d.idx, ei: x.idx, exId: x.key, label: 'Add a set to ' + x.title };
        if (team) teamRun(team.T, op, null, 'last:' + x.key); else run(op, { scope: 'ex', ex: x.key, focus: 'last' });
      });
      foot.appendChild(as);
      if (!team && !x.note && !x.athleteNote) {
        var ac = E('button', { type: 'button', class: 'dp-addset dp-addcue', tabindex: '-1' });
        ac.insertAdjacentHTML('beforeend', IC.plus);
        ac.appendChild(E('span', {}, 'Cue'));
        ac.setAttribute('aria-label', 'Add a cue to ' + (x.title || 'the exercise'));
        tip(ac, 'One line ' + first((athleteOf(aid) || {}).name) + ' reads with the exercise, like Drive hard out of the hole');
        hold(ac);
        ac.addEventListener('click', function () { if (commitOpen()) editNote(aid, wi, d.idx, x.idx); });
        foot.appendChild(ac);
      }
      blk.appendChild(foot);
    }
    if (!team && (x.note || x.athleteNote)) blk.appendChild(cueEl(aid, wi, d, x));
    return blk;
  }
  function roleWord(role, n) { return role === 'top set' ? 'Top set' : role === 'back-off' ? 'Back-off' : role === 'single' ? 'Single' : 'Sets'; }
  // What the load cell shows at rest, and what it holds while typed in.
  function loadView(L, g, env) {
    var u = env.unit || 'kg';
    if (L.kind === 'pct') {
      var pTxt = rangeText(num(g.pct), g.pctHi, n2) + '%';
      var kgPart = L.text.indexOf(' · ') > 0 ? L.text.split(' · ')[1] : '';
      if (kgPart) return { rest: kgPart + ' ' + u, tag: pTxt, tagCls: 'is-pct', edit: L.edit };
      return { rest: pTxt, tag: L.noMax ? 'no max' : '', tagCls: L.noMax ? 'is-warn' : '', edit: L.edit };
    }
    if (L.kind === 'kg') return { rest: L.text, tag: '', edit: L.edit };
    if (L.kind === 'rpe') return L.est ? { rest: '~' + (env.show || n2)(L.est) + ' ' + u, tag: 'est.', tagCls: 'is-est', edit: '', ph: '~' + (env.show || n2)(L.est) } : { rest: '', tag: '', edit: '', ph: env.team ? 'By RPE' : 'By feel' };
    return { rest: '', tag: '', edit: '', ph: 'Load' };
  }
  // A set field as the notes cell says it at rest: "3-1-0", "2s pause", "light bands", "Belt on".
  function fieldTags(g) {
    var f = typeof setFieldsOf === 'function' ? setFieldsOf(g) : {}, out = [];
    if (f.tempo) out.push(/^[\dX](-[\dX]){2,3}$/i.test(f.tempo) ? 'Tempo ' + f.tempo : f.tempo);
    if (f.pause || f.pauseAt) out.push((f.pause ? n2(f.pause) + 's ' : '') + (f.pauseAt ? f.pauseAt + ' ' : '') + 'pause');
    if (f.acc === 'chains') out.push('Chains' + (f.accKg && typeof formatWeight === 'function' ? ' ' + formatWeight(f.accKg) : ''));
    else if (f.acc === 'bands') out.push((f.accTxt ? f.accTxt + ' ' : '') + 'bands');
    if (f.cx) Object.keys(f.cx).forEach(function (k) { out.push(k + ' ' + f.cx[k]); });
    return out;
  }
  function lineEl(x, ln, li, d, wi, env, wire, kp, team, o) {
    var row = E('div', { class: 'dp-line' + (ln.lock ? ' is-lock' : '') + (li === x.lines.length - 1 ? ' is-last' : ''), 'data-line': ln.key });
    row.appendChild(E('div', { class: 'dp-c-role' }, roleWord(ln.role, x.lines.length)));
    var base = function (col, label) { return { key: kp + ':' + x.key + ':' + ln.sid + ':' + col, label: x.title + (ln.role ? ', ' + ln.role : '') + ', ' + label + ', ' + (team ? 'the team’s week ' : 'week ') + d.weekN, x: x, ln: ln, lock: ln.lock }; };
    var sr = E('div', { class: 'dp-c-sr' });
    var cn = cellIn('n', ln.sets, base('n', 'sets'));
    sr.appendChild(cn);
    sr.appendChild(E('span', { class: 'dp-x', 'aria-hidden': 'true' }, '×'));
    var cr = cellIn('r', ln.reps, base('r', 'reps'));
    sr.appendChild(cr);
    row.appendChild(sr);
    wire(cn, ln); wire(cr, ln);
    var lv = loadView(ln.load, ln.g, Object.assign({}, env, { team: team }));
    var lc = E('div', { class: 'dp-c-load' + (lv.tag ? ' has-tag' : '') });
    var cl = cellIn('l', lv.rest, Object.assign(base('l', 'load'), { edit: lv.edit, ph: lv.ph, cls: ln.load.kind === 'pct' ? ' is-pct' : ln.load.est ? ' is-est' : '' }));
    lc.appendChild(cl);
    if (lv.tag) lc.appendChild(E('span', { class: 'dp-tag ' + (lv.tagCls || ''), 'aria-hidden': 'true' }, lv.tag));
    if (!team) {
      if (ln.load.noMax) tip(lc, 'No ' + String(x.lift) + ' max yet: set one in the maxes above');
      else if (ln.load.est) tip(lc, 'About ' + showKg(ln.load.est) + ' ' + env.unit + ' from their max for ' + ln.reps + ' ' + ln.effort.text + '. Type a load to write one');
      else if (!ln.lock) tip(lc, 'Type a load: 160, a range 140-145, or a % like 75%');
    }
    row.appendChild(lc);
    wire(cl, ln);
    var ec = E('div', { class: 'dp-c-eff' });
    var top = topRpe(ln.g);
    var ce = cellIn('e', ln.effort.text, Object.assign(base('e', 'effort'), { edit: ln.effort.edit, ph: 'RPE' }));
    if (top != null && typeof rpeColor === 'function') ce.style.setProperty('--rc', rpeColor(top));
    if (top != null) ce.classList.add('has-rc');
    ec.appendChild(ce);
    if (!ln.lock) tip(ec, 'RPE like @8 or @7-8, or reps in reserve: 2 RIR. ↑ ↓ move it by half a step');
    row.appendChild(ec);
    wire(ce, ln);
    var tags = fieldTags(ln.g);
    var fc = E('div', { class: 'dp-c-f' + (tags.length ? ' has-tags' : ' is-empty') });
    var cf = cellIn('f', ln.fields.edit, Object.assign(base('f', 'notes'), { edit: ln.fields.edit, ph: li === 0 ? 'Tempo, pause, bands' : '' }));
    fc.appendChild(cf);
    if (tags.length) { var tg = E('span', { class: 'dp-ftags', 'aria-hidden': 'true' }); tags.forEach(function (t) { tg.appendChild(E('span', { class: 'dp-ftag' }, t)); }); fc.appendChild(tg); if (tags.join(' ').length > 18) tip(fc, tags.join(' · ')); }
    row.appendChild(fc);
    wire(cf, ln);
    row.appendChild(team ? E('div', { class: 'dp-c-lift' }) : ln.lifted || !ln.prev ? liftedEl(ln, li === x.lines.length - 1 ? x.extras : 0) : prevEl(ln.prev, d.weekN - 1));
    var canRm = x.lines.length > 1 && (team || !ln.lock);
    var rm = E('button', { type: 'button', class: 'dp-rmline', tabindex: '-1', 'aria-label': 'Remove these sets: ' + roleWord(ln.role) + ', ' + ln.sets + ' × ' + ln.reps, html: IC.x });
    if (canRm) {
      tip(rm, 'Remove these sets');
      rm.addEventListener('mousedown', function (e) { e.preventDefault(); });
      rm.addEventListener('click', function () {
        if (!commitOpen()) return;
        var op = { t: 'removeGroup', wi: wi, di: d.idx, ei: x.idx, exId: x.key, start: ln.start, sid: ln.sid, label: 'Remove a line of ' + x.title };
        if (team) teamRun(o.team.T, op); else run(op, { scope: 'ex', ex: x.key });
      });
    } else rm.setAttribute('hidden', '');
    row.appendChild(rm);
    if (!team && ln.lock) tip(row, x.swapped ? x.swap + ' that day: what you wrote stays as it was' : 'Lifted: what they did stays as it was');
    return row;
  }
  function cellIn(col, text, o) {
    var inp = E('input', { type: 'text', class: 'dp-cell dp-' + col + (o.cls || ''), spellcheck: 'false', autocomplete: 'off', inputmode: col === 'n' || col === 'r' ? 'numeric' : 'text',
      'aria-label': o.label, 'data-k': o.key, 'data-col': col, 'data-ex': o.x.key, 'data-gi': String(o.ln ? o.ln.idx : 0) });
    inp.value = text || '';
    if (o.ph) inp.placeholder = o.ph;
    inp._rest = text || '';
    inp._edit = o.edit != null ? o.edit : (text || '');
    if (o.lock) { inp.readOnly = true; inp.setAttribute('aria-readonly', 'true'); }
    selectOnFocus(inp);
    return inp;
  }
  // What they lifted on a line: the top set and a dot (green on the RPE written, amber harder, a point over in the
  // roster's coral, grey easier); "Missed" in muted ink.
  function liftedEl(ln, extras) {
    var c = E('div', { class: 'dp-c-lift' });
    var L = ln.lifted, tone = liftedTone(L);
    if (L) {
      var t = E('span', { class: 'dp-lifted t-' + tone });
      if (tone !== 'missed') t.appendChild(E('i', { class: 'dp-gap t-' + tone, 'aria-hidden': 'true' }));
      t.appendChild(document.createTextNode(L.text));
      var g = L.gapN;
      if (g != null && Math.abs(g) >= 0.5) t.appendChild(E('span', { class: 'dk-nil' }, ', ' + (g > 0 ? n2(g) + ' RPE over' : n2(Math.abs(g)) + ' RPE under') + ' what you wrote'));
      tip(c, tone === 'missed' ? L.text : g != null && Math.abs(g) >= 0.5 ? 'Their top set ' + (g > 0 ? '+' + n2(g) + ' RPE over' : '−' + n2(Math.abs(g)) + ' RPE under') + ' what you wrote' : g != null ? 'Lifted on the RPE you wrote' : 'Lifted');
      c.appendChild(t);
    }
    if (extras) c.appendChild(E('span', { class: 'dp-extra' }, (L ? ' · ' : '') + '+' + extras + ' extra'));
    return c;
  }
  // Last week's on a week nothing's been lifted in yet: the same line, muted, its dot (how hard it went) kept.
  function prevEl(L, n) {
    var c = E('div', { class: 'dp-c-lift is-prev' }), tone = liftedTone(L);
    var t = E('span', { class: 'dp-lifted t-' + tone });
    if (tone !== 'missed') t.appendChild(E('i', { class: 'dp-gap t-' + tone, 'aria-hidden': 'true' }));
    t.appendChild(document.createTextNode(L.text));
    t.appendChild(E('span', { class: 'dk-nil' }, ', lifted in week ' + n + (L.gapN != null && Math.abs(L.gapN) >= 0.5 ? ', ' + (L.gapN > 0 ? n2(L.gapN) + ' RPE over' : n2(Math.abs(L.gapN)) + ' RPE under') + ' what was written' : '')));
    tip(c, 'Week ' + n + ', the same line: ' + L.text + (L.gapN != null && Math.abs(L.gapN) >= 0.5 ? ' (' + (L.gapN > 0 ? '+' : '−') + n2(Math.abs(L.gapN)) + ' RPE on what was written)' : ''));
    c.appendChild(t);
    return c;
  }
  // The cue: one line under the exercise, typed in place; their note from the day beside it.
  function cueEl(aid, wi, d, x) {
    var row = E('div', { class: 'dp-cue' });
    row.appendChild(E('span', { class: 'dp-cue-k' }, 'Cue'));
    if (x.note || !x.athleteNote) {
      var inp = E('input', { type: 'text', class: 'dp-note', maxlength: '300', spellcheck: 'true', placeholder: 'One line for ' + first((athleteOf(aid) || {}).name) + ', like Drive hard out of the hole', 'aria-label': 'Cue for ' + x.title, 'data-k': wi + ':' + x.key + '::note' });
      inp.value = x.note;
      var orig = x.note;
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = orig; inp.blur(); } });
      var saveNote = function () {
        if (S.busy || !inp.isConnected) return true;
        var v = inp.value.trim();
        if (v === orig) return true;
        orig = v;
        run({ t: 'note', wi: wi, di: d.idx, ei: x.idx, exId: x.key, text: v, label: 'Cue on ' + x.title }, { scope: 'ex', ex: x.key });
        return true;
      };
      inp._commit = saveNote;
      inp.addEventListener('blur', saveNote);
      row.appendChild(inp);
    }
    if (x.athleteNote) { var an = E('span', { class: 'dp-an' }, '“' + x.athleteNote + '”'); tip(an, 'Their note from the day'); row.appendChild(an); }
    return row;
  }
  function editNote(aid, wi, di, ei) {
    var prog = progOf(aid), ex = prog.weeks[wi].days[di].exercises[ei];
    var blk = S.root && S.root.querySelector('.dp-ex[data-ex="' + cssEsc(String(ex.id)) + '"]');
    if (!blk) return;
    var n = blk.querySelector('input.dp-note');
    if (!n) {
      var x = model(prog.weeks, wi, envFor(prog, aid)).days[di].exercises[ei];
      var cue = cueEl(aid, wi, { idx: di }, Object.assign({}, x, { note: '', athleteNote: '' }));
      blk.appendChild(cue);
      var ac = blk.querySelector('.dp-addcue'); if (ac) ac.remove();
      n = blk.querySelector('input.dp-note');
      if (n && !reduced() && cue.animate) cue.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    if (n) n.focus();
  }
  function addExBtn(ctx) {
    var b = E('button', { type: 'button', class: 'dp-addex', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'data-k': (ctx.team ? 't' + ctx.wi : ctx.wi) + ':add:' + ctx.dayKey });
    b.insertAdjacentHTML('beforeend', IC.plus);
    b.appendChild(E('span', {}, 'Add exercise'));
    b.setAttribute('aria-label', 'Add an exercise to ' + ctx.dayName);
    tip(b, 'Search the lifts and accessories, or type one as you’d write it: Paused squat 3x4 @7');
    hold(b);
    b.addEventListener('click', function (e) { e.stopPropagation(); if (!commitOpen()) return; var live = b.isConnected ? b : document.querySelector('.dp-addex[data-k="' + cssEsc(b.getAttribute('data-k')) + '"]') || b; openPicker(live, ctx); });
    return b;
  }
  function exMenu(aid, wi, di, exId, lineKey, anchor) {
    var prog = progOf(aid), D = prog.weeks[wi].days[di];
    var ei = (D.exercises || []).findIndex(function (e) { return String(e.id) === String(exId); });
    if (ei < 0) return [];
    var ex = D.exercises[ei], m = model(prog.weeks, wi, envFor(prog, aid));
    var X = m.days[di].exercises[ei];
    var base = { wi: wi, di: di, ei: ei, exId: ex.id }, items = [];
    if (X.lock && !X.swapped) {
      var nx = typeof CoachProgram !== 'undefined' && CoachProgram.cpNextWeekMatch ? CoachProgram.cpNextWeekMatch(prog.weeks, wi, di, ex) : null;
      if (nx) items.push({ label: 'Change week ' + wn(prog, nx.wi) + ' instead', run: function () { pickWeek(nx.wi, false); focusExercise(nx.wi, nx.di, nx.ei); } });
    }
    if (!X.lock) {
      items.push({ label: 'Add a set', hint: 'Like the last', run: function () { run(Object.assign({ t: 'addSet', label: 'Add a set to ' + X.title }, base), { scope: 'ex', ex: X.key, focus: 'last' }); } });
      items.push({ label: 'Add a line', hint: 'A back-off', run: function () { run(Object.assign({ t: 'addGroup', label: 'Add a line to ' + X.title }, base), { scope: 'ex', ex: X.key, focus: 'last' }); } });
      if (X.lines.length > 1) X.lines.forEach(function (ln) {
        if (ln.lock) return;
        if (lineKey && ln.key !== lineKey) return;
        items.push({ label: 'Remove ' + roleWord(ln.role).toLowerCase() + ' ' + ln.sets + ' × ' + ln.reps, run: function () { run(Object.assign({ t: 'removeGroup', start: ln.start, sid: ln.sid, label: 'Remove a line of ' + X.title }, base), { scope: 'ex', ex: X.key }); } });
      });
    }
    if (!X.lock && wi > 0) items.push({ label: 'Same as week ' + wn(prog, wi - 1), hint: (mac() ? '⌘' : 'Ctrl ') + 'D', run: function () { sameAsBefore(aid, wi, di, ei); } });
    if (MAIN.indexOf(ex.lift) >= 0 && !X.lock && typeof variantsFor === 'function') items.push({ label: 'Change the variant…', run: function () {
      setTimeout(function () {
        var cur = ex.variant || 'Competition';
        dkPopMenu(anchor, variantsFor(ex.lift).map(function (v) {
          return { label: (v === 'Competition' ? 'Competition ' : v + ' ') + (LIFT_LABELS[ex.lift] || ex.lift), check: v === cur, run: function () { if (v !== cur) run(Object.assign({ t: 'variant', variant: v, label: 'Variant of ' + X.title }, base), { scope: 'ex', ex: X.key }); } };
        }), { alignRight: true });
      }, 0);
    } });
    if (!X.lock && X.lines.length) items.push({ label: 'Set fields…', hint: 'Tempo, pause, bands', run: function () {
      var c = S.root && S.root.querySelector('.dp-ex[data-ex="' + cssEsc(X.key) + '"] .dp-cell.dp-f');
      if (c) c.focus();
    } });
    items.push({ label: X.note ? 'Edit the cue' : 'Add a cue', run: function () { editNote(aid, wi, di, ei); } });
    if (typeof dkBxFocus === 'function') items.push({ label: 'Details', hint: ']', run: function () { _dk.pbInsp = true; document.documentElement.classList.remove('ctx-off'); dkBxFocus({ athleteId: aid, wi: wi, di: di, ei: ei, label: X.full || X.title }); } });
    items.push('-');
    if (ei > 0) items.push({ label: 'Move up', run: function () { run(Object.assign({ t: 'moveEx', dir: -1, label: 'Move ' + X.title }, base), { scope: 'all', flash: X.key }); } });
    if (ei < D.exercises.length - 1) items.push({ label: 'Move down', run: function () { run(Object.assign({ t: 'moveEx', dir: 1, label: 'Move ' + X.title }, base), { scope: 'all', flash: X.key }); } });
    var others = prog.weeks[wi].days.map(function (dd, j) { return { dd: dd, j: j }; }).filter(function (o) { return o.j !== di && !isRest(o.dd); });
    if (others.length && !X.lock) items.push({ label: 'Move to day…', run: function () {
      setTimeout(function () {
        dkPopMenu(anchor, [{ node: E('div', { class: 'dk-menu-title', role: 'presentation' }, 'Move ' + X.title + ' to') }].concat(others.map(function (o) {
          return { label: o.dd.name || 'Day ' + (o.j + 1), run: function () { var r = run(Object.assign({ t: 'moveExTo', toDi: o.j, toDayId: o.dd.id, toEi: (o.dd.exercises || []).length, label: 'Move ' + X.title + ' to ' + (o.dd.name || 'Day ' + (o.j + 1)) }, base), { scope: 'all', flash: X.key }); if (r && r.ok) say(X.title + ' moved to ' + (o.dd.name || 'Day ' + (o.j + 1)) + '. ' + undoKey() + ' brings it back'); } };
        })), { alignRight: true });
      }, 0);
    } });
    items.push({ label: 'Duplicate', run: function () { run(Object.assign({ t: 'dupEx', label: 'Duplicate ' + X.title }, base), { scope: 'all' }); } });
    items.push('-', { label: 'Remove', danger: true, run: function () {
      if ((ex.sets || []).some(isLogged) && !confirm(X.title + ' has logged sets. Remove it anyway? Undo brings it back.')) return;
      run(Object.assign({ t: 'removeEx', label: 'Remove ' + X.title }, base), { scope: 'all' });
      say(X.title + ' removed. ' + undoKey() + ' brings it back');
    } });
    return items;
  }
  /* ---------- cells ---------- */
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }
  // A press on a control while the coach is typing in a cell (or the block's or a day's name, or a cue) keeps the focus
  // there: no blur commits and redraws under the pointer, so the click lands; its handler commits first (commitOpen).
  // always: keep the focus wherever it is (‹ ›).
  function editingEl() { var a = document.activeElement; return a && a._commit && ((S.root && S.root.contains(a)) || (S.head && S.head.contains(a))) ? a : null; }
  function hold(el, always) { el.addEventListener('mousedown', function (e) { if (always || editingEl()) e.preventDefault(); }); return el; }
  // A cell takes focus with its value selected, so typing replaces it (one keystroke for a load); the click that focused
  // it doesn't drop the selection, a second click places the caret.
  function selectOnFocus(inp) {
    var fresh = false;
    inp.addEventListener('focus', function () { fresh = true; try { inp.select(); } catch (e) {} });
    inp.addEventListener('mouseup', function (e) { if (fresh) { e.preventDefault(); fresh = false; } });
    inp.addEventListener('blur', function () { fresh = false; });
  }
  function bad(inp, why) { inp.classList.add('is-bad'); inp.setAttribute('aria-invalid', 'true'); tip(inp.parentNode, why); say(why); }
  // Focus: the key of the cell the coach is in (or about to land in), kept across every repaint.
  function focusKey() { var a = document.activeElement; return a && S.root && (S.root.contains(a) || (S.head && S.head.contains(a))) && a.getAttribute ? a.getAttribute('data-k') : null; }
  function restoreFocus(key, alt) {
    if (!key || !S.root) return false;
    var t = S.root.querySelector('[data-k="' + cssEsc(key) + '"]') || (S.head && S.head.querySelector('[data-k="' + cssEsc(key) + '"]'));
    if (!t && alt) t = S.root.querySelector(alt);
    if (!t) {
      // The same exercise and column, else the day's Add exercise.
      var p = String(key).split(':');
      if (p.length >= 4) t = S.root.querySelector('.dp-cell[data-ex="' + cssEsc(p[1]) + '"][data-col="' + cssEsc(p[3]) + '"]');
      if (!t && p.length >= 2) { var blk = S.root.querySelector('.dp-ex[data-ex="' + cssEsc(p[1]) + '"]'); var day = blk && blk.closest('.dp-day'); t = day && day.querySelector('.dp-addex'); }
    }
    if (!t) return false;
    t.focus({ preventScroll: false });
    if (t.select && t.classList.contains('dp-cell')) t.select();
    return true;
  }
  // The cell the coach is typing in, committed (before a week or a lifter changes under it). false: it doesn't read.
  function commitOpen() {
    var a = editingEl();
    if (!a) return true;
    return a._commit('nav') !== false;
  }
  function isLastLine(x, ln) { return !!ln && x.lines.length && x.lines[x.lines.length - 1].key === ln.key; }
  function wireLine(inp, aid, wi, d, x, ln) {
    var col = inp.getAttribute('data-col');
    var focusVal = null, escOnce = false;
    inp.addEventListener('focus', function () {
      escOnce = false;
      if (!inp.readOnly && inp._edit != null && inp.value === inp._rest) inp.value = inp._edit;
      focusVal = inp.value;
      if (typeof dkBxFocus === 'function') { try { dkBxFocus({ athleteId: aid, wi: wi, di: d.idx, ei: x.idx, label: x.full || x.title }); } catch (e) {} }
    });
    // Guarded three ways: S.busy (a redraw in progress), isConnected (the cell was redrawn away), and _committing (a
    // nested blur, as WebKit can fire one when focus moves inside a blur handler).
    var commit = function (why, want) {
      if (S.busy || !inp.isConnected || inp.readOnly || inp._committing) return true;
      if (inp.value === focusVal) { inp.classList.remove('is-bad'); inp.removeAttribute('aria-invalid'); return true; }
      inp._committing = true;
      try { return commitNow(why, want); } finally { inp._committing = false; }
    };
    var commitNow = function (why, want) {
      var op;
      if (col === 'w') {
        var prog = progOf(aid), ex = prog && prog.weeks[wi] && prog.weeks[wi].days[d.idx] && prog.weeks[wi].days[d.idx].exercises[x.idx];
        if (!ex) return true;
        var parsed = inp.value.trim() ? gridParseCell(inp.value.trim(), aid, ex.lift, prog) : [];
        if (parsed == null) { bad(inp, 'Each part needs sets x reps, like 3x5 @8 or 1x3 180, 3x5 75%'); return false; }
        op = { t: 'sets', wi: wi, di: d.idx, ei: x.idx, exId: x.key, sets: parsed, label: x.title + ', week ' + d.weekN };
      } else {
        var prog2 = progOf(aid);
        var plan = planCell(ln, col, inp.value, { unit: unitTag(), toKg: function (v) { return displayToKg(v); }, maxKg: isMain(x.lift) ? programMaxKg(prog2, aid, x.lift) : 0, main: isMain(x.lift), cols: programSetFields(prog2).cols });
        if (plan.error) { bad(inp, plan.error); return false; }
        if (plan.none) { inp.classList.remove('is-bad'); focusVal = inp.value; return true; }
        op = { t: plan.t, wi: wi, di: d.idx, ei: x.idx, exId: x.key, start: ln.start, sid: ln.sid, patch: plan.patch, to: plan.to, label: x.title + ', week ' + d.weekN };
      }
      inp.classList.remove('is-bad'); inp.removeAttribute('aria-invalid');
      focusVal = inp.value;
      var r = run(op, { scope: col === 'w' ? 'all' : 'ex', ex: x.key, want: want });
      return !!(r && r.ok);
    };
    inp._commit = commit;
    inp.addEventListener('blur', function (e) {
      if (S.busy || !inp.isConnected) return;
      var rt = e.relatedTarget, want = rt && rt.getAttribute ? rt.getAttribute('data-k') : null;
      var ok = commit('blur', want);
      if (ok && !inp.isConnected) return;
      if (inp.isConnected && !inp.classList.contains('is-bad') && inp._rest != null && inp.value === inp._edit) inp.value = inp._rest;
    });
    inp.addEventListener('keydown', function (e) {
      var mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Enter') {
        e.preventDefault();
        // Enter on the last cell of an exercise (its last line's notes) adds a set below; anywhere else it saves and moves
        // down the column (Shift: up).
        if (!e.shiftKey && col === 'f' && isLastLine(x, ln) && !x.lock && !inp.readOnly) {
          if (commit('enter', null) === false) return;
          run({ t: 'addGroup', wi: wi, di: d.idx, ei: x.idx, exId: x.key, label: 'Add a set to ' + x.title }, { scope: 'ex', ex: x.key, focus: 'last' });
          return;
        }
        var target = neighbour(inp, e.shiftKey ? -1 : 1);
        if (inp.readOnly) { if (target) { target.focus(); if (target.select) target.select(); } return; }
        var key = target ? target.getAttribute('data-k') : null;
        if (commit('enter', key) === false) return;
        if (inp.isConnected) { if (target && target.isConnected) { target.focus(); if (target.select) target.select(); } }
        else if (key) restoreFocus(key);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation();
        if (!escOnce && inp.value !== focusVal) { inp.value = focusVal; inp.classList.remove('is-bad'); escOnce = true; inp.select(); return; }
        if (inp.value !== focusVal) inp.value = focusVal;
        inp.blur();
        return;
      }
      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !mod && col !== 'f' && col !== 'w' && !inp.readOnly) {
        var nv = stepCell(col, inp.value, e.key === 'ArrowUp' ? 1 : -1, { unit: unitTag(), rir: ln && ln.effort.rir, est: ln && ln.load.est, show: showKg });
        if (nv != null) { e.preventDefault(); inp.value = nv; inp.select(); }
        return;
      }
      if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        e.preventDefault();
        var blk = inp.closest('.dp-ex'), m = blk && blk.querySelector('.dp-ex-head .dp-more');
        if (m) m.click();
        return;
      }
      if (mod && (e.key === 'z' || e.key === 'Z') && inp.value === focusVal) { e.preventDefault(); inp.blur(); if (e.shiftKey) { if (typeof dkPbRedo === 'function') dkPbRedo(); } else dkPbUndo(); return; }
      if (mod && !e.shiftKey && (e.key === 'd' || e.key === 'D') && !x.lock) { e.preventDefault(); if (commit('nav') !== false) sameAsBefore(aid, wi, d.idx, x.idx); }
    });
  }
  // The same column one line down (or up); past the day's last line, its Add exercise.
  function neighbour(inp, dir) {
    var col = inp.getAttribute('data-col'), day = inp.closest('.dp-day');
    if (!day) return null;
    var all = Array.prototype.slice.call(day.querySelectorAll(col && col !== 'w' ? '.dp-cell[data-col="' + col + '"], .dp-cell.dp-wline, .dp-addex' : '.dp-cell, .dp-addex'));
    var i = all.indexOf(inp);
    return all[i + dir] || null;
  }
  function sameAsBefore(aid, wi, di, ei) {
    var prog = progOf(aid), ex = prog.weeks[wi].days[di].exercises[ei];
    if (wi === 0) { say('Week ' + wn(prog, 0) + ' is the first week'); return; }
    var pd = prog.weeks[wi - 1].days[di], at = pd && typeof _dkPbMatch === 'function' ? _dkPbMatch(pd, ex, ei) : -1;
    if (at < 0) { say('Not in week ' + wn(prog, wi - 1)); return; }
    var prev = pd.exercises[at];
    var text = gridCellText({ sets: prev.sets.filter(function (s) { return !s.extra; }).map(function (s) { return Object.assign({}, s, { weight: planWeight(s), reps: s.plannedReps || s.reps }); }) });
    var sets = gridParseCell(text, aid, ex.lift, prog);
    if (!sets) return;
    run({ t: 'sets', wi: wi, di: di, ei: ei, exId: ex.id, sets: sets, label: 'Same as week ' + wn(prog, wi - 1) }, { scope: 'ex', ex: String(ex.id) });
  }

  /* ---------- one edit path ---------- */
  // apply(op): resolve on the live Store by ids, guard, one undo entry, the change (the app.js block loops), save,
  // repaint what changed, the focus where the coach is going. → { ok, why }
  function run(op, o) {
    o = o || {};
    var aid = S.aid, prog = progOf(aid);
    if (!prog) return { ok: false, why: 'stale' };
    var why = refuse(prog.weeks, op);
    if (why) {
      say(why === 'logged' ? (op.t === 'moveExTo' ? 'Lifted: it stays on the day it was lifted' : 'Lifted: what they did stays as it was') : why === 'swapped' ? 'Swapped that day: what you wrote stays' : why === 'only' ? 'An exercise keeps one line of sets: remove the exercise instead' : why === 'rest' ? 'A rest day takes no exercises: make it a training day first' : 'That changed while you were typing. Here it is now');
      if (why === 'stale') afterEdit({ scope: 'all' });
      return { ok: false, why: why };
    }
    dkPbRemember(prog, op.label || 'Edit');
    var ok = false;
    Store.update(function (s) { var p = (s.programs || []).find(function (x) { return x.id === prog.id; }); if (p) ok = mutate(p.weeks, Object.assign({ claim: true }, op)); });
    if (!ok) { dropUndo(prog.id); return { ok: false, why: 'same' }; }
    persistProgram(prog.id);
    afterEdit(o);
    return { ok: true };
  }
  function dropUndo(id) { var st = _dk.pbUndo || []; if (st.length && st[st.length - 1].id === id) st.pop(); if (typeof dkPbPaintUndo === 'function') dkPbPaintUndo(); }
  // A block that just arrived: it slides in (a new set, a new exercise, a moved one); none with reduced motion.
  function arrive(el, from) {
    if (!el || reduced() || !el.animate) return;
    el.animate([{ opacity: 0, transform: 'translateY(' + (from || -6) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }
  // After an edit: the exercise (or the week) drawn again, its day's head and chip, the strip, the head's crimson and
  // undo, the list, the edit marks, the preview.
  function afterEdit(o) {
    o = o || {};
    var prog = progOf(S.aid);
    if (!prog || !S.root) return;
    var want = o.want || focusKey();
    var env = envFor(prog, S.aid);
    if (o.scope === 'ex' && o.ex && S.view !== 'progress') {
      var old = S.root.querySelector('.dp-ex[data-ex="' + cssEsc(o.ex) + '"]');
      var m = model(prog.weeks, S.wi, env);
      var dd = null, xx = null;
      m.days.forEach(function (d) { d.exercises.forEach(function (x) { if (x.key === o.ex) { dd = d; xx = x; } }); });
      if (old && dd && xx) {
        var before = old.querySelectorAll('.dp-line').length;
        S.busy = true;
        try {
          dd.weekN = wn(prog, S.wi);
          var nb = exEl(prog, S.aid, S.wi, dd, xx, env);
          old.replaceWith(nb);
          refreshDay(prog, dd, m);
        } finally { S.busy = false; }
        if (o.focus === 'last') {
          var rows = nb.querySelectorAll('.dp-line');
          var lr = rows[rows.length - 1];
          if (rows.length > before) arrive(lr);
          else if (lr && !reduced()) { var cnt = lr.querySelector('.dp-cell.dp-n'); if (cnt && cnt.animate) cnt.animate([{ backgroundColor: 'color-mix(in srgb, var(--dh) 30%, transparent)' }, { backgroundColor: 'transparent' }], { duration: 600, easing: 'ease-out' }); }
          var c = lr && lr.querySelector('.dp-cell.dp-n');
          if (c) { c.focus(); c.select(); }
        } else if (want) restoreFocus(want);
      } else fill(S.root);
    } else if (o.scope !== 'head') fill(S.root);
    if (o.enter) arrive(S.root.querySelector('.dp-ex[data-ex="' + cssEsc(o.enter) + '"]'), -8);
    if (o.flash) arrive(S.root.querySelector('.dp-ex[data-ex="' + cssEsc(o.flash) + '"]'), 6);
    remember(prog);
    repaintHead();
    var l = document.getElementById('dkPbList'); if (l && typeof dkPaintPbRows === 'function') dkPaintPbRows(l);
    if (typeof dkPbMarkEdited === 'function') dkPbMarkEdited();
    if (_dk.pbInfo && typeof dkCtxReady === 'function' && dkCtxReady() && typeof dkPaintInspector === 'function') dkPaintInspector();
    if (o.want && o.scope !== 'ex') restoreFocus(o.want);
    if (S.pv) paintPreview();
  }
  // An exercise changed: its day's head (status, size, length), its chip and the strip say so too.
  function refreshDay(prog, dd, m) {
    var card = S.root.querySelector('.dp-day[data-di="' + dd.idx + '"]');
    if (card) {
      var hd = card.querySelector('.dp-day-head');
      var bd = hd && hd.querySelector('.dp-badge'); if (bd) bd.replaceWith(badgeEl(dd.sum));
      var sm = hd && hd.querySelector('.dp-day-sum'); if (sm && dd.sum.sets) sm.replaceWith(sumEl(dd.sum, S.aid));
    }
    var ch = S.root.querySelector('.dp-dchips'); if (ch) ch.replaceWith(chipsEl(prog, S.wi, m));
    var st = S.root.querySelector('.dp-strip'); if (st) st.replaceWith(stripEl(prog, S.aid, S.wi, envFor(prog, S.aid)));
  }
  function pickWeek(wi, focusTab) {
    var prog = progOf(S.aid);
    if (!prog || !commitOpen()) return;
    closePop();
    setWeek(prog, wi);
    if (_dk.pbInfo && _dk.pbInfo.wi !== wi) { _dk.pbInfo = null; if (typeof dkSyncCtx === 'function') dkSyncCtx(); }
    if (S.root) fill(S.root);
    repaintHead();
    if (focusTab && S.root) { var t = S.root.querySelector('.dp-tile.is-sel'); if (t) t.focus({ preventScroll: true }); }
    // A short fade on a week picked with the pointer; none from the keys (a move made over and over), none with reduced motion.
    if (!S.keyPick && !reduced() && S.root) { var wk = S.root.querySelector('.dp-week, .dk-pg'); if (wk && wk.animate) wk.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); }
    S.keyPick = false;
  }
  function focusExercise(wi, di, ei) {
    var prog = progOf(S.aid);
    if (!prog || !S.root) return;
    if (S.wi !== wi) pickWeek(wi, false);
    var ex = prog.weeks[wi] && prog.weeks[wi].days[di] && prog.weeks[wi].days[di].exercises[ei];
    var blk = ex && S.root.querySelector('.dp-ex[data-ex="' + cssEsc(String(ex.id)) + '"]');
    if (!blk) return;
    blk.scrollIntoView({ block: 'center' });
    var c = blk.querySelector('.dp-cell:not([readonly])') || blk.querySelector('.dp-cell');
    if (c) { c.focus({ preventScroll: true }); if (c.select) c.select(); }
  }

  /* ---------- weeks: write, copy, progress, clear, add, remove, publish ---------- */
  function doWriteWeek(aid, wi) {
    var prog = progOf(aid);
    if (!prog) return;
    var W = prog.weeks[wi];
    if (!W) { addWeek(aid, true); return; }
    var src = writeSource(prog.weeks, wi);
    if (src < 0) { say('Nothing written before week ' + wn(prog, wi) + ': add exercises to its days, or start from a template'); return; }
    if (weekSets(W).some(isLogged)) { say('Week ' + wn(prog, wi) + ' has logged sets: what they lifted stays'); return; }
    dkPbRemember(prog, 'Write week ' + wn(prog, wi));
    var res = null;
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) res = writeWeek(p.weeks, wi); });
    if (!res || !res.ok) { dropUndo(prog.id); return; }
    persistProgram(prog.id);
    setWeek(progOf(aid), wi);
    afterEdit({ scope: 'all' });
    say('Week ' + wn(prog, wi) + ' written from week ' + wn(prog, res.from) + (res.draft ? ' as a draft: ' + first((athleteOf(aid) || {}).name) + ' sees it when you publish' : '') + '. ' + undoKey() + ' undoes it');
  }
  // "Write": the weeks between the block's end and the meet, appended to this block (drafts while drafts are on; the
  // program id stays, nothing is archived), the first selected and written.
  function writeThem(aid, n) {
    var prog = progOf(aid);
    if (!prog || !(n >= 1)) return;
    if (!commitOpen()) return;
    dkPbRemember(prog, n === 1 ? 'Add a week' : 'Add ' + n + ' weeks');
    var at = -1;
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) at = appendWeeks(p.weeks, n); });
    if (at < 0) { dropUndo(prog.id); return; }
    persistProgram(prog.id);
    setWeek(progOf(aid), at);
    var src = writeSource(progOf(aid).weeks, at);
    if (src < 0) { afterEdit({ scope: 'all' }); return; }
    var res = null;
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) res = writeWeek(p.weeks, at); });
    persistProgram(prog.id);
    afterEdit({ scope: 'all' });
    say(plural(n, 'week') + ' added to ' + (prog.name || 'the block') + (draftsOn() ? ' as drafts' : '') + '; week ' + wn(progOf(aid), at) + ' written from week ' + wn(prog, res && res.from != null ? res.from : src) + '. ' + undoKey() + ' undoes it');
  }
  function addWeek(aid, write) {
    var prog = progOf(aid);
    if (!prog || !commitOpen()) return;
    dkPbRemember(prog, 'Add a week');
    var at = -1;
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) at = appendWeeks(p.weeks, 1); });
    persistProgram(prog.id);
    setWeek(progOf(aid), at);
    if (write && writeSource(progOf(aid).weeks, at) >= 0) {
      Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) writeWeek(p.weeks, at); });
      persistProgram(prog.id);
    }
    afterEdit({ scope: 'all' });
  }
  function copyLastWeek(aid, wi) {
    var prog = progOf(aid);
    if (!prog || wi < 1) return;
    if (weekSets(prog.weeks[wi]).some(isLogged)) { say('Week ' + wn(prog, wi) + ' has logged sets: what they lifted stays'); return; }
    dkPbRemember(prog, 'Copy week ' + wn(prog, wi - 1));
    var draft = false, had = weekSets(prog.weeks[wi]).length > 0;
    Store.update(function (s) {
      var p = s.programs.find(function (x) { return x.id === prog.id; });
      if (!p) return;
      p.weeks[wi].days = deskCopyWeekDays(p.weeks[wi - 1].days, p.weeks[wi].days);
      draft = draftWeekFrom(p.weeks, wi);
    });
    persistProgram(prog.id);
    afterEdit({ scope: 'all' });
    say('Week ' + wn(prog, wi - 1) + ' copied into week ' + wn(prog, wi) + (draft ? ' as a draft' : '') + (had ? ': what was there is replaced' : '') + '. ' + undoKey() + ' undoes it');
  }
  // What "Progress the week" would write: the week before moved on a step (desk.js dkPbStep, the same step it applies),
  // set against what week wi has now. → [{ title, lift, day, from, to, kept }]
  function progressPlan(prog, aid, wi, kind) {
    if (wi < 1 || !prog.weeks[wi] || typeof dkPbStep !== 'function') return [];
    var src = prog.weeks[wi - 1], dst = prog.weeks[wi], out = [];
    var asText = function (sets) { return gridCellText({ sets: (sets || []).filter(function (s) { return !s.extra; }).map(function (s) { return Object.assign({}, s, { weight: planWeight(s), reps: s.plannedReps || s.reps }); }) }); };
    (src.days || []).forEach(function (d, di) {
      (d.exercises || []).forEach(function (ex, ei) {
        var base = gridParseCell(gridCellText(ex), aid, ex.lift, prog) || [];
        if (!base.length || (typeof _dkPbFits === 'function' && !_dkPbFits(base, kind))) return;
        var next = dkPbStep(base, kind, 1, isMain(ex.lift) ? programMaxKg(prog, aid, ex.lift) : 0);
        var day = (dst.days || [])[di], at = day && typeof _dkPbMatch === 'function' ? _dkPbMatch(day, ex, ei) : -1, tgt = at >= 0 ? day.exercises[at] : null;
        out.push({ title: titleOf(ex), lift: ex.lift, day: d.name || '', from: tgt ? asText(tgt.sets) : '', to: asText(next), kept: !!(tgt && (tgt.sets || []).some(function (s) { return s.completed; })) });
      });
    });
    return out;
  }
  function openProgressPreview(anchor, aid, wi, kind, label) {
    var prog = progOf(aid);
    if (!prog) return;
    var plan = progressPlan(prog, aid, wi, kind);
    var pop = E('div', { class: 'dp-pop dp-progpop', role: 'dialog', 'aria-label': 'Progress week ' + wn(prog, wi) + ': what changes' });
    var hd = E('div', { class: 'dp-pop-head' });
    hd.appendChild(E('b', {}, label));
    hd.appendChild(E('span', {}, 'Week ' + wn(prog, wi - 1) + ' a step on, into week ' + wn(prog, wi)));
    pop.appendChild(hd);
    var list = E('div', { class: 'dp-pop-rows' });
    var moves = plan.filter(function (p) { return !p.kept; });
    if (!plan.length) list.appendChild(E('p', { class: 'dp-pop-note' }, kind === 'pct' ? 'Nothing in week ' + wn(prog, wi - 1) + ' is written as a %: try a load step.' : kind === 'rpe' ? 'Nothing in week ' + wn(prog, wi - 1) + ' has an RPE written.' : 'Nothing in week ' + wn(prog, wi - 1) + ' has a load to step. Try +0.5 RPE or +2.5%.'));
    plan.forEach(function (p) {
      var r = E('div', { class: 'dp-pop-row' + (p.kept ? ' is-kept' : '') });
      r.appendChild(E('i', { class: 'dp-ldot lift-' + (isMain(p.lift) ? p.lift : 'acc'), 'aria-hidden': 'true' }));
      r.appendChild(E('b', {}, p.title));
      var ch = E('span', { class: 'dp-pop-ch' });
      if (p.kept) ch.appendChild(E('span', {}, 'Lifted: it stays'));
      else { if (p.from) ch.appendChild(E('s', {}, p.from)); if (p.from) ch.appendChild(E('span', { class: 'dp-pop-arr', 'aria-hidden': 'true' }, '→')); ch.appendChild(E('span', { class: 'dp-pop-to' }, p.to)); }
      r.appendChild(ch);
      list.appendChild(r);
    });
    pop.appendChild(list);
    var ft = E('div', { class: 'dp-pop-foot' });
    var close;
    ft.appendChild(dkBtn('Cancel', { cls: 'is-quiet', onClick: function () { close(true); } }));
    if (moves.length) {
      var ap = dkBtn('Write ' + plural(moves.length, 'change'), { onClick: function () { close(false); progressWeek(aid, wi, kind); } });
      ap.classList.add('dp-pop-go');
      ft.appendChild(ap);
    }
    pop.appendChild(ft);
    close = popOpen(pop, anchor, { width: 440 });
    var go = pop.querySelector('.dp-pop-go') || pop.querySelector('.dk-btn');
    if (go) go.focus({ preventScroll: true });
  }
  // "Progress the week": the week before moved on a step into this week only (desk.js dkPbProgress, opts.weeks).
  function progressWeek(aid, wi, kind) {
    if (typeof dkPbProgress !== 'function' || wi < 1) return;
    dkPbProgress(aid, wi - 1, null, kind, { weeks: [wi] });
    afterEdit({ scope: 'all' });
  }
  function clearWeek(aid, wi) {
    var prog = progOf(aid);
    if (!prog) return;
    var lg = weekSets(prog.weeks[wi]).some(isLogged);
    var r = run({ t: 'clearWeek', wi: wi, label: 'Clear week ' + wn(prog, wi) }, { scope: 'all' });
    if (r && r.ok) say('Week ' + wn(prog, wi) + ' cleared' + (lg ? ': what was lifted stays' : '') + '. Write it again, or ' + undoKey() + ' brings it back');
  }
  function removeWeek(aid, wi) {
    var prog = progOf(aid), W = prog && prog.weeks[wi];
    if (!W || prog.weeks.length < 2) return;
    var lg = weekSets(W).some(isLogged);
    if (lg && !confirm('Week ' + wn(prog, wi) + ' has logged sets. Remove it anyway? Undo brings it back.')) return;
    dkPbRemember(prog, 'Remove week ' + wn(prog, wi));
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) { p.weeks.splice(wi, 1); keepDraftsTrailing(p.weeks); } });
    persistProgram(prog.id);
    setWeek(progOf(aid), Math.max(0, wi - 1));
    afterEdit({ scope: 'all' });
    say('Week ' + wn(prog, wi) + ' removed. ' + undoKey() + ' brings it back');
  }
  // Publish week wi (and every draft before it): saved, and the heads-up the desk's Notify always sent (dkPublish →
  // notifyAthleteAssigned). The demo only says so. The week's tile turns Live for a moment. The phone's ⋯ calls this too.
  // → how many weeks it published
  function publishWeek(aid, wi) {
    var prog = progOf(aid);
    if (!prog) return 0;
    var n = 0;
    if (typeof dkPbRemember === 'function' && isDeskNow()) dkPbRemember(prog, 'Publish week ' + wn(prog, wi));
    Store.update(function (s) { var p = (s.programs || []).find(function (x) { return x.id === prog.id; }); if (p) n = publishDraftWeeks(p.weeks, wi); });
    if (!n) { if (isDeskNow()) dropUndo(prog.id); say('Week ' + wn(prog, wi) + ' is already published'); return 0; }
    persistProgram(prog.id);
    var a = athleteOf(aid) || { name: '' };
    if (isDeskNow() && typeof dkPublish === 'function') dkPublish(aid, { quietDemo: true });
    else if (!window._demoMode && typeof notifyAthleteAssigned === 'function') { try { notifyAthleteAssigned(aid); } catch (e) {} }
    say(window._demoMode ? 'Week ' + wn(prog, wi) + ' published in the demo. Nothing leaves this page.' : 'Week ' + wn(prog, wi) + ' published. ' + first(a.name) + ' gets a heads-up.');
    if (isDeskNow() && S.root && S.root.isConnected && S.aid === aid) { S.pub = { prog: prog.id, wi: wi, at: Date.now() }; afterEdit({ scope: 'all' }); setTimeout(function () { if (S.pub && Date.now() - S.pub.at >= 3900 && S.root && S.root.isConnected) { S.pub = null; var st = S.root.querySelector('.dp-strip'), p2 = progOf(S.aid); if (st && p2) st.replaceWith(stripEl(p2, S.aid, S.wi, envFor(p2, S.aid))); } }, 4000); }
    return n;
  }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }

  /* ---------- last week's suggestions: Take, Not now, Take all ---------- */
  function takeSuggestions(aid, wi, rows) {
    var prog = progOf(aid), rev = deskWeekReview(prog);
    if (rev.nextIdx !== wi) return;
    var edits = rows.map(function (x) { return deskSuggestionEdit(prog, wi, x); }).filter(Boolean);
    if (!edits.length) { say('Nothing to take: those sets were changed or logged'); return; }
    dkPbRemember(prog, edits.length === 1 ? 'Take a suggestion' : 'Take ' + edits.length + ' suggestions');
    var n = 0;
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) n = deskApplyNextWeek(p.weeks, wi, edits); });
    persistProgram(prog.id);
    afterEdit({ scope: 'all' });
    say(n ? plural(n, 'suggestion') + ' written into week ' + wn(prog, wi) : 'Nothing changed');
  }
  function sugWords(x) {
    var lg = x.logged, said = typeof dkSugText === 'function' ? dkSugText(x.suggest, x) : '';
    if (/\d$/.test(said)) said += ' ' + unitTag();
    var ev = lg ? 'lifted ' + (lg.weight > 0 ? showKg(lg.weight) + ' × ' : '') + lg.reps + (lg.rpe != null ? ' @' + n2(lg.rpe) : '') : '';
    if (ev && x.delta != null && Math.abs(x.delta) >= 0.25) ev += ', ' + (x.delta > 0 ? '+' : '−') + n2(Math.abs(x.delta)) + (x.delta > 0 ? ' over' : ' under') + ' what you wrote';
    return { said: said, ev: ev };
  }
  function openSugPop(anchor, aid) {
    var prog = progOf(aid), sug = prog && pendingSuggestions(prog);
    if (!sug) { closePop(); return; }
    if (S.pop && S.pop.anchor === anchor) { closePop(); return; }
    var pop = E('div', { class: 'dp-pop dp-sugpop', role: 'dialog', 'aria-label': 'Suggestions for week ' + wn(prog, sug.wi) });
    var hd = E('div', { class: 'dp-pop-head' });
    hd.appendChild(E('b', {}, 'From how week ' + wn(prog, Math.max(0, sug.last)) + ' was lifted'));
    hd.appendChild(E('span', {}, 'Into week ' + wn(prog, sug.wi) + ': take one, or all'));
    pop.appendChild(hd);
    var list = E('div', { class: 'dp-pop-rows' });
    var reopen = function () { setTimeout(function () { var c = S.root && S.root.querySelector('.dp-sugchip'); if (c) openSugPop(c, aid); }, 0); };
    sug.rows.forEach(function (x) {
      var w = sugWords(x);
      var r = E('div', { class: 'dp-pop-row is-sug' });
      r.appendChild(E('i', { class: 'dp-ldot lift-' + (isMain(x.lift) ? x.lift : 'acc'), 'aria-hidden': 'true' }));
      var tx = E('span', { class: 'dp-pop-tx' });
      tx.appendChild(E('b', {}, x.title || ''));
      tx.appendChild(E('span', { class: 'dp-pop-say' }, w.said));
      if (w.ev) tx.appendChild(E('span', { class: 'dp-pop-ev' }, w.ev));
      r.appendChild(tx);
      var later = dkBtn('Not now', { cls: 'is-quiet', onClick: function () {
        var k = prog.id + ':' + sug.wi;
        S.sugSkip[k] = S.sugSkip[k] || {}; S.sugSkip[k][x.key] = 1;
        closePop(false);
        if (S.root) fill(S.root);
        repaintHead();
        reopen();
      } });
      var take = dkBtn('Take', { onClick: function () { closePop(false); if (S.wi !== sug.wi) pickWeek(sug.wi, false); takeSuggestions(aid, sug.wi, [x]); reopen(); } });
      r.appendChild(later);
      r.appendChild(take);
      list.appendChild(r);
    });
    pop.appendChild(list);
    var ft = E('div', { class: 'dp-pop-foot' });
    ft.appendChild(dkBtn('Not now', { cls: 'is-quiet', onClick: function () { S.sugOff[prog.id + ':' + sug.wi] = 1; closePop(true); if (S.root) fill(S.root); repaintHead(); } }));
    ft.appendChild(dkBtn(sug.rows.length === 1 ? 'Take it' : 'Take all ' + sug.rows.length, { onClick: function () { closePop(false); if (S.wi !== sug.wi) pickWeek(sug.wi, false); takeSuggestions(aid, sug.wi, sug.rows); } }));
    pop.appendChild(ft);
    popOpen(pop, anchor, { width: 460, alignRight: true });
    var f = pop.querySelector('.dp-pop-row .dk-btn:not(.is-quiet)');
    if (f) f.focus({ preventScroll: true });
  }

  /* ---------- popovers (the picker, the suggestions, Progress's preview): one at a time, from their trigger ---------- */
  function closePop(back) { if (S.pop && S.pop.close) S.pop.close(back); S.pop = null; }
  // o: { width, alignRight }. → close(back): back = the focus returns to the trigger.
  function popOpen(pop, anchor, o) {
    o = o || {};
    closePop();
    if (typeof closeDkMenus === 'function') closeDkMenus();
    if (o.width) pop.style.width = o.width + 'px';
    document.body.appendChild(pop);
    var place = function () {
      if (!anchor.isConnected) return;
      var r = anchor.getBoundingClientRect(), mw = pop.offsetWidth, mh = pop.offsetHeight;
      var up = r.bottom + 8 + mh > window.innerHeight - 8 && r.top - 8 - mh > 8;
      var left = o.alignRight ? r.right - mw : r.left;
      pop.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, left)) + 'px';
      pop.style.top = Math.max(8, up ? r.top - mh - 8 : Math.min(window.innerHeight - mh - 8, r.bottom + 8)) + 'px';
      pop.style.transformOrigin = (o.alignRight ? 'right ' : 'left ') + (up ? 'bottom' : 'top');
    };
    place();
    anchor.setAttribute('aria-expanded', 'true');
    if (!reduced() && pop.animate) pop.animate([{ opacity: 0, transform: 'scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    var closed = false;
    var outside = function (e) { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(false); };
    var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(true); } };
    var onScroll = function () { place(); };
    var close = function (back) {
      if (closed) return;
      closed = true;
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onScroll);
      var sc = document.getElementById('programArea'); if (sc) sc.removeEventListener('scroll', onScroll);
      anchor.setAttribute('aria-expanded', 'false');
      pop.remove();
      if (back && anchor.isConnected) anchor.focus({ preventScroll: true });
      if (S.pop && S.pop.el === pop) S.pop = null;
    };
    setTimeout(function () { if (!closed) document.addEventListener('mousedown', outside, true); }, 0);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onScroll);
    var sc0 = document.getElementById('programArea'); if (sc0) sc0.addEventListener('scroll', onScroll, { passive: true });
    S.pop = { el: pop, close: close, anchor: anchor };
    return close;
  }

  /* ---------- + Add exercise: a searchable picker ---------- */
  var GROUP_WORD = { recent: 'In this block', squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift', push: 'Push', pull: 'Pull', legs: 'Legs' };
  // ctx: { aid, wi, di, dayId, dayName, dayKey, team: { T, W } | null }
  function openPicker(anchor, ctx) {
    if (S.pop && S.pop.anchor === anchor) { closePop(true); return; }
    var team = ctx.team || null, prog = team ? null : progOf(ctx.aid);
    var weeks = team ? (team.T.weeks || []) : prog ? prog.weeks : [];
    var recent = [];
    for (var i = Math.min(weeks.length - 1, ctx.wi + 1); i >= 0; i--) ((weeks[i] || {}).days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { recent.push(e); }); });
    var items = pickerItems({ recent: recent });
    var uid0 = 'dpPick' + Date.now().toString(36);
    var pop = E('div', { class: 'dp-pop dp-picker', role: 'dialog', 'aria-label': 'Add an exercise to ' + ctx.dayName });
    var sw = E('label', { class: 'dp-pick-search' });
    sw.insertAdjacentHTML('beforeend', IC.search);
    var inp = E('input', { type: 'text', class: 'dp-pick-in', placeholder: 'Find one, or type it: Paused squat 3x4 @7', 'aria-label': 'Find an exercise, or type it with its sets', autocomplete: 'off', spellcheck: 'false',
      role: 'combobox', 'aria-expanded': 'true', 'aria-controls': uid0, 'aria-autocomplete': 'list' });
    sw.appendChild(inp);
    pop.appendChild(sw);
    var list = E('div', { class: 'dp-pick-list', role: 'listbox', id: uid0, 'aria-label': 'Exercises' });
    pop.appendChild(list);
    pop.appendChild(E('div', { class: 'dp-pick-foot', 'aria-hidden': 'true' }, E('span', {}, '↑ ↓ choose'), E('span', {}, '↵ add'), E('span', {}, 'Esc close')));
    var shown = [], active = 0, close;
    var paint = function () {
      var typed = splitTyped(inp.value), q = typed.name;
      shown = pickerSearch(items, q).slice(0, 80);
      if (q && !shown.some(function (x) { return normQ(x.title) === normQ(q); })) shown.push({ key: 'custom', custom: true, title: q, lift: 'other' });
      if (active >= shown.length) active = Math.max(0, shown.length - 1);
      list.innerHTML = '';
      var lastG = null;
      shown.forEach(function (x, k) {
        if (!q && x.group !== lastG) { lastG = x.group; list.appendChild(E('div', { class: 'dp-pick-grp', role: 'presentation' }, GROUP_WORD[x.group] || '')); }
        var opt = E('div', { class: 'dp-pick-opt' + (k === active ? ' is-on' : ''), role: 'option', id: uid0 + '-' + k, 'aria-selected': String(k === active) });
        if (x.custom) { opt.appendChild(E('span', { class: 'dp-lt is-sm lift-acc', 'aria-hidden': 'true', html: IC.plus })); opt.appendChild(E('span', { class: 'dp-pick-t' }, 'Add “' + x.title + '”')); }
        else { var lt = liftTile({ main: isMain(x.lift), lift: x.lift }); lt.classList.add('is-sm'); opt.appendChild(lt); opt.appendChild(E('span', { class: 'dp-pick-t' }, x.title)); }
        if (typed.rx && k === active) opt.appendChild(E('span', { class: 'dp-pick-rx' }, typed.rx));
        opt.addEventListener('mousedown', function (e) { e.preventDefault(); });
        opt.addEventListener('click', function () { active = k; choose(); });
        opt.addEventListener('mousemove', function () { if (active !== k) { active = k; mark(); } });
        list.appendChild(opt);
      });
      mark();
    };
    var mark = function () {
      list.querySelectorAll('.dp-pick-opt').forEach(function (o2) { var on = o2.id === uid0 + '-' + active; o2.classList.toggle('is-on', on); o2.setAttribute('aria-selected', String(on)); });
      inp.setAttribute('aria-activedescendant', shown.length ? uid0 + '-' + active : '');
      var on = list.querySelector('.dp-pick-opt.is-on');
      if (on) { var lr = list.getBoundingClientRect(), orr = on.getBoundingClientRect(); if (orr.top < lr.top + 28) list.scrollTop -= lr.top + 28 - orr.top; else if (orr.bottom > lr.bottom) list.scrollTop += orr.bottom - lr.bottom; }
    };
    var choose = function () {
      var x = shown[active];
      if (!x) return;
      var typed = splitTyped(inp.value);
      var me;
      if (x.custom) {
        var said = typed.name.replace(/\bpause\b/i, 'Paused').replace(/\bcg\b/i, 'Close Grip').replace(/\bclose-grip\b/i, 'Close Grip');
        me = typeof matchExercise === 'function' ? matchExercise(said) : { lift: 'other', variant: '', exerciseName: typed.name };
      } else me = { lift: x.lift, variant: x.variant || '', exerciseName: x.exerciseName || '' };
      var sets = [];
      if (typed.rx) {
        sets = team ? dsParseMaster(typed.rx, me.lift) : gridParseCell(typed.rx, ctx.aid, me.lift, prog);
        if (sets == null) { inp.classList.add('is-bad'); say('The sets need sets x reps, like 3x5 @8'); return; }
      }
      var ex = newExercise(me.lift, me.variant, me.exerciseName);
      ex.sets = sets;
      var title = titleOf(ex);
      close(false);
      var kp = team ? 't' + ctx.wi : String(ctx.wi);
      var want = sets.length ? kp + ':' + ex.id + ':' + sets[0].id + ':n' : kp + ':' + ex.id + '::w';
      var op = { t: 'addEx', wi: ctx.wi, di: ctx.di, dayId: ctx.dayId, ex: ex, label: 'Add ' + title };
      if (team) teamRun(team.T, op, want, 'enter:' + ex.id);
      else run(op, { scope: 'all', want: want, enter: ex.id });
    };
    inp.addEventListener('input', function () { active = 0; inp.classList.remove('is-bad'); paint(); });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; mark(); } return; }
      if (e.key === 'Enter') { e.preventDefault(); choose(); return; }
      if (e.key === 'Tab') close(false);
    });
    paint();
    close = popOpen(pop, anchor, { width: 380 });
    inp.focus({ preventScroll: true });
  }
  /* ---------- drag an exercise: within its day or to another day (pointer events, a ghost, a drop line) ----------
     The ghost follows the pointer from where it was grabbed; a line shows where it lands; near the top or the bottom the
     week scrolls; Esc puts it back. Lifted exercises stay on the day they were lifted. From the keys: ⋯ › Move up, Move
     down, Move to day. */
  function gripDown(e, aid, wi, di, exId) {
    if (e.button !== 0 || S.drag) return;
    var grip = e.currentTarget, blk = grip.closest('.dp-ex');
    if (!blk || !commitOpen()) return;
    e.preventDefault();
    if (blk.classList.contains('is-lock')) { say('Lifted: it stays on the day it was lifted'); return; }
    var r = blk.getBoundingClientRect();
    S.drag = { aid: aid, wi: wi, di: di, exId: exId, blk: blk, grip: grip, id: e.pointerId, x0: e.clientX, y0: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, w: r.width, on: false, ghost: null, line: null, target: null, raf: 0, y: e.clientY };
    try { grip.setPointerCapture(e.pointerId); } catch (x) {}
    grip.addEventListener('pointermove', dragMove);
    grip.addEventListener('pointerup', dragEnd);
    grip.addEventListener('pointercancel', dragCancel);
    document.addEventListener('keydown', dragKey, true);
  }
  function dragStart(d) {
    d.on = true;
    var g = E('div', { class: 'dp-ghost', 'aria-hidden': 'true' });
    g.style.width = Math.min(d.w, 560) + 'px';
    var hd = d.blk.querySelector('.dp-ex-head');
    if (hd) g.appendChild(hd.cloneNode(true));
    var n = d.blk.querySelectorAll('.dp-line').length;
    g.appendChild(E('div', { class: 'dp-ghost-sub' }, n ? plural(n, 'line') + ' of sets' : 'Nothing written yet'));
    document.body.appendChild(g);
    d.ghost = g;
    d.line = E('div', { class: 'dp-dropline', 'aria-hidden': 'true' });
    document.body.appendChild(d.line);
    d.blk.classList.add('is-dragging');
    document.documentElement.classList.add('dp-dragging');
    var tick = function () { if (!S.drag || !S.drag.on) return; autoScroll(S.drag.y); S.drag.raf = requestAnimationFrame(tick); };
    d.raf = requestAnimationFrame(tick);
  }
  function dragMove(e) {
    var d = S.drag;
    if (!d || e.pointerId !== d.id) return;
    d.y = e.clientY;
    if (!d.on) { if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 5) return; dragStart(d); }
    // Held where it was grabbed: the handle sits at the right end, so the ghost hangs to the pointer's left.
    d.ghost.style.transform = 'translate(' + Math.round(e.clientX - Math.min(d.gx, d.ghost.offsetWidth - 24)) + 'px,' + Math.round(e.clientY - Math.min(d.gy, 24)) + 'px)';
    d.target = dropAt(e.clientX, e.clientY, d);
    paintDrop(d);
  }
  // Where a drop lands: the day card under the pointer (a rest day takes nothing), and the place among its exercises.
  // → { di, dayId, ei (counted without the one moving), top, left, width } | null
  function dropAt(x, y, d) {
    if (!S.root) return null;
    var cards = Array.prototype.slice.call(S.root.querySelectorAll('.dp-day:not(.is-rest)'));
    if (!cards.length) return null;
    var card = null, best = Infinity;
    cards.forEach(function (c) { var r = c.getBoundingClientRect(), dist = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0; if (dist < best) { best = dist; card = c; } });
    if (!card || best > 160) return null;
    var di = Number(card.getAttribute('data-di')), prog = progOf(d.aid), D = prog && prog.weeks[d.wi] && prog.weeks[d.wi].days[di];
    if (!D) return null;
    var blks = Array.prototype.slice.call(card.querySelectorAll('.dp-ex')).filter(function (b) { return b !== d.blk; });
    var ei = 0, top, cr = card.getBoundingClientRect();
    blks.forEach(function (b) { var r = b.getBoundingClientRect(); if (y > r.top + r.height / 2) ei++; });
    if (!blks.length) { var ad = card.querySelector('.dp-addex'); top = ad ? ad.getBoundingClientRect().top - 6 : cr.top + 60; }
    else if (ei < blks.length) top = blks[ei].getBoundingClientRect().top;
    else top = blks[blks.length - 1].getBoundingClientRect().bottom;
    return { di: di, dayId: D.id, ei: ei, top: top, left: cr.left + 20, width: cr.width - 40 };
  }
  function paintDrop(d) {
    var t = d.target;
    if (!t) { d.line.style.opacity = '0'; return; }
    d.line.style.opacity = '1';
    d.line.style.transform = 'translate(' + Math.round(t.left) + 'px,' + Math.round(t.top - 1) + 'px)';
    d.line.style.width = Math.round(t.width) + 'px';
  }
  function autoScroll(y) {
    var sc = document.getElementById('programArea');
    if (!sc) return;
    var r = sc.getBoundingClientRect(), topEdge = r.top + stickyTop(sc) + 40, v = 0;
    if (y < topEdge) v = -Math.min(18, (topEdge - y) / 3);
    else if (y > r.bottom - 56) v = Math.min(18, (y - (r.bottom - 56)) / 3);
    if (v) { sc.scrollTop += v; if (S.drag && S.drag.on) { S.drag.target = dropAt(S.drag.x0, y, S.drag); paintDrop(S.drag); } }
  }
  function dragKey(e) { if (e.key === 'Escape' && S.drag) { e.preventDefault(); e.stopImmediatePropagation(); dragCancel(); } }
  function dragCleanup() {
    var d = S.drag;
    if (!d) return null;
    S.drag = null;
    cancelAnimationFrame(d.raf);
    d.grip.removeEventListener('pointermove', dragMove);
    d.grip.removeEventListener('pointerup', dragEnd);
    d.grip.removeEventListener('pointercancel', dragCancel);
    document.removeEventListener('keydown', dragKey, true);
    try { d.grip.releasePointerCapture(d.id); } catch (x) {}
    if (d.ghost) d.ghost.remove();
    if (d.line) d.line.remove();
    if (d.blk) d.blk.classList.remove('is-dragging');
    document.documentElement.classList.remove('dp-dragging');
    return d;
  }
  function dragCancel() { dragCleanup(); }
  function dragEnd(e) {
    var d = S.drag;
    if (!d || (e && e.pointerId !== d.id)) return;
    var on = d.on, t = d.target;
    dragCleanup();
    if (!on || !t) return;
    var prog = progOf(d.aid), D = prog && prog.weeks[d.wi] && prog.weeks[d.wi].days[d.di];
    var ei = D ? (D.exercises || []).findIndex(function (x) { return String(x.id) === String(d.exId); }) : -1;
    if (ei < 0) return;
    if (t.di === d.di && t.ei === ei) return;
    var ex = D.exercises[ei], to = prog.weeks[d.wi].days[t.di];
    run({ t: 'moveExTo', wi: d.wi, di: d.di, ei: ei, exId: d.exId, toDi: t.di, toDayId: t.dayId, toEi: t.ei, label: 'Move ' + titleOf(ex) + (t.di !== d.di ? ' to ' + (to.name || 'Day ' + (t.di + 1)) : '') }, { scope: 'all', flash: String(d.exId) });
  }

  /* ---------- Preview: the week as the lifter's Train shows it, read-only, beside the editor ---------- */
  function togglePreview(on) {
    S.pv = on == null ? !S.pv : !!on;
    if (S.pv) S.pvDay = null;
    paintPreview();
    var b = S.head && S.head.querySelector('.dp-pvbtn');
    if (b) b.setAttribute('aria-pressed', String(!!S.pv));
  }
  function paintPreview() {
    var host = document.getElementById('dpPv');
    var prog = progOf(S.aid);
    var on = S.pv && prog && (prog.weeks || []).length && isDeskNow() && typeof _dk !== 'undefined' && _dk.screen === 'programs' && S.root && S.root.isConnected;
    if (!on) {
      if (host) host.remove();
      document.documentElement.classList.remove('dp-pv-on');
      if (S.pv && !(S.root && S.root.isConnected)) S.pv = false;
      return;
    }
    var fresh = !host;
    if (fresh) { host = E('aside', { id: 'dpPv', class: 'dp-pv', 'aria-label': 'Preview: the week as the lifter sees it' }); document.body.appendChild(host); }
    document.documentElement.classList.add('dp-pv-on');
    var a = athleteOf(S.aid) || { name: '' }, wi = S.wi, W = prog.weeks[wi], env = envFor(prog, S.aid);
    var m = model(prog.weeks, wi, env);
    var train = m.days.filter(function (d) { return !d.rest && d.exercises.length; });
    if (S.pvDay == null || !train.some(function (d) { return d.idx === S.pvDay; })) { var nx = train.find(function (d) { return d.sum.status !== 'done'; }) || train[0]; S.pvDay = nx ? nx.idx : null; }
    host.innerHTML = '';
    var hd = E('div', { class: 'dp-pv-head' });
    hd.appendChild(E('div', { class: 'dp-pv-ttl' }, E('b', {}, 'As ' + first(a.name) + ' sees it'), E('span', {}, 'Train, in the app · read only')));
    var x = E('button', { type: 'button', class: 'dp-tool dp-pv-x', 'aria-label': 'Close the preview', html: IC.x });
    tip(x, 'Close', 'Esc');
    x.addEventListener('click', function () { togglePreview(false); var b = S.head && S.head.querySelector('.dp-pvbtn'); if (b) b.focus({ preventScroll: true }); });
    hd.appendChild(x);
    host.appendChild(hd);
    var ph = E('div', { class: 'dp-pv-phone' });
    var sc = E('div', { class: 'dp-pv-screen' });
    var day = m.days.find(function (d) { return d.idx === S.pvDay; });
    sc.appendChild(E('div', { class: 'dp-pv-eye' }, (env.starts[wi] ? fmtRange(env.starts[wi], isoAdd(env.starts[wi], 6)) + ' · ' : '') + 'Week ' + wn(prog, wi)));
    sc.appendChild(E('div', { class: 'dp-pv-day' }, day ? day.name || 'Day ' + (day.idx + 1) : 'No sessions'));
    if (isDraft(W)) sc.appendChild(E('div', { class: 'dp-pv-draft' }, E('b', {}, 'A draft'), E('span', {}, first(a.name) + ' doesn’t see week ' + wn(prog, wi) + ' until you publish it. This is how it will read.')));
    if (train.length > 1) {
      var pills = E('div', { class: 'dp-pv-pills', role: 'tablist', 'aria-label': 'Days' });
      train.forEach(function (d) {
        var onD = d.idx === S.pvDay;
        var p = E('button', { type: 'button', role: 'tab', 'aria-selected': String(onD), class: 'dp-pv-pill' + (onD ? ' is-on' : '') + (d.sum.status === 'done' ? ' is-done' : '') }, shortDay(d.name, d.idx));
        p.addEventListener('click', function () { S.pvDay = d.idx; paintPreview(); });
        pills.appendChild(p);
      });
      sc.appendChild(pills);
    }
    if (day) {
      sc.appendChild(E('div', { class: 'dp-pv-sec' }, 'The session'));
      var D = W.days[day.idx];
      (D.exercises || []).forEach(function (ex, ei) {
        var X = day.exercises[ei], sets = (ex.sets || []).filter(function (s) { return !s.extra; });
        var card = E('div', { class: 'dp-pv-card lift-' + (X.main ? X.lift : 'acc') });
        var ch = E('div', { class: 'dp-pv-chead' });
        var lt = liftTile(X); lt.classList.add('is-lg'); ch.appendChild(lt);
        var nm = E('div', { class: 'dp-pv-cname' }, E('b', {}, X.title));
        if (X.tag) nm.appendChild(E('span', {}, (LIFT_LABELS[X.lift] || 'Main lift') + ' variation'));
        ch.appendChild(nm);
        ch.appendChild(E('span', { class: 'dp-pv-ring' }, E('b', {}, String(sets.filter(function (s) { return s.completed; }).length)), E('span', {}, '/' + sets.length)));
        card.appendChild(ch);
        if (X.note) card.appendChild(E('p', { class: 'dp-pv-cue' }, E('b', {}, 'Coach '), X.note));
        sets.forEach(function (s, k) {
          var r = E('div', { class: 'dp-pv-set' + (s.completed ? ' is-done' : '') });
          r.appendChild(E('span', { class: 'dp-pv-n' }, String(k + 1)));
          var w = Number(planWeight(s)) || 0, est = !w && X.main ? env.estKg(ex, s) : 0, reps = Number(s.plannedReps || s.reps) || 0;
          var ld = E('span', { class: 'dp-pv-load' });
          if (w || est) { ld.appendChild(E('b', {}, (est ? '~' : '') + showKg(w || est))); ld.appendChild(E('small', {}, ' ' + env.unit + ' ')); }
          ld.appendChild(E('i', {}, '× '));
          ld.appendChild(E('b', {}, String(reps)));
          var info = E('span', { class: 'dp-pv-info' }, ld);
          var f = fieldTags(s);
          if (f.length || (!w && !est)) info.appendChild(E('span', { class: 'dp-pv-f' }, (!w && !est ? 'Load by feel' + (f.length ? ' · ' : '') : '') + f.join(' · ')));
          r.appendChild(info);
          var t = topRpe(s);
          if (t != null) { var pill = E('span', { class: 'dp-pv-rpe' }, s.rir ? n2(10 - t) + ' RIR' : String(n2(t))); if (typeof rpeColor === 'function') pill.style.setProperty('--rc', rpeColor(t)); r.appendChild(pill); }
          r.appendChild(E('span', { class: 'dp-pv-o' + (s.completed ? ' is-done' : ''), html: s.completed ? IC.check : '' }));
          card.appendChild(r);
        });
        sc.appendChild(card);
      });
    } else sc.appendChild(E('p', { class: 'dp-pv-none' }, 'Nothing to lift in week ' + wn(prog, wi) + ' yet.'));
    ph.appendChild(sc);
    host.appendChild(ph);
    if (fresh) {
      host.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); togglePreview(false); var b = S.head && S.head.querySelector('.dp-pvbtn'); if (b) b.focus({ preventScroll: true }); } });
      if (!reduced() && host.animate) host.animate([{ opacity: 0, transform: 'translateX(16px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
    }
  }

  /* ---------- Print the week: ink on white, one day per block, the lifter, the block and the dates ---------- */
  // o.noDialog: build the page only (the flows emulate print media). The browser's own ⌘P on Programs prints it too.
  function printWeek(o) {
    o = o || {};
    var prog = progOf(S.aid);
    if (!prog || !commitOpen()) return null;
    var a = athleteOf(S.aid) || { name: '' }, wi = S.wi, W = prog.weeks[wi], env = envFor(prog, S.aid), m = model(prog.weeks, wi, env);
    var host = document.getElementById('dpPrint');
    if (!host) { host = E('div', { id: 'dpPrint', class: 'dp-print' }); document.body.appendChild(host); }
    host.innerHTML = '';
    var meet = typeof dkPbMeet === 'function' ? dkPbMeet(prog, S.aid) : null;
    var st = env.starts[wi];
    host.appendChild(E('h1', {}, a.name || 'Lifter'));
    host.appendChild(E('p', { class: 'dp-pr-sub' }, [prog.name || 'Program', 'Week ' + wn(prog, wi) + ' of ' + prog.weeks.length, st ? fmtRange(st, isoAdd(st, 6)) : '', meet ? meet.name + ' ' + fmtDay(meet.date) : ''].filter(Boolean).join(' · ')));
    var mx = MAIN.map(function (L) { var v = programMaxKg(prog, S.aid, L); return v > 0 ? (LIFT_LABELS[L] || L) + ' ' + showKg(v) : ''; }).filter(Boolean);
    if (mx.length) host.appendChild(E('p', { class: 'dp-pr-sub' }, 'Maxes: ' + mx.join(' · ') + ' ' + env.unit));
    m.days.forEach(function (d) {
      var sec = E('div', { class: 'dp-pr-day' });   // a div: every <section> outside a pane is padded (CLAUDE.md gotcha)
      sec.appendChild(E('h2', {}, (d.name || 'Day ' + (d.idx + 1)) + (d.sum.date ? ' · ' + fmtDay(d.sum.date) : '') + (d.rest ? '' : ' · ' + plural(d.sum.sets, 'set') + (d.sum.minutes ? ' · about ' + d.sum.minutes + ' min' : ''))));
      if (d.rest) { sec.appendChild(E('p', { class: 'dp-pr-line' }, 'No training')); host.appendChild(sec); return; }
      d.exercises.forEach(function (x) {
        var ex = E('div', { class: 'dp-pr-ex' });
        ex.appendChild(E('h3', {}, x.title + (x.maxKg ? '  (max ' + showKg(x.maxKg) + ' ' + env.unit + ')' : '')));
        x.lines.forEach(function (ln) {
          var lv = loadView(ln.load, ln.g, env);
          ex.appendChild(E('p', { class: 'dp-pr-line' }, [roleWord(ln.role), ln.sets + ' × ' + ln.reps, (lv.rest || lv.ph || '') + (lv.tag && lv.tag !== 'est.' ? ' (' + lv.tag + ')' : ''), ln.effort.text, fieldTags(ln.g).join(', '), ln.lifted ? 'Lifted ' + ln.lifted.text : ''].filter(Boolean).join('   ')));
        });
        if (!x.lines.length) ex.appendChild(E('p', { class: 'dp-pr-line' }, 'Nothing written'));
        if (x.note) ex.appendChild(E('p', { class: 'dp-pr-cue' }, 'Cue: ' + x.note));
        sec.appendChild(ex);
      });
      host.appendChild(sec);
    });
    host.appendChild(E('p', { class: 'dp-pr-foot' }, 'Printed ' + fmtDay(env.today) + ' from POWALIFTA'));
    document.documentElement.classList.add('dp-printing');
    if (!o.noDialog) { try { window.print(); } catch (e) {} }
    return host;
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeprint', function () {
      if (document.documentElement.classList.contains('dp-printing')) return;
      if (isDeskNow() && typeof _dk !== 'undefined' && _dk.screen === 'programs' && S.root && S.root.isConnected && S.view !== 'progress') printWeek({ noDialog: true });
    });
    window.addEventListener('afterprint', function () { document.documentElement.classList.remove('dp-printing'); });
  }

  /* ---------- ‹ › and J/K: the next lifter, in the list's own order ---------- */
  function order() {
    var rows = listRows();
    return rows.write.concat(rows.rest).map(function (x) { return x.a.id; });
  }
  function step(dir) {
    if (!commitOpen()) return;
    var ids = order(), cur = typeof dkPbAthleteId === 'function' ? dkPbAthleteId() : S.aid;
    if (!ids.length) return;
    var i = ids.indexOf(cur), j = i < 0 ? 0 : (i + dir + ids.length) % ids.length;
    openLifter(ids[j]);
  }
  // What a list row's click does, exactly once (no change event: #progAthlete's inline onchange would draw twice).
  // A day of a lifter's week, from their page (desk-day.js, The week): Programs on that lifter, that week, that day's card
  // in view (wi / di null: the week they're in, its top).
  function openDay(aid, wi, di) {
    if (typeof deskGo === 'function' && (typeof _dk === 'undefined' || _dk.screen !== 'programs')) deskGo('programs');
    openLifter(aid);
    var go = function () {
      var prog = progOf(aid);
      if (!prog || S.aid !== aid) return;
      if (wi != null && wi >= 0 && wi < (prog.weeks || []).length && S.wi !== wi) pickWeek(wi, false);
      if (di != null && di >= 0) jumpTo(di);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { requestAnimationFrame(go); }); else setTimeout(go, 30);
  }
  function openLifter(id) {
    closePop();
    var sel = document.getElementById('progAthlete');
    if (sel) sel.value = id;
    try { activeWeekIdx = 0; } catch (e) {}
    _dk.pbWk = null; _dk.pbInfo = null; _dk.pbSetsView = false; S.sug = null; S.adopted = null; S.pvDay = null;   // they open on the week they're in
    loadProgram();
    var t = document.querySelector('#dkPbList .dp-lrow[aria-current="true"]');
    if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- the list column: Lifters · Teams · Templates ---------- */
  function listRows() {
    var me = typeof _dkCoachMeId === 'function' ? _dkCoachMeId() : null;
    var rows = (_dk.rows || (typeof dkRowsFresh === 'function' ? dkRowsFresh() : []) || []).filter(function (r) { return r && r.athlete && (!me || r.athlete.coachId === me || !r.athlete.coachId); });
    var tw = {};
    try { if (window.CoachLifters && CoachLifters.toWriteOf) CoachLifters.toWriteOf(rows).forEach(function (w) { tw[w.r.athlete.id] = w.week; }); } catch (e) {}
    var out = { write: [], rest: [] };
    rows.forEach(function (r) {
      var prog = progOf(r.athlete.id), st = r.status || {};
      var endDay = '';
      try { var starts = prog ? dkPbStarts(prog) : []; var ls = starts[starts.length - 1]; if (ls) endDay = new Date(_addDaysISO(ls, 6) + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }); } catch (e) {}
      var nowIdx = null;
      try { if (prog && (prog.weeks || []).length) nowIdx = dkPbNow(prog, dkPbStarts(prog)).now; } catch (e) {}
      var s = listStatus({ prog: prog, week: st.week, reasons: r.reasons, live: !!r.live, toWrite: tw[r.athlete.id] || null, endDay: endDay, nowIdx: nowIdx });
      (s.write ? out.write : out.rest).push({ a: r.athlete, r: r, s: s });
    });
    var by = function (x, y) { return String(x.a.name).localeCompare(String(y.a.name)); };
    out.write.sort(by); out.rest.sort(by);
    return out;
  }
  function paintList(list) {
    var s = Store.get(), me = typeof _dkCoachMeId === 'function' ? _dkCoachMeId() : null;
    list.innerHTML = '';
    list.classList.add('dp-list');
    var sec = list.closest('section'); if (sec) sec.classList.add('dp-on');
    var head = E('div', { class: 'dk-list-head dp-list-head' });
    var tabs = E('div', { class: 'dp-tabs', role: 'tablist', 'aria-label': 'Programs' });
    var aths = (s.athletes || []).filter(function (a) { return a.coachId === me; });
    var teams = typeof dsTeams === 'function' ? dsTeams() : [];
    var tpls = (s.programTemplates || []).filter(function (t) { return t.coachId === me; });
    var mode = _dk.pbMode || 'athletes';
    [['athletes', 'Lifters', aths.length], ['teams', 'Teams', teams.length], ['templates', 'Templates', tpls.length]].forEach(function (x) {
      var on = mode === x[0];
      var b = E('button', { type: 'button', class: 'dp-tab' + (on ? ' on' : ''), role: 'tab', 'aria-selected': String(on) }, x[1], E('span', { class: 'dp-tab-n' }, x[2] ? String(x[2]) : ''));
      hold(b);
      b.addEventListener('click', function () {
        if (on) return;
        if (!commitOpen()) return;
        if (x[0] === 'teams') { if (typeof deskGo === 'function') deskGo('teams'); return; }
        _dk.pbMode = x[0]; loadProgram();
      });
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
    var sw = E('label', { class: 'dk-search dk-search-wide dp-search' });
    sw.insertAdjacentHTML('beforeend', DK_IC.search);
    var si = E('input', { type: 'search', placeholder: mode === 'templates' ? 'Search templates' : 'Search lifters', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false' });
    si.value = _dk.pbSearch || '';
    si.addEventListener('input', function () { _dk.pbSearch = si.value; dkPaintPbRows(list); });
    si.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); if (si.value) { si.value = ''; _dk.pbSearch = ''; dkPaintPbRows(list); } else si.blur(); } });
    sw.appendChild(si);
    head.appendChild(sw);
    list.appendChild(head);
    list.appendChild(E('div', { class: 'dk-lane dk-pb-rows dp-rows' }));
    // Templates: the desk's own rows (each template, and Bring a template in); Lifters: ours (dkPaintPbRows routes).
    if (typeof dkPaintPbRows === 'function') dkPaintPbRows(list); else paintRows(list);
  }
  function paintRows(list) {
    var box = list.querySelector('.dk-pb-rows');
    if (!box) return;
    box.innerHTML = '';
    var q = String(_dk.pbSearch || '').trim().toLowerCase();
    var cur = typeof dkPbAthleteId === 'function' ? dkPbAthleteId() : '';
    var R = listRows();
    var group = function (title, items) {
      items = items.filter(function (x) { return !q || String(x.a.name || '').toLowerCase().indexOf(q) >= 0; });
      if (!items.length) return;
      box.appendChild(E('div', { class: 'dp-lgrp', role: 'presentation' }, title, E('span', {}, String(items.length))));
      items.forEach(function (x) {
        var on = x.a.id === cur;
        var row = E('button', { type: 'button', class: 'dp-lrow' + (on ? ' is-sel' : '') + (x.s.text ? ' has-stat' : ''), 'aria-current': on ? 'true' : 'false' });
        row.appendChild(dkAv(x.a, 'is-sm'));
        var main = E('span', { class: 'dp-lmain' });
        main.appendChild(E('span', { class: 'dp-lname' }, x.a.name));
        // What's to write says it in ink on the second line; everyone else's block is there in grey.
        if (x.s.text) main.appendChild(E('span', { class: 'dp-lstat' + (x.s.write ? ' is-write' : '') + (/draft$/i.test(x.s.text) ? ' is-draft' : '') }, x.s.text));
        else main.appendChild(E('span', { class: 'dp-lline' }, x.s.line));
        row.appendChild(main);
        if (x.s.text) tip(row, x.s.line);
        row.setAttribute('aria-label', x.a.name + ', ' + x.s.line + (x.s.text ? ', ' + x.s.text : ''));
        hold(row);
        row.addEventListener('click', function () { if (on) return; if (!commitOpen()) return; openLifter(x.a.id); });
        box.appendChild(row);
      });
    };
    group('To write', R.write);
    group(R.write.length ? 'Everyone else' : 'Lifters', R.rest);
  }

  /* ---------- a lifter with no program ---------- */
  function empty(area, aid) {
    var a = athleteOf(aid) || { name: '' };
    var box = E('div', { class: 'dp-none' });
    var hd = E('div', { class: 'dp-none-head' });
    var row = typeof dkRow === 'function' ? dkRow(aid) : null;
    var face = typeof dkAv === 'function' ? dkAv(a) : E('span');
    face.classList.add('dp-face');
    hd.appendChild(face);
    hd.appendChild(E('h1', { class: 'dp-name' }, a.name || 'Lifter'));
    box.appendChild(hd);
    var ik = (Store.get().intakes || []).find(function (i) { return i.athleteId === aid && i.answers && i.submittedAt; });
    var said = ik && ik.answers ? [ik.answers.daysPerWeek ? ik.answers.daysPerWeek + ' days a week' : '', Number(ik.answers.sessionMinutes) > 0 ? ik.answers.sessionMinutes + ' min a session' : '', ik.answers.meet && ik.answers.meet.name ? ik.answers.meet.name : ''].filter(Boolean) : [];
    var card = E('div', { class: 'dp-none-card' });
    card.appendChild(E('h2', { class: 'dp-none-t' }, 'Write ' + first(a.name) + '’s first block'));
    card.appendChild(E('p', { class: 'dp-none-p' }, ik ? first(a.name) + '’s intake is in' + (said.length ? ': ' + said.join(' · ') : '') + '. Start a block, bring one you already wrote, or start from a template.' : 'No program for ' + first(a.name) + ' yet. Start a block, bring one you already wrote, or start from a template.'));
    var acts = E('div', { class: 'dp-none-acts' });
    acts.appendChild(dkBtn('Write a block', { primary: true, cls: 'dp-cta', onClick: function () { dkBlankBlock(aid); } }));
    var me = typeof _dkCoachMeId === 'function' ? _dkCoachMeId() : null;
    if ((Store.get().programTemplates || []).some(function (t) { return t.coachId === me; })) { var tb = dkBtn('Start from a template', { icon: IC.layers, cls: 'is-quiet dp-tool', onClick: function () { dkAssignTemplate([aid], tb); } }); acts.appendChild(tb); }
    acts.appendChild(dkBtn('Bring a block in', { cls: 'is-quiet dp-tool', onClick: function () { openSheetImport(aid); } }));
    if (typeof openGoalModal === 'function') acts.appendChild(dkBtn('Build from a goal', { cls: 'is-quiet dp-tool', onClick: function () { openGoalModal(aid); } }));
    card.appendChild(acts);
    box.appendChild(card);
    if (typeof dsTeamOf === 'function' && dsTeamOf(aid)) box.appendChild(E('p', { class: 'dp-note-line' }, first(a.name) + ' is on ' + (dsTeamOf(aid).name || 'a team') + ': the team’s next push writes ' + first(a.name) + '’s first block.'));
    area.appendChild(box);
  }
  /* ====================================================================================================
     THE TEAM ADAPTER: the Teams screen's program and every lifter's load (desk-season.js dsRenderTeams)
     ==================================================================================================== */
  // The team's week in the same cards (a day's head, the title rows, the lines on one grid, + Set, + Add exercise), written
  // once: a % of each lifter's max, or RPE. opts.bare: no head of its own (the Teams page draws the name, the weeks and
  // these tools in its own head: teamTools); opts.noLoads: no lifters' loads under each main lift (the page lists them as
  // rows under the week).
  function team(T, members, W, wi, opts) {
    opts = opts || {};
    S.team = T.id; S.teamWi = wi;
    var sec = E('div', { class: 'ds-sec dp-team' + (opts.bare ? ' is-bare' : ''), 'data-team': T.id });
    if (!opts.bare) {
      var hd = E('div', { class: 'dp-team-head' });
      hd.appendChild(E('h2', { class: 'dp-team-t' }, 'Week ' + (W.number || wi + 1) + ', the team’s program'));
      hd.appendChild(E('p', { class: 'dp-sub' }, 'Written once: a % of each lifter’s max, or RPE. Push gives it to everyone on their own loads; what you adjust for one stays theirs.'));
      hd.appendChild(teamTools(T, W, wi));
      sec.appendChild(hd);
    }
    var loads = typeof teamWeekLoads === 'function' ? teamWeekLoads(T.weeks, _tmKey(W, wi), members) : { cols: [], rows: [] };
    var env = { unit: unitTag(), show: showKg, team: true, nowIdx: -1 };
    var m = model(T.weeks, wi, env);
    var days = E('div', { class: 'dp-days' });
    var root = E('div', { class: 'dp is-team', 'data-wi': String(wi) });
    var wk = E('div', { class: 'dp-week' });
    m.days.forEach(function (d) {
      d.weekN = W.number || wi + 1;
      var D = W.days[d.idx];
      var card = E('article', { class: 'dp-day' + (d.rest ? ' is-rest' : ''), 'data-di': String(d.idx), 'data-day': d.key, 'aria-label': d.name || 'Day ' + (d.idx + 1) });
      var h = E('header', { class: 'dp-day-head' });
      var idw = E('div', { class: 'dp-day-id' });
      idw.appendChild(E('h3', { class: 'dp-day-title' }, d.name || 'Day ' + (d.idx + 1)));
      if (d.rest) idw.appendChild(badgeEl({ status: 'rest' }));
      h.appendChild(idw);
      if (!d.rest && d.sum.sets) h.appendChild(sumEl(d.sum, null));
      card.appendChild(h);
      if (d.rest) { card.appendChild(E('p', { class: 'dp-rest' }, 'No training. Recovery is part of the plan.')); days.appendChild(card); return; }
      if (d.exercises.length) card.appendChild(colsEl(false));
      d.exercises.forEach(function (x) {
        var blk = exEl(null, null, wi, d, x, env, { team: { T: T, W: W } });
        var dayId = _tmKey(D, d.idx), exId = _tmKey(D.exercises[x.idx], x.idx);
        var ci = loads.cols.findIndex(function (c) { return c.dayId === dayId && c.exId === exId; });
        if (!opts.noLoads && ci >= 0 && loads.rows.length) blk.appendChild(membersEl(T, members, W, wi, loads, ci));
        card.appendChild(blk);
      });
      card.appendChild(addExBtn({ team: { T: T, W: W }, wi: wi, di: d.idx, dayId: D.id, dayName: 'the team’s ' + (d.name || 'day'), dayKey: d.key }));
      days.appendChild(card);
    });
    if (!(W.days || []).length) wk.appendChild(E('p', { class: 'dp-note-line' }, 'Week ' + (W.number || wi + 1) + ' has no sessions yet.'));
    wk.appendChild(days);
    root.appendChild(wk);
    sec.appendChild(root);
    return sec;
  }
  // The team week's own tools: Progress the week (a step on for everyone, or add or remove a week) and undo.
  function teamTools(T, W, wi, o) {
    var tools = E('div', { class: 'dp-tools' });
    var wk = E('button', { type: 'button', class: 'dp-tool', 'aria-haspopup': 'menu', 'aria-label': 'Progress the week' });
    wk.insertAdjacentHTML('beforeend', IC.up);
    wk.appendChild(E('span', { class: 'dp-tool-l' }, o && o.short ? 'Progress' : 'Progress the week'));
    tip(wk, 'Week ' + (W.number || wi + 1) + ' a step on for everyone, or add a week');
    wk.addEventListener('click', function (e) {
      e.stopPropagation();
      var n = (T.weeks || []).length;
      dkPopMenu(wk, [
        { label: '+2.5% on % sets', hint: 'Squat, bench, deadlift', run: function () { teamRemember(T, 'Progress week ' + (W.number || wi + 1)); dsProgressMaster(T, wi, 'pct'); } },
        { label: '+0.5 RPE on RPE sets', hint: 'Up to @10', run: function () { teamRemember(T, 'Progress week ' + (W.number || wi + 1)); dsProgressMaster(T, wi, 'rpe'); } },
        '-',
        { label: 'Add week ' + (n + 1), hint: 'A copy of week ' + (W.number || wi + 1), run: function () { teamRemember(T, 'Add a week'); dsAddMasterWeek(T, wi); } },
        n > 1 ? { label: 'Remove week ' + (W.number || wi + 1), danger: true, run: function () { teamRemember(T, 'Remove a week'); dsRemoveMasterWeek(T, wi); } } : null
      ].filter(Boolean), { alignRight: true });
    });
    tools.appendChild(wk);
    var u = E('button', { type: 'button', class: 'dp-tool dp-undo', 'aria-label': 'Undo', html: IC.undo });
    var top = S.teamUndo.filter(function (x) { return x.id === T.id; }).pop();
    u.disabled = !top;
    tip(u, top ? 'Undo: ' + top.label : 'Nothing to undo', undoKey());
    u.addEventListener('click', teamUndo);
    tools.appendChild(u);
    return tools;
  }
  function teamExMenu(T, W, wi, d, x) {
    var base = { wi: wi, di: d.idx, ei: x.idx, exId: x.key }, items = [];
    items.push({ label: 'Add a set', hint: 'Like the last', run: function () { teamRun(T, Object.assign({ t: 'addSet', label: 'Add a set' }, base), null, 'last:' + x.key); } });
    items.push({ label: 'Add a line', hint: 'A back-off', run: function () { teamRun(T, Object.assign({ t: 'addGroup', label: 'Add a line' }, base), null, 'last:' + x.key); } });
    if (x.lines.length > 1) x.lines.forEach(function (ln) { items.push({ label: 'Remove ' + roleWord(ln.role).toLowerCase() + ' ' + ln.sets + ' × ' + ln.reps, run: function () { teamRun(T, Object.assign({ t: 'removeGroup', start: ln.start, sid: ln.sid, label: 'Remove a line' }, base)); } }); });
    items.push('-', { label: 'Remove from week ' + d.weekN, danger: true, run: function () { teamRun(T, Object.assign({ t: 'removeEx', label: 'Remove ' + x.title }, base)); } });
    return items;
  }
  // Under a main lift: every lifter's own load for its top line, a face and a number each (click to adjust one).
  function membersEl(T, members, W, wi, loads, ci) {
    var col = loads.cols[ci];
    var box = E('div', { class: 'dp-mems', role: 'list', 'aria-label': col.label + ': each lifter’s load' });
    loads.rows.forEach(function (row) {
      var c = row.cells[ci], mb = (members || []).find(function (m) { return m.athleteId === row.athleteId; }) || {};
      var b = E('button', { type: 'button', class: 'dp-mem' + (c.ovr ? ' is-own' : '') + (c.over ? ' is-over' : '') + (c.noMax ? ' is-nomax' : ''), role: 'listitem' });
      b.appendChild(dkAv({ name: row.name, avatarUrl: (athleteOf(row.athleteId) || {}).avatarUrl }, 'is-sm'));
      b.appendChild(E('span', { class: 'dp-mem-n' }, first(row.name), c.logged ? E('span', { class: 'dp-mem-lifted' }, ' · lifted') : null));
      var v = E('span', { class: 'dp-mem-v' });
      if (c.noMax) v.textContent = 'No max';
      else {
        var t = typeof teamLoadText === 'function' ? teamLoadText(c.kg, row.unit) : showKg(c.kg) + ' kg';
        v.textContent = (c.approx ? '≈' : '') + t;
      }
      b.appendChild(v);
      var why = c.noMax ? 'No ' + String(col.lift) + ' max yet: their load stays blank until one is set'
        : c.over ? 'The same load for everyone: above ' + first(row.name) + '’s max of ' + showKg(c.max) + '. Click to adjust it for them'
        : c.ovr ? 'Adjusted by you for ' + first(row.name) + '. A push asks before changing it'
        : c.approx ? col.rx + ' from their max of ' + showKg(c.max) + ' (RPE chart)' : col.pct != null ? col.pct + '% of ' + showKg(c.max) : 'As written';
      if (c.ovr) v.insertBefore(E('i', { class: 'dp-mem-own', 'aria-hidden': 'true' }), v.firstChild);
      b.setAttribute('aria-label', row.name + ', ' + col.label + ': ' + v.textContent + '. ' + why);
      tip(b, why + (c.logged ? ' · lifted' : c.noMax ? '' : ' · click to adjust'));
      if (!c.noMax) b.addEventListener('click', function () { editMember(T, mb, W, wi, col, c, b); });
      box.appendChild(b);
    });
    return box;
  }
  function editMember(T, mb, W, wi, col, c, btn) {
    var unitLb = mb.unit === 'lbs' || mb.unit === 'lb';
    var inp = E('input', { type: 'text', inputmode: 'decimal', class: 'dp-mem-in', 'aria-label': first(mb.name) + '’s ' + col.label + ' load in ' + (unitLb ? 'lb' : 'kg') });
    var cur = Number(c.kg) || 0;
    inp.value = cur > 0 ? String(unitLb ? Math.round(cur / KG_PER_LB * 10) / 10 : n2(cur)) : '';
    var v = btn.querySelector('.dp-mem-v');
    v.replaceWith(inp);
    inp.focus(); inp.select();
    var done = false;
    var finish = function (save) {
      if (done) return;
      done = true;
      var x = parseFloat(String(inp.value).replace(',', '.'));
      if (save && x > 0) { var kg = unitLb ? x * KG_PER_LB : x; if (Math.abs(kg - cur) >= 0.01 && typeof dsSetMemberLoad === 'function') { dsSetMemberLoad(T, mb, W, wi, col, c, kg); return; } }
      if (typeof dsRenderTeams === 'function') dsRenderTeams();
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); finish(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } });
    inp.addEventListener('blur', function () { finish(true); });
  }
  function wireTeam(inp, T, W, wi, d, x, ln) {
    var col = inp.getAttribute('data-col'), focusVal = null;
    inp.addEventListener('focus', function () { if (inp._edit != null && inp.value === inp._rest) inp.value = inp._edit; focusVal = inp.value; });
    var commit = function (want) {
      if (S.busy || !inp.isConnected) return true;
      if (inp.value === focusVal) return true;
      var op;
      if (col === 'w') {
        var parsed = inp.value.trim() ? dsParseMaster(inp.value.trim(), x.lift) : [];
        if (parsed == null) { bad(inp, 'Each part needs sets x reps, like 3x5 75% @8'); return false; }
        op = { t: 'sets', wi: wi, di: d.idx, ei: x.idx, exId: x.key, sets: parsed, label: x.title };
      } else {
        var plan = planCell(ln, col, inp.value, { unit: unitTag(), toKg: function (v) { return displayToKg(v); }, maxKg: 0, main: isMain(x.lift), team: true, cols: [] });
        if (plan.error) { bad(inp, plan.error); return false; }
        if (plan.none) { focusVal = inp.value; return true; }
        op = { t: plan.t, wi: wi, di: d.idx, ei: x.idx, exId: x.key, start: ln.start, sid: ln.sid, patch: plan.patch, to: plan.to, label: x.title + ', week ' + d.weekN };
      }
      inp.classList.remove('is-bad');
      focusVal = inp.value;
      teamRun(T, op, want);
      return true;
    };
    inp._commit = function () { return commit(null); };
    inp.addEventListener('blur', function (e) { var rt = e.relatedTarget; commit(rt && rt.getAttribute ? rt.getAttribute('data-k') : null); if (inp.isConnected && inp.value === inp._edit) inp.value = inp._rest; });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.shiftKey && col === 'f' && isLastLine(x, ln)) { if (commit(null) !== false) teamRun(T, { t: 'addGroup', wi: wi, di: d.idx, ei: x.idx, exId: x.key, label: 'Add a set' }, null, 'last:' + x.key); return; }
        var t = neighbour(inp, e.shiftKey ? -1 : 1); var k = t ? t.getAttribute('data-k') : null; if (commit(k) !== false && t && t.isConnected) { t.focus(); if (t.select) t.select(); }
      }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = focusVal; inp.blur(); }
      else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && col !== 'f' && col !== 'w') { var nv = stepCell(col, inp.value, e.key === 'ArrowUp' ? 1 : -1, { unit: unitTag(), rir: ln && ln.effort.rir }); if (nv != null) { e.preventDefault(); inp.value = nv; inp.select(); } }
    });
  }
  function teamRemember(T, label) {
    var t = (Store.get().teams || []).find(function (x) { return x.id === T.id; }) || T;
    S.teamUndo.push({ id: T.id, weeks: JSON.stringify(t.weeks || []), label: label || 'Edit' });
    if (S.teamUndo.length > 60) S.teamUndo.shift();
  }
  // A team edit: saved once with the team's compare-and-swap (desk-season.js dsEditMaster), then the page again, the coach
  // still in the cell they moved to (or the new line: after 'last:<exercise>', a new exercise: after 'enter:<exercise>').
  // Push then says who it reaches.
  function teamRun(T, op, want, after) {
    teamRemember(T, op.label);
    dsEditMaster(T.id, function (weeks) { return mutate(weeks, op, { team: true }) ? true : false; }, function () {
      if (typeof dsRenderTeams === 'function') dsRenderTeams();
      var host = document.getElementById('deskTeams');
      if (!host) return;
      var a = String(after || ''), exk = a.replace(/^(last|enter):/, '');
      if (/^last:/.test(a)) {
        var blk = host.querySelector('.dp-ex[data-ex="' + cssEsc(exk) + '"]'), rows = blk ? blk.querySelectorAll('.dp-line') : [];
        var lr = rows[rows.length - 1]; arrive(lr);
        var c = lr && lr.querySelector('.dp-cell.dp-n'); if (c) { c.focus({ preventScroll: true }); c.select(); }
        return;
      }
      if (/^enter:/.test(a)) arrive(host.querySelector('.dp-ex[data-ex="' + cssEsc(exk) + '"]'), -8);
      var t = want ? host.querySelector('[data-k="' + cssEsc(want) + '"]') : null;
      if (t) { t.focus({ preventScroll: true }); if (t.select) t.select(); }
    }).then(function (ok) { if (!ok) { var st = S.teamUndo; if (st.length && st[st.length - 1].id === T.id) st.pop(); } });
  }
  function teamUndo() {
    var id = S.team, st = S.teamUndo, i = -1;
    for (var j = st.length - 1; j >= 0; j--) if (st[j].id === id) { i = j; break; }
    if (i < 0) { say('Nothing to undo'); return; }
    var u = st.splice(i, 1)[0], old = JSON.parse(u.weeks);
    dsEditMaster(id, function (weeks) { weeks.splice.apply(weeks, [0, weeks.length].concat(old)); return true; }, function () { if (typeof dsRenderTeams === 'function') dsRenderTeams(); say('Undone: ' + u.label); });
  }

  window.DeskProgram = {
    // the desk
    head: head, body: body, empty: empty, paintList: paintList, paintRows: paintRows, order: order, step: step, openLifter: openLifter,
    focusExercise: focusExercise, publishWeek: publishWeek, writeWeekFor: doWriteWeek, writeThem: writeThem, commitOpen: commitOpen, team: team, teamTools: teamTools, teamUndo: teamUndo,
    pickWeek: pickWeek, state: function () { return S; }, preview: togglePreview, printWeek: printWeek, jumpTo: jumpTo, closePop: closePop, openDay: openDay, envFor: envFor,
    // pure, for tests
    model: model, exLines: exLines, roleOf: roleOf, loadCell: loadCell, effortCell: effortCell, liftedOf: liftedOf, gapCls: gapCls, setGap: setGap, weekState: weekState,
    parseLoadCell: parseLoadCell, parseEffortCell: parseEffortCell, fieldsPatch: fieldsPatch, planCell: planCell, stepCell: stepCell, typedLineSets: typedLineSets,
    refuse: refuse, mutate: mutate, writeSource: writeSource, writeWeek: writeWeek, appendWeeks: appendWeeks, keepDraftsTrailing: keepDraftsTrailing,
    listStatus: listStatus, crimson: crimson, pendingSuggestions: pendingSuggestions, seedAccessories: seedAccessories, isRest: isRest,
    liftedTone: liftedTone, dayMinutes: dayMinutes, daySummary: daySummary, weekEffort: weekEffort, stripModel: stripModel,
    pickerItems: pickerItems, pickerSearch: pickerSearch, splitTyped: splitTyped, normQ: normQ
  };
})();
