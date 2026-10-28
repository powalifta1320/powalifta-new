/* coach-program.js: the iPhone app's Programs (2026-10-28). The owner on the old phone builder: "the program
   builder" was one of the four things wrong (chips in tiles in cards, every week's days in one scroll).
   Now: whose program is the large title (tap it for the roster), the block is the screen's one lit card,
   the weeks a segmented control, one day per page (swipe, or tap a day), each set in Train's words
   ("180 kg × 3 @ 8"), and an exercise opens an editor sheet with steppers for sets, reps, load and effort.
   A floating Add exercise is the screen's red; the block's ⋯ keeps every action (templates, Bring a program
   in, Maxes for %, Start the next block, Build from goal, Set fields...), the week's ⋯ and a day's ⋯ theirs.
   Every edit goes through coach.html's own builder functions (setBlockRx, setBlockCount, addBlock,
   addRestDay...) and persistProgram, so the demo stays write-safe and saving stays one path. Every value
   the coach (or a seller) wrote is escaped or read through Number(). The laptop keeps its own builder. */
(function () {
  'use strict';
  var hasDom = typeof document !== 'undefined';
  var LIFT_NAME = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var MAIN = ['squat', 'bench', 'deadlift'];
  var REST_RX = /\b(rest|off|recovery)\b/i;   // the builder's isRestDay heuristic (coach.html, critical fix #1)

  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n2(v) { var x = Number(v); return isFinite(x) ? Math.round(x * 100) / 100 : 0; }
  function unit() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function disp(kg) { return typeof kgToDisplay === 'function' ? kgToDisplay(kg) : n2(kg); }
  function first(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function ic(k, w) { return window.CoachApp && CoachApp.ic ? CoachApp.ic(k, w) : ''; }
  var DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  var CHEV_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  /* ====================================================================================================
     PURE (tests.html "programs (coach-program.js)")
     ==================================================================================================== */
  function cpIsRestDay(day) { return !!day && !(day.exercises || []).length && REST_RX.test(day.name || ''); }
  // One block of sets as Train says it: { load, reps, effort, count, pctLoad, rir }. b: a groupSets block
  // (or a set). Numbers through Number(); the unit from the caller (kg or lb).
  function cpSetLine(b, u, show) {
    u = u || 'kg'; show = show || function (kg) { return n2(kg); };
    var pct = b.pct != null && b.pct !== '' ? Number(b.pct) : null;
    var pctHi = b.pctHi != null && Number(b.pctHi) > Number(b.pct) ? Number(b.pctHi) : null;
    var w = Number(b.weight) > 0 ? Number(b.weight) : 0, wHi = Number(b.weightHi) > w ? Number(b.weightHi) : 0;
    var wTxt = w ? show(w) + (wHi ? '–' + show(wHi) : '') + ' ' + u : '';
    var load = pct != null ? n2(pct) + (pctHi != null ? '–' + n2(pctHi) : '') + '%' : wTxt;
    var rpe = b.rpe != null && b.rpe !== '' ? Number(b.rpe) : null, rpeHi = b.rpeHi != null && Number(b.rpeHi) > rpe ? Number(b.rpeHi) : null;
    var effort = '';
    if (rpe != null && isFinite(rpe)) {
      if (b.rir) effort = (rpeHi != null ? n2(10 - rpeHi) + '–' + n2(10 - rpe) : n2(10 - rpe)) + ' RIR';
      else effort = '@ ' + n2(rpe) + (rpeHi != null ? '–' + n2(rpeHi) : '');
    }
    var reps = b.reps != null && b.reps !== '' ? String(n2(b.reps)) : '';
    return { load: load, reps: reps, effort: effort, rir: !!b.rir, count: Math.max(1, Number(b.count) || 1), pctLoad: pct != null && wTxt ? wTxt : '' };
  }
  // The line as plain text: "180 kg × 3 @ 8", "3 reps @ 8" with no load, "75% × 4".
  function cpSetText(b, u, show) {
    var L = cpSetLine(b, u, show);
    var head = L.load ? L.load + (L.reps ? ' × ' + L.reps : '') : (L.reps ? plural(Number(L.reps), 'rep') : '');
    return (head + (L.effort ? (L.rir ? ' · ' : ' ') + L.effort : '')).trim();
  }
  // A day's summary: "2 exercises · 7 sets", "Rest", "No exercises yet".
  function cpDayMeta(day) {
    var ex = (day && day.exercises) || [], sets = ex.reduce(function (s, e) { return s + ((e.sets || []).length); }, 0);
    if (!ex.length) return REST_RX.test((day && day.name) || '') ? 'Rest' : 'No exercises yet';
    return plural(ex.length, 'exercise') + ' · ' + plural(sets, 'set');
  }
  // Which day to open in a week: the first with a set still to do, else the first.
  function cpNextDay(week) {
    var days = (week && week.days) || [];
    for (var i = 0; i < days.length; i++) {
      var sets = (days[i].exercises || []).reduce(function (a, e) { return a.concat(e.sets || []); }, []);
      if (sets.length && sets.some(function (x) { return !x.completed && !x.skipped; })) return i;
    }
    return 0;
  }
  // The load their best e1RM points to for reps at an RPE (the app's own math: suggestNewLoad), rounded to
  // their jump. e1: competition-equivalent e1RM in kg; mult: the variant's multiplier. 0 when it can't say.
  function cpExpectedLoad(e1, mult, reps, rpe, stepKg) {
    var e = Number(e1), m = Number(mult) || 1, r = Number(reps), p = Number(rpe), st = Number(stepKg) || 2.5;
    if (!(e > 0) || !(r >= 1) || !(p >= 5 && p <= 10)) return 0;
    var adj = (r - 1) + (10 - p), pct = typeof rpeLoadPct === 'function' ? rpeLoadPct(r, p) : adj <= 0 ? 1 : Math.max(0.4, 1 - adj * 0.0333);
    return Math.round(e / m * pct / st) * st;
  }
  // A step for the load stepper in the unit shown: the lifter's jump (2.5 kg, 5 lb) or 2.5 for a %.
  function cpLoadStep(pctMode, u) { return pctMode ? 2.5 : (u === 'lb' || u === 'lbs' ? 5 : 2.5); }
  // Switching how a block writes its load (kg, or % of their max) or its effort (RPE, or reps in reserve):
  // the patch for its sets (setBlockRx: null clears a field). s: one of the block's sets (they are the same
  // set); kind: 'pct' | 'rir'; maxKg: the max a % works from (0 = none yet). Going to % keeps the load it
  // comes to (a range keeps its top); going back to kg keeps the load and drops the %.
  function cpModePatch(s, kind, on, maxKg) {
    s = s || {};
    if (kind === 'rir') return { rir: on ? true : null };
    if (!on) return { pct: null, pctHi: null };
    var m = Number(maxKg) > 0 ? Number(maxKg) : 0;
    var toKg = function (p) { return typeof pctLoadKg === 'function' ? pctLoadKg(p, m) : Math.round(m * p / 100 / 2.5) * 2.5; };
    var pct = s.pct != null && s.pct !== '' ? Number(s.pct) : (m && Number(s.weight) > 0 ? Math.round(Number(s.weight) / m * 100) : 75);
    var out = { pct: pct };
    if (m) out.weight = toKg(pct);
    var hp = s.pctHi != null && s.pctHi !== '' ? Number(s.pctHi) : null;
    if (hp == null && m && Number(s.weightHi) > 0) { var h2 = Math.round(Number(s.weightHi) / m * 100); if (h2 > pct) hp = h2; }
    if (hp != null && m) { var hk = toKg(hp); if (hk > out.weight) { out.pctHi = hp; out.weightHi = hk; } else { out.pctHi = null; out.weightHi = null; } }
    else if (hp != null) out.pctHi = hp;
    return out;
  }
  // A patch onto a set object (the exercise-wide switch in ⋯ goes through setExerciseRx with this).
  function applyPatch(st, p) { Object.keys(p).forEach(function (k) { if (p[k] == null) delete st[k]; else st[k] = p[k]; }); }
  // The More row's words: "More", and what it holds that the block's line doesn't say (tempo, pauses, bands).
  function cpMoreText(fieldsShort) { var f = String(fieldsShort || '').trim(); return f ? 'More · ' + f : 'More'; }
  // Whether a block gets "about N kg for them": the first block (the top set), or a block with no load yet.
  // Never a later block with a load: back-offs are often written light on purpose (the owner's call, 28 Oct).
  function cpWantsHint(bi, blk) { return Number(bi) === 0 || !(Number(blk && blk.weight) > 0); }

  /* ====================================================================================================
     STATE: whose program, which week, which day (per lifter and week)
     ==================================================================================================== */
  var S = { aid: null, days: {}, area: null, bg: null, sheetRepaint: null };
  function dayKey(aid, wi) { return aid + ':' + wi; }
  function curWeek() { return typeof activeWeekIdx === 'number' ? activeWeekIdx : 0; }
  function setWeek(i) { try { activeWeekIdx = i; } catch (e) {} }
  function rowOf(aid) { try { return window.CoachLifters && CoachLifters.rowOf ? CoachLifters.rowOf(aid) : null; } catch (e) { return null; } }
  function progOf(aid) { return (Store.get().programs || []).find(function (p) { return p.athleteId === aid; }) || null; }
  function roster() { var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null; return (Store.get().athletes || []).filter(function (a) { return u && a.coachId === u.id; }); }
  function select(aid) {
    var sel = hasDom && document.getElementById('progAthlete');
    if (sel) sel.value = aid;
  }
  // A lifter newly opened here lands on the week they're in and the next day they train.
  function enter(aid, prog) {
    if (S.aid === aid) return;
    S.aid = aid;
    var r = rowOf(aid), wk = r && r.status && r.status.week;
    var wi = wk && wk.idx != null && prog.weeks[wk.idx] ? wk.idx : 0;
    setWeek(wi);
    S.days[dayKey(aid, wi)] = cpNextDay(prog.weeks[wi]);
  }

  /* ====================================================================================================
     RENDER
     ==================================================================================================== */
  function render(area, aid) {
    if (!area || !hasDom) return false;
    S.area = area;
    paintTitle(aid);
    area.innerHTML = '';
    var root = el('div', { class: 'cp ca-root' });
    area.appendChild(root);
    if (!aid) { root.appendChild(emptyNoLifters()); return true; }
    var prog = progOf(aid);
    if (!prog) { S.aid = aid; root.appendChild(emptyNoBlock(aid)); return true; }
    prog.weeks.forEach(function (wk) { (wk.days || []).forEach(function (d) { (d.exercises || []).forEach(function (ex) { if (typeof ensureExerciseShape === 'function') ensureExerciseShape(ex); }); }); });
    enter(aid, prog);
    if (curWeek() >= prog.weeks.length) setWeek(Math.max(0, prog.weeks.length - 1));
    var wi = curWeek(), wk = prog.weeks[wi];
    var allSets = prog.weeks.reduce(function (a, w) { return a.concat((w.days || []).reduce(function (b, d) { return b.concat((d.exercises || []).reduce(function (c, e) { return c.concat(e.sets || []); }, [])); }, [])); }, []);
    var finished = allSets.length > 0 && allSets.every(function (x) { return x.completed; });
    root.appendChild(heroEl(prog, aid, allSets, finished));
    root.appendChild(weeksEl(prog, aid));
    if (!wk) { root.appendChild(el('p', { class: 'ca-none' }, 'No weeks yet. Add one with +.')); return true; }
    var di = Math.min(S.days[dayKey(aid, wi)] || 0, Math.max(0, (wk.days || []).length));
    S.days[dayKey(aid, wi)] = di;
    root.appendChild(dayChipsEl(wk, di));
    var pager = pagerEl(prog, aid, wk, wi, di);
    root.appendChild(pager);
    var fab = el('button', { type: 'button', class: 'cp-fab' + (finished ? ' is-soft' : ''), 'aria-label': 'Add an exercise to this day' });
    fab.innerHTML = PLUS + '<span>Add exercise</span>';
    fab.addEventListener('click', function () {
      var d = S.days[dayKey(aid, curWeek())] || 0;
      var day = wk.days[d];
      if (!day) return;
      if (typeof openAddExercise === 'function') openAddExercise(curWeek(), d);
    });
    root.appendChild(fab);
    // Land on the remembered day without an animation, then follow the swipe.
    requestAnimationFrame(function () { scrollToDay(pager, di, false); syncDay(root, pager, aid, wk, true); });
    wirePager(root, pager, aid, wk);
    return true;
  }
  function el() { return window.el.apply(window, arguments); }   // app.js el(tag, attrs, ...children)

  // The large title is whose program it is: tap it for the roster.
  function paintTitle(aid) {
    var h = document.querySelector('section[data-pane="program"] > .dash-header h2');
    if (!h) return;
    var a = (Store.get().athletes || []).find(function (x) { return x.id === aid; });
    if (!a) { h.textContent = 'Programs'; return; }
    h.innerHTML = '<button type="button" class="cp-title" aria-haspopup="dialog" aria-label="' + esc(a.name) + '. Choose a lifter"><span>' + esc(first(a.name)) + '</span>' + CHEV_DOWN + '</button>';
    h.querySelector('.cp-title').addEventListener('click', openPicker);
  }
  function openPicker() {
    var list = roster();
    if (!list.length || typeof uiSheet !== 'function') return;
    uiSheet('Programs', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Whose program to open'));
      sheet.appendChild(uiList(list.map(function (a) {
        var p = progOf(a.id), r = rowOf(a.id), wk = r && r.status && r.status.week;
        var sub = p ? (p.name || 'Program') + (wk && wk.total ? ' · week ' + (wk.idx + 1) + ' of ' + wk.total : '') : 'No block yet';
        var on = a.id === S.aid;
        var row = uiRow({ av: a.name, avUrl: a.avatarUrl, title: a.name, sub: sub, endHtml: on ? '<span class="cp-pick-on" aria-label="Open now">' + ic('check', 2.6) + '</span>' : '', onClick: function () {
          close();
          if (on) return;
          select(a.id);
          S.aid = null;   // enter() lands on their current week
          if (typeof loadProgram === 'function') loadProgram();
          window.scrollTo(0, 0);
        } });
        if (on) row.setAttribute('aria-current', 'true');
        return row;
      })));
    }, { cls: 'cp-picker' });
  }

  // The block: the screen's one lit card.
  function heroEl(prog, aid, allSets, finished) {
    var h = el('div', { class: 'cp-hero ca-hero ca-rise' });
    var top = el('div', { class: 'cp-hero-top' });
    var name = el('input', { type: 'text', class: 'cp-name', value: prog.name || '', 'aria-label': 'Block name', autocomplete: 'off', spellcheck: 'false' });
    name.value = prog.name || '';
    name.addEventListener('input', function () {
      Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) p.name = name.value; });
      if (typeof persistProgram === 'function') persistProgram(prog.id);
    });
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
    top.appendChild(name);
    var more = el('button', { type: 'button', class: 'cp-ibtn', 'aria-label': 'Program options', html: DOTS });
    more.addEventListener('click', function () { programMenu(prog, aid); });
    top.appendChild(more);
    h.appendChild(top);
    var done = allSets.filter(function (x) { return x.completed; }).length;
    var sessions = prog.weeks.reduce(function (n, w) { return n + (w.days || []).filter(function (d) { return (d.exercises || []).length; }).length; }, 0);
    var r = rowOf(aid), wk = r && r.status && r.status.week;
    var meta = [wk && wk.total ? 'Week ' + (wk.idx + 1) + ' of ' + wk.total : plural(prog.weeks.length, 'week'), plural(sessions, 'session')];
    if (allSets.length) meta.push(Math.round(done / allSets.length * 100) + '% done');
    h.appendChild(el('p', { class: 'cp-blockmeta' }, meta.join(' · ')));
    // The maxes % sets work from: shown when the block uses them.
    if (allSets.some(function (x) { return x.pct != null; }) || (prog.maxes && Object.keys(prog.maxes).length)) {
      var bits = MAIN.map(function (L) { var v = typeof programMaxKg === 'function' ? programMaxKg(prog, aid, L) : 0; return v > 0 ? LIFT_NAME[L].charAt(0) + ' ' + Math.round(disp(v)) : null; }).filter(Boolean);
      var mx = el('button', { type: 'button', class: 'cp-maxes' });
      mx.innerHTML = '<span>Maxes for %</span><b>' + esc(bits.length ? bits.join(' · ') + ' ' + unit() : 'not set') + '</b>' + ic('chev', 2.4);
      mx.addEventListener('click', function () { if (typeof openMaxesSheet === 'function') openMaxesSheet(prog.id, aid); });
      h.appendChild(mx);
    }
    if (finished) {
      h.appendChild(el('p', { class: 'cp-done' }, 'Every set of this block is logged.'));
      var nb = el('button', { type: 'button', class: 'ca-btn is-red' }, 'Start the next block');
      nb.addEventListener('click', function () { if (typeof openNextBlockSheet === 'function') openNextBlockSheet(prog.id, aid); });
      h.appendChild(nb);
    }
    return h;
  }
  function programMenu(prog, aid) {
    var acts = typeof programMenuActions === 'function' ? programMenuActions(prog, aid) : [];
    acts = acts.filter(Boolean);
    acts.splice(Math.min(4, acts.length), 0, { label: 'Your templates', icon: ICONS.copy, onClick: function () { var t = document.getElementById('tab-templates'); if (t) t.click(); } });
    uiActionSheet(prog.name || 'Program', acts);
  }

  // The weeks: an iOS segmented control (it scrolls when a block is long), + adds one, ⋯ the week's menu.
  function weeksEl(prog, aid) {
    var wrap = el('div', { class: 'cp-weeks-row' });
    var seg = el('div', { class: 'cp-weeks', role: 'tablist', 'aria-label': 'Week' });
    var r = rowOf(aid), now = r && r.status && r.status.week ? r.status.week.idx : -1;
    var short = prog.weeks.length > 4;
    prog.weeks.forEach(function (w, i) {
      var on = i === curWeek();
      var b = el('button', { type: 'button', class: 'cp-wk' + (on ? ' on' : '') + (i === now ? ' is-now' : ''), role: 'tab', 'aria-selected': on ? 'true' : 'false', 'aria-label': 'Week ' + (Number(w.number) || i + 1) + (i === now ? ', this week' : '') });
      b.textContent = short ? String(Number(w.number) || i + 1) : 'Week ' + (Number(w.number) || i + 1);
      b.addEventListener('click', function () {
        if (on) return;
        setWeek(i);
        if (S.days[dayKey(aid, i)] == null) S.days[dayKey(aid, i)] = cpNextDay(prog.weeks[i]);
        if (typeof loadProgram === 'function') loadProgram();
      });
      seg.appendChild(b);
    });
    var add = el('button', { type: 'button', class: 'cp-wk cp-wk-add', 'aria-label': 'Add a week', html: PLUS });
    add.addEventListener('click', function () { if (typeof addWeek === 'function') addWeek(); });
    seg.appendChild(add);
    wrap.appendChild(seg);
    var more = el('button', { type: 'button', class: 'cp-ibtn', 'aria-label': 'Week ' + (curWeek() + 1) + ' options', html: DOTS });
    more.addEventListener('click', function () {
      var wi = curWeek(), w = prog.weeks[wi];
      if (!w) return;
      uiActionSheet('Week ' + (Number(w.number) || wi + 1), [
        { label: 'Duplicate week', icon: ICONS.copy, onClick: function () { duplicateWeekAction(prog.id, wi); } },
        { label: 'Add day', icon: ICONS.plus, onClick: function () { addDayAndGo(aid, wi, false); } },
        { label: 'Add rest day', icon: ICONS.plus, onClick: function () { addDayAndGo(aid, wi, true); } },
        { label: 'Remove week', icon: ICONS.trash, danger: true, onClick: function () { deleteWeek(wi); } }
      ]);
    });
    wrap.appendChild(more);
    requestAnimationFrame(function () { var on = seg.querySelector('.cp-wk.on'); if (on && seg.scrollWidth > seg.clientWidth) seg.scrollLeft = on.offsetLeft - seg.clientWidth / 2 + on.offsetWidth / 2; });
    return wrap;
  }
  function addDayAndGo(aid, wi, rest) {
    var prog = progOf(aid), n = prog && prog.weeks[wi] ? prog.weeks[wi].days.length : 0;
    S.days[dayKey(aid, wi)] = n;   // the new day is the last
    if (rest) { if (typeof addRestDay === 'function') addRestDay(wi); }
    else if (typeof addDay === 'function') addDay(wi);
  }

  // The days as chips: tap one to go to it; the pages under them swipe.
  function dayChipsEl(wk, di) {
    var row = el('div', { class: 'cp-days', role: 'tablist', 'aria-label': 'Day' });
    (wk.days || []).forEach(function (d, i) {
      var rest = cpIsRestDay(d);
      var b = el('button', { type: 'button', class: 'cp-day' + (i === di ? ' on' : '') + (rest ? ' is-rest' : ''), role: 'tab', 'aria-selected': i === di ? 'true' : 'false', 'data-day': String(i) });
      var lifts = MAIN.filter(function (L) { return (d.exercises || []).some(function (e) { return e.lift === L; }); });
      b.innerHTML = (lifts.length ? '<span class="cp-dots" aria-hidden="true">' + lifts.map(function (L) { return '<i class="lift-' + L + '"></i>'; }).join('') + '</span>' : '') + '<span>' + esc(String(d.name || 'Day ' + (i + 1))) + '</span>';
      row.appendChild(b);
    });
    var add = el('button', { type: 'button', class: 'cp-day cp-day-add', 'data-day': String((wk.days || []).length), 'aria-label': 'Add a day' });
    add.innerHTML = PLUS + '<span>Day</span>';
    row.appendChild(add);
    return row;
  }

  // One day per page, side by side; the last page adds a day.
  function pagerEl(prog, aid, wk, wi, di) {
    var pager = el('div', { class: 'cp-pager' });
    (wk.days || []).forEach(function (d, i) { pager.appendChild(pageEl(prog, aid, wk, wi, d, i)); });
    var addPage = el('div', { class: 'cp-page is-add', 'data-day': String((wk.days || []).length) });
    var card = el('div', { class: 'cp-daycard cp-addcard' });
    card.appendChild(el('h3', { class: 'cp-add-t' }, 'Add a day to week ' + (Number(wk.number) || wi + 1)));
    card.appendChild(el('p', { class: 'cp-add-s' }, 'A training day gets its exercises from Add exercise. A rest day counts toward their streak.'));
    var b1 = el('button', { type: 'button', class: 'ca-btn is-soft' }); b1.innerHTML = PLUS + '<span>Add day</span>';
    b1.addEventListener('click', function () { addDayAndGo(aid, wi, false); });
    // Critical fix #1: the Add rest day button stays (addRestDay names it "Rest", the isRestDay heuristic reads it).
    var b2 = el('button', { type: 'button', class: 'ca-btn is-soft' }); b2.innerHTML = PLUS + '<span>Add rest day</span>';
    b2.addEventListener('click', function () { addDayAndGo(aid, wi, true); });
    var acts = el('div', { class: 'cp-add-acts' }); acts.appendChild(b1); acts.appendChild(b2);
    card.appendChild(acts);
    addPage.appendChild(card);
    pager.appendChild(addPage);
    return pager;
  }
  function pageEl(prog, aid, wk, wi, day, di) {
    var page = el('div', { class: 'cp-page', 'data-day': String(di) });
    var card = el('div', { class: 'cp-daycard' });
    var head = el('div', { class: 'cp-dayhead' });
    var id = el('div', { class: 'cp-dayid' });
    var nm = el('input', { type: 'text', class: 'cp-dayname', 'aria-label': 'Day name', autocomplete: 'off', spellcheck: 'false' });
    nm.value = day.name || '';
    nm.addEventListener('change', function () { if (typeof updateDayName === 'function') updateDayName(wi, di, nm.value); var c = document.querySelector('.cp-day[data-day="' + di + '"] span:last-child'); if (c) c.textContent = nm.value || 'Day ' + (di + 1); });
    nm.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } });
    id.appendChild(nm);
    id.appendChild(el('span', { class: 'cp-daymeta' }, cpDayMeta(day)));
    head.appendChild(id);
    var more = el('button', { type: 'button', class: 'cp-ibtn', 'aria-label': (day.name || 'Day') + ' options', html: DOTS });
    more.addEventListener('click', function () {
      uiActionSheet(day.name || 'Day', [
        di > 0 ? { label: 'Move earlier in the week', icon: ICONS.arrowUp, onClick: function () { reorderDay(prog.id, wi, di, -1); persistProgram(prog.id); S.days[dayKey(aid, wi)] = di - 1; loadProgram(); } } : null,
        di < wk.days.length - 1 ? { label: 'Move later in the week', icon: ICONS.arrowDown, onClick: function () { reorderDay(prog.id, wi, di, 1); persistProgram(prog.id); S.days[dayKey(aid, wi)] = di + 1; loadProgram(); } } : null,
        { label: 'Duplicate day', icon: ICONS.copy, onClick: function () { duplicateDay(prog.id, wi, di); persistProgram(prog.id); S.days[dayKey(aid, wi)] = di + 1; loadProgram(); } },
        { label: 'Delete day', icon: ICONS.trash, danger: true, onClick: function () { S.days[dayKey(aid, wi)] = Math.max(0, di - 1); deleteDay(wi, di); } }
      ]);
    });
    head.appendChild(more);
    card.appendChild(head);
    var exs = day.exercises || [];
    if (!exs.length) {
      if (REST_RX.test(day.name || '')) card.appendChild(el('div', { class: 'cp-rest' }, el('b', {}, 'Rest'), el('span', {}, 'No training. Rename the day to train on it.')));
      else card.appendChild(el('div', { class: 'cp-rest' }, el('b', {}, 'No exercises yet'), el('span', {}, 'Add the first with Add exercise below.')));
    } else {
      var list = el('div', { class: 'cp-exs' });
      exs.forEach(function (ex, ei) { list.appendChild(exRowEl(prog, aid, wi, di, ex, ei)); });
      card.appendChild(list);
    }
    page.appendChild(card);
    return page;
  }
  function exTitle(ex) {
    if (MAIN.indexOf(ex.lift) >= 0) return (ex.variant ? ex.variant + ' ' : '') + LIFT_NAME[ex.lift];
    if (ex.lift === 'cardio') return ex.exerciseName || 'Cardio';
    return ex.exerciseName || 'Exercise';
  }
  function tileOf(ex) { return typeof _pbTile === 'function' ? _pbTile(ex) : String(exTitle(ex)).charAt(0).toUpperCase(); }
  // An exercise: its tile and name, then each block of sets as Train says it, the note, what was lifted.
  function exRowEl(prog, aid, wi, di, ex, ei) {
    var b = el('button', { type: 'button', class: 'cp-exrow' + (MAIN.indexOf(ex.lift) >= 0 ? ' lift-' + ex.lift : ' lift-acc'), 'aria-label': 'Edit ' + exTitle(ex) });
    var html = '<span class="cp-tile" aria-hidden="true">' + esc(tileOf(ex)) + '</span><span class="cp-ex-main"><span class="cp-ex-t">' + esc(exTitle(ex)) + '</span>';
    if (ex.lift === 'cardio') {
      html += '<span class="cp-set"><span class="cp-set-l">' + esc(plural((ex.sets || []).length, 'bout')) + '</span></span>';
    } else {
      var plan = (ex.sets || []).map(function (s) { return Object.assign({}, s, { weight: typeof planWeight === 'function' ? planWeight(s) : s.weight, reps: s.plannedReps || s.reps }); });
      var blocks = typeof groupSets === 'function' ? groupSets(plan) : [];
      if (!blocks.length) html += '<span class="cp-set is-none">No sets yet</span>';
      blocks.forEach(function (blk) {
        var L = cpSetLine(blk, unit(), disp);
        var head = L.load ? '<b>' + esc(L.load) + '</b>' + (L.reps ? ' × ' + esc(L.reps) : '') : (L.reps ? esc(plural(Number(L.reps), 'rep')) : '');
        var fx = typeof setFieldsShort === 'function' ? setFieldsShort(blk) : '';
        html += '<span class="cp-set"><span class="cp-set-l">' + head + (L.effort ? '<i>' + (L.rir ? ' · ' : ' ') + esc(L.effort) + '</i>' : '') + '</span>' +
          '<span class="cp-set-n">' + esc(plural(L.count, 'set')) + '</span>' +
          (L.pctLoad || fx ? '<span class="cp-set-x">' + esc([L.pctLoad ? '= ' + L.pctLoad : '', fx].filter(Boolean).join(' · ')) + '</span>' : '') + '</span>';
      });
    }
    if (ex.note) html += '<span class="cp-note">' + esc(ex.note) + '</span>';
    var lifted = typeof _gridActualHtml === 'function' ? _gridActualHtml(ex) : '';   // escaped there (athlete-written numbers)
    if (lifted) html += '<span class="cp-lifted"><span>Lifted</span> ' + lifted + '</span>';
    html += '</span>' + ic('chev', 2.2);
    b.innerHTML = html;
    b.addEventListener('click', function () { openEditor(aid, wi, di, ei); });
    return b;
  }

  /* ---------------------------------------------------------------- the pager: swipe or tap a day */
  function scrollToDay(pager, i, smooth) {
    if (!pager.children[i]) return;
    var x = i * pager.clientWidth;   // every page is the pager's width
    if (smooth && pager.scrollTo) pager.scrollTo({ left: x, behavior: 'smooth' }); else pager.scrollLeft = x;
  }
  function syncDay(root, pager, aid, wk, quiet) {
    var w = pager.clientWidth || 1;
    var i = Math.max(0, Math.min(pager.children.length - 1, Math.round(pager.scrollLeft / w)));
    S.days[dayKey(aid, curWeek())] = i;
    root.querySelectorAll('.cp-day').forEach(function (c) { var on = Number(c.getAttribute('data-day')) === i; c.classList.toggle('on', on); c.setAttribute('aria-selected', on ? 'true' : 'false'); if (on && !quiet) c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    var day = (wk.days || [])[i];
    var fab = root.querySelector('.cp-fab');
    if (fab) fab.classList.toggle('is-hidden', !day || cpIsRestDay(day));
    // The pager is as tall as the day on show (a short day has no tail of empty page under it).
    var page = pager.children[i];
    if (page) pager.style.height = page.offsetHeight + 'px';
  }
  function wirePager(root, pager, aid, wk) {
    var raf = 0;
    pager.addEventListener('scroll', function () { if (raf) return; raf = requestAnimationFrame(function () { raf = 0; syncDay(root, pager, aid, wk); }); }, { passive: true });
    root.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('.cp-day');
      if (!c) return;
      var i = Number(c.getAttribute('data-day'));
      scrollToDay(pager, i, !matchMedia('(prefers-reduced-motion: reduce)').matches);
    });
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(function () { syncDay(root, pager, aid, wk, true); });
      Array.prototype.forEach.call(pager.children, function (p) { ro.observe(p); });
    }
  }

  /* ====================================================================================================
     THE EDITOR SHEET: steppers for sets, reps, load and effort, block by block
     ==================================================================================================== */
  function liveEx(aid, wi, di, ei) { var p = progOf(aid), d = p && p.weeks[wi] && p.weeks[wi].days[di]; return d ? d.exercises[ei] : null; }
  // Re-render the program behind the sheet a beat after a value changes (one paint, not one per tap).
  function bgRefresh() { clearTimeout(S.bg); S.bg = setTimeout(function () { if (typeof loadProgram === 'function') loadProgram(); }, 280); }
  function openEditor(aid, wi, di, ei) {
    var ex0 = liveEx(aid, wi, di, ei);
    if (!ex0 || typeof uiSheet !== 'function') return;
    setWeek(wi);
    uiSheet(exTitle(ex0), function (sheet, close) {
      var body = el('div', { class: 'cp-ed' });
      var tools = el('div', { class: 'cp-ed-tools' });
      var doneTop = el('button', { type: 'button', class: 'cp-ed-done' }, 'Done');
      doneTop.addEventListener('click', function () { close(); });
      var more = el('button', { type: 'button', class: 'cp-ibtn cp-ed-more', 'aria-label': 'Exercise options', html: DOTS });
      more.addEventListener('click', function () {
        var prog = progOf(aid), d = prog && prog.weeks[wi] && prog.weeks[wi].days[di];
        if (!d) return;
        var exNow = liveEx(aid, wi, di, ei) || ex0, live = (exNow.sets || []).filter(function (x) { return !x.completed; });
        var isMain = MAIN.indexOf(exNow.lift) >= 0 && exNow.lift !== 'cardio';
        var allPct = live.length > 0 && live.every(function (x) { return x.pct != null; }), allRir = live.length > 0 && live.every(function (x) { return x.rir; });
        var maxKg = isMain && typeof programMaxKg === 'function' ? programMaxKg(prog, aid, exNow.lift) : 0;
        // How every block writes its load and effort (each block's More switches its own).
        var every = function (kind, on) { setExerciseRx(wi, di, ei, function (st) { applyPatch(st, cpModePatch(st, kind, on, maxKg)); }); if (S.sheetRepaint) S.sheetRepaint(); };
        uiActionSheet(exTitle(exNow), [
          ei > 0 ? { label: 'Move up', icon: ICONS.arrowUp, onClick: function () { close(); reorderExercise(prog.id, wi, di, ei, -1); persistProgram(prog.id); loadProgram(); } } : null,
          ei < d.exercises.length - 1 ? { label: 'Move down', icon: ICONS.arrowDown, onClick: function () { close(); reorderExercise(prog.id, wi, di, ei, 1); persistProgram(prog.id); loadProgram(); } } : null,
          { label: 'Duplicate', icon: ICONS.copy, onClick: function () { close(); copyExercise(prog.id, wi, di, ei); persistProgram(prog.id); loadProgram(); } },
          live.length && isMain ? { label: allPct ? 'Every block in ' + unit() : 'Every block in % of max', icon: ICONS.weight, onClick: function () { every('pct', !allPct); } } : null,
          live.length && exNow.lift !== 'cardio' ? { label: allRir ? 'Every block as RPE' : 'Every block as reps in reserve', icon: ICONS.flame, onClick: function () { every('rir', !allRir); } } : null,
          { label: 'Remove', icon: ICONS.trash, danger: true, onClick: function () { close(); deleteExercise(wi, di, ei); } }
        ]);
      });
      tools.appendChild(more); tools.appendChild(doneTop);
      sheet.appendChild(tools);
      sheet.appendChild(body);
      var paint = function () { paintEditor(body, aid, wi, di, ei, close); };
      S.sheetRepaint = paint;
      S.moreOpen = {};
      paint();
    }, { cls: 'cp-sheet', onClose: function () { S.sheetRepaint = null; S.moreOpen = {}; clearTimeout(S.bg); if (typeof loadProgram === 'function') loadProgram(); } });
  }
  function paintEditor(body, aid, wi, di, ei, close) {
    var prog = progOf(aid), wk = prog && prog.weeks[wi], day = wk && wk.days[di], ex = day && day.exercises[ei];
    body.innerHTML = '';
    if (!ex) { close(); return; }
    var main = MAIN.indexOf(ex.lift) >= 0, u = unit();
    var sub = [day.name || 'Day ' + (di + 1), 'Week ' + (Number(wk.number) || wi + 1)];
    body.appendChild(el('p', { class: 'ui-sheet-sub cp-ed-sub' }, sub.join(' · ')));
    var last = typeof getLastSetForExercise === 'function' ? getLastSetForExercise(aid, ex.lift, ex.variant, ex.exerciseName) : null;
    if (last) body.appendChild(el('p', { class: 'cp-ed-last' }, 'Last time ' + disp(last.weight) + ' ' + u + ' × ' + n2(last.reps) + (last.rpe != null ? ' @ ' + n2(last.rpe) : '') + (typeof fmtDateShort === 'function' ? ' · ' + fmtDateShort(last.date) : '')));
    if (ex.lift === 'cardio') {
      body.appendChild(el('p', { class: 'cp-ed-note' }, 'Cardio bouts are edited on the laptop for now.'));
    } else {
      var live = (ex.sets || []).filter(function (s) { return !s.completed; });
      var anyPct = live.some(function (s) { return s.pct != null; });
      var maxKg = main && typeof programMaxKg === 'function' ? programMaxKg(prog, aid, ex.lift) : 0;
      if (anyPct && main && !maxKg) body.appendChild(el('p', { class: 'cp-ed-note' }, 'No max yet: the % loads fill in once they log a ' + LIFT_NAME[ex.lift].toLowerCase() + ' set, or set one in Maxes for %.'));
      var blocks = typeof groupSets === 'function' ? groupSets(ex.sets) : [];
      var sfDef = typeof programSetFields === 'function' ? programSetFields(prog) : { on: [], cols: [] };
      blocks.forEach(function (blk, bi) { body.appendChild(blockEl(body, aid, wi, di, ei, ex, blk, bi, blocks.length, main, maxKg, sfDef, close, blocks)); });
      var addB = el('button', { type: 'button', class: 'ca-btn is-soft cp-ed-add' });
      addB.innerHTML = PLUS + '<span>Add sets</span>';
      addB.addEventListener('click', function () { addBlock(wi, di, ei); paintEditor(body, aid, wi, di, ei, close); });
      body.appendChild(addB);
    }
    // The coach's note: the lifter reads it under the exercise.
    var nl = el('label', { class: 'cp-ed-notel' });
    nl.appendChild(el('span', {}, 'Note for ' + first(((Store.get().athletes || []).find(function (a) { return a.id === aid; }) || {}).name || 'them')));
    var ta = el('textarea', { class: 'coach-note-input cp-ed-ta', rows: '2', placeholder: 'Slow down, pause at the bottom, belt on...' });
    ta.value = ex.note || '';
    ta.addEventListener('input', function () {
      Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); var e2 = p && p.weeks[wi] && p.weeks[wi].days[di] && p.weeks[wi].days[di].exercises[ei]; if (e2) e2.note = ta.value; });
      if (typeof persistProgram === 'function') persistProgram(prog.id);
      bgRefresh();
    });
    nl.appendChild(ta);
    body.appendChild(nl);
    body.appendChild(el('p', { class: 'cp-ed-saved' }, 'Changes save as you make them.'));
  }
  function segEl(label, opts, onPick) {
    var wrap = el('div', { class: 'cp-tg' });
    wrap.appendChild(el('span', { class: 'cp-tg-l' }, label));
    var seg = el('div', { class: 'cp-seg', role: 'radiogroup', 'aria-label': label });
    opts.forEach(function (o, k) {
      var b = el('button', { type: 'button', class: o[1] ? 'on' : '', role: 'radio', 'aria-checked': o[1] ? 'true' : 'false' }, o[0]);
      b.addEventListener('click', function () { onPick(k); });
      seg.appendChild(b);
    });
    wrap.appendChild(seg);
    return wrap;
  }
  // One block of identical sets: sets, reps, load (or % of max) and effort first, then one More with what a
  // block rarely needs. A block with a logged set reads as it was lifted.
  function blockEl(body, aid, wi, di, ei, ex, blk, bi, nBlocks, main, maxKg, sfDef, close, all) {
    var box = el('div', { class: 'cp-blk' });
    var sets = (ex.sets || []).slice(blk.startIdx, blk.startIdx + blk.count);
    var logged = sets.some(function (s) { return s.completed; });
    var head = el('div', { class: 'cp-blk-h' });
    // The block's line in Train's words, kept true as the steppers move.
    var headT = el('span', { class: 'cp-blk-t' });
    var paintHead = function () {
      var role = nBlocks < 2 ? '' : bi === 0 ? (blk.count === 1 ? 'Top set' : 'First') : 'Back-offs';
      headT.textContent = (role ? role + ' · ' : '') + cpSetText(blk, unit(), disp);
    };
    paintHead();
    head.appendChild(headT);
    box.appendChild(head);
    if (logged) {
      box.appendChild(el('p', { class: 'cp-blk-logged' }, 'Logged. A set they lifted keeps what it was; edit the next week instead.'));
      return box;
    }
    var grid = el('div', { class: 'cp-steps' });
    var u = unit(), pctMode = blk.pct != null;
    // Sets
    grid.appendChild(stepCell('Sets', uiStepper({ value: blk.count, step: 1, min: 1, max: 20, label: 'sets', fmt: function (v) { return String(v); },
      onChange: function (v) {
        var delta = v - blk.count;
        setBlockCount(wi, di, ei, blk.startIdx, blk.count, v);
        blk.count = v;
        // The blocks after this one start later (or earlier) now: keep their steppers on their own sets.
        (all || []).forEach(function (b2, j) { if (j > bi) b2.startIdx += delta; });
        paintHead();
      } })));
    // Reps
    grid.appendChild(stepCell('Reps', uiStepper({ value: Number(blk.reps) || 1, step: 1, min: 1, max: 30, label: 'reps', fmt: function (v) { return String(v); },
      onChange: function (v) { setBlockRx(wi, di, ei, blk.startIdx, blk.count, { reps: v }); blk.reps = v; bgRefresh(); paintHead(); paintHint(); } })));
    // Load: a weight in the unit shown, or a % of their max (worked out to a load beside it)
    var calc = el('span', { class: 'cp-calc' });
    var paintCalc = function () { calc.textContent = pctMode ? (blk.weight > 0 ? '= ' + disp(blk.weight) + (blk.weightHi > blk.weight ? '–' + disp(blk.weightHi) : '') + ' ' + u : (main ? 'No max yet' : '')) : ''; };
    if (pctMode) {
      var span = blk.pctHi != null ? Number(blk.pctHi) - Number(blk.pct) : null;
      var onPct = function (v) {
        var kg = maxKg ? pctLoadKg(v, maxKg) : 0, hi = span ? v + span : null, kgHi = hi && maxKg ? pctLoadKg(hi, maxKg) : 0;
        setBlockRx(wi, di, ei, blk.startIdx, blk.count, { pct: v, pctHi: hi, weight: kg || blk.weight || 0, weightHi: kgHi > kg ? kgHi : null });
        blk.pct = v; blk.pctHi = hi; if (kg) blk.weight = kg; blk.weightHi = kgHi > kg ? kgHi : null; paintCalc(); paintHead(); bgRefresh();
      };
      var pctSt = uiStepper({ value: Number(blk.pct) || 0, step: cpLoadStep(true), min: 0, max: 120, label: 'percent', fmt: function (v) { return n2(v) + (span ? '–' + n2(v + span) : '') + '%'; }, onChange: onPct });
      grid.appendChild(stepCell('% of max', typeable(pctSt, 'Type the percent', onPct), calc));
      paintCalc();
    } else {
      var wD = Number(blk.weight) > 0 ? Number(disp(blk.weight)) : 0, hiD = Number(blk.weightHi) > Number(blk.weight) ? Number(disp(blk.weightHi)) - wD : 0;
      var onLoad = function (v) {
        var kg = v > 0 && typeof displayToKg === 'function' ? displayToKg(v) : v, hk = hiD && v > 0 && typeof displayToKg === 'function' ? displayToKg(v + hiD) : null;
        setBlockRx(wi, di, ei, blk.startIdx, blk.count, { weight: kg, weightHi: hk });
        blk.weight = kg; blk.weightHi = hk; bgRefresh(); paintHead(); paintHint();
      };
      var loadSt = uiStepper({ value: wD, step: cpLoadStep(false, u), min: 0, max: 1000, label: 'load', fmt: function (v) { return v > 0 ? n2(v) + (hiD ? '–' + n2(v + hiD) : '') + '<small> ' + esc(u) + '</small>' : 'By feel'; }, onChange: onLoad });
      grid.appendChild(stepCell('Load', typeable(loadSt, 'Type the load in ' + u, onLoad)));
    }
    // Effort: RPE in half steps (blank is "none", for back-off sets), or reps in reserve
    if (blk.rir) {
      var rLo = blk.rpe != null ? 10 - (blk.rpeHi != null && blk.rpeHi > blk.rpe ? Number(blk.rpeHi) : Number(blk.rpe)) : 2, rSpan = blk.rpeHi != null && blk.rpeHi > blk.rpe ? Number(blk.rpeHi) - Number(blk.rpe) : 0;
      grid.appendChild(stepCell('Reps left', uiStepper({ value: rLo, step: 0.5, min: 0, max: 5, label: 'reps in reserve', fmt: function (v) { return n2(v) + (rSpan ? '–' + n2(v + rSpan) : '') + '<small> RIR</small>'; },
        onChange: function (v) { var rpe = 10 - (v + rSpan), rpeHi = rSpan ? 10 - v : null; setBlockRx(wi, di, ei, blk.startIdx, blk.count, { rpe: rpe, rpeHi: rpeHi }); blk.rpe = rpe; blk.rpeHi = rpeHi; bgRefresh(); paintHead(); paintHint(); } })));
    } else {
      var eSpan = blk.rpeHi != null && blk.rpeHi > blk.rpe ? Number(blk.rpeHi) - Number(blk.rpe) : 0;
      grid.appendChild(stepCell('RPE', uiStepper({ value: blk.rpe != null ? Number(blk.rpe) : 4.5, step: 0.5, min: 4.5, max: 10 - eSpan, label: 'RPE', fmt: function (v) { return v < 5 ? 'None' : '@ ' + n2(v) + (eSpan ? '–' + n2(v + eSpan) : ''); },
        onChange: function (v) { var rpe = v < 5 ? null : v, hi = rpe != null && eSpan ? v + eSpan : null; setBlockRx(wi, di, ei, blk.startIdx, blk.count, { rpe: rpe, rpeHi: hi }); blk.rpe = rpe; blk.rpeHi = hi; bgRefresh(); paintHead(); paintHint(); } })));
    }
    box.appendChild(grid);
    // The load their e1RM points to for these reps at this effort: a suggestion, never a change on its own.
    var hint = el('div', { class: 'cp-hint' });
    box.appendChild(hint);
    function paintHint() {
      hint.innerHTML = '';
      if (!main || pctMode || blk.rpe == null || !cpWantsHint(bi, blk)) return;
      var e1 = typeof bestE1RM === 'function' ? bestE1RM(aid, ex.lift) : 0;
      var stepKg = typeof loadStepKg === 'function' ? loadStepKg(u === 'lb' || u === 'lbs' ? 'lbs' : 'kg') : 2.5;
      var mult = typeof multiplierFor === 'function' ? multiplierFor(ex.lift, ex.variant) : 1;
      var top = blk.rpeHi != null && blk.rpeHi > blk.rpe ? Number(blk.rpeHi) : Number(blk.rpe);
      var kg = cpExpectedLoad(e1, mult, blk.reps, top, stepKg);
      if (!kg) return;
      var who = first(((Store.get().athletes || []).find(function (a) { return a.id === aid; }) || {}).name) || 'them';
      var off = Math.abs((Number(blk.weight) || 0) - kg) >= stepKg * 2;
      var rx = blk.rir ? n2(blk.reps) + ' with ' + n2(10 - top) + ' left' : n2(blk.reps) + ' @ ' + n2(top);
      hint.appendChild(el('span', { class: 'cp-hint-t' }, rx + ' is about ' + disp(kg) + ' ' + u + ' for ' + who));
      if (off) {
        var use = el('button', { type: 'button', class: 'cp-hint-use' }, 'Use ' + disp(kg));
        use.addEventListener('click', function () {
          setBlockRx(wi, di, ei, blk.startIdx, blk.count, { weight: kg, weightHi: null });
          blk.weight = kg; blk.weightHi = null; bgRefresh();
          paintEditor(body, aid, wi, di, ei, close);
        });
        hint.appendChild(use);
      }
    }
    paintHint();
    // More: what a block rarely needs, one tap away and nothing lost: how it writes its load and effort (⋯
    // switches every block at once), its set fields (tempo, pauses, bands, the coach's columns), taking it
    // off. The row names the set fields it holds, so nothing written hides behind it.
    var key = String(ex.id || ei) + ':' + bi, open = !!(S.moreOpen && S.moreOpen[key]);
    var mid = 'cpm-' + wi + '-' + di + '-' + ei + '-' + bi;
    var fx = typeof setFieldsShort === 'function' ? setFieldsShort(blk) : '';
    var mb = el('button', { type: 'button', class: 'cp-more', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': mid });
    mb.innerHTML = '<span class="cp-more-t">' + esc(cpMoreText(fx)) + '</span>' + CHEV_DOWN;
    var mbody = el('div', { class: 'cp-more-body', id: mid });
    mbody.hidden = !open;
    mb.addEventListener('click', function () {
      var on = mbody.hidden;
      mbody.hidden = !on;
      mb.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (!S.moreOpen) S.moreOpen = {};
      if (on) S.moreOpen[key] = 1; else delete S.moreOpen[key];
    });
    // This block's load in kg or % of their max, its effort as RPE or reps in reserve.
    var mode = function (kind, on) {
      var now = liveEx(aid, wi, di, ei), s0 = (now && now.sets && now.sets[blk.startIdx]) || sets[0] || {};
      setBlockRx(wi, di, ei, blk.startIdx, blk.count, cpModePatch(s0, kind, on, maxKg));
      paintEditor(body, aid, wi, di, ei, close);
    };
    var tg = el('div', { class: 'cp-toggles' });
    if (main) tg.appendChild(segEl('Load', [[u, !pctMode], ['% of max', pctMode]], function (k) { if ((k === 1) !== pctMode) mode('pct', k === 1); }));
    tg.appendChild(segEl('Effort', [['RPE', !blk.rir], ['RIR', !!blk.rir]], function (k) { if ((k === 1) !== !!blk.rir) mode('rir', k === 1); }));
    mbody.appendChild(tg);
    if (sfDef && ((sfDef.on || []).length || (sfDef.cols || []).length) && typeof setFieldsEditor === 'function') {
      mbody.appendChild(setFieldsEditor(sfDef, sets, function (patch) { setBlockFields(wi, di, ei, blk.startIdx, blk.count, patch); paintEditor(body, aid, wi, di, ei, close); }, { cls: 'pb-sf cp-sf' }));
    }
    if (nBlocks > 1) {
      var rm = el('button', { type: 'button', class: 'cp-blk-x cp-blk-rm' }, 'Remove these sets');
      rm.addEventListener('click', function () { S.moreOpen = {}; deleteBlock(wi, di, ei, blk.startIdx, blk.count); paintEditor(body, aid, wi, di, ei, close); });
      mbody.appendChild(rm);
    }
    box.classList.add('has-more');
    box.appendChild(mb);
    box.appendChild(mbody);
    return box;
  }
  // Tap the number to type it: a load from nothing is seventy taps of the plus. Same path as the buttons.
  function typeable(st, label, onSet) {
    var val = st.querySelector('.st-val');
    if (!val) return st;
    val.classList.add('is-typeable');
    val.setAttribute('role', 'button'); val.setAttribute('tabindex', '0'); val.setAttribute('aria-label', label);
    var open = function () {
      if (val.querySelector('input')) return;
      var cur = st.getValue(), done = false;
      var inp = el('input', { type: 'number', inputmode: 'decimal', step: 'any', min: '0', class: 'st-input cp-type', 'aria-label': label, placeholder: '0' });
      inp.value = cur > 0 ? String(cur) : '';
      val.innerHTML = '';
      val.appendChild(inp);
      inp.focus();
      if (inp.select) inp.select();
      var commit = function () {
        if (done) return;
        done = true;
        var n = Number(inp.value);
        if (inp.value !== '' && isFinite(n) && n >= 0) { st.setValue(n); if (st.getValue() !== cur) onSet(st.getValue()); } else st.setValue(cur);
      };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); done = true; st.setValue(cur); }
      });
    };
    val.addEventListener('click', open);
    val.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === val) { e.preventDefault(); open(); } });
    return st;
  }
  function stepCell(label, stepper, extra) {
    var c = el('div', { class: 'cp-step' });
    c.appendChild(el('span', { class: 'cp-step-l' }, label));
    c.appendChild(stepper);
    if (extra) c.appendChild(extra);
    return c;
  }

  /* ---------------------------------------------------------------- empty states */
  function emptyNoLifters() {
    var tplN = (Store.get().programTemplates || []).filter(function (t) { var u = getCurrentUser(); return u && t.coachId === u.id; }).length;
    var toTemplates = function () { var t = document.getElementById('tab-templates'); if (t) t.click(); };
    return uiEmpty(tplN ? {
      icon: ICONS.program, title: 'Your program is ready', text: 'It’s saved as a template. Once a lifter joins, open them here and apply it in one tap.',
      primary: { label: 'Invite a lifter', onClick: function () { openInviteModal(); } },
      secondary: { label: tplN === 1 ? 'See your template' : 'See your ' + tplN + ' templates', onClick: toTemplates }
    } : {
      icon: ICONS.program, title: 'Start with your program', text: 'Bring it in from a photo, a screenshot or your spreadsheet, and keep it as a template. Lifters get it in one tap when they join.',
      primary: { label: 'Bring your program in', onClick: function () { openSheetImport(null); } },
      secondary: { label: 'Invite a lifter first', onClick: function () { openInviteModal(); } }
    });
  }
  function emptyNoBlock(aid) {
    var a = (Store.get().athletes || []).find(function (x) { return x.id === aid; }) || { name: 'them' };
    var wrap = el('div', { class: 'cp-empty' });
    var hero = el('div', { class: 'ca-hero cp-hero ca-rise' });
    hero.appendChild(el('p', { class: 'ca-hero-hi' }, 'No block yet'));
    hero.appendChild(el('h2', { class: 'ca-welcome-t' }, 'Write ' + first(a.name) + '’s first block'));
    hero.appendChild(el('p', { class: 'ca-hero-sub' }, 'Start blank and add the days, or let the app draft one from their maxes and goal.'));
    var create = el('button', { type: 'button', class: 'ca-btn is-red' }, 'Start a blank block');
    create.addEventListener('click', function () { if (typeof createProgramFor === 'function') createProgramFor(aid); });
    hero.appendChild(create);
    wrap.appendChild(hero);
    var tplN = (Store.get().programTemplates || []).filter(function (t) { var u = getCurrentUser(); return u && t.coachId === u.id; }).length;
    var rows = [
      { icon: 'trend', title: 'Build from their goal', sub: 'A full block from their lifts and where they want to be', run: function () { openGoalModal(aid); } },
      tplN ? { icon: 'copy', title: 'Use a template', sub: plural(tplN, 'template') + ' saved', run: function () { var t = document.getElementById('tab-templates'); if (t) t.click(); } } : null,
      { icon: 'clip', title: 'Bring a program in', sub: 'A photo, a screenshot or a paste from your sheet', run: function () { openSheetImport(aid); } }
    ].filter(Boolean);
    var list = el('div', { class: 'ca-plain ca-rowsx' });
    rows.forEach(function (r) {
      var b = el('button', { type: 'button', class: 'ca-lrow' });
      b.innerHTML = '<span class="ca-tic t-prog">' + ic(r.icon) + '</span><span class="ca-lrow-tx"><span class="ca-lrow-t">' + esc(r.title) + '</span><span class="ca-lrow-s">' + esc(r.sub) + '</span></span>' + ic('chev', 2.2);
      b.addEventListener('click', r.run);
      list.appendChild(b);
    });
    wrap.appendChild(list);
    return wrap;
  }

  // A lifter switched elsewhere (their card's Program, a fix) lands on their week, not the last one shown.
  function reset() { S.aid = null; }

  window.CoachProgram = {
    render: render, openEditor: openEditor, openPicker: openPicker, reset: reset,
    day: function () { return S.aid ? S.days[dayKey(S.aid, curWeek())] || 0 : 0; },
    // pure, for tests
    cpSetLine: cpSetLine, cpSetText: cpSetText, cpDayMeta: cpDayMeta, cpNextDay: cpNextDay, cpIsRestDay: cpIsRestDay, cpLoadStep: cpLoadStep, cpExpectedLoad: cpExpectedLoad,
    cpWantsHint: cpWantsHint, cpModePatch: cpModePatch, cpMoreText: cpMoreText
  };
})();
