/* site.js — behaviour for the POWALIFTA website (pairs with site.css).
   1. The nav turns to glass once the page scrolls, and opens as a menu on phones.
   2. Scroll reveal that never hides content by default: only elements that start
      below the fold get .s-wait, and they rise in when they reach the screen.
   3. The lifter hero's rest-timer chip counts down like the app's does.
   4. The hero's Coach | Lifter switch.
   5. "Monday in 40 seconds": on a laptop with motion allowed, one laptop is pinned beside
      the steps and plays the desk key by key as you scroll. Otherwise the steps stay a list
      of stills (that's the markup; nothing here is needed to read it).
   6. The four live tiles (the app's own math: calcE1RM, parsePrescription from app.js).
   7. The pricing roster slider.
   Everything fails soft: with no JS, or reduced motion, the page is simply all there. */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(mqReduce && mqReduce.matches); }
  var reduce = reduced();
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  // Run fn once, the first time el is well inside the viewport.
  function onArrive(el, fn, margin) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); fn(); } });
    }, { rootMargin: margin || '0px 0px -25% 0px', threshold: 0.2 });
    io.observe(el);
  }

  // ---- 1. Nav ---------------------------------------------------------------
  function nav() { return $('nav'); }
  function syncNav() {
    var n = nav();
    if (!n) return;
    n.classList.toggle('is-scrolled', (window.scrollY || 0) > 8);
    document.body.style.setProperty('--s-nav-h', n.offsetHeight + 'px');
  }
  function closeMenu() {
    var n = nav();
    if (!n || !n.classList.contains('nav-open')) return;
    n.classList.remove('nav-open');
    var b = n.querySelector('.nav-menu');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.nav-menu');
    if (btn) {
      var n = nav();
      if (!n) return;
      var open = !n.classList.contains('nav-open');
      syncNav();
      n.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    if (e.target.closest && e.target.closest('.nav-links a')) closeMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  window.addEventListener('scroll', syncNav, { passive: true });
  window.addEventListener('resize', function () { if (window.innerWidth > 880) closeMenu(); syncNav(); }, { passive: true });

  // ---- 2. Reveal ------------------------------------------------------------
  function setupReveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('s-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    all('.s-reveal').forEach(function (el) {
      // On screen (or already scrolled past) at load: leave it exactly as it is.
      if (el.getBoundingClientRect().top < vh * 0.92) return;
      el.classList.add('s-wait');
      io.observe(el);
    });
  }

  // ---- 3. Rest-timer chip ---------------------------------------------------
  function setupCountdown() {
    all('[data-countdown]').forEach(function (el) {
      var total = parseInt(el.getAttribute('data-countdown'), 10) || 150;
      var fmt = function (s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
      el.textContent = fmt(total);
      if (reduce) return;
      var start = Date.now();
      setInterval(function () {
        if (document.hidden) return;
        var left = total - (Math.floor((Date.now() - start) / 1000) % total);
        el.textContent = fmt(left);
      }, 1000);
    });
  }

  // ---- 4. Coach | Lifter ----------------------------------------------------
  function setupHeroMode() {
    var hero = $('top');
    if (!hero || !hero.querySelector('.s-switch')) return;
    var btns = all('[data-mode-btn]', hero);
    if (!hero.getAttribute('data-mode')) hero.setAttribute('data-mode', window.matchMedia && window.matchMedia('(min-width: 1000px)').matches ? 'coach' : 'lifter');
    function set(mode, byUser) {
      var prev = hero.getAttribute('data-mode');
      hero.setAttribute('data-mode', mode);
      btns.forEach(function (b) {
        var on = b.getAttribute('data-mode-btn') === mode;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      if (!byUser) return;
      try { sessionStorage.setItem('powa-site-mode', mode); } catch (e) {}
      if (prev === mode) return;
      hero.classList.add('is-switched'); // the first-paint choreography doesn't replay on a switch
      if (reduce) return;
      var panel = $(mode === 'coach' ? 'heroCoach' : 'heroLifter');
      if (!panel) return;
      panel.classList.remove('is-entering', 'from-left');
      void panel.offsetWidth;
      panel.classList.add('is-entering');
      if (mode === 'coach') panel.classList.add('from-left'); // Coach sits left of Lifter in the switch
    }
    set(hero.getAttribute('data-mode'), false);
    btns.forEach(function (b, k) {
      b.addEventListener('click', function () { set(b.getAttribute('data-mode-btn'), true); });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var n = btns[(k + 1) % btns.length];
        set(n.getAttribute('data-mode-btn'), true);
        n.focus();
      });
    });
  }

  // ---- 5. Monday in 40 seconds ----------------------------------------------
  // IPF plates, heaviest first: one slides onto the sleeve per beat.
  var PLATES = [['#d92638', 46], ['#1d70d8', 42], ['#e8b80c', 36], ['#1f9e5b', 30], ['#e8e8ee', 23]];
  function setupMonday() {
    var sec = $('desk');
    if (!sec || !window.matchMedia || !('IntersectionObserver' in window)) return;
    var grid = sec.querySelector('.s-mon-grid');
    var beats = all('.s-beat', sec);
    if (!grid || !beats.length) return;
    var mqWide = window.matchMedia('(min-width: 1000px)');
    var rail = null, cam = null, hl = null, hud = null, hudKey = null, hudLabel = null, plates = [], frames = {}, io = null, cur = -1, live = false, raf = 0;

    function crop(i) {
      if (i <= 0) return { x: 0, y: 0, z: 1 };
      var c = beats[i - 1].querySelector('.s-crop');
      var st = c ? c.style : null;
      var num = function (v, d) { var n = parseFloat(st ? st.getPropertyValue(v) : ''); return isFinite(n) ? n : d; };
      var z = num('--cz', 1), x = num('--cx', 0), y = num('--cy', 0), hw = num('--hw', 0);
      return { x: x, y: y, z: z, h: hw ? { x: num('--hx', 0), y: num('--hy', 0), w: hw, h: num('--hh', 0) } : null };
    }
    // On a smaller laptop screen, zoom further in so the desk's text stays readable (at least
    // ~0.85 of its real size, ~0.72 under 1200px). The crop's top-left stays put: each crop starts
    // at a column edge (the queue, the grid's name column), so the labels stay in view.
    function fit(c) {
      var w = cam && cam.parentNode ? cam.parentNode.clientWidth : 0;
      if (!w || c.z >= 1) return c;
      var z = Math.min(c.z, w / (1440 * (window.innerWidth < 1200 ? 0.72 : 0.85)));
      if (z >= c.z) return c;
      return { x: c.x, y: c.y, z: z, h: c.h };
    }
    function img(i) { return beats[Math.max(0, i - 1)].querySelector('img'); }
    function src(i) { var im = img(i); return im ? im.getAttribute('src') : ''; }
    function label(b) {
      var k = b.querySelector('.s-beat-key');
      if (!k) return '';
      var t = k.cloneNode(true);
      all('kbd, .s-beat-n', t).forEach(function (x) { x.remove(); });
      return t.textContent.trim();
    }
    function build() {
      rail = mk('div', 's-mon-rail');
      rail.setAttribute('aria-hidden', 'true');
      var stage = mk('div', 's-mon-stage');
      var laptop = mk('div', 's-laptop');
      var lid = mk('div', 's-laptop-lid');
      var screen = mk('div', 's-laptop-screen');
      cam = mk('div', 's-cam');
      frames = {};
      beats.forEach(function (b, k) {
        var s = src(k + 1);
        if (!s || frames[s]) return;
        var im = mk('img'), from = img(k + 1);
        im.loading = 'lazy'; im.alt = ''; im.decoding = 'async'; im.width = 2160; im.height = 1350;
        // The 1440w still on 1x screens, the 2160w one on 2x: the camera shows it ~1.6x the screen.
        if (from && from.getAttribute('srcset')) { im.sizes = '1300px'; im.srcset = from.getAttribute('srcset'); }
        im.src = s;
        frames[s] = im;
        cam.appendChild(im);
      });
      hl = mk('div', 's-ring-hl');
      cam.appendChild(hl);
      hud = mk('div', 's-hud');
      hudKey = mk('kbd', 's-key');
      hudLabel = mk('span');
      hud.appendChild(hudKey); hud.appendChild(hudLabel);
      screen.appendChild(cam);
      lid.appendChild(screen); laptop.appendChild(lid);
      laptop.appendChild(mk('div', 's-laptop-base'));
      var foot = mk('div', 's-mon-foot');
      var sleeve = mk('div', 's-sleeve');
      sleeve.appendChild(mk('span', 's-sleeve-stop'));
      plates = beats.map(function (b, k) {
        var p = PLATES[k % PLATES.length], i = mk('i');
        i.style.setProperty('--c', p[0]); i.style.setProperty('--h', p[1] + 'px');
        sleeve.appendChild(i);
        return i;
      });
      foot.appendChild(hud); foot.appendChild(sleeve);
      stage.appendChild(laptop); stage.appendChild(foot);
      rail.appendChild(stage);
    }
    function flash(b) {
      var key = b.getAttribute('data-key');
      if (!key || !hud.animate) return;
      hudKey.textContent = key;
      hudLabel.textContent = label(b);
      hud.getAnimations().forEach(function (a) { a.cancel(); });
      hud.animate([
        { opacity: 0, transform: 'translateY(8px) scale(0.96)' },
        { opacity: 1, transform: 'none', offset: 0.12 },
        { opacity: 1, transform: 'none', offset: 0.84 },
        { opacity: 0, transform: 'translateY(4px) scale(0.98)' }
      ], { duration: 2200, easing: EASE });
      hudKey.animate([{ transform: 'none' }, { transform: 'translateY(2px)', offset: 0.45 }, { transform: 'none' }], { duration: 200, delay: 280, easing: 'ease-out' });
      var k = b.querySelector('.s-beat-key .s-key');
      if (k) { k.classList.add('is-down'); setTimeout(function () { k.classList.remove('is-down'); }, 160); }
    }
    function go(i) {
      if (i === cur) return;
      var forward = i > cur;
      cur = i;
      var c = fit(crop(i));
      cam.style.setProperty('--cx', c.x); cam.style.setProperty('--cy', c.y); cam.style.setProperty('--cz', c.z);
      // The ring fades out with the old frame and in once the camera has arrived (CSS delay).
      hl.classList.remove('on');
      if (c.h) {
        hl.style.setProperty('--hx', c.h.x); hl.style.setProperty('--hy', c.h.y); hl.style.setProperty('--hw', c.h.w); hl.style.setProperty('--hh', c.h.h);
        void hl.offsetWidth;
        hl.classList.add('on');
      }
      var s = src(i);
      Object.keys(frames).forEach(function (k) { frames[k].classList.toggle('on', k === s); });
      beats.forEach(function (b, k) { b.classList.toggle('is-on', k === i - 1); });
      plates.forEach(function (p, k) { p.classList.toggle('on', k < i); });
      if (i > 0 && forward) flash(beats[i - 1]);
    }
    // The active beat is the last one whose words have reached the middle of the screen.
    function sync() {
      var mid = (window.innerHeight || 800) * 0.56, n = 0;
      beats.forEach(function (b) { if (b.getBoundingClientRect().top < mid) n++; });
      go(n);
    }
    function enable() {
      if (live) return;
      live = true;
      if (!rail) build();
      grid.appendChild(rail);
      sec.classList.add('is-live');
      cur = -1;
      go(0);
      sync();
      io = new IntersectionObserver(sync, { rootMargin: '-40% 0px -40% 0px', threshold: [0, 1] });
      beats.forEach(function (b) { io.observe(b); });
    }
    // The observer only fires when a beat crosses a threshold; after a smooth scroll (the nav's
    // links, Space, PageDown) the stage could stay a beat behind. Scroll, scrollend and resize
    // re-check, once a frame at most.
    function onScroll() { if (live && !raf) raf = requestAnimationFrame(function () { raf = 0; sync(); }); }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scrollend', function () { if (live) sync(); }, { passive: true });
    window.addEventListener('resize', function () { if (!live) return; var k = cur; cur = -1; go(k); sync(); }, { passive: true });
    function disable() {
      if (!live) return;
      live = false;
      if (io) io.disconnect();
      sec.classList.remove('is-live');
      beats.forEach(function (b) { b.classList.remove('is-on'); });
      if (rail && rail.parentNode) rail.parentNode.removeChild(rail);
    }
    function decide() { if (mqWide.matches && !reduced()) enable(); else disable(); }
    decide();
    var watch = function (mq) { if (mq.addEventListener) mq.addEventListener('change', decide); else if (mq.addListener) mq.addListener(decide); };
    watch(mqWide);
    if (mqReduce) watch(mqReduce);
  }

  // ---- 6. The live tiles ----------------------------------------------------
  function countTo(el, from, to, fmt) {
    if (reduce || !window.requestAnimationFrame) { el.textContent = fmt(to); return; }
    var t0 = 0;
    function tick(ts) {
      if (!t0) t0 = ts;
      var t = Math.min((ts - t0) / 380, 1), e = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function setupE1rmTile() {
    var tile = document.querySelector('.s-tile-e1');
    var out = $('tileE1');
    if (!tile || !out) return;
    var line = tile.querySelector('.t-spark-line'), dot = tile.querySelector('.t-spark-dot');
    var btns = all('.t-rpe button', tile);
    var HIST = [188, 191, 190, 194, 196], W = 160, R = 5;
    var shown = parseFloat(out.textContent) || 200;
    function e1(rpe) {
      var v = typeof window.calcE1RM === 'function' ? window.calcE1RM(W, R, rpe) : (function () { var p = 1 - ((R - 1) + (10 - rpe)) * 0.0333; return p < 0.4 ? W / 0.4 : W / p; })();
      return Math.round(v * 2) / 2;
    }
    function y(v) { return Math.max(6, Math.min(76, 74 - (v - 184) / 28 * 66)); }
    function set(rpe) {
      var v = e1(rpe), pts = HIST.concat([v]);
      var d = 'M' + pts.map(function (p, i) { return (4 + i * 46.4).toFixed(1) + ' ' + y(p).toFixed(1); }).join(' L');
      line.setAttribute('d', d);
      line.style.d = 'path("' + d + '")';
      dot.setAttribute('cy', y(v).toFixed(1));
      dot.style.cy = y(v).toFixed(1) + 'px';
      btns.forEach(function (b) { var on = parseFloat(b.getAttribute('data-rpe')) === rpe; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      var from = shown; shown = v;
      countTo(out, from, v, function (x) { return String(Math.round(x * 2) / 2); });
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { set(parseFloat(b.getAttribute('data-rpe'))); }); });
    set(8);
    // Arriving: the set is logged at 9, then you see it was really an 8.
    if (!reduce) onArrive(tile, function () { set(9); setTimeout(function () { set(8); }, 900); });
  }

  function setupDriftTile() {
    var tile = document.querySelector('.s-tile-drift');
    if (!tile) return;
    var list = tile.querySelector('.t-drift-list'), btn = tile.querySelector('.t-sort');
    if (!list || !btn) return;
    var byDrift = function (a, b) { return parseFloat(b.getAttribute('data-drift')) - parseFloat(a.getAttribute('data-drift')) || a.textContent.localeCompare(b.textContent); };
    var byName = function (a, b) { return a.textContent.localeCompare(b.textContent); };
    function order(cmp) {
      var rows = all('li', list);
      var first = rows.map(function (r) { return r.getBoundingClientRect().top; });
      rows.slice().sort(cmp).forEach(function (r) { list.appendChild(r); });
      if (reduce || !rows[0].animate) return;
      rows.forEach(function (r, k) {
        var dy = first[k] - r.getBoundingClientRect().top;
        if (dy) r.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 520, easing: EASE });
      });
    }
    function sortBy(drift) { btn.setAttribute('aria-pressed', drift ? 'true' : 'false'); order(drift ? byDrift : byName); }
    btn.addEventListener('click', function () { sortBy(btn.getAttribute('aria-pressed') !== 'true'); });
    if (reduce) return;
    // Start by name; it sorts itself when it arrives.
    btn.setAttribute('aria-pressed', 'false');
    all('li', list).sort(byName).forEach(function (r) { list.appendChild(r); });
    onArrive(tile, function () { setTimeout(function () { sortBy(true); }, 450); });
  }

  function setupPainTile() {
    var tile = document.querySelector('.s-tile-pain');
    if (!tile) return;
    var box = tile.querySelector('.t-pain'), btns = all('.t-yn button', tile), chip = tile.querySelector('.t-chip-pain');
    if (!box || !chip) return;
    function set(v, animate) {
      box.setAttribute('data-pain', v);
      btns.forEach(function (b) { var on = b.getAttribute('data-pain') === v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      chip.classList.remove('is-new');
      if (v === 'yes' && animate && !reduce) { void chip.offsetWidth; chip.classList.add('is-new'); }
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-pain'), true); }); });
    if (reduce) { set('yes', false); return; }
    set('no', false);
    onArrive(tile, function () { setTimeout(function () { if (box.getAttribute('data-pain') === 'no') set('yes', true); }, 700); });
  }

  function setupRxTile() {
    var input = $('tileRx'), out = $('tileRxOut');
    if (!input || !out) return;
    var prev = [];
    var n = function (v) { return String(Math.round(v * 100) / 100); };
    function chips(s) {
      if (typeof window.parsePrescription !== 'function') return null;
      var p = window.parsePrescription(s, 'kg'), c = [];
      if (p.sets != null && p.reps != null) { c.push(p.sets + (p.sets === 1 ? ' set' : ' sets')); c.push(p.reps + (p.reps === 1 ? ' rep' : ' reps')); }
      if (p.kg != null) c.push(n(p.kg) + (p.kgHi != null ? '-' + n(p.kgHi) : '') + ' kg');
      if (p.pct != null) c.push(n(p.pct) + (p.pctHi != null ? '-' + n(p.pctHi) : '') + '% of max');
      if (p.rpe != null) {
        var r = 'RPE ' + n(p.rpe) + (p.rpeHi != null ? '-' + n(p.rpeHi) : '');
        if (p.rir) { var lo = 10 - (p.rpeHi != null ? p.rpeHi : p.rpe), hi = 10 - p.rpe; c.push((lo === hi ? lo : lo + '-' + hi) + ' in reserve'); }
        c.push(r);
      }
      return c;
    }
    function render() {
      var c = chips(input.value);
      if (c === null) return; // app.js not loaded: keep the markup's example
      out.innerHTML = '';
      if (!c.length) { out.appendChild(mk('i', 't-rx-none', 'Write sets x reps, then @RPE, RIR, % or kg')); prev = []; return; }
      c.forEach(function (t) {
        var i = mk('i');
        i.textContent = t;
        if (prev.indexOf(t) < 0 && !reduce) i.className = 'is-new';
        out.appendChild(i);
      });
      prev = c;
    }
    input.addEventListener('input', render);
    var touched = false;
    input.addEventListener('focus', function () { touched = true; });
    all('.t-rx-try button').forEach(function (b) {
      b.addEventListener('click', function () { touched = true; input.value = b.getAttribute('data-rx'); render(); });
    });
    prev = chips(input.value) || [];
    render();
    if (reduce) return;
    // Arriving: a coach types a line from their sheet.
    onArrive(input, function () {
      var text = '4x6 75% @7', i = 0;
      setTimeout(function step() {
        if (touched) return;
        input.value = text.slice(0, ++i);
        render();
        if (i < text.length) setTimeout(step, 70);
      }, 600);
    });
  }

  // The tiles' single-choice rows (RPE, pain yes/no) follow the ARIA radio pattern: one Tab stop
  // (the checked option), arrow keys move and choose.
  function setupRadios() {
    all('.s-tile [role="radiogroup"]').forEach(function (g) {
      var opts = all('[role="radio"]', g);
      function tabs() { var on = opts.filter(function (o) { return o.getAttribute('aria-checked') === 'true'; })[0] || opts[0]; opts.forEach(function (o) { o.tabIndex = o === on ? 0 : -1; }); }
      tabs();
      if ('MutationObserver' in window) new MutationObserver(tabs).observe(g, { subtree: true, attributes: true, attributeFilter: ['aria-checked'] });
      g.addEventListener('keydown', function (e) {
        var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!d) return;
        var k = opts.indexOf(document.activeElement);
        if (k < 0) return;
        e.preventDefault();
        var n = opts[(k + d + opts.length) % opts.length];
        n.click();
        n.focus();
      });
    });
  }

  // ---- 7. Pricing roster slider --------------------------------------------
  function setupRoster() {
    var r = $('rosterSize'), out = $('rosterOut');
    if (!r || !out) return;
    var plans = all('.s-plan[data-upto]');
    function upd() {
      var v = parseInt(r.value, 10) || 1, max = parseInt(r.max, 10) || 60;
      var plan = plans.filter(function (p) { return v <= parseInt(p.getAttribute('data-upto'), 10); })[0] || plans[plans.length - 1];
      plans.forEach(function (p) { p.classList.toggle('is-on', p === plan); });
      var name = plan.querySelector('h3').textContent.trim();
      var price = plan.querySelector('.s-price').textContent.replace(/\s+/g, '');
      out.innerHTML = '';
      var b = mk('b'); b.textContent = (v >= max ? max + '+' : v) + (v === 1 ? ' athlete' : ' athletes');
      var s = mk('span'); s.textContent = price === '$0' ? 'Free' : name + ' · ' + price;
      out.appendChild(b); out.appendChild(s);
      r.style.setProperty('--p', ((v - 1) / (max - 1) * 100) + '%');
      r.setAttribute('aria-valuetext', b.textContent + ', ' + s.textContent);
    }
    r.addEventListener('input', upd);
    upd();
  }

  ready(function () {
    syncNav();
    setupReveal();
    setupCountdown();
    setupHeroMode();
    setupMonday();
    setupE1rmTile();
    setupDriftTile();
    setupPainTile();
    setupRxTile();
    setupRadios();
    setupRoster();
    // The nav is drawn by app.js after the session check: measure it once it lands.
    var n = nav();
    if (n && 'MutationObserver' in window) new MutationObserver(syncNav).observe(n, { childList: true });
  });
})();
