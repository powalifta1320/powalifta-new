/* ============================================================
 * POWALIFTA signature-fx — Kinetic Steel + Chalk Force (motion layer).
 *
 * The steel headline itself is pure CSS (signature-fx.css) so it can never
 * fail to render. This file adds ONLY the atmospheric motion, on a lightweight
 * 2D canvas behind the type:
 *   - a chalk-dust field that drifts upward, billows away from the cursor, and
 *     settles when the pointer goes idle;
 *   - a single #ff2d3f force-line threading horizontally through the headline,
 *     with a travelling pulse and a soft glow.
 *
 * Bulletproof by design: no WebGL, no CDN, no text rasterisation, no dependency
 * on hiding the real headline. Desktop + fine-pointer + motion-allowed only;
 * everywhere else the hero is the untouched static steel headline.
 * ============================================================ */
(function () {
  'use strict';

  // ---- guards ---------------------------------------------------------------
  var mm = window.matchMedia;
  function reduced() { return mm && mm('(prefers-reduced-motion: reduce)').matches; }
  function coarse()  { return mm && (mm('(pointer: coarse)').matches || mm('(hover: none)').matches); }

  // Motion is enhancement only. Bail → the static CSS steel headline stays.
  if (reduced() || coarse() || window.innerWidth < 760) return;

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });

  function boot() {
    // let the first paint (LCP = the headline) settle before we spin anything up
    (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(start, { timeout: 1200 });
  }

  // ---------------------------------------------------------------------------
  function start() {
    var hero = document.querySelector('.hero');
    var h1 = hero && hero.querySelector('h1');
    if (!hero || !h1) return;

    var canvas = document.createElement('canvas');
    canvas.className = 'fx-chalk-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    hero.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var W = 0, H = 0;
    var lineY = 0;            // vertical centre of the headline (force-line height)
    var parts = [];
    var COUNT = 0;

    // pointer state (px, hero-local) + smoothed + speed-derived "energy"
    var px = -999, py = -999, ppx = -999, ppy = -999;
    var energy = 0;          // 0..1, decays toward 0 on idle
    var have = false;        // pointer seen yet
    var t0 = performance.now();

    var BILLOW_R = 170;      // px radius the cursor pushes chalk
    var BILLOW_F = 0.9;      // billow strength

    function layout() {
      var r = hero.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      var hr = h1.getBoundingClientRect();
      lineY = (hr.top - r.top) + hr.height * 0.5;

      seed();
    }

    function seed() {
      // density scales with hero area, capped for fill-rate safety
      COUNT = Math.max(70, Math.min(200, Math.round(W * H / 8200)));
      parts.length = 0;
      for (var i = 0; i < COUNT; i++) parts.push(newPart(true));
    }

    function newPart(anywhere) {
      return {
        x: Math.random() * W,
        y: anywhere ? Math.random() * H : H * (0.6 + Math.random() * 0.5),
        vx: (Math.random() - 0.5) * 0.05,
        vy: -(0.04 + Math.random() * 0.16),       // gentle upward drift
        r: 0.5 + Math.random() * 2.4,
        a: 0.05 + Math.random() * 0.18             // base alpha
      };
    }

    // ---- input --------------------------------------------------------------
    function onMove(e) {
      var r = hero.getBoundingClientRect();
      var nx = e.clientX - r.left, ny = e.clientY - r.top;
      if (have) {
        var sp = Math.hypot(nx - px, ny - py);
        energy = Math.min(1, energy + Math.min(1, sp / 55) * 0.7 + 0.05);
      }
      px = nx; py = ny; have = true;
    }
    window.addEventListener('mousemove', onMove, { passive: true });

    // ---- cursor-tracked rim-light -------------------------------------------
    // After the one-shot forge sheen lands, the headline's rim-light stops being
    // a canned sweep and starts following the pointer: the glint slides across
    // the steel as the cursor crosses the hero, so the metal "catches the light".
    // Held off until the CSS sheen finishes so the two never fight over
    // background-position. Desktop-only (this whole module is gated to fine
    // pointers), and it goes quiet once the hero scrolls away.
    var rimLive = false;
    function updateRim() {
      if (!rimLive) return;
      var frac = Math.max(0, Math.min(1, ppx / W));
      // map pointer across the hero onto the sheen's travel (150% .. -50%)
      var pos = 150 - frac * 200;
      h1.style.backgroundPosition = pos.toFixed(1) + '% 0, 0 0';
    }

    // ---- scroll: fade + lift + hand-off as the hero leaves ------------------
    var fade = 1;
    var stretch = 0;          // 0..1, drives force-line tension + steel dim
    function onScroll() {
      var r = hero.getBoundingClientRect();
      var p = Math.min(1, Math.max(0, -r.top / Math.max(1, H * 0.85)));
      fade = 1 - p;
      stretch = p;
      canvas.style.transform = 'translateY(' + (p * -36) + 'px)';
      canvas.style.opacity = fade;
      // steel recedes as the eye moves into the features section (red stays lit)
      h1.style.setProperty('--fx-steel-bright', (1 - p * 0.55).toFixed(3));
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    // ---- pause off-screen / hidden ------------------------------------------
    var running = true, raf = null;
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else go();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) go(); else stop();
      }, { threshold: 0 }).observe(hero);
    }
    function go()   { if (!raf) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    // ---- resize (debounced) -------------------------------------------------
    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { layout(); onScroll(); }, 160);
    });

    layout();

    // ---- the frame ----------------------------------------------------------
    function frame(now) {
      raf = null;
      ctx.clearRect(0, 0, W, H);

      // pointer smoothing + idle decay
      ppx += (px - ppx) * 0.18;
      ppy += (py - ppy) * 0.18;
      energy *= 0.94;

      var time = (now - t0) * 0.001;

      updateRim();
      drawForceLine(time);
      drawChalk();

      if (running) raf = requestAnimationFrame(frame);
    }

    // chalk dust ---------------------------------------------------------------
    function drawChalk() {
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];

        // cursor billow
        if (have && energy > 0.02) {
          var dx = p.x - ppx, dy = p.y - ppy;
          var d = Math.hypot(dx, dy);
          if (d < BILLOW_R && d > 0.01) {
            var f = (1 - d / BILLOW_R) * BILLOW_F * energy / d;
            p.vx += dx * f;
            p.vy += dy * f;
          }
        }

        // integrate + damping toward the slow base drift
        p.vx *= 0.92;
        p.vy = p.vy * 0.92 - 0.06;        // keep a little upward bias
        p.x += p.vx;
        p.y += p.vy;

        // wrap when it drifts off the top / sides
        if (p.y < -6) { p.y = H + 6; p.x = Math.random() * W; p.vx = 0; p.vy = -(0.04 + Math.random() * 0.16); }
        if (p.x < -6) p.x = W + 6; else if (p.x > W + 6) p.x = -6;

        var a = p.a * (0.5 + 0.5 * fade);
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.2);
        g.addColorStop(0, 'rgba(238,240,246,' + a + ')');
        g.addColorStop(1, 'rgba(238,240,246,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3.2, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // red force-line -----------------------------------------------------------
    function drawForceLine(time) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // wobble grows with field energy, but pulls TAUT as the hero hands off
      var amp = (7 + 5 * energy) * (1 - stretch * 0.85);
      var step = 14;
      var pts = [];
      for (var x = -20; x <= W + 20; x += step) {
        var y = lineY
          + Math.sin(x * 0.012 + time * 1.4) * amp
          + Math.sin(x * 0.045 - time * 2.1) * (amp * 0.35);
        pts.push([x, y]);
      }

      // tension swells the line as the hero hands off — it loads up like a cable
      var tension = stretch;

      // soft outer glow
      ctx.strokeStyle = 'rgba(255,45,63,' + (0.16 + tension * 0.5).toFixed(3) + ')';
      ctx.lineWidth = 9 + tension * 6;
      ctx.lineCap = 'round';
      stroke(pts);

      // bright core (whitens + thickens under load)
      ctx.strokeStyle = 'rgba(255,' + Math.round(90 + tension * 70) + ',104,0.9)';
      ctx.lineWidth = 1.4 + tension * 2.4;
      stroke(pts);

      // travelling pulse node
      var tp = (time * 0.16) % 1;
      var nx = tp * W;
      var ny = lineY
        + Math.sin(nx * 0.012 + time * 1.4) * amp
        + Math.sin(nx * 0.045 - time * 2.1) * (amp * 0.35);
      var ng = ctx.createRadialGradient(nx, ny, 0, nx, ny, 26);
      ng.addColorStop(0, 'rgba(255,80,96,0.9)');
      ng.addColorStop(0.4, 'rgba(255,45,63,0.4)');
      ng.addColorStop(1, 'rgba(255,45,63,0)');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(nx, ny, 26, 0, 6.2832);
      ctx.fill();

      ctx.restore();
    }

    function stroke(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    // ---- reveal -------------------------------------------------------------
    // Don't gate the reveal on rAF (it's paused on hidden tabs / headless renders).
    ppx = W / 2; ppy = H * 0.32;
    onScroll();                       // sets inline opacity = fade (crossfades in)
    canvas.classList.add('fx-chalk-in');
    go();

    // forge-in: the steel rises (CSS), and the chalk puffs off it as it lands
    hero.classList.add('fx-forge');
    setTimeout(puff, 820);

    // Once the one-shot sheen has landed (0.7s delay + 2.6s sweep ≈ 3.3s), hand
    // the rim-light to the cursor. Removing .fx-forge clears the held CSS
    // animation so our inline background-position can take over cleanly.
    setTimeout(function () {
      h1.style.backgroundPosition = '-50% 0, 0 0';   // seamless from the sheen's end
      hero.classList.remove('fx-forge');
      rimLive = true;
      updateRim();
    }, 3500);

    // a one-time radial burst of dust from behind the headline
    function puff() {
      var cx = W / 2, cy = lineY;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var dx = p.x - cx, dy = p.y - cy;
        var d = Math.hypot(dx, dy) || 1;
        var imp = (0.7 + Math.random() * 1.5) * (1 - Math.min(1, d / (W * 0.6)));
        p.vx += (dx / d) * imp;
        p.vy += (dy / d) * imp - 0.35;
      }
      energy = 1;
      go();
    }
  }
})();
