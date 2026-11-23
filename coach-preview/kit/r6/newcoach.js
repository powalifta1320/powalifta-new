/* newcoach.js: the first-time coach's shared sheets and cards (spec C, first-time-coach.md; plan.md SHEETS).
   Loads after desk.js and fix.js (with fix.css, then newcoach.css). Every number and word that is the store's comes from
   the store (PL.invites, PL.lifters, PL.setup, PL.billing, PL.settings); this file shows them, takes the coach's words
   and runs one write with one Undo.

   DESK.addLifter({ from, way, name, lifterId })   FTC §3.1 to §3.3: dialog[data-sheet=add-lifter], two ways
     Invite (name, email optional, the person's own link, Charge them… folded) and Add by hand (name, category, best
     sets, bodyweight, days, session, meet, injuries). Each field carries data-field = the store's field name. Errors sit
     beside their field and show when a field is left or the main button is pressed, never per key. Enter in a field
     moves to the next one; ⌘↵ presses the main button; Esc closes; ← → move the way. The foot says the plan after this
     lifter; with the plan full the main button waits for "Switch to Basic, $24.99 a month" (PL.settings.plan, Undo).
     way 'hand' with lifterId (an invited lifter): "Type their answers yourself", the invite becomes an added lifter who
     keeps the link (one Undo for both writes).
   DESK.charge(id, o)        FTC §10.2: dialog[data-sheet=charge]; PL.billing.charge, one write, one Undo
   DESK.setupCard(el, o)     FTC §4.1: Getting started from PL.setup.get(); only the next step shows its line
   DESK.setup.run(act, trigger)   a step's act (the crimson on Overview runs the same one)
   DESK.weekOne(trigger)     FTC §4.3: What to watch in week one; Got it ticks step 5 (PL.setup.watched)
   DESK.smallDesk(el, o)     FTC §5.2: Your lifters, one row per lifter (invited ones too), [data-crop=small]
   DESK.phaseStrip(phases, o)  FTC §7.1: one row of week cells, each phase a run with its name under it (html)
   Each write fires 'desk:newcoach' on document ({ detail: { kind, id } }). */
(function () {
  'use strict';
  var DESK = window.DESK, PL = window.PL, K = window.K;
  if (!DESK || !PL || !K) return;
  var esc = DESK.esc || K.esc;
  var fn = function (o, k) { return !!o && typeof o[k] === 'function'; };
  var data = function (r) { return r && !r.error ? r.data : null; };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var first = function (s) { return String(s || '').trim().split(/\s+/)[0] || ''; };
  var day = function (iso) { return iso ? K.wd3(iso) + ' ' + K.dm(iso) : ''; };
  var today = function () { var n = fn(PL, 'now') ? PL.now() : null; n = n && n.data !== undefined ? n.data : n; var s = String(n || ''); return /^\d{4}-\d\d-\d\d/.test(s) ? s.slice(0, 10) : K.today; };
  var nextMonday = function () { return K.add(K.monday(today()), 7); };
  var LIFTS = [['squat', 'Squat'], ['bench', 'Bench'], ['deadlift', 'Deadlift']];
  var WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var CADS = [['weekly', 'Week', 'a week'], ['fortnightly', '2 weeks', 'every 2 weeks'], ['4-weekly', '4 weeks', 'every 4 weeks'], ['monthly', 'Month', 'a month'], ['quarterly', 'Quarter', 'a quarter'], ['yearly', 'Year', 'a year'], ['once', 'Once', 'once']];
  var every = function (c) { var x = CADS.filter(function (k) { return k[0] === c; })[0]; return x ? x[2] : 'a month'; };
  var X = DESK.ic('x', 2);
  var CHECK = DESK.ic('check', 2.4);
  function emit(detail) { try { document.dispatchEvent(new CustomEvent('desk:newcoach', { detail: detail })); } catch (e) { /* old browser */ } }

  /* the store's own toasts during a write are caught and shown once, in the write's words, with its Undo */
  function quiet(f) {
    var h = PL.hooks, prev = h ? h.toast : null, res;
    if (h) h.toast = function () {};
    try { res = f(); } finally { if (h) h.toast = prev; }
    return res;
  }
  var undoOf = function (r) { return r && r.meta && r.meta.undo ? r.meta.undo : null; };
  function undoAll(toks) { toks = toks.filter(Boolean); if (!toks.length) return null; return function () { var last = null; toks.slice().reverse().forEach(function (t) { last = PL.undo(t); }); return last; }; }
  /* a toast while a modal sheet is open sits inside the sheet's top layer, so its Undo can be pressed; back to the page
     when the sheet closes */
  function toast(text, undo, d) {
    if (!text) return null;
    var t = DESK.toast(text, undo || null), box = $('.toasts');
    if (d && d.open && box && box.parentNode !== d) d.appendChild(box);
    return t;
  }
  /* the clipboard, or a refusal within 800 ms (a page without the focus may never answer) */
  function copy(text) {
    return new Promise(function (ok, no) {
      var t = setTimeout(function () { no(new Error('no answer')); }, 800);
      var y = function () { clearTimeout(t); ok(); }, n = function (e) { clearTimeout(t); no(e); };
      try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(y, n); return; } } catch (e) { /* refused */ }
      n(new Error('no clipboard'));
    });
  }

  /* ================= one modal sheet per kind, on the raised solid (ui.css dialog.sheet, fix.css .fx-s) ================= */
  var sheets = {};
  function sheet(name, label, html) {
    if (DESK.pop && DESK.pop.isOpen()) DESK.pop.close();
    if (DESK.sheet && DESK.sheet.isOpen()) DESK.sheet.close();
    $$('dialog[data-sheet][open]').forEach(function (x) { if (x.getAttribute('data-sheet') !== name) x.close(); });
    var d = sheets[name];
    if (!d) {
      d = sheets[name] = document.createElement('dialog');
      d.className = 'sheet fx-sheet nc-sheet'; d.setAttribute('data-layer', 'sheet'); d.setAttribute('role', 'dialog'); d.setAttribute('data-sheet', name);
      document.body.appendChild(d);
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
      d.addEventListener('close', function () { var box = $('.toasts', d); if (box) document.body.appendChild(box); if (d._off) { d._off(); d._off = null; } });
    }
    if (d._off) { d._off(); d._off = null; }
    d.setAttribute('aria-label', label);
    d.innerHTML = html;
    if (!d.open) d.showModal();
    return d;
  }
  var headHtml = function (title, id) {
    return '<div class="fx-sh nc-sh"><h2 class="fx-st" id="' + id + '" tabindex="-1">' + esc(title) + '</h2><button type="button" class="btn quiet sm icon nc-x" data-close aria-label="Close" title="Close (Esc)">' + X + '</button></div>';
  };
  /* ids carry the sheet's name, so two sheets in the page never share one */
  var idp = 'nc-';
  var idOf = function (key) { return idp + key.replace(/\./g, '-'); };
  var pfx = function (d) { return 'nc-' + d.getAttribute('data-sheet') + '-'; };
  /* a field: label, the control, its error beside it (hidden until the field is left wrong) */
  function fieldHtml(key, label, control, o) {
    o = o || {};
    return '<div class="fx-f nc-f' + (o.cls ? ' ' + o.cls : '') + '" data-f="' + esc(key) + '"' + (o.title ? ' title="' + esc(o.title) + '"' : '') + (o.hidden ? ' hidden' : '') + '>' +
      '<label class="fx-fl" for="' + esc(idOf(key)) + '"' + (o.labelId ? ' id="' + o.labelId + '"' : '') + '>' + esc(label) + (o.opt ? ' <span class="nc-opt">optional</span>' : '') + '</label>' +
      control + '<p class="nc-err" id="' + esc(idOf('e-' + key)) + '" role="alert" hidden></p></div>';
  }
  function inputHtml(key, value, o) {
    o = o || {};
    return '<input class="input' + (o.num ? ' num' : '') + (o.cls ? ' ' + o.cls : '') + '" id="' + esc(idOf(key)) + '" data-field="' + esc(key) + '" type="' + (o.type || 'text') + '"' +
      (o.mode ? ' inputmode="' + o.mode + '"' : '') + ' autocomplete="off" spellcheck="false" value="' + esc(value == null ? '' : value) + '"' + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') +
      (o.aria ? ' aria-label="' + esc(o.aria) + '"' : '') + (o.min ? ' min="' + esc(o.min) + '"' : '') + (o.auto ? ' autofocus' : '') + '>';
  }
  function setErr(d, key, text) {
    var id = pfx(d) + 'e-' + key.replace(/\./g, '-'), e = d && d.querySelector('#' + id); if (!e) return;
    var inp = d.querySelector('[data-field="' + key + '"]'), ctl = inp && inp.matches('input, select, textarea') ? inp : null;
    e.textContent = text || ''; e.hidden = !text;
    if (ctl) { ctl.classList.toggle('is-error', !!text); if (text) { ctl.setAttribute('aria-describedby', id); ctl.setAttribute('aria-invalid', 'true'); } else { ctl.removeAttribute('aria-describedby'); ctl.removeAttribute('aria-invalid'); } }
    else if (inp) { if (text) inp.setAttribute('aria-describedby', id); else inp.removeAttribute('aria-describedby'); }
  }
  function footErr(d, text) { var e = $('[data-nc-err=sheet]', d); if (e) { e.textContent = text || ''; e.hidden = !text; } }
  /* numbers as typed: '' is no answer; anything not a number is NaN */
  function num(v) { v = String(v == null ? '' : v).trim().replace(',', '.'); if (v === '') return null; return /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN; }
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var RULES = {
    email: function (v) { v = String(v || '').trim(); return v && !EMAIL.test(v) ? 'An email like jess@example.com, or leave it empty.' : ''; },
    kg: function (v) { var x = num(v); return x === null ? '' : !(x >= 20 && x <= 600 && Math.abs(x * 2 - Math.round(x * 2)) < 1e-9) ? 'Kilos like 85 or 82.5.' : ''; },
    reps: function (v) { var x = num(v); return x === null ? '' : !(x >= 1 && x <= 12 && x % 1 === 0) ? 'Reps from 1 to 12.' : ''; },
    bw: function (v) { var x = num(v); return x === null ? '' : !(x >= 30 && x <= 250) ? 'Bodyweight in kilos, like 61.8.' : ''; },
    minutes: function (v) { var x = num(v); return x === null ? '' : !(x >= 15 && x <= 300 && x % 1 === 0) ? 'Minutes like 60, or leave it empty.' : ''; },
    amount: function (v) { var x = num(v); return !(x > 0 && x <= 100000) ? 'A price is over 0. Free needs no price: close this.' : ''; },
    date: function (v) { return v && v <= today() ? 'Give the meet a date to come.' : ''; }
  };
  var ruleOf = function (key) { return /\.kg$/.test(key) ? RULES.kg : /\.reps$/.test(key) ? RULES.reps : key === 'meet.date' ? RULES.date : RULES[key] || null; };
  /* Enter in a field moves to the next one (never presses the main button); ⌘↵ presses it */
  function keys(d, main) {
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); main(); return; }
      var t = e.target;
      if (e.key === 'Enter' && t.matches('input:not([type=checkbox]):not([type=radio])')) {
        e.preventDefault();
        var all = $$('.fx-sb input, .fx-sb select, .fx-sb textarea, .fx-sb button', d).filter(function (x) { return !x.disabled && x.offsetParent !== null && !x.closest('[hidden]'); });
        var nx = all[all.indexOf(t) + 1]; if (nx) nx.focus(); else { var m = $('[data-nc-main]', d); if (m && !m.disabled) m.focus(); }
        return;
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && t.matches('.seg > button, .nc-chips > button')) {
        var bs = $$('button', t.parentNode), i = bs.indexOf(t), j = Math.max(0, Math.min(bs.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)));
        if (j !== i && t.closest('[data-nc-pick]')) { e.preventDefault(); bs[j].focus(); bs[j].click(); }
      }
    });
  }
  function pressed(group, btn) { $$('button', group).forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); }); if (group.classList.contains('seg')) DESK.segSync(group, true); }

  /* ================= the plan after this lifter (FTC §3.2 foot, §10.3) ================= */
  function seatsNow() {
    var s = fn(PL.billing, 'summary') ? data(PL.billing.summary()) : null; s = s && s.seats ? s.seats : null;
    if (!s) return null;
    var plans = fn(PL.settings, 'get') ? (data(PL.settings.get()) || {}).plans || [] : [];
    var i = -1; plans.forEach(function (p, k) { if (p.current || String(p.name) === String(s.plan)) i = i < 0 ? k : i; });
    var next = i >= 0 ? plans[i + 1] || null : null;
    var full = s.limit != null && s.free != null && s.free <= 0;
    return { plan: s.plan, used: s.used, limit: s.limit, free: s.free, full: full, next: next };
  }
  var money2 = function (v) { return '$' + (Math.round(v * 100) % 100 ? Number(v).toFixed(2) : String(Math.round(v))); };
  function seatLine(s) {
    if (!s) return '';
    if (s.full) return s.plan + ' holds ' + s.limit + ' lifters.';
    var n = (s.used || 0) + 1;
    if (/^free$/i.test(s.plan)) return 'Free, ' + n + ' of ' + s.limit + ' lifters after this.';
    return s.limit == null ? n + ' seats after this.' : n + ' of ' + s.limit + ' seats after this.';
  }
  var fullTitle = function (s) { return s.plan + ' holds ' + s.limit + ' lifters.' + (s.next ? ' Switch to ' + s.next.name + ' first.' : ''); };

  /* ================= DESK.addLifter ================= */
  DESK.addLifter = function (o) {
    o = o || {};
    if (!PL.invites || !fn(PL.invites, 'create') || !fn(PL.lifters, 'add')) { DESK.toast('Adding a lifter needs the store’s invites (kit/r6/store.js).'); return null; }
    var conv = o.lifterId && o.way === 'hand' ? data(PL.lifters.get(o.lifterId)) : null;
    var pk = fn(PL.billing, 'packages') ? data(PL.billing.packages()) || [] : [];
    var st = {
      way: o.way === 'hand' ? 'hand' : 'invite', name: o.name || (conv ? conv.name : ''), email: '', charge: false,
      pkg: pk[0] ? pk[0].name : 'Online coaching', amount: '', cadence: pk[0] && pk[0].cadence ? pk[0].cadence : 'monthly', startsOn: nextMonday(),
      sex: conv && conv.sex ? conv.sex : null, best: { squat: { kg: '', reps: '' }, bench: { kg: '', reps: '' }, deadlift: { kg: '', reps: '' } },
      bw: '', days: [], minutes: '', meetName: '', meetDate: '', injuries: '', copied: false
    };
    var d = sheet('add-lifter', 'Add a lifter', '<div class="fx-s nc-add" data-crop="add-lifter"></div>');
    var box = $('.nc-add', d);
    var linkOf = function () { var nm = st.name.trim(); if (!nm) return ''; var r = data(PL.invites.preview(nm)); return r ? r.link : ''; };
    var fst = function () { return first(st.name); };
    function mainWords() {
      var f = fst();
      if (st.way === 'hand') return f ? 'Add ' + f : 'Add the lifter';
      if (st.email.trim()) return f ? 'Email the invite to ' + f : 'Email the invite';
      return f ? 'Add ' + f + ' and copy the link' : 'Add and copy the link';
    }
    function inviteHtml() {
      var h = fieldHtml('name', 'Name', inputHtml('name', st.name, { auto: true }));
      h += fieldHtml('email', 'Email', inputHtml('email', st.email, { type: 'email', mode: 'email' }), { opt: true });
      var ln = linkOf();
      h += '<div class="fx-f nc-link"><span class="fx-fl">Their link</span><div class="nc-lr"><span class="nc-url num" data-nc-link>' + (ln ? esc(ln) : '<span class="nc-none">Shows when you type a name</span>') + '</span>' +
        '<button type="button" class="btn quiet sm nc-copy" data-nc-copy' + (ln ? '' : ' hidden') + '>Copy</button></div>' +
        '<p class="nc-line">They open it, get the free app and answer your intake.</p></div>';
      h += '<button type="button" class="link nc-fold" data-nc-charge aria-expanded="' + st.charge + '">Charge them…</button>';
      h += '<div class="nc-money" data-nc-money' + (st.charge ? '' : ' hidden') + '>' +
        '<p class="nc-line"><span>POWALIFTA never charges your lifters.</span> <span>They pay you their usual way; you mark it paid.</span></p>' +
        fieldHtml('pkg', 'Package', inputHtml('pkg', st.pkg, { aria: 'Package' })) +
        fieldHtml('amount', 'Price', '<span class="nc-money-in"><span class="nc-cur" aria-hidden="true">$</span>' + inputHtml('amount', st.amount, { mode: 'decimal', num: true, aria: 'Price' }) + '</span>') +
        fieldHtml('cadence', 'Every', chipsHtml('cadence', CADS.map(function (c) { return [c[0], c[1]]; }), st.cadence, 'Every')) +
        fieldHtml('startsOn', 'Starts', inputHtml('startsOn', st.startsOn, { type: 'date', num: true, min: today() })) + '</div>';
      return h;
    }
    function handHtml() {
      var h = fieldHtml('name', 'Name', inputHtml('name', st.name, { auto: true }));
      h += '<div class="fx-f nc-f" data-f="sex"><span class="fx-fl" id="nc-l-sex">Category</span><div class="seg" role="group" aria-labelledby="nc-l-sex" data-field="sex" data-nc-pick>' +
        [['F', 'Women'], ['M', 'Men']].map(function (x) { return '<button type="button" data-v="' + x[0] + '" aria-pressed="' + (st.sex === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
      h += '<fieldset class="fx-fs nc-best" title="Their best set in the last 3 months"><legend class="fx-fl">Best sets</legend>';
      LIFTS.forEach(function (L) {
        var b = st.best[L[0]];
        h += '<div class="nc-br" data-f="best.' + L[0] + '"><span class="nc-bl">' + L[1] + '</span>' +
          inputHtml('best.' + L[0] + '.kg', b.kg, { mode: 'decimal', num: true, aria: L[1] + ' kilos', ph: 'kg', cls: 'nc-kg' }) + '<span class="nc-times" aria-hidden="true">×</span>' +
          inputHtml('best.' + L[0] + '.reps', b.reps, { mode: 'numeric', num: true, aria: L[1] + ' reps', ph: 'reps', cls: 'nc-reps' }) +
          '<p class="nc-err" id="' + idOf('e-best-' + L[0] + '-kg') + '" role="alert" hidden></p><p class="nc-err" id="' + idOf('e-best-' + L[0] + '-reps') + '" role="alert" hidden></p></div>';
      });
      h += '</fieldset>';
      h += fieldHtml('bw', 'Bodyweight', '<span class="nc-unit-in">' + inputHtml('bw', st.bw, { mode: 'decimal', num: true, aria: 'Bodyweight in kilos' }) + '<span class="nc-u">kg</span></span>');
      h += '<div class="fx-f nc-f" data-f="days"><span class="fx-fl" id="nc-l-days">Trains</span><div class="nc-chips nc-days" role="group" aria-labelledby="nc-l-days" data-field="days">' +
        WEEK.map(function (w) { return '<button type="button" data-v="' + w + '" aria-pressed="' + (st.days.indexOf(w) >= 0) + '">' + w + '</button>'; }).join('') + '</div><p class="nc-err" id="' + idOf('e-days') + '" role="alert" hidden></p></div>';
      h += fieldHtml('minutes', 'Session', '<span class="nc-unit-in">' + inputHtml('minutes', st.minutes, { mode: 'numeric', num: true, aria: 'Session in minutes' }) + '<span class="nc-u">min</span></span>');
      h += '<div class="fx-f nc-f nc-meet" data-f="meet"><span class="fx-fl">Meet <span class="nc-opt">optional</span></span><div class="nc-meet-r">' +
        inputHtml('meet.name', st.meetName, { aria: 'Meet name', ph: 'Name' }) + inputHtml('meet.date', st.meetDate, { type: 'date', num: true, aria: 'Meet date', min: K.add(today(), 1) }) + '</div>' +
        '<p class="nc-err" id="' + idOf('e-meet-date') + '" role="alert" hidden></p></div>';
      h += fieldHtml('injuries', 'Injuries', inputHtml('injuries', st.injuries, { ph: 'Left knee, after heavy squats' }), { opt: true });
      return h;
    }
    function footHtml() {
      var s = conv ? null : seatsNow(), full = !!(s && s.full);
      var h = '<div class="fx-sf nc-sf"><p class="nc-seat" data-nc-seat>' + esc(seatLine(s)) + '</p>';
      if (full && s.next) h += '<button type="button" class="btn nc-up" data-nc-plan="' + esc(s.next.id) + '">' + esc('Switch to ' + s.next.name + ', ' + money2(s.next.price) + ' a month') + '</button>';
      h += '<p class="fx-err" data-nc-err="sheet" role="alert" hidden></p><button type="button" class="btn quiet" data-close>Cancel</button>';
      var w = mainWords();
      h += '<button type="button" class="btn" data-primary data-nc-main' + (full ? ' disabled title="' + esc(fullTitle(s)) + '"' : '') + '>' + esc(w) + '</button></div>';
      return h;
    }
    function render(focusKey) {
      idp = pfx(d);
      var h = headHtml(conv ? 'Type ' + fst() + '’s answers' : 'Add a lifter', 'nc-add-t');
      if (!conv) h += '<div class="nc-way"><div class="seg" role="group" aria-label="How to add them" data-nc-way data-nc-pick><button type="button" data-v="invite" aria-pressed="' + (st.way === 'invite') + '">Invite</button><button type="button" data-v="hand" aria-pressed="' + (st.way === 'hand') + '">Add by hand</button></div></div>';
      h += '<div class="fx-sb nc-sb">' + (st.way === 'hand' ? handHtml() : inviteHtml()) + '</div>' + footHtml();
      box.innerHTML = h;
      $$('.seg', box).forEach(function (s) { DESK.segSync(s); });
      var f = focusKey ? $(focusKey, box) : $('[data-field=name]', box);
      if (f) f.focus({ preventScroll: true });
    }
    function refreshFoot() {
      var sf = $('.nc-sf', box); if (!sf) return;
      var keep = document.activeElement && sf.contains(document.activeElement) ? document.activeElement.getAttribute('data-nc-main') != null ? '[data-nc-main]' : '[data-nc-plan]' : null;
      sf.outerHTML = footHtml();
      if (keep) { var k = $(keep, box) || $('[data-nc-main]', box); if (k) k.focus(); }
    }
    function liveWords() {
      var m = $('[data-nc-main]', box); if (m) m.textContent = mainWords();
      var l = $('[data-nc-link]', box), c = $('[data-nc-copy]', box), ln = linkOf();
      if (l) l.innerHTML = ln ? esc(ln) : '<span class="nc-none">Shows when you type a name</span>';
      if (c) { c.hidden = !ln; c.textContent = 'Copy'; }
    }
    function read(inp) {
      var k = inp.getAttribute('data-field'), v = inp.value;
      if (k === 'name') st.name = v; else if (k === 'email') st.email = v; else if (k === 'pkg') st.pkg = v; else if (k === 'amount') st.amount = v; else if (k === 'startsOn') st.startsOn = v;
      else if (k === 'bw') st.bw = v; else if (k === 'minutes') st.minutes = v; else if (k === 'meet.name') st.meetName = v; else if (k === 'meet.date') st.meetDate = v; else if (k === 'injuries') st.injuries = v;
      else { var m = /^best\.(\w+)\.(kg|reps)$/.exec(k); if (m) st.best[m[1]][m[2]] = v; }
    }
    function check(inp) {
      var k = inp.getAttribute('data-field'), r = ruleOf(k); if (!r) return;
      if (k === 'amount' && !st.charge) return;
      if (k === 'meet.date') { setErr(d, 'meet.date', (st.meetName.trim() && !st.meetDate) ? 'Give the meet a date to come.' : r(inp.value)); return; }
      setErr(d, k, r(inp.value));
    }
    /* every rule at once on the press; answers the first field that is wrong */
    function checkAll() {
      var bad = [], put = function (k, t) { setErr(d, k, t); if (t) bad.push(k); };
      put('name', st.name.trim() ? '' : 'Write a name.');
      if (st.way === 'invite') {
        put('email', RULES.email(st.email));
        if (st.charge) { put('amount', RULES.amount(st.amount)); put('startsOn', st.startsOn && st.startsOn >= today() ? '' : 'Starts today or a day to come.'); }
      } else {
        LIFTS.forEach(function (L) {
          var b = st.best[L[0]], kgE = RULES.kg(b.kg), rE = RULES.reps(b.reps), any = String(b.kg).trim() || String(b.reps).trim();
          if (any && !kgE && !String(b.kg).trim()) kgE = 'Kilos like 85 or 82.5.';
          if (any && !rE && !String(b.reps).trim()) rE = 'Reps from 1 to 12.';
          put('best.' + L[0] + '.kg', kgE); put('best.' + L[0] + '.reps', rE);
        });
        put('bw', num(st.bw) === null ? 'Bodyweight in kilos, like 61.8.' : RULES.bw(st.bw));
        put('days', st.days.length ? '' : 'Pick the days they train.');
        put('minutes', RULES.minutes(st.minutes));
        put('meet.date', st.meetName.trim() || st.meetDate ? (!st.meetName.trim() || !st.meetDate ? 'Give the meet a date to come.' : RULES.date(st.meetDate)) : '');
      }
      return bad;
    }
    function showStoreErr(r) {
      var e = r && r.error; if (!e) return;
      var det = e.details || e.detail || [];
      if (Array.isArray(det) && det.length) det.forEach(function (x) { if (x && x.field) setErr(d, x.field === 'pkg' ? 'pkg' : x.field, x.message); });
      else if (/on your desk already/.test(e.message || '')) setErr(d, 'name', e.message);
      else footErr(d, e.message || 'That did not go through.');
      var f = det[0] && det[0].field ? $('[data-field="' + det[0].field + '"]', box) : null; if (f && f.focus) f.focus();
    }
    function done(r, kind, undo, words) {
      d.close();
      toast(words, undo);
      emit({ kind: kind, id: r && r.data ? r.data.lifterId || r.data.id : null });
    }
    function invite() {
      var nm = st.name.trim(), em = st.email.trim();
      var r = quiet(function () { return PL.invites.create({ name: nm, email: em || null, pkg: null, amount: null }); });
      if (!r || r.error) { showStoreErr(r); return; }
      var toks = [undoOf(r)], words = r.meta && r.meta.label ? r.meta.label : (em ? 'Invite emailed to ' + first(nm) + '.' : nm + ' invited.');
      if (st.charge && fn(PL.billing, 'charge')) {
        var c = quiet(function () { return PL.billing.charge(r.data.lifterId, { name: st.pkg.trim() || 'Online coaching', amount: num(st.amount), cadence: st.cadence, firstDue: st.startsOn, tell: false }); });
        if (!c || c.error) { PL.undo(toks[0]); showStoreErr(c); return; }
        toks.push(undoOf(c)); if (c.meta && c.meta.label) words += ' ' + c.meta.label.split(/ Sent to /)[0];
      }
      var undo = undoAll(toks);
      if (em) { done(r, 'invite', undo, words); return; }
      var link = r.data.link || linkOf(), shown = r.data.words && r.data.words.shown ? r.data.words.shown : nm + ' invited. The link is ' + link + '.';
      copy('https://' + link).then(function () { done(r, 'invite', undo, words); }, function () { done(r, 'invite', undo, shown + words.replace(/^[^.]*\.( Link copied\.)?/, '')); });
    }
    function byHand() {
      var best = {};
      LIFTS.forEach(function (L) { var b = st.best[L[0]]; if (String(b.kg).trim() || String(b.reps).trim()) best[L[0]] = { kg: num(b.kg), reps: num(b.reps) }; });
      var args = { name: st.name.trim(), sex: st.sex, best: best, bw: num(st.bw), days: st.days.slice(), minutes: num(st.minutes), meet: st.meetName.trim() ? { name: st.meetName.trim(), date: st.meetDate } : null, injuries: st.injuries.trim() || null, email: conv && conv.made ? conv.made.email || null : null };
      var toks = [];
      if (conv && conv.made && conv.made.inviteId && fn(PL.invites, 'cancel')) {
        var c0 = quiet(function () { return PL.invites.cancel(conv.made.inviteId); });
        if (!c0 || c0.error) { showStoreErr(c0); return; }
        toks.push(undoOf(c0));
      }
      var r = quiet(function () { return PL.lifters.add(args); });
      if (!r || r.error) { if (toks[0]) PL.undo(toks[0]); showStoreErr(r); return; }
      toks.push(undoOf(r));
      done(r, 'added', undoAll(toks), r.meta && r.meta.label ? r.meta.label : args.name + ' added.');
    }
    function press() {
      var m = $('[data-nc-main]', box); if (m && m.disabled) return;
      footErr(d, '');
      var bad = checkAll();
      if (bad.length) { var f = $('[data-field="' + bad[0] + '"]', box); if (f && bad[0] !== 'days') f.focus(); return; }
      if (st.way === 'hand') byHand(); else invite();
    }
    box.addEventListener('input', function (e) {
      var t = e.target; if (!t.matches('[data-field]')) return;
      read(t);
      var k = t.getAttribute('data-field');
      if (k === 'name' || k === 'email') liveWords();
      /* an error already showing clears as soon as the words are right; a new one waits for the field to be left */
      var err = d.querySelector('#' + pfx(d) + 'e-' + k.replace(/\./g, '-'));
      if (err && !err.hidden) { var r = ruleOf(k); if (k === 'name' ? t.value.trim() : r && !r(t.value)) setErr(d, k, ''); }
    });
    box.addEventListener('change', function (e) { if (e.target.matches('[data-field]')) { read(e.target); check(e.target); } });
    box.addEventListener('focusout', function (e) { var t = e.target; if (t.matches('input[data-field]') && t.type !== 'date') check(t); });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-nc-main')) { press(); return; }
      if (b.hasAttribute('data-nc-plan')) {
        var id = b.getAttribute('data-nc-plan'), r = quiet(function () { return PL.settings.plan(id); });
        if (!r || r.error) { footErr(d, (r && r.error && r.error.message) || 'The plan did not change.'); return; }
        toast(r.meta && r.meta.label ? r.meta.label : 'Plan changed.', r.meta && r.meta.undo ? function () { return PL.undo(r.meta.undo); } : null, d);
        refreshFoot(); var mm = $('[data-nc-main]', box); if (mm && !mm.disabled) mm.focus();
        return;
      }
      if (b.hasAttribute('data-nc-copy')) {
        var ln = linkOf(); if (!ln) return;
        copy('https://' + ln).then(function () { if (DESK.swap) DESK.swap(b, 'Copied', { revert: 2400 }); else b.textContent = 'Copied'; }, function () { b.textContent = 'Copy'; footErr(d, 'Copy did not work here. The link is ' + ln + '.'); });
        return;
      }
      if (b.hasAttribute('data-nc-charge')) {
        st.charge = !st.charge; b.setAttribute('aria-expanded', String(st.charge));
        var mo = $('[data-nc-money]', box); if (mo) mo.hidden = !st.charge;
        if (!st.charge) ['amount', 'startsOn', 'pkg'].forEach(function (k) { setErr(d, k, ''); });
        if (st.charge) { var p = $('[data-field=amount]', box); if (p) p.focus(); }
        return;
      }
      var g = b.closest('[data-nc-way]');
      if (g) { var w = b.getAttribute('data-v'); if (w !== st.way) { st.way = w; render('[data-nc-way] button[data-v="' + w + '"]'); } return; }
      g = b.closest('[data-field=sex]'); if (g) { st.sex = b.getAttribute('data-v'); pressed(g, b); return; }
      g = b.closest('[data-field=days]');
      if (g) { var v = b.getAttribute('data-v'), i = st.days.indexOf(v); if (i >= 0) st.days.splice(i, 1); else st.days.push(v); st.days = WEEK.filter(function (x) { return st.days.indexOf(x) >= 0; }); b.setAttribute('aria-pressed', String(i < 0)); if (st.days.length) setErr(d, 'days', ''); return; }
      g = b.closest('[data-field=cadence]'); if (g) { st.cadence = b.getAttribute('data-v'); pressed(g, b); return; }
    });
    keys(d, press);
    /* the plan can change from another tab or an Undo: the foot follows */
    if (fn(PL, 'on')) d._off = PL.on('change', function () { if (d.open) refreshFoot(); });
    render();
    return d;
  };

  /* chips: a row of choices (aria-pressed), wrapping; ← → walk them */
  function chipsHtml(key, list, on, label) {
    return '<div class="nc-chips" role="group" aria-label="' + esc(label) + '" data-field="' + esc(key) + '" data-nc-pick>' + list.map(function (x) { return '<button type="button" data-v="' + esc(x[0]) + '" aria-pressed="' + (x[0] === on) + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
  }

  /* ================= DESK.charge (FTC §10.2) ================= */
  function firstPayDay(id) {
    var l = data(PL.lifters.get(id)), p = l && l.program, s = p && (p.startsOn || p.start), t = today();
    if (s && /^\d{4}-\d\d-\d\d/.test(s) && s.slice(0, 10) >= t) return s.slice(0, 10);
    return nextMonday();
  }
  DESK.charge = function (id, o) {
    o = o || {};
    if (!fn(PL.billing, 'charge')) { DESK.toast('Charging needs the store’s billing.charge (kit/r6/store.js).'); return null; }
    var all = (data(PL.lifters.list({})) || []).filter(function (x) { return x && x.id; });
    var pk = fn(PL.billing, 'packages') ? data(PL.billing.packages()) || [] : [];
    var st = { id: id || (all[0] ? all[0].id : null), pkg: o.pkg || (pk[0] ? pk[0].name : 'Online coaching'), amount: o.amount != null ? String(o.amount) : '', cadence: pk[0] && pk[0].cadence ? pk[0].cadence : 'monthly', when: 'first', date: '', tell: true, text: null };
    var d = sheet('charge', 'Charge a lifter', '<div class="fx-s nc-charge" data-crop="charge"></div>');
    var box = $('.nc-charge', d);
    var who = function () { var l = st.id ? data(PL.lifters.get(st.id)) : null; return l ? first(l.name) : ''; };
    var dueOf = function () { return st.when === 'today' ? today() : st.when === 'pick' ? st.date : st.id ? firstPayDay(st.id) : nextMonday(); };
    function priceWords() { var a = num(st.amount); return a > 0 ? money2(a) + ' ' + every(st.cadence) : ''; }
    function draft() {
      var f = who(), a = num(st.amount), due = dueOf();
      if (!(a > 0)) return 'Hi ' + f + ', coaching starts ' + day(due) + '. Pay me your usual way.';
      return 'Hi ' + f + ', coaching is ' + money2(a) + (st.cadence === 'once' ? ', due ' : ' ' + every(st.cadence) + ' from ') + day(due) + '. Pay me your usual way.';
    }
    var mainWords = function () { var f = who(), p = priceWords(); return 'Charge ' + (f || 'them') + (p ? ' ' + p : ''); };
    function render() {
      idp = pfx(d);
      var f = who(), h = headHtml(f ? 'Charge ' + f : 'Charge a lifter', 'nc-ch-t') + '<div class="fx-sb nc-sb">';
      if (!id) h += fieldHtml('lifter', 'Lifter', '<select class="input" id="nc-lifter" data-field="lifter">' + all.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === st.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>');
      h += fieldHtml('name', 'Package', inputHtml('name', st.pkg, { auto: true }));
      h += fieldHtml('amount', 'Price', '<span class="nc-money-in"><span class="nc-cur" aria-hidden="true">$</span>' + inputHtml('amount', st.amount, { mode: 'decimal', num: true, aria: 'Price' }) + '</span>');
      h += fieldHtml('cadence', 'Every', chipsHtml('cadence', CADS.map(function (c) { return [c[0], c[1]]; }), st.cadence, 'Every'));
      var fd = st.id ? firstPayDay(st.id) : nextMonday();
      h += '<div class="fx-f nc-f" data-f="firstDue"><span class="fx-fl" id="nc-l-due">First payment</span>' + chipsHtml('firstDue', [['first', day(fd)], ['today', 'Today'], ['pick', 'Pick a date']], st.when, 'First payment').replace('aria-label="First payment"', 'aria-labelledby="nc-l-due"') +
        '<input class="input num nc-date" id="' + idOf('firstDue') + '" data-field="firstDue.date" type="date" aria-label="First payment date" min="' + esc(today()) + '" value="' + esc(st.date) + '"' + (st.when === 'pick' ? '' : ' hidden') + '>' +
        '<p class="nc-err" id="' + idOf('e-firstDue') + '" role="alert" hidden></p></div>';
      h += '<div class="fx-tell nc-tell"><button type="button" class="tick" role="checkbox" aria-checked="' + st.tell + '" data-nc-tell><i>' + CHECK + '</i><span>' + esc('Tell ' + (f || 'them')) + '</span></button>' +
        '<textarea class="input fx-msg" data-field="tell" aria-label="' + esc('Words to ' + (f || 'them')) + '"' + (st.tell ? '' : ' hidden') + '>' + esc(st.text != null ? st.text : draft()) + '</textarea><p class="nc-err" id="' + idOf('e-tell') + '" role="alert" hidden></p></div>';
      h += '<a class="link nc-set" href="' + esc((DESK.href && DESK.href('settings', 's=packages')) || 'settings.html#s=packages') + '">Packages and reminders in Settings</a>';
      h += '</div><div class="fx-sf"><p class="fx-err" data-nc-err="sheet" role="alert" hidden></p><button type="button" class="btn quiet" data-close>Cancel</button><button type="button" class="btn" data-primary data-nc-main>' + esc(mainWords()) + '</button></div>';
      box.innerHTML = h;
    }
    function live() {
      var m = $('[data-nc-main]', box); if (m) m.textContent = mainWords();
      var t = $('[data-field=tell]', box); if (t && st.text == null) t.value = draft();
    }
    function press() {
      footErr(d, '');
      var bad = [], put = function (k, t) { setErr(d, k, t); if (t) bad.push(k); };
      if (!st.id) { footErr(d, 'Pick a lifter.'); return; }
      put('name', st.pkg.trim() ? '' : 'Give the package a name.');
      put('amount', RULES.amount(st.amount));
      var due = dueOf(); put('firstDue', due && due >= today() ? '' : 'The first payment is today or a day to come.');
      var words = st.tell ? (st.text != null ? st.text : draft()).trim() : '';
      put('tell', st.tell && !words ? 'Write the words, or untick Tell ' + who() + '.' : '');
      if (bad.length) { var f = $('[data-field="' + bad[0] + '"]', box); if (f && f.focus) f.focus(); return; }
      var r = quiet(function () { return PL.billing.charge(st.id, { name: st.pkg.trim(), amount: num(st.amount), cadence: st.cadence, firstDue: due, tell: st.tell ? { text: words } : false }); });
      if (!r || r.error) { var e = r && r.error, det = e && (e.details || []); if (det && det.length) det.forEach(function (x) { setErr(d, x.field === 'firstDue' ? 'firstDue' : x.field, x.message); }); else footErr(d, (e && e.message) || 'That did not go through.'); return; }
      d.close();
      toast(r.meta && r.meta.label ? r.meta.label : 'Charged.', r.meta && r.meta.undo ? function () { return PL.undo(r.meta.undo); } : null);
      emit({ kind: 'charge', id: st.id });
    }
    box.addEventListener('input', function (e) {
      var t = e.target, k = t.getAttribute('data-field'); if (!k) return;
      if (k === 'name') st.pkg = t.value; else if (k === 'amount') st.amount = t.value; else if (k === 'tell') st.text = t.value; else if (k === 'firstDue.date') st.date = t.value;
      if (k !== 'tell') live();
      var err = d.querySelector('#' + pfx(d) + 'e-' + k); if (err && !err.hidden && (k === 'amount' ? !RULES.amount(t.value) : t.value.trim())) setErr(d, k, '');
    });
    box.addEventListener('change', function (e) {
      var t = e.target, k = t.getAttribute('data-field');
      if (k === 'lifter') { st.id = t.value; st.text = null; render(); var s = $('[data-field=lifter]', box); if (s) s.focus(); return; }
      if (k === 'firstDue.date') { st.date = t.value; live(); setErr(d, 'firstDue', t.value && t.value < today() ? 'The first payment is today or a day to come.' : ''); }
    });
    box.addEventListener('focusout', function (e) { var t = e.target; if (t.matches('[data-field=amount]')) setErr(d, 'amount', RULES.amount(t.value)); });
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.hasAttribute('data-nc-main')) { press(); return; }
      if (b.hasAttribute('data-nc-tell')) { st.tell = !st.tell; b.setAttribute('aria-checked', String(st.tell)); var t = $('[data-field=tell]', box); if (t) t.hidden = !st.tell; if (!st.tell) setErr(d, 'tell', ''); return; }
      var g = b.closest('[data-field=cadence]'); if (g) { st.cadence = b.getAttribute('data-v'); pressed(g, b); live(); return; }
      g = b.closest('[data-field=firstDue]');
      if (g) { st.when = b.getAttribute('data-v'); pressed(g, b); var di = $('[data-field="firstDue.date"]', box); if (di) { di.hidden = st.when !== 'pick'; if (st.when === 'pick') di.focus(); } setErr(d, 'firstDue', ''); live(); }
    });
    keys(d, press);
    render();
    var nm = $('[data-field=name]', box); if (nm) nm.focus({ preventScroll: true });
    return d;
  };

  /* ================= Getting started (FTC §4.1) ================= */
  var setupDoneSeen = false;
  DESK.setup = {
    /* a step's act, the same one the row and the crimson run */
    run: function (act, trigger) {
      if (!act) return false;
      if (act.run === 'add') { DESK.addLifter({ from: 'setup' }); return true; }
      if (act.run === 'weekone') { DESK.weekOne(trigger || document.activeElement); return true; }
      if (act.run === 'copy') {
        var s = data(PL.setup.get()), l = s && s.lifterId ? data(PL.lifters.get(s.lifterId)) : null, link = l && l.made ? l.made.link : null;
        if (!link) return false;
        var f = first(l.name), obj = l.sex === 'M' ? 'him' : l.sex === 'F' ? 'her' : 'them';
        /* from the intake step (the first-time walk: "Read Jess's intake" before she joined seemed to do nothing): say why
           there is nothing to read yet, then what was done */
        var fromIntake = !!(trigger && trigger.getAttribute && trigger.getAttribute('data-nc-step') === 'intake'), pre = fromIntake ? f + ' hasn’t answered yet. ' : '';
        copy('https://' + link).then(function () {
          /* pressed on a button (the crimson): it says Copied where it was pressed; from a step row, the toast says it */
          if (!fromIntake && trigger && trigger.classList && trigger.classList.contains('btn') && fn(DESK, 'swap')) DESK.swap(trigger, 'Copied', { say: f + '’s link copied.' });
          else DESK.toast(pre + (fromIntake ? 'Link copied to send ' + obj + ' again.' : f + '’s link copied.'));
        }, function () { DESK.toast(pre + f + '’s link is ' + link + '.'); });
        return true;
      }
      if (act.go && act.go.place) { var here = DESK.here || document.body.getAttribute('data-place') || ''; return DESK.go(act.go.place, act.go.hash || '', here ? { from: here } : null); }
      return false;
    }
  };
  function stepRow(s, next) {
    var isNext = s.key === next;
    var attrs = ' data-row="setup-' + esc(s.key) + '"' + (isNext ? ' tabindex="0" role="button" data-nc-step="' + esc(s.key) + '"' : '');
    if (s.done) {
      return '<div class="lrow c2 nc-step is-done"' + attrs + '><span class="who"><span class="nm" data-fact="name">' + esc(s.title) + '</span>' +
        '<span class="done-tick" data-fact="reason">' + CHECK + '<span>' + esc(s.doneText || 'Done') + '</span></span></span></div>';
    }
    if (isNext) {
      return '<div class="lrow c2 nc-step is-next is-sel"' + attrs + '><span class="who"><span class="nm" data-fact="name">' + esc(s.title) + '</span>' +
        '<span class="why nc-line1" data-fact="reason"><span class="t">' + esc(s.line) + '</span></span></span></div>';
    }
    return '<div class="lrow c2 nc-step is-later"' + attrs + '><span class="who"><span class="nm" data-fact="name">' + esc(s.title) + '</span></span></div>';
  }
  /* a step done since the coach last saw this card ticks itself in, once (DESK.done): the first lifter in and the first
     week sent are the two moments of a new desk and get the full 700 ms (big); reading the intake and week one, the short
     one. "You're set up" lands the same way. What was seen is kept for the session (powa-r6-setup-seen), so a reload or
     another page never replays it; the first card drawn in a session takes what is done as seen. */
  var SEEN_KEY = 'powa-r6-setup-seen', BIG = { add: 1, send: 1 };
  function justDone(el, s) {
    if (!s || !fn(DESK, 'done')) return;
    var seen = null; try { seen = JSON.parse(sessionStorage.getItem(SEEN_KEY) || 'null'); } catch (e) { seen = null; }
    var now = (s.steps || []).filter(function (x) { return x.done; }).map(function (x) { return x.key; }), all = s.done >= s.of;
    if (all) now.push('all');
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify(now)); } catch (e) { /* storage blocked: no moment, no harm */ }
    if (!seen) return;
    if (all && seen.indexOf('all') < 0) { var line = $('.nc-set-done', el); if (line) DESK.done(line, { big: true }); return; }
    now.forEach(function (k) { if (seen.indexOf(k) >= 0) return; var row = $('[data-row="setup-' + k + '"]', el); if (row) DESK.done(row, { big: !!BIG[k] }); });
  }
  DESK.setupCard = function (el, o) {
    o = o || {};
    if (!el) return false;
    var s = fn(PL.setup, 'get') ? data(PL.setup.get()) : null;
    var allDone = !!(s && s.done >= s.of);
    if (!s || (!s.show && !(allDone && setupDoneSeen))) { el.hidden = true; el.removeAttribute('data-setup'); el.innerHTML = ''; return false; }
    el.hidden = false; el.setAttribute('data-setup', ''); el.classList.add('nc-setup');
    if (!el.closest('.card') && !el.classList.contains('card') && !o.flat) el.classList.add('card');
    if (allDone) {
      /* the last look: the card is one line this visit, and gone on the next */
      /* the store answers show false on the next Overview visit by itself (FTC §4.1): no write here */
      setupDoneSeen = true;
      el.innerHTML = '<div class="nc-set-done"><p class="nc-set-l">You’re set up. Each day, start here.</p><button type="button" class="btn quiet sm" data-nc-hide>Hide</button></div>';
    } else {
      el.innerHTML = '<div class="nc-set-h"><h2 class="nc-set-t">Getting started</h2><span class="nc-set-n num">' + esc(s.done + ' of ' + s.of + ' done') + '</span>' +
        '<button type="button" class="btn quiet sm icon" data-more data-nc-more aria-haspopup="menu" aria-label="More for Getting started" title="More">' + DESK.ic('more') + '</button></div>' +
        '<div class="list nc-steps" data-list aria-label="Getting started">' + s.steps.map(function (x) { return stepRow(x, s.next); }).join('') + '</div>';
    }
    justDone(el, s);
    if (!el._nc) {
      el._nc = true;
      var act = function (row) { var cur = data(PL.setup.get()), st = cur && cur.steps.filter(function (x) { return x.key === row.getAttribute('data-nc-step'); })[0]; if (st && !st.done) DESK.setup.run(st.act, row); };
      el.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (b && b.hasAttribute('data-nc-hide')) { el.hidden = true; el.removeAttribute('data-setup'); return; }
        if (b && b.hasAttribute('data-nc-more')) {
          if (DESK.pop.justClosed(b)) return;
          DESK.menu.open(b, [{ id: 'hide', label: 'Hide getting started' }], { run: function (id) {
            if (id !== 'hide') return;
            var r = quiet(function () { return PL.setup.hide(); });
            if (r && !r.error) DESK.toast(r.meta && r.meta.label ? r.meta.label : 'Getting started hidden. Type help in Find to bring it back.', undoOf(r) ? function () { return PL.undo(r.meta.undo); } : null);
            DESK.setupCard(el, o);
          } });
          return;
        }
        var row = e.target.closest('[data-nc-step]'); if (row) act(row);
      });
      el.addEventListener('keydown', function (e) { var row = e.target.closest && e.target.closest('[data-nc-step]'); if (row && (e.key === 'Enter' || e.key === ' ') && e.target === row) { e.preventDefault(); act(row); } });
    }
    return true;
  };

  /* ================= What to watch in week one (FTC §4.3) ================= */
  DESK.weekOne = function (trigger) {
    if (!trigger || !DESK.pop) return null;
    var lines = [
      /* the comma sits inside the mark: a mark that ends right before punctuation reads as "felt , and" to anything that
         joins the line's text nodes with spaces (screen readers in browse mode, the flows' textOf) */
      'Each day, read new sessions: <span data-term="felt">what you wrote against how it felt,</span> and the notes.',
      'A <span data-term="topset">top set</span> a full point harder than written: go lighter next time.',
      'Pain in a note: ask where and how bad, then swap the lift.',
      'A missed session: move it to another day, never stack two.',
      'Each weekend, write next week from what they lifted.'
    ];
    var h = '<div class="nc-w1" data-crop="weekone"><h3 class="fx-t">What to watch in week one</h3><ol class="nc-w1-l">' + lines.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>' +
      '<div class="fx-acts"><button type="button" class="btn" data-nc-got>Got it</button></div></div>';
    var el = DESK.pop.open(trigger, h, { label: 'What to watch in week one', layer: 'popover', anchor: trigger, focus: '[data-nc-got]' });
    var box = $('.nc-w1', el);
    if (box) box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-nc-got]'); if (!b) return;
      var r = fn(PL.setup, 'watched') ? quiet(function () { return PL.setup.watched(); }) : null;
      DESK.pop.close();
      if (r && !r.error) emit({ kind: 'weekone' });
    });
    return el;
  };

  /* a lifter typed in by hand who has a program but not the app: "Maya can’t see her program yet: send her the link" */
  function offWords(l) {
    var her = l.sex === 'M' ? 'his' : l.sex === 'F' ? 'her' : 'their', obj = l.sex === 'M' ? 'him' : l.sex === 'F' ? 'her' : 'them';
    return (l.first || l.name) + ' can’t see ' + her + ' program yet: send ' + obj + ' the link';
  }
  DESK.offAppWords = offWords;
  /* copies a not-yet-joined lifter's link; the toast says it, or gives the link when the clipboard says no */
  DESK.copyLink = function (l, btn) {
    var off = l && l.notOnApp, url = off && off.url, link = off && off.link, who = (l && (l.first || l.name)) || 'Their';
    if (!url) return;
    /* copied: the button says so in place (DESK.swap); a refusal gives the link in a toast */
    var said = function (ok) { if (ok && btn && btn.isConnected && fn(DESK, 'swap')) DESK.swap(btn, 'Copied', { say: who + '’s link copied.' }); else DESK.toast(ok ? who + '’s link copied.' : who + '’s link is ' + link + '.'); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(function () { said(true); }, function () { said(false); }); return; } } catch (e) { /* refused */ }
    said(false);
  };

  /* ================= Your lifters, the small desk (FTC §5.2) ================= */
  DESK.smallDesk = function (el, o) {
    o = o || {};
    if (!el) return false;
    var rows = (data(PL.lifters.list({})) || []).filter(function (x) { return x && x.id; });
    var fresh = !!(window.DEMO && window.DEMO.fresh);
    el.setAttribute('data-crop', 'small'); el.classList.add('nc-small');
    if (!el.closest('.card') && !el.classList.contains('card') && !o.flat) el.classList.add('card');
    var demoFor = null;
    var body = rows.map(function (x) {
      var l = data(PL.lifters.get(x.id)) || x, st = l.stage, href = (DESK.href && DESK.href('lifters', 'id=' + l.id)) || 'lifters.html#id=' + l.id;
      var line = st === 'training' || !st ? (l.weekText || l.stageText || '') : (l.stageText || '');
      /* added by hand and sent a program, not on the app yet: nobody sees it until the link goes (the first-time walk, Maya:
         "Week 1 of 8 starts Mon 16 Nov" read as all fine) */
      var off = l.notOnApp && l.notOnApp.url && (st === 'sent' || st === 'training') ? l.notOnApp : null;
      /* while Needs you holds it (offapp-<id>, with its Copy link) this row only says so; once copied, the row keeps the move */
      var offIt = off && PL.items && fn(PL.items, 'get') ? data(PL.items.get('offapp-' + l.id)) : null, offOpen = !!(offIt && !offIt.done);
      if (off) line = offOpen ? (line ? line + ', not on the app yet' : 'Not on the app yet') : offWords(l);
      if (offOpen) off = null;
      var missed = /\bMissed\b/.test(line);
      var top = l.lastTop, right = top && top.text ? '<span class="ctx nc-top num" data-fact="number"' + (top.title ? ' title="' + esc(top.title) + '"' : '') + '>' + esc(top.text) + '</span>' : '';
      if (off) right = '<span class="ctx"><button type="button" class="btn quiet sm" data-nc-copy="' + esc(l.id) + '" aria-label="' + esc(off.label || 'Copy link') + '">Copy link</button></span>';
      if (fresh && st === 'sent' && !top && !demoFor) demoFor = l;
      return '<div class="lrow ' + (right ? 'c3' : 'c2') + ' nc-lr2" data-row="' + esc(l.id) + '"><span class="who"><a class="nm" data-fact="name" href="' + esc(href) + '" data-ellipsis title="' + esc(l.name) + '">' + esc(l.name) + '</a>' +
        (line ? '<span class="why' + (missed ? ' is-warn' : '') + '" data-fact="reason"><span class="t" data-ellipsis title="' + esc(line) + '">' + esc(line) + '</span></span>' : '') + '</span>' + right + '</div>';
    }).join('');
    var foot = '';
    if (demoFor && fn(PL.demo, 'firstSession')) {
      var sd = (demoFor.stageText || '').match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+$/);
      foot = '<div class="card-f nc-small-f"><button type="button" class="link" data-demo data-nc-session="' + esc(demoFor.id) + '">' + esc('Skip to ' + (sd ? sd[0] : 'her first session') + ', after ' + (demoFor.sex === 'M' ? 'his' : demoFor.sex === 'F' ? 'her' : 'their') + ' session (demo)') + '</button></div>';
    }
    el.innerHTML = '<div class="nc-small-h"><h2 class="nc-set-t">Your lifters</h2></div><div class="list" data-list aria-label="Your lifters">' + (body || '') + '</div>' + foot;
    if (!el._ncs) {
      el._ncs = true;
      el.addEventListener('click', function (e) {
        var cp = e.target.closest('[data-nc-copy]');
        if (cp) { var lc = data(PL.lifters.get(cp.getAttribute('data-nc-copy'))) || {}; DESK.copyLink(lc, cp); return; }
        var b = e.target.closest('[data-nc-session]'); if (!b) return;
        var r = quiet(function () { return PL.demo.firstSession(b.getAttribute('data-nc-session')); });
        if (r && r.error) DESK.toast(r.error.message); else if (r && r.meta && r.meta.label) DESK.toast(r.meta.label);
        emit({ kind: 'session', id: b.getAttribute('data-nc-session') });
      });
    }
    return true;
  };

  /* ================= the phase strip (FTC §7.1, §7.2) ================= */
  /* phases: [{ name, from, to }] (1-based weeks) or a flat list of names, one per week; o.weeks the count when the runs
     do not say. One row of week cells, each run named under it in ink-3; a run too narrow for its name keeps it whole in
     its title */
  var SHORT = { 'Meet week': 'Meet', 'New maxes': 'Maxes' };
  DESK.phaseStrip = function (phases, o) {
    o = o || {};
    var runs = [];
    if (Array.isArray(phases) && phases.length && typeof phases[0] === 'string') {
      phases.forEach(function (nm, i) { var r = runs[runs.length - 1]; if (r && r.name === nm) r.to = i + 1; else runs.push({ name: nm, from: i + 1, to: i + 1 }); });
    } else (phases || []).forEach(function (p) { if (p && p.name) runs.push({ name: p.name, from: +p.from || 1, to: +p.to || +p.from || 1 }); });
    if (!runs.length) return '';
    var n = Math.min(26, o.weeks || runs[runs.length - 1].to);
    var lab = runs.map(function (r) { return r.name + (r.from === r.to ? ', week ' + r.from : ', weeks ' + r.from + ' to ' + r.to); }).join('; ');
    var h = '<div class="nc-ph" data-mark data-phases role="img" aria-label="' + esc(lab) + '">';
    runs.forEach(function (r) {
      var k = Math.max(1, Math.min(n, r.to) - r.from + 1), cells = '';
      for (var i = 0; i < k; i++) cells += '<i></i>';
      var kind = /deload/i.test(r.name) ? 'low' : /meet/i.test(r.name) ? 'meet' : 'work';
      var words = k === 1 && SHORT[r.name] ? SHORT[r.name] : r.name;
      h += '<div class="nc-ph-run" data-span="' + k + '" data-kind="' + kind + '"><span class="nc-ph-c">' + cells + '</span><span class="nc-ph-n" data-ellipsis title="' + esc(r.name + (r.from === r.to ? ', week ' + r.from : ', weeks ' + r.from + ' to ' + r.to)) + '">' + esc(words) + '</span></div>';
    });
    return h + '</div>';
  };
})();
