/* ============================================================
 * POWALIFTA scroll-fx — JS side of the scroll-triggered motion layer.
 *
 * Watches every [data-fx] / [data-fx-stagger] / [data-fx-count] /
 * [data-fx-parallax] / .fx-section-wash element, adds .fx-in when in
 * viewport (uses IntersectionObserver, not scroll listeners).
 *
 * Once an element fires, it stays in — no replay on scroll-back. Set
 * data-fx-replay on the element to re-trigger every entry.
 *
 * Safe to remove anytime: deleting the <script> tag returns the page
 * to its pre-scroll-fx state (initial hidden state is reverted by
 * adding .fx-no-fx to <html>, which scroll-fx.css can use to bail).
 * ============================================================ */
(function () {
  'use strict';

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function tickCount(el) {
    if (el.dataset.fxCountTicked === '1') return;
    el.dataset.fxCountTicked = '1';

    var raw = (el.textContent || '').trim();
    var match = raw.match(/^([^\d\-+]*)([-+]?\d[\d,]*)(\.\d+)?(.*)$/);
    if (!match) return;
    var prefix = match[1] || '';
    var intPart = match[2].replace(/,/g, '');
    var decPart = match[3] || '';
    var suffix = match[4] || '';
    var target = parseFloat(intPart + decPart);
    if (!isFinite(target)) return;

    var decimals = decPart ? decPart.length - 1 : 0;
    var useCommas = /,/.test(match[2]);
    var duration = parseInt(el.dataset.fxCountDuration || '1500', 10);
    var startTime = null;

    function format(n) {
      var s = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toString();
      if (useCommas) {
        var parts = s.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        s = parts.join('.');
      }
      return prefix + s + suffix;
    }

    el.textContent = format(0);

    function frame(ts) {
      if (startTime === null) startTime = ts;
      var p = Math.min(1, (ts - startTime) / duration);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = format(eased * target);
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = format(target);
    }
    requestAnimationFrame(frame);
  }

  function setupParallax() {
    var nodes = document.querySelectorAll('[data-fx-parallax]');
    if (!nodes.length) return;

    var items = [];
    nodes.forEach(function (n) {
      var speed = parseFloat(n.dataset.fxParallax || '0.3');
      items.push({ el: n, speed: speed });
    });

    var ticking = false;
    function update() {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      items.forEach(function (it) {
        var rect = it.el.getBoundingClientRect();
        var offsetFromCenter = (rect.top + rect.height / 2) - vh / 2;
        var translate = -offsetFromCenter * it.speed * 0.15;
        it.el.style.transform = 'translate3d(0, ' + translate.toFixed(1) + 'px, 0)';
      });
      ticking = false;
    }
    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  function setupSectionWashes() {
    var sections = document.querySelectorAll('section, .section');
    sections.forEach(function (sec) {
      if (sec.dataset.fxNoWash === '1') return;
      if (sec.querySelector(':scope > .fx-section-wash')) return;
      var wash = document.createElement('div');
      wash.className = 'fx-section-wash';
      wash.setAttribute('aria-hidden', 'true');
      sec.insertBefore(wash, sec.firstChild);
    });
  }

  ready(function () {
    if (reduced()) {
      document.documentElement.classList.add('fx-no-fx');
      document.querySelectorAll('[data-fx]').forEach(function (el) {
        el.classList.add('fx-in');
      });
      document.querySelectorAll('[data-fx-count]').forEach(function (el) {
        el.classList.add('fx-in');
      });
      return;
    }

    setupSectionWashes();

    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        el.classList.add('fx-in');
        if (el.hasAttribute('data-fx-count')) tickCount(el);
        if (!el.hasAttribute('data-fx-replay')) obs.unobserve(el);
      });
    }, {
      root: null,
      rootMargin: '0px 0px -8% 0px',
      threshold: 0.12
    });

    document.querySelectorAll('[data-fx], [data-fx-stagger], [data-fx-count], .fx-section-wash').forEach(function (el) {
      observer.observe(el);
    });

    setupParallax();
  });
})();
