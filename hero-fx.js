/* ============================================================
 * POWALIFTA hero-fx v2 — JS for the dramatic hero motion layer.
 * Spawns mesh + grid + spotlight + particles, tracks cursor for
 * the spotlight, ticks the +18% counter on load.
 * ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

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

  function tickCounter(pill) {
    if (!pill || pill.dataset.fxTicked === '1') return;
    pill.dataset.fxTicked = '1';

    var html = pill.innerHTML;
    var match = html.match(/([+-])(\d+)(%)/);
    if (!match) return;

    var sign = match[1];
    var target = parseInt(match[2], 10);
    var unit = match[3];
    var fullMatch = match[0];

    var startDelay = 1500;
    var duration = 1600;
    var startTime = null;

    function frame(ts) {
      if (startTime === null) startTime = ts;
      var elapsed = ts - startTime - startDelay;
      if (elapsed < 0) { requestAnimationFrame(frame); return; }
      var p = Math.min(1, elapsed / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      var current = Math.round(eased * target);
      pill.innerHTML = html.replace(fullMatch, sign + current + unit);
      if (p < 1) requestAnimationFrame(frame);
    }

    pill.innerHTML = html.replace(fullMatch, sign + '0' + unit);
    requestAnimationFrame(frame);
  }

  ready(function () {
    var hero = document.querySelector('header.hero');
    if (!hero) return;

    if (!reduced()) {
      injectLayers(hero);
      setupSpotlight(hero);
    }

    var pill = document.querySelector('.hero .hp-pill');
    if (pill && !reduced()) {
      tickCounter(pill);
    }
  });
})();
