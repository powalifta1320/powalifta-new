/* charts.js: Swift-Charts-like marks for the desk, as HTML/inline SVG strings. Rounded bar marks, a quiet grid, labels
   at the line end, a ghost series for "last week", every mark with a tooltip (title), a line that reads out each point on
   hover and on focus (the arrow keys step through it), and every chart with a one-line text summary written by the page.
   Colours come from tokens through CSS variables (--mark, --lc, --c, --tone, --place); no colour is written here. A
   chart with no colour of its own draws in the place's hue (ui.css); a lift's chart in the lift's (o.lift, r.lift). Lift
   names on a chart (hbars' labels, a legend's words) carry data-lift and wear the lift's ink, as they do everywhere
   (13 Nov evening: the colour is back). Every chart root carries data-chart; the look gate exempts what sits inside it by
   that attribute, never by a class list. window.CHARTS */
(function () {
  'use strict';
  var esc = window.K.esc;
  var CH = window.CHARTS = {};
  var pct = function (v) { return (Math.max(0, Math.min(1, v)) * 100).toFixed(2) + '%'; };
  /* a lift's key from { lift } or a class 'lc-squat' (null for anything else) */
  var LIFTS = { squat: 1, bench: 1, deadlift: 1 };
  var liftKey = function (x) {
    if (!x) return null;
    if (x.lift && LIFTS[x.lift]) return x.lift;
    var m = /(?:^|\s)lc-(squat|bench|deadlift)(?:\s|$)/.exec(x.cls || '');
    return m ? m[1] : null;
  };
  var LIFT_VAR = { squat: 'var(--sq)', bench: 'var(--bp)', deadlift: 'var(--dl)' };

  /* vertical bars over a ghost: days = [{ label, now, ghost, today, tip }] */
  CH.bars = function (days, o) {
    o = o || {};
    var max = o.max || Math.max.apply(null, days.map(function (d) { return Math.max(d.now || 0, d.ghost || 0); }).concat([1]));
    return '<div class="bars" data-chart style="--n:' + days.length + '">' + days.map(function (d) {
      return '<span class="d' + (d.today ? ' today' : '') + '" title="' + esc(d.tip || '') + '"><span class="b">' +
        (d.ghost ? '<i class="ghost" style="height:' + pct(d.ghost / max) + '"></i>' : '') +
        (d.now ? '<i class="now" style="height:' + pct(Math.max(d.now / max, 0.06)) + '"></i>' : '') +
        '</span><span class="lab">' + esc(d.label) + '</span></span>';
    }).join('') + '</div>';
  };

  /* horizontal bars labelled at the end: the bar carries the lift's colour, the name is a word (no dot before it).
     rows = [{ cls, lift, label, value, text, tip }]: cls 'lc-squat' or lift 'squat' colours the bar and its name */
  CH.hbars = function (rows, o) {
    o = o || {};
    var max = o.max || Math.max.apply(null, rows.map(function (r) { return Math.abs(r.value); }).concat([0.0001]));
    return '<div class="hbars" data-chart>' + rows.map(function (r) {
      var lk = liftKey(r), cls = (r.cls || '') + (lk && !/lc-/.test(r.cls || '') ? ' lc-' + lk : '');
      return '<span class="k"' + (lk ? ' data-lift="' + lk + '"' : '') + '>' + esc(r.label) + '</span><span class="t ' + cls + '" title="' + esc(r.tip || '') + '"><i style="width:' + pct(Math.abs(r.value) / (max * 1.08)) + '"></i></span><span class="v">' + esc(r.text) + '</span>';
    }).join('') + '</div>';
  };

  /* diverging columns around a rule: vals = [{ v (positive = harder), tip }] */
  CH.diverging = function (vals, o) {
    o = o || {};
    var max = o.max || Math.max.apply(null, vals.map(function (x) { return Math.abs(x.v); }).concat([0.5]));
    return '<div class="div" data-chart>' + vals.map(function (x) {
      var h = Math.abs(x.v) / max * 50;
      return '<span class="c" title="' + esc(x.tip || '') + '">' + (Math.abs(x.v) < 0.05 ? '<i class="on"></i>' : '<i class="' + (x.v > 0 ? 'up' : 'dn') + '" style="height:' + Math.max(8, h).toFixed(1) + '%"></i>') + '</span>';
    }).join('') + '<span class="ax hi">' + esc(o.hi || 'harder') + '</span><span class="ax lo">' + esc(o.lo || 'easier') + '</span></div>';
  };

  /* a dot per person: dots = [{ tone, none, tip }] */
  CH.waffle = function (dots) {
    return '<div class="waffle" data-chart>' + dots.map(function (d) { return '<i class="' + (d.none ? 'none' : 'tone-' + d.tone) + '" title="' + esc(d.tip || '') + '"></i>'; }).join('') + '</div>';
  };

  /* points on a time axis: marks = [{ x (0..1), n, now, tip }], ticks = [x...] */
  CH.timeline = function (marks, o) {
    o = o || {};
    return '<div class="tl" data-chart><span class="ax"></span>' + (o.ticks || []).map(function (x) { return '<span class="tk" style="left:' + pct(x) + '"></span>'; }).join('') +
      marks.map(function (m) { return '<span class="m' + (m.n > 1 ? ' many' : '') + (m.now ? ' now' : '') + '" style="left:' + pct(Math.max(0.04, Math.min(0.96, m.x))) + '" title="' + esc(m.tip || '') + '">' + (m.n > 1 ? m.n : '') + '</span>'; }).join('') +
      '<span class="lab l">' + esc(o.left || '') + '</span><span class="lab r">' + esc(o.right || '') + '</span></div>';
  };

  /* a legend: a square swatch in the mark's colour before each word, never a dot. items = [{ label, tone, lift, place,
     ghost, none }]: lift 'squat' gives the lift's swatch and its name in the lift's ink; place, the page's hue */
  CH.legend = function (items) {
    return '<span class="legend" data-chart>' + items.map(function (x) {
      var lk = liftKey(x);
      var sw = x.none ? 'none' : x.ghost ? 'ghost' : lk ? 'lift lc-' + lk : x.place ? 'place' : 'tone-' + (x.tone || 'quiet');
      return '<span' + (lk ? ' data-lift="' + lk + '"' : '') + '><i class="' + sw + '" aria-hidden="true"></i>' + esc(x.label) + '</span>';
    }).join('') + '</span>';
  };

  /* a monotone curve (Fritsch and Carlson): smooth, yet it never swings past the points it joins, so a flat stretch stays
     flat and a step never dips first (a Catmull-Rom curve overshoots on stepped weekly e1RMs and draws a fall that never
     happened). xy: [[x, y]...] in pixels, x rising. */
  var f1 = function (v) { return v.toFixed(1); };
  CH.smooth = function (xy) {
    var k = xy.length, d = 'M' + f1(xy[0][0]) + ' ' + f1(xy[0][1]), m = [], t = [], i;
    if (k === 2) return d + ' L' + f1(xy[1][0]) + ' ' + f1(xy[1][1]);
    for (i = 0; i < k - 1; i++) m.push((xy[i + 1][1] - xy[i][1]) / ((xy[i + 1][0] - xy[i][0]) || 1));
    t[0] = m[0]; t[k - 1] = m[k - 2];
    for (i = 1; i < k - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (i = 0; i < k - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      var a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { var tau = 3 / Math.sqrt(s); t[i] = tau * a * m[i]; t[i + 1] = tau * b * m[i]; }
    }
    for (i = 0; i < k - 1; i++) {
      var x0 = xy[i][0], y0 = xy[i][1], x1 = xy[i + 1][0], y1 = xy[i + 1][1], h = (x1 - x0) / 3;
      d += ' C' + f1(x0 + h) + ' ' + f1(y0 + t[i] * h) + ' ' + f1(x1 - h) + ' ' + f1(y1 - t[i + 1] * h) + ' ' + f1(x1) + ' ' + f1(y1);
    }
    return d;
  };

  /* a line (monotone), a flat area, the last point marked, two quiet gridlines labelled on the right, x labels under it.
     vals: numbers (null skipped). o: { w, h, cls, c (a CSS colour token, e.g. var(--lc)), lift ('squat': the lift's
     colour; with neither, the place's), fmt, tip(i, v), label,
     xl: [left, right], empty, minSpan, domain: [lo, hi], win, ends }. The scale fits the data unless told otherwise: minSpan
     keeps a steady series flat (a resting heart rate of 56 to 58 with minSpan 16 is a gentle line, not a zigzag), a domain
     shows at least [lo, hi] and never cuts a point. When the high and the low would sit on one line, the one gridline is
     the latest point's, labelled with it, so the number at the line's end is the latest (57, not the high of 58). win: the
     last n points a "Change in 4 weeks" row measures: the line runs full and filled over them, the points before them as
     context at 40 %. The chart takes the focus: hover it or use the arrow keys (Home, End) and a line, a dot and a label
     read one point out; the label is a live region, so the points are read aloud too. */
  var clipN = 0;
  CH.line = function (vals, o) {
    o = o || {};
    var lk = liftKey(o);
    if (lk && !o.c) o = Object.assign({}, o, { c: LIFT_VAR[lk], cls: (o.cls || '') + ' lc-' + lk });
    var w = o.w || 312, h = o.h || 96, padR = 44, padY = 8, pts = [];
    vals.forEach(function (v, i) { if (v != null && !isNaN(v)) pts.push([i, Number(v)]); });
    if (pts.length < 2) return '<p class="none">' + esc(o.empty || 'Not enough to draw yet.') + '</p>';
    var lo = Math.min.apply(null, pts.map(function (p) { return p[1]; })), hi = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
    var sLo = lo, sHi = hi, lo2, hi2;
    if (o.domain) { sLo = Math.min(lo, o.domain[0]); sHi = Math.max(hi, o.domain[1]); lo2 = sLo; hi2 = sHi === sLo ? sLo + 1 : sHi; }
    else {
      if (o.minSpan && hi - lo < o.minSpan) { var mid = (lo + hi) / 2; sLo = mid - o.minSpan / 2; sHi = mid + o.minSpan / 2; }
      var span = Math.max(sHi - sLo, Math.abs(sHi) * 0.01, 1); lo2 = sLo - span * 0.12; hi2 = sHi + span * 0.12;
    }
    var n = Math.max(1, vals.length - 1), pw = w - padR;
    var X = function (i) { return 2 + i / n * (pw - 4); }, Y = function (v) { return padY + (1 - (v - lo2) / (hi2 - lo2)) * (h - padY * 2); };
    var xy = pts.map(function (p) { return [X(p[0]), Y(p[1])]; }), d = CH.smooth(xy);
    var L = xy[xy.length - 1], fmt = o.fmt || function (v) { return String(Math.round(v)); };
    var area = d + ' L' + f1(L[0]) + ' ' + (h - padY) + ' L' + f1(xy[0][0]) + ' ' + (h - padY) + ' Z';
    /* the high and the low, each on a quiet gridline; when the two would touch, one: the latest point's */
    var latest = pts[pts.length - 1][1];
    /* o.ends: the two labels are the first and the latest point (a lift card whose big number is the latest: its line reads
       from where it started to that same number, never a high or a low beside it) */
    var first = pts[0][1];
    var gy = o.ends ? (Math.abs(Y(first) - Y(latest)) < 14 ? [[Y(latest), latest]] : [[Y(first), first], [Y(latest), latest]]) : Math.abs(Y(hi) - Y(lo)) < 14 ? [[Y(latest), latest]] : [[Y(hi), hi], [Y(lo), lo]];
    var read = pts.map(function (p, k) { return [+f1(xy[k][0]), +f1(xy[k][1]), o.tip ? o.tip(p[0], p[1]) : fmt(p[1])]; });
    var last = read[read.length - 1][2];
    /* the window: one path drawn twice, quiet before the window's start and whole inside it (an svg clip, unique per chart) */
    var win = o.win >= 2 && o.win < vals.length ? o.win : 0, marks;
    if (win) {
      var id = 'chw' + (++clipN), x0 = X(vals.length - win);
      marks = '<defs><clipPath id="' + id + '"><rect x="' + f1(x0) + '" y="0" width="' + f1(w - x0) + '" height="' + h + '"/></clipPath></defs>' +
        '<path class="area" d="' + area + '" clip-path="url(#' + id + ')"/><path class="ln ctx" d="' + d + '"/><path class="ln" d="' + d + '" clip-path="url(#' + id + ')"/>';
    } else marks = '<path class="area" d="' + area + '"/><path class="ln" d="' + d + '"/>';
    return '<div class="lchart ' + (o.cls || '') + '" data-chart style="' + (o.c ? '--c:' + o.c + ';' : '') + 'width:' + w + 'px" tabindex="0" role="group" aria-label="' + esc((o.label ? o.label + '. ' : '') + 'Latest ' + last + '. The arrow keys read each point.') + '" data-pts="' + esc(JSON.stringify(read)) + '">' +
      '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(o.label || '') + '">' +
      gy.map(function (g) { return '<line class="grid" x1="0" x2="' + pw + '" y1="' + f1(g[0]) + '" y2="' + f1(g[0]) + '"/>'; }).join('') +
      marks + '<circle class="pt" cx="' + f1(L[0]) + '" cy="' + f1(L[1]) + '" r="4.5"/>' +
      '<line class="scrub" x1="0" x2="0" y1="' + padY + '" y2="' + (h - padY) + '" hidden/><circle class="sdot" r="5" cx="0" cy="0" hidden/></svg>' +
      gy.map(function (g) { return '<span class="yl" style="top:' + f1(g[0]) + 'px">' + esc(fmt(g[1])) + '</span>'; }).join('') +
      (o.xl ? '<div class="xl"><span>' + esc(o.xl[0]) + '</span><span>' + esc(o.xl[1]) + '</span></div>' : '') +
      '<span class="ch-tip" role="status" aria-live="polite" hidden></span></div>';
  };

  /* the readout behind every CH.line: one listener each for the whole page, none on window's scroll */
  var ptsOf = function (el) { if (!el._pts) { try { el._pts = JSON.parse(el.getAttribute('data-pts')) || []; } catch (e) { el._pts = []; } } return el._pts; };
  function readAt(el, i) {
    var P = ptsOf(el); if (!P.length) return;
    i = Math.max(0, Math.min(P.length - 1, i)); el._at = i;
    var p = P[i], line = el.querySelector('.scrub'), dot = el.querySelector('.sdot'), tip = el.querySelector('.ch-tip');
    if (!line || !dot || !tip) return;
    line.setAttribute('x1', p[0]); line.setAttribute('x2', p[0]); line.removeAttribute('hidden');
    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.removeAttribute('hidden');
    if (tip.textContent !== p[2]) tip.textContent = p[2];
    tip.removeAttribute('hidden');
    var tw = tip.offsetWidth, W = el.clientWidth, x = p[0] + 12 + tw > W ? p[0] - 12 - tw : p[0] + 12;
    tip.style.left = Math.round(Math.max(0, Math.min(W - tw, x))) + 'px';
  }
  function readOff(el) {
    el._at = null;
    ['.scrub', '.sdot', '.ch-tip'].forEach(function (s) { var x = el.querySelector(s); if (x) x.setAttribute('hidden', ''); });
  }
  var chartOf = function (t) { return t && t.closest ? t.closest('.lchart[data-pts]') : null; };
  document.addEventListener('pointermove', function (e) {
    var el = chartOf(e.target); if (!el) return;
    var P = ptsOf(el); if (!P.length) return;
    var x = e.clientX - el.getBoundingClientRect().left, best = 0;
    P.forEach(function (p, k) { if (Math.abs(p[0] - x) < Math.abs(P[best][0] - x)) best = k; });
    if (best !== el._at) readAt(el, best);
  });
  document.addEventListener('pointerout', function (e) { var el = chartOf(e.target); if (el && !el.contains(e.relatedTarget) && document.activeElement !== el) readOff(el); });
  document.addEventListener('focusin', function (e) { var el = e.target; if (el && el.matches && el.matches('.lchart[data-pts]')) readAt(el, el._at != null ? el._at : ptsOf(el).length - 1); });
  document.addEventListener('focusout', function (e) { var el = e.target; if (el && el.matches && el.matches('.lchart[data-pts]')) readOff(el); });
  document.addEventListener('keydown', function (e) {
    var el = e.target; if (!el || !el.matches || !el.matches('.lchart[data-pts]') || e.metaKey || e.ctrlKey || e.altKey) return;
    var n = ptsOf(el).length, at = el._at != null ? el._at : n - 1;
    var to = e.key === 'ArrowLeft' ? at - 1 : e.key === 'ArrowRight' ? at + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (to == null) return;
    e.preventDefault(); e.stopImmediatePropagation();   /* the page's own arrow keys (rows, weeks) wait while a chart reads */
    readAt(el, to);
  });
})();
