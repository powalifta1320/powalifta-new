/* coach-lifters.js: the coach's Lifters screen (2026-10-26): everyone, then one.
   Laptop (html.desk): takes over the Roster pane (desk.js deskRenderRoster hands over when
   window.CoachLifters exists; ?oldroster=1 shows the old board/list; the Calendar stays its own
   mode). iPhone / phone web: the Lifters tab (coach.html renderRoster hands over) and a lifter
   pushed in as a sub-screen (section[data-pane="lifter"], tab-lifter with data-parent).
   The rule that makes it clean is a count: a row is four things (face, name, one line in the
   coach's words, one number) and a page is one big answer, one picture (the block), one red fix
   with one quiet alternative and at most two quiet rows. Everything else is one tap away.
   Everything comes from the app's own model: desk.js dkRowsFresh() → app.js deskRows / deskReasons /
   deskQueue / coachAthleteStatus; the fixes are Home's (coach-home.js CoachHome.fixFor). */
(function () {
  'use strict';
  var LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var LIFT_CLS = { squat: 'l-sq', bench: 'l-be', deadlift: 'l-dl' };
  var IC = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>'
  };
  function ic(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function first(n) { return String(n || '').trim().split(' ')[0]; }
  function num(v) { return typeof _num === 'function' ? _num(v) : Math.round(Number(v) * 100) / 100; }
  function kgShow(v) { return typeof kgToDisplay === 'function' ? kgToDisplay(v) : Number(v); }
  function unit() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function node(tag, attrs, html) { var n = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); }); if (html != null) n.innerHTML = html; return n; }
  function avHtml(a, cls) { var name = a.name || '?'; var hue = typeof avatarHue === 'function' ? avatarHue(name) : 0; var ini = typeof initials === 'function' ? initials(name) : name.slice(0, 2).toUpperCase(); return '<span class="ui-av av-h' + hue + (cls ? ' ' + cls : '') + '" data-name="' + esc(name) + '" aria-hidden="true">' + (a.avatarUrl ? '<img src="' + esc(a.avatarUrl) + '" alt="">' : esc(ini)) + '</span>'; }
  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function addDays(iso, n) { if (typeof _isoAddDays === 'function') return _isoAddDays(iso, n); var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function mondayOf(iso) { if (typeof _isoMonday === 'function') return _isoMonday(iso); var d = new Date(iso + 'T12:00:00Z'); var k = (d.getUTCDay() + 6) % 7; return addDays(iso, -k); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
  function daysText(d) { if (d <= 0) return 'today'; if (d === 1) return 'tomorrow'; if (d < 21) return 'in ' + d + ' days'; var w = Math.round(d / 7); return 'in ' + w + (w === 1 ? ' week' : ' weeks'); }
  function dateShort(iso) { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return String(iso).slice(0, 10); } }
  function whenText(iso, t) { var d = daysBetween(String(iso).slice(0, 10), t || todayIso()); if (d <= 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 7) return dateShort(iso).split(' ')[0]; return dateShort(iso); }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function rpeText(v) { return v == null || v === '' ? '' : '@' + num(v); }

  /* ---------- pure: the four groups, the line, the number, the answer, the block ---------- */
  var NEED = /^(pain|weight|offpace|overshoot|drift|note|message|formcheck|checkin|readiness|quiet|never|missed|stalling)$/;
  var BLOCK = /^(blockend|blockdone|noprogram)$/;
  // 'Check on' is the coach's verb for the first group; the header's 'N need you' counts every
  // flagged lifter (the app's queue), which the three flagged groups split between them.
  var GROUPS = [{ key: 'need', title: 'Check on' }, { key: 'block', title: 'Next block due' }, { key: 'meet', title: 'Meet soon' }, { key: 'plan', title: 'On plan' }];
  function clGroupKey(r) {
    var types = (r.reasons || []).map(function (x) { return x.type; });
    if (types.some(function (t) { return NEED.test(t); })) return 'need';
    if (types.indexOf('meet') >= 0) return 'meet';   // a meet inside two weeks beats a block to write
    if (types.some(function (t) { return BLOCK.test(t); })) return 'block';
    if (r.meet && r.meet.days <= 56) return 'meet';
    return 'plan';
  }
  // 'Message 1d' / 'Note waiting 3d' → '1 day' / '3 days'; null when the text carries no wait.
  function waitText(text) {
    var m = /(\d+)(h|d)$/.exec(text || '');
    if (!m) return null;
    return m[1] + (m[2] === 'h' ? (m[1] === '1' ? ' hour' : ' hours') : (m[1] === '1' ? ' day' : ' days'));
  }
  // rows → [{ key, title, rows }], empty groups dropped. opts.order: { athleteId: rank } (the queue,
  // worst first); unranked rows follow by name. Meet soon runs nearest meet first.
  function clGroups(rows, opts) {
    opts = opts || {};
    var order = opts.order || {};
    var by = { need: [], block: [], meet: [], plan: [] };
    (rows || []).forEach(function (r) { by[clGroupKey(r)].push(r); });
    function cmp(a, b) {
      var ia = order[a.athlete.id], ib = order[b.athlete.id];
      if (ia != null && ib != null && ia !== ib) return ia - ib;
      if (ia != null && ib == null) return -1;
      if (ib != null && ia == null) return 1;
      return String(a.athlete.name).localeCompare(String(b.athlete.name));
    }
    by.meet.sort(function (a, b) { return a.meet.days - b.meet.days || cmp(a, b); });
    ['need', 'block', 'plan'].forEach(function (k) { by[k].sort(cmp); });
    return GROUPS.map(function (g) { return { key: g.key, title: g.title, rows: by[g.key] }; }).filter(function (g) { return g.rows.length; });
  }
  function painBits(st) {
    var p = st && st.pain, rep = p && p.report;
    if (!rep) return null;
    var part = typeof painPartLabel === 'function' ? painPartLabel(rep.bodyPart, rep.side) : String(rep.bodyPart || 'Pain');
    var lift = rep.lift && typeof painLiftLabel === 'function' ? painLiftLabel(rep.lift) : (rep.lift ? String(rep.lift) : '');
    return { part: part, lift: lift, sev: rep.severity != null ? num(rep.severity) : null, count: p.count || 1, phase: rep.phase || null };
  }
  // The one line under the name, in the coach's words. Short enough for a phone row.
  function clLine(r) {
    var reason = (r.reasons || [])[0] || null, st = r.status || {}, t = reason && reason.type, prog = st.program;
    var wk = st.week, se = st.sessions || {};
    switch (t) {
      case 'pain': { var pb = painBits(st); if (!pb) return 'Pain on the check-in'; return pb.part + (pb.sev != null ? ' ' + pb.sev + '/10' : '') + (pb.lift ? ' · ' + pb.lift.toLowerCase() : ''); }
      case 'weight': return r.bw ? num(kgShow(r.bw.over)) + ' ' + unit() + ' over the ' + r.bw.cls + ' class' : reason.text;
      case 'offpace': return st.cut && st.cut.flag ? st.cut.flag : 'Cut off pace';
      case 'meet': return meetLine(r);
      case 'overshoot': { var m = /^(.*) @([\d.]+) vs @([\d.]+)$/.exec(reason.text || ''); return m ? m[1] + ' @' + m[2] + ', you wrote ' + m[3] : reason.text; }
      case 'drift': return r.drift ? 'RPE +' + r.drift.avg + ' over written' : reason.text;
      case 'note': { var d = /(\d+)d$/.exec(reason.text || ''); return 'Left a note' + (d ? ' · ' + d[1] + (d[1] === '1' ? ' day ago' : ' days ago') : ' · waiting on you'); }
      case 'message': { var h = /(\d+)(h|d)$/.exec(reason.text || ''); return 'Wrote you' + (h ? ' · ' + h[1] + (h[2] === 'h' ? (h[1] === '1' ? ' hour' : ' hours') : (h[1] === '1' ? ' day' : ' days')) + ' ago' : ''); }
      case 'formcheck': return 'Form check waiting' + (/·\s*(\w+)/.test(reason.text || '') ? ' · ' + /·\s*(\w+)/.exec(reason.text)[1] : '');
      case 'checkin': return reason.text || 'Check-in worth a look';
      case 'readiness': return 'Readiness low';
      case 'quiet': return st.ago != null ? st.ago + ' days since a session' : 'Quiet';
      case 'never': return 'No sets logged yet';
      case 'missed': return (reason.text || '').replace(/ this week$/, '');
      case 'noprogram': return 'No block written yet';
      case 'blockend': return 'Last week of the block';
      case 'blockdone': return 'Block finished';
      case 'stalling': return 'Flat for 3 weeks';
    }
    if (r.meet && r.meet.days <= 56) return meetLine(r);
    if (wk && wk.total) return 'Week ' + (wk.idx + 1) + ' of ' + wk.total + (se.planned ? ' · ' + (se.done || 0) + ' of ' + se.planned + ' done' : '');
    return prog ? clip(prog.name, 30) : 'No block yet';
  }
  // 'Meet today · Autumn Open'; a long meet name stays for the page.
  function meetLine(r) {
    var when = r.meet && r.meet.days <= 0 ? 'Meet today' : 'Meet ' + daysText(r.meet ? r.meet.days : 0);
    var name = r.meet && r.meet.meet.name ? String(r.meet.meet.name).trim() : '';
    return name && when.length + name.length <= 24 ? when + ' · ' + name : when;
  }
  // The number at the end of every row: strength over the last four weeks, in the unit shown.
  function clNumber(r) {
    var d = r.total ? r.total.delta : null;
    if (d == null) return { text: '—', tone: 'none', title: 'No trend yet' };
    var v = Math.round(kgShow(d));
    return { text: (v > 0 ? '+' : '') + v, tone: v > 0 ? 'up' : v < 0 ? 'down' : 'flat', title: (v > 0 ? '+' : '') + v + ' ' + unit() + ' of total e1RM in four weeks' };
  }
  // The one big answer on a lifter's page: { big, words, tone, quote }.
  function clAnswer(r) {
    var reason = (r.reasons || [])[0] || null, st = r.status || {}, t = reason && reason.type, prog = st.program, wk = st.week, se = st.sessions || {};
    switch (t) {
      case 'pain': { var pb = painBits(st); if (!pb) return { big: 'Pain', words: 'said yes to pain on the check-in', tone: 'pain' };
        return { big: pb.sev != null ? pb.sev + '/10' : 'Pain', words: pb.part + (pb.lift ? ' on ' + pb.lift.toLowerCase() : '') + (pb.count >= 2 ? ', ' + (typeof _ordinal === 'function' ? _ordinal(pb.count) : pb.count + 'th') + ' time this week' : '') + (pb.phase && typeof PAIN_PHASES !== 'undefined' && PAIN_PHASES[pb.phase] ? ' · ' + PAIN_PHASES[pb.phase].toLowerCase() : ''), tone: 'pain' }; }
      case 'weight': return r.bw ? { big: num(kgShow(r.bw.bw)) + ' ' + unit(), words: num(kgShow(r.bw.over)) + ' over the ' + r.bw.cls + ' class' + (r.meet ? ' · meet ' + daysText(r.meet.days) : ''), tone: 'bw' } : { big: 'Over', words: reason.text, tone: 'bw' };
      case 'offpace': return { big: 'Cut', words: st.cut && st.cut.flag ? st.cut.flag : 'off pace for the class', tone: 'bw' };
      case 'meet': { var m = r.meet ? r.meet.meet : {}; var hasPlan = !!(m.attempts || m.openers || m.plan);
        return { big: r.meet && r.meet.days <= 0 ? 'Today' : (r.meet ? r.meet.days + (r.meet.days === 1 ? ' day' : ' days') : 'Meet'), words: (m.name || 'Meet') + (m.weightClass ? ' · ' + m.weightClass + ' class' : '') + (hasPlan ? ' · attempts set' : ' · attempts not set'), tone: 'meet' }; }
      case 'overshoot': { var o = /^(.*) @([\d.]+) vs @([\d.]+)$/.exec(reason.text || ''); return o ? { big: '@' + o[2], words: o[1] + ', you wrote ' + o[3], tone: 'warn' } : { big: 'Over', words: reason.text, tone: 'warn' }; }
      case 'drift': return { big: '+' + (r.drift ? r.drift.avg : '0.5'), words: 'over what you wrote, across ' + (r.drift ? r.drift.n : 'their') + ' sets this week', tone: 'warn' };
      case 'message': { var wt = waitText(reason.text); return { big: reason.body ? '“' + clip(reason.body, 120) + '”' : 'Wrote you', words: 'no reply yet' + (wt ? ' · waiting ' + wt : ''), tone: 'msg', quote: !!reason.body }; }
      case 'note': { var w = clWords(r); return { big: w && w.kind === 'note' ? '“' + clip(w.text, 120) + '”' : 'A note', words: 'on their session · waiting on you', tone: 'msg', quote: !!(w && w.kind === 'note') }; }
      case 'formcheck': return { big: 'Video', words: 'form check waiting on your review', tone: 'msg' };
      case 'checkin': { var c = /(\d+(?:\/10|h)?)/.exec(reason.text || ''); return { big: c ? c[1] : 'Check-in', words: (reason.text || 'worth a look') + ' · from their check-in', tone: 'warn' }; }
      case 'readiness': return { big: 'Low', words: st.readiness && st.readiness.text ? st.readiness.text : 'readiness is down', tone: 'warn' };
      case 'quiet': return { big: st.ago != null ? st.ago + ' days' : 'Quiet', words: 'since their last session' + (st.lastDate ? ' · ' + dateShort(st.lastDate) : ''), tone: 'warn' };
      case 'never': return { big: '0 sets', words: prog ? 'nothing logged on ' + prog.name : 'nothing logged yet', tone: 'warn' };
      case 'missed': { var mm = /Missed (\d+)/.exec(reason.detail || reason.text || ''); return { big: (mm ? mm[1] : '1') + ' missed', words: 'of ' + (se.planned || '?') + ' sessions this week', tone: 'warn' }; }
      case 'noprogram': return { big: 'No block', words: 'nothing written yet', tone: 'quiet' };
      case 'blockend': return { big: 'Last week', words: 'of ' + (prog ? prog.name : 'the block') + ' · nothing written after it', tone: 'quiet' };
      case 'blockdone': return { big: 'Block done', words: 'every set logged · write the next one', tone: 'quiet' };
      case 'stalling': return { big: 'Flat', words: 'no main lift up in three weeks', tone: 'quiet' };
    }
    var n = clNumber(r);
    if (n.tone === 'none') return { big: wk && wk.total ? 'Week ' + (wk.idx + 1) : 'New', words: wk && wk.total ? 'of ' + wk.total + (se.planned ? ' · ' + (se.done || 0) + ' of ' + se.planned + ' sessions this week' : '') : 'no trend yet', tone: 'ok' };
    return { big: n.text + ' ' + unit(), words: 'in four weeks' + (wk && wk.total ? ' · week ' + (wk.idx + 1) + ' of ' + wk.total : '') + (se.planned ? ', ' + (se.done || 0) + ' of ' + se.planned + ' sessions this week' : ''), tone: n.tone === 'down' ? 'warn' : n.tone === 'flat' ? 'quiet' : 'ok' };
  }
  // The block as a picture: per week { number, planned, done, missed, coming, total, state, meet }.
  // total = the best squat + bench + deadlift e1RM as of that week's last logged set (null until all
  // three exist). opts: { today, meetDate }.
  function clBlockSeries(prog, logs, opts) {
    opts = opts || {};
    var weeks = (prog && prog.weeks) || [];
    if (!weeks.length) return null;
    var t = opts.today || todayIso();
    var st = typeof programWeekState === 'function' ? programWeekState(prog) : null;
    var cur = st ? st.idx : 0, finished = st ? !!st.finished : false;
    var sorted = (logs || []).filter(function (l) { return l && l.date && Number(l.e1rmComp) > 0 && LIFT[l.lift]; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var best = { squat: 0, bench: 0, deadlift: 0 }, li = 0;
    function totalAt(date) {
      while (li < sorted.length && sorted[li].date <= date) { var l = sorted[li++]; if (Number(l.e1rmComp) > best[l.lift]) best[l.lift] = Number(l.e1rmComp); }
      return best.squat && best.bench && best.deadlift ? Math.round(best.squat + best.bench + best.deadlift) : null;
    }
    var firstDate = null;
    weeks.forEach(function (w) { (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) {
      if (s.completed && s.completedAt) { var d0 = String(s.completedAt).slice(0, 10); if (/^\d{4}-\d\d-\d\d$/.test(d0) && (!firstDate || d0 < firstDate)) firstDate = d0; }
    }); }); }); });
    var start = prog.startsOn && /^\d{4}-\d\d-\d\d/.test(String(prog.startsOn)) ? mondayOf(String(prog.startsOn).slice(0, 10)) : firstDate ? mondayOf(firstDate) : addDays(mondayOf(t), -7 * cur);
    var meetDate = opts.meetDate ? String(opts.meetDate).slice(0, 10) : null;
    var out = weeks.map(function (w, wi) {
      var days = (w.days || []).filter(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).length; }); });
      var done = 0, last = null;
      days.forEach(function (d) {
        var hit = false, dd = null;
        (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { if (!s.completed) return; hit = true; var c = String(s.completedAt || '').slice(0, 10); if (/^\d{4}-\d\d-\d\d$/.test(c) && (!dd || c > dd)) dd = c; }); });
        if (hit) { done++; if (dd && (!last || dd > last)) last = dd; }
      });
      var from = addDays(start, wi * 7), to = addDays(from, 6);
      var state = finished || wi < cur ? 'past' : wi === cur ? 'current' : 'future';
      var total = state === 'future' ? null : (last || state === 'past') ? totalAt(last || to) : null;
      return { number: w.number || wi + 1, planned: days.length, done: done, missed: state === 'past' ? Math.max(0, days.length - done) : 0,
        coming: state === 'past' ? 0 : Math.max(0, days.length - done), total: total, state: state, meet: !!(meetDate && meetDate >= from && meetDate <= to), from: from };
    });
    var pts = out.filter(function (x) { return x.total != null; });
    var end = addDays(start, weeks.length * 7 - 1);
    return { weeks: out, cur: cur, finished: finished, first: pts.length ? pts[0].total : null, last: pts.length ? pts[pts.length - 1].total : null,
      delta: pts.length >= 2 ? pts[pts.length - 1].total - pts[0].total : null, meetAfter: !!(meetDate && meetDate > end), start: start };
  }
  // The newest session's top main-lift set: { date, title, lift, w, reps, rpe, wrote, over } or null.
  function clLast(r) {
    var prog = r.status && r.status.program, a = r.athlete;
    var sets = prog && typeof programLoggedSets === 'function' ? programLoggedSets(prog).filter(function (x) { return x.date && LIFT[x.ex.lift]; }) : [];
    if (sets.length) {
      var day = sets.reduce(function (m, x) { return x.date > m ? x.date : m; }, '');
      var top = sets.filter(function (x) { return x.date === day; }).sort(function (p, q) { return (Number(q.set.weight) || 0) - (Number(p.set.weight) || 0); })[0];
      var s = top.set, wrote = s.rpeHi != null && Number(s.rpeHi) > Number(s.rpe) ? s.rpeHi : s.rpe;
      return { date: day, title: typeof _exShortTitle === 'function' ? _exShortTitle(top.ex) : LIFT[top.ex.lift], lift: top.ex.lift, w: s.weight, reps: s.reps || s.plannedReps, rpe: s.actualRpe, wrote: wrote === '' ? null : wrote, over: typeof setOvershoot === 'function' ? setOvershoot(s) : 0 };
    }
    var logs = ((typeof Store !== 'undefined' && Store.get().workoutLogs) || []).filter(function (l) { return l.athleteId === a.id && LIFT[l.lift]; }).sort(function (p, q) { return String(q.date).localeCompare(String(p.date)) || (Number(q.weight) || 0) - (Number(p.weight) || 0); });
    if (!logs.length) return null;
    var l = logs[0];
    return { date: l.date, title: ((l.variant && l.variant !== 'Competition' ? l.variant + ' ' : '') + LIFT[l.lift]).trim(), lift: l.lift, w: l.weight, reps: l.reps, rpe: l.rpe, wrote: null, over: 0 };
  }
  // Their newest words: a typed message or a session note. { text, when, kind } or null.
  function clWords(r) {
    var s = typeof Store !== 'undefined' ? Store.get() : {}, aid = r.athlete.id;
    var msgs = (s.messages || []).filter(function (m) { return m.athleteId === aid && m.senderId === aid && m.body && !(m.meta && m.meta.type && m.meta.type !== 'text'); })
      .map(function (m) { return { text: m.body, when: String(m.createdAt || '').slice(0, 10), kind: 'message', at: String(m.createdAt || '') }; });
    var notes = (s.sessionNotes || []).filter(function (n) { return n.athleteId === aid && n.note && String(n.note).trim(); })
      .map(function (n) { return { text: n.note, when: String(n.date || '').slice(0, 10), kind: 'note', at: String(n.date || '') }; });
    var all = msgs.concat(notes).sort(function (a, b) { return b.at.localeCompare(a.at); });
    return all[0] || null;
  }

  /* ---------- the model ---------- */
  var S = { sel: null, q: '', deskOn: false, keysOn: false, order: [] };
  function rows() {
    if (typeof dkRowsFresh === 'function') { dkRowsFresh(); return { rows: _dk.rows || [], q: _dk.queue }; }
    return { rows: [], q: null };
  }
  function model() {
    var R = rows(), all = R.rows, q = R.q;
    var order = {};
    (q ? q.queue.concat(q.done || [], q.snoozed || []) : all.filter(function (r) { return r.reasons.length; })).forEach(function (r, i) { if (order[r.athlete.id] == null) order[r.athlete.id] = i; });
    var view = isDeskNow() && typeof _dk !== 'undefined' && _dk.view ? _dk.view : null;
    var shown = all;
    if (view && typeof deskViewMatch === 'function') shown = all.filter(function (r) { return deskViewMatch(view, r); });
    if (S.q) { var ql = S.q.toLowerCase(); shown = shown.filter(function (r) { return String(r.athlete.name).toLowerCase().indexOf(ql) >= 0; }); }
    var flagged = all.filter(function (r) { return r.reasons.length; });
    var openQ = q ? q.queue.filter(function (r) { return (q.handled || []).indexOf(r) < 0; }) : flagged;
    return { rows: all, shown: shown, q: q, view: view, groups: clGroups(shown, { order: order }), flagged: flagged, open: openQ, live: all.filter(function (r) { return r.live; }) };
  }
  function rowOf(id) { return typeof dkRow === 'function' ? dkRow(id) : null; }

  /* ---------- actions (Home's fixes, so a fix does the same thing everywhere) ---------- */
  function home() { return window.CoachHome || null; }
  function fixFor(r) {
    var h = home(), f = first(r.athlete.name), a = r.athlete;
    if (!(r.reasons || []).length) return { k: 'open', label: r.status && r.status.program ? 'Open the block' : 'Write a block', run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(a.id); } };
    if (h && h.fixFor) return h.fixFor(r);
    return { k: 'msg', label: 'Message ' + f, text: '' };
  }
  function altFor(r, fix) {
    var a = r.athlete, f = first(a.name), prog = r.status && r.status.program;
    var msg = { k: 'msg', label: 'Message ' + f, text: '' };
    var block = { k: 'open', label: prog ? 'Open the block' : 'Write a block', run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(a.id); } };
    return fix.k === 'msg' ? block : msg;
  }
  function message(r, text) {
    var h = home();
    if (h && h.message) { h.message(r, text || '', refresh); return; }
    if (typeof openAthleteMessages === 'function') openAthleteMessages(r.athlete.id, r.athlete.name);
  }
  function run(r, f, btn) {
    if (!f) return;
    if (f.k === 'msg') { message(r, f.text); return; }
    if (f.k === 'apply') { if (btn) btn.setAttribute('aria-busy', 'true'); try { f.run(); } catch (e) { console.warn('CoachLifters', e); if (typeof toast === 'function') toast('Couldn’t update that week. Open the block to do it by hand.'); } setTimeout(refresh, 50); return; }
    if (f.run) f.run();
  }
  function openAll(id) {
    if (isDeskNow() && typeof openAthletePage === 'function') { openAthletePage(id); return; }
    if (typeof openAthleteSheet === 'function') openAthleteSheet(id);
  }

  /* ---------- the list ---------- */
  function rowHtml(r, o) {
    var a = r.athlete, n = clNumber(r), line = clLine(r);
    // The sparkline is the laptop's: on a phone row it would take the words' room.
    var spark = !o.phone && r.total && r.total.values && r.total.values.length >= 2 && typeof uiSparkline === 'function' ? uiSparkline(r.total.values) : '';
    return '<button type="button" class="cl-row' + (o.sel === a.id ? ' is-sel' : '') + '" data-id="' + esc(a.id) + '" role="option" aria-selected="' + (o.sel === a.id ? 'true' : 'false') + '" tabindex="' + (o.sel === a.id ? '0' : '-1') + '">' +
      avHtml(a) +
      '<span class="cl-main"><span class="cl-name">' + esc(a.name) + (r.live ? '<i class="cl-live" title="Training right now"></i>' : '') + '</span><span class="cl-line">' + esc(line) + '</span></span>' +
      '<span class="cl-end t-' + n.tone + '" title="' + esc(n.title) + '">' + (spark ? '<span class="cl-spark">' + spark + '</span>' : '') + '<b class="cl-n">' + esc(n.text) + '</b></span>' +
      (o.phone ? '<span class="cl-chev">' + ic('chev') + '</span>' : '') + '</button>';
  }
  function groupsHtml(M, o) {
    if (!M.groups.length) return '<p class="cl-none">' + (S.q ? 'No one called “' + esc(S.q) + '”' : 'No lifters in this view') + '</p>';
    var i = 0;
    return M.groups.map(function (g) {
      return '<div class="cl-grp rise" style="--i:' + (i++) + '"><h2 class="cl-gh">' + esc(g.title) + ' <span>' + g.rows.length + '</span></h2><div class="cl-list">' + g.rows.map(function (r) { return rowHtml(r, o); }).join('') + '</div></div>';
    }).join('');
  }
  function subText(M) {
    var n = M.rows.length, open = M.open.length;
    return n + (n === 1 ? ' lifter' : ' lifters') + (open ? ' · <b>' + open + ' need you</b>' : ' · all on plan') + (M.live.length ? ' · <b class="t-live">' + M.live.length + ' under the bar</b>' : '');
  }

  /* ---------- the page (one answer, one picture, one red, two rows) ---------- */
  function pageHtml(r, o) {
    var a = r.athlete, st = r.status || {}, prog = st.program;
    var meta = [prog ? esc(clip(prog.name, 28)) + (st.week && st.week.total ? ' · week ' + (st.week.idx + 1) + ' of ' + st.week.total : '') : 'No block yet'];
    var bw = typeof latestBodyweight === 'function' ? latestBodyweight(a.id) : null;
    if (bw) meta.push(Math.round(kgShow(bw) * 10) / 10 + ' ' + unit());
    var ans = clAnswer(r), fix = fixFor(r), alt = altFor(r, fix), last = clLast(r), words = clWords(r);
    var S2 = clBlockSeries(prog, ((typeof Store !== 'undefined' && Store.get().workoutLogs) || []).filter(function (l) { return l.athleteId === a.id; }), { meetDate: r.meet ? r.meet.meet.date : null });
    var n = clNumber(r), se = st.sessions || {};
    var cap = [];
    if (se.planned) cap.push((se.done || 0) + ' of ' + se.planned + ' this week');
    if (n.tone !== 'none') cap.push(n.text + ' ' + unit() + ' in four weeks');
    if (S2 && S2.meetAfter && r.meet && !o.phone) cap.push('meet ' + daysText(r.meet.days) + ', after the block');
    var html = '<header class="cl-ph rise" style="--i:0">' + (o.phone ? '' : avHtml(a, 'lg')) + '<div class="cl-pid"><h2 class="cl-pname">' + esc(a.name) + (r.live ? '<i class="cl-live" title="Training right now"></i>' : '') + '</h2><p class="cl-pmeta">' + meta.join(' · ') + '</p></div>' +
      (o.phone ? '' : '<div class="cl-ptools"><button type="button" class="cl-quiet" data-card="thread">Thread</button><button type="button" class="cl-quiet" data-card="notes">Notes</button><button type="button" class="cl-quiet" data-go="all">Everything ' + ic('chev') + '</button></div>') + '</header>';
    html += '<div class="cl-answer t-' + ans.tone + (ans.quote ? ' is-quote' : '') + ' rise" style="--i:1"><b class="cl-big">' + esc(ans.big) + '</b><span class="cl-words">' + esc(ans.words) + '</span></div>';
    html += '<div class="cl-chart-card rise" style="--i:2">' + (S2 ? '<div class="cl-chart" data-chart></div>' : '<p class="cl-nochart">No block to draw yet</p>') + (cap.length ? '<p class="cl-cap">' + esc(cap.join(' · ')) + '</p>' : '') + '</div>';
    html += '<div class="cl-acts rise" style="--i:3"><button type="button" class="cl-btn red" data-act="fix">' + esc(fix.label) + '</button><button type="button" class="cl-btn quiet" data-act="alt">' + esc(alt.label) + '</button></div>';
    var rws = '';
    if (last) rws += '<div class="cl-r"><span class="cl-rk">Last session</span><span class="cl-rv"><i class="dot ' + (LIFT_CLS[last.lift] || '') + '"></i>' + esc(whenText(last.date)) + ' · ' + esc(last.title) + ' ' + esc(typeof exactW === 'function' ? exactW(last.w) : num(last.w)) + ' × ' + esc(last.reps == null ? '?' : last.reps) + (last.rpe != null ? ' ' + esc(rpeText(last.rpe)) : '') + (last.over > 0 && last.wrote != null ? '<em>, you wrote ' + esc(num(last.wrote)) + '</em>' : '') + '</span></div>';
    if (words) rws += '<div class="cl-r"><span class="cl-rk">Their words</span><span class="cl-rv">“' + esc(clip(words.text, 140)) + '” <em>· ' + esc(whenText(words.when)) + '</em></span></div>';
    if (o.phone) rws += '<button type="button" class="cl-r cl-r-go" data-go="all"><span class="cl-rk">Everything</span><span class="cl-rv">Lifts, notes, meets</span><span class="cl-chev">' + ic('chev') + '</span></button>';
    if (rws) html += '<div class="cl-rows rise" style="--i:4">' + rws + '</div>';
    return { html: html, series: S2, fix: fix, alt: alt };
  }
  // The block, drawn at the box's real width so its type stays on the scale.
  function drawChart(host, B, o) {
    if (!host || !B) return;
    var W = Math.max(240, host.clientWidth || 600), H = o && o.h || 168, n = B.weeks.length, colW = W / n;
    var padT = 16, lineB = H - 64, dotY = lineB + 24, labY = H - 6;
    var pts = B.weeks.map(function (w, i) { return w.total != null ? { x: colW * (i + 0.5), v: w.total } : null; });
    var vals = pts.filter(Boolean).map(function (p) { return p.v; });
    var min = vals.length ? Math.min.apply(null, vals) : 0, max = vals.length ? Math.max.apply(null, vals) : 1;
    if (max - min < 12) { max = min + 12; }
    var y = function (v) { return lineB - (v - min) / (max - min) * (lineB - padT - 12); };
    var svg = '<svg class="cl-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">';
    svg += '<rect class="cl-cur" x="' + (colW * B.cur + 3).toFixed(1) + '" y="4" width="' + (colW - 6).toFixed(1) + '" height="' + (H - 8) + '" rx="12"/>';
    var d = '', lp = null;
    pts.forEach(function (p) { if (!p) return; d += (d ? ' L' : 'M') + p.x.toFixed(1) + ' ' + y(p.v).toFixed(1); lp = p; });
    if (d && vals.length >= 2) svg += '<path class="cl-line" d="' + d + '"/>';
    if (lp) {
      svg += '<circle class="cl-endpt" cx="' + lp.x.toFixed(1) + '" cy="' + y(lp.v).toFixed(1) + '" r="4.5"/>';
      var right = lp.x > W - 72;
      svg += '<text class="cl-val" x="' + (right ? lp.x - 10 : lp.x + 10).toFixed(1) + '" y="' + (y(lp.v) + 4).toFixed(1) + '" text-anchor="' + (right ? 'end' : 'start') + '">' + Math.round(kgShow(lp.v)) + ' ' + esc(unit()) + '</text>';
    }
    B.weeks.forEach(function (w, i) {
      var cx = colW * (i + 0.5), k = w.planned, gap = Math.min(12, (colW - 12) / Math.max(1, k - 1)), x0 = cx - (k - 1) * gap / 2;
      for (var j = 0; j < k; j++) svg += '<circle class="cl-dot ' + (j < w.done ? 'done' : w.state === 'past' ? 'missed' : 'coming') + '" cx="' + (x0 + j * gap).toFixed(1) + '" cy="' + dotY + '" r="4"/>';
      if (w.meet) svg += '<path class="cl-flag" d="M' + (cx - 5).toFixed(1) + ' 8v14M' + (cx - 5).toFixed(1) + ' 8h11l-3 4 3 4h-11"/>';
      svg += '<text class="cl-wk' + (i === B.cur && !B.finished ? ' on' : '') + '" x="' + cx.toFixed(1) + '" y="' + labY + '" text-anchor="middle">W' + w.number + '</text>';
    });
    svg += '</svg>';
    host.innerHTML = svg;
    host._cl = { B: B, o: o };
    if (!host._ro && typeof ResizeObserver === 'function') {
      host._ro = new ResizeObserver(function () { var w = host.clientWidth; if (w && Math.abs(w - host._w) > 8) { host._w = w; drawChart(host, host._cl.B, host._cl.o); } });
      host._w = W; host._ro.observe(host);
    }
  }

  /* ---------- the laptop: the list beside the page ---------- */
  function renderDesk(area) {
    var M = model();
    var old = area.querySelector('.cl-desk'); if (old) old.remove();
    area.classList.add('cl-on');
    S.deskOn = true;
    if (typeof _dk !== 'undefined' && _dk.rsel && rowOf(_dk.rsel)) S.sel = _dk.rsel;
    var ids = []; M.groups.forEach(function (g) { g.rows.forEach(function (r) { ids.push(r.athlete.id); }); });
    if (!S.sel || ids.indexOf(S.sel) < 0) S.sel = ids[0] || null;
    S.order = ids;
    var wrap = node('div', { class: 'cl-desk cl-root' });
    var chip = M.view && typeof DESK_VIEWS !== 'undefined' ? (function () { var v = DESK_VIEWS.find(function (x) { return x.key === M.view; }); return v ? '<button type="button" class="cl-vchip" data-view-off aria-label="Clear the ' + esc(v.label) + ' view">' + esc(v.label) + ic('x') + '</button>' : ''; })() : '';
    wrap.innerHTML = '<div class="cl-side"><header class="cl-head"><h1 class="cl-h1">Lifters</h1><p class="cl-sub">' + subText(M) + '</p>' +
      '<div class="cl-tools"><label class="cl-search">' + ic('search') + '<input class="cl-q" type="search" placeholder="Find a lifter" aria-label="Find a lifter" autocomplete="off" spellcheck="false" value="' + esc(S.q) + '"><kbd>/</kbd></label>' +
      (typeof dkSetRMode === 'function' && typeof dsPaintCalendar === 'function' ? '<button type="button" class="cl-quiet" data-cal>Calendar</button>' : '') + '</div>' + chip + '</header>' +
      '<div class="cl-groups" role="listbox" aria-label="Lifters">' + groupsHtml(M, { sel: S.sel }) + '</div></div><div class="cl-page" id="clPage"></div>';
    area.appendChild(wrap);
    wrap._M = M;
    wire(wrap, { desk: true });
    paintPage(wrap);
    if (!S.keysOn) { S.keysOn = true; document.addEventListener('keydown', onKey, true); }
    requestAnimationFrame(function () { wrap.classList.add('loaded'); });
  }
  function paintPage(wrap) {
    var host = wrap.querySelector('#clPage'); if (!host) return;
    var r = S.sel ? rowOf(S.sel) : null;
    if (!r) { host.innerHTML = '<p class="cl-none">Pick a lifter</p>'; return; }
    var P = pageHtml(r, { phone: false });
    host.innerHTML = '<div class="cl-pg">' + P.html + '</div>';
    host._P = P; host._r = r;
    host.scrollTop = 0;
    drawChart(host.querySelector('[data-chart]'), P.series, { h: 172 });
    if (typeof _dk !== 'undefined') { _dk.rsel = r.athlete.id; try { if (typeof dkSyncCtx === 'function') dkSyncCtx(); if (typeof dkPaintCard === 'function') dkPaintCard(); } catch (e) {} }
  }
  function select(id, opts) {
    opts = opts || {};
    var wrap = document.querySelector('#rosterArea .cl-desk'); if (!wrap) return;
    S.sel = id;
    wrap.querySelectorAll('.cl-row').forEach(function (b) {
      var on = b.dataset.id === id;
      b.classList.toggle('is-sel', on); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
      if (on) { b.scrollIntoView({ block: 'nearest' }); if (opts.key) b.focus({ preventScroll: true }); }
    });
    paintPage(wrap);
  }
  function move(step) {
    var ids = S.order || []; if (!ids.length) return;
    var i = ids.indexOf(S.sel), n = i < 0 ? 0 : Math.max(0, Math.min(ids.length - 1, i + step));
    select(ids[n], { key: true });
  }
  function typing(t) { return typeof _dkTyping === 'function' ? _dkTyping(t) : !!(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
  function onKey(e) {
    if (!S.deskOn || !isDeskNow() || typeof _dk === 'undefined' || _dk.screen !== 'roster') return;
    if (!document.querySelector('#rosterArea .cl-desk') || document.querySelector('[data-pane="athlete"]:not(.hidden)')) return;
    var k = e.key, low = String(k).toLowerCase(), t = e.target;
    if (typing(t)) {
      if (!(t.classList && t.classList.contains('cl-q'))) return;
      if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (t.value) { t.value = ''; S.q = ''; refresh(); } else t.blur(); }
      else if (k === 'Enter' || k === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); t.blur(); if (S.order && S.order.length) select(S.order[0], { key: true }); }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (low === 'j' || k === 'ArrowDown') move(1);
    else if (low === 'k' || k === 'ArrowUp') move(-1);
    else if (k === '/') { var q = document.querySelector('#rosterArea .cl-q'); if (!q) return; q.focus(); q.select(); }
    else if (k === 'Enter' && S.sel && (!/^(BUTTON|A|INPUT)$/.test(t.tagName) || (t.classList && t.classList.contains('cl-row')))) openAll(S.sel);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }

  /* ---------- the phone: the Lifters tab, then one lifter pushed in ---------- */
  function renderPhone(area) {
    var M = model();
    if (!M.rows.length) return false;
    var wrap = node('div', { class: 'cl-phone cl-root' });
    var q = M.q, total = q ? q.total : M.flagged.length, prog = q ? q.progress : 0, open = M.open.length;
    var firstR = M.open[0] || null;
    if (typeof uiRingHero === 'function') {
      var hero = uiRingHero({
        frac: total ? Math.min(1, prog / total) : 1,
        ringLabel: total ? prog + '<small>/' + total + '</small>' : '<small>all</small>',
        title: open ? open + (open === 1 ? ' still needs you' : ' still need you') : 'All caught up',
        sub: firstR ? first(firstR.athlete.name) + ' first · ' + clLine(firstR) : M.rows.length + (M.rows.length === 1 ? ' lifter' : ' lifters') + ' on plan'
      });
      hero.classList.add('cl-hero');
      if (firstR) { var b = node('button', { type: 'button', class: 'cl-btn red cl-hero-btn', 'data-open': firstR.athlete.id }, 'Open ' + esc(first(firstR.athlete.name))); hero.appendChild(b); }
      wrap.appendChild(hero);
    }
    if (M.rows.length > 8) wrap.insertAdjacentHTML('beforeend', '<label class="cl-search cl-search-ph">' + ic('search') + '<input class="cl-q" type="search" placeholder="Find a lifter" aria-label="Find a lifter" autocomplete="off" spellcheck="false" value="' + esc(S.q) + '"></label>');
    wrap.insertAdjacentHTML('beforeend', '<div class="cl-groups">' + groupsHtml(M, { phone: true }) + '</div>');
    wrap._M = M;
    wire(wrap, { desk: false });
    area.appendChild(wrap);
    try { if (/#lifter=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return true;
  }
  function open(id) {
    if (!rowOf(id)) { if (typeof dkRowsFresh === 'function') dkRowsFresh(); if (!rowOf(id)) return; }
    S.sel = id;
    if (isDeskNow()) { if (document.querySelector('#rosterArea .cl-desk')) select(id); else if (typeof deskGo === 'function') { deskGo('roster'); select(id); } return; }
    var tab = document.getElementById('tab-lifter');
    if (!tab) { openAll(id); return; }
    try { if (!/#lifter=/.test(location.hash)) history.pushState({ lifter: id }, '', '#lifter=' + id); else history.replaceState({ lifter: id }, '', '#lifter=' + id); } catch (e) {}
    tab.click();
  }
  function renderPane() {
    var host = document.getElementById('lifterPage'); if (!host) return;
    var r = S.sel ? rowOf(S.sel) : null;
    if (!r) { host.innerHTML = ''; var tab = document.getElementById('tab-athletes'); if (tab) tab.click(); return; }
    var P = pageHtml(r, { phone: true });
    host.innerHTML = '<div class="cl-pg cl-root cl-pg-phone">' + P.html + '</div>';
    host._P = P; host._r = r;
    if (!host._wired) { host._wired = true; wire(host, { desk: false, page: true }); }
    drawChart(host.querySelector('[data-chart]'), P.series, { h: 156 });
  }

  /* ---------- wiring ---------- */
  function wire(host, o) {
    host.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('.cl-row[data-id]'))) { e.preventDefault(); if (o.desk) select(b.dataset.id); else open(b.dataset.id); return; }
      if ((b = t.closest('[data-open]'))) { e.preventDefault(); open(b.getAttribute('data-open')); return; }
      if ((b = t.closest('[data-act]'))) {
        e.preventDefault();
        var pg = o.desk ? host.querySelector('#clPage') : host, P = pg && pg._P, r = pg && pg._r;
        if (!P || !r) return;
        run(r, b.dataset.act === 'fix' ? P.fix : P.alt, b);
        return;
      }
      if ((b = t.closest('[data-go="all"]'))) { e.preventDefault(); var pg2 = o.desk ? host.querySelector('#clPage') : host; if (pg2 && pg2._r) openAll(pg2._r.athlete.id); return; }
      if ((b = t.closest('[data-card]'))) { e.preventDefault(); if (typeof dkOpenCard === 'function') dkOpenCard(b.dataset.card); return; }
      if ((b = t.closest('[data-view-off]'))) { e.preventDefault(); if (typeof deskGo === 'function') deskGo('roster', { view: null }); return; }
      if ((b = t.closest('[data-cal]'))) { e.preventDefault(); if (typeof dkSetRMode === 'function') dkSetRMode('calendar'); return; }
    });
    var q = host.querySelector('.cl-q');
    if (q) {
      var tm = null;
      q.addEventListener('input', function () { S.q = q.value; clearTimeout(tm); tm = setTimeout(function () { repaintList(host, o); }, 60); });
      if (!o.desk) q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; S.q = ''; repaintList(host, o); q.blur(); } });
    }
  }
  function repaintList(host, o) {
    var M = model(), g = host.querySelector('.cl-groups');
    if (!g) return;
    host._M = M;
    if (o.desk) {
      var ids = []; M.groups.forEach(function (gr) { gr.rows.forEach(function (r) { ids.push(r.athlete.id); }); });
      S.order = ids;
      g.innerHTML = groupsHtml(M, { sel: S.sel });
    } else g.innerHTML = groupsHtml(M, { phone: true });
  }
  function refresh() {
    if (isDeskNow()) { var area = document.getElementById('rosterArea'); if (area && area.querySelector('.cl-desk') && typeof _dk !== 'undefined' && _dk.screen === 'roster') renderDesk(area); return; }
    var lp = document.querySelector('[data-pane="lifter"]:not(.hidden)');
    if (lp) { if (typeof dkRowsFresh === 'function') dkRowsFresh(); renderPane(); return; }
    if (typeof renderRoster === 'function') renderRoster();
  }
  function offDesk() { S.deskOn = false; }

  window.CoachLifters = { model: model, renderDesk: renderDesk, renderPhone: renderPhone, renderPane: renderPane, open: open, select: select, refresh: refresh, offDesk: offDesk,
    clGroups: clGroups, clGroupKey: clGroupKey, clLine: clLine, clNumber: clNumber, clAnswer: clAnswer, clBlockSeries: clBlockSeries, clLast: clLast, clWords: clWords };
})();
