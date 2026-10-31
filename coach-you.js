/* coach-you.js: the coach iPhone app's You tab and the brand-new coach's first run on every tab (29 Oct: the
   approved look, Plates, rolled out). Phone only: the laptop desk draws its own Settings (desk.js) and never calls
   these; coach.html's renderCoachYou, renderRoster and renderMessages and coach-program.js's empty Programs hand
   over to them when they are loaded, and keep their own older views when they aren't.

   CoachYou.planState(u, tier)   the plan in force in words: its label, its status chip, its date line (pure)
   CoachYou.planModel(o)         Your plan's numbers: "4 of 25" lifters, the bar's parts, the line under it (pure)
   CoachYou.planCard(o)          Your plan on You, a card that opens Plan & billing (only where plans show at all)
   CoachYou.openSetup()          Get set up: the three first steps as a sheet (You's first row for a new coach)
   CoachYou.liftersWelcome()     Lifters with nobody yet: the invite as the one red, then the roster it becomes
   CoachYou.messagesWelcome()    Messages with nobody yet: the invite as the one red, then a thread it becomes
   CoachYou.programsWelcome()    Programs with nobody yet: the invite as the one red, the program as the quiet row

   The rules (the owner's, 28 and 29 Oct): red is the logo and the one action, the crimson with a white label;
   a status is an ink word with its mark (the orange triangle for over, the green dot for active), never a red
   word. One focal thing a screen; the coach scale 13 · 15 · 17 · 20 · 28 · 44. A brand-new coach's every tab
   has the invite as its one action, and never an empty black page. */
(function () {
  'use strict';
  var hasDom = typeof document !== 'undefined';

  var G = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    list: '<path d="M3.5 6.5l1.5 1.5 3-3M3.5 12.5l1.5 1.5 3-3M3.5 18.5l1.5 1.5 3-3M11 7h9.5M11 13h9.5M11 19h9.5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    thread: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    tray: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'
  };
  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (G[k] || G.chev) + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function me() { return typeof getCurrentUser === 'function' ? getCurrentUser() : null; }
  function store() { return typeof Store !== 'undefined' && Store.get ? Store.get() : {}; }
  function node(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }

  /* ---------------------------------------------------------------- Your plan */
  // The plan in force, in words. Mirrors renderPlanManageCard's status and date lines (app.js): keep them in step.
  // u: the coach; tier: the plan in force (getCurrentTier()); dateOf: how a date reads (app.js _planDate).
  // → { label, info: { label, tone: ok | warn | bad } | null, when, lapsed, comped }
  function planState(u, tier, dateOf) {
    u = u || {};
    tier = tier || 'free';
    var LIM = typeof TIER_LIMITS !== 'undefined' ? TIER_LIMITS : { free: 3 };
    var LAB = typeof TIER_LABELS !== 'undefined' ? TIER_LABELS : {};
    var stored = Object.prototype.hasOwnProperty.call(LIM, u.subscriptionTier) ? u.subscriptionTier : 'free';
    var biller = typeof billerNow === 'function' ? billerNow(u) : null;
    var provider = u.billingProvider || (biller === 'apple' ? 'apple' : null);
    var lapsed = stored !== 'free' && tier === 'free' && !biller;
    var comped = tier !== 'free' && !provider && !u.subscriptionPeriodEnd;
    var status = String(u.subscriptionStatus || '').toLowerCase();
    var statusInfo = function () { return typeof subscriptionStatusInfo === 'function' ? subscriptionStatusInfo(status) : null; };
    var info = null;
    if (biller) info = statusInfo() || { label: 'Active', tone: 'ok' };
    else if (lapsed) info = { label: 'Ended', tone: 'warn' };
    else if (comped) info = { label: 'Complimentary', tone: 'ok' };
    else if (tier !== 'free') info = statusInfo() || { label: 'Active', tone: 'ok' };
    var end = (dateOf || function (x) { return x ? String(x).slice(0, 10) : ''; })(u.subscriptionPeriodEnd);
    var when = '';
    if (end && lapsed) when = 'Ended ' + end;
    else if (end && tier !== 'free' && status === 'cancelled') when = 'Ends ' + end + ', then Free';
    else if (end && tier !== 'free' && (status === 'active' || status === 'on_trial')) when = 'Renews ' + end;
    else if (!end && tier !== 'free' && status === 'cancelled') when = 'Ends this period, then Free';
    return { label: LAB[tier] || (tier === 'free' ? 'Free' : tier), info: info, when: when, lapsed: lapsed, comped: comped };
  }

  // The card's numbers. o: { athletes, pending, limit (9999 = no limit), when }
  // → { big, of, unlimited, used, held, cap, room, over, full, foot, footWarn }
  //   used / held / cap: the bar's parts as fractions of the plan's seats (an invite out holds a seat, as the
  //   database counts it: migration-tier-enforcement.sql); over the limit after a plan ends, everyone stays.
  function planModel(o) {
    o = o || {};
    var a = Math.max(0, Math.round(Number(o.athletes) || 0)), p = Math.max(0, Math.round(Number(o.pending) || 0));
    var limit = Number(o.limit) || 0, unlimited = limit >= 9999;
    var taken = a + p, room = unlimited ? Infinity : Math.max(0, limit - taken), over = unlimited ? 0 : Math.max(0, taken - limit);
    var full = !unlimited && limit > 0 && room === 0 && over === 0;
    var span = unlimited ? 0 : Math.max(limit, taken, 1);
    var foot = '', warn = false;
    if (over) { foot = 'Over by ' + over + '. Everyone stays; a new lifter needs a bigger plan'; warn = true; }
    else if (full) { foot = 'Full: the next lifter needs a bigger plan'; warn = true; }
    else if (p) foot = plural(p, 'invite') + ' out, holding ' + (p === 1 ? 'a seat' : 'seats');
    else if (!unlimited) foot = 'Room for ' + plural(room, 'more lifter', 'more lifters');
    if (o.when) foot = foot ? foot + ' · ' + o.when : o.when;
    return {
      big: a, of: unlimited ? null : limit, unlimited: unlimited,
      used: span ? Math.min(1, a / span) : 0, held: span ? Math.min(1, p / span) : 0, cap: span ? Math.min(1, limit / span) : 0,
      room: unlimited ? null : room, over: over, full: full, foot: foot, footWarn: warn
    };
  }

  // Your plan on You. o: { showPlan, onOpen } → an element, or null where plans don't show (3.1.1: the iPhone app
  // without in-app purchase stays tier-blind, like Plan & billing itself).
  function planCard(o) {
    o = o || {};
    if (!hasDom || !o.showPlan) return null;
    var u = me();
    if (!u || u.userType === 'athlete') return null;
    var tier = typeof getCurrentTier === 'function' ? getCurrentTier() : 'free';
    var st = planState(u, tier, typeof _planDate === 'function' ? _planDate : null);
    var limit = typeof getCurrentTierLimit === 'function' ? getCurrentTierLimit() : 3;
    var m = planModel({
      athletes: typeof getAthleteCount === 'function' ? getAthleteCount(u.id) : 0,
      pending: typeof getPendingInviteCount === 'function' ? getPendingInviteCount(u.id) : 0,
      limit: limit, when: st.when
    });
    var chip = st.info ? '<span class="cy-plan-st t-' + esc(st.info.tone) + '">' + esc(st.info.label) + '</span>' : '';
    var said = (st.label + ' plan: ' + m.big + (m.unlimited ? ' lifters, no limit' : ' of ' + m.of + ' lifters') + (st.info ? ', ' + st.info.label : '') + (m.foot ? '. ' + m.foot : '') + '. Open plan and billing');
    var bar = m.unlimited ? '' : '<span class="cy-plan-bar" aria-hidden="true"><i class="cy-pb-used" style="--w:' + m.used.toFixed(4) + '"></i><i class="cy-pb-held" style="--x:' + m.used.toFixed(4) + ';--w:' + m.held.toFixed(4) + '"></i>' +
      (m.over ? '<i class="cy-pb-cap" style="--x:' + m.cap.toFixed(4) + '"></i>' : '') + '</span>';
    var b = node('<button type="button" class="cy-plan" data-plan-open aria-label="' + esc(said) + '">' +
      '<span class="cy-plan-top"><span class="cy-plan-name">' + esc(st.label) + '</span>' + chip + '</span>' +
      '<span class="cy-plan-num"><b>' + m.big + '</b>' + (m.unlimited ? '<small>lifters · no limit</small>' : '<small>of ' + m.of + ' lifters</small>') + '</span>' +
      bar +
      (m.foot ? '<span class="cy-plan-foot' + (m.footWarn ? ' is-warn' : '') + '">' + esc(m.foot) + '</span>' : '') +
      '<span class="cy-plan-go" aria-hidden="true">' + ic('chev', 2.2) + '</span></button>');
    b.addEventListener('click', function () { if (o.onOpen) o.onOpen(); else if (typeof openPlanSheet === 'function') openPlanSheet(); });
    // Under its own title, the name the help and the desk use for it ("You → Plan & billing").
    var g = node('<div class="you-group cy-plan-group"><div class="yg-title">Plan &amp; billing</div></div>');
    g.appendChild(b);
    return g;
  }

  /* ---------------------------------------------------------------- Get set up */
  // The three first steps (coach.html coachSetupSteps: the program in, the invites out, a face on the profile) as a
  // sheet, so You's "Get set up 0 of 3" opens the steps themselves, wherever the coach is.
  function openSetup() {
    if (!hasDom || typeof uiSheet !== 'function') return;
    var steps = typeof coachSetupSteps === 'function' ? coachSetupSteps() : [];
    if (!steps.length) return;
    uiSheet('Get set up', function (sheet, close) {
      var done = steps.filter(function (x) { return x.done; }).length;
      sheet.appendChild(node('<p class="ui-sheet-sub">' + (done === steps.length ? 'All set. Your lifters land on your roster the moment they sign up with your link.' : 'Three steps and you’re coaching. ' + done + ' of ' + steps.length + ' done.') + '</p>'));
      var list = node('<div class="ca-list cy-steps" role="list"></div>');
      var next = steps.findIndex(function (x) { return !x.done; });
      steps.forEach(function (x, i) {
        var row = node('<button type="button" class="ca-lrow cy-step' + (x.done ? ' is-done' : i === next ? ' is-next' : '') + '" role="listitem" data-step="' + i + '">' +
          '<span class="ca-tic cy-step-n" aria-hidden="true">' + (x.done ? ic('check', 2.4) : String(i + 1)) + '</span>' +
          '<span class="ca-lrow-tx"><span class="ca-lrow-t">' + esc(x.title) + '</span><span class="ca-lrow-s">' + esc(x.sub) + '</span></span>' + ic('chev', 2.2) + '</button>');
        if (x.done) row.setAttribute('aria-label', x.title + ', done. ' + x.sub);
        row.addEventListener('click', function () { close(); setTimeout(function () { x.onClick(); }, 240); });
        list.appendChild(row);
      });
      sheet.appendChild(list);
    }, { cls: 'cy-setup-sheet' });
  }

  /* ---------------------------------------------------------------- the first run */
  // A first-run card: the app's own lit card (coach-app.css .ca-welcome, as Home's welcome), one line of what the
  // screen becomes, and the invite as the screen's one red. o: { hi, title, sub, label, cls, onClick }
  function welcomeCard(o) {
    var card = node('<div class="ca-hero ca-welcome cy-fr ca-rise' + (o.cls ? ' ' + o.cls : '') + '">' +
      '<p class="ca-hero-hi">' + esc(o.hi) + '</p><h2 class="ca-welcome-t">' + esc(o.title) + '</h2><p class="ca-hero-sub">' + esc(o.sub) + '</p>' +
      '<button type="button" class="ca-btn is-red' + (o.btnCls ? ' ' + o.btnCls : '') + '" data-sc="invite">' + ic('plus', 2.4) + '<span>' + esc(o.label || 'Invite a lifter') + '</span></button></div>');
    card.querySelector('[data-sc=invite]').addEventListener('click', function () { (o.onClick || invite)(); });
    return card;
  }
  function invite() { if (typeof openInviteModal === 'function') openInviteModal(); }
  function pendingInvites() {
    var u = me();
    return u ? (store().invites || []).filter(function (i) { return i.coachId === u.id && !i.used; }).length : 0;
  }
  function label(text, chip) {
    return node('<div class="ca-h cy-fr-h"><h2>' + esc(text) + '</h2>' + (chip ? '<span class="ca-chip-sample">' + esc(chip) + '</span>' : '') + '</div>');
  }

  // Lifters with nobody yet. The three setup steps live on Home (While you wait) and You (Get set up): this screen
  // says what it becomes, and how it starts. → an element for the fresh branch of coach.html renderRoster.
  // o: { alt (the quiet way, Import a client list), own (the Lifters tab's own words and its .le-* hooks, coach.html
  // buildLiftersEmpty) }
  function liftersWelcome(sample, o) {
    o = o || {};
    var p = pendingInvites();
    var wrap = node('<div class="cy-fr-wrap"></div>');
    var card = p ? {
      hi: plural(p, 'invite') + ' out', title: 'They land here when they join',
      sub: 'Each lifter appears the moment they sign up with your link, with their week and anything that needs you.', label: 'Invite another lifter'
    } : o.own ? {
      hi: 'No lifters yet', title: 'Your lifters land here',
      sub: 'Send a lifter your link. They get the app, sign up and show up on this list with their week.'
    } : {
      hi: 'No lifters yet', title: 'Your roster starts with a link',
      sub: 'One link for each lifter. They get the app and land here, with their week and anything that needs you.'
    };
    if (o.own) { card.cls = 'le-card'; card.btnCls = 'le-go'; }
    wrap.appendChild(welcomeCard(card));
    // the one quiet way (Import a client list): a row under the card, as Programs' and Home's first run have theirs
    if (o.alt && o.alt.label) {
      var list = node('<div class="ca-plain ca-rowsx cy-fr-rows ca-rise"></div>');
      var b = node('<button type="button" class="ca-lrow cy-fr-alt' + (o.alt.cls ? ' ' + o.alt.cls : '') + '" data-fr="clients"><span class="ca-tic">' + ic('tray') + '</span>' +
        '<span class="ca-lrow-tx"><span class="ca-lrow-t">' + esc(o.alt.label) + '</span>' + (o.alt.sub ? '<span class="ca-lrow-s">' + esc(o.alt.sub) + '</span>' : '') + '</span>' + ic('chev', 2.2) + '</button>');
      b.addEventListener('click', function () { if (o.alt.onClick) o.alt.onClick(); });
      list.appendChild(b);
      wrap.appendChild(list);
    }
    if (sample) {
      var s = node('<div class="ca-sec cy-fr-sample' + (o.own ? ' le-sample' : '') + '"></div>');
      s.appendChild(label('Once they train', 'Sample'));
      s.appendChild(sample);
      s.appendChild(node('<p class="cy-fr-cap' + (o.own ? ' le-cap' : '') + '">' + (o.own
        ? 'Worst first. The ring is their week: a mark for each session, lit when they train.'
        : 'Who trained, who is slipping and every PR, the moment they log a set.') + '</p>'));
      wrap.appendChild(s);
    }
    return wrap;
  }

  // Messages with nobody yet: the invite first, then the thread it becomes (coach.html _sampleThread).
  function messagesWelcome(thread) {
    var wrap = node('<div class="cy-fr-wrap"></div>');
    wrap.appendChild(welcomeCard({
      hi: 'No messages yet', title: 'Every lifter, one thread',
      sub: 'The sets they log arrive here as cards you can answer, beside what they write.'
    }));
    if (thread) {
      var s = node('<div class="ca-sec cy-fr-sample"></div>');
      s.appendChild(label('A thread, once they train'));   // the thread carries its own Sample chip
      s.appendChild(thread);
      wrap.appendChild(s);
    }
    return wrap;
  }

  // Programs with nobody yet: a program is written for a lifter, so the invite leads; the coach's own program can
  // come in now as a template (the quiet row), or is already in (the row opens it).
  function programsWelcome() {
    var u = me();
    var tplN = u ? (store().programTemplates || []).filter(function (t) { return t.coachId === u.id; }).length : 0;
    var wrap = node('<div class="cp-empty cy-fr-wrap"></div>');
    wrap.appendChild(welcomeCard(tplN ? {
      hi: 'Your program is ready', title: 'Apply it the day they join', cls: 'cp-hero',
      sub: 'It’s saved as a template. Once a lifter joins, open them here and it goes on in one tap.'
    } : {
      hi: 'No lifters yet', title: 'Programs start with a lifter', cls: 'cp-hero',
      sub: 'Invite one, then write their block here. Your own program can come in now, as a template.'
    }));
    var toTemplates = function () { var t = document.getElementById('tab-templates'); if (t) t.click(); };
    var row = tplN
      ? { icon: 'copy', title: tplN === 1 ? 'See your template' : 'See your ' + tplN + ' templates', sub: 'Ready to go on in one tap', run: toTemplates }
      : { icon: 'folder', title: 'Bring your program in', sub: 'A photo, a screenshot or a paste. Nothing to retype.', run: function () { if (typeof openSheetImport === 'function') openSheetImport(null); } };
    var list = node('<div class="ca-plain ca-rowsx cy-fr-rows ca-rise"></div>');
    var b = node('<button type="button" class="ca-lrow" data-fr="' + (tplN ? 'templates' : 'import') + '"><span class="ca-tic">' + ic(row.icon) + '</span>' +
      '<span class="ca-lrow-tx"><span class="ca-lrow-t">' + esc(row.title) + '</span><span class="ca-lrow-s">' + esc(row.sub) + '</span></span>' + ic('chev', 2.2) + '</button>');
    b.addEventListener('click', row.run);
    list.appendChild(b);
    wrap.appendChild(list);
    return wrap;
  }

  /* ---------------------------------------------------------------- Results cards (night C, 30 Oct) */
  // "My lifters gained 18.5 kg this block" and this week's PR wall as a card for Instagram (app.js teamBlockGain /
  // teamPrWall, drawn by generateCoachCard, the lifter's share-card engine). From You › Results cards and Home's
  // Strength sheet. Real roster numbers only; names on a card are first name and initial; the coach's brand colour
  // (Pro, branding) warms the light and the pill. The demo too: sharing is a file on this device, nothing is sent.
  function resultsModel() {
    var s = store(), t = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
    var ath = s.athletes || [];
    return { block: typeof teamBlockGain === 'function' ? teamBlockGain(ath, s.programs || [], s.workoutLogs || [], t) : null,
      prs: typeof teamPrWall === 'function' ? teamPrWall(ath, s.workoutLogs || [], t) : [], today: t };
  }
  function unitOf() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function kgText(kg) {
    var v = typeof kgToDisplay === 'function' ? kgToDisplay(kg) : kg;
    return String(unitOf() === 'kg' ? Math.round(v * 2) / 2 : Math.round(v));
  }
  function signed(kg) { return (kg > 0 ? '+' : kg < 0 ? '\u2212' : '') + kgText(Math.abs(kg)) + ' ' + unitOf(); }
  // "My lifters gained 5 kg this block", said truly when it went the other way (never "gained −2.5 kg").
  function blockWords(b) {
    if (!b) return '';
    return b.avg > 0 ? 'My lifters gained ' + kgText(b.avg) + ' ' + unitOf() + ' this block'
      : b.avg < 0 ? 'My lifters\u2019 e1RM totals are ' + kgText(-b.avg) + ' ' + unitOf() + ' down this block'
      : 'My lifters held their e1RM totals this block';
  }
  // "Counted: 2 of 3 lifters with a block running (each needs all three lifts logged before the block and in it).
  // 2 up, 0 down." Who's behind the average, and its spread. Pure: tested.
  function blockSay(b) {
    if (!b) return '';
    var up = b.rows.filter(function (r) { return r.delta > 0; }).length, down = b.rows.filter(function (r) { return r.delta < 0; }).length;
    var level = b.n - up - down, running = Math.max(b.running || 0, b.n);
    return 'Counted: ' + (running > b.n ? b.n + ' of ' + running + ' lifters with a block running (each needs all three lifts logged before the block and in it).'
      : (b.n === 1 ? 'the 1 lifter' : 'all ' + b.n + ' lifters') + ' with a block running.') + ' ' + up + ' up, ' + down + ' down' + (level ? ', ' + level + ' level' : '') + '.';
  }
  // Lifters who keep their name off their coach's posts (profiles.name_on_results; the owner, 31 Oct: "lifters can opt
  // out"): the block card says "A lifter" for them and the PR wall leaves them off. The sheet says so. Pure: tested.
  function unnamedSay(b, roster) {
    var n = b ? b.rows.filter(function (r) { return r.named === false; }).length : 0;
    if (b) return n ? (n === 1 ? '1 keeps their name off your posts: “A lifter” on the card, still counted.' : n + ' keep their names off your posts: “A lifter” on the card, still counted.') : '';
    var off = (roster || []).filter(function (a) { return a && a.nameOnResults === false; }).length;
    return off ? (off === 1 ? '1 lifter keeps their name off your posts, so isn’t on the wall.' : off + ' lifters keep their names off your posts, so aren’t on the wall.') : '';
  }
  function weekText(today) {
    var d = function (iso) { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
    var from = typeof _addDaysISO === 'function' ? _addDaysISO(today, -6) : today;
    return d(from) + ' \u2013 ' + d(today);
  }
  // You's row: what there is to share, in a word.
  function resultsRow() {
    var M = resultsModel();
    var value = M.block ? signed(M.block.avg) + ' this block' : (M.prs.length ? plural(M.prs.length, 'PR') + ' this week' : '');
    return { label: 'Results cards', value: value, icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="2.5"/><path d="M9.5 15l2-3 1.5 2 1.5-2.5"/></svg>',
      tint: 'gold', onClick: function () { openResults(); } };
  }
  // The coach's brand on the card only on Pro and up, as Branding everywhere else (night C review m11).
  function brandOn() {
    try { return typeof TIER_RANK !== 'undefined' && typeof getCurrentTier === 'function' && (TIER_RANK[getCurrentTier()] || 0) >= TIER_RANK.pro; } catch (e) { return false; }
  }
  function cardOpts(M, format) {
    var u = me() || {}, b = brandOn();
    return { format: format, tint: (b && u.brandColor) || null, footer: (b && u.brandName) || u.name || '', unit: unitOf(), fmt: kgText, week: weekText(M.today) };
  }
  function openResults(start) {
    if (typeof uiSheet !== 'function' || typeof generateCoachCard !== 'function') return;
    var M = resultsModel();
    var pick = start === 'prs' || start === 'block' ? start : (M.block ? 'block' : (M.prs.length ? 'prs' : 'block'));
    uiSheet('Results cards', function (sheet) {
      sheet.appendChild(node('<p class="ui-sheet-sub">Your lifters\u2019 own numbers as a card for Instagram, a story or a post. Names show as first name and initial, unless a lifter turned that off.</p>'));
      var seg = node('<div class="ui-seg cy-rc-seg" role="tablist" aria-label="Card"><button type="button" role="tab" data-rc="block">This block</button><button type="button" role="tab" data-rc="prs">PR wall</button></div>');
      var say = node('<p class="cy-rc-say" aria-live="polite"></p>');
      var frame = node('<div class="cy-rc-frame"></div>');
      var go = node('<button type="button" class="btn btn-primary btn-lg btn-block cy-rc-go">Share the card</button>');
      sheet.appendChild(seg); sheet.appendChild(say); sheet.appendChild(frame); sheet.appendChild(go);
      var ver = 0;
      var paint = function () {
        [].forEach.call(seg.children, function (b) { var on = b.getAttribute('data-rc') === pick; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
        var model = pick === 'block' ? M.block : (M.prs.length ? M.prs : null);
        // What the card doesn't say: who counts and who doesn't, and the spread under the average (night C review m13).
        var off = pick === 'block' ? unnamedSay(M.block) : unnamedSay(null, store().athletes);
        say.textContent = (pick === 'block'
          ? (M.block ? blockSay(M.block)
            : 'Nobody has all three lifts logged both before and in a block running now, so there\u2019s no average to show yet.')
          : (M.prs.length ? plural(M.prs.length, 'PR') + ' this week, ' + weekText(M.today) + '.' : 'No PRs this week yet. The wall fills as your lifters set them.')) + (off ? ' ' + off : '');
        go.disabled = !model;
        frame.innerHTML = '';
        frame.classList.toggle('is-empty', !model);
        if (!model) return;
        var mine = ++ver;
        generateCoachCard(pick, model, cardOpts(M, 'post')).then(function (c) {
          if (!c || mine !== ver) return;
          var img = document.createElement('img');
          img.className = 'cy-rc-img';
          img.alt = say.textContent;
          img.src = c.toDataURL('image/png');
          frame.appendChild(img);
        });
      };
      seg.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-rc]'); if (!b || b.getAttribute('data-rc') === pick) return; pick = b.getAttribute('data-rc'); paint(); });
      go.addEventListener('click', function () {
        var model = pick === 'block' ? M.block : M.prs;
        if (!model || (Array.isArray(model) && !model.length)) return;
        generateCoachCard(pick, model, cardOpts(M, null)).then(function (c) {
          if (!c) return;
          var name = pick === 'block' ? 'powalifta-block-results.png' : 'powalifta-pr-wall.png';
          var text = pick === 'block' ? blockWords(M.block) : plural(M.prs.length, 'PR') + ' this week';
          if (typeof shareCardFromCanvas === 'function') shareCardFromCanvas(c, name, text + ' · powalifta.com');
        });
      });
      paint();
    }, { cls: 'cy-rc-sheet' });
  }

  var api = { planState: planState, planModel: planModel, planCard: planCard, openSetup: openSetup, liftersWelcome: liftersWelcome, messagesWelcome: messagesWelcome, programsWelcome: programsWelcome,
    resultsModel: resultsModel, resultsRow: resultsRow, openResults: openResults, blockWords: blockWords, blockSay: blockSay, unnamedSay: unnamedSay, cardOpts: cardOpts };
  if (typeof window !== 'undefined') window.CoachYou = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
