/* landing.js — the homepage's motion that needs a script (pairs with landing.css).
   1. The hero phone: today's date, the e1RM counting up and the rest timer, in step
      with the CSS timeline that plays the set (that timeline needs no script).
   2. The story: on a laptop the hero's phone pins and changes screen as each chapter
      crosses the middle of the window. Switched on only from inside the observer's
      first callback, so without a working observer the page stays stacked and whole.
   3. The coaching desk: Today, a lifter and the builder cycle while the desk is on
      screen (pause button, stops for good once you pick a tab), each with its touch.
   4. One-time arrivals: the calculator's max counts up, the laptop settles flat, the
      coach screens rise into their windows, the closing mark loads its plates. Each
      waiting state is set only by an observer that has already seen the thing below.
   Never runs inside the iPhone app (html.native shows the welcome screen instead). */
(function () {
  'use strict';
  var html = document.documentElement;
  if (html.classList.contains('native')) return;

  function mq(q) { return window.matchMedia ? window.matchMedia(q) : { matches: false, addEventListener: function () {} }; }
  function onChange(m, fn) { if (m.addEventListener) m.addEventListener('change', fn); else if (m.addListener) m.addListener(fn); }
  var reduceMQ = mq('(prefers-reduced-motion: reduce)');
  var reduce = reduceMQ.matches;
  onChange(reduceMQ, function () { reduce = reduceMQ.matches; });
  var hasIO = 'IntersectionObserver' in window;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var easeOut = function (t) { return 1 - Math.pow(1 - t, 3); };

  // Count a number in an element from `from` to `to`. Stops if anyone else writes the element.
  function countUp(el, from, to, ms, fmt) {
    if (!el) return;
    fmt = fmt || function (v) { return String(Math.round(v)); };
    var start = null, last = fmt(from);
    el.textContent = last;
    function frame(now) {
      if (el.textContent !== last) return;
      if (start == null) start = now;
      var t = Math.min(1, (now - start) / ms);
      last = fmt(from + (to - from) * easeOut(t));
      el.textContent = last;
      if (t < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  // Where a CSS animation on `el` is now (ms since it began), or null.
  function cssClock(el) {
    var a = el && el.getAnimations ? el.getAnimations() : [];
    return a.length && a[0].currentTime != null ? Number(a[0].currentTime) : null;
  }
  // Once: set a waiting state on targets the observer reports below the screen, then the
  // arrival when they come up. Anything already on screen (or above) is left alone.
  function arrive(targets, opts) {
    if (!hasIO || reduce || !targets.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var el = en.target;
        if (en.isIntersecting) {
          if (el.classList.contains('is-armed')) {
            requestAnimationFrame(function () { el.classList.add('is-in'); if (opts && opts.onIn) opts.onIn(el); });
          } else if (opts && opts.onIn) opts.onIn(el, true);
          io.unobserve(el);
        } else if (en.boundingClientRect.top > 0 && !el.classList.contains('is-armed')) {
          el.classList.add('is-armed');
        } else {
          io.unobserve(el);
        }
      });
    }, { rootMargin: (opts && opts.margin) || '0px 0px -12% 0px', threshold: 0 });
    targets.forEach(function (t) { io.observe(t); });
  }

  // ---- 1. The hero phone -------------------------------------------------------------
  function hero() {
    var date = $('.tr-date');
    if (date) { try { date.textContent = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · '; } catch (e) {} }
    var chipIn = $('.s-chip-e1rm .s-chip-in'), e1 = $('.s-e1rm'), clock = $('.tr-clock');
    var t = reduce ? null : cssClock(chipIn);
    // The e1RM: 182.5 kg x 3 @ 8 is 210.5 (calcE1RM), shown whole like the app: 211, up from 207.
    if (t != null && t < 3200 && e1) {
      e1.textContent = '207';
      setTimeout(function () { countUp(e1, 207, 211, 700); }, 3200 - t + 80);
    }
    // The rest timer: 3:00 from the moment the dock lands, kept to the clock (not to ticks).
    if (t != null && clock) {
      var startAt = performance.now() + Math.max(0, 4360 - t), total = 180;
      var fmt = function (s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); };
      var timer = setInterval(function () {
        if (document.hidden) return;
        var left = total - Math.floor(Math.max(0, performance.now() - startAt) / 1000);
        if (left <= 0) { clock.textContent = '0:00'; clearInterval(timer); return; }
        clock.textContent = fmt(left);
      }, 250);
    }
  }

  // ---- 2. The story --------------------------------------------------------------------
  function story() {
    var lift = $('.s-lift');
    if (!lift || !hasIO) return;
    var stage = $('.s-stage', lift);
    var scrs = $$('.s-scr', stage);
    var lights = $$('.s-stage-light i', stage);
    var steps = [$('.s-hero', lift)].concat($$('.s-ch', lift));
    var wide = mq('(min-width: 900px) and (min-height: 560px)');
    var cur = 0, io = null, armed = false;

    function arm() {
      if (armed) return; armed = true;
      scrs.forEach(function (s) { var src = s.getAttribute('data-src'); if (src) { s.src = src; s.removeAttribute('data-src'); } });
    }
    function show(i) {
      if (i === cur || i < 0 || i >= scrs.length) return;
      cur = i;
      lift.setAttribute('data-scr', String(i));
      scrs.forEach(function (s) { s.classList.toggle('is-on', Number(s.getAttribute('data-scr')) === i); });
      var hue = steps.filter(function (s) { return Number(s.getAttribute('data-scr')) === i; })[0];
      hue = hue ? hue.getAttribute('data-hue') : 'fire';
      lights.forEach(function (l) { l.classList.toggle('is-on', l.classList.contains('is-' + hue)); });
      if (i > 0) arm();
    }
    function mark(step) {
      steps.forEach(function (s) { s.classList.toggle('is-on', s === step); });
      show(Number(step.getAttribute('data-scr')) || 0);
    }
    function enable() {
      if (io) return;
      io = new IntersectionObserver(function (entries) {
        // The observer works: the story can take over the layout.
        if (!lift.classList.contains('is-story')) { lift.classList.add('is-story'); setTimeout(arm, 1600); }
        entries.forEach(function (en) { if (en.isIntersecting) mark(en.target); });
      }, { rootMargin: '-46% 0px -53% 0px', threshold: 0 });
      steps.forEach(function (s) { io.observe(s); });
    }
    function disable() {
      if (!io) return;
      io.disconnect(); io = null;
      lift.classList.remove('is-story');
      lift.removeAttribute('data-scr');
      steps.forEach(function (s) { s.classList.remove('is-on'); });
      cur = -1; show(0);
    }
    steps[0].classList.add('is-on');
    if (wide.matches) enable();
    onChange(wide, function () { if (wide.matches) enable(); else disable(); });
  }

  // ---- 3. The coaching desk ------------------------------------------------------------
  function desk() {
    var root = document.getElementById('desk');
    if (!root) return;
    var tabs = $$('[data-desk]', root);
    var imgs = $$('.s-laptop-screen img', root);
    var caps = $$('.s-desk-caps li', root);
    var chips = $$('.s-live-c', root);
    var seg = $('.s-seg', root), segOn = $('.s-seg-on', root);
    var play = $('.s-desk-play', root), panel = document.getElementById('deskShot');
    var DWELL = 6500, cur = 0, timer = null, chipTimer = null, inView = false;
    var playing = !reduce, stopped = false;
    if (!tabs.length || !imgs.length) return;
    root.classList.add('is-live');
    seg.classList.add('is-live');

    function clipTo(i) {
      var b = tabs[i]; if (!b || !segOn) return;
      var w = segOn.clientWidth, l = b.offsetLeft - segOn.offsetLeft, r = w - l - b.offsetWidth;
      segOn.style.setProperty('--l', Math.max(0, l) + 'px');
      segOn.style.setProperty('--r', Math.max(0, r) + 'px');
    }
    function live(i) {
      clearTimeout(chipTimer);
      chips.forEach(function (c, k) { if (k !== i) c.classList.remove('is-on'); });
      var c = chips[i]; if (!c) return;
      if (reduce) { c.classList.add('is-on'); return; }
      c.classList.remove('is-on');
      chipTimer = setTimeout(function () {
        c.classList.add('is-on');
        // Today: the job ticks off and the week's count drops. A lifter: the voice note lands.
        // The builder: the notation types, then the load it works out to.
        if (c.animate) {
          if (i === 0) {
            var n = $('.s-live-n', c), chk = $('.s-live-check svg', c);
            if (n) n.textContent = '24';
            if (chk) chk.animate([{ strokeDashoffset: 24 }, { strokeDashoffset: 0 }], { duration: 420, delay: 380, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' });
            setTimeout(function () { if (n) { n.textContent = '23'; n.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); } }, 820);
          } else if (i === 1) {
            $$('.s-live-wave i', c).forEach(function (bar, k) {
              bar.animate([{ transform: 'scaleY(0.12)' }, { transform: getComputedStyle(bar).transform }], { duration: 420, delay: 160 + k * 28, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' });
            });
          } else if (i === 2) {
            var ty = $('.s-live-type', c), eq = $('.s-live-eq', c);
            if (ty) ty.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 560, delay: 220, easing: 'steps(8, end)', fill: 'backwards' });
            if (eq) eq.animate([{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 860, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' });
          }
        }
      }, 520);
    }
    function show(i, focus) {
      cur = i;
      tabs.forEach(function (t, k) { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
      if (panel) panel.setAttribute('aria-labelledby', tabs[i].id);
      imgs.forEach(function (im, k) { im.classList.toggle('is-on', k === i); });
      caps.forEach(function (c, k) { c.classList.toggle('is-on', k === i); });
      clipTo(i);
      live(i);
      if (focus) tabs[i].focus();
    }
    function paintPlay() {
      if (!play) return;
      play.classList.toggle('is-paused', !playing);
      play.setAttribute('aria-label', playing ? 'Pause the tour' : 'Play the tour');
    }
    function schedule() {
      clearTimeout(timer);
      if (play) { play.classList.remove('is-running'); void play.offsetWidth; }
      if (!playing || stopped || !inView || document.hidden) return;
      if (play) { play.style.setProperty('--l-dwell', DWELL + 'ms'); play.classList.add('is-running'); }
      timer = setTimeout(function () { show((cur + 1) % tabs.length); schedule(); }, DWELL);
    }
    tabs.forEach(function (t, k) {
      t.addEventListener('click', function () { stopped = true; playing = false; paintPlay(); schedule(); show(k); });
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        var n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (k + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        stopped = true; playing = false; paintPlay(); schedule(); show(n, true);
      });
    });
    if (play && !reduce) {
      play.hidden = false;
      play.addEventListener('click', function () { playing = !playing; stopped = false; paintPlay(); schedule(); });
    }
    paintPlay();
    show(0);
    window.addEventListener('resize', function () { clipTo(cur); }, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { clipTo(cur); });
    document.addEventListener('visibilitychange', schedule);
    if (hasIO) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var was = inView; inView = en.isIntersecting;
          if (inView && !was) { live(cur); schedule(); } else if (!inView) schedule();
        });
      }, { rootMargin: '0px 0px -20% 0px', threshold: 0.25 }).observe(root);
    }
  }

  // ---- 4. One-time arrivals -------------------------------------------------------------
  function arrivals() {
    // The calculator's max counts up the first time it comes into view.
    var out = document.getElementById('calcOut'), card = $('.calc-card');
    if (card && out && hasIO && !reduce) {
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        var final = out.textContent, to = parseFloat(String(final).replace(/,/g, ''));
        if (!(to > 0)) return;
        countUp(out, 0, to, 900, function (v) { return Math.round(v).toLocaleString(); });
        setTimeout(function () { if (/^[\d,]+$/.test(out.textContent) && Math.abs(parseFloat(out.textContent.replace(/,/g, '')) - to) < 1) out.textContent = final; }, 1000);
      }, { rootMargin: '0px 0px -25% 0px' });
      io.observe(card);
    }
    arrive($$('.s-desk-stage'), { margin: '0px 0px -8% 0px' });
    var bento = $('.s-bento');
    if (bento) $$('.s-tile-shot img', bento).forEach(function (im, k) { im.style.setProperty('--i', String(k)); });
    arrive(bento ? [bento] : [], { margin: '0px 0px -10% 0px' });
    arrive($$('.s-cta'), { margin: '0px 0px -15% 0px' });
  }

  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    try { hero(); } catch (e) {}
    try { story(); } catch (e) {}
    try { desk(); } catch (e) {}
    try { arrivals(); } catch (e) {}
  });
})();
