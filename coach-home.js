/* coach-home.js: the coach's Home (2026-10-25), a summary of the roster.
   Laptop (html.desk): takes over the Today pane (desk.js renderDeskToday hands over when
   window.CoachHome exists; ?oldtoday=1 shows the old pane). iPhone / phone web: the top of the
   Roster tab (coach.html renderRoster hands over the hero, faces and Needs-attention block).
   Everything comes from the app's own model: desk.js dkRowsFresh() → app.js deskRows /
   deskReasons / deskQueue / deskWins / deskNextMeet / coachAthleteStatus, worst first.
   Four numbers about the team, the lifters who need the coach with the fix on each card,
   meets coming up, who is under the bar right now. One red: the first open fix. */
(function () {
  'use strict';
  var LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var LIFT_CLS = { squat: 'l-sq', bench: 'l-be', deadlift: 'l-dl' };
  var ICON = {
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.7-3.1 2.9-5 5.5-5s4.8 1.9 5.5 5"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.8 14.8c1.5.7 2.4 2.3 2.7 4.7"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.8 2.8 0 0 0 2.8 3.6M16 6h2.5a2.8 2.8 0 0 1-2.8 3.6M12 13v3.5M8.5 20h7M10 16.5h4"/>',
    chev: '<path d="m9 6 6 6-6 6"/>', msg: '<path d="M20 11.5a7.8 7.8 0 0 1-11.4 6.9L4 20l1.5-4.3A7.8 7.8 0 1 1 20 11.5z"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>', plan: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>', video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', open: '<path d="M7 17 17 7M9 7h8v8"/>'
  };
  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function first(n) { return String(n || '').trim().split(' ')[0]; }
  function num(v) { return typeof _num === 'function' ? _num(v) : Math.round(Number(v) * 100) / 100; }
  function kg(v) { return typeof exactW === 'function' ? exactW(v) : String(num(v)); }
  function unit() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function node(tag, attrs, html) { var n = document.createElement(tag); if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) n.setAttribute(k, attrs[k]); }); if (html != null) n.innerHTML = html; return n; }
  function avHtml(a, cls) { var name = a.name || '?'; var hue = typeof avatarHue === 'function' ? avatarHue(name) : 0; var ini = typeof initials === 'function' ? initials(name) : name.slice(0, 2).toUpperCase(); return '<span class="ui-av av-h' + hue + (cls ? ' ' + cls : '') + '" data-name="' + esc(name) + '" aria-hidden="true">' + (a.avatarUrl ? '<img src="' + esc(a.avatarUrl) + '" alt="">' : esc(ini)) + '</span>'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function daysText(d) { if (d <= 0) return 'Today'; if (d === 1) return 'Tomorrow'; if (d < 21) return d + ' days'; var w = Math.round(d / 7); return w + (w === 1 ? ' week' : ' weeks'); }
  function dateShort(iso) { try { return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return String(iso).slice(0, 10); } }

  /* ---------- the model: everything Home shows, from the app's own rows ---------- */
  function rows() {
    if (typeof dkRowsFresh === 'function') { dkRowsFresh(); return { rows: _dk.rows || [], q: _dk.queue }; }
    return { rows: [], q: null };
  }
  // The set under the bar right now: the newest set logged in the last 30 minutes, with the
  // session's progress. { lift, title, weight, reps, rpe, done, total, at } or null.
  function liveSet(prog, nowMs) {
    var now = nowMs || Date.now(), best = null;
    ((prog && prog.weeks) || []).forEach(function (w) { (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) {
      if (!s.completed || !s.completedAt || String(s.completedAt).indexOf('T') < 0) return;
      var t = Date.parse(s.completedAt);
      if (!isFinite(t) || now - t < 0 || now - t > 30 * 60000) return;
      if (!best || t > best.t) best = { t: t, day: d, ex: e, set: s };
    }); }); }); });
    if (!best) return null;
    var all = [], done = 0;
    (best.day.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { if (s.extra) return; all.push(s); if (s.completed) done++; }); });
    var title = typeof _exShortTitle === 'function' ? _exShortTitle(best.ex) : (best.ex.exerciseName || LIFT[best.ex.lift] || 'Lift');
    return { lift: best.ex.lift, title: title, weight: best.set.weight, reps: best.set.reps || best.set.plannedReps, rpe: best.set.actualRpe, done: done, total: all.length, at: best.t };
  }
  // Next week's lighter load the app suggests for the lift behind an effort flag: the real fix.
  function suggestionFor(r, reason) {
    var prog = r.status && r.status.program;
    if (!prog || typeof deskWeekReview !== 'function') return null;
    var rev = deskWeekReview(prog);
    if (rev.nextIdx < 0) return null;
    var title = String(reason.text || '').split(' @')[0];
    var cands = rev.rows.filter(function (x) { return x.suggest && x.suggest.kg > 0 && x.next && !x.next.locked; });
    var mine = cands.filter(function (x) { return x.title === title; });
    if (!mine.length) mine = cands.filter(function (x) { return x.suggest.delta < 0; });
    if (!mine.length) return null;
    var x = mine[0], wk = prog.weeks[rev.nextIdx];
    var ex = wk && wk.days[x.next.di] && wk.days[x.next.di].exercises[x.next.ei];
    var st = ex && ex.sets ? ex.sets[x.next.startIdx] : null;
    if (!st) return null;
    var reps = st.plannedReps || st.reps, rpe = st.rpe != null && st.rpe !== '' ? '@' + num(st.rpe) : '';
    return { rows: mine, kg: x.suggest.kg, label: (LIFT[x.lift] || x.title) + ' ' + kg(x.suggest.kg) + (reps ? ' × ' + reps : '') + (rpe ? ' ' + rpe : '') + ' next week', weekNo: wk.number || rev.nextIdx + 1 };
  }
  function applySuggestion(aid, s) {
    var prog = dkProgOf(aid), rev = deskWeekReview(prog);
    var p = dkWsPend(aid, prog, rev.nextIdx);
    s.rows.forEach(function (x) {
      var ex = prog.weeks[rev.nextIdx].days[x.next.di].exercises[x.next.ei];
      var sets = (ex.sets || []).slice(x.next.startIdx, x.next.startIdx + x.next.count).map(function (st) { return Object.assign({}, st, { weight: x.suggest.kg }); });
      p.rows[x.key] = { row: x, sets: sets };
    });
    dkSavePend();
    dkWsApply(aid);
  }
  // What the coach does about the worst reason, in the coach's words. k: msg | apply | open.
  function fixFor(r) {
    var a = r.athlete, aid = a.id, f = first(a.name), reason = r.reasons[0] || {}, t = reason.type, prog = r.status && r.status.program;
    var open = function () { openLifter(aid); };
    switch (t) {
      case 'overshoot': case 'drift': {
        var s = suggestionFor(r, reason);
        if (s) return { k: 'apply', ic: 'down', label: s.label, run: function () { applySuggestion(aid, s); }, done: 'Week ' + s.weekNo + ' updated' };
        return { k: 'open', ic: 'open', label: 'Check next week', run: open };
      }
      case 'pain': return { k: 'msg', ic: 'msg', label: 'Message ' + f, text: 'How is it feeling today? Keep the lift easy and stop if it hurts.' };
      case 'weight': case 'offpace': return { k: 'open', ic: 'open', label: 'See the cut plan', run: open };
      case 'note': case 'message': return { k: 'msg', ic: 'msg', label: 'Reply to ' + f, text: '' };
      case 'checkin': case 'readiness': return { k: 'msg', ic: 'msg', label: 'Message ' + f, text: 'How are you feeling today?' };
      case 'quiet': case 'never': case 'missed': return { k: 'msg', ic: 'msg', label: 'Check in with ' + f, text: 'Missed you this week. All good?' };
      case 'formcheck': return { k: 'open', ic: 'video', label: 'Review the video', run: function () { if (typeof openFormCheckReview === 'function' && reason.formCheckId) openFormCheckReview(reason.formCheckId); else open(); } };
      case 'meet': return { k: 'open', ic: 'trophy', label: 'Plan attempts', run: function () { if (window.MeetDay && MeetDay.planFor) MeetDay.planFor(aid); else open(); } };
      case 'noprogram': return { k: 'open', ic: 'pen', label: 'Write a program', run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(aid); else open(); } };
      case 'blockdone': case 'blockend': return { k: 'open', ic: 'pen', label: 'Write the next block', run: function () { if (typeof openNextBlockSheet === 'function' && prog) openNextBlockSheet(prog.id, aid); else if (typeof openAthleteProgram === 'function') openAthleteProgram(aid); else open(); } };
      case 'stalling': return { k: 'open', ic: 'open', label: 'See progress', run: function () { if (typeof openAthleteNotes === 'function') openAthleteNotes(aid); else open(); } };
      default: return { k: 'open', ic: 'open', label: 'Open ' + f, run: open };
    }
  }
  // The number on the card: the one figure a coach decides on, with its unit.
  function metricFor(r) {
    var reason = r.reasons[0] || {}, t = reason.type, st = r.status || {};
    if (t === 'pain' && st.pain && st.pain.report && st.pain.report.severity != null) return { n: num(st.pain.report.severity) + '/10', u: 'pain', tone: 'pain' };
    if (t === 'pain') return { n: '', u: '', tone: 'pain' };
    if ((t === 'weight' || t === 'offpace') && r.bw && r.bw.over > 0) return { n: '+' + num(r.bw.over), u: unit() + ' over', tone: 'bw' };
    if (t === 'offpace' && st.cut) return { n: 'Cut', u: 'off pace', tone: 'bw' };
    if (t === 'overshoot') { var m = /@([\d.]+) vs @([\d.]+)/.exec(reason.text || ''); if (m) return { n: '+' + num(Number(m[1]) - Number(m[2])), u: 'RPE over', tone: 'rpe' }; }
    if (t === 'drift' && r.drift) return { n: (r.drift.avg > 0 ? '+' : '') + r.drift.avg, u: 'RPE', tone: 'rpe' };
    if (t === 'message' || t === 'note') { var h = /(\d+)\s*(h|d)\b/.exec(reason.text || ''); return { n: h ? h[1] + ' ' + h[2] : 'New', u: 'waiting', tone: 'msg' }; }
    if (t === 'quiet' && st.ago != null) return { n: String(st.ago), u: 'days quiet', tone: 'quiet' };
    if (t === 'never') return { n: '0', u: 'sets yet', tone: 'quiet' };
    if (t === 'missed') { var mm = /Missed (\d+)/.exec(reason.detail || reason.text || ''); return { n: mm ? mm[1] : '1', u: 'missed', tone: 'quiet' }; }
    if (t === 'meet' && r.meet) return { n: r.meet.days <= 0 ? 'Today' : String(r.meet.days), u: r.meet.days <= 0 ? 'meet' : 'days to meet', tone: 'meet' };
    if (t === 'formcheck') return { n: 'Video', u: 'to review', tone: 'msg' };
    if (t === 'blockend' || t === 'blockdone') return { n: 'Block', u: t === 'blockdone' ? 'finished' : 'ends', tone: 'quiet' };
    if (t === 'noprogram') return { n: 'No', u: 'program', tone: 'quiet' };
    if (t === 'checkin') return { n: 'Check-in', u: '', tone: 'quiet' };
    if (t === 'readiness') return { n: 'Low', u: 'readiness', tone: 'quiet' };
    if (t === 'stalling') return { n: 'Flat', u: '3 weeks', tone: 'quiet' };
    return { n: '', u: '', tone: 'quiet' };
  }
  function whyFor(r) {
    var reason = r.reasons[0] || {};
    var lift = (reason.text || '').toLowerCase();
    var l = /squat/.test(lift) ? 'squat' : /bench/.test(lift) ? 'bench' : /deadlift|pull/.test(lift) ? 'deadlift' : null;
    var text = reason.type === 'message' && reason.body ? '“' + reason.body + '”' : (reason.text || '');
    if (reason.type === 'pain') text = r.status && r.status.pain && r.status.pain.text ? r.status.pain.text.replace(/^Pain · /, '').replace(/ · \d+\/10/, '') : 'Pain on today’s check-in';
    if ((reason.type === 'weight' || reason.type === 'offpace') && r.bw) text = num(r.bw.bw) + ' ' + unit() + ' for the ' + r.bw.cls + ' class';
    if (reason.type === 'meet' && reason.detail) text = reason.detail;
    if (reason.type === 'quiet' && reason.detail) text = reason.detail;
    if ((reason.type === 'note' || reason.type === 'formcheck' || reason.type === 'checkin' || reason.type === 'readiness') && reason.detail) text = reason.detail;
    return { text: text, lift: l };
  }
  function model() {
    var R = rows(), all = R.rows, q = R.q;
    var now = Date.now();
    var withMeet = all.filter(function (r) { return r.meet; });
    var done = 0, planned = 0;
    all.forEach(function (r) { var s = r.status && r.status.sessions; if (s) { done += s.done || 0; planned += s.planned || 0; } });
    var missed = all.filter(function (r) { return (r.reasons || []).some(function (x) { return x.type === 'missed'; }); });
    var toWrite = all.filter(function (r) {
      if ((r.reasons || []).some(function (x) { return /^(blockend|blockdone|noprogram)$/.test(x.type); })) return true;
      var prog = r.status && r.status.program;
      if (!prog || typeof deskWeekReview !== 'function') return false;
      var rev = deskWeekReview(prog);
      return rev.nextIdx >= 0 && rev.rows.some(function (x) { return x.suggest && x.suggest.delta; });
    });
    var writeIds = {};
    toWrite.forEach(function (r) { var prog = r.status && r.status.program; var rev = prog && typeof deskWeekReview === 'function' ? deskWeekReview(prog) : null; var wk = rev && rev.nextIdx >= 0 && prog.weeks[rev.nextIdx] ? (prog.weeks[rev.nextIdx].number || rev.nextIdx + 1) : ''; writeIds[r.athlete.id] = wk; });
    var prs = all.filter(function (r) { return (r.wins || []).some(function (w) { return w.type === 'pr'; }); });
    var peaking = withMeet.filter(function (r) { return r.meet.days <= 56; });
    var onPlan = all.filter(function (r) { return !(r.reasons || []).length; });
    var seats = null;
    try {
      var me = typeof user !== 'undefined' && user ? user : (typeof _dkUser === 'function' ? _dkUser() : null);
      if (typeof getCurrentTierLimit === 'function' && typeof getAthleteCount === 'function' && me) {
        var lim = getCurrentTierLimit(), used = getAthleteCount(me.id) + (typeof getPendingInviteCount === 'function' ? getPendingInviteCount(me.id) : 0);
        if (lim < 9999) seats = { limit: lim, used: used, near: used >= Math.floor(lim * 0.8) };
      }
    } catch (e) { seats = null; }
    var queue = q ? q.queue.slice() : all.filter(function (r) { return r.reasons.length; });
    var handled = q ? q.handled : [];
    var need = queue.map(function (r) { return { r: r, fix: fixFor(r), met: metricFor(r), why: whyFor(r), handled: handled.indexOf(r) >= 0 }; });
    var groups = {};
    withMeet.forEach(function (r) {
      var m = r.meet.meet, st = r.status || {};
      var hasPlan = !!(m.attempts || m.openers || m.plan);
      var step, tone;
      if (r.bw && r.bw.over > 0) { step = 'BW +' + num(r.bw.over) + ' over the ' + m.weightClass + ' class'; tone = 'warn'; }
      else if (r.meet.days <= 21 && !hasPlan) { step = 'attempts not set'; tone = 'warn'; }
      else if (st.week && st.week.total) { step = 'week ' + (st.week.idx + 1) + ' of ' + st.week.total + ' on plan'; tone = 'ok'; }
      else { step = 'on plan'; tone = 'ok'; }
      var key = String(m.name || 'Meet').trim().toLowerCase() + '|' + String(m.date || '').slice(0, 10);
      var g = groups[key] || (groups[key] = { key: key, meet: m, days: r.meet.days, entries: [] });
      g.entries.push({ r: r, step: step, tone: tone });
    });
    var meets = Object.keys(groups).map(function (k) {
      var g = groups[k];
      g.entries.sort(function (a, b) { return (a.tone === 'warn' ? 0 : 1) - (b.tone === 'warn' ? 0 : 1); });
      var lead = g.entries[0], warn = g.entries.filter(function (e) { return e.tone === 'warn'; });
      g.r = lead.r; g.tone = lead.tone;
      g.step = g.entries.length === 1 ? first(lead.r.athlete.name) + ' · ' + lead.step
        : (warn.length ? first(lead.r.athlete.name) + ' · ' + lead.step + (warn.length > 1 ? ' · +' + (warn.length - 1) : '') : g.entries.length + ' lifters · all on plan');
      return g;
    }).sort(function (a, b) { return a.days - b.days; });
    var live = all.map(function (r) { var ls = r.live ? liveSet(r.status && r.status.program, now) : null; return ls ? { r: r, set: ls } : null; }).filter(Boolean).sort(function (a, b) { return b.set.at - a.set.at; });
    return {
      rows: all, need: need, meets: meets, live: live, seats: seats, toWrite: toWrite, writeIds: writeIds,
      stats: {
        lifters: { n: all.length, sub: onPlan.length + ' on plan' + (peaking.length ? ' · ' + peaking.length + ' peaking' : ''), short: seats ? seats.used + ' of ' + seats.limit + ' seats' : onPlan.length + ' on plan' },
        sessions: { n: done, of: planned, sub: missed.length ? plural(missed.length, 'missed', 'missed') + ' · ' + missed.map(function (r) { return first(r.athlete.name); }).slice(0, 2).join(', ') : (planned ? 'On track' : 'Nothing planned'), pct: planned ? Math.round(done / planned * 100) : 0 },
        write: { n: toWrite.length, sub: toWrite.length ? first(toWrite[0].athlete.name) + '’s is next' : 'Every week is written', who: toWrite.slice(0, 4) },
        prs: { n: prs.length, sub: prs.length ? first(prs[0].athlete.name) + ' · ' + prs[0].wins.filter(function (w) { return w.type === 'pr'; })[0].text : 'None yet this week', who: prs.slice(0, 4) }
      }
    };
  }

  /* ---------- actions ---------- */
  function openLifter(aid) {
    if (typeof openAthletePage === 'function' && (isDeskNow() || typeof openAthleteSheet !== 'function')) { openAthletePage(aid); return; }
    if (typeof openAthleteSheet === 'function') openAthleteSheet(aid);
  }
  function message(r, text, onSent) {
    var a = r.athlete;
    if (isDeskNow() && typeof dkCompose === 'function') { dkCompose([a.id], { title: 'Message ' + first(a.name), text: text || '', onSent: function () { try { dkNoteHandled(a.id, 'reply'); } catch (e) {} if (onSent) onSent(); } }); return; }
    if (typeof openAthleteMessages === 'function') openAthleteMessages(a.id, a.name);
  }
  function refresh() {
    if (isDeskNow()) { var host = document.getElementById('deskToday'); if (host && host.classList.contains('ch-host')) renderDesk(host); }
    else if (typeof renderRoster === 'function') renderRoster();
  }
  function runFix(item, btn) {
    var f = item.fix, r = item.r;
    if (btn && btn.getAttribute('aria-busy') === 'true') return;
    if (f.k === 'msg') { message(r, f.text, refresh); return; }
    if (f.k === 'apply') {
      if (btn) { btn.setAttribute('aria-busy', 'true'); btn.classList.add('is-busy'); }
      try { f.run(); } catch (e) { console.warn('CoachHome fix', e); if (typeof toast === 'function') toast('Couldn’t update that week. Open the lifter to do it by hand.'); }
      setTimeout(refresh, 50);
      return;
    }
    f.run();
  }

  /* ---------- one card per lifter: how they are doing, in one look ---------- */
  function lastTopSet(prog) {
    if (!prog || typeof programLoggedSets !== 'function') return null;
    var sets = programLoggedSets(prog).filter(function (x) { return x.set && x.set.completed && !x.set.extra; });
    if (!sets.length) return null;
    var last = sets.map(function (x) { return x.date; }).sort().pop();
    var day = sets.filter(function (x) { return x.date === last; });
    var mains = day.filter(function (x) { return x.ex && LIFT[x.ex.lift]; });
    var pick = (mains.length ? mains : day).sort(function (a, b) { return (Number(b.set.weight) || 0) - (Number(a.set.weight) || 0); })[0];
    if (!pick) return null;
    var title = typeof _exShortTitle === 'function' ? _exShortTitle(pick.ex) : (LIFT[pick.ex.lift] || 'Lift');
    var rpe = pick.set.actualRpe != null && pick.set.actualRpe !== '' ? ' @' + num(pick.set.actualRpe) : '';
    var wd = (function () { try { return new Date(last + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' }); } catch (e) { return last; } })();
    return { text: title + ' ' + kg(pick.set.weight) + ' × ' + (pick.set.reps || pick.set.plannedReps || '') + rpe, when: wd, lift: pick.ex.lift };
  }
  function daysFor(aid) {
    try { if (typeof trainingDays === 'function') return trainingDays(aid, 7).map(function (d) { return !!d.on; }); } catch (e) {}
    return null;
  }
  function cardData(r, ctx) {
    var a = r.athlete, st = r.status || {}, flagged = !!(r.reasons && r.reasons.length);
    var d = r.total && r.total.delta != null ? Math.round(r.total.delta) : null;
    var trend = d == null ? { n: '—', u: 'no trend yet', tone: 'mute' } : Math.abs(d) < 1 ? { n: 'Flat', u: 'last 4 weeks', tone: 'mute' } : { n: (d > 0 ? '+' : '−') + Math.abs(d) + ' ' + unit(), u: 'last 4 weeks', tone: d > 0 ? 'ok' : 'warn' };
    var dr = r.drift, felt = !dr || !dr.n ? { t: 'No RPE this week', tone: 'mute' } : dr.avg >= 0.5 ? { t: 'Felt heavier · +' + dr.avg, tone: 'warn' } : dr.avg <= -0.5 ? { t: 'Felt easy · ' + dr.avg, tone: 'cool' } : { t: 'On target', tone: 'ok' };
    var dots = daysFor(a.id);
    var meet = r.meet ? { t: (r.meet.days <= 0 ? 'Meet today' : r.meet.days === 1 ? 'Meet tomorrow' : 'Meet in ' + r.meet.days + ' d'), tone: r.bw && r.bw.over > 0 ? 'warn' : 'meet', sub: r.bw && r.bw.over > 0 ? 'BW +' + num(r.bw.over) : (r.meet.meet.weightClass ? String(r.meet.meet.weightClass).replace(/\s*kg$/i, '') + ' kg' : '') } : null;
    var why = flagged ? whyFor(r) : null, met = flagged ? metricFor(r) : null;
    var win = (r.wins || [])[0];
    var last = lastTopSet(st.program);
    var live = r.live ? liveSet(st.program) : null;
    var action;
    if (flagged) action = fixFor(r);
    else if (ctx.writeIds[a.id]) action = { k: 'open', ic: 'pen', label: 'Write week ' + ctx.writeIds[a.id], run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(a.id); else openLifter(a.id); } };
    else if (win) action = { k: 'msg', ic: 'msg', label: 'Say well done', text: 'Big week. That work is paying off.' };
    else action = { k: 'open', ic: 'open', label: 'Open', run: function () { openLifter(a.id); } };
    return { r: r, a: a, flagged: flagged, trend: trend, felt: felt, dots: dots, meet: meet, why: why, met: met, win: win, last: last, live: live, action: action };
  }
  function lifterCardHtml(c, i) {
    var a = c.a, tone = c.met ? c.met.tone : (c.meet && c.meet.tone === 'warn' ? 'bw' : 'quiet');
    var status;
    if (c.live) status = '<span class="ch-st live"><i class="livedot"></i><b>Under the bar</b> · ' + esc(c.live.title + ' ' + kg(c.live.weight) + ' × ' + (c.live.reps || '')) + (c.live.rpe != null && c.live.rpe !== '' ? ' @' + esc(num(c.live.rpe)) : '') + '</span>';
    else if (c.flagged) status = '<span class="ch-st t-' + tone + '">' + (c.why.lift ? '<i class="dot ' + LIFT_CLS[c.why.lift] + '"></i>' : '') + '<b>' + esc(c.why.text) + '</b></span>';
    else if (c.win) status = '<span class="ch-st win">' + ic('trophy', 2) + '<b>' + esc(c.win.text) + '</b>' + (c.last ? ' · ' + esc(c.last.text) : '') + '</span>';
    else if (c.last) status = '<span class="ch-st">' + (c.last.lift && LIFT_CLS[c.last.lift] ? '<i class="dot ' + LIFT_CLS[c.last.lift] + '"></i>' : '') + esc(c.last.text) + ' <span class="when">· ' + esc(c.last.when) + '</span></span>';
    else status = '<span class="ch-st mute">Nothing logged yet</span>';
    var dots = c.dots ? '<span class="ch-dots" aria-label="This week">' + c.dots.map(function (on, k) { return '<i class="' + (on ? 'on' : '') + (k === c.dots.length - 1 ? ' today' : '') + '"></i>'; }).join('') + '</span>' : '';
    var meet = c.meet ? '<span class="ch-chip t-' + c.meet.tone + '">' + ic('trophy', 2) + esc(c.meet.t) + (c.meet.sub ? '<small>' + esc(c.meet.sub) + '</small>' : '') + '</span>' : '';
    var act = c.action.k === 'open' && c.action.label === 'Open' ? '' : '<button type="button" class="ch-act" data-act="' + esc(a.id) + '">' + esc(c.action.label) + ic('chev', 2.2) + '</button>';
    return '<div class="ch-card ch-lc' + (c.flagged ? ' is-flag' : '') + (c.live ? ' is-live' : '') + ' rise" data-id="' + esc(a.id) + '" style="--i:' + Math.min(12, 2 + i) + '">' +
      '<button type="button" class="cover" data-open="' + esc(a.id) + '" aria-label="Open ' + esc(a.name) + '"></button>' +
      '<div class="ch-lc-top">' + avHtml(a) + '<span class="ch-lc-name">' + esc(a.name) + '</span>' + meet + '</div>' +
      '<div class="ch-lc-mid"><span class="ch-trend t-' + c.trend.tone + '"><b class="num">' + esc(c.trend.n) + '</b><span>' + esc(c.trend.u) + '</span></span>' +
        '<span class="ch-week">' + dots + '<span class="ch-felt t-' + c.felt.tone + '">' + esc(c.felt.t) + '</span></span></div>' +
      '<div class="ch-lc-bot">' + status + act + '</div></div>';
  }
  // The week's work: what the data asks the coach to do, how much is done, and the next one.
  function workFor(M) {
    var jobs = [];
    M.need.forEach(function (x) {
      var t = (x.r.reasons[0] || {}).type;
      var kind = /^(note|message)$/.test(t) ? 'reply' : /^(meet|weight|offpace)$/.test(t) ? 'meet' : /^(blockend|blockdone|noprogram)$/.test(t) ? 'write' : 'check';
      jobs.push({ kind: kind, r: x.r, fix: x.fix, done: x.handled });
    });
    var seen = {};
    jobs.forEach(function (j) { seen[j.r.athlete.id] = 1; });
    M.toWrite.forEach(function (r) { if (!seen[r.athlete.id]) jobs.push({ kind: 'write', r: r, fix: { k: 'open', ic: 'pen', label: 'Write ' + first(r.athlete.name) + '’s week' + (M.writeIds[r.athlete.id] ? ' ' + M.writeIds[r.athlete.id] : ''), run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(r.athlete.id); else openLifter(r.athlete.id); } }, done: false }); });
    var counts = { write: 0, reply: 0, check: 0, meet: 0 };
    jobs.forEach(function (j) { counts[j.kind]++; });
    var open = jobs.filter(function (j) { return !j.done; });
    return { jobs: jobs, counts: counts, done: jobs.length - open.length, next: open[0] || null };
  }
  function workHtml(W, open) {
    var total = W.jobs.length, pct = total ? Math.round(W.done / total * 100) : 0;
    var parts = [['write', 'to write', 'Weeks'], ['reply', 'to answer', 'Replies'], ['check', 'to check', 'Lifters'], ['meet', 'meet prep', '']].filter(function (p) { return W.counts[p[0]]; })
      .map(function (p) { return '<span class="ch-job k-' + p[0] + '"><b class="num">' + W.counts[p[0]] + '</b> ' + esc(p[1]) + '</span>'; }).join('');
    var next = W.next ? '<button type="button" class="ch-btn red ch-next" data-next>' + ic(W.next.fix.ic || 'open', 2) + '<span>Next: ' + esc(W.next.fix.label) + (W.next.fix.label.indexOf(first(W.next.r.athlete.name)) < 0 ? ' · ' + esc(first(W.next.r.athlete.name)) : '') + '</span>' + ic('chev', 2.2) + '</button>'
      : '<span class="ch-btn did">' + ic('check', 2.4) + '<span>All caught up</span></span>';
    return '<div class="ch-card ch-work rise" style="--i:1">' +
      '<div class="ch-work-l"><div class="ch-work-n"><b class="num">' + (total ? total - W.done : 0) + '</b><span>' + (total ? (total - W.done === 1 ? 'job left this week' : 'jobs left this week') + (W.done ? ' · ' + W.done + ' done' : '') : 'nothing waiting this week') + '</span></div>' +
        '<div class="ch-work-bar" aria-hidden="true"><i style="--p:' + pct + '%"></i></div>' +
        '<div class="ch-jobs">' + parts + '</div></div>' +
      '<div class="ch-work-r">' + next + '</div></div>';
  }
  function groupsHtml(M) {
    var ctx = { writeIds: M.writeIds };
    var cards = M.rows.map(function (r) { return cardData(r, ctx); });
    var byId = {}; cards.forEach(function (c) { byId[c.a.id] = c; });
    var needIds = M.need.map(function (x) { return x.r.athlete.id; });
    var need = needIds.map(function (id) { return byId[id]; }).filter(Boolean);
    var rest = cards.filter(function (c) { return needIds.indexOf(c.a.id) < 0; });
    var peak = rest.filter(function (c) { return c.r.meet && c.r.meet.days <= 56; }).sort(function (a, b) { return a.r.meet.days - b.r.meet.days; });
    var plan = rest.filter(function (c) { return !(c.r.meet && c.r.meet.days <= 56); }).sort(function (a, b) { return (b.r.live ? 1 : 0) - (a.r.live ? 1 : 0) || String(a.a.name).localeCompare(String(b.a.name)); });
    var i = 0;
    function sec(title, list, end) { if (!list.length) return ''; return '<div class="ch-sec rise" style="--i:' + Math.min(12, 2 + i) + '">' + title + '<span class="ch-count">' + list.length + '</span>' + (end ? '<span class="ch-end">' + end + '</span>' : '') + '</div><div class="ch-grid">' + list.map(function (c) { return lifterCardHtml(c, i++); }).join('') + '</div>'; }
    return { html: sec('Needs you', need, 'Worst first') + sec('Peaking', peak, 'Meet soonest first') + sec('On plan', plan, ''), cards: byId };
  }

  /* ---------- the laptop page ---------- */
  function renderDesk(host) {
    var M = model();
    host.classList.add('ch-host');
    host.classList.remove('is-setup');
    if (!M.rows.length) { host.classList.add('is-setup'); host.innerHTML = ''; var c = document.createElement('div'); c.className = 'dk-setup'; try { c.appendChild(dkFirstRun()); } catch (e) {} host.appendChild(c); return; }
    var W = workFor(M), G = groupsHtml(M);
    var today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    host.innerHTML = '<div class="ch-home">' +
      '<header class="ch-top rise" style="--i:0"><div><h1 class="ch-h1">Today</h1><p class="ch-sub">' + esc(today) + ' · ' + M.rows.length + ' lifters' + (M.live.length ? ' · <b class="t-live">' + M.live.length + ' under the bar</b>' : '') + '</p></div></header>' +
      workHtml(W, M.need) + G.html + '</div>';
    M.work = W; M.cards = G.cards;
    wire(host, M);
    host.querySelectorAll('.rise').forEach(function (n) { n.addEventListener('animationend', function () { n.classList.remove('rise'); }, { once: true }); });
    requestAnimationFrame(function () { host.classList.add('loaded'); });
  }
  function runAction(c, btn) {
    var f = c.action;
    if (f.k === 'msg') { message(c.r, f.text, refresh); return; }
    if (f.k === 'apply') { if (btn) btn.setAttribute('aria-busy', 'true'); try { f.run(); } catch (e) { console.warn('CoachHome', e); if (typeof toast === 'function') toast('Couldn’t update that week. Open the lifter to do it by hand.'); } setTimeout(refresh, 50); return; }
    f.run();
  }
  function wire(host, M) {
    host._chModel = M;
    if (host._chWired) return;
    host._chWired = true;
    host.addEventListener('click', function (e) {
      var Mx = host._chModel, t = e.target, b;
      if ((b = t.closest('[data-act]'))) { e.preventDefault(); var c = Mx.cards[b.getAttribute('data-act')]; if (c) runAction(c, b); return; }
      if ((b = t.closest('[data-next]'))) { e.preventDefault(); var j = Mx.work && Mx.work.next; if (!j) return; var cc = Mx.cards[j.r.athlete.id]; if (cc && cc.flagged) runAction(cc, b); else if (j.fix.run) j.fix.run(); return; }
      if ((b = t.closest('[data-open]'))) { e.preventDefault(); openLifter(b.getAttribute('data-open')); return; }
    });
  }

  /* ---------- the phone: the top of the Roster tab, the same cards one wide ---------- */
  function renderPhone(area) {
    var M = model();
    if (!M.rows.length) return false;
    var W = workFor(M), G = groupsHtml(M);
    var wrap = node('div', { class: 'ch-phone ch-host' });
    wrap.innerHTML = '<p class="ch-sub">' + esc(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })) + ' · ' + M.rows.length + ' lifters' + (M.live.length ? ' · <b class="t-live">' + M.live.length + ' under the bar</b>' : '') + '</p>' + workHtml(W, M.need) + G.html;
    M.work = W; M.cards = G.cards;
    wire(wrap, M);
    area.appendChild(wrap);
    var sec = area.closest('section');
    if (sec) sec.classList.toggle('ch-seats-ok', !(M.seats && M.seats.near));
    return true;
  }

  window.CoachHome = { model: model, renderDesk: renderDesk, renderPhone: renderPhone, refresh: refresh };
})();
