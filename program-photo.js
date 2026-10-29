// program-photo.js: Program from a photo (2026-10-28).
// A coach drops a screenshot, a photo of a printout or a PDF of a program. The program-read edge
// function (Gemini) reads it into the builder's own cell notation ("1x3 @8, 3x5 160kg @7"); the coach
// checks every cell beside the picture, then uses it for a lifter or keeps it as a template through
// the same paths as Paste a program (coach.html importUseFor / importSaveTemplate). Nothing is saved
// until they say so, and nothing is kept on the server.
// The demo (?demo=1) reads a bundled sample (demo-media/sample-program.jpg) with a canned result, so a
// pitch works offline and never calls the function.
// IMPORTS (2026-10-28): a few files in a row (Everfit prints one workout per PDF): read one after another at
// the reader's pace (3 a minute, 15 a day per coach: program-read), lined up by day and week (mergeReads);
// a spreadsheet chosen here goes to the import intake (SwitchKit.openIntake, import-ui.js), and a program
// read from a spreadsheet comes back into this same check (openReview({ read, source })).
(function () {
  'use strict';

  var MAX_SIDE = 2000, JPEG_Q = 0.85, MAX_SEND = 6 * 1024 * 1024, MAX_PICK = 40 * 1024 * 1024, MAX_FILES = 8;
  var SHEET_FILE = /\.(csv|tsv|txt|xlsx|xlsm|xls|ods|numbers|zip|json)$/i;
  var SENT = [];   // when this page last sent files to the reader (its burst limit is 3 a minute)
  var TYPES = /^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/i;
  var SAMPLE_IMG = 'demo-media/sample-program.jpg';
  var IC_PHOTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M21 15.5l-4.6-4.6a1.5 1.5 0 0 0-2.1 0L5.5 19.5"/></svg>';
  var IC_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';
  var IC_SHEET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M3.5 15h17M9.5 4v16"/></svg>';
  var IC_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  // The new parts of the check (several files, a spreadsheet as the source); coach-ui.css styles the rest.
  function ensureCss() {
    if (document.getElementById('pp-more-style')) return;
    var st = document.createElement('style'); st.id = 'pp-more-style';
    st.textContent = [
      '.pp-pager{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 8px}',
      '.pp-pager span{font-size:13px;font-weight:600;color:var(--text-2);font-variant-numeric:tabular-nums}',
      '.pp-pager button{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:50%;background:var(--ch-fill-3,rgba(255,255,255,.08));color:var(--text);cursor:pointer}',
      '.pp-pager button:disabled{opacity:.4;cursor:default}',
      '.pp-pager svg{width:16px;height:16px}',
      '.pp-readnotes{margin:0 0 12px;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--ch-warn,#ffb35c) 12%,transparent);color:var(--text);font-size:14px;line-height:1.45}',
      '.pp-readnotes p{margin:0}.pp-readnotes p+p{margin-top:4px}',
      '.pp-sheet.is-sheet .pp-pic{max-height:none}',
      '.pp-sheet.is-sheet .pp-file{padding:14px 16px}',
      /* the name field fills its row, so the row is the tap target; the picked week reads in light too (--bg-0 isn't a token) */
      '.pp-sheet .pp-namerow{padding-top:0;padding-bottom:0}',
      '.pp-sheet .pp-namerow input.pp-pname{min-height:44px;padding:10px 0}',
      '.pp-sheet .pp-weeks button.on{color:var(--bg,#0b0b0c)}',
      '@media (prefers-reduced-motion:reduce){.pp-pager button{transition:none}}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function clean(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 200).trim(); }
  function nid(p) { return typeof uid === 'function' ? uid(p) : p + Math.random().toString(36).slice(2, 10); }

  // ===================================================================== pure
  // The function's read (or the demo's canned one) -> the draft the review edits:
  // { name, unit, weeks, days: [{ id, name, exercises: [{ id, name, lift, variant, exerciseName, note,
  //   cells: [text per week], unsure: { weekIndex: why } (-1 = the whole row) }] }] }
  function draftFromRead(read) {
    if (!read || typeof read !== 'object' || !Array.isArray(read.days)) return null;
    var widest = 0;
    read.days.forEach(function (d) { ((d && d.exercises) || []).forEach(function (e) { if (e && Array.isArray(e.cells)) widest = Math.max(widest, e.cells.length); }); });
    var weeks = Math.min(16, Math.max(1, Math.round(Number(read.weeks)) || widest || 1));
    var days = read.days.slice(0, 7).map(function (d, di) {
      var exs = ((d && d.exercises) || []).slice(0, 20).map(function (e) {
        var cells = [];
        for (var w = 0; w < weeks; w++) cells.push(clean(e && Array.isArray(e.cells) ? e.cells[w] : '', 200));
        var name = clean(e && e.name, 80);
        var m = typeof matchExercise === 'function' ? matchExercise(name) : { lift: 'other', variant: '', exerciseName: name };
        return { id: nid('ppx'), name: name, lift: m.lift, variant: m.variant, exerciseName: m.exerciseName, note: clean(e && e.note, 160), cells: cells, unsure: {} };
      });
      return { id: nid('ppd'), name: clean(d && d.name, 80) || 'Day ' + (di + 1), exercises: exs };
    });
    // "unsure" points at the read's own positions (1-based; week 0 = the whole row).
    (Array.isArray(read.unsure) ? read.unsure : []).forEach(function (u) {
      var d = days[(Number(u && u.day) || 0) - 1], ex = d && d.exercises[(Number(u && u.exercise) || 0) - 1];
      var w = Math.round(Number(u && u.week) || 0), why = clean(u && u.why, 120);
      if (ex && why && w >= 0 && w <= weeks) ex.unsure[w ? w - 1 : -1] = why;
    });
    days.forEach(function (d) { d.exercises = d.exercises.filter(function (e) { return e.name && e.cells.some(function (c) { return c; }); }); });
    days = days.filter(function (d) { return d.exercises.length; });
    if (!days.length) return null;
    return { name: clean(read.name, 80), unit: read.unit === 'lb' ? 'lb' : 'kg', weeks: weeks, days: days };
  }

  // One cell: the builder's own reader (app.js gridParseCell). '' is a rest week for that exercise.
  function cellRead(text, lift) {
    var t = String(text || '').trim();
    if (!t) return { state: 'empty', sets: [] };
    var sets = typeof gridParseCell === 'function' ? gridParseCell(t, null, lift, null) : null;
    return sets && sets.length ? { state: 'ok', sets: sets } : { state: 'bad', sets: [] };
  }

  // Everything the coach should look at: cells that don't read, and what the reader wasn't sure of.
  function draftIssues(draft) {
    var out = { bad: 0, unsure: 0, list: [] };
    if (!draft) return out;
    draft.days.forEach(function (d, di) {
      d.exercises.forEach(function (ex, ei) {
        if (ex.unsure[-1]) { out.unsure++; out.list.push({ d: di, e: ei, w: -1, kind: 'unsure', why: ex.unsure[-1] }); }
        for (var w = 0; w < draft.weeks; w++) {
          var st = cellRead(ex.cells[w], ex.lift).state;
          if (st === 'bad') { out.bad++; out.list.push({ d: di, e: ei, w: w, kind: 'bad', why: ex.unsure[w] || 'Needs sets x reps, like 3x5 @8' }); }
          else if (ex.unsure[w]) { out.unsure++; out.list.push({ d: di, e: ei, w: w, kind: 'unsure', why: ex.unsure[w] }); }
        }
      });
    });
    return out;
  }

  // The draft -> program weeks in the shape parseProgramSheet returns (weeks > days > exercises > sets).
  // A cell that doesn't read is left out; a week or a day with nothing in it drops; weeks renumber.
  function draftToWeeks(draft) {
    var weeks = [], stats = { weeks: 0, days: 0, exercises: 0, sets: 0, left: 0 };
    if (!draft) return { weeks: weeks, stats: stats };
    var dayNames = {};
    for (var w = 0; w < draft.weeks; w++) {
      var wk = { id: nid('wk'), number: weeks.length + 1, days: [] };
      draft.days.forEach(function (d) {
        var exs = [];
        d.exercises.forEach(function (ex) {
          var r = cellRead(ex.cells[w], ex.lift);
          if (r.state === 'bad') { stats.left++; return; }
          if (r.state !== 'ok') return;
          exs.push({ id: nid('ex'), lift: ex.lift, variant: ex.variant || '', exerciseName: ex.exerciseName || '', note: ex.note || '', sets: r.sets });
          stats.sets += r.sets.length;
        });
        if (exs.length) { wk.days.push({ id: nid('day'), name: d.name, exercises: exs }); dayNames[d.name] = 1; }
      });
      if (wk.days.length) weeks.push(wk);
    }
    stats.weeks = weeks.length;
    stats.days = Object.keys(dayNames).length;
    stats.exercises = draft.days.reduce(function (n, d) { return n + d.exercises.length; }, 0);
    return { weeks: weeks, stats: stats };
  }

  // Several reads (a few files in a row) → one read. Days line up by name: a day already filled in a week
  // puts its next copy in the following week (a PDF per workout, or a PDF per week of the same days); a day
  // not seen yet joins the list. A file of several weeks keeps them. The unsure marks follow their day.
  function mergeReads(reads) {
    reads = (reads || []).filter(function (r) { return r && Array.isArray(r.days); });
    if (!reads.length) return null;
    if (reads.length === 1) return reads[0];
    var out = { name: reads[0].name || '', unit: reads[0].unit === 'lb' ? 'lb' : 'kg', weeks: 1, days: [], unsure: [] };
    var key = function (n) { return String(n || '').trim().toLowerCase().replace(/\s+/g, ' '); };
    var filled = {};
    reads.forEach(function (r) {
      var widest = 0;
      r.days.forEach(function (d) { ((d && d.exercises) || []).forEach(function (e) { if (e && Array.isArray(e.cells)) widest = Math.max(widest, e.cells.length); }); });
      var w = Math.max(1, Math.min(16, Math.round(Number(r.weeks)) || widest || 1));
      var where = {};   // this read's 'day.exercise' (1-based) → the merged one
      r.days.forEach(function (d, di) {
        if (!d) return;
        var k = key(d.name) || 'day ' + (di + 1);
        var day = null;
        for (var x = 0; x < out.days.length; x++) if (out.days[x]._k === k) day = out.days[x];
        if (!day) { day = { _k: k, name: d.name || 'Day ' + (out.days.length + 1), exercises: [] }; out.days.push(day); }
        var at = filled[k] || 0, seen = {};
        ((d.exercises) || []).forEach(function (e, ei) {
          if (!e) return;
          var ek = key(e.name), occ = seen[ek] = (seen[ek] || 0) + 1;
          var same = day.exercises.filter(function (z) { return z._k === ek; });
          var row = same[occ - 1];
          if (!row) { row = { _k: ek, name: e.name, note: e.note || '', cells: [] }; day.exercises.push(row); }
          if (!row.note && e.note) row.note = e.note;
          for (var c = 0; c < w; c++) row.cells[at + c] = Array.isArray(e.cells) ? (e.cells[c] || '') : '';
          where[(di + 1) + '.' + (ei + 1)] = { day: out.days.indexOf(day) + 1, exercise: day.exercises.indexOf(row) + 1, at: at };
        });
        filled[k] = at + w;
      });
      (Array.isArray(r.unsure) ? r.unsure : []).forEach(function (u) {
        var m = u && where[(Number(u.day) || 0) + '.' + (Number(u.exercise) || 0)];
        if (m) out.unsure.push({ day: m.day, exercise: m.exercise, week: Number(u.week) > 0 ? m.at + Number(u.week) : 0, why: u.why });
      });
    });
    Object.keys(filled).forEach(function (k) { out.weeks = Math.max(out.weeks, filled[k]); });
    out.weeks = Math.min(16, out.weeks);
    out.days.forEach(function (d) {
      delete d._k;
      d.exercises.forEach(function (e) { delete e._k; for (var c = 0; c < out.weeks; c++) if (e.cells[c] == null) e.cells[c] = ''; e.cells.length = out.weeks; });
    });
    return out;
  }
  // How long to wait before the next file goes to the reader (it takes 3 a minute): 0, or until the
  // oldest of the last three sends is a minute old, plus a second spare. sent: times in ms.
  function readWait(sent, now) {
    var recent = (sent || []).filter(function (t) { return now - t < 60000; }).sort(function (a, b) { return a - b; });
    if (recent.length < 3) return 0;
    return Math.max(0, recent[recent.length - 3] + 61000 - now);
  }

  // ===================================================================== the file
  function fileToB64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).replace(/^data:[^,]*,/, '')); };
      fr.onerror = function () { rej(fr.error || new Error('read')); };
      fr.readAsDataURL(blob);
    });
  }
  // A picture shrinks to 2000 px on its long side as a JPEG (also drops the photo's location data);
  // a PDF goes as it is. HEIC that this browser can't draw goes as it is too (Gemini reads HEIC).
  function prepFile(file) {
    var type = String(file && file.type || '').toLowerCase();
    if (!type && /\.pdf$/i.test(file && file.name || '')) type = 'application/pdf';
    if (!type && /\.(heic|heif)$/i.test(file && file.name || '')) type = 'image/heic';
    if (!TYPES.test(type)) return Promise.reject(Object.assign(new Error('Use a photo, a screenshot or a PDF.'), { code: 'bad_type' }));
    if (file.size > MAX_PICK) return Promise.reject(Object.assign(new Error('That file is too big. Try a screenshot of the program instead.'), { code: 'too_big' }));
    if (type === 'application/pdf') {
      if (file.size > MAX_SEND) return Promise.reject(Object.assign(new Error('That PDF is over 6 MB. Try a screenshot of the program instead.'), { code: 'too_big' }));
      return fileToB64(file).then(function (b64) { return { b64: b64, mime: type, url: URL.createObjectURL(file), kind: 'pdf', name: file.name || 'Program.pdf' }; });
    }
    var url = URL.createObjectURL(file);
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { res(null); };
      img.src = url;
    }).then(function (img) {
      if (!img || !img.naturalWidth) {
        if (file.size > MAX_SEND) throw Object.assign(new Error('That picture is over 6 MB. Try a screenshot instead.'), { code: 'too_big' });
        return fileToB64(file).then(function (b64) { return { b64: b64, mime: type === 'image/gif' ? 'image/png' : type, url: url, kind: 'image', name: file.name || '', noPreview: true }; });
      }
      var k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      var g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   // a transparent PNG reads on white, not black
      g.drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(res, 'image/jpeg', JPEG_Q); }).then(function (blob) {
        if (!blob) throw new Error('That picture didn\'t open. Try a screenshot.');
        return fileToB64(blob).then(function (b64) { return { b64: b64, mime: 'image/jpeg', url: url, kind: 'image', name: file.name || '' }; });
      });
    });
  }

  // ===================================================================== the pick tile (inside Bring a program in)
  // opts: { athleteId, closeImport, sheet } -> the "From a photo" tile for the top of openSheetImport.
  function pickTile(opts) {
    var demo = !!window._demoMode;
    var tile = el('div', { class: 'pp-pick' + (demo ? ' is-demo' : '') });
    var ic = el('span', { class: 'pp-pick-ic', html: IC_PHOTO });
    var main = el('div', { class: 'pp-pick-main' });
    main.appendChild(el('b', { class: 'pp-pick-t' }, 'From a photo, a PDF or a file'));
    main.appendChild(el('span', { class: 'pp-pick-s' }, demo
      ? 'With your account it reads your own photos, PDFs and spreadsheet files. Here, try a sample.'
      : 'Screenshots, photos of a printout or PDFs (a few at once), or a spreadsheet file. You check every number before it\'s saved.'));
    var acts = el('div', { class: 'pp-pick-acts' });
    var input = el('input', { type: 'file', multiple: '', accept: 'image/*,application/pdf,.pdf,.heic,.heif,.csv,.tsv,.txt,.xlsx,.xlsm,.ods,.zip,.json,.xls,.numbers',
      hidden: '', 'aria-label': 'Choose photos, PDFs or a spreadsheet file of a program' });
    var go = function (list) {
      var files = [].slice.call(list && list.length != null ? list : (list ? [list] : [])).filter(Boolean);
      if (!files.length) return;
      if (demo) { toast('In the demo, try the sample. With your account it reads your own'); return; }
      // A spreadsheet (or a zip, a .json) is read by the import intake: a grid of weeks comes back here.
      var sheetFile = files.find(function (f) { return SHEET_FILE.test(f.name || '') || /csv|spreadsheet|excel|zip|json/i.test(f.type || ''); });
      if (sheetFile && window.SwitchKit && SwitchKit.openIntake) {
        if (opts.closeImport) opts.closeImport();
        SwitchKit.openIntake({ mode: 'program', athleteId: opts.athleteId, files: [sheetFile] });
        return;
      }
      if (opts.closeImport) opts.closeImport();
      if (files.length > MAX_FILES) toast('Reading the first ' + MAX_FILES + ' files. Bring the rest in after these.', 3600);
      openReview({ athleteId: opts.athleteId, files: files.slice(0, MAX_FILES) });
    };
    if (demo) {
      var sb = el('button', { class: 'btn ui-btn-soft pp-pick-btn', type: 'button' }, 'Read a sample program');
      sb.addEventListener('click', function () { if (opts.closeImport) opts.closeImport(); openReview({ athleteId: opts.athleteId, sample: true }); });
      acts.appendChild(sb);
      tile.appendChild(el('img', { class: 'pp-pick-thumb', src: SAMPLE_IMG, alt: 'A sample program: a 4-week block in a spreadsheet', loading: 'lazy' }));
    } else {
      var cb = el('button', { class: 'btn ui-btn-soft pp-pick-btn', type: 'button' }, 'Choose a file');
      cb.addEventListener('click', function () { input.click(); });
      acts.appendChild(cb);
      if (isDeskNow()) acts.appendChild(el('span', { class: 'pp-pick-hint' }, 'or drop it here, or paste it with ⌘V'));
      input.addEventListener('change', function () { go(input.files); input.value = ''; });
    }
    main.appendChild(acts);
    tile.insertBefore(ic, tile.firstChild);
    tile.appendChild(main);
    tile.appendChild(input);
    // Drop a file anywhere on the sheet, or paste a screenshot (⌘V) while it's open.
    var sheet = opts.sheet;
    if (sheet && !demo) {
      var over = function (e) { if (e.dataTransfer && [].slice.call(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); tile.classList.add('is-over'); } };
      sheet.addEventListener('dragenter', over);
      sheet.addEventListener('dragover', over);
      sheet.addEventListener('dragleave', function (e) { if (!sheet.contains(e.relatedTarget)) tile.classList.remove('is-over'); });
      sheet.addEventListener('drop', function (e) {
        var fs = e.dataTransfer && e.dataTransfer.files;
        tile.classList.remove('is-over');
        if (fs && fs.length) { e.preventDefault(); go(fs); }
      });
      var onPaste = function (e) {
        if (!document.body.contains(sheet)) { document.removeEventListener('paste', onPaste); return; }
        var items = [].slice.call((e.clipboardData && e.clipboardData.items) || []);
        var hasText = items.some(function (it) { return it.kind === 'string' && it.type === 'text/plain'; });
        var img = items.find(function (it) { return it.kind === 'file' && /^image\//.test(it.type); });
        if (img && !hasText) { e.preventDefault(); document.removeEventListener('paste', onPaste); go([img.getAsFile()]); }
      };
      document.addEventListener('paste', onPaste);
    }
    return tile;
  }

  // ===================================================================== the review
  // A sheet of its own: closing it after a read asks first, so a long check is never lost to a stray
  // click or Escape (uiSheet closes on both).
  function overlay(cls) {
    var veil = el('div', { class: 'ui-sheet-veil pp-veil', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Bring a program in' });
    var sheet = el('div', { class: 'ui-sheet ui-sheet-form pp-sheet ' + (cls || '') });
    veil.appendChild(sheet);
    var closed = false, guard = null;
    var close = function (force) {
      if (closed) return;
      if (!force && guard && guard()) {
        uiActionSheet('Discard this program?', [{ label: 'Discard it', danger: true, onClick: function () { close(true); } }]);
        return;
      }
      closed = true;
      document.removeEventListener('keydown', onKey);
      veil.classList.add('leaving');
      setTimeout(function () { veil.remove(); }, 200);
    };
    var onKey = function (e) {
      if (e.key !== 'Escape' || !document.body.contains(veil)) return;
      if (document.querySelector('.ui-sheet-veil:not(.pp-veil)')) return;   // a confirm on top handles its own Escape
      if (e.target && /^(TEXTAREA|INPUT)$/.test(e.target.tagName) && sheet.contains(e.target)) { e.target.blur(); return; }
      close();
    };
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    document.addEventListener('keydown', onKey);
    if (typeof _sheetSwallowEarlyClicks === 'function') _sheetSwallowEarlyClicks(veil);
    document.body.appendChild(veil);
    return { veil: veil, sheet: sheet, close: close, guard: function (fn) { guard = fn; }, isClosed: function () { return closed; } };
  }

  // opts: { athleteId, file } or { athleteId, sample: true }
  function openReview(opts) {
    var desk = isDeskNow();
    var ov = overlay(desk ? 'pp-wide' : 'pp-tall');
    var sheet = ov.sheet;
    var athletes = (Store.get().athletes || []);
    var ath = opts.athleteId ? (athletes.find(function (a) { return a.id === opts.athleteId; }) || null) : null;
    var first = ath ? String(ath.name || 'athlete').split(' ')[0] : '';
    var head = el('div', { class: 'pp-head' });
    var h = el('h3', { class: 'ui-sheet-h pp-h' }, 'Reading your program');
    var sub = el('p', { class: 'ui-sheet-sub pp-sub', 'aria-live': 'polite' }, '');
    var x = el('button', { class: 'pp-x', type: 'button', 'aria-label': 'Close', html: IC_X });
    x.addEventListener('click', function () { ov.close(); });
    var ht = el('div', { class: 'pp-head-t' }); ht.appendChild(h); ht.appendChild(sub);
    head.appendChild(ht); head.appendChild(x);
    var body = el('div', { class: 'pp-body' });
    var pic = el('div', { class: 'pp-pic' });
    var main = el('div', { class: 'pp-main' });
    body.appendChild(pic); body.appendChild(main);
    var foot = el('div', { class: 'pp-foot' });
    sheet.appendChild(head); sheet.appendChild(body); sheet.appendChild(foot);

    var file = null, draft = null, dirty = false, pics = [], picAt = 0, readMeta = null, readNotes = [];
    ov.guard(function () { return !!draft; });
    ensureCss();

    // ---- the picture ----
    var legend = function () {
      return el('p', { class: 'pp-legend', html: (file && file.kind === 'sheet' ? '' : '<b>Click the photo to zoom.</b> ') + 'Cells read like the builder: <code>3x5 @8</code> · <code>1x3 @8, 3x5 75%</code> · <code>4x6 140kg</code> · <code>3x8 2RIR</code> · <code>3x5 @7 tempo 3-1-0</code> · <code>4x3 70% paused 2s</code>. Leave a cell empty when it isn\'t done that week.' });
    };
    // Several files: one at a time, with a pager over it.
    var paintPics = function () {
      paintPic(pics[picAt]);
      if (pics.length < 2) return;
      var pager = el('div', { class: 'pp-pager' });
      var prev = el('button', { type: 'button', 'aria-label': 'Previous file', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>' });
      var next = el('button', { type: 'button', 'aria-label': 'Next file', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>' });
      if (picAt === 0) prev.disabled = true;
      if (picAt >= pics.length - 1) next.disabled = true;
      prev.addEventListener('click', function () { if (picAt > 0) { picAt--; paintPics(); } });
      next.addEventListener('click', function () { if (picAt < pics.length - 1) { picAt++; paintPics(); } });
      pager.appendChild(prev);
      pager.appendChild(el('span', { 'aria-live': 'polite' }, 'File ' + (picAt + 1) + ' of ' + pics.length));
      pager.appendChild(next);
      pic.insertBefore(pager, pic.firstChild);
    };
    var paintPic = function (f) {
      pic.innerHTML = '';
      if (!f) return;
      if (f.kind === 'sheet') {
        sheet.classList.add('is-sheet');
        pic.appendChild(el('div', { class: 'pp-file', html: IC_SHEET + '<span>' + escHtml(f.name || 'Your spreadsheet') + '</span>' }));
        if (desk) pic.appendChild(legend());
        return;
      }
      if (f.kind === 'pdf') {
        var ob = el('object', { class: 'pp-pdf', data: f.url, type: 'application/pdf', 'aria-label': 'Your PDF' });
        ob.appendChild(el('div', { class: 'pp-file', html: IC_DOC + '<span>' + escHtml(f.name || 'PDF') + '</span>' }));
        pic.appendChild(ob);
        return;
      }
      if (f.noPreview) { pic.appendChild(el('div', { class: 'pp-file', html: IC_PHOTO + '<span>' + escHtml(f.name || 'Photo') + '</span>' })); return; }
      var img = el('img', { src: f.url, alt: 'Your program, as you sent it' });
      var zoom = el('button', { class: 'pp-zoom', type: 'button', 'aria-label': 'Zoom the picture', 'aria-pressed': 'false', title: 'Click to zoom' });
      zoom.appendChild(img);
      zoom.addEventListener('click', function () { var on = pic.classList.toggle('is-zoom'); zoom.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      pic.appendChild(zoom);
      // The laptop has room under the photo: how a cell reads, so every edit lands the way the builder reads it.
      if (desk) pic.appendChild(legend());
      if (!desk) {
        var more = el('button', { class: 'pp-pic-more', type: 'button' }, 'Show the whole photo');
        more.addEventListener('click', function () { var on = pic.classList.toggle('is-open'); more.textContent = on ? 'Show less' : 'Show the whole photo'; });
        pic.appendChild(more);
      }
    };

    // ---- reading ----
    var reading = function () {
      h.textContent = 'Reading your program';
      sub.textContent = 'About 10 seconds. Nothing is saved until you say so.';
      main.innerHTML = '';
      var r = el('div', { class: 'pp-reading' });
      r.appendChild(el('div', { class: 'pp-bar', 'aria-hidden': 'true' }, el('i')));
      r.appendChild(el('p', {}, 'Reading the weeks, the days, and every set, rep, load and RPE.'));
      main.appendChild(r);
      foot.innerHTML = '';
      var cancel = el('button', { class: 'btn ui-btn-soft', type: 'button' }, 'Cancel');
      cancel.addEventListener('click', function () { ov.close(true); });
      foot.appendChild(el('div', { class: 'pp-foot-acts' }, cancel));
    };

    var failed = function (msg) {
      h.textContent = 'Couldn\'t read this one';
      sub.textContent = '';
      main.innerHTML = '';
      var r = el('div', { class: 'pp-reading pp-failed' });
      r.appendChild(el('p', {}, msg || 'Try a sharper picture, or paste the text.'));
      main.appendChild(r);
      foot.innerHTML = '';
      var again = el('button', { class: 'btn btn-primary', type: 'button' }, 'Try another file');
      var pick = el('input', { type: 'file', accept: 'image/*,application/pdf,.pdf,.heic,.heif', hidden: '' });
      pick.addEventListener('change', function () { var f = pick.files && pick.files[0]; if (f) { ov.close(true); openReview({ athleteId: opts.athleteId, file: f }); } });
      again.addEventListener('click', function () { pick.click(); });
      var paste = el('button', { class: 'btn ui-btn-soft', type: 'button' }, 'Paste the text instead');
      paste.addEventListener('click', function () { ov.close(true); if (typeof openSheetImport === 'function') openSheetImport(opts.athleteId || null); });
      foot.appendChild(el('div', { class: 'pp-foot-acts' }, paste, again, pick));
    };

    // ---- the check ----
    var focusCell = function (d, e, w) {
      var q = main.querySelector('[data-d="' + d + '"][data-e="' + e + '"]' + (w >= 0 ? '[data-w="' + w + '"]' : '.pp-name'));
      if (!q && !desk && w >= 0) { weekOn = w; paintMain(); q = main.querySelector('[data-d="' + d + '"][data-e="' + e + '"][data-w="' + w + '"]'); }
      if (q) { q.focus(); try { q.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (er) {} }
    };
    var paintSub = function () {
      var iss = draftIssues(draft), res = draftToWeeks(draft), st = res.stats;
      var n = iss.bad + iss.unsure;
      sub.innerHTML = '';
      sub.classList.add('pp-subrow');
      // A line that wraps breaks only after a "·": a number keeps its word ("4 weeks", never "4" / "weeks").
      var nb = ' ', dot = nb + '· ';
      var from = opts.sample ? 'Read from the sample' + dot : file && file.kind === 'sheet' ? 'Read from your spreadsheet' + dot
        : readMeta && readMeta.files > 1 ? 'Read from ' + (readMeta.read === readMeta.files ? readMeta.files + ' files' : readMeta.read + ' of ' + readMeta.files + ' files') + dot
        : 'Read from your ' + (file && file.kind === 'pdf' ? 'PDF' : 'photo') + dot;
      sub.appendChild(el('span', {}, from + st.weeks + nb + (st.weeks === 1 ? 'week' : 'weeks') + dot + st.days + nb + (st.days === 1 ? 'day' : 'days') + dot + st.sets + nb + 'sets'));
      if (n) {
        var nx = el('button', { class: 'pp-tocheck', type: 'button' }, n + ' to check');
        nx.addEventListener('click', function () { var it = draftIssues(draft).list[0]; if (it) focusCell(it.d, it.e, it.w); });
        sub.appendChild(nx);
      } else sub.appendChild(el('span', { class: 'pp-allok' }, 'All read'));
      paintFootNote(iss);
      return res;
    };
    var weekOn = 0;
    var cellNode = function (d, di, ex, ei, w) {
      var ta = el('textarea', { class: 'pp-cell', rows: '1', spellcheck: 'false', autocomplete: 'off', 'data-d': String(di), 'data-e': String(ei), 'data-w': String(w),
        'aria-label': (ex.name || 'Exercise') + ', week ' + (w + 1), placeholder: desk ? '' : 'Rest this week' });
      ta.value = ex.cells[w] || '';
      var paintState = function () {
        var st = cellRead(ta.value, ex.lift).state;
        ta.classList.toggle('is-bad', st === 'bad');
        ta.classList.toggle('is-unsure', st !== 'bad' && !!ex.unsure[w]);
        ta.classList.toggle('is-empty', st === 'empty');
        var why = st === 'bad' ? (ex.unsure[w] || 'Needs sets x reps, like 3x5 @8') : (ex.unsure[w] || '');
        if (why) ta.title = why; else ta.removeAttribute('title');
        var hint = ta.parentNode && ta.parentNode.querySelector('.pp-why');
        if (hint) { hint.textContent = why; hint.hidden = !why; hint.className = 'pp-why' + (st === 'bad' ? ' is-bad' : ''); }
      };
      var fit = function () { ta.style.height = 'auto'; ta.style.height = Math.max(ta.scrollHeight, 0) + 'px'; };
      ta.addEventListener('input', function () { ex.cells[w] = clean(ta.value, 200); delete ex.unsure[w]; dirty = true; fit(); paintState(); });
      ta.addEventListener('blur', function () { ta.value = ex.cells[w] || ''; paintState(); paintSub(); });
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); } });
      var wrap = el('div', { class: 'pp-cellw' });
      wrap.appendChild(ta);
      wrap.appendChild(el('span', { class: 'pp-why', hidden: '' }));
      setTimeout(function () { fit(); paintState(); }, 0);
      return wrap;
    };
    var nameNode = function (d, di, ex, ei) {
      var w = el('div', { class: 'pp-ex' });
      var dot = el('span', { class: 'pp-dot l-' + (MAIN_LIFTS.indexOf(ex.lift) >= 0 ? ex.lift : 'acc'), 'aria-hidden': 'true' });
      var nm = el('input', { type: 'text', class: 'pp-name', value: ex.name, 'data-d': String(di), 'data-e': String(ei), 'aria-label': 'Exercise name', maxlength: '80', spellcheck: 'false' });
      nm.addEventListener('input', function () {
        ex.name = clean(nm.value, 80);
        var m = matchExercise(ex.name);
        ex.lift = m.lift; ex.variant = m.variant; ex.exerciseName = m.exerciseName;
        delete ex.unsure[-1];
        dot.className = 'pp-dot l-' + (MAIN_LIFTS.indexOf(ex.lift) >= 0 ? ex.lift : 'acc');
        nm.classList.remove('is-unsure');
        dirty = true;
      });
      nm.addEventListener('blur', function () { paintSub(); });
      nm.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } });
      if (ex.unsure[-1]) { nm.classList.add('is-unsure'); nm.title = ex.unsure[-1]; }
      var rm = el('button', { class: 'pp-rm', type: 'button', 'aria-label': 'Leave out ' + (ex.name || 'this exercise'), html: IC_X });
      rm.addEventListener('click', function () {
        d.exercises.splice(ei, 1);
        draft.days = draft.days.filter(function (dd) { return dd.exercises.length; });
        dirty = true;
        if (!draft.days.length) { failed('Every exercise is left out. Pick the file again, or paste the text.'); draft = null; return; }
        paintMain();
      });
      w.appendChild(dot); w.appendChild(nm); w.appendChild(rm);
      return w;
    };
    // Laptop: the program as a grid (rows = day × exercise, columns = weeks), the picture beside it.
    var gridNode = function () {
      var scroll = el('div', { class: 'pp-gridw' });
      var t = el('table', { class: 'pp-grid' });
      var hr = el('tr');
      hr.appendChild(el('th', { class: 'pp-c0', scope: 'col' }, 'Exercise'));
      for (var w = 0; w < draft.weeks; w++) hr.appendChild(el('th', { scope: 'col' }, 'Week ' + (w + 1)));
      var thead = el('thead'); thead.appendChild(hr); t.appendChild(thead);
      var tb = el('tbody');
      draft.days.forEach(function (d, di) {
        var dr = el('tr', { class: 'pp-day' });
        var dn = el('th', { class: 'pp-c0', scope: 'rowgroup', colspan: String(draft.weeks + 1) });
        var dIn = el('input', { type: 'text', class: 'pp-dayname', value: d.name, 'aria-label': 'Day name', maxlength: '80', spellcheck: 'false' });
        dIn.addEventListener('input', function () { d.name = clean(dIn.value, 80) || d.name; dirty = true; });
        dn.appendChild(dIn); dr.appendChild(dn); tb.appendChild(dr);
        d.exercises.forEach(function (ex, ei) {
          var tr = el('tr');
          var c0 = el('th', { class: 'pp-c0', scope: 'row' });
          c0.appendChild(nameNode(d, di, ex, ei));
          tr.appendChild(c0);
          for (var w = 0; w < draft.weeks; w++) { var td = el('td'); td.appendChild(cellNode(d, di, ex, ei, w)); tr.appendChild(td); }
          tb.appendChild(tr);
        });
      });
      t.appendChild(tb);
      scroll.appendChild(t);
      return scroll;
    };
    // Phone: one week at a time, each exercise's cell under its name.
    var listNode = function () {
      var wrap = el('div', { class: 'pp-list' });
      if (draft.weeks > 1) {
        var seg = el('div', { class: 'pp-weeks', role: 'tablist', 'aria-label': 'Week' });
        for (var w = 0; w < draft.weeks; w++) (function (w) {
          var b = el('button', { type: 'button', role: 'tab', class: w === weekOn ? 'on' : '', 'aria-selected': w === weekOn ? 'true' : 'false' }, 'Week ' + (w + 1));
          var bad = draft.days.some(function (d) { return d.exercises.some(function (ex) { return cellRead(ex.cells[w], ex.lift).state === 'bad' || ex.unsure[w]; }); });
          if (bad) b.appendChild(el('i', { class: 'pp-wdot', 'aria-label': 'something to check' }));
          b.addEventListener('click', function () { weekOn = w; paintMain(); });
          seg.appendChild(b);
        })(w);
        wrap.appendChild(seg);
      }
      draft.days.forEach(function (d, di) {
        var sec = el('div', { class: 'pp-dsec' });
        var dIn = el('input', { type: 'text', class: 'pp-dayname', value: d.name, 'aria-label': 'Day name', maxlength: '80', spellcheck: 'false' });
        dIn.addEventListener('input', function () { d.name = clean(dIn.value, 80) || d.name; dirty = true; });
        sec.appendChild(dIn);
        d.exercises.forEach(function (ex, ei) {
          var row = el('div', { class: 'pp-row' });
          row.appendChild(nameNode(d, di, ex, ei));
          row.appendChild(cellNode(d, di, ex, ei, weekOn));
          sec.appendChild(row);
        });
        wrap.appendChild(sec);
      });
      return wrap;
    };
    var paintMain = function () {
      main.innerHTML = '';
      if (readNotes.length) {
        var nb = el('div', { class: 'pp-readnotes', role: 'status' });
        readNotes.forEach(function (t) { nb.appendChild(el('p', {}, t)); });
        main.appendChild(nb);
      }
      main.appendChild(desk ? gridNode() : listNode());
      paintSub();
    };
    var noteEl = el('p', { class: 'pp-note' });
    var paintFootNote = function (iss) {
      var n = iss.bad;
      noteEl.textContent = n ? n + (n === 1 ? ' cell doesn\'t read yet. Fix it, or it\'s left out.' : ' cells don\'t read yet. Fix them, or they\'re left out.') : (iss.unsure ? 'Check the marked cells against your photo.' : 'Every cell reads. Change anything you like.');
      noteEl.className = 'pp-note' + (n ? ' is-bad' : iss.unsure ? ' is-unsure' : '');
    };
    var paintFoot = function () {
      foot.innerHTML = '';
      var nameRow = el('label', { class: 'pp-namerow' });
      nameRow.appendChild(el('span', {}, 'Name'));
      var nm = el('input', { type: 'text', class: 'pp-pname', value: draft.name || 'Imported program', maxlength: '80', 'aria-label': 'Program name' });
      nm.addEventListener('input', function () { draft.name = clean(nm.value, 80); dirty = true; });
      nameRow.appendChild(nm);
      var left = el('div', { class: 'pp-foot-l' }, nameRow, noteEl);
      var acts = el('div', { class: 'pp-foot-acts' });
      var tpl = el('button', { class: 'btn ' + (ath ? 'ui-btn-soft' : 'btn-primary'), type: 'button' }, 'Save as template');
      var use = ath ? el('button', { class: 'btn btn-primary', type: 'button' }, 'Use for ' + first) : null;
      var save = function (asTpl) {
        var res = draftToWeeks(draft);
        if (!res.stats.sets) { toast('Nothing reads yet. Fix a cell first'); return; }
        var sf = typeof programSetFields === 'function' ? programSetFields({ weeks: res.weeks }) : null;
        var setFields = sf && (sf.on.length || sf.cols.length) ? sf : null;
        var name = clean(draft.name, 80) || 'Imported program';
        var done = function () { ov.close(true); };
        if (asTpl) { done(); if (typeof importSaveTemplate === 'function') importSaveTemplate(res.weeks, name, setFields, !!ath); return; }
        var go = function () { done(); if (typeof importUseFor === 'function') importUseFor(opts.athleteId, res.weeks, name, setFields, res.stats.sets); };
        if (typeof getProgramForAthlete === 'function' && getProgramForAthlete(opts.athleteId)) uiActionSheet('Replace ' + first + '\'s program?', [{ label: 'Replace it', danger: true, onClick: go }]);
        else go();
      };
      tpl.addEventListener('click', function () { save(true); });
      if (use) use.addEventListener('click', function () { save(false); });
      acts.appendChild(tpl);
      if (use) acts.appendChild(use);
      foot.appendChild(left);
      foot.appendChild(acts);
    };
    var review = function (read) {
      draft = draftFromRead(read);
      if (!draft) { failed('That doesn\'t look like a training program. Try a screenshot of the program itself, or paste the text.'); return; }
      h.textContent = 'Check the program';
      paintFoot();
      paintMain();
      sheet.classList.add('is-review');
    };

    reading();
    if (opts.sample) {
      file = { kind: 'image', url: SAMPLE_IMG, name: 'Sample program' };
      paintPic(file);
      setTimeout(function () { if (!ov.isClosed()) review(PP_SAMPLE_READ); }, 1500);
      return;
    }
    // A program the import intake read from a spreadsheet: straight to the check.
    if (opts.read) {
      file = { kind: 'sheet', name: (opts.source && opts.source.name) || 'Your spreadsheet' };
      paintPic(file);
      review(opts.read);
      return;
    }
    readFiles(opts.files || (opts.file ? [opts.file] : []));

    // One file, or a few in a row: each goes to the reader in turn (it takes 3 a minute, so a fourth waits
    // with a countdown), and the reads line up into one program (mergeReads). A file that doesn't read is
    // left out and named; the day's limit stops the rest and keeps what was read.
    function readFiles(files) {
      var reads = [], i = 0, retried = {}, many = files.length > 1;
      var unit = typeof getUnit === 'function' && getUnit() === 'lbs' ? 'lb' : 'kg';
      var say = function (t) { var p = main.querySelector('.pp-reading p'); if (p) p.textContent = t; };
      var wait = function (ms) {
        return new Promise(function (res) {
          var end = Date.now() + ms;
          var tick = function () {
            if (ov.isClosed()) return res();
            var left = Math.ceil((end - Date.now()) / 1000);
            if (left <= 0) return res();
            say('Next file in ' + left + ' s. The reader takes 3 a minute.');
            setTimeout(tick, 500);
          };
          tick();
        });
      };
      var finish = function () {
        if (ov.isClosed()) return;
        if (!reads.length) { failed(readNotes.join(' ') || 'Couldn\'t read those. Try sharper pictures, or paste the text.'); readNotes = []; return; }
        if (many) readMeta = { files: files.length, read: reads.length };
        review(mergeReads(reads));
      };
      var step = function () {
        if (ov.isClosed()) return;
        if (i >= files.length) return finish();
        var f = files[i], label = (f && f.name) || 'File ' + (i + 1);
        if (many) { h.textContent = 'Reading ' + (i + 1) + ' of ' + files.length; sub.textContent = 'About 10 seconds each. Nothing is saved until you say so.'; }
        var gotPic = pics.length > i ? Promise.resolve(pics[i]) : prepFile(f).then(function (pf) { pics.push(pf); if (pics.length === 1) file = pf; picAt = pics.length - 1; paintPics(); return pf; });
        gotPic.then(function (pf) {
          return wait(readWait(SENT, Date.now())).then(function () {
            if (ov.isClosed()) return null;
            say(many ? 'Reading ' + label + '.' : 'Reading the weeks, the days, and every set, rep, load and RPE.');
            SENT.push(Date.now());
            return DB.readProgramPhoto({ file: pf.b64, mime: pf.mime, unit: unit });
          });
        }).then(function (res) {
          if (ov.isClosed() || res === null) return;
          if (res && res.read) reads.push(res.read);
          else readNotes.push(label + ' didn\'t read as a program, so it\'s left out.');
          i++; step();
        }).catch(function (e) {
          if (ov.isClosed()) return;
          var d = e && e.detail, st = e && e.status;
          var msg = (d && d.message) || (e && e.code && e.message) || '';
          // The burst limit (3 a minute, maybe from another tab): wait a full minute and try once more.
          if (st === 429 && /moment/i.test(msg) && !retried[i]) { retried[i] = 1; var now = Date.now(); SENT.push(now, now, now); return step(); }
          if (st === 429) {
            var left = files.length - i;
            readNotes.push((msg || 'You\'ve read the most programs for today.') + (many && reads.length ? ' ' + (left === 1 ? '1 file waits' : left + ' files wait') + ' for tomorrow.' : ''));
            return finish();
          }
          if (!msg && st === 404) msg = 'Reading photos isn\'t switched on yet. Paste the text instead.';
          if (!msg && typeof navigator !== 'undefined' && navigator.onLine === false) msg = 'No connection. Try again when you\'re back online, or paste the text.';
          if (!many) { failed(msg || 'Couldn\'t read that one. Try a sharper picture, or paste the text.'); return; }
          readNotes.push(label + ': ' + (msg || 'couldn\'t read it') .replace(/\.$/, '') + '. It\'s left out.');
          i++; step();
        });
      };
      step();
    }
  }

  // The demo's sample (demo-media/sample-program.jpg) as the reader returns it. Week 3 of the Spoto
  // press is smudged in the picture on purpose: the check shows what a cell to fix looks like.
  var PP_SAMPLE_READ = {
    name: 'Strength Block 2', unit: 'kg', weeks: 4,
    days: [
      { name: 'Day 1 · Squat / Bench', exercises: [
        { name: 'Competition Squat', cells: ['1x3 @8, 3x4 75%', '1x2 @8, 3x3 78%', '1x1 @8, 3x2 82%', '3x3 70% @6'] },
        { name: 'Competition Bench', cells: ['1x4 @8, 3x5 72.5%', '1x3 @8, 3x4 75%', '1x2 @8.5, 3x3 80%', '3x4 67.5% @6'] },
        { name: 'Barbell Row', cells: ['4x8 2RIR', '4x8 2RIR', '4x8 2RIR', '3x8 3RIR'] },
        { name: 'Leg Curl', cells: ['3x12', '3x12', '3x12', '2x12'] }
      ] },
      { name: 'Day 2 · Deadlift / Press', exercises: [
        { name: 'Competition Deadlift', cells: ['1x3 @8, 2x3 75%', '1x2 @8, 2x3 78%', '1x1 @8.5, 2x2 82%', '2x3 70% @6'] },
        { name: 'Spoto Press', cells: ['4x5 @7', '4x4 @7.5', '4x? @8', '3x5 @6'] },
        { name: 'SSB Squat', cells: ['3x6 @7', '3x5 @7.5', '3x4 @8', ''] },
        { name: 'Chin-ups', cells: ['3x8', '3x8', '3x6', '2x8'] }
      ] },
      { name: 'Day 3 · Volume', exercises: [
        { name: 'Pause Squat', cells: ['4x3 70% paused 2s', '4x3 72.5% paused 2s', '3x3 75% paused 2s', '3x2 65% paused 2s'] },
        { name: 'Competition Bench', cells: ['5x5 @7', '5x4 @7.5', '4x4 @8', '3x5 @6'] },
        { name: 'RDL', cells: ['3x8 @7', '3x8 @7', '3x6 @7.5', '2x8 @6'] },
        { name: 'Ab Wheel', cells: ['3x10', '3x10', '3x12', '2x10'] }
      ] }
    ],
    unsure: [{ day: 2, exercise: 2, week: 3, why: 'The reps are smudged in the photo' }]
  };

  window.PhotoImport = { pickTile: pickTile, openReview: openReview, draftFromRead: draftFromRead, draftToWeeks: draftToWeeks, draftIssues: draftIssues, cellRead: cellRead, SAMPLE: PP_SAMPLE_READ,
    mergeReads: mergeReads, readWait: readWait };
})();
