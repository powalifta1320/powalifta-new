/* coach-program.js: the iPhone app's Programs (2026-10-28; rebuilt 31 Oct, coach-builder-v2). The owner on the builder:
   "still very chopped". It now reads like the lifter's Train: whose program is the large title (tap it for the roster)
   with one quiet line under it about the block, and one ⋯ beside Ask for the block and its weeks (Maxes for % among
   them); the week a stepper ("‹ Week 1 of 3 · this week ›") over the days as segments that fit the phone; the day a
   section (its name, what's in it, its ⋯) of exercise cards in Train's language (the lift's dot and name, the cue, a
   row per block of sets in Train's numbers, what was lifted in the lift's colour); Add exercise at the end of the day,
   inline, the screen's one red. An exercise opens an editor sheet with steppers for sets, reps, load and effort; what
   they logged is said there once (written and lifted), with the way to the same exercise next week.
   Every edit goes through coach.html's own builder functions (setBlockRx, setBlockCount, addBlock, addRestDay,
   updateDayName...) and persistProgram, so the demo stays write-safe and saving stays one path. Every value the coach
   (or a seller) wrote is escaped or read through Number(). The laptop keeps its own builder. */
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
  var CHEV_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var CHEV_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

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
  // A day's summary: "2 exercises · 7 sets", "No exercises yet". A rest day has none: its name already says
  // Rest, and the card says what a day off means once (the owner, 29 Oct: "a rest day says Rest once").
  function cpDayMeta(day) {
    var ex = (day && day.exercises) || [], sets = ex.reduce(function (s, e) { return s + ((e.sets || []).length); }, 0);
    if (!ex.length) return REST_RX.test((day && day.name) || '') ? '' : 'No exercises yet';
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
  // Text as search reads it: lower case, accents aside ("tomas" finds Tomás).
  function cpNorm(t) { var x = String(t == null ? '' : t); try { x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {} return x.toLowerCase().trim(); }
  // The lifter picker's order: the programs opened last on this phone (up to 3, the one open now first),
  // then who needs you (worst first), then everyone else by name; each lifter once. q keeps the lifters
  // whose name or block name has it, in the same order, as one list. list: [{ id, name, prog }].
  // → { groups: [{ key, title, items }], n }
  function cpPickGroups(list, o) {
    o = o || {};
    list = list || [];
    var byId = {}, used = {};
    list.forEach(function (a) { byId[a.id] = a; });
    var recent = (o.current ? [o.current] : []).concat(o.recent || []);
    var take = function (ids, cap) {
      var out = [];
      (ids || []).forEach(function (id) { if (byId[id] && !used[id] && (!cap || out.length < cap)) { used[id] = 1; out.push(byId[id]); } });
      return out;
    };
    var gR = take(recent, 3), gN = take(o.need);
    var gA = list.filter(function (a) { return !used[a.id]; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var q = cpNorm(o.q);
    if (q) {
      var hit = gR.concat(gN, gA).filter(function (a) { return cpNorm(a.name).indexOf(q) >= 0 || cpNorm(a.prog).indexOf(q) >= 0; });
      return { groups: hit.length ? [{ key: 'found', title: '', items: hit }] : [], n: hit.length };
    }
    var rest = gR.length || gN.length ? 'Everyone else' : 'Everyone';
    return { groups: [{ key: 'recent', title: 'Recent', items: gR }, { key: 'need', title: 'Needs you', items: gN }, { key: 'all', title: rest, items: gA }].filter(function (g) { return g.items.length; }), n: list.length };
  }
  // Switching how a block writes its load (kg, or % of their max) or its effort (RPE, or reps in reserve):
  // the patch for its sets (setBlockRx: null clears a field). s: one of the block's sets (they are the same
  // set); kind: 'pct' | 'rir'; maxKg: the max a % works from (0 = none yet). Going to % keeps the load it
  // comes to (a range keeps its top); going back to kg keeps the load and drops the %. A block with no load
  // (By feel) starts at 75%, a load nobody chose: the set keeps that % as pctFeel, and back in kg with its %
  // still at it (no range added) it is By feel again. A % the coach picked keeps the load it comes to.
  function cpModePatch(s, kind, on, maxKg) {
    s = s || {};
    if (kind === 'rir') return { rir: on ? true : null };
    var inPct = s.pct != null && s.pct !== '';
    if (!on) {
      var back = { pct: null, pctHi: null, pctFeel: null };
      if (inPct && s.pctFeel != null && s.pctFeel !== '' && Number(s.pct) === Number(s.pctFeel) && !(Number(s.pctHi) > 0)) { back.weight = 0; back.weightHi = null; }
      return back;
    }
    var m = Number(maxKg) > 0 ? Number(maxKg) : 0;
    var toKg = function (p) { return typeof pctLoadKg === 'function' ? pctLoadKg(p, m) : Math.round(m * p / 100 / 2.5) * 2.5; };
    var pct = inPct ? Number(s.pct) : (m && Number(s.weight) > 0 ? Math.round(Number(s.weight) / m * 100) : 75);
    var out = { pct: pct };
    if (!inPct) out.pctFeel = Number(s.weight) > 0 ? null : pct;   // from kg: marked only when it had no load
    if (m) out.weight = toKg(pct);
    var hp = s.pctHi != null && s.pctHi !== '' ? Number(s.pctHi) : null;
    if (hp == null && m && Number(s.weightHi) > 0) { var h2 = Math.round(Number(s.weightHi) / m * 100); if (h2 > pct) hp = h2; }
    if (hp != null && m) { var hk = toKg(hp); if (hk > out.weight) { out.pctHi = hp; out.weightHi = hk; } else { out.pctHi = null; out.weightHi = null; } }
    else if (hp != null) out.pctHi = hp;
    return out;
  }
  // ⋯'s switch for every block: each block as its own switch does it (its first set decides), so the two
  // agree and a block grown after it went to % comes back whole. → one patch per set, by its index.
  function cpModePatches(sets, kind, on, maxKg) {
    sets = sets || [];
    var out = [], blocks = typeof groupSets === 'function' ? groupSets(sets) : sets.map(function (x, i) { return { startIdx: i, count: 1 }; });
    blocks.forEach(function (b) { var p = cpModePatch(sets[b.startIdx], kind, on, maxKg); for (var i = 0; i < b.count; i++) out[b.startIdx + i] = p; });
    return out;
  }
  // A patch onto a set object (the exercise-wide switch in ⋯ goes through setExerciseRx with this).
  function applyPatch(st, p) { Object.keys(p).forEach(function (k) { if (p[k] == null) delete st[k]; else st[k] = p[k]; }); }
  // The More row's words: "More", and what it holds that the block's line doesn't say (tempo, pauses, bands).
  function cpMoreText(fieldsShort) { var f = String(fieldsShort || '').trim(); return f ? 'More · ' + f : 'More'; }
  // The editor's last line, about saving: it saves as you go; offline it's kept on this phone until the
  // connection is back; online with a change still waiting, it says so with Send now. st: { online, pending }
  function cpSaveLine(st) {
    st = st || {};
    if (st.online === false) return { text: 'Offline: saved on this phone. It syncs when you\u2019re back online.', retry: false, waiting: true };
    if (st.pending) return { text: 'Saved on this phone, not sent yet.', retry: true, waiting: true };
    return { text: 'Changes save as you make them.', retry: false, waiting: false };
  }
  // A stepper value that is still too wide at 17 (stillOver): a range stacks its two ends on two lines
  // ('is-stack'); anything else stays one line at 17 ('is-tight').
  function cpFitClass(text, stillOver) { return stillOver && /\d\s*–\s*\d/.test(String(text || '')) ? 'is-stack' : 'is-tight'; }
  // The exercise ⋯'s switches for every block at once. Blocks all written one way offer the other way; blocks
  // written both ways (a top set in kg over back-offs in %) offer both, so either way is one tap. sets: the
  // exercise's sets still to do. → [{ kind: 'pct' | 'rir', on }] (pct only for a main lift; none for cardio).
  function cpEveryChoices(sets, isMain, isCardio) {
    sets = (sets || []).filter(Boolean);
    if (!sets.length || isCardio) return [];
    var nPct = sets.filter(function (x) { return x.pct != null && x.pct !== ''; }).length, nRir = sets.filter(function (x) { return !!x.rir; }).length, out = [];
    if (isMain) {
      if (nPct < sets.length) out.push({ kind: 'pct', on: true });
      if (nPct > 0) out.push({ kind: 'pct', on: false });
    }
    if (nRir < sets.length) out.push({ kind: 'rir', on: true });
    if (nRir > 0) out.push({ kind: 'rir', on: false });
    return out;
  }
  // Whether a block gets "about N kg for them": the first block (the top set), or a block with no load yet.
  // Never a later block with a load: back-offs are often written light on purpose (the owner's call, 28 Oct).
  function cpWantsHint(bi, blk) { return Number(bi) === 0 || !(Number(blk && blk.weight) > 0); }

  /* The builder as Train reads (31 Oct, coach-builder-v2): one quiet line under the title, a week stepper, the
     days as segments that fit, the day as a section of exercise cards, Add exercise at its end. */
  // The quiet line under the lifter's name: "Strength Block · 9 sessions · 23% done". The week is the stepper's to
  // say (with where they are), so it isn't said twice. o: { name, sessions, done, total }
  function cpBlockLine(o) {
    o = o || {};
    var name = String(o.name == null ? '' : o.name).replace(/\s+/g, ' ').trim() || 'Program';
    var out = [name], s = Number(o.sessions) || 0, t = Number(o.total) || 0;
    if (s > 0) out.push(plural(s, 'session'));
    if (t > 0) out.push(Math.round(Math.max(0, Math.min(t, Number(o.done) || 0)) / t * 100) + '% done');
    return out.join(' · ');
  }
  // Where the week on show sits from the one they're in: 'this week', 'next week', 'in 2 weeks', 'last week',
  // '2 weeks ago'; '' when nobody knows which week they're in.
  function cpWeekWhen(view, now) {
    if (now == null || now < 0 || view == null || !isFinite(Number(now)) || !isFinite(Number(view))) return '';
    var d = Number(view) - Number(now);
    if (d === 0) return 'this week';
    if (d === 1) return 'next week';
    if (d === -1) return 'last week';
    return d > 0 ? 'in ' + d + ' weeks' : -d + ' weeks ago';
  }
  // A day's name for its segment: "Squat Day" is "Squat", "Day 2 - Bench" is "Bench" (the section under it says the
  // whole name); "Day 1" stays "Day 1".
  function cpDayShort(name) {
    var n = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    var s = n.replace(/^day\b\s*\d*\s*[-:–·]?\s*/i, '').replace(/\s*[-:–·]?\s*\bday\s*\d*$/i, '').trim();
    return s && !/^\d+$/.test(s) ? s : n;
  }
  // The days' segments must fit a 393 pt phone with + beside them: each day's short name while every name fits its
  // segment (10 letters for three days or fewer, 8 for four, 6 for five), else "Day 1"…; a rest day says Rest either
  // way. Past five days the row scrolls ("Day 6" and on). days: the week's days → one label per day.
  function cpDayLabels(days) {
    days = days || [];
    var n = days.length, fit = n <= 3 ? 10 : n === 4 ? 8 : n === 5 ? 6 : 0;
    var rest = function (d) { return cpIsRestDay(d); };
    var short = days.map(function (d, i) { return rest(d) ? 'Rest' : (cpDayShort(d && d.name) || 'Day ' + (i + 1)); });
    var ok = fit > 0 && short.every(function (t) { return t.length <= fit; });
    return days.map(function (d, i) { return ok || rest(d) ? short[i] : 'Day ' + (i + 1); });
  }
  // What was written for the sets they logged, in the grid's shorthand (the Lifted line's): "180×3 @8, 3×155×5 @7".
  // sets: the logged sets as written (planned load and reps); u: the unit; show: kg → the unit shown.
  function cpWrittenText(sets, u, show) {
    show = show || function (kg) { return n2(kg); };
    var blocks = typeof groupSets === 'function' ? groupSets(sets || []) : (sets || []).map(function (s) { return Object.assign({ count: 1 }, s); });
    return blocks.map(function (b) {
      var L = cpSetLine(b, u, show), load = b.pct != null ? L.load : (Number(b.weight) > 0 ? String(show(Number(b.weight))) + (Number(b.weightHi) > Number(b.weight) ? '–' + show(Number(b.weightHi)) : '') : '');
      var t = (L.count > 1 ? L.count + '×' : '') + (load ? load + '×' : '') + (L.reps || '') + (load ? '' : L.reps ? ' reps' : '');
      return (t + (L.effort ? (L.rir ? ' · ' + L.effort : ' ' + L.effort.replace(/^@ /, '@')) : '')).trim();
    }).filter(Boolean).join(', ');
  }
  // The same exercise in the next week (Change week 2 instead): the same lift, variant and name, on the same day
  // if it's there, else the first day of that week that has it. weeks: the block's weeks. → { wi, di, ei } | null
  function cpNextWeekMatch(weeks, wi, di, ex) {
    var nw = (weeks || [])[Number(wi) + 1];
    if (!nw || !ex) return null;
    var key = function (e) { return [e.lift || '', e.variant || '', String(e.exerciseName || '').trim().toLowerCase()].join('|'); };
    var k = key(ex), days = nw.days || [];
    var order = [Number(di)].concat(days.map(function (d, i) { return i; }).filter(function (i) { return i !== Number(di); }));
    for (var j = 0; j < order.length; j++) {
      var d = days[order[j]];
      if (!d) continue;
      var ei = (d.exercises || []).findIndex(function (e) { return e && key(typeof exAsWritten === 'function' ? exAsWritten(e) : e) === k; });
      if (ei >= 0) return { wi: Number(wi) + 1, di: order[j], ei: ei };
    }
    return null;
  }
  // The block's one ⋯, in the groups a coach reaches for: the block, its weeks, keep or share it, and Delete apart.
  // acts: programMenuActions (the laptop's list, so an action added there still shows: it joins the block's group);
  // more: { rename, weeks: [the week's actions], templates } → [{ title, items }], every action once.
  function cpBlockMenu(acts, more) {
    acts = (acts || []).filter(Boolean); more = more || {};
    var used = [];
    var take = function (re, patch) {
      var a = acts.find(function (x) { return used.indexOf(x) < 0 && re.test(x.label); });
      if (!a) return null;
      used.push(a);
      return patch ? Object.assign({}, a, patch) : a;
    };
    var P = more.patch || {};
    var block = [take(/^Notify/, P.notify), more.rename || null, take(/^Start the next block/, P.next), take(/^Rebuild from goal/, P.goal), take(/imported program/, P.imported),
      take(/^Maxes for %/, P.maxes), take(/^Update % loads/, P.update), take(/^Set fields/, P.fields)];
    var addWeek = take(/^Add week/, P.addWeek);
    var share = [take(/^Save as template/, P.save), more.templates || null, take(/^Export/, P.exported)];
    var del = take(/^Delete program/, P.del);
    block = block.concat(acts.filter(function (a) { return used.indexOf(a) < 0; }));
    return [{ title: 'Block', items: block }, { title: 'Weeks', items: [addWeek].concat(more.weeks || []) }, { title: 'Share', items: share }, { title: '', items: [del] }]
      .map(function (g) { return { title: g.title, items: g.items.filter(Boolean) }; }).filter(function (g) { return g.items.length; });
  }

  /* ====================================================================================================
     STATE: whose program, which week, which day (per lifter and week)
     ==================================================================================================== */
  var S = { aid: null, days: {}, area: null, bg: null, sheetRepaint: null, moreOpen: {} };
  // The programs this coach opened last on this phone, newest first (the picker leads with them). The key names its
  // account, like the desk's own records per coach (app.js, what a sign-out leaves): no other account reads it, and
  // deleting the account takes it with every key that names it.
  var RECENT_KEY = 'powa-cp-recent-';
  function coachId() { var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null; return u && u.id; }
  function recentIds() {
    var id = coachId();
    if (!id) return [];
    try { var l = JSON.parse(localStorage.getItem(RECENT_KEY + id) || '[]'); return Array.isArray(l) ? l.slice(0, 8) : []; } catch (e) { return []; }
  }
  function noteRecent(aid) {
    var id = coachId();
    if (!id || !aid) return;
    try {
      var l = recentIds();
      if (l[0] === aid) return;
      localStorage.setItem(RECENT_KEY + id, JSON.stringify([aid].concat(l.filter(function (x) { return x !== aid; })).slice(0, 8)));
    } catch (e) {}
  }
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
  // A block just given to them (a template's Apply) opens on its first week, whatever week their old one was in.
  function enter(aid, prog) {
    if (S.aid === aid) return;
    S.aid = aid;
    var fresh = !!S.landFresh && S.landFresh === aid;
    if (fresh) S.landFresh = null;   // the tab's own first draw (whoever was open) leaves it for them
    var r = fresh ? null : rowOf(aid), wk = r && r.status && r.status.week;
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
    S.applyFor = null;   // Use a template's lifter is for the Templates visit it opened
    // Before the roster is in: the program's skeleton (or, if it couldn't load, the card with Try again).
    if (window.CoachApp && CoachApp.gate && CoachApp.gate(area, 'program')) return true;
    area.removeAttribute('data-ca-state');
    paintTitle(aid);
    area.innerHTML = '';
    var root = el('div', { class: 'cp ca-root' });
    area.appendChild(root);
    if (!aid) { paintHeader(null); root.appendChild(emptyNoLifters()); return true; }
    noteRecent(aid);
    var prog = progOf(aid);
    if (!prog) { S.aid = aid; paintHeader(null); root.appendChild(emptyNoBlock(aid)); return true; }
    prog.weeks.forEach(function (wk) { (wk.days || []).forEach(function (d) { (d.exercises || []).forEach(function (ex) { if (typeof ensureExerciseShape === 'function') ensureExerciseShape(ex); }); }); });
    enter(aid, prog);
    if (curWeek() >= prog.weeks.length) setWeek(Math.max(0, prog.weeks.length - 1));
    var wi = curWeek(), wk = prog.weeks[wi];
    var allSets = prog.weeks.reduce(function (a, w) { return a.concat((w.days || []).reduce(function (b, d) { return b.concat((d.exercises || []).reduce(function (c, e) { return c.concat(e.sets || []); }, [])); }, [])); }, []);
    var finished = allSets.length > 0 && allSets.every(function (x) { return x.completed; });
    paintHeader(aid, prog);
    root.appendChild(blockLineEl(prog, allSets));
    // Every set logged: what comes next is the screen's one red (Add exercise steps down to quiet).
    if (finished) {
      var dn = el('div', { class: 'cp-done ca-rise' });
      dn.appendChild(el('p', { class: 'cp-done-t' }, 'Every set of this block is logged.'));
      var nb = el('button', { type: 'button', class: 'ca-btn is-red' }, 'Start the next block');
      nb.addEventListener('click', function () { if (typeof openNextBlockSheet === 'function') openNextBlockSheet(prog.id, aid); });
      dn.appendChild(nb);
      root.appendChild(dn);
    }
    if (!wk) {
      // A block with every week taken out: say so, and the one way on.
      var nw = el('div', { class: 'cp-addcard cp-noweeks' });
      nw.appendChild(el('h3', { class: 'cp-add-t' }, 'No weeks yet'));
      nw.appendChild(el('p', { class: 'cp-add-s' }, 'Add the first week, then its days and exercises.'));
      var aw = el('button', { type: 'button', class: 'ca-btn is-red' });
      aw.innerHTML = PLUS + '<span>Add the first week</span>';
      aw.addEventListener('click', function () { if (typeof addWeek === 'function') addWeek(); });
      nw.appendChild(aw);
      root.appendChild(nw);
      return true;
    }
    var di = Math.min(S.days[dayKey(aid, wi)] || 0, Math.max(0, (wk.days || []).length));
    S.days[dayKey(aid, wi)] = di;
    root.appendChild(navEl(prog, aid, wk, wi, di));
    var pager = pagerEl(prog, aid, wk, wi, di);
    root.appendChild(pager);
    // Add exercise ends the day on show, inline (it never floats over a set): the screen's one red.
    var add = el('button', { type: 'button', class: 'ca-btn ' + (finished ? 'is-soft' : 'is-red') + ' cp-addex' });
    add.innerHTML = PLUS + '<span>Add exercise</span>';
    add.addEventListener('click', function () {
      var d = S.days[dayKey(aid, curWeek())] || 0;
      var day = wk.days[d];
      if (!day) return;
      if (typeof openAddExercise === 'function') { openAddExercise(curWeek(), d); dressAdd(aid, curWeek(), d); }
    });
    root.appendChild(add);
    // An exercise just added (Add exercise's Add to day) rises into its place on the day, so the coach sees
    // where it went; then it is an ordinary card.
    var added = S.added;
    S.added = null;
    if (added && added.aid === aid && added.wi === wi) {
      var aday = (wk.days || [])[added.di];
      if (aday && (aday.exercises || []).length === added.n + 1) {
        di = added.di; S.days[dayKey(aid, wi)] = di;
        var cards = pager.children[di] ? pager.children[di].querySelectorAll('.cp-excard') : [];
        var card = cards[cards.length - 1];
        if (card) card.classList.add('is-new');
      }
    }
    // Land on the remembered day without an animation, then follow the swipe.
    requestAnimationFrame(function () {
      scrollToDay(pager, di, false); syncDay(root, pager, aid, wk, true);
      requestAnimationFrame(function () { pager.classList.add('is-live'); });   // its height follows the day from now on
      // The new card and Add exercise under it in view above the tab bar (it floats over the page's foot).
      var nw = root.querySelector('.cp-excard.is-new');
      if (nw) {
        var a2 = root.querySelector('.cp-addex'), r = (a2 && !a2.hidden ? a2 : nw).getBoundingClientRect(), bar = document.querySelector('.bottom-tabs');
        var floor = bar ? bar.getBoundingClientRect().top - 12 : innerHeight;
        var by = Math.min(r.bottom - floor, nw.getBoundingClientRect().top - 120);
        if (by > 0) { try { window.scrollBy({ top: by, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); } catch (e) { window.scrollBy(0, by); } }
      }
    });
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
  // Under the title, Train's way: one quiet line about the block ("Strength Block · 9 sessions · 23% done", the first
  // line of the page, tucked under the title as Train's date line is), and at the top right, beside Ask and the bell,
  // the block's one ⋯ (the block, its weeks, Maxes for %, keep or share it). No block (or no lifter): neither.
  function paintHeader(aid, prog) {
    var hd = hasDom && document.querySelector('section[data-pane="program"] > .dash-header');
    if (!hd) return;
    var right = hd.children[1], more = right && right.querySelector('.cp-more');
    hd.classList.toggle('cp-head', !!prog);
    if (!prog) { if (more) more.remove(); return; }
    if (!more && right) {
      more = el('button', { type: 'button', class: 'ca-hbtn cp-more', 'aria-haspopup': 'dialog', 'aria-label': 'Block and week options', html: DOTS });
      more.addEventListener('click', function () { var p = progOf(S.aid); if (p) programMenu(p, S.aid); });
      right.appendChild(more);
    }
  }
  function blockLineEl(prog, allSets) {
    var sessions = prog.weeks.reduce(function (n, w) { return n + (w.days || []).filter(function (d) { return (d.exercises || []).length; }).length; }, 0);
    return el('p', { class: 'cp-sub' }, cpBlockLine({ name: prog.name, sessions: sessions, done: allSets.filter(function (x) { return x.completed; }).length, total: allSets.length }));
  }
  // Whose program: the ones you opened last, then who needs you (with why), then everyone by name. Past
  // six lifters a search keeps its place at the top (like Lifters); 60 lifters open and filter at once (the
  // roster's rows are reused, not worked out again).
  function openPicker() {
    var list = roster();
    if (!list.length || typeof uiSheet !== 'function') return;
    var CL = window.CoachLifters || null, M = null;
    try { M = CL && CL.model ? CL.model({ reuse: true }) : null; } catch (e) { M = null; }
    var jobs = (M && M.jobs) || [];
    var need = window.CoachApp && CoachApp.caNeedIds ? CoachApp.caNeedIds(jobs) : [];
    var items = list.map(function (a) { var p = progOf(a.id); return { id: a.id, name: a.name, prog: p ? (p.name || 'Program') : '', a: a }; });
    var many = list.length > 6;
    uiSheet('Programs', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Whose program to open'));
      var inp = null;
      if (many) {
        var box = el('label', { class: 'ca-search cp-pick-search' });
        box.innerHTML = ic('search');
        inp = el('input', { type: 'search', class: 'ca-q', placeholder: 'Find a lifter', 'aria-label': 'Find a lifter', autocomplete: 'off', spellcheck: 'false' });
        box.appendChild(inp);
        sheet.appendChild(box);
      }
      var host = el('div', { class: 'cp-pick-list' });
      sheet.appendChild(host);
      // A row's line: why they need you, if they do (the Lifters row's words and dot); else their block and week.
      var rowFor = function (it) {
        var a = it.a, r = rowOf(a.id), wk = r && r.status && r.status.week, on = a.id === S.aid;
        var line = it.prog ? it.prog + (wk && wk.total ? ' · week ' + (wk.idx + 1) + ' of ' + wk.total : '') : 'No block yet', sev = '';
        if (need.indexOf(a.id) >= 0 && r && CL && CL.clTopJob) {
          var top = CL.clTopJob(r, jobs);
          if (top) {
            line = (top.type === 'busy' && window.CoachApp && CoachApp.caBusyLine && CoachApp.caBusyLine(top)) || (CL.clLine ? CL.clLine(r, top) : line);
            sev = window.CoachApp && CoachApp.caSev ? CoachApp.caSev(top) : (top.type === 'pain' ? 'alert' : 'watch');
          }
        }
        var row = uiRow({ av: a.name, avUrl: a.avatarUrl, title: a.name, sub: line, endHtml: on ? '<span class="cp-pick-on" aria-label="Open now">' + ic('check', 2.6) + '</span>' : '', onClick: function () {
          close();
          if (on) return;
          select(a.id);
          S.aid = null;   // enter() lands on their current week
          if (typeof loadProgram === 'function') loadProgram();
          window.scrollTo(0, 0);
        } });
        if (sev) {
          var sub = row.querySelector('.ui-row-sub');
          if (sub) { sub.classList.add('cp-pick-sub', 'sev-' + sev); sub.insertAdjacentHTML('afterbegin', '<i class="ca-dot" aria-hidden="true"></i>'); }
        }
        if (on) row.setAttribute('aria-current', 'true');
        return row;
      };
      var paint = function () {
        var q = inp ? inp.value : '';
        var G = cpPickGroups(items, { current: S.aid, recent: recentIds(), need: need, q: q });
        host.innerHTML = '';
        if (!G.groups.length) { host.appendChild(el('p', { class: 'ca-none' }, 'No one called \u201c' + String(q).trim() + '\u201d')); return; }
        // Six or fewer: one list in that order (titles over two or three rows read as clutter).
        var groups = many ? G.groups : [{ title: '', items: G.groups.reduce(function (all, g) { return all.concat(g.items); }, []) }];
        groups.forEach(function (g) {
          if (g.title) host.appendChild(el('h3', { class: 'ca-h3 cp-pick-h' }, g.title));
          host.appendChild(uiList(g.items.map(rowFor)));
        });
      };
      paint();
      if (inp) {
        var tm = null;
        inp.addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(paint, 60); });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Escape' && inp.value) { e.preventDefault(); e.stopPropagation(); inp.value = ''; paint(); } });
      }
    }, { cls: 'cp-picker' + (many ? ' is-many' : '') });
  }

  // A name, asked in the app's own sheet (the block's and a day's: their ⋯ › Rename): the field, then the one red.
  // o: { title, label, value, go, onSave(name) }
  function openNameSheet(o) {
    if (typeof uiSheet !== 'function') return null;
    return uiSheet(o.title, function (sheet, close) {
      var lab = el('label', { class: 'cp-field' });
      lab.appendChild(el('span', { class: 'cp-field-l' }, o.label || 'Name'));
      var inp = el('input', { type: 'text', class: 'cp-field-in', maxlength: '80', autocomplete: 'off', spellcheck: 'false', 'aria-label': o.label || 'Name' });
      inp.value = String(o.value == null ? '' : o.value);
      lab.appendChild(inp);
      sheet.appendChild(lab);
      var go = el('button', { type: 'button', class: 'ca-btn is-red cp-sheet-go' }, o.go || 'Save');
      var save = function () {
        var name = inp.value.replace(/\s+/g, ' ').trim();
        if (!name) { inp.focus(); return; }
        close();
        o.onSave(name);
      };
      go.addEventListener('click', save);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      sheet.appendChild(go);
    }, { cls: 'cp-name-sheet' });
  }
  function renameBlock(prog) {
    openNameSheet({ title: 'Rename the block', label: 'Block name', value: prog.name || '', onSave: function (name) {
      Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) p.name = name; });
      if (typeof persistProgram === 'function') persistProgram(prog.id);
      if (typeof loadProgram === 'function') loadProgram();
    } });
  }
  function renameDay(aid, wi, di) {
    var p = progOf(aid), d = p && p.weeks[wi] && p.weeks[wi].days[di];
    if (!d) return;
    openNameSheet({ title: 'Rename the day', label: 'Day name', value: d.name || '', onSave: function (name) {
      if (typeof updateDayName === 'function') updateDayName(wi, di, name);
      if (typeof loadProgram === 'function') loadProgram();
    } });
  }
  // The block's one ⋯ (the header's, beside Ask): the laptop's actions (programMenuActions) and the week's, in the
  // groups a coach reaches for them (cpBlockMenu): the block, its weeks, keep or share it, Delete apart at the end.
  function programMenu(prog, aid) {
    var acts = typeof programMenuActions === 'function' ? programMenuActions(prog, aid) : [];
    var wi = curWeek(), w = prog.weeks[wi], wn = w ? Number(w.number) || wi + 1 : 0;
    var weeks = w ? [
      { label: 'Duplicate week ' + wn, icon: ic('copy'), onClick: function () { duplicateWeekAction(prog.id, wi); } },
      { label: 'Add a day to week ' + wn, icon: ic('plus'), onClick: function () { addDayAndGo(aid, wi, false); } },
      // Critical fix #1: Add rest day stays (addRestDay names it "Rest", the isRestDay heuristic reads it).
      { label: 'Add a rest day to week ' + wn, icon: ic('plus'), onClick: function () { addDayAndGo(aid, wi, true); } },
      { label: 'Remove week ' + wn, icon: ICONS.trash, danger: true, onClick: function () { removeDayOrWeek(aid, wi, null); } }
    ] : [];
    var groups = cpBlockMenu(acts, {
      rename: { label: 'Rename the block', icon: ic('pen'), onClick: function () { renameBlock(prog); } },
      templates: { label: 'Your templates', icon: ic('note'), onClick: toTemplates },
      weeks: weeks,
      patch: { notify: { icon: ic('msg') }, next: { icon: ic('steps') }, goal: { icon: ic('trend') }, imported: { icon: ic('clip') }, maxes: { icon: ic('gauge') },
        update: { icon: ic('chart') }, fields: { icon: ic('list') }, addWeek: { label: 'Add a week', icon: ic('plus') },
        save: { icon: ic('copy'), onClick: function () { openSaveSheet(prog); } }, exported: { label: 'Export as a file', icon: ic('down') } }
    });
    menu(prog.name || 'Program', groups, { cls: 'cp-menu-block' });
  }
  function addDayAndGo(aid, wi, rest) {
    var prog = progOf(aid), n = prog && prog.weeks[wi] ? prog.weeks[wi].days.length : 0;
    S.days[dayKey(aid, wi)] = n;   // the new day is the last
    if (rest) { if (typeof addRestDay === 'function') addRestDay(wi); }
    else if (typeof addDay === 'function') addDay(wi);
  }

  // The week and the day, one navigation: the week a stepper ("‹ Week 1 of 3 · this week ›", swipe it too), the days
  // under it as segments that fit the phone (+ adds one), scrolling past five with a fade at the edge.
  function goWeek(prog, aid, i) {
    if (i < 0 || i >= prog.weeks.length || i === curWeek()) return;
    setWeek(i);
    if (S.days[dayKey(aid, i)] == null) S.days[dayKey(aid, i)] = cpNextDay(prog.weeks[i]);
    if (typeof loadProgram === 'function') loadProgram();
  }
  function navEl(prog, aid, wk, wi, di) {
    var nav = el('div', { class: 'cp-nav ca-rise' });
    var r = rowOf(aid), now = r && r.status && r.status.week && r.status.week.idx != null && r.status.week.idx < prog.weeks.length ? r.status.week.idx : -1;
    var n = prog.weeks.length, wn = Number(wk.number) || wi + 1, when = cpWeekWhen(wi, now);
    var step = el('div', { class: 'cp-wkstep', role: 'group', 'aria-label': 'Week' });
    var prev = el('button', { type: 'button', class: 'cp-wkbtn is-prev', 'aria-label': wi > 0 ? 'Week ' + (Number(prog.weeks[wi - 1].number) || wi) : 'Previous week', html: CHEV_LEFT });
    var next = el('button', { type: 'button', class: 'cp-wkbtn is-next', 'aria-label': wi < n - 1 ? 'Week ' + (Number(prog.weeks[wi + 1].number) || wi + 2) : 'Next week', html: CHEV_RIGHT });
    prev.disabled = wi <= 0; next.disabled = wi >= n - 1;
    prev.addEventListener('click', function () { goWeek(prog, aid, wi - 1); });
    next.addEventListener('click', function () { goWeek(prog, aid, wi + 1); });
    var lab = el('div', { class: 'cp-wklabel', 'aria-live': 'polite' });
    lab.innerHTML = '<b>Week ' + esc(String(wn)) + '</b><span class="cp-wkof"> of ' + n + '</span>' + (when ? '<span class="cp-wkwhen' + (when === 'this week' ? ' is-now' : '') + '"> · ' + esc(when) + '</span>' : '');
    step.appendChild(prev); step.appendChild(lab); step.appendChild(next);
    // A sideways swipe on the stepper turns the week, as the days below turn under a finger.
    var x0 = null, y0 = 0;
    step.addEventListener('touchstart', function (e) { var t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    step.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.5) goWeek(prog, aid, wi + (dx < 0 ? 1 : -1));
    }, { passive: true });
    nav.appendChild(step);
    nav.appendChild(dayChipsEl(wk, di));
    return nav;
  }
  // The days as segments: tap one to go to it (the pages under them swipe); + adds a day.
  function dayChipsEl(wk, di) {
    var days = wk.days || [], labels = cpDayLabels(days), many = days.length > 5;
    var wrap = el('div', { class: 'cp-segwrap' + (many ? ' is-scroll' : '') });
    var row = el('div', { class: 'cp-days', role: 'tablist', 'aria-label': 'Day' });
    days.forEach(function (d, i) {
      var name = String(d.name || 'Day ' + (i + 1));
      var b = el('button', { type: 'button', class: 'cp-day' + (i === di ? ' on' : '') + (cpIsRestDay(d) ? ' is-rest' : ''), role: 'tab', 'aria-selected': i === di ? 'true' : 'false', 'aria-label': name, 'data-day': String(i) });
      b.appendChild(el('span', {}, labels[i]));
      row.appendChild(b);
    });
    var add = el('button', { type: 'button', class: 'cp-day cp-day-add' + (di === days.length ? ' on' : ''), 'data-day': String(days.length), 'aria-label': 'Add a day', html: PLUS });
    row.appendChild(add);
    wrap.appendChild(row);
    // Past five days: the row scrolls, and the edge it can scroll towards fades (on the wrapper: WebKit ignores a mask
    // on the scroller itself).
    if (many) {
      var edge = function () {
        wrap.classList.toggle('is-more-r', row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
        wrap.classList.toggle('is-more-l', row.scrollLeft > 2);
      };
      row.addEventListener('scroll', edge, { passive: true });
      requestAnimationFrame(edge);
    }
    return wrap;
  }

  // One day per page, side by side; the last page adds a day.
  function pagerEl(prog, aid, wk, wi, di) {
    var pager = el('div', { class: 'cp-pager' });
    (wk.days || []).forEach(function (d, i) { pager.appendChild(pageEl(prog, aid, wk, wi, d, i)); });
    var addPage = el('div', { class: 'cp-page is-add', 'data-day': String((wk.days || []).length) });
    var card = el('div', { class: 'cp-addcard' });
    card.appendChild(el('h3', { class: 'cp-add-t' }, 'Add a day to week ' + (Number(wk.number) || wi + 1)));
    card.appendChild(el('p', { class: 'cp-add-s' }, 'A training day gets its exercises from Add exercise. A rest day never breaks their streak.'));
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
  // The day as a section, Train's "The session": its name (20) and what's in it, its ⋯, then a card per exercise.
  function pageEl(prog, aid, wk, wi, day, di) {
    var page = el('div', { class: 'cp-page', 'data-day': String(di) });
    var head = el('div', { class: 'cp-dayhead' });
    var id = el('div', { class: 'cp-dayid' });
    id.appendChild(el('h3', { class: 'cp-dayname' }, String(day.name || 'Day ' + (di + 1))));
    var meta = cpDayMeta(day), rest = cpIsRestDay(day);
    if (meta) id.appendChild(el('p', { class: 'cp-daymeta' }, meta));
    else if (rest) id.appendChild(el('p', { class: 'cp-daymeta' }, 'It never breaks their streak.'));
    head.appendChild(id);
    var more = el('button', { type: 'button', class: 'cp-ibtn cp-daymore', 'aria-haspopup': 'dialog', 'aria-label': (day.name || 'Day') + ' options', html: DOTS });
    more.addEventListener('click', function () { dayMenu(prog, aid, wi, di); });
    head.appendChild(more);
    page.appendChild(head);
    var exs = day.exercises || [];
    if (exs.length) {
      var list = el('div', { class: 'cp-exs' });
      exs.forEach(function (ex, ei) { list.appendChild(exCardEl(prog, aid, wi, di, ex, ei)); });
      page.appendChild(list);
    }
    return page;
  }
  // A day's ⋯: rename it, move it, copy it, make an empty day a rest day (or a rest day a training day), delete it.
  function dayMenu(prog, aid, wi, di) {
    var p = progOf(aid) || prog, wk = p.weeks[wi], day = wk && wk.days[di];
    if (!day) return;
    var empty = !(day.exercises || []).length, rest = cpIsRestDay(day);
    var go = function (to) { persistProgram(p.id); S.days[dayKey(aid, wi)] = to; loadProgram(); };
    menu(day.name || 'Day', [
      [{ label: 'Rename the day', icon: ic('pen'), onClick: function () { renameDay(aid, wi, di); } },
        di > 0 ? { label: 'Move earlier in the week', icon: ICONS.arrowUp, onClick: function () { reorderDay(p.id, wi, di, -1); go(di - 1); } } : null,
        di < wk.days.length - 1 ? { label: 'Move later in the week', icon: ICONS.arrowDown, onClick: function () { reorderDay(p.id, wi, di, 1); go(di + 1); } } : null,
        { label: 'Duplicate day', icon: ic('copy'), onClick: function () { duplicateDay(p.id, wi, di); go(di + 1); } }],
      // An empty day turns into a rest day by its name (the isRestDay heuristic reads "Rest"), and back.
      [empty && !rest ? { label: 'Make it a rest day', icon: ic('cal'), onClick: function () { if (typeof updateDayName === 'function') updateDayName(wi, di, 'Rest'); loadProgram(); } } : null,
        rest ? { label: 'Make it a training day', icon: ic('cal'), onClick: function () { if (typeof updateDayName === 'function') updateDayName(wi, di, 'Day ' + (di + 1)); loadProgram(); } } : null],
      [{ label: 'Delete day', icon: ICONS.trash, danger: true, onClick: function () { removeDayOrWeek(aid, wi, di); } }]
    ]);
  }
  function exTitle(ex) {
    if (MAIN.indexOf(ex.lift) >= 0) return (ex.variant ? ex.variant + ' ' : '') + LIFT_NAME[ex.lift];
    if (ex.lift === 'cardio') return ex.exerciseName || 'Cardio';
    return ex.exerciseName || 'Exercise';
  }
  // A block of sets in Train's number style: "190 kg × 4 @7" (numbers 20 bold, the unit small), the count as a quiet
  // pill on the left; under it what a % comes to and the set fields. Coach-written values: escaped or Number().
  function setRowHtml(blk) {
    var L = cpSetLine(blk, unit(), disp), num = function (t) { return '<b>' + esc(t) + '</b>'; };
    var load = '';
    if (L.load) {
      var m = /^(.*?)(\s*(?:kg|lb|lbs))$/.exec(L.load);
      load = m ? num(m[1]) + '<small>' + esc(m[2].trim()) + '</small>' : num(L.load);
    }
    var head = load ? load + (L.reps ? '<i>×</i>' + num(L.reps) : '') : (L.reps ? num(L.reps) + '<small>' + (Number(L.reps) === 1 ? 'rep' : 'reps') + '</small>' : '');
    var eff = L.effort ? '<em>' + esc(L.rir ? L.effort : L.effort.replace(/^@ /, '@')) + '</em>' : '';
    var fx = typeof setFieldsShort === 'function' ? setFieldsShort(blk) : '';
    var x = [L.pctLoad ? '= ' + L.pctLoad : '', fx].filter(Boolean).join(' · ');
    return '<span class="cp-n">' + esc(plural(L.count, 'set')) + '</span><span class="cp-set-l">' + (head || '<span class="cp-set-none">No load or reps yet</span>') + eff + '</span>' +
      (x ? '<span class="cp-set-x">' + esc(x) + '</span>' : '');
  }
  // An exercise, as Train's card: the lift's dot, its name and a chevron; the cue; a row per block of sets; what
  // was lifted, in the lift's colour. The whole card opens the editor.
  function exCardEl(prog, aid, wi, di, ex, ei) {
    // A lift the lifter swapped for a variant that day (app.js exSwap) reads as the coach wrote it, its name and its
    // sets (exAsWritten); what happened says the swap, once: "Lifted as close grip bench 105×4 @8, …", or before a
    // set is logged "Swapped for close grip bench".
    var sw = typeof exSwap === 'function' ? exSwap(ex) : null, swapped = !!(sw && sw.to !== sw.from);
    var wx = swapped && typeof exAsWritten === 'function' ? exAsWritten(ex) : ex;
    var main = MAIN.indexOf(ex.lift) >= 0;
    var b = el('button', { type: 'button', class: 'cp-excard ' + (main ? 'lift-' + ex.lift : 'lift-acc'), 'aria-label': 'Edit ' + exTitle(wx) });
    var html = '<span class="cp-xh"><i class="cp-xdot" aria-hidden="true"></i><span class="cp-xt">' + esc(exTitle(wx)) + '<span class="cp-xchev" aria-hidden="true">' + CHEV_RIGHT + '</span></span></span>';
    if (ex.note) html += '<span class="cp-cue"><b>Coach</b> ' + esc(ex.note) + '</span>';
    html += '<span class="cp-sets">';
    if (ex.lift === 'cardio') {
      var bouts = ex.sets || [];
      if (bouts.length) {
        var bt = bouts[0], mins = Number(bt.weight) > 0 ? Number(bt.weight) : 0, km = Number(bt.reps) > 0 ? Number(bt.reps) : 0;
        html += '<span class="cp-set"><span class="cp-n">' + esc(plural(bouts.length, 'bout')) + '</span><span class="cp-set-l">' + (mins ? '<b>' + esc(String(mins)) + '</b><small>min</small>' : '') + (km ? (mins ? '<i>·</i>' : '') + '<b>' + esc(String(km)) + '</b><small>km</small>' : '') + '</span></span>';
      } else html += '<span class="cp-set is-none">No bouts yet</span>';
    } else {
      var plan = (wx.sets || []).map(function (s) { return Object.assign({}, s, { weight: typeof planWeight === 'function' ? planWeight(s) : s.weight, reps: s.plannedReps || s.reps }); });
      var blocks = typeof groupSets === 'function' ? groupSets(plan) : [];
      if (!blocks.length) html += '<span class="cp-set is-none">No sets yet</span>';
      blocks.forEach(function (blk) { html += '<span class="cp-set">' + setRowHtml(blk) + '</span>'; });
    }
    html += '</span>';
    var lifted = typeof _gridActualHtml === 'function' ? _gridActualHtml(ex) : '';   // escaped there (athlete-written numbers)
    if (lifted) html += '<span class="cp-lifted' + (swapped ? ' cp-swapped' : '') + '"><span class="cp-lifted-k">' + (swapped ? 'Lifted as ' + esc(variantName(ex.lift, sw.to)) : 'Lifted') + '</span> ' + lifted + '</span>';
    else if (swapped) html += '<span class="cp-swapped">' + esc(swapLine(ex)) + '</span>';
    b.innerHTML = html;
    b.addEventListener('click', function () { openEditor(aid, wi, di, ei); });
    return b;
  }

  /* ---------------------------------------------------------------- Add exercise (coach.html's form, dressed) */
  // The form stays coach.html's own (openAddExercise, onLiftChange, confirmAddExercise and its ids, which the
  // laptop shares); on the phone it says which day it adds to, picks the lift and its variant with chips like
  // the days above it (a select per choice was a web form), names the note for the lifter, and its one red
  // says where the exercise goes ("Add to Deadlift Day").
  function nameOf(aid) { return ((Store.get().athletes || []).find(function (a) { return a.id === aid; }) || {}).name || ''; }
  function chip(label, on, cls, onPick, dot) {
    var b = el('button', { type: 'button', class: 'cp-chip' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), role: 'radio', 'aria-checked': on ? 'true' : 'false' });
    b.innerHTML = (dot ? '<i class="lift-' + dot + '" aria-hidden="true"></i>' : '') + '<span>' + esc(label) + '</span>';
    b.addEventListener('click', onPick);
    return b;
  }
  function dressAdd(aid, wi, di) {
    var m = document.getElementById('addExerciseModal'), box = m && m.querySelector('.modal');
    var liftSel = document.getElementById('exLift'), varSel = document.getElementById('exVariant');
    var prog = progOf(aid), wk = prog && prog.weeks[wi], day = wk && wk.days[di];
    if (!box || !liftSel || !varSel || !day) return;
    // The day's own lift comes picked (the form opens on a squat): a Deadlift Day's next exercise is a deadlift
    // variant or an accessory far more often than a squat. Its first main lift, as the day's light; its loads follow.
    var leadEx = (day.exercises || []).filter(function (e) { return MAIN.indexOf(e.lift) >= 0; })[0];
    if (leadEx && liftSel.value !== leadEx.lift && Array.prototype.some.call(liftSel.options, function (o) { return o.value === leadEx.lift; })) {
      liftSel.value = leadEx.lift;
      if (typeof onLiftChange === 'function') onLiftChange();
    }
    box.classList.add('cp-addx');
    var h = box.querySelector('h3'), sub = box.querySelector('.cp-addx-sub');
    if (!sub && h) { sub = el('p', { class: 'cp-addx-sub' }); h.insertAdjacentElement('afterend', sub); }
    var dayName = String(day.name || 'Day ' + (di + 1));
    if (sub) sub.textContent = dayName + ' \u00b7 Week ' + (Number(wk.number) || wi + 1);
    var row = liftSel.closest('.form-row');
    var lifts = box.querySelector('.cp-addx-lifts');
    if (!lifts && row) { lifts = el('div', { class: 'cp-chips cp-addx-lifts', role: 'radiogroup', 'aria-label': 'Exercise' }); row.insertAdjacentElement('beforebegin', lifts); }
    var vg = document.getElementById('variantGroup'), vars = box.querySelector('.cp-addx-vars');
    if (!vars && vg) { vars = el('div', { class: 'cp-chips cp-addx-vars', role: 'radiogroup', 'aria-label': 'Variant' }); vg.appendChild(vars); }
    var paintVars = function () {
      if (!vars) return;
      vars.innerHTML = '';
      Array.prototype.forEach.call(varSel.options, function (o) {
        vars.appendChild(chip(o.textContent, o.value === varSel.value, '', function () { varSel.value = o.value; paintVars(); }));
      });
    };
    // An accessory picked after a main lift: loads still at the main lift's suggestion (177.5 for a squat) become
    // this exercise's own (their last set of it, or blank), as a main lift's do (coach.html onLiftChange);
    // loads the coach typed stay.
    var exSel = document.getElementById('exName');
    var reloadOwn = function () {
      var lift = liftSel.value;
      if (MAIN.indexOf(lift) >= 0 || lift === 'cardio') return;
      try {
        if (!Array.isArray(buildingSets) || !buildingSets.length || !buildingSets.every(function (b) { return Number(b.weight) === Number(_autoLoad); })) return;
        var who = (document.getElementById('progAthlete') || {}).value || aid;   // the change listener outlives this call
        var w = typeof suggestNewLoad === 'function' ? suggestNewLoad(who, lift, '', exSel && exSel.value || '', 5, 7) : 0;
        buildingSets.forEach(function (b) { b.weight = w; });
        _autoLoad = w;
        if (typeof renderSetsBuilder === 'function') renderSetsBuilder();
      } catch (e) {}
    };
    if (exSel && !exSel._cpWired) { exSel._cpWired = true; exSel.addEventListener('change', reloadOwn); }
    var paintLifts = function () {
      if (!lifts) return;
      lifts.innerHTML = '';
      Array.prototype.forEach.call(liftSel.options, function (o, k) {
        var main = MAIN.indexOf(o.value) >= 0;
        // the main lifts on their own line, the rest under them
        if (k && !main && MAIN.indexOf(liftSel.options[k - 1].value) >= 0) lifts.appendChild(el('span', { class: 'cp-chips-br', 'aria-hidden': 'true' }));
        lifts.appendChild(chip(String(o.textContent).replace(/\s*\(accessory\)\s*$/i, ''), o.value === liftSel.value, main ? 'is-main' : '', function () {
          if (liftSel.value === o.value) return;
          liftSel.value = o.value;
          if (typeof onLiftChange === 'function') onLiftChange();
          reloadOwn();
          paintLifts(); paintVars();
        }, main ? o.value : ''));
      });
    };
    paintLifts(); paintVars();
    var note = document.getElementById('exNote'), nl = note && note.closest('.form-group') && note.closest('.form-group').querySelector('label');
    if (nl) nl.textContent = 'Note for ' + (first(nameOf(aid)) || 'them');
    if (note) note.placeholder = 'Slow down, pause at the bottom, belt on...';
    var go = box.querySelector('[onclick^="confirmAddExercise"]');
    if (go) {
      go.textContent = 'Add to ' + dayName;
      if (!go._cpWired) {
        go._cpWired = true;
        // Before coach.html adds it: remember the day and its count, so the new row can rise into place.
        go.addEventListener('click', function () {
          var t = typeof addExerciseTarget === 'object' && addExerciseTarget ? addExerciseTarget : { wi: wi, di: di };
          var p2 = progOf(S.aid), d2 = p2 && p2.weeks[t.wi] && p2.weeks[t.wi].days[t.di];
          S.added = d2 ? { aid: S.aid, wi: t.wi, di: t.di, n: (d2.exercises || []).length } : null;
        }, true);
      }
    }
  }

  /* ---------------------------------------------------------------- the ⋯ menus */
  // A ⋯ menu in groups, as iOS draws one (a gap between them); the row that takes something away comes last,
  // in ink with its bin glyph: red is the screen's one action, never a menu row (coach-app.css .cp-menu).
  // A group is a list of actions, or { title, items } (the block's ⋯ names its groups: Block, Weeks, Share).
  function menu(title, groups, o) {
    var flat = [], firsts = [], titles = [];
    (groups || []).forEach(function (g) {
      var items = (Array.isArray(g) ? g : (g && g.items) || []).filter(Boolean);
      if (!items.length) return;
      if (flat.length) firsts.push(flat.length);
      titles.push({ at: flat.length, t: Array.isArray(g) ? '' : String((g && g.title) || '') });
      flat = flat.concat(items);
    });
    var close = uiActionSheet(title, flat, { veilCls: 'cp-menu' + (o && o.cls ? ' ' + o.cls : '') });
    var veil = document.body.lastElementChild;
    if (veil && veil.classList.contains('cp-menu')) {
      var btns = veil.querySelectorAll('.ui-sheet > button:not(.ui-sheet-cancel)');
      firsts.forEach(function (i) { if (btns[i]) btns[i].classList.add('cp-sep'); });
      titles.forEach(function (g) {
        if (!g.t || !btns[g.at]) return;
        btns[g.at].insertAdjacentElement('beforebegin', el('p', { class: 'cp-menu-h' + (g.at ? ' cp-sep' : '') }, g.t));
        btns[g.at].classList.remove('cp-sep');
      });
    }
    return close;
  }
  // Remove takes the exercise off at once (no question first) and offers it back for a few seconds.
  function removeExercise(aid, wi, di, ei) {
    var ex = liveEx(aid, wi, di, ei), prog = progOf(aid);
    if (!ex || !prog || typeof deleteExercise !== 'function') return;
    var copy = JSON.parse(JSON.stringify(ex)), name = exTitle(ex), pid = prog.id;
    deleteExercise(wi, di, ei);
    if (typeof toastAction !== 'function') return;
    toastAction(name + ' removed', 'Undo', function () {
      Store.update(function (s) {
        var p = (s.programs || []).find(function (x) { return x.id === pid; }), d = p && p.weeks[wi] && p.weeks[wi].days[di];
        if (d) d.exercises.splice(Math.min(ei, d.exercises.length), 0, copy);
      });
      if (typeof persistProgram === 'function') persistProgram(pid);
      if (typeof loadProgram === 'function') loadProgram();
    });
  }
  // Delete day and Remove week work the same way: gone at once, back with Undo. The system's "Delete this
  // day?" alert answered with an OK that said nothing; Undo is the last word, and it is the coach's.
  // di == null: the week wi. (The laptop keeps coach.html deleteDay / deleteWeek and their question.)
  function removeDayOrWeek(aid, wi, di) {
    var prog = progOf(aid), isWeek = di == null;
    var src = prog && prog.weeks[wi] ? (isWeek ? prog.weeks[wi] : (prog.weeks[wi].days || [])[di]) : null;
    if (!src) return;
    var pid = prog.id, copy = JSON.parse(JSON.stringify(src));
    var name = isWeek ? 'Week ' + (Number(src.number) || wi + 1) + ' removed' : String(src.name || 'Day ' + (di + 1)) + ' deleted';
    var find = function (s) { return (s.programs || []).find(function (x) { return x.id === pid; }); };
    Store.update(function (s) { var p = find(s); if (!p || !p.weeks[wi]) return; if (isWeek) p.weeks.splice(wi, 1); else p.weeks[wi].days.splice(di, 1); });
    if (isWeek) setWeek(Math.max(0, wi - 1)); else S.days[dayKey(aid, wi)] = Math.max(0, di - 1);
    if (typeof persistProgram === 'function') persistProgram(pid);
    if (typeof loadProgram === 'function') loadProgram();
    if (typeof toastAction !== 'function') return;
    toastAction(name, 'Undo', function () {
      Store.update(function (s) {
        var p = find(s);
        if (!p) return;
        if (isWeek) p.weeks.splice(Math.min(wi, p.weeks.length), 0, copy);
        else if (p.weeks[wi]) p.weeks[wi].days.splice(Math.min(di, p.weeks[wi].days.length), 0, copy);
      });
      if (isWeek) setWeek(wi); else S.days[dayKey(aid, wi)] = di;
      if (typeof persistProgram === 'function') persistProgram(pid);
      if (typeof loadProgram === 'function') loadProgram();
    });
  }

  /* ---------------------------------------------------------------- the pager: swipe or tap a day */
  function scrollToDay(pager, i, smooth) {
    if (!pager.children[i]) return;
    var x = i * pager.clientWidth;   // every page is the pager's width
    if (smooth && pager.scrollTo) pager.scrollTo({ left: x, behavior: 'smooth' }); else pager.scrollLeft = x;
  }
  // The day on show keeps its chip in view, the page's 16 pt gutter from either edge, moving only the chips:
  // scrollIntoView pressed it flush to the glass and could pull the whole page up under a finger mid-swipe.
  function chipInView(c) {
    var row = c.parentNode;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    var rr = row.getBoundingClientRect(), cr = c.getBoundingClientRect(), g = 16;
    if (cr.left < rr.left + g) row.scrollLeft -= rr.left + g - cr.left;
    else if (cr.right > rr.right - g) row.scrollLeft += cr.right - (rr.right - g);
  }
  function syncDay(root, pager, aid, wk, quiet) {
    var w = pager.clientWidth || 1;
    var i = Math.max(0, Math.min(pager.children.length - 1, Math.round(pager.scrollLeft / w)));
    S.days[dayKey(aid, curWeek())] = i;
    root.querySelectorAll('.cp-day').forEach(function (c) { var on = Number(c.getAttribute('data-day')) === i; c.classList.toggle('on', on); c.setAttribute('aria-selected', on ? 'true' : 'false'); if (on && !quiet) chipInView(c); });
    var day = (wk.days || [])[i];
    // Add exercise ends a training day; a rest day and the Add a day page have none.
    var add = root.querySelector('.cp-addex');
    if (add) {
      add.hidden = !day || cpIsRestDay(day);
      add.setAttribute('aria-label', day ? 'Add an exercise to ' + String(day.name || 'Day ' + (i + 1)) : 'Add an exercise');
    }
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
        var maxKg = isMain && typeof programMaxKg === 'function' ? programMaxKg(prog, aid, exNow.lift) : 0;
        // How every block writes its load and effort (each block's More switches its own). Blocks written both
        // ways offer both ways (cpEveryChoices): the coach picks which way they all go.
        var every = function (kind, on) {
          var ss = ((liveEx(aid, wi, di, ei) || exNow).sets || []).slice(), pt = cpModePatches(ss, kind, on, maxKg);
          setExerciseRx(wi, di, ei, function (st) { applyPatch(st, pt[ss.indexOf(st)] || cpModePatch(st, kind, on, maxKg)); });
          if (S.sheetRepaint) S.sheetRepaint();
        };
        var label = { pct1: 'Every block in % of max', pct0: 'Every block in ' + unit(), rir1: 'Every block as reps in reserve', rir0: 'Every block as RPE' };
        var ways = cpEveryChoices(live, isMain, exNow.lift === 'cardio').map(function (c) {
          return { label: label[c.kind + (c.on ? 1 : 0)], icon: c.kind === 'pct' ? ICONS.weight : ICONS.flame, onClick: function () { every(c.kind, c.on); } };
        });
        menu(exTitle(exNow), [
          [ei > 0 ? { label: 'Move up', icon: ICONS.arrowUp, onClick: function () { close(); reorderExercise(prog.id, wi, di, ei, -1); persistProgram(prog.id); loadProgram(); } } : null,
            ei < d.exercises.length - 1 ? { label: 'Move down', icon: ICONS.arrowDown, onClick: function () { close(); reorderExercise(prog.id, wi, di, ei, 1); persistProgram(prog.id); loadProgram(); } } : null,
            { label: 'Duplicate', icon: ic('copy'), onClick: function () { close(); copyExercise(prog.id, wi, di, ei); persistProgram(prog.id); loadProgram(); } }],
          ways,
          [{ label: 'Remove', icon: ICONS.trash, danger: true, onClick: function () { close(); removeExercise(aid, wi, di, ei); } }]
        ]);
      });
      tools.appendChild(more); tools.appendChild(doneTop);
      sheet.appendChild(tools);
      sheet.appendChild(body);
      var paint = function () { paintEditor(body, aid, wi, di, ei, close); };
      S.sheetRepaint = paint;
      S.moreOpen = {};
      paint();
      // The saving line follows the connection and the queue while the sheet is open.
      S.onSync = function () { var p = sheet.querySelector('.cp-ed-saved'); if (p) paintSaved(p, aid); };
      ['powa:sync', 'online', 'offline'].forEach(function (ev) { window.addEventListener(ev, S.onSync); });
    }, { cls: 'cp-sheet', onClose: function () {
      if (S.onSync) ['powa:sync', 'online', 'offline'].forEach(function (ev) { window.removeEventListener(ev, S.onSync); });
      S.onSync = null; S.sheetRepaint = null; S.moreOpen = {}; clearTimeout(S.bg); if (typeof loadProgram === 'function') loadProgram();
    } });
  }
  function paintEditor(body, aid, wi, di, ei, close) {
    var prog = progOf(aid), wk = prog && prog.weeks[wi], day = wk && wk.days[di], ex = day && day.exercises[ei];
    body.innerHTML = '';
    if (!ex) { close(); return; }
    var main = MAIN.indexOf(ex.lift) >= 0, u = unit();
    var sub = [day.name || 'Day ' + (di + 1), 'Week ' + (Number(wk.number) || wi + 1)];
    body.appendChild(el('p', { class: 'ui-sheet-sub cp-ed-sub' }, sub.join(' · ')));
    var logged = (ex.sets || []).some(function (s) { return s.completed || s.missed; });
    var last = !logged && typeof getLastSetForExercise === 'function' ? getLastSetForExercise(aid, ex.lift, ex.variant, ex.exerciseName) : null;
    if (last) body.appendChild(el('p', { class: 'cp-ed-last' }, 'Last time ' + disp(last.weight) + ' ' + u + ' × ' + n2(last.reps) + (last.rpe != null ? ' @ ' + n2(last.rpe) : '') + (typeof fmtDateShort === 'function' ? ' · ' + fmtDateShort(last.date) : '')));
    // What they logged, said once: as written and as lifted, why those sets stay, and the way to next week's.
    if (logged && ex.lift !== 'cardio') body.appendChild(loggedEl(prog, aid, wi, di, ex, close));
    if (ex.lift === 'cardio') {
      body.appendChild(el('p', { class: 'cp-ed-note' }, 'Cardio bouts are edited on the laptop for now.'));
    } else {
      var live = (ex.sets || []).filter(function (s) { return !s.completed; });
      var anyPct = live.some(function (s) { return s.pct != null; });
      var maxKg = main && typeof programMaxKg === 'function' ? programMaxKg(prog, aid, ex.lift) : 0;
      if (anyPct && main && !maxKg) body.appendChild(el('p', { class: 'cp-ed-note' }, 'No max yet: the % loads fill in once they log a ' + LIFT_NAME[ex.lift].toLowerCase() + ' set, or set one in Maxes for %.'));
      var blocks = typeof groupSets === 'function' ? groupSets(ex.sets) : [];
      var sfDef = typeof programSetFields === 'function' ? programSetFields(prog) : { on: [], cols: [] };
      // A block with a set they logged is in the Written / Lifted card above; the blocks still to do are edited here.
      blocks.forEach(function (blk, bi) {
        var bs = (ex.sets || []).slice(blk.startIdx, blk.startIdx + blk.count);
        if (bs.some(function (s) { return s.completed; })) return;
        body.appendChild(blockEl(body, aid, wi, di, ei, ex, blk, bi, blocks.length, main, maxKg, sfDef, close, blocks));
      });
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
    var saved = el('p', { class: 'cp-ed-saved', role: 'status' });
    body.appendChild(saved);
    paintSaved(saved, aid);
  }
  // The sets they logged, once: "Written 180×3 @8 · Lifted 182.5×3 @8.5", then why they stay, and a quiet way to the
  // same exercise next week (cpNextWeekMatch), where the change belongs.
  function loggedEl(prog, aid, wi, di, ex, close) {
    var sw = typeof exSwap === 'function' ? exSwap(ex) : null, swapped = !!(sw && sw.to !== sw.from);
    var wx = swapped && typeof exAsWritten === 'function' ? exAsWritten(ex) : ex;
    var idx = [];
    (ex.sets || []).forEach(function (s, i) { if (s && (s.completed || s.missed)) idx.push(i); });
    var plan = idx.map(function (i) { var s = (wx.sets || [])[i] || ex.sets[i]; return Object.assign({}, s, { weight: typeof planWeight === 'function' ? planWeight(s) : s.weight, reps: s.plannedReps || s.reps }); });
    var box = el('div', { class: 'cp-logged' + (MAIN.indexOf(ex.lift) >= 0 ? ' lift-' + ex.lift : ' lift-acc') });
    var row = function (k, html) { var p = el('p', { class: 'cp-lg-row' }); p.innerHTML = '<span class="cp-lg-k">' + esc(k) + '</span><span class="cp-lg-v">' + html + '</span>'; box.appendChild(p); };
    var written = cpWrittenText(plan, unit(), disp);
    if (written) row('Written', esc(written));
    var lifted = typeof _gridActualHtml === 'function' ? _gridActualHtml(ex) : '';   // escaped there
    if (lifted) row(swapped ? 'Lifted as ' + variantName(ex.lift, sw.to) : 'Lifted', lifted);
    box.appendChild(el('p', { class: 'cp-lg-note' }, 'Logged sets stay as lifted.'));
    var m = cpNextWeekMatch(prog.weeks, wi, di, wx);
    if (m) {
      var nwk = prog.weeks[m.wi], go = el('button', { type: 'button', class: 'ca-btn is-soft cp-lg-next' }, 'Change week ' + (Number(nwk.number) || m.wi + 1) + ' instead');
      go.addEventListener('click', function () {
        close();
        setWeek(m.wi); S.days[dayKey(aid, m.wi)] = m.di;
        if (typeof loadProgram === 'function') loadProgram();
        setTimeout(function () { openEditor(aid, m.wi, m.di, m.ei); }, 260);   // after this sheet has gone
      });
      box.appendChild(go);
    }
    return box;
  }
  function paintSaved(p, aid) {
    var prog = progOf(aid), pending = false;
    try { pending = !!(prog && typeof _readOutbox === 'function' && _readOutbox().some(function (e) { return e && e.key === 'program:' + prog.id; })); } catch (e) { pending = false; }
    var L = cpSaveLine({ online: !(typeof navigator !== 'undefined' && navigator.onLine === false), pending: pending });
    p.textContent = L.text;
    p.classList.toggle('is-waiting', L.waiting);
    if (L.retry) {
      var b = el('button', { type: 'button', class: 'ca-link cp-ed-send' }, 'Send now');
      b.addEventListener('click', function () {
        b.disabled = true; b.textContent = 'Sending\u2026';
        Promise.resolve(typeof flushOutbox === 'function' ? flushOutbox() : null).catch(function () {}).then(function () { paintSaved(p, aid); });
      });
      p.appendChild(document.createTextNode(' '));
      p.appendChild(b);
    }
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
    // The first block (the top set) is the sheet's object, lit by its lift (coach-app.css .cp-blk.is-top).
    var box = el('div', { class: 'cp-blk' + (bi === 0 ? ' is-top' + (main ? ' lift-' + ex.lift : '') : '') });
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
    // No bar drawn here (29 Oct): its red and blue plates were plate paint, and loading the bar is the
    // lifter's job (Train draws it for them). The block's line and its numbers say the load.
    box.appendChild(head);
    if (logged) return box;   // the Written / Lifted card says it (paintEditor draws only the blocks still to do)
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
      // The unit sits in the label ("Load · kg"), so 162.5 fits beside its buttons on a 375 pt phone.
      var loadSt = uiStepper({ value: wD, step: cpLoadStep(false, u), min: 0, max: 1000, label: 'load', fmt: function (v) { return v > 0 ? n2(v) + (hiD ? '–' + n2(v + hiD) : '') : '<span class="st-word">By feel</span>'; }, onChange: onLoad });
      grid.appendChild(stepCell('Load \u00b7 ' + u, typeable(loadSt, 'Type the load in ' + u, onLoad)));
    }
    // Effort: RPE in half steps (blank is "none", for back-off sets), or reps in reserve
    if (blk.rir) {
      var rLo = blk.rpe != null ? 10 - (blk.rpeHi != null && blk.rpeHi > blk.rpe ? Number(blk.rpeHi) : Number(blk.rpe)) : 2, rSpan = blk.rpeHi != null && blk.rpeHi > blk.rpe ? Number(blk.rpeHi) - Number(blk.rpe) : 0;
      grid.appendChild(stepCell('Reps left', uiStepper({ value: rLo, step: 0.5, min: 0, max: 5, label: 'reps in reserve', fmt: function (v) { return n2(v) + (rSpan ? '–' + n2(v + rSpan) : ''); },
        onChange: function (v) { var rpe = 10 - (v + rSpan), rpeHi = rSpan ? 10 - v : null; setBlockRx(wi, di, ei, blk.startIdx, blk.count, { rpe: rpe, rpeHi: rpeHi }); blk.rpe = rpe; blk.rpeHi = rpeHi; bgRefresh(); paintHead(); paintHint(); } })));
    } else {
      var eSpan = blk.rpeHi != null && blk.rpeHi > blk.rpe ? Number(blk.rpeHi) - Number(blk.rpe) : 0;
      grid.appendChild(stepCell('RPE', uiStepper({ value: blk.rpe != null ? Number(blk.rpe) : 4.5, step: 0.5, min: 4.5, max: 10 - eSpan, label: 'RPE', fmt: function (v) { return v < 5 ? '<span class="st-word">None</span>' : '@\u00a0' + n2(v) + (eSpan ? '–' + n2(v + eSpan) : ''); },
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
    var mb = el('button', { type: 'button', class: 'cp-blkmore', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': mid });
    mb.innerHTML = '<span class="cp-blkmore-t">' + esc(cpMoreText(fx)) + '</span>' + CHEV_DOWN;
    var mbody = el('div', { class: 'cp-blkmore-body', id: mid });
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
    // A value wider than its cell steps down to 17, never under its buttons; a range still too wide for one
    // line (162.5–167.5 kg in a 375 or 393 pt phone's cell) stacks its two ends, "162.5–" over "167.5"
    // (cpFitClass). The block's line above keeps the range on one line.
    var val = stepper.querySelector('.st-val');
    if (val && typeof MutationObserver === 'function') {
      var fit = function () {
        val.classList.remove('is-tight', 'is-stack');
        var over = function () { return val.scrollWidth > val.clientWidth + 1; };
        if (!over()) return;
        val.classList.add('is-tight');
        var k = cpFitClass(val.textContent, over());
        if (k !== 'is-tight') { val.classList.remove('is-tight'); val.classList.add(k); }
      };
      var last = cpNum(val.textContent);
      new MutationObserver(function () {
        requestAnimationFrame(fit);
        // The number ticks the way it moved: up from below, down from above (6 pt, the press spring).
        var now = cpNum(val.textContent);
        if (now != null && last != null && now !== last && !val.querySelector('input')) tick(val, now > last ? 1 : -1);
        last = now;
      }).observe(val, { childList: true, characterData: true, subtree: true });
      requestAnimationFrame(fit);
    }
    return c;
  }
  function cpNum(t) { var m = /-?\d+(?:\.\d+)?/.exec(String(t || '')); return m ? Number(m[0]) : null; }
  function tick(node, dir) {
    if (!node.animate) return;
    try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
    if (node._tick) node._tick.cancel();
    var cs = getComputedStyle(document.body), ease = (cs.getPropertyValue('--pl-spring') || '').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)';
    var ms = parseFloat(cs.getPropertyValue('--pl-d-press')) || 200, frames = [{ transform: 'translate3d(0,' + (dir * 6) + 'px,0)', opacity: 0.55 }, { transform: 'none', opacity: 1 }];
    try { node._tick = node.animate(frames, { duration: ms, easing: ease }); } catch (e) { try { node._tick = node.animate(frames, { duration: 200, easing: 'ease-out' }); } catch (e2) {} }
  }

  /* ====================================================================================================
     TEMPLATES (the phone's Templates: one grouped list; a template opens its sheet; Apply asks who gets it)
     ==================================================================================================== */
  function tplWeeks(t) { return (t && t.payload && Array.isArray(t.payload.weeks)) ? t.payload.weeks : []; }
  // A template's line: "3 weeks · 4 days a week · saved 29 Oct" (days: week 1's training days). saved: its date,
  // already written for the screen. Numbers only from its own arrays.
  function cpTplLine(t, saved) {
    var weeks = tplWeeks(t), w1 = weeks[0], days = w1 ? (w1.days || []).filter(function (d) { return (d.exercises || []).length; }).length : 0;
    return [plural(weeks.length, 'week'), days ? (days === 1 ? '1 day a week' : days + ' days a week') : null, saved ? 'saved ' + saved : null].filter(Boolean).join(' · ');
  }
  function tplSaved(t) {
    if (!t || !t.createdAt) return '';
    try { var iso = typeof isoLocal === 'function' ? isoLocal(new Date(t.createdAt)) : new Date(t.createdAt).toISOString().slice(0, 10); return typeof fmtDateShort === 'function' ? fmtDateShort(iso) : iso; } catch (e) { return ''; }
  }
  function myTemplates() {
    var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    return (Store.get().programTemplates || []).filter(function (t) { return u && t.coachId === u.id; })
      .slice().sort(function (a, b) { return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0); });
  }
  function toTemplates() { var t = document.getElementById('tab-templates'); if (t) t.click(); }
  function renderTemplates(area) {
    if (!area || !hasDom) return false;
    var h = document.querySelector('section[data-pane="templates"] > .dash-header h2');
    if (h) h.textContent = 'Templates';
    area.innerHTML = '';
    var root = el('div', { class: 'cp cp-tpls ca-root' });
    area.appendChild(root);
    var tpls = myTemplates();
    if (!tpls.length) {
      root.appendChild(uiEmpty({
        icon: ICONS.copy, title: 'No templates yet',
        text: 'Bring a program in from a photo or a file, or save a lifter’s block from its ⋯ in Programs. Then give it to anyone in one tap.',
        primary: { label: 'Bring a program in', onClick: function () { openSheetImport(null); } }
      }));
      return true;
    }
    var list = el('div', { class: 'ca-list cp-tpl-list ca-rise' });
    tpls.forEach(function (t) { list.appendChild(tplRow(t)); });
    root.appendChild(list);
    var more = el('div', { class: 'cp-tpl-foot' });
    var imp = el('button', { type: 'button', class: 'ca-link cp-tpl-imp' }, 'Bring a program in');
    imp.addEventListener('click', function () { openSheetImport(null); });
    more.appendChild(imp);
    more.appendChild(el('p', { class: 'cp-tpl-hint' }, 'Or save a lifter’s block from its ⋯ in Programs.'));
    root.appendChild(more);
    return true;
  }
  // A row: its name, its size, and Apply (who gets it). The rest of the row opens it (with when it was saved).
  function tplRow(t) {
    var line = cpTplLine(t, '');
    var row = el('div', { class: 'cp-tpl' });
    var open = el('button', { type: 'button', class: 'cp-tpl-main', 'aria-label': (t.name || 'Template') + '. ' + line });
    open.innerHTML = '<span class="cp-tpl-tx"><span class="cp-tpl-t">' + esc(t.name || 'Template') + '</span><span class="cp-tpl-s">' + esc(line) + '</span></span>';
    open.addEventListener('click', function () { openTemplateSheet(t); });
    var apply = el('button', { type: 'button', class: 'ca-pill cp-tpl-apply', 'aria-label': 'Apply ' + (t.name || 'this template') }, 'Apply');
    apply.addEventListener('click', function () { openApplySheet(t); });
    row.appendChild(open);
    row.appendChild(apply);
    return row;
  }
  // A template, opened: its line, week 1 day by day (what a lifter gets first), Apply as the one red, Delete apart.
  function openTemplateSheet(t) {
    if (typeof uiSheet !== 'function') return;
    uiSheet(t.name || 'Template', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, cpTplLine(t, tplSaved(t))));
      var w1 = tplWeeks(t)[0];
      if (w1 && (w1.days || []).length) {
        sheet.appendChild(el('h4', { class: 'cp-sheet-h' }, 'Week 1'));
        sheet.appendChild(uiList((w1.days || []).slice(0, 7).map(function (d, i) {
          var exs = d.exercises || [], lifts = MAIN.filter(function (L) { return exs.some(function (e) { return e.lift === L; }); });
          var lead = el('span', { class: 'cp-dots cp-tpl-dots', 'aria-hidden': 'true', html: lifts.map(function (L) { return '<i class="lift-' + L + '"></i>'; }).join('') });
          return uiRow({ lead: lead, title: String(d.name || 'Day ' + (i + 1)), sub: exs.length ? exs.map(exTitle).join(' · ') : cpDayMeta(d) });
        })));
      }
      var go = el('button', { type: 'button', class: 'ca-btn is-red cp-sheet-go' }, 'Apply to lifters');
      go.addEventListener('click', function () { close(); setTimeout(function () { openApplySheet(t); }, 230); });
      sheet.appendChild(go);
      if (!document.documentElement.classList.contains('native') && typeof openPublishModal === 'function') {
        var pub = el('button', { type: 'button', class: 'cp-sheet-quiet' }, 'Sell it on the marketplace');
        pub.addEventListener('click', function () { close(); setTimeout(function () { openPublishModal(t); }, 230); });
        sheet.appendChild(pub);
      }
      var del = el('button', { type: 'button', class: 'cp-sheet-quiet cp-sheet-del' });
      del.innerHTML = ICONS.trash + '<span>Delete template</span>';
      // Asked in the app's own sheet over this one: Keep comes back here, Delete closes both.
      del.addEventListener('click', function () {
        deleteTemplateSheet(t, function () { close(); renderTemplates(document.getElementById('templatesArea')); });
      });
      sheet.appendChild(del);
    }, { cls: 'cp-tpl-sheet' });
  }
  // Who gets it: every lifter, those with a block say whose block it replaces; one red names who it goes to.
  // ids → coach.html applyTemplateToLifters (the same path as the laptop's): what they logged stays a past block.
  function cpApplyLabel(names) {
    names = names || [];
    if (!names.length) return 'Pick who gets it';
    return names.length === 1 ? 'Apply to ' + first(names[0]) : 'Apply to ' + names.length + ' lifters';
  }
  function openApplySheet(t) {
    if (typeof uiSheet !== 'function') return;
    var list = roster().slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    uiSheet('Who gets it?', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, '“' + (t.name || 'This template') + '” replaces the block they have now. What they logged stays as a past block.'));
      if (!list.length) {
        sheet.appendChild(el('p', { class: 'cp-sheet-none' }, 'No lifters yet. Invite one, then give them this in one tap.'));
        var inv = el('button', { type: 'button', class: 'ca-btn is-red cp-sheet-go' }, 'Invite a lifter');
        inv.addEventListener('click', function () { close(); setTimeout(function () { if (typeof openInviteModal === 'function') openInviteModal(); }, 230); });
        sheet.appendChild(inv);
        return;
      }
      // From a lifter with no block yet (their Use a template): they're already ticked.
      var picked = S.applyFor && list.some(function (a) { return a.id === S.applyFor; }) && !progOf(S.applyFor) ? [S.applyFor] : [];
      var go = el('button', { type: 'button', class: 'ca-btn is-red cp-sheet-go' });
      var all = el('button', { type: 'button', class: 'ca-link cp-apply-all' });
      var rows = [];
      var paint = function () {
        var names = list.filter(function (a) { return picked.indexOf(a.id) >= 0; }).map(function (a) { return a.name; });
        go.textContent = cpApplyLabel(names);
        go.disabled = !names.length;
        all.textContent = picked.length === list.length ? 'Clear' : 'Select all';
        rows.forEach(function (r) { var on = picked.indexOf(r.aid) >= 0; r.node.classList.toggle('is-on', on); r.node.setAttribute('aria-checked', on ? 'true' : 'false'); });
      };
      if (list.length > 1) {
        all.addEventListener('click', function () { picked = picked.length === list.length ? [] : list.map(function (a) { return a.id; }); paint(); });
        sheet.appendChild(el('div', { class: 'cp-apply-top' }, all));
      }
      sheet.appendChild(uiList(list.map(function (a) {
        var p = progOf(a.id);
        var node = uiRow({ av: a.name, avUrl: a.avatarUrl, title: a.name, sub: p ? 'Replaces ' + (p.name || 'their block') : 'No block yet',
          endHtml: '<span class="cp-check" aria-hidden="true">' + ic('check', 2.8) + '</span>',
          onClick: function () { var k = picked.indexOf(a.id); if (k >= 0) picked.splice(k, 1); else picked.push(a.id); paint(); } });
        node.setAttribute('role', 'checkbox');
        node.classList.add('cp-pickrow');
        if (p) { var sub = node.querySelector('.ui-row-sub'); if (sub) sub.classList.add('cp-replaces'); }
        rows.push({ aid: a.id, node: node });
        return node;
      })));
      go.addEventListener('click', function () {
        if (!picked.length || typeof applyTemplateToLifters !== 'function') return;
        var ids = list.filter(function (a) { return picked.indexOf(a.id) >= 0; }).map(function (a) { return a.id; });
        close();
        S.aid = null; S.landFresh = ids[0];   // Programs lands on the first of them, on week 1 of the new block
        applyTemplateToLifters(t, ids, { noun: 'lifters' });
      });
      // The red stays in reach under a long roster: the list scrolls behind it.
      sheet.appendChild(el('div', { class: 'cp-sheet-foot' }, go));
      paint();
    }, { cls: 'cp-apply-sheet' });
  }
  // Save as a template (the block's ⋯): its name, then the one red. coach.html saveProgramAsTemplate saves it
  // as the laptop's does; Templates is one tap from the note that says so.
  function openSaveSheet(prog) {
    if (typeof uiSheet !== 'function' || typeof saveProgramAsTemplate !== 'function') { if (typeof openSaveTemplate === 'function') openSaveTemplate(prog); return; }
    uiSheet('Save as a template', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Its weeks, days, sets and notes, ready to give anyone. What they logged stays theirs.'));
      var lab = el('label', { class: 'cp-field' });
      lab.appendChild(el('span', { class: 'cp-field-l' }, 'Name'));
      var inp = el('input', { type: 'text', class: 'cp-field-in', maxlength: '80', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Template name' });
      inp.value = String(prog.name || 'Program');
      lab.appendChild(inp);
      sheet.appendChild(lab);
      var go = el('button', { type: 'button', class: 'ca-btn is-red cp-sheet-go' }, 'Save template');
      var save = function () {
        var name = inp.value.trim();
        if (!name) { inp.focus(); return; }
        go.setAttribute('aria-busy', 'true');
        Promise.resolve(saveProgramAsTemplate(prog, name)).then(function () {
          close();
          if (typeof toastAction === 'function') toastAction('Saved as a template', 'See it', toTemplates); else if (typeof toast === 'function') toast('Template saved');
        }, function () { go.removeAttribute('aria-busy'); if (typeof toast === 'function') toast('That didn’t save. Try again'); });
      };
      go.addEventListener('click', save);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      sheet.appendChild(go);
    }, { cls: 'cp-save-sheet' });
  }

  /* ---------------------------------------------------------------- empty states */
  function emptyNoLifters() {
    // The first run (29 Oct): the invite as the one red, the program in as the quiet row (coach-you.js).
    if (window.CoachYou && CoachYou.programsWelcome) return CoachYou.programsWelcome();
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
  // A lifter with nothing running: their first block, or (with past blocks kept, after a delete or a finished
  // block) their next one. → { hi, title }
  function cpNoBlockWords(name, hasPast) {
    return { hi: hasPast ? 'No block running' : 'No block yet', title: 'Write ' + first(name) + '\u2019s ' + (hasPast ? 'next' : 'first') + ' block' };
  }
  function emptyNoBlock(aid) {
    var a = (Store.get().athletes || []).find(function (x) { return x.id === aid; }) || { name: 'them' };
    var words = cpNoBlockWords(a.name, (Store.get().programBlocks || []).some(function (b) { return b && b.athleteId === aid; }));
    var wrap = el('div', { class: 'cp-empty' });
    var hero = el('div', { class: 'ca-hero cp-hero ca-rise' });
    hero.appendChild(el('p', { class: 'ca-hero-hi' }, words.hi));
    hero.appendChild(el('h2', { class: 'ca-welcome-t' }, words.title));
    hero.appendChild(el('p', { class: 'ca-hero-sub' }, 'Start blank and add the days, or let the app draft one from their maxes and goal.'));
    var create = el('button', { type: 'button', class: 'ca-btn is-red' }, 'Start a blank block');
    create.addEventListener('click', function () { if (typeof createProgramFor === 'function') createProgramFor(aid); });
    hero.appendChild(create);
    wrap.appendChild(hero);
    var tplN = (Store.get().programTemplates || []).filter(function (t) { var u = getCurrentUser(); return u && t.coachId === u.id; }).length;
    var rows = [
      { icon: 'trend', title: 'Build from their goal', sub: 'A full block from their lifts and where they want to be', run: function () { openGoalModal(aid); } },
      tplN ? { icon: 'copy', title: 'Use a template', sub: plural(tplN, 'template') + ' saved', run: function () { S.applyFor = aid; toTemplates(); } } : null,
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

  /* ---------------------------------------------------------------- Delete program / Delete template
     The app's own ask, built like Remove from roster (coach.html openRemoveLifterSheet): the thing's name, honest
     words about what goes and what stays, the destructive action as the sheet's crimson, Keep in ink under it.
     The laptop keeps its browser confirm (coach.html deleteProgram, desk.js's template ⋯), as Remove does there. */
  function quoteName(s, fallback) { var n = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return n ? '“' + (n.length > 60 ? n.slice(0, 59).trim() + '…' : n) + '”' : fallback; }
  // What Delete program says. prog: the lifter's program; name: the lifter's name; trained: a set in it is logged
  // (app.js programHasTraining), so deleteProgram keeps the block as a past block (archiveProgramIfTrained).
  function cpDeleteProgramWords(prog, name, trained) {
    var who = first(name) || 'the lifter';
    return {
      title: 'Delete ' + quoteName(prog && prog.name, 'this program') + '?',
      words: trained
        ? 'What ' + who + ' logged is kept as a past block. The weeks still to come are deleted, and ' + who + ' has no program until you write or apply one.'
        : 'Nothing in it is logged yet, so nothing is kept, and ' + who + ' has no program until you write or apply one. You can’t undo this.',
      go: 'Delete program', keep: 'Keep program'
    };
  }
  // What Delete template says: a lifter it was applied to has their own copy (applyTemplateToLifters copies it).
  function cpDeleteTemplateWords(t) {
    return {
      title: 'Delete ' + quoteName(t && t.name, 'this template') + '?',
      words: 'Lifters you gave it to keep their block. Only the saved template goes, and you can’t undo this.',
      go: 'Delete template', keep: 'Keep template'
    };
  }
  // The sheet. o: { title, words, go, keep, face: { name, avatarUrl } | null, onGo: async () → true when done, onDone }
  function openDeleteSheet(o) {
    if (typeof uiSheet !== 'function') return null;
    return uiSheet(o.title, function (sheet, close) {
      var h = sheet.querySelector('.ui-sheet-h');
      if (o.face && o.face.name) {
        var face = el('span', { class: 'ui-av rm-face av-h' + (typeof avatarHue === 'function' ? avatarHue(o.face.name) : 0), 'data-name': o.face.name, 'aria-hidden': 'true' }, typeof initials === 'function' ? initials(o.face.name) : '');
        if (o.face.avatarUrl) face.innerHTML = '<img src="' + esc(o.face.avatarUrl) + '" alt="">';
        if (h) sheet.insertBefore(face, h); else sheet.appendChild(face);
      }
      sheet.appendChild(el('p', { class: 'ui-sheet-sub rm-words' }, o.words));
      var go = el('button', { class: 'ca-btn is-red rm-go', type: 'button' }, o.go);
      var keep = el('button', { class: 'ca-btn is-quiet rm-keep', type: 'button' }, o.keep);
      go.addEventListener('click', async function () {
        if (go.getAttribute('aria-busy') === 'true') return;
        go.setAttribute('aria-busy', 'true');
        var ok = false;
        try { ok = await o.onGo(); } catch (e) { ok = false; }
        go.removeAttribute('aria-busy');
        close();
        if (ok && o.onDone) { try { o.onDone(); } catch (e) {} }
      });
      keep.addEventListener('click', close);
      sheet.appendChild(el('div', { class: 'rm-acts' }, go, keep));
    }, { cls: 'rm-sheet cp-del-sheet' });
  }
  // Delete program from the block's ⋯ (Programs): the lifter's face, then coach.html deleteProgram, asked here.
  function deleteProgramSheet(prog, aid) {
    var a = (Store.get().athletes || []).find(function (x) { return x.id === aid; }) || {};
    var w = cpDeleteProgramWords(prog, a.name, typeof programHasTraining === 'function' && programHasTraining(prog));
    return openDeleteSheet(Object.assign(w, {
      face: a.name ? { name: a.name, avatarUrl: a.avatarUrl } : null,
      onGo: async function () { if (typeof deleteProgram !== 'function') return false; await deleteProgram({ confirmed: true, athleteId: aid }); return true; }
    }));
  }
  // Delete template from a template's sheet: asked over it (Keep goes back to it), and both close on Delete.
  function deleteTemplateSheet(t, onDone) {
    var w = cpDeleteTemplateWords(t);
    return openDeleteSheet(Object.assign(w, {
      onGo: async function () {
        Store.update(function (s) { s.programTemplates = (s.programTemplates || []).filter(function (x) { return x.id !== t.id; }); });
        if (typeof persistDeleteTemplate === 'function') persistDeleteTemplate(t.id);
        return true;
      },
      onDone: onDone
    }));
  }

  // A lifter switched elsewhere (their card's Program, a fix) lands on their week, not the last one shown.
  function reset() { S.aid = null; }

  window.CoachProgram = {
    render: render, openEditor: openEditor, openPicker: openPicker, reset: reset,
    renderTemplates: renderTemplates, openTemplateSheet: openTemplateSheet, openApplySheet: openApplySheet, openSaveSheet: openSaveSheet,
    day: function () { return S.aid ? S.days[dayKey(S.aid, curWeek())] || 0 : 0; },
    // pure, for tests
    cpSetLine: cpSetLine, cpSetText: cpSetText, cpDayMeta: cpDayMeta, cpNextDay: cpNextDay, cpIsRestDay: cpIsRestDay, cpLoadStep: cpLoadStep, cpExpectedLoad: cpExpectedLoad,
    openDeleteSheet: openDeleteSheet, deleteProgramSheet: deleteProgramSheet, deleteTemplateSheet: deleteTemplateSheet, cpDeleteProgramWords: cpDeleteProgramWords, cpDeleteTemplateWords: cpDeleteTemplateWords, cpNoBlockWords: cpNoBlockWords,
    cpBlockLine: cpBlockLine, cpWeekWhen: cpWeekWhen, cpDayShort: cpDayShort, cpDayLabels: cpDayLabels, cpWrittenText: cpWrittenText, cpNextWeekMatch: cpNextWeekMatch, cpBlockMenu: cpBlockMenu,
    cpWantsHint: cpWantsHint, cpFitClass: cpFitClass, cpEveryChoices: cpEveryChoices, cpTplLine: cpTplLine, cpApplyLabel: cpApplyLabel, cpModePatch: cpModePatch, cpModePatches: cpModePatches, cpMoreText: cpMoreText, cpPickGroups: cpPickGroups, cpNorm: cpNorm, cpSaveLine: cpSaveLine
  };
})();
