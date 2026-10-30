/* ============================================================
   POWALIFTA — the privacy note (drop-in module)

   POWALIFTA sets no ad cookies and no cross-site trackers. Storage is:
     • an essential session token + theme preference (localStorage) — required
     • cookieless Plausible analytics — optional, no personal data

   So this is an honest, meaningful choice, not theatre:
     "Accept"          -> analytics stays on
     "Essential only"  -> sets Plausible's documented `plausible_ignore`
                          flag, which stops all future analytics events

   The decision is remembered in localStorage ('powa-consent') and
   re-applied on every page load (early), so an opt-out sticks. The
   note only ever shows until a choice is made once.

   When it shows (2026-10-29): only once the reader has scrolled past the
   opening (a screen down, or to the end of a shorter page), never over a
   first visit's first frame, which is the page the owner approved. Its
   stylesheet (cookie-consent.css) is loaded then, so no page blocks on it,
   and the card is added only once its styles are in (never unstyled).

   No dependencies — runs standalone, before app.js. Vanilla, no build.
   ============================================================ */
(function () {
  'use strict';

  // Apple 5.1.2(i): inside the native shell there is NO cookie/consent surface.
  // The app uses no tracking cookies (auth + theme are localStorage; Plausible is
  // cookieless), so the web consent banner is both unnecessary and — to an App
  // Review reader — misleading ("this app deals in cookies → it must track"). We
  // suppress the banner entirely AND force analytics fully OFF via Plausible's
  // documented opt-out flag, so the app transmits zero analytics: the honest,
  // provable "we do not track" posture. A total no-op on the web.
  var _nativeShell = !!(
    (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
    (document.documentElement && document.documentElement.classList.contains('native'))
  );
  if (_nativeShell) {
    try { localStorage.setItem('plausible_ignore', 'true'); } catch (e) {}
    return;
  }

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

  // Past the opening: a screen down (90% of one), or the end of a page shorter than that. A page that doesn't
  // scroll (404, an invite link) never shows the note; the next page read past its opening does.
  function pastOpening() {
    var de = document.documentElement;
    var y = window.pageYOffset || de.scrollTop || 0;
    var h = window.innerHeight || de.clientHeight || 0;
    var max = Math.max(0, (de.scrollHeight || 0) - h);
    return h > 0 && (y >= h * 0.9 || (y > 0 && max > 0 && y >= max - 2));
  }
  function whenPastOpening(cb) {
    var queued = false, done = false;
    function check() {
      queued = false;
      if (done || !pastOpening()) return;
      done = true;
      window.removeEventListener('scroll', onScroll);
      cb();
    }
    function onScroll() { if (!queued) { queued = true; requestAnimationFrame(check); } }
    window.addEventListener('scroll', onScroll, { passive: true });
    check();
  }
  // The card's styles, loaded when it is about to show. If they can't load, the card stays away rather than
  // arriving unstyled; the choice is asked on a later page.
  function withStyles(cb) {
    var link = document.querySelector('link[rel="stylesheet"][href$="cookie-consent.css"]');
    if (link && link.sheet) { cb(); return; }
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/cookie-consent.css';
      document.head.appendChild(link);
    }
    link.addEventListener('load', function () { cb(); }, { once: true });
  }

  function build() {
    if (document.querySelector('.cc-banner') || readChoice()) return;

    var banner = document.createElement('div');
    banner.className = 'cc-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Privacy and cookies');
    banner.setAttribute('aria-live', 'polite');
    banner.innerHTML =
      '<p class="cc-text">We count visits without cookies. No ad cookies, no tracking across sites. ' +
      '<a href="/privacy.html">Privacy policy</a></p>' +
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
      setTimeout(done, 400); // fallback if transitionend never fires (reduced motion / hidden tab)
    }

    banner.querySelector('.cc-accept').addEventListener('click', function () { decide('all'); });
    banner.querySelector('.cc-essential').addEventListener('click', function () { decide('essential'); });

    document.body.appendChild(banner);
    // Next frame -> trigger the CSS entrance transition.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { banner.classList.add('cc-in'); });
    });
  }

  function start() { whenPastOpening(function () { withStyles(build); }); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
