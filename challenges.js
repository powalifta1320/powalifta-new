/* =====================================================================
   challenges.js — coach challenges (2026-10-28)

   A coach sets their own lifters (all of them, or one team) a challenge for a month or four
   weeks: most sessions, most PRs, the biggest gain on their total, or training as written.
   It has its own board in Club (desk and phone), each row a place, a face, a name and the
   value in the challenge's words; the lifter sees where they stand ("you're 3rd of 12") and
   the board, names and values only: never anyone's logs or program. Clubs are untouched.

   Pure (unit-tested, tests.html "coach challenges (challenges.js)"):
     challengeValue(metric, logs, { from, to, today, program, baseline }) → number | null
     challengeBaseline(logs, from) → the best e1RM total in the 8 weeks before (gain's baseline)
     rankChallenge(entries) → [{ …entry, rank }] (competition ranking, ties share a place)
     challengeText(metric, value, unit) → '14 sessions', '3 PRs', '+6.2%', '92% as written'
     challengeWindow(kind, today), challengeName(metric, from, to), challengeState(ch, today),
     challengeWhen(ch, today), challengeEntry(ch, athlete, logs, program, prev, today), ordinal(n)

   Data: sql/migration-coach-challenges-2026-10-28.sql (coach_challenges + challenge_entries)
   through db.js's "COACH CHALLENGES hook". Until it runs, a coach's challenges stay on their
   laptop / phone (localStorage) and lifters see none. ?demo=1 never touches the network.
   Who writes entries: the lifter's app after a logged set (debounced) and when Club opens; the
   coach's app for every member when it loads (it reads their logs). gain's baseline is taken at
   the first write and never moves (a trigger pins it on the server too).
   ===================================================================== */
var Challenges = (function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var hasDom = typeof document !== 'undefined' && !!(document && document.createElement);

  var METRICS = {
    sessions: { label: 'Most sessions', name: 'most sessions', explain: 'Days trained while it runs' },
    prs: { label: 'Most PRs', name: 'most PRs', explain: 'Sets that beat their best e1RM' },
    gain: { label: 'Biggest gain', name: 'biggest gain', explain: 'Their total against the 8 weeks before' },
    asWritten: { label: 'As written', name: 'training as written', explain: 'Sessions done of the ones you wrote' }
  };
  var KEYS = ['sessions', 'prs', 'gain', 'asWritten'];
  var MAIN = ['squat', 'bench', 'deadlift'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var BASE_DAYS = 56, MAX_DAYS = 92, NAME_MAX = 60;

  // ------------------------------------------------------------ dates (UTC noon: no DST surprises)
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function iso(d) { var s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
  function addDays(day, n) { var d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
  function monthEnd(day) { var d = new Date(day.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); }
  function shortDate(day) { return MONTHS[Number(day.slice(5, 7)) - 1].slice(0, 3) + ' ' + Number(day.slice(8, 10)); }
  function ordinal(n) { var v = n % 100; return n + ((v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')); }

  // ------------------------------------------------------------ pure: the values
  // The last day that counts: the challenge's end, or today while it runs, or the day the coach ended it.
  function lastDay(o) {
    var to = iso(o.to), today = iso(o.today) || to;
    return to && today && today < to ? today : to;
  }
  function trainingDays(logs, from, end) {
    var seen = {}, n = 0;
    (logs || []).forEach(function (l) { var d = l && iso(l.date); if (d && d >= from && d <= end && !seen[d]) { seen[d] = 1; n++; } });
    return n;
  }
  // The best competition-equivalent e1RM of each main lift between two days (inclusive): { squat: kg, … }.
  function bestBy(logs, from, end) {
    var out = {};
    (logs || []).forEach(function (l) {
      var d = l && iso(l.date);
      if (!d || d < from || d > end || MAIN.indexOf(l.lift) < 0) return;
      var e = num(l.e1rmComp);
      if (e > (out[l.lift] || 0)) out[l.lift] = e;
    });
    return out;
  }
  // gain's baseline: the best e1RM total in the 8 weeks before the start (all three lifts), or null.
  function challengeBaseline(logs, from) {
    var f = iso(from);
    if (!f) return null;
    var b = bestBy(logs, addDays(f, -BASE_DAYS), addDays(f, -1));
    return MAIN.every(function (l) { return b[l] > 0; }) ? b.squat + b.bench + b.deadlift : null;
  }
  // Sets that beat every earlier e1RM of their lift (isPRForLog's rule: by date, then id; a lift's
  // first set beats nothing), main lifts, counted in the window.
  function prCount(logs, from, end) {
    var n = 0;
    MAIN.forEach(function (lift) {
      var mine = (logs || []).filter(function (l) { return l && l.lift === lift && iso(l.date); })
        .sort(function (a, b) { return iso(a.date) < iso(b.date) ? -1 : iso(a.date) > iso(b.date) ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0; });
      var best = -Infinity, seen = 0;
      mine.forEach(function (l) {
        var e = num(l.e1rmComp), d = iso(l.date);
        if (seen && e > best + 0.05 && d >= from && d <= end) n++;
        if (e > best) best = e;
        seen++;
      });
    });
    return n;
  }
  // A program's sessions a week (app.js programWeekState's count): the days with sets in the week
  // being trained (the first with a set still to do), else the last.
  function sessionsPerWeek(program) {
    var weeks = (program && program.weeks) || [];
    if (!weeks.length) return 0;
    var work = function (w) { return ((w && w.days) || []).filter(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).length; }); }); };
    var idx = -1;
    for (var i = 0; i < weeks.length && idx < 0; i++) if (work(weeks[i]).some(function (d) { return d.exercises.some(function (e) { return e.sets.some(function (s) { return !s.completed; }); }); })) idx = i;
    if (idx < 0) idx = weeks.length - 1;
    return work(weeks[idx]).length || work(weeks[0]).length;
  }
  // The metric's value for one lifter: sessions (days trained), prs (PR sets), gain (% on the
  // baseline, each lift the better of its best before and its best in the window: training light
  // never reads as a loss), asWritten (sessions done of the whole sessions planned so far, to 100%).
  // o: { from, to, today, program (asWritten), baseline (gain: the one kept at the first write) }
  // → number (sessions, prs: 0 and up) | null (gain without a baseline, asWritten without a plan yet)
  function challengeValue(metric, logs, o) {
    o = o || {};
    var from = iso(o.from), end = lastDay(o);
    var counts = metric === 'sessions' || metric === 'prs';
    if (!from || !end || end < from) return counts ? 0 : null;
    if (metric === 'sessions') return trainingDays(logs, from, end);
    if (metric === 'prs') return prCount(logs, from, end);
    if (metric === 'gain') {
      var base = num(o.baseline) > 0 ? num(o.baseline) : challengeBaseline(logs, from);
      if (!(base > 0)) return null;
      var pre = bestBy(logs, addDays(from, -BASE_DAYS), addDays(from, -1)), win = bestBy(logs, from, end), total = 0;
      for (var i = 0; i < MAIN.length; i++) {
        var v = Math.max(pre[MAIN[i]] || 0, win[MAIN[i]] || 0);
        if (!(v > 0)) return null;
        total += v;
      }
      return Math.round((total - base) / base * 1000) / 10;
    }
    if (metric === 'asWritten') {
      var spw = sessionsPerWeek(o.program);
      if (!(spw > 0)) return null;
      var planned = Math.floor(spw * (daysBetween(from, end) + 1) / 7);
      if (!(planned > 0)) return null;
      return Math.min(100, Math.round(trainingDays(logs, from, end) / planned * 100));
    }
    return null;
  }
  // Competition ranking ("1224"): best first; a tie shares a place and the next place skips; a tie is
  // listed by name; no value (null) goes last, with no place.
  function rankChallenge(entries) {
    var list = (entries || []).filter(Boolean).map(function (e) { return Object.assign({}, e); });
    var has = function (e) { return e.value != null && isFinite(Number(e.value)); };
    list.sort(function (a, b) {
      if (has(a) !== has(b)) return has(a) ? -1 : 1;
      if (has(a) && Number(b.value) !== Number(a.value)) return Number(b.value) - Number(a.value);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    var place = 0, last = null;
    list.forEach(function (e, i) {
      if (!has(e)) { e.rank = null; return; }
      if (last == null || Math.abs(Number(e.value) - last) > 1e-9) { place = i + 1; last = Number(e.value); }
      e.rank = place;
    });
    return list;
  }
  // The value in the challenge's words. unit: the viewer's ('kg' | 'lbs'): the four metrics carry no
  // load, so it only matters to a metric that would.
  function challengeText(metric, value, unit) {
    void unit;
    if (value == null || !isFinite(Number(value)) || !METRICS[metric]) return '–';
    var v = Number(value);
    if (metric === 'sessions') return v + (v === 1 ? ' session' : ' sessions');
    if (metric === 'prs') return v + (v === 1 ? ' PR' : ' PRs');
    if (metric === 'gain') return v === 0 ? '0%' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';
    return Math.round(v) + '% as written';
  }

  // ------------------------------------------------------------ pure: windows, names, states
  // 'month': the rest of this month, or next month when a week or less is left; '4weeks': 28 days
  // from today. → { from, to, label }
  function challengeWindow(kind, today) {
    var t = iso(today);
    if (kind === '4weeks') return { from: t, to: addDays(t, 27), label: '4 weeks' };
    var end = monthEnd(t);
    if (daysBetween(t, end) + 1 >= 8) return { from: t, to: end, label: 'This month' };
    var next = addDays(end, 1);
    return { from: next, to: monthEnd(next), label: MONTHS[Number(next.slice(5, 7)) - 1] };
  }
  // "November: most sessions": named for the month most of it falls in.
  function challengeName(metric, from, to) {
    var f = iso(from), t = iso(to) || f;
    var mid = addDays(f, Math.floor(daysBetween(f, t) / 2));
    return MONTHS[Number(mid.slice(5, 7)) - 1] + ': ' + (METRICS[metric] || METRICS.sessions).name;
  }
  function endDay(ch) {
    var e = iso(ch && ch.endsOn), x = iso(ch && ch.endedAt);
    return x && (!e || x < e) ? x : e;
  }
  // 'upcoming' | 'running' | 'ended' (the coach ended it, or its last day has gone).
  function challengeState(ch, today) {
    var t = iso(today);
    if (!ch) return 'ended';
    if (ch.endedAt || t > iso(ch.endsOn)) return 'ended';
    if (t < iso(ch.startsOn)) return 'upcoming';
    return 'running';
  }
  // "12 days left", "Ends today", "Starts tomorrow", "Ended Nov 28".
  function challengeWhen(ch, today) {
    var t = iso(today), st = challengeState(ch, t);
    if (st === 'upcoming') { var s = daysBetween(t, iso(ch.startsOn)); return s === 1 ? 'Starts tomorrow' : 'Starts in ' + s + ' days'; }
    if (st === 'running') { var left = daysBetween(t, iso(ch.endsOn)) + 1; return left <= 1 ? 'Ends today' : left + ' days left'; }
    return 'Ended ' + shortDate(endDay(ch));
  }
  // One lifter's row: the value now (counted to the end, or to the day the coach ended it); gain's
  // baseline is the first write's, kept. → { challengeId, athleteId, name, value, baseline }
  function challengeEntry(ch, athlete, logs, program, prev, today) {
    var base = null;
    if (ch.metric === 'gain') base = prev && num(prev.baseline) > 0 ? num(prev.baseline) : challengeBaseline(logs, ch.startsOn);
    var value = challengeValue(ch.metric, logs, { from: ch.startsOn, to: endDay(ch), today: today, program: program, baseline: base });
    return { challengeId: ch.id, athleteId: athlete.id, name: String((athlete && athlete.name) || 'Lifter').trim().slice(0, NAME_MAX) || 'Lifter',
      value: value, baseline: base };
  }

  var pure = { METRICS: METRICS, KEYS: KEYS, MAX_DAYS: MAX_DAYS, challengeValue: challengeValue, challengeBaseline: challengeBaseline, rankChallenge: rankChallenge,
    challengeText: challengeText, challengeWindow: challengeWindow, challengeName: challengeName, challengeState: challengeState, challengeWhen: challengeWhen,
    challengeEntry: challengeEntry, ordinal: ordinal, sessionsPerWeek: sessionsPerWeek, addDays: addDays, daysBetween: daysBetween };
  Object.assign(root, { challengeValue: challengeValue, rankChallenge: rankChallenge, challengeText: challengeText });
  return Object.assign({ pure: pure }, pure);
})();
(typeof window !== 'undefined' ? window : globalThis).Challenges = Challenges;
