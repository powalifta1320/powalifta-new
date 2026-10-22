/* =====================================================================
   meetday.js — the attempt planner and the meet-day board (brief M8, 2026-10-22)

   1. THE ATTEMPT PLANNER (ships on its own). Per lifter and lift: opener, second
      and third from the projected max (recent e1RM, recent singles), the bouncer's
      rule on the opener (bouncerOpener) and the minute's SAFE / PLAN / SEND choices
      for the second and third (meetAttemptOptions); the total, the federation's score
      (meetScore: IPF GL or DOTS, named) and the class. The coach edits; the plan rides
      on the lifter's planned meet (meets.attempt_plan) and becomes their meet mode
      (athlete.html getMeetPlan reads MeetDay.lifterPlan).
   2. THE MEET-DAY BOARD. Lifters in lifting order (lift → flight → round, lightest
      bar first, lot breaks a tie), cells planned / declared / changed / good / no
      lift, attempts out, warm-up times from the flight's start, printable attempt
      cards, the lifter's "your next attempt" on their phone, and Finish meet
      (finish_meet_day writes the done meets; best totals and DOTS move only then).
      Local-first: every mark lands in this browser first (localStorage) and goes up
      through an outbox; offline for the whole flight, it reconciles per cell when
      the wifi is back (a result beats a declaration, otherwise the later mark wins,
      the server stamps every write; see localWins, mirrored in SQL).

   Entry points (window):
     openAttemptPlanner(meetId | athleteId)   the planner (a meet, or a lifter's next meet)
     openMeetDayBoard(meetDayId)              the board ('demo-md-1' in ?demo=1)
     renderMeetsScreen(host)                  the desk's Meets screen, drawn into host
     openMeetsScreen()                        the same screen as an overlay (phone, the lifter-page hook)
   Coach hook on a planned meet: MeetDay.plannerLink(meet) → "Plan attempts" (+ "Meet day" on the day).
   Lifter side: MeetDay.lifterPlan(athleteId, todayIso), MeetDay.lifterNextEl().
   Pure (unit-tested, tests.html "meet day (M8)"): MeetDay.pure.

   Data: sql/migration-meet-day-2026-10-22.sql through the db.js "MEET DAY hook"
   (attempt plans on meets.attempt_plan; meet_days, meet_day_lifters, meet_attempts;
   meet_day_sync + finish_meet_day). Until it runs: plans and boards stay on this
   device and Finish waits for it. ?demo=1 never touches the network: a demo meet
   day (six lifters, two flights) on an in-browser stand-in for the server.

   Hooks in shared files (each marked "MEET DAY hook"): coach.html + athlete.html
   (script tags), coach.html renderAthletePage + desk.js dkWsMeets (plannerLink on the planned meet),
   athlete.html (getMeetPlan, meet mode's next-attempt slab, the bouncer names the coach's plan),
   app.js _wipeLocalUserData (boards and plans leave with the account),
   db.js (attempt_plan mapping + the DB methods at the end), sw.js (precache),
   tests.html + test/run-unit-tests.js, support-kb.js.
   ===================================================================== */
var MeetDay = (function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var hasDom = typeof document !== 'undefined' && !!(document && document.createElement);

  // ------------------------------------------------------------ constants
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var LIFT_SHORT = { squat: 'SQ', bench: 'BP', deadlift: 'DL' };
  var LIFT_NAME = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  // The same three lines as the lifter's meet-day sheet (athlete.html MEET_STRATEGIES).
  var STRATS = {
    conservative: { label: 'Conservative', pcts: [0.89, 0.945, 0.985] },
    standard: { label: 'Standard', pcts: [0.91, 0.96, 1.005] },
    aggressive: { label: 'Aggressive', pcts: [0.93, 0.975, 1.025] }
  };
  var STEP = 2.5;              // federations load in 2.5 kg (0.5 kg only for a record)
  var RECENT_DAYS = 42, HEAVY_DAYS = 28;
  var MIN_BAR = 20, MAX_KG = 600;
  var SEC_PER_ATTEMPT = 60, BREAK_SEC = 600;

  // ------------------------------------------------------------ pure: small helpers
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function rStep(kg, step) { step = step || STEP; return Math.round(Math.round(num(kg) / step) * step * 100) / 100; }
  function kgText(kg) { if (kg == null || kg === '' || !isFinite(Number(kg))) return '–'; var v = Math.round(Number(kg) * 100) / 100; return String(v); }
  function iso(d) { return String(d || '').slice(0, 10); }
  function addDays(isoDay, n) { var d = new Date(isoDay + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
  function isResult(s) { return s === 'good' || s === 'no'; }
  function rank(s) { return isResult(s) ? 2 : s === 'declared' ? 1 : 0; }
  function attemptKey(lifterId, lift, n) { return String(lifterId) + '|' + lift + '|' + n; }
  function planned(m) { return typeof root.isPlannedMeet === 'function' ? root.isPlannedMeet(m) : (m && m.status === 'planned'); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  // ------------------------------------------------------------ pure: the planner
  // The max a plan is built on, from the last six weeks (a peak is planned on where the lifter is
  // now, not on a year-old number): the heavy sets (1-3 reps) when there are any, since a set of
  // five overstates a meet max for most lifters; else the best recent e1RM; else the best of the
  // all-time e1RM and a real meet result. Also the best competition single in those six weeks
  // (what has actually been on the bar) and the heavy-set reference the bouncer compares the
  // opener with (sets of three or fewer, last four weeks), the same one meet mode uses.
  function projectedMax(logs, meets, lift, today) {
    var since = addDays(today, -RECENT_DAYS), heavySince = addDays(today, -HEAVY_DAYS);
    var mine = (logs || []).filter(function (l) { return l && l.lift === lift && l.date && iso(l.date) <= today && num(l.e1rmComp) > 0; });
    var recent = 0, heavy = 0, all = 0, ref = 0, single = null;
    mine.forEach(function (l) {
      var d = iso(l.date), e = num(l.e1rmComp);
      if (e > all) all = e;
      if (d >= since && e > recent) recent = e;
      if (d >= since && num(l.reps) <= 3 && e > heavy) heavy = e;
      if (d >= heavySince && num(l.reps) <= 3 && e > ref) ref = e;
      if (d >= since && num(l.reps) === 1 && String(l.variant || 'Competition') === 'Competition') {
        var kg = num(l.weight);
        if (kg > 0 && (!single || kg > single.kg)) single = { kg: kg, date: d };
      }
    });
    var meetBest = 0;
    (meets || []).forEach(function (m) { if (m && !planned(m) && iso(m.date) <= today) meetBest = Math.max(meetBest, num(m[lift])); });
    if (heavy > 0) return { max: heavy, source: 'heavy', single: single, refKg: ref };
    if (recent > 0) return { max: recent, source: 'recent', single: single, refKg: ref };
    if (all > 0 || meetBest > 0) return { max: Math.max(all, meetBest), source: meetBest > all ? 'meet' : 'e1rm', single: single, refKg: ref };
    return { max: 0, source: null, single: single, refKg: ref };
  }
  function climb(kg) {
    var out = kg.slice();
    for (var i = 1; i < 3; i++) if (out[i] < out[i - 1] + STEP) out[i] = rStep(out[i - 1] + STEP);
    return out;
  }
  // { max, refKg, strategy } → { kg: [o, s, t], pct, basis, bounced } (null without a max).
  // An opener past 95% of this month's heavy sets is a max, not an opener (bouncerOpener):
  // the plan is rebuilt on the recent reference, the way meet mode rebuilds it on the day.
  function planLift(o) {
    var max = num(o && o.max);
    if (!(max > 0)) return null;
    var p = (STRATS[o.strategy] || STRATS.standard).pcts;
    var kg = climb(p.map(function (x) { return rStep(max * x); }));
    var basis = 'max', base = max, bounced = null;
    var ref = num(o.refKg);
    var b = ref > 0 && typeof root.bouncerOpener === 'function' ? root.bouncerOpener({ openerKg: kg[0], refKg: ref }, 'kg') : null;
    if (b) {
      bounced = b; basis = 'recent'; base = ref;
      kg = climb([b.suggestKg, rStep(ref * p[1]), rStep(ref * p[2])]);
    }
    return { kg: kg, pct: kg.map(function (k) { return Math.round(k / base * 100); }), basis: basis, base: base, bounced: bounced };
  }
  // The second and third as the minute offers them on the day (meetAttemptOptions):
  // after a good previous attempt, SAFE (the smallest jump), PLAN, SEND (a PR in reach).
  function planAlternatives(prevKg, plannedNext, best) {
    if (typeof root.meetAttemptOptions !== 'function') return [];
    return root.meetAttemptOptions({ kg: prevKg, result: 'good', plannedNext: plannedNext, best: best, unit: 'kg' });
  }
  // Total of the thirds, the opening total, the score the meet's federation uses (named), the class.
  function planTotals(plan, o) {
    o = o || {};
    var total = 0, opening = 0;
    LIFTS.forEach(function (l) {
      var a = plan && plan[l];
      if (!a || !a.length) return;
      var best = 0; a.forEach(function (k) { if (num(k) > best) best = num(k); });
      total += best; opening += num(a[0]);
    });
    total = r1(total); opening = r1(opening);
    var score = typeof root.meetScore === 'function' ? root.meetScore(total, num(o.bw), o.sex || 'male', { federation: o.federation, division: o.division, age: o.age })
      : { label: 'DOTS', points: 0 };
    var cls = o.weightClass || (num(o.bw) > 0 && typeof root.weightClassFor === 'function' ? root.weightClassFor(num(o.bw), o.sex) : '') || '';
    return { total: total, opening: opening, score: { label: score.label, points: score.points || 0, formula: score.formula }, cls: cls };
  }
  // The sex an IPF class belongs to ('63 kg' → female, '120 kg+' → male). 52 is also a USPA men's
  // class and anything with a half kilo is USPA / WRPF, so those say nothing (null).
  var CLS_F = [47, 57, 63, 69, 76, 84], CLS_M = [59, 66, 74, 83, 93, 105, 120];
  function sexFromClass(cls) {
    var m = /^\s*(\d+(?:\.\d+)?)\s*(?:kg)?\s*\+?\s*$/i.exec(String(cls == null ? '' : cls));
    if (!m) return null;
    var n = Number(m[1]);
    return CLS_F.indexOf(n) >= 0 ? 'female' : CLS_M.indexOf(n) >= 0 ? 'male' : null;
  }
  // What a plan may hold (coach-authored JSON that lands in the lifter's meet mode): three
  // numbers per lift on 0.5 kg (null where blank), a strategy, a sex, a short note.
  function normalizePlan(p) {
    p = p || {};
    var out = { v: 1, strategy: STRATS[p.strategy] ? p.strategy : 'standard', sex: p.sex === 'male' || p.sex === 'female' ? p.sex : null };
    LIFTS.forEach(function (l) {
      if (!Array.isArray(p[l])) return;
      out[l] = [0, 1, 2].map(function (i) {
        var v = Number(p[l][i]);
        return isFinite(v) && v >= MIN_BAR && v <= MAX_KG ? rStep(v, 0.5) : null;
      });
    });
    if (p.note) out.note = String(p.note).replace(/[<>]/g, '').slice(0, 280);
    if (p.at) out.at = String(p.at).slice(0, 30);
    if (p.by) out.by = String(p.by).slice(0, 60);
    return out;
  }

  // ------------------------------------------------------------ pure: the board
  // cells: { 'lifterId|lift|n': { lifterId, lift, n, kg, status, changes, at, srvAt } }
  // lifters: [{ id, name, flight, lot, ... }]. Lift by lift; flight by flight; in each round
  // the lightest bar goes first and the lower lot number breaks a tie (IPF / USAPL).
  // flights (optional): the day's { A: { start, size } }. size = everyone in that flight at the venue,
  // the coach's lifters included. The others are not on the board, so each round spreads them evenly
  // around this coach's lifters: e.pre = others lifting just before e, e.post = others after the last
  // of the round. Attempts out and every clock time count them (outFor, etas).
  function liftingOrder(lifters, cells, flightInfo) {
    var flights = [];
    (lifters || []).forEach(function (l) { var f = String(l.flight || 'A'); if (flights.indexOf(f) < 0) flights.push(f); });
    flights.sort();
    var out = [];
    LIFTS.forEach(function (lift) {
      flights.forEach(function (f) {
        var ls = lifters.filter(function (l) { return String(l.flight || 'A') === f; });
        var size = Math.round(num(flightInfo && flightInfo[f] && flightInfo[f].size));
        var others = Math.max(0, size - ls.length);
        [1, 2, 3].forEach(function (n) {
          var round = [];
          ls.forEach(function (l) {
            var k = attemptKey(l.id, lift, n), c = cells[k];
            if (!c) return;
            round.push({ key: k, lifterId: l.id, lift: lift, n: n, flight: f, kg: c.kg == null ? null : num(c.kg), status: c.status || 'planned', lot: num(l.lot) || 999, name: l.name || '', pre: 0, post: 0 });
          });
          round.sort(function (a, b) {
            var ka = a.kg == null ? Infinity : a.kg, kb = b.kg == null ? Infinity : b.kg;
            return ka - kb || a.lot - b.lot || String(a.name).localeCompare(String(b.name));
          });
          if (others && round.length) {
            var k2 = round.length, before = function (j) { return Math.floor(others * j / (k2 + 1)); };
            round.forEach(function (e, j) { e.pre = before(j + 1) - before(j); });
            round[k2 - 1].post = others - before(k2);
          }
          out.push.apply(out, round);
        });
      });
    });
    return out;
  }
  // The attempt on the platform: the first one without a result (-1 when the meet is over).
  function position(order) { for (var i = 0; i < order.length; i++) if (!isResult(order[i].status)) return i; return -1; }
  // Has anyone on the board been called in this lift of this flight? Until then the others who
  // open lighter than the first of the coach's lifters are still to lift (the flight hasn't begun).
  function segmentStarted(order, i) {
    var e = order[i];
    for (var j = 0; j < order.length; j++) { var x = order[j]; if (x.lift === e.lift && x.flight === e.flight && isResult(x.status)) return true; }
    return false;
  }
  // A lifter's next attempt and how many attempts are still to go before it (the venue's other
  // lifters in the flight included, see liftingOrder).
  function outFor(order, lifterId) {
    var out = 0, prev = null;
    for (var i = 0; i < order.length; i++) {
      var e = order[i];
      if (isResult(e.status)) continue;
      if (prev) out += num(prev.post) + num(e.pre);
      else if (!segmentStarted(order, i)) out += num(e.pre);
      if (e.lifterId === lifterId) return { out: out, index: i, entry: e };
      out++; prev = e;
    }
    return null;
  }
  // When each attempt still to go should happen (ms): sec an attempt (the venue's others too), a
  // flight never before its scheduled start (squat), a break between lifts. Resolved attempts are null.
  function etas(order, o) {
    o = o || {};
    var sec = (o.sec || SEC_PER_ATTEMPT) * 1000, brk = (o.breakSec == null ? BREAK_SEC : o.breakSec) * 1000;
    var t = o.now, prev = null, starts = o.starts || {};
    return order.map(function (e, i) {
      if (isResult(e.status)) return null;
      if (prev) t += num(prev.post) * sec;
      if (prev && prev.lift !== e.lift) t += brk;
      var st = starts[e.flight];
      if (e.lift === 'squat' && st && (!prev || prev.flight !== e.flight || prev.lift !== e.lift)) t = Math.max(t, st);
      if (prev || !segmentStarted(order, i)) t += num(e.pre) * sec;
      var at = t; t += sec; prev = e;
      return at;
    });
  }
  // The warm-up ladder (app.js warmupCaller: by attempts out) with a clock time for each, counted
  // back from the lifter's attempt: the one to take now is the latest whose time has come.
  function warmups(openerKg, eta, sec, now) {
    var list = typeof root.warmupCaller === 'function' ? root.warmupCaller(num(openerKg), 'kg') : [];
    sec = (sec || SEC_PER_ATTEMPT) * 1000;
    var rows = list.map(function (w) { return { kg: w.kg, reps: w.reps, out: w.out, at: eta == null ? null : eta - w.out * sec, state: 'next' }; });
    if (eta == null) return rows;
    var cur = -1;
    rows.forEach(function (w, i) { if (w.at <= now) cur = i; });
    rows.forEach(function (w, i) { w.state = i < cur ? 'past' : i === cur ? 'now' : 'next'; });
    return rows;
  }
  // The lightest the next attempt may be: +2.5 after a good lift, the same bar after a miss.
  function floorFor(cells, lifterId, lift, n) {
    if (n <= 1) return null;
    var p = cells[attemptKey(lifterId, lift, n - 1)];
    if (!p || !isResult(p.status)) return null;
    return p.status === 'good' ? rStep(num(p.kg) + STEP, 0.5) : num(p.kg);
  }
  // One mark on the board. action: { type: 'declare' | 'adjust' | 'good' | 'no' | 'undo',
  // lifterId, lift, n, kg?, delta? }. Pure: → { ok, cells (a new map), keys (what changed), reason }.
  function applyAction(cells, a, now) {
    var k = attemptKey(a.lifterId, a.lift, a.n), cur = cells[k];
    if (!cur) return { ok: false, reason: 'missing', cells: cells, keys: [] };
    var next = Object.assign({}, cells), keys = [];
    var put = function (key, patch) { next[key] = Object.assign({}, next[key], patch, { at: now }); keys.push(key); };
    var floor = floorFor(cells, a.lifterId, a.lift, a.n);
    if (a.type === 'declare' || a.type === 'adjust') {
      var kg = a.type === 'adjust' ? rStep(num(cur.kg) + num(a.delta), 0.5) : (a.kg == null ? num(cur.kg) : rStep(a.kg, 0.5));
      if (!(kg >= MIN_BAR) || kg > MAX_KG) return { ok: false, reason: 'range', cells: cells, keys: [] };
      if (floor != null && kg < floor) return { ok: false, reason: 'floor', floor: floor, cells: cells, keys: [] };
      if (isResult(cur.status)) return { ok: false, reason: 'taken', cells: cells, keys: [] };
      var status = a.type === 'declare' ? 'declared' : cur.status || 'planned';
      var changes = num(cur.changes) + (cur.status === 'declared' && kg !== num(cur.kg) ? 1 : 0);
      put(k, { kg: kg, status: status, changes: changes });
    } else if (a.type === 'good' || a.type === 'no') {
      put(k, { status: a.type });
      // A planned next attempt under the new floor is lifted to it (a declared one is the table's).
      var nk = attemptKey(a.lifterId, a.lift, a.n + 1), nx = next[nk];
      var f2 = a.type === 'good' ? rStep(num(cur.kg) + STEP, 0.5) : num(cur.kg);
      if (nx && (nx.status || 'planned') === 'planned' && num(nx.kg) < f2) put(nk, { kg: f2 });
    } else if (a.type === 'undo') {
      if (!isResult(cur.status)) return { ok: false, reason: 'nothing', cells: cells, keys: [] };
      put(k, { status: 'declared' });
    } else return { ok: false, reason: 'type', cells: cells, keys: [] };
    return { ok: true, cells: next, keys: keys, cell: next[k] };
  }

  // ------------------------------------------------------------ pure: offline reconcile
  // Does a mark made on this device (local, with `base` = the server stamp it last saw) win over
  // what the server has now? Nobody else wrote since → yes. Otherwise a result (good / no) beats a
  // declaration either way: a call from the platform is never lost to a weight change. Two of a
  // kind: the later mark (when it was made, `at`) wins; a tie stays with the server.
  // Mirrored in SQL (meet_day_sync); the server stamps every write it keeps.
  function localWins(server, local) {
    if (!server) return true;
    if (!local) return false;
    var sb = Date.parse(server.srvAt), lb = Date.parse(local.base);
    if (isFinite(sb) && isFinite(lb) && sb <= lb) return true;
    var rs = rank(server.status), rl = rank(local.status);
    if (rl === 2 && rs < 2) return true;
    if (rs === 2 && rl < 2) return false;
    return num(local.at) > num(server.at);
  }
  function reconcileCell(server, local) {
    var w = localWins(server, local) ? local : server;
    return Object.assign({}, w, { changes: Math.max(num(server && server.changes), num(local && local.changes)) });
  }
  // Cells waiting to go up: key → { base } (the server stamp the first unsent edit was made on).
  function queue(outbox, keys, cells) {
    var o = Object.assign({}, outbox);
    (keys || []).forEach(function (k) { if (!o[k]) o[k] = { base: (cells[k] && cells[k].srvAt) || null }; });
    return o;
  }
  function outgoing(outbox, cells) {
    return Object.keys(outbox || {}).filter(function (k) { return cells[k]; }).map(function (k) {
      var c = cells[k];
      return { key: k, lifterId: c.lifterId, lift: c.lift, n: c.n, kg: c.kg, status: c.status || 'planned', changes: num(c.changes), at: num(c.at), base: outbox[k].base };
    });
  }
  // The in-browser stand-in for meet_day_sync (demo, and the tests): the same rule, a stamp per write.
  function serverApply(srv, incoming, stamp) {
    var next = Object.assign({}, srv), rows = [];
    (incoming || []).forEach(function (inc) {
      var k = inc.key || attemptKey(inc.lifterId, inc.lift, inc.n), cur = next[k];
      if (localWins(cur, inc)) {
        var row = { key: k, lifterId: inc.lifterId, lift: inc.lift, n: inc.n, kg: inc.kg, status: inc.status || 'planned',
          changes: Math.max(num(cur && cur.changes), num(inc.changes)), at: num(inc.at), srvAt: stamp() };
        if (cur) ['id', 'by'].forEach(function (f) { if (cur[f] != null) row[f] = cur[f]; });
        next[k] = row;
      } else if (cur && num(inc.changes) > num(cur.changes)) {
        next[k] = Object.assign({}, cur, { changes: num(inc.changes), srvAt: stamp() });
      }
      rows.push(next[k]);
    });
    return { srv: next, rows: rows };
  }
  // What the server answered: each row replaces the local cell unless the cell was edited again
  // while the request was out (then that edit stays queued, now based on the server's row).
  // lost: the marks this device sent that the server did not keep (another device's call won the
  // cell), so the board can say so instead of a call vanishing without a word.
  function afterFlush(cells, outbox, sent, rows) {
    var c = Object.assign({}, cells), o = Object.assign({}, outbox), lost = [];
    var sentBy = {}; (sent || []).forEach(function (s) { sentBy[s.key] = s; });
    (rows || []).forEach(function (r) {
      var k = r.key || attemptKey(r.lifterId, r.lift, r.n), s = sentBy[k];
      if (num(c[k] && c[k].at) > num(s && s.at)) { o[k] = { base: r.srvAt || (o[k] && o[k].base) || null }; c[k] = Object.assign({}, c[k], { srvAt: r.srvAt, changes: Math.max(num(c[k].changes), num(r.changes)) }); return; }
      if (s && ((r.status || 'planned') !== (s.status || 'planned') || num(r.kg) !== num(s.kg))) lost.push({ key: k, lifterId: s.lifterId, lift: s.lift, n: s.n, mine: s.status, kept: r.status || 'planned', kg: r.kg });
      c[k] = Object.assign({}, c[k] || {}, r); delete c[k].key; delete o[k];
    });
    return { cells: c, outbox: o, lost: lost };
  }
  // ---- lifter rows (weigh-in, class, flight, lot, rack): dirty per FIELD, never per row ----
  // dirty: { bodyweight: 1, rack: { squat: 1 }, _new: 1, _v: n }. Two laptops editing different
  // fields of one lifter offline both keep their edit; rack keys merge on the server too.
  var LIFTER_FIELDS = ['name', 'sex', 'flight', 'lot', 'bodyweight', 'weightClass'];
  function markDirty(dirty, patch) {
    var d = Object.assign({}, dirty);
    Object.keys(patch || {}).forEach(function (f) {
      if (f === 'rack') { d.rack = Object.assign({}, d.rack); Object.keys(patch.rack || {}).forEach(function (rk) { d.rack[rk] = 1; }); }
      else if (LIFTER_FIELDS.indexOf(f) >= 0) d[f] = 1;
    });
    d._v = num(d._v) + 1;
    return d;
  }
  // What goes up for one lifter: only its dirty fields (rack: only its dirty keys).
  function lifterPatch(l, dirty) {
    var p = {};
    LIFTER_FIELDS.forEach(function (f) { if (dirty && dirty[f]) p[f] = l[f] == null ? null : l[f]; });
    if (dirty && dirty.rack) { p.rack = {}; Object.keys(dirty.rack).forEach(function (rk) { p.rack[rk] = (l.rack && l.rack[rk]) || ''; }); }
    return p;
  }
  // A server row with this device's unsent fields laid over it (and nothing else of the local row).
  function mergeLifter(server, local, dirty) {
    if (!local || !dirty) return server;
    var out = Object.assign({}, server);
    LIFTER_FIELDS.forEach(function (f) { if (dirty[f]) out[f] = local[f]; });
    if (dirty.rack) { out.rack = Object.assign({}, server.rack); Object.keys(dirty.rack).forEach(function (rk) { out.rack[rk] = (local.rack || {})[rk] || ''; }); }
    return out;
  }
  // Rows from realtime (or a reload): a cell with an edit still queued keeps that edit.
  function mergeIncoming(cells, outbox, rows) {
    var c = Object.assign({}, cells);
    (rows || []).forEach(function (r) {
      var k = r.key || attemptKey(r.lifterId, r.lift, r.n);
      if (outbox && outbox[k]) return;
      var cur = c[k];
      if (cur && cur.srvAt && r.srvAt && Date.parse(cur.srvAt) > Date.parse(r.srvAt)) return;   // an older echo
      c[k] = Object.assign({}, cur || {}, r); delete c[k].key;
    });
    return c;
  }

  // ------------------------------------------------------------ pure: results
  // The done meet each lifter gets from finish_meet_day (mirrored in SQL): the best good lift per
  // discipline (null = none made), made of taken, the attempts in the notes ("x" = missed).
  function finishResults(day, lifters, cells) {
    var out = [];
    (lifters || []).forEach(function (l) {
      var best = {}, made = 0, taken = 0, bombed = [], parts = [];
      LIFTS.forEach(function (lift) {
        var att = [1, 2, 3].map(function (n) { return cells[attemptKey(l.id, lift, n)]; }).filter(function (c) { return c && isResult(c.status); });
        var good = att.filter(function (c) { return c.status === 'good'; }).map(function (c) { return num(c.kg); });
        taken += att.length; made += good.length;
        best[lift] = good.length ? Math.max.apply(null, good) : null;
        if (att.length === 3 && !good.length) bombed.push(lift);
        if (att.length) parts.push(LIFT_NAME[lift] + ' ' + att.map(function (c) { return (c.status === 'no' ? 'x' : '') + kgText(c.kg); }).join(', '));
      });
      if (!taken) return;
      var total = r1(LIFTS.reduce(function (s, k) { return s + (best[k] || 0); }, 0));
      out.push({ lifterId: l.id, athleteId: l.athleteId || null, meetId: l.meetId || null, name: (day && day.name) || 'Meet', date: day && day.date,
        federation: (day && day.federation) || '', division: (day && day.division) || '', weightClass: l.weightClass || '',
        bodyweight: l.bodyweight == null || l.bodyweight === '' ? null : num(l.bodyweight),
        squat: best.squat, bench: best.bench, deadlift: best.deadlift, total: total, made: made, taken: taken, bombed: bombed,
        notes: made + ' of ' + taken + ' made · ' + parts.join(' · ') + ' kg · Meet day board' });
    });
    return out;
  }
  // The Meets list: planned meets from today on, grouped by meet (same name and date), lifters on
  // the roster only, and how many of them have an attempt plan.
  function groupMeets(meets, athletes, today) {
    var names = {}; (athletes || []).forEach(function (a) { names[a.id] = a.name || ''; });
    var groups = {};
    (meets || []).forEach(function (m) {
      if (!m || !planned(m) || !m.date || iso(m.date) < today || names[m.athleteId] == null) return;
      var key = String(m.name || 'Meet').trim().toLowerCase() + '|' + iso(m.date);
      var g = groups[key] || (groups[key] = { key: key, name: String(m.name || 'Meet').trim(), date: iso(m.date), daysOut: daysBetween(today, iso(m.date)),
        federation: m.federation || '', division: m.division || '', weighIn: m.weighIn || null, weighInAt: m.weighInAt || null, rows: [], planned: 0 });
      var has = !!(m.attemptPlan && LIFTS.some(function (l) { return Array.isArray(m.attemptPlan[l]); }));
      g.rows.push({ meetId: m.id, athleteId: m.athleteId, name: names[m.athleteId], weightClass: m.weightClass || '', planned: has });
      if (has) g.planned++;
    });
    return Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name); })
      .map(function (g) { g.rows.sort(function (a, b) { return a.name.localeCompare(b.name); }); return g; });
  }

  // A lifter from another team in the flight (a guest row): their openers off the venue's board; the
  // second and third are a guess (+5% / +10%) until the table declares them. Only lifts with an opener.
  function guestCells(lifterId, openers) {
    var c = {};
    LIFTS.forEach(function (lift) {
      var op = num(openers && openers[lift]);
      if (!(op >= MIN_BAR && op <= MAX_KG)) return;
      var kg = climb([rStep(op, 0.5), rStep(op * 1.05), rStep(op * 1.1)]).map(function (k) { return Math.min(MAX_KG, k); });
      [1, 2, 3].forEach(function (n) { c[attemptKey(lifterId, lift, n)] = { lifterId: lifterId, lift: lift, n: n, kg: kg[n - 1], status: 'planned', changes: 0, at: 0 }; });
    });
    return c;
  }
  // Ids made on the device, so a board (and a guest) started offline already has its server id.
  function uuid() {
    var c = root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  var pure = {
    LIFTS: LIFTS, STRATS: STRATS, attemptKey: attemptKey, kgText: kgText, rStep: rStep,
    projectedMax: projectedMax, planLift: planLift, sexFromClass: sexFromClass, planAlternatives: planAlternatives, planTotals: planTotals, normalizePlan: normalizePlan,
    liftingOrder: liftingOrder, position: position, outFor: outFor, etas: etas, warmups: warmups, floorFor: floorFor, applyAction: applyAction,
    localWins: localWins, reconcileCell: reconcileCell, queue: queue, outgoing: outgoing, serverApply: serverApply, afterFlush: afterFlush, mergeIncoming: mergeIncoming,
    markDirty: markDirty, lifterPatch: lifterPatch, mergeLifter: mergeLifter, guestCells: guestCells, uuid: uuid,
    finishResults: finishResults, groupMeets: groupMeets
  };

  // =====================================================================
  // Everything below touches the Store, the network or the DOM.
  // =====================================================================
  var DEMO_ID = 'demo-md-1', DEMO_SRV = 'powa-md-demo-srv', LOCAL_PLANS = 'powa-attempt-plans';
  function S() { return root.Store && root.Store.get ? root.Store.get() : {}; }
  function me() { return root._user || null; }
  function isDemo() { return !!root._demoMode; }
  function today() { return typeof root.todayISO === 'function' ? root.todayISO() : new Date().toISOString().slice(0, 10); }
  // Text nodes (el's string children) are already safe; anything that becomes markup goes through esc.
  function esc(s) { return typeof root.escHtml === 'function' ? root.escHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function E() { return root.el.apply(null, arguments); }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function say(m) { if (typeof root.toast === 'function') root.toast(m); }
  function online() { return typeof navigator === 'undefined' || navigator.onLine !== false; }
  function first(name) { return String(name || '').trim().split(/\s+/)[0] || 'They'; }
  function ord(n) { return ['1st', '2nd', '3rd'][n - 1] || n + 'th'; }
  function clock(ms) { if (ms == null) return ''; var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function dayText(isoDay) {
    if (!isoDay) return '';
    var d = new Date(isoDay + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function athlete(id) { return (S().athletes || []).find(function (a) { return a.id === id; }) || (me() && me().id === id ? me() : null); }
  function latestBw(id) { return typeof root.latestBodyweight === 'function' ? root.latestBodyweight(id) : null; }
  // The sex a total is scored as: the plan's (the coach set it), the profile's, else what the lifter's
  // class says (IPF classes never overlap between the sexes), else the lifter's own preference.
  function sexOf(id, plan, meet) {
    var a = athlete(id);
    if (plan && plan.sex) return plan.sex;
    if (a && a.sex) return a.sex;
    var byCls = sexFromClass(meet && meet.weightClass);
    if (!byCls) { var g = (S().goals || []).find(function (x) { return x.athleteId === id; }); byCls = sexFromClass(g && g.targetClass); }
    if (byCls) return byCls;
    return me() && me().id === id && typeof root.getSexPref === 'function' ? root.getSexPref() : null;
  }
  function haptic(s) { try { if (typeof root.hapticTap === 'function') root.hapticTap(s); } catch (e) {} }

  // ------------------------------------------------------------ plans in the Store
  function localPlans() { return lsGet(LOCAL_PLANS) || {}; }
  function planOf(meet) { return meet ? (meet.attemptPlan || localPlans()[meet.id] || null) : null; }
  function hasPlan(meet) { var p = planOf(meet); return !!(p && LIFTS.some(function (l) { return Array.isArray(p[l]); })); }
  // The lifter's numbers, the way the planner reads them.
  function evidence(athleteId) {
    var s = S(), t = today();
    var logs = (s.workoutLogs || []).filter(function (l) { return l.athleteId === athleteId; });
    var meets = (s.meets || []).filter(function (m) { return m.athleteId === athleteId; });
    var out = {};
    LIFTS.forEach(function (l) { out[l] = projectedMax(logs, meets, l, t); });
    return out;
  }
  function computePlan(athleteId, strategy, sex) {
    var ev = evidence(athleteId), p = { v: 1, strategy: strategy || 'standard', sex: sex || null };
    LIFTS.forEach(function (l) { var x = planLift({ max: ev[l].max, refKg: ev[l].refKg, strategy: p.strategy }); if (x) p[l] = x.kg; });
    return p;
  }
  // The coach's plan for the lifter's next meet, shaped like athlete.html getMeetPlan (meet mode lifts from it).
  function lifterPlan(athleteId, todayIso) {
    var t = todayIso || today();
    var next = (S().meets || []).filter(function (m) { return m.athleteId === athleteId && planned(m) && iso(m.date) >= t; })
      .sort(function (a, b) { return iso(a.date) < iso(b.date) ? -1 : 1; })[0];
    var p = planOf(next);
    if (!p || !LIFTS.some(function (l) { return Array.isArray(p[l]) && p[l][0]; })) return null;
    var out = { lifts: {}, total: 0, label: 'Your coach\'s plan', coach: true, meet: next };
    LIFTS.forEach(function (l) {
      var a = p[l];
      if (!a || !a[0]) return;
      var att = [0, 1, 2].map(function (i) { return num(a[i]) || rStep(num(a[0]) + i * STEP); });
      out.lifts[l] = { e1: typeof root.bestE1RM === 'function' ? root.bestE1RM(athleteId, l) : 0, attempts: att };
      out.total += Math.max.apply(null, att);
    });
    return out;
  }

  // ------------------------------------------------------------ the overlay shell
  var openShells = [];
  function shell(title, sub, opts) {
    opts = opts || {};
    var rootEl = E('div', { class: 'md-root' + (opts.cls ? ' ' + opts.cls : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    var head = E('div', { class: 'md-head' });
    var x = E('button', { class: 'md-x', type: 'button', 'aria-label': 'Close' });
    x.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    var titles = E('div', { class: 'md-titles' }, E('h2', { class: 'md-title' }, title), sub ? E('div', { class: 'md-sub' }, sub) : null);
    var tools = E('div', { class: 'md-tools' });
    head.appendChild(x); head.appendChild(titles); head.appendChild(tools);
    var body = E('div', { class: 'md-body' });
    rootEl.appendChild(head); rootEl.appendChild(body);
    var closed = false;
    // Captured on document, so the page under the overlay (the desk's single-key shortcuts, its
    // Cmd-K palette) never acts on a key meant for the board. A sheet over the shell has the keys.
    var onKey = function (e) {
      if (openShells[openShells.length - 1] !== api || document.querySelector('.ui-sheet-veil, .md-sheet')) return;
      var t = e.target, typing = !!(t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]'));
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (opts.onKey) opts.onKey(e);
      if (!typing && (e.metaKey || e.ctrlKey || (e.key.length === 1 && e.key !== ' '))) e.stopPropagation();
    };
    var close = function (force) {
      if (closed) return;
      // The planner asks first when a plan is not saved (opts.beforeClose returns true to hold).
      if (force !== true && opts.beforeClose && opts.beforeClose(function () { close(true); })) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      openShells = openShells.filter(function (s) { return s !== api; });
      rootEl.classList.add('is-leaving');
      setTimeout(function () { rootEl.remove(); }, 160);
      if (!openShells.length) document.documentElement.classList.remove('md-open');
      if (opts.onClose) opts.onClose();
    };
    x.addEventListener('click', function () { close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(rootEl);
    document.documentElement.classList.add('md-open');
    var api = { el: rootEl, head: head, body: body, tools: tools, titles: titles, close: close,
      setTitle: function (t, s) { titles.innerHTML = ''; titles.appendChild(E('h2', { class: 'md-title' }, t)); if (s) titles.appendChild(E('div', { class: 'md-sub' }, s)); } };
    openShells.push(api);
    rootEl.setAttribute('tabindex', '-1');
    setTimeout(function () { try { rootEl.focus({ preventScroll: true }); } catch (e) {} }, 40);
    return api;
  }
  // A small in-shell sheet (confirmations, forms). → close()
  function sheet(title, build) {
    var veil = E('div', { class: 'md-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    var card = E('div', { class: 'md-sheet-card' }, E('h3', { class: 'md-sheet-h' }, title));
    veil.appendChild(card);
    // Removed with the same capture flag it was added with, or every closed sheet keeps eating Escape.
    var close = function () { document.removeEventListener('keydown', onKey, true); veil.remove(); };
    var onKey = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(veil);
    build(card, close);
    setTimeout(function () { var f = card.querySelector('input, button.md-btn-primary, button'); try { if (f) f.focus({ preventScroll: true }); } catch (e) {} }, 40);
    return close;
  }
  function btn(label, cls, onClick, attrs) {
    var b = E('button', Object.assign({ type: 'button', class: 'md-btn' + (cls ? ' ' + cls : '') }, attrs || {}), label);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function liftDot(l) { return E('span', { class: 'md-dot md-' + l, 'aria-hidden': 'true' }); }

  // =====================================================================
  // 1. THE ATTEMPT PLANNER
  // =====================================================================
  function openAttemptPlanner(idOrAthlete) {
    var s = S(), t = today();
    var meet = (s.meets || []).find(function (m) { return m.id === idOrAthlete; });
    var athleteId = meet ? meet.athleteId : idOrAthlete;
    if (!meet) {
      meet = (s.meets || []).filter(function (m) { return m.athleteId === athleteId && planned(m) && iso(m.date) >= t; })
        .sort(function (a, b) { return iso(a.date) < iso(b.date) ? -1 : 1; })[0] || null;
    }
    if (!meet) { if (athlete(athleteId)) return planNewMeet(athleteId); say('No lifter or meet to plan'); return null; }
    // Everyone on the roster at the same meet (same name, same day): one planner, a list down the side.
    var grp = groupMeets(s.meets, s.athletes || [], '0000-00-00').find(function (g) { return g.rows.some(function (r) { return r.meetId === meet.id; }); });
    var rows = grp ? grp.rows : [{ meetId: meet.id, athleteId: meet.athleteId, name: (athlete(meet.athleteId) || {}).name || 'Lifter' }];
    var st = { sel: meet.id, drafts: {}, dirty: {} };
    var dirtyIds = function () { return Object.keys(st.dirty).filter(function (k) { return st.dirty[k]; }); };
    var sh = shell(String(meet.name || 'Meet'), [dayText(iso(meet.date)), meet.federation, meet.division].filter(Boolean).join(' · '), { cls: 'md-planner',
      beforeClose: function (leave) {
        var n = dirtyIds().length;
        if (!n) return false;
        sheet(n === 1 ? 'This plan is not saved' : n + ' plans are not saved', function (card, closeSheet) {
          card.appendChild(E('p', { class: 'md-sheet-sub' }, 'Lifters see a plan in meet mode once it is saved.'));
          card.appendChild(btn(n === 1 ? 'Save plan' : 'Save ' + n + ' plans', 'md-btn-primary md-btn-block', function () { closeSheet(); saveAll(leave); }));
          card.appendChild(btn('Close without saving', 'md-btn-quiet md-btn-block', function () { closeSheet(); leave(); }));
        });
        return true;
      } });
    var draft = function (meetId) {
      if (!st.drafts[meetId]) {
        var m = (S().meets || []).find(function (x) { return x.id === meetId; });
        var saved = planOf(m);
        st.drafts[meetId] = saved ? normalizePlan(saved) : computePlan(m.athleteId, 'standard', sexOf(m.athleteId, null, m));
        if (!saved) st.dirty[meetId] = true;   // a fresh plan is unsaved until the coach saves it
      }
      return st.drafts[meetId];
    };
    rows.forEach(function (r) { draft(r.meetId); });
    var list = E('nav', { class: 'md-pl-list', 'aria-label': 'Lifters at this meet' });
    var main = E('div', { class: 'md-pl-main' });
    var foot = E('div', { class: 'md-pl-foot' });
    // One lifter at this meet: no list down the side, the plan has the room.
    sh.body.appendChild(E('div', { class: 'md-pl' + (rows.length < 2 ? ' is-single' : '') }, list, main));
    sh.el.appendChild(foot);

    var paintList = function () {
      list.innerHTML = '';
      rows.forEach(function (r) {
        var m = (S().meets || []).find(function (x) { return x.id === r.meetId; }) || {};
        var d = st.drafts[r.meetId], tot = planTotals(d, {}).total;
        var b = E('button', { type: 'button', class: 'md-pl-item' + (r.meetId === st.sel ? ' on' : ''), 'aria-current': r.meetId === st.sel ? 'true' : 'false' },
          E('span', { class: 'md-pl-name' }, r.name),
          E('span', { class: 'md-pl-meta' }, [m.weightClass || '', tot ? kgText(tot) + ' kg' : 'No numbers yet'].filter(Boolean).join(' · ')),
          E('span', { class: 'md-pl-state' + (st.dirty[r.meetId] ? ' is-dirty' : hasPlan(m) ? ' is-saved' : '') }, st.dirty[r.meetId] ? 'Not saved' : hasPlan(m) ? 'Planned' : ''));
        b.addEventListener('click', function () { st.sel = r.meetId; paint(); });
        list.appendChild(b);
      });
    };
    var paintMain = function () {
      main.innerHTML = '';
      var m = (S().meets || []).find(function (x) { return x.id === st.sel; });
      var a = athlete(m.athleteId) || { name: 'Lifter' };
      var d = st.drafts[st.sel], ev = evidence(m.athleteId);
      var bw = latestBw(m.athleteId), sex = d.sex || sexOf(m.athleteId, null, m) || 'male';
      var tot = planTotals(d, { bw: bw, sex: sex, federation: m.federation, division: m.division, weightClass: m.weightClass });
      var head = E('div', { class: 'md-pl-head' });
      head.appendChild(E('h3', { class: 'md-pl-who' }, a.name));
      var clsLine = (tot.cls ? tot.cls + ' class' : 'No class yet') + (bw ? ' · weighs ' + kgText(r1(bw)) + ' kg' : '');
      var oc = bw && tot.cls ? overClass(bw, tot.cls) : null;
      head.appendChild(E('div', { class: 'md-pl-cls' }, clsLine, oc && oc.over ? E('span', { class: 'md-pl-over' }, oc.text) : null));
      main.appendChild(head);
      // Strategy: three lines, the same as the lifter's own sheet.
      var seg = E('div', { class: 'md-seg', role: 'radiogroup', 'aria-label': 'Plan' });
      Object.keys(STRATS).forEach(function (k) {
        var on = d.strategy === k;
        var b = E('button', { type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', class: on ? 'on' : '' }, STRATS[k].label);
        b.addEventListener('click', function () {
          st.drafts[st.sel] = Object.assign(computePlan(m.athleteId, k, d.sex), { note: d.note });
          st.dirty[st.sel] = true; paint();
        });
        seg.appendChild(b);
      });
      main.appendChild(seg);
      var grid = E('div', { class: 'md-pl-grid', role: 'table', 'aria-label': 'Attempts' });
      grid.appendChild(E('div', { class: 'md-pl-row md-pl-th', role: 'row' }, E('span', { role: 'columnheader' }, 'Lift'),
        E('span', { role: 'columnheader' }, 'Opener'), E('span', { role: 'columnheader' }, 'Second'), E('span', { role: 'columnheader' }, 'Third')));
      LIFTS.forEach(function (l) {
        var e = ev[l], kg = d[l] || [null, null, null];
        var plan = planLift({ max: e.max, refKg: e.refKg, strategy: d.strategy });
        var base = plan ? plan.base : e.max;
        var row = E('div', { class: 'md-pl-row', role: 'row' });
        var lab = E('div', { class: 'md-pl-lift', role: 'rowheader' }, E('span', { class: 'md-pl-liftname' }, liftDot(l), LIFT_NAME[l]));
        var facts = [];
        if (e.max) facts.push((e.source === 'heavy' ? 'Max ' + kgText(Math.round(e.max)) + ' from heavy sets' : e.source === 'recent' ? 'e1RM ' + kgText(Math.round(e.max)) + ', no heavy sets lately' : e.source === 'meet' ? 'Meet best ' + kgText(Math.round(e.max)) : 'Best e1RM ' + kgText(Math.round(e.max)) + ', none lately'));
        if (e.single) facts.push('single ' + kgText(e.single.kg) + ', ' + daysBetween(e.single.date, today()) + ' d ago');
        lab.appendChild(E('span', { class: 'md-pl-facts' }, facts.join(' · ') || 'No sets logged yet'));
        if (plan && plan.bounced) lab.appendChild(E('span', { class: 'md-pl-bounce' }, 'Held to this month\'s heavy sets: ' + kgText(Math.round(plan.base)) + ', not ' + kgText(Math.round(e.max))));
        row.appendChild(lab);
        [0, 1, 2].forEach(function (i) {
          var cell = E('div', { class: 'md-pl-cell' + (i === 2 ? ' is-third' : ''), role: 'cell' });
          var setKg = function (v) {
            var a2 = (d[l] || [null, null, null]).slice(); a2[i] = v == null ? null : Math.max(MIN_BAR, Math.min(MAX_KG, rStep(v, 0.5)));
            d[l] = a2; st.dirty[st.sel] = true; paint();
          };
          var minus = E('button', { type: 'button', class: 'md-step', 'aria-label': LIFT_NAME[l] + ' ' + ord(i + 1) + ' lighter' }, '−');
          var plus = E('button', { type: 'button', class: 'md-step', 'aria-label': LIFT_NAME[l] + ' ' + ord(i + 1) + ' heavier' }, '+');
          var inp = E('input', { type: 'text', inputmode: 'decimal', class: 'md-kg-in', value: kg[i] == null ? '' : kgText(kg[i]), 'aria-label': LIFT_NAME[l] + ' ' + ord(i + 1) + ' attempt, kg', placeholder: '–' });
          minus.addEventListener('click', function () { setKg(num(kg[i] || (kg[0] || 60)) - STEP); });
          plus.addEventListener('click', function () { setKg(num(kg[i] || (kg[0] || 60)) + STEP); });
          inp.addEventListener('change', function () { var v = parseFloat(String(inp.value).replace(',', '.')); setKg(isFinite(v) ? v : null); });
          cell.appendChild(E('span', { class: 'md-pl-n', 'aria-hidden': 'true' }, ['Opener', 'Second', 'Third'][i]));
          cell.appendChild(E('div', { class: 'md-kg-edit' }, minus, inp, plus));
          var pct = base > 0 && kg[i] ? Math.round(num(kg[i]) / base * 100) + '%' : '';
          cell.appendChild(E('span', { class: 'md-pl-pct' }, pct ? pct + ' of max' : ''));
          if (i > 0 && kg[i - 1]) {
            var bestKg = Math.max(num(e.max), e.single ? e.single.kg : 0);
            var alts = planAlternatives(num(kg[i - 1]), num(kg[i]) || null, bestKg).filter(function (o) { return o.kg !== num(kg[i]); });
            if (alts.length) {
              var chips = E('div', { class: 'md-alts', role: 'group', 'aria-label': 'Choices for the ' + ord(i + 1) });
              alts.forEach(function (o) {
                var on = num(kg[i]) === o.kg;
                var c = E('button', { type: 'button', class: 'md-alt' + (on ? ' on' : '') + (o.key === 'send' ? ' is-send' : ''), title: o.prBy ? 'A PR by ' + kgText(o.prBy) + ' kg' : o.why },
                  E('span', {}, o.key === 'safe' ? 'Safe' : o.key === 'plan' ? 'Plan' : 'Send'), E('b', {}, kgText(o.kg)));
                c.addEventListener('click', function () { setKg(o.kg); });
                chips.appendChild(c);
              });
              cell.appendChild(chips);
            }
          }
          row.appendChild(cell);
        });
        grid.appendChild(row);
      });
      main.appendChild(grid);
      // One line of totals: every number once.
      var sum = E('div', { class: 'md-pl-sum' });
      sum.appendChild(E('div', { class: 'md-sum-cell' }, E('span', {}, 'Total'), E('b', {}, tot.total ? kgText(tot.total) : '–'), E('small', {}, 'kg')));
      sum.appendChild(E('div', { class: 'md-sum-cell' }, E('span', {}, 'Opening'), E('b', {}, tot.opening ? kgText(tot.opening) : '–'), E('small', {}, 'kg')));
      sum.appendChild(E('div', { class: 'md-sum-cell' }, E('span', {}, tot.score.label), E('b', {}, tot.score.points ? tot.score.points.toFixed(1) : '–')));
      var sexBtn = E('button', { type: 'button', class: 'md-link', 'aria-label': 'Scored as ' + sex + '. Change' }, 'Scored as ' + (sex === 'female' ? 'female' : 'male'));
      sexBtn.addEventListener('click', function () { d.sex = sex === 'female' ? 'male' : 'female'; st.dirty[st.sel] = true; paint(); });
      sum.appendChild(E('div', { class: 'md-sum-note' }, bw ? '' : 'Score after a weigh-in · ', sexBtn));
      main.appendChild(sum);
      var note = E('textarea', { class: 'md-note', rows: '2', maxlength: '280', placeholder: 'A note for ' + first(a.name) + ' (optional): “Open light, the third is the meet.”', 'aria-label': 'Note for the lifter' });
      note.value = d.note || '';
      note.addEventListener('input', function () { d.note = note.value; st.dirty[st.sel] = true; paintFoot(); paintList(); });
      main.appendChild(note);
    };
    var paintFoot = function () {
      foot.innerHTML = '';
      var n = Object.keys(st.dirty).filter(function (k) { return st.dirty[k]; }).length;
      var m = (S().meets || []).find(function (x) { return x.id === st.sel; });
      var who = first((athlete(m.athleteId) || {}).name);
      foot.appendChild(E('span', { class: 'md-foot-note' }, n ? (n === 1 ? 'One plan not saved' : n + ' plans not saved') : who + ' sees this plan in meet mode'));
      var save = btn(n > 1 ? 'Save ' + n + ' plans' : 'Save plan', 'md-btn-primary', function () { saveAll(); });
      if (!n) save.disabled = true;
      foot.appendChild(save);
    };
    var paint = function () { paintList(); paintMain(); paintFoot(); };
    var saveAll = function (then) {
      var ids = Object.keys(st.dirty).filter(function (k) { return st.dirty[k]; });
      var by = me() && me().name ? String(me().name).slice(0, 60) : '';
      var chain = Promise.resolve(), local = 0;
      ids.forEach(function (id) {
        var plan = normalizePlan(Object.assign({}, st.drafts[id], { at: new Date().toISOString(), by: by }));
        chain = chain.then(function () {
          var put = function () { if (root.Store) root.Store.update(function (x) { (x.meets || []).forEach(function (mm) { if (mm.id === id) mm.attemptPlan = plan; }); }); st.dirty[id] = false; };
          if (isDemo() || !root.DB || !root.DB.saveAttemptPlan) { put(); return; }
          return root.DB.saveAttemptPlan(id, plan).then(function (r) {
            if (r && r.ok) { put(); var lp = localPlans(); if (lp[id]) { delete lp[id]; lsSet(LOCAL_PLANS, lp); } return; }
            if (r && r.notReady) { var lp2 = localPlans(); lp2[id] = plan; lsSet(LOCAL_PLANS, lp2); put(); local++; return; }
            throw (r && r.error) || new Error('save failed');
          });
        });
      });
      chain.then(function () {
        say(local ? 'Saved on this laptop. Lifters see plans once the meet-day update is installed' : ids.length > 1 ? ids.length + ' plans saved' : 'Plan saved');
        if (typeof then === 'function') then(); else paint();
      }, function (e) { console.warn('saveAttemptPlan', e); say('Could not save. Try again'); paint(); });
    };
    paint();
    return sh;
  }
  // No planned meet yet: name it and date it first (a planned meet, never a result).
  function planNewMeet(athleteId) {
    var a = athlete(athleteId) || { name: 'Lifter' };
    sheet('Plan a meet for ' + first(a.name), function (card, close) {
      var name = E('input', { type: 'text', class: 'md-in', maxlength: '80', placeholder: 'Meet name', 'aria-label': 'Meet name' });
      var date = E('input', { type: 'date', class: 'md-in', 'aria-label': 'Meet date', min: today() });
      var fed = E('input', { type: 'text', class: 'md-in', maxlength: '40', placeholder: 'Federation (USAPL, Powerlifting America…)', 'aria-label': 'Federation' });
      card.appendChild(E('div', { class: 'md-form' }, name, date, fed));
      var go = btn('Plan attempts', 'md-btn-primary md-btn-block', function () {
        var m = { athleteId: athleteId, name: String(name.value || '').trim().slice(0, 80), date: date.value, federation: String(fed.value || '').trim().slice(0, 40), status: 'planned', planned: true,
          weightClass: '', division: '', bodyweight: null, squat: null, bench: null, deadlift: null, notes: '' };
        if (!m.name || !m.date) { say('Give the meet a name and a date'); return; }
        go.disabled = true;
        var put = function (saved) { root.Store.update(function (x) { (x.meets = x.meets || []).push(saved); }); close(); openAttemptPlanner(saved.id); };
        if (isDemo() || !root.DB || !root.DB.savePlannedMeet) { put(Object.assign({ id: 'demo-pm-' + Date.now() }, m)); return; }
        root.DB.savePlannedMeet(m).then(function (r) {
          if (r && r.ok) put(r.meet);
          else { go.disabled = false; say(r && r.notReady ? 'Planned meets need the meet-calendar update first' : 'Could not save. Try again'); }
        });
      });
      card.appendChild(go);
    });
    return null;
  }

  // =====================================================================
  // 2. THE MEET-DAY BOARD: data (demo stand-in / Supabase / this device)
  // =====================================================================
  function boardKey(id) { return 'powa-md-' + id; }
  function localBoardsKey() { return 'powa-md-local-' + ((me() && me().id) || 'x'); }
  var _lastStamp = 0;
  function stamp() { var t = Math.max(Date.now(), _lastStamp + 1); _lastStamp = t; return new Date(t).toISOString(); }
  // The demo meet day: six lifters, two flights, today. The phone demo's four plus the desk's Leo
  // (or a guest on the phone) and the lifter demo's own Demo Lifter, so a second tab on
  // athlete.html?demo=1 sees its next attempt move as the board is marked.
  var DEMO_LIFTERS = [
    { id: 'md-l1', athleteId: 'demo-a2', name: 'Sarah Kim', sex: 'female', flight: 'A', lot: 1, bodyweight: 62.6, base: [125, 72.5, 155] },
    { id: 'md-l2', athleteId: 'demo-a4', name: 'Nina Petrova', sex: 'female', flight: 'A', lot: 2, bodyweight: 56.1, base: [92.5, 52.5, 112.5] },
    { id: 'md-l3', athleteId: 'demo-athlete', name: 'Demo Lifter', sex: 'male', flight: 'A', lot: 3, bodyweight: 81.9, base: [180, 122.5, 215] },
    { id: 'md-l4', athleteId: 'demo-a1', name: 'Arjun Mehta', sex: 'male', flight: 'B', lot: 4, bodyweight: 73.4, base: [207.5, 137.5, 247.5] },
    { id: 'md-l5', athleteId: 'demo-a3', name: 'Tom Boyle', sex: 'male', flight: 'B', lot: 5, bodyweight: 103.8, base: [215, 145, 262.5] },
    { id: 'md-l6', athleteId: 'demo-d1', name: 'Leo Grant', sex: 'male', flight: 'B', lot: 6, bodyweight: 91.5, base: [195, 130, 240] }
  ];
  function demoSeed() {
    var srv = lsGet(DEMO_SRV);
    if (srv && srv.day && srv.day.date === today()) return srv;
    var t = today(), start = Date.now() + 25 * 60000;
    start = Math.ceil(start / 300000) * 300000;   // on a five-minute mark, like a real schedule
    var day = { id: DEMO_ID, name: 'Autumn Open', date: t, federation: 'USAPL', division: 'Raw Open', status: 'setup', sec: 60,
      breakSec: BREAK_SEC,
      // The venue's flights are bigger than the coach's team: ten in A and twelve in B, three of each ours.
      flights: { A: { start: new Date(start).toISOString(), size: 10 }, B: { start: new Date(start + 45 * 60000).toISOString(), size: 12 } } };
    var lifters = DEMO_LIFTERS.map(function (d) {
      var a = athlete(d.athleteId);
      return { id: d.id, athleteId: d.athleteId, name: d.name, sex: d.sex, flight: d.flight, lot: d.lot, bodyweight: d.bodyweight,
        weightClass: typeof root.weightClassFor === 'function' ? root.weightClassFor(d.bodyweight, d.sex) : '', meetId: 'demo-md-meet-' + d.id,
        rack: d.flight === 'A' ? { squat: '9', safety: '4', bench: '3', blocks: d.sex === 'female' ? 'yes' : '' } : { squat: '12', safety: '6', bench: '4', blocks: '' }, known: !!a };
    });
    var cells = {};
    lifters.forEach(function (l, i) {
      var ev = evidence(l.athleteId);
      LIFTS.forEach(function (lift, li) {
        var fresh = ev[lift].source === 'heavy' || ev[lift].source === 'recent';
        var p = planLift({ max: fresh ? ev[lift].max : DEMO_LIFTERS[i].base[li], refKg: fresh ? ev[lift].refKg : 0, strategy: 'standard' });
        [1, 2, 3].forEach(function (n) {
          cells[attemptKey(l.id, lift, n)] = { lifterId: l.id, lift: lift, n: n, kg: p.kg[n - 1], status: 'planned', changes: 0, at: 0, srvAt: stamp() };
        });
      });
    });
    srv = { day: day, lifters: lifters, srv: cells };
    lsSet(DEMO_SRV, srv);
    lsSet(boardKey(DEMO_ID), null);
    return srv;
  }
  // The demo coach's roster carries the board's planned meets (dates, never results) so Finish has
  // something to turn into a result, and the Meets list shows today's meet.
  function demoStoreMeets(srv) {
    if (!root.Store || !isDemo()) return;
    var ids = (S().athletes || []).map(function (a) { return a.id; }).concat(me() ? [me().id] : []);
    root.Store.update(function (x) {
      x.meets = x.meets || [];
      srv.lifters.forEach(function (l) {
        if (ids.indexOf(l.athleteId) < 0 || x.meets.some(function (m) { return m.id === l.meetId; })) return;
        var plan = { v: 1, strategy: 'standard', sex: l.sex };
        LIFTS.forEach(function (lift) { plan[lift] = [1, 2, 3].map(function (n) { var c = srv.srv[attemptKey(l.id, lift, n)]; return c ? c.kg : null; }); });
        x.meets.push({ id: l.meetId, athleteId: l.athleteId, name: srv.day.name, date: srv.day.date, status: 'planned', planned: true, federation: srv.day.federation,
          division: srv.day.division, weightClass: l.weightClass, weighIn: '2h', weighInAt: null, bodyweight: null, squat: null, bench: null, deadlift: null, notes: '', attemptPlan: plan });
      });
    });
  }

  // Board state. mode: 'demo' (the stand-in above), 'remote' (Supabase), 'local' (this device only:
  // before the migration). Everything is kept in localStorage first: the board opens and marks
  // offline, and the outbox goes up when the wifi is back.
  var B = null;
  function persist() {
    if (B) lsSet(boardKey(B.id), { day: B.day, lifters: B.lifters, cells: B.cells, outbox: B.outbox, lastLive: B.lastLive || {}, dirtyLifters: B.dirtyLifters || {},
      dirtyDay: !!B.dirtyDay, pendingCreate: !!B.pendingCreate, at: Date.now() });
  }
  function loadBoard(id) {
    var saved = lsGet(boardKey(id)) || {};
    var mode = id === DEMO_ID ? 'demo' : String(id).indexOf('local-') === 0 ? 'local' : 'remote';
    var b = { id: id, mode: mode, day: saved.day || null, lifters: saved.lifters || [], cells: saved.cells || {}, outbox: saved.outbox || {}, lastLive: saved.lastLive || {},
      dirtyLifters: saved.dirtyLifters || {}, dirtyDay: !!saved.dirtyDay, pendingCreate: !!saved.pendingCreate,
      sync: 'idle', err: null, retry: 0, view: 'board', flight: null, sel: null, draft: null };
    if (mode === 'demo') {
      var srv = demoSeed();
      demoStoreMeets(srv);
      b.day = srv.day; b.lifters = srv.lifters;
      b.cells = mergeIncoming(b.cells, b.outbox, Object.keys(srv.srv).map(function (k) { return Object.assign({ key: k }, srv.srv[k]); }));
    }
    return b;
  }
  // The order on the board and the clock it runs on (the venue's other lifters, the seconds an
  // attempt and the break between lifts are the coach's settings on the Lifters tab).
  function boardOrder() { return liftingOrder(B.lifters, B.cells, B.day && B.day.flights); }
  function clockOpts(day, now) { return { now: now, starts: flightStarts(day), sec: (day && day.sec) || SEC_PER_ATTEMPT, breakSec: day && day.breakSec != null ? day.breakSec : BREAK_SEC }; }
  // Server lifters with this laptop's unsent fields kept (per field), plus lifters added here and not sent yet.
  function mergeLifters(serverLifters, b) {
    var local = {}; b.lifters.forEach(function (l) { local[l.id] = l; });
    var seen = {};
    var out = serverLifters.map(function (l) { seen[l.id] = 1; return b.dirtyLifters[l.id] ? mergeLifter(l, local[l.id], b.dirtyLifters[l.id]) : l; });
    b.lifters.forEach(function (l) { if (!seen[l.id] && b.dirtyLifters[l.id] && b.dirtyLifters[l.id]._new) out.push(l); });
    return out;
  }
  function pull() {
    if (!B || B.mode !== 'remote' || B.pendingCreate || !online() || !root.DB || !root.DB.getMeetDay) return Promise.resolve();
    var id = B.id;
    return root.DB.getMeetDay(id).then(function (r) {
      if (!B || B.id !== id || !r || !r.ok) return;
      // A flight start or setting still waiting to go up keeps this laptop's version.
      B.day = B.dirtyDay && B.day ? Object.assign({}, r.day, { flights: B.day.flights, sec: B.day.sec, breakSec: B.day.breakSec }) : r.day;
      B.lifters = mergeLifters(r.lifters, B);
      B.cells = mergeIncoming(B.cells, B.outbox, r.attempts.map(function (a) { return Object.assign({ key: attemptKey(a.lifterId, a.lift, a.n) }, a); }));
      if (B.day.status === 'done') dropOutbox(B, true);
      persist(); paintBoard();
    }).catch(function () {});
  }
  // What each lifter's phone shows (pushed with the marks in remote mode; computed in the demo).
  function liveFor(lifters, cells, day, now) {
    var order = liftingOrder(lifters, cells, day && day.flights), t = etas(order, clockOpts(day, now)), out = {};
    lifters.forEach(function (l) {
      var o = outFor(order, l.id);
      if (!o) { out[l.id] = { done: true }; return; }
      var opener = cells[attemptKey(l.id, o.entry.lift, 1)];
      out[l.id] = { lift: o.entry.lift, n: o.entry.n, kg: o.entry.kg, status: o.entry.status, out: o.out, eta: t[o.index], flight: o.entry.flight, opener: opener ? opener.kg : null };
    });
    return out;
  }
  function flightStarts(day) {
    var o = {}, f = (day && day.flights) || {};
    Object.keys(f).forEach(function (k) { var ms = Date.parse(f[k] && f[k].start); if (isFinite(ms)) o[k] = ms; });
    return o;
  }
  // The meet was finished on another device: marks still queued here can never go up. Say so once.
  function dropOutbox(b, quiet) {
    var n = Object.keys(b.outbox).length;
    b.outbox = {}; b.day = Object.assign({}, b.day, { status: 'done' }); b.sync = 'saved';
    if (n) say('The meet was finished on another device. ' + (n === 1 ? 'One mark made here was' : n + ' marks made here were') + ' not saved');
    else if (!quiet) say('The meet was finished on another device');
  }
  function lostText(lost) {
    var x = lost[0], l = B.lifters.find(function (y) { return y.id === x.lifterId; }) || {};
    var what = x.kept === 'good' ? 'a good lift' : x.kept === 'no' ? 'no lift' : x.kept === 'declared' ? kgText(x.kg) + ' kg' : 'planned';
    return (l.name || 'A lifter') + '\'s ' + ord(x.n) + ' ' + LIFT_NAME[x.lift].toLowerCase() + ' was called ' + what + ' on the other laptop' + (lost.length > 1 ? ' (and ' + (lost.length - 1) + ' more)' : '');
  }
  var flushTimer = null, flushing = null;
  function scheduleFlush(ms) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms == null ? 250 : ms); }
  function retryLater(b) { b.retry = Math.min(5, b.retry + 1); b.sync = online() ? 'retry' : 'offline'; paintSync(); scheduleFlush([2, 5, 10, 20, 30, 30][b.retry] * 1000); }
  // A board started on this laptop goes up first (its ids were made here, so marks made before that
  // are already keyed to the server's rows). Before the migration it waits: the board works here.
  function ensureCreated(b) {
    if (!b.pendingCreate) return Promise.resolve(true);
    return root.DB.createMeetDay(b.day, b.lifters).then(function (r) {
      if (B !== b) return false;
      if (r && r.ok) {
        b.pendingCreate = false;
        Object.keys(b.dirtyLifters).forEach(function (id) { var d = Object.assign({}, b.dirtyLifters[id]); delete d._new; b.dirtyLifters[id] = d; });
        forgetPending(b.id); persist();
        if (_meetsHost && document.body.contains(_meetsHost)) try { renderMeetsScreen(_meetsHost); } catch (e) {}
        return true;
      }
      if (r && r.notReady) { b.sync = 'local'; paintSync(); return false; }
      retryLater(b); return false;
    }, function () { retryLater(b); return false; });
  }
  // Lifter fields and day settings changed here (online or not) go up before the marks: a guest's
  // row must exist before its attempts can.
  function pushLifters(b) {
    var jobs = [];
    if (b.dirtyDay) {
      var dv = b.dirtyDayV || 0;
      jobs.push(root.DB.updateMeetDay(b.id, { flights: b.day.flights, sec: b.day.sec, breakSec: b.day.breakSec }).then(function (r) { if (r && r.ok && (b.dirtyDayV || 0) === dv) b.dirtyDay = false; }));
    }
    Object.keys(b.dirtyLifters).forEach(function (id) {
      var d = b.dirtyLifters[id], l = b.lifters.find(function (x) { return x.id === id; });
      if (!l) { delete b.dirtyLifters[id]; return; }
      var v = d._v;
      var q = d._new ? root.DB.insertMeetDayLifter(l, b.id) : root.DB.patchMeetDayLifter(id, b.id, lifterPatch(l, d));
      jobs.push(q.then(function (r) {
        if (!r || !r.ok) return;
        var now2 = b.dirtyLifters[id];
        if (now2 && now2._v === v) delete b.dirtyLifters[id];
        else if (now2) { now2 = Object.assign({}, now2); delete now2._new; b.dirtyLifters[id] = now2; }
      }, function () {}));
    });
    return Promise.all(jobs).then(function () { if (B === b) persist(); });
  }
  function flush() {
    if (!B) return Promise.resolve();
    if (flushing) return flushing.then(function () { return flush(); });
    var b = B;
    if (b.mode === 'local') { b.sync = 'local'; paintSync(); return Promise.resolve(); }
    if (!online()) { b.sync = 'offline'; paintSync(); return Promise.resolve(); }
    var sent = outgoing(b.outbox, b.cells);
    if (b.mode === 'demo') {
      if (!sent.length) { b.sync = 'saved'; paintSync(); return Promise.resolve(); }
      var srv = lsGet(DEMO_SRV) || demoSeed();
      var s = serverApply(srv.srv, sent, stamp);
      srv.srv = s.srv;
      if (s.rows.some(function (r) { return isResult(r.status); }) && srv.day.status === 'setup') srv.day.status = 'live';
      lsSet(DEMO_SRV, srv);
      var af = afterFlush(b.cells, b.outbox, sent, s.rows);
      b.cells = af.cells; b.outbox = af.outbox; b.day = Object.assign({}, b.day, { status: srv.day.status }); b.sync = Object.keys(b.outbox).length ? 'pending' : 'saved';
      persist(); paintBoard();
      return Promise.resolve();
    }
    var run = ensureCreated(b).then(function (created) {
      if (!created || B !== b) return;
      return pushLifters(b).then(function () {
        if (B !== b) return;
        // remote: the marks and what changed on each lifter's phone.
        // A guest whose row has not gone up yet keeps its cells queued (the server would skip them).
        sent = outgoing(b.outbox, b.cells).filter(function (c) { return !(b.dirtyLifters[c.lifterId] && b.dirtyLifters[c.lifterId]._new); });
        var live = liveFor(b.lifters, b.cells, b.day, Date.now()), liveRows = [];
        Object.keys(live).forEach(function (id) {
          if (b.dirtyLifters[id] && b.dirtyLifters[id]._new) return;   // not on the server yet
          var v = Object.assign({}, live[id]); if (v.eta) v.eta = Math.round(v.eta / 60000) * 60000;   // a minute is precise enough
          if (JSON.stringify(v) !== JSON.stringify(b.lastLive[id])) { liveRows.push({ id: id, live: v }); }
        });
        var pendingL = Object.keys(b.dirtyLifters).length;
        if (!sent.length && !liveRows.length) { b.sync = pendingL ? 'pending' : 'saved'; paintSync(); if (pendingL) retryLater(b); return; }
        b.sync = 'saving'; paintSync();
        return root.DB.syncMeetDay(b.id, sent, liveRows).then(function (r) {
          if (B !== b) return;
          if (r && r.ok) {
            var af2 = afterFlush(b.cells, b.outbox, sent, r.cells.map(function (c) { return Object.assign({ key: attemptKey(c.lifterId, c.lift, c.n) }, c); }));
            b.cells = af2.cells; b.outbox = af2.outbox; b.retry = 0;
            // Sent and not answered: the server refused the cell (a lifter no longer on the roster, a
            // row removed). It never goes up, so it leaves the outbox instead of retrying forever.
            var answered = {}; r.cells.forEach(function (c) { answered[attemptKey(c.lifterId, c.lift, c.n)] = 1; });
            var refused = sent.filter(function (c) { return !answered[c.key] && b.outbox[c.key] && num(b.cells[c.key] && b.cells[c.key].at) <= num(c.at); });
            refused.forEach(function (c) { delete b.outbox[c.key]; });
            if (refused.some(function (c) { return c.status !== 'planned'; })) say(refused.length === 1 ? 'One mark was not saved: that lifter is no longer on your roster' : refused.length + ' marks were not saved: those lifters are no longer on your roster');
            var lost = af2.lost.filter(function (x) { return x.mine !== 'planned'; });
            if (lost.length) say(lostText(lost));
            liveRows.forEach(function (x) { b.lastLive[x.id] = x.live; });
            b.sync = Object.keys(b.outbox).length || Object.keys(b.dirtyLifters).length ? 'pending' : 'saved';
            persist(); paintBoard();
            if (Object.keys(b.outbox).length || Object.keys(b.dirtyLifters).length) scheduleFlush(Object.keys(b.dirtyLifters).length ? 3000 : 400);
          } else if (r && r.finished) { dropOutbox(b); persist(); paintBoard(); pull(); }
          else if (r && r.notReady) { b.sync = 'local'; paintSync(); }
          else retryLater(b);
        });
      });
    }).catch(function (e) { console.warn('meetday flush', e); if (B === b) retryLater(b); });
    flushing = run.then(function () { flushing = null; }, function () { flushing = null; });
    return run;
  }
  function act(action) {
    if (!B || B.day.status === 'done') return false;
    var r = applyAction(B.cells, action, Date.now());
    if (!r.ok) {
      if (r.reason === 'floor') say('At least ' + kgText(r.floor) + ' kg for this attempt');
      else if (r.reason === 'taken') say('That attempt is done. Undo the call first');
      return false;
    }
    B.cells = r.cells; B.outbox = queue(B.outbox, r.keys, B.cells);
    persist();
    if (action.type === 'good' || action.type === 'no') haptic(action.type === 'good' ? 'MEDIUM' : 'HEAVY');
    paintBoard(); scheduleFlush();
    return true;
  }

  // =====================================================================
  // 2b. THE BOARD (UI)
  // =====================================================================
  var BS = null;   // the board's shell + panes
  function openMeetDayBoard(meetDayId) {
    if (!meetDayId) return null;
    if (BS) { try { BS.sh.close(); } catch (e) {} }
    B = loadBoard(meetDayId);
    if (!B.day && B.mode !== 'remote') { say('That meet day is not on this device'); B = null; return null; }
    var sh = shell(B.day ? B.day.name : 'Meet day', '', { cls: 'md-board-root', onKey: boardKey_, onClose: function () {
      if (BS && BS.unsub) BS.unsub();
      window.removeEventListener('storage', onStorage); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline);
      clearInterval(BS && BS.tick); BS = null; B = null;
    } });
    BS = { sh: sh, tick: null, unsub: null };
    var syncChip = E('span', { class: 'md-sync', role: 'status', 'aria-live': 'polite' });
    var printB = btn('Print cards', 'md-btn-quiet', function () { printCards(); }, { title: 'Attempt cards for the table (P)' });
    var finB = btn('Finish meet', 'md-btn-quiet', function () { openFinish(); });
    sh.tools.appendChild(syncChip); sh.tools.appendChild(printB); sh.tools.appendChild(finB);
    var tabs = E('div', { class: 'md-tabs', role: 'tablist', 'aria-label': 'Meet day' });
    var main = E('div', { class: 'md-board-main' });
    sh.body.appendChild(tabs); sh.body.appendChild(main);
    Object.assign(BS, { syncChip: syncChip, tabs: tabs, main: main, printB: printB, finB: finB });
    var onStorage = function (e) {
      if (!B || B.mode !== 'demo' || e.key !== DEMO_SRV) return;
      var srv = lsGet(DEMO_SRV); if (!srv) return;
      B.day = srv.day; B.lifters = srv.lifters;
      B.cells = mergeIncoming(B.cells, B.outbox, Object.keys(srv.srv).map(function (k) { return Object.assign({ key: k }, srv.srv[k]); }));
      persist(); paintBoard();
    };
    var onOnline = function () { if (B) { B.sync = 'pending'; B.retry = 0; scheduleFlush(50); pull(); } };
    var onOffline = function () { if (B) { B.sync = 'offline'; paintSync(); } };
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (B.mode === 'remote' && root.DB && root.DB.subscribeMeetDay) {
      BS.unsub = root.DB.subscribeMeetDay(B.id, function (row) {
        if (!B) return;
        B.cells = mergeIncoming(B.cells, B.outbox, [Object.assign({ key: attemptKey(row.lifterId, row.lift, row.n) }, row)]);
        persist(); paintBoard();
      }, function (l, gone) {
        if (!B) return;
        if (gone) B.lifters = B.lifters.filter(function (x) { return x.id !== l.id; });
        else if (!B.lifters.some(function (x) { return x.id === l.id; })) B.lifters = B.lifters.concat([l]);
        else B.lifters = B.lifters.map(function (x) { return x.id === l.id ? mergeLifter(Object.assign({}, x, l), x, B.dirtyLifters[x.id]) : x; });
        persist(); if (B.view !== 'lifters') paintBoard();
      }, function (d) {
        // The day itself: another laptop moved a flight start, a setting, or finished the meet.
        if (!B || !B.day || !d) return;
        var wasDone = B.day.status === 'done';
        B.day = B.dirtyDay ? Object.assign({}, d, { flights: B.day.flights, sec: B.day.sec, breakSec: B.day.breakSec }) : Object.assign({}, B.day, d);
        if (d.status === 'done' && !wasDone) dropOutbox(B);
        persist(); if (B.view !== 'lifters' || d.status === 'done') paintBoard();
      });
    }
    BS.tick = setInterval(function () { if (B && B.view === 'board') paintSide(); }, 15000);
    paintBoard();
    if (B.mode === 'remote') pull().then(function () { scheduleFlush(50); }); else scheduleFlush(50);
    return sh;
  }
  function boardKey_(e) {
    if (!B || !BS || !B.day) return;
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === 'p' || k === 'P') { e.preventDefault(); printCards(); return; }
    if (B.view !== 'board' || B.day.status === 'done') return;
    var cur = currentEntry();
    if ((k === 'g' || k === 'G') && cur) { e.preventDefault(); act({ type: 'good', lifterId: cur.lifterId, lift: cur.lift, n: cur.n }); }
    else if ((k === 'n' || k === 'N') && cur) { e.preventDefault(); act({ type: 'no', lifterId: cur.lifterId, lift: cur.lift, n: cur.n }); }
    else if (k === '+' || k === '=' || k === '-' || k === '−') { e.preventDefault(); nudgeDraft(k === '+' || k === '=' ? STEP : -STEP); }
    else if (k === 'Enter') { var t = target(); if (t) { e.preventDefault(); declareTarget(); } }
    else if (/^Arrow/.test(k)) { e.preventDefault(); moveSel(k); }
  }
  function currentEntry() { var o = boardOrder(), i = position(o); return i < 0 ? null : o[i]; }
  // The attempt to declare: the one the coach picked, else the next attempt of whoever lifted last
  // (that minute is running), else the attempt on the platform if nobody has declared it.
  function target() {
    if (B.sel && B.cells[B.sel] && !isResult(B.cells[B.sel].status)) return B.cells[B.sel];
    var last = null;
    Object.keys(B.cells).forEach(function (k) { var c = B.cells[k]; if (isResult(c.status) && (!last || num(c.at) > num(last.at))) last = c; });
    if (last && last.n < 3) { var nx = B.cells[attemptKey(last.lifterId, last.lift, last.n + 1)]; if (nx && nx.status === 'planned') return nx; }
    var cur = currentEntry();
    return cur ? B.cells[cur.key] : null;
  }
  function nudgeDraft(delta) {
    var t = target(); if (!t) return;
    var k = attemptKey(t.lifterId, t.lift, t.n);
    if (!B.draft || B.draft.key !== k) B.draft = { key: k, kg: num(t.kg) };
    B.draft.kg = Math.max(MIN_BAR, rStep(B.draft.kg + delta, 0.5));
    paintSide();
  }
  function declareTarget() {
    var t = target(); if (!t) return;
    var k = attemptKey(t.lifterId, t.lift, t.n);
    var kg = B.draft && B.draft.key === k ? B.draft.kg : num(t.kg);
    if (act({ type: 'declare', lifterId: t.lifterId, lift: t.lift, n: t.n, kg: kg })) { B.draft = null; B.sel = null; paintBoard(); }
  }
  function moveSel(k) {
    var flight = shownFlight(), rows = rowsFor(flight);
    if (!rows.length) return;
    var cols = []; LIFTS.forEach(function (l) { [1, 2, 3].forEach(function (n) { cols.push([l, n]); }); });
    var c = B.sel ? B.cells[B.sel] : target();
    var ri = c ? rows.findIndex(function (r) { return r.id === c.lifterId; }) : 0, ci = c ? cols.findIndex(function (x) { return x[0] === c.lift && x[1] === c.n; }) : 0;
    if (ri < 0) ri = 0; if (ci < 0) ci = 0;
    if (k === 'ArrowDown') ri = Math.min(rows.length - 1, ri + 1); else if (k === 'ArrowUp') ri = Math.max(0, ri - 1);
    else if (k === 'ArrowRight') ci = Math.min(8, ci + 1); else if (k === 'ArrowLeft') ci = Math.max(0, ci - 1);
    B.sel = attemptKey(rows[ri].id, cols[ci][0], cols[ci][1]); B.draft = null;
    paintBoard();
    var cell = BS.main.querySelector('[data-key="' + B.sel.replace(/"/g, '') + '"]'); if (cell) try { cell.focus({ preventScroll: false }); } catch (e) {}
  }
  function shownFlight() {
    var flights = flightList();
    if (B.flight && flights.indexOf(B.flight) >= 0) return B.flight;
    var cur = currentEntry();
    return cur ? cur.flight : flights[0];
  }
  function flightList() { var f = []; B.lifters.forEach(function (l) { if (f.indexOf(l.flight || 'A') < 0) f.push(l.flight || 'A'); }); return f.sort(); }
  // Rows of a flight in lifting order for the round on the platform (lot order otherwise).
  function rowsFor(flight) {
    var ls = B.lifters.filter(function (l) { return (l.flight || 'A') === flight; });
    var cur = currentEntry(), order = boardOrder();
    if (cur && cur.flight === flight) {
      var round = order.filter(function (e) { return e.flight === flight && e.lift === cur.lift && e.n === cur.n; }).map(function (e) { return e.lifterId; });
      return ls.slice().sort(function (a, b) { return round.indexOf(a.id) - round.indexOf(b.id); });
    }
    return ls.slice().sort(function (a, b) { return num(a.lot) - num(b.lot); });
  }
  function paintSync() {
    if (!BS || !B) return;
    var n = Object.keys(B.outbox).length + (B.mode === 'remote' ? Object.keys(B.dirtyLifters || {}).length : 0), s = B.sync;
    var text = s === 'local' ? 'On this laptop only' : !online() || s === 'offline' ? 'Offline · ' + (n ? n + (n === 1 ? ' change' : ' changes') + ' kept here' : 'marks kept here')
      : s === 'saving' ? 'Saving…' : s === 'retry' ? 'Retrying · ' + n + ' waiting' : n ? n + ' waiting' : B.mode === 'demo' ? 'Saved · demo' : 'All marks saved';
    BS.syncChip.textContent = text;
    BS.syncChip.className = 'md-sync' + (!online() || s === 'offline' || s === 'retry' ? ' is-off' : n || s === 'saving' ? ' is-busy' : ' is-ok');
  }
  function paintBoard() {
    if (!BS || !B) return;
    if (!B.day) { BS.main.innerHTML = ''; BS.main.appendChild(E('p', { class: 'md-quiet md-loading' }, online() ? 'Loading the board…' : 'This board has not been opened on this laptop yet. It needs the wifi once.')); paintSync(); return; }
    var day = B.day;
    var cur = currentEntry();
    var done = day.status === 'done';
    BS.sh.setTitle(day.name, [dayText(day.date), day.federation, day.division].filter(Boolean).join(' · '));
    BS.finB.disabled = done; BS.finB.textContent = done ? 'Finished' : 'Finish meet';
    BS.tabs.innerHTML = '';
    // The desk draws Board | Lifters as its one segmented control; the phone keeps its tabs.
    var tabHost = onDesk() ? BS.tabs.appendChild(E('div', { class: 'md-seg', role: 'presentation' })) : BS.tabs;
    [['board', 'Board'], ['lifters', 'Lifters · ' + B.lifters.length]].forEach(function (t) {
      var on = B.view === t[0];
      var b = E('button', { type: 'button', role: 'tab', class: 'md-tab' + (on ? ' on' : ''), 'aria-selected': on ? 'true' : 'false' }, t[1]);
      b.addEventListener('click', function () { B.view = t[0]; paintBoard(); });
      tabHost.appendChild(b);
    });
    if (!done) {
      var where = cur ? LIFT_NAME[cur.lift] + ' · flight ' + cur.flight + ' · round ' + cur.n : 'All attempts called';
      BS.tabs.appendChild(E('span', { class: 'md-where' }, where));
    }
    BS.main.innerHTML = '';
    if (B.view === 'lifters') { paintLifters(); paintSync(); return; }
    var grid = E('div', { class: 'md-board' + (done ? ' is-done' : '') });
    var left = E('div', { class: 'md-board-left' }), side = E('aside', { class: 'md-side', 'aria-label': 'On the platform and next' });
    grid.appendChild(left); grid.appendChild(side);
    BS.main.appendChild(grid); BS.side = side;
    if (done) left.appendChild(finishedNote());
    // Flights
    var flights = flightList(), shown = shownFlight();
    if (flights.length > 1) {
      var fl = E('div', { class: 'md-flights', role: 'tablist', 'aria-label': 'Flights' });
      flights.forEach(function (f) {
        var n = B.lifters.filter(function (l) { return (l.flight || 'A') === f; }).length;
        var on = f === shown, live = cur && cur.flight === f;
        var b = E('button', { type: 'button', role: 'tab', class: 'md-flight' + (on ? ' on' : ''), 'aria-selected': on ? 'true' : 'false' },
          'Flight ' + f, E('small', {}, n + (B.day.flights && B.day.flights[f] && B.day.flights[f].size > n ? ' of ' + B.day.flights[f].size : '') + (live ? ' · lifting' : '')));
        b.addEventListener('click', function () { B.flight = f; B.sel = null; paintBoard(); });
        fl.appendChild(b);
      });
      left.appendChild(fl);
    }
    if (onDesk()) { left.appendChild(boardLifters(shown, cur)); var ro = roundOrder(shown, cur); if (ro) left.appendChild(ro); }
    else left.appendChild(boardTable(shown, cur));
    paintSide();
    paintSync();
  }
  function boardTable(flight, cur) {
    var wrap = E('div', { class: 'md-table-wrap' });
    var tb = E('table', { class: 'md-table' });
    var thead = E('thead');
    var hr = E('tr', {}, E('th', { scope: 'col', class: 'md-th-lot' }, 'Lot'), E('th', { scope: 'col', class: 'md-th-name' }, 'Lifter'));
    LIFTS.forEach(function (l) { [1, 2, 3].forEach(function (n) { hr.appendChild(E('th', { scope: 'col', class: 'md-th-att md-' + l + (n === 1 ? ' md-lift-start' : '') }, LIFT_SHORT[l] + n)); }); });
    hr.appendChild(E('th', { scope: 'col', class: 'md-th-tot' }, 'Total'));
    thead.appendChild(hr); tb.appendChild(thead);
    var tbody = E('tbody');
    var tgt = target(), tgtKey = tgt ? attemptKey(tgt.lifterId, tgt.lift, tgt.n) : null;
    rowsFor(flight).forEach(function (l) {
      var tr = E('tr', { class: cur && cur.lifterId === l.id ? 'is-up' : '' });
      tr.appendChild(E('td', { class: 'md-lot' }, l.lot ? String(l.lot) : '–'));
      tr.appendChild(E('td', { class: 'md-name' }, E('b', {}, l.name), E('small', {}, [l.weightClass, l.bodyweight ? kgText(l.bodyweight) : ''].filter(Boolean).join(' · '))));
      var best = {};
      LIFTS.forEach(function (lift) {
        [1, 2, 3].forEach(function (n) {
          var k = attemptKey(l.id, lift, n), c = B.cells[k];
          var st = c ? (c.status === 'declared' && c.changes ? 'changed' : c.status) : 'empty';
          if (c && c.status === 'good') best[lift] = Math.max(best[lift] || 0, num(c.kg));
          var isCur = cur && cur.key === k, isSel = B.sel === k, isTgt = !B.sel && tgtKey === k;
          var label = l.name + ', ' + LIFT_NAME[lift] + ' ' + ord(n) + ': ' + (c && c.kg ? kgText(c.kg) + ' kg, ' : '') + ({ planned: 'planned', declared: 'declared', changed: 'declared, changed', good: 'good lift', no: 'no lift', empty: 'empty' }[st]) + (isCur ? ', on the platform' : '');
          var td = E('td', { class: 'md-cell is-' + st + (n === 1 ? ' md-lift-start' : '') + (isCur ? ' is-cur' : '') + (isSel ? ' is-sel' : '') + (isTgt ? ' is-tgt' : ''), 'data-key': k, tabindex: '0', role: 'button', 'aria-label': label });
          td.appendChild(E('span', { class: 'md-cell-kg' }, c && c.kg ? kgText(c.kg) : '–'));
          if (st === 'changed') td.appendChild(E('i', { class: 'md-chg', 'aria-hidden': 'true' }, c.changes > 1 ? '×' + c.changes : '•'));
          td.addEventListener('click', function () { B.sel = B.sel === k ? null : k; B.draft = null; paintBoard(); });
          td.addEventListener('keydown', function (e) { if (e.key === ' ') { e.preventDefault(); td.click(); } });
          tr.appendChild(td);
        });
      });
      var tot = LIFTS.every(function (x) { return best[x]; }) ? kgText(r1(best.squat + best.bench + best.deadlift)) : LIFTS.some(function (x) { return best[x]; }) ? kgText(r1((best.squat || 0) + (best.bench || 0) + (best.deadlift || 0))) : '–';
      tr.appendChild(E('td', { class: 'md-tot' }, tot));
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    wrap.appendChild(tb);
    wrap.appendChild(E('div', { class: 'md-legend', 'aria-hidden': 'true' },
      E('span', { class: 'is-planned' }, 'Planned'), E('span', { class: 'is-declared' }, 'Declared'), E('span', { class: 'is-changed' }, 'Changed'),
      E('span', { class: 'is-good' }, 'Good'), E('span', { class: 'is-no' }, 'No lift'),
      E('span', { class: 'md-keys' }, 'G good · N no lift · + − · Enter declares · P prints')));
    return wrap;
  }
  // ---------- the laptop desk: the same board, lifter first ----------
  // One row per lifter (name and class), then three attempts per lift, each a round outcome mark
  // with its number beside it: planned hollow, declared ink, good the ok dot, no lift an alert
  // ring. No cell borders, no column rules. Every attempt keeps its data-key, focus and click.
  function onDesk() { return hasDom && document.documentElement.classList.contains('desk'); }
  var ST_WORD = { planned: 'planned', declared: 'declared', changed: 'declared, changed', good: 'good lift', no: 'no lift', empty: 'empty' };
  function attemptEl(l, lift, n, cur, tgtKey, best) {
    var k = attemptKey(l.id, lift, n), c = B.cells[k];
    var st = c ? (c.status === 'declared' && c.changes ? 'changed' : c.status) : 'empty';
    if (c && c.status === 'good') best[lift] = Math.max(best[lift] || 0, num(c.kg));
    var isCur = cur && cur.key === k, isSel = B.sel === k, isTgt = !B.sel && tgtKey === k;
    var label = l.name + ', ' + LIFT_NAME[lift] + ' ' + ord(n) + ': ' + (c && c.kg ? kgText(c.kg) + ' kg, ' : '') + ST_WORD[st] + (isCur ? ', on the platform' : '');
    var a = E('div', { class: 'md-cell md-att is-' + st + (isCur ? ' is-cur' : '') + (isSel ? ' is-sel' : '') + (isTgt ? ' is-tgt' : ''), 'data-key': k, tabindex: '0', role: 'button', 'aria-label': label, title: LIFT_NAME[lift] + ' ' + ord(n) + ' · ' + ST_WORD[st] + (c && c.changes ? ' · changed ' + (c.changes === 1 ? 'once' : c.changes + ' times') : '') });
    a.appendChild(E('i', { class: 'md-att-m', 'aria-hidden': 'true' }));
    a.appendChild(E('span', { class: 'md-cell-kg' }, c && c.kg ? kgText(c.kg) : ''));
    a.addEventListener('click', function () { B.sel = B.sel === k ? null : k; B.draft = null; paintBoard(); });
    a.addEventListener('keydown', function (e) { if (e.key === ' ') { e.preventDefault(); a.click(); } });
    return a;
  }
  function boardLifters(flight, cur) {
    var wrap = E('div', { class: 'md-lb', role: 'grid', 'aria-label': 'Flight ' + flight + ' attempts' });
    var head = E('div', { class: 'md-lb-row is-head', role: 'row' }, E('span', { role: 'columnheader', class: 'md-lb-who' }, 'Lifter'));
    LIFTS.forEach(function (l) { head.appendChild(E('span', { role: 'columnheader', class: 'md-lb-lift md-' + l }, E('i', { class: 'md-lb-ld', 'aria-hidden': 'true' }), LIFT_NAME[l])); });
    head.appendChild(E('span', { role: 'columnheader', class: 'md-lb-tot' }, 'Total'));
    wrap.appendChild(head);
    var tgt = target(), tgtKey = tgt ? attemptKey(tgt.lifterId, tgt.lift, tgt.n) : null;
    rowsFor(flight).forEach(function (l) {
      var up = cur && cur.lifterId === l.id;
      var row = E('div', { class: 'md-lb-row' + (up ? ' is-up' : ''), role: 'row' });
      var id = E('span', { class: 'md-lb-id' }, E('b', {}, l.name), E('small', {}, ['Lot ' + (l.lot || '–'), l.weightClass, l.bodyweight ? kgText(l.bodyweight) + ' kg' : ''].filter(Boolean).join(' · ')));
      row.appendChild(E('div', { class: 'md-lb-who', role: 'rowheader' }, id, up ? E('span', { class: 'md-lb-up' }, 'Up') : null));
      var best = {};
      LIFTS.forEach(function (lift) {
        var g = E('div', { class: 'md-lb-lift md-' + lift, role: 'gridcell' });
        [1, 2, 3].forEach(function (n) { g.appendChild(attemptEl(l, lift, n, cur, tgtKey, best)); });
        row.appendChild(g);
      });
      var any = LIFTS.some(function (x) { return best[x]; });
      row.appendChild(E('div', { class: 'md-lb-tot', role: 'gridcell' }, any ? kgText(r1((best.squat || 0) + (best.bench || 0) + (best.deadlift || 0))) : ''));
      wrap.appendChild(row);
    });
    var lg = E('div', { class: 'md-lb-legend', 'aria-hidden': 'true' });
    [['planned', 'Planned'], ['declared', 'Declared'], ['changed', 'Changed'], ['good', 'Good lift'], ['no', 'No lift']].forEach(function (x) { lg.appendChild(E('span', { class: 'md-att is-' + x[0] }, E('i', { class: 'md-att-m' }), x[1])); });
    lg.appendChild(E('span', { class: 'md-keys' }, 'G good · N no lift · + − · Enter declares · P prints'));
    wrap.appendChild(lg);
    return wrap;
  }
  // The order of the round on the platform (or the flight's first round), with each lifter's time.
  function roundOrder(flight, cur) {
    var order = boardOrder(), now = Date.now(), t = etas(order, clockOpts(B.day, now));
    var lift = cur && cur.flight === flight ? cur.lift : null, n = cur && cur.flight === flight ? cur.n : null;
    if (!lift) { var f0 = order.find(function (e) { return e.flight === flight && !isResult(e.status); }); if (!f0) return null; lift = f0.lift; n = f0.n; }
    var byId = {}; B.lifters.forEach(function (l) { byId[l.id] = l; });
    var box = E('div', { role: 'region', class: 'md-ro', 'aria-label': 'Lifting order' });
    box.appendChild(E('div', { class: 'md-ro-h' }, E('b', {}, 'Lifting order'), E('span', {}, LIFT_NAME[lift] + ' · ' + ord(n) + ' attempts · flight ' + flight)));
    var ol = E('ol', { class: 'md-ro-list' });
    order.forEach(function (e, i) {
      if (e.flight !== flight || e.lift !== lift || e.n !== n) return;
      var c = B.cells[e.key], st = c ? (c.status === 'declared' && c.changes ? 'changed' : c.status) : 'empty', isCur = cur && cur.key === e.key;
      ol.appendChild(E('li', { class: (isCur ? 'is-cur' : '') + (isResult(e.status) ? ' is-done' : '') },
        E('span', { class: 'md-att is-' + st }, E('i', { class: 'md-att-m', 'aria-hidden': 'true' })),
        E('b', {}, (byId[e.lifterId] || {}).name || ''),
        E('span', { class: 'md-ro-kg' }, e.kg ? kgText(e.kg) + ' kg' : ''),
        E('span', { class: 'md-ro-at' }, isCur ? 'On the platform' : isResult(e.status) ? ST_WORD[st] : t[i] ? clock(t[i]) : '')));
    });
    if (!ol.children.length) return null;
    box.appendChild(ol);
    var others = flightList().filter(function (f) { return f !== flight; });
    others.forEach(function (f) {
      var st = flightStarts(B.day)[f];
      var nf = B.lifters.filter(function (l) { return (l.flight || 'A') === f; }).length;
      box.appendChild(E('p', { class: 'md-ro-next' }, 'Flight ' + f + ' · ' + nf + (nf === 1 ? ' lifter' : ' lifters') + (st ? ' · starts ' + clock(st) : '')));
    });
    return box;
  }
  // Competition loading: a 20 kg bar and 2.5 kg collars; plates per side, change plates down to 0.25.
  function platesPerSide(kg) {
    var side = (num(kg) - 25) / 2, out = [];
    if (side <= 0) return out;
    [25, 20, 15, 10, 5, 2.5, 1.25, 0.5, 0.25].forEach(function (p) { while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 100) / 100; } });
    return out;
  }
  function platesHtml(kg) {
    var p = platesPerSide(kg);
    if (!p.length) return '<span class="md-plate is-bar">Bar and collars</span>';
    var g = []; p.forEach(function (x) { var last = g[g.length - 1]; if (last && last.p === x) last.n++; else g.push({ p: x, n: 1 }); });
    return g.map(function (x) {
      var c = typeof root.plateColor === 'function' ? root.plateColor(x.p, 'kg') : '#9aa0aa';
      return '<span class="md-plate" style="--pc:' + esc(c) + '">' + (x.n > 1 ? '<i>' + x.n + '×</i>' : '') + esc(kgText(x.p)) + '</span>';
    }).join('') + '<span class="md-plate is-collar">collar</span>';
  }
  function paintSide() {
    if (!BS || !B || !BS.side || B.view !== 'board') return;
    var side = BS.side; side.innerHTML = '';
    var now = Date.now(), order = boardOrder(), pos = position(order), cur = pos < 0 ? null : order[pos];
    var t = etas(order, clockOpts(B.day, now));
    var byId = {}; B.lifters.forEach(function (l) { byId[l.id] = l; });
    if (B.day.status === 'done') { side.appendChild(E('p', { class: 'md-quiet' }, 'This meet is finished. The results are in each lifter\'s meets.')); return; }
    // On the platform
    var up = E('div', { role: 'region', class: 'md-card md-up' + (cur ? ' md-' + cur.lift : ''), 'aria-label': 'On the platform' });
    if (cur) {
      var l = byId[cur.lifterId] || {}, c = B.cells[cur.key];
      var startsLater = t[pos] != null && t[pos] > now + 60000;
      up.appendChild(E('div', { class: 'md-card-k' }, startsLater ? 'First up · ' + clock(t[pos]) : 'On the platform'));
      up.appendChild(E('div', { class: 'md-up-who' }, E('b', {}, l.name || ''), E('span', {}, LIFT_NAME[cur.lift] + ' · ' + ord(cur.n) + ' attempt')));
      up.appendChild(E('div', { class: 'md-up-kg md-' + cur.lift }, E('b', {}, kgText(c.kg)), E('small', {}, 'kg'), c.status === 'planned' ? E('em', {}, 'not declared') : null));
      up.appendChild(E('div', { class: 'md-plates', html: platesHtml(c.kg) }));
      var calls = E('div', { class: 'md-calls' });
      calls.appendChild(btn('Good lift', 'md-btn-good', function () { act({ type: 'good', lifterId: cur.lifterId, lift: cur.lift, n: cur.n }); }, { 'aria-keyshortcuts': 'G', title: 'Good lift (G)' }));
      calls.appendChild(btn('No lift', 'md-btn-no', function () { act({ type: 'no', lifterId: cur.lifterId, lift: cur.lift, n: cur.n }); }, { 'aria-keyshortcuts': 'N', title: 'No lift (N)' }));
      up.appendChild(calls);
      var lastRes = null; Object.keys(B.cells).forEach(function (k) { var x = B.cells[k]; if (isResult(x.status) && (!lastRes || num(x.at) > num(lastRes.at))) lastRes = x; });
      if (lastRes) {
        var undo = E('button', { type: 'button', class: 'md-link md-undo' }, 'Undo ' + first((byId[lastRes.lifterId] || {}).name) + '\'s ' + (lastRes.status === 'good' ? 'good lift' : 'no lift'));
        undo.addEventListener('click', function () { act({ type: 'undo', lifterId: lastRes.lifterId, lift: lastRes.lift, n: lastRes.n }); });
        up.appendChild(undo);
      }
    } else {
      up.appendChild(E('div', { class: 'md-card-k' }, 'Every attempt is called'));
      up.appendChild(E('p', { class: 'md-quiet' }, 'Finish the meet to write the results into each lifter\'s meets.'));
      up.appendChild(btn('Finish meet', 'md-btn-primary md-btn-block', function () { openFinish(); }));
    }
    side.appendChild(up);
    // Declare: the one red action on the board.
    var tg = target();
    if (tg && cur) {
      var k = attemptKey(tg.lifterId, tg.lift, tg.n), tl = byId[tg.lifterId] || {};
      var dk = B.draft && B.draft.key === k ? B.draft.kg : num(tg.kg);
      var floor = floorFor(B.cells, tg.lifterId, tg.lift, tg.n);
      var dec = E('div', { role: 'region', class: 'md-card md-dec', 'aria-label': 'Declare' });
      dec.appendChild(E('div', { class: 'md-card-k' }, tg.status === 'declared' ? 'Change ' + first(tl.name) + '\'s ' + ord(tg.n) : 'Declare ' + first(tl.name) + '\'s ' + ord(tg.n)));
      dec.appendChild(E('div', { class: 'md-dec-sub' }, LIFT_NAME[tg.lift] + (floor != null ? ' · at least ' + kgText(floor) : '') + (tg.changes ? ' · changed ' + (tg.changes === 1 ? 'once' : tg.changes + ' times') : '')));
      var minus = btn('−', 'md-step md-step-lg', function () { nudgeDraft(-STEP); }, { 'aria-label': 'Lighter by 2.5', 'aria-keyshortcuts': '-' });
      var plus = btn('+', 'md-step md-step-lg', function () { nudgeDraft(STEP); }, { 'aria-label': 'Heavier by 2.5', 'aria-keyshortcuts': '+' });
      dec.appendChild(E('div', { class: 'md-dec-kg' }, minus, E('b', { class: floor != null && dk < floor ? 'is-low' : '' }, kgText(dk)), plus));
      var prev = B.cells[attemptKey(tg.lifterId, tg.lift, tg.n - 1)];
      if (prev && isResult(prev.status) && typeof root.meetAttemptOptions === 'function') {
        var best = 0;
        var ath = tl.athleteId ? evidence(tl.athleteId)[tg.lift] : null;
        best = ath ? Math.max(num(ath.max), ath.single ? ath.single.kg : 0) : 0;
        var plannedNext = (planOf((S().meets || []).find(function (m) { return m.id === tl.meetId; })) || {})[tg.lift];
        var opts = root.meetAttemptOptions({ kg: num(prev.kg), result: prev.status, plannedNext: plannedNext ? plannedNext[tg.n - 1] : num(tg.kg), best: best, unit: 'kg' });
        var row = E('div', { class: 'md-alts', role: 'group', 'aria-label': 'Choices' });
        opts.forEach(function (o) {
          var c = E('button', { type: 'button', class: 'md-alt' + (o.kg === dk ? ' on' : '') + (o.key === 'send' ? ' is-send' : ''), title: o.prBy ? 'A PR by ' + kgText(o.prBy) + ' kg' : o.why },
            E('span', {}, o.key === 'safe' ? 'Safe' : o.key === 'plan' ? 'Plan' : 'Send'), E('b', {}, kgText(o.kg)));
          c.addEventListener('click', function () { B.draft = { key: k, kg: o.kg }; paintSide(); });
          row.appendChild(c);
        });
        dec.appendChild(row);
      }
      var same = tg.status === 'declared' && dk === num(tg.kg);
      var go = btn(same ? 'Declared ' + kgText(dk) : (tg.status === 'declared' ? 'Change to ' : 'Declare ') + kgText(dk), 'md-btn-primary md-btn-block', function () { declareTarget(); }, { 'aria-keyshortcuts': 'Enter' });
      if (same || (floor != null && dk < floor)) go.disabled = true;
      dec.appendChild(go);
      if (B.sel) { var back = E('button', { type: 'button', class: 'md-link' }, 'Back to the next declaration'); back.addEventListener('click', function () { B.sel = null; B.draft = null; paintBoard(); }); dec.appendChild(back); }
      side.appendChild(dec);
    }
    // Up next, with attempts out and the warm-up to take now (before a first attempt).
    var nx = E('div', { role: 'region', class: 'md-card md-next', 'aria-label': 'Up next' });
    nx.appendChild(E('div', { class: 'md-card-k' }, 'Up next'));
    var list = E('ol', { class: 'md-next-list' });
    var seen = {}, shownN = 0;
    if (cur) seen[cur.lifterId] = 1;
    for (var i = pos + 1; i < order.length && shownN < 6; i++) {
      var e = order[i]; if (isResult(e.status) || seen[e.lifterId]) continue;
      seen[e.lifterId] = 1; shownN++;
      var o2 = outFor(order, e.lifterId), ln = byId[e.lifterId] || {};
      var li = E('li', {}, E('span', { class: 'md-next-who' }, E('b', {}, ln.name || ''), E('small', {}, LIFT_SHORT[e.lift] + e.n + ' · ' + kgText(e.kg))),
        E('span', { class: 'md-next-out' }, o2.out + ' out'));
      if (e.n === 1) {
        var w = warmups(e.kg, t[i], B.day.sec || SEC_PER_ATTEMPT, now).filter(function (x) { return x.state === 'now'; })[0];
        if (w) li.appendChild(E('span', { class: 'md-next-warm' }, 'Warm-up now: ' + kgText(w.kg) + ' × ' + w.reps));
      }
      list.appendChild(li);
    }
    if (!shownN) list.appendChild(E('li', { class: 'md-quiet' }, 'Nobody after this attempt'));
    nx.appendChild(list);
    side.appendChild(nx);
    // Warm-ups for the selected lifter (or the first lifter of the next flight/lift still to start).
    var focusId = B.sel && B.cells[B.sel] ? B.cells[B.sel].lifterId : null;
    if (!focusId) { var nxt = order.find(function (x, j) { return j > pos && x.n === 1 && !isResult(x.status); }); focusId = nxt ? nxt.lifterId : null; }
    if (focusId) {
      var o3 = outFor(order, focusId);
      if (o3) {
        var firstOf = order.findIndex(function (x) { return x.lifterId === focusId && x.lift === o3.entry.lift && x.n === 1; });
        var opener = order[firstOf], eta = t[firstOf];
        if (opener && !isResult(opener.status)) {
          var wu = E('div', { role: 'region', class: 'md-card md-warm', 'aria-label': 'Warm-ups' });
          wu.appendChild(E('div', { class: 'md-card-k' }, first((byId[focusId] || {}).name) + '\'s ' + LIFT_NAME[opener.lift].toLowerCase() + ' warm-ups' + (eta ? ' · opener ' + clock(eta) : '')));
          var ul = E('ol', { class: 'md-warm-list' });
          warmups(opener.kg, eta, B.day.sec || SEC_PER_ATTEMPT, now).forEach(function (w) {
            ul.appendChild(E('li', { class: 'is-' + w.state }, E('span', { class: 'md-warm-at' }, w.at ? clock(w.at) : w.out + ' out'), E('b', {}, kgText(w.kg) + ' × ' + w.reps), E('small', {}, w.out + ' out')));
          });
          ul.appendChild(E('li', { class: 'is-next' }, E('span', { class: 'md-warm-at' }, eta ? clock(eta) : 'Up'), E('b', {}, kgText(opener.kg)), E('small', {}, 'opener')));
          wu.appendChild(ul);
          side.appendChild(wu);
        }
      }
    }
  }
  // ---------- Lifters tab: flights, lots, weigh-in against class, rack heights ----------
  // patch: the fields this edit changed (rack: { key: value }). Remote: dirty per field, up on the next flush.
  function saveLifter(l, patch) {
    if (B.mode === 'demo') { persist(); var srv = lsGet(DEMO_SRV); if (srv) { srv.lifters = B.lifters; lsSet(DEMO_SRV, srv); } return; }
    if (B.mode !== 'remote' || !root.DB) { persist(); return; }
    B.dirtyLifters[l.id] = markDirty(B.dirtyLifters[l.id], patch || {});
    persist(); paintSync();
    if (online()) scheduleFlush(500);
  }
  function saveDay() {
    if (B.mode === 'demo') { persist(); var srv = lsGet(DEMO_SRV); if (srv) { srv.day = B.day; lsSet(DEMO_SRV, srv); } return; }
    if (B.mode === 'remote' && root.DB) { B.dirtyDay = true; B.dirtyDayV = (B.dirtyDayV || 0) + 1; persist(); if (online()) scheduleFlush(500); }
    else persist();
  }
  function paintLifters() {
    var wrap = E('div', { class: 'md-lifters' });
    var done = B.day.status === 'done';
    // The venue's clock: each flight's start and how many lift in it (the coach's lifters are only some
    // of them: the others count in attempts out and in every warm-up time), seconds an attempt, the break.
    var fs = E('div', { class: 'md-fstarts', role: 'group', 'aria-label': 'Flights at the venue' });
    var setFlight = function (f, patch) {
      B.day.flights = Object.assign({}, B.day.flights);
      var nx = Object.assign({}, B.day.flights[f], patch);
      Object.keys(nx).forEach(function (k) { if (nx[k] == null) delete nx[k]; });
      if (Object.keys(nx).length) B.day.flights[f] = nx; else delete B.day.flights[f];
      saveDay();
    };
    flightList().forEach(function (f) {
      var fl = (B.day.flights && B.day.flights[f]) || {};
      var cur = fl.start ? new Date(fl.start) : null;
      var val = cur && isFinite(cur.getTime()) ? String(cur.getHours()).padStart(2, '0') + ':' + String(cur.getMinutes()).padStart(2, '0') : '';
      var inp = E('input', { type: 'time', class: 'md-in md-in-time', value: val, 'aria-label': 'Flight ' + f + ' starts at' });
      inp.addEventListener('change', function () {
        var m = /^(\d\d):(\d\d)$/.exec(inp.value);
        if (!m) { setFlight(f, { start: null }); return; }
        var d = new Date(B.day.date + 'T00:00:00'); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
        setFlight(f, { start: d.toISOString() });
      });
      var mine = B.lifters.filter(function (l) { return (l.flight || 'A') === f; }).length;
      var size = E('input', { type: 'number', inputmode: 'numeric', min: String(mine), max: '60', class: 'md-in md-in-s', value: fl.size ? String(fl.size) : '', placeholder: String(mine), 'aria-label': 'Lifters in flight ' + f + ' at the venue, all teams' });
      size.addEventListener('change', function () {
        var v = Math.round(num(size.value));
        setFlight(f, { size: v > mine && v <= 60 ? v : null });
        paintBoard();
      });
      [inp, size].forEach(function (x) { if (done) x.disabled = true; });
      var others = Math.max(0, num(fl.size) - mine);
      fs.appendChild(E('div', { class: 'md-fstart' }, E('b', {}, 'Flight ' + f),
        E('label', {}, E('span', {}, 'Starts'), inp),
        E('label', {}, E('span', {}, 'Lifters in the flight'), size),
        E('small', { class: 'md-fsize-note' }, others ? mine + ' yours · ' + others + ' from other teams counted in attempts out' : 'Only yours counted. Add the flight size from the venue\'s list')));
    });
    var secIn = E('input', { type: 'number', inputmode: 'numeric', min: '30', max: '300', step: '5', class: 'md-in md-in-s', value: String(B.day.sec || SEC_PER_ATTEMPT), 'aria-label': 'Seconds an attempt' });
    secIn.addEventListener('change', function () { var v = Math.round(num(secIn.value)); B.day.sec = v >= 30 && v <= 300 ? v : SEC_PER_ATTEMPT; secIn.value = String(B.day.sec); saveDay(); });
    var brkIn = E('input', { type: 'number', inputmode: 'numeric', min: '0', max: '60', class: 'md-in md-in-s', value: String(Math.round((B.day.breakSec != null ? B.day.breakSec : BREAK_SEC) / 60)), 'aria-label': 'Break between lifts, minutes' });
    brkIn.addEventListener('change', function () { var v = Math.round(num(brkIn.value)); B.day.breakSec = (v >= 0 && v <= 60 ? v : BREAK_SEC / 60) * 60; brkIn.value = String(B.day.breakSec / 60); saveDay(); });
    [secIn, brkIn].forEach(function (x) { if (done) x.disabled = true; });
    fs.appendChild(E('div', { class: 'md-fstart md-fclock' }, E('b', {}, 'Clock'),
      E('label', {}, E('span', {}, 'Seconds an attempt'), secIn), E('label', {}, E('span', {}, 'Break between lifts, min'), brkIn)));
    wrap.appendChild(fs);
    if (!done) wrap.appendChild(E('div', { class: 'md-lifters-acts' }, btn('Add a lifter from another team', 'md-btn-quiet', function () { openAddGuest(); })));
    var tb = E('table', { class: 'md-ltable' });
    tb.appendChild(E('thead', {}, E('tr', {}, E('th', { scope: 'col' }, 'Flight'), E('th', { scope: 'col' }, 'Lot'), E('th', { scope: 'col' }, 'Lifter'),
      E('th', { scope: 'col' }, 'Weigh-in'), E('th', { scope: 'col' }, 'Class'), E('th', { scope: 'col' }, 'Squat rack'), E('th', { scope: 'col' }, 'Safeties'),
      E('th', { scope: 'col' }, 'Bench rack'), E('th', { scope: 'col' }, 'Blocks'))));
    var tbody = E('tbody');
    B.lifters.slice().sort(function (a, b) { return String(a.flight).localeCompare(String(b.flight)) || num(a.lot) - num(b.lot); }).forEach(function (l) {
      var tr = E('tr');
      var upd = function (patch, repaint) {
        B.lifters = B.lifters.map(function (x) { return x.id === l.id ? Object.assign({}, x, patch, patch.rack ? { rack: Object.assign({}, x.rack, patch.rack) } : {}) : x; });
        l = B.lifters.find(function (x) { return x.id === l.id; });
        saveLifter(l, patch); if (repaint) paintBoard();
      };
      var fsel = E('select', { class: 'md-in md-in-s', 'aria-label': l.name + ' flight' });
      ['A', 'B', 'C', 'D'].forEach(function (f) { var o = E('option', { value: f }, f); if ((l.flight || 'A') === f) o.selected = true; fsel.appendChild(o); });
      fsel.addEventListener('change', function () { upd({ flight: fsel.value }, true); });
      var lot = E('input', { type: 'number', min: '1', max: '999', class: 'md-in md-in-s', value: l.lot || '', 'aria-label': l.name + ' lot number' });
      lot.addEventListener('change', function () { var v = Math.round(num(lot.value)); upd({ lot: v >= 1 && v <= 999 ? v : null }); });
      var bw = E('input', { type: 'text', inputmode: 'decimal', class: 'md-in md-in-m', value: l.bodyweight ? kgText(l.bodyweight) : '', placeholder: 'kg', 'aria-label': l.name + ' weigh-in, kg' });
      var clsInfo = E('small', { class: 'md-cls-line' });
      var paintCls = function () {
        var o = overClass(l.bodyweight, l.weightClass);
        var info = l.bodyweight && typeof root.weightClassInfo === 'function' ? root.weightClassInfo(num(l.bodyweight), l.sex) : null;
        clsInfo.textContent = !l.bodyweight ? 'No weigh-in yet' : o ? o.text : info ? info.cls : '';
        clsInfo.className = 'md-cls-line' + (o && o.over ? ' is-over' : '');
      };
      bw.addEventListener('change', function () {
        var v = parseFloat(String(bw.value).replace(',', '.'));
        var patch = { bodyweight: v >= 20 && v <= 300 ? Math.round(v * 100) / 100 : null };
        if (patch.bodyweight && !l.weightClass && typeof root.weightClassFor === 'function') patch.weightClass = root.weightClassFor(patch.bodyweight, l.sex) || '';
        upd(patch); paintCls();
      });
      var cls = E('input', { type: 'text', class: 'md-in md-in-m', value: l.weightClass || '', maxlength: '12', 'aria-label': l.name + ' class' });
      cls.addEventListener('change', function () { upd({ weightClass: String(cls.value).trim().slice(0, 12) }); paintCls(); });
      paintCls();
      var rackIn = function (key, label) {
        var i = E('input', { type: 'text', class: 'md-in md-in-s', maxlength: '8', value: (l.rack && l.rack[key]) || '', 'aria-label': l.name + ' ' + label });
        i.addEventListener('change', function () { var r = {}; r[key] = String(i.value).trim().slice(0, 8); upd({ rack: r }); });
        if (done) i.disabled = true;
        return i;
      };
      [fsel, lot, bw, cls].forEach(function (x) { if (done) x.disabled = true; });
      tr.appendChild(E('td', {}, fsel)); tr.appendChild(E('td', {}, lot));
      var nameTd = E('td', { class: 'md-name' }, E('b', {}, l.name), E('small', {}, l.athleteId ? (l.sex === 'female' ? 'Female' : l.sex === 'male' ? 'Male' : '') : 'Other team'));
      if (!l.athleteId && !done) {
        var rm = E('button', { type: 'button', class: 'md-link md-rm', 'aria-label': 'Remove ' + l.name + ' from the board' }, 'Remove');
        rm.addEventListener('click', function () { removeGuest(l); });
        nameTd.appendChild(rm);
      }
      tr.appendChild(nameTd);
      tr.appendChild(E('td', {}, bw, clsInfo)); tr.appendChild(E('td', {}, cls));
      tr.appendChild(E('td', {}, rackIn('squat', 'squat rack height'))); tr.appendChild(E('td', {}, rackIn('safety', 'safety height')));
      tr.appendChild(E('td', {}, rackIn('bench', 'bench rack height'))); tr.appendChild(E('td', {}, rackIn('blocks', 'foot blocks')));
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    wrap.appendChild(E('div', { class: 'md-table-wrap' }, tb));
    BS.main.appendChild(wrap);
  }
  // Over or under the class limit ('74 kg', '84+' never over). → { over, text } | null
  function overClass(bw, weightClass) {
    var lim = parseFloat(weightClass);
    if (!(num(bw) > 0) || !isFinite(lim)) return null;
    var plus = /\+/.test(String(weightClass));
    var over = !plus && num(bw) > lim;
    return { over: over, text: plus ? String(weightClass) : over ? kgText(r1(num(bw) - lim)) + ' over ' + weightClass : kgText(r1(lim - num(bw))) + ' under ' + weightClass };
  }
  // A lifter from another team: on the board so the order, attempts out and the warm-up clock are the
  // venue's, never part of the results (finish skips guests).
  function openAddGuest() {
    sheet('Add a lifter to a flight', function (card, close) {
      card.appendChild(E('p', { class: 'md-sheet-sub' }, 'From the venue\'s flight list. Their openers set the order; the table\'s declarations change it on the day.'));
      var name = E('input', { type: 'text', class: 'md-in', maxlength: '80', placeholder: 'Name', 'aria-label': 'Lifter name' });
      var fsel = E('select', { class: 'md-in', 'aria-label': 'Flight' });
      var fl = flightList(); ['A', 'B', 'C', 'D'].forEach(function (f) { var o = E('option', { value: f }, 'Flight ' + f); if (f === (B.flight || fl[0] || 'A')) o.selected = true; fsel.appendChild(o); });
      var lot = E('input', { type: 'number', inputmode: 'numeric', min: '1', max: '999', class: 'md-in', placeholder: 'Lot', 'aria-label': 'Lot number' });
      var ops = {};
      var row = E('div', { class: 'md-form-row' });
      LIFTS.forEach(function (l) { ops[l] = E('input', { type: 'text', inputmode: 'decimal', class: 'md-in', placeholder: LIFT_NAME[l], 'aria-label': LIFT_NAME[l] + ' opener, kg' }); row.appendChild(ops[l]); });
      card.appendChild(E('div', { class: 'md-form' }, name, E('div', { class: 'md-form-row' }, fsel, lot), E('span', { class: 'md-form-k' }, 'Openers, kg'), row));
      var go = btn('Add to the board', 'md-btn-primary md-btn-block', function () {
        var nm = String(name.value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
        var openers = {}; LIFTS.forEach(function (l) { var v = parseFloat(String(ops[l].value).replace(',', '.')); if (v >= MIN_BAR && v <= MAX_KG) openers[l] = v; });
        if (!nm) { say('Give the lifter a name'); return; }
        if (!Object.keys(openers).length) { say('Add at least one opener'); return; }
        var lv = Math.round(num(lot.value));
        addGuest({ name: nm, flight: fsel.value, lot: lv >= 1 && lv <= 999 ? lv : null }, openers);
        close();
      });
      card.appendChild(go);
      card.appendChild(btn('Cancel', 'md-btn-quiet md-btn-block', close));
    });
  }
  function addGuest(o, openers) {
    if (!B || B.day.status === 'done') return;
    var id = B.mode === 'demo' ? 'md-g-' + uuid().slice(0, 8) : uuid();
    var l = { id: id, athleteId: null, meetId: null, name: o.name, sex: null, flight: o.flight || 'A', lot: o.lot, bodyweight: null, weightClass: '', rack: {} };
    var cells = guestCells(id, openers), keys = Object.keys(cells);
    B.lifters = B.lifters.concat([l]);
    keys.forEach(function (k) { cells[k].at = Date.now(); B.cells[k] = cells[k]; });
    if (B.mode === 'demo') {
      var srv = lsGet(DEMO_SRV); if (srv) { srv.lifters = B.lifters; lsSet(DEMO_SRV, srv); }
    } else if (B.mode === 'remote') B.dirtyLifters[id] = { _new: 1, _v: 1 };
    B.outbox = queue(B.outbox, keys, B.cells);
    persist(); paintBoard(); scheduleFlush(50);
    say(first(l.name) + ' is on the board in flight ' + l.flight);
  }
  function removeGuest(l) {
    var drop = function () {
      B.lifters = B.lifters.filter(function (x) { return x.id !== l.id; });
      Object.keys(B.cells).forEach(function (k) { if (B.cells[k].lifterId === l.id) { delete B.cells[k]; delete B.outbox[k]; } });
      delete B.dirtyLifters[l.id];
      persist(); paintBoard();
    };
    if (B.mode === 'demo') {
      drop();
      var srv = lsGet(DEMO_SRV);
      if (srv) { srv.lifters = B.lifters; Object.keys(srv.srv).forEach(function (k) { if (srv.srv[k].lifterId === l.id) delete srv.srv[k]; }); lsSet(DEMO_SRV, srv); }
      return;
    }
    if (B.mode !== 'remote' || (B.dirtyLifters[l.id] && B.dirtyLifters[l.id]._new) || B.pendingCreate) { drop(); return; }
    if (!online()) { say('Removing a lifter needs the wifi'); return; }
    root.DB.deleteMeetDayLifter(l.id).then(function (r) { if (r && r.ok) drop(); else say('Could not remove. Try again'); });
  }
  function finishedNote() {
    return E('div', { class: 'md-finished' }, E('b', {}, 'Finished'), E('span', {}, 'Results are in each lifter\'s meets. Best totals and DOTS count them from now on.'));
  }
  // ---------- Finish ----------
  function openFinish() {
    if (!B || B.day.status === 'done') return;
    var res = finishResults(B.day, B.lifters, B.cells);
    var open = boardOrder().filter(function (e) { return !isResult(e.status); }).length;
    sheet('Finish ' + B.day.name, function (card, close) {
      card.appendChild(E('p', { class: 'md-sheet-sub' }, (res.length ? 'Each result goes into the lifter\'s meets. Their best total and DOTS count it from now on.' : 'Nobody has a called attempt yet.') +
        (open ? ' ' + open + (open === 1 ? ' attempt is' : ' attempts are') + ' not called and will not count.' : '')));
      var ul = E('ul', { class: 'md-fin-list' });
      res.forEach(function (r) {
        var l = B.lifters.find(function (x) { return x.id === r.lifterId; }) || {};
        var sc = typeof root.meetScore === 'function' && l.bodyweight && !r.bombed.length && r.squat && r.bench && r.deadlift ? root.meetScore(r.total, num(l.bodyweight), l.sex || 'male', { federation: B.day.federation, division: B.day.division }) : null;
        ul.appendChild(E('li', {}, E('span', { class: 'md-fin-who' }, E('b', {}, l.name || ''), E('small', {}, r.made + ' of ' + r.taken + (r.bombed.length ? ' · no ' + r.bombed.map(function (x) { return LIFT_NAME[x].toLowerCase(); }).join(', ') : '') + (l.athleteId ? '' : ' · guest, not saved'))),
          E('span', { class: 'md-fin-tot' }, E('b', {}, kgText(r.total)), E('small', {}, sc && sc.points ? sc.label + ' ' + sc.points.toFixed(1) : 'kg'))));
      });
      card.appendChild(ul);
      var go = btn('Write results', 'md-btn-primary md-btn-block', function () {
        go.disabled = true;
        finishBoard(res).then(function (ok) { if (ok) close(); else go.disabled = false; });
      });
      if (!res.length) go.disabled = true;
      card.appendChild(go);
      card.appendChild(btn('Not yet', 'md-btn-quiet md-btn-block', close));
    });
  }
  function finishBoard(res) {
    if (B.mode === 'local') { say('Finishing writes results once the meet-day update is installed. The board is kept on this laptop'); return Promise.resolve(false); }
    var b0 = B;
    var done = function (text) {
      B.day = Object.assign({}, B.day, { status: 'done', finishedAt: new Date().toISOString() });
      persist(); paintBoard(); say(text);
      try { if (typeof root.renderMeetsScreen === 'function' && _meetsHost && document.body.contains(_meetsHost)) root.renderMeetsScreen(_meetsHost); } catch (e) {}
      return true;
    };
    if (B.mode === 'demo') {
      var ids = (S().athletes || []).map(function (a) { return a.id; }).concat(me() ? [me().id] : []);
      var written = 0;
      root.Store.update(function (x) {
        x.meets = x.meets || [];
        res.forEach(function (r) {
          if (!r.athleteId || ids.indexOf(r.athleteId) < 0) return;
          var row = { athleteId: r.athleteId, name: r.name, date: r.date, federation: r.federation, division: r.division, weightClass: r.weightClass, bodyweight: r.bodyweight,
            squat: r.squat, bench: r.bench, deadlift: r.deadlift, notes: r.notes, status: 'done', planned: false };
          var i = x.meets.findIndex(function (m) { return m.id === r.meetId && planned(m); });
          if (i >= 0) x.meets[i] = Object.assign({}, x.meets[i], row);
          else x.meets.push(Object.assign({ id: 'demo-md-res-' + r.lifterId + '-' + Date.now() }, row));
          written++;
        });
      });
      var srv = lsGet(DEMO_SRV); if (srv) { srv.day = Object.assign({}, srv.day, { status: 'done' }); lsSet(DEMO_SRV, srv); }
      return Promise.resolve(done(written === 1 ? 'One result written' : written + ' results written'));
    }
    // remote: everything up first, then the RPC.
    if (!online()) { say('Finishing needs the wifi. Every mark is kept here until then'); return Promise.resolve(false); }
    return flush().then(function () {
      if (B !== b0) return false;
      if (B.day.status === 'done') return false;   // finished on another device meanwhile (flush said so)
      if (B.pendingCreate) { say(B.sync === 'local' ? 'Finishing needs the meet-day update first. The board is kept on this laptop' : 'The board has not reached the server yet. Try again in a moment'); return false; }
      if (Object.keys(B.outbox).length || Object.keys(B.dirtyLifters).length) { say('Some changes have not gone up yet. Try again in a moment'); return false; }
      return root.DB.finishMeetDay(B.id).then(function (r) {
        if (!r || !r.ok) { say(r && r.notReady ? 'Finishing needs the meet-day update first' : r && r.finished ? 'This meet was already finished' : 'Could not finish. Try again'); return false; }
        // Each lifter hears their result is in (best effort; the push function decides who may be told).
        if (!r.already && root.DB.sendPush) (r.results || []).forEach(function (x) {
          if (x.athleteId) root.DB.sendPush({ toUserId: x.athleteId, title: B.day.name + ': your result is in', body: 'Your coach finished the meet. The result is in your meets.', url: '/athlete.html', tag: 'powa-meetday-' + B.id, category: 'program' }).catch(function () {});
        });
        // The done meets: fetch them so best totals move now.
        var ath = (r.results || []).map(function (x) { return x.athleteId; }).filter(Boolean);
        var after = ath.length && root.DB.listMeetsForAthletes ? root.DB.listMeetsForAthletes(ath).then(function (ms) {
          root.Store.update(function (x) { x.meets = (x.meets || []).filter(function (m) { return ath.indexOf(m.athleteId) < 0; }).concat(ms); });
        }) : Promise.resolve();
        return after.then(function () {
          var sk = (r.skipped || []).filter(function (x) { return x.reason !== 'guest'; });
          return done((r.results || []).length + ((r.results || []).length === 1 ? ' result written' : ' results written') + (sk.length ? '. Not written: ' + sk.map(function (x) { return first(x.name) + ' (' + x.reason + ')'; }).join(', ') : ''));
        });
      });
    });
  }
  // ---------- Printable attempt cards ----------
  function buildPrint(day, lifters, cells) {
    var old = document.querySelector('.md-print'); if (old) old.remove();
    var wrap = E('div', { class: 'md-print', 'aria-hidden': 'true' });
    var html = '';
    lifters.slice().sort(function (a, b) { return String(a.flight).localeCompare(String(b.flight)) || num(a.lot) - num(b.lot); }).forEach(function (l) {
      LIFTS.forEach(function (lift) {
        var c1 = cells[attemptKey(l.id, lift, 1)], c2 = cells[attemptKey(l.id, lift, 2)], c3 = cells[attemptKey(l.id, lift, 3)];
        var rack = lift === 'squat' ? [l.rack && l.rack.squat ? 'Rack ' + l.rack.squat : '', l.rack && l.rack.safety ? 'Safeties ' + l.rack.safety : ''] :
          lift === 'bench' ? [l.rack && l.rack.bench ? 'Rack ' + l.rack.bench : '', l.rack && l.rack.blocks ? 'Blocks ' + l.rack.blocks : ''] : [];
        var box = function (c, n) {
          var written = c && (n === 1 || c.status !== 'planned') ? kgText(c.kg) : '';
          var plan = c && !written && c.kg ? 'plan ' + kgText(c.kg) : '';
          return '<div class="mdp-box"><span class="mdp-n">' + ord(n) + '</span><b>' + esc(written) + '</b>' + (plan ? '<small>' + esc(plan) + '</small>' : '') + '</div>';
        };
        html += '<div class="mdp-card mdp-' + lift + '">' +
          '<header><span class="mdp-lift">' + esc(LIFT_NAME[lift]) + '</span><span class="mdp-meta">Flight ' + esc(l.flight || 'A') + (l.lot ? ' · Lot ' + esc(l.lot) : '') + '</span></header>' +
          '<div class="mdp-name">' + esc(l.name) + '</div>' +
          '<div class="mdp-sub">' + esc([l.weightClass, l.bodyweight ? kgText(l.bodyweight) + ' kg' : '', day.name, dayText(day.date)].filter(Boolean).join(' · ')) + '</div>' +
          '<div class="mdp-boxes">' + box(c1, 1) + box(c2, 2) + box(c3, 3) + '</div>' +
          '<footer><span>' + esc(rack.filter(Boolean).join(' · ')) + '</span><span class="mdp-sign">Coach</span></footer>' +
          '</div>';
      });
    });
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
    return wrap;
  }
  function printCards() {
    if (!B) return;
    buildPrint(B.day, B.lifters, B.cells);
    document.documentElement.classList.add('md-printing');
    var clean = function () { document.documentElement.classList.remove('md-printing'); var p = document.querySelector('.md-print'); if (p) p.remove(); window.removeEventListener('afterprint', clean); };
    window.addEventListener('afterprint', clean);
    try { window.print(); } catch (e) {}
  }

  // =====================================================================
  // 3. THE MEETS SCREEN (desk nav: Meets)
  // =====================================================================
  var _meetsHost = null;
  function listBoards() {
    var out = [];
    if (isDemo() && me() && me().userType !== 'athlete') { var srv = demoSeed(); demoStoreMeets(srv); out.push({ id: DEMO_ID, name: srv.day.name, date: srv.day.date, status: srv.day.status, lifters: srv.lifters.length, local: false }); }
    (lsGet(localBoardsKey()) || []).forEach(function (d) {
      var sv = lsGet(boardKey(d.id));
      if (sv && sv.day) d = Object.assign({}, d, { status: sv.day.status || d.status, name: sv.day.name || d.name });
      out.push(Object.assign({ local: true }, d));
    });
    return out;
  }
  function renderMeetsScreen(host) {
    if (!host) return null;
    _meetsHost = host;
    host.innerHTML = '';
    host.classList.add('md-screen');
    var s = S(), t = today();
    var boards = listBoards();
    // A meet with a board already is on the board (or under Meet days), not under Coming up.
    var boarded = {}; boards.forEach(function (b) { boarded[String(b.name || '').trim().toLowerCase() + '|' + b.date] = 1; });
    var groups = groupMeets(S().meets || [], s.athletes || [], t).filter(function (g) { return !boarded[g.key]; });
    var lifters = 0; groups.forEach(function (g) { lifters += g.rows.length; });
    host.appendChild(E('div', { class: 'md-screen-head' }, E('h1', { class: 'md-screen-title' }, 'Meets'),
      E('p', { class: 'md-screen-sub' }, groups.length ? groups.length + (groups.length === 1 ? ' meet' : ' meets') + ' ahead · ' + lifters + (lifters === 1 ? ' lifter' : ' lifters') : 'Nothing on the calendar')));
    // Today's board first: the one red action on this screen.
    var live = boards.filter(function (b) { return b.date === t && b.status !== 'done'; })[0];
    if (live) {
      var band = E('div', { role: 'region', class: 'md-today', 'aria-label': 'Today' });
      band.appendChild(E('div', { class: 'md-today-txt' }, E('span', { class: 'md-today-k' }, 'Today'), E('b', {}, live.name), E('small', {}, live.lifters + ' lifters' + (live.status === 'live' ? ' · lifting now' : ' · not started'))));
      band.appendChild(btn('Open the board', 'md-btn-primary', function () { openMeetDayBoard(live.id); }));
      host.appendChild(band);
    }
    var sec = E('div', { role: 'region', class: 'md-sec', 'aria-label': 'Coming up' });
    sec.appendChild(E('h2', { class: 'md-sec-h' }, 'Coming up'));
    if (!groups.length) {
      sec.appendChild(E('div', { class: 'md-empty' }, E('b', {}, 'No meet planned'), E('span', {}, 'Plan one from a lifter: attempts, the total and the score in one place.'), pickLifterButton()));
    } else {
      var ul = E('ul', { class: 'md-meets' });
      groups.forEach(function (g) {
        var li = E('li', { class: 'md-meet' });
        var d = new Date(g.date + 'T12:00:00');
        li.appendChild(E('div', { class: 'md-meet-date', 'aria-hidden': 'true' }, E('b', {}, String(d.getDate())), E('small', {}, d.toLocaleDateString(undefined, { month: 'short' }))));
        var weigh = g.weighIn ? (g.weighIn === '2h' ? '2 h weigh-in' : '24 h weigh-in') + (g.weighInAt ? ' ' + clock(Date.parse(g.weighInAt)) : '') : '';
        var metaTxt = [g.federation, g.division, weigh].filter(Boolean).join(' · ') || dayText(g.date);
        var whoTxt = g.rows.map(function (r) { return r.name; }).join(', ');
        li.appendChild(E('div', { class: 'md-meet-main' }, E('b', { class: 'md-meet-name' }, g.name),
          // The desk: who is lifting first, then the federation, on one line.
          onDesk() ? E('span', { class: 'md-meet-who' }, E('span', {}, whoTxt), E('span', { class: 'md-meet-meta' }, ' · ' + metaTxt)) : E('span', { class: 'md-meet-meta' }, metaTxt),
          onDesk() ? null : E('span', { class: 'md-meet-who' }, whoTxt),
          // The desk: the season against this meet (does the block take them there?), one lifter at a time.
          onDesk() && g.rows.length === 1 && typeof root.deskMeetSeason === 'function' && g.daysOut > 0 ? E('span', { class: 'md-meet-season' }, root.deskMeetSeason(g.rows[0].athleteId, g.date)) : null));
        li.appendChild(E('div', { class: 'md-meet-side' }, E('span', { class: 'md-meet-count' }, g.daysOut === 0 ? 'Today' : g.daysOut === 1 ? 'Tomorrow' : g.daysOut + ' days'),
          E('span', { class: 'md-meet-plans' + (g.planned === g.rows.length ? ' is-all' : '') }, onDesk() ? (!g.planned ? 'No attempts yet' : g.planned === g.rows.length ? 'Attempts planned' : g.planned + ' of ' + g.rows.length + ' planned') : 'Attempts ' + g.planned + '/' + g.rows.length)));
        var acts = E('div', { class: 'md-meet-acts' });
        acts.appendChild(btn(g.planned ? 'Attempts' : 'Plan attempts', 'md-btn-quiet', function () { openAttemptPlanner(g.rows[0].meetId); }));
        if (g.daysOut <= 1 && !boards.some(function (b) { return b.date === g.date && String(b.name).trim().toLowerCase() === g.name.toLowerCase(); }))
          acts.appendChild(btn('Start meet day', 'md-btn-quiet', function () { startMeetDay(g); }));
        li.appendChild(acts);
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      sec.appendChild(E('div', { class: 'md-sec-foot' }, pickLifterButton()));
    }
    host.appendChild(sec);
    var past = boards.filter(function (b) { return !(b.date === t && b.status !== 'done'); });
    if (past.length) {
      var ps = E('div', { role: 'region', class: 'md-sec', 'aria-label': 'Meet days' });
      ps.appendChild(E('h2', { class: 'md-sec-h' }, 'Meet days'));
      var pl = E('ul', { class: 'md-days' });
      past.forEach(function (b) {
        var li = E('li', {}, E('span', {}, E('b', {}, b.name), E('small', {}, dayText(b.date) + ' · ' + (b.status === 'done' ? 'finished' : b.local ? 'on this laptop, not sent yet' : 'not finished'))));
        li.appendChild(btn('Open', 'md-btn-quiet', function () { openMeetDayBoard(b.id); }));
        pl.appendChild(li);
      });
      ps.appendChild(pl);
      host.appendChild(ps);
    }
    // Real boards from the server (the list above shows local and demo ones at once).
    if (!isDemo() && root.DB && root.DB.listMeetDays && online()) {
      root.DB.listMeetDays().then(function (r) {
        if (!r || !r.ok || !r.days.length || _meetsHost !== host) return;
        var have = {}; boards.forEach(function (b) { have[b.id] = 1; });
        var fresh = r.days.filter(function (d) { return !have[d.id]; });
        if (!fresh.length) return;
        var cache = fresh.map(function (d) { return { id: d.id, name: d.name, date: d.date, status: d.status, lifters: 0 }; });
        _remoteBoards = cache;
        renderRemote(host, cache);
      });
    }
    return host;
  }
  var _remoteBoards = [];
  function renderRemote(host, list) {
    var t = today();
    var todayB = list.filter(function (b) { return b.date === t && b.status !== 'done'; })[0];
    if (todayB && !host.querySelector('.md-today')) {
      var band = E('div', { role: 'region', class: 'md-today', 'aria-label': 'Today' }, E('div', { class: 'md-today-txt' }, E('span', { class: 'md-today-k' }, 'Today'), E('b', {}, todayB.name), E('small', {}, todayB.status === 'live' ? 'Lifting now' : 'Not started')),
        btn('Open the board', 'md-btn-primary', function () { openMeetDayBoard(todayB.id); }));
      host.insertBefore(band, host.children[1] || null);
    }
    var ps = E('div', { role: 'region', class: 'md-sec' }, E('h2', { class: 'md-sec-h' }, 'Meet days'));
    var ul = E('ul', { class: 'md-days' });
    list.filter(function (b) { return b !== todayB; }).forEach(function (b) {
      ul.appendChild(E('li', {}, E('span', {}, E('b', {}, b.name), E('small', {}, dayText(b.date) + ' · ' + (b.status === 'done' ? 'finished' : 'not finished'))), btn('Open', 'md-btn-quiet', function () { openMeetDayBoard(b.id); })));
    });
    if (ul.children.length) { ps.appendChild(ul); host.appendChild(ps); }
  }
  function pickLifterButton() {
    var b = btn('Plan a lifter\'s meet', 'md-btn-quiet', function () {
      var ath = (S().athletes || []).slice().sort(function (x, y) { return String(x.name).localeCompare(String(y.name)); });
      sheet('Whose meet?', function (card, close) {
        var ul = E('ul', { class: 'md-pick' });
        ath.forEach(function (a) { var li = E('li'); li.appendChild(btn(a.name || 'Lifter', 'md-pick-b', function () { close(); openAttemptPlanner(a.id); })); ul.appendChild(li); });
        if (!ath.length) ul.appendChild(E('li', { class: 'md-quiet' }, 'Nobody on your roster yet'));
        card.appendChild(ul);
      });
    });
    return b;
  }
  // A board from a planned meet: its lifters (flights of up to ten, lots in name order), the planned
  // attempts (the coach's plan, else the projected one), the first flight at the meet's start.
  function startMeetDay(g) {
    var s = S();
    var lifters = g.rows.map(function (r, i) {
      var m = (s.meets || []).find(function (x) { return x.id === r.meetId; }) || {};
      var sex = sexOf(r.athleteId, planOf(m), m);
      return { id: 'tmp-' + i, athleteId: r.athleteId, meetId: r.meetId, name: r.name, sex: sex, flight: String.fromCharCode(65 + Math.floor(i / 10)), lot: i + 1,
        bodyweight: null, weightClass: m.weightClass || '', rack: {} };
    });
    var cells = {};
    lifters.forEach(function (l) {
      var m = (s.meets || []).find(function (x) { return x.id === l.meetId; });
      var p = planOf(m) || computePlan(l.athleteId, 'standard', l.sex);
      LIFTS.forEach(function (lift) { (p[lift] || []).forEach(function (kg, i) { if (kg) cells[attemptKey(l.id, lift, i + 1)] = { lifterId: l.id, lift: lift, n: i + 1, kg: kg, status: 'planned', changes: 0, at: 0 }; }); });
    });
    var startAt = new Date(g.date + 'T09:00:00');
    if (g.weighIn === '2h' && g.weighInAt && isFinite(Date.parse(g.weighInAt))) startAt = new Date(Date.parse(g.weighInAt) + 2 * 3600000);
    var flights = {}; lifters.forEach(function (l) { if (!flights[l.flight]) flights[l.flight] = { start: new Date(startAt.getTime() + (l.flight.charCodeAt(0) - 65) * 45 * 60000).toISOString() }; });
    if (isDemo()) { say('The demo has its own meet day: Autumn Open'); openMeetDayBoard(DEMO_ID); return; }
    // Every id is made here, so the board works at once, wifi or not: the day, its lifters and every
    // planned attempt go up through the board's own outbox (ensureCreated, then the marks), and a board
    // started before the meet-day update goes up the first time it opens after it.
    var id = uuid(), map = {};
    lifters.forEach(function (l) { map[l.id] = uuid(); l.id = map[l.id]; });
    var c2 = {};
    Object.keys(cells).forEach(function (k) { var c = cells[k]; c.lifterId = map[c.lifterId]; c2[attemptKey(c.lifterId, c.lift, c.n)] = c; });
    var day = { id: id, name: g.name, date: g.date, federation: g.federation, division: g.division, flights: flights, sec: SEC_PER_ATTEMPT, breakSec: BREAK_SEC, status: 'setup' };
    lsSet(boardKey(id), { day: day, lifters: lifters, cells: c2, outbox: queue({}, Object.keys(c2), c2), dirtyLifters: {}, pendingCreate: true, at: Date.now() });
    var list = lsGet(localBoardsKey()) || []; list.push({ id: id, name: day.name, date: day.date, status: 'setup', lifters: lifters.length, pending: true }); lsSet(localBoardsKey(), list);
    openMeetDayBoard(id);
    if (_meetsHost && document.body.contains(_meetsHost)) renderMeetsScreen(_meetsHost);
  }
  // A board that reached the server leaves the "on this laptop" list (the server's list has it now).
  function forgetPending(id) {
    var list = lsGet(localBoardsKey()) || [];
    var nx = list.filter(function (x) { return x.id !== id; });
    if (nx.length !== list.length) lsSet(localBoardsKey(), nx.length ? nx : null);
  }
  // The hook on a lifter's planned meet (coach.html's lifter page, the desk's workspace): plan the
  // attempts; on the day (or the day before) the Meets screen with the board. → element | null
  // opts.before: run first (the phone's lifter sheet closes, so the overlay has the keys).
  function plannerLink(meet, opts) {
    if (!hasDom || !meet || !meet.id || !planned(meet) || !meet.date || iso(meet.date) < today()) return null;
    var before = function () { try { if (opts && typeof opts.before === 'function') opts.before(); } catch (e) {} };
    var wrap = E('div', { class: 'md-hook' });
    wrap.appendChild(btn(hasPlan(meet) ? 'Attempts' : 'Plan attempts', 'md-btn-quiet', function (e) { e.stopPropagation(); before(); setTimeout(function () { openAttemptPlanner(meet.id); }, opts && opts.before ? 220 : 0); }));
    if (daysBetween(today(), iso(meet.date)) <= 1) wrap.appendChild(btn('Meet day', 'md-btn-quiet', function (e) { e.stopPropagation(); before(); setTimeout(function () { openMeetsScreen(); }, opts && opts.before ? 220 : 0); }));
    return wrap;
  }
  function openMeetsScreen() {
    var sh = shell('Meets', '', { cls: 'md-meets-root' });
    sh.titles.innerHTML = '';
    renderMeetsScreen(sh.body);
    return sh;
  }

  // =====================================================================
  // 4. THE LIFTER'S PHONE: "your next attempt"
  // =====================================================================
  var _next = { el: null, unsub: null, state: null, timer: null };
  function lifterNextEl() {
    var u = me();
    if (!u || !hasDom) return null;
    if (!_next.el) {
      _next.el = E('div', { role: 'region', class: 'md-next-slab', role: 'status', 'aria-live': 'polite', hidden: '' });
      window.addEventListener('storage', function (e) { if (e.key === DEMO_SRV) refreshLifter(); });
      _next.timer = setInterval(function () { if (_next.el && document.body.contains(_next.el)) { if (isDemo()) refreshLifter(); else paintLifter(); } }, 20000);
      refreshLifter();
    }
    return _next.el;
  }
  function refreshLifter() {
    var u = me(); if (!u) return;
    if (isDemo()) {
      var srv = lsGet(DEMO_SRV);
      if (!srv || srv.day.date !== today()) { _next.state = null; paintLifter(); return; }
      var l = srv.lifters.find(function (x) { return x.athleteId === u.id; });
      if (!l) { _next.state = null; paintLifter(); return; }
      var cells = {}; Object.keys(srv.srv).forEach(function (k) { cells[k] = srv.srv[k]; });
      _next.state = { day: srv.day, lifter: l, live: liveFor(srv.lifters, cells, srv.day, Date.now())[l.id], cells: cells };
      paintLifter(); return;
    }
    if (!root.DB || !root.DB.myMeetDay || !online()) return;
    root.DB.myMeetDay().then(function (r) {
      if (!r || !r.ok || !r.lifter) { _next.state = null; paintLifter(); return; }
      var cells = {}; (r.attempts || []).forEach(function (a) { cells[attemptKey(a.lifterId, a.lift, a.n)] = a; });
      _next.state = { day: r.day, lifter: r.lifter, live: r.lifter.live, cells: cells };
      paintLifter();
      if (!_next.unsub && root.DB.subscribeMyMeetDay) _next.unsub = root.DB.subscribeMyMeetDay(r.lifter.id, function (kind, row) {
        if (!_next.state) return;
        if (kind === 'lifter') { _next.state.lifter = row; _next.state.live = row.live; }
        else _next.state.cells[attemptKey(row.lifterId, row.lift, row.n)] = row;
        paintLifter();
      });
    });
  }
  function paintLifter() {
    var host = _next.el; if (!host) return;
    var st = _next.state;
    host.innerHTML = '';
    if (!st || !st.live) { host.hidden = true; return; }
    host.hidden = false;
    var v = st.live, now = Date.now();
    host.appendChild(E('div', { class: 'mdn-rule', 'aria-hidden': 'true' }));
    if (st.day.status === 'done' || v.done) {
      var tot = finishResults(st.day, [st.lifter], st.cells)[0];
      host.appendChild(E('div', { class: 'mdn-top' }, E('span', {}, 'Your meet is done')));
      host.appendChild(E('div', { class: 'mdn-kg' }, E('b', {}, tot ? kgText(tot.total) : '–'), E('small', {}, 'kg total')));
      host.appendChild(E('div', { class: 'mdn-line' }, tot ? tot.made + ' of ' + tot.taken + ' made' : ''));
      return;
    }
    var onDeck = v.out === 0;
    host.appendChild(E('div', { class: 'mdn-top' }, E('span', {}, onDeck ? 'You\'re on the platform' : 'Your next attempt'),
      E('b', { class: 'mdn-out' }, onDeck ? 'Now' : v.out + ' out')));
    host.appendChild(E('div', { class: 'mdn-kg' }, E('b', {}, kgText(v.kg)), E('small', {}, 'kg')));
    host.appendChild(E('div', { class: 'mdn-line' }, LIFT_NAME[v.lift] + ' · ' + ord(v.n) + ' · flight ' + v.flight + (v.status === 'planned' ? ' · not declared yet' : '')));
    if (v.n === 1 && v.opener) {
      var w = warmups(v.opener, v.eta, (st.day && st.day.sec) || SEC_PER_ATTEMPT, now);
      var cur = w.filter(function (x) { return x.state === 'now'; })[0], nx = w.filter(function (x) { return x.state === 'next'; })[0];
      var parts = [];
      if (cur) parts.push('Take ' + kgText(cur.kg) + ' kg × ' + cur.reps + ' now');
      if (nx) parts.push((cur ? 'then ' : 'First warm-up: ') + kgText(nx.kg) + ' kg at ' + clock(nx.at));
      if (!cur && !nx && !onDeck) parts.push('Last warm-up done. Chalk up');
      if (parts.length) host.appendChild(E('div', { class: 'mdn-warm' }, parts.join(' · ')));
    } else if (v.eta && v.eta > now + 60000) host.appendChild(E('div', { class: 'mdn-warm' }, 'About ' + clock(v.eta)));
  }
  // athlete.html?demo=1&meetday=1: the lifter's side of the demo meet day on its own (a planned
  // meet today carrying the coach's plan, and the board's state), no coach tab needed.
  function bootLifterDemo() {
    if (!isDemo() || !/[?&]meetday=1/.test(location.search) || !me()) return;
    var srv = demoSeed(); demoStoreMeets(srv);
  }

  // The stylesheet comes with the script (one tag per page), like video-review.css.
  function ensureCss() {
    try {
      if (!hasDom || !document.head || document.getElementById('mdCss')) return;
      var l = document.createElement('link'); l.id = 'mdCss'; l.rel = 'stylesheet'; l.href = 'meetday.css';
      document.head.appendChild(l);
    } catch (e) {}
  }
  if (hasDom && typeof location !== 'undefined' && /^https?:|^capacitor:|^file:/.test(String(location.protocol || ''))) ensureCss();
  Object.assign(root, { openAttemptPlanner: openAttemptPlanner, openMeetDayBoard: openMeetDayBoard, renderMeetsScreen: renderMeetsScreen, openMeetsScreen: openMeetsScreen });
  if (hasDom && typeof location !== 'undefined' && /[?&]meetday=1/.test(String(location.search || ''))) {
    var bootTry = 0;
    var boot = function () { if (me()) bootLifterDemo(); else if (++bootTry < 40) setTimeout(boot, 250); };
    if (typeof setTimeout === 'function') setTimeout(boot, 300);
  }


  // planFor(athleteId): the attempt planner for one lifter (the desk's "Plan a meet" on a lifter with none).
  function planFor(athleteId) { if (hasDom && athleteId) openAttemptPlanner(athleteId); }
  // The desk demo: today's meet day and its planned meets in the roster from the start.
  function deskDemo() { if (isDemo() && me() && me().userType !== 'athlete') demoStoreMeets(demoSeed()); }
  return { pure: pure, lifterPlan: lifterPlan, lifterNextEl: lifterNextEl, openMeetsScreen: openMeetsScreen, plannerLink: plannerLink, planFor: planFor, deskDemo: deskDemo, buildPrint: buildPrint,
    platesPerSide: platesPerSide, DEMO_ID: DEMO_ID, _board: function () { return B; } };
})();
(typeof window !== 'undefined' ? window : globalThis).MeetDay = MeetDay;
