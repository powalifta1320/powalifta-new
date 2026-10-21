/* site.js — behaviour for the POWALIFTA website (pairs with site.css).
   1. The nav turns to glass once the page scrolls, and opens as a menu on phones.
   2. Scroll reveal that never hides content by default: only elements that start
      below the fold get .s-wait, and they rise in when they reach the screen.
   3. The hero's rest-timer chip counts down like the app's does.
   Everything fails soft: with no JS, or reduced motion, the page is simply all there. */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- 1. Nav ---------------------------------------------------------------
  function nav() { return document.getElementById('nav'); }
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
        var el = en.target;
        el.classList.add(el.classList.contains('s-wait-rule') ? 's-in-rule' : 's-in');
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    document.querySelectorAll('.s-reveal, .s-meet').forEach(function (el) {
      // On screen (or already scrolled past) at load: leave it exactly as it is.
      if (el.getBoundingClientRect().top < vh * 0.92) return;
      el.classList.add(el.classList.contains('s-meet') ? 's-wait-rule' : 's-wait');
      io.observe(el);
    });
  }

  // ---- 3. Rest-timer chip ---------------------------------------------------
  function setupCountdown() {
    document.querySelectorAll('[data-countdown]').forEach(function (el) {
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

  // ---- 4. The coaching desk's three screens (index.html #desk) ---------------
  function setupDesk() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-desk]'));
    if (!tabs.length) return;
    var imgs = Array.prototype.slice.call(document.querySelectorAll('#deskShot img'));
    function show(i) {
      tabs.forEach(function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
      imgs.forEach(function (im, k) { im.classList.toggle('on', k === i); });
    }
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { show(k); });
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var n = (k + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        show(n); tabs[n].focus();
      });
    });
  }

  ready(function () {
    syncNav();
    setupReveal();
    setupCountdown();
    setupDesk();
    // The nav is drawn by app.js after the session check: measure it once it lands.
    var n = nav();
    if (n && 'MutationObserver' in window) new MutationObserver(syncNav).observe(n, { childList: true });
  });
})();
