/* simple.js: the Simple view of a lifter's week on Programs (20 Nov, the owner: "a normal app like UI where they can
   just enter the lift, enter the numbers, and press add lift"). One day on screen at a time; each lift is a block of
   plain fields (Sets, Reps, RPE or %, Load); a form under the day adds a lift. It edits the same block the sheet edits,
   through the page's own write (opts.apply = programs.html gridApply), so every change is one Undo step and Advanced
   shows it at once. SIMPLE.grid(host, opts) answers what the page asks of any grid: render, select, sel, focus, flush,
   destroy.
   opts: block() the page's block, c the week's index, lifter { first }, apply(fn(block), label, { say }),
   onRowMenu(r, btn), onDayMenu(day, btn), onSaveTemplate(btn), onAdvanced(). */
(function () {
  'use strict';
  var W = window, K = W.K, BL = W.BLOCK, esc = K.esc;
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var day0 = function (iso) { var d = iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00') : null; return d && !isNaN(d) ? d : null; };
  var dShort = function (iso) { var d = day0(iso); return d ? WD[d.getDay()] + ' ' + d.getDate() : ''; };
  var dLong = function (iso) { var d = day0(iso); return d ? WD[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] : ''; };
  var nf = function (v) { return BL && BL.nf ? BL.nf(v) : String(Math.round(v * 100) / 100); };
  var sentence = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); };
  var isInt = function (t) { return /^\d+$/.test(String(t)); };
  var isNum = function (t) { return /^\d+(\.\d+)?$/.test(String(t)); };
  var FIELDS = [['sets', 'Sets', 1], ['reps', 'Reps', 1], ['effort', 'RPE or %', 0.5], ['load', 'Load', 2.5]];
  var MORE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18.5" cy="12" r="1.7"/></svg>';

  function grid(host, o) {
    o = o || {};
    var ci = o.c, day = null, dead = false, pending = null;
    var draft = { name: '', sets: '3', reps: '5', effort: '', load: '' };
    var sug = { open: false, at: 0, list: [] };
    var b = function () { return o.block(); };
    var first = (o.lifter && o.lifter.first) || 'the lifter';
    var rowIx = function (key) { var rows = b().rows; for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return i; return -1; };
    var has = function (bb, r) { var w = bb.weeks[ci]; return !!(w && bb.rows[r] && bb.rows[r].cells[w.uid]); };

    /* ---------- the picture ---------- */
    function fieldHtml(bb, r, f, sub) {
      var key = bb.rows[r].key, ro = bb.isRO(r, ci), t = bb.fieldText(r, ci, f[0], { ascii: true }) || '', auto = '', bad = bb.badField && bb.badField(r, ci, f[0]) != null;
      if (f[0] === 'load' && !t) { var L = bb.load(r, ci); if (L && L.kg != null) auto = nf(L.kg) + (L.kgHi != null && L.kgHi !== L.kg ? '-' + nf(L.kgHi) : ''); }
      var id = key + '|' + f[0], step = f[0] === 'sets' || f[0] === 'reps';
      var inp = '<input class="sv-in" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-sv-field="' + f[0] + '" data-f="' + esc(id) + '" data-v="' + esc(t) + '" value="' + esc(t) + '"' +
        (auto ? ' placeholder="' + esc(auto) + '"' : '') + (ro ? ' disabled' : '') + ' aria-label="' + esc(f[1] + (f[0] === 'load' ? ' in kg' : '') + ', ' + bb.rows[r].name + (sub ? ', ' + sub : '')) + '"' + (bad ? ' aria-invalid="true"' : '') + '>';
      if (step) inp = '<span class="sv-step"><button type="button" tabindex="-1" data-sv-step="-1" data-f="' + esc(id + '|-') + '" aria-label="One less"' + (ro || !isInt(t) || +t <= 1 ? ' disabled' : '') + '>−</button>' + inp +
        '<button type="button" tabindex="-1" data-sv-step="1" data-f="' + esc(id + '|+') + '" aria-label="One more"' + (ro || (t && !isInt(t)) ? ' disabled' : '') + '>+</button></span>';
      else if (f[0] === 'load') inp = '<span class="sv-kg' + (auto ? ' is-auto' : '') + '">' + inp + '<i aria-hidden="true">kg</i></span>';
      return '<label class="sv-f sv-f-' + f[0] + '"><span class="sv-k">' + f[1] + '</span>' + inp + '</label>';
    }
    function noteHtml(bb, r, label) {
      var row = bb.rows[r], note = bb.fieldText(r, ci, 'note') || '', ro = bb.isRO(r, ci);
      return '<label class="sv-f sv-f-note"><span class="sv-k">Note for ' + esc(first) + '</span><input class="sv-in sv-note" type="text" maxlength="160" autocomplete="off" data-sv-field="note" data-f="' + esc(row.key + '|note') + '" data-v="' + esc(note) + '" value="' + esc(note) + '"' + (ro ? ' disabled' : '') + ' aria-label="' + esc('Note on ' + row.name + (label ? ', ' + label : '')) + '"></label>';
    }
    function lineHtml(bb, r, label) {
      return '<div class="sv-line' + (label ? ' is-sub' : '') + '" data-row="' + esc(bb.rows[r].key) + '">' +
        (label ? '<span class="sv-sub">' + esc(label) + '</span>' : '') +
        FIELDS.map(function (f) { return fieldHtml(bb, r, f, label); }).join('') + noteHtml(bb, r, label) +
        (label ? '<button class="sv-more" type="button" data-sv-rowmenu data-more aria-haspopup="menu" aria-label="' + esc(label + ' of ' + bb.rows[r].name + ', moves') + '">' + MORE + '</button>' : '') + '</div>';
    }
    function exHtml(bb, r, subs) {
      var row = bb.rows[r], w = bb.weeks[ci], lw = bb.lastWeek ? bb.lastWeek(r, ci) : null, why = bb.loadWords ? bb.loadWords(r, ci) : null, ro = bb.isRO(r, ci);
      /* a line already lifted this week says what was lifted, where a line still to come says last week's */
      var cx = row.cells[w.uid] || null, done = cx && cx.lifted && bb.lastWeek ? bb.lastWeek(r, ci, { from: ci }) : null;
      var bits = [];
      if (row.variant && row.variant !== 'Competition' && row.name.toLowerCase().indexOf(row.variant.toLowerCase()) < 0) bits.push(row.variant);
      if (row.pause) bits.push(row.pause + ' s pause');
      if (row.tempo) bits.push('tempo ' + row.tempo);
      var canBack = !ro && row.lift && !subs.length;
      return '<li class="sv-ex"' + (row.lift ? ' data-lift="' + esc(row.lift) + '"' : '') + ' data-ex="' + esc(row.key) + '">' +
        '<div class="sv-eh"><h4 class="sv-name"' + (row.lift ? ' data-lift="' + esc(row.lift) + '"' : '') + '>' + esc(row.name) + '</h4>' +
        (bits.length ? '<span class="sv-var">' + esc(bits.join(', ')) + '</span>' : '') +
        (done && done.text ? '<span class="sv-last is-done"><span class="sv-lk">Lifted</span> ' + esc(done.text) + '</span>' : lw && lw.text ? '<span class="sv-last"><span class="sv-lk">Last week</span> ' + esc(lw.text) + '</span>' : '') +
        '<button class="sv-more" type="button" data-sv-rowmenu data-more aria-haspopup="menu" aria-label="' + esc(row.name + ' moves') + '">' + MORE + '</button></div>' +
        lineHtml(bb, r, '') +
        (why && why.text ? '<p class="sv-why">' + esc(why.text) + '</p>' : '') +
        subs.map(function (s) { var x = bb.rows[s]; return lineHtml(bb, s, x.label || (BL && BL.lineLabel ? BL.lineLabel(x, x.cells[w.uid] || null, {}) : 'More sets')); }).join('') +
        (canBack ? '<div class="sv-ef"><button class="sv-link" type="button" data-sv-backoff data-f="' + esc(row.key + '|backoff') + '">Add back-off sets</button></div>' : '') + '</li>';
    }
    function addHtml(d) {
      var f = function (k, label, ph, cls) { return '<label class="sv-f ' + cls + '"><span class="sv-k">' + label + '</span>' + (k === 'load' ? '<span class="sv-kg">' : '') + '<input class="sv-in" type="text" autocomplete="off" spellcheck="false"' + (k === 'name' ? ' role="combobox" aria-expanded="' + sug.open + '" aria-controls="sv-sug" aria-autocomplete="list"' : ' inputmode="decimal"') + ' data-sv-new="' + k + '" data-f="' + esc('+' + d + '|' + k) + '" value="' + esc(draft[k]) + '" placeholder="' + esc(ph) + '">' + (k === 'load' ? '<i aria-hidden="true">kg</i></span>' : '') + '</label>'; };
      return '<form class="sv-add" data-sv-add novalidate><h4 id="sv-add-h">Add a lift</h4><div class="sv-line">' +
        '<div class="sv-combo">' + f('name', 'Exercise', 'Squat, bench, row…', 'sv-f-name') + '<ul class="sv-sug" id="sv-sug" role="listbox" aria-label="Exercises"' + (sug.open && sug.list.length ? '' : ' hidden') + '>' + sugHtml() + '</ul></div>' +
        f('sets', 'Sets', '3', 'sv-f-sets') + f('reps', 'Reps', '5', 'sv-f-reps') + f('effort', 'RPE or %', '7 or 70%', 'sv-f-effort') + f('load', 'Load', 'auto', 'sv-f-load') +
        '<button class="btn" type="submit" data-f="' + esc('+' + d + '|go') + '">Add lift</button></div></form>';
    }
    function sugHtml() { return sug.list.map(function (e, i) { return '<li role="option" id="sv-sug-' + i + '" data-sv-pick="' + esc(e.name) + '" aria-selected="' + (i === sug.at) + '"' + (e.lift ? ' data-lift="' + esc(e.lift) + '"' : '') + '><span>' + esc(e.name) + '</span>' + (e.here ? '<small>in this block</small>' : '') + '</li>'; }).join(''); }
    function html() {
      var bb = b(), w = bb.weeks[ci]; if (!w) return '<p class="sv-none">There is no week here.</p>';
      var days = bb.daysOf(ci);
      if (!days.some(function (d) { return d.name === day; })) { var d0 = days.filter(function (d) { return !d.off && d.lines; })[0] || days[0]; day = d0 ? d0.name : null; }
      var lifted = w.state === 'lifted';
      var tabs = '<div class="sv-tabs" role="tablist" aria-label="Days of the week">' + days.map(function (d) {
        var on = d.name === day;
        return '<button class="sv-tab" type="button" role="tab" aria-selected="' + on + '" tabindex="' + (on ? 0 : -1) + '" data-sv-day="' + esc(d.name) + '" data-f="' + esc('day|' + d.name) + '">' +
          '<b>' + esc(sentence(d.name)) + '</b><span>' + esc(d.off ? 'Out this week' : (dShort(d.iso) ? dShort(d.iso) + ', ' : '') + (d.lines ? K.plural(d.lines, 'line') : 'empty')) + '</span></button>';
      }).join('') + (lifted ? '' : '<button class="sv-tab sv-tab-add" type="button" data-sv-addday data-f="day|+"><b>Add a day</b><span>to the block</span></button>') + '</div>';
      var body = '';
      var cd = days.filter(function (d) { return d.name === day; })[0];
      if (!cd) body = '<p class="sv-none">This block has no days yet. Add the first one.</p>';
      else {
        var rs = bb.rowsOfDay(cd.name).filter(function (r) { return has(bb, r); }), mains = rs.filter(function (r) { return bb.rows[r].line === 0; });
        /* a line whose top line is not in this week stands on its own */
        var orphans = rs.filter(function (r) { var x = bb.rows[r]; return x.line > 0 && !mains.some(function (m) { return bb.rows[m].ex === x.ex; }); });
        var sets = rs.reduce(function (a, r) { var t = bb.fieldText(r, ci, 'sets', { ascii: true }); return a + (isInt(t) ? +t : 0); }, 0);
        body += '<div class="sv-dh" data-day="' + esc(cd.name) + '"><h3><button type="button" data-day-name data-sv-rename title="Rename the day">' + esc(sentence(cd.name)) + '</button></h3>' +
          '<span class="sv-dd">' + esc([dLong(cd.iso), rs.length ? K.plural(sets, 'set') : ''].filter(Boolean).join(', ')) + '</span>' +
          '<button class="sv-more" type="button" data-sv-daymenu data-more aria-haspopup="menu" aria-label="' + esc(sentence(cd.name) + ' moves') + '">' + MORE + '</button></div>';
        if (cd.off) body += '<p class="sv-none">' + esc(sentence(cd.name)) + ' is out of this week. <button class="sv-link" type="button" data-sv-restore>Put it back</button></p>';
        else {
          body += rs.length ? '<ol class="sv-list">' + mains.concat(orphans).map(function (r) {
            var x = bb.rows[r];
            return exHtml(bb, r, x.line === 0 ? rs.filter(function (s) { return bb.rows[s].ex === x.ex && bb.rows[s].line > 0; }) : []);
          }).join('') + '</ol>' : '<p class="sv-none">No lifts on this day yet. Add the first one below.</p>';
          if (!lifted) body += addHtml(cd.name);
        }
      }
      var foot = '<div class="sv-foot">' + (o.onSaveTemplate ? '<button class="btn quiet sm" type="button" data-sv-tpl>Save this block as a template…</button>' : '') +
        (o.onAdvanced ? '<span class="sv-adv">Ranges, formulas, every week side by side: <button class="sv-link" type="button" data-sv-adv>open Advanced</button></span>' : '') + '</div>';
      return '<div class="sv" data-simple>' + tabs + '<div class="sv-day" role="tabpanel" aria-label="' + esc(sentence(day || '')) + '">' + body + '</div>' + foot + '<div class="wg-tail"></div></div>';
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
      take(h);
    }

    /* ---------- writing ---------- */
    function apply(fn, label, say) { return o.apply ? o.apply(fn, label, say ? { say: say, focus: false } : { focus: false }) : null; }
    function commit(inp) {
      var f = inp.getAttribute('data-sv-field'), v = inp.value.trim(), was = inp.getAttribute('data-v') || '';
      if (v === was) return;
      var key = inp.getAttribute('data-f').split('|').slice(0, -1).join('|'), nm = (b().rows[rowIx(key)] || {}).name || 'the line';
      inp.setAttribute('data-v', v);
      apply(function (bb) { var r = -1; bb.rows.forEach(function (x, i) { if (x.key === key) r = i; }); return r < 0 ? { error: { message: 'That line is gone.' } } : bb.setField(r, ci, f, v); }, nm + ' ' + (f === 'effort' ? 'RPE or %' : f));
    }
    function later(inp) { clearTimeout(pending); pending = setTimeout(function () { pending = null; if (!dead && inp.isConnected) commit(inp); }, 0); }
    function stepField(inp, dir) {
      var f = inp.getAttribute('data-sv-field'), st = (FIELDS.filter(function (x) { return x[0] === f; })[0] || [])[2], t = inp.value.trim() || inp.getAttribute('placeholder') || '';
      if (!st || !isNum(t)) return false;
      var v = Math.max(f === 'effort' ? 1 : f === 'load' ? 0 : 1, +t + dir * st); if (f === 'effort') v = Math.min(10, v);
      inp.value = nf(v); commit(inp); return true;
    }
    function addLift(d) {
      var name = draft.name.trim(), sets = draft.sets.trim() || '3', reps = draft.reps.trim() || '5', effort = draft.effort.trim(), load = draft.load.trim();
      var nameIn = byF('+' + d + '|name');
      if (!name) { if (nameIn) { nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); } return; }
      var lib = BL && BL.libFind ? BL.libFind(name) : null; if (lib) name = lib.name;
      var res = apply(function (bb) {
        return bb.batch('Add ' + name + ' to ' + d, function () {
          var r = -1, w = bb.weeks[ci];
          /* a lift this day already holds in other weeks comes back into this one, never a second row of the same name */
          bb.rows.forEach(function (x, i) { if (r < 0 && x.day === d && x.line === 0 && x.name.toLowerCase() === name.toLowerCase() && !x.cells[w.uid]) r = i; });
          if (r < 0) { var a = bb.addExercise(d, name, lib && lib.lift ? { lift: lib.lift } : {}); if (!a || a.error) return a; r = a.data.r; }
          var s = bb.set(r, ci, sets + 'x' + reps); if (s && s.error) return s;
          if (effort) { var e = bb.setField(r, ci, 'effort', effort); if (e && e.error) return e; }
          if (load) { var l = bb.setField(r, ci, 'load', load); if (l && l.error) return l; }
          return { data: { r: r } };
        });
      }, 'Add ' + name, name + ' added to ' + sentence(d).toLowerCase() + '.');
      if (res && !res.error) { draft = { name: '', sets: draft.sets, reps: draft.reps, effort: '', load: '' }; sug.open = false; render(); var n2 = byF('+' + d + '|name'); if (n2) n2.focus(); }
    }

    /* ---------- the exercise suggestions ---------- */
    function suggest(q) {
      q = String(q || '').toLowerCase().trim();
      var bb = b(), seen = {}, out = [];
      var push = function (name, lift, here) { var k = name.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push({ name: name, lift: lift || null, here: !!here }); };
      var hit = function (name) { var n = name.toLowerCase(); return !q || n.indexOf(q) === 0 || n.split(/[\s-]+/).some(function (wd) { return wd.indexOf(q) === 0; }) || (q.length > 2 && n.indexOf(q) > 0); };
      bb.rows.forEach(function (x) { if (x.line === 0 && hit(x.name)) push(x.name, x.lift, true); });
      ((BL && BL.LIBRARY) || []).forEach(function (e) { if (hit(e.name)) push(e.name, e.lift, false); });
      if (q) out.sort(function (x, y) { return (y.name.toLowerCase().indexOf(q) === 0) - (x.name.toLowerCase().indexOf(q) === 0); });
      return out.slice(0, 7);
    }
    function paintSug() {
      var ul = host.querySelector('.sv-sug'), inp = host.querySelector('[data-sv-new="name"]'); if (!ul || !inp) return;
      ul.innerHTML = sugHtml(); ul.hidden = !(sug.open && sug.list.length);
      inp.setAttribute('aria-expanded', String(!ul.hidden));
      if (!ul.hidden && sug.list[sug.at]) inp.setAttribute('aria-activedescendant', 'sv-sug-' + sug.at); else inp.removeAttribute('aria-activedescendant');
    }
    function pick(name) { draft.name = name; sug.open = false; var inp = host.querySelector('[data-sv-new="name"]'); if (inp) { inp.value = name; inp.removeAttribute('aria-invalid'); } paintSug(); var s = host.querySelector('[data-sv-new="sets"]'); if (s) { s.focus(); s.select(); } }

    /* ---------- events ---------- */
    function onClick(e) {
      var t = e.target, x;
      if ((x = t.closest('[data-sv-day]'))) { day = x.getAttribute('data-sv-day'); sug.open = false; render(); var tb = byF('day|' + day); if (tb) tb.focus(); return; }
      if ((x = t.closest('[data-sv-addday]'))) { var res = apply(function (bb) { return bb.addDay(); }, null, 'Day added. Add its first lift.'); if (res && res.data && res.data.day) { day = res.data.day; render(); var n = byF('+' + day + '|name'); if (n) n.focus(); } return; }
      if ((x = t.closest('[data-sv-step]'))) { var inp = x.parentNode.querySelector('input'); if (inp) { stepField(inp, +x.getAttribute('data-sv-step')); var again = byF(x.getAttribute('data-f')); if (again && !again.disabled) again.focus({ preventScroll: true }); } return; }
      if ((x = t.closest('[data-sv-rowmenu]'))) { var holder = x.closest('.sv-line.is-sub') || x.closest('.sv-ex'), key = holder.getAttribute('data-row') || holder.getAttribute('data-ex'), r = rowIx(key); if (r >= 0 && o.onRowMenu) o.onRowMenu(r, x); return; }
      if ((x = t.closest('[data-sv-daymenu]'))) { if (o.onDayMenu) o.onDayMenu(day, x); return; }
      if ((x = t.closest('[data-sv-rename]'))) { renameDay(x); return; }
      if ((x = t.closest('[data-sv-restore]'))) { var d = day; apply(function (bb) { return bb.restoreDay(ci, d); }, null, sentence(d) + ' is back in the week.'); return; }
      if ((x = t.closest('[data-sv-backoff]'))) {
        var k2 = x.closest('.sv-ex').getAttribute('data-ex');
        apply(function (bb) { return bb.batch('Add back-offs', function () { var r2 = -1; bb.rows.forEach(function (row, i) { if (row.key === k2) r2 = i; }); var a = bb.addLine(r2); if (!a || a.error) return a; var s = bb.set(a.data.r, ci, '2x5 -10%'); return s && s.error ? s : a; }); }, 'Add back-offs', 'Back-offs added: 2 × 5, 10% lighter.');
        return;
      }
      if ((x = t.closest('[data-sv-pick]'))) { pick(x.getAttribute('data-sv-pick')); return; }
      if ((x = t.closest('[data-sv-tpl]'))) { if (o.onSaveTemplate) o.onSaveTemplate(x); return; }
      if ((x = t.closest('[data-sv-adv]'))) { if (o.onAdvanced) o.onAdvanced(); return; }
    }
    function renameDay(btn) {
      var D = W.DESK, d = day; if (!D || !D.pop) return;
      var el = D.pop.open(btn, '<h3>Rename the day</h3><div class="row-f"><label for="sv-rn">Name</label><input class="input" id="sv-rn" maxlength="40" value="' + esc(sentence(d)) + '"></div><div class="acts"><button class="btn sm" type="button" data-sv-rn-ok>Rename</button><button class="btn quiet sm" type="button" data-pop-close>Cancel</button></div>', { label: 'Rename the day', focus: '#sv-rn' });
      var go = function () { var v = el.querySelector('#sv-rn').value.trim(); D.pop.close(); if (!v || v === d) return; var res = apply(function (bb) { return bb.renameDay(d, v); }, null, 'Day renamed.'); if (res && !res.error) { day = (res.data && res.data.day) || v; render(); } };
      el.addEventListener('click', function (e) { if (e.target.closest('[data-sv-rn-ok]')) go(); else if (e.target.closest('[data-pop-close]')) D.pop.close(); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    }
    function onChange(e) { var t = e.target; if (t.matches('[data-sv-field]')) later(t); }
    function onInput(e) {
      var t = e.target, k = t.getAttribute('data-sv-new'); if (!k) return;
      draft[k] = t.value;
      if (k === 'name') { t.removeAttribute('aria-invalid'); sug.list = suggest(t.value); sug.at = 0; sug.open = true; paintSug(); }
    }
    function onFocusIn(e) { var t = e.target; if (t.matches('[data-sv-new="name"]')) { sug.list = suggest(t.value); sug.at = 0; sug.open = true; paintSug(); } else if (sug.open && !t.closest('.sv-combo')) { sug.open = false; paintSug(); } if (t.matches('.sv-in') && !t.matches('.sv-note') && t.select && !t.matches('[data-sv-new="name"]')) setTimeout(function () { if (document.activeElement === t) t.select(); }, 0); }
    function onFocusOut(e) { if (e.target.matches('[data-sv-new="name"]')) setTimeout(function () { if (!dead && sug.open && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.sv-combo'))) { sug.open = false; paintSug(); } }, 120); }
    function onKey(e) {
      var t = e.target;
      if (t.matches('[data-sv-new="name"]') && sug.open && sug.list.length) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sug.at = (sug.at + (e.key === 'ArrowDown' ? 1 : -1) + sug.list.length) % sug.list.length; paintSug(); return; }
        if (e.key === 'Enter' && t.value.trim() && sug.list[sug.at]) { e.preventDefault(); pick(sug.list[sug.at].name); return; }
        if (e.key === 'Escape') { e.stopPropagation(); sug.open = false; paintSug(); return; }
      }
      if (t.matches('[data-sv-field]')) {
        if (e.key === 'Enter') { e.preventDefault(); commit(t); var all = [].slice.call(host.querySelectorAll('.sv-list input:not([disabled])')), f = t.getAttribute('data-f'), i = all.map(function (x) { return x.getAttribute('data-f'); }).indexOf(f), nx = all[i + (e.shiftKey ? -1 : 1)]; if (nx) nx.focus(); return; }
        if (e.key === 'Escape') { t.value = t.getAttribute('data-v') || ''; t.select(); e.stopPropagation(); return; }
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !t.matches('.sv-note')) { if (stepField(t, e.key === 'ArrowUp' ? 1 : -1)) e.preventDefault(); return; }
      }
      if (t.matches('.sv-tab') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { var tabs = [].slice.call(host.querySelectorAll('.sv-tab')), j = tabs.indexOf(t), go = tabs[j + (e.key === 'ArrowRight' ? 1 : -1)]; if (go) { e.preventDefault(); go.focus(); if (go.hasAttribute('data-sv-day')) go.click(); } }
    }
    function onSubmit(e) { if (e.target.matches('[data-sv-add]')) { e.preventDefault(); addLift(day); } }
    host.addEventListener('click', onClick);
    host.addEventListener('change', onChange);
    host.addEventListener('input', onInput);
    host.addEventListener('focusin', onFocusIn);
    host.addEventListener('focusout', onFocusOut);
    host.addEventListener('keydown', onKey);
    host.addEventListener('submit', onSubmit);

    return {
      render: render,
      /* the page's menus and deep links speak the grid's language: a row's key and a column, or '+Day' for its add row */
      select: function (key, col) {
        key = String(key || '');
        if (key.charAt(0) === '+') { day = key.slice(1); render(); var n = byF('+' + day + '|name'); if (n) n.focus({ preventScroll: false }); return; }
        var r = rowIx(key); if (r < 0) return;
        day = b().rows[r].day; render();
        var el = byF(key + '|' + (col === 'effort' || col === 'load' || col === 'reps' ? col : 'sets')); if (el && !el.disabled) el.focus();
      },
      sel: function () { return null; },
      focus: function () { if (host.contains(document.activeElement)) return; var el = host.querySelector('.sv-list .sv-in:not([disabled])') || host.querySelector('.sv-tab[aria-selected="true"]'); if (el) el.focus({ preventScroll: true }); },
      flush: function () { clearTimeout(pending); pending = null; var a = document.activeElement; if (a && host.contains(a) && a.matches('[data-sv-field]')) commit(a); },
      day: function () { return day; },
      destroy: function () {
        dead = true; clearTimeout(pending);
        host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); host.removeEventListener('input', onInput);
        host.removeEventListener('focusin', onFocusIn); host.removeEventListener('focusout', onFocusOut); host.removeEventListener('keydown', onKey); host.removeEventListener('submit', onSubmit);
      }
    };
  }
  W.SIMPLE = { grid: grid };
})();
