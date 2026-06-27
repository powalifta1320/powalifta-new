/* ============================================================
 * POWALIFTA hero-fx v3 — JS for the dramatic hero motion layer.
 * Spawns mesh + grid + spotlight + particles, tracks cursor for
 * the spotlight, and orchestrates the "e1RM ignition": a red comet
 * rides the leading edge of the squat line as it draws, and when it
 * lands at the peak it ignites the +18% counter. One coordinated beat.
 * Everything heavy is gated behind prefers-reduced-motion.
 * ============================================================ */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  function injectLayers(hero) {
    if (hero.querySelector('.fx-grid')) return;

    var mesh = document.createElement('div');
    mesh.className = 'fx-gradient-mesh';
    mesh.setAttribute('aria-hidden', 'true');

    var grid = document.createElement('div');
    grid.className = 'fx-grid';
    grid.setAttribute('aria-hidden', 'true');

    var spotlight = document.createElement('div');
    spotlight.className = 'fx-spotlight';
    spotlight.setAttribute('aria-hidden', 'true');

    var dust = document.createElement('div');
    dust.className = 'fx-dust';
    dust.setAttribute('aria-hidden', 'true');

    var PARTICLE_COUNT = 80;
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var s = document.createElement('span');
      var isRed = Math.random() < 0.25;
      s.className = isRed ? 'dust-red' : 'dust-white';
      var size = isRed ? (2 + Math.random() * 3) : (1.5 + Math.random() * 3);
      s.style.width = size.toFixed(1) + 'px';
      s.style.height = size.toFixed(1) + 'px';
      s.style.left = (Math.random() * 100) + '%';
      s.style.animationDuration = (8 + Math.random() * 20) + 's';
      s.style.animationDelay = (Math.random() * 18) + 's';
      dust.appendChild(s);
    }

    hero.insertBefore(mesh, hero.firstChild);
    hero.insertBefore(grid, hero.firstChild);
    hero.insertBefore(spotlight, hero.firstChild);
    hero.insertBefore(dust, hero.firstChild);
  }

  function setupSpotlight(hero) {
    var rect = null;
    var raf = null;
    function recalc() { rect = hero.getBoundingClientRect(); }
    recalc();
    window.addEventListener('resize', recalc, { passive: true });
    window.addEventListener('scroll', recalc, { passive: true });

    function onMove(e) {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        if (!rect) recalc();
        var x = ((e.clientX - rect.left) / rect.width) * 100;
        var y = ((e.clientY - rect.top) / rect.height) * 100;
        hero.style.setProperty('--fx-cursor-x', x.toFixed(1) + '%');
        hero.style.setProperty('--fx-cursor-y', y.toFixed(1) + '%');
        raf = null;
      });
    }
    hero.addEventListener('mousemove', onMove, { passive: true });
  }

  /* Subtle parallax: the chart card lags the scroll a touch, giving the
     hero depth as it leaves the viewport. Capped + rAF-throttled. */
  function setupCardParallax(hero) {
    var card = hero.querySelector('.hero-preview');
    if (!card) return;
    var raf = null;
    function update() {
      raf = null;
      var y = window.scrollY || window.pageYOffset || 0;
      if (y > window.innerHeight) return; // hero gone, stop transforming
      var ty = Math.min(28, y * 0.06);
      card.style.transform = 'translate3d(0,' + ty.toFixed(1) + 'px,0)';
    }
    window.addEventListener('scroll', function () {
      if (!raf) raf = requestAnimationFrame(update);
    }, { passive: true });
  }

  /* Counter tick — eased 0 -> target. startDelay lets the ignition fire it
     exactly as the line lands (default keeps the old standalone timing). */
  function tickCounter(pill, startDelay) {
    if (!pill || pill.dataset.fxTicked === '1') return;
    pill.dataset.fxTicked = '1';

    var html = pill.innerHTML;
    var match = html.match(/([+-])(\d+)(%)/);
    if (!match) return;

    var sign = match[1];
    var target = parseInt(match[2], 10);
    var unit = match[3];
    var fullMatch = match[0];

    var delay = (typeof startDelay === 'number') ? startDelay : 1500;
    var duration = 1100;
    var startTime = null;

    pill.classList.add('hp-pill-igniting');

    function frame(ts) {
      if (startTime === null) startTime = ts;
      var elapsed = ts - startTime - delay;
      if (elapsed < 0) { requestAnimationFrame(frame); return; }
      var p = Math.min(1, elapsed / duration);
      var eased = easeOutCubic(p);
      var current = Math.round(eased * target);
      pill.innerHTML = html.replace(fullMatch, sign + current + unit);
      if (p < 1) requestAnimationFrame(frame);
      else {
        pill.classList.remove('hp-pill-igniting');
        pill.classList.add('hp-pill-lit');
      }
    }

    pill.innerHTML = html.replace(fullMatch, sign + '0' + unit);
    requestAnimationFrame(frame);
  }

  /* The signature moment: a comet rides the squat line's drawing tip, then
     hands off to the counter when it reaches the peak. */
  function igniteHeroChart(svg, pill) {
    var line = svg.querySelector('path'); // first path = squat (red) line, area:false
    var total = 0;
    try { total = line ? line.getTotalLength() : 0; } catch (e) { total = 0; }
    if (!line || !total) { tickCounter(pill, 0); return; }

    var halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('r', '11');
    halo.setAttribute('fill', '#ff2d3f');
    halo.setAttribute('opacity', '0.32');
    halo.setAttribute('pointer-events', 'none');
    halo.style.filter = 'blur(4px)';

    var core = document.createElementNS(NS, 'circle');
    core.setAttribute('r', '4');
    core.setAttribute('fill', '#fff');
    core.setAttribute('pointer-events', 'none');
    core.style.filter = 'drop-shadow(0 0 6px #ff2d3f) drop-shadow(0 0 13px #ff2d3f)';

    var p0 = line.getPointAtLength(0);
    [halo, core].forEach(function (c) {
      c.setAttribute('cx', p0.x); c.setAttribute('cy', p0.y);
      svg.appendChild(c);
    });

    var dur = 1100, t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = easeOutCubic(p);
      var pt;
      try { pt = line.getPointAtLength(e * total); }
      catch (err) {
        // Chart was torn down mid-flight — drop the comet, still light the pill.
        if (halo.parentNode) halo.parentNode.removeChild(halo);
        if (core.parentNode) core.parentNode.removeChild(core);
        tickCounter(pill, 0);
        return;
      }
      halo.setAttribute('cx', pt.x); halo.setAttribute('cy', pt.y);
      core.setAttribute('cx', pt.x); core.setAttribute('cy', pt.y);
      if (p < 1) { requestAnimationFrame(frame); return; }
      // Landed at the peak — fade the comet, ignite the counter.
      halo.style.transition = core.style.transition = 'opacity 0.4s ease-out';
      halo.style.opacity = '0'; core.style.opacity = '0';
      setTimeout(function () {
        if (halo.parentNode) halo.parentNode.removeChild(halo);
        if (core.parentNode) core.parentNode.removeChild(core);
      }, 460);
      tickCounter(pill, 0);
    }
    requestAnimationFrame(frame);
  }

  /* The chart is drawn by the page's own DOMContentLoaded (after this module's),
     so poll briefly for the rendered SVG before igniting. */
  function whenChartReady(cb) {
    var tries = 0;
    (function look() {
      var svg = document.querySelector('#heroChart svg');
      if (svg && svg.querySelector('path')) { cb(svg); return; }
      if (tries++ > 150) { cb(null); return; } // ~2.5s ceiling
      requestAnimationFrame(look);
    })();
  }

  ready(function () {
    var hero = document.querySelector('header.hero');
    if (!hero) return;

    var pill = document.querySelector('.hero .hp-pill');

    if (reduced()) {
      // Static: layers off, comet off, counter left at its markup value (+18%).
      return;
    }

    injectLayers(hero);
    setupSpotlight(hero);
    setupCardParallax(hero);

    whenChartReady(function (svg) {
      if (svg) igniteHeroChart(svg, pill);
      else if (pill) tickCounter(pill, 0);
    });
  });
})();
