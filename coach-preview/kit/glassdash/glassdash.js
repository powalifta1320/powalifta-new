/* glassdash.js: the desk's glass is its dark theme (glassdash.css, every rule under html.gd). The head of each desk
   page sets html.gd before the first paint when the theme is dark; this keeps it in step when the coach switches the
   theme (desk.js sets data-theme): dark is glass, light is the desk's light look as it was. Nothing else. */
(function () {
  var h = document.documentElement;
  function sync() { h.classList.toggle('gd', h.getAttribute('data-theme') !== 'light'); }
  sync();
  if (window.MutationObserver) new MutationObserver(sync).observe(h, { attributes: true, attributeFilter: ['data-theme'] });
})();
