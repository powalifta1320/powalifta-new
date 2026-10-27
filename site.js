/* site.js — behaviour for the POWALIFTA website (pairs with site.css).
   The nav turns to glass once the page scrolls, and opens as a menu on phones.
   The homepage's own motion (the hero's set, the phone story, the desk) is landing.js.
   Everything fails soft: with no JS the page is simply all there. */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // ---- Nav -------------------------------------------------------------------
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

  ready(function () {
    syncNav();
    // The nav is drawn by app.js after the session check: measure it once it lands.
    var n = nav();
    if (n && 'MutationObserver' in window) new MutationObserver(syncNav).observe(n, { childList: true });
  });
})();
