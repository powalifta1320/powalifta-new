/* simple.js: the Simple view of a lifter's week on Programs.
   22 Nov rebuild (the owner: "I'm not able to edit the lift if it's already been entered … it isn't organized enough at
   all … not practical or usable enough from a coach's side from a day-to-day basis … inline editing, keyboard
   navigation … drag and drop, undo, redo, duplicating entire training days or weeks").
   The whole week on one page, day under day in date order. Each lift is one line of plain fields that reads like a
   sentence: the exercise, sets × reps, RPE or %, the load, last week beside it, a note. Every part is changed where it
   stands: the exercise through the picker (kit/r6/picker.js), the numbers by typing or their − and +. A line is dragged
   by its grip to another place or another day; ⌥⇧↑ ⌥⇧↓ do the same from the keys. Tab moves across a line, Enter down the
   column, ↑ ↓ step a number, ⌘D duplicates the line, ⌘Z and ⇧⌘Z undo and redo.
   It edits the same block the sheet edits, through the page's own write (opts.apply = programs.html gridApply), so every
   change is one Undo step and Advanced shows it at once. SIMPLE.grid(host, opts) answers what the page asks of any grid:
   render, select, sel, focus, flush, day, destroy.
   opts: block() the page's block, c the week's index, lifter { first }, apply(fn(block), label, { say }),
   onRowMenu(r, btn), onDayMenu(day, btn), onSaveTemplate(btn), onAdvanced(), onUndo(), onRedo() (the page's own history,
   else the block's). */
(function () {
  'use strict';
  var W = window, K = W.K, BL = W.BLOCK, esc = K.esc;
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var day0 = function (iso) { var d = iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00') : null; return d && !isNaN(d) ? d : null; };
  var dShort = function (iso) { var d = day0(iso); return d ? WD[d.getDay()] + ' ' + d.getDate() : ''; };
  var dLong = function (iso) { var d = day0(iso); return d ? WD[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] : ''; };
  var nf = function (v) { return BL && BL.nf ? BL.nf(v) : String(Math.round(v * 100) / 100); };
  /* a day's name in sentence case, its own capitals kept ("SBD heavy", never "Sbd heavy"): the rule every other grid uses */
  var sentence = function (t) { return String(t || '').trim().split(/\s+/).map(function (w, i) { return !i ? w.charAt(0).toUpperCase() + w.slice(1) : /^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase(); }).join(' '); };
  var low1 = function (s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); };
  var isInt = function (t) { return /^\d+$/.test(String(t)); };
  var isNum = function (t) { return /^\d+(\.\d+)?$/.test(String(t)); };
  /* [field, the column's word]; STEP: what ↑ ↓ and − + change a field by */
  var FIELDS = [['sets', 'Sets'], ['reps', 'Reps'], ['effort', 'RPE or %'], ['load', 'Load']];
  var STEP = { sets: 1, reps: 1, effort: 0.5, load: 2.5 };
  var MORE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>';
  var GRIP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6.5" r="1.5"/><circle cx="15" cy="6.5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17.5" r="1.5"/><circle cx="15" cy="17.5" r="1.5"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>';
  var UNDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8h7a5 5 0 0 1 0 10H9M8 8l3.5-3.5M8 8l3.5 3.5"/></svg>';
  var REDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 8H9a5 5 0 0 0 0 10h6M16 8l-3.5-3.5M16 8l-3.5 3.5"/></svg>';
  var HINT = 'Click a lift or a number to change it. Click a grip to pick lifts; drag it to move one.';
  var LIFTED = 'This week was lifted. It stays as it was.';
  var still = function () { try { return W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function grid(host, o) {
    o = o || {};
    var ci = o.c, dead = false, pending = null, pendingEl = null, lastDay = null, drag = null, bads = {};
    var b = function () { return o.block(); };
    var first = (o.lifter && o.lifter.first) || 'the lifter';
    var rowIx = function (key) { var rows = b().rows; for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return i; return -1; };
    var ixIn = function (bb, key) { for (var i = 0; i < bb.rows.length; i++) if (bb.rows[i].key === key) return i; return -1; };
    var gone = function () { return { error: { message: 'That line is gone.' } }; };
    var has = function (bb, r) { var w = bb.weeks[ci]; return !!(w && bb.rows[r] && bb.rows[r].cells[w.uid]); };
    var say = function (t) { var DK = W.DESK; if (DK && DK.toast) DK.toast(t); };
    var weekNo = function (bb, c) { return (bb.weeks[c] || {}).n || c + 1; };

    /* ---------- the picture ---------- */
    function fieldHtml(bb, r, f, sub) {
      var key = bb.rows[r].key, ro = bb.isRO(r, ci), t = bb.fieldText(r, ci, f[0], { ascii: true }) || '', auto = '', bad = bb.badField && bb.badField(r, ci, f[0]) != null;
      if (f[0] === 'load' && !t) { var L = bb.load(r, ci); if (L && L.kg != null) auto = nf(L.kg) + (L.kgHi != null && L.kgHi !== L.kg ? '-' + nf(L.kgHi) : ''); }
      var id = key + '|' + f[0], step = f[0] === 'sets' || f[0] === 'reps';
      var inp = '<input class="sv-in" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-sv-field="' + f[0] + '" data-f="' + esc(id) + '" data-v="' + esc(t) + '" value="' + esc(t) + '"' +
        (auto ? ' placeholder="' + esc(auto) + '"' : !ro && (f[0] === 'effort' || f[0] === 'load') ? ' placeholder="–"' : '') + (ro ? ' disabled' : '') + ' aria-label="' + esc(f[1] + (f[0] === 'load' ? ' in kg' : '') + ', ' + bb.rows[r].name + (sub ? ', ' + sub : '')) + '"' + (bad ? ' aria-invalid="true"' : '') + '>';
      if (step) return '<span class="sv-step sv-c-' + f[0] + '"><button type="button" tabindex="-1" data-sv-step="-1" data-f="' + esc(id + '|-') + '" aria-label="One less"' + (ro || !isInt(t) || +t <= 1 ? ' disabled' : '') + '>−</button>' + inp +
        '<button type="button" tabindex="-1" data-sv-step="1" data-f="' + esc(id + '|+') + '" aria-label="One more"' + (ro || (t && !isInt(t)) ? ' disabled' : '') + '>+</button></span>';
      if (f[0] === 'load') return '<span class="sv-kg sv-c-load' + (auto ? ' is-auto' : t ? '' : ' is-empty') + '">' + inp + '<i aria-hidden="true">kg</i></span>';
      return '<span class="sv-c-' + f[0] + '">' + inp + '</span>';
    }
    function noteHtml(bb, r, label) {
      var row = bb.rows[r], note = bb.fieldText(r, ci, 'note') || '', ro = bb.isRO(r, ci), cue = !note && row.note ? String(row.note) : '';
      /* the line's standing cue (shown to the lifter every week) reads where this week's own note would go, until one is written */
      return '<span class="sv-c-note' + (cue ? ' has-cue' : '') + '"' + (cue ? ' title="' + esc('Every week: ' + cue + ' A note typed here is for this week only.') + '"' : '') + '><input class="sv-in sv-note" type="text" maxlength="160" autocomplete="off" data-sv-field="note" data-f="' + esc(row.key + '|note') + '" data-v="' + esc(note) + '" value="' + esc(note) + '"' + (ro ? (cue ? ' disabled placeholder="' + esc(cue) + '"' : ' disabled') : ' placeholder="' + esc(cue || 'Add a note') + '"') + ' aria-label="' + esc('Note for ' + first + ' on ' + row.name + (label ? ', ' + label : '')) + '"></span>';
    }
    function lastHtml(bb, r) {
      var row = bb.rows[r], w = bb.weeks[ci], lw = bb.lastWeek ? bb.lastWeek(r, ci) : null;
      /* a line already lifted this week says what was lifted, where a line still to come says last week's */
      var cx = row.cells[w.uid] || null, done = cx && cx.lifted && bb.lastWeek ? bb.lastWeek(r, ci, { from: ci }) : null;
      if (done && done.text) return '<span class="sv-c-last sv-last is-done" title="' + esc('Lifted ' + done.text) + '"><span class="sv-lk">Lifted</span> ' + esc(done.text) + '</span>';
      return '<span class="sv-c-last sv-last"' + (lw && lw.text ? ' title="' + esc('Last week ' + lw.text) + '"' : '') + '>' + (lw && lw.text ? esc(lw.text) : '') + '</span>';
    }
    function rowHtml(bb, r, label) {
      var row = bb.rows[r], ro = bb.isRO(r, ci), bits = [];
      if (!label) {
        /* the variant is said only when the name does not already say it ("Close-grip bench" says Close Grip) */
        var plain = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
        if (row.variant && row.variant !== 'Competition' && plain(row.name).indexOf(plain(row.variant)) < 0 && !(row.variant === 'RDL' && /romanian/i.test(row.name)) && !(row.variant === 'Pin Press' && /pin/i.test(row.name))) bits.push(row.variant);
        if (row.pause) bits.push(row.pause + ' s pause');
        if (row.tempo) bits.push('tempo ' + row.tempo);
      }
      var name = label
        ? '<span class="sv-c-name sv-sub">' + esc(label) + '</span>'
        : '<span class="sv-c-name"><button class="sv-name" type="button" data-sv-name data-f="' + esc(row.key + '|name') + '"' + (row.lift ? ' data-lift="' + esc(row.lift) + '"' : '') + ' aria-haspopup="dialog" aria-label="' + esc(row.name + ', change the exercise') + '" title="Change the exercise">' + esc(row.name) + '</button>' +
          (bits.length ? '<span class="sv-var">' + esc(bits.join(', ')) + '</span>' : '') + '</span>';
      return '<div class="sv-row' + (label ? ' is-sub' : '') + (ro ? ' is-ro' : '') + '" data-row="' + esc(row.key) + '">' +
        (label || ro ? '<span class="sv-c-grip"></span>' : '<button class="sv-grip sv-c-grip" type="button" tabindex="-1" data-sv-grip aria-label="' + esc('Drag ' + row.name + ' to move it') + '" title="Drag to move. ⌥⇧↑ and ⌥⇧↓ move it from the keys.">' + GRIP + '</button>') +
        name + fieldHtml(bb, r, FIELDS[0], label) + '<i class="sv-x" aria-hidden="true">×</i>' + fieldHtml(bb, r, FIELDS[1], label) + fieldHtml(bb, r, FIELDS[2], label) + fieldHtml(bb, r, FIELDS[3], label) +
        lastHtml(bb, r) + noteHtml(bb, r, label) +
        '<button class="sv-more sv-c-more" type="button" tabindex="-1" data-sv-rowmenu data-more data-f="' + esc(row.key + '|more') + '" aria-haspopup="menu" aria-label="' + esc((label ? label + ' of ' : '') + row.name + ', menu') + '" title="Menu (right-click the line, or \u21e7F10)">' + MORE + '</button></div>';
    }
    function exHtml(bb, r, subs) {
      var row = bb.rows[r], w = bb.weeks[ci];
      return '<div class="sv-ex"' + (row.lift ? ' data-lift="' + esc(row.lift) + '"' : '') + ' data-ex="' + esc(row.key) + '">' + rowHtml(bb, r, row.line ? (row.label || 'More sets') : '') +
        subs.map(function (s) { var x = bb.rows[s]; return rowHtml(bb, s, x.label || (BL && BL.lineLabel ? BL.lineLabel(x, x.cells[w.uid] || null, {}) : 'More sets')); }).join('') + '</div>';
    }
    function dayHtml(bb, d, lifted) {
      var rs = bb.rowsOfDay(d.name).filter(function (r) { return has(bb, r); }), mains = rs.filter(function (r) { return bb.rows[r].line === 0; });
      /* a line whose top line is not in this week stands on its own */
      var orphans = rs.filter(function (r) { var x = bb.rows[r]; return x.line > 0 && !mains.some(function (m) { return bb.rows[m].ex === x.ex; }); });
      var sets = rs.reduce(function (a, r) { var t = bb.fieldText(r, ci, 'sets', { ascii: true }); return a + (isInt(t) ? +t : 0); }, 0);
      var w = bb.weeks[ci], begun = w && w.state === 'now' && w.started && w.started[d.name];
      var head = '<div class="sv-dh" data-day="' + esc(d.name) + '"><h3><button type="button" data-day-name data-sv-rename data-f="' + esc('@' + d.name + '|name') + '" title="Rename the day">' + esc(sentence(d.name)) + '</button></h3>' +
        '<span class="sv-dd">' + esc([dLong(d.iso), d.off ? 'out this week' : rs.length ? K.plural(sets, 'set') : '', begun ? 'under way' : ''].filter(Boolean).join(', ')) + '</span>' +
        '<button class="sv-more" type="button" data-sv-daymenu data-more data-f="' + esc('@' + d.name + '|menu') + '" aria-haspopup="menu" aria-label="' + esc(sentence(d.name) + ' menu') + '" title="Duplicate, move or remove the day">' + MORE + '</button></div>';
      var body;
      if (d.off) body = '<p class="sv-none">' + esc(sentence(d.name)) + ' is out of this week. <button class="sv-link" type="button" data-sv-restore="' + esc(d.name) + '">Put it back</button></p>';
      else {
        body = '<div class="sv-grid" data-day="' + esc(d.name) + '" role="group" aria-label="' + esc(sentence(d.name) + ' lifts') + '">' +
          mains.concat(orphans).map(function (r) { var x = bb.rows[r]; return exHtml(bb, r, x.line === 0 ? rs.filter(function (s) { return bb.rows[s].ex === x.ex && bb.rows[s].line > 0; }) : []); }).join('') +
          (lifted ? (rs.length ? '' : '<p class="sv-none">Nothing was written for this day.</p>') :
            '<button class="sv-add" type="button" data-sv-add="' + esc(d.name) + '" data-f="' + esc('+' + d.name + '|add') + '" aria-haspopup="dialog">' + PLUS + '<span>' + (rs.length ? 'Add an exercise' : 'Add the first exercise') + '</span></button>') + '</div>';
      }
      return '<section class="sv-day' + (d.off ? ' is-off' : '') + '" data-sv-day="' + esc(d.name) + '" aria-label="' + esc(sentence(d.name)) + '">' + head + body + '</section>';
    }
    function html() {
      var bb = b(), w = bb.weeks[ci]; if (!w) return '<p class="sv-none">There is no week here.</p>';
      var days = bb.daysOf(ci), lifted = w.state === 'lifted';
      var heads = '<div class="sv-cols" aria-hidden="true"><span></span><span>Exercise</span><span class="n">Sets</span><span></span><span class="n">Reps</span><span class="r" title="RPE, or a percent of the training max">RPE or %</span><span class="r">Load</span><span class="sv-c-last">Last week</span><span>Note for ' + esc(first) + '</span><span></span></div>';
      var body = days.length ? days.map(function (d) { return dayHtml(bb, d, lifted); }).join('') : '<p class="sv-none">This block has no days yet. Add the first one.</p>';
      var addDay = lifted ? '' : '<button class="sv-addday" type="button" data-sv-addday data-f="day|+">' + PLUS + '<span>Add a day</span></button>';
      var foot = '<div class="sv-foot">' + (o.onSaveTemplate ? '<button class="btn quiet sm" type="button" data-sv-tpl>Save this block as a template…</button>' : '') +
        (o.onAdvanced ? '<span class="sv-adv">Ranges, formulas, every week side by side: <button class="sv-link" type="button" data-sv-adv>open Advanced</button></span>' : '') + '</div>';
      /* the status bar: the load in hand explained, or the lifts picked and what to do with them */
      var bar = '<div class="sv-status" data-sv-bar><p class="sv-say" data-sv-status aria-live="polite">' + esc(lifted ? LIFTED : HINT) + '</p>' +
        '<span class="sv-acts" data-sv-acts hidden><button class="sv-sb" type="button" data-sv-do="copy">Copy<kbd>⌘C</kbd></button><button class="sv-sb" type="button" data-sv-do="dup">Duplicate</button><button class="sv-sb" type="button" data-sv-do="move" aria-haspopup="menu">Move to…</button><button class="sv-sb is-red" type="button" data-sv-do="del">Delete<kbd>⌫</kbd></button><button class="sv-sb is-quiet" type="button" data-sv-do="none">Done<kbd>Esc</kbd></button></span>' +
        '<button class="sv-sb is-quiet" type="button" data-sv-keys title="Every key that works here">Keys<kbd>?</kbd></button></div>';
      return '<div class="sv" data-simple>' + heads + '<div class="sv-wk">' + body + addDay + '</div>' + foot + '<div class="wg-tail"></div>' + bar + '</div>';
    }

    /* ---------- drawing, keeping the field in hand ---------- */
    function hand() { var a = document.activeElement; if (!a || !host.contains(a) || !a.getAttribute('data-f')) return null; var s = null; try { s = [a.selectionStart, a.selectionEnd]; } catch (e) { /* a button */ } return { f: a.getAttribute('data-f'), sel: s, typed: a.matches('input') && a.value !== a.getAttribute('data-v') && a.hasAttribute('data-v') ? a.value : null }; }
    function byF(f) { return [].slice.call(host.querySelectorAll('[data-f]')).filter(function (x) { return x.getAttribute('data-f') === f; })[0] || null; }
    function take(h) {
      if (!h) return;
      var el = byF(h.f) || (/\|[-+]$/.test(h.f) ? byF(h.f.replace(/\|[-+]$/, '')) : null); if (!el || el.disabled) return;
      if (h.typed != null && el.matches('input')) el.value = h.typed;
      el.focus({ preventScroll: true });
      if (h.sel && el.matches('input')) try { el.setSelectionRange(h.sel[0], h.sel[1]); } catch (e) { /* not a text field */ }
    }
    /* 23 Nov: a lift added, removed or moved by the pointer (a menu, a drop, the picker clicked): the lifts around it
       close the gap or make room in 180 ms instead of jumping, and a new one comes up from 0.45. From the keys nothing
       moves (MOTION.md: no motion on a keyboard action), nor across weeks, nor with reduced motion. */
    var byKey = false, noFlip = null;
    function onKeyFlag() { byKey = true; }
    function onPtrFlag() { byKey = false; }
    function spots() { var m = {}; [].forEach.call(host.querySelectorAll('.sv-ex'), function (x) { m[x.getAttribute('data-ex')] = x.getBoundingClientRect().top; }); return m; }
    function flip(was) {
      var els = [].slice.call(host.querySelectorAll('.sv-ex')), moved = [], fresh = [], known = 0;
      els.forEach(function (x) { var k = x.getAttribute('data-ex'); if (k === noFlip) return; if (was[k] == null) { fresh.push(x); return; } known++; var d = was[k] - x.getBoundingClientRect().top; if (Math.abs(d) >= 1) moved.push([x, d]); });
      noFlip = null;
      /* nothing to explain (a value typed), or too much (a day pasted, a week rebuilt): it just shows */
      if (!known || moved.length > 16 || fresh.length > 3 || moved.some(function (m) { return Math.abs(m[1]) > 320; })) return;
      moved.forEach(function (m) { if (m[0].animate) m[0].animate([{ transform: 'translate3d(0,' + Math.round(m[1]) + 'px,0)' }, { transform: 'none' }], { duration: 180, easing: 'cubic-bezier(.23,1,.32,1)' }); });
      if (moved.length) fresh.forEach(function (x) { if (x.animate) x.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 150, easing: 'cubic-bezier(.23,1,.32,1)' }); });
    }
    function render(x) {
      if (dead) return;
      var sameWeek = !(x && x.c != null && x.c !== ci);
      if (x && x.c != null) ci = x.c;
      var was = sameWeek && !byKey && !still() && host.querySelector('.sv-ex') ? spots() : null;
      var h = hand(), tail = host.querySelector('.wg-tail'), keepTail = tail ? [].slice.call(tail.childNodes) : [];
      host.innerHTML = html();
      if (was) flip(was); else noFlip = null;
      var t2 = host.querySelector('.wg-tail'); if (t2) keepTail.forEach(function (n) { t2.appendChild(n); });
      fit();
      Object.keys(bads).forEach(function (f) { var el = byF(f); if (el && !el.disabled) markBad(el, bads[f].text, bads[f].why); else delete bads[f]; });
      take(h);
      status(document.activeElement);
      paintPicked();
    }
    /* a value the week cannot read: it stays in its field, ringed, the reason under it; nothing is written */
    function markBad(inp, text, why) {
      inp.value = text; inp.setAttribute('aria-invalid', 'true');
      var cell = inp.parentNode, e0 = cell.querySelector('.sv-err'); if (e0) e0.remove();
      cell.insertAdjacentHTML('beforeend', '<span class="sv-err" role="alert">' + esc(why) + '</span>');
    }
    function clearBad(inp) { var f = inp.getAttribute('data-f'); if (!bads[f]) return; delete bads[f]; inp.removeAttribute('aria-invalid'); var e0 = inp.parentNode.querySelector('.sv-err'); if (e0) e0.remove(); }
    /* the columns the room allows (simple.css): all of them from 918 px, narrower ones from 820, last week gives way under that */
    function fit() {
      var sv = host.querySelector('.sv'), w = host.clientWidth; if (!sv || !w) return;
      sv.classList.toggle('is-tight', w < 820); sv.classList.toggle('is-mid', w >= 820 && w < 918);
    }
    var ro = W.ResizeObserver ? new W.ResizeObserver(function () { if (!dead) fit(); }) : null;
    if (ro) ro.observe(host);
    /* the line under the days: why the load in hand is what it is, in the model's own words; else how the keys work */
    function status(el) {
      var s = host.querySelector('[data-sv-status]'); if (!s) return;
      var bb = b(), w = bb.weeks[ci], rowEl = el && el.closest && host.contains(el) ? el.closest('.sv-row') : null, text = w && w.state === 'lifted' ? LIFTED : HINT, nm = '';
      if (rowEl) {
        var r = rowIx(rowEl.getAttribute('data-row')), row = bb.rows[r], why = row && bb.loadWords ? bb.loadWords(r, ci) : null;
        if (row && why && why.text) { nm = row.name + (row.line ? ', ' + String(row.label || 'more sets').toLowerCase() : ''); text = why.text; }
      }
      if (picked.length) return;   /* the bar is the picked lifts' until they are let go */
      s.innerHTML = (nm ? '<b>' + esc(nm) + '</b> ' : '') + esc(text);
    }

    /* ---------- writing ---------- */
    /* words: what the toast says (with the page's Undo), or an object whose .say the write itself fills in once it knows */
    function apply(fn, label, words) { var oo = words && typeof words === 'object' ? words : words ? { say: words } : {}; oo.focus = false; return o.apply ? o.apply(fn, label, oo) : null; }
    /* stay: the coach is still in the field (Enter). Leaving it with a value that does not read puts back what was
       there and says so, so what is on the screen is always what is saved (a cold review: "40" stayed, 3 was stored) */
    function commit(inp, stay) {
      if (pendingEl === inp) { clearTimeout(pending); pending = null; pendingEl = null; }
      var f = inp.getAttribute('data-sv-field'), v = inp.value.trim(), was = inp.getAttribute('data-v') || '';
      if (v === was) { clearBad(inp); return true; }
      var key = inp.getAttribute('data-f').split('|').slice(0, -1).join('|'), r0 = rowIx(key), nm = (b().rows[r0] || {}).name || 'the line';
      /* read it before writing it: what does not read is said at the field and never saved (it used to be stored as
         typed, ringed orange, and only stopped the send later) */
      var pf = v && r0 >= 0 && b().withField ? b().withField(r0, ci, f, v) : null;
      if (pf && pf.ok === false) {
        var why = pf.why || 'That does not read.';
        if (!stay) { clearBad(inp); inp.value = was; say('“' + v + '” was not saved for ' + nm.toLowerCase() + '. ' + why); return false; }
        bads[inp.getAttribute('data-f')] = { text: v, why: why + ' Esc puts back what was there.' }; markBad(inp, v, bads[inp.getAttribute('data-f')].why); return false;
      }
      clearBad(inp);
      inp.setAttribute('data-v', v);
      apply(function (bb) { var r = ixIn(bb, key); return r < 0 ? gone() : bb.setField(r, ci, f, v); }, nm + ' ' + (f === 'effort' ? 'RPE or %' : f));
      return true;
    }
    /* a typed field saves when it is left; a stepped one a moment after the last step, so five presses are one change */
    function later(inp, ms) { clearTimeout(pending); pendingEl = inp; pending = setTimeout(function () { pending = null; pendingEl = null; if (!dead && inp.isConnected) commit(inp); }, ms || 0); }
    function flush() {
      if (pendingEl) { var el = pendingEl; clearTimeout(pending); pending = null; pendingEl = null; if (el.isConnected) commit(el); }
      var a = document.activeElement; if (a && host.contains(a) && a.matches('[data-sv-field]')) commit(a);
    }
    function stepField(inp, dir) {
      var f = inp.getAttribute('data-sv-field'), st = STEP[f], t = inp.value.trim() || inp.getAttribute('placeholder') || '';
      if (!st || !isNum(t)) return false;
      var v = Math.max(f === 'load' ? 0 : 1, +t + dir * st); if (f === 'effort') v = Math.min(10, v);
      inp.value = nf(v);
      var wrap = inp.closest('.sv-step'), dn = wrap && wrap.querySelector('[data-sv-step="-1"]'); if (dn) dn.disabled = v <= 1;
      later(inp, 380); return true;
    }
    function changeName(btn, byKey) {
      var key = btn.closest('.sv-row').getAttribute('data-row'), r = rowIx(key), row = b().rows[r]; if (!row || !W.PICK) return;
      flush();
      var old = row.name;
      W.PICK.open(btn, { value: old, block: b(), c: ci, title: 'Change ' + low1(old), instant: byKey, onPick: function (e) {
        var oo = {};
        var res = apply(function (bb) {
          var rr = ixIn(bb, key); if (rr < 0) return gone();
          var r2 = bb.changeExercise(rr, ci, e.name, { lift: e.lift, variant: e.variant || undefined });
          if (r2 && !r2.error && r2.data && r2.data.changed !== false) { var x = bb.rows[r2.data.r] || bb.rows[ixIn(bb, key)], now = x ? x.name : e.name; oo.say = (r2.data.from != null ? now + ' from week ' + weekNo(bb, r2.data.from) + ' on. The weeks already lifted keep ' + low1(old) + '.' : old + ' is now ' + low1(now) + '.') + (r2.data.cleared ? ' The kilos typed for ' + low1(old) + ' are cleared: give ' + low1(now) + ' its own.' : ''); }
          return r2;
        }, 'Change ' + low1(old), oo);
        if (!res || res.error || !res.data || res.data.changed === false) { var again = byF(key + '|name'); if (again) again.focus(); return; }
        var nb = b(), nr = nb.rows[res.data.r] || nb.rows[rowIx(key)];
        var f2 = nr && (byF(nr.key + '|sets') || byF(nr.key + '|name')); if (f2 && !f2.disabled) f2.focus();
      }, onClose: function () { var again = byF(key + '|name'); if (again) again.focus({ preventScroll: true }); } });
    }
    function addTo(d, btn, byKey) {
      if (!W.PICK) return;
      flush();
      /* room under the button for the picker (about 360 px): the card scrolls up to make it, so the picker hangs
         below and the day it adds to stays in view */
      var sc0 = scroller(host), need = btn.getBoundingClientRect().bottom + 372 - (W.innerHeight || 800);
      if (need > 0 && sc0 && sc0.scrollBy) sc0.scrollBy(0, need);
      W.PICK.open(btn, { block: b(), c: ci, title: 'Add to ' + low1(sentence(d)), instant: byKey, onPick: function (e) {
        var name = e.name, made = null;
        var res = apply(function (bb) {
          return bb.batch('Add ' + name + ' to ' + d, function () {
            var r = -1, w = bb.weeks[ci];
            /* a lift this day already holds in other weeks comes back into this one, never a second row of the same name */
            bb.rows.forEach(function (x, i) { if (r < 0 && x.day === d && x.line === 0 && x.name.toLowerCase() === name.toLowerCase() && !x.cells[w.uid]) r = i; });
            if (r < 0) { var a = bb.addExercise(d, name, { lift: e.lift, variant: e.variant || undefined }); if (!a || a.error) return a; r = a.data.r; }
            /* it starts as the last thing written for it, else three fives on a main lift and three tens on the rest */
            var lw = null; for (var k = ci - 1; k >= 0 && !lw; k--) { var cx = bb.rows[r].cells[bb.weeks[k].uid]; if (cx && cx.n && cx.r) lw = cx.n + 'x' + cx.r; }
            var s = bb.set(r, ci, lw || (bb.rows[r].lift ? '3x5' : '3x10')); if (s && s.error) return s;
            made = bb.rows[r].key;
            return { data: { r: r } };
          });
        }, 'Add ' + name, name + ' added to ' + low1(sentence(d)) + '.');
        if (res && !res.error && made) { var f2 = byF(made + '|sets'); if (f2) { f2.focus(); f2.select(); } }
      }, onClose: function () { var again = byF('+' + d + '|add'); if (again) again.focus({ preventScroll: true }); } });
    }
    function walk(dir) {
      flush();
      var fn = dir === 'undo' ? o.onUndo : o.onRedo, res;
      if (typeof fn === 'function') { res = fn(); render(); return res; }
      res = apply(function (bb) { return bb[dir](); }, null, null);
      if (res && res.data && res.data.label) say(res.data.label);
      return res;
    }

    /* ---------- picking lifts, copying and pasting them (the owner: "copy paste") ----------
       A click on a lift's grip picks it (shift picks the run to it, command one more); ⌘C copies the picked lifts, or
       the one whose name is in hand, with every line of theirs; ⌘V pastes under the line in hand. What is copied is
       also plain rows of exercise, sets and note, so it pastes into a spreadsheet, and rows copied out of a spreadsheet
       paste in here the same way (read by kit/r6/import.js). In a field, ⌘C and ⌘V stay the field's own. */
    var picked = [];
    function exEls() { return [].slice.call(host.querySelectorAll('.sv-ex')); }
    function paintPicked() {
      picked = picked.filter(function (k) { return rowIx(k) >= 0; });
      exEls().forEach(function (x) { x.classList.toggle('is-picked', picked.indexOf(x.getAttribute('data-ex')) >= 0); });
      var bar = host.querySelector('[data-sv-bar]'), s = host.querySelector('[data-sv-status]'), acts = host.querySelector('[data-sv-acts]'); if (!bar || !s || !acts) return;
      bar.classList.toggle('has-pick', picked.length > 0); acts.hidden = !picked.length;
      if (picked.length) s.textContent = K.plural(picked.length, 'lift') + ' picked';
    }
    function unpick() { if (!picked.length) return; picked = []; paintPicked(); status(document.activeElement); }
    /* every line of the picked lifts, as the block's row keys */
    function pickedRows(bb) { var out = []; picked.forEach(function (key) { var r = ixIn(bb, key), row = bb.rows[r]; if (!row) return; bb.rows.forEach(function (y) { if (y.day === row.day && y.ex === row.ex) out.push(y.key); }); }); return out; }
    function copyPicked() {
      var items = linesOf(picked); if (!items.length) return;
      W.__powaLines = { text: items.map(function (x) { return [x.name, x.text, x.note].join('\t'); }).join('\n'), items: items };
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(W.__powaLines.text).catch(function () { /* the copy stays in the page */ }); } catch (e) { /* no clipboard here */ }
      say(K.plural(picked.length, 'lift') + ' copied. \u2318V pastes under the line in hand.');
    }
    function dupPicked() {
      var keys = picked.slice(), n = keys.length; flush();
      var res = apply(function (bb) { return bb.batch('Duplicate ' + K.plural(n, 'lift'), function () { var err = null; keys.forEach(function (k) { if (err) return; var r = ixIn(bb, k); if (r < 0) return; var d = bb.duplicateRow(r); if (d && d.error) err = d; }); return err || { data: { n: n } }; }); }, 'Duplicate', K.plural(n, 'lift') + ' duplicated.');
      if (res && !res.error) unpick();
    }
    function delPicked() {
      var keys = picked.slice(), n = keys.length; if (!n) return; flush();
      var res = apply(function (bb) {
        return bb.batch('Delete ' + K.plural(n, 'lift'), function () {
          var rows = pickedRows(bb), err = null;
          /* a lift with weeks already lifted leaves this week only; one never lifted goes from the block */
          rows.slice().reverse().forEach(function (k) { if (err) return; var r = ixIn(bb, k), row = bb.rows[r]; if (!row) return; var lifted = bb.weeks.some(function (w) { return w.state === 'lifted' && row.cells[w.uid]; }); var d = lifted ? bb.set(r, ci, '') : bb.removeRow(r); if (d && d.error) err = d; });
          return err || { data: { n: n } };
        });
      }, 'Delete', K.plural(n, 'lift') + ' deleted.');
      if (res && !res.error) { picked = []; paintPicked(); status(null); }
    }
    function movePicked(btn) {
      var DK = W.DESK, bb0 = b(); if (!DK || !DK.menu) return;
      var days = bb0.daysOf(ci).filter(function (d) { return !d.off; }).map(function (d) { return { id: d.name, label: sentence(d.name), sub: dShort(d.iso) }; });
      DK.menu.open(btn, days, { label: 'Move to a day', run: function (day) {
        var keys = picked.slice(), n = keys.length; flush();
        var res = apply(function (bb) { return bb.batch('Move ' + K.plural(n, 'lift'), function () { var err = null; keys.forEach(function (k) { if (err) return; var r = ixIn(bb, k); if (r < 0) return; var d = bb.moveRowTo(r, day, 1e9); if (d && d.error) err = d; }); return err || { data: { n: n } }; }); }, 'Move', K.plural(n, 'lift') + ' moved to ' + low1(sentence(day)) + '.');
        if (res && !res.error) unpick();
      } });
    }
    function pick(key, extend, toggle) {
      var all = exEls().map(function (x) { return x.getAttribute('data-ex'); });
      if (extend && picked.length) { var a = all.indexOf(picked[picked.length - 1]), z = all.indexOf(key); if (a >= 0 && z >= 0) picked = all.slice(Math.min(a, z), Math.max(a, z) + 1); }
      else if (toggle) { var i = picked.indexOf(key); if (i >= 0) picked.splice(i, 1); else picked.push(key); }
      else picked = picked.length === 1 && picked[0] === key ? [] : [key];
      paintPicked(); if (!picked.length) status(document.activeElement);
      /* the keys go to the picked lifts (\u232b, \u2318C, Esc), not to a field left behind */
      if (picked.length) { var g = [].slice.call(host.querySelectorAll('.sv-ex.is-picked')).filter(function (x) { return x.getAttribute('data-ex') === key; })[0] || host.querySelector('.sv-ex.is-picked'), gb = g && g.querySelector('[data-sv-grip]'); if (gb) gb.focus({ preventScroll: true }); }
    }
    function linesOf(keys) {
      var bb = b(), w = bb.weeks[ci], out = [];
      keys.forEach(function (key) {
        var r = rowIx(key), row = bb.rows[r]; if (!row) return;
        bb.rows.forEach(function (y, i) { if (y.day !== row.day || y.ex !== row.ex || !y.cells[w.uid]) return; out.push({ name: y.name, lift: y.lift || null, variant: y.variant || '', line: y.line, text: BL.text(BL.cellOf(y.cells[w.uid])), note: bb.fieldText(i, ci, 'note') || '' }); });
      });
      return out;
    }
    function onCopy(e) {
      var t = e.target, cd = e.clipboardData; if (!cd || !t.closest) return;
      if (!picked.length && t.matches('input')) return;                       /* a field's own text */
      var rowEl = t.closest('.sv-row'), keys = picked.length ? picked.slice() : rowEl ? [rowEl.closest('.sv-ex').getAttribute('data-ex')] : [];
      var items = linesOf(keys); if (!items.length) return;
      e.preventDefault();
      cd.setData('text/plain', items.map(function (x) { return [x.name, x.text, x.note].join('\t'); }).join('\n'));
      cd.setData('application/x-powa-lines', JSON.stringify(items));
      W.__powaLines = { text: items.map(function (x) { return [x.name, x.text, x.note].join('\t'); }).join('\n'), items: items };
      say(K.plural(keys.length, 'lift') + ' copied.');
    }
    function onPaste(e) {
      var t = e.target, cd = e.clipboardData; if (!cd || !t.closest) return;
      var raw = cd.getData('application/x-powa-lines'), text = cd.getData('text/plain') || '', items = null, inField = t.matches('input');
      if (inField && !picked.length && !/[\t\n]/.test(text.trim())) return;   /* one value into a field */
      if (raw) { try { items = JSON.parse(raw); } catch (x) { items = null; } }
      /* copied from the bar's own Copy (no clipboard event to carry the lines): the page still holds them */
      if (!items && W.__powaLines && W.__powaLines.text === text.replace(/\r/g, '').trim()) items = W.__powaLines.items;
      if (!items && W.IMPORT && text.trim()) {
        var res = W.IMPORT.read(text);
        if (res && res.ok) { items = []; res.lines.forEach(function (l) { if (l.cells[1]) items.push({ name: l.name, line: l.line, text: l.cells[1], note: (l.notes && l.notes[1]) || '' }); }); }
      }
      if (!items || !items.length) { if (!inField) say('Nothing copied reads as lifts. Copy a lift here, or rows with an exercise and its sets.'); return; }
      e.preventDefault(); flush();
      var rowEl = t.closest('.sv-row'), secEl = t.closest('[data-sv-day]'), bb0 = b();
      var day = secEl ? secEl.getAttribute('data-sv-day') : lastDay || ((bb0.daysOf(ci).filter(function (d) { return !d.off; })[0]) || {}).name; if (!day) return;
      var afterKey = rowEl ? rowEl.closest('.sv-ex').getAttribute('data-ex') : null, firstKey = null, n = 0;
      var out = apply(function (bb) {
        return bb.batch('Paste into ' + day, function () {
          var idx = afterKey ? blockIndex(bb, day, '\u0000', null, afterKey) : 1e9, curKey = null, err = null;
          items.forEach(function (it) {
            if (err || !it || !it.name || !it.text) return;
            if (it.line && curKey) { var a = bb.addLine(ixIn(bb, curKey)); if (a && !a.error) bb.set(a.data.r, ci, String(it.text)); return; }
            var a0 = bb.addExercise(day, String(it.name).slice(0, 80), it.lift !== undefined ? { lift: it.lift, variant: it.variant || undefined } : {}); if (!a0 || a0.error) { err = a0; return; }
            var key = bb.rows[a0.data.r].key; bb.set(a0.data.r, ci, String(it.text));
            if (it.note) bb.setField(ixIn(bb, key), ci, 'note', String(it.note).slice(0, 160));
            bb.moveRowTo(ixIn(bb, key), day, idx); idx++; curKey = key; if (!firstKey) firstKey = key; n++;
          });
          return err || { data: { n: n } };
        });
      }, 'Paste', { say: null });
      if (out && !out.error && n) { say(K.plural(n, 'lift') + ' pasted into ' + low1(sentence(day)) + '.'); picked = []; paintPicked(); var f2 = firstKey && byF(firstKey + '|sets'); if (f2) f2.focus(); }
    }

    /* ---------- moving a line ---------- */
    /* the place among ALL of a day's exercises (the block's, not only this week's) that sits before the line shown at
       `beforeKey`, or after the one at `afterKey`: what moveRowTo counts in */
    function blockIndex(bb, day, dragKey, beforeKey, afterKey) {
      var groups = [], seen = {};
      bb.rows.forEach(function (x) { if (x.day !== day) return; if (seen[x.ex] == null) { seen[x.ex] = groups.length; groups.push([]); } groups[seen[x.ex]].push(x.key); });
      groups = groups.filter(function (g) { return g.indexOf(dragKey) < 0; });
      var at = function (k) { for (var i = 0; i < groups.length; i++) if (groups[i].indexOf(k) >= 0) return i; return -1; };
      if (beforeKey && at(beforeKey) >= 0) return at(beforeKey);
      if (afterKey && at(afterKey) >= 0) return at(afterKey) + 1;
      return groups.length;
    }
    function moveTo(key, day, beforeKey, afterKey, from) {
      var bb = b(), r = rowIx(key), row = bb.rows[r]; if (!row) return null;
      var idx = blockIndex(bb, day, key, beforeKey, afterKey), was = row.day, same = was === day, name = row.name;
      if (from) noFlip = key;
      var oo = {};
      var res = apply(function (x) {
        var rr = ixIn(x, key); if (rr < 0) return gone();
        var r2 = x.moveRowTo(rr, day, idx);
        if (!same && r2 && !r2.error && r2.data) oo.say = r2.data.split ? name + ' moves to ' + low1(sentence(day)) + ' from week ' + weekNo(x, r2.data.from) + ' on. The weeks already lifted stay on ' + low1(sentence(was)) + '.' : name + ' moved to ' + low1(sentence(day)) + '.';
        return r2;
      }, 'Move ' + low1(name), oo);
      if (!res || res.error || !res.data || res.data.changed === false) return res;
      var nb = b(), nr = nb.rows[res.data.r], el = nr ? [].slice.call(host.querySelectorAll('.sv-ex')).filter(function (x) { return x.getAttribute('data-ex') === nr.key; })[0] : null;
      /* it lands where it was let go and settles into its line (transform only; nothing moves for reduced motion) */
      if (el && from && !still() && el.animate) { var to = el.getBoundingClientRect(); el.animate([{ transform: 'translate3d(' + Math.round(from.left - to.left) + 'px,' + Math.round(from.top - to.top) + 'px,0)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' }); }
      var g = el && el.querySelector('[data-sv-name]'); if (g) g.focus({ preventScroll: true });
      return res;
    }
    /* ⌥⇧↑ ⌥⇧↓: one place up or down; past the day's first or last line it goes to the day before or after (plain
       ⌥↑ ⌥↓ stay the page's: the next lifter, the one before) */
    function nudge(rowEl, dir) {
      var exEl = rowEl.closest('.sv-ex'); if (!exEl || exEl.querySelector('.sv-row.is-ro')) return;
      var key = exEl.getAttribute('data-ex'), gridEl = exEl.parentNode, exs = [].slice.call(gridEl.querySelectorAll('.sv-ex')), i = exs.indexOf(exEl), day = gridEl.getAttribute('data-day'), from = exEl.getBoundingClientRect();
      var k = function (x) { return x ? x.getAttribute('data-ex') : null; };
      /* from the keys the line is simply in its new place, no slide (MOTION.md: no motion on a keyboard action) */
      from = null;
      if (dir < 0 && i > 0) return moveTo(key, day, k(exs[i - 1]), null, from);
      if (dir > 0 && i < exs.length - 1) return moveTo(key, day, null, k(exs[i + 1]), from);
      var grids = [].slice.call(host.querySelectorAll('.sv-grid')), next = grids[grids.indexOf(gridEl) + dir]; if (!next) return;
      var theirs = [].slice.call(next.querySelectorAll('.sv-ex'));
      return moveTo(key, next.getAttribute('data-day'), dir > 0 ? k(theirs[0]) : null, dir < 0 ? k(theirs[theirs.length - 1]) : null, from);
    }
    /* a drag by the grip: the line follows the pointer from where it was taken, a rule shows where it will land, and the
       pane scrolls when the pointer nears its edge. Esc puts it back. */
    function scroller(el) { for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) { var cs = getComputedStyle(p); if (/(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1) return p; } return document.scrollingElement || document.documentElement; }
    function startDrag(ev, grip) {
      if (ev.button !== 0 || drag) return;
      var exEl = grip.closest('.sv-ex'); if (!exEl) return;
      flush();
      var sx = ev.clientX, sy = ev.clientY, mods = { shift: ev.shiftKey, more: ev.metaKey || ev.ctrlKey };
      drag = { key: exEl.getAttribute('data-ex'), id: ev.pointerId, moved: false, ghost: null, mark: null, drop: null, x: sx, y: sy, sc: scroller(host), raf: 0 };
      try { grip.setPointerCapture(ev.pointerId); } catch (e) { /* a pointer already gone */ }
      ev.preventDefault();
      var place = function (y) {
        var best = null;
        [].forEach.call(host.querySelectorAll('.sv-grid'), function (g) { var gr = g.getBoundingClientRect(), d = y < gr.top ? gr.top - y : y > gr.bottom ? y - gr.bottom : 0; if (!best || d < best.d) best = { g: g, d: d, r: gr }; });
        if (!best) return null;
        var exs = [].slice.call(best.g.querySelectorAll('.sv-ex')).filter(function (x) { return x !== exEl; }), before = null, after = null, lineY = null;
        for (var i = 0; i < exs.length; i++) { var er = exs[i].getBoundingClientRect(); if (y < er.top + er.height / 2) { before = exs[i]; lineY = er.top; break; } }
        if (!before) {
          after = exs[exs.length - 1] || null;
          var foot = best.g.querySelector('.sv-add') || best.g.querySelector('.sv-heads');
          lineY = after ? after.getBoundingClientRect().bottom : foot ? foot.getBoundingClientRect().top : best.r.top;
        }
        return { day: best.g.getAttribute('data-day'), before: before ? before.getAttribute('data-ex') : null, after: after ? after.getAttribute('data-ex') : null, y: lineY, left: best.r.left, width: best.r.width };
      };
      var begin = function () {
        var r = exEl.getBoundingClientRect(), gs = getComputedStyle(exEl.parentNode), ghost = document.createElement('div'), mark = document.createElement('div');
        var sv = host.querySelector('.sv');
        ghost.className = 'sv-ghost' + (sv && sv.classList.contains('is-tight') ? ' is-tight' : ''); ghost.setAttribute('aria-hidden', 'true');
        ghost.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;grid-template-columns:' + gs.gridTemplateColumns + ';column-gap:' + gs.columnGap + ';';
        ghost.appendChild(exEl.cloneNode(true));
        mark.className = 'sv-dropline'; mark.setAttribute('aria-hidden', 'true');
        document.body.appendChild(mark); document.body.appendChild(ghost);
        exEl.classList.add('is-drag'); host.classList.add('is-dragging');
        drag.ghost = ghost; drag.mark = mark;
      };
      var paintDrag = function () {
        if (!drag || !drag.moved) return;
        drag.ghost.style.transform = 'translate3d(' + (drag.x - sx) + 'px,' + (drag.y - sy) + 'px,0)';
        drag.drop = place(drag.y);
        if (drag.drop) { drag.mark.style.width = drag.drop.width + 'px'; drag.mark.style.transform = 'translate3d(' + drag.drop.left + 'px,' + Math.round(drag.drop.y - 1) + 'px,0)'; drag.mark.hidden = false; } else drag.mark.hidden = true;
      };
      var edge = function () {
        if (!drag || !drag.moved) return;
        var sc = drag.sc, isDoc = sc === document.scrollingElement || sc === document.documentElement, rc = isDoc ? { top: 0, bottom: innerHeight } : sc.getBoundingClientRect(), pad = 56, v = 0;
        if (drag.y < rc.top + pad) v = -Math.ceil((rc.top + pad - drag.y) / 5); else if (drag.y > rc.bottom - pad) v = Math.ceil((drag.y - (rc.bottom - pad)) / 5);
        if (v) { sc.scrollBy(0, Math.max(-18, Math.min(18, v))); paintDrag(); }
        drag.raf = requestAnimationFrame(edge);
      };
      var end = function (dropIt) {
        var d = drag; if (!d) return; drag = null;
        cancelAnimationFrame(d.raf);
        grip.removeEventListener('pointermove', onMove); grip.removeEventListener('pointerup', onUp); grip.removeEventListener('pointercancel', onCancel); document.removeEventListener('keydown', onEsc, true);
        try { grip.releasePointerCapture(d.id); } catch (e) { /* released already */ }
        var from = d.ghost ? d.ghost.getBoundingClientRect() : null;
        if (d.ghost) d.ghost.remove();
        if (d.mark) d.mark.remove();
        exEl.classList.remove('is-drag'); host.classList.remove('is-dragging');
        if (dropIt && d.moved && d.drop) moveTo(d.key, d.drop.day, d.drop.before, d.drop.after, from);
        else if (dropIt && !d.moved) pick(d.key, mods.shift, mods.more);   /* a click on the grip picks the lift */
      };
      var onMove = function (e) {
        if (!drag) return;
        drag.x = e.clientX; drag.y = e.clientY;
        if (!drag.moved) { if (Math.abs(e.clientX - sx) < 5 && Math.abs(e.clientY - sy) < 5) return; drag.moved = true; begin(); drag.raf = requestAnimationFrame(edge); }
        paintDrag();
      };
      var onUp = function () { end(true); };
      var onCancel = function () { end(false); };
      var onEsc = function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(false); } };
      grip.addEventListener('pointermove', onMove); grip.addEventListener('pointerup', onUp); grip.addEventListener('pointercancel', onCancel); document.addEventListener('keydown', onEsc, true);
    }

    /* ---------- events ---------- */
    function goDay(name, focusIt) {
      var sec = [].slice.call(host.querySelectorAll('[data-sv-day]')).filter(function (x) { return x.getAttribute('data-sv-day') === name; })[0]; if (!sec) return null;
      lastDay = name;
      sec.scrollIntoView({ block: 'start', behavior: still() ? 'auto' : 'smooth' });
      if (focusIt) { var f = sec.querySelector('.sv-row .sv-in:not([disabled])') || sec.querySelector('[data-sv-add]') || sec.querySelector('[data-day-name]'); if (f) f.focus({ preventScroll: true }); }
      return sec;
    }
    function renameDay(btn) {
      var DK = W.DESK, d = btn.closest('[data-sv-day]').getAttribute('data-sv-day'); if (!DK || !DK.pop) return;
      var el = DK.pop.open(btn, '<h3>Rename the day</h3><div class="row-f"><label for="sv-rn">Name</label><input class="input" id="sv-rn" maxlength="40" value="' + esc(sentence(d)) + '"></div><div class="acts"><button class="btn sm" type="button" data-sv-rn-ok>Rename</button><button class="btn quiet sm" type="button" data-pop-close>Cancel</button></div>', { label: 'Rename the day', focus: '#sv-rn' });
      var go = function () { var v = el.querySelector('#sv-rn').value.trim(); DK.pop.close(); if (!v || v === d) return; var res = apply(function (bb) { return bb.renameDay(d, v); }, null, 'Day renamed.'); if (res && !res.error) lastDay = (res.data && res.data.day) || v; };
      el.addEventListener('click', function (e) { if (e.target.closest('[data-sv-rn-ok]')) go(); else if (e.target.closest('[data-pop-close]')) DK.pop.close(); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    }
    function onClick(e) {
      var t = e.target, x;
      if (firstClick) { var fc = firstClick; firstClick = null; if (t === fc && document.activeElement === fc && fc.selectionStart === fc.selectionEnd) { fc.select(); return; } }
      if ((x = t.closest('[data-sv-do]'))) { var what = x.getAttribute('data-sv-do'); if (what === 'copy') copyPicked(); else if (what === 'dup') dupPicked(); else if (what === 'del') delPicked(); else if (what === 'move') movePicked(x); else unpick(); return; }
      if (t.closest('[data-sv-keys]')) { if (W.DESK && W.DESK.keys) W.DESK.keys(); return; }
      if ((x = t.closest('[data-sv-addday]'))) { flush(); var res = apply(function (bb) { return bb.addDay(); }, null, 'Day added. Add its first exercise.'); if (res && res.data && res.data.day) { var sec = goDay(res.data.day, false), ad = sec && sec.querySelector('[data-sv-add]'); if (ad) ad.focus({ preventScroll: true }); } return; }
      if ((x = t.closest('[data-sv-step]'))) { var inp = x.parentNode.querySelector('input'); if (inp && !inp.disabled) { stepField(inp, +x.getAttribute('data-sv-step')); inp.focus({ preventScroll: true }); } return; }
      if ((x = t.closest('[data-sv-rowmenu]'))) { flush(); var r = rowIx(x.closest('.sv-row').getAttribute('data-row')); if (r >= 0 && o.onRowMenu) o.onRowMenu(r, x); return; }
      if ((x = t.closest('[data-sv-daymenu]'))) { flush(); lastDay = x.closest('[data-sv-day]').getAttribute('data-sv-day'); if (o.onDayMenu) o.onDayMenu(lastDay, x); return; }
      if ((x = t.closest('[data-sv-rename]'))) { renameDay(x); return; }
      if ((x = t.closest('[data-sv-restore]'))) { var d = x.getAttribute('data-sv-restore'); apply(function (bb) { return bb.restoreDay(ci, d); }, null, sentence(d) + ' is back in the week.'); return; }
      if ((x = t.closest('[data-sv-name]'))) { changeName(x, e.detail === 0); return; }   /* detail 0: Enter or Space, the keys: the picker is there at once */
      if ((x = t.closest('[data-sv-add]'))) { addTo(x.getAttribute('data-sv-add'), x, e.detail === 0); return; }
      if ((x = t.closest('[data-sv-tpl]'))) { if (o.onSaveTemplate) o.onSaveTemplate(x); return; }
      if ((x = t.closest('[data-sv-adv]'))) { if (o.onAdvanced) o.onAdvanced(); return; }
    }
    function onChange(e) { var t = e.target; if (t.matches('[data-sv-field]')) later(t, 0); }
    /* a field left with a value that was refused: back to what is saved */
    function onFocusOut(e) { var t = e.target; if (t && t.matches && t.matches('[data-sv-field]') && bads[t.getAttribute('data-f')]) { var bad = bads[t.getAttribute('data-f')]; clearBad(t); t.value = t.getAttribute('data-v') || ''; say('“' + bad.text + '” was not saved. ' + bad.why.replace(/ Esc puts back what was there\.$/, '')); } }
    function onFocusIn(e) {
      var t = e.target;
      /* a number still counting its steps saves the moment the focus leaves it for another field */
      if (pendingEl && pendingEl !== t) flush();
      /* the number in hand is taken whole, unless a key has already been typed into it (a fast hand: the select used to
         land after the first digit and the second replaced it, "35" read as "5") */
      if (t.matches('.sv-in') && !t.matches('.sv-note') && t.select) { var n0 = typedN; setTimeout(function () { if (document.activeElement === t && typedN === n0) t.select(); }, 0); }
      var sec = t.closest && t.closest('[data-sv-day]'); if (sec) lastDay = sec.getAttribute('data-sv-day');
      status(t);
    }
    /* the fields of the week in reading order, and the same field one line down or up */
    function fields() { return [].slice.call(host.querySelectorAll('.sv-row .sv-in:not([disabled])')); }
    function sameCol(t, dir) {
      var f = t.getAttribute('data-sv-field'), rows = [].slice.call(host.querySelectorAll('.sv-row')), i = rows.indexOf(t.closest('.sv-row'));
      for (var k = i + dir; k >= 0 && k < rows.length; k += dir) { var n = rows[k].querySelector('[data-sv-field="' + f + '"]:not([disabled])'); if (n) return n; }
      return null;
    }
    function onKey(e) {
      var t = e.target, k = e.key, meta = e.metaKey || e.ctrlKey;
      if (drag || !t || !t.matches) return;
      if (k === 'Escape' && picked.length) { unpick(); e.stopPropagation(); return; }
      if ((k === 'Backspace' || k === 'Delete') && picked.length && !t.matches('input, textarea')) { e.preventDefault(); e.stopPropagation(); delPicked(); return; }
      var isField = t.matches('[data-sv-field]'), typed = isField && pendingEl !== t && t.value !== (t.getAttribute('data-v') || '');
      /* undo and redo: the field's own while something is half typed, the week's otherwise */
      if (meta && !e.altKey && k.toLowerCase() === 'z' && !typed) { e.preventDefault(); e.stopPropagation(); walk(e.shiftKey ? 'redo' : 'undo'); return; }
      if (meta && !e.altKey && !e.shiftKey && k.toLowerCase() === 'y' && !typed) { e.preventDefault(); e.stopPropagation(); walk('redo'); return; }
      /* ⌥→ ⌥←: the next week, the one before, as in Advanced */
      if (e.altKey && !e.shiftKey && !meta && (k === 'ArrowRight' || k === 'ArrowLeft') && typeof o.onWeek === 'function') { e.preventDefault(); e.stopPropagation(); flush(); o.onWeek(k === 'ArrowRight' ? 1 : -1); return; }
      var rowEl = t.closest('.sv-row');
      if (rowEl && e.altKey && e.shiftKey && !meta && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); flush(); nudge(rowEl, k === 'ArrowUp' ? -1 : 1); return; }
      if (rowEl && meta && !e.altKey && !e.shiftKey && k.toLowerCase() === 'd') {
        e.preventDefault(); e.stopPropagation(); flush();
        var key = rowEl.getAttribute('data-row'), nm = (b().rows[rowIx(key)] || {}).name || 'The line';
        var res = apply(function (bb) { var r = ixIn(bb, key); return r < 0 ? gone() : bb.duplicateRow(r); }, 'Duplicate ' + low1(nm), nm + ' duplicated.');
        if (res && res.data && res.data.r != null) { var nr = b().rows[res.data.r], f2 = nr && byF(nr.key + '|sets'); if (f2) f2.focus(); }
        return;
      }
      /* ⇧F10 and the menu key open the line's menu from the keys (its … is off the Tab path, as in the Week grid) */
      if (rowEl && ((k === 'F10' && e.shiftKey) || k === 'ContextMenu') && !meta && !e.altKey) {
        var mr = rowIx(rowEl.getAttribute('data-row')), mb = rowEl.querySelector('[data-sv-rowmenu]');
        if (mr >= 0 && mb && o.onRowMenu) { e.preventDefault(); e.stopPropagation(); flush(); o.onRowMenu(mr, mb); }
        return;
      }
      if (!isField) return;
      if (k === 'Enter') { e.preventDefault(); if (commit(t, true) === false) { t.select(); return; } var again = byF(t.getAttribute('data-f')) || t, nx = sameCol(again, e.shiftKey ? -1 : 1); if (nx) nx.focus(); return; }
      if (k === 'Escape') { if (pendingEl === t) { clearTimeout(pending); pending = null; pendingEl = null; } clearBad(t); if (t.value !== (t.getAttribute('data-v') || '')) { t.value = t.getAttribute('data-v') || ''; t.select(); e.stopPropagation(); } return; }
      if ((k === 'ArrowUp' || k === 'ArrowDown') && !e.altKey && !meta && !t.matches('.sv-note')) { if (stepField(t, k === 'ArrowUp' ? 1 : -1)) e.preventDefault(); return; }
      /* ← → at the edge of the text walk to the field beside it on the line */
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.altKey && !meta && !e.shiftKey) {
        var s0 = t.selectionStart, s1 = t.selectionEnd, all = fields(), i = all.indexOf(t), go = null;
        if (k === 'ArrowLeft' && s0 === 0 && s1 === 0) go = all[i - 1]; else if (k === 'ArrowRight' && s0 === t.value.length && s1 === t.value.length) go = all[i + 1];
        if (go && go.closest('.sv-row') === rowEl) { e.preventDefault(); go.focus(); }
      }
    }
    /* the first click on a number takes the whole number, so what is typed replaces it (a coach clicks the 3 and types 5;
       it used to land beside it as "35", Chrome's mouseup undoing the select on focus). A drag across the text keeps
       its own selection; a second click places the caret. */
    var firstClick = null, typedN = 0;
    function onInput() { typedN++; }
    function onPointerDown(e) {
      var t = e.target, g = t.closest && t.closest('[data-sv-grip]'); if (g && host.contains(g)) { startDrag(e, g); return; }
      firstClick = t.matches && t.matches('.sv-in:not(.sv-note)') && document.activeElement !== t ? t : null;
    }
    /* a right-click on a line opens its menu (it was only behind the three dots) */
    function onContext(e) {
      var rowEl = e.target.closest && e.target.closest('.sv-row'); if (!rowEl || !host.contains(rowEl) || e.target.matches('input:focus')) return;
      var r = rowIx(rowEl.getAttribute('data-row')), btn = rowEl.querySelector('[data-sv-rowmenu]'); if (r < 0 || !btn || !o.onRowMenu) return;
      e.preventDefault(); flush(); o.onRowMenu(r, btn);
    }
    host.addEventListener('click', onClick);
    host.addEventListener('change', onChange);
    host.addEventListener('input', onInput);
    host.addEventListener('keydown', onKeyFlag, true);
    host.addEventListener('pointerdown', onPtrFlag, true);
    host.addEventListener('focusin', onFocusIn);
    host.addEventListener('focusout', onFocusOut);
    host.addEventListener('keydown', onKey);
    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('copy', onCopy);
    host.addEventListener('paste', onPaste);
    host.addEventListener('contextmenu', onContext);

    return {
      render: render,
      /* the page's menus and deep links speak the grid's language: a row's key and a column, or '+Day' for its add row */
      select: function (key, col) {
        key = String(key || '');
        if (key.charAt(0) === '+') { var d = key.slice(1), sec = goDay(d, false), ad = sec && sec.querySelector('[data-sv-add]'); if (ad) { ad.focus({ preventScroll: true }); addTo(d, ad); } return; }
        var r = rowIx(key); if (r < 0) return;
        lastDay = b().rows[r].day;
        var el = byF(key + '|' + (col === 'effort' || col === 'load' || col === 'reps' || col === 'note' ? col : col === 'ex' ? 'name' : 'sets')) || byF(key + '|sets') || byF(key + '|name');
        if (el && !el.disabled) el.focus();
      },
      sel: function () { return null; },
      focus: function () { if (host.contains(document.activeElement)) return; var el = host.querySelector('.sv-row .sv-in:not([disabled])') || host.querySelector('[data-sv-add]') || host.querySelector('[data-sv-addday]'); if (el) el.focus({ preventScroll: true }); },
      flush: flush,
      undo: function () { return walk('undo'); },
      redo: function () { return walk('redo'); },
      day: function () { return lastDay; },
      destroy: function () {
        dead = true; clearTimeout(pending); pending = null; pendingEl = null;
        if (drag) { if (drag.ghost) drag.ghost.remove(); if (drag.mark) drag.mark.remove(); cancelAnimationFrame(drag.raf); drag = null; }
        if (ro) ro.disconnect();
        host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); host.removeEventListener('input', onInput); host.removeEventListener('keydown', onKeyFlag, true); host.removeEventListener('pointerdown', onPtrFlag, true); host.removeEventListener('focusin', onFocusIn); host.removeEventListener('focusout', onFocusOut);
        host.removeEventListener('keydown', onKey); host.removeEventListener('pointerdown', onPointerDown);
        host.removeEventListener('copy', onCopy); host.removeEventListener('paste', onPaste); host.removeEventListener('contextmenu', onContext);
      }
    };
  }
  W.SIMPLE = { grid: grid };
})();
