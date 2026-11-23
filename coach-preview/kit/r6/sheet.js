/* kit/r6/sheet.js: window.SHEET, the Block view (programs.md §14.3, professional.md §8.6; once "the Sheet", r6/sheet-spec.md):
   one lifter's whole block on one grid, weeks across, for its shape (waves, deloads, the taper), multi-week moves and
   pasting a whole block. There is ONE writing surface (shared.md D17): a typed character, Enter or a double click on a
   cell hands that cell to the Week view (kit/r6/week.js) through opts.onOpenWeek(c, { r, key, field: 'sets', seed }),
   with the character kept as the seed; a week head's Enter does the same for that week at the row in hand. What only the
   Block view does stays here: selecting across weeks, copy and paste of a whole block, ⌘R fill right (the next week),
   ⌘D fill down, ⌘↵ fill the selection with the cell in hand, the week moves (the page's week menu) and the band.
   No lift dots, no glyph marks (a note or a video is the word), no ghost drafts: a proposal is the block the page hands
   over, its deltas shown after each load ("135 +2.5"); each week head says its name (with its kind: "Week 4, deload",
   a phase name "Strength 1") and one state word (shared.md §8). Keys: ⌘⇧↵ sends (held while a cell of the week holds
   text it cannot read), ⌥↓ ⌥↑ change lifter, no bare letter is a command.

   Loads after ../kit/data.js, ../kit/kit.js, ../kit/coach.js, kit/r6/store.js, kit/r6/block.js and kit/r6/desk.js. It
   reads block.js's model and writes only the block it is handed; the page saves it (PL.programs.save) after each write.

   THE ENGINE lives in kit/r6/block.js: the maths (BLOCK.math), the block's loads (the RTS chart, a variant's ratio, 2.5 kg
   steps, back-offs under the week's top set, a max pinned to a week), the cell language, the keys a program's sets carry,
   marks, drafts, what was sent and each week's one fact. So the Sheet, the Builder, the store and every page work a load
   out the same way. SHEET names the same reads for the page, over the block b it is given:
     SHEET.math · parse · text · gridText · readBack · cellOf · stepOf · rules · liftSets · working · offer · curve · factorOf
       (BLOCK's own) · loadOf(b, r, c, o) · loadFor · paperOf · lifted · markOf · writeCol · changes · isSent ·
       changed · badIn · weekFact · rebasePreview · weekStart · ctxFor · topRowOf · rawAt · put (the block's own reads)
     The Sheet's own words: band(b, lift, c) · cellHard · topText · why(b, sel, ctx) · liveWhy · addrOf · ruleText ·
       lineName · where · dayLabel · dayIso · wdOf · whenOf
     A cell keeps every key a set carries (block.js), so a page reads it straight from the block: row.cells[week uid].
   WRITES (each is one step back through the block's own undo, and the page saves each as one step of the store's
   history; a lifted cell refuses all but a note; text that cannot be read is kept as typed and marked, D9)
     set · answer · clear · paste · copy · fill · fillRight · fillDown · writeFrom · addWeek · insertWeek · deload ·
     undeload · note · rebase · swapFrom · saveExercise · removeExercise
   THE GRID: SHEET.grid(host, opts) draws the cell in hand and the grid into host, and owns the hands on it: selection,
   keys, editing, the clipboard (tab-separated text and an HTML table), the fill handle, the pinned week heads. */
(function () {
  'use strict';
  var W = window, K = W.K, BL = W.BLOCK;
  if (!K || !BL || !BL.math) throw new Error('kit/r6/sheet.js loads after kit/kit.js and kit/r6/block.js');
  if (W.SHEET && W.SHEET.__sheet) return;
  var S = W.SHEET = { __sheet: true };

  var LIFTS = ['squat', 'bench', 'deadlift'], MAIN = { squat: 1, bench: 1, deadlift: 1 }, STEP = BL.STEP, M = BL.math;
  var EN = '-', MINUS = '\u2212';   /* no en dash in visible text: a range reads 140-145; a delta below zero, \u22125 */
  var esc = K.esc, nf = BL.nf, x3 = BL.x3, cellOf = BL.cellOf;
  var isNum = function (v) { return typeof v === 'number' && isFinite(v); };
  var plural = function (k, w, ws) { return k + ' ' + (k === 1 ? w : (ws || w + 's')); };
  var cap1 = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  var low1 = function (s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); };
  var effReps = function (c) { return c.rHi != null ? (c.r + c.rHi) / 2 : c.r; };   /* a range counts at its middle */
  var effRpe = function (c) { return c.rpeHi != null ? (c.rpe + c.rpeHi) / 2 : c.rpe; };
  S.x3 = x3; S.nf = nf;
  /* the one dictionary (first-time-coach §8.1): PL.terms, else data.js's DEMO.terms. A week kind or the first Back-offs
     carries data-term and its title once on the block (function-polish F11) */
  function termOf(key) {
    var P = W.PL, t = null;
    try { if (P && P.terms && typeof P.terms.get === 'function') { var r = P.terms.get(key); t = r && r.data !== undefined ? r.data : r; } } catch (e) { t = null; }
    if (!t || !t.label) { var list = W.DEMO && W.DEMO.terms; t = Array.isArray(list) ? list.filter(function (x) { return x && x.key === key; })[0] || null : list && typeof list === 'object' ? list[key] || null : null; }
    return t && t.label ? t : null;
  }
  function termHtml(key, words) { var t = termOf(key); return '<span data-term="' + key + '"' + (t ? ' title="' + esc(t.label + ': ' + t.line) + '"' : '') + '>' + esc(words) + '</span>'; }
  /* a line's name on the Block view: "Back-offs" for a drop, as the Week view says it (shared.md §4.12, function-polish
     P26), read on the week to write, else on the first week that holds it */
  function backName(b, r) {
    var row = b.rows[r]; if (!row || !row.line) return row ? row.name : '';
    if (row.base === 'top' || /^back-offs$/i.test(row.label || '')) return 'Back-offs';
    if (typeof b.lineLabel === 'function') {
      var cw = b.writeCol(), cs = []; if (cw >= 0) cs.push(cw); b.weeks.forEach(function (w, c) { if (c !== cw && row.cells[w.uid]) cs.push(c); });
      for (var i = 0; i < cs.length; i++) if (row.cells[b.weeks[cs[i]].uid]) return b.lineLabel(r, cs[i]) === 'Back-offs' ? 'Back-offs' : row.name;
    }
    return row.name;
  }
  S.backName = backName;

  /* ================= the engine: block.js, named for the page ================= */
  S.math = M; S.cellOf = cellOf; S.text = BL.text; S.gridText = BL.gridText; S.readBack = BL.readBack; S.parse = BL.parse;
  S.stepOf = BL.stepOf; S.rules = BL.rules; S.factorOf = BL.factor;
  S.liftSets = BL.liftSets; S.working = M.working; S.offer = M.offer; S.curve = M.curve;
  function rowAt(b, r) { return b.rows[r] || null; }
  function uidAt(b, c) { return b.weeks[c] ? b.weeks[c].uid : null; }
  function rawAt(b, r, c) { return b.raw(r, c); }
  S.rawAt = rawAt;
  S.topRowOf = function (b, row) { return b.topRow(row); };
  S.loadOf = function (b, r, c, o) { return b.load(r, c, o); };
  S.loadFor = function (b, r, c, cell) { return b.loadFor(r, c, cell); };
  S.paperOf = function (b, r, c) { return b.paper(r, c); };
  S.markOf = function (b, r, c, ctx) { return b.mark(r, c, ctx); };
  S.writeCol = function (b) { return b.writeCol(); };
  S.changes = function (b, c) { return b.changes(c); };
  S.isSent = function (b, c) { return b.isSent(c); };
  S.changed = function (b, r, c) { return b.changed(r, c); };
  S.badIn = function (b, c) { return b.badIn(c); };
  S.weekFact = function (b, c, o) { return b.weekFact(c, o); };
  /* what a proposal or a rule moved on a line this week: { d, text: '+2.5' | '−5', kind, was, now } or null. Read from the
     week's why (block.js: BLOCK.propose and every rule write record it), so the cell shows the same number the status
     line explains */
  var MOVED = { rule: 1, step: 1, follow: 1, cap: 1, lighter: 1 };
  S.deltaOf = function (b, r, c) {
    var row = rowAt(b, r), w = b.weeks[c]; if (!row || !w || !w.why) return null;
    var y = w.why[row.key]; if (!y || !MOVED[y.kind] || !isNum(y.was) || !isNum(y.now)) return null;
    var d = Math.round((y.now - y.was) * 100) / 100; if (!d) return null;
    return { d: d, text: (d > 0 ? '+' : MINUS) + nf(Math.abs(d)), kind: y.kind, was: y.was, now: y.now };
  };
  /* a week head (programs.md §5.1, shared.md §8): its name with its kind ("Week 4, deload", "Strength 1", "Week after the
     Autumn Open") and exactly one state word. o: { meet (iso), sentAt(c), seenAt(c), weekState(c) (the store's word, which
     wins: PL.programs.weeks) }. moved: the lines a proposal or a rule moved, for the head's title ("4 changed from week 4") */
  S.weekHead = function (b, c, o) {
    o = o || {}; var w = b.weeks[c]; if (!w) return null;
    var name = typeof b.weekName === 'function' ? b.weekName(c) : 'Week ' + (w.n || c + 1), kind = '';
    var st0 = b.weekStart(c), meet = o.meet;
    /* spec C (first-time-coach §7.1): the week's kind, as the Week view's bar says it: "Week 4, Deload", "Week 9, Heavy" */
    if (typeof b.weekKind === 'function') kind = b.weekKind(c, { meet: meet }) || '';
    else if (w.deload && !w.label) kind = 'Deload';
    else if (meet && st0 && meet >= st0 && K.daysTo(meet) - K.daysTo(st0) < 7) kind = 'Meet week';
    var has = b.rows.some(function (row) { return row.cells[w.uid] || (row.bad && row.bad[w.uid] != null); }), state = '', strong = false;
    var given = typeof o.weekState === 'function' ? o.weekState(c) : null;
    if (given) state = typeof given === 'string' ? given : given.text || '';
    else if (w.state === 'lifted') state = 'Lifted';
    else if (w.state === 'now') state = 'This week';
    else if (w.held) { state = 'Held'; strong = true; }
    else if (!has) state = 'Not written';
    else {
      var ch = b.changes(c);
      if (ch.base && ch.n) { state = plural(ch.n, 'change') + ' to send'; strong = true; }
      else if (b.isSent(c)) {
        var at = o.sentAt ? o.sentAt(c) : w.sentAt || null, seen = o.seenAt ? o.seenAt(c) : null;
        state = at ? 'Sent ' + K.wd3(String(at).slice(0, 10)) : 'Sent';
        if (seen && /T\d\d:\d\d/.test(seen)) state += ', seen ' + seen.slice(11, 16);
      } else if (w.goesOut) state = 'Goes out ' + K.wd3(w.goesOut) + ' ' + Number(String(w.goesOut).slice(8, 10));
      else { state = 'Not sent'; strong = true; }
    }
    var moved = 0; b.rows.forEach(function (row, r) { if (S.deltaOf(b, r, c)) moved++; });
    var src = c > 0 && b.weeks[c - 1] ? (typeof b.weekName === 'function' ? b.weekName(c - 1) : 'week ' + b.weeks[c - 1].n) : '';
    return { name: name + (kind ? ', ' + kind : ''), base: name, kind: kind, state: state, strong: strong, moved: moved,
      movedText: moved ? moved + ' changed' + (src ? ' from ' + low1(src) : '') : '' };
  };
  S.rebasePreview = function (b, lift, kg, o) { return b.rebasePreview(lift, kg, o); };
  S.weekStart = function (b, c) { return b.weekStart(c); };
  S.ctxFor = function (b, r, c) { return b.ctxFor(r, c); };
  S.put = function (b, r, c, cell) { return b.put(r, c, cell); };      /* one cell, inside a b.commit() only */

  /* ================= dates ================= */
  S.dayIso = function (b, c, dayName) {
    var st = b.weekStart(c); if (!st) return null;
    var d = (b.days || []).filter(function (x) { return x.name === dayName; })[0], w0 = K.d(b.start).getDay();
    if (!d || d.wd == null) return null;
    return K.add(st, (d.wd - w0 + 7) % 7);
  };
  S.dayLabel = function (name) { return cap1(low1(String(name || '')).replace(/\s+day$/i, ' day')); };
  var WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  S.wdOf = function (b, dayName) { var d = (b.days || []).filter(function (x) { return x.name === dayName; })[0]; return d && d.wd != null ? WD[d.wd] : ''; };
  /* "Sun 10:41" within the last week, else "Sun 1 Nov" */
  function whenOf(iso, at) {
    if (!iso) return '';
    var ago = -K.daysTo(iso);
    if (ago >= 0 && ago < 6 && at && /T\d\d:\d\d/.test(at)) return K.wd3(iso) + ' ' + at.slice(11, 16);
    return K.wd3(iso) + ' ' + K.dm(iso);
  }
  S.whenOf = whenOf;

  /* ================= what was lifted (its mark is block.js's, §5.4) ================= */
  S.lifted = function (b, r, c) { var x = rawAt(b, r, c); return x && x.lifted ? x.lifted : null; };
  S.topText = function (lt) {
    var t = lt && lt.top; if (!t) return '';
    if (!t.w) return t.r + ' reps';
    return x3(nf(t.w), t.r) + (t.felt != null ? ' @' + nf(t.felt) : '');
  };

  /* ================= hard sets and the top set (the band, §5.5) ================= */
  function cellHard(b, r, c) {
    var row = rowAt(b, r), x = rawAt(b, r, c); if (!row || !x || !row.lift) return { sets: x ? x.n : 0, hard: 0 };
    if (x.lifted) { var ds = (x.lifted.sets || []).filter(function (s) { return !s.skipped; }); return { sets: ds.length, hard: ds.filter(function (s) { return s.rated && s.felt >= 7; }).length, lifted: true }; }
    var rpe = null;
    if (x.rpe != null) rpe = effRpe(x);
    else if (x.pct != null) rpe = M.rpeOfPct((x.pctHi != null ? (x.pct + x.pctHi) / 2 : x.pct) / 100, effReps(x));
    else { var L = b.load(r, c), mx = b.rowMax(row, uidAt(b, c)); if (L.kg != null && mx) rpe = M.rpeOfPct(L.kg * BL.factor(row) / mx, effReps(x)); }
    return { sets: x.n, hard: rpe != null && rpe >= 7 ? x.n : 0 };
  }
  S.cellHard = cellHard;
  S.band = function (b, lift, c) {
    var w = b.weeks[c]; if (!w) return null;
    var hard = 0, written = 0, lifted = 0, anyLifted = false, top = null, mx = b.maxes[lift];
    b.rows.forEach(function (row, r) {
      if (row.lift !== lift) return;
      var x = row.cells[w.uid] || null; if (!x) return;
      var h = cellHard(b, r, c); hard += h.hard;
      if (x.lifted) { anyLifted = true; lifted += h.hard; }
      var wx = cellOf(x), wr = 0;
      if (wx.rpe != null) wr = effRpe(wx) >= 7 ? wx.n : 0;
      else if (wx.pct != null) wr = M.rpeOfPct(wx.pct / 100, effReps(wx)) >= 7 ? wx.n : 0;
      else { var P = b.load(r, c, { paper: true }); if (P.kg != null && mx) wr = M.rpeOfPct(P.kg * BL.factor(row) / mx, effReps(wx)) >= 7 ? wx.n : 0; }
      written += wr;
      if (row.line === 0 || row.line == null) {
        var kg = x.lifted ? (x.lifted.top ? x.lifted.top.w : null) : b.load(r, c).kg, rm = b.rowMax(row, w.uid);
        if (kg && rm) { var share = kg * BL.factor(row) / rm; if (!top || share > top.share) top = { share: share, pct: Math.round(share * 100), kg: kg, mx: rm, lifted: !!x.lifted, r: r }; }
      }
    });
    return { lift: lift, hard: hard, written: written, lifted: lifted, anyLifted: anyLifted, top: top };
  };

  /* ================= writing a block: each write is one step back ================= */
  var LIFTED = 'Lifted already. Change a week that is still to come.';
  function refuse(code, message) { return { error: { code: code, message: message } }; }
  S.where = function (b, r, c) { var row = rowAt(b, r); return 'week ' + (b.weeks[c] ? b.weeks[c].n : c + 1) + ', ' + (row ? lineName(row) : '').toLowerCase(); };
  function lineName(row) { return row.line ? row.name + ' ' + (row.base === 'top' ? 'back-offs' : String(row.label || 'then').toLowerCase()) : row.name; }
  S.lineName = lineName;
  /* the load a cell gives the week after it: what was lifted, else what it works out to */
  function baseOf(b, r, c) { var x = rawAt(b, r, c); return x ? (x.lifted ? (x.lifted.top ? x.lifted.top.w : x.lifted.w) || null : b.load(r, c).kg) : null; }

  /* set: the text a coach typed. Unreadable text is kept as typed and marked (D9); a question waits for its answer */
  S.set = function (b, r, c, text, o) {
    o = o || {};
    var row = rowAt(b, r), w = b.weeks[c]; if (!row || !w) return refuse('invalid', 'There is no cell there.');
    if (b.isRO(r, c)) return refuse('locked', LIFTED);
    var ctx = b.ctxFor(r, c); ctx.step = o.step;
    var res = S.parse(text, ctx), raw = String(text == null ? '' : text).trim();
    var label = 'Write ' + S.where(b, r, c);
    if (res.ok && res.groups) {
      return b.commit(label, function () {
        var rs = this.lines(r, res.groups.length);
        res.groups.forEach(function (g, i) { this.put(rs[i], c, g); }, this);
        return { data: { r: r, c: c, lines: res.groups.length } };
      });
    }
    if (res.ok) return b.commit(label, function () { this.put(r, c, res.cell); if (row.ask && !res.cell) delete row.ask; return { data: { r: r, c: c, note: res.note || null } }; });
    /* kept as typed, marked, held back from Send until it reads or is cleared */
    return b.commit(label, function () {
      var u = w.uid; if (row.cells[u]) delete row.cells[u];
      row.bad = row.bad || {}; row.bad[u] = raw; w.sent = false;
      if (res.ask) { row.askq = row.askq || {}; row.askq[u] = res.ask; } else if (row.askq) delete row.askq[u];
      return { data: { r: r, c: c, bad: true, why: res.why, ask: res.ask || null } };
    });
  };
  /* the answer to "RPE 7, or 7 kg?": it writes the cell and sticks for the line */
  S.answer = function (b, r, c, which) {
    var row = rowAt(b, r), u = uidAt(b, c), q = row && row.askq && row.askq[u]; if (!q) return refuse('invalid', 'Nothing is waiting for an answer there.');
    var text = which === 'kg' ? q[1] : q[0];
    return b.commit('Write ' + S.where(b, r, c), function () { row.ask = which === 'kg' ? 'kg' : 'rpe'; delete row.askq[u]; var res = S.parse(text, this.ctxFor(r, c)); this.put(r, c, res.ok ? res.cell : null); return { data: { r: r, c: c } }; });
  };
  S.clear = function (b, rg) {
    var k = 0, ro = 0, r, c;
    for (r = rg.r0; r <= rg.r1; r++) for (c = rg.c0; c <= rg.c1; c++) { var row = rowAt(b, r), u = uidAt(b, c); if (!row || !u || !(row.cells[u] || (row.bad && row.bad[u] != null))) continue; if (b.isRO(r, c)) ro++; else k++; }
    if (!k) return ro ? refuse('locked', LIFTED) : { data: { cleared: 0, changed: false } };
    return b.commit('Clear ' + plural(k, 'cell'), function () { for (r = rg.r0; r <= rg.r1; r++) for (c = rg.c0; c <= rg.c1; c++) if (!this.isRO(r, c)) this.put(r, c, null); return { data: { cleared: k, locked: ro } }; });
  };
  /* tab-separated text from any grid: one value fills the range, a rectangle lands from the cell in hand; what cannot be
     read is kept as typed and marked (D9); lifted cells are left alone */
  /* ⌘↵: every selected cell takes the cell in hand's text (one step; lifted cells are left alone) */
  S.fillWith = function (b, rg, text) {
    var n = (rg.r1 - rg.r0 + 1) * (rg.c1 - rg.c0 + 1);
    if (!String(text == null ? '' : text).replace(/\s/g, '')) return S.clear(b, rg);
    return S.paste(b, rg, text, { label: 'Fill ' + plural(n, 'cell') + ' with ' + String(text).trim() });
  };
  S.paste = function (b, rg, tsv, po) {
    var t = String(tsv == null ? '' : tsv).replace(/\r\n?/g, '\n'); if (t.charAt(t.length - 1) === '\n') t = t.slice(0, -1);
    if (!t.replace(/\s/g, '')) return { data: { wrote: 0, changed: false } };
    var grid = t.split('\n').map(function (ln) { return ln.split('\t'); }), single = grid.length === 1 && grid[0].length === 1;
    var tally = { wrote: 0, locked: 0, bad: 0, past: 0, badText: '', r0: rg.r0, c0: rg.c0, r1: rg.r0, c1: rg.c0, cells: 0 };
    var one = function (self, rr, cc, raw) {
      if (rr >= self.rows.length || cc >= self.weeks.length) { if (BL.norm(raw)) tally.past++; return; }
      if (self.isRO(rr, cc)) { if (BL.norm(raw) || rawAt(self, rr, cc)) tally.locked++; return; }
      var row = self.rows[rr], u = self.weeks[cc].uid, res = S.parse(raw, self.ctxFor(rr, cc));
      if (res.ok) self.put(rr, cc, res.cell);                  /* several groups: the first, on this line */
      else { if (row.cells[u]) delete row.cells[u]; row.bad = row.bad || {}; row.bad[u] = String(raw).trim(); self.weeks[cc].sent = false; tally.bad++; tally.badText = tally.badText || String(raw).trim(); }
      tally.wrote++; tally.r1 = Math.max(tally.r1, rr); tally.c1 = Math.max(tally.c1, cc);
    };
    tally.cells = single ? (rg.r1 - rg.r0 + 1) * (rg.c1 - rg.c0 + 1) : grid.length * grid[0].length;
    return b.commit((po && po.label) || 'Paste ' + plural(tally.cells, 'cell'), function () {
      var r, c, self = this;
      if (single) { for (r = rg.r0; r <= rg.r1; r++) for (c = rg.c0; c <= rg.c1; c++) one(self, r, c, grid[0][0]); }
      else grid.forEach(function (ln, i) { ln.forEach(function (raw, j) { one(self, rg.r0 + i, rg.c0 + j, raw); }); });
      if (!tally.wrote && tally.locked) return refuse('locked', LIFTED);
      return { data: tally };
    });
  };
  S.copy = function (b, rg) {
    var out = [], html = [], r, c;
    for (r = rg.r0; r <= rg.r1; r++) {
      var ln = [], hl = [];
      for (c = rg.c0; c <= rg.c1; c++) { var row = rowAt(b, r), u = uidAt(b, c), x = row && u ? row.cells[u] || null : null, t = row && row.bad && row.bad[u] != null ? row.bad[u] : S.text(cellOf(x)); ln.push(t); hl.push('<td>' + esc(t) + '</td>'); }
      out.push(ln.join('\t')); html.push('<tr>' + hl.join('') + '</tr>');
    }
    return { tsv: out.join('\n'), html: '<table>' + html.join('') + '</table>' };
  };
  /* rows r0..r1: the cell in week cs written on through week ce, each line by its own fill rule (round 4's fill) */
  /* 22 Nov (a cold review: "drag a load across weeks to get 132.5, 135, 137.5"): the pace of a fill.
     - Two or more weeks picked before the drag set it: whatever climbs between the last two of them (the load, the RPE,
       the percent, the reps, the sets) carries on by the same step, as a sheet carries on a series.
     - One week alone follows the line's own Each-week rule; a squat, bench or deadlift line with typed kilos and no rule
       of its own takes the coach's own step for that lift (block.js stepCell). Anything else is copied. */
  var PACE = ['w', 'rpe', 'pct', 'r', 'n'], HI = { w: 'wHi', rpe: 'rpeHi', pct: 'pctHi', r: 'rHi', n: 'nHi' };
  function paceOf(b, r, ca, cb) {
    var x = cellOf(rawAt(b, r, ca)), y = cellOf(rawAt(b, r, cb)); if (!x || !y) return null;
    var d = {}; PACE.forEach(function (k) { if (isNum(x[k]) && isNum(y[k]) && x[k] !== y[k]) d[k] = y[k] - x[k]; });
    return d;
  }
  function paceCell(src, d, k) {
    var c = cellOf(src); if (!c) return c;
    Object.keys(d).forEach(function (key) {
      var lo = key === 'w' ? 0 : 1, hi = key === 'rpe' ? 10 : key === 'pct' ? 120 : Infinity, v = Math.max(lo, Math.min(hi, Math.round((c[key] + d[key] * k) * 100) / 100));
      if (isNum(c[HI[key]])) c[HI[key]] = Math.max(lo, Math.min(hi, Math.round((c[HI[key]] + (v - c[key])) * 100) / 100));
      c[key] = v;
    });
    return c;
  }
  function stepK(b, row, src, k, base) {
    if ((row.prog && row.prog !== 'same') || typeof b.stepCell !== 'function') return BL.stepOf(row, src, k, base);
    var c = src; for (var i = 0; i < k; i++) c = b.stepCell(row, c, base);
    return c;
  }
  S.fill = function (b, rg, cs, ce, o) {
    o = o || {};
    var tally = { wrote: 0, locked: 0 }, wn = function (c) { return b.weeks[c].n; };
    var label = cs + 1 === ce ? 'Fill week ' + wn(ce) + ' from week ' + wn(cs) : 'Fill weeks ' + wn(cs + 1) + ' to ' + wn(ce) + ' from week ' + wn(cs);
    return b.commit(label, function () {
      for (var r = rg.r0; r <= rg.r1; r++) {
        var row = this.rows[r], src = rawAt(this, r, cs), base = baseOf(this, r, cs);
        var pace = isNum(o.c0) && o.c0 < cs ? paceOf(this, r, cs - 1, cs) : null;
        for (var c = cs + 1; c <= ce; c++) { if (this.isRO(r, c)) { tally.locked++; continue; } this.put(r, c, !src ? null : pace ? paceCell(src, pace, c - cs) : stepK(this, row, src, c - cs, base)); tally.wrote++; }
      }
      if (!tally.wrote && tally.locked) return refuse('locked', LIFTED);
      return { data: tally };
    });
  };
  S.fillRight = function (b, rg) {
    if (rg.c0 === rg.c1) { if (rg.c0 === 0) return refuse('invalid', 'Nothing to the left to fill from.'); return S.fill(b, rg, rg.c0 - 1, rg.c0); }
    return S.fill(b, rg, rg.c0, rg.c1);
  };
  S.fillDown = function (b, rg) {
    var src = rg.r0, targets = [], r;
    if (rg.r0 === rg.r1) { if (rg.r0 === 0) return refuse('invalid', 'Nothing above to fill from.'); src = rg.r0 - 1; targets = [rg.r0]; }
    else for (r = rg.r0 + 1; r <= rg.r1; r++) targets.push(r);
    var tally = { wrote: 0, locked: 0 };
    return b.commit('Fill down from ' + lineName(b.rows[src]).toLowerCase(), function () {
      for (var c = rg.c0; c <= rg.c1; c++) {
        var s = rawAt(this, src, c);
        targets.forEach(function (t) { if (this.isRO(t, c)) { if (s || rawAt(this, t, c)) tally.locked++; return; } this.put(t, c, s ? cellOf(s) : null); tally.wrote++; }, this);
      }
      if (!tally.wrote && tally.locked) return refuse('locked', LIFTED);
      return { data: tally };
    });
  };
  /* week moves (M13) */
  S.writeFrom = function (b, c) {
    var w = b.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (c + 1) + '.');
    if (c === 0) return refuse('invalid', 'Week 1 has no week before it.');
    if (w.state === 'lifted') return refuse('locked', 'Week ' + w.n + ' was lifted. It stays as it was.');
    var prev = b.weeks[c - 1];
    return b.commit('Write week ' + w.n + ' from week ' + prev.n, function () {
      var n = 0;
      this.rows.forEach(function (row, r) {
        if (this.isRO(r, c)) return;
        var s = (prev.deload && prev.pre && prev.pre[row.key]) || row.cells[prev.uid] || null;
        var base = s ? (s.lifted ? (s.lifted.top ? s.lifted.top.w : s.lifted.w) || null : this.load(r, c - 1).kg) : null;
        if (this.put(r, c, s ? BL.stepOf(row, s, 1, base) : null)) n++;
      }, this);
      w.deload = false; w.pre = null;
      return { data: { wrote: n } };
    });
  };
  S.addWeek = function (b) {
    var C = b.weeks.length, last = b.weeks[C - 1];
    return b.commit('Add week ' + (C + 1), function () {
      var nw = this.newWeek(C + 1);
      this.weeks.push(nw);
      if (last) this.rows.forEach(function (row, r) {
        var s = (last.deload && last.pre && last.pre[row.key]) || row.cells[last.uid] || null;
        if (!s) return;
        var base = s.lifted ? (s.lifted.top ? s.lifted.top.w : s.lifted.w) || null : this.load(r, C - 1).kg;
        row.cells[nw.uid] = BL.stepOf(row, s, 1, base);
      }, this);
      return { data: { c: C } };
    });
  };
  S.insertWeek = function (b, c) {
    var w = b.weeks[c]; if (!w) return refuse('invalid', 'There is no week ' + (c + 1) + '.');
    if (w.state !== 'next') return refuse('locked', 'A week goes in before a week still to come.');
    return b.commit('Insert a week before week ' + w.n, function () {
      var nw = this.newWeek(0);
      this.weeks.splice(c, 0, nw); this.weeks.forEach(function (x, i) { x.n = i + 1; });
      return { data: { c: c } };
    });
  };
  /* one deload, the same in both views (D5): block.js's */
  S.deload = function (b, c) { return b.deload(c); };
  S.undeload = function (b, c) { return b.undeload(c); };
  /* a note on a set, the one write a lifted cell allows (D6); only the coach sees it */
  S.note = function (b, r, c, text) {
    var row = rowAt(b, r), u = uidAt(b, c); if (!row || !u) return refuse('invalid', 'There is no cell there.');
    var t = String(text == null ? '' : text).trim();
    return b.commit('Note on ' + S.where(b, r, c), function () { row.cn = row.cn || {}; if (t) row.cn[u] = t; else delete row.cn[u]; return { data: { r: r, c: c } }; });
  };
  /* a new max from the first week not sent (§6.5): sent weeks not lifted keep the max they were written from, unless asked */
  S.rebase = function (b, lift, kg, o) {
    o = o || {}; var was = b.maxes[lift];
    if (!MAIN[lift]) return refuse('invalid', 'A max is for the squat, the bench or the deadlift.');
    if (!(isNum(kg) && kg >= 20 && kg <= 600)) return refuse('invalid', 'A max from 20 to 600 kg, in 2.5 kg steps.');
    if (was === kg) return { data: { changed: false } };
    var pv = b.rebasePreview(lift, kg, o);
    return b.commit(K.LIFT[lift] + ' max ' + nf(kg) + ' from week ' + pv.n0, function () {
      var self = this;
      this.weeks.forEach(function (w, c) {
        if (w.state === 'lifted' || (o.withSent || !self.isSent(c))) return;
        self.rows.forEach(function (row) { if (row.lift !== lift || !row.cells[w.uid]) return; row.mx = row.mx || {}; if (row.mx[w.uid] == null) row.mx[w.uid] = was; });
      });
      this.maxes[lift] = kg;
      return { data: { lift: lift, kg: kg, moved: pv.moves.length, from: pv.n0 } };
    });
  };
  /* swap an exercise from week N on (M10): the old one keeps its weeks, the new one takes the rest */
  S.swapFrom = function (b, r, c, ex) {
    var row = rowAt(b, r), w = b.weeks[c]; if (!row || !w) return refuse('invalid', 'There is no line there.');
    if (w.state === 'lifted') return refuse('locked', 'Swap from a week still to come.');
    var lift = ex && MAIN[ex.lift] ? ex.lift : null, variant = lift ? ex.variant || 'Competition' : '', name = ex && ex.name ? ex.name : 'New exercise';
    return b.commit('Swap ' + row.name + ' for ' + name + ' from week ' + w.n, function () {
      var self = this, mine = [], at = -1, nex = this.maxEx() + 1;
      this.rows.forEach(function (x, i) { if (x.day === row.day && x.ex === row.ex) { mine.push(x); at = i; } });
      var adds = mine.map(function (x) {
        var nr = { key: row.day + '|' + name + '|n' + (++self.seq) + '|' + x.line, day: row.day, ex: nex, line: x.line, title: name, name: name, label: x.label, lift: lift, cat: lift || (ex && ex.lift) || null, variant: variant, note: '', pause: 0, tempo: '', prog: x.prog, base: x.base, cells: {} };
        self.weeks.forEach(function (wk, cc) { if (cc < c || !x.cells[wk.uid]) return; var ri = self.rows.indexOf(x); if (self.isRO(ri, cc)) return; nr.cells[wk.uid] = cellOf(x.cells[wk.uid]); delete x.cells[wk.uid]; wk.sent = false; });
        return nr;
      });
      Array.prototype.splice.apply(this.rows, [at + 1, 0].concat(adds));
      return { data: { r: at + 1 } };
    });
  };
  /* the exercise editor's Save: the lines of one exercise in one week, its name, variant, rule and note, as one step;
     with follow, the weeks after it step on from this one by its rule */
  S.saveExercise = function (b, o) {
    var label = o.label || 'Save ' + o.name;
    return b.commit(label, function () {
      var self = this, rs = [], c = o.c, w = this.weeks[c];
      if (o.r == null) {      /* a new exercise in a day */
        var at = this.insertAt(o.day), nex = this.maxEx() + 1;
        o.lines.forEach(function (ln, i) { self.rows.splice(at + i, 0, { key: o.day + '|' + o.name + '|n' + (++self.seq) + '|' + i, day: o.day, ex: nex, line: i, title: o.name, name: o.name, label: i ? 'Back-offs' : '', lift: o.lift || null, cat: o.lift || null, variant: o.variant || '', note: o.note || '', pause: 0, tempo: '', prog: o.prog || 'same', base: ln.off != null ? 'top' : undefined, cells: {} }); rs.push(at + i); });
      } else {
        var row0 = this.rows[o.r];
        this.rows.forEach(function (x, i) { if (x.day === row0.day && x.ex === row0.ex) rs.push(i); });
        while (rs.length < o.lines.length) rs = this.lines(o.r, rs.length + 1);
        rs.forEach(function (i) { var x = self.rows[i]; x.name = o.name; x.title = o.name; x.lift = o.lift || null; x.cat = o.lift || x.cat; x.variant = o.variant || ''; x.prog = o.prog || x.prog; x.note = o.note || ''; });
        /* lines taken out: their cell in this week goes (a line lifted in other weeks keeps those) */
        rs.slice(o.lines.length).forEach(function (i) { self.put(i, c, null); });
      }
      o.lines.forEach(function (ln, i) { var ri = rs[i]; if (ln.off != null) self.rows[ri].base = 'top'; self.put(ri, c, ln); });
      var moved = 0;
      if (o.follow) for (var cc = c + 1; cc < this.weeks.length; cc++) {
        o.lines.forEach(function (ln, i) { var ri = rs[i]; if (self.isRO(ri, cc)) return; var base = self.load(ri, c).kg; if (self.put(ri, cc, BL.stepOf(self.rows[ri], cellOf(self.rows[ri].cells[w.uid] || null), cc - c, base))) moved++; });
      }
      return { data: { r: rs[0], moved: moved } };
    });
  };
  S.removeExercise = function (b, r, c) {
    var row = rowAt(b, r), w = b.weeks[c]; if (!row || !w) return refuse('invalid', 'There is no line there.');
    if (b.isRO(r, c)) return refuse('locked', LIFTED);
    return b.commit('Take ' + row.name + ' out of week ' + w.n, function () { var self = this; this.rows.forEach(function (x, i) { if (x.day === row.day && x.ex === row.ex) self.put(i, c, null); }); return { data: { r: r } }; });
  };

  /* ================= the cell in hand: the line's name and rule, one sentence, at most two buttons (§5.1) ================= */
  var RULE = { same: 'same each week', 'kg2.5': 'up 2.5 a week', kg5: 'up 5 a week', 'rpe0.5': 'up half an RPE a week', 'pct2.5': 'up 2.5% a week', 'rep-1': 'one rep fewer a week' };
  S.ruleText = function (row, cell) { if (cell && cell.rHi != null && cell.w != null && (row.prog || 'same') === 'same') return 'up ' + nf(STEP) + ' at ' + cell.rHi + ' reps'; return RULE[row.prog || 'same'] || RULE.same; };
  S.addrOf = function (b, r, c) { var row = rowAt(b, r); if (!row) return ''; return lineName(row) + ' · ' + S.ruleText(row, rawAt(b, r, c)); };
  function setsWords(lt) {
    var ds = (lt.sets || []).filter(function (s) { return !s.skipped; }); if (!ds.length) return 'Not logged';
    var ws = ds.map(function (s) { return s.w; }), same = ws.every(function (v) { return v === ws[0]; });
    var reps = ds.map(function (s) { return s.r; }).join(', '), felt = ds.filter(function (s) { return s.rated; }).map(function (s) { return nf(s.felt); });
    var load = same ? (ws[0] ? x3(nf(ws[0]), reps) : reps + ' reps') : ds.map(function (s) { return s.w ? x3(nf(s.w), s.r) : s.r; }).join(', ');
    return load + (felt.length ? ', felt ' + felt.join(', ') : ', not rated');
  }
  function quote1(t) { var s = String(t || '').trim().split(/(?<=[.?!])\s+/)[0] || ''; return '“' + s + '”'; }
  /* the lifter's own open note or pain about a line's lift, in the list's words: "Knee note waiting.", "Back pain this
     week." It leads the sentence of every cell of that lift still to come (§5.1: an open item first), before a draft's
     reason and before the load's sum, and it stays there after a send, so the question is never out of sight */
  function lead(ow, text) { return ow ? ow.trim() + (text ? ' ' + text : '') : text; }
  function openWord(row, ctx) {
    if (!row || !row.lift || !ctx) return '';
    var it = (ctx.items || []).filter(function (i) { return !i.done && i.ids && i.ids.length === 1 && /^(words|hurt)$/.test(i.group) && new RegExp('\\b' + row.lift + 's?\\b', 'i').test(i.title + ' ' + (i.meaning || '')); })[0];
    if (!it) return '';
    var part = (/\b(knee|back|hip|shoulder|elbow|wrist|ankle|hamstring|groin|quad|pec|neck|calf)s?\b/i.exec(it.title) || [])[1];
    var said = it.group === 'hurt' ? (part ? part.toLowerCase() + ' pain' : 'pain') + ' this week.' : (part ? part.toLowerCase() + ' note' : 'note') + ' waiting.';
    return ' ' + said.charAt(0).toUpperCase() + said.slice(1);
  }
  /* sel: { r, c, r1, c1, kind: 'cell' | 'range' | 'week' | 'band', lift }; ctx: { first (the lifter), items, pain, editing } */
  S.why = function (b, sel, ctx) {
    ctx = ctx || {};
    var acts = [], text = '', addr = '', tone = '', field = '', ro = false;
    if (sel.kind === 'week') {
      var w = b.weeks[sel.c], per = LIFTS.map(function (lf) { return { lf: lf, h: S.band(b, lf, sel.c) }; }).filter(function (x) { return x.h && (x.h.hard || x.h.top); });
      addr = 'Week ' + w.n; ro = true;
      text = per.length ? 'Week ' + w.n + ': ' + per.map(function (x, i) { return x.h.hard + (i ? ' on ' : ' hard sets on ') + K.LIFT[x.lf].toLowerCase(); }).join(', ').replace(/, ([^,]*)$/, ', $1') + '.' : 'Week ' + w.n + ' has nothing on the main lifts yet.';
      return { addr: addr, text: text, acts: acts, tone: tone, field: '', ro: true };
    }
    if (sel.kind === 'band') {
      var bw = b.weeks[sel.c], bd = S.band(b, sel.lift, sel.c), lw = K.LIFT[sel.lift].toLowerCase();
      addr = K.LIFT[sel.lift] + ' · week ' + bw.n;
      text = 'Week ' + bw.n + ' ' + lw + ': ' + plural(bd.written, 'hard set') + ' written' + (bd.anyLifted ? ', ' + bd.lifted + ' lifted' : '') + '.' + (bd.top ? ' Top ' + bd.top.pct + '% of ' + nf(bd.top.mx) + '.' : '');
      return { addr: addr, text: text, acts: acts, tone: tone, field: '', ro: true };
    }
    if (sel.kind === 'range') {
      var cells = 0, sets = 0, hard = 0;
      for (var rr = sel.r; rr <= sel.r1; rr++) for (var cc = sel.c; cc <= sel.c1; cc++) { var xx = rawAt(b, rr, cc); if (!xx) continue; cells++; var h = cellHard(b, rr, cc); sets += h.sets; hard += h.hard; }
      addr = sel.c === sel.c1 ? 'Week ' + b.weeks[sel.c].n : 'Weeks ' + b.weeks[sel.c].n + ' to ' + b.weeks[sel.c1].n;
      text = plural(cells, 'cell') + ' · ' + plural(sets, 'set') + ', ' + hard + ' hard';
      return { addr: addr, text: text, acts: acts, tone: tone, field: '', ro: false };
    }
    var r = sel.r, c = sel.c, row = rowAt(b, r), wk = b.weeks[c], x = rawAt(b, r, c), u = wk ? wk.uid : null;
    if (!row || !wk) return { addr: '', text: '', acts: [], tone: '', field: '', ro: true };
    addr = S.addrOf(b, r, c); ro = b.isRO(r, c); field = row.bad && row.bad[u] != null ? row.bad[u] : S.text(cellOf(x));
    /* 1. an open item about this set: her note, and its moves */
    if (x && x.lifted) {
      var ns = (x.lifted.sets || []).filter(function (s) { return s.note; })[0];
      var it = ns && (ctx.items || []).filter(function (i) { return !i.done && /^(words|hurt)$/.test(i.group) && row.lift && new RegExp('\\b' + row.lift + '\\b', 'i').test(i.title + ' ' + (i.meaning || '')); })[0];
      if (ns && it) {
        text = quote1(ns.note);
        it.acts.slice(0, 2).forEach(function (a, i) { var lab = a.label.replace(/\s+and reply$/i, '').replace(/^(Cap)\s+\w+\s+(at RPE\s+[\d.]+)$/i, '$1 $2').replace(/^Reply\b.*$/i, 'Reply'); acts.push({ label: lab, title: a.label, kind: i ? 'quiet' : 'fill', act: 'item', item: it.id, move: a.id }); });
        return { addr: addr, text: text, acts: acts, tone: tone, field: field, ro: ro };
      }
    }
    /* 2. text that cannot be read, or a question */
    if (row.bad && row.bad[u] != null) {
      var q = row.askq && row.askq[u];
      if (q) { var pq = S.parse(row.bad[u], { line: row.line, hasTop: !!b.topRow(row) }); text = pq.why || 'RPE, or kilos?'; acts.push({ label: 'RPE ' + q[0].split('@')[1], kind: 'fill', act: 'answer', which: 'rpe' }); acts.push({ label: q[1].split(' ')[1].replace('kg', ' kg'), kind: 'quiet', act: 'answer', which: 'kg' }); }
      else { var pr = S.parse(row.bad[u], b.ctxFor(r, c)); text = 'Could not read “' + row.bad[u] + '”. ' + cap1(String(pr.why || BL.HELP).replace(/^Did not understand “[^”]*”\.\s*/, '')); tone = 'warn'; acts.push({ label: 'Clear', kind: 'quiet', act: 'clear' }); }
      return { addr: addr, text: text, acts: acts, tone: tone, field: field, ro: ro };
    }
    /* 3. the lifter's own open word on this lift (Mei's knee note on squats) leads the sentence, so a heavier load is
       never read past their question. No drafts: a proposal is already in the block (its why is the engine's) */
    var ow = openWord(row, ctx);
    var noteOf = function (t) { var n = x && x.note ? String(x.note).trim() : ''; return n ? t.replace(/\s*$/, '') + ' Note: “' + n + '”' : t; };
    /* 4. what was lifted */
    if (x && x.lifted) {
      var lt = x.lifted, paper = b.paper(r, c), when = whenOf(lt.on, lt.at);
      var wrote = S.gridText(cellOf(x), { row: row, words: true }) + (paper != null ? ', ' + nf(paper) : '');
      text = (when ? when + ': ' : '') + setsWords(lt) + '. Wrote ' + wrote + '.';
      if (row.cn && row.cn[u]) text += ' Your note: ' + row.cn[u];
      return { addr: addr, text: text, acts: acts, tone: tone, field: field, ro: true };
    }
    if (ro) return { addr: addr, text: 'Under way. Change a day still to come.', acts: acts, tone: tone, field: field, ro: true };
    /* 5. how the load is worked out: the engine's own sentence (programs.md §5.2), its buttons where this view can act */
    if (!x) return { addr: addr, text: 'Empty. Type to write it in week ' + wk.n + '.', acts: acts, tone: tone, field: '', ro: false };
    if (typeof b.whyOf === 'function') {
      var wy = (typeof b.loadWords === 'function' ? b.loadWords(r, c) : b.whyOf(r, c)) || {};   /* spec C: "105 kg: 10% under week 2’s 117.5 (deload)." */
      (wy.acts || []).forEach(function (lab) { var a = barActOf(b, r, c, lab, ctx); if (a && acts.length < 2) acts.push(a); });
      var yk = wk.why && wk.why[row.key], held = yk && /held$/.test(yk.kind);   /* a hold already names the item */
      /* the first button is the filled one, unless it adds load past a hold (a tight knee never gets the loud button) */
      if (acts.length && !/^Add the /.test(acts[0].label)) acts[0].kind = 'fill';
      if (wy.text) return { addr: addr, text: noteOf(held ? wy.text : lead(ow, wy.text)), acts: acts, tone: tone, field: field, ro: false, held: !!held };
    }
    var L = b.load(r, c), lf = row.lift ? K.LIFT[row.lift].toLowerCase() : '';
    if (L.kind === 'typed') {
      text = nf(L.kg) + (L.kgHi != null ? ' to ' + nf(L.kgHi) : '') + ', typed by you.';
      if (x.rpe != null && row.lift && MAIN[row.lift]) { var by = b.loadFor(r, c, (function () { var y = cellOf(x); delete y.w; delete y.wHi; return y; })()); if (by.kg != null && by.kg !== L.kg) { text += ' By RPE it would be ' + nf(by.kg) + '.'; acts.push({ label: 'Let RPE set it', kind: 'fill', act: 'rpe' }); } }
    } else if (L.kind === 'rpe') text = 'About ' + nf(L.kg) + ': ' + S.gridText(x, { row: row, mark: true }) + ' is ' + nf(Math.round(L.p * 1000) / 10) + '% of ' + (L.f !== 1 ? nf(L.mx) + ' ÷ ' + L.f.toFixed(2) : 'the ' + nf(L.mx) + ' max') + ' on the RPE chart.';
    else if (L.kind === 'pct') text = nf(L.kg) + (L.kgHi != null ? ' to ' + nf(L.kgHi) : '') + ': ' + nf(x.pct) + (x.pctHi != null ? ' to ' + nf(x.pctHi) : '') + '% of the ' + nf(L.mx) + ' max.';
    else if (L.kind === 'top') text = nf(L.kg) + ' on paper: ' + (x.off ? nf(x.off) + '% under the ' : 'the load of the ') + nf(L.top) + ' top set.';
    else if (L.kind === 'nomax') text = 'No ' + lf + ' max yet. Set it in Maxes, or type a load.';
    else text = 'By feel. Type a load to set one.';
    if (x.until != null) text = text.replace(/\.$/, '') + ', stopping at the first @' + nf(x.until) + '.';
    return { addr: addr, text: noteOf(lead(ow, text)), acts: acts, tone: tone, field: field, ro: false };
  };
  /* the engine's button words (b.whyOf) as acts this view can run; anything else goes to the page (ctx.onAct) or is not
     drawn, so no button is a dead end */
  function barActOf(b, r, c, label, ctx) {
    var m;
    if ((m = /^(?:Back to|Use) (\d+(?:\.\d+)?)$/.exec(label))) return { label: label, kind: 'quiet', act: 'load', kg: Number(m[1]) };
    if ((m = /^Add the (\d+(?:\.\d+)?)$/.exec(label))) { var L = b.load(r, c); return L.kg != null ? { label: label, kind: 'quiet', act: 'load', kg: L.kg + Number(m[1]) } : null; }
    if (label === 'Let RPE set it') return { label: label, kind: 'quiet', act: 'rpe' };
    if (label === 'Take the cap off' && typeof b.uncap === 'function') return { label: label, kind: 'quiet', act: 'uncap' };
    if (ctx && typeof ctx.onAct === 'function') return { label: label, kind: 'quiet', act: 'page' };
    return null;
  }
  S.liveWhy = function (b, r, c, typed) {
    var row = rowAt(b, r), res = S.parse(typed, b.ctxFor(r, c));
    if (!String(typed || '').trim()) return { text: 'Empty. Enter clears the cell.', tone: '' };
    if (res.ask) return { text: res.why, tone: '' };
    if (!res.ok) return { text: res.why, tone: 'warn' };
    if (res.groups) return { text: plural(res.groups.length, 'line') + ': ' + res.groups.map(function (g) { return S.gridText(g, { row: row }); }).join(', then ') + '.', tone: '' };
    var L = b.loadFor(r, c, res.cell);
    return { text: (res.note ? res.note + ' ' : '') + S.readBack(res.cell, L), tone: '', cell: res.cell, load: L };
  };

  /* ================= THE GRID (the Block view) ================= */
  /* SHEET.grid(host, opts): opts = {
       block()            the block (the page holds it, and replaces it on undo, on another lifter or with a proposal)
       ctx()              { first (the lifter), meet, pain, items, sentAt(c), seenAt(c), onAct(label, sel, el) }
       done(res, how)     after a write: res is the block write's answer ({ data, label } | { error }); how: { toast, kind }
       toast(text)        a short word to the coach (a refusal)
       undo(), redo()     the page takes a step back or forward (it saves and repaints)
       onOpenWeek(c, o)   THE ONE WRITING SURFACE (shared.md D17), required: open week c in the Week view. o: { r, key (the
                          row's key), field ('sets' | 'ex'), seed (the character typed, to keep), day, add (the day's add
                          row) }. The Block view never edits a cell in place.
       weekState(c)       the store's week word (PL.programs.weeks), which wins over the block's own reading
       sendWeek()         the week Send would send (else the week to write): Send is held while it holds unread text
       onWeekMenu(c, btn), onLifter(step), onSend(), onItem(item, move, el)
     } */
  var EXW = 200, MINW = 124;   /* 22 Nov: one line a cell, so six weeks fit a laptop (they were 232 and 168: four) */
  S.grid = function (host, opts) {
    var b = function () { return opts.block(); }, ctx = function () { return opts.ctx ? opts.ctx() : {}; };
    var toast = function (t) { if (opts.toast) opts.toast(t); };
    var st = { cur: { r: 0, c: 0 }, anc: { r: 0, c: 0 }, kind: 'cell', lift: null, drag: null, k: 1, colW: 174, sync: false, cw: -1 };
    host.classList.add('sx');
    if (!host.hasAttribute('data-crop')) host.setAttribute('data-crop', 'grid');
    host.innerHTML = '<i class="sx-sentinel" aria-hidden="true"></i><div class="sx-bar" data-crop="formula"></div>' +
      '<div class="sx-grid" role="grid" tabindex="0" aria-multiselectable="true" data-keys="own"><div class="sx-head" role="rowgroup"></div><div class="sx-body" role="rowgroup"></div></div>' +
      '<div class="sr" aria-live="polite" role="status"></div>';
    var barEl = host.querySelector('.sx-bar'), gridEl = host.querySelector('.sx-grid'), headEl = host.querySelector('.sx-head'), bodyEl = host.querySelector('.sx-body'), liveEl = host.querySelector('[aria-live]');

    /* ---------- painting ---------- */
    function inRange(r, c) { if (st.kind === 'week') return c === st.cur.c; if (st.kind !== 'cell' && st.kind !== 'range') return false; var a = st.anc, z = st.cur; return r >= Math.min(a.r, z.r) && r <= Math.max(a.r, z.r) && c >= Math.min(a.c, z.c) && c <= Math.max(a.c, z.c); }
    function box() { var a = st.anc, z = st.cur; return { r0: Math.min(a.r, z.r), r1: Math.max(a.r, z.r), c0: Math.min(a.c, z.c), c1: Math.max(a.c, z.c) }; }
    function headOpts() { var cx = ctx(); return { meet: cx.meet, sentAt: cx.sentAt, seenAt: cx.seenAt, weekState: opts.weekState }; }
    function headHtml() {
      var B = b(), cw = st.cw, ho = headOpts(), marked = {};
      var nav = '<span class="sx-nav"><button class="sx-navb" type="button" data-nav="-1" aria-label="Earlier weeks" title="Earlier weeks">' + K.ic('back', 2.2) + '</button><button class="sx-navb" type="button" data-nav="1" aria-label="Later weeks" title="Later weeks">' + K.ic('chev', 2.2) + '</button></span>';
      return '<div class="sx-r sx-hr" role="row" aria-rowindex="1"><div class="sx-ex sx-corner" role="columnheader" aria-colindex="1"><span class="sx-ch">Exercise</span>' + nav + '</div>' +
        B.weeks.map(function (w, c) {
          var h = S.weekHead(B, c, ho), lit = c === cw, all = h.name + '. ' + h.state + (h.movedText ? '. ' + h.movedText : '');
          var tk = h.kind && BL.KIND_TERM ? BL.KIND_TERM[h.kind] : null, mk = tk && !marked[tk]; if (mk) marked[tk] = 1;
          var nameHtml = h.kind ? esc(h.base) + ', ' + (mk ? termHtml(tk, h.kind) : esc(h.kind)) : esc(h.name);
          return '<div class="sx-wh' + (lit ? ' is-lit' : '') + (c === st.cur.c && st.kind === 'week' ? ' is-sel' : '') + '" role="columnheader" aria-colindex="' + (c + 2) + '" data-week="' + w.n + '" data-c="' + c + '" id="sxh-' + c + '" title="' + esc(all + '. Enter opens it in the Week view.') + '">' +
            '<span class="sx-wn" data-ellipsis title="' + esc(h.name) + '">' + nameHtml + '</span>' +
            '<span class="sx-wf' + (h.strong ? ' is-strong' : '') + '" data-week-state data-ellipsis title="' + esc(h.state) + '">' + esc(h.state) + '</span>' +
            (h.movedText ? '<span class="sr">, ' + esc(h.movedText) + '</span>' : '') +
            '<button class="sx-wm" type="button" data-menu="week" data-more data-week="' + w.n + '" data-c="' + c + '" aria-haspopup="menu" aria-expanded="false" aria-label="' + esc(h.name.split(',')[0]) + ' moves" title="' + esc(h.name.split(',')[0]) + ' moves">' + K.ic('more', 2.2) + '</button></div>';
        }).join('') + '</div>' +
        /* the scroll edge under the heads (sheet.css .sx-fr): one box per column, so the lit week fades lit */
        '<div class="sx-r sx-fr" aria-hidden="true"><i class="sx-fz0" data-fade></i>' + B.weeks.map(function (w, c) { return '<i' + (c === cw ? ' class="is-lit"' : '') + ' data-fade data-c="' + c + '"></i>'; }).join('') + '</div>';
    }
    function exHtml(r) {
      var B = b(), row = B.rows[r], sub = '';
      if (row.line) sub = '';
      else if (row.tempo) sub = 'tempo ' + row.tempo;
      else if (row.pause) sub = nf(row.pause) + ' s pause';
      var lab = backName(B, r);   /* a ramp or a double after a single: the name again, in ink-2 */
      var mb = lab === 'Back-offs' && row.line && st.boFirst === r;
      var title = lineName(row) + (sub ? ', ' + sub : '') + ': select the line across the block';
      return '<div class="sx-ex" role="rowheader"><button class="sx-exb' + (row.line ? ' is-then' : '') + '" type="button" data-ex-open="' + r + '" title="' + esc(title) + '">' +
        '<span class="sx-exn" data-ellipsis title="' + esc(lab) + '">' + (mb ? termHtml('backoffs', lab) : esc(lab)) + '</span>' + (sub ? '<span class="sx-exs" data-ellipsis title="' + esc(sub) + '">' + esc(sub) + '</span>' : '') + '</button></div>';
    }
    /* the cell's one mark, in words (never a glyph): pain 4, 1 short, over, note, video, your note, held */
    function markWord(kind, text, label) { return '<span class="sx-mk mk-' + kind + '" title="' + esc(cap1(label || text)) + '">' + esc(text) + '</span>'; }
    /* the engine's load checks for every week still to come, by row: the Block view marks the cell the Week view flags
       ("about @10"), so a rule that overshoots by week 4 shows on the whole block at once (walk 2, Hannah: +2.5 kg a week
       at a fixed @7 reached about @10 by week 4 with no mark until each week was opened). A deload or recovery week is
       light on purpose, so its light checks are not shown (as week.js). */
    function checksAll(B) {
      var out = {}; if (typeof B.checks !== 'function') return out;
      B.weeks.forEach(function (w, c) {
        if (w.state === 'lifted') return;
        var list; try { list = B.checks(c, ctx().checkCtx || undefined) || []; } catch (e) { list = []; }
        list.forEach(function (k) {
          if (k.kind !== 'heavy' && k.kind !== 'light') return;
          if (k.kind === 'light' && (w.deload || B.kind === 'recovery')) return;
          out[k.r + '|' + c] = k;
        });
      });
      return out;
    }
    function cellHtml(r, c) {
      var B = b(), row = B.rows[r], w = B.weeks[c], x = row.cells[w.uid] || null, ro = B.isRO(r, c), lit = c === st.cw, u = w.uid;
      var bad = row.bad && row.bad[u] != null ? row.bad[u] : null, cls = 'sx-c', l1 = '', l2 = '', mk = null, mkHtml = '', sr = '';
      if (bad != null) { l1 = '<span class="sx-t is-bad">' + esc(bad) + '</span>'; cls += ' is-bad'; sr = ', could not be read'; }
      else if (x && x.lifted) {
        mk = S.markOf(B, r, c, ctx());
        var tt = S.topText(x.lifted);
        /* 22 Nov: one line a cell. The load lifted stands at the cell's end, in line with the loads of the weeks to come
           (so a lift reads down its column: 127.5, 130, 132.5); the reps and how it felt before it; what was written
           for the week in the cell's title and on the bar above */
        var wrote = S.gridText(cellOf(x), { row: row, mark: mk, words: true }), tm = /^([\d.]+(?:-[\d.]+)?)\s*[×x]\s*(.+)$/.exec(tt), did = tm ? tm[2] : tt;
        var over = mk && mk.kind === 'over' && x.lifted.top;
        l1 = '<span class="sx-t" title="' + esc('Written ' + wrote + '. Lifted ' + tt + '.') + '">' + (tm ? '<i class="sx-x" aria-hidden="true">×</i>' : '') + (over ? esc(did.replace(/ @[\d.]+$/, '')) + ' <span class="sx-over">@' + nf(x.lifted.top.felt) + '</span>' : esc(did)) + '</span>';
        l2 = tm ? '<span class="sx-kg">' + esc(tm[1]) + '</span>' : '';
        sr = ', written ' + wrote;
        cls += ' is-lifted';
      } else if (x) {
        var L = S.loadOf(B, r, c), dl = S.deltaOf(B, r, c);
        l1 = '<span class="sx-t">' + esc(String(S.gridText(x, { row: row, words: true })).replace(/\s×\s/g, '×')) + '</span>';
        l2 = L.kg != null ? '<span class="sx-kg">' + nf(L.kg) + (L.kgHi != null ? EN + nf(L.kgHi) : '') + '</span>' : '';
        /* a proposal's or a rule's step: "135 +2.5", the step in ink-3 (programs.md §5.3, professional.md §8.6) */
        if (dl && l2) { l2 += '<span class="sx-d" title="' + esc(nf(dl.was) + ' before') + '">' + dl.text + '</span>'; sr = ', ' + (dl.d > 0 ? 'up ' : 'down ') + nf(Math.abs(dl.d)) + ' from ' + nf(dl.was); }
        var y = w.why && w.why[row.key];
        var ck = st.chk && st.chk[r + '|' + c];
        /* one status colour per row (professional.md L15): the first flagged week of the line carries the warn colour, the
           weeks after it the same words in ink-2 */
        if (ck) {
          var firstC = -1; for (var cc = 0; cc < B.weeks.length && firstC < 0; cc++) if (st.chk[r + '|' + cc]) firstC = cc;
          mkHtml = markWord(c === firstC ? 'check' : 'check-then', ck.kind === 'heavy' ? (isNum(ck.said) && ck.said >= 5 ? 'about @' + nf(Math.min(10, Math.round(ck.said * 2) / 2)) : 'heavy') : 'light', ck.words);
          cls += ' is-check'; sr += ', ' + ck.words;
        }
        else if (y && /held$/.test(y.kind)) mkHtml = markWord('held', 'held', 'Held: ' + (y.why || 'the swap'));
        else if (x.note) mkHtml = markWord('note', 'note', 'Note: ' + x.note);
      }
      if (!mkHtml && mk && mk.kind !== 'over') mkHtml = markWord(mk.kind, mk.text || mk.kind, mk.label);
      if (!mkHtml && row.cn && row.cn[u]) mkHtml = markWord('mine', 'your note', 'Your note: ' + row.cn[u]);
      var ch = B.changed(r, c);
      if (ch) { cls += ' is-changed'; sr += ', changed, not sent'; }
      return '<div class="' + cls + (lit ? ' is-lit' : '') + (ro ? ' is-ro' : '') + '" role="gridcell" id="sxc-' + r + '-' + c + '" aria-colindex="' + (c + 2) + '" aria-selected="' + inRange(r, c) + '"' + (ro ? ' aria-readonly="true"' : '') + ' data-r="' + r + '" data-c="' + c + '"' + (ch ? ' title="Changed, not sent"' : '') + '>' +
        '<span class="sx-l1">' + l1 + mkHtml + '</span><span class="sx-l2">' + l2 + '</span>' + (sr ? '<span class="sr">' + esc(sr) + '</span>' : '') + (!l1 && !l2 ? '<span class="sr">none</span>' : '') + '</div>';
    }
    function dayHtml(day, ri) {
      var B = b(), wd = S.wdOf(B, day.name), today = K.today;
      var cells = B.weeks.map(function (w, c) {
        var news = '', iso = typeof B.dateOf === 'function' ? B.dateOf(c, day.name) : S.dayIso(B, c, day.name);
        if (w.off && w.off[day.name]) news = 'Off this week';
        else if (w.moved && w.moved[day.name] && iso) news = 'Moved to ' + K.wd3(iso);
        if (w.state === 'now' && iso && !w.started[day.name] && iso < today) news = 'Missed';
        if (w.state === 'now' && w.started[day.name]) {
          var any = null, all = true; B.rows.forEach(function (row) { if (row.day !== day.name) return; var x = row.cells[w.uid]; if (!x || !x.lifted) return; (x.lifted.sets || []).forEach(function (s) { if (s.skipped) all = false; else if (!any || (s.at && s.at < any)) any = s.at || any; }); });
          if (!all && any) news = 'Started ' + K.wd3(any.slice(0, 10)) + ' ' + any.slice(11, 16);
        }
        if ((w.state === 'lifted' || w.state === 'now') && w.started[day.name]) { var sk = 0; B.rows.forEach(function (row) { if (row.day !== day.name || row.lift) return; var x = row.cells[w.uid]; if (x && x.lifted && x.lifted.done < x.lifted.of) sk++; }); if (sk) news = plural(sk, 'accessory', 'accessories') + ' skipped'; }
        return '<div class="sx-dc' + (c === st.cw ? ' is-lit' : '') + (news === 'Missed' ? ' is-warn' : '') + '" role="gridcell" aria-readonly="true" aria-colindex="' + (c + 2) + '" data-c="' + c + '">' + (news ? '<span class="sx-news" data-ellipsis title="' + esc(news) + '">' + esc(news) + '</span>' : '') + '</div>';
      }).join('');
      return '<div class="sx-r sx-dr" role="row" data-day="' + esc(day.name) + '" aria-rowindex="' + ri + '"><div class="sx-ex" role="rowheader"><span class="sx-dn" data-ellipsis title="' + esc(S.dayLabel(day.name)) + '">' + esc(S.dayLabel(day.name)) + '</span>' + (wd ? '<span class="sx-dw">' + wd + '</span>' : '') + '</div>' + cells + '</div>';
    }
    function addHtml(day) {
      return '<div class="sx-r sx-ar" data-add-row="' + esc(day.name) + '"><div class="sx-ex"><button class="sx-addb add-row" type="button" data-add-ex="' + esc(day.name) + '">Add an exercise</button></div><div class="sx-arw" aria-hidden="true"></div></div>';
    }
    function bandHtml(ri) {
      var B = b(), live = LIFTS.filter(function (lf) { return B.rows.some(function (row) { return row.lift === lf; }); });
      if (!live.length) return '';
      return '<div class="sx-r sx-bh" role="row" aria-rowindex="' + ri + '"><div class="sx-ex" role="rowheader"><span class="sx-dn">Hard sets and top set</span></div>' + B.weeks.map(function (w, c) { return '<div class="sx-dc' + (c === st.cw ? ' is-lit' : '') + '" role="gridcell" aria-readonly="true" aria-colindex="' + (c + 2) + '" data-c="' + c + '"></div>'; }).join('') + '</div>' +
        live.map(function (lf, i) {
          return '<div class="sx-r sx-br" role="row" aria-rowindex="' + (ri + 1 + i) + '" data-band="' + lf + '"><div class="sx-ex" role="rowheader"><span class="sx-exb is-band"><span class="sx-exn">' + K.LIFT[lf] + '</span></span></div>' +
            B.weeks.map(function (w, c) {
              var bd = S.band(B, lf, c), sel = st.kind === 'band' && st.lift === lf && st.cur.c === c;
              return '<div class="sx-bc' + (c === st.cw ? ' is-lit' : '') + (sel ? ' is-cur' : '') + '" role="gridcell" aria-readonly="true" aria-selected="' + sel + '" aria-colindex="' + (c + 2) + '" id="sxb-' + lf + '-' + c + '" data-band="' + lf + '" data-c="' + c + '">' +
                (bd && (bd.hard || bd.top) ? '<b>' + bd.hard + '</b> hard' + (bd.top ? ' · top <b>' + bd.top.pct + '%</b>' : '') : '<span class="sr">none</span>') + '</div>';
            }).join('') + '</div>';
        }).join('');
    }
    function paintGrid() {
      var B = b(), keepX = bodyEl.scrollLeft, ri = 2, html = '';
      st.cw = S.writeCol(B);
      gridEl.style.setProperty('--sx-n', String(B.weeks.length));
      gridEl.style.setProperty('--sx-cw', String(Math.max(0, st.cw)));
      gridEl.setAttribute('aria-label', (ctx().first ? ctx().first + '’s ' : '') + B.name + ', weeks across, exercises down by day');
      gridEl.setAttribute('aria-colcount', String(B.weeks.length + 1));
      headEl.innerHTML = headHtml();
      st.chk = checksAll(B);
      st.boFirst = -1; (B.days || []).some(function (day) { return B.rows.some(function (row, r) { if (row.day === day.name && row.line && backName(B, r) === 'Back-offs') { st.boFirst = r; return true; } return false; }); });
      (B.days || []).forEach(function (day) {
        html += dayHtml(day, ri++);
        B.rows.forEach(function (row, r) { if (row.day !== day.name) return; html += '<div class="sx-r sx-lr' + (row.line ? ' is-sub' : '') + '" role="row" data-row="' + esc(row.key) + '" aria-rowindex="' + (ri++) + '">' + exHtml(r) + B.weeks.map(function (w, c) { return cellHtml(r, c); }).join('') + '</div>'; });
        html += addHtml(day);
      });
      var band = bandHtml(ri);
      gridEl.setAttribute('aria-rowcount', String(ri + (band ? 4 : 0)));
      bodyEl.innerHTML = (st.cw >= 0 ? '<i class="sx-lit" aria-hidden="true"></i>' : '') + html + band + '<div class="sx-sel" aria-hidden="true" hidden><i class="sx-handle" data-fill-handle data-handle title="Drag to fill" aria-label="Drag to fill"></i></div><div class="sx-fpv" aria-hidden="true" hidden></div>';
      bodyEl.scrollLeft = keepX; headEl.scrollLeft = keepX;
      sizeCols();
      st.off = null; markOff();
      paintSel();
    }
    /* weeks scrolled under the pinned exercise column hold no visible text: what is under the column is never read through it */
    function markOff() {
      var f = Math.floor(bodyEl.scrollLeft / st.colW + 0.02); if (f === st.off) return; st.off = f;
      [].forEach.call(host.querySelectorAll('.sx-head [data-c], .sx-body [data-c]'), function (el) { el.classList.toggle('is-off', +el.getAttribute('data-c') < f); });
    }
    function paintSel() {
      var B = b();
      [].forEach.call(bodyEl.querySelectorAll('.sx-c'), function (el) { var r = +el.getAttribute('data-r'), c = +el.getAttribute('data-c'), on = inRange(r, c); el.setAttribute('aria-selected', String(on)); el.classList.toggle('is-cur', (st.kind === 'cell' || st.kind === 'range') && r === st.cur.r && c === st.cur.c); el.classList.toggle('is-in', on && (st.kind === 'range' || st.kind === 'week')); });
      [].forEach.call(bodyEl.querySelectorAll('.sx-bc'), function (el) { var on = st.kind === 'band' && el.getAttribute('data-band') === st.lift && +el.getAttribute('data-c') === st.cur.c; el.classList.toggle('is-cur', on); el.setAttribute('aria-selected', String(on)); });
      [].forEach.call(headEl.querySelectorAll('.sx-wh'), function (el) { el.classList.toggle('is-sel', st.kind === 'week' && +el.getAttribute('data-c') === st.cur.c); });
      placeBox();
      var id = st.kind === 'band' ? 'sxb-' + st.lift + '-' + st.cur.c : st.kind === 'week' ? 'sxh-' + st.cur.c : 'sxc-' + st.cur.r + '-' + st.cur.c;
      gridEl.setAttribute('aria-activedescendant', id);
      paintBar();
    }
    function cellEl(r, c) { return bodyEl.querySelector('#sxc-' + r + '-' + c); }
    function placeBox() {
      var sb = bodyEl.querySelector('.sx-sel'); if (!sb) return;
      if (st.kind !== 'cell' && st.kind !== 'range') { sb.hidden = true; return; }
      var bx = box(), a = cellEl(bx.r0, bx.c0), z = cellEl(bx.r1, bx.c1); if (!a || !z) { sb.hidden = true; return; }
      var rb = bodyEl.getBoundingClientRect(), ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect();
      sb.hidden = false;
      sb.style.left = (ra.left - rb.left + bodyEl.scrollLeft) + 'px'; sb.style.top = (ra.top - rb.top) + 'px';
      sb.style.width = (rz.right - ra.left) + 'px'; sb.style.height = (rz.bottom - ra.top) + 'px';
      var h = sb.querySelector('.sx-handle'), roAll = true;
      for (var r = bx.r0; r <= bx.r1; r++) for (var c = bx.c0; c <= bx.c1; c++) if (!b().isRO(r, c)) roAll = false;
      h.hidden = roAll;
    }
    function actHtml(a, i) {
      return '<button class="btn sm' + (a.kind === 'fill' ? '' : ' quiet') + '" type="button" data-bar="' + i + '"' + (a.title ? ' title="' + esc(a.title) + '"' : '') + '>' + esc(a.label) + '</button>';
    }
    var barActs = [];
    function paintBar() {
      var B = b(), sel = api.sel(), info = S.why(B, sel, ctx());
      barActs = info.acts || [];
      var fx = barEl.querySelector('.sx-fx'), focusIn = fx && document.activeElement === fx;
      if (!fx) {
        barEl.innerHTML = '<span class="sx-addr" data-ellipsis></span><input class="input sx-fx" type="text" autocomplete="off" spellcheck="false" autocapitalize="off"><span class="sx-how" data-ellipsis></span><span class="sx-acts"></span>';
        fx = barEl.querySelector('.sx-fx');
      }
      var addr = barEl.querySelector('.sx-addr'), how = barEl.querySelector('.sx-how');
      addr.textContent = info.addr; addr.title = info.addr;
      how.textContent = info.text; how.title = info.text; how.className = 'sx-how' + (info.tone === 'warn' ? ' is-warn' : '');
      how.setAttribute('role', info.tone === 'warn' ? 'alert' : 'note');
      /* the bar reads the cell as its editor will show it (one set written out) */
      if (!focusIn) fx.value = info.field ? (/^\d+(?:-\d+)?(?:\s|$)/.test(info.field) && !/^\d+\s*[x×]/i.test(info.field) ? '1x' + info.field : info.field) : '';
      /* one writing surface: the field reads the cell; typing in it opens the Week view (keydown below) */
      fx.readOnly = true; fx.setAttribute('aria-label', 'The cell in hand: ' + info.addr + (info.ro ? ', lifted' : ''));
      barEl.querySelector('.sx-acts').innerHTML = barActs.slice(0, 2).map(actHtml).join('');
    }
    /* week columns share the card's width in whole weeks, never under 168 px */
    function sizeCols() {
      var B = b(), avail = Math.max(MINW, bodyEl.clientWidth - EXW), k = Math.max(1, Math.min(B.weeks.length, Math.floor(avail / MINW))), colW = Math.floor(avail / k);
      st.k = k; st.colW = colW;
      gridEl.style.setProperty('--sx-w', colW + 'px');
      host.classList.toggle('is-wide', B.weeks.length > k);
    }
    function firstShown() { return Math.round(bodyEl.scrollLeft / st.colW); }
    function scrollWeeks(first, smooth) {
      var B = b(), max = Math.max(0, B.weeks.length - st.k); first = Math.max(0, Math.min(max, first));
      var x = first * st.colW;
      if (smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches) bodyEl.scrollTo({ left: x, behavior: 'smooth' }); else { bodyEl.scrollLeft = x; headEl.scrollLeft = x; markOff(); }
      paintNav(first);
    }
    function paintNav(first) {
      var B = b(); first = first == null ? firstShown() : first;
      var prev = headEl.querySelector('[data-nav="-1"]'), next = headEl.querySelector('[data-nav="1"]');
      if (prev) prev.disabled = first <= 0;
      if (next) next.disabled = first + st.k >= B.weeks.length;
    }
    /* open where you work: the week to write lit, the latest lifting on its left, the week after on its right */
    function home() { var B = b(), cw = S.writeCol(B), at = cw >= 0 ? cw : B.weeks.length - 1; scrollWeeks(Math.min(at - (st.k - 2), B.weeks.length - st.k)); }

    /* ---------- moving (never animated) ---------- */
    function clampR(r) { return Math.max(0, Math.min(b().rows.length - 1, r)); }
    function clampC(c) { return Math.max(0, Math.min(b().weeks.length - 1, c)); }
    function reveal(mode) {
      var c = st.cur.c, first = firstShown(), last = first + st.k - 1;
      if (c < first) scrollWeeks(c); else if (c > last) scrollWeeks(c - st.k + 1);
      if (mode === 'x') return;                                   /* sideways only: opening on a cell never scrolls the page */
      var el = st.kind === 'band' ? bodyEl.querySelector('#sxb-' + st.lift + '-' + c) : st.kind === 'week' ? null : cellEl(st.cur.r, c);
      if (!el) return;
      var pn = pane(), pr = pn ? pn.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      var rr = el.getBoundingClientRect(), hb = headEl.getBoundingClientRect().bottom, top = Math.max(hb, pr.top) + 8, bot = pr.bottom - 16;
      var dy = rr.top < top ? rr.top - top : rr.bottom > bot ? rr.bottom - bot : 0;
      if (!dy) return;
      if (pn) pn.scrollTop += dy; else W.scrollBy({ top: dy, left: 0, behavior: 'instant' });
    }
    /* the pane the block scrolls in: the host itself when the page keeps its window still (Programs), else the nearest box
       that scrolls, else the window (null) */
    function pane() {
      for (var p = host; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
      }
      return null;
    }
    function say(t) {
      if (t) { liveEl.textContent = t; return; }
      var B = b(), sel = api.sel(), info = S.why(B, sel, ctx());
      if (st.kind === 'cell') { var row = B.rows[st.cur.r], x = rawAt(B, st.cur.r, st.cur.c), L = S.loadOf(B, st.cur.r, st.cur.c), dl = S.deltaOf(B, st.cur.r, st.cur.c); t = 'Week ' + B.weeks[st.cur.c].n + ', ' + S.dayLabel(row.day) + ', ' + lineName(row).toLowerCase() + ', ' + (x ? S.readBack(x).replace(/\.$/, '') : 'empty') + (L.kg != null && !(x && x.lifted) ? ', ' + nf(L.kg) + ' kilos' : '') + (dl ? ', ' + (dl.d > 0 ? 'up ' : 'down ') + nf(Math.abs(dl.d)) : '') + (x && x.lifted ? ', lifted ' + S.topText(x.lifted) : ''); }
      else t = info.addr + '. ' + info.text;
      liveEl.textContent = t;
    }
    function select(r, c, o) {
      o = o || {};
      st.kind = o.kind || 'cell'; st.lift = o.lift || null;
      st.cur = { r: clampR(r), c: clampC(c) };
      if (!o.extend) st.anc = { r: st.cur.r, c: st.cur.c };
      if (st.kind === 'cell' && (st.anc.r !== st.cur.r || st.anc.c !== st.cur.c)) st.kind = 'range';
      paintSel(); if (o.reveal !== false) reveal(o.reveal === 'x' ? 'x' : null); say();
    }
    /* a whole line across the block (⇧Space, a click on its name): copy it, fill it right, clear it */
    function selectRow(r) { var C = b().weeks.length - 1; st.kind = 'range'; st.anc = { r: clampR(r), c: C }; st.cur = { r: clampR(r), c: 0 }; paintSel(); say(); }
    function lifts() { var B = b(); return LIFTS.filter(function (lf) { return B.rows.some(function (row) { return row.lift === lf; }); }); }
    function go(dr, dc, extend) {
      if (st.kind === 'band') { var ls = lifts(), i = ls.indexOf(st.lift) + dr; if (i < 0) { select(b().rows.length - 1, st.cur.c); return; } if (i >= ls.length) i = ls.length - 1; select(0, st.cur.c + dc, { kind: 'band', lift: ls[i] }); return; }
      if (st.kind === 'week') { if (dr > 0) select(0, st.cur.c); else if (dc) select(st.cur.r, st.cur.c + dc, { kind: 'week' }); return; }
      if (!extend && dr < 0 && st.cur.r === 0) { select(st.cur.r, st.cur.c, { kind: 'week' }); return; }
      if (!extend && dr > 0 && st.cur.r === b().rows.length - 1) { var lf0 = lifts()[0]; if (lf0) { select(0, st.cur.c, { kind: 'band', lift: lf0 }); return; } }
      select(st.cur.r + dr, st.cur.c + dc, { extend: extend });
    }

    /* ---------- the one writing surface: the Week view ---------- */
    function openWeek(c, o) {
      if (typeof opts.onOpenWeek !== 'function') return false;
      var B = b(), r = o && o.r != null ? clampR(o.r) : st.cur.r, row = B.rows[r];
      var arg = { r: r, key: row ? row.key : null, field: (o && o.field) || 'sets', seed: o && o.seed != null ? o.seed : null, day: o && o.day ? o.day : row ? row.day : null, add: !!(o && o.add) };
      opts.onOpenWeek(c, arg);
      return true;
    }
    /* 22 Nov (the owner: "the advanced spreadsheet … everything should be editable easily … It feels like a rip-off"): a
       cell is written where it stands. A typed character replaces what it holds; Enter, F2 or a double click opens it
       with its text kept. Enter saves and goes down, Tab right, Esc puts it back; while a typed character began it the
       arrows save and move, as in any sheet. It used to throw the coach over to the Week view on every keystroke. */
    var ed = null;
    /* 22 Nov (a cold review: "the editor shows 3 @8 132.5kg for a cell reading 1 × 3 @8"): one set is written out in
       the editor and on the bar, as the cell shows it */
    function cellText(r, c) { var B = b(), row = B.rows[r], u = B.weeks[c].uid; if (row.bad && row.bad[u] != null) return row.bad[u]; var t = S.text(cellOf(row.cells[u] || null)) || ''; return /^\d+(?:-\d+)?(?:\s|$)/.test(t) && !/^\d+\s*[x×]/i.test(t) ? '1x' + t : t; }
    function write1(seed) {
      var B = b(), r = st.cur.r, c = st.cur.c;
      if (ed) return true;
      if (B.isRO(r, c)) { toast(LIFTED); return false; }
      var el = cellEl(r, c); if (!el) return false;
      var input = document.createElement('input'), was = cellText(r, c);
      input.className = 'sx-ed'; input.type = 'text'; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('autocapitalize', 'off');
      input.setAttribute('aria-label', 'Write ' + S.where(B, r, c));
      input.value = seed != null ? String(seed) : was;
      el.appendChild(input); el.classList.add('is-editing');
      ed = { r: r, c: c, input: input, was: was, mode: seed != null ? 'enter' : 'edit', done: false };
      input.focus({ preventScroll: true });
      if (seed != null) { try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* not text */ } } else input.select();
      input.addEventListener('keydown', onEdKey);
      input.addEventListener('blur', function () { endEdit(true); });
      return true;
    }
    function endEdit(save, move) {
      var e0 = ed; if (!e0 || e0.done) return; e0.done = true; ed = null;
      var text = e0.input.value.trim(), cell = e0.input.parentNode;
      if (cell) cell.classList.remove('is-editing');
      e0.input.remove();
      if (save && text !== String(e0.was).trim()) {
        var res = text ? S.set(b(), e0.r, e0.c, text) : S.clear(b(), { r0: e0.r, r1: e0.r, c0: e0.c, c1: e0.c });
        write(res, { kind: text ? 'set' : 'clear' });
        api.render();
      }
      gridEl.focus({ preventScroll: true });
      if (move) go(move[0], move[1]);
    }
    function onEdKey(e) {
      var k = e.key; if (!ed) return;
      e.stopPropagation();
      if (k === 'Enter') { e.preventDefault(); endEdit(true, [e.shiftKey ? -1 : 1, 0]); }
      else if (k === 'Tab') { e.preventDefault(); endEdit(true, [0, e.shiftKey ? -1 : 1]); }
      else if (k === 'Escape') { e.preventDefault(); endEdit(false); }
      else if (ed.mode === 'enter' && /^Arrow(Up|Down|Left|Right)$/.test(k) && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); endEdit(true, k === 'ArrowUp' ? [-1, 0] : k === 'ArrowDown' ? [1, 0] : k === 'ArrowLeft' ? [0, -1] : [0, 1]); }
    }
    /* a cell half typed is saved before the page moves on (a switch of view, the next lifter) */
    function flush() { if (ed) endEdit(true); }

    /* ---------- the moves ---------- */
    /* 22 Nov (a cold review: "Paste and Delete change the programme but the cell does not repaint"): every write draws */
    function write(res, how) { opts.done(res, how || {}); if (!(res && res.error) && typeof api !== 'undefined' && api) api.render(); }
    function clearSel() { var bx = box(); write(S.clear(b(), bx), { kind: 'clear', toast: true }); }
    function fillSel(kind) { var bx = box(); write(kind === 'down' ? S.fillDown(b(), bx) : S.fillRight(b(), bx), { kind: 'fill', toast: true }); }
    /* ⌘↵: the selection takes the cell in hand's text (where the selection began) */
    function fillWithHand() {
      if (st.kind !== 'range') { say('Select cells to fill first: ⇧ and the arrows.'); return; }
      var B = b(), a = st.anc, row = B.rows[a.r], u = B.weeks[a.c].uid, t = row.bad && row.bad[u] != null ? row.bad[u] : S.text(cellOf(row.cells[u] || null));
      var bx = box(), res = S.fillWith(B, bx, t);
      write(res, { kind: 'fill', toast: true });
      if (!res.error) { st.kind = 'range'; paintSel(); }
    }
    function pasteText(t) { var bx = box(); var res = S.paste(b(), bx, t); write(res, { kind: 'paste', toast: true }); if (res.data && res.data.wrote && !(res.data.r1 === res.data.r0 && res.data.c1 === res.data.c0)) { st.anc = { r: res.data.r1, c: res.data.c1 }; st.cur = { r: res.data.r0, c: res.data.c0 }; st.kind = 'range'; paintSel(); } }
    /* ⌘⇧↵: Send, held while the week holds text the engine could not read (programs.md §5.5) */
    function trySend() {
      var B = b(), c = opts.sendWeek ? opts.sendWeek() : st.cw;
      var bad = c != null && c >= 0 ? B.badIn(c) : [];
      if (bad.length) { select(bad[0], c); toast('Fix one cell first: ' + S.where(B, bad[0], c) + '.'); return; }
      if (opts.onSend) opts.onSend();
    }
    function barAct(i, el) {
      var a = barActs[i], B = b(), r = st.cur.r, c = st.cur.c; if (!a) return;
      if (a.act === 'load') {
        var row = B.rows[r];
        if (row && row.line === 0 && typeof B.setTopLoad === 'function') write(B.setTopLoad(r, c, a.kg, { followBackoffs: true }), { kind: 'set', toast: true });
        else write(B.commit(a.label + ' for ' + S.where(B, r, c), function () { var y = cellOf(rawAt(B, r, c)); y.w = a.kg; delete y.wHi; this.put(r, c, y); return { data: { r: r, c: c } }; }), { kind: 'set', toast: true });
      }
      else if (a.act === 'uncap') write(B.uncap(c), { kind: 'set', toast: true });
      else if (a.act === 'rpe') {
        /* every line of that lift on that day whose fixed load is not its RPE's goes with it, as the Week view does (walk 2,
           Nina: the second line stayed at 90 x 5 @8 under a top set re-worked to 77.5); one write, one Undo */
        var rw = B.rows[r], top = rw && rw.line ? B.topRow(rw) : rw, wk = B.weeks[c], rs = [];
        B.rows.forEach(function (x, i) {
          var t = x.line ? B.topRow(x) : x; if (!x || t !== top) return;
          if (i === r) { rs.push(i); return; }
          var cl = wk ? x.cells[wk.uid] : null; if (!cl || cl.lifted || cl.rpe == null || cl.w == null || B.isRO(i, c)) return;
          var z = cellOf(cl); delete z.w; delete z.wHi; var by = B.loadFor(i, c, z); if (by && isNum(by.kg) && by.kg !== cl.w) rs.push(i);
        });
        write(B.commit('Let RPE set ' + (rs.length > 1 ? rw.name.toLowerCase() + ', ' + plural(rs.length, 'line') : S.where(B, r, c)), function () {
          var self = this; rs.forEach(function (i) { var y = cellOf(rawAt(B, i, c)); delete y.w; delete y.wHi; self.put(i, c, y); }); return { data: { r: r, c: c } };
        }), { kind: 'set', toast: true });
      }
      else if (a.act === 'clear') write(S.clear(B, { r0: r, r1: r, c0: c, c1: c }), { kind: 'clear' });
      else if (a.act === 'answer') write(S.answer(B, r, c, a.which), { kind: 'set' });
      else if (a.act === 'item' && opts.onItem) opts.onItem(a.item, a.move, el);
      else if (a.act === 'page' && ctx().onAct) ctx().onAct(a.label, api.sel(), el);
      gridEl.focus({ preventScroll: true });
    }

    /* ---------- keys on the grid (it owns every unmodified key while it has focus) ---------- */
    gridEl.addEventListener('keydown', function (e) {
      if (e.target !== gridEl) return;
      var k = e.key, B = b(), R = B.rows.length - 1, C = B.weeks.length - 1, kk = k.toLowerCase(), mod = e.metaKey || e.ctrlKey;
      if (mod) {
        if (kk === 'z') { e.preventDefault(); if (e.shiftKey) opts.redo(); else opts.undo(); }
        else if (kk === 'y') { e.preventDefault(); opts.redo(); }
        else if (kk === 'r' && !e.shiftKey) { e.preventDefault(); fillSel('right'); }
        else if (kk === 'd' && !e.shiftKey) { e.preventDefault(); fillSel('down'); }
        else if (kk === 'a') { e.preventDefault(); st.kind = 'range'; st.anc = { r: R, c: C }; st.cur = { r: 0, c: 0 }; paintSel(); say(); }
        else if (k === 'Enter') { e.preventDefault(); if (e.shiftKey) trySend(); else fillWithHand(); }
        else if (k === 'ArrowLeft') { e.preventDefault(); select(st.cur.r, 0, { extend: e.shiftKey }); }
        else if (k === 'ArrowRight') { e.preventDefault(); select(st.cur.r, C, { extend: e.shiftKey }); }
        else if (k === 'ArrowUp') { e.preventDefault(); select(0, st.cur.c, { extend: e.shiftKey }); }
        else if (k === 'ArrowDown') { e.preventDefault(); select(R, st.cur.c, { extend: e.shiftKey }); }
        return;                                                  /* ⌘C ⌘X ⌘V: the clipboard events do the work */
      }
      if (e.altKey) {
        /* 22 Nov (a cold review: in the Block grid ⌥⇧↓ opened another lifter while the line's own menu called it "Move
           down"): the keys mean here what they mean in Simple and in the Week grid */
        if (e.shiftKey && (k === 'ArrowDown' || k === 'ArrowUp')) {
          e.preventDefault();
          var B0 = b(), row0 = B0.rows[st.cur.r]; if (!row0 || typeof B0.moveRow !== 'function') return;
          var mk = row0.key, mres = B0.moveRow(st.cur.r, k === 'ArrowUp' ? 'up' : 'down');
          write(mres, { kind: 'move' });
          if (mres && mres.error) { toast(mres.error.message); return; }
          var nr = -1; b().rows.forEach(function (y, i) { if (y.key === mk) nr = i; }); if (nr >= 0) select(nr, st.cur.c);
          return;
        }
        if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (opts.onLifter) opts.onLifter(k === 'ArrowDown' ? 1 : -1); }
        else if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); if (opts.onWeek) opts.onWeek(k === 'ArrowRight' ? 1 : -1); else go(0, k === 'ArrowRight' ? 1 : -1); }
        return;
      }
      if (k === 'ArrowUp') { e.preventDefault(); go(-1, 0, e.shiftKey); }
      else if (k === 'ArrowDown') { e.preventDefault(); go(1, 0, e.shiftKey); }
      else if (k === 'ArrowLeft') { e.preventDefault(); go(0, -1, e.shiftKey); }
      else if (k === 'ArrowRight') { e.preventDefault(); go(0, 1, e.shiftKey); }
      else if (k === 'Tab') { e.preventDefault(); go(0, e.shiftKey ? -1 : 1); }
      else if (k === 'Home') { e.preventDefault(); select(st.cur.r, 0, { extend: e.shiftKey }); }
      else if (k === 'End') { e.preventDefault(); select(st.cur.r, C, { extend: e.shiftKey }); }
      else if (k === 'PageUp') { e.preventDefault(); select(st.cur.r - 8, st.cur.c, { extend: e.shiftKey }); }
      else if (k === 'PageDown') { e.preventDefault(); select(st.cur.r + 8, st.cur.c, { extend: e.shiftKey }); }
      else if (k === ' ' && e.shiftKey) { e.preventDefault(); if (st.kind === 'cell' || st.kind === 'range') selectRow(st.cur.r); }
      /* ⇧↵ goes up a row, as in every spreadsheet and the Week grid (it opened the cell in hand) */
      else if (k === 'Enter' && e.shiftKey && st.kind !== 'week' && st.kind !== 'band') { e.preventDefault(); go(-1, 0); }
      else if (k === 'Enter' || k === 'F2') {
        e.preventDefault();
        if (st.kind === 'week') { openWeek(st.cur.c, { r: st.cur.r }); return; }
        if (st.kind === 'band') return;
        if (st.kind === 'range') { st.kind = 'cell'; st.anc = { r: st.cur.r, c: st.cur.c }; }
        write1(null);
      }
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (st.kind === 'cell' || st.kind === 'range') clearSel(); }
      else if (k === 'Escape') {
        if (st.kind !== 'cell') { e.preventDefault(); e.stopPropagation(); select(st.cur.r, st.cur.c); }
      }
      else if (k.length === 1 && k !== ' ') {
        if (st.kind !== 'cell' && st.kind !== 'range') return;
        e.preventDefault();
        if (st.kind === 'range') { st.kind = 'cell'; st.anc = { r: st.cur.r, c: st.cur.c }; }
        write1(k);
      }
    });

    /* ---------- hands: click, shift-click, drag, the fill handle ---------- */
    function cellAt(x, y) { var t = document.elementFromPoint(x, y); return t && t.closest ? t.closest('.sx-c') : null; }
    gridEl.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      var t = e.target, el;
      if (t.closest('.sx-handle')) {
        e.preventDefault();
        var bx0 = box(); st.drag = { kind: 'fill', b: bx0, to: { r: bx0.r1, c: bx0.c1 }, id: e.pointerId };
        try { t.setPointerCapture(e.pointerId); } catch (x) { /* capture refused */ }
        gridEl.focus({ preventScroll: true });
        return;
      }
      if (t.closest('button, input, a')) return;
      if ((el = t.closest('.sx-c'))) {
        var r = +el.getAttribute('data-r'), c = +el.getAttribute('data-c');
        e.preventDefault(); gridEl.focus({ preventScroll: true });
        select(r, c, { extend: e.shiftKey, reveal: false });
        st.drag = { kind: 'sel' };
        return;
      }
      if ((el = t.closest('.sx-bc'))) { e.preventDefault(); gridEl.focus({ preventScroll: true }); select(0, +el.getAttribute('data-c'), { kind: 'band', lift: el.getAttribute('data-band'), reveal: false }); return; }
      if ((el = t.closest('.sx-wh'))) { e.preventDefault(); gridEl.focus({ preventScroll: true }); select(st.cur.r, +el.getAttribute('data-c'), { kind: 'week', reveal: false }); return; }
    });
    var onMove = function (e) {
      if (!st.drag) return;
      var el = cellAt(e.clientX, e.clientY); if (!el) return;
      var r = +el.getAttribute('data-r'), c = +el.getAttribute('data-c');
      if (st.drag.kind === 'sel') { if (r !== st.cur.r || c !== st.cur.c) { st.cur = { r: r, c: c }; st.kind = st.anc.r === r && st.anc.c === c ? 'cell' : 'range'; paintSel(); } return; }
      var bx = st.drag.b, to = { r: bx.r1, c: bx.c1 };
      if (c > bx.c1 && r >= bx.r0 && r <= bx.r1) to = { r: bx.r1, c: c };
      else if (r > bx.r1 && c >= bx.c0 && c <= bx.c1) to = { r: r, c: bx.c1 };
      else if (c > bx.c1) to = { r: bx.r1, c: c };
      st.drag.to = to; preview(bx, to);
    };
    document.addEventListener('pointermove', onMove);
    function endDrag() {
      var d = st.drag; st.drag = null; var pv = bodyEl.querySelector('.sx-fpv'); if (pv) pv.hidden = true;
      if (!d || d.kind !== 'fill') return;
      var bx = d.b;
      if (d.to.c > bx.c1) { var res = S.fill(b(), { r0: bx.r0, r1: bx.r1 }, bx.c1, d.to.c, { c0: bx.c0 }); write(res, { kind: 'fill', toast: true }); if (!res.error) { st.anc = { r: bx.r1, c: d.to.c }; st.cur = { r: bx.r0, c: bx.c0 }; st.kind = 'range'; paintSel(); } }
      else if (d.to.r > bx.r1) { var rs = S.fillDown(b(), { r0: bx.r1, r1: d.to.r, c0: bx.c0, c1: bx.c1 }); write(rs, { kind: 'fill', toast: true }); }
    }
    var onUp = function () { if (st.drag) endDrag(); }, onCancel = function () { st.drag = null; };
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    function preview(bx, to) {
      var pv = bodyEl.querySelector('.sx-fpv'); if (!pv) return;
      var a, z;
      if (to.c > bx.c1) { a = cellEl(bx.r0, bx.c1 + 1); z = cellEl(bx.r1, to.c); }
      else if (to.r > bx.r1) { a = cellEl(bx.r1 + 1, bx.c0); z = cellEl(to.r, bx.c1); }
      if (!a || !z) { pv.hidden = true; return; }
      var rb = bodyEl.getBoundingClientRect(), ra = a.getBoundingClientRect(), rz = z.getBoundingClientRect();
      pv.hidden = false; pv.style.left = (ra.left - rb.left + bodyEl.scrollLeft) + 'px'; pv.style.top = (ra.top - rb.top) + 'px'; pv.style.width = (rz.right - ra.left) + 'px'; pv.style.height = (rz.bottom - ra.top) + 'px';
    }
    gridEl.addEventListener('dblclick', function (e) {
      var el = e.target.closest('.sx-c'), wh = e.target.closest('.sx-wh');
      if (el) { select(+el.getAttribute('data-r'), +el.getAttribute('data-c')); write1(null); }
      else if (wh && !e.target.closest('button')) openWeek(+wh.getAttribute('data-c'), { r: st.cur.r });
    });
    host.addEventListener('click', function (e) {
      var t = e.target, el;
      if ((el = t.closest('[data-bar]'))) { barAct(+el.getAttribute('data-bar'), el); return; }
      if ((el = t.closest('[data-menu="week"]'))) { if (opts.onWeekMenu) opts.onWeekMenu(+el.getAttribute('data-c'), el); return; }
      if ((el = t.closest('[data-nav]'))) { scrollWeeks(firstShown() + Number(el.getAttribute('data-nav')), true); return; }
      if ((el = t.closest('[data-ex-open]'))) { gridEl.focus({ preventScroll: true }); selectRow(+el.getAttribute('data-ex-open')); return; }
      if ((el = t.closest('[data-add-ex]'))) {
        var day = el.getAttribute('data-add-ex');
        /* 22 Nov: an exercise is added here, through the picker, and its cell in the week to write opens for typing */
        if (window.PICK && typeof b().addExercise === 'function') {
          var at = el;
          window.PICK.open(at, { block: b(), c: st.cw >= 0 ? st.cw : st.cur.c, title: 'Add to ' + String(day).toLowerCase(), onPick: function (ex) {
            var res = b().addExercise(day, ex.name, { lift: ex.lift, variant: ex.variant || undefined });
            write(res, { kind: 'add' }); api.render();
            if (res && !res.error && res.data && res.data.r != null) { gridEl.focus({ preventScroll: true }); select(res.data.r, st.cw >= 0 ? st.cw : st.cur.c); write1(null); }
          } });
          return;
        }
        openWeek(st.cw >= 0 ? st.cw : st.cur.c, { day: day, add: true, field: 'ex' });
        return;
      }
    });
    /* a right click on a line (its name or one of its cells): the line's moves, the same menu the other views open */
    host.addEventListener('contextmenu', function (e) {
      if (typeof opts.onRowMenu !== 'function' || ed) return;
      var cellX = e.target.closest('.sx-c'), exX = e.target.closest('[data-ex-open]'), r = cellX ? +cellX.getAttribute('data-r') : exX ? +exX.getAttribute('data-ex-open') : -1;
      if (!(r >= 0) || !b().rows[r]) return;
      e.preventDefault();
      if (cellX) select(r, +cellX.getAttribute('data-c'), { reveal: false });
      opts.onRowMenu(r, cellX || exX, cellX ? +cellX.getAttribute('data-c') : null);
    });

    /* ---------- the cell in hand's field: it reads the cell; a typed character opens the Week view ---------- */
    barEl.addEventListener('keydown', function (e) {
      if (!e.target.classList.contains('sx-fx')) return;
      if (e.key === 'Escape') { e.preventDefault(); gridEl.focus({ preventScroll: true }); }
      else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); gridEl.focus({ preventScroll: true }); if (st.kind === 'cell') write1(null); }
      else if ((e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) || e.key === 'Backspace' || e.key === 'Delete') {
        if (b().isRO(st.cur.r, st.cur.c)) { e.preventDefault(); toast(LIFTED); }
        else if (st.kind === 'cell' && e.key.length === 1) { e.preventDefault(); write1(e.key); }
      }
    });

    /* ---------- the clipboard: tab-separated text and an HTML table, to and from any grid tool ---------- */
    var gridOn = function () { return document.activeElement === gridEl && (st.kind === 'cell' || st.kind === 'range'); };
    function onCopy(e, cut) { if (!gridOn()) return; e.preventDefault(); var cp = S.copy(b(), box()); e.clipboardData.setData('text/plain', cp.tsv); e.clipboardData.setData('text/html', cp.html); if (cut) clearSel(); else toast(plural((box().r1 - box().r0 + 1) * (box().c1 - box().c0 + 1), 'cell') + ' copied.'); }
    function onPaste(e) {
      if (!gridOn()) return; e.preventDefault();
      var cd = e.clipboardData || W.clipboardData, t = cd ? cd.getData('text/plain') : '';
      if (!t && cd) { var h = cd.getData('text/html'); if (h) { var doc = new DOMParser().parseFromString(h, 'text/html'); t = [].map.call(doc.querySelectorAll('tr'), function (tr) { return [].map.call(tr.querySelectorAll('td,th'), function (td) { return td.textContent.trim(); }).join('\t'); }).join('\n'); } }
      pasteText(t);
    }
    var onCopyH = function (e) { onCopy(e, false); }, onCutH = function (e) { onCopy(e, true); };
    document.addEventListener('copy', onCopyH); document.addEventListener('cut', onCutH); document.addEventListener('paste', onPaste);

    /* ---------- pinned heads: sideways in step with the grid; the cap shows only while the heads are pinned ---------- */
    bodyEl.addEventListener('scroll', function () { markOff(); if (st.sync) return; st.sync = true; headEl.scrollLeft = bodyEl.scrollLeft; st.sync = false; placeBox(); paintNav(); });
    headEl.addEventListener('scroll', function () { if (st.sync) return; st.sync = true; bodyEl.scrollLeft = headEl.scrollLeft; st.sync = false; markOff(); });
    var io = null;
    if ('IntersectionObserver' in W) {
      var pn0 = pane(), sxTop = parseFloat(getComputedStyle(host).getPropertyValue('--sx-top'));
      var edge = pn0 && !isNaN(sxTop) ? sxTop : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge-h')) || 96;
      io = new IntersectionObserver(function (es) { es.forEach(function (en) { var rb = en.rootBounds; host.classList.toggle('is-stuck', !en.isIntersecting && !!rb && en.boundingClientRect.top < rb.top); }); }, { root: pn0, rootMargin: '-' + edge + 'px 0px 0px 0px', threshold: 0 });
      io.observe(host.querySelector('.sx-sentinel'));
    }
    var ro = null;
    if ('ResizeObserver' in W) { var lastW = 0; ro = new ResizeObserver(function () { var w = bodyEl.clientWidth; if (w === lastW) return; lastW = w; var f = firstShown(); sizeCols(); scrollWeeks(f); placeBox(); }); ro.observe(host); }

    var api = {
      render: function (o) { o = o || {}; var B = b(); st.cur.r = clampR(st.cur.r); st.cur.c = clampC(st.cur.c); st.anc.r = clampR(st.anc.r); st.anc.c = clampC(st.anc.c); if (!B.rows.length) st.kind = 'week'; paintGrid(); if (o.home) home(); else paintNav(); },
      select: function (r, c, o) { select(r, c, o); },
      selectRow: function (r) { selectRow(r); },
      week: function (c) { select(st.cur.r, c, { kind: 'week' }); },
      band: function (lift, c) { select(0, c, { kind: 'band', lift: lift }); },
      edit: function (seed) { return write1(seed == null ? null : seed) !== false; },
      send: function () { trySend(); },
      focus: function () { gridEl.focus({ preventScroll: true }); },
      flush: flush,
      home: home,
      cellEl: cellEl,
      writeCol: function () { return st.cw; },
      sel: function () { var bx = box(); return st.kind === 'range' ? { kind: 'range', r: bx.r0, c: bx.c0, r1: bx.r1, c1: bx.c1 } : { kind: st.kind, r: st.cur.r, c: st.cur.c, lift: st.lift }; },
      destroy: function () { document.removeEventListener('copy', onCopyH); document.removeEventListener('cut', onCutH); document.removeEventListener('paste', onPaste); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); document.removeEventListener('pointercancel', onCancel); if (io) io.disconnect(); if (ro) ro.disconnect(); host.innerHTML = ''; }
    };
    return api;
  };
})();
