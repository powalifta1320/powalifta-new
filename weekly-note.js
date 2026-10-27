/* weekly-note.js: the coach's writing tools (2026-10-27).
   1. The week's note: weeklyNoteDraft(athleteId, opts) drafts a short note in the coach's voice from the
      lifter's last 7 days (sessions done against planned, top sets written against felt, the e1RM over 4
      weeks when it moved, pain they reported with a question, PRs, bodyweight against the class with a meet
      8 weeks out or closer, next week's change when one was applied). Pure over the Store and opts: no
      clock, no randomness, and every number comes from their log. Laptop: Today's "Weekly notes" opens a
      queue (draft on the left, their week on the right, Send → the next lifter). Phone: a lifter's page has
      "Write the week's note" → a sheet.
   2. Saved replies: per coach (localStorage 'powa-saved-replies-<coachId>', four defaults), tapped into
      any composer; "Save this as a reply" keeps the current text.
   3. Message everyone (or a team) from the phone's Messages tab, one thread per lifter.
   Sends go through desk.js dkSendMessage (the demo writes the Store only). Unit-tested: tests.html
   "weekly note (weekly-note.js)". */
(function () {
  'use strict';
  var MAIN = ['squat', 'bench', 'deadlift'];
  var LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var LIFT_NOUN = { squat: 'squats', bench: 'bench', deadlift: 'deadlifts' };
  var LIFT_CLS = { squat: 'l-sq', bench: 'l-be', deadlift: 'l-dl' };
  var KG_PER_LB = 0.45359237;
  var GAP_DAYS = 6;        // a note covers the week: the lifter is due again on the seventh day after it
  var NOTABLE_KG = 5;      // an e1RM move under this (or under 1.5% of the total) isn't news
  var MAX_LINES = 6, MIN_LINES = 3;
  var DEFAULT_REPLIES = [
    'Great week. Keep the bar speed honest on the top sets.',
    'Deload week: all loads −10%, RPE caps at 7.',
    'Meet day: weigh-in, warm-ups by flight, opener as planned. Message me after each attempt.',
    'How did that feel? Send me the top set if you can.'
  ];
  var MAX_REPLIES = 30, MAX_REPLY_LEN = 600;

  /* ---------------------------------------------------------------- small pure helpers */
  function d10(v) { return String(v == null ? '' : v).slice(0, 10); }
  function addDays(iso, n) { var d = new Date(d10(iso) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(d10(b) + 'T12:00:00Z') - Date.parse(d10(a) + 'T12:00:00Z')) / 86400000); }
  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function n1(v) { return Math.round(Number(v) * 10) / 10; }
  function rpeTxt(v) { return String(Math.round(Number(v) * 100) / 100); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function listJoin(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function storeOf() { return typeof Store !== 'undefined' && Store.get ? Store.get() : {}; }
  // A weight in the unit the note is written in: "117.5", "259" (lbs keep one decimal only when it isn't .0).
  function inUnit(kg, unit) { var v = unit === 'lbs' ? Number(kg) / KG_PER_LB : Number(kg); return Math.round(v * 10) / 10; }
  function wTxt(kg, unit) { return String(inUnit(kg, unit)); }
  function uTxt(unit) { return unit === 'lbs' ? 'lbs' : 'kg'; }
  function whenMeet(days) { if (days <= 0) return 'today'; if (days === 1) return 'tomorrow'; if (days < 21) return 'in ' + days + ' days'; return 'in ' + Math.round(days / 7) + ' weeks'; }
  function isComp(v) { return !v || /^competition$/i.test(String(v)); }
  function exTitle(ex) { var t = typeof _exShortTitle === 'function' ? _exShortTitle(ex) : (LIFT[ex && ex.lift] || 'Lift'); return cap(String(t).toLowerCase()); }
  function partPhrase(part, side) {
    var P = { neck: 'neck', shoulder: 'shoulder', chest: 'chest', upper_back: 'upper back', elbow: 'elbow', wrist: 'wrist', low_back: 'low back', hip: 'hip', knee: 'knee', ankle: 'ankle' };
    var p = P[part];
    if (!p) return null;
    if (side === 'left' || side === 'right') return 'your ' + side + ' ' + p;
    if (side === 'both') return 'both ' + (p === 'knee' ? 'knees' : p === 'hip' ? 'hips' : p + 's');
    return 'your ' + p;
  }
  function liftNoun(lift) { if (!lift) return ''; return LIFT_NOUN[lift] || String(typeof painLiftLabel === 'function' ? painLiftLabel(lift) : lift).toLowerCase(); }

  /* ---------------------------------------------------------------- the week, as data */
  // Everything the note and the laptop's week panel say, from the Store. opts: { today, unit, applied,
  // coachId }. → { athlete, first, unit, today, since, program, week, sessions: { done, planned, days },
  //   tops: [{ lift, name, kg, reps, felt, wrote, wroteLo, d, date }], prs: [{ lift, kg, reps, date }],
  //   e1rm: { now, delta, weeks, notable } | null, pain: {...} | null, bw: {...} | null,
  //   meetNoWeighIn: { name, days } | null, next: [changes], words: { text, when, kind } | null, nextDay }
  function weeklyNoteFacts(athleteId, opts) {
    opts = opts || {};
    var s = storeOf(), t = opts.today || todayIso(), since = addDays(t, -6);
    var inWin = function (d) { d = d10(d); return d >= since && d <= t; };
    var a = (s.athletes || []).filter(function (x) { return x.id === athleteId; })[0] || { id: athleteId, name: '' };
    var unit = opts.unit || a.unit || (typeof getUnit === 'function' ? getUnit() : 'kg');
    var prog = (s.programs || []).filter(function (p) { return p.athleteId === athleteId; })[0] || null;
    var logs = (s.workoutLogs || []).filter(function (l) { return l.athleteId === athleteId && l.date; });
    var wl = logs.filter(function (l) { return inWin(l.date); });
    var setsWin = prog && typeof programLoggedSets === 'function' ? programLoggedSets(prog).filter(function (x) { return x.date && inWin(x.date); }) : [];
    // Sessions: the days they logged (the program's own dates only when the log has none).
    var dayMap = {};
    (wl.length ? wl.map(function (l) { return d10(l.date); }) : setsWin.map(function (x) { return x.date; })).forEach(function (d) { dayMap[d] = 1; });
    var days = Object.keys(dayMap).sort();
    var wk = prog && typeof programWeekState === 'function' ? programWeekState(prog) : null;
    var planned = wk ? (wk.sessionsPerWeek || 0) : 0;
    // Top sets: the heaviest set of each main lift (competition first), with what was written for it.
    var by = {};
    setsWin.forEach(function (x) {
      var ex = x.ex || {}, st = x.set || {};
      if (MAIN.indexOf(ex.lift) < 0 || st.attempt) return;
      var kg = Number(st.weight) || 0;
      if (!(kg > 0)) return;
      var felt = st.actualRpe != null && st.actualRpe !== '' && isFinite(Number(st.actualRpe)) ? Number(st.actualRpe) : null;
      var c = { lift: ex.lift, comp: isComp(ex.variant), kg: kg, reps: Number(st.reps) || Number(st.plannedReps) || 0, felt: felt, set: st, ex: ex, date: x.date };
      var cur = by[ex.lift];
      if (!cur || (c.comp && !cur.comp) || (c.comp === cur.comp && (c.kg > cur.kg || (c.kg === cur.kg && (c.felt || 0) > (cur.felt || 0))))) by[ex.lift] = c;
    });
    var tops = [];
    MAIN.forEach(function (L) {
      var c = by[L];
      if (c) {
        var st = c.set, rir = !!st.rir;
        var lo = !rir && st.rpe != null && st.rpe !== '' && isFinite(Number(st.rpe)) ? Number(st.rpe) : null;
        var hi = lo != null && st.rpeHi != null && Number(st.rpeHi) > lo ? Number(st.rpeHi) : null;
        var felt = rir ? null : c.felt, d = null;
        if (felt != null && lo != null) d = n1(felt > (hi != null ? hi : lo) ? felt - (hi != null ? hi : lo) : felt < lo ? felt - lo : 0);
        tops.push({ lift: L, name: c.comp ? LIFT[L] : exTitle(c.ex), kg: c.kg, reps: c.reps, felt: felt, wrote: hi != null ? hi : lo, wroteLo: lo, wroteHi: hi, d: d, date: c.date, planned: true });
        return;
      }
      // Logged outside the program: the heaviest set they logged, how it felt (nothing was written for it).
      var ls = wl.filter(function (l) { return l.lift === L && Number(l.weight) > 0; })
        .sort(function (x, y) { return (isComp(y.variant) ? 1 : 0) - (isComp(x.variant) ? 1 : 0) || Number(y.weight) - Number(x.weight) || (Number(y.rpe) || 0) - (Number(x.rpe) || 0); })[0];
      if (ls) tops.push({ lift: L, name: isComp(ls.variant) ? LIFT[L] : cap(String(ls.variant + ' ' + LIFT[L]).toLowerCase()), kg: Number(ls.weight), reps: Number(ls.reps) || 0,
        felt: ls.rpe != null && ls.rpe !== '' && isFinite(Number(ls.rpe)) ? Number(ls.rpe) : null, wrote: null, wroteLo: null, wroteHi: null, d: null, date: d10(ls.date), planned: false });
    });
    // PRs: a competition lift whose e1RM beat everything before it, the best of each lift this week.
    var prs = [];
    if (typeof isPRForLog === 'function') {
      var best = {};
      wl.forEach(function (l) {
        if (MAIN.indexOf(l.lift) < 0 || !isComp(l.variant) || !(Number(l.e1rmComp) > 0) || !(Number(l.weight) > 0)) return;
        if (!isPRForLog(athleteId, l)) return;
        if (!best[l.lift] || Number(l.e1rmComp) > Number(best[l.lift].e1rmComp)) best[l.lift] = l;
      });
      MAIN.forEach(function (L) { var l = best[L]; if (l) prs.push({ lift: L, kg: Number(l.weight), reps: Number(l.reps) || 0, date: d10(l.date) }); });
    }
    // The e1RM total over the last weeks (the same number the Lifters page shows).
    var e1rm = null;
    var tr = typeof deskTotalTrend === 'function' ? deskTotalTrend(athleteId, t) : null;
    if (tr && tr.values && tr.values.length >= 2 && tr.delta != null) {
      var now = tr.values[tr.values.length - 1];
      e1rm = { now: now, delta: tr.delta, weeks: Math.min(4, tr.values.length - 1), notable: Math.abs(tr.delta) >= Math.max(NOTABLE_KG, now * 0.015) };
    }
    // Pain: the worst open report this week, how often that part hurt; else a yes on a pain check-in.
    var pain = null;
    var reps = (s.painReports || []).filter(function (r) { return r.athleteId === athleteId && !r.resolvedAt && inWin(r.day); });
    if (reps.length) {
      var w = reps.slice().sort(function (x, y) { return (Number(y.severity) || 0) - (Number(x.severity) || 0) || d10(y.day).localeCompare(d10(x.day)); })[0];
      pain = { part: w.bodyPart, side: w.side || null, sev: Math.round(Number(w.severity) || 0), lift: w.lift || null, count: reps.filter(function (r) { return r.bodyPart === w.bodyPart; }).length, day: d10(w.day), phase: w.phase || null };
    } else {
      var qs = (s.checkinQuestions || []).filter(function (q) { return q.kind === 'yesno' && /pain|niggle|injur|hurt/i.test(q.prompt || '') && (!opts.coachId || !q.coachId || q.coachId === opts.coachId); });
      if (qs.length && typeof checkinQuestionsFor === 'function') qs = checkinQuestionsFor(qs, athleteId);
      var qid = {}; qs.forEach(function (q) { qid[q.id] = 1; });
      var yes = (s.checkinAnswers || []).filter(function (x) { return qid[x.questionId] && x.athleteId === athleteId && Number(x.num) >= 1 && inWin(x.period); });
      if (yes.length) pain = { checkin: true, count: Object.keys(yes.reduce(function (m, x) { m[d10(x.period)] = 1; return m; }, {})).length, day: yes.map(function (x) { return d10(x.period); }).sort().pop() };
    }
    // Bodyweight against the class of a meet 8 weeks out or closer (a weigh-in this week), or a nudge to weigh in.
    var bw = null, meetNoWeighIn = null;
    var nm = typeof deskNextMeet === 'function' ? deskNextMeet(athleteId, t) : null;
    if (nm && nm.days >= 0 && nm.days <= 56) {
      var vs = typeof deskBodyweightVsClass === 'function' ? deskBodyweightVsClass(athleteId, nm.meet) : null;
      var lastW = (s.bodyweight || []).filter(function (b) { return b.athleteId === athleteId && Number(b.weight) > 0 && d10(b.date) <= t; })
        .sort(function (x, y) { return d10(y.date).localeCompare(d10(x.date)); })[0];
      if (vs && lastW && inWin(lastW.date)) bw = { kg: Number(lastW.weight), cls: vs.cls, over: n1(Number(lastW.weight) - vs.cls), on: d10(lastW.date), meet: nm.meet.name || '', days: nm.days };
      else if (vs || (nm.meet.weightClass && !/\+/.test(nm.meet.weightClass))) meetNoWeighIn = { name: nm.meet.name || '', days: nm.days };
    }
    // Next week, as the coach changed it (recorded when the change was applied), this week only.
    var applied = opts.applied !== undefined ? opts.applied : appliedFor(athleteId, t, opts.coachId);
    var next = (applied || []).filter(function (c) { return c && (Number(c.toKg) > 0 && Number(c.toKg) !== Number(c.fromKg) || c.variant); });
    // Their newest words this week (the laptop shows them beside the draft).
    var words = null;
    var msgs = (s.messages || []).filter(function (m) { return m.athleteId === athleteId && m.senderId === athleteId && m.body && !(m.meta && m.meta.type && m.meta.type !== 'text') && inWin(m.createdAt); })
      .map(function (m) { return { text: String(m.body), when: d10(m.createdAt), at: String(m.createdAt || ''), kind: 'message' }; });
    var notes = (s.sessionNotes || []).filter(function (n) { return n.athleteId === athleteId && n.note && String(n.note).trim() && inWin(n.date); })
      .map(function (n) { return { text: String(n.note), when: d10(n.date), at: d10(n.date) + 'T23:59:59', kind: 'note' }; });
    var all = msgs.concat(notes).sort(function (x, y) { return y.at.localeCompare(x.at); });
    if (all.length) words = all[0];
    // The next session they have to do: the first day of the current week with open sets.
    var nextDay = null;
    if (wk && !wk.finished && prog.weeks && prog.weeks[wk.idx]) {
      var dd = (prog.weeks[wk.idx].days || []).filter(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).some(function (x) { return !x.completed && !x.skipped; }); }); })[0];
      if (dd && dd.name) nextDay = { name: String(dd.name), week: wk.number };
    }
    return { athlete: a, first: firstName(a.name), unit: unit, today: t, since: since, program: prog, week: wk,
      sessions: { done: days.length, planned: planned, days: days }, tops: tops, prs: prs, e1rm: e1rm, pain: pain, bw: bw, meetNoWeighIn: meetNoWeighIn,
      next: next, words: words, nextDay: nextDay };
  }

  /* ---------------------------------------------------------------- the note, line by line */
  // pr: what goes first when there are too many (low = keep); ord: where it sits in the note.
  function weeklyNoteLines(f) {
    var U = f.unit, out = [];
    var add = function (k, pr, ord, text) { if (text) out.push({ k: k, pr: pr, ord: ord, text: text }); };
    var S = f.sessions;
    // 1. Sessions, with their name.
    var sl;
    if (S.planned > 0 && S.done > 0) {
      if (S.done === S.planned) sl = S.planned === 1 ? 'the week’s session is done. Good work.' : 'all ' + S.planned + ' sessions done this week. Good work.';
      else if (S.done > S.planned) sl = S.done + ' sessions this week, ' + (S.done - S.planned) + ' more than planned. Good work.';
      else sl = S.done + ' of ' + S.planned + ' sessions done this week.';
    } else if (S.done > 0) sl = plural(S.done, 'session') + ' logged this week.';
    else sl = 'no sessions logged this week.';
    add('sessions', 0, 0, f.first ? f.first + ', ' + sl : cap(sl));
    if (!S.done) add('quiet', 1, 1, 'Everything OK? Tell me what got in the way and we’ll fit the week around it.');
    else if (S.planned > 0 && S.done < S.planned) add('short', 5, 1, 'If the week is getting tight, tell me and we’ll fit the sessions around it.');
    // 2. PRs.
    if (f.prs.length === 1) add('pr', 3, 2, LIFT[f.prs[0].lift] + ' PR: ' + wTxt(f.prs[0].kg, U) + ' × ' + f.prs[0].reps + '. Well done.');
    else if (f.prs.length === 2) add('pr', 3, 2, LIFT[f.prs[0].lift] + ' and ' + f.prs[1].lift + ' PRs: ' + wTxt(f.prs[0].kg, U) + ' × ' + f.prs[0].reps + ' and ' + wTxt(f.prs[1].kg, U) + ' × ' + f.prs[1].reps + '. Well done.');
    else if (f.prs.length >= 3) add('pr', 3, 2, 'PRs on squat, bench and deadlift. Well done.');
    // 3. Top sets: what felt off what you wrote, one line each; what landed on it, together.
    var setTxt = function (x) { return wTxt(x.kg, U) + ' × ' + x.reps; };
    var off = f.tops.filter(function (x) { return x.d != null && Math.abs(x.d) >= 0.5; }).sort(function (a, b) { return Math.abs(b.d) - Math.abs(a.d); });
    var prSame = function (x) { return f.prs.some(function (p) { return p.lift === x.lift && p.kg === x.kg && p.reps === x.reps; }); };
    var on = f.tops.filter(function (x) { return x.d != null && Math.abs(x.d) < 0.5 && !prSame(x); });
    off.slice(0, 2).forEach(function (x, i) {
      add('off' + i, i ? 5 : 3, 3 + i, x.name + ' ' + setTxt(x) + ' felt @' + rpeTxt(x.felt) + ', written @' + rpeTxt(x.wroteLo) + (x.wroteHi != null ? '–' + rpeTxt(x.wroteHi) : '') + '.');
    });
    if (on.length === 1) add('on', 6, 5, on[0].name + ' ' + setTxt(on[0]) + ' @' + rpeTxt(on[0].felt) + ', right where I wrote it.');
    else if (on.length === 2) add('on', 6, 5, on[0].name + ' ' + setTxt(on[0]) + ' and ' + on[1].name.toLowerCase() + ' ' + setTxt(on[1]) + ' both landed right on the RPE I wrote.');
    else if (on.length >= 3) add('on', 6, 5, 'Squat, bench and deadlift top sets all landed right on the RPE I wrote.');
    if (!off.length && !on.length) {
      var plain = f.tops.filter(function (x) { return !prSame(x); });
      if (plain.length) add('tops', 7, 6, 'Top sets: ' + listJoin(plain.map(function (x) { return x.name.toLowerCase() + ' ' + setTxt(x) + (x.felt != null ? ' @' + rpeTxt(x.felt) : ''); })) + '.');
    }
    // 4. The e1RM, when it moved.
    if (f.e1rm && f.e1rm.notable) {
      var dv = Math.round(Math.abs(f.e1rm.delta) / (U === 'lbs' ? KG_PER_LB : 1));
      if (f.e1rm.delta > 0) add('e1rm', 5, 7, 'Your total e1RM is up ' + dv + ' ' + uTxt(U) + ' in ' + plural(f.e1rm.weeks, 'week') + '.');
      else add('e1rm', 8, 7, 'Your total e1RM is down ' + dv + ' ' + uTxt(U) + ' over ' + plural(f.e1rm.weeks, 'week') + ', so we’ll keep an eye on recovery.');
    }
    // 5. Bodyweight against the class, a meet in sight.
    if (f.bw) {
      var bwT = wTxt(f.bw.kg, U) + ' ' + uTxt(U), clsT = String(n1(f.bw.cls)) + ' kg', meetT = (f.bw.meet ? f.bw.meet : 'your meet') + ' ' + whenMeet(f.bw.days);
      if (f.bw.over > 0) add('bw', 2, 8, 'You weighed in at ' + bwT + ': ' + wTxt(f.bw.over, U) + ' ' + uTxt(U) + ' over the ' + clsT + ' class, with ' + meetT + '.');
      else add('bw', 4, 8, 'You weighed in at ' + bwT + ', on weight for the ' + clsT + ' class with ' + meetT + '.');
    } else if (f.meetNoWeighIn) add('bw', 6, 8, 'Send me a weigh-in this week: ' + (f.meetNoWeighIn.name || 'your meet') + ' is ' + whenMeet(f.meetNoWeighIn.days) + '.');
    // 6. Next week, as you changed it.
    if (f.next.length) {
      var parts = f.next.slice(0, 2).map(function (c) {
        var nm = String(c.title || LIFT[c.lift] || 'the lift').toLowerCase();
        if (c.variant && !(Number(c.toKg) > 0 && Number(c.toKg) !== Number(c.fromKg))) return nm + ' becomes ' + String(c.variant).toLowerCase() + ' ' + (LIFT[c.lift] || '').toLowerCase();
        return nm + (Number(c.toKg) > Number(c.fromKg) ? ' goes up to ' : ' comes down to ') + wTxt(c.toKg, U) + (Number(c.reps) > 0 ? ' × ' + Number(c.reps) : '');
      });
      var more = f.next.length - parts.length;
      add('next', 2, 9, 'Next week, ' + (more > 0 ? parts.join(', ') + ' and ' + plural(more, 'more change') : listJoin(parts)) + '.');
    }
    // 7. Pain, with the question (it goes last: the reply is the point).
    if (f.pain && f.pain.checkin) add('pain', 1, 11, 'You said yes to pain on ' + (f.pain.count >= 2 ? f.pain.count + ' check-ins this week' : 'your check-in') + '. Where is it, and how bad?');
    else if (f.pain) {
      var where = partPhrase(f.pain.part, f.pain.side), noun = liftNoun(f.pain.lift);
      var flagged = where ? 'You flagged ' + where : 'You flagged pain';
      if (f.pain.count >= 2) add('pain', 1, 11, flagged + ' ' + (f.pain.count === 2 ? 'twice' : f.pain.count + ' times') + ' this week, ' + f.pain.sev + '/10 at worst' + (noun ? ' on ' + noun : '') + '. How is it today?');
      else add('pain', 1, 11, flagged + ' at ' + f.pain.sev + '/10' + (noun ? ' on ' + noun : '') + '. How is it today?');
    }
    // Never more than six: the least useful go first. Never fewer than three: what's next (a fact), then an open door.
    out.sort(function (a, b) { return a.pr - b.pr || a.ord - b.ord; });
    out = out.slice(0, MAX_LINES);
    var fill = [];
    if (f.nextDay) fill.push({ k: 'nextday', ord: 10, text: 'Next on your program: ' + f.nextDay.name + '.' });
    else if (f.week && f.week.finished) fill.push({ k: 'blockdone', ord: 10, text: 'That’s every set of the block logged.' });
    fill.push({ k: 'door', ord: 12, text: 'Message me if anything feels off.' });
    fill.push({ k: 'reply', ord: 13, text: 'Reply here if you want anything changed for next week.' });
    while (out.length < MIN_LINES && fill.length) out.push(fill.shift());
    out.sort(function (a, b) { return a.ord - b.ord; });
    return out;
  }
  // The note as text, 3 to 6 lines. opts: { today, unit, applied, coachId, facts }.
  function weeklyNoteDraft(athleteId, opts) {
    opts = opts || {};
    var f = opts.facts || weeklyNoteFacts(athleteId, opts);
    return weeklyNoteLines(f).map(function (l) { return l.text; }).join('\n');
  }

  /* ---------------------------------------------------------------- who is due a note */
  // Local records: the demo keeps them in memory (nothing is written); a real account per coach in localStorage.
  var MEM = { sent: {}, applied: {}, replies: {} };
  function demo() { return !!(typeof window !== 'undefined' && window._demoMode); }
  function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function readJSON(st, k) { try { var raw = st && st.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
  function writeJSON(st, k, v) { try { if (st) st.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function myId() {
    try { if (typeof _dkUser === 'function') { var u = _dkUser(); if (u && u.id) return u.id; } } catch (e) {}
    return typeof window !== 'undefined' && window._user ? window._user.id : null;
  }
  function recOf(kind, coachId) {
    var cid = coachId || myId() || 'x';
    if (demo()) return MEM[kind][cid] || (MEM[kind][cid] = {});
    return readJSON(ls(), 'powa-' + (kind === 'sent' ? 'weekly-notes' : 'week-changes') + '-' + cid) || {};
  }
  function saveRec(kind, coachId, rec) {
    var cid = coachId || myId() || 'x';
    if (demo()) { MEM[kind][cid] = rec; return; }
    writeJSON(ls(), 'powa-' + (kind === 'sent' ? 'weekly-notes' : 'week-changes') + '-' + cid, rec);
  }
  function markSent(athleteId, onIso, coachId) {
    var rec = recOf('sent', coachId), t = onIso || todayIso();
    Object.keys(rec).forEach(function (k) { if (daysBetween(rec[k], t) > 60) delete rec[k]; });
    rec[athleteId] = t;
    saveRec('sent', coachId, rec);
  }
  // Next week's change, written when the coach applies it (desk.js dkWsApply).
  function noteApplied(athleteId, changes, opts) {
    opts = opts || {};
    var rec = recOf('applied', opts.coachId), t = opts.today || todayIso();
    var clean = (changes || []).filter(Boolean).map(function (c) { return { lift: c.lift || null, title: c.title || '', fromKg: Number(c.fromKg) || 0, toKg: Number(c.toKg) || 0, reps: Number(c.reps) || 0, variant: c.variant || null }; });
    if (!clean.length) return;
    rec[athleteId] = { on: t, week: opts.week || null, changes: clean };
    saveRec('applied', opts.coachId, rec);
  }
  function appliedFor(athleteId, t, coachId) {
    var r = recOf('applied', coachId)[athleteId];
    if (!r || !r.on || daysBetween(r.on, t || todayIso()) > 6 || daysBetween(r.on, t || todayIso()) < 0) return [];
    return r.changes || [];
  }
  // The day of their last weekly note: this device's record, a note in the Store (meta.weekly), or the
  // server's thread digest (threads[id].weeklyAt, real accounts on the laptop).
  function lastNoteOn(athleteId, opts) {
    opts = opts || {};
    var best = recOf('sent', opts.coachId)[athleteId] || null;
    var me = opts.coachId || myId();
    (storeOf().messages || []).forEach(function (m) {
      if (m.athleteId !== athleteId || (me && m.senderId !== me) || !m.meta || !m.meta.weekly) return;
      var d = d10(m.meta.weekly);
      if (!best || d > best) best = d;
    });
    var th = opts.threads && opts.threads[athleteId];
    if (th && th.weeklyAt && (!best || d10(th.weeklyAt) > best)) best = d10(th.weeklyAt);
    return best;
  }
  function trainedThisWeek(athleteId, t) {
    var since = addDays(t, -6);
    return (storeOf().workoutLogs || []).some(function (l) { return l.athleteId === athleteId && d10(l.date) >= since && d10(l.date) <= t; });
  }
  // Lifters who trained in the last 7 days and haven't had a note in the last six. rows: desk rows
  // ({ athlete, reasons }); the worst first (Today's order), then by name.
  function weeklyNoteDue(rows, opts) {
    opts = opts || {};
    var t = opts.today || todayIso();
    return (rows || []).filter(function (r) {
      var id = r && r.athlete && r.athlete.id;
      if (!id || !trainedThisWeek(id, t)) return false;
      var last = lastNoteOn(id, opts);
      return !last || daysBetween(last, t) >= GAP_DAYS;
    }).sort(function (a, b) {
      var ga = a.reasons && a.reasons[0] ? a.reasons[0].group : 99, gb = b.reasons && b.reasons[0] ? b.reasons[0].group : 99;
      return ga - gb || String(a.athlete.name).localeCompare(String(b.athlete.name));
    });
  }
  function sentThisWeek(rows, opts) {
    opts = opts || {};
    var t = opts.today || todayIso();
    return (rows || []).filter(function (r) { var last = lastNoteOn(r.athlete.id, opts); return last && daysBetween(last, t) < GAP_DAYS; });
  }

  /* ---------------------------------------------------------------- saved replies (pure part) */
  function repliesKey(coachId) { return 'powa-saved-replies-' + (coachId || 'x'); }
  function cleanReply(t) { return String(t == null ? '' : t).replace(/\r\n?/g, '\n').trim().slice(0, MAX_REPLY_LEN); }
  // A stored value → the list. Nothing stored = the four defaults; an empty list stays empty.
  function repliesParse(raw) {
    if (raw == null || raw === '') return DEFAULT_REPLIES.slice();
    var v;
    try { v = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return DEFAULT_REPLIES.slice(); }
    if (!Array.isArray(v)) return DEFAULT_REPLIES.slice();
    var seen = {}, out = [];
    v.forEach(function (x) { var c = cleanReply(x), k = c.toLowerCase(); if (c && !seen[k]) { seen[k] = 1; out.push(c); } });
    return out.slice(0, MAX_REPLIES);
  }
  // Newest first; saving one you already have moves it to the top.
  function repliesAdd(list, text) {
    var c = cleanReply(text);
    if (!c) return (list || []).slice();
    return [c].concat((list || []).filter(function (x) { return String(x).toLowerCase() !== c.toLowerCase(); })).slice(0, MAX_REPLIES);
  }
  function repliesRemove(list, text) { var c = cleanReply(text).toLowerCase(); return (list || []).filter(function (x) { return String(x).toLowerCase() !== c; }); }
  // storage: anything with getItem / setItem (localStorage; tests pass a Map-backed one).
  function loadReplies(coachId, storage) {
    if (!storage && demo()) return MEM.replies[coachId || 'x'] ? MEM.replies[coachId || 'x'].slice() : DEFAULT_REPLIES.slice();
    var st = storage || ls(), raw = null;
    try { raw = st ? st.getItem(repliesKey(coachId)) : null; } catch (e) { raw = null; }
    return repliesParse(raw);
  }
  function saveReplies(coachId, list, storage) {
    var clean = repliesParse(JSON.stringify(list || []));
    if (!storage && demo()) { MEM.replies[coachId || 'x'] = clean.slice(); return clean; }
    var st = storage || ls();
    try { if (st) st.setItem(repliesKey(coachId), JSON.stringify(clean)); } catch (e) {}
    return clean;
  }

  /* =====================================================================================
     UI. Everything below draws; the part above is what's tested.
     ===================================================================================== */
  var IC = {
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    save: '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.7-3.1 2.9-5 5.5-5s4.8 1.9 5.5 5"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.8 14.8c1.5.7 2.4 2.3 2.7 4.7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>'; }
  function avHtml(a, cls) { var name = (a && a.name) || '?'; var hue = typeof avatarHue === 'function' ? avatarHue(name) : 0; var ini = typeof initials === 'function' ? initials(name) : name.slice(0, 2).toUpperCase(); return '<span class="ui-av av-h' + hue + (cls ? ' ' + cls : '') + '" data-name="' + esc(name) + '" aria-hidden="true">' + (a && a.avatarUrl ? '<img src="' + esc(a.avatarUrl) + '" alt="">' : esc(ini)) + '</span>'; }
  function isDeskNow() { return typeof isDesk === 'function' ? isDesk() : document.documentElement.classList.contains('desk'); }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function deskRows() { try { if (typeof dkRowsFresh === 'function') { dkRowsFresh(); return (typeof _dk !== 'undefined' && _dk.rows) || []; } } catch (e) {} return []; }
  function threads() { try { return typeof _dk !== 'undefined' ? _dk.threads || null : null; } catch (e) { return null; } }
  function dayWord(iso) {
    var d = daysBetween(iso, todayIso());
    if (d <= 0) return 'today'; if (d === 1) return 'yesterday';
    try { return new Date(d10(iso) + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' }); } catch (e) { return d10(iso); }
  }
  function fireInput(ta) { try { ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} }
  function autosize(ta, max) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, max || 9999) + 'px'; }
  // The one send path: desk.js dkSendMessage (the demo writes the Store only), with the week on it.
  async function sendNote(aid, body, t) {
    if (typeof dkSendMessage !== 'function') return false;
    var ok = await dkSendMessage(aid, body, { weekly: t });
    if (ok) markSent(aid, t);
    return ok;
  }

  /* ---------------------------------------------------------------- Today's entry (laptop) */
  function todayEntryHtml(rows) {
    var due = weeklyNoteDue(rows, { threads: threads() });
    if (due.length) return '<button type="button" class="cl-quiet cl-wn-go" data-wn-queue>' + ic('pen') + 'Weekly notes<b>' + due.length + '</b>' + ic('chev') + '</button>';
    var sent = sentThisWeek(rows, { threads: threads() });
    if (sent.length) return '<span class="cl-wn-done">' + ic('check', 2.4) + 'Weekly notes sent</span>';
    return '';
  }

  /* ---------------------------------------------------------------- the queue (laptop) */
  var Q = null;
  function openQueue(opts) {
    opts = opts || {};
    if (Q) return;
    var rows = opts.rows || weeklyNoteDue(deskRows(), { threads: threads() });
    if (!rows.length) { if (typeof toast === 'function') toast('Everyone who trained has their note this week'); return; }
    var t = todayIso();
    Q = { rows: rows, i: 0, t: t, sent: [], skipped: [], edits: {}, busy: false };
    var veil = document.createElement('div');
    veil.className = 'dk-veil wn-veil';
    var box = document.createElement('div');
    box.className = 'wn-box cl-root';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Weekly notes');
    veil.appendChild(box);
    veil._close = closeQueue;   // the desk closes any open dialog when the window narrows to the phone layout
    document.body.appendChild(veil);
    Q.veil = veil; Q.box = box;
    Q.onKey = function (e) {
      if (document.querySelector('.wn-rmenu')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeQueue(); return; }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); if (Q && Q.i < Q.rows.length) qSend(); }
    };
    document.addEventListener('keydown', Q.onKey, true);
    veil.addEventListener('mousedown', function (e) { if (e.target === veil && Q && Q.i >= Q.rows.length) closeQueue(); });
    qPaint(true);
  }
  function closeQueue() {
    if (!Q) return;
    document.removeEventListener('keydown', Q.onKey, true);
    Q.veil.remove();
    var sent = Q.sent.length;
    Q = null;
    try { if (window.CoachLifters && CoachLifters.refresh) CoachLifters.refresh(); } catch (e) {}
    if (sent && typeof dkPaintRail === 'function') { try { dkPaintRail(); } catch (e) {} }
  }
  function qPaint(first) {
    var box = Q.box, N = Q.rows.length;
    if (Q.i >= N) { qDone(); return; }
    var r = Q.rows[Q.i], a = r.athlete, f = weeklyNoteFacts(a.id, { today: Q.t }), st = r.status || {};
    var draft = Q.edits[a.id] != null ? Q.edits[a.id] : weeklyNoteDraft(a.id, { facts: f });
    var meta = st.program ? esc(st.program.name || 'Program') + (st.week && st.week.total ? ' · week ' + (st.week.idx + 1) + ' of ' + st.week.total : '') : 'No block running';
    box.innerHTML =
      '<div class="wn-grid">' +
        '<div class="wn-write">' +
          '<div class="wn-head"><h2 class="wn-title">Weekly notes</h2><span class="wn-count"><b>' + (Q.i + 1) + '</b> of ' + N + '</span>' +
            qBar(N, Q.i) + '</div>' +
          '<div class="wn-who">' + avHtml(a, 'dk-av wn-av') + '<div class="wn-whot"><h3 class="wn-name">' + esc(a.name) + '</h3><p class="wn-meta">' + meta + '</p></div></div>' +
          '<textarea class="wn-ta" maxlength="2000" spellcheck="true" aria-label="Note to ' + esc(firstName(a.name)) + '"></textarea>' +
          '<div class="wn-actions"><p class="wn-foot">Every number is from their log.</p>' +
            '<button type="button" class="cl-btn quiet" data-skip>Skip</button><button type="button" class="cl-btn red" data-send>Send to ' + esc(firstName(a.name)) + '</button></div>' +
        '</div>' +
        weekPanelHtml(f) +
      '</div>' +
      '<button type="button" class="cl-ibtn wn-x" data-close aria-label="Close weekly notes">' + ic('x') + '</button>';
    var ta = box.querySelector('.wn-ta');
    ta.value = draft;
    ta.addEventListener('input', function () { Q.edits[a.id] = ta.value; });
    box.querySelector('[data-close]').addEventListener('click', closeQueue);
    box.querySelector('[data-skip]').addEventListener('click', qSkip);
    var send = box.querySelector('[data-send]');
    send.addEventListener('click', qSend);
    if (typeof dkTip === 'function') { dkTip(send, 'Send and open the next lifter', _mac() ? '⌘↵' : 'Ctrl ↵'); dkTip(box.querySelector('[data-close]'), 'Close', 'Esc'); }
    var swap = box.querySelectorAll('.wn-who, .wn-ta, .wn-week > *');
    if (!first && !reduced()) swap.forEach(function (n) { if (n.animate) n.animate([{ opacity: 0.45, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); });
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
  }
  // The queue as marks: sent or skipped, this one, still to come (a plain bar past 24 lifters).
  function qBar(N, i) {
    if (N > 24) return '<span class="wn-bar" aria-hidden="true"><i style="width:' + Math.round(i / N * 100) + '%"></i></span>';
    var o = '<span class="wn-marks" aria-hidden="true">';
    for (var k = 0; k < N; k++) o += '<i class="' + (k < i ? 'is-past' : k === i ? 'is-now' : '') + '"></i>';
    return o + '</span>';
  }
  function _mac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ''); }
  async function qSend() {
    if (!Q || Q.busy) return;
    var r = Q.rows[Q.i], ta = Q.box.querySelector('.wn-ta'), body = ta ? ta.value.trim() : '';
    if (!body) { if (ta) ta.focus(); return; }
    Q.busy = true;
    Q.box.querySelectorAll('[data-send], [data-skip]').forEach(function (b) { b.setAttribute('aria-busy', 'true'); });
    var ok = await sendNote(r.athlete.id, body, Q.t);
    if (!Q) return;
    Q.busy = false;
    if (!ok) {
      Q.box.querySelectorAll('[data-send], [data-skip]').forEach(function (b) { b.removeAttribute('aria-busy'); });
      if (typeof toast === 'function') toast('Couldn’t send to ' + firstName(r.athlete.name) + '. Check your connection');
      return;
    }
    Q.sent.push(r);
    delete Q.edits[r.athlete.id];
    Q.i++;
    qPaint(false);
  }
  function qSkip() {
    if (!Q || Q.busy) return;
    Q.skipped.push(Q.rows[Q.i]);
    Q.i++;
    qPaint(false);
  }
  function qDone() {
    var n = Q.sent.length, sk = Q.skipped.slice();
    Q.box.classList.add('is-done');
    Q.box.innerHTML =
      '<button type="button" class="cl-ibtn wn-x" data-close aria-label="Close weekly notes">' + ic('x') + '</button>' +
      '<div class="wn-done" role="status"><span class="wn-done-ic">' + ic('check', 2.4) + '</span>' +
        '<h3 class="wn-done-t">' + (n ? plural(n, 'note') + ' sent' : 'Nothing sent') + '</h3>' +
        '<p class="wn-done-s">' + (n ? 'Each one is in their thread' + (window._demoMode ? ', in the demo only' : '') + '.' : 'Everyone you skipped is still due.') + '</p>' +
        '<div class="wn-done-a">' + (sk.length ? '<button type="button" class="cl-btn quiet" data-again>Back to the ' + (sk.length === 1 ? 'one' : sk.length) + ' you skipped</button>' : '') +
          '<button type="button" class="cl-btn" data-close>Done</button></div></div>';
    Q.box.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeQueue); });
    var again = Q.box.querySelector('[data-again]');
    if (again) again.addEventListener('click', function () { Q.rows = sk; Q.skipped = []; Q.i = 0; Q.box.classList.remove('is-done'); qPaint(false); });
    var done = Q.box.querySelector('.wn-done-a .cl-btn:not(.quiet)');
    if (done) done.focus({ preventScroll: true });
  }
  // Their week, compact: sessions, the top sets against what was written, the total, bodyweight, pain,
  // next week, their last words. Colour only on lift dots and on a status that's a problem.
  function weekPanelHtml(f) {
    var U = f.unit, S = f.sessions, rows = [];
    var dayMarks = '';
    for (var i = 6; i >= 0; i--) {
      var iso = addDays(f.today, -i), on = S.days.indexOf(iso) >= 0, lbl = '';
      try { lbl = new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'narrow' }); } catch (e) {}
      dayMarks += '<span class="wn-day' + (on ? ' on' : '') + (i === 0 ? ' is-today' : '') + '"><i></i><small>' + esc(lbl) + '</small></span>';
    }
    var sessT = '<b>' + S.done + '</b><span>' + (S.planned ? 'of ' + S.planned + ' sessions' : (S.done === 1 ? 'session' : 'sessions')) + '</span>';
    var html = '<aside class="wn-week" aria-label="Their week"><h4 class="wn-wh">Their week</h4>' +
      '<div class="wn-sess"><div class="wn-sess-n">' + sessT + '</div><div class="wn-days" role="img" aria-label="' + plural(S.done, 'day') + ' trained in the last 7">' + dayMarks + '</div></div>';
    if (f.tops.length) {
      html += '<div class="wn-tops">' + f.tops.map(function (x) {
        var tone = x.d == null ? '' : x.d >= 1 ? 'alert' : x.d >= 0.5 ? 'warn' : x.d <= -1 ? 'cool' : '';
        var eff = x.felt != null ? '@' + rpeTxt(x.felt) : '';
        var wrote = x.wroteLo != null ? 'wrote ' + rpeTxt(x.wroteLo) + (x.wroteHi != null ? '–' + rpeTxt(x.wroteHi) : '') : '';
        var pr = f.prs.some(function (p) { return p.lift === x.lift; });
        return '<div class="wn-top"><i class="wn-ld ' + LIFT_CLS[x.lift] + '" aria-hidden="true"></i><span class="wn-tn">' + esc(x.name) + (pr ? '<em class="wn-pr">PR</em>' : '') + '</span>' +
          '<span class="wn-tv">' + esc(wTxt(x.kg, U)) + '<small>× ' + x.reps + '</small></span>' +
          '<span class="wn-te"><i class="wn-sd' + (tone ? ' t-' + tone : '') + '" aria-hidden="true"></i><b>' + esc(eff) + '</b><small>' + esc(wrote) + '</small></span></div>';
      }).join('') + '</div>';
    }
    if (f.e1rm) {
      var dv = Math.round(f.e1rm.delta / (U === 'lbs' ? KG_PER_LB : 1));
      rows.push(['Total e1RM', esc(String(Math.round(inUnit(f.e1rm.now, U)))) + ' ' + uTxt(U), (dv > 0 ? '+' : dv < 0 ? '−' : '') + Math.abs(dv) + ' in ' + plural(f.e1rm.weeks, 'week'), '']);
    }
    if (f.bw) rows.push(['Bodyweight', esc(wTxt(f.bw.kg, U)) + ' ' + uTxt(U), (f.bw.over > 0 ? esc(wTxt(f.bw.over, U)) + ' ' + uTxt(U) + ' over ' : 'On weight for ') + esc(String(n1(f.bw.cls))) + ' kg · ' + esc(f.bw.meet || 'Meet') + ' ' + whenMeet(f.bw.days), f.bw.over > 0 ? 'warn' : '']);
    else if (f.meetNoWeighIn) rows.push(['Bodyweight', 'No weigh-in', esc(f.meetNoWeighIn.name || 'Meet') + ' ' + whenMeet(f.meetNoWeighIn.days), '']);
    if (f.pain) {
      if (f.pain.checkin) rows.push(['Pain', 'Yes on the check-in', f.pain.count >= 2 ? f.pain.count + ' days this week' : esc(dayWord(f.pain.day)), 'alert']);
      else {
        var part = typeof painPartLabel === 'function' ? painPartLabel(f.pain.part, f.pain.side) : String(f.pain.part || 'Pain');
        rows.push(['Pain', esc(part) + ' ' + f.pain.sev + '/10', esc([f.pain.lift ? (typeof painLiftLabel === 'function' ? painLiftLabel(f.pain.lift) : f.pain.lift) : '', f.pain.count >= 2 ? f.pain.count + ' times this week' : dayWord(f.pain.day)].filter(Boolean).join(' · ')), 'alert']);
      }
    }
    if (f.next.length) rows.push(['Next week', esc(f.next.slice(0, 2).map(function (c) { return (c.title || LIFT[c.lift] || 'Lift') + ' ' + (Number(c.toKg) > 0 ? wTxt(c.fromKg, U) + ' → ' + wTxt(c.toKg, U) : String(c.variant || '')); }).join(', ')), f.next.length > 2 ? '+' + (f.next.length - 2) + ' more' : 'Applied', '']);
    if (rows.length) html += '<dl class="wn-facts">' + rows.map(function (x) {
      return '<div class="wn-fact"><dt>' + x[0] + '</dt><dd><b>' + (x[3] ? '<i class="wn-sd t-' + x[3] + '" aria-hidden="true"></i>' : '') + x[1] + '</b>' + (x[2] ? '<span>' + x[2] + '</span>' : '') + '</dd></div>';
    }).join('') + '</dl>';
    if (f.words) html += '<figure class="wn-words"><figcaption>In their words · ' + esc(dayWord(f.words.when)) + '</figcaption><blockquote>“' + esc(f.words.text.length > 220 ? f.words.text.slice(0, 219).trim() + '…' : f.words.text) + '”</blockquote></figure>';
    if (!f.tops.length && !rows.length && !f.words) html += '<p class="wn-none">Nothing else logged this week.</p>';
    return html + '</aside>';
  }

  /* ---------------------------------------------------------------- the phone: a lifter's page and the sheet */
  function lifterEntryHtml(r, o) {
    o = o || {};
    var id = r.athlete.id, t = todayIso(), last = lastNoteOn(id, {}), sent = last && daysBetween(last, t) < GAP_DAYS;
    return '<button type="button" class="cl-wnrow' + (o.rise != null ? ' rise" style="--i:' + o.rise : '') + '" data-wn-one="' + esc(id) + '">' +
      '<span class="cl-tic">' + ic('pen') + '</span><span class="cl-wn-t"><b>Write the week’s note</b><span>' +
      (sent ? '<i class="cl-wn-ok" aria-hidden="true"></i>Sent ' + esc(dayWord(last)) : 'Drafted from their last 7 days') + '</span></span>' + ic('chev') + '</button>';
  }
  function openSheet(athleteId, opts) {
    opts = opts || {};
    if (typeof uiSheet !== 'function') return;
    var s = storeOf(), a = (s.athletes || []).filter(function (x) { return x.id === athleteId; })[0];
    if (!a) return;
    var t = todayIso(), f1 = firstName(a.name);
    uiSheet('Note to ' + f1, function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Drafted from their last 7 days. Every number comes from their log.'));
      var ta = el('textarea', { class: 'wn-sta', maxlength: '2000', 'aria-label': 'Note to ' + f1, spellcheck: 'true' });
      ta.value = weeklyNoteDraft(athleteId, { today: t });
      sheet.appendChild(ta);
      var go = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Send to ' + f1);
      go.addEventListener('click', async function () {
        var body = ta.value.trim();
        if (!body) { ta.focus(); return; }
        if (go.disabled) return;
        go.disabled = true;
        var ok = await sendNote(athleteId, body, t);
        if (!ok) { go.disabled = false; if (typeof toast === 'function') toast('Couldn’t send. Check your connection'); return; }
        close();
        if (typeof toast === 'function') toast(window._demoMode ? 'Sent to ' + f1 + ' in the demo. Nothing leaves this page.' : 'Sent to ' + f1);
        if (opts.onSent) opts.onSent();
      });
      sheet.appendChild(go);
      requestAnimationFrame(function () { autosize(ta, Math.round(window.innerHeight * 0.5)); });
      ta.addEventListener('input', function () { autosize(ta, Math.round(window.innerHeight * 0.5)); });
    }, { cls: 'wn-sheet' });
  }

  /* ---------------------------------------------------------------- saved replies: the picker */
  function insertAt(ta, text) {
    var v = ta.value, s0 = typeof ta.selectionStart === 'number' ? ta.selectionStart : v.length, s1 = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : v.length;
    if (document.activeElement !== ta && !(s0 > 0)) { s0 = s1 = v.length; }
    var before = v.slice(0, s0), after = v.slice(s1);
    var pre = before && !/\s$/.test(before) ? (before.indexOf('\n') >= 0 ? '\n' : ' ') : '';
    var post = after && !/^\s/.test(after) ? ' ' : '';
    ta.value = before + pre + text + post + after;
    var pos = (before + pre + text).length;
    try { ta.focus({ preventScroll: true }); ta.setSelectionRange(pos, pos); } catch (e) {}
    fireInput(ta);
  }
  // anchor: the button that opened it; ta: the composer's textarea. Desk: a menu by the button; phone: a sheet.
  function pickReply(anchor, ta, opts) {
    opts = opts || {};
    var cid = opts.coachId || myId();
    if (isDeskNow()) deskReplyMenu(anchor, ta, cid);
    else phoneReplySheet(ta, cid);
  }
  function closeReplyMenu() { var m = document.querySelector('.wn-rmenu'); if (m && m._close) m._close(); }
  function deskReplyMenu(anchor, ta, cid) {
    if (document.querySelector('.wn-rmenu')) { closeReplyMenu(); return; }
    if (typeof closeDkMenus === 'function') closeDkMenus();
    var list = loadReplies(cid);
    var m = el('div', { class: 'dk-menu wn-rmenu', role: 'menu', 'aria-label': 'Saved replies' });
    m.appendChild(el('div', { class: 'dk-menu-title', role: 'presentation' }, 'Saved replies'));
    list.forEach(function (text) {
      var row = el('div', { class: 'wn-ritem' });
      var b = el('button', { type: 'button', class: 'wn-rpick', role: 'menuitem' }, text);
      b.addEventListener('click', function (e) { e.stopPropagation(); close(); insertAt(ta, text); });
      var x = el('button', { type: 'button', class: 'wn-rdel', 'aria-label': 'Remove this saved reply', html: ic('x', 2.2) });
      x.addEventListener('click', function (e) { e.stopPropagation(); saveReplies(cid, repliesRemove(loadReplies(cid), text)); row.remove(); if (typeof toast === 'function') toast('Reply removed'); });
      row.appendChild(b); row.appendChild(x);
      m.appendChild(row);
    });
    if (!list.length) m.appendChild(el('div', { class: 'wn-rnone' }, 'No saved replies yet.'));
    m.appendChild(el('div', { class: 'dk-menu-sep', role: 'separator' }));
    var cur = cleanReply(ta.value);
    if (cur) {
      var sv = el('button', { type: 'button', class: 'dk-menu-item wn-rsave', role: 'menuitem', html: ic('save') });
      sv.appendChild(el('span', { class: 'dk-menu-label' }, 'Save this as a reply'));
      sv.addEventListener('click', function (e) { e.stopPropagation(); close(); saveReplies(cid, repliesAdd(loadReplies(cid), cur)); if (typeof toast === 'function') toast('Saved to your replies'); try { ta.focus({ preventScroll: true }); } catch (er) {} });
      m.appendChild(sv);
    } else m.appendChild(el('div', { class: 'wn-rhint' }, 'Type a message to save it here.'));
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    var up = r.bottom + 6 + mh > window.innerHeight - 8;
    m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.left)) + 'px';
    m.style.top = Math.max(8, up ? r.top - mh - 6 : r.bottom + 6) + 'px';
    m.style.transformOrigin = 'left ' + (up ? 'bottom' : 'top');
    anchor.setAttribute('aria-expanded', 'true');
    var armT = setTimeout(function () { document.addEventListener('mousedown', outside, true); }, 0);
    function outside(e) { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); }
    function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); try { anchor.focus(); } catch (er) {} } }
    function close() { clearTimeout(armT); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true); anchor.setAttribute('aria-expanded', 'false'); m.remove(); }
    m._close = close;
    document.addEventListener('keydown', onKey, true);
    var f0 = m.querySelector('.wn-rpick, .wn-rsave');
    if (f0) f0.focus({ preventScroll: true });
  }
  function phoneReplySheet(ta, cid) {
    if (typeof uiSheet !== 'function') return;
    uiSheet('Saved replies', function (sheet, close) {
      var paint = function () {
        sheet.querySelectorAll('.wn-rlist, .wn-rnone, .wn-rsv, .ui-sheet-sub').forEach(function (n) { n.remove(); });
        var list = loadReplies(cid);
        sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, list.length ? 'Tap one to add it. Hold one to remove it.' : 'Nothing saved yet. Write a message, then save it here.'));
        if (list.length) {
          var ul = uiList(list.map(function (text) {
            // Tap: into the message. Hold: remove it (the click that ends a hold does nothing).
            var row = el('button', { type: 'button', class: 'ui-row wn-rrow' }, el('span', { class: 'ui-row-main' }, el('span', { class: 'ui-row-title' }, text)));
            var timer = null, held = false;
            var stop = function () { clearTimeout(timer); timer = null; };
            row.addEventListener('pointerdown', function (e) {
              if (e.button) return;
              held = false; stop();
              timer = setTimeout(function () {
                held = true;
                if (typeof uiActionSheet === 'function') uiActionSheet(text.length > 60 ? text.slice(0, 59) + '…' : text, [{ label: 'Remove this reply', danger: true, onClick: function () { saveReplies(cid, repliesRemove(loadReplies(cid), text)); paint(); } }]);
              }, 480);
            });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { row.addEventListener(ev, stop); });
            row.addEventListener('contextmenu', function (e) { e.preventDefault(); });
            row.addEventListener('click', function (e) {
              if (held) { e.preventDefault(); held = false; return; }
              close(); setTimeout(function () { insertAt(ta, text); }, 220);
            });
            return row;
          }));
          ul.classList.add('wn-rlist');
          sheet.appendChild(ul);
        }
        var cur = cleanReply(ta.value);
        if (cur) {
          var sv = el('button', { type: 'button', class: 'ui-text-btn wn-rsv', html: ic('save') + '<span>Save “' + esc(cur.length > 26 ? cur.slice(0, 25).trim() + '…' : cur) + '”</span>' });
          sv.addEventListener('click', function () { saveReplies(cid, repliesAdd(loadReplies(cid), cur)); if (typeof toast === 'function') toast('Saved to your replies'); paint(); });
          sheet.appendChild(sv);
        }
      };
      paint();
    }, { cls: 'wn-rsheet' });
  }
  // The small button a composer carries (the phone thread, the laptop's thread): opens the picker.
  function replyButton(ta, opts) {
    opts = opts || {};
    var b = el('button', { type: 'button', class: opts.cls || 'msg-attach msg-saved', 'aria-label': 'Saved replies', 'aria-haspopup': 'true', html: ic('save') });
    b.addEventListener('click', function (e) { e.preventDefault(); pickReply(b, ta, opts); });
    if (typeof dkTip === 'function' && isDeskNow()) dkTip(b, 'Saved replies');
    return b;
  }

  /* ---------------------------------------------------------------- the phone: message everyone (or a team) */
  function rosterNow() {
    var me = myId();
    return (storeOf().athletes || []).filter(function (a) { return !me || a.coachId === me; });
  }
  function teamsNow() {
    var me = myId(), ids = {};
    rosterNow().forEach(function (a) { ids[a.id] = 1; });
    return (storeOf().teams || []).filter(function (t) { return !me || !t.coachId || t.coachId === me; })
      .map(function (t) { return { id: t.id, name: t.name || 'Team', ids: (t.members || []).map(function (m) { return m.athleteId; }).filter(function (id) { return ids[id]; }) }; })
      .filter(function (t) { return t.ids.length; });
  }
  // One quiet row above the threads (its own surface, so it never reads as a conversation).
  function broadcastRowEl(onOpen) {
    var n = rosterNow().length, teams = teamsNow();
    var row = el('button', { type: 'button', class: 'msg-bc' });
    row.innerHTML = '<span class="msg-bc-ic">' + ic('users') + '</span><span class="msg-bc-t"><b>Message everyone</b><span>' +
      esc(teams.length ? 'Everyone or a team, one thread each' : plural(n, 'lifter') + ', each in their own thread') + '</span></span>' + ic('chev');
    row.addEventListener('click', function () { if (onOpen) onOpen(); else openBroadcast(); });
    return row;
  }
  function openBroadcast(opts) {
    opts = opts || {};
    if (typeof uiSheet !== 'function') return;
    var all = rosterNow(), teams = teamsNow(), pick = 'all';
    if (!all.length) return;
    uiSheet('Message everyone', function (sheet, close) {
      var h = sheet.querySelector('.ui-sheet-h');
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Each lifter gets it in their own thread.'));
      var seg = null;
      if (teams.length) {
        seg = el('div', { class: 'ui-seg wn-bseg', role: 'radiogroup', 'aria-label': 'Who gets it' });
        [{ id: 'all', name: 'Everyone' }].concat(teams.slice(0, 3)).forEach(function (t) {
          var b = el('button', { type: 'button', role: 'radio', 'data-v': t.id }, t.name);
          b.addEventListener('click', function () { pick = t.id; paint(); });
          seg.appendChild(b);
        });
        sheet.appendChild(seg);
      }
      var who = el('div', { class: 'wn-bwho' });
      sheet.appendChild(who);
      var ta = el('textarea', { class: 'wn-sta wn-bta', maxlength: '2000', placeholder: 'Write to everyone', 'aria-label': 'Message' });
      sheet.appendChild(ta);
      var tools = el('div', { class: 'wn-btools' });
      var saved = el('button', { type: 'button', class: 'ui-text-btn wn-bsaved', html: ic('save') + '<span>Saved replies</span>' });
      saved.addEventListener('click', function () { pickReply(saved, ta); });
      tools.appendChild(saved);
      sheet.appendChild(tools);
      var go = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' });
      sheet.appendChild(go);
      function ids() { if (pick === 'all') return all.map(function (a) { return a.id; }); var t = teams.filter(function (x) { return x.id === pick; })[0]; return t ? t.ids : []; }
      function paint() {
        var list = ids(), people = list.map(function (id) { return all.filter(function (a) { return a.id === id; })[0]; }).filter(Boolean);
        var team = pick === 'all' ? null : teams.filter(function (x) { return x.id === pick; })[0];
        if (h) h.textContent = team ? 'Message ' + team.name : 'Message everyone';
        if (seg) seg.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-v') === pick; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        var names = people.map(function (a) { return firstName(a.name); });
        who.innerHTML = '<span class="wn-bstack">' + people.slice(0, 5).map(function (a) { return avHtml(a); }).join('') + '</span><span class="wn-bnames">' + esc(names.length > 4 ? names.slice(0, 3).join(', ') + ' and ' + (names.length - 3) + ' more' : listJoin(names)) + '</span>';
        ta.placeholder = team ? 'Write to ' + team.name : 'Write to everyone';
        go.textContent = list.length === 1 ? 'Send to ' + names[0] : 'Send to ' + list.length;
      }
      paint();
      go.addEventListener('click', async function () {
        var body = ta.value.trim(), list = ids();
        if (!body) { ta.focus(); return; }
        if (go.disabled || !list.length || typeof dkSendMessage !== 'function') return;
        go.disabled = true;
        var ok = 0;
        for (var i = 0; i < list.length; i++) { if (await dkSendMessage(list[i], body)) ok++; }
        close();
        if (typeof toast === 'function') toast(ok === list.length ? (window._demoMode ? 'Sent to ' + ok + ' in the demo. Nothing leaves this page.' : 'Sent to ' + ok) : 'Sent to ' + ok + ' of ' + list.length + '. Check your connection.');
        if (opts.onSent) opts.onSent();
      });
      ta.addEventListener('input', function () { autosize(ta, Math.round(window.innerHeight * 0.4)); });
    }, { cls: 'wn-sheet wn-bsheet' });
  }

  var API = {
    draft: weeklyNoteDraft, facts: weeklyNoteFacts, lines: weeklyNoteLines, due: weeklyNoteDue, sentThisWeek: sentThisWeek,
    lastNoteOn: lastNoteOn, markSent: markSent, noteApplied: noteApplied, appliedFor: appliedFor,
    DEFAULT_REPLIES: DEFAULT_REPLIES.slice(), repliesKey: repliesKey, repliesParse: repliesParse, repliesAdd: repliesAdd, repliesRemove: repliesRemove,
    loadReplies: loadReplies, saveReplies: saveReplies,
    todayEntryHtml: todayEntryHtml, openQueue: openQueue, closeQueue: closeQueue, lifterEntryHtml: lifterEntryHtml, openSheet: openSheet,
    pickReply: pickReply, replyButton: replyButton, broadcastRowEl: broadcastRowEl, openBroadcast: openBroadcast, insertAt: insertAt
  };
  window.WeeklyNote = API;
  window.weeklyNoteDraft = weeklyNoteDraft;
})();
