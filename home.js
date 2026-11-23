/* =====================================================================
   home.js — the homepage's page layer and its motion score (GSAP 3.15 + ScrollTrigger, vendored in vendor/).
   The website only: index.html's head script adds it outside the iPhone app, and loads GSAP after the page has loaded
   and its arrival (home.css, from the first paint) has finished.
   The page layer (the bar, its contents marker, one crimson per screen, the meet-day radio group, the questions) works
   without GSAP.
   The score (the owner, 31 Oct: a landing page that moves as it scrolls, never a held stage): every chapter is in the
   page's flow and complete at any scroll position; its motion plays in place as it arrives. Two kinds of moment:
   - a state change, played forward as its block arrives and rewound, out of sight, once the reader scrolls back up
     past it (its block off the screen's foot; never backwards in view, never replayed by a small scroll back):
     a screen easing up 30 to 40 px as it arrives (it only moves; the page's words never animate), lists building in
     their order, numbers counting from the old value to the new, a message arriving, a press;
   - a short scrubbed touch, tied to the reader's scroll 1:1 (scrub: true; no catch-up after the finger stops): the depth between the laptop and the phone, the set's flight
     from Arjun's phone to Sam's list, the window zooming from Sam's whole screen to that list, then on to Needs you.
   Only transform, opacity and clip-path move (plus two small SVG strokes drawing). Curves: cubic-bezier(0.22, 1, 0.36,
   1) for anything entering, (0.77, 0, 0.175, 1) for moves between stops, the app's (0.23, 1, 0.32, 1) for presses and
   state; no overshoot, text never from scale 0. Without JavaScript, with reduced motion, or if GSAP misses its 4 s,
   the HTML is the last frame of every chapter (the designed still); a reader already part-way down when the score
   arrives sees what is on screen finished, not replayed.
   The account modals, the app bundle and the max calculator are index.html's own glue, not this file.
   ===================================================================== */
(function () {
  'use strict';
  var H = document.documentElement;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var nav = $('#nav');
  var vwOf = function () { return window.innerWidth; }, vhOf = function () { return window.innerHeight; };
  var small = function () { return vwOf() < 760; };
  var wide = function () { return vwOf() >= 1100; };
  /* Where a block sits in the page's layout (offsets, not boxes), so a moving layer never moves a trigger. */
  function layoutTop(el) { var y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }
  var clamp = function (a, b, v) { return Math.max(a, Math.min(b, v)); };
  var motionOK = function () { return H.classList.contains('m'); };

  /* The curves, exactly: a cubic-bezier solver (the browser's own method), handed to GSAP as functions. */
  function bezier(p1x, p1y, p2x, p2y) {
    var cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    var cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    var sx = function (t) { return ((ax * t + bx) * t + cx) * t; };
    var sy = function (t) { return ((ay * t + by) * t + cy) * t; };
    var dx = function (t) { return (3 * ax * t + 2 * bx) * t + cx; };
    function solve(x) {
      var t = x, i, d, e;
      for (i = 0; i < 8; i++) { e = sx(t) - x; if (Math.abs(e) < 1e-6) return t; d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
      var lo = 0, hi = 1; t = x;
      while (hi - lo > 1e-6) { e = sx(t); if (Math.abs(e - x) < 1e-6) return t; if (x > e) lo = t; else hi = t; t = (lo + hi) / 2; }
      return t;
    }
    return function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)); };
  }
  var OUT = bezier(0.23, 1, 0.32, 1), ENTER = bezier(0.22, 1, 0.36, 1), INOUT = bezier(0.77, 0, 0.175, 1);

  /* =====================================================================
     THE PAGE LAYER (with or without motion)
     ===================================================================== */

  /* --- Meet day: Safe / Plan / Send is a real radio group (the app's odds for each, from its own maths). --- */
  var opts = $$('#decOpts [role="radio"]'), locked = false;
  function pick(btn, focus) {
    opts.forEach(function (b) { var on = b === btn; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    if (focus) btn.focus();
    var kg = btn.dataset.kg;
    $$('.pick-kg').forEach(function (e) { e.textContent = kg; });
    $('#decOdds').innerHTML = '<b>' + btn.dataset.word + '</b> ' + btn.dataset.pct + '%';
    $('#decAim').textContent = 'Chance of 650 now: ' + btn.dataset.tot + '%';
    $('#mpAim').textContent = 'Chance of 650 now: ' + btn.dataset.tot + '%';
    $('#cell3kg').textContent = btn.dataset.third;
  }
  function lock(on) { locked = on; opts.forEach(function (b) { if (on) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled'); }); }
  opts.forEach(function (b, i) {
    b.addEventListener('click', function () { if (!locked) pick(b); });
    b.addEventListener('keydown', function (e) {
      var k = e.key, n = null;
      if (k === 'ArrowDown' || k === 'ArrowRight') n = opts[(i + 1) % opts.length];
      else if (k === 'ArrowUp' || k === 'ArrowLeft') n = opts[(i + opts.length - 1) % opts.length];
      if (!n) return;
      e.preventDefault();
      if (locked) { n.focus(); n.tabIndex = 0; b.tabIndex = -1; return; }
      pick(n, true);
    });
  });

  /* --- The true-size window onto Arjun's page: 1:1 when it fits (or on a phone, where it shows his page's left side at
     its real size), scaled to fit on tablets. The score's zoom ends where this holds it. --- */
  var fwPort = $('#fwA .fw-port'), fwDesk = $('#fwDesk');
  function fk() { return (!fwPort || small()) ? 1 : Math.min(1, fwPort.clientWidth / 756); }
  function fitFw() { if (fwDesk) fwDesk.style.setProperty('--fk', String(fk())); }

  /* --- Questions: native details; with motion the answer arrives (opacity and 6 px). --- */
  $$('details.q').forEach(function (d) {
    var body = $('.qa', d);
    d.addEventListener('toggle', function () {
      if (!d.open || !motionOK() || !body || !body.animate || d.dataset.held) return;
      body.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    });
  });

  /* --- The nav and the contents marker: which chapter of the coach's week is at 40% of the screen, and whether a page
     action is on screen (then the nav's ink pill steps back). The bar is the app's dark glass over every chapter. --- */
  var S = { acts: new Set(), decRed: false, setY: Infinity, tapped: false };   // setY: where the set's moment starts (the score sets it); tapped: Log set tried
  var toc = $('#toc'), tocBar = $('#tocBar'), tocLinks = $$('#toc a'), tocOn = -1;
  var chapters = [];
  function measurePage() {
    var y0 = window.scrollY;
    var r = function (el) { var b = el.getBoundingClientRect(); return [b.top + y0, b.bottom + y0]; };
    chapters = tocLinks.map(function (l) {
      var id = l.dataset.ch;
      if (!l.offsetParent) return null;   // not in the bar at this width (Lifters on a tablet)
      /* Today starts at its first words (on a laptop with motion they sit beside Arjun's phone, above the row). */
      if (id === 'today') { var t = r($('#today')), c = r($('.land-copy')), w = r($('#who')); return [Math.min(t[0], c[0]), w[1]]; }
      /* For lifters runs on through its last word, the band for those training on their own. */
      if (id === 'lifters') { var s = $('#solo'); return [r($('#lifters'))[0], r(s || $('#lifters'))[1]]; }
      return r(document.getElementById(id));
    });
  }
  function placeTocBar() {
    if (tocOn < 0) return;
    var l = tocLinks[tocOn];
    tocBar.style.setProperty('--x', l.offsetLeft + 'px'); tocBar.style.setProperty('--w', String(l.offsetWidth / 100));
  }
  function paintNav() {
    var y = window.scrollY, vh = vhOf();
    nav.classList.toggle('is-on', y > 8);
    nav.classList.toggle('has-pill', !(S.acts.has('heroCta') || S.acts.has('plansCta') || S.acts.has('closeCta')));
    var at = y + vh * 0.4, on = -1;
    for (var k = 0; k < chapters.length; k++) { var c = chapters[k]; if (c && at >= c[0] && at < c[1]) on = k; }
    if (on !== tocOn) {
      var was = tocOn; tocOn = on;
      tocLinks.forEach(function (l, j) { if (j === on) l.setAttribute('aria-current', 'location'); else l.removeAttribute('aria-current'); });
      if (on < 0) toc.classList.remove('has-on');
      else {
        if (was < 0) { tocBar.style.transition = 'none'; placeTocBar(); void tocBar.offsetWidth; tocBar.style.transition = ''; } else placeTocBar();
        toc.classList.add('has-on');
      }
    }
  }

  /* --- One crimson per screen. The real screens keep their own action's colour (Log set on Arjun's phone once his set's
     moment has begun, or once it is tapped; Publish on Sam's week, Declare on his board while it is crimson): while one is on screen, the
     page's Start buttons step back to ink. Before its moment, Log set steps back to the page's Start free (the opening
     keeps its crimson on a phone, where his phone already shows under it). Two of a kind on one screen: the one nearer
     the middle keeps the crimson. --- */
  var reds = [
    { el: $('#heroCta .act-btn'), app: false }, { el: $('#logBtn'), app: true, wait: function () { return !S.tapped && window.scrollY < S.setY; } }, { el: $('#pub'), app: true },
    { el: $('#decBtn'), app: true, on: function () { return S.decRed; } },
    { el: $('#plansCta .act-btn'), app: false }, { el: $('#closeCta .act-btn'), app: false }
  ].filter(function (r) { return r.el; });
  var redsIn = new Set();
  function paintReds() {
    var vh = vhOf(), mid = vh / 2, live = [];
    reds.forEach(function (r) {
      if (!redsIn.has(r.el) || (r.on && !r.on())) return;
      var b = r.el.getBoundingClientRect();
      /* Rank: a screen's own action (once its moment has begun), then the page's, then a screen's still waiting. */
      if (b.bottom > 64 && b.top < vh) live.push({ r: r, d: Math.abs((b.top + b.bottom) / 2 - mid), k: r.app ? (r.wait && r.wait() ? 0 : 2) : 1 });
    });
    var top = live.reduce(function (m, o) { return Math.max(m, o.k); }, -1);
    var keep = live.filter(function (o) { return o.k === top; }).sort(function (a, b) { return a.d - b.d; })[0] || null;
    reds.forEach(function (r) { r.el.classList.toggle('is-quiet', !!keep && r !== keep.r && live.some(function (o) { return o.r === r; })); });
  }
  var tick = false;
  function onScroll() { if (!tick) { tick = true; requestAnimationFrame(function () { tick = false; paintNav(); paintReds(); }); } }
  if ('IntersectionObserver' in window) {
    var actIO = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) S.acts.add(e.target.id); else S.acts.delete(e.target.id); }); onScroll(); }, { rootMargin: '-64px 0px 0px 0px' });
    ['#heroCta', '#plansCta', '#closeCta'].forEach(function (s) { actIO.observe($(s)); });
    var redIO = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) redsIn.add(e.target); else redsIn.delete(e.target); }); onScroll(); });
    reds.forEach(function (r) { redIO.observe(r.el); });
  }

  /* --- The programs band shows once the shop has three published programs: this visit's count, if a page has taken it
     (app.js siteProgramsReady keeps it ten minutes in powa-mp-count), or else one light read as the reader nears the
     end of the page (the close within 1600 px below the screen; the band sits under it, so it arrives out of sight):
     up to three ids of published programs, rows anyone may read (the shop lists them signed out), counted and kept
     as app.js keeps them. Never at load: a request then would sit in the opening's critical path (Lighthouse counts
     it into the phone picture's LCP). The app's own files never load for it; the app counts again if it loads. The
     project's address and public key are db.js's (SUPABASE_URL, SUPABASE_ANON_KEY): change them there and here
     together. --- */
  var MP_KEY = 'powa-mp-count';
  function programsCount() {
    try { var mp = JSON.parse(sessionStorage.getItem(MP_KEY) || 'null'); if (mp && Date.now() - mp.at < 600000) { H.classList.toggle('has-programs', mp.n >= 3); return; } } catch (e) {}
    if (!window.fetch) return;
    var sb = 'https://cxnotrikxvzncupswvio.supabase.co', key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bm90cmlreHZ6bmN1cHN3dmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3OTgwNDAsImV4cCI6MjA5MzM3NDA0MH0.fLl1sXdHnI8IeKUIKOB9Sh0HVATCdshcLXZs5oKuCuU';
    fetch(sb + '/rest/v1/marketplace_programs?select=id&status=eq.published&limit=3', { headers: { apikey: key, Authorization: 'Bearer ' + key }, credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        H.classList.toggle('has-programs', rows.length >= 3);
        try { sessionStorage.setItem(MP_KEY, JSON.stringify({ n: rows.length, at: Date.now() })); } catch (e) {}
      })
      .catch(function () {});
  }
  try { var mp0 = JSON.parse(sessionStorage.getItem(MP_KEY) || 'null'); if (mp0 && Date.now() - mp0.at < 600000 && mp0.n >= 3) H.classList.add('has-programs'); } catch (e) {}
  function countWhenNear() {
    var near = $('#start') || $('footer.foot');
    if (!near || !('IntersectionObserver' in window)) { setTimeout(programsCount, 4000); return; }
    var mpIO = new IntersectionObserver(function (es) {
      if (!es.some(function (e) { return e.isIntersecting; })) return;
      mpIO.disconnect(); programsCount();
    }, { rootMargin: '0px 0px 1600px 0px' });
    mpIO.observe(near);
  }
  if (document.readyState === 'complete') countWhenNear(); else window.addEventListener('load', countWhenNear);

  /* --- A link to the max calculator (index.html#e1rm, from the guides) opens the eighth question. --- */
  function openCalc() { var d = document.getElementById('e1rm'); if (location.hash === '#e1rm' && d && !d.open) { d.open = true; d.scrollIntoView({ block: 'start' }); } }
  window.addEventListener('hashchange', openCalc);
  if (location.hash === '#e1rm') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', openCalc); else openCalc(); }

  /* --- The page follows the visitor's setting (prefers-color-scheme), live: home.css by its media queries, each
     <picture> by its sources, and here the browser's bar (the floor's own colour; the app, loaded for the account
     windows, would set white) and the few pictures this script sets itself (the light captures sit in
     site-img/home-light/ under the same names). The stored theme is never touched. --- */
  var lightMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  var isLight = function () { return !!(lightMQ && lightMQ.matches); };
  function themed(s) { return isLight() ? String(s).replace(/\/site-img\/home\//g, '/site-img/home-light/') : String(s).replace(/\/site-img\/home-light\//g, '/site-img/home/'); }
  function barColour() { var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', isLight() ? '#f4f4f6' : '#0b0b0c'); }
  var retheme = [];   // pictures set by script: each re-picks its source when the setting changes
  window.addEventListener('themechange', barColour);
  if (lightMQ && lightMQ.addEventListener) lightMQ.addEventListener('change', function () { barColour(); retheme.forEach(function (f) { f(); }); });

  /* --- Try it: Log set on Arjun's phone is a real button (clear, over the app's own Log set). With the score running it
     plays the set's moment (the score's tap.fx: it logs on the phone and lands on Sam's laptop, his week's sessions one more);
     without motion, or before the score has started, the phone and the laptop simply show it logged (the score takes
     that over when it starts). Either way one line tells a screen reader. --- */
  var tap = { fx: null, still: false };
  var logTap = $('#logTap'), logSaid = $('#logSaid'), heroPh = $('#phone'), heroNext = heroPh && $('.ph-next', heroPh);
  function saidLogged() {
    if (!logSaid) return;
    logSaid.textContent = '';
    setTimeout(function () { logSaid.textContent = 'Logged: 182.5 kg × 5 at RPE 8. It’s on Sam’s laptop.'; }, 120);
  }
  function logStill() {
    if (tap.still) return;
    tap.still = true;
    if (heroNext && !heroNext.getAttribute('srcset')) heroNext.srcset = themed(heroNext.dataset.fallback);
    var shown = function () { heroPh.classList.add('is-logged'); };
    if (heroNext && heroNext.decode) heroNext.decode().then(shown, shown); else shown();
    var lp = $('#laptop');
    if (lp && !small()) lp.classList.add('is-landed');   // Sam's Overview with the session counted (on a phone his laptop isn't in the opening)
  }
  if (heroNext) retheme.push(function () { var s = heroNext.getAttribute('srcset'); if (s) heroNext.srcset = themed(s); });
  if (logTap) logTap.addEventListener('click', function () {
    S.tapped = true; paintReds();   // its moment has begun: Log set is this screen's crimson now
    if (tap.fx ? tap.fx() !== false : (logStill(), true)) saidLogged();
  });

  /* --- Try the demo: a pointer on, a touch of or focus on a demo link fetches its page ahead (once, at the browser's
     low priority): about 200 ms sooner on a 4G line (measured 23 Nov). The app's own 1.4 MB is not fetched ahead: in
     the 400 ms a pointer rests before a click it won back only about 100 ms. --- */
  var warmed = {};
  function prefetch(u, as) {
    if (warmed[u]) return;
    warmed[u] = true;
    var l = document.createElement('link'); l.rel = 'prefetch'; l.href = u; if (as) l.as = as;
    document.head.appendChild(l);
  }
  function warmDemo(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    var u = a && a.getAttribute('href');
    if (!u || !/^\/(coach-preview\/desk\/overview\.html|athlete\.html\?demo=1|coach\.html\?demo=1)/.test(u)) return;
    prefetch(u, 'document');
  }
  ['pointerover', 'touchstart', 'focusin'].forEach(function (ev) { document.addEventListener(ev, warmDemo, { capture: true, passive: true }); });

  function relayout() { fitFw(); measurePage(); placeTocBar(); paintNav(); paintReds(); }
  relayout();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', relayout, { passive: true });
  window.addEventListener('load', relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

  /* =====================================================================
     THE STILL, OR THE SCORE
     Without motion: Tom's 2nd is declared, so the choice is locked as it would be on the day.
     ===================================================================== */
  var started = false;
  function still() { if (!started) lock(true); relayout(); }
  document.addEventListener('fx:still', still);
  if (!motionOK()) { lock(true); return; }
  function go() {
    if (started) return;
    if (!motionOK() || !window.gsap || !window.ScrollTrigger) { still(); return; }
    started = true;
    clearTimeout(window.__fxFallback);
    score();
  }
  if (window.gsap && window.ScrollTrigger) go(); else document.addEventListener('fx:gsap', go, { once: true });

  function score() {
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
  ST.config({ ignoreMobileResize: true });
  gsap.defaults({ overwrite: false });
  /* While the score boots, a moment whose block the reader has already reached shows finished (never replayed under
     them); after that, every moment plays as its block arrives. */
  var booting = true;

  /* --- Numbers in the app's formats; a count runs from the shown value to the target. --- */
  function fmt(v, f) { v = Math.round(v); return f === 'plus' ? '+' + v : f === 'usd' ? '$' + v.toLocaleString('en-US') : String(v); }
  function show(el, v) { el.textContent = fmt(v, el.dataset.fmt); }
  function count(tl, el, at, dur, ease) {
    if (!el) return;
    var a = Number(el.dataset.from), b = Number(el.dataset.to), o = { v: a };
    show(el, a);
    tl.fromTo(o, { v: a }, { v: b, duration: dur || 0.8, ease: ease || OUT, onUpdate: function () { show(el, o.v); } }, at);
  }
  /* Two-state words: the old line leaves upward, the new one arrives from below. */
  function swapStart(el) { var k = el.children; for (var i = 0; i < k.length; i++) gsap.set(k[i], { autoAlpha: i === 0 ? 1 : 0 }); }
  function swapIn(tl, el, at) {
    var a = el.children[0], b = el.children[el.children.length - 1];
    tl.fromTo(a, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -4, duration: 0.16, ease: OUT, immediateRender: false }, at)
      .fromTo(b, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: OUT, immediateRender: false }, at + 0.1);
  }
  /* A state change: plays as its block arrives. It rewinds only once its block has left the screen below (the reader
     scrolled back up past it), out of sight, so nothing ever plays backwards in front of the reader, and a reader who
     scrolls up a little and down again sees it finished, not replayed. o.away: the element whose top leaving the
     screen's foot rewinds it (default the trigger). The scroll-position triggers (the window's) pass theirs. */
  function onState(tl, o) {
    var away = o.away || o.trigger; delete o.away;
    var main = ST.create(Object.assign({
      onEnter: function () { if (booting) tl.progress(1); else tl.timeScale(1).play(); }
    }, o));
    if (away) ST.create({ trigger: away, start: 'top bottom', end: 'max', onLeaveBack: function () { tl.timeScale(Math.max(1.6, tl.duration() / 0.9)).reverse(); } });
    return main;
  }
  /* A screen easing up into place as it arrives: it only moves, the way the laptop and the phone arrive at the top (never
     a fade, never a scale), so no picture waits on a script to be seen. The page's words do not animate at all. */
  function rise(targets, o) {
    o = o || {};
    targets = (targets || []).filter(Boolean);
    if (!targets.length) return null;
    var tl = gsap.timeline({ paused: true })
      .fromTo(targets, { y: o.y || 30 }, { y: 0, duration: o.dur || 0.8, stagger: o.stagger || 0, ease: ENTER });
    onState(tl, { trigger: o.trigger || targets[0], start: o.start || 'top 94%' });
    return tl;
  }
  /* AVIF where it decodes (a one-pixel probe), WebP otherwise. */
  var AVIF = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  function avif(cb) { var p = new Image(); p.onload = function () { cb(true); }; p.onerror = function () { cb(false); }; p.src = AVIF; }

  /* =====================================================================
     ACT ONE: the set. Arjun logs it on his phone, the app works out his max beside it, the set flies to Sam's laptop;
     the window zooms from Sam's whole screen to his list of who trained since he looked; Arjun's row arrives.
     ===================================================================== */
  var phone = $('#phone'), logB = $('#logBtn'), next = $('.ph-next', phone), laptop = $('#laptop');
  var max = $('#max'), maxTags = $('.max-tags', max), strip = $('.odo-strip', max);
  var clipR = $('#maxClipR'), maxEnd = $('#maxEnd'), maxChart = $('.max-chart', max);
  var fly = $('#fly'), ring = $('#fwRing');
  /* The phone a moment later is only ever seen with motion: fetched once the score starts (decoded off the main thread). */
  avif(function (ok) { next.srcset = themed(ok ? next.dataset.srcset : next.dataset.fallback); if (next.decode) next.decode().catch(function () {}); });
  /* The next chapters' pictures, decoded ahead so no frame waits on one mid-scroll. On a laptop they are fetched now; on a
     phone (often a slow line, and data) the browser's own lazy loading fetches each as the reader nears it. */
  function warm() { var eager = !small(); $$('#thread img, #wk img, #imp img, .cl img, .brand-ph img, #fwA img, .fw-b img, #lifters .lf-base img, #lifters .lf-line').forEach(function (i) { if (eager && i.loading === 'lazy') i.loading = 'eager'; if (i.complete && i.decode) i.decode().catch(function () {}); }); }
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 1500 }); else setTimeout(warm, 600);

  /* Depth (laptops): the laptop behind lags the reader's scroll, the phone in front leads it; scrubbed over the
     opening, on the transform (the arrival moved the individual translate). */
  var mm = gsap.matchMedia();
  mm.add('(min-width: 1100px)', function () {
    var depth = gsap.timeline({ scrollTrigger: { start: 0, end: function () { return vhOf() * 1.1; }, scrub: true, invalidateOnRefresh: true } })
      .fromTo(laptop, { y: 0 }, { y: 96, ease: 'none', duration: 1 }, 0)
      .fromTo(phone, { y: 0 }, { y: -48, ease: 'none', duration: 1 }, 0);
    return function () { depth.scrollTrigger.kill(); depth.kill(); gsap.set([laptop, phone], { clearProps: 'transform' }); };
  });

  /* The set, read and logged (nothing labels it). Once the whole set card is on screen a light ring travels down it, from
     the load and reps to how hard it felt, and settles on Log set: the set is ready, and so is the button (Try it). It
     logs on a tap, or by itself as Log set reaches the middle of the screen: Log set presses and releases (the ring rides
     into the press and lets go), the phone moves on as the app does (set 2 up, the rest timer docked), and beside it on
     a laptop (below it on a phone, once it is on screen) the max rolls 223 to 228 as the line climbs to the new point,
     then +5 kg and New PR land. Scrolled back above the card, a set the scroll logged un-logs (and the ring goes back up
     the card); one a tap logged stays (a tap again plays it again). */
  var digitH = function () { return strip.firstElementChild.offsetHeight; };
  var hls = $$('.hl', phone), hlLast = hls[hls.length - 1];
  gsap.set(next, { autoAlpha: 0 });
  gsap.set(hls, { autoAlpha: 0 });
  gsap.set(maxTags, { autoAlpha: 0, y: 8 });
  gsap.set(strip, { y: 0 });
  gsap.set(clipR, { attr: { width: 93.6 } });
  var endFrom = function () { return { x: -(98 - 91.6) / 100 * maxChart.offsetWidth, y: (29.73 - 17.55) / 100 * maxChart.offsetHeight }; };
  gsap.set(maxEnd, { x: function () { return endFrom().x; }, y: function () { return endFrom().y; } });
  function logTl() {
    return gsap.timeline()
      .to(logB, { scale: 0.97, duration: 0.11, ease: OUT }, 0)
      .to(logB, { scale: 1, duration: 0.28, ease: OUT }, 0.12)
      .to(next, { autoAlpha: 1, duration: 0.26, ease: OUT }, 0.16);
  }
  /* The ring: in on the load and reps, then down to how hard it felt, then onto Log set, where it stays (each leaves
     downward as the next arrives from just above it, so one highlight seems to travel). */
  function ringTl() {
    var tl = gsap.timeline({ paused: true });
    hls.forEach(function (h, i) {
      var at = i * 0.44;
      tl.fromTo(h, { autoAlpha: 0, y: i ? -10 : 0, scale: i ? 1 : 1.03 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.36, ease: ENTER, immediateRender: false }, at);
      if (h !== hlLast) tl.to(h, { autoAlpha: 0, y: 10, duration: 0.3, ease: INOUT }, at + 0.42);
    });
    return tl;
  }
  function maxTl() {
    return gsap.timeline({ paused: true })
      .to(strip, { y: function () { return -5 * digitH(); }, duration: 0.9, ease: OUT }, 0)
      .to(clipR, { attr: { width: 104 }, duration: 0.7, ease: INOUT }, 0)
      .to(maxEnd, { x: 0, y: 0, duration: 0.7, ease: INOUT }, 0)
      .to(maxTags, { autoAlpha: 1, y: 0, duration: 0.34, ease: ENTER }, 0.5);
  }
  var logStart = function () { return Math.max(40, layoutTop(logB) + logB.offsetHeight / 2 - vhOf() * (small() ? 0.62 : 0.5)); };
  /* The ring starts once the whole card is in view; untapped, the set logs as Log set reaches the middle. */
  var setStart = function () { return Math.max(24, logStart() - vhOf() * (wide() ? 0.45 : 0.24)); };
  /* The max panel shows last week's 223 until the set is logged (LG.max). */
  var back = function (tl) { return tl.timeScale(Math.max(1.6, tl.duration() / 0.9)).reverse(); };
  /* by: null (not logged), 'scroll' or 'tap'; side: the max beside the phone (laptops); maxIn: stacked, the max on screen. */
  var LG = { ring: ringTl(), max: maxTl(), press: null, by: null, side: false, maxIn: false };
  function maxGo(now) { if (now) LG.max.progress(1); else LG.max.timeScale(1).play(); }
  function logSet(by, now) {
    if (LG.by) return;
    LG.by = by;
    /* The ring on Log set rides into the press and lets go (once: un-logging rewinds the ring itself, back up the card);
       caught mid-way down the card, it steps aside. */
    if (LG.ring.progress() === 1) { var r = gsap.timeline().to(hlLast, { scale: 0.97, duration: 0.11, ease: OUT }, 0).to(hlLast, { scale: 1, autoAlpha: 0, duration: 0.42, ease: OUT }, 0.12); if (now) r.progress(1); }
    else { LG.ring.pause(); gsap.to(hls, { autoAlpha: 0, duration: now ? 0 : 0.15, ease: OUT }); }
    LG.press = logTl();
    if (now) LG.press.progress(1);
    if (LG.side || LG.maxIn) { if (now) maxGo(true); else gsap.delayedCall(0.3, function () { if (LG.by) maxGo(false); }); }
  }
  function unlog() {
    if (!LG.by) return;
    LG.by = null;
    if (LG.press) back(LG.press);
    back(LG.max);
  }
  ST.create({ start: setStart, end: 'max',
    onEnter: function () { if (LG.by) return; if (booting) LG.ring.progress(1); else LG.ring.timeScale(1).play(); },
    onLeaveBack: function () { if (LG.by === 'tap') return; unlog(); back(LG.ring); } });
  ST.create({ start: logStart, end: 'max', onEnter: function () { logSet('scroll', booting); } });
  mm.add({ side: '(min-width: 1100px)', stack: '(max-width: 1099px)' }, function (ctx) {
    LG.side = !!ctx.conditions.side;
    if (LG.side) return;
    /* Stacked: the max rolls once it is on screen and the set is logged, whichever comes second. */
    var m = ST.create({ trigger: '.max-num', start: 'top 72%', end: 'max',
      onEnter: function () { LG.maxIn = true; if (LG.by) maxGo(booting); },
      onLeaveBack: function () { LG.maxIn = false; back(LG.max); } });
    return function () { m.kill(); LG.maxIn = false; };
  });

  /* --- The set's flight (scrubbed): it lifts off Arjun's set card and is carried to his row on Sam's laptop. Its two
     ends are wherever the page has them this frame. --- */
  var F = { p: 0 }, phBody = $('#phBody');   // the phone itself (its figure also holds the legend on phones and tablets)
  /* A set card in flight at p (0 to 1) from the phone's set card (a: the phone's box) to where it lands (b: its ring's box). */
  function flyAt(el, p, a, b) {
    var fw = el.offsetWidth, fh = el.offsetHeight;
    var sx = a.left + a.width * (196 / 393), sy = a.top + a.height * (236 / 852);
    var ex = b.left + b.width / 2, ey = b.top + b.height / 2;
    var up = Math.min(1, p / 0.18) * (small() ? 30 : 56);
    var q = clamp(0, 1, (p - 0.08) / 0.92), e = INOUT(q), arc = (small() ? 0 : 70) * Math.sin(Math.PI * q);
    var k0 = a.width / 393 * 1.04, k1 = clamp(0.42, 1, b.width / fw);
    var k = k0 + (k1 - k0) * clamp(0, 1, (q - 0.55) / 0.45);
    gsap.set(el, { x: sx + (ex - sx) * e - fw / 2 + arc, y: sy - up * (1 - e) + (ey - sy) * e - fh / 2, scale: k, rotation: (ex - sx) * 0.004 * Math.sin(Math.PI * q) });
  }
  function placeFly() { flyAt(fly, F.p, phBody.getBoundingClientRect(), ring.getBoundingClientRect()); }
  /* Where the window sits, and when each beat of it happens (scroll positions, from its layout). The window rises zoomed
     out on Sam's whole screen (Lifters, Trained since you looked) and zooms in to that list as it comes up; the set lands
     there (Arjun's row arrives); then, as the list's words come level (on a laptop) or come up under it (stacked), it
     moves on to his Overview's Needs you: the same camera, the second screen brought in over the first. */
  var winTop = function () { return layoutTop(fwPort); };
  var crossStart = function () { return logStart() + (small() ? 140 : wide() ? 200 : 160); };
  var landAt = function () { return Math.max(crossStart() + 320, winTop() - vhOf() * (wide() ? 0.4 : 0.34)); };
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { start: crossStart, end: landAt, scrub: true, invalidateOnRefresh: true } })
    .fromTo(F, { p: 0 }, { p: 1, duration: 1, onUpdate: placeFly }, 0)
    .fromTo(fly, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.02 }, 0)
    .to(fly, { autoAlpha: 0, duration: 0.02 }, 0.98);

  /* --- The window: Sam's whole screen, zoomed in to his list at its real size, then moved on to Needs you: one scrubbed
     timeline, so its three states never fight. Arjun's row is ringed once as the set lands. The numbers below are the
     captures' own (test/site-capture/cap-desk2.mjs, mkimg.py desk2). --- */
  /* Zoomed out: Sam's screen covering the window (no empty bands), centred on the list and the page beside it. */
  function deskFit() {
    var w = fwPort.clientWidth, h = fwPort.clientHeight, s = Math.max(w / 1440, h / 900), seen = w / s, cx = wide() ? 720 : 618;
    return { x: -clamp(0, 1440 - seen, cx - seen / 2) * s, y: -(900 - h / s) / 2 * s, s: s };
  }
  function deskHold() { var k = fk(); return { x: -68 * k, y: -56 * k, s: k }; }   // the list from the sidebar's edge, under the top bar
  /* Needs you on the Overview: from 64 desk px (room for the rows' numbers), 952 wide (on a phone 660: the lifter and
     why now, so the words stay readable), down to the bottom of Sam's screen. */
  function deskList() {
    var w = fwPort.clientWidth, h = fwPort.clientHeight, s = Math.min(1, fk(), w / (small() ? 660 : 952));
    return { x: -64 * s, y: -Math.max(0, 900 * s - h), s: s };
  }
  gsap.set(fwDesk, { transformOrigin: '0 0' });
  var fwOv = $('#fwOv');
  var listAt = function () { return winTop() - vhOf() * 0.08; };
  mm.add({ side: '(min-width: 1100px)', stack: '(max-width: 1099px)' }, function (ctx) {
    var at = function (f, k) { return function () { return f()[k]; }; };
    /* In vh of scroll before the window's top reaches 8% of the screen: zoom in as it rises, hold while the set lands,
       then move on to Needs you (the Overview comes in over the list in the first part of the move). */
    var A = ctx.conditions.side ? [1, 0.44, 0.3] : [0.92, 0.4, 0.24];
    gsap.timeline({ scrollTrigger: { start: function () { return winTop() - vhOf() * A[0]; }, end: listAt, scrub: true, invalidateOnRefresh: true } })
      .fromTo(fwDesk, { x: at(deskFit, 'x'), y: at(deskFit, 'y'), scale: at(deskFit, 's') }, { x: at(deskHold, 'x'), y: at(deskHold, 'y'), scale: at(deskHold, 's'), ease: INOUT, duration: A[0] - A[1] }, 0)
      .to(fwDesk, { x: at(deskList, 'x'), y: at(deskList, 'y'), scale: at(deskList, 's'), ease: INOUT, duration: A[2] - 0.08 }, A[0] - A[2])
      .fromTo(fwOv, { autoAlpha: 0 }, { autoAlpha: 1, ease: 'none', duration: (A[2] - 0.08) * 0.5 }, A[0] - A[2] + (A[2] - 0.08) * 0.12);
  });
  var desk = $('#fwDesk');
  /* The landing, on one of Sam's screens: what it showed a moment before gives way to the screen with the set in, and a
     line is drawn once round where it landed. In the window (.was): the list without Arjun and "1 of 8", laid over the
     list with him in it. On the opening's laptop (.now): its Training tile with the session counted, brought in over
     "7 of 52". Every word and number is the capture's own; the page draws none. */
  function landing(root, sel) {
    var rg = $('.ring', root), rgRect = $('.ring rect', root), lay = $$(sel, root), from = sel === '.was' ? 1 : 0;
    gsap.set(rg, { autoAlpha: 0 }); gsap.set(rgRect, { strokeDasharray: 100, strokeDashoffset: 100 });
    gsap.set(lay, { opacity: from });
    var a = gsap.timeline({ paused: true })
      .set(rg, { autoAlpha: 1 }, 0)
      .to(rgRect, { strokeDashoffset: 0, duration: 0.6, ease: INOUT }, 0)
      .to(rg, { autoAlpha: 0, duration: 0.8, ease: INOUT }, 1.4)
      .to(lay, { opacity: 1 - from, duration: 0.5, ease: OUT }, 0.12);
    return { a: a, ring: rg, lay: lay };
  }
  /* Sam's laptop in the opening, live for Try it (index.html #ltLive): at rest it is the laptop's picture. */
  var heroLive = $('#ltLive'), heroLaptop = $('#laptop');
  var L = landing(desk, '.was'), HL = heroLive ? landing(heroLive, '.now') : null;
  onState(L.a, { start: landAt, end: 'max', away: fwPort });

  /* --- Try it (the page layer's Log set button). A tap logs the set (the ring, where it's on Log set, rides into the
     press); then, where Sam's laptop is in the opening and his screen in view, a copy of the set lifts off the phone and
     lands on his Overview's Training tile there: the tile is ringed and its week's sessions read one more. On a
     phone (no laptop in the opening) the phone and the max say it. A tap again, once it has landed, plays it all again. */
  var fly2 = fly.cloneNode(true), T = { p: 0 }, tapRun = null;
  fly2.removeAttribute('id'); fly.parentNode.insertBefore(fly2, fly.nextSibling);
  gsap.set(fly2, { autoAlpha: 0 });
  function placeTap() { flyAt(fly2, T.p, phBody.getBoundingClientRect(), HL.ring.getBoundingClientRect()); }
  function heroLand(now) {
    if (!HL || small()) return;
    var b = HL.ring.getBoundingClientRect(), mid = (b.top + b.bottom) / 2;
    if (now || mid < 64 || mid > vhOf()) { HL.a.progress(1); return; }   // out of view: simply there
    tapRun = gsap.timeline()
      .fromTo(T, { p: 0 }, { p: 1, duration: 1.0, ease: 'none', onUpdate: placeTap, immediateRender: false }, 0.3)
      .fromTo(fly2, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06, immediateRender: false }, 0.3)
      .to(fly2, { autoAlpha: 0, duration: 0.14 }, 1.26)
      .add(function () { HL.a.timeScale(1).restart(); }, 1.22)
      .to({}, { duration: 1.5 }, 1.27);   // the landing's own time: a tap meanwhile waits for it
  }
  /* Back to the set as written, quickly, for a tap again: the phone to set 1, the max to 223, the laptop to its picture. */
  function unTap(done) {
    var d = 0.24;
    LG.by = null;
    if (LG.press) { LG.press.kill(); LG.press = null; }
    gsap.to(next, { autoAlpha: 0, duration: d, ease: OUT });
    gsap.to(logB, { scale: 1, duration: d, ease: OUT });
    LG.max.pause(); gsap.to(LG.max, { progress: 0, duration: d, ease: OUT });
    if (HL) { HL.a.pause(); gsap.to(HL.lay, { opacity: 0, duration: d, ease: OUT, onComplete: function () { HL.a.pause(0); } }); gsap.set(HL.ring, { autoAlpha: 0 }); }
    gsap.delayedCall(d + 0.08, done);
  }
  var resetting = false;
  tap.fx = function () {
    if (resetting || (tapRun && tapRun.isActive()) || (LG.press && LG.press.isActive())) return false;   // mid-moment: it plays out
    var go = function () { resetting = false; logSet('tap'); heroLand(false); };
    if (LG.by) { resetting = true; unTap(go); } else go();
  };
  /* Tapped before the score was here: it was shown logged without it; carry that on in the score's own terms. */
  if (tap.still) {
    tap.still = false;
    heroPh.classList.remove('is-logged');
    if (heroLaptop) heroLaptop.classList.remove('is-landed');
    logSet('tap', true); heroLand(true);
  }

  /* The window eases up into the page. */
  rise([$('#fwA')], { y: 36, start: 'top 96%', dur: 0.8 });

  /* =====================================================================
     TODAY: the lifters who need Sam first, in the coach website's own order, pain first (its Overview's Needs you: Priya,
     Sarah, Mei, Tom, Nina, Elena). The window has moved on to that table: each row is ringed and numbered in turn, and
     its line lights in the chain beside it (below it on a phone) as its lifter's face arrives. No sentences: the order
     is the explanation. The table's own figure is the still's.
     ===================================================================== */
  var chainLis = $$('#chain li'), grps = $$('.grp', desk), mks = $$('.mk', desk);
  gsap.set(chainLis, { opacity: 0.34 });
  gsap.set($$('#chain .av'), { autoAlpha: 0, scale: 0.8 });
  gsap.set(mks, { autoAlpha: 0, scale: 0.6 });
  var listTl = gsap.timeline({ paused: true });
  for (var g = 1; g <= 6; g++) {
    var gat = (g - 1) * 0.2;
    listTl.to(chainLis[g - 1], { opacity: 1, duration: 0.3, ease: OUT }, gat)
      .to($$('.av', chainLis[g - 1]), { autoAlpha: 1, scale: 1, duration: 0.34, stagger: 0.06, ease: ENTER }, gat + 0.04)
      .to(mks[g - 1], { autoAlpha: 1, scale: 1, duration: 0.32, ease: ENTER }, gat)
      .fromTo(grps[g - 1], { opacity: 0 }, { opacity: 1, duration: 0.3, ease: OUT, immediateRender: false }, gat)
      .to(grps[g - 1], { opacity: 0.14, duration: 0.5, ease: INOUT }, gat + 0.5);
  }
  onState(listTl, { start: listAt, end: 'max', away: fwPort });

  /* =====================================================================
     ANSWERS: the thread eases up beside the words; Sam's note, then Arjun's set arrive the way messages do; Sent becomes
     Seen; Sam's reply lands under it.
     ===================================================================== */
  rise([$('#thread .th-crop')], { trigger: $('#thread'), y: 40, start: 'top 94%', dur: 0.8 });
  gsap.fromTo('#thread', { y: 26 }, { y: -26, ease: 'none', scrollTrigger: { trigger: '#answers', start: 'top bottom', end: 'bottom top', scrub: true } });
  var sent = $('.tl-sent'), seen = $('.tl-seen'), reply = $('#reply'), tlNote = $('.tl-note'), tlSet = $('.tl-set');
  gsap.set(seen, { autoAlpha: 0 });
  var threadTl = gsap.timeline({ paused: true })
    .fromTo(tlNote, { autoAlpha: 0, x: -14 }, { autoAlpha: 1, x: 0, duration: 0.46, ease: ENTER }, 0)
    .fromTo(tlSet, { autoAlpha: 0, x: 22 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: ENTER }, 0.38)
    .fromTo(sent, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: OUT }, 0.74)
    .to(sent, { autoAlpha: 0, duration: 0.18, ease: OUT }, 1.18)
    .to(seen, { autoAlpha: 1, duration: 0.3, ease: OUT }, 1.26)
    .fromTo(reply, { autoAlpha: 0, x: -12, y: 14 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.5, ease: ENTER }, 1.62);
  onState(threadTl, { trigger: '#thread', start: function () { return small() ? 'top 62%' : 'top 70%'; } });

  /* =====================================================================
     NEXT WEEK: Sam's Programs sheet on the coach website, Marcus's week 3 (cap-week2.mjs). As it arrives a ring finds why:
     what week 2 lifted on his bench, @9.5 where Sam wrote 8. Then one finds week 3's load on the same line, his rule's
     145, and the sheet's action arrives in its top bar, the one crimson here: Send 4 changes to Marcus. One real
     picture: the new sheet has no step to press between (the 145 is an unsent change when the page opens).
     ===================================================================== */
  var wkPort = $('#wkPort'), wkTap = $('#wkTap'), wkWhy = $('#wkWhy'), pub = $('#pub');
  rise([wkPort], { y: 30, start: 'top 94%', dur: 0.8 });
  gsap.set(pub, { autoAlpha: 0, y: 6, transformOrigin: '100% 50%' });
  var weekTl = gsap.timeline({ paused: true })
    .fromTo(wkWhy, { autoAlpha: 0, scale: 1.05 }, { autoAlpha: 1, scale: 1, duration: 0.34, ease: ENTER, immediateRender: false }, 0)
    .to(wkWhy, { autoAlpha: 0, duration: 0.4, ease: OUT }, 1.0)
    .fromTo(wkTap, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.3, ease: OUT, immediateRender: false }, 1.15)
    .to(wkTap, { opacity: 0, duration: 0.5, ease: OUT }, 2.0)
    .to(pub, { autoAlpha: 1, y: 0, duration: 0.4, ease: ENTER }, 1.5);
  onState(weekTl, { trigger: wkPort, start: function () { return small() ? 'bottom 92%' : 'bottom 88%'; } });

  /* =====================================================================
     MEET DAY: a chapter like the others. As the platform arrives the three lights come on one by one: good lift. Tom's
     phone wakes with his next attempt and Declare turns crimson; the platform's minute runs, smoothly, 1:00 to 0:41;
     the call: Declare presses and becomes Declared 215, the board's 2nd fills, and Tom's phone has it (its card rings
     green, "not declared yet" clears, he is one out). No captions say so: the stage does.
     ===================================================================== */
  var scene = $('#scene'), judgesBox = $('#judges'), judges = $$('#judges i');
  var cell1 = $('#cell1'), cell2 = $('#cell2'), dec = $('#decBtn');
  var clockN = $('#clockN'), clockBar = $('#clockBar'), mpOn = $('#mpOn');
  judges.forEach(function (i) { i.classList.add('is-off'); });
  judgesBox.setAttribute('aria-label', 'The three lights, not on yet');
  gsap.set('#verdict', { autoAlpha: 0, y: 8 });
  [$('#slabOut'), $('#slabDec'), cell1, cell2, $('.swap', dec)].forEach(swapStart);
  var red = document.createElement('span'); red.className = 'dec-red'; red.setAttribute('aria-hidden', 'true'); dec.insertBefore(red, dec.firstChild);
  gsap.set(red, { opacity: 0 });
  gsap.set(mpOn, { autoAlpha: 0 });
  /* The slab's edge and the ring it takes as the call lands: home.css's, in the visitor's setting (read as the moment plays). */
  var slabShadow = function (k) { return function () { return getComputedStyle($('#slab')).getPropertyValue(k).trim(); }; };
  function clockText(s) { s = Math.max(0, Math.ceil(s - 1e-6)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function setClock(s) { var t = clockText(s); if (clockN.textContent !== t) clockN.textContent = t; }
  var minute = { s: 60 };
  setClock(60);
  gsap.set(clockBar, { scaleX: 1 });
  var meetTl = gsap.timeline({ paused: true });
  /* The lights, one by one (a callback each way, so scrolling back turns them off in turn). */
  judges.forEach(function (j, i) {
    meetTl.add(function () { var on = !meetTl.reversed(); j.classList.toggle('is-off', !on); if (i === 2) judgesBox.setAttribute('aria-label', on ? 'Three white lights: a good lift' : 'The three lights, not on yet'); }, 0.001 + i * 0.24)
      .fromTo(j, { scale: 0.9 }, { scale: 1, duration: 0.4, ease: ENTER, immediateRender: false }, 0.001 + i * 0.24);
  });
  meetTl.to('#verdict', { autoAlpha: 1, y: 0, duration: 0.4, ease: ENTER }, 0.66)
    .to(mpOn, { autoAlpha: 1, duration: 0.42, ease: OUT }, 0.74)
    .add(function () { S.decRed = !meetTl.reversed(); paintReds(); }, 0.8)
    .to(red, { opacity: 1, duration: 0.24, ease: OUT }, 0.8);
  swapIn(meetTl, cell1, 0.7);
  /* The platform's minute: a real, smooth countdown, a second at a time, its bar draining with it. */
  var RUN = 4.2, T0 = 1.0;
  meetTl.to(minute, { s: 41, duration: RUN, ease: 'none', onUpdate: function () { setClock(minute.s); } }, T0)
    .fromTo(clockBar, { scaleX: 1 }, { scaleX: 41 / 60, duration: RUN, ease: 'none', immediateRender: false }, T0);
  /* The call at 0:41. */
  var C = T0 + RUN + 0.15;
  meetTl.add(function () { lock(!meetTl.reversed()); }, C)
    .to(dec, { scale: 0.97, duration: 0.11, ease: OUT }, C)
    .to(dec, { scale: 1, duration: 0.28, ease: OUT }, C + 0.12)
    .to(red, { opacity: 0, duration: 0.24, ease: OUT }, C + 0.08)
    .add(function () { S.decRed = meetTl.reversed(); paintReds(); }, C + 0.2)
    .fromTo('#slab', { boxShadow: slabShadow('--slab-edge') }, { boxShadow: slabShadow('--slab-on'), duration: 0.3, ease: OUT, immediateRender: false }, C + 0.3)
    .to('#slab', { boxShadow: slabShadow('--slab-edge'), duration: 0.8, ease: INOUT }, C + 1.1);
  swapIn(meetTl, $('.swap', dec), C + 0.08);
  swapIn(meetTl, cell2, C + 0.16);
  swapIn(meetTl, $('#slabDec'), C + 0.3);
  swapIn(meetTl, $('#slabOut'), C + 0.36);
  onState(meetTl, { trigger: scene, start: function () { return small() ? 'top 74%' : 'top 66%'; } });

  /* =====================================================================
     FOR LIFTERS: Arjun's own app after that set. The two phones ease up into place; the PR moment plays as
     the app plays it (styles.css .pr-moment: the plate rolls in from the screen's left edge and lands with a squash, the
     number counts up from his old best, 223 to 228, then the jump shows); then Progress draws its line up to his new
     total. Side by side (760 and up) one beat, the moment then the line; stacked, each as its phone comes up.
     ===================================================================== */
  var lfPr = $('#lfPr'), lfProg = $('#lfProg'), lfPlate = $('.lf-plate', lfPr), lfN = $('.lf-n', lfPr), lfD = $('.lf-d', lfPr), lfLine = $('.lf-line', lfProg);
  rise([$('.lf-crop', lfPr), $('.lf-crop', lfProg)], { trigger: '.lf-phones', y: 40, start: 'top 94%', dur: 0.8, stagger: 0.12 });
  lfN.dataset.from = '223'; lfN.dataset.to = '228';
  gsap.set(lfPlate, { xPercent: -221, rotation: -250, transformOrigin: '50% 50%' });   // the app's -72vw: 283 of its 393 pt, 2.21 plates
  gsap.set(lfD, { autoAlpha: 0, yPercent: 18 });
  gsap.set(lfLine, { clipPath: 'inset(0% 100% 0% 0%)' });
  function prMoment() {
    var tl = gsap.timeline({ paused: true })
      .to(lfPlate, { xPercent: 0, rotation: 0, duration: 0.86, ease: ENTER }, 0)
      .to(lfPlate, { scaleX: 1.04, scaleY: 0.95, yPercent: 1.6, duration: 0.1, ease: 'power1.out' }, 0.82)
      .to(lfPlate, { scaleX: 1, scaleY: 1, yPercent: 0, duration: 0.2, ease: 'power1.out' }, 0.92)
      .to(lfD, { autoAlpha: 1, yPercent: 0, duration: 0.24, ease: OUT }, 1.15);
    count(tl, lfN, 0.25, 0.9, 'power2.out');   // the app's own count: 900 ms, a cubic ease-out, from 250 ms
    return tl;
  }
  function lineDraw() { return gsap.timeline({ paused: true }).to(lfLine, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: INOUT }, 0); }
  mm.add({ pair: '(min-width: 760px)', stack: '(max-width: 759px)' }, function (ctx) {
    if (ctx.conditions.pair) {
      var both = gsap.timeline({ paused: true }).add(prMoment().play(), 0).add(lineDraw().play(), 0.7);
      var a = onState(both, { trigger: '.lf-phones', start: 'center 62%' });
      return function () { a.kill(); both.kill(); };
    }
    var p1 = prMoment(), p2 = lineDraw();
    var b1 = onState(p1, { trigger: lfPr, start: 'center 62%' }), b2 = onState(p2, { trigger: lfProg, start: 'bottom 92%' });
    return function () { b1.kill(); b2.kill(); p1.kill(); p2.kill(); };
  });

  /* =====================================================================
     MOVING OVER: the three steps are simply there; the import's preview eases up beside them.
     ===================================================================== */
  rise([$('#imp')], { y: 32, start: 'top 92%' });

  /* KNOW WHO HAS PAID: Clients eases up (the coach website's own screen; the page draws nothing over it). */
  rise([$('.cl')], { y: 30, start: 'top 94%', dur: 0.8 });

  /* =====================================================================
     PRICING: the branded phone eases up; a ring visits what branding changes (the team's name and logo, then Log set in
     its colour); Sam's roster fills from 11 to 20 lifters on Pro, a seat at a time.
     ===================================================================== */
  var bpHls = $$('.brand-ph .hl');
  gsap.set(bpHls, { autoAlpha: 0 });
  rise([$('.brand-ph .bp-crop')], { trigger: '.brand-ph', y: 40, start: 'top 92%' });
  /* The ring plays once the whole screen is in view (its second stop, Log set, is at the crop's foot). */
  var bpRings = gsap.timeline({ paused: true });
  bpHls.forEach(function (h, i) {
    var at = 0.1 + i * 0.62;
    bpRings.fromTo(h, { autoAlpha: 0, y: i ? -10 : 0, scale: i ? 1 : 1.03 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.36, ease: ENTER, immediateRender: false }, at)
      .to(h, i ? { autoAlpha: 0, duration: 0.5, ease: OUT } : { autoAlpha: 0, y: 10, duration: 0.32, ease: INOUT }, at + (i ? 1.0 : 0.6));
  });
  onState(bpRings, { trigger: '.brand-ph', start: 'bottom 92%' });
  var seats = $$('#scale .f:not(.f-open)'), bands = $$('#scale .band'), scN = $('#scN'), plan = $('#scPlan');
  var planKids = plan ? Array.prototype.slice.call(plan.children) : [];
  var shown = -1;
  function paintRoster(n) {
    if (n === shown) return; shown = n;
    seats.forEach(function (f, i) { f.classList.toggle('is-open', i >= n); });   // an open seat is empty; its initials come back as it fills
    var t = n <= 3 ? 0 : n <= 10 ? 1 : 2;
    bands.forEach(function (el, i) { el.classList.toggle('is-on', i === t); });
    scN.textContent = String(n);
    planKids.forEach(function (k, i) { k.style.visibility = i === t ? 'visible' : 'hidden'; });
  }
  paintRoster(11);
  var R = { n: 11 };
  var rosterTl = gsap.timeline({ paused: true }).fromTo(R, { n: 11 }, { n: 20, duration: 1.35, ease: 'power1.inOut', onUpdate: function () { paintRoster(Math.round(R.n)); } }, 0.1);
  onState(rosterTl, { trigger: '#scale', start: function () { return small() ? 'top 70%' : 'top 76%'; } });

  /* =====================================================================
     QUESTIONS: all closed; each opens only for the reader, its answer arriving (the page layer).
     ===================================================================== */

  /* =====================================================================
     THE LAST CALL: still. The line, Start coaching free and the footer are simply there.
     ===================================================================== */

  /* Every trigger refreshes in page order; the page map is re-read after each refresh. The boot ends two frames after
     the first refresh: from then on every moment plays as its block arrives. */
  ST.addEventListener('refresh', function () { S.setY = setStart(); measurePage(); paintNav(); paintReds(); });
  /* A fromTo writes its start values at the end of GSAP's tick. On a phone nothing renders between the last of them and
     this first refresh, which reverts the scrubbed timelines (the set's flight) and took the waiting start values with
     them: Sam's reply sat in the thread before it arrived, and every entrance after it showed before its turn. One
     render first writes them (on a laptop the opening's depth timeline already does). */
  gsap.to({}, { duration: 1, paused: true }).progress(1).kill();
  ST.sort(); ST.refresh();
  requestAnimationFrame(function () { requestAnimationFrame(function () { booting = false; window.__fxReady = true; }); });
  function refresh() { fitFw(); ST.sort(); ST.refresh(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  if (document.readyState === 'complete') requestAnimationFrame(refresh); else window.addEventListener('load', refresh);
  /* Every picture keeps its place before it loads (width and height, per source); if one landing ever changes the page's
     height anyway, the page's map is re-read once things settle, so no trigger is ever out by a picture. */
  var refT = 0, pageH = document.documentElement.scrollHeight;
  ST.addEventListener('refresh', function () { pageH = document.documentElement.scrollHeight; });
  $$('.s-home img[loading="lazy"]').forEach(function (i) { if (!i.complete) i.addEventListener('load', function () { clearTimeout(refT); refT = setTimeout(function () { if (document.documentElement.scrollHeight !== pageH) ST.refresh(); }, 200); }, { once: true }); });
  }
})();
