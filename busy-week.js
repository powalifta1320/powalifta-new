/* busy-week.js: busy weeks (2026-10-28).
   A lifter marks the days they can train this week; the app proposes where this week's sessions go, and
   their coach approves (a self-coached lifter uses it at once). Nothing in the program moves until then:
   the request is its own row (schedule_requests, migration-schedule-requests-2026-10-28.sql), so the
   coach's program is never rewritten behind their back.
     busyWeekPlan({ sessionsLeft, dates, today })  where each session goes (pure)
     busyWeekText(plan, sessions, opts)             the plan in plain words (pure)
     busyWeekApply(prog, proposal, opts)            the program with the plan in it (pure, a copy)
     BusyWeek.sessionsLeft(prog) / datesLeft / dayNames / datesOf / prepick / weekPlanned   (pure)
     BusyWeekUI.row() / open() / pickerRow()        the lifter's Train row, sheet and the session picker's entry
     BusyWeek.approve(req) / decline(req)           the coach's side (coach-lifters.js shows the job)
   The plan: enough days → one session a day in program order, spread out, squat and deadlift days apart
   where it can. Too few → the extra session's main lifts join a day that has at most two main lifts (never
   squat and deadlift together when another day fits) and its accessories are dropped; no day with room →
   that session moves to next week. Days are stored as 'Mon'…'Sun' (the intake's own names) with the
   week's Monday; the proposal carries the dates. Unit-tested: tests.html "busy weeks (busy-week.js)". */
(function () {
  'use strict';

  var MAIN = ['squat', 'bench', 'deadlift'];
  var DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var LOG_FIELDS = ['completed', 'skipped', 'missed', 'actualRpe', 'completedAt', 'lastLogId', 'note', 'plannedWeight', 'plannedReps', 'extra', 'attempt'];
  var BUSY_NOTE = 'Busy week';

  /* ---------------------------------------------------------------- dates (pure, UTC noon, no clock) */
  function d10(v) { return String(v == null ? '' : v).slice(0, 10); }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z')); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dow(iso) { return (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7; }   // Mon 0 … Sun 6
  function monday(iso) { return addDays(iso, -dow(iso)); }
  function gap(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
  function dayShort(iso) { return DAY_SHORT[dow(d10(iso))]; }
  function uniqSorted(list) { var seen = {}; return list.filter(function (d) { if (seen[d]) return false; seen[d] = 1; return true; }).sort(); }
  // This week from today: today … Sunday.
  function datesLeft(today) {
    var t = d10(today); if (!isIso(t)) return [];
    var out = [], end = addDays(monday(t), 6);
    for (var d = t; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }
  function dayNames(dates) { return uniqSorted((dates || []).map(d10).filter(isIso)).map(dayShort); }
  function datesOf(weekStart, days) {
    var mon = d10(weekStart); if (!isIso(mon)) return [];
    return uniqSorted((days || []).map(function (n) { var i = DAY_SHORT.indexOf(String(n)); return i < 0 ? null : addDays(mon, i); }).filter(Boolean));
  }
  // The days the lifter said they usually train (their intake), among this week's.
  function prepick(dates, usual) { var u = (usual || []).map(String); return (dates || []).filter(function (d) { return u.indexOf(dayShort(d)) >= 0; }); }

  /* ---------------------------------------------------------------- the sessions left (pure) */
  function setOpen(s) { return !!s && !s.completed && !s.skipped; }
  function mainLifts(day) {
    var out = [];
    (day.exercises || []).forEach(function (e) { if (e && (e.sets || []).length && MAIN.indexOf(e.lift) >= 0 && out.indexOf(e.lift) < 0) out.push(e.lift); });
    return out;
  }
  // This week of the block (the first with a session still to do) and its untouched sessions: a day that
  // was started, finished, skipped or is a rest day isn't one to plan.
  // → { weekIdx, weekNumber, sessions: [{ dayIdx, dayId, name, lifts, heavy, accessories, pinned }] }
  function sessionsLeft(prog) {
    var weeks = (prog && prog.weeks) || [];
    var work = function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).length; }); };
    var wi = -1;
    for (var i = 0; i < weeks.length && wi < 0; i++) if ((weeks[i].days || []).some(function (d) { return work(d) && d.exercises.some(function (e) { return (e.sets || []).some(setOpen); }); })) wi = i;
    if (wi < 0) return { weekIdx: -1, weekNumber: null, sessions: [] };
    var sessions = [];
    (weeks[wi].days || []).forEach(function (d, di) {
      if (!work(d)) return;
      var sets = d.exercises.reduce(function (a, e) { return a.concat(e.sets || []); }, []);
      if (sets.some(function (s) { return s && s.completed; }) || !sets.some(setOpen)) return;
      var lifts = mainLifts(d);
      sessions.push({ dayIdx: di, dayId: d.id || null, name: String(d.name || 'Day ' + (di + 1)), lifts: lifts,
        heavy: lifts.indexOf('squat') >= 0 || lifts.indexOf('deadlift') >= 0,
        accessories: d.exercises.filter(function (e) { return (e.sets || []).length && MAIN.indexOf(e.lift) < 0; }).length,
        pinned: d.scheduledDate || null });
    });
    return { weekIdx: wi, weekNumber: weeks[wi].number || wi + 1, sessions: sessions };
  }

  /* ---------------------------------------------------------------- the plan (pure) */
  function norm(s, i) {
    var lifts = [];
    ((s && s.lifts) || []).forEach(function (l) { if (MAIN.indexOf(l) >= 0 && lifts.indexOf(l) < 0) lifts.push(l); });
    return { dayIdx: s && s.dayIdx != null ? s.dayIdx : i, name: String((s && s.name) || 'Session'), lifts: lifts,
      heavy: lifts.indexOf('squat') >= 0 || lifts.indexOf('deadlift') >= 0, accessories: Math.max(0, Number(s && s.accessories) || 0) };
  }
  function lowerBoth(l) { return l.indexOf('squat') >= 0 && l.indexOf('deadlift') >= 0; }
  // n dates out of the lifter's, kept in order: the fewest heavy days back to back, then squat and deadlift
  // furthest apart, then everything spread out, then the earliest.
  function chooseDates(hosts, dates) {
    var n = hosts.length, best = null, bestKey = null;
    var heavy = hosts.map(function (h) { return h.heavy; });
    (function walk(start, pick) {
      if (pick.length === n) {
        var adj = 0, hGap = Infinity, aGap = Infinity, lastH = -1;
        for (var i = 0; i < n; i++) {
          if (i > 0) { var g = gap(pick[i - 1], pick[i]); aGap = Math.min(aGap, g); if (heavy[i] && heavy[i - 1] && g <= 1) adj++; }
          if (heavy[i]) { if (lastH >= 0) hGap = Math.min(hGap, gap(pick[lastH], pick[i])); lastH = i; }
        }
        var key = [adj, -(hGap === Infinity ? 0 : hGap), -(aGap === Infinity ? 0 : aGap), pick.join(',')];
        var better = !bestKey;
        for (var k = 0; !better && k < key.length; k++) { if (key[k] < bestKey[k]) better = true; else if (key[k] > bestKey[k]) break; }
        if (better) { best = pick.slice(); bestKey = key; }
        return;
      }
      for (var j = start; j <= dates.length - (n - pick.length); j++) walk(j + 1, pick.concat([dates[j]]));
    })(0, []);
    return best || [];
  }
  function liftList(l) { return l.length <= 1 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]; }
  // input: { sessionsLeft: [{ dayIdx, name, lifts, heavy, accessories }] in program order, dates: ['YYYY-MM-DD'],
  //   today } → { assign: [{ dayIdx, date }], merge: [{ from, into }], move: [{ dayIdx, to: 'next week' }], why }
  function busyWeekPlan(input) {
    input = input || {};
    var today = isIso(d10(input.today)) ? d10(input.today) : null;
    var S = (input.sessionsLeft || []).map(norm);
    var dates = uniqSorted((input.dates || []).map(d10).filter(function (d) { return isIso(d) && (!today || d >= today); }));
    var plan = { assign: [], merge: [], move: [], why: '' };
    var n = S.length, m = dates.length;
    if (!n) { plan.why = 'Nothing left to plan this week.'; return plan; }
    if (!m) {
      S.forEach(function (s) { plan.move.push({ dayIdx: s.dayIdx, to: 'next week' }); });
      plan.why = 'No days this week: ' + (n === 1 ? 'the session moves' : 'the ' + n + ' sessions move') + ' to next week.';
      return plan;
    }
    var hosts = S.slice(0, Math.min(n, m)).map(function (s) { return { s: s, lifts: s.lifts.slice(), heavy: s.heavy }; });
    var joined = [], moved = [];
    S.slice(hosts.length).forEach(function (x) {
      var best = null, bestKey = null;
      hosts.forEach(function (h, hi) {
        if (h.lifts.length > 2) return;   // a day with room: at most two main lifts before this one joins
        var union = h.lifts.concat(x.lifts.filter(function (l) { return h.lifts.indexOf(l) < 0; }));
        var key = [lowerBoth(union) && !lowerBoth(h.lifts) ? 1 : 0, x.lifts.filter(function (l) { return h.lifts.indexOf(l) >= 0; }).length, h.lifts.length, -hi];
        var better = !bestKey;
        for (var k = 0; !better && k < key.length; k++) { if (key[k] < bestKey[k]) better = true; else if (key[k] > bestKey[k]) break; }
        if (better) { best = h; bestKey = key; }
      });
      if (!best) { moved.push(x); plan.move.push({ dayIdx: x.dayIdx, to: 'next week' }); return; }
      x.lifts.forEach(function (l) { if (best.lifts.indexOf(l) < 0) best.lifts.push(l); });
      best.heavy = best.heavy || x.heavy;
      joined.push({ x: x, into: best.s });
      plan.merge.push({ from: x.dayIdx, into: best.s.dayIdx });
    });
    var picked = hosts.length === m ? dates : chooseDates(hosts, dates);
    hosts.forEach(function (h, i) { plan.assign.push({ dayIdx: h.s.dayIdx, date: picked[i] }); });
    // Why, in one line.
    var bits = [];
    if (joined.length) {
      bits.push(n + ' sessions in ' + m + (m === 1 ? ' day' : ' days') + ': ' + joined.map(function (j) {
        return j.x.lifts.length ? liftList(j.x.lifts) + ' ' + (j.x.lifts.length > 1 ? 'join ' : 'joins ') + j.into.name : j.x.name + ' left out';
      }).join(', ') + (joined.some(function (j) { return j.x.accessories > 0; }) ? ', accessories dropped' : ''));
    }
    if (moved.length) bits.push((bits.length ? 'no room for ' : 'No room for ') + moved.map(function (x) { return x.name; }).join(' and ') + ': next week');
    if (!bits.length) {
      var hv = hosts.filter(function (h) { return h.heavy; }).length;
      bits.push('One session a day' + (hv >= 2 && n < m ? ', squat and deadlift days apart' : ''));
    }
    plan.why = bits.join('; ') + '.';
    return plan;
  }

  // The plan in plain words: "Thu: Squat Day · Sat: Bench + deadlift (accessories dropped)". opts.dayName(iso).
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function busyWeekText(plan, sessions, opts) {
    opts = opts || {};
    var name = opts.dayName || dayShort;
    var by = {}; (sessions || []).map(norm).forEach(function (s) { by[s.dayIdx] = s; });
    var out = [];
    ((plan && plan.assign) || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).forEach(function (a) {
      var h = by[a.dayIdx]; if (!h) return;
      var ins = ((plan.merge || []).filter(function (m) { return m.into === a.dayIdx; })).map(function (m) { return by[m.from]; }).filter(Boolean);
      var txt;
      if (!ins.length) txt = h.name;
      else {
        var extra = [];
        ins.forEach(function (x) { x.lifts.forEach(function (l) { if (h.lifts.indexOf(l) < 0 && extra.indexOf(l) < 0) extra.push(l); }); });
        txt = h.lifts.length ? cap(h.lifts.concat(extra).join(' + ')) : h.name + (extra.length ? ' + ' + extra.join(' + ') : '');
        if (ins.some(function (x) { return x.accessories > 0; })) txt += ' (accessories dropped)';
      }
      out.push(name(a.date) + ': ' + txt);
    });
    ((plan && plan.merge) || []).forEach(function (m) { var x = by[m.from]; if (x && !x.lifts.length) out.push(x.name + ': left out'); });
    ((plan && plan.move) || []).forEach(function (m) { var x = by[m.dayIdx]; if (x) out.push(x.name + ': next week'); });
    return out.join(' · ');
  }

  /* ---------------------------------------------------------------- applying it (pure: returns a copy) */
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function newId(prefix, opts) { return opts && typeof opts.uid === 'function' ? opts.uid(prefix) : (typeof uid === 'function' ? uid(prefix) : prefix + '_' + Math.random().toString(36).slice(2, 10)); }
  // A set to do, as the coach wrote it: every prescription field (load, reps, RPE, ranges, %, tempo, pauses,
  // bands, the coach's columns: rxOf's fields and the rest), none of the log.
  function copySet(s, opts) {
    var o = {};
    Object.keys(s || {}).forEach(function (k) { if (k !== 'id' && k !== 'srcId' && k !== 'ovr' && LOG_FIELDS.indexOf(k) < 0) o[k] = clone(s[k]); });
    if (typeof rxOf === 'function') Object.assign(o, rxOf(s));
    o.id = newId('set', opts); o.completed = false; o.actualRpe = null; o.completedAt = null;
    return o;
  }
  // proposal: { weekIdx, assign, merge }. Pins each session to its date (one day per date across the block,
  // as Train's pin does), copies a merged session's main lifts into the day it joins (fresh ids, no team
  // link: a team push keeps what the coach adds for one lifter), and marks every set of the day it left
  // skipped, "Busy week". Only that week changes; moved sessions stay where they are, to do next week.
  function busyWeekApply(prog, proposal, opts) {
    var out = clone(prog) || {};
    var p = proposal || {};
    var w = (out.weeks || [])[p.weekIdx];
    if (!w) return out;
    var days = w.days || [];
    var dates = {}; (p.assign || []).forEach(function (a) { if (isIso(d10(a.date))) dates[d10(a.date)] = 1; });
    (out.weeks || []).forEach(function (wk) { (wk.days || []).forEach(function (d) { if (d.scheduledDate && dates[d10(d.scheduledDate)]) d.scheduledDate = null; }); });
    (p.assign || []).forEach(function (a) { var d = days[a.dayIdx]; if (d && isIso(d10(a.date))) d.scheduledDate = d10(a.date); });
    (p.merge || []).forEach(function (m) {
      var from = days[m.from], into = days[m.into];
      if (!from || !into || from === into) return;
      (from.exercises || []).forEach(function (e) {
        if (MAIN.indexOf(e.lift) < 0 || !(e.sets || []).some(setOpen)) return;
        var c = {};
        Object.keys(e).forEach(function (k) { if (k !== 'id' && k !== 'srcId' && k !== 'ovr' && k !== 'sets') c[k] = clone(e[k]); });
        c.id = newId('ex', opts);
        c.sets = (e.sets || []).filter(setOpen).map(function (s) { return copySet(s, opts); });
        into.exercises = (into.exercises || []).concat([c]);
      });
      (from.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { if (setOpen(s)) { s.skipped = true; s.note = BUSY_NOTE; } }); });
      from.scheduledDate = null;
    });
    return out;
  }

  // An approved busy week, as the coach's week counts it: the sessions done before the first agreed day,
  // then the agreed days. expected: what should be done by today (agreed days that have passed).
  // → { planned, expected, agreed: [dates] } | null (not approved, or not this week)
  function weekPlanned(req, logDates, today) {
    var t = d10(today);
    if (!req || req.status !== 'approved' || !isIso(t)) return null;
    var mon = monday(t);
    if (d10(req.weekStart) !== mon) return null;
    var end = addDays(mon, 6);
    var agreed = uniqSorted((((req.proposal || {}).assign) || []).map(function (a) { return d10(a && a.date); }).filter(function (d) { return isIso(d) && d >= mon && d <= end; }));
    if (!agreed.length) agreed = datesOf(mon, req.days);
    var first = agreed[0] || addDays(end, 1);
    var before = uniqSorted((logDates || []).map(d10).filter(function (d) { return isIso(d) && d >= mon && d < first && d <= t; }));
    return { planned: before.length + agreed.length, expected: before.length + agreed.filter(function (d) { return d < t; }).length, agreed: agreed };
  }

  /* ---------------------------------------------------------------- the request's proposal (pure) */
  function clip(t, n) { t = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trim() + '…' : t; }
  // What the request stores (≤ 8 KB): the week, its sessions as they were, where each goes, and why.
  // Day ids ride along so the plan still finds its days if the coach adds one before approving.
  function proposalOf(left, plan) {
    var idOf = {}; (left.sessions || []).forEach(function (x) { idOf[x.dayIdx] = x.dayId || null; });
    return { v: 1, weekIdx: left.weekIdx, weekNumber: left.weekNumber,
      sessions: (left.sessions || []).slice(0, 7).map(function (x) { return { dayIdx: x.dayIdx, dayId: x.dayId || null, name: clip(x.name, 60), lifts: x.lifts.slice(), heavy: !!x.heavy, accessories: x.accessories || 0 }; }),
      assign: plan.assign.map(function (a) { return { dayIdx: a.dayIdx, dayId: idOf[a.dayIdx] || null, date: a.date }; }),
      merge: plan.merge.map(function (m) { return { from: m.from, into: m.into, fromId: idOf[m.from] || null, intoId: idOf[m.into] || null }; }),
      move: plan.move.map(function (m) { return { dayIdx: m.dayIdx, dayId: idOf[m.dayIdx] || null, to: 'next week' }; }),
      why: clip(plan.why, 200) };
  }
  // The plan as it stands now: the request's days from today on, against the sessions still untouched in
  // the program (the lifter may have trained one since asking). Without the program: what they sent.
  // → { plan, sessions, weekIdx, text, stale (it differs from what they were shown) }
  function livePlan(req, prog, today, opts) {
    var t = d10(today), pr = (req && req.proposal) || {};
    var sent = { plan: { assign: pr.assign || [], merge: pr.merge || [], move: pr.move || [], why: pr.why || '' }, sessions: pr.sessions || [], weekIdx: pr.weekIdx };
    var shown = busyWeekText(sent.plan, sent.sessions, opts);
    if (!prog || !isIso(t)) return Object.assign(sent, { text: shown, stale: false });
    var left = sessionsLeft(prog);
    var dates = datesOf(req.weekStart, req.days).filter(function (d) { return d >= t; });
    var plan = busyWeekPlan({ sessionsLeft: left.sessions, dates: dates, today: t });
    var text = busyWeekText(plan, left.sessions, opts);
    return { plan: plan, sessions: left.sessions, weekIdx: left.weekIdx, text: text, stale: text !== shown || left.weekIdx !== pr.weekIdx, left: left };
  }
  // The coach demo's waiting request (app.js _buildCoachDemoData): two of the days left after today and
  // the plan for them. o: { id, athleteId, coachId, today, note, createdAt }
  function demoRequest(prog, o) {
    o = o || {};
    var t = d10(o.today);
    if (!isIso(t)) return null;
    var left = sessionsLeft(prog);
    if (left.sessions.length < 2) return null;
    var after = datesLeft(t).slice(1);
    var dates = after.length >= 4 ? [after[1], after[3]] : after.length >= 2 ? [after[0], after[after.length - 1]] : after.length ? [after[0]] : [t];
    var plan = busyWeekPlan({ sessionsLeft: left.sessions, dates: dates, today: t });
    return { id: o.id || null, athleteId: o.athleteId, coachId: o.coachId || null, weekStart: monday(t), days: dayNames(dates),
      proposal: proposalOf(left, plan), status: 'pending', note: o.note || null, createdAt: o.createdAt || null, decidedAt: null };
  }

  /* ================================================================ the screens (not pure) */
  var CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/><path d="M8.5 13.5h2M13.5 13.5h2M8.5 17h2"/></svg>';
  function esc(v) { return typeof escHtml === 'function' ? escHtml(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function storeOf() { return (typeof Store !== 'undefined' && Store.get) ? Store.get() : {}; }
  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function me() { try { if (typeof user !== 'undefined' && user && user.id) return user; } catch (e) {} return window._user || null; }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function capFirst(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  // The lifter's coach by first name; the demo's "Demo Coach" reads as "your coach" (as the intake does).
  function coachFirst(u) {
    var c = u && u.coachId ? (storeOf().coaches || []).filter(function (x) { return x.id === u.coachId; })[0] : null;
    var f = c ? firstName(c.name) : '';
    return f && !(window._demoMode && /^demo$/i.test(f)) ? f : 'your coach';
  }
  function progOf(aid) { return (storeOf().programs || []).filter(function (p) { return p && p.athleteId === aid; })[0] || null; }
  function requestOf(aid, weekStart) { return (storeOf().scheduleRequests || []).filter(function (r) { return r && r.athleteId === aid && r.weekStart === weekStart; })[0] || null; }
  function keep(req) {
    if (typeof Store === 'undefined') return;
    Store.update(function (s) { s.scheduleRequests = (s.scheduleRequests || []).filter(function (r) { return !(r.athleteId === req.athleteId && r.weekStart === req.weekStart); }).concat([req]); });
  }
  // A day in the device's own words: "Thu", "Thu 29".
  function weekday(iso) { try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }); } catch (e) { return dayShort(iso); } }
  function dayList(dates) { return dates.map(weekday).join(', '); }
  function trainedOn(prog, iso) {
    return ((prog && prog.weeks) || []).some(function (w) { return (w.days || []).some(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).some(function (st) { return st && st.completed && d10(st.completedAt) === iso; }); }); }); });
  }
  function intakeDays(u) { var i = (storeOf().intakes || []).filter(function (x) { return x.athleteId === u.id; })[0]; return i && i.answers && Array.isArray(i.answers.days) ? i.answers.days : []; }
  // The plan as rows: [{ date, title, detail }] and the sessions that wait for next week.
  function planRows(plan, sessions) {
    var by = {}; (sessions || []).map(norm).forEach(function (x) { by[x.dayIdx] = x; });
    var rows = ((plan && plan.assign) || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).map(function (a) {
      var h = by[a.dayIdx] || { name: 'Session', lifts: [] };
      var ins = ((plan.merge || []).filter(function (m) { return m.into === a.dayIdx; })).map(function (m) { return by[m.from]; }).filter(Boolean);
      if (!ins.length) return { date: a.date, title: h.name, detail: '' };
      var extra = [];
      ins.forEach(function (x) { x.lifts.forEach(function (l) { if (h.lifts.indexOf(l) < 0 && extra.indexOf(l) < 0) extra.push(l); }); });
      var title = h.lifts.length ? capFirst(h.lifts.concat(extra).join(' + ')) : h.name + (extra.length ? ' + ' + extra.join(' + ') : '');
      var acc = ins.some(function (x) { return x.accessories > 0; });
      return { date: a.date, title: title, detail: ins.map(function (x) { return x.name; }).join(' and ') + (ins.length > 1 ? ' join it' : ' joins it') + (acc ? ', accessories dropped' : '') };
    });
    var later = ((plan && plan.move) || []).map(function (m) { return by[m.dayIdx]; }).filter(Boolean).map(function (x) { return x.name; });
    return { rows: rows, later: later };
  }

  /* ---------- the lifter: Train's row ---------- */
  function rowEl(title, text, act, onAct, cls) {
    var r = typeof el === 'function' ? el('div', { class: 'today-note tn-row bwk-row' + (cls ? ' ' + cls : '') }) : document.createElement('div');
    r.innerHTML = '<span class="tn-ic" aria-hidden="true">' + CAL + '</span><span class="tn-body"><span class="tn-title">' + esc(title) + '</span><span class="tn-text">' + esc(text) + '</span></span>';
    if (act) {
      var b = el('button', { class: 'btn btn-sm tn-act', type: 'button' }, act);
      b.addEventListener('click', onAct);
      r.appendChild(b);
    }
    return r;
  }
  // The row on Train (today only): an offer when 2 or more sessions are left this week, then the request's state.
  function row() {
    var u = me();
    if (!u) return null;
    var t = todayIso(), mon = monday(t), prog = progOf(u.id), coach = coachFirst(u);
    var req = u.coachId ? requestOf(u.id, mon) : null;
    if (req) {
      var dates = datesOf(mon, req.days);
      if (req.status === 'approved') {
        var pr = req.proposal || {}, text = busyWeekText({ assign: pr.assign || [], merge: pr.merge || [], move: pr.move || [] }, pr.sessions || [], { dayName: weekday });
        return rowEl(capFirst(coach) + ' approved your busy week', text || dayList(dates), null, null, 'is-approved');
      }
      if (req.status === 'declined') return rowEl(capFirst(coach) + ' kept your week as written', 'Message ' + coach + ' if anything changes', 'Message', function () { var tb = document.getElementById('tab-coach'); if (tb) tb.click(); }, 'is-declined');
      return rowEl('Waiting for ' + coach, (req.local ? 'Saved on your phone · ' : '') + (dates.length ? dayList(dates) : 'No days this week'), 'Change', function () { open(); }, 'is-waiting');
    }
    if (!prog) return null;
    var left = sessionsLeft(prog).sessions;
    // Training on their own with every session left already on a day this week (their plan, or pins):
    // the week is set; Change plans it again.
    var sun = addDays(mon, 6);
    if (!u.coachId && left.length && left.every(function (x) { return x.pinned && x.pinned >= t && x.pinned <= sun; })) {
      return rowEl('Your week is set', dayList(uniqSorted(left.map(function (x) { return x.pinned; }))), 'Change', function () { open(); }, 'is-set');
    }
    if (left.length < 2) return null;
    return rowEl('Busy week?', u.coachId ? 'Tell ' + coach + ' which days you can train' : 'Pick the days you can train', 'Pick days', function () { open(); });
  }
  // The session picker's "Or" entry: the same, as a row.
  function pickerRow(close) {
    var u = me();
    if (!u || typeof uiRow !== 'function' || todayIso() !== (typeof getSessionDate === 'function' ? getSessionDate() : todayIso())) return null;
    var mon = monday(todayIso()), req = u.coachId ? requestOf(u.id, mon) : null, prog = progOf(u.id);
    if (req && req.status !== 'pending') return null;
    if (!req && (!prog || sessionsLeft(prog).sessions.length < (u.coachId ? 2 : 1))) return null;
    var coach = coachFirst(u);
    return uiRow({ lead: el('span', { class: 'sp-ic is-date', html: CAL }), title: req ? 'Change your busy week' : 'Busy week?',
      sub: req ? 'Waiting for ' + coach : (u.coachId ? 'Tell ' + coach + ' which days you can train' : 'Pick the days you can train'), chevron: true,
      onClick: function () { if (close) close(); setTimeout(open, 220); } });
  }

  /* ---------- the lifter: the sheet ---------- */
  function open() {
    var u = me();
    if (!u || typeof uiSheet !== 'function') return;
    var t = todayIso(), mon = monday(t), prog = progOf(u.id);
    if (!prog) return;
    var left = sessionsLeft(prog), coached = !!u.coachId, coach = coachFirst(u);
    var existing = coached ? requestOf(u.id, mon) : null;
    if (existing && existing.status !== 'pending') return;
    var dates = datesLeft(t);
    if (trainedOn(prog, t)) dates = dates.slice(1);   // today's session is under way: the plan starts tomorrow
    var picked = {};
    var pinnedNow = left.sessions.map(function (x) { return x.pinned; }).filter(function (d) { return d && dates.indexOf(d) >= 0; });
    (existing ? datesOf(mon, existing.days) : (!coached && pinnedNow.length ? pinnedNow : prepick(dates, intakeDays(u)))).forEach(function (d) { if (dates.indexOf(d) >= 0) picked[d] = 1; });
    uiSheet('Which days can you train?', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'This week · ' + plural(left.sessions.length, 'session') + ' left'));
      var grid = el('div', { class: 'bwk-days', role: 'group', 'aria-label': 'Days you can train this week' });
      dates.forEach(function (d) {
        var b = el('button', { type: 'button', class: 'bwk-day' + (picked[d] ? ' on' : ''), 'aria-pressed': picked[d] ? 'true' : 'false' });
        b.innerHTML = '<span class="bwk-dn">' + esc(d === t ? 'Today' : weekday(d)) + '</span><b>' + Number(d.slice(8, 10)) + '</b>';
        if (d === t) b.setAttribute('aria-label', 'Today, ' + weekday(d));
        b.addEventListener('click', function () {
          picked[d] = !picked[d];
          b.classList.toggle('on', !!picked[d]); b.setAttribute('aria-pressed', picked[d] ? 'true' : 'false');
          try { if (typeof hapticTick === 'function') hapticTick(); } catch (e) {}
          paint(true);
        });
        grid.appendChild(b);
      });
      sheet.appendChild(grid);
      var box = el('div', { class: 'bwk-plan', 'aria-live': 'polite' });
      sheet.appendChild(box);
      var note = null;
      if (coached) {
        note = el('input', { type: 'text', class: 'bwk-note', maxlength: '280', autocomplete: 'off', placeholder: 'Anything ' + coach + ' should know? (optional)', 'aria-label': 'A note for ' + coach });
        note.value = existing && existing.note ? existing.note : '';
        sheet.appendChild(note);
      }
      var go = el('button', { class: 'btn btn-primary btn-lg btn-block bwk-go', type: 'button' }, coached ? 'Send to ' + coach : 'Use this plan');
      sheet.appendChild(go);
      var cur = null;
      function paint(changed) {
        var sel = dates.filter(function (d) { return picked[d]; });
        var plan = busyWeekPlan({ sessionsLeft: left.sessions, dates: sel, today: t });
        cur = { sel: sel, plan: plan };
        var P = planRows(plan, left.sessions);
        var html = '';
        if (!sel.length && !coached) html = '<p class="bwk-empty">Pick the days you can train.</p>';
        else {
          html = '<div class="bwk-pl">' + (sel.length ? 'The plan' : 'No days this week') + '</div><div class="ui-list bwk-rows">' +
            P.rows.map(function (r) { return '<div class="bwk-pr"><span class="bwk-pd">' + esc(weekday(r.date)) + '</span><span class="bwk-pt"><b>' + esc(r.title) + '</b>' + (r.detail ? '<small>' + esc(r.detail) + '</small>' : '') + '</span></div>'; }).join('') +
            P.later.map(function (n) { return '<div class="bwk-pr is-later"><span class="bwk-pd">Next week</span><span class="bwk-pt"><b>' + esc(n) + '</b></span></div>'; }).join('') + '</div>' +
            // Why, only where the rows don't already say it (one a day, spread out).
            (plan.merge.length || plan.move.length ? '' : '<p class="bwk-why">' + esc(plan.why) + '</p>');
        }
        box.innerHTML = html;
        if (changed && box.animate && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) box.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 160, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        go.disabled = !coached && !sel.length;
      }
      paint(false);
      go.addEventListener('click', function () {
        if (!cur || go.disabled) return;
        var sel = cur.sel, plan = cur.plan, days = dayList(sel);
        if (!coached) {
          // Self-coached: the plan is theirs to use now. Pins re-render Train (critical fix #2).
          var next = busyWeekApply(prog, Object.assign({ weekIdx: left.weekIdx }, plan));
          Store.update(function (s) { var p = (s.programs || []).filter(function (x) { return x.id === prog.id; })[0]; if (p) p.weeks = next.weeks; });
          if (typeof persistProgram === 'function') persistProgram(prog.id);
          close();
          if (typeof populateDaySelect === 'function') populateDaySelect();
          if (typeof refreshPinButtons === 'function') refreshPinButtons();
          if (typeof renderToday === 'function') renderToday();
          if (typeof toast === 'function') toast('Your week is set: ' + days);
          return;
        }
        var req = { id: existing && existing.id ? existing.id : null, athleteId: u.id, coachId: u.coachId, weekStart: mon, days: dayNames(sel),
          proposal: proposalOf(left, plan), note: note && note.value.trim() ? note.value.trim().slice(0, 280) : null };
        var done = function (saved, local) {
          keep(saved);
          close();
          if (typeof toast === 'function') toast(local ? 'Saved on your phone. It goes to ' + coach + ' once the app updates.' : 'Sent to ' + coach + '. Train as normal for now.');
          if (typeof renderToday === 'function') renderToday();
        };
        // The demo holds it in memory: nothing leaves the page.
        if (window._demoMode) { done(Object.assign({}, req, { id: req.id || 'demo-busy-mine', status: 'pending', createdAt: new Date().toISOString(), decidedAt: null }), false); return; }
        if (!window.DB || !DB.sendScheduleRequest) return;
        var label = go.textContent;
        go.disabled = true; go.textContent = 'Sending…'; go.setAttribute('aria-busy', 'true');
        var again = function () { go.disabled = false; go.textContent = label; go.removeAttribute('aria-busy'); };
        DB.sendScheduleRequest(req).then(function (res) {
          if (!res || !res.ok) {
            again();
            if (typeof toast === 'function') toast(res && res.decided ? capFirst(coach) + ' has already answered this week.' : 'That didn’t send. Check your connection and try again.');
            return;
          }
          done(res.request, !!res.local);
          if (!res.local && DB.sendPush) {
            var n = left.sessions.length;
            DB.sendPush({ toUserId: u.coachId, title: (firstName(u.name) || 'Your lifter') + ' has a busy week',
              body: sel.length ? plural(sel.length, 'day') + ' instead of ' + n + ': ' + dayNames(sel).join(', ') : 'Can’t train this week: ' + plural(n, 'session') + ' to move',
              url: '/coach.html', tag: 'powa-busy-' + u.id, category: 'messages' }).catch(function () {});
          }
        }).catch(function () { again(); if (typeof toast === 'function') toast('That didn’t send. Check your connection and try again.'); });
      });
    }, { cls: 'bwk-sheet' });
  }

  /* ---------- the coach: the job, Approve, Keep the week ---------- */
  // What Today's job says. → { tier, days, left, line, note, first } | null when it's not this week's, or decided.
  function jobInfo(req, today) {
    var t = d10(today) || todayIso();
    if (!req || req.status !== 'pending' || req.weekStart !== monday(t)) return null;
    var live = livePlan(req, progOf(req.athleteId), t, { dayName: weekday });
    var sel = datesOf(req.weekStart, req.days).filter(function (d) { return d >= t; });
    var left = (live.sessions || []).length || ((req.proposal || {}).sessions || []).length;
    return { tier: sel.length && gap(t, sel[0]) <= 1 ? 0 : 1, days: (req.days || []).length, left: left, line: live.text || 'Can’t train this week', note: req.note || null, live: live, dates: sel };
  }
  function nameOf(aid) { var a = (storeOf().athletes || []).filter(function (x) { return x.id === aid; })[0]; return a ? a.name : 'Your lifter'; }
  function coachMe() { var u = me(); return u ? firstName(u.name) : ''; }
  function decide(req, status) {
    var stamp = new Date().toISOString();
    keep(Object.assign({}, req, { status: status, decidedAt: stamp }));
    if (window._demoMode || !window.DB || !DB.decideScheduleRequest || !req.id || req.local) return Promise.resolve({ ok: true });
    return DB.decideScheduleRequest(req.id, status).then(function (res) {
      if (res && res.ok && res.request) keep(res.request);
      return res;
    }).catch(function (e) { return { ok: false, error: e }; });
  }
  // Approve: the week goes into the program through the coach's own save (persistProgram, compare-and-swap
  // on rev), then the request is approved and the lifter hears about it.
  function approve(req) {
    if (!req) return;
    var t = todayIso(), prog = progOf(req.athleteId), first = firstName(nameOf(req.athleteId));
    var live = livePlan(req, prog, t, { dayName: weekday });
    if (prog && live.weekIdx >= 0 && (live.plan.assign.length || live.plan.merge.length)) {
      var next = busyWeekApply(prog, Object.assign({ weekIdx: live.weekIdx }, live.plan));
      Store.update(function (s) { var p = (s.programs || []).filter(function (x) { return x.id === prog.id; })[0]; if (p) p.weeks = next.weeks; });
      if (!window._demoMode && typeof persistProgram === 'function') persistProgram(prog.id);
    }
    var sel = datesOf(req.weekStart, req.days).filter(function (d) { return d >= t; });
    if (typeof toast === 'function') toast('Approved. ' + first + (sel.length ? ' trains ' + dayList(sel) + '.' : '’s sessions move to next week.'));
    return decide(req, 'approved').then(function (res) {
      if (res && res.ok === false && typeof toast === 'function') toast('The week is in ' + first + '’s program; the approval will show when you’re back online.');
      if (!window._demoMode && window.DB && DB.sendPush) DB.sendPush({ toUserId: req.athleteId, title: (coachMe() || 'Your coach') + ' approved your busy week', body: live.text || 'Your sessions move to next week', url: '/athlete.html', tag: 'powa-busy-' + req.athleteId, category: 'program' }).catch(function () {});
      if (window.CoachLifters && CoachLifters.refresh) CoachLifters.refresh();
    });
  }
  function decline(req) {
    if (!req) return;
    var first = firstName(nameOf(req.athleteId));
    if (typeof toast === 'function') toast('Kept ' + first + '’s week as written.');
    return decide(req, 'declined').then(function () {
      if (!window._demoMode && window.DB && DB.sendPush) DB.sendPush({ toUserId: req.athleteId, title: (coachMe() || 'Your coach') + ' kept your week as written', body: 'Message them if anything changes', url: '/athlete.html', tag: 'powa-busy-' + req.athleteId, category: 'program' }).catch(function () {});
      if (window.CoachLifters && CoachLifters.refresh) CoachLifters.refresh();
    });
  }

  var BusyWeek = { plan: busyWeekPlan, text: busyWeekText, apply: busyWeekApply, sessionsLeft: sessionsLeft, datesLeft: datesLeft, dayNames: dayNames,
    datesOf: datesOf, prepick: prepick, weekPlanned: weekPlanned, dayShort: dayShort, monday: monday, DAYS: DAY_SHORT.slice(), NOTE: BUSY_NOTE,
    proposalOf: proposalOf, livePlan: livePlan, demoRequest: demoRequest, jobInfo: jobInfo, approve: approve, decline: decline, weekday: weekday };
  window.BusyWeekUI = { row: row, open: open, pickerRow: pickerRow };
  window.BusyWeek = BusyWeek;
  window.busyWeekPlan = busyWeekPlan;
  window.busyWeekText = busyWeekText;
  window.busyWeekApply = busyWeekApply;
})();
