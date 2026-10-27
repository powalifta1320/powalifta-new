/* clients.js: Clients + payments and the intake, the pure half (2026-10-27).
   No DOM, no Store, no network: every function takes rows and returns values, so the coach's clients
   page, a lifter's About and the lifter's own questionnaire read the same answers, and tests.html
   ("clients (clients.js)") checks them.
   Rows are db.js's shapes (mapDbClientBilling / mapDbClientPayment / mapDbIntake). Money is integer
   cents in a 3-letter currency. Dates are 'YYYY-MM-DD' strings and all date math is done in UTC on
   those strings, so a timezone never moves a due date.
   Coach-only data: nothing about a package or a payment is ever shown to the athlete (no money moves
   through POWALIFTA; Apple 3.1.1). athlete.html loads this file for the intake helpers only. */
(function () {
  'use strict';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // The database's own lists (sql/migration-clients-2026-10-27.sql check constraints).
  var CADENCES = ['weekly', 'fortnightly', '4-weekly', 'monthly', 'quarterly', 'yearly', 'one-off'];
  var METHODS = ['bank', 'card', 'paypal', 'cash', 'other'];
  var STATUSES = ['active', 'paused', 'ended'];
  var CADENCE_LABEL = { weekly: 'week', fortnightly: '2 weeks', '4-weekly': '4 weeks', monthly: 'month', quarterly: 'quarter', yearly: 'year', 'one-off': 'once' };
  var CADENCE_DAYS = { weekly: 7, fortnightly: 14, '4-weekly': 28 };
  var CADENCE_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
  // One payment as a share of a month: a year of payments over twelve.
  var PER_MONTH = { weekly: 52 / 12, fortnightly: 26 / 12, '4-weekly': 13 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, 'one-off': 0 };
  var YEARS = { '<1': 'Under a year', '1-2': '1–2 years', '3-5': '3–5 years', '5+': '5+ years' };
  var DAY = 86400000;

  // ---------- dates: 'YYYY-MM-DD' in, 'YYYY-MM-DD' out, UTC throughout ----------
  function ymd(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso == null ? '' : iso));
    if (!m) return null;
    var y = +m[1], mo = +m[2] - 1, d = +m[3], t = Date.UTC(y, mo, d), dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== d) return null;   // 2026-02-30
    return { y: y, m: mo, d: d, t: t };
  }
  function isoOf(t) { return new Date(t).toISOString().slice(0, 10); }
  function isoOrNull(v) { return ymd(v) ? String(v).slice(0, 10) : null; }
  function daysIn(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function addDays(iso, n) { var p = ymd(iso); return p ? isoOf(p.t + n * DAY) : null; }
  // n months on, on `day` (1-31) when given, else the date's own day; clamped to the month's length.
  function addMonths(iso, n, day) {
    var p = ymd(iso);
    if (!p) return null;
    var k = p.m + n, y = p.y + Math.floor(k / 12), m = ((k % 12) + 12) % 12;
    var want = day >= 1 && day <= 31 ? day : p.d;
    return isoOf(Date.UTC(y, m, Math.min(want, daysIn(y, m))));
  }
  function daysBetween(a, b) { var pa = ymd(a), pb = ymd(b); return pa && pb ? Math.round((pb.t - pa.t) / DAY) : null; }
  // The device's own calendar day (the app's isoLocal), for calls that don't pass one.
  function todayLocal() {
    if (typeof todayISO === 'function') return todayISO();
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function todayOr(iso) { return isoOrNull(iso) || todayLocal(); }
  // '1 Dec', or '1 Dec 2027' when it isn't the year of `todayIso`.
  function shortDate(iso, todayIso) {
    var p = ymd(iso), t = ymd(todayIso);
    if (!p) return '';
    return p.d + ' ' + MONTHS[p.m] + (t && t.y === p.y ? '' : ' ' + p.y);
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function str(v) { return typeof v === 'string' ? v.trim() : (typeof v === 'number' && isFinite(v) ? String(v) : ''); }
  function dueDayOf(b) { var d = Math.round(Number(b && b.dueDay)); return d >= 1 && d <= 31 ? d : null; }
  function currencyOf(x) { var c = String((x && x.currency) || '').toUpperCase(); return /^[A-Z]{3}$/.test(c) ? c : 'USD'; }
  function statusOf(b) { return b && (b.status === 'paused' || b.status === 'ended') ? b.status : 'active'; }

  // ---------- the schedule ----------
  // The payment after one due on `iso`: weekly +7 days, fortnightly +14, 4-weekly +28; monthly,
  // quarterly and yearly add 1 / 3 / 12 months on `dueDay` (so the 31st comes back after February);
  // one-off → null.
  function nextDueAfter(iso, cadence, dueDay) {
    if (!ymd(iso)) return null;
    if (CADENCE_DAYS[cadence]) return addDays(iso, CADENCE_DAYS[cadence]);
    if (CADENCE_MONTHS[cadence]) return addMonths(iso, CADENCE_MONTHS[cadence], Math.round(Number(dueDay)));
    return null;
  }

  // Where a client stands today: { state: 'none' | 'paused' | 'ended' | 'overdue' | 'due' | 'soon' | 'ok',
  // days (next due − today, null without a date), label, due ('YYYY-MM-DD' | null) }.
  function clientStatus(b, todayIso) {
    var today = todayOr(todayIso);
    if (!b) return { state: 'none', days: null, label: 'No package', due: null };
    var due = isoOrNull(b.nextDue), days = due ? daysBetween(today, due) : null;
    var st = statusOf(b);
    if (st === 'paused') return { state: 'paused', days: days, label: 'Paused', due: due };
    if (st === 'ended') return { state: 'ended', days: days, label: 'Ended', due: due };
    if (!due) return { state: 'ok', days: null, label: b.cadence === 'one-off' ? 'Paid' : 'No due date', due: null };
    if (days < 0) return { state: 'overdue', days: days, label: 'Overdue ' + plural(-days, 'day'), due: due };
    if (days === 0) return { state: 'due', days: 0, label: 'Due today', due: due };
    if (days <= 7) return { state: 'soon', days: days, label: days === 1 ? 'Due tomorrow' : 'Due in ' + days + ' days', due: due };
    return { state: 'ok', days: days, label: 'Next payment ' + shortDate(due, today), due: due };
  }

  // A payment recorded: the next due date moves ONE period on from the current one (the schedule
  // holds even when the money came early or late); with no due date, one period on from the day it
  // was paid. A one-off is paid: no next date. A month-based schedule keeps its day of the month.
  // Pure: returns a new billing object (null for no package).
  function recordPayment(b, payment) {
    if (!b) return null;
    var out = Object.assign({}, b);
    if (b.cadence === 'one-off') { out.nextDue = null; return out; }
    var base = isoOrNull(b.nextDue) || isoOrNull(payment && payment.paidOn);
    if (!base) return out;
    var day = dueDayOf(b);
    if (day == null && CADENCE_MONTHS[b.cadence]) { day = ymd(base).d; out.dueDay = day; }
    out.nextDue = nextDueAfter(base, b.cadence, day);
    return out;
  }

  // What a package is worth a month (cents): weekly ×52/12, fortnightly ×26/12, 4-weekly ×13/12,
  // quarterly /3, yearly /12; one-off, paused and ended are 0.
  function monthlyCents(b) {
    if (!b || statusOf(b) !== 'active') return 0;
    return Math.round((Number(b.amountCents) || 0) * (PER_MONTH[b.cadence] || 0));
  }

  // Everything still owed on a package by `end` (inclusive): the overdue period(s) and each date
  // the schedule reaches before then.
  function owedBy(b, end) {
    var d = isoOrNull(b.nextDue), cents = Number(b.amountCents) || 0, total = 0, guard = 0;
    while (d && d <= end && guard++ < 60) { total += cents; d = nextDueAfter(d, b.cadence, dueDayOf(b)); }
    return total;
  }
  function mostCommon(list) {
    var n = {}, best = null;
    list.forEach(function (c) { n[c] = (n[c] || 0) + 1; if (best == null || n[c] > n[best]) best = c; });
    return best;
  }

  // The roster's business at a glance. Only lifters on `rosterIds` count (all rows when it's not
  // given). Totals are in the most common currency of the active packages; when something in
  // another currency was left out of them, mixed is true.
  //   { currency, active, paused, ended, noPackage: [athleteId],
  //     overdue: { n, cents, who: [athleteId, most overdue first] }, dueToday: { n, cents, who },
  //     soon: { n, cents, who (1-7 days, soonest first) },
  //     month: { received (paid this calendar month), expected (received + still owed by month end,
  //     overdue included) }, mrr, mixed }
  function clientsSummary(billing, payments, todayIso, rosterIds) {
    var today = todayOr(todayIso), t = ymd(today);
    var roster = Array.isArray(rosterIds) ? rosterIds.map(String) : null;
    var on = function (x) { return !!x && (!roster || roster.indexOf(String(x.athleteId)) >= 0); };
    var rows = (billing || []).filter(on), pays = (payments || []).filter(on);
    var active = rows.filter(function (b) { return statusOf(b) === 'active'; });
    var currency = mostCommon(active.map(currencyOf)) || mostCommon(rows.map(currencyOf)) || mostCommon(pays.map(currencyOf)) || 'USD';
    var monthKey = today.slice(0, 7), monthEnd = monthKey + '-' + String(daysIn(t.y, t.m)).padStart(2, '0');
    var out = {
      currency: currency, active: 0, paused: 0, ended: 0, noPackage: [],
      overdue: { n: 0, cents: 0, who: [] }, dueToday: { n: 0, cents: 0, who: [] }, soon: { n: 0, cents: 0, who: [] },
      month: { received: 0, expected: 0 }, mrr: 0, mixed: false
    };
    var has = {}, lists = { overdue: [], due: [], soon: [] };
    rows.forEach(function (b) {
      has[String(b.athleteId)] = true;
      out[statusOf(b)]++;
    });
    active.forEach(function (b) {
      var main = currencyOf(b) === currency;
      if (!main) out.mixed = true;
      var s = clientStatus(b, today);
      if (lists[s.state]) lists[s.state].push({ id: b.athleteId, days: s.days, cents: main ? Number(b.amountCents) || 0 : 0 });
      if (!main) return;
      out.mrr += monthlyCents(b);
      out.month.expected += owedBy(b, monthEnd);
    });
    var fill = function (key, list) {
      list.sort(function (a, b) { return a.days - b.days; });   // most overdue / soonest first
      out[key] = { n: list.length, cents: list.reduce(function (s, x) { return s + x.cents; }, 0), who: list.map(function (x) { return x.id; }) };
    };
    fill('overdue', lists.overdue); fill('dueToday', lists.due); fill('soon', lists.soon);
    if (roster) out.noPackage = roster.filter(function (id) { return !has[id]; });
    pays.forEach(function (p) {
      if (String(p.paidOn || '').slice(0, 7) !== monthKey) return;
      if (currencyOf(p) !== currency) { out.mixed = true; return; }
      out.month.received += Number(p.amountCents) || 0;
    });
    out.month.expected += out.month.received;
    return out;
  }

  // ---------- words ----------
  // '$150', '$92.50', '£1,200', '€90' (en-US unless a locale is given; no decimals when whole).
  function formatMoney(cents, currency, locale) {
    var c = Math.round(Number(cents) || 0), cur = currencyOf({ currency: currency }), whole = c % 100 === 0;
    try {
      return new Intl.NumberFormat(locale || 'en-US', { style: 'currency', currency: cur, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(c / 100);
    } catch (e) {
      return cur + ' ' + (c / 100).toFixed(whole ? 0 : 2);
    }
  }
  function cadenceLabel(c) { return CADENCE_LABEL[c] || ''; }
  // '$150 / month', '$90 / 4 weeks', '$400 once'.
  function priceText(b) {
    if (!b) return '';
    var money = formatMoney(b.amountCents, b.currency);
    return b.cadence === 'one-off' ? money + ' once' : money + ' / ' + (CADENCE_LABEL[b.cadence] || 'month');
  }

  // ---------- the intake ----------
  // Answers (contract, v 1): { v, best: { squat|bench|deadlift: { kg, reps, when } }, bodyweightKg,
  // weightClass, federation, yearsLifting ('<1' | '1-2' | '3-5' | '5+'), daysPerWeek, days ['Mon', …],
  // sessionMinutes, equipment [..], injuries: { parts [..], note }, goals, meet: { name, date,
  // federation } | null, phone, timezone, instagram, notes }.
  function e1rmKg(best) {
    var w = Number(best && best.kg);
    if (!(w > 0)) return 0;
    var reps = Math.max(1, Math.round(Number(best.reps)) || 1);
    var rpe = Number(best.rpe) >= 5 && Number(best.rpe) <= 10 ? Number(best.rpe) : 10;   // a best is a max effort unless they say
    var v = typeof calcE1RM === 'function' ? calcE1RM(w, reps, rpe)
      : (function () { var adj = (reps - 1) + (10 - rpe); return adj <= 0 ? w : w / Math.max(0.4, 1 - adj * 0.0333); })();
    return Math.round(v * 10) / 10;
  }
  // The e1RM (kg) each best lift says, by the app's own formula; 0 where there's no number.
  function intakeMaxes(answers) {
    var best = (answers && answers.best) || {};
    return { squat: e1rmKg(best.squat), bench: e1rmKg(best.bench), deadlift: e1rmKg(best.deadlift) };
  }
  function fmtNum(v, dp) { var f = Math.pow(10, dp == null ? 2 : dp); return String(Math.round(v * f) / f); }
  // The coach's "About" lines, in order; an empty answer leaves its line out. Text only: the UI
  // escapes. opts: { unit: 'kg' | 'lbs' (loads and bodyweight in lb), today: 'YYYY-MM-DD' }.
  function intakeLines(a, opts) {
    if (!a || typeof a !== 'object') return [];
    opts = opts || {};
    var lb = opts.unit === 'lbs' || opts.unit === 'lb', today = todayOr(opts.today), out = [];
    var add = function (k, v) { v = str(v); if (v) out.push({ k: k, v: v }); };
    var load = function (kg) { return lb ? fmtNum(kg * 2.20462, 0) : fmtNum(kg); };
    var best = a.best && typeof a.best === 'object' ? a.best : {};
    add('Best lifts', [['squat', 'S'], ['bench', 'B'], ['deadlift', 'D']].map(function (x) {
      var b = best[x[0]], kg = Number(b && b.kg);
      return kg > 0 ? x[1] + ' ' + load(kg) + '×' + Math.max(1, Math.round(Number(b.reps)) || 1) : null;
    }).filter(Boolean).join(' · '));
    var bw = Number(a.bodyweightKg), cls = str(a.weightClass).replace(/\s*kg$/i, ''), fed = str(a.federation), body = [];
    if (bw > 0) body.push(lb ? fmtNum(bw * 2.20462, 1) + ' lb' : fmtNum(bw, 1) + ' kg');
    if (cls) body.push(cls + ' class' + (fed ? ' (' + fed + ')' : '')); else if (fed) body.push(fed);
    add('Bodyweight', body.join(' · '));
    var days = (Array.isArray(a.days) ? a.days : []).map(str).filter(Boolean);
    if (days.every(function (d) { return WEEKDAYS.indexOf(d) >= 0; })) days.sort(function (x, y) { return WEEKDAYS.indexOf(x) - WEEKDAYS.indexOf(y); });
    var perWeek = Math.round(Number(a.daysPerWeek)) || days.length, mins = Math.round(Number(a.sessionMinutes)), train = [];
    if (YEARS[a.yearsLifting]) train.push(YEARS[a.yearsLifting]); else if (str(a.yearsLifting)) train.push(str(a.yearsLifting));
    if (perWeek > 0) train.push(plural(perWeek, 'day') + (days.length ? ' (' + days.join(', ') + ')' : ''));
    if (mins > 0) train.push(mins + ' min');
    add('Training', train.join(' · '));
    add('Equipment', (Array.isArray(a.equipment) ? a.equipment : []).map(str).filter(Boolean).join(', '));
    var inj = a.injuries && typeof a.injuries === 'object' ? a.injuries : {};
    var parts = (Array.isArray(inj.parts) ? inj.parts : []).map(str).filter(Boolean), note = str(inj.note);
    add('Injuries', [parts.join(', '), note ? '“' + note + '”' : ''].filter(Boolean).join(' · '));
    add('Goals', a.goals);
    var m = a.meet && typeof a.meet === 'object' ? a.meet : null;
    if (m) {
      var meetFed = str(m.federation), meetLine = [str(m.name), ymd(m.date) ? shortDate(m.date, today) : ''].filter(Boolean).join(' · ');
      add('Next meet', meetLine ? meetLine + (meetFed ? ' (' + meetFed + ')' : '') : meetFed);
    }
    var ig = str(a.instagram).replace(/^@+/, '');
    add('Contact', [str(a.phone), ig ? '@' + ig : '', str(a.timezone)].filter(Boolean).join(' · '));
    add('Notes', a.notes);
    return out;
  }

  window.Clients = {
    nextDueAfter: nextDueAfter, clientStatus: clientStatus, clientsSummary: clientsSummary,
    formatMoney: formatMoney, cadenceLabel: cadenceLabel, priceText: priceText, monthlyCents: monthlyCents,
    recordPayment: recordPayment, intakeMaxes: intakeMaxes, intakeLines: intakeLines,
    CADENCES: CADENCES, METHODS: METHODS, STATUSES: STATUSES
  };
})();
