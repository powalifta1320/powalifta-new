/* demo-tour.js: the guided tour of the public demos (the owner, 26 Nov: "when someone goes to demo, they should have a
   proper demo ... it should tell them this feature, X, X, X").

   Three tours, one per demo the website links to:
   - desk:   the coach desk on a laptop (coach-preview/desk/*.html, the example desk). It crosses pages: a step names
             the page it belongs to, and Next goes there and carries on (sessionStorage powa-demo-tour-at).
   - lifter: the lifter app (athlete.html?demo=1), and its solo version (&solo=1) with Program in place of Coach.
   - coach:  the coach phone app (coach.html?demo=1 at phone width; a phone opening the desk is sent here).
   It starts by itself on a first demo visit (localStorage powa-demo-tour-seen-<name>, set when it is finished or
   skipped), and again from the Tour button (in the demo bar, or a pill at the desk's bottom right) or ?tour=1. It ends
   on Start yours free. It never runs for a real account: it reads no data, saves nothing, and the lifter and coach
   pages load it only with ?demo=1 in the address. Nothing it shows is invented: every step points at the demo's own
   screen and says what that screen does.

   The step card is the same everywhere: dark, white words, the brand's crimson only on the last step's sign-up. While
   it is open the page behind is dimmed and takes no clicks or keys (Esc skips, the arrows and Enter step); one area of
   the screen is lit. Reduced motion: no movement. Self-contained: its styles are injected here, it needs no app.js. */
(function () {
  'use strict';
  if (window.DemoTour) return;

  var SEEN = 'powa-demo-tour-seen-', AT = 'powa-demo-tour-at';
  var html = document.documentElement;
  var q = location.search, path = location.pathname;
  var isDesk = /\/coach-preview\/desk\/[a-z-]+\.html$/.test(path) || /\/coach-preview\/desk\/?$/.test(path);
  var isLifter = /\/athlete(\.html)?$/.test(path) && /[?&]demo=1\b/.test(q);
  var isCoach = /\/coach(\.html)?$/.test(path) && /[?&]demo=1\b/.test(q) && !/[?&]fresh=1\b/.test(q);
  if (!isDesk && !isLifter && !isCoach) return;

  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function store(kind) { try { return kind === 's' ? sessionStorage : localStorage; } catch (e) { return null; } }
  function get(kind, k) { var s = store(kind); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(kind, k, v) { var s = store(kind); try { if (s) { if (v == null) s.removeItem(k); else s.setItem(k, v); } } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function click(id) { return function () { var b = document.getElementById(id); if (b) b.click(); }; }

  /* ---------------- the tours ---------------- */
  var SIGNUP_COACH = '/index.html#signup-coach', SIGNUP = '/index.html#signup';
  var TOURS = {
    desk: {
      first: 'overview.html',
      cta: { label: 'Start yours free', href: SIGNUP_COACH },
      steps: [
        { page: 'overview.html', title: 'This is a coach’s desk',
          body: 'Sam coaches 20 powerlifters. Everything here is example data, so click anything: nothing is saved. This tour takes about a minute.' },
        { page: 'overview.html', target: '.sec.need', title: 'Who needs you today, worst first',
          body: 'Pain comes first, then missed sessions, meets and messages. Every row has its fix ready: one click shows the change and the message to the lifter.' },
        { page: 'overview.html', target: '#charts', title: 'Your whole roster, this week',
          body: 'Health from their check-ins, sessions done, strength over four weeks, how hard training felt and the meets ahead. Click any of them for the names behind the number.' },
        { page: 'lifters.html', hash: 'id=demo-d2', target: '.card.tot', title: 'Every lifter, one page',
          body: 'Their estimated max is worked out from every set they log, with RPE, so you see strength move without testing a max. What they need, their meets and your notes sit on the same page.' },
        { page: 'programs.html', hash: 'id=demo-d2', target: ['.sv-day', '.card.wk'], title: 'Write next week in minutes',
          body: 'Sets, reps, RPE or %, and load, with last week beside every line. Switch to Week sheet or Block sheet for a spreadsheet view, or bring in the spreadsheet you already use.' },
        { page: 'messages.html', target: '#cmpw', title: 'Messages with the numbers beside them',
          body: 'Check-ins and logged sets land in each lifter’s thread. A suggested reply comes with the change it would make to their training: use it, edit it, or write your own.' },
        { page: 'meets.html', target: '.ov', title: 'Meet day, handled',
          body: 'Weigh-in times, openers and bodyweight against the class for everyone competing, and every meet in the next eight weeks on one line.' },
        { page: 'clients.html', target: '.card.mo', title: 'Who has paid, who is late',
          body: 'Packages, payments and reminders for your coaching business. Lifters pay you directly; POWALIFTA keeps the record.' },
        { page: 'overview.html', title: 'That’s the desk',
          body: 'Your lifters log their sets on their phones, free for them, and it all lands here. Coach your first three lifters free.' }
      ]
    },
    lifter: {
      cta: { label: 'Start free', href: SIGNUP },
      steps: [
        { title: 'This is the lifter app',
          body: 'A lifter’s training, from their coach, logged set by set. Everything here is example data, so tap anything: nothing is saved.' },
        { go: click('tab-today'), target: '.today-hero', title: 'Today’s session, one set at a time',
          body: 'The weight, reps and RPE the coach wrote. Lift, tap Log set, and say how it actually felt.' },
        { go: click('tab-today'), target: '.tx-card', title: 'Every set, as it felt',
          body: 'Tap the RPE to change it to what you really hit. Tap any weight to see the plates to load.' },
        { go: click('tab-progress'), target: '.pg-hero', title: 'Watch your max climb',
          body: 'Every set you log updates your estimated max for squat, bench and deadlift, with your PRs and how far you have come.' },
        { go: click('tab-coach'), target: ['.bottom-tab[data-src="coach"]', '#tab-coach'], soft: true, title: 'Your coach, in one place',
          body: 'Their notes on your sessions, your messages and form-check videos, right beside your training.' },
        { go: click('tab-club'), target: ['.bottom-tab[data-src="club"]', '#tab-club'], soft: true, title: 'Train with your gym',
          body: 'Join your gym’s club for a shared feed, a weekly board and your coach’s challenges.' },
        { go: click('tab-today'), title: 'That’s the lifter app',
          body: 'Free for lifters, with or without a coach.' }
      ]
    },
    coach: {
      cta: { label: 'Start yours free', href: SIGNUP_COACH },
      steps: [
        { title: 'This is a coach’s phone',
          body: 'Sam, a powerlifting coach, with a few example lifters. Everything here is example data, so tap anything: nothing is saved.' },
        { go: click('tab-home'), target: '.bottom-tab[data-src="home"]', soft: true, title: 'Who needs you, first',
          body: 'Home is your team’s week: who needs you first with the fix beside it, then meets and PRs.' },
        { go: click('tab-athletes'), target: '.bottom-tab[data-src="athletes"]', soft: true, title: 'Your roster',
          body: 'Every lifter, the ones who need you at the top. Open one for their training, estimated max and meets.' },
        { go: click('tab-messages'), target: '.bottom-tab[data-src="messages"]', soft: true, title: 'Every lifter, one thread',
          body: 'What they write beside what they lifted: their logged sets arrive as cards you can answer, form checks too.' },
        { go: click('tab-program'), target: '.bottom-tab[data-src="program"]', soft: true, title: 'Write their training',
          body: 'A lifter’s block, a day at a time: top sets and back-offs by RPE or %. They see it the moment you save.' },
        { go: click('tab-home'), title: 'That’s the coach app',
          body: 'Your lifters log on their phones, free for them, and it all lands here. Coach your first three lifters free.' }
      ]
    }
  };
  if (isLifter && /[?&]solo=1\b/.test(q)) {
    TOURS.lifter.steps[0].body = 'A lifter training on their own, set by set. Everything here is example data, so tap anything: nothing is saved.';
    TOURS.lifter.steps[4] = { go: click('tab-program'), target: ['.bottom-tab[data-src="program"]', '#tab-program'], soft: true, title: 'Your own program',
      body: 'Training alone? Build your block here, week by week, with RPE or %. Or start from a program in the marketplace.' };
    TOURS.lifter.steps[6].body = 'Free for lifters, with or without a coach.';
  }
  var NAME = isDesk ? 'desk' : isLifter ? (/[?&]solo=1\b/.test(q) ? 'solo' : 'lifter') : 'coach';
  var TOUR = TOURS[isDesk ? 'desk' : isLifter ? 'lifter' : 'coach'];
  // inside the iPhone app the way out is the app's own welcome, as the demo bar's Start yours free already does
  if (html.classList.contains('native')) TOUR.cta.href = 'index.html';

  /* ---------------- styles ---------------- */
  var CSS =
    '.dtour{position:fixed;inset:0;z-index:2147483000;pointer-events:auto;font-family:inherit;-webkit-tap-highlight-color:transparent}' +
    '.dtour-hole{position:fixed;border-radius:16px;box-shadow:0 0 0 2px rgb(255 255 255 / .9),0 0 0 200vmax rgb(5 5 8 / .62);pointer-events:none;' +
      'transition:top 260ms cubic-bezier(.23,1,.32,1),left 260ms cubic-bezier(.23,1,.32,1),width 260ms cubic-bezier(.23,1,.32,1),height 260ms cubic-bezier(.23,1,.32,1)}' +
    '.dtour-hole.is-none{box-shadow:0 0 0 200vmax rgb(5 5 8 / .62)}' +
    '.dtour-hole.is-soft{box-shadow:0 0 0 2px rgb(255 255 255 / .9),0 0 0 200vmax rgb(5 5 8 / .3)}' +
    '.dtour-card{position:fixed;box-sizing:border-box;width:min(380px,calc(100vw - 24px));padding:20px 20px 16px;border-radius:20px;background:#17171c;color:#f4f4f6;' +
      'box-shadow:inset 0 1px 0 rgb(255 255 255 / .10),0 0 0 1px rgb(255 255 255 / .10),0 24px 60px -18px rgb(0 0 0 / .85);outline:none;' +
      'transition:top 260ms cubic-bezier(.23,1,.32,1),left 260ms cubic-bezier(.23,1,.32,1),opacity 160ms ease}' +
    '.dtour-card.is-in{animation:dtour-in 220ms cubic-bezier(.23,1,.32,1)}' +
    '@keyframes dtour-in{from{opacity:.45;transform:translateY(6px)}to{opacity:1;transform:none}}' +
    '.dtour-n{margin:0 0 6px;font:600 13px/1.3 inherit;font-family:inherit;color:#b4b4c0;letter-spacing:.01em;font-variant-numeric:tabular-nums}' +
    '.dtour-t{margin:0;font-family:inherit;font-size:19px;font-weight:700;line-height:1.25;letter-spacing:-.01em;color:#fff;text-wrap:balance}' +
    '.dtour-b{margin:8px 0 0;font-family:inherit;font-size:15px;font-weight:400;line-height:1.5;color:#d6d6de;text-wrap:pretty}' +
    '.dtour-a{display:flex;flex-wrap:nowrap;align-items:center;gap:8px;margin-top:18px}' +
    '.dtour-a>*{flex:none}' +
    '.dtour-a>.dtour-sp{flex:1 1 0;min-width:0;width:auto;height:auto;margin:0;padding:0}' +
    '.dtour button,.dtour a.dtour-btn{-webkit-appearance:none;appearance:none;display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 16px;border:0;border-radius:999px;' +
      'font-family:inherit;font-size:15px;font-weight:650;line-height:1;text-decoration:none;cursor:pointer;white-space:nowrap;transition:transform 100ms cubic-bezier(.23,1,.32,1),background-color 150ms ease,filter 150ms ease}' +
    '.dtour button:active,.dtour a.dtour-btn:active{transform:scale(.97)}' +
    '.dtour .dtour-skip{padding:0 6px;min-width:44px;background:none;color:#b4b4c0;font-weight:600}' +
    '.dtour .dtour-back{background:rgb(255 255 255 / .10);color:#f4f4f6;box-shadow:inset 0 0 0 1px rgb(255 255 255 / .12)}' +
    '.dtour .dtour-next{background:#f4f4f6;color:#0b0b0d}' +
    '.dtour a.dtour-go{background:linear-gradient(180deg,#dc2637,#c41a2c);color:#fff;box-shadow:inset 0 1px 0 rgb(255 255 255 / .22),0 1px 2px rgb(0 0 0 / .3)}' +
    '@media (hover:hover) and (pointer:fine){.dtour .dtour-skip:hover{color:#f4f4f6}.dtour .dtour-back:hover{background:rgb(255 255 255 / .16)}.dtour .dtour-next:hover,.dtour a.dtour-go:hover{filter:brightness(1.07)}}' +
    '.dtour button:focus-visible,.dtour a.dtour-btn:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    /* the way back in: a quiet pill on the desk, a word in the demo bar */
    '.dtour-pill{position:fixed;right:24px;bottom:24px;z-index:900;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 16px 0 12px;border:0;border-radius:999px;' +
      'background:rgb(23 23 28 / .92);color:#f4f4f6;font-family:inherit;font-size:14px;font-weight:650;cursor:pointer;' +
      'box-shadow:inset 0 1px 0 rgb(255 255 255 / .10),0 0 0 1px rgb(255 255 255 / .12),0 10px 24px -10px rgb(0 0 0 / .7);transition:transform 100ms cubic-bezier(.23,1,.32,1)}' +
    '.dtour-pill:active{transform:scale(.97)}.dtour-pill:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.dtour-pill svg{flex:none}' +
    '.demo-banner .dtour-bar{-webkit-appearance:none;appearance:none;flex:none;min-height:32px;padding:0 12px;border:0;border-radius:999px;background:rgb(255 255 255 / .12);color:inherit;' +
      'font:inherit;font-size:13px;font-weight:650;cursor:pointer;box-shadow:inset 0 0 0 1px rgb(255 255 255 / .14)}' +
    'html[data-theme="light"] .demo-banner .dtour-bar{background:rgb(11 11 13 / .06);box-shadow:inset 0 0 0 1px rgb(11 11 13 / .14)}' +
    '@media (prefers-reduced-motion:reduce){.dtour-hole,.dtour-card{transition:none}.dtour-card.is-in{animation:none}}';

  /* ---------------- the step on screen ---------------- */
  var root = null, hole = null, card = null, idx = 0, steps = TOUR.steps, opener = null, onMove = null, token = 0;

  function css() {
    if (document.getElementById('dtour-css')) return;
    var s = document.createElement('style'); s.id = 'dtour-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden';
  }
  function findTarget(step) {
    if (!step.target) return null;
    var list = [].concat(step.target);
    for (var i = 0; i < list.length; i++) {
      var els = document.querySelectorAll(list[i]);
      for (var j = 0; j < els.length; j++) if (visible(els[j])) return els[j];
    }
    // a lifter or coach tab that is not on screen: its twin in the phone's bottom bar
    if (step.tab) { var t = document.querySelector('.bottom-tab[data-src="' + step.tab + '"]'); if (visible(t)) return t; }
    return null;
  }
  function deskHere() { var m = /([a-z-]+)\.html$/.exec(location.pathname); return m ? m[1] + '.html' : 'overview.html'; }

  function open(i) {
    css();
    idx = Math.max(0, Math.min(steps.length - 1, i));
    var step = steps[idx];
    // the desk's tour crosses pages: go to the step's page and carry on there
    if (isDesk && step.page && step.page !== deskHere()) {
      set('s', AT, JSON.stringify({ t: NAME, i: idx }));
      location.href = step.page + (step.hash ? '#' + step.hash : '');
      return;
    }
    if (isDesk && step.hash && location.hash.replace(/^#/, '') !== step.hash) location.hash = step.hash;
    if (typeof step.go === 'function') { try { step.go(); } catch (e) {} }
    if (!root) build();
    var my = ++token;
    // wait for the step's screen (a tab switch, a lifter opening) for up to 1.6 s, then show the card
    var t0 = Date.now();
    (function wait() {
      if (my !== token || !root) return;
      var el = findTarget(step);
      if (!el && step.target && Date.now() - t0 < 1600) { setTimeout(wait, 80); return; }
      paint(step, el);
    })();
  }

  function build() {
    opener = document.activeElement;
    root = document.createElement('div'); root.className = 'dtour';
    hole = document.createElement('div'); hole.className = 'dtour-hole is-none';
    card = document.createElement('div'); card.className = 'dtour-card';
    card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'dtour-t'); card.tabIndex = -1;
    root.appendChild(hole); root.appendChild(card);
    document.body.appendChild(root);
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-dt]');
      if (!b) return;
      var a = b.getAttribute('data-dt');
      if (a === 'next') { e.preventDefault(); open(idx + 1); }
      else if (a === 'back') { e.preventDefault(); open(idx - 1); }
      else if (a === 'skip' || a === 'close') { e.preventDefault(); close(true); }
      else if (a === 'go') { close(true); }   // the sign-up link: leave the tour, follow the link
    });
    window.addEventListener('keydown', keys, true);
    onMove = function () { if (root) requestAnimationFrame(function () { place(steps[idx], findTarget(steps[idx])); }); };
    window.addEventListener('resize', onMove, { passive: true });
    window.addEventListener('scroll', onMove, { passive: true, capture: true });
  }

  function keys(e) {
    if (!root) return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (k === 'Tab') {   // keep focus in the card
      var f = [].slice.call(card.querySelectorAll('button, a[href]'));
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      e.preventDefault(); e.stopPropagation();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      return;
    }
    if (k === 'ArrowRight' || (k === 'Enter' && !(e.target && e.target.closest && e.target.closest('.dtour a, .dtour button')))) {
      e.preventDefault(); e.stopPropagation(); if (idx < steps.length - 1) open(idx + 1); return;
    }
    if (k === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (idx > 0) open(idx - 1); return; }
    // every other key stays with the tour: the page behind has its own shortcuts
    if (!(e.target && e.target.closest && e.target.closest('.dtour'))) { e.stopPropagation(); }
  }

  function paint(step, el) {
    var last = idx === steps.length - 1;
    card.innerHTML =
      '<p class="dtour-n">' + (idx + 1) + ' of ' + steps.length + '</p>' +
      '<h2 class="dtour-t" id="dtour-t">' + esc(step.title) + '</h2>' +
      '<p class="dtour-b">' + esc(step.body) + '</p>' +
      '<div class="dtour-a">' +
        (last ? '<button type="button" class="dtour-skip" data-dt="close">Keep looking</button>'
              : '<button type="button" class="dtour-skip" data-dt="skip">Skip</button>') +
        '<span class="dtour-sp"></span>' +
        (idx > 0 ? '<button type="button" class="dtour-back" data-dt="back">Back</button>' : '') +
        (last ? '<a class="dtour-btn dtour-go" data-dt="go" href="' + esc(TOUR.cta.href) + '">' + esc(TOUR.cta.label) + '</a>'
              : '<button type="button" class="dtour-next" data-dt="next">' + (idx === 0 ? 'Show me' : 'Next') + '</button>') +
      '</div>';
    card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in');
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.top < 64 || r.bottom > innerHeight - 24) { try { el.scrollIntoView({ block: r.height > innerHeight * .7 ? 'start' : 'center', behavior: 'auto' }); } catch (e) {} }
    }
    place(step, el);
    var main = card.querySelector('[data-dt="next"], [data-dt="go"]');
    try { (main || card).focus({ preventScroll: true }); } catch (e) { (main || card).focus(); }
  }

  // The lit area and the card beside it. A phone docks the card at the top or the bottom, away from the lit area.
  function place(step, el) {
    if (!root) return;
    var vw = innerWidth, vh = innerHeight, m = 12, phone = vw < 640;
    var cw = card.offsetWidth, ch = card.offsetHeight;
    if (!el) {
      hole.className = 'dtour-hole is-none';
      hole.style.cssText = 'top:' + (vh / 2) + 'px;left:' + (vw / 2) + 'px;width:0;height:0';
      card.style.left = Math.round((vw - cw) / 2) + 'px';
      card.style.top = Math.round(phone ? vh - ch - m - bottomBar() : (vh - ch) / 2) + 'px';
      return;
    }
    var r = el.getBoundingClientRect(), pad = 8;
    var top = Math.max(m, r.top - pad), left = Math.max(m, r.left - pad);
    var bottom = Math.min(vh - m, r.bottom + pad), right = Math.min(vw - m, r.right + pad);
    hole.className = 'dtour-hole' + (step.soft ? ' is-soft' : '');
    hole.style.cssText = 'top:' + top + 'px;left:' + left + 'px;width:' + Math.max(0, right - left) + 'px;height:' + Math.max(0, bottom - top) + 'px';
    var x, y;
    if (phone) {
      x = Math.round((vw - cw) / 2);
      var bb = bottomBar();
      if (bb && r.top >= vh - bb - 4) { card.style.left = x + 'px'; card.style.top = Math.round(vh - bb - ch - m) + 'px'; return; }
      var below = vh - bottom, above = top;
      y = below >= above ? vh - ch - m - (below > ch + 2 * m + bottomBar() ? bottomBar() : 0) : m;
      if (y < bottom && y + ch > top && below < ch + m && above < ch + m) y = vh - ch - m;   // no room either side: over the area's foot
    } else {
      // beside the area if it is tall and leaves room, else under it, else over it, else inside its foot
      var tall = (bottom - top) > vh * .5;
      if (tall && vw - right >= cw + 2 * m) { x = right + m * 1.5; y = Math.max(m, Math.min(vh - ch - m, top)); }
      else if (tall && left >= cw + 2 * m) { x = left - cw - m * 1.5; y = Math.max(m, Math.min(vh - ch - m, top)); }
      else if (vh - bottom >= ch + 2 * m) { y = bottom + m * 1.5; x = Math.max(m, Math.min(vw - cw - m, r.left + r.width / 2 - cw / 2)); }
      else if (top >= ch + 2 * m) { y = top - ch - m * 1.5; x = Math.max(m, Math.min(vw - cw - m, r.left + r.width / 2 - cw / 2)); }
      else { y = vh - ch - m * 2; x = Math.max(m, Math.min(vw - cw - m, right - cw - m)); }
    }
    card.style.left = Math.round(x) + 'px';
    card.style.top = Math.round(Math.max(m, Math.min(vh - ch - m, y))) + 'px';
  }
  function bottomBar() {
    var b = document.querySelector('.bottom-tabs, #bottomTabs');
    if (!visible(b)) return 0;
    var r = b.getBoundingClientRect();
    return r.top > innerHeight * .6 ? Math.max(0, innerHeight - r.top) : 0;
  }

  function close(done) {
    token++;
    if (done) set('l', SEEN + NAME, '1');
    set('s', AT, null);
    if (root) root.remove();
    root = hole = card = null;
    window.removeEventListener('keydown', keys, true);
    if (onMove) { window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); onMove = null; }
    if (opener && opener.focus && document.contains(opener)) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
    opener = null;
  }

  /* ---------------- the way back in ---------------- */
  function replay() {
    if (isDesk && deskHere() !== TOUR.first) { set('s', AT, JSON.stringify({ t: NAME, i: 0 })); location.href = TOUR.first; return; }
    open(0);
  }
  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5 15.5 12 10 15.5z" fill="currentColor"/></svg>';
  function addEntry() {
    css();
    if (isDesk) {
      // the desk: an item of the sidebar's own, above Settings (a pill floating over the page covered rows and
      // buttons: Messages' Next). Its own drawn icon in the sidebar's stroke; on the rail its tooltip names it.
      var set0 = document.querySelector('.side a.it[data-place-link="settings"]');
      if (set0) {
        if (document.querySelector('.side .dtour-it')) return;
        var it = document.createElement('a');
        it.className = 'it dtour-it'; it.href = TOUR.first + '?tour=1'; it.title = 'Take the tour'; it.setAttribute('data-label', 'Take the tour');
        it.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M10.2 8.9v6.2l5-3.1z"/></svg><span class="l">Take the tour</span>';
        it.addEventListener('click', function (e) { e.preventDefault(); replay(); });
        set0.parentNode.insertBefore(it, set0);
        return;
      }
      if (document.querySelector('.dtour-pill')) return;
      var p = document.createElement('button');
      p.type = 'button'; p.className = 'dtour-pill'; p.innerHTML = ICON + '<span>Take the tour</span>';
      p.addEventListener('click', replay);
      document.body.appendChild(p);
      return;
    }
    // the lifter and coach demos: a word in the demo bar, before Start yours free (the bar can be put away for the visit)
    var tries = 0;
    (function find() {
      var bar = document.querySelector('.demo-banner');
      if (!bar) { if (++tries < 20) setTimeout(find, 250); return; }
      if (bar.querySelector('.dtour-bar')) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'dtour-bar'; b.textContent = 'Tour';
      b.setAttribute('aria-label', 'Take the tour of the demo');
      b.addEventListener('click', replay);
      var cta = bar.querySelector('a.btn, .btn');
      bar.insertBefore(b, cta || null);
      if (bar.scrollWidth > bar.clientWidth + 1) {
        var sh = bar.querySelector('.demo-banner-short');
        if (sh) { sh.innerHTML = '<strong>Live demo</strong>'; sh.title = 'Nothing you do here is saved'; }
      }
    })();
  }

  /* ---------------- start ---------------- */
  function ready() {
    if (isDesk && ((window.DEMO && window.DEMO.fresh) || /[?&]fresh=1\b/.test(q))) return;   // the new coach's own desk
    if (isCoach && html.classList.contains('desk')) return;   // coach.html on a laptop: the desk is the coach demo there
    addEntry();
    var at = null;
    try { at = JSON.parse(get('s', AT) || 'null'); } catch (e) { at = null; }
    if (at && at.t === NAME && typeof at.i === 'number') { set('s', AT, null); setTimeout(function () { open(at.i); }, 350); return; }
    var forced = /[?&]tour=1\b/.test(q);
    var first = !get('l', SEEN + NAME);
    if (forced || (first && (!isDesk || deskHere() === TOUR.first))) setTimeout(function () { open(0); }, isDesk ? 700 : 1100);
  }
  window.DemoTour = { start: replay, close: function () { close(true); } };
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
})();
