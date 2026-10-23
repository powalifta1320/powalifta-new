/* site.js: behaviour for the POWALIFTA website (pairs with site.css). Website v2, 2026-10-22.
   1. The nav turns to glass once the page scrolls, and opens as a menu on phones.
   2. Scroll reveal that never hides content by default: only elements that start
      below the fold get .s-wait, and they rise in when they reach the screen.
   3. The hero loop: the lifter taps Log set on the phone, the set flies to their row on the
      coach's desk and lands with one soft pulse (on phones, where the phone isn't drawn, it just
      lands). Plays only while the hero is on screen.
   4. The table's numbered pins: they arrive one by one, and a note lights its pin.
   5. The pricing roster slider.
   6. A document's contents (data.html) mark the section you're reading.
   Everything fails soft: with no JS, or reduced motion, the page is simply all there (the hero
   shows the set already landed). */
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
  var EASE_IO = 'cubic-bezier(0.77, 0, 0.175, 1)';
  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

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

  // ---- 3. The hero loop -----------------------------------------------------
  // One beat every ~6.5 s while the stage is on screen and the tab is visible:
  // press (0.35 s) → the set flies to the row (1.15 s) → the row pulses once and the set docks
  // at its end → it rests there, then clears before the next beat.
  function setupHeroLoop() {
    var stage = $('heroStage');
    if (!stage || reduce || !stage.animate || !('IntersectionObserver' in window)) return;
    var press = stage.querySelector('.s-press'), fly = stage.querySelector('.s-flyer');
    var land = stage.querySelector('.s-land'), ring = land && land.querySelector('.s-land-ring'), tag = land && land.querySelector('.s-tag');
    if (!press || !fly || !land || !ring || !tag) return;
    stage.classList.add('is-live');
    var visible = false, timer = 0, running = false, started = false;
    function center(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r }; }
    function beat() {
      timer = 0;
      if (!visible || document.hidden) { running = false; return; }
      running = true;
      // Phones show no phone (site.css): the set simply lands on the row, without the flight.
      var phone = press.getClientRects().length > 0;
      if (!phone) { land0(); timer = setTimeout(beat, 6600); return; }
      var s = stage.getBoundingClientRect(), a = center(press), t = tag.getBoundingClientRect();
      var fw = fly.offsetWidth, fh = fly.offsetHeight;
      var x0 = a.x - s.left - fw / 2, y0 = a.r.top - s.top - fh * 0.2;
      // Dock where the tag sits, at the tag's own size (it is drawn inside the scaled desk).
      var k = Math.max(0.45, Math.min(1, t.height / fh));
      var x1 = t.left - s.left + t.width / 2 - fw / 2, y1 = t.top - s.top + t.height / 2 - fh / 2;
      press.animate([{ opacity: 0 }, { opacity: 0.24, offset: 0.35 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
      var dx = x1 - x0, dy = y1 - y0;
      fly.animate([
        { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(0.86)', opacity: 0 },
        { transform: 'translate(' + x0 + 'px,' + (y0 - 34) + 'px) scale(1)', opacity: 1, offset: 0.18 },
        { transform: 'translate(' + (x0 + dx * 0.55) + 'px,' + (y0 - 34 + (dy + 34) * 0.42) + 'px) scale(1)', opacity: 1, offset: 0.62 },
        { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(' + k + ')', opacity: 1, offset: 0.94 },
        { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(' + k + ')', opacity: 0 }
      ], { duration: 1300, delay: 260, easing: EASE_IO, fill: 'none' });
      setTimeout(land0, 1460);
      timer = setTimeout(beat, 6600);
    }
    // The landing: one soft pulse on the row, and the set docked at its end for a few seconds.
    function land0() {
      ring.animate([
        { opacity: 0, transform: 'scale(0.985)' },
        { opacity: 1, transform: 'scale(1.012)', offset: 0.35 },
        { opacity: 1, transform: 'none', offset: 0.6 },
        { opacity: 1, transform: 'none', offset: 0.88 },
        { opacity: 0, transform: 'none' }
      ], { duration: 3600, easing: EASE });
      tag.animate([
        { opacity: 0 }, { opacity: 1, offset: 0.04 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }
      ], { duration: 3700, easing: 'linear' });
    }
    function wake() { if (started && visible && !document.hidden && !running && !timer) timer = setTimeout(beat, 500); }
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) wake();
    }, { threshold: 0.35 }).observe(stage);
    document.addEventListener('visibilitychange', wake);
    // The first beat waits for the hero's own entrance to settle.
    setTimeout(function () { started = true; wake(); }, 1100);
  }

  // ---- 4. The table's pins --------------------------------------------------
  function setupPins() {
    var fig = document.querySelector('.s-table-shot');
    if (!fig) return;
    var pins = all('.s-pin', fig), notes = all('.s-notes li');
    var crop = fig.querySelector('.s-window-crop');
    // A pin outside the phone crop is hidden (its note still reads on its own).
    function clip() {
      var c = crop.getBoundingClientRect();
      pins.forEach(function (p) {
        p.classList.remove('is-out');
        var r = p.getBoundingClientRect();
        var inside = r.left + r.width / 2 > c.left && r.left + r.width / 2 < c.right && r.top + r.height / 2 > c.top && r.top + r.height / 2 < c.bottom;
        p.classList.toggle('is-out', !inside);
      });
    }
    clip();
    window.addEventListener('resize', clip, { passive: true });
    function hot(n, on) {
      pins.forEach(function (p) { p.classList.toggle('is-hot', on && p.getAttribute('data-pin') === n); });
      notes.forEach(function (l) { l.classList.toggle('is-hot', on && l.getAttribute('data-pin') === n); });
    }
    notes.forEach(function (l) {
      var n = l.getAttribute('data-pin');
      l.addEventListener('mouseenter', function () { hot(n, true); });
      l.addEventListener('mouseleave', function () { hot(n, false); });
    });
    if (reduce || !('IntersectionObserver' in window)) return;
    if (fig.getBoundingClientRect().top < (window.innerHeight || 800) * 0.8) return; // already in view: leave it
    fig.classList.add('is-armed');
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      fig.classList.add('is-on');
    }, { threshold: 0.45 });
    io.observe(fig);
  }

  // ---- 5. Pricing roster slider --------------------------------------------
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
      var b = mk('b', null, (v >= max ? max + '+' : v) + (v === 1 ? ' athlete' : ' athletes'));
      var s = mk('span', null, price === '$0' ? 'Free' : name + ' · ' + price);
      out.appendChild(b); out.appendChild(s);
      r.style.setProperty('--p', ((v - 1) / (max - 1) * 100) + '%');
      r.setAttribute('aria-valuetext', b.textContent + ', ' + s.textContent);
    }
    r.addEventListener('input', upd);
    upd();
  }

  // ---- 6. A document's contents (data.html): the section you're reading is marked. ----
  function setupToc() {
    var links = all('.s-toc a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    var heads = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); }).filter(Boolean);
    function mark() {
      var line = (window.innerHeight || 800) * 0.3, cur = heads[0];
      heads.forEach(function (h) { if (h.getBoundingClientRect().top < line) cur = h; });
      links.forEach(function (a) { a.setAttribute('aria-current', a.getAttribute('href') === '#' + cur.id ? 'true' : 'false'); });
    }
    var io = new IntersectionObserver(mark, { rootMargin: '-30% 0px -60% 0px' });
    heads.forEach(function (h) { io.observe(h); });
    window.addEventListener('scrollend', mark, { passive: true });
    mark();
  }

  ready(function () {
    syncNav();
    setupReveal();
    setupHeroLoop();
    setupPins();
    setupRoster();
    setupToc();
    // The nav is drawn by app.js after the session check: measure it once it lands.
    var n = nav();
    if (n && 'MutationObserver' in window) new MutationObserver(syncNav).observe(n, { childList: true });
  });
})();
