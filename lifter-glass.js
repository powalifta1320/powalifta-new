/* lifter-glass.js: the lifter app's dark theme is glass (lifter-glass.css, every rule under html.lg). athlete.html's
   head sets html.lg before the first paint when the theme is dark; this keeps it in step when the lifter switches the
   theme (dark is glass, light is the light look as it was), and tells the stylesheet how tall the top bar is on a
   laptop (--lg-top: the frosted window starts under it). Nothing else: no data, no behaviour. */
(function () {
  var h = document.documentElement;
  function sync() { h.classList.toggle('lg', h.getAttribute('data-theme') !== 'light'); }
  sync();
  if (window.MutationObserver) new MutationObserver(sync).observe(h, { attributes: true, attributeFilter: ['data-theme'] });
  function top() {
    var n = document.querySelector('.nav');
    if (!n) return;
    var r = n.getBoundingClientRect();
    if (r.height > 0) h.style.setProperty('--lg-top', Math.round(r.height) + 'px');
  }
  top();
  window.addEventListener('load', top);
  window.addEventListener('resize', top, { passive: true });
  if (window.ResizeObserver) { var n = document.querySelector('.nav'); if (n) new ResizeObserver(top).observe(n); }
})();
