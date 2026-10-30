/* coach-widget.js: the coach's Home Screen widgets (2026-10-30): Need you, Next meet, Clients, Team week.
   CoachWidget.build is pure over the Store (no DOM, no network, nothing written): the display-ready block the
   widgets read (native/ios-native/Widget/PowaCoachWidgets.swift, PowaSnapshot.coach). It is made from the
   app's own model, so every widget says what Home says:
     need, jobs   who needs you this week and the top three, in Home's order (coach-lifters.js clJobs: pain
                  first, then a meet today, then how soon; coach-app.js caNeedIds / caLeadJobs), each with
                  its flag (CoachLifters.jobText), its fix in a word (fixForJob + shortLabel: Message, Meet
                  day, Approve…) and its family (caJobFamily: pain and watch wear the triangle).
     meets        the next meets, one per meet, nearest first, with who is lifting (rows' deskNextMeet).
     money        this month's money in against what falls due (clients.js clientsSummary), and each active
                  package's next due date, so the widget counts overdue itself as the days pass.
     week         Home's ring: the team's sessions lifted of written this week (coach-report.js teamWeek), and
                  who is behind (Lifters › Behind: caIsBehind).
   Dates travel as dates ('YYYY-MM-DD'); the widget reads them against its own today.
   CoachWidget.sync writes it through PowaNative.updateWidget with role 'coach' (the lifter's app writes role
   'lifter': athlete.html syncHomeWidget), native only, never in the demo, debounced; coach.html calls it when
   the roster or Home redraws and, at once, when the app goes to the background. tests.html "coach widgets". */
(function () {
  'use strict';
  var MAX_JOBS = 3, MAX_MEETS = 3, MAX_DUE = 60;
  var TONE = { alert: 'pain', watch: 'watch', meet: 'meet', msg: 'msg', steel: 'plan' };

  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function isIso(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').slice(0, 10)); }
  function first(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  // Cut by code point (half an emoji would make the whole snapshot undecodable: every widget blank).
  function clip(s, n) {
    var a = Array.from(String(s == null ? '' : s).replace(/\s+/g, ' ').trim());
    return a.length > n ? a.slice(0, n - 1).join('').trim() + '…' : a.join('');
  }
  // "Tom, Priya, Callum", "Tom, Priya, Callum +2".
  function names(list, max) {
    var w = (list || []).filter(Boolean).map(function (x) { return clip(x, 14); });
    return w.length <= max ? w.join(', ') : w.slice(0, max).join(', ') + ' +' + (w.length - max);
  }
  function CL() { return typeof window !== 'undefined' ? window.CoachLifters : null; }
  function CA() { return typeof window !== 'undefined' ? window.CoachApp : null; }

  // A job's flag, short: pain as the part and how bad ("Low back 6/10", the lift left to the app), a busy
  // week without the days left, everything else as the app's own row says it.
  function flagOf(it) {
    var t = CL() && CL().jobText ? CL().jobText(it) : { title: '' };
    var s = String((it.type === 'busy' && t.short) || t.title || '');
    if (it.type === 'pain') s = s.split(' · ')[0];
    if (it.type === 'busy') s = s.replace(/\s*\(\d+ left\)$/, '');
    return clip(s, 40);
  }
  function verbOf(it) {
    var c = CL();
    if (!c || !c.fixForJob || !c.shortLabel) return 'Open';
    try { return c.shortLabel(c.fixForJob(it)); } catch (e) { return 'Open'; }
  }
  // One row of Need you. A meet day with several lifters leads with the meet ("Autumn Open", "Today · Tom,
  // Priya, Callum"); one lifter at it reads like any other job ("Tom", "Autumn Open · today").
  function jobRow(x) {
    var it = x.job;
    var tone = TONE[CA() && CA().caJobFamily ? CA().caJobFamily(it) : 'steel'] || 'plan';
    if (it.type === 'meetday') {
      var who = (x.rows || it.rows || []).map(function (r) { return first(r.athlete && r.athlete.name); });
      var when = it.days <= 0 ? 'today' : 'tomorrow';
      if (who.length > 1) return { id: null, name: clip(it.name || 'Meet', 28), flag: when.charAt(0).toUpperCase() + when.slice(1) + ' · ' + names(who, 3), verb: 'Meet day', tone: 'meet' };
      return { id: x.r.athlete.id, name: clip(first(x.r.athlete.name), 20), flag: clip((it.name || 'Meet') + ' · ' + when, 40), verb: 'Meet day', tone: 'meet' };
    }
    return { id: x.r.athlete.id, name: clip(first(x.r.athlete.name), 20), flag: flagOf(it), verb: verbOf(it), tone: tone };
  }

  // The next meets, one per meet (its name and day), nearest first, who is lifting in the rows' order.
  function meetsOf(rows) {
    var by = {}, out = [];
    (rows || []).forEach(function (r) {
      var m = r && r.meet;
      if (!m || m.days == null || m.days < 0 || !m.meet || !isIso(m.meet.date)) return;
      var name = String(m.meet.name || '').trim() || 'Meet', date = String(m.meet.date).slice(0, 10), k = name.toLowerCase() + '|' + date;
      if (!by[k]) { by[k] = { name: name, date: date, days: m.days, who: [] }; out.push(by[k]); }
      by[k].who.push(first(r.athlete && r.athlete.name));
    });
    out.sort(function (a, b) { return a.days - b.days || a.name.localeCompare(b.name); });
    return out.slice(0, MAX_MEETS).map(function (g) { return { name: clip(g.name, 28), date: g.date, who: g.who.filter(Boolean).slice(0, 8).map(function (n) { return clip(n, 14); }) }; });
  }

  // This month's money, as Clients shows it. null when Clients isn't on this build.
  function moneyOf(store, ids, t) {
    var C = typeof window !== 'undefined' ? window.Clients : null;
    if (!C || !C.clientsSummary) return null;
    var billing = (store.clientBilling || []).filter(function (b) { return b && ids.indexOf(b.athleteId) >= 0; });
    if (!billing.length) return { any: false };
    var sm = C.clientsSummary(store.clientBilling || [], store.clientPayments || [], t, ids);
    var got = sm.month.received, exp = sm.month.expected;
    var due = billing.filter(function (b) { return (b.status || 'active') === 'active' && isIso(b.nextDue); })
      .map(function (b) { return String(b.nextDue).slice(0, 10); }).sort().slice(0, MAX_DUE);
    return { any: true, got: C.formatMoney(got, sm.currency), of: C.formatMoney(exp, sm.currency),
      pct: exp > 0 ? Math.round(Math.max(0, Math.min(1, got / exp)) * 1000) / 1000 : 0, month: t.slice(0, 7), due: due };
  }

  // Home's week: lifted of written this week (Monday to today), and who is behind.
  function weekOf(store, coachId, rows, t, daysOf) {
    var CR = typeof window !== 'undefined' ? window.CoachReport : null;
    if (!CR || !CR.teamWeek || !CR.fromStore) return null;
    var win = CR.weekSoFar(t), W = CR.teamWeek(CR.fromStore(store, coachId, win), win);
    var behind = [];
    if (CA() && CA().caIsBehind && CA().caWeek) {
      (rows || []).forEach(function (r) {
        var wk = r.status && r.status.week, planned = wk && wk.sessionsPerWeek && r.status.program ? wk.sessionsPerWeek : 0;
        var trained = (daysOf(r.athlete.id) || []).filter(function (d) { return d && d.on; }).length;
        if (CA().caIsBehind(r, CA().caWeek(trained, planned))) behind.push(r);
      });
    }
    return { done: W.sessionsDone || 0, planned: W.sessionsPlanned || 0, behind: behind.length,
      behindName: behind.length ? clip(first(behind[0].athlete.name), 20) : null, weekStart: win.from };
  }

  // The snapshot. o: { coachId, today, now, store (default Store.get()), rows (deskRows), jobs (clJobs, done
  // flags and all: CoachLifters.model's), daysOf(id) → the last 7 days [{ on }] (coach.html trainingDays), unit }.
  function build(o) {
    o = o || {};
    var store = o.store || (typeof Store !== 'undefined' && Store.get ? Store.get() : {}) || {};
    var t = o.today || todayIso(), now = o.now || Date.now(), coachId = o.coachId;
    var rows = o.rows || (typeof deskRows === 'function' && coachId ? deskRows(coachId, { today: t, now: now }) : []);
    var jobs = o.jobs || (CL() && CL().clJobs ? CL().clJobs(rows, { today: t }) : []);
    var daysOf = o.daysOf || function (id) { try { return typeof trainingDays === 'function' ? trainingDays(id, 7) : []; } catch (e) { return []; } };
    var need = CA() && CA().caNeedIds ? CA().caNeedIds(jobs) : [];
    var lead = CA() && CA().caLeadJobs ? CA().caLeadJobs(jobs, need) : [];
    var ids = rows.map(function (r) { return r.athlete.id; });
    return {
      role: 'coach', at: now, unit: o.unit || (typeof unitLabel === 'function' ? unitLabel() : 'kg'),
      coach: {
        need: need.length,
        jobs: lead.slice(0, MAX_JOBS).map(jobRow),
        meets: meetsOf(rows),
        money: moneyOf(store, ids, t),
        week: weekOf(store, coachId, rows, t, daysOf)
      }
    };
  }

  // Native only, never in the demo; debounced, or at once (the app going to the background).
  var timer = null;
  function sync(now) {
    var native = typeof window !== 'undefined' && window.PowaNative && PowaNative.isNative && PowaNative.isNative();
    if (!native || window._demoMode) return;
    clearTimeout(timer);
    var run = function () {
      try {
        var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (!u || !u.id) return;
        var M = CL() && CL().model ? CL().model({ reuse: true }) : null;
        PowaNative.updateWidget(build({ coachId: u.id, rows: M ? M.rows : null, jobs: M ? M.jobs : null }));
      } catch (e) {}
    };
    if (now) run(); else timer = setTimeout(run, 800);
  }

  window.CoachWidget = { build: build, sync: sync, jobRow: jobRow, meetsOf: meetsOf };
})();
