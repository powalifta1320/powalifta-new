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
    open: '<path d="M7 17 17 7M9 7h8v8"/>',
    blocks: '<path d="M4 20V10M9 20V4M15 20v-7M20 20V8"/>',
    steps: '<path d="M4 19h4.5v-4.5H13V10h4.5V5.5H20"/>',
    play: '<path d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.7-6.2a.8.8 0 0 0 0-1.4L9.2 5.1A.8.8 0 0 0 8 5.8z"/>'
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
  // Dates in the device's own format, like the rest of the app (fmtDateShort): "Sep 7" or "7 Sept".
  function localDate(iso, o) { try { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString(undefined, o); } catch (e) { return ''; } }
  function dateShort(iso) { return localDate(iso, { weekday: 'short', day: 'numeric', month: 'short' }) || String(iso).slice(0, 10); }
  function dayMonth(iso) { return localDate(iso, { day: 'numeric', month: 'short' }) || String(iso).slice(5, 10); }
  function whenText(iso, t) { var d = daysBetween(String(iso).slice(0, 10), t || todayIso()); if (d <= 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 7) return localDate(iso, { weekday: 'short' }) || dateShort(iso); return dateShort(iso); }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  // A voice note's message body is the app's own label ("Voice note · 0:24", voice.js / db.js), not words they wrote.
  function isVoiceBody(b) { return /^Voice note · \d+:\d{2}$/.test(String(b || '').trim()); }
  // A job's second line: their words in quotes; a voice note as itself, after a small play glyph.
  function detailHtml(t) { return (t.voice ? '<i class="cl-vplay" aria-hidden="true">' + ic('play') + '</i>' : '') + esc(t.detail); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  // Phone text that wraps cleanly (escaped text only, never markup): a " · " holds on to the words either
  // side (no line starts or ends on the dot), a number keeps its unit ("0.3 kg", "1 day ago").
  function keepDots(text) { return String(text).replace(/ · /g, ' · ').replace(/(\d) (?=[A-Za-z])/g, '$1 ').replace(/ ago\b/g, ' ago'); }


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

  var KIND = { message: 'answer', note: 'answer', formcheck: 'answer', pain: 'check', checkin: 'check', nocheckin: 'check', readiness: 'check', overshoot: 'check', drift: 'check',
    quiet: 'check', never: 'check', missed: 'check', stalling: 'check', meet: 'meet', weight: 'meet', offpace: 'meet', blockend: 'write', blockdone: 'write', noprogram: 'write' };
  // The order of every list (the owner's call, 29 Oct: pain first, everywhere): a pain comes first, whatever else is
  // going on, a meet today next; after that how soon (clTier) decides and the kind breaks ties, in this order.
  var ORDER = ['pain', 'meetday', 'busy', 'weight', 'meet', 'overshoot', 'message', 'formcheck', 'drift', 'note', 'checkin', 'nocheckin', 'readiness', 'offpace',
    'blockdone', 'blockend', 'quiet', 'missed', 'never', 'noprogram', 'stalling', 'write'];
  function waitHours(x) { var m = /(\d+)\s*(h|d)\b/.exec((x && x.text) || ''); if (!m) return 0; return Number(m[1]) * (m[2] === 'd' ? 24 : 1); }
  // How soon: 0 today, 1 this week's health and deadlines, 2 the program and replies, 3 planning and
  // engagement, 4 the long view. Pure over the row: unit-tested.
  function clTier(r, x, today) {
    var d = r.meet ? r.meet.days : null, st = r.status || {};
    switch (x.type) {
      case 'meetday': return 0;
      case 'busy': return x.tier != null ? x.tier : 1;   // a busy week (busy-week.js): today or tomorrow is the first day they can train → 0
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
      case 'blockdone': case 'blockend': case 'quiet': case 'missed': case 'never': case 'nocheckin': return 3;   // a check-in nudge is engagement: low urgency
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
    return (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.type === 'pain' ? 0 : 1) - (b.type === 'pain' ? 0 : 1) || a.tier - b.tier || a.order - b.order || sev(a) - sev(b) ||
      String(a.name || '').localeCompare(String(b.name || ''));
  }
  // Every job on the roster, one per lifter per kind (their most urgent reason of that kind), plus one
  // item per meet happening today or tomorrow. opts: { today, done: { athleteId: 1 }, toWrite: [{ r, week }] }.
  // → [{ key, kind: meetday|answer|check|meet|write, type, tier, order, r, rows, reason, meet, done }] most urgent first.
  // What the coach's action covers, job by job. done[id] is 'reply' (a message answers and checks in),
  // 'apply' (next week published: it's written, and the RPE that asked for it is settled) or anything
  // else truthy for everything (Done / E). So a reply to Arjun leaves his next week still to write.
  function covers(v, kind) {
    if (!v) return false;
    if (v === 'reply') return kind === 'answer' || kind === 'check';
    if (v === 'apply') return kind === 'write' || kind === 'check';
    return true;
  }
  function clJobs(rows, opts) {
    opts = opts || {};
    var t = opts.today || todayIso(), done = opts.done || {};
    var items = [], md = {};
    (rows || []).forEach(function (r) {
      if (!r.meet || r.meet.days > 1 || r.meet.days < 0) return;
      var m = r.meet.meet || {}, k = String(m.name || 'Meet').trim().toLowerCase() + '|' + String(m.date || '').slice(0, 10);
      (md[k] = md[k] || { key: 'meetday:' + k, kind: 'meetday', type: 'meetday', tier: 0, order: ORDER.indexOf('meetday'), rows: [], meet: m, days: r.meet.days, name: m.name || 'Meet' }).rows.push(r);
    });
    Object.keys(md).forEach(function (k) {
      var g = md[k];
      g.over = g.rows.filter(function (r) { return r.bw && r.bw.over > 0; }).sort(function (a, b) { return b.bw.over - a.bw.over; });
      g.unplanned = g.rows.filter(function (r) { return !meetAttemptsSet(r.meet.meet); });
      g.done = g.rows.every(function (r) { return covers(done[r.athlete.id], 'meetday'); });
      items.push(g);
    });
    (rows || []).forEach(function (r) {
      var best = {};
      (r.reasons || []).forEach(function (x) {
        var kind = KIND[x.type];
        if (!kind) return;
        if ((x.type === 'meet' || x.type === 'weight') && r.meet && r.meet.days <= 1 && r.meet.days >= 0) return;   // the meet-day item has it
        var it = { key: r.athlete.id + ':' + kind, kind: kind, type: x.type, tier: clTier(r, x, t), order: ORDER.indexOf(x.type), r: r, reason: x, name: r.athlete.name, done: covers(done[r.athlete.id], kind) };
        if (!best[kind] || jobCmp(it, best[kind]) < 0) best[kind] = it;
      });
      Object.keys(best).forEach(function (k) { items.push(best[k]); });
    });
    // Busy weeks (busy-week.js): a lifter's days for this week, waiting for the coach's yes. opts.busy: [{ r, info }]
    (opts.busy || []).forEach(function (b) {
      if (!b || !b.r || !b.info) return;
      var id = b.r.athlete.id, x = { type: 'busy', tier: b.info.tier };
      items.push({ key: id + ':busy', kind: 'busy', type: 'busy', tier: clTier(b.r, x, t), order: ORDER.indexOf('busy'), r: b.r, reason: x, info: b.info, name: b.r.athlete.name,
        done: done[id] === 1 || done[id] === true });
    });
    (opts.toWrite || []).forEach(function (w) {
      if (!w || !w.r) return;
      var id = w.r.athlete.id;
      if (items.some(function (it) { return it.r && it.r.athlete.id === id && it.kind === 'write'; })) return;
      items.push({ key: id + ':write', kind: 'write', type: 'write', tier: 4, order: ORDER.indexOf('write'), r: w.r, week: w.week, rule: !!w.rule, name: w.r.athlete.name, done: covers(done[id], 'write') });
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
  // Lifters whose next week has suggestions to take (a week to write), not already flagged for a block. done: the
  // done map (doneMap): a lifter whose next week was published this week ('apply') keeps the job, ticked off,
  // after its suggestions are written in. → [{ r, week, rule }] (rule: a suggestion comes from the coach's rules)
  function toWriteOf(rows, done) {
    if (typeof deskWeekReview !== 'function') return [];
    var out = [];
    (rows || []).forEach(function (r) {
      if ((r.reasons || []).some(function (x) { return /^(blockend|blockdone|noprogram)$/.test(x.type); })) return;
      var prog = r.status && r.status.program;
      if (!prog) return;
      try {
        var rev = deskWeekReview(prog);
        if (rev.nextIdx < 0) return;
        var acts = rev.rows.filter(function (x) { return typeof deskSuggestActionable === 'function' ? deskSuggestActionable(x) : !!(x.suggest && x.suggest.delta); });
        if (acts.length || (done && done[r.athlete.id] === 'apply')) out.push({ r: r, week: prog.weeks[rev.nextIdx] ? (prog.weeks[rev.nextIdx].number || rev.nextIdx + 1) : '', rule: acts.some(function (x) { return !!x.suggest.rule; }) });
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
          own.push(meetAttemptsSet(mm) ? 'attempts set' : 'attempts not set');
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
      case 'meet': { var m = r.meet ? r.meet.meet : {}; var planned = meetAttemptsSet(m);
        return { icon: 'trophy', tone: 'meet', title: meetLine(r), detail: (m.name || 'Meet') + (m.weightClass ? ' · ' + clsText(m.weightClass) + ' class' : '') + (planned ? ' · attempts set' : ' · attempts not set') }; }
      case 'overshoot': { var o = /^(.*) @([\d.]+) vs @([\d.]+)$/.exec(x.text || ''); return { icon: 'gauge', tone: 'warn', title: o ? o[1] + ' @' + o[2] + ', you wrote ' + o[3] : (x.text || 'Over what you wrote'), detail: 'Over what you wrote' }; }
      case 'drift': return { icon: 'gauge', tone: 'warn', title: r.drift ? 'RPE +' + r.drift.avg + ' over written' : (x.text || 'RPE drifting up'), detail: r.drift ? 'Across ' + plural(r.drift.n, 'set') + ' this week' : '' };
      case 'message': { var h = waitHours(x), vn = isVoiceBody(x.body); return { icon: 'msg', tone: 'msg', title: 'Wrote you' + (h ? ' · ' + (h >= 24 ? plural(Math.floor(h / 24), 'day') : plural(h, 'hour')) + ' ago' : ''), detail: x.body ? (vn ? String(x.body).trim() : '“' + clip(x.body, 70) + '”') : '', voice: vn }; }
      case 'note': { var w = clWords(r); var dd = /(\d+)d$/.exec(x.text || ''); return { icon: 'msg', tone: 'msg', title: 'Left a note' + (dd ? ' · ' + plural(Number(dd[1]), 'day') + ' ago' : ''), detail: w && w.kind === 'note' ? '“' + clip(w.text, 70) + '”' : '' }; }
      case 'formcheck': return { icon: 'video', tone: 'msg', title: 'Form check' + (/·\s*(\w+)/.test(x.text || '') ? ' · ' + /·\s*(\w+)/.exec(x.text)[1] : ''), detail: x.detail || 'Video waiting' };
      case 'checkin': return { icon: 'pulse', tone: 'warn', title: x.text || 'Check-in worth a look', detail: 'From their check-in' };
      case 'nocheckin': return { icon: 'cal', tone: 'quiet', title: x.text || 'No check-in lately', detail: x.detail || '' };
      case 'readiness': return { icon: 'heart', tone: 'warn', title: 'Readiness low', detail: st.readiness && st.readiness.text ? st.readiness.text : (x.detail || '') };
      case 'quiet': return { icon: 'clock', tone: 'quiet', title: st.ago != null ? plural(st.ago, 'day') + ' since a session' : 'Quiet', detail: st.lastDate ? 'Last trained ' + dateShort(st.lastDate) : '' };
      case 'never': return { icon: 'clock', tone: 'quiet', title: 'No sets logged yet', detail: prog ? clip(prog.name, 40) : '' };
      case 'missed': return { icon: 'clock', tone: 'quiet', title: String(x.text || 'Missed a session').replace(/ this week$/, ''), detail: 'This week' };
      case 'noprogram': {
        // Their intake (intake.js) is what the first block is written from: say when it came in.
        var ik = (Store.get().intakes || []).find(function (i) { return i.athleteId === r.athlete.id && i.submittedAt; });
        return { icon: 'pen', tone: 'write', title: 'No block yet', detail: ik ? 'Intake in ' + whenText(String(ik.submittedAt).slice(0, 10)) + ' · write their first block' : 'Write their first block' };
      }
      case 'blockend': return { icon: 'pen', tone: 'write', title: 'Last week of the block', detail: prog ? clip(prog.name, 40) + ' · nothing after it' : '' };
      case 'blockdone': return { icon: 'pen', tone: 'write', title: 'Block finished', detail: 'Every set logged' };
      case 'stalling': return { icon: 'trend', tone: 'quiet', title: 'Flat for 3 weeks', detail: 'No main lift up' };
      case 'write': return { icon: 'pen', tone: 'write', title: 'Next week to write' + (it.rule ? ' (your rule)' : ''), detail: (it.week ? 'Week ' + it.week + ' has suggestions' : 'Suggestions ready') + (it.rule ? ' (your rule)' : '') };
      case 'busy': {
        var bi = it.info || {}, nd = Number(bi.days) || 0;
        // short: the phone's rows and a list line; tiny: the laptop's narrow job columns.
        return { icon: 'cal', tone: 'write', title: 'Busy week · ' + (nd ? 'can train ' + plural(nd, 'day') : 'can\u2019t train this week') + ' (' + (bi.left || 0) + ' left)', detail: bi.line || '', note: bi.note || null,
          short: 'Busy week · ' + (nd ? plural(nd, 'day') : 'no days') + ' (' + (bi.left || 0) + ' left)', tiny: 'Busy week · ' + (nd ? plural(nd, 'day') : 'no days') };
      }
    }
    return { icon: 'eye', tone: 'quiet', title: x.text || 'Worth a look', detail: x.detail || '' };
  }
  // The one line under a name in the list: the lifter's most urgent job, short; on plan, where they are.
  function clLine(r, it) {
    var st = r.status || {}, wk = st.week, se = st.sessions || {};
    if (it) {
      if (it.type === 'meetday') return (it.days <= 0 ? 'Meet today' : 'Meet tomorrow') + (String(it.name).length <= 14 ? ' · ' + it.name : '');
      var jt0 = jobText(it);
      return jt0.short || jt0.title;
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
  var NEED = (typeof DESK_CHECK_RE !== 'undefined' && DESK_CHECK_RE) || /^(pain|weight|offpace|overshoot|drift|note|message|formcheck|checkin|nocheckin|readiness|quiet|never|missed|stalling)$/;
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

  /* ---------- the desk, v3 (2 Nov): Lifters' tabs, a view's line, the team's lanes and season, the business line ----------
     Pure over the rows (app.js deskRows, as dkAugment leaves them) and the data passed in: unit-tested in tests.html. */
  // Lifters' tabs, in order. A tab is a saved view (app.js DESK_VIEWS) with an address, #roster?view=<key>; All is no view.
  // New this month and Wins (the rail's other views) show as one more tab, with an ×, while one is chosen.
  var TABS = [{ key: 'check', label: 'Check on' }, { key: 'meet', label: 'Meet soon' }, { key: 'pain', label: 'Pain' }, { key: 'quiet', label: 'Quiet' }, { key: null, label: 'All' }];
  var EXTRA_TABS = { 'new': 'New this month', wins: 'Wins' };
  var QUIETISH = /^(quiet|never|missed)$/;
  function quietView(r) { var st = r.status || {}; return st.ago == null ? !!st.program : st.ago >= 7; }
  function viewMatch(key, r, now) {
    if (!key) return true;
    if (key === 'check') return clGroupKey(r) === 'need';   // the Check on group, exactly
    if (typeof deskViewMatch === 'function') return deskViewMatch(key, r, now);
    if (key === 'meet') return !!r.meet && r.meet.days <= 56;
    if (key === 'pain') return (r.reasons || []).some(function (x) { return x.type === 'pain'; });
    if (key === 'quiet') return quietView(r);
    if (key === 'wins') return (r.wins || []).length > 0;
    return false;
  }
  // The Meet view's number at the end of a row: the countdown. → { text, unit, tone: 'meet', title }
  function clMeetNumber(r) {
    var d = r.meet ? r.meet.days : null;
    if (d == null) return { text: '—', unit: '', tone: 'none', title: 'No meet planned' };
    return { text: d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : String(d), unit: d > 1 ? 'days' : '', tone: 'meet', title: (r.meet.meet.name || 'Meet') + ' ' + daysText(d) };
  }
  // Each tab's count, from the same rows the list draws. → { check, meet, pain, quiet, new, wins, all }
  function clTabCounts(rows, now) {
    var out = { all: (rows || []).length };
    ['check', 'meet', 'pain', 'quiet', 'new', 'wins'].forEach(function (k) { out[k] = (rows || []).filter(function (r) { return viewMatch(k, r, now); }).length; });
    return out;
  }
  function timesWord(n) { return n === 2 ? 'twice' : n + ' times'; }
  // The line under a name inside a view: the view's question, answered for this lifter, most important first (a row is
  // one line, so what the row can't hold is the least of it; the whole line is the row's tooltip). null: the usual line.
  //   meet  "1.4 kg over · no openers · State Championships": only what's wrong (over the class; no attempts inside 3 weeks,
  //         Home's rule), then the meet; on weight with time to go, just "Autumn Classic". The countdown is the row's number
  //         in this view (clMeetNumber), so the line keeps its room for the problems.
  //   pain  "Low back 6/10 · twice this week · deadlift"
  //   quiet "Last trained 9 days ago"
  function clViewLine(r, view) {
    var st = r.status || {};
    if (view === 'meet' && r.meet) {
      var m = r.meet.meet || {}, bits = [];
      if (r.bw && r.bw.over > 0) bits.push(num(kgShow(r.bw.over)) + ' ' + unit() + ' over');
      if (r.meet.days <= 21 && !(typeof meetAttemptsSet === 'function' && meetAttemptsSet(m))) bits.push('no openers');
      if (m.name) bits.push(clip(String(m.name).trim(), 40));
      return bits.join(' · ') || 'Meet';
    }
    if (view === 'pain') {
      var pb = painBits(st);
      if (pb) return pb.part + (pb.sev != null ? ' ' + pb.sev + '/10' : '') + (pb.count >= 2 ? ' · ' + timesWord(pb.count) + ' this week' : '') + (pb.lift ? ' · ' + pb.lift.toLowerCase() : '');
      if ((r.reasons || []).some(function (x) { return x.type === 'pain'; })) return 'Said yes to pain on the check-in';
      return null;
    }
    if (view === 'quiet') {
      if (st.ago == null) return st.program ? 'No sets logged yet' : null;
      return st.ago <= 0 ? 'Trained today' : 'Last trained ' + plural(st.ago, 'day') + ' ago';
    }
    if (view === 'wins' && (r.wins || []).length) return r.wins.map(function (w) { return w.text; }).join(' · ');
    return null;
  }
  // The team at a glance, every lifter in exactly one lane, worst first: Need you (anything the coach decides on, a block
  // to write included), Quiet (nothing but going quiet, 7 days or more), Meet in 8 weeks (on plan for a meet), On plan.
  // A lane opens Lifters on the tab that holds its faces (Need you → Check on, the rest by name; On plan → All).
  var LANES = [{ key: 'need', title: 'Need you', tab: 'check' }, { key: 'meet', title: 'Meet in 8 weeks', tab: 'meet' }, { key: 'plan', title: 'On plan', tab: null }, { key: 'quiet', title: 'Quiet', tab: 'quiet' }];
  function clLaneKey(r) {
    var g = clGroupKey(r);
    if (g === 'need') {
      var hard = (r.reasons || []).some(function (x) { return NEED.test(x.type) && !QUIETISH.test(x.type); });
      return !hard && quietView(r) ? 'quiet' : 'need';
    }
    if (g === 'block') return 'need';
    return g;   // meet | plan
  }
  // → [{ key, title, tab, rows }] in LANES order; inside a lane the jobs' order (opts.order, pain first), the meet date
  // for meets, the longest quiet first, then the name.
  function clLanes(rows, opts) {
    opts = opts || {};
    var order = opts.order || {}, by = { need: [], meet: [], plan: [], quiet: [] };
    (rows || []).forEach(function (r) { by[clLaneKey(r)].push(r); });
    var name = function (a, b) { return String(a.athlete.name).localeCompare(String(b.athlete.name)); };
    var rank = function (a, b) { var ia = order[a.athlete.id], ib = order[b.athlete.id]; return (ia == null ? 1e6 : ia) - (ib == null ? 1e6 : ib); };
    by.need.sort(function (a, b) { return rank(a, b) || name(a, b); });
    by.meet.sort(function (a, b) { return (a.meet ? a.meet.days : 999) - (b.meet ? b.meet.days : 999) || name(a, b); });
    by.quiet.sort(function (a, b) { var x = a.status.ago == null ? 1e4 : a.status.ago, y = b.status.ago == null ? 1e4 : b.status.ago; return y - x || name(a, b); });
    by.plan.sort(name);
    return LANES.map(function (l) { return { key: l.key, title: l.title, tab: l.tab, rows: by[l.key] }; });
  }
  // A face's ring: its lane, pain in coral. → 'pain' | 'need' | 'meet' | 'quiet' | ''
  function clRingOf(r) {
    var k = clLaneKey(r);
    if (k === 'need') return (r.reasons || []).some(function (x) { return x.type === 'pain'; }) ? 'pain' : 'need';
    return k === 'plan' ? '' : k;
  }
  // Where everyone is in their block, on one shared window of weeks (opts.back before this week, opts.weeks in all), from
  // app.js calendarRows (a block's dates) and calendarBarMeet (the meet it counts down to). Soonest meet first, then the
  // rest by name. opts: { today, programs, meets, blocks, back: 4, weeks: 16 }
  // → { from, weeks, now (0..1 across the window), lines: [{ r, id, name, bar: { x0, x1, from, weeks, cur, name } | null,
  //     week: 'Week 2 of 4' | 'Starts in 2 weeks' | 'Block done' | 'No block', meet: { x, days, name, date, wn } | null }] }
  function clSeason(rows, opts) {
    opts = opts || {};
    var t = opts.today || todayIso(), back = opts.back == null ? 4 : opts.back, W = opts.weeks || 16;
    var from = addDays(mondayOf(t), -7 * back), span = W * 7;
    var xOf = function (iso) { return (daysBetween(from, iso) + 0.5) / span; };
    var cal = typeof calendarRows === 'function' ? calendarRows({ athletes: (rows || []).map(function (r) { return r.athlete; }), programs: opts.programs || [], meets: opts.meets || [],
      blocks: opts.blocks || [], today: t, from: from, weeks: W }) : [];
    var byId = {};
    cal.forEach(function (c) { byId[c.athleteId] = c; });
    var lines = (rows || []).map(function (r) {
      var c = byId[r.athlete.id] || { bars: [], meets: [] };
      var progs = c.bars.filter(function (b) { return b.kind === 'program'; });
      var bar = progs.filter(function (b) { return b.current != null; })[0] || progs.filter(function (b) { return b.from > back; }).sort(function (a, b) { return a.from - b.from; })[0] ||
        progs.slice().sort(function (a, b) { return (b.from + b.weeks) - (a.from + a.weeks); })[0] || null;
      var B = bar ? { x0: Math.max(0, bar.from / W), x1: Math.min(1, (bar.from + bar.weeks) / W), from: bar.from, weeks: bar.weeks, cur: bar.current, name: bar.name } : null;
      var week = !bar ? 'No block' : bar.current != null ? 'Week ' + (bar.current + 1) + ' of ' + bar.weeks
        : bar.from > back ? 'Starts ' + (bar.from - back === 1 ? 'next week' : 'in ' + (bar.from - back) + ' weeks') : 'Block done';
      var M = null, nm = r.meet && r.meet.days >= 0 ? r.meet : null;
      if (nm && nm.meet && nm.meet.date) {
        var d = String(nm.meet.date).slice(0, 10), cm = c.meets.filter(function (x) { return x.date === d; })[0];
        var bm = bar && typeof calendarBarMeet === 'function' ? calendarBarMeet(bar, c.meets, back) : null;
        M = { x: xOf(d), days: nm.days, name: String(nm.meet.name || 'Meet').trim() || 'Meet', date: d, wn: bm && bm.date === d ? bm.label : (cm ? 'W-' + Math.max(0, cm.week - back) : null) };
      }
      return { r: r, id: r.athlete.id, name: r.athlete.name, bar: B, week: week, meet: M };
    });
    lines.sort(function (a, b) {
      var x = a.meet ? a.meet.days : Infinity, y = b.meet ? b.meet.days : Infinity;
      return (x === y ? 0 : x < y ? -1 : 1) || String(a.name).localeCompare(String(b.name));
    });
    return { from: from, weeks: W, back: back, now: xOf(t), lines: lines };
  }
  // The business, one quiet line: what the packages bring in a month, who is overdue, who wants to train with you, the
  // plan's seats. A part with nothing to say is left out (no packages yet: no money). o: { summary (clients.js
  // clientsSummary), money (cents, currency → text), apps (applications waiting), joins (join requests), seats: { used, limit } }
  // → [{ key: 'money' | 'overdue' | 'apps' | 'seats', text }]
  function clBusiness(o) {
    o = o || {};
    var out = [], sm = o.summary, money = o.money || function (c) { return '$' + Math.round(c / 100); };
    if (sm && sm.mrr > 0) out.push({ key: 'money', text: money(Math.round(sm.mrr / 100) * 100, sm.currency) + ' a month' });
    if (sm && sm.overdue && sm.overdue.n > 0) out.push({ key: 'overdue', text: sm.overdue.n + ' overdue' });
    var apps = Number(o.apps) || 0, joins = Number(o.joins) || 0;
    if (apps + joins) out.push({ key: 'apps', text: !joins ? plural(apps, 'application') + ' waiting' : !apps ? plural(joins, 'join request') : (apps + joins) + ' new lifters waiting' });
    if (o.seats && o.seats.limit > 0) out.push({ key: 'seats', text: o.seats.used + ' of ' + o.seats.limit + ' seats' });
    return out;
  }

  // Everything a lifter's summary shows, from the store. → { total, lifts, weeks, planned, effort, bw, words, ring }
  function clLifter(r) {
    var a = r.athlete, s = typeof Store !== 'undefined' ? Store.get() : {}, t = todayIso(), st = r.status || {};
    // app.js rosterLogsFor: this lifter's sets from the per-lifter index (the same rows in the same order), not a
    // filter over every lifter's sets each time a lifter is drawn.
    var logs = typeof rosterLogsFor === 'function' ? rosterLogsFor(a.id) : (s.workoutLogs || []).filter(function (l) { return l.athleteId === a.id; });
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
    if (typeof ResizeObserver !== 'function') return;
    if (root._clRo) root._clRo.disconnect();
    root._clRo = new ResizeObserver(function (entries) {
      entries.forEach(function (e) { var el = e.target, w = Math.round(el.clientWidth); if (w && w !== el._w) drawViz(el); });
    });
    els.forEach(function (el) { root._clRo.observe(el); });
  }
  // The week as pips: one per planned session, the ones trained in the last 7 days filled. It reads as a
  // count without a number, sits quiet when they're on plan, and its gaps turn amber two or more behind.
  function pipsHtml(R) {
    if (!R) return '<span class="cl-pips is-none" role="img" aria-label="No block running" title="No block running"></span>';
    var behind = R.n >= 2 && R.trained <= R.n - 2, o = '';
    for (var i = 0; i < R.n; i++) o += '<i' + (i < R.k ? ' class="on"' : '') + '></i>';
    return '<span class="cl-pips' + (behind ? ' is-behind' : '') + '" role="img" aria-label="' + esc(R.text) + '" title="' + esc(R.text) + '">' + o + '</span>';
  }


  /* =====================================================================================
     ACTIONS: Home's fixes, so a fix does the same thing everywhere.
     ===================================================================================== */
  function home() { return window.CoachHome || null; }
  function openMeetDay() {
    if (isDeskNow() && typeof deskGo === 'function') { deskGo('meets'); return; }
    // The phone: today's board straight away when there is one (one tap from Home's red), else the Meets screen.
    if (window.MeetDay && MeetDay.openTodayBoard) { MeetDay.openTodayBoard(); return; }
    if (window.MeetDay && MeetDay.openMeetsScreen) { MeetDay.openMeetsScreen(); return; }
    if (typeof openMeetsScreen === 'function') openMeetsScreen();
  }
  function fixForJob(it) {
    var h = home();
    if (it.type === 'meetday') return { k: 'open', ic: 'trophy', label: 'Open meet day', run: openMeetDay };
    if (it.type === 'write') { var a = it.r.athlete; return { k: 'open', ic: 'pen', label: 'Write week ' + (it.week || ''), run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(a.id); } }; }
    // A busy week: Approve puts the plan in their program (busy-week.js BusyWeek.approve).
    if (it.type === 'busy') { var rq = it.info && it.info.req; return { k: 'apply', ic: 'check', label: 'Approve', run: function () { if (window.BusyWeek && rq) BusyWeek.approve(rq); } }; }
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
  // Per lifter: 1 when the coach marked them done this week, else how they acted ('reply' / 'apply').
  function doneMap(q) {
    var m = {};
    if (!q) return m;
    var st = {}; try { if (typeof dkState === 'function') st = dkState() || {}; } catch (e) {}
    var hm = st.handled || {}, rv = st.reviewed || {};
    (q.done || []).forEach(function (r) { m[r.athlete.id] = 1; });
    (q.handled || []).concat(q.cleared || []).forEach(function (r) {
      var id = r.athlete.id;
      if (!m[id]) m[id] = rv[id] ? 1 : ((hm[id] && hm[id].via) || 1);
    });
    return m;
  }
  // Busy weeks waiting this week (busy-week.js), one per lifter on the roster. → [{ r, info }]
  function busyOf(rows) {
    if (!window.BusyWeek || !BusyWeek.jobInfo || typeof Store === 'undefined') return [];
    var t = todayIso(), by = {};
    (rows || []).forEach(function (r) { by[r.athlete.id] = r; });
    var out = [];
    (Store.get().scheduleRequests || []).forEach(function (req) {
      var r = req && by[req.athleteId];
      if (!r) return;
      var info = null;
      try { info = BusyWeek.jobInfo(req, t); } catch (e) { info = null; }
      if (info) out.push({ r: r, info: Object.assign({ req: req }, info) });
    });
    return out;
  }
  function model(opts) {
    var R = rowsNow(opts && opts.reuse), all = R.rows, q = R.q;
    var dm = doneMap(q);
    var jobs = clJobs(all, { today: todayIso(), done: dm, toWrite: toWriteOf(all, dm), busy: busyOf(all) });
    var order = {};
    jobs.forEach(function (it, i) {
      if (it.done) return;
      (it.r ? [it.r] : it.rows || []).forEach(function (r) { if (order[r.athlete.id] == null) order[r.athlete.id] = i; });
    });
    var view = isDeskNow() && typeof _dk !== 'undefined' && _dk.view ? _dk.view : null;
    var now = Date.now();
    var inView = view ? all.filter(function (r) { return viewMatch(view, r, now); }) : all;
    var shown = inView;
    if (S.q) { var ql = S.q.toLowerCase(); shown = shown.filter(function (r) { return String(r.athlete.name).toLowerCase().indexOf(ql) >= 0; }); }
    var open = jobs.filter(function (it) { return !it.done; });
    // All keeps its four groups; a tab (the desk's views) is one list in its own order.
    var groups = view ? (shown.length ? [{ key: view, title: null, rows: shown.slice().sort(viewSort(view, order)) }] : []) : clGroups(shown, { order: order });
    return { rows: all, shown: shown, inView: inView, q: q, view: view, jobs: jobs, open: open, done: jobs.length - open.length, order: order,
      groups: groups, need: all.filter(function (r) { return clGroupKey(r) === 'need'; }), live: all.filter(function (r) { return r.live; }),
      counts: clTabCounts(all, now) };
  }
  // A tab's order: the soonest meet (Meet soon), the longest quiet (Quiet), the newest (New this month); everything else
  // the jobs' order (pain first, then how soon), then the name.
  function viewSort(view, order) {
    order = order || {};
    var name = function (a, b) { return String(a.athlete.name).localeCompare(String(b.athlete.name)); };
    var rank = function (a, b) { var ia = order[a.athlete.id], ib = order[b.athlete.id]; return (ia == null ? 1e6 : ia) - (ib == null ? 1e6 : ib); };
    if (view === 'meet') return function (a, b) { return (a.meet ? a.meet.days : 999) - (b.meet ? b.meet.days : 999) || rank(a, b) || name(a, b); };
    if (view === 'quiet') return function (a, b) { var x = a.status.ago == null ? 1e4 : a.status.ago, y = b.status.ago == null ? 1e4 : b.status.ago; return y - x || name(a, b); };
    if (view === 'new') return function (a, b) { return (Number(b.athlete.createdAt) || 0) - (Number(a.athlete.createdAt) || 0) || name(a, b); };
    return function (a, b) { return rank(a, b) || name(a, b); };
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
  // A thin bar for a share on the phone's tiles, read without a legend: the number above says what it
  // is. segs: [{ f: 0..1, cls }] left to right with 2 px gaps; the rest is the track. Neutral ink by
  // default, amber only for the part that is wrong (heavier than written, weaker than 4 weeks ago).
  function meterHtml(segs, label) {
    var o = '', used = 0;
    segs.forEach(function (s) {
      var f = Math.max(0, Math.min(1 - used, Number(s.f) || 0));
      if (f <= 0.0005) return;
      used += f;
      o += '<i' + (s.cls ? ' class="' + s.cls + '"' : '') + ' style="flex-grow:' + f.toFixed(4) + '"></i>';
    });
    if (used < 0.9995) o += '<i class="is-rest" style="flex-grow:' + (1 - used).toFixed(4) + '"></i>';
    return '<span class="cl-meter" role="img" aria-label="' + esc(label || '') + '">' + o + '</span>';
  }
  function teamTilesHtml(T, o) {
    o = o || {};
    var cx = !!o.compact, tiles = [];
    var tr = T.training;
    var dayLabels = tr.days.map(function (iso) { return localDate(iso, { weekday: 'narrow' }); });
    // The phone's tiles (compact) carry a plain number and, where it is a share, one thin bar of the
    // same share: the laptop's per-day columns, strip and timeline need a legend a phone tile has no
    // room for (phone polish, 27 Oct: "each tile must read without a legend").
    tiles.push(tileHtml('training', 'cal', 'Training', cx ? '7 days' : 'Last 7 days',
      tr.planned ? '<b class="cl-big2">' + tr.done + '</b><span class="cl-u">of ' + tr.planned + (cx ? ' done' : ' sessions') + '</span>' : '<b class="cl-big2">–</b><span class="cl-u">no blocks running</span>',
      cx ? (tr.planned ? meterHtml([{ f: tr.done / tr.planned }], tr.done + ' of ' + tr.planned + ' sessions done') : '')
        : viz('cols', { vals: tr.perDay, labels: dayLabels, hi: 6, titles: tr.perDay.map(function (v, i) { return dateShort(tr.days[i]) + ': ' + plural(v, 'session'); }) }, 58, 'cl-vz-train'),
      tr.behind.length ? 'Behind: ' + nameBtns(tr.behind, cx ? 1 : 3, function (x) { return first(x.r.athlete.name) + ' ' + x.n + '/' + x.p; }) : (tr.planned ? 'Everyone on track' : ''), o));
    var ef = T.effort;
    tiles.push(tileHtml('effort', 'gauge', 'Effort', cx ? '7 days' : 'Last 7 days',
      ef.total ? '<b class="cl-big2">' + ef.pct + '%</b><span class="cl-u">' + (cx ? 'on target' : 'at the RPE you wrote') + '</span>' : '<b class="cl-big2">–</b><span class="cl-u">no RPE yet</span>',
      cx ? (ef.total ? meterHtml([{ f: ef.at / ef.total }, { f: (ef.half + ef.over) / ef.total, cls: 'is-warn' }], plural(ef.at, 'set') + ' at the RPE written, ' + plural(ef.half + ef.over, 'set') + ' heavier') : '')
        : viz('bar100', { id: 'e' + (vizSeq + 1), segs: [{ v: ef.at, cls: 'cl-s-at', title: plural(ef.at, 'set') + ' at or under' }, { v: ef.half, cls: 'cl-s-half', title: plural(ef.half, 'set') + ' half a point over' }, { v: ef.over, cls: 'cl-s-over', title: plural(ef.over, 'set') + ' a point or more over' }] }, 22, 'cl-vz-effort') +
          '<div class="cl-key"><span><i class="k-at"></i>At or under</span><span><i class="k-half"></i>+0.5</span><span><i class="k-over"></i>+1 or more</span></div>',
      ef.who.length ? 'Over: ' + nameBtns(ef.who, cx ? 1 : 2, function (x) { return first(x.r.athlete.name) + (cx ? '' : ' ' + x.text); }) : (ef.total ? 'Nobody over' : ''), o));
    var sg = T.strength;
    tiles.push(tileHtml('strength', 'trend', 'Strength', cx ? '4 weeks' : '4 weeks',
      sg.n ? '<b class="cl-big2">' + sg.up + '</b><span class="cl-u">of ' + sg.n + ' stronger</span>' : '<b class="cl-big2">–</b><span class="cl-u">no trends yet</span>',
      sg.n ? (cx ? meterHtml([{ f: sg.up / sg.n }, { f: sg.down / sg.n, cls: 'is-warn' }], sg.up + ' of ' + sg.n + ' stronger than 4 weeks ago' + (sg.down ? ', ' + sg.down + ' weaker' : ''))
        : viz('strip', { pts: sg.deltas.map(function (x) { return { v: x.d, title: x.r.athlete.name + ': ' + (x.d > 0 ? '+' : '') + x.d + ' ' + unit() }; }), median: sg.median }, 42, 'cl-vz-strength') +
          '<div class="cl-key"><span>Typical ' + (sg.median > 0 ? '+' : '') + sg.median + ' ' + esc(unit()) + '</span>' + (sg.down ? '<span>' + sg.down + ' down</span>' : '') + (sg.flat ? '<span>' + sg.flat + ' flat</span>' : '') + '</div>') : '',
      sg.prs.length ? (cx ? 'PRs: ' : 'PRs this week: ') + nameBtns(sg.prs.map(function (r) { return { r: r }; }), cx ? 2 : 3, function (x) { return first(x.r.athlete.name); }) : 'No PRs this week', o));
    var mt = T.meets, nx = mt.next;
    var mv = nx ? '<b class="cl-big2">' + (nx.days <= 0 ? 'Today' : nx.days === 1 ? 'Tomorrow' : nx.days + ' days') + '</b><span class="cl-u">' + esc(clip(nx.name, cx ? 24 : 20)) + '</span>' : '<b class="cl-big2">None</b><span class="cl-u">in 8 weeks</span>';
    var bwi = mt.bw[0];
    tiles.push(tileHtml('meets', 'trophy', 'Meets', cx ? '8 weeks' : 'Next 8 weeks', mv,
      mt.list.length && !cx ? viz('timeline', { span: 56, items: mt.list.map(function (g) { return { days: g.days, n: g.rows.length, warn: g.rows.some(function (r) { return r.bw && r.bw.over > 0; }), title: g.name + ' · ' + dayMonth(g.date) + ' · ' + g.rows.map(function (r) { return first(r.athlete.name); }).join(', ') }; }) }, 34, 'cl-vz-meets') +
        '<div class="cl-key cl-key-tl"><span>Today</span><span>' + plural(mt.lifters, 'lifter') + ' in ' + plural(mt.list.length, 'meet') + '</span><span>8 weeks</span></div>' : '',

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
    // On the phone a title and its detail take two lines beside the button: a " · " holds on to the
    // words either side, so no line starts or ends on the dot ("Sarah Low back / 6/10 · deadlift").
    // A busy week's title has a short form for the phone and a tiny one for the laptop's narrow columns.
    var rawTitle = (o.icon && t.tiny) || (o.phone && t.short) || t.title;
    var title = o.phone ? keepDots(esc(rawTitle)) : esc(rawTitle);
    var detail = !t.detail ? '' : o.phone ? (t.voice ? '<i class="cl-vplay" aria-hidden="true">' + ic('play') + '</i>' : '') + keepDots(esc(t.detail)) : detailHtml(t);

    return '<div class="cl-job tone-' + t.tone + (o.big ? ' is-big' : '') + (it.done ? ' is-done' : '') + '" data-job="' + esc(it.key) + '">' +
      (o.big ? '<span class="cl-jic">' + ic(t.icon) + '</span>' : '') +
      '<button type="button" class="cl-jmain" data-open="' + esc(openId) + '">' + (o.big && !o.phone ? av : (o.big ? '' : av)) +
        '<span class="cl-jtx"><span class="cl-jt">' + name + '<span>' + title + '</span></span>' + (detail ? '<span class="cl-jd">' + detail + '</span>' : '') + '</span></button>' + btn + '</div>';
  }
  // One word for a fix in a narrow column: what the button does.
  function shortLabel(f) {
    var l = String((f && f.label) || '');
    if (/^Approve/.test(l)) return 'Approve';
    if (f && f.k === 'apply') return f.rule ? 'Apply rule' : 'Apply';   // the coach's own progression rule wrote it
    if (/^Reply/.test(l)) return 'Reply';
    if (/^Check in/.test(l)) return 'Check in';
    if (/nudge/i.test(l)) return 'Nudge';
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
  function rowHtml(r, o, M) {
    var a = r.athlete, n = clNumber(r), top = M ? clTopJob(r, M.jobs) : null, line = clLine(r, top);
    var days = typeof trainingDays === 'function' ? trainingDays(a.id, 7) : [];
    var w = r.status && r.status.week, R = clRing(days.filter(function (d) { return d.on; }).length, w && w.sessionsPerWeek && r.status.program ? w.sessionsPerWeek : 0);
    // The dot before the line is severity, not category: coral for pain, amber for anything to watch, none for routine.
    var sevOf = function (it) { if (!it) return ''; if (it.type === 'pain') return 'alert'; return /^(meetday|weight|overshoot|drift|checkin|readiness|quiet|never|missed|offpace)$/.test(it.type) ? 'watch' : ''; };
    var tone = sevOf(top);
    return '<button type="button" class="cl-row' + (o.sel === a.id ? ' is-sel' : '') + '" data-id="' + esc(a.id) + '" role="option" aria-selected="' + (o.sel === a.id ? 'true' : 'false') + '" tabindex="' + (o.sel === a.id ? '0' : '-1') + '">' +
      avHtml(a) +
      '<span class="cl-main"><span class="cl-name">' + esc(a.name) + (r.live ? '<i class="cl-live" title="Training right now"></i>' : '') + '</span><span class="cl-line' + (tone ? ' sev-' + tone : '') + '">' + (tone ? '<i class="cl-ldot"></i>' : '') + '<span class="cl-lt">' + (o.phone ? keepDots(esc(line)) : esc(line)) + '</span></span></span>' +

      '<span class="cl-end"><span class="cl-n t-' + n.tone + '" title="' + esc(n.title) + '"><b>' + esc(n.text) + '</b>' + (n.tone !== 'none' ? '<small>' + esc(unit()) + '</small>' : '') + '</span>' + pipsHtml(R) + '</span>' +
      (o.phone ? '<span class="cl-chev">' + ic('chev') + '</span>' : '') + '</button>';
  }
  function groupsHtml(M, o) {
    if (!M.groups.length) return '<p class="cl-none">' + (S.q ? 'No one called “' + esc(S.q) + '”' : 'No lifters in this view') + '</p>';
    return M.groups.map(function (g) {
      return '<div class="cl-grp"><h2 class="cl-gh">' + esc(g.title) + ' <span>' + g.rows.length + '</span></h2><div class="cl-list">' + g.rows.map(function (r) { return rowHtml(r, o, M); }).join('') + '</div></div>';
    }).join('');
  }
  // A lifter's summary: one big box for overall progress, a tile per lift, then training, effort,
  // bodyweight and the meet, then their words. o: { phone, rise }
  function summaryHtml(r, M, o) {
    o = o || {};
    var a = r.athlete, st = r.status || {}, prog = st.program, D = clLifter(r);
    var top = clTopJob(r, M.jobs), fix = fixForLifter(r, top), alt = altFor(r, fix);
    var rz = function (i) { return o.rise ? ' rise" style="--i:' + i : ''; };
    var cls = r.meet && r.meet.meet.weightClass ? clsText(r.meet.meet.weightClass) : (r.bw ? clsText(r.bw.cls) : null);
    // The laptop's header shares its row with the page's tools: the week as the desk writes it ("wk 1/3"), on one line.
    var meta = [prog ? esc(clip(prog.name, 30)) + (st.week && st.week.total ? (o.desk ? ' · wk ' + (st.week.idx + 1) + '/' + st.week.total : ' · week ' + (st.week.idx + 1) + ' of ' + st.week.total) : '') : 'No block yet'];
    // Block DNA (block-dna.js): the blocks + compare, a quiet link beside Everything (a row above it on the phone).
    var blk = window.BlockDNA && BlockDNA.linkInfo ? BlockDNA.linkInfo(a.id) : null;
    var blkRow = blk && o.phone ? '<button type="button" class="cl-everything cl-blocks" data-blocks><span class="cl-ev-t">Blocks</span><span class="cl-ev-sub">' + esc(blk.text) + '</span>' + ic('chev') + '</button>' : '';
    if (cls) meta.push(esc(cls) + ' ' + esc(unit()) + ' class');
    // The laptop's header ends on the next lifter in the list (J moves there too): the coach's loop, one lifter after another.
    var nextBtn = o.desk && o.next ? '<button type="button" class="cl-quiet cl-next" data-next="' + esc(o.next.id) + '" data-tip="The next lifter in your list" data-kbd="J">Next: ' + esc(first(o.next.name)) + ic('chev') + '</button>' : '';
    var html = '<header class="cl-ph' + rz(0) + '">' + (o.phone ? '' : avHtml(a, 'lg')) + '<div class="cl-pid"><h2 class="cl-pname">' + esc(a.name) + (r.live ? '<i class="cl-live" title="Training right now"></i>' : '') + '</h2><p class="cl-pmeta">' + meta.join(' · ') + '</p></div>' +
      (o.phone ? '' : '<div class="cl-ptools"><button type="button" class="cl-quiet" data-prog>' + ic('cal') + 'Program</button><button type="button" class="cl-quiet" data-card="notes">' + ic('pen') + 'Notes</button>' +
        (blk ? '<button type="button" class="cl-quiet" data-blocks title="' + esc(blk.text) + '">' + ic('blocks') + 'Blocks</button>' : '') + '<button type="button" class="cl-quiet" data-go="all">Everything' + ic('chev') + '</button>' + nextBtn + '</div>') + '</header>';
    // The flag: what needs doing and the fix (the page's one red). Nothing wrong, no flag. In the laptop's Pain view a pain
    // flag is the pain card (where, the lift, the score, how often, when), with the same fix.
    if (top) {
      var jt = jobText(top.type === 'meetday' ? Object.assign({}, top, { forId: a.id }) : top);
      var busyBits = top.type === 'busy' ? (jt.note ? '<span class="cl-fnote">“' + esc(clip(jt.note, 140)) + '”</span>' : '') + '<button type="button" class="cl-link cl-fkeep" data-busy-keep>Keep the week as written</button>' : '';
      var acts = '<span class="cl-facts">' + (o.phone ? '' : '<button type="button" class="cl-btn quiet" data-act="alt">' + esc(alt.label) + '</button>') + '<button type="button" class="cl-btn red" data-act="fix">' + esc(fix.label) + '</button></span>';
      if (o.desk && o.view === 'pain' && top.type === 'pain') html += painCardHtml(r, jt, acts, rz(1));
      else html += '<div class="cl-flag tone-' + jt.tone + rz(1) + '"><span class="cl-fic">' + ic(jt.icon) + '</span><span class="cl-ftx"><b>' + esc(jt.title) + '</b>' + (jt.detail ? '<span>' + detailHtml(jt) + '</span>' : '') + busyBits + '</span>' + acts + '</div>';
    }
    // The laptop's Meet view: the meet first (its countdown, the weight against the class, the attempts).
    if (o.desk && o.view === 'meet' && r.meet && r.meet.days <= 112) html += meetCardHtml(r, rz(1));
    // Nothing logged at all: one clear card instead of a page of dashes.
    var anyLog = D.total || D.lifts.some(function (L) { return L.e1 > 0; }) || D.weeks.some(function (x) { return x.done > 0; }) || D.bw.length;
    if (!anyLog) {
      html += '<div class="cl-empty' + rz(2) + '"><span class="cl-tic">' + ic('cal') + '</span><div><b>Nothing logged yet</b><p>Once ' + esc(first(a.name)) + ' logs a session, their total, the three lifts, training and bodyweight show here.</p>' + deskCareerBtn(a, o) + '</div></div>';
      if (D.words) html += '<div class="cl-words' + rz(3) + '"><span class="cl-wq">“' + esc(clip(D.words.text, 220)) + '”</span><span class="cl-wm">' + esc(whenText(D.words.when)) + ' · <button type="button" class="cl-link" data-reply>Reply</button></span></div>';
      // The business side and their intake (clients-ui.js): a new lifter's About matters most here.
      if (window.ClientsUI) html += ClientsUI.sectionHtml(a.id, { phone: !!o.phone, rise: o.rise ? 4 : null });
      if (o.phone) html += linksHtml(a, 'Profile, check-ins, notes', rz(4), blkRow);
      return { html: html, fix: fix, alt: alt, top: top };
    }
    html += chartsHtml(r, D, o);
    // Their words.
    if (D.words) html += '<div class="cl-words' + rz(5) + '"><span class="cl-wq">“' + esc(clip(D.words.text, 220)) + '”</span><span class="cl-wm">' + esc(whenText(D.words.when)) + ' · ' + (D.words.kind === 'note' ? 'session note' : 'message') + ' · <button type="button" class="cl-link" data-reply>Reply</button></span></div>';
    // The phone: the week's note, drafted from what's above (weekly-note.js).
    if (o.phone && window.WeeklyNote) html += WeeklyNote.lifterEntryHtml(r, { rise: o.rise ? 5 : null });
    // The business side (package, payments) and their intake (clients-ui.js): everything about this lifter.
    if (window.ClientsUI) html += ClientsUI.sectionHtml(a.id, { phone: !!o.phone, rise: o.rise ? 6 : null });
    if (o.phone) html += linksHtml(a, 'Lifts, check-ins, notes, meets', rz(6), blkRow);
    if (o.phone && top) html += '<div class="cl-alt"><button type="button" class="cl-btn quiet" data-act="alt">' + esc(alt.label) + '</button></div>';
    return { html: html, fix: fix, alt: alt, top: top };
  }

  // The lifter's progress as charts: the total e1RM (12 weeks, the meet and where the block points),
  // a tile per lift, then training, effort, bodyweight and the meet. Shared by the laptop's lifter page
  // and the phone's Progress (coach-app.js). D: clLifter(r). o: { phone, rise }.
  function chartsHtml(r, D, o) {
    o = o || {};
    var a = r.athlete, st = r.status || {}, prog = st.program, html = '';
    var rz = function (i) { return o.rise ? ' rise" style="--i:' + i : ''; };
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
        (ctx.length ? '<span class="cl-hctx">' + esc(ctx.join(' · ')) + '</span>' : '') +
        // The desk's way into the lifter's Career (career.js), under the total and the last meet. (The phone's is at the foot.)
        deskCareerBtn(a, o) + '</div>' +
        '<div class="cl-hc">' + viz('line', line, o.phone ? 120 : 148, 'cl-vz-hero') +
        '<div class="cl-hcap"><span>' + esc(dayMonth(T.pts[0].week)) + '</span>' + (line.flag ? '<span class="cl-hmeet">' + ic('flag') + esc(clip(T.meetName, 22)) + ' · ' + esc(dayMonth(T.meetDate)) + '</span>' : '<span>This week</span>') + '</div></div></div>';
    } else {
      html += '<div class="cl-hero is-empty' + rz(2) + '"><div class="cl-hl"><span class="cl-hlab">Total e1RM</span><div class="cl-hnum"><b>–</b></div><span class="cl-hctx">Shows once squat, bench and deadlift are all logged.</span>' + deskCareerBtn(a, o) + '</div></div>';
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
        // Harder is a status: on the phone it wears the triangle beside its ink words (coach-app.css .ca-charts .cl-warn).
        Math.abs(avgR) < 0.5 ? 'Within 0.5 RPE of plan' : (avgR > 0 ? (o.phone ? '<span class="cl-warn">Heavier than you wrote</span>' : 'Heavier than you wrote') : 'Easier than you wrote'), { compact: true }));
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
    // The meet: a tile on the phone; on the laptop one slim card under the three tiles (first, in the Meet view).
    var meetAfter = '';
    if (r.meet && r.meet.days <= 112) {
      var m = r.meet.meet, planned = meetAttemptsSet(m);
      if (o.desk) { if (o.view !== 'meet') meetAfter = meetCardHtml(r, rz(5)); }
      else small.push('<div class="cl-tile t-meets is-compact cl-meet"><div class="cl-th"><span class="cl-tic">' + ic('trophy') + '</span><span class="cl-tl">Meet</span><span class="cl-ts">' + esc(dayMonth(m.date)) + '</span></div>' +
        '<div class="cl-tv"><b class="cl-big3">' + (r.meet.days <= 0 ? 'Today' : r.meet.days === 1 ? 'Tomorrow' : r.meet.days + ' days') + '</b></div>' +
        '<div class="cl-mname">' + esc(clip(m.name || 'Meet', 30)) + '</div>' +
        '<button type="button" class="cl-mplan' + (planned ? '' : ' is-warn') + '" data-plan="' + esc(a.id) + '">' + (planned ? ic('check') + 'Attempts set' : ic('alert') + 'Set attempts') + '</button></div>');
    }
    html += '<div class="cl-small n' + small.length + rz(4) + '">' + small.join('') + '</div>' + meetAfter;
    return html;
  }
  // The meet on a lifter's laptop page, one slim card: its name and date, the countdown, the weight against the class
  // (an amber dot when over), and the attempt plan (Set attempts opens the planner, meetday.js MeetDay.planFor).
  function meetCardHtml(r, rise) {
    var m = r.meet.meet || {}, d = r.meet.days, a = r.athlete, planned = typeof meetAttemptsSet === 'function' && meetAttemptsSet(m);
    var bw = r.bw ? '<span class="cl-mc-w' + (r.bw.over > 0 ? ' is-warn' : ' is-ok') + '"><i aria-hidden="true"></i>' + esc(r.bw.over > 0 ? num(kgShow(r.bw.over)) + ' ' + unit() + ' over the ' + clsText(r.bw.cls) : 'On weight for the ' + clsText(r.bw.cls)) + '</span>'
      : (m.weightClass ? '<span class="cl-mc-w"><i aria-hidden="true"></i>' + esc(clsText(m.weightClass) + ' ' + unit() + ' class') + '</span>' : '');
    return '<div class="cl-meetcard' + (rise || '') + '"><span class="cl-tic">' + ic('trophy') + '</span>' +
      '<span class="cl-mc-id"><b>' + esc(clip(m.name || 'Meet', 40)) + '</b><span>' + esc(dateShort(m.date)) + '</span></span>' +
      '<span class="cl-mc-n"><b>' + (d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : d) + '</b>' + (d > 1 ? '<span>days</span>' : '') + '</span>' + bw +
      '<button type="button" class="cl-sbtn cl-mc-plan" data-plan="' + esc(a.id) + '">' + (planned ? ic('check', 2.4) + 'Attempts set' : 'Set attempts') + '</button></div>';
  }
  // The Pain view's lead on a lifter's laptop page: where it hurts and the score out of 10 (a ten-step meter), the lift,
  // when in the session, the day, and how often this week; a check-in's yes when there's no report. acts: the flag's own
  // two buttons (the fix is the page's one crimson).
  function painCardHtml(r, jt, acts, rise) {
    var st = r.status || {}, pb = painBits(st), p = st.pain || {}, rep = p.report || null, facts = [], title, sev = null;
    var PH = typeof PAIN_PHASES !== 'undefined' ? PAIN_PHASES : {};
    if (pb) {
      title = pb.part; sev = pb.sev != null ? Number(pb.sev) : null;
      if (pb.lift) facts.push(pb.lift);
      if (rep && rep.phase && PH[rep.phase]) facts.push(PH[rep.phase].toLowerCase());
      if (pb.day) facts.push(whenText(pb.day));
      facts.push(pb.count >= 2 ? timesWord(pb.count) + ' this week' : 'first time this week');
      if (p.open > pb.count) facts.push(p.open + ' reports open');
    } else {
      title = 'Pain on the check-in';
      facts.push('Said yes to pain');
      if (r.meet && r.meet.days <= 14) facts.push(meetLine(r));
    }
    var meter = sev != null ? '<span class="cl-pmeter" role="img" aria-label="' + sev + ' out of 10">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return '<i' + (i <= sev ? ' class="on"' : '') + '></i>'; }).join('') + '</span>' : '';
    return '<div class="cl-flag cl-paincard tone-pain' + (rise || '') + '"><span class="cl-fic">' + ic('alert') + '</span><span class="cl-ftx">' +
      '<span class="cl-pc-t"><b>' + esc(title) + '</b>' + (sev != null ? '<span class="cl-pc-s"><b>' + sev + '</b>/10</span>' + meter : '') + '</span>' +
      '<span>' + esc(facts.join(' · ')) + '</span></span>' + acts + '</div>';
  }

  // The way into a lifter's Career (career.js): its one line ('4 meets · since 2024'), or null when
  // there's nothing on record yet (no session, no meet).
  function careerOf(a) {
    if (!window.Career || typeof Store === 'undefined') return null;
    try { var C = Career.careerEvents(a.id, Store.get()); return C.hero.sessions || C.hero.meets ? Career.careerLine(C) : null; } catch (e) { return null; }
  }
  // The desk's quiet Career link (in the total's hero, or under "Nothing logged yet"), when there's a career.
  function deskCareerBtn(a, o) {
    return !o.phone && careerOf(a) != null ? '<button type="button" class="cl-quiet cl-hcareer" data-career>' + ic('steps') + 'Career</button>' : '';
  }
  // The phone's links at the foot of a lifter: Career (when there is one) and Everything, one card.
  // The foot of a lifter's page on the phone: one card of rows. lead: rows that go first (Blocks).
  function linksHtml(a, sub, rise, lead) {
    var line = careerOf(a);
    return '<div class="cl-links' + rise + '">' + (lead || '') +
      (line != null ? '<button type="button" class="cl-everything" data-career><span class="cl-ev-t">Career</span><span class="cl-ev-sub">' + esc(line) + '</span>' + ic('chev') + '</button>' : '') +
      '<button type="button" class="cl-everything" data-go="all"><span class="cl-ev-t">Everything</span><span class="cl-ev-sub">' + esc(sub) + '</span>' + ic('chev') + '</button></div>';
  }

  // ALLOW NOTIFICATIONS (notify.js): the calm ask for alerts ("Get a ping for PRs, messages and missed
  // sessions.") fills the spot left for it after the lifters who need the coach, so the one red fix
  // stays on top, and before This week. No card (alerts on or blocked, "Not now", no lifters yet):
  // the spot goes. Safe on every re-render: notify.js keeps the answer and plays the entrance once.
  var PN_SPOT = '<div class="pn-host" hidden></div>';
  function placeNotify(root, lifters) {
    try { if (window.PowaNotify && PowaNotify.placeCoach) { PowaNotify.placeCoach(root, lifters); return; } } catch (e) {}
    var spot = root && root.querySelector('.pn-host');
    if (spot && spot.parentNode) spot.parentNode.removeChild(spot);
  }

  /* =====================================================================================
     TODAY (laptop), v3 (2 Nov): "who needs me now, and is the team on track?" Do first (the page's one crimson),
     Your team (the roster in lanes, this week, effort, strength, meets, where everyone is in their block, the business
     line), then Your list (every other job, one list, tabs by kind). Every card opens the people behind it.
     ===================================================================================== */
  function inKind(it, k) { return !k || it.kind === k || (k === 'meet' && it.kind === 'meetday') || (k === 'answer' && it.kind === 'busy'); }
  // What the overview draws, from the rows the rest of Today draws (and the same maths as the phone's Home).
  function teamModel(M) {
    var t = todayIso(), s = typeof Store !== 'undefined' ? Store.get() : {}, rows = M.rows, CA = window.CoachApp || null;
    var T = clTeam(rows, { today: t });
    // Effort's picture: the sets clTeam counts (the last 7 days) in the phone's five bins (coach-app.js caEffortBins).
    var since = addDays(t, -6), sets = [];
    rows.forEach(function (r) {
      var prog = r.status && r.status.program;
      if (!prog || typeof programLoggedSets !== 'function') return;
      programLoggedSets(prog).forEach(function (x) { if (x.date && x.date >= since && x.date <= t) sets.push({ id: r.athlete.id, name: r.athlete.name, set: x.set, date: x.date }); });
    });
    var bins = CA && CA.caEffortBins ? CA.caEffortBins(sets) : null;
    // Strength by lift: each lifter's best e1RM now against 4 weeks ago, summed per lift (app.js getE1RMMomentum, as Home).
    var lifts = null;
    if (CA && CA.caTeamStrength && typeof getE1RMMomentum === 'function') {
      try { lifts = CA.caTeamStrength(rows.map(function (r) { return { id: r.athlete.id, name: r.athlete.name, m: getE1RMMomentum(r.athlete.id, 28) }; })).lifts; } catch (e) { lifts = null; }
    }
    var C = window.Clients, sm = null;
    if (C && C.clientsSummary) { try { sm = C.clientsSummary(s.clientBilling || [], s.clientPayments || [], t, (s.athletes || []).filter(function (a) { return a && a.id; }).map(function (a) { return a.id; })); } catch (e) { sm = null; } }
    var leads = window.ClientsUI && ClientsUI.leads ? ClientsUI.leads() : [];
    return { T: T, lanes: clLanes(rows, { order: M.order }), bins: bins, lifts: lifts,
      season: clSeason(rows, { today: t, programs: s.programs || [], meets: s.meets || [], blocks: s.programBlocks || [] }),
      biz: clBusiness({ summary: sm, money: C && C.formatMoney ? function (c, cur) { return C.formatMoney(c, cur); } : null, apps: leads.length, joins: (window._joinReqs || []).length,
        seats: window.CoachHome && CoachHome.seats ? CoachHome.seats() : null }) };
  }
  // A card: its name and window, the big number (a button: it opens the people behind it, as a click anywhere on the card
  // does), one picture, one line. o: { cls, title, win, go (attributes), num, unit, aside, pic, foot (HTML), aria }
  function cardHead(title, win) { return '<div class="cl-card-h"><h3>' + esc(title) + '</h3>' + (win ? '<span>' + esc(win) + '</span>' : '') + '</div>'; }
  function cardHtml(o) {
    return '<div class="cl-card ' + o.cls + '" ' + (o.go || '') + '>' + cardHead(o.title, o.win) +
      '<button type="button" class="cl-card-main" ' + (o.go || '') + ' aria-label="' + esc(o.aria) + '"><span class="cl-card-n" aria-hidden="true"><b>' + o.num + '</b>' + (o.unit ? '<span>' + esc(o.unit) + '</span>' : '') + '</span>' + (o.aside || '') + '</button>' +
      (o.pic ? '<div class="cl-card-pic">' + o.pic + '</div>' : '') + '<div class="cl-card-f">' + (o.foot || '') + '</div></div>';
  }
  function emptyCard(cls, title, win, head, sub) { return '<div class="cl-card ' + cls + ' is-empty">' + cardHead(title, win) + '<p class="cl-card-none"><b>' + esc(head) + '</b>' + esc(sub) + '</p></div>'; }
  // Every lifter at a glance: four lanes (Need you, Meet in 8 weeks, On plan, Quiet), a big count and the faces in each.
  function rosterCardHtml(lanes, n) {
    return '<div class="cl-card cl-c-roster">' + cardHead('Roster', plural(n, 'lifter')) + '<div class="cl-lanes">' + lanes.map(function (L) {
      var cap = 14, faces = L.rows.length > cap + 1 ? L.rows.slice(0, cap) : L.rows, more = L.rows.length - faces.length;
      var names = L.rows.map(function (r) { return first(r.athlete.name); });
      return '<button type="button" class="cl-lane k-' + L.key + '" data-golist="' + esc(L.tab || '') + '" aria-label="' + esc(L.title + ': ' + L.rows.length + (names.length ? ', ' + namesList(names, 6) : '') + '. Show them on Lifters') + '">' +
        '<span class="cl-lane-n" aria-hidden="true"><b>' + L.rows.length + '</b><span>' + esc(L.title) + '</span></span>' +
        '<span class="cl-lane-f" aria-hidden="true">' + (faces.length ? faces.map(function (r) { var rg = clRingOf(r); return '<span class="cl-face' + (rg ? ' ring-' + rg : '') + '" title="' + esc(r.athlete.name) + '">' + avHtml(r.athlete) + '</span>'; }).join('') +
          (more > 0 ? '<span class="cl-lane-more">+' + more + '</span>' : '') : '<span class="cl-lane-none">Nobody</span>') + '</span></button>';
    }).join('') + '</div></div>';
  }
  function ringHtml(pct) {
    var S = 48, r = 20, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, pct / 100));
    return '<span class="cl-ring" aria-hidden="true"><svg width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '"><circle class="cl-ring-t" cx="24" cy="24" r="' + r + '"/>' +
      '<circle class="cl-ring-v" cx="24" cy="24" r="' + r + '" stroke-dasharray="' + (c * f).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 24 24)"/></svg><b>' + Math.round(pct) + '%</b></span>';
  }
  // The last 7 days, a column a day (today last, in ink), as tall as the day's sessions against the busiest.
  function weekPicHtml(tr) {
    var max = Math.max(1, Math.max.apply(null, tr.perDay));
    return '<div class="cl-days">' + tr.perDay.map(function (v, i) {
      var iso = tr.days[i];
      return '<span class="cl-day' + (i === tr.perDay.length - 1 ? ' is-today' : '') + '" title="' + esc(dateShort(iso) + ': ' + plural(v, 'session')) + '"><span class="cl-day-p"><i class="' + (v ? '' : 'is-zero') + '" style="--h:' + (v / max).toFixed(3) + '"></i></span>' +
        '<span class="cl-day-l">' + esc(localDate(iso, { weekday: 'narrow' })) + '</span></span>';
    }).join('') + '</div>';
  }
  function weekCardHtml(T) {
    var tr = T.training;
    if (!tr.planned) return emptyCard('cl-c-week', 'This week', 'Last 7 days', 'No blocks running', 'Sessions land here as they’re logged.');
    var pct = tr.done / tr.planned * 100;
    var foot = tr.behind.length ? 'Behind: ' + nameBtns(tr.behind, 3, function (x) { return first(x.r.athlete.name) + ' ' + x.n + '/' + x.p; }) : 'Everyone on track';
    return cardHtml({ cls: 'cl-c-week', title: 'This week', win: 'Last 7 days', go: 'data-golist="check"', num: String(tr.done), unit: 'of ' + tr.planned + ' sessions', aside: ringHtml(pct), pic: weekPicHtml(tr), foot: foot,
      aria: tr.done + ' of ' + tr.planned + ' sessions in the last 7 days. ' + (tr.behind.length ? tr.behind.length + ' behind' : 'Everyone on track') + '. Show who to check on' });
  }
  // Where the sets landed against what was written: easier, under, as written, half a point over, a point or more over.
  // The number is the first three together, so the picture and the number agree; heavier is amber.
  function binsPicHtml(B) {
    var max = Math.max(1, Math.max.apply(null, B)), cls = ['is-under', 'is-at', 'is-at', 'is-half', 'is-over'];
    return '<div class="cl-bins"><span class="cl-bins-c">' + B.map(function (n, i) { return '<span class="cl-bin"><i class="' + cls[i] + (n ? '' : ' is-zero') + '" style="--h:' + (n / max).toFixed(3) + '"></i></span>'; }).join('') + '</span>' +
      '<span class="cl-bins-x"><span>Easier</span><span>As written</span><span>Harder</span></span></div>';
  }
  function effortCardHtml(T, bins) {
    var ef = T.effort;
    if (!ef.total) return emptyCard('cl-c-effort', 'Effort', 'Last 7 days', 'No RPE logged yet', 'Each set lands here against the RPE you wrote.');
    var B = bins && bins.length === 5 ? bins : [0, ef.at, 0, ef.half, ef.over];
    var foot = ef.who.length ? 'Over: ' + nameBtns(ef.who, 2, function (x) { return first(x.r.athlete.name) + ' ' + x.text; }) : 'Nobody over what you wrote';
    return cardHtml({ cls: 'cl-c-effort', title: 'Effort', win: 'Last 7 days', go: 'data-golist="check"', num: ef.pct + '%', unit: 'at or under what you wrote', pic: binsPicHtml(B), foot: foot,
      aria: ef.pct + '% of ' + plural(ef.total, 'set') + ' at or under the RPE you wrote in the last 7 days' + (ef.who.length ? '. Over: ' + ef.who.map(function (x) { return first(x.r.athlete.name); }).join(', ') : '') + '. Show who to check on' });
  }
  // Each lift's team change over 4 weeks, in the lift's colour.
  function liftsPicHtml(lifts) {
    var CA = window.CoachApp || {};
    var vals = LIFTS.map(function (L) { return lifts[L] && lifts[L].n && lifts[L].pct != null ? lifts[L].pct : null; });
    var max = Math.max.apply(null, [0.5].concat(vals.map(function (v) { return v == null ? 0 : Math.abs(v); })));
    return '<div class="cl-lbars">' + LIFTS.map(function (L, i) {
      var v = vals[i], txt = v == null ? '–' : (CA.caPct ? CA.caPct(v) : (v > 0 ? '+' : '') + (Math.round(v * 10) / 10) + '%');
      return '<span class="cl-lbar lb-' + LIFT_CLS[L].slice(2) + '"><span class="cl-lbar-n">' + LIFT[L] + '</span><span class="cl-lbar-t"><i class="' + (v != null && v < 0 ? 'is-down' : '') + '" style="--w:' + (v == null ? 0 : Math.abs(v) / max).toFixed(3) + '"></i></span><span class="cl-lbar-v">' + esc(txt) + '</span></span>';
    }).join('') + '</div>';
  }
  function strengthCardHtml(T, lifts) {
    var sg = T.strength;
    if (!sg.n) return emptyCard('cl-c-strength', 'Strength', '4 weeks', 'No trends yet', 'Each lifter’s e1RM against 4 weeks ago, once they log.');
    var foot = sg.prs.length ? 'PRs this week: ' + nameBtns(sg.prs.map(function (r) { return { r: r }; }), 3, function (x) { return first(x.r.athlete.name); }) : 'No PRs this week';
    return cardHtml({ cls: 'cl-c-strength', title: 'Strength', win: '4 weeks', go: 'data-golist=""', num: String(sg.up), unit: 'of ' + sg.n + ' stronger', pic: lifts ? liftsPicHtml(lifts) : '', foot: foot,
      aria: sg.up + ' of ' + sg.n + ' lifters stronger than 4 weeks ago' + (sg.prs.length ? ', ' + plural(sg.prs.length, 'PR') + ' this week' : '') + '. Show everyone' });
  }
  function meetsCardHtml(T) {
    var mt = T.meets;
    if (!mt.list.length) return emptyCard('cl-c-meets', 'Meets', 'Next 8 weeks', 'No meets in 8 weeks', 'Plan one from a lifter’s page and it counts down here.');
    var marks = [];
    mt.list.forEach(function (g) { g.rows.forEach(function (r) { marks.push({ x: Math.min(56, Math.max(0, g.days)) / 56, r: r, title: r.athlete.name + ': ' + g.name + ', ' + daysText(g.days) }); }); });
    var nx = mt.next, who = nx.rows.map(function (r) { return first(r.athlete.name); });
    var foot = esc((nx.days <= 0 ? 'Today: ' : nx.days === 1 ? 'Tomorrow: ' : 'Next: ') + nx.name + (nx.days > 1 ? ' in ' + nx.days + ' days' : '') + ' · ' + namesList(who, 3));
    return cardHtml({ cls: 'cl-c-meets', title: 'Meets', win: 'Next 8 weeks', go: 'data-golist="meet"', num: String(mt.lifters), unit: (mt.lifters === 1 ? 'lifter' : 'lifters') + ' in ' + plural(mt.list.length, 'meet'),
      pic: trackHtml({ tone: 'meet', marks: marks, ticks: [1, 2, 3, 4, 5, 6, 7].map(function (w) { return w / 8; }), labels: [[0, 'Today'], [0.5, '4 weeks'], [1, '8 weeks']] }), foot: foot,
      aria: mt.lifters + ' lifters in ' + plural(mt.list.length, 'meet') + ' in the next 8 weeks. ' + nx.name + ' ' + daysText(nx.days) + '. Show them on Lifters' });
  }
  // Where everyone is: the next 8 by their next meet, one line each on the same weeks (today's line through all of them):
  // the face, the name and the week of the block, the block's weeks (this one lit), the meet's flag, the days to go.
  function seasonCardHtml(S, n) {
    var lines = S.lines.slice(0, 8);
    if (!lines.length) return '';
    var span = S.weeks * 7, months = [];
    for (var d = 1; d < span; d++) { var iso = addDays(S.from, d); if (iso.slice(8, 10) === '01') { var mx = (d + 0.5) / span; if (Math.abs(mx - S.now) > 0.07) months.push('<span style="--x:' + mx.toFixed(4) + '">' + esc(localDate(iso, { month: 'short' })) + '</span>'); } }
    var axis = '<div class="cl-sn-head" aria-hidden="true"><span></span><span class="cl-sn-ax">' + months.join('') + '<span class="is-now" style="--x:' + S.now.toFixed(4) + '">Today</span></span><span class="cl-sn-dh">Meet</span></div>';
    var body = lines.map(function (L) {
      var a = L.r.athlete, segs = '', rg = clRingOf(L.r);
      if (L.bar) for (var k = 0; k < L.bar.weeks; k++) {
        var w = L.bar.from + k;
        if (w < 0 || w >= S.weeks) continue;
        var cls = L.bar.cur == null ? (L.bar.from > S.back ? 'is-next' : 'is-past') : k < L.bar.cur ? 'is-past' : k === L.bar.cur ? 'is-now' : 'is-next';
        segs += '<i class="cl-sn-w ' + cls + '" style="--x0:' + (w / S.weeks).toFixed(4) + ';--x1:' + ((w + 1) / S.weeks).toFixed(4) + '"></i>';
      }
      var flag = L.meet ? '<i class="cl-sn-flag' + (L.meet.x > 1 ? ' is-out' : '') + '" style="--x:' + Math.min(1, L.meet.x).toFixed(4) + '">' + ic('flag', 2.2) + '</i>' : '';
      var days = L.meet ? (L.meet.days <= 0 ? 'Today' : L.meet.days === 1 ? 'Tomorrow' : L.meet.days + ' days') : '–';
      var title = a.name + ': ' + L.week + (L.meet ? '. ' + L.meet.name + ' ' + daysText(L.meet.days) + (L.meet.wn ? ' (' + L.meet.wn + ')' : '') : '. No meet planned');
      return '<button type="button" class="cl-sn-l" data-pick="' + esc(a.id) + '" title="' + esc(title) + '" aria-label="' + esc(title) + '">' +
        '<span class="cl-sn-who"><span class="cl-face' + (rg ? ' ring-' + rg : '') + '">' + avHtml(a) + '</span><span class="cl-sn-n"><b>' + esc(a.name) + '</b><span>' + esc(L.week) + '</span></span></span>' +
        '<span class="cl-sn-t"><i class="cl-sn-rail"></i>' + segs + flag + '<i class="cl-sn-now" style="--x:' + S.now.toFixed(4) + '"></i></span>' +
        '<span class="cl-sn-d' + (L.meet ? '' : ' is-none') + '">' + esc(days) + '</span></button>';
    }).join('');
    return '<div class="cl-card cl-c-season">' + cardHead('Where everyone is', 'Soonest meet first') + axis + '<div class="cl-sn">' + body + '</div>' +
      '<div class="cl-card-f"><button type="button" class="cl-quiet cl-sn-all" data-season-all>All ' + n + ' on the season calendar' + ic('chev') + '</button></div></div>';
  }
  // The business, one quiet line under the cards; each part opens its place (Clients, the overdue, New lifters, Plan & seats).
  function bizHtml(parts) {
    if (!parts.length) return '';
    return '<div class="cl-biz" role="group" aria-label="Your business">' + parts.map(function (p) {
      return '<button type="button" class="cl-biz-p k-' + p.key + '" data-biz="' + p.key + '">' + (p.key === 'overdue' ? '<i aria-hidden="true"></i>' : '') + esc(p.text) + '</button>';
    }).join('<span class="cl-biz-sep" aria-hidden="true">·</span>') + '</div>';
  }
  function bizGo(k) {
    if (k === 'apps') { if (typeof openNewLifters === 'function') openNewLifters(); return; }
    if (k === 'seats') { try { localStorage.setItem('powa-desk-set', 'plan'); } catch (e) {} if (typeof deskGo === 'function') deskGo('settings'); return; }
    if (typeof deskGo !== 'function') return;
    deskGo('clients');
    var f = document.querySelector('#clientsArea [data-cs="filter"][data-f="' + (k === 'overdue' ? 'overdue' : 'all') + '"]');
    if (f && !f.classList.contains('on')) f.click();
  }
  // The season calendar (desk-season.js), from Where everyone is: this visit only, the coach's own choice of mode stays.
  function openSeason() {
    if (typeof _dk !== 'undefined') _dk.rmode = 'calendar';
    if (typeof deskGo === 'function') deskGo('roster', { view: null });
  }
  function teamHtml(M, X) {
    var n = M.rows.length;
    return '<div class="cl-sh"><h2>Your team</h2><span class="cl-sh-end">' + (window.CoachReportUI && n ? CoachReportUI.entryHtml() : '') + (window.WeeklyNote ? WeeklyNote.todayEntryHtml(M.rows) : '') + '</span></div>' +
      '<div class="cl-team-grid">' + rosterCardHtml(X.lanes, n) + weekCardHtml(X.T) + effortCardHtml(X.T, X.bins) + strengthCardHtml(X.T, X.lifts) + meetsCardHtml(X.T) + seasonCardHtml(X.season, n) + '</div>' + bizHtml(X.biz);
  }
  // Your list: every job but Do first's, most urgent first, one line each (face, name, the kind's mark and why, one quiet
  // fix), tabs by kind; 8 shown, then all; done jobs last.
  function ylRowHtml(it) {
    var t = jobText(it), fix = fixForJob(it), who = it.r ? [it.r] : (it.rows || []);
    var openId = it.r ? it.r.athlete.id : (who[0] ? who[0].athlete.id : '');
    var face = it.r ? '<span class="cl-face">' + avHtml(it.r.athlete) + '</span>' : '<span class="cl-stack">' + who.slice(0, 3).map(function (r) { return avHtml(r.athlete); }).join('') + '</span>';
    var name = it.r ? it.r.athlete.name : String(it.name || 'Meet');
    var title = (it.type === 'busy' && t.short) || t.title;
    var full = name + ': ' + title + (t.detail ? ' · ' + t.detail : '');
    return '<div class="cl-jr tone-' + t.tone + (it.done ? ' is-done' : '') + '" data-job="' + esc(it.key) + '">' +
      '<button type="button" class="cl-jr-main" data-open="' + esc(openId) + '" title="' + esc(full) + '">' + face + '<span class="cl-jr-n">' + esc(name) + '</span>' +
        '<span class="cl-jr-ic" aria-hidden="true">' + ic(t.icon) + '</span><span class="cl-jr-t"><b>' + esc(title) + '</b>' + (t.detail ? '<span>' + esc(t.detail) + '</span>' : '') + '</span></button>' +
      (it.done ? '<span class="cl-jr-done">' + ic('check', 2.4) + 'Done</span>'
        : '<button type="button" class="cl-sbtn" data-fix="' + esc(it.key) + '" aria-label="' + esc(fix.label) + '" title="' + esc(fix.label) + '">' + esc(shortLabel(fix)) + '</button>') + '</div>';
  }
  function yourListHtml(M, rest) {
    var tab = S.yl || null, list = rest.filter(function (it) { return inKind(it, tab); });
    var doneList = M.jobs.filter(function (it) { return it.done && inKind(it, tab); });
    var shown = S.ylAll ? list : list.slice(0, 8), more = list.length - shown.length;
    var tabs = '<div class="cl-tabs" role="tablist" aria-label="Your list">' + [[null, 'All']].concat(KINDS.map(function (k) { return [k[0], k[1]]; })).map(function (x) {
      return tabBtn(x[0], x[1], rest.filter(function (it) { return inKind(it, x[0]); }).length, tab === x[0]);
    }).join('') + '</div>';
    var rows = shown.concat(more > 0 ? [] : doneList).map(ylRowHtml).join('');
    return '<div class="cl-sh"><h2>Your list</h2><span>' + plural(rest.length, 'job') + ', most urgent first' + (M.done ? ' · ' + M.done + ' done' : '') + '</span></div>' + tabs +
      (rows ? '<div class="cl-jlist">' + rows + '</div>' : '<p class="cl-none">' + (tab ? 'Nothing here.' : 'Nothing else on your list.') + '</p>') +
      (more > 0 ? '<button type="button" class="cl-morebtn cl-ylmore" data-ylmore>Show all ' + list.length + '</button>' : '');
  }
  function paintYourList(host) {
    var box = host.querySelector('.cl-yl');
    if (!box || !host._clM) return;
    box.innerHTML = yourListHtml(host._clM, host._clRest || []);
  }
  function renderToday(host, opts) {
    var M = model({ reuse: !!(opts && opts.reuse) });
    var firstPaint = !host._clToday;
    host._clToday = true;
    var urgent = M.open.filter(function (it) { return it.tier <= 1; });
    var doFirst = urgent.slice(0, 3);
    var rest = M.open.filter(function (it) { return doFirst.indexOf(it) < 0; });
    var X = teamModel(M);
    var total = M.jobs.length, pct = total ? Math.round(M.done / total * 100) : 0;
    var rz = function (i) { return firstPaint ? ' rise" style="--i:' + i : ''; };
    var date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    var html = '<div class="ch-home cl-root cl-today">' +
      '<header class="cl-thead' + rz(0) + '"><div><h1 class="cl-h1x">Today</h1><p class="cl-sub">' + esc(date) + ' · ' + plural(M.rows.length, 'lifter') + (M.live.length ? ' · <b class="t-live">' + M.live.length + ' under the bar</b>' : '') + (window.ClientsUI ? ClientsUI.todayBit() : '') + '</p></div>' +
        (total ? '<div class="cl-prog"><span><b>' + (total - M.done) + '</b> to do this week' + (M.done ? ' · <b>' + M.done + '</b> done' : '') + '</span>' + (M.done ? '<span class="cl-pbar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' : '') + '</div>' : '') + '</header>';
    // One count on Today: the rail, the header and Do first + Also on your list all add up to the same jobs.
    html += '<div class="cl-sh' + rz(1) + '"><h2>Do first</h2></div>';
    html += doFirst.length ? '<div class="cl-do' + rz(2) + '">' + doFirst.map(function (it, i) { return jobHtml(it, { big: true, red: i === 0 }); }).join('') + '</div>'
      : '<div class="cl-calm' + rz(2) + '"><span class="cl-tic">' + ic('check') + '</span><span><b>Nothing urgent.</b> ' + (M.open.length ? 'The rest is below, by job.' : 'Everyone is on plan.') + '</span></div>';
    html += PN_SPOT;
    // Your team (its header carries this week's quiet ways on: last week's report, coach-report-ui.js, and the week's
    // notes, weekly-note.js). The wrapper keeps .cl-pweek: the notify card's spot sits between Do first and it.
    html += '<div class="cl-pweek cl-team' + rz(3) + '">' + teamHtml(M, X) + '</div>';
    if (rest.length || M.done) html += '<div class="cl-yl' + rz(4) + '">' + yourListHtml(M, rest) + '</div>';
    html += '</div>';
    host.innerHTML = html;
    placeNotify(host, M.rows.length);
    host._clM = M; host._clRest = rest;
    if (!host._clWired) { host._clWired = true; wire(host, { today: true }); }
    paint(host);
    host.querySelectorAll('.rise').forEach(function (n) { n.addEventListener('animationend', function () { n.classList.remove('rise'); }, { once: true }); });
    return true;
  }

  /* =====================================================================================
     LIFTERS (laptop): the list beside the lifter.
     ===================================================================================== */
  // The tabs (Check on · Meet soon · Pain · Quiet · All, each with its count; New this month or Wins as one more, with
  // an ×, while the rail chose it). One control for Lifters and Today's list: .cl-tabs. key → data-tab (All: '').
  function tabBtn(key, label, count, on, extra) {
    return '<button type="button" class="cl-tab' + (on ? ' on' : '') + (extra ? ' is-extra' : '') + '" role="tab" aria-selected="' + (on ? 'true' : 'false') + '" data-tab="' + esc(key || '') + '"' +
      (extra ? ' aria-label="' + esc(label + ', ' + count + '. Clear it') + '"' : '') + '><span>' + esc(label) + '</span><em>' + count + '</em>' + (extra ? ic('x', 2.2) : '') + '</button>';
  }
  function liftersTabsHtml(M) {
    var C = M.counts || clTabCounts(M.rows), v = M.view;
    var html = TABS.map(function (t) { return tabBtn(t.key, t.label, t.key ? C[t.key] : C.all, (v || null) === t.key); }).join('');
    if (v && EXTRA_TABS[v]) html += tabBtn(v, EXTRA_TABS[v], C[v], true, true);
    return '<div class="cl-tabs" role="tablist" aria-label="Show">' + html + '</div>';
  }
  function deskHeadHtml(M) {
    var cal = typeof dkSetRMode === 'function' && typeof dsPaintCalendar === 'function';
    return '<header class="cl-head">' +
      '<div class="cl-hrow"><h1 class="cl-h1">Lifters<span class="cl-h1n">' + M.rows.length + '</span></h1>' +
        '<label class="cl-search">' + ic('search') + '<input class="cl-q" type="search" placeholder="Find a lifter" aria-label="Find a lifter" autocomplete="off" spellcheck="false" value="' + esc(S.q) + '"><kbd>/</kbd></label>' +
        (cal ? '<button type="button" class="cl-ibtn cl-calbtn" data-cal aria-label="Calendar: every block and meet" data-tip="The season: every block and meet">' + ic('cal') + '</button>' : '') + '</div>' +
      liftersTabsHtml(M) + '</header>';
  }
  // A row: the face (its ring is the lifter's lane, pain in coral), the name, one line, the 4-week strength change.
  // Inside a view the line answers the view's question (clViewLine). The whole line is the row's tooltip.
  function deskRowHtml(r, o, M) {
    var a = r.athlete, top = M ? clTopJob(r, M.jobs) : null, meetV = !!(M && M.view === 'meet' && r.meet);
    var n = meetV ? clMeetNumber(r) : clNumber(r), nUnit = meetV ? n.unit : (n.tone !== 'none' ? unit() : '');
    var line = (M && M.view && clViewLine(r, M.view)) || clLine(r, top);
    var ring = clRingOf(r), sel = o.sel === a.id;
    return '<button type="button" class="cl-row' + (sel ? ' is-sel' : '') + '" data-id="' + esc(a.id) + '" role="option" aria-selected="' + (sel ? 'true' : 'false') + '" tabindex="' + (sel ? '0' : '-1') + '" title="' + esc(a.name + ': ' + (meetV ? n.title + ' · ' : '') + line) + '">' +
      '<span class="cl-face' + (ring ? ' ring-' + ring : '') + '">' + avHtml(a) + '</span>' +
      '<span class="cl-main"><span class="cl-name">' + esc(a.name) + (r.live ? '<i class="cl-live" title="Training right now"></i>' : '') + '</span><span class="cl-line"><span class="cl-lt">' + esc(line) + '</span></span></span>' +
      '<span class="cl-end"><span class="cl-n t-' + n.tone + '" title="' + esc(n.title) + '"><b>' + esc(n.text) + '</b>' + (nUnit ? '<small>' + esc(nUnit) + '</small>' : '') + '</span></span></button>';
  }
  function deskGroupsHtml(M) {
    if (!M.groups.length) {
      if (S.q) {
        var all = M.rows.filter(function (r) { return String(r.athlete.name).toLowerCase().indexOf(S.q.toLowerCase()) >= 0; }).length;
        return '<p class="cl-none">No one called “' + esc(S.q) + '”' + (M.view ? ' here' : '') + (M.view && all ? '. <button type="button" class="cl-link" data-tab="">Search everyone (' + all + ')</button>' : '') + '</p>';
      }
      return '<p class="cl-none">' + (M.view === 'pain' ? 'Nobody in pain.' : M.view === 'quiet' ? 'Nobody quiet for a week.' : M.view === 'meet' ? 'No meets in the next 8 weeks.' : M.view === 'check' ? 'Nobody to check on.' : 'No lifters here.') + '</p>';
    }
    return M.groups.map(function (g) {
      return '<div class="cl-grp">' + (g.title ? '<h2 class="cl-gh">' + esc(g.title) + ' <span>' + g.rows.length + '</span></h2>' : '') +
        '<div class="cl-list">' + g.rows.map(function (r) { return deskRowHtml(r, { sel: S.sel }, M); }).join('') + '</div></div>';
    }).join('');
  }
  /* A view's picture, small, at the top of its list: the faces on one track. Meet soon: the next 8 weeks, each face at
     its meet. Quiet: days since the last session. Pain: the score out of 10 (a check-in with no score sits at its own
     mark, before 0). Faces that would touch step up a tier; past two tiers they fold into "+n". */
  function trackHtml(o) {
    var W = 320, face = 26, marks = o.marks.slice().sort(function (a, b) { return a.x - b.x; });
    var placed = [], tiers = [-1e9, -1e9];
    marks.forEach(function (m) {
      var px = m.x * W, t = px - tiers[0] >= face + 2 ? 0 : px - tiers[1] >= face + 2 ? 1 : -1;
      if (t < 0) { var last = placed[placed.length - 1]; if (last) { last.more = (last.more || 0) + 1; last.title += ', ' + m.title; } return; }
      tiers[t] = px; placed.push({ m: m, t: t, title: m.title, more: 0 });
    });
    var ticks = (o.ticks || []).map(function (x) { return '<i class="cl-tk" style="--x:' + x.toFixed(4) + '"></i>'; }).join('');
    var zone = o.zone ? '<i class="cl-tz" style="--x0:' + o.zone[0].toFixed(4) + ';--x1:' + o.zone[1].toFixed(4) + '"></i>' : '';
    var faces = placed.map(function (p) {
      return '<button type="button" class="cl-tm t' + p.t + (o.tone ? ' is-' + o.tone : '') + '" style="--x:' + p.m.x.toFixed(4) + '" data-pick="' + esc(p.m.r.athlete.id) + '" title="' + esc(p.title) + '" aria-label="' + esc(p.title) + '">' +
        avHtml(p.m.r.athlete) + (p.more ? '<em>+' + p.more + '</em>' : '') + '</button>';
    }).join('');
    return '<div class="cl-trk' + (o.tone ? ' is-' + o.tone : '') + '"><div class="cl-trk-rail">' + zone + ticks + '</div>' + faces + '</div>' +
      '<div class="cl-trk-x">' + o.labels.map(function (l) { return '<span style="--x:' + l[0].toFixed(4) + '">' + esc(l[1]) + '</span>'; }).join('') + '</div>';
  }
  function viewPicHtml(M) {
    var v = M.view, rows = M.inView || [];
    if (!rows.length || (v !== 'meet' && v !== 'pain' && v !== 'quiet')) return '';
    var head, body, aria;
    if (v === 'meet') {
      var meets = {}; rows.forEach(function (r) { if (r.meet) meets[String(r.meet.meet.name || '').toLowerCase() + String(r.meet.meet.date || '')] = 1; });
      var nm = Object.keys(meets).length, first0 = rows.slice().sort(function (a, b) { return a.meet.days - b.meet.days; })[0];
      head = '<b>' + rows.length + '</b><span>with a meet in 8 weeks · ' + plural(nm, 'meet') + '</span>';
      body = trackHtml({ tone: 'meet', marks: rows.map(function (r) { return { x: Math.min(56, Math.max(0, r.meet.days)) / 56, r: r, title: r.athlete.name + ': ' + (r.meet.meet.name || 'Meet') + ', ' + daysText(r.meet.days) }; }),
        ticks: [1, 2, 3, 4, 5, 6, 7].map(function (w) { return w / 8; }), labels: [[0, 'Today'], [0.5, '4 weeks'], [1, '8 weeks']] });
      aria = rows.length + ' lifters with a meet in the next 8 weeks. Next: ' + (first0.meet.meet.name || 'Meet') + ' ' + daysText(first0.meet.days);
    } else if (v === 'pain') {
      var worst = null;
      var marks = rows.map(function (r) {
        var pb = painBits(r.status || {}), sev = pb && pb.sev != null ? Number(pb.sev) : null;
        if (sev != null && (!worst || sev > worst.sev)) worst = { sev: sev, pb: pb, r: r };
        return { x: sev == null ? 0 : 0.12 + 0.88 * sev / 10, r: r, title: r.athlete.name + ': ' + (pb ? pb.part + (sev != null ? ' ' + sev + '/10' : '') : 'pain on the check-in') };
      });
      head = '<b>' + rows.length + '</b><span>in pain' + (worst ? ' · worst ' + esc(worst.pb.part.toLowerCase()) + ' ' + worst.sev + '/10' : '') + '</span>';
      body = trackHtml({ tone: 'pain', marks: marks, zone: [0.12 + 0.88 * 0.7, 1], ticks: [0.12, 0.12 + 0.88 * 0.5], labels: [[0, 'Check-in'], [0.12 + 0.88 * 0.5, '5'], [0.12 + 0.88 * 0.7, '7'], [1, '10']] });
      aria = rows.length + ' in pain';
    } else {
      var X = function (r) { var a = r.status.ago; return a == null ? 1 : Math.min(21, a) / 21 * 0.88; };
      head = '<b>' + rows.length + '</b><span>quiet a week or more</span>';
      body = trackHtml({ tone: 'quiet', marks: rows.map(function (r) { return { x: X(r), r: r, title: r.athlete.name + ': ' + (r.status.ago == null ? 'no sets logged yet' : 'last trained ' + plural(r.status.ago, 'day') + ' ago') }; }),
        zone: [7 / 21 * 0.88, 0.88], ticks: [7 / 21 * 0.88, 14 / 21 * 0.88, 0.88], labels: [[0, 'Today'], [7 / 21 * 0.88, '7 days'], [14 / 21 * 0.88, '14 days'], [1, 'Never']] });
      aria = rows.length + ' quiet for a week or more';
    }
    return '<div class="cl-vpic is-' + v + '" role="group" aria-label="' + esc(aria) + '"><p class="cl-vp-h">' + head + '</p>' + body + '</div>';
  }
  // New lifters on the laptop: one slim row at the top of the list ("2 new lifters waiting · Jonas, Mia ›"). One
  // application opens its sheet straight away (clients-ui.js openLead); more, or a join request, open them as a list
  // (coach.html newLiftersSheet: the same rows the phone shows, each line held to two). coach.html fillNewLifters
  // draws it into .nl-slot, now and whenever the join requests come in.
  function newLiftersRowHtml(reqs, apps) {
    reqs = reqs || []; apps = apps || [];
    var n = reqs.length + apps.length;
    if (!n) return '';
    var names = apps.map(function (a) { return a.name || 'Someone'; }).concat(reqs.map(function (q) { return q.athleteName || 'A lifter'; }));
    var faces = names.slice(0, 3).map(function (nm) { return avHtml({ name: nm }); }).join('');
    var what = !reqs.length ? plural(apps.length, 'new lifter') + ' waiting' : !apps.length ? plural(reqs.length, 'join request') : n + ' new lifters waiting';
    return '<button type="button" class="cl-newl" data-newl aria-label="' + esc(what + ': ' + names.join(', ') + '. Read them') + '">' +
      '<span class="cl-stack">' + faces + '</span><span class="cl-newl-t"><b>' + esc(what) + '</b><span> · ' + esc(namesList(names.map(first), 3)) + '</span></span>' + ic('chev', 2.2) + '</button>';
  }
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
    wrap.innerHTML = '<div class="cl-side">' + deskHeadHtml(M) +
      '<div class="cl-scroll">' +
        // New lifters (coach.html fillNewLifters: applications and join requests, night C review M5): one row, on top.
        '<div class="nl-slot"></div>' +
        '<div class="cl-vslot">' + viewPicHtml(M) + '</div>' +
        '<div class="cl-groups" role="listbox" aria-label="Lifters">' + deskGroupsHtml(M) + '</div></div></div>' +
      '<div class="cl-page" id="clPage"></div>';
    area.appendChild(wrap);
    if (typeof fillNewLifters === 'function') { try { fillNewLifters(wrap.querySelector('.nl-slot')); } catch (e) {} }
    wrap._clM = M;
    wire(wrap, { desk: true });
    paint(wrap);
    paintPage(wrap, true);
    if (!S.keysOn) { S.keysOn = true; document.addEventListener('keydown', onKey, true); }
  }
  // A tab (or the rail's view) chosen on Lifters: the address says it (#roster?view=pain), the list and its picture
  // redraw, and the lifter stays on the page while they are in the new list (else the list's first).
  function setView(key) {
    key = key || null;
    var wrap = document.querySelector('#rosterArea .cl-desk');
    if (typeof _dk === 'undefined' || !wrap) { if (typeof deskGo === 'function') deskGo('roster', { view: key }); return; }
    _dk.view = key;
    if (typeof dkSetHash === 'function') dkSetHash('roster', {});
    var M = model();
    wrap._clM = M;
    var ids = []; M.groups.forEach(function (g) { g.rows.forEach(function (r) { ids.push(r.athlete.id); }); });
    S.order = ids;
    var keep = S.sel && ids.indexOf(S.sel) >= 0;
    if (!keep) S.sel = ids[0] || S.sel;
    var tabs = wrap.querySelector('.cl-head .cl-tabs'); if (tabs) tabs.outerHTML = liftersTabsHtml(M);
    var vs = wrap.querySelector('.cl-vslot'); if (vs) vs.innerHTML = viewPicHtml(M);
    var g = wrap.querySelector('.cl-groups'); if (g) g.innerHTML = deskGroupsHtml(M);
    var sc = wrap.querySelector('.cl-scroll'); if (sc) sc.scrollTop = 0;
    paint(wrap);
    paintPage(wrap, false);
    if (typeof dkPaintRail === 'function') { try { dkPaintRail(); } catch (e) {} }
  }
  function nextOf(id) {
    var ids = S.order || [], i = ids.indexOf(id);
    if (i < 0 || ids.length < 2) return null;
    var r = rowOf(ids[(i + 1) % ids.length]);
    return r ? { id: r.athlete.id, name: r.athlete.name } : null;
  }
  function paintPage(wrap, firstPaint) {
    var host = wrap.querySelector('#clPage'); if (!host) return;
    var r = S.sel ? rowOf(S.sel) : null;
    if (!r) { host.innerHTML = '<p class="cl-none">Pick a lifter</p>'; return; }
    var P = summaryHtml(r, wrap._clM, { rise: !!firstPaint, desk: true, view: wrap._clM ? wrap._clM.view : null, next: nextOf(r.athlete.id) });
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
    // The coach's work leads (owner, 27 Oct): Do first, then everyone in their groups. Money owed and
    // the team's week (the four tiles, under the same "This week" title as the laptop's Today) follow.
    // Do first has one red: the most urgent job's fix, full width under its words. The others keep their
    // fix one tap away as a small graphite button at the row's end ("Message", "Reply"), so the card reads
    // as a list with one action, not three stacked pills (phone polish, 27 Oct).
    var list = '<div class="cl-pcol">' +
      (urgent.length ? '<h2 class="cl-gh cl-gh-do">Do first <span>' + urgent.length + '</span></h2><div class="cl-do is-phone">' + urgent.map(function (it, i) { return jobHtml(it, { big: true, red: i === 0 && !wide, icon: i > 0 || wide, short: true, phone: true }); }).join('') + '</div>' : '') +

      (M.rows.length > 8 ? '<label class="cl-search cl-search-ph">' + ic('search') + '<input class="cl-q" type="search" placeholder="Find a lifter" aria-label="Find a lifter" autocomplete="off" spellcheck="false" value="' + esc(S.q) + '"></label>' : '') +
      '<div class="cl-groups">' + groupsHtml(M, { phone: !wide, sel: wide ? S.sel : null }) + '</div>' +
      (window.ClientsUI ? ClientsUI.dueLineHtml() : '') + PN_SPOT +
      '<div class="cl-pweek"><div class="cl-gh-row"><h2 class="cl-gh">This week</h2>' + (window.CoachReportUI ? CoachReportUI.entryHtml() : '') + '</div>' +
        teamTilesHtml(clTeam(M.rows, { today: todayIso() }), { compact: true }) + '</div></div>';
    wrap.innerHTML = wide ? list + '<div class="cl-wpage" id="clWidePage"></div>' : list;
    placeNotify(wrap, M.rows.length);
    wrap._clM = M;
    wire(wrap, { desk: false, wide: wide });
    area.appendChild(wrap);
    paint(wrap);
    // The tab's entrance (coach-ui.css, body.screen-enter): the cards and rows rise in reading order,
    // 40 ms apart, capped so the last ones don't wait.
    wrap.querySelectorAll('.cl-do > .cl-job, .cl-list > .cl-row, .cs-dueline, .cl-pweek .cl-tile').forEach(function (n, i) { n.style.setProperty('--i', String(Math.min(i, 9))); });
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
    // The iPhone app's lifter card (coach-app.js, 28 Oct) draws the pushed page when it is loaded.
    if (window.CoachApp && CoachApp.renderLifter) { CoachApp.renderLifter(host, r.athlete.id); return; }
    var M = model();
    // No staggered rise inside: the page pushes in from the right as one piece (coach-ui.css, the
    // phone's push), and a refresh after a fix repaints in place instead of replaying an entrance.
    var P = summaryHtml(r, M, { phone: true, rise: false });
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
      // Lifters' tabs (a saved view each), Today's list tabs, and the cards that open Lifters on a tab.
      if ((b = t.closest('[data-tab]'))) {
        e.preventDefault();
        var tk = b.getAttribute('data-tab') || null;
        if (o.today) { S.yl = tk; S.ylAll = false; paintYourList(host); }
        else if (b.classList.contains('is-extra')) setView(null);
        else setView(tk);
        return;
      }
      if ((b = t.closest('[data-newl]'))) { e.preventDefault(); if (typeof openNewLifters === 'function') openNewLifters(); return; }
      if ((b = t.closest('[data-pick]'))) { e.preventDefault(); var pk0 = b.getAttribute('data-pick'); if (o.desk) select(pk0); else open(pk0); return; }
      if ((b = t.closest('[data-next]'))) { e.preventDefault(); select(b.getAttribute('data-next'), { key: false }); return; }
      if ((b = t.closest('[data-biz]'))) { e.preventDefault(); bizGo(b.getAttribute('data-biz')); return; }
      if ((b = t.closest('[data-season-all]'))) { e.preventDefault(); openSeason(); return; }
      if ((b = t.closest('[data-ylmore]'))) { e.preventDefault(); S.ylAll = true; paintYourList(host); return; }
      if ((b = t.closest('[data-fix]'))) {
        e.preventDefault();
        var it = jobByKey(b, b.getAttribute('data-fix'));
        if (!it) return;
        run(it.r || (it.rows && it.rows[0]), fixForJob(it), b);
        return;
      }
      if ((b = t.closest('[data-more]'))) { e.preventDefault(); var col = b.closest('.cl-col'); if (col) { col.classList.add('is-open'); b.remove(); } return; }
      if ((b = t.closest('[data-wn-queue]'))) { e.preventDefault(); if (window.WeeklyNote) WeeklyNote.openQueue(); return; }
      if ((b = t.closest('[data-mr-open]'))) { e.preventDefault(); if (window.CoachReportUI) CoachReportUI.open(); return; }
      if ((b = t.closest('[data-wn-one]'))) { e.preventDefault(); if (window.WeeklyNote) WeeklyNote.openSheet(b.getAttribute('data-wn-one'), { onSent: refresh }); return; }
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
      if ((b = t.closest('[data-busy-keep]'))) {
        e.preventDefault();
        var pg0 = pageOf(host, b), P0 = pg0._P, tj = P0 && P0.top;
        if (tj && tj.type === 'busy' && tj.info && window.BusyWeek) BusyWeek.decline(tj.info.req);
        return;
      }
      if ((b = t.closest('[data-reply]'))) { e.preventDefault(); var pr = pageOf(host, b)._r; if (pr) message(pr, ''); return; }
      if ((b = t.closest('[data-prog]'))) { e.preventDefault(); var pp = pageOf(host, b)._r; if (pp && typeof openAthleteProgram === 'function') openAthleteProgram(pp.athlete.id); return; }
      if ((b = t.closest('[data-blocks]'))) { e.preventDefault(); var pk = pageOf(host, b)._r; if (pk && window.BlockDNA) BlockDNA.open(pk.athlete.id, { from: b }); return; }
      if ((b = t.closest('[data-go="all"]'))) { e.preventDefault(); var pa = pageOf(host, b)._r; if (pa) openAll(pa.athlete.id); return; }
      if ((b = t.closest('[data-career]'))) { e.preventDefault(); var pc = pageOf(host, b)._r; if (pc && window.Career) Career.openForCoach(pc.athlete.id, pc.athlete); return; }
      if ((b = t.closest('[data-card]'))) { e.preventDefault(); if (typeof dkOpenCard === 'function') dkOpenCard(b.dataset.card); return; }
      if ((b = t.closest('[data-view-off]'))) { e.preventDefault(); if (typeof deskGo === 'function') deskGo('roster', { view: null }); return; }
      if ((b = t.closest('[data-cal]'))) { e.preventDefault(); if (typeof dkSetRMode === 'function') dkSetRMode('calendar'); return; }
      // Last, so a name or a face inside a card keeps its own click: Today's cards and lanes open Lifters on the tab
      // that holds their people (data-golist: a view key, empty for All).
      if ((b = t.closest('[data-golist]'))) { e.preventDefault(); var gv = b.getAttribute('data-golist') || null; if (typeof deskGo === 'function') deskGo('roster', { view: gv }); return; }
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
    g.innerHTML = o.desk ? deskGroupsHtml(M) : groupsHtml(M, o.wide ? { sel: S.sel } : { phone: true });
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
    // The phone's Home (coach-app.js) and Programs redraw after a fix, like the roster.
    if (window.CoachApp && CoachApp.refresh && CoachApp.refresh()) return;
    if (typeof renderRoster === 'function') renderRoster();
  }
  function offDesk() { S.deskOn = false; }
  // The desk rail's Today count: the jobs still open, the same number as Today's header.
  function openCount() {
    try { var R = rowsNow(true), dm = doneMap(R.q); return clJobs(R.rows, { today: todayIso(), done: dm, toWrite: toWriteOf(R.rows, dm), busy: busyOf(R.rows) }).filter(function (it) { return !it.done; }).length; } catch (e) { return null; }
  }

  window.CoachLifters = { model: model, renderToday: renderToday, renderDesk: renderDesk, renderPhone: renderPhone, renderPane: renderPane, open: open, select: select, refresh: refresh, offDesk: offDesk, openCount: openCount,
    teamTilesHtml: teamTilesHtml, paint: paint,
    // for the iPhone app's screens (coach-app.js): a job's fix and running it, a message, a lifter's data and charts
    fixForJob: fixForJob, shortLabel: shortLabel, runFix: run, message: message, clLifter: clLifter, chartsHtml: chartsHtml, rowOf: rowOf, selected: function () { return S.sel; },
    clRing: clRing, clTier: clTier, clJobs: clJobs, clTopJob: clTopJob, clTeam: clTeam, clWeeks: clWeeks, clEffort: clEffort, clBw: clBw,
    clGroups: clGroups, clGroupKey: clGroupKey, clLine: clLine, clNumber: clNumber, clWords: clWords, jobText: jobText, toWriteOf: toWriteOf,
    // the desk, v3 (2 Nov): Lifters' tabs and views, New lifters' row, the team's lanes and season, the business line
    setView: setView, newLiftersRowHtml: newLiftersRowHtml, clTabCounts: clTabCounts, clViewLine: clViewLine, clMeetNumber: clMeetNumber, clLanes: clLanes, clLaneKey: clLaneKey, clRingOf: clRingOf,
    clSeason: clSeason, clBusiness: clBusiness };
})();
