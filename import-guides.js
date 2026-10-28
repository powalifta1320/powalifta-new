/* =====================================================================
   import-guides.js — "Coming from …" guides for the import intake (2026-10-28)
   What to export from the app a coach is leaving, where to click, and what POWALIFTA does with it.
   Every step comes from the research note (vault: Research/Coaching app exports (2026-10-28).md) with
   the confidence it had there: 'official' = the app's own help centre (with the article's date),
   'secondary' = another company's write-up. Nothing that was only "unconfirmed" is a step here.
   Ask AI's support answers carry the same steps (support-kb.js, ids starting "switch-from-").
   Naming the app a coach is coming from is the point here; the marketing site never does.
   Loaded with the intake (SwitchKit.openIntake), never on page boot.
   ===================================================================== */
var ImportGuides = (function () {
  'use strict';
  var CHECKED = '28 Oct 2026';
  // step: { what, how, src: 'official' | 'secondary', where (whose help), date (the article's) }
  var LIST = [
    { id: 'sheets', name: 'Spreadsheets', title: 'Coming from a spreadsheet',
      lead: 'Programs, logs and client lists all come over. Bring the whole workbook: every tab comes with it.',
      steps: [
        { what: 'Google Sheets', how: 'File → Download → Microsoft Excel (.xlsx). Every tab comes with it; a CSV download keeps only the tab that\'s open.', src: 'secondary', where: 'A third-party guide', date: 'Sep 2026' },
        { what: 'Excel', how: 'Choose the .xlsx file itself. Saving as CSV keeps only the sheet that\'s open.', src: 'official', where: 'Microsoft support', date: '' },
        { what: 'Or copy and paste', how: 'Select the cells in Sheets or Excel, copy them, and paste them into the box here.' }
      ],
      does: [
        'A log, one row per set or one row per exercise with Set 1, Set 2 … across, becomes the lifter\'s history: e1RM, PRs and the charts.',
        'A program, exercises down and weeks across or a week / day / exercise table, opens in the program check. Nothing is saved until you say.',
        'A client list becomes invites. You pick who, as many as you have room for.',
        'Dates in either order, kg or lb, RPE, RIR, % and "3x5 @8" are read the way you write them.'
      ] },
    { id: 'trainheroic', name: 'TrainHeroic', title: 'Coming from TrainHeroic',
      lead: 'Your athlete list comes out of TrainHeroic. Training history comes out through each athlete, and programs don\'t come out at all, so they come in as PDFs or screenshots.',
      steps: [
        { what: 'Your athlete list', how: 'On the web: Athletes → ⋯ (top right) → Export Athletes → pick a team or group → Download CSV. Active athletes only.', src: 'official', where: 'TrainHeroic help centre', date: 'Jun 2026' },
        { what: 'An athlete\'s history', how: 'The athlete opens account.trainheroic.com/data-export on a computer, not the app, and chooses Export. A zip downloads straight away.', src: 'official', where: 'TrainHeroic help centre', date: 'Feb 2026', lifter: true },
        { what: 'Programs', how: 'TrainHeroic has no program export. Print the calendar to PDF, or take screenshots.', src: 'official', where: 'TrainHeroic help centre', date: 'Nov 2023' }
      ],
      does: [
        'The athlete list becomes invites: names and emails.',
        'The athlete\'s zip opens here. Its file names and columns aren\'t published, so any column POWALIFTA can\'t place, you match once and it\'s remembered.',
        'RPE, tempo and rest live in exercise notes there, so most sets arrive without an RPE: you pick what they count as.',
        'Dumbbell work is logged as the total of both dumbbells.',
        'PDFs and screenshots come in through Bring a program in, a few at once.'
      ],
      lifterSteps: 'Open account.trainheroic.com/data-export on a computer, choose Export, and send me the zip it downloads.' },
    { id: 'truecoach', name: 'TrueCoach', title: 'Coming from TrueCoach',
      lead: 'Your client list, workouts and programs all come out of TrueCoach, from your coach account.',
      steps: [
        { what: 'Your client list', how: 'Clients → Export. The CSV comes by email. Archived clients: show archived, then Export. One group: search its name, select it, then Export.', src: 'official', where: 'TrueCoach help centre', date: 'Mar 2023' },
        { what: 'A client\'s workouts', how: 'Their workout calendar → Export (top right) → a time frame and your email. A .txt file arrives by email.', src: 'official', where: 'TrueCoach help centre', date: 'Nov 2019' },
        { what: 'Programs', how: 'Open the program, click its first workout, Shift-click the last → Print Workouts → Save as PDF.', src: 'official', where: 'TrueCoach help centre', date: 'Mar 2023' }
      ],
      does: [
        'The client list becomes invites: names and emails, Client Type as groups, archived clients left unticked.',
        'Phone numbers, birthdays, height and weight stay in the file.',
        'The workouts .txt has no published layout. If it reads as a training journal it comes in; if not, email us one and we\'ll make it read.',
        'Program PDFs come in through Bring a program in, a few at once.'
      ] },
    { id: 'trainerize', name: 'Trainerize', title: 'Coming from Trainerize',
      lead: 'Trainerize lets your client list out, and programs as PDFs. Workout history stays in Trainerize.',
      steps: [
        { what: 'Your client list', how: 'Clients → select everyone, or some → Export → CSV: first name, last name, email, phone and trainer.', src: 'official', where: 'Trainerize help centre', date: 'Oct 2026' },
        { what: 'Programs', how: 'Print a program and choose Save as PDF.', src: 'official', where: 'Trainerize help centre', date: 'Oct 2026' },
        { what: 'Workout history', how: 'Not exportable: Trainerize keeps history, progress statistics, body measurements and adherence.', src: 'official', where: 'Trainerize help centre', date: 'Oct 2026' }
      ],
      does: [
        'The client list becomes invites: names and emails. Phone numbers stay in the file.',
        'Program PDFs come in through Bring a program in, a few at once.',
        'Every set your lifters log here from day one builds their history.'
      ] },
    { id: 'everfit', name: 'Everfit', title: 'Coming from Everfit',
      lead: 'Everfit prints each workout as its own PDF. That\'s how your programs come over.',
      steps: [
        { what: 'Programs', how: 'A client\'s Training calendar → a workout\'s ⋯ → Print Workout. One PDF per workout.', src: 'official', where: 'Everfit help centre', date: 'Aug 2026' },
        { what: 'Client list and history', how: 'Everfit doesn\'t document an export for either. Invite your lifters by link from POWALIFTA.', src: 'official', where: 'Everfit help centre', date: 'Oct 2026' }
      ],
      does: [
        'Choose several workout PDFs at once in Bring a program in. They\'re read one after another and lined up by day: the same day again is the next week.',
        'The reader takes 3 files a minute and 15 a day, so a long block can take two sittings.'
      ] },
    { id: 'coachrx', name: 'CoachRx', title: 'Coming from CoachRx',
      lead: 'CoachRx has the fullest client list export. Workouts come out as PDF or text.',
      steps: [
        { what: 'Your client list', how: 'Clients (owners: Business Suite → Customers) → filter if you like → Export All or Export Filtered List → pick the columns → download.', src: 'official', where: 'CoachRx help centre', date: 'Apr 2026' },
        { what: 'Workouts', how: 'The calendar → Export → PDF or text, and a date range. It comes by email.', src: 'official', where: 'CoachRx help centre', date: 'Jun 2026' }
      ],
      does: [
        'The client list becomes invites: names, emails, tags as groups, archived clients left unticked.',
        'Card, payment and revenue columns are left out the moment the file is read. POWALIFTA never shows or keeps them; you can untick them in CoachRx too.',
        'Workout PDFs come in through Bring a program in. The text export\'s layout isn\'t published yet.'
      ] },
    { id: 'hevycoach', name: 'Hevy Coach', title: 'Coming from Hevy Coach',
      lead: 'Hevy Coach has no export on the coach side, but every client has their own Hevy export.',
      steps: [
        { what: 'Each client\'s workouts', how: 'In the Hevy app: Profile → Settings → Export & Import Data → Export Data → Export Workouts. They send you the file, or import it into POWALIFTA themselves.', src: 'official', where: 'Hevy help centre', date: 'Oct 2026', lifter: true },
        { what: 'Programs and your client list', how: 'No export. Take screenshots of a routine, and invite your clients by link.', src: 'official', where: 'Hevy Coach help centre', date: 'Oct 2023' }
      ],
      does: [
        'Hevy\'s workout CSV comes in as it is: warm-ups left out, kg or lb from the file, RPE where they logged one.',
        'Screenshots of a routine come in through Bring a program in.'
      ],
      lifterSteps: 'In Hevy: Profile → Settings → Export & Import Data → Export Data → Export Workouts. Send me the file.' }
  ];
  function get(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  // The note a coach sends a lifter: how to get their history into POWALIFTA themselves.
  function lifterMessage(firstName, guideId) {
    var g = get(guideId);
    var hi = firstName ? 'Hi ' + firstName + ', ' : '';
    var lines = [hi + 'let\'s get your training history into POWALIFTA so your PRs and maxes are there from day one.'];
    if (g && g.lifterSteps) lines.push(g.lifterSteps);
    lines.push('Then in POWALIFTA: You → Your data → Import your training history, and choose the file. You see every set before it\'s saved, and the same file twice adds nothing.');
    return lines.join('\n\n');
  }

  var CSS = [
    '.ig-sheet .ig-lead{margin:0 4px 16px;color:var(--text-2);font-size:15px;line-height:1.45;text-wrap:pretty}',
    '.ig-sheet .ig-h{margin:18px 4px 8px;font-size:17px;font-weight:700;color:var(--text);letter-spacing:-0.01em}',
    '.ig-steps{display:flex;flex-direction:column;border-radius:var(--u-r,20px);background:var(--bg-1);border:1px solid var(--line);overflow:hidden}',
    '.ig-step{display:flex;gap:12px;padding:14px 16px;border-top:1px solid var(--line)}',
    '.ig-step:first-child{border-top:0}',
    '.ig-n{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--fill-3,rgba(255,255,255,.08));color:var(--text);font:700 13px/1 var(--font-num,inherit);font-variant-numeric:tabular-nums}',
    '.ig-step-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
    '.ig-step-main b{font-size:16px;font-weight:650;color:var(--text);line-height:1.3}',
    '.ig-step-main span{font-size:15px;color:var(--text-2);line-height:1.45;overflow-wrap:anywhere;text-wrap:pretty}',
    '.ig-src{font-size:13px!important;color:var(--text-3)!important}',
    '.ig-src.is-secondary{color:var(--warn,#ff9f43)!important}',
    '.ig-does{margin:0;padding:0 4px 0 22px;display:flex;flex-direction:column;gap:8px;color:var(--text-2);font-size:15px;line-height:1.45}',
    '.ig-does li{padding-left:2px;text-wrap:pretty}',
    '.ig-acts{position:sticky;bottom:calc(-18px - env(safe-area-inset-bottom));z-index:1;display:flex;flex-direction:column;gap:10px;margin:20px -16px 0;padding:12px 16px calc(14px + env(safe-area-inset-bottom));background:var(--bg-1);border-top:1px solid var(--line)}',
    '.ig-acts .btn{width:100%;min-height:50px;margin:0}',
    '.ig-checked{margin:14px 4px 0;font-size:13px;line-height:1.45;color:var(--text-3)}',
    '[data-theme="light"] .ig-src.is-secondary{color:#a85a00!important}',
    'html.desk body.powa-app .ui-sheet.ig-sheet{width:min(600px,calc(100vw - 48px));max-height:calc(100vh - 48px);overflow-y:auto}',
    'html.desk body.powa-app .ig-acts{flex-direction:row-reverse;justify-content:flex-start;bottom:calc(-1 * var(--s-5,24px));margin:20px calc(-1 * var(--s-5,24px)) 0;padding:12px var(--s-5,24px)}',
    'html.desk body.powa-app .ig-acts .btn{width:auto;min-height:40px;padding:0 18px}'
  ].join('\n');
  function ensureCss() {
    if (document.getElementById('ig-style')) return;
    var st = document.createElement('style'); st.id = 'ig-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function copy(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text); } catch (e) { /* fall through */ }
    return new Promise(function (res, rej) {
      try { var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); if (ok) res(); else rej(); } catch (e) { rej(e); }
    });
  }
  // opts: { onPick() (the guide's action: back to the intake that opened it) }
  function open(id, opts) {
    opts = opts || {};
    var g = get(id);
    if (!g) return null;
    ensureCss();
    return uiSheet(g.title, function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ig-lead' }, g.lead));
      sheet.appendChild(el('h4', { class: 'ig-h' }, 'What to export'));
      var steps = el('ol', { class: 'ig-steps', role: 'list' });
      g.steps.forEach(function (st, i) {
        var li = el('li', { class: 'ig-step' });
        li.appendChild(el('span', { class: 'ig-n', 'aria-hidden': 'true' }, String(i + 1)));
        var m = el('div', { class: 'ig-step-main' });
        m.appendChild(el('b', {}, st.what));
        m.appendChild(el('span', {}, st.how));
        if (st.src) m.appendChild(el('span', { class: 'ig-src' + (st.src === 'secondary' ? ' is-secondary' : '') },
          st.src === 'secondary' ? 'From ' + st.where.toLowerCase() + (st.date ? ' (' + st.date + ')' : '') + ': the menus may have moved' : 'From ' + st.where + (st.date ? ', ' + st.date : '')));
        li.appendChild(m);
        steps.appendChild(li);
      });
      sheet.appendChild(steps);
      sheet.appendChild(el('h4', { class: 'ig-h' }, 'What POWALIFTA does with it'));
      var does = el('ul', { class: 'ig-does' });
      g.does.forEach(function (d) { does.appendChild(el('li', {}, d)); });
      sheet.appendChild(does);
      var acts = el('div', { class: 'ig-acts' });
      var pick = el('button', { class: 'btn btn-primary btn-lg', type: 'button' }, 'Choose the file');
      // iOS opens a file picker only from inside the tap itself: the intake's picker opens first, then this closes.
      pick.addEventListener('click', function () {
        if (opts.onPick) { opts.onPick(); close(); return; }
        close(); setTimeout(function () { if (window.SwitchKit && SwitchKit.openIntake) SwitchKit.openIntake({ mode: 'hub' }); }, 220);
      });
      acts.appendChild(pick);
      if (g.lifterSteps) {
        var cp = el('button', { class: 'btn btn-lg ui-btn-soft', type: 'button' }, 'Copy the steps for a lifter');
        cp.addEventListener('click', function () {
          copy(lifterMessage('', g.id)).then(function () { cp.textContent = 'Copied'; toast('Steps copied. Paste them in a message'); setTimeout(function () { cp.textContent = 'Copy the steps for a lifter'; }, 1800); }, function () { toast('Couldn\'t copy. Press and hold to select the steps instead'); });
        });
        acts.appendChild(cp);
      }
      sheet.appendChild(acts);
      sheet.appendChild(el('p', { class: 'ig-checked' }, 'Steps checked against each app\'s help pages on ' + CHECKED + '. Menus move: if one has, tell us at powalifta1320@gmail.com.'));
    }, { cls: 'ig-sheet' });
  }
  return { LIST: LIST, get: get, open: open, lifterMessage: lifterMessage, copy: copy };
})();
if (typeof window !== 'undefined') window.ImportGuides = ImportGuides;
