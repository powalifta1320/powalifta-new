/* capacity.js: the coach's week (2026-10-28; the coaching standard, 2026-11-02).
   "Your coaching week" (You › Your coaching week on the phone, Settings › Plan & seats on the laptop): the hours
   the roster needs when every lifter gets the time they should from you, against the hours you have.
   The standard is one lifter's week from you: their training reviewed (10 min), next week written (15), three
   messages (2 each), a form check every other week (6), their check-in read (3) and a weekly note (3): 40 min.
   The coach changes any task's minutes; 0 leaves a task out. 20 lifters and 10 h: "13 h 20 min for 20 lifters
   at 40 min each. That's 3 h 20 min more than you set. At 10 h, 15 lifters get the full 40 min."
   What the coach actually gave over the last 4 weeks (the same tasks, counted, at the same minutes) is one quiet
   line, on a real account with real history only: never the demo's staged numbers.
     capacityEstimate(input)   the roster's hours, who gets the full time, +5 / +10 / +20, where the time goes,
                               what each time-saver gives back, the seats (pure)
     capacitySignals(input)    the work the coach did per lifter per week in the last 4 weeks (pure)
     measuredMinutes(input)    the quiet line's minutes, or null (pure)
     settingsOf(saved)         any saved version as { v: 2, hours, minutes } (pure)
     lineText(est) · durText(min) · oftenText(count)   the words (pure)
     CapacityUI.renderPhone(host) / renderDesk(panel)
   Settings: CoachSettings.get('capacity') / set('capacity', { v: 2, hours, minutes }), one JSON object per coach.
   Until app.js has the real CoachSettings (a coach_settings table), the shim below keeps the same key and
   shape in localStorage ('powa-coach-settings-<coachId>'); the demo keeps it in memory.
   Unit-tested: tests.html "capacity (capacity.js)". */
(function () {
  'use strict';

  // Minutes for one of each task (the coach changes any of them, 0 to 120).
  var DEFAULT_MINUTES = { review: 10, program: 15, message: 2, formCheck: 6, checkin: 3, note: 3 };
  // The coaching standard: one lifter's week from you. Their training reviewed and next week written, three
  // messages, a form check every other week, their check-in read and a weekly note: 40 min at the minutes above.
  var STANDARD = { review: 1, program: 1, messages: 3, formChecks: 0.5, checkins: 1, notes: 1 };
  // The first version (28 Oct) saved all five of its minutes, its defaults with them, and two defaults have
  // moved since (a week written 10 → 15, a check-in 2 → 3): a v1 setting still at its old default takes the new.
  var V1_DEFAULTS = { program: 10, checkin: 2 };
  var DEMO_HOURS = 15, DEFAULT_HOURS = 10, MAX_TASK_MIN = 120, MAX_HOURS = 168, WEEKS = 4;
  var ADDS = [5, 10, 20];
  // rate: the count per lifter a week (STANDARD, or what the coach did); min: its minutes. how: the task in the
  // coach's words (a task that comes round more or less than weekly says how often instead); unit: "one of each"
  // in the minutes sheet.
  var TASKS = [
    { key: 'review', rate: 'review', min: 'review', label: 'Reviewing their training', how: 'Their sets, RPE and notes against what you wrote', unit: 'One lifter’s week' },
    { key: 'program', rate: 'program', min: 'program', label: 'Writing next week', how: 'Their next week, from how this one went', unit: 'One lifter’s week' },
    { key: 'messages', rate: 'messages', min: 'message', label: 'Messages', unit: 'Each message' },
    { key: 'formChecks', rate: 'formChecks', min: 'formCheck', label: 'Form checks', unit: 'Each form check' },
    { key: 'checkins', rate: 'checkins', min: 'checkin', label: 'Check-in', how: 'Reading their weekly check-in', unit: 'Reading one' },
    { key: 'notes', rate: 'notes', min: 'note', label: 'Weekly note', how: 'A few lines on their week', unit: 'Writing one' }
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
  function esc(v) { return typeof escHtml === 'function' ? escHtml(String(v == null ? '' : v)) : String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  // The minutes per task: the defaults, then the coach's own (0 to 120 each).
  function minutesOf(m) {
    var out = {};
    Object.keys(DEFAULT_MINUTES).forEach(function (k) {
      var v = m && m[k] != null && m[k] !== '' ? num(m[k]) : NaN;
      out[k] = isFinite(v) ? clamp(v, 0, MAX_TASK_MIN) : DEFAULT_MINUTES[k];
    });
    return out;
  }
  // The counts per lifter a week: the standard, unless given (a part left out of what's given counts 0).
  function ratesOf(p) {
    var src = p && typeof p === 'object' ? p : STANDARD, out = {};
    TASKS.forEach(function (t) { var v = num(src[t.rate]); out[t.rate] = isFinite(v) && v > 0 ? v : 0; });
    return out;
  }

  /* ---------------------------------------------------------------- the estimate (pure) */
  // input: { lifters (how many now), minutes: { review, program, message, formCheck, checkin, note } (defaults
  //   10 / 15 / 2 / 6 / 3 / 3), hours (a week), perLifterWeek (the counts; left out = the standard), seats (the
  //   plan's limit; 9999 or more = no limit; left out = say nothing about seats) }
  // → { minPerLifter (one lifter's week from you, whole minutes), weekMinutes (the roster's week), minutesHave
  //     (your hours, in minutes), overMinutes, spareMinutes, hours, lifters, capacity (lifters who get the full
  //     time in your hours; null when every task is at 0), more (capacity − now), rows: [{ add, lifters, minutes,
  //     over (minutes past your hours) }], tasks: [{ key, label, count, each, perLifter, shown }] biggest first,
  //     saves: [{ feature, task, minutes (a week, across the roster) }] biggest first, minutes,
  //     seats: { limit, left } | null }
  function capacityEstimate(input) {
    input = input || {};
    var lifters = Math.max(0, Math.round(num(input.lifters) || 0));
    var minutes = minutesOf(input.minutes), rates = ratesOf(input.perLifterWeek);
    var hours = clamp(num(input.hours) || 0, 0, MAX_HOURS), have = Math.round(hours * 60);
    var raw = 0;
    var tasks = TASKS.map(function (t) {
      var each = minutes[t.min], count = rates[t.rate], v = count * each;
      raw += v;
      return { key: t.key, label: t.label, count: count, each: each, perLifter: r1(v) };
    }).filter(function (t) { return t.perLifter > 0; });
    tasks.sort(function (a, b) { return b.perLifter - a.perLifter; });
    var minPerLifter = Math.round(raw);
    // Whole minutes per task that add up to the standard (largest remainder): no 6.8 + 2.6 on screen.
    var floorSum = 0;
    tasks.forEach(function (t) { t.raw = t.count * t.each; t.shown = Math.floor(t.raw + 1e-9); floorSum += t.shown; });
    tasks.map(function (t, i) { return { i: i, rem: t.raw - t.shown }; })
      .sort(function (a, b) { return b.rem - a.rem || a.i - b.i; })
      .slice(0, Math.max(0, minPerLifter - floorSum)).forEach(function (x) { tasks[x.i].shown++; });
    tasks.forEach(function (t) { delete t.raw; });
    var weekMinutes = lifters * minPerLifter;
    var capacity = minPerLifter > 0 ? Math.floor(have / minPerLifter + 1e-9) : null;
    var rows = minPerLifter > 0 ? ADDS.map(function (add) {
      var need = (lifters + add) * minPerLifter;
      return { add: add, lifters: lifters + add, minutes: need, over: Math.max(0, need - have) };
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
    return { minPerLifter: minPerLifter, weekMinutes: weekMinutes, minutesHave: have, overMinutes: Math.max(0, weekMinutes - have),
      spareMinutes: Math.max(0, have - weekMinutes), hours: hours, lifters: lifters, capacity: capacity,
      more: capacity == null ? null : capacity - lifters, rows: rows, tasks: tasks, saves: saves, minutes: minutes, seats: seats };
  }

  /* ---------------------------------------------------------------- what the coach did (pure) */
  // input: { today, lifters: [{ id, hasProgram }], trained (anyone trained in the last 4 weeks),
  //   tally: { weeks, messages, notes, formChecks, checkins } (counts over `weeks`: the server's message tally on a
  //   real account, the demo's staged four weeks in the demo), logs: [{ athleteId, date }] (the roster's sets),
  //   formChecks: [{ coachReplyAt }], checkins: [{ athleteId, weekStart, createdAt }],
  //   checkinAnswers: [{ athleteId, period }], sessionNotes: [{ coachCommentAt }] }
  // → { perLifterWeek: { review, program, messages, formChecks, checkins, notes }, typical: [the parts nothing
  //     counted yet, standing in at the standard], weeks }
  // A week written per lifter with a block (one a week each is the job). Training reviewed: a lifter's week with
  // any logged set counts once, the way a check-in does (you read the week, not each set). Messages and notes
  // need the tally (a coach's device keeps one line per thread, not every message); a reply to a session note is
  // a message. Form checks answered and check-ins (one per lifter per week, however many answers) come from the
  // device.
  function capacitySignals(input) {
    input = input || {};
    var list = (input.lifters || []).filter(function (a) { return a && a.id; });
    var n = list.length;
    if (!n) return { perLifterWeek: Object.assign({}, STANDARD), typical: TASKS.map(function (t) { return t.rate; }), weeks: 0 };
    var today = isIso(d10(input.today)) ? d10(input.today) : new Date().toISOString().slice(0, 10);
    var since = addDays(today, -(WEEKS * 7 - 1));
    var inWin = function (d) { d = d10(d); return d >= since && d <= today && isIso(d); };
    var tally = input.tally && typeof input.tally === 'object' ? input.tally : null;
    var tw = tally ? clamp(num(tally.weeks) || WEEKS, 1, WEEKS) : WEEKS;
    var has = function (k) { return !!tally && tally[k] != null && isFinite(num(tally[k])); };
    var history = !!input.trained || !!tally;
    var ids = {}; list.forEach(function (a) { ids[a.id] = 1; });
    var per = { program: list.filter(function (a) { return a.hasProgram; }).length / n };
    var typical = [];
    var fallback = function (k) { per[k] = STANDARD[k]; typical.push(k); };
    // Training reviewed: the weeks each lifter logged anything.
    if (Array.isArray(input.logs)) {
      var trainedWeeks = {};
      input.logs.forEach(function (l) { if (l && ids[l.athleteId] && inWin(l.date)) trainedWeeks[l.athleteId + '|' + monday(d10(l.date))] = 1; });
      per.review = Object.keys(trainedWeeks).length / (n * WEEKS);
    } else fallback('review');
    // Messages and weekly notes: the tally (plus replies to session notes), or the standard.
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

  // The quiet line: what each lifter actually got from you a week over the last 4 weeks, at your minutes.
  // Only on a real account (never the demo's staged numbers), once someone trained here and the message tally
  // is in, with every part counted (nothing standing in at the standard). Under a minute says nothing.
  // input: { demo, lifters (how many), trained, tally, signals (capacitySignals), minutes } → whole minutes | null
  function measuredMinutes(input) {
    input = input || {};
    var sig = input.signals, n = Math.max(0, Math.round(num(input.lifters) || 0));
    if (input.demo || !n || !input.trained || !input.tally || typeof input.tally !== 'object') return null;
    if (!sig || !sig.perLifterWeek || (sig.typical || []).length) return null;
    var m = capacityEstimate({ lifters: n, perLifterWeek: sig.perLifterWeek, minutes: input.minutes }).minPerLifter;
    return m >= 1 ? m : null;
  }

  // The saved settings, any version, as { v: 2, hours (null = not set), minutes (all six) }.
  function settingsOf(saved) {
    var s = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    var m = s.minutes && typeof s.minutes === 'object' ? Object.assign({}, s.minutes) : {};
    if (!(num(s.v) >= 2)) Object.keys(V1_DEFAULTS).forEach(function (k) { if (m[k] != null && m[k] !== '' && num(m[k]) === V1_DEFAULTS[k]) delete m[k]; });
    var h = s.hours != null && s.hours !== '' && isFinite(num(s.hours)) ? clamp(num(s.hours), 0, MAX_HOURS) : null;
    return { v: 2, hours: h, minutes: minutesOf(m) };
  }

  /* ---------------------------------------------------------------- the words (pure) */
  // A duration the way a coach says it: "40 min", "2 h", "13 h 20 min". The roster's hours are exact sums; about:
  // an estimate (what a time-saver gives back, what you gave), an hour or more to the nearest 5 min.
  function durText(m, about) {
    m = Math.max(0, Math.round(Number(m) || 0));
    if (m < 60) return m + ' min';
    if (about) m = Math.round(m / 5) * 5;
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }
  // How often a task comes round for one lifter: "3 a week", "1 every 2 weeks".
  function oftenText(c) {
    c = Number(c) || 0;
    if (c >= 1.5) return Math.round(c) + ' a week';
    if (c >= 0.75) return '1 a week';
    if (c >= 0.35) return '1 every 2 weeks';
    if (c >= 0.15) return '1 a month';
    return 'Now and then';
  }
  // On screen a duration never breaks inside itself ("8 / min"): non-breaking spaces.
  function nbsp(s) { return String(s).replace(/ /g, ' '); }
  // The hero's one plain line: past your hours, room for more, or a full week. html: the numbers in <b>, and
  // each duration kept on one line.
  function lineText(e, html) {
    e = e || {};
    var dur = function (m) { return html ? nbsp(durText(m)) : durText(m); };
    var b = function (s) { return html ? '<b>' + esc(s) + '</b>' : s; };
    var std = e.minPerLifter, have = dur(e.minutesHave), full = dur(std);
    if (!std) return 'Every task is at 0 min. Change minutes to set how long each one takes you.';
    if (!e.lifters) return e.capacity ? 'Room for ' + b(plural(e.capacity, 'lifter')) + ' in your ' + have + '.' : 'One lifter needs ' + full + ', more than your ' + have + '.';
    if (e.overMinutes > 0) return 'That’s ' + b(dur(e.overMinutes)) + ' more than you set. At ' + have + ', ' +
      (e.capacity ? b(plural(e.capacity, 'lifter')) + (e.capacity === 1 ? ' gets' : ' get') : 'no lifter gets') + ' the full ' + full + '.';
    if (e.more > 0) return 'Room for ' + b(e.more + ' more ' + (e.more === 1 ? 'lifter' : 'lifters')) + ' at ' + full + (e.more === 1 ? '.' : ' each.');
    return 'That fills your ' + have + '.';
  }

  var Capacity = { capacityEstimate: capacityEstimate, capacitySignals: capacitySignals, measuredMinutes: measuredMinutes, settingsOf: settingsOf,
    lineText: lineText, durText: durText, oftenText: oftenText, DEFAULT_MINUTES: DEFAULT_MINUTES, STANDARD: STANDARD, TYPICAL: STANDARD,
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
  var TITLE = 'Your coaching week';
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
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function inShell() { return typeof document !== 'undefined' && document.documentElement.classList.contains('native'); }
  function coachId() { try { if (typeof user !== 'undefined' && user && user.id) return user.id; } catch (e) {} return (window._user && window._user.id) || null; }
  function today() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function trimNum(v) { return String(Math.round(v * 10) / 10); }
  // The plan shows only where it already does (renderCoachYou's showPlan): always on the web, in the
  // iPhone app only once in-app purchase is live (Apple 3.1.1: never a plan that can't be bought there).
  function showPlan() { return !inShell() || !!window._iapReady; }

  // Each time-saver says what it gives back as a sentence: "Progression rules give back about 2 h a week".
  var SAVER = {
    rules: { label: 'Progression rules', icon: 'rules', verb: 'give' },
    notes: { label: 'Weekly note drafts', icon: 'note', verb: 'give' },
    replies: { label: 'Saved replies', icon: 'replies', verb: 'give' },
    report: { label: 'Monday report', icon: 'report', verb: 'gives' }
  };
  // Each time-saver opens its feature. Progression rules and the Monday report show once their screens
  // exist (ProgressionUI / CoachReportUI, or Capacity.registerSaver(key, open)).
  var OPENERS = {};
  function opener(key) {
    if (OPENERS[key]) return OPENERS[key];
    if (key === 'notes' && window.WeeklyNote) return openNotes;
    if (key === 'replies' && window.WeeklyNote) return openReplies;
    var g = key === 'rules' ? (window.ProgressionRules || window.ProgressionUI) : key === 'report' ? (window.MondayReport || window.CoachReportUI) : null;
    if (g && typeof g.open === 'function') return function () { g.open(); };
    return null;
  }
  function openNotes() {
    var W = window.WeeklyNote;
    if (isDeskNow() && W.openQueue) { W.openQueue(); return; }
    var rows = typeof deskRows === 'function' && coachId() ? deskRows(coachId()) : [];   // the coach's own roster (deskRows filters by it)
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

  function readSettings() {
    var saved = null;
    try { saved = window.CoachSettings && CoachSettings.get ? CoachSettings.get('capacity') : null; } catch (e) { saved = null; }
    if (saved && typeof saved.then === 'function') { saved.then(function () { refresh(); }).catch(function () {}); saved = null; }
    return settingsOf(saved);
  }
  // Everything the screen says, from the Store and the coach's settings.
  function model() {
    var st = (window.Store && Store.get()) || {}, me = coachId(), t = today();
    var roster = (st.athletes || []).filter(function (a) { return a && a.id && a.id !== me && (!me || !a.coachId || a.coachId === me); });
    var withProg = {};
    (st.programs || []).forEach(function (p) { if (p && p.athleteId && (p.weeks || []).length) withProg[p.athleteId] = 1; });
    var ids = {}; roster.forEach(function (a) { ids[a.id] = 1; });
    var since = (function () { var d = new Date(t + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 27); return d.toISOString().slice(0, 10); })();
    var logs = st.workoutLogs || [];
    var trained = logs.some(function (l) { return l && ids[l.athleteId] && String(l.date) >= since && String(l.date) <= t; });
    var tally = st.coachTally || (window.DB && DB.threadTally) || null;
    var fc = []; try { if (typeof _coachFormChecks !== 'undefined' && Array.isArray(_coachFormChecks)) fc = _coachFormChecks; } catch (e) {}
    var demo = !!window._demoMode;
    var saved = readSettings(), minutes = saved.minutes;
    var seats = showPlan() && typeof getCurrentTierLimit === 'function' ? getCurrentTierLimit() : null;
    var base = capacityEstimate({ lifters: roster.length, minutes: minutes, hours: 0 });
    // Hours not set yet: the demo's believable 15 (twenty lifters at 40 min is 13 h 20 min), or what the roster
    // needs (10 at least), so nobody reads "more than you set" before they've set anything.
    var hours = saved.hours != null ? saved.hours : (demo ? DEMO_HOURS : Math.max(DEFAULT_HOURS, Math.ceil(base.weekMinutes / 60)));
    var est = capacityEstimate({ lifters: roster.length, minutes: minutes, hours: hours, seats: seats });
    // The quiet line is a real account's own history: the demo never works it out.
    var gave = null;
    if (!demo && roster.length && trained && tally) {
      var sig = capacitySignals({ today: t, lifters: roster.map(function (a) { return { id: a.id, hasProgram: !!withProg[a.id] }; }), trained: trained, tally: tally,
        logs: logs, formChecks: fc, checkins: st.checkins, checkinAnswers: st.checkinAnswers, sessionNotes: st.sessionNotes });
      gave = measuredMinutes({ demo: demo, lifters: roster.length, trained: trained, tally: tally, signals: sig, minutes: minutes });
    }
    var canInvite = est.more != null && est.more >= 1 && (typeof canAddAthlete !== 'function' || !me || canAddAthlete(me));
    return { est: est, hours: hours, minutes: minutes, n: roster.length, canInvite: canInvite, gave: gave, waiting: !tally && !demo && !!roster.length };
  }
  function save(patch) {
    var cur = null;
    try { cur = CoachSettings.get('capacity'); } catch (e) {}
    if (cur && typeof cur.then === 'function') cur = null;
    var s = settingsOf(cur);
    // The settings' shape: { v: 2, hours, minutes: { review, program, message, formCheck, checkin, note } }, all six kept.
    var next = { v: 2, hours: patch.hours != null ? patch.hours : s.hours, minutes: minutesOf(Object.assign({}, s.minutes, patch.minutes || {})) };
    try { var r = CoachSettings.set('capacity', next); if (r && typeof r.catch === 'function') r.catch(function () {}); } catch (e) {}
  }

  /* ---------- pieces ---------- */
  // "13 h 20 min": the numbers big, the units small (the spaces stay in the text, for reading aloud and copying).
  function bigNum(m) { return esc(durText(m)).replace(/(\d+) (h|min)/g, '<b>$1</b><span class="cap-unit"> $2</span>'); }
  // The hero: the hours the roster needs, what that's made of, the bar against your hours, one plain line.
  // Nobody yet: the standard itself, and the room your hours have.
  function heroHtml(M) {
    var e = M.est, std = e.minPerLifter;
    var per = M.n ? 'for ' + plural(M.n, 'lifter') + ' at ' + durText(std) + (M.n === 1 ? '' : ' each') : 'for each lifter, every week';
    return '<div class="cap-sum"><p class="cap-big">' + bigNum(M.n ? e.weekMinutes : std) + '</p><p class="cap-per">' + esc(per) + '</p>' +
      meterHtml(M) + '<p class="cap-say">' + lineText(e, true) + '</p></div>';
  }
  // One bar: the roster's week against your hours. Room: the ink fills your hours as far as the roster needs.
  // Past them: your hours in ink, the rest amber (the card's only colour), "Your 10 h" where your hours end.
  function meterHtml(M) {
    var e = M.est;
    if (!M.n || !e.minPerLifter) return '';
    var need = e.weekMinutes, have = e.minutesHave, top = Math.max(need, have, 1), over = need > have;
    var x = Math.round(have / top * 1000) / 1000, w = Math.round(Math.min(need, have) / top * 1000) / 1000;
    return '<div class="cap-meter' + (over ? ' is-over' : '') + '" role="img" aria-label="' + esc(durText(need) + ' needed of your ' + durText(have)) + '">' +
      '<span class="cap-mtrack"><i class="cap-mfill" style="--w:' + w + '"></i>' + (over ? '<i class="cap-mover" style="--l:' + x + '"></i>' : '') + '</span>' +
      '<span class="cap-mlab' + (x < 0.34 ? ' is-start' : '') + '" style="--x:' + x + '" aria-hidden="true"><span>' + esc('Your ' + durText(have)) + '</span></span></div>';
  }
  // +5 / +10 / +20 lifters: the week they'd make, and where that sits against your hours.
  function moreHtml(M) {
    var rows = M.est.rows, have = nbsp(durText(M.est.minutesHave));
    if (!rows.length) return '';
    return '<h2 class="cl-gh cap-gh">Taking on more</h2><div class="cl-list cap-list cap-more" role="list">' + rows.map(function (r) {
      return '<div class="cap-row' + (r.over ? ' is-over' : '') + '" role="listitem"><span class="cap-rt">+' + r.add + ' lifters</span>' +
        '<span class="cap-rv">' + esc(durText(r.minutes)) + '</span>' +
        '<span class="cap-rs">' + (r.over ? '<span class="cap-over">' + esc(nbsp(durText(r.over)) + ' over your ' + have) + '</span>' : esc('Within your ' + have)) + '</span></div>';
    }).join('') + '</div>';
  }
  // Where one lifter's week goes: a Screen Time list (task and minutes, a thin bar, what the task is).
  function timeHtml(M) {
    var tasks = M.est.tasks;
    if (!tasks.length) return '<div class="cl-list cap-list"><p class="cap-none">Every task is at 0 min.</p></div>';
    var max = tasks[0].perLifter || 1, meta = {};
    TASKS.forEach(function (t) { meta[t.key] = t; });
    return '<div class="cl-list cap-list cap-time" role="list">' + tasks.map(function (t) {
      var m = meta[t.key], sub = m.how || (oftenText(t.count) + ', ' + trimNum(t.each) + ' min each');
      return '<button type="button" class="cap-trow" role="listitem" data-cp="minutes" style="--s:' + Math.max(0.04, Math.round(t.perLifter / max * 1000) / 1000) + '" title="' + esc(t.label + ': ' + trimNum(t.perLifter) + ' min a lifter a week') + '">' +
        '<span class="cap-tl">' + esc(t.label) + '</span><span class="cap-tv">' + (t.shown ? esc(t.shown + ' min') : 'Under 1 min') + '</span>' +
        '<span class="cap-bar" aria-hidden="true"><i></i></span><span class="cap-ts">' + esc(sub) + '</span></button>';
    }).join('') + '</div>';
  }
  // What you actually gave: one quiet line, from a real account's own last 4 weeks.
  function wasHtml(M) { return M.gave ? '<p class="cap-was">Last 4 weeks you gave each lifter about ' + esc(nbsp(durText(M.gave, true))) + ' a week.</p>' : ''; }
  function savesHtml(M) {
    var list = M.est.saves.filter(function (s) { return opener(s.feature); });
    if (!list.length) return '';
    return '<h2 class="cl-gh cap-gh">Save time</h2><div class="cl-list cap-list cap-saves" role="list">' + list.map(function (s) {
      var sv = SAVER[s.feature] || { label: s.feature, icon: 'chev', verb: 'give' };
      return '<button type="button" class="cap-srow" role="listitem" data-cp="save" data-k="' + esc(s.feature) + '"><span class="cap-sic">' + ic(sv.icon) + '</span>' +
        '<span class="cap-stx"><span class="cap-st">' + esc(sv.label) + '</span> <span class="cap-sv">' + esc(nbsp(sv.verb + ' back') + ' about ' + nbsp(durText(s.minutes, true)) + ' a week') + '</span></span><span class="cap-chev">' + ic('chev') + '</span></button>';
    }).join('') + '</div>';
  }
  function planHtml(M) {
    var s = M.est.seats;
    if (!s) return '';
    if (s.limit == null) return '<p class="cap-plan">Your plan: no limit on lifters</p>';
    return '<p class="cap-plan">Your plan: ' + esc(plural(s.limit, 'lifter')) + ' · ' + (s.left ? esc(plural(s.left, 'seat')) + ' left' : 'every seat in use') + '</p>';
  }
  function inviteHtml(M) { return M.canInvite ? '<button type="button" class="cl-btn red cap-invite" data-cp="invite">' + ic('plus') + 'Invite a lifter</button>' : ''; }
  function editHead() { return '<h2 class="cl-gh cap-gh">Where the time goes<button type="button" class="cap-edit" data-cp="minutes">Change minutes</button></h2>'; }

  /* ---------- the phone: You › Your coaching week ---------- */
  function renderPhone(host) {
    if (!host) return;
    var M = model();
    // The screen arrives with the app's push (coach.html data-nav): no second entrance inside it.
    host.innerHTML = '<div class="cl-root cap-root is-phone">' +
      // The bar's folded title is the short one: the whole title runs into the Ask button there.
      '<header class="cap-head"><h1 class="cl-h1" data-nav-title="Coaching week">' + TITLE + '</h1></header>' +
      '<div class="cap-hero"><div data-cp-big>' + heroHtml(M) + '</div>' +
        '<div class="cap-hours"><span class="cap-hl" id="cpHoursL">Your hours a week</span><span data-cp-stepper></span></div>' +
        '<div data-cp-invite>' + inviteHtml(M) + '</div></div>' +
      '<div class="cap-sec">' + editHead() + '<div data-cp-time>' + timeHtml(M) + wasHtml(M) + '</div></div>' +
      '<div class="cap-sec" data-cp-saves>' + savesHtml(M) + '</div>' +
      '<div data-cp-morewrap>' + moreHtml(M) + '</div>' +
      '<div data-cp-plan>' + planHtml(M) + '</div>' +
    '</div>';
    mount(host, M);
    // A real account's messages arrive with the thread tally (the quiet line needs it): fetch once, then repaint.
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
    box.innerHTML = '<h3 class="cap-dh">' + TITLE + '</h3>' +
      '<div class="cap-hero"><div class="cap-hl-col" data-cp-big>' + heroHtml(M) + '</div>' +
        '<div class="cap-hr-col"><div class="cap-hours"><span class="cap-hl" id="cpHoursL">Your hours a week</span><span data-cp-stepper></span></div><div data-cp-invite>' + inviteHtml(M) + '</div></div></div>' +
      '<div class="cap-dgrid"><div class="cap-sec">' + editHead() + '<div data-cp-time>' + timeHtml(M) + wasHtml(M) + '</div></div>' +
        '<div class="cap-dcol"><div class="cap-sec" data-cp-saves>' + savesHtml(M) + '</div><div data-cp-morewrap>' + moreHtml(M) + '</div></div></div>';
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
    set('[data-cp-big]', heroHtml(M));
    set('[data-cp-invite]', inviteHtml(M));
    set('[data-cp-time]', timeHtml(M) + wasHtml(M));
    set('[data-cp-saves]', savesHtml(M));
    set('[data-cp-morewrap]', moreHtml(M));
    set('[data-cp-plan]', planHtml(M));
  }
  function refresh() {
    var a = document.getElementById('capacityArea');
    if (a && a.querySelector('.cap-root')) paint(a.querySelector('.cap-root').parentNode);
    document.querySelectorAll('.cap-root.is-desk').forEach(function (n) { paint(n); });
  }

  // How long each task takes: six steppers, saved as the coach changes them.
  function openMinutes(root) {
    if (typeof uiSheet !== 'function') return;
    var M = root._cpM || model();
    uiSheet('How long each takes', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'How long one of each takes you. Set 0 for anything you don’t do.'));
      var rows = TASKS.map(function (t) {
        var row = el('div', { class: 'ui-row cap-mrow' });
        var main = el('span', { class: 'ui-row-main' });
        main.appendChild(el('span', { class: 'ui-row-title' }, t.label));
        main.appendChild(el('span', { class: 'ui-row-sub' }, t.unit));
        row.appendChild(main);
        var stp = uiStepper({ value: M.minutes[t.min], step: 1, min: 0, max: MAX_TASK_MIN, label: t.label + ' minutes', cls: 'cap-step is-sm',
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

  // You › Your coaching week's value: how far past your hours, or the room left in lifters.
  function rowValue() {
    try {
      var M = model(), e = M.est;
      if (!e.minPerLifter) return '';
      if (M.n && e.overMinutes > 0) return durText(e.overMinutes) + ' over';
      if (e.more > 0) return 'Room for ' + e.more;
      return 'Full';
    } catch (err) { return ''; }
  }
  function registerSaver(key, fn) { if (key && typeof fn === 'function') OPENERS[key] = fn; }

  window.CapacityUI = { renderPhone: renderPhone, renderDesk: renderDesk, refresh: refresh, rowValue: rowValue, registerSaver: registerSaver, LABEL: TITLE,
    ICON: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC.gauge + '</svg>' };
  Capacity.registerSaver = registerSaver;
})();
