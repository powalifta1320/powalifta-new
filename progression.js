/* progression.js: the coach's progression rules (2026-10-28).
   One screen where a coach writes how next week moves, in their own words: "When the top set feels RPE 8 or
   easier on squat, add 2.5 kg". Settings › Progression rules on the laptop (desk.js dkSettingsSections), You ›
   Coaching › Progression rules on the iPhone (a pushed screen: coach.html data-pane="rules", back "‹ You").
   Each rule is one sentence with its three choices inline (menus on the desk, native pickers on the phone), the
   first rule that fits a block wins, "When no rule fits" picks POWALIFTA's suggestion or what's written, and
   under them the roster's next weeks as the rules would write them. Saved per coach in CoachSettings
   'progression' (app.js progressionClean / progressionRuleText / progressionPreview); next week's suggestions
   follow them (deskWeekReview) and the coach still publishes every week. The demo keeps edits in memory. */
(function () {
  'use strict';
  var MAX = typeof PROGRESSION_MAX_RULES === 'number' ? PROGRESSION_MAX_RULES : 10;
  var RPE_EASY = [6, 6.5, 7, 7.5, 8, 8.5, 9], RPE_HARD = [8, 8.5, 9, 9.5, 10], BY = [0.5, 1, 1.5, 2], REPS = [1, 2, 3];
  var PCT = [2.5, 5, 7.5, 10, 15, 20];
  var LIFTS = [['all', 'any lift'], ['squat', 'squat'], ['bench', 'bench'], ['deadlift', 'deadlift']];
  var WHEN = [
    { kind: 'rpeAtOrUnder', title: 'Feels this RPE or easier', values: RPE_EASY },
    { kind: 'rpeAtOrOver', title: 'Feels this RPE or harder', values: RPE_HARD },
    { kind: 'easier', title: 'Easier than written, by', values: BY },
    { kind: 'harder', title: 'Harder than written, by', values: BY },
    { kind: 'missedReps', title: 'Reps missed', values: REPS }
  ];
  var IC = {
    grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6.5" r="1.5"/><circle cx="15" cy="6.5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="17.5" r="1.5"/><circle cx="15" cy="17.5" r="1.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    go: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    steps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 19h5v-5h5V9h5V4h3"/></svg>'
  };

  /* ---------- the coach's unit, the rules, saving ---------- */
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function unit() { return typeof getUnit === 'function' && getUnit() === 'lbs' ? 'lbs' : 'kg'; }
  function n2(v) { return typeof _num === 'function' ? _num(v) : Math.round(Number(v) * 100) / 100; }
  // Amounts in the coach's unit; a rule keeps kg.
  function amounts() { return unit() === 'lbs' ? [2.5, 5, 10, 15, 20] : [1, 2.5, 5, 7.5, 10]; }
  function toKg(v) { return unit() === 'lbs' ? Math.round(Number(v) * KG_PER_LB * 1000) / 1000 : Number(v); }
  function inUnit(kg) { return unit() === 'lbs' ? Math.round(Number(kg) / KG_PER_LB * 10) / 10 : Number(kg); }
  function cur() { return progressionClean(window.CoachSettings ? CoachSettings.get('progression') : null); }
  function newRule(when, then, lift) {
    return { id: 'rule-' + Math.random().toString(36).slice(2, 10), lift: lift || 'all', when: when || { kind: 'rpeAtOrUnder', value: 8 }, then: then || { kind: 'addLoad', value: toKg(unit() === 'lbs' ? 5 : 2.5) } };
  }
  // The two most coaches start from: a little more when it was easy, 5% off when it was a grind.
  function starterRules() {
    return [newRule({ kind: 'rpeAtOrUnder', value: 7.5 }, { kind: 'addLoad', value: toKg(unit() === 'lbs' ? 5 : 2.5) }),
      newRule({ kind: 'rpeAtOrOver', value: 9.5 }, { kind: 'cutPct', value: 5 })];
  }
  var views = [];   // the screens showing the rules (one on the desk or the phone; repainted together)
  var saveState = { local: false, failed: false };
  function repaintAll() { views = views.filter(function (v) { return v.host.isConnected; }); views.forEach(function (v) { v.paint(); }); }
  function save(next) {
    var p = window.CoachSettings ? CoachSettings.set('progression', next) : Promise.resolve({ ok: false });
    saveState.failed = false;
    repaintAll();
    return p.then(function (r) {
      if (r && r.ok) { var was = saveState.local; saveState.local = !!r.local; if (was !== saveState.local) repaintAll(); return r; }
      saveState.failed = true;
      repaintAll();
      if (typeof toastAction === 'function') toastAction('Couldn’t save your rules. They’re as they were.', 'Try again', function () { save(next); });
      return r;
    });
  }
  function withRules(rules) { var c = cur(); return { v: 1, rules: rules, fallback: c.fallback }; }
  function update(id, fn) { save(withRules(cur().rules.map(function (r) { return r.id === id ? fn(JSON.parse(JSON.stringify(r))) : r; }))); }
  function move(from, to) {
    var rules = cur().rules.slice();
    if (from < 0 || from >= rules.length || to < 0 || to >= rules.length || from === to) return false;
    var it = rules.splice(from, 1)[0];
    rules.splice(to, 0, it);
    save(withRules(rules));
    return true;
  }
  function remove(id) {
    var c = cur(), at = c.rules.findIndex(function (r) { return r.id === id; });
    if (at < 0) return;
    var gone = c.rules[at];
    save(withRules(c.rules.filter(function (r) { return r.id !== id; })));
    if (typeof toastAction === 'function') toastAction('Rule deleted', 'Undo', function () { var now = cur().rules.slice(); now.splice(Math.min(at, now.length), 0, gone); save(withRules(now)); });
  }
  function add(rules) {
    var c = cur();
    if (c.rules.length >= MAX) return null;
    var list = c.rules.concat(rules || [newRule()]).slice(0, MAX);
    save(withRules(list));
    return list[list.length - 1];
  }

  /* ---------- words ---------- */
  function liftWord(l) { var x = LIFTS.filter(function (y) { return y[0] === l; })[0]; return x ? x[1] : 'any lift'; }
  function thenWord(t) { return typeof progressionThenText === 'function' ? progressionThenText(t, unit()) : ''; }
  function whenWord(w) { return typeof progressionWhenText === 'function' ? progressionWhenText(w) : ''; }
  function chipWhen(kind, v) {
    if (kind === 'easier' || kind === 'harder') return v === 0.5 ? '½' : n2(v);
    return n2(v);
  }
  // The sentence keeps "When the top set" as words and makes the rest the choice: "feels RPE 8 or easier".
  function whenParts(w) {
    var t = whenWord(w);
    return t.indexOf('the top set ') === 0 ? { lead: 'When the top set ', tok: t.slice(12) } : { lead: 'When ', tok: t };
  }

  /* ---------- the preview: the roster's next weeks as the rules write them ---------- */
  function preview() {
    try { return progressionPreview(cur(), { unit: unit() }); } catch (e) { return { items: [], lifters: 0 }; }
  }
  function previewNode(mode) {
    var c = cur(), p = preview();
    var box = el('div', { class: 'prg-pv', 'aria-live': 'polite' });
    box.appendChild(el('h3', { class: 'prg-h' }, 'This week your rules would change'));
    if (!c.rules.length) { box.appendChild(el('p', { class: 'prg-note' }, 'Add a rule and each lifter’s next week shows here as it would read.')); return box; }
    var changes = p.items.filter(function (x) { return x.dir !== 'hold' || (x.sets != null && x.sets !== x.setsFrom); });
    var shown = p.items.slice(0, 5), more = p.items.length - shown.length;
    if (!p.items.length) {
      box.appendChild(el('p', { class: 'prg-note' }, 'Nothing on your roster fits a rule this week. Rules work from last week’s top sets, so they show here once lifters log them.'));
      return box;
    }
    if (!changes.length) box.appendChild(el('p', { class: 'prg-note' }, 'Your rules keep what you wrote this week.'));
    var list = el('div', { class: 'prg-pvl' + (mode === 'phone' ? ' ui-list' : '') });
    shown.forEach(function (it, i) {
      var b = el('button', { type: 'button', class: 'prg-pvr' + (mode === 'phone' ? ' ui-row' : ''), style: '--i:' + i, title: it.rule ? it.rule.text : '' });
      b.appendChild(el('span', { class: 'prg-pvt' }, progressionPreviewText(it, unit())));
      var tone = it.dir === 'up' ? 'up' : it.dir === 'down' ? 'down' : it.dir === 'set' ? 'set' : 'hold';
      if (tone === 'up' || tone === 'down') b.appendChild(el('span', { class: 'prg-pvd t-' + tone }, (it.to > it.from ? '+' : '−') + n2(Math.abs(inUnit(it.to) - inUnit(it.from)))));
      if (mode === 'phone') b.insertAdjacentHTML('beforeend', '<span class="prg-pvgo">' + IC.go + '</span>');
      b.addEventListener('click', function () { openLifter(it.athleteId); });
      list.appendChild(b);
    });
    box.appendChild(list);
    if (more > 0) box.appendChild(el('p', { class: 'prg-more-n' }, 'and ' + more + ' more'));
    box.appendChild(el('p', { class: 'prg-note' }, 'Nothing changes until you publish each lifter’s week.'));
    return box;
  }
  function openLifter(aid) {
    if (isDeskNow() && typeof openAthletePage === 'function') { openAthletePage(aid); return; }
    if (window.CoachLifters && CoachLifters.open) CoachLifters.open(aid);
  }

  /* ---------- the desk: a menu for each choice ---------- */
  function deskMenu(anchor, kind, rule) {
    if (typeof dkPopMenu !== 'function') return;
    var menu = null;
    var close = function () { if (menu && menu._close) menu._close(); anchor.focus({ preventScroll: true }); };
    var items = [];
    if (kind === 'lift') {
      items = LIFTS.map(function (l) { return { label: l[0] === 'all' ? 'Any lift' : l[1].charAt(0).toUpperCase() + l[1].slice(1), check: rule.lift === l[0], run: function () { update(rule.id, function (r) { r.lift = l[0]; return r; }); } }; });
      menu = dkPopMenu(anchor, items);
      return;
    }
    var grid = function (title, chips) {
      var row = el('div', { class: 'prg-mg', role: 'group', 'aria-label': title });
      row.appendChild(el('span', { class: 'prg-mg-t' }, title));
      var cs = el('span', { class: 'prg-mg-c' });
      chips.forEach(function (c) {
        var b = el('button', { type: 'button', class: 'prg-chip' + (c.on ? ' on' : ''), 'aria-pressed': String(!!c.on), 'aria-label': c.aria || c.label }, c.label);
        b.addEventListener('click', function (e) { e.stopPropagation(); close(); c.run(); });
        cs.appendChild(b);
      });
      row.appendChild(cs);
      return { node: row };
    };
    if (kind === 'when') {
      WHEN.forEach(function (g) {
        var vals = g.values.slice();
        if (rule.when.kind === g.kind && vals.indexOf(rule.when.value) < 0) vals.push(rule.when.value), vals.sort(function (a, b) { return a - b; });
        items.push(grid(g.title, vals.map(function (v) {
          var w = { kind: g.kind, value: v };
          return { label: chipWhen(g.kind, v), aria: whenWord(w), on: rule.when.kind === g.kind && rule.when.value === v, run: function () { update(rule.id, function (r) { r.when = w; return r; }); } };
        })));
      });
    } else {
      var u = unit(), am = amounts().slice(), have = rule.then.kind === 'addLoad' ? inUnit(rule.then.value) : null;
      if (have != null && am.indexOf(have) < 0) am.push(have), am.sort(function (a, b) { return a - b; });
      items.push(grid('Add', am.map(function (v) { return { label: n2(v), aria: 'add ' + n2(v) + ' ' + u, on: have === v, run: function () { update(rule.id, function (r) { r.then = { kind: 'addLoad', value: toKg(v) }; return r; }); } }; })));
      // Another amount, typed in the coach's unit (kept in kg).
      var other = el('div', { class: 'prg-mg prg-mg-in' });
      other.appendChild(el('span', { class: 'prg-mg-t' }, 'Another amount'));
      var inp = el('input', { type: 'number', inputmode: 'decimal', step: u === 'lbs' ? '1' : '0.5', min: u === 'lbs' ? '1' : '0.5', max: u === 'lbs' ? '55' : '25', class: 'prg-in', 'aria-label': 'Another amount to add, in ' + u, placeholder: u === 'lbs' ? '7.5' : '3' });
      other.appendChild(inp);
      other.appendChild(el('span', { class: 'prg-mg-u' }, u));
      var go = function () {
        var v = Number(String(inp.value).replace(',', '.'));
        if (!(v > 0) || toKg(v) > 25) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
        close(); update(rule.id, function (r) { r.then = { kind: 'addLoad', value: toKg(v) }; return r; });
      };
      inp.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') { e.preventDefault(); close(); } });
      inp.addEventListener('click', function (e) { e.stopPropagation(); });
      items.push({ node: other });
      items.push(grid('Take off', PCT.map(function (v) { return { label: n2(v) + '%', aria: 'take ' + n2(v) + '% off', on: rule.then.kind === 'cutPct' && rule.then.value === v, run: function () { update(rule.id, function (r) { r.then = { kind: 'cutPct', value: v }; return r; }); } }; })));
      items.push('-');
      [['hold', 'Keep the load'], ['addSet', 'Add a set'], ['dropSet', 'Drop a set']].forEach(function (k) {
        items.push({ label: k[1], check: rule.then.kind === k[0], run: function () { update(rule.id, function (r) { r.then = { kind: k[0], value: null }; return r; }); } });
      });
    }
    menu = dkPopMenu(anchor, items);
    if (menu) menu.classList.add('prg-menu');
    var on = menu && menu.querySelector('.prg-chip.on');
    if (on) on.focus({ preventScroll: true });
  }

  /* ---------- the phone: a native picker under each choice ---------- */
  function opt(value, text, sel) { var o = el('option', { value: value }, text); if (sel) o.selected = true; return o; }
  function phoneSelect(kind, rule) {
    var s = el('select', { class: 'prg-sel', 'aria-label': kind === 'when' ? 'When' : kind === 'lift' ? 'On which lift' : 'Then' });
    if (kind === 'lift') LIFTS.forEach(function (l) { s.appendChild(opt(l[0], l[1], rule.lift === l[0])); });
    else if (kind === 'when') {
      WHEN.forEach(function (g) {
        var og = el('optgroup', { label: g.title });
        var vals = g.values.slice();
        if (rule.when.kind === g.kind && vals.indexOf(rule.when.value) < 0) vals.push(rule.when.value), vals.sort(function (a, b) { return a - b; });
        vals.forEach(function (v) { og.appendChild(opt(g.kind + ':' + v, whenParts({ kind: g.kind, value: v }).tok, rule.when.kind === g.kind && rule.when.value === v)); });
        s.appendChild(og);
      });
    } else {
      var have = rule.then.kind === 'addLoad' ? inUnit(rule.then.value) : null, am = amounts().slice();
      if (have != null && am.indexOf(have) < 0) am.push(have), am.sort(function (a, b) { return a - b; });
      var g1 = el('optgroup', { label: 'Add' });
      am.forEach(function (v) { g1.appendChild(opt('addLoad:' + v, thenWord({ kind: 'addLoad', value: toKg(v) }), have === v)); });
      g1.appendChild(opt('addLoad:other', 'add another amount…', false));
      s.appendChild(g1);
      var g2 = el('optgroup', { label: 'Take off' });
      PCT.forEach(function (v) { g2.appendChild(opt('cutPct:' + v, thenWord({ kind: 'cutPct', value: v }), rule.then.kind === 'cutPct' && rule.then.value === v)); });
      s.appendChild(g2);
      var g3 = el('optgroup', { label: 'The load or the sets' });
      [['hold', 'keep the load'], ['addSet', 'add a set'], ['dropSet', 'drop a set']].forEach(function (k) { g3.appendChild(opt(k[0] + ':', k[1], rule.then.kind === k[0])); });
      s.appendChild(g3);
    }
    s.addEventListener('change', function () {
      var v = s.value, k = v.split(':')[0], x = v.split(':')[1];
      if (kind === 'lift') { update(rule.id, function (r) { r.lift = v; return r; }); return; }
      if (kind === 'when') { update(rule.id, function (r) { r.when = { kind: k, value: Number(x) }; return r; }); return; }
      if (k === 'addLoad' && x === 'other') { askAmount(rule); return; }
      update(rule.id, function (r) { r.then = { kind: k, value: k === 'addLoad' ? toKg(Number(x)) : k === 'cutPct' ? Number(x) : null }; return r; });
    });
    return s;
  }
  // Another amount on the phone: a small sheet with the number pad, in the coach's unit.
  function askAmount(rule) {
    if (typeof uiSheet !== 'function') return;
    var u = unit();
    uiSheet('Add how much?', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Added to last week’s top set as lifted, in ' + u + '.'));
      var inp = el('input', { type: 'number', inputmode: 'decimal', step: 'any', min: '0.5', max: u === 'lbs' ? '55' : '25', class: 'prg-sheet-in', 'aria-label': 'Amount to add, in ' + u, placeholder: u === 'lbs' ? '7.5' : '3' });
      var have = rule.then.kind === 'addLoad' ? inUnit(rule.then.value) : '';
      inp.value = have === '' ? '' : String(have);
      var row = el('label', { class: 'prg-sheet-row' }, inp, el('span', {}, u));
      sheet.appendChild(row);
      var err = el('p', { class: 'prg-sheet-err', role: 'alert' });
      sheet.appendChild(err);
      var go = el('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block' }, 'Use this amount');
      go.addEventListener('click', function () {
        var v = Number(String(inp.value).replace(',', '.'));
        if (!(v > 0) || toKg(v) > 25) { err.textContent = 'Between ' + (u === 'lbs' ? '1 and 55 lbs' : '0.5 and 25 kg') + '.'; inp.focus(); return; }
        close(); update(rule.id, function (r) { r.then = { kind: 'addLoad', value: toKg(v) }; return r; });
      });
      sheet.appendChild(go);
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 420);
    }, { cls: 'prg-sheet', onClose: repaintAll });
  }
  function phoneActions(rule, i, n) {
    if (typeof uiActionSheet !== 'function') return;
    var text = progressionRuleText(rule, unit());
    uiActionSheet(text, [
      i > 0 ? { label: 'Move up', onClick: function () { move(i, i - 1); } } : null,
      i < n - 1 ? { label: 'Move down', onClick: function () { move(i, i + 1); } } : null,
      { label: 'Delete rule', danger: true, onClick: function () { remove(rule.id); } }
    ]);
  }

  /* ---------- one rule: a sentence with three choices ---------- */
  function ruleNode(rule, i, n, mode, rise) {
    var row = el('div', { class: 'prg-rule' + (rise ? ' rise' : ''), role: 'listitem', 'data-id': rule.id, style: '--i:' + i });
    var sent = el('p', { class: 'prg-sent' });
    var token = function (kind, text) {
      if (mode === 'desk') {
        var b = el('button', { type: 'button', class: 'prg-tok', 'data-tok': kind, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
          'aria-label': (kind === 'when' ? 'When: ' : kind === 'lift' ? 'On: ' : 'Then: ') + text }, text);
        b.addEventListener('click', function () { deskMenu(b, kind, rule); });
        return b;
      }
      var t = el('span', { class: 'prg-tok', 'data-tok': kind });
      t.appendChild(el('span', { class: 'prg-tok-t', 'aria-hidden': 'true' }, text));
      t.appendChild(phoneSelect(kind, rule));
      return t;
    };
    var wp = whenParts(rule.when);
    sent.appendChild(document.createTextNode(wp.lead));
    sent.appendChild(token('when', wp.tok));
    sent.appendChild(document.createTextNode(' on '));
    // The comma rides with the lift, so a wrapped line never starts with one.
    var nw = el('span', { class: 'prg-nw' });
    nw.appendChild(token('lift', liftWord(rule.lift)));
    nw.appendChild(el('span', { class: 'prg-comma' }, ','));
    sent.appendChild(nw);
    sent.appendChild(document.createTextNode(' '));
    sent.appendChild(token('then', thenWord(rule.then)));
    if (mode === 'desk') {
      var grip = el('button', { type: 'button', class: 'prg-grip', 'aria-label': 'Rule ' + (i + 1) + ' of ' + n + '. Drag to reorder, or use the up and down arrow keys', html: IC.grip });
      row.appendChild(grip);
      row.appendChild(el('span', { class: 'prg-num', 'aria-hidden': 'true' }, String(i + 1)));
      row.appendChild(sent);
      var del = el('button', { type: 'button', class: 'prg-del', 'aria-label': 'Delete this rule', html: IC.trash });
      if (typeof dkTip === 'function') dkTip(del, 'Delete this rule');
      del.addEventListener('click', function () { remove(rule.id); });
      row.appendChild(del);
    } else {
      row.appendChild(el('span', { class: 'prg-num', 'aria-hidden': 'true' }, String(i + 1)));
      row.appendChild(sent);
      var more = el('button', { type: 'button', class: 'prg-more', 'aria-label': 'Move or delete rule ' + (i + 1), html: IC.more });
      more.addEventListener('click', function () { phoneActions(rule, i, n); });
      row.appendChild(more);
    }
    return row;
  }

  // Drag a rule by its grip (desk): it follows the pointer from where it was grabbed, the others make room, and
  // the order saves on release. The arrow keys move it one place (no animation for a key).
  function wireDrag(list) {
    list.addEventListener('keydown', function (e) {
      var g = e.target.closest && e.target.closest('.prg-grip');
      if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      var rows = Array.prototype.slice.call(list.querySelectorAll('.prg-rule')), i = rows.indexOf(g.closest('.prg-rule'));
      var to = i + (e.key === 'ArrowUp' ? -1 : 1), id = rows[i] && rows[i].getAttribute('data-id');
      if (move(i, to)) {
        var at = list.isConnected ? list : document;
        var moved = at.querySelector('.prg-rule[data-id="' + CSS.escape(id) + '"] .prg-grip');
        if (moved) moved.focus({ preventScroll: true });
        var said = list.parentNode && list.parentNode.querySelector('.prg-said');
        if (said) said.textContent = 'Moved to ' + (to + 1) + ' of ' + rows.length;
      }
    });
    list.addEventListener('pointerdown', function (e) {
      var g = e.target.closest && e.target.closest('.prg-grip');
      if (!g || e.button !== 0) return;
      var row = g.closest('.prg-rule'), rows = Array.prototype.slice.call(list.querySelectorAll('.prg-rule'));
      if (rows.length < 2) return;
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      var from = rows.indexOf(row), rects = rows.map(function (r) { return r.getBoundingClientRect(); });
      var y0 = e.clientY, started = false, to = from, h = rects[from].height + (rects[1] ? rects[1].top - rects[0].bottom : 0);
      var minDy = rects[0].top - rects[from].top, maxDy = rects[rects.length - 1].bottom - rects[from].bottom;
      function onMove(ev) {
        var dy = ev.clientY - y0;
        if (!started) { if (Math.abs(dy) < 4) return; started = true; list.classList.add('is-sorting'); row.classList.add('is-drag'); }
        dy = Math.max(minDy - 12, Math.min(maxDy + 12, dy));
        row.style.transform = 'translateY(' + dy + 'px)';
        // The edge leading the way passes another rule's middle: that rule makes room (rules can differ in height).
        var top = rects[from].top + dy, bot = rects[from].bottom + dy;
        to = from;
        rects.forEach(function (r, k) { var m = r.top + r.height / 2; if (k < from && top < m) to = Math.min(to, k); if (k > from && bot > m) to = Math.max(to, k); });
        rows.forEach(function (r, k) {
          if (k === from) return;
          var shift = k > from && k <= to ? -h : k < from && k >= to ? h : 0;
          r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
        });
      }
      function onUp() {
        g.removeEventListener('pointermove', onMove);
        g.removeEventListener('pointerup', onUp);
        g.removeEventListener('pointercancel', onUp);
        list.classList.remove('is-sorting');
        rows.forEach(function (r) { r.style.transform = ''; r.classList.remove('is-drag'); });
        if (started && to !== from) {
          var id = row.getAttribute('data-id');
          move(from, to);
          var moved = document.querySelector('.prg-rule[data-id="' + CSS.escape(id) + '"] .prg-grip');
          if (moved) moved.focus({ preventScroll: true });
        }
      }
      g.addEventListener('pointermove', onMove);
      g.addEventListener('pointerup', onUp);
      g.addEventListener('pointercancel', onUp);
    });
  }

  /* ---------- the screen ---------- */
  function body(mode, rise) {
    var c = cur(), frag = el('div', { class: 'prg-body' });
    // The rules, or how to start.
    if (!c.rules.length) {
      var em = el('div', { class: 'prg-empty' });
      em.insertAdjacentHTML('beforeend', '<span class="prg-eic">' + IC.steps + '</span>');
      var et = el('div', { class: 'prg-et' });
      et.appendChild(el('b', {}, 'No rules yet'));
      et.appendChild(el('p', {}, 'Next week moves by how each top set felt against what you wrote. Write your own rule, like add 2.5 kg when the top set is RPE 8 or easier.'));
      em.appendChild(et);
      frag.appendChild(em);
    } else {
      if (mode === 'phone') frag.appendChild(el('h2', { class: 'prg-h2' }, 'Your rules'));
      var list = el('div', { class: 'prg-list', role: 'list', 'aria-label': 'Your rules, the first that fits wins' });
      c.rules.forEach(function (r, i) { list.appendChild(ruleNode(r, i, c.rules.length, mode, rise)); });
      if (mode === 'desk') wireDrag(list);
      frag.appendChild(list);
      frag.appendChild(el('p', { class: 'prg-said dk-nil', role: 'status' }));
    }
    // Add a rule: the one red.
    var acts = el('div', { class: 'prg-acts' });
    var full = c.rules.length >= MAX;
    var addB = el('button', { type: 'button', class: 'cl-btn red prg-add', html: IC.plus });
    addB.appendChild(el('span', {}, 'Add a rule'));
    if (full) { addB.disabled = true; addB.setAttribute('aria-describedby', 'prFull'); }
    addB.addEventListener('click', function () {
      var r = add();
      if (!r) return;
      setTimeout(function () {
        var row = document.querySelector('.prg-rule[data-id="' + CSS.escape(r.id) + '"]');
        if (!row) return;
        row.classList.add('is-new');
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        if (mode === 'desk') { var t = row.querySelector('.prg-tok'); if (t) t.focus({ preventScroll: true }); }
      }, 30);
    });
    acts.appendChild(addB);
    if (!c.rules.length) {
      var start = el('button', { type: 'button', class: 'cl-btn quiet prg-start' }, 'Start with two common rules');
      start.addEventListener('click', function () { add(starterRules()); });
      acts.appendChild(start);
    }
    if (full) acts.appendChild(el('span', { class: 'prg-full', id: 'prFull' }, 'Ten rules at most. Delete one to add another.'));
    else if (saveState.local && c.rules.length) acts.appendChild(el('span', { class: 'prg-saved' }, 'Saved on this device for now'));
    frag.appendChild(acts);
    // When no rule fits.
    var fb = el('div', { class: 'prg-fb' });
    fb.appendChild(el('h3', { class: 'prg-h' }, 'When no rule fits'));
    var FB = [['suggest', 'POWALIFTA’s suggestion', 'Moves by how the top set felt against what you wrote, the way Train moves a set'],
      ['keep', 'Keep what’s written', 'Only your rules move next week']];
    if (mode === 'desk') {
      var seg = el('div', { class: 'dk-seg prg-seg', role: 'radiogroup', 'aria-label': 'When no rule fits' });
      FB.forEach(function (o) {
        var on = c.fallback === o[0];
        var b = el('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) }, o[1]);
        b.addEventListener('click', function () { if (!on) save({ v: 1, rules: cur().rules, fallback: o[0] }); });
        seg.appendChild(b);
      });
      fb.appendChild(seg);
      fb.appendChild(el('p', { class: 'prg-note' }, (FB.filter(function (o) { return o[0] === c.fallback; })[0] || FB[0])[2] + '.'));
    } else {
      var lst = el('div', { class: 'ui-list prg-pick', role: 'radiogroup', 'aria-label': 'When no rule fits' });
      FB.forEach(function (o) {
        var on = c.fallback === o[0];
        var b = el('button', { type: 'button', class: 'ui-row prg-opt' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) });
        var main = el('span', { class: 'ui-row-main' });
        main.appendChild(el('span', { class: 'ui-row-title' }, o[1]));
        main.appendChild(el('span', { class: 'ui-row-sub' }, o[2]));
        b.appendChild(main);
        b.insertAdjacentHTML('beforeend', '<span class="prg-ck" aria-hidden="true">' + (on ? IC.check : '') + '</span>');
        b.addEventListener('click', function () { if (!on) save({ v: 1, rules: cur().rules, fallback: o[0] }); });
        lst.appendChild(b);
      });
      fb.appendChild(lst);
    }
    frag.appendChild(fb);
    frag.appendChild(previewNode(mode));
    return frag;
  }
  function mount(host, mode) {
    var view = { host: host, mode: mode, paint: function () {
      var focus = document.activeElement && host.contains(document.activeElement) ? document.activeElement : null;
      var key = focus ? { id: focus.closest('.prg-rule') && focus.closest('.prg-rule').getAttribute('data-id'), tok: focus.getAttribute('data-tok'), cls: focus.className } : null;
      var old = host.querySelector('.prg-body');
      var b = body(mode, !old);   // the rules rise in on the first paint only, never on an edit
      if (old) old.replaceWith(b); else host.appendChild(b);
      // Keep the coach's place: the same choice of the same rule, after a repaint.
      if (key && key.id) {
        var row = host.querySelector('.prg-rule[data-id="' + CSS.escape(key.id) + '"]');
        var back = row && (key.tok ? row.querySelector('.prg-tok[data-tok="' + key.tok + '"]') : row.querySelector('.' + String(key.cls).split(' ')[0]));
        if (back) back.focus({ preventScroll: true });
      }
    } };
    views = views.filter(function (v) { return v.host.isConnected && v.host !== host; });
    views.push(view);
    view.paint();
  }
  // The laptop: Settings › Progression rules (desk.js gives the panel, its title already in place).
  function renderDesk(panel) {
    if (!panel) return;
    panel.appendChild(el('p', { class: 'dk-set-lead' }, 'Write how next week moves. Each lifter’s next week follows the first rule that fits a block; you still publish it.'));
    var host = el('div', { class: 'cl-root prg-root is-desk' });
    panel.appendChild(host);
    mount(host, 'desk');
  }
  // The iPhone: a screen pushed from You (the pane-back says "‹ You").
  function renderPhone(area) {
    if (!area) return;
    area.innerHTML = '';
    var host = el('div', { class: 'cl-root prg-root is-phone' });
    var head = el('header', { class: 'cs-ph prg-ph' });
    head.appendChild(el('h1', { class: 'cl-h1' }, 'Progression rules'));
    head.appendChild(el('p', { class: 'cl-sub' }, 'Next week follows the first rule that fits. You still publish every week.'));
    host.appendChild(head);
    area.appendChild(host);
    mount(host, 'phone');
  }
  // What You › Coaching says beside the row: "2 rules" or "Off".
  function summary() { var n = cur().rules.length; return n ? n + (n === 1 ? ' rule' : ' rules') : 'Off'; }
  function open() {
    if (isDeskNow() && typeof deskGo === 'function') { try { _dk.setSec = 'rules'; } catch (e) {} deskGo('settings'); return; }
    var t = document.getElementById('tab-rules');
    if (t) t.click();
  }
  window.ProgressionUI = { renderDesk: renderDesk, renderPhone: renderPhone, summary: summary, open: open, ICON: IC.steps };
})();
