/* coach-report-ui.js: the coach's "Last week" in the app (2026-10-28; v2 2026-11-02).
   The Monday report the push and the email carry (coach-report.js), built from the Store so it always
   agrees with Today and Lifters: how many trained and the sessions against the week before, then who
   needs you (pain, behind, their words, ran hot, form checks, check-ins, no lift up, in that order),
   strength over 4 weeks, effort against what was written, the PRs, meets in the next 8 weeks with each
   lifter's weigh-in against the class, the blocks to write next, money and seats, every lifter on one
   line. One red opens the first lifter who needs you. A sheet on the phone, a centred card on the laptop (the desk's
   modal idiom, like Weekly notes). Entry points: Today › This week and the phone's Lifters › This week
   ("Last week's report"), Settings › Notifications ("See an example of the Monday report"), and the
   Monday push (coach.html?report=week). It only reads: ?demo=1 works from the demo Store, writes nothing.
   html(team) is pure (tests.html "coach alerts + Monday report"). */
(function () {
  'use strict';
  var IC = {
    chev: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.8 2.8 0 0 0 2.8 3.6M16 6h2.5a2.8 2.8 0 0 1-2.8 3.6M12 13v3.5M8.5 20h7M10 16.5h4"/>',
    trend: '<path d="M4 16.5 9.5 11l3.5 3.5L20 7.5"/><path d="M15 7.5h5v5"/>',
    gauge: '<path d="M4.5 16.5a8 8 0 1 1 15 0"/><path d="m12 13 3.5-4"/>',
    users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.2a5.5 5.5 0 0 1 3 4.8"/>',
    inbox: '<path d="M4 13.5 6.5 6h11l2.5 7.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z"/><path d="M4 13.5h4.5l1 2h5l1-2H20"/>',
    wallet: '<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17M16 14.5h1.5"/>',
    calendar: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/>'
  };
  var CAP = 5;   // rows a section shows before "Show N more" (25 and 60 lifters stay calm); never hides fewer than 3
  var LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var LIFT_CLS = { squat: 'l-sq', bench: 'l-be', deadlift: 'l-dl' };

  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || IC.chev) + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function first(n) { return String(n || '').trim().split(/\s+/)[0] || 'them'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function reduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function me() { try { return typeof getCurrentUser === 'function' ? getCurrentUser() : null; } catch (e) { return null; } }
  function unit() { return typeof getUnit === 'function' ? getUnit() : 'kg'; }
  // The coach's form checks live outside the Store (coach.html keeps them in _coachFormChecks).
  function formChecks() { try { return _coachFormChecks || []; } catch (e) { return []; } }   // eslint-disable-line no-undef
  // Who wrote last in each thread: the digest the desk and the phone keep (desk.js _dk.threads, read with the
  // inbox); null before it is read, and the report then reads the Store's own messages (the demo).
  function threads() { try { return (_dk && _dk.threads) || null; } catch (e) { return null; } }   // eslint-disable-line no-undef
  function avHtml(name) {
    var hue = typeof avatarHue === 'function' ? avatarHue(name) : 0;
    var ini = typeof initials === 'function' ? initials(name) : String(name || '?').slice(0, 2).toUpperCase();
    return '<span class="ui-av av-h' + hue + ' mr-av" data-name="' + esc(name) + '" aria-hidden="true">' + esc(ini) + '</span>';
  }

  /* ---------------------------------------------------------------- when the report comes (2 Nov: "Their pick, Sunday 6 pm default") */
  // The coach's pick (email_preferences report_day / report_hour / tz), read once a load; Sunday at 18:00 until it is
  // (the report's own default). The demo keeps a pick in memory only. ready: false when the row has no such columns
  // yet (migration-coach-report-schedule-2026-11-02.sql not run): Settings says "available soon".
  var SCHED = { day: 'sun', hour: 18, tz: null, ready: null };
  var HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];   // 5 am to 10 pm
  function deviceTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }
  // The preferences as db.js maps them ({ reportDay, reportHour, tz, scheduleReady }) or a pick ({ day, hour, ready }).
  function pickOf(p) {
    p = p || {};
    var day = p.reportDay || p.day, hour = p.reportHour != null ? p.reportHour : p.hour;
    hour = Number(hour);
    return { day: day === 'mon' ? 'mon' : 'sun', hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 18,
      tz: p.tz || null, ready: p.scheduleReady !== undefined ? p.scheduleReady : p.ready !== undefined ? p.ready : null };
  }
  function setSchedule(p) { SCHED = pickOf(p); return SCHED; }
  // Switching the day moves the default hours with it (Sunday 6 pm ⇄ Monday 7 am); any other hour stays.
  function pickNext(cur, change) {
    var next = { day: cur.day, hour: cur.hour };
    if (change.day && change.day !== cur.day) {
      next.day = change.day === 'mon' ? 'mon' : 'sun';
      if (next.day === 'mon' && cur.hour === 18) next.hour = 7;
      else if (next.day === 'sun' && cur.hour === 7) next.hour = 18;
    }
    if (change.hour != null && Number.isInteger(Number(change.hour))) next.hour = Number(change.hour);
    return next;
  }
  // What a save sends: the day, the hour and this device's time zone (the hourly job reads them where the coach is).
  function schedulePatch(pick, tz) {
    var out = { reportDay: pick.day, reportHour: pick.hour }, CR = window.CoachReport;
    if (tz && CR && CR.validTz(tz) === tz) out.tz = tz;
    return out;
  }
  // An hour as this device writes it ("6:00 PM", "18:00").
  function hourLabel(h) {
    try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2026, 0, 5, h, 0)); }
    catch (e) { return (h < 10 ? '0' : '') + h + ':00'; }
  }
  function scheduleSub(p) { var k = pickOf(p); return 'Your team’s week, ' + (k.day === 'mon' ? 'Mondays' : 'Sundays') + ' at ' + hourLabel(k.hour); }
  // Settings › Notifications, under the Weekly report switch: Sunday evening or Monday morning, the hour, where.
  function scheduleHtml(p, opts) {
    var k = pickOf(p), off = k.ready === false, tz = (opts && opts.tz) || deviceTz() || 'UTC';
    var hrs = HOURS.indexOf(k.hour) < 0 ? HOURS.concat([k.hour]).sort(function (a, b) { return a - b; }) : HOURS;
    return '<div class="rs-box' + (off ? ' is-off' : '') + '" id="rsBox">' +
      '<div class="ui-seg rs-seg" role="radiogroup" aria-label="When the weekly report comes">' +
      [['sun', 'Sunday evening'], ['mon', 'Monday morning']].map(function (d) {
        var on = k.day === d[0];
        return '<button type="button" role="radio" aria-checked="' + on + '"' + (on ? ' class="on"' : '') + ' data-rs-day="' + d[0] + '"' + (off ? ' disabled' : '') + '>' + d[1] + '</button>';
      }).join('') + '</div>' +
      '<label class="rs-hour" for="rsHour"><span>Time</span><select id="rsHour"' + (off ? ' disabled' : '') + '>' +
      hrs.map(function (h) { return '<option value="' + h + '"' + (h === k.hour ? ' selected' : '') + '>' + esc(hourLabel(h)) + '</option>'; }).join('') + '</select></label>' +
      '<p class="rs-tz" id="rsTz">' + (off ? 'Available soon. Until then it comes on Mondays.' : 'In ' + esc(String(tz).replace(/_/g, ' ')) + ', from this device') + '</p></div>';
  }
  // The row's controls. opts: { demo (nothing saves), save(patch) → Promise, onChange(pick) }.
  function wireSchedule(root, opts) {
    opts = opts || {};
    var box = root && root.querySelector ? root.querySelector('#rsBox') : null;
    if (!box || box.classList.contains('is-off')) return;
    var cur = { day: SCHED.day, hour: SCHED.hour }, sel = box.querySelector('#rsHour');
    var paint = function () {
      [].forEach.call(box.querySelectorAll('[data-rs-day]'), function (b) { var on = b.getAttribute('data-rs-day') === cur.day; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
      if (sel) {
        if (![].some.call(sel.options, function (o) { return Number(o.value) === cur.hour; })) { var o = document.createElement('option'); o.value = String(cur.hour); o.textContent = hourLabel(cur.hour); sel.appendChild(o); }
        sel.value = String(cur.hour);
      }
      if (opts.onChange) opts.onChange(cur);
    };
    var off = function () {
      box.classList.add('is-off');
      [].forEach.call(box.querySelectorAll('button, select'), function (c) { c.disabled = true; });
      var t = box.querySelector('#rsTz'); if (t) t.textContent = 'Available soon. Until then it comes on Mondays.';
    };
    var commit = function (next) {
      var prev = cur;
      cur = next; paint();
      if (opts.demo) { SCHED.day = cur.day; SCHED.hour = cur.hour; if (typeof toast === 'function') toast('Preview only in demo mode.'); return; }
      var tz = deviceTz();
      Promise.resolve().then(function () { return opts.save(schedulePatch(cur, tz)); }).then(function () {
        SCHED.day = cur.day; SCHED.hour = cur.hour; if (tz) SCHED.tz = tz;
        if (typeof toast === 'function') toast('Weekly report: ' + (cur.day === 'mon' ? 'Mondays' : 'Sundays') + ' at ' + hourLabel(cur.hour));
      }, function (e) {
        cur = prev; paint();
        if (e && e.notReady) off();
        if (typeof toast === 'function') toast(e && e.notReady ? 'That turns on with the next update.' : 'Couldn’t save that right now.');
      });
    };
    box.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-rs-day]') : null;
      if (!b || b.disabled || b.getAttribute('data-rs-day') === cur.day) return;
      commit(pickNext(cur, { day: b.getAttribute('data-rs-day') }));
    });
    if (sel) sel.addEventListener('change', function () { commit(pickNext(cur, { hour: Number(sel.value) })); });
  }
  // Once a load, for a coach: read their pick, and when their row has no time zone or another one than this device's,
  // save this device's quietly (the hourly job reads it). Never in the demo, never for a lifter, never twice a load.
  // o (tests): { user, db, tz, demo, force }.
  // Whether to read a user's pick at all (a coach, not the demo), and what to save once it's read (this device's zone,
  // when theirs is none or another, and the browser knows it; nothing before the migration).
  function shouldSync(u, demo) { return !!u && u.userType === 'coach' && !demo; }
  function tzToSave(p, tz) {
    var CR = window.CoachReport;
    return p && p.scheduleReady !== false && tz && CR && CR.validTz(tz) === tz && p.tz !== tz ? { tz: tz } : null;
  }
  var synced = null;
  function syncSchedule(o) {
    o = o || {};
    if (synced && !o.force) return synced;
    var u = o.user !== undefined ? o.user : me(), db = o.db || (typeof DB !== 'undefined' ? DB : null);
    var demo = o.demo !== undefined ? o.demo : !!window._demoMode, tz = o.tz !== undefined ? o.tz : deviceTz();
    if (!shouldSync(u, demo) || !db || !db.getEmailPrefs) { synced = Promise.resolve(SCHED); return synced; }
    var got;
    try { got = Promise.resolve(db.getEmailPrefs(u.id)); } catch (e) { got = Promise.reject(e); }
    synced = got.then(function (p) {
      setSchedule(p);
      var patch = tzToSave(p, tz);
      if (!patch || !db.updateEmailPrefs) return SCHED;
      return Promise.resolve().then(function () { return db.updateEmailPrefs(u.id, patch); }).then(function () { SCHED.tz = tz; return SCHED; }, function () { return SCHED; });
    }, function () { return SCHED; });
    return synced;
  }
  // The week the report in the app shows: the one the coach's pick gives today (on a Sunday, a Sunday pick's this week).
  function windowNow(today) { var CR = window.CoachReport; return CR.reportWindow(SCHED.day, today || todayIso()); }

  /* ---------------------------------------------------------------- the week, from the Store */
  function model(opts) {
    opts = opts || {};
    var CR = window.CoachReport;
    if (!CR) return null;
    var t = opts.today || todayIso(), W = opts.window || CR.reportWindow(SCHED.day, t), u = me(), now = opts.now || Date.now();
    var store = typeof Store !== 'undefined' && Store.get ? Store.get() : {};
    var input = CR.fromStore(store, opts.coachId || (u && u.id), { from: W.from, to: W.to, today: t, now: now, formChecks: opts.formChecks || formChecks(),
      threads: opts.threads || threads(), plan: u ? { tier: u.subscriptionTier, periodEnd: u.subscriptionPeriodEnd } : null });
    return CR.teamWeek(input, { from: W.from, to: W.to, today: W.today, now: now, unit: opts.unit || unit() });
  }

  // A brand-new coach asking for an example (Settings › Notifications) gets a sample week, inert and
  // labelled: never an empty page (the coach first run draws its sample roster the same way).
  function sampleTeam(today) {
    var CR = window.CoachReport, W = CR.lastWeek(today || todayIso()), d = function (n) { return CR.addDays(W.from, n); };
    var now = Date.parse(W.today + 'T09:00:00Z');
    // [id, name, sessions planned, done, the week before, weeks left, 4-week change per lift (squat, bench, deadlift)]
    var A = [['s1', 'Elena Rossi', 4, 4, 3, 2, [5, 2.5, 5]], ['s2', 'Marcus Webb', 3, 1, 3, 3, [2.5, 0, 2.5]], ['s3', 'Priya Shah', 4, 3, 4, 3, [2.5, 2.5, 0]],
      ['s4', 'Tomás Díaz', 3, 0, 2, 3, [0, -2.5, 0]], ['s5', 'Kenji Sato', 4, 4, 4, 2, [7.5, 5, 10]], ['s6', 'Ava Stone', 3, 3, 2, 1, [2.5, 0, 5]]];
    var sessions = {}, before = {};
    A.forEach(function (a) { sessions[a[0]] = a[3]; before[a[0]] = a[4]; });
    var base = { squat: 140, bench: 95, deadlift: 180 };
    // Top sets: written @8; Marcus felt bench @9.5, Kenji one squat @8.5.
    var top = function (id, day, lift, felt) { return { d: d(day), l: lift, v: 'Competition', n: '', w: 100, r: 8, h: null, f: felt || 8 }; };
    return CR.teamWeek({
      athletes: A.map(function (a) { return { id: a[0], name: a[1] }; }),
      programs: A.map(function (a) { return { athleteId: a[0], planned: a[2], weeksLeft: a[5] }; }),
      sessions: sessions, sessionsBefore: before,
      momentum: A.map(function (a) { var l = {}; ['squat', 'bench', 'deadlift'].forEach(function (L, i) { l[L] = { recent: base[L] + a[6][i], prior: base[L] }; }); return { athleteId: a[0], lifts: l }; }),
      effort: [{ athleteId: 's1', sets: [top('s1', 0, 'squat'), top('s1', 2, 'bench'), top('s1', 4, 'deadlift'), top('s1', 5, 'squat')] },
        { athleteId: 's2', sets: [top('s2', 1, 'bench', 9.5)] }, { athleteId: 's3', sets: [top('s3', 0, 'squat'), top('s3', 2, 'bench'), top('s3', 4, 'deadlift', 7.5)] },
        { athleteId: 's5', sets: [top('s5', 0, 'squat', 8.5), top('s5', 2, 'bench'), top('s5', 4, 'deadlift'), top('s5', 5, 'bench')] },
        { athleteId: 's6', sets: [top('s6', 1, 'squat'), top('s6', 3, 'bench'), top('s6', 5, 'deadlift')] }],
      prs: [{ athleteId: 's1', lift: 'squat', e1rm: 142.5 }, { athleteId: 's5', lift: 'deadlift', e1rm: 245 }, { athleteId: 's5', lift: 'bench', e1rm: 150 }],
      pains: [{ athleteId: 's3', date: d(2) }],
      notes: [{ athleteId: 's3', date: CR.addDays(W.today, -1) }],
      formChecksOpen: [{ athleteId: 's2' }],
      meets: [{ athleteId: 's1', name: 'Regional Open', date: CR.addDays(W.today, 18), weightClass: '63 kg' }, { athleteId: 's5', name: 'Regional Open', date: CR.addDays(W.today, 18), weightClass: '93 kg' }],
      bodyweight: [{ athleteId: 's1', date: CR.addDays(W.today, -2), weight: 63.6 }, { athleteId: 's5', date: CR.addDays(W.today, -3), weight: 91.8 }],
      overdue: [{ athleteId: 's6', amountCents: 12000, currency: 'USD', daysLate: 4 }],
      due: [{ athleteId: 's5', amountCents: 15000, currency: 'USD', nextDue: CR.addDays(W.today, 3) }],
      applications: 1, plan: { tier: 'pro' }
    }, { from: W.from, to: W.to, today: W.today, now: now, unit: unit() });
  }

  /* ---------------------------------------------------------------- the markup (pure) */
  // Needs you: one row per lifter, their reasons in the report's order (pain, behind, their words, ran hot,
  // form checks, check-in, no lift up).
  function needRows(team) {
    var by = {}, out = [];
    var add = function (id, name, words, tone) {
      var r = by[id];
      if (!r) { r = by[id] = { id: id, name: name, words: [], tone: '' }; out.push(r); }
      r.words.push(words);
      if (!r.tone && tone) r.tone = tone;
    };
    team.pain.forEach(function (p) { add(p.id, p.name, p.n === 1 ? 'Pain reported' : 'Pain reported ' + (p.n === 2 ? 'twice' : p.n + ' times'), 'pain'); });
    team.behind.forEach(function (b) { add(b.id, b.name, b.done + ' of ' + plural(b.planned, 'session'), 'warn'); });
    var CR = window.CoachReport;
    (team.words || []).forEach(function (w) { add(w.id, w.name, 'Wrote you, ' + (CR ? CR.wordsWhat(w) + ' ' + (w.days > 0 ? plural(w.days, 'day') + ' ago' : 'today') : ''), ''); });
    ((team.effort && team.effort.hot) || []).forEach(function (h) { add(h.id, h.name, CR ? CR.hotText(h) : 'Ran hot', 'warn'); });
    team.formCheckWho.forEach(function (f) { add(f.id, f.name, plural(f.n, 'form check') + ' to review', ''); });
    team.checkinsMissing.forEach(function (c) { add(c.id, c.name, 'No check-in', ''); });
    ((team.strength && team.strength.stalled) || []).forEach(function (s) { add(s.id, s.name, 'No lift up in 4 weeks', ''); });
    return out;
  }
  // Wins: one row per lifter, each PR a lift dot and its e1RM ("● Bench 150 kg  ● Deadlift 278 kg").
  function winRows(team) { return window.CoachReport ? CoachReport.prsByLifter(team) : []; }
  // o: { av (an avatar for the title's name) | icon + tone | icon 'lift' + liftCls (a lift's own colour), title, line (HTML), dot,
  // lineCls, bar (HTML under the line), more (HTML lines after it), attrs (a button) }
  function row(o, i) {
    var lead = o.av ? avHtml(o.title) : o.icon === 'lift' ? '<span class="mr-tic mr-lt ' + o.liftCls + '" aria-hidden="true"><i class="mr-dot ' + o.liftCls + '"></i></span>'
      : '<span class="mr-tic' + (o.tone ? ' t-' + o.tone : '') + '">' + ic(o.icon) + '</span>';
    var dot = o.dot ? '<i class="mr-dot ' + o.dot + '" aria-hidden="true"></i>' : '';
    var inner = lead + '<span class="mr-rt"><b>' + esc(o.title) + '</b><span' + (o.lineCls ? ' class="' + o.lineCls + '"' : '') + '>' + dot + o.line + '</span>' + (o.bar || '') + (o.more || '') + '</span>' + (o.attrs ? '<span class="mr-chev">' + ic('chev', 2.2) + '</span>' : '');
    var hide = i >= CAP ? ' mr-extra' : '';
    return o.attrs ? '<button type="button" class="mr-row' + hide + '" ' + o.attrs + '>' + inner + '</button>' : '<div class="mr-row is-static' + hide + '">' + inner + '</div>';
  }
  function section(title, count, rows, k) {
    var more = rows.length > CAP + 2 ? '<button type="button" class="mr-more" data-mr-more>Show ' + (rows.length - CAP) + ' more</button>' : '';
    if (!more) rows = rows.map(function (r) { return r.replace(' mr-extra"', '"'); });
    return '<div class="mr-sec rise" style="--i:' + k + '"><h3 class="mr-h">' + esc(title) + (count != null ? ' <span>' + count + '</span>' : '') + '</h3>' +
      '<div class="mr-list">' + rows.join('') + more + '</div></div>';
  }
  // team: CoachReport.teamWeek(...). opts: { unit, sample }. → the report's body, its footer included.
  // A sample opens nothing and has no red.
  function html(team, opts) {
    opts = opts || {};
    var U = opts.unit || 'kg', CR = window.CoachReport, live = !opts.sample;
    var go = function (attrs) { return live ? attrs : ''; };
    if (!team || !team.of) {
      return '<div class="mr-body"><div class="mr-empty rise" style="--i:0"><span class="mr-tic">' + ic('calendar') + '</span>' +
        '<h3 class="mr-h">No lifters yet</h3><p>Once lifters join, their week lands here every Monday: who trained, who needs you, how they’re moving and what’s coming up.</p></div></div>';
    }
    var k = 0, h = '<div class="mr-body">';
    var U2 = U === 'lbs' || U === 'lb' ? 'lbs' : 'kg';
    var prev = team.prev && team.prev.sessionsPlanned ? team.prev : null;
    // The answer first: how many trained, then the evidence (sessions done against written, this week and the
    // one before), then the PRs.
    var meter = function (done, planned, was) {
      var pct = Math.round(done / planned * 100);
      return '<p class="mr-mrow' + (was ? ' is-was' : '') + '"><span>' + (was ? 'The week before' : 'Sessions') + '</span><b>' + done + ' of ' + planned + '</b></p>' +
        '<div class="mr-meter' + (was ? ' is-was' : '') + '" role="img" aria-label="' + done + ' of ' + planned + ' sessions done' + (was ? ' the week before' : '') + '"><i style="width:' + pct + '%"></i></div>';
    };
    var facts = [];
    if (prev && team.sessionsPlanned && CR) facts.push(esc(CR.vsText(team.sessionsDone, prev.sessionsDone, 'sessions')));
    if (team.prs.length) facts.push('<b>' + team.prs.length + '</b> ' + (team.prs.length === 1 ? 'PR' : 'PRs'));
    if (team.behind.length) facts.push('<b>' + team.behind.length + '</b> behind');
    h += '<div class="mr-hero rise" style="--i:' + (k++) + '"><p class="mr-big"><b>' + team.trained + '</b><span>of ' + team.of + ' trained</span></p>' +
      (team.prev && CR ? '<p class="mr-vs">' + esc(CR.vsText(team.trained, team.prev.trained)) + '</p>' : '') +
      (team.sessionsPlanned ? '<div class="mr-sess">' + meter(team.sessionsDone, team.sessionsPlanned) + (prev ? meter(prev.sessionsDone, prev.sessionsPlanned, true) : '') + '</div>' : '') +
      (facts.length ? '<p class="mr-facts">' + facts.join(' · ') + '</p>' : '') + '</div>';
    // Needs you, in the triage order.
    var needs = needRows(team);
    var nRows = needs.map(function (r, i) {
      return row({ av: true, title: r.name, dot: r.tone ? 't-' + r.tone : '', line: esc(r.words.join(' · ')), attrs: go('data-mr-lifter="' + esc(r.id) + '"') }, i);
    });
    if (!nRows.length) nRows.push(row({ icon: 'check', tone: 'ok', title: 'Nobody needs you', line: 'Everyone trained as planned.' }, 0));
    h += section('Needs you', needs.length || null, nRows, k++);
    // Strength: how many got stronger over 4 weeks, each lift's median and share up, the biggest movers.
    var st = team.strength;
    if (st && st.n && CR) {
      var sRows = [row({ icon: 'trend', tone: 'write', title: st.up + ' of ' + st.n + ' stronger', line: 'Best e1RM, the last 4 weeks against the 4 before' }, 0)];
      ['squat', 'bench', 'deadlift'].forEach(function (L) {
        var g = st.lifts[L];
        if (!g || !g.n) return;
        sRows.push(row({ icon: 'lift', liftCls: LIFT_CLS[L], title: LIFT[L] + ' ' + CR.deltaText(g.median, U2) + ' median', line: g.up + ' of ' + g.n + ' up',
          bar: '<span class="mr-bar ' + LIFT_CLS[L] + '" aria-hidden="true"><i style="width:' + Math.round(g.up / g.n * 100) + '%"></i></span>' }, sRows.length));
      });
      if (st.movers.length) sRows.push(row({ icon: 'trophy', tone: 'ok', title: 'Biggest movers', line: esc(st.movers.map(function (m) { return first(m.name) + ' ' + CR.deltaText(m.kg, U2); }).join(' · ')) }, sRows.length));
      h += section('Strength', '4 weeks', sRows, k++);
    }
    // Effort: last week's top sets against what was written, and who ran hot with their worst top set.
    var ef = team.effort;
    if (ef && ef.total && CR) {
      var seg = function (n, cls) { return n ? '<i class="' + cls + '" style="width:' + (n / ef.total * 100).toFixed(2) + '%"></i>' : ''; };
      var parts = CR.effortParts(ef).map(function (x) { return x[1]; });
      var eRows = [row({ icon: 'gauge', tone: 'ok', title: ef.pct + '% at or under what you wrote', line: esc(parts.join(' · ')), lineCls: 'mr-wrap',
        bar: '<span class="mr-split" role="img" aria-label="' + esc(parts.join(', ')) + '">' + seg(ef.atOrUnder, 's-ok') + seg(ef.half, 's-half') + seg(ef.over, 's-over') + '</span>' }, 0)];
      ef.hot.forEach(function (x, i) { eRows.push(row({ av: true, title: x.name, dot: 't-warn', line: esc(CR.hotText(x)), attrs: go('data-mr-lifter="' + esc(x.id) + '"') }, i + 1)); });
      h += section('Effort', plural(ef.total, 'top set'), eRows, k++);
    }
    if (team.prs.length) {
      h += section('Wins', plural(team.prs.length, 'e1RM PR'), winRows(team).map(function (r, i) {
        var line = r.prs.map(function (p) {
          return '<span class="mr-lp"><i class="mr-dot ' + LIFT_CLS[p.lift] + '" aria-hidden="true"></i>' + esc(LIFT[p.lift]) + ' ' + esc(CR ? CR.e1rmText(p.e1rm, U) : Math.round(p.e1rm) + ' kg') + '</span>';
        }).join('');
        return row({ av: true, title: r.name, line: line, lineCls: 'mr-lps', attrs: go('data-mr-lifter="' + esc(r.id) + '"') }, i);
      }), k++);
    }
    // Meets in the next 8 weeks: the countdown, then each lifter against their class (amber when over).
    if (team.meets.length) {
      h += section('Meets', 'next 8 weeks', team.meets.map(function (m, i) {
        var lines = m.lifters.slice(0, 6).map(function (l) {
          var t = CR ? CR.meetLifterText(l, U2) : { text: '', over: false };
          return '<span class="mr-ml">' + esc(first(l.name)) + (t.text ? ' · <em class="' + (t.over ? 'mr-over' : '') + '">' + esc(t.text) + '</em>' : '') + '</span>';
        }).join('') + (m.lifters.length > 6 ? '<span class="mr-ml">+' + (m.lifters.length - 6) + ' more</span>' : '');
        return row({ icon: 'trophy', tone: 'meet', title: m.name, line: esc(CR ? CR.dayLabel(m.date) + ' · ' + CR.whenText(m.days) : m.date), more: lines }, i);
      }), k++);
    }
    // The blocks to write next: finished, none yet, ending this week.
    if ((team.toWrite || []).length && CR) {
      h += section('Next week to write', null, team.toWrite.map(function (x, i) {
        return row({ av: true, title: x.name, dot: x.why === 'ends' ? '' : 't-warn', line: esc(CR.TO_WRITE[x.why]), attrs: go('data-mr-lifter="' + esc(x.id) + '"') }, i);
      }), k++);
    }
    // Money and roster: overdue, due this week, applications waiting, seats.
    var mRows = [], money = function (o) { return CR ? CR.money(o.total, o.currency) : String(o.total / 100); };
    if (team.overdue.n) {
      var od = team.overdue, who2 = od.who.slice(0, 3).map(function (w) { return first(w.name); }).join(', ') + (od.who.length > 3 ? ' +' + (od.who.length - 3) : '');
      mRows.push(row({ icon: 'wallet', tone: 'pain', title: plural(od.n, 'payment') + ' overdue', line: esc(money(od) + (od.mixed ? ' and more' : '') + ' · ' + who2), attrs: go('data-mr-money') }, mRows.length));
    }
    if (team.due && team.due.n) {
      var du = team.due, who3 = du.who.slice(0, 3).map(function (w) { return first(w.name) + ' ' + (w.inDays === 0 ? 'today' : CR ? CR.dayLabel(w.date).split(' ')[0] : w.date); }).join(', ') + (du.who.length > 3 ? ' +' + (du.who.length - 3) : '');
      mRows.push(row({ icon: 'wallet', title: du.n + ' due this week', line: esc(money(du) + (du.mixed ? ' and more' : '') + ' · ' + who3), attrs: go('data-mr-due') }, mRows.length));
    }
    if (team.applications) mRows.push(row({ icon: 'inbox', title: plural(team.applications, 'application') + ' waiting', line: 'From your profile, in Lifters under New lifters' }, mRows.length));
    if (team.seats && CR) mRows.push(row({ icon: 'users', tone: team.seats.limit != null && team.seats.used >= team.seats.limit ? 'pain' : '', title: 'Seats', line: esc(CR.seatsText(team.seats)) }, mRows.length));
    if (mRows.length) h += section('Money and roster', null, mRows, k++);
    // Every lifter, one line: last week's sessions, the 4-week change, their one word.
    if ((team.everyone || []).length && CR) {
      var TONE = { pain: 't-pain', meet: 't-meet', warn: 't-warn', win: 't-win' };
      h += section('Every lifter', team.of, team.everyone.map(function (x, i) {
        return row({ av: true, title: x.name, dot: TONE[x.flag.tone] || '', line: esc(x.flag.word + ' · ' + CR.everyText(x, U2)), attrs: go('data-mr-lifter="' + esc(x.id) + '"') }, i);
      }), k++);
    }
    // One red: the first lifter who needs you. Nobody? Then nothing red to do.
    var up = live && CR ? CR.firstUp(team) : null;
    var when = SCHED.day === 'mon' ? 'Monday' : 'Sunday';
    h += '<div class="mr-foot rise" style="--i:' + (k++) + '"><p>' + (live ? when + '’s push and email say the same.' : 'A sample. Your lifters’ week lands here, and in ' + when + '’s push and email, once they train.') + '</p>' +
      (up ? '<button type="button" class="cl-btn mr-go red" data-mr-lifter="' + esc(up.id) + '">Start with ' + esc(first(up.name)) + '</button>' : '') + '</div>';
    return h + '</div>';
  }
  // The quiet way in: Today › This week (laptop) and Lifters › This week (phone).
  function entryHtml() {
    var W = window.CoachReport ? windowNow() : null;
    return '<button type="button" class="cl-quiet mr-entry" data-mr-open>' + (W && W.to >= W.today ? 'This week’s report' : 'Last week’s report') + ic('chev', 2.2) + '</button>';
  }

  /* ---------------------------------------------------------------- open, act, close */
  var S = null;   // the open report: { close, root, opener }
  function open(opts) {
    opts = opts || {};
    if (S) return;
    var team = model(opts);
    if (!team) return;
    var sample = !team.of && !!opts.example;
    if (sample) team = sampleTeam(todayIso());
    var CR = window.CoachReport, W = opts.window || CR.reportWindow(SCHED.day, todayIso());
    var title = W.to >= W.today ? 'This week' : 'Last week';
    var sub = CR.rangeLabel(W.from, W.to) + (sample ? ' · a sample' : '');
    var body = html(team, { unit: unit(), sample: sample });
    var opener = document.activeElement;
    if (isDeskNow() || opts.desk) {
      var veil = document.createElement('div');
      veil.className = 'dk-veil mr-veil';
      var box = document.createElement('div');
      box.className = 'mr-box cl-root';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'mrTitle'); box.tabIndex = -1;
      box.innerHTML = '<header class="mr-head"><div><h2 class="mr-title" id="mrTitle">' + title + '</h2><p class="mr-sub">' + esc(sub) + '</p></div>' +
        '<button type="button" class="cl-ibtn mr-x" data-mr-close aria-label="Close the report">' + ic('x') + '</button></header>' +
        '<div class="mr-scroll">' + body + '</div>';
      veil.appendChild(box);
      var onKey = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
        if (e.key === 'Tab') {   // keep focus inside the card
          var f = [].filter.call(box.querySelectorAll('button:not([disabled])'), function (b) { return b.offsetParent; });
          if (!f.length) return;
          var a = f[0], z = f[f.length - 1];
          if (f.indexOf(document.activeElement) < 0) { e.preventDefault(); (e.shiftKey ? z : a).focus(); return; }   // from the card itself
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
        }
      };
      var close = function (then) {
        if (!S) return;
        document.removeEventListener('keydown', onKey, true);
        var done = function () { veil.remove(); if (S && S.opener && S.opener.focus && document.contains(S.opener)) { try { S.opener.focus({ preventScroll: true }); } catch (e) {} } S = null; if (typeof then === 'function') then(); };
        if (reduced()) { done(); return; }
        veil.classList.add('is-leaving');
        setTimeout(done, 150);
      };
      veil._close = close;   // the desk closes any open dialog when the window narrows to the phone layout
      veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(veil);
      S = { close: close, root: box, opener: opener };
      wire(box);
      // The scroll edge: a hairline under the title only once rows pass under it.
      var sc = box.querySelector('.mr-scroll');
      if (sc) sc.addEventListener('scroll', function () { box.classList.toggle('is-scrolled', sc.scrollTop > 2); }, { passive: true });
      var x = box.querySelector('[data-mr-close]');
      x.addEventListener('click', function () { close(); });
      if (typeof dkTip === 'function') dkTip(x, 'Close', 'Esc');
      try { box.focus({ preventScroll: true }); } catch (e) {}   // the card, not a button: no ring on a mouse open; Tab goes in
      return;
    }
    if (typeof uiSheet !== 'function') return;
    var closeSheet = uiSheet(title, function (sheet) {
      var p = document.createElement('p'); p.className = 'ui-sheet-sub'; p.textContent = sub;
      sheet.appendChild(p);
      var wrap = document.createElement('div');
      wrap.className = 'cl-root mr-phone';
      wrap.innerHTML = body;
      sheet.appendChild(wrap);
      wire(wrap);
    }, { cls: 'mr-sheet', onClose: function () { S = null; } });
    S = { close: function (then) { closeSheet(); if (typeof then === 'function') setTimeout(then, 210); }, opener: opener };
  }
  function close(then) { if (S) S.close(then); else if (typeof then === 'function') then(); }
  function openLifter(id) {
    if (!window.CoachLifters) return;
    if (isDeskNow()) {
      if (typeof deskGo === 'function') deskGo('roster');
      setTimeout(function () { try { CoachLifters.select(id); } catch (e) {} }, 60);
      return;
    }
    try { CoachLifters.open(id); } catch (e) {}
  }
  function goClients() {
    if (isDeskNow() && typeof deskGo === 'function') { deskGo('clients'); return; }
    var t = document.getElementById('tab-clients');
    if (t) t.click();
  }
  function wire(root) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !root.contains(b)) return;
      if (b.hasAttribute('data-mr-more')) {
        e.preventDefault();
        var sec = b.closest('.mr-sec');
        if (sec) sec.classList.add('is-open');
        b.remove();
        return;
      }
      if (b.hasAttribute('data-mr-lifter')) { e.preventDefault(); var id = b.getAttribute('data-mr-lifter'); close(function () { openLifter(id); }); return; }
      if (b.hasAttribute('data-mr-money') || b.hasAttribute('data-mr-due')) { e.preventDefault(); close(goClients); }
    });
  }
  // The report's push opens coach.html?report=week&w=<the week's Monday>: show that week once the coach's data is in
  // (an older push without w: the week the pick gives), then take the flags off the address so a reload doesn't open it
  // again.
  function linkWindow(search, today) {
    var m = /[?&]w=(\d{4}-\d{2}-\d{2})\b/.exec(search || ''), CR = window.CoachReport;
    if (!m || !CR || !CR.isIso(m[1]) || CR.mondayOf(m[1]) !== m[1] || m[1] > today) return null;
    var end = CR.addDays(m[1], 6);
    return { from: m[1], to: end < today ? end : today, today: today };
  }
  function fromLink(ready) {
    var search = location.search || '';
    if (!/[?&]report=week\b/.test(search)) return false;
    var W = linkWindow(search, todayIso());
    try {
      var q = search.replace(/([?&])report=week\b&?/, '$1').replace(/([?&])w=[^&]*&?/, '$1').replace(/[?&]$/, '');
      history.replaceState(null, '', location.pathname + q + location.hash);
    } catch (e) {}
    Promise.resolve(ready).catch(function () {}).then(function () { setTimeout(function () { open(W ? { window: W } : {}); }, 120); });
    return true;
  }

  window.CoachReportUI = { model: model, html: html, sampleTeam: sampleTeam, entryHtml: entryHtml, open: open, close: close, fromLink: fromLink, isOpen: function () { return !!S; },
    schedule: function () { return SCHED; }, setSchedule: setSchedule, syncSchedule: syncSchedule, scheduleHtml: scheduleHtml, scheduleSub: scheduleSub, wireSchedule: wireSchedule,
    pickNext: pickNext, schedulePatch: schedulePatch, hourLabel: hourLabel, windowNow: windowNow, linkWindow: linkWindow, shouldSync: shouldSync, tzToSave: tzToSave };
})();
