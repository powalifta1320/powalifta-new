/* Logo trace loader: the POWALIFTA mark as a loader. While work is in progress a short stroke runs round the logo's
   outline; when the work completes the outline closes, the filled mark fades in, and onDone is called once.
   Plain JS (no build step, no framework), styled through currentColor; its CSS is logo-trace-loader.css.

     var loader = LogoTraceLoader.create(hostEl, {
       loading: true,            // loop while true; setLoading(false) or complete() resolves it
       isComplete: false,        // true resolves at once, as loading: false does
       size: 48,                 // px, width and height, fixed from the first paint (no layout shift)
       strokeWidth: 1.6,         // in the logo's 32-unit space
       loopDurationSeconds: 1.4, // one lap of the moving stroke
       closeSeconds: 0.45,       // the outline drawing itself whole
       fillFadeSeconds: 0.3,     // the filled mark fading in
       className: '',            // extra classes on the <svg>; colour it with `color`
       ariaLabel: 'Loading',
       doneLabel: 'Loaded',
       onDone: function () {}    // once, after the filled mark is visible
     });
     loader.setLoading(false);  // or loader.complete()
     loader.destroy();

   Phases: loop -> closingOutline -> fadingFill -> done (on the <svg> as data-phase). Each step is timed by setTimeout,
   so nothing waits on an animation event that may never fire (a hidden tab, a display:none parent).
   prefers-reduced-motion: the filled mark shows from the start, and resolving only calls onDone.
   The red plate keeps the brand's red; --logo-plate changes it (currentColor makes the mark one colour). */
(function (W) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var LOGO_VIEW_BOX = '0 0 32 32';
  /* One continuous contour round the whole sleeve (the bar, the red plate, the ink plate, the collar), clockwise from
     the bar's left end: the route the moving stroke follows. */
  var TRACE_PATH = 'M2.9 14.6H8V5.2Q8 3 10.2 3H13.3Q15.5 3 15.5 5.2V14.6H17V9.1Q17 7.5 18.6 7.5H19.4Q21 7.5 21 9.1V14.6H22.5V13.1Q22.5 12 23.6 12H24Q25.1 12 25.1 13.1V14.6H29.1Q30.5 14.6 30.5 16Q30.5 17.4 29.1 17.4H25.1V18.9Q25.1 20 24 20H23.6Q22.5 20 22.5 18.9V17.4H21V22.9Q21 24.5 19.4 24.5H18.6Q17 24.5 17 22.9V17.4H15.5V26.8Q15.5 29 13.3 29H10.2Q8 29 8 26.8V17.4H2.9Q1.5 17.4 1.5 16Q1.5 14.6 2.9 14.6Z';
  /* The mark exactly as app.js BRAND_MARK draws it, its four rounded rectangles as paths. plate: the red one. */
  var FILL_PATHS = [
    { d: 'M2.9 14.6H29.1A1.4 1.4 0 0 1 29.1 17.4H2.9A1.4 1.4 0 0 1 2.9 14.6Z' },
    { d: 'M10.2 3H13.3A2.2 2.2 0 0 1 15.5 5.2V26.8A2.2 2.2 0 0 1 13.3 29H10.2A2.2 2.2 0 0 1 8 26.8V5.2A2.2 2.2 0 0 1 10.2 3Z', plate: true },
    { d: 'M18.6 7.5H19.4A1.6 1.6 0 0 1 21 9.1V22.9A1.6 1.6 0 0 1 19.4 24.5H18.6A1.6 1.6 0 0 1 17 22.9V9.1A1.6 1.6 0 0 1 18.6 7.5Z' },
    { d: 'M23.6 12H24A1.1 1.1 0 0 1 25.1 13.1V18.9A1.1 1.1 0 0 1 24 20H23.6A1.1 1.1 0 0 1 22.5 18.9V13.1A1.1 1.1 0 0 1 23.6 12Z' }
  ];

  function reduced() { try { return !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function svgEl(tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]); return n; }
  function num(v, d) { v = Number(v); return isFinite(v) && v > 0 ? v : d; }

  function create(host, opts) {
    var o = opts || {};
    var size = num(o.size, 48), sw = num(o.strokeWidth, 1.6);
    var loopS = num(o.loopDurationSeconds, 1.4), closeS = num(o.closeSeconds, 0.45), fadeS = num(o.fillFadeSeconds, 0.3);
    var still = reduced(), phase = 'loop', timers = [], resolved = false, finished = false, dead = false;

    var svg = svgEl('svg', { role: 'status', 'aria-label': o.ariaLabel || 'Loading', 'aria-busy': 'true', viewBox: LOGO_VIEW_BOX,
      width: size, height: size, 'class': ('ltl ' + (o.className || '')).trim(), focusable: 'false' });
    var guide = svgEl('path', { d: TRACE_PATH, 'class': 'ltl-guide', fill: 'none', stroke: 'currentColor', 'stroke-width': Math.max(1, sw / 2), 'stroke-linejoin': 'round' });
    var trace = svgEl('path', { d: TRACE_PATH, 'class': 'ltl-trace', fill: 'none', stroke: 'currentColor', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: '1' });
    trace.style.setProperty('--ltl-loop', loopS + 's');
    trace.style.setProperty('--ltl-close', closeS + 's');
    var fill = svgEl('g', { 'class': 'ltl-fill' });
    svg.style.setProperty('--ltl-fade', fadeS + 's');
    FILL_PATHS.forEach(function (p) { fill.appendChild(svgEl('path', { d: p.d, fill: p.plate ? 'var(--logo-plate, #ff2d3f)' : 'currentColor' })); });
    svg.appendChild(guide); svg.appendChild(trace); svg.appendChild(fill);

    function set(p) { phase = p; svg.setAttribute('data-phase', p); }
    function later(fn, s) { timers.push(W.setTimeout(function () { if (!dead) fn(); }, Math.round(s * 1000))); }
    function finish() {
      if (finished || dead) return; finished = true;
      set('done'); svg.setAttribute('aria-label', o.doneLabel || 'Loaded'); svg.removeAttribute('aria-busy');
      if (typeof o.onDone === 'function') { try { o.onDone(); } catch (e) { if (W.console) W.console.error(e); } }
    }
    /* loop -> closingOutline -> fadingFill -> done; under reduced motion the mark is already filled, so only done */
    function complete() {
      if (resolved || dead) return; resolved = true;
      if (still) { finish(); return; }
      set('closingOutline');
      later(function () { set('fadingFill'); later(finish, fadeS + 0.03); }, closeS);
    }

    if (still) { svg.setAttribute('data-still', ''); set('fadingFill'); } else set('loop');
    if (host) host.appendChild(svg);
    if (o.loading === false || o.isComplete) complete();

    return {
      el: svg,
      phase: function () { return phase; },
      complete: complete,
      setLoading: function (on) { if (on === false) complete(); },
      destroy: function () { dead = true; timers.forEach(function (t) { W.clearTimeout(t); }); timers = []; if (svg.parentNode) svg.parentNode.removeChild(svg); }
    };
  }

  W.LogoTraceLoader = { create: create, LOGO_VIEW_BOX: LOGO_VIEW_BOX, TRACE_PATH: TRACE_PATH, FILL_PATHS: FILL_PATHS };
})(window);
