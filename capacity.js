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

  var Capacity = { capacityEstimate: capacityEstimate, capacitySignals: capacitySignals, DEFAULT_MINUTES: DEFAULT_MINUTES, TYPICAL: TYPICAL,
    TASKS: TASKS, DEMO_HOURS: DEMO_HOURS, DEFAULT_HOURS: DEFAULT_HOURS, minutesOf: minutesOf };
  window.Capacity = Capacity;
  window.capacityEstimate = capacityEstimate;
  window.capacitySignals = capacitySignals;
})();
