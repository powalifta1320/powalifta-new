/* kit/r6/solo.js: the desk's Programs editor in SOLO mode, for a lifter who writes their own program (26 Nov 2026;
   the owner: "For the solo athlete as well [...] They should have a similar option to the coach where they can make
   their own templates. They can put simple and advanced. They can change blocks, everything.").

   programs.html?solo=1 runs inside athlete.html's Program pane (lifter-program.js puts it there, a same-origin iframe).
   This file loads right after ../data.js and before kit.js: it swaps window.DEMO for ONE lifter, the person using the
   app, read from the parent (window.parent.LifterProgram.dataset(): their program in the kit's shape, their logs and
   maxes, their unit, their theme, their own templates). The starters, the coaching words (terms) and the rules stay.
   Without a parent the page's head has already gone to /athlete.html?demo=1&solo=1&tab=program.

   Its own storage: the store keeps solo's keys under pl:v1s: (store.js PFX), cleared on every load, so the coach demo
   in the same tab (pl:v1:, pl:v1f:) and the lifter's last visit never leak in; the truth is the parent's program.

   After the page has built (programs.html's solo block calls SOLO.start), every write the store makes is handed to the
   parent: the block as it now stands and the engine's load for each line still to come (SOLO.loads). Nothing is sent
   anywhere else. Without ?solo=1 this file does nothing. */
(function () {
  'use strict';
  var W = window, D = W.DEMO;
  if (!/[?&]solo=1\b/.test(W.location.search) || !D) return;
  var P = null; try { P = W.parent !== W ? W.parent.LifterProgram : null; } catch (e) { P = null; }
  if (!P || typeof P.dataset !== 'function') return;
  var ds = null; try { ds = JSON.parse(P.dataset() || 'null'); } catch (e) { ds = null; }
  if (!ds || !ds.lifter) return;

  /* every solo key from a visit before goes: the parent's program is the truth */
  try { var ss = W.sessionStorage, gone = []; for (var i = 0; i < ss.length; i++) { var k = ss.key(i); if (k && k.indexOf('pl:v1s:') === 0) gone.push(k); } gone.forEach(function (k) { ss.removeItem(k); }); } catch (e) { /* storage blocked: memory only */ }

  var L = ds.lifter, LIFTS = ['squat', 'bench', 'deadlift'];
  var nm = String(L.name || 'You'), parts = nm.trim().split(/\s+/);
  var rec = { id: L.id || 'me', name: nm, first: 'you', ini: ((parts[0] || 'Y').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase(), hue: 0,
    live: false, liveSets: 0, since: null, country: null, lane: 'solo', reasons: [], week: null, ago: null, lastDate: null, total: { now: null, delta: null }, lifts: {}, bw: null, bwSeries: [],
    meet: null, pastMeets: [], pain: [], drift: null, readiness: null, health: [], checkin: null, answers: [], messages: [], unread: 0, notes: [], coachNotes: [], billing: null, payments: [],
    request: null, intake: L.intake || null, program: L.program || null, review: { last: -1, next: -1, rows: [] }, jobs: [], logs: L.logs || [], sex: L.sex || null };
  LIFTS.forEach(function (k) { var x = L.lifts && L.lifts[k]; rec.lifts[k] = { e1: x && x.e1 ? x.e1 : null, was: null, delta: null, series: [null, null, null, null, null, null, null, null, null, null, null, x && x.e1 ? x.e1 : null] }; });
  if (rec.program && rec.program.weeks) {
    var pw = rec.program.weekIdx, n = rec.program.weeks.length;
    rec.week = { done: 0, planned: 0, perWeek: 0 };
    void pw; void n;
  }

  var now = new Date(), hh = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  D.today = ds.today; D.made = ds.today + 'T' + hh; D.unit = ds.unit === 'lb' ? 'lb' : 'kg';
  D.solo = true; D.fresh = false; D.desk = 'solo'; D.deskFrom = null;
  D.coach = { name: nm, plan: 'Free', seats: 1, limit: 1, lastLook: null, invite: null };
  D.lifters = [rec]; D.order = []; D.applications = []; D.calendar = []; D.team = null; D.meetDay = null;
  D.templates = (ds.templates || []).map(function (t) { return { name: t.name, block: t.block, appId: t.appId }; });
  D.week = { done: 0, planned: 0, lastDone: 0, lastPlanned: 0, days: [], behind: [], strength: { pct: 0, n: 0, lifts: { squat: 0, bench: 0, deadlift: 0 } }, effort: { on: 0, harder: 0, easier: 0, total: 0, hot: [] }, meets: [] };
  /* the coach's own lists the store reads by name: none of them are a lifter's */
  ['teams', 'threads', 'contacts', 'packages', 'clients'].forEach(function (k) { if (Array.isArray(D[k])) D[k] = []; });

  var slug = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); };
  var SEED = {}; D.templates.forEach(function (t) { SEED['tpl-' + slug(t.name)] = t.appId; });

  /* ---------------- after the page: the writes go to the parent ---------------- */
  var started = false, lastTpl = null;
  function loadsOf(json) {
    var out = {}, B = W.BLOCK; if (!json || !B) return out;
    var b = null; try { b = B.from(JSON.parse(JSON.stringify(json))); } catch (e) { b = null; } if (!b) return out;
    b.rows.forEach(function (row, r) {
      b.weeks.forEach(function (w, c) {
        var x = row.cells[w.uid]; if (!x || x.lifted || w.state === 'lifted') return;
        var ld = null; try { ld = b.load(r, c); } catch (e) { ld = null; }
        if (ld && typeof ld.kg === 'number' && isFinite(ld.kg)) out[row.key + '|' + w.uid] = ld.kg;
      });
    });
    return out;
  }
  /* the block as the editor holds it: the store's draft once there is one, else the program read as the editor reads it
     (programs.html blockOf: BLOCK.from of what PL.programs.get answers) */
  function blockNow() {
    var PL = W.PL, B = W.BLOCK, g = PL && PL.programs ? PL.programs.get(rec.id) : null;
    if (!g || g.error || !g.data || !Array.isArray(g.data.weeks)) return null;
    if (Array.isArray(g.data.rows)) return g.data;
    try { var b = B.from(g.data); return b ? b.toJSON() : null; } catch (e) { return null; }
  }
  function ownTemplates() {
    var PL = W.PL, r = PL && PL.templates ? PL.templates.list() : null, out = [];
    (r && r.data || []).forEach(function (t) {
      var g = PL.templates.get(t.id), j = g && g.data ? g.data : null; if (!j) return;
      out.push({ kitId: t.id, appId: SEED[t.id] || null, name: t.name, block: j });
    });
    return out;
  }
  function syncTemplates() { var list = ownTemplates(), s = JSON.stringify(list); if (s === lastTpl) return; lastTpl = s; try { P.templates(s); } catch (e) { /* the parent went */ } }
  var lastSent = null;
  function syncBlock() {
    var j = blockNow(); if (!j) return;
    var s = JSON.stringify(j); if (s === lastSent) return; lastSent = s;
    try { P.saved(s, JSON.stringify(loadsOf(j))); } catch (e) { /* the parent went */ }
    var m = {}; LIFTS.forEach(function (k) { if (j.maxFrom && j.maxFrom[k] === 'typed' && j.maxes && j.maxes[k]) m[k] = j.maxes[k]; });
    try { P.maxes(JSON.stringify(m)); } catch (e) { /* none */ }
  }
  /* the words: a lifter's own. The page is the coach's, written for a coach about a lifter; every string a lifter can
     reach is said in "you" and "your" by the solo block in programs.html, and this net catches what is left in the
     coach's shared views (kit/r6/week.js, sheet.js, simple.js say "to Mei", "Mei’s"; here the lifter is "you") */
  var WORDS = [
    [/\byou’s\b/g, 'your'], [/\bYou’s\b/g, 'Your'], [/\byou's\b/g, 'your'],
    [/\bone of your programs\b/g, 'one of your templates'], [/\bYour programs\b/g, 'Your templates'], [/\byour programs\b/g, 'your templates'], [/\bof your own, assigned to nobody yet\b/g, 'of your own'],
    [/ Nothing reaches you until you send it\./g, ''], [/\. Not sent\.(?=\s|$)/g, '.'], [/,? ?[Nn]ot sent yet\./g, '.'], [/ Not sent\./g, ''],
    [/\b(\d+) changes? to send\b/g, '$1 changed'], [/\bnot sent\b/g, 'written'], [/\bthe lifter\b/g, 'you'],
    [/\bShown to you\b/g, 'Shown in Train'], [/\bshows to you\b/g, 'shows in Train'], [/\bNote for you\b/g, 'Note'], [/\bnot assigned\b/g, 'a template'], [/\bNot assigned\b/g, 'Template'], [/\bNobody on it yet\b/g, 'A template'],
    [/\btheir\b/g, 'your'], [/\bTheir\b/g, 'Your'], [/\bthey\b/g, 'you'], [/\bThey\b/g, 'You'], [/\bthem\b/g, 'you'],
    [/\bNew lifters, or anyone new to RPE\b/g, 'New to lifting, or new to RPE'], [/Open, Open a copy, Assign, Share…/g, 'Open, start a block from it, share…'], [/ Nothing reaches a lifter until you use it for one\./g, ' Start a block from it in the Library.'], [/Nothing is sent, and Undo/g, 'Undo'], [/\bNothing is sent\.\s?/g, '']
  ];
  /* an lb lifter: the editor's numbers are pounds (lifter-program.js converts them), and so are its words */
  if (ds.unit === 'lb') WORDS.push([/\bkg\b/g, 'lb'], [/\bkilos\b/g, 'pounds'], [/\bKilos\b/g, 'Pounds']);
  var EXACT = { 'Not sent': 'Written', 'Sent': 'Written', 'Draft': '', 'kg': ds.unit === 'lb' ? 'lb' : 'kg' };
  /* THE LIFTER'S OWN WORDS ARE NEVER REWRITTEN (review, 26 Nov). The net is for the page's words; a note that says "keep
     them tight", a day called Draft or "the 20 kg bar" in an lb lifter's cue is theirs and shows as written. Every name
     and note in their block and their templates is read from the store (refreshed on each change, before the page draws
     again): a text that IS one of their names, or that holds (or is a piece of) one of their notes, is left alone. */
  var OWN_NAMES = {}, OWN_NOTES = [];
  function ownWords() {
    var names = {}, notes = [];
    var nm1 = function (s) { s = String(s == null ? '' : s).trim(); if (s) names[s] = 1; };
    var nt1 = function (s) { s = String(s == null ? '' : s).trim(); if (s.length >= 3) notes.push(s); };
    var walk = function (j) {
      if (!j) return; nm1(j.name);
      (j.days || []).forEach(function (d) { nm1(d && d.name); });
      (j.weeks || []).forEach(function (w) { if (w) { nt1(w.note); nm1(w.name); } });
      (j.rows || []).forEach(function (r) { if (!r) return; nm1(r.name); nm1(r.title); nm1(r.label); nt1(r.note); if (r.cn) Object.keys(r.cn).forEach(function (k) { nt1(r.cn[k]); }); if (r.cells) Object.keys(r.cells).forEach(function (k) { var x = r.cells[k]; if (x && typeof x.note === 'string') nt1(x.note); }); });
    };
    try { walk(blockNow()); ownTemplates().forEach(function (t) { nm1(t.name); walk(t.block); }); } catch (e) { /* the store is not up yet */ }
    OWN_NAMES = names; OWN_NOTES = notes;
  }
  function isOwn(t) {
    var s = String(t || '').trim(); if (!s) return false;
    if (OWN_NAMES[s] === 1) return true;   /* a day or a template really called Draft or Sent stays so */
    for (var i = 0; i < OWN_NOTES.length; i++) { var n = OWN_NOTES[i]; if (s.indexOf(n) >= 0 || (s.length >= 6 && n.indexOf(s.replace(/…$/, '')) >= 0)) return true; }
    return false;
  }
  function say(t) { if (!t) return t; if (isOwn(t)) return t; var o = t; if (EXACT[o.trim()] != null) return o.replace(o.trim(), EXACT[o.trim()]); WORDS.forEach(function (w) { o = o.replace(w[0], w[1]); }); return o; }
  function wordsIn(root) {
    if (!root) return;
    if (root.nodeType === 3) { var p = root.parentNode; if (p && /^(INPUT|TEXTAREA|SCRIPT|STYLE)$/.test(p.nodeName)) return; var v = root.nodeValue, n = say(v); if (n !== v) root.nodeValue = n; return; }
    if (root.nodeType !== 1) return;
    ['title', 'aria-label', 'placeholder'].forEach(function (a) { var v = root.getAttribute(a); if (v) { var n = say(v); if (n !== v) root.setAttribute(a, n); } });
    if (/^(INPUT|TEXTAREA|SCRIPT|STYLE)$/.test(root.nodeName)) return;
    var tw = W.document.createTreeWalker(root, 5), x; while ((x = tw.nextNode())) { if (x.nodeType === 3) wordsIn(x); else ['title', 'aria-label', 'placeholder'].forEach(function (a) { var v = x.getAttribute(a); if (v) { var n = say(v); if (n !== v) x.setAttribute(a, n); } }); }
  }
  function wordsNet() {
    wordsIn(W.document.body);
    if (!W.MutationObserver) return;
    new W.MutationObserver(function (ms) { ms.forEach(function (m) { if (m.type === 'characterData') wordsIn(m.target); else if (m.type === 'attributes') wordsIn(m.target); else m.addedNodes.forEach(function (n) { wordsIn(n); }); }); })
      .observe(W.document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
  }
  var SOLO = W.SOLO = {
    say: say,
    data: ds, id: rec.id, lifter: rec,
    loads: loadsOf,
    /* programs.html calls this once its block is open: the base the parent writes every edit against */
    start: function () {
      if (started) return; started = true;
      ownWords();
      /* in step with every write, at once: the store emits before the page draws again, so a note typed a moment ago is
         already the lifter's own when the net meets it */
      if (W.PL && typeof W.PL.on === 'function') W.PL.on('change', ownWords);
      wordsNet();
      var j = blockNow();
      if (j) { lastSent = JSON.stringify(j); try { P.ready(lastSent, JSON.stringify(loadsOf(j))); } catch (e) { /* none */ } }
      lastTpl = JSON.stringify(ownTemplates());
      if (W.PL && typeof W.PL.on === 'function') W.PL.on('change', function () { setTimeout(function () { if (rec.program) syncBlock(); syncTemplates(); }, 0); });
    },
    /* a new block in place of this one (Start your next block): the parent writes it and opens it again */
    replace: function (json, name) { try { return P.replace(JSON.stringify(json), JSON.stringify(loadsOf(json)), name || json.name || ''); } catch (e) { return { error: 'The program could not be saved.' }; } },
    flush: function () { syncBlock(); syncTemplates(); },
    /* the lifter's theme, as it changes in the app */
    theme: function (t) { if (t !== 'light' && t !== 'dark') return; var h = W.document.documentElement; h.setAttribute('data-theme', t);   /* glassdash.js follows: dark is glass */ try { W.dispatchEvent(new Event('powa-solo-theme')); } catch (e) { /* none */ } }
  };
  void SOLO;
})();
