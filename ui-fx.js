/* ============================================================
 * POWALIFTA ui-fx — global polish: sticky-nav blur on scroll.
 * Sets .fx-nav-blurred on nav.nav once the user scrolls past 40px.
 * Pure additive — does not touch app.js / db.js / any other logic.
 * ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var nav = document.querySelector('nav.nav');
    if (!nav) return;

    var threshold = 40;
    var ticking = false;

    function update() {
      if (window.scrollY > threshold) nav.classList.add('fx-nav-blurred');
      else nav.classList.remove('fx-nav-blurred');
      ticking = false;
    }
    function onScroll() {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    update();
  });
})();
