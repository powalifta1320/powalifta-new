/* desk.js: the shell of the coach desk, round 6: a flush solid sidebar (places, Views, the coach line and its menu), a
   solid toolbar band, solid popovers, menus, toasts and sheets, a flush inspector pane (13 Nov: no glass, no faces, no
   status glyphs).
   DESK.mount() draws the sidebar (places and Views with live counts from PL.counts(), the coach line that opens the
   account menu) and the toolbar (a plain collapsed title; the page's crimson is the last item of its trailing group);
   DESK.pop (popovers that grow from their trigger), DESK.menu, DESK.sheet (a modal <dialog> under the toolbar),
   DESK.insp (the inspector: non-modal, the page under it marked data-under), DESK.toast (bottom left, with Undo, held
   while the pointer is on it; ⌘Z takes the latest one back, even after it has gone; store.js routes K.toast through
   PL.hooks.toast to it), ⌘K Find (names, programs, teams, meets, the desk's moves, and answers to roster questions from
   the store's own counts), the key map (? and ⌘/, with the "Tab per week" option), DESK.list (a page's list column stays
   unless the coach hides it), ⌥↓ ⌥↑ and J K on every [data-list], DESK.openLifter and DESK.back (where the coach came
   from, with its scroll), the theme (powa-r6-theme), the URL (selection in the hash; ?id ?f … moved there on load), the
   routes between pages, and DESK.states / state / settled for the gate. Every count comes from the store. */
(function () {
  'use strict';
  var K = window.K, PL = window.PL, esc = K.esc, D = K.D;
  var DESK = window.DESK = { K: K };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var reduced = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var fn = function (o, k) { return !!o && typeof o[k] === 'function'; };
  var subs = {};
  DESK.on = function (t, f) { (subs[t] = subs[t] || []).push(f); return function () { subs[t] = subs[t].filter(function (x) { return x !== f; }); }; };
  var emit = function (t, p) { (subs[t] || []).slice().forEach(function (f) { try { f(p); } catch (e) { console.error(e); } }); };
  var store = {
    get: function (area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set: function (area, k, v) { try { if (v == null) window[area].removeItem(k); else window[area].setItem(k, v); } catch (e) { /* storage blocked */ } }
  };
  var json = function (s) { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };

  /* ---------------- icons: K.ic's family (24 px, round stroke), a few more in the same hand ---------------- */
  var XI = {
    sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M9.5 4.5v15M5.8 8h1.4M5.8 11h1.4"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
    adduser: '<circle cx="9.5" cy="8" r="3.5"/><path d="M3 20a6.5 6.5 0 0 1 13 0M19 8.5v6M16 11.5h6"/>',
    walk: '<path d="m6.5 6 6 6-6 6M12.5 6l6 6-6 6"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9"/>',
    redo: '<path d="M16 8H9a5 5 0 0 0 0 10h6M16 8l-3.5-3.5M16 8l-3.5 3.5"/>',
    table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10"/>',
    builder: '<path d="M4.5 6.5h15M4.5 12h10M4.5 17.5h7"/>',
    pin: '<path d="M9 4.5h6l-1 5.5 3 3H7l3-3z"/><path d="M12 13v6.5"/>',
    up: '<path d="M12 19V5M6.5 10.5 12 5l5.5 5.5"/>',
    send2: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    top: '<path d="M6 15l6-6 6 6"/>',
    pause: '<path d="M9 6.5v11M15 6.5v11" stroke-width="2.4"/>'   /* beside K.ic play (filled): two round strokes, as heavy */
  };
  DESK.ic = function (k, w) {
    if (XI[k]) return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + XI[k] + '</svg>';
    return K.ic(k, w);
  };
  DESK.mark = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect class="ink" x="1.5" y="14.6" width="29" height="2.8" rx="1.4"/><rect class="plate" x="8" y="3" width="7.5" height="26" rx="2.2"/><rect class="ink" x="17" y="7.5" width="4" height="17" rx="1.6"/><rect class="ink" x="22.5" y="12" width="2.6" height="8" rx="1.1"/></svg>';
  DESK.esc = esc;

  /* ---------------- places, pages and where they live ----------------
     DESK.pages names every page of the desk; DESK.routes every page that is built (all of them), plus the two old names
     as aliases: roster → overview.html, lifter → lifters.html, so DESK.go('lifter', …), DESK.routes.lifter and
     DESK.openLifter land on the new places with no edit to the pages that use them. A place without a page is never in
     the sidebar and DESK.go answers false for it (never a "soon" toast: no dead ends). Each page reads its selection from
     the hash (shared.md §7): lifters.html#id=&tab=&f=&q=&sort=&view=&from=, programs.html#id=&week=&view=&row=&tab=…,
     teams.html#id=&lifter=&week=&from=, meets.html#id=&lifter=&stage=&sheet=&book=&from=, messages.html#id=&review=&q=,
     clients.html#id=&view=&invite=, settings.html#s=. */
  /* Settings is a place too (function-polish FD11, F8.1): the last one, set apart by space (ui.css), its own violet tint
     from tokens.css when it is open. The coach line's menu keeps Settings and Plan and seats. */
  var PLACES = [['overview', 'Overview', 'today'], ['lifters', 'Lifters', 'lifters'], ['programs', 'Programs', 'programs'], ['teams', 'Teams', 'teams'], ['meets', 'Meets', 'meets'], ['messages', 'Messages', 'messages'], ['clients', 'Clients', 'clients'], ['settings', 'Settings', 'settings']];
  var PAGES = { overview: 'overview.html', lifters: 'lifters.html', programs: 'programs.html', teams: 'teams.html', meets: 'meets.html', messages: 'messages.html', clients: 'clients.html', settings: 'settings.html' };
  var ALIAS = { roster: 'overview', lifter: 'lifters' };
  var BUILT = ['overview', 'lifters', 'programs', 'teams', 'meets', 'messages', 'clients', 'settings'];
  var LABEL = { overview: 'Overview', lifters: 'Lifters', programs: 'Programs', teams: 'Teams', meets: 'Meets', messages: 'Messages', clients: 'Clients', settings: 'Settings' };
  var FILE = location.pathname.split('/').pop();
  /* the current page among the real places only, never an alias (roster.html is not the Overview) */
  var HERE = BUILT.filter(function (k) { return FILE === PAGES[k]; })[0] || null;
  DESK.pages = {}; Object.keys(PAGES).forEach(function (k) { DESK.pages[k] = PAGES[k]; });
  DESK.routes = {};
  BUILT.forEach(function (k) { DESK.routes[k] = PAGES[k]; });
  Object.keys(ALIAS).forEach(function (a) { DESK.pages[a] = DESK.routes[a] = PAGES[ALIAS[a]]; });
  DESK.here = HERE;
  /* DESK.go(place, hash, { from, back }): with a from or a back it remembers where the coach came from, as
     DESK.openLifter does (sessionStorage powa-r6-back, &from=<from> in the hash, this page's scroll kept), so the place
     it opens shows "‹ <this page>" and DESK.goBack() returns with the scroll as it was */
  DESK.go = function (place, hash, o) {
    var r = DESK.routes[place];
    if (!r) { if (window.console) console.warn('DESK.go: no page for ' + place); return false; }   /* never a dead-end toast */
    hash = hash || '';
    if (o && (o.from || o.back) && DESK._remember) hash = DESK._remember(hash, o);
    location.href = r + (hash ? '#' + hash : '');
    return true;
  };
  /* the route plus the hash, for links; null for a place without a page */
  DESK.href = function (place, hash) { var r = DESK.routes[place]; return r ? r + (hash ? '#' + hash : '') : null; };

  /* ---------------- the theme: ?theme= wins, then powa-r6-theme, else dark (the <head> script sets it first) ----------------
     powa-r6-theme is 'dark', 'light' or 'auto' (Settings › Appearance, "Automatic follows your Mac"): auto shows the Mac's
     look and follows it when it changes. DESK.theme.get() is the look on screen; DESK.theme.pref() what the coach chose. */
  var themeWords = function () { return DESK.theme.get() === 'light' ? 'Switch to dark mode' : 'Switch to light mode'; };
  var macLight = (function () { try { return matchMedia('(prefers-color-scheme: light)'); } catch (e) { return null; } })();
  var urlTheme = function () { var m = /[?&]theme=(light|dark)\b/.exec(location.search); return m ? m[1] : null; };
  function showTheme(t) {
    if (document.documentElement.getAttribute('data-theme') !== t) document.documentElement.setAttribute('data-theme', t);
    $$('[data-theme-toggle]').forEach(function (b) { b.textContent = themeWords(); });
    emit('theme', t);
  }
  DESK.theme = {
    get: function () { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; },
    pref: function () { var v = store.get('localStorage', 'powa-r6-theme'); return v === 'auto' || v === 'light' || v === 'dark' ? v : 'dark'; },
    set: function (t) {
      t = t === 'light' || t === 'auto' ? t : 'dark';
      store.set('localStorage', 'powa-r6-theme', t);
      showTheme(t === 'auto' ? (macLight && macLight.matches ? 'light' : 'dark') : t);
    }
  };
  /* a page whose <head> script reads only light and dark shows dark for 'auto': put the Mac's look on it, and follow it */
  if (!urlTheme() && DESK.theme.pref() === 'auto' && macLight) showTheme(macLight.matches ? 'light' : 'dark');
  if (macLight && macLight.addEventListener) macLight.addEventListener('change', function () { if (!urlTheme() && DESK.theme.pref() === 'auto') showTheme(macLight.matches ? 'light' : 'dark'); });

  /* ---------------- the sidebar ---------------- */
  function counts() { var c = PL.counts(); return (c && c.data) || {}; }
  /* a sidebar badge shows nothing at 0: a bold "Messages 0" would ask for attention nobody needs */
  var badge = function (v) { return v ? String(v) : ''; };
  var VIEWS = [['need', 'Needs you', 'needYou'], ['health', 'Pain or low recovery', 'painOrLow'], ['waiting', 'Waiting for a reply', 'waitingThreads'], ['meet', 'Meet in 8 weeks', 'meetLifters']];
  /* the lifters on the desk who are not invited-and-unjoined (first-time-coach §5); Views show from 4 of them: under that
     the Lifters list is one screen and four empty filters are noise. The places never move or hide. */
  var rosterN = function (c) { c = c || counts(); return Math.max(0, (c.lifters || 0) - (c.invited || 0)); };
  var viewsShown = function (c) { return rosterN(c) >= 4; };
  /* the sidebar's Lifters opens the lifter last open on Lifters this session (function-polish F10.2), else the list's first
     row; an id this desk does not hold (the other desk's) is never used */
  var LAST_KEY = 'powa-r6-lifters-last';
  function lifterKnown(id) { if (!id) return false; try { var g = PL.lifters.get(id); return !!(g && g.data); } catch (e) { return false; } }
  function liftersHref() { var id = store.get('sessionStorage', LAST_KEY); return DESK.routes.lifters + (lifterKnown(id) ? '#id=' + encodeURIComponent(id) : ''); }
  function noteLastLifter() { if (HERE !== 'lifters') return; var id = DESK.url.get().id; if (lifterKnown(id)) store.set('sessionStorage', LAST_KEY, id); }
  function sidebarHtml() {
    var c = counts();
    var due = Object.prototype.hasOwnProperty.call(c, 'programsDue');
    /* a number in the sidebar is work waiting (weeks to send, replies, client tasks, meets coming), never a head count:
       "Lifters 20" and "Teams 1" sat beside "Messages 6" as if 20 lifters were waiting (20 Nov) */
    var key = { overview: null, lifters: null, programs: due ? 'programsDue' : 'programsToWrite', teams: null, meets: 'meetsSoon', messages: 'waitingThreads', clients: 'clientsToDo' };
    /* every badge says what it counts (a total, or what waits on the coach) */
    var what = { overview: '', lifters: 'lifters', programs: due ? 'weeks and changes to send' : 'programs to write', teams: 'teams', meets: 'meets in the next 8 weeks', messages: 'lifters waiting for a reply', clients: 'client tasks to do' };
    var it = function (p) {
      var href = DESK.routes[p[0]], k = key[p[0]], v = k ? c[k] : null;
      if (!href) return '';   /* a place without a page is not in the sidebar: no dead ends */
      if (p[0] === 'lifters') href = liftersHref();
      return '<a class="it" href="' + href + '" data-place-link="' + p[0] + '"' + (what[p[0]] ? ' data-what="' + what[p[0]] + '"' : '') + (v ? ' title="' + v + ' ' + what[p[0]] + '"' : '') + '>' + DESK.ic(p[2]) + '<span class="l">' + p[1] + '</span>' +
        (k ? '<span class="n' + (p[0] === 'messages' ? ' hot' : '') + '" data-count="' + k + '">' + badge(v) + '</span>' : '') + '</a>';
    };
    /* a View is words and a count: no icon, no colour */
    var view = function (x) { return '<a class="it" href="' + DESK.routes.lifters + '#f=' + x[0] + '" data-view="' + x[0] + '"><span class="l">' + x[1] + '</span><span class="n" data-count="' + x[2] + '">' + badge(c[x[2]]) + '</span></a>'; };
    var coach = D.coach || { name: 'Sam Ellis', plan: 'Pro' };
    return '<aside class="side" data-crop="sidebar" aria-label="Coach desk">' +
      '<a class="brand" href="' + DESK.routes.overview + '" aria-label="POWALIFTA, the Overview">' + DESK.mark + '<b>POWALIFTA</b></a>' +
      '<button class="find" type="button" data-find aria-keyshortcuts="Meta+K">' + DESK.ic('find', 2) + '<span>Find</span><kbd>⌘K</kbd></button>' +
      '<nav aria-label="Places">' + PLACES.map(it).join('') + '</nav>' +
      '<div class="side-h" id="views-h"' + (viewsShown(c) ? '' : ' hidden') + '>Views</div><nav aria-labelledby="views-h"' + (viewsShown(c) ? '' : ' hidden') + '>' + VIEWS.map(view).join('') + '</nav>' +
      '<div class="spacer"></div>' +
      '<button class="me" type="button" data-account aria-haspopup="menu" aria-expanded="false" aria-label="' + esc(coach.name + ', account') + '"><b>' + esc(coach.name) + '</b><small>' + esc(seatsLine()) + '</small></button>' +
      '</aside>';
  }
  /* the coach line's plan and seats, from the store (an accepted application holds a seat) */
  function seatsLine() {
    var coach = D.coach || { plan: 'Pro' }, bs = fn(PL.billing, 'summary') ? PL.billing.summary() : null;
    var seats = bs && bs.data && bs.data.seats ? bs.data.seats : { used: coach.seats, limit: coach.limit, plan: coach.plan };
    /* a plan without a limit (Premium) counts the seats in use: "Premium, 21 seats" (screens.md §8.2) */
    if (seats.unlimited || seats.limit == null) return (seats.plan || coach.plan) + ', ' + seats.used + ' seats';
    /* Free counts lifters, not seats: "Free, 1 of 3 lifters" (first-time-coach §5.4); an invite holds one */
    if ((seats.plan || coach.plan) === 'Free') return 'Free, ' + (seats.used || 0) + ' of ' + seats.limit + ' lifters';
    return (seats.plan || coach.plan) + ', ' + seats.used + ' of ' + seats.limit + ' seats';
  }
  /* which item is current: the page's place; on Lifters a View when the hash's filter is one (then Lifters is not) */
  function paintCurrent() {
    var side = $('.side'); if (!side) return;
    var place = HERE || ALIAS[document.body.getAttribute('data-place')] || document.body.getAttribute('data-place');
    var f = place === 'lifters' ? DESK.url.get().f : null, onView = !!f && VIEWS.some(function (x) { return x[0] === f; });
    $$('.it', side).forEach(function (a) {
      var on = a.hasAttribute('data-view') ? onView && a.getAttribute('data-view') === f : !onView && a.getAttribute('data-place-link') === place;
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  addEventListener('hashchange', paintCurrent);
  /* every [data-count] follows the store; in the sidebar a 0 shows nothing, and each place's title says what it counts;
     the coach line's seats follow it too */
  function paintCounts() {
    var c = counts(), me = $('.side .me small');
    if (me) { var sl = seatsLine(); if (me.textContent !== sl) me.textContent = sl; }
    var vs = !viewsShown(c);
    $$('.side #views-h, .side nav[aria-labelledby="views-h"]').forEach(function (el) { if (el.hidden !== vs) el.hidden = vs; });
    var ll = $('.side [data-place-link="lifters"]'); if (ll) { var lh = liftersHref(); if (ll.getAttribute('href') !== lh) ll.setAttribute('href', lh); }
    $$('[data-count]').forEach(function (el) {
      var v = c[el.getAttribute('data-count')]; if (v == null) return;
      var side = el.closest('.side'), t = side ? badge(v) : String(v);
      if (t !== el.textContent) el.textContent = t;
      var a = side && el.closest('.it[data-what]');
      if (a) { if (v) a.setAttribute('title', v + ' ' + a.getAttribute('data-what')); else a.removeAttribute('title'); }
    });
    emit('counts', c);
  }

  /* the two desks of this preview (first-time-coach §2.1): the fresh desk opens the example desk, the example desk starts a
     fresh one. data.js keeps the choice (sessionStorage powa-r6-desk). The fresh desk's item carries data-demo; on the
     example desk it does not, since the gate allows a demo control only where DEMO.fresh is true (FTC §16, FC-42). */
  /* the owner, 16 Nov: "why can a coach start a new desk". A coach has one desk, so the example desk offers no way to start
     a fresh one; only the new coach's desk keeps "Open the example desk" (look around), with "‹ Your desk" to come back. */
  function deskSwitch() { return D.fresh ? { id: 'desk', label: 'Open the example desk', demo: true, title: 'Sam’s 20 lifters, to look around' } : null; }
  function goDesk() { location.href = DESK.routes.overview + (D.fresh ? '?fresh=0' : '?fresh=1'); }
  /* the coach line's menu: Settings, Plan and seats, the desk switch, Keys, then the theme; never a "soon" item */
  function accountMenu(b) {
    var light = DESK.theme.get() === 'light', coach = D.coach || { name: 'Sam Ellis' };
    /* Settings lives in the sidebar; the owner (16 Nov): "settings is there on sidebar and under profile too", so not here */
    DESK.menu.open(b, [{ id: 'plan', label: 'Plan and seats' }, deskSwitch(), { id: 'keys', label: 'Keys', title: 'Press ? or ⌘/ anywhere' }, { sep: true }, { id: 'theme', label: light ? 'Switch to dark mode' : 'Switch to light mode' }].filter(Boolean), {
      label: coach.name, place: 'auto',
      run: function (id) {
        if (id === 'desk') goDesk();
        else if (id === 'theme') DESK.theme.set(light ? 'dark' : 'light');
        else if (id === 'keys') DESK.keys();
        else if (id === 'settings') DESK.go('settings');
        else if (id === 'plan') DESK.go('settings', 's=plan');
      }
    });
  }

  /* ---------------- mount: the sidebar, the scroll edge and the toolbar around #page ----------------
     DESK.mount({ place, title, lead, mid, trail, fixed }). fixed: a window that never scrolls (Messages): its toolbar band
     takes the pointer along its whole length, as a title bar does (ui.css body.is-fixed). */
  DESK.mount = function (o) {
    o = o || {};
    var page = document.getElementById('page');
    if (o.fixed) document.body.classList.add('is-fixed');
    document.body.insertAdjacentHTML('afterbegin', sidebarHtml());
    /* a view switch sits in the leading group, right after back and the arrows (function-polish PX4): what a page gives as
       mid goes there, before the collapsed title; the middle group stays empty. Arriving at the example desk from the
       fresh one, the Overview leads with a quiet way back (first-time-coach §2.1). */
    var yours = HERE === 'overview' && !D.fresh && D.deskFrom === 'fresh' ? '<a class="btn quiet" href="' + DESK.routes.overview + '?fresh=1" data-your-desk title="Back to your own desk">‹ Your desk</a>' : '';
    page.insertAdjacentHTML('afterbegin',
      '<header class="tb" data-crop="toolbar" aria-label="Toolbar">' +
      '<div class="tb-lead">' + yours + (o.lead || '') + (o.mid || '') + '<button class="tb-title" type="button" data-top aria-label="Back to the top of ' + esc(o.title || '') + '" tabindex="-1"><span>' + esc(o.title || '') + '</span></button></div>' +
      '<div class="tb-mid"></div><div class="tb-trail">' + (o.trail || '') + '</div></header>');
    /* the toasts live outside the page, so a page under an inspector (data-under) never dims them */
    if (!$('body > .toasts')) document.body.insertAdjacentHTML('beforeend', '<div class="toasts" aria-live="polite" role="status"></div>');
    PL.on('change', paintCounts);
    paintCounts(); paintCurrent();
    $$('.seg').forEach(DESK.segSync);
    /* body.is-scrolled while the page has moved off its top (ui.css lets the pointer through the empty band at rest): an
       IntersectionObserver on a pixel at the very top, no scroll listener */
    var pin = document.querySelector('.desk-top');
    if (!pin) { pin = document.createElement('div'); pin.className = 'desk-top'; pin.setAttribute('aria-hidden', 'true'); document.body.insertBefore(pin, document.body.firstChild); }
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { document.body.classList.toggle('is-scrolled', !es[es.length - 1].isIntersecting); }).observe(pin);
    /* the middle group's room beside an open inspector follows what the toolbar holds (a page repaints its groups) */
    var tb = page.querySelector('.tb');
    if (tb && 'MutationObserver' in window) new MutationObserver(syncMid).observe(tb, { childList: true, subtree: true, characterData: true });
    restoreScroll();
    mounted = true; soon();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(soon);
    addEventListener('load', soon, { once: true });
    return page.querySelector('main');
  };
  /* a page that changes its subject in place (the next lifter) renames the collapsed title */
  DESK.setTitle = function (text) {
    var b = $('.tb-title'); if (!b) return;
    b.querySelector('span').textContent = text; b.setAttribute('aria-label', 'Back to the top of ' + text);
    soon();
  };

  /* ---------------- after each render: the collapsed title's place and the words on demand ----------------
     One MutationObserver on the document (child lists only, so the marks it sets never wake it), batched to a frame:
     DESK.title.place() and DESK.terms.paint(). */
  var mounted = false, soonF = 0;
  function soon() { if (soonF) return; soonF = requestAnimationFrame(function () { soonF = 0; if (mounted) placeTitle(); DESK.terms.paint(); }); }
  if ('MutationObserver' in window) new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) { var t = ms[i].target; if (!(t.nodeType === 1 && t.closest && t.closest('.toasts, [data-term-pop]'))) { soon(); return; } }
  }).observe(document.documentElement, { childList: true, subtree: true });
  addEventListener('resize', soon);

  /* the collapsed title starts at the page's own h1's left edge (function-polish PX5): measured on mount, on resize and
     after each render; if that would come within 16 px of what leads the toolbar (back, a view switch), it starts 16 px
     after it. The page's h1 is the visible one outside the toolbar and the floating layers. */
  function mainH1() { return $$('#page h1').filter(function (h) { return !h.closest('.tb, [data-layer], dialog') && visible(h); })[0] || null; }
  function placeTitle() {
    var b = $('.tb-title'), lead = b && b.parentElement; if (!b) return;
    var h = mainH1(); if (!h) return;
    b.style.setProperty('--title-x', '0px');
    var nat = b.getBoundingClientRect().left, x = h.getBoundingClientRect().left, after = 0;
    [].slice.call(lead.children).forEach(function (c) { if (c === b || !visible(c)) return; var r = contentBox(c); if (r.width) after = Math.max(after, r.right); });
    if (after) x = Math.max(x, after + px('--sp-4', 16));
    var m = Math.max(0, Math.round(x - nat));
    b.style.setProperty('--title-x', m + 'px');
  }

  /* ---------------- one list head on every list (function-polish PX3) ----------------
     DESK.listHead(host, { name, count, countKey, action }) puts (or replaces) the head at the top of host: the list's name
     and count in one 20 px section title, then the action slot (a quiet button, a two-item segmented control, a label).
     Answers the head. A count with a countKey follows the store (paintCounts). */
  DESK.listHead = function (host, o) {
    o = o || {};
    if (typeof host === 'string') host = $(host);
    var n = o.count != null ? '<span class="n"' + (o.countKey ? ' data-count="' + esc(o.countKey) + '"' : '') + '>' + esc(String(o.count)) + '</span>' : '';
    var html = '<div class="lh" data-list-head><h2>' + esc(o.name || '') + (n ? ' ' + n : '') + '</h2><span class="grow"></span>' + (o.action || '') + '</div>';
    if (!host) return html;
    var was = host.querySelector(':scope > [data-list-head]');
    if (was) was.outerHTML = html; else host.insertAdjacentHTML('afterbegin', html);
    return host.querySelector(':scope > [data-list-head]');
  };
  /* the collapsed title follows the window's scroll (glass.css). A page whose window stays still and scrolls a pane of its
     own (Programs, Messages) folds it itself: DESK.title.fold(true) once its large title has gone, fold(false) when it is
     back (body.is-title-folded, glass.css). The button keeps its job, back to the top: fold(true, { top: fn }) gives it
     the page's own way there (its pane), else it scrolls the window. */
  var titleTop = null;
  DESK.title = {
    fold: function (on, o) { titleTop = on && o && typeof o.top === 'function' ? o.top : null; document.body.classList.toggle('is-title-folded', !!on); return !!on; },
    folded: function () { return document.body.classList.contains('is-title-folded'); },
    place: function () { placeTitle(); }
  };

  /* ---------------- the segmented Picker: the thumb follows the chosen segment ---------------- */
  DESK.segSync = function (seg, animate) {
    if (!seg) return;
    var thumb = seg.querySelector('.seg-thumb'); if (!thumb) { thumb = document.createElement('span'); thumb.className = 'seg-thumb'; thumb.setAttribute('aria-hidden', 'true'); seg.insertBefore(thumb, seg.firstChild); }
    var on = seg.querySelector('button[aria-pressed="true"], button[aria-selected="true"]');
    if (!on) { thumb.hidden = true; return; }
    thumb.hidden = false;
    if (!animate) thumb.style.transition = 'none';
    thumb.style.width = on.offsetWidth + 'px';
    thumb.style.transform = 'translateX(' + on.offsetLeft + 'px)';
    if (!animate) { void thumb.offsetWidth; thumb.style.transition = ''; }
  };
  addEventListener('resize', function () { $$('.seg').forEach(function (s) { DESK.segSync(s); }); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { $$('.seg').forEach(function (s) { DESK.segSync(s); }); });

  /* ---------------- toasts: what changed, with Undo; never take focus ----------------
     One at a time, bottom left (ui.css .toast), the full text in its title. 5 s with Undo, 4 s without; the timer holds
     while the pointer is on the toast or its button has the focus. Its Undo says what it did: an undo that answers in the
     store's words ({ meta: { label } }, or { error } when it was refused, as PL.undo does) shows that answer as the next
     toast, always starting "Undone: ", names keeping their capitals. ⌘Z (outside fields and grids) takes back the latest
     toast's move that is not taken back yet, even after the toast has gone; the store decides, and a refusal is a toast. */
  var toastEl = null, toastT = null, toastLeft = 0, toastAt = 0, undos = [];
  function hideToast(t) { if (!t || !t.isConnected) return; t.classList.add('is-leaving'); setTimeout(function () { t.remove(); }, 160); if (toastEl === t) { toastEl = null; clearTimeout(toastT); } }
  function sayUndone(r) {
    if (!r || typeof r !== 'object') return;
    if (r.error && r.error.message) { DESK.toast(r.error.message); return; }
    if (r.meta && r.meta.label) {
      var s = String(r.meta.label);
      s = /^Undone: /.test(s) ? s.replace(/^Undone: (.)/, function (m, c) { return 'Undone: ' + c.toUpperCase(); }) : 'Undone: ' + s;
      DESK.toast(s);
    }
  }
  function runUndo(u) {
    var i = undos.indexOf(u); if (i >= 0) undos.splice(i, 1);
    if (toastEl && toastEl._undo === u) hideToast(toastEl);
    sayUndone(u.fn());
  }
  function holdToast(t, on) {
    if (t !== toastEl) return;
    if (on) { if (toastT) { clearTimeout(toastT); toastT = null; toastLeft = Math.max(800, toastLeft - (Date.now() - toastAt)); } }
    else if (!toastT && !t.matches(':hover') && !t.contains(document.activeElement)) { toastAt = Date.now(); toastT = setTimeout(function () { hideToast(t); }, toastLeft); }
  }
  DESK.toast = function (text, undo, o) {
    o = o || {};
    var box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('aria-live', 'polite'); box.setAttribute('role', 'status'); document.body.appendChild(box); }
    /* over an open modal sheet the toast sits inside the sheet's top layer, so its Undo can be pressed (the page under a
       modal is inert); the box goes back to the page when that sheet closes */
    var modal = [].slice.call(document.querySelectorAll('dialog[open]')).filter(function (d) { try { return d.matches(':modal'); } catch (e) { return false; } }).pop();
    if (modal && box.parentNode !== modal) {
      modal.appendChild(box);
      if (!modal._toastsBack) { modal._toastsBack = true; modal.addEventListener('close', function () { var bx = modal.querySelector('.toasts'); if (bx) document.body.appendChild(bx); }); }
    }
    if (toastEl) hideToast(toastEl);
    var t = document.createElement('div'), u = typeof undo === 'function' ? { fn: undo } : null;
    t.className = 'toast' + (u ? '' : ' no-undo');
    t.setAttribute('data-layer', 'toast');
    t.title = String(text);
    t.innerHTML = '<span class="msg">' + esc(text) + '</span>' + (u ? '<button class="btn sm" type="button" title="Undo (⌘Z)">Undo</button>' : '');
    if (u) { t._undo = u; undos.push(u); if (undos.length > 50) undos.shift(); t.querySelector('button').addEventListener('click', function () { runUndo(u); }); }
    t.addEventListener('pointerenter', function () { holdToast(t, true); });
    t.addEventListener('pointerleave', function () { holdToast(t, false); });
    t.addEventListener('focusin', function () { holdToast(t, true); });
    t.addEventListener('focusout', function () { setTimeout(function () { holdToast(t, false); }, 0); });
    box.appendChild(t); toastEl = t;
    clearTimeout(toastT); toastLeft = o.ms || (u ? 5000 : 4000); toastAt = Date.now();
    toastT = setTimeout(function () { hideToast(t); }, toastLeft);
    return t;
  };
  /* ⌘Z: the latest move a toast offered to take back */
  DESK.undoLast = function () {
    var u = undos[undos.length - 1];
    if (!u) { DESK.toast('Nothing to undo.'); return false; }
    runUndo(u); return true;
  };
  /* coach.js C.run calls K.toast; store.js owns K.toast and hands every toast (with its Undo) to this hook */
  if (PL && PL.hooks) PL.hooks.toast = function (t) { DESK.toast(t.text, t.undo); };
  K.toast = function (text, undo) { return DESK.toast(text, undo); };   // the renderer behind the hook (no store: direct)

  /* ---------------- popovers: grow from their trigger, sit fully in the window, never carry the crimson ----------------
     DESK.pop.open(trigger, html, { label, focus, layer, anchor, place, hold, onClick, onKey }). Handlers a page adds to the
     returned element (addEventListener or on*) last until the next open. The trigger keeps aria-expanded, .is-open,
     the focus return and the grow origin (--ox, --oy point at it). anchor: an element around the trigger (its row, its
     card) that the popover is placed against instead, so it never covers what it decides about. place: 'auto' (below the
     anchor; above it when it fits there whole; else beside it, on the side with more room; clamped in the window only when
     nothing fits, as the last resort), 'below-end' (from the anchor's foot, its trailing edge on the anchor's; its leading
     edge on the anchor's instead when an anchor row is narrower than the popover, so it never hangs back past the row's start
     over the list's edge or the sidebar), 'below-start' (from the anchor's foot, its leading edge on the anchor's), 'beside'
     (right of the anchor, else left of it). Always in the window, under the toolbar's band, clear of the sidebar pane when
     the trigger is in the content and left of an open inspector when the trigger is. hold: the popover belongs to where
     the page was when it opened and closes once the page moves (ui.css .pop.is-held). */
  var popEl = null, popTrig = null, popClosed = { at: 0, el: null }, popByCode = false, held = { io: null, pin: null }, popOwn = [];
  var px = function (name, d) { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || d; };
  function placePop(el, trigger, o) {
    var t = trigger.getBoundingClientRect(), a = o.anchor && o.anchor.isConnected ? o.anchor.getBoundingClientRect() : t;
    var W = document.documentElement.clientWidth, H = innerHeight, w = el.offsetWidth, h = el.offsetHeight;
    var m = 12, gap = 8, aside = 12, top = px('--edge-h', 56) + gap, lo = m, hi = W - m;
    var side = $('.side'); if (side) { var sr = side.getBoundingClientRect(); if (t.left >= sr.right) lo = Math.max(lo, sr.right + gap); }
    if (DESK.insp.isOpen()) { var ir = DESK.insp.el().getBoundingClientRect(); if (t.right <= ir.left) hi = Math.min(hi, ir.left - gap); }
    var cx = function (x) { return Math.max(lo, Math.min(hi - w, x)); }, cy = function (y) { return Math.max(top, Math.min(H - m - h, y)); };
    var below = a.bottom + gap, above = a.top - gap - h, fitsBelow = below + h <= H - m, fitsAbove = above >= top;
    var toRight = a.right + aside, toLeft = a.left - aside - w, fitsRight = toRight + w <= hi, fitsLeft = toLeft >= lo;
    var besideX = fitsRight && (!fitsLeft || hi - a.right >= a.left - lo) ? toRight : fitsLeft ? toLeft : null;
    var centred = cx(t.left + t.width / 2 - w / 2), place = o.place || 'auto', x, y;
    if (place === 'beside' && besideX != null) { x = besideX; y = cy(t.top - aside); }
    else if (place === 'below-end' || place === 'below-start') { x = cx(place === 'below-start' || (o.anchor && o.anchor !== trigger && a.width < w) ? a.left : a.right - w); y = fitsBelow ? below : fitsAbove ? above : cy(below); }
    else if (fitsBelow) { x = centred; y = below; }
    else if (fitsAbove) { x = centred; y = above; }
    else if (besideX != null) { x = besideX; y = cy(t.top - aside); }
    else { x = centred; y = cy(below); }
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
    el.style.setProperty('--ox', Math.round(t.left + t.width / 2 - x) + 'px');
    el.style.setProperty('--oy', Math.round(Math.max(0, Math.min(h, t.top + t.height / 2 - y))) + 'px');
  }
  /* hold: shown only while the page sits within 24 px of where it opened (CSS), closed once it has moved: an
     IntersectionObserver whose root is a band 24 px around the trigger (no scroll listener). A trigger on a surface that
     never moves (the toolbar, the sidebar, the inspector, a sheet) is watched through a pin in the page instead. */
  function unhold() { if (held.io) held.io.disconnect(); if (held.pin) held.pin.remove(); held = { io: null, pin: null }; }
  /* a trigger or its row partly hidden inside an inner scroll pane (a list column, a card's own list) is brought whole into
     that pane first, at once (no smooth scroll): a popover never grows from a half-hidden row. The page itself never moves. */
  function revealIn(el) {
    if (!el || !el.isConnected) return;
    for (var p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      var cs = getComputedStyle(p);
      if (!/(auto|scroll)/.test(cs.overflowY) || p.scrollHeight <= p.clientHeight + 1) continue;
      var pr = p.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = 16, dy = 0;
      if (r.height > pr.height - 2 * pad) continue;
      if (r.top < pr.top + pad) dy = r.top - (pr.top + pad);
      else if (r.bottom > pr.bottom - pad) dy = r.bottom - (pr.bottom - pad);
      if (dy) p.scrollBy({ top: dy, behavior: 'instant' });
    }
  }
  function hold(el, trigger) {
    if (!('IntersectionObserver' in window)) return;
    el.style.setProperty('--s0', Math.round(scrollY) + 'px'); el.classList.add('is-held');
    var target = trigger, main = $('#page main');
    if (trigger.closest('.tb, .side, .insp, dialog') && main) {
      var pin = document.createElement('i'); pin.className = 'pop-pin'; pin.setAttribute('aria-hidden', 'true');
      pin.style.top = Math.round(innerHeight / 2 - main.getBoundingClientRect().top) + 'px'; main.appendChild(pin); held.pin = target = pin;
    }
    var r = target.getBoundingClientRect(), slack = 24, base = null, steps = [];
    for (var i = 0; i <= 20; i++) steps.push(i / 20);
    /* the first answer is where the trigger sat when the popover opened (whole, or as much of it as its pane shows); it
       closes once the trigger has lost a tenth of that, so a trigger clipped by its pane at the start never closes it */
    held.io = new IntersectionObserver(function (es) {
      var ratio = es[es.length - 1].intersectionRatio;
      if (base == null) { base = ratio; return; }
      if (ratio < Math.min(0.9, base - 0.1) && DESK.pop.isOpen() && popTrig === trigger) { el.classList.add('is-cut'); DESK.pop.close(); }
    }, { rootMargin: Math.round(slack - r.top) + 'px 0px ' + Math.round(r.bottom + slack - innerHeight) + 'px 0px', threshold: steps });
    held.io.observe(target);
  }
  DESK.pop = {
    open: function (trigger, html, o) {
      o = o || {};
      if (!popEl) {
        popEl = document.createElement('div'); popEl.className = 'pop'; popEl.setAttribute('popover', 'auto');
        popEl.setAttribute('data-layer', 'popover'); popEl.setAttribute('data-crop', 'popover'); popEl.setAttribute('role', 'dialog');
        document.body.appendChild(popEl);
        /* a close is noted the moment it happens (beforetoggle), not when its toggle event lands: a light dismiss closes the
           popover as the pointer comes up, before the click on its own trigger runs, so that click reads as "close" (and
           justClosed says so), never as "open it again". A close by code (close(), the next popover) is no dismissal. */
        popEl.addEventListener('beforetoggle', function (e) {
          if (e.newState !== 'closed') return;
          var byCode = popByCode; popByCode = false;
          if (popTrig) { popTrig.classList.remove('is-open'); popTrig.setAttribute('aria-expanded', 'false'); }
          popClosed = byCode ? { at: 0, el: null } : { at: Date.now(), el: popTrig };
          unhold();
        });
        popEl.addEventListener('toggle', function (e) { if (e.newState !== 'closed') return; popTrig = null; emit('pop:closed'); });
        /* one element serves every opening, so what a page hangs on it belongs to that opening only: listeners added after
           this point are noted and dropped at the next open (with the on* handlers), so an Enter handler from a rename
           popover never fires in a later one. o.onClick and o.onKey are the same thing as options. */
        popEl.addEventListener = function (type, fn, opt) { popOwn.push([type, fn, opt]); return EventTarget.prototype.addEventListener.call(this, type, fn, opt); };
      }
      if (popEl.matches(':popover-open')) { popByCode = true; popEl.hidePopover(); }
      popOwn.splice(0).forEach(function (l) { EventTarget.prototype.removeEventListener.call(popEl, l[0], l[1], l[2]); });
      popEl.onclick = popEl.onkeydown = popEl.oninput = popEl.onchange = popEl.onsubmit = null;
      if (typeof o.onClick === 'function') popEl.onclick = o.onClick;
      if (typeof o.onKey === 'function') popEl.onkeydown = o.onKey;
      popEl.classList.remove('is-held', 'is-cut');
      /* one element serves every popover and menu: each open names its own layer, so a popover after a menu is a popover */
      popEl.setAttribute('data-layer', o.layer === 'menu' ? 'menu' : 'popover');
      popEl.innerHTML = html; popEl.setAttribute('aria-label', o.label || 'Details');
      if (o.anchor && o.anchor !== trigger) revealIn(o.anchor);
      if (!trigger.closest('.tb, .side, .insp, dialog')) revealIn(trigger);
      popEl.showPopover();
      placePop(popEl, trigger, o);
      popTrig = trigger; trigger.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true');
      if (o.hold) hold(popEl, trigger);
      if (o.focus) { var f = popEl.querySelector(o.focus); if (f) setTimeout(function () { f.focus({ preventScroll: true }); if (f.select) f.select(); }, 30); }
      return popEl;
    },
    close: function () { if (popEl && popEl.matches(':popover-open')) { popByCode = true; popEl.hidePopover(); } },
    isOpen: function () { return !!popEl && popEl.matches(':popover-open'); },
    el: function () { return popEl; },
    /* a listener that serves every opening (fix.js's sheet wiring): kept across opens, unlike one added to el() */
    on: function (type, fn, opt) { if (!popEl) return false; EventTarget.prototype.addEventListener.call(popEl, type, fn, opt); return true; },
    trigger: function () { return popTrig; },
    justClosed: function (t) { return !!t && popClosed.el === t && Date.now() - popClosed.at < 350; }
  };

  /* ---------------- menus: a list of moves in the popover, grown from its trigger ----------------
     DESK.menu.open(trigger, items, { title, label, run, anchor, place, hold }); items = [{ id, label, sub, red, disabled,
     checked, title } or { sep: true }]. Items are words (13 Nov: it.icon and it.lift are ignored); a check marks the
     chosen one; a disabled item's sub-line says why. The chosen item (or the first that can be picked) takes the focus;
     ↑ ↓ Home End move between items; Enter or Space picks (the item is a button); Esc closes it and the focus goes back to
     the trigger. run(id, item) is called once the menu has closed. A destructive move is red words, never a filled red; a
     menu never wears the crimson. */
  var menu = { run: null, items: [] };
  function menuHtml(title, items) {
    return '<div class="mn" role="menu" data-desk-menu' + (title ? ' aria-label="' + esc(title) + '"' : '') + '>' + (title ? '<p class="mn-h" aria-hidden="true">' + esc(title) + '</p>' : '') + items.map(function (it, i) {
      if (it.sep) return '<div class="mn-sep" role="separator"></div>';
      var radio = it.checked != null;
      return '<button class="mi' + (it.red ? ' is-red' : '') + '" type="button" role="' + (radio ? 'menuitemradio' : 'menuitem') + '"' + (radio ? ' aria-checked="' + !!it.checked + '"' : '') +
        ' data-mi="' + i + '"' + (it.id != null ? ' data-mi-id="' + esc(it.id) + '"' : '') + (it.demo ? ' data-demo' : '') + (it.disabled ? ' disabled' : '') + (it.title ? ' title="' + esc(it.title) + '"' : '') + '>' +
        '<span class="mi-t">' + esc(it.label) + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span>' + (radio ? DESK.ic('check', 2.4).replace('<svg', '<svg class="ck"') : '') + '</button>';
    }).join('') + '</div>';
  }
  DESK.menu = {
    open: function (trigger, items, o) {
      o = o || {};
      menu = { run: o.run || null, items: items || [] };
      trigger.setAttribute('aria-haspopup', 'menu');
      /* a menu fits its words (ui.css, 200 to 280 px) and hangs from its own button, never from the row around it
         (function-polish PX7): one edge on the button's, the trailing one unless the button sits in the window's left half */
      var place = o.place === 'below-start' || o.place === 'below-end' ? o.place : null;
      if (!place) { var tr = trigger.getBoundingClientRect(); place = tr.left + tr.width / 2 < document.documentElement.clientWidth / 2 ? 'below-start' : 'below-end'; }
      var el = DESK.pop.open(trigger, menuHtml(o.title || '', menu.items), { label: o.label || o.title || 'Moves', layer: 'menu', place: place, hold: o.hold });
      var first = el.querySelector('.mi[aria-checked="true"]:not(:disabled)') || el.querySelector('.mi:not(:disabled)');
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 30);
      return el;
    },
    close: function () { DESK.pop.close(); },
    isOpen: function () { return DESK.pop.isOpen() && popEl.getAttribute('data-layer') === 'menu'; }
  };
  function pickMenu(b) {
    if (b.disabled) return;
    var it = menu.items[+b.getAttribute('data-mi')], run = menu.run;
    DESK.pop.close();
    if (run && it) run(it.id, it);
  }

  /* ---------------- sheets: a modal <dialog> on the raised solid, attached under the toolbar ----------------
     DESK.sheet.open({ label, html, cls, onClose }) returns the dialog; a click on the backdrop or on [data-close] closes it,
     and so does Esc (the dialog's own). One sheet at a time; the finder is its own. */
  var sheetEl = null, sheetDone = null;
  /* a sheet opened by the mouse takes the focus on its title, not on its crimson (function-polish FD16, P50): a ring
     around the main button the moment a sheet opens read as a glow, and Enter would send at once. Opened from the keys,
     the dialog's own first control keeps it; a sheet that names a field with autofocus keeps that. The ring itself is
     unchanged (ui.css :focus-visible, the place's colour). Every page's own <dialog> goes through this too. */
  var lastInput = 'pointer';
  addEventListener('pointerdown', function () { lastInput = 'pointer'; }, true);
  addEventListener('keydown', function (e) { if (!e.metaKey || e.key !== 'Meta') lastInput = 'key'; }, true);
  (function () {
    var P = window.HTMLDialogElement && HTMLDialogElement.prototype; if (!P || !P.showModal || P.showModal._desk) return;
    var orig = P.showModal;
    var wrapped = function () {
      var d = this, title = null, made = false;
      var first = d.querySelector('input:not([type=hidden]), textarea, select, button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])');
      var field = !!first && /^(INPUT|TEXTAREA|SELECT)$/.test(first.tagName) && !/^(checkbox|radio|button|submit)$/.test(first.type || '');
      if (lastInput === 'pointer' && !field && !d.open && !d.querySelector('[autofocus]') && !d.classList.contains('is-instant')) {
        title = d.querySelector('h1, h2, h3, [data-sheet-title], legend');
        if (title) { if (!title.hasAttribute('tabindex')) { title.setAttribute('tabindex', '-1'); made = true; } title.setAttribute('autofocus', ''); }
        else if (!d.hasAttribute('autofocus')) { d.setAttribute('autofocus', ''); made = 'dialog'; }
      }
      var r = orig.apply(d, arguments);
      if (title) { title.removeAttribute('autofocus'); if (made) title.addEventListener('blur', function () { title.removeAttribute('tabindex'); }, { once: true }); }
      else if (made === 'dialog') d.removeAttribute('autofocus');
      return r;
    };
    wrapped._desk = true; P.showModal = wrapped;
  })();
  DESK.sheet = {
    open: function (o) {
      o = o || {};
      if (!sheetEl) {
        sheetEl = document.createElement('dialog'); sheetEl.setAttribute('data-layer', 'sheet'); sheetEl.setAttribute('role', 'dialog');
        document.body.appendChild(sheetEl);
        sheetEl.addEventListener('click', function (e) { if (e.target === sheetEl || e.target.closest('[data-close]')) sheetEl.close(); });
        sheetEl.addEventListener('close', function () { var f = sheetDone; sheetDone = null; if (f) f(); });
      }
      sheetEl.className = 'sheet' + (o.cls ? ' ' + o.cls : '');
      sheetEl.setAttribute('aria-label', o.label || 'Sheet');
      sheetEl.innerHTML = o.html || '';
      sheetDone = o.onClose || null;
      if (!sheetEl.open) sheetEl.showModal();
      return sheetEl;
    },
    close: function () { if (sheetEl && sheetEl.open) sheetEl.close(); },
    isOpen: function () { return !!sheetEl && sheetEl.open; },
    el: function () { return sheetEl; }
  };

  /* ---------------- the inspector: a solid pane flush right, non-modal, no scrim; the page under it is data-under ----------------
     DESK.insp.open({ label, head, body, foot, keepScroll, subject, reveal, land, live, pinned }).
     subject: what it shows (a lifter's id). A re-render of the same subject with keepScroll keeps the body's place and the
     room a landing made under its last box; a new subject starts at the top. live: the page lays itself out beside the
     pane, so nothing is under it and its region stays live (no data-under: its crimson stays the crimson).
     pinned: a pane that is part of the page (Messages' facts): Esc leaves it open and goes on to the page. */
  var inspEl = null, inspT = null, inspPinned = false, room = { subject: null, px: 0 };
  function roomEl(b, make) {
    var el = b.querySelector(':scope > .insp-room');
    if (!el && make) { el = document.createElement('div'); el.className = 'insp-room'; el.setAttribute('aria-hidden', 'true'); b.appendChild(el); }
    return el;
  }
  /* the body lands on a section's start (an .ig: its heading where the first section rests, just under the head's fade)
     from which the box shows whole: the nearest one the body can reach; else it takes just enough room under its last box,
     kept for this subject while it stays open, so a re-render after a move keeps the same view. A box that no section
     start shows whole is left to the least scroll. */
  function landOn(b, box) {
    var fadeTop = px('--sp-4', 16), foot = px('--sp-8', 40) + px('--sp-2', 8);
    var br = b.getBoundingClientRect(), r = box.getBoundingClientRect(), at = b.scrollTop;
    var top = r.top - br.top + at, bottom = r.bottom - br.top + at, h = b.clientHeight, max = Math.max(0, b.scrollHeight - h);
    if (top >= at + fadeTop && bottom <= at + h - foot) return true;
    var lo = bottom - (h - foot), hi = top - fadeTop;
    var stops = $$('.ig', b).map(function (g) { return Math.round(g.getBoundingClientRect().top - br.top + at - fadeTop); }).filter(function (v) { return v >= 0 && v >= lo && v <= hi; });
    if (!stops.length) return false;
    var to = stops.filter(function (v) { return v <= max; }).sort(function (p, q) { return Math.abs(p - at) - Math.abs(q - at); })[0];
    if (to == null) { to = Math.min.apply(null, stops); room.px += Math.ceil(to - max); roomEl(b, true).style.height = room.px + 'px'; }
    b.scrollTop = to;
    return true;
  }
  DESK.insp = {
    open: function (o) {
      o = o || {};
      if (!inspEl) {
        inspEl = document.createElement('aside'); inspEl.className = 'insp'; inspEl.hidden = true;
        inspEl.setAttribute('data-layer', 'inspector'); inspEl.setAttribute('data-crop', 'inspector');
        inspEl.innerHTML = '<div class="insp-h"></div><div class="insp-b"></div><div class="insp-f"></div>';
        document.body.appendChild(inspEl);
      }
      clearTimeout(inspT); inspEl.classList.remove('is-leaving');
      inspEl.setAttribute('aria-label', o.label || 'Details');
      var b = inspEl.querySelector('.insp-b'), keep = o.keepScroll ? b.scrollTop : 0, subject = o.subject != null ? String(o.subject) : null;
      if (!o.keepScroll || subject == null || room.subject !== subject) room = { subject: subject, px: 0 };
      inspEl.querySelector('.insp-h').innerHTML = o.head || '';
      b.innerHTML = o.body || '';
      if (room.px) roomEl(b, true).style.height = room.px + 'px';
      inspEl.querySelector('.insp-f').innerHTML = o.foot || '';
      inspEl.querySelector('.insp-f').hidden = !o.foot;
      b.scrollTop = keep;
      var was = !inspEl.hidden, page = document.getElementById('page');
      inspEl.hidden = false;
      inspPinned = !!o.pinned;
      if (o.live) page.removeAttribute('data-under'); else page.setAttribute('data-under', '');
      document.body.classList.add('has-insp');
      syncMid();
      if (o.reveal) DESK.insp.reveal(o.reveal, { land: o.land });
      if (!was) emit('insp:open');
      return inspEl;
    },
    /* scroll only the inspector's body so a part of it shows whole, its top just under the head's fade (or its foot just
       above the walk controls' fade); never element.scrollIntoView, which would move the whole pane and cut off its head.
       target: an element in the body, or a selector. { land: 'section' } lands on a section's start instead (landOn). */
    reveal: function (target, opt) {
      if (!inspEl || inspEl.hidden) return;
      var b = inspEl.querySelector('.insp-b'), el = typeof target === 'string' ? b.querySelector(target) : target;
      if (!el || !b.contains(el)) return;
      if (opt && opt.land === 'section' && landOn(b, el)) return;
      var br = b.getBoundingClientRect(), r = el.getBoundingClientRect(), at = b.scrollTop, fadeTop = px('--sp-4', 16), fadeFoot = px('--sp-8', 40);
      var top = r.top - br.top + at, bottom = r.bottom - br.top + at, lo = at + fadeTop, hi = at + b.clientHeight - fadeFoot, to = at;
      if (top < lo || bottom - top > hi - lo) to = top - fadeTop;
      else if (bottom > hi) to = bottom - b.clientHeight + fadeFoot;
      b.scrollTop = Math.max(0, Math.min(b.scrollHeight - b.clientHeight, to));
    },
    close: function () {
      if (!inspEl || inspEl.hidden) return;
      inspEl.classList.add('is-leaving');
      document.getElementById('page').removeAttribute('data-under');
      document.body.classList.remove('has-insp');
      inspPinned = false; room = { subject: null, px: 0 };
      syncMid();
      inspT = setTimeout(function () { inspEl.hidden = true; inspEl.classList.remove('is-leaving'); }, 180);
      emit('insp:close');
    },
    isOpen: function () { return !!inspEl && !inspEl.hidden && !inspEl.classList.contains('is-leaving'); },
    el: function () { return inspEl; }
  };
  /* the toolbar's middle group beside an open inspector: the trailing group moves left of the pane, and the middle group
     stays in view in the room left between the leading group and it, sliding over (--mid-shift) when its centre place is
     taken; it steps aside (ui.css .has-insp.tb-crowded) only when that room is too narrow for it. Measured from layout
     boxes (never the moving ones), on open and close, on resize and when the toolbar's content changes. */
  var midShift = 0;
  function contentBox(el) { var rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect(); }
  function syncMid() {
    var mid = $('.tb-mid'), lead = $('.tb-lead'), trail = $('.tb-trail'), tb = $('.tb'), crowded = false, shift = 0;
    if (mid && lead && trail && tb && inspEl && !inspEl.hidden && document.body.classList.contains('has-insp')) {
      var w = contentBox(mid).width;
      if (w > 0) {
        var gap = px('--sp-3', 12), lr = contentBox(lead), from = (lr.width ? lr.right : lead.getBoundingClientRect().left) + gap;
        var to = document.documentElement.clientWidth - inspEl.offsetWidth - gap - trail.offsetWidth - gap;   /* the inspector is flush now */
        var at = tb.getBoundingClientRect().left + mid.offsetLeft + (mid.offsetWidth - w) / 2;   // its content where it sits unmoved
        if (w > to - from) crowded = true;
        else shift = Math.round(Math.max(from, Math.min(to - w, at)) - at);
      }
    }
    if (shift !== midShift) { midShift = shift; if (mid) mid.style.setProperty('--mid-shift', shift + 'px'); }
    if (document.body.classList.contains('tb-crowded') !== crowded) document.body.classList.toggle('tb-crowded', crowded);
  }
  addEventListener('resize', syncMid);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncMid);

  /* ---------------- the URL: the selection lives in the hash; every page's ?x moves there on load (shared.md §7) ---------------- */
  DESK.url = {
    get: function () { var o = {}; new URLSearchParams(location.hash.replace(/^#/, '')).forEach(function (v, k) { o[k] = v; }); return o; },
    set: function (o, push) {
      var q = new URLSearchParams(); Object.keys(o || {}).forEach(function (k) { if (o[k] != null && o[k] !== '' && o[k] !== false) q.set(k, o[k]); });
      var h = q.toString(), url = location.pathname + location.search + (h ? '#' + h : '');
      if (url !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState'](null, '', url);
      noteLastLifter();
    }
  };
  addEventListener('hashchange', function () { noteLastLifter(); });
  addEventListener('pagehide', function () { noteLastLifter(); });
  var HASHED = /^(id|f|q|sort|from|week|stage|new|next|tpl|tab|view|lifter|row|start|day|prefill|runin|team|ids|s|review|sheet|book|invite|add)$/;
  /* fresh and auto are query-only (first-time-coach §2.1): data.js has stored fresh (sessionStorage powa-r6-desk) before
     this runs, so it leaves the address and links and reloads stay clean; auto stays in the query, and auto=0 is kept for
     the session (powa-r6-auto) so the demo's join timer stays off on every page after it */
  var AUTO_KEY = 'powa-r6-auto';
  (function () { var a = new URLSearchParams(location.search).get('auto'); if (a === '0' || a === '1') store.set('sessionStorage', AUTO_KEY, a); })();
  (function moveQuery() {
    var s = new URLSearchParams(location.search), moved = {}, keep = new URLSearchParams(), any = false;
    s.forEach(function (v, k) { if (HASHED.test(k)) { moved[k] = v; any = true; } else if (k === 'reset' || k === 'fresh') any = true; else keep.set(k, v); });
    if (!any) return;
    var h = new URLSearchParams(location.hash.replace(/^#/, '')); Object.keys(moved).forEach(function (k) { if (!h.has(k)) h.set(k, moved[k]); });
    var qs = keep.toString(), hs = h.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + (hs ? '#' + hs : ''));
  })();

  /* ---------------- where the coach came from: DESK.openLifter, DESK.back, scroll memory ----------------
     DESK.openLifter(id, { from, back: { label, href }, tab }) is the one way to open a lifter. A page that keeps the lifter
     beside its list (Lifters) selects in place through DESK._openLifter; anywhere else it goes to lifters.html#id=<id>,
     and with a from or a back it stores the target in sessionStorage powa-r6-back, adds &from=<from>, and keeps this
     page's scroll (pl:v1:scroll:<url>). DESK.back() answers the stored target when the page's hash names the same from,
     else null; DESK.goBack() (and any [data-desk-back]) returns there with its scroll. */
  var BACK_KEY = 'powa-r6-back', RESTORE_KEY = 'powa-r6-back-to';
  function urlKey(href) { try { var u = new URL(href, location.href); return u.pathname.split('/').pop() + u.hash; } catch (e) { return String(href); } }
  function saveScroll(key) {
    var panes = $$('[data-crop]').filter(function (el) { return el.scrollTop > 0 && !el.closest('[data-layer]'); }).map(function (el) { return { crop: el.getAttribute('data-crop'), top: el.scrollTop }; });
    store.set('sessionStorage', 'pl:v1:scroll:' + key, JSON.stringify({ y: Math.round(scrollY), panes: panes }));
  }
  function restoreScroll() {
    var key = urlKey(location.href); if (store.get('sessionStorage', RESTORE_KEY) !== key) return;
    store.set('sessionStorage', RESTORE_KEY, null);
    var s = json(store.get('sessionStorage', 'pl:v1:scroll:' + key)); if (!s) return;
    var put = function () { if (s.y) scrollTo(0, s.y); (s.panes || []).forEach(function (p) { var el = $('[data-crop="' + p.crop + '"]'); if (el) el.scrollTop = p.top; }); };
    /* after the page's own first render (it runs after mount) and again once it has laid out */
    setTimeout(function () { requestAnimationFrame(put); }, 0);
    addEventListener('load', function () { requestAnimationFrame(put); }, { once: true });
  }
  /* the from and back target for a move away from this page: answers { from, back } (back defaults to this page, under
     its h1), or nulls when neither was asked for */
  function backOf(o) {
    var here = HERE || ALIAS[document.body.getAttribute('data-place')] || document.body.getAttribute('data-place') || '';
    var from = o.from || (o.back ? here : null), back = o.back || null;
    if (from && !back) {
      var h1 = $('#page h1'), self = location.search.replace(/([?&])reset=1&?/, '$1').replace(/[?&]$/, '');
      back = { label: (h1 && h1.textContent.trim()) || LABEL[here] || 'Back', href: FILE + self + location.hash };
    }
    return { from: from, back: back };
  }
  function remember(t) { if (t.from && t.back) { store.set('sessionStorage', BACK_KEY, JSON.stringify({ from: t.from, back: t.back })); saveScroll(urlKey(t.back.href)); } }
  /* DESK.go's half: stores the target, keeps the scroll and adds &from= to the hash (unless the hash names one) */
  DESK._remember = function (hash, o) {
    var t = backOf(o || {}); if (!t.from) return hash;
    remember(t);
    return /(^|&)from=/.test(hash) ? hash : hash + (hash ? '&' : '') + 'from=' + encodeURIComponent(t.from);
  };
  DESK.openLifter = function (id, o) {
    o = o || {};
    if (DESK._openLifter) { DESK._openLifter(id, o); return; }
    var t = backOf(o);
    var h = new URLSearchParams(); h.set('id', id); if (o.tab) h.set('tab', o.tab); if (t.from) h.set('from', t.from);
    remember(t);
    location.href = DESK.routes.lifters + '#' + h.toString();
  };
  DESK.back = function () {
    var from = DESK.url.get().from; if (!from) return null;
    var s = json(store.get('sessionStorage', BACK_KEY));
    return s && s.from === from && s.back && s.back.href ? s.back : null;
  };
  DESK.goBack = function () {
    var b = DESK.back(); if (!b) return false;
    store.set('sessionStorage', RESTORE_KEY, urlKey(b.href));
    location.href = b.href;
    return true;
  };
  /* the quiet "‹ Meet team" a toolbar leads with (a page puts it in DESK.mount's lead); '' with no stored target */
  DESK.backHtml = function () {
    var b = DESK.back(); if (!b) return '';
    return '<button class="btn quiet" type="button" data-desk-back title="Back to ' + esc(b.label) + '">‹ ' + esc(b.label) + '</button>';
  };

  /* ---------------- lists stay: DESK.list.shown(page) / DESK.list.set(page, on) ----------------
     Default shown; the coach's choice is stored per page (localStorage powa-r6-list-<page>) and sticks across reloads. No
     page hides its list by itself; the Lifters toolbar has the one hide button. */
  DESK.list = {
    shown: function (page) { return store.get('localStorage', 'powa-r6-list-' + (page || HERE)) !== '0'; },
    set: function (page, on) { page = page || HERE; on = !!on; store.set('localStorage', 'powa-r6-list-' + page, on ? '1' : '0'); emit('list', { page: page, on: on }); return on; }
  };

  /* ---------------- ⌥↓ ⌥↑ and J K: the next and previous item of the page's list ----------------
     The page's list: the one holding the focus, else the list column's ([data-crop=list]), else the first one shown in
     #page. A page can take the move itself: DESK.listStepper = function (dir) { … return true; }. Otherwise desk.js
     clicks the next row when its list asks for that ([data-list][data-step="click"]: the row opens what it shows), else
     moves the list's own selection mark (aria-selected, aria-current or .is-sel, whichever the list uses) to it and fires
     'desk:list-step' on the row ({ detail: { id, dir } }, bubbling). The row is kept in view with the least scroll and
     takes the focus when the focus was in the list. Instant: keyboard moves never animate. */
  var SEL = '[aria-selected="true"], [aria-current]:not([aria-current="false"]), .is-sel';
  var visible = function (el) { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  function pageList() {
    var a = document.activeElement, own = a && a.closest ? a.closest('[data-list]') : null;
    if (own && visible(own) && !own.closest('[data-layer]')) return own;
    var col = $$('#page [data-crop="list"] [data-list], #page [data-list][data-crop="list"]').filter(visible)[0];
    return col || $$('#page [data-list]').filter(function (l) { return visible(l) && !l.closest('[data-layer]'); })[0] || null;
  }
  DESK.listStep = function (dir) {
    var list = pageList(); if (!list) return false;
    var rows = $$('[data-row]', list).filter(function (r) { return visible(r) && r.closest('[data-list]') === list; }); if (!rows.length) return false;
    var cur = rows.filter(function (r) { return r.matches(SEL); })[0] || rows.filter(function (r) { return r.contains(document.activeElement); })[0] || null;
    var i = cur ? rows.indexOf(cur) : -1, nx = cur ? rows[i + dir] : rows[dir > 0 ? 0 : rows.length - 1];
    if (!nx) return true;   /* at the end of the list: stay */
    var had = cur && list.contains(document.activeElement), id = nx.getAttribute('data-row');
    if (list.getAttribute('data-step') === 'click') nx.click();
    else {
      var mark = cur ? (cur.getAttribute('aria-selected') === 'true' ? 'sel' : cur.hasAttribute('aria-current') ? 'cur' : 'cls') : 'sel';
      if (cur) { if (mark === 'sel') cur.setAttribute('aria-selected', 'false'); else if (mark === 'cur') cur.removeAttribute('aria-current'); else cur.classList.remove('is-sel'); }
      if (mark === 'sel') nx.setAttribute('aria-selected', 'true'); else if (mark === 'cur') nx.setAttribute('aria-current', cur.getAttribute('aria-current') || 'true'); else nx.classList.add('is-sel');
      nx.dispatchEvent(new CustomEvent('desk:list-step', { bubbles: true, detail: { id: id, dir: dir } }));
    }
    var now = list.isConnected ? list.querySelector('[data-row="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]') || nx : nx;
    if (now.isConnected) {
      now.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
      if (had || !cur) { if (!now.matches('a[href], button, [tabindex]')) now.setAttribute('tabindex', '-1'); if (had) now.focus({ preventScroll: true }); }
    }
    return true;
  };

  /* ---------------- ⌘K: find a lifter, a program, a team, a meet or a move, and answer roster questions ----------------
     Every word typed must start a word of the result (its name, first name, open reason, program, team or meet; a lift
     word finds the lifters whose reason names it). A question word puts an Answer group first, its count from PL.counts()
     or the list's meta, never a number of its own. Groups: Answer (8), Lifters (8), Programs (4), Teams (4), Meets (4),
     Do (5: the page's moves, DESK.actions, then the desk's own). */
  var actions = [];
  DESK.actions = function (list) { actions = list || []; };
  var finder = null, fSel = 0, fRows = [];
  var STOP = { who: 1, whos: 1, is: 1, are: 1, in: 1, me: 1, my: 1, the: 1, a: 1, an: 1, what: 1, which: 1, i: 1, to: 1, for: 1, of: 1, do: 1, does: 1, has: 1, have: 1, any: 1, anyone: 1, show: 1, with: 1, on: 1,
    how: 1, can: 1, could: 1, should: 1, where: 1, when: 1, why: 1 };
  var words = function (s) { return String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9.]+/).filter(Boolean); };
  /* every token starts one of the haystack's words */
  function matches(tokens, hay) { var w = words(hay); return tokens.every(function (t) { return w.some(function (x) { return x.indexOf(t) === 0; }); }); }
  var lifterList = function (f) { var r = PL.lifters.list(f ? { f: f } : {}); return r && r.data ? r : { data: [], meta: { total: 0 } }; };
  var reasonOf = function (x) { return x.reason && x.reason.text ? x.reason.text : x.program ? x.program.name + ', week ' + x.program.week + ' of ' + x.program.of : 'No program yet'; };
  var openL = function (x) { return function () { DESK.openLifter(x.id); }; };
  var listRows = function (f) { return lifterList(f).data.map(function (x) { return { id: x.id, title: x.name, sub: reasonOf(x), run: openL(x) }; }); };
  var countOf = function (k) { var c = counts(); return c[k]; };
  /* the questions a coach asks (screens.md §3.2) */
  var ASK = [
    { w: ['pain', 'hurt', 'hurts', 'sore', 'injury', 'injured'], head: 'Pain or low recovery', rows: function () { return listRows('health'); }, n: function () { return countOf('painOrLow'); }, more: function (n) { return { title: 'Show all ' + n + ' in Lifters', run: function () { DESK.go('lifters', 'f=health'); } }; } },
    { w: ['owe', 'owes', 'owed', 'late', 'pay', 'paid', 'money'], head: 'Late payments', rows: function () {
      var s = fn(PL.billing, 'summary') ? PL.billing.summary().data : null, ids = s && s.late ? s.late : [], todo = fn(PL.billing, 'todo') ? PL.billing.todo().data : [];
      return ids.map(function (id) { var l = K.L(id) || { name: id }, r = todo.filter(function (t) { return t.lifterId === id && t.kind === 'late'; })[0]; return { id: id, title: l.name, sub: r ? r.text : 'Late', run: function () { DESK.go('clients', 'id=' + encodeURIComponent(id)); } }; });
    }, n: function () { var s = fn(PL.billing, 'summary') ? PL.billing.summary().data : null; return s && s.late ? s.late.length : 0; }, more: function () { return { title: 'Open Clients', run: function () { DESK.go('clients'); } }; } },
    { w: ['quiet', 'missed', 'behind', 'skipped', 'skipping'], head: 'Behind on sessions', rows: function () { return listRows('behind'); }, n: function () { return lifterList('behind').meta.total; }, more: function (n) { return { title: 'Show all ' + n + ' in Lifters', run: function () { DESK.go('lifters', 'f=behind'); } }; } },
    { w: ['due', 'write', 'sunday', 'send'], head: 'To write or send', rows: function () {
      var q = fn(PL.programs, 'queue') ? PL.programs.queue() : null, rows;
      if (q && q.data) rows = q.data.filter(function (r) { return !r.group || r.group === 'todo' || r.group === 'ending'; });
      else rows = PL.programs.list({}).data.filter(function (p) { return p.state === 'to-write' || p.state === 'to-send'; });
      return rows.map(function (r) {
        var lid = r.lifterId || r.id, l = K.L(lid), team = r.team && !l;
        return { id: lid, title: r.title || (l ? l.name : r.name), sub: r.what || r.words || r.status || (r.state === 'to-send' ? 'To send' : r.state === 'to-write' ? 'To write' : r.name || ''),
          run: function () { DESK.go('programs', team ? 'team=' + encodeURIComponent(r.team.id || lid) : 'id=' + encodeURIComponent(lid)); } };
      });
    }, n: function () { var c = counts(); return c.programsDue != null ? c.programsDue : (c.programsToWrite || 0) + (c.programsToSend || 0); }, more: function () { return { title: 'Open Programs', run: function () { DESK.go('programs'); } }; } },
    { w: ['meet', 'meets', 'weigh', 'weighin', 'class', 'compete', 'competing'], head: 'Meet in 8 weeks', rows: function () {
      return lifterList('meet').data.map(function (x) { return { id: x.id, title: x.name, sub: x.meet ? x.meet.name + (x.meet.days === 0 ? ', today' : x.meet.days != null ? ', in ' + x.meet.days + ' days' : '') : reasonOf(x), run: openL(x) }; });
    }, n: function () { return countOf('meetLifters'); }, more: function () { return { title: 'Open Meets', run: function () { DESK.go('meets'); } }; } },
    { w: ['waiting', 'wait', 'reply', 'replies', 'answer', 'message', 'messages'], head: 'Waiting for a reply', rows: function () {
      var t = PL.threads.list(), all = t && t.data ? t.data : [], g = t && t.meta && t.meta.groups && t.meta.groups.waiting, by = {};
      all.forEach(function (x) { by[x.id] = x; });
      var list = Array.isArray(g) ? g.map(function (x) { return typeof x === 'string' ? by[x] : x; }).filter(Boolean) : all.filter(function (x) { return x.waiting; });
      return list.map(function (x) { return { id: x.id, title: x.name, sub: x.asks && x.asks.text ? x.asks.text : x.last && x.last.body ? x.last.body : '', run: function () { DESK.go('messages', 'id=' + encodeURIComponent(x.id)); } }; });
    }, n: function () { return countOf('waitingThreads'); }, more: function () { return { title: 'Open Messages', run: function () { DESK.go('messages'); } }; } },
    { w: ['flat', 'stalled', 'stalling', 'stuck'], head: 'Not getting stronger', rows: function () { return listRows('stalled'); }, n: function () { return lifterList('stalled').meta.total; }, more: function (n) { return { title: 'Show all ' + n + ' in Lifters', run: function () { DESK.go('lifters', 'f=stalled'); } }; } },
    { w: ['harder', 'rpe', 'overshoot', 'overshooting'], head: 'Felt harder than written', rows: function () { return listRows('harder'); }, n: function () { return lifterList('harder').meta.total; }, more: function (n) { return { title: 'Show all ' + n + ' in Lifters', run: function () { DESK.go('lifters', 'f=harder'); } }; } },
    { w: ['need', 'needs', 'today', 'urgent'], head: 'Needs you', rows: function () { return listRows('need'); }, n: function () { return countOf('needYou'); }, more: function () { return { title: 'Open Overview', run: function () { DESK.go('overview'); } }; } }
  ];
  function deskActions() {
    var light = DESK.theme.get() === 'light', out = [
      { title: 'Settings', run: function () { DESK.go('settings'); } },
      { title: 'Keys', sub: '? or ⌘/', run: function () { DESK.keys(); } },
      { title: light ? 'Switch to dark mode' : 'Switch to light mode', run: function () { DESK.theme.set(light ? 'dark' : 'light'); } }
    ];
    var s = fn(PL.billing, 'summary') ? PL.billing.summary().data : null, inv = s && s.invite;
    if (inv && inv.url) out.push({ title: 'Copy the invite link', sub: inv.link, run: function () {
      var said = function (ok) { DESK.toast(ok ? 'Invite link copied: ' + inv.link + '.' : 'Could not copy. The link is ' + inv.link + '.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inv.url).then(function () { said(true); }, function () { said(false); }); else said(false);
    } });
    out.push({ title: 'New team', run: function () { DESK.go('teams', 'new=1'); } });
    out.push({ title: 'Book a meet', run: function () { DESK.go('meets', 'sheet=book'); } });
    out.push({ title: 'Add a lifter', keywords: 'invite new athlete', run: function () { addLifter('find'); } });
    if (fn(PL.billing, 'exportCsv')) out.push({ title: 'Export payments (CSV)', run: function () {
      var csv = PL.billing.exportCsv(); csv = csv && csv.data != null ? csv.data : csv;
      var name = 'payments-' + K.now.toISOString().slice(0, 7) + '.csv', a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([String(csv)], { type: 'text/csv' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      DESK.toast('Downloaded ' + name + '.');
    } });
    return out;
  }
  /* a word's meaning (first-time-coach §9.1): "what is …", "what's …", "meaning of …", or one word that is a term's key,
     label or also; the store decides (PL.terms.find) */
  var WHAT_RX = /^\s*(what\s+is|what['’]?s|whats|what\s+does|meaning\s+of)\b/i;
  function termFor(raw) {
    if (!raw.trim() || !fn(PL.terms, 'find')) return null;
    try { var r = PL.terms.find(raw.trim()); return r && r.data ? r.data : null; } catch (e) { return null; }
  }
  function finderRows(raw) {
    var all = words(raw), ask = null, i, whatQ = WHAT_RX.test(raw);
    /* "what is rpe" shows the meaning, not the roster's answer (FC-35); a bare "rpe" shows both */
    if (!whatQ) for (i = 0; i < ASK.length && !ask; i++) if (all.some(function (w) { return ASK[i].w.indexOf(w) >= 0; })) ask = ASK[i];
    var t = all.filter(function (w) { return !STOP[w]; }), q = all.length > 0, out = [];
    var group = function (g, list, max) { list.slice(0, max).forEach(function (r) { r.group = g; out.push(r); }); };
    /* How to (first-time-coach §9.1): first when the query asks how ("how", "can", "where", "help"), or when its words
       are an entry's own words and it is not a roster question; after the Answer for a roster question ("who is in
       pain"); after Lifters while a word is only half typed ("pri" is Priya before it is a price). Nothing typed on the
       fresh desk opens on its first five rows. */
    var hw = howRows(raw, all, t), how = hw.rows, howTitles = {};
    how.forEach(function (r) { howTitles[r.title.toLowerCase()] = 1; });
    var howAt = !how.length ? null : (HOW_RX.test(raw) || !all.length || (hw.exact && !ask)) ? 'first' : hw.exact ? 'answer' : 'lifters';
    if (howAt === 'first') group('How to', how, 5);
    if (ask) {
      var n = ask.n(), rows = ask.rows(), head = { label: ask.head, n: n };
      group('Answer', rows.slice(0, 8).map(function (r) { r.head = head; r.kind = 'answer'; return r; }), 8);
      var more = ask.more(n != null ? n : rows.length); more.head = head; more.more = true; group('Answer', [more], 1);
    }
    if (howAt === 'answer') group('How to', how, 5);
    /* a question with nothing else in it shows its answer alone */
    if (q && !t.length) return out;
    var L = lifterList().data, teamOf = {};
    if (fn(PL.teams, 'list')) PL.teams.list().data.forEach(function (tm) { var g = fn(PL.teams, 'get') ? PL.teams.get(tm.id) : null; ((g && g.data && g.data.members) || []).forEach(function (m) { var id = m.id || m.lifterId; if (id) teamOf[id] = (teamOf[id] || '') + ' ' + tm.name; }); });
    group('Lifters', L.filter(function (x) { return !q || matches(t, [x.name, x.reason && x.reason.text, x.program && x.program.name, x.meet && x.meet.name, teamOf[x.id]].join(' ')); })
      .map(function (x) { return { id: x.id, title: x.name, sub: reasonOf(x), run: openL(x) }; }), q ? 8 : 5);
    if (howAt === 'lifters') group('How to', how, 5);
    group('Programs', PL.programs.list({}).data.filter(function (p) { return !q || matches(t, p.name + ' ' + p.lifter); })
      .map(function (p) { return { id: p.lifterId, title: p.name, sub: p.lifter + (p.week && p.week.of ? ', week ' + p.week.n + ' of ' + p.week.of : ''), run: function () { DESK.go('programs', 'id=' + encodeURIComponent(p.lifterId)); } }; }), q ? 4 : 2);
    if (fn(PL.teams, 'list')) group('Teams', PL.teams.list().data.filter(function (tm) { return !q || matches(t, tm.name + ' ' + (tm.program || '')); })
      .map(function (tm) { return { id: tm.id, title: tm.name, sub: K.plural(tm.members, 'lifter') + (tm.week && tm.week.of ? ', week ' + tm.week.now + ' of ' + tm.week.of : ''), run: function () { DESK.go('teams', 'id=' + encodeURIComponent(tm.id)); } }; }), q ? 4 : 1);
    group('Meets', PL.meets.list().data.filter(function (m) { return !q || matches(t, m.name); })
      .map(function (m) { return { id: m.id, title: m.name, sub: m.days === 0 ? 'Today' : m.days === 1 ? 'Tomorrow' : m.days < 0 ? K.plural(-m.days, 'day') + ' ago' : 'In ' + m.days + ' days', run: function () { DESK.go('meets', 'id=' + encodeURIComponent(m.id)); } }; }), q ? 4 : 2);
    var seen = {}, acts = actions.concat(deskActions()).filter(function (a) { var k = String(a.title).toLowerCase(); if (seen[k] || howTitles[k]) return false; seen[k] = 1; return true; });
    group('Do', acts.filter(function (a) { return !q || matches(t, a.title + ' ' + (a.keywords || '')); }).map(function (a) { return { title: a.title, sub: a.sub || '', run: a.run }; }), 5);
    return out;
  }
  function paintFinder() {
    var raw = finder.querySelector('input').value, list = finderRows(raw), html = '', last = null;
    fRows = list; fSel = Math.min(fSel, Math.max(0, list.length - 1));
    list.forEach(function (r, i) {
      if (r.group !== last) {
        if (last !== null) html += '</div>';
        var head = r.group === 'Answer' ? esc(r.head.label) + (r.head.n != null ? ' <span class="n">' + r.head.n + '</span>' : '') : r.group, gid = 'fh-' + r.group.replace(/\W+/g, '-');
        html += '<div class="fg" role="group" data-finder-group="' + r.group + '" aria-labelledby="' + gid + '"><h4 id="' + gid + '">' + head + '</h4>';
        last = r.group;
      }
      html += '<div class="fr' + (r.more ? ' is-more' : '') + '" role="option" id="fr' + i + '" data-i="' + i + '"' + (r.id ? ' data-id="' + esc(r.id) + '"' : '') + (r.more ? ' data-more' : '') + (r.demo ? ' data-demo' : '') + ' aria-selected="' + (i === fSel) + '"><span class="fr-t"><b>' + esc(r.title) + '</b>' + (r.sub ? '<small data-ellipsis title="' + esc(r.sub) + '">' + esc(r.sub) + '</small>' : '') + '</span><span class="go">' + (i === fSel ? 'Open' : '') + '</span></div>';
    });
    if (last !== null) html += '</div>';
    /* a word's meaning sits above every group: its label, then its one line */
    var term = termFor(raw);
    if (term) html = '<div class="fterm" data-finder-term><b>' + esc(term.label) + '</b><p>' + esc(term.line) + '</p></div>' + html;
    else if (!list.length) html = '<p class="empty">Nothing for “' + esc(raw.trim()) + '”. Try a name, a program, a meet, or ask: who owes me?</p>';
    var box = finder.querySelector('.finder-r'); box.innerHTML = html;
    finder.querySelector('input').setAttribute('aria-activedescendant', list.length ? 'fr' + fSel : '');
    fitFinder(box); showSel(box);
  }
  /* the selection moves at once (arrow keys and the pointer): only the marks change, the list is not redrawn */
  function selectRow(i) {
    if (i === fSel || !fRows[i]) return;
    var box = finder.querySelector('.finder-r'), a = box.querySelector('#fr' + fSel), b = box.querySelector('#fr' + i);
    if (a) { a.setAttribute('aria-selected', 'false'); a.querySelector('.go').textContent = ''; }
    if (b) { b.setAttribute('aria-selected', 'true'); b.querySelector('.go').textContent = 'Open'; }
    fSel = i; finder.querySelector('input').setAttribute('aria-activedescendant', 'fr' + i);
    showSel(box);
  }
  /* the list ends on a whole row (ui.css .finder-r fades its foot): the box stops just before the next item's words begin
     (inside the next row's top padding, or above a heading), so the last row that fits stays whole and clear of the
     sheet's edge, nothing of the next item shows, and a heading never closes the list without its rows. The finder opens
     at once (is-instant), so the boxes measured are where they show. */
  function posIn(box, el) { return el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop; }
  function fitFinder(box) {
    box.style.height = '';
    var max = box.clientHeight, fade = parseFloat(getComputedStyle(box).paddingBottom) || 0, best = 0;
    if (box.scrollHeight <= max + 1) return;
    var items = $$('h4, .fr', box);
    items.forEach(function (el, k) {
      var next = items[k + 1]; if (!next || !el.classList.contains('fr')) return;
      var words0 = posIn(box, next) + (next.tagName === 'H4' ? -(parseFloat(getComputedStyle(next).marginTop) || 0) / 2 : parseFloat(getComputedStyle(next).paddingTop) || 0) - 2;
      var cut = Math.min(words0, posIn(box, el) + el.offsetHeight + fade);
      if (cut <= max && cut > best) best = cut;
    });
    if (best) box.style.height = Math.floor(best) + 'px';
  }
  /* the row in hand stays in view and clear of the fade; a group's first row brings its heading along */
  function showSel(box) {
    var sel = box.querySelector('.fr[aria-selected="true"]'); if (!sel) return;
    var cs = getComputedStyle(box), fade = parseFloat(cs.paddingBottom) || 0, pad = parseFloat(cs.paddingTop) || 0, g = sel.closest('.fg'), head = g && g.querySelector('.fr') === sel ? g.querySelector('h4') : null;
    var top = (head ? posIn(box, head) - (parseFloat(getComputedStyle(head).marginTop) || 0) : posIn(box, sel)) - pad, bottom = posIn(box, sel) + sel.offsetHeight;
    if (bottom > box.scrollTop + box.clientHeight - fade) box.scrollTop = bottom - box.clientHeight + fade;
    else if (top < box.scrollTop) box.scrollTop = Math.max(0, top);
  }
  function runRow(r) { if (!r) return; finder.close(); r.run(); }
  DESK.find = function () {
    if (!finder) {
      finder = document.createElement('dialog'); finder.className = 'sheet is-instant'; finder.setAttribute('data-layer', 'sheet'); finder.setAttribute('role', 'dialog'); finder.setAttribute('aria-label', 'Find');
      finder.innerHTML = '<div class="finder-q">' + DESK.ic('find', 2) + '<input type="text" role="combobox" aria-expanded="true" aria-controls="finder-r" aria-autocomplete="list" aria-label="Find a name, or ask a question" placeholder="Find a name, or ask: who is in pain?" autocomplete="off" spellcheck="false"></div><div class="finder-r" id="finder-r" role="listbox" aria-label="Results"></div>';
      document.body.appendChild(finder);
      var inp = finder.querySelector('input');
      inp.addEventListener('input', function () { fSel = 0; paintFinder(); });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); selectRow(Math.min(fRows.length - 1, fSel + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selectRow(Math.max(0, fSel - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); runRow(fRows[fSel]); }
      });
      finder.addEventListener('pointermove', function (e) { var r = e.target.closest && e.target.closest('.fr'); if (r) selectRow(+r.getAttribute('data-i')); });
      finder.addEventListener('click', function (e) { var r = e.target.closest('.fr'); if (r) { runRow(fRows[+r.getAttribute('data-i')]); return; } if (e.target === finder) finder.close(); });
      addEventListener('resize', function () { if (finder.open) { var box = finder.querySelector('.finder-r'); fitFinder(box); showSel(box); } });
    }
    if (finder.open) { finder.close(); return; }   /* ⌘K again closes it */
    finder.querySelector('input').value = ''; fSel = 0;
    finder.showModal(); paintFinder();   /* painted open, so the list can be measured and fitted */
  };

  /* ---------------- How to: Find answers "how do I …" (first-time-coach §9.2, function-polish F8.3) ----------------
     DESK.howto: 30 rows, each { n, words, title, line, run }. An entry matches when every word typed (stop words aside)
     starts one of its words or its title's; ranked by words matched, then the three rows function-polish F8.3 added (so
     "template" opens on Start from a template and "meet day" on Open meet day, for the veteran too), then table order. A
     query that asks how ("how", "can", "where", or "help") and matches no entry whole shows the entries that match most
     of it. Nothing typed on the fresh desk shows the first five. */
  function addLifter(from) {
    if (typeof DESK.addLifter === 'function') { DESK.addLifter({ from: from }); return; }
    DESK.go(HERE === 'clients' ? 'clients' : 'overview', HERE === 'clients' ? 'invite=1' : 'add=1');
  }
  var listOf = function (r) { return r && r.data ? r.data : Array.isArray(r) ? r : []; };
  function firstUnwritten() { var l = lifterList().data.filter(function (x) { return !x.program && x.stage !== 'invited'; })[0]; return l ? l.id : null; }
  function newestIntake() {
    var best = null;
    lifterList().data.forEach(function (x) { var g = null; try { g = PL.lifters.get(x.id).data; } catch (e) { g = null; } var at = g && g.intake && g.intake.at; if (at && (!best || at > best.at)) best = { id: x.id, at: at }; });
    return best ? best.id : null;
  }
  function attemptsLifter() {
    if (!fn(PL.meets, 'plan')) return null;
    var ls = lifterList('meet').data;
    for (var i = 0; i < ls.length; i++) {
      var p = null; try { p = PL.meets.plan(ls[i].id); } catch (e) { p = null; }
      var j = p && p.data && p.data.job; j = j && typeof j === 'object' ? (j.kind || j.id || j.label || '') : j || '';
      if (/attempt/i.test(String(j))) return ls[i].id;
    }
    return null;
  }
  function meetDayId() { var ms = PL.meets.list().data.filter(function (m) { return m.days != null && m.days >= 0; }).sort(function (a, b) { return a.days - b.days; }); return ms[0] ? ms[0].id : null; }
  var go = function (place, hash) { return function () { DESK.go(place, hash || ''); }; };
  DESK.howto = [
    { words: 'add new lifter invite join friend athlete client', title: 'Add a lifter', line: 'Invite them with a link, or type them in yourself.', run: function () { addLifter('find'); } },
    { words: 'free friend charge price cost money', title: 'Coach for free', line: 'Lifters are free by default. Set a price only if someone pays you.', run: go('clients') },
    { words: 'first program block write start starter plan', title: 'Write a first block', line: 'Programs: pick a starter. Loads come from their lifts.', run: function () { var id = firstUnwritten(); DESK.go('programs', id ? 'id=' + encodeURIComponent(id) + '&start=first' : 'tab=templates'); } },
    { words: 'send publish share week program', title: 'Send a week', line: 'Open them in Programs and press Send. They train from their app.', run: go('programs') },
    { words: 'intake details form answers', title: 'Read an intake', line: 'On their page in Lifters, under Intake.', run: function () { var id = newestIntake(); DESK.go('lifters', id ? 'id=' + encodeURIComponent(id) : ''); } },
    { words: 'intake questions ask edit', title: 'Change the intake questions', line: 'Settings, Intake: add your own questions.', run: go('settings', 's=intake') },
    { words: 'template templates save reuse', title: 'Save a block as a template', line: 'Programs, the block’s ⋯ menu, Save as a template.', run: go('programs', 'tab=templates') },
    { words: 'import sheet spreadsheet csv excel google notes paste', title: 'Import a sheet', line: 'Programs, Templates, Import a sheet: CSV files or pasted cells.', run: go('programs', 'tab=templates&sheet=import') },
    { words: 'day daily each routine every morning', title: 'Your day as a coach', line: 'Read new sessions, answer messages, clear Needs you. Weekends: next week.', run: go('overview') },
    { words: 'needs triage alerts list', title: 'What Needs you means', line: 'Lifters to deal with today, worst first: pain, meets, effort, words.', run: go('overview') },
    { words: 'move reschedule skip session day', title: 'Move a session', line: 'Their page in Lifters, This week, the session’s Move.', run: go('lifters') },
    { words: 'lighter heavy hard easier reduce', title: 'Make a week lighter', line: 'In Programs lower the RPE; the kilos follow.', run: go('programs') },
    { words: 'pain injury hurt knee back swap', title: 'Work around pain', line: 'Ask where and how bad, then swap the lift for the week.', run: go('lifters', 'f=health') },
    { words: 'meet competition compete book register', title: 'Book a meet', line: 'Their page, Meets, Book a meet. They still enter with the federation.', run: function () { if (typeof DESK.bookMeet === 'function') DESK.bookMeet({ from: 'find' }); else DESK.go('meets', 'sheet=book'); } },
    { words: 'attempts openers opener third', title: 'Plan attempts', line: 'Meets, their prep: pick Safe, Planned or Brave. First meet? Safe.', run: function () { var id = attemptsLifter(); DESK.go('meets', id ? 'lifter=' + encodeURIComponent(id) : ''); } },
    { words: 'class weigh weigh-in cut', title: 'Weight class and weigh-in', line: 'Set the class on their page. IPF weigh-in: 2 hours before.', run: go('lifters') },
    { words: 'warm warm-up warmups', title: 'Meet-day warm-ups', line: 'The meet-day board builds warm-ups back from the opener.', run: go('meets') },
    { words: 'package packages', title: 'Set up packages', line: 'Settings, Packages: a name, a price, how often.', run: go('settings', 's=packages') },
    { words: 'remind reminder reminders auto automatic late chase', title: 'Payment reminders', line: 'Remind from Clients, or let Settings send them for you.', run: go('settings', 's=reminders') },
    { words: 'paid payment record mark', title: 'Record a payment', line: 'Clients, their row: Mark paid. Money never goes through the app.', run: go('clients') },
    { words: 'seats upgrade plan limit basic pro more', title: 'Your plan', line: 'Free holds 3 lifters. Basic holds 10 for $24.99 a month.', run: go('settings', 's=plan') },
    { words: 'team group squad', title: 'Make a team', line: 'One program for several lifters, each at their own max.', run: go('teams', 'new=1') },
    { words: 'message reply chat text answer', title: 'Answer a lifter', line: 'Messages: what they wrote, beside what they lifted.', run: go('messages') },
    { words: 'help start started getting guide new tour', title: 'Getting started', line: 'Five steps on Overview, from first lifter to first week.', run: function () { if (fn(PL.setup, 'show')) PL.setup.show(); DESK.go('overview'); } },
    { words: 'explain words glossary terms jargon meaning', title: 'Explain coaching words', line: 'Dotted lines under RPE, e1RM and more. Turn on or off.', run: function () { var on = DESK.terms.set(!DESK.terms.on()); DESK.toast(on ? 'Explain coaching words: on.' : 'Explain coaching words: off.'); } },
    D.fresh ? { words: 'example sample demo', title: 'Open the example desk', line: 'Look around Sam’s 20 lifters.', demo: true, run: goDesk } : null,
    { words: 'keys shortcuts keyboard help', title: 'Keys', line: '? or ⌘/ anywhere.', run: function () { DESK.keys(); } },
    { words: 'template templates new block reuse', title: 'Start from a template', line: 'Programs, Templates: pick one, then a lifter.', run: go('programs', 'tab=templates'), pri: 1 },
    { words: 'meet day board weigh-in flight', title: 'Open meet day', line: 'The board: weigh-ins, warm-ups, attempts by flight.', run: function () { var id = meetDayId(); DESK.go('meets', id ? 'id=' + encodeURIComponent(id) + '&stage=weigh' : ''); }, pri: 1 },
    { words: 'rules progression loads', title: 'Loads and rules', line: 'Settings, Loads: how loads move week to week.', run: go('settings', 's=loads'), pri: 1 }
  ];
  DESK.howto = DESK.howto.filter(Boolean);
  DESK.howto.forEach(function (h, i) { h.n = i + 1; });
  var HOW_RX = /^\s*(how|can|where)\b|\bhelp\b/i;
  function howRows(raw, all, t) {
    var rows = DESK.howto;
    /* the explain row says what Enter does now */
    var line = function (h) { return h.title === 'Explain coaching words' ? 'Dotted lines under RPE, e1RM and more. ' + (DESK.terms.on() ? 'Turn off.' : 'Turn on.') : h.line; };
    var shape = function (h) { return { title: h.title, sub: line(h), run: h.run, demo: h.demo }; };
    if (!all.length) return { rows: D.fresh ? rows.slice(0, 5).map(shape) : [], exact: false };
    if (!t.length) return { rows: [], exact: false };
    var scored = rows.map(function (h) {
      var w = words(h.words + ' ' + h.title);
      var hit = t.filter(function (tok) { return w.some(function (x) { return x.indexOf(tok) === 0; }); }).length;
      var same = t.filter(function (tok) { return w.indexOf(tok) >= 0; }).length;
      return { h: h, hit: hit, same: same };
    });
    var whole = scored.filter(function (s) { return s.hit === t.length; });
    var pick = whole.length ? whole : HOW_RX.test(raw) ? scored.filter(function (s) { return s.hit > 0; }) : [];
    pick.sort(function (a, b) { return b.hit - a.hit || b.same - a.same || (b.h.pri || 0) - (a.h.pri || 0) || a.h.n - b.h.n; });
    return { rows: pick.map(function (s) { return shape(s.h); }), exact: whole.some(function (s) { return s.same === t.length; }) };
  }

  /* ---------------- words on demand (first-time-coach §8.3): DESK.terms ----------------
     Every [data-term] always carries its plain title ("RPE: How hard a set felt…"). With Explain coaching words on
     (localStorage powa-r6-explain; unset: on for the fresh desk, off for the example desk), the first place a word shows
     on the page, outside rows, grid cells, buttons, links and toasts, gets a dotted underline (.term-on), a tab stop and a
     popover: on hover after 300 ms (at once for the next word while one was just open), on focus, on Enter or Space.
     The first time a word's popover opens it is read (powa-r6-term-<key>), and its underline goes. Esc, leaving it and
     blur close it. No crimson, no buttons in it.
     For pages: paint owns title, tabindex, aria-describedby and the term-on class on every [data-term]; never set them
     yourself. Painting runs after every childList change in #page (one MutationObserver, batched to a frame). A page that
     repaints by morphing attributes in place (meets.html) makes no childList change: it must leave those four alone when
     it morphs and call DESK.terms.paint() after each paint. */
  var EXPLAIN = 'powa-r6-explain', termCache = null, termPop = null, termEl = null, termOpenT = 0, termCloseT = 0, termLast = 0;
  function termOf(k) {
    if (!termCache) {
      termCache = {};
      var list = fn(PL.terms, 'list') ? listOf(PL.terms.list()) : (D.terms || []);
      list.forEach(function (x) { if (x && x.key) termCache[x.key] = x; });
    }
    return termCache[k] || null;
  }
  var NO_TERM = '[data-row], [role="gridcell"], td, button, [role="button"], a[href], [data-layer="toast"], .toast, input, textarea, select, [contenteditable], .sr, [inert], [data-term-pop]';
  function termEligible(el) { return !el.closest(NO_TERM) && visible(el); }
  DESK.terms = {
    on: function () { var v = store.get('localStorage', EXPLAIN); return v === '1' ? true : v === '0' ? false : !!D.fresh; },
    set: function (on) { store.set('localStorage', EXPLAIN, on ? '1' : '0'); if (!on) closeTerm(); DESK.terms.paint(); if (!on) $$('[data-tip]').forEach(function (x) { x.remove(); }); emit('terms', !!on); return !!on; },
    read: function (k) { return store.get('localStorage', 'powa-r6-term-' + k) === '1'; },
    get: function (k) { return termOf(k); },
    paint: function () {
      var els = document.querySelectorAll('[data-term]'); if (!els.length) return;
      var on = DESK.terms.on(), taken = {};
      for (var i = 0; i < els.length; i++) {
        var el = els[i], k = el.getAttribute('data-term'), t = termOf(k); if (!t) continue;
        var title = t.title || (t.label + ': ' + t.line);
        if (el === termEl) { taken[k] = 1; continue; }   /* the word whose popover is open keeps its mark until it closes */
        var want = on && !taken[k] && !DESK.terms.read(k) && termEligible(el);
        if (want) {
          taken[k] = 1;
          if (!el.classList.contains('term-on')) { el.classList.add('term-on'); if (!el.hasAttribute('tabindex')) { el.setAttribute('tabindex', '0'); el.setAttribute('data-term-tab', ''); } el.setAttribute('aria-describedby', 'term-pop'); }
          if (el.hasAttribute('title')) el.removeAttribute('title');
        } else {
          if (el.classList.contains('term-on')) { el.classList.remove('term-on'); el.removeAttribute('aria-describedby'); if (el.hasAttribute('data-term-tab')) { el.removeAttribute('tabindex'); el.removeAttribute('data-term-tab'); } }
          if (el.getAttribute('title') !== title) el.setAttribute('title', title);
        }
      }
    },
    open: function (el) { openTerm(el); },
    close: function () { closeTerm(); }
  };
  function openTerm(el) {
    var k = el && el.getAttribute('data-term'), t = k && termOf(k); if (!t) return;
    if (!termPop) {
      termPop = document.createElement('div'); termPop.className = 'pop'; termPop.id = 'term-pop';
      termPop.setAttribute('popover', 'manual'); termPop.setAttribute('role', 'tooltip'); termPop.setAttribute('data-layer', 'popover'); termPop.setAttribute('data-term-pop', '');
      termPop.addEventListener('pointerenter', function () { clearTimeout(termCloseT); });
      termPop.addEventListener('pointerleave', function () { closeTermSoon(); });
      document.body.appendChild(termPop);
    }
    clearTimeout(termCloseT); clearTimeout(termOpenT);
    termPop.innerHTML = '<b class="tp-l">' + esc(t.label) + '</b><p class="tp-x">' + esc(t.line) + '</p>';
    if (!termPop.matches(':popover-open')) termPop.showPopover();
    termEl = el;
    placePop(termPop, el, { place: 'auto' });
    store.set('localStorage', 'powa-r6-term-' + k, '1');
  }
  function closeTerm() {
    clearTimeout(termOpenT); clearTimeout(termCloseT);
    if (termPop && termPop.matches(':popover-open')) { termPop.hidePopover(); termLast = Date.now(); }
    if (termEl) { termEl = null; soon(); }
  }
  function closeTermSoon() { clearTimeout(termCloseT); termCloseT = setTimeout(closeTerm, 150); }
  var fine = function () { try { return matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { return true; } };
  document.addEventListener('pointerover', function (e) {
    var el = e.target.closest && e.target.closest('.term-on'); if (!el || e.pointerType === 'touch' || !fine()) return;
    if (el === termEl) { clearTimeout(termCloseT); return; }
    clearTimeout(termOpenT);
    var quick = Date.now() - termLast < 300 || (termPop && termPop.matches(':popover-open'));
    termOpenT = setTimeout(function () { if (el.isConnected && el.matches(':hover')) openTerm(el); }, quick ? 0 : 300);
  });
  document.addEventListener('pointerout', function (e) {
    var el = e.target.closest && e.target.closest('.term-on'); if (!el) return;
    if (e.relatedTarget && (el.contains(e.relatedTarget) || (termPop && termPop.contains(e.relatedTarget)))) return;
    clearTimeout(termOpenT);
    if (el === termEl) closeTermSoon();
  });
  document.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('.term-on'); if (el && e.target === el && lastInput === 'key') openTerm(el); });
  document.addEventListener('focusout', function (e) { if (termEl && e.target === termEl) closeTerm(); });
  addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && termPop && termPop.matches(':popover-open')) { e.preventDefault(); e.stopPropagation(); closeTerm(); return; }
    var el = e.target; if ((e.key === 'Enter' || e.key === ' ') && el && el.classList && el.classList.contains('term-on')) { e.preventDefault(); if (el === termEl) closeTerm(); else openTerm(el); }
  }, true);

  /* ---------------- one-time tips (first-time-coach §8.4): DESK.tip(key, anchor, html) ----------------
     A slim bar in flow under its anchor (or inside the anchor's [data-tip-slot], the week grid's place under its column
     heads), never over content, never modal, never taking the focus or a key the page owns. One at a time; shown once
     per viewer (powa-r6-tip-<key> after Got it, Esc inside it, or DESK.tip.done(key) when the coach does the thing);
     only while Explain coaching words is on. Answers the bar, or null. html is the page's (escaped) words. */
  var TIPS = ['grid', 'needs', 'felt', 'attempts'];
  DESK.tip = function (key, anchor, html) {
    if (!key || !anchor || !DESK.terms.on() || DESK.tip.seen(key)) return null;
    var cur = $('[data-tip]');
    if (cur) return cur.getAttribute('data-tip') === key ? cur : null;
    var el = document.createElement('div');
    el.className = 'tip'; el.setAttribute('data-tip', key); el.setAttribute('role', 'note');
    el.innerHTML = '<p class="tip-t">' + html + '</p><button class="btn quiet sm" type="button" data-tip-ok>Got it</button>';
    var slot = anchor.matches('[data-tip-slot]') ? anchor : anchor.querySelector('[data-tip-slot]');
    if (slot) slot.appendChild(el); else anchor.insertAdjacentElement('afterend', el);
    return el;
  };
  DESK.tip.seen = function (key) { return store.get('localStorage', 'powa-r6-tip-' + key) === '1'; };
  DESK.tip.done = function (key) { store.set('localStorage', 'powa-r6-tip-' + key, '1'); $$('[data-tip="' + key + '"]').forEach(function (x) { x.remove(); }); };
  DESK.tip.reset = function () { TIPS.forEach(function (k) { store.set('localStorage', 'powa-r6-tip-' + k, null); }); };
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-tip-ok]'); if (b) { var t = b.closest('[data-tip]'); if (t) DESK.tip.done(t.getAttribute('data-tip')); } });
  document.addEventListener('keydown', function (e) { if (e.key !== 'Escape') return; var t = e.target.closest && e.target.closest('[data-tip]'); if (t) { e.preventDefault(); DESK.tip.done(t.getAttribute('data-tip')); } });

  /* ---------------- the lifter's side, played by the demo (first-time-coach §2.4; the fresh desk only) ----------------
     An invited lifter joins 6 s after the invite, counted while the page is visible, with the toast the store words
     ("Jess joined and answered your intake."). The wait follows the coach across pages (sessionStorage powa-r6-join-at).
     ?auto=0 turns it off for the session (tests, and anyone who wants to look slowly). */
  var joinT = {}, JOIN_KEY = 'powa-r6-join-at';
  function joinTimers() {
    if (!D.fresh || store.get('sessionStorage', AUTO_KEY) === '0' || !fn(PL.invites, 'list') || !fn(PL.demo, 'join')) return;
    var at = json(store.get('sessionStorage', JOIN_KEY)) || {}, now = Date.now(), changed = false;
    listOf(PL.invites.list()).forEach(function (inv) {
      if (!inv || inv.state !== 'invited' || joinT[inv.id]) return;
      if (!at[inv.id]) { at[inv.id] = now; changed = true; }
      var left = Math.max(0, 6000 - (now - at[inv.id]));
      var fire = function () {
        if (document.hidden) { document.addEventListener('visibilitychange', function w() { if (!document.hidden) { document.removeEventListener('visibilitychange', w); joinT[inv.id] = setTimeout(fire, 1500); } }); return; }
        var still = listOf(PL.invites.list()).filter(function (x) { return x.id === inv.id && x.state === 'invited'; })[0]; if (!still) return;
        var r = PL.demo.join(inv.id);
        if (r && r.meta && r.meta.label) DESK.toast(r.meta.label, typeof r.meta.undo === 'function' ? r.meta.undo : null);
      };
      joinT[inv.id] = setTimeout(fire, left);
    });
    if (changed) store.set('sessionStorage', JOIN_KEY, JSON.stringify(at));
  }
  if (D.fresh && PL && typeof PL.on === 'function') { PL.on('invite:changed', joinTimers); setTimeout(joinTimers, 0); }

  /* ---------------- the keys: ? (outside fields) and ⌘/ (everywhere) ----------------
     DESK.keyMap(list, { esc }): the page's keys, [key, what it does]. The desk's keys come first (⌘K, ⌘Z, ⌘/ or ?, Esc
     with the page's meaning when it gives one, and the list keys on a page with a list), then the page's. 12 lines or more
     sit in two columns; a list taller than the window scrolls inside the sheet. The sheet holds one option, "Tab per
     week" (Programs: ⌥→ ⌥← change lifter, ⌥↓ ⌥↑ change week), kept in PL.settings when the store has it, else in
     localStorage powa-r6-keys; DESK.keysOpt.get('tabPerWeek') reads it, and DESK.on('keys:option') hears it change. */
  var keyList = [], keyEsc = null;
  DESK.keyMap = function (list, o) {
    keyList = (list || []).filter(function (k) { return k[0] !== 'Esc'; });
    var own = (list || []).filter(function (k) { return k[0] === 'Esc'; })[0];
    keyEsc = (o && o.esc) || (own ? own[1] : null);
  };
  DESK.keysOpt = {
    get: function (name) {
      var s = fn(PL.settings, 'get') ? PL.settings.get() : null, k = s && s.data && s.data.keys;
      if (k && k[name] != null) return !!k[name];
      var l = json(store.get('localStorage', 'powa-r6-keys')) || {}; return !!l[name];
    },
    set: function (name, on) {
      on = !!on;
      if (fn(PL.settings, 'set')) { var p = { keys: {} }; p.keys[name] = on; PL.settings.set(p); }
      var l = json(store.get('localStorage', 'powa-r6-keys')) || {}; l[name] = on; store.set('localStorage', 'powa-r6-keys', JSON.stringify(l));
      emit('keys:option', { name: name, on: on });
      return on;
    }
  };
  var keysOpen = function () { return DESK.sheet.isOpen() && sheetEl.getAttribute('aria-label') === 'Keys'; };
  DESK.keys = function () {
    var pageHasList = !!pageList() && !keyList.some(function (k) { return /⌥↓|^J\b|\bJ$/.test(k[0]); });
    var desk = [['⌘K', 'Find a name, or ask a question'], ['⌘Z', 'Undo the last move'], ['⌘/ or ?', 'These keys'], ['Esc', keyEsc || 'Close the popover, the sheet, then the panel']]
      .concat(pageHasList ? [['⌥↓ ⌥↑ or J K', 'Next or previous in the list']] : []);
    var all = desk.concat(keyList);
    var dl = function (l) { return '<dl>' + l.map(function (k) { return '<dt>' + esc(k[0]) + '</dt><dd>' + esc(k[1]) + '</dd>'; }).join('') + '</dl>'; };
    var half = Math.ceil(all.length / 2), body = all.length >= 12 ? '<div class="keys-cols">' + dl(all.slice(0, half)) + dl(all.slice(half)) + '</div>' : dl(all);
    var opt = '<label class="keys-opt"><input type="checkbox" data-keys-opt="tabPerWeek"' + (DESK.keysOpt.get('tabPerWeek') ? ' checked' : '') + '><span><b>Tab per week</b><small>Programs: ⌥→ ⌥← change lifter, ⌥↓ ⌥↑ change week</small></span></label>';
    DESK.sheet.open({ label: 'Keys', cls: 'is-instant', html: '<div class="keys"><h2>Keys</h2><div class="keys-b">' + body + '</div><div class="keys-end">' + opt + '<button class="btn" type="button" data-close>Done</button></div></div>' });
  };

  /* ---------------- the store's reasons, drawn the same way on every page ----------------
     DESK.TONE maps a reason's tone (t-pain …) to its ui.css tone class (tone-pain …): words carry the status, the tone
     only colours them. */
  DESK.TONE = { 't-pain': 'pain', 't-warn': 'warn', 't-meet': 'gold', 't-msg': 'words', 't-quiet': 'quiet', 't-ok': 'up', 't-write': 'quiet', 't-good': 'up', 't-bw': 'bw' };

  /* ---------------- states for the gate: DESK.states({ name: async fn }), DESK.state(name), DESK.settled() ---------------- */
  var REG = {};
  DESK.states = function (map) { Object.keys(map || {}).forEach(function (k) { REG[k] = map[k]; }); };
  DESK.settled = function () {
    var byScroll = function (a) { return !!a.timeline && typeof DocumentTimeline === 'function' && !(a.timeline instanceof DocumentTimeline); };
    return new Promise(function (resolve) {
      var tries = 0;
      (function check() {
        var live = document.getAnimations().filter(function (a) { return !byScroll(a) && (a.playState === 'running' || a.pending); });
        if (!live.length || ++tries > 40) { requestAnimationFrame(function () { requestAnimationFrame(resolve); }); return; }
        Promise.race([Promise.all(live.map(function (a) { return a.finished.catch(function () {}); })), new Promise(function (r) { setTimeout(r, 150); })]).then(check);
      })();
    });
  };
  DESK.state = function (name) {
    var f = REG[name];
    if (typeof f !== 'function') return Promise.reject(new Error('DESK.state: no state named "' + name + '" (have: ' + Object.keys(REG).join(', ') + ')'));
    return Promise.resolve().then(function () { return f(); }).then(function () { return DESK.settled(); });
  };
  DESK.nextFrame = function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); }); };

  /* ---------------- a list redrawn under a pointer that has not moved ----------------
     A move redraws its list, and the row that slides under the resting pointer would light up as if the coach had gone to
     it (a second row that reads as selected). Any change inside a [data-list] or [data-table] marks it .is-still (ui.css
     keeps its rows unlit and their fixes quiet); the next pointer move anywhere clears every mark. */
  var stills = [];
  function markStill(el) { if (el && !el.classList.contains('is-still')) { el.classList.add('is-still'); stills.push(el); } }
  if ('MutationObserver' in window) new MutationObserver(function (ms) {
    ms.forEach(function (m) {
      var t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (t && t.closest) markStill(t.closest('[data-list], [data-table]'));
      m.addedNodes.forEach(function (n) {
        if (n.nodeType !== 1) return;
        if (n.matches('[data-list], [data-table]')) markStill(n);
        n.querySelectorAll('[data-list], [data-table]').forEach(markStill);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('pointermove', function () { if (!stills.length) return; stills.forEach(function (el) { el.classList.remove('is-still'); }); stills = []; }, { passive: true });

  /* ---------------- a lift's colour on its name (13 Nov evening: the colour is back) ----------------
     A lift named on its own, or with a load or a top set after it ("Squat", "Paused squat", "Bench 80", "Deadlift: 175",
     "Squat, top set"), wears its lift's ink (ui.css [data-lift]). A page that marks its own words (data-lift="…") wins;
     desk.js only tags words that carry none, marks them data-lift-auto, and untags them when their words change.
     Never inside a control (a button, a tab, a menu, a segmented choice), the sidebar, the toolbar, a heading 1, a field
     or [data-lift-off]. DESK.liftOf(text) answers 'squat' | 'bench' | 'deadlift' | null for a page that tags its own. */
  var LIFT_MOD = '(?:competition|comp|paused|pause|tempo|pin|box|front|high[- ]bar|low[- ]bar|ssb|safety[- ]bar|beltless|belted|close[- ]grip|wide[- ]grip|spoto|larsen|feet[- ]up|incline|floor|board|deficit|sumo|conventional|romanian|stiff[- ]legg?e?d?|snatch[- ]grip|touch[- ]and[- ]go|\\d+[- ]?(?:s|sec|second|count))';
  var LIFT_RX = new RegExp('^(?:' + LIFT_MOD + '\\s+)*(squats?|bench(?:\\s+press)?|deadlifts?|rdl|(?:block|rack|deficit)\\s+pulls?)' +
    '(?:\\s*:?\\s+[\\d.,/ ×x@%+kg -]*\\d[\\d.,/ ×x@%+kg -]*|\\s*,\\s*top set|\\s*:\\s*top set)?$', 'i');
  DESK.liftOf = function (text) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40) return null;
    var m = LIFT_RX.exec(t); if (!m) return null;
    var k = m[1].toLowerCase();
    return /^squat/.test(k) ? 'squat' : /^bench/.test(k) ? 'bench' : 'deadlift';
  };
  var LIFT_SKIP = 'button, [role="tab"], [role="menu"], [role="menuitem"], [role="menuitemradio"], .mn, .seg, .btn, .side, .tb, h1, input, textarea, select, [contenteditable], [data-lift-off], svg, .sr';
  var LIFT_OK = '.sx-exn, .wg-t';   /* a grid's exercise name inside its own button still names a lift */
  function liftTag(el) {
    if (!el || el.nodeType !== 1 || el.firstElementChild) return;
    var auto = el.hasAttribute('data-lift-auto');
    if (el.hasAttribute('data-lift') && !auto) return;
    var k = el.closest(LIFT_SKIP) && !el.matches(LIFT_OK) ? null : DESK.liftOf(el.textContent);
    if (k) { if (el.getAttribute('data-lift') !== k) { el.setAttribute('data-lift', k); el.setAttribute('data-lift-auto', ''); } }
    else if (auto) { el.removeAttribute('data-lift'); el.removeAttribute('data-lift-auto'); }
  }
  function liftScan(root) {
    if (!root || root.nodeType !== 1) return;
    liftTag(root);
    var all = root.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) if (!all[i].firstElementChild) liftTag(all[i]);
  }
  DESK.liftScan = liftScan;
  if ('MutationObserver' in window) new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.type === 'characterData') { liftTag(m.target.parentElement); continue; }
      if (m.target.nodeType === 1 && !m.target.firstElementChild) liftTag(m.target);
      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];
        if (n.nodeType === 1) liftScan(n); else if (n.nodeType === 3) liftTag(n.parentElement);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  if (document.body) liftScan(document.body);
  else document.addEventListener('DOMContentLoaded', function () { liftScan(document.body); });

  /* ---------------- shell wiring ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('.mn[data-desk-menu] .mi'))) { pickMenu(b); return; }
    if ((b = t.closest('[data-find]'))) { DESK.find(); return; }
    if ((b = t.closest('[data-account]'))) { if (DESK.pop.justClosed(b)) return; accountMenu(b); return; }
    if ((b = t.closest('[data-desk-back]'))) { e.preventDefault(); DESK.goBack(); return; }
    if ((b = t.closest('[data-desk-go]'))) { e.preventDefault(); DESK.go(b.getAttribute('data-desk-go'), b.getAttribute('data-hash') || ''); return; }
    if ((b = t.closest('[data-theme-toggle]'))) { DESK.theme.set(DESK.theme.get() === 'light' ? 'dark' : 'light'); return; }
    if ((b = t.closest('[data-top]'))) { if (titleTop && DESK.title.folded()) titleTop(); else scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); return; }
    if ((b = t.closest('[data-insp-close]'))) { DESK.insp.close(); emit('insp:closed-by-user'); return; }
  });
  document.addEventListener('change', function (e) { var c = e.target.closest && e.target.closest('[data-keys-opt]'); if (c) DESK.keysOpt.set(c.getAttribute('data-keys-opt'), c.checked); });
  /* a field, or a region that takes its own keys ([data-keys=own]: the week grid, where a bare letter or ? starts an edit) */
  var typingIn = function (el) { var tag = el && el.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(el && el.isContentEditable) || !!(el && el.closest && el.closest('[data-keys="own"]')); };
  var inGrid = function (el) { return !!(el && el.closest && el.closest('[role="grid"], [data-grid]')); };
  /* ⌘K and ⌘/ work everywhere, grids and fields included; ? outside fields. Capture, so a page that also opens the keys
     on ? never opens them twice: the second press closes them. */
  var toggleKeys = function () { if (keysOpen()) DESK.sheet.close(); else { if (finder && finder.open) finder.close(); DESK.keys(); } };
  addEventListener('keydown', function (e) {
    if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !typingIn(e.target)) {
      if ($('dialog[open]') && !keysOpen() && !(finder && finder.open)) return;   // a page's own sheet keeps its keys
      e.preventDefault(); e.stopPropagation(); toggleKeys(); return;
    }
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    var k = e.key.toLowerCase();
    if (k === 'k') { e.preventDefault(); e.stopPropagation(); DESK.find(); }
    else if (k === '/') { e.preventDefault(); e.stopPropagation(); toggleKeys(); }
  }, true);
  document.addEventListener('keydown', function (e) {
    var typing = typingIn(e.target);
    /* a DESK.menu's items: ↑ ↓ move between them, Home and End to its ends (a page's own menus keep their own keys) */
    var mi = e.target && e.target.closest && e.target.closest('.mn[data-desk-menu] .mi');
    if (mi && /^(ArrowDown|ArrowUp|Home|End)$/.test(e.key)) {
      e.preventDefault();
      var its = $$('.mi:not(:disabled):not([hidden])', mi.closest('.mn')), k = its.indexOf(mi);
      var nk = e.key === 'Home' ? its[0] : e.key === 'End' ? its[its.length - 1] : its[Math.max(0, Math.min(its.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (nk) nk.focus();
      return;
    }
    if (e.key === 'Escape') {
      if ($('dialog[open]')) return;                                    // the dialog closes itself
      if (DESK.pop.isOpen()) return;                                    // an auto popover closes itself
      if (DESK.insp.isOpen() && !typing && !inspPinned) { e.preventDefault(); DESK.insp.close(); emit('insp:closed-by-user'); return; }
      emit('escape', e);
    }
  });
  /* ⌘Z, ⌥↓ ⌥↑, J and K: on the window, after the page's own handlers (a page that takes the key calls preventDefault) */
  addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.isComposing) return;
    var el = e.target, typing = typingIn(el), modal = !!$('dialog[open]') || DESK.pop.isOpen();
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') {
      if (typing || inGrid(el) || modal) return;
      e.preventDefault(); DESK.undoLast(); return;
    }
    if (modal) return;
    var step = 0;
    if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      if (el && (el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      step = e.key === 'ArrowDown' ? 1 : -1;
    } else if (!e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.key === 'j' || e.key === 'k' || e.key === 'J' || e.key === 'K')) {
      if (typing || inGrid(el)) return;
      step = e.key.toLowerCase() === 'j' ? 1 : -1;
    }
    if (!step) return;
    var done = typeof DESK.listStepper === 'function' && DESK.listStepper(step) === true;
    if (done || DESK.listStep(step)) e.preventDefault();
  });
})();
