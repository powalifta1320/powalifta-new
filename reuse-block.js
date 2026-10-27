/* reuse-block.js: give a good block to another lifter (2026-10-28).
   From Block DNA (block-dna.js): the desk's opened block and its compare ("Use for another lifter…"), and on the
   phone a block's own page in the Blocks sheet. Pick lifters (the desk's dsPickDialog; a checkmark list in a sheet
   on the phone), then each one's preview: their top sets from their own maxes ("Squat 117.5 × 5 @7 (76% of
   Arjun's)"), what happens to the block they're on, and anything to know (no max yet, on a team), then the one
   red: "Give to 2 lifters". A toast, and the screens repaint.
   The scaling is app.js reuseBlockWeeks (the team pipeline). Saving goes the team push's way (db.js
   _pushTeamLocal): read their program fresh, keep anything they logged in it as a past block
   (archiveProgramIfTrained, anyLogged) or write nothing for them, then one compare-and-swap write with the rev, an
   explicit start (next Monday) and their meet date, then the heads-up (notifyAthleteAssigned). The demo writes to
   the Store only. */
(function () {
  'use strict';
  var LIFTS = ['squat', 'bench', 'deadlift'];
  var NAMES = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  var IC = {
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function st() { return (window.Store && Store.get()) || {}; }
  function me() { var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null; return u ? u.id : null; }
  function athleteOf(aid) { return (st().athletes || []).find(function (a) { return a.id === aid; }) || null; }
  function first(n) { return String(n || '').trim().split(/\s+/)[0] || 'They'; }
  function progOf(aid) { return (st().programs || []).find(function (p) { return p.athleteId === aid; }) || null; }
  function today() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  // Next Monday: the block starts on a fresh week.
  function nextMonday() { return _addDaysISO(_monISO(today()), 7); }
  function dayText(iso) { try { return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); } catch (e) { return iso; } }
  function anyLogged(p) { return !!(p && (p.weeks || []).some(function (w) { return (w.days || []).some(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).some(function (s) { return s && (s.completed || s.skipped || s.missed); }); }); }); })); }
  function liftList(ls) { var n = ls.map(function (L) { return NAMES[L].toLowerCase(); }); return n.length > 1 ? n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1] : n[0] || ''; }
  function namesList(ns) { return ns.length > 1 ? ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1] : ns[0] || ''; }

  /* ---------- the maxes on each side ---------- */
  // The block's own: the maxes it was written from, else the best e1RM in the 8 weeks before it (Block DNA's start).
  function srcMaxesOf(aid, block) {
    var out = {};
    var m = block && block.maxes;
    var dna = null;
    try {
      var items = window.BlockDNA && BlockDNA.listFor ? BlockDNA.listFor(aid) : [];
      var it = items.find(function (x) { return x.block === block || (x.block && block && x.block.id === block.id); });
      dna = it ? it.dna : null;
    } catch (e) { dna = null; }
    LIFTS.forEach(function (L) {
      var v = m && Number(m[L]) > 0 ? Number(m[L]) : (dna && dna.e1rm && dna.e1rm[L] && Number(dna.e1rm[L].start) > 0 ? Number(dna.e1rm[L].start) : 0);
      out[L] = v;
    });
    return out;
  }
  // The lifter's: their program's maxes, else their best e1RM, else their intake (programMaxKg's order).
  function dstMaxesOf(aid) {
    var p = progOf(aid), out = {};
    LIFTS.forEach(function (L) { out[L] = typeof programMaxKg === 'function' ? (programMaxKg(p, aid, L) || 0) : 0; });
    return out;
  }
  function teamOf(aid) {
    return (st().teams || []).find(function (t) { return (t.members || []).some(function (m) { return m.athleteId === aid; }); }) || null;
  }
  // Everything the preview says for one lifter, worked out once (the same weeks are what gets written).
  function plan(src, aid) {
    var a = athleteOf(aid) || { id: aid, name: 'Lifter' };
    var unit = (typeof athleteUnit === 'function' && athleteUnit(aid)) || (typeof getUnit === 'function' ? getUnit() : 'kg');
    var r = reuseBlockWeeks(src.weeks, { srcMaxes: src.maxes, dstMaxes: dstMaxesOf(aid), unit: unit === 'lb' ? 'lbs' : unit });
    var tops = reuseTopSets(src.weeks, r.weeks);
    var cur = progOf(aid), ws = cur && typeof programWeekState === 'function' ? programWeekState(cur) : null;
    var notes = [], warns = [];
    if (cur && (cur.weeks || []).length) {
      if (anyLogged(cur)) notes.push(first(a.name) + '’s current block' + (ws ? ' (week ' + ws.number + ' of ' + ws.total + ')' : '') + ' is kept in past blocks');
      else notes.push(first(a.name) + '’s ' + (cur.name ? cur.name : 'block') + ' hasn’t started: this replaces it');
    }
    var byRpe = function (lifts) { return liftList(lifts); };
    if (r.noMax.length) warns.push('No ' + byRpe(r.noMax) + ' max for ' + first(a.name) + ' yet: ' + (r.noMax.length > 1 ? 'those go' : 'that goes') + ' by RPE until there is one');
    if (r.noSrcMax.length) warns.push(first(src.ownerName) + '’s block had no ' + byRpe(r.noSrcMax) + ' max: ' + (r.noSrcMax.length > 1 ? 'those go' : 'that goes') + ' by RPE');
    var team = teamOf(aid);
    if (team) warns.push(first(a.name) + ' is on ' + (team.name || 'a team') + ': the next team push replaces this block');
    var meet = cur && typeof _isoDay === 'function' && _isoDay(cur.meetDate) && cur.meetDate >= today() ? _isoDay(cur.meetDate) : nextPlannedMeet(aid);
    return { athlete: a, weeks: r.weeks, tops: tops, notes: notes, warns: warns, program: cur, meetDate: meet || null };
  }
  function nextPlannedMeet(aid) {
    var t = today();
    var m = (st().meets || []).filter(function (x) { return x.athleteId === aid && x.date && String(x.date).slice(0, 10) >= t && (x.planned || x.status === 'planned'); })
      .sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); })[0];
    return m ? String(m.date).slice(0, 10) : null;
  }

  /* ---------- giving it ---------- */
  // One lifter at a time, the team push's way. → { ok, aid, status, why? }
  async function giveOne(src, p, startsOn) {
    var aid = p.athlete.id, cur = progOf(aid);
    var name = src.name || 'Block';
    if (window._demoMode || !(window.DB && DB._pushTeamLocal)) {
      // The demo (and a page without the database): the Store only. What they logged is kept as a past block first.
      if (cur && anyLogged(cur)) { var k = await archiveProgramIfTrained(cur, { anyLogged: true }); if (!k || !k.kept) return { ok: false, aid: aid, status: 'needs_archive' }; }
      Store.update(function (s) {
        var at = (s.programs || []).findIndex(function (x) { return x.athleteId === aid; });
        var next = { id: cur ? cur.id : uid('prog'), athleteId: aid, coachId: me(), name: name, weeks: p.weeks, maxes: cur ? cur.maxes || null : null,
          setFields: cur && cur.setFields ? cur.setFields : (src.setFields || undefined), startsOn: startsOn, meetDate: p.meetDate || null, rev: cur ? cur.rev : undefined };
        if (at >= 0) s.programs[at] = next; else s.programs = (s.programs || []).concat([next]);
      });
      return { ok: true, aid: aid, status: cur ? 'updated' : 'created' };
    }
    var row = { athleteId: aid, action: cur ? 'replace' : 'create', programId: cur ? cur.id : null, name: name, weeks: p.weeks, startsOn: startsOn, meetDate: p.meetDate || null };
    var res = null;
    try { res = await DB._pushTeamLocal({ coachId: me() }, [row], function (fresh) { return archiveProgramIfTrained(fresh, { anyLogged: true }); }); }
    catch (e) { return { ok: false, aid: aid, status: 'error', why: String((e && e.message) || e) }; }
    var x = res && res.results && res.results[0];
    if (!x || (x.status !== 'updated' && x.status !== 'created')) return { ok: false, aid: aid, status: (x && x.status) || 'error' };
    Store.update(function (s) {
      var at = (s.programs || []).findIndex(function (y) { return y.athleteId === aid; });
      var base = at >= 0 ? s.programs[at] : { id: x.program_id, athleteId: aid, coachId: me(), maxes: null };
      var next = Object.assign({}, base, { id: x.program_id || base.id, name: name, weeks: x.weeks || p.weeks, startsOn: startsOn, meetDate: p.meetDate || null });
      if (typeof x.rev === 'number') next.rev = x.rev;
      if (at >= 0) s.programs[at] = next; else s.programs = (s.programs || []).concat([next]);
    });
    return { ok: true, aid: aid, status: x.status };
  }
  function whyWord(st) {
    return st === 'needs_archive' ? 'their block couldn’t be kept first' : st === 'stale' ? 'they logged a set just now' : st === 'departed' ? 'they’re no longer on your roster' : 'it didn’t save';
  }
  async function giveAll(src, plans, done) {
    var startsOn = nextMonday(), ok = [], bad = [];
    for (var i = 0; i < plans.length; i++) {
      var r = await giveOne(src, plans[i], startsOn);
      if (r.ok) ok.push(plans[i].athlete); else bad.push({ a: plans[i].athlete, why: whyWord(r.status) });
    }
    // The heads-up, one lifter at a time (each sends a push, and an email when there's one on file).
    if (!window._demoMode && typeof notifyAthleteAssigned === 'function') { for (var j = 0; j < ok.length; j++) { try { await notifyAthleteAssigned(ok[j].id); } catch (e) {} } }
    repaint();
    var msg = '';
    if (ok.length) msg = (src.name || 'The block') + ' given to ' + namesList(ok.map(function (a) { return first(a.name); })) + (window._demoMode ? ' in the demo. Nothing leaves this page.' : '. ' + (ok.length > 1 ? 'They each get' : first(ok[0].name) + ' gets') + ' a heads-up.');
    if (bad.length) msg += (msg ? ' ' : '') + bad.map(function (b) { return 'Nothing changed for ' + first(b.a.name) + ': ' + b.why + '.'; }).join(' ');
    if (typeof toast === 'function') toast(msg, bad.length ? 6000 : 3600);
    if (done) done(ok, bad);
  }
  function repaint() {
    try { if (typeof dkRowsFresh === 'function') dkRowsFresh(); } catch (e) {}
    if (isDeskNow()) {
      try { if (typeof dkWsRepaint === 'function') dkWsRepaint(); } catch (e) {}
      try { if (typeof dkPaintRail === 'function') dkPaintRail(); } catch (e) {}
      return;
    }
    try { if (window.CoachLifters && CoachLifters.refresh) CoachLifters.refresh(); } catch (e) {}
  }

  /* ---------- the flow ---------- */
  // open({ aid: whose block, block: a past block or the program running now, from: the button to come back to })
  async function open(opts) {
    opts = opts || {};
    var aid = opts.aid, block = opts.block, owner = athleteOf(aid) || { name: 'Lifter' };
    if (!block) return;
    var weeks = block.weeks;
    if (!Array.isArray(weeks) && window.DB && DB.getProgramBlockWeeks && !window._demoMode) {
      weeks = await DB.getProgramBlockWeeks(block.id).catch(function () { return null; });
      if (weeks) Store.update(function (s) { var b = (s.programBlocks || []).find(function (y) { return y.id === block.id; }); if (b) b.weeks = weeks; });
    }
    if (!Array.isArray(weeks) || !weeks.length) { if (typeof toast === 'function') toast('This block didn’t open. Check the connection and try again.'); return; }
    var src = { id: block.id, name: block.name || 'Block', weeks: weeks, maxes: srcMaxesOf(aid, block), ownerName: owner.name, setFields: block.setFields };
    var people = (st().athletes || []).filter(function (a) { return a.id !== aid && (!me() || !a.coachId || a.coachId === me()); })
      .sort(function (x, y) { return String(x.name).localeCompare(String(y.name)); });
    var picked = opts.picked || [];
    if (isDeskNow() && typeof dsPickDialog === 'function') pickDesk(src, people, picked, opts);
    else pickPhone(src, people, picked);
  }
  function noteFor(a) {
    var p = progOf(a.id), ws = p && typeof programWeekState === 'function' ? programWeekState(p) : null;
    if (!p || !(p.weeks || []).length) return 'No block yet';
    return (p.name || 'Block') + (ws ? ' · week ' + ws.number + ' of ' + ws.total : '');
  }

  /* ---------- the desk ---------- */
  function pickDesk(src, people, picked, opts) {
    dsPickDialog({
      title: 'Use ' + src.name + ' for another lifter',
      lead: 'Each lifter gets it on their own maxes, from Monday. Whatever they’ve logged in their current block is kept in their past blocks.',
      people: people.map(function (a) { return { id: a.id, name: a.name || 'Lifter', avatarUrl: a.avatarUrl, on: picked.indexOf(a.id) >= 0, note: noteFor(a) }; }),
      go: 'See their loads', none: 'Nobody else on your roster yet.',
      run: function (ids) { previewDesk(src, ids, opts, people); }
    });
  }
  function previewDesk(src, ids, opts, people) {
    var plans = ids.map(function (id) { return plan(src, id); });
    var veil = el('div', { class: 'dk-veil' });
    var box = el('div', { class: 'dk-modal rb-modal cl-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rbTitle' });
    box.appendChild(el('h2', { class: 'dk-modal-title', id: 'rbTitle' }, src.name + ' for ' + (plans.length === 1 ? first(plans[0].athlete.name) : plans.length + ' lifters')));
    box.appendChild(el('p', { class: 'ds-pv-sub' }, 'On their own maxes, starting ' + dayText(nextMonday()) + '. Nothing is written until you give it.'));
    var list = el('div', { class: 'rb-list' });
    plans.forEach(function (p, i) { list.appendChild(planNode(p, src, i, 'desk')); });
    box.appendChild(list);
    var row = el('div', { class: 'dk-modal-actions' });
    var back = dkBtn('Back', { onClick: function () { close(); pickDesk(src, people, ids, opts); } });
    var go = dkBtn('Give to ' + (plans.length === 1 ? first(plans[0].athlete.name) : plans.length + ' lifters'), { primary: true, icon: IC.copy, onClick: run });
    row.appendChild(back); row.appendChild(go);
    box.appendChild(row);
    veil.appendChild(box);
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); run(); }
    }
    function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
    veil._close = close;
    veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(veil);
    if (!reduced() && box.animate) box.animate([{ opacity: 0.6, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    go.focus();
    var busy = false;
    function run() {
      if (busy) return;
      busy = true; go.disabled = true; back.disabled = true;
      var l = go.querySelector('.dk-btn-l'); if (l) l.textContent = 'Giving…';
      giveAll(src, plans, function () { close(); var bd = document.querySelector('.bd-veil'); if (bd && bd._close) bd._close(); });
    }
  }
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

  // One lifter in the preview: who, their top sets from their own maxes, their block, anything to know.
  function planNode(p, src, i, mode) {
    var u = typeof getUnit === 'function' ? getUnit() : 'kg';
    var card = el('div', { class: 'rb-who', style: '--i:' + i });
    var head = el('div', { class: 'rb-head' });
    if (typeof dkAv === 'function' && mode === 'desk') head.appendChild(dkAv(p.athlete, 'is-sm'));
    else {
      var av = el('span', { class: 'ui-av rb-av av-h' + (typeof avatarHue === 'function' ? avatarHue(p.athlete.name || '?') : 0), 'data-name': p.athlete.name || '?', 'aria-hidden': 'true' }, typeof initials === 'function' ? initials(p.athlete.name || '?') : '');
      head.appendChild(av);
    }
    head.appendChild(el('b', { class: 'rb-name' }, p.athlete.name || 'Lifter'));
    card.appendChild(head);
    var lines = el('div', { class: 'rb-tops' });
    if (!p.tops.length) lines.appendChild(el('p', { class: 'rb-line is-quiet' }, 'No squat, bench or deadlift in its first week'));
    p.tops.forEach(function (t) {
      var ln = el('p', { class: 'rb-line' });
      ln.appendChild(el('i', { class: 'rb-dot l-' + (t.lift === 'squat' ? 'sq' : t.lift === 'bench' ? 'be' : 'dl'), 'aria-hidden': 'true' }));
      ln.appendChild(el('span', {}, reuseTopSetText(t, src.ownerName, u)));
      lines.appendChild(ln);
    });
    card.appendChild(lines);
    p.notes.forEach(function (n) { card.appendChild(el('p', { class: 'rb-note' }, n)); });
    p.warns.forEach(function (w) { var x = el('p', { class: 'rb-warn' }); x.appendChild(el('i', { class: 'rb-wdot', 'aria-hidden': 'true' })); x.appendChild(el('span', {}, w)); card.appendChild(x); });
    return card;
  }

  /* ---------- the phone ---------- */
  function pickPhone(src, people, picked) {
    if (typeof uiSheet !== 'function') return;
    var on = {};
    picked.forEach(function (id) { on[id] = true; });
    uiSheet('Use ' + src.name + ' for', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Each lifter gets it on their own maxes, from Monday. Whatever they’ve logged is kept in their past blocks.'));
      if (!people.length) { sheet.appendChild(el('p', { class: 'rb-empty' }, 'Nobody else on your roster yet.')); return; }
      var list = el('div', { class: 'ui-list rb-pick', role: 'group', 'aria-label': 'Lifters' });
      var go = el('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block rb-go' });
      var paintGo = function () {
        var n = Object.keys(on).filter(function (k) { return on[k]; }).length;
        go.disabled = !n;
        go.textContent = n ? 'See ' + (n === 1 ? 'their' : n + ' lifters’') + ' loads' : 'Pick a lifter';
      };
      people.forEach(function (a) {
        var b = el('button', { type: 'button', class: 'ui-row rb-prow', role: 'checkbox', 'aria-checked': String(!!on[a.id]) });
        var av = el('span', { class: 'ui-av av-h' + (typeof avatarHue === 'function' ? avatarHue(a.name || '?') : 0), 'data-name': a.name || '?', 'aria-hidden': 'true' }, typeof initials === 'function' ? initials(a.name || '?') : '');
        b.appendChild(av);
        var main = el('span', { class: 'ui-row-main' });
        main.appendChild(el('span', { class: 'ui-row-title' }, a.name || 'Lifter'));
        main.appendChild(el('span', { class: 'ui-row-sub' }, noteFor(a)));
        b.appendChild(main);
        var ck = el('span', { class: 'rb-ck', 'aria-hidden': 'true', html: on[a.id] ? IC.check : '' });
        b.appendChild(ck);
        b.addEventListener('click', function () {
          on[a.id] = !on[a.id];
          b.setAttribute('aria-checked', String(!!on[a.id]));
          ck.innerHTML = on[a.id] ? IC.check : '';
          if (typeof hapticTick === 'function') hapticTick();
          paintGo();
        });
        list.appendChild(b);
      });
      sheet.appendChild(list);
      go.addEventListener('click', function () {
        var ids = people.filter(function (a) { return on[a.id]; }).map(function (a) { return a.id; });
        if (!ids.length) return;
        close();
        setTimeout(function () { previewPhone(src, ids, people); }, 230);
      });
      sheet.appendChild(go);
      paintGo();
    }, { cls: 'rb-sheet cl-root' });
  }
  function previewPhone(src, ids, people) {
    var plans = ids.map(function (id) { return plan(src, id); });
    uiSheet(src.name + ' for ' + (plans.length === 1 ? first(plans[0].athlete.name) : plans.length + ' lifters'), function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'On their own maxes, starting ' + dayText(nextMonday()) + '. Nothing is written until you give it.'));
      var list = el('div', { class: 'rb-list' });
      plans.forEach(function (p, i) { list.appendChild(planNode(p, src, i, 'phone')); });
      sheet.appendChild(list);
      var go = el('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block rb-go' }, 'Give to ' + (plans.length === 1 ? first(plans[0].athlete.name) : plans.length + ' lifters'));
      var back = el('button', { type: 'button', class: 'ui-text-btn rb-back' }, 'Change who gets it');
      var busy = false;
      go.addEventListener('click', function () {
        if (busy) return;
        busy = true; go.disabled = true; go.textContent = 'Giving…';
        giveAll(src, plans, function () { close(); });
      });
      back.addEventListener('click', function () { close(); setTimeout(function () { pickPhone(src, people, ids); }, 230); });
      sheet.appendChild(go);
      sheet.appendChild(back);
    }, { cls: 'rb-sheet cl-root' });
  }

  window.ReuseBlock = { open: open, plan: plan, srcMaxesOf: srcMaxesOf, dstMaxesOf: dstMaxesOf, nextMonday: nextMonday };
})();
