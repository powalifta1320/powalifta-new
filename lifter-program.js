/* lifter-program.js: the self-coached lifter's program builder on a laptop is the coach desk's Programs editor
   (26 Nov 2026; the owner: "For the solo athlete as well [...] the program builder is the main issue over here. They
   should have a similar option to the coach where they can make their own templates. They can put simple and
   advanced. They can change blocks, everything.").

   WHERE IT SHOWS. athlete.html's renderProgramTab() asks LifterProgram.mount() first: on the website at laptop width
   (min-width 901 px, the window wide enough for the editor beside the sidebar, never html.native) and only for a lifter
   with no coach, it puts the coach desk's editor (coach-preview/desk/programs.html?solo=1) in #pane-program as a
   same-origin iframe and answers true. Everywhere else it answers false and the phone builder (renderSelfBuilder)
   draws as before. Coached lifters never get here (renderProgramTab sends them to the read-only Full program).

   HOW THE TWO SIDES TALK (same origin: plain calls, JSON strings across the frame, never shared objects).
     The editor (kit/r6/solo.js, before kit.js) asks window.parent.LifterProgram.dataset() for one lifter: you. The
     dataset is the app's program read into the kit's program shape (toEditor), the lifter's logs, maxes, unit, theme
     and templates. The editor then answers:
       LifterProgram.ready(baseBlockJson, baseLoadsJson)   the block as the editor built it, before any edit
       LifterProgram.saved(blockJson, loadsJson)          after every edit, undo and redo: the block as it now stands
       LifterProgram.replace(blockJson, loadsJson, name)  a new block (a starter, a template, a repeat, a blank one)
       LifterProgram.templates(listJson)                  the lifter's own templates as the editor now has them
       LifterProgram.maxes(maxesJson)                     training maxes the lifter typed
     loads: { 'rowKey|weekUid': kg } the engine's load for every line still to come (BLOCK's own numbers).

   DATA SAFETY. saved() never patches in place: each save is applyBlock(the program at mount, its map, the base block,
   the block now) so an undo all the way back gives the program at mount again, object for object. applyBlock writes
   only what changed between the base block and the block now, line by line and field by field; a week, day, exercise
   or set nobody touched is the same object. A day with a logged set (completed, skipped, missed, completedAt) and every
   week before the one under way are never rewritten, whatever the editor sends. If the program changed underneath (a
   set logged in Train), the next mount reads it again (fingerprint).

   PURE (unit-tested in tests.html "lifter program (lifter-program.js)"): LifterProgram.toEditor, applyBlock,
   blockToProgram, weekIdx, groupsOf, isLogged, cellEq. No DOM, no Store. */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : this;

  /* =====================================================================================
     PURE
     ===================================================================================== */
  var MAIN = { squat: 1, bench: 1, deadlift: 1 };
  /* the kit's names for the app's variants (block.js VNAME): a main lift's line is named for its variant */
  var VNAME = { squat: { Competition: 'Squat', Paused: 'Paused squat', Tempo: 'Tempo squat', Pin: 'Pin squat' },
    bench: { Competition: 'Bench', Paused: 'Paused bench', 'Close Grip': 'Close-grip bench', 'Pin Press': 'Pin press', Incline: 'Incline bench' },
    deadlift: { Competition: 'Deadlift', Paused: 'Paused deadlift', Deficit: 'Deficit deadlift', RDL: 'Romanian deadlift' } };
  /* a cell's written keys (block.js CKEYS): what a line says, never what was lifted */
  var CKEYS = ['n', 'nHi', 'upTo', 'r', 'rHi', 'amrap', 'pct', 'pctHi', 'rpe', 'rpeHi', 'rir', 'off', 'until', 'w', 'wHi', 'bw', 'tempo', 'pause', 'note', 'rest', 'pauseAt', 'acc', 'cx'];
  /* a cell key → the app set's field ('' : the app has no field; kept on the set under the cell's own name so the
     editor reads it back) */
  var FIELD = { r: 'reps', rHi: 'repsHi', amrap: 'amrap', pct: 'pct', pctHi: 'pctHi', rpe: 'rpe', rpeHi: 'rpeHi', rir: 'rir', off: 'off', until: 'until',
    w: 'weight', wHi: 'weightHi', tempo: 'tempo', pause: 'pause', note: 'note', rest: 'rest', pauseAt: 'pauseAt', acc: 'acc', cx: 'cx', nHi: 'nHi', upTo: 'upTo', bw: 'bw' };
  /* the keys that move a set's load: when one changes on a line written without kilos, the engine's load is written */
  var LOADKEYS = { r: 1, rHi: 1, pct: 1, pctHi: 1, rpe: 1, rpeHi: 1, rir: 1, off: 1, until: 1, w: 1, wHi: 1, amrap: 1 };
  /* what a logged set carries that a copy never takes */
  var LOGGED = ['id', 'completed', 'completedAt', 'actualRpe', 'skipped', 'missed', 'plannedReps', 'actualReps', 'actualWeight', 'loggedAt', 'video', 'videoUrl', 'formCheck'];

  var hasOwn = Object.prototype.hasOwnProperty;
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function num(v) { if (v == null || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function sig(v) { return v === undefined || v === null || v === '' || v === false ? '' : JSON.stringify(v); }
  function d10(v) { return v ? String(v).slice(0, 10) : null; }
  /* the app keeps kilos; an lb lifter's editor works in pounds: converted on the way in and on the way out (only what is
     written goes out, so an untouched set keeps its kilos to the last digit) */
  var KG_LB = 0.45359237;
  function inUnit(kg, lb) { var v = num(kg); if (v == null || !lb) return v; return Math.round(v / KG_LB * 10) / 10; }   /* as the app shows it (kgToDisplay: one decimal) */
  function toKg(v, lb) { v = num(v); if (v == null || !lb) return v; return Math.round(v * KG_LB * 10000) / 10000; }

  function isLogged(s) { return !!(s && (s.completed || s.skipped || s.missed || s.completedAt)); }
  function dayLogged(d) { return !!(d && (d.exercises || []).some(function (e) { return (e.sets || []).some(isLogged); })); }
  function weekLogged(w) { return !!(w && (w.days || []).some(dayLogged)); }
  function openSet(s) { return !!s && !s.completed && !s.skipped && !s.missed && !s.extra; }

  /* the week under way: the later of the first week with a set still to do and the last week with a logged set; past
     every week when nothing is left to do (the block is finished) */
  function weekIdx(prog) {
    var ws = (prog && prog.weeks) || [], firstOpen = -1, lastLogged = -1;
    ws.forEach(function (w, i) {
      var ss = []; (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { ss.push(s); }); }); });
      if (firstOpen < 0 && ss.some(openSet)) firstOpen = i;
      if (ss.some(isLogged)) lastLogged = i;
    });
    if (firstOpen < 0) return ws.length;
    return Math.max(firstOpen, lastLogged);
  }

  /* an app exercise's title in the kit: a main lift's variant name, else its own name */
  function titleOf(e) {
    var lift = e && e.lift, v = (e && e.variant) || 'Competition';
    if (MAIN[lift] && VNAME[lift][v] && !(e.exerciseName && String(e.exerciseName).trim())) return VNAME[lift][v];
    var nm = e && e.exerciseName ? String(e.exerciseName).trim() : '';
    if (nm) return nm;
    if (MAIN[lift]) return VNAME[lift][v] || VNAME[lift].Competition;
    return 'Exercise';
  }
  /* "8-10" → { r: 8, rHi: 10 }; 5 → { r: 5 } */
  function repsOf(s) {
    var r = s.reps, out = { r: 0 };
    if (typeof r === 'string') { var m = /^\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*$/.exec(r); if (m) { out.r = Number(m[1]); out.rHi = Number(m[2]); return out; } }
    var n = num(r); out.r = n != null ? n : 0;
    var hi = num(s.repsHi); if (hi != null && hi > out.r) out.rHi = hi;
    return out;
  }
  /* one app set in the kit's set shape (kit/data.js): what it says and, when logged, what was done */
  function kitSet(s, lb) {
    var rr = repsOf(s), o = { w: inUnit(s.weight, lb) || 0, r: rr.r, rpe: num(s.rpe), done: s.completed ? 1 : 0, felt: num(s.actualRpe), on: s.completed ? d10(s.completedAt) : null };
    if (rr.rHi != null) o.rHi = rr.rHi;
    if (num(s.rpeHi) != null) o.rpeHi = num(s.rpeHi);
    if (num(s.pct) != null) o.pct = num(s.pct);
    if (num(s.pctHi) != null) o.pctHi = num(s.pctHi);
    if (num(s.weightHi) != null && num(s.weightHi) > 0) o.wHi = inUnit(s.weightHi, lb);
    if (s.tempo) o.tempo = String(s.tempo);
    if (num(s.pause) > 0) o.pause = num(s.pause);
    if (s.rir === true || s.rir === 1) o.rir = true;
    if (s.amrap) o.amrap = true;
    if (num(s.off) != null) o.off = num(s.off);
    if (num(s.until) != null) o.until = num(s.until);
    if (s.extra) o.extra = true;
    if (s.skipped || s.missed) o.skipped = true;
    if (num(s.actualReps) != null) o.rDone = num(s.actualReps);
    return o;
  }
  /* an exercise's sets in lines, as block.js groupsOf reads them: consecutive sets written the same are one line, a
     warm-up (extra) is in none. Each line: the indexes of its sets in e.sets */
  function groupsOf(e, lb) {
    var gs = [], last = null;
    ((e && e.sets) || []).forEach(function (s, i) {
      if (!s || s.extra) return;
      var k = kitSet(s, lb), q = [k.w || 0, k.r, k.rpe == null ? null : k.rpe, k.rpeHi == null ? null : k.rpeHi, k.pct == null ? null : k.pct, k.off == null ? null : k.off].join('|');
      if (last && last.q === q) last.idx.push(i); else { last = { q: q, idx: [i] }; gs.push(last); }
    });
    return gs.map(function (g) { return g.idx; });
  }

  /* the app's program in the kit's shape (DEMO.lifters[i].program), and the map back. o: { today, maxes }
     → { program, map: { weekIdx, weeks: [{ names: [the kit day name of each app day, or null] }] } } */
  function toEditor(prog, o) {
    o = o || {};
    var wi0 = weekIdx(prog), weeks = [], map = { weekIdx: wi0, weeks: [] };
    ((prog && prog.weeks) || []).forEach(function (w, wi) {
      var used = {}, names = [], days = [];
      (w.days || []).forEach(function (d, di) {
        var exs = d.exercises || [];
        var base = String(d.name || '').trim() || 'Day ' + (di + 1);
        if (!exs.length && /^(rest|off|recovery)\b/i.test(base)) { names.push(null); return; }   /* a rest day: the kit leaves it out */
        var nm = base, k = 2; while (used[nm.toLowerCase()]) nm = base + ' (' + (k++) + ')';
        used[nm.toLowerCase()] = 1; names.push(nm);
        var done = 0, all = 0, kexs = exs.map(function (e) {
          var sets = (e.sets || []).map(function (s) { var x = kitSet(s, o.lb); all++; if (isLogged(s)) done++; return x; });
          return { lift: e.lift || null, variant: MAIN[e.lift] ? (e.variant || 'Competition') : (e.variant || ''), title: titleOf(e), note: e.note || '', sets: sets };
        });
        /* no date: the app's weeks carry none (a pin is one session's, never the day's every week); the days keep their order */
        var day = { name: nm, date: null, sets: all, done: done, exercises: kexs };
        days.push(day);
      });
      map.weeks.push({ names: names });
      weeks.push({ n: wi + 1, published: true, days: days });
    });
    var maxes = { squat: null, bench: null, deadlift: null }, maxFrom = {};
    ['squat', 'bench', 'deadlift'].forEach(function (k) { var v = o.maxes && num(o.maxes[k]); if (v) { maxes[k] = inUnit(v, o.lb); maxFrom[k] = { kind: 'typed', on: o.today || null }; } });
    /* the weeks laid from today: the week under way starts today (the app gives sessions no dates; nothing is ever
       "missed" by a date made up here), each week before it 7 days earlier, each after it 7 days later */
    var starts = null; if (o.today && /^\d{4}-\d{2}-\d{2}$/.test(o.today)) { var t = new Date(o.today + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - 7 * wi0); starts = t.toISOString().slice(0, 10); }
    var program = { id: (prog && prog.id) || 'program', name: (prog && prog.name) || 'My program', startsOn: starts, meetDate: null, maxes: maxes, maxFrom: maxFrom, cols: [], weekIdx: wi0, weeks: weeks };
    return { program: program, map: map };
  }

  /* a cell as the line reads it: its written keys, with the line's own tempo and pause where the cell has none */
  function cellOf(c) { if (!c) return null; var o = {}; CKEYS.forEach(function (k) { var v = c[k]; if (v != null && v !== false && v !== '' && !(k === 'cx' && (typeof v !== 'object' || !Object.keys(v).length))) o[k] = v; }); return o; }
  function eff(row, c) { var x = cellOf(c); if (!x) return null; if (row && row.tempo && x.tempo == null) x.tempo = row.tempo; if (row && row.pause && x.pause == null) x.pause = row.pause; return x; }
  function cellEq(a, b) { a = cellOf(a); b = cellOf(b); if (!a || !b) return !a && !b; for (var i = 0; i < CKEYS.length; i++) if (sig(a[CKEYS[i]]) !== sig(b[CKEYS[i]])) return false; return true; }
  function effEq(ra, a, rb, b) { a = eff(ra, a); b = eff(rb, b); if (!a || !b) return !a && !b; for (var i = 0; i < CKEYS.length; i++) if (sig(a[CKEYS[i]]) !== sig(b[CKEYS[i]])) return false; return true; }
  /* what makes a line the same exercise: its name, lift and variant, and its note */
  function rowMetaEq(a, b) { return !!a && !!b && a.name === b.name && (a.lift || null) === (b.lift || null) && (a.variant || '') === (b.variant || '') && (a.note || '') === (b.note || '') && (a.cat || null) === (b.cat || null); }
  function exKey(key) { var k = String(key || ''); var i = k.lastIndexOf('|'); return i < 0 ? k : k.slice(0, i); }
  function lineOfKey(key) { var k = String(key || ''); return Number(k.slice(k.lastIndexOf('|') + 1)) || 0; }

  /* a planned set's copy: what it says, nothing logged */
  function planOf(s, mkId) {
    var o = {}; Object.keys(s || {}).forEach(function (k) { if (LOGGED.indexOf(k) < 0) o[k] = clone(s[k]); });
    o.completed = false; if (mkId) o.id = mkId();
    return o;
  }
  /* write one key of a cell onto an app set */
  function putKey(s, k, v, lb) {
    var f = FIELD[k]; if (!f) return;
    if (k === 'w' && (v == null || v === '')) { s.weight = 0; return; }
    if (v == null || v === '' || v === false || (k === 'cx' && (typeof v !== 'object' || !Object.keys(v).length))) { delete s[f]; return; }
    if (k === 'rir') { s.rir = true; return; }
    s[f] = k === 'w' || k === 'wHi' ? toKg(v, lb) : clone(v);
  }
  /* a fresh set from a cell (a line the lifter added, a week that is new) */
  function setOfCell(x, kg, mkId, lb) {
    var s = { id: mkId ? mkId() : undefined, weight: 0, reps: 0, completed: false };
    if (!s.id) delete s.id;
    CKEYS.forEach(function (k) { if (k !== 'n' && x[k] != null) putKey(s, k, x[k], lb); });
    if (x.w == null && isNum(kg)) s.weight = toKg(kg, lb);
    if (s.weight == null) s.weight = 0;
    if (s.reps == null) s.reps = 0;
    return s;
  }
  /* a line's sets after its cell changed from bc to nc: the sets it had, each with only the changed keys written; more
     sets copy the last one, fewer drop from the end. kg: the engine's load now, loadMoved: it moved */
  function setsAfter(orig, bc, nc, kg, loadMoved, mkId, lb) {
    var n = Math.max(0, Math.round(nc.n == null ? 1 : nc.n)), out = [], changed = [], i;
    CKEYS.forEach(function (k) { if (k !== 'n' && sig(bc[k]) !== sig(nc[k])) changed.push(k); });
    var loadKeys = changed.some(function (k) { return LOADKEYS[k]; });
    for (i = 0; i < n; i++) {
      var src = orig[i] || null, s;
      if (src) { s = {}; Object.keys(src).forEach(function (k) { s[k] = src[k]; }); }
      else { var last = out[out.length - 1] || orig[orig.length - 1]; s = last ? planOf(last, mkId) : setOfCell(nc, kg, mkId, lb); if (!last) { out.push(s); continue; } }
      changed.forEach(function (k) { putKey(s, k, nc[k], lb); });
      if (nc.w == null && (loadMoved || (loadKeys && isNum(kg)))) s.weight = isNum(kg) ? toKg(kg, lb) : 0;
      out.push(s);
    }
    return out;
  }

  /* the app program after the editor's block changed from `base` to `next` (both block.js toJSON).
     prog: the app program the base was read from (never changed); map: toEditor's map; o.loads0 / o.loads: the engine's
     loads in the base and now ({ 'key|uid': kg }); o.id(): a new id. → { program, changed, error? } */
  function applyBlock(prog, map, base, next, o) {
    o = o || {};
    var mkId = typeof o.id === 'function' ? o.id : null, L0 = o.loads0 || {}, L1 = o.loads || {}, lb = !!o.lb;
    if (!prog || !base || !next || !Array.isArray(next.rows) || !Array.isArray(next.weeks)) return { program: prog, changed: false, error: 'nothing to read' };
    var B = {}, N = {}; base.rows.forEach(function (r) { B[r.key] = r; }); next.rows.forEach(function (r) { N[r.key] = r; });
    var bIdx = {}; base.weeks.forEach(function (w, c) { bIdx[w.uid] = c; });
    var nUids = {}; next.weeks.forEach(function (w) { nUids[w.uid] = 1; });
    var wiLock = map && isNum(map.weekIdx) ? map.weekIdx : 0;
    /* a week with something logged, or one before the week under way, is never dropped */
    for (var bu in bIdx) if (hasOwn.call(bIdx, bu) && !nUids[bu]) { var aw = prog.weeks[bIdx[bu]]; if (bIdx[bu] < wiLock || weekLogged(aw)) return { program: prog, changed: false, error: 'a lifted week went missing' }; }
    /* the base's day names → the names now (a rename keeps its place in the list; a name kept is itself) */
    var dayNow = {}, nNames = (next.days || []).map(function (d) { return d.name; }), bNames = (base.days || []).map(function (d) { return d.name; });
    bNames.forEach(function (nm, i) { dayNow[nm] = nNames.indexOf(nm) >= 0 ? nm : (bNames.length === nNames.length && bNames.indexOf(nNames[i]) < 0 ? nNames[i] : null); });
    var loadKey = function (key, uid) { return key + '|' + uid; };
    var moved = function (key, uid) { var k = loadKey(key, uid); return sig(L0[k]) !== sig(L1[k]); };
    var rowsIn = function (blk, uid, day) { return blk.rows.filter(function (r) { return r.cells && r.cells[uid] && (day == null || r.day === day); }); };

    /* one line's sets in week uid (the base row br and the next row nr share key) */
    function lineSame(br, nr, uid) { return !!br && !!nr && rowMetaEq(br, nr) && effEq(br, br.cells[uid], nr, nr.cells[uid]) && !(nr.cells[uid] && cellOf(nr.cells[uid]).w == null && moved(nr.key, uid)); }
    /* an exercise of a week, rebuilt from the next block's lines; orig: the app exercise these lines were read from */
    function exerciseOf(lines, uid, orig, origGroups, pool) {
      var first = lines[0], baseFirst = B[first.key];
      /* every line as it was, none added or dropped, the exercise unchanged: the same object */
      if (orig) {
        var bLines = base.rows.filter(function (r) { return exKey(r.key) === exKey(first.key) && r.cells[uid]; }).map(function (r) { return r.key; });
        var same = bLines.length === lines.length && lines.every(function (r, i) { return r.key === bLines[i] && lineSame(B[r.key], r, uid); });
        if (same) return orig;
      }
      /* a whole exercise moved here unchanged (another day, a line's new key): the one it was */
      if (!orig && pool && pool.length) {
        for (var p = 0; p < pool.length; p++) {
          var cand = pool[p];
          if (cand.lines.length !== lines.length) continue;
          if (cand.lines.every(function (br, i) { return rowMetaEq(br, lines[i]) && effEq(br, br.cells[uid], lines[i], lines[i].cells[uid]); })) { pool.splice(p, 1); return cand.ex; }
        }
      }
      var ex = {};
      if (orig) Object.keys(orig).forEach(function (k) { ex[k] = orig[k]; });
      else { if (mkId) ex.id = mkId(); ex.lift = null; ex.variant = ''; ex.exerciseName = ''; ex.note = ''; }
      /* the exercise itself: written only when the line's name, lift or variant changed (or it is new) */
      if (!orig || !baseFirst || baseFirst.name !== first.name || (baseFirst.lift || null) !== (first.lift || null) || (baseFirst.variant || '') !== (first.variant || '')) {
        if (MAIN[first.lift]) {
          ex.lift = first.lift; ex.variant = first.variant || 'Competition';
          ex.exerciseName = VNAME[first.lift][ex.variant] === first.name ? '' : first.name;
        } else {
          var cat = first.cat && !MAIN[first.cat] ? first.cat : orig && !MAIN[orig.lift] ? orig.lift : (orig && MAIN[orig.lift] ? 'other' : 'other');
          ex.lift = cat || 'other'; ex.variant = ''; ex.exerciseName = first.name;
        }
      }
      if (!orig || !baseFirst || (baseFirst.note || '') !== (first.note || '')) ex.note = first.note || '';
      var origSets = orig ? orig.sets || [] : [];
      /* the sets: walk the old ones (warm-ups stay where they were), each line in place of the line it was */
      var byLine = {}; lines.forEach(function (r) { byLine[r.key] = r; });
      var out = [], done = {};
      var emit = function (key, li) {
        var nr = byLine[key]; done[key] = 1; if (!nr) return;   /* a line taken out */
        var br = B[key], idx = origGroups && origGroups[li] ? origGroups[li] : [], os = idx.map(function (i) { return origSets[i]; });
        if (br && br.cells[uid] && lineSame(br, nr, uid)) { os.forEach(function (s) { out.push(s); }); return; }
        var bc = br && br.cells[uid] ? eff(br, br.cells[uid]) : {}, nc = eff(nr, nr.cells[uid]);
        if (!os.length) { var kg0 = L1[loadKey(nr.key, uid)]; for (var k = 0; k < Math.max(0, Math.round(nc.n == null ? 1 : nc.n)); k++) out.push(setOfCell(nc, isNum(kg0) ? kg0 : null, mkId, lb)); return; }
        setsAfter(os, bc, nc, L1[loadKey(nr.key, uid)], cellOf(nr.cells[uid]).w == null && moved(nr.key, uid), mkId, lb).forEach(function (s) { out.push(s); });
      };
      if (orig) {
        var started = {};
        origSets.forEach(function (s, i) {
          if (!s || s.extra) { out.push(s); return; }
          for (var li = 0; li < (origGroups || []).length; li++) if (origGroups[li][0] === i && !started[li]) { started[li] = 1; emit(exKey(first.key) + '|' + li, li); }
        });
      }
      lines.forEach(function (r) { if (!done[r.key]) emit(r.key, -1); });
      ex.sets = out;
      /* A NOTE TYPED FOR THIS WEEK (review, 26 Nov). The editor keeps a note typed on a line as that week's own (the
         cell's), and the sets carry it so the editor reads it back. But what Train shows under an exercise is the
         exercise's note, one for the week: so when a line's note for this week changed, the exercise's note that week is
         the first line's words (its own for the week, else the line's standing note), then any other line's own words.
         Without this the lifter typed a cue in the builder and Train still showed the old one. */
      var noteMoved = lines.some(function (r) { var br = B[r.key], b0 = br && br.cells[uid] ? cellOf(br.cells[uid]).note : null, n0 = cellOf(r.cells[uid]).note; return sig(b0) !== sig(n0); });
      if (noteMoved) {
        var said = [];
        lines.forEach(function (r, i) { var own = cellOf(r.cells[uid]).note, t = String(own != null && own !== '' ? own : (i === 0 ? r.note || '' : '')).trim(); if (t && said.indexOf(t) < 0) said.push(t); });
        ex.note = said.join(' · ');
      }
      return ex;
    }
    /* a day of a week: its exercises from the next block's lines that day, in their order */
    function dayOf(origDay, wi, kitName, nowName, uid, pool) {
      var lines = rowsIn(next, uid, nowName), ae = origDay ? origDay.exercises || [] : [];
      /* the app exercise each base key prefix was read from, in this week: by title and occurrence */
      var occ = {}, origByEx = {};
      ae.forEach(function (e, i) { var t = titleOf(e); occ[t] = (occ[t] || 0) + 1; origByEx[kitName + '|' + t + '|' + occ[t]] = i; });
      var groups = [], at = {};
      lines.forEach(function (r) { var k = exKey(r.key); if (at[k] == null) { at[k] = groups.length; groups.push([]); } groups[at[k]].push(r); });
      var exs = groups.map(function (g) {
        var k = exKey(g[0].key), oi = origByEx[k], orig = oi != null ? ae[oi] : null;
        /* a base line of this exercise must have been in this week for the old exercise to be the one */
        if (orig && !base.rows.some(function (r) { return exKey(r.key) === k && r.cells[uid]; })) orig = null;
        return exerciseOf(g, uid, orig, orig ? groupsOf(orig, lb) : null, pool);
      });
      var sameList = origDay && exs.length === ae.length && exs.every(function (e, i) { return e === ae[i]; });
      var sameName = !origDay || nowName === kitName;
      if (origDay && sameList && sameName) return origDay;
      var d = {};
      if (origDay) Object.keys(origDay).forEach(function (k) { d[k] = origDay[k]; });
      else { if (mkId) d.id = mkId(); d.name = nowName; }
      if (origDay && !sameName) d.name = nowName;
      d.exercises = exs;
      return d;
    }
    /* the app exercises a week drops (their lines gone from their day), offered to a day they moved to */
    function poolOf(wi, uid) {
      var pool = [], aw = prog.weeks[wi], names = map.weeks[wi] ? map.weeks[wi].names : [];
      (aw.days || []).forEach(function (d, di) {
        var kn = names[di]; if (!kn || dayLogged(d)) return;
        var occ = {};
        (d.exercises || []).forEach(function (e) {
          var t = titleOf(e); occ[t] = (occ[t] || 0) + 1; var k = kn + '|' + t + '|' + occ[t];
          var still = next.rows.some(function (r) { return exKey(r.key) === k && r.cells[uid]; });
          if (still) return;
          var bl = base.rows.filter(function (r) { return exKey(r.key) === k && r.cells[uid]; });
          if (bl.length) pool.push({ ex: e, lines: bl });
        });
      });
      return pool;
    }
    function weekSame(wi, uid) {
      var keys = {}; base.rows.forEach(function (r) { if (r.cells[uid]) keys[r.key] = 1; }); next.rows.forEach(function (r) { if (r.cells[uid]) keys[r.key] = 1; });
      for (var k in keys) if (hasOwn.call(keys, k)) { var br = B[k], nr = N[k]; if (!br || !nr || !br.cells[uid] || !nr.cells[uid] || br.day !== nr.day && dayNow[br.day] !== nr.day) return false; if (!lineSame(br, nr, uid)) return false; if (dayNow[br.day] !== br.day) return false; }
      var ob = rowsIn(base, uid).map(function (r) { return r.key; }).join('\n'), on = rowsIn(next, uid).map(function (r) { return r.key; }).join('\n');
      return ob === on;
    }
    function weekOf(wi, uid, c) {
      var aw = prog.weeks[wi], names = map.weeks[wi] ? map.weeks[wi].names : [];
      if (wi < wiLock) return aw;                                   /* before the week under way: as it is */
      if (weekSame(wi, uid)) return aw;
      var pool = poolOf(wi, uid), out = [], placed = {};
      (aw.days || []).forEach(function (d, di) {
        var kn = names[di];
        if (!kn || dayLogged(d)) { out.push(d); if (kn) placed[dayNow[kn] || kn] = 1; return; }   /* a rest day, a day under way */
        var now = dayNow[kn];
        if (now == null) { if (!(d.exercises || []).length) out.push(d); return; }   /* a day deleted in the editor */
        placed[now] = 1;
        out.push(dayOf(d, wi, kn, now, uid, pool));
      });
      /* days this week holds now that the app week had none of: after the day before them in the block's order */
      nNames.forEach(function (nm, i) {
        if (placed[nm] || !rowsIn(next, uid, nm).length) return;
        var nd = dayOf(null, wi, nm, nm, uid, pool), at = 0;
        for (var j = i - 1; j >= 0; j--) { var prev = nNames[j]; var k = out.map(function (x) { return x.name; }).lastIndexOf(prev); if (k >= 0) { at = k + 1; break; } }
        out.splice(at, 0, nd); placed[nm] = 1;
      });
      var w = {}; Object.keys(aw).forEach(function (k) { w[k] = aw[k]; });
      w.days = out;
      void c;
      return w;
    }
    function newWeekOf(uid, c, prevApp) {
      var days = [];
      nNames.forEach(function (nm) { if (!rowsIn(next, uid, nm).length) return; days.push(dayOf(null, -1, nm, nm, uid, null)); });
      /* the rest days the week before kept (a "Rest" between sessions) */
      if (prevApp) (prevApp.days || []).forEach(function (d, i) { if (!(d.exercises || []).length && /^(rest|off|recovery)\b/i.test(String(d.name || ''))) { var rd = { name: d.name, exercises: [] }; if (mkId) rd.id = mkId(); days.splice(Math.min(i, days.length), 0, rd); } });
      var w = { number: c + 1, days: days }; if (mkId) w.id = mkId();
      return w;
    }
    var weeks = [], changed = false;
    next.weeks.forEach(function (w, c) {
      var wi = bIdx[w.uid], out;
      if (wi != null && prog.weeks[wi]) out = weekOf(wi, w.uid, c);
      else out = newWeekOf(w.uid, c, weeks[weeks.length - 1] || null);
      if (out.number !== c + 1 && wi != null) { var cp = {}; Object.keys(out).forEach(function (k) { cp[k] = out[k]; }); cp.number = c + 1; out = cp; }
      if (wi == null || out !== prog.weeks[wi]) changed = true;
      weeks.push(out);
    });
    /* weeks the editor never showed (a coach's draft) stay at the end */
    (prog.weeks || []).forEach(function (w, i) { if (!base.weeks[i] && weeks.indexOf(w) < 0) weeks.push(w); });
    if (weeks.length !== prog.weeks.length) changed = true;
    var name = next.name && next.name !== base.name ? next.name : prog.name;
    if (name !== prog.name) changed = true;
    if (!changed) return { program: prog, changed: false };
    var p = {}; Object.keys(prog).forEach(function (k) { p[k] = prog[k]; });
    p.weeks = weeks; p.name = name;
    return { program: p, changed: true };
  }

  /* a new block (a starter, a template, a repeat, a blank one) as a program of the app's: every line's sets from its
     cell, each line written without kilos at the engine's load. o: { loads, id(), name, athleteId, programId } */
  function blockToProgram(json, o) {
    o = o || {};
    var mkId = typeof o.id === 'function' ? o.id : null, L = o.loads || {}, lb = !!o.lb;
    var names = (json.days || []).map(function (d) { return d.name; });
    var weeks = (json.weeks || []).map(function (w, c) {
      var days = [];
      names.forEach(function (nm) {
        var rows = (json.rows || []).filter(function (r) { return r.day === nm && r.cells && r.cells[w.uid]; });
        if (!rows.length) return;
        var groups = [], at = {};
        rows.forEach(function (r) { var k = exKey(r.key); if (at[k] == null) { at[k] = groups.length; groups.push([]); } groups[at[k]].push(r); });
        var exs = groups.map(function (g) {
          var f = g[0], ex = { lift: null, variant: '', exerciseName: '', note: f.note || '', sets: [] };
          if (mkId) ex.id = mkId();
          if (MAIN[f.lift]) { ex.lift = f.lift; ex.variant = f.variant || 'Competition'; ex.exerciseName = VNAME[f.lift][ex.variant] === f.name ? '' : f.name; }
          else { ex.lift = f.cat && !MAIN[f.cat] ? f.cat : 'other'; ex.exerciseName = f.name; }
          g.forEach(function (r) { var x = eff(r, r.cells[w.uid]), kg = L[r.key + '|' + w.uid]; for (var k = 0; k < Math.max(1, Math.round(x.n == null ? 1 : x.n)); k++) ex.sets.push(setOfCell(x, isNum(kg) ? kg : null, mkId, lb)); });
          return ex;
        });
        var d = { name: nm, exercises: exs }; if (mkId) d.id = mkId();
        days.push(d);
      });
      var wk = { number: c + 1, days: days }; if (mkId) wk.id = mkId();
      return wk;
    });
    var p = { id: o.programId, athleteId: o.athleteId, coachId: o.athleteId, name: o.name || json.name || 'My program', weeks: weeks };
    if (!p.id) delete p.id;
    return p;
  }

  /* Train pins a session to a date when it is opened on another day (day.scheduledDate): nothing the editor shows. When
     that is all that changed since the editor's last write (w), the pins are carried onto the program the editor writes
     against (p0), so its undo goes on working; anything else changed (a set logged) → null, and the editor opens again.
     w is the program as last written, a copy (Train changes the Store's objects in place). Train filling a set's empty
     note or tempo ('') is no change. */
  function carryPins(p0, w, now) {
    var strip = function (p) { return JSON.stringify(p, function (k, v) { return k === 'scheduledDate' || ((k === 'note' || k === 'tempo') && (v === '' || v == null)) ? undefined : v; }); };
    if (!p0 || !w || !now || strip(w) !== strip(now)) return null;
    var pins = {}; (now.weeks || []).forEach(function (wk) { (wk.days || []).forEach(function (d) { if (d && d.id != null) pins[d.id] = d.scheduledDate; }); });
    var changed = false;
    var weeks = (p0.weeks || []).map(function (wk) {
      var dch = false, days = (wk.days || []).map(function (d) {
        if (!d || d.id == null || !hasOwn.call(pins, d.id) || sig(pins[d.id]) === sig(d.scheduledDate)) return d;
        var y = {}; Object.keys(d).forEach(function (k) { y[k] = d[k]; }); if (pins[d.id] == null) delete y.scheduledDate; else y.scheduledDate = pins[d.id];
        dch = true; return y;
      });
      if (!dch) return wk; changed = true; var x = {}; Object.keys(wk).forEach(function (k) { x[k] = wk[k]; }); x.days = days; return x;
    });
    if (!changed) return p0;
    var o = {}; Object.keys(p0).forEach(function (k) { o[k] = p0[k]; }); o.weeks = weeks; return o;
  }

  /* =====================================================================================
     THE PAGE (athlete.html): the frame, the dataset, the writes
     ===================================================================================== */
  var MIN_W = 1180;        /* the window under which the editor no longer fits beside the sidebar: the phone builder */
  var S = { frame: null, prog: null, map: null, base: null, loads0: null, fp: null, writing: false, kit2app: {}, tplSeen: null, mountedFor: null };
  function doc() { return W.document; }
  function hasApp() { return typeof W.Store !== 'undefined' && W.Store && typeof W.Store.get === 'function'; }
  function me() { try { return typeof W.user !== 'undefined' ? W.user : (typeof user !== 'undefined' ? user : null); } catch (e) { return null; } }   // eslint-disable-line no-undef
  function curUser() { try { return (typeof getCurrentUser === 'function' && getCurrentUser()) || me(); } catch (e) { return me(); } }   // eslint-disable-line no-undef
  function fits() {
    var h = doc().documentElement;
    if (h.classList.contains('native')) return false;
    if (!W.matchMedia) return false;
    return W.matchMedia('(min-width: ' + MIN_W + 'px)').matches;
  }
  function newId() { try { if (typeof uid === 'function') return uid('x'); } catch (e) { /* fall through */ } return 'x-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }   // eslint-disable-line no-undef
  function store() { return W.Store.get(); }
  function myProgram(u) { return (store().programs || []).filter(function (p) { return p.athleteId === u.id; })[0] || null; }
  function fingerprint(p) { try { return JSON.stringify(p || null); } catch (e) { return String(Math.random()); } }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function themeNow() { var t = null; try { t = W.localStorage.getItem('powa-theme'); } catch (e) { t = null; } if (t !== 'light' && t !== 'dark') t = doc().documentElement.getAttribute('data-theme') === 'light' || doc().documentElement.classList.contains('light') ? 'light' : 'dark'; return t; }
  function unitNow() { try { return typeof getUnit === 'function' ? (/^lb/.test(getUnit()) ? 'lb' : 'kg') : (/^lb/.test(W.localStorage.getItem('powa-unit') || '') ? 'lb' : 'kg'); } catch (e) { return 'kg'; } }   // eslint-disable-line no-undef
  function isLb() { return unitNow() === 'lb'; }
  function maxesKey(pid) { return 'powa-solo-maxes:' + pid; }
  function readMaxes(pid) { try { var v = JSON.parse(W.localStorage.getItem(maxesKey(pid)) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  /* the lifter's own templates (programTemplates where coachId is their id) */
  function myTemplates(u) { return ((store().programTemplates) || []).filter(function (t) { return t && t.coachId === u.id && t.payload && t.payload.block; }); }
  var tplLoaded = false;
  function loadTemplates(u, then) {
    if (tplLoaded || W._demoMode || !W.DB || typeof W.DB.listTemplates !== 'function') { tplLoaded = true; then(); return; }
    tplLoaded = true;
    W.DB.listTemplates(u.id).then(function (list) {
      W.Store.update(function (s) { var keep = (s.programTemplates || []).filter(function (t) { return t.coachId !== u.id; }); s.programTemplates = keep.concat((list || []).filter(function (t) { return t.coachId === u.id; })); });
      then();
    }, function () { then(); });
  }
  /* the logs the kit reads (data.js lifter.logs): the main lifts, newest last */
  function kitLogs(u) {
    var LN = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
    return (store().workoutLogs || []).filter(function (l) { return l.athleteId === u.id && MAIN[l.lift]; }).map(function (l) {
      return { d: d10(l.date), lift: l.lift, title: !l.variant || l.variant === 'Competition' ? LN[l.lift] : (VNAME[l.lift][l.variant] || l.variant), w: inUnit(l.weight, isLb()) || 0, r: Number(l.reps) || 0, rpe: l.rpe == null || l.rpe === '' ? null : Number(l.rpe), e1: Number(l.e1rmComp) || null, pr: false, note: l.note || '' };
    }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  }
  function hasContent(p) { return !!(p && (p.weeks || []).some(function (w) { return (w.days || []).some(function (d) { return (d.exercises || []).length; }); })); }

  /* the one lifter the editor shows: you */
  function dataset() {
    var u = curUser(); if (!u || !hasApp()) return null;
    var p = myProgram(u), has = hasContent(p);
    var te = has ? toEditor(p, { today: todayIso(), maxes: readMaxes(p.id), lb: isLb() }) : null;
    S.lb = isLb();
    S.prog = has ? p : null; S.last = fingerprint(p); S.map = te ? te.map : null; S.fp = fingerprint(p); S.base = null; S.loads0 = null;
    var nm = String(u.name || 'You').trim() || 'You', first = nm.split(/\s+/)[0];
    var lifts = {};
    ['squat', 'bench', 'deadlift'].forEach(function (k) { var e1 = 0; try { e1 = typeof bestE1RM === 'function' ? bestE1RM(u.id, k) : 0; } catch (e) { e1 = 0; } lifts[k] = { e1: e1 ? Math.round(inUnit(e1, isLb()) * 10) / 10 : null, was: null, delta: null, series: [] }; });   // eslint-disable-line no-undef
    var tpls = myTemplates(u).map(function (t) { return { name: t.name, block: t.payload.block, appId: t.id }; });
    S.given = {}; tpls.forEach(function (t) { S.given[t.appId] = 1; });
    S.kit2app = {};
    return JSON.stringify({ today: todayIso(), unit: unitNow(), theme: themeNow(), demo: !!W._demoMode,
      lifter: { id: 'me', name: nm, first: first, sex: u.sex || null, lifts: lifts, logs: kitLogs(u), program: te ? te.program : null, intake: null },
      templates: tpls });
  }
  function loadsOf(json) { try { return JSON.parse(json || '{}') || {}; } catch (e) { return {}; } }
  function ready(baseJson, loadsJson) {
    try { S.base = JSON.parse(baseJson); } catch (e) { S.base = null; }
    S.loads0 = loadsOf(loadsJson);
  }
  function writeProgram(p, how) {
    var u = curUser(); if (!u) return;
    S.writing = true;
    try {
      W.Store.update(function (s) {
        var i = (s.programs || []).findIndex(function (x) { return x.athleteId === u.id; });
        if (i >= 0) s.programs[i] = p; else s.programs.push(p);
      });
      if (typeof persistProgram === 'function') persistProgram(p.id);   // eslint-disable-line no-undef
    } finally { S.writing = false; }
    S.fp = fingerprint(p); S.last = S.fp;
    S.trainStale = true;   /* Train drew the program as it was: it is drawn again when the lifter leaves the builder */
    void how;
  }
  /* every edit, undo and redo in the editor */
  function saved(json, loadsJson) {
    if (!S.prog || !S.base) return { error: 'not ready' };
    var next; try { next = JSON.parse(json); } catch (e) { return { error: 'unreadable' }; }
    var r = applyBlock(S.prog, S.map, S.base, next, { loads0: S.loads0, loads: loadsOf(loadsJson), id: newId, lb: !!S.lb });
    if (r.error) { try { console.warn('LifterProgram: refused a write: ' + r.error); } catch (e) { /* none */ } return { error: r.error }; }
    var nowP = r.changed ? r.program : S.prog;
    writeProgram(nowP, 'edit');
    return { ok: true, changed: r.changed };
  }
  /* a new block in place of the program (the app's own "Build a block" does the same: the program keeps its id; the
     logged sets stay in the lifter's history, workoutLogs) */
  function replace(json, loadsJson, name) {
    var u = curUser(); if (!u) return { error: 'no user' };
    var j; try { j = JSON.parse(json); } catch (e) { return { error: 'unreadable' }; }
    var cur0 = myProgram(u);
    var p = blockToProgram(j, { loads: loadsOf(loadsJson), id: newId, name: name || j.name, athleteId: u.id, programId: cur0 ? cur0.id : newId(), lb: isLb() });
    if (cur0 && cur0.setFields) p.setFields = cur0.setFields;
    /* the training maxes the new block was started from are its typed maxes, so the editor shows the numbers the loads came from */
    try { var mx = {}; ['squat', 'bench', 'deadlift'].forEach(function (k) { if (j.maxes && num(j.maxes[k]) && j.maxFrom && j.maxFrom[k] === 'typed') mx[k] = toKg(j.maxes[k], isLb()); }); W.localStorage.setItem(maxesKey(p.id), JSON.stringify(mx)); } catch (e) { /* storage refused */ }
    writeProgram(p, 'replace');
    try { if (typeof _selfBuilderActiveWeek !== 'undefined') _selfBuilderActiveWeek = 0; } catch (e) { /* none */ }   // eslint-disable-line no-undef
    setTimeout(function () { remount(); }, 0);
    return { ok: true };
  }
  function maxes(json) {
    var p = S.prog; if (!p) return;
    try { var m = JSON.parse(json) || {}, kg = {}; Object.keys(m).forEach(function (k) { if (num(m[k])) kg[k] = toKg(m[k], !!S.lb); }); W.localStorage.setItem(maxesKey(p.id), JSON.stringify(kg)); } catch (e) { /* storage refused: the maxes stay for this visit */ }
  }
  /* A template's write to the account (a real account only: the demo keeps templates for the visit).
     Review, 27 Nov: a save that failed (offline, an expired session) was only written to the console, so the template
     stayed on screen until a reload and was then gone with no word. Now the lifter is told, the write is kept
     (S.tplPend: id -> 'save' | 'delete') and tried again when the connection is back, on the next template change and
     when the builder next opens; when it lands they are told that too. S.tplNew holds the templates made in this visit
     whose first save has not landed: those are inserted, the rest updated. One template's writes run one after another
     (S.tplQ), so a change never overtakes the insert it depends on. A write reads the template as it is in the Store
     when it runs, so a retry always sends the latest. */
  function tplLive() { return !W._demoMode && !!W.DB && typeof W.DB.addTemplate === 'function'; }
  function tplSay(msg) { try { if (typeof W.toast === 'function') W.toast(msg, 6000); else if (typeof toast === 'function') toast(msg, 6000); } catch (e) { /* no toast on this page */ } }   // eslint-disable-line no-undef
  function tplWrite(id, kind) {
    if (!tplLive() || !id) return null;
    S.tplQ = S.tplQ || {}; S.tplPend = S.tplPend || {}; S.tplNew = S.tplNew || {}; S.tplWait = S.tplWait || {};
    /* the same write is already waiting its turn: it reads the template when it runs, so it will send this change too */
    if (S.tplWait[id] === kind) return S.tplQ[id];
    S.tplWait[id] = kind;
    var run = function () {
      if (S.tplWait[id] === kind) delete S.tplWait[id];
      var t = ((store().programTemplates) || []).filter(function (y) { return y && y.id === id; })[0] || null;
      var job = null, added = false;
      if (kind === 'delete') { if (!S.tplNew[id]) job = W.DB.deleteTemplate(id); }                       /* never reached the account: nothing to remove there */
      else if (t && S.tplNew[id]) { job = W.DB.addTemplate(t); added = true; }
      else if (t && typeof W.DB.updateTemplate === 'function') job = W.DB.updateTemplate(id, { name: t.name, payload: t.payload });
      /* (a save whose template has gone since: nothing to send, its delete follows in the queue) */
      var sent = job != null;
      return Promise.resolve(job).then(function () {
        var was = !!S.tplPend[id];
        if (added || kind === 'delete') delete S.tplNew[id];
        if (kind === 'delete' || S.tplPend[id] === kind) delete S.tplPend[id];
        /* the lifter was told it failed: told when it lands (only when something was really sent) */
        if (was && sent && !Object.keys(S.tplPend).length) { S.tplToldAt = 0; tplSay(kind === 'delete' ? 'Template removed from your account.' : 'Template saved to your account.'); }
      }, function (e) {
        try { console.error('template ' + kind, e); } catch (e2) { /* none */ }
        S.tplPend[id] = kind;
        /* said once for a burst (several templates fail together when the connection drops) */
        var now = Date.now();
        if (!S.tplToldAt || now - S.tplToldAt > 30000) {
          S.tplToldAt = now;
          tplSay(kind === 'delete' ? 'Could not remove the template from your account. Keep this page open: it will try again when you are back online.' : 'Could not save the template to your account. Keep this page open: it will try again when you are back online.');
        }
      });
    };
    S.tplQ[id] = (S.tplQ[id] || Promise.resolve()).then(run, run);
    return S.tplQ[id];
  }
  function tplRetry() { var p = S.tplPend || {}; Object.keys(p).forEach(function (id) { tplWrite(id, p[id]); }); }
  /* the editor's templates (own ones: { kitId, name, block }) against the app's: added, renamed, changed, removed */
  function templates(json) {
    var u = curUser(); if (!u) return;
    tplRetry();   /* writes that failed earlier go first; this call's own follow them in each template's queue */
    var list; try { list = JSON.parse(json) || []; } catch (e) { return; }
    var mine = myTemplates(u), byApp = {}; mine.forEach(function (t) { byApp[t.id] = t; });
    var seen = {};
    list.forEach(function (x) {
      var aid = x.appId || S.kit2app[x.kitId] || null, t = aid ? byApp[aid] : null;
      if (!t) {
        var nt = { id: newId(), coachId: u.id, name: x.name, createdAt: Date.now(), payload: { solo: 1, unit: unitNow(), block: x.block } };
        S.kit2app[x.kitId] = nt.id; seen[nt.id] = 1; S.given = S.given || {}; S.given[nt.id] = 1;   /* the editor's own: its to drop */
        W.Store.update(function (s) { s.programTemplates = s.programTemplates || []; s.programTemplates.push(nt); });
        if (tplLive()) { S.tplNew = S.tplNew || {}; S.tplNew[nt.id] = 1; tplWrite(nt.id, 'save'); }
        return;
      }
      seen[t.id] = 1; S.kit2app[x.kitId] = t.id;
      var nameCh = t.name !== x.name, blockCh = JSON.stringify(t.payload.block) !== JSON.stringify(x.block);
      if (!nameCh && !blockCh) return;
      W.Store.update(function (s) { (s.programTemplates || []).forEach(function (y) { if (y.id === t.id) { y.name = x.name; y.payload = { solo: 1, unit: unitNow(), block: x.block }; } }); });
      tplWrite(t.id, 'save');
    });
    mine.forEach(function (t) {
      /* only a template the editor was given and no longer has is gone (one saved elsewhere since is not the editor's to drop) */
      if (seen[t.id] || !(S.given && S.given[t.id])) return;
      W.Store.update(function (s) { s.programTemplates = (s.programTemplates || []).filter(function (y) { return y.id !== t.id; }); });
      tplWrite(t.id, 'delete');
    });
  }

  /* ---------------- the frame ---------------- */
  function pane() { return doc().getElementById('pane-program'); }
  function frameUrl() { return '/coach-preview/desk/programs.html?solo=1&theme=' + themeNow() + '#solo'; }
  function remount() { var p = pane(); if (S.frame && p && !p.classList.contains('hidden')) { unmount(); mount(); } else unmount(); }
  function unmount() {
    var p = pane(); if (S.frame && S.frame.parentNode) S.frame.parentNode.removeChild(S.frame);
    S.frame = null; S.mountedFor = null;
    if (p) p.classList.remove('lp-on');
    var fp = doc().getElementById('fullProgram'); if (fp) fp.hidden = false;
    doc().documentElement.classList.remove('lp-active');
  }
  /* the editor in the Program pane: true when it is there (renderProgramTab draws nothing else) */
  function mount() {
    var u = curUser(); if (!u || u.coachId || !hasApp() || !fits()) { if (S.frame) unmount(); return false; }
    var p = pane(), fp = doc().getElementById('fullProgram'); if (!p || !fp) return false;
    tplRetry();   /* a template write that failed earlier is tried again each time the builder opens */
    var mp = myProgram(u), now = fingerprint(mp);
    /* only a pin changed since (Train opened a session on another day): carried onto the editor's program, frame kept */
    if (S.frame && S.frame.isConnected && S.mountedFor === u.id && now !== S.fp && S.prog && S.last) { var cp = null; try { cp = carryPins(S.prog, JSON.parse(S.last), mp); } catch (e) { cp = null; } if (cp) { S.prog = cp; S.last = now; S.fp = now; } }
    /* the same program as the frame holds (its own writes included): keep it, with its undo */
    if (S.frame && S.frame.isConnected && S.mountedFor === u.id && now === S.fp) { p.classList.add('lp-on'); fp.hidden = true; doc().documentElement.classList.add('lp-active'); size(); focusFrame(); return true; }
    if (S.frame) unmount();
    var f = doc().createElement('iframe');
    f.className = 'lp-frame'; f.title = 'Program builder';
    f.setAttribute('allow', 'clipboard-write');
    p.classList.add('lp-on'); fp.hidden = true; doc().documentElement.classList.add('lp-active');
    p.appendChild(f);
    S.frame = f; S.mountedFor = u.id; S.fp = now;
    size(); if (W.requestAnimationFrame) W.requestAnimationFrame(size);
    f.addEventListener('load', function () { size(); focusFrame(); });
    /* a signed-in lifter's own templates are read once (the app's hydration reads a coach's only); the editor opens
       with them, or after 2.5 s without them */
    var opened = false, open = function () { if (opened || S.frame !== f) return; opened = true; f.setAttribute('src', frameUrl()); };
    loadTemplates(u, open); setTimeout(open, 2500);
    return true;
  }
  /* the keys are the editor's while its tab is the one showing (review, 26 Nov): the sidebar's Program button kept the
     focus after its click, so Undo (Cmd or Ctrl Z) and the arrow keys went nowhere until the lifter clicked in the editor */
  function focusFrame() {
    var f = S.frame, p = pane(); if (!f || !p || p.classList.contains('hidden')) return;
    setTimeout(function () { try { if (S.frame === f && f.contentWindow && !pane().classList.contains('hidden')) f.contentWindow.focus(); } catch (e) { /* not ready */ } }, 80);
  }
  /* the frame's height is the window's below its top (its own panes scroll inside it) */
  function size() {
    var f = S.frame; if (!f || !f.isConnected) return;
    var r = f.getBoundingClientRect(), host = f.closest ? f.closest('.dash-main') : null, bottom = host ? host.getBoundingClientRect().bottom : (W.innerHeight || 800);
    bottom = Math.min(bottom, W.innerHeight || bottom);
    /* the demo's bar floats over the foot of the window: the editor ends above it while it is up, so its last rows and
       its own foot (the hint, the hard-set counts) are never under the bar; closing the bar gives the room back */
    var bar = doc().querySelector('.demo-banner');
    if (bar && bar.getClientRects().length) { var bt = bar.getBoundingClientRect().top; if (bt > r.top + 420) bottom = Math.min(bottom, bt + 4); }   /* (the bar is fixed: offsetParent says nothing) */
    f.style.height = Math.max(420, Math.floor(bottom - r.top - 12)) + 'px';
    /* the frame's colour scheme is the app's: a frame whose page differs gets an opaque backdrop from the browser */
    f.style.colorScheme = themeNow();
  }
  if (W.addEventListener && doc()) {
    W.addEventListener('resize', function () {
      if (!S.frame && !fits()) return;
      var p = pane(); if (!p || p.classList.contains('hidden')) return;
      /* across the width the editor needs, the builder changes: the editor, or the phone builder */
      if (S.frame && !fits()) { unmount(); try { if (typeof renderProgramTab === 'function') renderProgramTab(); } catch (e) { /* none */ } return; }   // eslint-disable-line no-undef
      if (!S.frame && fits()) { try { if (typeof renderProgramTab === 'function') renderProgramTab(); } catch (e) { /* none */ } return; }   // eslint-disable-line no-undef
      size();
    });
    /* the demo's bar closed (or anything else that moves the foot): measured again once the click has done its work */
    doc().addEventListener('click', function (e) {
      if (S.frame) setTimeout(size, 60);
      /* leaving the builder after an edit (review, 26 Nov): no tab draws Train on its click, so it still showed the load
         and the note from before the edit. Train and its day list are drawn once from the program as it now stands. */
      var t = e && e.target && e.target.closest ? e.target.closest('.sidebar-tab') : null;
      if (t && S.trainStale && t.getAttribute('data-tab') !== 'program') {
        S.trainStale = false;
        setTimeout(function () { try { if (typeof populateDaySelect === 'function') populateDaySelect(); if (typeof refreshPinButtons === 'function') refreshPinButtons(); if (typeof renderToday === 'function') renderToday(); } catch (err) { /* Train draws on its own next time */ } }, 0);   // eslint-disable-line no-undef
      }
    }, true);
    /* the theme switch: the editor follows (its own html data-theme) */
    W.addEventListener('storage', function (e) { if (e && e.key === 'powa-theme') pushTheme(); });
    /* the connection is back: a template write that failed goes again */
    W.addEventListener('online', function () { tplRetry(); });
  }
  function pushTheme() { var f = S.frame; if (!f || !f.contentWindow) return; f.style.colorScheme = themeNow(); try { if (f.contentWindow.SOLO && typeof f.contentWindow.SOLO.theme === 'function') f.contentWindow.SOLO.theme(themeNow()); } catch (e) { /* not ready */ } }
  if (typeof MutationObserver !== 'undefined' && doc() && doc().documentElement) {
    try { new MutationObserver(function () { pushTheme(); }).observe(doc().documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] }); } catch (e) { /* none */ }
  }

  W.LifterProgram = {
    /* pure */
    toEditor: toEditor, applyBlock: applyBlock, blockToProgram: blockToProgram, carryPins: carryPins, weekIdx: weekIdx, groupsOf: groupsOf, isLogged: isLogged, cellEq: cellEq, titleOf: titleOf,
    MIN_W: MIN_W,
    /* the page */
    mount: mount, unmount: unmount, size: size, fits: fits,
    /* the frame's calls */
    dataset: dataset, ready: ready, saved: saved, replace: replace, templates: templates, maxes: maxes, theme: themeNow,
    _state: S
  };
})();
