/* coach-report.js: the coach's week, one core for the app and the server (2026-10-28; v2 2026-11-02).
   The Monday report (the push, the email, the in-app "Last week") and the Thursday missed-sessions
   push all come from here, so the app and the server always say the same thing.
   Plain JS: no imports, no DOM, no Store, no clock (every date is passed in). It assigns
   globalThis.CoachReport, so coach.html loads it with a <script> tag, the edge function with a
   side-effect import, and tests with either. A byte-identical copy lives at
   supabase/functions/_shared/coach-report.js (test/coach-report.test.mjs checks they match):
   edit this file, then copy it there.
   Dates are 'YYYY-MM-DD' strings and all date math is UTC on those strings, like clients.js.
   Pain is never described here beyond "pain reported": no body part, ever (lock screens, inboxes).
   Their words are never quoted either: who wrote and how long ago, never what (a message or a note).
   v2 (the owner, 2 Nov: "can include more data if possible"): the week against the week before, strength
   over 4 weeks, effort against what was written, their words waiting, meets for 8 weeks with bodyweight
   against the class, the blocks to write next, money and seats, and every lifter on one line. */
(function (G) {
  'use strict';
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var LIFT_COLOR = { squat: '#38c6ff', bench: '#a98bff', deadlift: '#ffbf3c' };
  var KG_PER_LB = 0.45359237;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var PR_EPS = 0.05;           // app.js isPRForLog: a PR beats the best before it by more than this
  var MEET_DAYS = 56;          // Meets: the next 8 weeks (the class matters from 8 weeks out: app.js deskReasons)
  var MEET_SOON = 28;          // a meet this close makes a quiet team's Monday worth an email (v1's window)
  var MEET_FLAG = 14;          // a lifter's one word says "Meet in N days" inside two weeks (the triage's line)
  var CHECKIN_DAYS = 28;       // check-ins missing: checked in during the 4 weeks before, not last week
  var MIDWEEK_ELAPSED = 3;     // the Thursday check counts Monday to Wednesday as gone
  var MOM_DAYS = 28;           // strength: each lift's best e1RM in the last 4 weeks against the 4 before
  var MOM_TOL = 0.05;          // app.js getE1RMMomentum: a lift is up by more than this (float noise)
  var WORDS_DAYS = 28;         // their words: waiting up to 4 weeks (older isn't Monday news: the app has it)
  var MSG_HOURS = 12;          // a message waits once it is 12 hours old (app.js deskReasons)
  var BW_DAYS = 14;            // a weigh-in speaks for the class for two weeks
  var DUE_DAYS = 7;            // money: due in the next 7 days
  var INVITE_DAYS = 60;        // an unused invite holds a seat for 60 days (guard_invite_seats)
  var SEATS = { free: 3, basic: 10, pro: 25, premium: null };   // powa_effective_tier → the athlete limit (null: none)
  var HALF = 0.5 + 1e-9;       // coach-app.js caEffortOf: on target within half an RPE point
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
  // An RPE as written: 8, 9.5.
  function rpeText(v) { return String(Math.round(Number(v) * 10) / 10); }
  // Whole units, halves away from zero (+2.5 → +3, −2.5 → −3: a drop reads as big as a rise).
  function whole(v) { return v < 0 ? -Math.round(-v) : Math.round(v); }
  // A change in e1RM, whole units with a sign: "+8 kg", "−3 kg", "0 kg".
  function deltaText(kg, unit) { var v = whole(inUnit(kg, unit)); return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' ' + unitOf(unit); }
  // A bodyweight, one decimal: "58.4 kg", "128.7 lbs".
  function bwText(kg, unit) { return (Math.round(inUnit(kg, unit) * 10) / 10).toFixed(1) + ' ' + unitOf(unit); }
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
  // "6 more than the week before", "2 fewer than the week before", "the same as the week before"; with a noun:
  // "6 more sessions than the week before", "as many sessions as the week before".
  function vsText(now, before, noun) {
    var d = now - before, n = noun ? ' ' + (Math.abs(d) === 1 ? noun.replace(/s$/, '') : noun) : '';
    return d > 0 ? d + ' more' + n + ' than the week before' : d < 0 ? -d + ' fewer' + n + ' than the week before' : noun ? 'as many' + n + ' as the week before' : 'the same as the week before';
  }
  function daysAgoText(n) { return n <= 0 ? 'today' : plural(n, 'day'); }

  /* ---------------------------------------------------------------- the block */
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function parseWeeks(weeks) { if (typeof weeks === 'string') { try { return JSON.parse(weeks); } catch (e) { return null; } } return weeks; }
  // A week the coach hasn't published yet (the drafts feature: "draft": true) is not the lifter's block:
  // nothing in the report counts it.
  // A week the coach hasn't published (draft: true, always trailing) plans nothing: the lifter can't see it.
  // In the app only while drafts are on (app.js DRAFTS_ON); the server has no switch and always respects the flag.
  function isDraft(w) { return isObj(w) && w.draft === true && (typeof DRAFTS_ON === 'undefined' || !!DRAFTS_ON); }
  function setOpen(s) { return !!s && !s.completed && !s.skipped; }
  // The days of a week with work in them (an exercise with at least one set). Odd parts (a day that isn't
  // an object, exercises or sets that aren't lists) are skipped, never thrown on: the SQL twins do the same.
  function workDays(w) {
    return (isObj(w) && Array.isArray(w.days) ? w.days : []).filter(function (d) {
      return isObj(d) && Array.isArray(d.exercises) && d.exercises.some(function (e) { return isObj(e) && Array.isArray(e.sets) && e.sets.length > 0; });
    });
  }
  // A week with a set still to do on one of its days with work (app.js programWeekState).
  function weekOpen(days) {
    return days.some(function (d) { return d.exercises.some(function (e) { return !!e && Array.isArray(e.sets) && e.sets.some(setOpen); }); });
  }
  // Sessions a week from a block: the days with work in its current week, the first with a set still
  // to do (app.js programWeekState + sessionsPerWeek). A finished block plans nothing: the app never
  // calls a lifter with every set done "missed" (coachAthleteStatus), they need a next block instead.
  // = public.program_planned_per_week (PGlite-tested).
  function plannedPerWeek(weeks) {
    weeks = parseWeeks(weeks);
    if (!Array.isArray(weeks)) return 0;
    for (var i = 0; i < weeks.length; i++) {
      if (isDraft(weeks[i])) continue;
      var days = workDays(weeks[i]);
      if (weekOpen(days)) return days.length;
    }
    return 0;
  }
  // Weeks left in a block: from its current week (the first with a set still to do) to its end, that week
  // counted. 0: every set is done (the block finished). null: no weeks at all (app.js programWeekState says
  // nothing then). 1 is the block's last week. = public.program_weeks_left (PGlite-tested).
  function weeksLeft(weeks) {
    weeks = parseWeeks(weeks);
    if (!Array.isArray(weeks)) return null;
    var live = weeks.filter(function (w) { return !isDraft(w); });
    if (!live.length) return null;
    for (var i = 0; i < live.length; i++) if (weekOpen(workDays(live[i]))) return live.length - i;
    return 0;
  }

  // A program as the report reads it: the block's JSON, or (the server, which drops the JSON as it
  // pages) the planned sessions and weeks left it already worked out.
  function plannedOf(p) {
    if (!p) return 0;
    if (p.planned != null && isFinite(Number(p.planned))) return Math.max(0, Math.round(Number(p.planned)));
    return plannedPerWeek(p.weeks);
  }
  function weeksLeftOf(p) {
    if (!p) return null;
    if (p.weeksLeft !== undefined) return p.weeksLeft == null || !isFinite(Number(p.weeksLeft)) ? null : Math.max(0, Math.round(Number(p.weeksLeft)));
    return p.weeks === undefined ? null : weeksLeft(p.weeks);
  }

  /* ---------------------------------------------------------------- effort (the top set against what was written) */
  function nul(v) { return v === undefined ? null : v; }
  // Every logged set of a block in [from, to] with an RPE written and an RPE felt, in the block's order:
  // [{ d (the day it was logged), l, v, n (its exercise's lift, variant, name), w (weight), r (rpe), h (rpeHi),
  // f (actualRpe) }]. The rule of app.js programLoggedSets and coach-lifters.js clEffort: a set counts once it
  // is completed, on the day of its completedAt; meet attempts and RIR sets aren't RPE sets. The values are
  // passed on as the block has them (a string stays a string): the report reads them as the app does.
  // = public.program_effort_sets, which the edge function gets through coach_week_effort (PGlite-tested).
  function effortSets(weeks, from, to) {
    weeks = parseWeeks(weeks);
    var out = [];
    if (!Array.isArray(weeks)) return out;
    from = d10(from); to = d10(to);
    weeks.forEach(function (w) {
      if (!isObj(w) || isDraft(w) || !Array.isArray(w.days)) return;
      w.days.forEach(function (d) {
        if (!isObj(d) || !Array.isArray(d.exercises)) return;
        d.exercises.forEach(function (e) {
          if (!isObj(e) || !Array.isArray(e.sets)) return;
          e.sets.forEach(function (s) {
            if (!isObj(s) || !s.completed || s.attempt || s.rir) return;
            if (s.actualRpe == null || s.actualRpe === '' || s.rpe == null || s.rpe === '') return;
            var day = String(s.completedAt || '').slice(0, 10);
            if (!day || day < from || day > to) return;
            out.push({ d: day, l: nul(e.lift), v: nul(e.variant), n: nul(e.exerciseName), w: nul(s.weight), r: s.rpe, h: nul(s.rpeHi), f: s.actualRpe });
          });
        });
      });
    });
    return out;
  }
  // The top set: the heaviest of each lift on each day (coach-lifters.js clEffort; the first of equals).
  function topSets(sets, from, to) {
    var best = {}, order = [];
    (Array.isArray(sets) ? sets : []).forEach(function (x) {
      if (!isObj(x) || !x.d || x.d < from || x.d > to) return;
      var k = x.d + '|' + (x.l || x.n || ''), w = Number(x.w) || 0;
      if (!best[k]) order.push(k);
      if (!best[k] || w > best[k].w) best[k] = { x: x, w: w };
    });
    return order.map(function (k) { return best[k].x; });
  }
  // Felt against written for one set (coach-app.js caEffortOf): on target within half a point of what was
  // written (a range counts from its low end to its top), harder more than half a point over the top,
  // easier more than half a point under the low end. → { kind, over, under, felt, wrote } | null
  function effortOf(s) {
    if (!s || s.attempt || s.rir) return null;
    if (s.actualRpe == null || s.actualRpe === '' || s.rpe == null || s.rpe === '') return null;
    var felt = Number(s.actualRpe), lo = Number(s.rpe);
    if (!isFinite(felt) || !isFinite(lo)) return null;
    var hi = s.rpeHi != null && s.rpeHi !== '' && Number(s.rpeHi) > lo ? Number(s.rpeHi) : lo;
    var over = felt - hi, under = lo - felt;
    return { kind: over > HALF ? 'harder' : under > HALF ? 'easier' : 'on', over: over, under: under, felt: felt, wrote: hi };
  }
  // caEffortBins' five bins: easier, under but on target, as written, over but on target, harder.
  function effortBin(e) { return e.kind === 'easier' ? 0 : e.kind === 'harder' ? 4 : e.over > 1e-9 ? 3 : e.under > 1e-9 ? 1 : 2; }
  // The exercise as the app names it (app.js _exShortTitle, its LIFT_LABELS): "Bench", "Paused Squat", "Row", "Other".
  var OTHER_LABEL = { push: 'Push', pull: 'Pull', legs: 'Legs', cardio: 'Cardio', other: 'Other' };
  function exTitle(x) {
    var l = x && x.l, v = x && x.v;
    if (LIFTS.indexOf(l) >= 0) return ((v && v !== 'Competition' ? str(v) + ' ' : '') + LIFT[l]).trim();
    return str(x && x.n) || (Object.prototype.hasOwnProperty.call(OTHER_LABEL, l) ? OTHER_LABEL[l] : '') || 'Exercise';
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
      // The busy-weeks table keeps days as a list (text[]) and the agreed sessions in proposal.assign
      // (busy-week.js): count those. A row already read here carries a plain number.
      var prop = r.proposal && typeof r.proposal === 'object' ? r.proposal : null;
      var days = prop && Array.isArray(prop.assign) ? prop.assign.length
        : Array.isArray(r.days) ? r.days.length
        : [r.days, r.agreedDays, r.agreed_days, r.sessions].filter(function (v) { return v != null && v !== '' && isFinite(Number(v)); })[0];
      if (!id || !isIso(wk) || days == null) return;
      out.push({ athleteId: id, weekStart: mondayOf(wk), days: Math.max(0, Math.round(Number(days))) });
    });
    return out;
  }

  /* ---------------------------------------------------------------- the plan's seats */
  // The plan in force (public.powa_effective_tier, app.js effectiveTier): a paid period that ended more
  // than 3 days ago counts as free; anything unknown is free.
  function effectiveTier(tier, periodEnd, nowMs) {
    var t = Object.prototype.hasOwnProperty.call(SEATS, tier) ? tier : 'free';
    if (!periodEnd || t === 'free') return t;
    var end = Date.parse(periodEnd);
    if (!isFinite(end)) return t;
    return end < (nowMs == null ? Date.now() : nowMs) - 3 * 86400000 ? 'free' : t;
  }
  // A meet's class as a ceiling in kg (app.js deskBodyweightVsClass): "57", "57 kg" and "57,5" have one;
  // "120+" has none.
  function classLimit(cls) {
    if (!cls || /\+/.test(String(cls))) return null;
    var v = parseFloat(String(cls).replace(',', '.'));
    return v > 0 ? v : null;
  }

  /* ---------------------------------------------------------------- the team's week */
  // input: { athletes: [{ id, name }], programs: [{ athleteId, weeks }], sessions: { athleteId: n },
  //   prs: [{ athleteId, lift, e1rm }], pains: [{ athleteId, date }], checkins: [{ athleteId, date }],
  //   formChecksOpen: [{ athleteId }], overdue: [{ athleteId, amountCents, currency, daysLate }],
  //   meets: [{ athleteId, name, date, weightClass }], busy: [{ athleteId, weekStart, days }],
  //   and from v2, each optional (left out, its part of the report is too):
  //   sessionsBefore: { athleteId: n } (the week before), momentum: [{ athleteId, lifts: { squat: { recent,
  //   prior } } }], effort: [{ athleteId, sets: effortSets(...) }], threads: [{ athleteId, lastAt,
  //   lastSenderId }] (the coach's thread with each lifter, its last message), notes: [{ athleteId, date }]
  //   (session notes with no reply), bodyweight: [{ athleteId, date, weight }], due: [{ athleteId,
  //   amountCents, currency, nextDue }], applications (a count), invites (unused, a count), plan: { tier,
  //   periodEnd } }
  //   (a program may carry `planned` and `weeksLeft` instead of `weeks`: the server's lean read)
  // opts: { from, to, today, now (ms, for how long a message has waited), unit (the coach's: whole units
  // decide who got stronger) }. Behind: trained none of their sessions, or two or more short (the same
  // line as the This week tile, coach-lifters.js clTeam). An agreed busy week plans the agreed days.
  function teamWeek(input, opts) {
    input = input || {}; opts = opts || {};
    var from = d10(opts.from), to = d10(opts.to), today = isIso(opts.today) ? d10(opts.today) : to;
    var now = opts.now != null && isFinite(Number(opts.now)) ? Number(opts.now) : Date.parse(today + 'T12:00:00Z');
    var U = unitOf(opts.unit);
    var people = (input.athletes || []).filter(function (a) { return a && a.id; }).map(function (a) { return { id: a.id, name: str(a.name) || 'A lifter' }; });
    var who = {}; people.forEach(function (a) { who[a.id] = a; });
    var nameOf = function (id) { return who[id] ? who[id].name : ''; };
    var inWin = function (d) { d = d10(d); return d >= from && d <= to; };
    var prog = {}; (input.programs || []).forEach(function (p) { if (p && who[p.athleteId] && !prog[p.athleteId]) prog[p.athleteId] = p; });
    var mon = mondayOf(from), monBefore = addDays(mon, -7);
    var busy = {}, busyBefore = {};
    busyRows(input.busy).forEach(function (b) {
      if (!who[b.athleteId]) return;
      if (b.weekStart === mon) busy[b.athleteId] = b.days;
      else if (b.weekStart === monBefore) busyBefore[b.athleteId] = b.days;
    });
    var count = function (v) { return Math.max(0, Math.round(Number(v) || 0)); };
    var sessions = input.sessions || {};
    var beforeIn = input.sessionsBefore && typeof input.sessionsBefore === 'object' ? input.sessionsBefore : null;
    var trained = 0, done = 0, planned = 0, behind = [], per = {};
    var prev = beforeIn ? { trained: 0, sessionsDone: 0, sessionsPlanned: 0 } : null;
    people.forEach(function (a) {
      var n = count(sessions[a.id]);
      if (n > 0) trained++;
      var p0 = plannedOf(prog[a.id]);
      var p = busy[a.id] != null ? Math.min(p0, busy[a.id]) : p0;
      per[a.id] = { n: n, p: p };
      // The week before, counted the same way against the same block (its own agreed busy week).
      if (prev) {
        var nb = count(beforeIn[a.id]), pb = busyBefore[a.id] != null ? Math.min(p0, busyBefore[a.id]) : p0;
        if (nb > 0) prev.trained++;
        if (pb > 0) { prev.sessionsPlanned += pb; prev.sessionsDone += Math.min(nb, pb); }
      }
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
    var ciFrom = addDays(from, -CHECKIN_DAYS), ciNow = {}, ciLast = {};
    (input.checkins || []).forEach(function (c) {
      if (!c || !who[c.athleteId] || !isIso(c.date)) return;
      var d = d10(c.date);
      if (d >= from && d <= to) ciNow[c.athleteId] = true;
      else if (d >= ciFrom && d < from && d > (ciLast[c.athleteId] || '')) ciLast[c.athleteId] = d;
    });
    var checkinsMissing = Object.keys(ciLast).filter(function (id) { return !ciNow[id]; })
      .map(function (id) { return { id: id, name: nameOf(id), last: ciLast[id] }; }).sort(byName);

    // Strength: each lifter's best e1RM per main lift in the 4 weeks to the end of the week against the 4
    // before (app.js getE1RMMomentum's windows; coach-app.js caTeamStrength sums a lifter's lifts that have
    // both). Up: a whole unit or more in the coach's unit (coach-lifters.js clTeam). Stalling is the app's
    // own: lifts in both windows and none up by more than 0.05 kg.
    var stalled = [], movers = [], chg = {}, liftAgg = {}, sN = 0, sUp = 0, sDown = 0;
    LIFTS.forEach(function (L) { liftAgg[L] = { n: 0, up: 0, down: 0, deltas: [] }; });
    var momSeen = {};
    (input.momentum || []).forEach(function (m) {
      if (!m || !who[m.athleteId] || momSeen[m.athleteId] || !m.lifts || typeof m.lifts !== 'object') return;
      momSeen[m.athleteId] = true;
      var tot = 0, k = 0, anyUp = false;
      LIFTS.forEach(function (L) {
        var x = m.lifts[L], r = x ? Number(x.recent) : 0, p = x ? Number(x.prior) : 0;
        if (!(r > 0) || !(p > 0)) return;
        var dl = r - p, w = whole(inUnit(dl, U));
        k++; tot += dl; if (dl > MOM_TOL) anyUp = true;
        var g = liftAgg[L]; g.n++; g.deltas.push(dl); if (w >= 1) g.up++; else if (w <= -1) g.down++;
      });
      if (!k) return;
      chg[m.athleteId] = tot;
      sN++;
      var wt = whole(inUnit(tot, U));
      if (wt >= 1) sUp++; else if (wt <= -1) sDown++;
      movers.push({ id: m.athleteId, name: nameOf(m.athleteId), kg: tot });
      if (!anyUp) stalled.push({ id: m.athleteId, name: nameOf(m.athleteId), kg: tot });
    });
    var median = function (a) {
      if (!a.length) return null;
      var s = a.slice().sort(function (x, y) { return x - y; }), h = s.length >> 1;
      return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
    };
    var lifts = {};
    LIFTS.forEach(function (L) { var g = liftAgg[L]; lifts[L] = { n: g.n, up: g.up, down: g.down, median: median(g.deltas) }; });
    movers.sort(function (a, b) { return b.kg - a.kg || byName(a, b); });
    stalled.sort(byName);
    var strength = { n: sN, up: sUp, down: sDown, flat: sN - sUp - sDown, lifts: lifts,
      movers: movers.filter(function (x) { return whole(inUnit(x.kg, U)) >= 1; }).slice(0, 3), stalled: stalled };

    // Effort: last week's top sets against what was written (coach-lifters.js clEffort picks them,
    // coach-app.js caEffortOf / caEffortBins place them). At or under: as written or easier; then half a
    // point over (still on target) and a point or more over (harder). Who ran hot is caEffortSplit's rule
    // on those top sets: one a full point over, or 3 or more running half a point over on average.
    var bins = [0, 0, 0, 0, 0], hotBy = {}, effSeen = {};
    (input.effort || []).forEach(function (x) {
      if (!x || !who[x.athleteId] || effSeen[x.athleteId]) return;
      effSeen[x.athleteId] = true;
      topSets(x.sets, from, to).forEach(function (s) {
        var e = effortOf({ rpe: s.r, rpeHi: s.h, actualRpe: s.f });
        if (!e) return;
        bins[effortBin(e)]++;
        var h = hotBy[x.athleteId] || (hotBy[x.athleteId] = { id: x.athleteId, name: nameOf(x.athleteId), n: 0, sum: 0, count: 0, worst: null });
        h.count++; h.sum += e.over;
        if (e.kind === 'harder') h.n++;
        if (!h.worst || e.over > h.worst.over || (e.over === h.worst.over && s.d > h.worst.date)) h.worst = { over: e.over, felt: e.felt, wrote: e.wrote, title: exTitle(s), date: s.d };
      });
    });
    var etotal = bins[0] + bins[1] + bins[2] + bins[3] + bins[4], atOrUnder = bins[0] + bins[1] + bins[2];
    var hot = Object.keys(hotBy).map(function (k) {
      var h = hotBy[k], avg = Math.round(h.sum / h.count * 10) / 10;
      var why = h.worst && h.worst.over >= 1 ? 'over' : (h.count >= 3 && avg >= 0.5 ? 'drift' : '');
      return why ? { id: h.id, name: h.name, n: h.n, why: why, avg: avg, count: h.count, worst: h.worst } : null;
    }).filter(Boolean).sort(function (a, b) { return b.worst.over - a.worst.over || b.avg - a.avg || byName(a, b); });
    var effort = { total: etotal, bins: bins, atOrUnder: atOrUnder, half: bins[3], over: bins[4],
      pct: etotal ? (atOrUnder === etotal ? 100 : Math.min(99, Math.round(atOrUnder / etotal * 100))) : null, hot: hot };

    // Their words waiting: their last message in the thread (12 hours old or more, app.js deskReasons) and
    // session notes with no reply, from the last 4 weeks. Who and how long, never what they said.
    var wordsBy = {}, lastMsg = {};
    (input.threads || []).forEach(function (t) {
      if (!t || !who[t.athleteId]) return;
      var at = Date.parse(t.lastAt);
      if (!isFinite(at)) return;
      if (!lastMsg[t.athleteId] || at > lastMsg[t.athleteId].at) lastMsg[t.athleteId] = { at: at, theirs: t.lastSenderId === t.athleteId };
    });
    var wordOf = function (id) { return wordsBy[id] || (wordsBy[id] = { id: id, name: nameOf(id), message: false, notes: 0, days: 0 }); };
    Object.keys(lastMsg).forEach(function (id) {
      var m = lastMsg[id], age = now - m.at;
      if (!m.theirs || age < MSG_HOURS * 3600000 || age > WORDS_DAYS * 86400000) return;
      var w = wordOf(id); w.message = true; w.days = Math.max(w.days, Math.floor(age / 86400000));
    });
    (input.notes || []).forEach(function (n) {
      if (!n || !who[n.athleteId] || !isIso(n.date)) return;
      var age = daysBetween(n.date, today);
      if (age < 0 || age > WORDS_DAYS) return;
      var w = wordOf(n.athleteId); w.notes++; w.days = Math.max(w.days, age);
    });
    var words = Object.keys(wordsBy).map(function (k) { return wordsBy[k]; }).sort(function (x, y) { return y.days - x.days || byName(x, y); });

    // Meets in the next 8 weeks, one entry per meet; each lifter with their latest weigh-in (2 weeks at
    // most) against the class: over is in kg, one decimal (app.js deskBodyweightVsClass).
    var bwBy = {};
    (input.bodyweight || []).forEach(function (b) {
      if (!b || !who[b.athleteId] || !isIso(b.date)) return;
      var d = d10(b.date), kg = Number(b.weight);
      if (!(kg > 0) || d > today || daysBetween(d, today) > BW_DAYS) return;
      if (!bwBy[b.athleteId] || d > bwBy[b.athleteId].date) bwBy[b.athleteId] = { date: d, kg: kg };
    });
    var mg = {}, meetSoon = {};
    (input.meets || []).forEach(function (m) {
      if (!m || !who[m.athleteId] || !isIso(m.date)) return;
      var days = daysBetween(today, m.date);
      if (days < 0 || days > MEET_DAYS) return;
      var nm = str(m.name) || 'Meet', k = nm.toLowerCase() + '|' + d10(m.date);
      var g = mg[k] || (mg[k] = { name: nm, date: d10(m.date), days: days, lifters: [] });
      if (g.lifters.some(function (x) { return x.id === m.athleteId; })) return;
      var cls = str(m.weightClass), limit = classLimit(cls), bw = bwBy[m.athleteId] || null;
      g.lifters.push({ id: m.athleteId, name: nameOf(m.athleteId), cls: cls, limit: limit, bw: bw ? bw.kg : null,
        over: limit != null && bw ? Math.round((bw.kg - limit) * 10) / 10 : null });
      if (days <= MEET_FLAG && (meetSoon[m.athleteId] == null || days < meetSoon[m.athleteId])) meetSoon[m.athleteId] = days;
    });
    var meets = Object.keys(mg).map(function (k) { mg[k].lifters.sort(byName); return mg[k]; })
      .sort(function (x, y) { return x.days - y.days || x.name.localeCompare(y.name); });

    // The blocks to write next: no program, a finished block, or its last week now (app.js
    // coachAthleteStatus: noprogram, blockdone, blockend). Only when the programs were read at all.
    var toWrite = [];
    if (Array.isArray(input.programs)) {
      var WHY = { finished: 0, none: 1, ends: 2 };
      people.forEach(function (a) {
        var p = prog[a.id], wl = weeksLeftOf(p);
        var why = !p ? 'none' : wl === 0 ? 'finished' : wl === 1 ? 'ends' : '';
        if (why) toWrite.push({ id: a.id, name: a.name, why: why });
      });
      toWrite.sort(function (x, y) { return WHY[x.why] - WHY[y.why] || byName(x, y); });
    }

    // Money: payments overdue and due in the next 7 days on the coach's own record, each totalled in its
    // most common currency.
    var moneyOf = function (rows, mapRow) {
      var list = (rows || []).filter(function (o) { return o && who[o.athleteId]; });
      var curN = {}, cur = null;
      list.forEach(function (o) { var c = String(o.currency || 'USD').toUpperCase(); curN[c] = (curN[c] || 0) + 1; if (!cur || curN[c] > curN[cur]) cur = c; });
      var out = { n: list.length, total: 0, currency: cur || 'USD', mixed: false, who: [] };
      list.forEach(function (o) {
        if (String(o.currency || 'USD').toUpperCase() === out.currency) out.total += Math.round(Number(o.amountCents) || 0);
        else out.mixed = true;
        out.who.push(mapRow(o));
      });
      return out;
    };
    var overdue = moneyOf(input.overdue, function (o) { return { id: o.athleteId, name: nameOf(o.athleteId), daysLate: count(o.daysLate) }; });
    overdue.who.sort(function (x, y) { return y.daysLate - x.daysLate || byName(x, y); });
    var due = moneyOf((input.due || []).filter(function (o) { return o && isIso(o.nextDue) && daysBetween(today, o.nextDue) >= 0 && daysBetween(today, o.nextDue) <= DUE_DAYS; }),
      function (o) { return { id: o.athleteId, name: nameOf(o.athleteId), date: d10(o.nextDue), inDays: daysBetween(today, o.nextDue) }; });
    due.who.sort(function (x, y) { return x.inDays - y.inDays || byName(x, y); });
    var applications = count(input.applications);
    // Seats: the lifters and the unused invites holding one, against the plan in force.
    var seats = null;
    if (input.plan && typeof input.plan === 'object') {
      var tier = effectiveTier(input.plan.tier, input.plan.periodEnd, now), inv = count(input.invites);
      seats = { tier: tier, limit: SEATS[tier] === undefined ? 3 : SEATS[tier], lifters: people.length, invites: inv, used: people.length + inv };
    }

    // Every lifter, one line: last week's sessions, their 4-week change and one word, in the triage order
    // (pain, a meet inside two weeks, behind, a PR, on plan, then the block), so a long roster cut short
    // keeps the lifters that need a look.
    var painIds = {}, behindIds = {}, prIds = {};
    pain.forEach(function (x) { painIds[x.id] = true; });
    behind.forEach(function (x) { behindIds[x.id] = true; });
    prs.forEach(function (x) { prIds[x.id] = true; });
    var programsKnown = Array.isArray(input.programs);
    var everyone = people.map(function (a) {
      var s = per[a.id], wl = weeksLeftOf(prog[a.id]), md = meetSoon[a.id];
      var flag = painIds[a.id] ? { word: 'Pain', tone: 'pain', rank: 0 }
        : md != null ? { word: md <= 0 ? 'Meet today' : md === 1 ? 'Meet tomorrow' : 'Meet in ' + md + ' days', tone: 'meet', rank: 1 }
        : behindIds[a.id] ? { word: 'Behind', tone: 'warn', rank: 2 }
        : prIds[a.id] ? { word: 'PR', tone: 'win', rank: 3 }
        : s.p > 0 ? { word: 'On plan', tone: '', rank: 4 }
        : programsKnown && !prog[a.id] ? { word: 'No block', tone: '', rank: 5 }
        : wl === 0 ? { word: 'Block done', tone: '', rank: 5 }
        : s.n > 0 ? { word: 'Trained', tone: '', rank: 6 } : { word: 'Quiet', tone: '', rank: 7 };
      return { id: a.id, name: a.name, done: s.n, planned: s.p, change: chg[a.id] == null ? null : chg[a.id], flag: flag };
    }).sort(function (x, y) { return x.flag.rank - y.flag.rank || byName(x, y); });

    return {
      from: from, to: to, today: today, kind: to >= today ? 'this' : 'last',
      of: people.length, trained: trained, sessionsDone: done, sessionsPlanned: planned, prev: prev,
      behind: behind, pain: pain, prs: prs, formChecks: formChecks, formCheckWho: formCheckWho,
      checkinsMissing: checkinsMissing, meets: meets, overdue: overdue,
      strength: strength, effort: effort, words: words, toWrite: toWrite, due: due, applications: applications, seats: seats,
      everyone: everyone
    };
  }
  // Worth a Monday email and push: someone trained, or something waits on the coach. A team that did
  // nothing with nothing waiting (a dormant account) gets nothing.
  function worthSending(team) {
    if (!team || !team.of) return false;
    return team.trained > 0 || team.pain.length > 0 || team.formChecks > 0 || team.overdue.n > 0 ||
      team.meets.some(function (m) { return m.days <= MEET_SOON; }) || (team.words || []).length > 0;
  }
  // Needs you, in the report's order: pain, behind, their words, ran hot, form checks, check-ins, stalling.
  function needLists(team) {
    return [team.pain, team.behind, team.words || [], (team.effort && team.effort.hot) || [], team.formCheckWho, team.checkinsMissing,
      (team.strength && team.strength.stalled) || []];
  }
  function needsCount(team) {
    var ids = {};
    needLists(team).forEach(function (l) { l.forEach(function (x) { ids[x.id] = true; }); });
    return Object.keys(ids).length;
  }
  // The first lifter the coach should open (the report's one action).
  function firstUp(team) {
    var lists = needLists(team);
    for (var i = 0; i < lists.length; i++) if (lists[i][0]) return { id: lists[i][0].id, name: lists[i][0].name };
    return null;
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

  /* ---------------------------------------------------------------- the report in words (the email, its text, the app) */
  // How long a lifter's words have waited: "3 days", "today"; and what they are: "a message", "2 notes",
  // "a message and a note" (never what they say).
  function wordsText(w) { return w.days > 0 ? plural(w.days, 'day') : 'today'; }
  function wordsWhat(w) {
    var notes = w.notes === 1 ? 'a note' : w.notes + ' notes';
    return w.message && w.notes ? 'a message and ' + notes : w.message ? 'a message' : notes;
  }
  // Where last week's top sets landed, the parts with any, in the words of the app's Effort tile (coach-lifters.js:
  // "At or under · +0.5 · +1 or more"): [[key, words]] ("48 at or under", "6 at +0.5", "3 at +1 or more"); with
  // nothing over, "nobody over".
  function effortParts(ef) {
    var out = [['ok', ef.atOrUnder + ' at or under']];
    if (ef.half) out.push(['half', ef.half + ' at +0.5']);
    if (ef.over) out.push(['over', ef.over + ' at +1 or more']);
    if (!ef.half && !ef.over) out.push(['none', 'nobody over']);
    return out;
  }
  // Their worst top set: "Bench @9.5, you wrote 8"; a drift: "4 top sets, +0.5 on average".
  function hotText(h) {
    if (h.why === 'over') return h.worst.title + ' @' + rpeText(h.worst.felt) + ', you wrote ' + rpeText(h.worst.wrote);
    return plural(h.count, 'top set') + ', +' + rpeText(h.avg) + ' on average';
  }
  // A lifter at a meet: "58.4 kg for the 57 kg, 1.4 over" / "75.1 kg for the 76 kg, 0.9 under" /
  // "no weigh-in in 2 weeks" / "" (no class). → { text, over }
  function meetLifterText(l, unit) {
    if (l.limit == null) return { text: '', over: false };
    var cls = /^[\d.,]+$/.test(l.cls) ? l.cls + ' ' + 'kg' : l.cls;
    if (l.bw == null) return { text: cls + ' class, no weigh-in in 2 weeks', over: false };
    var o = l.over;
    return { text: bwText(l.bw, unit) + ' for the ' + cls + (o > 0 ? ', ' + loadText(o, unit) + ' over' : o < 0 ? ', ' + loadText(-o, unit) + ' under' : ', right on it'), over: o > 0 };
  }
  var TO_WRITE = { finished: 'Block finished', none: 'No block yet', ends: 'Block ends this week' };
  // One lifter's line: "3 of 4 sessions · +8 kg in 4 weeks".
  function everyText(x, unit) {
    var s = x.planned > 0 ? x.done + ' of ' + plural(x.planned, 'session') : x.done ? plural(x.done, 'session') : 'no sessions';
    return s + (x.change != null ? ' · ' + deltaText(x.change, unit) + ' in 4 weeks' : '');
  }
  // "22 of 25 used (20 lifters, 2 open invites)", "3 of 3 used: full", "60 lifters, no limit on your plan".
  function seatsText(s) {
    if (!s) return '';
    if (s.limit == null) return plural(s.lifters, 'lifter') + ', no limit on your plan';
    return s.used + ' of ' + s.limit + ' used' + (s.invites ? ' (' + plural(s.lifters, 'lifter') + ', ' + plural(s.invites, 'open invite') + ')' : '') + (s.used >= s.limit ? ': full' : '');
  }

  /* ---------------------------------------------------------------- the email */
  var C = { page: '#0b0b0c', card: '#141416', raised: '#1b1b1f', line: '#26262c', text: '#f4f4f6', text2: '#b8b8c0', text3: '#8c8c96',
    red: '#ff3b4a', pain: '#ff8f80', warn: '#ffb35c', ok: '#34d982', gold: '#ffc23d', half: '#b8875a', was: '#4a4a52' };
  var FONT = "Archivo, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  var EMAIL_NAMES = 8, EMAIL_ROWS = 8, EMAIL_HOT = 5, EMAIL_MEETS = 6, EMAIL_EVERY = 25;   // a 60-lifter team's email stays short: the app has the rest
  // opts: { coachName, unsubUrl, appUrl, unit } → { subject, html, text, preheader }
  function reportEmail(team, opts) {
    opts = opts || {};
    var U = unitOf(opts.unit), appUrl = opts.appUrl || 'https://www.powalifta.com/coach.html', unsub = opts.unsubUrl || '';
    var push = reportPush(team) || { body: '' };
    var subject = 'Your team’s week: ' + push.body;
    // Sunday's report is this week (Monday to today), Monday's the week that ended yesterday.
    var thisWeek = team.kind === 'this', wk = thisWeek ? 'this week' : 'last week';
    var range = (thisWeek ? 'This week, ' : '') + rangeLabel(team.from, team.to);
    // When it comes (the coach's pick; without one, the day the week says).
    var sched = opts.schedule || { day: thisWeek ? 'sun' : 'mon', hour: null };
    var sentWhen = (first(opts.coachName) ? 'Sent to ' + first(opts.coachName) + ' on ' : 'Sent on ') + scheduleText(sched) + '.';
    var needs = needsCount(team);
    var up = firstUp(team);
    var preheader = needs ? (needs === 1 ? (up ? up.name : 'One lifter') + ' needs you this week.' : plural(needs, 'lifter') + ' need you this week' + (up ? ', starting with ' + up.name : '') + '.')
      : 'Nobody needs you this week.';
    var coachFirst = first(opts.coachName);
    var st = team.strength || { n: 0, lifts: {}, movers: [], stalled: [] }, ef = team.effort || { total: 0, hot: [] };
    var words = team.words || [], toWrite = team.toWrite || [], due = team.due || { n: 0, who: [] }, every = team.everyone || [];
    var prev = team.prev;
    var capT = function (list, fmt, max) { max = max || EMAIL_NAMES; var out = list.slice(0, max).map(fmt).join(', '); return list.length > max ? out + ' and ' + (list.length - max) + ' more' : out; };
    var toWriteBy = function (why) { return toWrite.filter(function (x) { return x.why === why; }); };
    // ---- the text version
    var T = [];
    T.push('Your team’s week · ' + range, '');
    T.push(team.trained + ' of ' + team.of + ' trained' + (prev ? ' (' + vsText(team.trained, prev.trained) + ')' : '') +
      (team.sessionsPlanned ? ' · ' + team.sessionsDone + ' of ' + team.sessionsPlanned + ' sessions' + (prev && prev.sessionsPlanned ? ' (' + vsText(team.sessionsDone, prev.sessionsDone) + ')' : '') : '') +
      (team.prs.length ? ' · ' + plural(team.prs.length, 'PR') : ''), '');
    var tNeeds = [];
    if (team.pain.length) tNeeds.push('Pain reported: ' + capT(team.pain, function (p) { return p.name + (p.n > 1 ? ' (' + p.n + ' times)' : ''); }));
    if (team.behind.length) tNeeds.push('Behind: ' + capT(team.behind, function (b) { return b.name + ' ' + b.done + ' of ' + b.planned; }));
    if (words.length) tNeeds.push('Wrote you: ' + capT(words, function (w) { return w.name + ' (' + wordsText(w) + ')'; }));
    if (ef.hot.length) tNeeds.push('Ran hot: ' + capT(ef.hot, function (h) { return h.name; }));
    if (team.formChecks) tNeeds.push('Form checks to review: ' + team.formChecks + ' (' + capT(team.formCheckWho, function (f) { return f.name; }) + ')');
    if (team.checkinsMissing.length) tNeeds.push('No check-in ' + wk + ': ' + capT(team.checkinsMissing, function (c) { return c.name; }));
    if (st.stalled.length) tNeeds.push('No lift up in 4 weeks: ' + capT(st.stalled, function (s) { return s.name; }));
    T.push('Needs you');
    if (tNeeds.length) tNeeds.forEach(function (l) { T.push('- ' + l); }); else T.push('- Nobody. Everyone trained as planned.');
    T.push('');
    if (st.n) {
      T.push('Strength (best e1RM, the last 4 weeks against the 4 before)');
      T.push('- ' + st.up + ' of ' + plural(st.n, 'lifter') + ' stronger');
      LIFTS.forEach(function (L) { var g = st.lifts[L]; if (g && g.n) T.push('- ' + LIFT[L] + ': ' + deltaText(g.median, U) + ' median, ' + g.up + ' of ' + g.n + ' up'); });
      if (st.movers.length) T.push('- Biggest movers: ' + st.movers.map(function (m) { return m.name + ' ' + deltaText(m.kg, U); }).join(', '));
      T.push('');
    }
    if (ef.total) {
      T.push('Effort (' + wk + '’s top sets against what you wrote)');
      T.push('- ' + ef.pct + '% at or under: ' + effortParts(ef).map(function (x) { return x[1]; }).join(', '));
      ef.hot.slice(0, EMAIL_HOT).forEach(function (h) { T.push('- ' + h.name + ': ' + hotText(h)); });
      if (ef.hot.length > EMAIL_HOT) T.push('- ' + (ef.hot.length - EMAIL_HOT) + ' more ran hot, in the app');
      T.push('');
    }
    if (team.prs.length) {
      T.push('Wins (e1RM PRs)');
      var wl = prsByLifter(team);
      wl.slice(0, EMAIL_ROWS).forEach(function (r) { T.push('- ' + r.name + ': ' + r.prs.map(function (p) { return p.lift + ' ' + e1rmText(p.e1rm, U); }).join(', ')); });
      if (wl.length > EMAIL_ROWS) T.push('- ' + (wl.length - EMAIL_ROWS) + ' more lifters with PRs, in the app');
      T.push('');
    }
    if (team.meets.length) {
      T.push('Meets (the next 8 weeks)');
      team.meets.slice(0, EMAIL_MEETS).forEach(function (m) {
        T.push('- ' + m.name + ', ' + dayLabel(m.date) + ' (' + whenText(m.days) + ')');
        m.lifters.slice(0, EMAIL_NAMES).forEach(function (l) { var t = meetLifterText(l, U).text; T.push('  ' + l.name + (t ? ': ' + t : '')); });
        if (m.lifters.length > EMAIL_NAMES) T.push('  and ' + (m.lifters.length - EMAIL_NAMES) + ' more');
      });
      if (team.meets.length > EMAIL_MEETS) T.push('- ' + (team.meets.length - EMAIL_MEETS) + ' more meets, in the app');
      T.push('');
    }
    if (toWrite.length) {
      T.push('Next week to write');
      ['finished', 'none', 'ends'].forEach(function (k) { var l = toWriteBy(k); if (l.length) T.push('- ' + TO_WRITE[k] + ': ' + capT(l, function (x) { return x.name; })); });
      T.push('');
    }
    var moneyRows = team.overdue.n || due.n || team.applications || team.seats;
    if (moneyRows) {
      T.push('Money and roster');
      if (team.overdue.n) T.push('- ' + plural(team.overdue.n, 'payment') + ' overdue: ' + money(team.overdue.total, team.overdue.currency) + (team.overdue.mixed ? ' (plus other currencies)' : '') +
        ' (' + capT(team.overdue.who, function (w) { return w.name + ' ' + plural(w.daysLate, 'day'); }) + ')');
      if (due.n) T.push('- ' + due.n + ' due this week: ' + money(due.total, due.currency) + (due.mixed ? ' (plus other currencies)' : '') +
        ' (' + capT(due.who, function (w) { return w.name + ' ' + (w.inDays === 0 ? 'today' : dayLabel(w.date).split(' ')[0]); }) + ')');
      if (team.applications) T.push('- ' + plural(team.applications, 'application') + ' waiting, from your profile');
      if (team.seats) T.push('- Seats: ' + seatsText(team.seats));
      T.push('');
    }
    if (every.length) {
      T.push('Every lifter');
      every.slice(0, EMAIL_EVERY).forEach(function (x) { T.push('- ' + x.name + ': ' + everyText(x, U) + ' · ' + x.flag.word); });
      if (every.length > EMAIL_EVERY) T.push('- and ' + (every.length - EMAIL_EVERY) + ' more in the app');
      T.push('');
    }
    T.push('Open Today: ' + appUrl, '');
    T.push(sentWhen + ' Change it in Settings, Notifications.');
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
    var dotOf = function (tone, gap) { return tone ? '<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:' + tone + ';margin:0 ' + (gap || 10) + 'px 1px 0;vertical-align:middle;"></span>' : ''; };
    var row = function (label, value, tone, i) {
      return '<tr><td style="padding:14px 0;' + (i ? 'border-top:1px solid ' + C.line + ';' : '') + 'font-family:' + FONT + ';">' +
        '<div style="font-size:15px;line-height:1.35;font-weight:600;color:' + C.text + ';">' + dotOf(tone) + label + '</div>' +
        (value ? '<div style="margin-top:4px;font-size:15px;line-height:1.45;color:' + C.text2 + ';">' + value + '</div>' : '') + '</td></tr>';
    };
    // Names in a line, each with its detail kept on one line ("Tom Boyle 5 days" never breaks in two on a phone).
    var names = function (list, fmt, max) {
      max = max || EMAIL_NAMES;
      var out = list.slice(0, max).map(function (x) { return '<span style="white-space:nowrap;">' + esc(x.name) + (fmt ? fmt(x) : '') + '</span>'; }).join(', ');
      return list.length > max ? out + ' <span style="color:' + C.text3 + ';">and ' + (list.length - max) + ' more</span>' : out;
    };
    var soft = function (s) { return ' <span style="color:' + C.text3 + ';">' + s + '</span>'; };
    // A bar as table cells (no images, no CSS): segments [{ n, color }] side by side, each as wide as its share.
    // It only draws what the words beside it already say.
    var bar = function (segs, top) {
      var tot = segs.reduce(function (s, x) { return s + Math.max(0, x.n); }, 0);
      var cells = segs.filter(function (x) { return x.n > 0; });
      if (!tot || !cells.length) return '';
      var used = 0;
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:' + (top == null ? 10 : top) + 'px;"><tr>' +
        cells.map(function (x, i) {
          var last = i === cells.length - 1, pct = last ? 100 - used : Math.max(1, Math.round(x.n / tot * 100));
          used += pct;
          return '<td' + (last ? '' : ' width="' + pct + '%"') + ' style="height:6px;line-height:6px;font-size:0;background:' + x.color + ';">&nbsp;</td>';
        }).join('') + '</tr></table>';
    };
    var nRows = [];
    if (team.pain.length) nRows.push(row('Pain reported', names(team.pain, function (p) { return p.n > 1 ? soft(p.n + ' times') : ''; }), C.pain, nRows.length));
    if (team.behind.length) nRows.push(row('Behind', names(team.behind, function (b) { return soft(b.done + ' of ' + b.planned); }), C.warn, nRows.length));
    if (words.length) nRows.push(row('Wrote you', names(words, function (w) { return soft(esc(wordsText(w))); }), '', nRows.length));
    if (ef.hot.length) nRows.push(row('Ran hot', names(ef.hot), C.warn, nRows.length));
    if (team.formChecks) nRows.push(row(plural(team.formChecks, 'form check') + ' to review', names(team.formCheckWho), '', nRows.length));
    if (team.checkinsMissing.length) nRows.push(row('No check-in ' + wk, names(team.checkinsMissing), '', nRows.length));
    if (st.stalled.length) nRows.push(row('No lift up in 4 weeks', names(st.stalled), '', nRows.length));
    if (!nRows.length) nRows.push(row('Nobody', 'Everyone trained as planned.', C.ok, 0));
    // Strength: how many got stronger, each lift's median change and its share up, the biggest movers.
    var sRows = [];
    if (st.n) {
      sRows.push('<tr><td style="padding:16px 0 14px;font-family:' + FONT + ';"><span style="font-size:28px;line-height:1;font-weight:800;color:' + C.text + ';">' + st.up + '</span>' +
        '<span style="font-size:17px;font-weight:600;color:' + C.text3 + ';"> of ' + st.n + '</span>' +
        '<span style="font-size:15px;font-weight:600;color:' + C.text2 + ';"> stronger</span>' +
        '<div style="margin-top:6px;font-size:13px;line-height:1.4;color:' + C.text3 + ';">Their best e1RM in the last 4 weeks against the 4 before.</div></td></tr>');
      // Each lift: its median change, how many of the lifters compared moved it up, and that share as a bar.
      LIFTS.forEach(function (L) {
        var g = st.lifts[L];
        if (!g || !g.n) return;
        sRows.push('<tr><td style="padding:14px 0;border-top:1px solid ' + C.line + ';font-family:' + FONT + ';">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>' +
          '<td style="font-family:' + FONT + ';font-size:15px;line-height:1.35;font-weight:600;color:' + C.text + ';">' + dotOf(LIFT_COLOR[L], 8) + esc(LIFT[L]) + ' ' + esc(deltaText(g.median, U)) + soft('median') + '</td>' +
          '<td align="right" style="font-family:' + FONT + ';font-size:15px;line-height:1.35;color:' + C.text2 + ';white-space:nowrap;padding-left:12px;">' + g.up + ' of ' + g.n + ' up</td></tr></table>' +
          bar([{ n: g.up, color: LIFT_COLOR[L] }, { n: g.n - g.up, color: C.line }], 10) + '</td></tr>');
      });
      if (st.movers.length) sRows.push(row('Biggest movers', st.movers.map(function (m) { return '<span style="white-space:nowrap;">' + esc(m.name) + ' <span style="color:' + C.text + ';font-weight:600;">' + esc(deltaText(m.kg, U)) + '</span></span>'; }).join(' · '), '', sRows.length));
    }
    // Effort: the share at or under what was written, the split as a bar, who ran hot and their worst top set.
    var eRows = [];
    if (ef.total) {
      eRows.push('<tr><td style="padding:16px 0 14px;font-family:' + FONT + ';"><span style="font-size:28px;line-height:1;font-weight:800;color:' + C.text + ';">' + ef.pct + '%</span>' +
        '<span style="font-size:15px;font-weight:600;color:' + C.text2 + ';"> at or under what you wrote</span>' +
        bar([{ n: ef.atOrUnder, color: C.ok }, { n: ef.half, color: C.half }, { n: ef.over, color: C.warn }], 12) +
        '<div style="margin-top:8px;font-size:13px;line-height:1.6;color:' + C.text2 + ';">' + effortParts(ef)
          .map(function (x) { return '<span style="white-space:nowrap;">' + dotOf({ ok: C.ok, half: C.half, over: C.warn }[x[0]] || '', 6) + x[1] + '</span>'; }).join('&nbsp;&nbsp; ') + '</div></td></tr>');
      ef.hot.slice(0, EMAIL_HOT).forEach(function (x) { eRows.push(row(esc(x.name), esc(hotText(x)), C.warn, eRows.length)); });
      if (ef.hot.length > EMAIL_HOT) eRows.push(row('<span style="color:' + C.text2 + ';">' + (ef.hot.length - EMAIL_HOT) + ' more ran hot</span>', 'In the app, on Last week’s report.', '', eRows.length));
    }
    var wl2 = prsByLifter(team);
    var wRows = wl2.slice(0, EMAIL_ROWS).map(function (r, i) {
      return row(esc(r.name), r.prs.map(function (p) {
        return '<span style="white-space:nowrap;"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:' + LIFT_COLOR[p.lift] + ';margin:0 8px 1px 0;vertical-align:middle;"></span>' +
          esc(LIFT[p.lift]) + ' <span style="color:' + C.text + ';font-weight:600;">' + esc(e1rmText(p.e1rm, U)) + '</span></span>';
      }).join('&nbsp;&nbsp;&nbsp; '), '', i);
    });
    if (wl2.length > EMAIL_ROWS) wRows.push(row('<span style="color:' + C.text2 + ';font-weight:600;">' + (wl2.length - EMAIL_ROWS) + ' more lifters with PRs</span>', 'In the app, on Last week’s report.', '', wRows.length));
    // Meets: the date and the countdown, then each lifter against their class (amber when over).
    var mRows = team.meets.slice(0, EMAIL_MEETS).map(function (m, i) {
      var shown = m.lifters.slice(0, EMAIL_NAMES).map(function (l) {
        var t = meetLifterText(l, U);
        return '<div style="margin-top:6px;color:' + C.text2 + ';"><span style="color:' + C.text + ';">' + esc(l.name) + '</span>' +
          (t.text ? ' · <span style="color:' + (t.over ? C.warn : l.bw == null ? C.text3 : C.text2) + ';">' + esc(t.text) + '</span>' : '') + '</div>';
      }).join('');
      if (m.lifters.length > EMAIL_NAMES) shown += '<div style="margin-top:6px;color:' + C.text3 + ';">and ' + (m.lifters.length - EMAIL_NAMES) + ' more</div>';
      return row(esc(m.name), esc(dayLabel(m.date)) + ', ' + esc(whenText(m.days)) + shown, C.gold, i);
    });
    if (team.meets.length > EMAIL_MEETS) mRows.push(row('<span style="color:' + C.text2 + ';">' + (team.meets.length - EMAIL_MEETS) + ' more meets</span>', 'In the app, on the meets calendar.', '', mRows.length));
    var tRows = [];
    ['finished', 'none', 'ends'].forEach(function (k) { var l = toWriteBy(k); if (l.length) tRows.push(row(TO_WRITE[k], names(l), '', tRows.length)); });
    var oRows = [];
    if (team.overdue.n) oRows.push(row(plural(team.overdue.n, 'payment') + ' overdue', esc(money(team.overdue.total, team.overdue.currency)) + (team.overdue.mixed ? ' plus other currencies' : '') + ' · ' +
      names(team.overdue.who, function (w) { return soft(plural(w.daysLate, 'day')); }), C.pain, oRows.length));
    if (due.n) oRows.push(row(due.n + ' due this week', esc(money(due.total, due.currency)) + (due.mixed ? ' plus other currencies' : '') + ' · ' +
      names(due.who, function (w) { return soft(w.inDays === 0 ? 'today' : esc(dayLabel(w.date).split(' ')[0])); }), '', oRows.length));
    if (team.applications) oRows.push(row(plural(team.applications, 'application') + ' waiting', 'From your profile. They’re in Lifters, under New lifters.', '', oRows.length));
    if (team.seats) oRows.push(row('Seats', esc(seatsText(team.seats)), team.seats.limit != null && team.seats.used >= team.seats.limit ? C.warn : '', oRows.length));
    // Every lifter: one line each, their word on the right.
    var TONE = { pain: C.pain, meet: C.gold, warn: C.warn, win: C.ok };
    var vRows = every.slice(0, EMAIL_EVERY).map(function (x, i) {
      return '<tr><td style="padding:11px 0;' + (i ? 'border-top:1px solid ' + C.line + ';' : '') + 'font-family:' + FONT + ';">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>' +
        '<td style="font-family:' + FONT + ';font-size:15px;line-height:1.35;font-weight:600;color:' + C.text + ';">' + esc(x.name) + '</td>' +
        '<td align="right" style="font-family:' + FONT + ';font-size:13px;line-height:1.35;font-weight:600;white-space:nowrap;padding-left:12px;color:' + (TONE[x.flag.tone] || C.text3) + ';">' + esc(x.flag.word) + '</td></tr></table>' +
        '<div style="margin-top:2px;font-size:13px;line-height:1.4;color:' + C.text2 + ';">' + esc(everyText(x, U)) + '</div></td></tr>';
    });
    if (every.length > EMAIL_EVERY) vRows.push(row('<span style="color:' + C.text2 + ';">and ' + (every.length - EMAIL_EVERY) + ' more in the app</span>', '', '', vRows.length));
    // The answer first: who trained, then the sessions against what was written, this week and the one before.
    var big = '<span style="font-size:44px;line-height:1;font-weight:800;letter-spacing:-0.02em;color:' + C.text + ';">' + team.trained + '</span>' +
      '<span style="font-size:22px;font-weight:600;color:' + C.text3 + ';"> of ' + team.of + '</span>';
    var facts = [];
    if (prev && prev.sessionsPlanned && team.sessionsPlanned) facts.push(vsText(team.sessionsDone, prev.sessionsDone, 'sessions'));
    if (team.prs.length) facts.push(plural(team.prs.length, 'PR'));
    if (team.behind.length) facts.push(team.behind.length + ' behind');
    var sessLine = function (label, done, plannedN, color, dim) {
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:' + (dim ? 12 : 16) + 'px;"><tr>' +
        '<td style="font-family:' + FONT + ';font-size:13px;line-height:1.3;color:' + (dim ? C.text3 : C.text2) + ';">' + label + '</td>' +
        '<td align="right" style="font-family:' + FONT + ';font-size:13px;line-height:1.3;font-weight:600;color:' + (dim ? C.text2 : C.text) + ';">' + done + ' of ' + plannedN + '</td></tr></table>' +
        bar([{ n: Math.min(done, plannedN), color: color }, { n: Math.max(0, plannedN - done), color: C.line }], 6);
    };
    var sess = team.sessionsPlanned ? sessLine('Sessions', team.sessionsDone, team.sessionsPlanned, C.ok, false) +
      (prev && prev.sessionsPlanned ? sessLine('The week before', prev.sessionsDone, prev.sessionsPlanned, C.was, true) : '') : '';
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
      '<tr><td style="padding:22px 20px 20px;font-family:' + FONT + ';">' + big + '<div style="margin-top:8px;font-size:15px;color:' + C.text2 + ';">lifters trained' +
        (prev ? ', ' + esc(vsText(team.trained, prev.trained)) : '') + '</div>' + sess +
        (facts.length ? '<div style="margin-top:14px;font-size:15px;line-height:1.45;color:' + C.text2 + ';">' + facts.map(function (f) { return '<span style="white-space:nowrap;">' + esc(f) + '</span>'; }).join(' · ') + '</div>' : '') + '</td></tr></table></td></tr>');
    h.push(sec('Needs you', nRows, true));
    if (sRows.length) h.push(sec('Strength', sRows, false, '4 weeks'));
    if (eRows.length) h.push(sec('Effort', eRows, false, plural(ef.total, 'top set')));
    if (wRows.length) h.push(sec('Wins', wRows, false, plural(team.prs.length, 'e1RM PR')));
    if (mRows.length) h.push(sec('Meets', mRows, false, 'next 8 weeks'));
    if (tRows.length) h.push(sec('Next week to write', tRows));
    if (oRows.length) h.push(sec('Money and roster', oRows));
    if (vRows.length) h.push(sec('Every lifter', vRows, false, String(team.of)));
    h.push('<tr><td style="padding:32px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:999px;background:' + C.red + ';">',
      '<a href="' + esc(appUrl) + '" style="display:inline-block;padding:14px 26px;font-family:' + FONT + ';font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">Open Today</a>',
      '</td></tr></table></td></tr>',
      '<tr><td style="padding:36px 0 0;border-top:0;font-family:' + FONT + ';font-size:13px;line-height:1.6;color:' + C.text3 + ';">',
      esc(sentWhen) + ' Change it in Settings › Notifications.' +
      (unsub ? ' <a href="' + esc(unsub) + '" style="color:' + C.text2 + ';text-decoration:underline;">Unsubscribe</a>' : ''),
      '<br>POWALIFTA</td></tr></table></td></tr></table></body></html>');
    return { subject: subject, html: h.join(''), text: T.join('\n'), preheader: preheader };
  }

  /* ---------------------------------------------------------------- inputs */
  function ensureWeeks(w) { if (typeof w === 'string') { try { return JSON.parse(w); } catch (e) { return []; } } return Array.isArray(w) ? w : []; }
  // A thread digest as the app keeps it ({ athleteId: { lastAt, lastSenderId } }, or a list) or the messages
  // themselves → [{ athleteId, lastAt, lastSenderId }], the last message per lifter. Never the words.
  function threadsOf(list) {
    var out = {};
    (Array.isArray(list) ? list : list && typeof list === 'object' ? Object.keys(list).map(function (k) { return Object.assign({ athleteId: k }, list[k]); }) : []).forEach(function (t) {
      if (!t || !t.athleteId) return;
      var at = t.lastAt != null ? t.lastAt : t.createdAt, sender = t.lastSenderId != null ? t.lastSenderId : t.senderId;
      var ms = Date.parse(at);
      if (!isFinite(ms)) return;
      if (!out[t.athleteId] || ms > out[t.athleteId].ms) out[t.athleteId] = { ms: ms, row: { athleteId: t.athleteId, lastAt: at, lastSenderId: sender } };
    });
    return Object.keys(out).map(function (k) { return out[k].row; });
  }
  // From the app's Store (camelCase, as db.js maps it). opts: { from, to, today, formChecks (the coach's
  // form checks: coach.html keeps them outside the Store), busy, threads (the coach's thread digest, the
  // desk's _dk.threads; else the Store's messages), plan: { tier, periodEnd } (the coach's own), now }.
  function fromStore(store, coachId, opts) {
    store = store || {}; opts = opts || {};
    var from = d10(opts.from), to = d10(opts.to), today = isIso(opts.today) ? d10(opts.today) : to;
    var now = opts.now != null && isFinite(Number(opts.now)) ? Number(opts.now) : Date.parse(today + 'T12:00:00Z');
    var roster = (store.athletes || []).filter(function (a) { return a && a.id && coachId && a.coachId === coachId && a.id !== coachId; });
    var ids = {}; roster.forEach(function (a) { ids[a.id] = true; });
    var mine = function (x) { return !!x && !!ids[x.athleteId]; };
    // The logs: last week's days, the week before's, and each main lift's best in the windows the report
    // reads (coach_week_stats: during / before last week; recent / prior, the 4 weeks to its end and the 4 before).
    var rFrom = addDays(to, -(MOM_DAYS - 1)), pFrom = addDays(to, -(2 * MOM_DAYS - 1)), bFrom = addDays(from, -7), bTo = addDays(to, -7);
    var days = {}, daysB = {}, lifts = {};
    (store.workoutLogs || []).forEach(function (l) {
      if (!mine(l)) return;
      var d = d10(l.date);
      if (!isIso(d) || d > to) return;
      if (d >= from) (days[l.athleteId] = days[l.athleteId] || {})[d] = true;
      else if (d >= bFrom && d <= bTo) (daysB[l.athleteId] = daysB[l.athleteId] || {})[d] = true;
      var L = String(l.lift || '').toLowerCase(), e = Number(l.e1rmComp);
      if (LIFTS.indexOf(L) < 0 || !(e > 0)) return;
      var s = lifts[l.athleteId] || (lifts[l.athleteId] = {}), x = s[L] || (s[L] = { during: 0, before: 0, recent: 0, prior: 0 });
      if (d >= from) x.during = Math.max(x.during, e); else x.before = Math.max(x.before, e);
      if (d >= rFrom) x.recent = Math.max(x.recent, e); else if (d >= pFrom) x.prior = Math.max(x.prior, e);
    });
    var sessions = {}, sessionsBefore = {};
    roster.forEach(function (a) { sessions[a.id] = Object.keys(days[a.id] || {}).length; sessionsBefore[a.id] = Object.keys(daysB[a.id] || {}).length; });
    var programs = (store.programs || []).filter(mine).map(function (p) { return { athleteId: p.athleteId, weeks: ensureWeeks(p.weeks) }; });
    // Effort reads the block the report reads (the first per lifter, as teamWeek picks it).
    var effort = [], eSeen = {};
    programs.forEach(function (p) { if (eSeen[p.athleteId]) return; eSeen[p.athleteId] = true; effort.push({ athleteId: p.athleteId, sets: effortSets(p.weeks, from, to) }); });
    var billing = (store.clientBilling || []).filter(function (b) { return mine(b) && (!b.coachId || b.coachId === coachId) && (b.status || 'active') === 'active' && isIso(b.nextDue); });
    var inviteSince = now - INVITE_DAYS * 86400000;
    return {
      athletes: roster.map(function (a) { return { id: a.id, name: str(a.name) }; }),
      programs: programs,
      sessions: sessions,
      sessionsBefore: sessionsBefore,
      prs: prsFromStats(Object.keys(lifts).map(function (id) { return { athleteId: id, lifts: lifts[id] }; })),
      momentum: Object.keys(lifts).map(function (id) { return { athleteId: id, lifts: lifts[id] }; }),
      effort: effort,
      pains: (store.painReports || []).filter(function (r) { return mine(r) && !r.resolvedAt; }).map(function (r) { return { athleteId: r.athleteId, date: d10(r.day || r.createdAt) }; }),
      checkins: (store.checkins || []).filter(mine).map(function (c) { return { athleteId: c.athleteId, date: d10(c.createdAt || c.weekStart) }; })
        .concat((store.checkinAnswers || []).filter(mine).map(function (a) { return { athleteId: a.athleteId, date: d10(a.period) }; })),
      formChecksOpen: (opts.formChecks || []).filter(function (f) { return mine(f) && !f.coachReply; }).map(function (f) { return { athleteId: f.athleteId }; }),
      overdue: billing.filter(function (b) { return d10(b.nextDue) < today; })
        .map(function (b) { return { athleteId: b.athleteId, amountCents: Math.round(Number(b.amountCents) || 0), currency: String(b.currency || 'USD').toUpperCase(), daysLate: daysBetween(b.nextDue, today) }; }),
      due: billing.filter(function (b) { return d10(b.nextDue) >= today; })
        .map(function (b) { return { athleteId: b.athleteId, amountCents: Math.round(Number(b.amountCents) || 0), currency: String(b.currency || 'USD').toUpperCase(), nextDue: d10(b.nextDue) }; }),
      meets: (store.meets || []).filter(function (m) { return mine(m) && isIso(m.date); }).map(function (m) { return { athleteId: m.athleteId, name: str(m.name), date: d10(m.date), weightClass: str(m.weightClass) }; }),
      busy: busyRows(opts.busy || store.scheduleRequests || []),
      threads: threadsOf(opts.threads || (store.messages || []).filter(function (m) { return m && m.coachId === coachId && ids[m.athleteId]; })).filter(mine),
      notes: (store.sessionNotes || []).filter(function (n) { return mine(n) && str(n.note) && !n.coachComment; }).map(function (n) { return { athleteId: n.athleteId, date: d10(n.date) }; }),
      bodyweight: (store.bodyweight || []).filter(mine).map(function (b) { return { athleteId: b.athleteId, date: d10(b.date), weight: Number(b.weight) }; }),
      applications: (store.coachApplications || []).filter(function (a) { return a && (!a.coachId || a.coachId === coachId) && (a.status || 'new') === 'new'; }).length,
      invites: (store.invites || []).filter(function (i) { return i && i.coachId === coachId && !i.used && !(Number(i.createdAt) < inviteSince); }).length,
      plan: opts.plan && typeof opts.plan === 'object' ? { tier: opts.plan.tier, periodEnd: opts.plan.periodEnd || null } : null
    };
  }
  // From the database (snake_case rows the edge function read for one coach). rows: { athletes: [{ id,
  // name }], programs: [{ id, athlete_id, coach_id, updated_at, weeks | planned, weeks_left }], stats: [{
  // athlete_id, sessions, lifts }] (public.coach_week_stats), statsBefore (the same for the week before, or
  // null), effort: [{ athlete_id, program_id, sets }] (public.coach_week_effort), pains: [{ athlete_id, day,
  // resolved_at }], checkins: [{ athlete_id, created_at, week_start }], checkinAnswers: [{ athlete_id, period }],
  // formChecks: [{ athlete_id, coach_reply }], billing: [{ athlete_id, coach_id, amount_cents, currency,
  // next_due, status }], meets: [{ athlete_id, name, meet_date, weight_class }], busy: [schedule_requests rows],
  // threads: [{ coach_id, athlete_id, last_at, last_sender_id }] (public.coach_threads_last), notes: [{
  // athlete_id, date, note }] (session notes with no reply: only whether there are words is read), bodyweight:
  // [{ athlete_id, date, weight }], applications: [{ coach_id }] (waiting), invites: [{ coach_id, used,
  // created_at }], plan: { subscription_tier, subscription_period_end } }. opts: { coachId, today, now }.
  function fromRows(rows, opts) {
    rows = rows || {}; opts = opts || {};
    var today = d10(opts.today), coachId = opts.coachId;
    var now = opts.now != null && isFinite(Number(opts.now)) ? Number(opts.now) : Date.parse(today + 'T12:00:00Z');
    var people = (rows.athletes || []).filter(function (a) { return a && a.id && a.id !== coachId; });
    var ids = {}; people.forEach(function (a) { ids[a.id] = true; });
    var mine = function (r) { return !!r && !!ids[r.athlete_id]; };
    var ofCoach = function (r) { return !!r && (!r.coach_id || !coachId || r.coach_id === coachId); };
    // One program per lifter: the coach's own first, the newest of them.
    var progs = (rows.programs || []).filter(mine).slice().sort(function (a, b) {
      return (b.coach_id === coachId) - (a.coach_id === coachId) || String(b.updated_at || '').localeCompare(String(a.updated_at || ''));
    });
    var seen = {}, programs = [], chosen = {};
    progs.forEach(function (p) {
      if (seen[p.athlete_id]) return;
      seen[p.athlete_id] = true;
      var o = { athleteId: p.athlete_id };
      if (p.planned != null && p.weeks == null) {
        o.planned = p.planned;
        if (p.weeks_left !== undefined) o.weeksLeft = p.weeks_left;
      } else o.weeks = ensureWeeks(p.weeks);
      programs.push(o);
      chosen[p.athlete_id] = p.id == null ? null : String(p.id);
    });
    var sessions = {}, stats = [], momentum = [];
    people.forEach(function (a) { sessions[a.id] = 0; });
    var liftsOf = function (l) { if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { l = null; } } return l && typeof l === 'object' ? l : null; };
    (rows.stats || []).filter(mine).forEach(function (s) {
      sessions[s.athlete_id] = Math.max(0, Math.round(Number(s.sessions) || 0));
      var l = liftsOf(s.lifts);
      if (l) { stats.push({ athleteId: s.athlete_id, lifts: l }); momentum.push({ athleteId: s.athlete_id, lifts: l }); }
    });
    var sessionsBefore = null;
    if (Array.isArray(rows.statsBefore)) {
      sessionsBefore = {};
      people.forEach(function (a) { sessionsBefore[a.id] = 0; });
      rows.statsBefore.filter(mine).forEach(function (s) { sessionsBefore[s.athlete_id] = Math.max(0, Math.round(Number(s.sessions) || 0)); });
    }
    // Effort from the chosen block only (coach_week_effort answers for every block a lifter has).
    var effort = [];
    (rows.effort || []).filter(mine).forEach(function (r) {
      var pid = r.program_id == null ? null : String(r.program_id);
      if (!(r.athlete_id in chosen) || (chosen[r.athlete_id] != null && pid !== chosen[r.athlete_id])) return;
      if (effort.some(function (x) { return x.athleteId === r.athlete_id; })) return;
      var sets = r.sets;
      if (typeof sets === 'string') { try { sets = JSON.parse(sets); } catch (e) { sets = []; } }
      effort.push({ athleteId: r.athlete_id, sets: Array.isArray(sets) ? sets : [] });
    });
    var billing = (rows.billing || []).filter(function (b) { return mine(b) && (!b.coach_id || b.coach_id === coachId) && (b.status || 'active') === 'active' && isIso(b.next_due); });
    var inviteSince = now - INVITE_DAYS * 86400000;
    var plan = rows.plan && typeof rows.plan === 'object' ? rows.plan : null;
    return {
      athletes: people.map(function (a) { return { id: a.id, name: str(a.name) }; }),
      programs: programs,
      sessions: sessions,
      sessionsBefore: sessionsBefore,
      prs: prsFromStats(stats),
      momentum: momentum,
      effort: effort,
      pains: (rows.pains || []).filter(function (r) { return mine(r) && !r.resolved_at; }).map(function (r) { return { athleteId: r.athlete_id, date: d10(r.day || r.created_at) }; }),
      checkins: (rows.checkins || []).filter(mine).map(function (c) { return { athleteId: c.athlete_id, date: d10(c.created_at || c.week_start) }; })
        .concat((rows.checkinAnswers || []).filter(mine).map(function (a) { return { athleteId: a.athlete_id, date: d10(a.period) }; })),
      formChecksOpen: (rows.formChecks || []).filter(function (f) { return mine(f) && !f.coach_reply; }).map(function (f) { return { athleteId: f.athlete_id }; }),
      overdue: billing.filter(function (b) { return d10(b.next_due) < today; })
        .map(function (b) { return { athleteId: b.athlete_id, amountCents: Math.round(Number(b.amount_cents) || 0), currency: String(b.currency || 'USD').toUpperCase(), daysLate: daysBetween(b.next_due, today) }; }),
      due: billing.filter(function (b) { return d10(b.next_due) >= today; })
        .map(function (b) { return { athleteId: b.athlete_id, amountCents: Math.round(Number(b.amount_cents) || 0), currency: String(b.currency || 'USD').toUpperCase(), nextDue: d10(b.next_due) }; }),
      meets: (rows.meets || []).filter(function (m) { return mine(m) && isIso(m.meet_date || m.date); })
        .map(function (m) { return { athleteId: m.athlete_id, name: str(m.name), date: d10(m.meet_date || m.date), weightClass: str(m.weight_class) }; }),
      busy: busyRows(rows.busy),
      threads: threadsOf((rows.threads || []).filter(function (t) { return mine(t) && ofCoach(t); })
        .map(function (t) { return { athleteId: t.athlete_id, lastAt: t.last_at, lastSenderId: t.last_sender_id }; })),
      notes: (rows.notes || []).filter(function (n) { return mine(n) && str(n.note) && !n.coach_comment; }).map(function (n) { return { athleteId: n.athlete_id, date: d10(n.date) }; }),
      bodyweight: (rows.bodyweight || []).filter(mine).map(function (b) { return { athleteId: b.athlete_id, date: d10(b.date), weight: Number(b.weight) }; }),
      applications: (rows.applications || []).filter(ofCoach).length,
      invites: (rows.invites || []).filter(function (i) { return ofCoach(i) && !i.used && !(Date.parse(i.created_at) < inviteSince); }).length,
      plan: plan ? { tier: plan.subscription_tier || plan.tier, periodEnd: plan.subscription_period_end || plan.periodEnd || null } : null
    };
  }

  /* ---------------------------------------------------------------- when the report comes (2 Nov) */
  // Each coach picks when their report comes (the owner, 2 Nov: "Their pick, Sunday 6 pm default"): Sunday evening
  // (this week, Monday to the Sunday it is) or Monday morning (the week that ended yesterday), at an hour, in their
  // own time zone (email_preferences report_day, report_hour, tz: sql/migration-coach-report-schedule-2026-11-02.sql).
  // Sunday at 18:00 unless they say otherwise; a time zone the engine doesn't know is UTC. Times come from
  // Intl.DateTimeFormat (Deno and every browser have it): daylight saving is the zone's own.
  var REPORT_DAY = 'sun', REPORT_HOUR = 18;
  var TZF = {};   // a formatter per time zone: the hourly job asks for every coach
  function tzFormatter(tz) {
    if (Object.prototype.hasOwnProperty.call(TZF, tz)) return TZF[tz];
    var f = null;
    try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); }
    catch (e) { f = null; }
    TZF[tz] = f;
    return f;
  }
  // An IANA time zone the engine knows ("Europe/London", "Asia/Kolkata"), else 'UTC'.
  function validTz(tz) { return typeof tz === 'string' && tz.length > 0 && tz.length <= 64 && /^[A-Za-z0-9_+\/-]+$/.test(tz) && tzFormatter(tz) ? tz : 'UTC'; }
  // The wall clock at an instant in a zone: { date 'YYYY-MM-DD', weekday (Mon 0 … Sun 6), hour 0–23, minute }.
  function localParts(ms, tz) {
    var p = {};
    tzFormatter(validTz(tz)).formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var date = p.year + '-' + p.month + '-' + p.day;
    return { date: date, weekday: weekday(date), hour: Number(p.hour) % 24, minute: Number(p.minute) };
  }
  // A coach's pick from their email_preferences row (snake or camel case, or none): { day: 'sun' | 'mon', hour, tz }.
  function scheduleOf(pref) {
    pref = pref || {};
    var day = pref.report_day != null ? pref.report_day : pref.reportDay;
    var h = pref.report_hour != null ? pref.report_hour : pref.reportHour;
    h = h == null || h === '' ? NaN : Number(h);
    return { day: day === 'mon' ? 'mon' : REPORT_DAY, hour: Number.isInteger(h) && h >= 0 && h <= 23 ? h : REPORT_HOUR, tz: validTz(pref.tz) };
  }
  // The week a report covers: on a Sunday, Sunday's report is this week (Monday to today); any other day, and for
  // Monday's report always, the Monday-to-Sunday week before this one.
  function reportWindow(day, today) {
    today = d10(today);
    return day !== 'mon' && weekday(today) === 6 ? { from: mondayOf(today), to: today, today: today } : lastWeek(today);
  }
  // Is a coach's report due at this instant? Their day has come and their hour has passed, in their time zone (a
  // later hour catches up a missed one: the job runs hourly), and that week isn't reported yet (report_sent_week, the
  // Monday of the week last reported). → { due, why, sched, local, window }
  function reportDue(pref, nowMs) {
    var sched = scheduleOf(pref), local = localParts(nowMs, sched.tz), window = reportWindow(sched.day, local.date);
    var out = { due: false, why: '', sched: sched, local: local, window: window };
    if (local.weekday !== (sched.day === 'mon' ? 0 : 6)) { out.why = 'another day'; return out; }
    if (local.hour < sched.hour) { out.why = 'before the hour'; return out; }
    var sent = pref ? (pref.report_sent_week != null ? pref.report_sent_week : pref.reportSentWeek) : null;
    if (sent && d10(sent) === window.from) { out.why = 'sent'; return out; }
    out.due = true;
    return out;
  }
  // "6 pm", "7 am", "12 pm", "12 am": the email's English clock.
  function hourText(h) { h = Number(h); return h === 0 ? '12 am' : h < 12 ? h + ' am' : h === 12 ? '12 pm' : (h - 12) + ' pm'; }
  // "Sundays at 6 pm", "Mondays at 7 am"; "Mondays" with no hour (before the schedule's migration).
  function scheduleText(sched) {
    sched = sched || {};
    return (sched.day === 'mon' ? 'Mondays' : 'Sundays') + (sched.hour != null && isFinite(sched.hour) ? ' at ' + hourText(sched.hour) : '');
  }

  /* ---------------------------------------------------------------- the server's jobs */
  // Which jobs a run does. The cron calls every hour with {}: the lifters' digest on Mondays and the missed-sessions
  // push on Thursdays, both at 14:00 UTC as before, and the coaches' report every hour for the coaches it is due for
  // (dueOnly: reportDue). A run asked for by name (job) does that job for every coach (dueOnly only when said); a run
  // for a given day (today, no job) does what that UTC weekday did before (Monday: the digest and the report;
  // Thursday: the missed-sessions push), by hand. now: the instant the hourly plan is for (dry runs at a pretend hour).
  // body: { job, dryRun, today, now, dueOnly }. → { jobs, today, now, dryRun, dueOnly, error }
  function jobPlan(body, nowIso) {
    body = body && typeof body === 'object' ? body : {};
    var dryRun = body.dryRun === true;
    var ms = Date.parse(body.now != null ? String(body.now) : String(nowIso == null ? '' : nowIso));
    if (!isFinite(ms)) return { jobs: [], today: null, now: null, dryRun: dryRun, dueOnly: false, error: 'now must be an ISO time' };
    var now = new Date(ms).toISOString();
    var today = body.today != null ? d10(body.today) : now.slice(0, 10);
    if (!isIso(today)) return { jobs: [], today: null, now: now, dryRun: dryRun, dueOnly: false, error: 'today must be YYYY-MM-DD' };
    if (body.job != null) {
      if (JOBS.indexOf(body.job) < 0) return { jobs: [], today: today, now: now, dryRun: dryRun, dueOnly: false, error: 'job must be one of ' + JOBS.join(', ') };
      return { jobs: [body.job], today: today, now: now, dryRun: dryRun, dueOnly: body.dueOnly === true, error: null };
    }
    var wd = weekday(today);
    if (body.today != null) return { jobs: wd === 0 ? ['digest', 'coach-report'] : wd === 3 ? ['midweek'] : [], today: today, now: now, dryRun: dryRun, dueOnly: false, error: null };
    var at14 = new Date(ms).getUTCHours() === 14, jobs = [];
    if (wd === 0 && at14) jobs.push('digest');
    if (wd === 3 && at14) jobs.push('midweek');
    jobs.push('coach-report');
    return { jobs: jobs, today: today, now: now, dryRun: dryRun, dueOnly: true, error: null };
  }

  G.CoachReport = {
    LIFTS: LIFTS, JOBS: JOBS, SEATS: SEATS,
    lastWeek: lastWeek, weekSoFar: weekSoFar, mondayOf: mondayOf, addDays: addDays, daysBetween: daysBetween, isIso: isIso,
    dayLabel: dayLabel, rangeLabel: rangeLabel, whenText: whenText, money: money, loadText: loadText, e1rmText: e1rmText, shortNames: shortNames,
    deltaText: deltaText, bwText: bwText, rpeText: rpeText, vsText: vsText, daysAgoText: daysAgoText,
    plannedPerWeek: plannedPerWeek, plannedOf: plannedOf, weeksLeft: weeksLeft, weeksLeftOf: weeksLeftOf,
    effortSets: effortSets, topSets: topSets, effortOf: effortOf, effortBin: effortBin, exTitle: exTitle,
    prsFromStats: prsFromStats, busyRows: busyRows, effectiveTier: effectiveTier, classLimit: classLimit,
    teamWeek: teamWeek, worthSending: worthSending, needsCount: needsCount, firstUp: firstUp, prsByLifter: prsByLifter, midweekBehind: midweekBehind,
    wordsText: wordsText, wordsWhat: wordsWhat, hotText: hotText, effortParts: effortParts, meetLifterText: meetLifterText, everyText: everyText, seatsText: seatsText, TO_WRITE: TO_WRITE,
    reportPush: reportPush, midweekPush: midweekPush, reportEmail: reportEmail,
    fromStore: fromStore, fromRows: fromRows, jobPlan: jobPlan,
    REPORT_DAY: REPORT_DAY, REPORT_HOUR: REPORT_HOUR, validTz: validTz, localParts: localParts, scheduleOf: scheduleOf, reportWindow: reportWindow,
    reportDue: reportDue, hourText: hourText, scheduleText: scheduleText
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
