/* kit/r6/store.js: window.PL, the one store of the round-6 coach desk (brief §8, store contract v1).

   One API over window.DEMO (kit/data.js) and window.COACH (kit/coach.js). It loads after data.js, kit.js and
   coach.js and before desk.js and the page, and needs no DOM: window, location, history, sessionStorage and window
   events only. The round-4 logic (roster.html words, health, sesState, statusOf, sortVal, pctChange; lifter.html
   sessions and the week; messages.html threads and drafts; clients.html money; lifter-meet.html and meet-day.html
   attempts; teams.html and programs.html) lives here once. Pages never count for themselves.

   ANSWERS. Every read and write answers synchronously with one of two shapes:
     { data, meta: { v, ... } }                     v = the store version, a whole number
     { error: { code, message, details? } }         code: not_found | invalid | locked | conflict | nothing_to_undo
   Reads are pure selectors memoised on v: the same arguments give the same object until something is written.
   Treat an answer as read-only (copy it before sorting or changing it).

   WRITES validate, write, persist (sessionStorage) and emit (PL.on), all before they answer
     { data, meta: { v, undo, label } }    undo: a token for PL.undo(token), null when nothing changed
                                           label: what happened, in the coach's words (for the page's toast)
   A refused write changes nothing: same v, no event, no storage write. PL.undo(token) takes one write back; it
   answers conflict when a later write changed the same thing, nothing_to_undo when the token is used or unknown.

   EVENTS. PL.on(type, fn) returns off(). 'change' fires on every write and undo with { type, ids, v }, after the
   specific ones: item:done, item:undone, message:sent, max:set, session:moved, program:saved, program:sent,
   meet:changed, billing:changed (an undo fires its write's events again with undone: true; an item's, item:undone).

   TOASTS. store.js owns K.toast (coach.js C.run calls it). The shell fills PL.hooks.toast = function (t) {...} with
   t = { text, undo, token }; undo() takes the move back through the store. Assigning K.toast = fn later sets the
   fallback renderer behind the hook and never bypasses the store. items.run toasts by itself (C.run's own words);
   for every other write the page shows meta.label with Undo, e.g. PL.toast(res).

   PERSISTENCE (sessionStorage, try-wrapped; blocked storage and broken JSON are survived in memory):
     pl:v1:done              mirrors COACH.state.done; restored before store.js returns, so a fix shows on every page
     pl:v1:edits             the ordered write log, replayed onto DEMO at load (an undone write leaves the log)
     pl:v1:blocks:<lifterId> the block.js draft that Builder and Sheet share (PL.programs.save and get)
     pl:v1:undo:<lifterId>   that block's history: up to 500 steps of PL.programs.save, as patches, for undo and redo
                             across reloads (PL.programs.undo / redo / history)
   ?reset=1 clears pl:v1:* (and nothing else) before anything is restored, then leaves the URL. A 'storage' event for
   pl:v1:* (another frame or tab on the same storage) brings this page in step and emits change.

   ONE ENGINE. When kit/r6/block.js is on the page (read at call time: programs.html loads it after this file), the
   numbers the Sheet shows come from it: PL.lifters.week's next week (b.cell) and its suggestions (BLOCK.draft first, the
   app's review where the engine drafts nothing), and a sent week's sets (each key the cell carries, the engine's load as
   planW). One load per line: a week to come (offset 1 and on) reads the engine's cell, as next week's column does; a
   week the engine sent carries planW and that is its load (kind 'plan'); this week's lines the data wrote keep the app's
   line (K.load of the e1RM, the lifter's phone; data.test.mjs 3b pins it). Without block.js, weeks to come fall back to
   that line too. A max the coach did not type is the block's working e1RM rounded to the bar (block.js maxFrom
   'lifting'); only a typed one wins in programs.get, lifters.get().lifts[k].max and a send.

   BEYOND BRIEF §8 (all in contract v1's shapes; each has a test in tools/qa/tests/store.test.mjs)
     counts().programsDue (to write + to send) · programs.list(): pain first, then a meet today, inside each state; each
       row's why (the lifter's one reason); meta.due { thisSunday, nextSunday, inTwoWeeks, later } (lifter ids)
     lifters.get: reason (the one reason every page shows), context, totalShown (the three rounded e1RMs added up, as
       cards show them), totalSeries (12 weeks, the same way), lifts[k].set (the logged set behind the e1RM:
       { d, w, r, rpe, e1, pr }), lifts[k].max (the draft's max, else the program's)
     lifters.week: rows[].next { w, r, rpe, n, kg, kgHi, kind, text }, rows[].suggest { kg, dir, why, from, keep, rule,
       src }, rows[].decided { how, kg, at, via: 'store'|'item', itemId, undo } (decided on the row), rows[].ruled
       { how: 'use'|'hold', kg, at, via: 'item', itemId, undo } (done through the rule's item), sessions[] dated by the program only
       (one rule with roster.today(); none is guessed), a session the block's end cut off: state missed, why 'meet'
     roster.charts().training.days[i]: planned and done (the sessions dated that day, and how many are done)
     lifters.setLoad(id, rowKey, kg) · lifters.undecide(id, rowKey) · lifters.replyNote(id, date, text)
     programs.send(id, n, { hold: ms }): the week waits ms behind its toast (Undo: never seen), then goes · flush()
     programs.save(id, block, { label }) · programs.undo(id) · programs.redo(id) · programs.history(id)
     messages.send(id, { text, ride, decide: { key, how: 'use' }, type: 'voice', dur }): with no ride given, the
       lifter's open reply-only fix rides along (ride: null sends the words alone) · threads.list({ q, keep: [ids] })
     teams.get: members[].reason and totalShown, week lines' loads at each member's own max, week.next (unsent)
     meets.plan: bw.sentence, bw.decided, ask, ticks, ready · meets.bw(lifterId, 'plan'|'class'|'watch') ·
       meets.tick(lifterId, tickId, on) · meets.rung(lifterId, i, on) · meets.undo(meetId) (the last verdict)
     billing.summary().data.invite · billing.packages() · billing.get(id) · billing.reply(appId, text) ·
       billing.undo(key) (the last move on a to-do row, after a reload too)
   13 Nov (the logic steward, the pages' requests; each has a test in store.test.mjs):
     reasons: a message reason says what they ask ("Asks to move Friday to Saturday") while their words item is open;
       context is the figure beside every reason, one place for needs(), lifters.get() and programs.list(): "Autumn Open
       today", "0.3 kg over", "On weight", "Twice in 7 days", "12 days out", "Resting heart rate up 11", "Double shifts at
       work", "Work trip"; pain counts name their window ("2 reports in 7 days"); change is to the decimal
     roster.charts().training: done = the bars added up (sessions done since Monday, by the dating rule); noDay, live;
       the filter 'behind' reads "Behind on sessions" · lifters.intake(id).data.est (the start rule's maxes) and .bw
     lifters.week: rows[].rule (the rule item's row), rows[].load by the one rule above, data.from and data.days (the
       seven days of the training week) · lifters.decide keep on a by-RPE line keeps no kilos and says the row ·
       lifters.setLoads(id, { rowKey: kg }) (one write, one Undo) · undo words keep a name's capital, one full stop
     programs.list rows: name (the draft's), change { what, words, itemId } and meta.counts.change, team { id, name, n,
       sent }; to send is next week only (or this week changed after its send) · programs.send(id, n) of a week only the
       draft holds: it joins the program, dated from the block's start · programs.save's step is labelled in its words
     teams.get: members and offPlan in the Roster's order; members[].from, weeks, item; week.weeks[n].ids and sent by
       one rule (published, and pushed at the team's revision, or sent here); facts.effort.perLifter; meta.offPlanOpen ·
       teams.sendWeek says who has it and who it does not reach · teams.start(teamId, lifterId, { week }) (and the 'team'
       move on first-<id>)
     meets: plan.bw.moves are the cut item's own · setAttempt keeps each attempt above the one before (a repeat after a
       miss is fine), a hand change clears the preset, on the day only the next attempt is called · board: stages[].at,
       clock.weighOpens, lifters[].onCalls, scale, flags 'ask'; warmup[id].state, next, took, draft, cut and each rung's
       late, planAt, tickedAt · weighIn(id, state, { kg }) · weighIns(meetId, ids, state) · openers(id, { squat, bench,
       deadlift }) · rungs(id, [i], on) · cutWarmup(id, { singles, out }) · uncutWarmup(id)
     items: pain on a meet day runs the Safe preset with its question ('safe'); a move that only sends words reads
       "Sent to Tom" once done; an answer reads the messages it answers (send, an item's reply, replyNote), one Undo
     threads: waiting = their last words have no answer yet, read or not; last.meta and last.len; meta.writeFirst; a
       voice note's meta.said; a form-check video is its message's attachment (meta.with); draft.answers, draft.follow
       (the words that go with a change made without them), ride in ride words; messages.send({ attach })
     billing: the month and the next 30 days from one schedule of due dates (month.total, month.rows, next[].inMonth,
       nextTotal, nextUntil, summary().data.in); a done to-do row keeps its words; an accepted applicant's row carries
       the invite; billing.list({ sort }); billing.todo().meta.kinds; a reminder before the due date is a heads-up

   Moves on COACH items stay the truth for what they change: a done item changes what the reads show (Sarah's
   deadlift day reads block pulls after "Swap in block pulls", Marcus's next bench reads 145 after "Apply your rule",
   Kofi's Friday moves to Saturday ...), so undoing the item undoes all of it.

   SPEC B (13 Nov 2026, STORE-1: r6/spec-b/shared.md §2 and §6, programs.md §11, overview-lifters.md §9.1, screens.md §10)
     counts: needYou 11, waitingThreads 6, clientsToDo 9, programsDue = programs.queue().meta.left (10), doneToday,
       nocheckin, trainedSince. needs(): the act table's reason and context (coach.js), fix { itemId, actId, label, short,
       go }; a due reminder or a change still unseen at 20:00 the evening before is a tier-1 row.
     items: preview(itemId, actId, { for, choices, edits, text }) → the merged shape (ops, changes, tell, ride { lands },
       remind, warn, go, button, silent, settles), by the act's ops on a block copy (block.js) or the same effect code on
       a copy; run(itemId, actId, { text, tell, edits, for, remind }): tell false only when the act has a silent button,
       a change that lands in a week not sent is saved into the draft with no card, the toast is coach.js's one format,
       a ticked follow-up lands in reminders; settle(itemId, { label }). Group acts send one copy per lifter.
     programs: queue(), proposal(id, n), weeks(id), dates(id, n), change(id, ops), moveSessionDay(id, wi, di, iso,
       { scope, publish }), next(id, { from }), append, schedule, seen; start from the intake by default (never sends);
       send(id, n, { note, message, items }); get(id).data.weeks[i].dates by the one dating rule (§11.4).
     lifters: list({ f: waiting|nocheckin|done|since|changed, sort: triage|total|change|sessions|status, ids }), get().lifts[k]
       .e1 = BLOCK.math.working (#27), loadMax, handled, sex; today, pain, logFor, seen, classes, setClass; setNext follows
       (back-offs by ratio, later weeks by their step); intake est by the RTS chart at RPE 10.
     changes.list, sessions.since/seen, reminders.add/list/done, threads.seen, meets.results, meets.calendar, PL.now()
       (07:20 and a minute per write), PL.setNow(iso) (the demo clock, later only). The Safe preset is shared.md §4.7.
   STORE-2 (13 Nov, screens.md §10.4 to §10.8; the second form of a call is told apart by its arguments, the first is unchanged)
     teams: list() every team, hold/release, sendWeek(id, n, { ids }), restart(id, lifterId, { at, on }), start(.., { week,
       maxes }) typed, create({ name, ids, from, startsOn }), setLine/addLine/removeLine (meta.affects, meta.kept);
       members[k].weeks[n] { state, top, his, own }, offset, joins. meets: book (several per lifter; lifters.get().meets),
       results(id, { meetId, attempts, bw, place }), target, reason, note(id, meetId, text), pain(id, { where, score, lift,
       ease }), flight, platform, platformAt, rack, handIn, changeBy, cutPlan, saveCut, maxesFromMeet; plan() warnings,
       rehearsal, runin, target, rack, handedIn, reasons, debrief, bw.plan/offPace; board() platform, lifters[].out, points,
       prs, rack, target, timeline, rungs[].outAt. messages: edit, remove (10 minutes), sendMany, depth, send({ ride: [..] });
       threads.get().draft.rides and depth. billing: remindDraft, remind(id, { text, when }) (a payment card), editPayment,
       setPackage(id, { pkg, amount, firstDue, note }), accept/decline with terms, invite, end, inviteCancel/inviteNew,
       savePackage/removePackage, exportCsv; todo() rows crimson; summary() month.includes, seats.breakdown. settings: get,
       set (validated, merged, one Undo; rules feed D.rules and D.rulesBy, deload and plateStep D.coach), plan(id).
   SPEC C (13 Nov evening, r6/spec-c/plan.md package STORE; first-time-coach.md §13, function-polish.md §6). Two desks: the
     fresh desk (D.fresh) keeps its keys under pl:v1f:, the showcase under pl:v1: (PL.desk.mode). Lifters this desk adds
     (invites.create, lifters.add) are records in D.lifters with made = {...}; syncNew() keeps their triage and the
     first-<id> / join-<id> items in step after every write, undo and replay. first-<id> settles on the first send, never on
     the start. The ops sit with the others before the replay (search "SPEC C"); the calls are the last section: desk,
     invites, demo, setup, starters, sendMany, plan, fillGap, letRpe, numbers, fmt, terms, billing.charge, templates.fit,
     meets.plan phase/basis/timeline/job, teams quiet and hold. polish-d2 (14 Nov): programs.openChecks; numbers().source and
     lifters.intake().source ("What you typed" for a lifter added by hand); a desk-made lifter's lifts series. */
(function () {
  'use strict';
  var W = window, D = W.DEMO, K = W.K, C = W.COACH;
  if (!D || !K || !C) throw new Error('kit/r6/store.js loads after kit/data.js, kit/kit.js and kit/coach.js');
  if (W.PL && W.PL.__store) return;

  /* ================= small things ================= */
  var LIFTS = ['squat', 'bench', 'deadlift'], MAIN = { squat: 1, bench: 1, deadlift: 1 };
  /* the set keys a draft week carries into the program (declared here: the replay at load reads it through weekFromDraft,
     and a template start replayed before this was set lost the coach's block on every reload) */
  var SET_KEYS = ['rHi', 'amrap', 'pct', 'pctHi', 'rpe', 'rpeHi', 'rir', 'off', 'until', 'wHi', 'tempo', 'pause'];
  /* 26 Nov (solo): the lifter's own editor (kit/r6/solo.js, D.solo) keeps its keys under pl:v1s:, apart from both desks. */
  /* spec C (first-time-coach.md §2.3): each desk keeps its own keys. The fresh desk (data.js D.fresh, ?fresh=1) writes under
     pl:v1f:, the showcase under pl:v1:; ?reset=1 clears only the desk it is on (neither prefix starts with the other) */
  var PFX = D.solo ? 'pl:v1s:' : D.fresh ? 'pl:v1f:' : 'pl:v1:', KEY_DONE = PFX + 'done', KEY_EDITS = PFX + 'edits', KEY_BLOCK = PFX + 'blocks:', KEY_UNDO = PFX + 'undo:';
  var n = K.n, TODAY = K.today, TODAY0 = K.today;
  /* block.js, when the page has it; read at call time (programs.html loads it after this file) */
  function BLK() { var b = W.BLOCK; return b && b.__block && typeof b.from === 'function' ? b : null; }
  /* 23.8 seconds → "0:24" */
  function mss(sec) { sec = Math.max(0, Math.round(Number(sec) || 0)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  /* the coach's invite link (brief §6: "powalifta.com/j/SAM425, 4 seats left") */
  var INVITE = (D.coach && D.coach.invite) || 'SAM425';
  var hasOwn = Object.prototype.hasOwnProperty;
  function has(o, k) { return o != null && hasOwn.call(o, k); }
  function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isStr(s) { return typeof s === 'string'; }
  function words0(s) { return isStr(s) ? s.replace(/\s+/g, ' ').trim() : ''; }
  function slug(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function lower1(s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); }
  function upper1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  /* a label carried into a sentence ("Undone: …"): its first letter lowered unless its first word is a name (a lifter,
     an applicant, the coach, a day, a month) or an abbreviation (RPE), so "Undone: Tomas paid $150 today." keeps Tomas */
  var NAMES = null;
  function namesSet() {
    if (NAMES) return NAMES;
    NAMES = {};
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'I'].forEach(function (w) { NAMES[w] = 1; });
    (D.lifters || []).forEach(function (l) { if (l.first) NAMES[l.first] = 1; });
    (D.applications || []).forEach(function (a) { if (a.name) NAMES[String(a.name).split(' ')[0]] = 1; });
    if (D.coach && D.coach.name) NAMES[String(D.coach.name).split(' ')[0]] = 1;
    return NAMES;
  }
  function soft1(s) { s = String(s || ''); var w = (/^[A-Za-z]+/.exec(s) || [''])[0]; return namesSet()[w] || /^[A-Z0-9]{2,}\b/.test(s) || /^[A-Z][a-z]*\s+[A-Z][a-z]/.test(s) ? s : lower1(s); }   /* a title-cased name keeps its capitals too (Deadlift Day, Autumn Open) */
  /* a sentence's full stop, never doubled and never after a closing quote that ends one already */
  function endDot(s) { s = String(s || '').replace(/\s+$/, ''); return /[.!?]$|[.!?]”$|”$/.test(s) ? s : s + '.'; }
  function undoneSay(label) { return 'Undone: ' + endDot(soft1(String(label || '').replace(/\.$/, ''))); }
  function isIso(s) { if (!isStr(s) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; var t = new Date(s + 'T12:00:00Z'); return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s; }
  function step25(kg) { return Math.abs(kg / 2.5 - Math.round(kg / 2.5)) < 1e-9; }
  function uniq(a) { var out = []; a.forEach(function (x) { if (out.indexOf(x) < 0) out.push(x); }); return out; }
  function day10(x) { return x ? String(x).slice(0, 10) : null; }
  function argObj(o) { return o && typeof o === 'object' ? o : {}; }
  function ok(data, meta) { var m = { v: v }; if (meta) Object.keys(meta).forEach(function (k) { m[k] = meta[k]; }); return { data: data, meta: m }; }
  function fail(code, message, details) { var e = { code: code, message: message }; if (details) e.details = details; return { error: e }; }
  function L(id) { return isStr(id) ? K.L(id) : null; }
  function noLifter(id) { return fail('not_found', 'There is no lifter ' + (isStr(id) && id ? '“' + id + '”' : 'with that id') + ' on your roster.'); }
  function stableKey(x) {
    if (x === undefined) return '';
    if (x === null || typeof x !== 'object') return JSON.stringify(x);
    if (Array.isArray(x)) return '[' + x.map(stableKey).join(',') + ']';
    return '{' + Object.keys(x).sort().filter(function (k) { return x[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ':' + stableKey(x[k]); }).join(',') + '}';
  }

  /* ================= storage ================= */
  var SS = null;
  try { SS = W.sessionStorage || null; if (SS) SS.getItem(KEY_DONE); } catch (e) { SS = null; }
  function sGet(k) { if (!SS) return null; try { return SS.getItem(k); } catch (e) { return null; } }
  function sSet(k, val) { if (!SS) return; try { SS.setItem(k, val); } catch (e) { /* full or blocked: the store goes on in memory */ } }
  function sDel(k) { if (!SS) return; try { SS.removeItem(k); } catch (e) { /* blocked */ } }
  function sKeys() { var out = []; if (!SS) return out; try { for (var i = 0; i < SS.length; i++) { var k = SS.key(i); if (k != null) out.push(k); } } catch (e) { /* blocked */ } return out; }
  function parseJSON(raw) { if (raw == null) return null; try { return JSON.parse(raw); } catch (e) { return null; } }

  /* ?reset=1: a clean start for this tab's demo state, and the URL forgets it */
  (function () {
    var search = ''; try { search = String(W.location && W.location.search || ''); } catch (e) { search = ''; }
    if (!/[?&]reset=1(?:&|$)/.test(search)) return;
    sKeys().forEach(function (k) { if (k.indexOf(PFX) === 0) sDel(k); });
    sDel('powa-r6-setupdone:' + PFX);   /* FIX-LOGIC: Getting started's last look (setupOut) starts over with the desk */
    try { var u = new URL(W.location.href); u.searchParams.delete('reset'); W.history.replaceState(W.history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* no history */ }
  })();

  /* the data as it came, for in-place resets and for "an explicit edit wins over an item's effect" */
  var PRISTINE = JSON.stringify(D), P0 = null;
  function p0() { return P0 || (P0 = JSON.parse(PRISTINE)); }
  function p0Lifter(id) { return p0().lifters.filter(function (x) { return x.id === id; })[0] || null; }

  /* ================= version, memo, events ================= */
  var v = 1, memo = {}, subs = {};
  function bump() { v++; memo = {}; }
  function cached(key, f) { if (has(memo, key)) return memo[key]; var r = f(); memo[key] = r; return r; }
  function on(type, fn) {
    if (!isStr(type) || typeof fn !== 'function') return function () {};
    (subs[type] = subs[type] || []).push(fn);
    var live = true;
    return function off() { if (!live) return; live = false; var l = subs[type], i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); };
  }
  function emit(type, payload) { var l = subs[type]; if (!l || !l.length) return; l.slice().forEach(function (fn) { try { fn(payload); } catch (e) { if (W.console) W.console.error(e); } }); }
  /* a read: memoised on the version; f answers { data, meta? } or { error } */
  function sel(name, args, f) {
    return cached(name + '|' + stableKey(args), function () {
      var r = f();
      if (r && r.error) return r;
      return ok(r.data, r.meta);
    });
  }

  /* ================= the clock: demo time moves on from DEMO.made, never backwards ================= */
  /* shared.md §6.11, screens.md §10.9: PL.now() is "2026-11-10T07:20" (D.made) and one minute later per write this session;
     every time the store writes (messages, sends, reminders, weigh-ins) is that clock, never new Date(). stamp() is the
     time the next write will carry; commit() moves the clock on when a write lands. PL.setNow(iso) moves the demo clock
     (the lifter's evening in a test, the demo's time travel). */
  var BOOT = Date.now(), BASE = K.now.getTime(), lastStamp = BASE, MIN = 60000;
  function stamp() { return new Date(lastStamp + MIN).toISOString(); }
  function tick() { lastStamp += MIN; }
  function sawStamp(iso) { var t = Date.parse(iso); if (!isNaN(t) && t > lastStamp) lastStamp = t; }
  function pad0(x) { return String(x).padStart(2, '0'); }
  function localIso(t) { var d = new Date(t); return d.getFullYear() + '-' + pad0(d.getMonth() + 1) + '-' + pad0(d.getDate()) + 'T' + pad0(d.getHours()) + ':' + pad0(d.getMinutes()); }
  function nowIso() { return localIso(lastStamp); }
  /* FIX-LOGIC (build C walk 2, first-time coach: "Skip to Mon 16 Nov" left the desk on Tuesday 10 Nov): on the fresh desk
     the demo clock moving into a later day moves the desk's today with it (the store's TODAY, K.today, DEMO.today), so the
     date line, this week, the e1RM from the sets she logged and the week her block is on all read that day. Only forward,
     only the fresh desk (the example desk's today never moves, whatever PL.setNow does); boot() starts again from the day
     the data was made and the replay moves it as each write's time passes midnight, as it did when the writes landed */
  function dayOn(t) {
    if (!D.fresh) return false;
    var day = localIso(isNum(t) && !isNaN(t) ? t : lastStamp).slice(0, 10);
    if (!(day > TODAY)) return false;
    TODAY = day; K.today = day; D.today = day;
    D.lifters.forEach(function (l) { if (l.made) madeDay(l); });
    return true;
  }
  function dayReset() { TODAY = TODAY0; K.today = TODAY0; D.today = TODAY0; }
  /* a lifter the desk made, on the desk's day: the week of the block it is in (never back), the days to a booked meet */
  function madeDay(l) {
    var p = l.program;
    if (p && isStr(p.startsOn) && Array.isArray(p.weeks) && p.weeks.length) {
      var since = -K.daysTo(K.monday(String(p.startsOn).slice(0, 10))), wi = since < 0 ? -1 : Math.min(p.weeks.length - 1, Math.floor(since / 7));
      if (wi > (isNum(p.weekIdx) ? p.weekIdx : -1)) p.weekIdx = wi;
    }
    if (l.meet && isStr(l.meet.date)) l.meet.days = K.daysTo(String(l.meet.date).slice(0, 10));
  }
  /* a stored time ("2026-11-10T07:21:00.000Z" or local "2026-11-10T07:21") as a moment */
  /* read by its parts, never by Date's string parser (a hot loop of Date(string) under concurrent GC crashed node 24's
     optimiser in the test run): "Z" is UTC, no zone is the demo's local time, a bare day is its local midnight */
  var ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z)?)?$/;
  function tOf(x) {
    if (x == null) return NaN; if (isNum(x)) return x;
    var m = ISO_RE.exec(String(x)); if (!m) return NaN;
    var y = +m[1], mo = +m[2] - 1, d = +m[3], h = m[4] ? +m[4] : 0, mi = m[5] ? +m[5] : 0, sec = m[6] ? +m[6] : 0, ms = m[7] ? Math.round(Number('0.' + m[7]) * 1000) : 0;
    return m[8] ? Date.UTC(y, mo, d, h, mi, sec, ms) : new Date(y, mo, d, h, mi, sec, ms).getTime();
  }

  /* ================= toasts: K.toast goes through the store ================= */
  var hooks = { toast: null }, capture = null, renderer = typeof K.toast === 'function' ? K.toast : null, inHook = false;
  /* a hook that calls K.toast itself reaches the renderer, never itself again */
  function deliver(t) {
    if (typeof hooks.toast === 'function' && !inHook) { inHook = true; try { hooks.toast(t); } catch (e) { if (W.console) W.console.error(e); } finally { inHook = false; } return; }
    if (renderer) { try { renderer(t.text, t.undo || undefined); } catch (e) { if (W.console) W.console.error(e); } }
  }
  function route(text, undo) {
    var t = { text: String(text == null ? '' : text), undo: typeof undo === 'function' ? undo : null, token: null };
    if (capture) { capture.push(t); return; }
    deliver(t);
  }
  try {
    Object.defineProperty(K, 'toast', { configurable: true, enumerable: true,
      get: function () { return route; },
      set: function (fn) { if (typeof fn === 'function' && fn !== route) renderer = fn; } });
  } catch (e) { K.toast = route; }

  /* ================= what the data says about a lifter (round-4 roster.html, ported once) ================= */
  var TIER = {}, ORD = {}, TYPES = {};
  (D.order || []).forEach(function (o, i) { o.ids.forEach(function (id) { if (TIER[id] == null || o.tier < TIER[id]) TIER[id] = o.tier; if (ORD[id] == null) ORD[id] = i; (TYPES[id] = TYPES[id] || []).push(o.type); }); });
  /* LOGIC-FIX-2 (Meets' request, screens.md §9: one weigh-in record): the meet-day scale weight, once the board has it, is the
     lifter's bodyweight on every page (Tom 104.9 on the board and on his lifter page) */
  function scaleOf(l) { var pl = l && ST.plans ? ST.plans[l.id] : null; return pl && pl.weigh && pl.weigh !== 'not' && isNum(pl.scale) ? { kg: pl.scale, d: day10(pl.weighAt) || TODAY } : null; }
  function bwSeriesOf(l) { var s = (l.bwSeries || []).map(function (x) { return { d: x.d, kg: x.kg }; }), sc = scaleOf(l); if (sc) { s = s.filter(function (x) { return x.d !== sc.d; }); s.push({ d: sc.d, kg: sc.kg, scale: true }); } return s; }
  function bwNow(l) { var sc = scaleOf(l); if (sc) return sc.kg; if (l.bw && l.bw.kg != null) return l.bw.kg; if (l.bw && l.bw.cls && l.bw.over != null) return r1(parseFloat(l.bw.cls) + l.bw.over); var s = l.bwSeries || []; return s.length ? s[s.length - 1].kg : null; }
  function painOpen(l) { return (l.pain || []).filter(function (p) { return !p.resolved; }).sort(function (a, b) { return b.day.localeCompare(a.day); }); }
  /* pain over a window says the window it counts: the last 7 days (coach.js titles say ", twice in 7 days" the same way) */
  function inSeven(reps) { var from = K.add(TODAY, -6); return reps.every(function (q) { return q.day >= from; }); }
  function painWhen(l) { var p = painOpen(l); if (!p.length) return ''; if (p.length === 1) return K.When(p[0].day); return inSeven(p) ? (p.length === 2 ? 'Twice' : p.length + ' times') + ' in 7 days' : p.length + ' open reports'; }
  function ans(l, q, day) { return (l.answers || []).filter(function (a) { return a.q.indexOf(q) === 0 && (!day || a.day === day); })[0] || null; }
  function lastAnsDay(l) { var d = null; (l.answers || []).forEach(function (a) { if (!d || a.day > d) d = a.day; }); return d; }
  function reasonOf(l, type) { return (l.reasons || []).filter(function (r) { return r.type === type; })[0] || null; }
  function pctChange(l, lift) { var x = l.lifts[lift]; if (!x || x.e1 == null || x.delta == null) return null; return x.delta / (x.e1 - x.delta) * 100; }
  /* the logged set an e1RM comes from (data.js keeps one record: lifts.<lift>.e1 is the best counting set of the 28 days
     ending today, its log row carrying the same e1; Mei's, the engine's working e1RM, sheet-spec §13.1): the latest
     counting set (rated, 1 to 6 reps, RPE 7 or harder) of those 28 days whose e1 is the e1RM, ties naming the later */
  function setBehind(l, lift) {
    var x = l.lifts && l.lifts[lift]; if (!x || x.e1 == null) return null;
    var from = K.add(TODAY, -27), hit = null;
    (l.logs || []).forEach(function (g) {
      if (g.lift !== lift || !g.d || g.d < from || g.d > TODAY || g.e1 == null || Math.abs(g.e1 - x.e1) >= 0.05) return;
      if (!(g.rpe != null && g.rpe >= 7 && g.r >= 1 && g.r <= 6 && g.w > 0)) return;
      if (!hit || g.d >= hit.d) hit = g;
    });
    return hit ? { d: hit.d, w: hit.w, r: hit.r, rpe: hit.rpe, e1: hit.e1, pr: !!hit.pr } : null;
  }
  function agoWords(at) { var d = -K.daysTo(String(at).slice(0, 10)); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
  function unreadOf(l) { return l.unread || 0; }
  function health(l) {
    var p = painOpen(l), todayPain = ans(l, 'Any pain', TODAY), rd = l.readiness && l.readiness.text, slept = reasonOf(l, 'checkin'), noci = reasonOf(l, 'nocheckin');
    if (p.length) return { tone: 't-pain', kind: 'pain', text: p[0].part + ' ' + n(p[0].sev) + '/10', sub: p.length > 1 ? (inSeven(p) ? p.length + ' reports in 7 days' : p.length + ' open reports') : 'on ' + String(p[0].lift || '').toLowerCase() };
    if (todayPain && todayPain.num) return { tone: 't-pain', kind: 'pain', text: 'Pain today', sub: 'on today’s check-in' };
    if (rd) { var m = /resting HR \+(\d+)/.exec(rd), dd = (/(\d+) days/.exec(rd) || ['', ''])[0]; return { tone: 't-warn', kind: 'low', text: 'Resting heart rate up ' + (m ? m[1] : ''), sub: dd ? 'for ' + dd : '' }; }
    if (slept) return { tone: 't-warn', kind: 'low', text: slept.text.replace(/(\d)h\b/, '$1 h'), sub: 'last check-in' };
    if (noci) return { tone: 't-quiet', kind: 'none', text: 'No check-in', sub: noci.text.replace('No check-in for ', 'for ') };
    var day = lastAnsDay(l), s = day && ans(l, 'How many hours', day), so = day && ans(l, 'How sore', day);
    if (s) return { tone: 't-ok', kind: 'ok', text: 'Slept ' + n(s.num) + ' h', sub: (so ? 'soreness ' + n(so.num) + '/10' : '') + (day !== TODAY ? (so ? ', ' : '') + K.when(day) : '') };
    return { tone: 't-quiet', kind: 'none', text: 'No check-in yet', sub: l.program ? '' : 'new lifter' };
  }
  /* their last session note still waiting for an answer */
  function lastNote(l) { return (l.notes || []).filter(function (s) { return !s.reply; }).slice(-1)[0] || null; }
  /* a note in a few of the coach's words: its first clause, past "felt" and "the last", a lift's "squat set" said as
     "squats": "Left knee felt tight on the last squat set. Nothing sharp." → "left knee tight on squats" */
  function noteGist(text) {
    var s = String(text || '').split(/(?<=[.?!])\s+/)[0].replace(/[.?!]+$/, '');
    s = s.replace(/\bfelt\s+/i, '').replace(/\bthe last\s+/i, '').replace(/\b(squat|deadlift)\s+sets?\b/i, '$1s').replace(/\bbench\s+sets?\b/i, 'bench');
    return lower1(s.trim());
  }
  function noteLead(x) { var d = Math.max(0, -K.daysTo(x.date)); return d === 0 ? 'Note from today' : d === 1 ? 'Note waiting since yesterday' : 'Note waiting ' + d + ' days'; }
  /* each reason in the words a lifter would use, with the family its mark belongs to. h: their health today (a note
     takes the pain tone only when they are in pain, so its colour never contradicts the Health count) */
  function words(l, type, h) {
    var b = l.bw, m = l.meet, p = painOpen(l), x;
    switch (type) {
      case 'pain': return { t: 't-pain', w: p.length ? p[0].part + ' ' + n(p[0].sev) + '/10' + (p[0].lift ? ' on ' + String(p[0].lift).toLowerCase() : '') : 'Pain on today’s check-in', pop: 'health' };
      case 'meetday': return { t: 't-meet', w: (m ? m.name : 'Meet') + ' today', pop: 'meet' };
      case 'busy': x = l.request; return { t: 't-warn', w: x && x.days && x.days.length ? 'Can only train ' + K.list(x.days, 3) : 'Asked to change this week', pop: 'week' };
      case 'weight': return b && b.over > 0 ? { t: 't-warn', w: n(b.over) + ' kg over ' + clsWords(b.cls), pop: 'bw' } : null;
      case 'overshoot': x = /(\w+) @([\d.]+) vs @([\d.]+)/.exec((reasonOf(l, 'overshoot') || {}).text || ''); return { t: 't-warn', w: x ? x[1] + ' felt ' + x[2] + ', not ' + x[3] : 'Felt harder than written', pop: 'felt' };
      case 'drift': return { t: 't-warn', w: 'Sets felt ' + n(l.drift ? l.drift.avg : 0.5) + ' RPE harder', pop: 'felt' };
      case 'message':
        /* what they ask, when their open words item reads a request ("Asks to move Friday to Saturday"); else how much is waiting */
        x = (l.messages || []).filter(function (mm) { return !mm.me; }).slice(-1)[0];
        var wi = C.get('words-' + l.id), asks = wi && wi.ids.length === 1 && !doneOf(wi.id) && /^\S+ asks /.test(wi.title || '') ? 'Asks ' + wi.title.replace(/^\S+ asks /, '') : '';
        if (asks) return { t: 't-msg', w: asks, pop: 'msg' };
        return { t: 't-msg', w: unreadOf(l) > 1 ? unreadOf(l) + ' new messages' : 'Wrote you ' + (x ? agoWords(x.at) : ''), pop: 'msg' };
      case 'formcheck': return { t: 't-msg', w: 'Sent a form check video', pop: 'msg' };
      case 'note': x = lastNote(l); if (!x) return null; return { t: h && h.kind === 'pain' && /knee|back|hip|shoulder|elbow|wrist|pain|tight|sharp/i.test(x.note) ? 't-pain' : 't-msg', w: noteLead(x) + ': ' + noteGist(x.note), full: noteLead(x) + ': “' + x.note + '”', pop: 'msg' };
      case 'checkin': x = reasonOf(l, 'checkin'); return { t: 't-warn', w: x ? x.text.replace(/(\d)h\b/, '$1 h') : 'Low on the check-in', pop: 'health' };
      case 'readiness': x = /resting HR \+(\d+)/.exec(l.readiness && l.readiness.text || ''); return { t: 't-warn', w: x ? 'Resting heart rate up ' + x[1] : 'Recovering slowly', pop: 'health' };
      case 'nocheckin': x = reasonOf(l, 'nocheckin'); return { t: 't-quiet', w: x ? x.text : 'No check-in lately', pop: 'health' };
      case 'quiet': return { t: 't-warn', w: quietWords(l), pop: 'week' };
      case 'never': return { t: 't-warn', w: 'No sets logged yet', pop: 'week' };
      case 'stalling': x = /(\d+) wk/.exec((reasonOf(l, 'stalling') || {}).text || ''); return { t: 't-warn', w: 'Strength flat for ' + (x ? x[1] : 3) + ' weeks', pop: 'squat' };
      case 'blockdone': return { t: 't-quiet', w: 'Block finished', pop: 'week' };
      case 'blockend': return { t: 't-quiet', w: 'Block ends this week', pop: 'week' };
      case 'write': return { t: 't-quiet', w: 'Next week to write', pop: 'week' };
      case 'noprogram': return { t: 't-quiet', w: 'No program yet', pop: 'week' };
      case 'join': return { t: 't-quiet', w: 'Hasn’t joined yet', pop: 'week' };   /* spec C (FTC §3.5): an invite not taken after 48 hours */
      case 'offapp': return { t: 't-write', w: 'Can’t see ' + herOf(l) + ' program yet', pop: 'week' };   /* FIX-LOGIC s6: added by hand, sent, not on the app */
    }
    return null;
  }
  /* gone quiet, in the one wording every page uses: "12 days since a session" */
  function quietWords(l) { return l.ago >= 7 ? K.plural(l.ago, 'day') + ' since a session' : 'Nothing logged this week'; }
  /* FP F6.1 / FD3, one countdown: "today", "tomorrow", "in 12 days" up to 20, "7 weeks out" from 21 (PL.fmt.out's words) */
  function outText(days) { var d = Math.round(Number(days)); return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday' : d < 0 ? Math.abs(d) + ' days ago' : d <= 20 ? 'in ' + d + ' days' : Math.floor(d / 7) + ' weeks out'; }
  /* a meet and its countdown in one phrase: "Fall Nationals, 7 weeks out", "Spring Open in 12 days", "Autumn Open today" */
  /* where a block is when weeks went out ahead of this one: "Week 1 now, weeks 2 and 3 sent" (the Programs list's words) */
  function posWords(l) {
    var p = l && l.program; if (!p || !(p.weekIdx >= 0) || !p.weeks[p.weekIdx]) return null;
    var now = p.weekIdx, ahead = []; p.weeks.forEach(function (w, i) { if (i > now && w.sentAt) ahead.push(w.n || i + 1); });
    if (!ahead.length) return null;
    /* FIX-LOGIC polish-d (look L10, at most 8 grey words in a row): "Week 1 now, weeks 2 and 3 sent"; three or more in a row
       read as a range ("weeks 2 to 4 sent"), never "weeks 2, 3 and 4" */
    var run = ahead.length > 2 && ahead.every(function (x, i) { return i === 0 || x === ahead[i - 1] + 1; });
    return 'Week ' + (p.weeks[now].n || now + 1) + ' now, ' + (run ? 'weeks ' + ahead[0] + ' to ' + ahead[ahead.length - 1] : ahead.length > 1 ? 'weeks ' + ahead.slice(0, -1).join(', ') + ' and ' + ahead[ahead.length - 1] : 'week ' + ahead[0]) + ' sent';
  }
  function meetCount(m) { var t = outText(m.days); return m.name + (/ out$/.test(t) ? ', ' : ' ') + t; }
  /* a countdown after a comma, as the weight items say it: "meet today", "meet tomorrow", "12 days out", "7 weeks out" */
  function outShort(days) { return days === 0 ? 'meet today' : days === 1 ? 'meet tomorrow' : days <= 20 ? days + ' days out' : Math.floor(days / 7) + ' weeks out'; }
  function clsOf(l) { var c = l.bw && l.bw.cls != null ? l.bw.cls : l.intake && l.intake.weightClass ? l.intake.weightClass : null; if (c == null) return null; var f = parseFloat(c); return isNaN(f) || /\+\s*$/.test(String(c)) ? String(c).replace(/\s+/g, '') : f; }

  /* ================= COACH items and their moves ================= */
  var GRP = { pain: 'hurt', meetday: 'meet', busy: 'approve', weight: 'meet', overshoot: 'train', drift: 'train', readiness: 'train', stalling: 'train', message: 'words', formcheck: 'words', note: 'words', checkin: 'quiet', nocheckin: 'quiet', quiet: 'quiet', never: 'quiet', write: 'write', blockend: 'write', blockdone: 'write', noprogram: 'write', join: 'quiet', offapp: 'write' };
  function doneOf(id) { var d = C.state.done[id]; return d && typeof d === 'object' ? d : null; }
  /* an item's move by id: its acts, then its row menu (spec C: first-<id>'s "Do it Saturday" lives in it.menu, coach.js) */
  function actOf(it, actId) { return (it.acts || []).concat(it.menu || []).filter(function (a) { return a.id === actId; })[0] || null; }
  /* a done move in the words of what happened: a move that only sends words reads "Sent to Jonah"; others keep their label */
  /* a done move in the act table's done words (shared.md §5, §9's done row): "Block pulls on Saturday, told Sarah"; a move
     that went without its words drops the telling ("Block pulls on Saturday") */
  function doneLabel(it, d) {
    if (!d) return ''; if (d.label) return d.label;
    var a = actOf(it, d.act); if (!a) return 'Done';
    var w = a.done || a.label;
    if (d.swap) w = swapNums(w, d.swap);
    if (a.reply != null && !d.text && d.via !== 'message' && d.via !== 'note') w = w.replace(/,\s*(told|asked|replied)\b.*$/, '');
    return w;
  }
  /* the lifter's own item for a reason type (Mei's note is words-demo-d6, Tom's meet day is meet-today-demo-a3) */
  function itemOfType(l, type) {
    var grp = GRP[type]; if (!grp) return null;
    var its = C.forLifter(l.id).filter(function (it) { return it.group === grp && it.ids.length === 1; });
    if (type === 'meetday') its = its.filter(function (it) { return it.id === 'meet-today-' + l.id; });
    if (type === 'weight') its = its.filter(function (it) { return it.id === 'cut-' + l.id; });
    if (type === 'blockend' || type === 'blockdone') its = its.filter(function (it) { return it.id === 'blockend-' + l.id; });
    if (type === 'noprogram') its = its.filter(function (it) { return it.id === 'first-' + l.id; });
    if (type === 'join') its = its.filter(function (it) { return it.id === 'join-' + l.id; });
    if (type === 'offapp') its = its.filter(function (it) { return it.id === 'offapp-' + l.id; });
    if (type === 'pain') its = its.filter(function (it) { return it.id === 'pain-' + l.id; });
    if (type === 'checkin' || type === 'nocheckin' || type === 'quiet') its = its.filter(function (it) { return it.id === ({ checkin: 'low-', nocheckin: 'nocheck-', quiet: 'quiet-' })[type] + l.id; });
    if (type === 'stalling') its = [C.get('flat-' + l.id)].filter(Boolean);
    return its[0] || null;
  }
  function namesOther(label, it, id) { return it.ids.some(function (x) { var l = K.L(x); return x !== id && l && new RegExp('\\b' + l.first + '\\b').test(label); }); }
  function itemsFor(id) { return C.forLifter(id).filter(function (it) { return it.ids.length <= 3 && it.group !== 'good' && !it.routine; }); }
  /* the row's own reason decides the item; a move meant for someone else ("Reply to Tom" in Callum's row) is never offered */
  function rowAct(r) {
    var why = r.reasons[0], grp = GRP[why && why.type], own = why && why.itemId ? C.get(why.itemId) : null;
    if (own) {
      var od = doneOf(own.id);
      if (od) return { it: own, a: actOf(own, od.act) || { id: od.act, label: doneLabel(own, od) }, done: od };
      var pa = own.acts.filter(function (x) { return x.kind === 'primary' && !namesOther(x.label, own, r.id); })[0] || own.acts.filter(function (x) { return !namesOther(x.label, own, r.id); })[0];
      if (pa) return { it: own, a: pa, done: null };
    }
    var its = itemsFor(r.id).filter(function (it) { return it.group === grp; });
    var ordered = its.filter(function (it) { return it.ids.length === 1; }).concat(its.filter(function (it) { return it.ids.length > 1; }));
    for (var i = 0; i < ordered.length; i++) {
      var it = ordered[i], d = doneOf(it.id);
      if (d && !namesOther(doneLabel(it, d), it, r.id)) return { it: it, a: actOf(it, d.act) || { id: d.act, label: doneLabel(it, d) }, done: d };
      var a = it.acts.filter(function (x) { return !namesOther(x.label, it, r.id); })[0];
      if (a) return { it: it, a: a, done: null };
    }
    return null;
  }
  function fixOf(x) { return x ? { itemId: x.it.id, actId: x.a.id, label: x.done ? doneLabel(x.it, x.done) : x.a.label, short: x.done ? doneLabel(x.it, x.done) : (x.a.short || x.a.label), go: x.a.go ? clone(x.a.go) : null } : null; }
  /* the one move for a lifter's own page: their first open item in triage order (an item about several lifters only
     when it is their Needs-you fix), its primary move unless that names someone else */
  function primaryOf(l, r) {
    var its = C.forLifter(l.id).filter(function (it) {
      return !doneOf(it.id) && !it.later && !it.routine && it.group !== 'good' && (it.ids.length === 1 || (r && r.fix && r.fix.it === it));
    });
    for (var i = 0; i < its.length; i++) {
      var it = its[i], pa = it.acts.filter(function (a) { return a.kind === 'primary'; })[0];
      var a = pa && !namesOther(pa.label, it, l.id) ? pa : it.acts.filter(function (x) { return !namesOther(x.label, it, l.id); })[0];
      if (a) return { itemId: it.id, actId: a.id, label: a.label };
    }
    return null;
  }

  /* ================= programs: the view a read sees (the program plus what done items changed) ================= */
  var VNAME = { squat: { Competition: 'Squat', Paused: 'Paused squat', Tempo: 'Tempo squat', Pin: 'Pin squat' }, bench: { Competition: 'Bench', Paused: 'Paused bench', 'Close Grip': 'Close-grip bench', 'Pin Press': 'Pin press', Incline: 'Incline bench' }, deadlift: { Competition: 'Deadlift', Paused: 'Paused deadlift', Deficit: 'Deficit deadlift', RDL: 'Romanian deadlift' } };
  function sentence(t) { return String(t || '').trim().split(/\s+/).map(function (w, i) { return !i ? w.charAt(0).toUpperCase() + w.slice(1) : /^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase(); }).join(' '); }
  function nameOf(e) { return (MAIN[e.lift] && VNAME[e.lift] && VNAME[e.lift][e.variant || 'Competition']) || sentence(e.title); }
  function setsIn(exs) { var k = 0; (exs || []).forEach(function (e) { e.sets.forEach(function (s) { if (!s.extra) k++; }); }); return k; }
  /* sets that read the same fold into one line: "2 × 5 @7" */
  function groupsOf(e) { var gs = []; (e.sets || []).forEach(function (s) { if (s.extra) return; var k = [s.w, s.r, s.rpe, s.rpeHi, s.pct, s.pause, s.tempo, s.off, s.rHi].join('|'), g = gs[gs.length - 1]; if (g && g.k === k) g.sets.push(s); else gs.push({ k: k, sets: [s], w: s.w, r: s.r, rpe: s.rpe, rpeHi: s.rpeHi, pct: s.pct, pause: s.pause, tempo: s.tempo, off: s.off == null ? null : s.off, rHi: s.rHi == null ? null : s.rHi }); }); return gs; }
  function exIn(week, dayName, title, occ) {
    var d = week && week.days.filter(function (x) { return x.name === dayName; })[0]; if (!d) return null;
    var k = 0, hit = null; (d.exercises || []).some(function (e) { if (e.title === title && ++k === (occ || 1)) { hit = e; return true; } return false; });
    return hit ? { day: d, ex: hit } : null;
  }
  function occOf(day, ei) { var t = day.exercises[ei].title, k = 0; for (var i = 0; i <= ei; i++) if (day.exercises[i].title === t) k++; return k; }
  function firstOpenDay(week, re) { var out = null; (week ? week.days : []).some(function (d) { if (d.exercises && d.exercises.length && !(d.done > 0) && re.test(d.name)) { out = d; return true; } return false; }); return out; }
  /* an item's effect gives way where the coach wrote something himself: the set must still read as the data had it */
  function untouched(lid, wi, dayName, title, occ, gi, sets) {
    var pl = p0Lifter(lid), pp = pl && pl.program; if (!pp || !pp.weeks[wi]) return false;
    var hit = exIn(pp.weeks[wi], dayName, title, occ); if (!hit) return false;
    var g = groupsOf(hit.ex)[gi]; if (!g || g.sets.length !== sets.length) return false;
    return g.sets.every(function (s, i) { return s.w === sets[i].w && s.r === sets[i].r && s.rpe === sets[i].rpe; });
  }
  function overRowOf(l) { return (l.review ? l.review.rows : []).filter(function (r) { return r.delta >= 1 && r.logged; })[0] || null; }
  function giOf(ex, target) { var gs = groupsOf(ex), i; for (i = 0; i < gs.length; i++) { var g = gs[i]; if (g.r === target.r && g.rpe === target.rpe && (g.w === target.w || !target.w || !g.w)) return i; } return -1; }
  /* the next week's group behind a review row: { sets, wi, day, title, occ, gi } */
  function nextGroupOf(p, row) {
    var cur = p.weeks[p.weekIdx], nxt = p.weeks[p.weekIdx + 1]; if (!cur || !nxt) return null;
    var here = exIn(cur, row.day, row.title, 1); if (!here) return null;
    var gi = giOf(here.ex, row.target); if (gi < 0) return null;
    var there = exIn(nxt, row.day, row.title, 1); if (!there) return null;
    var g = groupsOf(there.ex)[gi]; return g ? { sets: g.sets, wi: p.weekIdx + 1, day: row.day, title: row.title, occ: 1, gi: gi } : null;
  }
  function setLoad(l, p, row, kg, only) { var g = nextGroupOf(p, row); if (!g || !untouched(l.id, g.wi, g.day, g.title, g.occ, g.gi, g.sets)) return; var old = g.sets[0] ? g.sets[0].w : null; g.sets.forEach(function (s) { s.w = kg; s.ruled = true; }); if (g.gi === 0) followTop(p, g.wi, g.day, g.title, g.occ, old, kg, null, only); }
  /* top sets lead, later weeks follow (shared.md §4.6), on the program's sets: typed back-offs that day move by the top
     set's ratio; every later week not lifted re-steps the line from the new value by its own week-on-week step (Marcus:
     bench 145 → back-offs 120, week 4 147.5 and back-offs 122.5; 147.5 → 122.5, week 4 150 and 125) */
  function followTop(p, wi, dayName, title, occ, oldW, newW, undoList, only) {
    var out = []; if (!(oldW > 0) || !(newW > 0) || oldW === newW) return out;
    var r25 = function (x) { return Math.round(x / 2.5 + 1e-9) * 2.5; };
    var setW = function (s, w) { if (undoList) { var pw = s.w; undoList.push(function () { s.w = pw; }); } s.w = w; };
    var backs = function (ex, from, to, wk) { groupsOf(ex).forEach(function (g, gi) { if (!gi || !(g.w > 0) || g.off != null) return; var nk = r25(g.w * to / from); if (nk === g.w) return; var was = g.w; g.sets.forEach(function (s2) { if (!s2.done) setW(s2, nk); }); out.push({ week: wk, gi: gi, was: was, now: nk }); }); };
    var hit = exIn(p.weeks[wi], dayName, title, occ); if (!hit) return out;
    backs(hit.ex, oldW, newW, wi + 1);
    for (var k = wi + 1; k < p.weeks.length && !only; k++) {
      var h2 = exIn(p.weeks[k], dayName, title, occ); if (!h2 || h2.day.done > 0) continue;
      var t2 = groupsOf(h2.ex)[0]; if (!t2 || !(t2.w > 0)) continue;
      var was2 = t2.w, nt = r25(newW + (was2 - oldW)); if (nt === was2) continue;
      t2.sets.forEach(function (s3) { if (!s3.done) setW(s3, nt); });
      out.push({ week: k + 1, gi: 0, was: was2, now: nt });
      backs(h2.ex, was2, nt, k + 1);
    }
    return out;
  }
  /* LOGIC-FIX-1 (request #28): the loads a published move worked out on the block (BLOCK.lighter: Tomas's deadlift
     222.5 → 205) land on the program's sets, so the lifter page and the phone read the fix sheet's numbers.
     d.loads = { <week n>: { <row key>: kg } }, recorded on the done entry when the move ran */
  function applyLoads(p, d) {
    if (!d || !d.loads || typeof d.loads !== 'object') return;
    Object.keys(d.loads).forEach(function (wk) {
      var w = p.weeks[Number(wk) - 1], m = d.loads[wk]; if (!w || !m) return;
      var put = [];
      Object.keys(m).forEach(function (key) { var k = parseRowKey(key), hit = k ? exIn(w, k.day, k.title, k.occ) : null; if (!hit || hit.day.done > 0 || !isNum(m[key])) return; var g = groupsOf(hit.ex)[k.line]; if (g) put.push([g.sets, m[key]]); });
      put.forEach(function (x) { x[0].forEach(function (s) { if (!s.done) s.w = x[1]; }); });
    });
  }
  /* LOGIC-FIX-1 (shared.md D12, §4.13): two days in one session on one date, as BLOCK.mergeDays worked it out when the move
     ran (d.merge: { into, days, name, minutes, limit, keep: [{ day, title, occ }], out }): the first day holds the kept lines
     in order, the second is empty (merged), so the lifter's week shows one session inside their hour */
  function mergeEffect(week, m) {
    if (!week || !m || !Array.isArray(m.days) || m.days.length < 2 || !Array.isArray(m.keep)) return;
    var A = week.days.filter(function (x) { return x.name === m.days[0]; })[0], Bd = week.days.filter(function (x) { return x.name === m.days[1]; })[0];
    if (!A || !Bd || A.done > 0 || Bd.done > 0) return;
    var exs = []; m.keep.forEach(function (k) { var hit = exIn(week, k.day, k.title, k.occ); if (hit && exs.indexOf(hit.ex) < 0) exs.push(hit.ex); });
    if (!exs.length) return;
    A.exercises = exs; A.sets = setsIn(exs); A.date = m.into; A.merged = m.name || 'Merged session'; A.minutes = m.minutes; A.limit = m.limit; A.out = (m.out || []).map(function (k) { return k.title; });
    A.changed = 'Moved from ' + K.wd3(day10(m.from && m.from[0]) || m.into) + ' and ' + K.wd3(day10(m.from && m.from[1]) || m.into);
    Bd.exercises = []; Bd.sets = 0; Bd.mergedInto = m.into; Bd.changed = 'Merged into ' + K.wd(m.into);
  }
  function capRpe(week, test, cap, why) { (week ? week.days : []).forEach(function (d) { if (d.done > 0) return; (d.exercises || []).forEach(function (e) { if (!test(e)) return; var hit = false; e.sets.forEach(function (s) { if (!s.done && s.rpe != null && s.rpe > cap) { s.rpe = cap; if (s.rpeHi != null) delete s.rpeHi; hit = true; } }); if (hit) e.changed = why; }); }); }
  var WDI = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
  /* the next squat day still to come, dated in the next 7 days (this program week's, else the next): its squats capped */
  /* the merge a move makes, worked out on a copy of the block (BLOCK.mergeDays), as the program's lines */
  function mergeOf(it, act) {
    var l = K.L(it.ids[0]); if (!l || !l.program) return null;
    var Bk = BLK(), b = null; try { b = Bk.from(clone(programAnswer(l).data)); } catch (e) { return null; }
    var ops = act.ops, mo = ops.filter(function (op) { return op.op === 'merge'; })[0], c = (mo.week || 1) - 1;
    var from = mo.days.map(function (dn) { try { return b.dateOf(c, dn); } catch (e) { return null; } });
    var res = applyOps(b, clone(ops)); if (res.error) return null;
    var md = res.data[ops.indexOf(mo)]; if (!md || !md.rows) return null;
    var occ = {}, key = function (r) { var row = b.rows[r], pk = parseRowKey(row.key); return pk ? { day: pk.day, title: pk.title, occ: pk.occ } : null; };
    var keep = md.rows.map(key).filter(function (k) { if (!k) return false; var id = k.day + '|' + k.title + '|' + k.occ; if (occ[id]) return false; occ[id] = 1; return true; });
    return { week: mo.week || 1, into: mo.into, days: mo.days.slice(), from: from, name: md.name, minutes: md.minutes, limit: md.limit, keep: keep, out: (md.out || []).map(key).filter(Boolean) };
  }
  function capSoon(p, why) {
    var lim = K.add(TODAY, 7), day = null;
    [p.weeks[p.weekIdx], p.weeks[p.weekIdx + 1]].forEach(function (w) { (w ? w.days : []).forEach(function (dd) {
      var iso = dd.date ? day10(dd.date) : null;
      if (day || dd.done > 0 || !iso || iso < TODAY || iso >= lim || !(dd.exercises || []).some(function (e) { return e.lift === 'squat'; })) return;
      day = dd;
    }); });
    if (!day) return false;
    day.exercises.forEach(function (e) { if (e.lift !== 'squat') return; var hit = false; e.sets.forEach(function (s) { if (!s.done && s.rpe != null && s.rpe > 7) { s.rpe = 7; if (s.rpeHi != null) delete s.rpeHi; hit = true; } }); if (hit) e.changed = why; });
    return true;
  }
  function applyEffects(l, p) {
    var dn = C.state.done, cur = p.weeks[p.weekIdx] || null, nxt = p.weeks[p.weekIdx + 1] || null, d, x;
    if ((d = dn['pain-' + l.id]) && cur) {
      if (d.act === 'swap' && (x = firstOpenDay(cur, /deadlift/i))) {
        x.exercises = [{ lift: 'deadlift', variant: 'Block pull', title: 'Block pull', note: '', changed: 'Changed for the low back', sets: [0, 1, 2].map(function () { return { w: 0, r: 5, rpe: 6, done: 0 }; }) }];
        x.sets = 3; x.changed = 'Changed for the low back';
      }
      if (d.act === 'skip') cur.days.forEach(function (dd) { if (dd.done > 0 || !dd.exercises) return; var keep = dd.exercises.filter(function (e) { return e.lift !== 'deadlift'; }); if (keep.length !== dd.exercises.length) { dd.exercises = keep; dd.sets = setsIn(keep); dd.changed = 'Deadlifts off this week'; } });
    }
    if ((d = dn['over-' + l.id]) && (d.act === 'rule' || d.act === 'hold')) { x = overRowOf(l); if (x) setLoad(l, p, x, isNum(d.kg) ? d.kg : d.act === 'rule' ? (x.suggest ? x.suggest.kg : x.logged.w) : x.logged.w, !!(d.choices && d.choices.scope === 'week')); }
    if ((d = dn['write-weeks']) && d.act === 'pub') { var it = C.get('write-weeks'); if (it && it.ids.indexOf(l.id) >= 0) (l.review ? l.review.rows : []).forEach(function (r) { if (r.can && r.suggest && r.next) setLoad(l, p, r, r.suggest.kg); }); }
    if ((d = dn['drift-' + l.id]) && d.act === 'hold' && cur && nxt) {
      nxt.days.forEach(function (nd) { var cd = cur.days.filter(function (q) { return q.name === nd.name; })[0]; if (!cd) return; (nd.exercises || []).forEach(function (e, ei) { if (!MAIN[e.lift]) return; var occ = occOf(nd, ei), ce = exIn(cur, nd.name, e.title, occ); if (!ce) return; var cg = groupsOf(ce.ex); groupsOf(e).forEach(function (g, gi) { if (cg[gi] && cg[gi].w && untouched(l.id, p.weekIdx + 1, nd.name, e.title, occ, gi, g.sets)) g.sets.forEach(function (s) { s.w = cg[gi].w; }); }); e.changed = 'Loads held at this week’s'; }); });
    }
    if ((d = dn['words-' + l.id]) && cur) {
      if (d.act === 'move') {
        /* the session on the day they named moves to the day they asked for, in the same week (Kofi's Deadlift Day, Friday
           13 → Saturday 14); a session with no day yet in that day's place takes the asked day of this week */
        var msg = (l.messages || []).filter(function (m) { return !m.me; }).slice(-1)[0], mv = msg && /move (\w+) to (\w+)/i.exec(msg.body || '');
        if (mv) {
          var from = WDI[mv[1].slice(0, 3).toLowerCase()], to = WDI[mv[2].slice(0, 3).toLowerCase()], trn = cur.days.filter(function (q) { return q.exercises && q.exercises.length; });
          var dd = from == null ? null : trn.filter(function (q) { return q.date && !(q.done > 0) && (K.d(day10(q.date)).getDay() + 6) % 7 === from; })[0] || null, iso = null, was = null;
          if (dd && to != null) { was = day10(dd.date); iso = K.add(was, to - from); }
          else { var slot = { 0: 0, 2: 1, 4: 2 }[from]; dd = slot != null ? trn[slot] : null; if (dd && !dd.date && !(dd.done > 0) && to != null) iso = K.add(K.monday(TODAY), to); }
          if (dd && iso) { dd.date = iso; dd.changed = was ? 'Moved from ' + K.wd(was) + ' to ' + K.wd(iso) : 'Moved to ' + K.wd(iso); }
        }
      }
      /* the cap lands on the next squat day still to come in the next 7 days (this week's, else next week's: Mei's squat day
         this week is done, so Sunday's), the day the drafted words name; with none dated, this week's squats as before */
      if (d.act === 'cap' && !capSoon(p, 'Capped at RPE 7')) capRpe(cur, function (e) { return e.lift === 'squat'; }, 7, 'Capped at RPE 7 this week');
    }
    if ((d = dn['low-' + l.id]) && d.act === 'light') {
      /* LOGIC-FIX-4 (walk 2, Tomas): the missed session the act moves (moveDay, this week) lands on its new day first */
      var lit = C.get('low-' + l.id), la = lit && actOf(lit, 'light');
      ((la && la.ops) || []).forEach(function (op) { if (op.op !== 'moveDay' || !cur) return; var md = cur.days.filter(function (q) { return q.name === op.day; })[0]; if (!md || md.done > 0) return; var was0 = md.date ? day10(md.date) : null; md.date = op.to; md.changed = was0 ? 'Moved from ' + K.wd(was0) + ' to ' + K.wd(op.to) : 'Moved to ' + K.wd(op.to); });
      applyLoads(p, d); capRpe(cur, function (e) { return !!MAIN[e.lift]; }, 7, 'Top sets capped at RPE 7');
    }
    if ((d = dn['busy-' + l.id]) && d.act === 'ok' && cur && l.request && l.request.assign) {
      var asg = l.request.assign, lastIso = null, trn2 = cur.days.filter(function (q) { return q.exercises && q.exercises.length; });
      trn2.forEach(function (dd, i) { var a = asg.filter(function (z) { return z.dayIdx === i; })[0], iso = a ? a.date : lastIso; if (a) lastIso = a.date; if (iso && !dd.date && !(dd.done > 0)) { dd.date = iso; dd.changed = 'Moved to ' + K.wd(iso); } });
      mergeEffect(cur, d.merge);
    }
    if ((d = dn['quiet-' + l.id]) && d.act === 'pause') p.paused = true;
    /* LOGIC-FIX-4 (walk 2, Dev): "Swap in paused back-offs" reaches the program as the act's ops say: from its week on (weeks
       not lifted), the bench's back-offs paused a second; with no back-offs written, 2 × 5 paused, 15% off the top set, added
       under it. The top sets stay as written */
    if ((d = dn['flat-' + l.id]) && d.act === 'swap') {
      var fit = C.get('flat-' + l.id), fa = fit && actOf(fit, 'swap'), fop = fa && fa.ops && fa.ops[0];
      if (fop) for (var fwi = Math.max(fop.week - 1, p.weekIdx + 1); fwi < p.weeks.length; fwi++) {
        var fd = p.weeks[fwi].days.filter(function (q) { return q.name === fop.day; })[0], fe = fd && !(fd.done > 0) ? (fd.exercises || []).filter(function (e) { return e.lift === 'bench'; })[0] : null;
        if (!fe) continue;
        var fg = groupsOf(fe);
        if (fg.length > 1) fg.forEach(function (g, gi) { if (gi < 1) return; g.sets.forEach(function (s) { if (!s.done) s.pause = 1; }); });
        else { fe.sets.push({ w: 0, r: 5, off: 15, pause: 1, done: 0 }, { w: 0, r: 5, off: 15, pause: 1, done: 0 }); fd.sets = setsIn(fd.exercises); }
        fe.changed = 'Paused back-offs from week ' + fop.week;
      }
    }
    if ((d = dn['flat-' + l.id]) && d.act === 'pause' && nxt) nxt.days.forEach(function (nd) { (nd.exercises || []).forEach(function (e) { if (!MAIN[e.lift]) return; groupsOf(e).forEach(function (g, gi) { if (gi < 1) return; g.sets.forEach(function (s) { s.pause = 2; if (s.w) s.w = K.round(s.w * 0.925); }); e.changed = 'Back-offs paused, 7.5% lighter'; }); }); });
    return p;
  }
  function prog(l) { return cached('prog:' + l.id, function () { return l.program ? applyEffects(l, clone(l.program)) : null; }); }
  function weekOf(p, off) { return p ? p.weeks[p.weekIdx + (off || 0)] || null : null; }
  function sessionsOf(p) { var w = weekOf(p); return w ? w.days.filter(function (d) { return d.sets || (d.exercises && d.exercises.length); }) : []; }
  function sesState(d) { return d.done >= d.sets && d.sets ? 'done' : d.done ? 'part' : 'come'; }

  /* ================= the roster model (one per version) ================= */
  var FILTERS = [
    ['all', 'All', function () { return true; }],
    ['need', 'Needs you', function (r) { return r.group === 'need'; }],
    ['watch', 'Keep an eye on', function (r) { return r.base === 'watch'; }],   /* spec C: an invite not taken after 48 hours is watched too */   /* a seen one stays in its place as a done row (request #32) */
    ['ok', 'On track', function (r) { return r.group === 'ok'; }],
    ['new', 'No program', function (r) { return !r.l.program && r.stage !== 'invited'; }],   /* spec C: an invited lifter is in Invited (FTC §13) */
    ['health', 'Pain or low recovery', function (r) { return r.lowRec; }],
    ['meet', 'Meet in 8 weeks', function (r) { return r.meetSoon; }],
    ['msg', 'Unread messages', function (r) { return r.unread > 0; }],
    ['behind', 'Behind on sessions', function (r) { return r.missed > 0; }],   /* their program week's sessions, which can start before Monday (Jonah's is 2 to 6 Nov) */
    ['stalled', 'Not getting stronger', function (r) { return r.stalled; }],
    ['harder', 'Finding it harder', function (r) { return r.harder; }]
  ];
  var TABS = ['all', 'need', 'watch', 'ok', 'new'];
  var PREFER = { health: ['pain', 'readiness', 'checkin', 'nocheckin'], msg: ['message', 'formcheck', 'note'], behind: ['busy', 'quiet', 'never'], stalled: ['stalling'], harder: ['overshoot', 'drift'], meet: ['meetday', 'weight'] };
  function fOf(k) { return FILTERS.filter(function (f) { return f[0] === k; })[0] || null; }
  function model() {
    return cached('model', function () {
      var behind = D.week.behind || [];
      var rows = D.lifters.map(function (l) {
        var p = prog(l), w = l.week, m = l.meet, types = TYPES[l.id] || [];
        var ses = sessionsOf(p), sesDone = ses.filter(function (d) { return sesState(d) === 'done'; }).length;
        var r = { l: l, id: l.id, name: l.name, tier: TIER[l.id] == null ? 9 : TIER[l.id], ord: ORD[l.id] == null ? 999 : ORD[l.id], h: health(l),
          planned: ses.length, done: sesDone, missed: behind.indexOf(l.id) >= 0 && sesDone < ses.length ? 1 : 0, drift: l.drift ? l.drift.avg : null, driftN: l.drift ? l.drift.n : 0,
          bw: bwNow(l), meetDays: m ? m.days : null, unread: unreadOf(l), types: types };
        r.e1 = {}; LIFTS.forEach(function (k) { r.e1[k] = e1Of(l, k); });
        r.tot = LIFTS.every(function (k) { return r.e1[k] != null; }) ? r1(r.e1.squat + r.e1.bench + r.e1.deadlift) : null;
        r.totShown = r.tot != null ? Math.round(r.e1.squat) + Math.round(r.e1.bench) + Math.round(r.e1.deadlift) : null;
        var ds = LIFTS.map(function (k) { return l.lifts[k] && l.lifts[k].delta; });
        r.chg0 = ds.every(function (x) { return x != null; }) ? r1(ds[0] + ds[1] + ds[2]) : null;   /* the data's: the stalled rule reads it */
        r.chg = chgOf(l);   /* to the decimal, as the three cards add up (LOGIC-FIX-3: the cards' own rule) */
        /* LOGIC-FIX-4 (walk 2, Hannah): a block not started yet is on its week 1 (never "week 0"), of every week written (the
           draft's included: 4 weeks written read "of 4", not "of 1") */
        r.weekNo = p ? Math.max(1, p.weekIdx + 1) : null; r.weeks = p ? Math.max(w && l.program && w.total ? w.total : p.weeks.length, drafts[l.id] && Array.isArray(drafts[l.id].weeks) ? drafts[l.id].weeks.length : 0) : null;
        r.stalled = types.indexOf('stalling') >= 0 || LIFTS.some(function (k) { return l.lifts[k] && l.lifts[k].delta != null && l.lifts[k].delta < 0; }) || (r.tot != null && r.chg0 === 0);
        r.harder = r.drift != null && r.drift >= 0.3;
        r.lowRec = r.h.kind === 'pain' || r.h.kind === 'low';
        r.meetSoon = !!(m && m.days <= 56);
        /* overview-lifters §9.1: need = a tier 0 or 1 reason (a lifter with no program but an intake is tier 1: Hannah);
           new = no program and no intake; a done fix moves a lifter to 'done' (handled today), never to watch */
        /* spec C (FTC §3.4, §13): the stage ladder; an invited lifter is in Invited, and under Keep an eye on once 48 hours pass */
        r.stage = stageOf(l);
        r.base = r.stage === 'invited' ? (types.indexOf('join') >= 0 ? 'watch' : 'invited') : r.tier <= 1 && (p || l.intake) ? 'need' : !p ? 'new' : (r.tier <= 3 || types.indexOf('stalling') >= 0) ? 'watch' : 'ok';
        var seen = {}; r.reasons = [];
        types.forEach(function (t) {
          var x = words(l, t, r.h), it = itemOfType(l, t);
          /* the reason and its context in the act table's words (coach.js, shared.md §5): one place for every page */
          if (it && it.reason && !doneOf(it.id)) { x = x || {}; x.w = it.reason; x.full = x.full || it.reason; x.t = it.tone || x.t; x.ctx = it.context || ''; x.itemId = it.id; x.pop = x.pop || 'msg'; }
          /* FIX-LOGIC (P-OVERVIEW-LIFTERS, FTC §4.2 rule 3): a first block sent is a done row ("First block sent"), never an
             open "No program yet" with no move: the row keeps the item's words and points at its done item */
          else if (it && it.reason && t === 'noprogram' && it.id === 'first-' + l.id && doneOf(it.id)) { x = { w: it.reason, full: it.reason, t: it.tone || 't-write', ctx: '', itemId: it.id, pop: 'week' }; }
          else if (it && it.reason && t === 'offapp' && doneOf(it.id)) { x = { w: it.reason, full: it.reason, t: it.tone || 't-write', ctx: it.context || '', itemId: it.id, pop: 'week' }; }
          if (x && !seen[x.w]) { seen[x.w] = 1; x.type = t === 'noprogram' && it && it._stage === 'send' ? 'first' : t; r.reasons.push(x); }   /* FP §6.6: a first block written, not sent */
        });
        /* shared.md §4.17 (request #25): "Not pain" settles the pain reading of an unanswered note: the words stay the reason,
           in the words tone, and the lifter leaves tier 0 */
        if (ST.notPain[l.id]) { r.reasons.forEach(function (x) { if (x.t === 't-pain' && x.type !== 'pain') x.t = 't-msg'; }); if (r.tier === 0) r.tier = 1; }
        /* shared.md §6.7 (request #29): a pain the coach recorded (PL.lifters.pain, the board's pain popover) is the one pain
           record every page reads: "Left knee 4/10, squat" leads, in place of the words it came from */
        var rp = painOpen(l).filter(function (q) { return q.from === 'coach' || q.from === 'meet'; })[0];
        if (rp) {
          var pw0 = upper1(rp.part) + ' ' + n(rp.sev) + '/10' + (rp.lift ? ', ' + String(rp.lift).toLowerCase() : ''), pi = -1;
          r.reasons.forEach(function (x, i) { if (pi < 0 && (x.t === 't-pain' || x.type === 'pain')) pi = i; });
          if (pi >= 0) { var px = r.reasons[pi]; px.was = px.w; px.w = pw0; px.full = pw0; px.t = 't-pain'; if (pi > 0) { r.reasons.splice(pi, 1); r.reasons.unshift(px); } }
          else r.reasons.unshift({ t: 't-pain', w: pw0, full: pw0, pop: 'health', type: 'pain', ctx: '' });
        }
        r.fix = r.base === 'need' ? rowAct(r) : null;
        r.openNeed = r.base === 'need' && C.forLifter(l.id).some(function (it) { return it.ids.length === 1 && !it.later && !it.routine && it.group !== 'good' && !doneOf(it.id); });
        r.group = r.base === 'need' && r.fix && r.fix.done && !r.openNeed ? 'done' : r.base;
        /* request #32 (overview-lifters §6.10): a Keep-an-eye-on lifter the coach saw today ("Seen, nothing to change", or a
           write for them today) is handled too, so the walk ends "All caught up. 16 done today." */
        if (r.base === 'watch') { var sk = ST.seenOk[l.id], tw = sk ? null : watchTouched(l.id); if (sk || tw) { r.group = 'done'; r.watchDone = sk ? { at: sk.at, label: 'Seen, nothing to change' } : tw; } }
        r.ring = r.h.kind === 'pain' ? 'pain' : m && m.days <= 14 ? 'meet' : null;
        return r;
      });
      var R = {}; rows.forEach(function (r) { R[r.id] = r; });
      var needList = rows.filter(function (r) { return r.base === 'need'; }).sort(function (a, b) { return a.tier - b.tier || a.ord - b.ord; });
      return { rows: rows, R: R, needList: needList };
    });
  }
  function statusOf(r, f) {
    var list = r.reasons.slice(), pref = PREFER[f];
    if (f === 'meet' && r.l.meet && !list.some(function (x) { return x.type === 'meetday'; })) list.unshift({ t: 't-meet', w: meetCount(r.l.meet), pop: 'meet', type: 'meet' });
    if (f === 'health' && r.lowRec && !list.some(function (x) { return pref.indexOf(x.type) >= 0; })) list.unshift({ t: r.h.tone, w: r.h.text, pop: 'health', type: 'health' });
    if (pref) list.sort(function (a, b) { return (pref.indexOf(a.type) < 0) - (pref.indexOf(b.type) < 0); });
    if (r.group === 'ok' && !pref) return null;
    return list.length ? list[0] : null;
  }
  function reasonOut(x) { return x ? { type: x.type, tone: x.t, text: x.w, full: x.full || x.w, pop: x.pop } : null; }
  var SORTS = ['name', 'st', 'prog', 'week', 'squat', 'bench', 'deadlift', 'tot', 'chg', 'meet'];
  function sortVal(r, key) {
    switch (key) {
      case 'name': return r.name; case 'st': return r.tier * 1000 + r.ord; case 'prog': return r.weeks ? r.weekNo / r.weeks : null;
      case 'week': return r.planned ? r.done / r.planned : null; case 'squat': case 'bench': case 'deadlift': return r.e1[key];
      case 'tot': return r.tot; case 'chg': return r.chg; case 'meet': return r.meetDays;
    }
    return null;
  }
  /* a key sorts up (A to Z, most urgent first, smallest first, soonest meet first); a leading minus sorts down.
     Empty values go last either way. */
  function listRow(r, f) {
    var l = r.l, p = prog(l), m = l.meet;
    var sw = stageWords(l, r.stage), rsn = reasonOut(statusOf(r, f));
    return { id: r.id, name: r.name, first: l.first, ini: l.ini, hue: l.hue, ring: r.ring, group: r.stage === 'invited' && r.group !== 'done' ? 'invited' : r.group, reason: rsn,
      stage: r.stage, stageText: r.stage === 'training' || r.stage === 'none' ? (rsn ? rsn.text : '') : sw.text, weekText: r.stage === 'training' ? weekLine(l) : '', lastTop: lastTopOf(l),
      program: p ? { name: p.name, week: r.weekNo, of: r.weeks } : null, week: { done: r.done, of: r.planned }, e1: { squat: r.e1.squat, bench: r.e1.bench, deadlift: r.e1.deadlift },
      total: r.tot, totalShown: r.totShown, change: r.chg, meet: m ? { name: m.name, days: m.days } : null, health: { kind: r.h.kind, tone: r.h.tone, text: r.h.text, sub: r.h.sub },
      unread: r.unread, behind: r.missed > 0, drift: r.drift, bw: r.bw };
  }

  /* ================= a lifter's week (round-4 lifter.html sessions(), status(), the week table) ================= */
  /* a session's day, one rule for every read (the lifter's week, Today, the Training chart, a thread's week strip): the
     day the program gives it; a lifted session with no day takes the day its sets carry; nothing is guessed, so a page
     never calls a session "today" that Today does not list. A day stored with a time is a session under way (live): it
     started then. A session the block's end (a meet) cut off before it had a day is notLifted. */
  function sessionDates(l, p) {
    var wk = p.weeks[p.weekIdx], out = {}; if (!wk) return out;
    var ended = (l.meet && l.meet.days === 0) || (p.meetDate && day10(p.meetDate) <= TODAY);
    wk.days.forEach(function (d, di) {
      if (!d.exercises || !d.exercises.length) return;
      var all = 0, done = 0, on = null; d.exercises.forEach(function (e) { e.sets.forEach(function (s) { if (s.extra) return; all++; if (s.done) { done++; if (s.on && (!on || day10(s.on) > on)) on = day10(s.on); } }); });
      var s = { di: di, date: d.date ? day10(d.date) : null, fixed: !!d.date, all: all, done: done, on: on, live: !!(l.live && d.date && String(d.date).length > 10) };
      if (!s.date && done) s.date = on || TODAY;
      if (!s.date && !done && ended) s.notLifted = true;
      /* programs.md §11.4: a day with no stored date takes the one dating rule (Nina: Mon 9, Wed 11, Fri 13) */
      if (!s.date && !s.notLifted) s.date = dayDateOf(l, p.weekIdx, d.name);
      out[di] = s;
    });
    return out;
  }
  function topOf(day) { var t = K.topSet(day); if (!t) return null; return { lift: MAIN[t.ex.lift] ? t.ex.lift : null, exercise: t.ex.title, w: t.set.w || null, r: t.set.r, rpe: t.set.rpe == null ? null : t.set.rpe, felt: t.set.felt == null ? null : t.set.felt, done: !!t.set.done }; }
  function rxText(g, nSets) { return nSets + ' × ' + g.r + (g.rHi ? '-' + g.rHi : '') + (g.rpe != null ? ' @' + n(g.rpe) + (g.rpeHi ? '-' + n(g.rpeHi) : '') : '') + (g.pct ? ' ' + n(g.pct) + '%' : '') + (g.off != null ? ' −' + n(g.off) + '%' : ''); }
  var SEV = { over: 3, hard: 2, easy: 1 };
  function feltOut(g) {
    var vs = g.sets.filter(function (s) { return s.done && s.felt != null; }); if (!vs.length) return null;
    var worst = '', easy = true; vs.forEach(function (s) { var f = K.feltOf(s); if (f !== 'easy') easy = false; if (f && f !== 'easy' && (SEV[f] || 0) > (SEV[worst] || 0)) worst = f; });
    var kind = g.rpe == null ? 'none' : worst || (easy ? 'easy' : '');
    var vals = uniq(vs.map(function (s) { return s.felt; }));
    /* shared.md §8's felt words (LOGIC-FIX-2, Settings' request): "8, as written", "9.5, 1.5 harder", "7.5, 0.5 easier",
       "No RPE"; the set furthest from what was written speaks for the line */
    var far = 0; if (g.rpe != null) vs.forEach(function (s) { var d0 = s.felt - g.rpe; if (Math.abs(d0) > Math.abs(far)) far = d0; });
    far = Math.round(far * 10) / 10;
    var said = kind === 'none' ? 'no RPE written' : Math.abs(far) < 0.25 ? 'as written' : far > 0 ? n(far) + ' harder' : n(-far) + ' easier';
    return { kind: kind, values: vals, diff: g.rpe == null ? null : far, text: 'Felt ' + vals.map(n).join(', ') + ', ' + said };
  }
  function reviewRowsOf(l, p) { return l.review && p && l.review.last === p.weekIdx ? (l.review.rows || []) : []; }
  function suggestWhy(r) {
    var s = r.suggest, lg = r.logged, rules = D.rules || [];
    if (!Array.isArray(rules)) rules = [];
    if (s.dir === 'down') return 'Felt ' + n(lg.rpe) + ' where you wrote ' + n(r.target.rpe) + '. ' + (rules.filter(function (t) { return /9\.5|harder/.test(t); })[0] || '5% off next week') + '.';
    if (s.dir === 'up') return 'Felt ' + n(lg.rpe) + '. ' + (rules.filter(function (t) { return /7\.5|easier/.test(t); })[0] || '2.5 kg more next week') + '.';
    var d = s.kg - (lg.w || 0);
    return 'Lifted ' + n(lg.w) + ' × ' + lg.r + ' at RPE ' + n(lg.rpe) + (lg.rpe != null && r.target.rpe != null && lg.rpe <= r.target.rpe ? ', as written' : '') + (d > 0 ? ': ' + n(d) + ' kg more next week' : ': the same next week') + '.';
  }
  function decisionsOf(id) { return (ST.decisions[id] = ST.decisions[id] || {}); }
  /* the block the lifter's week and the Sheet both read (the shared draft, else the program as the reads see it, done
     items included), its rows by key, the week to write and the engine's drafts for it. null without block.js */
  function engineOf(l) {
    if (!BLK() || !l.program) return null;
    return cached('eng:' + l.id, function () {
      var Bk = BLK(), g = programAnswer(l).data, b = null;
      if (!g) return null;
      try { b = Bk.from(g); } catch (e) { b = null; }
      if (!b) return null;
      var out = { b: b, idx: {}, c: b.writeCol(), drafts: {} };
      b.rows.forEach(function (row, r) { out.idx[row.key] = r; });
      if (out.c >= 0) { try { out.drafts = Bk.draft(b, out.c) || {}; } catch (e) { out.drafts = {}; } }
      return out;
    });
  }
  /* a set's line as block.js reads it (sheet-spec §5: consecutive sets written the same are one line): the line of the
     store's group gi, for the block row key "day|title|occurrence|line" */
  function blockLine(e, gi) {
    var sg = groupsOf(e)[gi], li = -1, prev = null; if (!sg) return gi;
    for (var i = 0; i < e.sets.length; i++) {
      var s = e.sets[i]; if (s.extra) continue;
      var k = [s.w || 0, s.r, s.rpe == null ? null : s.rpe, s.rpeHi == null ? null : s.rpeHi, s.pct == null ? null : s.pct].join('|');
      if (k !== prev) { li++; prev = k; }
      if (s === sg.sets[0]) return li;
    }
    return gi;
  }
  function blockKey(d, ei, gi) { var e = d.exercises[ei]; return d.name + '|' + e.title + '|' + occOf(d, ei) + '|' + blockLine(e, gi); }
  /* an exercise's top line as lifted, else as written: what a back-off written as "-12%" is taken from */
  function topLoadOf(l, e) {
    var g0 = groupsOf(e)[0]; if (!g0) return null;
    var dn = g0.sets.filter(function (s) { return s.done && s.w > 0; }), lift = MAIN[e.lift] ? e.lift : null, e1 = lift && l.lifts[lift] ? l.lifts[lift].e1 : null;
    if (dn.length) return Math.max.apply(null, dn.map(function (s) { return s.w; }));
    if (g0.w && g0.off == null) return g0.w;
    return g0.rpe != null && e1 ? K.load(e1, g0.r, g0.rpe) : null;
  }
  /* the rule's item (over-<id>): the row of this week it is about, and how it was decided */
  function overDecided(l, wi, d, e, g) {
    var p = l.program, ov = overRowOf(l), it = C.get('over-' + l.id), dn = it ? doneOf(it.id) : null;
    if (!ov || !dn || (dn.act !== 'rule' && dn.act !== 'hold') || !p || wi !== p.weekIdx) return null;
    if (ov.day !== d.name || ov.title !== e.title || !ov.target || ov.target.r !== g.r || ov.target.rpe !== g.rpe || !(ov.target.w === g.w || !ov.target.w || !g.w)) return null;
    return { how: dn.act === 'rule' ? 'use' : 'hold', kg: dn.act === 'rule' && ov.suggest ? ov.suggest.kg : ov.logged.w, at: dn.at || null, via: 'item', itemId: it.id };
  }
  /* the write that decided a row: its undo token while the write log holds it */
  function decToken(id, key, itemId) {
    for (var i = LOG.length - 1; i >= 0; i--) { var rec = LOG[i]; if (rec.keys.indexOf('decide:' + id + ':' + key) >= 0 || (itemId && rec.items.indexOf(itemId) >= 0)) return rec.t; }
    return null;
  }
  /* one program everywhere: a write on the program lands in the shared draft too (the block Builder and Sheet read), on
     week wi's cell of the block line bkey. fn changes the cell; a sent week stays sent, and its record of what the lifter
     has follows (the program's week holds the change already). prior: the cell before the write, as its args keep it, so
     an undo after a reload (the write replayed onto a draft that already holds it) still puts the cell back. Answers
     { before, undo } (undo leaves a cell the coach has written since), or null when nothing moved */
  function keepWas(wk, bkey, cell) { if (wk.was && wk.was[bkey] !== undefined) { var Bk = BLK(); if (Bk) wk.was[bkey] = Bk.text(Bk.cellOf(cell)); else { wk.was = null; wk.taken = false; } } }
  function draftCell(id, wi, bkey, fn, prior) {
    var dr = drafts[id]; if (!dr || !Array.isArray(dr.rows) || !Array.isArray(dr.weeks)) return null;
    var wk = dr.weeks[wi], row = dr.rows.filter(function (r) { return r.key === bkey; })[0]; if (!wk || !row || !row.cells) return null;
    var cell = row.cells[wk.uid]; if (!cell || cell.lifted) return null;
    var now = clone(cell), before = prior != null ? clone(prior) : now;
    if (fn(cell) === false || JSON.stringify(cell) === JSON.stringify(before)) { row.cells[wk.uid] = now; return null; }
    keepWas(wk, bkey, cell);
    var after = clone(cell);
    return { before: before, undo: function () {
      var d2 = drafts[id], w2 = d2 && d2.weeks && d2.weeks[wi], r2 = d2 && d2.rows && d2.rows.filter(function (r) { return r.key === bkey; })[0];
      if (!w2 || !r2 || JSON.stringify(r2.cells[w2.uid]) !== JSON.stringify(after)) return;
      r2.cells[w2.uid] = clone(before); keepWas(w2, bkey, before);
    } };
  }
  /* a set's load, reps and RPE written into a block cell: a load of 0 is "worked out" (no typed load) */
  function putSet(cell, w, r, rpe) { if (w > 0) cell.w = w; else delete cell.w; if (r != null) cell.r = r; if (rpe !== undefined) { if (rpe == null) delete cell.rpe; else cell.rpe = rpe; } }
  /* what done items changed in a program (before → after), landed in the draft where the draft still says what the
     program said: loads, reps, RPE and pauses on lines still to come. Answers the ways back */
  function mirrorProg(l, before, after) {
    var undos = []; if (!drafts[l.id] || !before || !after) return undos;
    after.weeks.forEach(function (aw, wi) {
      var bw = before.weeks[wi]; if (!bw || wi < Math.max(0, after.weekIdx)) return;
      aw.days.forEach(function (ad, di) {
        var bd = bw.days[di]; if (!bd || bd.name !== ad.name || !ad.exercises || !bd.exercises || ad.done > 0) return;
        ad.exercises.forEach(function (ae, ei) {
          var be = bd.exercises[ei]; if (!be || be.title !== ae.title) return;
          var ag = groupsOf(ae), bg = groupsOf(be); if (ag.length !== bg.length) return;
          ag.forEach(function (g, gi) {
            var o = bg[gi]; if ((o.w || 0) === (g.w || 0) && o.r === g.r && o.rpe === g.rpe && (o.pause || 0) === (g.pause || 0)) return;
            var u = draftCell(l.id, wi, blockKey(bd, ei, gi), function (cell) {
              var typed = o.w > 0 && o.pct == null && o.off == null ? o.w : null;
              if ((cell.w == null ? null : cell.w) !== typed || cell.r !== o.r || (cell.rpe == null ? null : cell.rpe) !== (o.rpe == null ? null : o.rpe)) return false;   /* the coach wrote it himself */
              putSet(cell, g.w || 0, g.r, g.rpe == null ? null : g.rpe);
              if (g.pause) cell.pause = g.pause;
            });
            if (u) undos.push(u.undo);
          });
        });
      });
    });
    return undos;
  }
  /* the program as the reads see it, for each of these lifters who has a draft: taken before a move, compared after */
  function viewsOf(ids) { var o = {}; (ids || []).forEach(function (id) { var l = K.L(id); if (l && l.program && drafts[id]) o[id] = applyEffects(l, clone(l.program)); }); return o; }
  function mirrorViews(before) {
    var undos = [], ids = [];
    Object.keys(before).forEach(function (id) { var l = K.L(id), u = mirrorProg(l, before[id], applyEffects(l, clone(l.program))); if (u.length) { undos = undos.concat(u); ids.push(id); } });
    return { undos: undos, ids: ids };
  }
  function weekView(l, off) {
    var p = prog(l);
    if (!p) return { n: 0, of: 0, sessions: [], rows: [], meet: null, program: null };
    var wi = p.weekIdx + off, wk = p.weeks[wi];
    if (!wk) return null;
    var dates = sessionDates(l, p), mon = K.add(K.monday(TODAY), 7 * off), rr = off === 0 ? reviewRowsOf(l, p) : [], nxt = p.weeks[wi + 1] || null, dec = ST.decisions[l.id] || {}, eng = engineOf(l);
    var ss = [];
    wk.days.forEach(function (d, di) {
      if (!d.exercises || !d.exercises.length) return;
      var all = 0, done = 0; d.exercises.forEach(function (e) { e.sets.forEach(function (s) { if (s.extra) return; all++; if (s.done) done++; }); });
      var x = dates[di], date, fixed = !!d.date, notLifted = false, live = false;
      if (off === 0) { date = x ? x.date || null : null; notLifted = !!(x && x.notLifted); live = !!(x && x.live); }
      else if (d.date) date = day10(d.date);
      else {
        /* LOGIC-FIX-3 (overview c03, programs.md F9 "this week only"): a day this week's fix moved or merged is not the
           pattern of the weeks after it: they keep the date the program gives this week's day, a week on */
        var raw0 = l.program && l.program.weeks[p.weekIdx] ? l.program.weeks[p.weekIdx].days[di] : null, eff0 = p.weeks[p.weekIdx] ? p.weeks[p.weekIdx].days[di] : null;
        var movedHere = !!(eff0 && raw0 && eff0.name === d.name && (eff0.mergedInto || eff0.merged || day10(eff0.date) !== day10(raw0.date)));
        date = movedHere ? K.add(raw0.date ? day10(raw0.date) : dayDateOf(l, p.weekIdx, d.name), 7 * off) : x && x.date ? K.add(x.date, 7 * off) : null;
      }
      var state = all && done === all ? 'done' : done ? 'part' : notLifted || (date && date < TODAY) ? 'missed' : 'come';
      var se = { idx: di, name: d.name, date: date, fixed: fixed, state: state, done: done, of: all, top: topOf(d), changed: d.changed || null, notLifted: notLifted, live: live };
      if (d.merged) { se.title = d.merged; se.minutes = isNum(d.minutes) ? d.minutes : null; se.limit = isNum(d.limit) ? d.limit : null; se.lifts = (d.exercises || []).filter(function (e) { return MAIN[e.lift]; }).map(function (e) { return e.lift; }).filter(function (x, i, a) { return a.indexOf(x) === i; }); se.out = (d.out || []).slice(); }
      if (notLifted) se.why = 'meet';
      ss.push(se);
    });
    ss.sort(function (a, b) { var x = a.date || '9999', y = b.date || '9999'; return x < y ? -1 : x > y ? 1 : a.idx - b.idx; });
    var rows = [];
    ss.forEach(function (s) {
      var d = wk.days[s.idx], past = (s.date && s.date < TODAY) || s.done > 0;
      d.exercises.forEach(function (e, ei) {
        var occ = occOf(d, ei), lift = MAIN[e.lift] ? e.lift : null;
        groupsOf(e).forEach(function (g, gi) {
          var key = 'w' + wi + '.d' + s.idx + '.e' + ei + '.g' + gi, nSets = g.sets.length;
          var rv = rr.filter(function (r) { return r.day === d.name && r.title === e.title && r.target && r.target.r === g.r && r.target.rpe === g.rpe && (r.target.w === g.w || !r.target.w || !g.w); })[0] || null;
          var dn = g.sets.filter(function (q) { return q.done; });
          var lifted = dn.length ? { w: dn[0].w || (rv && rv.logged ? rv.logged.w : null) || null, reps: dn.map(function (q) { return q.rDone != null ? q.rDone : q.r; }), done: dn.length, of: nSets } : null;
          if (lifted) lifted.text = (lifted.w ? n(lifted.w) + ' × ' : '') + lifted.reps.join(', ') + (lifted.done < nSets ? ', ' + (nSets - lifted.done) + ' not logged' : '');
          var e1 = lift && l.lifts[lift] ? l.lifts[lift].e1 : null, load;
          /* the load as written (the app's line: K.load of the e1RM for RPE sets, data.test.mjs 3b); a back-off written
             under the top set ("-12%") from that top set as lifted, else as written */
          if (g.off != null && !(g.w && !dn.length)) { var tl = topLoadOf(l, e), ok0 = tl ? K.round(tl * (1 - g.off / 100)) : null; load = ok0 ? { kg: ok0, kind: 'top', text: 'about ' + n(ok0) + ' kg', off: g.off } : { kg: null, kind: 'feel', text: 'By feel' }; }
          else load = g.w ? { kg: g.w, kind: 'typed', text: n(g.w) + ' kg' } : g.rpe != null && e1 ? { kg: K.load(e1, g.r, g.rpe), kind: 'rpe', text: 'about ' + n(K.load(e1, g.r, g.rpe)) + ' kg' } : g.rpe != null || g.pct != null ? { kg: null, kind: 'feel', text: 'By feel' } : { kg: null, kind: 'none', text: lift ? 'By feel' : 'Bodyweight' };
          /* ONE load per line: a week the engine sent carries the load the lifter's phone planned (planW), and that is the
             load; a week still to come reads the engine's cell, as next week's column does (the Sheet's number). This week's
             lines the data wrote keep the app's line (data.test.mjs 3b) */
          var pw = !g.w && g.off == null ? g.sets.filter(function (q) { return q.planW != null; })[0] : null;
          if (pw) load = { kg: pw.planW, kgHi: pw.planWHi != null ? pw.planWHi : null, kind: 'plan', text: 'about ' + n(pw.planW) + ' kg', src: 'plan' };
          /* LOGIC-FIX-4 (walk 2, Sarah): a line a fix wrote this week (e.changed: block pulls 3 × 5 @6) is the engine's line,
             so the page reads the load the sheet, the toast and the message named (140), not the app's (135) */
          /* a percent line (the team's 3 × 6 at 75%) is the engine's too: the percent of the max in force, never a kilo figure
             the data wrote beside it (Dev's 87.5 against the grid's 82.5) */
          /* FIX-LOGIC (build C walk 2, Jess's week 1): a line with no load of its own and no e1RM in the data (a lifter the desk
             made: her block works its loads from her intake's maxes) reads the engine's cell too, never "By feel" for a bench
             @7 the grid shows as 42.5 */
          else if ((off > 0 || e.changed || g.pct != null || (!g.w && load.kg == null && (g.rpe != null || g.off != null))) && eng && (!g.w || g.pct != null) && !dn.length) {
            var bri = eng.idx[blockKey(d, ei, gi)], bcw = bri != null && eng.b.weeks[wi] ? eng.b.cell(bri, wi) : null;
            if (bcw && bcw.kg != null) load = { kg: bcw.kg, kgHi: bcw.kgHi != null ? bcw.kgHi : null, kind: bcw.kind === 'top' ? 'top' : 'plan', text: 'about ' + n(bcw.kg) + ' kg', src: 'engine', off: g.off == null ? undefined : g.off };
          }
          /* next week: the engine's cell (the Sheet's number, sheet-spec F7), else the program's line */
          var bk = eng ? blockKey(d, ei, gi) : null, br = eng ? eng.idx[bk] : undefined, next = null;
          if (eng && br != null && eng.b.weeks[wi + 1] && nxt) {
            var bc = eng.b.cell(br, wi + 1);
            if (bc && bc.rx && bc.rx.n) next = { w: bc.rx.w != null ? bc.rx.w : 0, r: bc.rx.r, rpe: bc.rx.rpe != null ? bc.rx.rpe : null, n: bc.rx.n, kg: bc.kg != null ? bc.kg : null, kgHi: bc.kgHi != null ? bc.kgHi : null, kind: bc.kind, text: bc.text, rx: clone(bc.rx) };
          }
          /* LOGIC-FIX-4: a line swapped for this week only (Sarah's block pulls) has no next week of its own; next week is
             the line it stood in for (the deadlift on the same day, same line), as the engine writes it */
          if (!next && eng && br != null && e.changed && eng.b.weeks[wi + 1] && nxt) {
            var row0 = eng.b.rows[br], wu0 = eng.b.weeks[wi].uid, wu1 = eng.b.weeks[wi + 1].uid;
            var sub = eng.b.rows.filter(function (x) { return x !== row0 && x.day === row0.day && (x.lift || x.cat) && (x.lift || x.cat) === (row0.lift || row0.cat) && (x.line || 0) === (row0.line || 0) && !(x.cells && x.cells[wu0] && x.cells[wu0].n) && x.cells && x.cells[wu1] && x.cells[wu1].n; })[0];
            var sbi = sub ? eng.b.rows.indexOf(sub) : -1, sc = sbi >= 0 ? eng.b.cell(sbi, wi + 1) : null;
            if (sc && sc.rx && sc.rx.n) next = { w: sc.rx.w != null ? sc.rx.w : 0, r: sc.rx.r, rpe: sc.rx.rpe != null ? sc.rx.rpe : null, n: sc.rx.n, kg: sc.kg != null ? sc.kg : null, kgHi: sc.kgHi != null ? sc.kgHi : null, kind: sc.kind, text: sc.text, rx: clone(sc.rx), name: sub.title || sub.name };
          }
          if (!next) {
            var ne = nxt ? exIn(nxt, d.name, e.title, occ) : null, ng = ne ? groupsOf(ne.ex)[gi] : null;
            next = ng ? { w: ng.w || 0, r: ng.r, rpe: ng.rpe == null ? null : ng.rpe, n: ng.sets.length } : rv && rv.next && off === 0 ? { w: rv.next.w || 0, r: rv.next.r, rpe: rv.next.rpe == null ? null : rv.next.rpe, n: rv.next.n || nSets } : null;
            if (next) { next.kg = next.w || (next.rpe != null && e1 ? K.load(e1, next.r, next.rpe) : null); next.kind = next.w ? 'typed' : next.kg ? 'rpe' : 'feel'; next.kgHi = null; }
          }
          /* the suggestion: the engine's draft for the week to write (BLOCK.draft, the Sheet's), else the app's review */
          var dx = eng && br != null && wi + 1 === eng.c ? eng.drafts[br] : null, sug = null;
          if (dx && next) sug = { kg: dx.kg, dir: dx.kg > dx.keep ? 'up' : dx.kg < dx.keep ? 'down' : 'hold', why: dx.why, from: dx.from, keep: dx.keep, rule: dx.rule || null, src: 'engine' };
          else if (rv && rv.can && rv.suggest) sug = { kg: ruleKg(rv, e.lift), dir: rv.suggest.dir, why: suggestWhy(rv), from: rv.logged ? rv.logged.w : null, keep: rv.next ? rv.next.w || null : null, rule: null, src: 'review' };
          /* decided: what the coach decided on the row here (Use, Keep, a load; Keep through the rule's item says via
             'item'); ruled: Use or Hold done through the rule's item itself (kept apart: a page that reads that from the
             item still undoes it through the item). Both carry the token that takes them back while the log has it */
          var dd = dec[key] ? clone(dec[key]) : null, rl = !dd && off === 0 ? overDecided(l, wi, d, e, g) : null;
          if (dd) { dd.via = dd.itemId ? 'item' : 'store'; dd.undo = decToken(l.id, key, dd.itemId || null); }
          if (rl) rl.undo = decToken(l.id, key, rl.itemId);
          /* the rule's item (over-<id>) is about this line: pages put its Keep and Hold here without reading its evidence */
          var ovr = off === 0 ? overRowOf(l) : null, isRule = !!(ovr && C.get('over-' + l.id) && ovr.day === d.name && ovr.title === e.title && ovr.target && ovr.target.r === g.r && ovr.target.rpe === g.rpe && (ovr.target.w === g.w || !ovr.target.w || !g.w));
          rows.push({ key: key, day: d.name, session: s.idx, date: s.date, exercise: e.title, name: nameOf(e), lift: lift, variant: lift ? e.variant || 'Competition' : null, line: gi, rule: isRule ? 'over-' + l.id : null,
            written: { n: nSets, r: g.r, rHi: g.rHi || null, rpe: g.rpe == null ? null : g.rpe, rpeHi: g.rpeHi || null, pct: g.pct || null, off: g.off == null ? null : g.off, w: g.w || 0, pause: g.pause || null, tempo: g.tempo || null, text: rxText(g, nSets) },
            load: load, lifted: lifted, notLogged: !lifted && past, felt: feltOut(g), next: next, suggest: sug, decided: dd, ruled: rl, changed: e.changed || null });
        });
      });
    });
    var meet = null; if (l.meet && l.meet.date >= mon && l.meet.date <= K.add(mon, 6)) meet = { name: l.meet.name, date: l.meet.date, days: l.meet.days };
    /* the seven days of the lifter's training week, one rule for every page: Monday to Sunday when that holds every dated
       session; else the seven days from the week's first session, when they hold today and every dated session; else
       Monday to Sunday (a week ahead or behind moves by 7 days) */
    var dated = ss.filter(function (x) { return x.date; }).map(function (x) { return x.date; }).sort(), sun = K.add(mon, 6), start = mon;
    if (dated.length && (dated[0] < mon || dated[dated.length - 1] > sun)) { var f0 = dated[0], f6 = K.add(f0, 6), now = K.add(TODAY, 7 * off); if (now >= f0 && now <= f6 && dated[dated.length - 1] <= f6) start = f0; }
    var days7 = []; for (var q = 0; q < 7; q++) days7.push(K.add(start, q));
    return { n: wi + 1, of: p.weeks.length, name: p.name, monday: mon, from: start, days: days7, sessions: ss, rows: rows, meet: meet, next: !!nxt, program: { id: p.id || null, name: p.name, paused: !!p.paused } };
  }
  /* a row key → where its next week lives in DEMO */
  function parseKey(key) { var m = isStr(key) && /^w(\d+)\.d(\d+)\.e(\d+)\.g(\d+)$/.exec(key); return m ? { wi: +m[1], di: +m[2], ei: +m[3], gi: +m[4] } : null; }
  function rowOfKey(l, key) {
    var k = parseKey(key), p = prog(l); if (!k || !p) return null;
    var wv = weekView(l, k.wi - p.weekIdx); if (!wv) return null;
    var row = wv.rows.filter(function (r) { return r.key === key; })[0]; if (!row) return null;
    var vday = p.weeks[k.wi].days[k.di];
    return { row: row, k: k, day: vday.name, title: vday.exercises[k.ei].title, occ: occOf(vday, k.ei) };
  }

  /* ================= threads (round-4 messages.html, ported once) ================= */
  function job(l, type) { return (l.jobs || []).filter(function (j) { return j.type === type && !j.done; })[0] || null; }
  function kindOf(m) { return m.meta && m.meta.type === 'set' ? 'set' : (m.type === 'voice' || (m.meta && m.meta.type === 'voice') || /^Voice note/.test(m.body || '')) ? 'voice' : MSG_TYPES.indexOf(m.type) >= 0 ? m.type : 'text'; }
  var MSG_TYPES = ['text', 'voice', 'video', 'set', 'note', 'change', 'payment', 'cut', 'attempts'];
  function quoted(s) { var m = /“([^”]+)”/.exec(s || ''); return m ? m[1] : ''; }
  function firstSentence(s) { var m = /^(.*?[.!?])(?=\s+[A-Z“]|\s*$)/.exec(String(s || '')); return m ? m[1] : String(s || ''); }
  function changeText(a) { var s = firstSentence(String(a.says || '').replace(/\s*\S+ got: “[^”]*”\s*$/, '')); return /^(Noted|Opens)\b/.test(s) ? '' : s; }
  function replyTarget(it) { for (var i = 0; i < it.ids.length; i++) { var l = K.L(it.ids[i]); if (!l) continue; if (it.acts.some(function (a) { return a.reply != null && new RegExp('\\b' + l.first + '\\b').test(a.label); })) return l.id; } return it.ids[0] || null; }
  function threadMessages(l) {
    var out = [], its = C.forLifter(l.id);
    (l.messages || []).forEach(function (m, i) {
      var kind = kindOf(m), meta = m.meta ? clone(m.meta) : null;
      /* a voice note says how long it is: "0:24" */
      if (kind === 'voice') { meta = meta || {}; if (meta.len == null) { var lm = /(\d+:\d{2})/.exec(String(m.body || '')); meta.len = isNum(meta.dur) ? mss(meta.dur) : lm ? lm[1] : null; } }
      if (kind === 'voice' && !m.me && meta.said == null) { var vq = null; its.forEach(function (it) { if (!vq && /voice note/i.test(it.kicker || '')) it.ev.forEach(function (x) { if (vq || x.t !== 'quote' || !x.text) return; var st = String(x.text).split(/(?<=[.?!])\s+/).filter(function (t) { return !/\?\s*$/.test(t); }).join(' '); if (st) vq = st; }); }); if (vq) meta.said = vq; }
      out.push({ me: !!m.me, type: kind, body: m.body == null ? '' : String(m.body), at: m.at, read: m.me ? true : m.read !== false, meta: meta, i: i, edited: m.edited || null });
    });
    /* their session notes waiting for an answer, and the ones answered here (the answer is in the thread after them) */
    (l.notes || []).filter(function (x) { return !x.reply || x.replyAt; }).forEach(function (x) { out.push({ me: false, type: 'note', kind: 'words', body: x.note, at: noteAt(l, x), read: true, meta: { date: x.date, reply: x.reply || null }, i: 500 }); });
    /* a check-in answer that reports pain or asks a question is words waiting for an answer too (screens.md §10.6) */
    checkinWords(l).forEach(function (x) { out.push({ me: false, type: 'checkin', kind: 'card', body: x.body, at: x.at, read: true, meta: { day: x.day, pain: x.pain, q: x.q }, i: 400 }); });
    /* LOGIC-FIX-2 (Meets' request, screens.md §5.2 item 6): the attempts sent to them are one card in the thread, posted at
       the first send and updated in place ("Changed 07:40") on later sends */
    var spl = ST.plans[l.id];
    if (spl && spl.sent && spl.sent.at && l.meet) {
      var sa = parseJSON(spl.sent.snap) || spl.a, aw = LIFTS.map(function (k) { return K.LIFT[k].toLowerCase() + ' ' + (sa[k] || []).map(function (x) { return x == null ? '' : n(x); }).join(', '); }).join('; ');
      out.push({ me: true, type: 'attempts', kind: 'card', body: 'Attempts for ' + l.meet.name + ': ' + aw, at: spl.sent.first || spl.sent.at, read: true, meta: { meetId: meetId(l.meet), attempts: clone(sa), changed: spl.sent.first && spl.sent.first !== spl.sent.at ? spl.sent.at : null, changedText: spl.sent.first && spl.sent.first !== spl.sent.at ? 'Changed ' + localIso(tOf(spl.sent.at)).slice(11, 16) : null }, i: 690 });
    }
    var jf = job(l, 'formcheck');
    /* the form-check video came with their last message: it sits just before it */
    /* it is that message's attachment (meta.with: its time), so it never counts as new on its own: 2 new for Arjun is the sleeves question and the voice note */
    if (jf) { var lastIn = out.filter(function (e) { return !e.me && e.i < 400; }).slice(-1)[0], ev = null; its.forEach(function (it) { it.ev.forEach(function (x) { if (!ev && x.t === 'video') ev = x; }); }); out.push({ me: false, type: 'video', body: ev ? ev.title : jf.title, at: lastIn ? lastIn.at : TODAY + 'T12:00:00Z', read: true, meta: { detail: jf.detail || '', len: '0:09', with: lastIn ? lastIn.at : null, withType: lastIn ? lastIn.type : null }, i: lastIn ? lastIn.i - 0.5 : 600 }); }
    /* what the coach did from the desk: the words he sent with a move, and the change it made */
    its.forEach(function (it) {
      var d = doneOf(it.id); if (!d) return;
      var a = actOf(it, d.act), at = isStr(d.at) ? d.at : new Date(isNum(d.at) ? d.at : BASE).toISOString();
      /* screens.md §10.1 and shared.md §6.1 (LOGIC-FIX-2, Teams' request): the coach's words first, then the change card
         (request #45's card-first order is withdrawn: the spec puts the words first) */
      if (d.text && sendTo(it, { actId: d.act, for: d.for }).indexOf(l.id) >= 0) out.push({ me: true, type: 'text', kind: 'words', body: d.text, at: at, read: true, seenAt: ST.msgSeen[l.id + '|' + at] || null, meta: { itemId: it.id, actId: d.act }, i: 701, edited: d.edited || null });
      /* a change that lands in a week not yet sent (Mei's cap in week 5) posts no card: it goes out with that week */
      var ct = a && !a.keep && (a.reply == null || a.says) && landsOf(it, a) !== 'draft' ? changeText(Object.assign({}, a, { says: d.swap ? swapNums(actSays(it, a), d.swap) : actSays(it, a) })) : '';
      if (ct && it.ids.length === 1) out.push({ me: true, type: 'change', kind: 'card', body: ct, at: at, read: true, seenAt: ST.cardSeen[it.id] || null, meta: { itemId: it.id, actId: d.act }, i: 702 });
    });
    out.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)) || a.i - b.i; });
    return out.map(function (e) { var o = { me: e.me, type: e.type, kind: e.kind || (CARD_TYPES.indexOf(e.type) >= 0 ? 'card' : 'words'), body: e.body, at: e.at, read: e.read, seenAt: e.seenAt || (e.me && e.at ? ST.msgSeen[l.id + '|' + e.at] || null : null), meta: e.meta }; if (e.edited) o.edited = e.edited; return o; });   /* edited: the store's stamp, kept across a reload (LOGIC-FIX-2) */
  }
  /* the lifter's open fix that is only words (a reply: it changes nothing and keeps nothing open), from their Needs you
     row, else their primary move: any message to them answers it (Tom's "Reply to Tom"; never Kofi's "Move it and tell
     Kofi", and on a shared item only the row whose move names them) */
  function replyFix(l) {
    var r = model().R[l.id], c = r && r.fix && !r.fix.done ? { it: r.fix.it, a: r.fix.a } : null;
    if (!c) { var pr = primaryOf(l, r), pit = pr && C.get(pr.itemId); c = pit ? { it: pit, a: actOf(pit, pr.actId) } : null; }
    /* LOGIC-FIX-3 (Messages' request): an item whose moves change nothing (Arjun's: review the video, or reply) is answered
       by a message through its words-only move, the same on every page; an item with a move that changes the plan or
       says something (Mei's cap, Priya's Safe) is never settled by words alone */
    if (c && c.a && !doneOf(c.it.id) && (c.a.reply == null || c.a.keep) && !c.it.acts.some(function (x) { return x.says || (x.ops && x.ops.length); })) {
      var wa = c.it.acts.filter(function (x) { return x.reply != null && !x.keep && !x.go; })[0]; if (wa) c = { it: c.it, a: wa };
    }
    if (!c || !c.a || c.a.reply == null || c.a.says || c.a.keep || doneOf(c.it.id)) return null;
    return { itemId: c.it.id, actId: c.a.id };
  }
  function ctxItems(l) { return C.forLifter(l.id).filter(function (it) { return it.ids.length === 1 || it.acts.some(function (a) { return a.reply != null && a.label.indexOf(l.first) >= 0; }); }); }
  function openItems(l) { return ctxItems(l).filter(function (it) { return !doneOf(it.id) && !it.later; }); }
  function changeLabel(it, a) { if (a.ride) return a.ride; var wd = it.ev.filter(function (e) { return e.t === 'weekdays'; })[0]; return wd ? 'Also move ' + wd.from + ' to ' + wd.to : 'Also ' + lower1(a.label.replace(/ and (reply|tell \S+)$/, '')); }
  /* the next week a row now has, in words ("about 185", "182.5"), once it is decided on the row or through the rule */
  function rowNextWords(r) { var x = r.next; if (!x) return ''; return x.w ? n(x.w) : x.kg ? 'about ' + n(x.kg) : ''; }
  /* the drafted answer of an open item: its words, the move they come from, the change that rides along, the times of
     the messages it answers; after a change made without words (Sarah's block pulls), the words that go with it until a
     message follows (follow: true) */
  function draftOf(l) {
    var its = openItems(l);
    for (var i = 0; i < its.length; i++) {
      var it = its[i], A = it.acts, p = null;
      var both = A.filter(function (a) { return a.reply && a.says && !a.keep; })[0], said = A.filter(function (a) { return a.reply && !a.says; })[0];
      var wordsOnly = A.filter(function (a) { return a.reply != null && !a.says; })[0], prim = A.filter(function (a) { return a.kind === 'primary'; })[0];
      var tell = A.filter(function (a) { return a.reply == null && !a.keep && quoted(a.says); })[0];
      if (both) p = { text: draftFor(it, both), src: both, run: both };
      else if (said) p = { text: draftFor(it, said), src: said, run: prim && prim !== said && prim.reply == null && !prim.keep && changeText(prim) ? prim : null };
      else if (tell) p = { text: quoted(tell.says), src: tell, run: tell };
      else if (wordsOnly) p = { text: '', src: wordsOnly, run: null };
      if (!p) continue;
      var ride = p.run ? { itemId: it.id, actId: p.run.id, label: p.run === p.src && p.src.reply && !p.run.ride ? p.run.label : changeLabel(it, p.run), text: changeText(Object.assign({}, p.run, { says: actSays(it, p.run) })) } : null;
      /* the line of This week its words put on the bar ("182.5 next week" is the squat row's Use 182.5): send it with
         messages.send(id, { text, decide: { key, how: 'use' } }) and the words and the bar agree, with one Undo. Once that
         row is decided another way (Keep: about 185), the words say what it is now */
      var row = null, text = p.text || '', about = (it.title + ' ' + (it.meaning || '') + ' ' + (it.ev || []).map(function (e) { return e.title || ''; }).join(' ')).toLowerCase(), wv = p.text ? weekView(l, 0) : null, kgRe = function (kg) { return new RegExp('(^|[^\\d.])' + String(n(kg)).replace('.', '\\.') + '(?![\\d.])'); };
      if (wv) {
        row = wv.rows.filter(function (r) { return r.suggest && r.next && r.lift && !r.line && !r.decided && !r.ruled && about.indexOf(r.lift) >= 0 && kgRe(r.suggest.kg).test(p.text); })[0] || null;
        var gone = row ? null : wv.rows.filter(function (r) { return r.suggest && r.next && r.lift && !r.line && (r.decided || r.ruled) && about.indexOf(r.lift) >= 0 && kgRe(r.suggest.kg).test(p.text); })[0];
        if (gone) { var now = rowNextWords(gone); if (now && now !== n(gone.suggest.kg)) text = text.replace(kgRe(gone.suggest.kg), function (m0, pre) { return pre + now; }); }
      }
      return { text: text, itemId: it.id, actId: p.src.id, ride: ride, answers: (it.answers || []).slice(), row: row ? { key: row.key, how: 'use', kg: row.suggest.kg, label: 'Use ' + n(row.suggest.kg) + ' on ' + row.name.toLowerCase() } : null };
    }
    /* a change made without words: the words that go with it, until a message from you follows */
    var mine = (l.messages || []).filter(function (m) { return m.me; }), done = ctxItems(l).filter(function (it) { var d = doneOf(it.id); return d && it.ids.length === 1; });
    done.sort(function (x, y) { return String(doneOf(y.id).at || '').localeCompare(String(doneOf(x.id).at || '')); });
    for (var j = 0; j < done.length; j++) {
      var dt = done[j], dd = doneOf(dt.id), by = actOf(dt, dd.act), w = by && by.reply && dd.quiet ? by : dt.acts.filter(function (a) { return a.reply && !a.says && !a.keep; })[0];
      if (!by || (by.reply != null && !dd.quiet) || by.keep || !w || dd.text) continue;
      if (mine.some(function (m) { return String(m.at) >= String(dd.at || ''); })) continue;
      return { text: draftFor(dt, w), itemId: dt.id, actId: w.id, ride: null, answers: [], row: null, follow: true };
    }
    return null;
  }
  var WORD_TYPES = ['text', 'voice', 'video', 'set', 'note', 'checkin'];
  /* a session note is written with the session: the time of its last set that day, else noon */
  function noteAt(l, x) {
    var t = null; (l.program ? l.program.weeks : []).forEach(function (w) { w.days.forEach(function (d) { (d.exercises || []).forEach(function (e) { e.sets.forEach(function (s) { if (s.done && s.on && String(s.on).slice(0, 10) === x.date && String(s.on).length > 10 && (!t || String(s.on) > t)) t = String(s.on); }); }); }); });
    (l.messages || []).forEach(function (m) { if (!m.me && m.meta && m.meta.type === 'set' && String(m.at).slice(0, 10) === x.date && (!t || String(m.at) > t)) t = String(m.at); });
    return t || x.date + 'T12:00:00Z';
  }
  /* the check-in answers that are words: pain reported, or a question asked (one entry per check-in day) */
  function checkinWords(l) {
    var by = {};
    (l.answers || []).forEach(function (a) {
      var pain = /^Any pain/.test(a.q) && a.num, q = isStr(a.text) && /\?\s*$/.test(a.text);
      if (!pain && !q) return;
      var x = by[a.day] || (by[a.day] = { day: a.day, at: a.day + 'T07:00:00Z', pain: false, q: null, body: '' });
      if (pain) x.pain = true; if (q) x.q = a.text;
    });
    return Object.keys(by).sort().map(function (d) { var x = by[d]; x.body = x.pain ? (x.q ? 'Pain on the check-in. ' + x.q : 'Pain on the check-in') : x.q; return x; });
  }
  /* LOGIC-FIX-4 (walk 2, Tom's facts panel "Pain: None recorded" over two pain check-ins; Priya's Check-ins tab "no pain"):
     the lifter's pain as one record every page reads. days: the check-in days that said pain (oldest first), plus pain the
     lifter or you recorded (l.pain, PL.lifters.pain); answered: a message from you after the last one. text: "Pain on the
     check-in twice, last 1 Nov, not answered" / "Pain on today’s check-in" / null when none */
  function painRecord(l) {
    var days = checkinWords(l).filter(function (x) { return x.pain; }).map(function (x) { return x.day; });
    var parts = (l.pain || []).filter(function (p) { return p && !p.resolved; }).map(function (p) { return { day: day10(p.day || p.date || '') || null, part: p.part || p.where || null, sev: isNum(p.sev) ? p.sev : isNum(p.score) ? p.score : null, lift: p.lift || null }; });
    (ST.pains || []).forEach(function (p) { if (p && p.id === l.id) parts.push({ day: day10(p.at || '') || null, part: p.where || null, sev: isNum(p.score) ? p.score : null, lift: p.lift || null }); });
    var all = uniq(days.concat(parts.map(function (x) { return x.day; }).filter(Boolean))).sort();
    if (!all.length) return { count: 0, days: [], last: null, answered: null, parts: [], text: null };
    /* answered: words from you after the last one that are about it (a reply about his weight is not an answer to pain) */
    var last = all[all.length - 1], answered = (l.messages || []).some(function (m) { return m.me && String(m.at || '').slice(0, 10) >= last && /pain|hurt|sore|niggle|back|knee|hip|shoulder|elbow|tweak|injur/i.test(String(m.body || '')); });
    parts.sort(function (x, y) { return String(x.day || '').localeCompare(String(y.day || '')); });
    var times = all.length === 1 ? 'once' : all.length === 2 ? 'twice' : all.length + ' times', p0 = parts.filter(function (x) { return x.sev != null; }).slice(-1)[0];
    var head = p0 ? upper1(String(p0.part || 'pain')) + ' ' + n(p0.sev) + '/10' + (p0.lift ? ' on ' + String(p0.lift).toLowerCase() : '') + ', ' : 'Pain on the check-in ';
    var text = last === TODAY && all.length === 1 ? (p0 ? head.replace(/, $/, '') + ' today' : 'Pain on today’s check-in') : head + times + ', last ' + (last === TODAY ? 'today' : K.dm(last)) + (answered ? '' : ', not answered');
    return { count: all.length, days: all, last: last, answered: answered, parts: parts, text: text };
  }
  /* the Check-ins tab's one line: today's pain first and how often it came up, then sleep and soreness on the last check-in */
  function checkinSummary(l) {
    var pr = painRecord(l), by = {}; (l.answers || []).forEach(function (a) { (by[a.day] = by[a.day] || []).push(a); });
    Object.keys(by).forEach(function (k) { if (!by[k].some(function (a) { return a.num != null; })) delete by[k]; });   /* a week's words alone are not a check-in */
    var ds = Object.keys(by).sort(), d = ds[ds.length - 1]; if (!d) return { text: pr.count ? pr.text + '.' : 'No check-ins yet.', pain: pr };
    var get = function (re) { var a = by[d].filter(function (x) { return re.test(x.q); })[0]; return a && a.num != null ? a.num : null; };
    var sl = get(/sleep/i), so = get(/sore/i), recent = ds.slice(-7), painN = recent.filter(function (x) { return by[x].some(function (a) { return /^Any pain/.test(a.q) && a.num; }); }).length;
    var lead = pr.last === d && by[d].some(function (a) { return /^Any pain/.test(a.q) && a.num; }) ? 'Pain on ' + (d === TODAY ? 'today’s' : K.dm(d) + '’s') + ' check-in' + (painN > 1 ? ', ' + painN + ' of the last ' + recent.length : '') : pr.count ? pr.text : 'No pain';
    var rest = [sl != null ? 'sleeping ' + n(sl) + ' h' : null, so != null ? 'soreness ' + n(so) + ' of 10' : null].filter(Boolean).join(', ');
    return { text: lead + (rest ? '. ' + upper1(rest) + '.' : '.'), pain: pr, day: d };
  }
  /* the Messages queue (shared.md §6.12): waiting first (a meet today, then pain, then the triage order, oldest words
     first), then the threads to write first, then the answered ones */
  function waitOrder(list) {
    var M = model();
    return list.slice().sort(function (a, b) {
      var ra = M.R[a.id], rb = M.R[b.id], oa = ra ? ra.tier * 1000 + ra.ord : 1e6, ob = rb ? rb.tier * 1000 + rb.ord : 1e6;
      return (a.meetToday ? 0 : 1) - (b.meetToday ? 0 : 1) || (a.pain ? 0 : 1) - (b.pain ? 0 : 1) || oa - ob || String(a.since).localeCompare(String(b.since));
    });
  }
  /* a meet-day question's deadline (screens.md §6.2, LOGIC-FIX-2): the scale's opening time ("Scale opens 08:00"); the data's
     weighIn is the kind of weigh-in ('2h'), so a time is read only when it is one, else the board's clock */
  function scaleDeadline(l) {
    var w = String(l.meet.weighIn || ''), hhmm = /^\d{1,2}:\d{2}$/.test(w) ? (w.length === 4 ? '0' + w : w) : hm(WEIGH_CLOSE - 90);
    var past = minOf(hhmm) <= minOf(nowIso().slice(11, 16));
    return { text: past ? 'Scale closes ' + hm(WEIGH_CLOSE) : 'Scale opens ' + hhmm, at: TODAY + 'T' + (past ? hm(WEIGH_CLOSE) : hhmm) };
  }
  function threadList() {
    return cached('threads', function () {
      var out = [];
      D.lifters.forEach(function (l) {
        var ms = threadMessages(l); if (!ms.length) return;
        var last = ms[ms.length - 1], ask = openItems(l)[0] || null;
        /* waiting (shared.md §6.12, screens.md §10.6): their newest words (a message, voice note, video, set or session note,
           or a check-in answer that reports pain or asks a question) have no answer from you yet, read or not. A change
           card is not an answer; your words are */
        var said = ms.filter(function (m) { return m.me ? (m.type === 'text' || m.type === 'voice') : WORD_TYPES.indexOf(m.type) >= 0; }), lw = said[said.length - 1];
        var since = lw && !lw.me ? lw.at : null, painW = !!(since && said.slice().reverse().some(function (m) { return !m.me && ((m.type === 'checkin' && m.meta && m.meta.pain) || (m.type === 'note' && BLK() && BLK().painWords(m.body).pain) || (m.type === 'note' && /\b(tight|sore|hurt|pain|sharp|tweak|ache|pinch)\b/i.test(m.body))); }));
        var mt = !!(l.meet && l.meet.days === 0);
        out.push({ id: l.id, name: l.name, first: l.first, ini: l.ini, hue: l.hue, last: { type: last.type, body: last.body, at: last.at, me: last.me, meta: last.meta ? clone(last.meta) : null, len: last.meta && last.meta.len ? last.meta.len : null }, unread: unreadOf(l), asks: ask ? { itemId: ask.id, text: ask.title } : null, waiting: !!since, since: since, pain: painW, meetToday: mt,
          deadline: since && mt && /\?/.test(String(lw.body || '')) ? scaleDeadline(l) : null, count: ms.length });   /* a meet-day question only (Tom), never a pain report (Priya) */
      });
      out.sort(function (a, b) { return (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || String(b.last.at).localeCompare(String(a.last.at)) || a.name.localeCompare(b.name); });
      return out;
    });
  }

  /* ================= meets (round-4 lifter-meet.html and meet-day.html) ================= */
  var PRESET = { safe: [0.90, 0.95, 0.99], planned: [0.91, 0.96, 1.00], brave: [0.92, 0.97, 1.02] }, PNAME = { safe: 'Safe', planned: 'Planned', brave: 'Brave' };
  var STAGES = ['weigh', 'squat', 'bench', 'deadlift', 'done'], STAGE_NAME = { weigh: 'Weigh-in', squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift', done: 'Done' };
  var STAGE_ALIAS = { weighin: 'weigh', 'weigh-in': 'weigh', weigh_in: 'weigh' };
  var WEIGH = ['not', 'made', 'over'], ATT_ST = ['planned', 'called', 'good', 'no'];
  var UPCLS = { 47: 52, 52: 57, 57: 63, 63: 69, 69: 76, 76: 84, 59: 66, 66: 74, 74: 83, 83: 93, 93: 105, 105: 120 };
  var T0 = { squat: 600, bench: 650, deadlift: 700 }, GAP = 4, WEIGH_CLOSE = 570;
  var ORDW = ['opener', 'second', 'third'];
  /* what is left to tick before the platform (round-4 lifter-meet.html): id, the word, what ticking it says */
  var PREP = [['entry', 'Entry', 'confirmed'], ['kit', 'Kit', 'checked'], ['travel', 'Travel', 'booked'], ['rack', 'Rack heights', 'noted'], ['handler', 'Handler: ' + String((D.coach && D.coach.name) || 'Sam').split(' ')[0], 'ready']];
  function hm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function meetId(m) { return slug(m.name); }
  function presetFor(l, lift, key) {
    var e = l.lifts[lift] && l.lifts[lift].e1; if (!e) return [null, null, null];
    if (key === 'safe') return safeOf(l, lift, e1Of(l, lift) || e);
    var o = PRESET[key].map(function (f) { return K.round(e * f); }); if (o[1] <= o[0]) o[1] = o[0] + 2.5; if (o[2] <= o[1]) o[2] = o[1] + 2.5; return o;
  }
  /* the one Safe rule (shared.md §4.7): opener = the lowest of the planned opener, the heaviest single made in the last 21
     days at RPE 8 or easier and 90% of the e1RM (down to 2.5); second = the lower of the planned second less 2.5 and 95%;
     third = the lower of the planned third less 5 and 99%; each at least 2.5 above the one before. Priya: 120 / 127.5 /
     130, 72.5 / 75 / 77.5, 155 / 162.5 / 167.5 */
  /* FIX-LOGIC (veteran walk 4, Hannah's Safe): a preset's hover says how its boxes are made, so 89 / 95 / 97% under a
     "90, 95, 99%" hover never reads as a wrong preset: Safe rounds down to 2.5 kg, Planned and Brave go to the nearest */
  function presetTitle(l, k, pc) {
    var of = l && l.lifts && LIFTS.some(function (x) { return l.lifts[x] && l.lifts[x].e1 != null; }) ? 'today’s e1RM' : herOf(l) + ' estimated max';
    return PNAME[k] + ': about ' + pc[0] + ', ' + pc[1] + ' and ' + pc[2] + '% of ' + of + (k === 'safe' ? ', rounded down to 2.5 kg.' : ', to the nearest 2.5 kg.');
  }
  function down25(kg) { return Math.floor(kg / 2.5 + 1e-9) * 2.5; }
  function singleOf(l, lift) {
    var from = K.add(TODAY, -21), best = null, take = function (w, r, f, d) { if (r === 1 && w > 0 && f != null && f <= 8 && d >= from && d <= TODAY && (best == null || w > best)) best = w; };
    (l.logs || []).forEach(function (g) { if (g.lift === lift) take(g.w, g.r, g.rpe, g.d); });
    (l.program ? l.program.weeks : []).forEach(function (w) { w.days.forEach(function (d) { (d.exercises || []).forEach(function (x) { if (x.lift !== lift || (x.variant && x.variant !== 'Competition')) return; x.sets.forEach(function (st) { if (st.done && !st.skipped) take(st.w, st.r, st.felt != null ? st.felt : st.rpe, day10(st.on || d.date || '') || ''); }); }); }); });
    return best;
  }
  function safeOf(l, lift, e) {
    var plan = presetFor(l, lift, 'planned'), sg = singleOf(l, lift);
    var o1 = Math.min.apply(null, [plan[0], sg, down25(e * 0.90)].filter(isNum));
    var o2 = Math.min(plan[1] != null ? plan[1] - 2.5 : Infinity, down25(e * 0.95)), o3 = Math.min(plan[2] != null ? plan[2] - 5 : Infinity, down25(e * 0.99));
    if (o2 < o1 + 2.5) o2 = o1 + 2.5; if (o3 < o2 + 2.5) o3 = o2 + 2.5;
    return [o1, o2, o3];
  }
  /* a lift's e1RM, one rule (#27): BLOCK.math.working over the lift's rated sets, to one decimal, when the page has
     block.js; else the data's */
  function e1Of(l, lift) {
    var x = l.lifts && l.lifts[lift], d0 = x && x.e1 != null ? x.e1 : null, Bk = BLK();
    if (!Bk || !Bk.math || typeof Bk.math.working !== 'function' || typeof Bk.liftSets !== 'function') return d0;
    return cached('e1:' + l.id + ':' + lift, function () { var w = null; try { w = Bk.math.working(Bk.liftSets(l, lift), TODAY); } catch (err) { w = null; } return w && isNum(w.kg) ? r1(w.kg) : d0; });
  }
  /* LOGIC-FIX-3 (Lifters' request, one rule for a lift card): with block.js on the page the e1RM is the engine's working
     e1RM, so its 12-week line, the 4-week change and the set behind it come from the same rule (the working e1RM at each
     weekly point, ending today; 4 weeks back for the change; the set the working e1RM picked). The line then ends on the
     card's number and the total's line on totalShown. Without block.js, the data's (one record of its own) */
  function liftNow(l, lift) {
    var x = l.lifts && l.lifts[lift], d = { e1: x && x.e1 != null ? x.e1 : null, was: x && x.was != null ? x.was : null, delta: x && x.delta != null ? x.delta : null, series: x && x.series ? x.series.slice() : [], set: setBehind(l, lift) };
    /* FIX-LOGIC polish-d2 (first-time walk 2, Jess): a lifter whose data has no e1RM yet (one made on the desk) still gets the
       engine's line once she logs a rated set, ending on her first session (the weeks before it stay null) */
    var Bk = BLK(); if ((d.e1 == null && !l.made) || !Bk || !Bk.math || typeof Bk.math.working !== 'function' || typeof Bk.liftSets !== 'function') return d;
    return cached('lnow:' + l.id + ':' + lift, function () {
      var sets; try { sets = Bk.liftSets(l, lift); } catch (e) { return d; }
      var at = function (iso) { var w = null; try { w = Bk.math.working(sets, iso); } catch (e) { w = null; } return w && isNum(w.kg) ? w : null; };
      var now = at(TODAY); if (!now) return d;
      var e1 = r1(now.kg), n0 = d.series.length || 12, ser = [];
      for (var i = 0; i < n0; i++) { var w = i === n0 - 1 ? now : at(K.add(TODAY, -7 * (n0 - 1 - i))); ser.push(w ? r1(w.kg) : null); }
      var w4 = at(K.add(TODAY, -28)), was = w4 ? r1(w4.kg) : null, s = now.set, lg = (l.logs || []).filter(function (g) { return g.lift === lift && g.d === s.on && g.w === s.w && g.r === s.r && g.rpe === s.felt; })[0];
      return { e1: e1, was: was, delta: was == null ? null : r1(e1 - was), series: ser, set: { d: s.on, w: s.w, r: s.r, rpe: s.felt, e1: e1, pr: !!(lg && lg.pr) } };
    });
  }
  function chgOf(l) { var ds = LIFTS.map(function (k) { return liftNow(l, k).delta; }); return ds.every(function (x) { return x != null; }) ? r1(ds[0] + ds[1] + ds[2]) : null; }
  function planDefault(l) {
    var a = {}, st = {}; LIFTS.forEach(function (L) { a[L] = presetFor(l, L, 'planned'); st[L] = [l.meet && l.meet.attemptsSet ? 'called' : 'planned', 'planned', 'planned']; });
    var on = !!(l.meet && l.meet.days <= 0), ticks = {}; PREP.forEach(function (t) { ticks[t[0]] = t[0] === 'entry' || t[0] === 'handler' || on; });
    return { preset: 'planned', a: a, st: st, sent: l.meet && l.meet.attemptsSet ? { at: null, snap: JSON.stringify(a) } : null, weigh: 'not', cls: l.meet ? parseFloat(l.meet.cls) || clsOf(l) : clsOf(l), note: '', ticks: ticks, rungs: {} };
  }
  function planOf(l) { return ST.plans[l.id] || planDefault(l); }
  function planFor(l) { return ST.plans[l.id] || (ST.plans[l.id] = planDefault(l)); }
  function proven(l, lift) {
    var from = K.add(TODAY, -21), best = null, take = function (w, r, d) { if (r <= 3 && w > 0 && d >= from && (!best || w > best.w)) best = { w: w, r: r, d: d }; };
    (l.logs || []).forEach(function (g) { if (g.lift === lift) take(g.w, g.r, g.d); });
    (l.program ? l.program.weeks : []).forEach(function (w) { w.days.forEach(function (d) { (d.exercises || []).forEach(function (e) { if (e.lift !== lift || (e.variant && e.variant !== 'Competition')) return; e.sets.forEach(function (x) { if (x.done && !x.skipped) take(x.w, x.r, day10(x.on || d.date || '') || ''); }); }); }); });
    return best;
  }
  function bwPlan(l, pl) {
    var ser = bwSeriesOf(l), last = ser.length ? ser[ser.length - 1] : null, cls = pl.cls, now = last ? last.kg : bwNow(l), days = l.meet ? l.meet.days : null;
    if (now == null || cls == null || !isNum(cls)) return { now: now, cls: cls, over: null, series: clone(ser) };
    var over = r1(now - cls), water = over > 0 && days != null && days <= 21 ? Math.min(over, Math.floor(now * 0.01 * 10) / 10) : 0, food = r1(over - water);
    var first = ser[0], span = first && last ? Math.max(1, K.daysTo(last.d) - K.daysTo(first.d)) : 0, slope = span ? (last.kg - first.kg) / span : 0;
    var pace = last && days != null ? r1(now + slope * (days - K.daysTo(last.d))) : now;
    var cut = doneOf('cut-' + l.id), planOn = !!(cut && (cut.act === 'plan' || cut.act === 'cut')), moved = !!(cut && (cut.act === 'class' || cut.act === 'up'));
    return { now: now, at: last ? last.d : TODAY, cls: cls, over: over, water: water, food: food, pace: pace, perWeek: days > 0 ? r1(over / Math.max(1, days / 7)) : over, up: UPCLS[cls] || null, cutPlan: planOn, movedUp: moved, series: clone(ser) };
  }
  /* the bodyweight read: bwPlan's numbers, the sentence a coach reads (round-4 lifter-meet.html), the decision taken on
     it, and the moves still open (Start the cut plan, Move up a class, Fine, keep watching) */
  function bwOut(l, pl) {
    var b = bwPlan(l, pl), it = C.get('cut-' + l.id), d = it ? doneOf(it.id) : null, days = l.meet ? l.meet.days : null;
    b.watching = !!(d && d.act === 'ok');
    b.decided = d ? { how: d.act === 'ok' ? 'watch' : d.act, label: doneLabel(it, d), at: d.at || null, itemId: it.id } : null;
    /* the moves the item can take, in its own words (a lifter on pace has only Fine, keep watching; one off pace a slow cut) */
    var mv = function (how, id0) { var a0 = it ? actOf(it, id0) : null; return a0 ? { how: how, label: a0.label, primary: a0.kind === 'primary', go: a0.go ? { place: a0.go.place, hash: a0.go.hash } : null } : null; };
    b.moves = it && !d && b.over != null && b.over > 0 && days > 0 ? [mv('plan', 'plan') || mv('plan', 'cut'), b.up ? mv('class', 'class') || mv('class', 'up') : null, mv('watch', 'watch') || mv('watch', 'ok') || { how: 'watch', label: 'Fine, keep watching', primary: false }].filter(Boolean) : [];
    b.sentence = bwWords(l, b);
    return b;
  }
  /* FINAL FIX-LOGIC (plain words for a new coach): a weight class reads "the 63 kg class" (a plus class "the 120+ kg class"),
     never "the 63s": the Needs you and Lifters reasons, the bodyweight sentence, the weigh-in, setClass and book */
  function clsWords(c) { var s = String(c == null ? '' : c).trim().replace(/\s*kg$/i, ''); if (/^\d+(\.\d+)?$/.test(s)) s = n(parseFloat(s)); return 'the ' + s + ' kg class'; }
  function bwWords(l, b) {
    if (b.now == null || b.over == null || !isNum(b.cls)) return b.now != null ? n(b.now) + ' kg ' + K.when(b.at || TODAY, { bare: true }) + '.' : null;
    var d = l.meet ? l.meet.days : null, lead = n(b.now) + ' kg ' + K.when(b.at || TODAY, { bare: true });
    if (d === 0) return b.over > 0 ? lead + ': ' + n(b.over) + ' kg over ' + clsWords(b.cls) + ', and the scale is still to come.' : lead + ': ' + n(-b.over) + ' kg under ' + clsWords(b.cls) + '. On weight for today.';
    if (b.movedUp && b.up) return lead + '. Entered in ' + clsWords(b.up) + ': no cut, ' + l.first + ' eats and drinks as normal all the way to the platform.';
    if (b.over > 0 && d != null && d <= 21) return lead + '. ' + n(b.over) + ' kg to lose in ' + K.plural(d, 'day') + ': ' + (b.food > 0 ? n(b.food) + ' by food, ' : '') + n(b.water) + ' by water in the last 36 hours.' + (b.cutPlan ? ' The plan has started.' : '');
    if (b.over > 0) return lead + '. ' + n(b.over) + ' kg to lose in ' + K.plural(d, 'day') + ': about ' + n(b.perWeek) + ' kg a week by food alone. ' + (b.cutPlan ? 'The slow cut has started.' : b.pace <= b.cls ? 'On pace.' : 'Not on pace yet.');
    return lead + ': ' + n(-b.over) + ' kg under ' + clsWords(b.cls) + '. Nothing to decide: keep the morning weigh-ins coming.';
  }
  /* their question about the meet, waiting for an answer, with the reply drafted for it (Tom: is 105.3 OK?) */
  function askOf(l) {
    var it = C.get('meet-today-' + l.id); if (!it || !it.acts.some(function (x) { return x.reply != null; })) return null;
    var a = it.acts.filter(function (x) { return x.reply != null; })[0], d = doneOf(it.id), m = (l.messages || []).filter(function (x) { return !x.me; }).slice(-1)[0]; if (!a) return null;
    return { text: l.first + ' asked if ' + n(bwNow(l)) + ' is OK', said: m ? m.body : '', at: m ? m.at : null, rec: it.rec || '', itemId: it.id, actId: a.id, label: a.label, reply: a.reply, done: d ? { label: doneLabel(it, d), text: d.text || null, at: d.at || null } : null };
  }
  function scheduleLeft(l) {
    var p = prog(l), out = []; if (!p || !l.meet || l.meet.days <= 0) return out;
    var meet = l.meet.date, end = l.meet.days > 13 ? K.add(TODAY, 13) : meet, pend = [], lastDated = null;
    p.weeks.forEach(function (w, wi) { w.days.forEach(function (d, di) { if (d.date && (!lastDated || day10(d.date) > lastDated)) lastDated = day10(d.date); if (wi >= p.weekIdx && d.sets && !d.done) pend.push({ d: d, wi: wi, di: di }); }); });
    /* LOGIC-FIX-4 (walk 2, Elena: Meets read Thu 12 Squat and Sat 14 Bench while Programs read Sat 14, Mon 16, Tue 17): one
       date per session, the store's one dating rule (programs.md P11), never a spacing of its own; a session already missed
       this week is not in what is left */
    var sd = sessionDates(l, p);
    pend.forEach(function (x) {
      var own = x.d.date ? day10(x.d.date) : x.wi === p.weekIdx && sd[x.di] ? sd[x.di].date : dayDateOf(l, x.wi, x.d.name);
      x.date = own && own >= TODAY ? own : null;
    });
    pend = pend.filter(function (x) { return x.date; });
    var lastOk = K.add(meet, -3);
    pend.filter(function (x) { return x.date <= end && x.date <= lastOk; }).forEach(function (x) { out.push({ week: x.wi + 1, idx: x.di, name: x.d.name, date: x.date, top: topOf(x.d), opener: /opener/i.test(x.d.name) }); });
    return out;
  }
  function meetList() {
    return cached('meets', function () {
      var by = {}, out = [];
      D.lifters.forEach(function (l) { var m = l.meet; if (!m) return; var id = meetId(m); if (!by[id]) { by[id] = { id: id, name: m.name, date: m.date, days: m.days, fed: m.fed || null, lifterIds: [], classes: [] }; out.push(by[id]); } by[id].lifterIds.push(l.id); if (m.cls && by[id].classes.indexOf(m.cls) < 0) by[id].classes.push(m.cls); });
      out.sort(function (a, b) { return a.days - b.days || a.name.localeCompare(b.name); });
      return out;
    });
  }
  function meetById(id) { return meetList().filter(function (m) { return m.id === id; })[0] || null; }
  function boardOf(id) { return ST.boards[id] || { stage: 'weigh', cards: false }; }
  function stOf(pl, lift, k) { return pl.st[lift][k]; }
  function judged(s) { return s === 'good' || s === 'no'; }
  function boardData(m) {
    var ls = m.lifterIds.map(K.L).filter(Boolean), bd = boardOf(m.id), stage = bd.stage;
    var P = {}; ls.forEach(function (l) { P[l.id] = planOf(l); });
    var order = function (lift) { return ls.slice().sort(function (a, b) { return (P[a.id].a[lift][0] || 0) - (P[b.id].a[lift][0] || 0) || a.name.localeCompare(b.name); }); };
    var best = function (l, lift) { var pl = P[l.id], b = 0; for (var k = 0; k < 3; k++) if (pl.st[lift][k] === 'good') b = Math.max(b, pl.a[lift][k]); return b; };
    var decision = function (lift) {
      if (LIFTS.indexOf(lift) < 0) return null; var o = order(lift);
      for (var r = 0; r < 3; r++) for (var i = 0; i < o.length; i++) { var l = o[i], pl = P[l.id], s = pl.st[lift][r];
        if (s === 'planned') return { t: 'call', lifterId: l.id, lift: lift, k: r + 1, kg: pl.a[lift][r] };
        if (s === 'called') return { t: 'verdict', lifterId: l.id, lift: lift, k: r + 1, kg: pl.a[lift][r] };
        if (r < 2 && pl.st[lift][r + 1] === 'planned') return { t: 'call', lifterId: l.id, lift: lift, k: r + 2, kg: pl.a[lift][r + 1] }; }
      return null;
    };
    var options = function (l, lift, r) {
      var pl = P[l.id], plan = pl.a[lift][r]; if (!r) return [{ kg: plan - 2.5, label: 'a light opener', jump: -2.5 }, { kg: plan, label: 'as planned', jump: 0, pick: true }, { kg: plan + 2.5, label: 'a bold opener', jump: 2.5 }];
      var m0 = pl.a[lift][r - 1];
      if (pl.st[lift][r - 1] === 'no') return [{ kg: m0, label: 'repeat it', jump: 0, pick: true }, { kg: m0 + 2.5, label: 'small jump', jump: 2.5 }];
      var a = Math.max(K.round(m0 * 1.025), m0 + 2.5), b = Math.max(K.round(m0 * 1.04), a + 2.5), c = Math.max(K.round(m0 * 1.055), b + 2.5), o = [a, b, c];
      if (plan > m0 && o.indexOf(plan) < 0) { if (plan < a) o[0] = plan; else if (plan < c) o[1] = plan; else if ((plan - m0) / m0 <= 0.085) o[2] = plan; }
      o = o.filter(function (kg) { return kg <= plan || (kg - m0) / m0 <= 0.08; });
      var below = o.filter(function (kg) { return kg < plan; }), above = o.filter(function (kg) { return kg > plan; });
      var pick = o.indexOf(plan) >= 0 ? plan : o.slice().sort(function (x, y) { return Math.abs(x - plan) - Math.abs(y - plan) || x - y; })[0];
      return o.map(function (kg) { return { kg: kg, jump: kg - m0, pick: kg === pick, label: kg === plan ? 'as planned' : kg < plan ? ['small jump', 'medium jump', 'big jump'][below.indexOf(kg)] : ['it flew', 'all out'][above.indexOf(kg)] }; });
    };
    var nowMin = function () {
      if (stage === 'weigh') { var made = ls.filter(function (l) { return P[l.id].weigh === 'made'; }).length, any = ls.some(function (l) { return P[l.id].weigh !== 'not'; }); return made === ls.length ? 558 : any ? 490 : 440; }
      if (stage === 'done') return 740;
      return T0[stage] + GAP * ls.reduce(function (s, l) { return s + P[l.id].st[stage].filter(judged).length; }, 0);
    };
    var firstAt = function (l, lift) { return T0[lift] + GAP * order(lift).indexOf(l); };
    var ladder = function (l, lift) {
      var op = P[l.id].a[lift][0]; if (!op) return [];
      var out = [{ kg: 20, r: 8 }], last = 20, first = firstAt(l, lift);
      [[0.4, 5], [0.55, 3], [0.7, 2], [0.8, 1], [0.88, 1], [0.94, 1]].forEach(function (s) { var kg = K.round(op * s[0]); if (kg <= last || kg >= op) return; out.push({ kg: kg, r: s[1] }); last = kg; });
      out.forEach(function (x, i) { x.at = hm(first - 6 - GAP * (out.length - 1 - i)); x.plates = plates(x.kg); });
      return out;
    };
    var up = decision(stage), upNext = null;
    if (up) { var ul = K.L(up.lifterId); upNext = { t: up.t, lifterId: up.lifterId, name: ul.first, lift: up.lift, k: up.k, kg: up.kg, label: (up.t === 'call' ? 'Call ' : 'Judge ') + ul.first + '’s ' + (up.k > 1 ? ORDW[up.k - 1] + ' ' + up.lift : up.lift + ' opener'), options: up.t === 'call' ? options(ul, up.lift, up.k - 1) : [{ good: true, label: 'Good lift' }, { good: false, label: 'No lift' }] }; }
    else if (stage === 'weigh') { var nw = ls.filter(function (l) { return P[l.id].weigh !== 'made'; })[0]; if (nw) upNext = { t: 'weigh', lifterId: nw.id, name: nw.first, label: 'Weigh in ' + nw.first, options: [{ state: 'made', label: 'Made weight' }, { state: 'over', label: 'Over' }] }; }
    /* the total if every call still open is made: each lift's best made, or its heaviest attempt not yet missed */
    var onCalls = function (l) { var pl = P[l.id]; return LIFTS.reduce(function (sum, lift) { var b0 = 0; for (var k = 0; k < 3; k++) { var st0 = pl.st[lift][k]; if (st0 !== 'no' && pl.a[lift][k]) b0 = Math.max(b0, pl.a[lift][k]); } return sum + b0; }, 0); };
    var lifters = order('squat').map(function (l) {
      var pl = P[l.id], att = {}, tot = 0; LIFTS.forEach(function (lift) { att[lift] = [0, 1, 2].map(function (k) { return { k: k + 1, kg: pl.a[lift][k], st: pl.st[lift][k] }; }); tot += best(l, lift); });
      var bw = bwNow(l), cls = pl.cls, pain = C.get('pain-' + l.id), ask = askOf(l), flags = [];
      if (pain && !doneOf(pain.id)) flags.push({ kind: 'pain', itemId: pain.id, actId: (pain.acts.filter(function (x) { return x.kind === 'primary'; })[0] || pain.acts[0]).id, text: pain.title });
      if (ask && !ask.done) flags.push({ kind: 'ask', itemId: ask.itemId, actId: ask.actId, text: ask.text });
      return { id: l.id, name: l.name, first: l.first, ini: l.ini, hue: l.hue, cls: cls, weigh: pl.weigh, scale: isNum(pl.scale) ? pl.scale : null, bw: bw, over: bw != null && isNum(cls) ? r1(bw - cls) : null,
        flags: flags, note: pl.note || '', attempts: att, total: tot, onCalls: onCalls(l),
        missed: LIFTS.filter(function (lift) { return pl.st[lift].every(function (s) { return s === 'no'; }); })[0] || null };
    });
    var wl = LIFTS.indexOf(stage) >= 0 ? stage : 'squat', warm = {};
    var mins = nowMin();
    ls.forEach(function (l) {
      var pl = P[l.id], tk = (pl.rungs || {})[wl] || [], ta = (pl.rungAt || {})[wl] || [], cut = (pl.cuts || {})[wl] || null;
      var w = { id: l.id, name: l.name, first: l.first, lift: wl, opener: pl.a[wl][0], at: hm(firstAt(l, wl)), rungs: ladder(l, wl).map(function (x, i) { x.ticked = !!tk[i]; x.tickedAt = tk[i] && isNum(ta[i]) ? hm(ta[i]) : null; return x; }) };
      var ls0 = w.rungs.length ? ladderState(w, pl.st[wl][0], mins, cut) : null;
      if (ls0) { w.state = ls0.state; w.next = ls0.next; w.took = ls0.took; w.draft = ls0.draft; w.cut = ls0.cut; ls0.plan.forEach(function (pp) { var r = w.rungs[pp.i]; r.late = pp.late; r.planAt = pp.at; r.reps = pp.r; r.out = pp.out; r.passed = pp.passed; r.isNext = pp.i === ls0.next; }); }
      /* LOGIC-FIX-2 (Meets' request, M5): the next lift's ladder, readable while this lift runs (w.next stays the next rung) */
      var nl = LIFTS[LIFTS.indexOf(wl) + 1];
      if (nl && pl.a[nl] && pl.a[nl][0]) w.nextLift = { lift: nl, opener: pl.a[nl][0], at: hm(firstAt(l, nl)), rungs: ladder(l, nl).map(function (x) { return { kg: x.kg, r: x.r, at: x.at, plates: x.plates }; }) };
      warm[l.id] = w;
    });
    var tot = {}; lifters.forEach(function (x) { tot[x.id] = x.total; });
    /* when each stage starts on this meet's clock: the scale opens 90 minutes before it closes */
    var STAGE_AT = { weigh: WEIGH_CLOSE - 90, squat: T0.squat, bench: T0.bench, deadlift: T0.deadlift, done: 740 };
    return { id: m.id, name: m.name, date: m.date, days: m.days, today: m.days === 0, stage: stage, stages: STAGES.map(function (s) { return { id: s, label: STAGE_NAME[s], on: s === stage, at: hm(STAGE_AT[s]), until: s === 'weigh' ? hm(WEIGH_CLOSE) : null }; }),
      upNext: upNext, lifters: lifters, warmup: warm, clock: { now: hm(mins), minutes: mins, weighOpens: hm(WEIGH_CLOSE - 90), weighCloses: hm(WEIGH_CLOSE) }, total: tot, cards: !!bd.cards };
  }
  /* ================= the warm-up ladder against the board's clock (round-6 meets.html ladderOf and cutDraft, ported
     once): a rung every RUNG_GAP minutes back from the opener; still to take = not ticked, not cut, above the heaviest
     ticked; the state says where the lifter is (start, on, tight, behind, due, warm, past, cut), which rung is next, which
     rungs "took them" would tick, and, when behind, the drafted cut: the bar if still to take, then the planned rungs nearest
     55, 80 and 94% of the opener, each heavier than the one before, 2 minutes apart (1 when 2 does not fit), the last at
     least 2 minutes before the opener ================= */
  var RUNG_GAP = 2, CUT_AT = [0.55, 0.8, 0.94];
  function minOf(t) { var m = /^(\d+):(\d+)$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : 0; }
  function stepFor(count, now, open, steps) { for (var q = 0; q < steps.length; q++) if (now + steps[q] * (count - 1) <= open - RUNG_GAP) return steps[q]; return 0; }
  function ladderState(w, opSt, now, cut) {
    var open = minOf(w.at);
    var rs = w.rungs.map(function (r, i) { var single = !!cut && cut.singles.indexOf(i) >= 0; return { i: i, kg: r.kg, r: single && i ? 1 : r.r, at: (single && cut.at && cut.at[i]) || r.at, min: minOf(r.at), ticked: !!r.ticked, out: !!cut && !r.ticked && cut.out.indexOf(i) >= 0 }; });
    var last = -1; rs.forEach(function (r) { if (r.ticked) last = r.i; });
    rs.forEach(function (r) { r.passed = !r.ticked && !r.out && r.i < last; });
    var todo = rs.filter(function (r) { return !r.ticked && !r.out && r.i > last; });
    var o = { state: null, next: -1, plan: {}, took: [], draft: null };
    var late = function () { todo.forEach(function (r) { if (r.min < now) o.plan[r.i] = { late: true }; }); };
    var runFrom = function (st0) { todo.forEach(function (r, j) { o.plan[r.i] = { at: hm(now + st0 * j), now: j === 0 }; }); o.next = todo[0].i; };
    if (judged(opSt)) o.state = 'past';
    else if (!todo.length) o.state = 'warm';
    else if (now >= open) { o.state = 'due'; late(); o.took = todo; }
    else if (cut) { o.state = 'cut'; runFrom(stepFor(todo.length, now, open, [RUNG_GAP, 1]) || 1); }
    else if (!todo.some(function (r) { return r.min < now; })) { o.state = last >= 0 ? 'on' : 'start'; o.next = todo[0].i; }
    else if (stepFor(todo.length, now, open, [RUNG_GAP])) { o.state = 'tight'; runFrom(RUNG_GAP); }
    else {
      o.state = 'behind'; late(); o.took = todo.slice(0, todo.length - Math.floor((open - now) / RUNG_GAP));
      var floor = last >= 0 ? rs[last].kg : 0, bar = todo[0].i === 0 ? todo[0] : null, picks = [];
      CUT_AT.forEach(function (t) { var want = w.opener * t, top = picks.length ? picks[picks.length - 1].kg : floor, best = null; if (want <= floor) return; todo.forEach(function (r) { if (r.i && r.kg > top && (!best || Math.abs(r.kg - want) < Math.abs(best.kg - want))) best = r; }); if (best) picks.push(best); });
      var keep = (bar ? [bar] : []).concat(picks), st1 = picks.length >= 2 ? stepFor(keep.length, now, open, [RUNG_GAP, 1]) : 0;
      if (st1) { var atOf = {}; keep.forEach(function (r, j) { atOf[r.i] = hm(now + st1 * j); }); o.draft = { singles: keep.map(function (r) { return r.i; }), out: todo.filter(function (r) { return keep.indexOf(r) < 0; }).map(function (r) { return r.i; }), at: atOf, bar: !!bar }; }
    }
    return { state: o.state, next: o.next, took: o.took.map(function (r) { return r.i; }), draft: o.draft, cut: cut ? clone(cut) : null,
      plan: rs.map(function (r) { var pp = o.plan[r.i] || {}; return { i: r.i, r: r.r, late: !!pp.late, at: pp.at || r.at, now: !!pp.now, out: r.out, passed: r.passed }; }) };
  }
  function plates(kg) { var side = (kg - 20) / 2, out = []; [25, 20, 15, 10, 5, 2.5, 1.25].forEach(function (p) { var c = 0; while (side >= p - 1e-9) { c++; side -= p; } if (c) out.push((c > 1 ? c + ' × ' : '') + String(p)); }); return out.join(' + '); }

  /* ================= money (round-4 clients.html) ================= */
  var STEP_DAYS = { weekly: 7, fortnightly: 14, '4-weekly': 28 }, STEP_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };
  /* spec C (first-time-coach.md §10.2, function-polish F8.4): 'once' is a fixed price, due on its first date and never again */
  var CADENCES = ['weekly', 'fortnightly', '4-weekly', 'monthly', 'quarterly', 'yearly', 'once'], METHODS = ['bank', 'card', 'paypal', 'cash'];
  var EVERY = { weekly: 'a week', fortnightly: 'every 2 weeks', '4-weekly': 'every 4 weeks', monthly: 'a month', quarterly: 'a quarter', yearly: 'a year', once: 'once' };
  var HOW = { bank: 'by bank', card: 'by card', paypal: 'by PayPal', cash: 'in cash' }, AS_USUAL = { bank: 'Bank transfer as usual. ', card: 'By card as usual. ', paypal: 'PayPal as usual. ', cash: 'Cash as usual. ' };
  var NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  function numw(k) { return NUMW[k] || String(k); }
  function pad2(x) { return String(x).padStart(2, '0'); }
  function addMonths(iso, k, day) { var x = K.d(iso), mm = x.getMonth() + k, y = x.getFullYear() + Math.floor(mm / 12), m = ((mm % 12) + 12) % 12, last = new Date(y, m + 1, 0).getDate(); return y + '-' + pad2(m + 1) + '-' + pad2(Math.min(day || x.getDate(), last)); }
  function after(iso, b) { if (b.cadence === 'once') return null; return STEP_DAYS[b.cadence] ? K.add(iso, STEP_DAYS[b.cadence]) : addMonths(iso, STEP_MONTHS[b.cadence] || 1, b.nextDue ? K.d(b.nextDue).getDate() : null); }
  var MONTH_END = (function () { var x = K.d(TODAY); return TODAY.slice(0, 8) + pad2(new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()); })();
  function payState(l) {
    var b = l.billing; if (!b) return { state: 'none', days: null };
    if (b.status && b.status.state === 'paused') return { state: 'paused', days: null };
    var d = b.nextDue ? K.daysTo(b.nextDue) : null; if (d == null) return { state: 'ok', days: null };
    return d < 0 ? { state: 'late', days: d } : d <= 7 ? { state: 'soon', days: d } : { state: 'ok', days: d };
  }
  function statusFor(b) {
    if (b.status && b.status.state === 'paused') return { state: 'paused', days: null, label: 'Paused', due: null };
    var d = b.nextDue ? K.daysTo(b.nextDue) : null;
    if (d == null) return { state: 'ok', days: null, label: 'No date yet', due: null };
    return d < 0 ? { state: 'overdue', days: d, label: 'Overdue ' + K.plural(-d, 'day'), due: b.nextDue } : d <= 7 ? { state: 'soon', days: d, label: d === 0 ? 'Due today' : 'Due in ' + K.plural(d, 'day'), due: b.nextDue } : { state: 'ok', days: d, label: 'Next payment ' + K.dm(b.nextDue), due: b.nextDue };
  }
  function price(b) { return K.money(b.amount) + ' ' + (EVERY[b.cadence] || 'a month'); }
  function paidThisMonth(l) { var ym = TODAY.slice(0, 7); return (l.payments || []).filter(function (p) { return String(p.on).slice(0, 7) === ym; })[0] || null; }
  function apps() { return (D.applications || []).map(function (a, i) { return { id: 'app-' + i, a: a, it: C.get('app-' + i) }; }); }
  function appOutcome(x) { var d = x.it && doneOf(x.it.id); return d && (d.act === 'yes' || d.act === 'no') ? d.act : ''; }
  /* every unpaid due date of a lifter, from their next due date on, through `to` (ISO, inclusive), by cadence. The schedule
     runs on from a late date: a lifter who is late still owes the next cycle on its own day (Tomas, late since 29 Oct, is
     due again 29 Nov whether or not October is in yet). Paused and unpriced lifters owe nothing. */
  function dueDates(l, to) {
    var b = l.billing, x = payState(l), out = [];
    if (!b || !b.nextDue || x.state === 'none' || x.state === 'paused') return out;
    for (var d = b.nextDue, k = 0; d <= to && k < 400; k++, d = after(d, b)) { out.push(d); if (b.cadence === 'once') break; }
    return out;
  }
  /* the money, counted ONE way so no two figures on Clients can disagree: in = every payment made this month; late = every
     unpaid due date before today; to come = every unpaid due date from today to the month's end; the month's total = in +
     late + to come; the next 30 days = every unpaid due date from today to today + 30, so its rows dated this month are
     exactly "to come". Paying a date that is late or due this month moves its money to in and the month's total holds */
  function money() {
    return cached('money', function () {
      var ym = TODAY.slice(0, 7), until = K.add(TODAY, 30), to = until > MONTH_END ? until : MONTH_END;
      var o = { n: 0, month: 0, late: [], lateAmt: 0, soon: [], paused: [], none: [], got: 0, coming: 0, total: 0, next: [], nextTotal: 0, until: until, rows: { in: [], late: [], come: [] } };
      D.lifters.forEach(function (l) {
        var b = l.billing, x = payState(l);
        (l.payments || []).forEach(function (p) { if (String(p.on).slice(0, 7) === ym) { o.got += p.amount; o.rows.in.push({ id: l.id, on: p.on, amount: p.amount, method: p.method }); } });
        /* request #54 (4): a part payment leaves the rest owed (late, by the day it was due) */
        (l.payments || []).forEach(function (p) { if (isNum(p.short) && p.short > 0) { o.owed = (o.owed || 0) + p.short; o.lateAmt += p.short; o.rows.late.push({ id: l.id, date: day10(p.on), amount: p.short, days: K.daysTo(day10(p.on)), part: true }); } });
        if (x.state === 'none') { o.none.push(l); return; } if (x.state === 'paused') { o.paused.push(l); return; }
        o.n++; o.month += b.amount;
        if (x.state === 'late') o.late.push(l); else if (x.state === 'soon') o.soon.push(l);
        dueDates(l, to).forEach(function (d) {
          if (d < TODAY) { o.lateAmt += b.amount; o.rows.late.push({ id: l.id, date: d, amount: b.amount, days: K.daysTo(d) }); return; }
          if (d <= MONTH_END) { o.coming += b.amount; o.rows.come.push({ id: l.id, date: d, amount: b.amount }); }
          if (d <= until) { o.nextTotal += b.amount; o.next.push({ id: l.id, date: d, amount: b.amount, inMonth: d <= MONTH_END }); }
        });
      });
      var byDays = function (a, b) { return payState(a).days - payState(b).days; };
      var byDate = function (a, b) { return a.date.localeCompare(b.date) || K.L(a.id).name.localeCompare(K.L(b.id).name); };
      o.late.sort(byDays); o.soon.sort(byDays); o.next.sort(byDate); o.rows.late.sort(byDate); o.rows.come.sort(byDate);
      o.rows.in.sort(function (a, b) { return b.on.localeCompare(a.on) || K.L(a.id).name.localeCompare(K.L(b.id).name); });
      o.total = o.got + o.lateAmt + o.coming;
      var ap = apps(); o.apps = ap.filter(function (x) { return !appOutcome(x); }).length; o.invited = ap.filter(function (x) { return appOutcome(x) === 'yes'; }).length;
      o.used = D.coach.seats + o.invited + ST.invites.length + (ST.made ? ST.made.length : 0) - (ST.inviteLink && ST.inviteLink.cancelled ? 1 : 0); o.free = Math.max(0, D.coach.limit - o.used);
      return o;
    });
  }
  /* the to-do: the rows from the data at load (late, due this week, applications, paused, no price yet), each
     staying in place once dealt with, so a figure moves when a row is done and the row says how */
  var TODO_ROWS = (function () {
    var rows = [], late = [], soon = [], paused = [], none = [];
    D.lifters.forEach(function (l) { var x = payState(l); if (x.state === 'late') late.push(l); else if (x.state === 'soon') soon.push(l); else if (x.state === 'paused') paused.push(l); else if (x.state === 'none') none.push(l); });
    var byDays = function (a, b) { return payState(a).days - payState(b).days; }; late.sort(byDays); soon.sort(byDays);
    var said0 = function (l, kind) { var b = l.billing, ps = payState(l); return kind === 'late' ? K.money(b.amount) + ', ' + K.plural(-(ps.days || 0), 'day') + ' late' : K.money(b.amount) + ', due ' + (ps.days === 0 ? 'today' : ps.days === 1 ? 'tomorrow' : K.wd(b.nextDue)); };
    /* shared.md §2, screens.md §7.1 (STORE-2): late, applications (oldest first), no price yet, paused, leaving, then
       payments not due yet: Tomas, Tom, Jonas, Mia, Hannah, Jonah, Ryan, Sarah, Elena */
    late.forEach(function (l) { rows.push({ key: 'pay-' + l.id, kind: 'late', id: l.id, text0: said0(l, 'late') }); });
    (D.applications || []).map(function (a, i) { return { a: a, i: i }; }).sort(function (x, y) { return String(x.a.at).localeCompare(String(y.a.at)); }).forEach(function (x) { if (C.get('app-' + x.i)) rows.push({ key: 'app-' + x.i, kind: 'app', id: 'app-' + x.i }); });
    none.forEach(function (l) { rows.push({ key: 'none-' + l.id, kind: 'none', id: l.id }); });
    paused.forEach(function (l) { rows.push({ key: 'quiet-' + l.id, kind: 'paused', id: l.id }); });
    /* a lifter who gave notice (screens.md §7.1: Ryan, leaving 30 Nov) */
    D.lifters.forEach(function (l) { if (l.billing && l.billing.leaving && l.billing.leaving.after) rows.push({ key: 'leave-' + l.id, kind: 'leaving', id: l.id }); });
    soon.forEach(function (l) { rows.push({ key: 'pay-' + l.id, kind: 'soon', id: l.id, text0: said0(l, 'soon') }); });
    return rows;
  })();
  function todoRowsBase() {
    return cached('todo', function () {
      return TODO_ROWS.map(function (r) {
        var out = { key: r.key, kind: r.kind, id: r.id, lifterId: null, name: '', text: '', amount: null, due: null, acts: [], done: null };
        if (r.kind === 'app') {
          var x = apps().filter(function (z) { return z.id === r.id; })[0], a = x.a, d = x.it ? doneOf(x.it.id) : null;
          out.name = a.name; out.text = x.it.title; out.at = a.at; out.acts = x.it.acts.map(function (c) { return { id: c.id, label: c.label, kind: c.kind || null, reply: c.reply != null ? c.reply : null }; }); out.itemId = x.it.id;
          if (d && (d.act === 'yes' || d.act === 'no')) out.done = { act: d.act, label: d.act === 'yes' ? 'Invite sent to ' + a.name.split(' ')[0] + ': powalifta.com/j/' + inviteCode(a.name) : 'Declined', at: d.at };
          if (d && d.act === 'yes') { var code = inviteCode(a.name); out.invite = { code: code, link: 'powalifta.com/j/' + code, url: 'https://powalifta.com/j/' + code }; if (out.done) out.done.link = out.invite.link; }
          out.replied = ST.appReplies[r.id] ? clone(ST.appReplies[r.id]) : null;
          /* LOGIC-FIX-2 (Clients' request): the store owns the row's words once you asked them something */
          if (out.replied) out.replied.words = 'You asked ' + a.name.split(' ')[0] + '. Waiting for an answer.';
          return out;
        }
        var l = K.L(r.id), b = l.billing, ps = payState(l), rem = ST.reminders[l.id], paid = paidThisMonth(l);
        out.lifterId = l.id; out.name = l.name; out.amount = b ? b.amount : null; out.due = b ? b.nextDue : null; out.days = ps.days;
        if (r.kind === 'late' || r.kind === 'soon') {
          /* the row's words while it is open; once dealt with it keeps the words it had (never "$150, -19 days late") */
          out.text = r.kind === 'late' ? (ps.state === 'late' ? K.money(b.amount) + ', ' + K.plural(-(ps.days || 0), 'day') + ' late' : r.text0) : (ps.state === 'soon' ? K.money(b.amount) + ', due ' + (ps.days === 0 ? 'today' : ps.days === 1 ? 'tomorrow' : K.wd(b.nextDue)) : r.text0);
          if (l.meet && l.meet.days === 0) out.context = 'Lifts at ' + l.meet.name + ' today';
          out.acts = [{ id: 'paid', label: 'Mark paid' }, { id: 'remind', label: l.meet && l.meet.days === 0 ? 'Remind tomorrow' : 'Remind' }, { id: 'pause', label: 'Pause billing' }];
          if (paid && ps.state !== 'late' && (r.kind === 'late' || paid.on >= TODAY)) out.done = { act: 'paid', label: 'Paid ' + K.money(paid.amount) + ' ' + K.when(paid.on) + ' ' + (HOW[paid.method] || '') + '. Next payment ' + K.dm(b.nextDue), at: paid.on };
          else if (ps.state === 'paused') out.done = { act: 'pause', label: 'Billing paused', at: null };
          else if (rem) out.done = { act: 'remind', label: rem.when === 'tomorrow' ? 'Reminder goes out tomorrow morning' : 'Reminded today', at: rem.on };
        } else if (r.kind === 'paused') {
          var q = C.get('quiet-' + l.id), qd = q ? doneOf(q.id) : null;
          out.text = (b ? price(b) + ', paused' : 'Paused') + (l.ago >= 7 ? '. ' + quietWords(l) : '');
          out.acts = [{ id: 'restart', label: 'Restart billing' }].concat(q ? q.acts.map(function (c) { return { id: c.id, label: c.label, itemId: q.id, reply: c.reply != null ? c.reply : null }; }) : []);
          if (ps.state !== 'paused') out.done = { act: 'restart', label: 'Billing restarted: ' + price(b) + ', due ' + K.when(b.nextDue, { bare: true }), at: null };
          else if (qd) out.done = { act: qd.act, label: doneLabel(q, qd), at: qd.at };
        } else if (r.kind === 'leaving') {
          var lv = b.leaving, en = ST.ends[l.id]; out.due = lv.after;
          out.text = 'Leaving ' + K.dm(lv.after) + (lv.note ? ': “' + lv.note + '”' : '');
          out.acts = [{ id: 'reply', label: 'Reply…' }, { id: 'end', label: 'Stop billing after ' + K.d(lv.after).toLocaleString('en-GB', { month: 'short' }) }];
          if (en || lv.ended) out.done = { act: 'end', label: 'Billing stops after ' + K.dm(en ? en.after : lv.after), at: en ? en.at : lv.ended };
        } else {
          out.text = 'No price yet'; out.acts = [{ id: 'package', label: 'Set a package' }];
          if (b) out.done = { act: 'package', label: price(b) + ', from ' + K.when(b.firstDue || b.nextDue || TODAY, { bare: true }), at: null };
        }
        return out;
      });
    });
  }

  /* a lifter's ledger row (Everyone, and the detail of one lifter) */
  function ledgerRow(l) {
    var b = l.billing, ps = payState(l), last = (l.payments || [])[0] || null;
    return { id: l.id, name: l.name, first: l.first, ini: l.ini, hue: l.hue, pkg: b ? b.pkg : null, amount: b ? b.amount : null, cur: b ? b.cur || 'USD' : null, cadence: b ? b.cadence : null, nextDue: b ? b.nextDue : null,
      status: { state: ps.state, days: ps.days, text: ps.state === 'late' ? K.plural(-ps.days, 'day') + ' late' : ps.state === 'soon' ? (ps.days === 0 ? 'Due today' : ps.days === 1 ? 'Due tomorrow' : 'Due ' + K.wd(b.nextDue)) : ps.state === 'paused' ? 'Paused' : ps.state === 'none' ? 'No package' : 'Paid up' },
      lastPaid: last ? { on: last.on, amount: last.amount, method: last.method } : null, note: b ? b.note || '' : '', reminded: ST.reminders[l.id] ? clone(ST.reminders[l.id]) : null };
  }

  /* ================= store-owned state (rebuilt by replaying the log) ================= */
  var ST = null;
  function freshST() { return { decisions: {}, notes: {}, plans: {}, boards: {}, reminders: {}, teamSent: {}, held: {}, appReplies: {}, remind: [], pains: [], logged: [], sesSeen: {}, seenOk: {}, weekSeen: {}, msgSeen: {}, cardSeen: {}, sched: {}, starts: {}, nextBlocks: {}, nextSent: {}, moved: {}, notPain: {}, tpls: [], tplGone: {}, tplNames: {}, tplEdits: {},
    /* STORE-2: teams, meets, messages, clients and settings */
    teamsNew: [], teamHeld: {}, teamRestart: {}, booked: {}, results: {}, targets: {}, redReasons: {}, meetNotes: {}, flights: {}, platform: {}, racks: {}, handIn: {}, changeBy: {}, cuts: {}, meetPain: {}, depth: {}, settings: null, invites: [], inviteLink: null, pkgs: null, ends: {},
    /* spec C (13 Nov evening): the lifters this desk added (the records live in D.lifters; here the order they came in),
       the intakes the coach has read, Getting started, the sample intakes the demo has used, and the meet a booking keeps
       unticked */
    made: [], intakeSeen: {}, setup: { hidden: null, shown: null, watched: null }, samples: 0 }; }
  ST = freshST();
  var drafts = {};
  /* LOGIC-FIX-1: the next block as a block.js draft (pl:v1:blocks:<id>:next), and the writes a replay could not run yet
     because block.js was not on the page (kept in pl:v1:edits and run again once it loads) */
  var nextDrafts = {}, PENDING = [];

  /* ================= a block's history: patches, 500 steps, kept across reloads (sheet-spec M7) ================= */
  var HIST = {}, HIST_STEPS = 500, HIST_BYTES = 1500000;
  function hist(id) { return HIST[id] || (HIST[id] = { undo: [], redo: [] }); }
  function trimHist(h) {
    while (h.undo.length > HIST_STEPS) h.undo.shift();
    var size = JSON.stringify(h).length;
    while (size > HIST_BYTES && h.undo.length) { h.undo.splice(0, Math.max(1, Math.ceil(h.undo.length / 10))); size = JSON.stringify(h).length; }
    if (size > HIST_BYTES) h.redo = [];
  }
  function persistHist(id) { var h = HIST[id]; if (h && (h.undo.length || h.redo.length)) sSet(KEY_UNDO + id, JSON.stringify({ v: 1, undo: h.undo, redo: h.redo })); else sDel(KEY_UNDO + id); }
  function readHist(id, raw) { var o = parseJSON(raw); if (o && o.v === 1 && Array.isArray(o.undo) && Array.isArray(o.redo)) HIST[id] = { undo: o.undo, redo: o.redo }; else delete HIST[id]; }
  var LATE_HIST = [];
  function loadHist() { HIST = {}; LATE_HIST = []; sKeys().forEach(function (k) { if (k.indexOf(KEY_UNDO) !== 0) return; var id = k.slice(KEY_UNDO.length); if (K.L(id)) readHist(id, sGet(k)); else LATE_HIST.push(id); }); }
  function histInfo(id) { var h = HIST[id], u = h && h.undo[h.undo.length - 1], r = h && h.redo[h.redo.length - 1]; return { undo: u ? u.label : null, redo: r ? r.label : null, steps: h ? h.undo.length : 0, redoSteps: h ? h.redo.length : 0 }; }
  /* the ops that turn JSON a into JSON b: [path, value] sets (a whole array when its length changed), [path] deletes */
  function jdiff(a, b, path, out) {
    if (a === b) return out;
    var ao = a !== null && typeof a === 'object', bo = b !== null && typeof b === 'object';
    if (ao && bo && Array.isArray(a) === Array.isArray(b) && (!Array.isArray(a) || a.length === b.length)) {
      if (Array.isArray(a)) { for (var i = 0; i < a.length; i++) jdiff(a[i], b[i], path.concat(i), out); return out; }
      var ks = {}; Object.keys(a).forEach(function (k) { ks[k] = 1; }); Object.keys(b).forEach(function (k) { ks[k] = 1; });
      Object.keys(ks).forEach(function (k) {
        var inA = has(a, k) && a[k] !== undefined, inB = has(b, k) && b[k] !== undefined;
        if (inA && !inB) out.push([path.concat(k)]); else if (!inA && inB) out.push([path.concat(k), clone(b[k])]); else if (inA) jdiff(a[k], b[k], path.concat(k), out);
      });
      return out;
    }
    out.push([path, clone(b)]);
    return out;
  }
  function jpatch(x, ops) {
    (ops || []).forEach(function (op) {
      var p = op[0], del = op.length === 1;
      if (!p.length) { x = del ? null : clone(op[1]); return; }
      var o = x; for (var j = 0; j < p.length - 1 && o != null; j++) o = typeof o === 'object' ? o[p[j]] : null;
      if (o == null || typeof o !== 'object') return;
      var k = p[p.length - 1];
      if (del) { if (Array.isArray(o)) o.splice(k, 1); else delete o[k]; } else o[k] = clone(op[1]);
    });
    return x;
  }

  /* ================= a send held behind its toast lands ================= */
  function landHeld(key) {
    var h = ST.held[key]; if (!h) return false;
    if (h.timer) clearTimeout(h.timer);
    delete ST.held[key];
    var rec = null; for (var i = LOG.length - 1; i >= 0; i--) if (LOG[i].t === h.t) { rec = LOG[i]; break; }
    if (!rec) return false;
    var u = h.land(), u0 = rec.undo;
    rec.undo = function () { u(); u0(); };
    rec.persist = true; rec.events = [['program:sent', { id: h.id, n: h.n }]]; rec.undoEvents = [['program:sent', { id: h.id, n: h.n }]];
    if (h.draft) rec.drafts = [h.id];
    if (h.next) rec.nexts = [h.id];
    bump(); persistAfter(rec);
    emit('program:sent', { type: 'program:sent', ids: rec.ids.slice(), v: v, undone: false, id: h.id, n: h.n });
    emit('change', { type: 'program', ids: rec.ids.slice(), v: v, undone: false, label: rec.label });
    return true;
  }
  function flushHeld() { var k = Object.keys(ST.held), n0 = 0; k.forEach(function (x) { if (landHeld(x)) n0++; }); return n0; }
  function heldOf(id, which) { return Object.keys(ST.held).map(function (k) { return ST.held[k]; }).filter(function (h) { return h.id === id && (which === 'next' ? h.next : !h.next); }).map(function (h) { return { n: h.n, at: h.at, until: h.until }; }); }

  /* ================= the write log ================= */
  var LOG = [], seq = 0, inWrite = false, lastDoneJSON = '{}', lastEditsJSON = null;
  function newToken() { return 'u' + BOOT.toString(36) + '-' + (++seq); }
  function overlap(a, b) { for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) >= 0) return true; return false; }
  function persistDone() { var s = JSON.stringify(C.state.done); if (s !== lastDoneJSON) { lastDoneJSON = s; sSet(KEY_DONE, s); } }
  function persistEdits() { var list = LOG.filter(function (r) { return r.persist; }).map(function (r) { return r.at ? { t: r.t, op: r.op, a: r.a, at: r.at } : { t: r.t, op: r.op, a: r.a }; });
    /* a write the replay could not run without block.js stays in the log, in its place by time (never lost) */
    if (PENDING.length) { list = list.concat(PENDING.map(function (x) { return x.r; })); list = list.map(function (r, i) { return { r: r, i: i }; }).sort(function (x, y) { var a0 = String(x.r.at || ''), b0 = String(y.r.at || ''); return a0 < b0 ? -1 : a0 > b0 ? 1 : x.i - y.i; }).map(function (x) { return x.r; }); }
    var s = JSON.stringify(list); if (s !== lastEditsJSON) { lastEditsJSON = s; if (s === '[]') sDel(KEY_EDITS); else sSet(KEY_EDITS, s); } }
  function persistDraft(id) { if (drafts[id]) sSet(KEY_BLOCK + id, JSON.stringify(drafts[id])); else sDel(KEY_BLOCK + id); }
  function persistNext(id) { if (nextDrafts[id]) sSet(KEY_BLOCK + id + ':next', JSON.stringify(nextDrafts[id])); else sDel(KEY_BLOCK + id + ':next'); }
  function persistAfter(rec) { if (rec.persist) persistEdits(); persistDone(); (rec.drafts || []).forEach(persistDraft); (rec.nexts || []).forEach(persistNext); (rec.hist || []).forEach(persistHist); }
  function fire(rec, undone) {
    var ids = rec.ids.slice();
    (undone ? rec.undoEvents : rec.events).forEach(function (e) { var pl = { type: e[0], ids: ids, v: v, undone: !!undone }; if (e[1]) Object.keys(e[1]).forEach(function (k) { pl[k] = e[1][k]; }); emit(e[0], pl); });
    emit('change', { type: undone ? 'undo' : rec.kind, ids: ids, v: v, undone: !!undone, label: rec.label });
  }
  /* run an op: { error } refuses (nothing changed); { changed: false } answers with no step; else one step back */
  function commit(op, a, o) {
    o = o || {};
    var caps = [], prevCap = capture; capture = caps; inWrite = true;
    var res;
    try { res = OPS[op](a, { replay: false }); } finally { inWrite = false; capture = prevCap; }
    if (!res || res.error) return res || fail('invalid', 'That did not go through.');
    if (!res.changed) return ok(res.data, { undo: null, label: res.label || '' });
    syncNew();   /* spec C: the desk's own lifters and first-block items follow the write */
    bump(); if (isStr(a && a.at) && tOf(a.at) > lastStamp) lastStamp = tOf(a.at); else tick();
    var rec = { at: localIso(lastStamp), t: newToken(), op: op, a: a, kind: res.kind || op, keys: res.keys || [], items: res.items || [], undo: res.undo, persist: !!res.persist, label: res.label || '', undoLabel: res.undoLabel || null, ids: uniq(res.ids || []), events: res.events || [], undoEvents: res.undoEvents || (res.events || []).map(function (e) { return [e[0], e[1]]; }), drafts: res.drafts || [], nexts: res.nexts || [], hist: res.hist || [] };
    LOG.push(rec);
    persistAfter(rec);
    if (typeof res.after === 'function') res.after(rec);
    fire(rec, false);
    /* request #12: a move run with edited numbers toasts the numbers it ran with (its label), never the act's first ones */
    if (o.toast) caps.forEach(function (t) { deliver({ text: op === 'item' && a && (a.swap || a.edits) && rec.label ? rec.label : t.text, undo: function () { return PL.undo(rec.t); }, token: rec.t }); });
    return ok(res.data, { undo: rec.t, label: rec.label });
  }
  function undoToken(t) {
    if (!isStr(t) || !t) return fail('nothing_to_undo', 'Nothing to undo.');
    var i = -1; for (var j = LOG.length - 1; j >= 0; j--) if (LOG[j].t === t) { i = j; break; }
    if (i < 0) return fail('nothing_to_undo', 'Nothing to undo: that was taken back already, or never done.');
    var rec = LOG[i];
    for (var k = i + 1; k < LOG.length; k++) if (overlap(LOG[k].keys, rec.keys)) return fail('conflict', 'Other changes came after it. Undo those first.', [{ token: LOG[k].t, label: LOG[k].label }]);
    var said = typeof rec.undoLabel === 'function' ? rec.undoLabel() : rec.undoLabel;
    var prevCap = capture; capture = []; inWrite = true;
    try { rec.undo(); syncNew(); } finally { inWrite = false; capture = prevCap; }
    LOG.splice(i, 1);
    bump();
    persistAfter(rec);
    fire(rec, true);
    return ok({ token: t, label: rec.label, undone: true }, { label: said || undoneSay(rec.label) });
  }

  /* ================= the ops: each validates against the data it needs, changes it, and returns its own way back ================= */
  function itemDone(itemId, entry) {   /* sets (or clears) a done entry; returns its undo */
    var had = has(C.state.done, itemId), prev = had ? C.state.done[itemId] : undefined;
    if (entry) C.state.done[itemId] = entry; else delete C.state.done[itemId];
    return function () { if (had) C.state.done[itemId] = prev; else delete C.state.done[itemId]; };
  }
  function chain(list) { return function () { for (var i = list.length - 1; i >= 0; i--) list[i](); }; }
  /* an answer reads what it answers: their messages so far are read, in the same write (one Undo puts both back) */
  function markRead(l) {
    var theirs = (l.messages || []).filter(function (m) { return !m.me && m.read === false; }), prev = l.unread;
    if (!theirs.length && !l.unread) return null;
    theirs.forEach(function (m) { m.read = true; }); l.unread = 0;
    return function () { theirs.forEach(function (m) { m.read = false; }); l.unread = prev; };
  }
  /* the words are the move itself (no silent button): a tell that cannot be left off */
  var CARD_TYPES = ['change', 'attempts', 'cut', 'payment', 'checkin'];
  /* where a move's change lands (shared.md §6.1 ride.lands): 'draft' when every week its ops name is not with the lifter
     yet (Mei's cap in week 5: it goes out with that week), 'published' when one is, null when it changes no week */
  function landsOf(it, a) {
    var ops = a && a.ops; if (!ops || !ops.length) return null;
    var l = K.L(it.ids[0]), p = l && l.program; if (!p) return 'draft';
    return ops.some(function (o) { var w = isNum(o.week) ? p.weeks[o.week - 1] : null; return w && (w.sentAt || w.published !== false && o.week - 1 <= p.weekIdx); }) ? 'published' : 'draft';
  }
  function tellRequired(a) { return !!a && a.reply != null && !a.silent; }
  /* the draft a move's words start from: the coach's own words for that kind of fix when Settings holds them, else the act's reply */
  /* LOGIC-FIX-2 (Settings' request, shared.md §5 "Your words", screens.md P5): a kind of fix the coach wrote their own
     draft for drafts those words, filled from the move's preview: {first} who, {day} the change's weekday in full
     ("Saturday"; a date change reads its new date), {load} the first new load, {lift} the lift, lower case */
  var WORD_KIND = { move: 'move', swap: 'swap', cap: 'cap', light: 'light', nudge: 'checkin', safe: 'attempts', attempts: 'attempts' };
  var drafting = false;
  function wordsFill(tpl, it, a, changes) {
    var l = K.L(replyTarget(it) || it.ids[0]), ops = a.ops || [], op0 = ops[0] || {}, ch = changes || [];
    var dt = null; ch.some(function (c) { var d0 = c.field === 'date' && isStr(c.after) ? c.after : c.date; if (isStr(d0) && isIso(day10(d0))) { dt = day10(d0); return true; } return false; });
    var ld = null; ch.some(function (c) { var x = c.load && isNum(c.load.after) ? c.load.after : c.field === 'load' && isNum(c.after) ? c.after : null; if (x != null) { ld = x; return true; } return false; });
    var lift = op0.lift || (op0.to && op0.to.lift) || null; if (!lift) ops.some(function (o) { var r = isStr(o.row) ? /\|([^|]+)\|/.exec(o.row) : null; if (r && /squat|bench|deadlift/i.test(r[1])) { lift = /squat/i.test(r[1]) ? 'squat' : /bench/i.test(r[1]) ? 'bench' : 'deadlift'; return true; } return false; });
    var dayW = dt ? K.d(dt).toLocaleDateString('en-GB', { weekday: 'long' }) : '';
    return String(tpl).replace(/\{first\}/g, l ? l.first : '').replace(/\{day\}/g, dayW).replace(/\{load\}/g, ld != null ? n(ld) : '').replace(/\{lift\}/g, lift ? String(lift).toLowerCase() : '').replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
  }
  function ownWords(it, a) { var k = a && (WORD_KIND[a.id] || (a.id === 'msg' && /^(quiet|nocheck)-/.test(it.id) ? 'checkin' : null)), s = k ? settingsOf() : null, w = s && s.words ? s.words[k] : ''; return isStr(w) && w.trim() ? w : ''; }
  function draftFor(it, a, changes) {
    if (!a || a.reply == null) return '';
    var own = ownWords(it, a); if (!own) return String(a.reply);
    if (!changes && !drafting && a.ops && a.ops.length) { drafting = true; try { changes = previewOf(it, a, {}).changes; } catch (e) { changes = []; } drafting = false; }
    return wordsFill(own, it, a, changes);
  }
  /* who a move's words go to: one lifter, or one copy each on an item about several (shared.md §6.16: sendMany) */
  function sendTo(it, a) {
    if (a && a.for) return [a.for];
    if (it.routine || it.group === 'good' || (it.ids.length > 1 && /\ball \d+\b/.test((actOf(it, a && a.actId) || {}).label || ''))) return it.ids.slice();
    var t = replyTarget(it); return t ? [t] : [];
  }
  /* the toast in the one format (shared.md §5): "<says>." or "<says>. Sent to <First>: “<the words>”" */
  function toastOf(it, a, text, swap) {
    if (swap && a.says) { var w0 = K.L(replyTarget(it)); return endDot(swapNums(a.says, swap)) + (text ? ' Sent to ' + (w0 ? w0.first : 'them') + ': “' + text + '”' : ''); }
    var says = actSays(it, a) || a.says || a.done || a.label, many = text ? sendTo(it, { actId: a.id }) : [];
    if (text && many.length > 1) return endDot(says) + ' Sent to ' + many.length + ' lifters: “' + text + '”';
    if (typeof C.toastText === 'function' && !(a.id === 'safe')) return C.toastText(it, a, text);
    var w = K.L(replyTarget(it)); return endDot(says) + (text ? ' Sent to ' + (w ? w.first : 'them') + ': “' + text + '”' : '');
  }
  /* what a move says when its words depend on the store's state now (the Safe openers name the opener they set) */
  function actSays(it, a) {
    if (a && a.id === 'safe' && it.id.indexOf('pain-') === 0) {
      var l = K.L(it.ids[0]); if (!l || !l.meet) return a.says || '';
      var sq = presetFor(l, 'squat', 'safe')[0], be = presetFor(l, 'bench', 'safe')[0], dl = presetFor(l, 'deadlift', 'safe')[0];
      return sq == null ? (a.says || '') : l.first + '’s openers: squat ' + n(sq) + ', bench ' + n(be) + ', deadlift ' + n(dl);
    }
    return a ? a.says || null : null;
  }
  /* what a move changes beyond its item, run once whichever way it comes (items.run, or riding on a message): a template
     start, a start with the team, the Safe openers, money for everyone late. Answers { undos, keys, events, persist,
     doneLabel, undoLabel } or { error } (nothing changed) */
  function moveEffects(it, act, a, ctx) {
    var out = { undos: [], keys: [], events: [], persist: false, doneLabel: null, undoLabel: null }, take = function (sub) { out.undos.push(sub.undo); out.keys = out.keys.concat(sub.keys || []); out.events = out.events.concat(sub.events || []); out.persist = true; };
    if (it.id.indexOf('first-') === 0 && act.id === 'start') { var sub = OPS.programStart({ id: it.ids[0], tpl: 'tpl-foundation', at: a.at, noItem: true }, ctx); if (sub.error) return sub; take(sub); }
    if (it.id.indexOf('first-') === 0 && act.id === 'team') {
      var T0 = D.team, wn0 = T0 ? teamNow(T0) + 2 : null;
      if (!T0 || !T0.members.some(function (m) { return m.id === it.ids[0]; }) || wn0 > T0.weeks.length) return fail('invalid', 'There is no team week to start from.');
      var st = OPS.teamStart({ id: slug(T0.name), lifterId: it.ids[0], n: wn0, at: a.at, noItem: true }, ctx); if (st.error) return st;
      take(st); out.doneLabel = 'Starts week ' + wn0 + ' with the team'; out.undoLabel = st.undoLabel;
    }
    /* pain on a meet day: the openers go Safe with the question (one Undo takes both back) */
    if (act.id === 'safe' && it.id.indexOf('pain-') === 0) {
      var pl0 = K.L(it.ids[0]); if (!pl0 || !pl0.meet) return fail('invalid', 'There is no meet to set openers for.');
      var sp = OPS.meet({ what: 'preset', lifterId: pl0.id, preset: 'safe' }, ctx);
      if (sp && sp.error) return sp;
      if (sp && sp.changed) take(sp);
    }
    if (it.id === 'money-late' && (act.id === 'paid' || act.id === 'remind')) {
      it.ids.forEach(function (lid) {
        var l = K.L(lid); if (!l || !l.billing || payState(l).state !== 'late') return;
        var s2 = act.id === 'paid' ? OPS.billPaid({ id: lid, amount: l.billing.amount, on: TODAY, method: ((l.payments || [])[0] || {}).method || 'bank' }, ctx) : OPS.billRemind({ id: lid, when: l.meet && l.meet.days === 0 ? 'tomorrow' : 'now', on: TODAY }, ctx);
        if (s2.error || !s2.changed) return;
        take(s2);
      });
    }
    return out;
  }
  var OPS = {
    /* a move on a COACH item (C.run does it, with its own toast); some moves change more than the item */
    item: function (a, ctx) {
      var it = C.get(a.itemId); if (!it) return fail('not_found', 'There is no item ' + a.itemId + '.');
      var act = actOf(it, a.actId), undos = [], keys = ['item:' + it.id], ids = [it.id].concat(it.ids), events = [], undoEvents = [], persist = false, drafts0 = [], undoLabel0 = null;
      if (!act && !a.label) return fail('not_found', 'That move is not one of this item’s.');
      /* the moves that change more than the item (the same whether the move runs here or rides on a message) */
      if (act) { var fx = moveEffects(it, act, a, ctx); if (fx.error) return fx; undos = undos.concat(fx.undos); keys = keys.concat(fx.keys); events = events.concat(fx.events); undoEvents = undoEvents.concat(fx.events); if (fx.persist) persist = true; if (fx.doneLabel) a.doneLabel = fx.doneLabel; if (fx.undoLabel) undoLabel0 = fx.undoLabel; }
      var views = viewsOf(it.ids), before = C.state.done[it.id];
      var toDraft = !!(act && act.ops && act.ops.length && landsOf(it, act) === 'draft' && BLK() && K.L(it.ids[0]) && K.L(it.ids[0]).program), dBase = null;
      if (toDraft && !(ctx && ctx.replay && a.drafted)) { var dl0 = K.L(it.ids[0]); dBase = drafts[dl0.id] ? clone(drafts[dl0.id]) : clone(programAnswer(dl0).data); }
      /* the loads a published move changes, worked out once on the block and kept with the move (replays read them back) */
      if (act && !a.label && !a.loads && !(ctx && ctx.replay) && act.ops && act.ops.length && (act.id === 'light' || act.id === 'cap') && landsOf(it, act) === 'published' && BLK()) {
        var pvL = null; try { pvL = previewOf(it, act, { edits: a.edits, for: a.for }); } catch (e) { pvL = null; }
        if (pvL && pvL.changes) pvL.changes.forEach(function (c) { var kg = c.load && c.load.after, key = c.row || c.key; if (isNum(kg) && kg !== c.load.before && isStr(key) && isNum(c.week)) { a.loads = a.loads || {}; (a.loads[c.week] = a.loads[c.week] || {})[key] = kg; } });
      }
      if (act && !a.label && !a.merge && !(ctx && ctx.replay) && act.ops && BLK() && act.ops.some(function (op) { return op.op === 'merge'; })) a.merge = mergeOf(it, act);
      if (act && !a.label) {
        if (a.text && act.reply != null) { sendTo(it, a).forEach(function (lid) { var wl = K.L(lid), ur1 = wl ? markRead(wl) : null; if (ur1) { undos.push(ur1); keys.push('unread:' + wl.id); } }); }
        C.run(it, act.id, { sent: true, text: a.text || null });
        var entry = C.state.done[it.id], entry0 = function () { return C.state.done[it.id] && C.state.done[it.id] !== before; };
        if (entry && entry !== before) { entry.at = a.at; if (a.loads) entry.loads = clone(a.loads); if (a.merge) entry.merge = clone(a.merge); if (a.choices) entry.choices = clone(a.choices); if (a.text) entry.text = a.text; if (a.doneLabel) entry.label = a.doneLabel; if (a.quiet) entry.quiet = true; if (a.for) entry.for = a.for; if (a.swap) entry.swap = clone(a.swap); }
        undos.push(function () { if (before === undefined) delete C.state.done[it.id]; else C.state.done[it.id] = before; });
      } else undos.push(itemDone(it.id, { act: a.actId, at: a.at, label: a.label }));
      /* a ticked follow-up lands with the move (shared.md §6.8): one Undo takes both */
      if (a.remind && act) { var rm = { id: 'rem-' + it.id + '-' + String(a.at).replace(/\D/g, '').slice(0, 14), lifterId: it.ids[0], on: a.remind.on, text: a.remind.text, kind: 'follow-up', itemId: it.id, at: a.at, done: null }; ST.remind.push(rm); undos.push(function () { var i = ST.remind.indexOf(rm); if (i >= 0) ST.remind.splice(i, 1); }); keys.push('remind:' + rm.id); persist = true; }
      if (act && a.edits && typeof entry0 === 'function' && entry0()) { var e0 = C.state.done[it.id], ld0 = opsWith(act, a.edits).filter(function (op) { return op.op === 'load'; })[0]; if (ld0) e0.kg = ld0.kg; }
      /* what the move changed in a program (Use 145, Hold, back-offs paused ...) lands in a draft the Sheet holds */
      var mv = mirrorViews(views); undos = undos.concat(mv.undos); drafts0 = drafts0.concat(mv.ids);
      /* a change that lands in a week not sent yet is saved into that week of the draft, the store's proposal first (Mei's
         cap into week 5: "goes out with week 5"); nothing reaches the lifter until that week is sent */
      if (toDraft) {
        var dl = K.L(it.ids[0]), dBefore = dl && drafts[dl.id] ? clone(drafts[dl.id]) : null;
        if (dl && dl.program) {
          if (dBase) {
            var db = null; try { db = BLK().from(dBase); } catch (e) { db = null; }
            var wk0 = act.ops[0].week, pp0 = null;
            if (db) { try { pp0 = BLK().propose(db, wk0 - 1, { holds: holdsFor(dl), today: TODAY, rules: rulesCtx() }); } catch (e) { pp0 = null; } if (pp0 && pp0.block && !pp0.error) db.useProposal(pp0); }
            var ar = db ? applyOps(db, opsWith(act, a.edits)) : null;
            if (db && ar && !ar.error) { drafts[dl.id] = db.toJSON(); a.drafted = true; }
          }
          if (dBase) a.hadDraft = !!dBefore;
          var replayed = !dBase;
          undos.push(function () { if (replayed ? a.hadDraft === false : !dBefore) delete drafts[dl.id]; else if (!replayed) drafts[dl.id] = dBefore; });
          drafts0.push(dl.id);
        }
      }
      /* request #13 (shared.md §6.1 sendWeek): "Send week 5 to Mei now too" goes in the same write, one Undo */
      var sentWeek = null;
      if (a.sendWeek && toDraft && dl && dl.program) {
        if (!a.sendArgs) { var sa0 = sendArgsFor(dl.id, act.ops[0].week, {}); if (sa0.error) { chain(undos)(); return sa0; } a.sendArgs = sa0; }
        var sub = OPS.programSend(a.sendArgs, ctx); if (!sub || sub.error) { chain(undos)(); return sub || fail('invalid', 'That week did not go.'); }
        undos.push(sub.undo); keys = keys.concat(sub.keys || []); events = events.concat(sub.events || []); undoEvents = undoEvents.concat(sub.events || []); persist = true; drafts0 = drafts0.concat(sub.drafts || []); sentWeek = a.sendArgs.n;
      }
      events.unshift(['item:done', { itemId: it.id, actId: a.actId }]); undoEvents.unshift(['item:undone', { itemId: it.id, actId: a.actId }]);
      var who = act && act.reply != null ? replyTarget(it) : null, many = act && a.text ? sendTo(it, a) : [];
      if (!undoLabel0 && a.text && who) undoLabel0 = many.length > 1 ? 'Message to ' + many.length + ' lifters taken back.' : 'Message to ' + K.L(who).first + ' taken back.' + (act.says && !act.keep ? ' What came with it is back as it was.' : '');
      if (a.text && many.length) events.push(['message:sent', { id: many[0], ids: many.slice() }]);
      return { changed: true, kind: 'item', data: { itemId: it.id, actId: a.actId, done: clone(C.state.done[it.id]) || null, sent: many.slice(), remind: a.remind ? clone(a.remind) : null }, undo: chain(undos), keys: keys, items: [it.id], ids: ids.concat(many), events: events, undoEvents: undoEvents, persist: persist, drafts: drafts0, undoLabel: undoLabel0,
        label: (a.label ? a.label + '.' : toastOf(it, act, a.text || null, a.swap || null)) + (sentWeek ? ' Week ' + sentWeek + ' sent to ' + K.L(it.ids[0]).first + '.' : '') };
    },
    itemClear: function (a) {
      var it = C.get(a.itemId), d = it && doneOf(it.id); if (!d) return fail('nothing_to_undo', 'Nothing to undo.');
      var views = viewsOf(it.ids), u = itemDone(it.id, null), mv = mirrorViews(views);
      return { changed: true, kind: 'item', data: { itemId: it.id }, undo: chain([u].concat(mv.undos)), keys: ['item:' + it.id], items: [], ids: [it.id].concat(it.ids), drafts: mv.ids, events: [['item:undone', { itemId: it.id, actId: d.act }]], undoEvents: [['item:done', { itemId: it.id, actId: d.act }]], label: doneLabel(it, d) + ' taken back.' };
    },
    /* a program's max; the shared draft holds the same max (one place for maxes: the Sheet, the lifter page, the loads) */
    setMax: function (a, ctx) {
      var l = L(a.id); if (!l || !l.program) return fail('not_found', 'No program to set a max on.');
      var p = l.program, hadMaxes = p.maxes != null, prevMaxes = p.maxes, had = hadMaxes && has(p.maxes, a.lift), prev = had ? p.maxes[a.lift] : undefined;
      var dr = drafts[l.id], dm = dr ? (dr.maxes || {}) : null, dHad = !!dr && has(dr.maxes || {}, a.lift), dPrev = dHad ? dr.maxes[a.lift] : undefined;
      /* what the draft held before, kept in the write log, so an undo after a reload puts it back */
      if (dr && !(ctx && ctx.replay) && !has(a, 'dHad')) { a.dHad = dHad; a.dPrev = dHad ? dPrev : null; }
      if (has(a, 'dHad')) { dHad = !!a.dHad; dPrev = a.dHad ? a.dPrev : undefined; }
      if (had && prev === a.kg && (!dr || dm[a.lift] === a.kg)) return { changed: false, data: { id: l.id, lift: a.lift, kg: a.kg } };
      p.maxes = hadMaxes ? p.maxes : {}; p.maxes[a.lift] = a.kg;
      var mf = dr && dr.maxFrom ? dr.maxFrom[a.lift] : undefined;
      if (dr) { dr.maxes = dm; dm[a.lift] = a.kg; dr.maxFrom = dr.maxFrom || {}; dr.maxFrom[a.lift] = 'typed'; }
      return { changed: true, kind: 'max', persist: true, drafts: dr ? [l.id] : [], data: { id: l.id, lift: a.lift, kg: a.kg }, keys: ['max:' + l.id + ':' + a.lift], ids: [l.id], events: [['max:set', { id: l.id, lift: a.lift, kg: a.kg }]],
        undo: function () { if (!hadMaxes) p.maxes = prevMaxes; else if (had) p.maxes[a.lift] = prev; else delete p.maxes[a.lift]; var d2 = drafts[l.id]; if (dr && d2 && d2.maxes && d2.maxes[a.lift] === a.kg) { if (dHad) d2.maxes[a.lift] = dPrev; else delete d2.maxes[a.lift]; if (d2.maxFrom) { if (mf === undefined) delete d2.maxFrom[a.lift]; else d2.maxFrom[a.lift] = mf; } } },
        label: K.LIFT[a.lift] + ' max for ' + p.name + ' is ' + n(a.kg) + ' kg. Its loads follow.' };
    },
    moveSession: function (a) {
      var l = L(a.id), w = l && l.program && l.program.weeks[a.wi], d = w && w.days[a.di]; if (!d) return fail('not_found', 'That session is not in the program.');
      var prev = d.date; if (day10(prev) === a.iso) return { changed: false, data: { id: l.id, idx: a.di, date: a.iso } };
      d.date = a.iso;
      return { changed: true, kind: 'session', persist: true, data: { id: l.id, idx: a.di, date: a.iso }, keys: ['session:' + l.id + ':' + a.wi + ':' + a.di], ids: [l.id], events: [['session:moved', { id: l.id, idx: a.di, date: a.iso }]],
        undo: function () { d.date = prev; }, label: l.first + ', ' + d.name.toLowerCase() + ' ' + K.wd3(a.iso) + ' ' + K.dm(a.iso) + '.' };
    },
    /* next week's line decided (Use, a load set by hand): the program's sets, and the shared draft's cell */
    next: function (a) {
      var l = L(a.id), w = l && l.program && l.program.weeks[a.wi], hit = w ? exIn(w, a.day, a.title, a.occ) : null, g = hit ? groupsOf(hit.ex)[a.gi] : null;
      if (!g) return fail('not_found', 'Next week has no ' + (a.title || 'such') + ' line to change.');
      var bkey = blockKey(hit.day, hit.day.exercises.indexOf(hit.ex), a.gi);
      var prev = g.sets.map(function (s) { return { w: s.w, r: s.r, rpe: s.rpe, hadRpe: has(s, 'rpe') }; }), dec = decisionsOf(l.id), hadDec = has(dec, a.key), prevDec = dec[a.key];
      var oldTop = g.sets[0] ? g.sets[0].w : null, fu = [], fl = [];
      g.sets.forEach(function (s) { s.w = a.w; if (a.r != null) s.r = a.r; if (a.rpe !== undefined) s.rpe = a.rpe; });
      if (a.follow && a.gi === 0) fl = followTop(l.program, a.wi, a.day, a.title, a.occ, oldTop, a.w, fu);
      dec[a.key] = { how: a.how, kg: a.w, r: a.r != null ? a.r : g.r, rpe: a.rpe !== undefined ? a.rpe : g.rpe, at: a.at };
      var du = draftCell(l.id, a.wi, bkey, function (cell) { putSet(cell, a.w, a.r, a.rpe); }, a.dprev);
      if (du && a.dprev == null) a.dprev = du.before;   /* kept in the write log: the undo after a reload */
      var shown = n(a.w) + ' × ' + (a.r != null ? a.r : g.r) + (dec[a.key].rpe != null ? ' @' + n(dec[a.key].rpe) : '');
      var foll = fl.filter(function (x) { return x.gi === 0; })[0], bo = fl.filter(function (x) { return x.gi > 0 && x.week === a.wi + 1; })[0];
      var keysN = ['next:' + l.id + ':' + a.wi + ':' + a.day + ':' + a.title + ':' + a.occ + ':' + a.gi, 'decide:' + l.id + ':' + a.key], evN = [['program:saved', { id: l.id, key: a.key }]], undoEvN = evN.slice(), itemsN = [], iu = null;
      var doneW = upper1(lower1(sentence(a.title))) + ' next week ' + shown;
      if (a.itemId && C.get(a.itemId) && !doneOf(a.itemId)) { iu = itemDone(a.itemId, { act: 'set', at: a.at, label: doneW }); itemsN.push(a.itemId); keysN.push('item:' + a.itemId); evN.unshift(['item:done', { itemId: a.itemId, actId: 'set' }]); undoEvN.unshift(['item:undone', { itemId: a.itemId, actId: 'set' }]); }
      return { changed: true, kind: 'program', persist: true, drafts: drafts[l.id] ? [l.id] : [], data: { id: l.id, key: a.key, next: { w: a.w, r: dec[a.key].r, rpe: dec[a.key].rpe }, follows: fl, itemId: itemsN[0] || null }, keys: keysN, items: itemsN, ids: [l.id].concat(itemsN),
        events: evN, undoEvents: undoEvN,
        undo: function () { if (iu) iu(); chain(fu)(); g.sets.forEach(function (s, i) { s.w = prev[i].w; s.r = prev[i].r; if (prev[i].hadRpe) s.rpe = prev[i].rpe; else delete s.rpe; }); if (hadDec) dec[a.key] = prevDec; else delete dec[a.key]; if (du) du.undo(); },
        /* the toast format (shared.md §5): "Marcus, bench next week 147.5 × 3 @8, back-offs 122.5." (request #27) */
        label: l.first + ', ' + lower1(sentence(a.title)) + ' next week ' + shown + (bo ? ', back-offs ' + n(bo.now) : '') + '.' + (foll ? ' Week ' + foll.week + ' follows: ' + n(foll.now) + '.' : ''),
        undoLabel: l.first + '’s ' + lower1(sentence(a.title)) + ' next week is back to ' + (prev[0] && prev[0].w ? n(prev[0].w) + ' × ' + prev[0].r : prev[0] ? prev[0].r : '') + (prev[0] && prev[0].rpe != null ? ' @' + n(prev[0].rpe) : '') + (prev[0] && !prev[0].w ? ', by RPE' : '') + ', as written.' };
    },
    keep: function (a) {
      var l = L(a.id); if (!l) return noLifter(a.id);
      var dec = decisionsOf(l.id), hadDec = has(dec, a.key), prevDec = dec[a.key], undos = [];
      var viaItem = !!(a.itemId && C.get(a.itemId) && !doneOf(a.itemId)), kg = a.kg > 0 ? a.kg : null;
      dec[a.key] = { how: 'keep', kg: kg, at: a.at }; if (viaItem) dec[a.key].itemId = a.itemId;
      undos.push(function () { if (hadDec) dec[a.key] = prevDec; else delete dec[a.key]; });
      var events = [['program:saved', { id: l.id, key: a.key }]], undoEvents = events.slice(), items = [], keys = ['decide:' + l.id + ':' + a.key];
      if (viaItem) { undos.push(itemDone(a.itemId, { act: 'keep', at: a.at, label: kg ? 'Keep ' + n(kg) : 'Keep as written' })); items.push(a.itemId); keys.push('item:' + a.itemId); events.unshift(['item:done', { itemId: a.itemId, actId: 'keep' }]); undoEvents.unshift(['item:undone', { itemId: a.itemId, actId: 'keep' }]); }
      /* the words come from the row (kept in the log with the write): "Arjun’s squat next week stays 3 @8.5, about 185, as written." */
      var said = a.say || ('Next week stays ' + (kg ? n(kg) + ' kg' : 'as written') + '.');
      return { changed: true, kind: 'program', persist: true, data: { id: l.id, key: a.key, kept: kg }, keys: keys, items: items, ids: [l.id].concat(items), events: events, undoEvents: undoEvents, undo: chain(undos), label: said, undoLabel: a.undoSay || null };
    },
    /* a load on this week's line still to come (0: worked out again, by RPE): the program's sets, and the draft's cell */
    load: function (a) {
      var l = L(a.id), w = l && l.program && l.program.weeks[a.wi], hit = w ? exIn(w, a.day, a.title, a.occ) : null, g = hit ? groupsOf(hit.ex)[a.gi] : null;
      if (!g) return fail('not_found', 'This week has no ' + (a.title || 'such') + ' line to change.');
      var bkey = blockKey(hit.day, hit.day.exercises.indexOf(hit.ex), a.gi), prev = g.sets.map(function (s) { return s.w; });
      if (g.sets.every(function (s) { return (s.w || 0) === a.w; })) return { changed: false, data: { id: l.id, key: a.key, w: a.w } };
      g.sets.forEach(function (s) { s.w = a.w; });
      var du = draftCell(l.id, a.wi, bkey, function (cell) { putSet(cell, a.w); }, a.dprev);
      if (du && a.dprev == null) a.dprev = du.before;
      var dd = hit.day.date ? day10(hit.day.date) : null, when = dd ? ' on ' + K.wd(dd) : ' on ' + hit.day.name, nm = nameOf(hit.ex);
      return { changed: true, kind: 'program', persist: true, drafts: drafts[l.id] ? [l.id] : [], data: { id: l.id, key: a.key, w: a.w }, keys: ['load:' + l.id + ':' + a.wi + ':' + a.day + ':' + a.title + ':' + a.occ + ':' + a.gi], ids: [l.id], events: [['program:saved', { id: l.id, key: a.key }]],
        undo: function () { g.sets.forEach(function (s, i) { s.w = prev[i]; }); if (du) du.undo(); },
        label: nm + when + (a.w ? ' now ' + n(a.w) + ' kg.' : ' is worked out by RPE again.') };
    },
    /* several lines of this week's sessions still to come, in one write with one Undo (the Roster's Save and tell) */
    loads: function (a, ctx) {
      var l = L(a.id); if (!l) return noLifter(a.id);
      var undos = [], keys = [], drafts0 = [], ch = 0;
      for (var i = 0; i < (a.lines || []).length; i++) {
        var sub = OPS.load(a.lines[i], ctx);
        if (sub.error) { chain(undos)(); return sub; }
        if (!sub.changed) continue;
        ch++; undos.push(sub.undo); keys = keys.concat(sub.keys); drafts0 = drafts0.concat(sub.drafts || []);
      }
      if (!ch) return { changed: false, data: { id: l.id, lines: 0 } };
      return { changed: true, kind: 'program', persist: true, drafts: uniq(drafts0), data: { id: l.id, lines: ch }, keys: uniq(keys), ids: [l.id], events: [['program:saved', { id: l.id }]], undo: chain(undos), label: a.say || l.first + ' sees the new loads in the app.', undoLabel: a.undoSay || null };
    },
    addNote: function (a) {
      var l = L(a.id); if (!l) return noLifter(a.id);
      var list = (ST.notes[l.id] = ST.notes[l.id] || []), note = { text: a.text, at: a.at, mine: true };
      list.push(note);
      return { changed: true, kind: 'note', persist: true, data: { id: l.id, note: clone(note) }, keys: ['note:' + l.id + ':' + a.at], ids: [l.id], events: [],
        undo: function () { var i = list.indexOf(note); if (i >= 0) list.splice(i, 1); }, label: 'Note saved. Only you can see it.' };
    },
    /* the coach's answer to a session note: on the note, in the thread, and the reply its item asked for is done */
    noteReply: function (a, ctx) {
      var l = L(a.id), x = l && (l.notes || []).filter(function (s) { return s.date === a.date; }).slice(-1)[0]; if (!x) return fail('not_found', 'There is no note from ' + a.date + '.');
      var prev = { reply: x.reply, replyAt: x.replyAt }, msg = { me: true, body: a.text, at: a.at, read: true, type: 'text', meta: { note: a.date } }, undos = [], items = [], keys = ['notereply:' + l.id + ':' + a.date], events = [['message:sent', { id: l.id }]], undoEvents = [['message:sent', { id: l.id }]];
      var ur0 = markRead(l); if (ur0) { undos.push(ur0); keys.push('unread:' + l.id); }
      x.reply = a.text; x.replyAt = a.at; l.messages = l.messages || []; l.messages.push(msg);
      undos.push(function () { x.reply = prev.reply; if (prev.replyAt === undefined) delete x.replyAt; else x.replyAt = prev.replyAt; var i = l.messages.indexOf(msg); if (i >= 0) l.messages.splice(i, 1); });
      var rit = a.ride && C.get(a.ride.itemId), ract = rit && actOf(rit, a.ride.actId);
      if (rit && ract && (ctx.replay || !doneOf(rit.id))) { undos.push(itemDone(rit.id, { act: ract.id, at: a.at, via: 'note' })); items.push(rit.id); keys.push('item:' + rit.id); events.unshift(['item:done', { itemId: rit.id, actId: ract.id }]); undoEvents.unshift(['item:undone', { itemId: rit.id, actId: ract.id }]); }
      return { changed: true, kind: 'message', persist: true, data: { id: l.id, date: a.date, reply: a.text }, keys: keys, items: items, ids: [l.id].concat(items), events: events, undoEvents: undoEvents, undo: chain(undos),
        label: 'Replied to ' + l.first + '’s note. Sent to ' + l.first + ': “' + a.text + '”', undoLabel: 'Reply taken back.' };
    },
    /* a message to a lifter; a change can ride along (an item's move) and so can next week's line its words name */
    send: function (a, ctx) {
      var l = L(a.id); if (!l) return noLifter(a.id);
      var msg = { me: true, body: a.text, at: a.at, read: true, type: a.type || 'text' }, undos = [], items = [], keys = ['msg:' + l.id + ':' + a.at], events = [['message:sent', { id: l.id }]], undoEvents = [['message:sent', { id: l.id }]], drafts0 = [], more = '';
      if (a.type === 'voice') msg.meta = { type: 'voice', dur: a.dur || 12, len: mss(a.dur || 12) };
      if (a.attach) { msg.meta = msg.meta || {}; msg.meta.attach = clone(a.attach); }
      var ur = markRead(l); if (ur) { undos.push(ur); keys.push('unread:' + l.id); }
      l.messages = l.messages || []; l.messages.push(msg);
      undos.push(function () { var i = l.messages.indexOf(msg); if (i >= 0) l.messages.splice(i, 1); });
      var ride = a.ride, rit = ride && C.get(ride.itemId), ract = rit && actOf(rit, ride.actId);
      if (rit && ract && !ract.keep && (ctx.replay || !doneOf(rit.id))) {
        var views = viewsOf(rit.ids), fx = moveEffects(rit, ract, a, ctx); if (fx.error) { chain(undos)(); return fx; }
        undos = undos.concat(fx.undos); keys = keys.concat(fx.keys); events = events.concat(fx.events); undoEvents = undoEvents.concat(fx.events);
        undos.push(itemDone(rit.id, { act: ract.id, at: a.at, via: 'message', label: fx.doneLabel || undefined })); items.push(rit.id); keys.push('item:' + rit.id);
        var mv = mirrorViews(views); undos = undos.concat(mv.undos); drafts0 = drafts0.concat(mv.ids);
        events.unshift(['item:done', { itemId: rit.id, actId: ract.id }]); undoEvents.unshift(['item:undone', { itemId: rit.id, actId: ract.id }]);
        if (ract.says && !ract.keep) more += ' ' + changeText(Object.assign({}, ract, { says: actSays(rit, ract) }));
        /* a ride on their session note's item answers the note too (as lifters.replyNote does) */
        var nx0 = /note/i.test(rit.kicker || '') ? (l.notes || []).filter(function (x) { return !x.reply; }).slice(-1)[0] : null;
        if (nx0) { var pn = { reply: nx0.reply, replyAt: nx0.replyAt }; nx0.reply = a.text; nx0.replyAt = a.at; msg.meta = msg.meta || {}; msg.meta.note = nx0.date; undos.push(function () { nx0.reply = pn.reply; if (pn.replyAt === undefined) delete nx0.replyAt; else nx0.replyAt = pn.replyAt; }); keys.push('notereply:' + l.id + ':' + nx0.date); }
      }
      if (a.next) {
        var sub = OPS.next(a.next, ctx); if (sub.error) { chain(undos)(); return sub; }
        undos.push(sub.undo); keys = keys.concat(sub.keys); events = events.concat(sub.events); undoEvents = undoEvents.concat(sub.events); drafts0 = drafts0.concat(sub.drafts || []);
        more += ' ' + sub.label;
        /* LOGIC-FIX-2 (Messages' request, G6): the row the words decide posts its change card after the words, as a ride does
           ("Arjun, squat Mon 16 Nov 182.5 × 3 @8.5") */
        var nd = dayDateOf(l, a.next.wi, a.next.day), nl = (a.next.lift || '').toLowerCase() || lower1(String(a.next.title || '').split(' ')[0]);
        var card = { me: true, type: 'change', body: l.first + ', ' + nl + (nd ? ' ' + dmyOf(nd) : ' next week') + ' ' + n(a.next.w) + (a.next.r ? ' × ' + a.next.r : '') + (a.next.rpe != null ? ' @' + n(a.next.rpe) : ''), at: a.at, read: true, meta: { next: a.next.key || null } };
        l.messages.push(card); undos.push(function () { var i = l.messages.indexOf(card); if (i >= 0) l.messages.splice(i, 1); });
      }
      /* the toast in shared.md §5's one format: "<what changed>. Sent to <First>: “<the words>”" (Messages' request) */
      var head = more.trim().replace(/\.$/, '');
      return { changed: true, kind: 'message', persist: true, drafts: uniq(drafts0), data: { id: l.id, message: clone(msg) }, keys: keys, items: items, ids: [l.id].concat(items), events: events, undoEvents: undoEvents, undo: chain(undos),
        label: (head ? head + '. ' : '') + (msg.type === 'voice' ? 'Voice note sent to ' + l.first + '.' : 'Sent to ' + l.first + ': “' + a.text + '”'), undoLabel: 'Message to ' + l.first + ' taken back.' + (items.length || a.next ? ' What rode along with it is back as it was.' : '') };   /* request #50: names who */
    },
    read: function (a) {
      var l = L(a.id); if (!l) return noLifter(a.id);
      var theirs = (l.messages || []).filter(function (m) { return !m.me && m.read === false; }), prevUnread = l.unread;
      if (!theirs.length && !l.unread) return { changed: false, data: { id: l.id, unread: 0 } };
      theirs.forEach(function (m) { m.read = true; }); l.unread = 0;
      return { changed: true, kind: 'read', persist: true, data: { id: l.id, unread: 0 }, keys: ['unread:' + l.id], ids: [l.id], events: [],
        undo: function () { theirs.forEach(function (m) { m.read = false; }); l.unread = prevUnread; }, label: l.first + '’s messages are read.' };
    },
    /* a save of the block Builder and Sheet share; one step of its history (pl:v1:undo:<id>), kept as a patch back */
    draft: function (a) {
      var id = a.id, had = has(drafts, id), prev = drafts[id], nb = clone(a.block), h = hist(id), redo0 = h.redo;
      var step = had ? { label: a.label || 'Edit', at: a.at || null, back: jdiff(nb, prev, [], []) } : { label: a.label || 'Edit', at: a.at || null, first: true };
      drafts[id] = nb; h.undo.push(step); h.redo = []; trimHist(h);
      return { changed: true, kind: 'program', persist: false, drafts: [id], hist: [id], data: { id: id, label: step.label }, keys: ['draft:' + id], ids: [id], events: [['program:saved', { id: id }]],
        undo: function () { if (had) drafts[id] = prev; else delete drafts[id]; var hh = hist(id), i = hh.undo.lastIndexOf(step); if (i >= 0) hh.undo.splice(i, 1); if (hh === h) h.redo = redo0; }, label: a.label ? endDot(a.label) : 'Saved.' };
    },
    /* one step back (dir 'back') or forward ('fwd') through a block's history; the page rebuilds from data.block */
    draftStep: function (a) {
      var id = a.id, h = hist(id), back = a.dir !== 'fwd', st = back ? h.undo[h.undo.length - 1] : h.redo[h.redo.length - 1];
      if (!st) return fail('nothing_to_undo', back ? 'Nothing to undo.' : 'Nothing to redo.');
      var had = has(drafts, id), cur = drafts[id], nx, other;
      if (!had && !(back ? st.first : st.whole)) return fail('conflict', 'This block changed somewhere else. Open it again.');
      if (back) { if (st.first) { nx = undefined; other = { label: st.label, at: st.at, whole: clone(cur) }; } else { nx = jpatch(clone(cur), st.back); other = { label: st.label, at: st.at, fwd: jdiff(nx, cur, [], []) }; } h.undo.pop(); h.redo.push(other); }
      else { if (st.whole) { nx = clone(st.whole); other = { label: st.label, at: st.at, first: true }; } else { nx = jpatch(clone(cur), st.fwd); other = { label: st.label, at: st.at, back: jdiff(nx, cur, [], []) }; } h.redo.pop(); h.undo.push(other); }
      if (nx === undefined) delete drafts[id]; else drafts[id] = nx;
      return { changed: true, kind: 'program', persist: false, drafts: [id], hist: [id], data: { id: id, dir: back ? 'back' : 'fwd', label: st.label, block: nx === undefined ? null : clone(nx) }, keys: ['draft:' + id], ids: [id], events: [['program:saved', { id: id, step: back ? 'back' : 'fwd' }]],
        undo: function () { if (had) drafts[id] = cur; else delete drafts[id]; if (back) { h.redo.pop(); h.undo.push(st); } else { h.undo.pop(); h.redo.push(st); } },
        label: back ? undoneSay(st.label) : 'Redone: ' + endDot(soft1(String(st.label || '').replace(/\.$/, ''))) };
    },
    /* a week goes to the lifter. The shared draft's week reads as block.js's markSent leaves it (sent, sentAt, version + 1,
       nothing kept from before); the program's week takes the draft's lines and is published. With a hold (ms), the
       program waits behind the toast: Undo before it lands means the lifter never saw it */
    programSend: function (a, ctx) {
      if (a && a.block === 'next') return nextSendOp(a, ctx);
      var l = L(a.id), p = l && l.program; if (!p) return fail('not_found', 'There is no program to send from.');
      var undos = [], key = l.id + ':' + a.n, hold = !(ctx && ctx.replay) && isNum(a.hold) && a.hold > 0, added = [];
      /* the draft's weeks past the program's end join it now (written, not sent); undo takes them out again */
      (Array.isArray(a.adds) ? a.adds : []).forEach(function (x) { if (p.weeks.length === x.n - 1) { var nwk = { n: x.n, published: false, days: clone(x.days) }; nwk.days.forEach(function (d) { if (d.sets == null) d.sets = setsIn(d.exercises); if (d.done == null) d.done = 0; }); p.weeks.push(nwk); added.push(nwk); } });
      if (added.length) undos.push(function () { added.slice().reverse().forEach(function (x) { var i = p.weeks.indexOf(x); if (i >= 0) p.weeks.splice(i, 1); }); });
      var w = p.weeks[a.n - 1]; if (!w) { chain(undos)(); return fail('not_found', 'There is no week ' + a.n + ' to send.'); }
      var dr = drafts[l.id], dw = dr && Array.isArray(dr.weeks) ? dr.weeks[a.n - 1] : null, inDraft = !!(dw && typeof dw === 'object');
      if (inDraft) {
        var pw = a.prevWeek && typeof a.prevWeek === 'object' ? a.prevWeek : { sent: a.prevSent != null ? a.prevSent : dw.sent, sentAt: dw.sentAt, version: dw.version, was: dw.was, taken: dw.taken };
        dw.sent = true; dw.sentAt = a.at; dw.version = (isNum(pw.version) ? pw.version : 0) + 1; dw.was = null; dw.taken = false;
        /* shared.md §4.11 (requests #53, #54): loads lock at Send; a later max change offers itself, it never moves a sent week */
        var BkL = BLK();
        if (BkL && typeof BkL.from === 'function') { try { var bL = BkL.from(dr), lr = bL.lock(a.n - 1), lk = lr && !lr.error && bL.weeks[a.n - 1] ? bL.weeks[a.n - 1].lock : null; if (lk && Object.keys(lk).length) { var hadLk = has(dw, 'lock'), prevLk = dw.lock; dw.lock = lk; undos.push(function () { var dd = drafts[l.id], ww = dd && dd.weeks && dd.weeks[a.n - 1]; if (!ww) return; if (hadLk) ww.lock = prevLk; else delete ww.lock; }); } } catch (e) { /* the week goes unlocked */ } }
        undos.push(function () { var dd = drafts[l.id], ww = dd && dd.weeks && dd.weeks[a.n - 1]; if (!ww) return; ['sent', 'sentAt', 'version', 'was', 'taken'].forEach(function (k) { if (pw[k] === undefined) delete ww[k]; else ww[k] = clone(pw[k]); }); });
      }
      function land() {
        var prevWeek = clone(w), pm = p.maxes;
        if (a.week && a.week.days) {
          var byName = {}; w.days.forEach(function (d) { byName[d.name] = d; });
          w.days = a.week.days.map(function (nd) { var od = byName[nd.name]; if (od && od.done > 0) return od; var d = clone(nd); if (od && od.date) d.date = od.date; return d; });
          w.days.forEach(function (d) { if (d.sets == null) d.sets = setsIn(d.exercises); if (d.done == null) d.done = 0; });
          if (a.maxes) p.maxes = clone(a.maxes);
        }
        w.published = true; w.sentAt = a.at; if (isStr(a.note) && a.note) w.note = a.note; delete w.changedSinceSent;
        var pn = p.name; if (a.name) p.name = a.name;
        /* programs.md §11.2: the coach's message lands with the week (verbatim, one Undo); the items it settles are done */
        var msg = null, ur = null, iu = [];
        if (isStr(a.message) && a.message) { msg = { me: true, body: a.message, at: a.at, read: true, type: 'text', meta: { week: a.n } }; l.messages = l.messages || []; l.messages.push(msg); ur = markRead(l); }
        (a.items || []).forEach(function (iid) { if (C.get(iid) && !doneOf(iid)) iu.push(itemDone(iid, { act: 'program', at: a.at, label: 'Week ' + a.n + ' sent' })); });
        /* spec C (FP F4.4, FD14): the first block's item settles on the lifter's first send */
        var fid = 'first-' + l.id; if (C.get(fid) && !doneOf(fid)) iu.push(itemDone(fid, { act: C.act(fid, 'send') ? 'send' : 'program', at: a.at, label: 'First block sent' }));
        return function () { chain(iu)(); if (ur) ur(); if (msg) { var mi = l.messages.indexOf(msg); if (mi >= 0) l.messages.splice(mi, 1); } p.maxes = pm; p.name = pn; Object.keys(w).forEach(function (k) { delete w[k]; }); Object.keys(prevWeek).forEach(function (k) { w[k] = prevWeek[k]; }); };
      }
      var sentWords = 'Week ' + a.n + ' sent to ' + l.first + (isStr(a.note) && a.note ? ' with the note “' + a.note + '”' : '.') + (isStr(a.message) && a.message ? ' Sent to ' + l.first + ': “' + a.message + '”' : '');
      var sItems = (a.items || []).filter(function (iid) { return C.get(iid) && !doneOf(iid); });
      if (C.get('first-' + l.id) && !doneOf('first-' + l.id) && sItems.indexOf('first-' + l.id) < 0) sItems.push('first-' + l.id);   /* spec C: settled in land() */
      var back = 'Week ' + a.n + ' taken back from ' + l.first + '.';
      if (!hold) {
        undos.push(land());
        return { changed: true, kind: 'program', persist: true, drafts: inDraft ? [l.id] : [], data: { id: l.id, n: a.n, held: false }, keys: ['week:' + l.id + ':' + a.n].concat(sItems.map(function (x) { return 'item:' + x; })), items: sItems, ids: [l.id].concat(sItems),
          events: [['program:sent', { id: l.id, n: a.n }]].concat(isStr(a.message) && a.message ? [['message:sent', { id: l.id }]] : [], sItems.map(function (x) { return ['item:done', { itemId: x, actId: 'program' }]; })),
          undo: chain(undos), label: sentWords, undoLabel: back };
      }
      var h = { id: l.id, n: a.n, at: a.at, until: new Date(Date.parse(a.at) + a.hold).toISOString(), land: land, t: null, timer: null, draft: inDraft };
      ST.held[key] = h;
      undos.push(function () { if (ST.held[key] === h) { if (h.timer) clearTimeout(h.timer); delete ST.held[key]; } });
      return { changed: true, kind: 'program', persist: false, drafts: [], data: { id: l.id, n: a.n, held: true, until: h.until }, keys: ['week:' + l.id + ':' + a.n], ids: [l.id],
        events: [['program:saved', { id: l.id, n: a.n, held: true }]], undoEvents: [['program:saved', { id: l.id, n: a.n, held: false }]],
        undo: chain(undos), label: sentWords,
        undoLabel: function () { return ST.held[key] === h ? 'Week ' + a.n + ' is back with you. ' + l.first + ' never saw it.' : back; },
        after: function (rec) { h.t = rec.t; h.timer = setTimeout(function () { landHeld(key); }, a.hold); } };
    },
    programStart: function (a) {
      var l = L(a.id); if (!l) return noLifter(a.id);
      if (l.program) return fail('conflict', l.first + ' is on ' + l.program.name + ' already. Write the next block in the Builder.');
      var tpl = a.tpl === 'starter' || a.tpl === 'blank' ? null : templates().filter(function (t) { return t.id === a.tpl; })[0];
      /* spec C (FTC §7.1, §7.2): a starter starts from the block BLOCK.fitStarter fitted when the coach pressed Start (a.json,
         kept in the log so a reload needs no engine); a template lands on the days BLOCK.placeDays picked (a.placed, FP F2.2) */
      var prog0 = a.tpl === 'starter' ? programFromBlock(a.json, l, a.startsOn) : a.tpl === 'blank' ? blankProgram(l, a.startsOn, a.days) : tpl ? fromTemplate(tpl, l, a.startsOn, a.days, a.placed, a.merge) : null;
      if (!prog0) return fail('not_found', a.tpl === 'starter' ? 'That starter could not be fitted to ' + l.first + '.' : 'There is no template ' + a.tpl + '.');
      if (a.maxes) LIFTS.forEach(function (k) { if (isNum(a.maxes[k])) prog0.maxes[k] = a.maxes[k]; });
      /* where each max came from (FP F6.2 numbers().max.from): the intake's estimate unless the coach typed one */
      prog0.maxFrom = {}; LIFTS.forEach(function (k) { prog0.maxFrom[k] = prog0.maxes[k] == null ? null : a.maxFrom && a.maxFrom[k] ? a.maxFrom[k] : a.maxes && isNum(a.maxes[k]) ? 'typed' : 'intake'; });
      if (a.from) prog0.from = a.from;
      if (a.defaults) prog0.defaults = clone(a.defaults);   /* LOGIC-FIX-3: block.js builds the block with them (b.defaults) */
      l.program = prog0; ST.starts[l.id] = { at: a.at, from: a.from || 'template' };
      var minded = tpl ? mindTemplate(l, prog0, a) : [];
      var undos = [function () { l.program = null; delete ST.starts[l.id]; }], items = [], keys = ['program:' + l.id], events = [['program:saved', { id: l.id }]], undoEvents = events.slice();
      /* spec C (FP F4.4, FD14): the first block's item (first-<id>) stays open after the start, as "First block not sent";
         it settles on the lifter's first send (programSend), never here */
      return { changed: true, kind: 'program', persist: true, data: { id: l.id, program: { name: prog0.name, weeks: prog0.weeks.length, startsOn: prog0.startsOn }, placed: a.placed ? clone(a.placed) : null, minded: minded }, keys: keys, items: items, ids: [l.id].concat(items), events: events, undoEvents: undoEvents, undo: chain(undos),
        label: a.from === 'intake' || a.tpl === 'blank' ? l.first + '’s first block starts ' + K.wd3(prog0.startsOn) + ' ' + K.dm(prog0.startsOn) + '. Nothing is sent yet.' : l.first + '’s first block: ' + prog0.name + ' from ' + K.wd3(prog0.startsOn) + ' ' + K.dm(prog0.startsOn) + '. Nothing is sent yet.' };
    },
    teamSend: function (a) {
      var t = teamOf(a.id); if (!t) return fail('not_found', 'There is no team ' + a.id + '.');
      /* week n goes to every member it reaches, at the team's latest revision: it is sent (teamWeekSent), the weeks after it
         keep their own state (data.js has rev 4 pushed at rev 3, so week 4 still holds changes after week 3 goes) */
      var T = t, sent = (ST.teamSent[a.id] = ST.teamSent[a.id] || {}), hadSent = has(sent, a.n), prevSent = sent[a.n], undos = [];
      /* screens.md §10.4: a held member is skipped; with ids, only those get it and every other member it reaches is held */
      var reach0 = teamReach(T, a.n), heldNow = [], hk = function (l) { return a.id + ':' + l.id + ':' + a.n; };
      var reach = reach0.filter(function (l) { var inIds = !a.ids || a.ids.indexOf(l.id) >= 0, h = !!ST.teamHeld[hk(l)];
        if (a.ids && inIds && h) { var pv = ST.teamHeld[hk(l)]; delete ST.teamHeld[hk(l)]; undos.push(function () { ST.teamHeld[hk(l)] = pv; }); return true; }
        if (!inIds && !h) { ST.teamHeld[hk(l)] = { at: a.at, by: 'send' }; undos.push(function () { delete ST.teamHeld[hk(l)]; }); }
        if (!inIds || h) { heldNow.push(l); return false; }
        return true; });
      sent[a.n] = a.at;
      reach.forEach(function (l) { var w = l.program.weeks[a.n - 1]; if (!w) return; var pp = w.published, pa = w.sentAt, hc = has(w, 'changedSinceSent'), pc = w.changedSinceSent, hs = has(w, 'seenAt'), ps = w.seenAt, wk = l.id + ':' + a.n, hw = has(ST.weekSeen, wk), pw = ST.weekSeen[wk]; w.published = true; w.sentAt = a.at; delete w.changedSinceSent; delete w.seenAt; delete ST.weekSeen[wk]; undos.push(function () { w.published = pp; if (pa === undefined) delete w.sentAt; else w.sentAt = pa; if (hc) w.changedSinceSent = pc; if (hs) w.seenAt = ps; if (hw) ST.weekSeen[wk] = pw; }); });   /* LOGIC-FIX-2: the changes went with it */
      undos.push(function () { if (hadSent) sent[a.n] = prevSent; else delete sent[a.n]; });
      /* who has it, by name in the Roster's order, and who it does not reach */
      var ord = {}; model().rows.slice().sort(function (x, y) { return x.tier - y.tier || x.ord - y.ord || x.name.localeCompare(y.name); }).forEach(function (r, i) { ord[r.id] = i; });
      var names = reach.slice().sort(function (x, y) { return ord[x.id] - ord[y.id]; }).map(function (l) { return l.first; });
      var left = T.members.map(function (m) { return K.L(m.id); }).filter(function (l) { return l && reach0.indexOf(l) < 0; }).map(function (l) { var fr = teamFrom(T, l); return l.first + (fr ? ' starts week ' + fr + '.' : ' has no program yet.'); });
      var hn = heldNow.slice().sort(function (x, y) { return ord[x.id] - ord[y.id]; }).map(function (l) { return l.first + '’s'; });
      return { changed: true, kind: 'team', persist: true, data: { id: a.id, n: a.n, ids: reach.map(function (l) { return l.id; }), held: heldNow.map(function (l) { return l.id; }) }, keys: ['teamweek:' + a.id + ':' + a.n].concat(heldNow.map(function (l) { return 'teamhold:' + hk(l); })), ids: [a.id].concat(T.members.map(function (m) { return m.id; })), events: [['program:sent', { team: a.id, n: a.n }]], undo: chain(undos),
        label: Array.isArray(a.hold) ? 'Week ' + a.n + ' sent to ' + K.plural(names.length, 'lifter') + '.' + (heldNow.length ? ' Held for ' + K.list(heldNow.slice().sort(function (x, y) { return ord[x.id] - ord[y.id]; }).map(function (l) { return l.first; }), 9) + '.' : '')
          : (names.length ? 'Week ' + a.n + ' is with ' + K.list(names, 9) + ', each at their own max.' : 'Week ' + a.n + ' went to nobody.') + (hn.length ? ' ' + K.list(hn, 9) + (hn.length === 1 ? ' is' : ' are') + ' held.' : '') + (left.length ? ' ' + left.join(' ') : ''), undoLabel: 'Week ' + a.n + ' taken back from the ' + T.name + '.' };
    },
    /* a member with no program joins the team's program from a week to come, at their own numbers (startMaxes: the
       intake's best sets for a new lifter); the weeks before it are empty, so the team's counts do not move */
    teamStart: function (a) {
      var T = teamOf(a.id), l = L(a.lifterId); if (!T || !l) return fail('not_found', 'There is no such team or lifter.');
      if (l.program) return fail('conflict', l.first + ' is on ' + l.program.name + ' already.');
      var wn = a.n, mx = startMaxes(l), on = K.add(T.startsOn, (wn - 1) * 7), off = teamDayOffsets(T);
      /* screens.md §10.4: maxes the coach typed in the start sheet win (Start at 90%), else the intake's, to the step */
      LIFTS.forEach(function (k) { if (a.maxes && isNum(a.maxes[k])) mx[k] = a.maxes[k]; else if (isNum(mx[k])) mx[k] = Math.round(mx[k] / 2.5) * 2.5; });
      var weeks = T.weeks.map(function (w, wi) {
        if (wi + 1 < wn) return { n: w.n, published: true, days: [] };
        return { n: w.n, published: teamWeekSent(T, w.n), days: w.days.map(function (d) {
          var exs = (d.exercises || []).map(function (e) { var lift = MAIN[e.lift] ? e.lift : null; return { lift: e.lift, variant: e.variant || (lift ? 'Competition' : ''), title: e.title, note: '', sets: e.sets.filter(function (s0) { return !s0.extra; }).map(function (s0) { var o = { w: 0, r: s0.r, done: 0 }; if (s0.rpe != null) o.rpe = s0.rpe; if (s0.rpeHi != null) o.rpeHi = s0.rpeHi; if (s0.pct != null) { o.pct = s0.pct; if (lift && mx[lift]) o.w = K.round(mx[lift] * s0.pct / 100); } return o; }) }; });
          return { name: d.name, date: exs.length && off[d.name] != null ? K.add(T.startsOn, wi * 7 + off[d.name]) : null, sets: setsIn(exs), done: 0, exercises: exs };
        }) };
      });
      var mf = {}; LIFTS.forEach(function (k) { mf[k] = a.maxes && isNum(a.maxes[k]) ? 'typed' : 'intake'; });
      l.program = { id: 'prog-' + l.id, name: T.program, startsOn: on, meetDate: null, maxes: mx, maxFrom: mf, cols: [], weekIdx: -1, teamFrom: wn, weeks: weeks };
      var mem = T.members.filter(function (m) { return m.id === l.id; })[0], prevPush = mem ? mem.pushedRev : undefined;
      if (mem) mem.pushedRev = T.rev || 0;
      var undos = [function () { l.program = null; if (mem) mem.pushedRev = prevPush; }], items = [], keys = ['program:' + l.id, 'team:' + a.id + ':' + l.id], events = [['program:saved', { id: l.id, team: a.id }]], undoEvents = events.slice();
      var fit = C.get('first-' + l.id);
      if (fit && !a.noItem && !doneOf(fit.id)) { undos.push(itemDone(fit.id, { act: 'team', at: a.at, label: 'Starts week ' + wn + ' with the team' })); items.push(fit.id); keys.push('item:' + fit.id); events.unshift(['item:done', { itemId: fit.id, actId: 'team' }]); undoEvents.unshift(['item:undone', { itemId: fit.id, actId: 'team' }]); }
      return { changed: true, kind: 'program', persist: true, data: { id: l.id, team: a.id, from: wn, startsOn: on }, keys: keys, items: items, ids: [l.id, a.id].concat(items), events: events, undoEvents: undoEvents, undo: chain(undos),
        label: l.first + ' starts week ' + wn + ' of the ' + T.name + ' on ' + K.wd(on).slice(0, 3) + ' ' + K.dm(on) + (a.maxes ? ', at ' + LIFTS.map(function (k) { return n(mx[k]); }).join(', ') + '.' : ', at maxes from ' + (l.intake && l.intake.by === 'coach' ? 'what you typed.' : 'the intake.')), undoLabel: l.first + ' is off the ' + T.name + '’s program again.' };
    },
    teamMessage: function (a) {
      var t = teamOf(a.id); if (!t) return fail('not_found', 'There is no team ' + a.id + '.');
      var to = a.to ? [a.to] : t.members.map(function (m) { return m.id; }), msgs = [];
      to.forEach(function (id) { var l = K.L(id); if (!l) return; var m = { me: true, body: a.text, at: a.at, read: true, type: 'text', meta: { team: a.id } }; l.messages = l.messages || []; l.messages.push(m); msgs.push([l, m]); });
      return { changed: true, kind: 'message', persist: true, data: { id: a.id, to: to }, keys: ['teammsg:' + a.id + ':' + a.at], ids: to, events: [['message:sent', { team: a.id, ids: to }]],
        undo: function () { msgs.forEach(function (x) { var i = x[0].messages.indexOf(x[1]); if (i >= 0) x[0].messages.splice(i, 1); }); }, label: a.to ? 'Sent to ' + K.L(a.to).first + '.' : 'Sent to the ' + t.name + '.', undoLabel: 'Message taken back.' };
    },
    meet: function (a) {   /* every change to a lifter's meet plan and to a meet day's board */
      var l = a.lifterId ? L(a.lifterId) : null; if (a.lifterId && (!l || !l.meet)) return fail('not_found', 'No meet for that lifter.');
      var mid = a.meetId || (l ? meetId(l.meet) : null), prevPlan = l ? (has(ST.plans, l.id) ? clone(ST.plans[l.id]) : undefined) : undefined, prevBoard = has(ST.boards, mid) ? clone(ST.boards[mid]) : undefined, prevSet = l ? l.meet.attemptsSet : undefined;
      /* a write about several lifters of one meet (their weigh-ins) keeps each one's plan as it was */
      var others = a.what === 'weighs' ? (a.ids || []).map(K.L).filter(Boolean) : [], prevOthers = others.map(function (x) { return has(ST.plans, x.id) ? clone(ST.plans[x.id]) : undefined; });
      var snap = function () { return JSON.stringify([l ? planOf(l) : null, boardOf(mid), l ? l.meet.attemptsSet : undefined, others.map(planOf)]); };
      var before = snap(), keys = [], label = '', data = {};
      var pl = l ? planFor(l) : null, bd = ST.boards[mid] || (ST.boards[mid] = { stage: 'weigh', cards: false });
      var who = l ? l.first + '’s ' : '', attName = function (lift, k) { return who + (k > 1 ? ORDW[k - 1] + ' ' + lift : lift + ' opener'); };
      if (a.what === 'attempt') {
        var lift = a.lift, k = a.k - 1, onDay = l.meet.days === 0;
        pl.a[lift][k] = a.kg; for (var j = k + 1; j < 3; j++) if (!judged(pl.st[lift][j]) && pl.a[lift][j] < pl.a[lift][j - 1] + 2.5) pl.a[lift][j] = pl.a[lift][j - 1] + 2.5;
        /* numbers changed by hand are no preset's any more; on the day a change calls the attempt to the table only when it is
           the lifter's next one (every attempt before it judged): a later one stays planned */
        pl.preset = null;
        if (onDay && pl.st[lift][k] === 'planned' && (k === 0 || judged(pl.st[lift][k - 1]))) pl.st[lift][k] = 'called';
        keys = ['plan:' + l.id + ':' + lift]; label = upper1(attName(lift, a.k)) + ' is ' + n(a.kg) + ' kg.'; data = { lifterId: l.id, lift: lift, k: a.k, kg: a.kg };
      } else if (a.what === 'openers') {
        var ch0 = [];
        LIFTS.forEach(function (L2) { if (!isNum(a.kg[L2]) || judged(pl.st[L2][0])) return; if (pl.a[L2][0] !== a.kg[L2]) ch0.push(K.LIFT[L2].toLowerCase() + ' ' + n(a.kg[L2])); pl.a[L2][0] = a.kg[L2]; for (var q2 = 1; q2 < 3; q2++) if (!judged(pl.st[L2][q2]) && pl.a[L2][q2] < pl.a[L2][q2 - 1] + 2.5) pl.a[L2][q2] = pl.a[L2][q2 - 1] + 2.5; if (l.meet.days === 0 && pl.st[L2][0] === 'planned') pl.st[L2][0] = 'called'; });
        pl.preset = null; keys = LIFTS.map(function (L2) { return 'plan:' + l.id + ':' + L2; });
        label = l.first + '’s openers are ' + (ch0.length ? K.list(ch0, 3) : 'as they were') + '.'; data = { lifterId: l.id, openers: { squat: pl.a.squat[0], bench: pl.a.bench[0], deadlift: pl.a.deadlift[0] } };
      } else if (a.what === 'preset') {
        LIFTS.forEach(function (L2) { var o = presetFor(l, L2, a.preset); for (var q = 0; q < 3; q++) if (!judged(pl.st[L2][q])) pl.a[L2][q] = o[q]; });
        pl.preset = a.preset; keys = ['plan:' + l.id + ':squat', 'plan:' + l.id + ':bench', 'plan:' + l.id + ':deadlift'];
        label = l.first + '’s attempts are ' + PNAME[a.preset] + ': ' + LIFTS.map(function (L2) { return K.LIFT[L2].toLowerCase() + ' ' + pl.a[L2].map(n).join(', '); }).join('; ') + '.'; data = { lifterId: l.id, preset: a.preset };
      } else if (a.what === 'send') {
        pl.sent = { at: a.at, first: pl.sent && (pl.sent.first || pl.sent.at) || a.at, snap: JSON.stringify(pl.a) }; l.meet.attemptsSet = true;   /* first: when the attempts card went into the thread (LOGIC-FIX-2) */
        keys = ['plansent:' + l.id]; label = l.first + ' has the attempts: ' + LIFTS.map(function (L2) { return K.LIFT[L2].toLowerCase() + ' ' + pl.a[L2].map(n).join(', '); }).join('; ') + '.'; data = { lifterId: l.id, sent: true };
      } else if (a.what === 'weigh') {
        pl.weigh = a.state; keys = ['weigh:' + l.id]; if (a.at && a.state !== 'not') pl.weighAt = a.at; else delete pl.weighAt;
        if (a.state === 'not') delete pl.scale; else if (isNum(a.kg)) pl.scale = a.kg; else delete pl.scale;
        var sc = isNum(pl.scale) ? 'weighed ' + n(pl.scale) + ': ' : '';
        label = a.state === 'made' ? l.first + (sc ? ' ' + sc + 'made' : ' made') + ' weight for ' + clsWords(pl.cls) + '.' : a.state === 'over' ? l.first + (sc ? ' ' + sc : ' ') + (sc ? 'over' : 'is over') + ' at the scale. It stays open until ' + hm(WEIGH_CLOSE) + '.' : l.first + ' has not weighed in yet.'; data = { lifterId: l.id, weigh: a.state, scale: isNum(pl.scale) ? pl.scale : null };
      } else if (a.what === 'weighs') {
        var m1 = meetById(mid), who = [];
        (a.ids || []).forEach(function (id1) { var x1 = K.L(id1); if (!x1 || !m1 || m1.lifterIds.indexOf(id1) < 0) return; var p1 = planFor(x1); if (p1.weigh !== a.state) { p1.weigh = a.state; who.push(x1.first); } keys.push('weigh:' + id1); });
        label = !who.length ? 'Nothing to weigh.' : a.state === 'made' ? (who.length === 1 ? who[0] + ' made weight.' : K.list(who, 9) + ' all made weight.') : K.list(who, 9) + (a.state === 'over' ? ' are over at the scale.' : ' have not weighed in yet.'); data = { meetId: mid, ids: a.ids.slice(), weigh: a.state };
      } else if (a.what === 'judge') {
        var st = a.good === true ? 'good' : a.good === false ? 'no' : 'called', kk = a.k - 1;
        pl.st[a.lift][kk] = st; keys = ['att:' + l.id + ':' + a.lift + ':' + a.k];
        label = st === 'called' ? upper1(attName(a.lift, a.k)) + ' is not judged yet.' : (st === 'good' ? 'Good lift: ' : 'No lift: ') + l.first + ', ' + n(pl.a[a.lift][kk]) + ' kg.';
        if (bd.stage === a.lift && st !== 'called') {
          var m0 = meetById(mid), left = m0 ? m0.lifterIds.some(function (id) { var x = K.L(id), pp = x && planOf(x); return pp && pp.st[a.lift].some(function (s) { return !judged(s); }); }) : true;
          if (!left) { var nx = STAGES[STAGES.indexOf(a.lift) + 1]; bd.stage = nx; keys.push('stage:' + mid); label += nx === 'done' ? ' That is the meet.' : ' ' + STAGE_NAME[a.lift] + ' is done. ' + STAGE_NAME[nx] + ' is next.'; }
        }
        data = { lifterId: l.id, lift: a.lift, k: a.k, st: st, stage: bd.stage };
      } else if (a.what === 'stage') {
        bd.stage = a.stage; keys = ['stage:' + mid]; label = STAGE_NAME[a.stage] === 'Done' ? 'The meet is done.' : STAGE_NAME[a.stage] + ' is on.'; data = { meetId: mid, stage: a.stage };
      } else if (a.what === 'note') {
        pl.note = a.text; keys = ['meetnote:' + l.id]; label = 'Saved to ' + l.first + '’s meet notes.'; data = { lifterId: l.id };
      } else if (a.what === 'tick') {
        var tk = PREP.filter(function (t) { return t[0] === a.tick; })[0]; pl.ticks = pl.ticks || {}; pl.ticks[a.tick] = !!a.on;
        keys = ['tick:' + l.id + ':' + a.tick]; label = a.on ? tk[1] + ' ' + tk[2] + '.' : tk[1] + ': not yet.'; data = { lifterId: l.id, tick: a.tick, on: !!a.on };
      } else if (a.what === 'rung') {
        pl.rungs = pl.rungs || {}; var rr = pl.rungs[a.lift] = (pl.rungs[a.lift] || []).slice(); rr[a.i] = !!a.on; for (var q = 0; q < rr.length; q++) if (rr[q] == null) rr[q] = false;
        pl.rungAt = pl.rungAt || {}; var ra = pl.rungAt[a.lift] = (pl.rungAt[a.lift] || []).slice(); ra[a.i] = a.on && isNum(a.min) ? a.min : null; for (var q3 = 0; q3 < ra.length; q3++) if (ra[q3] === undefined) ra[q3] = null;
        keys = ['rung:' + l.id + ':' + a.lift + ':' + a.i]; label = l.first + '’s ' + n(a.kg) + ' kg warm-up ' + (a.on ? 'is done.' : 'is not done yet.'); data = { lifterId: l.id, lift: a.lift, i: a.i, on: !!a.on };
      } else if (a.what === 'rungs') {
        pl.rungs = pl.rungs || {}; pl.rungAt = pl.rungAt || {};
        var rs = pl.rungs[a.lift] = (pl.rungs[a.lift] || []).slice(), rt = pl.rungAt[a.lift] = (pl.rungAt[a.lift] || []).slice();
        (a.is || []).forEach(function (i1) { rs[i1] = !!a.on; rt[i1] = a.on && isNum(a.min) ? a.min : null; keys.push('rung:' + l.id + ':' + a.lift + ':' + i1); });
        for (var q4 = 0; q4 < rs.length; q4++) { if (rs[q4] == null) rs[q4] = false; if (rt[q4] === undefined) rt[q4] = null; }
        label = l.first + '’s ' + (a.is.length === 1 ? 'warm-up' : a.is.length + ' warm-ups') + (a.on ? (a.is.length === 1 ? ' is done.' : ' are done.') : ' are not done yet.'); data = { lifterId: l.id, lift: a.lift, is: a.is.slice(), on: !!a.on };
      } else if (a.what === 'cut') {
        pl.cuts = pl.cuts || {};
        if (a.off) { delete pl.cuts[a.lift]; label = l.first + '’s warm-ups are back as planned.'; }
        else { pl.cuts[a.lift] = { singles: a.singles.slice(), out: a.out.slice(), at: clone(a.at || {}) }; label = l.first + '’s warm-ups are cut to ' + K.plural(a.singles.filter(function (i) { return i > 0; }).length, 'single') + '.'; }
        keys = ['cut:' + l.id + ':' + a.lift]; data = { lifterId: l.id, lift: a.lift, cut: !a.off };
      } else if (a.what === 'cards') {
        bd.cards = true; keys = ['cards:' + mid]; label = 'Each lifter has their card: every attempt and the total.'; data = { meetId: mid };
      } else return fail('invalid', 'Not a meet move.');
      var putBack = function () { others.forEach(function (x, i) { if (prevOthers[i] === undefined) delete ST.plans[x.id]; else ST.plans[x.id] = clone(prevOthers[i]); }); };
      if (snap() === before) {
        if (l) { if (prevPlan === undefined) delete ST.plans[l.id]; else ST.plans[l.id] = prevPlan; }
        if (prevBoard === undefined) delete ST.boards[mid]; else ST.boards[mid] = prevBoard;
        putBack();
        if (a.what !== 'send') return { changed: false, data: data, label: label };
      }
      /* screens.md §10.3: made weight settles that lifter's meet item (never another's); Undo puts it back */
      var mUndo = [], mItems = [], mEv = [];
      var settleMeet = function (x, kg) { var mi = C.get('meet-today-' + x.id); if (!mi || doneOf(mi.id)) return; mUndo.push(itemDone(mi.id, { act: 'weigh', at: a.at || stamp(), label: 'Made weight' + (isNum(kg) ? ': ' + n(kg) + ' on the scale' : '') })); mItems.push(mi.id); keys.push('item:' + mi.id); mEv.push(['item:done', { itemId: mi.id, actId: 'weigh' }]); };
      if (a.what === 'weigh' && a.state === 'made' && l) settleMeet(l, a.kg);
      if (a.what === 'weighs' && a.state === 'made') others.forEach(function (x) { settleMeet(x, null); });
      return { changed: true, kind: 'meet', persist: true, data: data, keys: keys, items: mItems, ids: [mid].concat(l ? [l.id] : [], others.map(function (x) { return x.id; }), mItems), events: [['meet:changed', { meetId: mid, lifterId: l ? l.id : null, what: a.what }]].concat(mEv),
        undoEvents: [['meet:changed', { meetId: mid, lifterId: l ? l.id : null, what: a.what }]].concat(mEv.map(function (e) { return ['item:undone', e[1]]; })),
        undo: function () { chain(mUndo)(); if (l) { if (prevPlan === undefined) delete ST.plans[l.id]; else ST.plans[l.id] = prevPlan; l.meet.attemptsSet = prevSet; } if (prevBoard === undefined) delete ST.boards[mid]; else ST.boards[mid] = prevBoard; putBack(); }, label: label };
    },
    billPaid: function (a) {
      var l = L(a.id); if (!l || !l.billing) return fail('not_found', 'No billing for that lifter.');
      var b = l.billing, prevB = clone(b), p = { on: a.on, amount: a.amount, method: a.method };
      l.payments = l.payments || []; l.payments.unshift(p);
      var base = b.nextDue || a.on; b.nextDue = after(base, b);   /* one payment settles one due date: a lifter late twice is still late once */
      if (b.status && b.status.state !== 'paused') b.status = statusFor(b);
      return { changed: true, kind: 'billing', persist: true, data: { id: l.id, payment: clone(p), nextDue: b.nextDue }, keys: ['bill:' + l.id], ids: [l.id], events: [['billing:changed', { id: l.id }]],
        undo: function () { var i = l.payments.indexOf(p); if (i >= 0) l.payments.splice(i, 1); Object.keys(b).forEach(function (k) { delete b[k]; }); Object.keys(prevB).forEach(function (k) { b[k] = prevB[k]; }); },
        label: l.first + ' paid ' + K.money(a.amount) + ' ' + K.when(a.on) + '. Next payment ' + K.dm(b.nextDue) + '.' };
    },
    billRemind: function (a) {
      var l = L(a.id); if (!l || !l.billing) return fail('not_found', 'No billing for that lifter.');
      var had = has(ST.reminders, l.id), prev = ST.reminders[l.id], last = (l.payments || [])[0], ps = payState(l), due = l.billing.nextDue;
      /* late: still open; not due yet: a heads-up for the day it falls due */
      var wordsTo = ps.state === 'late' || !due ? 'Hi ' + l.first + ', this month’s ' + K.money(l.billing.amount) + ' is still open. ' + ((last && AS_USUAL[last.method]) || '') + 'Thanks.'
        : 'Hi ' + l.first + ', a heads-up that this month’s ' + K.money(l.billing.amount) + ' is due ' + (ps.days === 0 ? 'today' : ps.days === 1 ? 'tomorrow' : K.wd(due)) + '. ' + ((last && AS_USUAL[last.method]) || '') + 'Thanks.';
      ST.reminders[l.id] = { when: a.when, on: a.on, words: wordsTo };
      return { changed: true, kind: 'billing', persist: true, data: { id: l.id, when: a.when }, keys: ['bill:' + l.id], ids: [l.id], events: [['billing:changed', { id: l.id }]],
        undo: function () { if (had) ST.reminders[l.id] = prev; else delete ST.reminders[l.id]; }, label: a.when === 'tomorrow' ? l.first + ' lifts today, so the reminder goes out tomorrow morning.' : l.first + ' got: “' + wordsTo + '”' };
    },
    billState: function (a) {
      var l = L(a.id); if (!l) return noLifter(a.id);
      var prevB = clone(l.billing), b;
      if (a.what === 'pause') { b = l.billing; b.status = { state: 'paused', days: null, label: 'Paused', due: null }; }
      else if (a.what === 'restart') { b = l.billing; b.status = { state: 'ok' }; if (!b.nextDue || b.nextDue < a.on) b.nextDue = a.on; b.status = statusFor(b); }
      else if (a.what === 'package') { b = l.billing || (l.billing = { pkg: '', amount: 0, cur: 'USD', cadence: 'monthly', nextDue: null, status: { state: 'ok' }, note: '' }); b.pkg = a.pkg.name; b.amount = a.pkg.amount; b.cadence = a.pkg.cadence; if (!b.nextDue) b.nextDue = a.on; b.status = statusFor(b); }
      else return fail('invalid', 'Not a billing move.');
      var said = a.what === 'pause' ? l.first + '’s billing is paused. Nothing is due until you restart it.' : a.what === 'restart' ? l.first + '’s billing is back on: ' + price(b) + ', due ' + K.when(b.nextDue, { bare: true }) + '.' : l.first + ' is on ' + b.pkg + ', ' + price(b) + ', from ' + K.when(b.nextDue, { bare: true }) + '.';
      return { changed: true, kind: 'billing', persist: true, data: { id: l.id, billing: clone(b) }, keys: ['bill:' + l.id], ids: [l.id], events: [['billing:changed', { id: l.id }]],
        undo: function () { if (prevB == null) l.billing = null; else { var bb = l.billing; Object.keys(bb).forEach(function (k) { delete bb[k]; }); Object.keys(prevB).forEach(function (k) { bb[k] = prevB[k]; }); } }, label: said };
    },
    appReply: function (a) {
      var x = apps().filter(function (z) { return z.id === a.appId; })[0]; if (!x || !x.it) return fail('not_found', 'There is no application ' + a.appId + '.');
      var had = has(ST.appReplies, a.appId), prev = ST.appReplies[a.appId], first = x.a.name.split(' ')[0];
      ST.appReplies[a.appId] = { text: a.text, at: a.at };
      return { changed: true, kind: 'billing', persist: true, data: { appId: a.appId, replied: true }, keys: ['appreply:' + a.appId], ids: [x.it.id], events: [['billing:changed', { appId: a.appId }]],
        undo: function () { if (had) ST.appReplies[a.appId] = prev; else delete ST.appReplies[a.appId]; }, label: 'Sent to ' + first + '. The application stays open.', undoLabel: 'Reply taken back.' };
    },
    app: function (a) {
      var x = apps().filter(function (z) { return z.id === a.appId; })[0]; if (!x || !x.it) return fail('not_found', 'There is no application ' + a.appId + '.');
      var u = itemDone(x.it.id, { act: a.yes ? 'yes' : 'no', at: a.at }), first = x.a.name.split(' ')[0];
      return { changed: true, kind: 'billing', persist: false, data: { appId: a.appId, accepted: !!a.yes }, keys: ['item:' + x.it.id], items: [x.it.id], ids: [x.it.id],
        events: [['item:done', { itemId: x.it.id, actId: a.yes ? 'yes' : 'no' }], ['billing:changed', { appId: a.appId }]], undoEvents: [['item:undone', { itemId: x.it.id, actId: a.yes ? 'yes' : 'no' }], ['billing:changed', { appId: a.appId }]], undo: u,
        label: a.yes ? first + ' has the invite: powalifta.com/j/' + inviteCode(x.a.name) + '. The intake lands here once it is filled in.' : 'Declined ' + first + '.' };
    }
  };
  /* ================= STORE-1 (spec B, 13 Nov): one dating rule, the queue, the proposal, previews, the week's record =================
     shared.md §2 and §6, programs.md §11, overview-lifters.md §9.1, screens.md §10.1 to §10.3, §10.6, §10.7, §10.9 */
  var WD_DEF = [1, 3, 5, 6, 0, 2, 4];
  function trainDays(w) { return (w ? w.days : []).filter(function (d) { return d.exercises && d.exercises.length; }); }
  function isPeakWk(w) { return trainDays(w).some(function (d) { return /open|meet|peak/i.test(d.name); }); }
  function dmyOf(iso) { return iso ? K.wd3(iso) + ' ' + K.dm(iso) : ''; }
  /* programs.md §11.4, one dating rule: a day's stored date wins; else the same day in the nearest dated week, 7 days a
     week apart; else the block's start plus the day's weekday; else the Monday of the program's current week plus the
     day's weekday (Nina: Mon 9, Wed 11, Fri 13) */
  function dayDateOf(l, wi, name) {
    var p = l && l.program; if (!p) return null;
    if (D.solo) return null;   /* 26 Nov (solo): a lifter's own sessions have no dates the app gave them; none are made up here */
    var w = p.weeks[wi], d = w ? w.days.filter(function (x) { return x.name === name; })[0] : null;
    if (d && d.date) return day10(d.date);
    /* LOGIC-FIX-4 (walk 2, Tomas: week 2's deadlift and week 3's squat both on Wed 11): a week with no dates of its own keeps
       its days in order after the week before it; a pattern date on or before the last session before it moves on two days */
    if (w && wi > 0) { var fx = orderedWeekDates(l, wi); if (fx && fx[name]) return fx[name]; }
    return patternDateOf(l, wi, name);
  }
  function orderedWeekDates(l, wi) {
    var p = l.program, w = p && p.weeks[wi]; if (!w || wi <= 0) return null;
    return cached('owd:' + l.id + ':' + wi, function () {
      var prevW = p.weeks[wi - 1], last = null;
      trainDays(prevW).forEach(function (d) { var x = dayDateOf(l, wi - 1, d.name); if (x && (!last || x > last)) last = x; });
      var out = {}, at = last;
      trainDays(w).map(function (d) { return { name: d.name, own: d.date ? day10(d.date) : null, iso: d.date ? day10(d.date) : patternDateOf(l, wi, d.name) }; })
        .sort(function (a, b) { return String(a.iso).localeCompare(String(b.iso)); })
        .forEach(function (x) { var iso = x.iso; if (!x.own && at && iso && iso <= at) iso = K.add(at, 2); out[x.name] = iso; if (iso && (!at || iso > at)) at = iso; });
      return out;
    });
  }
  function patternDateOf(l, wi, name) {
    var p = l && l.program; if (!p) return null;
    var w = p.weeks[wi];
    var best = null;
    p.weeks.forEach(function (w2, wj) { var d2 = w2.days.filter(function (x) { return x.name === name && x.date; })[0]; if (d2 && (!best || Math.abs(wj - wi) < Math.abs(best.wj - wi))) best = { wj: wj, iso: day10(d2.date) }; });
    if (best) return K.add(best.iso, 7 * (wi - best.wj));
    var names = trainDays(w || p.weeks[0]).map(function (x) { return x.name; }), wd = WD_DEF[Math.max(0, names.indexOf(name))];
    var base = p.startsOn ? K.add(day10(p.startsOn), 7 * wi) : K.add(K.monday(TODAY), 7 * (wi - Math.max(0, p.weekIdx)));
    return K.add(base, (wd - K.d(base).getDay() + 7) % 7);
  }
  function weekDates(l, wi) { var p = l.program, w = p && p.weeks[wi], o = {}; trainDays(w).forEach(function (d) { o[d.name] = dayDateOf(l, wi, d.name); }); return o; }
  function opDays(op) { var a = []; if (op.day) a.push(op.day); if (isStr(op.row)) a.push(op.row.split('|')[0]); (op.days || []).forEach(function (x) { a.push(x); }); if (op.a) a.push(op.a); if (op.b) a.push(op.b); return uniq(a); }
  /* the first session a change affects: the earliest of the days its ops touch still to come */
  function changeOn(l, ops) {
    var p = l.program, all = [];
    ops.forEach(function (op) { var wi = (isNum(op.week) ? op.week : p.weekIdx + 1) - 1, w = p.weeks[wi]; opDays(op).forEach(function (dn) { var d = w ? w.days.filter(function (x) { return x.name === dn; })[0] : null, iso = dayDateOf(l, wi, dn); if (iso) all.push({ iso: iso, done: !!(d && d.done > 0) }); }); });
    var fut = all.filter(function (x) { return !x.done && x.iso >= TODAY; }).map(function (x) { return x.iso; }).sort();
    return fut[0] || all.map(function (x) { return x.iso; }).sort()[0] || TODAY;
  }
  /* the week after a meet starts on the first day at least two days after it that falls on the first training day of the
     last normal week (BLOCK.recovery's rule): Priya Thu 12, Tom Mon 16, Callum Tue 17 */
  function srcWeek(p) { var s = p.weeks.length - 1; while (s > 0 && isPeakWk(p.weeks[s])) s--; return s; }
  /* the last normal week of a block that ends (or ended) at a meet: the recovery week's source, never the openers (programs
     md §6.3; F15). Null for a block that does not end at a meet within two weeks */
  function lastNormalOf(l) { var p = l && l.program; if (!p || !l.meet || l.meet.days > 14 || l.meet.days < -7) return null; return srcWeek(p) + 1; }
  function afterMeetOn(l) {
    var p = l.program, meet = l.meet.date ? day10(l.meet.date) : K.add(TODAY, l.meet.days), src = srcWeek(p);
    var first = trainDays(p.weeks[src])[0], iso = first ? dayDateOf(l, src, first.name) : null, at = K.add(meet, 2);
    if (!iso) return at; var wd = K.d(iso).getDay(); while (K.d(at).getDay() !== wd) at = K.add(at, 1); return at;
  }
  function firstOn(l) {
    var nm = nextMonday(), days = l.intake && l.intake.days, WDN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    if (!days || !days.length) return nm;
    var wd = WDN[String(days[0]).slice(0, 3)]; return wd == null ? nm : K.add(nm, (wd - 1 + 7) % 7);
  }
  /* the item that puts a lifter in Messages' Write first group (screens.md §6.2): silence or recovery, answered by your words;
     Keep-an-eye-on items (later) count (Tomas) */
  function wfItem(id) { return C.forLifter(id).filter(function (it) { if (it.ids.length !== 1 || doneOf(it.id) || !/^(quiet|low)-/.test(it.id)) return false; var a0 = mainAct(it); return !!(a0 && a0.reply != null && !a0.keep); })[0] || null; }
  function openNeedItems(l) { return C.forLifter(l.id).filter(function (it) { return it.ids.length === 1 && !it.later && !it.routine && it.group !== 'good' && !doneOf(it.id); }); }
  function mainAct(it) { return it.acts.filter(function (a) { return a.kind === 'primary'; })[0] || it.acts[0] || null; }
  function partWord(t) { var m = /\b(knee|back|hip|shoulder|elbow|wrist|ankle|neck|pec|hamstring)\b/i.exec(String(t || '')); return m ? m[1].toLowerCase() : null; }
  /* the sends this week (the week's record), newest first: Programs' "Sent this week" */
  function sendsThisWeek() {
    var mon = K.monday(TODAY), out = [];
    /* a send still held behind its toast is in this list already (its row left To do: the badge never counts it twice) */
    LOG.forEach(function (rec) {
      if (!rec.a || !isStr(rec.a.at) || localIso(tOf(rec.a.at)).slice(0, 10) < mon) return;
      if (rec.op === 'programSend') { var nx = rec.a.block === 'next'; out.push({ lifterId: rec.a.id, n: rec.a.n, at: rec.a.at, t: rec.t, next: nx, held: !!ST.held[rec.a.id + ':' + (nx ? 'next:' : '') + rec.a.n] }); return; }
      /* FIX-LOGIC (programs F19, jobs weekend): a first block's weeks sent in one write (sendMany) are sent work: one row */
      if (rec.op === 'weeksSend') { var ns = (rec.a.weeks || []).map(function (w) { return w.n; }).filter(isNum); if (ns.length) out.push({ lifterId: rec.a.id, n: ns[0], ns: ns, at: rec.a.at, t: rec.t, next: false, held: false }); return; }
      /* request #41a: a change that reached a week the lifter has (a To do change row's move, from any page) is sent work too */
      if (rec.op === 'item' && !rec.a.label) {
        var it = C.get(rec.a.itemId), act = it ? actOf(it, rec.a.actId) : null, d = it ? doneOf(it.id) : null;
        if (!it || !act || !d || it.ids.length !== 1 || !act.ops || !act.ops.length || landsOf(it, act) !== 'published') return;
        out.push({ lifterId: it.ids[0], n: act.ops[0].week, at: rec.a.at, t: rec.t, change: true, what: doneLabel(it, d), seenAt: weekSeenAfter(rec), held: false });
      }
    });
    return out.reverse();
  }
  /* PL.programs.queue (programs.md §3.3, §11.1): To do in one order (pain first by its day, then the day of the first
     session the work affects, then the triage order; a team row after the lifters of its day), Blocks ending, Sent this
     week, everyone else */
  function queueRows() {
    return cached('queue', function () {
      var M = model(), pr = {}, todo = [], ending = [], done = [], rest = [], inTodo = {};
      programRows().forEach(function (r) { pr[r.lifterId] = r; });
      var mk = function (l, o) {
        var row = { id: 'q:' + l.id + ':' + o.kind, lifterId: l.id, first: l.first, name: l.name, kind: o.kind, group: o.group || 'todo', block: o.block || 'current', week: o.week == null ? null : o.week,
          on: o.on || null, due: o.on ? K.add(o.on, -1) : null, day: o.on ? K.wd3(o.on) + (K.daysTo(o.on) > 6 ? ' ' + K.d(o.on).getDate() : '') : '', what: o.what, flag: o.flag || null, itemIds: o.itemIds || [], teamId: null, href: null, done: o.done || null };
        var r = M.R[l.id]; row.tri = r ? r.tier * 1000 + r.ord : 1e6; row.pain = !!(row.flag && row.flag.tone === 't-pain');
        return row;
      };
      D.lifters.forEach(function (l) {
        var r = M.R[l.id], p = l.program, why = r && r.reasons[0], painT = !!(why && why.t === 't-pain'), row = null;
        if (!p || (p.weekIdx < 0 && ST.starts[l.id] && !p.weeks.some(function (w) { return w.sentAt || w.published !== false; }))) {
          var fi = C.get('first-' + l.id);
          if (l.intake && fi) row = mk(l, { kind: 'first', week: 1, on: p ? dayDateOf(l, 0, (trainDays(p.weeks[0])[0] || {}).name) || firstOn(l) : firstOn(l), what: 'First block', flag: { type: 'intake', tone: null, text: l.intake && l.intake.by === 'coach' ? srcOf(l).from : 'from ' + (l.sex === 'M' ? 'his' : 'her') + ' intake', by: srcOf(l).by }, itemIds: [fi.id] });
        } else if (l.meet && l.meet.days <= 0 && l.meet.days >= -7 && p.weekIdx >= p.weeks.length - 1 && !(ST.nextBlocks[l.id] && ST.nextBlocks[l.id].sentAt) && !(ST.nextSent[l.id] && ST.nextSent[l.id][1])) {
          var nb = ST.nextBlocks[l.id];
          row = mk(l, { kind: 'after-meet', block: 'next', week: 1, on: nb && nb.startsOn ? nb.startsOn : afterMeetOn(l), what: 'Week after the meet',
            flag: painT ? { type: 'pain', tone: 't-pain', text: 'pain today' } : !trainDays(p.weeks[srcWeek(p)]).some(function (d) { return d.done > 0; }) ? { type: 'log', tone: null, text: 'no log' } : null,
            itemIds: ['blockend-' + l.id].filter(function (x) { return !!C.get(x); }) });
        } else {
          var ch = null;
          openNeedItems(l).forEach(function (it) { if (ch) return; var a = mainAct(it); if (a && a.ops && a.ops.length && landsOf(it, a) === 'published') ch = { it: it, a: a }; });
          if (ch) {
            var wk = ch.a.ops[0].week, cur = p.weekIdx + 1, lead = wk === cur ? 'This week' : 'Week ' + wk, it = ch.it, what = lead, flag = null;
            if (/^pain-/.test(it.id)) { var po = painOpen(l)[0]; flag = { type: 'pain', tone: 't-pain', text: po ? lower1(po.part) + ' ' + n(po.sev) + '/10' : 'pain' }; }
            else if (/^busy-/.test(it.id) && l.request && l.request.days) what = lead + ': ' + K.list(l.request.days, 3) + ' only';
            else if (/^words-/.test(it.id)) { var wd0 = it.ev.filter(function (e) { return e.t === 'weekdays'; })[0]; what = wd0 ? lead + ': ' + wd0.from + ' to ' + wd0.to : lead; }
            else if (/^over-/.test(it.id)) what = lead + ': ' + lower1(String(it.reason || '').split(',')[0]);
            /* LOGIC-FIX-3 (Programs' request): a change row of a lifter whose first reason is pain says why it is still to do,
               as the send row did at rest (Mei's week 5 sent, her knee item open: "knee note") */
            if (!flag && painT) { var po1 = painOpen(l)[0]; flag = { type: 'pain', tone: 't-pain', text: (partWord(why.w) || 'pain') + ' note' }; if (po1 && (why.type === 'pain' || po1.from === 'coach' || po1.from === 'meet')) flag.text = lower1(po1.part) + ' ' + n(po1.sev) + '/10'; }
            row = mk(l, { kind: 'change', week: wk, on: changeOn(l, ch.a.ops), what: what, flag: flag, itemIds: [it.id] });
          } else if (pr[l.id] && (pr[l.id].state === 'to-send' || pr[l.id].state === 'to-write') && p.weekIdx + 1 < p.weeks.length) {
            var ni = p.weekIdx + 1, nd = trainDays(p.weeks[ni])[0], on = nd ? dayDateOf(l, ni, nd.name) : null;
            if (on && K.daysTo(on) <= 7) {
              var fl = painT ? { type: 'pain', tone: 't-pain', text: (partWord(why.w) || 'pain') + ' note' } : null;
              var po2 = painOpen(l)[0]; if (painT && po2 && (why.type === 'pain' || po2.from === 'coach' || po2.from === 'meet')) fl.text = lower1(po2.part) + ' ' + n(po2.sev) + '/10';
              row = mk(l, { kind: 'send', week: ni + 1, on: on, what: 'Week ' + (ni + 1), flag: fl, itemIds: why && why.itemId ? [why.itemId] : [] });
            }
          }
        }
        /* shared.md §4.5 (request #41b): a session lifted (logged) after the week after it was sent: the rules' changes to that
           sent week are work to send ("Week 5: bench +2.5, your rules") */
        var rq = rulesQueued(l);
        if (rq) { if (row && row.kind !== 'first' && row.kind !== 'after-meet') { row.kind = 'change'; row.rules = true; row.week = rq.n; row.what = rq.what; row.changes = rq.count; } else if (!row) { row = mk(l, { kind: 'change', week: rq.n, on: rq.on, what: rq.what, itemIds: [] }); row.rules = true; row.changes = rq.count; } }
        /* a send held behind its toast is gone from To do (programs.md §10 step 3): the badge drops with the click */
        if (row && row.kind !== 'change' && ST.held[l.id + ':' + (row.block === 'next' ? 'next:' : '') + row.week]) row = null;
        if (row) { todo.push(row); inTodo[l.id] = 1; }
      });
      var T = D.team;
      if (T) {
        var tn = teamNow(T) + 2, from = K.add(T.startsOn, 7 * (tn - 1));
        if (tn <= T.weeks.length && !teamWeekSent(T, tn) && K.daysTo(from) <= 7) {
          var tid = slug(T.name), reach = teamReach(T, tn).length;
          todo.push({ id: 'q:team:' + tid + ':' + tn, lifterId: null, first: null, name: T.name, kind: 'team', group: 'todo', block: 'current', week: tn, on: from, due: K.add(from, -1), day: K.wd3(from) + (K.daysTo(from) > 6 ? ' ' + K.d(from).getDate() : ''), team: { id: tid, n: tn },
            what: 'Week ' + tn + ' to ' + reach + ' lifters, in Teams', flag: null, itemIds: [], teamId: tid, href: 'teams.html#id=' + tid + '&week=' + tn + '&from=programs', done: null, tri: 1e6, pain: false, isTeam: true });
        }
      }
      todo.sort(function (a, b) { return (a.pain ? 0 : 1) - (b.pain ? 0 : 1) || String(a.on).localeCompare(String(b.on)) || (a.isTeam ? 1 : 0) - (b.isTeam ? 1 : 0) || a.tri - b.tri; });
      D.lifters.forEach(function (l) {
        var p = l.program; if (!p || inTodo[l.id] || ST.nextBlocks[l.id]) return;
        if (l.meet && l.meet.days > 0 && l.meet.days <= 14) ending.push({ id: 'q:' + l.id + ':ending', lifterId: l.id, first: l.first, name: l.name, kind: 'ending', group: 'ending', block: 'current', week: p.weeks.length, on: day10(l.meet.date) || K.add(TODAY, l.meet.days), due: null,
          day: K.wd3(day10(l.meet.date) || K.add(TODAY, l.meet.days)), what: p.name + ' ends at the meet', flag: null, itemIds: [], teamId: null, href: null, done: null });
      });
      var seenL = {};
      sendsThisWeek().forEach(function (s) {
        /* request #41a (F28): a week sent while a change for that lifter is still open shows in Sent this week too */
        var l = K.L(s.lifterId); if (!l || seenL[l.id]) return; var tr = inTodo[l.id] ? todo.filter(function (x) { return x.lifterId === l.id; })[0] : null; if (tr && !(tr.kind === 'change' && !s.change)) return; seenL[l.id] = 1;
        var sa = s.change ? s.seenAt || null : ST.weekSeen[l.id + ':' + (s.next ? 'next:' : '') + s.n] || null, nw = s.next && nextDrafts[l.id] && nextDrafts[l.id].weeks ? nextDrafts[l.id].weeks[s.n - 1] : null;
        var wt = s.change ? s.what : s.next ? (nw && nw.label && /recovery/i.test(nw.label) ? 'Recovery week sent' : 'Week ' + s.n + ' of the next block sent') : s.ns && s.ns.length > 1 ? 'Weeks ' + s.ns[0] + (s.ns.length === 2 ? ' and ' : ' to ') + s.ns[s.ns.length - 1] + ' sent' : 'Week ' + s.n + ' sent';
        done.push({ id: 'q:' + l.id + ':sent', lifterId: l.id, first: l.first, name: l.name, kind: s.change ? 'change' : 'send', group: 'done', block: s.next ? 'next' : 'current', week: s.n, on: null, due: null, day: localIso(tOf(s.at)).slice(11, 16), what: wt, flag: null, itemIds: [], teamId: null, href: null,
          done: { what: wt, at: localIso(tOf(s.at)), undo: s.t, held: s.held, seenAt: sa, seen: sa ? 'Seen ' + localIso(tOf(sa)).slice(11, 16) : offApp(l) ? offApp(l).facts : 'Not seen yet', notOnApp: offApp(l) ? { text: offApp(l).text, link: offApp(l).link, url: offApp(l).url, label: offApp(l).label } : null } });
      });
      D.lifters.forEach(function (l) {
        var p = l.program, r0 = pr[l.id]; if (!p || inTodo[l.id] || seenL[l.id] || ending.some(function (x) { return x.lifterId === l.id; })) return;
        var sentN = 0; p.weeks.forEach(function (w, i) { if (w.sentAt || (w.published !== false && i <= p.weekIdx)) sentN = i + 1; });
        var what = p.weekIdx < 0 ? 'Not started' : sentN > p.weekIdx + 1 ? 'Week ' + sentN + ' sent · runs out after week ' + p.weeks.length : r0 ? r0.next.text : 'Written to week ' + p.weeks.length;
        /* FIX-LOGIC (FP F6.1 "Program position" and "Countdown", FC14): the list row says where the block is as the Programs
           list does ("Week 1 now, weeks 2 and 3 sent") and the meet by the one countdown ("7 weeks out") */
        if (l.meet && l.meet.days > 0 && l.meet.days <= 56) what = (posWords(l) || (sentN > p.weekIdx + 1 ? 'Week ' + sentN + ' sent' : 'Written to week ' + p.weeks.length)) + ' · ' + meetCount(l.meet);
        var nxt = p.weeks[p.weekIdx + 1], on = nxt && trainDays(nxt)[0] ? dayDateOf(l, p.weekIdx + 1, trainDays(nxt)[0].name) : null;
        rest.push({ id: 'q:' + l.id + ':rest', lifterId: l.id, first: l.first, name: l.name, kind: 'rest', group: 'rest', block: 'current', week: p.weekIdx + 2, on: on, due: on ? K.add(on, -1) : null, day: on ? K.wd3(on) : '', what: what, flag: null, itemIds: [], teamId: null, href: null, done: null });
      });
      rest.sort(function (a, b) { return String(a.on || '9').localeCompare(String(b.on || '9')) || a.name.localeCompare(b.name); });
      /* request #41c: the team's week sent this week is a done row too ("Week 3 sent to 4 lifters") */
      var monT = K.monday(TODAY), tSeen = {};
      LOG.slice().reverse().forEach(function (rec) {
        if (rec.op !== 'teamSend' || !rec.a || !isStr(rec.a.at) || localIso(tOf(rec.a.at)).slice(0, 10) < monT) return;
        var tk = rec.a.id + ':' + rec.a.n; if (tSeen[tk]) return; tSeen[tk] = 1; var T0 = teamOf(rec.a.id); if (!T0) return;
        var nTo = (rec.ids || []).filter(function (x) { var lx = K.L(x); return !!(lx && lx.program) && !ST.teamHeld[rec.a.id + ':' + x + ':' + rec.a.n]; }).length, wtx = 'Week ' + rec.a.n + ' sent' + (nTo ? ' to ' + K.plural(nTo, 'lifter') : '');
        done.push({ id: 'q:team:' + rec.a.id + ':sent', lifterId: null, first: null, name: T0.name, kind: 'team', group: 'done', block: 'current', week: rec.a.n, on: null, due: null, day: localIso(tOf(rec.a.at)).slice(11, 16), what: wtx, flag: null, itemIds: [], teamId: rec.a.id, href: 'teams.html#id=' + rec.a.id + '&week=' + rec.a.n + '&from=programs',
          done: { what: wtx, at: localIso(tOf(rec.a.at)), undo: rec.t, held: false, seenAt: null, seen: '' }, team: { id: rec.a.id, n: rec.a.n } });
      });
      var strip = function (x) { var o = clone(x); delete o.tri; delete o.pain; delete o.isTeam; if (!o.team) o.team = null; return o; };
      var rows = todo.concat(ending, done, rest).map(strip), first = todo.filter(function (x) { return x.lifterId; })[0];
      return { rows: rows, meta: { left: todo.length, done: done.length, total: rows.length, first: first ? first.lifterId : null,
        groups: { todo: todo.map(function (x) { return x.lifterId || 'team:' + x.teamId; }), ending: ending.map(function (x) { return x.lifterId; }), done: done.map(function (x) { return x.lifterId || 'team:' + x.teamId; }), rest: rest.map(function (x) { return x.lifterId; }) } } };
    });
  }
  function rulesQueued(l) {
    var p = l.program; if (!p || !BLK()) return null;
    var n0 = null, days = {};
    LOG.forEach(function (rec) { if (rec.op !== 'logFor' || !rec.a || rec.a.id !== l.id) return; var nw = p.weeks[rec.a.week]; if (nw && (nw.sentAt || nw.published === true) && rec.a.week > p.weekIdx) { n0 = rec.a.week + 1; days[rec.a.day] = 1; } });
    if (!n0) return null;
    var pp = proposalOf(l, n0); if (!pp || pp.error || !pp.block) return null;
    /* only the lines of the sessions logged after the send (the rest went out with the week) */
    var mine = (pp.changes || []).filter(function (c) { var row = pp.block.rows[c.r]; return row && days[row.day] && (c.kind === 'rule' || c.kind === 'follow'); });
    var ups = mine.filter(function (c) { return c.kind === 'rule'; }).map(function (c) { var row = pp.block.rows[c.r]; return row && row.line === 0 && isNum(c.now) && isNum(c.was) ? { lift: row.lift || lower1(row.name), d: r1(c.now - c.was) } : null; }).filter(Boolean);
    if (!ups.length) return null;
    var fd = trainDays(p.weeks[n0 - 1])[0];
    return { n: n0, on: fd ? dayDateOf(l, n0 - 1, fd.name) : null, count: mine.length, what: 'Week ' + n0 + ': ' + ups.map(function (u) { return u.lift + ' ' + (u.d > 0 ? '+' : '−') + n(Math.abs(u.d)); }).join(', ') + ', your rules' };
  }
  /* the open pain items that hold a lift's rule increases (shared.md §4.3), less the ones the coach settled */
  function holdsFor(l) {
    var Bk = BLK(); if (!Bk || typeof Bk.holdsOf !== 'function') return [];
    var settled = [];
    C.forLifter(l.id).forEach(function (it) {
      if (it.ids.length !== 1 || !doneOf(it.id) || !(it.group === 'hurt' || it.tone === 't-pain')) return;
      var po = painOpen(l)[0], nt = lastNote(l), pw = nt && Bk.painWords ? Bk.painWords(nt.note) : null;
      if (/^pain-/.test(it.id) && po && po.lift) settled.push(String(po.lift).toLowerCase());
      if (/^words-/.test(it.id)) { if (pw && pw.lift) settled.push(pw.lift); else settled.push('squat'); }
    });
    if (ST.notPain[l.id]) { var nt0 = lastNote(l), pw0 = nt0 && Bk.painWords ? Bk.painWords(nt0.note) : null; if (pw0 && pw0.lift) settled.push(pw0.lift); else LIFTS.forEach(function (k) { settled.push(k); }); }
    var out; try { out = Bk.holdsOf(l, { today: TODAY, settled: settled }); } catch (e) { out = []; }
    /* request #42 (programs.md §7.2, shared.md §4.3): after a pain change (Sarah's block pulls, or no deadlifts), the next
       week's line of that lift comes back held: "Deadlift: back to 150 × 4? Back was 6/10." until the coach decides */
    C.forLifter(l.id).forEach(function (it) {
      var d = doneOf(it.id); if (!/^pain-/.test(it.id) || it.ids.length !== 1 || !d || (d.act !== 'swap' && d.act !== 'skip')) return;
      var act = actOf(it, d.act), op = act && act.ops ? act.ops.filter(function (x) { return x.op === 'swapWeek' || x.op === 'dropLine' || x.op === 'set'; })[0] : null; if (!op) return;
      var k0 = parseRowKey(op.row), lift = k0 ? (/squat/i.test(k0.title) ? 'squat' : /bench/i.test(k0.title) ? 'bench' : /deadlift/i.test(k0.title) ? 'deadlift' : null) : null; if (!lift) return;
      var po = painOpen(l)[0], why = po ? (partWord(po.part) || 'pain') + ' was ' + n(po.sev) + '/10' : 'the pain change';
      out = out.filter(function (h) { return h.lift !== lift; });
      out.push({ lift: lift, why: why, swap: d.act === 'swap' ? (op.to && op.to.name) || op.to || 'the swap' : '', source: 'change' });
    });
    return out;
  }
  function blockOf(l) { var Bk = BLK(), g = l && l.program ? programAnswer(l).data : null; if (!Bk || !g) return null; try { return Bk.from(g); } catch (e) { return null; } }
  /* PL.programs.proposal: BLOCK.propose with the pain holds; pure, memoised on the store version */
  function proposalOf(l, wn) {
    var Bk = BLK(); if (!Bk || !l.program) return null;
    return cached('prop:' + l.id + ':' + wn, function () {
      var b = blockOf(l); if (!b) return null;
      var res; try { res = Bk.propose(b, wn - 1, { holds: holdsFor(l), today: TODAY, rules: rulesCtx() }); } catch (e) { res = { error: { code: 'invalid', message: 'That week cannot be proposed: ' + (e && e.message) } }; }
      return res;
    });
  }
  /* a row of a block by its key ("Squat Day|Squat|1|0"), else by day, name and line without case */
  function rowIx(b, key) {
    if (!isStr(key)) return -1;
    for (var i = 0; i < b.rows.length; i++) if (b.rows[i].key === key) return i;
    var k = key.split('|'), lk = String(k[1] || '').toLowerCase(), ln = Number(k[3] || 0);
    for (var j = 0; j < b.rows.length; j++) { var x = b.rows[j]; if (x.day === k[0] && (String(x.title).toLowerCase() === lk || String(x.name).toLowerCase() === lk) && (x.line || 0) === ln) return j; }
    return -1;
  }
  /* programs.md §11.2's ops on a block (a copy, a draft): one write each, refusals as block.js answers them */
  function applyOps(b, ops) {
    var out = [];
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i] || {}, c = (isNum(o.week) ? o.week : 1) - 1, r = isStr(o.row) ? rowIx(b, o.row) : -1, x;
      var needRow = ['set', 'dropLine', 'load', 'swapWeek', 'addLine'].indexOf(o.op) >= 0;
      if (needRow && r < 0) return fail('not_found', 'There is no line ' + (o.row || '') + ' in week ' + (c + 1) + '.');
      switch (o.op) {
        case 'set': x = !o.field || o.field === 'line' ? b.set(r, c, o.text == null ? '' : String(o.text)) : b.setField(r, c, o.field, o.text == null ? '' : String(o.text)); break;
        case 'dropLine': x = b.set(r, c, ''); break;
        case 'load': x = b.setTopLoad(r, c, o.kg, { only: o.scope === 'week' }); break;
        case 'cap': x = b.cap(c, { lift: o.lift, day: o.day, rpe: o.rpe }); break;
        case 'lighter': x = b.lighterWeek(c, o.rpe); break;
        case 'swapWeek': {   /* coach.js names the swap { name, lift, variant }; block.js takes the name (scope 'on': this week and every later week not lifted) */
          var toName = isStr(o.to) ? o.to : o.to && o.to.name, toLift = o.to && !isStr(o.to) ? o.to.lift : undefined, last = o.scope === 'on' ? b.weeks.length - 1 : c;
          for (var cw = c; cw <= last; cw++) { var rr = rowIx(b, o.row); if (rr < 0) break; if (b.weeks[cw] && b.weeks[cw].state === 'lifted') continue; x = b.swapWeek(rr, cw, toName, o.cell, { scope: o.scope, lift: toLift }); if (x && x.error) break; }
          break;
        }
        /* LOGIC-FIX-4 (walk 2, Dev): back-offs added under the exercise's top set, taken off it ("2x5 -15%", paused a second),
           this week (scope 'week') or this week and every later week not lifted (scope 'on'); the top sets stay as written */
        case 'addLine': {
          var tr = rowIx(b, o.row); if (tr < 0) return fail('not_found', 'There is no line ' + (o.row || '') + ' in week ' + (c + 1) + '.');
          var ad = b.addLine(tr); if (ad && ad.error) { x = ad; break; }
          var nr = ad.data.r, nrow = b.rows[nr]; if (o.label) nrow.label = String(o.label);
          var lastA = o.scope === 'on' ? b.weeks.length - 1 : c, top = b.rows[tr];
          for (var ca = c; ca <= lastA; ca++) { var wa = b.weeks[ca]; if (!wa || wa.state === 'lifted' || !top.cells[wa.uid]) continue; x = b.set(nr, ca, String(o.cell || '2x5 -15%')); if (x && x.error) break; if (o.tempo) { x = b.setField(nr, ca, 'tempo', String(o.tempo)); if (x && x.error) break; } }
          break;
        }
        case 'moveDay': x = b.moveDay(c, o.day, o.to, { scope: o.scope }); break;
        case 'dropDay': x = b.dropDay(c, o.day); break;
        case 'restoreDay': x = b.restoreDay(c, o.day); break;
        case 'deload': x = b.deload(c, o.kind); break;
        case 'fill': x = b.writeFrom(c, { from: isNum(o.from) ? o.from - 1 : c - 1, same: !!o.same }); break;
        case 'merge': x = b.mergeDays(c, o.days, { into: o.into, minutes: o.minutes }); break;
        case 'swapDays': x = b.swapDays(c, o.a, o.b); break;
        case 'rules': x = typeof b.setRules === 'function' ? b.setRules(o.rule === null ? null : o.rule || {}) : null; break;   /* LOGIC-FIX-2: rule null clears the lifter's own rules (Settings › Back to yours) */
        default: return fail('invalid', 'There is no change called “' + o.op + '”.');
      }
      if (x && x.error) return { error: x.error };
      out.push(x && x.data !== undefined ? x.data : null);
    }
    return { data: out };
  }
  /* a line in words: "1 × 3 @7, 125" (the act table's form) */
  function rxWords(b, r, c) {
    var w = b.weeks[c], row = b.rows[r], x = w && row ? row.cells[w.uid] : null; if (!x) return '';
    var kg = b.load(r, c).kg;
    return (x.n != null ? x.n + ' × ' : '') + (x.r != null ? x.r + (x.rHi != null ? '-' + x.rHi : '') : '') + (x.rpe != null ? ' @' + n(x.rpe) + (x.rpeHi != null ? '-' + n(x.rpeHi) : '') : '') + (x.pct != null ? ' ' + n(x.pct) + '%' : '') + (isNum(kg) ? ', ' + n(kg) : '');
  }
  /* what moved between two blocks, from week c0 on: loads, lines and days (the preview's changes) */
  function diffBlocks(l, b0, b1, c0, editable) {
    var out = [], seen = {};
    for (var c = c0; c < b1.weeks.length; c++) {
      b1.rows.forEach(function (row, r) {
        var r0 = rowIx(b0, row.key), x0 = r0 >= 0 && b0.weeks[c] ? b0.cell(r0, c) : null, x1 = b1.cell(r, c), k0 = r0 >= 0 && b0.weeks[c] ? b0.load(r0, c).kg : null, k1 = b1.load(r, c).kg;
        var t0 = x0 ? x0.text || '' : '', t1 = x1 ? x1.text || '' : '', date = b1.dateOf(c, row.day);
        if (t0 === t1 && k0 === k1) return;
        var field = k0 !== k1 && isNum(k0) && isNum(k1) && t0.replace(/[\d.]+\s*kg/, '') === t1.replace(/[\d.]+\s*kg/, '') ? 'load' : 'line';
        if (field === 'line') { t0 = r0 >= 0 ? rxWords(b0, r0, c) : ''; t1 = rxWords(b1, r, c); }
        var label = row.name + (row.line ? ', ' + lower1(row.label || 'back-offs') : '') + ', ' + dmyOf(date);
        var ch = { key: row.key, label: label, week: c + 1, day: row.day, date: date, row: row.key, field: field, before: field === 'load' ? k0 : t0 || null, after: field === 'load' ? k1 : t1 || null, load: { before: isNum(k0) ? k0 : null, after: isNum(k1) ? k1 : null }, text: '', edit: null };
        ch.text = label + ': ' + (field === 'load' ? n(k0) + ' → ' + n(k1) : (t0 || 'none') + ' → ' + (t1 || 'none'));
        if (field === 'load' && editable && editable[row.key] && !row.line && c === editable[row.key] - 1) ch.edit = { value: k1, step: 2.5, min: 20, max: 600 };
        /* shared.md §4.1: a line made lighter offers the other number quietly ("Use 215") */
        var yw = b1.weeks[c] && b1.weeks[c].why && b1.weeks[c].why[row.key]; if (yw && (yw.kind === 'cap' || yw.kind === 'lighter') && isNum(yw.other) && yw.other !== k1) { ch.other = yw.other; ch.otherLabel = 'Use ' + n(yw.other); }   /* run({ edits: { <row>: other } }) takes it (opsWith); the fix sheet offers it quietly */
        out.push(ch); seen[row.key + '|' + c] = 1;
      });
      b1.days.forEach(function (d) { var a0 = b0.weeks[c] ? b0.dateOf(c, d.name) : null, a1 = b1.dateOf(c, d.name); if (a0 && a1 && a0 !== a1) out.push({ key: d.name + '|date', label: d.name, week: c + 1, day: d.name, date: a1, row: null, field: 'date', before: a0, after: a1, text: d.name + ': ' + dmyOf(a0) + ' → ' + dmyOf(a1), edit: null }); });
    }
    return out;
  }
  /* the same effect code as the act, on a copy (no block.js): the program as the reads see it, before and after */
  function diffViews(l, it, a) {
    var before = applyEffects(l, clone(l.program)), had = has(C.state.done, it.id), prev = C.state.done[it.id], after;
    C.state.done[it.id] = { act: a.id, at: stamp() };
    try { after = applyEffects(l, clone(l.program)); } finally { if (had) C.state.done[it.id] = prev; else delete C.state.done[it.id]; }
    var out = [];
    after.weeks.forEach(function (aw, wi) {
      var bw = before.weeks[wi]; if (!bw || wi < Math.max(0, after.weekIdx)) return;
      aw.days.forEach(function (ad, di) {
        var bd = bw.days[di]; if (!bd) return;
        if (day10(ad.date) !== day10(bd.date)) out.push({ key: ad.name + '|date', label: ad.name, week: wi + 1, day: ad.name, date: day10(ad.date), row: null, field: 'date', before: day10(bd.date), after: day10(ad.date), text: ad.name + ': ' + dmyOf(day10(bd.date)) + ' → ' + dmyOf(day10(ad.date)), edit: null });
        var ta = (ad.exercises || []).map(function (e) { return e.title; }).join('|'), tb = (bd.exercises || []).map(function (e) { return e.title; }).join('|');
        if (ta !== tb) { out.push({ key: ad.name + '|lines', label: ad.name, week: wi + 1, day: ad.name, date: day10(ad.date), row: null, field: 'line', before: tb, after: ta, text: ad.name + ': ' + (ad.changed || 'changed'), edit: null }); return; }
        (ad.exercises || []).forEach(function (e, ei) {
          var be = bd.exercises[ei], ga = groupsOf(e), gb = groupsOf(be);
          ga.forEach(function (g, gi) { var o = gb[gi]; if (!o || ((o.w || 0) === (g.w || 0) && o.r === g.r && o.rpe === g.rpe)) return; var key = blockKey(ad, ei, gi); out.push({ key: key, label: nameOf(e) + ', ' + dmyOf(day10(ad.date)), week: wi + 1, day: ad.name, date: day10(ad.date), row: key, field: (o.w || 0) !== (g.w || 0) ? 'load' : 'line', before: (o.w || 0) !== (g.w || 0) ? o.w || null : rxText(o, o.sets.length), after: (o.w || 0) !== (g.w || 0) ? g.w || null : rxText(g, g.sets.length), text: '', edit: null }); });
        });
      });
    });
    out.forEach(function (c) { if (!c.text) c.text = c.label + ': ' + (c.before == null ? 'none' : isNum(c.before) ? n(c.before) : c.before) + ' → ' + (c.after == null ? 'none' : isNum(c.after) ? n(c.after) : c.after); });
    return out;
  }
  /* a change's new load: a load change's after, else its line's load (a cap's "1 × 3 @7, 205") */
  function ldAfter(c) { return !c ? null : c.field === 'load' && isNum(c.after) ? c.after : c.load && isNum(c.load.after) ? c.load.after : null; }
  function swapNums(text, swap) { return String(text || '').replace(/\d+(?:\.\d+)?/g, function (num) { return swap[num] != null ? swap[num] : num; }); }
  /* the numbers an edit moves in the move's own week: { "145": "147.5", "120": "122.5" } (the words re-draft from it) */
  function editSwap(it, a, edits) {
    if (!edits || !a.ops || !a.ops.length) return null;
    var l = K.L(it.ids[0]); if (!l || !l.program) return null;
    var p0 = previewOf(it, a, {}), p1 = previewOf(it, a, { edits: edits }), by = {}, swap = {};
    p0.changes.forEach(function (c) { by[c.key + '|' + c.week] = c; });
    p1.changes.forEach(function (c) { var d0 = by[c.key + '|' + c.week], k0 = ldAfter(d0), k1 = ldAfter(c); if (c.week === p1.week && d0 && isNum(k0) && isNum(k1) && k0 !== k1 && swap[n(k0)] == null) swap[n(k0)] = n(k1); });
    return Object.keys(swap).length ? swap : null;
  }
  /* the move's ops with the coach's edits (a load typed in the fix sheet: { <row key | op index>: kg }) */
  function opsWith(a, edits) {
    var ops = clone(a.ops || []);
    if (edits && typeof edits === 'object') ops.forEach(function (op, i) { var e = edits[op.row] != null ? edits[op.row] : edits[i]; if (op.op === 'load' && isNum(e)) op.kg = e; });
    /* LOGIC-FIX-2 (Messages' request): a line a cap or "lighter" made lighter takes the other number ("Use 215", Mei's "Use
       127.5") in the same write: the edit becomes that line's top load in the move's week, after the cap */
    if (edits && typeof edits === 'object' && ops.some(function (op) { return op.op === 'cap' || op.op === 'lighter'; })) {
      Object.keys(edits).forEach(function (key) {
        if (key.indexOf('|') < 0 || !isNum(edits[key]) || ops.some(function (op) { return op.op === 'load' && op.row === key; })) return;
        var pk = parseRowKey(key), on = ops.filter(function (op) { return (op.op === 'cap' || op.op === 'lighter') && (!op.day || (pk && op.day === pk.day)); })[0];
        if (on) ops.push({ op: 'load', week: on.week, row: key, kg: edits[key], scope: 'week', other: true });
      });
    }
    return ops;
  }
  /* a move's choices (overview-lifters §5.5): a top-set change runs "Week 3 and after" (default, later weeks follow) or "Week 3
     only". Only choices the run honours are offered (Sarah's and Nina's "From now on" wait for the published path to run
     through block ops: LOGIC-FIX-2) */
  function choicesOf(it, a, given) {
    var ops = a.ops || [], ld = ops.filter(function (op) { return op.op === 'load'; })[0]; if (!ld) return [];
    var wkn = ld.week, val = given && (given.scope === 'week' || given.scope === 'on') ? given.scope : 'on';
    return [{ key: 'scope', label: 'Which weeks', options: [{ value: 'on', label: 'Week ' + wkn + ' and after' }, { value: 'week', label: 'Week ' + wkn + ' only' }], value: val }];
  }
  function safeChanges(l) {
    var pl = null; try { pl = PL.meets.plan(l.id).data; } catch (e) { pl = null; } if (!pl || !pl.attempts) return [];
    var out = [], sf = safeSet(l), t3 = function (a) { return a.map(function (x) { return x == null ? '' : n(x); }).join(' / '); };
    LIFTS.forEach(function (k) { var b0 = pl.attempts[k] || [], a0 = sf[k] || []; if (t3(b0) === t3(a0)) return; out.push({ key: 'attempts:' + k, label: upper1(k), week: null, day: null, date: day10(l.meet.date) || null, row: null, field: 'attempts', before: t3(b0), after: t3(a0), load: null, text: upper1(k) + ': ' + t3(b0) + ' → ' + t3(a0), edit: null }); });
    return out;
  }
  function safeSet(l) { var o = {}; LIFTS.forEach(function (k) { o[k] = l.lifts[k] && l.lifts[k].e1 ? presetFor(l, k, 'safe') : [null, null, null]; }); return o; }
  /* shared.md §6.1: what a move will do, by the same ops on a copy (block.js), else by the same effect code on a copy */
  function previewOf(it, a, o) {
    var l = K.L(o.for || it.ids[0]) || null, lands = landsOf(it, a), ops = opsWith(a, o.edits), Bk = BLK(), changes = [], warn = null, wk = ops.length && isNum(ops[0].week) ? ops[0].week : null;
    var mk = function (opsX) {
      if (!l || !l.program || !opsX.length) return [];
      if (Bk) {
        var b0 = blockOf(l); if (!b0) return [];
        var c = wk - 1, base = b0;
        if (lands === 'draft') { var pp = proposalOf(l, wk); if (pp && pp.block) base = pp.block; }
        var b1; try { b1 = Bk.from(base.toJSON()); } catch (e) { return []; }
        var res = applyOps(b1, opsX); if (res.error) { warn = res.error.message; return []; }
        var ed = {}; opsX.forEach(function (op) { if (op.op === 'load' && isStr(op.row)) ed[op.row] = op.week; });
        return diffBlocks(l, base, b1, Math.max(0, c), ed);
      }
      return diffViews(l, it, a);
    };
    changes = mk(ops);
    var def0 = o.edits ? mk(opsWith(a, null)) : changes, text = draftFor(it, a, def0), text0 = text;
    if (text && o.edits) {   /* words the coach has not touched re-draft when the numbers change (shared.md §6.1) */
      var def = def0, by = {}, swap = {}; def.forEach(function (c) { by[c.key + '|' + c.week] = c; });
      changes.forEach(function (c) { var d0 = by[c.key + '|' + c.week], k0 = ldAfter(d0), k1 = ldAfter(c); if (c.week === wk && d0 && isNum(k0) && isNum(k1) && k0 !== k1 && swap[n(k0)] == null) swap[n(k0)] = n(k1); });
      if (Object.keys(swap).length) text = swapNums(text, swap);
      if (isStr(o.text) && o.text !== text0) {
        changes.forEach(function (c) { var d0 = by[c.key + '|' + c.week]; if (!warn && d0 && c.field === 'load' && c.edit && d0.after !== c.after && o.text.indexOf(n(d0.after)) >= 0 && o.text.indexOf(n(c.after)) < 0) warn = 'Your message says ' + n(d0.after) + '. The load is ' + n(c.after) + '.'; });
      }
    }
    var w0 = l && l.program && wk ? l.program.weeks[wk - 1] : null;
    /* request #10: Safe openers show before and after, lift by lift (D8: nothing changes before the coach saw it) */
    if (l && l.meet && (a.id === 'safe' || a.id === 'ease') && !changes.length) changes = safeChanges(l);
    /* request #11: the choices a move offers ([{ key, label, options, value }]); run({ choices }) honours them */
    var chs = choicesOf(it, a, o.choices);
    if (chs.length && Bk && l && l.program) { var sc = chs[0].value; if (sc === 'week' && ops.some(function (op) { return op.op === 'load'; })) { ops = ops.map(function (op) { var x = clone(op); if (x.op === 'load') x.scope = 'week'; return x; }); changes = mk(ops); } }
    return { itemId: it.id, actId: a.id, lifterId: l ? l.id : null, title: it.title, who: l ? l.first : (it.person || '').split(' ')[0] || null,
      block: wk && l && l.program && wk > l.program.weeks.length ? 'next' : 'current', week: wk, ops: ops, changes: changes, choices: chs,
      tell: a.reply != null ? { to: l ? l.first : null, kind: a.tell || 'words', text: isStr(o.text) ? o.text : text, on: true, required: tellRequired(a) } : null,
      ride: lands ? { lands: lands, week: wk, sendWeek: false, words: lands === 'draft' ? 'goes out with week ' + wk : null } : null,
      remind: a.remind ? { on: a.remind.on, text: a.remind.text, ticked: false } : null,
      /* LOGIC-FIX-4 (walk 2, Marcus 147.5): the button and its silent form name the load the coach typed, as the words do */
      warn: warn, go: a.go ? { place: a.go.place, hash: a.go.hash } : null, button: swapIf(a.button || a.label), silent: a.silent ? swapIf(a.silent) : null, settles: a.keep ? [] : [it.id], sent: !!(w0 && w0.sentAt) };
    function swapIf(t) { return swap && Object.keys(swap).length ? swapNums(t, swap) : t; }
  }
  /* the week's record (shared.md §6.9): every write this session with its time, from the write log */
  function recLifter(rec) { for (var i = 0; i < rec.ids.length; i++) if (K.L(rec.ids[i])) return rec.ids[i]; var a = rec.a || {}; return K.L(a.id) ? a.id : K.L(a.lifterId) ? a.lifterId : null; }
  function recSent(rec) {
    var a = rec.a || {};
    if (rec.op === 'programSend' || rec.op === 'weeksSend' || rec.op === 'send' || rec.op === 'noteReply' || rec.op === 'teamSend' || rec.op === 'teamMessage') return true;
    if (rec.op === 'item') { var it = C.get(a.itemId), act = it && actOf(it, a.actId); return !!(a.text || (act && act.ops && act.ops.length && landsOf(it, act) === 'published') || (act && act.says && !act.ops)); }
    if (rec.op === 'moveDay') return !!a.publish;
    return false;
  }
  function recSeen(rec) {
    var a = rec.a || {}, id = recLifter(rec);
    if (rec.op === 'programSend') return ST.weekSeen[a.id + ':' + a.n] || null;
    if (rec.op === 'weeksSend') return ST.weekSeen[a.id + ':' + ((a.weeks || [])[0] || {}).n] || null;
    if (rec.op === 'item') return ST.cardSeen[a.itemId] || (id && a.text ? ST.msgSeen[id + '|' + a.at] || null : null);
    if (rec.op === 'send') return ST.msgSeen[a.id + '|' + a.at] || null;
    if (rec.op === 'moveDay') return ST.cardSeen['move:' + a.id + ':' + a.wi + ':' + a.di] || weekSeenAfter(rec);
    return weekSeenAfter(rec);
  }
  /* request #31: a change to a sent week reads that week's receipt, once the lifter opened it after the change */
  function recWeek(rec) {
    var a = rec.a || {};
    if ((rec.op === 'next' || rec.op === 'load' || rec.op === 'moveDay') && isNum(a.wi)) return a.wi + 1;
    if (rec.op === 'change' && Array.isArray(a.ops) && a.ops[0] && isNum(a.ops[0].week)) return a.ops[0].week;
    if (rec.op === 'item') { var it = C.get(a.itemId), act = it ? actOf(it, a.actId) : null; if (act && act.ops && act.ops[0] && isNum(act.ops[0].week) && landsOf(it, act) === 'published') return act.ops[0].week; }
    return null;
  }
  function weekSeenAfter(rec) {
    var wk = recWeek(rec), id = recLifter(rec); if (!wk || !id) return null;
    var sa = ST.weekSeen[id + ':' + wk]; if (!sa) return null;
    var at = rec.at || (rec.a && rec.a.at); return !isStr(at) || tOf(sa) >= tOf(at) ? sa : null;
  }
  /* FIX-LOGIC (build C walk 2): an item settled on a day before the desk's today is not "Done today" on Monday (only the
     fresh desk's today moves, so the example desk keeps every done row it had) */
  function doneBefore(id) { var d = doneOf(id); return !!(d && isStr(d.at) && localIso(tOf(d.at)).slice(0, 10) < TODAY); }
  function changesOf(o) {
    var since = isStr(o.since) ? tOf(o.since.length === 10 ? o.since + 'T00:00' : o.since) : -Infinity, out = [];
    LOG.forEach(function (rec) {
      var w = rec.at || (rec.a && rec.a.at); if (!isStr(w)) return; var at = tOf(w); if (!(at >= since)) return;
      /* the demo playing the lifter (PL.demo.firstSession: her own sets, by 'lifter') is her write, not the coach's: never a
         done row with an Undo on the coach's desk */
      if (rec.a && rec.a.by === 'lifter' && (rec.op === 'logFor' || rec.op === 'seen')) return;
      var id = recLifter(rec); if (o.lifterId && id !== o.lifterId) return;
      out.push({ at: localIso(at), lifterId: id, kind: rec.kind, op: rec.op, label: rec.label, sent: recSent(rec), seenAt: recSeen(rec), undo: rec.t });
    });
    return out.reverse();
  }
  /* sessions logged since a moment (shared.md §6.14): the coach's "Trained since you looked" */
  function sessionsSince(iso) {
    var from = isStr(iso) ? iso : (D.coach && D.coach.lastLook) || TODAY, out = [];
    D.lifters.forEach(function (l) {
      var p = l.program; if (!p) return;
      p.weeks.forEach(function (w, wi) { w.days.forEach(function (d, di) {
        if (!(d.done > 0)) return;
        var on = null; (d.exercises || []).forEach(function (e) { e.sets.forEach(function (s) { if (s.done && s.on && (!on || String(s.on) > on)) on = String(s.on); }); });
        var when = on || (d.date ? String(d.date) : null); if (!when) return;
        if (tOf(when.length === 10 ? when + 'T12:00' : when) < tOf(from.length === 10 ? from + 'T00:00' : from)) return;
        var t = K.topSet(d), notes = [], video = false;
        (d.exercises || []).forEach(function (e) { e.sets.forEach(function (s) { if (s.note) notes.push(s.note); if (s.video) video = true; }); });
        var g0 = t ? groupsOf(t.ex)[0] : null, key = l.id + ':' + wi + ':' + di;
        out.push({ key: key, lifterId: l.id, day: day10(when), name: d.name, week: wi + 1,
          top: t ? { lift: MAIN[t.ex.lift] ? t.ex.lift : null, written: g0 ? rxText(g0, g0.sets.length) : null, lifted: t.set.w ? n(t.set.w) + ' × ' + t.set.r : String(t.set.r), felt: t.set.felt != null ? t.set.felt : t.set.rpe != null ? t.set.rpe : null } : null,
          note: notes[0] || null, video: video, seen: !!ST.sesSeen[key], by: d.by || null });
      }); });
    });
    out.sort(function (a, b) { return String(b.day).localeCompare(String(a.day)) || a.lifterId.localeCompare(b.lifterId); });
    return out;
  }
  /* a due reminder, and a change to a session within a day that is still unseen at 20:00 the evening before (shared.md
     §6.8, §6.10): tier-1 reasons the Needs-you rows add */
  /* a reminder is due on its day, or at its time when it has one ("2026-11-14T09:00", FP F4.4's Do it Saturday) */
  function dueReminders() { var now = nowIso(); return ST.remind.filter(function (r) { return !r.done && remindDue(r, now); }); }
  function unseenMoves() {
    var now = nowIso(), out = [];
    C.items.forEach(function (it) {
      var d = doneOf(it.id); if (!d || it.ids.length !== 1 || ST.cardSeen[it.id]) return;
      var a = actOf(it, d.act); if (!a || !a.ops || !a.ops.length || landsOf(it, a) !== 'published') return;
      var l = K.L(it.ids[0]); if (!l || !l.program) return;
      var mv = a.ops.filter(function (o) { return o.op === 'moveDay' || o.op === 'merge'; })[0], iso = mv ? (mv.to || mv.into) : changeOn(l, a.ops);
      if (!iso) return;
      var eve = K.add(iso, -1) + 'T20:00';
      if (now >= eve && now.slice(0, 10) <= iso && !(isStr(d.at) && tOf(now) - tOf(d.at) < 4 * 3600000)) out.push({ id: l.id, itemId: it.id, iso: iso, text: 'Hasn’t opened ' + K.wd(iso) + '’s ' + (mv ? 'move' : 'change') });
    });
    return out;
  }
  /* the RTS chart at RPE 10 (block.js's when the page has it): an intake's best set as a max, to the plate step */
  var RTS10 = { 1: 1, 2: 0.955, 3: 0.922, 4: 0.892, 5: 0.863, 6: 0.837, 7: 0.811, 8: 0.786, 9: 0.762, 10: 0.739, 11: 0.707, 12: 0.68 };
  function rtsMax(kg, reps) {
    var Bk = BLK(), p = null;
    if (Bk && Bk.math && typeof Bk.math.pct === 'function') { try { p = Bk.math.pct(reps, 10); } catch (e) { p = null; } }
    if (!isNum(p) || !(p > 0)) p = RTS10[reps] || null;
    return p ? Math.round(kg / p / 2.5) * 2.5 : null;
  }
  var CLASSES = { F: [47, 52, 57, 63, 69, 76, 84], M: [59, 66, 74, 83, 93, 105, 120] };
  /* request #15: a federation's own classes (USPA); every list ends with its plus class ("120+"), a class of its own */
  var FED_CLASSES = { USPA: { M: [52, 56, 60, 67.5, 75, 82.5, 90, 100, 110, 125, 140], F: [44, 48, 52, 56, 60, 67.5, 75, 82.5, 90, 100] } };
  function classList(sx, fed) { var f = isStr(fed) ? FED_CLASSES[fed.trim().toUpperCase()] : null; return sx ? (f ? f[sx] : CLASSES[sx]) : CLASSES.F.concat(CLASSES.M); }
  function sexOf(l) { var s = String(l.sex || '').toUpperCase(); return s === 'M' ? 'M' : s === 'F' ? 'F' : null; }

  /* the writes STORE-1 adds (replayed from pl:v1:edits like every other) */
  OPS.moveDay = function (a, ctx) {
    /* shared.md §6.2: the only write that moves a session. publish: the lifter's week changes (and the draft); else the draft
       only (the Programs editor's crimson sends it). Both mark the week changed since it was sent */
    var l = L(a.id), p = l && l.program, w = p && p.weeks[a.wi], d = w && w.days[a.di]; if (!d) return fail('not_found', 'That session is not in the program.');
    var was = dayDateOf(l, a.wi, d.name); if (was === a.iso) return fail('invalid', d.name + ' is already on ' + K.wd(a.iso) + '.');
    var undos = [], drafts0 = [], keys = ['session:' + l.id + ':' + a.wi + ':' + a.di];
    if (a.publish) {
      var weeks = [a.wi]; if (a.scope === 'on') for (var k = a.wi + 1; k < p.weeks.length; k++) weeks.push(k);
      weeks.forEach(function (wi) { var wx = p.weeks[wi], dx = wx && wx.days.filter(function (x) { return x.name === d.name; })[0]; if (!dx || dx.done > 0) return; var prev = dx.date, iso = wi === a.wi ? a.iso : K.add(dayDateOf(l, wi, d.name), K.daysTo(a.iso) - K.daysTo(was)); dx.date = iso; undos.push(function () { if (prev === undefined) delete dx.date; else dx.date = prev; }); });
    }
    var Bk = BLK();
    if (Bk && (drafts[l.id] || !a.publish)) {
      var before = drafts[l.id] ? clone(drafts[l.id]) : null;
      if (!(ctx && ctx.replay && drafts[l.id] && a.drafted)) {
        var b = null; try { b = Bk.from(before || programAnswer(l).data); } catch (e) { b = null; }
        if (b) { var x = b.moveDay(a.wi, d.name, a.iso, { scope: a.scope || 'week' }); if (x && !x.error) { drafts[l.id] = b.toJSON(); a.drafted = true; } else if (!a.publish) { undos.forEach(function (u) { u(); }); return x && x.error ? { error: x.error } : fail('invalid', 'That day cannot take ' + d.name + '.'); } }
      }
      undos.push(function () { if (before) drafts[l.id] = before; else delete drafts[l.id]; });
      drafts0.push(l.id);
    } else if (!a.publish) return fail('invalid', 'Moving a session in the editor needs block.js on the page.');
    var note = d.name + ' moved from ' + dmyOf(was) + ' to ' + dmyOf(a.iso), hadCh = has(w, 'changedSinceSent'), prevCh = w.changedSinceSent;
    if (w.sentAt || w.published !== false) { w.changedSinceSent = (w.changedSinceSent || []).concat([note]); undos.push(function () { if (hadCh) w.changedSinceSent = prevCh; else delete w.changedSinceSent; }); }
    return { changed: true, kind: 'session', persist: true, drafts: drafts0, data: { id: l.id, week: a.wi + 1, idx: a.di, name: d.name, from: was, date: a.iso, published: !!a.publish }, keys: keys, ids: [l.id],
      events: [['session:moved', { id: l.id, idx: a.di, date: a.iso }]], undo: chain(undos), label: l.first + ', ' + d.name.toLowerCase() + ' ' + dmyOf(a.iso) + '.', undoLabel: l.first + '’s ' + d.name.toLowerCase() + ' is back on ' + dmyOf(was) + '.' };
  };
  OPS.remind = function (a) {
    var l = L(a.lifterId); if (!l) return noLifter(a.lifterId);
    var rm = { id: a.rid, lifterId: l.id, on: a.on, text: a.text, kind: a.kind || 'note', itemId: a.itemId || null, at: a.at, done: null };
    ST.remind.push(rm);
    return { changed: true, kind: 'reminder', persist: true, data: clone(rm), keys: ['remind:' + rm.id], ids: [l.id], events: [], undo: function () { var i = ST.remind.indexOf(rm); if (i >= 0) ST.remind.splice(i, 1); }, label: a.kind === 'first-block' ? snoozeWords(a) + '.' : 'Reminder set for ' + dmyOf(day10(a.on)) + (String(a.on).length > 10 ? ', ' + String(a.on).slice(11, 16) : '') + ': ' + lower1(a.text).replace(/\.$/, '') + '.', undoLabel: a.kind === 'first-block' ? 'Back in Needs you.' : 'Reminder taken off.' };
  };
  OPS.remindDone = function (a) {
    var rm = ST.remind.filter(function (r) { return r.id === a.rid; })[0]; if (!rm) return fail('not_found', 'There is no reminder ' + a.rid + '.');
    if (rm.done) return { changed: false, data: clone(rm) };
    rm.done = a.at;
    return { changed: true, kind: 'reminder', persist: true, data: clone(rm), keys: ['remind:' + rm.id], ids: [rm.lifterId], events: [], undo: function () { rm.done = null; }, label: 'Reminder done.', undoLabel: 'Reminder back on.' };
  };
  /* "Not pain" on a note's pain reading (shared.md §4.17): the hold lifts, the words stay the reason */
  OPS.notPain = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    if (ST.notPain[l.id]) return { changed: false, data: { id: l.id } };
    ST.notPain[l.id] = a.at;
    var nt = lastNote(l), Bk = BLK(), pw = nt && Bk && Bk.painWords ? Bk.painWords(nt.note) : null, lift = pw && pw.lift ? pw.lift : null;
    return { changed: true, kind: 'lifter', persist: true, data: { id: l.id, lift: lift }, keys: ['notpain:' + l.id], ids: [l.id], events: [['program:saved', { id: l.id }]],
      undo: function () { delete ST.notPain[l.id]; }, label: 'Not pain: ' + l.first + '’s note' + (lift ? '. Her ' + lift + ' rule runs again.' : '.').replace('Her ', l.sex === 'M' ? 'His ' : 'Her '), undoLabel: 'Back to pain: ' + l.first + '’s note.' };
  };
  OPS.pain = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    var rec = { day: day10(a.on || a.at), part: a.where, sev: a.score, lift: a.lift ? K.LIFT[a.lift] || upper1(a.lift) : null, phase: null, note: a.note || '', resolved: false, from: a.from || 'coach', at: a.at };
    l.pain = l.pain || []; l.pain.unshift(rec);
    return { changed: true, kind: 'pain', persist: true, data: clone(rec), keys: ['pain:' + l.id + ':' + a.at], ids: [l.id], events: [], undo: function () { var i = l.pain.indexOf(rec); if (i >= 0) l.pain.splice(i, 1); },
      label: l.first + ': ' + lower1(a.where) + ' ' + n(a.score) + '/10' + (a.lift ? ', ' + a.lift : '') + ', recorded.', undoLabel: 'Pain record taken off.' };
  };
  OPS.logFor = function (a) {
    var l = L(a.id), p = l && l.program, w = p && p.weeks[a.week - 1], d = w && w.days.filter(function (x) { return x.name === a.day; })[0];
    if (!d) return fail('not_found', 'There is no ' + (a.day || 'such day') + ' in week ' + a.week + '.');
    var k = parseRowKey(a.row), hit = k ? exIn(w, a.day, k.title, k.occ) : null, ex = hit ? hit.ex : (d.exercises || []).filter(function (e) { return e.title === a.row || nameOf(e) === a.row; })[0];
    /* a lifters.week row key (w1.d1.e0.g0) names the line too (numbers flow, request #44) */
    var wk0 = !ex ? parseKey(a.row) : null; if (wk0 && p.weeks[wk0.wi] === w && w.days[wk0.di] === d && d.exercises && d.exercises[wk0.ei]) { ex = d.exercises[wk0.ei]; k = { line: wk0.gi || 0 }; }
    if (!ex) return fail('not_found', 'There is no line ' + a.row + ' on ' + a.day + '.');
    var g = groupsOf(ex)[k ? k.line : 0] || groupsOf(ex)[0], sets = g ? g.sets : ex.sets, prev = [], prevDone = d.done, prevBy = d.by, added = 0;
    var byYou = a.by !== 'lifter';
    a.sets.forEach(function (x, i) { var s = sets[i] || null; if (!s) { s = { w: x.w, r: x.r, done: 0 }; ex.sets.push(s); prev.push({ s: s, add: true }); } else prev.push({ s: s, o: clone(s) }); if (!s.done) added++; s.w = x.w; s.r = x.r; if (x.felt != null) s.felt = x.felt; s.done = 1; s.on = a.at; if (byYou) s.by = 'coach'; });
    d.done = (d.done || 0) + added; if (byYou) d.by = 'coach';
    if (isStr(a.note) && a.note) { var ls = sets[a.sets.length - 1] || null; if (ls) ls.note = a.note; }
    return { changed: true, kind: 'log', persist: true, data: { id: l.id, week: a.week, day: a.day, row: a.row, sets: clone(a.sets), by: 'coach' }, keys: ['log:' + l.id + ':' + a.week + ':' + a.day], ids: [l.id], events: [['program:saved', { id: l.id }]],
      undo: function () { prev.forEach(function (x) { if (x.add) { var i = ex.sets.indexOf(x.s); if (i >= 0) ex.sets.splice(i, 1); } else { Object.keys(x.s).forEach(function (kk) { delete x.s[kk]; }); Object.keys(x.o).forEach(function (kk) { x.s[kk] = x.o[kk]; }); } }); d.done = prevDone; if (prevBy === undefined) delete d.by; else d.by = prevBy; },
      label: l.first + ', ' + String(a.day).toLowerCase() + ': ' + a.sets.map(function (x) { return n(x.w) + ' × ' + x.r + (x.felt != null ? ' @' + n(x.felt) : ''); }).join(', ') + (byYou ? ', logged by you.' : ', logged.'), undoLabel: 'Log taken back.' };
  };
  OPS.seenOk = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    var its = openNeedItems(l), undos = [], items = [];
    its.forEach(function (it) { undos.push(itemDone(it.id, { act: 'seen', at: a.at, label: 'Seen, nothing to change' })); items.push(it.id); });
    var had = has(ST.seenOk, l.id), prev = ST.seenOk[l.id]; ST.seenOk[l.id] = { at: a.at }; undos.push(function () { if (had) ST.seenOk[l.id] = prev; else delete ST.seenOk[l.id]; });
    return { changed: true, kind: 'item', persist: true, data: { id: l.id, items: items }, keys: ['seen:' + l.id].concat(items.map(function (x) { return 'item:' + x; })), items: items, ids: [l.id].concat(items),
      events: items.map(function (x) { return ['item:done', { itemId: x, actId: 'seen' }]; }), undoEvents: items.map(function (x) { return ['item:undone', { itemId: x, actId: 'seen' }]; }), undo: chain(undos), label: l.first + ': seen, nothing to change.', undoLabel: l.first + ' is back in Needs you.' };
  };
  /* the lifter's app opened something (read receipts, shared.md §6.10): a week, a message, a change card, a session */
  OPS.seen = function (a) {
    var map = a.what === 'week' ? ST.weekSeen : a.what === 'card' ? ST.cardSeen : a.what === 'session' ? ST.sesSeen : ST.msgSeen;
    /* a week seen before a later change to it is seen again (request #31: the change's receipt) */
    var had = has(map, a.key), prev = map[a.key];
    if (prev && !(a.what === 'week' && LOG.some(function (rec) { var at = rec.at || (rec.a && rec.a.at); return isStr(at) && tOf(at) > tOf(prev) && recLifter(rec) + ':' + recWeek(rec) === a.key; }))) return { changed: false, data: { key: a.key, at: map[a.key] } };
    /* the moment it was seen is the write's own time, so a reload replays the same "Seen Mon 19:11" (FIX-LOGIC walk 2) */
    map[a.key] = isStr(a.at) && !isNaN(tOf(a.at)) ? localIso(tOf(a.at)) : nowIso();
    return { changed: true, kind: 'seen', persist: true, data: { key: a.key, at: map[a.key] }, keys: ['seen:' + a.what + ':' + a.key], ids: a.id ? [a.id] : [], events: [], undo: function () { if (had) map[a.key] = prev; else delete map[a.key]; }, label: a.what === 'session' ? sessionReadLabel(a.key) : 'Seen ' + map[a.key].slice(11, 16) + '.' };
  };
  /* FIX-LOGIC (first-time walk 2): "Nothing to change" on a lifter's session says what it did, in words a new coach reads
     ("Jess's squat day marked as read."), never "Ticked off." */
  function sessionReadLabel(key) {
    var p = String(key || '').split(':'), l = L(p[0]), wk = l && l.program ? l.program.weeks[Number(p[1])] : null, d = wk && wk.days ? wk.days[Number(p[2])] : null;
    return l ? l.first + '\u2019s ' + (d && d.name ? String(d.name).toLowerCase() : 'session') + ' marked as read.' : 'Marked as read.';
  }
  OPS.settle = function (a) {
    var it = C.get(a.itemId); if (!it) return fail('not_found', 'There is no item ' + a.itemId + '.');
    if (doneOf(it.id)) return fail('conflict', 'Already done: ' + doneLabel(it, doneOf(it.id)) + '.');
    var u = itemDone(it.id, { act: 'settle', at: a.at, label: a.label || 'Kept as written' });
    return { changed: true, kind: 'item', persist: true, data: { itemId: it.id }, keys: ['item:' + it.id], items: [it.id], ids: [it.id].concat(it.ids), events: [['item:done', { itemId: it.id, actId: 'settle' }]], undoEvents: [['item:undone', { itemId: it.id, actId: 'settle' }]], undo: u, label: (a.label || 'Kept as written') + '.' };
  };
  OPS.schedule = function (a) {
    var l = L(a.id); if (!l || !l.program) return fail('not_found', 'No program to schedule.');
    var undos = [], on = [];
    a.ns.forEach(function (wn) { var k = l.id + ':' + wn, had = has(ST.sched, k), prev = ST.sched[k], w = l.program.weeks[wn - 1], d0 = trainDays(w)[0], iso = d0 ? dayDateOf(l, wn - 1, d0.name) : null; ST.sched[k] = iso; on.push({ n: wn, on: iso }); undos.push(function () { if (had) ST.sched[k] = prev; else delete ST.sched[k]; }); });
    return { changed: true, kind: 'program', persist: true, data: { id: l.id, weeks: on }, keys: a.ns.map(function (wn) { return 'sched:' + l.id + ':' + wn; }), ids: [l.id], events: [['program:saved', { id: l.id }]], undo: chain(undos),
      label: on.map(function (x) { return 'Week ' + x.n + ' goes out ' + (x.on ? K.wd3(x.on) + ' ' + K.d(x.on).getDate() : 'on its first day'); }).join('. ') + '.' };
  };
  /* a change on the shared draft (programs.md §11.2), nothing sent; prop: start from the store's proposal of that week */
  OPS.change = function (a, ctx) {
    var l = L(a.id), Bk = BLK(); if (!l || !l.program) return fail('not_found', 'No program to change.');
    var before = drafts[l.id] ? clone(drafts[l.id]) : null;
    if (!(ctx && ctx.replay && a.drafted && drafts[l.id])) {
      if (!Bk) return fail('invalid', 'Changing a program needs block.js on the page.');
      var b; try { b = Bk.from(before || programAnswer(l).data); } catch (e) { return fail('invalid', 'That program cannot be read.'); }
      if (isNum(a.prop)) { var pp = null; try { pp = Bk.propose(b, a.prop - 1, { holds: holdsFor(l), today: TODAY, rules: rulesCtx() }); } catch (e) { pp = null; } if (pp && pp.block && !pp.error) b.useProposal(pp); }
      var res = applyOps(b, a.ops || []); if (res.error) return res;
      drafts[l.id] = b.toJSON(); a.drafted = true;
    }
    return { changed: true, kind: 'program', persist: true, drafts: [l.id], data: { id: l.id, ops: (a.ops || []).length }, keys: ['change:' + l.id + ':' + a.at], ids: [l.id], events: [['program:saved', { id: l.id }]],
      undo: function () { if (before) drafts[l.id] = before; else delete drafts[l.id]; }, label: a.label || l.first + '’s program changed. Not sent.' };
  };
  function restNext(l) {
    var dr = nextDrafts[l.id], Bk = BLK(); if (!dr || !Array.isArray(dr.weeks) || !Bk || !dr.weeks.every(function (w) { return w.label && /recovery|off/i.test(w.label); })) return null;
    var b; try { b = Bk.from(dr); } catch (e) { return null; }
    var last = null; b.weeks.forEach(function (w, c) { b.days.forEach(function (d) { var x = b.dateOf(c, d.name); if (x && b.rows.some(function (row) { return row.day === d.name && row.cells[w.uid]; }) && (!last || x > last)) last = x; }); });
    if (!last) return null; var from = K.add(last, 1), wd = K.d(from).getDay(), mon = wd === 1 ? from : K.add(from, (8 - wd) % 7);
    return { name: dr.name || 'Next block', startsOn: mon, from: dr.start || null, weeks: dr.weeks.length, rest: true };
  }
  /* the lifter's own training weekdays, in date order, from the last normal week of the block (Callum: Squat Day Tue,
     Bench Day Thu, Deadlift Day Sat); the intake's days for a lifter whose block has none dated */
  function ownWeekdays(l) {
    var p = l && l.program, out = [];
    if (p && p.weeks && p.weeks.length) {
      for (var wi = srcWeek(p); wi >= 0 && !out.length; wi--) {
        trainDays(p.weeks[wi]).forEach(function (d) { var iso = dayDateOf(l, wi, d.name); if (iso) out.push({ name: d.name, iso: iso, wd: K.d(iso).getDay() }); });
      }
      out.sort(function (x, y) { return x.iso < y.iso ? -1 : x.iso > y.iso ? 1 : 0; });
    }
    if (!out.length && l && l.intake && Array.isArray(l.intake.days)) { var WDN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }; l.intake.days.forEach(function (x, i) { var wd = WDN[String(x).slice(0, 3)]; if (wd != null) out.push({ name: 'Day ' + (i + 1), wd: wd }); }); }
    return out;
  }
  /* FIX-LOGIC (FP F2.3): a template with more days than the lifter, one day merged into another ({ day, into }: template day
     names). On a v2 block JSON: the day's rows take the other day's name and the day leaves the list; on a v1 week's days:
     the exercises follow (the into day keeps its own first) */
  function mergeTplJson(j, m) {
    if (!m || !j.days.some(function (d) { return d.name === m.day; }) || !j.days.some(function (d) { return d.name === m.into; })) return j;
    (j.rows || []).forEach(function (row) { if (row.day === m.day) row.day = m.into; });
    j.days = j.days.filter(function (d) { return d.name !== m.day; });
    return j;
  }
  function mergeTplDays(days, m) {
    if (!m || !Array.isArray(days)) return days;
    var from = days.filter(function (d) { return d.name === m.day; })[0], into = days.filter(function (d) { return d.name === m.into; })[0];
    if (!from || !into) return days;
    return days.filter(function (d) { return d !== from; }).map(function (d) { return d === into ? Object.assign({}, d, { exercises: (d.exercises || []).concat(from.exercises || []) }) : d; });
  }
  function nextJson(l, a) {
    var Bk = BLK(); if (!Bk) return null;
    try {
      var b0 = blockOf(l), cur = nextDrafts[l.id] ? Bk.from(nextDrafts[l.id]) : null, tb = null;
      if (a.from === 'template') { var t = templates().filter(function (x) { return x.name === a.name || x.id === a.template; })[0], tj = t ? tplBlock(t) : null; if (tj) tb = Bk.from(clone(tj)); }
      else if (a.from === 'repeat' && b0) tb = Bk.from(Bk.asTemplate(b0, { name: b0.name }));
      else if ((a.from === 'recovery' || a.from === 'off') && b0 && !cur) { var rv = Bk.recovery(b0, meetCtx(l)); if (rv && rv.block) { var rj = rv.block.toJSON(); rj.start = a.startsOn || rj.start; return rj; } return null; }
      if (!tb) return null;
      if (cur && a.append) { var ap = cur.append(tb); return ap && ap.error ? null : cur.toJSON(); }
      var j = tb.toJSON(); j.id = l.id; j.name = a.name || tb.name; j.start = a.startsOn; j.blockKind = null;
      if (b0) { j.maxes = clone(b0.maxes); j.maxFrom = clone(b0.maxFrom); j.today = clone(b0.today); j.steps = clone(b0.steps); }
      /* LOGIC-FIX-4 (walk 2, Callum): a template lands on the lifter's own training days, in the template's order (Squat
         Tue, Bench Thu, Deadlift Sat), as the intake path does for a first block; never on the template's Mon, Wed, Fri */
      var own = ownWeekdays(l);
      /* FIX-LOGIC (FP F2.3): "Merge it into Thursday": the template day with no weekday goes into another of its days */
      if (a.merge && Array.isArray(j.days)) mergeTplJson(j, a.merge);
      /* spec C (FP F2.2): days the coach picked for the next block, the template's days placed on them (BLOCK.placeDays) */
      if (Array.isArray(a.days) && a.days.length && typeof Bk.placeDays === 'function' && Array.isArray(j.days) && j.days.length) {
        var pd = Bk.placeDays(j.days.map(function (d) { return { name: d.name, wd: d.wd == null ? null : d.wd }; }), a.days, l);
        own = pd.days.map(function (d) { return { name: d.name, wd: d.wd }; });
      }
      if (own.length && Array.isArray(j.days) && j.days.length) {
        var byName = {}; own.forEach(function (x) { byName[x.name.toLowerCase()] = x.wd; });
        var sorted = own.map(function (x) { return x.wd; });
        var allNamed = j.days.every(function (d) { return byName[String(d.name).toLowerCase()] != null; });
        j.days.forEach(function (d, i) { var wd = allNamed ? byName[String(d.name).toLowerCase()] : sorted[i]; if (wd != null) d.wd = wd; });
        if (j.start && j.days[0] && j.days[0].wd != null) { var sw = K.d(j.start).getDay(), d0 = j.days.reduce(function (m, d) { return d.wd != null && ((d.wd - sw + 7) % 7) < m ? (d.wd - sw + 7) % 7 : m; }, 7); if (d0 < 7) j.start = K.add(j.start, d0); }
        (j.weeks || []).forEach(function (w) { if (w && w.dates) w.dates = {}; });
      }
      return Bk.from(j).toJSON();
    } catch (e) { return null; }
  }
  OPS.nextBlock = function (a, ctx) {
    var l = L(a.id); if (!l || !l.program) return fail('not_found', 'No program to follow.');
    var had = has(ST.nextBlocks, l.id), prev = ST.nextBlocks[l.id], cur = ST.nextBlocks[l.id];
    var nb = a.append && cur ? clone(cur) : { name: a.name, startsOn: a.startsOn, weeks: [], from: a.from, sentAt: null };
    (a.weeks || []).forEach(function (w) { nb.weeks.push(w); });
    if (a.append && cur) nb.appended = true;
    ST.nextBlocks[l.id] = nb;
    /* LOGIC-FIX-1 (request #35, programs.md §11.4): the next block's lines as a block.js draft, from the template (at the
       lifter's maxes), the block repeated, or the recovery week; a template after a saved next block goes after its weeks */
    var hadN = has(nextDrafts, l.id), prevN = nextDrafts[l.id], nexts = [];
    if (!(ctx && ctx.replay && a.drafted)) {
      var nj = nextJson(l, a); if (nj) { nextDrafts[l.id] = nj; a.drafted = true; nexts.push(l.id); }
    }
    return { changed: true, kind: 'program', persist: true, nexts: nexts, data: { id: l.id, startsOn: nb.startsOn, name: nb.name, weeks: nb.weeks.length, appended: !!nb.appended }, keys: ['next:' + l.id], ids: [l.id], events: [['program:saved', { id: l.id }]],
      undo: function () { if (had) ST.nextBlocks[l.id] = prev; else delete ST.nextBlocks[l.id]; if (nexts.length) { if (hadN) nextDrafts[l.id] = prevN; else delete nextDrafts[l.id]; } }, label: a.label };
  };
  /* LOGIC-FIX-1 (request #24, overview-lifters §5.6): the meet day's one line by the board's stage: "Callum, Priya, Tom.
     Scale 08:00 to 09:30." · "Tom made weight. Scale until 09:30." · "All three made weight. Squats 10:00." · "Tom 0.3 kg
     over at the scale." · "Squats now." · "Done: Tom 665, …" */
  function meetDayWords(m) {
    var firstOf = function (id) { var l = K.L(id); return l ? l.first : id; };
    var names = function (ids, max) { max = max || 3; var f = ids.map(firstOf); return f.length <= max ? f.join(', ') : f.slice(0, max).join(', ') + ' and ' + (f.length - max) + ' more'; };
    var who = names(m.ids, 4), b = null;
    try { var rb = PL.meets && typeof PL.meets.board === 'function' ? PL.meets.board(m.id) : null; b = rb && rb.data ? rb.data : null; } catch (e) { b = null; }
    if (!b) return who + '.';
    var ls = b.lifters || [], st = function (k) { return (b.stages || []).filter(function (x) { return x.id === k; })[0] || {}; }, clk = b.clock || {};
    if (b.stage === 'weigh') {
      var made = ls.filter(function (l) { return l.weigh === 'made'; }), over = ls.filter(function (l) { return l.weigh === 'over'; });
      if (!made.length && !over.length) return who + '. Scale ' + (clk.weighOpens || st('weigh').at || '') + ' to ' + (clk.weighCloses || st('weigh').until || '') + '.';
      if (over.length) return over.map(function (l) { return l.first + ' ' + n(Math.abs(l.over)) + ' kg over'; }).join(', ') + ' at the scale.';
      if (made.length === ls.length) return (ls.length === 3 ? 'All three' : ls.length === 2 ? 'Both' : ls.length === 1 ? made[0].first : 'All ' + ls.length) + ' made weight. Squats ' + (st('squat').at || '') + '.';
      return names(made.map(function (l) { return l.id; })) + ' made weight. Scale until ' + (clk.weighCloses || st('weigh').until || '') + '.';
    }
    if (b.stage === 'squat') return 'Squats now.';
    if (b.stage === 'bench') return 'Bench now.';
    if (b.stage === 'deadlift') return 'Deadlifts now.';
    if (b.stage === 'done') return 'Done: ' + ls.map(function (l) { return l.first + ' ' + n(l.total); }).join(', ') + '.';
    return who + '.';
  }
  /* LOGIC-FIX-1 (programs.md §9, request #39): the coach's templates */
  OPS.tplSave = function (a) {
    if (templates().some(function (t) { return t.id === a.id; })) return fail('conflict', 'There is a template called ' + a.name + ' already.');
    var rec = { id: a.id, name: a.name, block: clone(a.json), at: a.at }; ST.tpls.unshift(rec);
    return { changed: true, kind: 'template', persist: true, data: { id: a.id, name: a.name }, keys: ['tpl:' + a.id], ids: [], events: [['program:saved', { template: a.id }]],
      undo: function () { var i = ST.tpls.indexOf(rec); if (i >= 0) ST.tpls.splice(i, 1); }, label: a.label || a.name + ' is saved as a template.', undoLabel: a.name + ' is no longer a template.' };
  };
  OPS.tplRename = function (a) {
    var t = templates().filter(function (x) { return x.id === a.id; })[0]; if (!t) return fail('not_found', 'There is no template ' + a.id + '.');
    var had = has(ST.tplNames, a.id), prev = ST.tplNames[a.id]; ST.tplNames[a.id] = a.name;
    return { changed: true, kind: 'template', persist: true, data: { id: a.id, name: a.name }, keys: ['tpl:' + a.id], ids: [], events: [['program:saved', { template: a.id }]],
      undo: function () { if (had) ST.tplNames[a.id] = prev; else delete ST.tplNames[a.id]; }, label: t.name + ' is now ' + a.name + '.', undoLabel: 'The template is ' + t.name + ' again.' };
  };
  /* LOGIC-FIX-3 (Programs' request, programs.md §9): a template edited in the Week view saves to the same template */
  OPS.tplUpdate = function (a) {
    var t = templates().filter(function (x) { return x.id === a.id; })[0]; if (!t) return fail('not_found', 'There is no template ' + a.id + '.');
    var had = has(ST.tplEdits, a.id), prev = ST.tplEdits[a.id]; ST.tplEdits[a.id] = clone(a.json);
    return { changed: true, kind: 'template', persist: true, data: { id: a.id, name: t.name, weeks: Array.isArray(a.json.weeks) ? a.json.weeks.length : 0 }, keys: ['tpl:' + a.id], ids: [], events: [['program:saved', { template: a.id }]],
      undo: function () { if (had) ST.tplEdits[a.id] = prev; else delete ST.tplEdits[a.id]; }, label: t.name + ' is saved.', undoLabel: t.name + ' is back as it was.' };
  };
  OPS.tplRemove = function (a) {
    var t = templates().filter(function (x) { return x.id === a.id; })[0]; if (!t) return fail('not_found', 'There is no template ' + a.id + '.');
    ST.tplGone[a.id] = true;
    return { changed: true, kind: 'template', persist: true, data: { id: a.id }, keys: ['tpl:' + a.id], ids: [], events: [['program:saved', { template: a.id }]],
      undo: function () { delete ST.tplGone[a.id]; }, label: t.name + ' is removed from your templates.', undoLabel: t.name + ' is back in your templates.' };
  };
  /* LOGIC-FIX-1: a save of the next block's draft (pl:v1:blocks:<id>:next), kept like the current block's (persist: false) */
  OPS.draftNext = function (a) {
    var l = L(a.id); if (!l || !l.program) return fail('not_found', 'No program to follow.');
    var had = has(nextDrafts, l.id), prev = nextDrafts[l.id];
    nextDrafts[l.id] = clone(a.block);
    return { changed: true, kind: 'program', persist: false, nexts: [l.id], data: { id: l.id, block: 'next' }, keys: ['next:' + l.id], ids: [l.id], events: [['program:saved', { id: l.id, block: 'next' }]],
      undo: function () { if (had) nextDrafts[l.id] = prev; else delete nextDrafts[l.id]; }, label: a.label ? endDot(a.label) : 'Saved.' };
  };
  OPS.setClass = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    var hadB = !!l.bw, prevB = l.bw ? clone(l.bw) : null, now = bwNow(l);
    l.bw = l.bw || {}; l.bw.cls = String(a.cls); if (/\+$/.test(String(a.cls))) l.bw.over = null; else if (now != null) l.bw.over = r1(now - a.cls);   /* a plus class has no limit */
    return { changed: true, kind: 'lifter', persist: true, data: { id: l.id, cls: a.cls }, keys: ['class:' + l.id], ids: [l.id], events: [['meet:changed', { id: l.id }]],
      undo: function () { if (hadB) l.bw = prevB; else delete l.bw; }, label: l.first + ' lifts in ' + clsWords(a.cls) + '.', undoLabel: l.first + '’s class is back as it was.' };
  };
  /* the max a load is worked from (shared.md §3): typed, else the working e1RM rounded to the step */
  /* LOGIC-FIX-1 (shared.md §3, request #37, #33): lifts[k].max is the max in force for loads, the same number the maxes line
     shows: typed, else the block's from the lifting (the draft's), else the working e1RM rounded to the step. maxFrom says
     which ('typed' | 'lifting'); lifts[k].loadMax is the same entry loadMax[k] holds. */
  function maxesInForce(l, lifts, dm) {
    var o = loadMaxes(l, lifts);
    LIFTS.forEach(function (k) {
      var x = lifts[k]; if (!x) return; var typed = x.max != null, kg = typed ? x.max : dm && isNum(dm[k]) ? dm[k] : o[k] ? o[k].kg : null;
      if (o[k] && !typed && kg != null && kg !== o[k].kg) o[k] = { kg: kg, from: 'lifting', words: o[k].words.replace(/^[\d.,]+/, n(kg)) };
      x.typed = typed ? x.max : null; x.max = kg; x.maxFrom = kg == null ? null : typed ? 'typed' : 'lifting'; x.loadMax = o[k] || null;
    });
    return o;
  }
  function loadMaxes(l, lifts) {
    var o = {}; LIFTS.forEach(function (k) { var x = lifts[k], typed = x && x.max != null, kg = typed ? x.max : x && isNum(x.e1) ? Math.round(x.e1 / 2.5) * 2.5 : null; o[k] = kg == null ? null : { kg: kg, from: typed ? 'typed' : 'lifting', words: n(kg) + (typed ? ', typed' : ', from ' + (l.sex === 'M' ? 'his' : l.sex === 'F' ? 'her' : 'their') + ' lifting') }; });
    return o;
  }
  /* handled today: the fix done on the row, with its done words and time (the done row, shared.md §9) */
  function watchTouched(id) {
    var day = nowIso().slice(0, 10), hit = null;
    LOG.forEach(function (rec) { var at = rec.at || (rec.a && rec.a.at); if (!isStr(at) || localIso(tOf(at)).slice(0, 10) !== day || rec.kind === 'seen' || rec.op === 'read') return; if (recLifter(rec) === id) hit = { at: at, label: rec.label || 'Done' }; });
    return hit;
  }
  function handledOf(r) {
    if (r && r.watchDone) return { at: r.watchDone.at ? localIso(tOf(r.watchDone.at)) : null, label: String(r.watchDone.label || '').replace(/\.$/, ''), sent: false }; var d = r && r.fix && r.fix.done; if (!d || !r.base || r.base !== 'need' || r.openNeed) return null; return { at: d.at ? localIso(tOf(d.at)) : null, label: doneLabel(r.fix.it, d), sent: !!d.text }; }
  function parseRowKey(key) { if (!isStr(key) || key.indexOf('|') < 0) return null; var k = key.split('|'); return { day: k[0], title: k[1], occ: Number(k[2] || 1), line: Number(k[3] || 0) }; }

  function inviteCode(name) { var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', h = 2166136261, out = ''; for (var i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); } for (var k = 0; k < 6; k++) { h = Math.imul(h ^ (h >>> 13), 1274126177) + k; out += A[(h >>> 0) % A.length]; } return out; }

  /* ================= templates, a new program ================= */
  function templates() {
    return cached('templates', function () {
      /* each template is D.templates[i].block (v 2 JSON: nothing lifted or sent, no maxes), one entry each (programs.md §11.1) */
      var out = [], entry = function (id, name, bk, t, own) {
        var days = bk && Array.isArray(bk.days) ? bk.days.map(function (d) { return d.name; }) : ((t && t.days) || []).map(function (d) { return isStr(d) ? d : d.name; });
        var used = D.lifters.filter(function (l) { return l.program && l.program.name === name; }).map(function (l) { return l.id; });
        return { id: id, name: name, weeks: bk && Array.isArray(bk.weeks) ? bk.weeks.length : (t && t.weeks) || 0, days: days, perWeek: bk && bk.perWeek ? bk.perWeek : days.length, mine: true, usedBy: used, source: null, own: !!own };
      };
      /* the coach's own (PL.templates.save, newest first), then the demo's; renamed and removed ones as the coach left them */
      ST.tpls.forEach(function (x) { if (!ST.tplGone[x.id]) out.push(entry(x.id, ST.tplNames[x.id] || x.name, ST.tplEdits[x.id] || x.block, null, true)); });
      (D.templates || []).forEach(function (t) { var id = 'tpl-' + slug(t.name); if (!ST.tplGone[id]) out.push(entry(id, ST.tplNames[id] || t.name, ST.tplEdits[id] || t.block || null, t, false)); });
      return out;
    });
  }
  function startMaxes(l) {
    /* the lifter's own e1RM, else the intake's best set by the RTS chart at RPE 10, to the step (programs.md §11.1: Hannah
       92.5 / 55 / 115) */
    var m = {}; LIFTS.forEach(function (lift) { var x = l.lifts && l.lifts[lift] && l.lifts[lift].e1, ib = l.intake && l.intake.best && l.intake.best[lift]; m[lift] = x ? x : ib && ib.kg ? rtsMax(ib.kg, ib.reps) : null; });
    return m;
  }
  function nextMonday() { return K.monday(K.add(TODAY, 7)); }
  function tplBlock(t) { var id = t && t.id; if (id && ST.tplEdits && has(ST.tplEdits, id)) return ST.tplEdits[id]; var own = ST.tpls.filter(function (y) { return y.id === id; })[0]; if (own) return own.block; var x = (D.templates || []).filter(function (y) { return 'tpl-' + slug(y.name) === id; })[0]; return x && x.block ? x.block : null; }
  function fromTemplate(t, l, startsOn, onDays, placed, merge) {
    var bk = tplBlock(t), sp = null, st = startsOn || nextMonday();
    if (bk && Array.isArray(bk.weeks)) sp = { weeks: bk.weeks.map(function (w, c) { var wf = weekFromDraft(bk, c); return { days: wf ? wf.days : [], kind: w.kind || null, deload: !!w.deload, label: w.label || null }; }) };
    else { var srcL = t.source ? p0Lifter(t.source) : null; sp = srcL && srcL.program; }
    if (!sp) return null;
    var WDN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }, wds = (onDays || []).map(function (d) { return WDN[String(d).slice(0, 3)]; }).filter(function (x) { return x != null; });
    /* spec C (FP F2.2): each day on the weekday BLOCK.placeDays gave it, by name; without that, the lifter's days in order */
    var byName = {}; (placed || []).forEach(function (d) { if (d && d.name != null && isNum(d.wd)) byName[d.name] = d.wd; });
    var dateFor = function (wi, di, name) { var wd = byName[name] != null ? byName[name] : wds.length ? wds[di] : null; if (wd == null) return null; var base = K.add(st, 7 * wi); return K.add(base, (wd - K.d(base).getDay() + 7) % 7); };
    return { id: 'prog-' + l.id, name: t.name, startsOn: st, meetDate: null, maxes: startMaxes(l), cols: [], weekIdx: -1, fromTemplate: t.id,
      weeks: sp.weeks.slice(0, t.weeks).map(function (w, wi) {
        var o = { n: wi + 1, published: false, days: mergeTplDays(w.days, merge).filter(function (d) { return d.exercises && d.exercises.length; }).map(function (d, di) {
          /* spec C (FP F3.1, ENGINE-GRID's request): every key the template's cell carries reaches the set (a back-off's off: 12,
             until, rir, a range, tempo, pause), so the engine works its load off that week's top set */
          var exs = d.exercises.map(function (e) { return { lift: e.lift, variant: e.variant || (MAIN[e.lift] ? 'Competition' : ''), title: e.title, note: '', sets: e.sets.filter(function (s) { return !s.extra; }).map(function (s) { var x = { w: 0, r: s.r, done: 0 }; SET_KEYS.forEach(function (k) { if (s[k] != null && s[k] !== false && s[k] !== '') x[k] = s[k]; }); return x; }) }; });
          return { name: d.name, date: dateFor(wi, di, d.name), sets: setsIn(exs), done: 0, exercises: exs };
        }) };
        if (w.kind) o.kind = w.kind; if (w.deload) o.deload = true; if (w.label) o.label = w.label;
        return o;
      }) };
  }
  /* spec C (FTC §7.1): a fitted starter (BLOCK.fitStarter's block JSON) as the lifter's program: each week's lines as sets
     with every key their cell carries, each day on the weekday the fit placed it, from the block's start; the week's phase
     (kind), its deload and its name ride along */
  function programFromBlock(j, l, startsOn) {
    if (!j || !Array.isArray(j.weeks) || !Array.isArray(j.rows) || !j.weeks.length) return null;
    var st = isIso(j.start) ? j.start : startsOn || nextMonday(), wd = {}, names = (j.days || []).map(function (d) { return d.name; });
    (j.days || []).forEach(function (d) { if (d && isNum(d.wd)) wd[d.name] = d.wd; });
    var weeks = j.weeks.map(function (w, c) {
      var base = K.add(st, 7 * c), days = [];
      names.forEach(function (name) {
        var exs = [], byEx = {};
        j.rows.forEach(function (r) {
          if (r.day !== name) return; var cell = r.cells && r.cells[w.uid]; if (!cell || !(cell.n >= 1)) return;
          var key = r.ex == null ? r.key : r.ex, e = byEx[key];
          if (!e) { e = byEx[key] = { lift: r.lift || r.cat || null, variant: r.variant || (r.lift && MAIN[r.lift] ? 'Competition' : ''), title: r.title || r.name, note: r.note || cell.note || '', sets: [] }; exs.push(e); }
          for (var i = 0; i < cell.n; i++) { var s = { w: cell.w != null ? cell.w : 0, r: cell.r, done: 0 }; SET_KEYS.forEach(function (k) { if (cell[k] != null && cell[k] !== false && cell[k] !== '') s[k] = cell[k]; }); if (s.pause == null && r.pause) s.pause = r.pause; if (s.tempo == null && r.tempo) s.tempo = r.tempo; e.sets.push(s); }
        });
        if (!exs.length) return;
        days.push({ name: name, date: wd[name] != null ? K.add(base, (wd[name] - K.d(base).getDay() + 7) % 7) : null, sets: setsIn(exs), done: 0, exercises: exs });
      });
      var o = { n: c + 1, published: false, days: days }; if (w.kind) o.kind = w.kind; if (w.deload) o.deload = true; if (w.label) o.label = w.label;
      /* FIX-LOGIC (build C walk 2): the checks the starter settled for its own picks (BLOCK.fitStarter's w.kept), by line */
      if (w.kept && typeof w.kept === 'object') { var kp = []; Object.keys(w.kept).forEach(function (k) { var m = /^(.*)\|([a-z-]+)$/.exec(k), r = m ? j.rows.filter(function (x) { return x.key === m[1]; })[0] : null; if (r && r.cells && r.cells[w.uid]) kp.push({ day: r.day, title: r.title || r.name, line: r.line || 0, kind: m[2] }); }); if (kp.length) o.kept = kp; }
      return o;
    });
    return { id: 'prog-' + l.id, name: j.name || 'First block', startsOn: st, meetDate: null, maxes: startMaxes(l), cols: [], weekIdx: -1, fromStarter: j.starter || null, weeks: weeks };
  }
  /* FIX-LOGIC (final round, Hannah on Foundation): a template started for a lifter does not flag its own lines against her
     intake, as BLOCK.fitStarter's mindIntake does for a starter (Jess). A line of the template that loads a part her intake
     names (Foundation's paused squat and leg press, Hannah's left knee) is kept in each week it is in, so the first send is
     never stopped by "8 checks open" on the block the coach just picked. Only those limit checks (with a Keep it fix): a
     squat-day count, pain, a jump, and any line the coach adds or changes later are checked as before. The list is worked
     out once, when the coach presses Start, and kept in the write (a.kept), so a reload or a page without block.js reads
     the same weeks. Answers [{ name, part }], one per line. */
  function mindTemplate(l, prog, a) {
    var ik = l && l.intake, parts = ik && ik.injuries && ik.injuries.parts;
    if (!Array.isArray(a.kept)) {
      if (!parts || !parts.length || !BLK()) return [];
      memo = {};   /* the program was just set: nothing read before this write may answer for it */
      var eng = null; try { eng = engineOf(l); } catch (e) { eng = null; }
      memo = {};
      var b = eng && eng.b, list = [];
      if (!b) return [];
      b.weeks.forEach(function (w, c) {
        var ck = []; try { ck = b.checks(c); } catch (e) { ck = []; }
        ck.forEach(function (x) {
          if (x.kind !== 'limit' || !x.part || !x.fixes || x.fixes.indexOf('Keep it') < 0) return;
          var row = b.rows[x.r]; if (!row) return;
          list.push({ n: c + 1, day: row.day, title: row.title || row.name, line: row.line || 0, kind: 'limit', name: row.name, part: x.part });
        });
      });
      a.kept = list;   /* kept in the write log (the replay needs no engine) */
    }
    var out = [];
    a.kept.forEach(function (k) {
      var w = k && prog.weeks[k.n - 1]; if (!w) return;
      w.kept = w.kept || []; w.kept.push({ day: k.day, title: k.title, line: k.line || 0, kind: k.kind });
      if (!out.some(function (h) { return h.name === k.name; })) out.push({ name: k.name, part: k.part });
    });
    return out;
  }
  function blankProgram(l, startsOn, onDays) {
    var ds = (l.intake && l.intake.days && l.intake.days.length ? l.intake.days.length : 3), st = startsOn || nextMonday(), days = [], WDN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    for (var i = 0; i < ds; i++) { var wd = onDays && onDays[i] != null ? WDN[String(onDays[i]).slice(0, 3)] : null; days.push({ name: 'Day ' + (i + 1), date: wd == null ? null : K.add(st, (wd - K.d(st).getDay() + 7) % 7), sets: 0, done: 0, exercises: [] }); }
    return { id: 'prog-' + l.id, name: 'New program', startsOn: st, meetDate: null, maxes: startMaxes(l), cols: [], weekIdx: -1, weeks: [{ n: 1, published: false, days: days }] };
  }

  /* ================= teams (round-4 teams.html) ================= */
  function teamOf(id) { if (!isStr(id)) return null; if (D.team && slug(D.team.name) === id) return D.team; return (ST.teamsNew || []).filter(function (t) { return slug(t.name) === id; })[0] || null; }
  /* every team: the data's Meet team, then the ones made here (screens.md §10.4) */
  function allTeams() { return (D.team ? [D.team] : []).concat(ST.teamsNew || []); }
  /* the team's training days as days after its week's first day, read from a founding member's first dated week (the Meet
     team: Squat Day Monday, Bench Day Wednesday, Deadlift Day Friday) */
  function teamDayOffsets(T) {
    var out = {};
    teamOn(T).some(function (l) { return l.program.weeks.some(function (w, wi) { var ds = w.days.filter(function (d) { return d.date && d.exercises && d.exercises.length; }); if (!ds.length) return false; ds.forEach(function (d) { out[d.name] = K.daysTo(day10(d.date)) - K.daysTo(K.add(T.startsOn, wi * 7)); }); return true; }); });
    return out;
  }
  /* a member's own load on a line of the team's week: what their program says (data.js works a percent out from their
     own e1RM), else the percent of their max (or e1RM), else K.load of the e1RM for an RPE line */
  function ownLoad(l, e) {
    var s = (e.sets || [])[0]; if (!s) return null;
    var lift = MAIN[e.lift] ? e.lift : null, x = lift && l.lifts[lift] ? l.lifts[lift].e1 : null, mx = lift && l.program && l.program.maxes && l.program.maxes[lift] ? l.program.maxes[lift] : x;
    if (s.w > 0) return s.w;
    if (s.pct != null && mx) return K.round(mx * s.pct / 100);
    if (s.rpe != null && x) return K.load(x, s.r, s.rpe);
    return null;
  }
  /* the team's week: when it is now (0-based), and whether week n (1-based) is with the members it reaches. ONE rule for
     Teams and Programs: a week up to this one is sent when each member on the team's program has it published; a week
     to come is sent when each has it published at the team's latest revision (T.rev: data.js has the Meet team at rev 4,
     pushed at rev 3, so weeks 3 and 4 hold changes not sent yet), or when it was sent here (teams.sendWeek) */
  function teamNow(T) { return Math.max(0, Math.min(T.weeks.length - 1, Math.floor(-K.daysTo(T.startsOn) / 7))); }
  function teamOn(T) { return T.members.map(function (m) { return K.L(m.id); }).filter(function (l) { return l && l.program && l.program.name === T.program; }); }
  function teamFrom(T, l) { return !l || !l.program || l.program.name !== T.program ? null : isNum(l.program.teamFrom) ? l.program.teamFrom : 1; }
  function teamReach(T, n) { return teamOn(T).filter(function (l) { return teamFrom(T, l) <= n; }); }
  function teamWeekSent(T, n) {
    var wi = n - 1, ls = teamReach(T, n), sent = ST.teamSent[slug(T.name)] || {};
    if (!ls.length) return false;
    var all = ls.every(function (l) { var w = l.program.weeks[wi]; return !!w && w.published !== false; });
    if (wi <= teamNow(T)) return all;
    if (has(sent, n)) return true;
    return all && T.members.every(function (m) { var l = K.L(m.id); return !l || ls.indexOf(l) < 0 || (m.pushedRev || 0) >= (T.rev || 0); });
  }
  /* LOGIC-FIX-2 (Teams' request, screens.md §9: one sent state for a team week): a member's team week that went out
     before the team's latest revision (data.js: rev 4, pushed at rev 3) holds a change to send, on Teams and in Programs
     alike. Answers the words of that change, or null */
  function teamOfLifter(l) { return l && l.program ? allTeams().filter(function (T) { return l.program.name === T.program && T.members.some(function (m) { return m.id === l.id; }); })[0] || null : null; }
  function teamGap(T, l, n) {
    if (!T || !l || !l.program) return null;
    var wi = n - 1, w = l.program.weeks[wi], m = T.members.filter(function (x) { return x.id === l.id; })[0], sent = ST.teamSent[slug(T.name)] || {};
    if (!w || !m || wi <= teamNow(T) || wi <= l.program.weekIdx || has(sent, n) || teamReach(T, n).indexOf(l) < 0) return null;
    if (!(w.sentAt || w.published === true) || (m.pushedRev || 0) >= (T.rev || 0)) return null;
    if (ST.teamHeld[slug(T.name) + ':' + l.id + ':' + n]) return null;
    return T.name + ' week ' + n + ' changed after it went';
  }
  /* a team week's changes to send: the lines changed after it went, and the revision its members do not have yet */
  function teamWeekChanges(T, n) {
    var out = []; teamReach(T, n).forEach(function (l) { var w = l.program.weeks[n - 1]; (w && w.changedSinceSent || []).forEach(function (t) { if (out.indexOf(t) < 0) out.push(t); }); var g = teamGap(T, l, n); if (g && out.indexOf(g) < 0) out.push(g); });
    return out;
  }
  function teamData(T) {
    var id = slug(T.name), weeks = T.weeks.length, nowW = teamNow(T), M = model();
    var members = T.members.map(function (m) { return K.L(m.id); }).filter(Boolean), onProg = teamOn(T);
    var cnt = function (l, wi) { var p = prog(l), w = p && p.weeks[wi]; var s = w ? w.days.filter(function (d) { return d.sets; }) : []; return { done: s.filter(function (d) { return d.sets > 0 && d.done >= d.sets; }).length, of: s.length }; };
    var change = function (l) { return chgOf(l); };   /* LOGIC-FIX-3: the lift cards' rule (liftNow) */
    var total = function (l) { var x = LIFTS.map(function (k) { return l.lifts[k] && l.lifts[k].e1 != null ? l.lifts[k].e1 : null; }); return x.indexOf(null) < 0 ? r1(x[0] + x[1] + x[2]) : null; };
    var lastTop = function (l) { var p = prog(l), best = null; if (p) p.weeks.forEach(function (w) { w.days.forEach(function (d) { if (d.sets > 0 && d.done >= d.sets && d.date && (!best || String(d.date) > String(best.date))) best = d; }); }); var t = best ? topOf(best) : null; return t ? Object.assign(t, { date: day10(best.date), day: best.name }) : null; };
    var asked = function (l) { if (!job(l, 'message')) return null; var m = (l.messages || []).filter(function (x) { return !x.me; }).slice(-1)[0], r = m && /move (\w+) to (\w+)/i.exec(m.body); return r ? { from: upper1(r[1].toLowerCase()), to: upper1(r[2].toLowerCase()), body: m.body, at: m.at } : null; };
    /* a member's status in the team's words, in the tone of the one reason every page shows when it is about the same thing */
    var status = function (l) {
      var p = job(l, 'pain'), a = asked(l), wi = C.get('words-' + l.id), r = M.R[l.id], why = r ? statusOf(r) : null, fr = teamFrom(T, l);
      if (!l.program) return { tone: 't-quiet', text: 'No program yet' };
      if (fr && fr > nowW + 1) { var on = K.add(T.startsOn, (fr - 1) * 7); return { tone: 't-quiet', text: 'Starts week ' + fr + ', ' + K.wd(on).slice(0, 3) + ' ' + K.dm(on) }; }
      if (p) return { tone: 't-pain', text: p.title };
      if (job(l, 'quiet')) return { tone: 't-warn', text: quietWords(l) };
      if (a && !(wi && doneOf(wi.id))) return { tone: 't-msg', text: 'Asked to move ' + a.from };
      if (job(l, 'message') && !a) return { tone: 't-msg', text: 'Wrote you' };
      var c = job(l, 'nocheckin'); if (c) return why && why.type === 'nocheckin' ? { tone: why.t, text: why.w } : { tone: 't-quiet', text: c.title };
      var f = job(l, 'stalling'); if (f) return why && why.type === 'stalling' ? { tone: why.t, text: why.w } : { tone: 't-quiet', text: f.title };
      return null;
    };
    /* members in the Roster's order (lifters.list: triage, then name), so Teams and the Roster read alike */
    var ord = {}; M.rows.slice().sort(function (a, b) { return a.tier - b.tier || a.ord - b.ord || a.name.localeCompare(b.name); }).forEach(function (r, i) { ord[r.id] = i; });
    var byRoster = function (a, b) { return (ord[a] == null ? 1e6 : ord[a]) - (ord[b] == null ? 1e6 : ord[b]); };
    var mem = members.map(function (l) {
      var r = M.R[l.id], fr = teamFrom(T, l), started = fr != null && fr <= nowW + 1;
      var fix = r && r.fix && !r.fix.done ? fixOf(r.fix) : primaryOf(l, r);
      /* LOGIC-FIX-2 (Teams' request, screens.md §4.1): a Keep-an-eye-on member's own open item gives the row its move (Leo's
         "Ask Leo to check in", Dev's "Swap in paused back-offs") */
      if (!fix) { var oi = C.forLifter(l.id).filter(function (it) { return it.ids.length === 1 && !it.routine && it.group !== 'good' && !doneOf(it.id); })[0], oa = oi && mainAct(oi); if (oa) fix = { itemId: oi.id, actId: oa.id, label: oa.label }; }
      /* LOGIC-FIX-4 (walk 2, Teams' Off the plan): what you did about a member today, in the act table's done words, so the
         row carries a tick and the move ("Deadlifts on Saturday, told Kofi") and leaves Off the plan */
      var dIt = C.forLifter(l.id).filter(function (it) { return it.ids.length === 1 && !it.routine && it.group !== 'good' && doneOf(it.id) && doneOf(it.id).act !== 'program'; }).sort(function (a, b) { return String(doneOf(b.id).at || '').localeCompare(String(doneOf(a.id).at || '')); })[0];
      var dDone = dIt ? { itemId: dIt.id, actId: doneOf(dIt.id).act, label: doneLabel(dIt, doneOf(dIt.id)), at: doneOf(dIt.id).at || null } : null;
      return { done: dDone, handled: !!dDone && !fix, id: l.id, name: l.name, first: l.first, ini: l.ini, hue: l.hue, week: started ? cnt(l, nowW) : null, from: fr, top: lastTop(l), total: total(l), totalShown: r ? r.totShown : null, change: change(l), status: status(l), reason: r ? reasonOut(statusOf(r)) : null,
        item: fix ? { itemId: fix.itemId, actId: fix.actId, label: fix.label } : null,
        weeks: T.weeks.map(function (w, wi) { if (fr == null || fr > wi + 1) return { n: w.n, done: 0, of: 0, missed: 0 }; var p = prog(l), wk = p && p.weeks[wi], ds = wk ? wk.days.filter(function (d) { return d.sets; }) : [], dn = ds.filter(function (d) { return d.done >= d.sets; }).length; return { n: w.n, done: dn, of: ds.length, missed: wi < nowW || (p && wi < p.weekIdx) ? ds.length - dn : ds.filter(function (d) { return d.date && day10(d.date) < TODAY && !(d.done > 0); }).length }; }) };
    });
    mem.sort(function (a, b) { return byRoster(a.id, b.id); });
    mem.forEach(function (m) { var l = K.L(m.id), mT = T.members.filter(function (x) { return x.id === m.id; })[0] || {}; m.weeks.forEach(function (w, wi) { var c = teamCell(T, l, wi, m.from, nowW); Object.keys(c).forEach(function (k) { w[k] = c[k]; }); }); var rs = ST.teamRestart[id + ':' + m.id]; m.offset = rs ? rs.from - rs.at : 0; if (mT.joins && !l.program) { m.joins = mT.joins; m.status = { tone: 't-quiet', text: 'Starts week 1, ' + K.wd3(mT.joins) + ' ' + K.dm(mT.joins) }; } });
    var s = { done: 0, of: 0, lastDone: 0, lastOf: 0 }; onProg.forEach(function (l) { if (teamFrom(T, l) > nowW + 1) return; var c = cnt(l, nowW); s.done += c.done; s.of += c.of; if (nowW > 0 && teamFrom(T, l) <= nowW) { var q = cnt(l, nowW - 1); s.lastDone += q.done; s.lastOf += q.of; } });
    var on = onProg.filter(function (l) { return change(l) != null; }), pts = [];
    for (var i = 7; i <= 11; i++) { var sum = 0; on.forEach(function (l) { LIFTS.forEach(function (k) { sum += liftNow(l, k).series[i] || 0; }); }); pts.push(r1(sum / Math.max(1, on.length))); }
    /* effort: every rated set, and the top sets (each exercise's first line) felt against written, by lifter too, over the
       same period (the block so far) */
    var e = { sets: 0, diff: 0, f: 0, w: 0, top: 0 }, per = {};
    onProg.forEach(function (l) { var pl = per[l.id] = { id: l.id, felt: 0, written: 0, n: 0 }; l.program.weeks.forEach(function (w) { w.days.forEach(function (d) { (d.exercises || []).forEach(function (x, xi) { x.sets.forEach(function (q) { if (!q.done || q.felt == null || q.rpe == null) return; e.sets++; e.diff += q.felt - q.rpe; if (xi === 0 && K.LIFT[x.lift]) { e.top++; e.f += q.felt; e.w += q.rpe; pl.n++; pl.felt += q.felt; pl.written += q.rpe; } }); }); }); }); });
    var perLifter = onProg.map(function (l) { var x = per[l.id]; return { id: l.id, felt: x.n ? r1(x.felt / x.n) : null, written: x.n ? r1(x.written / x.n) : null, n: x.n }; }).sort(function (a, b) { return byRoster(a.id, b.id); });
    var meetL = onProg.filter(function (l) { return l.meet && l.meet.days > 0; }).sort(function (a, b) { return a.meet.days - b.meet.days; }), mm = meetL[0];
    var facts = {
      sessions: s,
      strength: { avg: on.length ? Math.round(on.reduce(function (q, l) { return q + change(l); }, 0) / on.length) : null, flat: onProg.filter(function (l) { var r = M.R[l.id]; return r ? r.stalled : change(l) === 0 || job(l, 'stalling'); }).map(function (l) { return l.id; }), pts: pts },
      effort: { topFelt: e.top ? r1(e.f / e.top) : null, topWritten: e.top ? r1(e.w / e.top) : null, avg: e.sets ? r1(e.diff / e.sets) : 0, sets: e.sets, perLifter: perLifter, since: T.startsOn },
      meet: mm ? { id: meetId(mm.meet), name: mm.meet.name, days: mm.meet.days, ids: meetL.filter(function (l) { return l.meet.name === mm.meet.name; }).map(function (l) { return l.id; }) } : null
    };
    var lineOf = function (ex) { var q = ex.sets[0] || {}; return { n: ex.sets.length, r: q.r, rpe: q.rpe == null ? null : q.rpe, pct: q.pct == null ? null : q.pct, w: q.w || 0 }; };
    var sameL = function (a, b) { return a.n === b.n && a.r === b.r && a.rpe === b.rpe && a.pct === b.pct; };
    var rx = function (x) { return x.n + ' × ' + x.r + (x.rpe != null ? ' @' + n(x.rpe) : '') + (x.pct != null ? ' ' + n(x.pct) + '%' : x.w ? ' ' + n(x.w) + ' kg' : ''); };
    var sent = ST.teamSent[id] || {};
    var wk = T.weeks.map(function (w, wi) {
      var reach = teamReach(T, w.n);
      var wch = wi > nowW ? teamWeekChanges(T, w.n) : [];
      return { n: w.n, from: K.add(T.startsOn, wi * 7), now: wi === nowW, sent: teamWeekSent(T, w.n), sentAt: has(sent, w.n) ? sent[w.n] : null, changes: wch, toSend: wch.length, ids: reach.map(function (l) { return l.id; }).sort(byRoster), days: w.days.filter(function (d) { return d.exercises && d.exercises.length; }).map(function (d) {
        var di = w.days.indexOf(d);
        return { name: d.name, lines: d.exercises.map(function (ex, ei) {
          var t = lineOf(ex), own = [];
          if (ei === 0) reach.forEach(function (l) { var lw = l.program.weeks[wi], ld = lw && lw.days[di], le = ld && ld.exercises[0]; if (!le) return; var ll = lineOf(le); if (!sameL(ll, t)) own.push({ id: l.id, text: rx(ll) }); });
          /* LOGIC-FIX-2 (Teams' request, screens.md §10.4: one source): each member's load reads what members[k].weeks[n].top
             reads, the engine's cell for that line (Kofi week 3 squat 185), else what the program says */
          var loads = []; if (MAIN[ex.lift]) reach.forEach(function (l) { var lw = l.program.weeks[wi], ld = lw && lw.days[di], le = ld && ld.exercises[ei]; if (!le || le.title !== ex.title) return; var kg = memberLoad(l, wi, ld, ei); if (kg != null) loads.push({ id: l.id, kg: kg }); });
          return { title: ex.title, lift: MAIN[ex.lift] ? ex.lift : null, text: rx(t), cell: { n: t.n, r: t.r, rpe: t.rpe, pct: t.pct, w: t.w || null }, own: own, loads: loads };
        }) };
      }) };
    });
    /* off the plan, in the Roster's order: missed sessions and asked-for moves, one fix each; a move's day in the calendar
       words every reason uses ("2 days ago"); done says what the move that ran did */
    var off = [];
    onProg.slice().sort(function (a, b) { return byRoster(a.id, b.id); }).forEach(function (l) {
      var q = C.get('quiet-' + l.id);
      if (job(l, 'quiet') && q) { var w1 = cnt(l, 0), qd = doneOf(q.id); off.push({ id: q.id, lifterId: l.id, kind: 'quiet', tone: 't-warn', what: quietWords(l), context: w1.done ? '' : 'missed all ' + w1.of + ' of week 1', fix: { itemId: q.id, actId: q.acts[0].id, label: q.acts[0].label }, done: qd ? { label: doneLabel(q, qd), at: qd.at, act: qd.act } : null }); }
      var a = asked(l), wi = C.get('words-' + l.id);
      if (a && wi) { var mvAct = actOf(wi, 'move') || wi.acts[0], wd = doneOf(wi.id); off.push({ id: wi.id, lifterId: l.id, kind: 'move', tone: 't-msg', what: '“' + a.body + '”', context: upper1(agoWords(a.at)), fix: { itemId: wi.id, actId: mvAct.id, label: mvAct.label, short: mvAct.short || mvAct.label }, done: wd ? { label: doneLabel(wi, wd), at: wd.at, act: wd.act } : null }); }
    });
    var unsent = wk.filter(function (w, i) { return i > nowW && !w.sent; })[0];
    return { id: id, name: T.name, program: T.program, startsOn: T.startsOn, week: { now: nowW + 1, of: weeks, next: unsent ? unsent.n : null, weeks: wk }, facts: facts, members: mem, offPlan: off, rev: T.rev, offPlanOpen: off.filter(function (o) { return !o.done; }).length };
  }

  /* ================= programs list (round-4 programs.html) ================= */
  var PSTATE_RANK = { 'to-write': 0, 'to-send': 1, 'not-started': 2, 'up-to-date': 3 };
  /* the context beside a lifter's reason: the meet they lift at today when the reason is something else */
  /* the context beside a lifter's reason, the one figure that goes with it, in the coach's words (one place, so every page
     shows the same): a meet today when the reason is something else ("Autumn Open today"); else by the reason's kind:
     meet day "0.3 kg over" or "On weight", pain "Twice in 7 days", weight "12 days out", harder than written "Resting heart
     rate up 11" while recovery is low, a busy week what they said ("Double shifts at work"), a message what they said beside
     their question ("Work trip") */
  function sentencesOf(t) { return String(t || '').trim().split(/(?<=[.?!])\s+/).filter(Boolean); }
  function quoteIn(it) { return it ? (it.ev || []).filter(function (e) { return e.t === 'quote' && e.text; })[0] || null : null; }
  function ownOpen(l, group) { return C.forLifter(l.id).filter(function (it) { return it.ids.length === 1 && it.group === group && !doneOf(it.id); })[0] || null; }
  function ctxOf(r, why) {
    var l = r.l, x; why = why === undefined ? statusOf(r) : why;
    if (!why) return '';
    if (why.itemId && why.ctx != null) return why.ctx;
    if (l.meet && l.meet.days === 0 && why.type !== 'meetday') return l.meet.name + ' today';
    switch (why.type) {
      case 'meetday': x = l.bw && l.bw.over != null ? l.bw.over : null; return x == null ? '' : x > 0 ? n(x) + ' kg over' : 'On weight';
      case 'pain': return painWhen(l);
      case 'weight': return l.meet ? upper1(outShort(l.meet.days)) : '';
      case 'overshoot': case 'drift': return r.h.kind === 'low' && /^Resting heart rate/.test(r.h.text) ? r.h.text : '';
      case 'busy': x = quoteIn(ownOpen(l, 'approve')); return x ? String(x.text).replace(/\s+this week\.?$|\.$/i, '') : '';
      case 'message': x = quoteIn(ownOpen(l, 'words')); return x ? sentencesOf(x.text).filter(function (t) { return !/\?$/.test(t); }).join(' ').replace(/\.$/, '') : '';
    }
    return '';
  }
  /* a written week that must change before the lifter's next session: pain on a lift, or a days change, still open */
  function changeOf(l) {
    var pi = C.get('pain-' + l.id), bi = C.get('busy-' + l.id), p = painOpen(l)[0];
    if (pi && !doneOf(pi.id) && p && p.lift) return { what: String(p.lift).toLowerCase(), words: lower1(p.part) + ' ' + n(p.sev) + '/10', itemId: pi.id };
    if (bi && !doneOf(bi.id) && l.request && l.request.days && l.request.days.length) return { what: 'days', words: K.list(l.request.days, 3) + ' only', itemId: bi.id };
    return null;
  }
  function programRows() {
    return cached('programs', function () {
      var out = [], M = model(), T = D.team;
      D.lifters.forEach(function (l) {
        var p = l.program; if (!p) return;
        var dr = drafts[l.id], wk = p.weekIdx + 1, len = p.weeks.length, runway = len - wk, state, nextW;
        /* to send: next week (or this week, changed after its send) is not with the lifter; the draft's week when there is one,
           else the program's. A week two or more out never makes a program due this Sunday */
        var dweeks = dr && Array.isArray(dr.weeks) ? dr.weeks.length : 0, held = !!ST.held[l.id + ':' + (p.weekIdx + 2)];
        var dw = function (i) { return dr && Array.isArray(dr.weeks) ? dr.weeks[i] : null; }, unsentAt = function (i) { var w = dw(i); return !!(w && w.sent === false && w.state !== 'lifted'); };
        var nw = p.weeks[p.weekIdx + 1], unsent = dr ? ((unsentAt(p.weekIdx + 1) && !held) || (p.weekIdx >= 0 && unsentAt(p.weekIdx))) : !!(nw && nw.published === false && !held);
        if (p.weekIdx < 0) state = 'not-started';
        else if (runway <= 0 && dweeks <= len) state = 'to-write';
        else if (unsent) state = 'to-send';
        else state = 'up-to-date';
        nextW = state === 'to-write' ? { n: len + 1, text: 'Week ' + (len + 1) + ', due Sunday' } : state === 'not-started' ? { n: 1, text: 'Starts ' + K.dm(p.startsOn) } : { n: Math.max(len, dweeks), text: 'Written to week ' + Math.max(len, dweeks) };
        var r = M.R[l.id], why = r ? reasonOut(statusOf(r)) : null, ch = state === 'up-to-date' ? changeOf(l) : null;
        /* on the team's program: the team's week after this one, and whether it is with them (Teams reads the same rule) */
        var tn = p.weekIdx >= 0 ? p.weekIdx + 2 : isNum(p.teamFrom) ? p.teamFrom : 1, tm = T && p.name === T.program && T.members.some(function (m) { return m.id === l.id; }) ? { id: slug(T.name), name: T.name, n: tn, sent: tn <= T.weeks.length ? teamWeekSent(T, tn) && !ST.teamHeld[slug(T.name) + ':' + l.id + ':' + tn] : null, held: Object.keys(ST.teamHeld).some(function (k) { return k.indexOf(slug(T.name) + ':' + l.id + ':') === 0 && +k.split(':')[2] >= tn; }) } : null;
        out.push({ id: p.id || 'prog-' + l.id, lifterId: l.id, lifter: l.name, first: l.first, ini: l.ini, hue: l.hue, name: dr && dr.name ? dr.name : p.name, week: { n: Math.max(0, wk), of: len }, runway: runway, state: state, next: nextW, draft: !!dr, sentAt: (nw || {}).sentAt || null,
          held: heldOf(l.id), why: why, context: r ? ctxOf(r) : '', change: ch ? { what: ch.what, words: ch.words, itemId: ch.itemId } : null, team: tm });
      });
      return out;
    });
  }
  /* the programs' own order: what is due first (to write, to send, not started, up to date); inside each, the Roster's
     Needs you order (pain, then a meet today, then the rest of the triage, brief §5); then the weeks still written ahead */
  function progOrder() {
    var tri = {}; model().needList.forEach(function (r, i) { tri[r.id] = i; });
    return function (a, b) { var x = tri[a.lifterId] == null ? 1e6 : tri[a.lifterId], y = tri[b.lifterId] == null ? 1e6 : tri[b.lifterId]; return PSTATE_RANK[a.state] - PSTATE_RANK[b.state] || x - y || a.runway - b.runway || a.name.localeCompare(b.name) || a.lifter.localeCompare(b.lifter); };
  }
  /* the Sunday each program next needs the coach: this Sunday (to write or to send), else by the weeks written ahead */
  function dueOf(rows) {
    var due = { thisSunday: [], nextSunday: [], inTwoWeeks: [], later: [] };
    rows.forEach(function (r) { var k = r.state === 'to-write' || r.state === 'to-send' ? 'thisSunday' : r.runway <= 1 ? 'nextSunday' : r.runway === 2 ? 'inTwoWeeks' : 'later'; due[k].push(r.lifterId); });
    return due;
  }
  /* what PL.programs.get answers: the shared draft (its maxes win; the program's fill a gap), else the program as the reads
     see it (done items included); meta says which, what is held behind a toast, and the block's history */
  function programAnswer(l) {
    return cached('pans:' + l.id, function () {
      var dr = drafts[l.id], meta = { draft: !!dr, held: heldOf(l.id), history: histInfo(l.id) };
      /* a max the coach typed wins (the draft's, else the program's); a max the block worked out from the lifting stays the
         draft's until one is typed (maxFrom says which: 'typed' | 'lifting') */
      if (dr) {
        var out = openerFollow(l, clone(dr)), pm = l.program && l.program.maxes; out.maxes = out.maxes || {}; out.maxFrom = {};
        LIFTS.forEach(function (k) {
          var dt = draftTyped(l.id, k);
          if (!dt && pm && pm[k] != null) out.maxes[k] = pm[k];
          out.maxFrom[k] = dt || (pm && pm[k] != null) ? 'typed' : out.maxes[k] != null ? 'lifting' : null;
        });
        out.lifterId = l.id; meta.which = 'current'; meta.lastNormalWeek = lastNormalOf(l); return { data: out, meta: meta };
      }
      var p = prog(l); if (!p) { meta.none = true; return { data: null, meta: meta }; }
      var cp = clone(p); cp.lifterId = l.id; cp.maxes = cp.maxes ? clone(cp.maxes) : { squat: null, bench: null, deadlift: null };
      LIFTS.forEach(function (k) { if (cp.maxes[k] === undefined) cp.maxes[k] = null; });
      cp.maxFrom = {}; LIFTS.forEach(function (k) { cp.maxFrom[k] = cp.maxes[k] != null ? (p.maxFrom && p.maxFrom[k]) || 'typed' : null; });
      /* programs.md §11.4: every week's days dated by the one rule; which block; what comes after */
      cp.weeks.forEach(function (w, i) { var o = {}; trainDays(w).forEach(function (d) { o[d.name] = d.date ? day10(d.date) : dayDateOf(l, i, d.name); }); w.dates = o; });
      var nb = ST.nextBlocks[l.id]; meta.which = 'current'; meta.next = nb ? { name: nb.name, startsOn: nb.startsOn, weeks: nb.weeks.length } : restNext(l);   /* a saved recovery week alone: what follows starts the Monday after it (rest: true, from: its own first day) */
      meta.lastNormalWeek = lastNormalOf(l);
      meta.endsAtMeet = l.meet && p.weekIdx >= p.weeks.length - 2 ? { meetId: meetId(l.meet), name: l.meet.name, date: day10(l.meet.date) || K.add(TODAY, l.meet.days) } : null;
      return { data: cp, meta: meta };
    });
  }
  /* a draft's max the coach typed (block.js keeps maxFrom; a draft saved before it: typed when the program has one, or when
     it is not the e1RM the block worked out, its today) */
  function draftTyped(id, lift) {
    var dr = drafts[id]; if (!dr || !dr.maxes || dr.maxes[lift] == null) return false;
    if (dr.maxFrom && dr.maxFrom[lift]) return dr.maxFrom[lift] === 'typed';
    var l = K.L(id), pm = l && l.program && l.program.maxes; if (pm && pm[lift] != null) return true;
    var t = dr.today && dr.today[lift]; return !(t && t.kg === dr.maxes[lift]);
  }

  /* ================= STORE-2 (spec B, 13 Nov 2026): Teams, Meets, Messages, Clients and Settings =================
     screens.md §10.4 (teams), §10.5 (meets), §10.6 (messages), §10.8 (clients and settings); shared.md §6.5 to §6.16.
     Contract v1 shapes, additive: every call that existed keeps its arguments and its answer; new arguments are optional
     and a second form of a call is told apart by its arguments (meets.results(id) reads, meets.results(id, { ... })
     writes; meets.note(id, text) and meets.note(id, meetId, text); billing.remind(id, 'now') and billing.remind(id,
     { text, when }); billing.accept(appId) and billing.accept(appId, { pkg, amount, startsOn })). Every write goes
     through commit(), so it is persisted, replayed, stamped on the demo clock and undone with one token. */

  /* ---------------- settings (shared.md §6.13, screens.md §8) ---------------- */
  var PLANS = [{ id: 'free', name: 'Free', max: 3, price: 0 }, { id: 'basic', name: 'Basic', max: 10, price: 24.99 }, { id: 'pro', name: 'Pro', max: 25, price: 49.99 }, { id: 'premium', name: 'Premium', max: null, price: 99.99 }];
  var DELOAD_KINDS = ['half-easier', 'half', 'easier'], WORD_KINDS = ['move', 'swap', 'cap', 'light', 'checkin', 'attempts', 'reminder'], THEMES = ['dark', 'light', 'auto'], CURRENCIES = ['USD', 'GBP', 'EUR', 'CAD', 'AUD'];
  var REMIND_TPL = 'Hi {first}, your {amount} due {due} is still open. {link} Thanks, ' + String((D.coach && D.coach.name) || 'Sam').split(' ')[0];
  function planNow() { var nm = String((D.coach && D.coach.plan) || 'Pro').toLowerCase(); return PLANS.filter(function (p) { return p.id === nm; })[0] || PLANS[2]; }
  function settingsBase() {
    return { plan: planNow().id, plateStep: 2.5, rules: [{ when: 'under', by: 0.5, add: { squat: 2.5, bench: 2.5, deadlift: 5 } }, { when: 'over', by: 1, cut: 5 }], deload: 'half-easier',
      words: { move: '', swap: '', cap: '', light: '', checkin: '', attempts: '', reminder: '' }, saved: [], notifications: { pushes: { words: true, pain: true, sessions: false }, digest: '07:00' },
      reminders: { template: REMIND_TPL, auto: { on: false, days: 3, skipMeetDay: true, at: '08:00' } }, theme: 'dark', keys: { tabPerWeek: false }, currency: 'USD' };
  }
  function settingsOf() { var s = settingsBase(), o = ST.settings; if (o) Object.keys(o).forEach(function (k) { s[k] = clone(o[k]); }); s.plan = planNow().id; return s; }
  /* the coach's rules in block.js's shape ({ under, over, add, off }); null while Settings holds none (the data's stand) */
  function relRules() {
    if (!ST.settings || !ST.settings.rules) return null;
    var o = { under: 0.5, over: 1, add: { squat: 2.5, bench: 2.5, deadlift: 5, other: 2.5 }, off: 5 };
    ST.settings.rules.forEach(function (r) { if (r.when === 'under') { if (isNum(r.by)) o.under = r.by; if (r.add) LIFTS.forEach(function (k) { if (isNum(r.add[k])) o.add[k] = r.add[k]; }); } if (r.when === 'over') { if (isNum(r.by)) o.over = r.by; if (isNum(r.cut)) o.off = r.cut; } });
    return o;
  }
  function rulesCtx() { return relRules() || undefined; }
  /* a suggestion the app's review drafted, at the coach's rules once Settings holds them (Marcus 152.5 felt 9.5: 5% off is
     145, 7.5% off is 140) */
  function ruleKg(rv, lift) {
    var R = relRules(), lw = rv.logged && rv.logged.w; if (!R || !lw) return rv.suggest.kg;
    if (rv.suggest.dir === 'down') return K.round(lw * (1 - R.off / 100));
    if (rv.suggest.dir === 'up') return lw + (isNum(R.add[lift]) ? R.add[lift] : R.add.other);
    return rv.suggest.kg;
  }
  /* the words the data's engine reads (D.rules strings) and the shape block.js's rulesFor reads (D.rulesBy) */
  function rulesToData(R) {
    if (!R) { var P0 = p0(); D.rules = clone(P0.rules); delete D.rulesBy; return; }
    D.rules = ['When the top set feels RPE ' + n(8 - R.under) + ' or easier, add ' + n(R.add.bench) + ' kg', 'When the top set feels RPE ' + n(8.5 + R.over) + ' or harder, take ' + n(R.off) + '% off'];
    D.rulesBy = clone(R);
  }

  /* ---------------- teams (screens.md §10.4) ---------------- */
  function teamWeekIdxOf(T, iso) { return Math.floor((K.daysTo(iso) - K.daysTo(T.startsOn)) / 7); }
  function lineOfEx(ex) { var q = (ex && ex.sets && ex.sets[0]) || {}; return { n: ex ? ex.sets.length : 0, r: q.r, rpe: q.rpe == null ? null : q.rpe, pct: q.pct == null ? null : q.pct, w: q.w || 0 }; }
  function sameLine(a, b) { return a.n === b.n && a.r === b.r && a.rpe === b.rpe && a.pct === b.pct && (a.pct != null || a.rpe != null || a.w === b.w); }
  function lineText(x) { return x.n + ' × ' + x.r + (x.rpe != null ? ' @' + n(x.rpe) : '') + (x.pct != null ? ' ' + n(x.pct) + '%' : x.w ? ' ' + n(x.w) + ' kg' : ''); }
  /* a lifter's top set of each main lift in one week of their own program: the engine's cell when block.js is on the page
     (Kofi's week 3 squat 185), else the program's line at their own max */
  function topsOf(l, wi) {
    var p = l && l.program, w = p && p.weeks[wi], out = { squat: null, bench: null, deadlift: null }; if (!w) return out;
    var eng = engineOf(l);
    w.days.forEach(function (d) {
      (d.exercises || []).forEach(function (e, ei) {
        if (!MAIN[e.lift] || out[e.lift] || (e.variant && e.variant !== 'Competition')) return;
        var s0 = e.sets.filter(function (s) { return !s.extra; })[0]; if (!s0) return;
        var kg = s0.done && s0.w > 0 ? s0.w : null;
        if (kg == null && eng) { var key = d.name + '|' + e.title + '|' + occOf(d, ei) + '|0', r = eng.idx[key]; if (r != null) { try { var ld = eng.b.load(r, wi); if (ld && isNum(ld.kg)) kg = ld.kg; } catch (x) { kg = null; } } }
        if (kg == null) kg = ownLoad(l, e);
        out[e.lift] = { w: kg, r: s0.r, rpe: s0.rpe == null ? null : s0.rpe, felt: s0.felt == null ? null : s0.felt, done: !!s0.done };
      });
    });
    return out;
  }
  /* one cell of the Teams grid: the member's week n in one state word (screens.md §10.4) and its top sets */
  function teamCell(T, l, wi, fr, nowW) {
    var tid = slug(T.name), n1 = wi + 1, p = l && l.program, rs = l ? ST.teamRestart[tid + ':' + l.id] : null;
    var out = { state: 'none', top: { squat: null, bench: null, deadlift: null }, his: rs && n1 >= rs.from ? rs.at + (n1 - rs.from) : null, own: false };
    if (!p || fr == null || fr > n1) return out;
    if (fr === n1 && fr > nowW + 1) out.state = 'starts';
    var w = p.weeks[wi]; out.top = topsOf(l, wi);
    var tw = T.weeks[wi]; if (tw && w) tw.days.forEach(function (td) { var md = w.days.filter(function (x) { return x.name === td.name; })[0]; (td.exercises || []).forEach(function (te, ei) { var me = md && md.exercises && md.exercises[ei]; if (me && me.title === te.title && !sameLine(lineOfEx(me), lineOfEx(te))) out.own = true; }); });
    if (out.state === 'starts') return out;
    var ds = w ? w.days.filter(function (d) { return d.sets; }) : [], dn = ds.filter(function (d) { return d.done >= d.sets; }).length;
    if (ST.teamHeld[tid + ':' + l.id + ':' + n1]) out.state = 'held';
    else if (wi < nowW || wi < p.weekIdx) out.state = ds.length - dn > 0 ? 'missed' : 'lifted';
    else if (wi === nowW || wi === p.weekIdx) out.state = 'now';
    else if (teamWeekSent(T, n1) && teamReach(T, n1).indexOf(l) >= 0) out.state = 'sent';
    else out.state = out.own ? 'own' : 'written';
    return out;
  }
  /* a member's load on one line of a week, the way topsOf reads a top set: what they lifted, else the engine's cell (the
     block's own rules and maxes), else what the program says */
  function memberLoad(l, wi, d, ei) {
    var e = d && d.exercises && d.exercises[ei]; if (!e) return null;
    var s0 = e.sets.filter(function (s) { return !s.extra; })[0]; if (!s0) return null;
    if (s0.done && s0.w > 0) return s0.w;
    var eng = engineOf(l), kg = null;
    if (eng) { var r = eng.idx[d.name + '|' + e.title + '|' + occOf(d, ei) + '|0']; if (r != null) { try { var ld = eng.b.load(r, wi); if (ld && isNum(ld.kg)) kg = ld.kg; } catch (x) { kg = null; } } }
    return kg != null ? kg : ownLoad(l, e);
  }
  /* a line typed in the team's grid: block.js's grammar when the page has it ("3x3 @8 82.5%"), else the same short forms */
  function parseLine(text) {
    var Bk = BLK(), t = words0(text);
    if (!t) return { ok: false, why: 'Type the line, like 3x5 @7 or 3x3 85%.' };
    if (Bk && typeof Bk.parse === 'function') { var r = null; try { r = Bk.parse(t); } catch (e) { r = null; } if (r && r.ok && r.cell && r.cell.n >= 1 && r.cell.r >= 1) return { ok: true, cell: r.cell }; if (r && !r.ok) return { ok: false, why: r.why }; }
    var m = /^(\d+)\s*[x×]\s*(\d+)(?:\s*@\s*(\d+(?:\.5)?))?(?:\s+(\d+(?:\.\d+)?)\s*%)?(?:\s+(\d+(?:\.\d+)?)\s*(?:kg)?)?$/i.exec(t);
    if (!m) return { ok: false, why: 'Did not understand “' + t + '”. Try 3x5 @7, 3x4 70%, 3x5 100.' };
    var c = { n: +m[1], r: +m[2] }; if (m[3]) c.rpe = +m[3]; if (m[4]) c.pct = +m[4]; if (m[5]) c.w = +m[5];
    return { ok: true, cell: c };
  }
  function setsOfCell(c) { var out = []; for (var i = 0; i < c.n; i++) { var s = { w: c.w || 0, r: c.r, done: 0 }; if (c.rpe != null) s.rpe = c.rpe; if (c.rpeHi != null) s.rpeHi = c.rpeHi; if (c.pct != null) s.pct = c.pct; if (c.rHi != null) s.rHi = c.rHi; out.push(s); } return out; }
  /* the team's days, as data-line's <day> counts them (days with lines only) */
  function teamDay(T, wi, di) { var w = T.weeks[wi]; if (!w) return null; var ds = w.days.filter(function (d) { return d.exercises && d.exercises.length; }); return ds[di] || null; }
  function snapWeek(l, wi) { var w = l.program.weeks[wi]; return { l: l, wi: wi, w: clone(w) }; }
  function putWeek(x) { x.l.program.weeks[x.wi] = x.w; }
  function weekFromTemplate(t, c) { var tb = tplBlock(t); if (!tb) return null; var wf = weekFromDraft(tb, c); return wf ? { n: c + 1, days: wf.days.filter(function (d) { return d.exercises && d.exercises.length; }).map(function (d) { return { name: d.name, exercises: d.exercises.map(function (e) { return { lift: e.lift, variant: e.variant || '', title: e.title, note: e.note || '', sets: e.sets.map(function (s) { var o = { w: s.w || 0, r: s.r }; if (s.rpe != null) o.rpe = s.rpe; if (s.pct != null) o.pct = s.pct; return o; }) }; }) }; }) } : null; }
  function lastDayOf(l) { var last = null; if (!l.program) return null; l.program.weeks.forEach(function (w, wi) { trainDays(w).forEach(function (d) { var x = dayDateOf(l, wi, d.name); if (x && (!last || x > last)) last = x; }); }); return last; }

  OPS.teamHold = function (a) {
    var T = teamOf(a.id), l = L(a.lifterId); if (!T || !l) return fail('not_found', 'There is no such team or lifter.');
    var key = a.id + ':' + l.id + ':' + a.n, had = has(ST.teamHeld, key), prev = ST.teamHeld[key];
    if (a.on === had) return { changed: false, data: { id: a.id, lifterId: l.id, n: a.n, held: had } };
    if (a.on) ST.teamHeld[key] = { at: a.at, by: 'hold' }; else delete ST.teamHeld[key];
    return { changed: true, kind: 'team', persist: true, data: { id: a.id, lifterId: l.id, n: a.n, held: !!a.on }, keys: ['teamhold:' + key], ids: [a.id, l.id], events: [['program:saved', { id: l.id, team: a.id }]],
      undo: function () { if (had) ST.teamHeld[key] = prev; else delete ST.teamHeld[key]; },
      label: a.on ? l.first + '’s week ' + a.n + ' is held. The team’s send skips it.' : l.first + '’s week ' + a.n + ' goes with the team again.', undoLabel: a.on ? l.first + '’s week ' + a.n + ' goes with the team again.' : l.first + '’s week ' + a.n + ' is held again.' };
  };
  OPS.teamRestart = function (a) {
    var T = teamOf(a.id), l = L(a.lifterId); if (!T || !l || !l.program) return fail('not_found', 'There is no such team or lifter.');
    var from = teamWeekIdxOf(T, a.on), off = teamDayOffsets(T), snaps = [], key = a.id + ':' + l.id, had = has(ST.teamRestart, key), prev = ST.teamRestart[key];
    if (from < 0) return fail('invalid', 'That Monday is before the team’s block.');
    for (var wi = from; wi < Math.max(T.weeks.length, l.program.weeks.length); wi++) {
      var src = T.weeks[a.at - 1 + (wi - from)]; if (!src || !l.program.weeks[wi]) continue;
      snaps.push(snapWeek(l, wi));
      l.program.weeks[wi] = { n: wi + 1, published: false, restarted: a.at + (wi - from), days: src.days.map(function (d) {
        var exs = (d.exercises || []).map(function (e) { return { lift: e.lift, variant: e.variant || (MAIN[e.lift] ? 'Competition' : ''), title: e.title, note: '', sets: e.sets.filter(function (s0) { return !s0.extra; }).map(function (s0) { var o = { w: s0.pct != null || MAIN[e.lift] ? 0 : s0.w || 0, r: s0.r, done: 0 }; if (s0.rpe != null) o.rpe = s0.rpe; if (s0.pct != null) o.pct = s0.pct; return o; }) }; });
        return { name: d.name, date: exs.length && off[d.name] != null ? K.add(T.startsOn, wi * 7 + off[d.name]) : null, sets: setsIn(exs), done: 0, exercises: exs };
      }) };
    }
    if (!snaps.length) return fail('invalid', 'There is no week to restart from.');
    ST.teamRestart[key] = { at: a.at, on: a.on, from: from + 1 };
    return { changed: true, kind: 'team', persist: true, data: { id: a.id, lifterId: l.id, at: a.at, on: a.on, from: from + 1 }, keys: ['teamrestart:' + key, 'program:' + l.id], ids: [a.id, l.id], events: [['program:saved', { id: l.id, team: a.id }]],
      undo: function () { snaps.forEach(putWeek); if (had) ST.teamRestart[key] = prev; else delete ST.teamRestart[key]; },
      label: l.first + ' starts again at week ' + a.at + ' on ' + dmyOf(a.on) + ', at his own maxes.'.replace(' his ', l.sex === 'F' ? ' her ' : ' his '), undoLabel: l.first + '’s weeks are back as they were.' };
  };
  OPS.teamCreate = function (a) {
    if (teamOf(slug(a.name))) return fail('conflict', 'There is a team called ' + a.name + ' already.');
    var weeks = [], prog0 = a.name;
    if (a.from && a.from.template) { var t = templates().filter(function (x) { return x.id === a.from.template || x.name === a.from.template || slug(x.name) === a.from.template; })[0]; if (!t) return fail('not_found', 'There is no template ' + a.from.template + '.'); prog0 = t.name; for (var c = 0; c < t.weeks; c++) { var w = weekFromTemplate(t, c); if (w) weeks.push(w); } }
    else if (a.from && a.from.team) { var src = teamOf(a.from.team); if (!src) return fail('not_found', 'There is no team ' + a.from.team + '.'); prog0 = src.program; weeks = clone(src.weeks); }
    var T = { name: a.name, program: prog0, startsOn: a.startsOn, rev: 0, created: a.at, members: a.ids.map(function (id) { var l = K.L(id), end = l ? lastDayOf(l) : null, j = end ? K.add(K.monday(end), 7) : a.startsOn; return { id: id, pushedRev: null, joins: j > a.startsOn ? j : a.startsOn }; }), weeks: weeks };
    ST.teamsNew.push(T);
    return { changed: true, kind: 'team', persist: true, data: { id: slug(a.name), name: a.name, members: a.ids.length, weeks: weeks.length }, keys: ['team:' + slug(a.name)], ids: [slug(a.name)].concat(a.ids), events: [['program:saved', { team: slug(a.name) }]],
      undo: function () { var i = ST.teamsNew.indexOf(T); if (i >= 0) ST.teamsNew.splice(i, 1); },
      label: a.name + ': ' + K.plural(a.ids.length, 'lifter') + (weeks.length ? ', ' + prog0 + ' from ' + dmyOf(a.startsOn) : ', from ' + dmyOf(a.startsOn)) + '. Nothing is sent yet.', undoLabel: a.name + ' is gone again.' };
  };
  /* a line of a team week (set, add, remove): the team's line and every member who follows it; a member with a line of their
     own keeps it (Dev's bench); own: <lifterId> writes that member's line only */
  OPS.teamLine = function (a) {
    var T = teamOf(a.id); if (!T) return fail('not_found', 'There is no team ' + a.id + '.');
    var wi = a.n - 1, td = teamDay(T, wi, a.di); if (!td) return fail('not_found', 'Week ' + a.n + ' has no day ' + (a.di + 1) + '.');
    var tWeek0 = clone(T.weeks[wi]), snaps = [], affects = [], kept = [], undos = [], te = a.what === 'add' ? null : td.exercises[a.li];
    if (a.what !== 'add' && !te) return fail('not_found', 'That line is not in week ' + a.n + '.');
    var old = te ? lineOfEx(te) : null, title = te ? te.title : a.title, lift = te ? te.lift : a.lift;
    var reach = teamReach(T, a.n).filter(function (l) { return !a.own || l.id === a.own; });
    reach.forEach(function (l) {
      var w = l.program.weeks[wi], md = w && w.days.filter(function (x) { return x.name === td.name; })[0]; if (!md) return;
      var me = a.what === 'add' ? null : md.exercises[a.li]; if (a.what !== 'add' && (!me || me.title !== title)) return;
      if (me && me.sets.some(function (s) { return s.done; })) { kept.push(l.id); return; }
      if (!a.own && me && !sameLine(lineOfEx(me), old)) { kept.push(l.id); return; }
      snaps.push(snapWeek(l, wi));
      if (a.what === 'set') me.sets = setsOfCell(a.cell);
      else if (a.what === 'add') md.exercises.push({ lift: lift || 'other', variant: MAIN[lift] ? 'Competition' : '', title: title, note: '', sets: setsOfCell(a.cell) });
      else md.exercises.splice(a.li, 1);
      md.sets = setsIn(md.exercises);
      var said = title + (a.what === 'remove' ? ' taken out' : ': ' + lineText(lineOfEx(a.what === 'add' ? md.exercises[md.exercises.length - 1] : me)));
      if (w.sentAt || (w.published !== false && wi > l.program.weekIdx)) { var hadCh = has(w, 'changedSinceSent'), pc = w.changedSinceSent; w.changedSinceSent = (w.changedSinceSent || []).concat([said]); undos.push(function () { if (hadCh) w.changedSinceSent = pc; else delete w.changedSinceSent; }); }
      affects.push(l.id);
    });
    if (!a.own) {
      var tw = T.weeks[wi], tday = tw.days.filter(function (x) { return x.name === td.name; })[0];
      if (a.what === 'set') tday.exercises[a.li].sets = setsOfCell(a.cell);
      else if (a.what === 'add') tday.exercises.push({ lift: lift || 'other', title: title, note: '', sets: setsOfCell(a.cell) });
      else tday.exercises.splice(a.li, 1);
    }
    var ord = {}; model().rows.forEach(function (r) { ord[r.id] = r.tier * 1000 + r.ord; });
    var keptNames = kept.slice().sort(function (x, y) { return ord[x] - ord[y]; }).map(function (id) { return K.L(id).first; });
    return { changed: true, kind: 'team', persist: true, data: { id: a.id, n: a.n, affects: affects.slice(), kept: kept.slice() }, keys: ['teamline:' + a.id + ':' + a.n + ':' + a.di].concat(affects.map(function (id) { return 'program:' + id; })), ids: [a.id].concat(affects), events: [['program:saved', { team: a.id, ids: affects.slice() }]],
      undo: function () { chain(undos)(); snaps.forEach(putWeek); if (!a.own) T.weeks[wi] = tWeek0; },
      label: 'Week ' + a.n + ', ' + td.name.toLowerCase() + ': ' + title.toLowerCase() + (a.what === 'remove' ? ' taken out' : ' ' + lineText(lineOfEx({ sets: setsOfCell(a.cell) }))) + (a.own ? ' for ' + K.L(a.own).first + ' only' : '') + '.' + (keptNames.length ? ' ' + K.list(keptNames, 9) + ' ' + (keptNames.length === 1 ? 'keeps ' + (K.L(kept[0]).sex === 'F' ? 'her' : 'his') : 'keep their') + ' own line.' : ''),
      undoLabel: 'Week ' + a.n + '’s ' + title.toLowerCase() + ' is back as it was.' };
  };

  /* ---------------- meets (screens.md §10.5) ---------------- */
  var FED_GL = { 'Powerlifting America': 1, IPF: 1 }, OUT_AT = [24, 20, 16, 12, 9, 6, 3], RED = ['depth', 'press', 'lockout', 'rack', 'down', 'start', 'other'];
  var RED_WORD = { depth: 'Depth', press: 'Press call', lockout: 'Lockout', rack: 'Rack', down: 'Down call', start: 'Start call', other: 'Other' };
  function weighInOf(fed) { return fed === 'USPA' ? '24h' : '2h'; }
  /* every meet a lifter has booked, the next one first (lifters.get(id).meet is that one, .meets all of them) */
  function meetsOf(l) {
    var out = []; if (l.meet) out.push(l.meet);
    (ST.booked[l.id] || []).forEach(function (m) { out.push(m); });
    return out.slice().sort(function (a, b) { return String(day10(a.date)).localeCompare(String(day10(b.date))); });
  }
  function meetOut(m) { var date = day10(m.date); return { id: meetId(m), name: m.name, date: date, days: K.daysTo(date), cls: m.cls || null, fed: m.fed || null, weighIn: m.weighIn || null, entryBy: m.entryBy || null, attemptsSet: !!m.attemptsSet }; }
  /* a meet the desk knows: today's board, the lifters' meets, the calendar (data.js) */
  function knownMeet(id) {
    var m = meetById(id); if (m) return { name: m.name, date: day10(m.date), fed: m.fed || null };
    var c = (D.calendar || []).filter(function (x) { return x.id === id || slug(x.name) === id; })[0]; if (c) return { name: c.name, date: c.date, fed: c.fed || null, weighIn: c.weighIn || null };
    var b = null; D.lifters.forEach(function (l) { (ST.booked[l.id] || []).forEach(function (x) { if (!b && meetId(x) === id) b = { name: x.name, date: day10(x.date), fed: x.fed || null }; }); });
    return b;
  }
  function clsFor(l, cls) {
    var sx = sexOf(l), list = sx ? CLASSES[sx] : CLASSES.F.concat(CLASSES.M);
    if (cls == null) { var now = bwNow(l); if (now == null || !sx) return null; for (var i = 0; i < list.length; i++) if (now <= list[i]) return list[i]; return list[list.length - 1] + '+'; }
    /* LOGIC-FIX-4 (walk 2, Kofi 120.4 kg): the top class's plus ("120+", "84+") is a class of its own, and a federation's
       own classes count (USPA's 125, 140); "120+ kg" and "120+s" read as 120+ */
    var str = String(cls).replace(/\s*kg\b/i, '').replace(/s$/, '').trim(), c = parseFloat(str);
    if (/\+$/.test(str)) { var top = sx ? CLASSES[sx][CLASSES[sx].length - 1] : null, fedTop = l.meet && l.meet.fed ? classList(sx, l.meet.fed) : null; return sx && (c === top || (fedTop && c === fedTop[fedTop.length - 1])) ? c + '+' : NaN; }
    var fl = l.meet && l.meet.fed ? classList(sx, l.meet.fed) : null;
    return list.indexOf(c) >= 0 || (fl && fl.indexOf(c) >= 0) ? c : NaN;
  }
  /* DOTS (USAPL, USPA) and IPF GL points (IPF affiliates), from the total, bodyweight and sex */
  function pointsOf(kind, total, bw, sex) {
    if (!total || !bw || !sex) return null;
    if (kind === 'GL') { var g = sex === 'M' ? [1199.72839, 1025.18162, 0.00921] : [610.32796, 1045.59282, 0.03048]; return Math.round(total * 100 / (g[0] - g[1] * Math.exp(-g[2] * bw)) * 100) / 100; }
    var c = sex === 'M' ? [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076] : [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288];
    var den = c[0] * Math.pow(bw, 4) + c[1] * Math.pow(bw, 3) + c[2] * bw * bw + c[3] * bw + c[4];
    return Math.round(total * 500 / den * 100) / 100;
  }
  function flightsOf(mid) { var o = ST.flights[mid] || (D.meetDay && D.meetDay[mid] && D.meetDay[mid].flights) || null; return o ? clone(o) : null; }
  /* the platform: the attempt on it now, counted across the lift's flights (flight A 1 to 36, then flight B) */
  function platformOf(mid, stage) {
    var fl = flightsOf(mid); if (!fl) return null;
    var lift = LIFTS.indexOf(stage) >= 0 ? stage : 'squat', fs = fl[lift] || [], at = (ST.platform[mid] || {})[lift] || 1, base = 0, cur = null;
    fs.forEach(function (f) { var len = f.size * 3; if (!cur && at <= base + len) cur = { f: f, base: base }; base += len; });
    if (!cur && fs.length) { var lf = fs[fs.length - 1]; cur = { f: lf, base: base - lf.size * 3 }; }
    return cur ? { lift: lift, flight: cur.f.letter, at: at, of: cur.base + cur.f.size * 3, inFlight: at - cur.base, total: base } : null;
  }
  /* where a lifter's attempt k of a lift sits on the platform (1-based, across flights) */
  function attemptIndex(fl, lift, id, k) {
    var fs = fl && fl[lift] || [], base = 0, out = null;
    fs.forEach(function (f) { if (out == null && f.ids && f.ids[id] != null) out = base + (k - 1) * f.size + f.ids[id]; base += f.size * 3; });
    return out;
  }
  function bestMade(pl, lift) { var b = null; for (var k = 0; k < 3; k++) if (pl.st[lift][k] === 'good' && (b == null || pl.a[lift][k] > b)) b = pl.a[lift][k]; return b; }
  function pastBest(l, lift) { var key = { squat: 's', bench: 'b', deadlift: 'd' }[lift], b = null; (l.pastMeets || []).forEach(function (m) { if (isNum(m[key]) && (b == null || m[key] > b)) b = m[key]; }); return b; }
  /* Elena's cut, by the rule in screens.md §5.3: food straight-line from today's weight to the class plus the water share by
     two days out, low fibre the last two days, sips the evening before, the class on the scale */
  function cutRows(l) {
    var pl = planOf(l), b = bwPlan(l, pl); if (!l.meet || b.now == null || !isNum(b.cls)) return null;
    var weigh = day10(l.meet.date), wday = l.meet.weighIn === '24h' ? K.add(weigh, -1) : weigh, start = K.add(TODAY, 1), twoOut = K.add(wday, -2), water = b.water || 0, foodTo = r1(b.cls + water);
    var span = Math.max(1, K.daysTo(twoOut) - K.daysTo(TODAY)), rows = [];
    for (var d = start; d <= wday; d = K.add(d, 1)) {
      var i = K.daysTo(d) - K.daysTo(TODAY), last2 = d >= K.add(wday, -2), row;
      if (d === wday) row = { d: d, target: b.cls, food: 'after the weigh-in: see below', water: '', note: 'at the scale' };
      else if (d === K.add(wday, -1)) row = { d: d, target: r1((foodTo + b.cls) / 2), food: 'low fibre, light meals', water: 'sips after 18:00', note: '' };
      else row = { d: d, target: d >= twoOut ? foodTo : r1(b.now - (b.now - foodTo) * i / span), food: last2 ? '300 kcal under, low fibre' : '300 kcal under', water: 'as usual', note: '' };
      rows.push(row);
    }
    var it = C.get('cut-' + l.id), a = it && (actOf(it, 'cut') || actOf(it, 'plan'));
    return { rows: rows, after: 'Fluids with electrolytes, about 1 litre in the first hour; easy carbs every 30 minutes until the squats; nothing new.', text: a && a.reply ? a.reply : '', from: b.now, to: b.cls, by: wday, title: l.first + '’s cut: ' + n(b.now) + ' to ' + n(b.cls) + ' by ' + dmyOf(wday) };
  }
  /* the dated sessions of a lifter's program (the one dating rule) with their main lines: what Meets' run-in and rehearsal read */
  function datedLines(l) {
    var p = l.program, out = []; if (!p) return out;
    p.weeks.forEach(function (w, wi) { trainDays(w).forEach(function (d) { var iso = dayDateOf(l, wi, d.name); (d.exercises || []).forEach(function (e) { e.sets.forEach(function (s, si) { if (s.extra) return; out.push({ wi: wi, day: d.name, date: iso, lift: e.lift, variant: e.variant || '', title: e.title, note: e.note || '', r: s.r, w: s.w || s.planW || null, pct: s.pct == null ? null : s.pct, rpe: s.rpe == null ? null : s.rpe, done: !!s.done, first: si === 0 }); }); }); }); });
    return out;
  }
  function rehearsalOf(l, pl) {
    if (!l.meet || l.meet.days > 21 || l.meet.days < 0) return null;
    var meet = day10(l.meet.date), lo = K.add(meet, -10), hi = K.add(meet, -4), done = [];
    var lines = datedLines(l);
    LIFTS.forEach(function (k) {
      var op = pl.a[k][0], e1 = e1Of(l, k);
      var hit = lines.some(function (x) { if (x.lift !== k || !x.date || x.date < lo || x.date > hi) return false; if (/opener practice/i.test(x.note + ' ' + x.title)) return true; var kg = x.w || (x.pct && e1 ? K.round(e1 * x.pct / 100) : null); return x.r === 1 && isNum(kg) && isNum(op) && Math.abs(kg - op) <= op * 0.025 + 1e-9; });
      /* LOGIC-FIX-4: a rehearsal written in the draft (PL.meets.rehearse, not sent yet) counts too */
      if (!hit && drafts[l.id] && BLK()) { try { var rb = BLK().from(drafts[l.id]); rb.rows.forEach(function (row, r) { if (hit || row.lift !== k || row.line !== 0) return; rb.weeks.forEach(function (w, c) { var x = row.cells[w.uid], iso = x ? rb.dateOf(c, row.day) : null; if (x && !x.lifted && x.r === 1 && iso && iso >= lo && iso <= hi && isNum(x.w) && isNum(op) && Math.abs(x.w - op) <= op * 0.025 + 1e-9) hit = true; }); }); } catch (e) { /* no draft to read */ } }
      if (hit) done.push(k);
    });
    var missing = LIFTS.filter(function (k) { return done.indexOf(k) < 0; }), at = function (k) { var x = lines.filter(function (y) { return y.lift === k && y.date >= lo && y.date <= hi && y.r === 1; })[0]; return x ? ' (' + dmyOf(x.date) + (x.w ? ', ' + n(x.w) : '') + ')' : ''; };
    var text = !done.length ? 'No opener rehearsal written yet.' : (done.length === 1 ? upper1(done[0]) + ' opener rehearsed' + at(done[0]) : upper1(K.list(done, 3)) + ' openers rehearsed') + '. ' + (missing.length ? upper1(K.list(missing, 3)) + ' not yet.' : 'All three done.');
    return { done: done, missing: missing, from: lo, to: hi, text: text };
  }
  function runinOf(l) {
    if (!l.meet || l.meet.days < 22) return null;
    var meet = day10(l.meet.date), TP = (BLK() && BLK().TAPER) || { squat: { lo: 8, hi: 12 }, bench: { lo: 6, hi: 10 }, deadlift: { lo: 10, hi: 14 }, rehearsal: { lo: 4, hi: 10 }, accessories: 14 };
    var lines = datedLines(l), inWin = function (lo, hi, f) { var a = K.add(meet, -hi), b = K.add(meet, -lo); return lines.some(function (x) { return x.date && x.date >= a && x.date <= b && f(x); }); };
    var heavyLo = Math.min(TP.squat.lo, TP.bench.lo, TP.deadlift.lo), heavyHi = Math.max(TP.squat.hi, TP.bench.hi, TP.deadlift.hi);
    var markers = [
      { id: 'heavy', from: K.add(meet, -heavyHi), to: K.add(meet, -heavyLo), written: LIFTS.every(function (k) { return inWin(TP[k].lo, TP[k].hi, function (x) { return x.lift === k && x.r <= 3 && (x.rpe == null || x.rpe >= 8); }); }), label: 'Last heavy singles' },
      { id: 'rehearsal', from: K.add(meet, -TP.rehearsal.hi), to: K.add(meet, -TP.rehearsal.lo), written: inWin(TP.rehearsal.lo, TP.rehearsal.hi, function (x) { return MAIN[x.lift] && (x.r === 1 || /opener practice/i.test(x.note + ' ' + x.title)); }), label: 'Opener rehearsal' },
      { id: 'taper', from: K.add(meet, -TP.accessories), to: K.add(meet, -1), written: inWin(1, TP.accessories, function () { return true; }), label: 'Taper' },
      { id: 'weigh', from: l.meet.weighIn === '24h' ? K.add(meet, -1) : meet, to: meet, written: true, label: 'Weigh-in' }
    ];
    var tot = 0, was = 0, okS = LIFTS.every(function (k) { var s = l.lifts[k] && liftNow(l, k).series; return s && s.length >= 5 && isNum(s[s.length - 1]) && isNum(s[s.length - 5]); });
    if (okS) LIFTS.forEach(function (k) { var s = liftNow(l, k).series; tot += s[s.length - 1]; was += s[s.length - 5]; });
    var rate = okS ? r1(tot - was) : null, weeks = l.meet.days / 7;
    return { markers: markers, projected: okS ? { total: Math.round((tot + rate * weeks / 4) / 5) * 5, rate: rate, from: r1(tot), weeks: r1(weeks) } : null };
  }
  function warningsOf(l, pl) {
    var out = [], noHeavy = LIFTS.filter(function (k) { return !proven(l, k); });
    if (noHeavy.length) out.push({ kind: 'no-heavy', lifts: noHeavy, text: 'No heavy single or triple in 3 weeks on ' + K.list(noHeavy, 3).replace(' and ', noHeavy.length > 1 ? ' or ' : ' and ') + '.' });
    var best = (l.pastMeets || []).slice().sort(function (a, b) { return b.total - a.total; })[0], thirds = LIFTS.reduce(function (s, k) { return s + (pl.a[k][2] || 0); }, 0);
    if (best && thirds > best.total * 1.05) out.push({ kind: 'over-best', by: r1(thirds - best.total), text: 'Thirds add up to ' + n(thirds) + ', ' + n(r1(thirds - best.total)) + ' over ' + (l.sex === 'F' ? 'her' : 'his') + ' best total (' + n(best.total) + ', ' + best.name + ').' });
    return out;
  }
  /* one write for every STORE-2 meet move; each case keeps what it changes and its own way back */
  OPS.meet2 = function (a) {
    var l = a.lifterId ? L(a.lifterId) : null; if (a.lifterId && !l) return noLifter(a.lifterId);
    var undos = [], keys = [], label = '', data = {}, ids = l ? [l.id] : [], items = [], events = [], undoEvents = [], undoLabel = null;
    var keep = function (map, k) { var had = has(map, k), prev = map[k]; undos.push(function () { if (had) map[k] = prev; else delete map[k]; }); };
    switch (a.what) {
      case 'book': {
        var m = { name: a.meet.name, date: a.meet.date, days: K.daysTo(a.meet.date), cls: a.cls != null ? a.cls + ' kg' : null, fed: a.meet.fed || null, weighIn: a.weighIn || weighInOf(a.meet.fed), attemptsSet: false, entryBy: a.entryBy || null };
        var hadM = has(l, 'meet'), prevM = l.meet, prevB = (ST.booked[l.id] || []).slice();
        if (!l.meet) l.meet = m;
        else if (m.date < day10(l.meet.date) && l.meet.days > 0) { ST.booked[l.id] = prevB.concat([l.meet]); l.meet = m; }
        else ST.booked[l.id] = prevB.concat([m]);
        undos.push(function () { if (hadM) l.meet = prevM; else delete l.meet; if (prevB.length) ST.booked[l.id] = prevB; else delete ST.booked[l.id]; });
        if (l.meet === m) { var hadPl = has(ST.plans, l.id), prevPl = ST.plans[l.id]; ST.plans[l.id] = bookedPlan(l); undos.push(function () { if (hadPl) ST.plans[l.id] = prevPl; else delete ST.plans[l.id]; }); }
        /* LOGIC-FIX-4 (walk 2, Marcus booked in the 120s): the class he is booked in is his class when he had none, so the
           header and the Bodyweight tile read it (and how far over or under he is) */
        if (a.cls != null && l.meet === m && !(l.bw && l.bw.cls != null && l.bw.cls !== '')) {
          var hadBw = !!l.bw, prevBw = l.bw ? clone(l.bw) : null, bnow = bwNow(l);
          l.bw = l.bw || {}; l.bw.cls = String(a.cls); if (/\+$/.test(String(a.cls))) l.bw.over = null; else if (bnow != null) l.bw.over = r1(bnow - a.cls);
          undos.push(function () { if (hadBw) l.bw = prevBw; else delete l.bw; });
        }
        keys = ['meet:' + l.id]; data = { lifterId: l.id, meetId: meetId(m), next: meetId(l.meet), meets: meetsOf(l).map(meetId) };
        label = l.first + ' is booked into the ' + m.name + ', ' + dmyOf(m.date) + (a.cls != null ? ', in ' + clsWords(a.cls) : '') + '.'; undoLabel = l.first + ' is off the ' + m.name + ' again.'; events.push(['meet:changed', { lifterId: l.id, what: 'book' }]);
        break;
      }
      case 'results': {
        var rs = (ST.results[l.id] || []).slice(), pm = (l.pastMeets || []).slice(), rec = { meetId: a.meetId, name: a.name, date: a.date, attempts: clone(a.attempts), bw: a.bw == null ? null : a.bw, place: a.place == null ? null : a.place, made: clone(a.made), total: a.total, at: a.at };
        ST.results[l.id] = rs.concat([rec]);
        l.pastMeets = pm.concat([{ name: a.name, date: a.date, s: a.made.squat, b: a.made.bench, d: a.made.deadlift, total: a.total, cls: null, bw: a.bw == null ? null : a.bw, notes: a.place ? 'Place ' + a.place + '.' : '' }]);
        undos.push(function () { if (rs.length) ST.results[l.id] = rs; else delete ST.results[l.id]; l.pastMeets = pm; });
        keys = ['results:' + l.id + ':' + a.meetId]; data = { lifterId: l.id, meetId: a.meetId, made: clone(a.made), total: a.total };
        label = l.first + ' at the ' + a.name + ': ' + LIFTS.map(function (k) { return a.made[k] == null ? k + ' none' : n(a.made[k]); }).join(', ') + (a.total ? ', total ' + n(a.total) : '') + '.'; undoLabel = l.first + '’s results are taken off.';
        break;
      }
      case 'target': keep(ST.targets, l.id); if (a.total == null) delete ST.targets[l.id]; else ST.targets[l.id] = { total: a.total, why: a.why || '' }; keys = ['target:' + l.id]; data = { lifterId: l.id, target: a.total == null ? null : ST.targets[l.id] };
        label = a.total == null ? l.first + ' has no target total.' : l.first + '’s target: ' + n(a.total) + (a.why ? ' ' + lower1(a.why) : '') + '.'; break;
      case 'reason': { var rk = l.id + '|' + a.lift + '|' + a.k; keep(ST.redReasons, rk); ST.redReasons[rk] = a.reason; keys = ['reason:' + rk]; data = { lifterId: l.id, lift: a.lift, k: a.k, reason: a.reason };
        label = 'No lift: ' + lower1(RED_WORD[a.reason]) + ', ' + l.first + '’s ' + (a.k > 1 ? ORDW[a.k - 1] + ' ' + a.lift : a.lift + ' opener') + '.'; break; }
      case 'debrief': { var dk = l.id + '|' + a.meetId; keep(ST.meetNotes, dk); ST.meetNotes[dk] = { text: a.text, at: a.at }; keys = ['debrief:' + dk]; data = { lifterId: l.id, meetId: a.meetId }; label = 'Saved to ' + l.first + '’s notes on the meet.'; break; }
      case 'flight': keep(ST.flights, a.meetId); var fl0 = flightsOf(a.meetId) || {}; fl0[a.lift] = clone(a.flights); ST.flights[a.meetId] = fl0; keys = ['flight:' + a.meetId + ':' + a.lift]; data = { meetId: a.meetId, lift: a.lift }; ids = [a.meetId];
        label = upper1(a.lift) + ' flights: ' + a.flights.map(function (f) { return f.letter + ' of ' + f.size; }).join(', ') + '.'; break;
      case 'platform': { var pm0 = ST.platform[a.meetId] ? clone(ST.platform[a.meetId]) : undefined; ST.platform[a.meetId] = ST.platform[a.meetId] || {}; ST.platform[a.meetId][a.lift] = a.n;
        undos.push(function () { if (pm0 === undefined) delete ST.platform[a.meetId]; else ST.platform[a.meetId] = pm0; }); keys = ['platform:' + a.meetId + ':' + a.lift]; ids = [a.meetId]; data = { meetId: a.meetId, lift: a.lift, at: a.n };
        label = upper1(a.lift) + ': attempt ' + a.n + ' is on the platform.'; break; }
      case 'rack': keep(ST.racks, l.id); ST.racks[l.id] = { squat: a.rack.squat == null ? null : a.rack.squat, bench: a.rack.bench == null ? null : a.rack.bench, safety: a.rack.safety == null ? null : a.rack.safety }; keys = ['rack:' + l.id]; data = { lifterId: l.id, rack: clone(ST.racks[l.id]) };
        label = l.first + '’s rack heights: ' + rackWords(ST.racks[l.id]) + '.'; break;
      case 'handIn': { keep(ST.handIn, l.id); var pl1 = planOf(l); ST.handIn[l.id] = { at: a.at, attempts: { squat: pl1.a.squat[0], bench: pl1.a.bench[0], deadlift: pl1.a.deadlift[0] } }; keys = ['handin:' + l.id]; data = { lifterId: l.id, handedIn: clone(ST.handIn[l.id]) };
        label = l.first + '’s openers are handed in: ' + LIFTS.map(function (k) { return n(pl1.a[k][0]); }).join(', ') + '.'; break; }
      case 'changeBy': keep(ST.changeBy, a.meetId); ST.changeBy[a.meetId] = a.hm; keys = ['changeby:' + a.meetId]; ids = [a.meetId]; data = { meetId: a.meetId, by: a.hm }; label = 'Openers to the table by ' + a.hm + '.'; break;
      case 'cut': {
        keep(ST.cuts, l.id); ST.cuts[l.id] = { rows: clone(a.rows), after: a.after, text: a.text, at: a.at, sent: !!a.send };
        keys = ['cut:' + l.id]; data = { lifterId: l.id, sent: !!a.send };
        if (a.send) {
          l.messages = l.messages || []; var ms = [];
          if (a.text) ms.push({ me: true, type: 'text', body: a.text, at: a.at, read: true });
          ms.push({ me: true, type: 'cut', body: 'Cut plan: ' + n(a.rows[0].target) + ' to ' + n(a.rows[a.rows.length - 1].target) + ' by ' + dmyOf(a.rows[a.rows.length - 1].d), at: a.at, read: true, meta: { rows: a.rows.length, after: a.after } });
          ms.forEach(function (x) { l.messages.push(x); }); undos.push(function () { ms.forEach(function (x) { var i = l.messages.indexOf(x); if (i >= 0) l.messages.splice(i, 1); }); });
          var ur = markRead(l); if (ur) undos.push(ur);
          var ci = C.get('cut-' + l.id); if (ci && !doneOf(ci.id)) { undos.push(itemDone(ci.id, { act: 'cut', at: a.at, label: 'Cut plan sent' })); items.push(ci.id); keys.push('item:' + ci.id); events.push(['item:done', { itemId: ci.id, actId: 'cut' }]); }
          events.push(['message:sent', { id: l.id }]);
          label = l.first + '’s cut plan is sent.' + (a.text ? ' Sent to ' + l.first + ': “' + a.text + '”' : ''); undoLabel = l.first + '’s cut plan is taken back.';
        } else label = l.first + '’s cut plan is saved. Not sent.';
        break;
      }
      case 'pain': {
        var sub = OPS.pain({ id: l.id, where: a.where, score: a.score, lift: a.lift, from: 'meet', note: '', at: a.at }); undos.push(sub.undo); keys = keys.concat(sub.keys);
        keep(ST.meetPain, l.id); ST.meetPain[l.id] = { where: a.where, score: a.score, lift: a.lift, at: a.at };
        var eased = [];
        if (a.ease && a.lift && l.meet) {
          var pl2 = planFor(l), prevPl = clone(pl2), safe = presetFor(l, a.lift, 'safe');
          for (var q = 0; q < 3; q++) if (!judged(pl2.st[a.lift][q]) && isNum(safe[q]) && safe[q] !== pl2.a[a.lift][q]) { eased.push(n(pl2.a[a.lift][q]) + ' → ' + n(safe[q])); pl2.a[a.lift][q] = safe[q]; }
          if (eased.length) pl2.preset = null;
          undos.push(function () { ST.plans[l.id] = prevPl; }); keys.push('plan:' + l.id + ':' + a.lift);
        }
        data = { lifterId: l.id, pain: clone(sub.data), eased: eased.slice() }; events.push(['meet:changed', { lifterId: l.id, what: 'pain' }]);
        label = l.first + ': ' + lower1(a.where) + ' ' + n(a.score) + '/10' + (a.lift ? ', ' + a.lift : '') + '.' + (eased.length ? ' ' + upper1(a.lift) + ': ' + eased.join(', ') + '.' : ''); undoLabel = l.first + '’s pain record is taken off' + (eased.length ? ' and the ' + a.lift + ' attempts are back' : '') + '.';
        break;
      }
      case 'maxes': {
        var ch = [];
        a.changes.forEach(function (c) { var x = K.L(c.id); if (!x || !x.program) return; var mx = x.program.maxes = x.program.maxes || {}, was = has(mx, c.lift) ? mx[c.lift] : undefined; mx[c.lift] = c.to; undos.push(function () { if (was === undefined) delete mx[c.lift]; else mx[c.lift] = was; }); ch.push(c); keys.push('max:' + c.id + ':' + c.lift); if (ids.indexOf(c.id) < 0) ids.push(c.id); });
        if (!ch.length) return { changed: false, data: { meetId: a.meetId, changes: [] }, label: 'Nothing beats a max.' };
        data = { meetId: a.meetId, changes: clone(ch) }; events.push(['max:set', { meetId: a.meetId }]);
        label = 'New maxes from the meet: ' + ch.map(function (c) { return K.L(c.id).first + '’s ' + c.lift + ' ' + n(c.to); }).join(', ') + '.'; undoLabel = 'The maxes are back as they were.';
        break;
      }
      default: return fail('invalid', 'Not a meet move.');
    }
    return { changed: true, kind: 'meet', persist: true, data: data, keys: keys, items: items, ids: ids.concat(items), events: events.length ? events : [['meet:changed', { meetId: a.meetId || null, lifterId: l ? l.id : null, what: a.what }]], undoEvents: events.length ? events.map(function (e) { return e[0] === 'item:done' ? ['item:undone', e[1]] : e; }) : undefined, undo: chain(undos), label: label, undoLabel: undoLabel };
  };
  /* the meets of the coming weeks as the charts count them: the data's, and every meet booked here (shared.md §6.5) */
  function weekMeets() {
    return cached('weekMeets', function () {
      var out = clone(D.week.meets || []), by = {}; out.forEach(function (m) { by[slug(m.meet)] = m; });
      D.lifters.forEach(function (l) { meetsOf(l).forEach(function (m) { var k = meetId(m), d = K.daysTo(day10(m.date)); if (d < 0) return; var x = by[k] || (by[k] = { key: m.name.toLowerCase() + '|' + d, days: d, x: d / 84, meet: m.name, ids: [] }); if (out.indexOf(x) < 0) out.push(x); if (x.ids.indexOf(l.id) < 0) x.ids.push(l.id); }); });
      out.sort(function (a, b) { return a.days - b.days || a.meet.localeCompare(b.meet); });
      return out;
    });
  }
  function rackWords(r) { if (!r) return ''; var o = []; if (r.squat != null) o.push('squat rack ' + r.squat); if (r.bench != null) o.push('bench rack ' + r.bench); if (r.safety != null) o.push('safety ' + r.safety); return o.join(', '); }

  /* ---------------- messages (screens.md §10.6, shared.md §6.16) ---------------- */
  var DEPTH_SAID = { deep: 'Depth was there.', border: 'Depth was borderline: sit a touch deeper.', high: 'That one was high: sit deeper.' }, EDIT_MIN = 10;
  /* a message the coach wrote, found by its time (msgId): one in the thread, or the words sent with a move */
  function myMessage(l, msgId) {
    var t = tOf(msgId); if (isNaN(t)) return null;
    var m = (l.messages || []).filter(function (x) { return x.me && tOf(x.at) === t; })[0]; if (m) return { m: m };
    var hit = null; C.forLifter(l.id).forEach(function (it) { var d = doneOf(it.id); if (!hit && d && d.text && tOf(d.at) === t) hit = { item: it, d: d }; });
    return hit;
  }
  OPS.msgEdit = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    var x = myMessage(l, a.msgId); if (!x) return fail('not_found', 'There is no message of yours at ' + a.msgId + '.');
    var o = x.m || x.d, prevB = x.m ? o.body : o.text, hadE = has(o, 'edited'), prevE = o.edited;
    if (x.m) o.body = a.text; else o.text = a.text; o.edited = a.at;
    return { changed: true, kind: 'message', persist: true, data: { id: l.id, msgId: a.msgId, text: a.text }, keys: ['msg:' + l.id + ':' + a.msgId], ids: [l.id], events: [['message:sent', { id: l.id, edited: true }]],
      undo: function () { if (x.m) o.body = prevB; else o.text = prevB; if (hadE) o.edited = prevE; else delete o.edited; }, label: 'Message to ' + l.first + ' edited: “' + a.text + '”', undoLabel: 'Message to ' + l.first + ' is back as it was.' };
  };
  OPS.msgRemove = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    var x = myMessage(l, a.msgId); if (!x || !x.m) return fail('not_found', 'There is no message of yours at ' + a.msgId + '.');
    var i = l.messages.indexOf(x.m); l.messages.splice(i, 1);
    return { changed: true, kind: 'message', persist: true, data: { id: l.id, msgId: a.msgId }, keys: ['msg:' + l.id + ':' + a.msgId], ids: [l.id], events: [['message:sent', { id: l.id, removed: true }]],
      undo: function () { l.messages.splice(i, 0, x.m); }, label: 'Message to ' + l.first + ' taken back.', undoLabel: 'Message to ' + l.first + ' is back.' };
  };
  OPS.sendMany = function (a) {
    var msgs = [], undos = [];
    a.ids.forEach(function (id) { var l = K.L(id); if (!l) return; var m = { me: true, body: a.text, at: a.at, read: true, type: 'text', meta: { many: a.ids.length } }; l.messages = l.messages || []; l.messages.push(m); msgs.push([l, m]); var ur = markRead(l); if (ur) undos.push(ur); });
    undos.push(function () { msgs.forEach(function (x) { var i = x[0].messages.indexOf(x[1]); if (i >= 0) x[0].messages.splice(i, 1); }); });
    var names = msgs.map(function (x) { return x[0].first; });
    return { changed: true, kind: 'message', persist: true, data: { ids: a.ids.slice(), text: a.text }, keys: a.ids.map(function (id) { return 'msg:' + id + ':' + a.at; }).concat(a.ids.map(function (id) { return 'unread:' + id; })), ids: a.ids.slice(), events: [['message:sent', { ids: a.ids.slice() }]], undo: chain(undos),
      label: 'Sent to ' + (names.length === 1 ? names[0] : K.list(names, 4)) + ': “' + a.text + '”', undoLabel: 'Messages to ' + K.list(names, 4) + ' taken back.' };
  };
  OPS.depth = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    var had = has(ST.depth, l.id), prev = ST.depth[l.id]; if (a.call) ST.depth[l.id] = a.call; else delete ST.depth[l.id];
    return { changed: true, kind: 'message', persist: true, data: { id: l.id, depth: a.call || null }, keys: ['depth:' + l.id], ids: [l.id], events: [], undo: function () { if (had) ST.depth[l.id] = prev; else delete ST.depth[l.id]; },
      label: a.call ? 'Depth call on ' + l.first + '’s rep: ' + lower1(DEPTH_SAID[a.call]).replace(/\.$/, '') + '.' : 'Depth call cleared.' };
  };

  /* ---------------- clients and settings (screens.md §10.8, §7) ---------------- */
  function pkgList() {
    if (ST.pkgs) return ST.pkgs.map(function (p) { var o = clone(p); o.lifters = D.lifters.filter(function (l) { return l.billing && l.billing.pkg === p.name; }).length; o.price = price(o); if (o.cadence === 'once' && o.weeks) o.line = o.weeks + '-week ' + lower1(o.name) + ', ' + o.price; return o; });
    return basePkgs().map(function (p) { var o = clone(p); o.link = ''; o.currency = p.cur || 'USD'; return o; });
  }
  /* the packages as the ledger has them (lifters on each), before the coach edits any in Settings */
  function basePkgs() {
    var by = {}, out = [];
    /* spec C (first-time-coach.md §10.2, function-polish F8.4): a price set for one lifter stays on that lifter (custom); it
       never makes a second package with the same name */
    D.lifters.forEach(function (l) { var b = l.billing; if (!b || !b.pkg || b.custom) return; var k = b.pkg + '|' + b.amount + '|' + b.cadence; if (!by[k]) { by[k] = { id: slug(b.pkg), name: b.pkg, amount: b.amount, cadence: b.cadence, cur: b.cur || 'USD', price: price(b), lifters: 0 }; out.push(by[k]); } by[k].lifters++; });
    out.sort(function (a, b) { return b.lifters - a.lifters || a.name.localeCompare(b.name); });
    return out;
  }
  function pkgFind(key) { return pkgList().filter(function (p) { return p.id === key || p.name === key || slug(p.name) === key; })[0] || null; }
  function fillTpl(tpl, l) {
    var b = l.billing, pk = b ? pkgFind(b.pkg) : null;
    return String(tpl || REMIND_TPL).replace(/\{first\}/g, l.first).replace(/\{amount\}/g, b ? K.money(b.amount) : '').replace(/\{due\}/g, b && b.nextDue ? K.dm(b.nextDue) : '').replace(/\{link\}/g, pk && pk.link ? 'Pay here: ' + pk.link + '.' : '').replace(/\s{2,}/g, ' ').replace(/\s+([.,])/g, '$1').trim();
  }
  OPS.bill2 = function (a) {
    var l = a.id ? L(a.id) : null; if (a.id && !l) return noLifter(a.id);
    var undos = [], keys = l ? ['bill:' + l.id] : [], label = '', data = {}, ids = l ? [l.id] : [], items = [], events = [['billing:changed', { id: l ? l.id : null, what: a.what }]], undoLabel = null;
    var keepB = function () { var prevB = l.billing ? clone(l.billing) : null; undos.push(function () { if (prevB == null) l.billing = null; else { var bb = l.billing || (l.billing = {}); Object.keys(bb).forEach(function (k) { delete bb[k]; }); Object.keys(prevB).forEach(function (k) { bb[k] = prevB[k]; }); } }); };
    var post = function (m) { l.messages = l.messages || []; l.messages.push(m); undos.push(function () { var i = l.messages.indexOf(m); if (i >= 0) l.messages.splice(i, 1); }); events.push(['message:sent', { id: l.id }]); };
    switch (a.what) {
      case 'remind': {
        var had = has(ST.reminders, l.id), prev = ST.reminders[l.id], due = l.billing.nextDue;
        ST.reminders[l.id] = { when: a.when, on: a.on, words: a.text, at: a.when === 'now' ? a.at : TODAY + 'T08:00', sent: a.when === 'now' };
        undos.push(function () { if (had) ST.reminders[l.id] = prev; else delete ST.reminders[l.id]; });
        if (a.when === 'now') post({ me: true, type: 'payment', body: 'About the payment: ' + K.money(l.billing.amount) + (due ? ' due ' + K.dm(due) : ''), at: a.at, read: true, meta: { words: a.text, amount: l.billing.amount, due: due || null } });
        label = a.when === 'now' ? 'Reminder sent to ' + l.first + ': “' + a.text + '”' : 'Reminder goes out tomorrow 08:00: “' + a.text + '”'; undoLabel = a.when === 'now' ? 'Reminder to ' + l.first + ' taken back.' : 'Reminder to ' + l.first + ' cancelled.';
        break;
      }
      case 'editPayment': {
        var p = (l.payments || [])[a.i]; if (!p) return fail('not_found', 'There is no payment ' + a.i + ' for ' + l.first + '.');
        var pp = clone(p); ['amount', 'on', 'method'].forEach(function (k) { if (a[k] != null) p[k] = a[k]; });
        var short = l.billing && p.amount < l.billing.amount ? r1(l.billing.amount - p.amount) : 0; if (short) p.short = short; else delete p.short;
        undos.push(function () { Object.keys(p).forEach(function (k) { delete p[k]; }); Object.keys(pp).forEach(function (k) { p[k] = pp[k]; }); });
        data = { id: l.id, i: a.i, payment: clone(p), due: short }; label = l.first + '’s payment: ' + K.money(p.amount) + ' ' + K.when(p.on) + ' by ' + (HOW[p.method] || p.method).replace(/^by /, '') + '.' + (short ? ' ' + K.money(short) + ' still due.' : '');
        break;
      }
      /* LOGIC-FIX-2 (Clients' request, screens.md §7.1's Remove): a payment that did not happen. It leaves the history and the
         due date it settled is owed again (nextDue one cycle back); Undo puts both back */
      case 'removePayment': {
        var rp = (l.payments || [])[a.i]; if (!rp) return fail('not_found', 'There is no payment ' + a.i + ' for ' + l.first + '.');
        keepB(); l.payments.splice(a.i, 1); undos.push(function () { l.payments.splice(a.i, 0, rp); });
        var bb0 = l.billing; if (bb0 && bb0.nextDue) { bb0.nextDue = STEP_DAYS[bb0.cadence] ? K.add(bb0.nextDue, -STEP_DAYS[bb0.cadence]) : addMonths(bb0.nextDue, -(STEP_MONTHS[bb0.cadence] || 1), K.d(bb0.nextDue).getDate()); if (bb0.status && bb0.status.state !== 'paused') bb0.status = statusFor(bb0); }
        data = { id: l.id, i: a.i, payment: clone(rp), nextDue: bb0 ? bb0.nextDue : null };
        label = l.first + '’s ' + K.money(rp.amount) + ' from ' + K.dm(rp.on) + ' is removed.' + (bb0 && bb0.nextDue ? ' Due again ' + K.dm(bb0.nextDue) + '.' : ''); undoLabel = l.first + '’s ' + K.money(rp.amount) + ' payment is back.';
        break;
      }
      case 'package': {
        /* spec C: a price other than the package's is this lifter's own (custom), never a second package of that name */
        var pk0 = pkgList().filter(function (x) { return x.name === a.pkg.name; })[0] || null, own0 = !!a.custom || !!(pk0 && pk0.amount !== a.amount && !(l.billing && l.billing.pkg === a.pkg.name && pk0.lifters === 1 && !ST.pkgs));
        keepB(); var b = l.billing || (l.billing = { pkg: '', amount: 0, cur: 'USD', cadence: 'monthly', nextDue: null, status: { state: 'ok' }, note: '' });
        if (own0) b.custom = true; else delete b.custom;
        b.pkg = a.pkg.name; b.amount = a.amount; b.cadence = a.pkg.cadence; b.cur = a.pkg.currency || 'USD'; b.nextDue = a.firstDue; b.firstDue = a.firstDue; b.status = statusFor(b);
        if (a.note) post({ me: true, type: 'text', body: a.note, at: a.at, read: true });
        data = { id: l.id, billing: clone(b) }; label = l.first + ' is on ' + b.pkg + ', ' + price(b) + ', first payment ' + (a.firstDue === TODAY ? 'today' : dmyOf(a.firstDue)) + '.' + (a.note ? ' Sent to ' + l.first + ': “' + a.note + '”' : '');
        break;
      }
      case 'invite': {
        var inv = { id: 'inv-' + slug(a.name), name: a.name, email: a.email, pkg: a.pkg, amount: a.amount, startsOn: a.startsOn, code: inviteCode(a.name + '|' + a.email), at: a.at };
        ST.invites.push(inv); undos.push(function () { var i = ST.invites.indexOf(inv); if (i >= 0) ST.invites.splice(i, 1); }); keys = ['invite:' + inv.id]; ids = [inv.id];
        data = clone(inv); data.link = 'powalifta.com/j/' + inv.code; label = 'Invite emailed to ' + a.name.split(' ')[0] + ', ' + nowIso().slice(11, 16) + '. Link powalifta.com/j/' + inv.code + '.'; undoLabel = 'Invite to ' + a.name.split(' ')[0] + ' taken back.';
        break;
      }
      case 'end': { var he = has(ST.ends, l.id), pe = ST.ends[l.id]; ST.ends[l.id] = { after: a.after, at: a.at }; undos.push(function () { if (he) ST.ends[l.id] = pe; else delete ST.ends[l.id]; });
        data = { id: l.id, after: a.after }; label = 'Billing for ' + l.first + ' stops after ' + dmyOf(a.after) + '.'; undoLabel = 'Billing for ' + l.first + ' goes on.'; break; }
      case 'link': { var hl = ST.inviteLink, pl0 = hl ? clone(hl) : null; ST.inviteLink = a.cancel ? { cancelled: true, code: hl && hl.code ? hl.code : INVITE } : { cancelled: false, code: inviteCode(INVITE + '|' + a.at) };
        undos.push(function () { ST.inviteLink = pl0; }); keys = ['invitelink']; data = { cancelled: !!a.cancel, code: ST.inviteLink.code };
        label = a.cancel ? 'The invite link is cancelled. Nobody new can join with it.' : 'New invite link: powalifta.com/j/' + ST.inviteLink.code + '.'; break; }
      case 'pkgSave': case 'pkgRemove': {
        var before = ST.pkgs ? clone(ST.pkgs) : null, list = pkgList().map(function (x) { var y = { id: x.id, name: x.name, amount: x.amount, cadence: x.cadence, link: x.link || '', currency: x.currency || 'USD' }; if (x.weeks != null) y.weeks = x.weeks; return y; });
        if (a.what === 'pkgRemove') list = list.filter(function (x) { return x.id !== a.pid; });
        else { var at0 = -1; list.forEach(function (x, i) { if (x.id === a.pid) at0 = i; }); var row = { id: a.pid, name: a.name, amount: a.amount, cadence: a.cadence, link: a.link || '', currency: a.currency || 'USD' }; if (a.weeks != null) row.weeks = a.weeks; if (at0 >= 0) list[at0] = row; else list.push(row); }
        /* LOGIC-FIX-2 (Settings' request): a renamed package carries its lifters and open invites with it, in the same write */
        var old0 = a.what === 'pkgSave' ? pkgList().filter(function (x) { return x.id === a.pid; })[0] : null, moved0 = [];
        if (old0 && old0.name !== a.name) {
          D.lifters.forEach(function (x) { if (x.billing && (x.billing.pkg === old0.name || slug(x.billing.pkg || '') === a.pid)) { moved0.push({ b: x.billing, was: x.billing.pkg }); x.billing.pkg = a.name; keys.push('bill:' + x.id); } });
          (ST.invites || []).forEach(function (x) { if (x.pkg === old0.name) { moved0.push({ b: x, was: x.pkg }); x.pkg = a.name; } });
          undos.push(function () { moved0.forEach(function (m) { m.b.pkg = m.was; }); });
        }
        ST.pkgs = list; undos.push(function () { ST.pkgs = before; }); keys.push('pkgs'); data = { id: a.pid, packages: list.length, moved: moved0.length };
        label = a.what === 'pkgRemove' ? a.name + ' is removed.' : a.name + ': ' + K.money(a.amount) + ' ' + (EVERY[a.cadence] || 'a month') + '.'; break;
      }
      default: return fail('invalid', 'Not a billing move.');
    }
    return { changed: true, kind: 'billing', persist: true, data: data, keys: keys, items: items, ids: ids, events: events, undo: chain(undos), label: label, undoLabel: undoLabel };
  };
  OPS.appTerms = function (a) {
    var x = apps().filter(function (z) { return z.id === a.appId; })[0]; if (!x || !x.it) return fail('not_found', 'There is no application ' + a.appId + '.');
    var sub = OPS.app({ appId: a.appId, yes: a.yes, at: a.at }); if (sub.error) return sub;
    var had = has(ST.appReplies, a.appId + ':terms'), prev = ST.appReplies[a.appId + ':terms'], first = x.a.name.split(' ')[0];
    ST.appReplies[a.appId + ':terms'] = a.yes ? { pkg: a.pkg, amount: a.amount, startsOn: a.startsOn, at: a.at } : { declined: a.text || '', at: a.at };
    var code = inviteCode(x.a.name);
    return { changed: true, kind: 'billing', persist: true, data: { appId: a.appId, accepted: !!a.yes, terms: clone(ST.appReplies[a.appId + ':terms']), link: a.yes ? 'powalifta.com/j/' + code : null }, keys: sub.keys.concat(['appterms:' + a.appId]), items: sub.items, ids: sub.ids, events: sub.events, undoEvents: sub.undoEvents,
      undo: function () { sub.undo(); if (had) ST.appReplies[a.appId + ':terms'] = prev; else delete ST.appReplies[a.appId + ':terms']; },
      label: a.yes ? 'Invite emailed to ' + first + ', ' + nowIso().slice(11, 16) + '. Link powalifta.com/j/' + code + (a.pkg ? '. ' + a.pkg + ', ' + K.money(a.amount) + ' a month, from ' + dmyOf(a.startsOn) : '') + '.' : 'Declined ' + first + '.' + (a.text ? ' Sent to ' + first + ': “' + a.text + '”' : ''), undoLabel: a.yes ? 'Invite to ' + first + ' taken back.' : first + '’s application is open again.' };
  };
  OPS.settings = function (a) {
    var before = ST.settings ? clone(ST.settings) : null, prevC = { deload: D.coach.deload, plateStep: D.coach.plateStep }, prevRules = clone(D.rules), prevBy = D.rulesBy ? clone(D.rulesBy) : undefined;
    var next = ST.settings ? clone(ST.settings) : {};
    Object.keys(a.patch).forEach(function (k) { next[k] = clone(a.patch[k]); });
    ST.settings = next;
    if (has(a.patch, 'rules')) rulesToData(relRules());
    if (has(a.patch, 'deload')) D.coach.deload = a.patch.deload;
    if (has(a.patch, 'plateStep')) D.coach.plateStep = a.patch.plateStep;
    var undo = function () { ST.settings = before; ['deload', 'plateStep'].forEach(function (k) { if (prevC[k] === undefined) delete D.coach[k]; else D.coach[k] = prevC[k]; }); D.rules = prevRules; if (prevBy === undefined) delete D.rulesBy; else D.rulesBy = prevBy; };
    var said = Object.keys(a.patch).map(function (k) { return SET_WORD[k] || k; });
    return { changed: true, kind: 'settings', persist: true, data: { keys: Object.keys(a.patch) }, keys: Object.keys(a.patch).map(function (k) { return 'settings:' + k; }), ids: [], events: [['settings:changed', { keys: Object.keys(a.patch) }]], undo: undo,
      label: 'Saved: ' + K.list(said, 4) + '.', undoLabel: 'Back as it was: ' + K.list(said, 4) + '.' };
  };
  var SET_WORD = { plateStep: 'the plate step', rules: 'your rules', deload: 'the deload', words: 'your words', saved: 'saved replies', notifications: 'notifications', reminders: 'payment reminders', theme: 'the appearance', keys: 'the keys', currency: 'the currency' };
  OPS.plan = function (a) {
    var pc = { plan: D.coach.plan, limit: D.coach.limit }, P1 = PLANS.filter(function (p) { return p.id === a.plan; })[0];
    D.coach.plan = P1.name; D.coach.limit = P1.max == null ? 9999 : P1.max;
    return { changed: true, kind: 'settings', persist: true, data: { plan: P1.id, limit: P1.max }, keys: ['plan'], ids: [], events: [['billing:changed', { plan: P1.id }]], undo: function () { D.coach.plan = pc.plan; D.coach.limit = pc.limit; },
      label: P1.max == null ? 'You’re on ' + P1.name + ': no seat limit.' : 'You’re on ' + P1.name + ': ' + P1.max + ' seats.', undoLabel: 'You’re on ' + pc.plan + ' again.' };
  };
  /* the to-do in one order with the store's crimson (screens.md §7.1): the first open row whose decision is real: late (not
     lifting today), an application, a payment due today, no price yet, paused, leaving; a payment not yet due never */
  var CRIMSON_ORDER = ['late', 'app', 'today', 'none', 'paused', 'leaving'];
  function todoRows() {
    return cached('todo2', function () {
      var rows = todoRowsBase().map(function (r) {
        var o = clone(r);
        if (r.kind === 'none' && r.done) { var l = K.L(r.lifterId), b = l && l.billing; if (b && b.firstDue === TODAY && b.nextDue === TODAY && !paidThisMonth(l)) { o.done = null; o.text = K.money(b.amount) + ', due today'; o.due = b.nextDue; o.dueToday = true; o.acts = [{ id: 'paid', label: 'Mark paid' }]; }
          /* LOGIC-FIX-4 (walk 2, Hannah): a first payment still to come is money due like any other: the row reads it and
             offers Mark paid (new lifters often pay on signing up), with the package it was set from kept beside it */
          else if (b && b.firstDue && b.nextDue === b.firstDue && b.firstDue > TODAY && !paidThisMonth(l) && !(l.payments || []).length) { var ps1 = payState(l); o.set = o.done; o.done = null; o.kind = 'soon'; o.first = true; o.text = K.money(b.amount) + ', first payment ' + (ps1.days === 1 ? 'tomorrow' : K.wd(b.nextDue)); o.due = b.nextDue; o.days = ps1.days; o.acts = [{ id: 'paid', label: 'Mark paid' }]; }
          else if (b && b.firstDue && (l.payments || []).length === 1 && paidThisMonth(l)) { var pd1 = paidThisMonth(l); o.set = o.done; o.kind = 'soon'; o.first = true; o.text = K.money(b.amount) + ', first payment'; o.acts = [{ id: 'paid', label: 'Mark paid' }]; o.done = { act: 'paid', label: 'Paid ' + K.money(pd1.amount) + ' ' + K.when(pd1.on) + ' ' + (HOW[pd1.method] || '') + '. Next payment ' + K.dm(b.nextDue), at: pd1.on }; } }
        if (r.kind === 'app') { var tm = ST.appReplies[r.id + ':terms']; if (tm && o.done) { o.terms = clone(tm); if (o.done.act === 'yes') o.done.label = 'Invite emailed to ' + o.name.split(' ')[0] + ', ' + String(localIso(tOf(tm.at))).slice(11, 16) + '. Link ' + o.invite.link; } }
        /* screens.md §10.8: a paused row's moves lead with the check-in (Jonah is away; restarting his billing is not the decision) */
        if (r.kind === 'paused') o.acts = o.acts.filter(function (x) { return x.id === 'msg'; }).concat(o.acts.filter(function (x) { return x.id !== 'msg'; }));
        o.crimson = false;
        return o;
      });
      (ST.invites || []).forEach(function (inv) { rows.push({ key: inv.id, kind: 'invite', id: inv.id, lifterId: null, name: inv.name, text: 'Invited, ' + inv.pkg + ', ' + K.money(inv.amount) + ' a month', amount: inv.amount, due: inv.startsOn, acts: [], done: { act: 'invite', label: 'Invite emailed to ' + inv.name.split(' ')[0] + ', ' + String(localIso(tOf(inv.at))).slice(11, 16) + '. Link powalifta.com/j/' + inv.code, at: inv.at, link: 'powalifta.com/j/' + inv.code }, crimson: false }); });
      /* FIX-LOGIC (P-MONEY-MESSAGES, FTC FC-39): a lifter added on this desk and charged has their first payment in To do,
         the way the showcase lists Elena's (kind soon, due within 7 days), in FTC §10.2's words "Due Mon 16 Nov, $100" */
      D.lifters.forEach(function (l) {
        if (!l.made || !l.billing || stageOf(l) === 'invited' || rows.some(function (r) { return r.lifterId === l.id; })) return;   /* an invite not taken yet owes nothing */
        var b = l.billing, ps = payState(l), pd = paidThisMonth(l), rem = ST.reminders[l.id];
        if (ps.state !== 'soon' && ps.state !== 'late' && !pd) return;
        var o = { key: 'pay-' + l.id, kind: ps.state === 'late' ? 'late' : 'soon', id: l.id, lifterId: l.id, name: l.name, amount: b.amount, due: b.nextDue, days: ps.days, first: !(l.payments || []).length,
          text: ps.state === 'late' ? K.money(b.amount) + ', ' + K.plural(-(ps.days || 0), 'day') + ' late' : 'Due ' + K.wd3(b.nextDue) + ' ' + K.dm(b.nextDue) + ', ' + K.money(b.amount),
          acts: [{ id: 'paid', label: 'Mark paid' }, { id: 'remind', label: 'Remind' }, { id: 'pause', label: 'Pause billing' }], done: null, crimson: false };
        if (pd) { o.done = { act: 'paid', label: 'Paid ' + K.money(pd.amount) + ' ' + K.when(pd.on) + ' ' + (HOW[pd.method] || '') + '. Next payment ' + K.dm(b.nextDue), at: pd.on }; if (b.firstDue && b.firstDue >= TODAY) { o.text = 'Due ' + K.wd3(b.firstDue) + ' ' + K.dm(b.firstDue) + ', ' + K.money(pd.amount); o.first = true; } }   /* a done row keeps the words it had */
        else if (rem) o.done = { act: 'remind', label: rem.when === 'tomorrow' ? 'Reminder goes out tomorrow morning' : 'Reminded today', at: rem.on };
        rows.push(o);
      });
      var kindOfRow = function (r) { if (r.done) return null; if (r.kind === 'late') { var l = K.L(r.lifterId); return l && l.meet && l.meet.days === 0 ? null : 'late'; } if (r.dueToday) return 'today'; return r.kind === 'soon' ? null : r.kind; };
      var pick = null; CRIMSON_ORDER.some(function (k) { pick = rows.filter(function (r) { return kindOfRow(r) === k; })[0] || null; return !!pick; });
      if (pick) pick.crimson = true;
      return rows;
    });
  }

  /* ================= SPEC C (13 Nov evening; r6/spec-c/plan.md, package STORE): the core =================
     first-time-coach.md (FTC) §2 to §13 and function-polish.md (FP) §6, in contract v1's shapes. These ops sit before the
     replay below, so a reload brings each write back; the calls that make them are at the end of the file. Additive: the
     showcase at rest reads exactly as before (shared.md §2's counts).
     A LIFTER THIS DESK ADDS (FTC §3): PL.invites.create makes an invited lifter (a record with no intake yet, so every list,
     count and seat sees it); PL.lifters.add one the coach types in (intake.by 'coach'). Both are records in D.lifters shaped
     like Hannah's (demo-d10), with made = { by, at, code, email, invite, joined, sample }. syncNew() keeps each one's triage
     (TIER, ORD, TYPES) and the first-block items in step with what the coach has done, after every write, undo and replay:
     first-<id> runs from the intake to the first send (stage 'start', then 'send' once a block is written; it settles on
     the first send, never on the start, FP F4.4), join-<id> shows after 48 hours not joined (Keep an eye on). */
  var MADE_SERIES = [null, null, null, null, null, null, null, null, null, null, null, null], DAY_ORDER = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  function iniOf(name) { var p = String(name || '').trim().split(/\s+/); return ((p[0] || '').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function hueOf(name) { var h = 0; for (var i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0; return h % 8; }
  /* the person's own link (FTC §3.2): powalifta.com/j/<code>, the code from the name and the coach, the same on every page */
  function inviteOf(name) { var code = inviteCode(words0(name) + '|' + ((D.coach && D.coach.name) || 'coach')); return { code: code, link: 'powalifta.com/j/' + code, url: 'https://powalifta.com/j/' + code }; }
  /* FIX-LOGIC (FP F2.3): o.merge = { day, into }: day is a template day left without a weekday, into another template day
     or the weekday it landed on ("Thu") */
  function tplMergeArg(m, tdays, days, l) {
    var B0 = BLK(), why = 'Merge one of the template’s days into another.';
    if (!m || typeof m !== 'object' || !isStr(m.day) || !isStr(m.into) || !Array.isArray(tdays)) return bad(why, 'merge');
    if (!tdays.some(function (d) { return d.name === m.day; })) return bad(why, 'merge');
    var into = m.into, rest = tdays.filter(function (d) { return d.name !== m.day; });
    if (!rest.some(function (d) { return d.name === into; })) {
      var wd = weekdays([into])[0], pl = wd && B0 && typeof B0.placeDays === 'function' ? B0.placeDays(rest.map(function (d) { return { name: d.name, wd: d.wd == null ? null : d.wd }; }), days, l) : null;
      var hit = pl ? pl.days.filter(function (d) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.wd] === wd; })[0] : null; if (!hit) return bad(why, 'merge'); into = hit.name;
    }
    return { data: { day: m.day, into: into } };
  }
  function weekdays(days) { return uniq((Array.isArray(days) ? days : []).map(function (d) { return String(d).slice(0, 1).toUpperCase() + String(d).slice(1, 3).toLowerCase(); }).filter(function (d) { return DAY_ORDER[d] != null; })).sort(function (a, b) { return DAY_ORDER[a] - DAY_ORDER[b]; }); }
  function classFor(sex, kg) { if (!isNum(kg) || (sex !== 'F' && sex !== 'M')) return null; var list = CLASSES[sex]; for (var i = 0; i < list.length; i++) if (kg <= list[i] + 1e-9) return String(list[i]); return list[list.length - 1] + '+'; }
  function hhmm(at) { return isStr(at) ? localIso(tOf(at)).slice(11, 16) : ''; }
  function herOf(l) { return l && l.sex === 'M' ? 'his' : l && l.sex === 'F' ? 'her' : 'their'; }
  /* FIX-LOGIC polish-d2 (first-time walk 3, Maya): where a lifter's starting numbers came from, in the coach's words. A lifter
     the coach added by hand (intake.by 'coach') has "what you typed", never "her intake" (FTC §6, the kit's "From what you
     entered"); everyone else has their own intake. { by, head, from, words } */
  function srcOf(l) {
    var typed = !!(l && l.intake && l.intake.by === 'coach'), her = herOf(l);
    return typed ? { by: 'coach', head: 'What you typed', from: 'from what you typed', words: 'what you typed', entered: 'From what you entered' }
      : { by: l && l.intake ? 'lifter' : null, head: 'From ' + her + ' intake', from: 'from ' + her + ' intake', words: her + ' intake', entered: 'From ' + her + ' intake' };
  }
  function sheOf(l) { return l && l.sex === 'M' ? 'He' : l && l.sex === 'F' ? 'She' : 'They'; }
  /* an intake the coach typed (FTC §3.2): best sets as given (a lift left out has no max), the days in week order */
  function handIntake(a) {
    var best = {}, on = localIso(tOf(a.at)).slice(0, 10);
    LIFTS.forEach(function (k) { var x = a.best && a.best[k]; if (x && isNum(x.kg) && isNum(x.reps)) best[k] = { kg: x.kg, reps: x.reps, when: on }; });
    var days = weekdays(a.days), inj = isStr(a.injuries) && a.injuries.trim() ? a.injuries.trim() : null, part = inj ? partWord(inj) : null;
    return { v: 1, by: 'coach', at: localIso(tOf(a.at)), sex: a.sex || null, best: best, bodyweightKg: isNum(a.bw) ? a.bw : null, weightClass: classFor(a.sex, a.bw), federation: null, yearsLifting: null,
      daysPerWeek: days.length, days: days, sessionMinutes: isNum(a.minutes) ? a.minutes : null, equipment: [], injuries: inj ? { parts: part ? [upper1(inj.split(/[.,:;]/)[0].trim())] : [], note: inj } : { parts: [], note: '' },
      goals: '', meet: a.meet && a.meet.name ? { name: words0(a.meet.name), date: a.meet.date, federation: a.meet.fed || null } : null, phone: null, timezone: null, instagram: null, notes: '' };
  }
  function madeRecord(a) {
    var nm = words0(a.name), l = { id: a.lid, name: nm, first: nm.split(/\s+/)[0], ini: iniOf(nm), hue: hueOf(nm), live: false, liveSets: 0, since: tOf(a.at), country: null, lane: 'new', reasons: [], week: null, ago: null, lastDate: null,
      total: { now: null, delta: null }, lifts: {}, bw: null, bwSeries: [], meet: null, pastMeets: [], pain: [], drift: null, readiness: null, health: [], checkin: null, answers: [], messages: [], unread: 0,
      notes: [], coachNotes: [], billing: null, payments: [], request: null, intake: a.by === 'hand' ? handIntake(a) : null, program: null, review: { last: -1, next: -1, rows: [] }, jobs: [], logs: [], sex: a.sex || null,
      made: { by: a.by, at: localIso(tOf(a.at)), code: a.code, email: a.email || null, invite: a.by === 'invite' ? a.iid : null, joined: null, sample: a.sample == null ? null : a.sample, resent: null } };
    LIFTS.forEach(function (k) { l.lifts[k] = { e1: null, was: null, delta: null, series: MADE_SERIES.slice() }; });
    return l;
  }
  function putMade(l, at) { if (isNum(at) && at >= 0 && at <= D.lifters.length) D.lifters.splice(at, 0, l); else D.lifters.push(l); K.byId[l.id] = l; if (ST.made.indexOf(l.id) < 0) ST.made.push(l.id); NAMES = null; }
  function dropMadeOne(l) {
    var i = D.lifters.indexOf(l); if (i >= 0) D.lifters.splice(i, 1); if (K.byId[l.id] === l) delete K.byId[l.id];
    var j = ST.made.indexOf(l.id); if (j >= 0) ST.made.splice(j, 1);
    ['first-', 'join-', 'offapp-'].forEach(function (p) { if (C.get(p + l.id)) C.remove(p + l.id); });
    delete TIER[l.id]; delete ORD[l.id]; delete TYPES[l.id]; NAMES = null;
    return i;
  }
  /* every lifter this desk added leaves (resetDemo, before a replay rebuilds them) */
  function dropMade() { D.lifters.filter(function (l) { return !!l.made; }).forEach(function (l) { dropMadeOne(l); }); }
  /* a week counts as sent when it went (sentAt, published), as weekWords reads it */
  function anySent(l) { var p = l.program; return !!(p && p.weeks.some(function (w) { return !!w.sentAt || w.published !== false; })); }
  /* FIX-LOGIC (build C walk 2, Maya added by hand): a lifter the coach typed in is not on the app until she joins from her
     link, so a send reaches nobody yet. offApp(l) answers what to tell the coach and the link to hand her, else null */
  function offApp(l) {
    var m = l && l.made; if (!m || m.by !== 'hand' || m.joined || !isStr(m.code)) return null;
    var her = herOf(l), she = sheOf(l);
    return { text: l.first + ' isn’t on the app yet. Send ' + (her === 'their' ? 'them' : her === 'his' ? 'him' : 'her') + ' the link to see it.', link: 'powalifta.com/j/' + m.code, url: 'https://powalifta.com/j/' + m.code, label: 'Copy ' + l.first + '’s link', facts: 'Not on the app yet', toast: she + (she === 'They' ? ' aren’t' : ' isn’t') + ' on the app yet, so send ' + (her === 'their' ? 'them' : her === 'his' ? 'him' : 'her') + ' the link.' };
  }
  function anyDone(l) { var p = l.program; return !!(p && p.weeks.some(function (w) { return (w.days || []).some(function (d) { return d.done > 0; }); })); }
  /* FTC §3.4: one status ladder, served on every screen */
  function stageOf(l) {
    if (!l) return null;
    var m = l.made;
    if (m && m.invite && !l.intake) return 'invited';
    if (!l.program) return l.intake && l.intake.by === 'coach' ? 'added' : l.intake ? 'intake' : 'none';
    if (!anySent(l)) return 'written';
    if (l.program.weekIdx < 0 && !anyDone(l)) return 'sent';
    return 'training';
  }
  function firstSessionOf(l) {
    var p = l && l.program; if (!p) return null;
    for (var wi = 0; wi < p.weeks.length; wi++) { var ds = trainDays(p.weeks[wi]).map(function (d) { return dayDateOf(l, wi, d.name); }).filter(Boolean).sort(); if (ds.length) return ds[0]; }
    return null;
  }
  function blockWeeksOf(l) { var p = l && l.program, dr = drafts[l.id]; return p ? Math.max(p.weeks.length, dr && Array.isArray(dr.weeks) ? dr.weeks.length : 0) : 0; }
  /* the weeks a first block goes out as (FTC §7.4): up to and including the first deload, at most 4 */
  function firstWeeks(l) {
    var p = l && l.program, out = []; if (!p) return out;
    var dr = drafts[l.id], n0 = blockWeeksOf(l);
    for (var i = 0; i < n0 && out.length < 4; i++) {
      out.push(i + 1);
      var w = p.weeks[i], dw = dr && Array.isArray(dr.weeks) ? dr.weeks[i] : null;
      if ((w && (w.deload || w.kind === 'Deload' || /deload/i.test(w.name || ''))) || (dw && (dw.deload || dw.kind === 'Deload'))) break;
    }
    return out;
  }
  function stageWords(l, st) {
    var m = l.made || {}, p = l.program, f = firstSessionOf(l), sent = p ? p.weeks.map(function (w, i) { return w.sentAt ? { n: i + 1, at: w.sentAt } : null; }).filter(Boolean) : [];
    var wn = sent.length > 1 ? 'Weeks ' + sent[0].n + ' to ' + sent[sent.length - 1].n : sent.length ? 'Week ' + sent[0].n : '';
    var seen = sent.some(function (x) { return !!(ST.weekSeen[l.id + ':' + x.n] || (p.weeks[x.n - 1] && p.weeks[x.n - 1].seenAt)); });
    var ans = l.intake && l.intake.at ? l.intake.at : null, ansWords = ans ? (day10(ans) === nowIso().slice(0, 10) ? K.wd3(day10(ans)) + ' ' + String(ans).slice(11, 16) : dmyOf(day10(ans))) : '';
    switch (st) {
      case 'invited': return { text: 'Invited ' + hhmm(m.at) + ', not joined yet', facts: 'Invited ' + K.wd3(day10(m.at)) + ' ' + hhmm(m.at) + ' · Not joined yet' };
      case 'added': return { text: 'Added by you, not on the app yet', facts: 'Added by you · Not on the app yet' };
      case 'intake': return { text: 'No program yet', facts: (ans ? 'Intake answered ' + ansWords : 'Intake answered') + ' · No program yet' };
      case 'written': return { text: 'First block written, not sent', facts: (p.name || 'First block') + (f ? ', from ' + dmyOf(f) : '') + ' · Not sent' };
      case 'sent': return { text: 'Week 1 of ' + blockWeeksOf(l) + (f ? ' starts ' + dmyOf(f) : ''), facts: (wn ? wn + ' sent ' + K.wd3(day10(localIso(tOf(sent[sent.length - 1].at)))) + ' ' + hhmm(sent[sent.length - 1].at) : 'Sent') + ' · ' + (offApp(l) ? offApp(l).facts : seen ? 'Seen' : 'Not seen yet'), notOnApp: offApp(l) ? { text: offApp(l).text, link: offApp(l).link, url: offApp(l).url, label: offApp(l).label } : null };
    }
    return { text: '', facts: '' };
  }
  /* the newest top set a lifter lifted (FTC §5.2, the Your lifters card): "Squat 72.5 × 5, felt 7.5", title "Written @7" */
  function lastTopOf(l) {
    var p = l && l.program, best = null; if (!p) return null;
    p.weeks.forEach(function (w) { (w.days || []).forEach(function (d) {
      if (!(d.done > 0)) return; var t = K.topSet(d); if (!t || !t.set || !t.set.done) return;
      var on = String(t.set.on || d.date || ''), at = on.length > 10 ? localIso(tOf(on)) : on; if (!best || at > best.at) best = { at: at, t: t };
    }); });
    if (!best) return null;
    var e = best.t.ex, s = best.t.set, g0 = groupsOf(e)[0], name = nameOf(e), felt = s.felt != null ? s.felt : null, wr = g0 && g0.rpe != null ? g0.rpe : null;
    return { lift: MAIN[e.lift] ? e.lift : null, name: name, w: s.w, r: s.r, felt: felt, written: wr, on: best.at.slice(0, 10), text: name + ' ' + n(s.w) + ' × ' + s.r + (felt != null ? ', felt ' + n(felt) : ''), title: wr != null ? 'Written @' + n(wr) : '' };
  }
  function weekLine(l) {
    var p = l && l.program; if (!p) return '';
    var wi = p.weekIdx >= 0 ? p.weekIdx : 0, w = p.weeks[wi]; if (!w) return '';
    var days = trainDays(w), done = days.filter(function (d) { return d.done > 0; }).length;
    return 'Week ' + (wi + 1) + ' of ' + blockWeeksOf(l) + ': ' + done + ' of ' + days.length + ' done';
  }
  function joinDue(l) { var m = l && l.made; return !!(m && m.invite && !l.intake && tOf(nowIso()) - tOf(m.at) >= 48 * 3600000); }
  var SYNCING = false;
  function syncNew() {
    if (SYNCING) return; SYNCING = true; var prev = inWrite; inWrite = true;
    try {
      D.lifters.forEach(function (l, i) {
        var m = l.made, st = stageOf(l);
        if (m) {
          var join = st === 'invited' && joinDue(l), fd = doneOf('first-' + l.id);
          /* FIX-LOGIC (build C walk 2): a first block sent on an earlier day than the desk's today is last week's done row: the
             lifter steps out of Needs you (On track) instead of keeping "First block sent 07:27" on Monday */
          var old = !!(fd && isStr(fd.at) && localIso(tOf(fd.at)).slice(0, 10) < TODAY && (st === 'sent' || st === 'training'));
          /* FIX-LOGIC (first-time walk s6, Maya): added by hand and sent a block, but not on the app: nothing she was sent reaches
             her, so she stays in Needs you ("Maya can’t see her program yet", Copy Maya’s link) until she joins */
          var off = (st === 'sent' || st === 'training') && C.offapp ? offApp(l) : null;
          TIER[l.id] = st === 'invited' ? (join ? 2 : 9) : off ? 1 : old ? 9 : 1; ORD[l.id] = 900 + i; TYPES[l.id] = st === 'invited' ? (join ? ['join'] : []) : off ? (old ? ['offapp'] : ['offapp', 'noprogram']) : old ? [] : ['noprogram'];
          if (join) { if (!C.get('join-' + l.id)) { var ji = C.join(l, { invitedAt: m.at, email: m.email }); ji.lifter = l; C.add(ji); } }
          else if (C.get('join-' + l.id)) C.remove('join-' + l.id);
          offSync(l, off);
        }
        firstSync(l, st);
      });
    } finally { inWrite = prev; SYNCING = false; }
  }
  /* the offapp-<id> item in step with the lifter: there while a hand-added lifter with a block sent is not on the app (the
     words follow what went), gone when she joins; copied on an earlier day, it opens again (she still can't see it) */
  function offSync(l, off) {
    var id = 'offapp-' + l.id, it = C.get(id);
    if (!off) { if (it) C.remove(id); return; }
    var sent = l.program ? l.program.weeks.map(function (w, i) { return w.sentAt ? i + 1 : null; }).filter(Boolean) : [];
    var wn = sent.length > 1 ? 'Weeks ' + sent[0] + ' to ' + sent[sent.length - 1] : sent.length ? 'Week ' + sent[0] : '';
    var sig = off.link + '|' + wn + '|' + l.first + '|' + (l.sex || '');
    if (!it || it._sig !== sig) { var nx = C.offapp(l, { link: off.link, url: off.url, weeks: wn }); nx._sig = sig; nx.lifter = l; C.add(nx); }
    var d = doneOf(id); if (d && isStr(d.at) && localIso(tOf(d.at)).slice(0, 10) < TODAY) delete C.state.done[id];
  }
  function firstSync(l, st) {
    var id = 'first-' + l.id, it = C.get(id);
    if (!l.intake || st === 'invited') { if (it && l.made) C.remove(id); return; }
    if (!it && !l.made) return;                     /* a showcase lifter with no first block item: everyone but Hannah */
    if (it && doneOf(id)) return;                   /* settled on the first send: the done row stays as it is */
    var send = !!l.program && st !== 'training', so = send ? firstSessionOf(l) : null, wn = send ? firstWeeks(l).length || 1 : 4;
    var sig = (send ? 'send' : 'start') + '|' + (so || '') + '|' + wn + '|' + (l.intake && l.intake.at || '') + '|' + (l.intake && l.intake.by || '') + '|' + l.first;
    if (it && it._sig === sig) return;
    if (it && it._sig == null && !send && !l.made) { it._sig = sig; return; }   /* coach.js's own item at rest (Hannah) */
    var nx = C.first(l, { stage: send ? 'send' : 'start', startsOn: so, weeks: wn }); nx._sig = sig; nx._stage = send ? 'send' : 'start'; nx.lifter = l;
    C.add(nx);
  }
  /* the open first-block reminder ("Do it Saturday", FP F4.4) of a lifter: the row waits until it is due */
  function firstSnooze(id) { var now = nowIso(); return ST.remind.filter(function (r) { return !r.done && r.lifterId === id && r.kind === 'first-block' && !remindDue(r, now); })[0] || null; }
  function remindDue(r, now) { now = now || nowIso(); return isStr(r.on) && r.on.length > 10 ? r.on <= now : r.on <= now.slice(0, 10); }

  /* a new booking (FP F7.3, FD10): nothing ticked in Ready; a first meet (no meet results) on Safe; a lift with no e1RM yet
     takes its attempts from the intake's estimate (shared.md §4.7's Safe rule on the intake max) */
  function bookedPlan(l) {
    var p = planDefault(l), est = startMaxes(l), first = !(l.pastMeets && l.pastMeets.length);
    PREP.forEach(function (t) { p.ticks[t[0]] = false; });
    LIFTS.forEach(function (k) { var own = l.lifts[k] && l.lifts[k].e1, e = own ? e1Of(l, k) || own : isNum(est[k]) ? est[k] : null; if (!isNum(e)) return; if (first || !own) p.a[k] = safeOf(l, k, e); });
    if (first) p.preset = 'safe';
    return p;
  }
  OPS.settingsC = function (a) {
    var before = ST.settings ? clone(ST.settings) : null, next = ST.settings ? clone(ST.settings) : {};
    Object.keys(a.patch).forEach(function (k) { next[k] = clone(a.patch[k]); }); ST.settings = next;
    var said = Object.keys(a.patch).map(function (k) { return k === 'intakeQs' ? 'your intake questions' : 'the heads-up before a payment'; });
    return { changed: true, kind: 'settings', persist: true, data: { keys: Object.keys(a.patch) }, keys: Object.keys(a.patch).map(function (k) { return 'settings:' + k; }), ids: [], events: [['settings:changed', { keys: Object.keys(a.patch) }]],
      undo: function () { ST.settings = before; }, label: 'Saved: ' + K.list(said, 4) + '.', undoLabel: 'Back as it was: ' + K.list(said, 4) + '.' };
  };
  /* "Back on Sat 14 Nov, 09:00": the snoozed row's words (coach.js's later act says the same) */
  function snoozeWords(rm) { var on = String(rm.on || ''); return 'Back on ' + dmyOf(day10(on)) + (on.length > 10 ? ', ' + on.slice(11, 16) : ''); }

  /* --- the ops --- */
  /* a lifter added: invited (a.by 'invite', no intake until they join) or by hand (a.by 'hand', the intake typed) */
  OPS.madeAdd = function (a) {
    if (K.L(a.lid)) return fail('conflict', words0(a.name) + ' is on your desk already.');
    var l = madeRecord(a), s0 = ST.samples;
    if (a.sample != null) { if (ST.samples <= a.sample) ST.samples = a.sample + 1; var sm = (D.sampleIntakes || [])[a.sample]; if (sm && sm.sex && !l.sex) l.sex = sm.sex; }
    if (a.bill) { l.billing = { pkg: a.bill.pkg, amount: a.bill.amount, cur: a.bill.currency || 'USD', cadence: a.bill.cadence, nextDue: a.bill.firstDue, firstDue: a.bill.firstDue, status: null, note: '' }; l.billing.status = statusFor(l.billing); }
    putMade(l);
    var first = l.first, inv = a.by === 'invite';
    return { changed: true, kind: 'lifter', persist: true, data: { id: l.id, lifterId: l.id, name: l.name, code: a.code, link: 'powalifta.com/j/' + a.code, url: 'https://powalifta.com/j/' + a.code, inviteId: inv ? a.iid : null, emailed: !!(inv && a.email) },
      keys: ['lifter:' + l.id, 'name:' + l.name.toLowerCase()], ids: [l.id], events: [['lifter:added', { id: l.id, by: a.by }]].concat(inv ? [['invite:changed', { id: a.iid, state: 'invited' }]] : [], [['setup:changed', {}]]),
      undo: function () { dropMadeOne(l); ST.samples = s0; },
      label: inv ? (a.email ? 'Invite emailed to ' + first + '.' : l.name + ' invited. Link copied.') : l.name + ' added.',
      undoLabel: inv ? 'Invite to ' + first + ' taken back.' : l.name + ' is off your desk.' };
  };
  /* the invite again (FTC §3.3: no undo; the preview sends nothing, the row says what the real app sends) */
  OPS.inviteResend = function (a) {
    var l = L(a.lid); if (!l || !l.made || !l.made.invite) return fail('not_found', 'There is no invite like that.');
    var prev = l.made.resent; l.made.resent = localIso(tOf(a.at));
    return { changed: true, kind: 'invite', persist: true, data: { id: l.made.invite, lifterId: l.id, email: l.made.email }, keys: ['resend:' + l.id + ':' + a.at], ids: [l.id], events: [['invite:changed', { id: l.made.invite, state: 'invited' }]],
      undo: function () { l.made.resent = prev; }, label: 'Invite sent again to ' + l.made.email + '.' };
  };
  /* an invite cancelled: the invited lifter leaves every list; Undo puts them back where they were */
  OPS.inviteCancel = function (a) {
    var l = L(a.lid); if (!l || !l.made || !l.made.invite) return fail('not_found', 'There is no invite like that.');
    if (l.intake) return fail('conflict', l.first + ' has joined already.');
    var at = dropMadeOne(l);
    return { changed: true, kind: 'invite', persist: true, data: { id: l.made.invite, lifterId: l.id }, keys: ['lifter:' + l.id, 'name:' + l.name.toLowerCase()], ids: [l.id], events: [['invite:changed', { id: l.made.invite, state: 'cancelled' }], ['setup:changed', {}]],
      undo: function () { putMade(l, at); }, label: 'Invite to ' + l.first + ' cancelled.', undoLabel: 'Invite to ' + l.first + ' is back.' };
  };
  /* the demo plays the lifter (FTC §2.4, §2.5): she joins and answers the next sample intake; intake.at is the moment */
  OPS.demoJoin = function (a) {
    var l = L(a.lid); if (!l || !l.made || !l.made.invite) return fail('not_found', 'There is no invite like that.');
    if (l.intake) return fail('conflict', l.first + ' has joined already.');
    var s = (D.sampleIntakes || [])[a.sample]; if (!s) return fail('not_found', 'The demo has no answers left for ' + l.first + '.');
    var ik = clone(s); delete ik.session; ik.at = localIso(tOf(a.at)); ik.by = 'lifter';
    var prevSex = l.sex, prevS = l.made.sample, s0 = ST.samples;
    l.intake = ik; l.sex = s.sex || l.sex; l.made.joined = ik.at; l.made.sample = a.sample; if (ST.samples <= a.sample) ST.samples = a.sample + 1;
    return { changed: true, kind: 'lifter', persist: true, data: { id: l.made.invite, lifterId: l.id, state: 'joined' }, keys: ['lifter:' + l.id, 'join:' + l.id], ids: [l.id], events: [['invite:changed', { id: l.made.invite, state: 'joined' }], ['setup:changed', {}]],
      undo: function () { l.intake = null; l.sex = prevSex; l.made.joined = null; l.made.sample = prevS; ST.samples = s0; }, label: l.first + ' joined and answered your intake.' };
  };
  /* the coach read a lifter's intake (Getting started step 2): no toast, no undo */
  OPS.intakeSeen = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    if (ST.intakeSeen[l.id]) return { changed: false, data: { id: l.id, at: ST.intakeSeen[l.id] } };
    ST.intakeSeen[l.id] = localIso(tOf(a.at));
    return { changed: true, kind: 'lifter', persist: true, data: { id: l.id, at: ST.intakeSeen[l.id] }, keys: ['intakeseen:' + l.id], ids: [l.id], events: [['setup:changed', {}]], undo: function () { delete ST.intakeSeen[l.id]; }, label: '' };
  };
  /* Getting started: hidden, shown again, or step 5's Got it */
  OPS.setup = function (a) {
    var S0 = ST.setup, prev = clone(S0), at = localIso(tOf(a.at));
    if (a.what === 'hide') { S0.hidden = at; S0.shown = null; }
    else if (a.what === 'show') { S0.shown = at; S0.hidden = null; }
    else if (a.what === 'watched') S0.watched = at;
    else return fail('invalid', 'Getting started can be hidden, shown or watched.');
    return { changed: true, kind: 'setup', persist: true, data: clone(S0), keys: ['setup:' + a.what], ids: [], events: [['setup:changed', { what: a.what }]],
      undo: function () { ST.setup = prev; }, label: a.what === 'hide' ? 'Getting started hidden. Type help in Find to bring it back.' : a.what === 'show' ? 'Getting started is back on Overview.' : '',
      undoLabel: a.what === 'hide' ? 'Getting started is back.' : a.what === 'show' ? 'Getting started hidden again.' : 'Week one is back on the list.' };
  };
  /* weeks of a block sent in one write (FTC §7.4, FP F4.2): "Weeks 1 to 4 sent to Jess.", one Undo (PL.programs.sendMany;
     OPS.sendMany is Messages' own) */
  OPS.weeksSend = function (a, ctx) {
    var l = L(a.id); if (!l || !l.program) return fail('not_found', 'There is no program to send from.');
    var undos = [], keys = [], items = [], drafts0 = [], events = [];
    for (var i = 0; i < a.weeks.length; i++) {
      var r = OPS.programSend(a.weeks[i], ctx);
      if (!r || r.error) { chain(undos)(); return r && r.error ? r : fail('invalid', 'Week ' + a.weeks[i].n + ' could not be sent.'); }
      undos.push(r.undo); keys = keys.concat(r.keys || []); items = items.concat(r.items || []); drafts0 = drafts0.concat(r.drafts || []);
      (r.events || []).forEach(function (e) { if (e[0] !== 'program:sent') events.push(e); });
    }
    var ns = a.weeks.map(function (x) { return x.n; }), span = ns.length > 1 ? 'Weeks ' + ns[0] + ' to ' + ns[ns.length - 1] : 'Week ' + ns[0], off = offApp(l);
    return { changed: true, kind: 'program', persist: true, drafts: uniq(drafts0), data: { id: l.id, weeks: ns, held: false, notOnApp: off ? { text: off.text, link: off.link, url: off.url, label: off.label } : null }, keys: uniq(keys), items: uniq(items), ids: [l.id].concat(uniq(items)),
      events: [['program:sent', { id: l.id, n: ns[0], ns: ns }]].concat(events), undo: chain(undos), label: span + ' sent to ' + l.first + '.' + (off ? ' ' + off.toast : ''),
      undoLabel: function () { var seen = ns.some(function (k) { return !!ST.weekSeen[l.id + ':' + k]; }); return seen ? span + ' taken back from ' + l.first + '.' : span + (ns.length > 1 ? ' are' : ' is') + ' back with you. ' + l.first + ' never saw ' + (ns.length > 1 ? 'them' : 'it') + '.'; } };
  };
  /* the first package, set on a lifter, the words sent: one write (FTC §10.2) */
  OPS.charge = function (a) {
    var l = L(a.id); if (!l) return noLifter(a.id);
    var undos = [], keys = [], events = [], made = null;
    if (a.save) { var r0 = OPS.bill2(a.save); if (!r0 || r0.error) return r0 || fail('invalid', 'That package could not be saved.'); undos.push(r0.undo); keys = keys.concat(r0.keys || []); made = a.save.name; }
    var r1 = OPS.bill2(a.set); if (!r1 || r1.error) { chain(undos)(); return r1 || fail('invalid', 'That price could not be set.'); }
    undos.push(r1.undo); keys = keys.concat(r1.keys || []); (r1.events || []).forEach(function (e) { events.push(e); });
    var b = l.billing, said = l.first + ': ' + price(b) + (b.cadence === 'once' ? ', due ' : ' from ') + dmyOf(a.set.firstDue) + '.' + (a.set.note ? ' Sent to ' + l.first + ': “' + a.set.note + '”' : '');
    return { changed: true, kind: 'billing', persist: true, data: { id: l.id, billing: clone(b), package: made }, keys: uniq(keys), ids: [l.id], events: events.length ? events : [['billing:changed', { id: l.id, what: 'charge' }]],
      undo: chain(undos), label: said, undoLabel: l.first + ' is free again.' + (made ? ' ' + made + ' is removed.' : '') };
  };
  /* the weeks between a block and the next one, written by each line's own step (FP F1.5); dated on the block's days */
  OPS.fillGap = function (a, ctx) {
    var l = L(a.id), Bk = BLK(); if (!l || !l.program) return fail('not_found', 'No program to fill.');
    var before = drafts[l.id] ? clone(drafts[l.id]) : null;
    if (!(ctx && ctx.replay && a.drafted && drafts[l.id])) {
      if (!Bk) return fail('invalid', 'Filling a gap needs block.js on the page.');
      var b; try { b = Bk.from(before || programAnswer(l).data); } catch (e) { return fail('invalid', 'That program cannot be read.'); }
      for (var i = 0; i < a.weeks; i++) { var r = b.addWeek(); if (r && r.error) return { error: r.error }; }
      drafts[l.id] = b.toJSON(); a.drafted = true;
    }
    return { changed: true, kind: 'program', persist: true, drafts: [l.id], data: { id: l.id, weeks: a.weeks, from: a.from, to: a.to }, keys: ['fill:' + l.id, 'change:' + l.id + ':' + a.at], ids: [l.id], events: [['program:saved', { id: l.id }]],
      undo: function () { if (before) drafts[l.id] = before; else delete drafts[l.id]; }, label: a.label, undoLabel: a.undoLabel || 'The ' + (a.weeks === 1 ? 'week' : a.weeks + ' weeks') + ' between are taken out.' };
  };
  /* every line about a full RPE off what is written in week n, set by its RPE (FP F4.1): one write, one Undo */
  OPS.letRpe = function (a, ctx) {
    var l = L(a.id), Bk = BLK(); if (!l || !l.program) return fail('not_found', 'No program to change.');
    var before = drafts[l.id] ? clone(drafts[l.id]) : null;
    if (!(ctx && ctx.replay && a.drafted && drafts[l.id])) {
      if (!Bk) return fail('invalid', 'Setting loads by RPE needs block.js on the page.');
      var b; try { b = Bk.from(before || programAnswer(l).data); } catch (e) { return fail('invalid', 'That program cannot be read.'); }
      var c = a.n - 1, w = b.weeks[c]; if (!w) return fail('not_found', 'There is no week ' + a.n + '.');
      var moved = rpeLines(b, c, a.rows);
      if (!moved.length) return fail('invalid', 'Nothing in week ' + a.n + ' is off what you wrote.');
      var cr = b.commit('Let RPE set ' + moved.length + ' lines', function () {
        var self = this; moved.forEach(function (x) { var y = {}, cell = self.rows[x.r].cells[w.uid]; Object.keys(cell).forEach(function (k) { if (k !== 'w' && k !== 'wHi') y[k] = cell[k]; }); self.put(x.r, c, y); });
        return { data: { lines: moved.length } };
      });
      if (cr && cr.error) return { error: cr.error };
      drafts[l.id] = b.toJSON(); a.drafted = true; a.moved = moved.map(function (x) { return { key: x.key, name: x.name, was: x.was, now: b.load(x.r, c).kg }; });
    }
    var mv = a.moved || [], f = mv[0], said = mv.length + (mv.length === 1 ? ' line' : ' lines') + ' set by RPE in ' + l.first + '’s week ' + a.n + '.' + (f ? ' ' + f.name + ' ' + n(f.was) + ' → ' + n(f.now) + (mv.length > 1 ? ' and ' + (mv.length - 1) + ' more' : '') + '.' : '');
    return { changed: true, kind: 'program', persist: true, drafts: [l.id], data: { id: l.id, n: a.n, lines: mv.length, moved: clone(mv) }, keys: ['change:' + l.id + ':' + a.at], ids: [l.id], events: [['program:saved', { id: l.id }]],
      undo: function () { if (before) drafts[l.id] = before; else delete drafts[l.id]; }, label: said, undoLabel: 'Week ' + a.n + ' is back as you wrote it.' };
  };
  /* the lines a week's heavy and light checks flag, and the lines of the same lift that day that follow them (the grid's
     "Let RPE set it", week.js rpeSetsLift, for the whole week) */
  function rpeLines(b, c, only) {
    var w = b.weeks[c], out = [], seen = {}, ck = [];
    try { ck = b.checks(c).filter(function (q) { return q.kind === 'heavy' || q.kind === 'light'; }); } catch (e) { ck = []; }
    if (Array.isArray(only) && only.length) ck = ck.filter(function (q) { var row = b.rows[q.r]; return row && only.indexOf(row.key) >= 0; });
    var add = function (r) {
      var row = b.rows[r], cell = row && row.cells[w.uid]; if (!row || seen[row.key] || !cell || cell.lifted || cell.rpe == null || cell.w == null) return;
      var y = {}; Object.keys(cell).forEach(function (k) { if (k !== 'w' && k !== 'wHi') y[k] = cell[k]; });
      var by = null; try { by = b.loadFor(r, c, y); } catch (e) { by = null; }
      if (!by || !isNum(by.kg) || by.kg === cell.w) return;
      seen[row.key] = 1; out.push({ r: r, key: row.key, name: row.name + (row.line ? ' back-offs' : ''), was: cell.w });
    };
    ck.forEach(function (q) {
      add(q.r);
      var row = b.rows[q.r], top = row && row.line && typeof b.topRow === 'function' ? b.topRow(row) : row;
      b.rows.forEach(function (x, i) { var t = x.line && typeof b.topRow === 'function' ? b.topRow(x) : x; if (t === top && x.day === row.day) add(i); });
    });
    out.sort(function (x, y) { return x.r - y.r; });
    return out;
  }
  /* the next block after a meet with the recovery week in front (FP F2.6, FD6): the recovery week, then the template
     after it, one write and one Undo */
  OPS.nextPair = function (a, ctx) {
    var r0 = OPS.nextBlock(a.rec, ctx); if (!r0 || r0.error) return r0 || fail('invalid', 'The recovery week could not be written.');
    var r1 = OPS.nextBlock(a.tpl, ctx); if (!r1 || r1.error) { r0.undo(); return r1 || fail('invalid', 'The template could not follow the recovery week.'); }
    return { changed: true, kind: 'program', persist: true, nexts: uniq((r0.nexts || []).concat(r1.nexts || [])), data: { id: a.rec.id, recovery: true, startsOn: a.rec.startsOn, template: a.tpl.name, from: a.tplFrom }, keys: ['next:' + a.rec.id], ids: [a.rec.id], events: [['program:saved', { id: a.rec.id }]],
      undo: chain([r0.undo, r1.undo]), label: a.label, undoLabel: a.undoLabel };
  };

  /* ================= replay and restore ================= */
  function replay(list) {
    if (!Array.isArray(list)) return false;
    var dirty = false, prevCap = capture; capture = []; inWrite = true;
    try {
      list.forEach(function (r) {
        if (!r || !isStr(r.op) || !OPS[r.op] || !r.a || typeof r.a !== 'object') { dirty = true; return; }
        dayOn(isStr(r.at) ? tOf(r.at) : isStr(r.a.at) ? tOf(r.a.at) : NaN);
        var res; try { res = OPS[r.op](r.a, { replay: true }); } catch (e) { res = null; }
        if (!res || res.error || !res.changed) { if (!BLK() && (!res || res.error)) { PENDING.push({ r: r }); return; } dirty = true; return; }
        syncNew();
        if (isStr(r.a.at)) sawStamp(r.a.at); if (isStr(r.at) && tOf(r.at) > lastStamp) lastStamp = tOf(r.at);
        LOG.push({ at: isStr(r.at) ? r.at : isStr(r.a.at) ? localIso(tOf(r.a.at)) : null, t: isStr(r.t) ? r.t : newToken(), op: r.op, a: r.a, kind: res.kind || r.op, keys: res.keys || [], items: res.items || [], undo: res.undo, persist: true, label: res.label || '', undoLabel: res.undoLabel || null, ids: uniq(res.ids || []), events: res.events || [], undoEvents: res.undoEvents || (res.events || []).slice(), drafts: res.drafts || [], nexts: res.nexts || [], hist: res.hist || [] });
      });
    } finally { inWrite = false; capture = prevCap; }
    return dirty;
  }
  function restoreDone(o) {
    Object.keys(C.state.done).forEach(function (k) { delete C.state.done[k]; });
    if (o && typeof o === 'object' && !Array.isArray(o)) Object.keys(o).forEach(function (k) { var e = o[k]; if (C.get(k) && e && typeof e === 'object' && isStr(e.act)) { C.state.done[k] = e; if (isStr(e.at)) sawStamp(e.at); } });
  }
  var LATE_DRAFTS = [];
  function loadDrafts() {
    drafts = {}; nextDrafts = {}; LATE_DRAFTS = [];
    sKeys().forEach(function (k) {
      if (k.indexOf(KEY_BLOCK) !== 0) return; var id = k.slice(KEY_BLOCK.length), nx = /:next$/.test(id), o = parseJSON(sGet(k)); if (nx) id = id.slice(0, -5);
      if (!(o && typeof o === 'object' && !Array.isArray(o) && Array.isArray(o.weeks))) return;
      if (K.L(id)) { if (nx) nextDrafts[id] = o; else drafts[id] = o; }
      /* FIX-LOGIC (FC-22): a lifter added on this desk exists only once the replay has made them: their saved block waits */
      else LATE_DRAFTS.push({ id: id, nx: nx, o: o });
    });
  }
  function lateDrafts() { LATE_HIST.forEach(function (id) { var l = K.L(id); if (l && l.made && !HIST[id]) readHist(id, sGet(KEY_UNDO + id)); }); LATE_HIST = []; lateDrafts0(); }
  function lateDrafts0() { LATE_DRAFTS.forEach(function (x) { var l = K.L(x.id); if (!l || !l.made) return; if (x.nx) { if (!nextDrafts[x.id]) nextDrafts[x.id] = x.o; } else if (!drafts[x.id]) drafts[x.id] = x.o; }); LATE_DRAFTS = []; }
  function resetDemo() {
    var wasW = inWrite; inWrite = true; try { dropMade(); } finally { inWrite = wasW; }   /* spec C: the desk's own lifters, rebuilt by the replay */
    var P = JSON.parse(PRISTINE);
    D.lifters.forEach(function (l, i) { var src = P.lifters[i]; Object.keys(l).forEach(function (k) { delete l[k]; }); Object.keys(src).forEach(function (k) { l[k] = src[k]; }); });
    if (D.team && P.team) { Object.keys(D.team).forEach(function (k) { delete D.team[k]; }); Object.keys(P.team).forEach(function (k) { D.team[k] = P.team[k]; }); }
    if (D.coach && P.coach) { Object.keys(D.coach).forEach(function (k) { delete D.coach[k]; }); Object.keys(P.coach).forEach(function (k) { D.coach[k] = P.coach[k]; }); }
    if (P.rules) D.rules = P.rules; delete D.rulesBy;
  }
  function boot() {
    loadDrafts(); loadHist();
    LOG = []; ST = freshST(); PENDING = []; dayReset();
    var edits = parseJSON(sGet(KEY_EDITS)), dirty = replay(edits);
    lateDrafts();
    restoreDone(parseJSON(sGet(KEY_DONE)));
    lastDoneJSON = JSON.stringify(C.state.done);
    lastEditsJSON = sGet(KEY_EDITS);
    if (dirty && edits) persistEdits();
    dayOn();
    syncNew();
    /* a replayed write may read the model before block.js is on the page: nothing read during the replay is kept */
    memo = {};
  }
  boot();
  /* block.js arrived after this file (lifters.html loads it later): the writes that waited for it run now, in order */
  function onBlock() {
    if (!PENDING.length || !BLK() || inWrite) return false;
    flushHeld(); resetDemo(); boot(); bump();
    emit('change', { type: 'replay', ids: [], v: v, undone: false });
    return true;
  }
  /* someone else wrote: another frame or tab on the same storage */
  W.addEventListener('storage', function (e) {
    if (!e) return;
    if (e.storageArea && SS && e.storageArea !== SS) return;
    var k = e.key;
    if (k !== null && (!isStr(k) || k.indexOf(PFX) !== 0)) return;
    if (k === KEY_DONE) { restoreDone(parseJSON(e.newValue != null ? e.newValue : sGet(KEY_DONE))); lastDoneJSON = JSON.stringify(C.state.done); }
    else if (k !== null && k.indexOf(KEY_BLOCK) === 0) { var id = k.slice(KEY_BLOCK.length), nx = /:next$/.test(id), box = nx ? nextDrafts : drafts, o = parseJSON(e.newValue); if (nx) id = id.slice(0, -5); if (o && typeof o === 'object' && Array.isArray(o.weeks)) box[id] = o; else delete box[id]; }
    else if (k !== null && k.indexOf(KEY_UNDO) === 0) { var hid = k.slice(KEY_UNDO.length); if (K.L(hid)) readHist(hid, e.newValue); }
    else { flushHeld(); resetDemo(); boot(); }
    bump();
    emit('change', { type: 'storage', ids: [], v: v, key: k });
  });
  /* leaving the page sends what is held behind a toast (the coach pressed Send; only Undo keeps it back) */
  W.addEventListener('pagehide', function () { flushHeld(); });
  /* a move done straight through COACH (C.run, C.undo) still reaches every count */
  C.on(function () {
    if (inWrite) return;
    var s = JSON.stringify(C.state.done); if (s === lastDoneJSON) return;
    bump(); persistDone();
    emit('change', { type: 'coach', ids: [], v: v });
  });

  /* ================= validation helpers ================= */
  function bad(message, field) { return fail('invalid', message, field ? [{ field: field, message: message }] : undefined); }
  function liftOk(lift) { return LIFTS.indexOf(lift) >= 0; }
  function kgOk(kg, lo, hi) { return isNum(kg) && kg >= lo && kg <= hi && step25(kg); }

  /* ================= the API ================= */
  var PL = {
    __store: true, version: function () { return v; }, hooks: hooks,
    on: on,
    /* block.js calls this when it loads after the store: writes the replay kept for it run now (true when any did) */
    __onBlock: function () { return onBlock(); },
    undo: function (token) { return undoToken(token); },
    /* the toast for a write's answer: its label with Undo (a page helper, so every move reads the same) */
    toast: function (res) { if (!res || !res.meta || !res.meta.label) return false; var t = res.meta.undo; deliver({ text: res.meta.label, undo: t ? function () { return PL.undo(t); } : null, token: t || null }); return true; },

    counts: function () {
      return sel('counts', undefined, function () {
        var M = model(), needs = PL.roster.needs().data, th = threadList(), ch = PL.roster.charts().data, pr = programRows(), mo = money(), td = todoRows();
        return { data: {
          lifters: M.rows.length,
          needYou: needs.filter(function (r) { return !r.done; }).length,
          needYouDone: needs.filter(function (r) { return r.done; }).length,
          waitingThreads: th.filter(function (t) { return t.waiting; }).length,
          unreadMessages: th.reduce(function (s, t) { return s + (t.unread || 0); }, 0),
          meetsSoon: ch.meets.list.length,
          meetLifters: ch.meets.lifters.length,
          meetsToday: PL.roster.today().data.meets.length,
          pain: ch.health.pain.length,
          painOrLow: ch.health.pain.length + ch.health.low.length,
          overdue: mo.late.length,
          clientsToDo: td.filter(function (r) { return !r.done; }).length,
          teams: allTeams().length,
          programsToWrite: pr.filter(function (p) { return p.state === 'to-write'; }).length,
          programsToSend: pr.filter(function (p) { return p.state === 'to-send'; }).length,
          /* shared.md §2: the Programs badge is the queue's meta.left (10 at rest) */
          programsDue: queueRows().meta.left,
          doneToday: needs.filter(function (r) { return r.done && isStr(r.done.at) && localIso(tOf(r.done.at)).slice(0, 10) === nowIso().slice(0, 10); }).length + M.rows.filter(function (r) { return r.watchDone && isStr(r.watchDone.at) && localIso(tOf(r.watchDone.at)).slice(0, 10) === nowIso().slice(0, 10); }).length,
          nocheckin: ch.health.none.length,
          trainedSince: sessionsSince((D.coach && D.coach.lastLook) || TODAY).filter(function (x) { return !x.seen; }).length
        } };
      });
    },

    roster: {
      charts: function () {
        return sel('charts', undefined, function () {
          var M = model(), rows = M.rows, wk = D.week;
          var meets = weekMeets().filter(function (m) { return m.days <= 56; }).map(function (m) { return { id: slug(m.meet), name: m.meet, days: m.days, date: K.add(TODAY, m.days), ids: m.ids.slice() }; });
          var mids = []; meets.forEach(function (m) { m.ids.forEach(function (id) { if (mids.indexOf(id) < 0) mids.push(id); }); });
          var RANK = { pain: 0, low: 1, ok: 2, none: 3 }, ef = rows.filter(function (r) { return r.drift != null; }).sort(function (a, b) { return a.drift - b.drift; });
          /* each day's sessions by the one dating rule (Today and the lifter's week read it too): dated that day, not under
             way live; how many of them are done. Today: 3 on the plan, none done yet */
          var byDay = {}, noDay = 0, live = 0;
          rows.forEach(function (r) { var p = prog(r.l); if (!p) return; var ds = sessionDates(r.l, p); Object.keys(ds).forEach(function (k) { var x = ds[k]; if (x.live) { live++; return; } if (x.notLifted) return; if (!x.date) { noDay++; return; } var e = byDay[x.date] || (byDay[x.date] = { planned: 0, done: 0 }); e.planned++; if (x.all && x.done === x.all) e.done++; }); });
          var days7 = wk.days.map(function (d) { var x = byDay[d.iso] || { planned: 0, done: 0 }; return { dow: d.dow, iso: d.iso, n: d.n, prev: d.prev, today: !!d.today, future: !!d.future, planned: x.planned, done: x.done }; });
          /* one rule: done is the sessions done since Monday by the dating rule the bars use (each bar's done adds up to it);
             planned is every lifter's training week (D.week.planned), of which noDay have no day yet and live are under way */
          return { data: {
            training: { done: days7.reduce(function (q, d) { return q + d.done; }, 0), planned: wk.planned, noDay: noDay, live: live, lastDone: wk.lastDone, lastPlanned: wk.lastPlanned, days: days7, behind: (wk.behind || []).slice() },
            strength: { pct: wk.strength.pct, lifts: { squat: wk.strength.lifts.squat, bench: wk.strength.lifts.bench, deadlift: wk.strength.lifts.deadlift }, up: rows.filter(function (r) { return r.chg0 > 0 && !r.stalled; }).map(function (r) { return r.id; }), flat: rows.filter(function (r) { return r.stalled; }).map(function (r) { return r.id; }) },
            effort: { asWrittenPct: Math.round(wk.effort.on / wk.effort.total * 100), harder: rows.filter(function (r) { return r.harder; }).map(function (r) { return r.id; }), perLifter: ef.map(function (r) { return { id: r.id, drift: r.drift, sets: r.driftN }; }) },
            health: { pain: rows.filter(function (r) { return r.h.kind === 'pain'; }).map(function (r) { return r.id; }), low: rows.filter(function (r) { return r.h.kind === 'low'; }).map(function (r) { return r.id; }), ok: rows.filter(function (r) { return r.h.kind === 'ok'; }).map(function (r) { return r.id; }), none: rows.filter(function (r) { return r.h.kind === 'none'; }).map(function (r) { return r.id; }),
              byLifter: rows.slice().sort(function (a, b) { return RANK[a.h.kind] - RANK[b.h.kind]; }).map(function (r) { return { id: r.id, kind: r.h.kind, text: r.h.text }; }) },
            meets: { list: meets, lifters: mids, span: 56 }
          } };
        });
      },
      needs: function () {
        return sel('needs', undefined, function () {
          var M = model();
          var rows = M.needList.map(function (r) {
            var why = r.reasons[0], l = r.l, ctx = ctxOf(r, why || null), dn = r.fix && r.fix.done && !r.openNeed ? r.fix.done : null, zz = !dn ? firstSnooze(l.id) : null;
            if (zz && !(r.fix && r.fix.it && r.fix.it.id === zz.itemId)) zz = null;
            return { id: r.id, name: r.name, first: l.first, ini: l.ini, hue: l.hue, ring: r.ring, reason: why ? { type: why.type, tone: why.t, text: why.w, full: why.full || why.w, pop: why.pop } : null, context: ctx, fix: fixOf(r.fix),
              done: dn ? { label: doneLabel(r.fix.it, dn), at: dn.at || null, act: dn.act, sent: !!dn.text, seenAt: ST.cardSeen[r.fix.it.id] || null } : zz ? { label: snoozeWords(zz), at: zz.at, act: 'later', sent: false, seenAt: null, reminderId: zz.id } : null, snoozed: !!zz };
          });
          /* tier-1 reasons that come from the coach's own record: a due reminder, a change still unseen the evening before
             (shared.md §6.8, §6.10); they lead a lifter's row while open */
          var extra = [];
          dueReminders().forEach(function (rm) {
            /* spec C (FP F4.4): a first-block reminder brings the row back with its own move (the item's main act) */
            var fit = rm.kind === 'first-block' && rm.itemId ? C.get(rm.itemId) : null, fa = fit && !doneOf(fit.id) ? mainAct(fit) : null;
            extra.push({ id: rm.lifterId, reason: { type: 'reminder', tone: 't-msg', text: rm.text, full: rm.text, pop: 'msg' }, context: 'Due ' + (day10(rm.on) === nowIso().slice(0, 10) ? 'today' : K.wd3(day10(rm.on))), fix: fa ? { itemId: fit.id, actId: fa.id, label: fa.label, short: fa.short || fa.label, reminderId: rm.id, go: fa.go ? clone(fa.go) : null } : { itemId: null, actId: null, label: 'Done', short: 'Done', reminderId: rm.id, go: null } });
          });
          unseenMoves().forEach(function (u) { extra.push({ id: u.id, reason: { type: 'unseen', tone: 't-msg', text: u.text, full: u.text, pop: 'msg' }, context: dmyOf(u.iso), fix: { itemId: null, actId: null, label: 'Message ' + K.L(u.id).first, short: 'Message ' + K.L(u.id).first, go: { place: 'messages', hash: 'id=' + u.id } } }); });
          extra.forEach(function (x) {
            var l = K.L(x.id), at = -1; rows.forEach(function (r, i) { if (r.id === x.id) at = i; });
            var row = { id: l.id, name: l.name, first: l.first, ini: l.ini, hue: l.hue, ring: M.R[l.id] ? M.R[l.id].ring : null, reason: x.reason, context: x.context, fix: x.fix, done: null };
            if (at >= 0 && (rows[at].done || rows[at].snoozed)) rows[at] = row; else if (at < 0) rows.push(row);
          });
          /* spec C (FP F10.1): open rows in triage order, then the done rows by the time they were done, so a new row never
             lands under the handled ones; a snoozed row (Do it Saturday) reads as handled until its time comes */
          var open = rows.filter(function (x) { return !x.done; }), shut = rows.filter(function (x) { return !!x.done; });
          shut.sort(function (a, b) { return String(a.done.at || '').localeCompare(String(b.done.at || '')); });
          rows = open.concat(shut).map(function (x) { var y = x; if (y.snoozed !== undefined) { y = clone(x); delete y.snoozed; } return y; });
          return { data: rows };
        });
      },
      /* today: the meet on today, the sessions on the plan for today (a session dated with the day itself), and
         who is lifting right now (a session under way carries the moment it started, not a plan) */
      today: function () {
        return sel('today', undefined, function () {
          var M = model(), ids = [], doneN = 0;
          /* the sessions dated today by the one rule the lifter's week uses (sessionDates), not under way live */
          M.rows.forEach(function (r) { var p = prog(r.l); if (!p) return; var ds = sessionDates(r.l, p), hit = Object.keys(ds).map(function (k) { return ds[k]; }).filter(function (x) { return x.date === TODAY && !x.live && !x.notLifted; })[0]; if (hit) { ids.push(r.id); if (hit.all && hit.done === hit.all) doneN++; } });
          var live = D.lifters.filter(function (l) { return l.live; }).map(function (l) { return { id: l.id, sets: l.liveSets || 0 }; });
          return { data: { meets: weekMeets().filter(function (m) { return m.days === 0; }).map(function (m) { var o = { id: slug(m.meet), name: m.meet, ids: m.ids.slice() }; o.words = meetDayWords(o); return o; }), sessions: { ids: ids, done: doneN, live: live } } };
        });
      },
      /* the latest three threads with unread messages */
      messages: function () {
        return sel('rmsgs', undefined, function () {
          var th = threadList().filter(function (t) { return t.unread > 0; }).slice(0, 3);
          return { data: th.map(function (t) { var l = K.L(t.id), m = (l.messages || []).filter(function (x) { return !x.me; }).slice(-1)[0]; return { id: t.id, name: t.name, type: m ? kindOf(m) : t.last.type, body: m ? m.body : t.last.body, at: m ? m.at : t.last.at, unread: t.unread }; }), meta: { unread: threadList().reduce(function (s, t) { return s + t.unread; }, 0) } };
        });
      }
    },

    lifters: {
      filters: function () { return sel('filters', undefined, function () { var M = model(); return { data: FILTERS.map(function (f) { return { f: f[0], label: f[1], n: M.rows.filter(f[2]).length, tab: TABS.indexOf(f[0]) >= 0 }; }) }; }); },
      list: function (o) {
        o = argObj(o);
        var f = o.f == null || o.f === '' ? 'all' : o.f, q = o.q == null ? '' : String(o.q), sort = o.sort == null || o.sort === '' ? null : o.sort;
        if (!fOf(f)) return bad('There is no list called “' + f + '”. Try ' + FILTERS.map(function (x) { return x[0]; }).join(', ') + '.', 'f');
        if (sort != null && (!isStr(sort) || SORTS.indexOf(sort.replace(/^-/, '')) < 0)) return bad('A list sorts by ' + SORTS.join(', ') + ', with a minus in front for the other way.', 'sort');
        return sel('lifters', { f: f, q: q, sort: sort }, function () {
          var M = model(), flt = fOf(f), qq = q.trim().toLowerCase();
          var list = M.rows.filter(function (r) { var p = prog(r.l); return flt[2](r) && (!qq || (r.name + ' ' + (p ? p.name : 'No program yet') + ' ' + (r.l.meet ? r.l.meet.name : '')).toLowerCase().indexOf(qq) >= 0); });
          if (!sort) list.sort(function (a, b) { return a.tier - b.tier || a.ord - b.ord || a.name.localeCompare(b.name); });
          else {
            var key = sort.replace(/^-/, ''), dir = sort.charAt(0) === '-' ? -1 : 1;
            list.sort(function (a, b) {
              var x = sortVal(a, key), y = sortVal(b, key);
              if (x == null && y == null) return a.name.localeCompare(b.name); if (x == null) return 1; if (y == null) return -1;
              var c = typeof x === 'string' ? x.localeCompare(y) : x - y;
              return c * dir || (key === 'name' ? 0 : a.name.localeCompare(b.name));
            });
          }
          var cnt = {}; FILTERS.forEach(function (x) { cnt[x[0]] = M.rows.filter(x[2]).length; });
          return { data: list.map(function (r) { return listRow(r, f); }), meta: { total: list.length, f: f, q: q, sort: sort, counts: cnt, label: flt[1] } };
        });
      },
      get: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        return sel('lifter', id, function () {
          var M = model(), r = M.R[id], p = prog(l), m = l.meet, lifts = {}, dm = drafts[id] && drafts[id].maxes ? drafts[id].maxes : null;
          LIFTS.forEach(function (k) { var x = liftNow(l, k), e1 = e1Of(l, k), pc = x.delta != null && e1 != null && e1 - x.delta ? x.delta / (e1 - x.delta) * 100 : null; lifts[k] = { e1: e1, was: x.was, delta: x.delta, series: x.series.slice(), pct: pc == null ? null : r1(pc), max: dm && dm[k] && draftTyped(id, k) ? dm[k] : p && p.maxes && p.maxes[k] ? p.maxes[k] : null, set: x.set }; });
          /* the total as the three cards show it (each e1RM to the kilo, added up), and its 12-week line the same way */
          var all = LIFTS.every(function (k) { return lifts[k].e1 != null; }), tser = [];
          for (var i = 0; i < 12; i++) { var a3 = LIFTS.map(function (k) { return lifts[k].series[i]; }); tser.push(a3.every(isNum) ? Math.round(a3[0]) + Math.round(a3[1]) + Math.round(a3[2]) : null); }
          var cut = doneOf('cut-' + l.id), cls = clsOf(l), moved = cut && (cut.act === 'class' || cut.act === 'up') && isNum(cls) && UPCLS[cls] ? UPCLS[cls] : null, now = bwNow(l);
          var bwCls = moved || cls, over = now != null && isNum(bwCls) ? r1(now - bwCls) : l.bw && l.bw.over != null ? l.bw.over : null;
          return { data: { painRecord: painRecord(l), id: l.id, name: l.name, first: l.first, ini: l.ini, hue: l.hue, ring: r.ring, group: r.group,
            /* LOGIC-FIX-4 (walk 2, Hannah "week 0 of 1" over 4 written weeks): of counts the weeks the draft holds too; a block
               not started yet reads week 1 (started false says it has not begun) */
            program: p ? { id: p.id || null, name: p.name, week: Math.max(1, p.weekIdx + 1), of: Math.max(p.weeks.length, drafts[l.id] && Array.isArray(drafts[l.id].weeks) ? drafts[l.id].weeks.length : 0), startsOn: p.startsOn || null, paused: !!p.paused, started: p.weekIdx >= 0 } : null,
            cls: bwCls, meet: m ? { id: meetId(m), name: m.name, days: m.days, date: m.date, cls: m.cls || null, fed: m.fed || null, weighIn: m.weighIn || null, attemptsSet: !!m.attemptsSet } : null,
            lifts: lifts, total: r.tot, totalShown: all ? LIFTS.reduce(function (s, k) { return s + Math.round(lifts[k].e1); }, 0) : null, totalSeries: tser, change: r.chg, reason: reasonOut(statusOf(r)), context: ctxOf(r),
            bw: { now: now, cls: bwCls, over: over, series: bwSeriesOf(l).map(function (x) { return { d: x.d, kg: x.kg }; }), scale: scaleOf(l), cutPlan: !!(cut && (cut.act === 'plan' || cut.act === 'cut')), movedUp: !!moved },
            drift: l.drift ? { avg: l.drift.avg, n: l.drift.n } : null, health: { kind: r.h.kind, tone: r.h.tone, text: r.h.text, sub: r.h.sub }, unread: unreadOf(l),
            reasons: r.reasons.map(function (x) { return { type: x.type, tone: x.t, text: x.w, pop: x.pop }; }), primary: primaryOf(l, r), itemIds: C.forLifter(l.id).filter(function (it) { return !doneBefore(it.id); }).map(function (it) { return it.id; }),
            since: l.since ? new Date(l.since).toISOString().slice(0, 10) : null, ago: l.ago == null ? null : l.ago,
            sex: sexOf(l), handled: handledOf(r), loadMax: maxesInForce(l, lifts, dm) } };
        });
      },
      week: function (id, o) {
        var l = L(id); if (!l) return noLifter(id);
        o = argObj(o); var off = o.offset == null ? 0 : o.offset;
        if (!isNum(off) || off % 1) return bad('offset is a whole number of weeks from this one.', 'offset');
        return sel('week', [id, off], function () {
          var w = weekView(l, off);
          if (!w) return fail('not_found', l.first + '’s program has no week ' + ((l.program ? l.program.weekIdx : 0) + off + 1) + '.');
          return { data: w };
        });
      },
      recovery: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        return sel('recovery', id, function () {
          var hs = (l.health || []).slice(-14), byDay = {};
          hs.forEach(function (x) { byDay[x.d] = { d: x.d, sleep: x.sleep == null ? null : x.sleep, rhr: x.rhr == null ? null : x.rhr, hrv: x.hrv == null ? null : x.hrv, sore: null, pain: null }; });
          (l.answers || []).forEach(function (a) { var e = byDay[a.day] || (byDay[a.day] = { d: a.day, sleep: null, rhr: null, hrv: null, sore: null, pain: null }); if (/sleep/i.test(a.q) && a.num != null && e.sleep == null) e.sleep = a.num; if (/sore/i.test(a.q)) e.sore = a.num == null ? null : a.num; if (/pain/i.test(a.q)) e.pain = !!a.num; });
          var days = Object.keys(byDay).sort().slice(-14).map(function (k) { return byDay[k]; }), rh = hs.map(function (x) { return x.rhr; }).filter(isNum);
          var base = rh.length > 3 ? Math.round(rh.slice(0, -3).reduce(function (s, x) { return s + x; }, 0) / (rh.length - 3)) : null, now = rh.length ? rh[rh.length - 1] : null;
          return { data: { source: hs.length ? 'watch' : (l.answers || []).length ? 'check-ins' : null, days: days, rhr: { now: now, base: base, up: now != null && base != null ? now - base : null }, pain: painOpen(l).map(function (p) { return { day: p.day, part: p.part, sev: p.sev, lift: p.lift || null }; }), health: health(l), checkin: l.checkin ? clone(l.checkin) : null } };
        });
      },
      log: function (id, o) {
        var l = L(id); if (!l) return noLifter(id);
        o = argObj(o); var lift = o.lift == null || o.lift === '' || o.lift === 'all' ? null : o.lift;
        if (lift != null && !liftOk(lift)) return bad('The log filters by squat, bench or deadlift.', 'lift');
        return sel('log', [id, lift], function () {
          var out = (l.logs || []).filter(function (g) { return !lift || g.lift === lift; }).map(function (g) { return { d: g.d, lift: g.lift, title: g.title, w: g.w, r: g.r, rpe: g.rpe == null ? null : g.rpe, e1: g.e1 == null ? null : g.e1, pr: !!g.pr, note: g.note || '' }; });
          out.sort(function (a, b) { return b.d.localeCompare(a.d) || (b.e1 || 0) - (a.e1 || 0); });
          return { data: out, meta: { lift: lift, total: out.length } };
        });
      },
      meets: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        return sel('lmeets', id, function () {
          var m = l.meet;
          return { data: { next: m ? { id: meetId(m), name: m.name, date: m.date, days: m.days, cls: m.cls || null, fed: m.fed || null, weighIn: m.weighIn || null, attemptsSet: !!m.attemptsSet, attempts: clone(planOf(l).a) } : null,
            past: (l.pastMeets || []).slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).map(function (x) { return { name: x.name, date: x.date, s: x.s, b: x.b, d: x.d, total: x.total, cls: x.cls || null, bw: x.bw == null ? null : x.bw, notes: x.notes || '' }; }) } };
        });
      },
      checkins: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        return sel('checkins', id, function () {
          var by = {}; (l.answers || []).forEach(function (a) { (by[a.day] = by[a.day] || []).push({ q: a.q, kind: a.kind, num: a.num == null ? null : a.num, text: a.text == null ? null : a.text }); });
          return { data: { summary: checkinSummary(l), pain: painRecord(l), weekly: l.checkin ? [clone(l.checkin)] : [], daily: Object.keys(by).sort().reverse().map(function (d) { return { day: d, answers: by[d] }; }), questions: (D.questions || []).map(function (q) { return { prompt: q.prompt, kind: q.kind, cadence: q.cadence }; }) } };
        });
      },
      notes: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        return sel('notes', id, function () {
          var mine = (l.coachNotes || []).map(function (t) { return { text: String(t), at: null, mine: true }; }).concat((ST.notes[l.id] || []).map(function (x) { return { text: x.text, at: x.at, mine: true }; }));
          return { data: { private: mine, sessions: (l.notes || []).map(function (x) { return { date: x.date, note: x.note, reply: x.reply || '' }; }) } };
        });
      },
      intake: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        /* the intake as written, plus what the store reads from it: est, the maxes a start would use (the store's one start rule,
           startMaxes: the lifter's own e1RM, else K.e1 of each best set at RPE 10), and bw against the class */
        return sel('intake', id, function () {
          if (!l.intake) return { data: null };
          var out = clone(l.intake), m = startMaxes(l), all = LIFTS.every(function (k) { return m[k] != null; }), bwk = isNum(l.intake.bodyweightKg) ? l.intake.bodyweightKg : null, cls = l.intake.weightClass != null ? parseFloat(l.intake.weightClass) : null;
          out.est = { squat: m.squat, bench: m.bench, deadlift: m.deadlift, total: all ? r1(m.squat + m.bench + m.deadlift) : null, totalShown: all ? Math.round(m.squat) + Math.round(m.bench) + Math.round(m.deadlift) : null, from: LIFTS.every(function (k) { return !(l.lifts && l.lifts[k] && l.lifts[k].e1); }) ? 'intake' : 'lifting' };
          out.bw = { now: bwk, cls: isNum(cls) ? cls : null, over: bwk != null && isNum(cls) ? r1(bwk - cls) : null };
          out.source = srcOf(l);   /* polish-d2: "What you typed" for a lifter added by hand */
          return { data: out };
        });
      },
      setMax: function (id, lift, kg) {
        var l = L(id); if (!l) return noLifter(id);
        if (!liftOk(lift)) return bad('A max is for the squat, the bench or the deadlift.', 'lift');
        if (!kgOk(kg, 20, 600)) return bad('A max is 20 to 600 kg, in 2.5 kg steps.', 'kg');
        if (!l.program) return bad(l.first + ' has no program yet, so there is no max to set.', 'id');
        return commit('setMax', { id: id, lift: lift, kg: kg });
      },
      /* shared.md §6.2: calls moveSessionDay with publish (the lifter's week changes); a missed session may move to a day to come */
      moveSession: function (id, idx, iso, o) {
        var l = L(id); if (!l) return noLifter(id);
        if (!isIso(iso)) return bad('A day is a date like 2026-11-12.', 'date');
        var p = l.program; if (!p || !p.weeks[p.weekIdx]) return fail('not_found', l.first + ' has no sessions this week.');
        var w = weekView(l, 0), s = w && w.sessions.filter(function (x) { return x.idx === idx; })[0];
        if (!s) return fail('not_found', 'That session is not in ' + l.first + '’s week.');
        if (s.state === 'done' || s.state === 'part') return fail('locked', s.name + ' is lifted already.');
        if (iso < TODAY) return bad('That day has passed. Pick today or a day to come.', 'date');
        o = argObj(o);
        return moveSessionDay(l, p.weekIdx, idx, iso, { scope: o.scope === 'on' ? 'on' : 'week', publish: true });
      },
      decide: function (id, rowKey, how) {
        var l = L(id); if (!l) return noLifter(id);
        if (how !== 'use' && how !== 'keep') return bad('Decide with “use” or “keep”.', 'how');
        var x = rowOfKey(l, rowKey); if (!x) return fail('not_found', 'There is no row ' + rowKey + ' in ' + l.first + '’s week.');
        var row = x.row; if (!row.suggest) return bad('There is no suggestion on that row to use or keep.', 'key');
        if (!row.next) return bad('Nothing is written after this week yet.', 'key');
        var ov = overRowOf(l), it = C.get('over-' + l.id), isOver = !!(ov && it && !doneOf(it.id) && x.k.wi === l.program.weekIdx && ov.day === x.day && ov.title === x.title && ov.target.r === row.written.r && ov.target.rpe === row.written.rpe);
        if (how === 'use' && isOver) return PL.items.run(it.id, 'rule', { tell: false });
        if (how === 'keep') {
          var nm = l.first + '’s ' + lower1(row.name), nx = row.next, rx = nx.w ? n(nx.w) + ' × ' + nx.r + (nx.rpe != null ? ' @' + n(nx.rpe) : '') : nx.r + (nx.rpe != null ? ' @' + n(nx.rpe) : '') + (nx.kg ? ', about ' + n(nx.kg) : '');
          return commit('keep', { id: id, key: rowKey, kg: nx.w || null, at: stamp(), itemId: isOver ? it.id : null, say: nm + ' next week stays ' + rx + ', as written.', undoSay: nm + ' next week is open again: use the suggestion or keep it.' });
        }
        return commit('next', { id: id, wi: x.k.wi + 1, day: x.day, title: x.title, occ: x.occ, gi: x.k.gi, w: row.suggest.kg, how: 'use', key: rowKey, at: stamp(), follow: true });
      },
      setNext: function (id, rowKey, o, o2) {
        var l = L(id); if (!l) return noLifter(id);
        o = argObj(o);
        var x = rowOfKey(l, rowKey); if (!x) return fail('not_found', 'There is no row ' + rowKey + ' in ' + l.first + '’s week.');
        /* a row of a week to come (lifters.week offset 1 and on) is that week's own line: the write lands in it (QA-SCREENS M10:
           Elena's single on Tue 17 Nov); a row of this week writes the week after it */
        var own = x.k.wi > l.program.weekIdx, rx0 = own ? x.row.written : x.row.next;
        if (!rx0) return bad('Nothing is written after this week yet.', 'key');
        var w = o.w == null ? 0 : o.w, r = o.r == null ? rx0.r : o.r, rpe = o.rpe === undefined ? rx0.rpe : o.rpe;
        if (!isNum(w) || w < 0 || w > 1000) return bad('A load is 0 (by RPE) to 1000 kg.', 'w');
        if (!isNum(r) || r % 1 || r < 1 || r > 30) return bad('Reps are a whole number from 1 to 30.', 'r');
        if (rpe != null && (!isNum(rpe) || rpe < 1 || rpe > 10 || (rpe * 2) % 1)) return bad('RPE runs from 1 to 10, in halves.', 'rpe');
        var sc = o2 && o2.scope === 'week' ? false : true;
        /* request #27: on the rule item's row the write settles that item too (one write, one Undo) */
        var rit = x.row && isStr(x.row.rule) && C.get(x.row.rule) && !doneOf(x.row.rule) ? x.row.rule : undefined;
        return commit('next', { id: id, wi: own ? x.k.wi : x.k.wi + 1, day: x.day, title: x.title, occ: x.occ, gi: x.k.gi, w: w, r: r, rpe: rpe == null ? null : rpe, how: 'set', key: rowKey, at: stamp(), follow: w > 0 ? (sc ? true : undefined) : undefined, itemId: rit });
      },
      addNote: function (id, text) {
        var l = L(id); if (!l) return noLifter(id);
        var t = isStr(text) ? text.trim() : ''; if (!t) return bad('A note needs words.', 'text');
        return commit('addNote', { id: id, text: t, at: stamp() });
      },
      /* a load on a line of this week's sessions still to come: 0 to 1000 kg in 2.5 kg steps (0: worked out again) */
      setLoad: function (id, rowKey, kg) {
        var l = L(id); if (!l) return noLifter(id);
        var x = rowOfKey(l, rowKey); if (!x) return fail('not_found', 'There is no row ' + rowKey + ' in ' + l.first + '’s week.');
        if (x.k.wi !== l.program.weekIdx) return bad('A load set here is for this week. Write the weeks after it in the Builder.', 'key');
        var s = weekView(l, 0).sessions.filter(function (q) { return q.idx === x.k.di; })[0];
        if (s && (s.state === 'done' || s.state === 'part')) return fail('locked', s.name + ' is lifted already.');
        if (!kgOk(kg, 0, 1000)) return bad('A load is 0 (worked out by RPE) to 1000 kg, in 2.5 kg steps.', 'kg');
        return commit('load', { id: id, wi: x.k.wi, day: x.day, title: x.title, occ: x.occ, gi: x.k.gi, w: kg, key: rowKey, at: stamp() });
      },
      /* several lines at once: { rowKey: kg, ... }, each as setLoad checks it; one write, one Undo, one label. One line refused
         refuses them all (details name it) */
      setLoads: function (id, map) {
        var l = L(id); if (!l) return noLifter(id);
        if (!map || typeof map !== 'object' || Array.isArray(map)) return bad('Give the loads as { rowKey: kg }.', 'loads');
        var keys0 = Object.keys(map); if (!keys0.length) return bad('Give at least one line’s load.', 'loads');
        var lines = [], said = [], days = [], wv = weekView(l, 0);
        for (var i = 0; i < keys0.length; i++) {
          var k = keys0[i], kg = map[k], x = rowOfKey(l, k);
          if (!x) return fail('not_found', 'There is no row ' + k + ' in ' + l.first + '’s week.', [{ field: k, message: 'No such row.' }]);
          if (x.k.wi !== l.program.weekIdx) return fail('invalid', 'A load set here is for this week. Write the weeks after it in the Builder.', [{ field: k, message: 'Not this week.' }]);
          var se = wv.sessions.filter(function (q) { return q.idx === x.k.di; })[0];
          if (se && (se.state === 'done' || se.state === 'part')) return fail('locked', se.name + ' is lifted already.', [{ field: k, message: 'Lifted already.' }]);
          if (!kgOk(kg, 0, 1000)) return fail('invalid', 'A load is 0 (worked out by RPE) to 1000 kg, in 2.5 kg steps.', [{ field: k, message: 'Not a load.' }]);
          lines.push({ id: id, wi: x.k.wi, day: x.day, title: x.title, occ: x.occ, gi: x.k.gi, w: kg, key: k, at: null });
          said.push(lower1(x.row.name) + (kg ? ' ' + n(kg) + ' kg' : ' by RPE again')); if (days.indexOf(x.day) < 0) days.push(x.day);
        }
        var at = stamp(); lines.forEach(function (q) { q.at = at; });
        var dd = days.length === 1 ? (wv.sessions.filter(function (q) { return q.name === days[0]; })[0] || {}).date : null;
        return commit('loads', { id: id, lines: lines, at: at, say: (days.length === 1 ? days[0] + (dd ? ' on ' + K.wd(dd) : '') + ': ' + K.list(said, 9) : upper1(K.list(said, 9))) + '.', undoSay: l.first + '’s ' + (days.length === 1 ? days[0] + ' is' : 'sessions are') + ' back as they were.' });
      },
      /* a decided row of the week (Use, Keep, Hold) taken back, after a reload too */
      undecide: function (id, rowKey) {
        var l = L(id); if (!l) return noLifter(id);
        var x = rowOfKey(l, rowKey); if (!x) return fail('not_found', 'There is no row ' + rowKey + ' in ' + l.first + '’s week.');
        var d = x.row.decided || x.row.ruled; if (!d) return fail('nothing_to_undo', 'Nothing is decided on that row.');
        if (d.undo) return undoToken(d.undo);
        if (d.itemId) return PL.items.undo(d.itemId);
        return fail('nothing_to_undo', 'That was decided before this tab opened. Change next week in the Builder.');
      },
      /* the coach's answer to a session note (date: the note's day): on the note and in the thread; the reply its item
         asks for is done with it */
      replyNote: function (id, date, text) {
        var l = L(id); if (!l) return noLifter(id);
        var x = (l.notes || []).filter(function (s) { return s.date === date; }).slice(-1)[0]; if (!x) return fail('not_found', l.first + ' left no note on ' + (isStr(date) ? date : 'that day') + '.');
        var t = isStr(text) ? text.trim() : ''; if (!t) return bad('A reply needs words.', 'text');
        if (x.reply) return fail('conflict', 'That note has an answer already: “' + x.reply + '”');
        var it = C.forLifter(l.id).filter(function (q) { return q.ids.length === 1 && q.group === 'words' && /note/i.test(q.kicker || '') && !doneOf(q.id); })[0];
        var a = it && it.acts.filter(function (q) { return q.reply != null && !q.says && !q.keep; })[0];
        return commit('noteReply', { id: id, date: date, text: t, at: stamp(), ride: a ? { itemId: it.id, actId: a.id } : null });
      }
    },

    items: {
      list: function (o) {
        o = argObj(o);
        if (o.lifter != null && !L(o.lifter)) return noLifter(o.lifter);
        return sel('items', { lifter: o.lifter || null, group: o.group || null, open: o.open == null ? null : !!o.open, now: !!o.now }, function () {
          var list = o.lifter ? C.forLifter(o.lifter) : C.items;
          if (o.group) list = list.filter(function (it) { return it.group === o.group; });
          if (o.open != null) list = list.filter(function (it) { return !!o.open === !doneOf(it.id); });
          if (o.now) list = list.filter(function (it) { return !doneOf(it.id) && !it.later; });
          return { data: list.map(itemOut), meta: { total: list.length } };
        });
      },
      get: function (id) {
        var it = isStr(id) ? C.get(id) : null; if (!it) return fail('not_found', 'There is no item ' + (isStr(id) ? id : '') + '.');
        return sel('item', id, function () { return { data: itemOut(it) }; });
      },
      run: function (itemId, actId, o) {
        var it = isStr(itemId) ? C.get(itemId) : null; if (!it) return fail('not_found', 'There is no item ' + (isStr(itemId) ? itemId : '') + '.');
        var a = actOf(it, actId); if (!a) return fail('not_found', 'That move is not one of this item’s: ' + it.acts.map(function (x) { return x.label; }).join(', ') + '.');
        o = argObj(o);
        /* shared.md §6.1: the words go unless tell is false; tell: false is allowed when the words are not the move itself
           (the act has a silent button); a required tell without text answers invalid with the draft */
        var txt = isStr(o.text) ? o.text.trim() : '', tellOff = o.tell === false, need = tellRequired(a);
        if (a.reply != null && tellOff && need) return fail('invalid', a.label + ' is words: write them first.', [{ field: 'text', message: 'Write the message first.', draft: draftFor(it, a) }]);
        if (a.reply != null && !tellOff && !txt) return fail('invalid', a.label + ' sends words: write them first.', [{ field: 'text', message: 'Write the message first.', draft: draftFor(it, a) }]);
        if (tellOff) txt = '';
        if (o.for != null && it.ids.indexOf(o.for) < 0) return fail('not_found', (K.L(o.for) ? K.L(o.for).first : 'That lifter') + ' is not on this item.');
        if (/^app-/.test(it.id) && a.reply != null) return PL.billing.reply(it.id, txt);   /* a reply first leaves the application open */
        if (a.keep) return ok({ itemId: it.id, actId: a.id, keep: true, open: true, says: a.says || '', go: a.go ? clone(a.go) : null }, { undo: null, label: a.says || a.label });
        var d = doneOf(it.id); if (d) return fail('conflict', 'Already done: ' + doneLabel(it, d) + '. Undo it first.');
        var rem = o.remind && a.remind ? { on: isStr(o.remind.on) && isIso(o.remind.on) ? o.remind.on : a.remind.on, text: isStr(o.remind.text) && o.remind.text.trim() ? o.remind.text.trim() : a.remind.text } : null;
        if (o.edits != null && (typeof o.edits !== 'object' || Object.keys(o.edits).some(function (k) { return !kgOk(o.edits[k], 20, 600); }))) return bad('A load is 20 to 600 kg, in 2.5 kg steps.', 'edits');
        var chs0 = choicesOf(it, a, o.choices), choice = chs0.length && o.choices && typeof o.choices === 'object' && chs0[0].options.some(function (x) { return x.value === o.choices.scope; }) ? { scope: o.choices.scope } : undefined;
        if (o.choices != null && (typeof o.choices !== 'object' || (o.choices.scope != null && !choice))) return bad('That choice is not one this move offers.', 'choices');
        if (o.sendWeek && landsOf(it, a) !== 'draft') return bad('This move changes a week ' + (K.L(it.ids[0]) ? K.L(it.ids[0]).first : 'they') + ' has already: nothing else to send.', 'sendWeek');
        return commit('item', { itemId: it.id, actId: a.id, text: txt || null, at: stamp(), choices: choice, sendWeek: o.sendWeek ? true : undefined, quiet: tellOff && a.reply != null ? true : undefined, remind: rem || undefined, for: o.for || undefined, edits: o.edits ? clone(o.edits) : undefined, swap: o.edits ? editSwap(it, a, o.edits) || undefined : undefined }, { toast: true });
      },
      undo: function (itemId) {
        var it = isStr(itemId) ? C.get(itemId) : null; if (!it) return fail('not_found', 'There is no item ' + (isStr(itemId) ? itemId : '') + '.');
        for (var i = LOG.length - 1; i >= 0; i--) if (LOG[i].items.indexOf(it.id) >= 0) return undoToken(LOG[i].t);
        if (doneOf(it.id)) return commit('itemClear', { itemId: it.id });
        return fail('nothing_to_undo', 'Nothing to undo: ' + it.title + ' is still open.');
      }
    },

    programs: {
      list: function (o) {
        o = argObj(o);
        var q = o.q == null ? '' : String(o.q), sort = o.sort == null || o.sort === '' ? null : o.sort, KEYS = ['name', 'lifter', 'where', 'next', 'st'];
        if (sort != null && (!isStr(sort) || KEYS.indexOf(sort.replace(/^-/, '')) < 0)) return bad('Programs sort by ' + KEYS.join(', ') + ', with a minus in front for the other way.', 'sort');
        return sel('programs', { q: q, sort: sort }, function () {
          var qq = q.trim().toLowerCase(), rows = programRows().filter(function (r) { return !qq || (r.name + ' ' + r.lifter).toLowerCase().indexOf(qq) >= 0; });
          var key = sort ? sort.replace(/^-/, '') : 'st', dir = sort && sort.charAt(0) === '-' ? -1 : 1, first = progOrder();
          var val = function (r) { return key === 'name' ? r.name.toLowerCase() : key === 'lifter' ? r.lifter.toLowerCase() : key === 'where' ? (r.week.of ? r.week.n / r.week.of : 0) : r.runway; };
          rows = rows.slice().sort(key === 'st' ? function (a, b) { return first(a, b) * dir; } : function (a, b) { var x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || a.name.localeCompare(b.name) || a.lifter.localeCompare(b.lifter); });
          var cnt = {}; Object.keys(PSTATE_RANK).forEach(function (s) { cnt[s] = programRows().filter(function (r) { return r.state === s; }).length; });
          /* to change this week: up to date, but the week must change before the next session (pain on a lift, a days change) */
          cnt.change = programRows().filter(function (r) { return !!r.change; }).length; cnt['up-to-date'] -= cnt.change;
          return { data: rows, meta: { total: rows.length, q: q, sort: sort, counts: cnt, due: dueOf(programRows().slice().sort(first)), noProgram: D.lifters.filter(function (l) { return !l.program; }).map(function (l) { return l.id; }) } };
        });
      },
      get: function (id, o) {
        var l = L(id); if (!l) return noLifter(id); o = argObj(o);
        if (o.block != null && o.block !== 'next' && o.block !== 'current') return bad('A block is current or next.', 'block');
        if (o.block === 'next') return sel('programN', id, function () { return nextAnswer(l); });
        return sel('program', id, function () { return programAnswer(l); });
      },
      /* o.label: the block's own words for the change ("Paste 6 cells"), the step's name in its history */
      save: function (id, block, o) {
        var l = L(id); if (!l) return noLifter(id);
        o = argObj(o);
        if (!block || typeof block !== 'object' || Array.isArray(block) || !Array.isArray(block.weeks)) return bad('Save a block (block.toJSON()) or a program with its weeks.', 'block');
        if (o.label != null && (!isStr(o.label) || o.label.length > 200)) return bad('A step’s label is a few words.', 'label');
        var s; try { s = JSON.stringify(block); } catch (e) { return bad('That block cannot be saved: it does not turn into JSON.', 'block'); }
        if (s.length > 2e6) return bad('That block is too big to keep in this tab.', 'block');
        if (o.block != null && o.block !== 'next' && o.block !== 'current') return bad('A block is current or next.', 'block');
        if (o.block === 'next') {
          if (!l.program) return bad(l.first + ' has no block to follow. Start a first block instead.', 'id');
          if (nextDrafts[id] && JSON.stringify(nextDrafts[id]) === s) return ok({ id: id, block: 'next' }, { undo: null, label: '' });
          return commit('draftNext', { id: id, block: JSON.parse(s), label: o.label ? words0(o.label) : null, at: stamp() });
        }
        if (drafts[id] && JSON.stringify(drafts[id]) === s) return ok({ id: id }, { undo: null, label: '' });
        return commit('draft', { id: id, block: JSON.parse(s), label: o.label ? words0(o.label) : null, at: stamp() });
      },
      /* the block's history, kept across reloads: data.block is the block to rebuild from (null: the program itself) */
      history: function (id) { var l = L(id); if (!l) return noLifter(id); return sel('history', id, function () { return { data: histInfo(id) }; }); },
      undo: function (id) { var l = L(id); if (!l) return noLifter(id); if (!histInfo(id).steps) return fail('nothing_to_undo', 'Nothing to undo.'); return commit('draftStep', { id: id, dir: 'back' }); },
      redo: function (id) { var l = L(id); if (!l) return noLifter(id); if (!histInfo(id).redoSteps) return fail('nothing_to_undo', 'Nothing to redo.'); return commit('draftStep', { id: id, dir: 'fwd' }); },
      /* o.hold (ms, up to a minute): the week waits behind its toast; Undo in that time means the lifter never saw it */
      send: function (id, wn, o) {
        var l = L(id); if (!l) return noLifter(id);
        o = argObj(o);
        var p = l.program; if (!p) return bad(l.first + ' has no program to send.', 'id');
        var dr = drafts[id], len = Math.max(p.weeks.length, dr && Array.isArray(dr.weeks) ? dr.weeks.length : 0), hold = o.hold == null ? 0 : o.hold;
        var which = whichOf(l, wn, o); if (!which) return bad('A block is current or next.', 'block');
        if (which === 'current' && (!isNum(wn) || wn % 1 || wn < 1 || wn > len)) return bad('Send a week from 1 to ' + len + '.', 'n');
        if (!isNum(hold) || hold < 0 || hold > 60000) return bad('A send waits 0 to 60000 ms behind its toast.', 'hold');
        if (o.note != null && (!isStr(o.note) || o.note.length > 300)) return bad('A week’s note is 300 characters at most.', 'note');
        if (o.message != null && (!isStr(o.message) || o.message.length > 1000)) return bad('A message is 1000 characters at most.', 'message');
        if (o.items != null && (!Array.isArray(o.items) || o.items.some(function (x) { return !C.get(x); }))) return fail('not_found', 'A send settles items this store knows.');
        if (which === 'next') {
          if (!isNum(wn) || wn % 1 || wn < 1) return bad('A week is a number from 1.', 'n');
          var save = null, nd = nextDrafts[id];
          if (!nd) { var nx = nextBlockOf(l); if (!nx) return fail('not_found', l.first + ' has no next block to send. Plan it first.'); save = nx.b.toJSON(); nd = save; }
          var nw = Array.isArray(nd.weeks) ? nd.weeks[wn - 1] : null; if (!nw) return bad('Send a week from 1 to ' + nd.weeks.length + ' of the next block.', 'n');
          if (ST.held[id + ':next:' + wn]) return fail('conflict', 'Week ' + wn + ' is on its way to ' + l.first + ' already.');
          var unreadN = unreadIn(nd, wn - 1); if (unreadN) return unreadN;
          if (ST.nextSent[id] && ST.nextSent[id][wn] && !save) return fail('conflict', 'That week of the next block is with ' + l.first + ' already.');
          return commit('programSend', { id: id, n: wn, block: 'next', at: stamp(), save: save, prevWeek: { sent: nw.sent == null ? null : nw.sent, sentAt: nw.sentAt == null ? null : nw.sentAt, version: nw.version == null ? null : nw.version }, hold: hold, note: isStr(o.note) && o.note.trim() ? o.note.trim() : undefined, message: isStr(o.message) && o.message.trim() ? o.message.trim() : undefined, items: Array.isArray(o.items) && o.items.length ? o.items.slice() : undefined });
        }
        var args = sendArgsFor(id, wn, o); if (args.error) return args;
        return commit('programSend', args);
      },
      /* every week held behind a toast goes now (leaving the page does this too) */
      flush: function () { var k = flushHeld(); return ok({ landed: k }, { undo: null, label: '' }); },
      start: function (id, o) {
        var l = L(id); if (!l) return noLifter(id);
        o = argObj(o);
        /* programs.md §11.2, shared.md D11: from the intake by default; never sends, never posts to the thread */
        var from = o.from || (o.template ? 'template' : 'intake'), FROMS = ['intake', 'template', 'blank', 'team', 'recovery', 'repeat', 'off'];
        if (FROMS.indexOf(from) < 0) return bad('Start from ' + FROMS.join(', ') + '.', 'from');
        if (from === 'team') { if (!D.team) return fail('not_found', 'There is no team to start from.'); return PL.teams.start(o.team || slug(D.team.name), id, { week: o.week, maxes: o.maxes }); }
        if (from === 'recovery' || from === 'repeat' || from === 'off') return PL.programs.next(id, { from: from, startsOn: o.startsOn, template: o.template });
        var tid = 'blank';
        if (from === 'template') { var key = o.template, t = templates().filter(function (x) { return x.id === key || x.name === key || slug(x.name) === key; })[0]; if (!t) return fail('not_found', 'There is no template called ' + (key == null ? 'that' : '“' + key + '”') + '.'); tid = t.id; }
        if (from === 'intake' && !l.intake) return bad(l.first + ' has no intake to start from.', 'from');   /* her days, empty (programs.md §8.1) */
        if (l.program) return fail('conflict', l.first + ' is on ' + l.program.name + ' already. Plan the next block instead.');
        if (o.maxes != null && (typeof o.maxes !== 'object' || LIFTS.some(function (k) { return o.maxes[k] != null && !kgOk(o.maxes[k], 20, 600); }))) return bad('Maxes are 20 to 600 kg, in 2.5 kg steps.', 'maxes');
        /* LOGIC-FIX-3 (Programs' request, programs.md §8.1): the block's defaults go with the start, one write and one Undo:
           how new lines move each week (prog: BLOCK.PROGS' ids) and the week that is a deload (deloadAt, week 2 or later) */
        var dfl;
        if (o.defaults != null) {
          if (typeof o.defaults !== 'object') return bad('Defaults are { prog, deloadAt }.', 'defaults');
          var Bk0 = BLK(), PIDS = Bk0 && Bk0.PROGS ? Bk0.PROGS.map(function (x) { return x.id; }) : ['same', 'kg2.5', 'kg5', 'rpe0.5', 'pct2.5', 'rep-1'];
          if (o.defaults.prog != null && PIDS.indexOf(o.defaults.prog) < 0) return bad('Each week is one of ' + PIDS.join(', ') + '.', 'defaults');
          if (o.defaults.deloadAt != null && !(isNum(o.defaults.deloadAt) && o.defaults.deloadAt >= 2 && o.defaults.deloadAt % 1 === 0)) return bad('A deload week is week 2 or later.', 'defaults');
          dfl = { prog: o.defaults.prog == null ? null : o.defaults.prog, deloadAt: o.defaults.deloadAt == null ? null : o.defaults.deloadAt };
        }
        var startsOn = isIso(o.startsOn) ? o.startsOn : from === 'intake' ? firstOn(l) : nextMonday();
        return commit('programStart', { id: id, tpl: tid, at: stamp(), startsOn: startsOn, from: from, maxes: o.maxes ? clone(o.maxes) : undefined, days: from === 'intake' && l.intake.days ? l.intake.days.slice() : undefined, defaults: dfl });
      }
    },
    templates: {
      list: function () { return sel('templates', undefined, function () { return { data: clone(templates()) }; }); },
      /* LOGIC-FIX-1 (programs.md §9, request #39): get, save, rename, remove, duplicate; every write undoable */
      get: function (id) {
        var t = templates().filter(function (x) { return x.id === id || x.name === id; })[0]; if (!t) return fail('not_found', 'There is no template ' + (isStr(id) ? '“' + id + '”' : 'like that') + '.');
        return sel('tplGet', t.id, function () { var j = clone(tplBlock(t)); if (j) { j.name = t.name; j.id = null; } return { data: j, meta: { id: t.id, name: t.name, own: t.own } }; });
      },
      save: function (o) {
        o = argObj(o); var name = words0(o.name); if (!name) return bad('A template needs a name.', 'name'); if (name.length > 60) return bad('A template’s name is 60 characters at most.', 'name');
        var json = null, Bk = BLK();
        if (o.json || o.block && typeof o.block === 'object') { json = clone(o.json || o.block); if (!json || !Array.isArray(json.weeks)) return bad('Save a block (block.toJSON()).', 'json'); if (Bk) { try { json = Bk.asTemplate(Bk.from(json), { name: name }); } catch (e) { return bad('That block cannot be read.', 'json'); } } }
        else if (isStr(o.from)) { var l = L(o.from); if (!l) return noLifter(o.from); if (!l.program) return bad(l.first + ' has no block to save.', 'from'); if (!Bk) return fail('invalid', 'Saving a lifter’s block as a template needs block.js on the page.'); var b = blockOf(l); if (!b) return fail('invalid', 'That program cannot be read.'); json = Bk.asTemplate(b, { name: name }); }
        else return bad('Say which block to save: from a lifter, or its JSON.', 'from');
        json.name = name; var id = 'tpl-' + slug(name);
        if (templates().some(function (t) { return t.id === id || t.name.toLowerCase() === name.toLowerCase(); })) return fail('conflict', 'There is a template called ' + name + ' already.');
        return commit('tplSave', { id: id, name: name, json: json, at: stamp() });
      },
      rename: function (id, name) {
        var t = templates().filter(function (x) { return x.id === id; })[0]; if (!t) return fail('not_found', 'There is no template ' + (isStr(id) ? id : '') + '.');
        var nm = words0(name); if (!nm) return bad('A template needs a name.', 'name'); if (nm === t.name) return ok({ id: id, name: nm }, { undo: null, label: '' });
        if (templates().some(function (x) { return x.id !== id && x.name.toLowerCase() === nm.toLowerCase(); })) return fail('conflict', 'There is a template called ' + nm + ' already.');
        return commit('tplRename', { id: id, name: nm, at: stamp() });
      },
      /* LOGIC-FIX-3: update(id, json): the template's block replaced by the edited one (its name kept), one Undo */
      update: function (id, json) {
        var t = templates().filter(function (x) { return x.id === id; })[0]; if (!t) return fail('not_found', 'There is no template ' + (isStr(id) ? id : '') + '.');
        var j = json && typeof json === 'object' ? clone(json) : null; if (!j || !Array.isArray(j.weeks) || !j.weeks.length) return bad('Save a block (block.toJSON()) with at least one week.', 'json');
        var Bk = BLK(); if (Bk) { try { j = Bk.asTemplate(Bk.from(j), { name: t.name }); } catch (e) { return bad('That block cannot be read.', 'json'); } }
        j.name = t.name;
        var cur = tplBlock(t); if (cur && JSON.stringify(cur) === JSON.stringify(j)) return ok({ id: id, name: t.name, weeks: j.weeks.length }, { undo: null, label: '' });
        return commit('tplUpdate', { id: id, json: j, at: stamp() });
      },
      remove: function (id) { var t = templates().filter(function (x) { return x.id === id; })[0]; if (!t) return fail('not_found', 'There is no template ' + (isStr(id) ? id : '') + '.'); return commit('tplRemove', { id: id, at: stamp() }); },
      duplicate: function (id) {
        var t = templates().filter(function (x) { return x.id === id; })[0]; if (!t) return fail('not_found', 'There is no template ' + (isStr(id) ? id : '') + '.');
        var j = clone(tplBlock(t)); if (!j) return fail('invalid', 'That template has no weeks to copy.');
        var k = 2, nm = t.name + ' ' + k; while (templates().some(function (x) { return x.name.toLowerCase() === nm.toLowerCase(); })) nm = t.name + ' ' + (++k);
        j.name = nm; return commit('tplSave', { id: 'tpl-' + slug(nm), name: nm, json: j, at: stamp(), label: t.name + ' copied as ' + nm + '.' });
      }
    },

    teams: {
      list: function () { return sel('teams', undefined, function () { return { data: allTeams().map(function (T) { var t = teamData(T); return { id: t.id, name: t.name, program: t.program, startsOn: t.startsOn, members: t.members.length, week: { now: t.week.now, of: t.week.of } }; }) }; }); },
      get: function (id) { var T = teamOf(id); if (!T) return fail('not_found', 'There is no team ' + (isStr(id) ? id : '') + '.'); return sel('team', id, function () { var t = teamData(T); return { data: t, meta: { offPlanOpen: t.offPlanOpen, members: t.members.length } }; }); },
      /* LOGIC-FIX-2 (Teams' request, screens.md §4.4): the team's weeks as a block BLOCK.from reads (no maxes: the team writes
         RPE and percent; each member's kilos come from their own program), so WEEK.grid can edit a team week in team mode
         with its write mapped to teams.setLine. Pure: nothing is saved */
      block: function (id) {
        var T = teamOf(id); if (!T) return fail('not_found', 'There is no team ' + (isStr(id) ? id : '') + '.');
        return sel('teamblock', id, function () {
          var off = teamDayOffsets(T), nowW = teamNow(T);
          var weeks = T.weeks.map(function (w, wi) { return { n: w.n, published: teamWeekSent(T, w.n), sent: teamWeekSent(T, w.n), state: wi < nowW ? 'lifted' : wi === nowW ? 'now' : teamWeekSent(T, w.n) ? 'sent' : 'written',
            days: w.days.map(function (d) { var exs = (d.exercises || []).map(function (e) { return { lift: e.lift, variant: e.variant || (MAIN[e.lift] ? 'Competition' : ''), title: e.title, note: e.note || '', sets: (e.sets || []).filter(function (s0) { return !s0.extra; }).map(function (s0) { var o = { w: s0.w || 0, r: s0.r, done: 0 }; if (s0.rpe != null) o.rpe = s0.rpe; if (s0.rpeHi != null) o.rpeHi = s0.rpeHi; if (s0.pct != null) o.pct = s0.pct; return o; }) }; });
              return { name: d.name, date: exs.length && off[d.name] != null ? K.add(T.startsOn, wi * 7 + off[d.name]) : null, sets: setsIn(exs), done: 0, exercises: exs }; }) }; });
          return { data: { id: 'team-' + slug(T.name), team: slug(T.name), name: T.program, startsOn: T.startsOn, meetDate: null, maxes: { squat: null, bench: null, deadlift: null }, cols: [], weekIdx: nowW, weeks: weeks }, meta: { team: slug(T.name), write: 'teams.setLine' } };
        });
      },
      sendWeek: function (id, wn) {
        var T = teamOf(id); if (!T) return fail('not_found', 'There is no team ' + (isStr(id) ? id : '') + '.');
        if (!isNum(wn) || wn % 1 || wn < 1 || wn > T.weeks.length) return bad('Send a week from 1 to ' + T.weeks.length + '.', 'n');
        return commit('teamSend', { id: id, n: wn, at: stamp() });
      },
      /* a member with no program starts on the team's program from a week to come (default: the week after this one) */
      start: function (id, lifterId, o) {
        var T = teamOf(id); if (!T) return fail('not_found', 'There is no team ' + (isStr(id) ? id : '') + '.');
        var l = L(lifterId); if (!l || !T.members.some(function (m) { return m.id === l.id; })) return fail('not_found', (l ? l.first : 'That lifter') + ' is not on the ' + T.name + '.');
        if (l.program) return fail('conflict', l.first + ' is on ' + l.program.name + ' already.');
        o = argObj(o); var nowW = teamNow(T), wn = o.week == null ? nowW + 2 : o.week;
        if (nowW + 2 > T.weeks.length) return bad('The ' + T.name + '’s block has no week after this one to start from.', 'week');
        if (!isNum(wn) || wn % 1 || wn <= nowW + 1 || wn > T.weeks.length) return bad('Start on a week to come: week ' + (nowW + 2) + (nowW + 2 < T.weeks.length ? ' to ' + T.weeks.length : '') + '.', 'week');
        var it = C.get('first-' + l.id), a = it && actOf(it, 'team');
        if (it && a && !doneOf(it.id) && wn === nowW + 2) return commit('item', { itemId: it.id, actId: 'team', text: null, at: stamp() });
        return commit('teamStart', { id: id, lifterId: l.id, n: wn, at: stamp() });
      },
      message: function (id, o) {
        var T = teamOf(id); if (!T) return fail('not_found', 'There is no team ' + (isStr(id) ? id : '') + '.');
        o = argObj(o); var t = isStr(o.text) ? o.text.trim() : '';
        if (!t) return bad('A message needs words.', 'text');
        if (o.to != null && !T.members.some(function (m) { return m.id === o.to; })) return fail('not_found', 'That lifter is not on the ' + T.name + '.');
        return commit('teamMessage', { id: id, text: t, to: o.to || null, at: stamp() });
      }
    },

    meets: {
      list: function () { return sel('mlist', undefined, function () { return { data: clone(meetList()) }; }); },
      get: function (id) {
        var m = isStr(id) ? meetById(id) : null; if (!m) return fail('not_found', 'There is no meet ' + (isStr(id) ? id : '') + '.');
        return sel('meet', id, function () {
          var out = clone(m);
          out.lifters = m.lifterIds.map(K.L).filter(Boolean).map(function (l) { var pl = planOf(l), bwx = bwNow(l), cls = pl.cls; return { id: l.id, name: l.name, first: l.first, ini: l.ini, hue: l.hue, cls: l.meet.cls || null, weighIn: l.meet.weighIn || null, bw: bwx, over: bwx != null && isNum(cls) ? r1(bwx - cls) : null, attemptsSet: !!l.meet.attemptsSet, preset: pl.preset, attempts: clone(pl.a), weigh: pl.weigh }; });
          out.today = m.days === 0;
          return { data: out };
        });
      },
      plan: function (lifterId) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return fail('not_found', l.first + ' has no meet booked.');
        return sel('plan', lifterId, function () {
          var pl = planOf(l), from = {}, lifts = {};
          LIFTS.forEach(function (k) { from[k] = proven(l, k); var e1 = l.lifts[k] && l.lifts[k].e1 != null ? e1Of(l, k) : null; lifts[k] = { e1: e1, delta: l.lifts[k] ? liftNow(l, k).delta : null, share: pl.a[k].map(function (kg) { return kg && e1 ? Math.round(kg / e1 * 100) : null; }) }; });   /* LOGIC-FIX-2 (Meets' request, screens.md §9): one e1RM, lifters.get's */
          var tot = [0, 1, 2].map(function (k) { return LIFTS.reduce(function (s, L2) { return s + (pl.a[L2][k] || 0); }, 0); });
          var snap = JSON.stringify(pl.a), sentState = !pl.sent ? 'no' : pl.sent.snap === snap ? 'yes' : 'stale';
          var best = (l.pastMeets || []).slice().sort(function (a, b) { return b.total - a.total; })[0] || null;
          return { data: { meetId: meetId(l.meet), preset: pl.preset, presets: ['safe', 'planned', 'brave'].map(function (k) { var pc = PRESET[k].map(function (f) { return Math.round(f * 100); }); return { id: k, name: PNAME[k], pct: pc, title: presetTitle(l, k, pc) }; }),
            attempts: clone(pl.a), states: clone(pl.st), from: from, lifts: lifts, totals: { opener: tot[0], second: tot[1], third: tot[2] }, bestMeet: best ? { name: best.name, total: best.total, date: best.date } : null,
            bw: bwOut(l, pl), ask: askOf(l), left: scheduleLeft(l), sent: sentState, weigh: pl.weigh, note: pl.note || '',
            ticks: PREP.map(function (t) { return { id: t[0], label: t[1], more: t[2], on: !!(pl.ticks || {})[t[0]] }; }), ready: { done: PREP.filter(function (t) { return (pl.ticks || {})[t[0]]; }).length, of: PREP.length } } };
        });
      },
      board: function (id) {
        var m = isStr(id) ? meetById(id) : null; if (!m) return fail('not_found', 'There is no meet ' + (isStr(id) ? id : '') + '.');
        return sel('board', id, function () { return { data: boardData(m) }; });
      },
      setAttempt: function (lifterId, lift, k, kg) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        if (!liftOk(lift)) return bad('An attempt is a squat, a bench or a deadlift.', 'lift');
        if (k !== 1 && k !== 2 && k !== 3) return bad('An attempt is the first, second or third: 1, 2 or 3.', 'k');
        if (!kgOk(kg, 20, 500)) return bad('An attempt is 20 to 500 kg, in 2.5 kg steps.', 'kg');
        var pl0 = planOf(l); if (judged(pl0.st[lift][k - 1])) return fail('locked', 'That attempt is judged already.');
        if (k > 1) { var pk = pl0.a[lift][k - 2], missed = pl0.st[lift][k - 2] === 'no', ORDS = ['opener', 'second', 'third'];
          if (isNum(pk) && (missed ? kg < pk : kg <= pk)) return bad('The ' + ORDS[k - 1] + ' has to stay ' + (missed ? 'at or above' : 'above') + ' the ' + ORDS[k - 2] + ' (' + n(pk) + '). Lower that one first.', 'kg'); }
        return commit('meet', { what: 'attempt', lifterId: lifterId, lift: lift, k: k, kg: kg });
      },
      /* request #14 (screens.md §5.6): the Safe preset as a pure read, for the pain popover's "Squat: 122.5 → 120" before Save */
      safe: function (lifterId) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        return sel('msafe', lifterId, function () { var o = safeSet(l); return { data: { squat: o.squat, bench: o.bench, deadlift: o.deadlift }, meta: { preset: 'safe' } }; });
      },
      preset: function (lifterId, name) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        var key = isStr(name) ? name.trim().toLowerCase() : '';
        if (!PRESET[key]) return bad('The presets are Safe, Planned and Brave.', 'preset');
        if (LIFTS.some(function (k) { return !(l.lifts[k] && l.lifts[k].e1); })) return bad(l.first + ' has no e1RM on every lift yet to plan from.', 'id');
        return commit('meet', { what: 'preset', lifterId: lifterId, preset: key });
      },
      sendAttempts: function (lifterId) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        return commit('meet', { what: 'send', lifterId: lifterId, at: stamp() });
      },
      /* o.kg: what the scale said (made or over), kept for the board ("Weighed 104.9, made the 105s") */
      weighIn: function (lifterId, state, o) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        if (WEIGH.indexOf(state) < 0) return bad('A weigh-in is not, made or over.', 'state');
        o = argObj(o); if (o.kg != null && (!isNum(o.kg) || o.kg < 30 || o.kg > 250)) return bad('A scale weight is 30 to 250 kg.', 'kg');
        return commit('meet', { what: 'weigh', lifterId: lifterId, state: state, kg: o.kg == null ? null : r1(o.kg), at: stamp() });
      },
      /* several lifters of one meet at the scale in one write (They all made weight), one Undo */
      weighIns: function (meetId0, ids, state) {
        var m = isStr(meetId0) ? meetById(meetId0) : null; if (!m) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
        if (WEIGH.indexOf(state) < 0) return bad('A weigh-in is not, made or over.', 'state');
        if (!Array.isArray(ids) || !ids.length || ids.some(function (x) { return m.lifterIds.indexOf(x) < 0; })) return bad('Weigh in lifters of ' + m.name + '.', 'ids');
        return commit('meet', { what: 'weighs', meetId: meetId0, ids: ids.slice(), state: state });
      },
      /* a lifter's three openers in one write (pain on the day: each 2.5 kg lighter), one Undo */
      openers: function (lifterId, kg) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        kg = argObj(kg); var any = false, pl0 = planOf(l);
        for (var i = 0; i < LIFTS.length; i++) { var L2 = LIFTS[i]; if (kg[L2] == null) continue; any = true; if (!kgOk(kg[L2], 20, 500)) return bad('An attempt is 20 to 500 kg, in 2.5 kg steps.', L2); if (judged(pl0.st[L2][0])) return fail('locked', 'The ' + L2 + ' opener is judged already.'); }
        if (!any) return bad('Give at least one opener: { squat, bench, deadlift }.', 'kg');
        return commit('meet', { what: 'openers', lifterId: lifterId, kg: { squat: kg.squat == null ? null : kg.squat, bench: kg.bench == null ? null : kg.bench, deadlift: kg.deadlift == null ? null : kg.deadlift } });
      },
      judge: function (lifterId, lift, k, good) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!liftOk(lift)) return bad('An attempt is a squat, a bench or a deadlift.', 'lift');
        if (k !== 1 && k !== 2 && k !== 3) return bad('An attempt is the first, second or third: 1, 2 or 3.', 'k');
        if (good !== true && good !== false && good !== null) return bad('A verdict is good (true), no lift (false) or not judged (null).', 'good');
        if (!l.meet || l.meet.days !== 0) return bad(l.first + ' is not on a platform today.', 'id');
        return commit('meet', { what: 'judge', lifterId: lifterId, lift: lift, k: k, good: good });
      },
      stage: function (meetId0, stage) {
        var m = isStr(meetId0) ? meetById(meetId0) : null; if (!m) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
        var s = isStr(stage) ? (STAGE_ALIAS[stage.toLowerCase()] || stage.toLowerCase()) : '';
        if (STAGES.indexOf(s) < 0) return bad('The day goes weigh-in, squat, bench, deadlift, done.', 'stage');
        return commit('meet', { what: 'stage', meetId: meetId0, stage: s });
      },
      note: function (lifterId, text) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        return commit('meet', { what: 'note', lifterId: lifterId, text: isStr(text) ? text.trim() : '' });
      },
      sendCards: function (meetId0) {
        var m = isStr(meetId0) ? meetById(meetId0) : null; if (!m) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
        return commit('meet', { what: 'cards', meetId: meetId0 });
      },
      /* the weight decision: 'plan' (Start the cut plan), 'class' (Move up a class) or 'watch' (Fine, keep watching) */
      bw: function (lifterId, how) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        var it = C.get('cut-' + l.id); if (!it) return bad(l.first + ' is on weight: there is nothing to decide.', 'id');
        if (how !== 'plan' && how !== 'class' && how !== 'watch') return bad('The weight moves are plan, class and watch.', 'how');
        var d = doneOf(it.id); if (d) return fail('conflict', 'Decided already: ' + doneLabel(it, d) + '. Undo it first.');
        var a = how === 'watch' ? actOf(it, 'watch') || actOf(it, 'ok') : how === 'class' ? actOf(it, 'class') || actOf(it, 'up') : actOf(it, 'plan') || actOf(it, 'cut');
        if (how === 'watch' && !a) return commit('item', { itemId: it.id, actId: 'ok', label: 'Fine, keep watching', at: stamp() });
        if (!a) return bad('That move is not open for ' + l.first + '.', 'how');
        /* the cut plan's sheet sends it (meets.saveCut: "Cut plan sent"); deciding here sends nothing, so it is started (request #9) */
        if (a.keep || a.reply != null) return commit('item', { itemId: it.id, actId: a.id, label: a.id === 'cut' || a.id === 'plan' ? 'Cut plan started' : a.done || a.label, at: stamp() });
        return commit('item', { itemId: it.id, actId: a.id, text: null, at: stamp() });
      },
      /* a box of what is left to tick before the platform (entry, kit, travel, rack, handler) */
      tick: function (lifterId, tickId, on) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
        if (!PREP.some(function (t) { return t[0] === tickId; })) return bad('The boxes are ' + PREP.map(function (t) { return t[0]; }).join(', ') + '.', 'tick');
        var cur = !!(planOf(l).ticks || {})[tickId], want = on == null ? !cur : !!on;
        return commit('meet', { what: 'tick', lifterId: lifterId, tick: tickId, on: want });
      },
      /* a rung of the warm-up ladder on the board's stage, ticked (or not) */
      rung: function (lifterId, i, on) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet || l.meet.days !== 0) return bad(l.first + ' is not on a platform today.', 'id');
        var b = boardData(meetById(meetId(l.meet))), w = b.warmup[l.id], r = w && w.rungs[i];
        if (!isNum(i) || i % 1 || !r) return bad('That rung is not on ' + l.first + '’s ladder.', 'i');
        return commit('meet', { what: 'rung', lifterId: lifterId, lift: w.lift, i: i, kg: r.kg, on: on == null ? !r.ticked : !!on, min: b.clock.minutes });
      },
      /* several rungs at once (Took them: every untaken rung up to now), one write, one Undo */
      rungs: function (lifterId, is, on) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet || l.meet.days !== 0) return bad(l.first + ' is not on a platform today.', 'id');
        var b = boardData(meetById(meetId(l.meet))), w = b.warmup[l.id];
        if (!Array.isArray(is) || !is.length || is.some(function (i) { return !isNum(i) || i % 1 || !w || !w.rungs[i]; })) return bad('Those rungs are not all on ' + l.first + '’s ladder.', 'is');
        return commit('meet', { what: 'rungs', lifterId: lifterId, lift: w.lift, is: uniq(is), on: on == null ? true : !!on, min: b.clock.minutes });
      },
      /* the warm-ups cut short when the lifter is behind: the drafted cut (o omitted) or { singles, out } (rung indexes); kept
         across reloads and pages; uncutWarmup puts the ladder back as planned. Each one Undo */
      cutWarmup: function (lifterId, o) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet || l.meet.days !== 0) return bad(l.first + ' is not on a platform today.', 'id');
        var b = boardData(meetById(meetId(l.meet))), w = b.warmup[l.id]; if (!w || !w.rungs.length) return bad(l.first + ' has no ladder to cut.', 'id');
        /* LOGIC-FIX-4 (walk 2, "Priya's warm-ups are late. Cut to 3 singles." then "Priya is not behind"): the board read the
           page shows drafts the cut from the attempts-out timeline; the cut takes that same draft, so Late and Cut agree */
        if (!w.draft && !w.cut && PL && PL.meets && typeof PL.meets.board === 'function') { var bb = PL.meets.board(meetId(l.meet)), w2 = bb && bb.data && bb.data.warmup ? bb.data.warmup[l.id] : null; if (w2 && w2.draft && w2.lift === w.lift) w = w2; }
        o = argObj(o); var d0 = o.singles ? { singles: o.singles, out: o.out || [], at: o.at || {} } : w.draft;
        if (!d0) return fail('conflict', l.first + ' is not behind: there is nothing to cut.');
        if (!Array.isArray(d0.singles) || !d0.singles.length || d0.singles.concat(d0.out || []).some(function (i) { return !isNum(i) || i % 1 || !w.rungs[i]; })) return bad('Those rungs are not all on ' + l.first + '’s ladder.', 'singles');
        return commit('meet', { what: 'cut', lifterId: lifterId, lift: w.lift, singles: d0.singles.slice(), out: (d0.out || []).slice(), at: clone(d0.at || {}) });
      },
      uncutWarmup: function (lifterId) {
        var l = L(lifterId); if (!l) return noLifter(lifterId);
        if (!l.meet || l.meet.days !== 0) return bad(l.first + ' is not on a platform today.', 'id');
        var b = boardData(meetById(meetId(l.meet))), w = b.warmup[l.id]; if (!w || !w.cut) return fail('nothing_to_undo', l.first + '’s warm-ups are not cut.');
        return commit('meet', { what: 'cut', lifterId: lifterId, lift: w.lift, off: true });
      },
      /* Undo last (U): the latest verdict on this meet's board (a judgement or a weigh-in) taken back */
      undo: function (meetId0) {
        var m = isStr(meetId0) ? meetById(meetId0) : null; if (!m) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
        for (var i = LOG.length - 1; i >= 0; i--) { var r = LOG[i]; if (r.op === 'meet' && (((r.a.what === 'judge' || r.a.what === 'weigh') && m.lifterIds.indexOf(r.a.lifterId) >= 0) || (r.a.what === 'weighs' && r.a.meetId === m.id))) return undoToken(r.t); }
        return fail('nothing_to_undo', 'Nothing to undo on the board.');
      }
    },

    threads: {
      /* o.keep: the thread ids in the order the page shows them, so the order holds while the coach works (a thread that
         was not shown yet comes first) */
      list: function (o) {
        o = argObj(o); var q = o.q == null ? '' : String(o.q), keep = Array.isArray(o.keep) ? o.keep.filter(isStr) : null;
        return sel('tlist', { q: q, keep: keep }, function () {
          var qq = q.trim().toLowerCase(), all = threadList();
          var list = !qq ? all : all.filter(function (t) { if (t.name.toLowerCase().indexOf(qq) >= 0) return true; var l = K.L(t.id); return threadMessages(l).some(function (m) { return String(m.body || '').toLowerCase().indexOf(qq) >= 0; }); });
          if (keep) { var pos = {}; keep.forEach(function (x, i) { if (pos[x] == null) pos[x] = i; }); list = list.filter(function (t) { return pos[t.id] == null; }).concat(list.filter(function (t) { return pos[t.id] != null; }).sort(function (a, b) { return pos[a.id] - pos[b.id]; })); }
          /* write first (screens.md §6.2, LOGIC-FIX-2): lifters with no thread yet who have said nothing to answer, where the
             reason is their silence or their recovery (quiet-<id>, low-<id>: Tomas "Slept 5 h", Jonah "12 days quiet") and the
             move is your words, in the Roster's order. A plan fix that carries words (Nina's days, Marcus's bench) is made
             from Overview or Programs, not written first here */
          var has0 = {}; all.forEach(function (t) { has0[t.id] = 1; });
          var M0 = model(), wf = M0.rows.slice().sort(function (x, y) { return x.tier - y.tier || x.ord - y.ord || x.name.localeCompare(y.name); }).filter(function (r) {
            if (has0[r.id]) return false;
            return !!wfItem(r.id);
          });
          /* a move that changes this week's sessions goes first (it has to reach them before they lift: Tomas), then words only */
          wf = wf.map(function (r, i) { var it = wfItem(r.id), a0 = mainAct(it); return { id: r.id, i: i, ops: a0 && a0.ops && a0.ops.length ? 0 : 1 }; }).sort(function (x, y) { return x.ops - y.ops || x.i - y.i; }).map(function (x) { return x.id; });
          var wt = waitOrder(all.filter(function (t) { return t.waiting; })).map(function (t) { return t.id; });
          var groups = { waiting: wt, first: wf.slice(), answered: all.filter(function (t) { return !t.waiting; }).map(function (t) { return t.id; }) };
          return { data: list.map(function (t) { return clone(t); }), meta: { total: list.length, q: q, keep: !!keep, unread: all.reduce(function (s, t) { return s + t.unread; }, 0), waiting: wt.length, writeFirst: wf, groups: groups } };
        });
      },
      get: function (id) {
        var l = L(id), t = l ? threadList().filter(function (x) { return x.id === id; })[0] : null;
        if (!l) return fail('not_found', 'There is no thread ' + (isStr(id) ? id : '') + '.');
        return sel('thread', id, function () {
          var w = weekView(l, 0) || { sessions: [] };
          return { data: { id: l.id, name: l.name, first: l.first, ini: l.ini, hue: l.hue, unread: unreadOf(l), messages: threadMessages(l), draft: draftOf(l),
            asks: t ? t.asks : null, moves: openItems(l).slice(0, 1).map(function (it) { return { itemId: it.id, title: it.title, acts: it.acts.map(function (a) { return { id: a.id, label: a.label, kind: a.kind || null, reply: a.reply != null ? a.reply : null, keep: !!a.keep }; }) }; })[0] || null,
            week: w.sessions.map(function (s) { return { idx: s.idx, name: s.name, date: s.date, state: s.state }; }) } };
        });
      }
    },
    messages: {
      send: function (id, o) {
        var l = L(id); if (!l) return fail('not_found', 'There is no thread ' + (isStr(id) ? id : '') + '.');
        o = argObj(o);
        var type = o.type == null ? 'text' : o.type, t = isStr(o.text) ? o.text.trim() : '', dur = null;
        if (type !== 'text' && type !== 'voice') return bad('A message is text or a voice note.', 'type');
        if (type === 'text' && !t) return bad('A message needs words.', 'text');
        if (type === 'voice') { dur = o.dur == null ? 12 : o.dur; if (!isNum(dur) || dur < 1 || dur > 600) return bad('A voice note runs 1 second to 10 minutes.', 'dur'); dur = r1(dur); }
        var ride = null;
        if (o.ride != null && o.ride !== false) {
          var r = argObj(o.ride), it = isStr(r.itemId) ? C.get(r.itemId) : null, a = it && actOf(it, r.actId);
          if (!it || !a || it.ids.indexOf(l.id) < 0) return bad('That change is not one of ' + l.first + '’s.', 'ride');
          ride = { itemId: it.id, actId: a.id };
        } else if (o.ride === undefined) ride = replyFix(l);   /* their open fix that is only words: this message answers it */
        var nx = null;
        if (o.decide != null) {
          var dz = argObj(o.decide), x = rowOfKey(l, dz.key);
          if (dz.how !== 'use' || !x || !x.row.suggest || !x.row.next) return bad('A message decides a row of this week that has a suggestion, with “use”.', 'decide');
          if (x.row.decided || x.row.ruled) return fail('conflict', 'That row is decided already. Undo it first.');
          var ov = overRowOf(l), oit = C.get('over-' + l.id);
          if (ov && oit && !doneOf(oit.id) && x.k.wi === l.program.weekIdx && ov.day === x.day && ov.title === x.title && ov.target.r === x.row.written.r && ov.target.rpe === x.row.written.rpe) {
            if (ride && ride.itemId !== oit.id && o.ride != null) return bad('That message already carries another change.', 'decide');
            ride = { itemId: oit.id, actId: 'rule' };
          } else nx = { id: id, wi: x.k.wi + 1, day: x.day, title: x.title, occ: x.occ, gi: x.k.gi, w: x.row.suggest.kg, how: 'use', key: dz.key, lift: x.row.lift || null, r: x.row.next.r || null, rpe: x.row.next.rpe == null ? null : x.row.next.rpe };
        }
        /* something that goes with the words: a session of their week (week: 0 this week, 1 next; idx: the session) or your
           marks on a rep (n marks, the video they are on) */
        var att = null;
        if (o.attach != null) {
          var x0 = argObj(o.attach);
          if (x0.kind === 'session') { var wv0 = isNum(x0.week) ? weekView(l, x0.week) : null; if (!wv0 || !wv0.sessions.some(function (z) { return z.idx === x0.idx; })) return bad('That session is not in ' + l.first + '’s week.', 'attach'); var z0 = wv0.sessions.filter(function (z) { return z.idx === x0.idx; })[0]; att = { kind: 'session', week: x0.week, idx: x0.idx, name: z0.name, date: z0.date }; }
          else if (x0.kind === 'marks') { if (!isNum(x0.n) || x0.n < 1 || x0.n % 1) return bad('Marks on a rep are counted in whole numbers.', 'attach'); att = { kind: 'marks', n: x0.n, video: isStr(x0.video) ? x0.video : null }; }
          else return bad('Attach a session (kind: session) or your marks on a rep (kind: marks).', 'attach');
        }
        var at = stamp(); if (nx) nx.at = at;
        return commit('send', { id: id, text: t || (type === 'voice' ? 'Voice note · ' + mss(dur) : ''), type: type, ride: ride, next: nx, dur: dur, at: at, attach: att });
      },
      read: function (id) {
        var l = L(id); if (!l) return fail('not_found', 'There is no thread ' + (isStr(id) ? id : '') + '.');
        return commit('read', { id: id });
      }
    },

    billing: {
      summary: function () {
        return sel('bsum', undefined, function () {
          var o = money(), parts = [];
          parts.push(o.late.length === 0 ? 'nobody is overdue' : K.money(o.lateAmt) + ' is overdue from ' + (o.late.length === 1 ? o.late[0].first : numw(o.late.length) + ' of them'));
          if (o.apps) parts.push(o.apps === 1 ? 'one person wants to join' : numw(o.apps) + ' people want to join');
          if (o.paused.length) parts.push(o.paused.length === 1 ? o.paused[0].first + ' has paused' : numw(o.paused.length) + ' have paused');
          parts.push(o.free ? 'you have ' + K.plural(o.free, 'seat') + ' left' : 'you have no seats left');
          var last = parts.length - 1;
          var s = K.plural(o.n, 'lifter') + ' ' + (o.n === 1 ? 'pays' : 'pay') + ' you ' + K.money(o.month) + ' a month. ' + upper1(parts.map(function (t, i) { return (i === last && i > 0 ? 'and ' : '') + t; }).join(parts.length > 2 ? ', ' : ' ')) + '.';
          return { data: { sentence: s, month: { in: o.got, late: o.lateAmt, toCome: o.coming, total: o.total, cur: 'USD', perMonth: o.month, name: K.d(TODAY).toLocaleString('en-US', { month: 'long' }), end: MONTH_END, rows: clone(o.rows) },
            seats: { used: o.used, limit: D.coach.limit, plan: D.coach.plan, free: o.free, invited: o.invited },
            invite: { code: INVITE, link: 'powalifta.com/j/' + INVITE, url: 'https://powalifta.com/j/' + INVITE, text: 'powalifta.com/j/' + INVITE + ', ' + (o.free ? K.plural(o.free, 'seat') + ' left' : 'no seats left') },
            paying: o.n, late: o.late.map(function (l) { return l.id; }), in: o.rows.in.map(function (x) { return x.id; }), next: o.next.map(function (x) { return { id: x.id, date: x.date, amount: x.amount, inMonth: x.inMonth, paid: false }; }), nextTotal: o.nextTotal, nextUntil: o.until } };
        });
      },
      todo: function () { return sel('btodo', undefined, function () { var rows = todoRows(), by = {}; ['late', 'soon', 'app', 'paused', 'none'].forEach(function (k) { by[k] = rows.filter(function (r) { return r.kind === k && !r.done; }).length; }); return { data: clone(rows), meta: { open: rows.filter(function (r) { return !r.done; }).length, kinds: by } }; }); },
      /* the ledger, in one order every page shares (o.sort: 'state' (default: late, due soon, paused, no package, paid up;
         then the next due date), 'name', 'due', 'amount'; a leading minus for the other way) */
      list: function (o) {
        o = argObj(o); var sort = o.sort == null || o.sort === '' ? 'state' : o.sort, KEYS = ['state', 'name', 'due', 'amount'];
        if (!isStr(sort) || KEYS.indexOf(sort.replace(/^-/, '')) < 0) return bad('The ledger sorts by ' + KEYS.join(', ') + ', with a minus in front for the other way.', 'sort');
        return sel('blist', { sort: sort }, function () {
          var RK = { late: 0, soon: 1, paused: 2, none: 3, ok: 4 }, key = sort.replace(/^-/, ''), dir = sort.charAt(0) === '-' ? -1 : 1, rows = D.lifters.map(ledgerRow);
          var due = function (r) { return r.nextDue || '9999'; };
          rows.sort(function (a, b) { var c = key === 'name' ? a.name.localeCompare(b.name) : key === 'due' ? due(a).localeCompare(due(b)) : key === 'amount' ? (a.amount || 0) - (b.amount || 0) : (RK[a.status.state] - RK[b.status.state]) || due(a).localeCompare(due(b)); return c * dir || a.name.localeCompare(b.name); });
          return { data: rows, meta: { total: rows.length, sort: sort } };
        });
      },
      /* one lifter's ledger and moves (Clients' detail): the row, every payment, and their to-do row when they have one */
      get: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        return sel('bget', id, function () { var out = ledgerRow(l), td = todoRows().filter(function (r) { return r.lifterId === l.id; })[0] || null; out.payments = (l.payments || []).map(function (p) { return { on: p.on, amount: p.amount, method: p.method }; }); out.todo = td ? clone(td) : null; return { data: out }; });
      },
      /* the coach's packages, as the ledger has them, with how many lifters are on each (Set a package picks one) */
      packages: function () {
        return sel('pkgs', undefined, function () {
          var by = {}, out = [];
          D.lifters.forEach(function (l) { var b = l.billing; if (!b || !b.pkg) return; var k = b.pkg + '|' + b.amount + '|' + b.cadence; if (!by[k]) { by[k] = { id: slug(b.pkg), name: b.pkg, amount: b.amount, cadence: b.cadence, cur: b.cur || 'USD', price: price(b), lifters: 0 }; out.push(by[k]); } by[k].lifters++; });
          out.sort(function (a, b) { return b.lifters - a.lifters || a.name.localeCompare(b.name); });
          return { data: out };
        });
      },
      /* an answer to an applicant before deciding: the application stays open */
      reply: function (appId, text) {
        var x = apps().filter(function (z) { return z.id === appId || z.a.name === appId; })[0];
        if (!x || !x.it) return fail('not_found', 'There is no application ' + (isStr(appId) ? '“' + appId + '”' : '') + '.');
        var t = isStr(text) ? text.trim() : ''; if (!t) return bad('A reply needs words.', 'text');
        if (appOutcome(x)) return fail('conflict', x.a.name + ' has an answer already. Undo it first.');
        return commit('appReply', { appId: x.id, text: t, at: stamp() });
      },
      /* Undo in a to-do row (key: the row's key, its lifter's id or the application's id): its last move, after a reload too */
      undo: function (key) {
        var row = todoRows().filter(function (r) { return r.key === key || r.lifterId === key || r.id === key; })[0];
        if (!row) return fail('not_found', 'There is no to-do row ' + (isStr(key) ? key : '') + '.');
        var lid = row.lifterId, itemId = row.kind === 'app' ? row.itemId : row.kind === 'paused' ? 'quiet-' + lid : null;
        for (var i = LOG.length - 1; i >= 0; i--) { var r = LOG[i]; if ((lid && r.keys.indexOf('bill:' + lid) >= 0) || (itemId && r.items.indexOf(itemId) >= 0) || (row.kind === 'app' && r.keys.indexOf('appreply:' + row.id) >= 0)) return undoToken(r.t); }
        if (itemId && doneOf(itemId)) return PL.items.undo(itemId);
        return fail('nothing_to_undo', 'Nothing to undo on that row.');
      },
      markPaid: function (id, o) {
        var l = L(id); if (!l) return noLifter(id);
        o = argObj(o);
        if (!l.billing) return bad(l.first + ' has no package yet. Set one first.', 'id');
        if (!isNum(o.amount) || o.amount <= 0 || o.amount > 100000) return bad('A payment is an amount over 0.', 'amount');
        var on0 = o.on == null ? TODAY : o.on; if (!isIso(on0)) return bad('Paid on a date like 2026-11-10.', 'on');
        var method = o.method == null ? (((l.payments || [])[0] || {}).method || 'bank') : o.method;
        if (METHODS.indexOf(method) < 0) return bad('Paid by bank, card, PayPal or cash.', 'method');
        return commit('billPaid', { id: id, amount: o.amount, on: on0, method: method });
      },
      remind: function (id, when) {
        var l = L(id); if (!l) return noLifter(id);
        if (!l.billing) return bad(l.first + ' has no package yet.', 'id');
        var w = when == null ? (l.meet && l.meet.days === 0 ? 'tomorrow' : 'now') : when;
        if (w !== 'now' && w !== 'tomorrow') return bad('Remind now or tomorrow.', 'when');
        return commit('billRemind', { id: id, when: w, on: TODAY });
      },
      pause: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        if (!l.billing) return bad(l.first + ' has no package to pause.', 'id');
        if (payState(l).state === 'paused') return fail('conflict', l.first + '’s billing is paused already.');
        return commit('billState', { id: id, what: 'pause', on: TODAY });
      },
      restart: function (id) {
        var l = L(id); if (!l) return noLifter(id);
        if (!l.billing) return bad(l.first + ' has no package to restart.', 'id');
        if (payState(l).state !== 'paused') return fail('conflict', l.first + '’s billing is running already.');
        return commit('billState', { id: id, what: 'restart', on: TODAY });
      },
      setPackage: function (id, pkg) {
        var l = L(id); if (!l) return noLifter(id);
        pkg = argObj(pkg); var name = words0(pkg.name || pkg.pkg), amount = pkg.amount, cadence = pkg.cadence || 'monthly';
        if (!name) return bad('A package needs a name.', 'name');
        if (!isNum(amount) || amount <= 0 || amount > 100000) return bad('A price is an amount over 0.', 'amount');
        if (CADENCES.indexOf(cadence) < 0) return bad('A package is paid ' + CADENCES.join(', ') + '.', 'cadence');
        return commit('billState', { id: id, what: 'package', pkg: { name: name, amount: amount, cadence: cadence }, on: TODAY });
      },
      accept: function (appId) { return appMove(appId, true); },
      decline: function (appId) { return appMove(appId, false); }
    }
  };
  function appMove(appId, yes) {
    var x = apps().filter(function (z) { return z.id === appId || z.a.name === appId; })[0];
    if (!x || !x.it) return fail('not_found', 'There is no application ' + (isStr(appId) ? '“' + appId + '”' : '') + '.');
    var d = doneOf(x.it.id); if (d) return fail('conflict', x.a.name + ' has an answer already: ' + doneLabel(x.it, d) + '. Undo it first.');
    if (yes && money().free <= 0) return fail('conflict', 'Every seat is taken. Change plan first.');
    return commit('app', { appId: x.id, yes: !!yes, at: stamp() });
  }
  function itemOut(it) {
    var d = doneOf(it.id);
    /* the act table (shared.md §5) as coach.js holds it: one label, short, button and silent words, done words, says, the draft */
    return { id: it.id, ids: it.ids.slice(), group: it.group, tone: it.tone, kicker: it.kicker, title: it.title, meaning: it.meaning, rec: it.rec, reason: it.reason || '', context: it.context || '', person: it.person || null,
      /* spec C (FP §6.6): the row's ⋯ menu moves (first-<id>'s "Do it Saturday") in menu, never in acts: pages draw every act
         as a button, and coach.js keeps menu moves off the row (items.run(itemId, 'later') runs one) */
      ev: it.ev.map(plainEv), menu: (it.menu || []).map(function (a) { return { id: a.id, label: a.label, kind: 'quiet', done: a.done || null, says: a.says || null, remind: a.remind ? clone(a.remind) : null }; }),
      acts: it.acts.map(function (a) { return { id: a.id, label: a.label, short: a.short || a.label, kind: a.kind || null, button: a.button || null, silent: a.silent || null, done: a.done || null, says: actSays(it, a) || null, reply: a.reply != null ? a.reply : null, tell: a.reply != null ? a.tell || 'words' : null, required: tellRequired(a), keep: !!a.keep, copy: isStr(a.copy) ? a.copy : undefined, go: a.go ? { place: a.go.place, hash: a.go.hash, href: a.go.href } : null, ops: a.ops ? clone(a.ops) : null, lands: landsOf(it, a), remind: a.remind ? clone(a.remind) : null, ride: a.ride || null }; }),
      done: d ? { act: d.act, label: doneLabel(it, d), at: d.at || null, text: d.text || null, sent: !!d.text } : null, later: !!it.later, routine: !!it.routine };
  }
  function plainDay(x) { return x ? { name: x.name, date: day10(x.date), done: x.done || 0, sets: x.sets || 0, top: topOf(x) } : null; }
  function plainEv(e) {
    var o = {};
    Object.keys(e).forEach(function (k) {
      var x = e[k];
      if (k === 'l') o.id = x ? x.id : null;
      else if (k === 'day') o.day = plainDay(x);
      else if (k === 'rows') o.rows = x.map(function (r) { if (Array.isArray(r)) return r.slice(); var q = {}; Object.keys(r).forEach(function (rk) { var y = r[rk]; if (rk === 'l') q.id = y ? y.id : null; else if (rk === 'day') q.day = plainDay(y); else q[rk] = clone(y); }); return q; });
      else o[k] = clone(x);
    });
    return o;
  }
  /* a draft week (block.js JSON) as the program's week: days in order, an exercise per line group, a set per set. Every
     key the cell carries (BLOCK.CKEYS) reaches each set; a typed load stays typed (w), and where the coach wrote no load
     (RPE, a percent, "-12%" under the top set) w stays 0, as data.js writes such sets, and the engine's load rides along
     as planW (the number the Sheet shows, "to the half kilo"; block.js reads it back as the planned load). Without
     block.js on the page the sets carry the keys alone. */
  /* a draft week's days, dated from the block's start: week n's first day is the start plus 7 × (n − 1), and each day lands
     on its own weekday from there (Mei: Sun 15, Tue 17, Thu 19 Nov in week 5); a day with no weekday stays undated */
  function datedDays(l, dr, wn, days) {
    var p = l.program, st = (dr && dr.start) || (p && p.weeks[0] && (p.weeks[0].days.filter(function (d) { return d.date; })[0] || {}).date) || (p && p.startsOn) || null;
    var base = st ? K.add(day10(st), 7 * (wn - 1)) : null, wd = {};
    ((dr && dr.days) || []).forEach(function (d) { if (d && d.name != null && isNum(d.wd)) wd[d.name] = d.wd; });
    return days.map(function (d) { var o = clone(d); if (!o.date && base && wd[o.name] != null && o.exercises && o.exercises.length) { var b0 = K.d(base).getDay(); o.date = K.add(base, (wd[o.name] - b0 + 7) % 7); } return o; });
  }
  /* the maxes a send carries into the program: only the ones the coach typed (a max the block worked out from the lifting
     never becomes a typed max by being sent) */
  function typedMaxes(id, dr) { var l = K.L(id), out = {}, pm = l && l.program && l.program.maxes; LIFTS.forEach(function (k) { out[k] = draftTyped(id, k) ? dr.maxes[k] : pm && pm[k] != null ? pm[k] : null; }); return out; }
  function weekFromDraft(dr, c) {
    if (!dr || !Array.isArray(dr.weeks)) return null;
    if (!Array.isArray(dr.rows)) { var pw = dr.weeks[c]; return pw && Array.isArray(pw.days) ? clone(pw) : null; }
    var wk = dr.weeks[c]; if (!wk) return null;
    var Bk = BLK(), b = null; if (Bk) { try { b = Bk.from(dr); } catch (e) { b = null; } }
    var uid = wk.uid, dayNames = Array.isArray(dr.days) && dr.days.length ? dr.days.map(function (d) { return d.name; }) : uniq(dr.rows.map(function (r) { return r.day; }));
    return { days: dayNames.map(function (name) {
      var exs = [], byEx = {};
      dr.rows.forEach(function (r, ri) {
        if (r.day !== name) return;
        var cell = r.cells && r.cells[uid]; if (!cell || !(cell.n >= 1)) return;
        var key = r.ex == null ? r.key : r.ex, e = byEx[key];
        if (!e) { e = byEx[key] = { lift: r.lift || r.cat || null, variant: r.variant || '', title: r.title || r.name, note: r.note || '', sets: [] }; exs.push(e); }
        var plan = null;
        if (cell.w == null && b) { try { var ld = b.load(ri, c); if (ld && ld.kg != null) plan = ld; } catch (x) { plan = null; } }
        for (var i = 0; i < cell.n; i++) {
          var s = { w: cell.w != null ? cell.w : 0, r: cell.r, done: 0 };
          SET_KEYS.forEach(function (k) { if (cell[k] != null && cell[k] !== false && cell[k] !== '') s[k] = cell[k]; });
          if (s.pause == null && r.pause) s.pause = r.pause; if (s.tempo == null && r.tempo) s.tempo = r.tempo;
          if (plan) { s.planW = plan.kg; if (plan.kgHi != null) s.planWHi = plan.kgHi; }
          e.sets.push(s);
        }
      });
      return { name: name, date: null, sets: setsIn(exs), done: 0, exercises: exs };
    }) };
  }

  /* ================= LOGIC-FIX-1 (13 Nov): the next block (programs.md §8, §11.1; shared.md §6.4 { block: 'next' }) =================
     The next block is a block.js draft of its own (pl:v1:blocks:<id>:next). Until the coach saves one, a block that ended at
     a meet in the last 7 days has the recovery week BLOCK.recovery proposes as its week 1. A week number with no block
     named reads the current block, unless that week is lifted or past the block's end while a next block is due (Priya's
     week 1 is the recovery week: her block's week 1 was lifted in October). */
  function afterMeetDue(l) { var p = l && l.program; return !!(p && l.meet && l.meet.days <= 0 && l.meet.days >= -7 && p.weekIdx >= p.weeks.length - 1); }
  function nextDue(l) { return !!(l && l.program && (nextDrafts[l.id] || afterMeetDue(l))); }
  function whichOf(l, wn, o) {
    if (o && o.block != null) return o.block === 'next' || o.block === 'current' ? o.block : null;
    var p = l && l.program; if (!p || !isNum(wn) || !nextDue(l)) return 'current';
    var dr = drafts[l.id], len = Math.max(p.weeks.length, dr && Array.isArray(dr.weeks) ? dr.weeks.length : 0);
    return wn - 1 < p.weekIdx || wn > len ? 'next' : 'current';
  }
  function meetCtx(l) { return l && l.meet ? { meet: { date: day10(l.meet.date) || K.add(TODAY, l.meet.days), name: l.meet.name } } : undefined; }
  /* the next block as it stands: the saved draft, else the recovery week after a meet; null when there is none */
  function nextBlockOf(l) {
    var Bk = BLK(); if (!Bk || !l || !l.program) return null;
    if (nextDrafts[l.id]) { try { return { b: Bk.from(openerFollow(l, clone(nextDrafts[l.id]))), saved: true }; } catch (e) { return null; } }
    if (!afterMeetDue(l)) return null;
    var b0 = blockOf(l); if (!b0) return null;
    var rv = null; try { rv = Bk.recovery(b0, meetCtx(l)); } catch (e) { rv = null; }
    return rv && rv.block ? { b: rv.block, saved: false, rv: rv } : null;
  }
  function nextProposal(l, wn) {
    return cached('propN:' + l.id + ':' + wn, function () {
      var Bk = BLK(), nb = nextBlockOf(l);
      if (!nb) return { error: { code: 'not_found', message: l.first + ' has no next block to propose. Plan it first.' } };
      if (!nb.saved) {
        if (wn !== 1) return { error: { code: 'not_found', message: 'The recovery week is week 1 of ' + l.first + '’s next block.' } };
        var rv = nb.rv; return { c: 0, block: nb.b, kind: 'recovery', label: rv.label, changes: [], held: [], waits: [], missed: [], sent: false, toSend: 0, source: rv.source, sourceN: rv.n, words: rv.words || '', deloadText: rv.deloadText || '', from: rv.from };
      }
      if (!nb.b.weeks[wn - 1]) return { error: { code: 'not_found', message: 'The next block has no week ' + wn + '.' } };
      var res; try { res = Bk.propose(nb.b, wn - 1, { holds: holdsFor(l), today: TODAY, rules: rulesCtx() }); } catch (e) { res = { error: { code: 'invalid', message: 'That week cannot be proposed: ' + (e && e.message) } }; }
      if (res && res.error && res.error.code === 'locked' && nb.b.weeks[wn - 1].state === 'next') res = { c: wn - 1, block: nb.b, kind: 'rules', label: nb.b.weekName(wn - 1), changes: [], held: [], waits: [], missed: [], sent: !!nb.b.weeks[wn - 1].sent, toSend: 0 };
      return res;
    });
  }
  /* what a proposal answers (shared.md §6.4): the week's lines, the changes with their why, and the whole block (data.block,
     block.js JSON) so a page or a test reads the same proposal the grid shows */
  function proposalAnswer(l, wn, p, which) {
    var b = p.block, c = p.c, nm = function (r) { var row = b.rows[r]; return row ? row.name + (row.line ? ', ' + lower1(row.label || 'back-offs') : '') : ''; };
    var rows = []; b.rows.forEach(function (row, r) { var x = row.cells[b.weeks[c].uid]; if (!x) return; var cl = b.cell(r, c); rows.push({ key: row.key, day: row.day, name: row.name, line: row.line, lift: row.lift || null, text: cl ? cl.text : '', kg: b.load(r, c).kg, date: b.dateOf(c, row.day), cell: clone(x) }); });
    return { id: l.id, n: wn, c: c, block: b.toJSON(), which: which, kind: p.kind, label: p.label, sent: !!p.sent, toSend: p.toSend || 0, waitText: p.waitText || null, source: p.source != null ? p.source + 1 : null,
      changes: (p.changes || []).map(function (x) { return { r: x.r, key: x.key, name: nm(x.r), field: x.field, was: x.was, now: x.now, why: x.why, kind: x.kind }; }),
      held: (p.held || []).map(function (x) { return { r: x.r, key: x.key, name: nm(x.r), lift: x.lift, kg: x.kg, add: x.add, why: x.why, text: x.text, kind: x.kind, acts: (x.acts || []).slice() }; }),
      waits: (p.waits || []).map(function (x) { return { key: x.key, day: x.day, on: x.iso }; }), missed: (p.missed || []).map(function (x) { return { key: x.key, day: x.day, on: x.iso }; }), rows: rows };
  }
  /* the week words of the next block's weeks (shared.md §8) */
  function nextWeekWords(l) {
    var dr = nextDrafts[l.id], nb = ST.nextBlocks[l.id], out = [];
    if (dr && Array.isArray(dr.weeks)) {
      dr.weeks.forEach(function (w, i) {
        var n0 = i + 1, sentAt = (ST.nextSent[l.id] && ST.nextSent[l.id][n0]) || null, held = !!ST.held[l.id + ':next:' + n0], seenAt = ST.weekSeen[l.id + ':next:' + n0] || null;
        var state = held ? 'Held' : sentAt ? 'Sent ' + K.wd3(day10(localIso(tOf(sentAt)))) : 'Not sent';
        if (sentAt && seenAt) state += ', seen ' + String(localIso(tOf(seenAt))).slice(11, 16);
        var lab = w.label || null;
        out.push({ n: n0, block: 'next', name: lab || (w.phase ? w.phase + ', week ' + (w.pn || n0) : dr.name ? dr.name + ', week ' + n0 : 'Week ' + n0), state: state, kind: lab && /recovery/i.test(lab) ? 'Recovery week' : lab && /off/i.test(lab) ? 'Week off' : w.meet ? 'Meet week' : w.kind ? w.kind : w.deload ? 'Deload' : null, sentAt: sentAt, seenAt: seenAt, changedAt: null, changes: [], scheduledFor: null });
      });
      return out;
    }
    if (nb) nb.weeks.forEach(function (w, i) { out.push({ n: i + 1, block: 'next', name: w.label || 'Week ' + (i + 1), state: nb.sentAt && i === 0 ? 'Sent ' + K.wd3(nb.sentAt.slice(0, 10)) : 'Not sent', kind: w.label && /recovery/i.test(w.label) ? 'Recovery week' : w.label && /off/i.test(w.label) ? 'Week off' : null, sentAt: i === 0 ? nb.sentAt || null : null, seenAt: null, changedAt: null, changes: [], scheduledFor: null }); });
    return out;
  }
  /* FIX-LOGIC (FP F6.2, P-MEETS-TEAMS): a run-in's "Opener practice" single is the planned opener (PL.meets.plan's
     attempts[lift][0]), and follows it while it is still to lift: the answer is worked out on read, so a reload, an Undo and
     a changed opener all agree; a sent week whose opener moved reads as a change to send (the block's own snapshot) */
  function openerFollow(l, j) {
    if (!l || !l.meet || !j || !Array.isArray(j.rows) || !Array.isArray(j.weeks)) return j;
    var pl = planOf(l); if (!pl || !pl.a) return j;
    j.weeks.forEach(function (w) {
      if (!w || !w.uid || w.state === 'lifted') return;
      j.rows.forEach(function (row) {
        if (!row || !row.lift || !MAIN[row.lift] || (row.variant && row.variant !== 'Competition')) return;
        var x = row.cells && row.cells[w.uid]; if (!x || x.lifted || !/^opener practice$/i.test(String(x.note || '').trim())) return;
        if (w.started && w.started[row.day]) return;
        var kg = pl.a[row.lift] && pl.a[row.lift][0]; if (!isNum(kg) || !(kg > 0)) return;
        x.w = kg; delete x.wHi; delete x.pct; delete x.pctHi; delete x.off; delete x.rpe; delete x.rpeHi; delete x.rir; delete x.bw;
      });
    });
    return j;
  }
  function nextAnswer(l) {
    var dr = nextDrafts[l.id], nb = ST.nextBlocks[l.id], meta = { which: 'next', draft: !!dr, held: heldOf(l.id, 'next'), next: nb ? { name: nb.name, startsOn: nb.startsOn, weeks: nb.weeks.length } : null };
    if (!dr) { meta.none = true; return { data: null, meta: meta }; }
    var out = openerFollow(l, clone(dr)); out.lifterId = l.id; meta.startsOn = dr.start || (nb && nb.startsOn) || null;
    /* LOGIC-FIX-4 (walk 2, Arjun's run-in from 14 Dec after a block ending 28 Nov): the weeks between the current block's last
       session and the next block's first are named, so the gap is filled or flagged, never silent */
    var Bk = BLK(), first = null; if (Bk) { try { var nbk = Bk.from(dr); nbk.weeks.forEach(function (w, c) { nbk.days.forEach(function (d) { if (!nbk.rows.some(function (row) { return row.day === d.name && row.cells[w.uid]; })) return; var x = nbk.dateOf(c, d.name); if (x && (!first || x < first)) first = x; }); }); } catch (e) { first = null; } }
    var lastCur = null; if (l.program) l.program.weeks.forEach(function (w, wi) { trainDays(w).forEach(function (d) { var x = dayDateOf(l, wi, d.name); if (x && (!lastCur || x > lastCur)) lastCur = x; }); });
    meta.firstSession = first; meta.currentEnds = lastCur;
    if (first && lastCur && K.daysTo(first) - K.daysTo(lastCur) > 8) { var gFrom = K.add(lastCur, 1), gTo = K.add(first, -1), gw = Math.round((K.daysTo(gTo) - K.daysTo(gFrom) + 1) / 7); meta.gap = { from: gFrom, to: gTo, weeks: gw, text: 'Nothing written ' + dmyOf(gFrom) + ' to ' + dmyOf(gTo) + (gw >= 1 ? ' (' + K.plural(gw, 'week') + ')' : '') + '.' }; }
    return { data: out, meta: meta };
  }
  /* a week of the next block goes to the lifter (one write; held behind its toast like any send) */
  function nextSendOp(a, ctx) {
    var l = L(a.id); if (!l || !l.program) return fail('not_found', 'There is no program to send from.');
    var undos = [], key = l.id + ':next:' + a.n, hold = !(ctx && ctx.replay) && isNum(a.hold) && a.hold > 0;
    if (a.save && !nextDrafts[l.id]) { nextDrafts[l.id] = clone(a.save); undos.push(function () { delete nextDrafts[l.id]; }); }
    var nb = nextDrafts[l.id], wk = nb && Array.isArray(nb.weeks) ? nb.weeks[a.n - 1] : null;
    if (!wk) { chain(undos)(); return fail('not_found', 'There is no week ' + a.n + ' of the next block to send.'); }
    /* spec C (FP F1.3): a week of a template appended after the recovery week goes by that template's name ("Strength Block week 1") */
    var sbw = ST.nextBlocks[l.id] && ST.nextBlocks[l.id].weeks ? ST.nextBlocks[l.id].weeks[a.n - 1] : null, ph = sbw && sbw.phase ? sbw.phase : null;
    var recov = !!(wk.label && /recovery/i.test(wk.label)), what = recov ? 'Recovery week' : ph ? ph + ' week ' + (sbw.n || a.n) : 'Week ' + a.n + ' of ' + (nb.name || 'the next block');
    function land() {
      var w = nextDrafts[l.id] && nextDrafts[l.id].weeks[a.n - 1], pw = a.prevWeek || {};
      if (w) { w.sent = true; w.sentAt = a.at; w.version = (isNum(pw.version) ? pw.version : 0) + 1; }
      var ns = ST.nextSent[l.id] = ST.nextSent[l.id] || {}; ns[a.n] = a.at;
      var msg = null, ur = null, iu = [];
      if (isStr(a.message) && a.message) { msg = { me: true, body: a.message, at: a.at, read: true, type: 'text', meta: { week: a.n, block: 'next' } }; l.messages = l.messages || []; l.messages.push(msg); ur = markRead(l); }
      (a.items || []).forEach(function (iid) { if (C.get(iid) && !doneOf(iid)) iu.push(itemDone(iid, { act: 'program', at: a.at, label: what + ' sent' })); });
      return function () {
        chain(iu)(); if (ur) ur(); if (msg) { var mi = l.messages.indexOf(msg); if (mi >= 0) l.messages.splice(mi, 1); }
        var s0 = ST.nextSent[l.id]; if (s0) { delete s0[a.n]; if (!Object.keys(s0).length) delete ST.nextSent[l.id]; }
        var w2 = nextDrafts[l.id] && nextDrafts[l.id].weeks[a.n - 1]; if (w2) ['sent', 'sentAt', 'version'].forEach(function (k) { if (pw[k] == null) delete w2[k]; else w2[k] = pw[k]; });
      };
    }
    var said = what + ' sent to ' + l.first + (isStr(a.note) && a.note ? ' with the note “' + a.note + '”' : '.') + (isStr(a.message) && a.message ? ' Sent to ' + l.first + ': “' + a.message + '”' : '');
    var back = what + ' taken back from ' + l.first + '.', sItems = (a.items || []).filter(function (iid) { return C.get(iid) && !doneOf(iid); });
    if (!hold) {
      undos.push(land());
      return { changed: true, kind: 'program', persist: true, nexts: [l.id], data: { id: l.id, n: a.n, block: 'next', held: false }, keys: ['next:' + l.id, 'week:' + l.id + ':next:' + a.n].concat(sItems.map(function (x) { return 'item:' + x; })), items: sItems, ids: [l.id].concat(sItems),
        events: [['program:sent', { id: l.id, n: a.n, block: 'next' }]].concat(isStr(a.message) && a.message ? [['message:sent', { id: l.id }]] : []), undo: chain(undos), label: said, undoLabel: back };
    }
    var h = { id: l.id, n: a.n, at: a.at, until: new Date(Date.parse(a.at) + a.hold).toISOString(), land: land, t: null, timer: null, draft: false, next: true };
    ST.held[key] = h;
    undos.push(function () { if (ST.held[key] === h) { if (h.timer) clearTimeout(h.timer); delete ST.held[key]; } });
    return { changed: true, kind: 'program', persist: false, nexts: a.save ? [l.id] : [], data: { id: l.id, n: a.n, block: 'next', held: true, until: h.until }, keys: ['next:' + l.id, 'week:' + l.id + ':next:' + a.n], ids: [l.id],
      events: [['program:saved', { id: l.id, n: a.n, block: 'next', held: true }]], undoEvents: [['program:saved', { id: l.id, n: a.n, block: 'next', held: false }]],
      undo: chain(undos), label: said,
      undoLabel: function () { return ST.held[key] === h ? what + ' is back with you. ' + l.first + ' never saw it.' : back; },
      after: function (rec) { h.t = rec.t; h.timer = setTimeout(function () { landHeld(key); }, a.hold); } };
  }

  /* the arguments of a send of week wn of the current block (programs.send and a move run with sendWeek: true, request #13) */
  /* LOGIC-FIX-4 (walk 2, "heavy triple" in Reps): a week holding a cell that could not be read never goes to the lifter;
     the refusal names the cell and what to type instead */
  function unreadIn(dr, c) {
    var Bk = BLK(); if (!Bk || !dr || !Array.isArray(dr.rows)) return null;
    var b; try { b = Bk.from(dr); } catch (e) { return null; }
    var w = b.weeks[c]; if (!w || typeof b.badIn !== 'function') return null;
    var rs = b.badIn(c); if (!rs || !rs.length) return null;
    var row = b.rows[rs[0]], bf = row.badf && row.badf[w.uid], f = bf ? Object.keys(bf)[0] : null, txt = bf ? bf[f] : row.bad && row.bad[w.uid];
    var where = row.name + (f ? ' ' + ({ effort: 'RPE', load: 'load', reps: 'reps', sets: 'sets' }[f] || f) : '');
    var msg = 'Week ' + (w.n || c + 1) + ' has a cell that could not be read: “' + txt + '” in ' + where + '. Write it as 3x3 @8 or 180x3, then send.';
    return fail('invalid', msg, [{ field: 'week', message: msg, rows: rs.slice() }]);
  }
  function sendArgsFor(id, wn, o) {
    var l = K.L(id), p = l && l.program; if (!p) return fail('not_found', 'There is no program to send from.'); o = o || {};
    var dr = drafts[id], hold = o.hold == null ? 0 : o.hold;
    /* a week only the draft holds lands in the program when it is sent (and any week of the draft before it, written,
       not sent), each day dated from the block's start */
    var adds = [];
    if (wn > p.weeks.length) {
      for (var k0 = p.weeks.length + 1; k0 <= wn; k0++) { var wf = dr ? weekFromDraft(dr, k0 - 1) : null; if (!wf || !wf.days) return bad('There is no week ' + k0 + ' written to send.', 'n'); adds.push({ n: k0, days: datedDays(l, dr, k0, wf.days) }); }
    }
    if (wn - 1 < p.weekIdx) return fail('locked', 'Week ' + wn + ' was lifted. Send a week that is still to come.');
    if (ST.held[id + ':' + wn]) return fail('conflict', 'Week ' + wn + ' is on its way to ' + l.first + ' already.');
    var unread = unreadIn(dr, wn - 1); if (unread) return unread;
    var conv = dr ? weekFromDraft(dr, wn - 1) : null, dw = dr && Array.isArray(dr.weeks) ? dr.weeks[wn - 1] : null;
    var pw = dw && typeof dw === 'object' ? { sent: dw.sent, sentAt: dw.sentAt === undefined ? null : dw.sentAt, version: dw.version === undefined ? null : dw.version, was: dw.was === undefined ? null : clone(dw.was), taken: dw.taken === undefined ? null : dw.taken } : null;
    return ({ id: id, n: wn, at: stamp(), week: conv, adds: adds.length ? adds : null, name: dr && dr.name && dr.name !== p.name && !(D.team && p.name === D.team.program) ? dr.name : null, maxes: dr && dr.maxes ? typedMaxes(id, dr) : null, prevSent: dw && typeof dw === 'object' ? (dw.sent === undefined ? null : dw.sent) : null, prevWeek: pw, hold: hold, note: isStr(o.note) && o.note.trim() ? o.note.trim() : undefined, message: isStr(o.message) && o.message.trim() ? o.message.trim() : undefined, items: Array.isArray(o.items) && o.items.length ? o.items.slice() : undefined });
  }
  /* ================= STORE-1 calls (spec B, 13 Nov 2026): contract v1 shapes, additive ================= */
  function moveSessionDay(l, wi, di, iso, o) {
    o = o || {};
    if (!l || !l.program) return fail('not_found', 'No program to move a session in.');
    if (!isIso(iso)) return bad('A day is a date like 2026-11-12.', 'date');
    var w = l.program.weeks[wi], d = w && w.days[di];
    if (!d || !(d.exercises && d.exercises.length)) return fail('not_found', 'That session is not in ' + l.first + '’s program.');
    if (d.done > 0) return fail('locked', d.name + ' is lifted already.');
    var was = dayDateOf(l, wi, d.name);
    if (was === iso) return bad(d.name + ' is already on ' + K.wd(iso) + '.', 'date');
    if (iso < TODAY) return bad('That day has passed. Pick today or a day to come.', 'date');
    if (o.scope != null && o.scope !== 'week' && o.scope !== 'on') return bad('A move is for this week (week) or from here on (on).', 'scope');
    return commit('moveDay', { id: l.id, wi: wi, di: di, iso: iso, scope: o.scope || 'week', publish: o.publish !== false, at: stamp() });
  }
  /* the week words (shared.md §8): one state and one kind per week */
  function weekWords(l, wi) {
    var p = l.program, w = p.weeks[wi], dr = drafts[l.id], dw = dr && Array.isArray(dr.weeks) ? dr.weeks[wi] : null;
    var sentAt = w && w.sentAt ? w.sentAt : null, seenAt = ST.weekSeen[l.id + ':' + (wi + 1)] || (w && w.seenAt) || null, sched = ST.sched[l.id + ':' + (wi + 1)] || null;
    var tmH = teamOfLifter(l), ch = w && w.changedSinceSent ? w.changedSinceSent.length : 0, held = !!ST.held[l.id + ':' + (wi + 1)] || !!(tmH && ST.teamHeld[slug(tmH.name) + ':' + l.id + ':' + (wi + 1)]), gap = teamGap(tmH, l, wi + 1); if (gap) ch++;
    var unsent = !w ? true : (dw ? dw.sent === false && dw.state !== 'lifted' : w.published === false && !sentAt);
    /* request #30: a sent week the coach edited in the draft is "2 changes to send", the changes listed (shared.md §8) */
    var dch = null;
    if (unsent && w && wi > p.weekIdx && (sentAt || w.published === true) && dw) { dch = draftChanges(l.id, wi); if (dch && dch.length) { unsent = false; ch = dch.length; } else dch = null; }
    /* LOGIC-FIX-4 (walk 2, Nina): this week edited in the draft after it went is "This week, 1 change to send", the changes
       listed, until the send lands it (never a plain "This week" that hides whether she has 77.5 or 90) */
    var nowCh = null; if (w && wi === p.weekIdx && dw && (sentAt || w.published === true)) { nowCh = draftChanges(l.id, wi); if (!(nowCh && nowCh.length)) nowCh = null; else { dch = nowCh; ch = nowCh.length; } }
    var state = wi < p.weekIdx ? 'Lifted' : wi === p.weekIdx ? (nowCh ? 'This week, ' + K.plural(nowCh.length, 'change') + ' to send' : 'This week') : held ? 'Held' : !w && !dw ? 'Not written' : sched && unsent ? 'Goes out ' + K.wd3(sched) + ' ' + K.d(sched).getDate() : unsent ? 'Not sent' : ch ? K.plural(ch, 'change') + ' to send' : sentAt ? 'Sent ' + K.wd3(day10(localIso(tOf(sentAt)))) : 'Not sent';
    if (/^Sent /.test(state) && seenAt) state += ', seen ' + (String(seenAt).slice(0, 10) === nowIso().slice(0, 10) ? '' : K.wd3(String(seenAt).slice(0, 10)) + ' ') + String(localIso(tOf(seenAt))).slice(11, 16);
    /* spec C (FTC §7.1): a week's phase (Build, Deload, Heavy, Peak, Meet week, New maxes) is its kind */
    var kind = w && w.label ? w.label : w && w.kind ? w.kind : w && (w.deload || /deload/i.test(w.name || '')) ? 'Deload' : w && isPeakWk(w) ? 'Meet week' : null;
    /* LOGIC-FIX-3 (Programs' request, F27): a week only the draft holds (added, or imported from a sheet) is listed with its
       own words: "Not sent" until its send lands it in the program */
    if (!w && dw) { var dl = dw.label || null; kind = dl && /recovery/i.test(dl) ? 'Recovery week' : dw.meet ? 'Meet week' : dw.kind ? dw.kind : dw.deload ? 'Deload' : dl; }
    var dname = !w && dw ? (dw.label || (dw.phase ? dw.phase + ', week ' + (dw.pn || wi + 1) : null)) : null;
    return { n: wi + 1, block: 'current', name: (w && w.name) || dname || 'Week ' + (wi + 1), state: state, kind: kind, sentAt: sentAt, seenAt: seenAt, changedAt: w && w.changedAt ? w.changedAt : null, changes: dch ? dch : (w && w.changedSinceSent ? w.changedSinceSent.slice() : []).concat(gap ? [gap] : []), scheduledFor: sched,
      /* LOGIC-FIX-4 (walk 2, Kofi "1 change to send" beside a Send that reads Sent): a change that is the team's goes out from
         Teams; sendVia says where its Send is ('team' with the team's id), so the page never offers a dead Send */
      sendVia: gap && !dch ? { place: 'teams', team: teamOfLifter(l) ? slug(teamOfLifter(l).name) : null } : null };
  }
  /* the lines of a sent week the draft changed, by block.js (b.changes): [{ key, name, was, now }] */
  function draftChanges(id, wi) {
    var Bk = BLK(), dr = drafts[id]; if (!Bk || !dr) return null;
    return cached('dch:' + id + ':' + wi, function () {
      var b; try { b = Bk.from(dr); } catch (e) { return null; }
      var cc; try { cc = b.changes(wi); } catch (e) { return null; }
      if (!cc || !cc.n) return [];
      var w = b.weeks[wi], was = (w && w.was) || {};
      return (cc.cells || []).map(function (r) { var row = b.rows[r], x = row ? row.cells[w.uid] : null, cl = row ? b.cell(r, wi) : null; return row ? { key: row.key, name: row.name + (row.line ? ', ' + lower1(row.label || 'back-offs') : ''), was: was[row.key] != null ? was[row.key] : null, now: cl ? cl.text + (cl.kg != null && !/kg\b/.test(cl.text) ? ', ' + n(cl.kg) + ' kg' : '') : x ? Bk.text(x) : '', kg: cl && cl.kg != null ? cl.kg : null } : null; }).filter(Boolean);
    });
  }
  function listFilterOk(f) { return !!fOf(f) || EXTRA_F.indexOf(f) >= 0; }
  var EXTRA_F = ['waiting', 'nocheckin', 'done', 'since', 'changed'];
  var SORTS2 = ['triage', 'total', 'change', 'sessions', 'status'];

  /* the reads and writes STORE-1 adds to PL (each a contract v1 shape) */
  (function (P) {
    P.now = function () { return nowIso(); };
    /* the demo clock (tests, the demo's time travel): later only */
    P.setNow = function (iso) { var t = tOf(iso); if (!isStr(iso) || isNaN(t)) return bad('A time is like 2026-11-13T20:00.', 'at'); if (t < lastStamp) return bad('The demo clock only moves on.', 'at'); lastStamp = t; dayOn(); syncNew(); bump(); emit('change', { type: 'clock', ids: [], v: v }); return ok({ now: nowIso() }, { undo: null, label: '' }); };

    /* Programs (programs.md §11.1, §11.2; shared.md §6.4) */
    P.programs.queue = function () { return sel('pqueue', undefined, function () { var q = queueRows(); return { data: q.rows, meta: q.meta }; }); };
    P.programs.proposal = function (id, wn, o) {
      var l = L(id); if (!l) return noLifter(id);
      if (!l.program) return bad(l.first + ' has no program yet.', 'id');
      if (!isNum(wn) || wn % 1 || wn < 1) return bad('A week is a number from 1.', 'n');
      if (!BLK()) return fail('invalid', 'The proposal needs block.js on the page.');
      var which = whichOf(l, wn, argObj(o)); if (!which) return bad('A block is current or next.', 'block');
      return sel('proposal', { id: id, n: wn, block: which }, function () {
        var p = which === 'next' ? nextProposal(l, wn) : proposalOf(l, wn); if (!p) return fail('not_found', 'There is no week ' + wn + ' to propose.');
        if (p.error) return { error: p.error };
        return { data: proposalAnswer(l, wn, p, which) };
      });
    };
    P.programs.weeks = function (id) {
      var l = L(id); if (!l) return noLifter(id);
      return sel('pweeks', id, function () {
        if (!l.program) return { data: [], meta: { none: true } };
        var dr = drafts[id], nW = Math.max(l.program.weeks.length, dr && Array.isArray(dr.weeks) ? dr.weeks.length : 0), cur = [];
        for (var wi = 0; wi < nW; wi++) cur.push(weekWords(l, wi));   /* the draft's own weeks past the program's too (LOGIC-FIX-3) */
        /* LOGIC-FIX-4 (walk 2, Nina): each week still to come says how many lines are off for this lifter (a load about @10
           where @7.5 is written), sent weeks included, so fixing week 1 can offer weeks 2 and 3 */
        var eng = engineOf(l);
        if (eng && eng.b) cur.forEach(function (x, i) { if (i < l.program.weekIdx || !eng.b.weeks[i]) { x.check = 0; return; } var ck = []; try { ck = eng.b.checks(i).filter(function (q) { return q.kind === 'heavy' || q.kind === 'light'; }); } catch (e) { ck = []; } x.check = ck.length; x.checkRows = ck.map(function (q) { return eng.b.rows[q.r] ? eng.b.rows[q.r].key : null; }).filter(Boolean); });
        var out = cur.concat(nextWeekWords(l));
        return { data: out, meta: { total: out.length } };
      });
    };
    P.programs.dates = function (id, wn, o) {
      var l = L(id); if (!l) return noLifter(id); if (!l.program) return bad(l.first + ' has no program yet.', 'id'); o = argObj(o);
      /* request #40: the shared draft's dates win (a day swap or a move saved there), and a week only the draft holds is listed;
         { block: 'next' } reads the next block's draft */
      var Bk = BLK(), dsrc = o.block === 'next' ? nextDrafts[id] : drafts[id];
      /* LOGIC-FIX-4 (QA-SYNC, numbers flow): one date per session. With no draft, the program as every read sees it (a
         this-week move applied: Kofi's deadlift Sat 14), not the raw program's pattern date (Fri 13) */
      if (Bk && !dsrc && o.block !== 'next') { var pa0 = programAnswer(l); if (pa0 && pa0.data && Array.isArray(pa0.data.weeks) && pa0.data.weeks.length >= l.program.weeks.length) dsrc = pa0.data; }
      if (Bk && dsrc && Array.isArray(dsrc.weeks)) {
        if (!isNum(wn) || wn < 1 || wn > Math.max(dsrc.weeks.length, o.block === 'next' ? 0 : l.program.weeks.length)) return bad('Week 1 to ' + Math.max(dsrc.weeks.length, l.program.weeks.length) + '.', 'n');
        if (wn <= dsrc.weeks.length) return sel('pdatesD', { id: id, n: wn, b: o.block || 'current' }, function () {
          var b; try { b = Bk.from(dsrc); } catch (e) { b = null; } if (!b) return fail('invalid', 'That program cannot be read.');
          var c = wn - 1, w = b.weeks[c], days = b.days.filter(function (d) { return b.rows.some(function (row) { return row.day === d.name && row.cells[w.uid]; }); }).map(function (d) {
            return { name: d.name, date: b.dateOf(c, d.name), fixed: !!(w.dates && w.dates[d.name]), moved: !!(w.moved && w.moved[d.name]), off: !!(w.off && w.off[d.name]) };
          });
          var ds = days.map(function (x) { return x.date; }).filter(Boolean).sort();
          return { data: { days: days, from: ds[0] || null, to: ds[ds.length - 1] || null, block: o.block || 'current' } };
        });
      }
      if (o.block === 'next') return fail('not_found', l.first + ' has no next block written yet.');
      if (!isNum(wn) || wn < 1 || wn > l.program.weeks.length) return bad('Week 1 to ' + l.program.weeks.length + '.', 'n');
      return sel('pdates', { id: id, n: wn }, function () {
        var w = l.program.weeks[wn - 1], days = trainDays(w).map(function (d) { var iso = dayDateOf(l, wn - 1, d.name); return { name: d.name, date: iso, fixed: !!d.date, moved: !!(d.changed && /^Moved/.test(d.changed)), off: false }; });
        var ds = days.map(function (x) { return x.date; }).filter(Boolean).sort();
        return { data: { days: days, from: ds[0] || null, to: ds[ds.length - 1] || null } };
      });
    };
    P.programs.moveSessionDay = function (id, wi, di, iso, o) { var l = L(id); if (!l) return noLifter(id); return moveSessionDay(l, wi, di, iso, argObj(o)); };
    P.programs.change = function (id, ops, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!l.program) return bad(l.first + ' has no program to change.', 'id');
      if (!Array.isArray(ops) || !ops.length) return bad('A change is a list of ops.', 'ops');
      if (!BLK()) return fail('invalid', 'Changing a program needs block.js on the page.');
      var b = blockOf(l); if (!b) return fail('invalid', 'That program cannot be read.');
      var t = applyOps(BLK().from(b.toJSON()), clone(ops)); if (t.error) return { error: t.error };   /* refuse before writing */
      return commit('change', { id: id, ops: clone(ops), label: isStr(o.label) ? o.label : null, at: stamp(), prop: isNum(o.propose) ? o.propose : undefined });
    };
    P.programs.next = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!l.program) return bad(l.first + ' has no block to follow. Start a first block instead.', 'id');
      var from = o.from || 'recovery', FR = ['recovery', 'template', 'repeat', 'blank', 'off'];
      if (FR.indexOf(from) < 0) return bad('The next block comes from ' + FR.join(', ') + '.', 'from');
      /* a next block the coach saved or sent (the recovery week) counts as the next block too: a template goes after it */
      var nd0 = nextDrafts[l.id], cur = ST.nextBlocks[l.id] || (nd0 ? { name: nd0.name || 'Next block', startsOn: nd0.start || null, weeks: (nd0.weeks || []).map(function (w) { return { label: w.label || null }; }) } : null);
      var onlyRest = cur && cur.weeks.every(function (w) { return w.label && /recovery|off/i.test(w.label); });
      if (cur && !(onlyRest && from !== 'recovery' && from !== 'off')) return fail('conflict', l.first + ' has a next block already: ' + cur.name + ' from ' + dmyOf(cur.startsOn) + '.');
      var p = l.program, lastDay = null; p.weeks.forEach(function (w, wi) { trainDays(w).forEach(function (d) { var x = dayDateOf(l, wi, d.name); if (x && (!lastDay || x > lastDay)) lastDay = x; }); });
      if (o.startsOn != null && (!isIso(o.startsOn) || (lastDay && o.startsOn <= lastDay && !(l.meet && l.meet.days <= 0)))) return bad('The next block starts after ' + dmyOf(lastDay) + '.', 'startsOn');
      var weeks = [], name = 'Next block', starts = isIso(o.startsOn) ? o.startsOn : null, src = srcWeek(p);
      if (from === 'recovery' || from === 'off') { name = l.meet && l.meet.days <= 0 ? 'After the ' + l.meet.name : from === 'off' ? 'Week off' : 'Recovery'; weeks.push({ label: from === 'off' ? 'Week off' : 'Recovery week', days: from === 'off' ? [] : trainDays(p.weeks[src]).map(function (d) { return d.name; }) }); starts = starts || (l.meet && l.meet.days <= 0 ? afterMeetOn(l) : K.add(lastDay || TODAY, 1)); }
      if (from === 'repeat') { name = p.name; p.weeks.forEach(function (w, i) { weeks.push({ label: null, n: i + 1, days: trainDays(w).map(function (d) { return d.name; }) }); }); }
      if (from === 'template') { var t = templates().filter(function (x) { return x.id === o.template || x.name === o.template || slug(x.name) === o.template; })[0]; if (!t) return fail('not_found', 'There is no template called ' + (o.template == null ? 'that' : '“' + o.template + '”') + '.'); name = t.name; for (var i = 0; i < t.weeks; i++) weeks.push({ label: null, n: i + 1, days: t.days.slice() }); }
      if (from === 'blank') { name = 'New block'; weeks.push({ label: null, n: 1, days: trainDays(p.weeks[src]).map(function (d) { return d.name; }) }); }
      var append = !!cur;
      if (append) starts = cur.startsOn;
      starts = starts || K.add(lastDay || TODAY, 1);
      return commit('nextBlock', { id: id, name: name, startsOn: starts, weeks: weeks, from: from, append: append, days: Array.isArray(o.days) && o.days.length ? weekdays(o.days) : undefined, merge: o.merge && isStr(o.merge.day) && isStr(o.merge.into) ? { day: o.merge.day, into: o.merge.into } : undefined, at: stamp(), label: append ? name + ' added after ' + (onlyRest ? 'the ' + lower1(cur.weeks[0].label || 'recovery week') : soft1(cur.name)) + '. Not sent.' : l.first + '’s next block: ' + name + ' from ' + dmyOf(starts) + '. Not sent.' });
    };
    P.programs.append = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!ST.nextBlocks[l.id]) return bad('Plan the next block first, then add a template after it.', 'id');
      var t = templates().filter(function (x) { return x.id === o.template || x.name === o.template || slug(x.name) === o.template; })[0]; if (!t) return fail('not_found', 'There is no template called ' + (o.template == null ? 'that' : '“' + o.template + '”') + '.');
      var weeks = []; for (var i = 0; i < t.weeks; i++) weeks.push({ label: null, phase: t.name, n: i + 1, days: t.days.slice() });
      return commit('nextBlock', { id: id, name: ST.nextBlocks[l.id].name, startsOn: ST.nextBlocks[l.id].startsOn, weeks: weeks, from: 'template', append: true, at: stamp(), label: t.name + ' added after the next block. Not sent.' });
    };
    P.programs.schedule = function (id, ns, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!l.program) return bad(l.first + ' has no program to schedule.', 'id');
      ns = Array.isArray(ns) ? ns : [ns];
      if (!ns.length || ns.some(function (x) { return !isNum(x) || x % 1 || x - 1 <= l.program.weekIdx || x > l.program.weeks.length; })) return bad('Schedule weeks still to come, 1 to ' + l.program.weeks.length + '.', 'n');
      if (o.on != null && o.on !== 'firstDay') return bad('A week goes out on its first day (on: firstDay).', 'on');
      return commit('schedule', { id: id, ns: ns.slice(), at: stamp() });
    };
    P.programs.seen = function (id, wn) {
      var l = L(id); if (!l) return noLifter(id);
      if (!l.program || !isNum(wn) || !l.program.weeks[wn - 1]) return bad('There is no week ' + wn + ' to see.', 'n');
      return commit('seen', { what: 'week', key: l.id + ':' + wn, id: l.id, at: stamp() });
    };

    /* Items (shared.md §6.1) */
    P.items.preview = function (itemId, actId, o) {
      var it = isStr(itemId) ? C.get(itemId) : null; if (!it) return fail('not_found', 'There is no item ' + (isStr(itemId) ? itemId : '') + '.');
      var a = actOf(it, actId); if (!a) return fail('not_found', 'That move is not one of this item’s: ' + it.acts.map(function (x) { return x.label; }).join(', ') + '.');
      o = argObj(o);
      if (o.for != null && it.ids.indexOf(o.for) < 0) return fail('not_found', 'That lifter is not on this item.');
      return sel('preview', { itemId: itemId, actId: actId, o: o }, function () { return { data: previewOf(it, a, o) }; });
    };
    P.items.settle = function (itemId, o) {
      var it = isStr(itemId) ? C.get(itemId) : null; if (!it) return fail('not_found', 'There is no item ' + (isStr(itemId) ? itemId : '') + '.');
      o = argObj(o); if (doneOf(it.id)) return fail('conflict', 'Already done: ' + doneLabel(it, doneOf(it.id)) + '. Undo it first.');
      return commit('settle', { itemId: it.id, label: isStr(o.label) && o.label.trim() ? o.label.trim() : null, at: stamp() });
    };

    /* Lifters (overview-lifters.md §9.1; shared.md §6.3, §6.4, §6.6, §6.7, §6.15) */
    var list0 = P.lifters.list;
    P.lifters.list = function (o) {
      o = argObj(o);
      var f = o.f == null || o.f === '' ? 'all' : o.f, sort = o.sort == null || o.sort === '' ? null : o.sort, ids = Array.isArray(o.ids) ? o.ids.filter(isStr) : null;
      if (!listFilterOk(f)) return bad('There is no list called “' + f + '”. Try ' + FILTERS.map(function (x) { return x[0]; }).concat(EXTRA_F).join(', ') + '.', 'f');
      var sk = isStr(sort) ? sort.replace(/^-/, '') : null;
      if (sort != null && (!isStr(sort) || (SORTS.indexOf(sk) < 0 && SORTS2.indexOf(sk) < 0))) return bad('A list sorts by ' + SORTS.concat(SORTS2).join(', ') + ', with a minus in front for the other way.', 'sort');
      if (ids && ids.some(function (x) { return !K.L(x); })) return noLifter(ids.filter(function (x) { return !K.L(x); })[0]);
      var base = fOf(f) && SORTS.indexOf(sk) >= 0 || (fOf(f) && sort == null) ? list0({ f: f, q: o.q, sort: sort }) : null;
      return sel('lifters2', { f: f, q: o.q || '', sort: sort, ids: ids }, function () {
        var M = model(), wq = PL.threads.list().meta.groups.waiting, sinceL = sessionsSince((D.coach && D.coach.lastLook) || TODAY), chW = changesOf({ since: K.monday(TODAY) });
        var pick = {
          waiting: function (r) { return wq.indexOf(r.id) >= 0; }, nocheckin: function (r) { return r.h.kind === 'none'; }, done: function (r) { return r.group === 'done'; },
          since: function (r) { return sinceL.some(function (x) { return x.lifterId === r.id; }); }, changed: function (r) { return chW.some(function (x) { return x.lifterId === r.id; }); }
        };
        var qq = String(o.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        var match = function (r) { if (!qq.length) return true; var p = prog(r.l), why = r.reasons[0], hay = (r.name + ' ' + (p ? p.name : 'No program yet') + ' ' + (r.l.meet ? r.l.meet.name : '') + ' ' + (why ? why.w + ' ' + (why.full || '') + ' ' + (why.ctx || '') : '') + ' ' + r.h.text).toLowerCase(); return qq.every(function (w) { return hay.indexOf(w) >= 0; }); };
        var rows = M.rows.filter(function (r) { return (ids ? ids.indexOf(r.id) >= 0 : (pick[f] ? pick[f](r) : fOf(f)[2](r) || (f === 'need' && r.group === 'done'))) && match(r); });
        var val = function (r, key) { switch (key) { case 'triage': case 'status': return r.tier * 1000 + r.ord; case 'total': return r.tot; case 'change': return r.chg; case 'sessions': return r.planned ? r.done / r.planned : null; } return sortVal(r, key); };
        if (f === 'waiting' && !sort) rows.sort(function (a, b) { return wq.indexOf(a.id) - wq.indexOf(b.id); });
        else if (!sort || sk === 'triage') rows.sort(function (a, b) { return (a.group === 'done' ? 1 : 0) - (b.group === 'done' ? 1 : 0) || (a.tier - b.tier || a.ord - b.ord || a.name.localeCompare(b.name)) * (sort && sort.charAt(0) === '-' ? -1 : 1); });
        else { var dir = sort.charAt(0) === '-' ? -1 : 1; rows.sort(function (a, b) { var x = val(a, sk), y = val(b, sk); if (x == null && y == null) return a.name.localeCompare(b.name); if (x == null) return 1; if (y == null) return -1; var c = typeof x === 'string' ? x.localeCompare(y) : x - y; return c * dir || a.name.localeCompare(b.name); }); }
        var out = [];
        rows.forEach(function (r) {
          var x = base && !ids ? (base.data || []).filter(function (y) { return y.id === r.id; })[0] : null; x = x ? clone(x) : listRow(r, fOf(f) ? f : 'all');
          var why = r.reasons[0], num = sk === 'squat' || sk === 'bench' || sk === 'deadlift' ? r.e1[sk] : sk === 'total' || sk === 'tot' ? r.tot : r.chg;
          x.group = r.group; x.handled = handledOf(r); x.context = why ? ctxOf(r, why) : '';
          x.number = num == null ? { text: '', title: '' } : { text: (sk === 'squat' || sk === 'bench' || sk === 'deadlift' || sk === 'total' || sk === 'tot' ? n(Math.round(num)) : (num > 0 ? '+' : num < 0 ? '−' : '') + n(Math.abs(Math.round(num)))) + ' kg', title: sk && sk !== 'chg' && sk !== 'change' && sk !== 'triage' ? sk : '4-week change' };
          if (f === 'since') sinceL.filter(function (s) { return s.lifterId === r.id; }).forEach(function (s) { var y = clone(x); y.key = s.key; y.session = clone(s); out.push(y); });
          else out.push(x);
        });
        var cnt = {}; FILTERS.forEach(function (x) { cnt[x[0]] = M.rows.filter(x[2]).length; });
        cnt.waiting = wq.length; cnt.nocheckin = M.rows.filter(pick.nocheckin).length; cnt.done = M.rows.filter(pick.done).length; cnt.since = sinceL.filter(function (s) { return !s.seen; }).length; cnt.changed = M.rows.filter(pick.changed).length;
        var open = out.filter(function (x) { return x.group !== 'done'; }).length;
        return { data: out, meta: { total: f === 'need' ? open : out.length, done: out.length - open, f: f, q: o.q || '', sort: sort, ids: ids, counts: cnt, label: fOf(f) ? fOf(f)[1] : { waiting: 'Waiting for a reply', nocheckin: 'No check-in', done: 'Done today', since: 'Trained since you looked', changed: 'Changed this week' }[f] } };
      });
    };
    P.lifters.today = function (id) { var l = L(id); if (!l) return noLifter(id); return sel('ltoday', id, function () { return { data: changesOf({ since: nowIso().slice(0, 10), lifterId: id }) }; }); };
    P.lifters.notPain = function (id) {
      var l = L(id); if (!l) return noLifter(id);
      var M = model(), r = M.R[id], why = r && r.reasons.filter(function (x) { return x.t === 't-pain' && x.type !== 'pain'; })[0];
      if (!why && !ST.notPain[id]) return bad(l.first + ' has no note read as pain.', 'id');
      return commit('notPain', { id: id, at: stamp() });
    };
    P.lifters.pain = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!isStr(o.where) || !o.where.trim()) return bad('Say where it hurts.', 'where');
      if (!isNum(o.score) || o.score < 0 || o.score > 10 || o.score % 1) return bad('Pain is 0 to 10.', 'score');
      if (o.lift != null && !liftOk(o.lift)) return bad('The lift is squat, bench or deadlift.', 'lift');
      return commit('pain', { id: id, where: o.where.trim(), score: o.score, lift: o.lift || null, on: isIso(o.at) ? o.at : null, from: isStr(o.from) ? o.from : 'coach', note: isStr(o.note) ? o.note : '', at: stamp() });
    };
    P.lifters.logFor = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!l.program) return bad(l.first + ' has no program to log against.', 'id');
      if (!isNum(o.week) || !l.program.weeks[o.week - 1]) return bad('A week of ' + l.first + '’s program.', 'week');
      if (o.week - 1 > l.program.weekIdx) return fail('locked', 'Week ' + o.week + ' has not started yet.');
      if (!isStr(o.day) || !isStr(o.row)) return bad('Say the day and the line.', 'row');
      if (!Array.isArray(o.sets) || !o.sets.length || o.sets.some(function (x) { return !x || !kgOk(x.w, 0, 1000) || !isNum(x.r) || x.r < 1 || x.r % 1 || (x.felt != null && (!isNum(x.felt) || x.felt < 1 || x.felt > 10 || (x.felt * 2) % 1)); })) return bad('Each set has a load in 2.5 kg steps, reps and, if you have it, how it felt (1 to 10).', 'sets');
      return commit('logFor', { id: id, week: o.week, day: o.day, row: o.row, sets: clone(o.sets), at: stamp() });
    };
    P.lifters.seen = function (id) { var l = L(id); if (!l) return noLifter(id); return commit('seenOk', { id: id, at: stamp() }); };
    P.lifters.classes = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      var fed = isStr(o.fed) ? o.fed : l.meet && l.meet.fed ? l.meet.fed : null;
      return sel('classes', { id: id, fed: fed }, function () {
        var sx = sexOf(l), list = classList(sx, fed), now = bwNow(l), cur = clsOf(l), sug = null, top = list[list.length - 1], plus = top + '+';
        if (now != null && sx) { for (var i = 0; i < list.length; i++) if (now <= list[i]) { sug = list[i]; break; } if (sug == null) sug = plus; }
        var rows = list.map(function (c) { return { cls: c, label: String(c), words: now != null ? (now <= c ? n(r1(c - now)) + ' kg under' : n(r1(now - c)) + ' kg over') : '' }; });
        if (sx) rows.push({ cls: plus, label: plus, plus: true, words: 'No limit' });
        return { data: { sex: sx, fed: fed || 'IPF', now: now, current: cur != null ? cur : null, suggest: sug, list: rows } };
      });
    };
    P.lifters.setClass = function (id, cls) {
      var l = L(id); if (!l) return noLifter(id);
      var sx = sexOf(l), fed = l.meet && l.meet.fed ? l.meet.fed : null, list = classList(sx, fed), all = classList(sx, null).concat(list), isPlus = /\+\s*$/.test(String(cls)), c = isPlus ? parseFloat(cls) + '+' : parseFloat(cls);
      var okC = isPlus ? sx && (parseFloat(cls) === list[list.length - 1] || parseFloat(cls) === CLASSES[sx][CLASSES[sx].length - 1]) : isNum(c) && all.indexOf(c) >= 0;
      if (!okC) return bad((sx === 'M' ? 'Men’s' : sx === 'F' ? 'Women’s' : 'IPF') + ' classes are ' + list.join(', ') + (sx ? ' and ' + list[list.length - 1] + '+' : '') + '.', 'cls');
      if (clsOf(l) === c) return ok({ id: id, cls: c }, { undo: null, label: '' });
      return commit('setClass', { id: id, cls: c, at: stamp() });
    };

    /* the week's record, sessions since you looked, reminders, receipts (shared.md §6.8 to §6.10, §6.14) */
    P.changes = { list: function (o) { o = argObj(o); if (o.lifterId != null && !L(o.lifterId)) return noLifter(o.lifterId); if (o.since != null && !isStr(o.since)) return bad('since is a time like 2026-11-10T00:00.', 'since'); return sel('changes', { since: o.since || null, lifterId: o.lifterId || null }, function () { var d = changesOf(o); return { data: d, meta: { total: d.length } }; }); } };
    P.sessions = {
      since: function (iso) { if (iso != null && (!isStr(iso) || isNaN(tOf(iso.length === 10 ? iso + 'T00:00' : iso)))) return bad('since is a time like 2026-11-08T20:00.', 'since'); return sel('since', iso || null, function () { var d = sessionsSince(iso); return { data: d, meta: { total: d.length, unseen: d.filter(function (x) { return !x.seen; }).length, from: iso || (D.coach && D.coach.lastLook) || null } }; }); },
      seen: function (key) { if (!isStr(key) || !sessionsSince('2000-01-01').some(function (x) { return x.key === key; })) return fail('not_found', 'There is no session ' + (isStr(key) ? key : '') + '.'); return commit('seen', { what: 'session', key: key, id: key.split(':')[0], at: stamp() }); }
    };
    P.reminders = {
      add: function (lifterId, o) {
        var l = L(lifterId); if (!l) return noLifter(lifterId); o = argObj(o);
        /* a day (2026-11-12) or a day and time (2026-11-14T09:00, spec C: Do it Saturday) */
        if (!(isIso(o.on) || (isStr(o.on) && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(o.on) && isIso(o.on.slice(0, 10))))) return bad('A reminder needs a day like 2026-11-12.', 'on');
        if (!isStr(o.text) || !o.text.trim()) return bad('Say what to remind you of.', 'text');
        if (o.itemId != null && !C.get(o.itemId)) return fail('not_found', 'There is no item ' + o.itemId + '.');
        var at = stamp();
        return commit('remind', { rid: 'rem-' + l.id + '-' + at.replace(/\D/g, '').slice(0, 14), lifterId: l.id, on: o.on, text: o.text.trim(), kind: isStr(o.kind) ? o.kind : 'note', itemId: o.itemId || null, at: at });
      },
      list: function (o) { o = argObj(o); return sel('reminders', { all: !!o.all }, function () { var d = ST.remind.filter(function (r) { return o.all || !r.done; }).slice().sort(function (a, b) { return a.on.localeCompare(b.on) || String(a.at).localeCompare(String(b.at)); }).map(function (r) { var x = clone(r); x.due = r.on <= nowIso().slice(0, 10); return x; }); return { data: d, meta: { total: d.length, due: d.filter(function (x) { return x.due && !x.done; }).length } }; }); },
      done: function (rid) { if (!ST.remind.some(function (r) { return r.id === rid; })) return fail('not_found', 'There is no reminder ' + (isStr(rid) ? rid : '') + '.'); return commit('remindDone', { rid: rid, at: stamp() }); }
    };
    P.threads.seen = function (id, msgId) {
      var l = L(id); if (!l) return noLifter(id);
      if (!isStr(msgId) || !msgId) return bad('Say which message (its time, or card:<itemId>).', 'msgId');
      var card = /^card:/.test(msgId);
      if (card && !C.get(msgId.slice(5))) return fail('not_found', 'There is no change card ' + msgId + '.');
      return commit('seen', { what: card ? 'card' : 'msg', key: card ? msgId.slice(5) : l.id + '|' + msgId, id: l.id, at: stamp() });
    };

    /* Meets (programs.md §11.6; overview-lifters.md §9.1) */
    P.meets.results = function (lifterId) {
      var l = L(lifterId); if (!l) return noLifter(lifterId);
      return sel('mresults', lifterId, function () {
        var pl = ST.plans[l.id]; if (!pl || !l.meet) return { data: null };
        var made = {}, any = false; LIFTS.forEach(function (k) { var best = null; (pl.st[k] || []).forEach(function (s0, i) { if (s0 === 'good' && (best == null || pl.a[k][i] > best)) best = pl.a[k][i]; }); made[k] = best; if (best != null) any = true; });
        if (!any) return { data: null };
        var tot = LIFTS.every(function (k) { return made[k] != null; }) ? made.squat + made.bench + made.deadlift : null;
        return { data: { meetId: meetId(l.meet), name: l.meet.name, date: day10(l.meet.date) || K.add(TODAY, l.meet.days), made: made, total: tot } };
      });
    };
    P.meets.calendar = function () {
      return sel('calendar', undefined, function () {
        var by = {}, out = [];
        var add = function (m, id) { if (!m || !m.name) return; var date = day10(m.date) || (isNum(m.days) ? K.add(TODAY, m.days) : null); if (!date || date < TODAY) return; var k = slug(m.name); var x = by[k] || (by[k] = { id: k, name: m.name, date: date, days: K.daysTo(date), fed: m.fed || m.federation || null, weighIn: m.weighIn || null, ids: [] }); if (out.indexOf(x) < 0) out.push(x); if (id && x.ids.indexOf(id) < 0) x.ids.push(id); };
        D.lifters.forEach(function (l) { add(l.meet, l.id); if (l.intake && l.intake.meet) add(l.intake.meet, l.id); });
        (D.calendar || []).forEach(function (m) { add(m, null); });
        out.sort(function (a, b) { return a.date.localeCompare(b.date) || a.name.localeCompare(b.name); });
        return { data: out, meta: { total: out.length } };
      });
    };
  })(PL);



  /* ================= STORE-2 calls (spec B, 13 Nov 2026): screens.md §10.4 to §10.8, contract v1 shapes, additive ================= */
  (function (P) {
    var isMonday = function (iso) { return isIso(iso) && K.d(iso).getDay() === 1; };

    /* ---- Teams (§10.4) ---- */
    var sendWeek0 = P.teams.sendWeek, start0 = P.teams.start;
    var noTeam = function (id) { return fail('not_found', 'There is no team ' + (isStr(id) ? id : '') + '.'); };
    var member = function (T, id) { var l = L(id); return l && T.members.some(function (m) { return m.id === l.id; }) ? l : null; };
    var weekOk = function (T, wn) { return isNum(wn) && wn % 1 === 0 && wn >= 1 && wn <= T.weeks.length; };
    P.teams.hold = function (id, lifterId, wn) {
      var T = teamOf(id); if (!T) return noTeam(id); var l = member(T, lifterId); if (!l) return fail('not_found', 'That lifter is not on the ' + T.name + '.');
      if (!weekOk(T, wn)) return bad('Hold a week from 1 to ' + T.weeks.length + '.', 'n');
      if (wn - 1 <= teamNow(T)) return fail('locked', 'Week ' + wn + ' is under way. Hold a week to come.');
      return commit('teamHold', { id: id, lifterId: l.id, n: wn, on: true, at: stamp() });
    };
    P.teams.release = function (id, lifterId, wn) {
      var T = teamOf(id); if (!T) return noTeam(id); var l = member(T, lifterId); if (!l) return fail('not_found', 'That lifter is not on the ' + T.name + '.');
      if (!weekOk(T, wn)) return bad('Release a week from 1 to ' + T.weeks.length + '.', 'n');
      return commit('teamHold', { id: id, lifterId: l.id, n: wn, on: false, at: stamp() });
    };
    /* sendWeek(teamId, n, { ids }): ids only (every other member it reaches is held); default every member not held */
    P.teams.sendWeek = function (id, wn, o) {
      var T = teamOf(id); if (!T) return noTeam(id);
      o = argObj(o);
      if (o.ids == null) {
        if (!weekOk(T, wn)) return sendWeek0(id, wn);
        return commit('teamSend', { id: id, n: wn, at: stamp() });
      }
      if (!weekOk(T, wn)) return bad('Send a week from 1 to ' + T.weeks.length + '.', 'n');
      if (!Array.isArray(o.ids) || !o.ids.length || o.ids.some(function (x) { return !member(T, x); })) return bad('Send to lifters on the ' + T.name + '.', 'ids');
      return commit('teamSend', { id: id, n: wn, ids: o.ids.slice(), at: stamp() });
    };
    P.teams.start = function (id, lifterId, o) {
      o = argObj(o);
      if (o.maxes != null && (typeof o.maxes !== 'object' || LIFTS.some(function (k) { return o.maxes[k] != null && !kgOk(o.maxes[k], 20, 600); }))) return bad('Maxes are 20 to 600 kg, in 2.5 kg steps.', 'maxes');
      if (o.maxes == null) return start0(id, lifterId, o);
      var T = teamOf(id); if (!T) return noTeam(id);
      var l = member(T, lifterId); if (!l) return fail('not_found', 'That lifter is not on the ' + T.name + '.');
      if (l.program) return fail('conflict', l.first + ' is on ' + l.program.name + ' already.');
      var nowW = teamNow(T), wn = o.week == null ? nowW + 2 : o.week;
      if (!isNum(wn) || wn % 1 || wn <= nowW + 1 || wn > T.weeks.length) return bad('Start on a week to come: week ' + (nowW + 2) + (nowW + 2 < T.weeks.length ? ' to ' + T.weeks.length : '') + '.', 'week');
      var mx = {}; LIFTS.forEach(function (k) { if (o.maxes[k] != null) mx[k] = o.maxes[k]; });
      return commit('teamStart', { id: id, lifterId: l.id, n: wn, maxes: mx, at: stamp() });
    };
    P.teams.restart = function (id, lifterId, o) {
      var T = teamOf(id); if (!T) return noTeam(id); var l = member(T, lifterId); if (!l) return fail('not_found', 'That lifter is not on the ' + T.name + '.');
      o = argObj(o); var at = o.at == null ? 1 : o.at, on = o.on == null ? nextMonday() : o.on;
      if (!l.program || teamFrom(T, l) == null) return fail('conflict', l.first + ' is not on the ' + T.name + '’s program yet. Start ' + (l.sex === 'F' ? 'her' : 'him') + ' on it first.');
      if (!weekOk(T, at)) return bad('Restart at a team week from 1 to ' + T.weeks.length + '.', 'at');
      if (!isMonday(on) || on <= TODAY) return bad('Restart on a Monday to come.', 'on');
      return commit('teamRestart', { id: id, lifterId: l.id, at: at, on: on });
    };
    P.teams.create = function (o) {
      o = argObj(o); var name = words0(o.name), ids = Array.isArray(o.ids) ? o.ids.filter(isStr) : [];
      if (!name) return bad('Give the team a name.', 'name');
      if (!ids.length) return bad('Pick at least one lifter.', 'ids');
      if (ids.some(function (x) { return !K.L(x); })) return noLifter(ids.filter(function (x) { return !K.L(x); })[0]);
      if (!isMonday(o.startsOn) || o.startsOn <= TODAY) return bad('Start on a Monday to come.', 'startsOn');
      var from = o.from && typeof o.from === 'object' ? (o.from.template ? { template: o.from.template } : o.from.team ? { team: o.from.team } : null) : null;
      if (from && from.template && !templates().some(function (x) { return x.id === from.template || x.name === from.template || slug(x.name) === from.template; })) return fail('not_found', 'There is no template called “' + from.template + '”.');
      if (from && from.team && !teamOf(from.team)) return noTeam(from.team);
      if (teamOf(slug(name))) return fail('conflict', 'There is a team called ' + name + ' already.');
      return commit('teamCreate', { name: name, ids: uniq(ids), from: from, startsOn: o.startsOn, at: stamp() });
    };
    var lineArgs = function (T, wn, dayIdx) { if (!weekOk(T, wn)) return bad('Week 1 to ' + T.weeks.length + '.', 'n'); if (!isNum(dayIdx) || !teamDay(T, wn - 1, dayIdx)) return fail('not_found', 'Week ' + wn + ' has no day ' + (isNum(dayIdx) ? dayIdx + 1 : '') + '.'); if (wn - 1 < teamNow(T)) return fail('locked', 'Week ' + wn + ' is lifted.'); return null; };
    P.teams.setLine = function (id, wn, dayIdx, lineIdx, o) {
      var T = teamOf(id); if (!T) return noTeam(id); var e = lineArgs(T, wn, dayIdx); if (e) return e;
      o = argObj(o); var td = teamDay(T, wn - 1, dayIdx); if (!isNum(lineIdx) || !td.exercises[lineIdx]) return fail('not_found', 'There is no line ' + lineIdx + ' on ' + td.name + '.');
      if (o.own != null && !member(T, o.own)) return fail('not_found', 'That lifter is not on the ' + T.name + '.');
      var pr = parseLine(o.text); if (!pr.ok) return bad(pr.why, 'text');
      var res = commit('teamLine', { id: id, n: wn, di: dayIdx, li: lineIdx, what: 'set', cell: pr.cell, own: o.own || null, at: stamp() });
      if (res.data) { res.meta.affects = res.data.affects.slice(); res.meta.kept = res.data.kept.slice(); }
      return res;
    };
    P.teams.addLine = function (id, wn, dayIdx, o) {
      var T = teamOf(id); if (!T) return noTeam(id); var e = lineArgs(T, wn, dayIdx); if (e) return e;
      o = argObj(o); var title = words0(o.title); if (!title) return bad('Name the exercise.', 'title');
      var pr = parseLine(o.text); if (!pr.ok) return bad(pr.why, 'text');
      var res = commit('teamLine', { id: id, n: wn, di: dayIdx, li: null, what: 'add', title: title, lift: liftOk(o.lift) ? o.lift : null, cell: pr.cell, own: null, at: stamp() });
      if (res.data) res.meta.affects = res.data.affects.slice();
      return res;
    };
    P.teams.removeLine = function (id, wn, dayIdx, lineIdx) {
      var T = teamOf(id); if (!T) return noTeam(id); var e = lineArgs(T, wn, dayIdx); if (e) return e;
      var td = teamDay(T, wn - 1, dayIdx); if (!isNum(lineIdx) || !td.exercises[lineIdx]) return fail('not_found', 'There is no line ' + lineIdx + ' on ' + td.name + '.');
      var res = commit('teamLine', { id: id, n: wn, di: dayIdx, li: lineIdx, what: 'remove', cell: { n: 0, r: 0 }, own: null, at: stamp() });
      if (res.data) res.meta.affects = res.data.affects.slice();
      return res;
    };

    /* ---- Meets (§10.5) ---- */
    var plan0 = P.meets.plan, board0 = P.meets.board, results0 = P.meets.results, note0 = P.meets.note, list0 = P.meets.list;
    var lid = function (id) { var l = L(id); return l || null; };
    /* LOGIC-FIX-4 (walk 2, Elena's rehearsals on the wrong days): PL.meets.rehearse(id, { lifts }) writes each opener single
       as the top set of that lift's own last session in the rehearsal window (4 to 10 days out): "1 × 1 62.5", noted "Opener
       practice", in the draft (nothing sent), all the lifts asked for in one write and one Undo. No RPE: a fixed opener */
    P.meets.rehearse = function (lifterId, o) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId); o = argObj(o);
      if (!l.meet || l.meet.days < 0) return bad(l.first + ' has no meet coming.', 'id');
      if (!l.program) return bad(l.first + ' has no program to write the rehearsal in.', 'id');
      var Bk = BLK(); if (!Bk) return fail('invalid', 'Writing a rehearsal needs block.js on the page.');
      var pl = planOf(l), rh = rehearsalOf(l, pl); if (!rh) return bad('A rehearsal is written 4 to 10 days before the meet; the ' + l.meet.name + ' is ' + K.plural(l.meet.days, 'day') + ' out.', 'id');
      var want = Array.isArray(o.lifts) ? o.lifts.filter(function (k) { return LIFTS.indexOf(k) >= 0; }) : rh.missing.slice();
      if (!want.length) return fail('conflict', 'Every opener is rehearsed already.');
      var b; try { b = Bk.from(programAnswer(l).data); } catch (e) { return fail('invalid', 'That program cannot be read.'); }
      var ops = [], said = [], miss = [];
      want.forEach(function (k) {
        var op = pl.a[k] && pl.a[k][0]; if (!isNum(op)) { miss.push(k); return; }
        var best = null;
        b.rows.forEach(function (row, r) { if (row.lift !== k || row.line !== 0 || (row.variant && row.variant !== 'Competition')) return; b.weeks.forEach(function (w, c) { var x = row.cells[w.uid], iso = x ? b.dateOf(c, row.day) : null; if (!x || x.lifted || w.state === 'lifted' || !iso || iso < TODAY || iso < rh.from || iso > rh.to) return; if (!best || iso > best.iso) best = { row: row, c: c, iso: iso }; }); });
        if (!best) { miss.push(k); return; }
        ops.push({ op: 'set', week: best.c + 1, row: best.row.key, text: '1x1 ' + n(op) }, { op: 'set', week: best.c + 1, row: best.row.key, field: 'note', text: 'Opener practice' });
        said.push(k + ' opener ' + n(op) + ' × 1 ' + dmyOf(best.iso));
      });
      if (!ops.length) return bad('No ' + K.list(miss, 3) + ' session falls 4 to 10 days before the meet. Move one there first.', 'lifts');
      var t = applyOps(Bk.from(b.toJSON()), clone(ops)); if (t.error) return { error: t.error };
      return commit('change', { id: l.id, ops: ops, label: upper1(K.list(said, 3)) + '. Not sent.' + (miss.length ? ' No ' + K.list(miss, 3) + ' session in the window.' : ''), at: stamp() });
    };
    P.meets.book = function (lifterId, which, o) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId);
      which = argObj(which); o = argObj(o);
      var m = null;
      if (isStr(which.meetId)) { m = knownMeet(which.meetId); if (!m) return fail('not_found', 'There is no meet ' + which.meetId + ' on the calendar.'); }
      else { var nm = words0(which.name); if (!nm) return bad('Name the meet, or pick one from the calendar.', 'name'); if (!isIso(which.date) || which.date <= TODAY) return bad('A meet needs a date to come, like 2027-03-14.', 'date'); m = { name: nm, date: which.date, fed: isStr(which.fed) && which.fed.trim() ? which.fed.trim() : null }; }
      if (m.date < TODAY) return bad('That meet has been.', 'meetId');
      if (meetsOf(l).some(function (x) { return meetId(x) === slug(m.name); })) return fail('conflict', l.first + ' is booked into the ' + m.name + ' already.');
      var cls = o.cls == null && isNum(clsOf(l)) ? clsOf(l) : clsFor(l, o.cls); if (o.cls != null && typeof cls === 'number' && isNaN(cls)) return bad('That is not one of ' + l.first + '’s classes: ' + (sexOf(l) ? CLASSES[sexOf(l)].join(', ') + ' and ' + CLASSES[sexOf(l)][CLASSES[sexOf(l)].length - 1] + '+' : CLASSES.F.concat(CLASSES.M).join(', ')) + '.', 'cls');
      if (o.weighIn != null && o.weighIn !== '2h' && o.weighIn !== '24h') return bad('A weigh-in is 2h or 24h.', 'weighIn');
      if (o.entryBy != null && !isIso(o.entryBy)) return bad('Entries close on a date like 2026-12-01.', 'entryBy');
      return commit('meet2', { what: 'book', lifterId: l.id, meet: { name: m.name, date: m.date, fed: m.fed || null }, cls: cls, weighIn: o.weighIn || m.weighIn || null, entryBy: o.entryBy || null, at: stamp() });
    };
    /* results(id) reads what the board recorded; results(id, { meetId, attempts, bw, place }) records a meet followed by text */
    P.meets.results = function (lifterId, o) {
      if (o === undefined) return results0(lifterId);
      var l = lid(lifterId); if (!l) return noLifter(lifterId); o = argObj(o);
      var m = isStr(o.meetId) ? knownMeet(o.meetId) : null; if (!m && isStr(o.meetId)) m = { name: o.name || o.meetId, date: o.date || TODAY };
      if (!m) return bad('Say which meet (meetId).', 'meetId');
      var att = argObj(o.attempts), made = {}, okA = true;
      LIFTS.forEach(function (k) { var xs = Array.isArray(att[k]) ? att[k] : []; var b = null; xs.forEach(function (x) { var kg = isNum(x) ? x : x && isNum(x.kg) ? x.kg : null, good = isNum(x) ? true : !!(x && x.good !== false); if (kg == null || !kgOk(kg, 20, 600)) okA = false; else if (good && (b == null || kg > b)) b = kg; }); made[k] = b; });
      if (!okA) return bad('Each attempt is 20 to 600 kg in 2.5 kg steps, as { kg, good }.', 'attempts');
      if (o.bw != null && (!isNum(o.bw) || o.bw < 30 || o.bw > 250)) return bad('Bodyweight is 30 to 250 kg.', 'bw');
      var tot = LIFTS.every(function (k) { return made[k] != null; }) ? made.squat + made.bench + made.deadlift : null;
      return commit('meet2', { what: 'results', lifterId: l.id, meetId: slug(m.name), name: m.name, date: day10(m.date), attempts: clone(att), made: made, total: tot, bw: o.bw == null ? null : o.bw, place: o.place == null ? null : o.place, at: stamp() });
    };
    P.meets.target = function (lifterId, o) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId); o = argObj(o);
      if (o.total != null && (!isNum(o.total) || o.total < 50 || o.total > 1500 || !step25(o.total))) return bad('A target total is 50 to 1500 kg, in 2.5 kg steps.', 'total');
      return commit('meet2', { what: 'target', lifterId: l.id, total: o.total == null ? null : o.total, why: isStr(o.why) ? o.why.trim() : '', at: stamp() });
    };
    P.meets.reason = function (lifterId, lift, k, reason) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId); if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
      if (!liftOk(lift)) return bad('The lift is squat, bench or deadlift.', 'lift'); if (k !== 1 && k !== 2 && k !== 3) return bad('An attempt is 1, 2 or 3.', 'k');
      if (RED.indexOf(reason) < 0) return bad('A reason is ' + RED.join(', ') + '.', 'reason');
      if (planOf(l).st[lift][k - 1] !== 'no') return fail('conflict', 'That attempt is not a no lift.');
      return commit('meet2', { what: 'reason', lifterId: l.id, lift: lift, k: k, reason: reason, at: stamp() });
    };
    P.meets.note = function (lifterId, a, b) {
      if (b === undefined) return note0(lifterId, a);
      var l = lid(lifterId); if (!l) return noLifter(lifterId);
      if (!isStr(a) || !meetsOf(l).concat((l.pastMeets || []).map(function (x) { return { name: x.name }; })).concat((ST.results[l.id] || []).map(function (x) { return { name: x.name }; })).some(function (x) { return meetId(x) === a; })) return fail('not_found', l.first + ' has no meet ' + a + '.');
      if (!isStr(b) || !b.trim()) return bad('A note needs words.', 'text');
      return commit('meet2', { what: 'debrief', lifterId: l.id, meetId: a, text: b.trim(), at: stamp() });
    };
    P.meets.pain = function (lifterId, o) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId); o = argObj(o);
      if (!isStr(o.where) || !o.where.trim()) return bad('Say where it hurts.', 'where');
      if (!isNum(o.score) || o.score < 0 || o.score > 10 || o.score % 1) return bad('Pain is 0 to 10.', 'score');
      if (o.lift != null && !liftOk(o.lift)) return bad('The lift is squat, bench or deadlift.', 'lift');
      if (o.ease && !o.lift) return bad('Say which lift to ease.', 'lift');
      return commit('meet2', { what: 'pain', lifterId: l.id, where: o.where.trim(), score: o.score, lift: o.lift || null, ease: !!o.ease, at: stamp() });
    };
    P.meets.flight = function (meetId0, lift, flights) {
      if (!meetById(meetId0)) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
      if (!liftOk(lift)) return bad('The lift is squat, bench or deadlift.', 'lift');
      if (!Array.isArray(flights) || !flights.length || flights.some(function (f) { return !f || !isStr(f.letter) || !isNum(f.size) || f.size < 1 || f.size % 1 || (f.ids && Object.keys(f.ids).some(function (k) { var p = f.ids[k]; return !isNum(p) || p < 1 || p > f.size || p % 1; })); })) return bad('Each flight has a letter, a size and each lifter’s place in it (1 to its size).', 'flights');
      return commit('meet2', { what: 'flight', meetId: meetId0, lift: lift, flights: clone(flights), at: stamp() });
    };
    var platLift = function (mid) { var st = boardOf(mid).stage; return LIFTS.indexOf(st) >= 0 ? st : 'squat'; };
    P.meets.platformAt = function (meetId0, k) {
      if (!meetById(meetId0)) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
      var pf = platformOf(meetId0, boardOf(meetId0).stage); if (!pf) return fail('invalid', 'This meet has no flights yet. Edit the flight first.');
      if (!isNum(k) || k % 1 || k < 1 || k > pf.total) return bad('The platform runs from attempt 1 to ' + pf.total + '.', 'n');
      if (k === pf.at) return ok({ meetId: meetId0, lift: pf.lift, at: k }, { undo: null, label: '' });
      return commit('meet2', { what: 'platform', meetId: meetId0, lift: platLift(meetId0), n: k, at: stamp() });
    };
    P.meets.platform = function (meetId0, by) {
      if (!meetById(meetId0)) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
      var pf = platformOf(meetId0, boardOf(meetId0).stage); if (!pf) return fail('invalid', 'This meet has no flights yet. Edit the flight first.');
      by = by == null ? 1 : by; if (!isNum(by) || by % 1 || !by) return bad('Move the platform by a whole number of attempts.', 'by');
      return P.meets.platformAt(meetId0, Math.max(1, Math.min(pf.total, pf.at + by)));
    };
    P.meets.rack = function (lifterId, o) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId); o = argObj(o);
      var okH = function (x) { return x == null || (isNum(x) && x >= 0 && x <= 30 && x % 1 === 0); };
      if (!okH(o.squat) || !okH(o.bench) || !okH(o.safety)) return bad('Rack heights are whole numbers, 0 to 30.', 'rack');
      return commit('meet2', { what: 'rack', lifterId: l.id, rack: { squat: o.squat, bench: o.bench, safety: o.safety }, at: stamp() });
    };
    P.meets.handIn = function (lifterId) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId); if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
      if (l.meet.days !== 0) return fail('invalid', 'Openers are handed in on the meet day.');
      return commit('meet2', { what: 'handIn', lifterId: l.id, at: stamp() });
    };
    P.meets.changeBy = function (meetId0, hm0) {
      if (!meetById(meetId0)) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
      if (!isStr(hm0) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hm0)) return bad('A time like 09:55.', 'by');
      return commit('meet2', { what: 'changeBy', meetId: meetId0, hm: hm0, at: stamp() });
    };
    P.meets.cutPlan = function (lifterId) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId); if (!l.meet) return bad(l.first + ' has no meet booked.', 'id');
      return sel('cutplan', lifterId, function () { var c = ST.cuts[l.id], d = cutRows(l); if (!d) return fail('invalid', l.first + ' has no class or weigh-ins to plan from.'); if (c) { d.rows = clone(c.rows); d.after = c.after; d.text = c.text; d.saved = { at: c.at, sent: c.sent }; } return { data: d }; });
    };
    P.meets.saveCut = function (lifterId, o) {
      var l = lid(lifterId); if (!l) return noLifter(lifterId); if (!l.meet) return bad(l.first + ' has no meet booked.', 'id'); o = argObj(o);
      var d0 = cutRows(l); if (!d0) return fail('invalid', l.first + ' has no class or weigh-ins to plan from.');
      var rows = o.rows == null ? d0.rows : o.rows;
      if (!Array.isArray(rows) || !rows.length || rows.some(function (r) { return !r || !isIso(r.d) || !isNum(r.target) || r.target < 30 || r.target > 250; })) return bad('Each day has a date and a target weight in kg.', 'rows');
      var text = o.text == null ? d0.text : String(o.text).trim(); if (o.send && !text) return bad('The plan goes with words. Write them or save it without sending.', 'text');
      return commit('meet2', { what: 'cut', lifterId: l.id, rows: rows.map(function (r) { return { d: r.d, target: r1(r.target), food: isStr(r.food) ? r.food : '', water: isStr(r.water) ? r.water : '', note: isStr(r.note) ? r.note : '' }; }), after: isStr(o.after) ? o.after : d0.after, text: text, send: !!o.send, at: stamp() });
    };
    P.meets.maxesFromMeet = function (meetId0) {
      var m = meetById(meetId0); if (!m) return fail('not_found', 'There is no meet ' + (isStr(meetId0) ? meetId0 : '') + '.');
      var changes = [];
      m.lifterIds.forEach(function (id) { var l = K.L(id); if (!l || !l.program) return; var pl = planOf(l); LIFTS.forEach(function (k) { var b = bestMade(pl, k), was = l.program.maxes && l.program.maxes[k] != null ? l.program.maxes[k] : null, cur = was != null ? was : (l.lifts[k] && l.lifts[k].e1 != null ? K.round(e1Of(l, k)) : null); if (b != null && (cur == null || b > cur)) changes.push({ id: id, lift: k, from: was, to: b }); }); });
      if (!changes.length) return ok({ meetId: meetId0, changes: [] }, { undo: null, label: 'Nobody made a lift over their max.', changes: [] });
      var res = commit('meet2', { what: 'maxes', meetId: meetId0, changes: changes, at: stamp() });
      if (res.meta) res.meta.changes = clone(changes);
      return res;
    };
    P.meets.list = function () {
      return sel('mlist2', undefined, function () {
        var out = clone(list0().data), by = {}; out.forEach(function (m) { by[m.id] = m; });
        D.lifters.forEach(function (l) { (ST.booked[l.id] || []).forEach(function (x) { var id = meetId(x), date = day10(x.date); var m = by[id] || (by[id] = { id: id, name: x.name, date: date, days: K.daysTo(date), fed: x.fed || null, lifterIds: [], classes: [] }); if (out.indexOf(m) < 0) out.push(m); m.booked = (m.booked || []).concat([l.id]); if (m.lifterIds.indexOf(l.id) < 0) m.lifterIds.push(l.id); }); });
        out.sort(function (a, b) { return a.days - b.days || a.name.localeCompare(b.name); });
        return { data: out };
      });
    };
    P.meets.plan = function (lifterId) {
      var r = plan0(lifterId); if (r.error) return r;
      var l = L(lifterId);
      return sel('plan2', lifterId, function () {
        var d = clone(r.data), pl = planOf(l), c = ST.cuts[l.id], tg = ST.targets[l.id];
        d.warnings = warningsOf(l, pl); d.rehearsal = rehearsalOf(l, pl); d.runin = runinOf(l);
        d.target = tg ? { total: tg.total, why: tg.why, thirds: d.totals.third, short: r1(tg.total - d.totals.third) } : null;
        d.rack = ST.racks[l.id] ? clone(ST.racks[l.id]) : null; d.handedIn = ST.handIn[l.id] ? clone(ST.handIn[l.id]) : null; d.changeBy = ST.changeBy[meetId(l.meet)] || null;
        d.reasons = {}; LIFTS.forEach(function (k) { d.reasons[k] = [1, 2, 3].map(function (q) { return ST.redReasons[l.id + '|' + k + '|' + q] || null; }); });
        d.debrief = ST.meetNotes[l.id + '|' + meetId(l.meet)] ? ST.meetNotes[l.id + '|' + meetId(l.meet)].text : '';
        d.meets = meetsOf(l).map(meetOut);
        if (c) { d.bw.plan = clone(c.rows); d.bw.planSent = !!c.sent; var last = (l.bwSeries || []).slice(-1)[0], row = last ? c.rows.filter(function (x) { return x.d === last.d; })[0] : null; d.bw.offPace = row && last.kg - row.target >= 0.3 - 1e-9 ? { by: r1(last.kg - row.target), text: 'Off pace: ' + n(r1(last.kg - row.target)) + ' kg over the plan' } : null; }
        if (l.meet.days === 0 && isNum(pl.scale) && (pl.weigh === 'made' || pl.weigh === 'over')) d.bw.sentence = 'Weighed ' + n(pl.scale) + (pl.weighAt ? ' at ' + String(localIso(tOf(pl.weighAt))).slice(11, 16) : '') + ': ' + (pl.weigh === 'made' ? 'made weight for ' + clsWords(pl.cls) + '.' : 'over ' + clsWords(pl.cls) + '.');
        var mp = ST.meetPain[l.id]; d.pain = mp ? { where: mp.where, score: mp.score, lift: mp.lift, text: upper1(mp.where) + ' ' + n(mp.score) + '/10' + (mp.lift ? ', ' + mp.lift : '') } : null;
        return { data: d };
      });
    };
    P.meets.board = function (id) {
      var r = board0(id); if (r.error) return r;
      return sel('board2', id, function () {
        var d = clone(r.data), fl = flightsOf(id), pf = platformOf(id, d.stage), m = meetById(id), kind = m && FED_GL[m.fed] ? 'GL' : 'DOTS', tl = [];
        d.platform = pf; d.flights = fl; d.breakMin = D.meetDay && D.meetDay[id] ? D.meetDay[id].breakMin || 10 : 10; d.changeBy = ST.changeBy[id] || null;
        var lift = pf ? pf.lift : 'squat';
        d.lifters.forEach(function (x) {
          var l = K.L(x.id), pl = planOf(l), mp = ST.meetPain[x.id], made = 0, all = true, tg = ST.targets[x.id];
          LIFTS.forEach(function (k) { var b = bestMade(pl, k); if (b == null) all = false; else made += b; });
          x.points = { kind: kind, value: all ? pointsOf(kind, made, isNum(pl.scale) ? pl.scale : x.bw, sexOf(l)) : null };
          x.prs = []; LIFTS.forEach(function (k) { var pb = pastBest(l, k); for (var q = 0; q < 3; q++) if (pl.st[k][q] === 'good' && pb != null && pl.a[k][q] > pb) { x.prs.push({ lift: k, kg: pl.a[k][q] }); break; } });
          x.rack = ST.racks[x.id] ? clone(ST.racks[x.id]) : null; x.handedIn = ST.handIn[x.id] ? clone(ST.handIn[x.id]) : null;
          x.target = tg ? { total: tg.total, needs: (function () { var sq = bestMade(pl, 'squat'), be = bestMade(pl, 'bench'); return sq != null && be != null ? r1(tg.total - sq - be) : null; })() } : null;
          x.reasons = {}; LIFTS.forEach(function (k) { x.reasons[k] = [1, 2, 3].map(function (q) { return ST.redReasons[x.id + '|' + k + '|' + q] || null; }); });
          if (mp) { x.flags = x.flags.filter(function (f) { return f.kind !== 'pain'; }); x.flags.unshift({ kind: 'pain', text: upper1(mp.where) + ' ' + n(mp.score) + '/10' + (mp.lift ? ', ' + mp.lift : ''), where: mp.where, score: mp.score, lift: mp.lift }); }
          var k0 = 0; while (k0 < 3 && judged(pl.st[lift][k0])) k0++;
          var gi = pf && k0 < 3 ? attemptIndex(fl, lift, x.id, k0 + 1) : null;
          x.out = gi != null ? { attempt: k0 + 1, out: Math.max(0, gi - pf.at), minutes: Math.max(0, gi - pf.at) } : null;
          var w = d.warmup[x.id], op = gi != null ? attemptIndex(fl, lift, x.id, 1) : null;
          /* LOGIC-FIX-2 (Meets' request): before the flight starts (the weigh-in) the minutes to the start count as attempts out
             (one attempt a minute, the platform counter's step), so nothing is late at the scale (screens.md §5.6) */
          var startIn = d.stage === 'weigh' ? Math.max(0, (T0[lift] || T0.squat) - d.clock.minutes) : 0;
          if (w && w.rungs) w.rungs.forEach(function (rg, i) { var oa = OUT_AT[OUT_AT.length - (w.rungs.length - i)]; rg.outAt = oa == null ? null : oa; if (op != null && oa != null && pf) { var left = op - pf.at + startIn; tl.push({ id: x.id, name: x.first, i: i, kg: rg.kg, reps: rg.r, out: oa, in: left - oa, at: hm(d.clock.minutes + Math.max(0, left - oa)), state: rg.ticked ? 'done' : left - oa < -2 ? 'late' : left - oa <= 0 ? 'now' : 'soon' }); } });
          /* the cut is drafted from the same attempts-out timeline that marks rungs late, so "Cut to 3 singles" is offered
             wherever the board says Late (the clock's draft stays when it has one) */
          if (w && w.rungs && !w.draft && !w.cut && op != null && pf && ['past', 'warm'].indexOf(w.state) < 0) {
            var left0 = op - pf.at + startIn, lateI = tl.filter(function (t0) { return t0.id === x.id && t0.state === 'late'; }).map(function (t0) { return t0.i; });
            if (lateI.length) {
              var lastT = -1; w.rungs.forEach(function (rg, i) { if (rg.ticked) lastT = i; });
              var todo0 = w.rungs.map(function (rg, i) { return { i: i, kg: rg.kg }; }).filter(function (r) { return r.i > lastT && !w.rungs[r.i].ticked; });
              var floor0 = lastT >= 0 ? w.rungs[lastT].kg : 0, bar0 = todo0.length && todo0[0].i === 0 ? todo0[0] : null, picks0 = [];
              CUT_AT.forEach(function (t) { var want = w.opener * t, top = picks0.length ? picks0[picks0.length - 1].kg : floor0, best0 = null; if (want <= floor0) return; todo0.forEach(function (r) { if (r.i && r.kg > top && (!best0 || Math.abs(r.kg - want) < Math.abs(best0.kg - want))) best0 = r; }); if (best0) picks0.push(best0); });
              /* the singles fit before the opener (2 minutes apart, else 1, the last at least 2 out); when they do not, the bar
                 goes first, then the lightest single, down to two */
              var keep0 = (bar0 ? [bar0] : []).concat(picks0), fit0 = function (k) { return (k.length - 1) * RUNG_GAP <= left0 - RUNG_GAP ? RUNG_GAP : (k.length - 1) <= left0 - RUNG_GAP ? 1 : 0; };
              while (keep0.length > 2 && !fit0(keep0)) keep0 = keep0.slice(1);
              var st0 = picks0.length >= 2 && keep0.length >= 2 ? fit0(keep0) : 0;
              if (st0) { var at0 = {}; keep0.forEach(function (r, j) { at0[r.i] = hm(d.clock.minutes + st0 * j); }); w.draft = { singles: keep0.map(function (r) { return r.i; }), out: todo0.filter(function (r) { return keep0.indexOf(r) < 0; }).map(function (r) { return r.i; }), at: at0, bar: !!bar0 && keep0.indexOf(bar0) >= 0, from: 'out' }; w.state = 'behind'; lateI.forEach(function (i) { w.rungs[i].late = true; }); }
            }
          }
        });
        tl.sort(function (a, b) { return a.in - b.in || a.name.localeCompare(b.name) || a.i - b.i; });
        d.timeline = tl;
        return { data: d };
      });
    };

    /* ---- Messages (§10.6) ---- */
    var send0 = P.messages.send, tget0 = P.threads.get;
    var within = function (at) { return tOf(nowIso()) - tOf(at) <= EDIT_MIN * MIN + 1; };
    P.messages.edit = function (id, msgId, text) {
      var l = L(id); if (!l) return noLifter(id);
      var x = myMessage(l, msgId); if (!x) return fail('not_found', 'There is no message of yours at ' + msgId + '.');
      var t = isStr(text) ? text.trim() : ''; if (!t) return bad('A message needs words.', 'text');
      if (!within(x.m ? x.m.at : x.d.at)) return fail('locked', 'A message can be edited for 10 minutes after it is sent.');
      return commit('msgEdit', { id: l.id, msgId: msgId, text: t, at: stamp() });
    };
    P.messages.remove = function (id, msgId) {
      var l = L(id); if (!l) return noLifter(id);
      var x = myMessage(l, msgId); if (!x) return fail('not_found', 'There is no message of yours at ' + msgId + '.');
      if (!x.m) return fail('conflict', 'Those words went with a move. Undo the move instead.');
      if (!within(x.m.at)) return fail('locked', 'A message can be taken back for 10 minutes after it is sent.');
      return commit('msgRemove', { id: l.id, msgId: msgId, at: stamp() });
    };
    P.messages.sendMany = function (ids, o) {
      o = argObj(o); var t = isStr(o.text) ? o.text.trim() : '';
      if (!Array.isArray(ids) || !ids.length) return bad('Pick who it goes to.', 'ids');
      if (ids.some(function (x) { return !L(x); })) return noLifter(ids.filter(function (x) { return !L(x); })[0]);
      if (!t) return bad('A message needs words.', 'text');
      return commit('sendMany', { ids: uniq(ids), text: t, at: stamp() });
    };
    P.messages.depth = function (id, call) {
      var l = L(id); if (!l) return noLifter(id);
      if (call != null && !has(DEPTH_SAID, call)) return bad('A depth call is deep, border or high.', 'call');
      if ((ST.depth[l.id] || null) === (call || null)) return ok({ id: l.id, depth: call || null }, { undo: null, label: '' });
      return commit('depth', { id: l.id, call: call || null, at: stamp() });
    };
    /* send(id, { text, ride: [{ itemId, actId, edits }] }): a ride list with the edited numbers runs that move with the words,
       one write (items.run), so words and plan never part */
    P.messages.send = function (id, o) {
      o = argObj(o);
      if (Array.isArray(o.ride)) {
        var l = L(id); if (!l) return fail('not_found', 'There is no thread ' + (isStr(id) ? id : '') + '.');
        if (o.ride.length > 1) return bad('A message carries one change. Send the others after it.', 'ride');
        if (!o.ride.length) return send0(id, Object.assign({}, o, { ride: null }));
        var r0 = argObj(o.ride[0]), it = isStr(r0.itemId) ? C.get(r0.itemId) : null, a = it && actOf(it, r0.actId);
        if (!it || !a || it.ids.indexOf(l.id) < 0) return bad('That change is not one of ' + l.first + '’s.', 'ride');
        var t = isStr(o.text) ? o.text.trim() : ''; if (!t) return bad('A message needs words.', 'text');
        if (a.reply == null) return send0(id, { text: t, ride: { itemId: it.id, actId: a.id } });
        /* LOGIC-FIX-3 (Messages' request): "Send week 5 to Mei now too" rides along (o.sendWeek or the ride's own), one write */
        var sw = o.sendWeek != null ? !!o.sendWeek : r0.sendWeek != null ? !!r0.sendWeek : undefined;
        return P.items.run(it.id, a.id, { text: t, edits: r0.edits || undefined, for: it.ids.length > 1 ? l.id : undefined, sendWeek: sw });
      }
      return send0(id, o);
    };
    P.threads.get = function (id) {
      var r = tget0(id); if (r.error) return r;
      return sel('thread2', id, function () {
        var d = clone(r.data), dr = d.draft;
        if (dr) {
          var rides = []; [dr.ride].filter(Boolean).forEach(function (x) { var it = C.get(x.itemId), a = it && actOf(it, x.actId), pv = null; try { pv = it && a ? previewOf(it, a, {}) : null; } catch (e) { pv = null; } rides.push({ itemId: x.itemId, actId: x.actId, label: x.label, lines: pv && pv.changes ? pv.changes.map(function (c) { return { what: c.label, from: c.before, to: c.after, edit: c.edit ? { key: c.key, kg: c.edit.value } : null }; }) : [] }); });
          dr.rides = rides;
          var it0 = C.get(dr.itemId); dr.depth = it0 && actOf(it0, 'review') ? ST.depth[id] || null : null; if (dr.depth && dr.text) dr.text = DEPTH_SAID[dr.depth] + ' ' + dr.text;
        }
        return { data: d };
      });
    };

    /* ---- Clients (§10.8, §7) ---- */
    var remind0 = P.billing.remind, accept0 = P.billing.accept, decline0 = P.billing.decline, setPackage0 = P.billing.setPackage, summary0 = P.billing.summary, get0 = P.billing.get;
    P.billing.packages0 = P.billing.packages;
    P.billing.packages = function () { return sel('pkgs2', undefined, function () { return { data: pkgList() }; }); };
    P.billing.remindDraft = function (id) {
      var l = L(id); if (!l) return noLifter(id); if (!l.billing) return bad(l.first + ' has no package yet.', 'id');
      return sel('rdraft', id, function () { var s = settingsOf(), meetDay = !!(l.meet && l.meet.days === 0); return { data: { text: fillTpl((s.reminders && s.reminders.template) || s.words.reminder || REMIND_TPL, l), when: meetDay ? 'tomorrow' : 'now', why: meetDay ? l.first + ' lifts today.' : null } }; });
    };
    /* remind(id, 'now'|'tomorrow') as before; remind(id, { text, when }): the words a payment card carries to the thread now, or
       tomorrow 08:00 */
    P.billing.remind = function (id, o) {
      if (o == null || isStr(o)) return remind0(id, o);
      var l = L(id); if (!l) return noLifter(id); if (!l.billing) return bad(l.first + ' has no package yet.', 'id');
      o = argObj(o); var w = o.when == null ? (l.meet && l.meet.days === 0 ? 'tomorrow' : 'now') : o.when;
      if (w !== 'now' && w !== 'tomorrow') return bad('Remind now or tomorrow.', 'when');
      var t = o.text == null ? P.billing.remindDraft(id).data.text : isStr(o.text) ? o.text.trim() : ''; if (!t) return bad('A reminder needs words.', 'text');
      return commit('bill2', { what: 'remind', id: l.id, text: t, when: w, on: TODAY, at: stamp() });
    };
    P.billing.removePayment = function (id, i) {
      var l = L(id); if (!l) return noLifter(id);
      if (!isNum(i) || !(l.payments || [])[i]) return fail('not_found', 'There is no payment ' + i + ' for ' + (l.first) + '.');
      return commit('bill2', { what: 'removePayment', id: l.id, i: i, at: stamp() });
    };
    P.billing.editPayment = function (id, i, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!isNum(i) || !(l.payments || [])[i]) return fail('not_found', 'There is no payment ' + i + ' for ' + l.first + '.');
      if (o.amount != null && (!isNum(o.amount) || o.amount <= 0 || o.amount > 100000)) return bad('A payment is an amount over 0.', 'amount');
      if (o.on != null && !isIso(o.on)) return bad('Paid on a date like 2026-11-10.', 'on');
      if (o.method != null && METHODS.indexOf(o.method) < 0) return bad('Paid by bank, card, PayPal or cash.', 'method');
      return commit('bill2', { what: 'editPayment', id: l.id, i: i, amount: o.amount, on: o.on, method: o.method, at: stamp() });
    };
    /* setPackage(id, { name, amount, cadence }) as before; setPackage(id, { pkg, amount, firstDue, note }) with the first payment
       and the words to the lifter */
    P.billing.setPackage = function (id, o) {
      o = argObj(o); if (o.pkg == null && o.firstDue == null && o.note == null) return setPackage0(id, o);
      var l = L(id); if (!l) return noLifter(id);
      var pk = isStr(o.pkg) ? pkgFind(o.pkg) : o.pkg && typeof o.pkg === 'object' ? pkgFind(o.pkg.id || o.pkg.name) : null; if (!pk) return fail('not_found', 'There is no package ' + (isStr(o.pkg) ? '“' + o.pkg + '”' : '') + '. Add it in Settings first.');
      var amount = o.amount == null ? pk.amount : o.amount; if (!isNum(amount) || amount <= 0 || amount > 100000) return bad('A price is an amount over 0.', 'amount');
      var first = o.firstDue == null ? TODAY : o.firstDue; if (!isIso(first) || first < TODAY) return bad('The first payment is today or a day to come.', 'firstDue');
      var note = isStr(o.note) ? o.note.trim() : '';
      return commit('bill2', { what: 'package', id: l.id, pkg: { name: pk.name, cadence: pk.cadence, currency: pk.currency || 'USD' }, amount: amount, firstDue: first, note: note, custom: o.custom ? true : undefined, at: stamp() });
    };
    var appOf = function (appId) { return apps().filter(function (z) { return z.id === appId || z.a.name === appId; })[0] || null; };
    P.billing.accept = function (appId, o) {
      if (o == null) return accept0(appId);
      var x = appOf(appId); if (!x || !x.it) return fail('not_found', 'There is no application ' + (isStr(appId) ? '“' + appId + '”' : '') + '.');
      if (appOutcome(x)) return fail('conflict', x.a.name + ' has an answer already. Undo it first.');
      if (money().free <= 0) return fail('conflict', 'Every seat is taken. Change plan first.');
      o = argObj(o); var pk = o.pkg == null ? null : pkgFind(o.pkg); if (o.pkg != null && !pk) return fail('not_found', 'There is no package “' + o.pkg + '”.');
      var amount = o.amount == null ? (pk ? pk.amount : null) : o.amount; if (amount != null && (!isNum(amount) || amount <= 0)) return bad('A price is an amount over 0.', 'amount');
      var st = o.startsOn == null ? nextMonday() : o.startsOn; if (!isIso(st) || st < TODAY) return bad('Starts today or a day to come.', 'startsOn');
      return commit('appTerms', { appId: x.id, yes: true, pkg: pk ? pk.name : null, amount: amount, startsOn: st, at: stamp() });
    };
    P.billing.decline = function (appId, o) {
      if (o == null) return decline0(appId);
      var x = appOf(appId); if (!x || !x.it) return fail('not_found', 'There is no application ' + (isStr(appId) ? '“' + appId + '”' : '') + '.');
      if (appOutcome(x)) return fail('conflict', x.a.name + ' has an answer already. Undo it first.');
      o = argObj(o); var t = isStr(o.text) ? o.text.trim() : '';
      return commit('appTerms', { appId: x.id, yes: false, text: t, at: stamp() });
    };
    P.billing.invite = function (o) {
      o = argObj(o); var name = words0(o.name), email = isStr(o.email) ? o.email.trim() : '';
      if (!name) return bad('Give their name.', 'name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('An email like jo@example.com.', 'email');
      var pk = pkgFind(o.pkg); if (!pk) return fail('not_found', 'There is no package ' + (isStr(o.pkg) ? '“' + o.pkg + '”' : '') + '.');
      var amount = o.amount == null ? pk.amount : o.amount; if (!isNum(amount) || amount <= 0) return bad('A price is an amount over 0.', 'amount');
      var st = o.startsOn == null ? nextMonday() : o.startsOn; if (!isIso(st) || st < TODAY) return bad('Starts today or a day to come.', 'startsOn');
      if (ST.invites.some(function (i) { return i.email === email; })) return fail('conflict', name + ' has an invite already.');
      if (money().free <= 0) return fail('conflict', 'Every seat is taken. Change plan first.');
      return commit('bill2', { what: 'invite', name: name, email: email, pkg: pk.name, amount: amount, startsOn: st, at: stamp() });
    };
    P.billing.end = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); if (!l.billing) return bad(l.first + ' has no package.', 'id'); o = argObj(o);
      var after = o.after == null ? (l.billing.leaving && l.billing.leaving.after) || MONTH_END : o.after; if (!isIso(after) || after < TODAY) return bad('Billing stops after a day to come.', 'after');
      if (ST.ends[l.id]) return fail('conflict', 'Billing for ' + l.first + ' stops after ' + dmyOf(ST.ends[l.id].after) + ' already.');
      return commit('bill2', { what: 'end', id: l.id, after: after, at: stamp() });
    };
    P.billing.inviteCancel = function () { if (ST.inviteLink && ST.inviteLink.cancelled) return fail('conflict', 'The invite link is cancelled already.'); return commit('bill2', { what: 'link', cancel: true, at: stamp() }); };
    P.billing.inviteNew = function () { return commit('bill2', { what: 'link', cancel: false, at: stamp() }); };
    P.billing.savePackage = function (o) {
      o = argObj(o); var name = words0(o.name), cad = o.cadence || 'monthly', cur = o.currency || 'USD';
      if (!name) return bad('A package needs a name.', 'name');
      if (!isNum(o.amount) || o.amount <= 0 || o.amount > 100000) return bad('A price is an amount over 0.', 'amount');
      if (CADENCES.indexOf(cad) < 0) return bad('A package is paid ' + CADENCES.join(', ') + '.', 'cadence');
      if (CURRENCIES.indexOf(cur) < 0) return bad('Currency is ' + CURRENCIES.join(', ') + '.', 'currency');
      if (o.link != null && o.link !== '' && (!isStr(o.link) || !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(o.link))) return bad('A payment link like https://pay.example.com/coach.', 'link');
      var pid = isStr(o.id) && o.id ? o.id : slug(name); if (o.id != null && !pkgFind(o.id)) return fail('not_found', 'There is no package ' + o.id + '.');
      if (o.id == null && pkgFind(pid)) return fail('conflict', 'There is a package called ' + name + ' already.');
      if (o.weeks != null && !(cad === 'once' && isNum(o.weeks) && o.weeks >= 1 && o.weeks <= 52 && o.weeks % 1 === 0)) return bad(cad === 'once' ? 'A once package runs 1 to 52 weeks.' : 'Only a once package has a length in weeks.', 'weeks');
      return commit('bill2', { what: 'pkgSave', pid: pid, name: name, amount: o.amount, cadence: cad, link: o.link || '', currency: cur, weeks: o.weeks != null ? o.weeks : undefined, at: stamp() });
    };
    P.billing.removePackage = function (pid) {
      var pk = pkgFind(pid); if (!pk) return fail('not_found', 'There is no package ' + (isStr(pid) ? pid : '') + '.');
      if (pk.lifters > 0) return fail('conflict', K.plural(pk.lifters, 'lifter') + (pk.lifters === 1 ? ' is' : ' are') + ' on it.');
      return commit('bill2', { what: 'pkgRemove', pid: pk.id, name: pk.name, at: stamp() });
    };
    P.billing.summary = function () {
      var r = summary0(); if (r.error) return r;
      return sel('bsum2', undefined, function () {
        var d = clone(r.data), o = money(), ym = TODAY.slice(0, 7), inc = [], cnt = {};
        o.rows.late.forEach(function (x) { if (x.date.slice(0, 7) < ym) inc.push({ id: x.id, words: K.L(x.id).first + '’s ' + K.d(x.date).toLocaleString('en-US', { month: 'long' }) + ' ' + K.money(x.amount) }); });
        o.rows.in.concat(o.rows.late.filter(function (x) { return x.date.slice(0, 7) === ym; })).concat(o.rows.come).forEach(function (x) { cnt[x.id] = (cnt[x.id] || 0) + 1; });
        Object.keys(cnt).forEach(function (id) { if (cnt[id] > 1) inc.push({ id: id, words: K.L(id).first + (cnt[id] === 2 ? ' twice' : ' ' + cnt[id] + ' times') }); });
        d.month.includes = inc; d.month.line = inc.length ? 'Includes ' + K.list(inc.map(function (x) { return x.words; }), 3) + '.' : '';
        var paying = D.lifters.filter(function (l) { var s = payState(l).state; return s !== 'paused' && s !== 'none'; }).length, link = !(ST.inviteLink && ST.inviteLink.cancelled) ? 1 : 0;
        d.seats.breakdown = { paying: paying, paused: o.paused.length, none: o.none.length, invites: link + (o.invited || 0) + ST.invites.length, link: link, pausedIds: o.paused.map(function (l) { return l.id; }), noneIds: o.none.map(function (l) { return l.id; }) };
        var P1 = planNow(); d.seats.plan = P1.name; d.seats.planId = P1.id; d.seats.unlimited = P1.max == null; if (P1.max == null) { d.seats.limit = null; d.seats.free = null; d.sentence = d.sentence.replace(/you have [\d,]+ seats? left|you have no seats left/, 'you have no seat limit'); }
        if (ST.inviteLink) { var code = ST.inviteLink.code; d.invite = ST.inviteLink.cancelled ? { code: null, link: null, url: null, text: 'No open invite link', cancelled: true } : { code: code, link: 'powalifta.com/j/' + code, url: 'https://powalifta.com/j/' + code, text: 'powalifta.com/j/' + code + ', ' + (o.free ? K.plural(o.free, 'seat') + ' left' : 'no seats left') }; }
        var cur = {}; D.lifters.forEach(function (l) { var b = l.billing, s = payState(l).state; if (!b || s === 'paused' || s === 'none') return; var c = b.cur || 'USD'; cur[c] = (cur[c] || 0) + b.amount; }); d.month.perCurrency = cur;
        d.ends = Object.keys(ST.ends).map(function (id) { return { id: id, after: ST.ends[id].after }; });
        return { data: d };
      });
    };
    P.billing.get = function (id) {
      var r = get0(id); if (r.error) return r; var l = L(id);
      return sel('bget2', id, function () { var d = clone(r.data); d.payments = (l.payments || []).map(function (p, i) { return { i: i, on: p.on, amount: p.amount, method: p.method, short: p.short || 0 }; }); d.owing = d.payments.reduce(function (s, p) { return s + p.short; }, 0); d.ends = ST.ends[l.id] ? clone(ST.ends[l.id]) : null; d.reminder = ST.reminders[l.id] ? clone(ST.reminders[l.id]) : null; return { data: d }; });
    };
    P.billing.exportCsv = function () {
      return sel('csv', undefined, function () {
        var rows = []; D.lifters.forEach(function (l) { (l.payments || []).forEach(function (p) { rows.push([p.on, l.name, p.amount, p.method, l.billing ? l.billing.pkg : '']); }); });
        rows.sort(function (a, b) { return String(b[0]).localeCompare(String(a[0])) || String(a[1]).localeCompare(String(b[1])); });
        var esc = function (x) { x = String(x == null ? '' : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
        var text = ['date,lifter,amount,method,package'].concat(rows.map(function (r) { return r.map(esc).join(','); })).join('\n') + '\n';
        return { data: text, meta: { filename: 'payments-' + TODAY.slice(0, 7) + '.csv', rows: rows.length } };
      });
    };

    /* ---- Settings (§10.8, shared.md §6.13) ---- */
    var isHm = function (x) { return isStr(x) && /^([01]\d|2[0-3]):[0-5]\d$/.test(x); };
    var checks = {
      plateStep: function (v) { return [2.5, 1.25, 0.5].indexOf(v) >= 0 ? null : 'The plate step is 2.5, 1.25 or 0.5 kg.'; },
      rules: function (v) { if (!Array.isArray(v) || !v.length) return 'Rules are a list: under and over.'; for (var i = 0; i < v.length; i++) { var r = v[i]; if (!r || (r.when !== 'under' && r.when !== 'over') || !isNum(r.by) || r.by <= 0 || r.by > 3) return 'Each rule says under or over, and by how much RPE (0.5 to 3).'; if (r.when === 'under' && (!r.add || LIFTS.some(function (k) { return r.add[k] != null && (!isNum(r.add[k]) || r.add[k] < 0 || r.add[k] > 20); }))) return 'An under rule adds 0 to 20 kg per lift.'; if (r.when === 'over' && (!isNum(r.cut) || r.cut <= 0 || r.cut > 20)) return 'An over rule takes 0.5 to 20% off.'; } return null; },
      deload: function (v) { return DELOAD_KINDS.indexOf(v) >= 0 ? null : 'A deload is half-easier, half or easier.'; },
      words: function (v) { if (!v || typeof v !== 'object') return 'Your words are one draft per kind of fix.'; var bad0 = Object.keys(v).filter(function (k) { return WORD_KINDS.indexOf(k) < 0 || !isStr(v[k]) || v[k].length > 500; }); return bad0.length ? 'Drafts are for ' + WORD_KINDS.join(', ') + ', 500 characters at most.' : null; },
      saved: function (v) { return Array.isArray(v) && v.every(function (x) { return x && isStr(x.name) && x.name.trim() && isStr(x.text) && x.text.trim() && x.text.length <= 1000; }) ? null : 'Each saved reply has a name and its words.'; },
      notifications: function (v) { if (!v || typeof v !== 'object') return 'Notifications are pushes and a digest.'; if (v.pushes && (typeof v.pushes !== 'object' || Object.keys(v.pushes).some(function (k) { return ['words', 'pain', 'sessions'].indexOf(k) < 0 || typeof v.pushes[k] !== 'boolean'; }))) return 'Pushes are words, pain and sessions, on or off.'; if (v.digest != null && v.digest !== false && !isHm(v.digest)) return 'The digest goes at a time like 07:00, or off.'; return null; },
      reminders: function (v) { if (!v || typeof v !== 'object') return 'Reminders are a template and when they go.'; if (v.template != null && (!isStr(v.template) || !v.template.trim())) return 'The reminder needs words.'; var a = v.auto; if (a != null && (typeof a !== 'object' || (a.days != null && (!isNum(a.days) || a.days < 0 || a.days > 30 || a.days % 1)) || (a.at != null && !isHm(a.at)))) return 'Sent for you: 0 to 30 days after the due date, at a time like 08:00.'; return null; },
      theme: function (v) { return THEMES.indexOf(v) >= 0 ? null : 'The look is dark, light or auto.'; },
      keys: function (v) { return v && typeof v === 'object' && Object.keys(v).every(function (k) { return k === 'tabPerWeek' && typeof v[k] === 'boolean'; }) ? null : 'Keys hold one option: tabPerWeek, on or off.'; },
      currency: function (v) { return CURRENCIES.indexOf(v) >= 0 ? null : 'Currency is ' + CURRENCIES.join(', ') + '.'; }
    };
    P.settings = {
      get: function () { return sel('settings', undefined, function () { var s = settingsOf(), P1 = planNow(); s.plans = PLANS.map(function (p) { return { id: p.id, name: p.name, max: p.max, price: p.price, current: p.id === P1.id, fits: p.max == null || p.max >= D.lifters.length, why: p.max != null && p.max < D.lifters.length ? 'You have ' + D.lifters.length + ' lifters. ' + p.name + ' holds ' + p.max + '.' : null }; }); s.seats = { used: money().used, limit: P1.max }; s.relRules = relRules() || { under: 0.5, over: 1, add: { squat: 2.5, bench: 2.5, deadlift: 5, other: 2.5 }, off: 5 }; return { data: s }; }); },
      set: function (patch) {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return bad('Settings change with an object of what changes.', 'patch');
        var keys = Object.keys(patch); if (!keys.length) return bad('Nothing to change.', 'patch');
        if (keys.indexOf('plan') >= 0) return bad('Change the plan with settings.plan(id).', 'plan');
        for (var i = 0; i < keys.length; i++) { var c = checks[keys[i]]; if (!c) return bad('There is no setting called ' + keys[i] + '.', keys[i]); var why = c(patch[keys[i]]); if (why) return bad(why, keys[i]); }
        var cur = settingsOf(), p2 = {};
        keys.forEach(function (k) { var v = clone(patch[k]); if (k === 'words' || k === 'notifications' || k === 'reminders' || k === 'keys') { var base = clone(cur[k]); Object.keys(v).forEach(function (q) { base[q] = q === 'pushes' || q === 'auto' ? Object.assign({}, base[q] || {}, v[q]) : v[q]; }); v = base; } p2[k] = v; });
        if (stableKey(keys.map(function (k) { return cur[k]; })) === stableKey(keys.map(function (k) { return p2[k]; }))) return ok({ keys: keys }, { undo: null, label: '' });
        return commit('settings', { patch: p2, at: stamp() });
      },
      plan: function (id) {
        var P1 = PLANS.filter(function (p) { return p.id === id; })[0]; if (!P1) return bad('A plan is ' + PLANS.map(function (p) { return p.id; }).join(', ') + '.', 'plan');
        if (P1.id === planNow().id) return ok({ plan: P1.id }, { undo: null, label: '' });
        if (P1.max != null && P1.max < D.lifters.length) return bad('You have ' + D.lifters.length + ' lifters. ' + P1.name + ' holds ' + P1.max + '.', 'plan');
        return commit('plan', { plan: P1.id, at: stamp() });
      }
    };

    /* ---- Lifters and Programs: the meets a lifter has, a start with the team, the maxes a meet offers ---- */
    var lget0 = P.lifters.get, pget0 = P.programs.get;
    P.lifters.get = function (id) {
      var r = lget0(id); if (r.error) return r; var l = L(id);
      return sel('lifter2', id, function () {
        var d = clone(r.data); d.meets = meetsOf(l).map(meetOut); if (ST.booked[l.id] && ST.booked[l.id].length) d.meet = Object.assign(d.meet || {}, d.meets[0]);
        var T = allTeams().filter(function (t) { return t.members.some(function (m) { return m.id === l.id; }); })[0];
        if (T && d.program) { var fr = teamFrom(T, l); if (fr != null && fr > teamNow(T) + 1) { var on = K.add(T.startsOn, (fr - 1) * 7); d.program.startsWeek = fr; d.program.startsOn = on; d.program.team = slug(T.name); } else if (fr != null) d.program.team = slug(T.name); }
        return { data: d };
      });
    };
    P.programs.get = function (id, o) {
      if (o && o.block === 'next') return pget0(id, o);
      var r = pget0(id, o); if (r.error || !r.data) return r; var l = L(id);
      return sel('pget2', id, function () {
        var meta = clone(r.meta), offers = [];
        (ST.results[l.id] || []).forEach(function (x) { LIFTS.forEach(function (k) { var b = x.made[k], mx = r.data.maxes ? r.data.maxes[k] : null; if (b != null && (mx == null || b > mx)) offers.push({ lift: k, from: mx, to: b, meetId: x.meetId, text: upper1(k) + ' ' + (mx == null ? '' : n(mx) + ' → ') + n(b) + ' from the ' + x.name + '. Use it?' }); }); });
        meta.offers = offers; delete meta.v;
        return { data: r.data, meta: meta };
      });
    };
  })(PL);

  /* ================= SPEC C calls (13 Nov evening; r6/spec-c/plan.md, package STORE) =================
     first-time-coach.md §13 and function-polish.md §6 in contract v1's shapes ({ data, meta: { v, ... } } or { error }; writes
     answer meta.undo and meta.label). Additive: every call above answers as it did; pages guard each of these with
     typeof PL.x.y === 'function' (shared.md §6.17).
       PL.desk.mode() · PL.lifters.add(o) · lifters.get(id).data.stage, stageText, stageFacts · lifters.viewedIntake(id) ·
       lifters.numbers(id) · lifters.list rows' stage (group 'invited'), meta.counts.invited · PL.invites.preview(name),
       create(o), list(), resend(id), cancel(id) · PL.demo.join(inviteId), firstSession(lifterId) (the fresh desk only) ·
       PL.setup.get(), hide(), show(), watched() · PL.starters.list(), get(id, o), pick(lifterId) · programs.start(id,
       { from: 'starter', starter, perWeek, days, startsOn, maxes, lifts }) and days on every start (meta.placed) ·
       programs.sendMany(id, [1, 2, 3, 4]) · programs.plan(id) · programs.fillGap(id) · programs.letRpe(id, n, o) · programs.openChecks(id, [1, 2, 3, 4]) (polish-d2: { weeks, count, text, send, look }) ·
       programs.next(id, { …, days, recovery }) · programs.queue() rows' dueText and dueLabel · programs.list rows' next.text
       and countdown · PL.templates.fit(tid, lifterId) · PL.fmt.e1(x), fmt.out(days) · PL.terms.list(), get(key), find(q)
       · PL.billing.charge(id, o), cadence 'once', summary().data.month.words · PL.settings keys intakeQs and remindBefore
       · counts().invited and setupLeft · meets.plan(id).data phase, basis, guess, timeline, job · meets.book: nothing
       ticked, Safe from the intake for a first meet · teams.get members[].quiet · teams.sendWeek(id, n, { ids, hold }) ·
       items' menu moves (first-<id>'s "Do it Saturday" runs as a reminder through items.run) */
  (function (P) {
    var FRESH = !!D.fresh, EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, WD7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var dat = function (r) { return r && !r.error ? r.data : null; };
    var noDemo = function () { return fail('invalid', 'The example desk has no demo lifters.'); };
    var notMade = function () { return fail('not_found', 'There is no invite like that.'); };

    /* ---------------- the desk (FTC §2.1, §2.3) ---------------- */
    P.desk = { mode: function () { return sel('deskMode', undefined, function () { return { data: { mode: FRESH ? 'fresh' : 'sample', prefix: PFX } }; }); } };

    /* ---------------- adding a lifter (FTC §3.2): one sheet, two ways ---------------- */
    function nameTaken(nm) { var k = String(nm).toLowerCase(); return D.lifters.some(function (l) { return String(l.name).toLowerCase() === k; }); }
    function newId(nm) { var b = 'new-' + (slug(nm) || 'lifter'), id = b, k = 2; while (K.L(id)) id = b + '-' + (k++); return id; }
    var PLAN_UP = { Free: 'Basic', Basic: 'Pro', Pro: 'Premium' };
    /* the plan full: "Free holds 3 lifters. Switch to Basic first." (an unused invite holds a seat) */
    function seatFull() {
      var mo = money(); if (mo.free > 0) return null;
      var plan = String((D.coach && D.coach.plan) || 'Free'), nxt = PLAN_UP[plan];
      return plan + ' holds ' + (D.coach ? D.coach.limit : 0) + ' lifters.' + (nxt ? ' Switch to ' + nxt + ' first.' : ' Every seat is taken.');
    }
    function addErrors(o) {
      var out = [], push = function (f, m) { if (!out.some(function (x) { return x.field === f; })) out.push({ field: f, message: m }); };
      if (!words0(o.name)) push('name', 'Write a name.');
      if (o.email != null && o.email !== '' && !(isStr(o.email) && EMAIL.test(o.email.trim()))) push('email', 'An email like jess@example.com, or leave it empty.');
      LIFTS.forEach(function (k) {
        var x = o.best && o.best[k]; if (x == null || typeof x !== 'object') return;
        var hasKg = x.kg != null && x.kg !== '', hasR = x.reps != null && x.reps !== '';
        if (!hasKg && !hasR) return;
        if (!(isNum(x.kg) && x.kg >= 20 && x.kg <= 600 && Math.abs(x.kg * 2 - Math.round(x.kg * 2)) < 1e-9)) push('best.' + k + '.kg', 'Kilos like 85 or 82.5.');
        if (!(isNum(x.reps) && x.reps >= 1 && x.reps <= 12 && x.reps % 1 === 0)) push('best.' + k + '.reps', 'Reps from 1 to 12.');
      });
      if (!(isNum(o.bw) && o.bw >= 30 && o.bw <= 250)) push('bw', 'Bodyweight in kilos, like 61.8.');
      if (!weekdays(o.days).length) push('days', 'Pick the days they train.');
      if (o.meet && typeof o.meet === 'object' && (words0(o.meet.name) || o.meet.date)) { if (!words0(o.meet.name) || !isIso(o.meet.date) || o.meet.date <= TODAY) push('meet.date', 'Give the meet a date to come.'); }
      if (o.minutes != null && o.minutes !== '' && !(isNum(o.minutes) && o.minutes >= 15 && o.minutes <= 300)) push('minutes', 'Minutes like 60, or leave it empty.');
      return out;
    }
    P.lifters.add = function (o) {
      o = argObj(o); var errs = addErrors(o); if (errs.length) return fail('invalid', errs[0].message, errs);
      var nm = words0(o.name); if (nameTaken(nm)) return fail('conflict', nm + ' is on your desk already.');
      var full = seatFull(); if (full) return fail('conflict', full);
      var iv = inviteOf(nm);
      return commit('madeAdd', { by: 'hand', lid: newId(nm), name: nm, sex: o.sex === 'F' || o.sex === 'M' ? o.sex : null, best: clone(o.best || {}), bw: o.bw, days: weekdays(o.days), minutes: isNum(o.minutes) ? o.minutes : null,
        meet: o.meet && words0(o.meet.name) ? { name: words0(o.meet.name), date: o.meet.date, fed: isStr(o.meet.fed) ? o.meet.fed : null } : null, injuries: isStr(o.injuries) && o.injuries.trim() ? o.injuries.trim() : null,
        email: isStr(o.email) && o.email.trim() ? o.email.trim() : null, code: iv.code, at: stamp() });
    };
    /* the intake read on the lifter's page (Getting started step 2): no toast, no undo */
    P.lifters.viewedIntake = function (id) {
      var l = L(id); if (!l) return noLifter(id); if (!l.intake) return bad(l.first + ' has no intake yet.', 'id');
      var r = commit('intakeSeen', { id: l.id, at: stamp() }); if (r.meta) { r.meta.undo = null; r.meta.label = ''; } return r;
    };
    var lget3 = P.lifters.get;
    P.lifters.get = function (id) {
      var r = lget3(id); if (r.error) return r; var l = L(id);
      return sel('lifter3', id, function () {
        var d = clone(r.data), st = stageOf(l), sw = stageWords(l, st);
        d.stage = st === 'none' ? null : st; d.stageText = st === 'training' || st === 'none' ? (d.reason ? d.reason.text : '') : sw.text; d.stageFacts = sw.facts || null; var oa = offApp(l); d.notOnApp = oa ? { text: oa.text, link: oa.link, url: oa.url, label: oa.label } : null; d.weekText = st === 'training' ? weekLine(l) : '';
        d.made = l.made ? { by: l.made.by, at: l.made.at, email: l.made.email, link: 'powalifta.com/j/' + l.made.code, inviteId: l.made.invite, joined: l.made.joined } : null;
        d.intakeSeen = ST.intakeSeen[l.id] || null; d.lastTop = lastTopOf(l);
        /* the Intake head's sub (FTC §3.4, FP F9): "Answered Wed 4 Nov", "Answered today 07:27", "Typed by you today" */
        var ia = l.intake && l.intake.at ? String(l.intake.at) : null, iday = ia ? day10(ia) : null;
        d.intakeWhen = !l.intake ? null : l.intake.by === 'coach' ? 'Typed by you ' + (iday === nowIso().slice(0, 10) ? 'today' : dmyOf(iday)) : ia ? 'Answered ' + (iday === nowIso().slice(0, 10) ? 'today ' + ia.slice(11, 16) : dmyOf(iday)) : 'Answered';
        return { data: d };
      });
    };
    var llist3 = P.lifters.list;
    P.lifters.list = function (o) {
      var r = llist3(o); if (r.error) return r;
      return sel('lifters3', stableKey(o || {}), function () {
        var meta = clone(r.meta); delete meta.v; meta.counts = meta.counts || {}; meta.counts.invited = model().rows.filter(function (x) { return x.stage === 'invited'; }).length;
        return { data: r.data, meta: meta };
      });
    };

    /* ---------------- invites (FTC §3.2 to §3.4, FP F9) ---------------- */
    function inviteLifter(id) { return D.lifters.filter(function (l) { return l.made && l.made.invite && (l.made.invite === id || l.id === id); })[0] || null; }
    function inviteRow(l) { var m = l.made; return { id: m.invite, lifterId: l.id, name: l.name, email: m.email || null, at: m.at, state: l.intake ? 'joined' : 'invited', link: 'powalifta.com/j/' + m.code, url: 'https://powalifta.com/j/' + m.code, code: m.code, resent: m.resent || null, stage: stageOf(l), stageText: stageWords(l, stageOf(l)).text || '' }; }
    P.invites = {
      preview: function (name) { var nm = words0(name); if (!nm) return bad('Write a name first.', 'name'); return sel('invPrev', nm, function () { return { data: inviteOf(nm) }; }); },
      create: function (o) {
        o = argObj(o); var nm = words0(o.name), em = isStr(o.email) ? o.email.trim() : '', errs = [];
        if (!nm) errs.push({ field: 'name', message: 'Write a name.' });
        if (em && !EMAIL.test(em)) errs.push({ field: 'email', message: 'An email like jess@example.com, or leave it empty.' });
        var bill = null;
        if (o.pkg != null && o.pkg !== '') {
          var pk = pkgFind(o.pkg); if (!pk) errs.push({ field: 'pkg', message: 'There is no package “' + o.pkg + '”. Add it in Settings first.' });
          var amt = o.amount == null || o.amount === '' ? pk && pk.amount : o.amount; if (pk && !(isNum(amt) && amt > 0 && amt <= 100000)) errs.push({ field: 'amount', message: 'A price is over 0. Free needs no price: close this.' });
          var cad = cadOf(o.cadence) || (pk && pk.cadence) || 'monthly', st0 = o.startsOn == null ? nextMonday() : o.startsOn; if (!isIso(st0) || st0 < TODAY) errs.push({ field: 'startsOn', message: 'Starts today or a day to come.' });
          if (pk) bill = { pkg: pk.name, amount: amt, cadence: cad, currency: pk.currency || 'USD', firstDue: st0 };
        } else if (o.amount != null && o.amount !== '' && o.amount !== 0) errs.push({ field: 'pkg', message: 'Pick a package for that price, or leave both empty.' });
        if (errs.length) return fail('invalid', errs[0].message, errs);
        if (nameTaken(nm)) return fail('conflict', nm + ' is on your desk already.');
        var full = seatFull(); if (full) return fail('conflict', full);
        var lid = newId(nm), iv = inviteOf(nm), smp = FRESH && ST.samples < (D.sampleIntakes || []).length ? ST.samples : null;
        var r = commit('madeAdd', { by: 'invite', lid: lid, iid: 'inv-' + lid.replace(/^new-/, ''), name: nm, email: em || null, code: iv.code, sample: smp, bill: bill || undefined, at: stamp() });
        if (r.data) r.data = Object.assign({}, r.data, { id: r.data.inviteId, lifterId: r.data.lifterId, words: { copied: nm + ' invited. Link copied.', shown: nm + ' invited. ' + (smp != null && D.sampleIntakes[smp] && D.sampleIntakes[smp].sex === 'M' ? 'His' : smp != null && D.sampleIntakes[smp] && D.sampleIntakes[smp].sex === 'F' ? 'Her' : 'Their') + ' link is ' + iv.link + '.' } });
        return r;
      },
      list: function () { return sel('invites', undefined, function () { var rows = D.lifters.filter(function (l) { return l.made && l.made.invite; }).map(inviteRow).sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); }); return { data: rows, meta: { total: rows.length, invited: rows.filter(function (x) { return x.state === 'invited'; }).length } }; }); },
      resend: function (id) {
        var l = inviteLifter(id); if (!l) return notMade(); if (l.intake) return fail('conflict', l.first + ' has joined already.');
        if (!l.made.email) return bad(l.first + ' has no email. Copy ' + herOf(l) + ' link instead.', 'email');
        var r = commit('inviteResend', { lid: l.id, at: stamp() }); if (r.meta) r.meta.undo = null; return r;
      },
      cancel: function (id) { var l = inviteLifter(id); if (!l) return notMade(); if (l.intake) return fail('conflict', l.first + ' has joined already.'); return commit('inviteCancel', { lid: l.id, at: stamp() }); }
    };

    /* ---------------- the demo plays the lifter (FTC §2.4): the fresh desk only ---------------- */
    P.demo = {
      join: function (inviteId) {
        if (!FRESH) return noDemo();
        var l = inviteLifter(inviteId); if (!l) return notMade(); if (l.intake) return fail('conflict', l.first + ' has joined already.');
        var s = l.made.sample != null ? l.made.sample : ST.samples; if (!(D.sampleIntakes || [])[s]) return fail('not_found', 'The demo has no answers left for ' + l.first + '.');
        var r = commit('demoJoin', { lid: l.id, sample: s, at: stamp() }); if (r.meta) r.meta.undo = null; return r;
      },
      /* her first session: the clock moves to its day at 19:10 and the sample's sets are logged by her (not "Logged by you") */
      firstSession: function (lifterId) {
        if (!FRESH) return noDemo();
        var l = L(lifterId); if (!l) return noLifter(lifterId); if (!l.program || !anySent(l)) return bad(l.first + '’s first block is not sent yet.', 'id');
        var smp = l.made && l.made.sample != null ? (D.sampleIntakes || [])[l.made.sample] : null, ses = smp && smp.session; if (!ses) return fail('not_found', 'The demo has no session for ' + l.first + '.');
        var w = l.program.weeks[0], d = trainDays(w)[(ses.day || 1) - 1]; if (!d) return fail('not_found', 'Week 1 has no day ' + ses.day + '.');
        var iso = dayDateOf(l, 0, d.name), at = iso + 'T' + (ses.at || '19:10'); if (tOf(at) > lastStamp) P.setNow(at);
        /* FIX-LOGIC (build C walk 2): she opened week 1 on her phone before she lifted it, so it reads "Seen", not "Not seen yet" */
        if (!ST.weekSeen[l.id + ':1']) { var sn = commit('seen', { what: 'week', key: l.id + ':1', id: l.id, at: stamp(), by: 'lifter' }); if (sn.error) return sn; }
        var eng = engineOf(l), wi = 0, out = [];
        (ses.sets || []).forEach(function (x) {
          var ei = -1, li = x.line || 0; (d.exercises || []).forEach(function (e, i) { if (ei >= 0) return; if (x.lift ? e.lift === x.lift && (!e.variant || e.variant === 'Competition') : sentence(e.title) === sentence(x.name)) ei = i; });
          if (ei < 0) return; var e = d.exercises[ei], g = groupsOf(e)[li]; if (!g) return;
          var key = d.name + '|' + e.title + '|' + occOf(d, ei) + '|' + li, kg = 0;
          if (eng && eng.b) { var r0 = eng.idx[key]; if (r0 != null) { try { var ld = eng.b.load(r0, wi); kg = ld && isNum(ld.kg) ? ld.kg : 0; } catch (err) { kg = 0; } } }
          if (!kg && isNum(g.w) && g.w > 0) kg = g.w;
          var last = ses.sets.indexOf(x) === ses.sets.length - 1;
          out.push(commit('logFor', { id: l.id, week: 1, day: d.name, row: key, by: 'lifter', sets: g.sets.map(function () { return { w: kg, r: g.r, felt: x.felt }; }), note: last && ses.note ? ses.note : undefined, at: stamp() }));
        });
        /* FIX-LOGIC (build C walk 2): she lifted the whole day, so the lines the sample does not rate (her core work) are logged
           as written, unrated: the session reads done (9 of 9), as "Week 1: 1 of 4 done" says everywhere */
        (d.exercises || []).forEach(function (e, ei) {
          groupsOf(e).forEach(function (g, li) {
            if (!g || !g.sets.length || g.sets.every(function (q) { return q.done; })) return;
            var key = d.name + '|' + e.title + '|' + occOf(d, ei) + '|' + li, kg = 0;
            if (eng && eng.b) { var r1 = eng.idx[key]; if (r1 != null) { try { var ld1 = eng.b.load(r1, wi); kg = ld1 && isNum(ld1.kg) ? ld1.kg : 0; } catch (err) { kg = 0; } } }
            if (!kg && isNum(g.w) && g.w > 0) kg = g.w;
            out.push(commit('logFor', { id: l.id, week: 1, day: d.name, row: key, by: 'lifter', sets: g.sets.map(function () { return { w: kg, r: g.r }; }), at: stamp() }));
          });
        });
        var bad0 = out.filter(function (r) { return r.error; })[0]; if (bad0) return bad0;
        return ok({ id: l.id, day: d.name, date: iso, logged: out.length, note: ses.note || '' }, { undo: null, label: l.first + ' lifted ' + d.name.toLowerCase() + ', ' + dmyOf(iso) + '.' });
      }
    };

    /* ---------------- Getting started (FTC §4.1) ---------------- */
    /* FIX-LOGIC (build C walk 2, Maya added after Jess's block went out): the steps follow the first lifter added while her
       own steps (intake, first block, send) are open; once they are done they follow the next lifter the desk added whose
       first block still waits, so the crimson is the job that is waiting ("Start Maya's first block"), not Jess's tips */
    function ownStepsDone(l) { return !!(l.intake && (ST.intakeSeen[l.id] || l.intake.by === 'coach') && l.program && anySent(l)); }
    function setupLifter() {
      var made = D.lifters.filter(function (l) { return !!l.made; });
      if (made.length) { if (!ownStepsDone(made[0])) return made[0]; return made.filter(function (l) { return !ownStepsDone(l) && stageOf(l) !== 'invited'; })[0] || made[0]; }
      return D.lifters.filter(function (l) { var it = C.get('first-' + l.id); return it && !doneOf(it.id); })[0] || null;
    }
    /* FIX-LOGIC (SHEETS' request, FTC §4.1): "When all five are done the card becomes one line; on the next visit it is gone".
       The card lives on the Overview: an Overview load whose setup.get() finds every step done marks it in this tab (outside
       pl:v1*, so it is no write of the desk: no version, no event, no Undo); the next load reads the mark and answers show
       false, so no page writes during a render. Steps done on another page leave the one-line last look for the Overview */
    var SETUP_K = 'powa-r6-setupdone:' + PFX, SETUP_SEEN = sGet(SETUP_K) === '1';
    function onOverview() { try { return /(^|\/)overview\.html$/.test(String(W.location && W.location.pathname || '')); } catch (e) { return false; } }
    function setupMark(o) { if (o.done === o.of) { if (onOverview() && sGet(SETUP_K) !== '1') sSet(SETUP_K, '1'); } else if (sGet(SETUP_K) != null || SETUP_SEEN) { sDel(SETUP_K); SETUP_SEEN = false; o.gone = false; } return o; }
    function setupOut() {
      var l = setupLifter(), S0 = ST.setup, n0 = D.lifters.filter(function (x) { return stageOf(x) !== 'invited'; }).length, inv = l && stageOf(l) === 'invited';
      var p = l && l.program, f = l ? l.first : null, her = l ? herOf(l) : 'their', sh = l ? sheOf(l) : 'They', sent = l ? anySent(l) : false;
      var sentAt = sent ? p.weeks.map(function (w) { return w.sentAt; }).filter(Boolean).sort().pop() : null, seenAt = sent ? p.weeks.map(function (w, i) { return ST.weekSeen[l.id + ':' + (i + 1)] || null; }).filter(Boolean).sort()[0] || null : null, fw = l ? firstWeeks(l) : [], span = fw.length > 1 ? 'weeks 1 to ' + fw.length : 'week 1';
      var steps = [
        { key: 'add', done: !!l || D.lifters.length > 0, at: l && l.made ? l.made.at : null, title: 'Add your first lifter', line: 'Invite them with a link, or type them in yourself.',
          doneText: l && l.made ? l.name + (l.made.by === 'invite' ? ' invited ' : ' added ') + hhmm(l.made.at) : 'Lifters on your desk', act: { id: 'add', label: 'Add your first lifter…', go: null, run: 'add' } },
        { key: 'intake', done: !!(l && l.intake && (ST.intakeSeen[l.id] || l.intake.by === 'coach')), at: l ? ST.intakeSeen[l.id] || (l.intake && l.intake.by === 'coach' ? l.intake.at : null) : null,
          title: f ? 'Read ' + f + '’s intake' : 'Read your lifter’s intake', line: inv ? f + ' hasn’t joined yet. ' + upper1(her) + ' answers land here.' : 'Best lifts, days, injuries and goal.',
          doneText: l && l.intake && l.intake.by === 'coach' ? 'Intake typed by you' : f ? f + '’s intake read ' + hhmm(ST.intakeSeen[l.id]) : '',
          act: inv ? { id: 'copy', label: 'Copy ' + f + '’s link', go: null, run: 'copy' } : { id: 'intake', label: f ? 'Open ' + f + '’s intake' : 'Open the intake', go: l ? { place: 'lifters', hash: 'id=' + l.id } : null, run: null } },
        { key: 'block', done: !!p, at: l && ST.starts[l.id] ? localIso(tOf(ST.starts[l.id].at)) : null, title: f ? 'Write ' + f + '’s first block' : 'Write your lifter’s first block', line: 'Pick a starter. Loads come from ' + her + ' lifts.',
          doneText: p ? p.name + (firstSessionOf(l) ? ', from ' + dmyOf(firstSessionOf(l)) : '') : '', act: { id: 'start', label: f ? 'Start ' + f + '’s first block' : 'Start a first block', go: l ? { place: 'programs', hash: 'id=' + l.id + '&start=first' } : { place: 'programs', hash: 'tab=templates' }, run: null } },
        { key: 'send', done: sent, at: sentAt ? localIso(tOf(sentAt)) : null, title: 'Send it', line: sh + (sh === 'They' ? ' train' : ' trains') + ' from it in ' + her + ' app.',
          doneText: sentAt ? upper1(span) + ' sent ' + hhmm(sentAt) + '. ' + (seenAt ? 'Seen ' + (seenAt.slice(0, 10) !== localIso(tOf(sentAt)).slice(0, 10) ? K.wd3(seenAt.slice(0, 10)) + ' ' : '') + seenAt.slice(11, 16) + '.' : offApp(l) ? 'Not on the app yet.' : 'Not seen yet.') : '', act: { id: 'send', label: f ? 'Send ' + span + ' to ' + f : 'Send the first weeks', go: l ? { place: 'programs', hash: 'id=' + l.id } : null, run: null } },
        { key: 'week1', done: !!S0.watched, at: S0.watched || null, title: 'Watch week one', line: 'What to look for in ' + her + ' first sessions.', doneText: S0.watched ? 'Read ' + String(S0.watched).slice(11, 16) : '', act: { id: 'weekone', label: 'Read what to watch', go: null, run: 'weekone' } }
      ];
      var done = steps.filter(function (x) { return x.done; }).length, next = (steps.filter(function (x) { return !x.done; })[0] || {}).key || null;
      var gone = done === 5 && SETUP_SEEN;
      var show = S0.hidden ? false : S0.shown ? true : gone ? false : FRESH && n0 < 4;
      return { show: show, done: done, of: 5, next: next, lifterId: l ? l.id : null, hidden: !!S0.hidden, gone: gone, steps: steps };
    }
    P.setup = {
      get: function () { return sel('setup', undefined, function () { return { data: setupMark(setupOut()) }; }); },
      hide: function () { if (ST.setup.hidden) return ok(clone(ST.setup), { undo: null, label: '' }); return commit('setup', { what: 'hide', at: stamp() }); },
      show: function () { if (ST.setup.shown && !ST.setup.hidden) return ok(clone(ST.setup), { undo: null, label: '' }); return commit('setup', { what: 'show', at: stamp() }); },
      watched: function () { if (ST.setup.watched) return ok(clone(ST.setup), { undo: null, label: '' }); return commit('setup', { what: 'watched', at: stamp() }); }
    };

    /* ---------------- starter programs (FTC §7.1, §7.2) ---------------- */
    function starterOf(id) { return (D.starters || []).filter(function (s) { return s.id === id; })[0] || null; }
    /* the meet a first block fits to: the booked one, else the intake's */
    function meetFor(l) {
      if (l.meet && l.meet.days > 0) return { iso: day10(l.meet.date) || K.add(TODAY, l.meet.days), name: l.meet.name, from: 'booked', fed: l.meet.fed || null };
      var im = l.intake && l.intake.meet; return im && isIso(im.date) && im.date > TODAY ? { iso: im.date, name: im.name, from: 'intake', fed: im.federation || null } : null;
    }
    function recentLifts(l) { var ib = l.intake && l.intake.best; if (!ib) return true; return LIFTS.every(function (k) { var x = ib[k]; return !x || !x.when || -K.daysTo(day10(x.when)) <= 84; }); }
    function startMaxesOf(l, lifts) { var m = startMaxes(l), o = {}; LIFTS.forEach(function (k) { var v = m[k]; o[k] = !isNum(v) ? null : lifts === 'old' ? Math.round(v * 0.9 / 2.5 + 1e-9) * 2.5 : Math.round(v / 2.5 + 1e-9) * 2.5; }); return o; }
    function weeksTo(startIso, meetIso) { return Math.round((K.d(K.monday(meetIso)) - K.d(K.monday(startIso))) / (7 * 864e5)) + 1; }
    function fitFor(l, sid, o) {
      var Bk = BLK(), st = starterOf(sid); if (!st) return fail('not_found', 'There is no starter called ' + (isStr(sid) ? '“' + sid + '”' : 'that') + '.');
      if (!Bk || typeof Bk.fitStarter !== 'function') return fail('invalid', 'Starters need block.js on the page.');
      var days = weekdays(o.days && o.days.length ? o.days : l && l.intake ? l.intake.days : []), mt = l ? meetFor(l) : null, start = isIso(o.startsOn) ? o.startsOn : l ? firstOn(l) : nextMonday();
      var mx = o.maxes && typeof o.maxes === 'object' ? o.maxes : l ? startMaxesOf(l, o.lifts) : {};
      var r; try { r = Bk.fitStarter(st, { meetIso: mt ? mt.iso : null, startIso: start, perWeek: isNum(o.perWeek) ? o.perWeek : undefined, days: days, maxes: mx, lifterId: l ? l.id : null, lifter: l || undefined, meetName: mt ? mt.name : null }); } catch (e) { r = fail('invalid', 'That starter could not be fitted: ' + (e && e.message)); }
      return r;
    }
    function pickOf(l) {
      var days = weekdays(l.intake && l.intake.days), mt = meetFor(l), yrs = l.intake ? l.intake.yearsLifting : null, id = 'base';
      var N = mt ? weeksTo(firstOn(l), mt.iso) : null;
      if (N != null && N >= 8 && N <= 16) id = 'first-meet'; else if (!yrs || /^0/.test(String(yrs))) id = 'first-8';
      var st = starterOf(id), want = days.length || 3, per = (st.perWeek || [3]).filter(function (k) { return k <= want; }).pop() || (st.perWeek || [3])[0];
      var tdays = (st.blocks && st.blocks[per] ? st.blocks[per].days : st.block.days).map(function (d) { return { name: d.name, wd: d.wd == null ? null : d.wd }; });
      var Bk = BLK(), placed = Bk && typeof Bk.placeDays === 'function' ? Bk.placeDays(tdays, days, l) : null;
      var on = placed ? placed.days.map(function (d) { return WD7[d.wd]; }).filter(Boolean) : days.slice(0, per);
      on = weekdays(on);
      return { id: id, perWeek: per, days: on, placed: placed, weeks: id === 'first-meet' ? N : st.weeks, lifts: recentLifts(l) ? 'recent' : 'old' };
    }
    P.starters = {
      list: function () { return sel('starters', undefined, function () { return { data: (D.starters || []).map(function (s) { return { id: s.id, name: s.name, for: s.for, how: s.how, perWeek: (s.perWeek || []).slice(), weeks: s.weeks, days: s.days, phases: clone(s.phases || []) }; }) }; }); },
      get: function (id, o) {
        o = argObj(o); var st = starterOf(id); if (!st) return fail('not_found', 'There is no starter called ' + (isStr(id) ? '“' + id + '”' : 'that') + '.');
        var l = o.lifterId != null ? L(o.lifterId) : null; if (o.lifterId != null && !l) return noLifter(o.lifterId);
        return sel('starter', [id, o.lifterId || null, o.perWeek || null, o.days || null, o.startsOn || null, o.lifts || null], function () {
          if (!l) return { data: clone(st.block), meta: { weeks: st.weeks, meetWeek: null, disabled: null, title: null, placed: null, kinds: (st.block.weeks || []).map(function (w) { return w.kind || null; }), perWeek: st.days, for: st.for, how: st.how, phases: clone(st.phases || []) } };
          var r = fitFor(l, id, o); if (r.error) return r;
          var meta = clone(r.meta || {}); delete meta.v; meta.for = st.for; meta.how = st.how; meta.phases = clone(st.phases || []); var mt = meetFor(l); meta.meet = mt ? { name: mt.name, date: mt.iso, from: mt.from } : null;
          return { data: r.data, meta: meta };
        });
      },
      pick: function (lifterId) { var l = L(lifterId); if (!l) return noLifter(lifterId); return sel('starterPick', lifterId, function () { return { data: pickOf(l) }; }); }
    };

    /* ---------------- programs: starts, first sends, the plan (FTC §7; FP F1, F2, F4) ---------------- */
    var start2 = P.programs.start;
    P.programs.start = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      var from = o.from || (o.starter ? 'starter' : o.template ? 'template' : 'intake');
      if (o.days != null && (!Array.isArray(o.days) || !o.days.length || weekdays(o.days).length !== o.days.length)) return bad('Pick each day once, Mon to Sun.', 'days');
      if (o.lifts != null && o.lifts !== 'recent' && o.lifts !== 'old') return bad('Pick Recent, or Old or a guess.', 'lifts');
      if (from !== 'starter' && from !== 'template' && from !== 'intake' && from !== 'blank') return start2(id, o);
      if (l.program) return fail('conflict', l.first + ' is on ' + l.program.name + ' already. Plan the next block instead.');
      if (o.maxes != null && (typeof o.maxes !== 'object' || LIFTS.some(function (k) { return o.maxes[k] != null && !kgOk(o.maxes[k], 20, 600); }))) return bad('Maxes are 20 to 600 kg, in 2.5 kg steps.', 'maxes');
      var days = o.days ? weekdays(o.days) : l.intake && l.intake.days ? weekdays(l.intake.days) : [];
      /* FIX-LOGIC (FP F2.3): "Add Saturday as a 4th day": one more training day for this block */
      if (o.addDay != null) { var adw = weekdays([o.addDay]); if (adw.length !== 1 || String(o.addDay).length < 3) return bad('Add a day from Mon to Sun.', 'addDay'); days = weekdays(days.concat(adw)); }
      var maxes = o.maxes ? clone(o.maxes) : o.lifts === 'old' ? startMaxesOf(l, 'old') : null, maxFrom = !o.maxes && o.lifts === 'old' ? { squat: 'intake', bench: 'intake', deadlift: 'intake' } : null;
      if (from === 'starter') {
        if (!l.intake && !maxes) return bad(l.first + ' has no intake to start from yet.', 'id');
        var fr = fitFor(l, o.starter, { perWeek: o.perWeek, days: days, startsOn: o.startsOn, lifts: o.lifts, maxes: maxes || undefined }); if (fr.error) return fr;
        if (!fr.data) return bad((fr.meta && fr.meta.disabled) || 'That starter does not fit ' + l.first + '.', 'starter');
        var json = clone(fr.data); json.starter = o.starter;
        var r = commit('programStart', { id: id, tpl: 'starter', at: stamp(), startsOn: json.start, from: 'starter', starter: o.starter, maxes: maxes || undefined, maxFrom: maxFrom || undefined, days: days.length ? days : undefined, json: json, placed: fr.meta && fr.meta.placed ? clone(fr.meta.placed.days) : undefined, lifts: o.lifts || undefined });
        if (r.meta) r.meta.placed = fr.meta ? clone(fr.meta.placed) : null;
        return r;
      }
      /* the old start with the days on every start (FTC §13) and the template's days placed (FP F2.2) */
      var Bk = BLK(), placed = null, tdays = null;
      if (from === 'template') { var key = o.template, t = templates().filter(function (x) { return x.id === key || x.name === key || slug(x.name) === key; })[0]; if (t) { var tb = tplBlock(t); tdays = tb && Array.isArray(tb.days) ? tb.days : null; } }
      var mg = null;
      if (o.merge != null) { mg = tplMergeArg(o.merge, tdays, days, l); if (mg.error) return mg; mg = mg.data; tdays = tdays.filter(function (d) { return d.name !== mg.day; }); }
      if (tdays && days.length && Bk && typeof Bk.placeDays === 'function') placed = Bk.placeDays(tdays.map(function (d) { return { name: d.name, wd: d.wd == null ? null : d.wd }; }), days, l);
      var o2 = Object.assign({}, o, { from: from }); if (days.length) o2.days = days; if (maxes) o2.maxes = maxes; if (mg) o2.merge = mg; else delete o2.merge;
      var r2 = startWith(l, o2, { placed: placed, maxFrom: maxFrom });
      if (r2.meta && placed) r2.meta.placed = placed;
      return r2;
    };
    /* the API's start (above) with the days and the placed days carried into the write */
    function startWith(l, o, x) {
      var from = o.from, tid = 'blank';
      if (from === 'template') { var key = o.template, t = templates().filter(function (y) { return y.id === key || y.name === key || slug(y.name) === key; })[0]; if (!t) return fail('not_found', 'There is no template called ' + (key == null ? 'that' : '“' + key + '”') + '.'); tid = t.id; }
      if (from === 'intake' && !l.intake) return bad(l.first + ' has no intake to start from.', 'from');
      var dfl;
      if (o.defaults != null) {
        if (typeof o.defaults !== 'object') return bad('Defaults are { prog, deloadAt }.', 'defaults');
        var Bk0 = BLK(), PIDS = Bk0 && Bk0.PROGS ? Bk0.PROGS.map(function (y) { return y.id; }) : ['same', 'kg2.5', 'kg5', 'rpe0.5', 'pct2.5', 'rep-1'];
        if (o.defaults.prog != null && PIDS.indexOf(o.defaults.prog) < 0) return bad('Each week is one of ' + PIDS.join(', ') + '.', 'defaults');
        if (o.defaults.deloadAt != null && !(isNum(o.defaults.deloadAt) && o.defaults.deloadAt >= 2 && o.defaults.deloadAt % 1 === 0)) return bad('A deload week is week 2 or later.', 'defaults');
        dfl = { prog: o.defaults.prog == null ? null : o.defaults.prog, deloadAt: o.defaults.deloadAt == null ? null : o.defaults.deloadAt };
      }
      var startsOn = isIso(o.startsOn) ? o.startsOn : from === 'intake' ? firstOn(l) : nextMonday();
      return commit('programStart', { id: l.id, tpl: tid, at: stamp(), startsOn: startsOn, from: from, merge: o.merge ? clone(o.merge) : undefined, maxes: o.maxes ? clone(o.maxes) : undefined, maxFrom: x.maxFrom || undefined, days: o.days && o.days.length ? o.days.slice() : from === 'intake' && l.intake.days ? l.intake.days.slice() : undefined, placed: x.placed ? clone(x.placed.days) : undefined, defaults: dfl });
    }
    /* weeks of a block in one write (FTC §7.4): the first block's weeks up to and including the first deload, at most 4 */
    P.programs.sendMany = function (id, ns, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!l.program) return bad(l.first + ' has no program to send.', 'id');
      ns = Array.isArray(ns) ? ns.slice() : [ns]; var len = blockWeeksOf(l);
      if (!ns.length || ns.some(function (x) { return !isNum(x) || x % 1 || x < 1 || x > len; })) return bad('Send weeks from 1 to ' + len + '.', 'n');
      ns = uniq(ns).sort(function (a, b) { return a - b; });
      if (o.message != null && (!isStr(o.message) || o.message.length > 1000)) return bad('A message is 1000 characters at most.', 'message');
      var weeks = [];
      for (var i = 0; i < ns.length; i++) { var args = sendArgsFor(id, ns[i], { note: i === 0 ? o.note : undefined, message: i === 0 ? o.message : undefined }); if (args.error) return args; args.hold = 0; weeks.push(args); }
      return commit('weeksSend', { id: id, weeks: weeks, at: stamp() });
    };
    /* FIX-LOGIC polish-d2 (first-time walk 3, Maya): the checks still open in the weeks a send is about to send, every kind
       (a session over her minutes, the same load 3 weeks running, a heavy line), so the send can ask once, plainly: send
       anyway, or look at the N checks first. A read: it never blocks a send. A check the coach kept is not open. */
    function spanWords(ns) {
      var run = ns.length > 1 && ns.every(function (x, i) { return !i || x === ns[i - 1] + 1; });
      return ns.length === 1 ? 'week ' + ns[0] : run ? 'weeks ' + ns[0] + ' to ' + ns[ns.length - 1] : 'weeks ' + ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1];
    }
    P.programs.openChecks = function (id, ns) {
      var l = L(id); if (!l) return noLifter(id);
      if (!l.program) return bad(l.first + ' has no program yet.', 'id');
      if (!BLK()) return fail('invalid', 'The checks need block.js on the page.');
      var len = blockWeeksOf(l); ns = ns == null ? [] : Array.isArray(ns) ? ns.slice() : [ns];
      if (!ns.length || ns.some(function (x) { return !isNum(x) || x % 1 || x < 1 || x > len; })) return bad('Weeks from 1 to ' + len + '.', 'n');
      ns = uniq(ns).sort(function (a, b) { return a - b; });
      return sel('popen', { id: id, ns: ns.join(',') }, function () {
        var eng = engineOf(l), b = eng && eng.b, weeks = [], total = 0;
        ns.forEach(function (wn) {
          var ck = []; if (b && b.weeks[wn - 1]) { try { ck = b.checks(wn - 1); } catch (e) { ck = []; } }
          weeks.push({ n: wn, count: ck.length, kinds: ck.map(function (q) { return q.kind; }), rows: ck.map(function (q) { return b.rows[q.r] ? b.rows[q.r].key : null; }).filter(Boolean) }); total += ck.length;
        });
        var sp = spanWords(ns), the = total === 1 ? 'the check' : 'the ' + total + ' checks';
        return { data: { id: l.id, weeks: weeks, count: total, first: (weeks.filter(function (w) { return w.count > 0; })[0] || {}).n || null,
          text: total ? upper1(sp) + (ns.length === 1 ? ' has ' : ' have ') + (total === 1 ? '1 check open.' : total + ' checks open.') : '',
          send: total ? 'Send ' + sp + ' anyway' : 'Send ' + sp, look: total ? 'Look at ' + the : '' } };
      });
    };
    /* the plan of a lifter (FP F1.1): the current block, the next one (a recovery week and an appended template keep their
       own rows), the gaps, and the week due next */
    function blockDates(b) {
      return b.weeks.map(function (w, c) { var ds = []; b.days.forEach(function (d) { if (!b.rows.some(function (row) { return row.day === d.name && row.cells[w.uid]; })) return; var x = null; try { x = b.dateOf(c, d.name); } catch (e) { x = null; } if (x) ds.push(x); }); ds.sort(); return { from: ds[0] || null, to: ds[ds.length - 1] || null }; });
    }
    function curDates(l) {
      var Bk = BLK(), p = l.program, out = [];
      if (Bk) { var eng = engineOf(l); if (eng && eng.b) return cached('cdates:' + l.id, function () { return blockDates(eng.b); }); }
      p.weeks.forEach(function (w, wi) { var ds = trainDays(w).map(function (d) { return dayDateOf(l, wi, d.name); }).filter(Boolean).sort(); out.push({ from: ds[0] || null, to: ds[ds.length - 1] || null }); });
      return out;
    }
    function planOut(l) {
      var p = l.program, out = { lifterId: l.id, blocks: [], gaps: [], due: null, line: '' };
      if (!p) { out.due = l.intake ? { kind: 'first' } : null; out.line = l.intake ? l.first + ' has no program yet.' : ''; return out; }
      var ww = dat(P.programs.weeks(l.id)) || [], cur = ww.filter(function (w) { return w.block === 'current'; }), nxt = ww.filter(function (w) { return w.block === 'next'; });
      var cd = curDates(l), dr = nextDrafts[l.id], cand = [], Bk = BLK();
      var curName = (drafts[l.id] && drafts[l.id].name) || p.name;
      var cweeks = cur.map(function (w, i) { var dd = cd[i] || {}; return { n: w.n, blockN: w.n, name: w.name, kind: w.kind || null, from: dd.from || null, to: dd.to || null, state: w.state }; });
      var cFrom = cweeks.map(function (w) { return w.from; }).filter(Boolean).sort()[0] || null, cTo = cweeks.map(function (w) { return w.to; }).filter(Boolean).sort().pop() || null;
      /* a block that ends at a meet runs to the meet day (Callum's Meet Prep: to today) */
      var mDay = l.meet ? day10(l.meet.date) || K.add(TODAY, l.meet.days) : null; if (mDay && cTo && mDay > cTo && K.daysTo(mDay) - K.daysTo(cTo) <= 7) cTo = mDay;
      out.blocks.push({ which: 'current', name: curName, from: cFrom, to: cTo, weeks: cweeks });
      /* a week whose change goes out from Teams is the team's row in the queue, not this lifter's own (FP F1.3) */
      cweeks.forEach(function (w, i) { if (cur[i] && cur[i].sendVia) return; cand.push({ block: 'current', n: w.n, from: w.from, state: w.state, name: w.name, kind: w.kind }); });
      var nFirst = null;
      if (dr && Array.isArray(dr.weeks) && Bk) {
        var nb = null; try { nb = Bk.from(dr); } catch (e) { nb = null; }
        var nd = nb ? blockDates(nb) : [], groups = [];
        var sb = ST.nextBlocks[l.id];
        dr.weeks.forEach(function (w, i) {
          /* an appended template keeps its own name (the store's record of the next block says it: "Strength Block") */
          var sw = sb && sb.weeks ? sb.weeks[i] : null, lab = w.label || null, nm = lab && /recovery|off/i.test(lab) ? lab : (sw && sw.phase) || w.phase || dr.name || 'Next block', ws = nxt[i] || {}, dd = nd[i] || {};
          var g = groups[groups.length - 1]; if (!g || g.name !== nm || (lab && /recovery|off/i.test(lab))) { g = { which: 'next', name: nm, from: null, to: null, weeks: [] }; groups.push(g); }
          /* FIX-LOGIC (P-PROGRAMS, FC1): blockN is the week's number inside its own group ("Strength Block week 1 sent") */
          g.weeks.push({ n: i + 1, blockN: g.weeks.length + 1, name: ws.name || nm, kind: ws.kind || null, from: dd.from || null, to: dd.to || null, state: ws.state || 'Not sent' });
          cand.push({ block: 'next', n: i + 1, from: dd.from || null, state: ws.state || 'Not sent', name: ws.name || nm, kind: ws.kind || null, recovery: !!(lab && /recovery/i.test(lab)) });
        });
        groups.forEach(function (g) { var fs = g.weeks.map(function (w) { return w.from; }).filter(Boolean).sort(), ts = g.weeks.map(function (w) { return w.to; }).filter(Boolean).sort(); g.from = fs[0] || null; g.to = ts[ts.length - 1] || null; out.blocks.push(g); });
        nFirst = groups.length ? groups[0].from : null;
        if (nFirst && cTo && K.daysTo(nFirst) - K.daysTo(cTo) > 8) { var gf = K.add(cTo, 1), gt = K.add(nFirst, -1), gw = Math.round((K.daysTo(gt) - K.daysTo(gf) + 1) / 7); out.gaps.push({ from: gf, to: gt, weeks: gw, text: 'Nothing written ' + dmyOf(gf) + ' to ' + dmyOf(gt) + (gw >= 1 ? ' (' + K.plural(gw, 'week') + ')' : '') + '.' }); }
      }
      /* due (FP F1.1): the earliest week not sent that starts within 9 days of now, or lies before a sent week (a hole); a gap
         that starts within 9 days counts as weeks to write; after a meet with nothing written, the recovery week */
      var now = nowIso().slice(0, 10), unsent = function (s) { return /^(Not written|Not sent)$/.test(s) || /changes? to send$/.test(s); }, sentS = function (s) { return /^Sent\b|^Goes out\b/.test(s); };
      var due = null;
      cand.filter(function (x) { return x.from && unsent(x.state); }).sort(function (a, b) { return a.from.localeCompare(b.from); }).some(function (x) {
        var soon = K.daysTo(x.from) <= 9 + K.daysTo(now), hole = cand.some(function (y) { return y.from && y.from > x.from && sentS(y.state); });
        if (!soon && !hole) return false;
        due = { block: x.block, n: x.n, from: x.from, label: (x.recovery ? 'Recovery week' : x.name || 'Week ' + x.n) + ', ' + dmyOf(x.from), why: x.recovery && l.meet && l.meet.days <= 0 ? 'after-meet' : /changes? to send$/.test(x.state) ? 'change' : soon ? 'week' : 'hole' };
        return true;
      });
      var g0 = out.gaps[0];
      if (g0 && K.daysTo(g0.from) <= 9 && (!due || g0.from < due.from)) due = { block: 'current', n: cweeks.length + 1, from: g0.from, label: 'Write the ' + (g0.weeks === 1 ? 'week' : g0.weeks + ' weeks') + ' between, ' + dmyOf(g0.from), why: 'gap' };
      if (!due && !dr && afterMeetDue(l)) { var ro = afterMeetOn(l); due = { block: 'next', n: 1, from: ro, label: 'Recovery week, ' + dmyOf(ro), why: 'after-meet' }; }
      /* the queue's own To do row (an item's change to a week, the rules on a sent week): the plan says the same (FP F1.3) */
      if (!due) { var qr = queueRows().rows.filter(function (x) { return x.group === 'todo' && x.lifterId === l.id; })[0]; if (qr) due = { block: qr.block || 'current', n: qr.week, from: qr.on || null, label: qr.what + (qr.on ? ', ' + dmyOf(qr.on) : ''), why: qr.kind === 'change' ? 'change' : qr.kind === 'after-meet' ? 'after-meet' : 'week' }; }
      out.due = due;
      /* the one sentence (Find's answer, the Plan section's title; never printed under a heading) */
      var nx = out.blocks.filter(function (b) { return b.which === 'next'; }), endsMeet = l.meet && l.meet.days <= 0 && l.meet.days >= -7;
      out.line = curName + (endsMeet ? ' ends ' + (l.meet.days === 0 ? 'today' : dmyOf(day10(l.meet.date))) : cTo ? ' runs to ' + dmyOf(cTo) : '') + '.' +
        (nx.length ? ' Next: ' + nx.map(function (b) { var sw = b.weeks.filter(function (w) { return /^Sent/.test(w.state); }); return (/recovery/i.test(b.name) ? 'recovery week' : b.name + (b.from ? ' from ' + dmyOf(b.from) : '')) + (sw.length ? ' (' + (sw.length === b.weeks.length ? 'sent' : 'week ' + sw.map(function (w) { return w.n - b.weeks[0].n + 1; }).join(' and ') + ' sent') + ')' : ' (not sent)'); }).join(', then ') + '.' : due && due.block === 'next' ? ' Next: ' + lower1(due.label) + ', not written.' : '') +
        (out.gaps.length ? ' ' + out.gaps[0].text : '');
      return out;
    }
    P.programs.plan = function (id) { var l = L(id); if (!l) return noLifter(id); return sel('pplan', id, function () { return { data: planOut(l) }; }); };
    P.programs.fillGap = function (id) {
      var l = L(id); if (!l) return noLifter(id); if (!l.program) return bad(l.first + ' has no program yet.', 'id');
      if (!BLK()) return fail('invalid', 'Filling a gap needs block.js on the page.');
      var pl = planOut(l), g = pl.gaps[0]; if (!g || g.weeks < 1) return bad('There is no gap to fill.', 'id');
      var cur = pl.blocks[0], k0 = cur.weeks.length + 1, k1 = cur.weeks.length + g.weeks, wds = g.weeks === 1 ? 'week ' + k0 : g.weeks === 2 ? 'weeks ' + k0 + ' and ' + k1 : 'weeks ' + k0 + ' to ' + k1;
      return commit('fillGap', { id: l.id, weeks: g.weeks, from: g.from, to: g.to, label: cur.name + ' ' + wds + ' written, ' + dmyOf(g.from) + ' to ' + dmyOf(g.to) + '. Not sent.', undoLabel: cur.name + ' ' + wds + ' taken out.', at: stamp() });
    };
    P.programs.letRpe = function (id, wn, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o); if (!l.program) return bad(l.first + ' has no program yet.', 'id');
      if (o.block === 'next') return bad('Only the current block’s weeks can be set by RPE.', 'block');
      var Bk = BLK(); if (!Bk) return fail('invalid', 'Setting loads by RPE needs block.js on the page.');
      if (!isNum(wn) || wn % 1 || wn < 1 || wn > blockWeeksOf(l)) return bad('A week from 1 to ' + blockWeeksOf(l) + '.', 'n');
      if (o.rows != null && (!Array.isArray(o.rows) || o.rows.some(function (x) { return !isStr(x); }))) return bad('Rows are row keys.', 'rows');
      var b = null; try { b = Bk.from(programAnswer(l).data); } catch (e) { b = null; } if (!b) return fail('invalid', 'That program cannot be read.');
      if (wn - 1 < l.program.weekIdx) return fail('locked', 'Week ' + wn + ' was lifted. Set a week that is still to come.');
      if (!rpeLines(b, wn - 1, o.rows).length) return bad('Nothing in week ' + wn + ' is off what you wrote.', 'n');
      return commit('letRpe', { id: l.id, n: wn, rows: o.rows ? o.rows.slice() : undefined, at: stamp() });
    };
    /* the next block with the days and the recovery week (FP F2.2, F2.6): a template after a meet goes after a recovery week,
       ticked by default, in one write */
    var next2 = P.programs.next;
    P.programs.next = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      if (!l.program) return next2(id, o);
      if (o.days != null && (!Array.isArray(o.days) || !o.days.length || weekdays(o.days).length !== o.days.length)) return bad('Pick each day once, Mon to Sun.', 'days');
      /* FIX-LOGIC (FP F2.3): the two quiet choices for a template with more days than the lifter */
      if (o.addDay != null) { var adw = weekdays([o.addDay]); if (adw.length !== 1 || String(o.addDay).length < 3) return bad('Add a day from Mon to Sun.', 'addDay'); o = Object.assign({}, o, { days: weekdays((o.days ? weekdays(o.days) : ownWeekdays(l).map(function (x) { return WD7[x.wd]; })).concat(adw)) }); delete o.addDay; }
      if (o.merge != null) {
        var tm = o.from === 'template' ? templates().filter(function (x) { return x.id === o.template || x.name === o.template || slug(x.name) === o.template; })[0] : null, tmb = tm ? tplBlock(tm) : null;
        var mg1 = tplMergeArg(o.merge, tmb && Array.isArray(tmb.days) ? tmb.days : null, o.days ? weekdays(o.days) : ownWeekdays(l).map(function (x) { return WD7[x.wd]; }), l); if (mg1.error) return mg1;
        o = Object.assign({}, o, { merge: mg1.data });
      }
      var r1 = nextWith(l, o), Bk1 = BLK();
      if (r1 && !r1.error && r1.meta && (o.from === 'template') && Bk1 && typeof Bk1.placeDays === 'function') {
        var t1 = templates().filter(function (x) { return x.id === o.template || x.name === o.template || slug(x.name) === o.template; })[0], tb1 = t1 ? tplBlock(t1) : null;
        if (tb1 && Array.isArray(tb1.days)) r1.meta.placed = Bk1.placeDays(tb1.days.filter(function (d) { return !o.merge || d.name !== o.merge.day; }).map(function (d) { return { name: d.name, wd: d.wd == null ? null : d.wd }; }), o.days ? weekdays(o.days) : ownWeekdays(l).map(function (x) { return WD7[x.wd]; }), l);
      }
      return r1;
    };
    function nextWith(l, o) {
      var id = l.id, from = o.from || 'recovery', atMeet = !!(l.meet && l.meet.days <= 0 && l.meet.days >= -7 && l.program.weekIdx >= l.program.weeks.length - 2);
      /* the coach's own start date says when the template starts: the recovery week goes in front only when asked, or by default
         when no date is given */
      var rec = o.recovery == null ? atMeet && o.startsOn == null : !!o.recovery;
      if (from !== 'template' || !rec || !atMeet || nextDrafts[l.id] || ST.nextBlocks[l.id]) { var r0 = next2(id, o); return r0; }
      var t = templates().filter(function (x) { return x.id === o.template || x.name === o.template || slug(x.name) === o.template; })[0]; if (!t) return fail('not_found', 'There is no template called ' + (o.template == null ? 'that' : '“' + o.template + '”') + '.');
      var p = l.program, src = srcWeek(p), starts = afterMeetOn(l), name = 'After the ' + l.meet.name;
      var recA = { id: l.id, name: name, startsOn: starts, weeks: [{ label: 'Recovery week', days: trainDays(p.weeks[src]).map(function (d) { return d.name; }) }], from: 'recovery', append: false, at: stamp(), label: '' };
      var weeks = []; for (var i = 0; i < t.weeks; i++) weeks.push({ label: null, phase: t.name, n: i + 1, days: t.days.slice() });
      var tplA = { id: l.id, name: name, startsOn: starts, weeks: weeks, from: 'template', template: t.id, append: true, days: o.days ? weekdays(o.days) : undefined, merge: o.merge ? clone(o.merge) : undefined, at: recA.at, label: '' };
      var tFrom = K.add(starts, 7);
      return commit('nextPair', { rec: recA, tpl: tplA, tplFrom: tFrom, at: recA.at, label: l.first + '’s next block: recovery week from ' + dmyOf(starts) + ', then ' + t.name + ' from ' + dmyOf(tFrom) + '. Nothing is sent yet.', undoLabel: l.first + '’s next block is taken out.' });
    }
    /* the queue's due words (P19) and the week it is for (FP F1.3) */
    var queue2 = P.programs.queue;
    P.programs.queue = function () {
      var r = queue2(); if (r.error) return r;
      return sel('pqueue3', undefined, function () {
        var rows = r.data.map(function (x) {
          var y = clone(x); if (y.group === 'todo' && y.due) y.dueText = 'Due ' + (y.due <= TODAY ? 'today' : K.wd3(y.due));
          if (y.lifterId) { var pd = planOut(K.L(y.lifterId)).due; y.dueLabel = pd && pd.label ? pd.label : null; }
          return y;
        });
        var meta = clone(r.meta); delete meta.v; return { data: rows, meta: meta };
      });
    };
    /* the list's next words: "Week 1 now, weeks 2 and 3 sent", the countdown by fmt.out (FP F6.1, FD3) */
    var plist2 = P.programs.list;
    P.programs.list = function (o) {
      var r = plist2(o); if (r.error) return r;
      return sel('programs3', stableKey(o || {}), function () {
        var rows = r.data.map(function (x) {
          var y = clone(x), l = K.L(y.lifterId); if (!l || !l.program) return y;
          var ww = (dat(P.programs.weeks(l.id)) || []).filter(function (w) { return w.block === 'current'; }), now = l.program.weekIdx, sentAhead = ww.filter(function (w, i) { return i > now && /^Sent/.test(w.state); }).map(function (w) { return w.n; });
          var parts = []; if (now >= 0 && ww[now]) parts.push('Week ' + ww[now].n + ' now');
          var run = sentAhead.length > 2 && sentAhead.every(function (x, i) { return i === 0 || x === sentAhead[i - 1] + 1; });
          if (sentAhead.length) parts.push((run ? 'weeks ' + sentAhead[0] + ' to ' + sentAhead[sentAhead.length - 1] : sentAhead.length > 1 ? 'weeks ' + sentAhead.slice(0, -1).join(', ') + ' and ' + sentAhead[sentAhead.length - 1] : 'week ' + sentAhead[0]) + ' sent');
          /* only where weeks went ahead of this one: the list's own words ("Week 4, due Sunday") say the rest better */
          y.next = Object.assign({}, y.next || {}); if (now >= 0 && sentAhead.length) y.next.text = upper1(parts.join(', '));
          if (l.meet && l.meet.days > 0) { var fo = fmtOut(l.meet.days); y.next.out = fo.text; y.next.outTitle = fo.title; }
          return y;
        });
        var meta = clone(r.meta); delete meta.v; return { data: rows, meta: meta };
      });
    };
    /* where a template's days land for a lifter (FP F2.1): the intake's days for a first block, the block's for a next one */
    P.templates.fit = function (tid, lifterId) {
      var t = templates().filter(function (x) { return x.id === tid || x.name === tid; })[0]; if (!t) return fail('not_found', 'There is no template ' + (isStr(tid) ? '“' + tid + '”' : 'like that') + '.');
      var l = L(lifterId); if (!l) return noLifter(lifterId);
      var Bk = BLK(); if (!Bk || typeof Bk.placeDays !== 'function') return fail('invalid', 'Fitting a template needs block.js on the page.');
      return sel('tplFit', [t.id, l.id], function () {
        var tb = tplBlock(t), td = (tb && tb.days ? tb.days : (t.days || []).map(function (d) { return { name: d, wd: null }; })).map(function (d) { return { name: d.name, wd: d.wd == null ? null : d.wd }; });
        var days = l.program ? ownWeekdays(l).map(function (x) { return WD7[x.wd]; }) : weekdays(l.intake && l.intake.days);
        var f = Bk.placeDays(td, days, l); return { data: { days: f.days, spare: f.spare, text: f.text, left: f.left || null } };
      });
    };

    /* ---------------- one number per fact (FP F6, FD1, FD3) ---------------- */
    function fmtE1(x) { return isNum(x) ? Math.round(x * 2) / 2 : null; }
    function fmtOut(days) {
      var d = Math.round(Number(days)), on = K.add(TODAY, d), title = (Math.abs(d) === 1 ? '1 day' : Math.abs(d) + ' days') + (d < 0 ? ' ago' : '') + ', ' + dmyOf(on);
      var text = outText(d);
      return { text: text, title: title, days: d, date: on };
    }
    P.fmt = { e1: function (x) { return fmtE1(x); }, out: function (days) { return fmtOut(days); } };
    function bwOutOf(l) {
      var g = dat(P.lifters.get(l.id)) || {}, b = g.bw || {}, ser = bwSeriesOf(l), last = ser.length ? ser[ser.length - 1] : null, ik = l.intake;
      var kg = isNum(b.now) ? b.now : null, from = kg != null ? 'weigh-in' : null, on = last ? last.d : null, cls = isNum(b.cls) ? b.cls : null;
      if (kg == null && ik && isNum(ik.bodyweightKg)) { kg = ik.bodyweightKg; from = 'intake'; on = day10(ik.at) || null; if (cls == null && ik.weightClass != null && isNum(parseFloat(ik.weightClass))) cls = parseFloat(ik.weightClass); }
      if (kg == null) return { kg: null, on: null, from: null, cls: cls, over: null, text: '' };
      var over = cls != null ? r1(kg - cls) : null;
      var text = n(kg) + ' kg' + (from === 'intake' ? ' ' + srcOf(l).from : '') + (cls != null ? ', ' + (over > 0 ? n(over) + ' kg over the ' + n(cls) + ' kg class' : over < 0 ? n(-over) + ' kg under the ' + n(cls) + ' kg class' : 'on weight for the ' + n(cls) + ' kg class') : '');   /* polish-d2: plain words for a new coach, never "the 63s" */
      return { kg: kg, on: on, from: from, cls: cls, over: over, text: text };
    }
    function numbersOf(l) {
      var g = dat(P.lifters.get(l.id)) || {}, Bk = BLK(), est = startMaxes(l), lifts = {}, sum = 0, all = true, his = herOf(l);
      LIFTS.forEach(function (k) {
        var x = g.lifts ? g.lifts[k] : null, e1 = x && isNum(x.e1) ? x.e1 : null, ws = null, rated = [];
        if (Bk && Bk.math && typeof Bk.math.working === 'function' && typeof Bk.liftSets === 'function') { try { rated = Bk.liftSets(l, k); ws = Bk.math.working(rated, TODAY); } catch (e) { ws = null; } }
        var sets = ws && Array.isArray(ws.sessions) ? ws.sessions.slice().reverse().map(function (s) { var st = s.set || {}; return { on: s.on, w: st.w, r: st.r, rpe: st.felt, e1: r1(s.kg) }; }) : [];
        var setW = function (s) { return n(s.w) + ' × ' + s.r + (s.rpe != null ? ' @' + n(s.rpe) : '') + ' ' + dmyOf(s.on); };
        var ib = l.intake && l.intake.best && l.intake.best[k];
        var basis = e1 != null ? { kind: 'sessions', sets: sets, text: sets.length === 3 ? 'Middle of ' + his + ' last 3 top sets: ' + sets.map(setW).join(', ') : sets.length === 2 ? 'Lower of ' + his + ' last 2 top sets: ' + sets.map(setW).join(', ') : sets.length === 1 ? 'From ' + his + ' top set: ' + setW(sets[0]) : 'From ' + his + ' lifting' }
          : ib && ib.kg ? { kind: 'intake', sets: [], text: upper1(srcOf(l).from) + ': ' + n(ib.kg) + ' × ' + ib.reps + (ib.when ? ', ' + K.dm(day10(ib.when)) : '') } : { kind: 'none', sets: [], text: 'No ' + k + ' max yet' };
        var best = null, lim = K.add(TODAY, -21);
        rated.forEach(function (s) { if (!s.rated || !s.comp || s.skipped || !(s.w > 0) || !(s.r >= 1) || !s.on || s.on < lim || s.on > TODAY) return; var e = Bk.math.e1rm(s.w, s.r, s.felt); if (!best || e > best.e) best = { e: e, s: s }; });
        best = best ? { on: best.s.on, w: best.s.w, r: best.s.r, rpe: best.s.felt, pr: (l.logs || []).some(function (q) { return q.pr && q.lift === k && day10(q.d) === best.s.on && q.w === best.s.w; }) } : null;
        var pm = l.program && l.program.maxFrom ? l.program.maxFrom[k] : null, mkg = x && isNum(x.max) ? x.max : null, mf = mkg == null ? null : pm === 'intake' ? 'intake' : x.maxFrom === 'typed' ? 'typed' : 'e1rm';
        if (mkg == null && isNum(est[k]) && !l.program) { mkg = Math.round(est[k] / 2.5 + 1e-9) * 2.5; mf = 'intake'; }
        var max = { kg: mkg, from: mf, text: mkg == null ? '' : 'Training max ' + n(mkg) + ' (' + (mf === 'typed' || (mf === 'intake' && srcOf(l).by === 'coach') ? 'typed' : mf === 'intake' ? 'intake' : 'e1RM') + ')' };
        var shown = fmtE1(e1); if (shown == null) all = false; else sum += shown;
        lifts[k] = { e1: e1, shown: shown, basis: basis, best: best, max: max };
      });
      var mt = l.meet && l.meet.days >= 0 ? { id: meetId(l.meet), name: l.meet.name, date: day10(l.meet.date) || K.add(TODAY, l.meet.days), days: l.meet.days, out: fmtOut(l.meet.days).text, from: 'booked' } : null;
      if (!mt && l.intake && l.intake.meet && isIso(l.intake.meet.date) && l.intake.meet.date >= TODAY) { var dd = K.daysTo(l.intake.meet.date); mt = { id: slug(l.intake.meet.name), name: l.intake.meet.name, date: l.intake.meet.date, days: dd, out: fmtOut(dd).text, from: 'intake', fed: l.intake.meet.federation || null }; }
      return { lifts: lifts, total: { shown: all ? Math.round(sum * 2) / 2 : null }, bw: bwOutOf(l), meet: mt, source: srcOf(l) };
    }
    P.lifters.numbers = function (id) { var l = L(id); if (!l) return noLifter(id); return sel('numbers', id, function () { return { data: numbersOf(l) }; }); };

    /* ---------------- words on demand (FTC §8.1) ---------------- */
    function termOut(t) { return { key: t.key, label: t.label, also: (t.also || []).slice(), line: t.line, title: t.label + ': ' + t.line }; }
    P.terms = {
      list: function () { return sel('terms', undefined, function () { return { data: (D.terms || []).map(termOut) }; }); },
      get: function (key) { var t = (D.terms || []).filter(function (x) { return x.key === key; })[0]; if (!t) return fail('not_found', 'There is no word ' + (isStr(key) ? '“' + key + '”' : 'like that') + '.'); return sel('term', key, function () { return { data: termOut(t) }; }); },
      find: function (q) {
        var s = String(q == null ? '' : q).toLowerCase().replace(/[’']/g, '').replace(/[?.!]+$/, '').trim(), m = /^(what is|whats|what does|meaning of)\s+(?:an?\s+|the\s+)?(.+?)(?:\s+mean)?$/.exec(s), w = m ? m[2].trim() : s.split(/\s+/).length === 1 ? s : null;
        return sel('termFind', s, function () {
          if (!w || w.length < (m ? 1 : 3)) return { data: null };
          var hit = (D.terms || []).filter(function (t) { var names = [t.key, t.label].concat(t.also || []).map(function (x) { return String(x).toLowerCase().replace(/[’']/g, ''); }); return names.indexOf(w) >= 0 || (m && names.some(function (x) { return x.indexOf(w) === 0 && w.length >= 3; })); })[0];
          return { data: hit ? termOut(hit) : null };
        });
      }
    };

    /* ---------------- money: the first package in one write (FTC §10.2), 'once', a lifter's own price ---------------- */
    var CAD_WORDS = { week: 'weekly', weekly: 'weekly', '2 weeks': 'fortnightly', fortnight: 'fortnightly', fortnightly: 'fortnightly', '4 weeks': '4-weekly', '4-weekly': '4-weekly', month: 'monthly', monthly: 'monthly', quarter: 'quarterly', quarterly: 'quarterly', year: 'yearly', yearly: 'yearly', once: 'once' };
    function cadOf(c) { return c == null ? null : CAD_WORDS[String(c).toLowerCase().trim()] || null; }
    P.billing.charge = function (id, o) {
      var l = L(id); if (!l) return noLifter(id); o = argObj(o);
      var nm = words0(o.name), errs = [];
      if (!nm) errs.push({ field: 'name', message: 'Give the package a name.' });
      if (!(isNum(o.amount) && o.amount > 0 && o.amount <= 100000)) errs.push({ field: 'amount', message: 'A price is over 0. Free needs no price: close this.' });
      var cad = o.cadence == null ? 'monthly' : cadOf(o.cadence); if (!cad) errs.push({ field: 'cadence', message: 'Pick how often: week, 2 weeks, 4 weeks, month, quarter, year or once.' });
      var first = o.firstDue == null ? (firstSessionOf(l) && firstSessionOf(l) >= TODAY ? firstSessionOf(l) : nextMonday()) : o.firstDue; if (!isIso(first) || first < TODAY) errs.push({ field: 'firstDue', message: 'The first payment is today or a day to come.' });
      var tell = o.tell && typeof o.tell === 'object' && isStr(o.tell.text) && o.tell.text.trim() ? o.tell.text.trim() : '';
      if (o.tell && typeof o.tell === 'object' && !tell) errs.push({ field: 'tell', message: 'Write the words, or untick Tell ' + l.first + '.' });
      if (errs.length) return fail('invalid', errs[0].message, errs);
      var same = pkgList().filter(function (x) { return x.name.toLowerCase() === nm.toLowerCase(); })[0] || null, cur = isStr(o.currency) && CURRENCIES.indexOf(o.currency) >= 0 ? o.currency : same ? same.currency || 'USD' : 'USD';
      if (o.weeks != null && !(cad === 'once' && isNum(o.weeks) && o.weeks >= 1 && o.weeks <= 52 && o.weeks % 1 === 0)) return bad(cad === 'once' ? 'A once package runs 1 to 52 weeks.' : 'Only a once package has a length in weeks.', 'weeks');
      var save = !same || (same.amount !== o.amount && !o.custom && same.lifters === 0) ? { what: 'pkgSave', pid: same ? same.id : slug(nm), name: same ? same.name : nm, amount: o.amount, cadence: cad, link: same ? same.link || '' : '', currency: cur, weeks: o.weeks != null ? o.weeks : undefined, at: stamp() } : null;
      var set = { what: 'package', id: l.id, pkg: { name: same ? same.name : nm, cadence: cad, currency: cur }, amount: o.amount, firstDue: first, note: tell, custom: same && !save && same.amount !== o.amount ? true : undefined, at: stamp() };
      return commit('charge', { id: l.id, save: save || undefined, set: set, at: set.at });
    };
    var summary3 = P.billing.summary;
    P.billing.summary = function () {
      var r = summary3(); if (r.error) return r;
      return sel('bsum3', undefined, function () {
        var d = clone(r.data), o = money(), ym = TODAY.slice(0, 7), parts = [], cnt = {};
        /* P45's words beside the line: "Includes Tomas's late October $150 and two payments from Ines." */
        o.rows.late.forEach(function (x) { if (x.date.slice(0, 7) < ym) parts.push(K.L(x.id).first + '’s late ' + K.d(x.date).toLocaleString('en-US', { month: 'long' }) + ' ' + K.money(x.amount)); });
        o.rows.in.concat(o.rows.late.filter(function (x) { return x.date.slice(0, 7) === ym; })).concat(o.rows.come).forEach(function (x) { cnt[x.id] = (cnt[x.id] || 0) + 1; });
        Object.keys(cnt).forEach(function (id) { if (cnt[id] > 1) parts.push(numw(cnt[id]) + ' payments from ' + K.L(id).first); });
        if (d.month) d.month.words = parts.length ? 'Includes ' + K.list(parts, 3) + '.' : '';
        return { data: d };
      });
    };
    /* the Free plan's seat line words (FTC §10.3): "Free, 1 of 3 lifters" / "22 of 25 seats" */
    var counts3 = P.counts;
    P.counts = function () {
      var r = counts3(); if (r.error) return r;
      return sel('counts3', undefined, function () {
        var d = clone(r.data), su = setupOut(), tabs = (P.lifters.list().meta || {}).counts || {};
        /* every count a page shows from one call: the Everyone tabs too (lifters.list's meta.counts), never a second rule */
        Object.keys(tabs).forEach(function (k) { if (!has(d, k)) d[k] = tabs[k]; });
        d.invited = model().rows.filter(function (x) { return x.stage === 'invited'; }).length;
        d.setupLeft = su.show ? su.of - su.done : 0;
        return { data: d };
      });
    };

    /* ---------------- settings: the intake questions, a reminder before the due date (FTC §10.4, FP F8.4) ---------------- */
    var sget3 = P.settings.get, sset3 = P.settings.set;
    P.settings.get = function () {
      var r = sget3(); if (r.error) return r;
      return sel('settings3', undefined, function () {
        var d = clone(r.data), x = ST.settings || {}, used = money().used; d.intakeQs = Array.isArray(x.intakeQs) ? x.intakeQs.slice() : []; d.remindBefore = x.remindBefore ? clone(x.remindBefore) : { on: false, days: 2 };
        /* P48: a plan too small for this desk says so in one line */
        (d.plans || []).forEach(function (p) { p.small = p.max != null && p.max < used ? 'Too small: you have ' + used + ' lifters.' : null; });
        if (d.reminders && typeof d.reminders === 'object') { d.reminders.before = d.remindBefore.on ? d.remindBefore.days : null; d.reminders.beforeText = d.remindBefore.text || 'Hi {first}, a heads-up: {package} is due {day}.'; }
        return { data: d };
      });
    };
    P.settings.set = function (patch) {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return sset3(patch);
      var mine = {}, rest = {}; Object.keys(patch).forEach(function (k) { if (k === 'intakeQs' || k === 'remindBefore') mine[k] = patch[k]; else rest[k] = patch[k]; });
      if (!Object.keys(mine).length) return sset3(patch);
      if (mine.intakeQs != null && (!Array.isArray(mine.intakeQs) || mine.intakeQs.length > 20 || mine.intakeQs.some(function (q) { return !isStr(q) || !q.trim() || q.length > 200; }))) return bad('Keep to 20 questions of 200 characters at most.', 'intakeQs');
      if (mine.remindBefore != null && (typeof mine.remindBefore !== 'object' || (mine.remindBefore.days != null && !(isNum(mine.remindBefore.days) && mine.remindBefore.days >= 1 && mine.remindBefore.days <= 14 && mine.remindBefore.days % 1 === 0)))) return bad('A heads-up goes 1 to 14 days before the due date.', 'remindBefore');
      var cur = ST.settings || {}, next = {};
      if (mine.intakeQs != null) next.intakeQs = mine.intakeQs.map(function (q) { return q.trim(); });
      if (mine.remindBefore != null) next.remindBefore = { on: mine.remindBefore.on != null ? !!mine.remindBefore.on : !!(cur.remindBefore && cur.remindBefore.on), days: isNum(mine.remindBefore.days) ? mine.remindBefore.days : cur.remindBefore && isNum(cur.remindBefore.days) ? cur.remindBefore.days : 2, text: isStr(mine.remindBefore.text) ? mine.remindBefore.text : cur.remindBefore && cur.remindBefore.text || 'Hi {first}, a heads-up: {package} is due {day}.' };
      if (Object.keys(rest).length) { var r0 = sset3(rest); if (r0.error) return r0; }
      return commit('settingsC', { patch: next, at: stamp() });
    };

    /* ---------------- meets: the prep by phase (FP F7) ---------------- */
    var plan3 = P.meets.plan;
    function phaseOf(days) { return days == null ? null : days <= 0 ? 'day' : days <= 7 ? 'week' : days <= 21 ? 'peak' : days <= 112 ? 'build' : 'far'; }
    function ownJob(l, d) {
      var ph = phaseOf(l.meet.days), f = l.first, him = l.sex === 'M' ? 'his' : l.sex === 'F' ? 'her' : 'their', mid = meetId(l.meet);
      if (ph === 'day') return { label: 'Open meet day', go: { place: 'meets', hash: 'id=' + mid } };
      /* FIX-LOGIC s6 (the growing walk, Hannah booked into the Spring Novice Open): far out with a block in hand, the next job is
         her peak, never nothing (the prep's crimson fell back to today's Autumn Open): it opens Programs on her run-in */
      if (ph === 'far') return !l.program ? { label: 'Start ' + f + '’s first block', go: { place: 'programs', hash: 'id=' + l.id + '&start=first' } } : !nextDrafts[l.id] && !runWritten(l) ? peakJob(l) : null;
      if (ph === 'build') {
        var pl = planOut(l);
        if (!l.program) return { label: 'Start ' + f + '’s first block', go: { place: 'programs', hash: 'id=' + l.id + '&start=first' } };
        if (pl.gaps.length) return { label: 'Write the ' + (pl.gaps[0].weeks === 1 ? 'week' : pl.gaps[0].weeks + ' weeks') + ' between', go: { place: 'lifters', hash: 'id=' + l.id + '&tab=program' }, run: 'fillGap' };
        if (!nextDrafts[l.id] && !runWritten(l)) return { label: 'Plan ' + f + '’s run-in', go: { place: 'programs', hash: 'id=' + l.id + '&start=runin&runin=' + mid } };
        return null;
      }
      if (d && d.sent === 'no') return { label: 'Send ' + f + ' ' + him + ' attempts', go: { place: 'meets', hash: 'lifter=' + l.id }, run: 'attempts' };
      if (d && d.sent === 'stale') return { label: 'Send ' + f + ' the new attempts', go: { place: 'meets', hash: 'lifter=' + l.id }, run: 'attempts' };
      if (ph === 'peak' && d && d.rehearsal && d.rehearsal.missing && d.rehearsal.missing.length) { var lf = d.rehearsal.missing[0]; return { label: 'Write the ' + (isStr(lf) ? lf : lf.lift || 'squat') + ' rehearsal', go: { place: 'programs', hash: 'id=' + l.id } }; }
      return null;
    }
    function peakJob(l) { return { label: 'Write ' + (l.sex === 'M' ? 'his' : l.sex === 'F' ? 'her' : 'their') + ' peak', go: { place: 'programs', hash: 'id=' + l.id + '&start=runin&runin=' + meetId(l.meet) } }; }
    function runWritten(l) { var p = l.program; if (!p || !l.meet) return false; var mt = day10(l.meet.date) || K.add(TODAY, l.meet.days), cd = curDates(l), last = cd.map(function (x) { return x.to; }).filter(Boolean).sort().pop(); return !!(last && K.daysTo(mt) - K.daysTo(last) <= 7); }
    function timelineOf(l, d) {
      var meet = day10(l.meet.date) || K.add(TODAY, l.meet.days), Bk = BLK(), TP = (Bk && Bk.TAPER) || { squat: { lo: 8, hi: 12, at: 8 }, bench: { lo: 6, hi: 10, at: 6 }, deadlift: { lo: 10, hi: 14, at: 10 }, rehearsal: { lo: 4, hi: 10, at: 5 }, last: { lo: 3, hi: 4, at: 3 } };
      var lines = datedLines(l), inWin = function (a, b, f) { return lines.some(function (x) { return x.date && x.date >= a && x.date <= b && f(x); }); };
      var peak = K.add(K.monday(meet), -14), wi = l.meet.weighIn === '24h' ? K.add(meet, -1) : meet, fed = l.meet.fed || (l.intake && l.intake.meet && l.intake.meet.federation) || null;
      var heavy = {}; LIFTS.forEach(function (k) { var hit = lines.filter(function (x) { return x.lift === k && x.date && x.r <= 3 && x.date >= K.add(meet, -TP[k].hi) && x.date <= K.add(meet, -TP[k].lo); }).map(function (x) { return x.date; }).sort().pop(); heavy[k] = hit || K.add(meet, -TP[k].at); });
      var reh = lines.filter(function (x) { return x.date && /opener practice/i.test(String(x.note || '') + ' ' + String(x.title || '')); }).map(function (x) { return x.date; }).sort();
      var last = lines.filter(function (x) { return x.date && /last session/i.test(String(x.day || '') + ' ' + String(x.note || '')); }).map(function (x) { return x.date; }).sort().pop();
      return [
        { id: 'peak', label: 'Peak starts', from: peak, to: peak, written: inWin(peak, K.add(meet, -1), function () { return true; }), term: 'peak' },
        { id: 'heavy', label: 'Last heavy singles', from: K.add(meet, -TP.deadlift.hi), to: K.add(meet, -TP.bench.lo), written: LIFTS.every(function (k) { return inWin(K.add(meet, -TP[k].hi), K.add(meet, -TP[k].lo), function (x) { return x.lift === k && x.r <= 3; }); }), term: 'lastheavy', lifts: heavy, text: 'deadlift ' + dmyOf(heavy.deadlift) + ', squat ' + dmyOf(heavy.squat) + ', bench ' + dmyOf(heavy.bench) },
        { id: 'rehearsal', label: 'Opener practice', from: reh[0] || K.add(meet, -((TP.rehearsal.place && TP.rehearsal.place[1]) || TP.rehearsal.hi)), to: reh[reh.length - 1] || K.add(meet, -((TP.rehearsal.place && TP.rehearsal.place[0]) || TP.rehearsal.lo)), written: reh.length > 0 || inWin(K.add(meet, -TP.rehearsal.hi), K.add(meet, -TP.rehearsal.lo), function (x) { return MAIN[x.lift] && x.r === 1; }), term: 'openerpractice' },
        { id: 'last', label: 'Last session', from: last || K.add(meet, -TP.last.hi), to: last || K.add(meet, -TP.last.hi), written: !!last, term: null, text: 'light' },
        { id: 'weigh', label: 'Weigh-in', from: wi, to: meet, written: true, term: 'weighin', text: (l.meet.weighIn === '24h' ? 'The day before the meet' : '2 hours before ' + (l.sex === 'M' ? 'his' : l.sex === 'F' ? 'her' : 'their') + ' session') + (fed ? ' (' + fed + ')' : '') },
        { id: 'meet', label: 'Meet', from: meet, to: meet, written: true, term: null }
      ];
    }
    P.meets.plan = function (lifterId) {
      var r = plan3(lifterId); if (r.error) return r; var l = L(lifterId);
      return sel('plan3', lifterId, function () {
        var d = clone(r.data), est = startMaxes(l), guess = false;
        d.phase = phaseOf(l.meet.days); d.out = fmtOut(l.meet.days);
        d.basis = {}; LIFTS.forEach(function (k) { var e = d.lifts && d.lifts[k] ? d.lifts[k].e1 : null; if (isNum(e)) d.basis[k] = { kind: 'e1rm', kg: fmtE1(e), text: 'e1RM ' + n(fmtE1(e)) }; else if (isNum(est[k])) { guess = true; d.basis[k] = { kind: 'intake', kg: est[k], text: upper1(srcOf(l).from) }; } else d.basis[k] = { kind: 'none', kg: null, text: 'No ' + k + ' max yet' }; });
        d.guess = guess; if (guess) d.guessText = upper1(srcOf(l).from) + '. Check them after ' + herOf(l) + ' peak.';
        d.timeline = timelineOf(l, d);
        /* FIX-LOGIC s6: a peak not written yet says how to write it on its own row of When (the run-in in Programs, which plans
           the heavy singles, the opener practice and the last session with it); from 22 days out, where a run-in is planned */
        if (l.program && l.meet.days > 21) d.timeline.forEach(function (t) { if (t.id === 'peak' && !t.written && !nextDrafts[l.id]) { var pj = peakJob(l); t.act = { label: pj.label, go: pj.go }; } });
        var own = ownJob(l, d), job = own;
        if (!job && d.phase !== 'day') {
          var others = D.lifters.filter(function (x) { return x !== l && x.meet && x.meet.days >= 1; }).sort(function (a, b) { return a.meet.days - b.meet.days; });
          for (var i = 0; i < others.length && !job; i++) { var pj = null; try { pj = ownJob(others[i], dat(plan3(others[i].id))); } catch (e) { pj = null; } if (pj) job = { label: 'Next: ' + others[i].first + '’s ' + (/attempts/.test(pj.label) ? 'attempts' : /run-in/.test(pj.label) ? 'run-in' : /peak$/.test(pj.label) ? 'peak' : /first block/.test(pj.label) ? 'first block' : 'plan'), go: { place: 'meets', hash: 'lifter=' + others[i].id }, next: others[i].id }; }
        }
        d.job = job || null;
        return { data: d };
      });
    };

    /* ---------------- teams: a quiet lifter is held (FP F5, FD8) ---------------- */
    var tget3 = P.teams.get, tsend3 = P.teams.sendWeek;
    P.teams.get = function (id) {
      var r = tget3(id); if (r.error) return r;
      return sel('team3', id, function () {
        var d = clone(r.data), meta = clone(r.meta || {}); delete meta.v; (d.members || []).forEach(function (m) { var l = K.L(m.id || m.lifterId); m.quiet = l && l.program && isNum(l.ago) && l.ago >= 7 ? { days: l.ago, text: quietWords(l) } : null; });
        return { data: d, meta: meta };
      });
    };
    P.teams.sendWeek = function (id, wn, o) {
      o = argObj(o); if (o.hold == null) return tsend3(id, wn, o);
      var T = teamOf(id); if (!T) return fail('not_found', 'There is no team ' + (isStr(id) ? id : '') + '.');
      if (!Array.isArray(o.hold) || o.hold.some(function (x) { return !K.L(x) || !T.members.some(function (m) { return m.id === x; }); })) return bad('Hold lifters on the ' + T.name + '.', 'hold');
      if (!isNum(wn) || wn % 1 || wn < 1 || wn > T.weeks.length) return bad('Send a week from 1 to ' + T.weeks.length + '.', 'n');
      var ids = Array.isArray(o.ids) ? o.ids.filter(function (x) { return o.hold.indexOf(x) < 0; }) : T.members.map(function (m) { return m.id; }).filter(function (x) { return o.hold.indexOf(x) < 0; });
      if (!ids.length) return bad('Tick at least one lifter to send to.', 'ids');
      if (ids.some(function (x) { return !T.members.some(function (m) { return m.id === x; }); })) return bad('Send to lifters on the ' + T.name + '.', 'ids');
      return commit('teamSend', { id: id, n: wn, ids: ids, hold: o.hold.slice(), at: stamp() });
    };

    /* ---------------- items: the row menu's "Do it Saturday" is a reminder (FP F4.4); P10's labels ---------------- */
    var irun3 = P.items.run, iget3 = P.items.get;
    P.items.run = function (itemId, actId, o) {
      var it = isStr(itemId) ? C.get(itemId) : null, a = it ? (it.menu || []).filter(function (x) { return x.id === actId; })[0] : null;
      /* FIX-LOGIC s6: a move that hands over a link (offapp-<id>'s Copy Maya's link) puts it on the clipboard as it runs, on
         the coach's own click; the toast shows the link too, so a browser that refuses the clipboard still gives it */
      var cp = it && !a ? (it.acts || []).filter(function (x) { return x.id === actId && isStr(x.copy); })[0] : null;
      if (cp) { var rc = irun3(itemId, actId, o); if (rc && !rc.error) { try { var nav = W.navigator; if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') { var pr = nav.clipboard.writeText(cp.copy); if (pr && typeof pr.catch === 'function') pr.catch(function () {}); } } catch (e) { /* refused: the toast has the link */ } } return rc; }
      if (!a || !a.remind) return irun3(itemId, actId, o);
      var l = K.L(it.ids[0]); if (!l) return fail('not_found', 'That item has no lifter.');
      if (firstSnooze(l.id)) return fail('conflict', 'Set for later already: ' + lower1(snoozeWords(firstSnooze(l.id))) + '.');
      return P.reminders.add(l.id, { on: a.remind.on, kind: a.remind.kind || 'first-block', text: a.remind.text, itemId: it.id });
    };
    P.items.get = function (id) {
      var r = iget3(id); if (r.error) return r; var it = C.get(id), l = it && it.ids.length === 1 ? K.L(it.ids[0]) : null;
      return sel('item3', id, function () {
        var d = clone(r.data);
        /* P10: the label a lifter page shows under Needs you ("Meet: Autumn Open, today.", "Block: Peak ends with this meet.") */
        if (l && /^meet-today-/.test(it.id) && l.meet) d.label = 'Meet: ' + l.meet.name + ', today.';
        if (l && /^blockend-/.test(it.id) && l.program) d.label = 'Block: ' + l.program.name + (l.meet && l.meet.days === 0 ? ' ends with this meet.' : ' ends this week.');
        /* P36: a meet-day row with nothing to do says so in words, never as a button */
        if (l && /^meet-today-/.test(it.id) && !doneOf(it.id) && !(l.pain || []).some(function (p) { return !p.resolved && p.day === TODAY; }) && !(l.bw && l.bw.over > 0)) d.nothing = 'On weight, nothing to do.';
        /* "Do it Saturday" set: when it comes back (later stays the item's own flag: a Keep-an-eye-on item) */
        var zz = l ? firstSnooze(l.id) : null; d.snooze = zz && zz.itemId === it.id ? { on: zz.on, text: snoozeWords(zz), reminderId: zz.id } : null;
        return { data: d };
      });
    };
    /* P42: the Messages group of lifters to write to first */
    var tlist3 = P.threads.list;
    P.threads.list = function (o) {
      var r = tlist3(o); if (r.error) return r;
      return sel('threads3', stableKey(o || {}), function () { var meta = clone(r.meta); delete meta.v; meta.heads = { waiting: 'Waiting for a reply', first: 'Quiet: write to them.', answered: 'Answered' }; return { data: r.data, meta: meta }; });
    };
  })(PL);

  /* ================= PROGRAMS LIBRARY (23 Nov, programs-library worker; additions only) =================
     The owner: "what if coach just wants to make a new program and not assign it to a lifter yet". A program that belongs
     to nobody yet is what the desk kept as a template (ST.tpls, its edits in ST.tplEdits): the same records, the same
     persisted and replayed ops (tplSave, tplUpdate, tplRename, tplRemove), so every write here is one step with one Undo
     (PL.undo(meta.undo)) and survives a reload like every other coach edit.
       PL.templates.create({ name, weeks, days, from })  a new program with no lifter. from: null (blank: `days` days a week,
                        `weeks` empty weeks) | { template: id } | { starter: id } | { lifter: id } (a copy of their block:
                        its lines and rules, not their loads: BLOCK.asTemplate) | { json }. The name is made unique
                        ("New program 2"). { data: { id, name }, meta: { undo } }
       PL.templates.write(id, json, { label })  the program's block as the editor holds it. Unlike update() it keeps what
                        the coach typed (kilos included: a program of your own may carry them); weeks stay unsent and
                        undated. One step, one Undo. Only the last 40 writes of one program are kept in the log (older
                        ones fold into the next: the program is the same, its undo reaches 40 steps back)
       PL.templates.edited(id)          { data: iso | null } the time of the program's last write
       PL.templates.uniqueName(name)    { data: name } the name, or "<name> 2", "<name> 3" when it is taken */
  (function (P) {
    var KEEP = 40;
    function byId(id) { return templates().filter(function (x) { return x.id === id; })[0] || null; }
    function uniqueName(nm) {
      nm = words0(nm) || 'New program'; var taken = function (s) { return templates().some(function (t) { return t.name.toLowerCase() === s.toLowerCase() || t.id === 'tpl-' + slug(s); }); };
      if (!taken(nm)) return nm; var base = nm.replace(/ \d+$/, ''), k = 2; while (taken(base + ' ' + k)) k++; return base + ' ' + k;
    }
    /* a program of nobody's: no lifter, no maxes, no dates; every week still to send */
    function norm(j, name) {
      j = clone(j); j.id = null; if (name) j.name = name; j.blockKind = 'template'; j.start = null; j.meet = null;
      j.maxes = { squat: null, bench: null, deadlift: null }; j.maxFrom = {}; j.today = {};
      (j.weeks || []).forEach(function (w, i) { w.state = 'next'; w.sent = false; w.sentAt = null; w.started = {}; w.was = null; w.taken = false; w.dates = {}; w.off = w.off || {}; w.n = i + 1; });
      (j.rows || []).forEach(function (row) { ['nod', 'bad', 'badf', 'mx', 'max', 'maxFrom', 'last', 'swapFor', 'only'].forEach(function (k) { delete row[k]; }); Object.keys(row.cells || {}).forEach(function (u) { var x = row.cells[u]; if (x && x.lifted) delete x.lifted; }); });
      if (Array.isArray(j.days)) j.perWeek = j.days.length;
      return j;
    }
    function trim(id) {
      var key = 'tpl:' + id, ups = []; LOG.forEach(function (r, i) { if (r.op === 'tplUpdate' && r.a && r.a.id === id && r.persist) ups.push(i); });
      if (ups.length <= KEEP) return;
      for (var k = ups.length - KEEP - 1; k >= 0; k--) LOG.splice(ups[k], 1);
      persistEdits(); void key;
    }
    P.templates.uniqueName = function (name) { return ok(uniqueName(name)); };
    P.templates.edited = function (id) {
      var t = byId(id); if (!t) return fail('not_found', 'There is no program ' + (isStr(id) ? id : '') + '.');
      for (var i = LOG.length - 1; i >= 0; i--) if ((LOG[i].keys || []).indexOf('tpl:' + id) >= 0) return ok(LOG[i].at || (LOG[i].a && LOG[i].a.at) || null);
      return ok(null);
    };
    P.templates.create = function (o) {
      o = argObj(o); var Bk = BLK(); if (!Bk) return fail('invalid', 'A new program needs block.js on the page.');
      var from = o.from || null, json = null, src = '';
      if (from && from.template) { var t = byId(from.template) || templates().filter(function (x) { return x.name === from.template; })[0]; if (!t) return fail('not_found', 'There is no program ' + from.template + '.'); json = clone(tplBlock(t)); src = t.name; }
      else if (from && from.starter) { var s = (D.starters || []).filter(function (x) { return x.id === from.starter; })[0], g = s && P.starters && P.starters.get ? P.starters.get(s.id) : null; if (!g || !g.data) return fail('not_found', 'There is no starter program ' + from.starter + '.'); json = clone(g.data); src = s.name; }
      else if (from && from.lifter) { var l = L(from.lifter); if (!l) return noLifter(from.lifter); if (!l.program) return bad(l.first + ' has no block to copy.', 'from'); var g2 = P.programs.get(l.id); var b0 = g2 && g2.data ? Bk.from(g2.data) : null; if (!b0) return fail('invalid', 'That block cannot be read.'); json = Bk.asTemplate(b0, {}); src = l.first + '’s ' + (l.program.name || 'block'); }
      else if (from && from.json) { if (!Array.isArray(from.json.weeks)) return bad('Give a block (block.toJSON()).', 'json'); json = clone(from.json); }
      else {
        var nd = Math.max(1, Math.min(7, Math.round(Number(o.days) || 3))), nw = Math.max(1, Math.min(16, Math.round(Number(o.weeks) || 4)));
        var b = Bk.blank(null, { days: nd, name: 'x' }); for (var k = 1; k < nw; k++) b.addWeek();
        json = b.toJSON();
      }
      if (!json || !Array.isArray(json.weeks) || !json.weeks.length) return fail('invalid', 'That program has no weeks.');
      var name = uniqueName(o.name || (src ? src + ' copy' : 'New program'));
      if (name.length > 60) return bad('A program’s name is 60 characters at most.', 'name');
      json = norm(json, name);
      return commit('tplSave', { id: 'tpl-' + slug(name), name: name, json: json, at: stamp(), label: (src ? 'A copy of ' + src + ': ' : '') + name + ' is one of your programs, not assigned yet.' });
    };
    P.templates.write = function (id, json, o) {
      o = argObj(o); var t = byId(id); if (!t) return fail('not_found', 'There is no program ' + (isStr(id) ? id : '') + '.');
      if (!json || !Array.isArray(json.weeks) || !json.weeks.length) return bad('A program keeps at least one week.', 'json');
      var j = norm(json, t.name), was = tplBlock(t);
      if (was && JSON.stringify(norm(was, t.name)) === JSON.stringify(j)) return ok({ id: id, name: t.name, weeks: j.weeks.length }, { undo: null, label: '' });
      var r = commit('tplUpdate', { id: id, json: j, at: stamp() });
      if (r && !r.error) trim(id);
      if (r && r.meta && o.label) r.meta.label = o.label;
      return r;
    };
  })(PL);
  /* ================= end PROGRAMS LIBRARY ================= */

  /* ================= CONTACTS (23 Nov, contacts-clients worker; additions only) =================
     The owner: "what if coach wants to contact them on some other platform etc, for each athlete they should be able to
     add- their mail, insta, imessage, whatsapp, they can add either any or none of em". Each lifter may have any or none
     of four ways: email, instagram (a handle), imessage (a phone number or an Apple ID email), whatsapp (a phone number in
     international form). POWALIFTA keeps the details only; the links open the other app, and nothing sent there comes
     back into a thread.
       PL.contacts.get(id)        { data: { email, instagram, imessage, whatsapp } }  (a missing way is absent)
       PL.contacts.set(id, o)     validates every field, normalises (trims; a pasted instagram.com link or a leading @
                                  becomes the handle; a phone keeps its digits and a leading +, 00 becomes +); an empty
                                  field removes that way. A refusal is { error: { code: 'invalid', message, details:
                                  [{ field, message }] } } and changes nothing. One write, one Undo; 'contact:changed'
                                  then 'change' fire like every other write.
       PL.contacts.check(field, value)  { data: normalised } or { error } for one field (the editor's inline check)
       PL.contacts.list()         { data: { <id>: { … } } } every lifter with at least one way
     Kept in sessionStorage under <prefix>contacts (cleared by ?reset=1 with the rest of the desk), seeded from the demo
     roster below on purpose unevenly: some lifters have all four, some one or two, eight none. Every value is made up:
     +44 7700 900xxx is Ofcom's drama range, example.com is reserved, the handles end in .demo. */
  (function (P) {
    var KEY = PFX + 'contacts', FIELDS = ['email', 'instagram', 'imessage', 'whatsapp'];
    var SEED = D.fresh ? {} : {
      'demo-d2': { email: 'priya.shah@example.com', instagram: 'priya.lifts.demo', imessage: '+447700900101', whatsapp: '+447700900101' },
      'demo-a2': { email: 'sarah.kim@example.com', instagram: 'sarahkim.pulls.demo', imessage: 'sarah.kim@example.com', whatsapp: '+447700900102' },
      'demo-d12': { email: 'sofia.alvarez@example.com', instagram: 'sofia.squats.demo', imessage: '+447700900112', whatsapp: '+447700900112' },
      'demo-d15': { whatsapp: '+447700900115' },
      'demo-a3': { email: 'tom.boyle@example.com', whatsapp: '+447700900103' },
      'demo-d13': { email: 'ryan.oneill@example.com' },
      'demo-d5': { instagram: 'jonah.reed.demo', imessage: '+447700900105' },
      'demo-a1': { email: 'arjun.mehta@example.com', instagram: 'arjun.benches.demo' },
      'demo-d4': { email: 'elena.rossi@example.com', whatsapp: '+447700900104' },
      'demo-d1': { imessage: '+447700900111' },
      'demo-d8': { instagram: 'ines.duarte.demo', whatsapp: '+447700900108' },
      'demo-d9': { email: 'kofi.mensah@example.com' }
    };
    var MINE = {};   /* the coach's edits: { <id>: { …the whole record… } }, an emptied record kept as {} */
    function load() { var o = parseJSON(sGet(KEY)); MINE = o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
    function save() { if (Object.keys(MINE).length) sSet(KEY, JSON.stringify(MINE)); else sDel(KEY); }
    load();
    function recOf(id) { var r = has(MINE, id) ? MINE[id] : SEED[id]; var out = {}; if (r) FIELDS.forEach(function (f) { if (isStr(r[f]) && r[f]) out[f] = r[f]; }); return out; }
    function phone(raw, field, needPlus) {
      var s = String(raw).replace(/[\s().\- ]/g, '');
      if (/^00\d/.test(s)) s = '+' + s.slice(2);
      if (!/^\+?\d+$/.test(s)) return { error: field === 'whatsapp' ? 'Write a phone number: digits, with a + and the country code first.' : 'Write a phone number (digits, a + first), or an Apple ID email.' };
      var digits = s.replace(/\D/g, '');
      if (needPlus && s.charAt(0) !== '+') return { error: 'Start with + and the country code, like +44 7700 900123: WhatsApp needs the whole number.' };
      if (digits.length < 7 || digits.length > 15) return { error: 'That number has ' + digits.length + ' digits; a phone number has 7 to 15.' };
      return { v: s };
    }
    function email(raw) {
      var s = String(raw).trim().replace(/^mailto:/i, '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(s)) return { error: 'An email needs a name, an @ and a domain, like name@example.com.' };
      return { v: s };
    }
    function check(field, raw) {
      if (FIELDS.indexOf(field) < 0) return { error: 'There is no contact field “' + field + '”.' };
      var s = raw == null ? '' : String(raw).trim();
      if (!s) return { v: '' };
      if (s.length > 200) return { error: 'That is too long for a contact detail (200 characters at most).' };
      if (field === 'email') return email(s);
      if (field === 'instagram') {
        var h = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?(instagram\.com|instagr\.am|ig\.me\/m)\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^@/, '').toLowerCase();
        if (/\//.test(h)) return { error: 'Paste their profile link or their name, like priya.lifts.' };
        if (!/^[a-z0-9._]{1,30}$/.test(h)) return { error: 'Instagram names use letters, numbers, dots and underscores, 30 at most.' };
        if (/^\.|\.$|\.\./.test(h)) return { error: 'An Instagram name cannot start or end with a dot, or have two in a row.' };
        return { v: h };
      }
      if (field === 'imessage') return /@/.test(s) ? email(s) : phone(s, field, false);
      return phone(s, field, true);
    }
    OPS.contact = function (a) {
      var id = a.id, had = has(MINE, id), prev = had ? clone(MINE[id]) : null, l = K.L(id);
      MINE[id] = clone(a.rec); save();
      var n0 = Object.keys(a.rec).length;
      return { changed: true, kind: 'contact', persist: false, data: { id: id, contact: clone(a.rec) }, keys: ['contact:' + id], ids: [id], events: [['contact:changed', { id: id }]],
        undo: function () { if (had) MINE[id] = prev; else delete MINE[id]; save(); },
        label: n0 ? l.first + '’s contact details are saved.' : l.first + ' has no contact details now.', undoLabel: l.first + '’s contact details are back as they were.' };
    };
    P.contacts = {
      get: function (id) {
        if (!L(id)) return noLifter(id);
        return sel('contact', id, function () { return { data: recOf(id) }; });
      },
      list: function () {
        return sel('contacts', undefined, function () {
          var out = {}; (D.lifters || []).forEach(function (l) { var r = recOf(l.id); if (Object.keys(r).length) out[l.id] = r; });
          return { data: out };
        });
      },
      check: function (field, value) { var r = check(field, value); return r.error ? bad(r.error, field) : ok(r.v); },
      set: function (id, o) {
        var l = L(id); if (!l) return noLifter(id);
        if (!o || typeof o !== 'object') return bad('Give the contact details as { email, instagram, imessage, whatsapp }.');
        var errs = [], rec = {}, cur = recOf(id);
        FIELDS.forEach(function (f) {
          var raw = has(o, f) ? o[f] : cur[f];   /* a field left out keeps what it was; '' or null removes it */
          var r = check(f, raw);
          if (r.error) errs.push({ field: f, message: r.error }); else if (r.v) rec[f] = r.v;
        });
        if (errs.length) return fail('invalid', errs.length === 1 ? errs[0].message : 'Check the ' + errs.length + ' fields marked.', errs);
        if (stableKey(rec) === stableKey(cur)) return ok(recOf(id), { undo: null, label: 'Nothing changed.' });
        return commit('contact', { id: id, rec: rec, at: stamp() });
      }
    };
    /* another tab saved contact details: read them again, then tell the page (the store's own handler has fired already) */
    W.addEventListener('storage', function (e) { if (!e || e.key !== KEY && e.key !== null) return; load(); bump(); emit('change', { type: 'storage', ids: [], v: v, key: KEY }); });
  })(PL);
  /* ================= end CONTACTS ================= */

  W.PL = PL;
})();
