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
  var sentence = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
  var low1 = function (s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); };
  var isInt = function (t) { return /^\d+$/.test(String(t)); };
  var isNum = function (t) { return /^\d+(\.\d+)?$/.test(String(t)); };
  /* [field, the column's word]; STEP: what ↑ ↓ and − + change a field by */
  var FIELDS = [['sets', 'Sets'], ['reps', 'Reps'], ['effort', 'RPE or %'], ['load', 'Load']];
  var STEP = { sets: 1, reps: 1, effort: 0.5, load: 2.5 };
  var MORE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>';
  var GRIP = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6.5" r="1.5"/><circle cx="15" cy="6.5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17.5" r="1.5"/><circle cx="15" cy="17.5" r="1.5"/></svg>';
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>';
  var HINT = 'Click a lift to change it. Tab moves across a line, Enter moves down, ↑ and ↓ step a number.';
  var LIFTED = 'This week was lifted. It stays as it was.';
  var still = function () { try { return W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function grid(host, o) {
    o = o || {};
    var ci = o.c, dead = false, pending = null, pendingEl = null, lastDay = null, drag = null;
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
        (auto ? ' placeholder="' + esc(auto) + '"' : '') + (ro ? ' disabled' : '') + ' aria-label="' + esc(f[1] + (f[0] === 'load' ? ' in kg' : '') + ', ' + bb.rows[r].name + (sub ? ', ' + sub : '')) + '"' + (bad ? ' aria-invalid="true"' : '') + '>';
      if (step) return '<span class="sv-step sv-c-' + f[0] + '"><button type="button" tabindex="-1" data-sv-step="-1" data-f="' + esc(id + '|-') + '" aria-label="One less"' + (ro || !isInt(t) || +t <= 1 ? ' disabled' : '') + '>−</button>' + inp +
        '<button type="button" tabindex="-1" data-sv-step="1" data-f="' + esc(id + '|+') + '" aria-label="One more"' + (ro || (t && !isInt(t)) ? ' disabled' : '') + '>+</button></span>';
      if (f[0] === 'load') return '<span class="sv-kg sv-c-load' + (auto ? ' is-auto' : t ? '' : ' is-empty') + '">' + inp + '<i aria-hidden="true">kg</i></span>';
      return '<span class="sv-c-' + f[0] + '">' + inp + '</span>';
    }
    function noteHtml(bb, r, label) {
      var row = bb.rows[r], note = bb.fieldText(r, ci, 'note') || '', ro = bb.isRO(r, ci);
      return '<span class="sv-c-note"><input class="sv-in sv-note" type="text" maxlength="160" autocomplete="off" data-sv-field="note" data-f="' + esc(row.key + '|note') + '" data-v="' + esc(note) + '" value="' + esc(note) + '"' + (ro ? ' disabled' : ' placeholder="Note"') + ' aria-label="' + esc('Note for ' + first + ' on ' + row.name + (label ? ', ' + label : '')) + '"></span>';
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
        '<button class="sv-more sv-c-more" type="button" data-sv-rowmenu data-more aria-haspopup="menu" aria-label="' + esc((label ? label + ' of ' : '') + row.name + ', moves') + '">' + MORE + '</button></div>';
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
      var head = '<div class="sv-dh" data-day="' + esc(d.name) + '"><h3><button type="button" data-day-name data-sv-rename title="Rename the day">' + esc(sentence(d.name)) + '</button></h3>' +
        '<span class="sv-dd">' + esc([dLong(d.iso), d.off ? 'out this week' : rs.length ? K.plural(sets, 'set') : '', begun ? 'under way' : ''].filter(Boolean).join(', ')) + '</span>' +
        '<button class="sv-more" type="button" data-sv-daymenu data-more aria-haspopup="menu" aria-label="' + esc(sentence(d.name) + ' moves') + '">' + MORE + '</button></div>';
      var body;
      if (d.off) body = '<p class="sv-none">' + esc(sentence(d.name)) + ' is out of this week. <button class="sv-link" type="button" data-sv-restore="' + esc(d.name) + '">Put it back</button></p>';
      else {
        body = '<div class="sv-grid" data-day="' + esc(d.name) + '" role="group" aria-label="' + esc(sentence(d.name) + ' lifts') + '">' +
          (rs.length ? '<div class="sv-heads" aria-hidden="true"><span></span><span>Exercise</span><span class="n">Sets</span><span></span><span class="n">Reps</span><span class="n">RPE or %</span><span class="n">Load</span><span>Last week</span><span>Note for ' + esc(first) + '</span><span></span></div>' : '') +
          mains.concat(orphans).map(function (r) { var x = bb.rows[r]; return exHtml(bb, r, x.line === 0 ? rs.filter(function (s) { return bb.rows[s].ex === x.ex && bb.rows[s].line > 0; }) : []); }).join('') +
          (lifted ? (rs.length ? '' : '<p class="sv-none">Nothing was written for this day.</p>') :
            '<button class="sv-add" type="button" data-sv-add="' + esc(d.name) + '" data-f="' + esc('+' + d.name + '|add') + '" aria-haspopup="dialog">' + PLUS + '<span>' + (rs.length ? 'Add an exercise' : 'Add the first exercise') + '</span></button>') + '</div>';
      }
      return '<section class="sv-day' + (d.off ? ' is-off' : '') + '" data-sv-day="' + esc(d.name) + '" aria-label="' + esc(sentence(d.name)) + '">' + head + body + '</section>';
    }
    function html() {
      var bb = b(), w = bb.weeks[ci]; if (!w) return '<p class="sv-none">There is no week here.</p>';
      var days = bb.daysOf(ci), lifted = w.state === 'lifted';
      var chips = '<div class="sv-bar"><div class="sv-days" role="group" aria-label="Days of the week">' + days.map(function (d) {
        return '<button class="sv-chip" type="button" data-sv-go="' + esc(d.name) + '" data-f="' + esc('day|' + d.name) + '"' + (d.off ? ' data-off' : '') + '><b>' + esc(dShort(d.iso) || 'No date') + '</b><span>' + esc(sentence(d.name)) + '</span></button>';
      }).join('') + (lifted ? '' : '<button class="sv-chip sv-chip-add" type="button" data-sv-addday data-f="day|+">' + PLUS + '<span>Add a day</span></button>') + '</div>' +
        '<p class="sv-status" data-sv-status aria-live="polite">' + esc(lifted ? LIFTED : HINT) + '</p></div>';
      var body = days.length ? days.map(function (d) { return dayHtml(bb, d, lifted); }).join('') : '<p class="sv-none">This block has no days yet. Add the first one.</p>';
      var foot = '<div class="sv-foot">' + (o.onSaveTemplate ? '<button class="btn quiet sm" type="button" data-sv-tpl>Save this block as a template…</button>' : '') +
        (o.onAdvanced ? '<span class="sv-adv">Ranges, formulas, every week side by side: <button class="sv-link" type="button" data-sv-adv>open Advanced</button></span>' : '') + '</div>';
      return '<div class="sv" data-simple>' + chips + '<div class="sv-wk">' + body + '</div>' + foot + '<div class="wg-tail"></div></div>';
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
    function render(x) {
      if (dead) return;
      if (x && x.c != null) ci = x.c;
      var h = hand(), tail = host.querySelector('.wg-tail'), keepTail = tail ? [].slice.call(tail.childNodes) : [];
      host.innerHTML = html();
      var t2 = host.querySelector('.wg-tail'); if (t2) keepTail.forEach(function (n) { t2.appendChild(n); });
      fit();
      take(h);
      status(document.activeElement);
    }
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
      s.innerHTML = (nm ? '<b>' + esc(nm) + '</b> ' : '') + esc(text);
    }

    /* ---------- writing ---------- */
    /* words: what the toast says (with the page's Undo), or an object whose .say the write itself fills in once it knows */
    function apply(fn, label, words) { var oo = words && typeof words === 'object' ? words : words ? { say: words } : {}; oo.focus = false; return o.apply ? o.apply(fn, label, oo) : null; }
    function commit(inp) {
      if (pendingEl === inp) { clearTimeout(pending); pending = null; pendingEl = null; }
      var f = inp.getAttribute('data-sv-field'), v = inp.value.trim(), was = inp.getAttribute('data-v') || '';
      if (v === was) return;
      var key = inp.getAttribute('data-f').split('|').slice(0, -1).join('|'), nm = (b().rows[rowIx(key)] || {}).name || 'the line';
      inp.setAttribute('data-v', v);
      apply(function (bb) { var r = ixIn(bb, key); return r < 0 ? gone() : bb.setField(r, ci, f, v); }, nm + ' ' + (f === 'effort' ? 'RPE or %' : f));
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
    function changeName(btn) {
      var key = btn.closest('.sv-row').getAttribute('data-row'), r = rowIx(key), row = b().rows[r]; if (!row || !W.PICK) return;
      flush();
      var old = row.name;
      W.PICK.open(btn, { value: old, block: b(), c: ci, title: 'Change ' + low1(old), onPick: function (e) {
        var oo = {};
        var res = apply(function (bb) {
          var rr = ixIn(bb, key); if (rr < 0) return gone();
          var r2 = bb.changeExercise(rr, ci, e.name, { lift: e.lift, variant: e.variant || undefined });
          if (r2 && !r2.error && r2.data && r2.data.changed !== false) { var x = bb.rows[r2.data.r] || bb.rows[ixIn(bb, key)], now = x ? x.name : e.name; oo.say = r2.data.from != null ? now + ' from week ' + weekNo(bb, r2.data.from) + ' on. The weeks already lifted keep ' + low1(old) + '.' : old + ' is now ' + low1(now) + '.'; }
          return r2;
        }, 'Change ' + low1(old), oo);
        if (!res || res.error || !res.data || res.data.changed === false) { var again = byF(key + '|name'); if (again) again.focus(); return; }
        var nb = b(), nr = nb.rows[res.data.r] || nb.rows[rowIx(key)];
        var f2 = nr && (byF(nr.key + '|sets') || byF(nr.key + '|name')); if (f2 && !f2.disabled) f2.focus();
      }, onClose: function () { var again = byF(key + '|name'); if (again) again.focus({ preventScroll: true }); } });
    }
    function addTo(d, btn) {
      if (!W.PICK) return;
      flush();
      W.PICK.open(btn, { block: b(), c: ci, title: 'Add to ' + low1(sentence(d)), onPick: function (e) {
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
      var sx = ev.clientX, sy = ev.clientY;
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
      if ((x = t.closest('[data-sv-go]'))) { goDay(x.getAttribute('data-sv-go'), true); return; }
      if ((x = t.closest('[data-sv-addday]'))) { flush(); var res = apply(function (bb) { return bb.addDay(); }, null, 'Day added. Add its first exercise.'); if (res && res.data && res.data.day) { var sec = goDay(res.data.day, false), ad = sec && sec.querySelector('[data-sv-add]'); if (ad) ad.focus({ preventScroll: true }); } return; }
      if ((x = t.closest('[data-sv-step]'))) { var inp = x.parentNode.querySelector('input'); if (inp && !inp.disabled) { stepField(inp, +x.getAttribute('data-sv-step')); inp.focus({ preventScroll: true }); } return; }
      if ((x = t.closest('[data-sv-rowmenu]'))) { flush(); var r = rowIx(x.closest('.sv-row').getAttribute('data-row')); if (r >= 0 && o.onRowMenu) o.onRowMenu(r, x); return; }
      if ((x = t.closest('[data-sv-daymenu]'))) { flush(); lastDay = x.closest('[data-sv-day]').getAttribute('data-sv-day'); if (o.onDayMenu) o.onDayMenu(lastDay, x); return; }
      if ((x = t.closest('[data-sv-rename]'))) { renameDay(x); return; }
      if ((x = t.closest('[data-sv-restore]'))) { var d = x.getAttribute('data-sv-restore'); apply(function (bb) { return bb.restoreDay(ci, d); }, null, sentence(d) + ' is back in the week.'); return; }
      if ((x = t.closest('[data-sv-name]'))) { changeName(x); return; }
      if ((x = t.closest('[data-sv-add]'))) { addTo(x.getAttribute('data-sv-add'), x); return; }
      if ((x = t.closest('[data-sv-tpl]'))) { if (o.onSaveTemplate) o.onSaveTemplate(x); return; }
      if ((x = t.closest('[data-sv-adv]'))) { if (o.onAdvanced) o.onAdvanced(); return; }
    }
    function onChange(e) { var t = e.target; if (t.matches('[data-sv-field]')) later(t, 0); }
    function onFocusIn(e) {
      var t = e.target;
      /* a number still counting its steps saves the moment the focus leaves it for another field */
      if (pendingEl && pendingEl !== t) flush();
      if (t.matches('.sv-in') && !t.matches('.sv-note') && t.select) setTimeout(function () { if (document.activeElement === t) t.select(); }, 0);
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
      var isField = t.matches('[data-sv-field]'), typed = isField && pendingEl !== t && t.value !== (t.getAttribute('data-v') || '');
      /* undo and redo: the field's own while something is half typed, the week's otherwise */
      if (meta && !e.altKey && k.toLowerCase() === 'z' && !typed) { e.preventDefault(); e.stopPropagation(); walk(e.shiftKey ? 'redo' : 'undo'); return; }
      if (meta && !e.altKey && !e.shiftKey && k.toLowerCase() === 'y' && !typed) { e.preventDefault(); e.stopPropagation(); walk('redo'); return; }
      var rowEl = t.closest('.sv-row');
      if (rowEl && e.altKey && e.shiftKey && !meta && (k === 'ArrowUp' || k === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); flush(); nudge(rowEl, k === 'ArrowUp' ? -1 : 1); return; }
      if (rowEl && meta && !e.altKey && !e.shiftKey && k.toLowerCase() === 'd') {
        e.preventDefault(); e.stopPropagation(); flush();
        var key = rowEl.getAttribute('data-row'), nm = (b().rows[rowIx(key)] || {}).name || 'The line';
        var res = apply(function (bb) { var r = ixIn(bb, key); return r < 0 ? gone() : bb.duplicateRow(r); }, 'Duplicate ' + low1(nm), nm + ' duplicated.');
        if (res && res.data && res.data.r != null) { var nr = b().rows[res.data.r], f2 = nr && byF(nr.key + '|sets'); if (f2) f2.focus(); }
        return;
      }
      if (!isField) return;
      if (k === 'Enter') { e.preventDefault(); commit(t); var again = byF(t.getAttribute('data-f')) || t, nx = sameCol(again, e.shiftKey ? -1 : 1); if (nx) nx.focus(); return; }
      if (k === 'Escape') { if (pendingEl === t) { clearTimeout(pending); pending = null; pendingEl = null; } if (t.value !== (t.getAttribute('data-v') || '')) { t.value = t.getAttribute('data-v') || ''; t.select(); e.stopPropagation(); } return; }
      if ((k === 'ArrowUp' || k === 'ArrowDown') && !e.altKey && !meta && !t.matches('.sv-note')) { if (stepField(t, k === 'ArrowUp' ? 1 : -1)) e.preventDefault(); return; }
      /* ← → at the edge of the text walk to the field beside it on the line */
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.altKey && !meta && !e.shiftKey) {
        var s0 = t.selectionStart, s1 = t.selectionEnd, all = fields(), i = all.indexOf(t), go = null;
        if (k === 'ArrowLeft' && s0 === 0 && s1 === 0) go = all[i - 1]; else if (k === 'ArrowRight' && s0 === t.value.length && s1 === t.value.length) go = all[i + 1];
        if (go && go.closest('.sv-row') === rowEl) { e.preventDefault(); go.focus(); }
      }
    }
    function onPointerDown(e) { var g = e.target.closest && e.target.closest('[data-sv-grip]'); if (g && host.contains(g)) startDrag(e, g); }
    host.addEventListener('click', onClick);
    host.addEventListener('change', onChange);
    host.addEventListener('focusin', onFocusIn);
    host.addEventListener('keydown', onKey);
    host.addEventListener('pointerdown', onPointerDown);

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
      focus: function () { if (host.contains(document.activeElement)) return; var el = host.querySelector('.sv-row .sv-in:not([disabled])') || host.querySelector('[data-sv-add]') || host.querySelector('.sv-chip'); if (el) el.focus({ preventScroll: true }); },
      flush: flush,
      undo: function () { return walk('undo'); },
      redo: function () { return walk('redo'); },
      day: function () { return lastDay; },
      destroy: function () {
        dead = true; clearTimeout(pending); pending = null; pendingEl = null;
        if (drag) { if (drag.ghost) drag.ghost.remove(); if (drag.mark) drag.mark.remove(); cancelAnimationFrame(drag.raf); drag = null; }
        if (ro) ro.disconnect();
        host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); host.removeEventListener('focusin', onFocusIn);
        host.removeEventListener('keydown', onKey); host.removeEventListener('pointerdown', onPointerDown);
      }
    };
  }
  W.SIMPLE = { grid: grid };
})();
