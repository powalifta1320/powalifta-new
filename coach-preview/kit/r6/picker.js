/* picker.js: window.PICK, the one exercise picker (22 Nov; the owner: "proper exercise selections should be there").
   A popover grown from the thing clicked (DESK.pop): a search field, the groups, the exercises. It is used wherever a
   line's exercise is chosen or changed: Simple's lines and its add row, the line menu's "Change the exercise", and the
   import's unknown names. It writes nothing: the caller gets the exercise back and makes the change itself.

     PICK.open(trigger, { value, block, c, title, place, onPick({ name, lift, variant, known }), onClose() })

   - Type to search (BLOCK.libSearch: names, the short names coaches type, first letters, a muscle). ↑ ↓ move, Enter
     takes the lit one, Esc closes. The groups stand down the side (22 Nov: they were a row of chips that wrapped): it
     opens on the group of the exercise being changed, with that exercise lit; adding one, on All with this block's own
     exercises first (and what was done on each last week). Typing searches every group.
   - A name the library does not know is offered as itself, last in the list. If its words name no lift it asks once
     which lift it counts toward (None is an answer): a squat, bench or deadlift line works from that lift's max.
   Loads after block.js and desk.js. */
(function () {
  'use strict';
  var W = window, BL = W.BLOCK, D = W.DESK, K = W.K;
  if (!BL || !D || !K) return;
  var esc = K.esc;
  var SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>';
  var uid = 0;
  var cap1 = function (s) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };

  function open(trigger, o) {
    o = o || {};
    var b = o.block || null, c = o.c, id = 'pk' + (++uid), q = '', group = '', at = 0, opts = [], done = false;
    var groups = (BL.LIB_GROUPS || []).filter(function (g) { return g.id !== 'own'; });
    /* changing an exercise opens on its own group */
    var lib0 = o.value && BL.libFind ? BL.libFind(o.value) : null; if (lib0 && groups.some(function (g) { return g.id === lib0.group; })) group = lib0.group;
    var mine = function () {   /* the block's own line names, in the order the block holds them */
      var seen = {}, out = []; if (!b) return out;
      b.rows.forEach(function (row, r) { var k = row.name.toLowerCase(); if (row.line || seen[k]) return; seen[k] = 1; var lw = c != null && b.lastWeek ? b.lastWeek(r, c) : null; /* what was lifted on it last week, when something was (a session still to come says nothing here) */
        out.push({ name: row.name, lift: row.lift || null, here: true, last: lw && lw.text && lw.state === 'lifted' ? lw.text : '' }); });
      return out;
    };
    var cur = String(o.value || '').toLowerCase(), first = true;

    function build() {
      var html = '', list = [], add = function (e, note) { e.note = note || ''; list.push(e); };
      var head = function (t) { html += '<p class="pk-h" role="presentation">' + esc(t) + '</p>'; };
      var row = function (e, i) {
        return '<div class="pk-o' + (e.fresh ? ' is-new' : '') + '" role="option" id="' + id + '-' + i + '" data-pk-i="' + i + '" aria-selected="' + (i === at) + '"' + (e.lift ? ' data-lift="' + esc(e.lift) + '"' : '') +
          (e.name.toLowerCase() === cur ? ' aria-current="true"' : '') + '><span class="pk-n">' + (e.fresh ? 'Use “' + esc(e.name) + '”' : esc(e.name)) + '</span>' + (e.note ? '<small>' + esc(e.note) + '</small>' : '') + '</div>';
      };
      var label = function (g) { var x = groups.filter(function (y) { return y.id === g; })[0]; return x ? x.label : ''; };
      if (q) {
        var hits = BL.libSearch(q, { block: b, group: group || undefined, limit: 40 });
        hits.forEach(function (e) { add(e, e.here || e.own ? 'in this block' : group ? '' : label(e.group)); });
        var exact = hits.some(function (e) { return e.name.toLowerCase() === q.toLowerCase(); }) || !!BL.libFind(q);
        if (!exact) add({ name: cap1(q), fresh: true, lift: null }, 'not in the library');
        html = list.map(row).join('');
      } else {
        var own = group ? [] : mine();
        if (own.length) { head('In this block'); own.forEach(function (e) { add(e, e.last ? 'last week ' + e.last : ''); html += row(e, list.length - 1); }); }
        (group ? groups.filter(function (g) { return g.id === group; }) : groups).forEach(function (g) {
          var es = BL.libSearch('', { group: g.id }); if (!es.length) return;
          if (!group) head(g.label);
          es.forEach(function (e) { add(e, ''); html += row(e, list.length - 1); });
        });
      }
      opts = list;
      if (first && cur) { var ci0 = -1; list.forEach(function (e, i) { if (ci0 < 0 && e.name.toLowerCase() === cur) ci0 = i; }); if (ci0 >= 0) { at = ci0; html = list.map(row).join(''); } }
      first = false;
      if (at >= opts.length) at = Math.max(0, opts.length - 1);
      return html || '<p class="pk-none">Nothing by that name. Type it in full to add it as your own.</p>';
    }
    function chips() {
      return [{ id: '', label: 'All' }].concat(groups).map(function (g) { return '<button type="button" class="pk-g" data-pk-group="' + esc(g.id) + '" aria-pressed="' + (g.id === group) + '"' + (g.id && /^(squat|bench|deadlift)$/.test(g.id) ? ' data-lift="' + g.id + '"' : '') + '>' + esc(g.label) + '</button>'; }).join('');
    }
    var el = D.pop.open(trigger, '<div class="pk" data-pick><h3 class="pk-t">' + esc(o.title || 'Choose an exercise') + '</h3>' +
      '<label class="field pk-q">' + SEARCH + '<input type="text" role="combobox" aria-expanded="true" aria-controls="' + id + '" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Search, or type a new one" aria-label="Search exercises"></label>' +
      '<div class="pk-body"><div class="pk-gs" role="group" aria-label="Groups">' + chips() + '</div>' +
      '<div class="pk-l" id="' + id + '" role="listbox" aria-label="Exercises">' + build() + '</div></div></div>',
      { label: o.title || 'Choose an exercise', place: o.place, focus: '.pk-q input' });
    el.classList.add('is-pick');
    var input = el.querySelector('.pk-q input'), listEl = el.querySelector('.pk-l');

    function light(scroll) {
      [].forEach.call(listEl.querySelectorAll('.pk-o'), function (x) { x.setAttribute('aria-selected', String(+x.getAttribute('data-pk-i') === at)); });
      var hi = listEl.querySelector('.pk-o[aria-selected="true"]');
      if (hi) { input.setAttribute('aria-activedescendant', hi.id); if (scroll) hi.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
    }
    function paint() { listEl.innerHTML = build(); listEl.scrollTop = 0; light(false); }
    function finish(e) {
      if (done) return; done = true;
      var read = BL.readLiftName ? BL.readLiftName(e.name) : { lift: e.lift || null, variant: '' };
      var out = { name: e.name, lift: e.fresh ? e.lift : (e.lift !== undefined ? e.lift : read.lift), variant: read.variant || '', known: !e.fresh };
      D.pop.close();
      if (typeof o.onPick === 'function') o.onPick(out);
    }
    /* a new name whose words name no lift: one question, answered by a button (Esc closes the picker, nothing changes) */
    function ask(e) {
      var wrap = el.querySelector('.pk');
      wrap.innerHTML = '<h3 class="pk-t">Which lift does ' + esc(e.name) + ' count toward?</h3><p class="lede">A squat, bench or deadlift line works its loads from that lift’s max. Anything else is typed in kilos.</p>' +
        '<div class="pk-ask">' + [['squat', 'Squat'], ['bench', 'Bench'], ['deadlift', 'Deadlift'], ['', 'None of them']].map(function (x) { return '<button type="button" class="btn' + (x[0] ? '' : ' quiet') + '" data-pk-lift="' + x[0] + '"' + (x[0] ? ' data-lift="' + x[0] + '"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>';
      var first = wrap.querySelector('[data-pk-lift=""]'); if (first) first.focus();
    }
    function take(i) {
      var e = opts[i]; if (!e) return;
      if (e.fresh) { var read = BL.readLiftName ? BL.readLiftName(e.name) : { lift: null }; if (read.lift) { e.lift = read.lift; finish(e); } else ask(e); return; }
      finish(e);
    }

    /* typing searches the whole library: a group picked before does not hide what is in another */
    el.addEventListener('input', function (ev) { if (ev.target !== input) return; var had = q; q = input.value.trim(); at = 0; if (q && !had && group) { group = ''; el.querySelector('.pk-gs').innerHTML = chips(); } paint(); });
    setTimeout(function () { light(true); }, 0);
    el.addEventListener('keydown', function (ev) {
      if (ev.target !== input) return;
      var k = ev.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') { ev.preventDefault(); if (!opts.length) return; at = (at + (k === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length; light(true); }
      else if (k === 'Home' && !q) { ev.preventDefault(); at = 0; light(true); }
      else if (k === 'End' && !q) { ev.preventDefault(); at = Math.max(0, opts.length - 1); light(true); }
      else if (k === 'Enter') { ev.preventDefault(); take(at); }
    });
    el.addEventListener('pointermove', function (ev) { var x = ev.target.closest && ev.target.closest('.pk-o'); if (!x) return; var i = +x.getAttribute('data-pk-i'); if (i !== at) { at = i; light(false); } });
    el.addEventListener('click', function (ev) {
      var t = ev.target, x;
      if ((x = t.closest('.pk-o'))) { take(+x.getAttribute('data-pk-i')); return; }
      if ((x = t.closest('[data-pk-group]'))) { group = x.getAttribute('data-pk-group'); at = 0; el.querySelector('.pk-gs').innerHTML = chips(); paint(); input.focus(); return; }
      if ((x = t.closest('[data-pk-lift]'))) { var e = opts.filter(function (y) { return y.fresh; })[0]; if (e) { e.lift = x.getAttribute('data-pk-lift') || null; finish(e); } }
    });
    /* closed without a pick (Esc, a click away): the caller hears it once, after the popover has gone */
    var off = D.on ? D.on('pop:closed', function () { if (off) { off(); off = null; } el.classList.remove('is-pick'); if (!done && typeof o.onClose === 'function') o.onClose(); }) : null;
    return el;
  }

  W.PICK = { open: open };
})();
