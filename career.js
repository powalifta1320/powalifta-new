/* career.js: a lifter's lifelong record in one scroll (2026-10-27).

   PURE (no DOM, no Store, no network): careerEvents(athleteId, store, opts) reads the store's
   workoutLogs, meets (logged by hand or brought in from OpenPowerlifting, which arrive as meets with
   their lifts) and programBlocks (the past blocks) and returns the hero numbers and every event,
   grouped by year, newest first:
     pr         a new best e1RM (competition equivalent, like Progress) or a heavier single, triple or
                five on the competition lift; one event per lift per day, and only when it beats the
                best before it (the first time a lift is logged sets the bar, as in the wraps)
     meet       each competed meet (never a planned one): the total, placing, class, federation, lifts
     class      a weight-class move from one meet to the next, up or down
     block      a finished (past) block: its weeks, sessions and what the e1RM total did in it
     milestone  the first session, the 50th / 100th / 250th / 500th / 1,000th, the e1RM total past each
                50 kg (100 lb) step. The first meet rides on its meet event (first: true, "First meet"):
                one row, never two for the same day.
   Weights in the events are in the lifter's unit (opts.unit, else the app's getUnit()), dates are
   'YYYY-MM-DD' and every date sum is done in UTC on those strings. An estimate rounds (e1RM 205),
   a weight that was on the bar stays exact (187.5). Unit-tested: tests.html "career (career.js)".

   VIEW (browser only, the second half): Career.render draws the hero and the years. You › Career on
   the lifter's phone (athlete.html renderCareer), a read-only sheet on the coach's phone and a panel
   on the laptop desk (Career.openForCoach, from coach-lifters.js). Nothing here writes anything. */
(function () {
  'use strict';
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var LIFT_NAME = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var REP_COUNTS = [1, 3, 5];
  var SESSION_MARKS = [50, 100, 250, 500, 1000];
  // Same day, newest first: the meet leads, then the class it was lifted in, then the rest.
  var RANK = { meet: 0, 'class': 1, milestone: 2, block: 3, pr: 4 };
  var KG_LB = 0.45359237;
  var DAY = 86400000;

  /* =====================================================================================
     PURE
     ===================================================================================== */
  function isoDay(v) { var s = String(v == null ? '' : v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }
  function utcOf(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
  function daysBetween(a, b) { return Math.round((utcOf(b) - utcOf(a)) / DAY); }
  function todayLocal() {
    if (typeof todayISO === 'function') return todayISO();
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function unitOf(u) {
    if (u === 'lbs' || u === 'lb') return 'lbs';
    if (u === 'kg') return 'kg';
    return typeof getUnit === 'function' && getUnit() === 'lbs' ? 'lbs' : 'kg';
  }
  function inUnit(kg, unit) { return unit === 'lbs' ? kg / KG_LB : kg; }
  function est(kg, unit) { return Math.round(inUnit(kg, unit)); }                 // an estimate rounds
  function exact(kg, unit) { return Math.round(inUnit(kg, unit) * 10) / 10; }     // a lifted weight doesn't
  // 1234.5 → '1,234.5' (the same in every locale, so the tests read the same everywhere).
  function group3(v) {
    var s = String(Math.abs(v)).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (v < 0 ? '−' : '') + s.join('.');
  }
  // A change in the lifter's unit with its sign: '+4', '−2.5', '+0.5', '±0'.
  function signed(kg, unit) {
    var v = inUnit(Math.abs(kg), unit);
    if (v < 0.05) return '±0';
    var r = v >= 1 ? Math.round(v) : Math.round(v * 10) / 10;
    return (kg < 0 ? '−' : '+') + group3(r);
  }
  // A block's change, an estimate: whole kilos (pounds), '±0' when it rounds away.
  function signedWhole(kg, unit) {
    var r = Math.round(inUnit(Math.abs(kg), unit));
    return r === 0 ? '±0' : (kg < 0 ? '−' : '+') + group3(r);
  }
  function pos(v) { var n = Number(v); return n > 0 && isFinite(n) ? n : 0; }
  function plural(n, one, many) { return group3(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  // A set's competition-equivalent e1RM: the one stored with it, else worked out the app's way.
  function e1Of(l) {
    var c = Number(l.e1rmComp);
    if (c > 0 && isFinite(c)) return c;
    if (typeof calcE1RM !== 'function') return 0;
    var raw = calcE1RM(Number(l.weight) || 0, Number(l.reps) || 0, Number(l.rpe) || 0);
    return raw > 0 ? raw * (typeof multiplierFor === 'function' ? multiplierFor(l.lift, l.variant) : 1) : 0;
  }
  function isCompetition(l) { return String(l.variant || 'Competition') === 'Competition'; }
  // A meet's class as written ('83', '83kg', '-83 kg', '120+', '198 lb') → { text: '83 kg', n (kg), plus }.
  function classOf(c) {
    var s = String(c == null ? '' : c).trim();
    if (!s) return null;
    var m = /^[-–−]?\s*(\d+(?:[.,]\d+)?)\s*(\+)?\s*(?:kgs?)?\s*(\+)?$/i.exec(s);
    if (m) { var n = Number(m[1].replace(',', '.')), p = !!(m[2] || m[3]); return { text: n + (p ? '+' : '') + ' kg', n: n, plus: p }; }
    var lb = /^(\d+(?:\.\d+)?)\s*(\+)?\s*lbs?$/i.exec(s);
    if (lb) return { text: lb[1] + (lb[2] ? '+' : '') + ' lb', n: Number(lb[1]) * KG_LB, plus: !!lb[2] };
    return { text: s, n: null, plus: false };
  }
  function sameClass(a, b) { return a.n != null && b.n != null ? Math.abs(a.n - b.n) < 0.05 && a.plus === b.plus : a.text.toLowerCase() === b.text.toLowerCase(); }
  function classDir(from, to) {
    if (from.n == null || to.n == null) return null;
    if (Math.abs(to.n - from.n) >= 0.05) return to.n > from.n ? 'up' : 'down';
    if (to.plus !== from.plus) return to.plus ? 'up' : 'down';
    return null;
  }
  // Placing: a place field when there is one, else what OpenPowerlifting wrote in the notes ("1st place").
  function placeOf(m) {
    var p = m && m.place != null ? String(m.place).trim() : '';
    if (/^\d{1,3}$/.test(p) && +p > 0) return ordinal(+p) + ' place';
    var notes = String((m && m.notes) || '');
    var x = /\b(\d{1,3})(?:st|nd|rd|th) place\b/i.exec(notes);
    if (x && +x[1] > 0) return ordinal(+x[1]) + ' place';
    if (p === 'G' || /\bguest lifter\b/i.test(notes)) return 'Guest lifter';
    return null;
  }
  function dotsOf(m) { var x = /\bDOTS (\d+(?:\.\d+)?)/.exec(String((m && m.notes) || '')); return x ? Number(x[1]) : null; }
  // How long between two dates, in words: '9 days', '6 weeks', '8 months', '1 year 2 months'.
  function spanText(days) {
    if (days < 14) return plural(days, 'day');
    var months = Math.round(days / 30.4375);
    if (months < 2) return plural(Math.round(days / 7), 'week');
    if (months < 12) return plural(months, 'month');
    var y = Math.floor(months / 12), mo = months % 12;
    return plural(y, 'year') + (mo ? ' ' + plural(mo, 'month') : '');
  }
  function plannedMeet(m, today) {
    if (typeof isPlannedMeet === 'function') return isPlannedMeet(m, today);
    if (m.status === 'planned' || m.planned === true) return true;
    if (m.status) return false;
    return !LIFTS.some(function (k) { return pos(m[k]) > 0; }) && String(m.date).slice(0, 10) > today;
  }
  function setName(l) {
    if (LIFTS.indexOf(l.lift) >= 0) return isCompetition(l) ? LIFT_NAME[l.lift] : String(l.variant).trim() + ' ' + LIFT_NAME[l.lift].toLowerCase();
    return String(l.exerciseName || '').trim();
  }
  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  function prEvent(L, d, parts, u) {
    var txt = [];
    if (parts.e1) txt.push('e1RM ' + group3(est(parts.e1.kg, u)) + ' ' + u + ' (' + signed(parts.e1.kg - parts.e1.fromKg, u) + ')');
    parts.reps.forEach(function (r) { txt.push(group3(exact(r.kg, u)) + ' ' + u + ' × ' + r.n); });
    var heaviest = parts.reps.reduce(function (m, r) { return Math.max(m, r.kg); }, 0);
    return {
      kind: 'pr', date: d, key: 'pr|' + d + '|' + L, lift: L, title: LIFT_NAME[L] + ' PR', detail: txt.join(' · '),
      value: parts.e1 ? est(parts.e1.kg, u) : exact(heaviest, u), valueKind: parts.e1 ? 'e1rm' : 'lifted', unit: u,
      e1: parts.e1 ? { kg: parts.e1.kg, fromKg: parts.e1.fromKg, value: est(parts.e1.kg, u), gain: signed(parts.e1.kg - parts.e1.fromKg, u) } : null,
      reps: parts.reps.map(function (r) { return { n: r.n, kg: r.kg, fromKg: r.fromKg, value: exact(r.kg, u) }; })
    };
  }

  // careerEvents(athleteId, store, opts) → { hero, years: [{ year, events, counts }], events, today, unit }.
  //   store: Store.get()'s shape ({ workoutLogs, meets, programBlocks }); opts: { today, unit: 'kg' | 'lbs' }.
  function careerEvents(athleteId, store, opts) {
    opts = opts || {};
    var st = store || {};
    var today = isoDay(opts.today) || todayLocal();
    var u = unitOf(opts.unit);
    var step = u === 'lbs' ? 100 : 50;

    // This lifter's sets up to today, oldest first (ties by id: the same order however they loaded).
    var logs = (st.workoutLogs || []).filter(function (l) { return l && l.athleteId === athleteId && isoDay(l.date) && String(l.date).slice(0, 10) <= today; })
      .map(function (l) { return { l: l, date: String(l.date).slice(0, 10), id: String(l.id == null ? '' : l.id) }; })
      .sort(function (a, b) { return cmpStr(a.date, b.date) || cmpStr(a.id, b.id); });

    // Competed meets up to today. A planned meet is a date, never a result; a meet with nothing lifted
    // has nothing to show. The same meet twice (same day, same name) is one meet: the fuller one.
    var meets = [], seenMeet = {};
    (st.meets || []).forEach(function (m) {
      if (!m || m.athleteId !== athleteId) return;
      var d = isoDay(m.date);
      if (!d || d > today || plannedMeet(m, today)) return;
      var kg = { squat: pos(m.squat), bench: pos(m.bench), deadlift: pos(m.deadlift) };
      if (!(kg.squat || kg.bench || kg.deadlift)) return;
      var x = { m: m, date: d, kg: kg, total: kg.squat + kg.bench + kg.deadlift, full: !!(kg.squat && kg.bench && kg.deadlift), id: String(m.id == null ? '' : m.id) };
      var key = d + '|' + String(m.name || '').trim().toLowerCase();
      if (seenMeet[key] != null) { if (x.total > meets[seenMeet[key]].total) meets[seenMeet[key]] = x; return; }
      seenMeet[key] = meets.length;
      meets.push(x);
    });
    meets.sort(function (a, b) { return cmpStr(a.date, b.date) || cmpStr(String(a.m.name || ''), String(b.m.name || '')) || cmpStr(a.id, b.id); });

    var days = {};
    var dayOf = function (d) { return days[d] || (days[d] = { logs: [], meets: [] }); };
    logs.forEach(function (x) { dayOf(x.date).logs.push(x.l); });
    meets.forEach(function (x) { dayOf(x.date).meets.push(x); });

    var best = { squat: 0, bench: 0, deadlift: 0 };              // best e1RM so far
    var rep = { squat: {}, bench: {}, deadlift: {} };             // heaviest weight for 1 / 3 / 5 reps so far
    var bestMeetTotal = 0, prevClass = null, firstMeetSeen = false, stepAt = null;
    var sessions = [], events = [];

    Object.keys(days).sort().forEach(function (d) {
      var D = days[d];
      // The meet first: a single lifted on the platform is the bar for a training single that day.
      D.meets.forEach(function (x) {
        var m = x.m, prLifts = [];
        LIFTS.forEach(function (L) {
          var kg = x.kg[L], was = rep[L][1] || 0;
          if (!(kg > 0)) return;
          if (was > 0 && kg > was + 0.01) prLifts.push(L);
          if (kg > was) rep[L][1] = kg;
        });
        var totalPr = x.full && bestMeetTotal > 0 && x.total > bestMeetTotal + 0.01;
        if (x.full && x.total > bestMeetTotal) bestMeetTotal = x.total;
        var cls = classOf(m.weightClass), place = placeOf(m), first = !firstMeetSeen, fed = String(m.federation || '').trim();
        var name = String(m.name || '').trim() || 'Meet';
        firstMeetSeen = true;
        var lifts = {};
        LIFTS.forEach(function (L) { lifts[L] = x.kg[L] > 0 ? exact(x.kg[L], u) : null; });
        events.push({
          kind: 'meet', date: d, key: 'meet|' + (x.id || d + '|' + name), title: name,
          detail: [first ? 'First meet' : null, place, cls ? cls.text : null, fed || null, x.full ? null : 'No total'].filter(Boolean).join(' · '),
          value: x.full ? exact(x.total, u) : null, unit: u, totalKg: x.full ? x.total : null,
          meetId: m.id || null, place: place, weightClass: cls ? cls.text : null, federation: fed || null, lifts: lifts,
          first: first, totalPr: totalPr, prLifts: prLifts, dots: dotsOf(m), bodyweightKg: pos(m.bodyweight) || null,
          source: /From OpenPowerlifting/i.test(String(m.notes || '')) ? 'opl' : 'logged'
        });
        if (cls) {
          if (prevClass && !sameClass(prevClass, cls)) {
            var dir = classDir(prevClass, cls);
            events.push({ kind: 'class', date: d, key: 'class|' + d + '|' + cls.text,
              title: (dir === 'up' ? 'Up to ' : dir === 'down' ? 'Down to ' : 'Now in ') + cls.text,
              detail: 'From ' + prevClass.text + ' · ' + name, direction: dir, from: prevClass.text, to: cls.text, meetId: m.id || null });
          }
          prevClass = cls;
        }
      });
      if (!D.logs.length) return;

      // A session: the first, and the 50th, 100th…
      sessions.push(d);
      var n = sessions.length;
      if (n === 1) {
        var top = null;
        D.logs.forEach(function (l) { if (LIFTS.indexOf(l.lift) >= 0 && pos(l.weight) && (!top || e1Of(l) > e1Of(top))) top = l; });
        events.push({ kind: 'milestone', type: 'first-session', date: d, key: 'ms|first-session', title: 'First session logged',
          detail: top ? setName(top) + ' ' + group3(exact(pos(top.weight), u)) + ' ' + u + ' × ' + (Number(top.reps) || 1) : '' });
      }
      if (SESSION_MARKS.indexOf(n) >= 0) {
        events.push({ kind: 'milestone', type: 'sessions', date: d, key: 'ms|sessions|' + n, title: group3(n) + 'th session', n: n,
          detail: spanText(daysBetween(sessions[0], d)) + ' after the first' });
      }

      // The day's best per lift against everything before it.
      var e1Today = [];
      LIFTS.forEach(function (L) {
        var e1 = 0, top = {};
        D.logs.forEach(function (l) {
          if (l.lift !== L) return;
          var v = e1Of(l);
          if (v > e1) e1 = v;
          var r = Number(l.reps), w = pos(l.weight);
          if (w > 0 && REP_COUNTS.indexOf(r) >= 0 && isCompetition(l) && w > (top[r] || 0)) top[r] = w;
        });
        var parts = { e1: null, reps: [] };
        if (e1 > 0 && best[L] > 0 && e1 > best[L] + 0.05) parts.e1 = { kg: e1, fromKg: best[L] };
        REP_COUNTS.forEach(function (r) {
          var w = top[r] || 0, was = rep[L][r] || 0;
          if (w > 0 && was > 0 && w > was + 0.01) parts.reps.push({ n: r, kg: w, fromKg: was });
        });
        if (e1 > best[L]) best[L] = e1;
        REP_COUNTS.forEach(function (r) { if ((top[r] || 0) > (rep[L][r] || 0)) rep[L][r] = top[r]; });
        if (parts.e1) e1Today.push(L);
        if (parts.e1 || parts.reps.length) events.push(prEvent(L, d, parts, u));
      });

      // The e1RM total past a 50 kg (100 lb) step, counted from the first day all three have one.
      if (best.squat > 0 && best.bench > 0 && best.deadlift > 0) {
        var tot = best.squat + best.bench + best.deadlift, k = Math.floor(inUnit(tot, u) / step + 1e-9);
        if (stepAt == null) stepAt = k;
        else if (k > stepAt) {
          stepAt = k;
          // What did it: 'Deadlift PR · e1RM total 552 kg'.
          var by = e1Today.map(function (L, i) { return i ? LIFT_NAME[L].toLowerCase() : LIFT_NAME[L]; });
          var did = by.length ? (by.length > 1 ? by.slice(0, -1).join(', ') + ' and ' + by[by.length - 1] + ' PRs' : by[0] + ' PR') + ' · ' : '';
          events.push({ kind: 'milestone', type: 'total', date: d, key: 'ms|total|' + k * step, title: 'Total past ' + group3(k * step) + ' ' + u,
            detail: did + 'e1RM total ' + group3(est(tot, u)) + ' ' + u, step: k * step, unit: u, lifts: e1Today.slice() });
        }
      }
    });

    // Finished blocks: each lift's best e1RM in the block against its best before the block began.
    var e1s = [];
    logs.forEach(function (x) { if (LIFTS.indexOf(x.l.lift) >= 0) { var v = e1Of(x.l); if (v > 0) e1s.push({ date: x.date, lift: x.l.lift, e1: v }); } });
    var seenBlock = {}, blockStarts = [];
    (st.programBlocks || []).forEach(function (b) {
      if (!b || b.athleteId !== athleteId) return;
      var end = isoDay(b.endedOn), start = isoDay(b.startedOn) || end;
      if (!end || end > today) return;
      if (start > end) { var t = start; start = end; end = t; }
      var name = String(b.name || '').trim() || 'Block';
      var id = b.id != null ? String(b.id) : name + '|' + start + '|' + end;
      if (seenBlock[id]) return;
      seenBlock[id] = 1;
      var stats = b.stats || {};
      if (Number(stats.sets) > 0 && !(Number(stats.done) > 0)) return;   // written, never lifted
      var sess = Number(stats.sessions) > 0 ? Number(stats.sessions) : Object.keys(logs.reduce(function (o, x) { if (x.date >= start && x.date <= end) o[x.date] = 1; return o; }, {})).length;
      var change = {}, total = 0, any = false;
      LIFTS.forEach(function (L) {
        var before = 0, inB = 0;
        e1s.forEach(function (x) {
          if (x.lift !== L) return;
          if (x.date < start) { if (x.e1 > before) before = x.e1; } else if (x.date <= end && x.e1 > inB) inB = x.e1;
        });
        if (before > 0 && inB > 0) { change[L] = inB - before; total += inB - before; any = true; }
      });
      var weeks = Math.max(1, Math.round((daysBetween(start, end) + 1) / 7));
      blockStarts.push(start);
      events.push({
        kind: 'block', date: end, key: 'block|' + id, title: name, blockId: b.id || null,
        // '+19 kg' beside 'e1RM total over 4 weeks · 14 sessions'; without a change, just its length.
        detail: (any ? 'e1RM total over ' : '') + [plural(weeks, 'week'), sess ? plural(sess, 'session') : null].filter(Boolean).join(' · '),
        value: any ? Math.round(inUnit(total, u)) || 0 : null, valueText: any ? signedWhole(total, u) : null, delta: true, unit: u,
        startedOn: start, endedOn: end, weeks: weeks, sessions: sess, changeKg: any ? change : null, changeTotalKg: any ? total : null
      });
    });

    events.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      var r = RANK[a.kind] - RANK[b.kind];
      if (r) return r;
      var la = a.lift ? LIFTS.indexOf(a.lift) : -1, lb = b.lift ? LIFTS.indexOf(b.lift) : -1;
      return la - lb || cmpStr(a.key, b.key);
    });

    var years = [], at = {};
    events.forEach(function (e) {
      var y = Number(e.date.slice(0, 4));
      if (at[y] == null) { at[y] = years.length; years.push({ year: y, events: [], counts: { pr: 0, meet: 0, block: 0, 'class': 0, milestone: 0 } }); }
      years[at[y]].events.push(e);
      years[at[y]].counts[e.kind]++;
    });

    var bestMeet = null;
    meets.forEach(function (x) { if (x.full && (!bestMeet || x.total > bestMeet.total)) bestMeet = x; });
    var totalKg = best.squat + best.bench + best.deadlift;
    var firstDate = [sessions[0], meets[0] && meets[0].date].concat(blockStarts).filter(Boolean).sort()[0] || null;
    var span = firstDate ? Math.max(0, daysBetween(firstDate, today)) : 0;
    var hero = {
      total: totalKg > 0 ? est(totalKg, u) : null, totalKg: totalKg > 0 ? totalKg : null,
      complete: !!(best.squat && best.bench && best.deadlift),
      bestMeetTotal: bestMeet ? exact(bestMeet.total, u) : null, bestMeetTotalKg: bestMeet ? bestMeet.total : null,
      bestMeet: bestMeet ? { name: String(bestMeet.m.name || '').trim() || 'Meet', date: bestMeet.date, id: bestMeet.m.id || null } : null,
      firstDate: firstDate, days: span, years: Math.round(span / 365.25 * 10) / 10,
      sessions: sessions.length, meets: meets.length, prs: events.filter(function (e) { return e.kind === 'pr'; }).length, unit: u
    };
    return { hero: hero, years: years, events: events, today: today, unit: u };
  }

  // A year's PRs per lift, for its records card: how many, the best e1RM reached that year and what it
  // gained on the best before the year. → [{ lift, count, best, bestKg, gain, gainKg, latest }] squat first.
  function yearRecords(yearOrEvents) {
    var evs = (Array.isArray(yearOrEvents) ? yearOrEvents : (yearOrEvents && yearOrEvents.events) || []).filter(function (e) { return e && e.kind === 'pr'; });
    return LIFTS.map(function (L) {
      var mine = evs.filter(function (e) { return e.lift === L; }).sort(function (a, b) { return cmpStr(b.date, a.date); });
      if (!mine.length) return null;
      var u = mine[0].unit || 'kg';
      var e1s = mine.filter(function (e) { return e.e1; });
      var bestKg = e1s.reduce(function (m, e) { return Math.max(m, e.e1.kg); }, 0);
      var first = e1s.length ? e1s[e1s.length - 1] : null;
      var gainKg = bestKg > 0 && first ? bestKg - first.e1.fromKg : null;
      return { lift: L, count: mine.length, bestKg: bestKg || null, best: bestKg ? est(bestKg, u) : null, gainKg: gainKg,
        gain: gainKg != null ? signed(gainKg, u) : null, latest: mine[0].date, unit: u };
    }).filter(Boolean);
  }

  // One short line for a link into the career: '5 meets · since 2024'.
  function careerLine(C) {
    var h = C && C.hero;
    if (!h || !h.firstDate) return '';
    return [h.meets ? plural(h.meets, 'meet') : (h.sessions ? plural(h.sessions, 'session') : null), 'since ' + h.firstDate.slice(0, 4)].filter(Boolean).join(' · ');
  }

  var Career = {
    careerEvents: careerEvents, yearRecords: yearRecords, careerLine: careerLine,
    classOf: classOf, placeOf: placeOf, spanText: spanText, signed: signed, group3: group3
  };
  if (typeof window !== 'undefined') { window.Career = Career; window.careerEvents = careerEvents; }

  /* =====================================================================================
     VIEW (browser only): the hero, then each year: its moments as a timeline, its PRs as records.
     ===================================================================================== */
  var IC = {
    meet: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.8 2.8 0 0 0 2.8 3.6M16 6h2.5a2.8 2.8 0 0 1-2.8 3.6M12 13v3.5M8.5 20h7M10 16.5h4"/>',
    'class': '<rect x="4" y="5" width="16" height="15" rx="4"/><path d="M8.8 10.2a3.6 3.6 0 0 1 6.4 0"/><path d="m12 10.6 1.4-1.6"/>',
    block: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/><path d="m9 14.6 2 2 4-4"/>',
    milestone: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
    pr: '<path d="M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.7L12 16.4l-5.1 2.8L8 13.5l-4.3-4 5.8-.7z"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    steps: '<path d="M4 19h4.5v-4.5H13V10h4.5V5.5H20"/>'
  };
  function svg(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || '') + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mk(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; }
  function dayText(iso) {
    try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) { return iso.slice(5); }
  }
  function monthYear(iso) {
    try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); } catch (e) { return iso.slice(0, 7); }
  }
  function reduced() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

  // The hero: the e1RM total big (or, with meets but no sets logged, the best meet total), since when,
  // then three numbers: the best meet (PRs before a first meet), years lifting, sessions.
  function heroNode(C, o) {
    var h = C.hero, u = h.unit;
    var meetLeads = h.total == null && h.bestMeetTotal != null;
    var hero = mk('div', 'ui-hero cv-hero');
    var top = mk('div', 'cv-htop');
    top.appendChild(mk('div', 'ui-hero-label', meetLeads ? 'Best meet total' : 'e1RM total'));
    var big = mk('div', 'ui-num-xl cv-total');
    var bigKg = meetLeads ? h.bestMeetTotal : h.total;
    if (bigKg != null) big.innerHTML = esc(group3(bigKg)) + '<small>' + esc(u) + '</small>';
    else { big.textContent = 'Shows once all three lifts are logged'; big.classList.add('is-empty'); }
    top.appendChild(big);
    var since = h.firstDate ? 'Since ' + monthYear(h.firstDate) : '';
    var line = [since, h.meets && !meetLeads ? plural(h.meets, 'meet') : null].filter(Boolean).join(' · ');
    if (line) top.appendChild(mk('div', 'cv-since', line));
    hero.appendChild(top);
    var stats = mk('div', 'rh-stats cv-stats');
    var stat = function (val, small, label) {
      var c = mk('div', 'rh-stat');
      var b = mk('b');
      b.innerHTML = esc(val) + (small ? '<small>' + esc(small) + '</small>' : '');
      c.appendChild(b);
      c.appendChild(mk('span', null, label));
      stats.appendChild(c);
    };
    if (meetLeads) stat(group3(h.meets), '', h.meets === 1 ? 'Meet' : 'Meets');
    else if (h.bestMeetTotal != null) stat(group3(h.bestMeetTotal), u, 'Best meet');
    else stat(group3(h.prs), '', h.prs === 1 ? 'PR' : 'PRs');
    if (h.days >= 365) stat(String(h.years), '', h.years === 1 ? 'Year lifting' : 'Years lifting');
    else { var mo = Math.max(1, Math.round(h.days / 30.4375)); stat(String(mo), '', mo === 1 ? 'Month lifting' : 'Months lifting'); }
    if (h.sessions) stat(group3(h.sessions), '', h.sessions === 1 ? 'Session' : 'Sessions');
    hero.appendChild(stats);
    return hero;
  }

  function valueHtml(e) {
    if (e.kind === 'block') return e.valueText ? '<b>' + esc(e.valueText) + '</b><small>' + esc(e.unit) + '</small>' : '';
    if (e.value == null) return '';
    return '<b>' + esc(group3(e.value)) + '</b><small>' + esc(e.unit) + '</small>';
  }
  // A meet's three lifts: 'Squat 185 · Bench 115 · Deadlift 215' (exact, as lifted).
  function meetLifts(e) {
    return LIFTS.filter(function (L) { return e.lifts && e.lifts[L] != null; }).map(function (L) { return LIFT_NAME[L] + ' ' + group3(e.lifts[L]); }).join(' · ');
  }
  function eventRow(e) {
    var row = mk('div', 'cv-ev k-' + e.kind);
    row.setAttribute('role', 'listitem');
    var ic = mk('span', 'cv-ic');
    ic.setAttribute('aria-hidden', 'true');
    ic.innerHTML = svg(e.kind);
    row.appendChild(ic);
    var t = mk('span', 'cv-t');
    if (e.kind === 'pr' && e.lift) { var dot = mk('i', 'lift-dot lift-' + e.lift); dot.setAttribute('aria-hidden', 'true'); t.appendChild(dot); }
    t.appendChild(document.createTextNode(e.title));
    row.appendChild(t);
    var v = valueHtml(e);
    if (v) { var vn = mk('span', 'cv-v'); vn.innerHTML = v; row.appendChild(vn); }
    if (e.detail) row.appendChild(mk('span', 'cv-d', e.detail));
    var dt = mk('time', 'cv-dt', dayText(e.date));
    dt.setAttribute('datetime', e.date);
    row.appendChild(dt);
    if (e.kind === 'meet') { var ml = meetLifts(e); if (ml) row.appendChild(mk('span', 'cv-x', ml)); }
    return row;
  }

  // A year's moments (meets, class moves, milestones, blocks) as one timeline. Everything shows but
  // the blocks past the three newest: those wait behind "Show 3 more blocks".
  function momentsNode(list, o) {
    var box = mk('div', 'ui-list cv-list');
    var rows = mk('div', 'cv-rows');
    rows.setAttribute('role', 'list');
    box.appendChild(rows);
    var blocks = 0, hidden = [];
    list.forEach(function (e) {
      var row = eventRow(e);
      if (e.kind === 'block' && ++blocks > 3) { row.hidden = true; row.classList.add('is-more'); hidden.push(row); }
      rows.appendChild(row);
    });
    if (hidden.length) box.appendChild(moreButton('Show ' + hidden.length + ' more ' + (hidden.length === 1 ? 'block' : 'blocks'), 'Show fewer', function (open) {
      hidden.forEach(function (r) { r.hidden = !open; if (open) reveal(r); });
      railEnds(rows);
    }));
    railEnds(rows);
    return box;
  }
  // The rail runs from the first chip shown to the last.
  function railEnds(box) {
    var rows = Array.prototype.filter.call(box.children, function (n) { return n.classList && n.classList.contains('cv-ev'); });
    var shown = rows.filter(function (n) { return !n.hidden; });
    rows.forEach(function (n) { n.classList.remove('is-first', 'is-last'); });
    if (shown.length) { shown[0].classList.add('is-first'); shown[shown.length - 1].classList.add('is-last'); }
  }

  function reveal(n) {
    if (reduced() || !n.animate) return;
    try { n.animate([{ opacity: 0.45, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); } catch (e) {}
  }
  function moreButton(label, lessLabel, onToggle) {
    var b = mk('button', 'cv-more');
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    var txt = mk('span', null, label);
    b.appendChild(txt);
    b.insertAdjacentHTML('beforeend', svg('down', 2.2));
    b.addEventListener('click', function () {
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
      txt.textContent = open ? lessLabel : label;
      onToggle(open);
    });
    return b;
  }

  // A year's PRs: one row per lift (how many, the best e1RM reached, the gain on the year before),
  // then every PR on request, newest first, one line each.
  function recordsNode(Y, prs, o) {
    var box = mk('div', 'ui-list cv-recs');
    var rows = mk('div', 'cv-rows');
    rows.setAttribute('role', 'list');
    box.appendChild(rows);
    var recs = yearRecords(prs);
    recs.forEach(function (r) {
      var row = mk('div', 'cv-rec lift-' + r.lift);
      row.setAttribute('role', 'listitem');
      var dc = mk('span', 'cv-dotc');
      dc.setAttribute('aria-hidden', 'true');
      dc.appendChild(mk('i', 'lift-dot lift-' + r.lift));
      row.appendChild(dc);
      row.appendChild(mk('span', 'cv-t', LIFT_NAME[r.lift]));
      if (r.best != null) { var v = mk('span', 'cv-v'); v.innerHTML = '<b>' + esc(group3(r.best)) + '</b><small>' + esc(r.unit) + '</small>'; row.appendChild(v); }
      // '14 PRs · +34 kg this year' (the value is the year's best e1RM), or the one day it happened.
      var sub = r.count === 1 ? 'PR on ' + dayText(r.latest) : plural(r.count, 'PR') + (r.gain && r.gain !== '±0' ? ' · ' + r.gain + ' ' + r.unit + ' this year' : '');
      row.appendChild(mk('span', 'cv-d', sub));
      rows.appendChild(row);
    });
    // Every PR, one line each: the date, the lift and what it was.
    if (prs.length > recs.length) {
      var all = mk('div', 'cv-prs');
      all.setAttribute('role', 'list');
      all.setAttribute('aria-label', 'Every PR in ' + Y.year);
      all.hidden = true;
      // One line each, on the year's grid: the lift's dot, its name and what it was, the date.
      prs.forEach(function (e) {
        var line = mk('div', 'cv-pr');
        line.setAttribute('role', 'listitem');
        var dc = mk('span', 'cv-dotc');
        dc.setAttribute('aria-hidden', 'true');
        dc.appendChild(mk('i', 'lift-dot lift-' + e.lift));
        line.appendChild(dc);
        // Each record holds together on a line ('162.5 × 5' never splits): no-break spaces inside it.
        var parts = [];
        if (e.e1) parts.push('e1RM\u00a0' + group3(e.e1.value) + '\u00a0(' + e.e1.gain + ')');
        (e.reps || []).forEach(function (r) { parts.push(group3(r.value) + '\u00a0×\u00a0' + r.n); });
        var t = mk('span', 'cv-pt');
        t.appendChild(mk('b', null, LIFT_NAME[e.lift]));
        t.appendChild(document.createTextNode(' ' + parts.join(' · ')));
        line.appendChild(t);
        var d = mk('time', 'cv-pd', dayText(e.date));
        d.setAttribute('datetime', e.date);
        line.appendChild(d);
        all.appendChild(line);
      });
      box.appendChild(all);
      box.appendChild(moreButton('Show all ' + prs.length + ' PRs', 'Show fewer', function (open) {
        all.hidden = !open;
        if (open) Array.prototype.forEach.call(all.children, function (c) { reveal(c); });
      }));
    }
    return box;
  }

  function yearSummary(Y) {
    var c = Y.counts;
    return [c.meet ? plural(c.meet, 'meet') : null, c.pr ? plural(c.pr, 'PR') : null].filter(Boolean).join(' · ');
  }
  function yearNode(Y, o) {
    var wrap = mk('div', 'cv-year');
    wrap.setAttribute('data-year', String(Y.year));
    var head = mk('div', 'cv-yh');
    head.appendChild(mk('h3', 'cv-yt', String(Y.year)));
    var sum = yearSummary(Y);
    if (sum) head.appendChild(mk('span', 'cv-ys', sum));
    wrap.appendChild(head);
    var moments = Y.events.filter(function (e) { return e.kind !== 'pr'; });
    var prs = Y.events.filter(function (e) { return e.kind === 'pr'; });
    if (moments.length) wrap.appendChild(momentsNode(moments, o));
    if (prs.length) wrap.appendChild(recordsNode(Y, prs, o));
    if (!moments.length) wrap.classList.add('no-moments');
    if (!prs.length) wrap.classList.add('no-records');
    return wrap;
  }

  function emptyNode(o) {
    var e = mk('div', 'ui-empty cv-empty');
    var ic = mk('div', 'ui-empty-icon');
    ic.innerHTML = svg('steps');
    e.appendChild(ic);
    e.appendChild(mk('h3', null, o.coach ? 'No career yet' : 'Your career starts here'));
    e.appendChild(mk('p', null, o.coach
      ? 'Once ' + (firstName(o.name) || 'they') + ' logs sessions or brings in meets, every PR, meet and block lands here.'
      : 'Every PR, meet and block lands here as you log. Meets you’ve already lifted come in from OpenPowerlifting.'));
    if (!o.coach && typeof o.onBringMeets === 'function') {
      var b = mk('button', 'ui-btn-soft cv-empty-btn', 'Bring in your meets');
      b.type = 'button';
      b.addEventListener('click', o.onBringMeets);
      e.appendChild(b);
    }
    return e;
  }

  // Career.render(host, athleteId, opts): the whole career into host. opts: { store, today, unit, desk,
  // coach (read by a coach: their words), name, onBringMeets }. Returns the model.
  function render(host, athleteId, opts) {
    opts = opts || {};
    var store = opts.store || (typeof Store !== 'undefined' ? Store.get() : {});
    var C = careerEvents(athleteId, store, { today: opts.today, unit: opts.unit });
    host.innerHTML = '';
    var root = mk('div', 'cv-root' + (opts.desk ? ' is-desk' : ''));
    if (!C.years.length) { root.appendChild(emptyNode(opts)); host.appendChild(root); return C; }
    root.appendChild(heroNode(C, opts));
    var yrs = C.years, keep = 4;
    yrs.slice(0, keep).forEach(function (Y) { root.appendChild(yearNode(Y, opts)); });
    // A long career: the oldest years wait behind one quiet button.
    if (yrs.length > keep) {
      var older = mk('div', 'cv-older');
      older.hidden = true;
      yrs.slice(keep).forEach(function (Y) { older.appendChild(yearNode(Y, opts)); });
      var first = yrs[yrs.length - 1].year, last = yrs[keep].year;
      var b = moreButton('Earlier years · ' + first + (first !== last ? ' to ' + last : ''), 'Hide earlier years', function (open) { older.hidden = !open; if (open) reveal(older); });
      b.classList.add('cv-older-btn');
      root.appendChild(b);
      root.appendChild(older);
    }
    host.appendChild(root);
    return C;
  }

  // ---------- the coach's way in (coach-lifters.js): a sheet on the phone, a panel on the desk ----------
  function athleteOf(id) {
    var s = typeof Store !== 'undefined' ? Store.get() : {};
    return (s.athletes || []).find(function (a) { return a.id === id; }) || null;
  }
  function openSheet(athleteId, a) {
    a = a || athleteOf(athleteId) || { id: athleteId, name: '' };
    if (typeof uiSheet !== 'function') return;
    uiSheet('Career', function (sheet) {
      if (a.name) sheet.appendChild(mk('p', 'ui-sheet-sub', a.name));   // the hero says since when
      var box = mk('div', 'cv-sheet-body');
      sheet.appendChild(box);
      render(box, athleteId, { coach: true, name: a.name });
    }, { cls: 'cv-sheet' });
  }
  function openPanel(athleteId, a) {
    a = a || athleteOf(athleteId) || { id: athleteId, name: '' };
    var old = document.querySelector('.cv-veil');
    if (old && old._close) old._close();
    var opener = document.activeElement;   // focus goes back there when the panel closes
    var veil = mk('div', 'dk-veil cv-veil');
    var box = mk('div', 'dk-modal cv-modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', (a.name ? a.name + '’s career' : 'Career'));
    box.tabIndex = -1;
    var head = mk('div', 'cv-mh');
    var hue = typeof avatarHue === 'function' ? avatarHue(a.name || '?') : 0;
    var av = mk('span', 'ui-av av-h' + hue);
    av.setAttribute('aria-hidden', 'true');
    if (a.avatarUrl) { var img = document.createElement('img'); img.src = a.avatarUrl; img.alt = ''; av.appendChild(img); }
    else { av.textContent = typeof initials === 'function' ? initials(a.name || '?') : String(a.name || '?').slice(0, 2).toUpperCase(); av.setAttribute('data-name', a.name || '?'); }
    head.appendChild(av);
    var id = mk('div', 'cv-mid');
    id.appendChild(mk('h2', 'cv-mt', a.name ? a.name : 'Career'));
    id.appendChild(mk('p', 'cv-ms', 'Career'));   // the hero says since when
    head.appendChild(id);
    var x = mk('button', 'dk-icon-btn cv-x-btn');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = svg('x', 2);
    head.appendChild(x);
    box.appendChild(head);
    var body = mk('div', 'cv-mbody');
    box.appendChild(body);
    render(body, athleteId, { coach: true, desk: true, name: a.name });
    veil.appendChild(box);
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }
    function close() {
      document.removeEventListener('keydown', onKey, true);
      veil.remove();
      if (opener && opener.isConnected && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
    }
    veil._close = close;
    x.addEventListener('click', close);
    veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(veil);
    try { box.focus({ preventScroll: true }); } catch (e) { box.focus(); }
  }
  function openForCoach(athleteId, a) {
    var desk = typeof isDesk === 'function' ? isDesk() : document.documentElement.classList.contains('desk');
    if (desk) openPanel(athleteId, a); else openSheet(athleteId, a);
  }

  Career.render = render;
  Career.openSheet = openSheet;
  Career.openPanel = openPanel;
  Career.openForCoach = openForCoach;
  Career.icon = function () { return svg('steps', 2); };
})();
