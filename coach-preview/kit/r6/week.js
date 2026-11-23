/* kit/r6/week.js: window.WEEK, the Week view (programs.md §5 and §14.2, shared.md §4 and §9; owner WEEK-GRID).
   A week is rows, one cell per field, like a coach's Google Sheet (the owner, 13 Nov): each day a block of rows, every
   exercise its own Exercise, Last week, Sets, Reps, RPE or %, Load (kg), Tempo (when there is room or the coach turns it
   on) and Notes cells. Tab and Enter move between cells; the load fills in from the max by the engine (kit/r6/block.js).

   WEEK.grid(host, opts) → { render({ c }), select(r, col, { extend }), sel(), edit(seed), focus(), flush(), destroy(),
                             undo(), redo(), send(), density(d), lastMode(m), checks(), nextCheck(), el }
   It draws the status line ([data-crop=status], aria-live), the column heads (pinned while the page scrolls), the rows of
   one week of the block opts.block() gives, and the week's shape ([data-crop=shape], the sticky foot). It owns the cell
   in hand and the selection, every key of programs.md §5.7, one editor per field (read when the cell is left, never per
   keystroke), the suggestion list for exercise names (§5.6), the clipboard (§5.10: tab-separated text and an HTML table
   both ways, a header row mapped by name, application/x-powa-rows inside the desk), the fill handle, the deltas a rule
   made ("135 +2.5"), the checks (⌘G walks them), the Notes floor of 220 px with second-line notes when there is no room,
   the Last week column (every set, its menu: Last week, Last 3 weeks, a chosen week; localStorage powa-r6-prog-last),
   Compact rows (powa-r6-prog-density) and the shape foot (hard sets and top set per lift).

   It writes only through opts.write(fn, how): fn(b) runs one write on the block and returns the block's answer; the page
   saves (PL.programs.save) and keeps the store's history. In team mode a field edit's how is { kind: 'field', key, c,
   field, text, scope, line }: the page may skip fn and make it one PL.teams.setLine call for that line (no diff needed).
   It asks the page for the rest:
     opts.block()            the block in hand (BLOCK.from of the saved week or of PL.programs.proposal)
     opts.c                  the week's index in the block                 opts.lifter { id, first }
     opts.mode               undefined (Programs) | 'lifter' (lifters.html Program tab: its own Send, no queue keys) |
                             'team' (Teams' week as written: Load reads "each lifter's own", an edit asks the scope) |
                             'template' (no Last week, no Send)
     opts.density            'compact' | 'standard' (else the coach's stored choice)
     opts.columns            the program's extra columns ('tempo' forces Tempo on; others when the engine reads them)
     opts.meet               { date, name } the lifter's next meet (else PL.lifters.get(id).data.meet)
     opts.onSend()           ⌘⇧↵ and, in lifter mode, the grid's own Send (held while a cell holds unread text)
     opts.onLifter(step)     ⌥↓ ⌥↑ (⌥→ ⌥← with the keys sheet's "Tab per week")     opts.onWeek(step)  ⌥→ ⌥←
     opts.onDayMenu(day, btn) · opts.onRowMenu(r, btn) · opts.onAddDay() · opts.onLogFor(r, c) ("Enter what he lifted")
     opts.onScope(info, go)  team mode: before an edit; go('one' | 'team') applies it. info: { r, key, c, field, text,
                             line } (line: the team week's key "<week>.<day>.<i>", the row's data-line), so the page can
                             count whose line changes (PL.teams.setLine's meta.affects) and ask before it lands
     opts.onRowHead(r, el)   team mode: a click on a line's Exercise cell (the page opens each lifter's kilos)
     opts.onAct(act, ctx)    a status-line move the grid cannot make itself (an item's act, "Set the max", a note)
     opts.onUndo() / opts.onRedo()  the page's own history (else the block's, through opts.write)
     opts.onSelect(sel)      the cell in hand moved
   Keys a page can list on the keys sheet: WEEK.KEYS. Never animated: a move between cells, rows or weeks.
   Spec C (13 Nov evening): RPE or % is 112 px (function-polish P23); a back-off reads "12% off top set" there (F3.1); the
   reference column is "Last lifted" over the week it shows, or "From her intake" (F3.4); the status line's sentence is
   [data-crop=formula] in block.js's loadWords words (F3.3, P24), one check at a time ("1 of 2: …"); a week opens on a line
   with no load; Send holds while a line has no load (first-time-coach §7.3); api.checks({ kinds, group }) and
   api.nextCheck({ kinds, group }) narrow to a crimson's checks (C1b: { kinds: ['noload', 'limit'] }); api.tipSlot() and
   [data-tip-slot=grid] are where DESK.tip('grid', …) puts its bar, under the heads, in flow; "Add an exercise" and "Add a
   day" wear .add-row (PX6); the foot's Hard sets and Top set carry their dictionary words (P28); the heads mark rpe and pct,
   the first Back-offs backoffs (F11: data-term and a title from PL.terms, else DEMO.terms).
   Loads after ../kit/kit.js and kit/r6/block.js; uses kit/r6/desk.js (DESK.toast, DESK.menu, DESK.keysOpt) when it is
   there. Tokens only in week.css. */
(function () {
  'use strict';
  var W = window, K = W.K, BL = W.BLOCK;
  if (!K || !BL || !BL.FIELDS) throw new Error('kit/r6/week.js loads after kit/kit.js and kit/r6/block.js (spec B)');
  if (W.WEEK && W.WEEK.__week) return;
  var WEEK = W.WEEK = { __week: true };

  var esc = K.esc, nf = BL.nf, MINUS = '\u2212', TIMES = '\u00d7';
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var KEY_LAST = 'powa-r6-prog-last', KEY_DENSITY = 'powa-r6-prog-density', KEY_COLS = 'powa-r6-prog-cols';
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var plural = function (k, w, ws) { return k + ' ' + (k === 1 ? w : (ws || w + 's')); };
  var cap1 = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  var low1 = function (s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); };
  var words0 = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  var signed = function (v) { return (v > 0 ? '+' : v < 0 ? MINUS : '') + nf(Math.abs(v)); };
  var attr = function (s) { return esc(String(s)); };
  var cssq = function (s) { return W.CSS && CSS.escape ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'); };
  var store = {
    get: function (k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) W.localStorage.removeItem(k); else W.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };
  function dateOf(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00'); }
  function dayLong(iso) { var d = dateOf(iso); return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function dayShort(iso) { var d = dateOf(iso); return DAYS[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MON[d.getMonth()]; }
  function wd3(iso) { return DAYS[dateOf(iso).getDay()].slice(0, 3); }
  function addDays(iso, n) { return K.add ? K.add(iso, n) : iso; }
  function today() { var P = W.PL; if (P && typeof P.now === 'function') { var n = P.now(); var s = n && (n.data || n); if (typeof s === 'string') return s.slice(0, 10); } return K.today; }
  /* "Squat Day" reads "Squat day"; a name typed in capitals keeps them */
  function sentence(t) { return String(t || '').trim().split(/\s+/).map(function (w, i) { return !i ? w.charAt(0).toUpperCase() + w.slice(1) : /^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase(); }).join(' '); }
  function pronoun(l) { var s = String((l && (l.sex || l.gender)) || '').toLowerCase(); return /^(f|female|w|woman|women)$/.test(s) ? 'her' : /^(m|male|man|men)$/.test(s) ? 'his' : 'their'; }
  function typedByCoach(l) { return !!(l && l.intake && l.intake.by === 'coach'); }
  function lifterOf(b, opts) { var id = (opts.lifter && opts.lifter.id) || (b && b.id); return id != null && K.L ? K.L(id) : null; }
  /* the one dictionary (first-time-coach §8.1): PL.terms, else data.js's DEMO.terms. A marked word carries data-term (the
     popover, DESK.terms) and a title, its label and line, at its first place on the grid only (function-polish F11) */
  function termOf(key) {
    var P = W.PL, t = null;
    try { if (P && P.terms && typeof P.terms.get === 'function') { var r = P.terms.get(key); t = r && r.data !== undefined ? r.data : r; } } catch (e) { t = null; }
    if (!t || !t.label) { var list = W.DEMO && W.DEMO.terms; t = Array.isArray(list) ? list.filter(function (x) { return x && x.key === key; })[0] || null : list && typeof list === 'object' ? list[key] || null : null; }
    return t && t.label ? t : null;
  }
  function termTitle(key) { var t = termOf(key); return t ? t.label + ': ' + t.line : ''; }
  function termHtml(key, words, title) { var tt = termTitle(key) || title || ''; return '<span data-term="' + key + '"' + (tt ? ' title="' + esc(tt) + '"' : '') + '>' + esc(words) + '</span>'; }

  /* ---------------- columns (programs.md §5.3) ----------------
     Widths: the first number above 1280 px, the second at 1280 and under. Notes takes the rest and is never under 220 px;
     with no room it becomes a second line under each row (still a cell Tab lands on). Tempo shows at 1600 px and wider or
     when the program turns it on; narrower, the tempo follows the exercise name. */
  var COL = {
    ex: { head: 'Exercise', w: 168, wn: 156 },
    /* 13 Nov (KIT-FIX-1): "182.5 +2.5" needs 84 (15/500 tabular with the cell's 10 px). Spec C (function-polish P23): RPE
       or % is 112, so "62.5% @5.5" and "12% off top set" sit clear of the line; the 16 px come out of Notes (204 at 1440) */
    last: { head: 'Last week', w: 144, wn: 140, ro: true },
    sets: { head: 'Sets', w: 44, wn: 40, field: 'sets', num: true },
    reps: { head: 'Reps', w: 56, wn: 52, field: 'reps', num: true },
    effort: { head: 'RPE or %', w: 112, wn: 112, field: 'effort', num: true },
    load: { head: 'Load (kg)', w: 84, wn: 84, field: 'load', num: true },
    tempo: { head: 'Tempo', w: 64, wn: 64, field: 'tempo' },
    note: { head: 'Notes', field: 'note' }
  };
  var EXTRA = { rest: 'Rest', pauseAt: 'Pause at', acc: 'Bands or chains' };
  var WORD = { ex: '', last: 'last week', sets: 'sets', reps: 'reps', effort: 'RPE or %', load: '', tempo: 'tempo', note: 'notes' };
  var NOTES_MIN = 204, BUDGET = { narrow: 696, mid: 812 };

  /* the grid's keys, for a page's keys sheet (DESK.keyMap) */
  WEEK.KEYS = [
    ['Tab, ⇧Tab', 'Next cell, previous cell'], ['Enter', 'Edit the cell; save and go down'], ['F2', 'Edit, keeping the text'],
    ['Esc', 'Cancel the edit'], ['⌘D', 'Fill down'], ['⌘↵', 'Fill the selection with what you typed'], ['⌘C ⌘X ⌘V', 'Copy, cut, paste'],
    ['⇧Space', 'Select the row'], ['⌘A', 'Select the week'], ['⌘Z, ⇧⌘Z', 'Undo, redo'], ['⌘G', 'The next line the desk flags'],
    ['⌥↓ ⌥↑', 'Next lifter, previous lifter'], ['⌥→ ⌥←', 'Next week, previous week'], ['⌘⇧↵', 'Send the week'], ['⇧F10', 'The line\u2019s moves']
  ];

  /* ---------------- pasted and copied tables (programs.md §5.10) ---------------- */
  var HEAD = [
    ['ex', /^(exercise|exercises|movement|lift)$/], ['sets', /^sets?$/], ['reps', /^reps?$/],
    ['effort', /^(rpe|rir|%|rpe or %|rpe\/%)$/], ['load', /^(weight|load|kg|load \(kg\)|weight \(kg\))$/], ['tempo', /^tempo$/],
    ['note', /^notes?$/], ['rest', /^rest$/], ['pauseAt', /^pause at$/], ['acc', /^(bands?|chains?|bands or chains)$/]
  ];
  var IGNORE = /^(daily volume|checkbox|last week|last 3 weeks|lifted|intake|week \d+)$/;
  var DAYLINE = /^(day\s*\d+|session\s*\d+|workout\s*\d+|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?)\b/i;
  function readTable(t) {
    if (BL.readTable) return BL.readTable(t);
    return String(t || '').replace(/\r\n?/g, '\n').split('\n').map(function (l) { return l.split('\t'); });
  }
  function tableHtml(rows, head) {
    return '<table>' + rows.map(function (r, i) { var tag = head && !i ? 'th' : 'td'; return '<tr>' + r.map(function (v) { return '<' + tag + '>' + esc(v) + '</' + tag + '>'; }).join('') + '</tr>'; }).join('') + '</table>';
  }
  function htmlRows(html) {
    try {
      var doc = new DOMParser().parseFromString(String(html), 'text/html'), tr = doc.querySelectorAll('tr');
      if (!tr.length) return null;
      return [].map.call(tr, function (r) { return [].map.call(r.querySelectorAll('td, th'), function (c) { return words0(c.textContent); }); });
    } catch (e) { return null; }
  }

  /* ---------------- one undo step for several writes ----------------
     The block keeps one step per write; a paste or a fill makes many writes, and the coach takes it back with one ⌘Z. The
     writes run inside one b.commit and the inner steps are folded into it (kitRequest: b.batch in block.js). */
  function batch(b, label, body) {
    var st = b._undo, n0 = st ? st.length : -1;
    var res = b.commit(label, function () { var r = body(b); return r && r.error ? r : { data: (r && r.data) || r || {} }; });
    if (st && b._undo === st) {
      if (res && res.data && res.data.changed) { if (st.length > n0 + 1) st.splice(n0, st.length - n0 - 1); }
      else if (st.length > n0) st.splice(n0);
    }
    return res;
  }

  /* ======================================================================================================================
     THE GRID
     ==================================================================================================================== */
  WEEK.grid = function (host, opts) {
    if (!host) throw new Error('WEEK.grid needs a host element');
    opts = opts || {};
    var D = W.DESK || null;
    var mode = opts.mode === 'lifter' || opts.mode === 'team' || opts.mode === 'template' ? opts.mode : 'week';
    var B = function () { return typeof opts.block === 'function' ? opts.block() : opts.block; };
    var st = {
      c: isNum(opts.c) ? opts.c : 0, density: 'standard', last: 'last', band: null,
      hand: null, anchor: null, want: null, run: null, ed: null, nav: [], order: [], cols: [], notes: 'col', tempoIn: false,
      seq: [], acts: [], msg: null, fill: null, m: null, dead: false, sug: null
    };
    var dens = opts.density || store.get(KEY_DENSITY);
    st.density = dens === 'compact' ? 'compact' : 'standard';
    var lm = store.get(KEY_LAST); st.last = lm === '3' || /^w\d+$/.test(lm || '') ? lm : 'last';

    var root = document.createElement('div');
    root.className = 'wg';
    root.setAttribute('data-mode', mode);
    root.innerHTML =
      /* the status line is the grid's formula bar: its sentence (.wg-say) is the [data-crop=formula] the checks read (P24) */
      '<div class="wg-status" data-crop="status" aria-live="polite"><span class="wg-addr" data-ellipsis></span><input class="wg-fx" type="text" autocomplete="off" spellcheck="false" aria-label="The cell in hand: type here to change it, Enter saves"><span class="wg-say" data-crop="formula" data-ellipsis></span><span class="wg-acts"></span></div>' +
      '<i class="wg-pin" aria-hidden="true"></i>' +
      /* .wg-tip: the slot under the column heads where a one-time tip sits in flow (first-time-coach §8.4, DESK.tip('grid', …));
         empty, it takes no room. It is outside the cells, so the grid's keys never reach a tip's own button */
      '<div class="wg-grid" role="grid" data-keys="own" data-grid aria-multiselectable="true"><div class="wg-head" role="rowgroup" data-fade></div><div class="wg-tip" data-tip-slot="grid" role="none"></div><div class="wg-body" role="rowgroup"></div></div>' +
      /* .wg-tail: a page's own foot (the week's note) sits here, above the shape foot, so the foot stays the card's last
         line and its edge is never a cut line of words */
      '<div class="wg-more-days"></div><div class="wg-tail"></div><i class="wg-pin" aria-hidden="true"></i>' +
      '<div class="wg-shape" data-crop="shape" data-fade><span class="wg-shape-t"></span><span class="wg-shape-a"></span></div>';
    host.innerHTML = '';
    host.appendChild(root);
    var elStatus = root.querySelector('.wg-status'), elAddr = root.querySelector('.wg-addr'), elSay = root.querySelector('.wg-say'), elActs = root.querySelector('.wg-acts'), elFx = root.querySelector('.wg-fx');
    var elGrid = root.querySelector('.wg-grid'), elHead = root.querySelector('.wg-head'), elBody = root.querySelector('.wg-body'), elTip = root.querySelector('.wg-tip');
    var elDays = root.querySelector('.wg-more-days'), elShape = root.querySelector('.wg-shape'), elShapeT = root.querySelector('.wg-shape-t'), elShapeA = root.querySelector('.wg-shape-a');
    var pins = root.querySelectorAll('.wg-pin');
    /* the pinned heads and foot show their fade only while rows pass under them: two sentinels and an IntersectionObserver
       (no scroll listener). While shown, a fade is the edge the eye reads past, and it takes the pointer like the edge. */
    var pinIO = null, pinSig = '';
    /* the pane the rows scroll in: the nearest box that scrolls (a page that keeps the window still, as Programs does,
       scrolls its work card), else the window. Heads, the foot and the cell in hand are kept in view against it. */
    function scroller() {
      for (var p = root.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
      }
      return null;
    }
    function watchPins() {
      if (!('IntersectionObserver' in W)) return;
      var sc = scroller(), top = (parseFloat(getComputedStyle(root).getPropertyValue('--wg-top')) || 0) + elStatus.offsetHeight, bot = elShape.offsetHeight, sig = top + '|' + bot + '|' + (sc ? 1 : 0);
      if (pinIO && sig === pinSig && pinIO.root === sc) return;
      if (pinIO) pinIO.disconnect();
      pinSig = sig;
      pinIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var rb = e.rootBounds; if (!rb) return;
          if (e.target === pins[0]) root.classList.toggle('is-stuck-top', !e.isIntersecting && e.boundingClientRect.top < rb.top);
          else root.classList.toggle('is-stuck-bottom', !e.isIntersecting && e.boundingClientRect.top > rb.bottom);
        });
      }, { root: sc, rootMargin: (-top) + 'px 0px ' + (-bot) + 'px 0px', threshold: 0 });
      pinIO.observe(pins[0]); pinIO.observe(pins[1]);
    }

    /* ---------------- reading the block ---------------- */
    function lifter() { return lifterOf(B(), opts); }
    function first() { var l = lifter(); return (opts.lifter && opts.lifter.first) || (l && l.first) || 'the lifter'; }
    function rowAt(key) { var b = B(); if (!b) return -1; for (var i = 0; i < b.rows.length; i++) if (b.rows[i].key === key) return i; return -1; }
    function weekIdx(b, n) { for (var i = 0; i < b.weeks.length; i++) if (b.weeks[i].n === n) return i; return -1; }
    function isAdd(key) { return typeof key === 'string' && key.charAt(0) === '+'; }
    function addDay(key) { return key.slice(1); }
    function meetOf() {
      if (opts.meet && opts.meet.date) return opts.meet;
      var P = W.PL, id = (opts.lifter && opts.lifter.id) || (B() && B().id);
      try { var l = P && P.lifters && P.lifters.get(id); var m = l && l.data && l.data.meet; if (m && (m.date || m.iso)) return { date: m.date || m.iso, name: m.name || 'the meet' }; } catch (e) { /* the store is not there */ }
      var L = lifter(); if (L && L.meet && L.meet.date) return { date: L.meet.date, name: L.meet.name || 'the meet' };
      return null;
    }
    /* the engine's checks for a week; a deload or recovery week is light on purpose, so its "light" checks are not shown */
    function checksOf(c) {
      var b = B(); if (!b || typeof b.checks !== 'function') return [];
      var w = b.weeks[c], list; try { list = b.checks(c, opts.checkCtx || undefined) || []; } catch (e) { return []; }
      return w && (w.deload || b.kind === 'recovery') ? list.filter(function (k) { return k.kind !== 'light'; }) : list;
    }

    /* the column set for this window (programs.md §5.3), the Notes floor, the tempo that follows a name */
    /* 22 Nov (a cold review: "no column resize, hide"): the coach's own widths (a drag on a head's edge; a double click
       puts the column back) and which of Last week and Tempo show, kept on this laptop for every lifter */
    function colPrefs() { var j = null; try { j = JSON.parse(store.get(KEY_COLS) || 'null'); } catch (e) { j = null; } return j && typeof j === 'object' ? { w: j.w && typeof j.w === 'object' ? j.w : {}, hide: j.hide && typeof j.hide === 'object' ? j.hide : {}, show: j.show && typeof j.show === 'object' ? j.show : {} } : { w: {}, hide: {}, show: {} }; }
    function saveColPrefs(pf) { var empty = !Object.keys(pf.w).length && !Object.keys(pf.hide).length && !Object.keys(pf.show).length; store.set(KEY_COLS, empty ? null : JSON.stringify(pf)); }
    function layout() {
      var w = W.innerWidth || 1440, band = w <= 1280 ? 'narrow' : w >= 1600 ? 'wide' : 'mid', nb = band === 'narrow', pf = colPrefs();
      var on = (opts.columns || []).map(function (x) { return typeof x === 'string' ? x : x && x.key; });
      var cols = ['ex'];
      if (mode !== 'team' && mode !== 'template' && !pf.hide.last) cols.push('last');
      cols.push('sets', 'reps', 'effort', 'load');
      var tempo = on.indexOf('tempo') >= 0 || band === 'wide' || !!pf.show.tempo;
      if (tempo && !(nb && on.indexOf('tempo') < 0 && !pf.show.tempo) && !pf.hide.tempo) cols.push('tempo');
      on.forEach(function (k) { if (EXTRA[k] && BL.FIELDS.indexOf(k) >= 0 && cols.indexOf(k) < 0) cols.push(k); });
      var widths = cols.map(function (k) {
        if (isNum(pf.w[k])) return Math.max(36, Math.min(480, Math.round(pf.w[k])));
        if (k === 'last' && st.last === '3') return nb ? 172 : 184;
        if (k === 'load' && mode === 'team') return 136;
        if (COL[k]) return nb ? COL[k].wn : COL[k].w;
        return nb ? 64 : 72;
      });
      var sum = widths.reduce(function (a, x) { return a + x; }, 0);
      var avail = host.clientWidth || 0, budget = band === 'wide' ? Math.max(avail, BUDGET.mid) : BUDGET[band];
      /* a host far narrower than the desk's detail column (a page that did not plan for the grid) puts the notes on a
         second line rather than spill: within 96 px the columns keep their sizes, as the desk's own pages give them */
      var room = budget - sum, notes = !nb && room >= NOTES_MIN && !(avail && avail < budget - 96) ? 'col' : 'line';
      /* with widths of the coach's own, the notes keep their column while the sheet has 140 px left for them */
      if (!nb && avail && Object.keys(pf.w).length) notes = avail - 30 - sum >= 140 ? 'col' : 'line';
      /* notes on a second line: the Exercise and Last week columns share the room, and the row ends in a 40 px track that
         holds the line's "…" (so it never sits on a number) */
      var tpl = widths.map(function (x, i) { return notes === 'line' && (cols[i] === 'ex' || cols[i] === 'last') ? 'minmax(' + x + 'px, 1fr)' : x + 'px'; });
      if (notes === 'col') { cols.push('note'); tpl.push('minmax(' + (Object.keys(pf.w).length ? 140 : NOTES_MIN) + 'px, 1fr)'); }
      else tpl.push('40px');
      return { band: band, cols: cols, tpl: tpl.join(' '), notes: notes, tempoIn: cols.indexOf('tempo') < 0 };
    }

    /* which lines a week shows: a lifted week what it held; any other week every line of the program (a line that ended in
       an earlier week stays out, a swap shows only in its week, a line taken out reads "not this week") */
    function model() {
      var b = B(); if (!b || !b.weeks || !b.weeks.length) return null;
      var c = Math.max(0, Math.min(b.weeks.length - 1, st.c)); st.c = c;
      var w = b.weeks[c], uid = w.uid, lifted = w.state === 'lifted', idx = {};
      b.weeks.forEach(function (x, k) { idx[x.uid] = k; });
      var show = function (row) {
        if (row.cells[uid]) return true;
        if (lifted) return false;
        if (w.out && w.out[row.key]) return true;
        if (row.only) return row.only === uid;
        var us = Object.keys(row.cells); if (!us.length) return true;
        return us.some(function (u) { return idx[u] > c; });
      };
      var days = typeof b.daysOf === 'function' ? b.daysOf(c) : b.days.map(function (d, i) { return { name: d.name, i: i, iso: b.dateOf ? b.dateOf(c, d.name) : null, off: false, moved: null }; });
      var merged = w.merged || [], seen = {}, groups = [];
      days.forEach(function (d) {
        if (seen[d.name]) return;
        var mg = merged.filter(function (m) { return m.days.indexOf(d.name) >= 0; })[0], names = mg ? mg.days.slice() : [d.name], rs = [];
        names.forEach(function (n) { seen[n] = 1; });
        if (mg) {
          (mg.order || []).forEach(function (key) { var r = rowAt(key); if (r >= 0 && show(b.rows[r]) && rs.indexOf(r) < 0) rs.push(r); });
          b.rows.forEach(function (row, r) { if (names.indexOf(row.day) >= 0 && show(row) && rs.indexOf(r) < 0) rs.push(r); });
        } else b.rows.forEach(function (row, r) { if (row.day === d.name && show(row)) rs.push(r); });
        if (lifted && !rs.length) return;
        groups.push({ day: d.name, names: names, iso: mg ? mg.iso : d.iso, off: !!d.off, moved: d.moved || null, merged: !!mg, limit: mg ? mg.minutes : null, rows: rs });
      });
      /* the meet in the week (§5.9): a day row of its own, in date order */
      var mt = meetOf(), isos = groups.map(function (g) { return g.iso; }).filter(Boolean).sort(), meet = null;
      if (mt && isos.length && mt.date >= isos[0] && mt.date <= addDays(isos[0], 6)) {
        meet = { meet: true, iso: mt.date, name: mt.name, day: '@meet', rows: [] };
        var at = groups.length; for (var i = 0; i < groups.length; i++) if (groups[i].iso && groups[i].iso > mt.date) { at = i; break; }
        groups.splice(at, 0, meet);
      }
      return { b: b, c: c, w: w, uid: uid, lifted: lifted, groups: groups, meet: mt };
    }

    /* ---------------- words for a cell ---------------- */
    function loadOf(b, r, c, lifted) { var L = b.load(r, c, lifted ? { paper: true } : undefined); return L || { kind: 'none', kg: null }; }
    function tempoText(row, x) { if (x && x.tempo) return x.tempo; if (x && x.pause) return nf(x.pause) + ' s'; if (row.tempo) return row.tempo; if (row.pause) return nf(row.pause) + ' s'; return ''; }
    function noteText(row, x) { return (x && x.note) || row.note || ''; }
    function fieldShown(m, r, k) {
      var b = m.b, row = b.rows[r], x = row.cells[m.uid] || null, f = COL[k] ? COL[k].field : k;
      var bad = typeof b.badField === 'function' ? b.badField(r, m.c, f) : null;
      if (bad != null) return { text: bad, bad: true };
      if (k === 'note') return { text: noteText(row, x), own: !!(x && x.note) };
      if (k === 'tempo') return { text: tempoText(row, x) };
      if (!x) return { text: '' };
      if (k === 'load') {
        if (mode === 'team') { var tl = loadOf(b, r, m.c, false); return tl.kind === 'feel' || tl.kind === 'none' ? { text: '' } : { text: 'each lifter\u2019s own', quiet: true }; }
        var t = BL.fieldText(x, 'load');
        if (t) return { text: t, delta: deltaOf(m, row) };
        var L = loadOf(b, r, m.c, m.lifted);
        if (L.kg == null) return { text: '' };
        return { text: nf(L.kg) + (L.kgHi != null && L.kgHi !== L.kg ? '-' + nf(L.kgHi) : ''), delta: deltaOf(m, row) };
      }
      return { text: BL.fieldText(x, f, f === 'effort' ? { words: true } : undefined), words: f === 'effort' && x.off != null };
    }
    /* a per-line rule's step against the comparison week ("135 +2.5"); held and capped lines read no delta */
    function deltaOf(m, row) {
      var y = m.w.why && m.w.why[row.key];
      if (!y || y.field !== 'load' || !isNum(y.was) || !isNum(y.now) || y.was === y.now) return '';
      return y.kind === 'rule' || y.kind === 'step' || y.kind === 'follow' ? signed(Math.round((y.now - y.was) * 100) / 100) : '';
    }
    /* the Last week column: every set as lifted, the week the coach chose, or the last three top sets */
    function lastOf(m, r) {
      var b = m.b, c = m.c;
      if (m.lifted) { var own = b.lastWeek(r, c, { from: c }); if (own) own.head = 'Lifted'; return own || { text: '', state: 'none', head: 'Lifted' }; }
      if (st.last === '3') {
        var tops = [], reps = null, felt = null;
        for (var k = Math.max(0, c - 3); k < c; k++) {
          var x = b.raw(r, k), lt = x && x.lifted;
          if (!lt || !(lt.done > 0)) continue;
          var kg = b.topKg(r, k); if (!isNum(kg)) continue;
          tops.push(kg); reps = lt.top && lt.top.r != null ? lt.top.r : x.r; felt = lt.top && lt.top.felt != null ? lt.top.felt : lt.felt;
        }
        if (tops.length) return { text: tops.map(nf).join(', ') + ' ' + TIMES + ' ' + reps, felt: felt != null ? '@' + nf(felt) : '', state: 'lifted', head: 'Last 3 weeks' };
        var one = b.lastWeek(r, c); if (one) one.head = 'Last 3 weeks'; return one || { text: '', state: 'none', head: 'Last 3 weeks' };
      }
      if (/^w\d+$/.test(st.last)) {
        var src = weekIdx(b, Number(st.last.slice(1)));
        if (src >= 0 && src < c) return b.lastWeek(r, c, { from: src });
      }
      return b.lastWeek(r, c) || { text: '', state: 'none', head: 'Last week' };
    }
    /* the reference column's head (function-polish F3.4): "Last lifted" with the week it shows under it ("Week 2"); for a
       lifter with nothing lifted yet "From her intake", never "Intake" alone. → { t, sub } */
    function lastHead(m) {
      if (m.lifted) return { t: 'Lifted' };
      if (st.last === '3') return { t: 'Last 3 weeks' };
      if (/^w\d+$/.test(st.last)) { var k = weekIdx(m.b, Number(st.last.slice(1))); if (k >= 0 && k < m.c) return { t: 'Last lifted', sub: m.b.weekName(k) }; }
      var src = null, intake = false;
      m.groups.some(function (g) { return g.rows.some(function (r) { var lw = lastOf(m, r); if (!lw || lw.state === 'none') return false; if (lw.state === 'intake') intake = true; else src = lw.head || null; return true; }); });
      /* a lifter added by hand has no intake of their own: the column reads what the coach typed (first-time-coach §3.3) */
      if (intake) return { t: typedByCoach(lifter()) ? 'What you typed' : 'From ' + pronoun(lifter()) + ' intake' };
      var sub = m.c > 0 ? m.b.weekName(m.c - 1) : src && !/^(last week|intake)$/i.test(src) ? src : null;
      return { t: 'Last lifted', sub: sub };
    }
    /* the line's name: line 0 the exercise (16/600), lines under it "Back-offs" only for a drop, else the name again */
    function exParts(m, r) {
      var b = m.b, row = b.rows[r], out = m.w.out && m.w.out[row.key];
      /* a line out this week keeps the label its cell gave it ("Back-offs not this week") */
      var top = row.line ? b.topRow(row) : null, topOut = top && ((m.w.out && m.w.out[top.key]) || top.cells[m.uid]);
      var name = !row.line ? row.name : out && !row.cells[m.uid] && BL.lineLabel ? BL.lineLabel(row, out, { top: topOut || null }) : typeof b.lineLabel === 'function' ? b.lineLabel(r, m.c) : 'Back-offs';
      return { name: name, sub: !!row.line, bo: row.line > 0 && name === 'Back-offs', tempo: st.tempoIn ? tempoText(row, row.cells[m.uid]) : '', out: !!out };
    }

    /* ---------------- drawing ---------------- */
    function cellAttrs(k, ci, ro, extra) {
      return ' role="gridcell" data-col="' + k + '" aria-colindex="' + (ci + 1) + '" tabindex="-1"' + (ro ? ' aria-readonly="true"' : '') + (extra || '');
    }
    var none = '<span class="sr">none</span>';
    function headHtml(m) {
      var cells = st.cols.map(function (k, i) {
        var inner;
        if (k === 'last') {
          var lh = lastHead(m), words = '<span class="wg-ht">' + esc(lh.t) + '</span>' + (lh.sub ? '<span class="wg-hs">' + esc(lh.sub) + '</span>' : '');
          inner = !m.lifted
            ? '<button class="wg-hb' + (lh.sub ? ' is-two' : '') + '" type="button" data-last-menu aria-haspopup="menu" title="' + attr(lh.t + (lh.sub ? ', ' + lh.sub : '') + '. Show another week, or the last 3') + '">' + words + '</button>'
            : '<span>' + words + '</span>';
        } else if (k === 'effort') inner = '<span>' + termHtml('rpe', 'RPE') + ' or ' + termHtml('pct', '%') + '</span>';   /* F11 rpe, pct */
        else inner = '<span>' + esc(k === 'load' && mode === 'team' ? 'Load' : COL[k] ? COL[k].head : EXTRA[k] || k) + '</span>';
        return '<div class="wg-h wg-k-' + k + (COL[k] && COL[k].num ? ' is-num' : '') + '" role="columnheader" data-col="' + k + '" aria-colindex="' + (i + 1) + '">' + inner + (k !== 'note' ? '<i class="wg-rz" data-rz="' + k + '" aria-hidden="true" title="Drag to size the column. Double-click puts it back."></i>' : '') + '</div>';
      }).join('');
      return '<div class="wg-tr wg-hr" role="row" aria-rowindex="1"><button class="wg-g wg-gc" type="button" data-cols-menu aria-haspopup="menu" aria-label="Columns" title="Columns: show, hide, put the widths back">' + (D && D.ic ? D.ic('more') : K.ic('more')) + '</button>' + cells + '</div>';
    }
    function exHtml(m, r, ci, ro, o) {
      var p = exParts(m, r);
      /* the first "Back-offs" on the grid carries the word's title (function-polish F11 backoffs); never an underline in a row */
      var t = '<span class="wg-t' + (p.sub ? ' is-sub' : '') + (p.bo ? ' is-bo' : '') + '">' + (p.bo && o && o.markBo ? termHtml('backoffs', p.name) : esc(p.name)) + '</span>' +
        (p.tempo ? '<span class="wg-tp">' + esc(p.tempo) + '</span>' : '') + (p.out ? '<span class="wg-off">not this week</span>' : '');
      return '<div class="wg-c wg-k-ex' + (p.sub ? ' is-sub' : '') + '"' + cellAttrs('ex', ci, ro, ' data-ellipsis title="' + attr(p.name + (p.tempo ? ' ' + p.tempo : '') + (p.out ? ', not this week' : '')) + '"') + '>' + t + '</div>';
    }
    function lastHtml(m, r, ci, tone) {
      var lw = lastOf(m, r) || { text: '', state: 'none' }, inner = '', title = lw.text || '';
      if (lw.state === 'lifted' || lw.state === 'intake') {
        var t = String(lw.text || ''), felt = lw.felt || '', mm = /^(.*?)( @[\d.]+(?:-[\d.]+)?)$/.exec(t);
        if (!felt && mm) { t = mm[1]; felt = mm[2].trim(); }
        var over = false;
        if (felt && lw.state === 'lifted' && st.last !== '3' && !m.lifted) { var src = m.c - 1, mk = src >= 0 ? m.b.mark(r, src) : null; over = !!(mk && mk.kind === 'over'); }
        var markTone = lw.mark && /^pain/.test(lw.mark) ? 'pain' : lw.mark && /short|of \d/.test(lw.mark) ? 'warn' : '';
        if (over && !tone.used) { tone.used = 'warn'; } else over = false;
        if (markTone && (tone.used && tone.used !== markTone || (over && markTone))) markTone = '';
        if (markTone) tone.used = markTone;
        inner = '<span class="wg-ls">' + esc(t) + '</span>' + (felt ? ' <span class="wg-lf' + (over ? ' tw tone-warn' : '') + '">' + esc(felt) + '</span>' : '') +
          (lw.mark && lw.mark !== 'missed' ? ' <span class="wg-lm' + (markTone ? ' tw tone-' + markTone : '') + '">' + esc(lw.mark) + '</span>' : '');
        title = t + (felt ? ' ' + felt : '') + (lw.mark ? ' ' + lw.mark : '');
      } else if (lw.state === 'missed') {
        var mt = tone.used ? '' : 'warn'; if (mt) tone.used = mt;
        inner = '<span class="wg-lm' + (mt ? ' tw tone-warn' : '') + '">missed</span>';
      } else if (lw.text) inner = '<span class="wg-lq">' + esc(lw.text) + '</span>';
      else inner = none;
      return '<div class="wg-c wg-k-last"' + cellAttrs('last', ci, true, ' data-ellipsis title="' + attr(title) + '"') + '>' + inner + '</div>';
    }
    function fieldHtml(m, r, k, ci, ro, tone, changed, tail) {
      var v = fieldShown(m, r, k), cls = 'wg-c wg-k-' + k + (COL[k] && COL[k].num ? ' is-num' : ''), body;
      var badTone = v.bad && !tone.used ? 'warn' : ''; if (badTone) tone.used = badTone;
      if (v.bad) cls += ' is-bad';
      if (changed) cls += ' is-chg';
      if (!v.text) body = none;
      else body = '<span class="wg-t' + (badTone ? ' tw tone-warn' : '') + (v.quiet ? ' is-quiet' : '') + (v.words ? ' is-words' : '') + '">' + esc(v.text) + '</span>' + (v.delta ? '<span class="wg-dl">' + esc(v.delta) + '</span>' : '');
      var long = k === 'note' || k === 'effort' || k === 'sets' || EXTRA[k];
      return '<div class="' + cls + '"' + cellAttrs(k, ci, ro, (long && v.text ? ' data-ellipsis title="' + attr(v.text) + '"' : '') + (v.bad ? ' aria-invalid="true"' : '')) + '>' + body + (tail || '') + '</div>';
    }
    function changedFields(m, r) {
      var b = m.b, row = b.rows[r], w = m.w, out = {};
      if (!w.was || w.sent || typeof b.changed !== 'function' || !b.changed(r, m.c)) return out;
      var sig = String(w.was[row.key] || ''), parts = sig.split(' | '), old = null;
      try { var p = parts[0] ? BL.parse(parts[0], { line: row.line, hasTop: row.line > 0 }) : { ok: true, cell: null }; old = p.ok ? p.cell : null; } catch (e) { old = null; }
      var now = row.cells[m.uid] || null;
      ['sets', 'reps', 'effort', 'load', 'tempo'].forEach(function (f) { var o = f === 'effort' ? { words: true } : undefined, a = old ? BL.fieldText(old, f, o) : '', z = now ? BL.fieldText(now, f, o) : ''; if (a !== z) out[f] = a; });
      if ((parts[1] || '') !== ((now && now.note) || '')) out.note = parts[1] || '';
      return out;
    }
    function lineHtml(m, r, ri, lk, o) {
      var b = m.b, row = b.rows[r], ro = b.isRO(r, m.c), tone = { used: '' }, chg = m.lifted ? {} : changedFields(m, r);
      /* the line's "…": inside its Notes cell (its right padding is the room), or in the row's end track when the notes
         are a second line; never over a value */
      var menu = ro ? '' : '<button class="wg-more" type="button" data-more data-row-menu tabindex="-1" aria-label="' + attr(row.name + ' moves') + '" title="Moves (⇧F10)">' + (D && D.ic ? D.ic('more') : K.ic('more')) + '</button>';
      var cells = st.cols.map(function (k, ci) {
        if (k === 'ex') return exHtml(m, r, ci, ro, o);
        if (k === 'last') return lastHtml(m, r, ci, tone);
        return fieldHtml(m, r, k, ci, ro || (mode === 'team' && k === 'load'), tone, chg[k] != null, k === 'note' ? menu : '');
      }).join('');
      var lineNote = '';
      if (st.notes === 'line') {
        var nv = fieldShown(m, r, 'note');
        lineNote = '<div class="wg-c wg-k-note wg-nl' + (nv.text ? '' : ' is-empty') + (nv.bad ? ' is-bad' : '') + '"' + cellAttrs('note', st.cols.length, ro, nv.text ? ' data-ellipsis title="' + attr(nv.text) + '"' : '') + '>' +
          (nv.text ? '<span class="wg-t' + (nv.bad && !tone.used ? ' tw tone-warn' : '') + '">' + esc(nv.text) + '</span>' : none) + '</div>';
      }
      var menu = ro ? '' : '<button class="wg-more" type="button" data-more data-row-menu tabindex="-1" aria-label="' + attr(row.name + ' moves') + '" title="Moves (⇧F10)">' + (D && D.ic ? D.ic('more') : K.ic('more')) + '</button>';
      var cls = 'wg-tr wg-line' + (ro ? ' is-ro' : '') + (row.line ? ' is-sub' : '') + (m.w.out && m.w.out[row.key] ? ' is-out' : '');
      /* 22 Nov: the gutter a sheet has. The line's number; a click takes the whole line, shift a run of them */
      var gut = '<div class="wg-g" data-gut aria-hidden="true" title="Select the line (⇧Space)">' + (o && o.n ? o.n : '') + '</div>';
      return '<div class="' + cls + '" role="row" data-row="' + attr(row.key) + '"' + (lk ? ' data-line="' + attr(lk) + '"' : '') + ' aria-rowindex="' + ri + '"' + (ro ? ' aria-readonly="true"' : '') + '>' + gut + cells + lineNote + (st.notes === 'line' ? menu : '') + '</div>';
    }
    function dayState(m, g) {
      var b = m.b, w = m.w, out = [];
      if (g.meet) return out;
      if (g.off) out.push({ t: 'Off this week' });
      if (g.moved && !g.merged) out.push({ t: 'Moved from ' + wd3(g.moved) });
      var lifted = 0, rated = 0, at = null;
      g.rows.forEach(function (r) { var x = b.raw(r, m.c), lt = x && x.lifted; if (!lt) return; rated++; if (lt.done > 0) { lifted++; var s = (lt.sets || [])[0]; if (s && s.at && !at) at = s.at; } });
      var t0 = today();
      if (m.lifted || w.state === 'now') {
        if (g.rows.length && lifted === g.rows.length) out.push({ t: 'Done ' + wd3(g.iso) });
        else if (lifted) out.push({ t: 'Started ' + wd3(g.iso) + (at && /T\d\d:\d\d/.test(at) ? ' ' + String(at).slice(11, 16) : '') });
        else if (g.iso && g.iso < t0 && !g.off) out.push({ t: 'Missed', tone: 'warn' });
      }
      if (m.meet && g.iso && g.iso >= m.meet.date && !m.lifted && m.groups.some(function (x) { return x.meet; })) out.push({ t: 'after the meet', tone: 'warn' });
      return out;
    }
    function dayHtml(m, g, ri) {
      var ncols = st.cols.length + (st.notes === 'line' ? 1 : 0);
      if (g.meet) {
        return '<div class="wg-tr wg-day is-meet" role="row" data-day="@meet" aria-rowindex="' + ri + '"><div class="wg-dc" role="rowheader" aria-colspan="' + ncols + '">' +
          '<span class="wg-dd">' + esc(dayLong(g.iso)) + '</span><span class="wg-dn">Meet day</span><span class="wg-dx">' + esc(g.name) + '</span></div></div>';
      }
      var b = m.b, sets = 0;
      g.rows.forEach(function (r) { var x = b.raw(r, m.c); if (x && x.n != null) sets += x.n; });
      var nm = g.merged && typeof b.sessionName === 'function' ? b.sessionName(m.c, g.names) : sentence(g.day);
      var mins = '';
      var l = lifter(), lim = g.limit || (l && l.intake && isNum(l.intake.sessionMinutes) ? l.intake.sessionMinutes : null);
      var shared = m.groups.filter(function (x) { return !x.meet && x !== g && x.iso === g.iso; }).length > 0;
      if ((g.merged || shared || lim) && g.rows.length && typeof b.minutesOfRows === 'function') { var mn = b.minutesOfRows(g.rows, m.c); mins = 'about ' + mn + (lim ? ' of ' + lim : '') + ' min'; }
      var states = dayState(m, g), tone = { used: '' };
      var stHtml = states.map(function (s) { var tw = s.tone && !tone.used ? s.tone : ''; if (tw) tone.used = tw; return '<span class="wg-dst' + (tw ? ' tw tone-' + tw : '') + '">' + esc(s.t) + '</span>'; }).join('');
      var canEdit = !m.lifted && mode !== 'team';
      return '<div class="wg-tr wg-day" role="row" data-day="' + attr(g.day) + '" aria-rowindex="' + ri + '"><div class="wg-dc" role="rowheader" aria-colspan="' + ncols + '">' +
        '<span class="wg-dd">' + esc(g.iso ? dayLong(g.iso) : sentence(g.day)) + '</span>' +
        (canEdit && !g.merged ? '<button class="wg-dn" type="button" data-day-name tabindex="-1" title="Rename the day"><span class="wg-dnt" data-ellipsis title="' + attr(nm) + '">' + esc(nm) + '</span></button>' : '<span class="wg-dn"><span class="wg-dnt" data-ellipsis title="' + attr(nm) + '">' + esc(nm) + '</span></span>') +
        (sets ? '<span class="wg-ds">' + esc(plural(sets, 'set')) + '</span>' : '') + (mins ? '<span class="wg-ds">' + esc(mins) + '</span>' : '') + stHtml +
        (canEdit ? '<button class="wg-more wg-dm" type="button" data-more data-day-menu tabindex="-1" aria-label="' + attr(nm + ' moves') + '" title="Moves">' + (D && D.ic ? D.ic('more') : K.ic('more')) + '</button>' : '') +
        '</div></div>';
    }
    function addHtml(m, g, ri) {
      var key = '+' + g.day, open = st.density !== 'compact' || (st.hand && st.hand.key === key);
      var ncols = st.cols.length + (st.notes === 'line' ? 1 : 0);
      return '<div class="wg-tr wg-add' + (open ? '' : ' is-folded') + '" role="row" data-add-row="' + attr(g.day) + '" aria-rowindex="' + ri + '">' +
        '<div class="wg-g" aria-hidden="true"></div><div class="wg-c wg-k-ex"' + cellAttrs('ex', 0, false) + '><span class="wg-t is-add add-row">Add an exercise</span></div>' +
        (ncols > 1 ? '<div class="wg-c wg-fill" role="gridcell" aria-colindex="2" aria-colspan="' + (ncols - 1) + '" aria-readonly="true"></div>' : '') + '</div>';
    }
    /* the body as a list of keyed rows: a structure change redraws it, a value change redraws only its rows */
    function bodyItems(m) {
      var items = [], nav = [], ri = 2, di = 0, wn = m.w.n || m.c + 1, boDone = false, ln = 0;
      m.groups.forEach(function (g) {
        items.push({ key: 'd:' + g.day, html: dayHtml(m, g, ri++) });
        if (g.meet) return;
        /* team mode keys each line as the team's week does ("<week>.<day>.<i>"), so a page finds it by data-line */
        var d = di++;
        g.rows.forEach(function (r, li) {
          var row = m.b.rows[r], mb = !boDone && exParts(m, r).bo; if (mb) boDone = true;
          items.push({ key: 'r:' + row.key, html: lineHtml(m, r, ri++, mode === 'team' ? wn + '.' + d + '.' + li : '', { markBo: mb, n: ++ln }) }); nav.push({ key: row.key, r: r, day: g.day });
        });
        if (!m.lifted) { items.push({ key: 'a:' + g.day, html: addHtml(m, g, ri++) }); nav.push({ key: '+' + g.day, r: -1, day: g.day, add: true }); }
      });
      return { items: items, nav: nav, count: ri - 1 };
    }

    var lastLayout = '';
    function paint(force) {
      var m = model(); st.m = m;
      if (!m) { elHead.innerHTML = ''; elBody.innerHTML = ''; elShapeT.textContent = ''; elActs.innerHTML = ''; elAddr.textContent = ''; elSay.textContent = 'No week to show.'; return; }
      var L = layout(), sig = L.tpl + '|' + L.notes + '|' + st.density + '|' + st.last + '|' + m.c + '|' + mode;
      st.cols = L.cols; st.notes = L.notes; st.band = L.band; st.tempoIn = L.tempoIn;
      st.order = L.cols.slice(); if (L.notes === 'line') st.order.push('note');
      root.setAttribute('data-density', st.density); root.setAttribute('data-notes', L.notes);
      root.style.setProperty('--wg-cols', L.tpl);
      /* where the status line pins: the page's own offset (opts.top: under its week bar when its card scrolls), else under
         the toolbar band when the window scrolls */
      root.style.setProperty('--wg-top', opts.top || (document.querySelector('.tb') ? 'var(--edge-h)' : '0px'));
      /* the week's kind with its name when the engine answers it ("Week 4, Deload"); weekName stays "Week 4" */
      var wk = null; try { wk = typeof m.b.weekKind === 'function' ? m.b.weekKind(m.c) : null; } catch (e) { wk = null; }
      elGrid.setAttribute('aria-label', m.b.weekName(m.c) + (wk && typeof wk === 'string' ? ', ' + wk : '') + (m.lifted ? ', lifted' : ''));
      elGrid.setAttribute('aria-colcount', String(st.order.length));
      var hadFocus = root.contains(document.activeElement), ed = st.ed;
      var B0 = bodyItems(m);
      elGrid.setAttribute('aria-rowcount', String(B0.count));
      st.nav = B0.nav;
      var keys = B0.items.map(function (x) { return x.key; }).join('\n');
      if (force || sig !== lastLayout || keys !== st.seq.map(function (x) { return x.key; }).join('\n')) {
        elHead.innerHTML = headHtml(m);
        elBody.innerHTML = B0.items.map(function (x) { return x.html; }).join('');
      } else {
        elHead.innerHTML = headHtml(m);
        var kids = elBody.children;
        B0.items.forEach(function (x, i) {
          if (st.seq[i] && st.seq[i].html === x.html) return;
          var t = document.createElement('template'); t.innerHTML = x.html;
          if (kids[i]) elBody.replaceChild(t.content.firstChild, kids[i]); else elBody.appendChild(t.content.firstChild);
        });
      }
      lastLayout = sig; st.seq = B0.items;
      fitMarks();
      elDays.innerHTML = !m.lifted && mode !== 'team' ? '<button class="wg-addday add-row" type="button" data-add-day>Add a day</button>' : '';
      fixHand();
      paintSel();
      paintCut();
      if (ed && ed.input) reattach(ed);
      else if (hadFocus) focusHand();
      paintShape(m);
      paintStatus();
      watchPins();
    }

    /* the Last week column shows its mark word ("note", "1 short") only when the sets still fit beside it; one read pass,
       then one write pass, so the layout is read once */
    function fitMarks() {
      var cells = [].slice.call(elBody.querySelectorAll('.wg-k-last'));
      cells.forEach(function (c) { c.classList.remove('no-mark'); });
      var cut = cells.filter(function (c) { var ls = c.querySelector('.wg-ls'), lm = c.querySelector('.wg-lm'); return ls && lm && ls.scrollWidth > ls.clientWidth + 0.5; });
      var exs = [].slice.call(elBody.querySelectorAll('.wg-k-ex'));
      exs.forEach(function (c) { c.classList.remove('no-tp'); });
      var cutEx = exs.filter(function (c) { var t = c.querySelector('.wg-t'), tp = c.querySelector('.wg-tp'); return t && tp && t.scrollWidth > t.clientWidth + 0.5; });
      cut.forEach(function (c) { c.classList.add('no-mark'); });
      cutEx.forEach(function (c) { c.classList.add('no-tp'); });
    }

    /* ---------------- the cell in hand and the selection ---------------- */
    function navIdx(key) { for (var i = 0; i < st.nav.length; i++) if (st.nav[i].key === key) return i; return -1; }
    function colsFor(key) { return isAdd(key) ? ['ex'] : st.order; }
    function fixHand() {
      if (!st.nav.length) { st.hand = null; st.anchor = null; return; }
      if (!st.hand || navIdx(st.hand.key) < 0) {
        /* a week opens on a line with no load (first-time-coach §7.3: its words show at once, "1 of 2: …"), else on the
           first cell a rule changed, else on the first line's Load (programs.md §5.2) */
        var m = st.m, why = m && m.w.why || {}, lines = st.nav.filter(function (x) { return !x.add; });
        var nl = m && !m.lifted ? checksOf(m.c).filter(function (k) { return k.kind === 'noload'; }).map(function (k) { var row = m.b.rows[k.r]; return row ? row.key : null; }) : [];
        var empty = lines.filter(function (x) { return nl.indexOf(x.key) >= 0; })[0];
        var moved = lines.filter(function (x) { var y = why[x.key]; return y && y.field === 'load' && /^(rule|step|follow)$/.test(y.kind) && y.was !== y.now; })[0];
        var pick = empty || moved || lines[0] || st.nav[0];
        st.hand = { key: pick.key, col: isAdd(pick.key) ? 'ex' : empty && st.order.indexOf('effort') >= 0 ? 'effort' : (st.order.indexOf('load') >= 0 ? 'load' : 'ex') };
        st.anchor = null;
      }
      if (colsFor(st.hand.key).indexOf(st.hand.col) < 0) st.hand.col = colsFor(st.hand.key).indexOf(st.want) >= 0 ? st.want : colsFor(st.hand.key)[0];
      if (st.anchor && (navIdx(st.anchor.key) < 0 || isAdd(st.anchor.key) || isAdd(st.hand.key))) st.anchor = null;
    }
    function rowEl(key) { return isAdd(key) ? elBody.querySelector('[data-add-row="' + cssq(addDay(key)) + '"]') : elBody.querySelector('[data-row="' + cssq(key) + '"]'); }
    function cellEl(key, col) { var r = rowEl(key); return r ? r.querySelector('[role=gridcell][data-col="' + col + '"]') : null; }
    /* the selected rectangle: line rows between the anchor and the hand, columns between theirs */
    function rect() {
      if (!st.hand) return null;
      var a = st.anchor || st.hand, i0 = navIdx(a.key), i1 = navIdx(st.hand.key);
      if (i0 < 0 || i1 < 0) return null;
      var c0 = st.order.indexOf(a.col), c1 = st.order.indexOf(st.hand.col);
      if (c0 < 0 || c1 < 0) { c0 = c1 = Math.max(0, st.order.indexOf(st.hand.col)); }
      var rows = [];
      for (var i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) if (!st.nav[i].add) rows.push(st.nav[i]);
      if (isAdd(st.hand.key) && !st.anchor) rows = [st.nav[i1]];
      return { rows: rows, cols: st.order.slice(Math.min(c0, c1), Math.max(c0, c1) + 1), many: !!st.anchor && (i0 !== i1 || c0 !== c1) };
    }
    var selected = [];
    function paintSel() {
      selected.forEach(function (el) { el.removeAttribute('aria-selected'); el.classList.remove('is-hand', 'is-in'); });
      root.querySelectorAll('.wg-line.is-hand, .wg-add.is-hand').forEach(function (el) { el.classList.remove('is-hand'); });
      selected = [];
      var R = rect(); if (!R) { paintHandle(); return; }
      R.rows.forEach(function (x) { R.cols.forEach(function (k) { var el = cellEl(x.key, k); if (el) { el.setAttribute('aria-selected', 'true'); if (R.many) el.classList.add('is-in'); selected.push(el); } }); });
      var h = cellEl(st.hand.key, st.hand.col);
      if (h) { h.setAttribute('aria-selected', 'true'); h.classList.add('is-hand'); if (selected.indexOf(h) < 0) selected.push(h); }
      /* one tab stop: the cell in hand (Tab from the page lands there; arrows move inside the grid) */
      root.querySelectorAll('[role=gridcell][tabindex="0"]').forEach(function (x) { if (x !== h) x.setAttribute('tabindex', '-1'); });
      if (h) h.setAttribute('tabindex', '0');
      var re = rowEl(st.hand.key); if (re) re.classList.add('is-hand');
      root.querySelectorAll('.wg-line.is-whole').forEach(function (el) { el.classList.remove('is-whole'); });
      if (R.many && R.cols.length === st.order.length) R.rows.forEach(function (x) { var le = rowEl(x.key); if (le) le.classList.add('is-whole'); });
      paintHandle();
    }
    function focusHand(scroll) {
      var h = st.hand && cellEl(st.hand.key, st.hand.col); if (!h) return;
      if (document.activeElement !== h) h.focus({ preventScroll: true });
      if (scroll !== false) inView(h);
    }
    function inView(el) {
      var sc = scroller(), r = el.getBoundingClientRect(), top = 0, bot = W.innerHeight;
      if (sc) { var sr = sc.getBoundingClientRect(); top = sr.top; bot = sr.bottom; }
      var hd = elHead.getBoundingClientRect(); top = Math.max(top, hd.bottom + 8);
      var sh = elShape.getBoundingClientRect(); if (sh.top < bot && sh.bottom >= bot - 2) bot = sh.top - 8;
      var dy = r.top < top ? r.top - top : r.bottom > bot ? r.bottom - bot : 0;
      if (!dy) return;
      if (sc) sc.scrollTop += dy; else W.scrollBy(0, dy);
    }
    function setHand(key, col, o) {
      o = o || {};
      if (!key) return;
      var prevAdd = st.hand && isAdd(st.hand.key) && st.density === 'compact' && st.hand.key !== key;
      if (o.extend) { if (!st.anchor && !isAdd(st.hand.key)) st.anchor = { key: st.hand.key, col: st.hand.col }; }
      else st.anchor = null;
      if (o.extend && isAdd(key)) return;
      if (st.msg && (st.msg.key !== key || st.msg.col !== col)) st.msg = null;
      st.hand = { key: key, col: colsFor(key).indexOf(col) >= 0 ? col : colsFor(key)[0] };
      if (!o.keepWant) st.want = st.hand.col;
      if (!o.keepRun) st.run = null;
      if (prevAdd || (isAdd(key) && st.density === 'compact')) { paint(); }
      paintSel();
      focusHand(o.scroll);
      paintStatus();
      if (typeof opts.onSelect === 'function') { try { opts.onSelect(api.sel()); } catch (e) { /* the page's */ } }
    }
    /* moves: rows by the navigable list (a folded add row is passed over), columns by the visible order */
    function step(dr, dc, o) {
      o = o || {}; var h = st.hand; if (!h) return;
      if (dr) {
        var i = navIdx(h.key), j = i;
        do { j += dr; } while (j >= 0 && j < st.nav.length && (st.nav[j].add && (st.density === 'compact' || o.extend)));
        if (j < 0 || j >= st.nav.length) return;
        var col = st.nav[j].add ? 'ex' : (st.order.indexOf(st.want) >= 0 ? st.want : h.col);
        setHand(st.nav[j].key, col, { extend: o.extend, keepWant: true });
      } else if (dc) {
        var cs = colsFor(h.key), k = cs.indexOf(h.col) + dc;
        if (k < 0 || k >= cs.length) return;
        setHand(h.key, cs[k], { extend: o.extend });
      }
    }
    function editable(key, col) {
      if (isAdd(key)) return col === 'ex';
      var b = B(), r = rowAt(key); if (r < 0) return false;
      if (col === 'last') return false;
      if (mode === 'team' && col === 'load') return false;
      return !b.isRO(r, st.c);
    }
    /* Tab: the next cell that takes typing, row after row (Last week, lifted and started cells are passed over) */
    function tab(dir) {
      var h = st.hand; if (!h) return;
      var i = navIdx(h.key), cs = colsFor(h.key), k = cs.indexOf(h.col);
      for (var guard = 0; guard < 400; guard++) {
        k += dir;
        if (k < 0 || k >= cs.length) {
          i += dir; if (i < 0 || i >= st.nav.length) return;
          if (st.nav[i].add && st.density === 'compact') continue;
          cs = colsFor(st.nav[i].key); k = dir > 0 ? 0 : cs.length - 1;
        }
        var key = st.nav[i].key;
        if (editable(key, cs[k])) { var run = st.run || h.col; setHand(key, cs[k], { keepRun: true }); st.run = run; return; }
      }
    }

    /* ---------------- the status line (programs.md §5.2): the cell in hand, in one line ---------------- */
    function addrOf(b, r, col) {
      var row = b.rows[r]; if (!row) return '';
      var lw = row.line ? (typeof b.lineLabel === 'function' ? b.lineLabel(r, st.c) : 'Back-offs') : '';
      var who = row.name + (row.line ? (lw === 'Back-offs' ? ', back-offs' : ', line ' + (row.line + 1)) : (row.lift && (col === 'load' || col === 'effort' || col === 'sets' || col === 'reps') ? ', top set' : ''));
      return who + (WORD[col] ? ', ' + WORD[col] : '');
    }
    function writtenText(x) { if (!x) return ''; var s = (x.n != null ? x.n : 1) + ' ' + TIMES + ' ' + (x.r != null ? x.r : '') + (x.rHi != null ? '-' + x.rHi : ''); if (x.rpe != null) s += ' @' + nf(x.rpe); if (x.pct != null) s += ' ' + nf(x.pct) + '%'; if (x.off) s += ' ' + MINUS + nf(x.off) + '%'; return s; }
    function lastSay(m, r) {
      var b = m.b, row = b.rows[r], lw = lastOf(m, r) || { state: 'none' }, src = m.lifted ? m.c : m.c - 1, x = src >= 0 ? b.raw(r, src) : null, l = lifter(), Pro = cap1(pronoun(l));
      if (lw.state === 'lifted' && st.last !== '3') {
        var lt = x && x.lifted, sets = (lt && lt.sets) || [], at = sets.filter(function (s) { return s.at; })[0], on = (lt && lt.on) || (at && String(at.at).slice(0, 10));
        var when = on ? dayShort(on) + (at && /T\d\d:\d\d/.test(at.at) ? ' ' + String(at.at).slice(11, 16) : '') : '';
        var noted = sets.filter(function (s) { return s.note || s.video; })[0], by = lt && (lt.by === 'coach' || sets.some(function (s) { return s.by === 'coach'; }));
        var said = (when ? when + ': ' : '') + lw.text + (by ? '. Logged by you.' : '. Wrote ' + writtenText(BL.cellOf(x)) + '.');
        if (noted && noted.note) return { say: said + ' ' + Pro + ' note: \u201c' + noted.note + '\u201d', acts: ['Open the note'] };
        if (noted && noted.video) return { say: said, acts: ['Watch the video'] };
        return { say: said, acts: by ? ['Change'] : [] };
      }
      if (lw.state === 'lifted') return { say: 'Last 3 weeks, top sets: ' + lw.text + (lw.felt ? ' ' + lw.felt : '') + '.', acts: [] };
      if (lw.state === 'tocome') return { say: 'Still to come, ' + (lw.on ? dayShort(lw.on) : 'this week') + '. The rules run once it is lifted.', acts: [] };
      if (lw.state === 'missed') return { say: 'Missed: nothing logged' + (lw.on ? ' ' + K.when(lw.on) : '') + '.', acts: typeof opts.onLogFor === 'function' ? ['Enter what ' + (pronoun(l) === 'her' ? 'she' : pronoun(l) === 'his' ? 'he' : 'they') + ' lifted'] : [] };
      if (lw.state === 'intake') return { say: typedByCoach(l) ? 'What you entered: ' + lw.text + '.' : cap1(pronoun(l)) + ' best from the intake: ' + lw.text + '.', acts: [] };
      if (lw.state === 'swapped') return { say: 'Swapped out that week.', acts: [] };
      return { say: row.line ? 'Nothing lifted on this line.' : 'Nothing lifted last week.', acts: [] };
    }
    function readBackSay(x, col) {
      if (!x) return 'Not this week. Type the sets to put it back.';
      var s = BL.readBack ? BL.readBack(x, null) : writtenText(x) + '.';
      if (x.rHi != null && col === 'reps') s = s.replace(/\.$/, '') + ': add load once every set hits ' + x.rHi + '.';
      return s;
    }
    function statusFor() {
      var m = st.m, h = st.hand; if (!m || !h) return { addr: '', say: m && !m.groups.length ? 'Empty. Type an exercise to add it.' : '', acts: [] };
      var b = m.b, R = rect();
      if (R && R.many) {
        var n = R.rows.length * R.cols.length, sets = 0, hard = 0;
        R.rows.forEach(function (x) { var row = b.rows[x.r], c = row && row.cells[m.uid]; if (!c || x.add) return; var k = c.n || 0; sets += k; if (isHard(b, x.r, m.c, c)) hard += k; });
        return { addr: plural(n, 'cell'), say: plural(sets, 'set') + ', ' + hard + ' hard', acts: [] };
      }
      if (isAdd(h.key)) return { addr: sentence(addDay(h.key)), say: m.groups.every(function (g) { return !g.rows.length; }) ? 'Empty. Type an exercise to add it.' : 'Type an exercise to add it.', acts: [] };
      var r = rowAt(h.key); if (r < 0) return { addr: '', say: '', acts: [] };
      var row = b.rows[r], col = h.col, f = COL[col] ? COL[col].field : col, x = row.cells[m.uid] || null, addr = addrOf(b, r, col);
      if (st.msg && st.msg.key === h.key && st.msg.col === col) return { addr: addr, say: st.msg.say, acts: st.msg.acts || [], warn: st.msg.warn };
      var bad = f && typeof b.badField === 'function' ? b.badField(r, m.c, f) : null;
      if (bad != null) { var ck = checksOf(m.c).filter(function (k) { return k.r === r && k.kind === 'unread' && (k.field === f || !k.field); })[0]; return { addr: addr, say: ck ? ck.words : 'Could not read \u201c' + bad + '\u201d.', acts: ['Clear'], warn: true }; }
      if (col === 'last') { var ls = lastSay(m, r); return { addr: addr, say: ls.say, acts: ls.acts }; }
      if (b.isRO(r, m.c)) return { addr: addr, say: 'Already lifted. Only weeks still to come can change.', acts: [] };
      var chk = checksOf(m.c).filter(function (k) { return k.r === r; });
      /* one check at a time, "1 of 2: …" (first-time-coach §7.3); its place among the checks of its kind (BLOCK.CHECK_GROUP) */
      var nth = function (k) { return k && k.of > 1 ? k.i + ' of ' + k.of + ': ' : ''; };
      var nl = chk.filter(function (k) { return k.kind === 'noload'; })[0];
      if (nl && /^(ex|sets|reps|effort|load)$/.test(col)) return { addr: addr, say: nth(nl) + nl.words, acts: [], warn: true };
      var was = changedFields(m, r);
      if (f && was[f] != null) return { addr: addr, say: 'Changed after you sent it: was ' + (was[f] || 'empty') + '.', acts: [] };
      if (col === 'ex') {
        var rc = chk.filter(function (k) { return /^(limit|missed|after-meet|pain)$/.test(k.kind); })[0];
        if (rc) return { addr: addr, say: nth(rc) + rc.words, acts: rc.fixes || [] };
        if (m.w.out && m.w.out[row.key]) return { addr: addr, say: 'Not this week.', acts: ['Put it back'] };
        var pg = (BL.PROGS || []).filter(function (p) { return p.id === row.prog; })[0];
        return { addr: addr, say: 'Each week: ' + (pg ? low1(pg.label).replace(/ a week$/, '').replace(/ every week$/, '') : 'same') + '. Your rules adjust it.', acts: ['Change'] };
      }
      if (col === 'note') {
        var own = x && x.note, ex = row.line ? row.name.toLowerCase() + ' back-offs' : row.name.toLowerCase();
        if (!own && row.note) return { addr: addr, say: 'Standing cue, shown every week until week ' + (m.w.n || m.c + 1) + ' has its own.', acts: [] };
        return { addr: addr, say: (own ? 'Shown' : 'A note here shows') + ' to ' + first() + ' under ' + ex + ' in week ' + (m.w.n || m.c + 1) + '.', acts: [] };
      }
      if (col === 'load') {
        if (mode === 'team') return { addr: addr, say: 'Each lifter\u2019s own load, from their max.', acts: [] };
        var lc = chk.filter(function (k) { return /^(light|heavy|jump|flat|pain)$/.test(k.kind); })[0];
        /* a load typed lighter than its RPE is most often the coach's own choice: the check asks, plainly, and keeping it
           settles it (the first-time walk, Maya: "Romanian deadlift 70 kg" read as a mistake to undo) */
        if (lc && lc.kind === 'light' && x && isNum(x.w) && x.rpe != null && typeof b.loadFor === 'function') {
          var y0 = {}; for (var k0 in x) y0[k0] = x[k0]; delete y0.w; delete y0.wHi;
          var by0 = null; try { by0 = b.loadFor(r, m.c, y0); } catch (e) { by0 = null; }
          if (by0 && isNum(by0.kg) && by0.kg > x.w) return { addr: addr, say: nth(lc) + 'You wrote ' + nf(x.w) + ' kg; RPE ' + nf(x.rpe) + ' would be about ' + nf(by0.kg) + ' kg. Keep ' + nf(x.w) + '?', acts: ['Keep ' + nf(x.w), 'Let RPE set it'] };
        }
        if (lc) return { addr: addr, say: nth(lc) + lc.words, acts: lc.fixes || [], warn: lc.kind === 'pain' };
        /* spec C's words for a load (function-polish F3.3, P24): "105 kg: 10% under week 2’s 117.5 (deload)." */
        var why = typeof b.loadWords === 'function' ? b.loadWords(r, m.c) : typeof b.whyOf === 'function' ? b.whyOf(r, m.c) : { text: b.explain(r, m.c), acts: [] };
        return { addr: addr, say: why.text, acts: why.acts || [] };
      }
      if (col === 'tempo') return { addr: addr, say: tempoText(row, x) ? 'Tempo ' + tempoText(row, x) + '.' : 'Write a tempo like 3-1-0, or a pause like 2 s.', acts: [] };
      return { addr: addr, say: readBackSay(x, col), acts: [] };
    }
    function paintStatus() {
      if (st.dead) return;
      var s = statusFor();
      elAddr.textContent = s.addr || ''; elAddr.title = s.addr || '';
      elSay.textContent = s.say || ''; elSay.title = s.say || '';
      elSay.classList.toggle('is-warn', !!s.warn);
      /* 23 Nov, upgrade 2: the edit bar shows the cell in hand as it is written, and takes typing (Enter saves, Esc puts
         it back), as a spreadsheet's formula bar does */
      if (elFx && document.activeElement !== elFx) { var hh = st.hand, okFx = !!(hh && !isAdd(hh.key) && editable(hh.key, hh.col)); elFx.value = st.ed ? st.ed.input.value : hh && !isAdd(hh.key) && hh.col !== 'last' ? rawText(hh.key, hh.col) || '' : ''; elFx.readOnly = !okFx; elFx.classList.toggle('is-ro', !okFx); elFx.placeholder = !elFx.value && hh && !isAdd(hh.key) && hh.col !== 'last' ? (hh.col === 'load' ? 'Worked out from the RPE or %' : okFx ? 'Empty: type to fill it' : '') : '';   /* never an empty box beside the cell's name */ elFx.setAttribute('data-v', elFx.value); }
      var acts = (s.acts || []).filter(canAct).slice(0, 2);
      st.acts = acts;
      elActs.innerHTML = acts.map(function (a, i) { return '<button class="btn sm' + (i ? ' quiet' : '') + '" type="button" data-act="' + i + '">' + esc(a) + '</button>'; }).join('');
    }

    /* ---------------- writing ---------------- */
    function write(fn, how) {
      var out, ret;
      if (typeof opts.write === 'function') ret = opts.write(function (b) { out = fn(b); return out; }, how || {});
      else { var b = B(); out = b ? fn(b) : null; }
      return out !== undefined ? out : ret;
    }
    function after(res, o) {
      o = o || {};
      st.msg = null;
      if (res && res.error) {
        if (st.hand) st.msg = { key: st.hand.key, col: st.hand.col, say: res.error.message || 'That did not work.', warn: true };
      } else if (res && res.data) {
        var d = res.data;
        if (d.note && st.hand) st.msg = { key: st.hand.key, col: st.hand.col, say: d.note };
        if (d.follows && d.follows.length && d.text) toast(d.text, true);
      }
      paint();
      if (o.focus !== false) focusHand(true);
    }
    function toast(text, undoable) {
      if (!D || typeof D.toast !== 'function') return;
      D.toast(text, undoable ? function () { var r = api.undo(); return r && r.data && r.data.label ? { meta: { label: r.data.label } } : r; } : null);
    }
    /* team mode: the page says whose line the edit is (opts.onScope) before it lands */
    function scoped(info, go) {
      if (mode === 'team' && typeof opts.onScope === 'function') { opts.onScope(info, function (scope) { go(scope || 'team'); }); return; }
      go(null);
    }
    function setField(r, field, text, o) {
      o = o || {};
      var b = B(), row = b.rows[r]; if (!row) return;
      var key = row.key, c = st.c;
      var tr0 = mode === 'team' ? rowEl(key) : null, line = tr0 ? tr0.getAttribute('data-line') : null;
      scoped({ r: r, key: key, c: c, field: field, text: text, line: line }, function (scope) {
        var res = write(function (bb) {
          var rr = bb.rows[r] && bb.rows[r].key === key ? r : rowIdxIn(bb, key);
          if (rr < 0) return { error: { code: 'invalid', message: 'That line is gone.' } };
          var w = bb.weeks[c];
          if (w && w.out && w.out[key] && typeof bb.restoreLine === 'function') return batch(bb, 'Put ' + bb.rows[rr].name + ' back and write it', function () { bb.restoreLine(rr, c); return bb.setField(rr, c, field, text); });
          return bb.setField(rr, c, field, text);
        }, { kind: 'field', key: key, c: c, field: field, scope: scope, text: text, line: line });
        after(res, o);
      });
    }
    function rowIdxIn(b, key) { for (var i = 0; i < b.rows.length; i++) if (b.rows[i].key === key) return i; return -1; }

    /* ---------------- the editor: one field, read when the cell is left ---------------- */
    function rawText(key, col) {
      if (isAdd(key)) return '';
      var b = B(), r = rowAt(key); if (r < 0) return '';
      if (col === 'ex') return b.rows[r].name;
      var f = COL[col] ? COL[col].field : col;
      var bad = typeof b.badField === 'function' ? b.badField(r, st.c, f) : null; if (bad != null) return bad;
      if (col === 'note') { var x = b.rows[r].cells[b.weeks[st.c].uid]; return (x && x.note) || ''; }
      return b.fieldText(r, st.c, f, { ascii: true, words: true });
    }
    function openEditor(seed, how) {
      var h = st.hand; if (!h || st.ed) return false;
      if (!editable(h.key, h.col)) {
        if (h.col === 'last') return lastAct();
        var r = rowAt(h.key);
        st.msg = { key: h.key, col: h.col, say: mode === 'team' && h.col === 'load' ? 'Each lifter\u2019s own load, from their max.' : 'Already lifted. Only weeks still to come can change.' };
        paintStatus(); return false;
      }
      var cell = cellEl(h.key, h.col); if (!cell) return false;
      var orig = rawText(h.key, h.col), input = document.createElement('input');
      input.className = 'wg-in'; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = h.col === 'note';
      input.setAttribute('aria-label', (isAdd(h.key) ? 'Add an exercise to ' + sentence(addDay(h.key)) : addrOf(B(), rowAt(h.key), h.col) || COL[h.col].head));
      if (COL[h.col] && COL[h.col].num) input.inputMode = h.col === 'load' || h.col === 'effort' ? 'decimal' : 'numeric';
      input.value = seed != null ? seed : orig;
      st.ed = { key: h.key, col: h.col, input: input, orig: orig, mode: how || (seed != null ? 'enter' : 'edit'), sug: null };
      cell.classList.add('is-editing');
      cell.appendChild(input);
      paintHandle();
      input.focus({ preventScroll: true });
      var n = input.value.length; try { input.setSelectionRange(n, n); } catch (e) { /* number keyboards */ }
      if (h.col === 'ex') suggest();
      return true;
    }
    function reattach(ed) {
      var cell = cellEl(ed.key, ed.col);
      if (!cell) { closeEditor(); return; }
      var s = ed.input.selectionStart, z = ed.input.selectionEnd;
      cell.classList.add('is-editing'); cell.appendChild(ed.input);
      ed.input.focus({ preventScroll: true }); try { ed.input.setSelectionRange(s, z); } catch (e) { /* fine */ }
    }
    function closeEditor() {
      var ed = st.ed; if (!ed) return null;
      st.ed = null; hideSug();
      var cell = ed.input.parentNode; if (cell) { cell.classList.remove('is-editing'); cell.removeChild(ed.input); }
      paintHandle();
      return ed;
    }
    function cancelEdit() { var ed = closeEditor(); if (ed) { focusHand(); paintStatus(); } }
    /* save what was typed, then move: 'down' (Enter, AutoReturn after a run of Tabs), 'up', 'next', 'prev', or nothing */
    function commit(move, o) {
      o = o || {};
      var ed = closeEditor(); if (!ed) { if (move) go(move); return; }
      var text = ed.input.value, key = ed.key, col = ed.col, pick = o.pick;
      if (col === 'ex' && pick) text = pick;
      if (isAdd(key)) {
        if (!words0(text)) { focusHand(); if (move) go(move); return; }
        addLine(addDay(key), words0(text), move);
        return;
      }
      if (text === ed.orig && !o.force) { focusHand(); if (move) go(move); return; }
      var r = rowAt(key);
      if (col === 'ex') { rename(r, text); if (move) go(move); return; }
      var fld = COL[col] ? COL[col].field : col;
      setField(r, fld, text, { focus: false });
      /* text the engine cannot read stays in its cell, marked, and the hand stays on it with the reason beside it: Enter
         never walks on past "heavy triple" in Reps (walk 2, Arjun; skills addendum: validate when the cell is left, the
         error beside the cell). Tab still moves on; the week's Send holds until it is fixed (send()). */
      var nb = B(), nr = rowAt(key), still = nb && nr >= 0 && typeof nb.badField === 'function' ? nb.badField(nr, st.c, fld) : null;
      if (still != null && (move === 'down' || move === 'up')) { setHand(key, col); return; }
      if (move) go(move); else focusHand();
    }
    function go(move) {
      if (move === 'down' || move === 'up') {
        var col = move === 'down' && st.run ? st.run : st.hand.col, i = navIdx(st.hand.key), j = i + (move === 'down' ? 1 : -1);
        st.run = null;
        if (j < 0 || j >= st.nav.length) { focusHand(); return; }
        var to = st.nav[j];
        setHand(to.key, to.add ? 'ex' : col);
      } else if (move === 'next' || move === 'prev') tab(move === 'next' ? 1 : -1);
    }
    /* a name typed in an add row: a new exercise, or a second line of the one above when the name is the same (§5.6) */
    function addLine(day, name, move) {
      var b = B(), lib = BL.libFind ? BL.libFind(name) : null, nm = lib ? lib.name : name;
      var above = -1; b.rows.forEach(function (row, r) { if (row.day === day && row.cells[b.weeks[st.c].uid] !== undefined) above = r; });
      if (above < 0) b.rows.forEach(function (row, r) { if (row.day === day) above = r; });
      var same = above >= 0 && b.rows[above].name.toLowerCase() === nm.toLowerCase();
      var go2 = function (lift) {
        var res = write(function (bb) {
          if (same) { var top = rowIdxIn(bb, b.rows[above].key); return bb.addLine(top); }
          var o = {}; if (lift !== undefined) o.lift = lift;
          var vr = variantOf(nm, lift); if (vr) o.variant = vr;
          return bb.addExercise(day, nm, o);
        }, { kind: 'add', day: day, name: nm });
        if (res && res.error) { after(res); return; }
        paint();
        var nb = B(), nr = res && res.data && isNum(res.data.r) ? res.data.r : -1, key = nr >= 0 && nb.rows[nr] ? nb.rows[nr].key : null;
        /* the new line's Sets is next; a Tab run that began in the add row returns Enter to the Exercise column */
        if (key) { setHand(key, 'sets'); st.run = move === 'next' ? 'ex' : null; }
        else focusHand();
      };
      if (same || lib || liftWord(nm)) { go2(lib ? lib.lift : undefined); return; }
      askLift(nm, go2);
    }
    function liftWord(nm) { var k = String(nm).toLowerCase(); return /squat/.test(k) ? 'squat' : /bench|pin press/.test(k) ? 'bench' : /deadlift|rdl|block pull|rack pull/.test(k) ? 'deadlift' : null; }
    function variantOf(nm, lift) {
      var L = lift || liftWord(nm), V = BL.VNAME && L ? BL.VNAME[L] : null; if (!V) return null;
      var k = String(nm).toLowerCase(); for (var v in V) if (V[v].toLowerCase() === k) return v;
      return null;
    }
    /* a name the library does not know asks once which lift it counts toward (Esc = None) */
    function askLift(nm, done) {
      var cell = st.hand && cellEl(st.hand.key, 'ex');
      if (!D || !D.menu || !cell) { done(null); return; }
      var settled = false, off = null;
      var finish = function (lift) { if (settled) return; settled = true; if (off) off(); done(lift); };
      D.menu.open(cell, [{ id: 'squat', label: 'Squat' }, { id: 'bench', label: 'Bench' }, { id: 'deadlift', label: 'Deadlift' }, { id: 'none', label: 'None' }],
        { title: 'Which lift does ' + nm + ' count toward?', run: function (id) { finish(id === 'none' ? null : id); } });
      /* closed without a pick (Esc, a click away): None; a pick lands first whatever order the events come in */
      off = D.on ? D.on('pop:closed', function () { setTimeout(function () { finish(null); }, 0); }) : null;
    }
    function rename(r, text) {
      var b = B(), row = b.rows[r], nm = words0(text); if (!row || !nm || nm === row.name) { focusHand(); return; }
      /* 22 Nov (the owner: "I'm not able to edit the lift if it's already been entered"): a typed name changes the exercise,
         not only its words. The lift it counts toward and its variant follow the name, and a line with lifted weeks is no
         longer refused: it changes from this week on and the lifted weeks keep the old exercise (block.js changeExercise).
         A name that says no lift asks once which lift it counts toward, as a new line does. */
      if (typeof b.changeExercise !== 'function') {
        var vr = row.lift ? variantOf(nm, row.lift) : null;
        after(write(function (bb) { var rr = rowIdxIn(bb, row.key); return vr ? bb.setVariant(rr, vr) : bb.renameRow(rr, nm); }, { kind: 'rename', key: row.key }));
        return;
      }
      var go = function (lift) {
        var o = {}; if (lift !== undefined) o.lift = lift;
        var res = write(function (bb) { return bb.changeExercise(rowIdxIn(bb, row.key), st.c, nm, o); }, { kind: 'rename', key: row.key });
        after(res);
        var nb = B(), nr = res && res.data && isNum(res.data.r) ? nb.rows[res.data.r] : null;
        if (nr && nr.key !== row.key) setHand(nr.key, 'ex');
        if (res && res.data && res.data.from != null && nr) { st.msg = { key: nr.key, col: 'ex', say: nr.name + ' from week ' + ((nb.weeks[res.data.from] || {}).n || res.data.from + 1) + ' on. The weeks already lifted keep ' + row.name.toLowerCase() + '.' }; paintStatus(); }
      };
      var lib = BL.libFind ? BL.libFind(nm) : null;
      if (lib || liftWord(nm)) go(lib ? lib.lift : undefined); else askLift(nm, go);
    }

    /* the suggestion list for an exercise name (§5.6): words that start with what was typed, the day's own lift first, then
       this lifter's other exercises, then the library; at most 6; ↑ ↓ move, Enter or Tab take, Esc closes and keeps the text */
    var sugEl = null;
    function suggest() {
      var ed = st.ed; if (!ed || ed.col !== 'ex') return;
      var q = words0(ed.input.value).toLowerCase();
      if (!q) { hideSug(); return; }
      var b = B(), day = isAdd(ed.key) ? addDay(ed.key) : (b.rows[rowAt(ed.key)] || {}).day, dayLift = null;
      b.rows.forEach(function (row) { if (!dayLift && row.day === day && row.lift && !row.line) dayLift = row.lift; });
      var own = [], seen = {}, add = function (n, lift, rank) { var k = n.toLowerCase(); if (seen[k]) return; seen[k] = 1; own.push({ name: n, lift: lift, rank: rank }); };
      b.rows.forEach(function (row) { add(row.name, row.lift, 1); });
      (BL.LIBRARY || []).forEach(function (e) { add(e.name, e.lift, 2); });
      /* 22 Nov: the library's own search finds the short names coaches type ("cgbp", "ssb", "bss") and words inside a name;
         those it adds come after the names the old rule found, so what was first stays first */
      var found = BL.libSearch ? BL.libSearch(q, { block: b, limit: 8 }) : [];
      var hits = own.filter(function (x) { var ws = x.name.toLowerCase().split(/[\s-]+/); return x.name.toLowerCase().indexOf(q) === 0 || ws.some(function (w) { return w.indexOf(q) === 0; }) || (q.indexOf(' ') > 0 && x.name.toLowerCase().indexOf(q) >= 0); });
      hits.sort(function (a, z) {
        var ea = a.name.toLowerCase() === q ? 0 : 1, ez = z.name.toLowerCase() === q ? 0 : 1; if (ea !== ez) return ea - ez;
        var la = a.lift && a.lift === dayLift ? 0 : 1, lz = z.lift && z.lift === dayLift ? 0 : 1; if (la !== lz) return la - lz;
        var pa = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1, pz = z.name.toLowerCase().indexOf(q) === 0 ? 0 : 1; if (pa !== pz) return pa - pz;
        return a.rank - z.rank || a.name.length - z.name.length;
      });
      found.forEach(function (e) { if (!hits.some(function (x) { return x.name.toLowerCase() === e.name.toLowerCase(); })) hits.push({ name: e.name, lift: e.lift, rank: 3 }); });
      hits = hits.slice(0, 8);
      if (!hits.length) { hideSug(); return; }
      ed.sug = { items: hits.map(function (x) { return x.name; }), i: 0 };
      if (!sugEl) {
        sugEl = document.createElement('div'); sugEl.className = 'wg-sug'; sugEl.setAttribute('role', 'listbox'); sugEl.setAttribute('data-layer', 'menu'); sugEl.id = 'wg-sug-' + Math.random().toString(36).slice(2, 8);
        if ('popover' in HTMLElement.prototype) sugEl.setAttribute('popover', 'manual');
        sugEl.addEventListener('mousedown', function (e) { e.preventDefault(); var o = e.target.closest('[role=option]'); if (o && st.ed) commit(st.ed.mode === 'enter' ? 'next' : null, { pick: o.getAttribute('data-name') }); });
        document.body.appendChild(sugEl);
      }
      sugEl.setAttribute('aria-label', 'Exercises');
      paintSug();
      var cell = ed.input.parentNode, rc = cell.getBoundingClientRect();
      if (sugEl.showPopover && !sugEl.matches(':popover-open')) { try { sugEl.showPopover(); } catch (e) { /* not in the document */ } }
      sugEl.hidden = false;
      sugEl.style.left = Math.round(rc.left) + 'px'; sugEl.style.top = Math.round(rc.bottom + 4) + 'px'; sugEl.style.minWidth = Math.round(Math.max(rc.width, 220)) + 'px';
      ed.input.setAttribute('aria-controls', sugEl.id); ed.input.setAttribute('aria-expanded', 'true'); ed.input.setAttribute('role', 'combobox');
    }
    function paintSug() {
      var ed = st.ed; if (!ed || !ed.sug || !sugEl) return;
      sugEl.innerHTML = ed.sug.items.map(function (n, i) { return '<div class="wg-opt' + (i === ed.sug.i ? ' is-hi' : '') + '" role="option" id="' + sugEl.id + '-' + i + '" aria-selected="' + (i === ed.sug.i) + '" data-name="' + attr(n) + '">' + esc(n) + '</div>'; }).join('');
      ed.input.setAttribute('aria-activedescendant', sugEl.id + '-' + ed.sug.i);
    }
    function hideSug() {
      if (st.ed) { st.ed.sug = null; st.ed.input.removeAttribute('aria-activedescendant'); st.ed.input.setAttribute('aria-expanded', 'false'); }
      if (sugEl) { if (sugEl.hidePopover && sugEl.matches(':popover-open')) { try { sugEl.hidePopover(); } catch (e) { /* closed */ } } sugEl.hidden = true; }
    }

    /* ---------------- fills, clears, the clipboard ---------------- */
    function cellsOf(R) { var out = []; R.rows.forEach(function (x) { R.cols.forEach(function (k) { out.push({ key: x.key, r: x.r, col: k }); }); }); return out; }
    function fillWith(text, R, label) {
      var b = B(), c = st.c, cells = cellsOf(R).filter(function (x) { return x.col !== 'ex' && x.col !== 'last' && editable(x.key, x.col); });
      if (!cells.length) return;
      var res = write(function (bb) {
        return batch(bb, label || ('Fill ' + plural(cells.length, 'cell')), function () {
          var bad = 0;
          cells.forEach(function (x) { var rr = rowIdxIn(bb, x.key); if (rr < 0) return; var a = bb.setField(rr, c, COL[x.col] ? COL[x.col].field : x.col, text); if (a && a.data && a.data.bad) bad++; });
          return { data: { cells: cells.length, bad: bad } };
        });
      }, { kind: 'fill', cells: cells.length });
      after(res);
    }
    function fillDown(R0) {
      var R = R0 || rect(); if (!R) return;
      var b = B(), c = st.c, rows = R.rows, single = rows.length === 1;
      if (single) { var i = navIdx(rows[0].key), j = i - 1; while (j >= 0 && st.nav[j].add) j--; if (j < 0) return; rows = [st.nav[j]].concat(rows); }
      var src = rows[0], cols = R.cols.filter(function (k) { return k !== 'ex' && k !== 'last'; }), n = 0;
      var res = write(function (bb) {
        return batch(bb, 'Fill down', function () {
          var sr = rowIdxIn(bb, src.key);
          cols.forEach(function (k) {
            var f = COL[k] ? COL[k].field : k, t = k === 'note' ? ((bb.rows[sr].cells[bb.weeks[c].uid] || {}).note || '') : bb.fieldText(sr, c, f, { ascii: true });
            rows.slice(1).forEach(function (x) { if (!editable(x.key, k)) return; var rr = rowIdxIn(bb, x.key); if (rr >= 0) { bb.setField(rr, c, f, t); n++; } });
          });
          return { data: { cells: n } };
        });
      }, { kind: 'fill-down' });
      after(res);
    }
    /* 23 Nov, upgrade 2: the fill handle dragged from two or more cells carries on what they set, as a spreadsheet does:
       a number that steps evenly (100, 102.5 → 105, 107.5; RPE 7, 7.5 → 8) goes on stepping; anything else repeats the
       cells in turn. One write, one Undo. */
    function fillOn(src, dst, cols0) {
      var c = st.c, n = 0, cols = cols0.filter(function (k) { return k !== 'ex' && k !== 'last'; });
      if (!dst.length || !cols.length) return;
      var num = function (t) { t = String(t == null ? '' : t).trim(); return /^-?\d+(?:\.\d+)?$/.test(t) ? Number(t) : null; };
      var res = write(function (bb) {
        return batch(bb, 'Fill', function () {
          cols.forEach(function (k) {
            var f = COL[k] ? COL[k].field : k;
            var vals = src.map(function (x) { var rr = rowIdxIn(bb, x.key); if (rr < 0) return ''; return k === 'note' ? ((bb.rows[rr].cells[bb.weeks[c].uid] || {}).note || '') : bb.fieldText(rr, c, f, { ascii: true }) || ''; });
            var ns = vals.map(num), step = null;
            if (k !== 'note' && ns.length > 1 && ns.every(function (v) { return v != null; })) { var d = Math.round((ns[1] - ns[0]) * 1000) / 1000; if (d && ns.every(function (v, i) { return !i || Math.abs(v - ns[i - 1] - d) < 1e-6; })) step = d; }
            dst.forEach(function (x, j) {
              if (!editable(x.key, k)) return; var rr = rowIdxIn(bb, x.key); if (rr < 0) return;
              var t = step != null ? nf(Math.round((ns[ns.length - 1] + step * (j + 1)) * 1000) / 1000) : vals[j % vals.length];
              bb.setField(rr, c, f, t); n++;
            });
          });
          return { data: { cells: n } };
        });
      }, { kind: 'fill-down' });
      after(res);
    }
    function clearSel() {
      var R = rect(); if (!R) return;
      /* whole lines: out of this week, said as such on the line (with the way back), never a bare named line */
      if (R.many && R.cols.length === st.order.length && typeof B().dropLine === 'function') {
        var keys = R.rows.map(function (x) { return x.key; }).filter(function (k) { var r0 = rowAt(k); return r0 >= 0 && editable(k, 'sets') && B().raw(r0, st.c); });
        if (keys.length) {
          var c1 = st.c, rs = write(function (bb) { return batch(bb, 'Take ' + plural(keys.length, 'line') + ' out of the week', function () { var err = null; keys.forEach(function (k) { if (err) return; var d = bb.dropLine(rowIdxIn(bb, k), c1); if (d && d.error) err = d; }); return err || { data: { lines: keys.length } }; }); }, { kind: 'clear', lines: keys.length });
          st.anchor = null; after(rs);
          if (!(rs && rs.error)) toast(plural(keys.length, 'line') + ' out of ' + low1(B().weekName(c1)) + '.', true);
          return;
        }
      }
      var c = st.c, cells = cellsOf(R).filter(function (x) { return x.col !== 'last' && editable(x.key, x.col); });
      if (!cells.length) { st.msg = st.hand ? { key: st.hand.key, col: st.hand.col, say: 'Already lifted. Only weeks still to come can change.' } : null; paintStatus(); return; }
      var res = write(function (bb) {
        return batch(bb, 'Clear ' + plural(cells.length, 'cell'), function () {
          cells.forEach(function (x) {
            var rr = rowIdxIn(bb, x.key); if (rr < 0) return;
            if (x.col === 'ex') { if (bb.raw(rr, c)) bb.clear({ r0: rr, c0: c, r1: rr, c1: c }); return; }
            bb.setField(rr, c, COL[x.col] ? COL[x.col].field : x.col, '');
          });
          return { data: { cells: cells.length } };
        });
      }, { kind: 'clear' });
      after(res);
    }
    function textAt(key, col) {
      var m = st.m, r = rowAt(key); if (!m || r < 0) return '';
      if (col === 'ex') return m.b.rows[r].name;
      if (col === 'last') { var lw = lastOf(m, r); return lw ? String(lw.text || '') + (lw.felt ? ' ' + lw.felt : '') : ''; }
      var v = fieldShown(m, r, col); return v.text || '';
    }
    function copySel(e, cut) {
      var R = rect(); if (!R) return false;
      var whole = R.cols.length === st.order.length && R.rows.length > 0;
      var cols = whole ? st.order.filter(function (k) { return k !== 'last'; }) : R.cols;
      if (whole && cols.indexOf('tempo') < 0) cols.splice(cols.indexOf('load') + 1, 0, 'tempo');
      var heads = cols.map(function (k) { return k === 'load' ? 'Load' : COL[k] ? COL[k].head : EXTRA[k] || k; });
      var rows = R.rows.map(function (x) { return cols.map(function (k) { var t = k === 'note' ? rawText(x.key, 'note') : k === 'tempo' ? fieldShown(st.m, rowAt(x.key), 'tempo').text : textAt(x.key, k); return String(t || '').replace(/[\t\n]+/g, ' '); }); });
      var all = whole ? [heads].concat(rows) : rows;
      var tsv = all.map(function (r) { return r.join('\t'); }).join('\n');
      e.clipboardData.setData('text/plain', tsv);
      e.clipboardData.setData('text/html', tableHtml(all, whole));
      if (whole) {
        var b = B(), c = st.c, lines = R.rows.map(function (x) {
          var r = rowAt(x.key), row = b.rows[r], cell = row.cells[b.weeks[c].uid] || null;
          return { name: row.name, lift: row.lift, variant: row.variant, line: row.line, typed: !!(cell && cell.w != null), fields: { sets: rawText(x.key, 'sets'), reps: rawText(x.key, 'reps'), effort: rawText(x.key, 'effort'), load: cell && cell.w != null ? rawText(x.key, 'load') : '', tempo: cell ? BL.fieldText(cell, 'tempo') : '', note: rawText(x.key, 'note') } };
        });
        try { e.clipboardData.setData('application/x-powa-rows', JSON.stringify({ v: 1, lines: lines })); } catch (er) { /* a browser that keeps only text */ }
      }
      e.preventDefault();
      if (cut && whole) cutLines(R); else if (cut) clearSel();
      return true;
    }
    /* 22 Nov (a cold review: "⇧Space ⌘X empties a line but leaves its shell, so a move is paste plus clean-up"): whole
       lines cut are a move waiting for its place, as in a sheet. They stay where they are, marked, until ⌘V puts them
       under the line in hand (the same lines, every week of theirs with them); Esc lets them go. Nothing is emptied. */
    function cutLines(R) {
      var keys = R.rows.map(function (x) { return x.key; }).filter(function (k) { return editable(k, 'sets'); });
      if (!keys.length) { flash('Lifted already. Only weeks still to come can change.'); return; }
      st.cut = { keys: keys, c: st.c }; paintCut();
      toast(plural(keys.length, 'line') + ' cut. ⌘V moves ' + (keys.length === 1 ? 'it' : 'them') + ' under the line in hand. Esc lets go.', false);
    }
    function paintCut() {
      root.querySelectorAll('.wg-line.is-cut').forEach(function (el) { el.classList.remove('is-cut'); });
      if (!st.cut || st.cut.c !== st.c) { st.cut = null; return; }
      st.cut.keys.forEach(function (k) { var el = rowEl(k); if (el) el.classList.add('is-cut'); });
    }
    /* the cut lines land under the line in hand: each exercise once, with all its lines, in the order they stood */
    function moveCut() {
      var cut = st.cut, b = B(); st.cut = null;
      var handKey = st.hand && !isAdd(st.hand.key) ? st.hand.key : null, handRow = handKey ? b.rows[rowAt(handKey)] : null;
      var day = handRow ? handRow.day : st.hand ? addDay(st.hand.key) : null; if (!day) { paintCut(); return; }
      var tops = [], seen = {}; cut.keys.forEach(function (k) { var row = b.rows[rowAt(k)]; if (!row) return; var id = row.day + '|' + row.ex; if (seen[id]) return; seen[id] = 1; tops.push(k); });
      if (handRow && tops.some(function (k) { var row = b.rows[rowAt(k)]; return row && row.day === handRow.day && row.ex === handRow.ex; })) { paintCut(); flash('Pick the line to put them under: one that is not being moved.'); return; }
      var res = write(function (bb) {
        return batch(bb, 'Move ' + plural(tops.length, 'line'), function () {
          var err = null, n = 0;
          tops.forEach(function (k) {
            if (err) return; var rr = rowIdxIn(bb, k); if (rr < 0) return;
            /* its place among the day's other exercises: right after the line in hand, then after the one before it */
            var hr = handKey ? bb.rows[rowIdxIn(bb, handKey)] : null, mine = bb.rows[rr], at = 1e9;
            if (hr) { var order = [], got = {}; bb.rows.forEach(function (y) { if (y.day !== day || got[y.ex] || (y.day === mine.day && y.ex === mine.ex)) return; got[y.ex] = 1; order.push(y.ex); }); at = order.indexOf(hr.ex) + 1 + n; }
            var d = bb.moveRowTo(rr, day, at); if (d && d.error) err = d; else n++;
          });
          return err || { data: { lines: n } };
        });
      }, { kind: 'move', lines: tops.length });
      after(res);
      if (!(res && res.error)) toast('Moved ' + plural(tops.length, 'line') + ' under ' + (handRow ? handRow.name.toLowerCase() : 'the day') + '.', true);
    }
    /* paste (§5.10): a header row maps columns by name and adds lines to the day of the cell in hand (a blank line or a
       line naming a day starts the next day); otherwise a rectangle lands cell by cell from the cell in hand */
    function pasteText(tsv, html, rowsJson) {
      if (!st.hand) return;
      if (st.cut && st.cut.c === st.c && rowsJson) { moveCut(); return; }   /* the lines cut here: a move, not a second copy */
      var rows = null, lines = null;
      if (rowsJson) { try { lines = JSON.parse(rowsJson).lines; } catch (e) { lines = null; } }
      if (!lines) {
        rows = tsv ? readTable(tsv) : htmlRows(html);
        if (!rows) return;
        rows = rows.map(function (r) { return (r || []).map(function (v) { return String(v == null ? '' : v).replace(/\u00a0/g, ' ').trim(); }); });
        while (rows.length && !rows[rows.length - 1].some(Boolean)) rows.pop();
        if (!rows.length) return;
      }
      var map = rows ? headerOf(rows[0]) : null;
      if (lines || map) return pasteLines(lines, rows, map);
      return pasteRect(rows);
    }
    function headerOf(h) {
      var cols = {}, unknown = [], n = 0;
      h.forEach(function (t, i) {
        var k = String(t || '').toLowerCase().replace(/\s+/g, ' ').trim(); if (!k) return;
        var hit = HEAD.filter(function (x) { return x[1].test(k); })[0];
        if (hit) { if (cols[hit[0]] == null) { cols[hit[0]] = i; n++; } return; }
        var own = (opts.columns || []).filter(function (x) { return x && typeof x === 'object' && x.name && String(x.name).toLowerCase() === k; })[0];
        if (own) { cols['cx:' + own.name] = i; n++; return; }
        if (IGNORE.test(k)) return;
        unknown.push(String(t).trim());
      });
      if (cols.ex == null || n < 2) return null;
      return { cols: cols, unknown: unknown };
    }
    function pasteLines(lines, rows, map) {
      var m = st.m, b = B(), c = st.c, w = b.weeks[c];
      if (m.lifted) { flash('Lifted already. Change a week still to come.'); return; }
      var groups = m.groups.filter(function (g) { return !g.meet; }), handDay = isAdd(st.hand.key) ? addDay(st.hand.key) : (b.rows[rowAt(st.hand.key)] || {}).day;
      var gi = Math.max(0, groups.findIndex(function (g) { return g.names.indexOf(handDay) >= 0; }));
      var plan = [], cur = [], push = function () { if (cur.length) { plan.push(cur); cur = []; } };
      if (lines) lines.forEach(function (x) { cur.push({ name: x.name, lift: x.lift, variant: x.variant, line: x.line, f: x.fields || {} }); });
      else rows.slice(1).forEach(function (r) {
        var C = map.cols, ex = C.ex != null ? r[C.ex] || '' : '', has = Object.keys(C).some(function (k) { return k !== 'ex' && r[C[k]]; });
        if (!ex && !has) { push(); return; }
        if (ex && !has && DAYLINE.test(ex)) { push(); return; }
        if (!ex) return;
        var f = {}; ['sets', 'reps', 'effort', 'load', 'tempo', 'note'].forEach(function (k) { if (C[k] != null) f[k] = r[C[k]] || ''; });
        cur.push({ name: ex, f: f });
      });
      push();
      var nLines = plan.reduce(function (a, g) { return a + g.length; }, 0);
      if (!nLines) return;
      var bad = 0, made = [];
      /* the first day's lines land right under the exercise in hand (they used to go to the day's end) */
      var underKey = !isAdd(st.hand.key) ? st.hand.key : null;
      var res = write(function (bb) {
        return batch(bb, 'Paste ' + plural(nLines, 'line'), function () {
          var dayNames = groups.map(function (g) { return g.day; });
          var placeAt = -1;
          if (underKey && typeof bb.moveRowTo === 'function') { var ur = bb.rows[rowIdxIn(bb, underKey)]; if (ur) { var seen = {}, n0 = 0; bb.rows.forEach(function (y) { if (y.day !== ur.day || seen[y.ex]) return; seen[y.ex] = 1; n0++; if (y.ex === ur.ex) placeAt = n0; }); } }
          plan.forEach(function (g, k) {
            var di = gi + k, day = dayNames[di];
            if (!day) { var ad = bb.addDay(); day = ad && ad.data && ad.data.day; dayNames[di] = day; if (!day) return; }
            var prev = null;
            g.forEach(function (x) {
              var lib = BL.libFind ? BL.libFind(x.name) : null, nm = lib ? lib.name : words0(x.name), lift = x.lift !== undefined ? x.lift : lib ? lib.lift : liftWord(nm), ar;
              if (prev && prev.name.toLowerCase() === nm.toLowerCase()) ar = bb.addLine(rowIdxIn(bb, prev.key));
              else { var o = {}; if (lift) o.lift = lift; var vr = x.variant && x.variant !== 'Competition' ? x.variant : variantOf(nm, lift); if (vr) o.variant = vr; ar = bb.addExercise(day, nm, o); }
              if (!ar || ar.error || !ar.data) return;
              var rr = ar.data.r, key = bb.rows[rr].key;
              ['sets', 'reps', 'effort', 'load', 'tempo', 'note'].forEach(function (f) {
                var t = x.f[f]; if (t == null || t === '') return;
                var a = bb.setField(rowIdxIn(bb, key), c, f, String(t)); if (a && a.data && a.data.bad) bad++;
              });
              if (k === 0 && placeAt >= 0 && !(prev && prev.name.toLowerCase() === nm.toLowerCase())) { bb.moveRowTo(rowIdxIn(bb, key), day, placeAt); placeAt++; }
              prev = { name: nm, key: key }; made.push(key);
            });
          });
          return { data: { lines: made.length, bad: bad } };
        });
      }, { kind: 'paste', lines: nLines });
      if (res && res.error) { after(res); return; }
      paint();
      if (made.length) setHand(made[0], 'ex');
      var unk = map && map.unknown.length ? ' Not read: ' + map.unknown.join(', ') + '. Map them in Import a sheet.' : '';
      toast('Pasted ' + plural(made.length, 'line') + '.' + (bad ? ' ' + bad + ' could not be read: they are marked.' : '') + unk, true);
    }
    function pasteRect(rows) {
      var h = st.hand, i0 = navIdx(h.key), c0 = st.order.indexOf(h.col), c = st.c, todo = [], locked = 0, past = 0;
      /* into an add row: lines, read in a coach's sheet order (Exercise, Sets, Reps, RPE or %, Load, Tempo when there are
         seven columns, Notes) */
      if (isAdd(h.key)) {
        var wide = rows.reduce(function (a, r) { return Math.max(a, r.length); }, 0);
        var order = wide >= 7 ? ['ex', 'sets', 'reps', 'effort', 'load', 'tempo', 'note'] : ['ex', 'sets', 'reps', 'effort', 'load', 'note'];
        var cols = {}; order.forEach(function (k, i) { cols[k] = i; });
        return pasteLines(null, [order].concat(rows), { cols: cols, unknown: [] });
      }
      var navLines = st.nav.slice(i0).filter(function (x) { return !x.add; });
      rows.forEach(function (r, i) {
        var x = navLines[i]; if (!x) { past += r.filter(Boolean).length; return; }
        r.forEach(function (t, j) {
          var k = st.order[c0 + j]; if (!k) { past++; return; }
          if (k === 'last' || k === 'ex') return;
          if (!editable(x.key, k)) { locked++; return; }
          todo.push({ key: x.key, col: k, text: t });
        });
      });
      if (!todo.length) { if (locked) flash('Lifted already. Change a week still to come.'); return; }
      var bad = 0;
      var res = write(function (bb) {
        return batch(bb, 'Paste ' + plural(todo.length, 'cell'), function () {
          todo.forEach(function (x) { var rr = rowIdxIn(bb, x.key); if (rr < 0) return; var a = bb.setField(rr, c, COL[x.col] ? COL[x.col].field : x.col, x.text); if (a && a.data && a.data.bad) bad++; });
          return { data: { cells: todo.length, bad: bad } };
        });
      }, { kind: 'paste', cells: todo.length });
      after(res);
      if (res && res.error) return;
      toast('Pasted ' + plural(todo.length, 'cell') + '.' + (bad ? ' ' + bad + ' could not be read: they are marked.' : '') + (locked ? ' Lifted cells stay as they were.' : ''), true);
    }
    function flash(say, warn) { if (!st.hand) return; st.msg = { key: st.hand.key, col: st.hand.col, say: say, warn: warn !== false }; paintStatus(); }

    /* ---------------- the week's shape (programs.md §5.4): hard sets per lift (the week before in brackets), the top set ---------------- */
    function isHard(b, r, c, x) {
      var row = b.rows[r]; if (!row || !row.lift || !x) return false;
      var lt = x.lifted, rpe = lt && lt.felt != null ? lt.felt : x.rpe != null ? (x.rpeHi != null ? (x.rpe + x.rpeHi) / 2 : x.rpe) : null;
      if (rpe != null) return rpe >= 7;
      if (x.pct != null) return x.pct >= 75;
      var L = b.load(r, c, { paper: true }), mx = b.maxes && b.maxes[row.lift];
      return !!(L && L.kg != null && mx && L.kg / mx >= 0.75);
    }
    function shapeOf(b, c) {
      var w = b.weeks[c], out = { hard: {}, top: {} }; if (!w) return out;
      b.rows.forEach(function (row, r) {
        var x = row.cells[w.uid]; if (!x || !row.lift) return;
        if (isHard(b, r, c, x)) out.hard[row.lift] = (out.hard[row.lift] || 0) + (x.n || 1);
        else if (out.hard[row.lift] == null) out.hard[row.lift] = 0;
        if (!row.line && (!row.variant || row.variant === 'Competition')) {
          var L = b.load(r, c, { paper: true }), mx = b.maxes && b.maxes[row.lift];
          if (L && L.kg != null && mx) { var s = Math.round(L.kg / mx * 100); if (out.top[row.lift] == null || s > out.top[row.lift]) out.top[row.lift] = s; }
        }
      });
      return out;
    }
    /* the store's own count of changes waiting on a sent week ("1 change to send"), read only; 0 when it says nothing */
    function storePending(b, c) {
      var P = W.PL, id = (opts.lifter && opts.lifter.id) || (b && b.id), w = b && b.weeks[c]; if (!P || !P.programs || typeof P.programs.weeks !== 'function' || !id || !w) return 0;
      try {
        var r = P.programs.weeks(id), list = r && !r.error ? r.data : null, n = isNum(w.n) ? w.n : c + 1;
        var q = (list || []).filter(function (x) { return x && x.n === n && (!x.block || x.block === 'current'); })[0], m = q && /^(\d+) changes? to send$/.exec(String(q.state || ''));
        return m ? Number(m[1]) : 0;
      } catch (e) { return 0; }
    }
    function paintShape(m) {
      var b = m.b, now = shapeOf(b, m.c), was = m.c > 0 ? shapeOf(b, m.c - 1) : null;
      var lifts = LIFTS.filter(function (L) { return now.hard[L] != null; });
      /* function-polish P28: the line stays; "Hard sets" and "Top set" carry their words' titles (F11 hardsets, topshare)
         and the first bracket says what it is, "(7 last week)" */
      /* 22 Nov, the redo: each lift is its name in its colour and its number, with the change from last week beside it
         (the line was one run of coloured words) */
      var delta = function (L) { if (!was || was.hard[L] == null) return ''; var d = now.hard[L] - was.hard[L]; return '<i title="' + attr(was.hard[L] + ' last week') + '">' + (d === 0 ? 'same' : (d > 0 ? '+' : '−') + Math.abs(d)) + '</i>'; };
      var hard = function () { return lifts.map(function (L) { return '<span class="ws-i" data-lift="' + L + '"><small>' + esc(L.charAt(0).toUpperCase() + L.slice(1)) + '</small><b>' + now.hard[L] + '</b>' + delta(L) + '</span>'; }).join(''); };
      var tops = LIFTS.filter(function (L) { return now.top[L] != null; }).map(function (L) { return '<span class="ws-i" data-lift="' + L + '"><small>' + esc(L.charAt(0).toUpperCase() + L.slice(1)) + '</small><b>' + now.top[L] + '%</b></span>'; }).join('');
      var lab = function (key, words) { var tt = termTitle(key); return '<span class="wg-sl" data-term="' + key + '"' + (tt ? ' title="' + attr(tt) + '"' : '') + '>' + esc(words) + '</span>'; };
      var shape = function () {
        elShapeT.innerHTML = '<span class="ws-g">' + lab('hardsets', 'Hard sets') + (hard() || '<span class="ws-i"><b>none</b></span>') + '</span>' + (tops ? '<span class="ws-g">' + lab('topshare', 'Top set, of max') + tops + '</span>' : '');
        elShapeT.title = 'Hard sets: ' + lifts.map(function (L) { return L + ' ' + now.hard[L] + (was && was.hard[L] != null ? ' (' + was.hard[L] + ' last week)' : ''); }).join(', ') + (tops ? '. Top set: ' + LIFTS.filter(function (L) { return now.top[L] != null; }).map(function (L) { return L + ' ' + now.top[L] + '%'; }).join(', ') : '');
      };
      shape(true); elShapeT.setAttribute('data-ellipsis', '');
      if (mode === 'lifter' && !m.lifted) {
        var sent = typeof b.isSent === 'function' && b.isSent(m.c), ch = typeof b.changes === 'function' ? b.changes(m.c) : { n: 0 };
        /* a change the store holds for this week that the grid's cells do not show (a team week changed after it went, a
           day moved) still waits: the Send says so and stays live, as the page's status line does (walk 2, Kofi: "1 change
           to send" over a disabled "Sent") */
        var nch = Math.max(ch.n || 0, storePending(b, m.c));
        var label = typeof opts.sendLabel === 'function' ? opts.sendLabel(m.c) : opts.sendLabel || (nch ? 'Send ' + plural(nch, 'change') + ' to ' + first() : 'Send ' + low1(b.weekName(m.c)) + ' to ' + first());
        var off = sent && !nch;
        elShapeA.innerHTML = '<button class="btn sm" type="button" data-wg-send' + (opts.sendPrimary ? ' data-primary' : '') + (off ? ' disabled title="Nothing changed since it was sent"' : ' title="' + attr(label) + ' (⌘⇧↵)"') + '>' + esc(off ? 'Sent' : label) + '</button>';
      } else elShapeA.innerHTML = '';
      /* a number is never cut: where "(7 last week)" does not fit (1280, a Send beside it), the brackets go short, "(7)" */
      if (was && elShapeT.scrollWidth > elShapeT.clientWidth + 1) shape(false);
    }

    /* ---------------- Send, checks, the Last week menu, status moves ---------------- */
    function send() {
      flushEdit();
      var b = B(), c = st.c, ck = checksOf(c).filter(function (k) { return k.kind === 'unread'; })[0];
      if (ck) {
        var row = b.rows[ck.r], col = ck.field ? (ck.field === 'note' ? 'note' : ck.field) : 'sets';
        if (row) { setHand(row.key, st.order.indexOf(col) >= 0 ? col : 'sets'); st.msg = { key: row.key, col: st.hand.col, say: 'Fix one cell first: ' + low1(b.weekName(c)) + ', ' + row.name.toLowerCase() + ', ' + (WORD[col] || col) + '.', acts: ['Clear'], warn: true }; paintStatus(); }
        return false;
      }
      /* no load, no send (first-time-coach §7.3): the first line with no load takes the hand, its words beside it */
      var nl = checksOf(c).filter(function (k) { return k.kind === 'noload'; })[0];
      if (nl && b.rows[nl.r]) { setHand(b.rows[nl.r].key, st.order.indexOf('effort') >= 0 ? 'effort' : 'sets'); return false; }
      if (typeof opts.onSend === 'function') opts.onSend();
      return true;
    }
    /* ⌘G and the page's "Check 2 lines first": o.kinds or o.group narrows the walk (function-polish F4 C1b: noload, limit) */
    function nextCheck(o) {
      o = o || {}; var list = checksOf(st.c);
      if (o.kinds) list = list.filter(function (k) { return o.kinds.indexOf(k.kind) >= 0; });
      if (o.group) list = list.filter(function (k) { return k.group === o.group; });
      if (!list.length) { flash('Nothing to check this week.', false); return; }
      var b = B(), i = st.hand ? navIdx(st.hand.key) : -1;
      var order = list.map(function (k) { var row = b.rows[k.r]; return row ? { k: k, i: navIdx(row.key) } : null; }).filter(function (x) { return x && x.i >= 0; }).sort(function (a, z) { return a.i - z.i; });
      if (!order.length) return;
      var nx = order.filter(function (x) { return x.i > i; })[0] || order[0], k = nx.k;
      var col = k.kind === 'unread' ? (k.field || 'sets') : k.kind === 'noload' ? 'effort' : /^(light|heavy|jump|flat|held|pain)$/.test(k.kind) ? 'load' : 'ex';
      setHand(b.rows[k.r].key, st.order.indexOf(col) >= 0 ? col : 'ex');
    }
    function lastMenu(btn) {
      var m = st.m; if (!m) return;
      var items = [{ id: 'last', label: 'Last week', checked: st.last === 'last' }, { id: '3', label: 'Last 3 weeks', checked: st.last === '3' }];
      var earlier = [];
      for (var k = 0; k < m.c - 1; k++) earlier.push({ id: 'w' + (m.b.weeks[k].n || k + 1), label: m.b.weekName(k), checked: st.last === 'w' + (m.b.weeks[k].n || k + 1) });
      if (earlier.length) items = items.concat([{ sep: true }], earlier);
      var pick = function (id) { st.last = id; store.set(KEY_LAST, id === 'last' ? null : id); paint(true); focusHand(false); };
      if (D && D.menu) D.menu.open(btn, items, { title: 'Show in this column', run: pick, label: 'Last week column' });
      else pick(st.last === 'last' ? '3' : 'last');
    }
    /* Enter on a Last week cell: a missed day offers "Enter what he lifted" (the page's form); a note or a video opens */
    function lastAct() {
      var m = st.m, h = st.hand; if (!m || !h || isAdd(h.key)) return false;
      var r = rowAt(h.key), lw = lastOf(m, r);
      if (lw && lw.state === 'missed' && typeof opts.onLogFor === 'function') { opts.onLogFor(r, m.c); return true; }
      if (lw && (lw.mark === 'note' || lw.mark === 'video') && typeof opts.onAct === 'function') { opts.onAct(lw.mark, { r: r, c: m.c }); return true; }
      return false;
    }
    function canAct(a) {
      if (/^(Let RPE set it|Clear|Take the cap off|Add 2\.5 a week|Use 1\.25 kg steps|Keep it|Put it back|Change)$/.test(a)) return true;
      if (/^(Back to|Use|Hold at|Keep) \d/.test(a) || /^Add the \d/.test(a) || a === 'Same as last week') return true;
      if (/^Enter what (he|she|they) lifted$/.test(a)) return typeof opts.onLogFor === 'function';
      return typeof opts.onAct === 'function';
    }
    function runAct(a) {
      var m = st.m, h = st.hand; if (!m || !h || isAdd(h.key)) return;
      var b = m.b, r = rowAt(h.key), row = b.rows[r], c = m.c, n;
      var y = m.w.why && m.w.why[row.key];
      if (a === 'Let RPE set it') return rpeSetsLift(r);
      if (a === 'Clear') { var cf = COL[h.col] ? COL[h.col].field : h.col, cx = row.cells[m.uid] || null; return setField(r, cf, cx ? BL.fieldText(cx, cf, { ascii: true }) : ''); }   /* the unread text goes; the cell stays as it was */
      if ((n = /^(?:Back to|Use|Hold at) (\d+(?:\.\d+)?)$/.exec(a))) return setField(r, 'load', n[1]);
      if ((n = /^Add the (\d+(?:\.\d+)?)$/.exec(a))) { var L = b.load(r, c).kg; return setField(r, 'load', String(Math.round(((L || 0) + Number(n[1])) * 100) / 100)); }
      if (a === 'Same as last week' && y && isNum(y.was)) return setField(r, 'load', String(y.was));
      if (a === 'Take the cap off') return after(write(function (bb) { return bb.uncap(c, { lift: row.lift, day: row.day }); }, { kind: 'uncap' }));
      if (a === 'Add 2.5 a week') return after(write(function (bb) { return bb.setProg(rowIdxIn(bb, row.key), 'kg2.5'); }, { kind: 'prog' }));
      if (a === 'Use 1.25 kg steps') return after(write(function (bb) { return bb.setStep(row.lift, 1.25); }, { kind: 'step' }));
      if (/^Keep \d/.test(a)) return after(write(function (bb) { return bb.keepCheck(rowIdxIn(bb, row.key), c, 'light'); }, { kind: 'keep' }));
      if (a === 'Keep it') { var ck = checksOf(c).filter(function (k) { return k.r === r && k.kind === 'limit'; })[0]; return after(write(function (bb) { return bb.keepCheck(rowIdxIn(bb, row.key), c, ck ? ck.kind : 'limit'); }, { kind: 'keep' })); }
      if (a === 'Put it back') return after(write(function (bb) { return bb.restoreLine(rowIdxIn(bb, row.key), c); }, { kind: 'restore' }));
      if (a === 'Change' && h.col === 'ex') return progMenu(r);
      if (/^Enter what (he|she|they) lifted$/.test(a) && typeof opts.onLogFor === 'function') return opts.onLogFor(r, c);
      if (typeof opts.onAct === 'function') opts.onAct(a, { r: r, c: c, key: row.key, col: h.col, lift: row.lift });
    }
    /* "Let RPE set it" works every line of that lift on that day out by its RPE, not only the line in hand: a second line
       left at the old load would sit heavier than the one before it, about @10 (walk 2, Nina: 90 x 5 @8 under a top set
       re-worked to 77.5). A line with no RPE, a lifted line or one already at its RPE's load stays as written. One write,
       one Undo; the status line says how many lines moved. */
    function rpeSetsLift(r) {
      var b = B(), c = st.c, row = b.rows[r]; if (!row) return;
      var top = row.line ? b.topRow(row) : row, w = b.weeks[c];
      var keys = b.rows.filter(function (x, i) {
        var t = x.line ? b.topRow(x) : x; if (t !== top || (w && w.out && w.out[x.key])) return false;
        if (i === r) return true;
        var cell = x.cells[w.uid]; if (!cell || cell.lifted || cell.rpe == null || cell.w == null || b.isRO(i, c)) return false;
        var y = {}; for (var k in cell) y[k] = cell[k]; delete y.w; delete y.wHi;
        var by = b.loadFor(i, c, y); return by && isNum(by.kg) && by.kg !== cell.w;
      }).map(function (x) { return x.key; });
      if (keys.length < 2 || mode === 'team') return setField(r, 'load', '');
      var res = write(function (bb) {
        return batch(bb, 'Let RPE set ' + row.name.toLowerCase() + ', ' + plural(keys.length, 'line'), function () {
          var n = 0;
          keys.forEach(function (k) { var rr = rowIdxIn(bb, k); if (rr < 0) return; var a = bb.setField(rr, c, 'load', ''); if (!(a && a.error)) n++; });
          return { data: { changed: n > 0, lines: n } };
        });
      }, { kind: 'rpe', key: row.key, c: c, rows: keys.length });
      after(res);
      if (res && !res.error && st.hand) { st.msg = { key: st.hand.key, col: st.hand.col, say: cap1(row.name.toLowerCase()) + ': ' + plural(keys.length, 'line') + ' set by RPE.' }; paintStatus(); }
    }
    function progMenu(r) {
      var b = B(), row = b.rows[r], cell = cellEl(row.key, 'ex'), R = rect();
      var rows = R && R.many ? R.rows.map(function (x) { return x.key; }) : [row.key];
      var items = (BL.PROGS || []).map(function (p) { return { id: p.id, label: p.label, checked: p.id === row.prog }; });
      var pick = function (id) {
        after(write(function (bb) { return batch(bb, 'How ' + (rows.length > 1 ? plural(rows.length, 'line') : row.name.toLowerCase()) + ' move each week', function () { rows.forEach(function (k) { var rr = rowIdxIn(bb, k); if (rr >= 0) bb.setProg(rr, id); }); return { data: { rows: rows.length } }; }); }, { kind: 'prog' }));
      };
      if (D && D.menu && cell) D.menu.open(cell, items, { title: 'Each week', run: pick, label: 'Each week' });
    }
    function flushEdit() { if (st.ed) { commit(null); return true; } return false; }

    /* ---------------- the fill handle: drag the selection's corner down to fill (as ⌘D) ---------------- */
    var handle = document.createElement('div'); handle.className = 'wg-handle'; handle.setAttribute('aria-hidden', 'true'); handle.setAttribute('data-handle', ''); handle.hidden = true;
    root.appendChild(handle);
    function paintHandle() {
      var R = rect();
      if (!R || st.ed || isAdd(st.hand.key) || st.m && st.m.lifted) { handle.hidden = true; return; }
      var lastRow = R.rows[R.rows.length - 1], lastCol = R.cols[R.cols.length - 1], el = lastRow && cellEl(lastRow.key, lastCol);
      if (!el || lastCol === 'ex' || lastCol === 'last') { handle.hidden = true; return; }
      var rb = root.getBoundingClientRect(), cb = el.getBoundingClientRect();
      handle.hidden = false;
      /* the handle sits inside the corner of the cell in hand, so it is never past the card's edge (function-polish P26) */
      handle.style.left = Math.round(cb.right - rb.left - 9) + 'px';
      handle.style.top = Math.round(cb.bottom - rb.top - 9) + 'px';
    }
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      var R = rect(); if (!R) return;
      handle.setPointerCapture(e.pointerId);
      st.fill = { from: R, to: R.rows[R.rows.length - 1].key };
      root.classList.add('is-filling');
    });
    handle.addEventListener('pointermove', function (e) {
      if (!st.fill) return;
      var el = document.elementFromPoint(e.clientX, e.clientY), row = el && el.closest && el.closest('.wg-line');
      if (!row || !root.contains(row)) return;
      var key = row.getAttribute('data-row'), i = navIdx(key), i0 = navIdx(st.fill.from.rows[0].key);
      if (i < i0) return;
      st.fill.to = key;
      root.querySelectorAll('.is-fillto').forEach(function (x) { x.classList.remove('is-fillto'); });
      for (var j = navIdx(st.fill.from.rows[st.fill.from.rows.length - 1].key) + 1; j <= i; j++) { var nv = st.nav[j]; if (nv.add) continue; st.fill.from.cols.forEach(function (k) { var ce = cellEl(nv.key, k); if (ce) ce.classList.add('is-fillto'); }); }
    });
    function endFill(e) {
      if (!st.fill) return;
      var f = st.fill; st.fill = null; root.classList.remove('is-filling');
      root.querySelectorAll('.is-fillto').forEach(function (x) { x.classList.remove('is-fillto'); });
      try { handle.releasePointerCapture(e.pointerId); } catch (er) { /* released */ }
      var i0 = navIdx(f.from.rows[0].key), i1 = navIdx(f.to);
      if (i1 <= navIdx(f.from.rows[f.from.rows.length - 1].key)) return;
      st.anchor = { key: f.from.rows[0].key, col: f.from.cols[0] };
      st.hand = { key: f.to, col: f.from.cols[f.from.cols.length - 1] };
      var all = st.nav.slice(i0, i1 + 1).filter(function (x) { return !x.add; });
      if (f.from.rows.length > 1) fillOn(f.from.rows, all.slice(f.from.rows.length), f.from.cols);
      else fillDown({ rows: all, cols: f.from.cols, many: true });
    }
    handle.addEventListener('pointerup', endFill);
    handle.addEventListener('pointercancel', endFill);

    /* ---------------- events ---------------- */
    function cellOfEvent(t) { var c = t && t.closest && t.closest('[role=gridcell]'); return c && elBody.contains(c) && !c.classList.contains('wg-fill') ? c : null; }
    /* the add row's filler (the room right of "Add an exercise") is part of that row: a click there takes its Exercise
       cell in hand, so the grid keeps the focus and what is typed next goes into the new line */
    function addExOf(t) { var f = t && t.closest && t.closest('.wg-fill'); var tr = f && elBody.contains(f) ? f.closest('[data-add-row]') : null; return tr ? tr.querySelector('.wg-k-ex[data-col]') : null; }
    function keyOfCell(cell) { var tr = cell.closest('.wg-tr'); if (!tr) return null; if (tr.hasAttribute('data-add-row')) return '+' + tr.getAttribute('data-add-row'); return tr.getAttribute('data-row'); }
    /* a head's edge dragged sizes its column (the template follows the pointer; the rows are not redrawn until it is let go) */
    var colRz = null, lastRz = { k: null, t: 0 };
    function onRzMove(e) { if (!colRz) return; var wv = Math.max(36, Math.min(480, Math.round(colRz.w0 + e.clientX - colRz.x0))); colRz.w = wv; var parts = colRz.tpl.slice(); parts[colRz.i] = wv + 'px'; root.style.setProperty('--wg-cols', parts.join(' ')); }
    function onRzUp() { if (!colRz) return; var r0 = colRz; colRz = null; root.classList.remove('is-sizing'); document.removeEventListener('pointermove', onRzMove); document.removeEventListener('pointerup', onRzUp); if (isNum(r0.w) && r0.w !== r0.w0) { var pf = colPrefs(); pf.w[r0.k] = r0.w; saveColPrefs(pf); } paint(true); }
    root.addEventListener('pointerdown', function (e) {
      var h = e.target.closest && e.target.closest('[data-rz]'); if (!h || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); if (st.ed) commit(null);
      var k = h.getAttribute('data-rz'), i = st.cols.indexOf(k), cell = h.parentNode; if (i < 0) return;
      /* a second press on the same edge within a moment: the column goes back to its own width */
      if (lastRz.k === k && Date.now() - lastRz.t < 450) { lastRz = { k: null, t: 0 }; var pfd = colPrefs(); delete pfd.w[k]; saveColPrefs(pfd); paint(true); return; }
      lastRz = { k: k, t: Date.now() };
      colRz = { k: k, i: i, x0: e.clientX, w0: Math.round(cell.getBoundingClientRect().width), w: null, tpl: root.style.getPropertyValue('--wg-cols').match(/minmax\([^)]*\)|\S+/g) || [] };
      root.classList.add('is-sizing'); document.addEventListener('pointermove', onRzMove); document.addEventListener('pointerup', onRzUp);
    });
    function colsMenu(btn) {
      if (!D || !D.menu) return;
      var pf = colPrefs(), has = function (k) { return st.cols.indexOf(k) >= 0; }, items = [];
      if (mode !== 'team' && mode !== 'template') items.push({ id: 'last', label: 'Last week', checked: has('last') });
      items.push({ id: 'tempo', label: 'Tempo', checked: has('tempo') });
      items.push({ sep: true });
      items.push({ id: 'compact', label: 'Compact rows', checked: st.density === 'compact' });
      items.push({ id: 'reset', label: 'Put the columns back', disabled: !Object.keys(pf.w).length && !Object.keys(pf.hide).length && !Object.keys(pf.show).length });
      D.menu.open(btn, items, { title: 'Columns', label: 'Columns', run: function (id) {
        var p2 = colPrefs();
        if (id === 'reset') p2 = { w: {}, hide: {}, show: {} };
        else if (id === 'compact') { api.density(st.density === 'compact' ? 'standard' : 'compact'); return; }
        else if (has(id)) { p2.hide[id] = 1; delete p2.show[id]; } else { delete p2.hide[id]; p2.show[id] = 1; }
        saveColPrefs(p2); if (st.hand && st.cols.indexOf(st.hand.col) >= 0 && (id === st.hand.col)) st.hand.col = 'ex';
        paint(true);
      } });
    }
    /* whole lines, from the gutter or ⇧Space: every column of the line, from the line taken first to this one */
    function lineKeys() { return st.nav.filter(function (x) { return !x.add; }); }
    function selectCol(col, extend) {
      var ls = lineKeys(); if (!ls.length || st.order.indexOf(col) < 0) return;
      var from = extend && st.anchor ? st.anchor.col : extend && st.hand ? st.hand.col : col;
      st.anchor = { key: ls[0].key, col: from }; st.hand = { key: ls[ls.length - 1].key, col: col }; st.want = col;
      st.msg = null; paintSel(); focusHand(false); paintStatus();
    }
    /* a right-click on a column's head: what a spreadsheet offers there, seven at most */
    function colMenu(col, el) {
      if (!D || !D.menu) return;
      var pf = colPrefs(), hd = COL[col] ? COL[col].head : col, canWrite = col !== 'last' && col !== 'ex', items = [];
      items.push({ id: 'sel', label: 'Select the column' });
      if (canWrite) { items.push({ id: 'fill', label: 'Fill down from the first line' }); }
      if (col === 'last' || col === 'tempo') items.push({ id: 'hide', label: 'Hide the column' });
      if (pf.w[col]) items.push({ id: 'width', label: 'Put the width back' });
      if (canWrite) items.push({ sep: true }, { id: 'clear', label: 'Clear the column, this week', red: true });
      D.menu.open(el, items, { title: hd, label: hd + ' column', run: function (id) {
        if (id === 'sel') selectCol(col);
        else if (id === 'fill') { selectCol(col); var R = rect(); if (R && R.rows.length > 1) fillDown(R); }
        else if (id === 'clear') { selectCol(col); clearSel(); }
        else if (id === 'hide') { var p2 = colPrefs(); p2.hide[col] = 1; delete p2.show[col]; saveColPrefs(p2); paint(true); }
        else if (id === 'width') { var p3 = colPrefs(); delete p3.w[col]; saveColPrefs(p3); paint(true); }
      } });
    }
    function selectLines(key, extend) {
      if (!key || isAdd(key) || navIdx(key) < 0) return;
      var from = extend && st.hand && !isAdd(st.hand.key) ? (st.anchor || st.hand).key : key;
      st.anchor = { key: from, col: st.order[0] }; st.hand = { key: key, col: st.order[st.order.length - 1] };
      st.msg = null; paintSel(); focusHand(false); paintStatus();
    }
    root.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      var t = e.target;
      if (st.ed && t === st.ed.input) return;
      var gut = t.closest && t.closest('[data-gut]');
      if (gut && elBody.contains(gut)) { e.preventDefault(); if (st.ed) commit(null); var gk = gut.parentNode.getAttribute('data-row'); selectLines(gk, e.shiftKey); gutDrag = { key: st.anchor ? st.anchor.key : gk }; return; }
      /* 23 Nov, upgrade 2: a click on a column's head takes the whole column for the week (shift: the columns to it), as
         in a spreadsheet; the edge still sizes it and the Last week head keeps its own menu */
      var hc = t.closest && t.closest('.wg-h[data-col]');
      if (hc && root.contains(hc) && !t.closest('[data-rz], button')) { e.preventDefault(); if (st.ed) commit(null); selectCol(hc.getAttribute('data-col'), e.shiftKey); return; }
      if (t.closest('button, a, input, textarea')) return;
      var cell = cellOfEvent(t) || addExOf(t); if (!cell) return;
      e.preventDefault();
      var key = keyOfCell(cell), col = cell.getAttribute('data-col');
      if (st.ed) commit(null);
      setHand(key, col, { extend: e.shiftKey && !isAdd(key) });
      if (!isAdd(key)) drag = { key: st.anchor ? st.anchor.key : key, col: st.anchor ? st.anchor.col : col, moved: false };
    });
    /* a drag across cells selects the range under it (the cell where it started stays the anchor) */
    var drag = null, gutDrag = null;
    function onDragMove(e) {
      if (gutDrag) {
        if (!(e.buttons & 1)) { gutDrag = null; return; }
        var ge = document.elementFromPoint(e.clientX, e.clientY), gr = ge && ge.closest && ge.closest('.wg-line');
        if (gr && elBody.contains(gr) && st.hand && gr.getAttribute('data-row') !== st.hand.key) { st.anchor = { key: gutDrag.key, col: st.order[0] }; st.hand = { key: gr.getAttribute('data-row'), col: st.order[st.order.length - 1] }; paintSel(); paintStatus(); }
        return;
      }
      if (!drag || !(e.buttons & 1)) { drag = null; return; }
      var el = document.elementFromPoint(e.clientX, e.clientY), cell = el && cellOfEvent(el);
      if (!cell) return;
      var key = keyOfCell(cell), col = cell.getAttribute('data-col');
      if (isAdd(key) || (st.hand && st.hand.key === key && st.hand.col === col)) return;
      st.anchor = { key: drag.key, col: drag.col }; st.hand = { key: key, col: col }; drag.moved = true;
      paintSel(); paintStatus();
    }
    function onDragUp() { if (drag && drag.moved) focusHand(false); drag = null; gutDrag = null; }
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragUp);
    root.addEventListener('dblclick', function (e) {
      if (e.target.closest && e.target.closest('[data-rz]')) { e.preventDefault(); return; }   /* the edge's own second press put the column back */
      var cell = cellOfEvent(e.target) || addExOf(e.target); if (!cell || st.ed) return;
      e.preventDefault();
      setHand(keyOfCell(cell), cell.getAttribute('data-col'));
      openEditor(null, 'edit');
    });
    root.addEventListener('focusin', function (e) {
      var cell = cellOfEvent(e.target);
      if (!cell || (st.ed && e.target === st.ed.input)) return;
      var key = keyOfCell(cell), col = cell.getAttribute('data-col');
      if (!st.hand || st.hand.key !== key || st.hand.col !== col) { st.hand = { key: key, col: col }; st.anchor = null; st.want = col; paintSel(); paintStatus(); }
    });
    root.addEventListener('focusout', function (e) {
      var ed = st.ed; if (!ed || e.target !== ed.input) return;
      setTimeout(function () { if (st.ed === ed && document.activeElement !== ed.input && !(sugEl && sugEl.contains(document.activeElement))) commit(null); }, 0);
    });
    root.addEventListener('input', function (e) { if (st.ed && e.target === st.ed.input) { if (elFx) elFx.value = st.ed.input.value; if (st.ed.col === 'ex') suggest(); } });
    /* the edit bar: Enter (or Tab) writes what it holds into the cell in hand, Esc puts it back; the grid keeps the keys after */
    function fxCommit(move) {
      fxCancel = true;
      var h = st.hand; if (!h || isAdd(h.key) || !editable(h.key, h.col)) { focusHand(); return; }
      var v = elFx.value; if (v === (rawText(h.key, h.col) || '')) { focusHand(); if (move) go(move); return; }
      if (openEditor(v, 'enter')) commit(move || null, { force: true }); else focusHand();
    }
    /* the cell the bar was opened on: a click away writes into THAT cell (the click has already moved the hand), Esc
       cancels, as a spreadsheet's formula bar does */
    var fxHand = null, fxCancel = false;
    if (elFx) elFx.addEventListener('focus', function () { fxHand = st.hand && !isAdd(st.hand.key) ? { key: st.hand.key, col: st.hand.col } : null; fxCancel = false; });
    if (elFx) elFx.addEventListener('blur', function () {
      var h = fxHand, v = elFx.value; fxHand = null;
      if (fxCancel || !h || !editable(h.key, h.col) || v === (rawText(h.key, h.col) || '')) return;
      var r = rowAt(h.key); if (r < 0) return;
      if (h.col === 'ex') rename(r, v); else setField(r, COL[h.col] ? COL[h.col].field : h.col, v, { focus: false });
      paintStatus();
    });
    if (elFx) elFx.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); e.stopPropagation(); fxCommit(e.shiftKey ? 'up' : 'down'); }
      else if (e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); fxCommit(e.shiftKey ? 'prev' : 'next'); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fxCancel = true; elFx.blur(); focusHand(); paintStatus(); }
    });
    root.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-act]'))) { var a = st.acts[+b.getAttribute('data-act')]; if (a) runAct(a); return; }
      if ((b = t.closest('[data-last-menu]'))) { if (D && D.pop && D.pop.justClosed && D.pop.justClosed(b)) return; lastMenu(b); return; }
      if ((b = t.closest('[data-cols-menu]'))) { if (D && D.pop && D.pop.justClosed && D.pop.justClosed(b)) return; colsMenu(b); return; }
      if ((b = t.closest('[data-wg-send]'))) { send(); return; }
      if ((b = t.closest('[data-add-day]'))) { if (typeof opts.onAddDay === 'function') opts.onAddDay(); else after(write(function (bb) { return bb.addDay(); }, { kind: 'add-day' })); return; }
      if ((b = t.closest('[data-row-menu]'))) { var tr = b.closest('[data-row]'), r = rowAt(tr.getAttribute('data-row')); if (r >= 0) { setHand(tr.getAttribute('data-row'), st.hand && st.hand.key === tr.getAttribute('data-row') ? st.hand.col : 'ex', { scroll: false }); if (typeof opts.onRowMenu === 'function') opts.onRowMenu(r, b); } return; }
      if ((b = t.closest('[data-day-menu]'))) { var dr = b.closest('[data-day]'); if (dr && typeof opts.onDayMenu === 'function') opts.onDayMenu(dr.getAttribute('data-day'), b); return; }
      if ((b = t.closest('[data-day-name]'))) { renameDay(b); return; }
      if (mode === 'team' && typeof opts.onRowHead === 'function' && !st.ed && (b = t.closest('.wg-k-ex[data-col]')) && elBody.contains(b)) {
        var lr = b.closest('[data-row]'), ri0 = lr ? rowAt(lr.getAttribute('data-row')) : -1;
        if (ri0 >= 0) opts.onRowHead(ri0, b);
      }
    });
    root.addEventListener('contextmenu', function (e) {
      var hc0 = e.target.closest && e.target.closest('.wg-h[data-col]');
      if (hc0 && root.contains(hc0)) { e.preventDefault(); if (st.ed) commit(null); colMenu(hc0.getAttribute('data-col'), hc0); return; }
      var g0 = e.target.closest && e.target.closest('[data-gut]');
      if (g0 && elBody.contains(g0) && typeof opts.onRowMenu === 'function') { var gk0 = g0.parentNode.getAttribute('data-row'), gr0 = rowAt(gk0); if (gr0 >= 0) { e.preventDefault(); if (!(st.anchor && rect() && rect().rows.some(function (x) { return x.key === gk0; }))) selectLines(gk0, false); opts.onRowMenu(gr0, g0); } return; }
      var cell = cellOfEvent(e.target); if (!cell || typeof opts.onRowMenu !== 'function') return;
      var key = keyOfCell(cell); if (!key || isAdd(key)) return;
      e.preventDefault();
      setHand(key, cell.getAttribute('data-col'));
      opts.onRowMenu(rowAt(key), cell);
    });
    function renameDay(btn) {
      var dr = btn.closest('[data-day]'), day = dr && dr.getAttribute('data-day'); if (!day) return;
      var input = document.createElement('input'); input.className = 'wg-in wg-din'; input.value = btn.textContent; input.setAttribute('aria-label', 'Day name');
      btn.replaceWith(input); input.focus(); input.select();
      var done = false, fin = function (save) {
        if (done) return; done = true;
        var v = words0(input.value);
        if (save && v && v.toLowerCase() !== sentence(day).toLowerCase()) after(write(function (bb) { return bb.renameDay(day, v); }, { kind: 'rename-day' }));
        else paint(true);
      };
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fin(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fin(false); } });
      input.addEventListener('blur', function () { fin(true); });
    }
    ['copy', 'cut', 'paste'].forEach(function (type) {
      root.addEventListener(type, function (e) {
        if (st.ed && e.target === st.ed.input) return;
        if (!e.clipboardData) return;
        if (type === 'paste') { e.preventDefault(); pasteText(e.clipboardData.getData('text/plain'), e.clipboardData.getData('text/html'), e.clipboardData.getData('application/x-powa-rows')); }
        else copySel(e, type === 'cut');
      });
    });

    var tabPerWeek = function () { return !!(D && D.keysOpt && D.keysOpt.get('tabPerWeek')); };
    root.addEventListener('keydown', function (e) {
      if (e.isComposing || e.defaultPrevented) return;
      var k = e.key, meta = e.metaKey || e.ctrlKey, alt = e.altKey, shift = e.shiftKey;
      var inEditor = !!(st.ed && e.target === st.ed.input);
      /* the grid's keys belong to its cells and its editor; a button in it (the Last week head, a "…") keeps its own */
      if (!inEditor && (!elGrid.contains(e.target) || !e.target.closest('[role=gridcell]') || e.target.closest('button, input, a'))) return;
      var stop = function () { e.preventDefault(); e.stopPropagation(); };
      /* ---- editing: Enter, Tab, Esc, ⌘↵ and the suggestion list; every other key types ---- */
      if (st.ed && e.target === st.ed.input) {
        var ed = st.ed, sg = ed.sug;
        if (sg && (k === 'ArrowDown' || k === 'ArrowUp') && !meta && !alt) { stop(); sg.i = (sg.i + (k === 'ArrowDown' ? 1 : -1) + sg.items.length) % sg.items.length; paintSug(); return; }
        if (k === 'Escape') { stop(); if (sg) { hideSug(); return; } cancelEdit(); return; }
        if (k === 'Enter' && meta && !alt) { stop(); var R = rect(), text = ed.input.value; closeEditor(); if (R && R.many) fillWith(text, R); else commit(null, { force: true }); return; }
        if (k === 'Enter' && !alt) { stop(); commit(shift ? 'up' : 'down', { pick: sg ? sg.items[sg.i] : null }); return; }
        if (k === 'Tab') { stop(); commit(shift ? 'prev' : 'next', { pick: sg ? sg.items[sg.i] : null }); return; }
        if (ed.mode === 'enter' && !meta && !alt && !shift && /^Arrow(Up|Down|Left|Right)$/.test(k) && !sg) {
          stop(); var mv = k === 'ArrowUp' ? 'up' : k === 'ArrowDown' ? 'down' : null; commit(mv); if (k === 'ArrowLeft') step(0, -1); if (k === 'ArrowRight') step(0, 1); return;
        }
        if (ed.mode === 'edit' && (k === 'ArrowUp' || k === 'ArrowDown') && !meta && !alt && !sg) { stop(); commit(k === 'ArrowUp' ? 'up' : 'down'); return; }
        return;   /* typing, ⌘Z inside the field, ⌘A, caret keys */
      }
      if (st.ed) return;
      var h = st.hand; if (!h) return;
      /* 22 Nov: ⌥⇧↑ ⌥⇧↓ move the line in hand, as in Simple (a cold review: in Advanced they changed lifter) */
      if (alt && shift && !meta && (k === 'ArrowUp' || k === 'ArrowDown')) {
        stop(); if (isAdd(h.key)) return;
        var mk = h.key, mcol = h.col, mres = write(function (bb) { var rr = rowIdxIn(bb, mk); if (rr < 0) return { error: { code: 'invalid', message: 'That line is gone.' } }; return typeof bb.moveRow === 'function' ? bb.moveRow(rr, k === 'ArrowUp' ? 'up' : 'down') : { error: { code: 'invalid', message: 'Lines cannot move here.' } }; }, { kind: 'move', key: mk });
        after(mres); if (!(mres && mres.error) && navIdx(mk) >= 0) setHand(mk, mcol);
        return;
      }
      /* ---- the desk's moves ---- */
      if (alt && !meta && !shift && /^Arrow(Up|Down|Left|Right)$/.test(k)) {
        var vert = k === 'ArrowDown' || k === 'ArrowUp', dir = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1, swap = tabPerWeek();
        var lifterKey = swap ? !vert : vert;
        if (lifterKey) { if (mode === 'lifter' || mode === 'team' || typeof opts.onLifter !== 'function') return; stop(); opts.onLifter(dir); return; }
        if (typeof opts.onWeek !== 'function') return;
        stop(); opts.onWeek(dir); return;
      }
      if (meta && shift && k === 'Enter') { stop(); if (mode !== 'template') send(); return; }
      if (meta && !shift && !alt && k === 'Enter') { stop(); var R2 = rect(); if (R2 && R2.many) fillWith(rawText(h.key, h.col), R2); return; }
      if (meta && !alt && (k === 'z' || k === 'Z')) { stop(); if (shift) api.redo(); else api.undo(); return; }
      if (meta && !alt && !shift && (k === 'y' || k === 'Y')) { stop(); api.redo(); return; }
      if (meta && !alt && !shift && (k === 'd' || k === 'D')) { stop(); fillDown(); return; }
      if (meta && !alt && !shift && (k === 'g' || k === 'G')) { stop(); nextCheck(); return; }
      if (meta && !alt && !shift && (k === 'a' || k === 'A')) {
        stop(); var lines = st.nav.filter(function (x) { return !x.add; }); if (!lines.length) return;
        st.anchor = { key: lines[0].key, col: st.order[0] }; st.hand = { key: lines[lines.length - 1].key, col: st.order[st.order.length - 1] }; paintSel(); focusHand(false); paintStatus(); return;
      }
      if (meta && !alt && /^Arrow(Up|Down)$/.test(k)) {
        stop(); var ls = st.nav.filter(function (x) { return !x.add; }); if (!ls.length) return;
        var to = k === 'ArrowUp' ? ls[0] : ls[ls.length - 1]; setHand(to.key, h.col, { extend: shift }); return;
      }
      if (meta && !alt && /^Arrow(Left|Right)$/.test(k)) { stop(); var cs = colsFor(h.key); setHand(h.key, k === 'ArrowLeft' ? cs[0] : cs[cs.length - 1], { extend: shift }); return; }
      if (meta) return;   /* ⌘C ⌘X ⌘V reach the clipboard events; ⌘K ⌘/ belong to the shell */
      if (alt) return;
      switch (k) {
        case 'ArrowUp': stop(); step(-1, 0, { extend: shift }); return;
        case 'ArrowDown': stop(); step(1, 0, { extend: shift }); return;
        case 'ArrowLeft': stop(); step(0, -1, { extend: shift }); return;
        case 'ArrowRight': stop(); step(0, 1, { extend: shift }); return;
        case 'Tab': stop(); tab(shift ? -1 : 1); return;
        case 'Home': stop(); setHand(h.key, colsFor(h.key)[0], { extend: shift }); return;
        case 'End': stop(); var ce = colsFor(h.key); setHand(h.key, ce[ce.length - 1], { extend: shift }); return;
        case 'PageDown': case 'PageUp': {
          stop(); var rh = (st.density === 'compact' ? 32 : 40), n = Math.max(1, Math.floor((W.innerHeight - 200) / rh)), i = navIdx(h.key), j = Math.max(0, Math.min(st.nav.length - 1, i + (k === 'PageDown' ? n : -n)));
          while (st.nav[j] && st.nav[j].add && j > 0) j += k === 'PageDown' ? -1 : 1;
          if (st.nav[j]) setHand(st.nav[j].key, st.nav[j].add ? 'ex' : h.col, { extend: shift }); return;
        }
        case 'Enter': stop(); if (shift) { step(-1, 0); return; } if (h.col === 'last') { lastAct(); return; } openEditor(null, 'edit'); return;
        case 'F2': stop(); openEditor(null, 'edit'); return;
        case 'Escape': if (st.cut) { stop(); st.cut = null; paintCut(); st.msg = null; paintStatus(); return; } if (st.anchor) { stop(); st.anchor = null; paintSel(); paintStatus(); } return;
        case 'Delete': case 'Backspace': stop(); clearSel(); return;
        case 'F10': if (shift && typeof opts.onRowMenu === 'function' && !isAdd(h.key)) { stop(); opts.onRowMenu(rowAt(h.key), cellEl(h.key, h.col)); } return;
        case 'ContextMenu': if (typeof opts.onRowMenu === 'function' && !isAdd(h.key)) { stop(); opts.onRowMenu(rowAt(h.key), cellEl(h.key, h.col)); } return;
        case ' ': if (shift) { stop(); selectLines(h.key, false); return; } break;
        default: break;
      }
      /* typing replaces the cell and starts editing */
      if (k.length === 1 && !e.ctrlKey) { e.preventDefault(); if (h.col === 'last') return; openEditor(k, 'enter'); }
    });

    /* the window changed: a new band redraws the columns */
    var rz = 0, onResize = function () { cancelAnimationFrame(rz); rz = requestAnimationFrame(function () { var L = layout(); if (L.tpl !== root.style.getPropertyValue('--wg-cols') || L.notes !== st.notes) paint(true); else paintHandle(); }); };
    W.addEventListener('resize', onResize);

    /* ---------------- the API ---------------- */
    var api = {
      el: root,
      render: function (o) { o = o || {}; if (isNum(o.c) && o.c !== st.c) { st.c = o.c; st.msg = null; st.anchor = null; } paint(!!o.force || isNum(o.c)); return api; },
      select: function (r, col, o) {
        o = o || {}; var key = typeof r === 'number' ? (B().rows[r] || {}).key : r;
        if (key && navIdx(key) < 0 && !isAdd(key)) { paint(); }
        if (!key || navIdx(key) < 0) return api;
        setHand(key, col || (st.hand && st.hand.col) || 'sets', { extend: !!o.extend, scroll: o.scroll });
        return api;
      },
      sel: function () {
        var R = rect(), h = st.hand; if (!h) return null;
        return { key: h.key, r: isAdd(h.key) ? -1 : rowAt(h.key), col: h.col, field: COL[h.col] ? COL[h.col].field : h.col, c: st.c, add: isAdd(h.key) ? addDay(h.key) : null, editing: !!st.ed,
          range: R ? { rows: R.rows.map(function (x) { return x.key; }), cols: R.cols.slice(), many: R.many } : null };
      },
      edit: function (seed) { if (st.ed) return api; openEditor(seed == null ? null : String(seed), seed == null ? 'edit' : 'enter'); return api; },
      focus: function (o) { focusHand(!(o && o.scroll === false)); return api; },
      flush: function () { return flushEdit(); },
      undo: function () {
        flushEdit();
        if (typeof opts.onUndo === 'function') { var u = opts.onUndo(); paint(); return u; }
        var res = write(function (b) { return b.undo(); }, { kind: 'undo', undo: true });
        after(res && res.error ? res : res, {}); return res;
      },
      redo: function () {
        flushEdit();
        if (typeof opts.onRedo === 'function') { var u = opts.onRedo(); paint(); return u; }
        var res = write(function (b) { return b.redo(); }, { kind: 'redo', redo: true });
        after(res); return res;
      },
      send: function () { return send(); },
      density: function (d) {
        if (d == null) return st.density; st.density = d === 'compact' ? 'compact' : 'standard'; store.set(KEY_DENSITY, st.density === 'compact' ? 'compact' : null); paint(true);
        if (typeof opts.onDensity === 'function') { try { opts.onDensity(st.density); } catch (e) { /* the page's */ } }
        return api;
      },
      lastMode: function (v) { if (v == null) return st.last; st.last = v === '3' || /^w\d+$/.test(v) ? v : 'last'; store.set(KEY_LAST, st.last === 'last' ? null : st.last); paint(true); return api; },
      checks: function (o) { var l = checksOf(st.c); if (o && o.kinds) l = l.filter(function (k) { return o.kinds.indexOf(k.kind) >= 0; }); if (o && o.group) l = l.filter(function (k) { return k.group === o.group; }); return l; },
      nextCheck: function (o) { nextCheck(o); return api; },
      /* where a one-time tip goes: under the column heads, in flow (first-time-coach §8.4) */
      tipSlot: function () { return elTip; },
      /* the page moved what the heads pin under (its week bar grew a line): the pinned edges are measured again */
      refit: function () { if (!st.dead) watchPins(); return api; },
      destroy: function () {
        st.dead = true; W.removeEventListener('resize', onResize);
        document.removeEventListener('mousemove', onDragMove); document.removeEventListener('mouseup', onDragUp);
        if (pinIO) pinIO.disconnect();
        if (sugEl && sugEl.parentNode) sugEl.parentNode.removeChild(sugEl);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
    paint(true);
    return api;
  };
})();
