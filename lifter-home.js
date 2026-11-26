/* lifter-home.js: Home, the lifter's week on a laptop (26 Nov 2026; the owner: "We need to optimize the lifter
   dashboard completely for the website version. We cannot just give the same thing on a bigger screen.").

   A lifter at a laptop is reading and planning, not mid-set. Home answers, in this order: my week (done, today, left),
   exactly what today's (or the next) session is, what my coach said and what waits on me, and whether I am getting
   stronger (with my bodyweight against my class, or the meet).

   Where it shows: the website at laptop width only (html:not(.native), min-width 901 px). athlete.html carries the
   tab (#tab-home, first in the sidebar) and the pane (section[data-pane="home"]); lifter-home.css hides both on a
   phone, in the iPhone app and in a window of 900 px and under, where nothing changes. A laptop lands here unless the
   address names a tab (?tab=) or a hash. A window pulled under 901 px while Home is open moves to Train.

   Read-only: Home logs nothing and writes nothing. Its buttons open the app's own screens and sheets (Train on a day,
   Progress, Coach, the check-in, the weigh-in), which do their own saving when the lifter acts there.

   Every value comes from the Store through the app's own helpers: the week from the program and the logs (lhWeek,
   pure, below), the loads through setLoadText / setEffortText / formatWeight, the estimated maxes from Progress's own
   _progTotalSeries and strengthSeries, the meet and class from meetWeighOf / deskNextMeet, the weigh-ins from
   _bwSeries / bwHabit. Program JSON is coach-written: everything from it goes in as text nodes or through escHtml.

   Which day a session sits on: a session belongs to the date it was logged on (the date most of its sets were
   logged), else the date it is pinned to (day.scheduledDate, as Train pins). A date with logged sets but no session
   of the program on it shows what was logged. A rest day the lifter marked is Rest. The sessions of this program
   week still to do and on no date are put, in the program's order, on the days ahead the lifter usually trains: the
   days of their intake, else a weekday they trained on in 3 of the 4 weeks before (desk-day.js habitOn, the coach
   desk's own rule). What does not fit is listed under the week as not on a day yet; nothing else is guessed.

   Pure parts (unit-tested in tests.html "lifter home (lifter-home.js)"): lhWeek, lhPlanText, lhLoggedGroups,
   lhTopSet, lhFeel, lhHeadAction, lhDefaultDay. */
(function () {
  'use strict';

  /* =====================================================================================
     PURE
     ===================================================================================== */
  var DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  var MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MAIN = ['squat', 'bench', 'deadlift'];

  function d10(v) { return String(v == null ? '' : v).slice(0, 10); }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z')); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function dow(iso) { return (new Date(iso + 'T12:00:00Z').getUTCDay() + 6) % 7; }   // Mon 0 … Sun 6
  function monday(iso) { return addDays(iso, -dow(iso)); }
  // "Thu 26 Nov", "26 Nov", "Thursday": fixed English names, the same on every machine.
  function dayText(iso) { var p = iso.split('-'); return DAY_SHORT[dow(iso)] + ' ' + Number(p[2]) + ' ' + MONTH[Number(p[1]) - 1]; }
  function dateText(iso) { var p = iso.split('-'); return Number(p[2]) + ' ' + MONTH[Number(p[1]) - 1]; }
  function weekdayLong(iso) { return DAY_LONG[dow(iso)]; }

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
    // The program week this calendar week is about: today's session's, else the next one's, else the latest seen here.
    var wk = null;
    if (bound[t]) wk = bound[t][0].wi;
    else if (o.next && o.next.wi != null) wk = o.next.wi;
    else Object.keys(bound).forEach(function (k) { bound[k].forEach(function (r) { if (wk == null || r.wi > wk) wk = r.wi; }); });
    // Its sessions still to do and on no date, in the program's order, onto the days ahead they usually train.
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

  // The day the session block opens on: today, or when today is a rest day the next session to come this week.
  function lhDefaultDay(week) {
    if (!week) return 0;
    var ti = week.days.findIndex(function (d) { return d.isToday; });
    if (ti < 0) return 0;
    if (week.days[ti].kind !== 'rest') return ti;
    var n = week.days.findIndex(function (d, i) { return i > ti && d.kind === 'session' && (d.state === 'tocome' || d.state === 'today'); });
    return n >= 0 ? n : ti;
  }

  // The head's one action: today's session while it has sets to do, else the session Train offers next (next: { wi, di }),
  // by the day it sits on this week. → { kind: 'today' | 'day' | 'next' | 'none', idx (a day of the week, or -1) }
  function lhHeadAction(week, next) {
    if (!week) return { kind: 'none', idx: -1 };
    var ti = week.days.findIndex(function (d) { return d.isToday; });
    var td = ti >= 0 ? week.days[ti] : null;
    if (td && td.kind === 'session' && td.state === 'today') return { kind: 'today', idx: ti };
    if (!next) return { kind: 'none', idx: -1 };
    var at = week.days.findIndex(function (d) { return d.kind === 'session' && d.ref && d.ref.wi === next.wi && d.ref.di === next.di && !d.past; });
    if (at >= 0) return { kind: at === ti ? 'today' : 'day', idx: at };
    return { kind: 'next', idx: -1 };
  }

  // ---- words for sets ----
  var fmtNum = function (v) { return String(Math.round(Number(v) * 100) / 100); };
  // "@8.5", "@7–8", ", 2 RIR" (setEffortText's own words, shorter: the column is narrow). Felt RPE: actualRpe.
  function effortShort(s, actual) {
    if (actual) return s && s.actualRpe != null && s.actualRpe !== '' && isFinite(Number(s.actualRpe)) ? ' @' + fmtNum(s.actualRpe) : '';
    var t = typeof setEffortText === 'function' ? setEffortText(s) : (s && s.rpe != null && s.rpe !== '' ? 'RPE ' + fmtNum(s.rpe) : '');
    if (!t) return '';
    return /^RPE /.test(t) ? ' @' + t.slice(4) : ', ' + t;
  }
  function loadOf(s, actual) {
    if (actual) return Number(s.weight) > 0 && typeof formatWeight === 'function' ? formatWeight(s.weight) : (Number(s.weight) > 0 ? fmtNum(s.weight) + ' kg' : '');
    return typeof setLoadText === 'function' ? setLoadText(s) : (Number(s.weight) > 0 ? fmtNum(s.weight) + ' kg' : '');
  }
  // The plan as written: plannedWeight / plannedReps when the day moved them (a smart load, other reps).
  function planned(s) {
    var c = {}; for (var k in s) c[k] = s[k];
    if (s.plannedWeight != null) c.weight = s.plannedWeight;
    if (s.plannedReps != null && s.plannedReps !== '') c.reps = s.plannedReps;
    return c;
  }
  // One exercise's plan in the app's short form, one entry per group of like sets:
  // ["1 × 3 at 182.5 kg @8.5", "2 × 5 at 167.5 kg @8"]. Cardio reads as minutes and km.
  function lhPlanText(ex) {
    var ss = ((ex && ex.sets) || []).filter(Boolean).map(planned);
    if (!ss.length) return [];
    var cardio = ex.lift === 'cardio';
    var groups = typeof groupSets === 'function' ? groupSets(ss) : ss.map(function (s, i) { return Object.assign({ count: 1, startIdx: i }, s); });
    return groups.map(function (g) {
      if (cardio) return g.count + ' × ' + fmtNum(g.weight) + ' min' + (Number(g.reps) > 0 ? ', ' + fmtNum(g.reps) + ' km' : '');
      var load = loadOf(g, false);
      return g.count + ' × ' + String(g.reps == null ? '' : g.reps) + (load ? ' at ' + load : '') + effortShort(g, false);
    });
  }
  // How a logged set felt against what was written: 'harder' (over the top of the RPE written), 'easier' (under its
  // bottom), or null (as written, no RPE either side, or written as RIR).
  function lhFeel(s) {
    if (!s || s.actualRpe == null || s.actualRpe === '' || s.rpe == null || s.rpe === '' || s.rir) return null;
    var a = Number(s.actualRpe), lo = Number(s.rpe), hi = s.rpeHi != null && Number(s.rpeHi) > lo ? Number(s.rpeHi) : lo;
    if (!isFinite(a) || !isFinite(lo)) return null;
    if (a > hi) return 'harder';
    if (a < lo) return 'easier';
    return null;
  }
  // The sets logged for one exercise, like sets together: [{ text: "3 × 3 at 182.5 kg @9", feel }], in order.
  function lhLoggedGroups(ex) {
    var out = [], cardio = ex && ex.lift === 'cardio';
    ((ex && ex.sets) || []).forEach(function (s) {
      if (!s || !s.completed) return;
      var feel = cardio ? null : lhFeel(s);
      var body = cardio ? fmtNum(s.weight) + ' min' + (Number(s.reps) > 0 ? ', ' + fmtNum(s.reps) + ' km' : '')
        : String(s.reps == null ? '' : s.reps) + (loadOf(s, true) ? ' at ' + loadOf(s, true) : '') + effortShort(s, true);
      var last = out[out.length - 1];
      if (last && last.body === body && last.feel === feel) last.count++;
      else out.push({ body: body, feel: feel, count: 1 });
    });
    return out.map(function (g) { return { text: g.count + ' × ' + g.body, feel: g.feel }; });
  }
  // A day's top set in one line, from its first main lift (the coach's order), else its first exercise:
  // planned "182.5 kg × 3 @8.5"; done (actual: true) the heaviest set lifted, "185 kg × 3 @9".
  function lhTopSet(day, actual) {
    var exs = ((day && day.exercises) || []).filter(function (e) { return e && (e.sets || []).length && e.lift !== 'cardio'; });
    var ex = exs.filter(function (e) { return MAIN.indexOf(e.lift) >= 0; })[0] || exs[0];
    if (!ex) return '';
    var pool = actual ? ex.sets.filter(function (s) { return s && s.completed; }) : ex.sets.filter(Boolean).map(planned);
    if (!pool.length) return '';
    var top = pool.reduce(function (m, s) { return Number(s.weight) > Number(m.weight) ? s : m; }, pool[0]);
    var load = loadOf(top, actual);
    return (load ? load + ' × ' : '') + String(top.reps == null ? '' : top.reps) + (load ? '' : ' reps') + effortShort(top, actual);
  }

  var Core = { lhWeek: lhWeek, lhDefaultDay: lhDefaultDay, lhHeadAction: lhHeadAction, lhPlanText: lhPlanText, lhFeel: lhFeel,
    lhLoggedGroups: lhLoggedGroups, lhTopSet: lhTopSet, dayText: dayText, dateText: dateText, weekdayLong: weekdayLong, monday: monday, addDays: addDays };
  if (typeof window !== 'undefined') {
    window.LifterHomeCore = Core;
    window.lhWeek = lhWeek; window.lhPlanText = lhPlanText; window.lhLoggedGroups = lhLoggedGroups; window.lhTopSet = lhTopSet;
    window.lhFeel = lhFeel; window.lhHeadAction = lhHeadAction; window.lhDefaultDay = lhDefaultDay;
  }
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.documentElement || !document.addEventListener) return;

  /* =====================================================================================
     THE SCREEN
     ===================================================================================== */
  var LAPTOP = '(min-width: 901px)';
  var selIdx = null;        // the day selected in the week (0 Mon … 6 Sun); null = the default
  var selWeek = null;       // which Monday that selection belongs to
  var lastV = -1, timer = null, msgCache = null, rendering = false;

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
  function txt(tag, cls, text) { return el(tag, cls ? { class: cls } : {}, text == null ? '' : String(text)); }
  function soft(label, onClick, extra) {
    var b = el('button', { class: 'ui-btn-soft lh-btn' + (extra ? ' ' + extra : ''), type: 'button' }, label);
    b.addEventListener('click', onClick);
    return b;
  }
  function title(text) { return el('h3', { class: 'ui-label lh-title' }, text); }
  function exName(ex) {
    if (typeof exTitleOf === 'function') return exTitleOf(ex);
    return ex.exerciseName || (typeof LIFT_LABELS !== 'undefined' && LIFT_LABELS[ex.lift]) || 'Exercise';
  }

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
  function buildWeek() {
    var u = me(), p = prog(), t = today();
    var logs = myLogs(u);
    return lhWeek({
      prog: p, today: t,
      logDates: logs.map(function (l) { return l.date; }),
      restDates: (Store.get().restDays || []).filter(function (r) { return r.athleteId === u.id; }).map(function (r) { return r.date; }),
      usual: usualDays(u),
      next: nextRef(p, t)
    });
  }

  // ---- opening the app's own screens (no writes: Train's day and date are what the lifter is looking at) ----
  function openOnTrain(ref, iso) {
    var p = prog(); var x = dayOf(p, ref);
    if (!x.day) { tab('today').click(); return; }
    var sel = document.getElementById('daySelect'), sd = document.getElementById('sessionDate');
    if (sd) sd.value = iso;
    if (sel) sel.value = _dayKey(x.wk, x.day);
    try { refreshPinButtons(); } catch (e) {}
    try { renderToday(); } catch (e) {}
    tab('today').click();
  }
  function openInProgram(ref) {
    var p = prog(), x = dayOf(p, ref), u = me();
    if (u && u.coachId && x.wk) { try { _fpWeek = x.wk.number; _fpOpen.add(x.day.id); } catch (e) {} }
    tab('program').click();
  }
  function openTrain() { try { populateDaySelect(); renderToday(); } catch (e) {} tab('today').click(); }
  function openCoach() { try { sessionStorage.setItem('powa-coach-view', 'messages'); } catch (e) {} tab('coach').click(); }
  function openHistory() { try { sessionStorage.setItem('powa-prog-subtab', 'history'); } catch (e) {} tab('progress').click(); }
  function openProgress() { try { sessionStorage.setItem('powa-prog-subtab', 'overview'); } catch (e) {} tab('progress').click(); }

  // How a day opens: Train for a day on a date that has come (its own date) and for the session Train offers next
  // (today's date: Train offers it); any other session ahead in the program; a day of logged sets in History.
  function opener(week, d, next) {
    if (!d) return null;
    var t = week.today;
    if (d.kind === 'logged') return { label: 'See in History', go: openHistory };
    if (d.kind !== 'session') return null;
    if (d.iso <= t && d.how !== 'usual') return { label: 'Open session', go: function () { openOnTrain(d.ref, d.iso); } };
    var restToday = (Store.get().restDays || []).some(function (r) { return r.athleteId === me().id && r.date === t; });
    var isNext = next && d.ref && d.ref.wi === next.wi && d.ref.di === next.di;
    if (isNext && !restToday) return { label: 'Open session', go: function () { openOnTrain(d.ref, t); } };
    return { label: 'See in program', go: function () { openInProgram(d.ref); } };
  }

  // ---- the head ----
  function headBlock(week, p, next) {
    var head = el('div', { class: 'dash-header lh-head' });
    var left = el('div', { class: 'lh-head-text' });
    left.appendChild(el('h2', {}, 'This week'));
    var sub = [];
    if (p && week && week.week != null && p.weeks[week.week]) sub.push((p.name ? String(p.name) + ', w' : 'W') + 'eek ' + Number(p.weeks[week.week].number || week.week + 1) + ' of ' + p.weeks.length + '.');
    if (week) sub.push(DAY_SHORT[0] + ' ' + Number(week.mon.slice(8)) + (week.mon.slice(5, 7) === week.sun.slice(5, 7) ? '' : ' ' + MONTH[Number(week.mon.slice(5, 7)) - 1]) + ' to ' + DAY_SHORT[6] + ' ' + dateText(week.sun));
    left.appendChild(el('p', { class: 'lh-sub' }, sub.join(' ')));
    head.appendChild(left);
    var acts = el('div', { class: 'lh-head-acts' });
    var c = coach();
    var primary = null;
    if (!p) {
      if (c) primary = { label: 'Message ' + firstName(c.name), go: openCoach };
      else primary = { label: 'Set up your program', go: openTrain };
    } else {
      var a = lhHeadAction(week, next);
      if (a.kind === 'today') primary = { label: 'Open today’s session', go: function () { openOnTrain(week.days[a.idx].ref, week.today); } };
      else if (a.kind === 'day') { var dd = week.days[a.idx], o = opener(week, dd, next); primary = { label: 'Open ' + weekdayLong(dd.iso) + '’s session', go: o ? o.go : openTrain }; }
      else if (a.kind === 'next') primary = { label: 'Open next session', go: openTrain };
      else primary = { label: 'Open Train', go: openTrain };
    }
    if (p && c) acts.appendChild(soft('Message ' + firstName(c.name), openCoach, 'lh-head-msg'));
    var b = el('button', { class: 'btn btn-primary lh-head-go', type: 'button' }, primary.label);
    b.addEventListener('click', primary.go);
    acts.appendChild(b);
    head.appendChild(acts);
    return head;
  }

  // ---- the week ----
  var STATE_WORD = { done: 'Done', skipped: 'Skipped', unfinished: 'Not finished', today: 'Today', tocome: 'To come', missed: 'Missed' };
  function dayName(p, d) {
    if (d.kind === 'logged') return 'Logged';
    if (d.kind === 'rest') return 'Rest';
    var x = dayOf(p, d.ref);
    return String((x.day && x.day.name) || 'Session');
  }
  function liftsOn(u, iso) {
    var seen = [];
    myLogs(u).forEach(function (l) { if (l.date === iso && seen.indexOf(l.lift) < 0) seen.push(l.lift); });
    return seen;
  }
  // A day of logged sets in no session of the program, by its main lifts ("Bench", "Squat and deadlift"), else "Logged".
  function loggedName(u, iso) {
    var ls = liftsOn(u, iso).filter(function (l) { return MAIN.indexOf(l) >= 0; }).map(function (l) { return LIFT_LABELS[l]; });
    if (!ls.length) return 'Logged';
    return ls.length === 1 ? ls[0] : ls.slice(0, -1).join(', ') + ' and ' + ls[ls.length - 1].toLowerCase();
  }
  function loggedTop(u, iso) {
    var ls = myLogs(u).filter(function (l) { return l.date === iso; });
    var main = ls.filter(function (l) { return MAIN.indexOf(l.lift) >= 0; });
    var pool = main.length ? main : ls;
    if (!pool.length) return '';
    var b = pool.reduce(function (m, l) { return (Number(l.e1rmComp) || 0) > (Number(m.e1rmComp) || 0) ? l : m; }, pool[0]);
    return formatWeight(b.weight) + ' × ' + b.reps + (b.rpe != null && b.rpe !== '' ? ' @' + fmtNum(b.rpe) : '');
  }
  function weekBlock(week, p, selected) {
    var u = me();
    var card = el('div', { class: 'ui-card lh-week' });
    var list = el('div', { class: 'lh-days', role: 'tablist', 'aria-label': 'This week, Monday to Sunday' });
    week.days.forEach(function (d, i) {
      var on = i === selected;
      var b = el('button', { type: 'button', role: 'tab', id: 'lh-day-' + i, 'aria-selected': on ? 'true' : 'false', 'aria-controls': 'lh-session', tabindex: on ? '0' : '-1',
        class: 'lh-day' + (d.isToday ? ' is-today' : '') + (on ? ' is-on' : '') + (d.past ? ' is-past' : '') + ' k-' + d.kind + (d.state ? ' s-' + d.state : ''), 'data-lh': 'day-' + i });
      var top = el('span', { class: 'lh-day-date' });
      top.appendChild(el('b', {}, DAY_SHORT[i]));
      top.appendChild(document.createTextNode(' ' + Number(d.iso.slice(8))));
      top.appendChild(el('span', { class: 'lh-mon' }, ' ' + MONTH[Number(d.iso.slice(5, 7)) - 1]));
      b.appendChild(top);
      var name = dayName(p, d);
      if (d.kind === 'logged') name = loggedName(u, d.iso);
      b.appendChild(el('span', { class: 'lh-day-name' }, name + (d.more ? ' +' + d.more : '')));
      var word = d.kind === 'rest' ? '' :(d.isToday && d.state !== 'done' && d.state !== 'skipped' ? 'Today' : STATE_WORD[d.state] || '');
      b.appendChild(el('span', { class: 'lh-day-state' }, word));
      var line = '';
      if (d.kind === 'session') { var x = dayOf(p, d.ref); line = d.done > 0 ? lhTopSet(x.day, true) : lhTopSet(x.day, false); }
      else if (d.kind === 'logged') line = loggedTop(u, d.iso);
      b.appendChild(el('span', { class: 'lh-day-top' }, line));
      var cnt = d.kind === 'session' && d.done > 0 && d.done < d.total ? d.done + ' of ' + d.total + ' sets' : '';
      b.appendChild(el('span', { class: 'lh-day-count' }, cnt));
      b.setAttribute('aria-label', weekdayLong(d.iso) + ' ' + dateText(d.iso) + ', ' + name + (word ? ', ' + word : '') + (line ? ', ' + line : '') + (cnt ? ', ' + cnt : ''));
      b.addEventListener('click', function () { select(i, true); });
      b.addEventListener('keydown', function (e) {
        var to = null;
        if (e.key === 'ArrowRight') to = (i + 1) % 7; else if (e.key === 'ArrowLeft') to = (i + 6) % 7;
        else if (e.key === 'Home') to = 0; else if (e.key === 'End') to = 6;
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i, true); return; }
        if (to == null) return;
        e.preventDefault(); select(to, true);
      });
      list.appendChild(b);
    });
    card.appendChild(list);
    if (week.unplaced.length) {
      var names = week.unplaced.map(function (r) { var x = dayOf(p, r); return String((x.day && x.day.name) || 'Session'); });
      var wkN = (function () { var x0 = dayOf(p, week.unplaced[0]); return x0.wk ? Number(x0.wk.number || week.unplaced[0].wi + 1) : null; })();
      card.appendChild(el('p', { class: 'lh-unplaced' }, 'Also in ' + (wkN ? 'week ' + wkN : 'this week') + ', with no day yet: ' + names.join(', ') + '.'));
    }
    return card;
  }

  // ---- the selected day's session ----
  function lastTime(u, ex, before) {
    if (ex.lift === 'cardio') return null;
    var main = MAIN.indexOf(ex.lift) >= 0;
    var ls = myLogs(u).filter(function (l) { return l.lift === ex.lift && (main ? l.variant === ex.variant : (l.exerciseName || '') === (ex.exerciseName || '')) && l.date < before; });
    if (!ls.length) return null;
    var last = ls.reduce(function (m, l) { return l.date > m ? l.date : m; }, ls[0].date);
    var on = ls.filter(function (l) { return l.date === last; });
    var b = on.reduce(function (m, l) { return (Number(l.e1rmComp) || Number(l.weight) || 0) > (Number(m.e1rmComp) || Number(m.weight) || 0) ? l : m; }, on[0]);
    return { set: (Number(b.weight) > 0 ? formatWeight(b.weight) + ' × ' : '') + b.reps + (b.rpe != null && b.rpe !== '' ? ' @' + fmtNum(b.rpe) : ''), date: dayText(last) };
  }
  function liftDot(lift) { return MAIN.indexOf(lift) >= 0 ? el('span', { class: 'lift-dot lift-' + lift, 'aria-hidden': 'true' }) : el('span', { class: 'lh-dot-gap', 'aria-hidden': 'true' }); }
  function lines(cell, arr, joiner) {
    arr.forEach(function (t, i) {
      var s = el('span', { class: 'lh-line' });
      if (i && joiner) s.appendChild(el('span', { class: 'lh-sr' }, joiner));
      if (typeof t === 'string') s.appendChild(document.createTextNode(t)); else s.appendChild(t);
      cell.appendChild(s);
    });
  }
  function sessionBlock(week, p, d, next) {
    var u = me();
    var card = el('div', { class: 'ui-card lh-session', id: 'lh-session', role: 'tabpanel', 'aria-labelledby': 'lh-day-' + d.idx });
    var head = el('div', { class: 'lh-sess-head' });
    var ht = el('div', { class: 'lh-sess-title' });
    var name = d.kind === 'logged' ? loggedName(u, d.iso) : dayName(p, d);
    ht.appendChild(el('h3', { class: 'lh-sess-name' }, name));
    var meta = [dayText(d.iso)];
    if (d.kind === 'logged') meta.push('Done', 'Not part of your program');
    if (d.kind === 'session') {
      var word = d.isToday && d.state !== 'done' && d.state !== 'skipped' ? 'Today' : STATE_WORD[d.state];
      if (word) meta.push(word);
      if (d.done > 0 && d.done < d.total) meta.push(d.done + ' of ' + d.total + ' sets');
      if (d.how === 'usual') meta.push('On no date yet: your usual ' + weekdayLong(d.iso));
      var x0 = dayOf(p, d.ref); if (x0.wk) meta.push('Week ' + Number(x0.wk.number || d.ref.wi + 1));
    }
    ht.appendChild(el('p', { class: 'lh-sess-meta' }, meta.join(' · ')));
    head.appendChild(ht);
    var o = opener(week, d, next);
    if (o) head.appendChild(soft(o.label, o.go));
    card.appendChild(head);
    if (d.kind === 'rest') {
      card.appendChild(el('p', { class: 'lh-rest' }, d.marked ? 'You marked it a rest day.' : d.past ? 'No training on this day.' : 'Nothing planned for this day.'));
      return card;
    }
    var tbl = el('table', { class: 'lh-table' });
    tbl.appendChild(el('caption', { class: 'lh-sr' }, name + ', ' + dayText(d.iso)));
    var thead = el('thead'), hr = el('tr');
    var loose = d.kind === 'logged';
    if (loose) tbl.className += ' lh-table-loose';
    ['Exercise', 'Planned', 'Last time', 'Logged'].forEach(function (h, i) { if (loose && i === 1) return; hr.appendChild(el('th', { scope: 'col', class: 'lh-c' + i }, h)); });
    thead.appendChild(hr); tbl.appendChild(thead);
    var tb = el('tbody');
    if (d.kind === 'logged') {
      // A day of logged sets that sits in no session of the program: each exercise as it was logged.
      var groups = [], byKey = {};
      myLogs(u).filter(function (l) { return l.date === d.iso; }).forEach(function (l) {
        var k = l.lift + '|' + (l.variant || '') + '|' + (l.exerciseName || '');
        if (!byKey[k]) { byKey[k] = { lift: l.lift, variant: l.variant, exerciseName: l.exerciseName, sets: [] }; groups.push(byKey[k]); }
        byKey[k].sets.push({ weight: l.weight, reps: l.reps, actualRpe: l.rpe, completed: true });
      });
      groups.forEach(function (g) { tb.appendChild(row(u, g, d.iso, { planned: false })); });
    } else {
      var x = dayOf(p, d.ref);
      ((x.day && x.day.exercises) || []).forEach(function (ex) { tb.appendChild(row(u, ex, d.iso, { planned: true })); });
    }
    tbl.appendChild(tb);
    card.appendChild(el('div', { class: 'lh-table-wrap' }, tbl));
    return card;
  }
  function row(u, ex, iso, o) {
    var tr = el('tr');
    var c0 = el('td', { class: 'lh-c0' });
    var nm = el('div', { class: 'lh-ex' });
    nm.appendChild(liftDot(ex.lift));
    nm.appendChild(el('span', { class: 'lh-ex-name' }, exName(ex)));
    c0.appendChild(nm);
    if (ex.note) c0.appendChild(el('div', { class: 'lh-cue' }, String(ex.note)));
    tr.appendChild(c0);
    var c1 = el('td', { class: 'lh-c1' });
    if (o.planned) { var pl = lhPlanText(ex); if (pl.length) lines(c1, pl, ', then '); else c1.appendChild(el('span', { class: 'lh-none' }, '–')); tr.appendChild(c1); }
    var c2 = el('td', { class: 'lh-c2' });
    var lt = lastTime(u, ex, iso);
    if (lt) { lines(c2, [lt.set, el('span', { class: 'lh-when' }, lt.date)]); }
    else c2.appendChild(el('span', { class: 'lh-none', 'aria-label': 'Nothing logged before' }, '–'));
    tr.appendChild(c2);
    var c3 = el('td', { class: 'lh-c3' });
    var lg = lhLoggedGroups(ex);
    var total = (ex.sets || []).filter(Boolean).length;
    if (lg.length) {
      var done = (ex.sets || []).filter(function (s) { return s && s.completed; }).length;
      if (o.planned && done < total) c3.appendChild(el('span', { class: 'lh-line lh-of' }, done + ' of ' + total));
      lines(c3, lg.map(function (g) {
        var s = el('span', {}, g.text);
        if (g.feel) s.appendChild(el('span', { class: 'lh-feel' }, g.feel === 'harder' ? ' harder' : ' easier'));
        return s;
      }), ', ');
    } else c3.appendChild(el('span', { class: 'lh-of' }, '0 of ' + total));
    tr.appendChild(c3);
    return tr;
  }

  // ---- the panels ----
  // The coach's newest words to this lifter: a session note or a message, whichever came last. → { text, at, voice }
  function latestFromCoach(u, c) {
    var best = null;
    (Store.get().sessionNotes || []).forEach(function (n) {
      if (n.athleteId !== u.id || !n.coachComment) return;
      var at = String(n.coachCommentAt || n.date || '');
      if (!best || at > best.at) best = { text: String(n.coachComment), at: at, voice: null };
    });
    var msgs = window._demoMode ? (Store.get().messages || []) : (msgCache && msgCache.list) || [];
    msgs.forEach(function (m) {
      if (m.athleteId !== u.id || m.senderId !== c.id) return;
      var at = String(m.createdAt || '');
      if (best && at <= best.at) return;
      var voice = m.meta && m.meta.type === 'voice' && window.PowaVoice && PowaVoice.cleanMeta(m.meta) ? m : null;
      if (voice) best = { text: '', at: at, voice: voice };
      else if (m.body && !(m.meta && m.meta.type)) best = { text: String(m.body), at: at, voice: null };
    });
    return best;
  }
  function unreadFromCoach(u, c) {
    var msgs = window._demoMode ? (Store.get().messages || []) : (msgCache && msgCache.list) || null;
    if (!msgs) return null;
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
  function waitRow(textNode, btnLabel, go) {
    var r = el('div', { class: 'lh-wait' });
    r.appendChild(typeof textNode === 'string' ? el('span', { class: 'lh-wait-text' }, textNode) : textNode);
    r.appendChild(soft(btnLabel, go, 'lh-btn-sm'));
    return r;
  }
  function coachPanel(u, c) {
    var first = firstName(c.name) || 'your coach';
    var card = el('div', { class: 'ui-card lh-panel lh-coach' });
    card.appendChild(title('From ' + first));
    loadMessages(u, c);
    var l = latestFromCoach(u, c);
    if (l) {
      var when = el('p', { class: 'lh-when' }, (l.voice ? 'Voice note, ' : '') + (isIso(d10(l.at)) ? dayText(d10(l.at)) : ''));
      if (l.text) card.appendChild(el('p', { class: 'lh-note' }, l.text));
      if (l.voice) card.appendChild(el('div', { class: 'lh-voice' }, PowaVoice.player(l.voice.meta, { messageId: l.voice.id, compact: true })));
      card.appendChild(when);
    } else card.appendChild(el('p', { class: 'lh-quiet' }, 'Nothing from ' + first + ' yet.'));
    // Their newest voice note, when it is not the newest thing and still unheard (Train's own rule: coachVoiceRow).
    if (l && !l.voice && typeof latestCoachVoice === 'function') {
      var v = null; try { v = latestCoachVoice(); } catch (e) {}
      if (v && window.PowaVoice && PowaVoice.cleanMeta(v.meta) && !PowaVoice.heard(v.id) && Date.now() - Date.parse(v.createdAt || 0) <= 48 * 3600000) {
        var vb = el('div', { class: 'lh-voice' });
        vb.appendChild(el('p', { class: 'lh-when' }, 'Voice note, ' + dayText(d10(v.createdAt))));
        vb.appendChild(PowaVoice.player(v.meta, { messageId: v.id, compact: true }));
        card.appendChild(vb);
      }
    }
    var waits = [];
    var t = today();
    var wkStart = typeof mondayOf === 'function' ? mondayOf(t) : monday(t);
    if (!(Store.get().checkins || []).some(function (x) { return x.athleteId === u.id && x.weekStart === wkStart; }))
      waits.push(waitRow('This week’s check-in', 'Check in', function () { openCheckinModal(wkStart); }));
    var due = typeof dueCheckinQuestions === 'function' ? dueCheckinQuestions(Store.get().checkinQuestions, Store.get().checkinAnswers, u.id) : [];
    if (due && due.length) waits.push(waitRow(first + ' asks ' + due.length + (due.length === 1 ? ' question' : ' questions'), 'Answer', function () { openCustomCheckinSheet(); }));
    var un = unreadFromCoach(u, c);
    if (un) waits.push(waitRow(un + (un === 1 ? ' unread message' : ' unread messages'), 'Read', openCoach));
    var w = el('div', { class: 'lh-waits' });
    w.appendChild(el('h4', { class: 'lh-sub-title' }, 'Waiting on you'));
    if (waits.length) waits.forEach(function (r) { w.appendChild(r); });
    else w.appendChild(el('p', { class: 'lh-quiet' }, 'Nothing is waiting on you.'));
    card.appendChild(w);
    return card;
  }
  function blockPanel(p, week) {
    var card = el('div', { class: 'ui-card lh-panel lh-block' });
    card.appendChild(title('Your block'));
    card.appendChild(el('p', { class: 'lh-big-name' }, String(p.name || 'Your program')));
    var planned = 0, done = 0;
    p.weeks.forEach(function (w) { (w.days || []).forEach(function (d) { var st = dayStatus(d); if (!st.total) return; planned++; if (st.open === 0 && st.done > 0) done++; }); });
    var stats = el('dl', { class: 'lh-facts' });
    var fact = function (k, v) { stats.appendChild(el('dt', {}, k)); stats.appendChild(el('dd', {}, v)); };
    if (week.week != null && p.weeks[week.week]) fact('Week', Number(p.weeks[week.week].number || week.week + 1) + ' of ' + p.weeks.length);
    fact('Sessions done', done + ' of ' + planned);
    card.appendChild(stats);
    card.appendChild(el('div', { class: 'lh-panel-foot' }, soft('Open program', function () { tab('program').click(); })));
    return card;
  }
  function strengthPanel(u) {
    var logs = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === u.id && l.lift !== 'cardio'; });
    var card = el('div', { class: 'ui-card lh-panel lh-strength' });
    card.appendChild(title('Strength'));
    var un = unitLabel();
    if (!logs.length || typeof _progTotalSeries !== 'function') {
      card.appendChild(el('p', { class: 'lh-quiet' }, 'Log a set of squat, bench or deadlift and your estimated max shows here.'));
      card.appendChild(el('div', { class: 'lh-panel-foot' }, soft('Open Progress', openProgress)));
      return card;
    }
    // Progress's own numbers (athlete.html renderProgOverview): the running best per lift, and its move since 4 weeks ago.
    var series = _progTotalSeries(logs);
    var lastPt = series[series.length - 1] || { total: 0, squat: 0, bench: 0, deadlift: 0 };
    var cutoff = _addDaysISO(today(), -28);
    var prevPt = series.slice().reverse().find(function (pt) { return pt.date <= cutoff; }) || null;
    var signed = function (kg) { var d = Math.round(kgToDisplay(kg)); return d ? (d > 0 ? '+' : '−') + Math.abs(d) + ' ' + un : 'Level'; };
    var tot = el('div', { class: 'lh-total' });
    tot.appendChild(el('span', { class: 'lh-total-k' }, 'Estimated total'));
    tot.appendChild(el('b', { class: 'lh-total-v', html: escHtml(String(Math.round(kgToDisplay(lastPt.total)))) + '<small>' + escHtml(un) + '</small>' }));
    if (prevPt && prevPt.total > 0) tot.appendChild(el('span', { class: 'lh-total-d' }, signed(lastPt.total - prevPt.total) + ' in 4 weeks'));
    card.appendChild(tot);
    var t = el('table', { class: 'lh-lifts' });
    t.appendChild(el('caption', { class: 'lh-sr' }, 'Estimated max per lift, its change in 4 weeks, and its last 16 weeks'));
    var th = el('thead'), tr0 = el('tr');
    [['Lift', 'lh-l0'], ['16 weeks', 'lh-l1'], ['Estimated max', 'lh-l2'], ['In 4 weeks', 'lh-l3']].forEach(function (h) { tr0.appendChild(el('th', { scope: 'col', class: h[1] }, h[0])); });
    th.appendChild(tr0); t.appendChild(th);
    var tb = el('tbody');
    MAIN.forEach(function (lift) {
      var tr = el('tr');
      var c0 = el('th', { scope: 'row', class: 'lh-l0' });
      c0.appendChild(el('span', { class: 'lift-dot lift-' + lift, 'aria-hidden': 'true' }));
      c0.appendChild(document.createTextNode(LIFT_LABELS[lift]));
      tr.appendChild(c0);
      var pts = typeof strengthSeries === 'function' ? strengthSeries(logs, lift) : [];
      tr.appendChild(el('td', { class: 'lh-l1' }, el('span', { class: 'lh-spark lift-' + lift, html: uiSparkline(pts.map(function (x) { return kgToDisplay(x.value); })) })));
      var now = lastPt[lift] || 0;
      tr.appendChild(el('td', { class: 'lh-l2' }, now ? Math.round(kgToDisplay(now)) + ' ' + un : 'Not logged'));
      var before = prevPt ? prevPt[lift] : 0;
      tr.appendChild(el('td', { class: 'lh-l3' }, now && before ? signed(now - before) : '–'));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    card.appendChild(t);
    card.appendChild(el('div', { class: 'lh-panel-foot' }, soft('Open Progress', openProgress)));
    return card;
  }
  function meetOrWeightPanel(u) {
    var t = today();
    var nm = typeof deskNextMeet === 'function' ? deskNextMeet(u.id, t) : null;
    var md = null; try { md = localStorage.getItem('powa-meet-date'); } catch (e) {}
    var mdDays = md && typeof daysUntil === 'function' ? daysUntil(md) : null;
    var list = typeof _bwSeries === 'function' ? _bwSeries() : [];
    var last = list[list.length - 1];
    var unit = getUnit() === 'lbs' ? 'lbs' : 'kg';
    var ml = null; try { if (typeof applyLocalCut === 'function') applyLocalCut(); ml = meetWeighOf(u.id, t, unit); } catch (e) {}
    var card = el('div', { class: 'ui-card lh-panel' });
    if (nm || (mdDays != null && mdDays >= 0)) {
      card.classList.add('lh-meet');
      var days = nm ? nm.days : mdDays, iso = nm ? d10(nm.meet.date) : d10(md);
      card.appendChild(title('Next meet'));
      card.appendChild(el('p', { class: 'lh-big-name' }, nm && nm.meet.name ? String(nm.meet.name) : 'Your meet'));
      var facts = el('dl', { class: 'lh-facts' });
      var fact = function (k, v) { facts.appendChild(el('dt', {}, k)); facts.appendChild(el('dd', {}, v)); };
      fact('Date', dayText(iso));
      fact('How far', days === 0 ? 'Meet day' : days + (days === 1 ? ' day out' : ' days out'));
      if (last) {
        var vs = nm ? deskBodyweightVsClass(u.id, nm.meet) : null;
        var cls = ml && ml.src === 'meet' ? ml.parts.slice(1).join(', ') : vs ? (vs.over > 0 ? kgToDisplay(vs.over, 1) + ' ' + unitLabel() + ' over ' + vs.cls : vs.over < 0 ? kgToDisplay(-vs.over, 1) + ' ' + unitLabel() + ' under ' + vs.cls : 'At ' + vs.cls) : null;
        fact('Bodyweight', formatWeight(last.weight) + (cls ? ', ' + cls : ''));
      }
      card.appendChild(facts);
      if (typeof meetPhaseHint === 'function') card.appendChild(el('p', { class: 'lh-quiet' }, meetPhaseHint(days)));
      card.appendChild(el('div', { class: 'lh-panel-foot' }, soft('Open meet day', function () { openMeetSheet(); })));
      return card;
    }
    card.classList.add('lh-bw');
    card.appendChild(title('Bodyweight'));
    if (!last) {
      card.appendChild(el('p', { class: 'lh-quiet' }, 'No weigh-ins yet. One a morning makes a trend.'));
    } else {
      var top = el('div', { class: 'lh-total' });
      top.appendChild(el('span', { class: 'lh-total-k' }, last.date === t ? 'Today' : 'Last weigh-in, ' + dayText(last.date)));
      top.appendChild(el('b', { class: 'lh-total-v', html: escHtml(String(kgToDisplay(last.weight, 1))) + '<small>' + escHtml(unitLabel()) + '</small>' }));
      var habit = typeof bwHabit === 'function' ? bwHabit(list, t) : null;
      if (habit && habit.delta != null) top.appendChild(el('span', { class: 'lh-total-d' }, Math.abs(habit.delta) < 0.05 ? 'This week level with last' : 'This week ' + (habit.delta > 0 ? '+' : '−') + Math.abs(kgToDisplay(habit.delta)).toFixed(1) + ' ' + unitLabel() + ' on last'));
      card.appendChild(top);
      var tr = typeof bwCutBulkStats === 'function' ? bwCutBulkStats(list.map(function (b) { return { date: b.date, weight: b.weight }; }), null, 'maintain').trend : [];
      var sp = uiSparkline((tr || []).slice(-21).map(function (x) { return kgToDisplay(x.weight); }));
      if (sp) card.appendChild(el('div', { class: 'lh-spark lh-spark-wide', html: sp }));
      if (ml) card.appendChild(el('p', { class: 'lh-quiet' }, ml.text));
      else { var cut = typeof athleteCut === 'function' ? athleteCut(u.id) : null; if (cut && cut.line) { var cl = cut.line.split(' · ').slice(1).join(' · '); if (cl) card.appendChild(el('p', { class: 'lh-quiet' }, cl.charAt(0).toUpperCase() + cl.slice(1))); } }
    }
    card.appendChild(el('div', { class: 'lh-panel-foot' }, soft('Weigh in', function () { openWeighInSheet(function () { render(); }); })));
    return card;
  }

  // ---- a lifter with no program yet: Train's own ways in, linked ----
  function startBlock(u, c) {
    var card = el('div', { class: 'ui-card lh-start' });
    if (c) {
      card.appendChild(el('h3', { class: 'lh-sess-name' }, firstName(c.name) + ' is writing your program'));
      card.appendChild(el('p', { class: 'lh-quiet' }, 'Your week shows up here the moment it is ready.'));
      return card;
    }
    card.appendChild(el('h3', { class: 'lh-sess-name' }, 'No program yet'));
    card.appendChild(el('p', { class: 'lh-quiet' }, 'Your week shows up here once you have one. Start one of these ways.'));
    var inShell = document.documentElement.classList.contains('native');
    var links = el('div', { class: 'lh-links' });
    [['Set up your program', 'Your best lifts and days a week, or start from zero', 'today'],
      ['Write my own program', 'Your weeks, days and sets', 'program'],
      ['Find a coach', 'Get programmed by a real coach', 'coach'],
      inShell ? null : ['Get a ready-made plan', 'Programs from coaches on the marketplace', 'marketplace']].filter(Boolean).forEach(function (x) {
      var b = el('button', { type: 'button', class: 'lh-link' });
      b.appendChild(el('span', { class: 'lh-link-t' }, x[0]));
      b.appendChild(el('span', { class: 'lh-link-s' }, x[1]));
      b.addEventListener('click', x[2] === 'today' ? openTrain : function () { tab(x[2]).click(); });
      links.appendChild(b);
    });
    card.appendChild(links);
    return card;
  }

  // ---- drawing ----
  function select(i, focus) {
    selIdx = i;
    render();
    if (focus) { var b = document.getElementById('lh-day-' + i); if (b) b.focus(); }
    var live = document.getElementById('lh-live');
    var d = document.getElementById('lh-day-' + i);
    if (live && d) live.textContent = 'Showing ' + d.getAttribute('aria-label');
  }
  function render() {
    var area = document.getElementById('homeArea');
    if (!area || rendering) return;
    var u = me();
    if (!u) return;
    rendering = true;
    try {
      var keep = document.activeElement && area.contains(document.activeElement) ? document.activeElement.getAttribute('data-lh') : null;
      var p = prog();
      if (p && !(p.weeks || []).length) p = null;
      var week = buildWeek();
      var next = nextRef(p, week.today);
      if (selWeek !== week.mon) { selWeek = week.mon; selIdx = null; }
      var selected = selIdx == null ? lhDefaultDay(week) : selIdx;
      var c = coach();
      area.innerHTML = '';
      area.appendChild(headBlock(week, p, next));
      var grid = el('div', { class: 'lh-grid' });
      var main = el('div', { class: 'lh-main' }), side = el('div', { class: 'lh-side' });
      if (p) {
        area.appendChild(weekBlock(week, p, selected));
        main.appendChild(sessionBlock(week, p, week.days[selected], next));
      } else main.appendChild(startBlock(u, c));
      if (c) side.appendChild(coachPanel(u, c)); else if (p) side.appendChild(blockPanel(p, week));
      // Strength sits under the session, in the wide column (26 Nov: beside the coach it left half a screen empty
      // under a three-exercise session); with no program yet it stays beside the ways to start
      (p ? main : side).appendChild(strengthPanel(u));
      side.appendChild(meetOrWeightPanel(u));
      grid.appendChild(main); grid.appendChild(side);
      area.appendChild(grid);
      area.appendChild(el('div', { class: 'lh-sr', id: 'lh-live', 'aria-live': 'polite' }));
      if (keep) { var f = area.querySelector('[data-lh="' + keep + '"]'); if (f) f.focus(); }
      lastV = Store._v;
    } finally { rendering = false; }
  }
  // Drawn when shown, and again whenever the Store moves while it is shown (nothing tells a pane it changed: the
  // other panes draw on their tab's click and after their own writes).
  function watch() {
    if (timer) return;
    timer = setInterval(function () {
      if (!shown()) { clearInterval(timer); timer = null; return; }
      if (Store._v !== lastV) render();
    }, 1000);
  }
  function show() {
    if (!isLaptop()) { var t = tab('today'); if (t) t.click(); return; }
    render();
    watch();
  }

  // From the dashboard's start (athlete.html bootstrap, after the ?tab= link): the tab's name and icon, and the landing.
  function boot() {
    var t = tab('home');
    if (!t) return;
    t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/><path d="M7.5 14h2M11 14h2M14.5 14h2"/></svg><span>Home</span>';
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
