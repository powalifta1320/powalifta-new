/* lifter-side.js: the lifter's sidebar on a laptop folds like the coach desk's (the owner, 27 Nov: "add settings etc to
   left side bar, side bar should go in like on coach one"). Ported from coach-preview/kit/r6/desk.js (isPinned,
   setPinned, sideBehaviour); its look is lifter-side.css.

   Where it applies: athlete.html on a laptop only (html:not(.native), min-width 901 px). On a phone, in a window of 900 px
   and under and in the iPhone app nothing here changes anything: the markup it uses (the pin row, Go to, the foot, the
   Settings tab and pane) is hidden there, and in the app (html.native) the Settings tab and pane leave the page before
   the dashboard starts, so the bottom bar and its More sheet are built exactly as before.

   - Folded to a rail of icons (68 px); it opens over the page (248 px, no layout shift) when the pointer rests on it
     (70 ms, so brushing past does nothing) or the keyboard Tabs into it, and folds when the pointer leaves, the focus
     leaves, or on Esc. Its one open state is .is-open, set and cleared here, never CSS :hover or :focus-within, so a
     click inside or a focus left behind can never hold it open (the coach desk's 23 Nov lesson).
   - The pin (the first row, ⌘\ or Ctrl+\) keeps it open and the page makes room (html.ls-pinned); remembered in
     localStorage powa-lifter-side ('open' | 'fold'). athlete.html's head sets html.ls-pinned before the first paint.
     A wide touch screen with no hover starts pinned; on a touch screen a tap on the rail's free space opens it and a
     tap outside folds it.
   - Folded, each place is its icon with a title; the current place keeps its pill, and a sub-screen (Bodyweight,
     Career, ...) lights its parent's icon (.is-current, .ls-via).
   - Settings is a place of its own here (#tab-settings, #pane-settings): You stops showing its Settings, Help and Log out
     groups on a laptop (renderAthleteYou asks LifterSide.isLaptop()); a window that crosses 901 px redraws You, and
     Settings hands over to You when it is no longer there.
   - A tour step that lights a sidebar tab opens the sidebar for that step (the folded rail's row is wider than what
     shows), from the onboarding tour (app.js startTour) and the demo's tour (demo-tour.js, its 'demotour:step' event).

   LifterSide.open() / .close() / .isOpen() / .pin(on) / .pinned() / .isLaptop() for a page or a test. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.documentElement) return;
  var html = document.documentElement;
  var KEY = 'powa-lifter-side';
  var LAPTOP = '(min-width: 901px)';
  var INTENT = 70;

  // The iPhone app and the phone demo (html.native, set in the head before any script) never have the Settings place or
  // the laptop's sidebar rows: they leave the page before the dashboard starts.
  if (html.classList.contains('native')) {
    ['tab-settings', 'pane-settings', 'lsTop', 'lsGotoH', 'lsFoot'].forEach(function (id) { var n = document.getElementById(id); if (n && n.parentNode) n.parentNode.removeChild(n); });
    window.LifterSide = { isLaptop: function () { return false; }, open: function () {}, close: function () {}, isOpen: function () { return false; }, pin: function () {}, pinned: function () { return false; }, boot: function () {}, showSettings: function () {} };
    return;
  }

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function put(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked: the pin lasts for this visit */ } }
  function isLaptop() { return !html.classList.contains('native') && !!(window.matchMedia && matchMedia(LAPTOP).matches); }
  // a touch screen has no hover to open it, so it starts open, but only where there is room (the coach desk's rule)
  function isPinned() { var v = get(); if (v === 'open') return true; if (v === 'fold') return false; try { return matchMedia('(hover: none) and (min-width: 1100px)').matches; } catch (e) { return false; } }
  function side() { return document.querySelector('.dash-shell > .sidebar'); }
  function tab(id) { return document.getElementById('tab-' + id); }
  function pinBtn() { return document.getElementById('lsPin'); }

  function paintPin() {
    var b = pinBtn(); if (!b) return;
    var on = html.classList.contains('ls-pinned');
    var words = on ? 'Fold the sidebar' : 'Keep the sidebar open';
    b.title = words + ' (⌘\\)';
    var l = b.querySelector('span'); if (l) l.textContent = words;
  }
  function setPinned(on) {
    put(on ? 'open' : 'fold');
    html.classList.toggle('ls-pinned', !!on);
    paintPin();
    // the page's width changed: Home's chart and the program editor's frame measure again
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* old browsers */ }
  }
  if (isPinned()) html.classList.add('ls-pinned'); else html.classList.remove('ls-pinned');

  /* ---------------- which place is current ---------------- */
  // The place whose pill shows: the open tab, or for a sub-screen (a tab with data-parent) the place it was opened from.
  function paintCurrent() {
    var s = side(); if (!s) return;
    var tabs = [].slice.call(document.querySelectorAll('.sidebar-tab'));
    var active = tabs.filter(function (t) { return t.classList.contains('active'); })[0];
    var key = active ? (active.dataset.parent || active.dataset.tab) : null;
    var cur = key ? tab(key) : null;
    if (cur && cur.dataset.parent) cur = tab(cur.dataset.parent) || cur;
    tabs.forEach(function (t) {
      var on = t === cur && !t.dataset.parent;
      t.classList.toggle('is-current', on);
      t.classList.toggle('ls-via', on && !!active && active !== t);
    });
  }
  // Each row's name, for the folded rail's tooltip (a laptop only: the narrow window's strip of tabs has its words).
  function paintTitles() {
    var on = isLaptop();
    document.querySelectorAll('.sidebar .sidebar-tab').forEach(function (t) {
      var l = t.querySelector('span:not(.tab-dot):not(.lib-badge)');
      var w = on && l ? l.textContent.trim() : '';
      if (w) { if (t.title !== w) t.title = w; } else if (t.hasAttribute('title')) t.removeAttribute('title');
    });
  }
  // Marketplace reads "Browse programs" in the sidebar's Go to (the words You uses); the phone keeps its own name.
  function paintWords() {
    var m = tab('marketplace'), l = m && m.querySelector('span:not(.lib-badge)');
    if (l) { var w = isLaptop() ? 'Browse programs' : 'Marketplace'; if (l.textContent !== w) l.textContent = w; }
    paintTitles();
  }

  /* ---------------- open and fold (desk.js sideBehaviour, ported) ---------------- */
  var api = { open: function () {}, close: function () {}, isOpen: function () { return false; } };
  var holdTour = false;
  function behaviour() {
    var s = side(); if (!s || s._lsWired) return;
    s._lsWired = true;
    var T = 0, over = false, quiet = false;
    var isTouch = function (e) { return e && e.pointerType === 'touch'; };
    // the keyboard holds it open only when the lifter Tabbed into it: a focus that lands there some other way (a sheet
    // closing and handing its focus back to a sidebar row) must not
    var byTab = false;
    window.addEventListener('keydown', function (e) { if (e.key === 'Tab') byTab = true; }, true);
    window.addEventListener('pointerdown', function () { byTab = false; }, true);
    var keyFocusIn = function () { var a = document.activeElement; try { return !!(byTab && a && s.contains(a) && a.matches(':focus-visible')); } catch (x) { return false; } };
    var set = function (on) {
      clearTimeout(T); T = 0;
      on = !!on && isLaptop();
      if (s.classList.contains('is-open') === on) return;
      s.classList.toggle('is-open', on);
    };
    var settle = function () { if (!over && !keyFocusIn() && !holdTour) set(false); };
    api.open = function () { quiet = false; set(true); };
    api.close = function () { set(false); };
    api.settle = settle;
    api.isOpen = function () { return s.classList.contains('is-open') || (isLaptop() && html.classList.contains('ls-pinned')); };
    s.addEventListener('pointerenter', function (e) {
      if (isTouch(e) || !isLaptop()) return;
      over = true;
      if (quiet || s.classList.contains('is-open')) return;
      clearTimeout(T); T = setTimeout(function () { set(true); }, INTENT);
    });
    // the pointer is over the sidebar's visible part (the rail, or the open width)
    var railW = function () { var v = parseFloat(getComputedStyle(s).getPropertyValue('--ls-rail')); return isFinite(v) && v > 0 ? v : 68; };
    var under = function (e) { var r = s.getBoundingClientRect(), w = api.isOpen() ? r.width : railW(); return e.clientX >= r.left && e.clientX < r.left + w && e.clientY >= r.top && e.clientY < r.bottom; };
    // a leave the pointer did not make (a layer drawn over the sidebar, a scroll under a resting pointer) is checked
    // against where the pointer is: still over it, it stays, and the next move that is really outside folds it
    var watchOut = function () {
      var w = function (e) { if (under(e)) return; window.removeEventListener('pointermove', w, true); over = false; settle(); };
      window.addEventListener('pointermove', w, true);
    };
    s.addEventListener('pointerleave', function (e) {
      if (isTouch(e)) return;
      clearTimeout(T); T = 0;
      if (under(e) && s.classList.contains('is-open')) { watchOut(); return; }
      over = false; quiet = false;
      settle();
    });
    s.addEventListener('focusin', function (e) {
      if (quiet || !isLaptop()) return;
      var t = e.target; try { if (t && t.matches(':focus-visible')) set(true); } catch (x) { /* no :focus-visible: the pointer decides */ }
    });
    s.addEventListener('focusout', function () { setTimeout(function () { if (!s.contains(document.activeElement)) { quiet = false; settle(); } }, 0); });
    s.addEventListener('click', function (e) {
      if (e.target.closest('#lsPin')) { setPinned(!html.classList.contains('ls-pinned')); return; }
      if (e.target.closest('#lsTour')) {
        // the tour lights places on the page: fold first (a click is not a key focus, so nothing holds it)
        over = false; set(false);
        if (window.replayAthleteTour) window.replayAthleteTour();
      }
    });
    // touch: the rail's free space (not a row) opens it; a tap anywhere outside folds it
    s.addEventListener('pointerdown', function (e) {
      if (!isTouch(e) || !isLaptop() || html.classList.contains('ls-pinned') || e.target.closest('button, a[href]')) return;
      set(!s.classList.contains('is-open'));
    });
    document.addEventListener('pointerdown', function (e) { if (isTouch(e) && s.classList.contains('is-open') && !s.contains(e.target)) set(false); }, true);
    // Esc folds it before anything else hears it (it is the topmost thing over the page), unless a sheet, a pop-up or a
    // tour is up (Esc is theirs). A focused Go to row, which a folded sidebar hides, hands its focus to the current place.
    window.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !isLaptop() || html.classList.contains('ls-pinned') || !s.classList.contains('is-open')) return;
      if (document.querySelector('.modal-backdrop.open, .ui-sheet-veil, #tourOverlay, .dtour')) return;
      e.preventDefault(); e.stopPropagation();
      quiet = true; set(false);
      var a = document.activeElement;
      if (a && s.contains(a) && a.matches('.sidebar-tab[data-parent], #lsPin')) { var cur = s.querySelector('.sidebar-tab.is-current') || s.querySelector('.sidebar-tab.active'); if (cur) cur.focus(); }
    }, true);
    // ⌘\ (Ctrl+\): pin or unpin, from anywhere
    var pinKey = function (e) {
      if (e.key !== '\\' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || !isLaptop()) return;
      e.preventDefault(); setPinned(!html.classList.contains('ls-pinned'));
      if (!html.classList.contains('ls-pinned')) settle();
    };
    window.addEventListener('keydown', pinKey, true);
    // ... including from inside the program editor (a same-origin frame that takes the keys while its tab shows:
    // lifter-program.js focusFrame), whose key presses never reach this window
    window.addEventListener('blur', function () {
      setTimeout(function () {
        var f = document.activeElement;
        if (!f || f.tagName !== 'IFRAME') return;
        try { var w = f.contentWindow; if (w && w.document && !w.__lsPinKey) { w.__lsPinKey = true; w.addEventListener('keydown', pinKey, true); } } catch (x) { /* another origin: its keys are its own */ }
      }, 0);
    });
  }

  /* ---------------- a tour step that lights a sidebar row opens the sidebar for that step ---------------- */
  // The folded rail shows 68 px of a 248 px row: the tour's lit area would run over the page. Open, it is the row.
  function tourHold(el) {
    var s = side();
    var want = !!(el && s && s.contains(el) && isLaptop() && !html.classList.contains('ls-pinned'));
    if (want === holdTour) return;
    holdTour = want;
    if (want) api.open(); else if (api.settle) api.settle();
  }
  function watchTours() {
    // the demo's tour says which element each step lights (demo-tour.js)
    document.addEventListener('demotour:step', function (e) { tourHold(e && e.detail ? e.detail.el : null); });
    // the onboarding tour (app.js startTour) draws #tourOverlay for each step; its step's selector names the element
    var check = function () {
      var on = document.getElementById('tourOverlay');
      var el = null;
      if (on) { try { var st = typeof _tourState !== 'undefined' && _tourState ? _tourState.steps[_tourState.idx] : null; el = st && st.selector ? document.querySelector(st.selector) : null; } catch (e) { el = null; } }   // eslint-disable-line no-undef
      if (on || !document.querySelector('.dtour')) tourHold(el);
    };
    try { new MutationObserver(check).observe(document.body, { childList: true }); } catch (e) { /* no observer: the tour lights the row as it is */ }
  }

  /* ---------------- Settings, a place of its own on a laptop ---------------- */
  function showSettings() {
    if (!isLaptop()) { var y = tab('you'); if (y) y.click(); return; }
    if (typeof window.renderAthleteSettings === 'function') window.renderAthleteSettings();
  }
  function onWidth(e) {
    var s = side();
    paintWords();
    if (!e.matches && s) s.classList.remove('is-open');
    var a = document.querySelector('.sidebar-tab.active');
    if (!a) return;
    // Settings is not there under 901 px: You, with its groups back, takes over
    if (!e.matches && a.dataset.tab === 'settings') { var y = tab('you'); if (y) y.click(); return; }
    if (a.dataset.tab === 'you' && typeof window.renderAthleteYou === 'function') window.renderAthleteYou();
  }

  // From the dashboard's start (athlete.html bootstrap, after the tabs have their names and parents).
  function boot() {
    var t = tab('settings');
    if (t) t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg><span>Settings</span>';
    // Settings belongs to You's hue (app.js SCREEN_ACCENT; one key added, the map is not replaced)
    try { if (typeof SCREEN_ACCENT !== 'undefined' && SCREEN_ACCENT && !SCREEN_ACCENT.settings) SCREEN_ACCENT.settings = 'violet'; } catch (e) { /* no accents */ }   // eslint-disable-line no-undef
    paintPin();
    paintWords();
    paintCurrent();
    behaviour();
    watchTours();
    try {
      var obs = new MutationObserver(function () { paintCurrent(); paintTitles(); });
      // (one observe per tab: a second call on the same tab would replace the first's options) a label drawn later (the
      // Coach tab's dot, the library's count) keeps the titles right
      document.querySelectorAll('.sidebar-tab').forEach(function (b) { obs.observe(b, { attributes: true, attributeFilter: ['class', 'data-parent'], childList: true }); });
    } catch (e) { /* no observer */ }
    if (window.matchMedia) {
      var mq = matchMedia(LAPTOP);
      if (mq.addEventListener) mq.addEventListener('change', onWidth); else if (mq.addListener) mq.addListener(onWidth);
    }
    // another tab of the same dashboard pinned or folded it: follow
    window.addEventListener('storage', function (e) { if (e.key === KEY) { html.classList.toggle('ls-pinned', isPinned()); paintPin(); try { window.dispatchEvent(new Event('resize')); } catch (x) { /* none */ } } });
  }

  window.LifterSide = {
    boot: boot, isLaptop: isLaptop, showSettings: showSettings,
    open: function () { api.open(); }, close: function () { api.close(); }, isOpen: function () { return api.isOpen(); },
    pin: function (on) { setPinned(!!on); }, pinned: function () { return html.classList.contains('ls-pinned'); }
  };
})();
