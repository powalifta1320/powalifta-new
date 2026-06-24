/* ============================================================
 * POWALIFTA hero-fx — JS side of the drop-in motion layer.
 * Spawns dust particles, ticks the +18% counter on load.
 * No external deps. Safe to remove anytime.
 * ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function injectLayers(hero) {
    if (!hero || hero.querySelector('.fx-grid')) return;

    var grid = document.createElement('div');
    grid.className = 'fx-grid';
    grid.setAttribute('aria-hidden', 'true');

    var dust = document.createElement('div');
    dust.className = 'fx-dust';
    dust.setAttribute('aria-hidden', 'true');

    var PARTICLE_COUNT = 26;
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      var s = document.createElement('span');
      s.style.left = (Math.random() * 100) + '%';
      s.style.animationDuration = (10 + Math.random() * 18) + 's';
      s.style.animationDelay = (Math.random() * 14) + 's';
      var scale = 0.4 + Math.random() * 1.4;
      s.style.transform = 'scale(' + scale.toFixed(2) + ')';
      dust.appendChild(s);
    }

    hero.insertBefore(dust, hero.firstChild);
    hero.insertBefore(grid, hero.firstChild);
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
    var duration = 1400;
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

  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  ready(function () {
    var hero = document.querySelector('header.hero');
    if (!hero) return;

    if (!reducedMotion()) {
      injectLayers(hero);
    }

    var pill = document.querySelector('.hero .hp-pill');
    if (pill && !reducedMotion()) {
      tickCounter(pill);
    }
  });
})();
