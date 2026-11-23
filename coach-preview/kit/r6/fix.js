/* fix.js: the one fix sheet and the shared sheets of the coach desk (round 6, spec B; plan.md FIX).
   Loads after desk.js on any page that uses it (with fix.css). Every number and every word a move sends comes from the
   store (PL.items.preview, coach.js through it); this file only shows them, takes the coach's edits and runs the move.

   DESK.fix.open(trigger, { itemId, actId, forId, anchor })   overview-lifters.md §4.3, §9.3; shared.md §6.1
     A move that only opens another place (preview.go) goes there, with &from=<this place> and a stored back target.
     A move that changes nothing the lifter sees and sends no words ("Keep 155") runs at once, with Undo.
     Anything else opens the fix sheet: a popover (DESK.pop, data-layer=popover) grown from the trigger, placed below its
     row (anchor) and ending at its right edge; [data-crop=fix] on the sheet. Top to bottom: the move's label, who and
     when, before → after per change (an input where the coach may adjust a load: ↑ ↓ 2.5 kg, Enter or leaving accepts),
     the choices, "Goes out with week 5, not sent yet." for a change that lands in a week not sent, the words (a tick
     "Tell Marcus" unless the words are the move), a follow-up tick, at most one warning, then Cancel and the main
     button (filled secondary, data-fix-main; never the crimson). ⌘↵ applies, Esc cancels, Tab walks it in reading order.
     Words the coach has not touched re-draft when a number changes; once touched, the store's warning names both
     numbers. Typed words and loads are kept per item and move for the visit.
   A change the store made lighter carries its other number as a quiet "Use 215" beside it (edits on its row), offered
     only when the store's preview honours it; the choices ("Week 3 and after" / "Week 3 only") are a segmented control.
   DESK.fix.apply()  runs the open sheet: PL.items.run(itemId, actId, { text | tell: false, edits, choices, for, remind,
     sendWeek });
     one write, one Undo; closes; one toast at the bottom left in the store's words (quoting what was sent).
   DESK.fix.close(), DESK.fix.isOpen(), DESK.fix.current()
   DESK.bookMeet(id, { meetId })  screens.md §5.5, function-polish F7.5: dialog[data-sheet=book]; PL.meets.book (guarded).
                                  The intake's meet is preselected while the lifter has no booking ("Spring Novice Open,
                                  Fri 9 Apr, USAPL (from her intake)"); the weigh-in follows the federation, its hint the
                                  choice's title; the main button "Add to Hannah's plan"
   DESK.movesHtml(moves, { skip })   function-polish PX1: one inline move style, .moves .mv (quiet text buttons); a move
                                  whose words are the crimson's (skip) is left out (P8)
   DESK.classPop(btn, id)         overview-lifters.md §6.8: the one class popover; PL.lifters.setClass
   DESK.painPop(btn, id, { lift }) screens.md §5.6: the one pain popover; PL.meets.pain or PL.lifters.pain
   DESK.remind(btn, id, { anchor }) screens.md §7.2: dialog[data-sheet=remind], or in place under the row with an anchor
                                  (a popover [data-sheet=remind][data-compose]); PL.billing.remindDraft / remind (guarded)
   Each fires 'desk:fix' on document after a write ({ detail: { kind, itemId, actId, lifterId } }). */
(function () {
  'use strict';
  var DESK = window.DESK, PL = window.PL, K = window.K;
  if (!DESK || !PL || !K) return;
  var esc = DESK.esc || K.esc;
  var fn = function (o, k) { return !!o && typeof o[k] === 'function'; };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var kg = function (v) { return K.n(v); };
  /* a weight class as the store lists it: a number (120) or a plus class with no limit ("120+"), never Number("120+") */
  var isPlus = function (c) { return /\+\s*$/.test(String(c == null ? '' : c)); };
  var clsVal = function (v) { v = String(v == null ? '' : v).trim(); return v === '' ? null : isPlus(v) ? v.replace(/\s+/g, '') : Number(v); };
  var sameCls = function (a, b) { return a != null && b != null && String(a) === String(b); };
  var day = function (iso) { return iso ? K.wd3(iso) + ' ' + K.dm(iso) : ''; };
  var first = function (s) { return String(s || '').split(' ')[0]; };
  var data = function (r) { return r && !r.error ? r.data : null; };
  var CHECK = DESK.ic('check', 2.4);
  var tickHtml = function (on, words, attrs) { return '<button type="button" class="tick" role="checkbox" aria-checked="' + !!on + '"' + (attrs || '') + '><i>' + CHECK + '</i><span>' + esc(words) + '</span></button>'; };
  function emit(detail) { try { document.dispatchEvent(new CustomEvent('desk:fix', { detail: detail })); } catch (e) { /* old browser */ } }
  function lifterOf(id) { return id ? data(PL.lifters.get(id)) : null; }
  var her = function (l) { return l && l.sex === 'M' ? 'his' : l && l.sex === 'F' ? 'her' : 'their'; };

  /* PX1: a row of moves as quiet text buttons (.moves .mv); never a pill, never the crimson's act a second time.
     moves: [{ label, attrs: ' data-x="…"', title }]; o.skip: the crimson's words (P8: the row starts with the second move) */
  DESK.movesHtml = function (moves, o) {
    o = o || {};
    var norm = function (w) { return String(w || '').replace(/[‘’]/g, "'").trim(); }, skip = o.skip ? norm(o.skip) : null;
    var list = (moves || []).filter(function (m) { return m && m.label && (!skip || norm(m.label) !== skip); });
    if (!list.length) return '';
    return '<div class="moves"' + (o.label ? ' role="group" aria-label="' + esc(o.label) + '"' : '') + '>' + list.map(function (m) {
      return '<button type="button" class="mv"' + (m.attrs || '') + (m.title ? ' title="' + esc(m.title) + '"' : '') + (m.disabled ? ' disabled' : '') + '>' + esc(m.label) + '</button>';
    }).join('') + '</div>';
  };

  /* the store's toasts during a run are caught and shown once, in the run's own words (its meta.label names the numbers
     that went, the coach's edits included), with the store's Undo */
  function runQuiet(f) {
    var h = PL.hooks, prev = h ? h.toast : null, got = [], res;
    if (h) h.toast = function (t) { got.push(t); };
    try { res = f(); } finally { if (h) h.toast = prev; }
    return { res: res, toasts: got };
  }
  function toastFor(res, caught, prefix) {
    if (!res || res.error || !res.meta) return;
    var t = caught && caught[0], text = (res.meta.label || (t && t.text) || '').trim();
    if (!text) return;
    var tok = res.meta.undo, undo = (t && t.undo) || (tok ? function () { return PL.undo(tok); } : null);
    DESK.toast((prefix || '') + text, undo);
  }

  /* where a go move lands: the place's page and the hash; DESK.go adds &from=<this place> and keeps the back target and
     this page's scroll (a hash that already names a from keeps its own) */
  function goTo(go) {
    if (!go || !go.place) return false;
    var here = DESK.here || document.body.getAttribute('data-place') || '', h = go.hash || '';
    return DESK.go(go.place, h, here && !/(^|&)from=/.test(h) ? { from: here } : null);
  }

  /* ================= the fix sheet ================= */
  var cur = null, kept = {}, wired = false;
  var keyOf = function (itemId, actId) { return itemId + '|' + actId; };

  /* a load change's line as written, from the program the lifter has ("155 × 3 @8"; back-offs "2 × 5 @7"): the row key is
     day|exercise|occurrence|line, a line being a run of like sets */
  function lineOf(lifterId, week, rowKey) {
    if (!lifterId || !isNum(week) || typeof rowKey !== 'string') return null;
    var k = rowKey.split('|'); if (k.length < 4) return null;
    var g = data(PL.programs.get(lifterId)), w = g && g.weeks ? g.weeks[week - 1] : null; if (!w) return null;
    var d = (w.days || []).filter(function (x) { return x.name === k[0]; })[0]; if (!d) return null;
    var ex = (d.exercises || []).filter(function (e) { return e.title === k[1]; })[Number(k[2] || 1) - 1]; if (!ex) return null;
    var lines = [];
    (ex.sets || []).forEach(function (s) { var p = lines[lines.length - 1]; if (p && p.r === s.r && p.rpe === s.rpe && p.w === s.w) p.n++; else lines.push({ n: 1, r: s.r, rpe: s.rpe, w: s.w }); });
    var x = lines[Number(k[3] || 0)]; if (!x || !isNum(x.r)) return null;
    return { n: x.n, tail: ' × ' + x.r + (x.rpe != null ? ' @' + kg(x.rpe) : '') };
  }
  function valueHtml(c, v) {
    if (v == null || v === '') return '<span class="sr">none</span>';
    if (c.field === 'date') return esc(day(v));
    if (c.field === 'load' && isNum(v)) return esc(kg(v));
    return esc(v);
  }
  function changeHtml(c, i, st) {
    var ln = c.field === 'load' ? lineOf(cur.lifterId, c.week, c.row) : null, one = ln && ln.n === 1, label = c.label || '';
    if (ln && !one) { var p = label.split(', '); label = p.length > 1 ? p.slice(0, -1).join(' ') + ' ' + ln.n + ln.tail + ', ' + p[p.length - 1] : label + ' ' + ln.n + ln.tail; }
    var tail = one ? '<span class="fx-tail">' + esc(ln.tail) + '</span>' : '';
    var before = c.before == null || c.before === '' ? '' : '<span class="fx-b">' + valueHtml(c, c.before) + (one ? esc(ln.tail) : '') + '</span><span class="fx-ar" aria-hidden="true">→</span>';
    var after;
    if (c.edit && c.row) {
      var typed = st.typed[c.row], val = typed != null ? typed : kg(c.after);
      after = '<span class="fx-a"><input class="input fx-in num" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-fx-row="' + esc(c.row) + '" data-fx-i="' + i + '" value="' + esc(val) + '" aria-label="' + esc(c.label + ', new load in kg') + '" title="2.5 kg steps with ↑ ↓">' + tail + '</span>';
    } else if (c.after == null || c.after === '') after = '<span class="fx-a fx-out">Not this week</span>';
    else after = '<span class="fx-a">' + valueHtml(c, c.after) + tail + '</span>';
    return '<div class="fx-r" data-fx-change="' + i + '"><span class="fx-l">' + esc(label) + '</span><span class="fx-v">' + before + after + '</span>' +
      '<span class="fx-use" data-fx-use-slot="' + i + '">' + useHtml(c, i) + '</span>' +
      (c.edit && c.row ? '<p class="fx-err" data-fx-err="' + esc(c.row) + '" hidden></p>' : '') + '</div>';
  }
  /* shared.md §4.1: a line made lighter offers the other number as a quiet button beside it ("Use 215"); once taken, the
     same place offers the number the move wrote ("Use 205"). Offered only when the store's preview honours it (a pure
     read), so the button never claims a load the run would not write. */
  function defaultOf(c) {
    var d = cur && cur.pv0 && (cur.pv0.changes || []).filter(function (x) { return x.row === c.row && x.week === c.week; })[0];
    if (!d) return null;
    return d.load && isNum(d.load.after) ? d.load.after : isNum(d.after) ? d.after : null;
  }
  function loadAfter(c) { return c && c.load && isNum(c.load.after) ? c.load.after : c && isNum(c.after) ? c.after : null; }
  function honours(c, v) {
    var k = c.row + '|' + c.week + '|' + v; if (cur.honour[k] != null) return cur.honour[k];
    var ed = {}; Object.keys(cur.st.edits).forEach(function (x) { ed[x] = cur.st.edits[x]; }); ed[c.row] = v;
    var pv = previewNow({ edits: ed }), m = pv && (pv.changes || []).filter(function (x) { return x.row === c.row && x.week === c.week; })[0];
    return (cur.honour[k] = !!m && loadAfter(m) === v);
  }
  function useOf(c) {
    if (!cur || !c || !c.row || c.field === 'date' || c.field === 'attempts') return null;
    var typed = cur.st.edits[c.row], def = defaultOf(c);
    if (!c.edit && typed != null && isNum(def) && def !== typed) return { value: null, label: 'Use ' + kg(def) };
    if (isNum(c.other) && c.other !== loadAfter(c) && (c.edit || honours(c, c.other))) return { value: c.other, label: c.otherLabel || 'Use ' + kg(c.other) };
    return null;
  }
  function useHtml(c, i) {
    var u = useOf(c); if (!u) return '';
    return '<button type="button" class="btn quiet sm" data-fx-use="' + i + '" title="' + esc(u.label + ' for this line') + '">' + esc(u.label) + '</button>';
  }
  function tellWords(pv) {
    var t = pv.tell; if (!t) return null;
    if (t.required || !pv.silent) return null;   // the words are the move: no tick
    var who = t.to || pv.who || '';
    return t.kind === 'ask' ? 'Ask ' + who : t.kind === 'reply' ? 'Reply to ' + who : 'Tell ' + who;
  }
  /* the label and the buttons name the load the coach typed ("Use 147.5 and tell Marcus") */
  function swapped(s) {
    s = String(s || ''); var sw = cur && cur.swap; if (!sw) return s;
    return s.replace(/\d+(?:\.\d+)?/g, function (m) { return sw[m] != null ? sw[m] : m; });
  }
  function swapOf(pv0, pv) {
    var sw = {}, any = false, by = {}, ws = {}, anyW = false, typedRow = {};
    (pv0.changes || []).forEach(function (c) { by[c.key + '|' + c.week] = c; });
    /* a row the coach typed a load into (its input line): the store re-drafts the words for it, and the same row's later
       weeks (week 4's 147.5 → 150 under a typed week 3) are the store's follow-on, never a number to swap into the words
       (walk 2, Marcus: typing 147.5 swapped the draft's "147.5 × 3" to "150 × 3") */
    (pv.changes || []).forEach(function (c) { if (c.edit && c.row) typedRow[c.row] = true; });
    (pv.changes || []).forEach(function (c) {
      var d = by[c.key + '|' + c.week]; if (!d) return;
      if (c.edit && isNum(d.after) && isNum(c.after) && d.after !== c.after && sw[kg(d.after)] == null) { sw[kg(d.after)] = kg(c.after); any = true; }
      /* a line moved to its other number ("Use 215"): the label, the button and the untouched words follow it */
      var a0 = loadAfter(d), a1 = loadAfter(c);
      if (!c.edit && c.row && !typedRow[c.row] && cur && cur.st.edits[c.row] != null && isNum(a0) && isNum(a1) && a0 !== a1 && sw[kg(a0)] == null) { sw[kg(a0)] = kg(a1); ws[kg(a0)] = kg(a1); any = anyW = true; }
    });
    if (cur) cur.wswap = anyW ? ws : null;
    return any ? sw : null;
  }
  /* the store re-drafts the words for a typed load; for an other number the sheet swaps it in the untouched draft */
  function draftWords(pv) {
    var t = pv && pv.tell ? pv.tell.text || '' : '', ws = cur && cur.wswap; if (!ws) return t;
    return String(t).replace(/\d+(?:\.\d+)?/g, function (m) { return ws[m] != null ? ws[m] : m; });
  }
  function mainWords() {
    var pv = cur.pv, on = cur.st.tell;
    return swapped(on || !pv.silent ? pv.button : pv.silent);
  }
  function whoLine(pv) {
    var l = lifterOf(pv.lifterId), name = l ? l.name : pv.who || '', out = name;
    if (pv.week && pv.lifterId && fn(PL.programs, 'dates')) {
      var dd = data(PL.programs.dates(pv.lifterId, pv.week)), from = dd && dd.from;
      out += (out ? ', ' : '') + 'week ' + pv.week + (from ? ' from ' + day(from) : '');
    }
    return out;
  }
  function sheetHtml() {
    var pv = cur.pv, st = cur.st, tw = tellWords(pv), h = '';
    h += '<div class="fx" data-crop="fix" data-fx-item="' + esc(pv.itemId) + '" data-fx-act="' + esc(pv.actId) + '">';
    h += '<h3 class="fx-t" id="fx-t">' + esc(swapped(cur.label)) + '</h3>';
    var who = whoLine(pv); if (who) h += '<p class="fx-who">' + esc(who) + '</p>';
    h += '<div class="fx-body">';
    if (pv.changes && pv.changes.length) h += '<div class="fx-ch" role="group" aria-label="What changes">' + pv.changes.map(function (c, i) { return changeHtml(c, i, st); }).join('') + '</div>';
    (pv.choices || []).forEach(function (ch) {
      var v = st.choices[ch.key] != null ? st.choices[ch.key] : ch.value;
      h += '<div class="fx-choice"><div class="seg" role="group" aria-label="' + esc(ch.label || ch.key) + '" data-fx-choice="' + esc(ch.key) + '">' + (ch.options || []).map(function (o) {
        return '<button type="button" data-value="' + esc(o.value) + '" aria-pressed="' + (String(o.value) === String(v)) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div></div>';
    });
    if (pv.ride && pv.ride.lands === 'draft') {
      h += '<p class="fx-note">Goes out with week ' + esc(pv.ride.week) + ', not sent yet.</p>';
      if (fn(PL.programs, 'send') && pv.lifterId) h += '<div class="fx-ticks">' + tickHtml(st.sendWeek, 'Send week ' + pv.ride.week + ' to ' + (pv.who || '') + ' now too', ' data-fx-tick="send"') + '</div>';
    }
    if (pv.tell) {
      h += '<div class="fx-tell">';
      if (tw) h += tickHtml(st.tell, tw, ' data-fx-tick="tell"');
      h += '<textarea class="input fx-msg" data-fx-msg rows="3" aria-label="' + esc('Message to ' + (pv.tell.to || pv.who || 'the lifter')) + '"' + (tw && !st.tell ? ' hidden' : '') + '>' + esc(st.text != null ? st.text : draftWords(pv)) + '</textarea>';
      h += '<p class="fx-err" data-fx-err="text" hidden></p></div>';
    }
    if (pv.remind) h += '<div class="fx-ticks">' + tickHtml(st.remind, pv.remind.text, ' data-fx-tick="remind"') + '</div>';
    h += '<p class="fx-warn" data-fx-warn role="status"' + (pv.warn ? '' : ' hidden') + '>' + esc(pv.warn || '') + '</p></div>';
    h += '<div class="fx-acts"><button type="button" class="btn quiet" data-fx-cancel>Cancel</button><button type="button" class="btn" data-fix-main title="' + esc(mainWords() + ' (⌘↵)') + '">' + esc(mainWords()) + '</button></div>';
    return h + '</div>';
  }
  function previewNow(o) {
    var st = cur.st, edits = {}, any = false, src = o && o.edits ? o.edits : st.edits;
    Object.keys(src).forEach(function (k) { edits[k] = src[k]; any = true; });
    var arg = { };
    if (cur.forId) arg.for = cur.forId;
    if (any) arg.edits = edits;
    if (Object.keys(st.choices).length) arg.choices = st.choices;
    if (st.touched && st.text != null) arg.text = st.text;
    var r = PL.items.preview(cur.itemId, cur.actId, arg);
    return r && !r.error ? r.data : null;
  }
  function root() { var p = DESK.pop.el(); return p ? $('.fx[data-crop=fix]', p) : null; }
  /* a number changed or the words were touched: ask the store again and show what it says, in place */
  function refresh() {
    var pv = previewNow(); if (!pv || !cur) return;
    var box = root(); if (!box) return;
    cur.swap = swapOf(cur.pv0, pv);
    var rows = $$('[data-fx-change]', box);
    if (rows.length !== (pv.changes || []).length) { cur.pv = pv; var ch = $('.fx-ch', box); if (ch) ch.innerHTML = pv.changes.map(function (c, i) { return changeHtml(c, i, cur.st); }).join(''); }
    else {
      (pv.changes || []).forEach(function (c, i) {
        var row = rows[i], inp = $('input[data-fx-row]', row);
        if (inp) return;   // the coach's own field keeps its value and caret
        var b = $('.fx-b', row), a = $('.fx-a', row), ln = c.field === 'load' ? lineOf(cur.lifterId, c.week, c.row) : null, one = ln && ln.n === 1;
        if (b) b.innerHTML = valueHtml(c, c.before) + (one ? esc(ln.tail) : '');
        if (a && !a.classList.contains('fx-out')) a.innerHTML = valueHtml(c, c.after) + (one ? '<span class="fx-tail">' + esc(ln.tail) + '</span>' : '');
      });
    }
    cur.pv = pv;
    /* the other-number button follows the line: its words change in place, so a focused button keeps the focus */
    (pv.changes || []).forEach(function (c, i) {
      var slot = $('[data-fx-use-slot="' + i + '"]', box); if (!slot) return;
      var u = useOf(c), btn = $('[data-fx-use]', slot);
      if (u && btn) { btn.textContent = u.label; btn.title = u.label + ' for this line'; }
      else slot.innerHTML = useHtml(c, i);
    });
    var ta = $('[data-fx-msg]', box);
    if (ta && pv.tell && !cur.st.touched) { ta.value = draftWords(pv); cur.st.draft = ta.value; }
    var w = $('[data-fx-warn]', box); if (w) { w.textContent = pv.warn || ''; w.hidden = !pv.warn; }
    var t = $('#fx-t', box); if (t) t.textContent = swapped(cur.label);
    var m = $('[data-fix-main]', box); if (m) { m.textContent = mainWords(); m.title = mainWords() + ' (⌘↵)'; }
  }
  /* a load the store takes: a number in the change's range, in its steps */
  function loadOk(v, ed) {
    var x = Number(String(v).replace(',', '.').trim());
    if (String(v).trim() === '' || !isFinite(x)) return null;
    var step = (ed && ed.step) || 2.5, lo = ed && isNum(ed.min) ? ed.min : 20, hi = ed && isNum(ed.max) ? ed.max : 600;
    if (x < lo || x > hi || Math.abs(x / step - Math.round(x / step)) > 1e-9) return null;
    return x;
  }
  function changeAt(inp) { return cur && cur.pv.changes[Number(inp.getAttribute('data-fx-i'))]; }
  function setErr(key, text) { var box = root(), e = box && $('[data-fx-err="' + key + '"]', box); if (!e) return; e.textContent = text || ''; e.hidden = !text; }
  function takeLoad(inp, show) {
    var c = changeAt(inp); if (!c) return true;
    var row = inp.getAttribute('data-fx-row'), x = loadOk(inp.value, c.edit);
    cur.st.typed[row] = inp.value;
    if (x == null) {
      if (show) { inp.classList.add('is-error'); setErr(row, 'Write a load like ' + kg(c.edit ? c.edit.value : c.after) + ', in ' + kg((c.edit && c.edit.step) || 2.5) + ' kg steps from ' + kg((c.edit && c.edit.min) || 20) + ' to ' + kg((c.edit && c.edit.max) || 600) + '.'); }
      return false;
    }
    inp.classList.remove('is-error'); setErr(row, '');
    var def = cur.pv0.changes.filter(function (d) { return d.row === row && d.week === c.week; })[0];
    if (def && def.after === x) delete cur.st.edits[row]; else cur.st.edits[row] = x;
    refresh();
    return true;
  }

  /* "Use 215": the line takes its other number (an edit on its row, one write with the move); "Use 205" takes it back */
  function useOther(b) {
    var c = cur.pv.changes[Number(b.getAttribute('data-fx-use'))], u = useOf(c); if (!c || !u) return;
    if (c.edit) { var inp = $('input[data-fx-row="' + c.row + '"]', root()); if (inp) { inp.value = kg(u.value); takeLoad(inp, true); } return; }
    if (u.value == null) delete cur.st.edits[c.row]; else cur.st.edits[c.row] = u.value;
    refresh();
  }
  function wire() {
    if (wired) return; var p = DESK.pop.el(); if (!p) return; wired = true;
    /* these serve every opening of the one popover, so they go through DESK.pop.on (a listener added to el() lasts one opening) */
    var on = function (type, fn, opt) { if (!(DESK.pop.on && DESK.pop.on(type, fn, opt))) p.addEventListener(type, fn, opt); };
    /* the sheet leaves with its popover (Esc, a click outside, another popover): the typed words stay for the visit */
    on('beforetoggle', function (e) { if (e.newState === 'closed') { p.style.maxHeight = ''; p.style.bottom = ''; if (cur) { cur = null; p.classList.remove('is-fx', 'fx-up'); } } });
    on('click', function (e) {
      if (!cur || !root()) return;
      var b = e.target.closest('button'); if (!b || !p.contains(b)) return;
      /* the sheet can open over its own trigger: the second click of a double click there is not a choice in the sheet */
      if (e.detail > 1 && Date.now() - (cur.at || 0) < 500) return;
      if (b.hasAttribute('data-fix-main')) { apply(); return; }
      if (b.hasAttribute('data-fx-cancel')) { close(true); return; }
      if (b.hasAttribute('data-fx-use')) { useOther(b); return; }
      var tk = b.getAttribute('data-fx-tick');
      if (tk) {
        var on = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(on));
        if (tk === 'tell') { cur.st.tell = on; var ta = $('[data-fx-msg]', root()); if (ta) ta.hidden = !on; setErr('text', ''); var m = $('[data-fix-main]', root()); if (m) { m.textContent = mainWords(); m.title = mainWords() + ' (⌘↵)'; } }
        else if (tk === 'remind') cur.st.remind = on;
        else if (tk === 'send') cur.st.sendWeek = on;
        return;
      }
      var seg = b.closest('[data-fx-choice]');
      if (seg) { $$('button', seg).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); cur.st.choices[seg.getAttribute('data-fx-choice')] = b.getAttribute('data-value'); refresh(); }
    });
    on('input', function (e) {
      if (!cur) return;
      var t = e.target;
      if (t.matches('input[data-fx-row]')) { var c = changeAt(t), x = loadOk(t.value, c && c.edit); cur.st.typed[t.getAttribute('data-fx-row')] = t.value; if (x != null) takeLoad(t, false); return; }
      if (t.matches('[data-fx-msg]')) { cur.st.text = t.value; cur.st.touched = t.value !== cur.st.draft; setErr('text', ''); if (Object.keys(cur.st.edits).length) refresh(); }
    });
    on('focusout', function (e) { if (cur && e.target.matches && e.target.matches('input[data-fx-row]')) takeLoad(e.target, true); });
    on('keydown', function (e) {
      if (!cur || !root()) return;
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); var a = document.activeElement; if (a && a.matches && a.matches('input[data-fx-row]') && !takeLoad(a, true)) return; apply(); return; }
      var t = e.target;
      if (t.matches && t.matches('input[data-fx-row]')) {
        if (e.key === 'Enter') { e.preventDefault(); takeLoad(t, true); return; }
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.metaKey) {
          e.preventDefault();
          var c = changeAt(t), ed = (c && c.edit) || {}, step = ed.step || 2.5, x = loadOk(t.value, ed);
          if (x == null) x = isNum(c && c.after) ? c.after : 0;
          x = Math.max(isNum(ed.min) ? ed.min : 20, Math.min(isNum(ed.max) ? ed.max : 600, x + (e.key === 'ArrowUp' ? step : -step)));
          t.value = kg(x); takeLoad(t, true); t.select(); return;
        }
      }
    });
  }

  function open(trigger, o) {
    o = o || {};
    if (!trigger || !fn(PL.items, 'preview') || !fn(PL.items, 'run')) return false;
    var it = data(PL.items.get(o.itemId)); if (!it) { DESK.toast('That move is not on this desk any more.'); return false; }
    var act = (it.acts || []).filter(function (a) { return a.id === o.actId; })[0]; if (!act) return false;
    var actId = act.id, focusInput = false;
    /* "Other load" (an act that stays open): the item's load move with the load in hand */
    if (act.keep && !act.reply && !(act.ops && act.ops.length) && !act.go) {
      var main = (it.acts || []).filter(function (a) { return a.ops && a.ops.some(function (x) { return x.op === 'load'; }); })[0];
      if (main) { actId = main.id; focusInput = true; act = main; }
    }
    var arg = o.forId ? { for: o.forId } : {}, r = PL.items.preview(o.itemId, actId, arg);
    if (!r || r.error) { DESK.toast((r && r.error && r.error.message) || 'That move cannot run now.'); return false; }
    var pv = r.data;
    if (pv.go) return goTo(pv.go);
    /* nothing the lifter sees changes and no words go: one click, with Undo */
    if (!pv.tell && !(pv.changes && pv.changes.length) && !(act.ops && act.ops.length)) {
      var q = runQuiet(function () { return PL.items.run(o.itemId, actId, arg); });
      if (q.res && q.res.error) { DESK.toast(q.res.error.message); return false; }
      toastFor(q.res, q.toasts); emit({ kind: 'item', itemId: o.itemId, actId: actId, lifterId: pv.lifterId });
      return true;
    }
    /* a sheet already open leaves first: its close clears the sheet in hand, so it must not clear this one */
    if (DESK.pop.isOpen()) DESK.pop.close();
    var k = keyOf(o.itemId, actId), st = kept[k] || (kept[k] = { text: null, touched: false, draft: null, edits: {}, typed: {}, choices: {}, tell: true, remind: !!(pv.remind && pv.remind.ticked), sendWeek: false });
    cur = { itemId: o.itemId, actId: actId, forId: o.forId || null, lifterId: pv.lifterId, label: act.label || pv.button, trigger: trigger, pv0: pv, pv: pv, st: st, swap: null, wswap: null, honour: {} };
    if (Object.keys(st.edits).length || st.touched || Object.keys(st.choices).length) { var pv1 = previewNow(); if (pv1) { cur.pv = pv1; cur.swap = swapOf(pv, pv1); } }
    st.draft = cur.pv.tell ? (st.touched ? (cur.pv0.tell && cur.pv0.tell.text) : cur.pv.tell.text) : null;
    var el = DESK.pop.open(trigger, sheetHtml(), { label: swapped(cur.label), layer: 'popover', anchor: o.anchor || trigger.closest('[data-row]') || trigger, place: 'below-end', hold: true });
    el.classList.add('is-fx'); el.setAttribute('aria-labelledby', 'fx-t');
    wire();
    place(el, trigger, o.anchor || trigger.closest('[data-row]') || trigger);
    cur.at = Date.now();
    /* focus: the main button; the load when the move asks for one; the words when they are the move and still empty */
    var box = root(), ta = box && $('[data-fx-msg]', box), focusEl = null;
    if (focusInput) focusEl = box && $('input[data-fx-row]', box);
    else if (ta && !ta.hidden && cur.pv.tell && cur.pv.tell.required && !ta.value.trim()) focusEl = ta;
    if (!focusEl) focusEl = box && $('[data-fix-main]', box);
    if (focusEl) { focusEl.focus({ preventScroll: true }); if (focusEl.select && focusEl.tagName === 'INPUT') focusEl.select(); }
    return true;
  }
  /* where the sheet sits (Fitts, 23 Nov): its main button lands right beside the button that opened it, in the same place
     every time, so a coach clearing a list goes click, click, next row. The target is the main button's own spot: just
     under the row (anchor), centred under the trigger. The sheet hangs down from there with its buttons on top
     (the row stays clear); when that would run off the window it grows up from the same spot, buttons at its foot, over
     the trailing part of the row (the name and the problem stay in view). Only near the window's foot does the same spot
     move just above the row (buttons at the foot, nothing covered; else buttons on top, hanging over the row). When none
     of these fit whole, the whole sheet still wins over keeping the row clear (22 Nov): it sits as low as it can. Every
     placement is whole and in the window; the side the buttons are on follows the DOM, so Tab still reads top to bottom.
     The edge the buttons are on is the one held in place, so a line appearing or hiding never moves the main button. */
  function acts(el, top) {
    var box = $('.fx[data-crop=fix]', el), a = box && $('.fx-acts', box); if (!a) return;
    if (top) { if (box.firstChild !== a) box.insertBefore(a, box.firstChild); }
    else if (box.lastChild !== a) box.appendChild(a);
    el.classList.toggle('fx-up', !!top);
  }
  function place(el, trigger, anchor) {
    var st = el.style; st.maxHeight = ''; st.bottom = '';
    var T = trigger.getBoundingClientRect(), A = anchor && anchor.isConnected ? anchor.getBoundingClientRect() : T;
    var root = document.documentElement, W = root.clientWidth, H = innerHeight, m = 12, gap = 8;
    /* the row's own padding is not its content: the sheet may sit on it (a row's 12 px), never on its words */
    if (A !== T) { var acs = getComputedStyle(anchor), pb = parseFloat(acs.paddingBottom) || 0, pt = parseFloat(acs.paddingTop) || 0;
      A = { top: A.top + Math.min(pt, Math.max(0, T.top - A.top)), bottom: A.bottom - Math.min(pb, Math.max(0, A.bottom - T.bottom)) };
      if (pb >= 8 || pt >= 8) gap = 4; }
    var edge = (parseFloat(getComputedStyle(root).getPropertyValue('--edge-h')) || 56) + gap;
    var measure = function (top) {
      acts(el, top);
      /* layout sizes, not boxes: the sheet is mid-grow (scaled) while it is placed */
      var mb = $('[data-fix-main]', el), w = el.offsetWidth, h = el.offsetHeight, bx = 0, by = 0, n = mb;
      while (n && n !== el) { bx += n.offsetLeft; by += n.offsetTop; n = n.offsetParent; }
      if (!mb || n !== el) return { h: h, w: w, mh: 0, mw: 0, endOff: 20, topOff: 20, botOff: 20 };
      return { h: h, w: w, mh: mb.offsetHeight, mw: mb.offsetWidth, endOff: w - bx - mb.offsetWidth, topOff: by, botOff: h - by - mb.offsetHeight };
    };
    var up = measure(true), dn = measure(false), h = Math.max(up.h, dn.h), w = up.w;
    /* across: the main button centred under the trigger, kept in the window, clear of the sidebar and an inspector */
    var lo = m, hi = W - m, sw = parseFloat(getComputedStyle(root).getPropertyValue('--sidebar-w')) || 68;
    if ($('.side') && !trigger.closest('.side') && T.left >= sw) lo = Math.max(lo, sw + gap);
    if (DESK.insp && DESK.insp.isOpen && DESK.insp.isOpen()) { var ir = DESK.insp.el().getBoundingClientRect(); if (T.right <= ir.left) hi = Math.min(hi, ir.left - gap); }
    var x = Math.max(lo, Math.min(hi - w, T.left + T.width / 2 + up.mw / 2 + up.endOff - w));
    /* down: the main button's middle under the row; up: its middle above the row */
    var yDn = A.bottom + gap + up.topOff + up.mh / 2, yUp = A.top - gap - dn.botOff - dn.mh / 2, top = null, bottom = null, mode = null;
    var fits = function (t) { return t >= edge && t + h <= H - m; };
    if (fits(A.bottom + gap)) { mode = 'hang'; top = A.bottom + gap; }                                           // below, buttons on top
    else if (fits(yDn + dn.mh / 2 + dn.botOff - h)) { mode = 'rise'; bottom = yDn + dn.mh / 2 + dn.botOff; }      // the same spot, growing up
    else if (fits(A.top - gap - h)) { mode = 'rise'; bottom = A.top - gap; }                                    // above, buttons at the foot
    else if (fits(yUp - up.mh / 2 - up.topOff)) { mode = 'hang'; top = yUp - up.mh / 2 - up.topOff; }           // the same spot, hanging down
    else { mode = 'rise'; bottom = H - m; if (h > H - m - edge) { st.maxHeight = Math.floor(H - m - edge) + 'px'; } } // as low as it can, whole when it can be
    acts(el, mode === 'hang');
    st.left = Math.round(x) + 'px';
    if (mode === 'hang') { st.top = Math.round(top) + 'px'; st.maxHeight = Math.floor(H - m - top) + 'px'; }
    else { st.top = 'auto'; st.bottom = Math.round(H - bottom) + 'px'; if (!st.maxHeight) st.maxHeight = Math.floor(bottom - edge) + 'px'; }
    var eh = el.offsetHeight, et = mode === 'hang' ? top : bottom - eh;
    st.setProperty('--ox', Math.round(T.left + T.width / 2 - x) + 'px');
    st.setProperty('--oy', Math.round(Math.max(0, Math.min(eh, T.top + T.height / 2 - et))) + 'px');
  }
  function close(back) {
    var c = cur; if (!c) return;
    DESK.pop.close();
    if (back && c.trigger && c.trigger.isConnected) c.trigger.focus({ preventScroll: true });
  }
  function apply() {
    var c = cur; if (!c) return false;
    var box = root(), pv = c.pv, st = c.st;
    /* a load that is not a load stops it, with the error beside its field */
    var bad = box ? $$('input[data-fx-row]', box).filter(function (i) { return !takeLoad(i, true); })[0] : null;
    if (bad) { bad.focus(); return false; }
    pv = c.pv;
    var opts = {}, ta = box && $('[data-fx-msg]', box), words = ta ? ta.value : '';
    if (c.forId) opts.for = c.forId;
    if (Object.keys(st.edits).length) opts.edits = JSON.parse(JSON.stringify(st.edits));
    if (Object.keys(st.choices).length) opts.choices = JSON.parse(JSON.stringify(st.choices));
    if (pv.tell) {
      var ticked = !tellWords(pv) || st.tell;
      if (ticked) {
        if (!words.trim()) { setErr('text', tellWords(pv) ? 'Write the message first, or untick it.' : 'Write the message first.'); if (ta) ta.focus(); return false; }
        opts.text = words;
      } else opts.tell = false;
    }
    if (st.remind && pv.remind) opts.remind = { on: pv.remind.on, text: pv.remind.text };
    /* "Send week 5 to Mei now too": the move and the send are one write with one Undo (shared.md §6.1 sendWeek) */
    if (st.sendWeek && pv.ride && pv.ride.lands === 'draft') opts.sendWeek = true;
    var q = runQuiet(function () { return PL.items.run(c.itemId, c.actId, opts); }), res = q.res;
    if (!res || res.error) {
      var w = box && $('[data-fx-warn]', box), msg = (res && res.error && res.error.message) || 'That did not go through.';
      if (w) { w.textContent = msg; w.hidden = false; }
      return false;
    }
    delete kept[keyOf(c.itemId, c.actId)];
    DESK.pop.close();
    toastFor(res, q.toasts);
    emit({ kind: 'item', itemId: c.itemId, actId: c.actId, lifterId: pv.lifterId });
    return true;
  }

  DESK.fix = {
    open: open,
    apply: apply,
    close: function () { close(false); },
    isOpen: function () { return !!cur && DESK.pop.isOpen() && !!root(); },
    current: function () { return cur ? { itemId: cur.itemId, actId: cur.actId, forId: cur.forId, lifterId: cur.lifterId } : null; }
  };

  /* ================= the shared sheets ================= */
  /* sheets: one modal <dialog> per kind (data-sheet), the raised solid of ui.css's dialog.sheet; the backdrop or
     [data-close] closes it, and so does Esc (the dialog's own) */
  var sheets = {};
  function sheet(name, label, html) {
    if (DESK.pop.isOpen()) DESK.pop.close();
    if (DESK.sheet && DESK.sheet.isOpen()) DESK.sheet.close();
    Object.keys(sheets).forEach(function (k) { if (k !== name && sheets[k].open) sheets[k].close(); });
    var d = sheets[name];
    if (!d) {
      d = sheets[name] = document.createElement('dialog');
      d.className = 'sheet fx-sheet'; d.setAttribute('data-layer', 'sheet'); d.setAttribute('role', 'dialog'); d.setAttribute('data-sheet', name);
      document.body.appendChild(d);
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    }
    d.setAttribute('aria-label', label);
    d.innerHTML = html;
    if (!d.open) d.showModal();
    return d;
  }
  /* a popover that grew after it was placed (a field or a line appeared) stays whole in the window */
  function keepIn(el) {
    if (!el || !el.isConnected) return;
    var r = el.getBoundingClientRect(), m = 12, edge = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge-h')) || 56) + 8;
    if (r.bottom > innerHeight - m) el.style.top = Math.round(Math.max(edge, innerHeight - m - r.height)) + 'px';
  }
  function sheetErr(d, text) { var e = $('[data-fx-err=sheet]', d); if (e) { e.textContent = text || ''; e.hidden = !text; } }

  /* the classes around the bodyweight, each with what it means ("120 kg: 5.1 kg of room") */
  function classRows(id) {
    var c = data(PL.lifters.classes(id)); if (!c) return null;
    var now = c.now, pick = c.current != null ? c.current : c.suggest;
    /* a plus class ("120+") has no limit: its line reads "in the 120+s", never a sum with NaN in it (walk 2, Kofi) */
    var words = function (cls) { if (now == null || isPlus(cls)) return ''; var d = Math.round((Number(cls) - now) * 10) / 10; return d >= 0 ? kg(d) + ' kg of room' : kg(-d) + ' kg over'; };
    var around = function (list) {
      if (now == null) return list;
      var i = 0; while (i < list.length - 1 && now > list[i].cls) i++;
      return list.slice(Math.max(0, i - 1), Math.min(list.length, i + 2));
    };
    var F = [47, 52, 57, 63, 69, 76, 84];
    var groups = c.sex ? [{ head: null, list: around(c.list) }] : [
      { head: 'Women', list: around(c.list.filter(function (x) { return F.indexOf(x.cls) >= 0; })) },
      { head: 'Men', list: around(c.list.filter(function (x) { return F.indexOf(x.cls) < 0; })) }];
    return { now: now, current: c.current, pick: pick, groups: groups, words: words };
  }
  /* "114.9 kg: the 120 kg class, 5.1 kg of room"; a plus class "120.4 kg: in the 120+ kg class" (plain words, never "the 120s") */
  function clsLine(cr, cls) { var w = cr.words(cls); return kg(cr.now) + ' kg: ' + (isPlus(cls) ? 'in the ' + cls + ' kg class' : 'the ' + cls + ' kg class' + (w ? ', ' + w : '')); }
  function bwWhen(id) {
    var l = lifterOf(id), s = l && l.bw && l.bw.series, last = s && s.length ? s[s.length - 1].d : null;
    return !last || last === K.today ? 'this morning' : K.daysTo(last) === -1 ? 'yesterday' : 'on ' + day(last);
  }

  DESK.classPop = function (btn, id) {
    var cr = classRows(id), l = lifterOf(id); if (!cr || !l) return false;
    var h = '<div class="fx fx-class" data-crop="class">';
    h += '<h3 class="fx-t">Weight class</h3>';
    var nb = fn(PL.lifters, 'numbers') ? data(PL.lifters.numbers(id)) : null, ser = l.bw && l.bw.series;
    if (nb && nb.bw && nb.bw.text && !(ser && ser.length)) h += '<p class="fx-who">' + esc(nb.bw.text) + '</p>';
    else if (cr.now != null) h += '<p class="fx-who">' + esc(kg(cr.now) + ' kg ' + bwWhen(id)) + '</p>';
    cr.groups.forEach(function (g) {
      h += '<div class="fx-opts" role="radiogroup" aria-label="' + esc(g.head || 'Weight class') + '">' + (g.head ? '<p class="fx-h">' + esc(g.head) + '</p>' : '');
      g.list.forEach(function (x) {
        var w = cr.words(x.cls);
        h += '<label class="fx-opt"><input type="radio" name="fx-cls" value="' + esc(x.cls) + '"' + (sameCls(x.cls, cr.pick) ? ' checked' : '') + '><span class="fx-ol">' + esc(x.cls + ' kg') + '</span>' + (w ? '<span class="fx-od">' + esc(w) + '</span>' : '') + '</label>';
      });
      h += '</div>';
    });
    h += '<p class="fx-err" data-fx-err="sheet" hidden></p>';
    h += '<div class="fx-acts"><button type="button" class="btn quiet" data-fx-x>Cancel</button><button type="button" class="btn" data-fix-main>Save</button></div></div>';
    var el = DESK.pop.open(btn, h, { label: 'Weight class', layer: 'popover', anchor: btn, hold: true });
    var box = $('.fx-class', el), on = $('input[name=fx-cls]:checked', box) || $('input[name=fx-cls]', box);
    if (on) on.focus({ preventScroll: true });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-fx-x')) { DESK.pop.close(); btn.focus({ preventScroll: true }); return; }
      if (!b.hasAttribute('data-fix-main')) return;
      var pick = $('input[name=fx-cls]:checked', box); if (!pick) { sheetErr(box, 'Pick a class.'); return; }
      var cls = clsVal(pick.value);
      if (sameCls(cr.current, cls)) { DESK.pop.close(); return; }   // the class it already is: nothing to save, nothing said
      var q = runQuiet(function () { return PL.lifters.setClass(id, cls); }), res = q.res;
      if (!res || res.error) { sheetErr(box, (res && res.error && res.error.message) || 'That class did not save.'); return; }
      DESK.pop.close();
      var w = cr.words(cls), lab = res.meta && res.meta.label ? res.meta.label.replace(/\.$/, '') + (w ? ': ' + w : '') + '.' : '';
      if (lab) DESK.toast(lab, res.meta.undo ? function () { return PL.undo(res.meta.undo); } : null);
      emit({ kind: 'class', lifterId: id });
    });
    box.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || e.target.matches('input[type=radio]'))) { e.preventDefault(); $('[data-fix-main]', box).click(); } });
    return true;
  };

  /* ---------------- the pain popover ---------------- */
  var PARTS = ['Low back', 'Hip', 'Knee', 'Shoulder', 'Elbow', 'Wrist', 'Other'], SIDED = ['Hip', 'Knee', 'Shoulder', 'Elbow', 'Wrist'];
  var LIFTS = [['squat', 'Squat'], ['bench', 'Bench'], ['deadlift', 'Deadlift'], ['all', 'All']];
  /* the side the lifter's own words give that part ("Left knee tight on squats"), so one click on Knee reads "Left knee" */
  function sideOf(id, part) {
    if (SIDED.indexOf(part) < 0) return null;
    var hay = ''; try { hay = JSON.stringify(PL.lifters.get(id).data) + ' ' + JSON.stringify((data(PL.roster.needs()) || []).filter(function (r) { return r.id === id; })); } catch (e) { hay = ''; }
    var m = new RegExp('\\b(left|right)\\s+' + part.toLowerCase() + '\\b', 'i').exec(hay);
    return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase() : null;
  }
  /* Safe's attempts for one lift, when the store can say them without writing (a pure read) */
  function safeOf(id) {
    if (fn(PL.meets, 'safe')) { var s = data(PL.meets.safe(id)); if (s) return s; }
    var p = fn(PL.meets, 'plan') ? data(PL.meets.plan(id)) : null;
    return p && p.safe ? p.safe : null;
  }
  DESK.painPop = function (btn, id, o) {
    o = o || {};
    var l = lifterOf(id); if (!l) return false;
    var plan = l.meet && fn(PL.meets, 'plan') ? data(PL.meets.plan(id)) : null, safe = plan && fn(PL.meets, 'pain') ? safeOf(id) : null;
    var st = { part: null, side: null, other: '', score: null, lift: o.lift || null, ease: true };
    var h = '<div class="fx fx-pain" data-crop="pain">';
    h += '<h3 class="fx-t">Record pain</h3><p class="fx-who">' + esc(l.name) + '</p>';
    h += '<div class="fx-hrow"><p class="fx-h" id="fx-p-where">Where</p><div class="seg fx-side is-off" role="group" aria-label="Side" data-fx-g="side" data-fx-side><button type="button" data-value="Left" aria-pressed="false">Left</button><button type="button" data-value="Right" aria-pressed="false">Right</button></div></div>';
    h += '<div class="fx-chips" role="group" aria-labelledby="fx-p-where" data-fx-g="part">' + PARTS.map(function (p) { return '<button type="button" class="fx-chip" data-value="' + esc(p) + '" aria-pressed="false">' + esc(p) + '</button>'; }).join('') + '</div>';
    h += '<input class="input fx-other" type="text" data-fx-other placeholder="Where, in a few words" aria-label="Where it hurts" hidden>';
    h += '<p class="fx-h" id="fx-p-bad">How bad, 0 to 10</p><div class="fx-chips fx-score" role="group" aria-labelledby="fx-p-bad" data-fx-g="score">' + [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) { return '<button type="button" class="fx-chip num" data-value="' + n + '" aria-pressed="false">' + n + '</button>'; }).join('') + '</div>';
    h += '<p class="fx-h" id="fx-p-lift">Which lift</p><div class="fx-chips" role="group" aria-labelledby="fx-p-lift" data-fx-g="lift">' + LIFTS.map(function (x) { return '<button type="button" class="fx-chip" data-value="' + x[0] + '" aria-pressed="' + (st.lift === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (safe) h += '<div class="fx-ticks" data-fx-ease hidden>' + tickHtml(true, 'Ease that lift’s attempts', ' data-fx-tick="ease"') + '<p class="fx-note num" data-fx-ease-line></p></div>';
    h += '<p class="fx-err" data-fx-err="sheet" hidden></p>';
    h += '<div class="fx-acts"><button type="button" class="btn quiet" data-fx-x>Cancel</button><button type="button" class="btn" data-fix-main>Save</button></div></div>';
    var el = DESK.pop.open(btn, h, { label: 'Record pain', layer: 'popover', anchor: btn, hold: true });
    var box = $('.fx-pain', el);
    function paint() {
      $$('[data-fx-g]', box).forEach(function (g) { var k = g.getAttribute('data-fx-g'); $$('button', g).forEach(function (b) { b.setAttribute('aria-pressed', String(String(st[k]) === b.getAttribute('data-value'))); }); });
      $('[data-fx-side]', box).classList.toggle('is-off', SIDED.indexOf(st.part) < 0);
      $('[data-fx-other]', box).hidden = st.part !== 'Other';
      var ez = $('[data-fx-ease]', box);
      if (ez) {
        var lk = st.lift && st.lift !== 'all' ? st.lift : null, a = lk && plan && plan.attempts ? plan.attempts[lk] : null, b = lk ? safe[lk] : null;
        var diff = a && b && a.some(function (x, i) { return x !== b[i]; });
        ez.hidden = !diff;
        if (diff) $('[data-fx-ease-line]', ez).textContent = LIFTS.filter(function (x) { return x[0] === lk; })[0][1] + ': ' + a.map(function (x, i) { return kg(x) + ' → ' + kg(b[i]); }).join(', ');
      }
      keepIn(el);
    }
    var first0 = $('.fx-chip', box); if (first0) first0.focus({ preventScroll: true });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-fx-x')) { DESK.pop.close(); btn.focus({ preventScroll: true }); return; }
      var tk = b.getAttribute('data-fx-tick');
      if (tk === 'ease') { st.ease = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', String(st.ease)); return; }
      var g = b.closest('[data-fx-g]');
      if (g) {
        var k = g.getAttribute('data-fx-g'), v = b.getAttribute('data-value');
        if (k === 'score') st.score = Number(v);
        else if (k === 'side') st.side = st.side === v ? null : v;
        else if (k === 'part') { st.part = v; st.side = sideOf(id, v); if (v === 'Other') setTimeout(function () { $('[data-fx-other]', box).focus(); }, 0); }
        else st[k] = v;
        sheetErr(box, ''); paint(); return;
      }
      if (!b.hasAttribute('data-fix-main')) return;
      st.other = $('[data-fx-other]', box).value.trim();
      var where = st.part === 'Other' ? st.other : st.part ? (st.side ? st.side + ' ' + st.part.toLowerCase() : st.part) : '';
      if (!where) { sheetErr(box, st.part === 'Other' ? 'Write where it hurts.' : 'Pick where it hurts.'); return; }
      if (st.score == null) { sheetErr(box, 'Pick how bad, 0 to 10.'); return; }
      var lift = st.lift && st.lift !== 'all' ? st.lift : null, ez = $('[data-fx-ease]', box), ease = !!(ez && !ez.hidden && st.ease);
      var q = runQuiet(function () { return l.meet && fn(PL.meets, 'pain') ? PL.meets.pain(id, { where: where, score: st.score, lift: lift, ease: ease }) : PL.lifters.pain(id, { where: where, score: st.score, lift: lift }); }), res = q.res;
      if (!res || res.error) { sheetErr(box, (res && res.error && res.error.message) || 'That did not save.'); return; }
      DESK.pop.close(); toastFor(res, q.toasts);
      emit({ kind: 'pain', lifterId: id });
    });
    paint();
    return true;
  };

  /* ---------------- book a meet ---------------- */
  var FEDS = ['USAPL', 'USPA', 'Powerlifting America', 'IPF'];
  var weighOf = function (m) { if (m && m.weighIn) return m.weighIn; return m && /USPA/i.test(m.fed || '') ? '24h' : '2h'; };
  DESK.bookMeet = function (id, o) {
    o = o || {};
    var all = (data(PL.lifters.list({})) || []).slice().sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    var st = { id: id || null, meet: o.meetId || null, picked: !!o.meetId, other: { name: '', date: '', fed: 'USAPL' }, weigh: null, weighTouched: false, cls: null, entry: '' };
    var canBook = fn(PL.meets, 'book');
    var d = sheet('book', 'Book a meet', '<div class="fx-s" data-crop="book"></div>');
    var box = $('.fx-s', d);
    function meetsFor() {
      var cal = (data(PL.meets.calendar()) || []).filter(function (m) { return m.days >= 1; });
      var l = lifterOf(st.id), ik = st.id && fn(PL.lifters, 'intake') ? data(PL.lifters.intake(st.id)) : null, im = ik && ik.meet ? ik.meet : null, imId = im && im.name ? im.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null;
      /* the intake's meet, when the calendar does not list it, is a choice of its own (it books as a typed meet) */
      var imDate = im && /^\d{4}-\d\d-\d\d/.test(String(im.date || '')) ? String(im.date).slice(0, 10) : null;
      if (imId && imDate && K.daysTo(imDate) >= 1 && !cal.some(function (m) { return m.id === imId; })) cal.push({ id: imId, name: im.name, date: imDate, fed: im.federation || im.fed || null, days: K.daysTo(imDate), ids: [], typed: true });
      if (imId) cal.sort(function (a, b) { return (a.id === imId ? 0 : 1) - (b.id === imId ? 0 : 1); });
      return { list: cal, intake: imId, open: !!(imId && !(l && l.meet && l.meet.days > 0)) };
    }
    function chosenMeet(ms) { return st.meet === 'other' ? { fed: st.other.fed, weighIn: null } : ms.list.filter(function (m) { return m.id === st.meet; })[0] || null; }
    function render() {
      var l = lifterOf(st.id), fst = l ? first(l.name) : '', ms = meetsFor(), cr = st.id ? classRows(st.id) : null, h = '';
      if (st.meet == null && ms.open && !st.picked) st.meet = ms.intake;
      var m = chosenMeet(ms); if (!st.weighTouched) st.weigh = weighOf(m);
      var sh = l ? (l.sex === 'M' ? ['He', 'enters', 'himself'] : l.sex === 'F' ? ['She', 'enters', 'herself'] : ['They', 'enter', 'themselves']) : ['They', 'enter', 'themselves'];
      h += '<div class="fx-sh"><h2 class="fx-st">Book a meet</h2><p class="fx-who fx-book-l">' + esc(sh[0] + ' still ' + sh[1] + ' the meet with the federation ' + sh[2] + '.') + '</p></div><div class="fx-sb">';
      h += '<label class="fx-f"><span class="fx-fl">Lifter</span><select class="input" data-fx-f="lifter"><option value="">Pick a lifter</option>' + all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === st.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></label>';
      h += '<fieldset class="fx-fs"><legend class="fx-fl">Meet</legend><div class="fx-opts" role="radiogroup">';
      ms.list.forEach(function (x) {
        var booked = st.id && x.ids && x.ids.indexOf(st.id) >= 0 && !(ms.intake === x.id && l && !l.meet);
        /* the meet's name first (a coach scans for the meet, then its day), its federation, and where it came from */
        var words = x.name + ', ' + day(x.date) + (x.fed ? ', ' + x.fed : '') + (ms.intake === x.id && l ? ' (from ' + her(l) + ' intake)' : '');
        h += '<label class="fx-opt' + (booked ? ' is-off' : '') + '"><input type="radio" name="fx-meet" value="' + esc(x.id) + '"' + (st.meet === x.id ? ' checked' : '') + (booked ? ' disabled' : '') + '><span class="fx-ol">' + esc(words) + '</span>' + (booked ? '<span class="fx-od">Booked</span>' : '<span class="fx-od num">in ' + x.days + ' days</span>') + '</label>';
      });
      h += '<label class="fx-opt"><input type="radio" name="fx-meet" value="other"' + (st.meet === 'other' ? ' checked' : '') + '><span class="fx-ol">Another meet</span></label></div>';
      h += '<div class="fx-other-meet" data-fx-other-meet' + (st.meet === 'other' ? '' : ' hidden') + '>' +
        '<label class="fx-f"><span class="fx-fl">Name</span><input class="input" type="text" data-fx-f="oname" value="' + esc(st.other.name) + '" autocomplete="off"></label>' +
        '<label class="fx-f"><span class="fx-fl">Date</span><input class="input num" type="date" data-fx-f="odate" min="' + esc(K.add(K.today, 1)) + '" value="' + esc(st.other.date) + '"></label>' +
        '<label class="fx-f"><span class="fx-fl">Federation</span><select class="input" data-fx-f="ofed">' + FEDS.map(function (f) { return '<option' + (f === st.other.fed ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') + '</select></label></div></fieldset>';
      if (cr) {
        var flat = []; cr.groups.forEach(function (g) { flat = flat.concat(g.list); });
        var all2 = data(PL.lifters.classes(st.id)).list, pick = st.cls != null ? st.cls : cr.pick;
        h += '<label class="fx-f"><span class="fx-fl">Class</span><select class="input" data-fx-f="cls">' + all2.map(function (x) { return '<option value="' + esc(x.cls) + '"' + (sameCls(x.cls, pick) ? ' selected' : '') + '>' + esc(x.cls + ' kg') + '</option>'; }).join('') + '</select></label>';
        if (cr.now != null && pick != null) h += '<p class="fx-note num" data-fx-cls-line>' + esc(clsLine(cr, pick)) + '</p>';
      }
      var fed = (m && m.fed) || 'USAPL', hint2 = /USPA/i.test(fed) ? 'Some ' + fed + ' meets weigh in 2 hours before the session.' : 'Most ' + fed + ' local meets weigh in 2 hours before the session.', hint24 = /USPA/i.test(fed) ? 'Most ' + fed + ' meets weigh in the day before.' : 'Some meets weigh in the day before.';
      h += '<div class="fx-f"><span class="fx-fl" id="fx-b-w">Weigh-in</span><div class="seg" role="group" aria-labelledby="fx-b-w" data-fx-f="weigh"><button type="button" data-value="2h" aria-pressed="' + (st.weigh === '2h') + '" title="' + esc(hint2) + '">2-hour</button><button type="button" data-value="24h" aria-pressed="' + (st.weigh === '24h') + '" title="' + esc(hint24) + '">24-hour</button></div></div>';
      h += '<label class="fx-f"><span class="fx-fl">Entries close</span><input class="input num" type="date" data-fx-f="entry" value="' + esc(st.entry) + '"></label>';
      h += '</div>';
      var word = fst ? 'Add to ' + fst + '’s plan' : 'Add to their plan', aria = ' aria-label="' + esc(word.replace(/’/g, "'")) + '"';
      /* the reason a booking did not go sits beside its button, never below the fold of the sheet's body (walk 2, Kofi) */
      h += '<div class="fx-sf"><p class="fx-err" data-fx-err="sheet" role="alert" hidden></p><button type="button" class="btn quiet" data-close>Cancel</button><button type="button" class="btn" data-primary data-fix-main' + aria + (canBook ? '' : ' disabled title="Booking is not wired to the store yet."') + '>' + esc(word) + '</button></div>';
      box.innerHTML = h;
    }
    function book() {
      if (!canBook) return;
      if (!st.id) { sheetErr(box, 'Pick a lifter.'); return; }
      if (!st.meet) { sheetErr(box, 'Pick a meet, or Another meet.'); return; }
      var where;
      if (st.meet === 'other') {
        if (!st.other.name.trim()) { sheetErr(box, 'Write the meet’s name.'); return; }
        if (!st.other.date) { sheetErr(box, 'Pick the meet’s date.'); return; }
        where = { name: st.other.name.trim(), date: st.other.date, fed: st.other.fed };
      } else {
        var pick = meetsFor().list.filter(function (x) { return x.id === st.meet; })[0];
        where = pick && pick.typed ? { name: pick.name, date: pick.date, fed: pick.fed || 'USAPL' } : { meetId: st.meet };
      }
      var clsSel = $('[data-fx-f=cls]', box), opts = { weighIn: st.weigh };
      if (clsSel && clsSel.value) opts.cls = clsVal(clsSel.value);
      if (st.entry) opts.entryBy = st.entry;
      var q = runQuiet(function () { return PL.meets.book(st.id, where, opts); }), res = q.res;
      if (!res || res.error) { sheetErr(box, (res && res.error && res.error.message) || 'That booking did not go through.'); return; }
      d.close(); toastFor(res, q.toasts);
      emit({ kind: 'book', lifterId: st.id });
    }
    box.addEventListener('change', function (e) {
      var t = e.target, f = t.getAttribute('data-fx-f');
      if (t.name === 'fx-meet') { st.meet = t.value; st.picked = true; sheetErr(box, ''); render(); var r = $('input[name=fx-meet][value="' + t.value + '"]', box); if (r) r.focus(); return; }
      if (f === 'lifter') { st.id = t.value || null; st.cls = null; st.meet = null; st.picked = false; st.weighTouched = false; render(); var s = $('[data-fx-f=lifter]', box); if (s) s.focus(); return; }
      if (f === 'cls') { st.cls = clsVal(t.value); sheetErr(box, ''); var cr = classRows(st.id), ln = $('[data-fx-cls-line]', box); if (cr && ln) ln.textContent = clsLine(cr, st.cls); return; }
      if (f === 'ofed') { st.other.fed = t.value; render(); return; }
      if (f === 'odate') st.other.date = t.value;
      if (f === 'entry') st.entry = t.value;
    });
    box.addEventListener('input', function (e) { var f = e.target.getAttribute('data-fx-f'); if (f === 'oname') st.other.name = e.target.value; });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-fix-main')) { book(); return; }
      var g = b.closest('[data-fx-f=weigh]'); if (g) { st.weigh = b.getAttribute('data-value'); st.weighTouched = true; $$('button', g).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); }
    });
    d.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); book(); } });
    render();
    var f0 = st.id ? $('input[name=fx-meet]:not(:disabled)', box) : $('[data-fx-f=lifter]', box); if (f0) f0.focus();
    return d;
  };

  /* ---------------- remind (Clients) ----------------
     DESK.remind(btn, id)                     the modal sheet: dialog[data-sheet=remind], its own crimson on top
     DESK.remind(btn, id, { anchor: row })    in place (screens.md §7.2 "opens in place under the row"): a popover below the
       row, [data-sheet=remind][data-compose=remind-<id>], held to where the page was; like every fix sheet its main button
       is the filled secondary (data-fix-main), never the crimson, so the toolbar's crimson stays the one on the page */
  DESK.remind = function (btn, id, o) {
    o = o || {};
    var l = lifterOf(id), b = data(PL.billing.get(id)); if (!l || !b) return false;
    var fst = first(l.name), today = !!(l.meet && l.meet.days === 0), td = b.todo || {};
    var due = td.due || b.nextDue, late = b.status && b.status.state === 'late';
    var dr = fn(PL.billing, 'remindDraft') ? data(PL.billing.remindDraft(id)) : null, can = !!dr;
    var coach = first((K.D && K.D.coach && K.D.coach.name) || '');
    var text = dr && dr.text ? dr.text : 'Hi ' + fst + ', your ' + K.money(b.amount) + ' due ' + K.dm(due) + (late ? ' is still open.' : ' is coming up.') + (coach ? ' Thanks, ' + coach : ' Thanks.');
    var line = today ? fst + ' lifts today.' : K.money(b.amount) + ' due ' + K.dm(due) + (b.status && b.status.text ? ', ' + b.status.text : '');
    var off = can ? '' : ' disabled title="Reminders with your words are not wired to the store yet."';
    var inPlace = !!(o.anchor && o.anchor.isConnected), main = today ? 'tomorrow' : 'now';
    var btnOf = function (when, words) {
      var isMain = when === main;
      return '<button type="button" class="btn' + (inPlace && !isMain ? ' quiet' : '') + '"' + (isMain ? (inPlace ? ' data-fix-main' : ' data-primary') : '') + ' data-fx-when="' + when + '"' + off + '>' + words + '</button>';
    };
    var now = btnOf('now', 'Send now'), later = btnOf('tomorrow', 'Send tomorrow 08:00'), box, d = null, el = null;
    var field = '<textarea class="input fx-msg" rows="3" data-fx-msg aria-label="' + esc('Reminder to ' + fst) + '">' + esc(text) + '</textarea><p class="fx-err" data-fx-err="sheet" hidden></p>';
    if (inPlace) {
      var h = '<div class="fx fx-remind" data-crop="remind" data-sheet="remind" data-compose="remind-' + esc(id) + '">' +
        '<h3 class="fx-t" id="fx-rm-t">Remind ' + esc(fst) + '</h3><p class="fx-who">' + esc(line) + '</p>' + field +
        '<div class="fx-acts"><button type="button" class="btn quiet" data-fx-x>Cancel</button>' + (today ? now + later : later + now) + '</div></div>';
      el = DESK.pop.open(btn, h, { label: 'Remind ' + fst, layer: 'popover', anchor: o.anchor, place: 'below-end', hold: true });
      el.setAttribute('aria-labelledby', 'fx-rm-t');
      box = $('.fx-remind', el);
    } else {
      var h2 = '<div class="fx-s" data-crop="remind"><div class="fx-sh"><h2 class="fx-st">Remind ' + esc(fst) + '</h2><p class="fx-who">' + esc(line) + '</p></div><div class="fx-sb">' +
        '<label class="fx-f"><span class="fx-fl">Message</span>' + field.replace(' aria-label="' + esc('Reminder to ' + fst) + '"', '') + '</label></div>' +
        '<div class="fx-sf"><button type="button" class="btn quiet" data-close>Cancel</button>' + (today ? now + later : later + now) + '</div></div>';
      d = sheet('remind', 'Remind ' + fst, h2); box = $('.fx-s', d);
    }
    var shut = function () { if (d) d.close(); else DESK.pop.close(); };
    function send(when) {
      if (!can) return;
      var words = $('[data-fx-msg]', box).value.trim();
      if (!words) { sheetErr(box, 'Write the reminder first.'); return; }
      var q = runQuiet(function () { return PL.billing.remind(id, { text: words, when: when }); }), res = q.res;
      if (!res || res.error) { sheetErr(box, (res && res.error && res.error.message) || 'That reminder did not go.'); return; }
      shut(); toastFor(res, q.toasts);
      emit({ kind: 'remind', lifterId: id });
    }
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-fx-x]')) { DESK.pop.close(); if (btn.isConnected) btn.focus({ preventScroll: true }); return; }
      var x = e.target.closest('[data-fx-when]'); if (x) send(x.getAttribute('data-fx-when'));
    });
    (d || box).addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(main); } });
    var ta = $('[data-fx-msg]', box); if (ta) { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); }
    return d || el;
  };
})();
