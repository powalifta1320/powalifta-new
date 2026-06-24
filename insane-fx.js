/* ============================================================
 * POWALIFTA insane-fx — signature moments.
 *  1. Custom red cursor + trailing ring (smooth lerp).
 *  2. Magnetic .btn-primary buttons (lean toward cursor).
 *  3. Hero headline scramble reveal on first paint.
 *  4. Scroll-driven barbell loader pinned below nav.
 *
 * Auto-disabled on touch devices and under reduced-motion.
 * ============================================================ */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function isTouch() {
    return window.matchMedia && (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches);
  }

  function setupCursor() {
    if (isTouch() || reduced()) return;

    var dot = document.createElement('div');
    dot.className = 'fx-cursor-dot';
    dot.setAttribute('aria-hidden', 'true');

    var ring = document.createElement('div');
    ring.className = 'fx-cursor-ring';
    ring.setAttribute('aria-hidden', 'true');

    document.body.appendChild(ring);
    document.body.appendChild(dot);

    var mx = window.innerWidth / 2, my = window.innerHeight / 2;
    var rx = mx, ry = my;
    var hovering = false, pressing = false, textMode = false;

    function onMove(e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate3d(' + mx + 'px, ' + my + 'px, 0)';

      var t = e.target;
      var isInteractive = t.closest && t.closest('a, button, .btn, [role="button"], .inside-card, .feat, .step, .coach-card, label, summary, .hero-demo-link');
      var isText = t.closest && t.closest('input, textarea, [contenteditable="true"]');
      var nowHover = !!isInteractive;
      var nowText = !!isText;

      if (nowHover !== hovering) {
        hovering = nowHover;
        dot.classList.toggle('fx-cursor-hover', nowHover);
        ring.classList.toggle('fx-cursor-hover', nowHover);
      }
      if (nowText !== textMode) {
        textMode = nowText;
        dot.classList.toggle('fx-cursor-text', nowText);
        ring.classList.toggle('fx-cursor-text', nowText);
      }
    }
    function onDown() { pressing = true; dot.classList.add('fx-cursor-pressed'); }
    function onUp()   { pressing = false; dot.classList.remove('fx-cursor-pressed'); }
    function onLeave(){ dot.style.opacity = '0'; ring.style.opacity = '0'; }
    function onEnter(){ dot.style.opacity = '1'; ring.style.opacity = textMode ? '0' : '1'; }

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    document.addEventListener('mouseleave', onLeave);
    document.addEventListener('mouseenter', onEnter);

    function loop() {
      var k = 0.18;
      rx += (mx - rx) * k;
      ry += (my - ry) * k;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px, ' + ry.toFixed(1) + 'px, 0)';
      requestAnimationFrame(loop);
    }
    loop();
  }

  function setupMagnets() {
    if (isTouch() || reduced()) return;

    var targets = document.querySelectorAll('.btn.btn-primary, .btn.btn-lg, .cta-band .btn');
    if (!targets.length) return;

    targets.forEach(function (btn) {
      btn.classList.add('fx-magnet');

      var rect = null;
      function onEnter() { rect = btn.getBoundingClientRect(); btn.classList.add('fx-magnet-active'); }
      function onMove(e) {
        if (!rect) rect = btn.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (e.clientX - cx) * 0.25;
        var dy = (e.clientY - cy) * 0.25;
        btn.style.transform = 'translate3d(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px, 0)';
      }
      function onLeave() {
        btn.classList.remove('fx-magnet-active');
        btn.style.transform = 'translate3d(0, 0, 0)';
        rect = null;
      }

      btn.addEventListener('mouseenter', onEnter);
      btn.addEventListener('mousemove', onMove);
      btn.addEventListener('mouseleave', onLeave);
    });
  }

  function scrambleHeadline() {
    if (reduced()) return;
    var h1 = document.querySelector('header.hero h1');
    if (!h1 || h1.dataset.fxScrambled === '1') return;
    h1.dataset.fxScrambled = '1';

    var nodes = [];
    function walk(n) {
      if (n.nodeType === 3) {
        if (n.nodeValue.trim().length) nodes.push(n);
      } else if (n.nodeType === 1) {
        for (var i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
      }
    }
    walk(h1);
    if (!nodes.length) return;

    var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!?$#%&*-+=';
    var originals = nodes.map(function (n) { return n.nodeValue; });

    function rand() { return CHARS[Math.floor(Math.random() * CHARS.length)]; }

    function scrambleString(target, progress) {
      var out = '';
      for (var i = 0; i < target.length; i++) {
        var c = target[i];
        if (c === ' ' || c === ' ' || c === '\n') { out += c; continue; }
        if (i / target.length < progress) out += c;
        else out += rand();
      }
      return out;
    }

    var duration = 1100;
    var startDelay = 250;
    var startTime = null;

    nodes.forEach(function (n) { n.nodeValue = scrambleString(n.nodeValue, 0); });
    h1.classList.add('fx-scrambling');

    function frame(ts) {
      if (startTime === null) startTime = ts;
      var elapsed = ts - startTime - startDelay;
      if (elapsed < 0) { requestAnimationFrame(frame); return; }
      var p = Math.min(1, elapsed / duration);
      var eased = 1 - Math.pow(1 - p, 2);
      nodes.forEach(function (n, i) {
        n.nodeValue = scrambleString(originals[i], eased);
      });
      if (p < 1) requestAnimationFrame(frame);
      else {
        nodes.forEach(function (n, i) { n.nodeValue = originals[i]; });
        h1.classList.remove('fx-scrambling');
      }
    }
    requestAnimationFrame(frame);
  }

  function setupBarbellLoader() {
    if (reduced()) return;

    var BAR_VBW = 1000;
    var BAR_VBH = 56;
    var SLEEVE_W = 70;
    var SLEEVE_X_LEFT = 100;
    var SLEEVE_X_RIGHT = BAR_VBW - SLEEVE_X_LEFT - SLEEVE_W;
    var PLATE_COUNT_PER_SIDE = 6;
    var PLATE_WIDTH = 9;
    var PLATE_GAP = 2;
    var BAR_Y = BAR_VBH / 2;

    function plateSpec(side, i) {
      var sleeveX = side === 'left' ? SLEEVE_X_LEFT : SLEEVE_X_RIGHT;
      var direction = side === 'left' ? 1 : -1;
      var sleeveEdge = side === 'left' ? sleeveX + SLEEVE_W : sleeveX;
      var size = 22 - i * 2;
      var x = sleeveEdge + direction * (i * (PLATE_WIDTH + PLATE_GAP) + PLATE_WIDTH / 2);
      return { cx: x, ry: size, rx: PLATE_WIDTH / 2 };
    }

    var wrap = document.createElement('div');
    wrap.className = 'fx-barbell-bar';
    wrap.setAttribute('aria-hidden', 'true');

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + BAR_VBW + ' ' + BAR_VBH);
    svg.setAttribute('preserveAspectRatio', 'none');

    var defs = document.createElementNS(svgNS, 'defs');
    defs.innerHTML =
      '<linearGradient id="fxBarSteel" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#c4c4cc"/>' +
      '<stop offset="50%" stop-color="#8a8a92"/>' +
      '<stop offset="100%" stop-color="#5a5a62"/>' +
      '</linearGradient>' +
      '<linearGradient id="fxPlateRed" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#ff2d3f"/>' +
      '<stop offset="100%" stop-color="#b71629"/>' +
      '</linearGradient>';
    svg.appendChild(defs);

    var shaft = document.createElementNS(svgNS, 'path');
    shaft.setAttribute('class', 'bar-shaft');
    var initialD = 'M ' + (SLEEVE_X_LEFT + SLEEVE_W) + ' ' + BAR_Y + ' Q ' + (BAR_VBW / 2) + ' ' + BAR_Y + ' ' + SLEEVE_X_RIGHT + ' ' + BAR_Y;
    shaft.setAttribute('d', initialD);
    svg.appendChild(shaft);

    var leftSleeve = document.createElementNS(svgNS, 'rect');
    leftSleeve.setAttribute('class', 'bar-sleeve');
    leftSleeve.setAttribute('x', SLEEVE_X_LEFT);
    leftSleeve.setAttribute('y', BAR_Y - 6);
    leftSleeve.setAttribute('width', SLEEVE_W);
    leftSleeve.setAttribute('height', 12);
    leftSleeve.setAttribute('rx', 2);
    svg.appendChild(leftSleeve);

    var rightSleeve = document.createElementNS(svgNS, 'rect');
    rightSleeve.setAttribute('class', 'bar-sleeve');
    rightSleeve.setAttribute('x', SLEEVE_X_RIGHT);
    rightSleeve.setAttribute('y', BAR_Y - 6);
    rightSleeve.setAttribute('width', SLEEVE_W);
    rightSleeve.setAttribute('height', 12);
    rightSleeve.setAttribute('rx', 2);
    svg.appendChild(rightSleeve);

    var plates = [];
    ['left', 'right'].forEach(function (side) {
      for (var i = 0; i < PLATE_COUNT_PER_SIDE; i++) {
        var spec = plateSpec(side, i);
        var p = document.createElementNS(svgNS, 'ellipse');
        p.setAttribute('class', 'bar-plate');
        p.setAttribute('cx', spec.cx);
        p.setAttribute('cy', BAR_Y);
        p.setAttribute('rx', spec.rx);
        p.setAttribute('ry', spec.ry);
        p.style.transformOrigin = spec.cx + 'px ' + BAR_Y + 'px';
        svg.appendChild(p);
        plates.push(p);
      }
    });

    var labelGroup = document.createElementNS(svgNS, 'g');
    var labelTxt = document.createElementNS(svgNS, 'text');
    labelTxt.setAttribute('class', 'progress-label');
    labelTxt.setAttribute('x', BAR_VBW - 30);
    labelTxt.setAttribute('y', BAR_VBH - 6);
    labelTxt.setAttribute('text-anchor', 'end');
    labelTxt.textContent = 'LOAD';
    var pctTxt = document.createElementNS(svgNS, 'text');
    pctTxt.setAttribute('class', 'progress-pct');
    pctTxt.setAttribute('x', BAR_VBW - 30);
    pctTxt.setAttribute('y', 14);
    pctTxt.setAttribute('text-anchor', 'end');
    pctTxt.textContent = '0%';
    labelGroup.appendChild(labelTxt);
    labelGroup.appendChild(pctTxt);
    svg.appendChild(labelGroup);

    wrap.appendChild(svg);
    document.body.appendChild(wrap);

    var loaded = 0;
    var ticking = false;
    function update() {
      var doc = document.documentElement;
      var max = Math.max(1, doc.scrollHeight - window.innerHeight);
      var progress = Math.min(1, Math.max(0, window.scrollY / max));

      var hero = document.querySelector('header.hero');
      var heroVisible = false;
      if (hero) {
        var hr = hero.getBoundingClientRect();
        heroVisible = hr.bottom > 80;
      }
      if (heroVisible && window.scrollY < 120) wrap.classList.remove('fx-visible');
      else wrap.classList.add('fx-visible');

      var target = Math.round(progress * PLATE_COUNT_PER_SIDE);
      var i;
      if (target > loaded) {
        for (i = loaded; i < target; i++) {
          plates[i].classList.add('fx-loaded');
          plates[i + PLATE_COUNT_PER_SIDE].classList.add('fx-loaded');
        }
      } else if (target < loaded) {
        for (i = loaded - 1; i >= target; i--) {
          plates[i].classList.remove('fx-loaded');
          plates[i + PLATE_COUNT_PER_SIDE].classList.remove('fx-loaded');
        }
      }
      loaded = target;

      var bendAmount = progress * 14;
      var newD = 'M ' + (SLEEVE_X_LEFT + SLEEVE_W) + ' ' + BAR_Y + ' Q ' + (BAR_VBW / 2) + ' ' + (BAR_Y + bendAmount) + ' ' + SLEEVE_X_RIGHT + ' ' + BAR_Y;
      shaft.setAttribute('d', newD);

      pctTxt.textContent = Math.round(progress * 100) + '%';

      ticking = false;
    }
    function onScroll() {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  ready(function () {
    setupCursor();
    setupMagnets();
    scrambleHeadline();
  });
})();
