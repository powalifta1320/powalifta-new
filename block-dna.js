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
  //        a program has no endedOn), after (the day the block before it ended: a running block begins after it,
  //        so a set or a pain report on the day they overlap is never counted twice) }.
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
      // Where the calendar puts week 1 (programStartsOn moves it on for a lifter running behind), but never after
      // the first set they logged in it: everything lifted in the block counts.
      start = (typeof programStartsOn === 'function' ? isoDay(programStartsOn(block, today)) : null) || (dates[0] ? monday(dates[0]) : null);
      if (start && dates[0] && dates[0] < start) start = dates[0];
      var open = (weeksIn || []).some(function (w) { return (w.days || []).some(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).some(function (s) { return s && !reachedSet(s) && !s.extra; }); }); }); });
      end = !open && dates.length ? dates[dates.length - 1] : today;
      var after = isoDay(ctx.after);
      if (start && after && start <= after) start = addDays(after, 1);
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
        T.setsByLift[L] = { planned: x.planned, done: x.done, perWeek: x.weeks > 0 ? r2(x.done / x.weeks) : null };
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
    // Weeks of seven days from the block's first day: a block keeps its own rhythm, whatever day it began on.
    for (var m = start; m <= end; m = addDays(m, 7)) {
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
      dna.totals.setsByLift[L] = { planned: null, done: d, perWeek: dna.weeks.length ? r2(d / dna.weeks.length) : null };
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
  // decides on. Every sentence says what changed, and only that: never why. A block still running reads in the
  // present ("is 33% lower so far"). opts: { unit: 'kg' | 'lbs' }.
  // → { a: { id, name, current, dates }, b, unit, rows: [{ key, label, lift?, a: { text, sub? }, b: { text, sub? }, text }] }
  function blockCompare(a, b, opts) {
    opts = opts || {};
    a = a || blockDna({}, {}); b = b || blockDna({}, {});
    var unit = opts.unit || (typeof unitLabel === 'function' ? unitLabel() : 'kg');
    var lbs = /^lb/i.test(unit);
    var show = function (kg) { return Math.round(lbs ? kg / 0.45359237 : kg); };
    var signed = function (kg) { var v = show(kg); return v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '±0'; };
    var dec = function (v) { var x = Math.round(v * 10) / 10; return x % 1 ? x.toFixed(1) : String(x); };
    var setsWk = function (v) { return dec(v) + (Math.round(v * 10) / 10 === 1 ? ' set' : ' sets') + ' a week'; };
    var cap = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
    var aName = a.name || 'This block', bName = b.name || 'the other block';
    var now = !!a.current, soFar = now ? ' so far' : '';
    var was = now ? ' is' : ' was';
    // An e1RM change in words: "rose 6 kg" (a finished block), "is up 3 kg" (one still running).
    var moved = function (what, kg) {
      var v = show(kg);
      if (now) return what + (v === 0 ? ' is level' : (v > 0 ? ' is up ' : ' is down ') + Math.abs(v) + ' ' + unit);
      return what + (v === 0 ? ' held' : (v > 0 ? ' rose ' : ' fell ') + Math.abs(v) + ' ' + unit);
    };
    var inB = function (kg) { return ' (' + signed(kg) + ' ' + unit + ' in ' + bName + ')'; };
    var rows = [];

    // Sessions: done against the ones that came round
    var A = a.totals, B = b.totals;
    if (A.adherence != null || B.adherence != null) {
      var cell = function (t) { return t.adherence == null ? { text: '–' } : { text: t.sessionsDone + ' of ' + t.sessionsPlanned, sub: Math.round(t.adherence * 100) + '%' }; };
      var st;
      if (A.adherence == null || B.adherence == null) st = (A.adherence == null ? aName : bName) + ' has no sessions to count yet.';
      else {
        var pa = Math.round(A.adherence * 100), pb = Math.round(B.adherence * 100);
        st = pa === pb ? 'Adherence' + was + ' the same' + soFar + ': ' + pa + '% of sessions.'
          : 'Adherence' + was + ' ' + (pa > pb ? 'higher' : 'lower') + soFar + ': ' + pa + '% of sessions, against ' + pb + '%.';
      }
      rows.push({ key: 'sessions', label: 'Sessions', a: cell(A), b: cell(B), text: st });
    }

    // Effort: top sets, felt against written
    var da = A.rpe.drift, db = B.rpe.drift;
    if (da != null || db != null) {
      var feel = function (d) { var v = Math.round(d * 10) / 10; return Math.abs(d) < 0.25 ? 'as written' : dec(Math.abs(v)) + ' RPE ' + (v > 0 ? 'harder' : 'easier') + ' than written'; };
      var ecell = function (r) { return r.drift == null ? { text: '–' } : { text: Math.abs(r.drift) < 0.25 ? 'As written' : (r.drift > 0 ? '+' : '−') + dec(Math.abs(Math.round(r.drift * 10) / 10)), sub: 'wrote ' + dec(r.written) }; };
      var felt = now ? 'have felt ' : 'felt ';
      var et;
      if (da == null) et = 'No top sets logged against a written RPE in ' + aName + (now ? ' yet.' : '.');
      else if (db == null) et = 'Top sets ' + felt + feel(da) + soFar + '; ' + bName + ' has none logged against a written RPE.';
      else if (feel(da) === feel(db)) et = 'Top sets ' + felt + feel(da) + ' in both blocks.';
      else et = 'Top sets ' + felt + feel(da) + soFar + '; in ' + bName + ' they felt ' + feel(db) + '.';
      rows.push({ key: 'effort', label: 'Felt vs written', a: ecell(A.rpe), b: ecell(B.rpe), text: et });
    }

    // Each lift: sets a week, then its e1RM from where it started to its best
    LIFTS.forEach(function (L) {
      var Ln = NAMES[L], ln = Ln.toLowerCase();
      var va = A.setsByLift[L].perWeek, vb = B.setsByLift[L].perWeek, ea = a.e1rm[L].delta, eb = b.e1rm[L].delta;
      if (va == null && vb == null && ea == null && eb == null) return;
      var vol = null;
      if (va != null && vb != null && vb > 0) {
        var pct = Math.round((va - vb) / vb * 100);
        vol = Math.abs(pct) < 5 ? Ln + ' volume' + (now ? ' is holding at ' : ' held at ') + setsWk(va)
          : Ln + ' volume' + was + ' ' + Math.abs(pct) + '% ' + (pct > 0 ? 'higher' : 'lower') + soFar;
      } else if (va != null && va > 0) vol = Ln + ' volume' + was + ' ' + setsWk(va) + soFar + ', against none in ' + bName;
      else if (vb != null && vb > 0) vol = 'No ' + ln + ' sets ' + (now ? 'logged in ' + aName + ' yet' : 'were done in ' + aName);
      var e = ea != null ? moved(ln + ' e1RM', ea) + (eb != null ? inB(eb) : '') : null;
      var parts = [vol, e].filter(Boolean);
      if (!parts.length) return;
      var lcell = function (v, d) { return { text: v == null ? '–' : dec(v) + (Math.round(v * 10) / 10 === 1 ? ' set' : ' sets'), sub: d == null ? null : 'e1RM ' + signed(d) }; };
      rows.push({ key: L, lift: L, label: Ln, a: lcell(va, ea), b: lcell(vb, eb), text: cap(parts.join('; ')) + '.' });
    });

    // The total
    var ta = a.e1rm.total.delta, tb = b.e1rm.total.delta;
    if (ta != null || tb != null) {
      var tt = ta != null ? moved('Total e1RM', ta) + soFar + (tb != null ? inB(tb) : '') + '.'
        : 'Total e1RM needs all three lifts logged in ' + aName + '.';
      var tcell = function (d) { return { text: d == null ? '–' : signed(d) + ' ' + unit }; };
      rows.push({ key: 'total', label: 'Total e1RM', a: tcell(ta), b: tcell(tb), text: tt });
    }

    // Pain reports dated inside each block
    var pa2 = a.pain || 0, pb2 = b.pain || 0;
    var reports = function (n) { return n + (n === 1 ? ' pain report' : ' pain reports'); };
    var pt = !pa2 && !pb2 ? 'No pain reports in either block' + soFar + '.'
      : pa2 === pb2 ? reports(pa2) + ' in each block' + soFar + '.'
      : (pa2 ? reports(pa2) : 'No pain reports') + soFar + ', against ' + (pb2 || 'none') + ' in ' + bName + '.';
    var pcell = function (n) { return { text: n ? String(n) : 'None' }; };
    rows.push({ key: 'pain', label: 'Pain reports', a: pcell(pa2), b: pcell(pb2), text: pt });

    return { a: { id: a.id, name: aName, current: now, dates: a.dates }, b: { id: b.id, name: bName, current: !!b.current, dates: b.dates }, unit: unit, rows: rows };
  }

  /* =====================================================================================
     DRAWING: the fingerprint (inline SVG at its real size: 2 px gaps, thin marks, ringed end dots), a block's
     row, the desk's Blocks section, and the blocks + compare (a modal on the desk, a sheet on the phone).
     Colour has one job each: the lifts own their bars (a 10% wash is what was written, the solid part what was
     done), the RPE lines are ink (felt) and grey ink (written), text is never a series colour, and only a
     falling e1RM wears the warning tone. Nothing here writes anything: the demo stays write-safe.
     ===================================================================================== */
  var CLS = { squat: 'l-sq', bench: 'l-be', deadlift: 'l-dl' };
  var GEO = {
    sm: { bw: 4, gi: 2, gw: 6, bh: 26, sg: 6, sh: 20, lab: 0 },
    md: { bw: 8, gi: 2, gw: 14, bh: 48, sg: 10, sh: 26, lab: 18 }
  };
  var IC = {
    cmp: '<path d="M4 20V10M9 20V4M15 20v-7M20 20V8"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>'
  };
  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function reducedMotion() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function unitNow() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function kgShow(kg) { return typeof kgToDisplay === 'function' ? kgToDisplay(kg) : kg; }
  function dec1(v) { var x = Math.round(v * 10) / 10; return x % 1 ? x.toFixed(1) : String(x); }
  function signedTxt(v) { return v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '±0'; }
  function storeNow() { return (window.Store && Store.get()) || {}; }
  function athleteOf(aid) { return (storeNow().athletes || []).find(function (a) { return a.id === aid; }) || { id: aid, name: 'Lifter' }; }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || 'them'; }
  function dayText(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00'), o = { month: 'short', day: 'numeric' };
    if (iso.slice(0, 4) !== todayIso().slice(0, 4)) o.year = 'numeric';
    return d.toLocaleDateString(undefined, o);
  }
  function rangeText(dates) { return dates && dates.start ? dayText(dates.start) + (dates.end && dates.end !== dates.start ? ' – ' + dayText(dates.end) : '') : ''; }
  function weeksText(n) { return n + (n === 1 ? ' week' : ' weeks'); }

  // An athlete's blocks, newest first: the one running now (when there is one), then every block kept.
  // → [{ kind: 'now' | 'past', block, dna }]
  function listFor(aid) {
    var s = storeNow(), ctx = { athleteId: aid, logs: s.workoutLogs || [], painReports: s.painReports || [], today: todayIso() };
    var past = (s.programBlocks || []).filter(function (b) { return b && b.athleteId === aid; })
      .sort(function (x, y) { return String(y.endedOn || y.createdAt || '').localeCompare(String(x.endedOn || x.createdAt || '')); });
    var prog = (s.programs || []).find(function (p) { return p.athleteId === aid; }) || null;
    var out = [];
    if (prog && (prog.weeks || []).length) out.push({ kind: 'now', block: prog, dna: blockDna(prog, Object.assign({ current: true, after: past[0] ? isoDay(past[0].endedOn) : null }, ctx)) });
    past.forEach(function (b) { out.push({ kind: 'past', block: b, dna: blockDna(b, Object.assign({ current: false }, ctx)) }); });
    return out;
  }
  function maxSets(dnas) {
    var m = 0;
    dnas.forEach(function (d) { d.weeks.forEach(function (w) { LIFTS.forEach(function (L) { m = Math.max(m, w.sets[L].planned || 0, w.sets[L].done || 0); }); }); });
    return m;
  }
  // One RPE scale per view, from what's on it (at least 2 points tall), so felt and written part where they differ.
  function rpeDomain(dnas) {
    var v = [];
    dnas.forEach(function (d) { d.weeks.forEach(function (w) { if (w.rpeWritten != null) v.push(w.rpeWritten); if (w.rpeFelt != null) v.push(w.rpeFelt); }); });
    if (!v.length) return [6, 10];
    var lo = Math.floor((Math.min.apply(null, v) - 0.5) * 2) / 2, hi = Math.ceil((Math.max.apply(null, v) + 0.5) * 2) / 2;
    if (hi - lo < 2) { var c = (hi + lo) / 2; lo = c - 1; hi = c + 1; }
    return [Math.max(4, lo), Math.min(10.5, hi)];
  }
  function pairIds(items, want) {
    var ids = items.map(function (x) { return x.dna.id; });
    if (want && want.length === 2 && want.every(function (id) { return ids.indexOf(id) >= 0; })) return want.slice();
    var p = blockDefaultPair(items.map(function (x) { return x.dna; }));
    return p ? [p[0].id, p[1].id] : ids.slice(0, 1);
  }

  // What a week was, in words (the hover on the desk; read out with the chart's label).
  function weekTip(d, w) {
    var bits = ['Week ' + w.n];
    var future = d.source === 'weeks' && !w.due && !w.done;
    LIFTS.forEach(function (L) {
      var s = w.sets[L];
      if (!s.planned && !s.done) return;
      bits.push(NAMES[L] + ' ' + (s.planned != null ? (future ? s.planned + ' sets written' : s.done + ' of ' + s.planned + ' sets') : s.done + (s.done === 1 ? ' set' : ' sets')));
    });
    if (w.planned != null && !future) bits.push(w.done + ' of ' + w.planned + ' sessions');
    else if (w.planned == null && w.done) bits.push(w.done + (w.done === 1 ? ' session' : ' sessions'));
    if (w.rpeWritten != null || w.rpeFelt != null) bits.push('top sets ' + [w.rpeWritten != null ? 'written ' + dec1(w.rpeWritten) : '', w.rpeFelt != null ? 'felt ' + dec1(w.rpeFelt) : ''].filter(Boolean).join(', '));
    if (w.pct != null) bits.push('top sets at ' + Math.round(w.pct) + '% of the e1RM the block started from');
    if (future) bits.push('not lifted yet');
    return bits.join(' · ');
  }
  function fpLabel(d) {
    var t = d.totals, bits = [d.name + ': ' + weeksText(d.weeks.length)];
    if (t.sessionsPlanned != null) bits.push(t.sessionsDone + ' of ' + t.sessionsPlanned + ' sessions');
    var per = LIFTS.filter(function (L) { return t.setsByLift[L].perWeek != null; }).map(function (L) { return dec1(t.setsByLift[L].perWeek) + ' ' + NAMES[L].toLowerCase(); });
    if (per.length) bits.push(per.join(', ') + ' sets a week');
    if (t.rpe.drift != null) bits.push('top sets ' + (Math.abs(t.rpe.drift) < 0.25 ? 'felt as written' : 'felt ' + dec1(Math.abs(t.rpe.drift)) + (t.rpe.drift > 0 ? ' harder' : ' easier') + ' than written'));
    return bits.join(', ');
  }
  function barPath(x, base, w, h) {
    var r = Math.min(w / 2, h / 2, 3), t = base - h;
    return 'M' + f1(x) + ' ' + f1(base) + 'V' + f1(t + r) + 'Q' + f1(x) + ' ' + f1(t) + ' ' + f1(x + r) + ' ' + f1(t) + 'H' + f1(x + w - r) +
      'Q' + f1(x + w) + ' ' + f1(t) + ' ' + f1(x + w) + ' ' + f1(t + r) + 'V' + f1(base) + 'Z';
  }
  // The fingerprint. o: { size: 'sm' | 'md', max (sets: the scale shared by the blocks beside it), rpe ([lo, hi]:
  // the RPE scale shared with them), slots (weeks wide, so blocks line up week by week), labels (week numbers
  // under it), tips: 'desk' | 'title' }
  function fpSvg(d, o) {
    o = o || {};
    var g = GEO[o.size] || GEO.sm;
    var cw = 3 * g.bw + 2 * g.gi, slot = cw + g.gw;
    var n = Math.max(o.slots || 0, d.weeks.length, 1);
    var W = n * slot - g.gw, lab = o.labels ? g.lab : 0, H = g.bh + g.sg + g.sh + lab;
    var max = o.max || maxSets([d]) || 1;
    var base = g.bh, sTop = g.bh + g.sg;
    var dom = o.rpe || rpeDomain([d]), lo = dom[0], hi = dom[1];
    var rY = function (r) { var c = Math.max(lo, Math.min(hi, r)); return sTop + 5 + (hi - c) / (hi - lo) * (g.sh - 10); };
    var out = ['<line class="bd-base" x1="0" x2="' + W + '" y1="' + (base + 0.5) + '" y2="' + (base + 0.5) + '"/>'];
    d.weeks.forEach(function (w, i) {
      var x0 = i * slot, parts = [], tip = weekTip(d, w);
      LIFTS.forEach(function (L, j) {
        var x = x0 + j * (g.bw + g.gi), s = w.sets[L];
        var ph = s.planned > 0 ? Math.max(2, s.planned / max * g.bh) : 0, dh = s.done > 0 ? Math.max(2, Math.min(s.done / max, 1) * g.bh) : 0;
        if (ph) parts.push('<path class="bd-trk ' + CLS[L] + '" d="' + barPath(x, base, g.bw, ph) + '"/>');
        if (dh) parts.push('<path class="bd-bar ' + CLS[L] + '" d="' + barPath(x, base, g.bw, dh) + '"/>');
      });
      parts.push('<rect class="bd-hit" x="' + f1(x0 - g.gw / 2) + '" y="0" width="' + slot + '" height="' + (g.bh + g.sg + g.sh) + '" rx="4"/>');
      out.push('<g class="bd-wk"' + (o.tips === 'desk' ? ' data-tip="' + esc(tip) + '">' : '><title>' + esc(tip) + '</title>') + parts.join('') + '</g>');
      if (lab) out.push('<text class="bd-wkn" x="' + f1(x0 + cw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + w.n + '</text>');
    });
    [['rpeWritten', 'is-wr'], ['rpeFelt', 'is-felt']].forEach(function (k) {
      var pts = [];
      d.weeks.forEach(function (w, i) { if (w[k[0]] != null) pts.push([i * slot + cw / 2, rY(w[k[0]])]); });
      if (!pts.length) return;
      if (pts.length > 1) out.push('<path class="bd-rpe ' + k[1] + '" d="' + pts.map(function (p, i) { return (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1]); }).join(' ') + '"/>');
      var e = pts[pts.length - 1];
      out.push('<circle class="bd-end ' + k[1] + '" cx="' + f1(e[0]) + '" cy="' + f1(e[1]) + '" r="5"/>');
    });
    return '<svg class="bd-fp is-' + (o.size || 'sm') + '" width="' + W + '" height="' + H + '" style="width:' + W + 'px;height:' + H + 'px" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(fpLabel(d)) + '">' + out.join('') + '</svg>';
  }
  function fpWidth(slots, size) { var g = GEO[size] || GEO.sm; return Math.max(1, slots) * (3 * g.bw + 2 * g.gi + g.gw) - g.gw; }
  // The key: once per view, never a box per chart.
  function keyHtml() {
    return '<span class="bd-key" aria-hidden="true"><span><i class="bd-sw l-sq"></i>Squat</span><span><i class="bd-sw l-be"></i>Bench</span><span><i class="bd-sw l-dl"></i>Deadlift</span>' +
      '<span><i class="bd-sw is-wash"></i>Written, not done</span><span><i class="bd-ln is-felt"></i>RPE felt</span><span><i class="bd-ln is-wr"></i>RPE written</span></span>';
  }
  // A block's facts beside its fingerprint.
  function subText(it) {
    var d = it.dna;
    if (it.kind === 'now') {
      var ws = typeof programWeekState === 'function' ? programWeekState(it.block) : null;
      return 'Now' + (ws ? ' · ' + (ws.finished ? 'all ' + weeksText(ws.total) + ' done' : 'week ' + ws.number + ' of ' + ws.total) : '');
    }
    return [rangeText(d.dates), weeksText(d.weeks.length || d.weeksTotal || 0)].filter(Boolean).join(' · ');
  }
  function sessionsHtml(d) {
    var t = d.totals;
    if (t.sessionsPlanned != null) return t.sessionsPlanned ? '<b>' + t.sessionsDone + '</b> of ' + t.sessionsPlanned + ' sessions' : 'Not started';
    return '<b>' + t.sessionsDone + '</b> ' + (t.sessionsDone === 1 ? 'session' : 'sessions');
  }
  function chipsHtml(d) {
    var u = unitNow();
    var cs = LIFTS.filter(function (L) { return d.e1rm[L].delta != null; }).map(function (L) {
      var v = Math.round(kgShow(d.e1rm[L].delta));
      return '<span class="bd-chip ' + CLS[L] + (v < 0 ? ' is-down' : '') + '" role="img" aria-label="' + NAMES[L] + ' e1RM ' + (v > 0 ? 'up ' + v : v < 0 ? 'down ' + -v : 'level') + (v ? ' ' + u : '') + '">' +
        '<i></i><b>' + NAMES[L].charAt(0) + '</b><span>' + signedTxt(v) + '</span></span>';
    });
    if (!cs.length) return '<span class="bd-chips is-none">' + (d.current ? 'No e1RM yet' : 'No e1RM to compare') + '</span>';
    return '<span class="bd-chips">' + cs.join('') + '<span class="bd-u">' + esc(u) + '</span></span>';
  }

  // Past blocks on a real account carry their stats only until opened: their weeks load here (a read, once per
  // block a session), and the view repaints when they land. Until then the fingerprint reads from the log.
  var _asked = {};
  function ensureWeeks(items, then) {
    if (window._demoMode || !(window.DB && DB.getProgramBlockWeeks)) return;
    var need = items.filter(function (x) { return x.kind === 'past' && !Array.isArray(x.block.weeks) && !_asked[x.block.id]; }).slice(0, 8);
    if (!need.length) return;
    var left = need.length, got = 0;
    need.forEach(function (x) {
      _asked[x.block.id] = 1;
      Promise.resolve().then(function () { return DB.getProgramBlockWeeks(x.block.id); }).then(function (weeks) {
        if (!weeks) return;
        got++;
        Store.update(function (s) { var b = (s.programBlocks || []).find(function (y) { return y.id === x.block.id; }); if (b) b.weeks = weeks; });
      }).catch(function () {}).then(function () { if (--left === 0 && got && then) then(); });
    });
  }

  /* ---------- the desk: an athlete's page, Blocks ---------- */
  // Each block one row: the name and when, its fingerprint (one scale and one week grid for every row, so they
  // line up), sessions, e1RM per lift. A kept block opens below as the grid it was; the one running now opens
  // its program. Compare opens the blocks + compare.
  function section(r) {
    var a = r.athlete, items = listFor(a.id);
    if (!items.length) return null;
    var sec = el('div', { class: 'dk-sec bd-root bd-sec' });
    var head = el('div', { class: 'dk-sec-head' });
    head.appendChild(el('h3', { class: 'dk-sec-title' }, 'Blocks'));
    head.insertAdjacentHTML('beforeend', keyHtml());
    head.appendChild(el('span', { class: 'dk-sp' }));
    if (items.length >= 2 && typeof dkBtn === 'function') {
      var cb = dkBtn('Compare', { title: 'Two blocks side by side: what changed between them', onClick: function () { open(a.id, { from: cb }); } });
      cb.insertAdjacentHTML('afterbegin', ic('cmp'));
      head.appendChild(cb);
    }
    sec.appendChild(head);
    var dnas = items.map(function (x) { return x.dna; }), max = maxSets(dnas), rpe = rpeDomain(dnas), slots = Math.max.apply(null, dnas.map(function (d) { return d.weeks.length; }).concat([1]));
    var list = el('div', { class: 'dk-bl bd-list', style: '--bd-fpw:' + fpWidth(slots, 'sm') + 'px' });
    var view = el('div', { class: 'dk-bl-view' });
    var openId = null;
    items.forEach(function (it) {
      var d = it.dna, past = it.kind === 'past';
      var row = el('button', { type: 'button', class: 'dk-bl-row bd-row' + (past ? '' : ' is-now') });
      if (past) row.setAttribute('aria-expanded', 'false');
      row.innerHTML = '<span class="bd-id"><span class="bd-name">' + esc(d.name) + '</span><span class="bd-sub">' + esc(subText(it)) + '</span></span>' +
        '<span class="bd-fpw">' + fpSvg(d, { size: 'sm', max: max, rpe: rpe, tips: 'desk' }) + '</span>' +
        '<span class="bd-ses">' + sessionsHtml(d) + '</span>' + chipsHtml(d) + ic('chev', 2.2);
      row.addEventListener('click', async function () {
        if (!past) { if (typeof openAthleteProgram === 'function') openAthleteProgram(a.id); return; }
        view.innerHTML = '';
        list.querySelectorAll('.bd-row[aria-expanded]').forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
        if (openId === it.block.id) { openId = null; return; }
        openId = it.block.id;
        row.setAttribute('aria-expanded', 'true');
        var b = it.block, weeks = b.weeks;
        if (!weeks && window.DB && DB.getProgramBlockWeeks) {
          var wait = el('p', { class: 'dk-quiet-p' }, 'Opening the block…');
          view.appendChild(wait);
          weeks = await DB.getProgramBlockWeeks(b.id).catch(function () { return null; });
          if (openId !== b.id) return;
          wait.remove();
          if (weeks) Store.update(function (s) { var x = (s.programBlocks || []).find(function (y) { return y.id === b.id; }); if (x) x.weeks = weeks; });
        }
        if (!weeks) { view.appendChild(el('p', { class: 'dk-quiet-p' }, 'This block didn\'t open. Check the connection and try again.')); return; }
        if (typeof dkBlockView === 'function') view.appendChild(dkBlockView({ id: b.id, name: b.name, weeks: weeks, maxes: b.maxes }, a.id));
      });
      list.appendChild(row);
    });
    sec.appendChild(list);
    sec.appendChild(view);
    ensureWeeks(items, function () { if (sec.isConnected) { var nx = section(r); if (nx) sec.replaceWith(nx); } });
    return sec;
  }

  /* ---------- the blocks + compare ---------- */
  // One pick list (each block with its fingerprint, two ticked) beside what changed between the two ticked:
  // their fingerprints stacked on one week grid, then one row per difference, a sentence and both values.
  function pickHtml(it, on, o) {
    var d = it.dna;
    return '<button type="button" class="bd-pick" data-bd-pick="' + esc(d.id) + '" aria-pressed="' + on + '">' +
      '<span class="bd-ck" aria-hidden="true">' + ic('check', 2.6) + '</span>' +
      '<span class="bd-pid"><span class="bd-name">' + esc(d.name) + '</span><span class="bd-sub">' + esc(subText(it)) + '</span></span>' +
      '<span class="bd-pfp">' + fpSvg(d, { size: 'sm', max: o.max, rpe: o.rpe, tips: o.tips }) + '</span>' +
      '<span class="bd-pfacts"><span class="bd-ses">' + sessionsHtml(d) + '</span>' + chipsHtml(d) + '</span></button>';
  }
  function compareHtml(items, ids, o) {
    var byId = {};
    items.forEach(function (x) { byId[x.dna.id] = x; });
    var pick = ids.map(function (id) { return byId[id]; }).filter(Boolean);
    if (items.length < 2) return '<div class="bd-empty"><b>One block so far</b><p>Compare opens once there are two. This one is kept as a past block when the next one starts.</p></div>';
    if (pick.length < 2) return '<div class="bd-empty"><b>Pick one more</b><p>Tick two blocks to see what changed between them.</p></div>';
    // Newest first in the list; the newer is the one described, the older the one it's set against.
    pick.sort(function (x, y) { return items.indexOf(x) - items.indexOf(y); });
    var A = pick[0].dna, B = pick[1].dna;
    var c = blockCompare(A, B, { unit: unitNow() });
    var max = maxSets([A, B]), rpe = rpeDomain([A, B]), slots = Math.max(A.weeks.length, B.weeks.length, 1);
    var short = function (n) { return String(n || '').replace(/\s+block$/i, '') || n; };
    var size = o.phone && slots > 8 ? 'sm' : 'md';
    var h = '<div class="bd-ch"><h3 class="bd-h3">What changed</h3><p class="bd-chs">' + esc(A.name) + ' against ' + esc(B.name) + '</p></div>';
    h += '<div class="bd-align" style="--bd-fpw:' + fpWidth(slots, size) + 'px">' + [pick[1], pick[0]].map(function (it, i) {
      return '<div class="bd-arow"><span class="bd-aid"><span class="bd-name">' + esc(it.dna.name) + '</span><span class="bd-sub">' + esc(subText(it)) + '</span></span>' +
        '<span class="bd-afp">' + fpSvg(it.dna, { size: size, max: max, rpe: rpe, slots: slots, labels: i === 1, tips: o.tips }) + '</span></div>';
    }).join('') + '<div class="bd-akey">' + keyHtml() + '</div></div>';
    if (o.phone) {
      h += '<div class="bd-plist2">' + c.rows.map(function (r) {
        return '<div class="bd-prow"><span class="bd-tl">' + (r.lift ? '<i class="bd-dot ' + CLS[r.lift] + '"></i>' : '') + esc(r.label) + '</span><p class="bd-tx">' + esc(r.text) + '</p></div>';
      }).join('') + '</div>';
    } else {
      h += '<div class="bd-tbl" role="table" aria-label="' + esc(A.name + ' against ' + B.name) + '"><div class="bd-tr is-head" role="row"><span role="columnheader"><span class="bd-vh">What</span></span><span role="columnheader"><span class="bd-vh">What changed</span></span>' +
        '<span role="columnheader" class="bd-tv" title="' + esc(B.name) + '">' + esc(short(B.name)) + '</span><span role="columnheader" class="bd-tv" title="' + esc(A.name) + '">' + esc(short(A.name)) + '</span></div>' +
        c.rows.map(function (r) {
          var v = function (x) { return '<span class="bd-tv" role="cell">' + esc(x.text) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span>'; };
          return '<div class="bd-tr" role="row"><span class="bd-tl" role="rowheader">' + (r.lift ? '<i class="bd-dot ' + CLS[r.lift] + '"></i>' : '') + esc(r.label) + '</span>' +
            '<span class="bd-tx" role="cell">' + esc(r.text) + '</span>' + v(r.b) + v(r.a) + '</div>';
        }).join('') + '</div>';
    }
    h += '<p class="bd-foot">Sessions count the ones that came round. e1RM is each block\'s best against the best in the 8 weeks before it' + (A.current ? '; ' + esc(A.name) + ' is still running' : '') + '.</p>';
    return h;
  }
  function wirePicks(host, items, state, repaint) {
    host.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-bd-pick]');
      if (!b || !host.contains(b)) return;
      e.preventDefault();
      var id = b.getAttribute('data-bd-pick'), at = state.ids.indexOf(id);
      if (at >= 0) state.ids.splice(at, 1);
      else { state.ids.push(id); if (state.ids.length > 2) state.ids.shift(); }
      repaint(true);
    });
  }
  function statusText(items, ids) {
    var names = items.filter(function (x) { return ids.indexOf(x.dna.id) >= 0; }).map(function (x) { return x.dna.name; });
    return names.length === 2 ? 'Comparing ' + names[0] + ' against ' + names[1] : 'Tick two blocks to compare';
  }
  function swapIn(node) {
    if (!node || reducedMotion() || !node.animate) return;
    node.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }

  // open(aid, { pair: [id, id], from: the button to return focus to }): the desk's modal, else the phone's sheet.
  function open(aid, opts) {
    opts = opts || {};
    var items = listFor(aid);
    if (!items.length) { if (typeof toast === 'function') toast('No blocks yet. The first one shows here once it has a week written.'); return; }
    // Ticked oldest first: a third tick lets go of the older of the two, so ticking the block running now
    // sets it against the last one.
    var state = { ids: pairIds(items, opts.pair).reverse(), aid: aid };
    if (isDeskNow()) openDesk(aid, items, state, opts); else openSheet(aid, items, state);
  }
  function openDesk(aid, items, state, opts) {
    var old = document.querySelector('.bd-veil');
    if (old && old._close) old._close();
    var a = athleteOf(aid);
    var veil = el('div', { class: 'dk-veil bd-veil' });
    var box = el('div', { class: 'dk-modal bd-modal bd-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bdTitle', tabindex: '-1' });
    var head = el('div', { class: 'bd-mhead' });
    var hid = el('div', {});
    hid.appendChild(el('h2', { class: 'dk-modal-title', id: 'bdTitle' }, 'Blocks'));
    hid.appendChild(el('p', { class: 'bd-msub' }, a.name + ' · ' + items.length + (items.length === 1 ? ' block' : ' blocks') + (items.length >= 2 ? ' · tick two to compare' : '')));
    head.appendChild(hid);
    var x = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Close', html: ic('x', 2.1) });
    if (typeof dkTip === 'function') dkTip(x, 'Close', 'Esc');
    x.addEventListener('click', close);
    head.appendChild(x);
    box.appendChild(head);
    var grid = el('div', { class: 'bd-mgrid' });
    var left = el('div', { class: 'bd-mlist', role: 'group', 'aria-label': 'Blocks to compare' }), right = el('div', { class: 'bd-mcmp' });
    grid.appendChild(left); grid.appendChild(right);
    box.appendChild(grid);
    var said = el('p', { class: 'bd-vh', role: 'status' });
    box.appendChild(said);
    var max, rpe;
    var scale = function () {
      var dnas = items.map(function (it) { return it.dna; }), slots = Math.max.apply(null, dnas.map(function (d) { return d.weeks.length; }).concat([1]));
      max = maxSets(dnas); rpe = rpeDomain(dnas);
      left.style.setProperty('--bd-fpw', fpWidth(slots, 'sm') + 'px');
      left.classList.toggle('is-long', slots > 6);
    };
    scale();
    var paint = function (swap) {
      left.innerHTML = items.map(function (it) { return pickHtml(it, state.ids.indexOf(it.dna.id) >= 0, { max: max, rpe: rpe, tips: 'desk' }); }).join('');
      right.innerHTML = compareHtml(items, state.ids, { tips: 'desk' });
      if (swap) { swapIn(right); said.textContent = statusText(items, state.ids); }
    };
    wirePicks(left, items, state, paint);
    paint(false);
    veil.appendChild(box);
    veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(veil);
    if (!reducedMotion() && box.animate) box.animate([{ opacity: 0.6, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    box.focus({ preventScroll: true });
    function close() {
      document.removeEventListener('keydown', onKey, true);
      veil.remove();
      if (opts.from && opts.from.isConnected) opts.from.focus({ preventScroll: true });
    }
    veil._close = close;
    ensureWeeks(items, function () { if (veil.isConnected) { items = listFor(aid); scale(); paint(false); } });
  }
  function openSheet(aid, items, state) {
    if (typeof uiSheet !== 'function') return;
    var a = athleteOf(aid);
    uiSheet('Blocks', function (sheet) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, a.name + (items.length >= 2 ? ' · tap two to compare' : '')));
      var list = el('div', { class: 'bd-plist', role: 'group', 'aria-label': 'Blocks to compare' }), cmp = el('div', { class: 'bd-pcmp' }), said = el('p', { class: 'bd-vh', role: 'status' });
      sheet.appendChild(list); sheet.appendChild(cmp); sheet.appendChild(said);
      var max, rpe;
      var scale = function () {
        var dnas = items.map(function (it) { return it.dna; }), slots = Math.max.apply(null, dnas.map(function (d) { return d.weeks.length; }).concat([1]));
        max = maxSets(dnas); rpe = rpeDomain(dnas);
        list.style.setProperty('--bd-fpw', fpWidth(slots, 'sm') + 'px');
        list.classList.toggle('is-long', slots > 6);
      };
      scale();
      var paint = function (swap) {
        list.innerHTML = items.map(function (it) { return pickHtml(it, state.ids.indexOf(it.dna.id) >= 0, { max: max, rpe: rpe, tips: 'title' }); }).join('');
        cmp.innerHTML = compareHtml(items, state.ids, { phone: true, tips: 'title' });
        if (swap) { swapIn(cmp); said.textContent = statusText(items, state.ids); }
      };
      wirePicks(list, items, state, paint);
      paint(false);
      ensureWeeks(items, function () { if (sheet.isConnected) { items = listFor(aid); scale(); paint(false); } });
    }, { cls: 'bd-sheet bd-root' });
  }
  // The coach's lifter page: a quiet Blocks link, with what it opens. null when there's nothing to show.
  function linkInfo(aid) {
    var items = listFor(aid);
    if (!items.some(function (x) { return x.kind === 'past' || x.dna.totals.sessionsDone > 0; })) return null;
    var n = items.length;
    return { n: n, text: n === 1 ? '1 block' : n + ' blocks · compare two' };
  }

  var api = { blockDna: blockDna, blockCompare: blockCompare, blockDefaultPair: blockDefaultPair, LIFTS: LIFTS,
    listFor: listFor, fpSvg: fpSvg, section: section, open: open, linkInfo: linkInfo };
  window.BlockDNA = api;
  window.blockDna = blockDna;
  window.blockCompare = blockCompare;
  window.blockDefaultPair = blockDefaultPair;
})();
