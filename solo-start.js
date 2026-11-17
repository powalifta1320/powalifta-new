/* SOLO START (2026-11-17): the pure rules behind a self-coached lifter's first minutes on Train
 * (athlete.html draws the screens; this file decides, and test/solo-start.test.mjs proves it).
 *
 * - A training log: "Log a session" needs no program. Each session is a day of a program named
 *   "Training log", dated (day.scheduledDate) and marked day.log, filed in the calendar week it
 *   happened in (week.logWeek = that Monday), so the sets log, sync and count exactly as a
 *   program's do.
 * - The first-run numbers: a rep max (1, 3 or 5 reps) read as a max, every lift required, and a
 *   typo (1450 for 145) refused before it builds a block.
 * - The preview: what a generated block is before it starts (days, weeks, sets per lift per
 *   session, each week's heaviest set per lift), so nothing is installed unseen.
 * - The exercise picker's list and search.
 * No DOM, no Store: window.SoloStart in the page, module.exports under node.
 */
(function (root) {
  'use strict';

  var MAIN = ['squat', 'bench', 'deadlift'];
  var LABEL = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift', push: 'Push', pull: 'Pull', legs: 'Legs', cardio: 'Cardio', other: 'Other' };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // The Monday of an ISO date's week, as 'YYYY-MM-DD' (noon, so no time zone moves the day).
  function mondayIso(iso) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return isoOf(d);
  }

  function allDays(prog) {
    var out = [];
    ((prog && prog.weeks) || []).forEach(function (w) { (w.days || []).forEach(function (d) { out.push(d); }); });
    return out;
  }
  // Nothing written in it yet (the builder's blank "My program" counts as nothing).
  function isEmptyProgram(prog) {
    return !allDays(prog).some(function (d) { return (d.exercises || []).length > 0; });
  }
  // A training log: every day in it is a logged session.
  function isLogProgram(prog) {
    var days = allDays(prog);
    return days.length > 0 && days.every(function (d) { return d && d.log === true; });
  }
  // The day already filed for this date, if any.
  function logDayFor(prog, iso) {
    var hit = null;
    ((prog && prog.weeks) || []).forEach(function (w) { (w.days || []).forEach(function (d) { if (!hit && d.log && d.scheduledDate === iso) hit = { week: w, day: d }; }); });
    return hit;
  }
  function logDayName(iso, locale) {
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    var wd = '';
    try { wd = d.toLocaleDateString(locale || undefined, { weekday: 'long' }); } catch (e) { wd = ''; }
    if (!wd) wd = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] || 'Today';
    return wd + ' session';
  }
  // File a session for `iso` in the log (mutates prog). mk: { uid(prefix), day(name) } from app.js
  // (uid, newDay). The same date twice is the same session. Weeks stay in date order, numbered 1..n.
  // → { week, day, created }
  function addLogSession(prog, iso, mk) {
    if (!prog || !iso) return null;
    if (!Array.isArray(prog.weeks)) prog.weeks = [];
    var have = logDayFor(prog, iso);
    if (have) return { week: have.week, day: have.day, created: false };
    var mon = mondayIso(iso);
    var week = null;
    prog.weeks.forEach(function (w) {
      if (week) return;
      var wm = w.logWeek || ((w.days || []).filter(function (d) { return d.scheduledDate; }).map(function (d) { return mondayIso(d.scheduledDate); })[0]) || null;
      if (wm === mon) week = w;
    });
    if (!week) {
      week = { id: mk.uid('wk'), number: 0, logWeek: mon, days: [] };
      prog.weeks.push(week);
    } else if (!week.logWeek) week.logWeek = mon;
    var day = mk.day(logDayName(iso));
    day.log = true;
    day.scheduledDate = iso;
    week.days.push(day);
    week.days.sort(function (a, b) { return String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')); });
    var wkKey = function (w) { return w.logWeek || '9999'; };
    prog.weeks.sort(function (a, b) { return wkKey(a).localeCompare(wkKey(b)); });
    prog.weeks.forEach(function (w, i) { w.number = i + 1; });
    return { week: week, day: day, created: true };
  }

  // A rep max read as an estimated max: the same formula as app.js calcE1RM at RPE 10, reps capped at 10.
  function repMaxToE1rm(weight, reps) {
    var w = Number(weight), r = Math.round(Number(reps) || 1);
    if (!(w > 0)) return 0;
    r = Math.max(1, Math.min(10, r));
    if (r === 1) return w;
    return w / (1 - (r - 1) * 0.0333);
  }
  // Kilos nobody has lifted raw (the world records sit near 500 / 355 / 500) and less than an empty bar.
  var LIMITS_KG = { squat: [20, 520], bench: [20, 400], deadlift: [20, 520] };
  // The first-run numbers, in kg, for a rep max of `reps`. → { ok: true, e1rms } or
  // { ok: false, lift, why: 'missing' | 'low' | 'high' } (the first lift that's wrong, in squat, bench, deadlift order).
  function checkSetupLifts(valsKg, reps) {
    var e1rms = {};
    for (var i = 0; i < MAIN.length; i++) {
      var l = MAIN[i], v = Number(valsKg && valsKg[l]);
      if (!(v > 0)) return { ok: false, lift: l, why: 'missing' };
      if (v < LIMITS_KG[l][0]) return { ok: false, lift: l, why: 'low' };
      if (v > LIMITS_KG[l][1]) return { ok: false, lift: l, why: 'high' };
      e1rms[l] = Math.round(repMaxToE1rm(v, reps) * 2) / 2;
    }
    return { ok: true, e1rms: e1rms };
  }

  // What a block is, before it starts. → { weeks, daysPerWeek, sessions, maxLiftSets, liftDays }
  //   daysPerWeek  the most training days in any week
  //   maxLiftSets  the most sets of one exercise in one session, anywhere in the block
  //   liftDays     week 1: how many days each main lift is on
  function previewSummary(prog) {
    var weeks = (prog && prog.weeks) || [];
    var dpw = 0, sessions = 0, maxSets = 0, liftDays = { squat: 0, bench: 0, deadlift: 0 };
    weeks.forEach(function (w, wi) {
      var n = 0;
      (w.days || []).forEach(function (d) {
        var exs = d.exercises || [];
        if (!exs.length) return;
        n++; sessions++;
        var seen = {};
        exs.forEach(function (e) {
          maxSets = Math.max(maxSets, (e.sets || []).length);
          if (wi === 0 && MAIN.indexOf(e.lift) >= 0 && !seen[e.lift]) { seen[e.lift] = 1; liftDays[e.lift]++; }
        });
      });
      dpw = Math.max(dpw, n);
    });
    return { weeks: weeks.length, daysPerWeek: dpw, sessions: sessions, maxLiftSets: maxSets, liftDays: liftDays };
  }
  // Each week's heaviest planned set per main lift (any variant), so the preview shows the loads
  // climbing and the lighter last week. → [{ number, lifts: { squat: { kg, reps } | null, ... } }]
  function weekOutline(prog) {
    return ((prog && prog.weeks) || []).map(function (w) {
      var lifts = { squat: null, bench: null, deadlift: null };
      (w.days || []).forEach(function (d) {
        (d.exercises || []).forEach(function (e) {
          if (MAIN.indexOf(e.lift) < 0) return;
          (e.sets || []).forEach(function (s) {
            var kg = Number(s.plannedWeight != null && s.plannedWeight > 0 ? s.plannedWeight : s.weight) || 0;
            var cur = lifts[e.lift];
            if (kg > 0 && (!cur || kg > cur.kg || (kg === cur.kg && Number(s.reps) > cur.reps))) lifts[e.lift] = { kg: kg, reps: Number(s.reps) || 0 };
          });
        });
      });
      return { number: w.number, lifts: lifts };
    });
  }

  // The picker's list: the big three, their variations, then accessories by group and cardio.
  // lib: { variants: { squat: ['Competition', ...] }, accessories: { legs: [...] }, cardio: [...] }
  // → [{ group, lift, variant, name, title }]
  function exerciseChoices(lib) {
    lib = lib || {};
    var out = [];
    var vs = lib.variants || {};
    MAIN.forEach(function (l) { out.push({ group: 'Squat, bench, deadlift', lift: l, variant: 'Competition', name: '', title: LABEL[l] }); });
    MAIN.forEach(function (l) {
      (vs[l] || []).filter(function (v) { return v !== 'Competition'; }).forEach(function (v) {
        out.push({ group: 'Variations', lift: l, variant: v, name: '', title: v + ' ' + LABEL[l] });
      });
    });
    var acc = lib.accessories || {};
    [['legs', 'Legs'], ['push', 'Push'], ['pull', 'Pull']].forEach(function (g) {
      (acc[g[0]] || []).forEach(function (n) { out.push({ group: g[1], lift: g[0], variant: '', name: n, title: n }); });
    });
    (lib.cardio || []).forEach(function (n) { out.push({ group: 'Cardio', lift: 'cardio', variant: '', name: n, title: n }); });
    return out;
  }
  function _norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  // Every word typed must start a word of the title, or of an accessory's group ("pa sq" finds Paused
  // Squat, "pull" finds the rows). Matches on the name come before matches on the group, else list order.
  // A name that isn't in the list can still be added as typed (custom: true, an "other" lift).
  function filterChoices(items, q) {
    var words = _norm(q).split(' ').filter(Boolean);
    if (!words.length) return items.slice();
    var starts = function (hay) { return words.every(function (w) { return hay.some(function (h) { return h.indexOf(w) === 0; }); }); };
    var byName = [], byGroup = [];
    items.forEach(function (it) {
      var title = _norm(it.title).split(' ');
      if (starts(title)) byName.push(it);
      else if (MAIN.indexOf(it.lift) < 0 && starts(title.concat(_norm(it.group).split(' ')))) byGroup.push(it);
    });
    var hits = byName.concat(byGroup);
    var typed = String(q).replace(/\s+/g, ' ').trim();
    var exact = items.some(function (it) { return _norm(it.title) === _norm(typed); });
    if (typed && !exact) hits.push({ group: 'Your own', lift: 'other', variant: '', name: typed.slice(0, 60), title: typed.slice(0, 60), custom: true });
    return hits;
  }
  // The sets a new exercise starts with: the big three 3 × 5 at RPE 7, everything else 3 × 10 at
  // RPE 8 (a pulldown is never 5s), cardio one 30-minute bout. Loads come from the caller (0 = typed).
  // → [{ weight, reps, rpe }]
  function seedSets(lift, kg) {
    if (lift === 'cardio') return [{ weight: 30, reps: 5, rpe: null }];
    var main = MAIN.indexOf(lift) >= 0;
    var w = Number(kg) > 0 ? Number(kg) : 0;
    var one = main ? { weight: w, reps: 5, rpe: 7 } : { weight: w, reps: 10, rpe: 8 };
    return [one, Object.assign({}, one), Object.assign({}, one)];
  }

  var api = {
    mondayIso: mondayIso, isEmptyProgram: isEmptyProgram, isLogProgram: isLogProgram, logDayFor: logDayFor, logDayName: logDayName,
    addLogSession: addLogSession, repMaxToE1rm: repMaxToE1rm, LIMITS_KG: LIMITS_KG, checkSetupLifts: checkSetupLifts,
    previewSummary: previewSummary, weekOutline: weekOutline, exerciseChoices: exerciseChoices, filterChoices: filterChoices, seedSets: seedSets
  };
  root.SoloStart = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
