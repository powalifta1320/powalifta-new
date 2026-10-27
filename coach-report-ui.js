/* coach-report-ui.js: the coach's "Last week" in the app (2026-10-28).
   The Monday report the push and the email carry (coach-report.js), built from the Store so it always
   agrees with Today and Lifters: how many trained, then who needs you (pain, behind, form checks,
   check-ins, in the triage order), the PRs, meets in the next four weeks and money overdue. One red
   opens the first lifter who needs you. A sheet on the phone, a centred card on the laptop (the desk's
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
  function avHtml(name) {
    var hue = typeof avatarHue === 'function' ? avatarHue(name) : 0;
    var ini = typeof initials === 'function' ? initials(name) : String(name || '?').slice(0, 2).toUpperCase();
    return '<span class="ui-av av-h' + hue + ' mr-av" data-name="' + esc(name) + '" aria-hidden="true">' + esc(ini) + '</span>';
  }

  /* ---------------------------------------------------------------- the week, from the Store */
  function model(opts) {
    opts = opts || {};
    var CR = window.CoachReport;
    if (!CR) return null;
    var t = opts.today || todayIso(), W = CR.lastWeek(t), u = me();
    var store = typeof Store !== 'undefined' && Store.get ? Store.get() : {};
    var input = CR.fromStore(store, opts.coachId || (u && u.id), { from: W.from, to: W.to, today: t, formChecks: opts.formChecks || formChecks() });
    return CR.teamWeek(input, W);
  }

  // A brand-new coach asking for an example (Settings › Notifications) gets a sample week, inert and
  // labelled: never an empty page (the coach first run draws its sample roster the same way).
  function sampleTeam(today) {
    var CR = window.CoachReport, W = CR.lastWeek(today || todayIso()), d = function (n) { return CR.addDays(W.from, n); };
    var A = [['s1', 'Elena Rossi', 4, 4], ['s2', 'Marcus Webb', 3, 1], ['s3', 'Priya Shah', 4, 3], ['s4', 'Tomás Díaz', 3, 0], ['s5', 'Kenji Sato', 4, 4], ['s6', 'Ava Stone', 3, 3]];
    var sessions = {};
    A.forEach(function (a) { sessions[a[0]] = a[3]; });
    return CR.teamWeek({
      athletes: A.map(function (a) { return { id: a[0], name: a[1] }; }),
      programs: A.map(function (a) { return { athleteId: a[0], planned: a[2] }; }),
      sessions: sessions,
      prs: [{ athleteId: 's1', lift: 'squat', e1rm: 142.5 }, { athleteId: 's5', lift: 'deadlift', e1rm: 245 }, { athleteId: 's5', lift: 'bench', e1rm: 150 }],
      pains: [{ athleteId: 's3', date: d(2) }],
      formChecksOpen: [{ athleteId: 's2' }],
      meets: [{ athleteId: 's1', name: 'Regional Open', date: CR.addDays(W.today, 18) }, { athleteId: 's5', name: 'Regional Open', date: CR.addDays(W.today, 18) }],
      overdue: [{ athleteId: 's6', amountCents: 12000, currency: 'USD', daysLate: 4 }]
    }, W);
  }

  /* ---------------------------------------------------------------- the markup (pure) */
  // Needs you: one row per lifter, their reasons in the triage order (pain, behind, form checks, check-in).
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
    team.formCheckWho.forEach(function (f) { add(f.id, f.name, plural(f.n, 'form check') + ' to review', ''); });
    team.checkinsMissing.forEach(function (c) { add(c.id, c.name, 'No check-in', ''); });
    return out;
  }
  // Wins: one row per lifter, each PR a lift dot and its e1RM ("● Bench 150 kg  ● Deadlift 278 kg").
  function winRows(team) { return window.CoachReport ? CoachReport.prsByLifter(team) : []; }
  function row(o, i) {
    var lead = o.av ? avHtml(o.title) : '<span class="mr-tic' + (o.tone ? ' t-' + o.tone : '') + '">' + ic(o.icon) + '</span>';
    var dot = o.dot ? '<i class="mr-dot ' + o.dot + '" aria-hidden="true"></i>' : '';
    var inner = lead + '<span class="mr-rt"><b>' + esc(o.title) + '</b><span' + (o.lineCls ? ' class="' + o.lineCls + '"' : '') + '>' + dot + o.line + '</span></span>' + (o.attrs ? '<span class="mr-chev">' + ic('chev', 2.2) + '</span>' : '');
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
        '<h3 class="mr-h">No lifters yet</h3><p>Once lifters join, their week lands here every Monday: who trained, who needs you, the PRs and what’s coming up.</p></div></div>';
    }
    var k = 0, h = '<div class="mr-body">';
    // The answer first: how many trained, then the evidence (sessions done against written), then the PRs.
    var pct = team.sessionsPlanned ? Math.round(team.sessionsDone / team.sessionsPlanned * 100) : null;
    var facts = [];
    if (team.sessionsPlanned) facts.push('<b>' + team.sessionsDone + '</b> of ' + team.sessionsPlanned + ' sessions');
    if (team.prs.length) facts.push('<b>' + team.prs.length + '</b> ' + (team.prs.length === 1 ? 'PR' : 'PRs'));
    h += '<div class="mr-hero rise" style="--i:' + (k++) + '"><p class="mr-big"><b>' + team.trained + '</b><span>of ' + team.of + ' trained</span></p>' +
      (pct != null ? '<div class="mr-meter" role="img" aria-label="' + team.sessionsDone + ' of ' + team.sessionsPlanned + ' sessions done"><i style="width:' + pct + '%"></i></div>' : '') +
      (facts.length ? '<p class="mr-facts">' + facts.join(' · ') + '</p>' : '') + '</div>';
    // Needs you, in the triage order.
    var needs = needRows(team);
    var nRows = needs.map(function (r, i) {
      return row({ av: true, title: r.name, dot: r.tone ? 't-' + r.tone : '', line: esc(r.words.join(' · ')), attrs: go('data-mr-lifter="' + esc(r.id) + '"') }, i);
    });
    if (!nRows.length) nRows.push(row({ icon: 'check', tone: 'ok', title: 'Nobody needs you', line: 'Everyone trained as planned.' }, 0));
    h += section('Needs you', needs.length || null, nRows, k++);
    if (team.prs.length) {
      h += section('Wins', plural(team.prs.length, 'e1RM PR'), winRows(team).map(function (r, i) {
        var line = r.prs.map(function (p) {
          return '<span class="mr-lp"><i class="mr-dot ' + LIFT_CLS[p.lift] + '" aria-hidden="true"></i>' + esc(LIFT[p.lift]) + ' ' + esc(CR ? CR.e1rmText(p.e1rm, U) : Math.round(p.e1rm) + ' kg') + '</span>';
        }).join('');
        return row({ av: true, title: r.name, line: line, lineCls: 'mr-lps', attrs: go('data-mr-lifter="' + esc(r.id) + '"') }, i);
      }), k++);
    }
    if (team.meets.length) {
      h += section('Coming up', null, team.meets.map(function (m, i) {
        var names = m.lifters.map(function (l) { return first(l.name); });
        var who = names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) : '');
        return row({ icon: 'trophy', tone: 'meet', title: m.name, line: esc((CR ? CR.dayLabel(m.date) + ' · ' + CR.whenText(m.days) : m.date) + ' · ' + who) }, i);
      }), k++);
    }
    if (team.overdue.n) {
      var od = team.overdue, who2 = od.who.slice(0, 3).map(function (w) { return first(w.name); }).join(', ') + (od.who.length > 3 ? ' +' + (od.who.length - 3) : '');
      var money = CR ? CR.money(od.total, od.currency) : String(od.total / 100);
      h += section('Money', null, [row({ icon: 'wallet', tone: 'pain', title: plural(od.n, 'payment') + ' overdue', line: esc(money + (od.mixed ? ' and more' : '') + ' · ' + who2), attrs: go('data-mr-money') }, 0)], k++);
    }
    // One red: the first lifter who needs you. Nobody? Then nothing red to do.
    var up = live && CR ? CR.firstUp(team) : null;
    h += '<div class="mr-foot rise" style="--i:' + (k++) + '"><p>' + (live ? 'Monday’s push and email say the same.' : 'A sample. Your lifters’ week lands here, and in Monday’s push and email, once they train.') + '</p>' +
      (up ? '<button type="button" class="cl-btn mr-go red" data-mr-lifter="' + esc(up.id) + '">Start with ' + esc(first(up.name)) + '</button>' : '') + '</div>';
    return h + '</div>';
  }
  // The quiet way in: Today › This week (laptop) and Lifters › This week (phone).
  function entryHtml() {
    return '<button type="button" class="cl-quiet mr-entry" data-mr-open>Last week’s report' + ic('chev', 2.2) + '</button>';
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
    var CR = window.CoachReport, W = CR.lastWeek(todayIso());
    var sub = CR.rangeLabel(W.from, W.to) + (sample ? ' · a sample' : '');
    var body = html(team, { unit: unit(), sample: sample });
    var opener = document.activeElement;
    if (isDeskNow() || opts.desk) {
      var veil = document.createElement('div');
      veil.className = 'dk-veil mr-veil';
      var box = document.createElement('div');
      box.className = 'mr-box cl-root';
      box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'crTitle'); box.tabIndex = -1;
      box.innerHTML = '<header class="mr-head"><div><h2 class="mr-title" id="crTitle">Last week</h2><p class="mr-sub">' + esc(sub) + '</p></div>' +
        '<button type="button" class="cl-ibtn mr-x" data-mr-close aria-label="Close the report">' + ic('x') + '</button></header>' +
        '<div class="mr-scroll">' + body + '</div>';
      veil.appendChild(box);
      var onKey = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
        if (e.key === 'Tab') {   // keep focus inside the card
          var f = [].filter.call(box.querySelectorAll('button:not([disabled])'), function (b) { return b.offsetParent; });
          if (!f.length) return;
          var a = f[0], z = f[f.length - 1];
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
    var closeSheet = uiSheet('Last week', function (sheet) {
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
      if (b.hasAttribute('data-mr-money')) { e.preventDefault(); close(goClients); }
    });
  }
  // The Monday push opens coach.html?report=week: show the report once the coach's data is in, then
  // take the flag off the address so a reload doesn't open it again.
  function fromLink(ready) {
    if (!/[?&]report=week\b/.test(location.search || '')) return false;
    try {
      var q = location.search.replace(/([?&])report=week\b&?/, '$1').replace(/[?&]$/, '');
      history.replaceState(null, '', location.pathname + q + location.hash);
    } catch (e) {}
    Promise.resolve(ready).catch(function () {}).then(function () { setTimeout(function () { open(); }, 120); });
    return true;
  }

  window.CoachReportUI = { model: model, html: html, sampleTeam: sampleTeam, entryHtml: entryHtml, open: open, close: close, fromLink: fromLink, isOpen: function () { return !!S; } };
})();
