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
    if (reason.type === 'pain') text = r.status && r.status.pain && r.status.pain.text ? r.status.pain.text.replace(/^Pain · /, '').replace(/ · \d+\/10/, '') : (reason.detail || reason.text || '');
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
      rows: all, need: need, meets: meets, live: live, seats: seats,
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

  /* ---------- the laptop page ---------- */
  function statHtml(key, icon, label, n, small, sub, tone, extra) {
    return '<button type="button" class="ch-stat t-' + tone + '" data-stat="' + key + '">' +
      '<span class="lbl">' + ic(icon, 1.9) + esc(label) + '<span class="go">' + ic('chev') + '</span></span>' +
      '<span class="row"><span class="n num">' + esc(n) + (small ? '<small>' + esc(small) + '</small>' : '') + '</span>' + (extra || '') + '</span>' +
      '<span class="sub">' + sub + '</span></button>';
  }
  function facesHtml(list, more) { if (!list.length) return ''; return '<span class="stack" aria-hidden="true">' + list.map(function (r) { return avHtml(r.athlete, 'sm'); }).join('') + (more > 0 ? '<span class="ui-av sm more-av">+' + more + '</span>' : '') + '</span>'; }
  function cardHtml(item, i, red) {
    var r = item.r, a = r.athlete, f = item.fix, m = item.met, w = item.why;
    var dot = w.lift ? '<i class="dot ' + LIFT_CLS[w.lift] + '"></i>' : (m.tone === 'msg' ? '<i class="dot l-msg"></i>' : '');
    var fix = item.handled
      ? '<span class="ch-btn did">' + ic('check', 2.4) + '<span>' + esc(f.done || 'Done') + '</span></span>'
      : '<button type="button" class="ch-btn ' + (red ? 'red' : 'q2') + '" data-fix="' + esc(a.id) + '">' + ic(f.ic || 'open', f.ic === 'msg' ? 1.8 : 2) + '<span>' + esc(f.label) + '</span></button>';
    return '<div class="ch-card ch-q t-' + m.tone + (item.handled ? ' did' : '') + ' rise" data-id="' + esc(a.id) + '" style="--i:' + (5 + i) + '">' +
      '<button type="button" class="cover" data-open="' + esc(a.id) + '" aria-label="Open ' + esc(a.name) + '"></button>' +
      avHtml(a) +
      '<span class="who"><span class="name">' + esc(a.name) + '</span><span class="why">' + dot + '<span class="wt">' + esc(w.text) + '</span></span></span>' +
      (m.n ? '<span class="met"><b class="num">' + esc(m.n) + '</b><span>' + esc(m.u) + '</span></span>' : '') +
      '<span class="fix">' + fix + '</span></div>';
  }
  function meetHtml(x) {
    var faces = x.entries.slice(0, 3).map(function (e) { return avHtml(e.r.athlete, 'sm'); }).join('') + (x.entries.length > 3 ? '<span class="ui-av sm more-av">+' + (x.entries.length - 3) + '</span>' : '');
    return '<button type="button" class="ch-mt" data-meet="' + esc(x.r.athlete.id) + '"><span class="d' + (x.days <= 21 ? ' soon' : '') + '"><b class="num">' + esc(daysText(x.days)) + '</b><span>' + esc(dateShort(x.meet.date)) + '</span></span>' +
      '<span class="nm"><b>' + esc(x.meet.name || 'Meet') + '</b><span class="st"><i class="sd ' + x.tone + '" aria-hidden="true"></i><span>' + esc(x.step) + '</span></span></span>' +
      '<span class="stack" aria-hidden="true">' + faces + '</span><span class="chev" aria-hidden="true">' + ic('chev', 2.2) + '</span></button>';
  }
  function liveHtml(x, i) {
    var a = x.r.athlete, s = x.set, pct = s.total ? s.done / s.total : 0, C = 138.2;
    return '<div class="ch-card ch-lv rise" style="--i:' + (10 + i) + ';--lc:var(--ch-' + (s.lift || 'squat') + ')" data-id="' + esc(a.id) + '">' +
      '<button type="button" class="cover" data-open="' + esc(a.id) + '" aria-label="Open ' + esc(a.name) + '"></button>' + avHtml(a) +
      '<div class="who"><div class="nm"><b>' + esc(a.name) + '</b><i class="dot ' + (LIFT_CLS[s.lift] || '') + '"></i>' + esc(s.title) + '</div>' +
      '<div class="set num"><span class="w">' + esc(kg(s.weight)) + '</span><span class="u">' + esc(unit()) + '</span><span class="x">×</span><span class="w">' + esc(s.reps || '') + '</span>' + (s.rpe != null && s.rpe !== '' ? '<span class="at">@' + esc(num(s.rpe)) + '</span>' : '') + '</div>' +
      '<div class="st"><span class="ld"><i class="livedot"></i>Under the bar</span> · set ' + s.done + ' of ' + s.total + '</div></div>' +
      '<span class="ring" aria-hidden="true"><svg viewBox="0 0 52 52"><circle class="trk" cx="26" cy="26" r="22" fill="none" stroke-width="4"/><circle class="val" cx="26" cy="26" r="22" fill="none" stroke-width="4" stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - pct)).toFixed(1) + '"/></svg><b class="num">' + s.done + '<small>/' + s.total + '</small></b></span></div>';
  }
  function renderDesk(host) {
    var M = model();
    var need = M.need, open = need.filter(function (x) { return !x.handled; });
    host.classList.add('ch-host');
    host.classList.remove('is-setup');
    if (!M.rows.length) { host.classList.add('is-setup'); host.innerHTML = ''; var c = document.createElement('div'); c.className = 'dk-setup'; try { c.appendChild(dkFirstRun()); } catch (e) {} host.appendChild(c); return; }
    var today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    var S = M.stats;
    var SHOW = 5, visible = open.slice(0, SHOW), rest = open.slice(SHOW);
    var redId = open.length ? open[0].r.athlete.id : null;
    var html = '<div class="ch-home">' +
      '<header class="ch-top rise" style="--i:0"><div><h1 class="ch-h1">Today</h1><p class="ch-sub">' + esc(today) + ' · <b>' + (open.length ? plural(open.length, 'needs you', 'need you') : 'all caught up') + '</b></p></div>' +
      '</header>' +
      '<div class="ch-stats" aria-label="Your team this week">' +
        statHtml('lifters', 'users', 'Lifters', String(S.lifters.n), '', esc(S.lifters.sub), 'team', facesHtml(M.rows.slice(0, 4), M.rows.length - 4)) +
        statHtml('sessions', 'check', 'Sessions this week', String(S.sessions.n), S.sessions.of ? '/' + S.sessions.of : '', esc(S.sessions.sub), 'week', '<span class="meter" style="--p:' + S.sessions.pct + '%" aria-hidden="true"><i></i></span>') +
        statHtml('write', 'pen', 'Weeks to write', String(S.write.n), '', esc(S.write.sub), 'write', facesHtml(S.write.who, 0)) +
        statHtml('prs', 'trophy', 'PRs this week', String(S.prs.n), '', esc(S.prs.sub), 'pr', facesHtml(S.prs.who, 0)) +
      '</div>' +
      '<div class="ch-split">' +
        '<div class="ch-col"><h2 class="ch-sec rise" style="--i:4">Needs you' + (open.length ? '<span class="ch-count">' + open.length + '</span><span class="ch-end">Worst first</span>' : '') + '</h2>' +
          (visible.length ? '<div class="ch-grp">' + visible.map(function (x, i) { return cardHtml(x, i, x.r.athlete.id === redId); }).join('') + '</div>' : '') +
          (rest.length ? '<button type="button" class="ch-card ch-more" data-open="' + esc(rest[0].r.athlete.id) + '">' + facesHtml(rest.slice(0, 3).map(function (x) { return x.r; }), 0) + '<span class="t"><b>' + plural(rest.length, 'more needs you', 'more need you') + '</b> · ' + esc(rest.map(function (x) { return first(x.r.athlete.name); }).slice(0, 4).join(', ')) + '</span><span class="go">' + ic('chev', 2.2) + '</span></button>' : '') +
          (!open.length ? '<div class="ch-card ch-more ok"><span class="okc">' + ic('check', 2.6) + '</span><span class="t"><b>All caught up</b><span class="s">' + (S.write.n ? 'Next: ' + esc(S.write.sub.replace('’s is next', '’s week to write')) : 'Nobody needs you right now') + '</span></span></div>' : '') +
        '</div>' +
        '<div class="ch-col"><h2 class="ch-sec rise" style="--i:6">Meets coming up' + (M.meets.length ? '<span class="ch-count">' + M.meets.length + '</span>' : '') + '</h2>' +
          (M.meets.length ? '<div class="ch-card ch-meets rise" style="--i:7">' + M.meets.slice(0, 4).map(meetHtml).join('') + '<button type="button" class="ch-mt all" data-meets><span class="t">All ' + (M.meets.length === 1 ? 'meets' : M.meets.length + ' meets') + '</span><span class="chev" aria-hidden="true">' + ic('chev', 2.2) + '</span></button></div>' : '<div class="ch-card ch-more idle"><span class="okc">' + ic('trophy', 2) + '</span><span class="t"><b>No meets on the calendar</b><span class="s">Plan one from a lifter’s page.</span></span></div>') +
          '<h2 class="ch-sec next rise" style="--i:8">Training now' + (M.live.length ? '<i class="livedot"></i><span class="ch-count">' + M.live.length + '</span>' : '') + '</h2>' +
          (M.live.length ? '<div class="ch-lst">' + M.live.slice(0, 3).map(liveHtml).join('') + '</div>' : '<div class="ch-card ch-more idle"><span class="okc">' + ic('clock', 2) + '</span><span class="t"><b>Nobody under the bar</b></span></div>') +
        '</div>' +
      '</div></div>';
    host.innerHTML = html;
    wire(host, M);
    host.querySelectorAll('.rise').forEach(function (n) { n.addEventListener('animationend', function () { n.classList.remove('rise'); }, { once: true }); });
    requestAnimationFrame(function () { host.classList.add('loaded'); });
  }
  function wire(host, M) {
    if (host._chWired) { host._chModel = M; return; }
    host._chWired = true; host._chModel = M;
    host.addEventListener('click', function (e) {
      var Mx = host._chModel, t = e.target, b;
      if ((b = t.closest('[data-fix]'))) { e.preventDefault(); var item = Mx.need.filter(function (x) { return x.r.athlete.id === b.getAttribute('data-fix'); })[0]; if (item) runFix(item, b); return; }
      if ((b = t.closest('[data-open]'))) { e.preventDefault(); openLifter(b.getAttribute('data-open')); return; }
      if ((b = t.closest('[data-meet]'))) { e.preventDefault(); if (isDeskNow() && typeof deskGo === 'function') deskGo('meets'); else openLifter(b.getAttribute('data-meet')); return; }
      if ((b = t.closest('[data-meets]'))) { e.preventDefault(); if (isDeskNow() && typeof deskGo === 'function') deskGo('meets'); return; }
      if ((b = t.closest('[data-find]'))) { e.preventDefault(); if (typeof openDeskPalette === 'function') openDeskPalette(); return; }
      if ((b = t.closest('[data-stat]'))) {
        e.preventDefault();
        var k = b.getAttribute('data-stat');
        if (k === 'lifters' || k === 'sessions') { if (isDeskNow() && typeof deskGo === 'function') deskGo('roster'); }
        else if (k === 'write') { var w = Mx.stats.write.who[0]; if (w && typeof openAthleteProgram === 'function') openAthleteProgram(w.athlete.id); else if (isDeskNow()) deskGo('programs'); }
        else if (k === 'prs') { var p = Mx.stats.prs.who[0]; if (p) openLifter(p.athlete.id); }
      }
    });
  }

  /* ---------- the phone: the top of the Roster tab ---------- */
  function phoneStat(icon, label, n, small, sub, tone, onClick) {
    var b = node('button', { type: 'button', class: 'ch-stat t-' + tone }, '<span class="lbl">' + ic(icon, 1.9) + esc(label) + '</span><span class="row"><span class="n num">' + esc(n) + (small ? '<small>' + esc(small) + '</small>' : '') + '</span></span><span class="sub">' + esc(sub) + '</span>');
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function endNum(n, u, tone) { return node('span', { class: 'ch-met t-' + tone }, '<b class="num">' + esc(n) + '</b>' + (u ? '<span>' + esc(u) + '</span>' : '')); }
  function renderPhone(area) {
    if (typeof uiRow !== 'function' || typeof uiList !== 'function' || typeof uiLabel !== 'function') return false;
    var M = model();
    if (!M.rows.length) return false;
    var S = M.stats, open = M.need.filter(function (x) { return !x.handled; });
    var wrap = node('div', { class: 'ch-phone' });
    wrap.appendChild(node('div', { class: 'ch-ptop' }, '<p class="ch-sub">' + esc(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })) + ' · <b>' + (open.length ? plural(open.length, 'needs you', 'need you') : 'all caught up') + '</b></p>'));
    var stats = node('div', { class: 'ch-stats' });
    stats.appendChild(phoneStat('users', 'Lifters', String(S.lifters.n), '', S.lifters.short, 'team', null));
    stats.appendChild(phoneStat('check', 'Sessions this week', String(S.sessions.n), S.sessions.of ? '/' + S.sessions.of : '', S.sessions.sub, 'week', null));
    stats.appendChild(phoneStat('pen', 'Weeks to write', String(S.write.n), '', S.write.sub, 'write', function () { var w = S.write.who[0]; if (w && typeof openAthleteProgram === 'function') openAthleteProgram(w.athlete.id); }));
    stats.appendChild(phoneStat('trophy', 'PRs this week', String(S.prs.n), '', S.prs.sub, 'pr', function () { var p = S.prs.who[0]; if (p) openLifter(p.athlete.id); }));
    wrap.appendChild(stats);
    if (open.length) {
      wrap.appendChild(uiLabel('Needs you', { count: open.length }));
      wrap.appendChild(uiList(open.slice(0, 6).map(function (x) {
        var a = x.r.athlete;
        return uiRow({ av: a.name, title: a.name, sub: x.why.text, endNode: x.met.n ? endNum(x.met.n, x.met.u, x.met.tone) : null, chevron: true, onClick: function () { openLifter(a.id); } });
      })));
      if (open.length > 6) wrap.appendChild(uiList([uiRow({ title: plural(open.length - 6, 'more needs you', 'more need you'), sub: open.slice(6).map(function (x) { return first(x.r.athlete.name); }).join(', '), chevron: true, onClick: function () { openLifter(open[6].r.athlete.id); } })]));
    } else {
      wrap.appendChild(uiLabel('Needs you'));
      wrap.appendChild(uiList([uiRow({ title: 'All caught up', sub: S.write.n ? 'Next: ' + S.write.sub.replace('’s is next', '’s week to write') : 'Nobody needs you right now' })]));
    }
    if (M.meets.length) {
      wrap.appendChild(uiLabel('Meets coming up', { count: M.meets.length }));
      wrap.appendChild(uiList(M.meets.slice(0, 4).map(function (x) {
        return uiRow({ av: x.r.athlete.name, title: (x.meet.name || 'Meet'), sub: x.step, subTone: x.tone === 'warn' ? 'alert' : null, endNode: endNum(daysText(x.days), '', 'meet'), chevron: true, onClick: function () { openLifter(x.r.athlete.id); } });
      })));
    }
    if (M.live.length) {
      wrap.appendChild(uiLabel('Training now', { count: M.live.length }));
      wrap.appendChild(uiList(M.live.slice(0, 3).map(function (x) {
        var s = x.set;
        return uiRow({ av: x.r.athlete.name, title: x.r.athlete.name, sub: s.title + ' · set ' + s.done + ' of ' + s.total, endNode: endNum(kg(s.weight) + ' × ' + (s.reps || ''), s.rpe != null && s.rpe !== '' ? '@' + num(s.rpe) : '', 'live'), chevron: true, onClick: function () { openLifter(x.r.athlete.id); } });
      })));
    }
    area.appendChild(wrap);
    var sec = area.closest('section');
    if (sec) sec.classList.toggle('ch-seats-ok', !(M.seats && M.seats.near));
    return true;
  }

  window.CoachHome = { model: model, renderDesk: renderDesk, renderPhone: renderPhone, refresh: refresh };
})();
