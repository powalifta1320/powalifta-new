/* ============================================================
 * POWALIFTA scroll-fx v2 — JS for scroll-triggered animation layer.
 * Watches [data-fx] / [data-fx-stagger] / [data-fx-count] /
 * [data-fx-parallax] / .fx-section-wash elements. Applies .fx-in
 * when in viewport. Also flags parent sections so the red intro
 * bar wipe fires once the section is reached.
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

  function flagParentSection(el) {
    var p = el.parentNode;
    while (p && p !== document.body) {
      if (p.tagName === 'SECTION' || (p.classList && p.classList.contains('section'))) {
        p.classList.add('fx-section-revealed');
        break;
      }
      p = p.parentNode;
    }
  }

  // Reveal everything immediately — the safe state. Used for reduced-motion and as
  // the fallback whenever the scroll-reveal machinery can't run, so the page is
  // never left stuck at the [data-fx] opacity:0 default (i.e. never ships blank).
  function revealAll() {
    document.querySelectorAll('[data-fx], [data-fx-stagger], [data-fx-count], .fx-section-wash')
      .forEach(function (el) { el.classList.add('fx-in'); });
    document.querySelectorAll('section, .section')
      .forEach(function (s) { s.classList.add('fx-section-revealed'); });
  }

  ready(function () {
    if (reduced()) {
      document.documentElement.classList.add('fx-no-fx');
      revealAll();
      return;
    }

    // Old browsers / some headless renderers lack IntersectionObserver — show it all
    // rather than leave the page invisible behind the opacity:0 default.
    if (!('IntersectionObserver' in window)) { revealAll(); return; }

    setupSectionWashes();

    try {
      var observer = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          el.classList.add('fx-in');
          flagParentSection(el);
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
    } catch (e) {
      // If the observer construction/observe throws, fall back to fully-visible.
      revealAll();
      return;
    }

    setupParallax();

    // Failsafe: reveal anything already at/above the fold that the observer didn't
    // catch (deep-link hash landing mid-page, attach race, bfcache restore). Only
    // touches elements that are already on screen, so below-the-fold scroll reveals
    // still fire normally — this just guarantees nothing visible lingers blank.
    setTimeout(function () {
      var vh = window.innerHeight || document.documentElement.clientHeight || 800;
      document.querySelectorAll('[data-fx]:not(.fx-in), [data-fx-stagger]:not(.fx-in), [data-fx-count]:not(.fx-in)')
        .forEach(function (el) {
          if (el.getBoundingClientRect().top < vh * 0.92) {
            el.classList.add('fx-in');
            flagParentSection(el);
            if (el.hasAttribute('data-fx-count')) tickCount(el);
          }
        });
    }, 1400);
  });
})();
