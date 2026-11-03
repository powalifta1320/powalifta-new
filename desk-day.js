/* desk-day.js: the coach's day on the laptop (3 Nov 2026). What a powerlifting coach checks at 7 am and between
   sessions, on the two screens they live in (html.desk only; the phone and the iPhone app never draw any of it):
     Today (coach-lifters.js renderToday hands each block over):
       Training today   who trained (done), who is under the bar now, who is still to come and who missed yesterday.
                        "To come" is only what we know: a day pinned to today, or the weekday they have trained on 3 of
                        the last 4 weeks; nothing is guessed. Message the ones who missed in one go.
       This week        the next 7 days as an agenda: meets and weigh-ins (gold), weeks to publish and blocks ending
                        (cyan), the weekly check-in, payments due (overdue in amber).
       Wins this week   each PR as a small card (the lift, the set, the lifter) with a one-tap "Nice lift".
       Check-ins        a card in Your team: who sent one this week (a ring), what the answers flag (pain, short
                        sleep, soreness 7+, stress), Remind the ones who haven't.
     A lifter's page (coach-lifters.js summaryHtml, the desk only):
       The week         session by session: each day's status and date, the main lifts' top set as written and as
                        lifted (the dot says how hard against the RPE written), missed days. A day opens in Programs.
       Meet plan        the meet card grown: attempts per lift (set or not), the class against the bodyweight trend,
                        the total and DOTS today's maxes point to, Plan attempts.
       Readiness, pain  each check-in question as a small trend over 6 weeks; every pain report (where, how bad, the
                        lift, when, and what you said).
       Notes, history   one timeline: your private notes (with a box to add one), their session notes, messages, form
                        checks, PRs and blocks, filtered by chips.
   Everything is drawn from the app's own model (desk.js dkRowsFresh → app.js deskRows); the pure parts take their data
   as arguments and are unit-tested in tests.html ("desk day (desk-day.js)"). The demo writes nothing: a message goes
   through desk.js dkSendMessage, which keeps it on the page. No top-level declarations: everything lives in here. */
(function () {
  'use strict';
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var LCLS = { squat: 'l-sq', bench: 'l-be', deadlift: 'l-dl' };
  var IC = {
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    msg: '<path d="M20 11.5a7.8 7.8 0 0 1-11.4 6.9L4 20l1.5-4.3A7.8 7.8 0 1 1 20 11.5z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.8 2.8 0 0 0 2.8 3.6M16 6h2.5a2.8 2.8 0 0 1-2.8 3.6M12 13v3.5M8.5 20h7M10 16.5h4"/>',
    flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
    note: '<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M14 3.5V8h4M9 12h6M9 15.5h4"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    blocks: '<path d="M4 20V10M9 20V4M15 20v-7M20 20V8"/>',
    pr: '<path d="m12 3.5 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z"/>',
    scale: '<rect x="4" y="5" width="16" height="15" rx="4"/><path d="M8.8 10.2a3.6 3.6 0 0 1 6.4 0"/><path d="m12 10.6 1.4-1.6"/>',
    wallet: '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M3 6.5A2.5 2.5 0 0 0 5.5 9h13A1.5 1.5 0 0 1 20 10.5V15h-4a2 2 0 0 1 0-4h4"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>'
  };
  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || '') + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function first(n) { return String(n || '').trim().split(/\s+/)[0]; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function r1(v) { return Math.round(Number(v) * 10) / 10; }
  function n2(v) { var x = Number(v); return isFinite(x) ? Math.round(x * 100) / 100 : 0; }
  function numOr(v) { return v != null && v !== '' && isFinite(Number(v)) ? Number(v) : null; }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function d10(v) { return String(v == null ? '' : v).slice(0, 10); }
  function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function addDays(iso, n) { var d = new Date(d10(iso) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function mondayOf(iso) { var d = new Date(d10(iso) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(d10(b) + 'T12:00:00Z') - Date.parse(d10(a) + 'T12:00:00Z')) / 86400000); }
  function dow(iso) { return (new Date(d10(iso) + 'T12:00:00Z').getUTCDay() + 6) % 7; }   // Mon 0 … Sun 6
  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function kgShow(v) { return typeof kgToDisplay === 'function' ? kgToDisplay(v) : Number(v); }
  function unit() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function wt(v) { return String(n2(kgShow(v))); }
  // Dates in the device's own format, like the rest of the app: "Tue 3", "Nov 3", "Tue, Nov 3".
  function localDate(iso, o) { try { var d = new Date(d10(iso) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString(undefined, o); } catch (e) { return ''; } }
  function dayShort(iso) { return localDate(iso, { weekday: 'short', day: 'numeric' }) || d10(iso).slice(5); }
  function dayMonth(iso) { return localDate(iso, { day: 'numeric', month: 'short' }) || d10(iso).slice(5); }
  function dateLong(iso) { return localDate(iso, { weekday: 'short', day: 'numeric', month: 'short' }) || d10(iso); }
  function weekdayLong(iso) { return localDate(iso, { weekday: 'long' }) || ''; }
  function whenText(iso, t) { var d = daysBetween(d10(iso), t || todayIso()); if (d <= 0) return 'Today'; if (d === 1) return 'Yesterday'; if (d < 7) return localDate(iso, { weekday: 'short' }) || dayMonth(iso); return dayMonth(iso); }
  function toSet(v) { if (!v) return new Set(); if (v instanceof Set) return v; return new Set(Array.isArray(v) ? v.map(d10) : []); }
  function avHtml(a, cls) {
    var name = (a && a.name) || '?', hue = typeof avatarHue === 'function' ? avatarHue(name) : 0, ini = typeof initials === 'function' ? initials(name) : name.slice(0, 2).toUpperCase();
    return '<span class="ui-av av-h' + hue + (cls ? ' ' + cls : '') + '" data-name="' + esc(name) + '" aria-hidden="true">' + (a && a.avatarUrl ? '<img src="' + esc(a.avatarUrl) + '" alt="">' : esc(ini)) + '</span>';
  }
  function isMain(l) { return LIFTS.indexOf(l) >= 0; }
  function cap(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function topOf(lo, hi) { var a = numOr(lo), b = numOr(hi); return b != null && a != null && b > a ? b : a; }

  /* =====================================================================================
     PURE: Today
     ===================================================================================== */
  // A weekday they train on: the same weekday in at least `need` of the `weeks` before iso. has(iso) → bool.
  function habitOn(has, iso, weeks, need) {
    weeks = weeks || 4; need = need || 3;
    var n = 0;
    for (var k = 1; k <= weeks; k++) if (has(addDays(iso, -7 * k))) n++;
    return n >= need;
  }
  // The program's days pinned to a date (athlete.html pinDayToDate: day.scheduledDate). → [{ wi, di, name, done, open }]
  function pinsOn(prog, iso) {
    var out = [];
    ((prog && prog.weeks) || []).forEach(function (w, wi) {
      ((w && w.days) || []).forEach(function (d, di) {
        if (!d || d10(d.scheduledDate) !== iso) return;
        var sets = []; (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { if (!s.extra) sets.push(s); }); });
        if (!sets.length) return;
        var done = sets.filter(function (s) { return s.completed; }).length;
        out.push({ wi: wi, di: di, name: d.name || 'Session', done: done, open: done < sets.length });
      });
    });
    return out;
  }
  // Training today, one state per lifter (the first that holds): live (a set in the last 30 minutes), done (a set logged
  // today), meet (competing today: neither to come nor missed), missed (planned yesterday, nothing logged yesterday or
  // today), todo (planned today). Planned is only what we know: a day pinned to the date; else a busy week the coach
  // approved (its agreed days); else, with a block running, trained in the last week and sessions still to do this week,
  // the weekday they trained on in 3 of the last 4 weeks. o: { today, datesOf(id) → Set | [iso], agreedOf(id) → [iso] | null }
  // → { today, yesterday, live, done, todo, missed, meet: [{ r, why: 'pinned' | 'agreed' | 'usual' | null, day }], n }
  function trainingToday(rows, o) {
    o = o || {};
    var t = o.today || todayIso(), y = addDays(t, -1);
    var out = { today: t, yesterday: y, live: [], done: [], todo: [], missed: [], meet: [], n: (rows || []).length };
    (rows || []).forEach(function (r) {
      var id = r.athlete.id, st = r.status || {}, prog = st.program, wk = st.week;
      var set = toSet(o.datesOf ? o.datesOf(id) : null), has = function (d) { return set.has(d); };
      var pinT = pinsOn(prog, t), pinY = pinsOn(prog, y);
      if (r.live) { out.live.push({ r: r, why: null, day: null, at: r.live.at || 0 }); return; }
      if (has(t) || pinT.some(function (p) { return p.done > 0; })) { out.done.push({ r: r, why: null, day: null }); return; }
      if (r.meet && r.meet.days === 0) { out.meet.push({ r: r, why: null, day: null }); return; }
      var agreed = o.agreedOf ? o.agreedOf(id) : null;
      var running = !!(prog && wk && !wk.finished && Number(wk.sessionsPerWeek) > 0), current = st.ago != null && st.ago <= 7;
      var planned = Number(wk && wk.sessionsPerWeek) || 0;
      // Sessions left in the week a date falls in (Monday to Sunday), from the days they trained.
      var leftIn = function (iso) {
        var mon = mondayOf(iso), n = 0;
        for (var k = 0; k < 7; k++) { var d = addDays(mon, k); if (d < iso && has(d)) n++; }
        return planned - n;
      };
      var why = function (iso, pins) {
        if (pins.length) return { why: 'pinned', day: pins[0].name, pin: pins[0] };
        if (agreed) return agreed.indexOf(iso) >= 0 ? { why: 'agreed', day: null } : null;
        return running && current && leftIn(iso) > 0 && habitOn(has, iso) ? { why: 'usual', day: null } : null;
      };
      var wy = why(y, pinY);
      if (wy && !has(y) && !(wy.pin && wy.pin.done > 0)) { out.missed.push({ r: r, why: wy.why, day: wy.day }); return; }
      var wt0 = why(t, pinT);
      if (wt0 && !(wt0.pin && !wt0.pin.open)) out.todo.push({ r: r, why: wt0.why, day: wt0.day });
    });
    var nm = function (a, b) { return String(a.r.athlete.name).localeCompare(String(b.r.athlete.name)); };
    out.live.sort(function (a, b) { return (b.at || 0) - (a.at || 0) || nm(a, b); });
    out.done.sort(nm); out.missed.sort(nm); out.meet.sort(nm);
    out.todo.sort(function (a, b) { return (a.why === 'pinned' ? 0 : 1) - (b.why === 'pinned' ? 0 : 1) || nm(a, b); });
    return out;
  }

  // Check-ins this week (Monday to today). A lifter is asked when one of the coach's questions applies to them, or they
  // have used the weekly form before; they sent one when any answer (or the form) landed this week. Flags read each
  // question's latest answer this week: pain (a yes), sleep (under 6 hours; a 1 to 10 sleep of 3 or less), soreness (7
  // or more out of 10), stress (7 or more; the weekly form's calm of 3 or less). Pain first, then the order above.
  // o: { today, questions, answers, checkins } → { mon, asked, sent, pct, missing: [r], flags: [{ key, label, who: [{ r, text }] }] }
  var FLAG_ORDER = ['pain', 'sleep', 'soreness', 'stress'];
  var FLAG_LABEL = { pain: 'Pain or niggles', sleep: 'Under 6 h sleep', soreness: 'Soreness 7+', stress: 'Stress 7+' };
  function questionKind(q) {
    var p = String((q && q.prompt) || '');
    if (/pain|niggle|injur|hurt/i.test(p)) return 'pain';
    if (/sore/i.test(p)) return 'soreness';
    if (/stress/i.test(p)) return 'stress';
    if (/sleep/i.test(p)) return 'sleep';
    return null;
  }
  function questionsFor(qs, id) {
    if (typeof checkinQuestionsFor === 'function') return checkinQuestionsFor(qs, id);
    return (qs || []).filter(function (q) { return q.active !== false && (!q.athleteIds || !q.athleteIds.length || q.athleteIds.indexOf(id) >= 0); });
  }
  function checkinsWeek(rows, o) {
    o = o || {};
    var t = o.today || todayIso(), mon = mondayOf(t);
    var qs = (o.questions || []).filter(function (q) { return q && q.active !== false; });
    var byAth = {}, legacy = {};
    (o.answers || []).forEach(function (a) { if (a && a.athleteId) (byAth[a.athleteId] = byAth[a.athleteId] || []).push(a); });
    (o.checkins || []).forEach(function (c) { if (c && c.athleteId) (legacy[c.athleteId] = legacy[c.athleteId] || []).push(c); });
    var out = { mon: mon, asked: 0, sent: 0, pct: 0, missing: [], flags: [] }, flags = {};
    var flag = function (key, r, text) { (flags[key] = flags[key] || []).push({ r: r, text: text }); };
    (rows || []).forEach(function (r) {
      var id = r.athlete.id, mine = questionsFor(qs, id), leg = legacy[id] || [];
      if (!mine.length && !leg.length) return;
      out.asked++;
      var inWeek = function (d) { d = d10(d); return d >= mon && d <= t; };
      var ans = (byAth[id] || []).filter(function (a) { return inWeek(a.period); });
      var legW = leg.filter(function (c) { return inWeek(c.weekStart) || inWeek(c.createdAt); })
        .sort(function (a, b) { return String(b.createdAt || b.weekStart).localeCompare(String(a.createdAt || a.weekStart)); });
      if (!ans.length && !legW.length) { out.missing.push(r); return; }
      out.sent++;
      var got = {};
      mine.forEach(function (q) {
        var k = questionKind(q);
        if (!k || got[k]) return;
        var a = ans.filter(function (x) { return x.questionId === q.id && x.num != null && x.num !== ''; }).sort(function (x, y) { return String(y.period).localeCompare(String(x.period)); })[0];
        if (!a) return;
        var v = Number(a.num), when = whenText(a.period, t).toLowerCase();
        if (k === 'pain' && q.kind === 'yesno' && v >= 1) { got.pain = 1; flag('pain', r, 'yes ' + when); }
        else if (k === 'sleep' && q.kind === 'number' && v > 0 && v < 6) { got.sleep = 1; flag('sleep', r, n2(v) + ' h'); }
        else if (k === 'sleep' && q.kind === 'scale' && v <= 3) { got.sleep = 1; flag('sleep', r, n2(v) + '/10'); }
        else if ((k === 'soreness' || k === 'stress') && q.kind === 'scale' && v >= 7) { got[k] = 1; flag(k, r, n2(v) + '/10'); }
      });
      // The older weekly form: every scale reads 10 as good (sleep, fresh, calm).
      var c = legW[0];
      if (c) {
        if (!got.sleep && Number(c.sleep) > 0 && Number(c.sleep) <= 3) flag('sleep', r, 'sleep ' + n2(c.sleep) + '/10');
        if (!got.soreness && Number(c.soreness) > 0 && Number(c.soreness) <= 3) flag('soreness', r, 'fresh ' + n2(c.soreness) + '/10');
        if (!got.stress && Number(c.stress) > 0 && Number(c.stress) <= 3) flag('stress', r, 'calm ' + n2(c.stress) + '/10');
      }
    });
    out.pct = out.asked ? Math.round(out.sent / out.asked * 100) : 0;
    out.flags = FLAG_ORDER.filter(function (k) { return flags[k] && flags[k].length; }).map(function (k) { return { key: k, label: FLAG_LABEL[k], who: flags[k] }; });
    return out;
  }

  // The next 7 days (today first), one column a day: meets and weigh-ins (gold), a week to publish and a block ending
  // (cyan), the weekly check-in (ink), payments due (ink) and overdue (amber, on today). Each kind is one line a day, its
  // lifters with it. o: { today, days, meets, isPlanned(m), billing, statusOf(b, today) → { state, due }, money(cents, cur),
  //   questions, unpublished(prog, today) → { days, number } | null, endsOn(prog, today) → iso | null }
  // → { from, to, days: [{ iso, today, items: [{ kind, tone, text, who: [r], ids, warn: [r], go }] }], n }
  var AG_ORDER = ['meet', 'weighin', 'overdue', 'publish', 'blockend', 'checkin', 'due'];
  var AG_TONE = { meet: 'gold', weighin: 'gold', overdue: 'amber', publish: 'cyan', blockend: 'cyan', checkin: 'ink', due: 'ink' };
  function agenda(rows, o) {
    o = o || {};
    var t = o.today || todayIso(), N = o.days || 7, to = addDays(t, N - 1);
    var days = [];
    for (var i = 0; i < N; i++) days.push({ iso: addDays(t, i), today: i === 0, items: [] });
    var byId = {}; (rows || []).forEach(function (r) { byId[r.athlete.id] = r; });
    var slot = {};
    var add = function (iso, kind, key, r, extra) {
      if (iso < t || iso > to) return;
      var k = iso + '|' + kind + '|' + key, it = slot[k];
      if (!it) {
        it = slot[k] = Object.assign({ kind: kind, tone: AG_TONE[kind], key: key, who: [], warn: [], cents: 0, n: 0, currency: null }, extra || {});
        days[daysBetween(t, iso)].items.push(it);
      }
      it.n++;
      if (r && it.who.indexOf(r) < 0) it.who.push(r);
      return it;
    };
    var planned = o.isPlanned || function (m) { return !!m && (m.status === 'planned' || m.planned === true); };
    (o.meets || []).forEach(function (m) {
      var r = m && byId[m.athleteId];
      if (!r || !planned(m) || !isIso(d10(m.date))) return;
      var d = d10(m.date), name = String(m.name || 'Meet').trim() || 'Meet', key = name.toLowerCase() + '|' + d;
      var it = add(d, 'meet', key, r, { name: name });
      var wi = isIso(d10(m.weighInAt)) ? d10(m.weighInAt) : null;
      if (wi && wi !== d) {
        var w = add(wi, 'weighin', key, r, { name: name });
        if (w && r.bw && r.bw.over > 0 && w.warn.indexOf(r) < 0) w.warn.push(r);
      } else if (it && r.bw && r.bw.over > 0 && it.warn.indexOf(r) < 0) it.warn.push(r);
    });
    (rows || []).forEach(function (r) {
      var prog = r.status && r.status.program, wk = r.status && r.status.week;
      if (!prog) return;
      var up = o.unpublished ? o.unpublished(prog, t) : null;
      if (up && up.days != null && up.days < N) add(up.days <= 0 ? t : addDays(t, up.days), 'publish', 'w', r, { week: up.number });
      if (wk && !wk.finished && o.endsOn) { var end = o.endsOn(prog, t); if (end && end >= t && end <= to) add(end, 'blockend', 'b', r); }
    });
    if ((o.questions || []).some(function (q) { return q && q.active !== false && q.cadence === 'weekly'; })) {
      var mon = dow(t) === 0 ? t : addDays(mondayOf(t), 7);
      add(mon, 'checkin', 'c', null);
    }
    (o.billing || []).forEach(function (b) {
      var r = b && byId[b.athleteId];
      if (!r || !o.statusOf) return;
      var s = o.statusOf(b, t) || {};
      var it = s.state === 'overdue' ? add(t, 'overdue', 'p', r) : (s.state === 'due' || s.state === 'soon') && s.due ? add(d10(s.due), 'due', 'p', r) : null;
      if (it) { it.cents += Number(b.amountCents) || 0; it.currency = it.currency || b.currency || null; }
    });
    var money = o.money || function (c) { return '$' + Math.round(c / 100); };
    days.forEach(function (d) {
      d.items.sort(function (a, b) { return AG_ORDER.indexOf(a.kind) - AG_ORDER.indexOf(b.kind); });
      d.items.forEach(function (it) {
        var n = it.who.length;
        it.ids = it.who.map(function (r) { return r.athlete.id; });
        if (it.kind === 'meet') it.text = it.name;
        else if (it.kind === 'weighin') it.text = 'Weigh-in · ' + it.name;
        else if (it.kind === 'publish') it.text = n === 1 ? 'Publish week ' + it.week : 'Publish ' + n + ' weeks';
        else if (it.kind === 'blockend') it.text = n === 1 ? 'Block ends' : n + ' blocks end';
        else if (it.kind === 'checkin') it.text = 'Weekly check-in';
        else if (it.kind === 'due') it.text = (n === 1 ? money(it.cents, it.currency) + ' due' : n + ' payments · ' + money(it.cents, it.currency));
        else if (it.kind === 'overdue') it.text = n + ' overdue · ' + money(it.cents, it.currency);
      });
    });
    return { from: t, to: to, days: days, n: days.reduce(function (s, d) { return s + d.items.length; }, 0) };
  }

  // This week's PRs (app.js deskWins: the lifts that set a new best e1RM in the last 7 days), one card a lift: the set that
  // set it (the best of the week), its e1RM and how far past the best before the week. o: { today, logsOf(id), isPR(id, log) }
  // → [{ r, lift, date, weight, reps, rpe, e1rm, delta }] newest first, then the biggest jump
  function winsWeek(rows, o) {
    o = o || {};
    var t = o.today || todayIso(), since = addDays(t, -6), out = [];
    (rows || []).forEach(function (r) {
      var w = (r.wins || []).filter(function (x) { return x && x.type === 'pr'; })[0];
      if (!w || !o.logsOf) return;
      var id = r.athlete.id, logs = o.logsOf(id) || [];
      (w.lifts || []).forEach(function (L) {
        var mine = logs.filter(function (l) { return l && l.lift === L && Number(l.e1rmComp) > 0; });
        var best = null, before = 0;
        mine.forEach(function (l) {
          var d = d10(l.date);
          if (d < since) { before = Math.max(before, Number(l.e1rmComp)); return; }
          if (d > t || !(o.isPR ? o.isPR(id, l) : true)) return;
          if (!best || Number(l.e1rmComp) > Number(best.e1rmComp)) best = l;
        });
        if (!best) return;
        out.push({ r: r, lift: L, date: d10(best.date), weight: Number(best.weight) || 0, reps: Number(best.reps) || 0, rpe: numOr(best.rpe),
          e1rm: Number(best.e1rmComp), delta: before > 0 ? r1(Number(best.e1rmComp) - before) : null });
      });
    });
    return out.sort(function (a, b) { return b.date.localeCompare(a.date) || (b.delta || 0) - (a.delta || 0) || String(a.r.athlete.name).localeCompare(String(b.r.athlete.name)); });
  }

  /* =====================================================================================
     PURE: a lifter's page
     ===================================================================================== */
  // The week, session by session, from Programs' own model (desk-program.js DeskProgram.model, so a day reads here as it
  // does there): each day's status and date, its main lifts' first line (the top set, or the work sets) as written and
  // its top set as lifted, with the gap against the RPE written. Rest days and empty days are left out.
  // M: DeskProgram.model(weeks, wi, env) → [{ di, name, status, date, dateKind, lifts: [{ lift, name, tag, sets, reps,
  //   load, effort, lifted, tone }], more }]
  function sessionsOf(M) {
    var out = [];
    ((M && M.days) || []).forEach(function (D) {
      if (!D || D.rest || D.empty || !D.sum || D.sum.status === 'rest' || D.sum.status === 'empty') return;
      var mains = (D.exercises || []).filter(function (x) { return x.main && x.lines && x.lines.length; });
      var lifts = mains.slice(0, 2).map(function (x) {
        var ln = x.lines[0], L = ln.lifted || null;
        var top = L && L.top ? L.top : null;
        var tone = !L ? '' : !top ? 'missed' : L.gapN == null ? 'done' : L.gapN >= 1 ? 'alert' : L.gapN >= 0.5 ? 'warn' : L.gapN <= -0.5 ? 'easy' : 'ok';
        var g = ln.g || {};
        return { lift: x.lift, name: x.name, tag: x.tag || '', sets: ln.sets, reps: ln.reps, pct: numOr(g.pct), kg: Number(g.weight) > 0 ? Number(g.weight) : null, est: ln.load && ln.load.est ? ln.load.est : 0,
          effort: (ln.effort && ln.effort.text) || '', role: ln.role || '', lifted: L ? { text: L.text, top: top ? { weight: Number(top.weight) || 0, reps: Number(top.reps) || 0, rpe: numOr(top.actualRpe) } : null, gap: L.gapN } : null, tone: tone };
      });
      out.push({ di: D.idx, name: D.name || 'Day ' + (D.idx + 1), status: D.sum.status, date: D.sum.date || '', dateKind: D.sum.dateKind || '', lifts: lifts,
        more: Math.max(0, (D.exercises || []).length - lifts.length), done: D.sum.done, total: D.sum.total });
    });
    return out;
  }

  // The meet, planned: its facts, the attempts per lift (set or not), the class against the bodyweight trend, and the
  // total today's maxes point to with its score. o: { meet, days, plan ({ squat: [kg, kg, kg] … }), maxes ({ lift: kg }),
  //   bw: [{ date, kg }] (oldest first), sex, score(total, bw, sex, meet) → { label, points }, line (app.js meetWeighLine's
  //   answer or null), today }
  // → { name, date, days, cls, clsKg, fed, lifts: [{ lift, att: [kg|null]×3 | null, set, best, max }], set, planTotal,
  //    proj: { total, label, points, from } | null, bw: { last, date, over, line, pts } | null }
  function meetPlan(o) {
    o = o || {};
    var m = o.meet || {}, plan = o.plan || null;
    var clsKg = parseFloat(String(m.weightClass || '').replace(',', '.'));
    var plus = /\+/.test(String(m.weightClass || ''));
    var lifts = LIFTS.map(function (L) {
      var a = plan && Array.isArray(plan[L]) ? plan[L].map(function (v) { return Number(v) > 0 ? Number(v) : null; }) : null;
      var set = !!(a && a.some(function (v) { return v != null; }));
      var best = set ? Math.max.apply(null, a.filter(function (v) { return v != null; })) : null;
      return { lift: L, att: set ? a.slice(0, 3) : null, set: set, best: best, max: Number(o.maxes && o.maxes[L]) || 0 };
    });
    var setN = lifts.filter(function (x) { return x.set; }).length;
    var bwPts = (o.bw || []).filter(function (b) { return b && Number(b.kg) > 0 && isIso(d10(b.date)); });
    var last = bwPts.length ? bwPts[bwPts.length - 1] : null;
    var bwKg = last ? Number(last.kg) : null;
    var total = Number(o.total) > 0 ? r1(o.total) : lifts.every(function (x) { return x.max > 0; }) ? r1(lifts.reduce(function (s, x) { return s + x.max; }, 0)) : null;
    var sc = total && bwKg && o.score ? o.score(total, bwKg, o.sex || 'male', m) : null;
    var planTotal = setN === 3 ? r1(lifts.reduce(function (s, x) { return s + x.best; }, 0)) : null;
    return {
      name: String(m.name || 'Meet').trim() || 'Meet', date: d10(m.date), days: o.days, fed: [m.federation, m.division].filter(Boolean).join(' · '),
      cls: m.weightClass ? String(m.weightClass).trim() : '', clsKg: clsKg > 0 && !plus ? clsKg : null,
      lifts: lifts, set: setN, planTotal: planTotal,
      proj: total ? { total: total, label: sc ? sc.label : 'DOTS', points: sc && sc.points ? r1(sc.points) : null, bw: bwKg } : null,
      bw: last ? { last: bwKg, date: d10(last.date), over: clsKg > 0 && !plus ? r1(bwKg - clsKg) : null, line: o.line || null, pts: bwPts } : null
    };
  }

  // Readiness over the last `weeks` weeks: one row per check-in question that has an answer in the window. A daily
  // question gets one mark a day, a weekly one a mark a week; each mark is the number (a bar), a yes (a dot) or nothing.
  // The latest answer says itself; a status (watch) when it crosses the line the coach reads it by (Check-ins' flags).
  // o: { today, weeks (6), questions, answers, athleteId } → { from, to, days, rows: [{ q, key, label, kind, cadence, unit,
  //    marks: [{ iso, v, text }|null], max, latest: { iso, text, watch } | null, avg }] }
  function shortLabel(q) {
    var p = String((q && q.prompt) || '');
    if (/sleep/i.test(p)) return q.kind === 'number' ? 'Sleep' : 'Sleep quality';
    if (/sore/i.test(p)) return 'Soreness';
    if (/pain|niggle|injur|hurt/i.test(p)) return 'Pain or niggles';
    if (/stress/i.test(p)) return 'Stress';
    if (/nutrition|food|diet|eat/i.test(p)) return 'Nutrition';
    if (/mood/i.test(p)) return 'Mood';
    if (/energy|tired|fatigue/i.test(p)) return 'Energy';
    p = p.replace(/\?$/, '');
    return p.length > 22 ? p.slice(0, 21).trim() + '…' : p;
  }
  function answerText(q, a) {
    if (!a) return '';
    if (q.kind === 'yesno') return Number(a.num) >= 1 ? 'Yes' : 'No';
    if (q.kind === 'scale') return a.num != null ? n2(a.num) + '/10' : '';
    if (q.kind === 'number') return a.num != null ? n2(a.num) + (/sleep/i.test(q.prompt || '') ? ' h' : '') : '';
    return clip(a.text || '', 24);
  }
  function watchOf(q, a) {
    if (!a) return false;
    var k = questionKind(q), v = Number(a.num);
    if (a.num == null || a.num === '' || !isFinite(v)) return q.kind === 'choice' && /^off$/i.test(String(a.text || ''));
    if (k === 'pain') return q.kind === 'yesno' && v >= 1;
    if (k === 'sleep') return q.kind === 'number' ? v > 0 && v < 6 : v <= 3;
    if (k === 'soreness' || k === 'stress') return q.kind === 'scale' && v >= 7;
    return false;
  }
  function readiness(o) {
    o = o || {};
    var t = o.today || todayIso(), W = o.weeks || 6, from = addDays(t, -(W * 7 - 1)), id = o.athleteId;
    var qs = questionsFor((o.questions || []).filter(function (q) { return q && q.active !== false; }), id);
    var mine = (o.answers || []).filter(function (a) { return a && a.athleteId === id && d10(a.period) >= mondayOf(from) && d10(a.period) <= t; });
    // The window opens at their first answer in it (two weeks at least), so a lifter new to check-ins isn't a row of gaps.
    var firstDay = mine.reduce(function (m, a) { var p = d10(a.period); return !m || p < m ? p : m; }, '');
    if (firstDay && firstDay > from) { W = Math.max(2, Math.ceil((daysBetween(firstDay, t) + 1) / 7)); from = addDays(t, -(W * 7 - 1)); }
    var out = { from: from, to: t, weeks: W, rows: [] };
    qs.forEach(function (q) {
      var ans = mine.filter(function (a) { return a.questionId === q.id; });
      if (!ans.length || q.kind === 'text') return;
      var weekly = q.cadence === 'weekly', marks = [], vals = [];
      var at = {}; ans.forEach(function (a) { var p = d10(a.period); if (!at[p] || String(a.id || '') > String(at[p].id || '')) at[p] = a; });
      // One axis for every row, a slot a day: a weekly answer sits on its week's Monday (the first day in view for the
      // week the window opens in); the days between are no gap, a Monday with no answer is.
      for (var j = 0; j < W * 7; j++) {
        var d = addDays(from, j);
        if (weekly) {
          var mon = mondayOf(d), a1 = at[mon];
          if (d !== (mon < from ? from : mon)) { marks.push({ gap: true }); continue; }
          marks.push(a1 ? { iso: mon, v: numOr(a1.num), text: answerText(q, a1), watch: watchOf(q, a1) } : null);
        } else { var a2 = at[d]; marks.push(a2 ? { iso: d, v: numOr(a2.num), text: answerText(q, a2), watch: watchOf(q, a2) } : null); }
      }
      marks.forEach(function (x) { if (x && !x.gap && x.v != null && q.kind !== 'yesno') vals.push(x.v); });
      if (!marks.some(function (x) { return x && !x.gap; })) return;
      var lastA = ans.slice().sort(function (a, b) { return String(b.period).localeCompare(String(a.period)); })[0];
      var max = q.kind === 'scale' ? 10 : vals.length ? Math.max.apply(null, vals) : 1;
      out.rows.push({ q: q, key: questionKind(q) || q.kind, label: shortLabel(q), kind: q.kind, cadence: weekly ? 'weekly' : 'daily', marks: marks, max: max || 1,
        latest: lastA ? { iso: d10(lastA.period), text: answerText(q, lastA), watch: watchOf(q, lastA) } : null,
        avg: vals.length ? r1(vals.reduce(function (s, v) { return s + v; }, 0) / vals.length) : null,
        yes: q.kind === 'yesno' ? marks.filter(function (x) { return x && !x.gap && x.v >= 1; }).length : null });
    });
    // Pain first, then the order the coach asks them in.
    out.rows.sort(function (a, b) { return (a.key === 'pain' ? 0 : 1) - (b.key === 'pain' ? 0 : 1); });
    return out;
  }
  // Every pain report (app.js painReports), newest first: where, how bad, the lift, when in the session, the day, and
  // whether it's open or what the coach answered. o: { since (iso), max } → [{ id, part, sev, lift, phase, day, open, note }]
  function painHistory(reports, o) {
    o = o || {};
    var PH = typeof PAIN_PHASES !== 'undefined' ? PAIN_PHASES : { warmup: 'Warm-up', top: 'Working sets', after: 'After' };
    return (reports || []).filter(function (p) { return p && isIso(d10(p.day)) && (!o.since || d10(p.day) >= o.since); })
      .sort(function (a, b) { return d10(b.day).localeCompare(d10(a.day)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')); })
      .slice(0, o.max || 6)
      .map(function (p) {
        return { id: p.id, part: typeof painPartLabel === 'function' ? painPartLabel(p.bodyPart, p.side) : String(p.bodyPart || 'Pain'), sev: numOr(p.severity),
          lift: p.lift ? (typeof painLiftLabel === 'function' ? painLiftLabel(p.lift) : String(p.lift)) : '', phase: p.phase && PH[p.phase] ? PH[p.phase] : '',
          day: d10(p.day), open: !p.resolvedAt, note: String(p.coachNote || '').trim(), said: String(p.note || '').trim() };
      });
  }

  // One timeline of everything that happened with a lifter, newest first. o: { athleteId, coachId, today, since (iso),
  //   notes (coachNotes), sessionNotes, messages, formChecks, prs: [{ lift, date, weight, reps, rpe, e1rm }], blocks
  //   (programBlocks), program, programStart (iso) }
  // A date with no time (a session note, a PR, a block) sits at noon on its day.
  // → [{ key, kind: note | session | message | mine | formcheck | pr | block, at (iso date-time), day, title, body, ref, open }]
  var TL_KINDS = { note: 'notes', session: 'notes', message: 'messages', mine: 'messages', formcheck: 'videos', pr: 'prs', block: 'blocks' };
  function timeline(o) {
    o = o || {};
    var id = o.athleteId, since = o.since || '', out = [];
    var push = function (x) { if (!x.at || d10(x.at) < since) return; x.day = d10(x.at); x.filter = TL_KINDS[x.kind]; out.push(x); };
    (o.notes || []).forEach(function (n) {
      if (!n || n.athleteId !== id || (o.coachId && n.coachId && n.coachId !== o.coachId)) return;
      push({ key: 'n' + n.id, kind: 'note', at: String(n.createdAt || n.updatedAt || ''), title: 'Your note', body: String(n.body || '').trim(), ref: n.id });
    });
    (o.sessionNotes || []).forEach(function (n) {
      if (!n || n.athleteId !== id || !String(n.note || '').trim()) return;
      push({ key: 's' + n.id, kind: 'session', at: d10(n.date) + 'T12:00:00', title: 'Session note', body: String(n.note).trim(), ref: n.id, open: !n.coachComment,
        reply: n.coachComment ? String(n.coachComment) : '' });
    });
    (o.messages || []).forEach(function (m) {
      if (!m || m.athleteId !== id || (m.meta && m.meta.type === 'set')) return;
      var theirs = m.senderId === id, voice = !!(m.meta && m.meta.type === 'voice') || /^Voice note · \d+:\d{2}$/.test(String(m.body || '').trim());
      var vb = String(m.body || '').trim(), dur = /(\d+:\d{2})$/.exec(vb);
      push({ key: 'm' + m.id, kind: theirs ? 'message' : 'mine', at: String(m.createdAt || ''), title: theirs ? (voice ? 'Voice note' : 'Message') : (voice ? 'Your voice note' : 'You wrote'),
        body: voice ? (dur ? dur[1] : '') : vb, voice: voice, ref: m.id });
    });
    // Their messages after your last one are waiting on you (Reply); the ones before it you've answered.
    var lastMine = out.filter(function (x) { return x.kind === 'mine'; }).reduce(function (m, x) { return x.at > m ? x.at : m; }, '');
    out.forEach(function (x) { if (x.kind === 'message') x.open = x.at > lastMine; });
    (o.formChecks || []).forEach(function (f) {
      if (!f || f.athleteId !== id) return;
      push({ key: 'f' + f.id, kind: 'formcheck', at: String(f.createdAt || ''), title: 'Form check' + (f.lift && f.lift !== 'other' ? ' · ' + String(f.lift).toLowerCase() : ''),
        body: String(f.note || '').trim(), ref: f.id, open: !f.coachReply, reply: f.coachReply ? String(f.coachReply) : '' });
    });
    // PRs: one line a week (the best set of each lift that set a new best), on the day of the week's last one.
    var wk = {};
    (o.prs || []).forEach(function (p) {
      if (!p || !isIso(d10(p.date))) return;
      var k = mondayOf(p.date), g = wk[k] || (wk[k] = { at: '', by: {} });
      if (d10(p.date) > g.at) g.at = d10(p.date);
      if (!g.by[p.lift] || Number(p.e1rm) > Number(g.by[p.lift].e1rm)) g.by[p.lift] = p;
    });
    Object.keys(wk).forEach(function (k) {
      var g = wk[k], ls = LIFTS.filter(function (L) { return g.by[L]; });
      var setOf = function (p) { return (p.weight ? wt(p.weight) + ' × ' + p.reps : '') + (p.rpe != null ? ' @' + n2(p.rpe) : ''); };
      push({ key: 'p' + k, kind: 'pr', at: g.at + 'T12:00:00', lift: ls.length === 1 ? ls[0] : null,
        title: ls.length === 1 ? LIFT[ls[0]] + ' PR' : ls.length === 3 ? 'PRs on all three lifts' : ls.map(function (L) { return LIFT[L]; }).join(' and ') + ' PRs',
        body: ls.map(function (L, i) { var p = g.by[L]; return (ls.length > 1 ? (i ? LIFT[L].toLowerCase() : LIFT[L]) + ' ' : '') + setOf(p) + (ls.length === 1 ? ', e1RM ' + Math.round(kgShow(p.e1rm)) + ' ' + unit() : ''); }).join(', ') });
    });
    (o.blocks || []).forEach(function (b) {
      if (!b || b.athleteId !== id || !isIso(d10(b.endedOn))) return;
      push({ key: 'b' + b.id, kind: 'block', at: d10(b.endedOn) + 'T12:00:00', title: 'Block finished', body: String(b.name || 'Block'), ref: b.id });
    });
    if (o.program && isIso(d10(o.programStart))) {
      push({ key: 'bp' + (o.program.id || ''), kind: 'block', at: d10(o.programStart) + 'T06:00:00', title: 'Block started',
        body: String(o.program.name || 'Block') + ((o.program.weeks || []).length ? ' · ' + plural(o.program.weeks.length, 'week') : '') });
    }
    return out.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)) || a.key.localeCompare(b.key); });
  }
  // The timeline's chips, each with its count (none at 0, All always).
  var TL_CHIPS = [[null, 'All'], ['notes', 'Notes'], ['messages', 'Messages'], ['videos', 'Form checks'], ['prs', 'PRs'], ['blocks', 'Blocks']];
  function timelineChips(items) {
    return TL_CHIPS.map(function (c) { return { key: c[0], label: c[1], n: c[0] ? items.filter(function (x) { return x.filter === c[0]; }).length : items.length }; })
      .filter(function (c) { return !c.key || c.n > 0; });
  }

  // A range on the Lifters list (shift-click): every id between the anchor and the one clicked, in the list's order. → [id]
  function pickRange(order, anchor, id) {
    var a = (order || []).indexOf(anchor), b = (order || []).indexOf(id);
    if (b < 0) return [];
    if (a < 0) return [id];
    var lo = Math.min(a, b), hi = Math.max(a, b);
    return order.slice(lo, hi + 1);
  }

  /* =====================================================================================
     DATA: the pure parts above, fed from the Store (the desk's own reads, nothing new).
     ===================================================================================== */
  function store() { return typeof Store !== 'undefined' && Store.get ? Store.get() : {}; }
  function coachId() { try { return typeof _dkCoachMeId === 'function' ? _dkCoachMeId() : ((typeof _dkUser === 'function' && _dkUser()) || {}).id; } catch (e) { return null; } }
  function datesOf(id) { try { return typeof logDateSet === 'function' ? logDateSet(id) : new Set(); } catch (e) { return new Set(); } }
  function myQuestions() { var me = coachId(); return (store().checkinQuestions || []).filter(function (q) { return !me || !q.coachId || q.coachId === me; }); }
  function formChecks() { try { return typeof _coachFormChecks !== 'undefined' && Array.isArray(_coachFormChecks) ? _coachFormChecks : []; } catch (e) { return []; } }
  function agreedOf(id) {
    var s = store(), t = todayIso(), mon = mondayOf(t);
    var req = (s.scheduleRequests || []).find(function (q) { return q && q.athleteId === id && q.status === 'approved' && d10(q.weekStart) === mon; });
    if (!req || !window.BusyWeek || !BusyWeek.weekPlanned) return null;
    try { var p = BusyWeek.weekPlanned(req, Array.from(datesOf(id)), t); return p ? p.agreed : null; } catch (e) { return null; }
  }
  function todayData(rows) {
    var s = store(), t = todayIso();
    var C = window.Clients || null;
    return {
      tt: trainingToday(rows, { today: t, datesOf: datesOf, agreedOf: agreedOf }),
      ci: checkinsWeek(rows, { today: t, questions: myQuestions(), answers: s.checkinAnswers || [], checkins: s.checkins || [] }),
      ag: agenda(rows, { today: t, meets: s.meets || [], isPlanned: function (m) { return typeof isPlannedMeet === 'function' ? isPlannedMeet(m, t) || d10(m.date) === t && !(Number(m.squat) > 0) : m.status === 'planned'; },
        billing: s.clientBilling || [], statusOf: C && C.clientStatus ? C.clientStatus : null, money: C && C.formatMoney ? function (c, cur) { return C.formatMoney(c, cur); } : null,
        questions: myQuestions(), unpublished: typeof programUnpublished === 'function' ? programUnpublished : null, endsOn: typeof programEndsOn === 'function' ? programEndsOn : null }),
      wins: winsWeek(rows, { today: t, logsOf: function (id) { return typeof rosterLogsFor === 'function' ? rosterLogsFor(id) : (s.workoutLogs || []).filter(function (l) { return l.athleteId === id; }); },
        isPR: function (id, l) { return typeof isPRForLog === 'function' ? isPRForLog(id, l) : true; } }),
      fc: formChecks().filter(function (f) { return !f.coachReply && rows.some(function (r) { return r.athlete.id === f.athleteId; }); })
    };
  }

  /* =====================================================================================
     HTML: Today
     ===================================================================================== */
  function face(r, o) {
    o = o || {};
    var a = r.athlete;
    return '<button type="button" class="dd-who' + (o.cls ? ' ' + o.cls : '') + '" data-dd-open="' + esc(a.id) + '"' + (o.title ? ' title="' + esc(o.title) + '"' : '') + '>' + avHtml(a) + '<span>' + esc(o.full ? a.name : first(a.name)) + '</span></button>';
  }
  var TT_COLS = [
    { k: 'done', label: 'Done', none: 'Nobody yet' },
    { k: 'live', label: 'Lifting now', none: 'Nobody right now' },
    { k: 'todo', label: 'Still to come', none: 'Nobody planned' },
    { k: 'missed', label: 'Missed yesterday', none: 'Nobody' }
  ];
  function ttTitle(x, k) {
    var nm = x.r.athlete.name;
    if (k === 'live') return nm + ': training now' + (x.r.live && x.r.live.sets ? ', ' + plural(x.r.live.sets, 'set') + ' in the last half hour' : '');
    if (k === 'done') return nm + ': trained today';
    var why = x.why === 'pinned' ? (x.day ? x.day + ' is pinned to ' : 'a session is pinned to ') + (k === 'missed' ? 'yesterday' : 'today')
      : x.why === 'agreed' ? 'a day of the busy week you approved' : 'usually trains on ' + weekdayLong(k === 'missed' ? addDays(todayIso(), -1) : todayIso()) + 's';
    return nm + ': ' + why;
  }
  // Training today: four columns of faces, the count of each, the ones who missed one message away.
  function trainingTodayHtml(T, o) {
    o = o || {};
    var CAP = 8;
    var cols = TT_COLS.map(function (c) {
      var list = T[c.k] || [], shown = list.length > CAP + 1 ? list.slice(0, CAP) : list, more = list.length - shown.length;
      var faces = shown.length ? shown.map(function (x) { return face(x.r, { title: ttTitle(x, c.k) }); }).join('') + (more > 0 ? '<span class="dd-more">+' + more + '</span>' : '')
        : '<span class="dd-none">' + esc(c.none) + '</span>';
      var act = c.k === 'missed' && list.length ? '<button type="button" class="cl-sbtn dd-act" data-dd="msg-missed">' + esc('Message the ' + (list.length === 1 ? 'one' : list.length) + ' who missed') + '</button>' : '';
      return '<div class="dd-tt-col k-' + c.k + '" role="group" aria-label="' + esc(c.label + ': ' + list.length + (list.length ? ', ' + list.map(function (x) { return x.r.athlete.name; }).join(', ') : '')) + '">' +
        '<div class="dd-tt-h" aria-hidden="true"><span class="dd-st k-' + c.k + '"><i>' + (c.k === 'done' ? ic('check', 2.6) : '') + '</i>' + esc(c.label) + '</span><b class="dd-n">' + list.length + '</b></div>' +
        '<div class="dd-faces">' + faces + '</div>' + act + '</div>';
    }).join('');
    var meet = T.meet.length ? '<span class="dd-tt-meet"><i aria-hidden="true">' + ic('trophy') + '</i>' + esc(plural(T.meet.length, 'lifter') + ' competing today: ' + T.meet.map(function (x) { return first(x.r.athlete.name); }).join(', ')) + '</span>' : '';
    return '<div class="cl-sh dd-sh"><h2>Training today</h2><span class="dd-sh-m">' + esc(dateLong(T.today)) + '</span></div>' +
      '<div class="cl-card dd-tt' + (o.rise || '') + '"><div class="dd-tt-cols">' + cols + '</div>' +
      '<p class="dd-foot">' + meet + '<span>Still to come counts a session pinned to today, or the day they have trained on 3 of the last 4 weeks.</span></p></div>';
  }
  // This week: the next 7 days, a column a day.
  function agItemHtml(it) {
    var who = it.who.length ? '<span class="dd-ag-w">' + esc(it.who.slice(0, 3).map(function (r) { return first(r.athlete.name); }).join(', ') + (it.who.length > 3 ? ' +' + (it.who.length - 3) : '')) + '</span>' : '';
    var warn = it.warn && it.warn.length ? '<span class="dd-ag-x"><i aria-hidden="true"></i>' + esc(it.warn.map(function (r) { return first(r.athlete.name) + ' ' + n2(kgShow(r.bw.over)) + ' ' + unit() + ' over'; }).join(', ')) + '</span>' : '';
    var label = it.text + (it.who.length ? ': ' + it.who.map(function (r) { return r.athlete.name; }).join(', ') : '') + (it.warn && it.warn.length ? '. ' + it.warn.map(function (r) { return first(r.athlete.name) + ' is ' + n2(kgShow(r.bw.over)) + ' ' + unit() + ' over the class'; }).join('; ') : '');
    return '<button type="button" class="dd-ag-it t-' + it.tone + ' k-' + it.kind + '" data-dd-ag="' + esc(it.kind) + '" data-ids="' + esc((it.ids || []).join(',')) + '" title="' + esc(label) + '" aria-label="' + esc(label) + '">' +
      '<span class="dd-ag-t"><i aria-hidden="true"></i><b>' + esc(it.text) + '</b></span>' + who + warn + '</button>';
  }
  function agendaHtml(A, o) {
    o = o || {};
    var days = A.days.map(function (d) {
      return '<div class="dd-ag-day' + (d.today ? ' is-today' : '') + (d.items.length ? '' : ' is-empty') + '"><div class="dd-ag-dh"><b>' + esc(d.today ? 'Today' : localDate(d.iso, { weekday: 'short' })) + '</b><span>' + esc(d.today ? dayMonth(d.iso) : localDate(d.iso, { day: 'numeric' }) || '') + '</span></div>' +
        '<div class="dd-ag-its">' + d.items.map(agItemHtml).join('') + '</div></div>';
    }).join('');
    return '<div class="cl-sh dd-sh"><h2>This week</h2><span class="dd-sh-m">' + esc(dayMonth(A.from) + ' to ' + dayMonth(A.to)) + '</span></div>' +
      '<div class="cl-card dd-ag' + (o.rise || '') + '">' + (A.n ? '<div class="dd-ag-days">' + days + '</div>' : '<p class="cl-card-none"><b>A quiet week</b>No meets, weigh-ins, weeks to publish or payments in the next 7 days.</p>') + '</div>';
  }
  // Wins this week: a small card a PR, newest first, four in view (the rest on Lifters' Wins).
  function winsHtml(W, o) {
    o = o || {};
    if (!W.length) return '';
    var sent = o.sent || {}, shown = W.slice(0, 4);
    var cards = shown.map(function (w) {
      var a = w.r.athlete, key = a.id + '|' + w.lift, done = !!sent[key];
      var rpe = w.rpe != null ? '<em>@' + esc(n2(w.rpe)) + '</em>' : '';
      return '<div class="dd-win ' + LCLS[w.lift] + '" data-win="' + esc(key) + '">' +
        '<div class="dd-win-h"><span class="dd-lt" aria-hidden="true">' + esc(LIFT[w.lift].charAt(0)) + '</span><b>' + esc(LIFT[w.lift]) + ' PR</b><span class="dd-when">' + esc(whenText(w.date)) + '</span></div>' +
        '<div class="dd-win-n"><b>' + esc(wt(w.weight)) + '</b><span>' + esc(unit()) + ' × ' + w.reps + '</span>' + rpe + '</div>' +
        '<p class="dd-win-m">e1RM ' + Math.round(kgShow(w.e1rm)) + ' ' + esc(unit()) + (w.delta != null && w.delta > 0 ? ' · <span class="dd-up">+' + esc(n2(kgShow(w.delta))) + ' ' + esc(unit()) + '</span>' : '') + '</p>' +
        '<div class="dd-win-f">' + face(w.r, { full: true }) +
          (done ? '<span class="dd-sent" role="status">' + ic('check', 2.4) + 'Sent</span>' : '<button type="button" class="cl-sbtn dd-nice" data-dd-nice="' + esc(key) + '" aria-label="' + esc('Send ' + first(a.name) + ' a nice lift for the ' + LIFT[w.lift].toLowerCase() + ' PR') + '">Nice lift</button>') + '</div></div>';
    }).join('');
    var who = {}; W.forEach(function (w) { who[w.r.athlete.id] = 1; });
    var nWho = Object.keys(who).length;
    var more = W.length > shown.length ? '<button type="button" class="cl-quiet dd-sh-btn" data-dd="wins-all">Every win on Lifters' + ic('chev') + '</button>' : '';
    return '<div class="cl-sh dd-sh"><h2>Wins this week</h2><span class="dd-sh-m">' + esc(plural(W.length, 'PR') + (nWho > 1 ? ' by ' + nWho + ' lifters' : '')) + '</span>' + more + '</div><div class="dd-wins' + (o.rise || '') + '">' + cards + '</div>';
  }
  // Check-ins, a card in Your team: the share who sent one this week (a ring), what the answers flag, Remind the rest.
  function ringSvg(pct) {
    var S = 48, r = 20, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, pct / 100));
    return '<span class="cl-ring dd-ring" aria-hidden="true"><svg width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '"><circle class="cl-ring-t" cx="24" cy="24" r="' + r + '"/>' +
      '<circle class="cl-ring-v" cx="24" cy="24" r="' + r + '" stroke-dasharray="' + (c * f).toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 24 24)"/></svg><b>' + Math.round(pct) + '%</b></span>';
  }
  function checkinsCardHtml(C) {
    if (!C.asked) return '<div class="cl-card cl-c-checkins is-empty"><div class="cl-card-h"><h3>Check-ins</h3><span>This week</span></div><p class="cl-card-none"><b>No check-in questions yet</b>Ask sleep, soreness and pain each day, and they show here.</p>' +
      '<div class="cl-card-f"><button type="button" class="cl-quiet dd-ci-set" data-dd="ci-setup">Set up check-ins' + ic('chev') + '</button></div></div>';
    var flags = C.flags.length ? '<ul class="dd-flags">' + C.flags.map(function (f) {
      var names = f.who.slice(0, 3).map(function (w) { return '<button type="button" class="cl-nm" data-dd-open="' + esc(w.r.athlete.id) + '" title="' + esc(w.r.athlete.name + ': ' + w.text) + '">' + esc(first(w.r.athlete.name)) + '</button>'; }).join('<span class="cl-sep">, </span>') +
        (f.who.length > 3 ? ' <span class="cl-more-n">+' + (f.who.length - 3) + '</span>' : '');
      return '<li class="dd-flag k-' + f.key + '"><span class="dd-flag-l"><i aria-hidden="true"></i>' + esc(f.label) + '</span><span class="dd-flag-w">' + names + '</span></li>';
    }).join('') + '</ul>' : '<p class="dd-none dd-flags-none">Nothing in the answers to look at</p>';
    var remind = C.missing.length ? '<button type="button" class="cl-sbtn dd-act" data-dd="ci-remind">Remind ' + C.missing.length + '</button>' : '<span class="dd-ok"><i aria-hidden="true"></i>Everyone sent one</span>';
    return '<div class="cl-card cl-c-checkins"><div class="cl-card-h"><h3>Check-ins</h3><span>This week</span></div>' +
      '<div class="cl-card-main dd-static" role="group" aria-label="' + esc(C.sent + ' of ' + C.asked + ' checked in this week' + (C.flags.length ? '. ' + C.flags.map(function (f) { return f.label + ': ' + f.who.map(function (w) { return first(w.r.athlete.name); }).join(', '); }).join('. ') : '')) + '">' +
        '<span class="cl-card-n" aria-hidden="true"><b>' + C.sent + '</b><span>of ' + C.asked + ' checked in</span></span>' + ringSvg(C.pct) + '</div>' +
      '<div class="cl-card-pic">' + flags + '</div><div class="cl-card-f dd-ci-f">' + remind + '</div></div>';
  }
  // The header's form checks: "1 form check waiting" (a button: one opens its review, more open Your list's answers).
  function formChecksBit(fc) {
    if (!fc || !fc.length) return '';
    return ' · <button type="button" class="dd-fcbit" data-dd="fc">' + esc(plural(fc.length, 'form check') + ' waiting') + '</button>';
  }

  /* =====================================================================================
     HTML: a lifter's page
     ===================================================================================== */
  var STATUS = { done: 'Done', part: 'Part done', live: 'Lifting now', today: 'Today', missed: 'Missed', planned: 'Planned' };
  function wroteText(L) {
    var t = L.sets ? L.sets + ' × ' + L.reps : '';
    if (L.pct != null) t += ' at ' + n2(L.pct) + '%';
    else if (L.kg) t += ' at ' + wt(L.kg) + ' ' + unit();
    if (L.effort) t += ' ' + L.effort;
    return t.trim();
  }
  var TONE_WORD = { ok: 'as written', warn: 'harder than written', alert: 'a point or more over', easy: 'easier than written', done: 'lifted', missed: 'missed' };
  function weekHtml(W, o) {
    o = o || {};
    if (!W || !W.days.length) return '';
    var head = '<div class="dd-card-h"><h3>' + esc(W.title) + '</h3><span class="dd-meta">' + esc(W.meta) + '</span>' +
      '<button type="button" class="cl-quiet dd-h-btn" data-dd-day="' + W.wi + '|-1">Open in Programs' + ic('chev') + '</button></div>';
    var cols = W.days.map(function (d) {
      var badge = '<span class="dd-badge t-' + d.status + '">' + (d.status === 'done' ? '<span class="dd-badge-ok" aria-hidden="true">' + ic('check', 2.6) + '</span>' : '<i aria-hidden="true"></i>') + esc(STATUS[d.status] || d.status) + '</span>';
      var lines = d.lifts.map(function (L) {
        var wrote = wroteText(L);
        var lifted = L.lifted && L.lifted.top ? (L.lifted.top.weight ? wt(L.lifted.top.weight) + ' × ' : '') + L.lifted.top.reps + (L.lifted.top.rpe != null ? ' @' + n2(L.lifted.top.rpe) : '') : '';
        var main = lifted ? '<b class="dd-s-v">' + esc(lifted) + '</b>' : L.lifted ? '<b class="dd-s-v is-miss">' + esc(L.lifted.text) + '</b>' : '<b class="dd-s-v is-plan">' + esc(wrote || 'As written') + '</b>';
        var dot = L.tone ? '<i class="dd-tone t-' + L.tone + '" aria-hidden="true"></i>' : '';
        var gap = L.lifted && L.lifted.gap != null && Math.abs(L.lifted.gap) >= 0.25 ? '<span class="dd-gap t-' + L.tone + '">' + (L.lifted.gap > 0 ? '+' : '−') + n2(Math.abs(L.lifted.gap)) + '</span>' : '';
        return '<span class="dd-s-l ' + LCLS[L.lift] + '"><span class="dd-s-n"><i class="dd-ldot" aria-hidden="true"></i>' + esc(L.name) + (L.tag ? ' <em>' + esc(L.tag) + '</em>' : '') + '</span>' +
          '<span class="dd-s-r">' + dot + main + gap + '</span>' + (lifted || (L.lifted && !L.lifted.top) ? '<span class="dd-s-w">' + esc('Wrote ' + (wrote || 'as written')) + '</span>' : '') + '</span>';
      }).join('');
      var more = d.more ? '<span class="dd-s-more">+ ' + plural(d.more, 'more lift', 'more lifts') + '</span>' : '';
      var aria = d.name + ', ' + (STATUS[d.status] || d.status).toLowerCase() + (d.date ? ', ' + dateLong(d.date) : '') + '. ' + d.lifts.map(function (L) {
        return L.name + (L.tag ? ' ' + L.tag : '') + ': ' + (L.lifted && L.lifted.top ? 'lifted ' + (L.lifted.top.weight ? wt(L.lifted.top.weight) + ' by ' : '') + L.lifted.top.reps + (L.lifted.top.rpe != null ? ' at RPE ' + n2(L.lifted.top.rpe) : '') + ', ' + (TONE_WORD[L.tone] || '') + '; wrote ' + wroteText(L) : 'written ' + wroteText(L));
      }).join('. ') + '. Open it in Programs';
      return '<button type="button" class="dd-s t-' + d.status + '" data-dd-day="' + W.wi + '|' + d.di + '" aria-label="' + esc(aria) + '">' +
        '<span class="dd-s-h"><b>' + esc(clip(d.name, 22)) + '</b>' + badge + '</span><span class="dd-s-d">' + esc(d.date ? (d.dateKind === 'pinned' ? 'Pinned to ' : '') + dateLong(d.date) : 'No date yet') + '</span>' +
        '<span class="dd-s-ls">' + lines + more + '</span></button>';
    }).join('');
    return '<div class="dd-card dd-wk' + (o.rise || '') + '">' + head + '<div class="dd-ses n' + Math.min(W.days.length, 6) + '">' + cols + '</div>' +
      (W.note ? '<p class="dd-foot">' + esc(W.note) + '</p>' : '') + '</div>';
  }
  function bwSparkSvg(P) {
    var pts = (P.bw && P.bw.pts) || [];
    if (pts.length < 2) return '';
    var W = 240, H = 56, pl = 4, pr = 4, pt = 8, pb = 8;
    var x0 = Date.parse(pts[0].date + 'T12:00:00Z'), x1 = Date.parse(pts[pts.length - 1].date + 'T12:00:00Z');
    var ys = pts.map(function (p) { return kgShow(p.kg); }), ref = P.clsKg ? kgShow(P.clsKg) : null;
    var lo = Math.min.apply(null, ys.concat(ref != null ? [ref] : [])), hi = Math.max.apply(null, ys.concat(ref != null ? [ref] : []));
    var span = hi - lo || 1; lo -= span * 0.2; hi += span * 0.2;
    var X = function (d) { return x1 === x0 ? W / 2 : pl + (Date.parse(d + 'T12:00:00Z') - x0) / (x1 - x0) * (W - pl - pr); };
    var Y = function (v) { return pt + (hi - v) / (hi - lo) * (H - pt - pb); };
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.date).toFixed(1) + ' ' + Y(kgShow(p.kg)).toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    return '<svg class="dd-bw" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      (ref != null ? '<line class="dd-bw-ref" x1="0" x2="' + W + '" y1="' + Y(ref).toFixed(1) + '" y2="' + Y(ref).toFixed(1) + '" vector-effect="non-scaling-stroke"/>' : '') +
      '<path class="dd-bw-ln" d="' + d + '" vector-effect="non-scaling-stroke"/>' +
      '<circle class="dd-bw-pt" cx="' + X(last.date).toFixed(1) + '" cy="' + Y(kgShow(last.kg)).toFixed(1) + '" r="3.5" vector-effect="non-scaling-stroke"/></svg>';
  }
  function meetPlanHtml(P, o) {
    o = o || {};
    var d = P.days, when = d <= 0 ? 'Today' : d === 1 ? 'Tomorrow' : String(d);
    var atts = P.lifts.map(function (L) {
      var v = L.set ? L.att.map(function (k, i) { return '<span class="' + (i === 2 ? 'is-third' : '') + '">' + (k != null ? esc(wt(k)) : '–') + '</span>'; }).join('<i aria-hidden="true">·</i>') : '<span class="dd-none">Not set</span>';
      return '<li class="dd-att ' + LCLS[L.lift] + (L.set ? ' is-set' : '') + '"><span class="dd-att-n"><i class="dd-ldot" aria-hidden="true"></i>' + LIFT[L.lift] + '</span><span class="dd-att-v">' + v + '</span></li>';
    }).join('');
    var bw = P.bw ? '<div class="dd-mp-col dd-mp-bw"><span class="dd-mp-k">' + esc(P.cls ? P.cls + ' class' : 'Bodyweight') + '</span>' +
      '<span class="dd-mp-v"><b>' + esc(n2(kgShow(P.bw.last))) + '</b><span>' + esc(unit()) + '</span>' + (P.bw.over != null ? '<span class="dd-mp-o' + (P.bw.over > 0 ? ' is-over' : ' is-ok') + '"><i aria-hidden="true"></i>' + esc(P.bw.over > 0 ? n2(kgShow(P.bw.over)) + ' ' + unit() + ' over' : P.bw.over === 0 ? 'on the limit' : n2(kgShow(-P.bw.over)) + ' ' + unit() + ' under') + '</span>' : '') + '</span>' +
      bwSparkSvg(P) + '<span class="dd-mp-s">' + esc(P.bw.line && P.bw.line.parts && P.bw.line.parts[2] ? cap(P.bw.line.parts[2]) + ' · weighed ' + whenText(P.bw.date).toLowerCase() : 'Weighed ' + whenText(P.bw.date).toLowerCase()) + '</span></div>'
      : '<div class="dd-mp-col dd-mp-bw"><span class="dd-mp-k">' + esc(P.cls ? P.cls + ' class' : 'Bodyweight') + '</span><span class="dd-none">No weigh-in yet</span></div>';
    var proj = P.proj ? '<div class="dd-mp-col dd-mp-proj"><span class="dd-mp-k">Total at today’s e1RMs</span><span class="dd-mp-v"><b>' + Math.round(kgShow(P.proj.total)) + '</b><span>' + esc(unit()) + '</span></span>' +
      (P.proj.points ? '<span class="dd-mp-s"><b>' + esc(n2(P.proj.points)) + '</b> ' + esc(P.proj.label) + (P.proj.bw ? ' at ' + esc(n2(kgShow(P.proj.bw))) + ' ' + esc(unit()) : '') + '</span>' : '') +
      (P.planTotal ? '<span class="dd-mp-s">Planned thirds total ' + esc(String(Math.round(kgShow(P.planTotal)))) + ' ' + esc(unit()) + '</span>' : '') + '</div>'
      : '<div class="dd-mp-col dd-mp-proj"><span class="dd-mp-k">Projected total</span><span class="dd-none">Once all three lifts are logged</span></div>';
    var btn = '<button type="button" class="' + (o.quiet ? 'cl-quiet' : 'cl-sbtn') + ' dd-mp-plan" data-plan="' + esc(o.athleteId || '') + '">' + (P.set ? 'Open the attempts' : 'Plan attempts') + '</button>';
    return '<div class="dd-card dd-mp' + (o.rise || '') + '"><div class="dd-mp-h"><span class="cl-tic dd-mp-ic" aria-hidden="true">' + ic('trophy') + '</span>' +
      '<span class="dd-mp-id"><b>' + esc(clip(P.name, 44)) + '</b><span>' + esc([dateLong(P.date), P.fed].filter(Boolean).join(' · ')) + '</span></span>' +
      '<span class="dd-mp-n"><b>' + esc(when) + '</b>' + (d > 1 ? '<span>days</span>' : '') + '</span></div>' +
      '<div class="dd-mp-cols"><div class="dd-mp-col dd-mp-att"><span class="dd-mp-k">Attempts' + (P.set ? ' · ' + P.set + ' of 3 set' : '') + '</span><ul class="dd-atts">' + atts + '</ul></div>' + bw + proj + '</div>' +
      '<div class="dd-mp-f">' + btn + '</div></div>';
  }
  function rdRowHtml(row) {
    var marks = row.marks.map(function (m, i) {
      if (m && m.gap) return '<i class="dd-rm is-gap"></i>';
      var tip = m ? dateLong(m.iso) + ': ' + m.text : (row.cadence === 'weekly' ? 'A week' : 'A day') + ' with no answer';
      if (!m) return '<i class="dd-rm is-none" title="' + esc(tip) + '"></i>';
      if (row.kind === 'yesno') return '<i class="dd-rm is-dot' + (m.v >= 1 ? ' is-yes' : '') + (m.watch ? ' is-watch' : '') + '" title="' + esc(tip) + '"></i>';
      if (m.v == null) return '<i class="dd-rm is-dot' + (m.watch ? ' is-watch' : '') + '" title="' + esc(tip) + '"></i>';
      return '<i class="dd-rm is-bar' + (m.watch ? ' is-watch' : '') + '" style="--h:' + Math.max(0.12, Math.min(1, m.v / row.max)).toFixed(3) + '" title="' + esc(tip) + '"></i>';
    }).join('');
    var said = row.marks.filter(function (m) { return m && !m.gap; }).length;
    var aria = row.label + ': ' + (row.latest ? 'latest ' + row.latest.text + ', ' + whenText(row.latest.iso).toLowerCase() : 'no answer') + (row.avg != null ? '. Average ' + n2(row.avg) : '') + (row.yes != null ? '. Yes on ' + row.yes + ' of ' + said + ' answers' : '') + '.';
    var lt = row.latest ? '<span class="dd-rd-v">' + (row.latest.watch ? '<i class="dd-dot is-watch" aria-hidden="true"></i>' : '') + '<b>' + esc(row.latest.text) + '</b><span>' + esc(whenText(row.latest.iso)) + '</span></span>' : '<span class="dd-rd-v"></span>';
    return '<div class="dd-rd-row k-' + esc(row.key) + ' is-' + row.cadence + '" role="img" aria-label="' + esc(aria) + '"><span class="dd-rd-k">' + esc(row.label) + (row.cadence === 'weekly' ? '<small>weekly</small>' : '') + '</span>' +
      '<span class="dd-rd-m">' + marks + '</span>' + lt + '</div>';
  }
  function readinessHtml(R, pains, o) {
    o = o || {};
    if (!R.rows.length && !pains.length) return '';
    var rows = R.rows.length ? '<div class="dd-rd">' + R.rows.map(rdRowHtml).join('') + '<div class="dd-rd-ax" aria-hidden="true"><span></span><span class="dd-rd-axl"><span>' + esc(dayMonth(R.from)) + '</span><span>Today</span></span><span></span></div></div>' : '';
    var ph = pains.length ? '<div class="dd-pain"><h4>Pain reports</h4><ul>' + pains.map(function (p) {
      var sev = p.sev != null ? '<span class="dd-pm" role="img" aria-label="' + p.sev + ' out of 10">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (i) { return '<i' + (i <= p.sev ? ' class="on"' : '') + '></i>'; }).join('') + '</span><b class="dd-ps">' + p.sev + '<span>/10</span></b>' : '';
      var facts = [p.lift, p.phase ? p.phase.toLowerCase() : ''].filter(Boolean).join(' · ');
      return '<li class="dd-pr' + (p.open ? ' is-open' : '') + '"><span class="dd-pr-w"><i aria-hidden="true"></i><b>' + esc(p.part) + '</b>' + (facts ? '<span>' + esc(facts) + '</span>' : '') + '</span>' + sev +
        '<span class="dd-pr-d">' + esc(whenText(p.day)) + '</span><span class="dd-pr-s">' + esc(p.open ? 'Open' : p.note ? 'You: “' + clip(p.note, 60) + '”' : 'Resolved') + '</span></li>';
    }).join('') + '</ul></div>' : '';
    return '<div class="dd-card dd-rdc' + (o.rise || '') + '"><div class="dd-card-h"><h3>Readiness and pain</h3><span class="dd-meta">' + esc(R.rows.length ? 'Their check-ins, the last ' + plural(R.weeks, 'week') : 'Their pain reports, the last 8 weeks') + '</span></div>' + rows + ph + '</div>';
  }
  var TL_IC = { note: 'lock', session: 'note', message: 'msg', mine: 'msg', formcheck: 'video', pr: 'pr', block: 'blocks' };
  function tlItemHtml(x) {
    var act = '';
    if ((x.kind === 'message' || x.kind === 'session') && x.open) act = '<button type="button" class="cl-sbtn dd-tl-act" data-reply>Reply</button>';
    else if (x.kind === 'formcheck') act = '<button type="button" class="cl-sbtn dd-tl-act" data-dd-fc="' + esc(x.ref) + '">' + (x.open ? 'Review' : 'Open') + '</button>';
    var body = x.body ? (x.kind === 'message' || x.kind === 'session' || x.kind === 'formcheck') && !x.voice ? '“' + clip(x.body, 220) + '”' : clip(x.body, 220) : '';
    var reply = x.reply ? '<span class="dd-tl-reply">You: ' + esc(clip(x.reply, 140)) + '</span>' : '';
    return '<li class="dd-tl-it k-' + x.kind + (x.lift ? ' ' + LCLS[x.lift] : '') + (x.open ? ' is-open' : '') + '"><span class="dd-tl-d">' + esc(whenText(x.day)) + '</span>' +
      '<span class="dd-tl-ic" aria-hidden="true">' + ic(TL_IC[x.kind] || 'note') + '</span>' +
      '<span class="dd-tl-b"><b>' + esc(x.title) + (x.open ? '<em>' + (x.kind === 'formcheck' ? 'Waiting on you' : x.kind === 'message' ? 'Waiting on a reply' : 'Not answered') + '</em>' : '') + '</b>' + (body ? '<span class="dd-tl-t">' + esc(body) + '</span>' : '') + reply + '</span>' + act + '</li>';
  }
  function timelineHtml(items, o) {
    o = o || {};
    var f = o.filter || null, list = f ? items.filter(function (x) { return x.filter === f; }) : items;
    var cap = o.all ? list.length : 8, shown = list.slice(0, cap), more = list.length - shown.length;
    var chips = '<div class="cl-tabs dd-chips" role="tablist" aria-label="Show">' + timelineChips(items).map(function (c) {
      var on = (c.key || null) === f;
      return '<button type="button" class="cl-tab' + (on ? ' on' : '') + '" role="tab" aria-selected="' + on + '" tabindex="' + (on ? '0' : '-1') + '" data-dd-tl="' + esc(c.key || '') + '"><span>' + esc(c.label) + '</span><em>' + c.n + '</em></button>';
    }).join('') + '</div>';
    var add = '<form class="dd-add" data-dd-add><label class="dd-add-l" for="ddNote' + esc(o.athleteId) + '">' + ic('lock') + 'Private note</label>' +
      '<textarea id="ddNote' + esc(o.athleteId) + '" class="dd-add-t" rows="1" maxlength="4000" placeholder="Only you see it. A cue, an injury, what to try next block."></textarea>' +
      '<button type="submit" class="cl-sbtn dd-add-b">Save note</button></form>';
    var body = shown.length ? '<ul class="dd-tl">' + shown.map(tlItemHtml).join('') + '</ul>' : '<p class="dd-none dd-tl-none">' + (f ? 'Nothing here in the last 12 weeks.' : 'Nothing yet. Their notes, messages, videos and PRs land here.') + '</p>';
    return '<div class="dd-card dd-tlc' + (o.rise || '') + '"><div class="dd-card-h"><h3>Notes and history</h3><span class="dd-meta">The last 12 weeks</span></div>' + chips + add + body +
      (more > 0 ? '<button type="button" class="cl-morebtn dd-tl-more" data-dd="tl-more">Show ' + more + ' more</button>' : '') + '</div>';
  }

  /* ---------- the lifter's page: the data, the blocks, kept per lifter while the page is open ---------- */
  var P = { tl: {}, tlAll: {} };
  function weekModel(r) {
    var prog = r.status && r.status.program;
    if (!prog || !(prog.weeks || []).length || !window.DeskProgram || !DeskProgram.model || !DeskProgram.envFor) return null;
    var aid = r.athlete.id, env = DeskProgram.envFor(prog, aid), ws = typeof programWeekState === 'function' ? programWeekState(prog) : null;
    var wi = ws ? ws.idx : Math.max(0, env.nowIdx);
    var M = DeskProgram.model(prog.weeks, wi, env), days = sessionsOf(M);
    if (!days.length) return null;
    var start = env.starts && env.starts[wi] ? env.starts[wi] : null, t = todayIso();
    var cur = start ? (t >= start && t < addDays(start, 7) ? 'this' : t >= addDays(start, 7) ? 'past' : 'next') : null;
    var behind = cur === 'past' && env.nowIdx > wi ? env.nowIdx - wi : 0;
    var meta = [prog.name ? clip(prog.name, 30) : '', start ? dayMonth(start) + ' to ' + dayMonth(addDays(start, 6)) : '', behind ? (behind === 1 ? 'a week behind the dates' : behind + ' weeks behind the dates') : ''].filter(Boolean).join(' · ');
    var missed = days.filter(function (d) { return d.status === 'missed'; }).map(function (d) { return d.name; });
    var note = !missed.length ? '' : (missed.length === 1 ? missed[0] + ' wasn’t lifted' : missed.join(' and ') + ' weren’t lifted') + (cur === 'past' ? ' in its week' : '') +
      (behind ? (missed.length === 1 ? '. It’s still next on their Train.' : '. They’re still next on their Train.') : '.');
    return { wi: wi, title: (cur === 'this' ? 'This week · ' : '') + 'Week ' + (Number(prog.weeks[wi].number) || wi + 1) + ' of ' + prog.weeks.length, meta: meta, days: days, note: note };
  }
  function meetModel(r, D) {
    if (!r.meet || r.meet.days > 112 || r.meet.days < 0) return null;
    var m = r.meet.meet || {}, aid = r.athlete.id, s = store(), t = todayIso();
    var MD = window.MeetDay && MeetDay.pure ? MeetDay.pure : null;
    var plan = m.attemptPlan || null;
    if (!plan && m.id) { try { var lp = JSON.parse(localStorage.getItem('powa-attempt-plans') || 'null'); plan = lp && lp[m.id] ? lp[m.id] : null; } catch (e) { plan = null; } }
    var logs = typeof rosterLogsFor === 'function' ? rosterLogsFor(aid) : (s.workoutLogs || []).filter(function (l) { return l.athleteId === aid; });
    var meets = (s.meets || []).filter(function (x) { return x.athleteId === aid; });
    // The maxes are the page's own (the three lift cards: CoachLifters.clLifter), so the total here is the total above.
    var maxes = {};
    LIFTS.forEach(function (L) {
      var card = D && D.lifts ? D.lifts.filter(function (x) { return x.lift === L; })[0] : null;
      maxes[L] = card && card.e1 ? card.e1 : (typeof bestE1RM === 'function' ? bestE1RM(aid, L) : 0);
    });
    var bw = (s.bodyweight || []).filter(function (b) { return b.athleteId === aid && Number(b.weight) > 0 && d10(b.date) >= addDays(t, -56) && d10(b.date) <= t; })
      .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); }).map(function (b) { return { date: d10(b.date), kg: Number(b.weight) }; });
    var a = (s.athletes || []).find(function (x) { return x.id === aid; }) || r.athlete;
    var sex = (plan && plan.sex) || (a && a.sex) || (MD && MD.sexFromClass ? MD.sexFromClass(m.weightClass) : null) || 'male';
    var line = null; try { line = typeof meetWeighOf === 'function' ? meetWeighOf(aid, t, typeof getUnit === 'function' ? getUnit() : 'kg') : null; } catch (e) { line = null; }
    return meetPlan({ meet: m, days: r.meet.days, plan: plan, maxes: maxes, total: D && D.total ? D.total.value : null, bw: bw, sex: sex, line: line,
      score: function (total, bwKg, sx, meet) { return typeof meetScore === 'function' ? meetScore(total, bwKg, sx, { federation: meet.federation, division: meet.division }) : { label: 'DOTS', points: typeof dotsScore === 'function' ? dotsScore(total, bwKg, sx) : 0 }; } });
  }
  function timelineModel(r) {
    var s = store(), aid = r.athlete.id, t = todayIso(), since = addDays(t, -84);
    var logs = typeof rosterLogsFor === 'function' ? rosterLogsFor(aid) : (s.workoutLogs || []).filter(function (l) { return l.athleteId === aid; });
    // PRs: the best set of each day that set a new best e1RM, the last 12 weeks.
    var byDay = {};
    logs.forEach(function (l) {
      if (!l || !isMain(l.lift) || d10(l.date) < since || d10(l.date) > t || !(typeof isPRForLog === 'function' ? isPRForLog(aid, l) : false)) return;
      var k = l.lift + d10(l.date);
      if (!byDay[k] || Number(l.e1rmComp) > Number(byDay[k].e1rm)) byDay[k] = { lift: l.lift, date: d10(l.date), weight: Number(l.weight) || 0, reps: Number(l.reps) || 0, rpe: numOr(l.rpe), e1rm: Number(l.e1rmComp) };
    });
    var prog = r.status && r.status.program;
    return timeline({ athleteId: aid, coachId: coachId(), today: t, since: since, notes: s.coachNotes || [], sessionNotes: s.sessionNotes || [], messages: s.messages || [],
      formChecks: formChecks(), prs: Object.keys(byDay).map(function (k) { return byDay[k]; }), blocks: s.programBlocks || [], program: prog,
      programStart: prog && typeof programStartsOn === 'function' ? programStartsOn(prog, t) : null });
  }
  // The blocks for a lifter's page on the desk, in order (the Meet view's page puts the meet plan first itself).
  function lifterBlocks(r, o) {
    o = o || {};
    var s = store(), aid = r.athlete.id, t = todayIso(), rz = o.rise || function () { return ''; };
    var out = { week: '', meet: '', readiness: '', history: '' };
    try { var W = weekModel(r); if (W) out.week = weekHtml(W, { rise: rz(5) }); } catch (e) { console.warn('DeskDay week', e); }
    try { var MP = meetModel(r, o.D || (window.CoachLifters && CoachLifters.clLifter ? CoachLifters.clLifter(r) : null)); if (MP) out.meet = meetPlanHtml(MP, { rise: rz(5), athleteId: aid, quiet: o.meetQuiet }); } catch (e) { console.warn('DeskDay meet', e); }
    try {
      var R = readiness({ today: t, weeks: 6, questions: myQuestions(), answers: s.checkinAnswers || [], athleteId: aid });
      var pains = painHistory((s.painReports || []).filter(function (p) { return p.athleteId === aid; }), { since: addDays(t, -56), max: 5 });
      out.readiness = readinessHtml(R, pains, { rise: rz(6) });
    } catch (e) { console.warn('DeskDay readiness', e); }
    try { out.history = timelineHtml(timelineModel(r), { filter: P.tl[aid] || null, all: !!P.tlAll[aid], athleteId: aid, rise: rz(6) }); } catch (e) { console.warn('DeskDay history', e); }
    return out;
  }

  /* =====================================================================================
     ACTIONS: messages (desk.js dkCompose / dkSendMessage: the demo keeps them on the page), the week in Programs, notes.
     ===================================================================================== */
  var SENT = {};   // "Nice lift" sent this page (the coach's word stands until the next week's PRs)
  function rowById(id) { return typeof dkRow === 'function' ? dkRow(id) : null; }
  function openLifter(id) { if (window.CoachLifters && CoachLifters.open) CoachLifters.open(id); }
  function compose(ids, opts) {
    ids = (ids || []).filter(function (id) { return !!rowById(id); });
    if (!ids.length) return;
    if (typeof dkCompose === 'function') dkCompose(ids, opts);
  }
  function toastSay(m) { if (typeof toast === 'function') toast(m); }
  async function niceLift(key, btn, host) {
    var parts = String(key).split('|'), id = parts[0], L = parts[1], r = rowById(id);
    if (!r || SENT[key] || !btn || btn.getAttribute('aria-busy') === 'true') return;
    var W = host && host._ddWins ? host._ddWins.filter(function (w) { return w.r.athlete.id === id && w.lift === L; })[0] : null;
    var set = W ? wt(W.weight) + ' ' + unit() + ' × ' + W.reps + ' on the ' + LIFT[L].toLowerCase() : 'that ' + LIFT[L].toLowerCase();
    var body = 'Nice lift. ' + set.charAt(0).toUpperCase() + set.slice(1) + ' is a new best.';
    btn.setAttribute('aria-busy', 'true');
    var ok = typeof dkSendMessage === 'function' ? await dkSendMessage(id, body) : false;
    btn.removeAttribute('aria-busy');
    if (!ok) { toastSay('Couldn’t send it. Check your connection.'); return; }
    SENT[key] = 1;
    var span = document.createElement('span');
    span.className = 'dd-sent'; span.setAttribute('role', 'status');
    span.innerHTML = ic('check', 2.4) + 'Sent';
    btn.replaceWith(span);
    toastSay(window._demoMode ? 'Sent to ' + first(r.athlete.name) + ' in the demo. Nothing leaves this page.' : 'Sent to ' + first(r.athlete.name));
  }
  function openDay(aid, wi, di) {
    if (window.DeskProgram && DeskProgram.openDay) { DeskProgram.openDay(aid, wi, di); return; }
    if (typeof openAthleteProgram === 'function') openAthleteProgram(aid);
  }
  async function saveNote(form, r, repaint) {
    var ta = form.querySelector('textarea'), btn = form.querySelector('button[type="submit"]');
    var body = ta ? ta.value.trim() : '';
    if (!body) { if (ta) ta.focus(); return; }
    if (btn) btn.setAttribute('aria-busy', 'true');
    var ok = typeof dkNoteSave === 'function' ? await dkNoteSave(r.athlete.id, body) : false;
    if (btn) btn.removeAttribute('aria-busy');
    if (!ok) return;
    P.tl[r.athlete.id] = P.tl[r.athlete.id] === 'notes' ? 'notes' : null;
    if (repaint) repaint();
    toastSay(window._demoMode ? 'Note kept on this page. The demo saves nothing.' : 'Note saved. Only you see it.');
  }
  // One delegated click for every block above. host: the element the blocks sit in (Today's host, the lifter's page).
  // ctx: { today: true } | { page: true, r, repaint() }. → true when the click was ours.
  function onClick(e, host, ctx) {
    ctx = ctx || {};
    var t = e.target, b;
    if ((b = t.closest('[data-dd-open]'))) { e.preventDefault(); openLifter(b.getAttribute('data-dd-open')); return true; }
    if ((b = t.closest('[data-dd-nice]'))) { e.preventDefault(); niceLift(b.getAttribute('data-dd-nice'), b, host); return true; }
    if ((b = t.closest('[data-dd-ag]'))) {
      e.preventDefault();
      var kind = b.getAttribute('data-dd-ag'), ids = (b.getAttribute('data-ids') || '').split(',').filter(Boolean);
      if (kind === 'meet' || kind === 'weighin') { if (typeof deskGo === 'function') deskGo('meets'); }
      else if (kind === 'overdue' || kind === 'due') { if (typeof deskGo === 'function') { deskGo('clients'); if (kind === 'overdue') { var f = document.querySelector('#clientsArea [data-cs="filter"][data-f="overdue"]'); if (f && !f.classList.contains('on')) f.click(); } } }
      else if (kind === 'publish' && ids.length === 1) openDay(ids[0], null, null);
      else if (kind === 'checkin') { if (typeof deskGo === 'function') deskGo('settings', { sec: 'checkins' }); }
      else if (ids.length) openLifter(ids[0]);
      return true;
    }
    if ((b = t.closest('[data-dd]'))) {
      var k = b.getAttribute('data-dd');
      if (k === 'msg-missed' && host._ddT) { e.preventDefault(); compose(host._ddT.tt.missed.map(function (x) { return x.r.athlete.id; }), { title: host._ddT.tt.missed.length === 1 ? 'Message ' + first(host._ddT.tt.missed[0].r.athlete.name) : 'Message the ' + host._ddT.tt.missed.length + ' who missed', text: 'Saw yesterday’s session didn’t happen. All good? Tell me if we should move it.' }); return true; }
      if (k === 'ci-remind' && host._ddT) { e.preventDefault(); compose(host._ddT.ci.missing.map(function (r) { return r.athlete.id; }), { title: 'Remind ' + plural(host._ddT.ci.missing.length, 'lifter') + ' to check in', text: 'Quick check-in when you get a minute: sleep, soreness and anything that hurts.' }); return true; }
      if (k === 'ci-setup') { e.preventDefault(); if (typeof deskGo === 'function') deskGo('settings', { sec: 'checkins' }); return true; }
      if (k === 'wins-all') { e.preventDefault(); if (typeof deskGo === 'function') deskGo('roster', { view: 'wins' }); return true; }
      if (k === 'fc' && host._ddT) {
        e.preventDefault();
        var fc = host._ddT.fc;
        if (fc.length === 1 && typeof openFormCheckReview === 'function') openFormCheckReview(fc[0].id);
        else { var tab = host.querySelector('.cl-yl .cl-tab[data-tab="answer"]'); if (tab) { tab.click(); tab.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
        return true;
      }
      if (k === 'tl-more' && ctx.r) { e.preventDefault(); P.tlAll[ctx.r.athlete.id] = true; if (ctx.repaint) ctx.repaint('history'); return true; }
    }
    if ((b = t.closest('[data-dd-day]'))) {
      e.preventDefault();
      var pr = String(b.getAttribute('data-dd-day')).split('|'), wi = Number(pr[0]), di = Number(pr[1]);
      if (ctx.r) openDay(ctx.r.athlete.id, isFinite(wi) ? wi : null, isFinite(di) && di >= 0 ? di : null);
      return true;
    }
    if ((b = t.closest('[data-dd-tl]')) && ctx.r) {
      e.preventDefault();
      var aid = ctx.r.athlete.id, fk = b.getAttribute('data-dd-tl') || null, had = document.activeElement === b;
      P.tl[aid] = fk; P.tlAll[aid] = false;
      if (ctx.repaint) ctx.repaint('history', { focusTab: had ? fk : undefined });
      return true;
    }
    if ((b = t.closest('[data-dd-fc]'))) { e.preventDefault(); if (typeof openFormCheckReview === 'function') openFormCheckReview(b.getAttribute('data-dd-fc')); return true; }
    return false;
  }
  function onSubmit(e, host, ctx) {
    var f = e.target && e.target.closest ? e.target.closest('[data-dd-add]') : null;
    if (!f || !ctx || !ctx.r) return false;
    e.preventDefault();
    saveNote(f, ctx.r, function () { if (ctx.repaint) ctx.repaint('history'); });
    return true;
  }
  // The note box grows with the note (one line until it has more); ⌘/Ctrl+Enter saves it.
  function onInput(e) {
    var ta = e.target;
    if (!ta || !ta.classList || !ta.classList.contains('dd-add-t')) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px';
    ta.closest('.dd-add').classList.toggle('has-text', !!ta.value.trim());
  }
  function onKeydown(e) {
    var ta = e.target;
    if (ta && ta.classList && ta.classList.contains('dd-add-t') && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); var f = ta.closest('form'); if (f && f.requestSubmit) f.requestSubmit(); }
  }

  window.DeskDay = {
    // Today
    todayData: todayData, trainingTodayHtml: trainingTodayHtml, agendaHtml: agendaHtml, winsHtml: winsHtml, checkinsCardHtml: checkinsCardHtml, formChecksBit: formChecksBit,
    // a lifter's page
    lifterBlocks: lifterBlocks, weekModel: weekModel, meetModel: meetModel, timelineModel: timelineModel,
    // wiring
    onClick: onClick, onSubmit: onSubmit, onInput: onInput, onKeydown: onKeydown, sent: function () { return SENT; },
    // pure, for tests
    habitOn: habitOn, pinsOn: pinsOn, trainingToday: trainingToday, checkinsWeek: checkinsWeek, agenda: agenda, winsWeek: winsWeek, sessionsOf: sessionsOf,
    meetPlan: meetPlan, readiness: readiness, painHistory: painHistory, timeline: timeline, timelineChips: timelineChips, pickRange: pickRange, questionKind: questionKind
  };
})();
