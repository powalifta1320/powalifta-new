/* block-dna.js: Block DNA and block review (2026-10-27).
   Every training block gets a fingerprint: week by week, the main lifts' working sets (written and done),
   the sessions, the top sets' RPE as written and as felt, and how heavy they were against the block's
   starting e1RM. For the whole block: adherence, sets a week per lift, each lift's e1RM from where it
   started to its best in the block, and the pain reports dated inside it. Two blocks compare as short
   plain sentences that say WHAT changed, never that a block caused anything.
   PURE (tests.html "block DNA (block-dna.js)"): blockDna, blockCompare, blockDefaultPair.
   DRAWING (below): BlockDNA.section(r) is the desk's Blocks section on an athlete's page,
   BlockDNA.open(aid) the blocks + compare (a modal on the desk, a sheet on the phone),
   BlockDNA.linkInfo(aid) what the coach's lifter page says beside its Blocks link.
   Data: Store.programBlocks (past blocks, kept by archiveProgramIfTrained; on a real account their weeks
   load on demand, DB.getProgramBlockWeeks), the current program, workoutLogs (e1rmComp), painReports. */
(function () {
  'use strict';
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var NAMES = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };

  /* =====================================================================================
     PURE
     ===================================================================================== */
  function isoDay(v) { var s = String(v == null ? '' : v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function monday(iso) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }
  function num(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function avg(list) { return list.length ? list.reduce(function (s, x) { return s + x; }, 0) / list.length : null; }
  function isMain(lift) { return LIFTS.indexOf(lift) >= 0; }
  function isComp(variant) { return !variant || variant === 'Competition'; }
  // What was written: the top of an RPE range (the app's rule: setOvershoot, deskWeekReview, the Effort tile).
  function writtenRpe(s) { var lo = num(s && s.rpe); if (lo == null) return null; var hi = num(s.rpeHi); return hi != null && hi > lo ? hi : lo; }
  function feltRpe(s) { return s && s.completed ? num(s.actualRpe) : null; }
  function reachedSet(s) { return !!(s && (s.completed || s.skipped || s.missed)); }
  function planLoad(s) { return num(s.plannedWeight != null ? s.plannedWeight : s.weight) || 0; }
  function logE1(l) { var v = num(l.e1rmComp); if (!(v > 0)) v = num(l.e1rm); return v > 0 ? v : 0; }
  function lifts(fn) { var o = {}; LIFTS.forEach(function (L) { o[L] = fn(L); }); return o; }

  // A lift's top set on one day: the heaviest set lifted (what the Effort tile reads); before anything is
  // lifted, the hardest set written (a top set picked by feel has no load yet), then the heaviest written.
  // Meet attempts and sets the lifter added on the day aren't candidates.
  function topSet(list) {
    var c = (list || []).filter(function (x) { return x && x.s && !x.s.attempt && !x.s.extra; });
    if (!c.length) return null;
    var lifted = c.filter(function (x) { return x.s.completed && num(x.s.weight) > 0; });
    if (lifted.length) return lifted.slice().sort(function (a, b) { return num(b.s.weight) - num(a.s.weight) || (writtenRpe(b.s) || 0) - (writtenRpe(a.s) || 0); })[0];
    var rated = c.filter(function (x) { return writtenRpe(x.s) != null; });
    if (rated.length) return rated.slice().sort(function (a, b) { return writtenRpe(b.s) - writtenRpe(a.s) || planLoad(b.s) - planLoad(a.s); })[0];
    return c.slice().sort(function (a, b) { return planLoad(b.s) - planLoad(a.s); })[0];
  }

  // The block's own weeks: per day what was written and what happened, per lift its sets and top set.
  function readWeeks(weeks) {
    return weeks.map(function (w, wi) {
      var days = (w.days || []).map(function (d) {
        var sets = lifts(function () { return { planned: 0, done: 0 }; });
        var by = lifts(function () { return []; });
        var written = false, reached = false, done = false;
        (d.exercises || []).forEach(function (e) {
          (e.sets || []).forEach(function (s) {
            if (!s) return;
            if (!s.extra) written = true;
            if (reachedSet(s)) reached = true;
            if (s.completed) done = true;
            if (!isMain(e.lift)) return;
            if (!s.extra) sets[e.lift].planned++;
            if (s.completed) sets[e.lift].done++;
            by[e.lift].push({ s: s, ex: e });
          });
        });
        var tops = [];
        LIFTS.forEach(function (L) {
          var t = topSet(by[L]);
          if (!t) return;
          tops.push({ lift: L, written: writtenRpe(t.s), felt: feltRpe(t.s), weight: t.s.completed ? num(t.s.weight) || 0 : 0, comp: isComp(t.ex.variant) });
        });
        return { session: written, reached: reached, done: done, sets: sets, tops: tops };
      });
      return { n: Number(w.number) || wi + 1, days: days };
    });
  }

  // e1RM per lift: the best in the 8 weeks before the block began (where it started) against the best in it
  // (blockAchieved's rule, with the block's own end, so a past block never reads a later block's sets).
  function e1rmOf(logs, start, end) {
    var out = lifts(function () { return { start: null, end: null, delta: null }; });
    out.total = { start: null, end: null, delta: null };
    if (!start || !end) return out;
    var from = addDays(start, -56), before = addDays(start, -1);
    LIFTS.forEach(function (L) {
      var b = 0, n = 0;
      logs.forEach(function (l) {
        if (l.lift !== L) return;
        var v = logE1(l);
        if (l.date >= from && l.date <= before) b = Math.max(b, v);
        else if (l.date >= start && l.date <= end) n = Math.max(n, v);
      });
      out[L] = { start: b > 0 ? r1(b) : null, end: n > 0 ? r1(n) : null, delta: b > 0 && n > 0 ? r1(n - b) : null };
    });
    if (LIFTS.every(function (L) { return out[L].start != null && out[L].end != null; })) {
      var ts = LIFTS.reduce(function (s, L) { return s + out[L].start; }, 0), te = LIFTS.reduce(function (s, L) { return s + out[L].end; }, 0);
      out.total = { start: r1(ts), end: r1(te), delta: r1(te - ts) };
    }
    return out;
  }

  // blockDna(block, ctx): a past block (Store.programBlocks) or the program running now.
  // ctx: { athleteId, logs (workoutLogs), painReports, today, current (true for the running program; inferred:
  //        a program has no endedOn) }.
  // → { id, name, current, source: 'weeks' | 'logs', dates: { start, end },
  //     weeks: [{ n, sets: { squat: { planned, done }, bench, deadlift }, done, planned, due, rpeWritten, rpeFelt, pct }],
  //     totals: { sessionsDone, sessionsPlanned, sessionsWritten, adherence, setsByLift: { squat: { planned, done, perWeek } … },
  //               rpe: { written, felt, drift, n } },
  //     e1rm: { squat: { start, end, delta }, bench, deadlift, total }, pain, weeksTotal, fullWeeks }
  // Sessions "planned" are the ones that came round: everything up to the last session they logged (or
  // skipped), so a block still running, or replaced halfway, isn't charged for weeks it never reached.
  // week.planned is the whole plan; week.due the sessions that came round. Sets a week per lift count the
  // weeks that lift came round in (a lift whose day hasn't come yet this week isn't a zero).
  function blockDna(block, ctx) {
    ctx = ctx || {};
    block = block || {};
    var aid = ctx.athleteId || block.athleteId || null;
    var today = isoDay(ctx.today) || todayIso();
    var current = ctx.current != null ? !!ctx.current : !('endedOn' in block);
    var logs = (ctx.logs || []).filter(function (l) { return l && (!aid || l.athleteId === aid) && isMain(l.lift) && isoDay(l.date); })
      .map(function (l) { return Object.assign({}, l, { date: isoDay(l.date) }); });
    var weeksIn = Array.isArray(block.weeks) ? block.weeks : null;
    var dna = { id: block.id || null, name: block.name || (current ? 'This block' : 'Block'), current: current, source: weeksIn ? 'weeks' : 'logs',
      dates: { start: null, end: null }, weeks: [], weeksTotal: 0, fullWeeks: 0, pain: 0,
      totals: { sessionsDone: 0, sessionsPlanned: null, sessionsWritten: null, adherence: null, setsByLift: lifts(function () { return { planned: null, done: 0, perWeek: null }; }), rpe: { written: null, felt: null, drift: null, n: 0 } },
      e1rm: e1rmOf([], null, null) };

    // ---- the dates ----
    var dates = [];
    (weeksIn || []).forEach(function (w) { (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) {
      var c = s && s.completed ? isoDay(s.completedAt) : null;
      if (c) dates.push(c);
    }); }); }); });
    dates.sort();
    var start, end;
    if (current) {
      start = (typeof programStartsOn === 'function' ? isoDay(programStartsOn(block, today)) : null) || (dates[0] ? monday(dates[0]) : null);
      var open = (weeksIn || []).some(function (w) { return (w.days || []).some(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).some(function (s) { return s && !reachedSet(s) && !s.extra; }); }); }); });
      end = !open && dates.length ? dates[dates.length - 1] : today;
      if (start && end < start) end = start;
    } else {
      start = isoDay(block.startedOn) || dates[0] || null;
      end = isoDay(block.endedOn) || dates[dates.length - 1] || start;
    }
    dna.dates = { start: start || null, end: start ? end : null };
    dna.e1rm = e1rmOf(logs, start, start ? end : null);
    var startE1 = lifts(function (L) { return dna.e1rm[L].start; });
    var pctOf = function (tops) {
      var p = tops.filter(function (t) { return t.weight > 0 && t.comp && startE1[t.lift] > 0; }).map(function (t) { return t.weight / startE1[t.lift] * 100; });
      return p.length ? r1(avg(p)) : null;
    };
    dna.pain = start ? (ctx.painReports || []).filter(function (p) {
      var d = p && isoDay(p.day);
      return d && (!aid || p.athleteId === aid) && d >= start && d <= end;
    }).length : 0;

    // ---- week by week, from the block's own weeks ----
    if (weeksIn) {
      var rows = readWeeks(weeksIn);
      var fw = -1, fd = -1;
      rows.forEach(function (w, wi) { w.days.forEach(function (d, di) { if (d.reached) { fw = wi; fd = di; } }); });
      var due = function (wi, di) { return wi < fw || (wi === fw && di <= fd); };
      var pairs = [], perLift = lifts(function () { return { done: 0, planned: 0, weeks: 0 }; });
      dna.weeks = rows.map(function (w, wi) {
        var sess = w.days.filter(function (d) { return d.session; });
        var wk = { n: w.n, sets: lifts(function () { return { planned: 0, done: 0 }; }), done: 0, planned: sess.length, due: 0, rpeWritten: null, rpeFelt: null, pct: null };
        var dueN = 0, tops = [];
        w.days.forEach(function (d, di) {
          if (d.session && due(wi, di)) dueN++;
          if (d.done) wk.done++;
          LIFTS.forEach(function (L) { wk.sets[L].planned += d.sets[L].planned; wk.sets[L].done += d.sets[L].done; });
          d.tops.forEach(function (t) { tops.push(t); if (t.written != null && t.felt != null) pairs.push(t); });
        });
        wk.due = dueN;
        var frac = wk.planned ? dueN / wk.planned : 0;
        LIFTS.forEach(function (L) {
          var pl = wk.sets[L].planned, onDue = 0;
          w.days.forEach(function (d, di) { if (due(wi, di)) onDue += d.sets[L].planned; });
          perLift[L].done += wk.sets[L].done;
          perLift[L].planned += onDue;
          perLift[L].weeks += pl > 0 ? onDue / pl : (wk.sets[L].done > 0 ? 1 : frac);
        });
        var wr = tops.filter(function (t) { return t.written != null; }).map(function (t) { return t.written; });
        var fe = tops.filter(function (t) { return t.felt != null; }).map(function (t) { return t.felt; });
        wk.rpeWritten = wr.length ? r2(avg(wr)) : null;
        wk.rpeFelt = fe.length ? r2(avg(fe)) : null;
        wk.pct = pctOf(tops);
        return wk;
      });
      var T = dna.totals;
      T.sessionsDone = dna.weeks.reduce(function (s, w) { return s + w.done; }, 0);
      T.sessionsPlanned = dna.weeks.reduce(function (s, w) { return s + w.due; }, 0);
      T.sessionsWritten = dna.weeks.reduce(function (s, w) { return s + w.planned; }, 0);
      T.adherence = T.sessionsPlanned ? r2(Math.min(1, T.sessionsDone / T.sessionsPlanned)) : null;
      LIFTS.forEach(function (L) {
        var x = perLift[L];
        T.setsByLift[L] = { planned: x.planned, done: x.done, perWeek: x.weeks > 0 ? r1(x.done / x.weeks) : null };
      });
      if (pairs.length) {
        var wa = avg(pairs.map(function (t) { return t.written; })), fa = avg(pairs.map(function (t) { return t.felt; }));
        T.rpe = { written: r2(wa), felt: r2(fa), drift: r2(fa - wa), n: pairs.length };
      }
      dna.weeksTotal = dna.weeks.length;
      dna.fullWeeks = dna.weeks.filter(function (w) { return w.planned > 0 && w.due === w.planned; }).length;
      return dna;
    }

    // ---- no weeks (a real account's list carries a block's stats only until it's opened): from the log ----
    if (!start) return dna;
    var inBlock = logs.filter(function (l) { return l.date >= start && l.date <= end; });
    var feltAll = [];
    for (var m = monday(start); m <= end; m = addDays(m, 7)) {
      var wl = inBlock.filter(function (l) { return l.date >= m && l.date <= addDays(m, 6); });
      var wk = { n: dna.weeks.length + 1, sets: lifts(function (L) { return { planned: null, done: wl.filter(function (l) { return l.lift === L; }).length }; }),
        done: Object.keys(wl.reduce(function (o, l) { o[l.date] = 1; return o; }, {})).length, planned: null, due: null, rpeWritten: null, rpeFelt: null, pct: null };
      var tops = [];
      Object.keys(wl.reduce(function (o, l) { o[l.date + '|' + l.lift] = 1; return o; }, {})).forEach(function (k) {
        var same = wl.filter(function (l) { return l.date + '|' + l.lift === k; }).sort(function (a, b) { return (num(b.weight) || 0) - (num(a.weight) || 0); });
        var t = same[0];
        tops.push({ lift: t.lift, written: null, felt: num(t.rpe), weight: num(t.weight) || 0, comp: isComp(t.variant) });
      });
      var fe = tops.filter(function (t) { return t.felt != null; }).map(function (t) { return t.felt; });
      wk.rpeFelt = fe.length ? r2(avg(fe)) : null;
      feltAll = feltAll.concat(fe);
      wk.pct = pctOf(tops);
      dna.weeks.push(wk);
    }
    dna.totals.sessionsDone = dna.weeks.reduce(function (s, w) { return s + w.done; }, 0);
    LIFTS.forEach(function (L) {
      var d = dna.weeks.reduce(function (s, w) { return s + w.sets[L].done; }, 0);
      dna.totals.setsByLift[L] = { planned: null, done: d, perWeek: dna.weeks.length ? r1(d / dna.weeks.length) : null };
    });
    if (feltAll.length) dna.totals.rpe = { written: null, felt: r2(avg(feltAll)), drift: null, n: 0 };
    dna.weeksTotal = dna.weeks.length;
    dna.fullWeeks = dna.weeks.length;
    return dna;
  }

  // The pair Compare opens on: the two newest blocks with a full week behind them (a block that has only
  // just begun waits until it has one), else the two newest with something logged, else the two newest.
  // list: DNAs, newest first. → [newer, older] | null
  function blockDefaultPair(list) {
    list = (list || []).filter(Boolean);
    var full = list.filter(function (d) { return d.fullWeeks >= 1 && d.totals.sessionsDone > 0; });
    if (full.length >= 2) return [full[0], full[1]];
    var any = list.filter(function (d) { return d.totals.sessionsDone > 0; });
    if (any.length >= 2) return [any[0], any[1]];
    return list.length >= 2 ? [list[0], list[1]] : null;
  }

  // blockCompare(a, b, opts): how block a differs from block b (a is usually the newer), as the facts a coach
  // decides on. Every sentence says what changed, and only that: never why. opts: { unit: 'kg' | 'lbs' }.
  // → { a: { id, name, current }, b, unit, rows: [{ key, label, lift?, a: { text, sub? }, b: { text, sub? }, text }] }
  function blockCompare(a, b, opts) {
    opts = opts || {};
    a = a || blockDna({}, {}); b = b || blockDna({}, {});
    var unit = opts.unit || (typeof unitLabel === 'function' ? unitLabel() : 'kg');
    var lbs = /^lb/i.test(unit);
    var show = function (kg) { return Math.round(lbs ? kg / 0.45359237 : kg); };
    var signed = function (kg) { var v = show(kg); return v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '±0'; };
    var moved = function (what, kg) { var v = show(kg); return v === 0 ? what + ' held' : what + (v > 0 ? ' rose ' : ' fell ') + Math.abs(v) + ' ' + unit; };
    var dec = function (v) { var x = Math.round(v * 10) / 10; return x % 1 ? x.toFixed(1) : String(x); };
    var setsWk = function (v) { return dec(v) + (Math.round(v * 10) / 10 === 1 ? ' set' : ' sets') + ' a week'; };
    var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
    var aName = a.name || 'This block', bName = b.name || 'the other block';
    var soFar = a.current ? ' so far' : '';
    var rows = [];

    // Sessions
    var A = a.totals, B = b.totals;
    if (A.adherence != null || B.adherence != null) {
      var cell = function (t) { return t.adherence == null ? { text: '–' } : { text: t.sessionsDone + ' of ' + t.sessionsPlanned, sub: Math.round(t.adherence * 100) + '%' }; };
      var st;
      if (A.adherence == null || B.adherence == null) st = (A.adherence == null ? aName : bName) + ' has no sessions to count yet.';
      else {
        var pa = Math.round(A.adherence * 100), pb = Math.round(B.adherence * 100);
        st = pa === pb ? 'Adherence was the same' + soFar + ': ' + pa + '% of sessions.'
          : 'Adherence was ' + (pa > pb ? 'higher' : 'lower') + soFar + ': ' + pa + '% of sessions, against ' + pb + '%.';
      }
      rows.push({ key: 'sessions', label: 'Sessions', a: cell(A), b: cell(B), text: st });
    }

    // Effort: top sets, felt against written
    var da = A.rpe.drift, db = B.rpe.drift;
    if (da != null || db != null) {
      var feel = function (d) { var v = Math.round(d * 10) / 10; return Math.abs(d) < 0.25 ? 'as written' : dec(Math.abs(v)) + ' RPE ' + (v > 0 ? 'harder' : 'easier') + ' than written'; };
      var ecell = function (r) { return r.drift == null ? { text: '–' } : { text: Math.abs(r.drift) < 0.25 ? 'As written' : (r.drift > 0 ? '+' : '−') + dec(Math.abs(Math.round(r.drift * 10) / 10)), sub: 'wrote ' + dec(r.written) }; };
      var et;
      if (da == null) et = 'No top sets logged against a written RPE in ' + aName + (a.current ? ' yet.' : '.');
      else if (db == null) et = 'Top sets ' + (a.current ? 'have felt ' : 'felt ') + feel(da) + soFar + '; ' + bName + ' has none logged against a written RPE.';
      else if (feel(da) === feel(db)) et = 'Top sets ' + (a.current ? 'have felt ' : 'felt ') + feel(da) + ' in both blocks.';
      else et = 'Top sets ' + (a.current ? 'have felt ' : 'felt ') + feel(da) + soFar + '; in ' + bName + ' they felt ' + feel(db) + '.';
      rows.push({ key: 'effort', label: 'Felt vs written', a: ecell(A.rpe), b: ecell(B.rpe), text: et });
    }

    // Each lift: sets a week, and its e1RM from start to best
    LIFTS.forEach(function (L) {
      var Ln = NAMES[L], ln = Ln.toLowerCase();
      var va = A.setsByLift[L].perWeek, vb = B.setsByLift[L].perWeek, ea = a.e1rm[L].delta, eb = b.e1rm[L].delta;
      if (va == null && vb == null && ea == null && eb == null) return;
      var vol = null;
      if (va != null && vb != null && vb > 0) {
        var pct = Math.round((va - vb) / vb * 100);
        vol = Math.abs(pct) < 5 ? Ln + ' volume held at ' + setsWk(va) + soFar : Ln + ' volume was ' + Math.abs(pct) + '% ' + (pct > 0 ? 'higher' : 'lower') + soFar;
      } else if (va != null && va > 0) vol = Ln + ' volume was ' + setsWk(va) + soFar + ', against none in ' + bName;
      else if (vb != null && vb > 0) vol = 'No ' + ln + ' sets ' + (a.current ? 'logged in ' + aName + ' yet' : 'were done in ' + aName);
      var e = ea != null ? moved(ln + ' e1RM', ea) + soFar + (eb != null ? ' (' + signed(eb) + ' ' + unit + ' in ' + bName + ')' : '') : null;
      var parts = [vol, e].filter(Boolean);
      if (!parts.length) return;
      var lcell = function (v, d) { return { text: (v == null ? '–' : dec(v)) + (v == null ? '' : ' sets'), sub: d == null ? null : 'e1RM ' + signed(d) }; };
      rows.push({ key: L, lift: L, label: Ln, a: lcell(va, ea), b: lcell(vb, eb), text: cap(parts.join('; ')) + '.' });
    });

    // The total
    var ta = a.e1rm.total.delta, tb = b.e1rm.total.delta;
    if (ta != null || tb != null) {
      var tt = ta != null ? moved('Total e1RM', ta) + soFar + (tb != null ? ' (' + signed(tb) + ' ' + unit + ' in ' + bName + ')' : '') + '.'
        : 'Total e1RM needs all three lifts logged in ' + aName + '.';
      var tcell = function (d) { return { text: d == null ? '–' : signed(d) + ' ' + unit }; };
      rows.push({ key: 'total', label: 'Total e1RM', a: tcell(ta), b: tcell(tb), text: tt });
    }

    // Pain reports dated inside each block
    var pa2 = a.pain || 0, pb2 = b.pain || 0;
    var reports = function (n) { return n + (n === 1 ? ' pain report' : ' pain reports'); };
    var pt = !pa2 && !pb2 ? 'No pain reports in either block.'
      : pa2 === pb2 ? reports(pa2) + ' in each block.'
      : (pa2 ? reports(pa2) : 'No pain reports') + soFar + ', against ' + (pb2 || 'none') + ' in ' + bName + '.';
    var pcell = function (n) { return { text: n ? String(n) : 'None' }; };
    rows.push({ key: 'pain', label: 'Pain reports', a: pcell(pa2), b: pcell(pb2), text: pt });

    return { a: { id: a.id, name: aName, current: !!a.current, dates: a.dates }, b: { id: b.id, name: bName, current: !!b.current, dates: b.dates }, unit: unit, rows: rows };
  }

  var api = { blockDna: blockDna, blockCompare: blockCompare, blockDefaultPair: blockDefaultPair, LIFTS: LIFTS };
  window.BlockDNA = api;
  window.blockDna = blockDna;
  window.blockCompare = blockCompare;
  window.blockDefaultPair = blockDefaultPair;
})();
