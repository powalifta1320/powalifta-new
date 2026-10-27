/* coach-report.js: the coach's week, one core for the app and the server (2026-10-28).
   The Monday report (the push, the email, the in-app "Last week") and the Thursday missed-sessions
   push all come from here, so the app and the server always say the same thing.
   Plain JS: no imports, no DOM, no Store, no clock (every date is passed in). It assigns
   globalThis.CoachReport, so coach.html loads it with a <script> tag, the edge function with a
   side-effect import, and tests with either. A byte-identical copy lives at
   supabase/functions/_shared/coach-report.js (test/coach-report.test.mjs checks they match):
   edit this file, then copy it there.
   Dates are 'YYYY-MM-DD' strings and all date math is UTC on those strings, like clients.js.
   Pain is never described here beyond "pain reported": no body part, ever (lock screens, inboxes). */
(function (G) {
  'use strict';
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var LIFT_COLOR = { squat: '#38c6ff', bench: '#a98bff', deadlift: '#ffbf3c' };
  var KG_PER_LB = 0.45359237;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var PR_EPS = 0.05;           // app.js isPRForLog: a PR beats the best before it by more than this
  var MEET_DAYS = 28;          // Coming up: meets in the next 4 weeks
  var CHECKIN_DAYS = 28;       // check-ins missing: checked in during the 4 weeks before, not last week
  var MIDWEEK_ELAPSED = 3;     // the Thursday check counts Monday to Wednesday as gone
  var JOBS = ['digest', 'coach-report', 'midweek'];

  /* ---------------------------------------------------------------- dates */
  function d10(v) { return String(v == null ? '' : v).slice(0, 10); }
  function isIso(v) {
    var s = d10(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var t = Date.parse(s + 'T12:00:00Z');
    return isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
  }
  function addDays(iso, n) { var d = new Date(d10(iso) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weekday(iso) { return (new Date(d10(iso) + 'T12:00:00Z').getUTCDay() + 6) % 7; }   // Mon 0 … Sun 6
  function mondayOf(iso) { return addDays(iso, -weekday(iso)); }
  function daysBetween(a, b) { return Math.round((Date.parse(d10(b) + 'T12:00:00Z') - Date.parse(d10(a) + 'T12:00:00Z')) / 86400000); }
  // The report's week: last Monday to last Sunday, whatever day it is now.
  function lastWeek(today) { var mon = mondayOf(today); return { from: addDays(mon, -7), to: addDays(mon, -1), today: d10(today) }; }
  // This week so far: Monday to today (the Thursday check).
  function weekSoFar(today) { return { from: mondayOf(today), to: d10(today), today: d10(today) }; }
  function dayLabel(iso) { var p = d10(iso).split('-'); return WEEKDAYS[weekday(iso)] + ' ' + Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1]; }
  // '19–25 Oct', '28 Sep – 4 Oct'.
  function rangeLabel(from, to) {
    var a = d10(from).split('-'), b = d10(to).split('-');
    if (a.length < 3 || b.length < 3) return '';
    if (a[0] === b[0] && a[1] === b[1]) return Number(a[2]) + '–' + Number(b[2]) + ' ' + MONTHS[Number(b[1]) - 1];
    return Number(a[2]) + ' ' + MONTHS[Number(a[1]) - 1] + ' – ' + Number(b[2]) + ' ' + MONTHS[Number(b[1]) - 1];
  }
  function whenText(days) {
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days < 21) return 'in ' + days + ' days';
    var w = Math.round(days / 7);
    return 'in ' + w + (w === 1 ? ' week' : ' weeks');
  }

  /* ---------------------------------------------------------------- words */
  function str(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
  function first(name) { return str(name).split(' ')[0] || ''; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function listJoin(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function unitOf(u) { return u === 'lbs' || u === 'lb' ? 'lbs' : 'kg'; }
  function inUnit(kg, unit) { var v = Number(kg) || 0; return unitOf(unit) === 'lbs' ? v / KG_PER_LB : v; }
  // A load as the lifter wrote it: "182.5", "405" (one decimal, none when it's whole).
  function loadText(kg, unit) { var v = Math.round(inUnit(kg, unit) * 10) / 10; return String(v); }
  function e1rmText(kg, unit) { return Math.round(inUnit(kg, unit)) + ' ' + unitOf(unit); }
  // '$440', '£1,200', '€92.50'.
  function money(cents, currency) {
    var c = Math.round(Number(cents) || 0), cur = /^[A-Z]{3}$/.test(String(currency || '')) ? currency : 'USD', whole = c % 100 === 0;
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(c / 100); }
    catch (e) { return cur + ' ' + (c / 100).toFixed(whole ? 0 : 2); }
  }
  // First names for a lock screen; two Toms become "Tom B." and "Tom K.".
  function shortNames(people) {
    var count = {};
    people.forEach(function (p) { var f = first(p.name).toLowerCase(); count[f] = (count[f] || 0) + 1; });
    var out = {};
    people.forEach(function (p) {
      var parts = str(p.name).split(' '), f = parts[0] || 'A lifter';
      out[p.id] = count[f.toLowerCase()] > 1 && parts.length > 1 ? f + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.' : f;
    });
    return out;
  }
  function byName(a, b) { return String(a.name).localeCompare(String(b.name)); }

  /* ---------------------------------------------------------------- sessions planned */
  function setOpen(s) { return !!s && !s.completed && !s.skipped; }
  function workDays(w) {
    return ((w && w.days) || []).filter(function (d) { return ((d && d.exercises) || []).some(function (e) { return e && Array.isArray(e.sets) && e.sets.length > 0; }); });
  }
  // Sessions a week from a block: the days with work in its current week, the first with a set still
  // to do (app.js programWeekState + sessionsPerWeek). A finished block plans nothing: the app never
  // calls a lifter with every set done "missed" (coachAthleteStatus), they need a next block instead.
  function plannedPerWeek(weeks) {
    if (typeof weeks === 'string') { try { weeks = JSON.parse(weeks); } catch (e) { weeks = null; } }
    if (!Array.isArray(weeks)) return 0;
    for (var i = 0; i < weeks.length; i++) {
      var days = workDays(weeks[i]);
      var open = days.some(function (d) { return d.exercises.some(function (e) { return (e.sets || []).some(setOpen); }); });
      if (open) return days.length;
    }
    return 0;
  }

  // A program as the report reads it: the block's JSON, or (the server, which drops the JSON as it
  // pages) the planned sessions it already worked out.
  function plannedOf(p) {
    if (!p) return 0;
    if (p.planned != null && isFinite(Number(p.planned))) return Math.max(0, Math.round(Number(p.planned)));
    return plannedPerWeek(p.weeks);
  }

  /* ---------------------------------------------------------------- PRs */
  // stats: [{ athleteId, lifts: { squat: { during, before } } }] (the window's best competition-equivalent
  // e1RM per main lift, and the best ever before it). A PR beats a real earlier best: a lifter's very first
  // logs of a lift are never one (isPRForLog). → [{ athleteId, lift, e1rm, before }]
  function prsFromStats(stats) {
    var out = [];
    (stats || []).forEach(function (s) {
      if (!s || !s.athleteId || !s.lifts || typeof s.lifts !== 'object') return;
      LIFTS.forEach(function (L) {
        var x = s.lifts[L];
        if (!x) return;
        var during = Number(x.during), before = Number(x.before);
        if (before > 0 && during > before + PR_EPS) out.push({ athleteId: s.athleteId, lift: L, e1rm: during, before: before });
      });
    });
    return out;
  }

  /* ---------------------------------------------------------------- busy weeks */
  // Approved busy weeks (schedule_requests, read defensively: the table may not exist yet, and its
  // rows may be the app's camelCase or the database's snake_case) → [{ athleteId, weekStart, days }].
  function busyRows(rows) {
    var out = [];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var st = String(r.status == null ? 'approved' : r.status).toLowerCase();
      if (['approved', 'agreed', 'accepted'].indexOf(st) < 0) return;
      var id = r.athleteId || r.athlete_id, wk = d10(r.weekStart || r.week_start);
      var days = [r.days, r.agreedDays, r.agreed_days, r.sessions].filter(function (v) { return v != null && v !== '' && isFinite(Number(v)); })[0];
      if (!id || !isIso(wk) || days == null) return;
      out.push({ athleteId: id, weekStart: mondayOf(wk), days: Math.max(0, Math.round(Number(days))) });
    });
    return out;
  }

  /* ---------------------------------------------------------------- the team's week */
  // input: { athletes: [{ id, name }], programs: [{ athleteId, weeks }], sessions: { athleteId: n },
  //   prs: [{ athleteId, lift, e1rm }], pains: [{ athleteId, date }], checkins: [{ athleteId, date }],
  //   formChecksOpen: [{ athleteId }], overdue: [{ athleteId, amountCents, currency, daysLate }],
  //   meets: [{ athleteId, name, date }], busy: [{ athleteId, weekStart, days }] }
  //   (a program may carry `planned` instead of `weeks`: the server's lean read)
  // opts: { from, to, today }. Behind: trained none of their sessions, or two or more short (the same
  // line as the This week tile, coach-lifters.js clTeam). An agreed busy week plans the agreed days.
  function teamWeek(input, opts) {
    input = input || {}; opts = opts || {};
    var from = d10(opts.from), to = d10(opts.to), today = isIso(opts.today) ? d10(opts.today) : to;
    var people = (input.athletes || []).filter(function (a) { return a && a.id; }).map(function (a) { return { id: a.id, name: str(a.name) || 'A lifter' }; });
    var who = {}; people.forEach(function (a) { who[a.id] = a; });
    var nameOf = function (id) { return who[id] ? who[id].name : ''; };
    var inWin = function (d) { d = d10(d); return d >= from && d <= to; };
    var prog = {}; (input.programs || []).forEach(function (p) { if (p && who[p.athleteId] && !prog[p.athleteId]) prog[p.athleteId] = p; });
    var busy = {}; busyRows(input.busy).forEach(function (b) { if (who[b.athleteId] && b.weekStart === mondayOf(from)) busy[b.athleteId] = b.days; });
    var sessions = input.sessions || {};
    var trained = 0, done = 0, planned = 0, behind = [];
    people.forEach(function (a) {
      var n = Math.max(0, Math.round(Number(sessions[a.id]) || 0));
      if (n > 0) trained++;
      var p = plannedOf(prog[a.id]);
      if (busy[a.id] != null) p = Math.min(p, busy[a.id]);
      if (!(p > 0)) return;
      planned += p; done += Math.min(n, p);
      if (n === 0 || n <= p - 2) behind.push({ id: a.id, name: a.name, done: n, planned: p });
    });
    behind.sort(function (x, y) { return x.done / x.planned - y.done / y.planned || y.planned - x.planned || byName(x, y); });
    // Pain reported in the week: who and how often, never what.
    var painBy = {};
    (input.pains || []).forEach(function (r) {
      if (!r || !who[r.athleteId] || !inWin(r.date)) return;
      var x = painBy[r.athleteId] || (painBy[r.athleteId] = { id: r.athleteId, name: nameOf(r.athleteId), n: 0, last: '' });
      x.n++; if (d10(r.date) > x.last) x.last = d10(r.date);
    });
    var pain = Object.keys(painBy).map(function (k) { return painBy[k]; }).sort(function (x, y) { return y.n - x.n || y.last.localeCompare(x.last) || byName(x, y); });
    var prs = (input.prs || []).filter(function (p) { return p && who[p.athleteId] && LIFTS.indexOf(p.lift) >= 0 && Number(p.e1rm) > 0; })
      .map(function (p) { return { id: p.athleteId, name: nameOf(p.athleteId), lift: p.lift, e1rm: Number(p.e1rm) }; })
      .sort(function (x, y) { return byName(x, y) || LIFTS.indexOf(x.lift) - LIFTS.indexOf(y.lift); });
    var fcBy = {}, formChecks = 0;
    (input.formChecksOpen || []).forEach(function (f) {
      if (!f || !who[f.athleteId]) return;
      formChecks++;
      (fcBy[f.athleteId] = fcBy[f.athleteId] || { id: f.athleteId, name: nameOf(f.athleteId), n: 0 }).n++;
    });
    var formCheckWho = Object.keys(fcBy).map(function (k) { return fcBy[k]; }).sort(function (x, y) { return y.n - x.n || byName(x, y); });
    // Check-ins missing: checked in during the four weeks before and not last week (someone who never
    // checks in isn't news every Monday).
    var before = addDays(from, -CHECKIN_DAYS), ciNow = {}, ciLast = {};
    (input.checkins || []).forEach(function (c) {
      if (!c || !who[c.athleteId] || !isIso(c.date)) return;
      var d = d10(c.date);
      if (d >= from && d <= to) ciNow[c.athleteId] = true;
      else if (d >= before && d < from && d > (ciLast[c.athleteId] || '')) ciLast[c.athleteId] = d;
    });
    var checkinsMissing = Object.keys(ciLast).filter(function (id) { return !ciNow[id]; })
      .map(function (id) { return { id: id, name: nameOf(id), last: ciLast[id] }; }).sort(byName);
    // Meets in the next four weeks, one entry per meet.
    var mg = {};
    (input.meets || []).forEach(function (m) {
      if (!m || !who[m.athleteId] || !isIso(m.date)) return;
      var days = daysBetween(today, m.date);
      if (days < 0 || days > MEET_DAYS) return;
      var nm = str(m.name) || 'Meet', k = nm.toLowerCase() + '|' + d10(m.date);
      var g = mg[k] || (mg[k] = { name: nm, date: d10(m.date), days: days, lifters: [] });
      if (!g.lifters.some(function (x) { return x.id === m.athleteId; })) g.lifters.push({ id: m.athleteId, name: nameOf(m.athleteId) });
    });
    var meets = Object.keys(mg).map(function (k) { mg[k].lifters.sort(byName); return mg[k]; })
      .sort(function (x, y) { return x.days - y.days || x.name.localeCompare(y.name); });
    // Money: payments overdue on the coach's own record, totalled in the most common currency.
    var od = (input.overdue || []).filter(function (o) { return o && who[o.athleteId]; });
    var curN = {}, cur = null;
    od.forEach(function (o) { var c = String(o.currency || 'USD').toUpperCase(); curN[c] = (curN[c] || 0) + 1; if (!cur || curN[c] > curN[cur]) cur = c; });
    var overdue = { n: od.length, total: 0, currency: cur || 'USD', mixed: false, who: [] };
    od.forEach(function (o) {
      if (String(o.currency || 'USD').toUpperCase() === overdue.currency) overdue.total += Math.round(Number(o.amountCents) || 0);
      else overdue.mixed = true;
      overdue.who.push({ id: o.athleteId, name: nameOf(o.athleteId), daysLate: Math.max(0, Math.round(Number(o.daysLate) || 0)) });
    });
    overdue.who.sort(function (x, y) { return y.daysLate - x.daysLate || byName(x, y); });
    return {
      from: from, to: to, today: today,
      of: people.length, trained: trained, sessionsDone: done, sessionsPlanned: planned,
      behind: behind, pain: pain, prs: prs, formChecks: formChecks, formCheckWho: formCheckWho,
      checkinsMissing: checkinsMissing, meets: meets, overdue: overdue
    };
  }
  // Worth a Monday email and push: someone trained, or something waits on the coach. A team that did
  // nothing with nothing waiting (a dormant account) gets nothing.
  function worthSending(team) {
    if (!team || !team.of) return false;
    return team.trained > 0 || team.pain.length > 0 || team.formChecks > 0 || team.overdue.n > 0 || team.meets.length > 0;
  }
  // Needs you, in the coach's triage order (app.js deskReasons): pain, then behind, form checks, check-ins.
  function needsCount(team) {
    var ids = {};
    team.pain.concat(team.behind, team.formCheckWho, team.checkinsMissing).forEach(function (x) { ids[x.id] = true; });
    return Object.keys(ids).length;
  }
  // The first lifter the coach should open (the report's one action).
  function firstUp(team) {
    var x = team.pain[0] || team.behind[0] || team.formCheckWho[0] || team.checkinsMissing[0] || null;
    return x ? { id: x.id, name: x.name } : null;
  }

  /* ---------------------------------------------------------------- the Thursday check */
  // Behind by Thursday, leniently: Monday to Wednesday count as gone, so a lifter on N sessions should
  // have floor(N × 3/7) done (1 of 3 or 4, 2 of 5 or 6). input.sessions counts Monday to today.
  // → [{ id, name, done, planned, expected }] worst first.
  function midweekBehind(input, today) {
    input = input || {};
    var mon = mondayOf(today);
    var people = (input.athletes || []).filter(function (a) { return a && a.id; });
    var prog = {}; (input.programs || []).forEach(function (p) { if (p && !prog[p.athleteId]) prog[p.athleteId] = p; });
    var busy = {}; busyRows(input.busy).forEach(function (b) { if (b.weekStart === mon) busy[b.athleteId] = b.days; });
    var out = [];
    people.forEach(function (a) {
      var p = plannedOf(prog[a.id]);
      if (busy[a.id] != null) p = Math.min(p, busy[a.id]);
      if (!(p > 0)) return;
      var expected = Math.floor(p * MIDWEEK_ELAPSED / 7);
      var n = Math.max(0, Math.round(Number((input.sessions || {})[a.id]) || 0));
      if (n < expected) out.push({ id: a.id, name: str(a.name) || 'A lifter', done: n, planned: p, expected: expected });
    });
    return out.sort(function (x, y) { return x.done / x.expected - y.done / y.expected || y.planned - x.planned || byName(x, y); });
  }

  /* ---------------------------------------------------------------- pushes */
  // "Your team's week" / "17 of 20 trained · 4 PRs · 3 behind". null when there's no team.
  function reportPush(team) {
    if (!team || !team.of) return null;
    var parts = [team.trained + ' of ' + team.of + ' trained'];
    if (team.prs.length) parts.push(plural(team.prs.length, 'PR'));
    if (team.behind.length) parts.push(team.behind.length + ' behind');
    return { title: 'Your team’s week', body: parts.join(' · ') };
  }
  // "2 lifters haven't trained this week" / "Tom 0 of 4 · Leo 0 of 3"; one lifter is named in the title.
  function midweekPush(list) {
    list = (list || []).filter(Boolean);
    if (!list.length) return null;
    var none = list.every(function (x) { return !x.done; });
    var nm = shortNames(list);
    if (list.length === 1) {
      var x = list[0];
      return { title: nm[x.id] + (none ? ' hasn’t trained this week' : ' is behind this week'), body: x.done + ' of ' + x.planned + ' sessions so far' };
    }
    var shown = list.slice(0, 3).map(function (y) { return nm[y.id] + ' ' + y.done + ' of ' + y.planned; });
    if (list.length > 3) shown.push('+' + (list.length - 3) + ' more');
    return { title: list.length + ' lifters ' + (none ? 'haven’t trained this week' : 'are behind this week'), body: shown.join(' · ') };
  }

  // PRs one lifter at a time, their lifts in squat, bench, deadlift order: [{ id, name, prs }].
  function prsByLifter(team) {
    var by = {}, out = [];
    team.prs.forEach(function (p) {
      if (!by[p.id]) { by[p.id] = { id: p.id, name: p.name, prs: [] }; out.push(by[p.id]); }
      by[p.id].prs.push(p);
    });
    return out;
  }

  /* ---------------------------------------------------------------- the email */
  var C = { page: '#0b0b0c', card: '#141416', raised: '#1b1b1f', line: '#26262c', text: '#f4f4f6', text2: '#b8b8c0', text3: '#8c8c96',
    red: '#ff3b4a', pain: '#ff8f80', warn: '#ffb35c', ok: '#34d982', gold: '#ffc23d' };
  var FONT = "Archivo, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  // opts: { coachName, unsubUrl, appUrl, unit } → { subject, html, text, preheader }
  function reportEmail(team, opts) {
    opts = opts || {};
    var U = unitOf(opts.unit), appUrl = opts.appUrl || 'https://www.powalifta.com/coach.html', unsub = opts.unsubUrl || '';
    var push = reportPush(team) || { body: '' };
    var subject = 'Your team’s week: ' + push.body;
    var range = rangeLabel(team.from, team.to);
    var needs = needsCount(team);
    var up = firstUp(team);
    var preheader = needs ? (needs === 1 ? (up ? up.name : 'One lifter') + ' needs you this week.' : plural(needs, 'lifter') + ' need you this week' + (up ? ', starting with ' + up.name : '') + '.')
      : 'Nobody needs you this week.';
    var coachFirst = first(opts.coachName);
    // ---- the text version
    var T = [];
    T.push('Your team’s week · ' + range, '');
    T.push(team.trained + ' of ' + team.of + ' trained' + (team.sessionsPlanned ? ' · ' + team.sessionsDone + ' of ' + team.sessionsPlanned + ' sessions' : '') + (team.prs.length ? ' · ' + plural(team.prs.length, 'PR') : ''), '');
    var tNeeds = [];
    if (team.pain.length) tNeeds.push('Pain reported: ' + team.pain.map(function (p) { return p.name + (p.n > 1 ? ' (' + p.n + ' times)' : ''); }).join(', '));
    if (team.behind.length) tNeeds.push('Behind: ' + team.behind.map(function (b) { return b.name + ' ' + b.done + ' of ' + b.planned; }).join(', '));
    if (team.formChecks) tNeeds.push('Form checks to review: ' + team.formChecks + ' (' + team.formCheckWho.map(function (f) { return f.name; }).join(', ') + ')');
    if (team.checkinsMissing.length) tNeeds.push('No check-in last week: ' + team.checkinsMissing.map(function (c) { return c.name; }).join(', '));
    T.push('Needs you');
    if (tNeeds.length) tNeeds.forEach(function (l) { T.push('- ' + l); }); else T.push('- Nobody. Everyone trained as planned.');
    T.push('');
    if (team.prs.length) {
      T.push('Wins (e1RM PRs)');
      prsByLifter(team).forEach(function (r) { T.push('- ' + r.name + ': ' + r.prs.map(function (p) { return p.lift + ' ' + e1rmText(p.e1rm, U); }).join(', ')); });
      T.push('');
    }
    if (team.meets.length) { T.push('Coming up'); team.meets.forEach(function (m) { T.push('- ' + m.name + ', ' + dayLabel(m.date) + ' (' + whenText(m.days) + '): ' + m.lifters.map(function (l) { return l.name; }).join(', ')); }); T.push(''); }
    if (team.overdue.n) { T.push('Money'); T.push('- ' + plural(team.overdue.n, 'payment') + ' overdue: ' + money(team.overdue.total, team.overdue.currency) + (team.overdue.mixed ? ' (plus other currencies)' : '')); T.push(''); }
    T.push('Open Today: ' + appUrl, '');
    T.push((coachFirst ? 'Sent to ' + coachFirst + ' because' : 'You get this because') + ' the Monday report is on in Settings, Notifications.');
    if (unsub) T.push('Unsubscribe: ' + unsub);
    T.push('', 'POWALIFTA');
    // ---- the HTML version (tables and inline styles: email clients)
    var h = [];
    var sec = function (title, rows, first, count) {
      return '<tr><td style="padding:' + (first ? '28px' : '32px') + ' 0 10px;font-family:' + FONT + ';font-size:20px;line-height:1.2;font-weight:700;color:' + C.text + ';">' + esc(title) +
        (count ? ' <span style="font-size:15px;font-weight:600;color:' + C.text3 + ';">' + esc(count) + '</span>' : '') + '</td></tr>' +
        '<tr><td style="background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:20px;padding:4px 20px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' + rows.join('') + '</table></td></tr>';
    };
    var row = function (label, value, tone, i) {
      var dot = tone ? '<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:' + tone + ';margin:0 10px 1px 0;vertical-align:middle;"></span>' : '';
      return '<tr><td style="padding:14px 0;' + (i ? 'border-top:1px solid ' + C.line + ';' : '') + 'font-family:' + FONT + ';">' +
        '<div style="font-size:15px;line-height:1.35;font-weight:600;color:' + C.text + ';">' + dot + label + '</div>' +
        (value ? '<div style="margin-top:4px;font-size:15px;line-height:1.45;color:' + C.text2 + ';">' + value + '</div>' : '') + '</td></tr>';
    };
    var names = function (list, fmt) { return list.map(function (x) { return esc(x.name) + (fmt ? fmt(x) : ''); }).join(', '); };
    var nRows = [];
    if (team.pain.length) nRows.push(row('Pain reported', names(team.pain, function (p) { return p.n > 1 ? ' <span style="color:' + C.text3 + ';">' + p.n + ' times</span>' : ''; }), C.pain, nRows.length));
    if (team.behind.length) nRows.push(row('Behind', names(team.behind, function (b) { return ' <span style="color:' + C.text3 + ';">' + b.done + ' of ' + b.planned + '</span>'; }), C.warn, nRows.length));
    if (team.formChecks) nRows.push(row(plural(team.formChecks, 'form check') + ' to review', names(team.formCheckWho), '', nRows.length));
    if (team.checkinsMissing.length) nRows.push(row('No check-in last week', names(team.checkinsMissing), '', nRows.length));
    if (!nRows.length) nRows.push(row('Nobody', 'Everyone trained as planned.', C.ok, 0));
    var wRows = prsByLifter(team).map(function (r, i) {
      return row(esc(r.name), r.prs.map(function (p) {
        return '<span style="white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:' + LIFT_COLOR[p.lift] + ';margin:0 8px 1px 0;vertical-align:middle;"></span>' +
          esc(LIFT[p.lift]) + ' <span style="color:' + C.text + ';font-weight:600;">' + esc(e1rmText(p.e1rm, U)) + '</span></span>';
      }).join('&nbsp;&nbsp;&nbsp; '), '', i);
    });
    var mRows = team.meets.map(function (m, i) {
      return row(esc(m.name), esc(dayLabel(m.date)) + ', ' + esc(whenText(m.days)) + ' · ' + names(m.lifters), C.gold, i);
    });
    var big = '<span style="font-size:44px;line-height:1;font-weight:800;letter-spacing:-0.02em;color:' + C.text + ';">' + team.trained + '</span>' +
      '<span style="font-size:22px;font-weight:600;color:' + C.text3 + ';"> of ' + team.of + '</span>';
    var facts = [];
    if (team.sessionsPlanned) facts.push(team.sessionsDone + ' of ' + team.sessionsPlanned + ' sessions');
    if (team.prs.length) facts.push(plural(team.prs.length, 'PR'));
    if (team.behind.length) facts.push(team.behind.length + ' behind');
    h.push('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>' + esc(subject) + '</title></head>',
      '<body style="margin:0;padding:0;background:' + C.page + ';color:' + C.text + ';">',
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:' + C.page + ';">' + esc(preheader) + '</div>',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.page + ';"><tr><td align="center" style="padding:32px 16px 40px;">',
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">',
      '<tr><td style="font-family:' + FONT + ';font-size:15px;font-weight:800;letter-spacing:0.14em;color:' + C.text + ';">POWALIFTA</td></tr>',
      '<tr><td style="padding:28px 0 0;font-family:' + FONT + ';"><div style="font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.01em;color:' + C.text + ';">Your team’s week</div>',
      '<div style="margin-top:6px;font-size:15px;color:' + C.text3 + ';">' + esc(range) + '</div></td></tr>',
      '<tr><td style="padding:24px 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + C.card + ';border:1px solid ' + C.line + ';border-radius:20px;">',
      '<tr><td style="padding:22px 20px 20px;font-family:' + FONT + ';">' + big + '<div style="margin-top:8px;font-size:15px;color:' + C.text2 + ';">lifters trained' + (facts.length ? ' · ' + esc(facts.join(' · ')) : '') + '</div></td></tr></table></td></tr>');
    h.push(sec('Needs you', nRows, true));
    if (wRows.length) h.push(sec('Wins', wRows, false, plural(team.prs.length, 'e1RM PR')));
    if (mRows.length) h.push(sec('Coming up', mRows));
    if (team.overdue.n) h.push(sec('Money', [row(plural(team.overdue.n, 'payment') + ' overdue', esc(money(team.overdue.total, team.overdue.currency)) + (team.overdue.mixed ? ' plus other currencies' : '') + ' · ' + names(team.overdue.who), C.pain, 0)]));
    h.push('<tr><td style="padding:32px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:' + C.red + ';">',
      '<a href="' + esc(appUrl) + '" style="display:inline-block;padding:14px 26px;font-family:' + FONT + ';font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Open Today</a>',
      '</td></tr></table></td></tr>',
      '<tr><td style="padding:36px 0 0;border-top:0;font-family:' + FONT + ';font-size:13px;line-height:1.6;color:' + C.text3 + ';">',
      (coachFirst ? 'Sent to ' + esc(coachFirst) + ' because' : 'You get this because') + ' the Monday report is on in Settings › Notifications.' +
      (unsub ? ' <a href="' + esc(unsub) + '" style="color:' + C.text2 + ';text-decoration:underline;">Unsubscribe</a>' : ''),
      '<br>POWALIFTA</td></tr></table></td></tr></table></body></html>');
    return { subject: subject, html: h.join(''), text: T.join('\n'), preheader: preheader };
  }

  /* ---------------------------------------------------------------- inputs */
  function ensureWeeks(w) { if (typeof w === 'string') { try { return JSON.parse(w); } catch (e) { return []; } } return Array.isArray(w) ? w : []; }
  // From the app's Store (camelCase, as db.js maps it). opts: { from, to, today, formChecks (the coach's
  // form checks: coach.html keeps them outside the Store), busy }.
  function fromStore(store, coachId, opts) {
    store = store || {}; opts = opts || {};
    var from = d10(opts.from), to = d10(opts.to), today = isIso(opts.today) ? d10(opts.today) : to;
    var roster = (store.athletes || []).filter(function (a) { return a && a.id && coachId && a.coachId === coachId && a.id !== coachId; });
    var ids = {}; roster.forEach(function (a) { ids[a.id] = true; });
    var mine = function (x) { return !!x && !!ids[x.athleteId]; };
    var days = {}, lifts = {};
    (store.workoutLogs || []).forEach(function (l) {
      if (!mine(l)) return;
      var d = d10(l.date);
      if (!isIso(d) || d > to) return;
      if (d >= from) (days[l.athleteId] = days[l.athleteId] || {})[d] = true;
      var L = String(l.lift || '').toLowerCase(), e = Number(l.e1rmComp);
      if (LIFTS.indexOf(L) < 0 || !(e > 0)) return;
      var s = lifts[l.athleteId] || (lifts[l.athleteId] = {}), x = s[L] || (s[L] = { during: 0, before: 0 });
      if (d >= from) x.during = Math.max(x.during, e); else x.before = Math.max(x.before, e);
    });
    var sessions = {};
    roster.forEach(function (a) { sessions[a.id] = Object.keys(days[a.id] || {}).length; });
    return {
      athletes: roster.map(function (a) { return { id: a.id, name: str(a.name) }; }),
      programs: (store.programs || []).filter(mine).map(function (p) { return { athleteId: p.athleteId, weeks: ensureWeeks(p.weeks) }; }),
      sessions: sessions,
      prs: prsFromStats(Object.keys(lifts).map(function (id) { return { athleteId: id, lifts: lifts[id] }; })),
      pains: (store.painReports || []).filter(function (r) { return mine(r) && !r.resolvedAt; }).map(function (r) { return { athleteId: r.athleteId, date: d10(r.day || r.createdAt) }; }),
      checkins: (store.checkins || []).filter(mine).map(function (c) { return { athleteId: c.athleteId, date: d10(c.createdAt || c.weekStart) }; })
        .concat((store.checkinAnswers || []).filter(mine).map(function (a) { return { athleteId: a.athleteId, date: d10(a.period) }; })),
      formChecksOpen: (opts.formChecks || []).filter(function (f) { return mine(f) && !f.coachReply; }).map(function (f) { return { athleteId: f.athleteId }; }),
      overdue: (store.clientBilling || []).filter(function (b) {
        return mine(b) && (!b.coachId || b.coachId === coachId) && (b.status || 'active') === 'active' && isIso(b.nextDue) && d10(b.nextDue) < today;
      }).map(function (b) { return { athleteId: b.athleteId, amountCents: Math.round(Number(b.amountCents) || 0), currency: String(b.currency || 'USD').toUpperCase(), daysLate: daysBetween(b.nextDue, today) }; }),
      meets: (store.meets || []).filter(function (m) { return mine(m) && isIso(m.date); }).map(function (m) { return { athleteId: m.athleteId, name: str(m.name), date: d10(m.date) }; }),
      busy: busyRows(opts.busy || store.scheduleRequests || [])
    };
  }
  // From the database (snake_case rows the edge function read for one coach). rows: { athletes: [{ id,
  // name }], programs: [{ athlete_id, coach_id, weeks, updated_at }], stats: [{ athlete_id, sessions, lifts }]
  // (public.coach_week_stats), pains: [{ athlete_id, day, resolved_at }], checkins: [{ athlete_id,
  // created_at, week_start }], checkinAnswers: [{ athlete_id, period }], formChecks: [{ athlete_id,
  // coach_reply }], billing: [{ athlete_id, coach_id, amount_cents, currency, next_due, status }],
  // meets: [{ athlete_id, name, meet_date }], busy: [schedule_requests rows] }. opts: { coachId, today }.
  function fromRows(rows, opts) {
    rows = rows || {}; opts = opts || {};
    var today = d10(opts.today), coachId = opts.coachId;
    var people = (rows.athletes || []).filter(function (a) { return a && a.id && a.id !== coachId; });
    var ids = {}; people.forEach(function (a) { ids[a.id] = true; });
    var mine = function (r) { return !!r && !!ids[r.athlete_id]; };
    // One program per lifter: the coach's own first, the newest of them.
    var progs = (rows.programs || []).filter(mine).slice().sort(function (a, b) {
      return (b.coach_id === coachId) - (a.coach_id === coachId) || String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
    var seen = {}, programs = [];
    progs.forEach(function (p) {
      if (seen[p.athlete_id]) return;
      seen[p.athlete_id] = true;
      programs.push(p.planned != null && p.weeks == null ? { athleteId: p.athlete_id, planned: p.planned } : { athleteId: p.athlete_id, weeks: ensureWeeks(p.weeks) });
    });
    var sessions = {}, stats = [];
    people.forEach(function (a) { sessions[a.id] = 0; });
    (rows.stats || []).filter(mine).forEach(function (s) {
      sessions[s.athlete_id] = Math.max(0, Math.round(Number(s.sessions) || 0));
      var l = s.lifts;
      if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = null; } }
      if (l && typeof l === 'object') stats.push({ athleteId: s.athlete_id, lifts: l });
    });
    return {
      athletes: people.map(function (a) { return { id: a.id, name: str(a.name) }; }),
      programs: programs,
      sessions: sessions,
      prs: prsFromStats(stats),
      pains: (rows.pains || []).filter(function (r) { return mine(r) && !r.resolved_at; }).map(function (r) { return { athleteId: r.athlete_id, date: d10(r.day || r.created_at) }; }),
      checkins: (rows.checkins || []).filter(mine).map(function (c) { return { athleteId: c.athlete_id, date: d10(c.created_at || c.week_start) }; })
        .concat((rows.checkinAnswers || []).filter(mine).map(function (a) { return { athleteId: a.athlete_id, date: d10(a.period) }; })),
      formChecksOpen: (rows.formChecks || []).filter(function (f) { return mine(f) && !f.coach_reply; }).map(function (f) { return { athleteId: f.athlete_id }; }),
      overdue: (rows.billing || []).filter(function (b) {
        return mine(b) && (!b.coach_id || b.coach_id === coachId) && (b.status || 'active') === 'active' && isIso(b.next_due) && d10(b.next_due) < today;
      }).map(function (b) { return { athleteId: b.athlete_id, amountCents: Math.round(Number(b.amount_cents) || 0), currency: String(b.currency || 'USD').toUpperCase(), daysLate: daysBetween(b.next_due, today) }; }),
      meets: (rows.meets || []).filter(function (m) { return mine(m) && isIso(m.meet_date || m.date); }).map(function (m) { return { athleteId: m.athlete_id, name: str(m.name), date: d10(m.meet_date || m.date) }; }),
      busy: busyRows(rows.busy)
    };
  }

  /* ---------------------------------------------------------------- the server's jobs */
  // Which jobs a run does: the one asked for, else by the UTC weekday of `today` (Monday: the lifters'
  // digest and the coaches' report; Thursday: the missed-sessions push; other days: nothing).
  // body: { job, dryRun, today } (the cron sends {}). → { jobs, today, dryRun, error }
  function jobPlan(body, nowIso) {
    body = body && typeof body === 'object' ? body : {};
    var today = body.today != null ? d10(body.today) : d10(nowIso);
    if (!isIso(today)) return { jobs: [], today: null, dryRun: !!body.dryRun, error: 'today must be YYYY-MM-DD' };
    var dryRun = body.dryRun === true;
    if (body.job != null) {
      if (JOBS.indexOf(body.job) < 0) return { jobs: [], today: today, dryRun: dryRun, error: 'job must be one of ' + JOBS.join(', ') };
      return { jobs: [body.job], today: today, dryRun: dryRun, error: null };
    }
    var wd = weekday(today);
    return { jobs: wd === 0 ? ['digest', 'coach-report'] : wd === 3 ? ['midweek'] : [], today: today, dryRun: dryRun, error: null };
  }

  G.CoachReport = {
    LIFTS: LIFTS, JOBS: JOBS,
    lastWeek: lastWeek, weekSoFar: weekSoFar, mondayOf: mondayOf, addDays: addDays, daysBetween: daysBetween, isIso: isIso,
    dayLabel: dayLabel, rangeLabel: rangeLabel, whenText: whenText, money: money, loadText: loadText, e1rmText: e1rmText, shortNames: shortNames,
    plannedPerWeek: plannedPerWeek, plannedOf: plannedOf, prsFromStats: prsFromStats, busyRows: busyRows,
    teamWeek: teamWeek, worthSending: worthSending, needsCount: needsCount, firstUp: firstUp, prsByLifter: prsByLifter, midweekBehind: midweekBehind,
    reportPush: reportPush, midweekPush: midweekPush, reportEmail: reportEmail,
    fromStore: fromStore, fromRows: fromRows, jobPlan: jobPlan
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
