// intake.js: the lifter's intake (2026-10-27). When a lifter joins a coach, a short questionnaire
// tells the coach what they need to write the first block: best lifts, bodyweight and class,
// training history, the week (days, session length, equipment), injuries, goals, the next meet and
// how to reach them. Five steps, about two minutes, everything optional. The answers land on the
// coach's lifter page (clients-ui.js About, Clients.intakeLines) and give a brand-new lifter's
// program its maxes (app.js programMaxKg). Data: db.js saveMyIntake / Store.intakes; the shape is
// the contract in clients.js (answers v 1). It wears the coach's team (Store.coachBrand) when the
// coach has branding.
//   IntakeUI.row()           the Train row while it's still to do
//   IntakeUI.open()          the sheet (prefilled when it was sent before)
//   IntakeUI.youRow()        You › Your intake
//   IntakeUI.maybeAutoOpen() once, for a brand-new coached lifter (never in the demo)
(function () {
  'use strict';

  var STEPS = ['Your best lifts', 'You', 'Your week', 'Injuries and goals', 'How to reach you'];
  var LIFTS = [['squat', 'Squat'], ['bench', 'Bench'], ['deadlift', 'Deadlift']];
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var EQUIP = ['Belt', 'Knee sleeves', 'Wrist wraps', 'Elbow sleeves', 'SSB', 'Cambered bar', 'Deadlift bar', 'Bands', 'Chains'];
  var PARTS = ['Lower back', 'Knee', 'Hip', 'Shoulder', 'Elbow', 'Wrist'];
  var FEDS = ['IPF', 'USAPL', 'USPA', 'WRPF', 'Other'];

  function me() { try { if (typeof user !== 'undefined' && user) return user; } catch (e) {} return window._user || null; }
  function lb() { return typeof getUnit === 'function' && getUnit() === 'lbs'; }
  function KGLB() { return typeof KG_PER_LB === 'number' ? KG_PER_LB : 0.45359237; }
  function toKg(v) { var n = parseFloat(String(v || '').replace(',', '.')); return isFinite(n) && n > 0 ? Math.round((lb() ? n * KGLB() : n) * 100) / 100 : null; }
  function fromKg(kg) { var n = Number(kg); if (!(n > 0)) return ''; var v = lb() ? n / KGLB() : n; return String(Math.round(v * 2) / 2).replace(/\.0$/, ''); }
  function unitTag() { return lb() ? 'lb' : 'kg'; }
  function coach() { var u = me(); return u && u.coachId ? ((Store.get().coaches || []).find(function (c) { return c.id === u.coachId; }) || null) : null; }
  // The demo's coach is called "Demo Coach": "Help Demo write…" reads wrong, so the demo says "your coach".
  function coachFirst() { var c = coach(), f = c && c.name ? String(c.name).split(' ')[0] : ''; return f && !(window._demoMode && /^demo$/i.test(f)) ? f : 'your coach'; }
  function brand() { var b = Store.get().coachBrand; return b && (b.name || b.logoUrl || b.color) ? b : null; }
  function mine() { var u = me(); return u ? ((Store.get().intakes || []).find(function (i) { return i.athleteId === u.id; }) || null) : null; }
  function sent() { var i = mine(); return !!(i && i.submittedAt); }
  function key(k) { var u = me(); return 'powa-intake-' + k + '-' + (u ? u.id : 'x'); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(key(k)); if (v === null) localStorage.removeItem(key(k)); else localStorage.setItem(key(k), v); } catch (e) {} return null; }
  function ago(iso) {
    var d = Math.round((Date.now() - Date.parse(iso)) / 86400000);
    return !isFinite(d) ? '' : d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? d + ' days ago' : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  // ---------- the answers (contract v 1, clients.js) ----------
  function blank() {
    var u = me() || {};
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    return { v: 1, best: {}, bodyweightKg: null, weightClass: '', federation: '', yearsLifting: '', daysPerWeek: null, days: [], sessionMinutes: null,
      equipment: [], injuries: { parts: [], note: '' }, goals: '', meet: null, phone: '', timezone: tz, instagram: String(u.instagram || '').replace(/^@+/, ''), notes: '' };
  }
  function draft() {
    var base = blank(), i = mine();
    if (i && i.answers) base = Object.assign(base, JSON.parse(JSON.stringify(i.answers)));
    else { try { var d = JSON.parse(ls('draft') || 'null'); if (d && d.v === 1) base = Object.assign(base, d); } catch (e) {} }
    base.injuries = Object.assign({ parts: [], note: '' }, base.injuries || {});
    return base;
  }
  // Light clean-up before it goes: empty strings out, numbers as numbers, lists de-duplicated.
  function tidy(a) {
    var out = JSON.parse(JSON.stringify(a));
    ['squat', 'bench', 'deadlift'].forEach(function (l) {
      var b = out.best && out.best[l];
      if (!b || !(Number(b.kg) > 0)) { if (out.best) delete out.best[l]; return; }
      b.kg = Number(b.kg); b.reps = Math.max(1, Math.min(20, Math.round(Number(b.reps)) || 1));
    });
    out.days = (out.days || []).filter(function (d, i, arr) { return DAYS.indexOf(d) >= 0 && arr.indexOf(d) === i; });
    out.equipment = (out.equipment || []).filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
    out.injuries.parts = (out.injuries.parts || []).filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
    ['goals', 'notes', 'phone', 'instagram', 'weightClass', 'federation'].forEach(function (k) { out[k] = String(out[k] || '').trim().slice(0, k === 'goals' || k === 'notes' ? 600 : 80); });
    out.injuries.note = String(out.injuries.note || '').trim().slice(0, 400);
    if (out.meet && !(String(out.meet.name || '').trim() || out.meet.date)) out.meet = null;
    return out;
  }

  // ---------- small pieces ----------
  function chips(list, isOn, onTap, opts) {
    opts = opts || {};
    var row = el('div', { class: 'ik-chips' + (opts.cls ? ' ' + opts.cls : ''), role: opts.multi ? 'group' : 'radiogroup' });
    list.forEach(function (it) {
      var v = Array.isArray(it) ? it[0] : it, label = Array.isArray(it) ? it[1] : it;
      var b = el('button', { type: 'button', role: opts.multi ? 'checkbox' : 'radio', 'data-v': String(v) }, String(label));
      var paint = function () { var on = isOn(v); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); };
      b.addEventListener('click', function () { onTap(v); [].forEach.call(row.children, function (c) { c._paint && c._paint(); }); });
      b._paint = paint; paint();
      row.appendChild(b);
    });
    return row;
  }
  function label(text, sub) { var w = el('div', { class: 'ik-l' }, el('span', {}, text)); if (sub) w.appendChild(el('span', { class: 'ik-ls' }, sub)); return w; }
  function input(attrs, val, on) { var i = el('input', Object.assign({ class: 'ik-in' }, attrs)); i.value = val == null ? '' : String(val); i.addEventListener('input', function () { on(i.value); }); return i; }
  function area(attrs, val, on) { var t = el('textarea', Object.assign({ class: 'ik-in ik-ta', rows: '3' }, attrs)); t.value = val || ''; t.addEventListener('input', function () { on(t.value); }); return t; }

  // ---------- the sheet ----------
  function open(opts) {
    opts = opts || {};
    var u = me();
    if (!u) return;
    var a = draft(), step = opts.step || 0, again = sent();
    var first = coachFirst(), br = brand();
    uiSheet('', function (sheet, close) {
      sheet.classList.add('ik-sheet');
      if (br && br.color) sheet.style.setProperty('--ik-acc', br.color);
      var head = el('div', { class: 'ik-head' });
      var body = el('div', { class: 'ik-body' });
      var foot = el('div', { class: 'ik-foot' });
      sheet.appendChild(head); sheet.appendChild(body); sheet.appendChild(foot);
      var save = function () { try { ls('draft', JSON.stringify(a)); } catch (e) {} };

      var paintHead = function () {
        head.innerHTML = '';
        var top = el('div', { class: 'ik-who' });
        if (br && typeof brandMark === 'function') { top.appendChild(brandMark(br, 'ik-mark')); top.appendChild(el('span', { class: 'ik-team' }, br.name || 'Your coach')); }
        else top.appendChild(el('span', { class: 'ik-team' }, first === 'your coach' ? 'For your coach' : 'For ' + first));
        head.appendChild(top);
        head.appendChild(el('h3', { class: 'ik-h' }, again ? 'Your intake' : 'Help ' + first + ' write your first block'));
        head.appendChild(el('p', { class: 'ik-sub' }, (again ? 'Change anything and send it again. ' : 'About 2 minutes. Skip anything you like. ') + 'Step ' + (step + 1) + ' of ' + STEPS.length));
        var bar = el('div', { class: 'ik-bar', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(STEPS.length), 'aria-valuenow': String(step + 1) });
        STEPS.forEach(function (s, i) { bar.appendChild(el('i', { class: i <= step ? 'on' : '' })); });
        head.appendChild(bar);
      };

      var steps = [
        // 1. best lifts
        function () {
          body.appendChild(el('h4', { class: 'ik-st' }, STEPS[0]));
          body.appendChild(el('p', { class: 'ik-hint' }, 'Your heaviest recent sets. Rough is fine: ' + first + ' fine-tunes from your first sessions.'));
          LIFTS.forEach(function (L) {
            var b = a.best[L[0]] || (a.best[L[0]] = { kg: null, reps: 1, when: '' });
            var row = el('div', { class: 'ik-lift' });
            row.appendChild(el('span', { class: 'ik-ln' }, el('i', { class: 'ik-dot l-' + L[0], 'aria-hidden': 'true' }), L[1]));
            var w = input({ type: 'text', inputmode: 'decimal', placeholder: lb() ? '315' : '140', 'aria-label': L[1] + ' weight in ' + unitTag() }, fromKg(b.kg), function (v) { b.kg = toKg(v); save(); });
            var r = input({ type: 'text', inputmode: 'numeric', placeholder: '1', 'aria-label': L[1] + ' reps', maxlength: '2' }, b.reps && b.kg ? b.reps : '', function (v) { b.reps = Math.max(1, parseInt(v, 10) || 1); save(); });
            row.appendChild(el('span', { class: 'ik-pair' }, w, el('span', { class: 'ik-u' }, unitTag()), el('span', { class: 'ik-x' }, '×'), r, el('span', { class: 'ik-u' }, 'reps')));
            body.appendChild(row);
          });
        },
        // 2. body, class, federation, years
        function () {
          body.appendChild(el('h4', { class: 'ik-st' }, STEPS[1]));
          body.appendChild(label('Bodyweight'));
          body.appendChild(el('div', { class: 'ik-one' }, input({ type: 'text', inputmode: 'decimal', placeholder: lb() ? '182' : '82.5', 'aria-label': 'Bodyweight in ' + unitTag() }, fromKg(a.bodyweightKg), function (v) { a.bodyweightKg = toKg(v); save(); }), el('span', { class: 'ik-u' }, unitTag())));
          var sex = (u.sex === 'female' || u.sex === 'male') ? u.sex : null;
          var classes = typeof IPF_CLASSES !== 'undefined' ? (sex ? IPF_CLASSES[sex] : IPF_CLASSES.male) : [59, 66, 74, 83, 93, 105, 120];
          var cl = classes.map(function (c) { return [c + '', c + ' kg']; }).concat([[classes[classes.length - 1] + '+', classes[classes.length - 1] + '+ kg'], ['unsure', 'Not sure']]);
          body.appendChild(label('Weight class', sex ? null : 'IPF classes'));
          body.appendChild(chips(cl, function (v) { return a.weightClass === v; }, function (v) { a.weightClass = a.weightClass === v ? '' : v; save(); }));
          body.appendChild(label('Federation'));
          body.appendChild(chips(FEDS, function (v) { return a.federation === v; }, function (v) { a.federation = a.federation === v ? '' : v; save(); }));
          body.appendChild(label('Lifting for'));
          body.appendChild(chips([['<1', 'Under a year'], ['1-2', '1–2 years'], ['3-5', '3–5 years'], ['5+', '5+ years']], function (v) { return a.yearsLifting === v; }, function (v) { a.yearsLifting = a.yearsLifting === v ? '' : v; save(); }));
        },
        // 3. the week
        function () {
          body.appendChild(el('h4', { class: 'ik-st' }, STEPS[2]));
          body.appendChild(label('Days you can train'));
          body.appendChild(chips(DAYS, function (v) { return a.days.indexOf(v) >= 0; }, function (v) {
            var i = a.days.indexOf(v); if (i >= 0) a.days.splice(i, 1); else a.days.push(v);
            a.daysPerWeek = a.days.length || null; save();
          }, { multi: true, cls: 'is-days' }));
          body.appendChild(label('A session can take'));
          body.appendChild(chips([[45, '45 min'], [60, '60 min'], [75, '75 min'], [90, '90 min'], [120, '2 hours']], function (v) { return a.sessionMinutes === v; }, function (v) { a.sessionMinutes = a.sessionMinutes === v ? null : v; save(); }));
          body.appendChild(label('Kit you have'));
          body.appendChild(chips(EQUIP, function (v) { return a.equipment.indexOf(v) >= 0; }, function (v) { var i = a.equipment.indexOf(v); if (i >= 0) a.equipment.splice(i, 1); else a.equipment.push(v); save(); }, { multi: true }));
        },
        // 4. injuries, goals, the next meet
        function () {
          body.appendChild(el('h4', { class: 'ik-st' }, STEPS[3]));
          body.appendChild(label('Anything to work around?'));
          body.appendChild(chips(PARTS, function (v) { return a.injuries.parts.indexOf(v) >= 0; }, function (v) { var p = a.injuries.parts, i = p.indexOf(v); if (i >= 0) p.splice(i, 1); else p.push(v); save(); }, { multi: true }));
          body.appendChild(area({ placeholder: 'What happened, what still bothers it', 'aria-label': 'About the injury', maxlength: '400' }, a.injuries.note, function (v) { a.injuries.note = v; save(); }));
          body.appendChild(label('What do you want from the next few months?'));
          body.appendChild(area({ placeholder: 'A 200 kg squat, my first meet, total 500…', 'aria-label': 'Goals', maxlength: '600' }, a.goals, function (v) { a.goals = v; save(); }));
          body.appendChild(label('A meet in mind?', 'Optional'));
          var m = a.meet || { name: '', date: '', federation: '' };
          var nm = input({ type: 'text', placeholder: 'Meet name', 'aria-label': 'Meet name', maxlength: '80' }, m.name, function (v) { m.name = v; a.meet = m; save(); });
          var dt = input({ type: 'date', 'aria-label': 'Meet date' }, m.date, function (v) { m.date = v; a.meet = m; save(); });
          body.appendChild(el('div', { class: 'ik-two' }, nm, dt));
        },
        // 5. contact
        function () {
          body.appendChild(el('h4', { class: 'ik-st' }, STEPS[4]));
          body.appendChild(el('p', { class: 'ik-hint' }, 'Only ' + first + ' sees these.'));
          body.appendChild(label('Phone', 'Optional'));
          body.appendChild(input({ type: 'tel', placeholder: '+1 555 0100', 'aria-label': 'Phone', maxlength: '40', autocomplete: 'tel' }, a.phone, function (v) { a.phone = v; save(); }));
          body.appendChild(label('Instagram', 'Optional'));
          body.appendChild(el('div', { class: 'ik-one' }, el('span', { class: 'ik-u is-pre' }, '@'), input({ type: 'text', placeholder: 'yourhandle', 'aria-label': 'Instagram', maxlength: '40', autocapitalize: 'off', spellcheck: 'false' }, a.instagram, function (v) { a.instagram = v.replace(/^@+/, ''); save(); })));
          if (a.timezone) body.appendChild(el('p', { class: 'ik-hint ik-tz' }, 'Time zone: ' + a.timezone.replace(/_/g, ' ')));
          body.appendChild(label('Anything else ' + first + ' should know?'));
          body.appendChild(area({ placeholder: 'Shift work, a new baby, a meet you want to peak for…', 'aria-label': 'Anything else', maxlength: '600' }, a.notes, function (v) { a.notes = v; save(); }));
        }
      ];

      var paintFoot = function () {
        foot.innerHTML = '';
        var last = step === STEPS.length - 1;
        var back = el('button', { class: 'btn ui-btn-soft ik-back', type: 'button' }, step ? 'Back' : 'Not now');
        back.addEventListener('click', function () {
          if (!step) { if (!again) ls('snooze', String(Date.now())); close(); return; }
          go(step - 1);
        });
        var next = el('button', { class: 'btn btn-primary ik-next', type: 'button' }, last ? (again ? 'Send the update' : 'Send to ' + first) : 'Next');
        next.addEventListener('click', function () { if (last) send(next); else go(step + 1); });
        foot.appendChild(back); foot.appendChild(next);
      };
      var go = function (n) {
        step = Math.max(0, Math.min(STEPS.length - 1, n));
        body.innerHTML = '';
        steps[step]();
        paintHead(); paintFoot();
        body.scrollTop = 0;
        var f = body.querySelector('input, textarea');
        if (f && step === 0 && !again && !(typeof isNative === 'function' && isNative())) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 380);
      };
      var send = function (btn) {
        if (btn.getAttribute('aria-busy') === 'true') return;
        var answers = tidy(a), now = new Date().toISOString();
        var row = { athleteId: u.id, coachId: u.coachId || null, answers: answers, submittedAt: now, updatedAt: now };
        Store.update(function (s) { s.intakes = (s.intakes || []).filter(function (i) { return i.athleteId !== u.id; }).concat([row]); });
        ls('draft', null); ls('snooze', null);
        var done = function () {
          close();
          toast(again ? 'Sent to ' + first : 'Sent to ' + first + '. Your first block starts from here');
          try { if (typeof renderToday === 'function') renderToday(); } catch (e) {}
        };
        if (window._demoMode || !window.DB || !DB.saveMyIntake) { done(); return; }
        btn.setAttribute('aria-busy', 'true');
        DB.saveMyIntake({ athleteId: u.id, answers: answers, submittedAt: now }).then(function (res) {
          btn.removeAttribute('aria-busy');
          if (!res || !res.ok) { toast(res && res.tooLong ? 'That\'s too long to send. Shorten the longest answer.' : 'Couldn\'t send it. Check your connection and try again.'); return; }
          if (res.intake) Store.update(function (s) { s.intakes = (s.intakes || []).filter(function (i) { return i.athleteId !== u.id; }).concat([res.intake]); });
          if (res.local) toast('Saved on this phone. It goes to ' + first + ' as soon as it can');
          done();
        }).catch(function () { btn.removeAttribute('aria-busy'); toast('Couldn\'t send it. Check your connection and try again.'); });
      };
      go(step);
    }, { cls: 'ik-wrap' });
  }

  // ---------- the entry points ----------
  // The Train row: coached, nothing sent yet (a "Not now" keeps it, it just doesn't pop up again).
  function row() {
    var u = me();
    if (!u || !u.coachId || sent()) return null;
    var first = coachFirst(), br = brand();
    var c = el('div', { class: 'today-note tn-row tn-checkin ik-row' });
    c.innerHTML = '<span class="tn-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z"/><path d="M8 5H6.5A1.5 1.5 0 0 0 5 6.5v12A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 17.5 5H16"/><path d="M8.5 11h7M8.5 14.5h4.5"/></svg></span>' +
      '<span class="tn-body"><span class="tn-title">' + (br && br.name ? escHtml(br.name) + ' intake' : 'Your intake') + '</span><span class="tn-text tn-one">Tell ' + escHtml(first) + ' about your training · 2 min</span></span>';
    var b = el('button', { class: 'btn btn-sm tn-act', type: 'button' }, 'Start');
    b.addEventListener('click', function () { open(); });
    c.appendChild(b);
    return c;
  }
  function youRow() {
    var u = me();
    if (!u || !u.coachId) return null;
    var i = mine();
    return { label: 'Your intake', value: i && i.submittedAt ? 'Sent ' + ago(i.submittedAt) : 'To do', onClick: function () { open(); } };
  }
  // A brand-new coached lifter (nothing logged, nothing sent) sees it once after joining; the demo never pops it.
  function maybeAutoOpen() {
    var u = me();
    if (!u || !u.coachId || sent() || window._demoMode) return;
    if (ls('seen')) return;
    var logs = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === u.id; });
    if (logs.length > 3) return;
    ls('seen', String(Date.now()));
    setTimeout(function () { if (!document.querySelector('.ui-sheet-veil')) open(); }, 900);
  }

  window.IntakeUI = { open: open, row: row, youRow: youRow, maybeAutoOpen: maybeAutoOpen, _tidy: tidy, _blank: blank };
})();
