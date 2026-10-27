/* coach-lifters.js: the coach's Today and Lifters (2026-10-26, round 2).
   Today (laptop, coach-home.js renderDesk hands over to CoachLifters.renderToday): Do first (the most
   urgent jobs, the first fix in red), This week (four team tiles: training, effort, strength, meets),
   then every other job by kind (answer, check, meet prep, write).
   Lifters (laptop, desk.js deskRenderRoster hands over; ?oldroster=1 keeps the old board, the Calendar
   stays its own mode): everyone in four groups, each row a week ring and the 4-week change, beside one
   lifter's summary (the total, the three lifts, training / effort / bodyweight / meet tiles, their words).
   iPhone (html.native) and phone web: the Lifters tab is the team tiles, Do first and the groups; a lifter
   pushes in (section[data-pane="lifter"]). Wide screens (the iPhone Duo open, iPad, 700 px and up) show
   the list and the lifter side by side.
   Everything comes from the app's own model: desk.js dkRowsFresh() → app.js deskRows / deskReasons /
   deskQueue / coachAthleteStatus; the fixes are Home's (coach-home.js CoachHome.fixFor). */
(function () {
  'use strict';
  var LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var LIFT_CLS = { squat: 'l-sq', bench: 'l-be', deadlift: 'l-dl' };
  var IC = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    msg: '<path d="M20 11.5a7.8 7.8 0 0 1-11.4 6.9L4 20l1.5-4.3A7.8 7.8 0 1 1 20 11.5z"/>',
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.8 2.8 0 0 0 2.8 3.6M16 6h2.5a2.8 2.8 0 0 1-2.8 3.6M12 13v3.5M8.5 20h7M10 16.5h4"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5M12 16.2v.01"/>',
    scale: '<rect x="4" y="5" width="16" height="15" rx="4"/><path d="M8.8 10.2a3.6 3.6 0 0 1 6.4 0"/><path d="m12 10.6 1.4-1.6"/>',
    gauge: '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.4-4.2"/>',
    pulse: '<path d="M3 12h4l2.2-4.5 4 9 2.3-4.5H21"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
    trend: '<path d="m4 16 5-5 4 3 7-7"/><path d="M15 7h5v5"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/><path d="m9 14.6 2 2 4-4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
    flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    open: '<path d="M7 17 17 7M9 7h8v8"/>'
  };
  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || IC.chev) + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function first(n) { return String(n || '').trim().split(' ')[0]; }
  function num(v) { return typeof _num === 'function' ? _num(v) : Math.round(Number(v) * 100) / 100; }
  function kgShow(v) { return typeof kgToDisplay === 'function' ? kgToDisplay(v) : Number(v); }
  function unit() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function wt(v) { return typeof exactW === 'function' ? exactW(v) : String(num(v)); }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function node(tag, attrs, html) { var n = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); }); if (html != null) n.innerHTML = html; return n; }
  function avHtml(a, cls) { var name = (a && a.name) || '?'; var hue = typeof avatarHue === 'function' ? avatarHue(name) : 0; var ini = typeof initials === 'function' ? initials(name) : name.slice(0, 2).toUpperCase(); return '<span class="ui-av av-h' + hue + (cls ? ' ' + cls : '') + '" data-name="' + esc(name) + '" aria-hidden="true">' + (a && a.avatarUrl ? '<img src="' + esc(a.avatarUrl) + '" alt="">' : esc(ini)) + '</span>'; }
  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function addDays(iso, n) { if (typeof _isoAddDays === 'function') return _isoAddDays(iso, n); var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function mondayOf(iso) { if (typeof _isoMonday === 'function') return _isoMonday(iso); var d = new Date(iso + 'T12:00:00Z'); var k = (d.getUTCDay() + 6) % 7; return addDays(iso, -k); }
  function daysBetween(a, b) { return Math.round((Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 86400000); }
  function daysText(d) { if (d <= 0) return 'today'; if (d === 1) return 'tomorrow'; if (d < 21) return 'in ' + d + ' days'; var w = Math.round(d / 7); return 'in ' + w + (w === 1 ? ' week' : ' weeks'); }
  function dateShort(iso) { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return String(iso).slice(0, 10); } }
  function dayMonth(iso) { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return String(iso).slice(5, 10); } }
  function whenText(iso, t) { var d = daysBetween(String(iso).slice(0, 10), t || todayIso()); if (d <= 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 7) return dateShort(iso).split(' ')[0]; return dateShort(iso); }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function clsNum(c) { var v = parseFloat(String(c == null ? '' : c).replace(',', '.')); return v > 0 ? v : null; }
  function clsText(c) { var v = clsNum(c); return v ? String(num(v)) : String(c || ''); }
  function namesList(list, max) { max = max || 3; return list.slice(0, max).join(', ') + (list.length > max ? ' +' + (list.length - max) : ''); }

  /* =====================================================================================
     PURE: the week ring, the jobs and their urgency, the team summary, a lifter's data.
     ===================================================================================== */

  // The week ring: one segment per planned session, the ones trained in the last 7 days filled.
  function clRing(trained, planned) {
    var n = Math.max(0, Math.min(7, Math.round(Number(planned) || 0)));
    if (!n) return null;
    var t = Math.max(0, Math.round(Number(trained) || 0));
    return { n: n, k: Math.min(n, t), trained: t, text: t + ' of ' + n + ' sessions in the last 7 days' };
  }

  var KIND = { message: 'answer', note: 'answer', formcheck: 'answer', pain: 'check', checkin: 'check', readiness: 'check', overshoot: 'check', drift: 'check',
    quiet: 'check', never: 'check', missed: 'check', stalling: 'check', meet: 'meet', weight: 'meet', offpace: 'meet', blockend: 'write', blockdone: 'write', noprogram: 'write' };
  var ORDER = ['meetday', 'pain', 'weight', 'meet', 'overshoot', 'message', 'formcheck', 'drift', 'note', 'checkin', 'readiness', 'offpace',
    'blockdone', 'blockend', 'quiet', 'missed', 'never', 'noprogram', 'stalling', 'write'];
  function waitHours(x) { var m = /(\d+)\s*(h|d)\b/.exec((x && x.text) || ''); if (!m) return 0; return Number(m[1]) * (m[2] === 'd' ? 24 : 1); }
  // How soon: 0 today, 1 this week's health and deadlines, 2 the program and replies, 3 planning and
  // engagement, 4 the long view. Pure over the row: unit-tested.
  function clTier(r, x, today) {
    var d = r.meet ? r.meet.days : null, st = r.status || {};
    switch (x.type) {
      case 'meetday': return 0;
      case 'pain': {
        var p = st.pain, rep = p && p.report;
        var recent = rep && rep.day ? daysBetween(rep.day, today || todayIso()) <= 1 : true;
        if (d != null && d <= 2) return 0;
        if (recent && ((rep && Number(rep.severity) >= 7) || (p && p.count >= 2))) return 0;
        return 1;
      }
      case 'weight': return d != null && d <= 2 ? 0 : d != null && d <= 14 ? 1 : 3;
      case 'meet': return d != null && d <= 1 ? 0 : 2;
      case 'overshoot': return x.tone === 'alert' ? 1 : 2;
      case 'message': return waitHours(x) >= 24 ? 1 : 2;
      case 'checkin': return x.tone === 'warn' ? 1 : 2;
      case 'formcheck': case 'drift': case 'note': case 'readiness': case 'offpace': return 2;
      case 'blockdone': case 'blockend': case 'quiet': case 'missed': case 'never': return 3;
      default: return 4;
    }
  }
  function sev(it) {
    var r = it.r, x = it.reason || {}, st = (r && r.status) || {};
    if (it.type === 'pain') return (r && r.meet && r.meet.days <= 2 ? -100 : 0) - ((st.pain && st.pain.report && Number(st.pain.report.severity)) || 0) - ((st.pain && st.pain.count) || 0);
    if (it.type === 'weight') return -((r && r.bw && r.bw.over) || 0);
    if (it.type === 'message' || it.type === 'note') return -waitHours(x);
    if (it.type === 'quiet') return -(st.ago || 0);
    if (it.type === 'meetday') return -(it.rows ? it.rows.length : 0);
    return 0;
  }
  function jobCmp(a, b) {
    return (a.done ? 1 : 0) - (b.done ? 1 : 0) || a.tier - b.tier || a.order - b.order || sev(a) - sev(b) ||
      String(a.name || '').localeCompare(String(b.name || ''));
  }
  // Every job on the roster, one per lifter per kind (their most urgent reason of that kind), plus one
  // item per meet happening today or tomorrow. opts: { today, done: { athleteId: 1 }, toWrite: [{ r, week }] }.
  // → [{ key, kind: meetday|answer|check|meet|write, type, tier, order, r, rows, reason, meet, done }] most urgent first.
  function clJobs(rows, opts) {
    opts = opts || {};
    var t = opts.today || todayIso(), done = opts.done || {};
    var items = [], md = {};
    (rows || []).forEach(function (r) {
      if (!r.meet || r.meet.days > 1 || r.meet.days < 0) return;
      var m = r.meet.meet || {}, k = String(m.name || 'Meet').trim().toLowerCase() + '|' + String(m.date || '').slice(0, 10);
      (md[k] = md[k] || { key: 'meetday:' + k, kind: 'meetday', type: 'meetday', tier: 0, order: 0, rows: [], meet: m, days: r.meet.days, name: m.name || 'Meet' }).rows.push(r);
    });
    Object.keys(md).forEach(function (k) {
      var g = md[k];
      g.over = g.rows.filter(function (r) { return r.bw && r.bw.over > 0; }).sort(function (a, b) { return b.bw.over - a.bw.over; });
      g.unplanned = g.rows.filter(function (r) { var m = r.meet.meet || {}; return !(m.attempts || m.openers || m.plan); });
      g.done = g.rows.every(function (r) { return !!done[r.athlete.id]; });
      items.push(g);
    });
    (rows || []).forEach(function (r) {
      var best = {};
      (r.reasons || []).forEach(function (x) {
        var kind = KIND[x.type];
        if (!kind) return;
        if ((x.type === 'meet' || x.type === 'weight') && r.meet && r.meet.days <= 1 && r.meet.days >= 0) return;   // the meet-day item has it
        var it = { key: r.athlete.id + ':' + kind, kind: kind, type: x.type, tier: clTier(r, x, t), order: ORDER.indexOf(x.type), r: r, reason: x, name: r.athlete.name, done: !!done[r.athlete.id] };
        if (!best[kind] || jobCmp(it, best[kind]) < 0) best[kind] = it;
      });
      Object.keys(best).forEach(function (k) { items.push(best[k]); });
    });
    (opts.toWrite || []).forEach(function (w) {
      if (!w || !w.r) return;
      var id = w.r.athlete.id;
      if (items.some(function (it) { return it.r && it.r.athlete.id === id && it.kind === 'write'; })) return;
      items.push({ key: id + ':write', kind: 'write', type: 'write', tier: 4, order: ORDER.indexOf('write'), r: w.r, week: w.week, name: w.r.athlete.name, done: !!done[id] });
    });
    return items.sort(jobCmp);
  }
  // The lifter's most urgent open job (their flag), or null.
  function clTopJob(r, jobs) {
    var id = r.athlete.id;
    var mine = (jobs || []).filter(function (it) { return !it.done && (it.r ? it.r.athlete.id === id : (it.rows || []).some(function (x) { return x.athlete.id === id; })); });
    return mine[0] || null;
  }

  // The team at a glance. opts: { today, days(athleteId) → [{ iso, on }] (the last 7 days) }.
  function clTeam(rows, opts) {
    opts = opts || {};
    var t = opts.today || todayIso();
    var daysOf = opts.days || function (id) { return typeof trainingDays === 'function' ? trainingDays(id, 7) : []; };
    rows = rows || [];
    // Training: the last 7 days against each lifter's sessions a week (capped, so an extra session can't hide a miss).
    var dayIso = [], perDay = [], done = 0, planned = 0, behind = [];
    for (var i = 6; i >= 0; i--) { dayIso.push(addDays(t, -i)); perDay.push(0); }
    rows.forEach(function (r) {
      var w = r.status && r.status.week, p = w && w.sessionsPerWeek ? Number(w.sessionsPerWeek) : 0;
      var n = 0;
      (daysOf(r.athlete.id) || []).forEach(function (d) { if (!d || !d.on) return; n++; var j = dayIso.indexOf(d.iso); if (j >= 0) perDay[j]++; });
      if (!p || !(r.status && r.status.program)) return;
      planned += p; done += Math.min(n, p);
      if (n <= p - 2) behind.push({ r: r, n: n, p: p });
    });
    behind.sort(function (a, b) { return (a.n / a.p) - (b.n / b.p) || String(a.r.athlete.name).localeCompare(String(b.r.athlete.name)); });
    // Effort: every logged set with a written and a felt RPE in the last 7 days.
    var since = addDays(t, -6), at = 0, half = 0, over = 0, total = 0, worst = {};
    rows.forEach(function (r) {
      var prog = r.status && r.status.program;
      if (!prog || typeof programLoggedSets !== 'function') return;
      programLoggedSets(prog).forEach(function (x) {
        if (!x.date || x.date < since || x.date > t) return;
        var s = x.set || {};
        if (s.attempt || s.rir || s.actualRpe == null || s.actualRpe === '' || s.rpe == null || s.rpe === '') return;
        var top = s.rpeHi != null && Number(s.rpeHi) > Number(s.rpe) ? Number(s.rpeHi) : Number(s.rpe);
        var d = Number(s.actualRpe) - top;
        if (!isFinite(d)) return;
        total++;
        if (d >= 1) over++; else if (d >= 0.5) half++; else at++;
        if (d >= 0.5) {
          var id = r.athlete.id, title = typeof _exShortTitle === 'function' ? _exShortTitle(x.ex) : '';
          if (!worst[id] || d > worst[id].d) worst[id] = { r: r, d: d, text: '@' + num(s.actualRpe) + ' vs ' + num(top), lift: title };
        }
      });
    });
    var overWho = Object.keys(worst).map(function (k) { return worst[k]; }).sort(function (a, b) { return b.d - a.d; });
    // Strength: total e1RM against 4 weeks ago.
    var deltas = rows.filter(function (r) { return r.total && r.total.delta != null; }).map(function (r) { return { r: r, d: Math.round(kgShow(r.total.delta)) }; });
    var up = deltas.filter(function (x) { return x.d >= 1; }), down = deltas.filter(function (x) { return x.d <= -1; });
    var sorted = deltas.map(function (x) { return x.d; }).sort(function (a, b) { return a - b; });
    var median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)) : null;
    var prs = rows.filter(function (r) { return (r.wins || []).some(function (w) { return w.type === 'pr'; }); });
    // Meets: the next 8 weeks, one entry per meet.
    var span = opts.meetDays || 56, groups = {};
    rows.forEach(function (r) {
      if (!r.meet || r.meet.days < 0 || r.meet.days > span) return;
      var m = r.meet.meet || {}, k = String(m.name || 'Meet').trim().toLowerCase() + '|' + String(m.date || '').slice(0, 10);
      var g = groups[k] || (groups[k] = { name: m.name || 'Meet', date: String(m.date || '').slice(0, 10), days: r.meet.days, rows: [] });
      g.rows.push(r);
    });
    var meets = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.days - b.days; });
    var bwIssues = [];
    meets.forEach(function (g) { g.rows.forEach(function (r) { if (r.bw && r.bw.over > 0) bwIssues.push({ r: r, over: r.bw.over, cls: r.bw.cls, days: g.days, meet: g.name }); }); });
    bwIssues.sort(function (a, b) { return a.days - b.days || b.over - a.over; });
    return {
      training: { done: done, planned: planned, perDay: perDay, days: dayIso, behind: behind },
      effort: { at: at, half: half, over: over, total: total, pct: total ? Math.round(at / total * 100) : null, who: overWho },
      strength: { n: deltas.length, up: up.length, down: down.length, flat: deltas.length - up.length - down.length, deltas: deltas, median: median, prs: prs },
      meets: { list: meets, next: meets[0] || null, lifters: meets.reduce(function (s, g) { return s + g.rows.length; }, 0), bw: bwIssues }
    };
  }

  // Sessions per week for the last n weeks (distinct days logged), oldest first. → [{ mon, done, planned, current }]
  function clWeeks(logs, today, planned, n) {
    n = n || 4;
    var t = today || todayIso(), thisMon = mondayOf(t), out = [];
    var dates = {};
    (logs || []).forEach(function (l) { if (l && l.date) dates[String(l.date).slice(0, 10)] = 1; });
    for (var i = n - 1; i >= 0; i--) {
      var mon = addDays(thisMon, -7 * i), end = addDays(mon, 7), k = 0;
      Object.keys(dates).forEach(function (d) { if (d >= mon && d < end && d <= t) k++; });
      out.push({ mon: mon, done: k, planned: Number(planned) || 0, current: i === 0 });
    }
    return out;
  }
  // Felt minus written for the heaviest set of each lift on each day, the last 3 weeks, oldest first.
  function clEffort(prog, today, n) {
    n = n || 12;
    var t = today || todayIso(), since = addDays(t, -20), best = {};
    if (!prog || typeof programLoggedSets !== 'function') return [];
    programLoggedSets(prog).forEach(function (x) {
      var s = x.set || {};
      if (!x.date || x.date < since || x.date > t || s.attempt || s.rir) return;
      if (s.actualRpe == null || s.actualRpe === '' || s.rpe == null || s.rpe === '') return;
      var top = s.rpeHi != null && Number(s.rpeHi) > Number(s.rpe) ? Number(s.rpeHi) : Number(s.rpe);
      var k = x.date + '|' + ((x.ex && (x.ex.lift || x.ex.exerciseName)) || '');
      var w = Number(s.weight) || 0;
      if (!best[k] || w > best[k].w) best[k] = { date: x.date, w: w, d: Number(s.actualRpe) - top, felt: Number(s.actualRpe), wrote: top, title: typeof _exShortTitle === 'function' ? _exShortTitle(x.ex) : '' };
    });
    return Object.keys(best).map(function (k) { return best[k]; }).filter(function (x) { return isFinite(x.d); })
      .sort(function (a, b) { return a.date.localeCompare(b.date) || a.w - b.w; }).slice(-n);
  }
  // Weigh-ins over the last 6 weeks, oldest first. → [{ date, kg }]
  function clBw(bw, athleteId, today, days) {
    var t = today || todayIso(), since = addDays(t, -(days || 42));
    return (bw || []).filter(function (b) { return b && b.athleteId === athleteId && Number(b.weight) > 0 && String(b.date) >= since && String(b.date) <= t; })
      .map(function (b) { return { date: String(b.date).slice(0, 10), kg: Number(b.weight) }; })
      .sort(function (a, b) { return a.date.localeCompare(b.date); });
  }
  // Lifters whose next week has suggestions from the RPE they logged (a week to write), not already flagged for a block.
  function toWriteOf(rows) {
    if (typeof deskWeekReview !== 'function') return [];
    var out = [];
    (rows || []).forEach(function (r) {
      if ((r.reasons || []).some(function (x) { return /^(blockend|blockdone|noprogram)$/.test(x.type); })) return;
      var prog = r.status && r.status.program;
      if (!prog) return;
      try {
        var rev = deskWeekReview(prog);
        if (rev.nextIdx >= 0 && rev.rows.some(function (x) { return x.suggest && x.suggest.delta; })) out.push({ r: r, week: prog.weeks[rev.nextIdx] ? (prog.weeks[rev.nextIdx].number || rev.nextIdx + 1) : '' });
      } catch (e) {}
    });
    return out;
  }

  /* ---------- the line under a name, the flag on a lifter's page, the job texts ---------- */
  function painBits(st) {
    var p = st && st.pain, rep = p && p.report;
    if (!rep) return null;
    var part = typeof painPartLabel === 'function' ? painPartLabel(rep.bodyPart, rep.side) : String(rep.bodyPart || 'Pain');
    var lift = rep.lift && typeof painLiftLabel === 'function' ? painLiftLabel(rep.lift) : (rep.lift ? String(rep.lift) : '');
    return { part: part, lift: lift, sev: rep.severity != null ? num(rep.severity) : null, count: p.count || 1, day: rep.day || null, phase: rep.phase || null };
  }
  function meetLine(r) {
    var when = r.meet && r.meet.days <= 0 ? 'Meet today' : 'Meet ' + daysText(r.meet ? r.meet.days : 0);
    var name = r.meet && r.meet.meet.name ? String(r.meet.meet.name).trim() : '';
    return name && when.length + name.length <= 24 ? when + ' · ' + name : when;
  }
  // What a job says: { icon, tone, title, detail }. tone: pain | bw | meet | warn | msg | quiet | write.
  function jobText(it) {
    var r = it.r, x = it.reason || {}, st = (r && r.status) || {}, prog = st.program;
    switch (it.type) {
      case 'meetday': {
        var who = it.rows.map(function (q) { return first(q.athlete.name); });
        var mine = it.forId ? it.rows.filter(function (q) { return q.athlete.id === it.forId; })[0] : null;
        if (mine) {
          var own = [];
          if (mine.bw && mine.bw.over > 0) own.push(num(kgShow(mine.bw.over)) + ' ' + unit() + ' over ' + clsText(mine.bw.cls));
          else if (mine.bw) own.push('On weight for ' + clsText(mine.bw.cls));
          var mm = mine.meet.meet || {};
          own.push(mm.attempts || mm.openers || mm.plan ? 'attempts set' : 'attempts not set');
          if (it.rows.length > 1) own.push('with ' + namesList(who.filter(function (n) { return n !== first(mine.athlete.name); }), 2));
          return { icon: 'trophy', tone: 'meet', title: it.name + (it.days <= 0 ? ' is today' : ' is tomorrow'), detail: own.join(' · ') };
        }
        var bits = [namesList(who, 3)];
        if (it.over && it.over.length) bits.push((it.rows.length > 1 ? first(it.over[0].athlete.name) + ' ' : '') + num(kgShow(it.over[0].bw.over)) + ' ' + unit() + ' over ' + clsText(it.over[0].bw.cls));
        if (it.unplanned && it.unplanned.length) bits.push(it.unplanned.length === it.rows.length ? 'attempts not set' : it.unplanned.length + ' without attempts');
        return { icon: 'trophy', tone: 'meet', title: it.name + (it.days <= 0 ? ' is today' : ' is tomorrow'), detail: bits.join(' · ') };
      }
      case 'pain': {
        var pb = painBits(st);
        if (!pb) return { icon: 'alert', tone: 'pain', title: 'Pain on the check-in', detail: r.meet && r.meet.days <= 2 ? meetLine(r) : 'Said yes to pain' };
        return { icon: 'alert', tone: 'pain', title: pb.part + (pb.sev != null ? ' ' + pb.sev + '/10' : '') + (pb.lift ? ' · ' + pb.lift.toLowerCase() : ''),
          detail: (pb.count >= 2 ? (typeof _ordinal === 'function' ? _ordinal(pb.count) : pb.count + 'th') + ' time this week' : 'Reported') + (pb.day ? ' · ' + whenText(pb.day) : '') };
      }
      case 'weight': return { icon: 'scale', tone: 'bw', title: r.bw ? num(kgShow(r.bw.over)) + ' ' + unit() + ' over the ' + clsText(r.bw.cls) + ' class' : (x.text || 'Over the class'),
        detail: r.meet ? (r.meet.meet.name || 'Meet') + ' ' + daysText(r.meet.days) : '' };
      case 'offpace': return { icon: 'scale', tone: 'bw', title: 'Cut off pace', detail: st.cut && st.cut.flag ? st.cut.flag : '' };
      case 'meet': { var m = r.meet ? r.meet.meet : {}; var planned = !!(m.attempts || m.openers || m.plan);
        return { icon: 'trophy', tone: 'meet', title: meetLine(r), detail: (m.name || 'Meet') + (m.weightClass ? ' · ' + clsText(m.weightClass) + ' class' : '') + (planned ? ' · attempts set' : ' · attempts not set') }; }
      case 'overshoot': { var o = /^(.*) @([\d.]+) vs @([\d.]+)$/.exec(x.text || ''); return { icon: 'gauge', tone: 'warn', title: o ? o[1] + ' @' + o[2] + ', you wrote ' + o[3] : (x.text || 'Over what you wrote'), detail: 'Over what you wrote' }; }
      case 'drift': return { icon: 'gauge', tone: 'warn', title: r.drift ? 'RPE +' + r.drift.avg + ' over written' : (x.text || 'RPE drifting up'), detail: r.drift ? 'Across ' + plural(r.drift.n, 'set') + ' this week' : '' };
      case 'message': { var h = waitHours(x); return { icon: 'msg', tone: 'msg', title: 'Wrote you' + (h ? ' · ' + (h >= 24 ? plural(Math.floor(h / 24), 'day') : plural(h, 'hour')) + ' ago' : ''), detail: x.body ? '“' + clip(x.body, 70) + '”' : '' }; }
      case 'note': { var w = clWords(r); var dd = /(\d+)d$/.exec(x.text || ''); return { icon: 'msg', tone: 'msg', title: 'Left a note' + (dd ? ' · ' + plural(Number(dd[1]), 'day') + ' ago' : ''), detail: w && w.kind === 'note' ? '“' + clip(w.text, 70) + '”' : '' }; }
      case 'formcheck': return { icon: 'video', tone: 'msg', title: 'Form check' + (/·\s*(\w+)/.test(x.text || '') ? ' · ' + /·\s*(\w+)/.exec(x.text)[1] : ''), detail: x.detail || 'Video waiting' };
      case 'checkin': return { icon: 'pulse', tone: 'warn', title: x.text || 'Check-in worth a look', detail: 'From their check-in' };
      case 'readiness': return { icon: 'heart', tone: 'warn', title: 'Readiness low', detail: st.readiness && st.readiness.text ? st.readiness.text : (x.detail || '') };
      case 'quiet': return { icon: 'clock', tone: 'quiet', title: st.ago != null ? plural(st.ago, 'day') + ' since a session' : 'Quiet', detail: st.lastDate ? 'Last trained ' + dateShort(st.lastDate) : '' };
      case 'never': return { icon: 'clock', tone: 'quiet', title: 'No sets logged yet', detail: prog ? clip(prog.name, 40) : '' };
      case 'missed': return { icon: 'clock', tone: 'quiet', title: String(x.text || 'Missed a session').replace(/ this week$/, ''), detail: 'This week' };
      case 'noprogram': return { icon: 'pen', tone: 'write', title: 'No block yet', detail: 'Write their first block' };
      case 'blockend': return { icon: 'pen', tone: 'write', title: 'Last week of the block', detail: prog ? clip(prog.name, 40) + ' · nothing after it' : '' };
      case 'blockdone': return { icon: 'pen', tone: 'write', title: 'Block finished', detail: 'Every set logged' };
      case 'stalling': return { icon: 'trend', tone: 'quiet', title: 'Flat for 3 weeks', detail: 'No main lift up' };
      case 'write': return { icon: 'pen', tone: 'write', title: 'Next week to write', detail: it.week ? 'Week ' + it.week + ' has suggestions' : 'Suggestions ready' };
    }
    return { icon: 'eye', tone: 'quiet', title: x.text || 'Worth a look', detail: x.detail || '' };
  }
  // The one line under a name in the list: the lifter's most urgent job, short; on plan, where they are.
  function clLine(r, it) {
    var st = r.status || {}, wk = st.week, se = st.sessions || {};
    if (it) {
      if (it.type === 'meetday') return (it.days <= 0 ? 'Meet today' : 'Meet tomorrow') + (String(it.name).length <= 14 ? ' · ' + it.name : '');
      return jobText(it).title;
    }
    if (r.meet && r.meet.days <= 56) return meetLine(r);
    if (wk && wk.total) return 'Week ' + (wk.idx + 1) + ' of ' + wk.total + (se.planned ? ' · ' + (se.done || 0) + ' of ' + se.planned + ' done' : '');
    return st.program ? clip(st.program.name, 30) : 'No block yet';
  }
  // The number at the end of every row: total e1RM against 4 weeks ago, in the unit shown.
  function clNumber(r) {
    var d = r.total ? r.total.delta : null;
    if (d == null) return { text: '—', tone: 'none', title: 'No trend yet' };
    var v = Math.round(kgShow(d));
    return { text: (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v), tone: v > 0 ? 'up' : v < 0 ? 'down' : 'flat', title: (v > 0 ? '+' : '') + v + ' ' + unit() + ' of total e1RM in four weeks' };
  }
  // Four groups, a lifter in one only. order: { athleteId: rank } from the jobs, most urgent first.
  var NEED = /^(pain|weight|offpace|overshoot|drift|note|message|formcheck|checkin|readiness|quiet|never|missed|stalling)$/;
  var BLOCK = /^(blockend|blockdone|noprogram)$/;
  var GROUPS = [{ key: 'need', title: 'Check on' }, { key: 'block', title: 'Next block due' }, { key: 'meet', title: 'Meet soon' }, { key: 'plan', title: 'On plan' }];
  function clGroupKey(r) {
    var types = (r.reasons || []).map(function (x) { return x.type; });
    if (types.some(function (t) { return NEED.test(t); })) return 'need';
    if (types.indexOf('meet') >= 0) return 'meet';
    if (types.some(function (t) { return BLOCK.test(t); })) return 'block';
    if (r.meet && r.meet.days <= 56) return 'meet';
    return 'plan';
  }
  function clGroups(rows, opts) {
    opts = opts || {};
    var order = opts.order || {};
    var by = { need: [], block: [], meet: [], plan: [] };
    (rows || []).forEach(function (r) { by[clGroupKey(r)].push(r); });
    function cmp(a, b) {
      var ia = order[a.athlete.id], ib = order[b.athlete.id];
      if (ia != null && ib != null && ia !== ib) return ia - ib;
      if (ia != null && ib == null) return -1;
      if (ib != null && ia == null) return 1;
      return String(a.athlete.name).localeCompare(String(b.athlete.name));
    }
    by.meet.sort(function (a, b) { return (a.meet ? a.meet.days : 999) - (b.meet ? b.meet.days : 999) || cmp(a, b); });
    ['need', 'block', 'plan'].forEach(function (k) { by[k].sort(cmp); });
    return GROUPS.map(function (g) { return { key: g.key, title: g.title, rows: by[g.key] }; }).filter(function (g) { return g.rows.length; });
  }
  // Their newest words: a typed message or a session note. { text, when, kind } or null.
  function clWords(r) {
    var s = typeof Store !== 'undefined' ? Store.get() : {}, aid = r.athlete.id;
    var msgs = (s.messages || []).filter(function (m) { return m.athleteId === aid && m.senderId === aid && m.body && !(m.meta && m.meta.type && m.meta.type !== 'text'); })
      .map(function (m) { return { text: m.body, when: String(m.createdAt || '').slice(0, 10), kind: 'message', at: String(m.createdAt || '') }; });
    var notes = (s.sessionNotes || []).filter(function (n) { return n.athleteId === aid && n.note && String(n.note).trim(); })
      .map(function (n) { return { text: n.note, when: String(n.date || '').slice(0, 10), kind: 'note', at: String(n.date || '') }; });
    var all = msgs.concat(notes).sort(function (a, b) { return b.at.localeCompare(a.at); });
    return all[0] || null;
  }

  // Everything a lifter's summary shows, from the store. → { total, lifts, weeks, planned, effort, bw, words, ring }
  function clLifter(r) {
    var a = r.athlete, s = typeof Store !== 'undefined' ? Store.get() : {}, t = todayIso(), st = r.status || {};
    var logs = (s.workoutLogs || []).filter(function (l) { return l.athleteId === a.id; });
    var ok = typeof strengthSeries === 'function';
    var tot = ok ? strengthSeries(logs, 'total', { weeks: 12, today: t }) : [];
    var last = tot[tot.length - 1] || null;
    var past = (s.meets || []).filter(function (m) {
      return m.athleteId === a.id && m.date && String(m.date).slice(0, 10) <= t && !(typeof isPlannedMeet === 'function' && isPlannedMeet(m, t)) &&
        (Number(m.squat) || 0) + (Number(m.bench) || 0) + (Number(m.deadlift) || 0) > 0;
    }).sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });
    var lastMeet = past[0] ? { name: past[0].name || 'Meet', total: (Number(past[0].squat) || 0) + (Number(past[0].bench) || 0) + (Number(past[0].deadlift) || 0), date: String(past[0].date).slice(0, 10) } : null;
    var meetDate = r.meet && r.meet.days > 0 && r.meet.days <= 112 && r.meet.meet.date ? String(r.meet.meet.date).slice(0, 10) : null;
    var proj = meetDate && tot.length && typeof strengthProjection === 'function' ? strengthProjection(tot, meetDate) : null;
    var bestBefore = tot.slice(0, -1).reduce(function (m, p) { return Math.max(m, p.value); }, 0);
    var total = last ? {
      value: last.value, pts: tot, delta: r.total && r.total.delta != null ? r.total.delta : null, best: !!(tot.length > 1 && last.value >= bestBefore - 0.01),
      lastMeet: lastMeet, meetDate: meetDate, meetName: r.meet ? (r.meet.meet.name || 'Meet') : null, proj: proj
    } : null;
    var prLifts = [];
    (r.wins || []).forEach(function (w) { if (w.type === 'pr' && w.lifts) prLifts = prLifts.concat(w.lifts); });
    var lifts = LIFTS.map(function (L) {
      var pts = ok ? strengthSeries(logs, L, { weeks: 8, today: t }) : [];
      var bd = pts.length && typeof strengthBlockDelta === 'function' ? strengthBlockDelta(pts) : null;
      var lp = pts[pts.length - 1] || null;
      var e1 = lp ? lp.value : (typeof bestE1RM === 'function' ? bestE1RM(a.id, L) : 0);
      return { lift: L, e1: e1, pts: pts, delta: bd ? bd.delta : null, top: lp && lp.top ? lp.top : null, pr: prLifts.indexOf(L) >= 0 };
    });
    var w = st.week, planned = w && w.sessionsPerWeek && st.program ? w.sessionsPerWeek : 0;
    var days = typeof trainingDays === 'function' ? trainingDays(a.id, 7) : [];
    return { total: total, lifts: lifts, weeks: clWeeks(logs, t, planned, 4), planned: planned, effort: clEffort(st.program, t, 12), bw: clBw(s.bodyweight, a.id, t, 42),
      words: clWords(r), ring: clRing(days.filter(function (d) { return d.on; }).length, planned) };
  }

  /* =====================================================================================
     CHARTS: drawn at the box's real width (text stays on the scale, dots stay round), redrawn
     when the box resizes. Thin marks, 2 px gaps, surface rings (the dataviz skill's rules).
     ===================================================================================== */
  var VIZ = {}, vizSeq = 0;
  function viz(kind, data, h, cls) {
    var id = 'v' + (++vizSeq);
    VIZ[id] = { kind: kind, data: data, h: h };
    if (vizSeq % 300 === 0 && typeof document !== 'undefined') Object.keys(VIZ).forEach(function (k) { if (!document.querySelector('[data-viz="' + k + '"]')) delete VIZ[k]; });
    return '<div class="cl-viz' + (cls ? ' ' + cls : '') + '" data-viz="' + id + '" style="height:' + h + 'px"></div>';
  }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function barPath(x, y, w, h) {
    if (h <= 0) return '';
    var r = Math.min(4, w / 2, h);
    return 'M' + f1(x) + ' ' + f1(y + h) + 'V' + f1(y + r) + 'Q' + f1(x) + ' ' + f1(y) + ' ' + f1(x + r) + ' ' + f1(y) + 'H' + f1(x + w - r) + 'Q' + f1(x + w) + ' ' + f1(y) + ' ' + f1(x + w) + ' ' + f1(y + r) + 'V' + f1(y + h) + 'Z';
  }
  var DRAW = {
    // A line: { xs, ys, color, area, xEnd, ref: { y, label }, flag: { x }, proj: { x, y, label }, dots, small, pad }
    line: function (d, w, h) {
      var pad = d.pad || { l: 2, r: 2, t: 8, b: 4 };
      var xs = d.xs, ys = d.ys, n = xs.length;
      if (!n) return '';
      var x0 = xs[0], x1 = Math.max(d.xEnd || xs[n - 1], xs[n - 1], d.flag ? d.flag.x : -Infinity, d.proj ? d.proj.x : -Infinity);
      if (x1 === x0) { x0 -= 1; x1 += 1; }
      var all = ys.slice(); if (d.proj) all.push(d.proj.y); if (d.ref) all.push(d.ref.y);
      var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), span = hi - lo || Math.max(1, hi * 0.02);
      lo -= span * 0.18; hi += span * 0.18;
      var X = function (v) { return pad.l + (v - x0) / (x1 - x0) * (w - pad.l - pad.r); };
      var Y = function (v) { return pad.t + (hi - v) / (hi - lo) * (h - pad.t - pad.b); };
      var pts = xs.map(function (x, i) { return [X(x), Y(ys[i])]; });
      var path = typeof _smoothPath === 'function' ? _smoothPath(pts) : pts.map(function (p, i) { return (i ? 'L' : 'M') + f1(p[0]) + ' ' + f1(p[1]); }).join(' ');
      var lp = pts[n - 1];
      var o = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true" style="color:' + (d.color || 'currentColor') + '">';
      if (d.ref) {
        var ry = Y(d.ref.y);
        o += '<line class="cl-ref" x1="' + pad.l + '" x2="' + f1(w - pad.r) + '" y1="' + f1(ry) + '" y2="' + f1(ry) + '"/>';
        if (d.ref.label) o += '<text class="cl-svgt cl-reft" x="' + pad.l + '" y="' + f1(ry + (ry < h / 2 ? 13 : -5)) + '" text-anchor="start">' + esc(d.ref.label) + '</text>';
      }
      if (d.flag) { var fx = f1(X(d.flag.x)); o += '<line class="cl-flagln" x1="' + fx + '" x2="' + fx + '" y1="' + pad.t + '" y2="' + f1(h - pad.b) + '"/>'; }
      if (n >= 2 && d.area) o += '<path class="cl-area" d="' + path + ' L' + f1(lp[0]) + ' ' + f1(h - pad.b) + ' L' + f1(pts[0][0]) + ' ' + f1(h - pad.b) + ' Z"/>';
      if (n >= 2) o += '<path class="cl-ln" d="' + path + '"/>';
      if (d.proj) {
        var px = X(d.proj.x), py = Y(d.proj.y);
        o += '<path class="cl-proj" d="M' + f1(lp[0]) + ' ' + f1(lp[1]) + ' L' + f1(px) + ' ' + f1(py) + '"/><circle class="cl-projpt" cx="' + f1(px) + '" cy="' + f1(py) + '" r="4"/>';
        if (d.proj.label) o += '<text class="cl-svgt" x="' + f1(px - 9) + '" y="' + f1(py - 9) + '" text-anchor="end">' + esc(d.proj.label) + '</text>';
      }
      if (d.dots) pts.forEach(function (p, i) { if (i < n - 1 && d.dots[i]) o += '<circle class="cl-prpt" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="3"/>'; });
      o += '<circle class="cl-endpt" cx="' + f1(lp[0]) + '" cy="' + f1(lp[1]) + '" r="' + (d.small ? 3.5 : 4.5) + '"/>';
      return o + '</svg>';
    },
    // Columns: { vals, track (number or array), labels, hi, short, titles, barW }
    cols: function (d, w, h) {
      var n = d.vals.length, labH = d.labels ? 16 : 0, ch = h - labH - 2, band = w / n, bw = Math.min(d.barW || 22, band * 0.6);
      var tr = function (i) { return Array.isArray(d.track) ? d.track[i] : d.track || 0; };
      var max = Math.max.apply(null, d.vals.concat(d.vals.map(function (v, i) { return tr(i); })).concat([1]));
      var o = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">';
      d.vals.forEach(function (v, i) {
        var x = band * i + (band - bw) / 2, th = tr(i) / max * ch, vh = Math.max(v ? 3 : 0, v / max * ch);
        if (th > 0) o += '<path class="cl-track" d="' + barPath(x, ch - th + 2, bw, th) + '"/>';
        if (vh > 0) o += '<path class="cl-bar' + (i === d.hi ? ' is-hi' : '') + (d.short && d.short[i] ? ' is-short' : '') + '" d="' + barPath(x, ch - vh + 2, bw, vh) + '"><title>' + esc((d.titles && d.titles[i]) || String(v)) + '</title></path>';
        if (d.labels) o += '<text class="cl-svgt cl-axt' + (i === d.hi ? ' is-hi' : '') + '" x="' + f1(band * i + band / 2) + '" y="' + (h - 3) + '" text-anchor="middle">' + esc(d.labels[i]) + '</text>';
      });
      return o + '</svg>';
    },
    // One 100% bar: { id, segs: [{ v, cls, title }] }
    bar100: function (d, w, h) {
      var tot = d.segs.reduce(function (s, x) { return s + x.v; }, 0);
      var bh = Math.min(12, h), y = (h - bh) / 2, cid = 'clc' + d.id;
      var o = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><defs><clipPath id="' + cid + '"><rect x="0" y="' + y + '" width="' + w + '" height="' + bh + '" rx="' + bh / 2 + '"/></clipPath></defs><g clip-path="url(#' + cid + ')">';
      if (!tot) o += '<rect class="cl-track" x="0" y="' + y + '" width="' + w + '" height="' + bh + '"/>';
      var x = 0, segs = d.segs.filter(function (s) { return s.v > 0; });
      segs.forEach(function (s, i) {
        var sw = s.v / tot * w - (i < segs.length - 1 ? 2 : 0);
        if (sw > 0) o += '<rect class="' + s.cls + '" x="' + f1(x) + '" y="' + y + '" width="' + f1(Math.max(1.5, sw)) + '" height="' + bh + '"><title>' + esc(s.title || '') + '</title></rect>';
        x += Math.max(1.5, sw) + 2;
      });
      return o + '</g></svg>';
    },
    // A dot per lifter on a kg axis: { pts: [{ v, title }], median }
    strip: function (d, w, h) {
      var vs = d.pts.map(function (p) { return p.v; }).concat([0]);
      var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
      if (hi - lo < 10) hi = lo + 10;
      var pl = 8, pr = 8, X = function (v) { return pl + (v - lo) / (hi - lo) * (w - pl - pr); }, mid = h / 2;
      var o = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">';
      o += '<line class="cl-axis" x1="' + pl + '" x2="' + f1(w - pr) + '" y1="' + mid + '" y2="' + mid + '"/>';
      o += '<line class="cl-zero" x1="' + f1(X(0)) + '" x2="' + f1(X(0)) + '" y1="' + (mid - 9) + '" y2="' + (mid + 9) + '"/>';
      if (d.median != null) o += '<line class="cl-med" x1="' + f1(X(d.median)) + '" x2="' + f1(X(d.median)) + '" y1="' + (mid - 14) + '" y2="' + (mid + 14) + '"/>';
      var placed = [];
      d.pts.slice().sort(function (a, b) { return a.v - b.v; }).forEach(function (p) {
        var x = X(p.v), lane = 0, guard = 0;
        while (guard++ < 8 && placed.some(function (q) { return q.lane === lane && Math.abs(q.x - x) < 9; })) lane = lane <= 0 ? -lane + 1 : -lane;
        placed.push({ x: x, lane: lane });
        var y = Math.max(5, Math.min(h - 5, mid + lane * 8));
        o += '<circle class="cl-sdot ' + (p.v >= 1 ? 'up' : p.v <= -1 ? 'down' : 'flat') + '" cx="' + f1(x) + '" cy="' + f1(y) + '" r="4"><title>' + esc(p.title) + '</title></circle>';
      });
      return o + '</svg>';
    },
    // Meets over the next weeks: { items: [{ days, n, warn, title }], span }
    timeline: function (d, w, h) {
      var span = d.span || 56, pl = 6, pr = 8, X = function (v) { return pl + Math.min(1, Math.max(0, v / span)) * (w - pl - pr); }, mid = h / 2;
      var o = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">';
      o += '<line class="cl-axis" x1="' + pl + '" x2="' + f1(w - pr) + '" y1="' + mid + '" y2="' + mid + '"/>';
      for (var k = 1; k < span / 7; k++) o += '<line class="cl-tick" x1="' + f1(X(k * 7)) + '" x2="' + f1(X(k * 7)) + '" y1="' + (mid - 3) + '" y2="' + (mid + 3) + '"/>';
      d.items.forEach(function (it) {
        var r = 4 + Math.min(3, (it.n || 1) - 1);
        o += '<circle class="cl-mdot' + (it.warn ? ' is-warn' : '') + '" cx="' + f1(X(it.days)) + '" cy="' + mid + '" r="' + r + '"><title>' + esc(it.title) + '</title></circle>';
      });
      return o + '</svg>';
    },
    // Felt minus written per top set, around a "what you wrote" line with a ±0.5 band: { pts: [{ d, title }] }
    effort: function (d, w, h) {
      var n = d.pts.length, pl = 6, pr = 6, lim = 1.5, Y = function (v) { return h / 2 - Math.max(-lim, Math.min(lim, v)) / lim * (h / 2 - 6); };
      var o = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">';
      o += '<rect class="cl-band" x="' + pl + '" y="' + f1(Y(0.5)) + '" width="' + f1(w - pl - pr) + '" height="' + f1(Y(-0.5) - Y(0.5)) + '" rx="4"/>';
      o += '<line class="cl-axis" x1="' + pl + '" x2="' + f1(w - pr) + '" y1="' + f1(Y(0)) + '" y2="' + f1(Y(0)) + '"/>';
      d.pts.forEach(function (p, i) {
        var x = n === 1 ? w / 2 : pl + 5 + i / (n - 1) * (w - pl - pr - 10);
        o += '<circle class="cl-edot ' + (p.d >= 1 ? 'over' : p.d >= 0.5 ? 'half' : p.d <= -1 ? 'under' : 'on') + '" cx="' + f1(x) + '" cy="' + f1(Y(p.d)) + '" r="4"><title>' + esc(p.title) + '</title></circle>';
      });
      return o + '</svg>';
    }
  };
  function drawViz(el) {
    var v = VIZ[el.getAttribute('data-viz')];
    if (!v) return;
    var w = Math.round(el.clientWidth);
    if (!w) return;
    el._w = w;
    try { el.innerHTML = DRAW[v.kind](v.data, w, v.h); } catch (e) { console.warn('CoachLifters viz', e); }
  }
  function paint(root) {
    if (!root) return;
    var els = root.querySelectorAll('[data-viz]');
    els.forEach(drawViz);
    requestAnimationFrame(function () { root.querySelectorAll('.cl-ring:not(.is-in)').forEach(function (r) { r.classList.add('is-in'); }); });
    if (typeof ResizeObserver !== 'function') return;
    if (root._clRo) root._clRo.disconnect();
    root._clRo = new ResizeObserver(function (entries) {
      entries.forEach(function (e) { var el = e.target, w = Math.round(el.clientWidth); if (w && w !== el._w) drawViz(el); });
    });
    els.forEach(function (el) { root._clRo.observe(el); });
  }
  function ringSvg(R, size) {
    if (!R) return '<span class="cl-ring-none" title="No block running"></span>';
    size = size || 26;
    var sw = size >= 40 ? 4.5 : 3.4, rr = (size - sw) / 2, c = 2 * Math.PI * rr, gap = R.n > 1 ? Math.min(4.2, c / R.n * 0.2) : 0, seg = c / R.n - gap;
    var behind = R.n >= 2 && R.trained <= R.n - 2;
    var o = '<svg class="cl-ring' + (behind ? ' is-behind' : '') + (R.k >= R.n ? ' is-full' : R.k === 0 ? ' is-zero' : '') + '" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" role="img" aria-label="' + esc(R.text) + '"><title>' + esc(R.text) + '</title><g transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')">';
    for (var i = 0; i < R.n; i++) {
      o += '<circle class="cl-seg' + (i < R.k ? ' on' : '') + '" style="--d:' + (i * 70) + 'ms" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + f1(rr) + '" stroke-width="' + sw + '" stroke-dasharray="' + f1(seg) + ' ' + f1(c - seg) + '" stroke-dashoffset="' + f1(-(i * (seg + gap))) + '"/>';
    }
    return o + '</g><text class="cl-ringt" x="50%" y="50%" dy="0.36em" text-anchor="middle">' + Math.min(R.trained, 9) + '</text></svg>';
  }

  /* =====================================================================================
     ACTIONS: Home's fixes, so a fix does the same thing everywhere.
     ===================================================================================== */
  function home() { return window.CoachHome || null; }
  function openMeetDay() {
    if (isDeskNow() && typeof deskGo === 'function') { deskGo('meets'); return; }
    if (window.MeetDay && MeetDay.openMeetsScreen) { MeetDay.openMeetsScreen(); return; }
    if (typeof openMeetsScreen === 'function') openMeetsScreen();
  }
  function fixForJob(it) {
    var h = home();
    if (it.type === 'meetday') return { k: 'open', ic: 'trophy', label: 'Open meet day', run: openMeetDay };
    if (it.type === 'write') { var a = it.r.athlete; return { k: 'open', ic: 'pen', label: 'Write week ' + (it.week || ''), run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(a.id); } }; }
    if (h && h.fixFor) return h.fixFor(it.r, it.reason);
    return { k: 'msg', ic: 'msg', label: 'Message ' + first(it.r.athlete.name), text: '' };
  }
  function fixForLifter(r, top) {
    var a = r.athlete, prog = r.status && r.status.program;
    if (top) return fixForJob(top);
    return { k: 'open', ic: 'pen', label: prog ? 'Open the block' : 'Write a block', run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(a.id); } };
  }
  function altFor(r, fix) {
    var a = r.athlete, prog = r.status && r.status.program;
    if (fix.k === 'msg') return { k: 'open', ic: 'pen', label: prog ? 'Open the block' : 'Write a block', run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(a.id); } };
    return { k: 'msg', ic: 'msg', label: 'Message ' + first(a.name), text: '' };
  }
  function message(r, text) {
    var h = home();
    if (h && h.message) { h.message(r, text || '', refresh); return; }
    if (typeof openAthleteMessages === 'function') openAthleteMessages(r.athlete.id, r.athlete.name, text || '');
  }
  function run(r, f, btn) {
    if (!f) return;
    if (btn && btn.getAttribute('aria-busy') === 'true') return;
    if (f.k === 'msg') { message(r, f.text); return; }
    if (f.k === 'apply') {
      if (btn) btn.setAttribute('aria-busy', 'true');
      try { f.run(); } catch (e) { console.warn('CoachLifters', e); if (typeof toast === 'function') toast('Couldn’t update that week. Open the block to do it by hand.'); }
      setTimeout(refresh, 60);
      return;
    }
    if (f.run) f.run();
  }
  function openAll(id) {
    if (isDeskNow() && typeof openAthletePage === 'function') { openAthletePage(id); return; }
    if (typeof openAthleteSheet === 'function') openAthleteSheet(id);
  }

  /* =====================================================================================
     THE MODEL for a render: rows, the queue, the jobs.
     ===================================================================================== */
  var S = { sel: null, q: '', deskOn: false, keysOn: false, order: [], wideOn: false };
  function rowsNow(reuse) {
    if (reuse && typeof _dk !== 'undefined' && _dk.rows) return { rows: _dk.rows || [], q: _dk.queue };
    if (typeof dkRowsFresh === 'function') { dkRowsFresh(); return { rows: _dk.rows || [], q: _dk.queue }; }
    return { rows: [], q: null };
  }
  function doneMap(q) {
    var m = {};
    if (!q) return m;
    (q.handled || []).concat(q.done || [], q.cleared || []).forEach(function (r) { m[r.athlete.id] = 1; });
    return m;
  }
  function model(opts) {
    var R = rowsNow(opts && opts.reuse), all = R.rows, q = R.q;
    var jobs = clJobs(all, { today: todayIso(), done: doneMap(q), toWrite: toWriteOf(all) });
    var order = {};
    jobs.forEach(function (it, i) {
      if (it.done) return;
      (it.r ? [it.r] : it.rows || []).forEach(function (r) { if (order[r.athlete.id] == null) order[r.athlete.id] = i; });
    });
    var view = isDeskNow() && typeof _dk !== 'undefined' && _dk.view ? _dk.view : null;
    var shown = all;
    if (view && typeof deskViewMatch === 'function') shown = all.filter(function (r) { return deskViewMatch(view, r); });
    if (S.q) { var ql = S.q.toLowerCase(); shown = shown.filter(function (r) { return String(r.athlete.name).toLowerCase().indexOf(ql) >= 0; }); }
    var open = jobs.filter(function (it) { return !it.done; });
    return { rows: all, shown: shown, q: q, view: view, jobs: jobs, open: open, done: jobs.length - open.length, order: order,
      groups: clGroups(shown, { order: order }), need: all.filter(function (r) { return clGroupKey(r) === 'need'; }), live: all.filter(function (r) { return r.live; }) };
  }
  function rowOf(id) { return typeof dkRow === 'function' ? dkRow(id) : null; }

  /* =====================================================================================
     HTML: tiles, jobs, rows, the lifter summary.
     ===================================================================================== */
  function tileHtml(key, icon, label, sub, value, vizHtml, foot, o) {
    return '<div class="cl-tile t-' + key + (o && o.compact ? ' is-compact' : '') + '">' +
      '<div class="cl-th"><span class="cl-tic">' + ic(icon) + '</span><span class="cl-tl">' + esc(label) + '</span>' + (sub ? '<span class="cl-ts">' + esc(sub) + '</span>' : '') + '</div>' +
      '<div class="cl-tv">' + value + '</div>' + (vizHtml || '') + (foot ? '<div class="cl-tf">' + foot + '</div>' : '') + '</div>';
  }
  function nameBtns(list, max, fmt) {
    var out = list.slice(0, max).map(function (x) { return '<button type="button" class="cl-nm" data-open="' + esc(x.r.athlete.id) + '">' + esc(fmt(x)) + '</button>'; });
    return out.join('<span class="cl-sep">, </span>') + (list.length > max ? ' <span class="cl-more-n">+' + (list.length - max) + '</span>' : '');
  }
  function teamTilesHtml(T, o) {
    o = o || {};
    var cx = !!o.compact, tiles = [];
    var tr = T.training;
    var dayLabels = tr.days.map(function (iso) { try { return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' }); } catch (e) { return ''; } });
    tiles.push(tileHtml('training', 'cal', 'Training', cx ? '7 days' : 'Last 7 days',
      tr.planned ? '<b class="cl-big2">' + tr.done + '</b><span class="cl-u">of ' + tr.planned + (cx ? '' : ' sessions') + '</span>' : '<b class="cl-big2">–</b><span class="cl-u">no blocks running</span>',
      viz('cols', { vals: tr.perDay, labels: cx ? null : dayLabels, hi: 6, titles: tr.perDay.map(function (v, i) { return dateShort(tr.days[i]) + ': ' + plural(v, 'session'); }) }, cx ? 28 : 58, 'cl-vz-train'),
      tr.behind.length ? 'Behind: ' + nameBtns(tr.behind, cx ? 1 : 3, function (x) { return first(x.r.athlete.name) + ' ' + x.n + '/' + x.p; }) : (tr.planned ? 'Everyone on track' : ''), o));
    var ef = T.effort;
    tiles.push(tileHtml('effort', 'gauge', 'Effort', cx ? '7 days' : 'Last 7 days',
      ef.total ? '<b class="cl-big2">' + ef.pct + '%</b><span class="cl-u">' + (cx ? 'on RPE' : 'at the RPE you wrote') + '</span>' : '<b class="cl-big2">–</b><span class="cl-u">no RPE yet</span>',
      viz('bar100', { id: 'e' + (vizSeq + 1), segs: [{ v: ef.at, cls: 'cl-s-at', title: plural(ef.at, 'set') + ' at or under' }, { v: ef.half, cls: 'cl-s-half', title: plural(ef.half, 'set') + ' half a point over' }, { v: ef.over, cls: 'cl-s-over', title: plural(ef.over, 'set') + ' a point or more over' }] }, cx ? 14 : 22, 'cl-vz-effort') +
        (cx ? '' : '<div class="cl-key"><span><i class="k-at"></i>At or under</span><span><i class="k-half"></i>+0.5</span><span><i class="k-over"></i>+1 or more</span></div>'),
      ef.who.length ? 'Over: ' + nameBtns(ef.who, cx ? 1 : 2, function (x) { return first(x.r.athlete.name) + (cx ? '' : ' ' + x.text); }) : (ef.total ? 'Nobody over' : ''), o));
    var sg = T.strength;
    tiles.push(tileHtml('strength', 'trend', 'Strength', cx ? '4 weeks' : '4 weeks',
      sg.n ? '<b class="cl-big2">' + sg.up + '</b><span class="cl-u">of ' + sg.n + ' stronger</span>' : '<b class="cl-big2">–</b><span class="cl-u">no trends yet</span>',
      sg.n ? viz('strip', { pts: sg.deltas.map(function (x) { return { v: x.d, title: x.r.athlete.name + ': ' + (x.d > 0 ? '+' : '') + x.d + ' ' + unit() }; }), median: sg.median }, cx ? 26 : 42, 'cl-vz-strength') +
        (cx ? '' : '<div class="cl-key"><span>Typical ' + (sg.median > 0 ? '+' : '') + sg.median + ' ' + esc(unit()) + '</span>' + (sg.down ? '<span>' + sg.down + ' down</span>' : '') + (sg.flat ? '<span>' + sg.flat + ' flat</span>' : '') + '</div>') : '',
      sg.prs.length ? (cx ? 'PRs: ' : 'PRs this week: ') + nameBtns(sg.prs.map(function (r) { return { r: r }; }), cx ? 2 : 3, function (x) { return first(x.r.athlete.name); }) : 'No PRs this week', o));
    var mt = T.meets, nx = mt.next;
    var mv = nx ? '<b class="cl-big2">' + (nx.days <= 0 ? 'Today' : nx.days === 1 ? 'Tomorrow' : nx.days + ' days') + '</b><span class="cl-u">' + esc(clip(nx.name, cx ? 12 : 20)) + '</span>' : '<b class="cl-big2">None</b><span class="cl-u">in 8 weeks</span>';
    var bwi = mt.bw[0];
    tiles.push(tileHtml('meets', 'trophy', 'Meets', cx ? '8 weeks' : 'Next 8 weeks', mv,
      mt.list.length ? viz('timeline', { span: 56, items: mt.list.map(function (g) { return { days: g.days, n: g.rows.length, warn: g.rows.some(function (r) { return r.bw && r.bw.over > 0; }), title: g.name + ' · ' + dayMonth(g.date) + ' · ' + g.rows.map(function (r) { return first(r.athlete.name); }).join(', ') }; }) }, cx ? 22 : 34, 'cl-vz-meets') +
        (cx ? '' : '<div class="cl-key cl-key-tl"><span>Today</span><span>' + plural(mt.lifters, 'lifter') + ' in ' + plural(mt.list.length, 'meet') + '</span><span>8 weeks</span></div>') : '',
      bwi ? '<span class="cl-warn">' + ic('scale') + '<button type="button" class="cl-nm" data-open="' + esc(bwi.r.athlete.id) + '">' + esc(first(bwi.r.athlete.name)) + '</button>&nbsp;' + esc(num(kgShow(bwi.over)) + ' ' + unit() + ' over' + (cx ? '' : ' ' + clsText(bwi.cls) + (bwi.days <= 0 ? ', weigh-in today' : ', ' + daysText(bwi.days)))) + '</span>' : (mt.list.length ? 'Everyone on weight' : ''), o));
    return '<div class="cl-tiles' + (cx ? ' is-compact' : '') + '">' + tiles.join('') + '</div>';
  }
  function jobHtml(it, o) {
    o = o || {};
    var t = jobText(it), fix = fixForJob(it), who = it.r ? [it.r] : (it.rows || []);
    var av = it.type === 'meetday' ? '<span class="cl-stack">' + who.slice(0, 3).map(function (r) { return avHtml(r.athlete); }).join('') + '</span>' : avHtml(it.r.athlete);
    var name = it.type === 'meetday' ? '' : '<b>' + esc(o.short ? first(it.r.athlete.name) : it.r.athlete.name) + '</b> ';
    var openId = it.r ? it.r.athlete.id : (who[0] ? who[0].athlete.id : '');
    var btn = o.icon ? '<button type="button" class="cl-sbtn" data-fix="' + esc(it.key) + '" aria-label="' + esc(fix.label) + '" title="' + esc(fix.label) + '">' + esc(shortLabel(fix)) + '</button>'
      : '<button type="button" class="cl-btn ' + (o.red ? 'red' : 'soft') + '" data-fix="' + esc(it.key) + '">' + esc(fix.label) + '</button>';
    return '<div class="cl-job tone-' + t.tone + (o.big ? ' is-big' : '') + (it.done ? ' is-done' : '') + '" data-job="' + esc(it.key) + '">' +
      (o.big ? '<span class="cl-jic">' + ic(t.icon) + '</span>' : '') +
      '<button type="button" class="cl-jmain" data-open="' + esc(openId) + '">' + (o.big && !o.phone ? av : (o.big ? '' : av)) +
        '<span class="cl-jtx"><span class="cl-jt">' + name + '<span>' + esc(t.title) + '</span></span>' + (t.detail ? '<span class="cl-jd">' + esc(t.detail) + '</span>' : '') + '</span></button>' + btn + '</div>';
  }
  // One word for a fix in a narrow column: what the button does.
  function shortLabel(f) {
    var l = String((f && f.label) || '');
    if (f && f.k === 'apply') return 'Apply';
    if (/^Reply/.test(l)) return 'Reply';
    if (/^Check in/.test(l)) return 'Check in';
    if (/^Message/.test(l)) return 'Message';
    if (/cut plan/i.test(l)) return 'Cut plan';
    if (/attempts/i.test(l)) return 'Attempts';
    if (/meet day/i.test(l)) return 'Meet day';
    if (/^Write/.test(l)) return 'Write';
    if (/video/i.test(l)) return 'Review';
    if (/progress/i.test(l)) return 'Progress';
    if (/next week/i.test(l)) return 'Next week';
    return 'Open';
  }
  var KINDS = [['answer', 'Answer', 'msg'], ['check', 'Check', 'eye'], ['meet', 'Meet prep', 'trophy'], ['write', 'Write', 'pen']];
  function columnsHtml(items, M) {
    return '<div class="cl-cols">' + KINDS.map(function (k) {
      var list = items.filter(function (it) { return it.kind === k[0] || (k[0] === 'meet' && it.kind === 'meetday'); });
      var doneN = M.jobs.filter(function (it) { return it.done && (it.kind === k[0] || (k[0] === 'meet' && it.kind === 'meetday')); }).length;
      var rows = list.map(function (it, i) { return '<div class="cl-cr' + (i >= 5 ? ' is-extra' : '') + '">' + jobHtml(it, { icon: true, short: true }) + '</div>'; }).join('');
      return '<div class="cl-col k-' + k[0] + '"><div class="cl-colh"><span class="cl-tic">' + ic(k[2]) + '</span><b>' + esc(k[1]) + '</b><span class="cl-cn">' + list.length + '</span>' + (doneN ? '<span class="cl-cd">' + ic('check', 2.4) + doneN + ' done</span>' : '') + '</div>' +
        (list.length ? rows + (list.length > 5 ? '<button type="button" class="cl-morebtn" data-more>Show ' + (list.length - 5) + ' more</button>' : '') : '<p class="cl-colnone">' + (k[0] === 'answer' ? 'Nobody waiting on you' : k[0] === 'check' ? 'Nothing to check' : k[0] === 'meet' ? 'No meet prep' : 'Every block is written') + '</p>') + '</div>';
    }).join('') + '</div>';
  }
  function rowHtml(r, o, M) {
    var a = r.athlete, n = clNumber(r), top = M ? clTopJob(r, M.jobs) : null, line = clLine(r, top);
    var days = typeof trainingDays === 'function' ? trainingDays(a.id, 7) : [];
    var w = r.status && r.status.week, R = clRing(days.filter(function (d) { return d.on; }).length, w && w.sessionsPerWeek && r.status.program ? w.sessionsPerWeek : 0);
    // The dot before the line is severity, not category: coral for pain, amber for anything to watch, none for routine.
    var sevOf = function (it) { if (!it) return ''; if (it.type === 'pain') return 'alert'; return /^(meetday|weight|overshoot|drift|checkin|readiness|quiet|never|missed|offpace)$/.test(it.type) ? 'watch' : ''; };
    var tone = sevOf(top);
    return '<button type="button" class="cl-row' + (o.sel === a.id ? ' is-sel' : '') + '" data-id="' + esc(a.id) + '" role="option" aria-selected="' + (o.sel === a.id ? 'true' : 'false') + '" tabindex="' + (o.sel === a.id ? '0' : '-1') + '">' +
      avHtml(a) +
      '<span class="cl-main"><span class="cl-name">' + esc(a.name) + (r.live ? '<i class="cl-live" title="Training right now"></i>' : '') + '</span><span class="cl-line' + (tone ? ' sev-' + tone : '') + '">' + (tone ? '<i class="cl-ldot"></i>' : '') + esc(line) + '</span></span>' +
      '<span class="cl-end">' + ringSvg(R, 26) + '<span class="cl-n t-' + n.tone + '" title="' + esc(n.title) + '"><b>' + esc(n.text) + '</b>' + (n.tone !== 'none' ? '<small>' + esc(unit()) + '</small>' : '') + '</span></span>' +
      (o.phone ? '<span class="cl-chev">' + ic('chev') + '</span>' : '') + '</button>';
  }
  function groupsHtml(M, o) {
    if (!M.groups.length) return '<p class="cl-none">' + (S.q ? 'No one called “' + esc(S.q) + '”' : 'No lifters in this view') + '</p>';
    return M.groups.map(function (g) {
      return '<div class="cl-grp"><h2 class="cl-gh">' + esc(g.title) + ' <span>' + g.rows.length + '</span></h2><div class="cl-list">' + g.rows.map(function (r) { return rowHtml(r, o, M); }).join('') + '</div></div>';
    }).join('');
  }
  // What a row's ring and number mean, once at the top of the list.
  function legendHtml() {
    return '<div class="cl-legend"><span>' + ringSvg({ n: 3, k: 2, trained: 2, text: 'Sessions in the last 7 days, out of the plan' }, 18) + 'Sessions, last 7 days</span><span><b>+kg</b> Strength, 4 weeks</span></div>';
  }
  function subText(M) {
    var n = M.rows.length, open = M.need.length;
    return n + (n === 1 ? ' lifter' : ' lifters') + (open ? ' · <b>' + open + ' to check on</b>' : ' · all on plan') + (M.live.length ? ' · <b class="t-live">' + M.live.length + ' under the bar</b>' : '');
  }

  // A lifter's summary: one big box for overall progress, a tile per lift, then training, effort,
  // bodyweight and the meet, then their words. o: { phone, rise }
  function summaryHtml(r, M, o) {
    o = o || {};
    var a = r.athlete, st = r.status || {}, prog = st.program, D = clLifter(r);
    var top = clTopJob(r, M.jobs), fix = fixForLifter(r, top), alt = altFor(r, fix);
    var rz = function (i) { return o.rise ? ' rise" style="--i:' + i : ''; };
    var cls = r.meet && r.meet.meet.weightClass ? clsText(r.meet.meet.weightClass) : (r.bw ? clsText(r.bw.cls) : null);
    var meta = [prog ? esc(clip(prog.name, 30)) + (st.week && st.week.total ? ' · week ' + (st.week.idx + 1) + ' of ' + st.week.total : '') : 'No block yet'];
    if (cls) meta.push(esc(cls) + ' ' + esc(unit()) + ' class');
    var html = '<header class="cl-ph' + rz(0) + '">' + (o.phone ? '' : avHtml(a, 'lg')) + '<div class="cl-pid"><h2 class="cl-pname">' + esc(a.name) + (r.live ? '<i class="cl-live" title="Training right now"></i>' : '') + '</h2><p class="cl-pmeta">' + meta.join(' · ') + '</p></div>' +
      (o.phone ? '' : '<div class="cl-ptools"><button type="button" class="cl-quiet" data-prog>' + ic('cal') + 'Program</button><button type="button" class="cl-quiet" data-card="notes">' + ic('pen') + 'Notes</button><button type="button" class="cl-quiet" data-go="all">Everything' + ic('chev') + '</button></div>') + '</header>';
    // The flag: what needs doing and the fix (the page's one red). Nothing wrong, no flag.
    if (top) {
      var jt = jobText(top.type === 'meetday' ? Object.assign({}, top, { forId: a.id }) : top);
      html += '<div class="cl-flag tone-' + jt.tone + rz(1) + '"><span class="cl-fic">' + ic(jt.icon) + '</span><span class="cl-ftx"><b>' + esc(jt.title) + '</b>' + (jt.detail ? '<span>' + esc(jt.detail) + '</span>' : '') + '</span>' +
        '<span class="cl-facts">' + (o.phone ? '' : '<button type="button" class="cl-btn quiet" data-act="alt">' + esc(alt.label) + '</button>') + '<button type="button" class="cl-btn red" data-act="fix">' + esc(fix.label) + '</button></span></div>';
    }
    // Nothing logged at all: one clear card instead of a page of dashes.
    var anyLog = D.total || D.lifts.some(function (L) { return L.e1 > 0; }) || D.weeks.some(function (x) { return x.done > 0; }) || D.bw.length;
    if (!anyLog) {
      html += '<div class="cl-empty' + rz(2) + '"><span class="cl-tic">' + ic('cal') + '</span><div><b>Nothing logged yet</b><p>Once ' + esc(first(a.name)) + ' logs a session, their total, the three lifts, training and bodyweight show here.</p></div></div>';
      if (D.words) html += '<div class="cl-words' + rz(3) + '"><span class="cl-wq">“' + esc(clip(D.words.text, 220)) + '”</span><span class="cl-wm">' + esc(whenText(D.words.when)) + ' · <button type="button" class="cl-link" data-reply>Reply</button></span></div>';
      if (o.phone) html += '<button type="button" class="cl-everything' + rz(4) + '" data-go="all"><span class="cl-ev-t">Everything</span><span class="cl-ev-sub">Profile, check-ins, notes</span>' + ic('chev') + '</button>';
      return { html: html, fix: fix, alt: alt };
    }
    // The total: one big box for overall progress.
    var T = D.total;
    if (T) {
      var dTxt = T.delta != null ? Math.round(kgShow(T.delta)) : null;
      var ctx = [];
      if (T.best) ctx.push('Best ever');
      if (T.lastMeet) ctx.push('Last meet ' + Math.round(kgShow(T.lastMeet.total)) + ' ' + unit());
      var xs = T.pts.map(function (p) { return daysBetween(T.pts[0].week, p.week); });
      var flagX = T.meetDate ? daysBetween(T.pts[0].week, T.meetDate) : null;
      var line = { xs: xs, ys: T.pts.map(function (p) { return kgShow(p.value); }), color: 'var(--cl-hero)', area: true, dots: T.pts.map(function (p) { return !!p.pr; }), pad: { l: 4, r: 10, t: 22, b: 6 } };
      if (flagX != null && flagX > xs[xs.length - 1]) {
        line.flag = { x: flagX };
        if (T.proj) line.proj = { x: flagX, y: kgShow(T.proj.value), label: 'about ' + Math.round(kgShow(T.proj.value)) };
      }
      html += '<div class="cl-hero' + rz(2) + '"><div class="cl-hl"><span class="cl-hlab">Total e1RM</span><div class="cl-hnum"><b>' + Math.round(kgShow(T.value)) + '</b><span>' + esc(unit()) + '</span></div>' +
        (dTxt != null ? '<span class="cl-chip ' + (dTxt > 0 ? 'up' : dTxt < 0 ? 'down' : 'flat') + '">' + ic(dTxt >= 0 ? 'trend' : 'down', 2.2) + (dTxt > 0 ? '+' : dTxt < 0 ? '−' : '') + Math.abs(dTxt) + ' ' + esc(unit()) + ' in 4 weeks</span>' : '') +
        (ctx.length ? '<span class="cl-hctx">' + esc(ctx.join(' · ')) + '</span>' : '') + '</div>' +
        '<div class="cl-hc">' + viz('line', line, o.phone ? 120 : 148, 'cl-vz-hero') +
        '<div class="cl-hcap"><span>' + esc(dayMonth(T.pts[0].week)) + '</span>' + (line.flag ? '<span class="cl-hmeet">' + ic('flag') + esc(clip(T.meetName, 22)) + ' · ' + esc(dayMonth(T.meetDate)) + '</span>' : '<span>This week</span>') + '</div></div></div>';
    } else {
      html += '<div class="cl-hero is-empty' + rz(2) + '"><div class="cl-hl"><span class="cl-hlab">Total e1RM</span><div class="cl-hnum"><b>–</b></div><span class="cl-hctx">Shows once squat, bench and deadlift are all logged.</span></div></div>';
    }
    // The lifts.
    html += '<div class="cl-lifts' + rz(3) + '">' + D.lifts.map(function (L) {
      var d = L.delta != null ? Math.round(kgShow(L.delta)) : null;
      var series = L.pts.length >= 2 ? viz('line', { xs: L.pts.map(function (p, i) { return i; }), ys: L.pts.map(function (p) { return kgShow(p.value); }), color: 'var(--lc)', area: true, small: true, pad: { l: 2, r: 5, t: 6, b: 3 } }, o.phone ? 28 : 40, 'cl-vz-lift') : '<div class="cl-vz-lift" style="height:' + (o.phone ? 28 : 40) + 'px"></div>';
      var topTxt = L.top ? wt(L.top.weight) + ' × ' + (L.top.reps || '?') + (L.top.rpe != null && L.top.rpe !== '' ? ' @' + num(L.top.rpe) : '') : '';
      return '<div class="cl-lift ' + LIFT_CLS[L.lift] + '"><div class="cl-lh"><i class="dot"></i><span>' + LIFT[L.lift] + '</span>' + (L.pr ? '<em class="cl-pr-b">PR</em>' : '') + '</div>' +
        '<div class="cl-lv"><b>' + (L.e1 ? Math.round(kgShow(L.e1)) : '–') + '</b>' + (L.e1 && !o.phone ? '<span>' + esc(unit()) + '</span>' : '') + (d != null ? '<em class="cl-ld ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + '</em>' : '') + '</div>' +
        series + '<div class="cl-lf">' + (topTxt ? esc(topTxt) + (L.top && L.top.date && !o.phone ? ' · ' + esc(whenText(L.top.date)) : '') : 'Not logged yet') + '</div></div>';
    }).join('') + '</div>';
    // Training, effort, bodyweight, the meet (only the ones with something to say).
    var small = [];
    var wk = D.weeks, doneN = wk.reduce(function (s, x) { return s + (x.planned ? Math.min(x.done, x.planned) : x.done); }, 0), planN = D.planned ? D.planned * wk.length : 0;
    small.push(tileHtml('training', 'cal', 'Training', '4 weeks',
      planN ? '<b class="cl-big3">' + doneN + '</b><span class="cl-u">of ' + planN + '</span>' : '<b class="cl-big3">' + doneN + '</b><span class="cl-u">sessions</span>',
      viz('cols', { vals: wk.map(function (x) { return x.done; }), track: wk.map(function (x) { return x.planned; }), labels: wk.map(function (x) { return x.current ? 'Now' : dayMonth(x.mon); }), hi: wk.length - 1, short: wk.map(function (x) { return !x.current && x.planned && x.done < x.planned; }), titles: wk.map(function (x) { return 'Week of ' + dayMonth(x.mon) + ': ' + x.done + (x.planned ? ' of ' + x.planned : ''); }), barW: 16 }, o.phone ? 50 : 56),
      D.ring ? D.ring.trained + ' of ' + D.ring.n + ' in the last 7 days' : (prog ? '' : 'No block running'), { compact: true }));
    if (D.effort.length) {
      var lastN = D.effort.slice(-6), avg = lastN.reduce(function (s, x) { return s + x.d; }, 0) / lastN.length, avgR = Math.round(avg * 2) / 2;
      small.push(tileHtml('effort', 'gauge', 'Effort', 'Top sets',
        Math.abs(avgR) < 0.5 ? '<b class="cl-big3">On target</b>' : '<b class="cl-big3">' + (avgR > 0 ? '+' : '') + avgR + '</b><span class="cl-u">RPE</span>',
        viz('effort', { pts: D.effort.map(function (x) { return { d: x.d, title: dateShort(x.date) + ' · ' + (x.title ? x.title + ' ' : '') + '@' + num(x.felt) + ', you wrote ' + num(x.wrote) }; }) }, o.phone ? 50 : 56),
        Math.abs(avgR) < 0.5 ? 'Within half a point of what you wrote' : (avgR > 0 ? 'Heavier than you wrote' : 'Easier than you wrote'), { compact: true }));
    }
    if (D.bw.length) {
      var lastBw = D.bw[D.bw.length - 1], clsKg = r.bw ? r.bw.cls : (r.meet ? clsNum(r.meet.meet.weightClass) : null);
      var bwLine = { xs: D.bw.map(function (b) { return daysBetween(D.bw[0].date, b.date); }), ys: D.bw.map(function (b) { return kgShow(b.kg); }), color: 'var(--cl-bw)', area: false, small: true, pad: { l: 2, r: 4, t: 12, b: 4 } };
      if (clsKg) bwLine.ref = { y: kgShow(clsKg), label: clsText(clsKg) };
      var bwFoot = r.bw && r.meet ? (r.bw.over > 0 ? '<span class="cl-warn">' + num(kgShow(r.bw.over)) + ' ' + esc(unit()) + ' over · ' + esc(daysText(r.meet.days)) + '</span>' : num(kgShow(-r.bw.over)) + ' ' + esc(unit()) + ' under · ' + esc(daysText(r.meet.days)))
        : (D.bw.length > 1 ? (function () { var dd = Math.round((lastBw.kg - D.bw[0].kg) * 10) / 10; return (dd > 0 ? '+' : '') + num(kgShow(dd)) + ' ' + esc(unit()) + ' in ' + plural(Math.max(1, Math.round(daysBetween(D.bw[0].date, lastBw.date) / 7)), 'week'); })() : '');
      small.push(tileHtml('bw', 'scale', 'Bodyweight', '',
        '<b class="cl-big3">' + num(kgShow(lastBw.kg)) + '</b><span class="cl-u">' + esc(unit()) + '</span>',
        viz('line', bwLine, o.phone ? 50 : 56), bwFoot, { compact: true }));
    }
    if (r.meet && r.meet.days <= 112) {
      var m = r.meet.meet, planned = !!(m.attempts || m.openers || m.plan);
      small.push('<div class="cl-tile t-meets is-compact cl-meet"><div class="cl-th"><span class="cl-tic">' + ic('trophy') + '</span><span class="cl-tl">Meet</span><span class="cl-ts">' + esc(dayMonth(m.date)) + '</span></div>' +
        '<div class="cl-tv"><b class="cl-big3">' + (r.meet.days <= 0 ? 'Today' : r.meet.days === 1 ? 'Tomorrow' : r.meet.days + ' days') + '</b></div>' +
        '<div class="cl-mname">' + esc(clip(m.name || 'Meet', 30)) + '</div>' +
        '<button type="button" class="cl-mplan' + (planned ? '' : ' is-warn') + '" data-plan="' + esc(a.id) + '">' + (planned ? ic('check') + 'Attempts set' : ic('alert') + 'Set attempts') + '</button></div>');
    }
    html += '<div class="cl-small n' + small.length + rz(4) + '">' + small.join('') + '</div>';
    // Their words.
    if (D.words) html += '<div class="cl-words' + rz(5) + '"><span class="cl-wq">“' + esc(clip(D.words.text, 220)) + '”</span><span class="cl-wm">' + esc(whenText(D.words.when)) + ' · ' + (D.words.kind === 'note' ? 'session note' : 'message') + ' · <button type="button" class="cl-link" data-reply>Reply</button></span></div>';
    if (o.phone) html += '<button type="button" class="cl-everything' + rz(6) + '" data-go="all"><span class="cl-ev-t">Everything</span><span class="cl-ev-sub">Lifts, check-ins, notes, meets</span>' + ic('chev') + '</button>';
    if (o.phone && top) html += '<div class="cl-alt"><button type="button" class="cl-btn quiet" data-act="alt">' + esc(alt.label) + '</button></div>';
    return { html: html, fix: fix, alt: alt };
  }

  /* =====================================================================================
     TODAY (laptop): Do first, This week, then every other job by kind.
     ===================================================================================== */
  function renderToday(host, opts) {
    var M = model({ reuse: !!(opts && opts.reuse) });
    var firstPaint = !host._clToday;
    host._clToday = true;
    var urgent = M.open.filter(function (it) { return it.tier <= 1; });
    var doFirst = urgent.slice(0, 3);
    var rest = M.open.filter(function (it) { return doFirst.indexOf(it) < 0; });
    var T = clTeam(M.rows, { today: todayIso() });
    var total = M.jobs.length, pct = total ? Math.round(M.done / total * 100) : 0;
    var rz = function (i) { return firstPaint ? ' rise" style="--i:' + i : ''; };
    var date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    var html = '<div class="ch-home cl-root cl-today">' +
      '<header class="cl-thead' + rz(0) + '"><div><h1 class="cl-h1x">Today</h1><p class="cl-sub">' + esc(date) + ' · ' + plural(M.rows.length, 'lifter') + (M.live.length ? ' · <b class="t-live">' + M.live.length + ' under the bar</b>' : '') + '</p></div>' +
        (total ? '<div class="cl-prog"><span><b>' + (total - M.done) + '</b> to do this week' + (M.done ? ' · <b>' + M.done + '</b> done' : '') + '</span>' + (M.done ? '<span class="cl-pbar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' : '') + '</div>' : '') + '</header>';
    html += '<div class="cl-sh' + rz(1) + '"><h2>Do first</h2>' + (urgent.length > 3 ? '<span>' + (urgent.length - 3) + ' more urgent below</span>' : '') + '</div>';
    html += doFirst.length ? '<div class="cl-do' + rz(2) + '">' + doFirst.map(function (it, i) { return jobHtml(it, { big: true, red: i === 0 }); }).join('') + '</div>'
      : '<div class="cl-calm' + rz(2) + '"><span class="cl-tic">' + ic('check') + '</span><span><b>Nothing urgent.</b> ' + (M.open.length ? 'The rest is below, by job.' : 'Everyone is on plan.') + '</span></div>';
    html += '<div class="cl-sh' + rz(3) + '"><h2>This week</h2></div><div class="cl-wrap-t' + rz(4) + '">' + teamTilesHtml(T, {}) + '</div>';
    if (rest.length || M.done) html += '<div class="cl-sh' + rz(5) + '"><h2>Also on your list</h2><span>' + plural(rest.length, 'job') + ', most urgent first</span></div><div class="cl-wrap-c' + rz(6) + '">' + columnsHtml(rest, M) + '</div>';
    html += '</div>';
    host.innerHTML = html;
    host._clM = M;
    if (!host._clWired) { host._clWired = true; wire(host, { today: true }); }
    paint(host);
    host.querySelectorAll('.rise').forEach(function (n) { n.addEventListener('animationend', function () { n.classList.remove('rise'); }, { once: true }); });
    return true;
  }

  /* =====================================================================================
     LIFTERS (laptop): the list beside the lifter.
     ===================================================================================== */
  function renderDesk(area) {
    var M = model();
    var old = area.querySelector('.cl-desk'); if (old) old.remove();
    area.classList.add('cl-on');
    S.deskOn = true;
    if (typeof _dk !== 'undefined' && _dk.rsel && rowOf(_dk.rsel)) S.sel = _dk.rsel;
    var ids = []; M.groups.forEach(function (g) { g.rows.forEach(function (r) { ids.push(r.athlete.id); }); });
    if (!S.sel || ids.indexOf(S.sel) < 0) S.sel = ids[0] || null;
    S.order = ids;
    var wrap = node('div', { class: 'cl-desk cl-root' });
    var chip = M.view && typeof DESK_VIEWS !== 'undefined' ? (function () { var v = DESK_VIEWS.find(function (x) { return x.key === M.view; }); return v ? '<button type="button" class="cl-vchip" data-view-off aria-label="Clear the ' + esc(v.label) + ' view">' + esc(v.label) + ic('x') + '</button>' : ''; })() : '';
    wrap.innerHTML = '<div class="cl-side"><header class="cl-head"><h1 class="cl-h1">Lifters</h1><p class="cl-sub">' + subText(M) + '</p>' +
      '<div class="cl-tools"><label class="cl-search">' + ic('search') + '<input class="cl-q" type="search" placeholder="Find a lifter" aria-label="Find a lifter" autocomplete="off" spellcheck="false" value="' + esc(S.q) + '"><kbd>/</kbd></label>' +
      (typeof dkSetRMode === 'function' && typeof dsPaintCalendar === 'function' ? '<button type="button" class="cl-quiet" data-cal>' + ic('cal') + 'Calendar</button>' : '') + '</div>' + chip + legendHtml() + '</header>' +
      '<div class="cl-groups" role="listbox" aria-label="Lifters">' + groupsHtml(M, { sel: S.sel }) + '</div></div><div class="cl-page" id="clPage"></div>';
    area.appendChild(wrap);
    wrap._clM = M;
    wire(wrap, { desk: true });
    paint(wrap);
    paintPage(wrap, true);
    if (!S.keysOn) { S.keysOn = true; document.addEventListener('keydown', onKey, true); }
  }
  function paintPage(wrap, firstPaint) {
    var host = wrap.querySelector('#clPage'); if (!host) return;
    var r = S.sel ? rowOf(S.sel) : null;
    if (!r) { host.innerHTML = '<p class="cl-none">Pick a lifter</p>'; return; }
    var P = summaryHtml(r, wrap._clM, { rise: !!firstPaint });
    host.innerHTML = '<div class="cl-pg' + (firstPaint ? '' : ' is-swap') + '">' + P.html + '</div>';
    host._P = P; host._r = r;
    host.scrollTop = 0;
    paint(host);
    if (typeof _dk !== 'undefined') { _dk.rsel = r.athlete.id; try { if (typeof dkSyncCtx === 'function') dkSyncCtx(); if (typeof dkPaintCard === 'function') dkPaintCard(); } catch (e) {} }
  }
  function select(id, opts) {
    opts = opts || {};
    var wrap = document.querySelector('#rosterArea .cl-desk, #rosterArea .cl-phone.is-wide'); if (!wrap) return;
    S.sel = id;
    wrap.querySelectorAll('.cl-row').forEach(function (b) {
      var on = b.dataset.id === id;
      b.classList.toggle('is-sel', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      if (on) { b.scrollIntoView({ block: 'nearest' }); if (opts.key) b.focus({ preventScroll: true }); }
    });
    if (wrap.classList.contains('cl-desk')) paintPage(wrap, false); else paintWidePage(wrap);
  }
  function move(step) {
    var ids = S.order || []; if (!ids.length) return;
    var i = ids.indexOf(S.sel), n = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + step));
    select(ids[n], { key: true });
  }
  function typing(t) { return typeof _dkTyping === 'function' ? _dkTyping(t) : !!(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  function onKey(e) {
    if (!S.deskOn || !isDeskNow() || typeof _dk === 'undefined' || _dk.screen !== 'roster') return;
    if (!document.querySelector('#rosterArea .cl-desk') || document.querySelector('[data-pane="athlete"]:not(.hidden)')) return;
    var k = e.key, low = String(k).toLowerCase(), t = e.target;
    if (typing(t)) {
      if (!(t.classList && t.classList.contains('cl-q'))) return;
      if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (t.value) { t.value = ''; S.q = ''; refresh(); } else t.blur(); }
      else if (k === 'Enter' || k === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); t.blur(); if (S.order && S.order.length) select(S.order[0], { key: true }); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (low === 'j' || k === 'ArrowDown') move(1);
    else if (low === 'k' || k === 'ArrowUp') move(-1);
    else if (k === '/') { var q = document.querySelector('#rosterArea .cl-q'); if (!q) return; q.focus(); q.select(); }
    else if (k === 'Enter' && S.sel && (!/^(BUTTON|A|INPUT)$/.test(t.tagName) || (t.classList && t.classList.contains('cl-row')))) openAll(S.sel);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }

  /* =====================================================================================
     PHONE: the Lifters tab; a lifter pushes in. Wide (the Duo open, iPad): side by side.
     ===================================================================================== */
  function isWide() { return !isDeskNow() && (window.innerWidth || 0) >= 700; }
  function renderPhone(area) {
    var M = model();
    if (!M.rows.length) return false;
    var wide = isWide();
    var wrap = node('div', { class: 'cl-phone cl-root' + (wide ? ' is-wide' : '') });
    var urgent = M.open.filter(function (it) { return it.tier <= 1; }).slice(0, 3);
    var list = '<div class="cl-pcol">' + teamTilesHtml(clTeam(M.rows, { today: todayIso() }), { compact: true }) +
      (urgent.length ? '<h2 class="cl-gh cl-gh-do">Do first <span>' + urgent.length + '</span></h2><div class="cl-do is-phone">' + urgent.map(function (it, i) { return jobHtml(it, { big: true, red: i === 0 && !wide, short: true, phone: true }); }).join('') + '</div>' : '') +
      (M.rows.length > 8 ? '<label class="cl-search cl-search-ph">' + ic('search') + '<input class="cl-q" type="search" placeholder="Find a lifter" aria-label="Find a lifter" autocomplete="off" spellcheck="false" value="' + esc(S.q) + '"></label>' : '') +
      '<div class="cl-groups">' + groupsHtml(M, { phone: !wide, sel: wide ? S.sel : null }) + '</div></div>';
    wrap.innerHTML = wide ? list + '<div class="cl-wpage" id="clWidePage"></div>' : list;
    wrap._clM = M;
    wire(wrap, { desk: false, wide: wide });
    area.appendChild(wrap);
    paint(wrap);
    if (wide) {
      var ids = []; M.groups.forEach(function (g) { g.rows.forEach(function (r) { ids.push(r.athlete.id); }); });
      if (!S.sel || ids.indexOf(S.sel) < 0) S.sel = ids[0] || null;
      S.order = ids;
      paintWidePage(wrap);
    }
    if (!S.wideOn) {
      S.wideOn = true;
      var was = wide, tm = null;
      window.addEventListener('resize', function () {
        clearTimeout(tm);
        tm = setTimeout(function () {
          var now = isWide();
          if (now === was || isDeskNow()) { was = now; return; }
          was = now;
          var ra = document.querySelector('[data-pane="athletes"]:not(.hidden)');
          if (ra && typeof renderRoster === 'function') { try { renderRoster(); } catch (e) {} }
        }, 160);
      });
    }
    try { if (!wide && /#lifter=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return true;
  }
  function paintWidePage(wrap) {
    var host = wrap.querySelector('#clWidePage'); if (!host) return;
    var r = S.sel ? rowOf(S.sel) : null;
    if (!r) { host.innerHTML = ''; return; }
    wrap.querySelectorAll('.cl-row').forEach(function (b) { var on = b.dataset.id === S.sel; b.classList.toggle('is-sel', on); b.setAttribute('aria-selected', String(on)); });
    var P = summaryHtml(r, wrap._clM, { phone: true, wide: true });
    host.innerHTML = '<div class="cl-pg cl-pg-phone is-wide">' + P.html + '</div>';
    host._P = P; host._r = r;
    paint(host);
  }
  function open(id) {
    if (!rowOf(id)) { if (typeof dkRowsFresh === 'function') dkRowsFresh(); if (!rowOf(id)) return; }
    S.sel = id;
    if (isDeskNow()) {
      if (document.querySelector('#rosterArea .cl-desk') && typeof _dk !== 'undefined' && _dk.screen === 'roster') select(id);
      else if (typeof deskGo === 'function') { if (typeof _dk !== 'undefined') _dk.rsel = id; deskGo('roster'); }
      return;
    }
    if (isWide() && document.querySelector('#rosterArea .cl-phone.is-wide')) { select(id); return; }
    var tab = document.getElementById('tab-lifter');
    if (!tab) { openAll(id); return; }
    try { if (!/#lifter=/.test(location.hash)) history.pushState({ lifter: id }, '', '#lifter=' + id); else history.replaceState({ lifter: id }, '', '#lifter=' + id); } catch (e) {}
    tab.click();
  }
  function renderPane() {
    var host = document.getElementById('lifterPage'); if (!host) return;
    if (typeof dkRowsFresh === 'function') dkRowsFresh();
    var r = S.sel ? rowOf(S.sel) : null;
    if (!r) { host.innerHTML = ''; var tab = document.getElementById('tab-athletes'); if (tab) tab.click(); return; }
    var M = model();
    var P = summaryHtml(r, M, { phone: true, rise: true });
    host.innerHTML = '<div class="cl-pg cl-root cl-pg-phone">' + P.html + '</div>';
    host._P = P; host._r = r; host._clM = M;
    if (!host._wired) { host._wired = true; wire(host, { desk: false, page: true }); }
    paint(host);
  }

  /* =====================================================================================
     WIRING
     ===================================================================================== */
  function jobByKey(el, key) {
    var n = el;
    while (n && !n._clM) n = n.parentElement;
    var list = n && n._clM ? n._clM.jobs : [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }
  function pageOf(host, t) { return t.closest('#clPage, #clWidePage, #lifterPage') || host; }
  function wire(host, o) {
    host.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-fix]'))) {
        e.preventDefault();
        var it = jobByKey(b, b.getAttribute('data-fix'));
        if (!it) return;
        run(it.r || (it.rows && it.rows[0]), fixForJob(it), b);
        return;
      }
      if ((b = t.closest('[data-more]'))) { e.preventDefault(); var col = b.closest('.cl-col'); if (col) { col.classList.add('is-open'); b.remove(); } return; }
      if ((b = t.closest('.cl-row[data-id]'))) {
        e.preventDefault();
        if (o.desk || o.wide) select(b.dataset.id); else open(b.dataset.id);
        return;
      }
      if ((b = t.closest('[data-open]'))) { e.preventDefault(); var oid = b.getAttribute('data-open'); if (oid) open(oid); return; }
      if ((b = t.closest('[data-act]'))) {
        e.preventDefault();
        var pg = pageOf(host, b), P = pg._P, r = pg._r;
        if (!P || !r) return;
        run(r, b.dataset.act === 'fix' ? P.fix : P.alt, b);
        return;
      }
      if ((b = t.closest('[data-plan]'))) { e.preventDefault(); var pid = b.getAttribute('data-plan'); if (window.MeetDay && MeetDay.planFor) MeetDay.planFor(pid); return; }
      if ((b = t.closest('[data-reply]'))) { e.preventDefault(); var pr = pageOf(host, b)._r; if (pr) message(pr, ''); return; }
      if ((b = t.closest('[data-prog]'))) { e.preventDefault(); var pp = pageOf(host, b)._r; if (pp && typeof openAthleteProgram === 'function') openAthleteProgram(pp.athlete.id); return; }
      if ((b = t.closest('[data-go="all"]'))) { e.preventDefault(); var pa = pageOf(host, b)._r; if (pa) openAll(pa.athlete.id); return; }
      if ((b = t.closest('[data-card]'))) { e.preventDefault(); if (typeof dkOpenCard === 'function') dkOpenCard(b.dataset.card); return; }
      if ((b = t.closest('[data-view-off]'))) { e.preventDefault(); if (typeof deskGo === 'function') deskGo('roster', { view: null }); return; }
      if ((b = t.closest('[data-cal]'))) { e.preventDefault(); if (typeof dkSetRMode === 'function') dkSetRMode('calendar'); return; }
    });
    var q = host.querySelector('.cl-q');
    if (q) {
      var tm = null;
      q.addEventListener('input', function () { S.q = q.value; clearTimeout(tm); tm = setTimeout(function () { repaintList(host, o); }, 60); });
      if (!o.desk) q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; S.q = ''; repaintList(host, o); q.blur(); } });
    }
  }
  function repaintList(host, o) {
    var M = model(), g = host.querySelector('.cl-groups');
    if (!g) return;
    host._clM = M;
    var ids = []; M.groups.forEach(function (gr) { gr.rows.forEach(function (r) { ids.push(r.athlete.id); }); });
    if (o.desk || o.wide) S.order = ids;
    g.innerHTML = groupsHtml(M, o.desk || o.wide ? { sel: S.sel } : { phone: true });
    paint(g);
  }
  function refresh() {
    if (isDeskNow()) {
      var h = home();
      if (typeof _dk !== 'undefined' && _dk.screen === 'today' && h && h.refresh) { h.refresh(); return; }
      var area = document.getElementById('rosterArea');
      if (area && area.querySelector('.cl-desk') && typeof _dk !== 'undefined' && _dk.screen === 'roster') renderDesk(area);
      return;
    }
    var lp = document.querySelector('[data-pane="lifter"]:not(.hidden)');
    if (lp) { renderPane(); return; }
    if (typeof renderRoster === 'function') renderRoster();
  }
  function offDesk() { S.deskOn = false; }

  window.CoachLifters = { model: model, renderToday: renderToday, renderDesk: renderDesk, renderPhone: renderPhone, renderPane: renderPane, open: open, select: select, refresh: refresh, offDesk: offDesk,
    teamTilesHtml: teamTilesHtml, paint: paint,
    clRing: clRing, clTier: clTier, clJobs: clJobs, clTopJob: clTopJob, clTeam: clTeam, clWeeks: clWeeks, clEffort: clEffort, clBw: clBw,
    clGroups: clGroups, clGroupKey: clGroupKey, clLine: clLine, clNumber: clNumber, clWords: clWords, jobText: jobText };
})();
