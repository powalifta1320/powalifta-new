/* ============================================================
   POWALIFTA — cookie / privacy consent banner (drop-in module)

   POWALIFTA sets no ad cookies and no cross-site trackers. Storage is:
     • an essential session token + theme preference (localStorage) — required
     • cookieless Plausible analytics — optional, no personal data

   So this is an honest, meaningful consent control, not theatre:
     "Accept"          -> analytics stays on
     "Essential only"  -> sets Plausible's documented `plausible_ignore`
                          flag, which stops all future analytics events

   The decision is remembered in localStorage ('powa-consent') and
   re-applied on every page load (early), so an opt-out sticks. The
   banner only ever shows until a choice is made once.

   No dependencies — runs standalone, before app.js. Vanilla, no build.
   ============================================================ */
(function () {
  'use strict';

  var CHOICE_KEY = 'powa-consent';     // 'all' | 'essential'
  var PLAUSIBLE_OPT_OUT = 'plausible_ignore';  // Plausible reads this before sending

  function readChoice() {
    try { return localStorage.getItem(CHOICE_KEY); } catch (e) { return null; }
  }
  function writeChoice(v) {
    try { localStorage.setItem(CHOICE_KEY, v); } catch (e) {}
  }
  // Translate a stored choice into the live analytics state. Idempotent —
  // safe to call on every page load.
  function applyChoice(choice) {
    try {
      if (choice === 'essential') localStorage.setItem(PLAUSIBLE_OPT_OUT, 'true');
      else localStorage.removeItem(PLAUSIBLE_OPT_OUT);
    } catch (e) {}
  }

  // --- Fast path: a decision already exists -> enforce it, show nothing. ---
  var prior = readChoice();
  if (prior === 'all' || prior === 'essential') {
    applyChoice(prior);
    return;
  }

  var SHIELD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' +
    '<path d="m9 12 2 2 4-4"/></svg>';

  function build() {
    if (document.querySelector('.cc-banner')) return;

    var banner = document.createElement('div');
    banner.className = 'cc-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Privacy and cookies');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML =
      '<div class="cc-icon">' + SHIELD + '</div>' +
      '<div class="cc-body">' +
        '<p class="cc-title">Your privacy</p>' +
        '<p class="cc-text">We keep you signed in with an essential token in your ' +
        'browser, plus cookieless analytics to count visits. No ad cookies, no ' +
        'cross-site tracking, no data selling. ' +
        '<a href="privacy.html">Privacy policy</a></p>' +
      '</div>' +
      '<div class="cc-actions">' +
        '<button type="button" class="cc-btn cc-essential">Essential only</button>' +
        '<button type="button" class="cc-btn cc-accept">Accept</button>' +
      '</div>';

    function decide(choice) {
      writeChoice(choice);
      applyChoice(choice);
      banner.classList.remove('cc-in');
      banner.classList.add('cc-out');
      var done = function () { if (banner.parentNode) banner.remove(); };
      banner.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 500); // fallback if transitionend never fires (reduced motion / hidden tab)
    }

    banner.querySelector('.cc-accept').addEventListener('click', function () { decide('all'); });
    banner.querySelector('.cc-essential').addEventListener('click', function () { decide('essential'); });

    document.body.appendChild(banner);
    // Next frame -> trigger the CSS entrance transition.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('cc-in'); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
