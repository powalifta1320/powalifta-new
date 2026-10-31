/* =====================================================================
   home.js — the homepage's page layer and its motion score (GSAP 3.15 + ScrollTrigger, vendored in vendor/).
   The website only: index.html's head script adds it outside the iPhone app, and loads GSAP after the page has loaded.
   The page layer (the bar, its contents marker, the meet-day radio group, the questions) works without GSAP.
   The score: every moment is driven by the reader's scroll (scrubbed, so it reverses with the reader) or is a state
   change (it plays forward, and back faster from wherever it is). Nothing loops and nothing runs on a timer. Only
   transform, opacity and an SVG clip move; numbers count from the old value to the new one. The app's curves
   exactly: ease-out 0.23, 1, 0.32, 1 for anything arriving; ease-in-out 0.77, 0, 0.175, 1 for anything moving on
   screen; no overshoot. Without JavaScript, with reduced motion, or if GSAP misses its 4 s, the HTML is the last
   frame of every chapter (the designed still); the score starts each moment from its before-state and plays to it.
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
  var docTop = function (el) { return el.getBoundingClientRect().top + window.scrollY; };
  var clamp = function (a, b, v) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (t) { t = clamp(0, 1, t); return t * t * (3 - 2 * t); };
  var motionOK = function () { return H.classList.contains('m'); };

  /* The app's curves, exactly: a cubic-bezier solver (the browser's own method), handed to GSAP as functions. */
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
  var OUT = bezier(0.23, 1, 0.32, 1), INOUT = bezier(0.77, 0, 0.175, 1);

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

  /* --- The true-size window onto Arjun's page (tablets): 1:1 when it fits, scaled to fit below. --- */
  var fwPort = $('#fwA .fw-port'), fwLive = $('#fwLive');
  function fitFw() {
    if (!fwPort || !fwLive) return;
    if (small()) { fwLive.style.transform = ''; return; }
    var k = Math.min(1, fwPort.clientWidth / 756);
    fwLive.style.transform = k < 1 ? 'scale(' + k + ')' : '';
  }

  /* --- Questions and the order's rules: native details; with motion the answer arrives (opacity and 6 px). --- */
  $$('details.q, details.rules').forEach(function (d) {
    var body = $('.qa, .rules-body', d);
    d.addEventListener('toggle', function () {
      if (!d.open || !motionOK() || !body || !body.animate) return;
      body.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    });
  });

  /* --- The nav and the contents marker. All read from one map of the page: which chapter of the coach's week is at 40%
     of the screen (the marker), and whether a page crimson action is on screen (then the nav's ink pill steps back;
     one crimson per screen). The bar is the app's dark glass over every chapter: the page is dark, whatever the
     visitor's theme. --- */
  var S = { acts: new Set(), log: false, heroHidden: false, stage: null };
  var toc = $('#toc'), tocBar = $('#tocBar'), tocLinks = $$('#toc a'), tocOn = -1;
  var chapters = [];
  function measurePage() {
    var y0 = window.scrollY;
    var r = function (el) { var b = el.getBoundingClientRect(); return [b.top + y0, b.bottom + y0]; };
    var staged = H.classList.contains('stage-on');
    chapters = tocLinks.map(function (l) {
      var id = l.dataset.ch;
      if (id === 'today') {
        if (staged && S.stage) return S.stage.today();
        var t = r($('#today')), w = r($('#who')); return [t[0], w[1]];
      }
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
    var heroIn = S.acts.has('heroCta') && !S.heroHidden;
    var anyAct = heroIn || S.acts.has('plansCta') || S.acts.has('closeCta');
    nav.classList.toggle('has-pill', !anyAct);
    H.classList.toggle('red-busy', S.log && heroIn);
    /* The contents marker: the chapter at 40% of the screen. */
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
  var navTick = false;
  function onScrollNav() { if (!navTick) { navTick = true; requestAnimationFrame(function () { navTick = false; paintNav(); }); } }
  if ('IntersectionObserver' in window) {
    var actIO = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) S.acts.add(e.target.id); else S.acts.delete(e.target.id); }); onScrollNav(); }, { rootMargin: '-64px 0px 0px 0px' });
    ['#heroCta', '#plansCta', '#closeCta'].forEach(function (s) { actIO.observe($(s)); });
    new IntersectionObserver(function (es) { es.forEach(function (e) { S.log = e.isIntersecting; }); onScrollNav(); }).observe($('#logBtn'));
  }
  /* "Today" on a laptop with motion sits inside the held act: its link lands on the moment the set arrives. */
  tocLinks.forEach(function (l) {
    l.addEventListener('click', function (e) {
      if (l.dataset.ch !== 'today' || !S.stage) return;
      e.preventDefault();
      window.scrollTo(0, S.stage.todayY());
      history.replaceState(null, '', '#today');
    });
  });
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

  /* --- The browser's bar stays the page's dark: the app (loaded for the account windows) sets theme-color by the
     visitor's theme (white for light), but this page is dark whatever the theme. The stored theme is never touched,
     so the inside pages keep following the visitor's setting. --- */
  window.addEventListener('themechange', function () { var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', '#0b0b0c'); });

  function relayout() { fitFw(); measurePage(); placeTocBar(); paintNav(); }
  relayout();
  window.addEventListener('scroll', onScrollNav, { passive: true });
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

  /* --- Numbers in the app's formats; a count runs from the shown value to the target. --- */
  function fmt(v, f) { return (f === 'plus' ? '+' : '') + Math.round(v); }
  function show(el, v) { el.textContent = fmt(v, el.dataset.fmt); }
  function fromVal(el) { show(el, Number(el.dataset.from)); }
  function count(tl, el, at, dur) {
    var a = Number(el.dataset.from), b = Number(el.dataset.to), o = { v: a };
    tl.fromTo(o, { v: a }, { v: b, duration: dur || 0.8, ease: OUT, onUpdate: function () { show(el, o.v); } }, at);
  }
  /* Two-state words: the old line leaves upward, the new one arrives from below. */
  function swapStart(el) { var k = el.children; for (var i = 0; i < k.length; i++) gsap.set(k[i], { autoAlpha: i === 0 ? 1 : 0 }); }
  function swapIn(tl, el, at) {
    var a = el.children[0], b = el.children[el.children.length - 1];
    tl.fromTo(a, { autoAlpha: 1, y: 0 }, { autoAlpha: 0, y: -4, duration: 0.16, ease: OUT, immediateRender: false }, at)
      .fromTo(b, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: OUT, immediateRender: false }, at + 0.1);
  }
  /* A state change: plays on the way down, plays back (faster) on the way up, from wherever it is. */
  function onState(tl, o) {
    return ST.create(Object.assign({ onEnter: function () { tl.timeScale(1).play(); }, onLeaveBack: function () { tl.timeScale(1.6).reverse(); } }, o));
  }
  /* A state change fired from a scrubbed timeline's time (inside a held scene). */
  function gate(tl) { var on = false; return function (p, at) { if (p >= at && !on) { on = true; tl.timeScale(1).play(); } else if (p < at && on) { on = false; tl.timeScale(1.6).reverse(); } }; }
  /* AVIF where it decodes (a one-pixel probe), WebP otherwise. */
  var AVIF = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  function avif(cb) { var p = new Image(); p.onload = function () { cb(true); }; p.onerror = function () { cb(false); }; p.src = AVIF; }

  /* =====================================================================
     ACT ONE. Shared by both layouts.
     ===================================================================== */
  var phone = $('#phone'), logB = $('#logBtn'), next = $('.ph-next', phone), phDim = $('#phDim');
  var labs = $$('.lab', phone), labCap = $('.lab-cap', phone);
  var max = $('#max'), maxTags = $('.max-tags', max), maxFrom = $('.max-from', max), strip = $('.odo-strip', max);
  var clipR = $('#maxClipR'), maxEnd = $('#maxEnd'), maxChart = $('.max-chart', max);
  var fly = $('#fly'), copy = $('#openCopy'), ltCap = $('#laptop-cap');
  /* The phone a moment later is only ever seen with motion: fetched once the score starts (decoded off the main thread). */
  avif(function (ok) { next.srcset = ok ? next.dataset.srcset : next.dataset.fallback; if (next.decode) next.decode().catch(function () {}); });
  /* The next chapters' pictures, decoded ahead so no frame waits on one mid-scroll. On a laptop they are fetched now; on a
     phone (often a slow line, and data) the browser's own lazy loading fetches each as the reader nears it. */
  function warm() { var eager = !small(); $$('#thread img, #wk img, #imp img, .cl img, .brand-ph img, #fwA img, .fw-b img').forEach(function (i) { if (eager && i.loading === 'lazy') i.loading = 'eager'; if (i.complete && i.decode) i.decode().catch(function () {}); }); }
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 1500 }); else setTimeout(warm, 600);

  /* M2 · Log set (a state change): the button presses and releases; the phone moves on as the app does (set 2 up,
     the rest timer docked). */
  gsap.set(next, { autoAlpha: 0 });
  var logTl = gsap.timeline({ paused: true })
    .to(logB, { scale: 0.97, duration: 0.11, ease: OUT }, 0)
    .to(logB, { scale: 1, duration: 0.28, ease: OUT }, 0.12)
    .to(next, { autoAlpha: 1, duration: 0.22, ease: OUT }, 0.16);
  /* M3 · The max (a state change once it is read): the 16-week line is drawn to last week; only the last digit rolls,
     223 to 228, while the line climbs to the new point; +5 kg and New PR land, then the set it came from. */
  gsap.set([maxTags, maxFrom], { autoAlpha: 0, y: 8 });
  gsap.set(strip, { y: 0 });
  gsap.set(clipR, { attr: { width: 93.6 } });
  var endFrom = function () { return { x: -(98 - 91.6) / 100 * maxChart.offsetWidth, y: (29.73 - 17.55) / 100 * maxChart.offsetHeight }; };
  gsap.set(maxEnd, { x: function () { return endFrom().x; }, y: function () { return endFrom().y; } });
  var maxTl = gsap.timeline({ paused: true })
    .to(strip, { y: function () { return -5 * strip.firstElementChild.offsetHeight; }, duration: 0.8, ease: OUT }, 0)
    .to(clipR, { attr: { width: 104 }, duration: 0.6, ease: INOUT }, 0)
    .to(maxEnd, { x: 0, y: 0, duration: 0.6, ease: INOUT }, 0)
    .to(maxTags, { autoAlpha: 1, y: 0, duration: 0.3, ease: OUT }, 0.46)
    .to(maxFrom, { autoAlpha: 1, y: 0, duration: 0.3, ease: OUT }, 0.58);

  /* M1 · The labels (a state change once the set card is in view): each leader draws out from the card's edge, then
     its words arrive. Laptops only; on tablets and phones the legend is plain text beside or above the phone. */
  var labTl = gsap.timeline({ paused: true });
  function buildLabels() {
    labTl.clear();
    gsap.set(labCap, { autoAlpha: 0, x: -6 });
    labs.forEach(function (l) { gsap.set($('.lab-l', l), { scaleX: 0 }); gsap.set($('.lab-t', l), { autoAlpha: 0, x: -6 }); });
    labTl.to(labCap, { autoAlpha: 1, x: 0, duration: 0.3, ease: OUT }, 0);
    labs.forEach(function (l, i) {
      labTl.to($('.lab-l', l), { scaleX: 1, duration: 0.32, ease: OUT }, 0.1 + i * 0.07)
        .to($('.lab-t', l), { autoAlpha: 1, x: 0, duration: 0.28, ease: OUT }, 0.18 + i * 0.07);
    });
  }

  /* M5 · The landing (a state change as the set arrives): the squat card is ringed once, every number that changed
     counts from its old value, the old marks give way, the set line changes, the PR mark arrives. */
  function landingTl(scope, ring) {
    var nums = $$('.num', scope), was = $$('.was', scope), pr = $('.ov-pr', scope), swaps = $$('.ov.swap', scope);
    nums.forEach(fromVal);
    gsap.set(was, { opacity: 1 });
    gsap.set(pr, { autoAlpha: 0, scale: 0.9, transformOrigin: '0% 50%' });
    swaps.forEach(swapStart);
    var tl = gsap.timeline({ paused: true })
      .fromTo(ring, { opacity: 0, scale: 0.985 }, { opacity: 1, scale: 1, duration: 0.24, ease: OUT }, 0)
      .to(ring, { opacity: 0, duration: 0.9, ease: INOUT }, 0.85)
      .to(was, { opacity: 0, duration: 0.5, ease: OUT }, 0.12)
      .to(pr, { autoAlpha: 1, scale: 1, duration: 0.36, ease: OUT }, 0.62);
    nums.forEach(function (el, i) { count(tl, el, 0.1 + i * 0.035, 0.8); });
    swaps.forEach(function (el, i) { swapIn(tl, el, 0.16 + i * 0.05); });
    return tl;
  }

  var mm = gsap.matchMedia();
  /* The held act starts from the top of the page: a reader already part-way down when this layer arrives (a slow
     connection) keeps the flow, so nothing under them jumps. */
  mm.add({ stage: '(min-width: 1100px) and (min-height: 640px)', flow: '(max-width: 1099px), (max-height: 639px)' }, function (ctx) {
    if (ctx.conditions.stage && window.scrollY < vhOf() * 0.35) return buildStage();
    return buildFlow();
  });

  /* =====================================================================
     ACT ONE ON A LAPTOP: the stage. The act holds the screen and the reader's scroll moves one camera: both sides on
     a desk; in on the lifter's phone; the set lifts off and flies to Sam's laptop as the laptop turns to face the
     reader; the camera pushes in on its window while the laptop's own dark screen grows to fill the frame and becomes
     the page (the coach's graphite); the window holds Arjun's page at its real size; then a pan along the same screen
     to the lifters who need Sam first.
     ===================================================================== */
  function buildStage() {
    H.classList.add('stage-on');
    var stage = $('#stage'), laptop = $('#laptop'), cam = $('#ltCam'), ltShadow = $('.lt-shadow'), win = $('#win'), winIn = $('#winIn'), winShadow = $('#winShadow');
    var room = $('#ltRoom'), devParts = [$('.lt-lid'), $('.lt-base'), $('#ltScreen')];
    var phShadow = $('.ph-shadow'), land = $('#today'), who = $('#who'), chainItems = $$('#chain li');
    var grps = $$('#win .grp'), mks = $$('#win .mk'), sqRing = $('#sqRing');
    var G, vw, vh, g = {};
    /* Where everything stands at each beat, for this screen (the first frame matches the stylesheet's exactly). */
    function measure() {
      vw = vwOf(); vh = vhOf(); G = clamp(16, 64, vw * 0.0445);
      var fw = Math.min(vw, 1440), fx = (vw - fw) / 2, R = fx + fw;
      var fold = Math.max(640, vh);
      g.lw0 = fw * 0.49; g.s0 = g.lw0 / 1440; g.lx0 = R - G - fw * 0.012 - g.lw0; g.ly0 = 120;
      g.pw = Math.min(393, fw * 0.273); g.p0 = g.pw / 393; g.px0 = fx + fw * 0.417; g.py0 = fold - g.pw * 2.16794 * 0.42;
      g.p2 = Math.min(0.8, (vh - 64 - 40) / 852);
      g.maxW = Math.min(470, fw * 0.33);
      g.px2 = fx + G + g.maxW + 64; g.py2 = 64 + (vh - 64 - 852 * g.p2) / 2;
      /* The laptop turned away and gone back, most of it past the right edge, so the labels read on the dark. */
      g.s2 = g.s0 * 0.62; g.lx2 = Math.max(R - G - 1440 * g.s2 * 0.42, vw - 1440 * g.s2 * 0.42 - G); g.ly2 = 64 + (vh - 64 - 900 * g.s2) / 2 - 10;
      g.textW = Math.min(500, fw * 0.36);
      g.k = Math.min(1, (fw - 2 * G - g.textW - 64) / 756, (vh - 64 - 64) / 576);
      g.wx = R - G - 756 * g.k; g.wy = 64 + (vh - 64 - 576 * g.k) / 2;
      /* Facing the reader again at the first frame's size, its window already where the push-in will hold it. */
      g.s25 = g.s0; g.wx25 = g.wx; g.wy25 = g.wy + 24;
      gsap.set(max, { width: g.maxW });
      gsap.set(max, { y: Math.max(84, (vh - max.offsetHeight) / 2 + 18) });
      gsap.set([land, who], { width: g.textW });
      /* The order's rules open as a card over the whole chain they explain. */
      who.style.setProperty('--chain-h', $('#chain').offsetHeight + 'px');
      /* The laptop's caption over its lid, at its left edge (as in the stylesheet's first frame). */
      gsap.set(ltCap, { x: g.lx0, y: g.ly0 - 26 * g.s0 - 12 - ltCap.offsetHeight });
    }
    /* The camera: which desk point (fx, fy) sits at which screen point (vx, vy), at scale s, turned ry / rx. */
    var C = { vx: 0, vy: 0, fx: 0, fy: 0, s: 1, ry: 0, rx: 0, o: 1 };
    var P = { x: 0, y: 0, s: 1, ry: 0, o: 1 };   // the phone
    var D = { body: 1, win: 0, dim: 0 };          // the device falling away round its window; the phone stepping back
    var W = { t: 0 };                             // the screen growing out to fill the frame
    var pan = { t: 0 };                           // the pan along the screen to the list
    var PX = 440, PY = 130;
    var lastRoom = '';
    function render() {
      var fx = C.fx - PX * pan.t, fy = C.fy + PY * pan.t, s = C.s;
      var x = C.vx - fx * s, y = C.vy - fy * s;
      cam.style.transform = 'translate3d(' + (x + 720 * s) + 'px,' + (y + 450 * s) + 'px,0) rotateY(' + C.ry + 'deg) rotateX(' + C.rx + 'deg) scale(' + s + ') translate(-720px,-450px)';
      cam.style.opacity = C.o;
      win.style.transform = 'translate(' + (-PX * pan.t) + 'px,' + (PY * pan.t) + 'px)';
      winShadow.style.transform = win.style.transform;
      winIn.style.transform = 'translate(' + (-(668 - PX * pan.t)) + 'px,' + (-(16 + PY * pan.t)) + 'px)';
      for (var i = 0; i < devParts.length; i++) devParts[i].style.opacity = D.body;
      ltShadow.style.opacity = Math.min(D.body, C.o);
      winShadow.style.opacity = D.win;
      phDim.style.opacity = D.dim;
      /* The wipe: the room starts as the screen itself (its corners, its lit rim) and grows until it is the page (the
         camera is square-on by now). */
      var css;
      if (W.t <= 0) css = 'hidden';
      else {
        var e = INOUT(W.t), pad = 6 / s;
        var rx = lerp(0, -x / s - pad, e), ry = lerp(0, -y / s - pad, e), rw = lerp(1440, vw / s + 2 * pad, e), rh = lerp(900, vh / s + 2 * pad, e);
        room.style.transform = 'translate(' + rx + 'px,' + ry + 'px) scale(' + (rw / 1440) + ',' + (rh / 900) + ')';
        css = 'visible';
      }
      if (css !== lastRoom) { room.style.visibility = css; lastRoom = css; }
      phone.style.transform = 'translate3d(' + (P.x + 196.5 * P.s) + 'px,' + (P.y + 426 * P.s) + 'px,0) rotateY(' + P.ry + 'deg) scale(' + P.s + ') translate(-196.5px,-426px)';
      phone.style.opacity = P.o;
    }
    var K = {};
    function keys() {
      K.c0 = { vx: g.lx0, vy: g.ly0, fx: 0, fy: 0, s: g.s0, ry: 0, rx: 0, o: 1 };
      K.c2 = { vx: g.lx2, vy: g.ly2, fx: 0, fy: 0, s: g.s2, ry: -24, rx: 1, o: 0.3 };
      K.c25 = { vx: g.wx25, vy: g.wy25, fx: 668, fy: 16, s: g.s25, ry: 0, rx: 0, o: 1 };
      K.c3 = { vx: g.wx, vy: g.wy, fx: 668, fy: 16, s: g.k, ry: 0, rx: 0, o: 1 };
      K.p0 = { x: g.px0, y: g.py0, s: g.p0, ry: 0, o: 1 };
      K.p2 = { x: g.px2, y: g.py2, s: g.p2, ry: 0, o: 1 };
      K.p3 = { x: g.px2 - 140, y: g.py2 + vh * 0.46, s: g.p2 * 0.86, ry: 7, o: 0 };
    }
    measure(); keys();
    Object.assign(C, K.c0); Object.assign(P, K.p0); render();
    /* The arrival settle is the stylesheet's: it plays from the first paint, and this layer loads only once it has
       finished, so the camera starts from exactly where the devices came to rest. */
    gsap.set(phone, { transformOrigin: '0 0' });
    cam.style.willChange = 'transform'; phone.style.willChange = 'transform, opacity'; room.style.willChange = 'transform';

    /* The window's live screen: the same capture with the changing numbers left out, sharp at its real size. */
    var winBase = $('.win-base', win), dpr = window.devicePixelRatio || 1;
    avif(function (ok) {
      var big = dpr >= 1.5;
      winBase.src = big ? (ok ? winBase.dataset.avif : winBase.dataset.src) : (ok ? winBase.dataset.avif1 : winBase.dataset.src1);
      var done = function () { winBase.classList.add('is-ready'); win.classList.add('is-live'); };
      if (winBase.decode) winBase.decode().then(done, done); else winBase.onload = done;
      $$('.was', win).forEach(function (w) { if (w.dataset.src) w.src = w.dataset.src; });
    });

    /* Before-states for this layout. */
    buildLabels();
    var deskTl = landingTl(win, sqRing);
    gsap.set(max, { autoAlpha: 0, x: -24 });
    gsap.set([land, who], { autoAlpha: 0 });
    gsap.set(grps, { opacity: 0 }); gsap.set(mks, { autoAlpha: 0, scale: 0.6 });
    gsap.set(chainItems, { opacity: 0.32 });
    gsap.set(fly, { autoAlpha: 0 });
    var landKids = $$('.h2, .sub, .cap', land), whoKids = [$('.h2', who), $('.sub', who), $('#rules')];

    /* The landing's words, a state change as the set touches down: the headline, then its line, then the caption. */
    var landTl = gsap.timeline({ paused: true })
      .set(land, { autoAlpha: 1 }, 0)
      .fromTo(landKids, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.08, ease: OUT, immediateRender: false }, 0.02);
    /* The list's words, and the order explained on the real list: a ring round each group, its number, its fix. */
    var whoTl = gsap.timeline({ paused: true })
      .set(who, { autoAlpha: 1 }, 0)
      .fromTo(whoKids, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.42, stagger: 0.08, ease: OUT, immediateRender: false }, 0.02);
    chainItems.forEach(function (li, i) {
      var at = 0.3 + i * 0.12, mk = li.dataset.mk;
      whoTl.to(li, { opacity: 1, duration: 0.3, ease: OUT }, at)
        .to(mks.filter(function (m) { return m.dataset.mk === mk; }), { autoAlpha: 1, scale: 1, duration: 0.3, ease: OUT }, at)
        .fromTo(grps.filter(function (m) { return m.dataset.mk === mk; }), { opacity: 0 }, { opacity: 1, duration: 0.3, ease: OUT, immediateRender: false }, at)
        .to(grps.filter(function (m) { return m.dataset.mk === mk; }), { opacity: 0.12, duration: 0.5, ease: INOUT }, at + 0.5);
    });
    var pressGate = gate(logTl), maxGate = gate(maxTl), labGate = gate(labTl), deskGate = gate(deskTl), landGate = gate(landTl), whoGate = gate(whoTl);

    /* The set in flight. First it lifts straight up off the phone (the screen under it steps back, so no two sets'
       numbers share a frame), then it is carried along an arc and set down on the squat card in the window. Its two
       ends are wherever the camera has them this frame. */
    var F = { p: 0 };
    function placeFly() {
      var p = F.p;
      if (p <= 0 || p >= 1) { if (fly.style.visibility !== 'hidden') gsap.set(fly, { autoAlpha: 0 }); return; }
      var fw = fly.offsetWidth, fh = fly.offsetHeight;
      var sx = P.x + 196 * P.s, sy = P.y + 236 * P.s;
      var s = C.s, cfx = C.fx - PX * pan.t, cfy = C.fy + PY * pan.t;
      var ex = C.vx + (800.7 - cfx) * s, ey = C.vy + (498 - cfy) * s;
      var up = smooth(p / 0.16) * 84;                         // the lift
      var q = clamp(0, 1, (p - 0.1) / 0.9), e = INOUT(q);    // the carry
      var x = lerp(sx, ex, e), y = lerp(sy - up, ey, e) - Math.sin(Math.PI * q) * 70;
      var k0 = P.s * 1.06, k1 = clamp(0.5, 1, 233 * s / fw);
      var k = lerp(k0, k1, smooth((q - 0.55) / 0.45)) * (1 + 0.05 * Math.sin(Math.PI * q));
      var rot = (ex - sx) * 0.005 * Math.sin(Math.PI * q);
      gsap.set(fly, { x: x - fw / 2, y: y - fh / 2, scale: k, rotation: rot, autoAlpha: p > 0.95 ? (1 - p) / 0.05 : 1 });
    }

    /* The master: one timeline the reader's scroll plays (units; the act is 10.1 long). State changes inside the held
       act fire from the timeline's own time (it is scrubbed, so it settles a moment after the reader stops). */
    var ROOM_AT = 5.7;
    var tl = gsap.timeline({ paused: true, defaults: { ease: 'none' }, onUpdate: function () {
      render(); placeFly();
      var t = tl.time();
      labGate(t, 1.6); pressGate(t, 2.15); maxGate(t, 2.35); deskGate(t, 6.0); landGate(t, 6.1); whoGate(t, 8.3);
      var hh = t > 0.6; if (hh !== S.heroHidden) { S.heroHidden = hh; onScrollNav(); }
    } });
    /* B0 → B1: the words step aside, the camera moves in on the lifter's phone; the laptop turns away and recedes. */
    tl.to([copy, ltCap], { y: -60, duration: 0.65, ease: INOUT }, 0.25)
      .to($('.h1', copy), { opacity: 0, duration: 0.65, ease: INOUT }, 0.25)
      .to([$('.lede', copy), $('#heroCta'), $('.cta-note', copy), ltCap], { autoAlpha: 0, duration: 0.65, ease: INOUT }, 0.25)
      .to(C, { vx: function () { return K.c2.vx; }, vy: function () { return K.c2.vy; }, s: function () { return K.c2.s; }, ry: -24, rx: 1, o: 0.3, duration: 1.7, ease: INOUT }, 0.3)
      .to(P, { x: function () { return K.p2.x; }, y: function () { return K.p2.y; }, s: function () { return K.p2.s; }, ry: 0, duration: 1.55, ease: INOUT }, 0.45)
      .to(phShadow, { opacity: 0.6, duration: 1.7 }, 0.3)
    /* B2: the max arrives where the words were; the reader holds on it. */
      .to(max, { autoAlpha: 1, x: 0, duration: 0.5, ease: OUT }, 2.2)
    /* B3: the set lifts off and flies; the phone steps back and leaves; the laptop turns to face the reader, then the
       camera pushes in on its window while its screen grows out to fill the frame and the device falls away. */
      .to([max, labs, labCap], { autoAlpha: 0, duration: 0.5, ease: OUT }, 3.5)
      .to('.glow-top', { opacity: 0, duration: 0.8, ease: OUT }, 3.6)
      .fromTo(F, { p: 0 }, { p: 1, duration: 2.4, ease: 'none', immediateRender: false }, 3.6)
      .to(D, { dim: 0.66, duration: 0.35, ease: OUT }, 3.6)
      .to(P, { x: function () { return K.p3.x; }, y: function () { return K.p3.y; }, s: function () { return K.p3.s; }, ry: 7, duration: 1.25, ease: INOUT }, 3.85)
      .to(P, { o: 0, duration: 0.8, ease: OUT }, 4.0)
      .to(C, { vx: function () { return K.c25.vx; }, vy: function () { return K.c25.vy; }, fx: 668, fy: 16, s: function () { return K.c25.s; }, ry: 0, rx: 0, o: 1, duration: 1.1, ease: INOUT }, 3.8)
      .to(C, { vx: function () { return K.c3.vx; }, vy: function () { return K.c3.vy; }, s: function () { return K.c3.s; }, duration: 1.2, ease: INOUT }, 4.9)
      .to(W, { t: 1, duration: 0.8, ease: 'none' }, 5.15)
      .to(D, { body: 0, duration: 0.7, ease: INOUT }, 5.5)
      .to(D, { win: 1, duration: 0.4, ease: OUT }, 5.8)
    /* B4: the landing's words step up; the camera pans along the same screen to the list; its words arrive. */
      .to(land, { y: function () { return landY() - 70; }, autoAlpha: 0, duration: 0.6, ease: INOUT }, 7.3)
      .fromTo(pan, { t: 0 }, { t: 1, duration: 1.5, ease: INOUT, immediateRender: false }, 7.4)
      .to({}, { duration: 1.2 }, 8.9);
    var landY = function () { return g.wy + (576 * g.k - land.offsetHeight) / 2; };
    var whoY = function () { return g.wy + (576 * g.k - who.offsetHeight) / 2; };
    gsap.set(land, { y: landY }); gsap.set(who, { y: whoY });

    var LEN = function () { return Math.round(vhOf() * 3.7); };
    var st = ST.create({
      trigger: stage, start: 'top top', end: function () { return '+=' + LEN(); }, pin: true, anticipatePin: 1, scrub: 0.6, animation: tl, invalidateOnRefresh: true,
      onRefresh: function () { measure(); keys(); gsap.set(land, { y: landY }); gsap.set(who, { y: whoY }); tl.invalidate(); render(); }
    });
    var T = function () { return tl.duration(); };
    S.stage = {
      /* "Today" is on screen from the moment the screen has grown into the room to the end of the act. */
      today: function () { var a = st.start, L = st.end - st.start, b = $('#top').getBoundingClientRect().bottom + window.scrollY; return [a + L * (ROOM_AT / T()), b]; },
      todayY: function () { return Math.round(st.start + (st.end - st.start) * (6.6 / T())); }
    };
    window.__fxStage = { st: st, tl: tl };
    return function () {
      H.classList.remove('stage-on'); S.stage = null; S.heroHidden = false;
      [cam, win, winIn, winShadow, phone, ltShadow, phShadow, phDim, room, max, land, who, copy, ltCap, fly, $('.glow-top')].concat(devParts).forEach(function (el) { if (el) el.removeAttribute('style'); });
    };
  }

  /* =====================================================================
     ACT ONE IN THE FLOW (tablets, phones, short laptops): the same moments, as the page reads top to bottom.
     ===================================================================== */
  function buildFlow() {
    if (vwOf() >= 1100) {
      buildLabels();
      onState(labTl, { trigger: phone, start: function () { return 'top+=' + Math.round(phone.offsetHeight * 233 / 852) + ' 66%'; } });
    }
    var logStart = function () { return Math.max(40, docTop(logB) + logB.offsetHeight / 2 - vhOf() * (small() ? 0.62 : 0.5)); };
    onState(logTl, { start: logStart, end: 'max' });
    onState(maxTl, { trigger: '.max-num', start: function () { return small() ? 'top 72%' : 'top 70%'; } });

    /* The set's crossing (scrubbed): from the phone to the squat card in the window onto Sam's laptop below. */
    var ring = $('#fwRing'), fwTl = landingTl(fwLive, ring), F = { p: 0 };
    function placeFly() {
      var p = F.p, a = phone.getBoundingClientRect(), b = ring.getBoundingClientRect();
      var fw = fly.offsetWidth, fh = fly.offsetHeight;
      var sx = a.left + a.width * (196 / 393), sy = a.top + a.height * (236 / 852);
      var ex = b.left + b.width / 2, ey = b.top + b.height / 2;
      var e = INOUT(p), arc = (small() ? 0 : 60) * Math.sin(Math.PI * p);
      var end = clamp(0.5, 1, b.width / fw), k = 1 + (end - 1) * clamp(0, 1, (p - 0.7) / 0.3);
      gsap.set(fly, { x: sx + (ex - sx) * e - fw / 2 + arc, y: sy + (ey - sy) * e - fh / 2, scale: k });
    }
    var crossStart = function () { return Math.max(logStart() + 160, docTop(maxFrom) + maxFrom.offsetHeight - vhOf() * 0.5); };
    var crossEnd = function () { var b = ring.getBoundingClientRect(); return Math.max(crossStart() + 320, b.top + window.scrollY + b.height / 2 - vhOf() * 0.55); };
    var crossTl = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { start: crossStart, end: crossEnd, scrub: 0.5, invalidateOnRefresh: true } })
      .fromTo(F, { p: 0 }, { p: 1, duration: 1, onUpdate: placeFly }, 0)
      .fromTo(fly, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.015 }, 0)
      .to(fly, { autoAlpha: 0, duration: 0.015 }, 0.985);
    var landST = onState(fwTl, { start: crossEnd, end: 'max' });
    return function () { gsap.set(fly, { autoAlpha: 0 }); if (crossTl.scrollTrigger) crossTl.scrollTrigger.kill(); crossTl.kill(); landST.kill(); };
  }

  /* =====================================================================
     ANSWERS: Sam reads the set ("Sent" becomes "Seen"), then his reply arrives under it, the way a message lands.
     ===================================================================== */
  var sent = $('.tl-sent'), seen = $('.tl-seen'), reply = $('#reply');
  gsap.set(seen, { autoAlpha: 0 });
  gsap.set(reply, { autoAlpha: 0, y: 18 });
  var replyTl = gsap.timeline({ paused: true })
    .to(sent, { autoAlpha: 0, duration: 0.18, ease: OUT }, 0)
    .to(seen, { autoAlpha: 1, duration: 0.3, ease: OUT }, 0.08)
    .to(reply, { autoAlpha: 1, y: 0, duration: 0.42, ease: OUT }, 0.5);
  onState(replyTl, { trigger: '#thread', start: function () { return small() ? 'top 40%' : 'top 30%'; } });

  /* =====================================================================
     NEXT WEEK: the suggestion Sam's own rule wrote is taken (bench 155 to 145), then Publish arrives: the one crimson
     here. Nothing reaches Marcus until Sam sends it. On phones the reader's scroll first pans along the true-size row.
     ===================================================================== */
  var wkBefore = $('.wk-before'), wkTap = $('#wkTap'), pub = $('#pub'), pubT = $('.wk-pub-t');
  gsap.set([pub, pubT], { autoAlpha: 0 });
  gsap.set(pub, { scale: 0.94, transformOrigin: '0% 50%' });
  var takeTl = gsap.timeline({ paused: true })
    .fromTo(wkTap, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.18, ease: OUT }, 0)
    .to(wkBefore, { autoAlpha: 0, duration: 0.32, ease: OUT }, 0.2)
    .to(wkTap, { opacity: 0, duration: 0.4, ease: OUT }, 0.42)
    .to(pub, { autoAlpha: 1, scale: 1, duration: 0.34, ease: OUT }, 0.62)
    .to(pubT, { autoAlpha: 1, duration: 0.3, ease: OUT }, 0.74);
  var wkIn = $('#wkIn'), wkPort = $('#wkPort');
  mm.add({ phoneW: '(max-width: 759px)', wideW: '(min-width: 760px)' }, function (ctx) {
    if (ctx.conditions.phoneW) {
      gsap.timeline({ scrollTrigger: { trigger: wkPort, start: 'top 82%', end: 'top 30%', scrub: 0.5, invalidateOnRefresh: true } })
        .fromTo(wkIn, { x: 0 }, { x: function () { var cs = getComputedStyle(wkPort); return -(wkIn.offsetWidth - (wkPort.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))); }, ease: 'none', duration: 1 });
      onState(takeTl, { trigger: wkPort, start: 'top 30%' });
    } else {
      onState(takeTl, { trigger: wkPort, start: 'bottom 90%' });
    }
  });

  /* =====================================================================
     MEET DAY: the striking moment. On a laptop the stage holds the screen (sticky) for the whole run: the camera
     starts close on the dark lights while the room around them goes dark; all three turn white in one frame; Sam marks
     it and Tom's phone wakes with his next attempt; the camera pulls back to the team; the platform's minute runs;
     the call. On smaller screens the stage scrolls and the same beats run from the lights to the Declare.
     ===================================================================== */
  var meet = $('#meet'), scene = $('#scene'), judgesBox = $('#judges'), judges = $$('#judges i');
  var cell1 = $('#cell1'), cell2 = $('#cell2'), dec = $('#decBtn'), beats = $$('#beats .beat');
  var clockN = $('#clockN'), clockBar = $('#clockBar'), mpOn = $('#mpOn');
  var dimmed = $$('#meet .mdim');
  /* The platform before the lights: Tom's opener on the bar, the lights dark, the minute not started, the planned next
     attempt waiting on the board and on his phone (asleep in his hand). */
  judges.forEach(function (i) { i.classList.add('is-off'); });
  judgesBox.setAttribute('aria-label', 'The three lights, not on yet');
  gsap.set('#verdict', { autoAlpha: 0, y: 6 });
  gsap.set('#clock', { autoAlpha: 0 });
  [$('#slabOut'), $('#slabDec'), cell1, cell2, $('.swap', dec)].forEach(swapStart);
  var red = document.createElement('span'); red.className = 'dec-red'; red.setAttribute('aria-hidden', 'true'); dec.insertBefore(red, dec.firstChild);
  gsap.set(red, { opacity: 0 });
  gsap.set('#meetCap', { autoAlpha: 0, y: 8 });
  gsap.set(mpOn, { autoAlpha: 0 });
  function clockText(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function setClock(s) { var t = clockText(s); if (clockN.textContent !== t) clockN.textContent = t; }
  setClock(60);
  gsap.set(clockBar, { scaleX: 1 });
  function beatTo(n) { beats.forEach(function (b, i) { b.classList.toggle('is-on', i <= n); }); }
  beatTo(0);

  /* M · The lights (a state change after the held beat): all three white in one frame. The board marks it good, Tom's
     phone wakes with his next attempt, the minute starts on the platform, and Declare turns crimson. */
  var lightsTl = gsap.timeline({ paused: true })
    .add(function () { var on = !lightsTl.reversed(); judges.forEach(function (i) { i.classList.toggle('is-off', !on); }); judgesBox.setAttribute('aria-label', on ? 'Three white lights: a good lift' : 'The three lights, not on yet'); }, 0.001)
    .to('#verdict', { autoAlpha: 1, y: 0, duration: 0.32, ease: OUT }, 0.08)
    .to('#clock', { autoAlpha: 1, duration: 0.3, ease: OUT }, 0.26)
    .to(red, { opacity: 1, duration: 0.24, ease: OUT }, 0.34)
    .to(mpOn, { autoAlpha: 1, duration: 0.42, ease: OUT }, 0.3);
  swapIn(lightsTl, cell1, 0.18);
  /* M · The minute (scrubbed): 1:00 runs down to 0:41 on the platform's clock as the reader scrolls, its bar draining.
     (The app's board and the lifter's card show no countdown; the minute is the platform's.) */
  var minute = { s: 60 };
  var minuteTl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
    .to(minute, { s: 41, duration: 1, onUpdate: function () { setClock(minute.s); } }, 0)
    .to(clockBar, { scaleX: 41 / 60, duration: 1 }, 0);
  /* M · The call (a state change at 0:41): Declare presses and settles to Declared; the board's 2nd fills; on Tom's
     phone it drops "not declared yet" and he is one out. The choice locks, as it does on the day. */
  var callTl = gsap.timeline({ paused: true })
    .add(function () { lock(!callTl.reversed()); }, 0.001)
    .to(dec, { scale: 0.97, duration: 0.11, ease: OUT }, 0)
    .to(dec, { scale: 1, duration: 0.28, ease: OUT }, 0.12)
    .to(red, { opacity: 0, duration: 0.24, ease: OUT }, 0.08)
    .fromTo('#slab', { boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.07)' }, { boxShadow: '0 0 0 2px rgba(52, 217, 130, 0.85)', duration: 0.3, ease: OUT, immediateRender: false }, 0.3)
    .to('#slab', { boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.07)', duration: 0.8, ease: INOUT }, 1.1)
    .to('#meetCap', { autoAlpha: 1, y: 0, duration: 0.36, ease: OUT }, 0.5);
  swapIn(callTl, $('.swap', dec), 0.08);
  swapIn(callTl, cell2, 0.16);
  swapIn(callTl, $('#slabDec'), 0.3);
  swapIn(callTl, $('#slabOut'), 0.36);
  var litGate = gate(lightsTl), callGate = gate(callTl);

  mm.add({ held: '(min-width: 1100px) and (min-height: 700px)', open: '(max-width: 1099px), (max-height: 699px)' }, function (ctx) {
    if (ctx.conditions.held) {
      /* The camera, round the lights: in close while the room goes dark, then back to the whole team. */
      /* Its origin: the lights' middle across, the meet's name down, so the name holds still under the headline. */
      var focus = function () { var j = judgesBox.getBoundingClientRect(), m = $('.stage-meta').getBoundingClientRect(), s = scene.getBoundingClientRect(); return (j.left + j.width / 2 - s.left) + 'px ' + (m.top - s.top) + 'px'; };
      var camTl = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
        .fromTo(scene, { scale: 1 }, { scale: 1.26, duration: 0.07, ease: INOUT, immediateRender: false }, 0)
        .fromTo(dimmed, { opacity: 0 }, { opacity: 0.93, duration: 0.07, ease: INOUT, immediateRender: false }, 0)
        .to(scene, { scale: 1, duration: 0.2, ease: INOUT }, 0.15)
        .to(dimmed, { opacity: 0, duration: 0.18, ease: INOUT }, 0.17)
        .to({}, { duration: 0.65 }, 0.35);
      var run = ST.create({
        trigger: meet, start: 'top top', end: 'bottom bottom', invalidateOnRefresh: true,
        onRefresh: function () { gsap.set(scene, { clearProps: 'transform' }); gsap.set(scene, { transformOrigin: focus() }); camTl.invalidate(); },
        onUpdate: function (st) {
          var p = st.progress;
          gsap.to(camTl, { progress: p, duration: 0.4, ease: OUT, overwrite: true });
          litGate(p, 0.115);
          gsap.to(minuteTl, { progress: clamp(0, 1, (p - 0.3) / 0.44), duration: 0.4, ease: OUT, overwrite: true });
          callGate(p, 0.8);
          beatTo(p < 0.115 ? 0 : p < 0.52 ? 1 : 2);
        }
      });
      gsap.set(scene, { transformOrigin: focus(), willChange: 'transform' });
      return function () { run.kill(); camTl.progress(0).kill(); gsap.set(scene, { clearProps: 'transform,willChange' }); gsap.set(dimmed, { clearProps: 'opacity' }); };
    }
    var s0 = function () { return docTop(judges[0]) - vhOf() * 0.72; };
    var s1 = function () { return Math.max(s0() + 240, docTop(dec) - vhOf() * 0.62); };
    var flow = ST.create({ start: s0, end: s1, invalidateOnRefresh: true, onUpdate: function (st) {
      var p = st.progress;
      litGate(p, 0.01);
      gsap.to(minuteTl, { progress: clamp(0, 1, (p - 0.04) / 0.86), duration: 0.35, ease: OUT, overwrite: true });
      callGate(p, 0.94);
      beatTo(p < 0.01 ? 0 : p < 0.5 ? 1 : 2);
    } });
    return function () { flow.kill(); };
  });

  /* =====================================================================
     MOVING OVER: each step's arrow draws from what you bring to what it becomes (a state change, as the step arrives).
     ===================================================================== */
  $$('#steps .step-i').forEach(function (s) {
    var paths = $$('.becomes svg path', s);
    gsap.set(paths, { strokeDasharray: 32, strokeDashoffset: 32 });
    var tl = gsap.timeline({ paused: true }).to(paths, { strokeDashoffset: 0, duration: 0.5, ease: OUT }, 0);
    onState(tl, { trigger: s, start: 'top 78%' });
  });

  /* =====================================================================
     PRICING: Sam's roster joins (scrubbed). The first three are free; as the reader scrolls the other seventeen take
     their seats, the plan they fall in lights, and the line under the scale reads the count and the price.
     ===================================================================== */
  var seats = $$('#scale .f:not(.f-open)'), bands = $$('#scale .band'), scN = $('#scN'), plan = $('#scPlan');
  var planKids = plan ? Array.prototype.slice.call(plan.children) : [];
  var shown = -1;
  seats.forEach(function (f) { f.dataset.i = f.textContent; });   // an open seat is empty: its initials come back as it fills
  function paintRoster(n) {
    if (n === shown) return; shown = n;
    seats.forEach(function (f, i) { var open = i >= n; f.classList.toggle('is-open', open); f.textContent = open ? '' : f.dataset.i; });
    var t = n <= 3 ? 0 : n <= 10 ? 1 : 2;
    bands.forEach(function (el, i) { el.classList.toggle('is-on', i === t); });
    scN.textContent = String(n);
    planKids.forEach(function (k, i) { k.style.visibility = i === t ? 'visible' : 'hidden'; });
  }
  paintRoster(3);
  ST.create({
    trigger: '#scale', start: function () { return small() ? 'top 80%' : 'top 90%'; }, end: function () { return small() ? 'bottom 40%' : 'bottom 62%'; },
    onUpdate: function (st) { paintRoster(3 + Math.round(st.progress * 17)); },
    onLeave: function () { paintRoster(20); }, onLeaveBack: function () { paintRoster(3); }
  });

  /* Every trigger refreshes in page order (the held act adds its scroll length above the later ones); the page map
     is re-read after each refresh. */
  ST.addEventListener('refresh', function () { measurePage(); paintNav(); });
  ST.sort(); ST.refresh();
  function refresh() { fitFw(); ST.sort(); ST.refresh(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  if (document.readyState === 'complete') requestAnimationFrame(refresh); else window.addEventListener('load', refresh);
  }
})();
