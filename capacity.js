/* capacity.js: the coach's capacity check (2026-10-28).
   "How many more lifters can I take?" The coach enters their hours a week; the app counts the work each
   lifter makes from the coach's own last four weeks (a week written per lifter with a block, messages sent,
   form checks answered, check-ins read, weekly notes) at the minutes each task takes (the coach can change
   every one) and answers in lifters: "About 24 min per lifter a week. With 10 h a week you can coach about
   25 lifters, 5 more than now."
     capacitySignals(input)   the work per lifter per week, from the Store / the server's message tally (pure)
     capacityEstimate(input)  minutes per lifter, lifters that fit, +5 / +10 / +20, where the time goes,
                              what each time-saver gives back (pure)
     CapacityUI.renderPhone(host) / renderDesk(panel)   You › Capacity on the phone, Settings › Plan & seats
   Settings: CoachSettings.get('capacity') / set('capacity', { hours, minutes }), one JSON object per coach.
   Until app.js has the real CoachSettings (a coach_settings table), the shim below keeps the same key and
   shape in localStorage ('powa-coach-settings-<coachId>'); the demo keeps it in memory.
   Unit-tested: tests.html "capacity (capacity.js)". */
(function () {
  'use strict';

  var DEFAULT_MINUTES = { program: 10, message: 2, formCheck: 6, checkin: 2, note: 3 };
  // A lifter as most online coaches describe one: a week written, three messages, a form check every other
  // week, a check-in and a weekly note. The estimate leans on it only where the coach has no history yet.
  var TYPICAL = { program: 1, messages: 3, formChecks: 0.5, checkins: 1, notes: 1 };
  var DEMO_HOURS = 10, DEFAULT_HOURS = 10, MAX_TASK_MIN = 120, MAX_HOURS = 168, WEEKS = 4;
  var ADDS = [5, 10, 20];
  // rate: the per-lifter-week count (perLifterWeek); min: its minutes (minutes).
  var TASKS = [
    { key: 'program', rate: 'program', min: 'program', label: 'Writing next week', one: 'week written', many: 'weeks written' },
    { key: 'messages', rate: 'messages', min: 'message', label: 'Messages', one: 'message', many: 'messages' },
    { key: 'formChecks', rate: 'formChecks', min: 'formCheck', label: 'Form checks', one: 'form check', many: 'form checks' },
    { key: 'checkins', rate: 'checkins', min: 'checkin', label: 'Check-ins', one: 'check-in', many: 'check-ins' },
    { key: 'notes', rate: 'notes', min: 'note', label: 'Weekly notes', one: 'weekly note', many: 'weekly notes' }
  ];
  // What each time-saver gives back, from the coach's own minutes (the shares are this file's estimates):
  //   rules    progression rules write next week's loads; checking them takes about half the time
  //   notes    a drafted weekly note takes about a minute to read, tweak and send
  //   replies  the routine third of the messages goes out in a tap
  //   report   the Monday report puts everyone's week on one page: about half the time reading check-ins
  var SAVES = [
    { feature: 'rules', task: 'program', share: 0.5 },
    { feature: 'notes', task: 'notes', keep: 1 },
    { feature: 'replies', task: 'messages', share: 1 / 3 },
    { feature: 'report', task: 'checkins', share: 0.5 }
  ];

  function num(v) { var n = Number(v); return isFinite(n) ? n : NaN; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function d10(v) { return String(v == null ? '' : v).slice(0, 10); }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z')); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function monday(iso) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
  // Hours needed, up to the next half hour (the time it takes, never less).
  function ceilHalf(h) { return Math.ceil(h * 2 - 1e-9) / 2; }

  // The minutes per task: the defaults, then the coach's own (0 to 120 each).
  function minutesOf(m) {
    var out = {};
    Object.keys(DEFAULT_MINUTES).forEach(function (k) {
      var v = m && m[k] != null && m[k] !== '' ? num(m[k]) : NaN;
      out[k] = isFinite(v) ? clamp(v, 0, MAX_TASK_MIN) : DEFAULT_MINUTES[k];
    });
    return out;
  }
  function ratesOf(p) {
    var out = {};
    TASKS.forEach(function (t) { var v = p ? num(p[t.rate]) : NaN; out[t.rate] = isFinite(v) && v > 0 ? v : 0; });
    return out;
  }

  /* ---------------------------------------------------------------- the estimate (pure) */
  // input: { lifters (how many now), perLifterWeek: { program, messages, formChecks, checkins, notes },
  //   minutes: { program, message, formCheck, checkin, note } (defaults 10 / 2 / 6 / 2 / 3), hours (a week),
  //   seats (the plan's limit; 9999 or more = no limit; left out = say nothing about seats) }
  // → { minPerLifter (whole minutes), weekMinutes (the roster now), hours, capacity (lifters that fit, null
  //     when there's no work to go on), more (capacity − now), rows: [{ add, lifters, hours (to the half
  //     hour, up), over }], tasks: [{ key, label, count, each, perLifter }] biggest first, saves: [{ feature,
  //     minutes }] biggest first, minutes, seats: { limit, left } | null }
  function capacityEstimate(input) {
    input = input || {};
    var lifters = Math.max(0, Math.round(num(input.lifters) || 0));
    var minutes = minutesOf(input.minutes), rates = ratesOf(input.perLifterWeek);
    var hours = clamp(num(input.hours) || 0, 0, MAX_HOURS);
    var raw = 0;
    var tasks = TASKS.map(function (t) {
      var each = minutes[t.min], count = rates[t.rate], v = count * each;
      raw += v;
      return { key: t.key, label: t.label, count: count, each: each, perLifter: r1(v) };
    }).filter(function (t) { return t.perLifter > 0; });
    tasks.sort(function (a, b) { return b.perLifter - a.perLifter; });
    var minPerLifter = Math.round(raw);
    // Whole minutes per task that add up to the big number (largest remainder): no 6.8 + 2.6 on screen.
    var floorSum = 0;
    tasks.forEach(function (t) { t.raw = t.count * t.each; t.shown = Math.floor(t.raw + 1e-9); floorSum += t.shown; });
    tasks.map(function (t, i) { return { i: i, rem: t.raw - t.shown }; })
      .sort(function (a, b) { return b.rem - a.rem || a.i - b.i; })
      .slice(0, Math.max(0, minPerLifter - floorSum)).forEach(function (x) { tasks[x.i].shown++; });
    tasks.forEach(function (t) { delete t.raw; });
    var capacity = minPerLifter > 0 ? Math.floor(hours * 60 / minPerLifter + 1e-9) : null;
    var rows = minPerLifter > 0 ? ADDS.map(function (add) {
      var need = (lifters + add) * minPerLifter;
      return { add: add, lifters: lifters + add, hours: ceilHalf(need / 60), over: need > hours * 60 + 1e-9 };
    }) : [];
    var total = {};
    TASKS.forEach(function (t) { total[t.key] = rates[t.rate] * lifters; });
    var saves = SAVES.map(function (s) {
      var task = TASKS.filter(function (t) { return t.key === s.task; })[0];
      var each = minutes[task.min], n = total[s.task];
      var v = s.keep != null ? n * Math.max(0, each - s.keep) : n * each * s.share;
      return { feature: s.feature, task: s.task, minutes: Math.round(v + 1e-9) };
    }).filter(function (s) { return s.minutes >= 1; });
    saves.sort(function (a, b) { return b.minutes - a.minutes; });
    var seats = null;
    if (input.seats != null && input.seats !== '') {
      var lim = num(input.seats);
      seats = !isFinite(lim) || lim >= 9999 ? { limit: null, left: null } : { limit: Math.max(0, Math.round(lim)), left: Math.max(0, Math.round(lim) - lifters) };
    }
    return { minPerLifter: minPerLifter, weekMinutes: lifters * minPerLifter, hours: hours, lifters: lifters, capacity: capacity,
      more: capacity == null ? null : capacity - lifters, rows: rows, tasks: tasks, saves: saves, minutes: minutes, seats: seats };
  }

  /* ---------------------------------------------------------------- the work per lifter (pure) */
  // input: { today, lifters: [{ id, hasProgram }], trained (anyone trained in the last 4 weeks),
  //   tally: { weeks, messages, notes, formChecks, checkins } (counts over `weeks`: the server's message
  //   tally on a real account, the demo's four weeks in the demo), formChecks: [{ coachReplyAt }],
  //   checkins: [{ athleteId, weekStart, createdAt }], checkinAnswers: [{ athleteId, period }],
  //   sessionNotes: [{ coachCommentAt }] }
  // → { perLifterWeek, typical: [keys that fell back to a typical lifter], weeks }
  // A week written per lifter with a block (one a week each is the job). Messages and notes need the tally
  // (a coach's device keeps one line per thread, not every message); a reply to a session note is a message.
  // Form checks answered and check-ins (one per lifter per week, however many answers) come from the device.
  function capacitySignals(input) {
    input = input || {};
    var list = (input.lifters || []).filter(function (a) { return a && a.id; });
    var n = list.length;
    if (!n) return { perLifterWeek: Object.assign({}, TYPICAL), typical: ['program', 'messages', 'formChecks', 'checkins', 'notes'], weeks: 0 };
    var today = isIso(d10(input.today)) ? d10(input.today) : new Date().toISOString().slice(0, 10);
    var since = addDays(today, -(WEEKS * 7 - 1));
    var inWin = function (d) { d = d10(d); return isIso(d) && d >= since && d <= today; };
    var tally = input.tally && typeof input.tally === 'object' ? input.tally : null;
    var tw = tally ? clamp(num(tally.weeks) || WEEKS, 1, WEEKS) : WEEKS;
    var has = function (k) { return !!tally && tally[k] != null && isFinite(num(tally[k])); };
    var history = !!input.trained || !!tally;
    var ids = {}; list.forEach(function (a) { ids[a.id] = 1; });
    var per = { program: list.filter(function (a) { return a.hasProgram; }).length / n };
    var typical = [];
    var fallback = function (k) { per[k] = TYPICAL[k]; typical.push(k); };
    // Messages and weekly notes: the tally (plus replies to session notes), or a typical lifter.
    var replies = (input.sessionNotes || []).filter(function (x) { return x && x.coachCommentAt && inWin(x.coachCommentAt); }).length;
    if (has('messages')) per.messages = Math.max(0, num(tally.messages)) / (n * tw) + replies / (n * WEEKS); else fallback('messages');
    // Form checks answered.
    if (has('formChecks')) per.formChecks = Math.max(0, num(tally.formChecks)) / (n * tw);
    else if (history) per.formChecks = (input.formChecks || []).filter(function (f) { return f && f.coachReplyAt && inWin(f.coachReplyAt); }).length / (n * WEEKS);
    else fallback('formChecks');
    // Check-ins: a lifter's week with any check-in counts once (seven daily answers are one read).
    if (has('checkins')) per.checkins = Math.max(0, num(tally.checkins)) / (n * tw);
    else if (history) {
      var weeks = {};
      (input.checkins || []).forEach(function (c) {
        if (!c || !ids[c.athleteId]) return;
        var d = isIso(d10(c.createdAt)) ? d10(c.createdAt) : d10(c.weekStart);
        if (!inWin(d)) return;
        weeks[c.athleteId + '|' + monday(isIso(d10(c.weekStart)) ? d10(c.weekStart) : d)] = 1;
      });
      (input.checkinAnswers || []).forEach(function (x) { if (x && ids[x.athleteId] && inWin(x.period)) weeks[x.athleteId + '|' + monday(d10(x.period))] = 1; });
      per.checkins = Object.keys(weeks).length / (n * WEEKS);
    } else fallback('checkins');
    if (has('notes')) per.notes = Math.max(0, num(tally.notes)) / (n * tw); else fallback('notes');
    return { perLifterWeek: per, typical: typical, weeks: tally ? tw : WEEKS };
  }

  // How often, in words: "About 3 messages a lifter a week", "1 form check a lifter every 2 weeks".
  function countText(c, one, many) {
    c = Number(c) || 0;
    if (c >= 1.5) return 'About ' + Math.round(c) + ' ' + many + ' a lifter a week';
    if (c >= 0.75) return 'About 1 ' + one + ' a lifter a week';
    if (c >= 0.35) return '1 ' + one + ' a lifter every 2 weeks';
    if (c >= 0.15) return '1 ' + one + ' a lifter a month';
    return 'Now and then';
  }

  var Capacity = { capacityEstimate: capacityEstimate, capacitySignals: capacitySignals, countText: countText, DEFAULT_MINUTES: DEFAULT_MINUTES, TYPICAL: TYPICAL,
    TASKS: TASKS, DEMO_HOURS: DEMO_HOURS, DEFAULT_HOURS: DEFAULT_HOURS, minutesOf: minutesOf };
  window.Capacity = Capacity;
  window.capacityEstimate = capacityEstimate;
  window.capacitySignals = capacitySignals;

  /* ================================================================ the coach's settings (shim) */
  // app.js's CoachSettings (a coach_settings table) takes over when it lands: same key, same shape.
  // Until then: one JSON object per coach in localStorage, keyed by top-level names; the demo, memory.
  if (!window.CoachSettings) {
    window.CoachSettings = (function () {
      var MEM = {};
      function cid() { try { if (typeof user !== 'undefined' && user && user.id) return user.id; } catch (e) {} return (window._user && window._user.id) || 'x'; }
      function key() { return 'powa-coach-settings-' + cid(); }
      function read() {
        if (window._demoMode) return MEM[cid()] || (MEM[cid()] = {});
        try { var o = JSON.parse(localStorage.getItem(key()) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
      }
      function write(o) {
        if (window._demoMode) { MEM[cid()] = o; return; }
        try { localStorage.setItem(key(), JSON.stringify(o)); } catch (e) {}
      }
      function copy(v) { return v == null ? null : JSON.parse(JSON.stringify(v)); }
      return {
        get: function (k) { var o = read(); return o[k] === undefined ? null : copy(o[k]); },
        set: function (k, v) { var o = read(); o[k] = copy(v); write(o); return Promise.resolve(true); }
      };
    })();
  }

  /* ================================================================ the screens (CapacityUI) */
  var IC = {
    gauge: '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.4-4.2"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    rules: '<path d="M4 17l5-5 4 3 7-7"/><path d="M15 8h5v5"/>',
    note: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12.5h7M9 16.5h5"/>',
    replies: '<path d="M20 11.5a7.8 7.8 0 0 1-11.4 6.9L4 20l1.5-4.3A7.8 7.8 0 1 1 20 11.5z"/><path d="M8.5 11.5h7"/>',
    report: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4M8 14h3M8 17h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function ic(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || IC.chev) + '</svg>'; }
  function esc(v) { return typeof escHtml === 'function' ? escHtml(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function inShell() { return typeof document !== 'undefined' && document.documentElement.classList.contains('native'); }
  function coachId() { try { if (typeof user !== 'undefined' && user && user.id) return user.id; } catch (e) {} return (window._user && window._user.id) || null; }
  function today() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function hoursText(h) { return (Math.round(h * 2) / 2) + ' h'; }
  // "40 min", "1 h 40 min", "2 h 15 min" (an hour or more to the nearest 5 minutes: it's an estimate).
  function minText(m) { m = Math.round(m); if (m < 60) return m + ' min'; m = Math.round(m / 5) * 5; var h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : ''); }
  function trimNum(v) { return String(Math.round(v * 10) / 10); }
  // The plan shows only where it already does (renderCoachYou's showPlan): always on the web, in the
  // iPhone app only once in-app purchase is live (Apple 3.1.1: never a plan that can't be bought there).
  function showPlan() { return !inShell() || !!window._iapReady; }

  var SAVER = {
    rules: { label: 'Progression rules', icon: 'rules' },
    notes: { label: 'Weekly note drafts', icon: 'note' },
    replies: { label: 'Saved replies', icon: 'replies' },
    report: { label: 'Monday report', icon: 'report' }
  };
  // Each time-saver opens its feature. Progression rules and the Monday report show once their screens
  // exist (window.ProgressionRules / window.MondayReport, or Capacity.registerSaver(key, open)).
  var OPENERS = {};
  function opener(key) {
    if (OPENERS[key]) return OPENERS[key];
    if (key === 'notes' && window.WeeklyNote) return openNotes;
    if (key === 'replies' && window.WeeklyNote) return openReplies;
    var g = key === 'rules' ? window.ProgressionRules : key === 'report' ? window.MondayReport : null;
    if (g && typeof g.open === 'function') return function () { g.open(); };
    return null;
  }
  function openNotes() {
    var W = window.WeeklyNote;
    if (isDeskNow() && W.openQueue) { W.openQueue(); return; }
    var rows = typeof deskRows === 'function' ? deskRows() : [];
    var due = W.due ? W.due(rows, {}) : [];
    if (due.length && W.openSheet) { W.openSheet(due[0].athlete.id, {}); return; }
    if (typeof toast === 'function') toast('Everyone who trained has their note this week');
  }
  // Saved replies live in every message box: open Messages, where they're one tap from any thread.
  function openReplies() {
    if (isDeskNow() && typeof deskGo === 'function') deskGo('messages');
    else { var t = document.getElementById('tab-messages'); if (t) t.click(); }
    if (typeof toast === 'function') toast('Your saved replies are on the bookmark in any message box');
  }

  // Everything the screen says, from the Store and the coach's settings.
  function model() {
    var st = (window.Store && Store.get()) || {}, me = coachId(), t = today();
    var roster = (st.athletes || []).filter(function (a) { return a && a.id && a.id !== me && (!me || !a.coachId || a.coachId === me); });
    var withProg = {};
    (st.programs || []).forEach(function (p) { if (p && p.athleteId && (p.weeks || []).length) withProg[p.athleteId] = 1; });
    var ids = {}; roster.forEach(function (a) { ids[a.id] = 1; });
    var since = (function () { var d = new Date(t + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 27); return d.toISOString().slice(0, 10); })();
    var trained = (st.workoutLogs || []).some(function (l) { return l && ids[l.athleteId] && String(l.date) >= since && String(l.date) <= t; });
    var tally = st.coachTally || (window.DB && DB.threadTally) || null;
    var fc = []; try { if (typeof _coachFormChecks !== 'undefined' && Array.isArray(_coachFormChecks)) fc = _coachFormChecks; } catch (e) {}
    var sig = capacitySignals({ today: t, lifters: roster.map(function (a) { return { id: a.id, hasProgram: !!withProg[a.id] }; }), trained: trained, tally: tally,
      formChecks: fc, checkins: st.checkins, checkinAnswers: st.checkinAnswers, sessionNotes: st.sessionNotes });
    var saved = null;
    try { saved = window.CoachSettings && CoachSettings.get ? CoachSettings.get('capacity') : null; } catch (e) { saved = null; }
    if (saved && typeof saved.then === 'function') { saved.then(function () { refresh(); }).catch(function () {}); saved = null; }
    saved = saved && typeof saved === 'object' ? saved : {};
    var minutes = minutesOf(saved.minutes);
    var seats = showPlan() && typeof getCurrentTierLimit === 'function' ? getCurrentTierLimit() : null;
    var base = capacityEstimate({ lifters: roster.length, perLifterWeek: sig.perLifterWeek, minutes: minutes, hours: 0 });
    var hours = saved.hours != null && isFinite(Number(saved.hours)) ? Number(saved.hours)
      : (window._demoMode ? DEMO_HOURS : Math.max(DEFAULT_HOURS, Math.ceil(base.weekMinutes / 60)));
    var est = capacityEstimate({ lifters: roster.length, perLifterWeek: sig.perLifterWeek, minutes: minutes, hours: hours, seats: seats });
    var canInvite = est.more != null && est.more >= 1 && (typeof canAddAthlete !== 'function' || !me || canAddAthlete(me));
    return { est: est, sig: sig, hours: hours, minutes: minutes, n: roster.length, canInvite: canInvite, waiting: !tally && !window._demoMode && !!roster.length };
  }
  function save(patch) {
    var cur = null;
    try { cur = CoachSettings.get('capacity'); } catch (e) {}
    if (!cur || typeof cur !== 'object' || typeof cur.then === 'function') cur = {};
    // The settings' shape: { hours, minutes: { program, message, formCheck, checkin, note } }, all five kept.
    var next = { hours: patch.hours != null ? patch.hours : cur.hours != null ? cur.hours : null, minutes: minutesOf(Object.assign({}, cur.minutes || {}, patch.minutes || {})) };
    try { var r = CoachSettings.set('capacity', next); if (r && typeof r.catch === 'function') r.catch(function () {}); } catch (e) {}
  }

  /* ---------- pieces ---------- */
  function subText(M) {
    if (!M.n) return 'A typical lifter, until yours train here';
    return 'From your last 4 weeks · ' + plural(M.n, 'lifter');
  }
  function sayHtml(M) {
    var e = M.est, h = '<b>' + esc(hoursText(e.hours)) + '</b>';
    if (e.capacity == null) return 'Nothing to measure in the last 4 weeks yet. Write a block or message a lifter and this fills in.';
    var lift = '<b>' + esc(plural(e.capacity, 'lifter')) + '</b>';
    if (!M.n) return 'With ' + h + ' a week you could coach about ' + lift + '.';
    if (e.more > 0) return 'With ' + h + ' a week you can coach about ' + lift + ', ' + e.more + ' more than now.';
    if (e.more === 0) return 'With ' + h + ' a week you can coach about ' + lift + ', the same as now.';
    return 'With ' + h + ' a week you can coach about ' + lift + ', <b class="cap-warn">' + (-e.more) + ' fewer than now</b>.';
  }
  function bigHtml(M) {
    var m = M.est.minPerLifter;
    return '<p class="cap-big"><span class="cap-about">About</span> <b>' + (m || '–') + '</b> <span class="cap-unit">min</span></p><p class="cap-per">per lifter a week</p>';
  }
  function rowsHtml(M) {
    var e = M.est;
    if (!e.rows.length) return '';
    return '<div class="cl-list cap-list cap-more" role="list">' + e.rows.map(function (r) {
      var extra = r.over ? Math.round((r.hours - e.hours) * 2) / 2 : 0;
      return '<div class="cap-row' + (r.over ? ' is-over' : '') + '" role="listitem"><span class="cap-rt">+' + r.add + ' lifters</span>' +
        '<span class="cap-rside"><span class="cap-rv">' + esc(hoursText(r.hours)) + ' a week</span>' + (r.over ? '<span class="cap-over">' + esc(hoursText(extra)) + ' over</span>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function timeHtml(M) {
    var e = M.est, tasks = e.tasks;
    if (!tasks.length) return '<div class="cl-list cap-list"><p class="cap-none">No work in the last 4 weeks yet.</p></div>';
    var max = tasks[0].perLifter || 1, typ = {};
    (M.sig.typical || []).forEach(function (k) { typ[k] = 1; });
    var meta = {}; TASKS.forEach(function (t) { meta[t.key] = t; });
    return '<div class="cl-list cap-list cap-time" role="list">' + tasks.map(function (t, i) {
      var m = meta[t.key], c = t.count;
      var withBlock = Math.round(c * M.n);
      var sub = (t.key === 'program' ? (c >= 0.995 || !M.n ? 'Each lifter with a block' : withBlock + ' of ' + M.n + ' lifters have a block') : countText(c, m.one, m.many)) + ' · ' + trimNum(t.each) + ' min each';
      if (typ[t.key]) sub = 'Typical lifter: ' + (t.key === 'program' ? 'a week to write' : countText(c, m.one, m.many).replace(/^About /, 'about ').replace(' a lifter', '')) + ' · ' + trimNum(t.each) + ' min each';
      return '<button type="button" class="cap-trow" role="listitem" data-cp="minutes" style="--s:' + Math.max(0.04, Math.round(t.perLifter / max * 1000) / 1000) + '" title="' + esc(t.label + ': ' + trimNum(t.perLifter) + ' min per lifter a week') + '">' +
        '<span class="cap-tl">' + esc(t.label) + '</span><span class="cap-tv">' + (t.shown ? esc(t.shown + ' min') : 'Under 1 min') + '</span>' +
        '<span class="cap-bar" aria-hidden="true"><i></i></span><span class="cap-ts">' + esc(sub) + '</span></button>';
    }).join('') + '</div>';
  }
  function savesHtml(M) {
    var list = M.est.saves.filter(function (s) { return opener(s.feature); });
    if (!list.length) return '';
    return '<h2 class="cl-gh cap-gh">Save time</h2><div class="cl-list cap-list cap-saves" role="list">' + list.map(function (s) {
      var sv = SAVER[s.feature] || { label: s.feature, icon: 'chev' };
      return '<button type="button" class="cap-srow" role="listitem" data-cp="save" data-k="' + esc(s.feature) + '"><span class="cap-sic">' + ic(sv.icon) + '</span>' +
        '<span class="cap-stx"><span class="cap-st">' + esc(sv.label) + '</span><span class="cap-sv">Saves about ' + esc(minText(s.minutes)) + ' a week</span></span><span class="cap-chev">' + ic('chev') + '</span></button>';
    }).join('') + '</div>';
  }
  function planHtml(M) {
    var s = M.est.seats;
    if (!s) return '';
    if (s.limit == null) return '<p class="cap-plan">Your plan: no limit on lifters</p>';
    return '<p class="cap-plan">Your plan: ' + esc(plural(s.limit, 'lifter')) + ' · ' + (s.left ? esc(plural(s.left, 'seat')) + ' left' : 'every seat in use') + '</p>';
  }
  function inviteHtml(M) { return M.canInvite ? '<button type="button" class="cl-btn red cap-invite" data-cp="invite">' + ic('plus') + 'Invite a lifter</button>' : ''; }

  /* ---------- the phone: You › Capacity ---------- */
  function renderPhone(host) {
    if (!host) return;
    var M = model();
    // The screen arrives with the app's push (coach.html data-nav): no second entrance inside it.
    var rz = function () { return ''; };
    host.innerHTML = '<div class="cl-root cap-root is-phone">' +
      '<header class="cap-head' + rz(0) + '"><h1 class="cl-h1">Capacity</h1><p class="cl-sub" data-cp-sub>' + esc(subText(M)) + '</p></header>' +
      '<div class="cap-hero' + rz(1) + '"><div data-cp-big>' + bigHtml(M) + '</div><p class="cap-say" data-cp-say>' + sayHtml(M) + '</p>' +
        '<div class="cap-hours"><span class="cap-hl" id="cpHoursL">Your hours a week</span><span data-cp-stepper></span></div>' +
        '<div data-cp-invite>' + inviteHtml(M) + '</div></div>' +
      '<div class="' + rz(2).trim() + '" data-cp-morewrap>' + (M.est.rows.length ? '<h2 class="cl-gh cap-gh">Taking on more</h2>' + rowsHtml(M) : '') + '</div>' +
      '<div class="cap-sec' + rz(3) + '"><h2 class="cl-gh cap-gh">Where the time goes<button type="button" class="cap-edit" data-cp="minutes">Change minutes</button></h2><div data-cp-time>' + timeHtml(M) + '</div></div>' +
      '<div class="cap-sec' + rz(4) + '" data-cp-saves>' + savesHtml(M) + '</div>' +
      '<div data-cp-plan>' + planHtml(M) + '</div>' +
    '</div>';
    mount(host, M);
    // A real account's messages arrive with the thread tally: fetch it once, then repaint.
    if (M.waiting && window.DB && DB.listThreadsForCoach && coachId() && !host._cpTally) {
      host._cpTally = true;
      DB.listThreadsForCoach(coachId()).then(function () { if (host.isConnected) paint(host); }).catch(function () {});
    }
  }

  /* ---------- the desk: Settings › Plan & seats ---------- */
  function renderDesk(panel) {
    if (!panel) return;
    var M = model();
    var box = document.createElement('div');
    box.className = 'cl-root cap-root is-desk';
    box.innerHTML = '<h3 class="cap-dh">Capacity <span data-cp-sub>' + esc(subText(M)) + '</span></h3>' +
      '<div class="cap-hero"><div class="cap-hl-col"><div data-cp-big>' + bigHtml(M) + '</div><p class="cap-say" data-cp-say>' + sayHtml(M) + '</p></div>' +
        '<div class="cap-hr-col"><div class="cap-hours"><span class="cap-hl" id="cpHoursL">Your hours a week</span><span data-cp-stepper></span></div><div data-cp-invite>' + inviteHtml(M) + '</div></div></div>' +
      '<div class="cap-dgrid"><div class="cap-dcol"><div data-cp-morewrap>' + (M.est.rows.length ? '<h2 class="cl-gh cap-gh">Taking on more</h2>' + rowsHtml(M) : '') + '</div>' +
          '<div class="cap-sec" data-cp-saves>' + savesHtml(M) + '</div></div>' +
        '<div class="cap-sec"><h2 class="cl-gh cap-gh">Where the time goes<button type="button" class="cap-edit" data-cp="minutes">Change minutes</button></h2><div data-cp-time>' + timeHtml(M) + '</div></div></div>';
    panel.appendChild(box);
    mount(box, M);
    if (M.waiting && window.DB && DB.listThreadsForCoach && coachId() && !DB.threadTally) {
      DB.listThreadsForCoach(coachId()).then(function () { if (box.isConnected) paint(box); }).catch(function () {});
    }
  }

  // The stepper (a live node, kept across repaints) and the clicks.
  function mount(root, M) {
    root._cpM = M;
    var slot = root.querySelector('[data-cp-stepper]');
    if (slot && typeof uiStepper === 'function') {
      var st = uiStepper({ value: M.hours, step: 1, min: 1, max: 80, label: 'hours a week', cls: 'cap-step',
        fmt: function (v) { return '<b>' + v + '</b><small>h</small>'; },
        onChange: function (v) { save({ hours: v }); paint(root); } });
      st.setAttribute('aria-labelledby', 'cpHoursL');
      slot.appendChild(st);
    }
    if (root._cpWired) return;
    root._cpWired = true;
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-cp]');
      if (!b || !root.contains(b)) return;
      var k = b.getAttribute('data-cp');
      if (k === 'minutes') { e.preventDefault(); openMinutes(root); }
      else if (k === 'invite') { e.preventDefault(); if (typeof openInviteModal === 'function') openInviteModal(); }
      else if (k === 'save') { e.preventDefault(); var f = opener(b.getAttribute('data-k')); if (f) f(); }
    });
  }
  // Repaint what the hours and minutes change; the stepper stays put (focus, hold-to-repeat).
  function paint(root) {
    if (!root) return;
    var M = model();
    root._cpM = M;
    var set = function (sel, html) { var n = root.querySelector(sel); if (n) n.innerHTML = html; };
    set('[data-cp-sub]', esc(subText(M)));
    set('[data-cp-big]', bigHtml(M));
    set('[data-cp-say]', sayHtml(M));
    set('[data-cp-invite]', inviteHtml(M));
    set('[data-cp-morewrap]', M.est.rows.length ? '<h2 class="cl-gh cap-gh">Taking on more</h2>' + rowsHtml(M) : '');
    set('[data-cp-time]', timeHtml(M));
    set('[data-cp-saves]', savesHtml(M));
    set('[data-cp-plan]', planHtml(M));
  }
  function refresh() {
    var a = document.getElementById('capacityArea');
    if (a && a.querySelector('.cap-root')) paint(a.querySelector('.cap-root').parentNode);
    document.querySelectorAll('.cap-root.is-desk').forEach(function (n) { paint(n); });
  }

  // How long each task takes: five steppers, saved as the coach changes them.
  function openMinutes(root) {
    if (typeof uiSheet !== 'function') return;
    var M = root._cpM || model();
    uiSheet('How long each takes', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Minutes for one of each, as you work. The estimate follows.'));
      var rows = TASKS.map(function (t) {
        var v = M.minutes[t.min];
        var row = el('div', { class: 'ui-row cap-mrow' });
        var main = el('span', { class: 'ui-row-main' });
        main.appendChild(el('span', { class: 'ui-row-title' }, t.label));
        main.appendChild(el('span', { class: 'ui-row-sub' }, t.key === 'program' ? 'One lifter’s week' : 'Each ' + t.one));
        row.appendChild(main);
        var stp = uiStepper({ value: v, step: 1, min: 0, max: MAX_TASK_MIN, label: t.label + ' minutes', cls: 'cap-step is-sm',
          fmt: function (n) { return '<b>' + n + '</b><small>min</small>'; },
          onChange: function (n) { var p = {}; p[t.min] = n; save({ minutes: p }); paint(root); } });
        row.appendChild(stp);
        return row;
      });
      sheet.appendChild(uiList(rows));
      var done = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Done');
      done.addEventListener('click', close);
      sheet.appendChild(done);
    }, { cls: 'cap-msheet' });
  }

  // You › Capacity's value: room left, in lifters.
  function rowValue() {
    try {
      var e = model().est;
      if (e.capacity == null) return '';
      if (e.more > 0) return e.more + ' more';
      if (e.more === 0) return 'Full';
      return (-e.more) + ' over';
    } catch (err) { return ''; }
  }
  function registerSaver(key, fn) { if (key && typeof fn === 'function') OPENERS[key] = fn; }

  window.CapacityUI = { renderPhone: renderPhone, renderDesk: renderDesk, refresh: refresh, rowValue: rowValue, registerSaver: registerSaver,
    ICON: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC.gauge + '</svg>' };
  Capacity.registerSaver = registerSaver;
})();
