/* =====================================================================
   home.js — the homepage's page layer and its motion score (GSAP 3.15 + ScrollTrigger, vendored in vendor/).
   The website only: index.html's head script adds it outside the iPhone app, and loads GSAP after the page has loaded
   and its arrival (home.css, from the first paint) has finished.
   The page layer (the bar, its contents marker, one crimson per screen, the meet-day radio group, the questions) works
   without GSAP.
   The score (the owner, 31 Oct: a landing page that moves as it scrolls, never a held stage): every chapter is in the
   page's flow and complete at any scroll position; its motion plays in place as it arrives. Two kinds of moment:
   - a state change, played forward as its block arrives and back (faster) if the reader scrolls back above it:
     headlines rising word by word, lines and screens rising 12 to 40 px, lists building in their order, numbers
     counting from the old value to the new, a message arriving, a press;
   - a short scrubbed touch, tied to the reader's scroll: the depth between the laptop and the phone, the set's flight
     from Arjun's phone to his page, the window zooming from Sam's whole screen to Arjun's page, the week panning on
     a phone.
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
      body.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    });
  });

  /* --- The nav and the contents marker: which chapter of the coach's week is at 40% of the screen, and whether a page
     action is on screen (then the nav's ink pill steps back). The bar is the app's dark glass over every chapter. --- */
  var S = { acts: new Set(), decRed: false, setY: Infinity };   // setY: where the set's moment starts (the score sets it)
  var toc = $('#toc'), tocBar = $('#tocBar'), tocLinks = $$('#toc a'), tocOn = -1;
  var chapters = [];
  function measurePage() {
    var y0 = window.scrollY;
    var r = function (el) { var b = el.getBoundingClientRect(); return [b.top + y0, b.bottom + y0]; };
    chapters = tocLinks.map(function (l) {
      var id = l.dataset.ch;
      /* Today starts at its first words (on a laptop with motion they sit beside Arjun's phone, above the row). */
      if (id === 'today') { var t = r($('#today')), c = r($('.land-copy')), w = r($('#who')); return [Math.min(t[0], c[0]), w[1]]; }
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
     moment has begun, Publish on Sam's week, Declare on his board while it is crimson): while one is on screen, the
     page's Start buttons step back to ink. Before its moment, Log set steps back to the page's Start free (the opening
     keeps its crimson on a phone, where his phone already shows under it). Two of a kind on one screen: the one nearer
     the middle keeps the crimson. --- */
  var reds = [
    { el: $('#heroCta .act-btn'), app: false }, { el: $('#logBtn'), app: true, wait: function () { return window.scrollY < S.setY; } }, { el: $('#pub'), app: true },
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

  /* --- The browser's bar stays the page's dark: the app (loaded for the account windows) sets theme-color by the
     visitor's theme (white for light), but this page is dark whatever the theme. The stored theme is never touched,
     so the inside pages keep following the visitor's setting. --- */
  window.addEventListener('themechange', function () { var m = $('meta[name="theme-color"]'); if (m) m.setAttribute('content', '#0b0b0c'); });

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
  /* A state change: plays as its block arrives, back (faster) if the reader scrolls back above it. */
  function onState(tl, o) {
    return ST.create(Object.assign({
      onEnter: function () { if (booting) tl.progress(1); else tl.timeScale(1).play(); },
      onLeaveBack: function () { tl.timeScale(Math.max(1.6, tl.duration() / 0.9)).reverse(); }
    }, o));
  }
  /* Blocks rising into place in turn: 12 px and their opacity (screens a little further), never from scale 0. */
  function rise(targets, o) {
    o = o || {};
    targets = (targets || []).filter(Boolean);
    if (!targets.length) return null;
    var tl = gsap.timeline({ paused: true })
      .fromTo(targets, { autoAlpha: 0, y: o.y || 12 }, { autoAlpha: 1, y: 0, duration: o.dur || 0.64, stagger: o.stagger == null ? 0.07 : o.stagger, ease: ENTER });
    onState(tl, { trigger: o.trigger || targets[0], start: o.start || 'top 90%' });
    return tl;
  }
  /* A headline rising word by word: whole words (a no-break space keeps its pair), so the lines break where they did. */
  function splitWords(el) {
    if (!el) return [];
    if (el.dataset.split) return $$('.w', el);
    var out = [];
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType !== 3) return;
      var frag = document.createDocumentFragment();
      n.textContent.split(/( +)/).forEach(function (p) {
        if (!p) return;
        if (/^ +$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
        var s = document.createElement('span'); s.className = 'w'; s.textContent = p; frag.appendChild(s); out.push(s);
      });
      el.replaceChild(frag, n);
    });
    el.dataset.split = '1';
    return out;
  }
  function words(el, o) { return el ? rise(splitWords(el), Object.assign({ trigger: el, stagger: 0.05, dur: 0.6 }, o || {})) : null; }
  /* AVIF where it decodes (a one-pixel probe), WebP otherwise. */
  var AVIF = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  function avif(cb) { var p = new Image(); p.onload = function () { cb(true); }; p.onerror = function () { cb(false); }; p.src = AVIF; }

  /* =====================================================================
     ACT ONE: the set. Arjun logs it on his phone, the app works out his max beside it, the set flies to his page on
     Sam's laptop; the window zooms from Sam's whole screen to Arjun's page; his total ticks up.
     ===================================================================== */
  var phone = $('#phone'), logB = $('#logBtn'), next = $('.ph-next', phone), laptop = $('#laptop');
  var max = $('#max'), maxTags = $('.max-tags', max), strip = $('.odo-strip', max);
  var clipR = $('#maxClipR'), maxEnd = $('#maxEnd'), maxChart = $('.max-chart', max);
  var fly = $('#fly'), ring = $('#fwRing'), ringRect = $('#fwRing rect');
  /* The phone a moment later is only ever seen with motion: fetched once the score starts (decoded off the main thread). */
  avif(function (ok) { next.srcset = ok ? next.dataset.srcset : next.dataset.fallback; if (next.decode) next.decode().catch(function () {}); });
  /* The next chapters' pictures, decoded ahead so no frame waits on one mid-scroll. On a laptop they are fetched now; on a
     phone (often a slow line, and data) the browser's own lazy loading fetches each as the reader nears it. */
  function warm() { var eager = !small(); $$('#thread img, #wk img, #imp img, .cl img, .brand-ph img, #fwA img, .fw-b img').forEach(function (i) { if (eager && i.loading === 'lazy') i.loading = 'eager'; if (i.complete && i.decode) i.decode().catch(function () {}); }); }
  if (window.requestIdleCallback) requestIdleCallback(warm, { timeout: 1500 }); else setTimeout(warm, 600);

  /* Depth (laptops): the laptop behind lags the reader's scroll, the phone in front leads it; scrubbed over the
     opening, on the transform (the arrival moved the individual translate). */
  var mm = gsap.matchMedia();
  mm.add('(min-width: 1100px)', function () {
    var depth = gsap.timeline({ scrollTrigger: { start: 0, end: function () { return vhOf() * 1.1; }, scrub: 0.4, invalidateOnRefresh: true } })
      .fromTo(laptop, { y: 0 }, { y: 96, ease: 'none', duration: 1 }, 0)
      .fromTo(phone, { y: 0 }, { y: -48, ease: 'none', duration: 1 }, 0);
    return function () { depth.scrollTrigger.kill(); depth.kill(); gsap.set([laptop, phone], { clearProps: 'transform' }); };
  });

  /* The set, read and logged (a state change once the whole set card is on screen; nothing labels it): a light ring
     travels down the card, from the load and reps to how hard it felt to Log set, which presses and releases; the phone
     moves on as the app does (set 2 up, the rest timer docked). Beside it on a laptop (below it on a phone) the 228
     panel has risen; the max rolls 223 to 228 as the line climbs to the new point, then +5 kg and New PR land. */
  var digitH = function () { return strip.firstElementChild.offsetHeight; };
  var hls = $$('.hl', phone), PRESS = 1.2;   // PRESS: when Log set presses, in the moment's own time
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
  /* The ring: in on the load and reps, then down to how hard it felt, then onto Log set (each leaves downward as the next
     arrives from just above it, so one highlight seems to travel); it rides into the press and lets go. */
  function anatomyTl() {
    var tl = gsap.timeline();
    hls.forEach(function (h, i) {
      var at = i * 0.44, last = i === hls.length - 1;
      tl.fromTo(h, { autoAlpha: 0, y: i ? -10 : 0, scale: i ? 1 : 1.03 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.36, ease: ENTER, immediateRender: false }, at);
      if (last) tl.to(h, { scale: 0.97, duration: 0.11, ease: OUT }, PRESS).to(h, { scale: 1, autoAlpha: 0, duration: 0.42, ease: OUT }, PRESS + 0.12);
      else tl.to(h, { autoAlpha: 0, y: 10, duration: 0.3, ease: INOUT }, at + 0.42);
    });
    return tl;
  }
  function setTl() { return gsap.timeline().add(anatomyTl(), 0).add(logTl(), PRESS); }
  function maxTl() {
    return gsap.timeline()
      .to(strip, { y: function () { return -5 * digitH(); }, duration: 0.9, ease: OUT }, 0)
      .to(clipR, { attr: { width: 104 }, duration: 0.7, ease: INOUT }, 0)
      .to(maxEnd, { x: 0, y: 0, duration: 0.7, ease: INOUT }, 0)
      .to(maxTags, { autoAlpha: 1, y: 0, duration: 0.34, ease: ENTER }, 0.5);
  }
  var logStart = function () { return Math.max(40, layoutTop(logB) + logB.offsetHeight / 2 - vhOf() * (small() ? 0.62 : 0.5)); };
  /* The ring starts once the whole card is in view, so the press lands about where Log set reaches the middle. */
  var setStart = function () { return Math.max(24, logStart() - vhOf() * (wide() ? 0.45 : 0.24)); };
  /* The 228 panel rises as it arrives (24 px), showing last week's 223 until the set is logged. */
  rise([max], { y: 24, start: 'top 92%', dur: 0.7 });
  mm.add({ side: '(min-width: 1100px)', stack: '(max-width: 1099px)' }, function (ctx) {
    if (ctx.conditions.side) {
      /* Side by side: one beat, the set read and pressed, then the max a moment later. */
      onState(gsap.timeline({ paused: true }).add(setTl(), 0).add(maxTl(), PRESS + 0.3), { start: setStart, end: 'max' });
      return;
    }
    /* Stacked: the set read and pressed as the card comes up, the max as it reaches the screen. */
    onState(setTl().pause(), { start: setStart, end: 'max' });
    onState(maxTl().pause(), { trigger: '.max-num', start: 'top 72%' });
  });

  /* --- The set's flight (scrubbed): it lifts off Arjun's set card and is carried to his squat card on Sam's laptop. Its
     two ends are wherever the page has them this frame. --- */
  var F = { p: 0 }, phBody = $('#phBody');   // the phone itself (its figure also holds the legend on phones and tablets)
  function placeFly() {
    var p = F.p, a = phBody.getBoundingClientRect(), b = ring.getBoundingClientRect();
    var fw = fly.offsetWidth, fh = fly.offsetHeight;
    var sx = a.left + a.width * (196 / 393), sy = a.top + a.height * (236 / 852);
    var ex = b.left + b.width / 2, ey = b.top + b.height / 2;
    var up = Math.min(1, p / 0.18) * (small() ? 30 : 56);
    var q = clamp(0, 1, (p - 0.08) / 0.92), e = INOUT(q), arc = (small() ? 0 : 70) * Math.sin(Math.PI * q);
    var k0 = a.width / 393 * 1.04, k1 = clamp(0.42, 1, b.width / fw);
    var k = k0 + (k1 - k0) * clamp(0, 1, (q - 0.55) / 0.45);
    gsap.set(fly, { x: sx + (ex - sx) * e - fw / 2 + arc, y: sy - up * (1 - e) + (ey - sy) * e - fh / 2, scale: k, rotation: (ex - sx) * 0.004 * Math.sin(Math.PI * q) });
  }
  /* Where the window sits, and when each beat of it happens (scroll positions, from its layout). The window rises zoomed
     out on Sam's whole screen and zooms in to Arjun's page as it comes up; the set lands there and the total ticks;
     then, as the list's words come level (on a laptop) or come up under it (stacked), it pans along the same screen to
     the list. */
  var winTop = function () { return layoutTop(fwPort); };
  var crossStart = function () { return logStart() + (small() ? 140 : wide() ? 200 : 160); };
  var landAt = function () { return Math.max(crossStart() + 320, winTop() - vhOf() * (wide() ? 0.4 : 0.34)); };
  gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { start: crossStart, end: landAt, scrub: 0.5, invalidateOnRefresh: true } })
    .fromTo(F, { p: 0 }, { p: 1, duration: 1, onUpdate: placeFly }, 0)
    .fromTo(fly, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.02 }, 0)
    .to(fly, { autoAlpha: 0, duration: 0.02 }, 0.98);

  /* --- The window: Sam's whole screen, zoomed in to Arjun's page at its real size, then panned to the list:
     one scrubbed timeline, so its three states never fight. The squat card is ringed once as the set lands, then the
     total ticks up 651 to 656. --- */
  /* Zoomed out: Sam's screen covering the window (no empty bands), centred on the line between his list and Arjun's page. */
  function deskFit() {
    var w = fwPort.clientWidth, h = fwPort.clientHeight, s = Math.max(w / 1440, h / 900), seen = w / s, cx = wide() ? 720 : 650;
    return { x: -clamp(0, 1440 - seen, cx - seen / 2) * s, y: -(900 - h / s) / 2 * s, s: s };
  }
  function deskHold() { var k = fk(); return { x: -668 * k, y: -16 * k, s: k }; }
  /* The list's view: "Check on" to Kofi, its group numbers clear of the window's edge (scaled a touch on a phone so its
     numbers' column stays in). */
  function deskList() { var s = Math.min(fk(), fwPort.clientWidth / 398); return { x: -222 * s, y: -180 * s, s: s }; }
  gsap.set(fwDesk, { transformOrigin: '0 0' });
  var listAt = function () { return winTop() - vhOf() * 0.08; };
  mm.add({ side: '(min-width: 1100px)', stack: '(max-width: 1099px)' }, function (ctx) {
    var at = function (f, k) { return function () { return f()[k]; }; };
    /* In vh of scroll before the window's top reaches 8% of the screen: zoom in as it rises, hold while the set lands and
       the total ticks, then pan to the list. */
    var A = ctx.conditions.side ? [1, 0.44, 0.3] : [0.92, 0.4, 0.24];
    gsap.timeline({ scrollTrigger: { start: function () { return winTop() - vhOf() * A[0]; }, end: listAt, scrub: 0.6, invalidateOnRefresh: true } })
      .fromTo(fwDesk, { x: at(deskFit, 'x'), y: at(deskFit, 'y'), scale: at(deskFit, 's') }, { x: at(deskHold, 'x'), y: at(deskHold, 'y'), scale: at(deskHold, 's'), ease: INOUT, duration: A[0] - A[1] }, 0)
      .to(fwDesk, { x: at(deskList, 'x'), y: at(deskList, 'y'), scale: at(deskList, 's'), ease: INOUT, duration: A[2] - 0.08 }, A[0] - A[2]);
  });
  var desk = $('#fwDesk'), ovs = function (c) { return $('.' + c + ' .num', desk); };
  var wasEl = function (n) { return $('.was[src*="' + n + '"]', desk); };
  /* The landing: the line drawn round the squat card, its number 223 to 228 and +6 to +8, the PR mark, the set line;
     the week's training count and Arjun's row on the list move with it. */
  gsap.set(ring, { autoAlpha: 0 }); gsap.set(ringRect, { strokeDasharray: 100, strokeDashoffset: 100 });
  var pr = $('.ov-pr', desk), sw1 = [$('.ov-foot', desk), $('.ov-trf', desk)];
  gsap.set(pr, { autoAlpha: 0, scale: 0.9, transformOrigin: '0% 50%' });
  sw1.forEach(swapStart);
  var was1 = [wasEl('was-sq2'), wasEl('was-tr2'), wasEl('was-pips2')], was2 = [wasEl('was-hero2')];
  gsap.set(was1.concat(was2), { opacity: 1 });
  var land1 = gsap.timeline({ paused: true })
    .set(ring, { autoAlpha: 1 }, 0)
    .to(ringRect, { strokeDashoffset: 0, duration: 0.6, ease: INOUT }, 0)
    .to(ring, { autoAlpha: 0, duration: 0.8, ease: INOUT }, 1.4)
    .to(was1, { opacity: 0, duration: 0.5, ease: OUT }, 0.12)
    .to(pr, { autoAlpha: 1, scale: 1, duration: 0.36, ease: OUT }, 0.5);
  [ovs('ov-sq'), ovs('ov-d'), ovs('ov-tr'), ovs('ov-row')].forEach(function (el, i) { count(land1, el, 0.1 + i * 0.04, 0.8); });
  sw1.forEach(function (el, i) { swapIn(land1, el, 0.16 + i * 0.05); });
  /* His total, 651 to 656, and the four weeks' gain, as the set's line is drawn. */
  var land2 = gsap.timeline({ paused: true }).to(was2, { opacity: 0, duration: 0.5, ease: OUT }, 0.08);
  count(land2, ovs('ov-total'), 0.05, 0.9); count(land2, $('.ov-chip .num', desk), 0.12, 0.9);
  onState(land1, { start: landAt, end: 'max' });
  onState(land2, { start: function () { return landAt() + 30; }, end: 'max' });

  /* The landing's words, and the window rising into the page. */
  words($('#land-h'), { start: 'top 94%' });
  rise([$('.land .sub')], { trigger: $('.land .sub'), start: 'top 94%' });
  rise([$('#fwA')], { y: 36, start: 'top 96%', dur: 0.8 });

  /* =====================================================================
     TODAY: the lifters who need Sam first, in the app's order, pain first (Priya and Sarah, then Tom's meet, Nina's busy
     week, Elena over her class, Marcus over plan, the two who wrote). The window has panned to Sam's list: each group is
     ringed and numbered in turn, and its reason lights in the chain beside it (below it on a phone) as its lifters'
     faces arrive. No sentences: the order is the explanation. The list's own figure is the still's.
     ===================================================================== */
  words($('#who-h'), { start: 'top 94%' });
  rise([$('.who .sub')], { trigger: $('.who .sub'), start: 'top 94%' });
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
  onState(listTl, { start: listAt, end: 'max' });

  /* =====================================================================
     ANSWERS: the thread rises beside the words; Sam's note, then Arjun's set arrive the way messages do; Sent becomes
     Seen; Sam's reply lands under it.
     ===================================================================== */
  words($('#answers-h'));
  rise([$('.answers-copy .lead')], { trigger: $('.answers-copy .lead'), start: 'top 92%' });
  rise([$('#thread .th-crop')], { trigger: $('#thread'), y: 40, start: 'top 94%', dur: 0.8 });
  gsap.fromTo('#thread', { y: 26 }, { y: -26, ease: 'none', scrollTrigger: { trigger: '#answers', start: 'top bottom', end: 'bottom top', scrub: 0.4 } });
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
     NEXT WEEK: the week rises; Sam takes the suggestion his own rule wrote (bench 155 to 145): the row turns to
     "Took 145", the week's header to "Suggestions taken"; then Publish week 3 arrives, the one crimson here. On a
     phone the reader's scroll first pans along the true-size row.
     ===================================================================== */
  words($('#next-h'));
  rise([$('.next-head .lead')], { start: 'top 92%' });
  rise($$('.wk-cols span'), { trigger: $('#wk'), start: 'top 88%', stagger: 0.09 });
  var wkPort = $('#wkPort'), wkIn = $('#wkIn'), wkTap = $('#wkTap'), wkWhy = $('#wkWhy'), wkB1 = $('.wk-b1'), wkB2 = $('.wk-b2'), pub = $('#pub');
  rise([wkPort], { y: 30, start: 'top 94%', dur: 0.8 });
  gsap.set(pub, { autoAlpha: 0, scale: 0.94, transformOrigin: '50% 50%' });
  var b1From = 'inset(73.902% 0.345% 13.437% 66.897%)', b1To = 'inset(73.902% 0.345% 13.437% 99.655%)';
  /* Why, then the take (what the caption used to say): a ring on Marcus's bench as he lifted it, 1.5 over what Sam wrote;
     then Sam taps Take on the load his own rule wrote, the row turns to "Took 145", the week's header to "Suggestions
     taken", and Publish week 3 arrives. */
  function takeTl(why) {
    var T = why ? 0.62 : 0, tl = gsap.timeline({ paused: true });
    if (why) tl.fromTo(wkWhy, { autoAlpha: 0, scale: 1.05 }, { autoAlpha: 1, scale: 1, duration: 0.34, ease: ENTER, immediateRender: false }, 0)
      .to(wkWhy, { autoAlpha: 0, duration: 0.4, ease: OUT }, T + 0.5);
    return tl.fromTo(wkTap, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.2, ease: OUT }, T)
      .fromTo(wkB1, { clipPath: b1From }, { clipPath: b1To, duration: 0.6, ease: INOUT, immediateRender: false }, T + 0.22)
      .to(wkTap, { opacity: 0, duration: 0.4, ease: OUT }, T + 0.5)
      .fromTo(wkB2, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.4, ease: OUT, immediateRender: false }, T + 0.9)
      .to(pub, { autoAlpha: 1, scale: 1, duration: 0.36, ease: ENTER }, T + 1.2);
  }
  mm.add({ phoneW: '(max-width: 759px)', wideW: '(min-width: 760px)' }, function (ctx) {
    if (ctx.conditions.phoneW) {
      /* On a phone the why ring rides the pan: it lights as Marcus's bench, as lifted, passes the middle of the strip. */
      var pan = gsap.timeline({ scrollTrigger: { trigger: wkPort, start: 'top 82%', end: 'top 30%', scrub: 0.5, invalidateOnRefresh: true } })
        .fromTo(wkIn, { x: 0 }, { x: function () { var cs = getComputedStyle(wkPort); return -(wkIn.offsetWidth - (wkPort.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))); }, ease: 'none', duration: 1 })
        .fromTo(wkWhy, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: 'none', immediateRender: false }, 0.28)
        .to(wkWhy, { autoAlpha: 0, duration: 0.12, ease: 'none' }, 0.74);
      var tp = takeTl(false), a = onState(tp, { trigger: wkPort, start: 'top 30%' });
      return function () { a.kill(); tp.kill(); pan.scrollTrigger.kill(); pan.kill(); gsap.set(wkIn, { clearProps: 'transform' }); };
    }
    var tw = takeTl(true), b = onState(tw, { trigger: wkPort, start: 'bottom 88%' });
    return function () { b.kill(); tw.kill(); };
  });

  /* =====================================================================
     MEET DAY: a chapter like the others. As the platform arrives the three lights come on one by one: good lift. Tom's
     phone wakes with his next attempt and Declare turns crimson; the platform's minute runs, smoothly, 1:00 to 0:41;
     the call: Declare presses and becomes Declared 215, the board's 2nd fills, and Tom's phone has it (its card rings
     green, "not declared yet" clears, he is one out). No captions say so: the stage does.
     ===================================================================== */
  words($('#meet-h'));
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
    .fromTo('#slab', { boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.07)' }, { boxShadow: '0 0 0 2px rgba(52, 217, 130, 0.85)', duration: 0.3, ease: OUT, immediateRender: false }, C + 0.3)
    .to('#slab', { boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.07)', duration: 0.8, ease: INOUT }, C + 1.1);
  swapIn(meetTl, $('.swap', dec), C + 0.08);
  swapIn(meetTl, cell2, C + 0.16);
  swapIn(meetTl, $('#slabDec'), C + 0.3);
  swapIn(meetTl, $('#slabOut'), C + 0.36);
  onState(meetTl, { trigger: scene, start: function () { return small() ? 'top 74%' : 'top 66%'; } });
  rise($$('#meet .side > .cap'), { trigger: scene, start: 'top 90%', stagger: 0.1 });

  /* =====================================================================
     MOVING OVER: the three steps tick in, one after another (the number, then its line); the import's preview rises
     beside them, unrolling to show what one old log becomes.
     ===================================================================== */
  words($('#moving-h'));
  var stepsTl = gsap.timeline({ paused: true });
  $$('#steps .step-i').forEach(function (s, i) {
    var at = i * 0.2;
    stepsTl.fromTo($('.sn', s), { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.42, ease: ENTER }, at)
      .fromTo($('.st p', s), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: ENTER }, at + 0.05);
  });
  onState(stepsTl, { trigger: '#steps', start: 'top 84%' });
  var impTl = gsap.timeline({ paused: true })
    .fromTo('#imp', { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: ENTER }, 0)
    .fromTo('#imp .sheet-crop', { clipPath: 'inset(0% 0% 100% 0% round 18px)' }, { clipPath: 'inset(0% 0% 0% 0% round 18px)', duration: 0.9, ease: INOUT }, 0.08);
  onState(impTl, { trigger: '#imp', start: 'top 88%' });
  rise([$('.move-foot')], { start: 'top 96%' });

  /* KNOW WHO HAS PAID: the month's paid total counts up to $2,650 as its bar fills to 82%; Recurring to $3,248 (on a
     laptop); then the live numbers hand over to the capture's own (they match it). */
  rise([$('#money-h'), $('.money-copy p')], { trigger: $('#money-h'), start: 'top 90%' });
  rise([$('.cl')], { y: 30, start: 'top 94%', dur: 0.8 });
  var clTl = gsap.timeline({ paused: true });
  $$('.cl-live').forEach(function (live) {
    var pb = $('.cl-pb', live);
    gsap.set(live, { autoAlpha: 1 });
    clTl.fromTo(pb, { clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 100%)', duration: 1.3, ease: OUT, immediateRender: true }, 0.15);
    $$('.cl-n .num', live).forEach(function (n, i) { count(clTl, n, 0.15 + i * 0.12, 1.3, OUT); });
    clTl.to(live, { autoAlpha: 0, duration: 0.35, ease: OUT }, 1.75);
  });
  onState(clTl, { trigger: '.cl', start: 'top 92%' });

  /* =====================================================================
     PRICING: the offer settles (its words, Start coaching free, the branded phone rising; a ring visits what branding
     changes: the team's name and logo, then Log set in its colour); the plans arrive left to right, and Sam's roster
     fills from 11 to 20 lifters on Pro, a seat at a time.
     ===================================================================== */
  words($('#plans-h'));
  rise([$('.plans-head .lead')], { start: 'top 92%' });
  var plansTl = gsap.timeline({ paused: true })
    .fromTo('#plansCta .act-btn', { autoAlpha: 0, y: 8, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: ENTER }, 0);
  onState(plansTl, { trigger: '#plansCta', start: 'top 94%' });
  var bpHls = $$('.brand-ph .hl');
  gsap.set(bpHls, { autoAlpha: 0 });
  var bpTl = gsap.timeline({ paused: true }).fromTo('.brand-ph .bp-crop', { autoAlpha: 0, y: 40 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: ENTER }, 0);
  onState(bpTl, { trigger: '.brand-ph', start: 'top 90%' });
  /* The ring plays once the whole screen is in view (its second stop, Log set, is at the crop's foot). */
  var bpRings = gsap.timeline({ paused: true });
  bpHls.forEach(function (h, i) {
    var at = 0.1 + i * 0.62;
    bpRings.fromTo(h, { autoAlpha: 0, y: i ? -10 : 0, scale: i ? 1 : 1.03 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.36, ease: ENTER, immediateRender: false }, at)
      .to(h, i ? { autoAlpha: 0, duration: 0.5, ease: OUT } : { autoAlpha: 0, y: 10, duration: 0.32, ease: INOUT }, at + (i ? 1.0 : 0.6));
  });
  onState(bpRings, { trigger: '.brand-ph', start: 'bottom 92%' });
  rise($$('#scale .band'), { trigger: '#scale', start: 'top 92%', stagger: 0.08, y: 14 });
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
  rise([$('.scale-cap')], { trigger: $('.scale-cap'), start: 'top 97%' });

  /* =====================================================================
     QUESTIONS: they arrive in turn, all closed (each opens only for the reader, its answer arriving: the page layer).
     ===================================================================== */
  words($('#faq-h'));
  rise([$('.faq-demo')], { start: 'top 94%' });
  rise($$('.qs .q > summary'), { trigger: '.qs-cols', start: 'top 90%', stagger: 0.045 });

  /* =====================================================================
     THE LAST CALL: the line rises, then Start coaching free settles; the footer comes to rest under it.
     ===================================================================== */
  words($('#close-h'), { start: 'top 88%', stagger: 0.06 });
  rise([$('.close .lead')], { start: 'top 94%' });
  var closeTl = gsap.timeline({ paused: true })
    .fromTo('#closeCta .act-btn', { autoAlpha: 0, y: 8, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: ENTER }, 0)
    .fromTo('#closeCta .quiet', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.08, ease: ENTER }, 0.12);
  onState(closeTl, { trigger: '#closeCta', start: 'top 96%' });
  rise([$('.foot-brand')].concat($$('.foot-cols > div'), [$('.foot-c')]), { trigger: '.foot', start: 'top 96%', stagger: 0.07, y: 16 });

  /* Every trigger refreshes in page order; the page map is re-read after each refresh. The boot ends two frames after
     the first refresh: from then on every moment plays as its block arrives. */
  ST.addEventListener('refresh', function () { S.setY = setStart(); measurePage(); paintNav(); paintReds(); });
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
