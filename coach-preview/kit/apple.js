/* APPLE PASS — motion (11 Nov 2026). Loaded by K.shell({ pro: true }) after apple.css.
   1. A spring (damping ratio + response, Apple's two numbers) that always starts from the value on screen and
      carries velocity, so every motion can be grabbed and reversed.
   2. The drawer follows the hand: drag its header to the right, it tracks 1:1 from where you grabbed it, rubber-bands
      past the open edge, and on release the throw is projected (Apple's decay formula) to decide close or stay.
   3. Large titles: when the page title scrolls away, a frosted bar with the title takes its place.
   Reduced motion: no springs or slides, short cross-fades instead. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- a spring: x'' = -k(x - to) - c x', mass 1. response = period in seconds, damping = ratio (1 = no overshoot) ---- */
  function Spring(o) { this.x = o.x || 0; this.v = 0; this.raf = 0; this.on = o.on; }
  Spring.prototype.to = function (target, opt) {
    opt = opt || {}; var self = this, k = Math.pow(2 * Math.PI / (opt.response || 0.4), 2), c = 2 * (opt.damping == null ? 1 : opt.damping) * Math.sqrt(k);
    if (opt.velocity != null) this.v = opt.velocity;
    cancelAnimationFrame(this.raf);
    if (reduce) { this.x = target; this.v = 0; this.on(this.x); if (opt.done) opt.done(); return; }
    var last = performance.now();
    var step = function (now) {
      var dt = Math.min(0.032, (now - last) / 1000); last = now;
      for (var i = 0; i < 4; i++) { var h = dt / 4, a = -k * (self.x - target) - c * self.v; self.v += a * h; self.x += self.v * h; }
      if (Math.abs(self.x - target) < 0.4 && Math.abs(self.v) < 8) { self.x = target; self.v = 0; self.on(self.x); if (opt.done) opt.done(); return; }
      self.on(self.x); self.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  };
  Spring.prototype.stop = function () { cancelAnimationFrame(this.raf); };
  var project = function (v, d) { d = d || 0.998; return (v / 1000) * d / (1 - d); };           // where a throw comes to rest
  var rubber = function (over, dim, c) { c = c || 0.55; return (over * dim * c) / (dim + c * Math.abs(over)); };   // soft edges

  /* ---- the drawer ---- */
  function wireDrawer(dr) {
    if (dr._ap) return; dr._ap = true;
    var W = function () { return dr.getBoundingClientRect().width || 520; };
    var open = dr.classList.contains('on'), hide = function () { dr.style.visibility = 'hidden'; };
    var sp = new Spring({ x: open ? 0 : W() + 40, on: function (x) { dr.style.transform = 'translate3d(' + x + 'px,0,0)'; } });
    sp.on(sp.x); if (!open) hide();
    if (reduce) dr.style.transition = 'opacity 180ms ease';
    var throwV = null;
    new MutationObserver(function () {
      var now = dr.classList.contains('on'); if (now === open) return; open = now;
      var v = throwV; throwV = null;
      if (reduce) { dr.style.transform = 'none'; dr.style.visibility = now ? 'visible' : 'hidden'; dr.style.opacity = now ? '1' : '0'; return; }
      dr.style.visibility = 'visible';
      if (now) sp.to(0, { damping: 1, response: 0.36, velocity: v });
      else sp.to(W() + 40, { damping: 1, response: 0.32, velocity: v != null ? v : 0, done: function () { if (!open) hide(); } });
    }).observe(dr, { attributes: true, attributeFilter: ['class'] });
    /* drag the header: 1:1 from the grab point, rubber band past the open edge, projected on release */
    var drag = null;
    dr.addEventListener('pointerdown', function (e) {
      var h = e.target.closest('.dh'); if (!h || e.button !== 0 || e.target.closest('button, a, input, textarea, select') || !open || reduce) return;
      drag = { id: e.pointerId, x0: e.clientX, base: sp.x, hist: [{ x: e.clientX, t: performance.now() }] };
      sp.stop(); h.setPointerCapture(e.pointerId);
    });
    dr.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = drag.base + e.clientX - drag.x0, x = dx >= 0 ? dx : rubber(dx, W());
      sp.x = x; sp.on(x);
      drag.hist.push({ x: e.clientX, t: performance.now() }); if (drag.hist.length > 6) drag.hist.shift();
    });
    var end = function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var hs = drag.hist, a = hs[0], b = hs[hs.length - 1], v = b.t > a.t ? (b.x - a.x) / ((b.t - a.t) / 1000) : 0; drag = null;
      var rest = sp.x + project(v);
      if (rest > W() * 0.42) { throwV = v; var close = dr.querySelector('[data-close], .x'); if (close) close.click(); else dr.classList.remove('on'); }
      else sp.to(0, { damping: Math.abs(v) > 300 ? 0.8 : 1, response: 0.34, velocity: v });
    };
    dr.addEventListener('pointerup', end); dr.addEventListener('pointercancel', end);
  }

  /* ---- large titles: a frosted bar takes the title when it scrolls away ---- */
  function wireTitle(main) {
    if (!main || main._ap) return; main._ap = true;
    var bar = document.createElement('div'); bar.className = 'ap-bar'; bar.setAttribute('aria-hidden', 'true');
    var place = function () {
      var h1 = main.querySelector('.pg-head h1, .pg h1'); if (!h1) { bar.remove(); return null; }
      var sub = main.querySelector('.pg-head .sub');
      bar.innerHTML = '<b>' + (h1.textContent || '').replace(/</g, '&lt;') + '</b>' + (sub ? '<span>' + sub.textContent.replace(/</g, '&lt;') + '</span>' : '');
      if (bar.parentNode !== main || main.firstChild !== bar) main.insertBefore(bar, main.firstChild);
      return h1;
    };
    var h1 = place();
    var tick = function () {
      h1 = h1 && h1.isConnected ? h1 : place(); if (!h1) return;
      var y = main.scrollTop, p = Math.max(0, Math.min(1, (y - 8) / 40));
      bar.classList.toggle('on', p >= 1);
      if (!reduce) { h1.style.opacity = String(1 - p * 0.7); h1.style.transform = 'scale(' + (1 - p * 0.06) + ')'; }
    };
    main.addEventListener('scroll', function () { requestAnimationFrame(tick); }, { passive: true });
    new MutationObserver(function () { if (!bar.isConnected || main.firstChild !== bar) { h1 = place(); tick(); } }).observe(main, { childList: true });
    tick();
  }

  function scan() {
    [].forEach.call(document.querySelectorAll('.v-drawer'), wireDrawer);
    wireTitle(document.getElementById('main'));
  }
  scan();
  new MutationObserver(function (ms) { for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) { var n = ms[i].addedNodes[j]; if (n.nodeType === 1 && n.classList && n.classList.contains('v-drawer')) wireDrawer(n); } }).observe(document.body, { childList: true });
  window.APPLE = { Spring: Spring, project: project, rubber: rubber };
})();
