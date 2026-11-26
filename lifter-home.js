/* lifter-home.js: Home, the lifter's desk on a laptop (rebuilt 26 Nov 2026; the owner on the week-first Home: "home is
   a very big mess. I can't understand anything. I can't do anything. I can't access anything. [...] they are
   realistically going to use it to either track their progress or log in their details or something if they want to
   contact their coach").

   A lifter at a desk does three things, in this order: sees how they are progressing, enters their details, talks to
   their coach. Training stays one click away and is the smallest thing on the page. Four tiles, nothing else:
     1. Progress (full width): the estimated total, the three lifts as buttons, one chart of the estimated max per lift
        over time (a lift button isolates its line), a range (8 weeks / 16 weeks / 1 year, only those with data).
     2. Log: bodyweight logged in place (the weigh-in sheet's own save, saveBodyweightEntry), this week's check-in and
        the coach's questions, and plain links (bodyweight history, goals, the meet). Training alone, the rows are the
        lifter's own details instead: their goals and their meet.
     3. Coach (coached): the newest thing the coach said, a reply box (the Coach tab's own send: the same demo echo, the
        same DB.sendMessage and push), Messages, Send a form check. Solo: Program, the block as a strip of weeks,
        the next session and the screen's one crimson button, Edit program.
     4. This week: the week's sessions as plain rows (weekday, name, state in a word), Open session on today's row,
        Log a past session (Train's own picker) and the program in its foot.
   At 1440 by 775 (the owner's window) the four tiles end above the demo bar: nothing to press sits under it.

   Where it shows: the website at laptop width only (html:not(.native), min-width 901 px). athlete.html carries the
   tab (#tab-home, first in the sidebar) and the pane (section[data-pane="home"]); lifter-home.css hides both on a
   phone, in the iPhone app and in a window of 900 px and under, where nothing changes. A laptop lands here unless the
   address names a tab (?tab=) or a hash. A window pulled under 901 px while Home is open moves to Train.

   What it writes: only through the app's own paths, which already keep the demo (window._demoMode) off the network:
   a weigh-in (saveBodyweightEntry), a message (the thread's own demo echo / DB.sendMessage). Everything else opens the
   app's own screens and sheets. Coach- and lifter-written text always goes in as text (el(..., text) / textContent).

   Every number comes from the Store through the app's own helpers: the estimated maxes from Progress's own
   _progTotalSeries (the running best, what Progress's hero shows) and strengthSeries (the weekly best, what Progress's
   chart draws), the weigh-ins from _bwSeries, the meet line from meetWeighOf / deskNextMeet, the week from lhWeek.

   Pure parts (unit-tested in tests.html "lifter home (lifter-home.js)"): lhWeek, lhWeekRows, lhStateWord,
   lhChangeWords, lhRanges, lhBase, lhNiceTicks, lhChartModel, lhBwSummary, lhBlockStrip. */
(function () {
  'use strict';

  /* =====================================================================================
     PURE
     ===================================================================================== */
  var DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var MAIN = ['squat', 'bench', 'deadlift'];
  var RANGES = [8, 16, 52];

  function d10(v) { return String(v == null ? '' : v).slice(0, 10); }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z')); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dow(iso) { return (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7; }   // Mon 0 … Sun 6
  function monday(iso) { return addDays(iso, -dow(iso)); }
  // "Thu 26 Nov", "26 Nov", "Thursday 26 November": fixed English names, the same on every machine.
  function dayText(iso) { var p = iso.split('-'); return DAY_SHORT[dow(iso)] + ' ' + Number(p[2]) + ' ' + MONTH[Number(p[1]) - 1]; }
  function dateText(iso) { var p = iso.split('-'); return Number(p[2]) + ' ' + MONTH[Number(p[1]) - 1]; }
  function longDate(iso) { var p = iso.split('-'); return DAY_LONG[dow(iso)] + ' ' + Number(p[2]) + ' ' + MONTH_LONG[Number(p[1]) - 1]; }
  function weekdayLong(iso) { return DAY_LONG[dow(iso)]; }
  function fmtNum(v) { return String(Math.round(Number(v) * 10) / 10); }

  function setsOf(day) {
    var out = [];
    ((day && day.exercises) || []).forEach(function (e) { ((e && e.sets) || []).forEach(function (s) { if (s) out.push(s); }); });
    return out;
  }
  // A day's sets: how many, done, still to do (not logged, not skipped: athlete.html setOpen), and the date most of
  // its sets were logged on (a tie goes to the later date).
  function dayStatus(day) {
    var ss = setsOf(day), done = 0, open = 0, by = {};
    ss.forEach(function (s) {
      if (s.completed) { done++; var d = d10(s.completedAt); if (isIso(d)) by[d] = (by[d] || 0) + 1; }
      else if (!s.skipped) open++;
    });
    var on = null, n = 0;
    Object.keys(by).sort().forEach(function (d) { if (by[d] >= n) { n = by[d]; on = d; } });
    return { total: ss.length, done: done, open: open, doneOn: on };
  }
  // A weekday they train on: the same weekday in at least `need` of the `weeks` before iso (desk-day.js habitOn).
  function habitOn(has, iso, weeks, need) {
    weeks = weeks || 4; need = need || 3;
    var n = 0;
    for (var k = 1; k <= weeks; k++) if (has(addDays(iso, -7 * k))) n++;
    return n >= need;
  }

  // The seven days, Monday to Sunday, of the week holding `today` (athlete.html mondayOf: the app's own week).
  // o: { prog: { weeks: [{ days: [{ name, scheduledDate, exercises: [{ sets }] }] }] } | null, today: 'YYYY-MM-DD',
  //      logDates: [iso] (dates with a logged set, cardio left out), restDates: [iso] (marked rest days),
  //      usual: ['Mon', …] | null (the intake's days), next: { wi, di } | null (the session Train offers next) }
  // → { mon, sun, today, week (the program week's index, or null), unplaced: [{ wi, di }],
  //     days: [{ iso, idx, isToday, past, kind: 'session' | 'logged' | 'rest', ref: { wi, di } | null, more,
  //              how: 'logged' | 'pinned' | 'usual' | null, marked (a rest day they marked), state, done, total }] }
  // state: 'done' | 'skipped' | 'unfinished' (logged in part on a past day) | 'today' | 'tocome' | 'missed' | null
  // A session belongs to the date it was logged on (most of its sets), else the date it is pinned to; the sessions of
  // this program week still to do and on no date go, in order, onto the days ahead the lifter usually trains.
  function lhWeek(o) {
    o = o || {};
    var t = d10(o.today);
    if (!isIso(t)) return null;
    var mon = monday(t), sun = addDays(mon, 6);
    var weeks = (o.prog && o.prog.weeks) || [];
    var logSet = {}; (o.logDates || []).forEach(function (d) { d = d10(d); if (isIso(d)) logSet[d] = 1; });
    var restSet = {}; (o.restDates || []).forEach(function (d) { d = d10(d); if (isIso(d)) restSet[d] = 1; });
    var bound = {}, refs = [];
    weeks.forEach(function (w, wi) {
      ((w && w.days) || []).forEach(function (d, di) {
        var st = dayStatus(d);
        if (!st.total) return;   // a rest day in the program, or an empty one
        var sch = d10(d.scheduledDate);
        var iso = st.done > 0 ? st.doneOn : (isIso(sch) ? sch : null);
        var r = { wi: wi, di: di, st: st, iso: iso };
        refs.push(r);
        if (iso && iso >= mon && iso <= sun) (bound[iso] = bound[iso] || []).push(r);
      });
    });
    var wk = null;
    if (bound[t]) wk = bound[t][0].wi;
    else if (o.next && o.next.wi != null) wk = o.next.wi;
    else Object.keys(bound).forEach(function (k) { bound[k].forEach(function (r) { if (wk == null || r.wi > wk) wk = r.wi; }); });
    var usual = (o.usual || []).map(String).filter(function (x) { return DAY_SHORT.indexOf(x) >= 0; });
    var trainsOn = function (iso) { return usual.length ? usual.indexOf(DAY_SHORT[dow(iso)]) >= 0 : habitOn(function (d) { return !!logSet[d]; }, iso); };
    var toPlace = wk == null ? [] : refs.filter(function (r) { return r.wi === wk && r.st.open > 0 && r.st.done === 0 && !r.iso; });
    var placed = {}, unplaced = [];
    var free = [];
    for (var i = 0; i < 7; i++) {
      var di = addDays(mon, i);
      if (di < t || bound[di] || logSet[di] || restSet[di]) continue;
      if (trainsOn(di)) free.push(di);
    }
    toPlace.forEach(function (r, k) {
      if (k < free.length) placed[free[k]] = r;
      else unplaced.push({ wi: r.wi, di: r.di });
    });
    var stateOf = function (st, iso) {
      if (st.open === 0) return st.done > 0 ? 'done' : 'skipped';
      if (iso === t) return 'today';
      if (st.done > 0) return 'unfinished';
      return iso < t ? 'missed' : 'tocome';
    };
    var days = [];
    for (var j = 0; j < 7; j++) {
      var iso = addDays(mon, j), b = bound[iso] || [];
      var started = b.some(function (r) { return r.st.done > 0; });
      var e = { iso: iso, idx: j, isToday: iso === t, past: iso < t, kind: 'rest', ref: null, more: 0, how: null, marked: false, state: null, done: 0, total: 0 };
      if (b.length && (started || !restSet[iso])) {
        var r0 = b[0];
        e.kind = 'session'; e.ref = { wi: r0.wi, di: r0.di }; e.more = b.length - 1; e.how = started ? 'logged' : 'pinned';
        e.state = stateOf(r0.st, iso); e.done = r0.st.done; e.total = r0.st.total;
      } else if (logSet[iso]) {
        e.kind = 'logged'; e.how = 'logged'; e.state = 'done';
      } else if (restSet[iso]) {
        e.marked = true;
      } else if (placed[iso]) {
        var p = placed[iso];
        e.kind = 'session'; e.ref = { wi: p.wi, di: p.di }; e.how = 'usual'; e.state = iso === t ? 'today' : 'tocome'; e.done = 0; e.total = p.st.total;
      }
      days.push(e);
    }
    return { mon: mon, sun: sun, today: t, week: wk, days: days, unplaced: unplaced };
  }

  // A day's state in one word a lifter would say.
  var STATE_WORD = { done: 'Done', skipped: 'Skipped', unfinished: 'Part done', today: 'Today', tocome: 'To come', missed: 'Missed' };
  function lhStateWord(d) {
    if (!d || d.kind === 'rest') return '';
    if (d.isToday && d.state !== 'done' && d.state !== 'skipped') return 'Today';
    return STATE_WORD[d.state] || '';
  }
  // This week's tile: the days with training on them (rest days left out), in order, at most `max` (6). When there are
  // more, today's row is always kept. → [day] (lhWeek's day objects)
  function lhWeekRows(week, max) {
    if (!week) return [];
    max = max || 6;
    var rows = week.days.filter(function (d) { return d.kind !== 'rest'; });
    if (rows.length <= max) return rows;
    var ti = rows.findIndex(function (d) { return d.isToday; });
    var start = ti < 0 ? 0 : Math.min(Math.max(0, ti - Math.floor(max / 2)), rows.length - max);
    return rows.slice(start, start + max);
  }

  // The move of a number over a span, in words: "Up 12.5 kg in 16 weeks", "Level over 16 weeks", "Down 5 kg in a year",
  // "Up 10 kg since 5 Oct". delta in the lifter's unit; span: { weeks } or { since: iso }. Under half a unit is level.
  function lhChangeWords(delta, unit, span) {
    var d = Math.round(Number(delta) * 2) / 2;
    span = span || {};
    var spanIn = span.since ? 'since ' + dateText(span.since) : span.weeks === 52 ? 'in a year' : 'in ' + span.weeks + ' weeks';
    var spanOver = span.since ? 'since ' + dateText(span.since) : span.weeks === 52 ? 'over a year' : 'over ' + span.weeks + ' weeks';
    if (!isFinite(d) || Math.abs(d) < 0.5) return 'Level ' + spanOver;
    return (d > 0 ? 'Up ' : 'Down ') + fmtNum(Math.abs(d)) + ' ' + unit + ' ' + spanIn;
  }
  // Which ranges have data: 8 weeks once anything is logged, 16 once the first rated set is older than 8 weeks, a year
  // once it is older than 16. firstIso: the first rated set's date. → [8, 16, 52] or a part of it
  function lhRanges(firstIso, today) {
    firstIso = d10(firstIso); today = d10(today);
    if (!isIso(firstIso) || !isIso(today)) return [];
    var out = [8];
    if (firstIso < addDays(today, -56)) out.push(16);
    if (firstIso < addDays(today, -112)) out.push(52);
    return out;
  }
  // The point a range is measured from: the last point on or before the cutoff, else the first point after it
  // (since: its date). series: [{ date, … }] oldest first. → { pt, since: iso | null } | null
  function lhBase(series, cutoff) {
    if (!series || !series.length) return null;
    var before = null;
    series.forEach(function (p) { if (p.date <= cutoff) before = p; });
    if (before) return { pt: before, since: null };
    return { pt: series[0], since: series[0].date };
  }
  // Round gridlines for a value range: 3 to 5 ticks on a step of 1, 2, 2.5 or 5 times a power of ten.
  // → { lo, hi, step, ticks: [v] }
  function lhNiceTicks(min, max) {
    if (!isFinite(min) || !isFinite(max)) return { lo: 0, hi: 1, step: 1, ticks: [0, 1] };
    if (max - min < 1) { min -= 2.5; max += 2.5; }
    var span = max - min, raw = span / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).find(function (s) { return span / s <= 4.5; }) || 10 * mag;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    if (hi === lo) hi = lo + step;
    var ticks = [];
    for (var v = lo; v <= hi + step / 1000; v += step) ticks.push(Math.round(v * 100) / 100);
    return { lo: lo, hi: hi, step: step, ticks: ticks };
  }
  // The chart's geometry, pure. o: { series: { squat: [{ week: iso Monday, value }] … } (already in the lifter's unit),
  // weeks (how many, ending this week), today, w, h, pad: { l, r, t, b } }
  // → { start (the first Monday), n, x(i), yTicks: [{ v, y }], xTicks: [{ i, x, label }],
  //     lines: { lift: { d, pts: [{ i, x, y, v }] } }, byWeek: [{ i, week, x, values: { lift: v } }] }
  function lhChartModel(o) {
    var n = o.weeks, pad = o.pad || { l: 44, r: 12, t: 8, b: 24 };
    var start = addDays(monday(d10(o.today)), -7 * (n - 1));
    var pw = Math.max(10, o.w - pad.l - pad.r), ph = Math.max(10, o.h - pad.t - pad.b);
    var x = function (i) { return pad.l + (n > 1 ? pw * i / (n - 1) : pw / 2); };
    var idxOf = function (wk) { return Math.round((Date.parse(wk + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) / (7 * 864e5)); };
    var all = [];
    var keep = {};
    MAIN.forEach(function (l) {
      keep[l] = ((o.series && o.series[l]) || []).map(function (p) { return { i: idxOf(d10(p.week)), v: Number(p.value) }; })
        .filter(function (p) { return p.i >= 0 && p.i < n && isFinite(p.v) && p.v > 0; });
      keep[l].forEach(function (p) { all.push(p.v); });
    });
    var nt = all.length ? lhNiceTicks(Math.min.apply(null, all), Math.max.apply(null, all)) : lhNiceTicks(0, 100);
    var y = function (v) { return pad.t + ph * (1 - (v - nt.lo) / (nt.hi - nt.lo)); };
    var lines = {}, byWeek = [];
    for (var i = 0; i < n; i++) byWeek.push({ i: i, week: addDays(start, 7 * i), x: x(i), values: {} });
    MAIN.forEach(function (l) {
      var pts = keep[l].map(function (p) { return { i: p.i, x: x(p.i), y: y(p.v), v: p.v }; });
      pts.forEach(function (p) { byWeek[p.i].values[l] = p.v; });
      lines[l] = { d: pts.map(function (p, k) { return (k ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' '), pts: pts };
    });
    var every = n <= 8 ? 2 : n <= 16 ? 4 : 13;
    var xTicks = [];
    for (var k = (n - 1) % every; k < n; k += every) xTicks.push({ i: k, x: x(k), label: dateText(addDays(start, 7 * k)) });
    return { start: start, n: n, x: x, yTicks: nt.ticks.map(function (v) { return { v: v, y: y(v) }; }), xTicks: xTicks, lines: lines, byWeek: byWeek };
  }
  // The weigh-ins in one line's worth: the last one, and the average of those in the 7 days to today.
  // list: [{ date, weight }] oldest first. → { last, avg7 (or null), n7 } | null
  function lhBwSummary(list, today) {
    if (!list || !list.length) return null;
    var last = list[list.length - 1], from = addDays(d10(today), -6);
    var wk = list.filter(function (b) { return b.date >= from && b.date <= d10(today) && Number(b.weight) > 0; });
    var avg = wk.length ? wk.reduce(function (a, b) { return a + Number(b.weight); }, 0) / wk.length : null;
    return { last: last, avg7: avg, n7: wk.length };
  }
  // The block as a strip of weeks: done (every session with sets done or skipped), now (the week in hand), to come.
  // → [{ n (the week's number), state: 'done' | 'now' | 'tocome' }]
  function lhBlockStrip(prog, cur) {
    return ((prog && prog.weeks) || []).map(function (w, wi) {
      var sess = ((w && w.days) || []).map(dayStatus).filter(function (s) { return s.total > 0; });
      var finished = sess.length > 0 && sess.every(function (s) { return s.open === 0; });
      var state = wi === cur ? 'now' : (finished || (cur != null && wi < cur)) ? 'done' : 'tocome';
      return { n: Number((w && w.number) || wi + 1), state: state };
    });
  }

  var Core = { lhWeek: lhWeek, lhWeekRows: lhWeekRows, lhStateWord: lhStateWord, lhChangeWords: lhChangeWords, lhRanges: lhRanges,
    lhBase: lhBase, lhNiceTicks: lhNiceTicks, lhChartModel: lhChartModel, lhBwSummary: lhBwSummary, lhBlockStrip: lhBlockStrip,
    dayText: dayText, dateText: dateText, longDate: longDate, weekdayLong: weekdayLong, monday: monday, addDays: addDays };
  if (typeof window !== 'undefined') {
    window.LifterHomeCore = Core;
    window.lhWeek = lhWeek; window.lhWeekRows = lhWeekRows; window.lhStateWord = lhStateWord; window.lhChangeWords = lhChangeWords;
    window.lhRanges = lhRanges; window.lhBase = lhBase; window.lhNiceTicks = lhNiceTicks; window.lhChartModel = lhChartModel;
    window.lhBwSummary = lhBwSummary; window.lhBlockStrip = lhBlockStrip;
  }
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.documentElement || !document.addEventListener) return;

  /* =====================================================================================
     THE SCREEN
     ===================================================================================== */
  var LAPTOP = '(min-width: 901px)';
  var SVGNS = 'http://www.w3.org/2000/svg';
  var lastV = -1, lastTheme = null, timer = null, msgCache = null, rendering = false;
  var focusLift = null;   // the lift isolated on the chart, or null for all three
  var rangeW = null;      // the chart's range in weeks (8, 16, 52); null = 16, or the longest there is
  var draft = '';         // what is typed in the reply box, kept across redraws
  var bwDraft = '';       // the weight typed, kept across redraws
  var hoverI = null;      // the week read out on the chart

  function isLaptop() {
    var h = document.documentElement;
    return !h.classList.contains('native') && !!(window.matchMedia && matchMedia(LAPTOP).matches);
  }
  function tab(id) { return document.getElementById('tab-' + id); }
  function pane() { return document.getElementById('pane-home'); }
  function shown() { var p = pane(); return !!p && !p.classList.contains('hidden'); }
  function me() { return typeof user !== 'undefined' && user ? user : (window._user || null); }
  function prog() { try { return typeof getProgram === 'function' ? getProgram() : null; } catch (e) { return null; } }
  function today() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function coach() { var u = me(); return u && u.coachId ? ((Store.get().coaches || []).find(function (c) { return c.id === u.coachId; }) || null) : null; }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function dayOf(p, ref) { var w = p && p.weeks[ref.wi]; return { wk: w, day: w && w.days[ref.di] }; }
  function theme() { var h = document.documentElement; return (h.getAttribute('data-theme') || '') + '|' + h.className; }
  function soft(label, onClick, extra) {
    var b = el('button', { class: 'ui-btn-soft lh-btn' + (extra ? ' ' + extra : ''), type: 'button' }, label);
    b.addEventListener('click', onClick);
    return b;
  }
  function link(label, onClick, extra) {
    var b = el('button', { class: 'lh-link' + (extra ? ' ' + extra : ''), type: 'button' }, label);
    b.addEventListener('click', onClick);
    return b;
  }
  function tile(name, cls) { return el('section', { class: 'ui-card lh-tile ' + cls, 'data-tile': name, 'aria-labelledby': 'lh-t-' + name }); }
  function title(name, text) { return el('h3', { class: 'lh-title', id: 'lh-t-' + name }, text); }
  function unit() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function disp(kg) { return Number(kgToDisplay(kg)); }
  function svgEl(tag, attrs) { var n = document.createElementNS(SVGNS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); return n; }

  // The session Train offers next (athlete.html: a session planned for a later day first, else the next one in the program).
  function nextRef(p, date) {
    if (!p || typeof findNextIncompleteDay !== 'function') return null;
    var n = findNextIncompleteDay(date);
    var ahead = typeof _nextPlannedAhead === 'function' ? _nextPlannedAhead(date) : null;
    if (ahead && (!n || ahead.ord < _dayOrd(n))) n = ahead;
    if (!n) return null;
    var wi = p.weeks.indexOf(n.wk), di = wi >= 0 ? (p.weeks[wi].days || []).indexOf(n.day) : -1;
    return wi >= 0 && di >= 0 ? { wi: wi, di: di } : null;
  }
  function usualDays(u) {
    var i = (Store.get().intakes || []).filter(function (x) { return x.athleteId === u.id; })[0];
    return i && i.answers && Array.isArray(i.answers.days) ? i.answers.days : null;
  }
  function myLogs(u) {
    var all = typeof rosterLogsFor === 'function' ? rosterLogsFor(u.id) : (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === u.id; });
    return all.filter(function (l) { return l.lift !== 'cardio'; });
  }
  function buildWeek(p) {
    var u = me(), t = today();
    var logs = myLogs(u);
    return lhWeek({
      prog: p, today: t,
      logDates: logs.map(function (l) { return l.date; }),
      restDates: (Store.get().restDays || []).filter(function (r) { return r.athleteId === u.id; }).map(function (r) { return r.date; }),
      usual: usualDays(u),
      next: nextRef(p, t)
    });
  }

  // ---- opening the app's own screens ----
  function openOnTrain(ref, iso) {
    var p = prog(); var x = dayOf(p, ref);
    if (!x.day) { openTrain(); return; }
    var sel = document.getElementById('daySelect'), sd = document.getElementById('sessionDate');
    if (sd) sd.value = iso;
    if (sel) sel.value = _dayKey(x.wk, x.day);
    try { refreshPinButtons(); } catch (e) {}
    try { renderToday(); } catch (e) {}
    tab('today').click();
  }
  function openTrain() { try { populateDaySelect(); renderToday(); } catch (e) {} tab('today').click(); }
  // Train's own session picker (its "Log another date" row is the way to log a day already trained).
  function openLogSession() {
    openTrain();
    var p = prog();
    if (p && (p.weeks || []).length && typeof openSessionPicker === 'function') setTimeout(function () { try { openSessionPicker(); } catch (e) {} }, 60);
  }
  function openCoach(view) { try { sessionStorage.setItem('powa-coach-view', view || 'messages'); } catch (e) {} tab('coach').click(); }
  function openProgress() { try { sessionStorage.setItem('powa-prog-subtab', 'overview'); } catch (e) {} tab('progress').click(); }
  function openProgram() { var t = tab('program'); if (t) t.click(); }

  // ---- the head ----
  function headBlock(p, week) {
    var head = el('div', { class: 'lh-head' });
    head.appendChild(el('h2', { class: 'lh-h' }, 'Home'));
    var line = [longDate(week.today)];
    if (p && week.week != null && p.weeks[week.week]) line.push((p.name ? String(p.name) + ', w' : 'W') + 'eek ' + Number(p.weeks[week.week].number || week.week + 1) + ' of ' + p.weeks.length);
    head.appendChild(el('p', { class: 'lh-sub' }, line.join(' · ')));
    return head;
  }

  /* ---------- 1. Progress ---------- */
  function progressTile(u) {
    var card = tile('progress', 'lh-prog');
    var logs = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === u.id && l.lift !== 'cardio'; });
    var rated = logs.filter(function (l) { return MAIN.indexOf(l.lift) >= 0 && Number(l.e1rmComp) > 0; });
    var t = today(), un = unit();
    if (!rated.length || typeof _progTotalSeries !== 'function' || typeof strengthSeries !== 'function') {
      card.classList.add('is-empty');
      card.appendChild(title('progress', 'Progress'));
      card.appendChild(el('p', { class: 'lh-quiet' }, 'Your estimated total, and a line for squat, bench and deadlift, show here once you log a set of one of them with an RPE.'));
      card.appendChild(el('div', { class: 'lh-foot' }, soft('Go to Train', openTrain)));
      return card;
    }
    var first = rated.reduce(function (m, l) { return l.date < m ? l.date : m; }, rated[0].date);
    var ranges = lhRanges(first, t);
    if (rangeW == null || ranges.indexOf(rangeW) < 0) rangeW = ranges.indexOf(16) >= 0 ? 16 : ranges[ranges.length - 1];
    var series = _progTotalSeries(rated);
    var lastPt = series[series.length - 1];
    var base = lhBase(series, addDays(t, -7 * rangeW));
    var span = base && base.since ? { since: base.since } : { weeks: rangeW };

    // the left: the total, its move, the three lifts as buttons
    var sum = el('div', { class: 'lh-prog-sum' });
    sum.appendChild(title('progress', 'Progress'));   // the tile's name leads it, as on the other three
    var tv = el('p', { class: 'lh-total', 'aria-describedby': 'lh-total-k' });
    tv.appendChild(document.createTextNode(String(Math.round(disp(lastPt.total)))));
    tv.appendChild(el('small', {}, un));
    tv.appendChild(el('span', { class: 'lh-total-k', id: 'lh-total-k' }, 'Estimated total'));
    sum.appendChild(tv);
    sum.appendChild(el('p', { class: 'lh-chg' }, base ? lhChangeWords(disp(lastPt.total) - disp(base.pt.total), un, span) : ''));
    var lifts = el('div', { class: 'lh-lifts', role: 'group', 'aria-label': 'Show one lift on the chart' });
    var lc = typeof liftColors === 'function' ? liftColors() : {};   // the chart's own colours (the light theme's are darker)
    MAIN.forEach(function (lift) {
      var now = lastPt[lift] || 0;
      var on = focusLift === lift;
      var b = el('button', { type: 'button', class: 'lh-lift lift-' + lift + (on ? ' is-on' : '') + (focusLift && !on ? ' is-dim' : ''), 'aria-pressed': on ? 'true' : 'false', 'data-lift': lift });
      b.appendChild(el('span', { class: 'lift-dot lift-' + lift, 'aria-hidden': 'true', style: lc[lift] ? 'background:' + lc[lift] : '' }));
      b.appendChild(el('span', { class: 'lh-lift-n' }, LIFT_LABELS[lift]));
      var v = el('span', { class: 'lh-lift-v' });
      if (now) { v.appendChild(document.createTextNode(String(Math.round(disp(now))))); v.appendChild(el('small', {}, ' ' + un)); }
      else v.appendChild(el('small', {}, 'Not logged'));
      b.appendChild(v);
      var d = now && base && base.pt[lift] ? Math.round((disp(now) - disp(base.pt[lift])) * 2) / 2 : null;
      var dTxt = d == null ? '' : Math.abs(d) < 0.5 ? 'Level' : (d > 0 ? '+' : '−') + fmtNum(Math.abs(d));
      b.appendChild(el('span', { class: 'lh-lift-d' + (d > 0 ? ' is-up' : '') }, dTxt));
      b.setAttribute('aria-label', LIFT_LABELS[lift] + ', estimated max ' + (now ? Math.round(disp(now)) + ' ' + un : 'not logged') +
        (d == null ? '' : ', ' + lhChangeWords(d, un, span).toLowerCase()) + (on ? '. Shown alone on the chart' : ''));
      b.addEventListener('click', function () { focusLift = focusLift === lift ? null : lift; render(); var nb = document.querySelector('#homeArea .lh-lift[data-lift="' + lift + '"]'); if (nb) nb.focus(); });
      lifts.appendChild(b);
    });
    sum.appendChild(lifts);
    card.appendChild(sum);

    // the right: the readout, the range and Open Progress on one line, the chart under them
    var side = el('div', { class: 'lh-prog-chart' });
    var top = el('div', { class: 'lh-prog-top' });
    var read = el('p', { class: 'lh-readout', id: 'lh-readout', 'aria-live': 'polite' });
    top.appendChild(read);
    var acts = el('div', { class: 'lh-prog-acts' });
    if (ranges.length > 1) {
      var seg = el('div', { class: 'lh-range', role: 'group', 'aria-label': 'Chart range' });
      ranges.forEach(function (r) {
        var on = r === rangeW;
        var rb = el('button', { type: 'button', class: on ? 'is-on' : '', 'aria-pressed': on ? 'true' : 'false', 'data-range': r }, r === 52 ? '1 year' : r + ' weeks');
        rb.addEventListener('click', function () { if (rangeW === r) return; rangeW = r; hoverI = null; render(); var nb = document.querySelector('#homeArea .lh-range [data-range="' + r + '"]'); if (nb) nb.focus(); });
        seg.appendChild(rb);
      });
      acts.appendChild(seg);
    }
    acts.appendChild(soft('Open Progress', openProgress));
    top.appendChild(acts);
    side.appendChild(top);
    var host = el('div', { class: 'lh-chart' });
    side.appendChild(host);
    card.appendChild(side);
    var ser = {};
    MAIN.forEach(function (l) { ser[l] = strengthSeries(rated, l, { today: t, weeks: rangeW }).map(function (p) { return { week: p.week, value: disp(p.value) }; }); });
    card._drawChart = function () { drawChart(host, read, ser, t, un); };
    return card;
  }

  // The chart: three lines in the lift colours, week ticks, the lifter's unit, a readout that follows the pointer or the
  // arrow keys. Drawn once the tile is on the page (it measures its width).
  function drawChart(host, read, ser, t, un) {
    var w = Math.max(240, Math.round(host.clientWidth || 600)), h = Math.max(120, Math.round(host.clientHeight || 170));
    var m = lhChartModel({ series: ser, weeks: rangeW, today: t, w: w, h: h, pad: { l: 40, r: 10, t: 10, b: 24 } });
    var lc = typeof liftColors === 'function' ? liftColors() : {};
    var label = function (bw) {
      var parts = MAIN.filter(function (l) { return bw.values[l] != null; }).map(function (l) { return LIFT_LABELS[l] + ' ' + Math.round(bw.values[l]); });
      return 'Week of ' + dateText(bw.week) + ': ' + (parts.length ? parts.join(', ') + ' ' + un : 'nothing rated');
    };
    var withData = m.byWeek.filter(function (bw) { return Object.keys(bw.values).length; });
    var lastI = withData.length ? withData[withData.length - 1].i : m.n - 1;
    var summary = 'Estimated max per lift over the last ' + (rangeW === 52 ? 'year' : rangeW + ' weeks') + '. ' + MAIN.map(function (l) {
      var pts = m.lines[l].pts;
      return pts.length ? LIFT_LABELS[l] + ' from ' + Math.round(pts[0].v) + ' to ' + Math.round(pts[pts.length - 1].v) + ' ' + un : LIFT_LABELS[l] + ' not logged in this range';
    }).join('. ') + '.';
    var svg = svgEl('svg', { class: 'lh-svg', viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, role: 'img', tabindex: '0', 'aria-label': summary + ' Use the arrow keys to read each week.' });
    m.yTicks.forEach(function (tk) {
      svg.appendChild(svgEl('line', { class: 'lh-grid', x1: 40, x2: w - 10, y1: tk.y.toFixed(1), y2: tk.y.toFixed(1) }));
      var tx = svgEl('text', { class: 'lh-ax', x: 32, y: (tk.y + 4).toFixed(1), 'text-anchor': 'end' }); tx.textContent = String(tk.v); svg.appendChild(tx);
    });
    m.xTicks.forEach(function (tk) {
      var tx = svgEl('text', { class: 'lh-ax', x: tk.x.toFixed(1), y: h - 6, 'text-anchor': tk.i === 0 ? 'start' : tk.i === m.n - 1 ? 'end' : 'middle' });
      tx.textContent = tk.label; svg.appendChild(tx);
    });
    var guide = svgEl('line', { class: 'lh-guide', x1: 0, x2: 0, y1: 10, y2: h - 24, visibility: 'hidden' });
    svg.appendChild(guide);
    var order = MAIN.filter(function (l) { return l !== focusLift; }).concat(focusLift ? [focusLift] : []);
    var marks = {};
    order.forEach(function (l) {
      var g = svgEl('g', { class: 'lh-ln lh-ln-' + l + (focusLift && focusLift !== l ? ' is-dim' : ''), style: 'color:' + (lc[l] || 'currentColor') });
      var L = m.lines[l];
      if (L.pts.length > 1) g.appendChild(svgEl('path', { d: L.d, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.25, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      if (L.pts.length) { var lp = L.pts[L.pts.length - 1]; g.appendChild(svgEl('circle', { cx: lp.x.toFixed(1), cy: lp.y.toFixed(1), r: 3.5, fill: 'currentColor' })); }
      marks[l] = svgEl('circle', { class: 'lh-mark', r: 4.5, cx: 0, cy: 0, fill: 'currentColor', visibility: 'hidden' });
      g.appendChild(marks[l]);
      svg.appendChild(g);
    });
    var yOf = function (l, v) { var lo = m.yTicks[0], hi = m.yTicks[m.yTicks.length - 1]; return lo.y + (hi.y - lo.y) * (v - lo.v) / (hi.v - lo.v); };
    var show = function (i, announce) {
      hoverI = i;
      var bw = m.byWeek[i];
      read.textContent = label(bw);
      if (!announce) read.setAttribute('aria-live', 'off'); else read.setAttribute('aria-live', 'polite');
      guide.setAttribute('x1', bw.x.toFixed(1)); guide.setAttribute('x2', bw.x.toFixed(1)); guide.setAttribute('visibility', 'visible');
      MAIN.forEach(function (l) {
        var v = bw.values[l];
        if (v == null) { marks[l].setAttribute('visibility', 'hidden'); return; }
        marks[l].setAttribute('cx', bw.x.toFixed(1)); marks[l].setAttribute('cy', yOf(l, v).toFixed(1)); marks[l].setAttribute('visibility', 'visible');
      });
    };
    var rest = function () { hoverI = null; read.setAttribute('aria-live', 'off'); read.textContent = label(m.byWeek[lastI]); guide.setAttribute('visibility', 'hidden'); MAIN.forEach(function (l) { marks[l].setAttribute('visibility', 'hidden'); }); };
    var near = function (clientX) {
      var r = svg.getBoundingClientRect(), px = (clientX - r.left) * (w / r.width);
      var best = 0; m.byWeek.forEach(function (bw) { if (Math.abs(bw.x - px) < Math.abs(m.byWeek[best].x - px)) best = bw.i; });
      return best;
    };
    svg.addEventListener('pointermove', function (e) { show(near(e.clientX), false); });
    svg.addEventListener('pointerleave', function () { if (document.activeElement !== svg) rest(); });
    svg.addEventListener('focus', function () { show(hoverI == null ? lastI : hoverI, true); });
    svg.addEventListener('blur', rest);
    svg.addEventListener('keydown', function (e) {
      var i = hoverI == null ? lastI : hoverI, to = null;
      if (e.key === 'ArrowLeft') to = Math.max(0, i - 1); else if (e.key === 'ArrowRight') to = Math.min(m.n - 1, i + 1);
      else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = m.n - 1;
      if (to == null) return;
      e.preventDefault(); show(to, true);
    });
    host.innerHTML = '';
    host.appendChild(svg);
    if (hoverI != null && hoverI < m.n) show(hoverI, false); else rest();
  }

  /* ---------- 2. Log ---------- */
  function goalLine(u, lastKg) {
    var g = (Store.get().goals || []).find(function (x) { return x.athleteId === u.id; });
    if (!g || !(Number(g.bodyweight) > 0) || !(lastKg > 0)) return '';
    var off = Math.round((disp(lastKg) - disp(g.bodyweight)) * 10) / 10, gv = fmtNum(disp(g.bodyweight)) + ' ' + unit();
    if (Math.abs(off) < 0.1) return 'At your ' + gv + ' goal';
    return fmtNum(Math.abs(off)) + ' ' + unit() + (off > 0 ? ' over' : ' under') + ' your ' + gv + ' goal';
  }
  // the lifter's targets in one line ("Squat 220 · Bench 150 · Deadlift 270 kg"), the total when no lift has one; '' when none
  function goalsText(u) {
    var g = (Store.get().goals || []).find(function (x) { return x.athleteId === u.id; });
    if (!g) return '';
    var parts = [];
    MAIN.forEach(function (l) { if (Number(g[l]) > 0) parts.push(LIFT_LABELS[l] + ' ' + Math.round(disp(g[l]))); });
    if (!parts.length && Number(g.total) > 0) parts.push('Total ' + Math.round(disp(g.total)));
    return parts.length ? parts.join(' · ') + ' ' + unit() : '';
  }
  function nextMeet(u, t) {
    var nm = typeof deskNextMeet === 'function' ? deskNextMeet(u.id, t) : null;
    if (nm && nm.meet) return { name: String(nm.meet.name || 'Your meet'), days: nm.days };
    var md = null; try { md = localStorage.getItem('powa-meet-date'); } catch (e) {}
    var dd = md && typeof daysUntil === 'function' ? daysUntil(md) : null;
    return dd != null && dd >= 0 ? { name: 'Your meet', days: dd } : null;
  }
  function row(label, sub, btn, cls) {
    var r = el('div', { class: 'lh-row' + (cls ? ' ' + cls : '') });
    var tx = el('div', { class: 'lh-row-t' });
    tx.appendChild(el('span', { class: 'lh-row-name' }, label));
    if (sub) tx.appendChild(el('span', { class: 'lh-row-sub' + (sub.cls ? ' ' + sub.cls : '') }, sub.text));
    r.appendChild(tx);
    if (btn) r.appendChild(btn);
    return r;
  }
  function logTile(u, c) {
    var card = tile('log', 'lh-log');
    card.appendChild(title('log', 'Log'));
    var t = today(), un = unit();
    var list = typeof _bwSeries === 'function' ? _bwSeries() : [];
    var bs = lhBwSummary(list, t);

    // bodyweight, logged in place through the weigh-in sheet's own save (saveBodyweightEntry)
    var form = el('form', { class: 'lh-bw', novalidate: '' });
    var lab = el('div', { class: 'lh-row-t' });
    lab.appendChild(el('label', { class: 'lh-row-name', for: 'lh-bw-in' }, 'Bodyweight'));
    // the weight class (the meet's, or the cut's) or the bodyweight goal, when there is one
    var aim = '';
    if (bs) {
      var ml = null; try { if (typeof applyLocalCut === 'function') applyLocalCut(); ml = meetWeighOf(u.id, t, getUnit() === 'lbs' ? 'lbs' : 'kg'); } catch (e) {}
      // the meet's line reads "Meet in 63 days · 0.1 kg over 83 · on pace": the meet has its own link in the foot
      aim = ml && ml.parts && ml.parts.length > 1 && /^meet/i.test(String(ml.parts[0])) ? String(ml.parts[1])
        : ml && ml.text ? String(ml.text) : goalLine(u, bs.last.weight);
    }
    if (aim) lab.appendChild(el('span', { class: 'lh-row-sub', id: 'lh-bw-aim' }, aim.charAt(0).toUpperCase() + aim.slice(1)));
    form.appendChild(lab);
    var box = el('span', { class: 'lh-bw-box' });
    var inp = el('input', { id: 'lh-bw-in', type: 'number', inputmode: 'decimal', step: '0.1', min: '20', max: '450', autocomplete: 'off',
      placeholder: bs ? fmtNum(Number(kgToDisplay(bs.last.weight, 1))) : '', 'aria-describedby': 'lh-bw-line' });
    inp.value = bwDraft;
    inp.addEventListener('input', function () { bwDraft = inp.value; });
    box.appendChild(inp);
    box.appendChild(el('span', { class: 'lh-bw-u', 'aria-hidden': 'true' }, un));
    form.appendChild(box);
    var go = el('button', { class: 'ui-btn-soft lh-btn', type: 'submit' }, 'Log');
    form.appendChild(go);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = Number(String(inp.value).replace(',', '.'));
      if (!(v > 0)) { toast('Enter your weight'); inp.focus(); return; }
      go.disabled = true;
      Promise.resolve(saveBodyweightEntry(t, displayToKg(v))).then(function (ok) {
        go.disabled = false;
        if (!ok) return;
        bwDraft = '';
        toast('Weigh-in saved · ' + v.toFixed(1) + ' ' + un);
        render();
        var n = document.getElementById('lh-bw-in'); if (n) n.focus();
      }, function () { go.disabled = false; });
    });
    card.appendChild(form);
    var line = [];
    if (bs) {
      line.push((bs.last.date === t ? 'Today ' : 'Last ') + fmtNum(Number(kgToDisplay(bs.last.weight, 1))) + ' ' + un + (bs.last.date === t ? '' : ', ' + dayText(bs.last.date)));
      if (bs.avg7 != null && bs.n7 > 1) line.push('7-day average ' + fmtNum(Number(kgToDisplay(bs.avg7, 1))) + ' ' + un);
    }
    card.appendChild(el('p', { class: 'lh-bw-line', id: 'lh-bw-line' }, line.length ? line.join(' · ') : 'No weigh-ins yet. One a morning makes a trend.'));

    var rows = el('div', { class: 'lh-rows' });
    if (c) {
      var wkStart = typeof mondayOf === 'function' ? mondayOf(t) : monday(t);
      var did = (Store.get().checkins || []).some(function (x) { return x.athleteId === u.id && x.weekStart === wkStart; });
      rows.appendChild(row('This week’s check-in', { text: did ? 'Done' : 'Due', cls: did ? 'is-ok' : 'is-due' },
        soft(did ? 'See it' : 'Check in', function () { openCheckinModal(wkStart); })));
      var due = typeof dueCheckinQuestions === 'function' ? dueCheckinQuestions(Store.get().checkinQuestions, Store.get().checkinAnswers, u.id) : [];
      if (due && due.length) rows.appendChild(row(firstName(c.name) + ' asks ' + due.length + (due.length === 1 ? ' question' : ' questions'), null, soft('Answer', function () { openCustomCheckinSheet(); })));
    }
    var mt = nextMeet(u, t);
    var mtWhen = mt ? (mt.days === 0 ? 'today' : mt.days + (mt.days === 1 ? ' day' : ' days')) : '';
    if (!c) {
      // training alone: no check-in goes anywhere, so the tile's rows are the lifter's own details (targets, the meet)
      var gt = goalsText(u);
      rows.appendChild(row('Goals', { text: gt || 'None set' }, soft(gt ? 'Edit' : 'Set goals', function () { openGoalsModal(); })));
      rows.appendChild(row(mt ? mt.name : 'Meet', { text: mt ? (mt.days === 0 ? 'Today' : 'In ' + mtWhen) : 'None set' }, soft(mt ? 'Open' : 'Add a meet', function () { openMeetSheet(); })));
    }
    card.appendChild(rows);

    var foot = el('div', { class: 'lh-foot lh-links' });
    foot.appendChild(link('Bodyweight history', function () { tab('bodyweight').click(); }));
    if (c) {
      foot.appendChild(link('Goals', function () { openGoalsModal(); }));
      if (mt) foot.appendChild(link(mt.name + ' · ' + mtWhen, function () { openMeetSheet(); }));
    }
    card.appendChild(foot);
    return card;
  }

  /* ---------- 3. Coach (or Program, training alone) ---------- */
  // The coach's newest words to this lifter: a session note or a message, whichever came last. → { text, at, voice, kind }
  function latestFromCoach(u, c) {
    var best = null;
    (Store.get().sessionNotes || []).forEach(function (n) {
      if (n.athleteId !== u.id || !n.coachComment) return;
      var at = String(n.coachCommentAt || n.date || '');
      if (!best || at > best.at) best = { text: String(n.coachComment), at: at, voice: null, kind: 'Session note' };
    });
    var msgs = window._demoMode ? (Store.get().messages || []) : (msgCache && msgCache.list) || [];
    msgs.forEach(function (m) {
      if (m.athleteId !== u.id || m.senderId !== c.id) return;
      var at = String(m.createdAt || '');
      if (best && at <= best.at) return;
      var voice = m.meta && m.meta.type === 'voice' && window.PowaVoice && PowaVoice.cleanMeta(m.meta) ? m : null;
      if (voice) best = { text: '', at: at, voice: voice, kind: 'Voice note' };
      else if (m.body && !(m.meta && m.meta.type)) best = { text: String(m.body), at: at, voice: null, kind: 'Message' };
    });
    return best;
  }
  function unreadFromCoach(u, c) {
    var msgs = window._demoMode ? (Store.get().messages || []) : (msgCache && msgCache.list) || null;
    if (!msgs) return 0;
    return msgs.filter(function (m) { return m.athleteId === u.id && m.senderId === c.id && !m.readAt; }).length;
  }
  // A real account's thread is read once a few minutes (a read, never a write), then Home draws again.
  function loadMessages(u, c) {
    if (window._demoMode || !c || typeof DB === 'undefined' || typeof DB.listMessages !== 'function') return;
    if (msgCache && (msgCache.busy || Date.now() - msgCache.at < 3 * 60000)) return;
    msgCache = { at: Date.now(), busy: true, list: msgCache ? msgCache.list : null };
    DB.listMessages(c.id, u.id).then(function (list) { msgCache = { at: Date.now(), busy: false, list: list || [] }; if (shown()) render(); })
      .catch(function () { msgCache = { at: Date.now(), busy: false, list: msgCache ? msgCache.list : null }; });
  }
  // The Coach tab's own send (app.js renderMessageThread doSend, which is not callable from outside its thread): the
  // demo keeps the message in the page's Store exactly as the thread does; a real account sends it with
  // DB.sendMessage and the same push to the coach. A thread whose link has ended takes no writes (msgThreadLive).
  function sendToCoach(u, c, body) {
    if (window._demoMode) {
      var msg = { id: 'demo-msg-' + Date.now(), coachId: c.id, athleteId: u.id, senderId: u.id, body: body, createdAt: new Date().toISOString(), readAt: null };
      var s = Store.get(); (s.messages || (s.messages = [])).push(msg);
      return Promise.resolve(msg);
    }
    return DB.sendMessage({ coachId: c.id, athleteId: u.id, senderId: u.id, body: body }).then(function (msg) {
      if (typeof DB.sendPush === 'function') {
        var from = ''; try { var cu = getCurrentUser(); from = firstName(cu && cu.name); } catch (e) {}
        DB.sendPush({ toUserId: c.id, title: from ? 'New message from ' + from : 'New message', body: body.slice(0, 140), url: '/coach.html', tag: 'powa-msg-' + c.id, category: 'messages' }).catch(function () {});
      }
      if (msgCache && msgCache.list && msg) msgCache.list.push(msg);
      return msg;
    });
  }
  function coachTile(u, c) {
    var first = firstName(c.name) || 'your coach';
    var card = tile('coach', 'lh-coach');
    loadMessages(u, c);
    var head = el('div', { class: 'lh-coach-head' });
    var who = el('div', { class: 'lh-who' });
    var k = el('span', { class: 'lh-k' }, 'Your coach');
    var un = unreadFromCoach(u, c);
    if (un) { k.appendChild(document.createTextNode(' · ')); k.appendChild(el('b', { class: 'lh-unread' }, un + ' unread')); }
    who.appendChild(k);
    who.appendChild(title('coach', first));
    head.appendChild(who);
    head.appendChild(soft('Messages', function () { openCoach('messages'); }));   // one word: beside "Your coach · 2 unread" in the narrowest column
    card.appendChild(head);

    var l = latestFromCoach(u, c);
    var said = el('div', { class: 'lh-said' });
    if (l) {
      if (l.text) said.appendChild(el('p', { class: 'lh-note' }, l.text));
      if (l.voice) said.appendChild(el('div', { class: 'lh-voice' }, PowaVoice.player(l.voice.meta, { messageId: l.voice.id, compact: true })));
      said.appendChild(el('p', { class: 'lh-when' }, l.kind + (isIso(d10(l.at)) ? ', ' + dayText(d10(l.at)) : '')));
    } else said.appendChild(el('p', { class: 'lh-quiet' }, 'Nothing from ' + first + ' yet. Say hello below.'));
    card.appendChild(said);

    var live = typeof msgThreadLive === 'function' ? msgThreadLive(c.id, u.id) : true;
    if (live) {
      var form = el('form', { class: 'lh-compose', novalidate: '' });
      var ta = el('textarea', { id: 'lh-reply', class: 'lh-reply', rows: '2', maxlength: '2000', placeholder: 'Write to ' + first, 'aria-label': 'Message ' + first });
      ta.value = draft;
      var send = el('button', { class: 'btn btn-primary lh-send' + (draft.trim() ? '' : ' is-empty'), type: 'submit', 'aria-disabled': draft.trim() ? 'false' : 'true' }, 'Send');
      var sync = function () { draft = ta.value; var has = !!ta.value.trim(); send.classList.toggle('is-empty', !has); send.setAttribute('aria-disabled', has ? 'false' : 'true'); };
      ta.addEventListener('input', sync);
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); } });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var body = ta.value.trim();
        if (!body || send.disabled) return;
        send.disabled = true; ta.disabled = true;
        sendToCoach(u, c, body).then(function () {
          draft = '';
          toastAction('Sent to ' + first, 'Open chat', function () { openCoach('messages'); });
          render();
          var n = document.getElementById('lh-reply'); if (n) n.focus();
        }, function (err) {
          send.disabled = false; ta.disabled = false;
          if (typeof msgLinkRefused === 'function' && msgLinkRefused(err)) { toast('Not sent: ' + msgClosedText(false, first), 6000); return; }
          console.error('sendMessage', err);
          toast('Could not send. Check your connection and try again.');
        });
      });
      form.appendChild(ta);
      form.appendChild(send);
      card.appendChild(form);
    } else card.appendChild(el('p', { class: 'lh-quiet' }, typeof msgClosedText === 'function' ? msgClosedText(false, first) : ''));
    var foot = el('div', { class: 'lh-foot lh-links' });
    foot.appendChild(link('Send a form check', function () { openCoach('forms'); }));
    card.appendChild(foot);
    return card;
  }
  function programTile(p, week, next) {
    var card = tile('program', 'lh-plan');
    if (!p) {
      card.appendChild(title('program', 'Program'));
      card.appendChild(el('p', { class: 'lh-quiet' }, 'No program yet. Set one up from your best lifts and the days you train, or write your own.'));
      var a = el('div', { class: 'lh-plan-acts' });
      var go = el('button', { class: 'btn btn-primary lh-cta', type: 'button' }, 'Set up your program');
      go.addEventListener('click', openTrain);
      a.appendChild(go);
      a.appendChild(link('Find a coach', function () { tab('coach').click(); }));
      card.appendChild(a);
      return card;
    }
    var who = el('div', { class: 'lh-who' });
    who.appendChild(el('span', { class: 'lh-k' }, 'Your program'));
    who.appendChild(title('program', String(p.name || 'Program')));
    card.appendChild(who);
    var cur = week.week;
    if (cur != null && p.weeks[cur]) card.appendChild(el('p', { class: 'lh-plan-wk' }, 'Week ' + Number(p.weeks[cur].number || cur + 1) + ' of ' + p.weeks.length));
    var strip = lhBlockStrip(p, cur);
    var s = el('ol', { class: 'lh-strip', 'aria-label': 'The block, week by week' });
    strip.forEach(function (x) {
      s.appendChild(el('li', { class: 'is-' + x.state, title: 'Week ' + x.n }, el('span', { class: 'lh-sr' }, 'Week ' + x.n + ': ' + (x.state === 'done' ? 'done' : x.state === 'now' ? 'this week' : 'to come'))));
    });
    card.appendChild(s);
    if (next) {
      var x0 = dayOf(p, next);
      var on = week.days.find(function (d) { return d.ref && d.ref.wi === next.wi && d.ref.di === next.di && !d.past; });
      card.appendChild(el('p', { class: 'lh-plan-next' }, 'Next: ' + String((x0.day && x0.day.name) || 'Session') + (on ? ', ' + (on.isToday ? 'today' : weekdayLong(on.iso)) : '')));
    } else card.appendChild(el('p', { class: 'lh-plan-next' }, 'Every session in this block is done.'));
    var acts = el('div', { class: 'lh-plan-acts' });
    var edit = el('button', { class: 'btn btn-primary lh-cta', type: 'button' }, 'Edit program');
    edit.addEventListener('click', openProgram);
    acts.appendChild(edit);
    acts.appendChild(link('Find a coach', function () { tab('coach').click(); }));
    card.appendChild(acts);
    return card;
  }

  /* ---------- 4. This week ---------- */
  function loggedName(u, iso) {
    var seen = [];
    myLogs(u).forEach(function (l) { if (l.date === iso && MAIN.indexOf(l.lift) >= 0 && seen.indexOf(l.lift) < 0) seen.push(l.lift); });
    var ls = seen.map(function (l) { return LIFT_LABELS[l]; });
    if (!ls.length) return 'Logged';
    return ls.length === 1 ? ls[0] : ls.slice(0, -1).join(', ') + ' and ' + ls[ls.length - 1].toLowerCase();
  }
  function weekTile(u, p, week, coached) {
    var card = tile('week', 'lh-wk');
    var wkHead = el('div', { class: 'lh-wk-head' });
    wkHead.appendChild(title('week', 'This week'));
    if (week.unplaced.length) wkHead.appendChild(el('span', { class: 'lh-wk-more' }, week.unplaced.length + ' more with no day yet'));
    card.appendChild(wkHead);
    var rows = lhWeekRows(week, 6);
    var list = el('ul', { class: 'lh-days' });
    if (!rows.length) list.appendChild(el('li', { class: 'lh-quiet lh-none' }, p ? 'No sessions on a day this week yet.' : 'Nothing logged this week yet.'));
    rows.forEach(function (d) {
      var li = el('li', { class: 'lh-day' + (d.isToday ? ' is-today' : '') + (d.state ? ' s-' + d.state : '') });
      li.appendChild(el('span', { class: 'lh-day-d' }, DAY_SHORT[d.idx]));
      var name = d.kind === 'logged' ? loggedName(u, d.iso) : String(((dayOf(p, d.ref).day || {}).name) || 'Session');
      li.appendChild(el('span', { class: 'lh-day-n' }, name + (d.more ? ' +' + d.more : '')));
      var word = lhStateWord(d);
      li.appendChild(el('span', { class: 'lh-day-s' + (d.isToday ? ' is-today' : '') }, word));
      if (d.isToday) {
        var go = d.kind === 'session' ? function () { openOnTrain(d.ref, week.today); } : openTrain;
        li.appendChild(soft('Open session', go, 'lh-btn-sm'));
      }
      list.appendChild(li);
    });
    card.appendChild(list);
    var foot = el('div', { class: 'lh-foot lh-links' });
    foot.appendChild(link('Log a past session', openLogSession));   // a session lifted away from the app: Train's own picker
    foot.appendChild(link(coached ? 'Full program' : 'Program builder', openProgram));
    card.appendChild(foot);
    return card;
  }

  // ---- drawing ----
  // The coach's note in at most four lines (its box is four lines tall): a longer one is cut at a word, with an
  // ellipsis, and keeps its whole text as the tooltip; Messages shows it in full.
  function fitNote(p) {
    var full = p.textContent;
    if (p.scrollHeight <= p.clientHeight + 1) return;
    var words = full.split(/\s+/), lo = 1, hi = words.length;
    while (lo < hi) {
      var mid = Math.ceil((lo + hi) / 2);
      p.textContent = words.slice(0, mid).join(' ') + '…';
      if (p.scrollHeight <= p.clientHeight + 1) lo = mid; else hi = mid - 1;
    }
    p.textContent = words.slice(0, lo).join(' ').replace(/[\s,.;:–-]+$/, '') + '…';
    p.title = full;
  }
  function render() {
    var area = document.getElementById('homeArea');
    if (!area || rendering) return;
    var u = me();
    if (!u) return;
    rendering = true;
    try {
      var keepId = document.activeElement && area.contains(document.activeElement) ? document.activeElement.id : null;
      var p = prog();
      if (p && !(p.weeks || []).length) p = null;
      var week = buildWeek(p);
      var next = nextRef(p, week.today);
      var c = coach();
      area.innerHTML = '';
      area.appendChild(headBlock(p, week));
      var grid = el('div', { class: 'lh-grid' + (c ? ' is-coached' : ' is-solo') });
      var prog1 = progressTile(u);
      grid.appendChild(prog1);
      grid.appendChild(logTile(u, c));
      grid.appendChild(c ? coachTile(u, c) : programTile(p, week, next));
      grid.appendChild(weekTile(u, p, week, !!c));
      area.appendChild(grid);
      if (prog1._drawChart) prog1._drawChart();
      area.querySelectorAll('.lh-note').forEach(fitNote);
      if (keepId) { var f = document.getElementById(keepId); if (f) f.focus(); }
      lastV = Store._v;
      lastTheme = theme();
    } finally { rendering = false; }
  }
  // Drawn when shown, and again whenever the Store moves or the theme changes while it is shown (nothing tells a pane
  // it changed: the other panes draw on their tab's click and after their own writes). Never while the lifter is
  // typing in a Home field (their draft is kept either way).
  function busyTyping() { var a = document.activeElement; return !!(a && a.closest && a.closest('#homeArea') && /^(INPUT|TEXTAREA)$/.test(a.tagName)); }
  function watch() {
    if (timer) return;
    timer = setInterval(function () {
      if (!shown()) { clearInterval(timer); timer = null; return; }
      if ((Store._v !== lastV || theme() !== lastTheme) && !busyTyping()) render();
    }, 1000);
  }
  var resizeT = null;
  window.addEventListener('resize', function () {
    if (!shown()) return;
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (shown() && isLaptop() && !busyTyping()) render(); }, 150);
  });
  function show() {
    if (!isLaptop()) { var t = tab('today'); if (t) t.click(); return; }
    render();
    watch();
  }

  // From the dashboard's start (athlete.html bootstrap, after the ?tab= link): the tab's name and icon, and the landing.
  function boot() {
    var t = tab('home');
    if (!t) return;
    t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5V15h4v4.5"/></svg><span>Home</span>';
    if (document.documentElement.classList.contains('native')) return;
    var asked = /[?&]tab=/.test(location.search) || (location.hash && location.hash !== '#');
    if (!asked && isLaptop()) t.click();
    // A window pulled under 901 px never keeps the lifter on a tab that is hidden there.
    if (window.matchMedia) {
      var mq = matchMedia(LAPTOP);
      var onChange = function (e) { if (!e.matches && t.classList.contains('active')) { var tt = tab('today'); if (tt) tt.click(); } };
      if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
    }
  }

  // The iPhone app and the phone demo (html.native, set in the head before any script) never have Home: its tab and pane
  // leave the page before the dashboard starts, so the bottom bar and its More sheet are built exactly as before.
  if (document.documentElement.classList.contains('native')) {
    ['tab-home', 'pane-home'].forEach(function (id) { var n = document.getElementById(id); if (n && n.parentNode) n.parentNode.removeChild(n); });
  }

  window.LifterHome = Object.assign({ boot: boot, show: show, render: render, isLaptop: isLaptop }, Core);
})();
