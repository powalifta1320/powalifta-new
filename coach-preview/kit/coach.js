/* The coach's desk, thought through once for every demo (10 Nov 2026; the act table of spec B, 13 Nov).
   A coach does not open the desk to read numbers. He opens it to coach: see what was lifted against what he wrote,
   decide, answer, and write next week. So everything here is an ITEM:
     title (what happened) · meaning (the evidence in one line) · rec (what to do) · reason and context (the row's two
     short facts) · ev (the evidence, drawn) · acts (the moves, in one order on every screen).
   The items come from the demo data (window.DEMO) and keep its triage order (D.order: tier 0, then tier 1, then the rest).

   THE ACT TABLE (r6/spec-b/shared.md §5). This file is the only source of a move's words, and every page and test reads
   them from here. Each act carries:
     id, label (5 words at most, a verb first; 7 when it names a person or a count), short (the row button, 28
     characters at most), button / silent (the fix sheet's main button with the words ticked / unticked), done (past
     tense, the done row), says (the toast's change half: never sent to anyone, never a claim the lifter saw it), reply
     (the draft, second person; the store re-drafts its numbers from the preview, shared.md §6.1), tell (what the words
     are: 'tell' | 'ask' | 'reply' | 'words'), kind 'primary' (the item's main move), keep + go { place, hash } (a move
     that only opens another place), ops (the change in programs.md §11.2's op form), remind (a follow-up offered as an
     unticked line), ride (the line a message shows when this move rides on it).
   Numbers the engine gives (Safe openers, a lighter load, a cap) are the at-rest values of shared.md §3 (REST below);
   the store's preview replaces them when anything moves.

   An item may also carry menu: the row's ⋯ menu moves, in the act shape (first-<id>'s "Do it Saturday"); they are
   never row buttons. COACH.act(itemId, actId) finds an act in either list.

   COACH.items · COACH.open() · COACH.groups() · COACH.forLifter(id) · COACH.get(id) · COACH.needIds()
   COACH.run(item, actId, { sent, text }) · COACH.undo(id) · COACH.on(fn) · COACH.evHtml(item) · COACH.actsHtml(item)
   COACH.first(lifter, o) · COACH.join(lifter, o) · COACH.add(item) · COACH.remove(id)   (spec C, 13 Nov)
   COACH.offapp(lifter, o): offapp-<id>, a lifter added by hand and sent a block, not on the app yet (FIX-LOGIC s6)   */
(function () {
  'use strict';
  var K = window.K, D = K.D, esc = K.esc, n = K.n;
  var bwNow = function (l) { var s = l.bwSeries && l.bwSeries.length ? l.bwSeries[l.bwSeries.length - 1].kg : null; if (l.bw && l.bw.kg != null) return l.bw.kg; if (l.bw && l.bw.cls && l.bw.over != null) return Math.round((parseFloat(l.bw.cls) + l.bw.over) * 10) / 10; return s; };
  var job = function (l, type) { return (l.jobs || []).filter(function (j) { return j.type === type && !j.done; })[0] || null; };
  var dayOf = function (l, name, off) { var w = K.week(l, off || 0); return w ? w.days.filter(function (d) { return d.name.indexOf(name) === 0; })[0] || null : null; };
  var lastDone = function (l) { var best = null; (l.program ? l.program.weeks : []).forEach(function (w) { w.days.forEach(function (d) { if (d.done && d.date && (!best || String(d.date) > String(best.date))) best = d; }); }); return best; };
  var day10 = function (x) { return x ? String(x).slice(0, 10) : null; };
  var cap1 = function (s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  var low1 = function (s) { s = String(s || ''); return s.charAt(0).toLowerCase() + s.slice(1); };
  var her = function (l) { return l.sex === 'M' ? 'his' : 'her'; };
  /* a date in the desk's words (professional.md W16): "Sat 14 Nov", a near day by its name */
  var dmy = function (iso) { return K.wd3(iso) + ' ' + K.dm(iso); };
  var dayWord = function (iso) { var d = -K.daysTo(iso); return d === 0 ? 'today' : d === 1 ? 'yesterday' : d > 1 && d < 7 ? K.wd3(iso) : dmy(iso); };
  var feltAt = function (s) { var f = s.felt != null ? s.felt : s.rpe; return '@' + n(f) + (s.felt != null && s.rpe != null && s.felt !== s.rpe ? ', written @' + n(s.rpe) : ', as written'); };
  var prOf = function (l) { var from = K.add(K.today, -6); return (l.logs || []).filter(function (g) { return g.pr && g.d >= from; }).sort(function (a, b) { return b.d.localeCompare(a.d); })[0] || null; };
  /* the one countdown (FP F6.1 / FD3, PL.fmt.out's rule): days up to 20, whole weeks out from 21 ("53 days out" was a
     second way to say "7 weeks out") */
  var outWords = function (days) { return days === 0 ? 'meet today' : days === 1 ? 'meet tomorrow' : days <= 20 ? days + ' days out' : Math.floor(days / 7) + ' weeks out'; };
  /* the same countdown as PL.fmt.out says it after a name: "in 12 days" up to 20, "7 weeks out" from 21 (Arjun's weight item
     and Sarah's pain fact said "in 53 days" beside a "7 weeks out" header) */
  var inWords = function (days) { return days === 0 ? 'today' : days === 1 ? 'tomorrow' : days <= 20 ? 'in ' + days + ' days' : Math.floor(days / 7) + ' weeks out'; };
  /* a message's day in calendar words, the way the store's reasons say it ("2 days ago"), never K.ago's hours */
  var agoDays = function (at) { var d = -K.daysTo(String(at).slice(0, 10)); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
  var waitWords = function (iso) { var d = Math.max(0, -K.daysTo(day10(iso))); return d === 0 ? 'Today' : d === 1 ? '1 day' : d + ' days'; };
  var sentences = function (t) { return String(t || '').split(/(?<=[.?!])\s+/).map(function (s) { return s.replace(/[.?!]+$/, '').trim(); }).filter(Boolean); };
  /* the why beside an ask, in two words ("Double shifts", "Work trip"): the sentence that is not the ask */
  var whyOf = function (t, ask) { var s = sentences(t).filter(function (x) { return !ask.test(x); })[0]; return s ? s.split(/\s+/).slice(0, 2).join(' ') : ''; };
  /* a session note in a few of the coach's words: "Left knee felt tight on the last squat set." → "Left knee tight on squats" */
  var gist = function (t) { return cap1((sentences(t)[0] || '').replace(/\bfelt\s+/i, '').replace(/\bthe last\s+/i, '').replace(/\b(squat|deadlift)\s+sets?\b/i, '$1s').replace(/\bbench\s+sets?\b/i, 'bench')); };
  /* the bodyweight's pace, one rule with the store's (kit/r6/store.js bwPlan): the line through the first and last
     weigh-in, carried to the meet day; on pace when it lands at or under the class */
  var bwPace = function (l, cls) {
    var s = l.bwSeries || [], first = s[0], last = s[s.length - 1], now = last ? last.kg : bwNow(l), days = l.meet ? l.meet.days : null;
    if (now == null || days == null) return null;
    var span = first && last ? Math.max(1, K.daysTo(last.d) - K.daysTo(first.d)) : 0, slope = span ? (last.kg - first.kg) / span : 0;
    var pace = last ? Math.round((now + slope * (days - K.daysTo(last.d))) * 10) / 10 : now;
    return { pace: pace, on: pace <= cls };
  };
  /* the IPF classes, by category: the move up a class names the next one */
  var CLASSES = { F: [47, 52, 57, 63, 69, 76, 84], M: [59, 66, 74, 83, 93, 105, 120] };
  var classUp = function (l) { var c = parseFloat(l.bw && l.bw.cls), list = CLASSES[l.sex === 'M' ? 'M' : 'F'], i = list.indexOf(c); return i >= 0 && i < list.length - 1 ? list[i + 1] : null; };
  var slug = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  /* a line's key as kit/r6/block.js builds it: "<day>|<exercise>|<nth of that name>|<line>" (the ops below name rows so) */
  var rowKey = function (day, lift, line) {
    var seen = {}, key = null;
    (day && day.exercises || []).some(function (e) { seen[e.title] = (seen[e.title] || 0) + 1; if (e.lift === lift && (!e.variant || e.variant === 'Competition')) { key = day.name + '|' + e.title + '|' + seen[e.title] + '|' + (line || 0); return true; } return false; });
    return key;
  };
  var linesOf = function (e) { var k = [], last = null; (e.sets || []).forEach(function (s) { if (s.extra) return; var id = [s.w, s.r, s.rpe, s.pct].join('|'); if (id !== last) { k.push(s); last = id; } }); return k.length; };
  /* the engine's numbers at rest (shared.md §3, BLOCK and the Safe preset of §4.7); the store's preview re-drafts them */
  var REST = {
    'demo-d2': { safe: { squat: 120, bench: 72.5, deadlift: 155 } },
    'demo-a2': { blockPull: 140 },
    'demo-d6': { cap: 125, capOther: 127.5, capBackoffs: 110 },
    'demo-d15': { light: { deadlift: 205, bench: 117.5 } }
  };
  var orderOf = {}, tierOf = {};
  (D.order || []).forEach(function (o, i) { o.ids.forEach(function (id) { var k = o.type + '|' + id; if (orderOf[k] == null) { orderOf[k] = i; tierOf[k] = o.tier; } }); });
  var ord = function (type, l) { var v = orderOf[type + '|' + l.id]; return v == null ? 500 : v; };
  /* an item about one lifter waits under Keep an eye on (later) unless its reason is tier 0 or 1 in D.order */
  var later = function (type, l) { var t = tierOf[type + '|' + l.id]; return t == null || t > 1; };
  var items = [];
  var norm = function (it) {
    it.ids = it.ids || []; it.ev = (it.ev || []).filter(Boolean); it.acts = (it.acts || []).filter(Boolean); if (it.menu) it.menu = it.menu.filter(Boolean);
    it.acts.concat(it.menu || []).forEach(function (a) { if (!a.short) a.short = a.label; });
    return it;
  };
  /* every act gets its short label (the label unless it is over 28 characters) */
  var add = function (it) {
    norm(it); items.push(it); return it;
  };
  var go = function (place, hash) { return { place: place, hash: hash, href: place + '.html#' + hash }; };
  var GROUPS = [['hurt', 'Hurt', 't-pain'], ['meet', 'Meets', 't-meet'], ['train', 'Training', 't-warn'], ['words', 'Their words', 't-msg'], ['approve', 'To approve', 't-write'], ['write', 'To write', 't-write'], ['quiet', 'Gone quiet', 't-quiet'], ['money', 'Money', 't-quiet'], ['good', 'Going well', 't-ok']];

  /* ================= HURT ================= */
  D.lifters.forEach(function (l) {
    var open = l.pain.filter(function (p) { return !p.resolved; }).sort(function (a, b) { return b.day.localeCompare(a.day); });
    if (open.length && job(l, 'pain')) {
      /* pain reports on a lift (Sarah): the reports oldest first, each on its day; the lift's day still to come */
      var p = open[0], lift = String(p.lift || '').toLowerCase(), dl = dayOf(l, K.LIFT[lift] || 'Deadlift'), wN = l.program.weekIdx + 1;
      var inWeek = open.filter(function (q) { return q.day >= K.add(K.today, -6); }).length;
      var times = open.length > 1 ? (inWeek === open.length ? (open.length === 2 ? 'Twice' : open.length + ' times') + ' in 7 days' : open.length + ' times') : K.When(p.day);
      var dlDate = dl && dl.date && !(dl.done > 0) ? day10(dl.date) : null, dlWhen = dlDate ? dmy(dlDate) : 'this week';
      var bp = (REST[l.id] || {}).blockPull, bpText = bp ? ', ' + n(bp) : '', bpAt = bp ? ' at ' + n(bp) : '';
      var ask = 'How’s the back sitting and walking?'.replace('the back', 'the ' + p.part.toLowerCase().replace(/^low /, ''));
      var lifts = lift + 's', dlRows = dl ? (dl.exercises || []).map(function (e, i) { return e.lift === lift ? rowKey({ name: dl.name, exercises: [e] }, lift) : null; }).filter(Boolean) : [];
      add({ id: 'pain-' + l.id, ids: [l.id], group: 'hurt', tone: 't-pain', kicker: 'Pain', at: ord('pain', l), later: later('pain', l),
        reason: p.part + ' ' + n(p.sev) + '/10 on ' + lift, context: times,
        title: p.part + ' on ' + lifts + (open.length > 1 ? ', ' + low1(times) : ''),
        meaning: cap1(open.slice().reverse().map(function (q) { var w = dayWord(q.day); return n(q.sev) + '/10 ' + (/^(today|yesterday)$/.test(w) ? w : 'on ' + w); }).join(', then ')) + '.' + (dl && dlDate ? ' ' + dl.name + ' is ' + dmy(dlDate) + '.' : ''),
        rec: 'Block pulls 3 × 5 @6 this week, and ask how it feels.',
        ev: [{ t: 'pain', reports: open }, dl ? { t: 'sets', l: l, day: dl, title: 'What you wrote for ' + dl.name } : null, l.meet ? { t: 'fact', text: l.meet.name + ' ' + inWords(l.meet.days) } : null],
        acts: [
          { id: 'swap', kind: 'primary', label: 'Swap to block pulls @6', button: 'Swap and tell ' + l.first, silent: 'Swap to block pulls', done: 'Block pulls on ' + (dlDate ? K.wd(dlDate) : 'deadlift day') + ', told ' + l.first,
            says: l.first + ', ' + dlWhen + ': block pulls 3 × 5 @6' + bpText, tell: 'tell',
            reply: ask + ' ' + (dlDate ? K.wd(dlDate) : 'This week') + ' is block pulls now, 3 × 5 @6' + bpAt + '. Stop the set if it bites.',
            remind: dlDate ? { on: K.add(dlDate, 1), text: 'Remind me ' + K.wd3(K.add(dlDate, 1)) + ': ask how ' + K.wd(dlDate) + '’s pulls felt' } : null,
            ops: dl ? [{ op: 'swapWeek', week: wN, day: dl.name, row: rowKey(dl, lift), to: { name: 'Block pull', lift: lift, variant: 'Block pull' }, cell: '3x5 @6', scope: 'week' }] : [] },
          { id: 'skip', label: 'Skip ' + lifts + ' this week', button: 'Skip and tell ' + l.first, silent: 'Skip ' + lifts, done: 'No ' + lifts + ' this week, told ' + l.first,
            says: l.first + ': no ' + lifts + ' this week', tell: 'tell',
            reply: ask + ' No ' + lifts + ' this week. Tell me how it feels after ' + (dlDate ? K.wd(dlDate) : 'the weekend') + '.',
            /* a line taken out for one week: the line's text emptied in that week (programs.md §11.2 op 'set') */
            ops: dlRows.map(function (k) { return { op: 'set', week: wN, row: k, field: 'line', text: '' }; }) },
          { id: 'keep', label: 'Keep as written', done: 'Kept as written' }] });
    } else if (job(l, 'pain')) {
      /* pain ticked on the check-in, no place or score (Priya): on a meet day the decision comes first, the openers go
         Safe with the question riding along (kit/r6/store.js runs the Safe preset and the words, one Undo) */
      var sq = lastDone(l), top = sq ? K.topSet(sq) : null, onDay = !!(l.meet && l.meet.days === 0), safe = (REST[l.id] || {}).safe;
      var mid = l.meet ? slug(l.meet.name) : null;
      add({ id: 'pain-' + l.id, ids: [l.id], group: 'hurt', tone: 't-pain', kicker: 'Pain', at: ord('pain', l), later: later('pain', l),
        reason: 'Pain on today’s check-in', context: onDay ? l.meet.name + ' today' : 'No place yet',
        title: 'Pain on today’s check-in' + (onDay ? ', meet today' : ''),
        meaning: 'They haven\u2019t said where it hurts yet.' + (top ? ' ' + (/opener/i.test(sq.name) ? 'Openers' : sq.name) + ' on ' + K.wd(day10(sq.date)) + ': ' + n(top.set.w) + ' × ' + top.set.r + ' @' + n(top.set.felt != null ? top.set.felt : top.set.rpe) + '.' : ''),
        rec: onDay ? 'Safe openers until you know where it hurts.' : 'Ask where and how bad before the next session.',
        ev: [{ t: 'check', l: l }, top ? { t: 'sets', l: l, day: sq, title: sq.name + ', ' + K.when(sq.date, { bare: true }) } : null],
        acts: (onDay ? [{ id: 'safe', kind: 'primary', label: 'Use Safe openers, ask ' + l.first, button: 'Use these and ask ' + l.first, silent: 'Use these openers', done: 'Safe openers, asked ' + l.first,
          says: l.first + '’s openers: ' + (safe ? 'squat ' + n(safe.squat) + ', bench ' + n(safe.bench) + ', deadlift ' + n(safe.deadlift) : 'the Safe preset'), tell: 'ask',
          reply: 'Morning ' + l.first + '. Where is the pain, and how bad out of 10? Openers are Sunday’s: ' + (safe ? n(safe.squat) + ', ' + n(safe.bench) + ' and ' + n(safe.deadlift) : 'the Safe ones') + '.',
          ride: 'Also take the Safe openers', ops: [] }] : []).concat([
          { id: 'msg', kind: onDay ? null : 'primary', label: 'Ask ' + l.first + ' where it hurts', button: 'Send to ' + l.first, done: 'Asked ' + l.first + ' where it hurts', tell: 'words',
            reply: 'Morning ' + l.first + '. Where is the pain, and how bad out of 10? I’ll set your openers around it.' },
          onDay ? { id: 'board', label: 'Open meet day', keep: true, go: go('meets', 'id=' + mid + '&stage=weigh') } : null]) });
    }
  });

  /* ================= MEETS: one item per lifter at today's meet (meet-today-<id>) ================= */
  D.lifters.forEach(function (l) {
    if (!l.meet || l.meet.days !== 0) return;
    var m = l.meet, bw = bwNow(l), cls = l.bw ? l.bw.cls : String(m.cls).replace(/\s*kg$/, ''), over = l.bw && l.bw.over > 0 ? l.bw.over : 0;
    var last = (l.messages || []).filter(function (x) { return !x.me; }).slice(-1)[0], asks = !!(last && /\?/.test(last.body || '') && last.read === false);
    var board = { id: 'board', label: 'Open meet day', keep: true, go: go('meets', 'id=' + slug(m.name) + '&stage=weigh') };
    var seen = { id: 'seen', label: 'Nothing to change', done: 'Nothing to change' };
    var base = { id: 'meet-today-' + l.id, ids: [l.id], group: 'meet', tone: 't-meet', kicker: 'Meet today', at: ord('meetday', l), later: later('meetday', l), meet: slug(m.name) };
    /* LOGIC-FIX-4 (walk 2, Tom): pain on his check-ins in the last two weeks that no word of yours answered goes in the
       meet-day draft too: pain comes first, whatever else is going on */
    var painDays = (l.answers || []).filter(function (a) { return /^Any pain/.test(a.q) && a.num && a.day >= K.add(K.today, -14); }).map(function (a) { return a.day; }).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
    var painLast = painDays[painDays.length - 1], painSaid = painLast && (l.messages || []).some(function (x) { return x.me && String(x.at || '').slice(0, 10) >= painLast && /pain|hurt|sore|niggle|knee|back|hip|shoulder|elbow/i.test(x.body || ''); });
    var painAsk = painLast && !painSaid ? 'Your check-ins said pain ' + (painDays.length === 1 ? 'once' : painDays.length === 2 ? 'twice' : painDays.length + ' times') + ': where, and does it bite?' : '';
    if (over && asks) {
      add(Object.assign(base, {
        reason: n(over) + ' kg over, asks if OK', context: m.name + ' today',
        title: l.first + ' asks: is ' + n(bw) + ' OK?',
        meaning: n(bw) + ' kg this morning for ' + clsW(cls) + ', ' + n(over) + ' kg over.',
        rec: 'Answer before the scale: ' + n(over) + ' kg comes off without food or water.',
        ev: [{ t: 'people', rows: [{ l: l, text: n(bw) + ' kg for the ' + cls + ' class', end: n(over) + ' kg over', tone: 't-warn' }] }, { t: 'quote', l: l, text: last.body, when: agoDays(last.at), at: last.at }],
        answers: [last.at],
        acts: [{ id: 'msg', kind: 'primary', label: 'Reply to ' + l.first, button: 'Send to ' + l.first, done: 'Replied to ' + l.first, tell: 'words',
          reply: painAsk ? n(bw) + ' is fine: ' + n(over) + ' comes off by 09:30. Nothing to eat or drink till then. ' + painAsk : n(bw) + ' is fine: ' + n(over) + ' comes off by 09:30. Nothing to eat or drink until you weigh in. Still over? 15 minutes’ walk in a hoodie.' }, board] }));
    } else {
      add(Object.assign(base, {
        reason: m.name + ' today', context: over ? n(over) + ' kg over' : 'On weight',
        title: l.first + ' lifts at ' + m.name + ' today' + (job(l, 'pain') ? '' : over ? ', ' + n(over) + ' kg over' : ', on weight'),
        meaning: n(bw) + ' kg for ' + clsW(cls) + '.' + (m.attemptsSet ? ' Openers are set.' : ' Openers not set yet.'),
        rec: '',
        ev: [{ t: 'people', rows: [{ l: l, text: n(bw) + ' kg for the ' + cls + ' class', end: over ? n(over) + ' kg over' : 'On weight', tone: over ? 't-warn' : 't-ok' }] }],
        /* Priya's pain item carries her decision: her meet item has no main move of its own */
        acts: [job(l, 'pain') ? board : Object.assign({ kind: 'primary' }, board), seen] }));
    }
  });
  /* FINAL FIX-LOGIC (plain words for a new coach): a weight class reads "the 63 kg class" (a plus class "the 120+ kg class"),
     never "the 63s" */
  function clsW(c) { var s = String(c == null ? '' : c).trim().replace(/\s*kg$/i, ''); return 'the ' + s + ' kg class'; }
  D.lifters.forEach(function (l) {
    var j = job(l, 'weight'); if (!j || !l.meet || !l.bw) return;
    var s = l.bwSeries || [], lastW = s[s.length - 1], from = s.length > 6 ? s[s.length - 7] : s[0], now = bwNow(l), lost = from && lastW && from !== lastW ? Math.round((from.kg - now) * 10) / 10 : null;
    var perWeek = Math.round(l.bw.over / Math.max(1, l.meet.days / 7) * 10) / 10, urgent = j.tier <= 1;
    var cls = parseFloat(l.bw.cls), pc = bwPace(l, cls), onPace = !!(pc && pc.on), up = classUp(l), mid = slug(l.meet.name);
    add({ id: 'cut-' + l.id, ids: [l.id], group: 'meet', tone: 't-bw', kicker: 'Bodyweight', at: ord('weight', l), later: later('weight', l),
      reason: n(l.bw.over) + ' kg over ' + clsW(l.bw.cls), context: l.meet.days === 0 ? 'meet today' : l.meet.days === 1 ? 'meet tomorrow' : inWords(l.meet.days),
      title: l.first + ': ' + n(l.bw.over) + ' kg over ' + clsW(l.bw.cls) + ', ' + outWords(l.meet.days),   /* 8 words with the class in plain words */
      meaning: n(now) + ' kg ' + (lastW ? dayWord(lastW.d) : 'today') + (lost != null ? (lost > 0 ? ', down ' + n(lost) + ' kg since ' + K.dm(from.d) : lost < 0 ? ', up ' + n(-lost) + ' kg since ' + K.dm(from.d) : ', level since ' + K.dm(from.d)) : '') + '. Needs ' + n(perWeek) + ' kg a week.',
      rec: urgent ? 'Send a cut plan today, or move up a class.' : onPace ? 'On pace. Nothing to do but watch the weigh-ins.' : 'Not on pace yet. About ' + n(perWeek) + ' kg a week by food alone.',
      ev: [{ t: 'bw', l: l }],
      acts: urgent ? [
        { id: 'cut', kind: 'primary', label: 'Plan the cut…', keep: true, go: go('meets', 'id=' + mid + '&lifter=' + l.id + '&sheet=cut'), done: 'Cut plan sent', says: l.first + '’s cut plan starts today', tell: 'tell',
          reply: n(l.bw.over) + ' over with ' + l.meet.days + ' days to go. From today: about 300 kcal under and a weigh-in every morning. The last 0.5 comes off with water.' },
        up ? { id: 'up', label: 'Move up to ' + clsW(up), done: 'Moved up to ' + clsW(up), says: l.first + ' lifts in ' + clsW(up) } : null,
        { id: 'watch', label: 'Fine, keep watching', done: 'Watching the weigh-ins' }]
        : onPace ? [{ id: 'ok', kind: 'primary', label: 'Fine, keep watching', done: 'Watching the weigh-ins' }]
        : [{ id: 'plan', kind: 'primary', label: 'Start a slow cut', done: 'Slow cut started', says: l.first + '’s slow cut: about ' + n(perWeek) + ' kg a week' },
          { id: 'ok', label: 'Fine, keep watching', done: 'Watching the weigh-ins' },
          { id: 'class', label: 'Move up a class', done: up ? 'Moved up to ' + clsW(up) : 'Moved up a class', says: up ? l.first + ' lifts in ' + clsW(up) : l.first + ' moves up a class' }] });
  });

  /* ================= TRAINING: what was lifted against what was written ================= */
  D.lifters.forEach(function (l) {
    var j = job(l, 'overshoot'); if (!j) return;
    var rows = l.review ? l.review.rows : [], row = rows.filter(function (r) { return r.delta >= 1 && r.logged; })[0]; if (!row) return;
    var day = dayOf(l, row.day.split(' ')[0]) || lastDone(l), hr = /resting HR \+(\d+) · (\d+) days/.exec((l.readiness && l.readiness.text) || ''), lw = row.title.toLowerCase();
    var use = row.suggest ? row.suggest.kg : row.logged.w, keepKg = row.next ? row.next.w : row.logged.w, r = row.next ? row.next.r : row.logged.r, rpe = row.target.rpe;
    /* the back-offs that day follow the top set by the same ratio (shared.md §4.6), to the 2.5 kg step */
    var bo = rows.filter(function (x) { return x.day === row.day && x.lift === row.lift && x !== row && x.next && x.next.w; })[0], boAt = function (kg) { return bo ? Math.round(bo.next.w * kg / keepKg / 2.5) * 2.5 : null; };
    var nextN = l.review ? l.review.next + 1 : l.program.weekIdx + 2, nw = l.program.weeks[nextN - 1], nd = nw ? nw.days.filter(function (d) { return d.name === row.day; })[0] : null, rk = nd ? rowKey(nd, row.lift) : null;
    var ask = 'That ' + lw + ' looked heavier than it should. How are you sleeping?';
    add({ id: 'over-' + l.id, ids: [l.id], group: 'train', tone: 't-warn', kicker: 'Harder than written', at: ord('overshoot', l), later: later('overshoot', l),
      reason: row.title + ' felt ' + n(row.logged.rpe) + ', not ' + n(rpe), context: hr ? 'Resting heart rate up ' + hr[1] : K.When(day10(day.date)),
      title: row.title + ' felt ' + n(row.logged.rpe) + ', you wrote ' + n(rpe),
      meaning: n(row.logged.w) + ' × ' + row.logged.r + ' on ' + K.wd(day10(day.date)) + '.' + (hr ? ' Resting heart rate up ' + hr[1] + ' bpm for ' + hr[2] + ' days.' : ''),
      rec: 'Next week ' + n(use) + ' × ' + r + ' @' + n(rpe) + ', not ' + n(keepKg) + '.',
      ev: [{ t: 'sets', l: l, day: day, title: day.name + ', ' + K.when(day.date, { bare: true }) }, { t: 'health', l: l }],
      acts: [
        { id: 'rule', kind: 'primary', label: 'Use ' + n(use) + ' on ' + lw, button: 'Use ' + n(use) + ' and tell ' + l.first, silent: 'Use ' + n(use), done: row.title + ' next week ' + n(use) + ' × ' + r + ' @' + n(rpe) + ', told ' + l.first,
          says: l.first + ', ' + lw + ' next week ' + n(use) + ' × ' + r + ' @' + n(rpe) + (bo ? ', back-offs ' + n(boAt(use)) : ''), tell: 'tell',
          reply: ask + ' Next week’s top set is ' + n(use) + ' × ' + r + (bo ? ', back-offs ' + n(boAt(use)) : '') + '.',
          ops: rk ? [{ op: 'load', week: nextN, row: rk, kg: use }] : [] },
        { id: 'keep', label: 'Keep ' + n(keepKg), done: 'Kept ' + n(keepKg) },
        { id: 'hold', label: 'Hold at ' + n(row.logged.w), button: 'Hold and tell ' + l.first, silent: 'Hold at ' + n(row.logged.w), done: row.title + ' next week ' + n(row.logged.w) + ', told ' + l.first,
          says: l.first + ', ' + lw + ' next week ' + n(row.logged.w) + ' × ' + r + ' @' + n(rpe), tell: 'tell',
          reply: ask + ' Next week stays at ' + n(row.logged.w) + '.',
          ops: rk ? [{ op: 'load', week: nextN, row: rk, kg: row.logged.w }] : [] },
        { id: 'other', label: 'Other load', keep: true }] });
  });
  /* next week's main-lift lines at this week's loads, as ops (week n+1, the row key "day|title|occurrence|line") */
  function holdOps(l) {
    var p = l.program; if (!p) return [];
    var cur = p.weeks[p.weekIdx], nx = p.weeks[p.weekIdx + 1], out = []; if (!cur || !nx) return out;
    var grp = function (e) { var gs = [], prev = null; e.sets.forEach(function (s) { if (s.extra) return; var k = [s.w || 0, s.r, s.rpe, s.pct].join('|'); if (k !== prev) { gs.push({ w: s.w || 0, pct: s.pct }); prev = k; } }); return gs; };
    nx.days.forEach(function (nd) {
      var cd = cur.days.filter(function (q) { return q.name === nd.name; })[0]; if (!cd) return; var seen = {};
      (nd.exercises || []).forEach(function (e) {
        var occ = seen[e.title] = (seen[e.title] || 0) + 1; if (!K.LIFT[e.lift]) return;
        var k = 0, ce = (cd.exercises || []).filter(function (x) { return x.title === e.title && ++k === occ; })[0]; if (!ce) return;
        var cg = grp(ce), ng = grp(e);
        /* the top line only (its back-offs follow it), this week only; a percent line stays a percent */
        var g0 = ng[0]; if (g0 && g0.pct == null && cg[0] && cg[0].w && cg[0].w !== g0.w) out.push({ op: 'load', week: p.weekIdx + 2, row: nd.name + '|' + e.title + '|' + occ + '|0', kg: cg[0].w, scope: 'week' });
      });
    });
    return out;
  }
  D.lifters.forEach(function (l) {
    var j = job(l, 'drift'); if (!j || !l.drift) return;
    var r0 = (l.review ? l.review.rows : []).filter(function (r) { return r.delta > 0 && r.logged; })[0], day = lastDone(l);
    add({ id: 'drift-' + l.id, ids: [l.id], group: 'train', tone: 't-warn', kicker: 'Creeping up', at: ord('drift', l), later: later('drift', l),
      reason: 'Sets felt ' + n(l.drift.avg) + ' RPE harder', context: K.plural(l.drift.n, 'set'),
      title: 'Sets feel half a point harder than written',
      meaning: 'Across ' + l.drift.n + ' sets this week' + (r0 ? ': ' + r0.title.toLowerCase() + ' ' + n(r0.logged.w) + ' × ' + r0.logged.r + ' @' + n(r0.logged.rpe) + ', written @' + n(r0.target.rpe) : '') + '.',
      rec: 'Hold next week’s loads and look again.',
      ev: day ? [{ t: 'sets', l: l, day: day, title: day.name + ', ' + K.when(day.date, { bare: true }) }] : [],
      /* LOGIC-FIX-4 (walk 2, Ines): the hold shows what it changes and tells her, like every other fix: next week's main-lift
         lines take this week's loads (the ops the store's hold applies), with a short message */
      acts: [{ id: 'hold', kind: 'primary', label: 'Hold next week’s loads', button: 'Hold and tell ' + l.first, silent: 'Hold next week’s loads', done: 'Next week’s loads held', says: l.first + '’s next week repeats this week’s loads', tell: 'tell',
          reply: 'Your sets felt half a point harder this week, so next week repeats these loads. Tell me how they move.',
          ops: holdOps(l) },
        { id: 'leave', label: 'Keep the plan', done: 'Kept the plan' }] });
  });
  (function () {   // the sessions that went as written since yesterday: one item, one move
    var since = K.add(K.today, -1), all = K.sessionsSince(since).filter(function (s) { return !s.l.live; }), fine = all.filter(function (s) { return K.verdict(s.day).verdict === 'as written'; });
    if (!fine.length) return;
    var who = []; fine.forEach(function (s) { if (who.indexOf(s.l) < 0) who.push(s.l); });
    add({ id: 'review-fine', ids: who.map(function (l) { return l.id; }), group: 'train', tone: 't-ok', kicker: 'As written', at: 300, routine: true, reason: '', context: '',
      title: K.plural(fine.length, 'session') + ' since yesterday went as written',
      meaning: 'Every set done, every top set within half a point.',
      rec: 'Nothing to change.',
      ev: [{ t: 'sessions', rows: fine }],
      acts: [{ id: 'ok', kind: 'primary', label: 'Send a thumbs-up to all ' + who.length, done: 'Thumbs-up sent to ' + who.length, says: 'Thumbs-up to ' + who.length + ' lifters', tell: 'words', reply: 'Saw your session: all as written. Good work.' }] });
  })();

  /* ================= THEIR WORDS ================= */
  D.lifters.forEach(function (l) {
    var jm = job(l, 'message'), jf = job(l, 'formcheck'), jn = job(l, 'note');
    if (l.meet && l.meet.days === 0) return;   // a meet-day lifter's words are on their meet item
    if (!jm && !jf && !jn) return;
    var theirs = l.messages.filter(function (m) { return !m.me; }), last = theirs.slice(-1)[0], voice = theirs.filter(function (m) { return /^Voice note/.test(m.body || ''); }).slice(-1)[0], note = l.notes.filter(function (x) { return !x.reply; }).slice(-1)[0], day = lastDone(l), top = day ? K.topSet(day) : null;
    if (jf || (jm && voice)) {
      /* a video and a voice note (Arjun): watch first; the reply answers every question waiting (the depth sentence is the
         store's, added after the coach's depth call, screens.md §10.6) */
      var sg = top ? (l.review ? l.review.rows : []).filter(function (r) { return r.can && r.suggest && r.day === day.name && r.lift === top.ex.lift; })[0] : null;
      var sleeves = theirs.filter(function (m) { return /sleeves/i.test(m.body || '') && /\?/.test(m.body || ''); }).slice(-1)[0];
      add({ id: 'words-' + l.id, ids: [l.id], group: 'words', tone: 't-msg', kicker: 'Voice note and a form check', at: Math.min(ord('message', l), ord('formcheck', l)), later: later('message', l) && later('formcheck', l),
        reason: 'Asks if the rep was deep', context: 'Video, ' + (voice ? agoDays(voice.at) : 'yesterday'),
        title: l.first + ' asks if the rep was deep',
        meaning: (top ? K.wd(day10(day.date)) + ': ' + n(top.set.w) + ' × ' + top.set.r + ' ' + feltAt(top.set) + '.' : '') + (sleeves ? ' Also asks about sleeves.' : ''),
        rec: 'Watch the rep, then reply' + (sg ? ': ' + n(sg.suggest.kg) + ' next week.' : '.'),
        ev: [{ t: 'video', l: l, title: 'Squat, last rep of the top triple' }, { t: 'voice', l: l, len: '0:24', when: voice ? agoDays(voice.at) : '' }, note ? { t: 'quote', l: l, text: note.note, when: K.When(note.date) } : null, sleeves ? { t: 'quote', l: l, text: sleeves.body, when: agoDays(sleeves.at), at: sleeves.at } : null],
        answers: [voice ? voice.at : null, sleeves ? sleeves.at : null].filter(Boolean),
        acts: [{ id: 'review', kind: 'primary', label: 'Review the video', keep: true, go: go('messages', 'id=' + l.id + '&review=1') },
          { id: 'msg', label: 'Reply to ' + l.first, button: 'Send to ' + l.first, done: 'Replied to ' + l.first, tell: 'reply',
            reply: 'It moved well' + (sg ? ': ' + n(sg.suggest.kg) + ' next week.' : '.') + (sleeves ? ' Sleeves on for every set at RPE 8 and up, so the meet feels the same.' : '') }] });
      return;
    }
    if (jm && last) {
      var move = /move (\w+) to (\w+)/i.exec(last.body || '');
      /* the session the move is about: this week's, dated on the day they name (the store moves that one) */
      var WDN = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }, wk = K.week(l), ses = null, fromWd = move ? WDN[move[1].slice(0, 3).toLowerCase()] : null, toWd = move ? WDN[move[2].slice(0, 3).toLowerCase()] : null;
      if (move && wk) wk.days.forEach(function (d, di) { if (!ses && d.exercises && d.exercises.length && d.date && K.d(day10(d.date)).getDay() === fromWd && !(d.done > 0)) ses = { idx: di, name: d.name, date: day10(d.date) }; });
      if (ses && toWd != null) ses.toDate = K.add(ses.date, ((toWd - fromWd) + 7) % 7);
      var free = !!(ses && !wk.days.some(function (d) { return d.exercises && d.exercises.length && day10(d.date) === ses.toDate; }));
      var why = whyOf(last.body, /\bmove\b/i), liftW = ses ? ses.name.replace(/ Day$/, '').toLowerCase() : 'session';
      if (move) add({ id: 'words-' + l.id, ids: [l.id], group: 'words', tone: 't-msg', kicker: 'Message', at: ord('message', l), later: later('message', l),
        reason: 'Asks to move ' + move[1] + ' to ' + move[2], context: why || agoDays(last.at),
        title: l.first + ' asks to move ' + move[1] + ' to ' + move[2],
        meaning: free ? move[2] + ' is free. Nothing else moves.' : '',
        rec: '',
        ev: [{ t: 'quote', l: l, text: last.body, when: agoDays(last.at), at: last.at }, { t: 'weekdays', l: l, from: move[1], to: move[2], idx: ses ? ses.idx : null, name: ses ? ses.name : null, date: ses ? ses.date : null, toDate: ses ? ses.toDate : null }],
        answers: [last.at],
        acts: [{ id: 'move', kind: 'primary', label: 'Move to ' + move[2] + ', tell ' + l.first, button: 'Move and tell ' + l.first, silent: 'Move to ' + move[2], done: cap1(liftW) + 's on ' + move[2] + ', told ' + l.first,
            says: l.first + ', ' + (ses ? ses.name.toLowerCase() + ' ' + dmy(ses.toDate) : move[1] + '’s session on ' + move[2]), tell: 'tell',
            reply: 'Done, ' + liftW + 's are on ' + move[2] + ' now.' + (/trip/i.test(last.body) ? ' Safe trip!' : ''),
            ops: ses ? [{ op: 'moveDay', week: l.program.weekIdx + 1, day: ses.name, to: ses.toDate, scope: 'week' }] : [] },
          { id: 'keep', label: 'Keep ' + move[1], done: 'Kept ' + move[1] }] });
      else add({ id: 'words-' + l.id, ids: [l.id], group: 'words', tone: 't-msg', kicker: 'Message', at: ord('message', l), later: later('message', l),
        reason: 'Wrote you ' + agoDays(last.at), context: '',
        title: l.first + ' wrote you', meaning: '', rec: '',
        ev: [{ t: 'quote', l: l, text: last.body, when: agoDays(last.at), at: last.at }], answers: [last.at],
        acts: [{ id: 'msg', kind: 'primary', label: 'Reply to ' + l.first, button: 'Send to ' + l.first, done: 'Replied to ' + l.first, tell: 'words', reply: '' }] });
      return;
    }
    if (jn && note) {
      var part = /\b(knee|back|hip|shoulder|elbow|wrist|ankle|neck)\b/i.exec(note.note);
      /* the cap lands on the next squat session in the next 7 days (this week's, else next week's): the day the words name */
      var nextSq = null, lim = K.add(K.today, 7), sqWeek = null;
      (l.program ? l.program.weeks.slice(l.program.weekIdx, l.program.weekIdx + 2) : []).forEach(function (w, k) { w.days.forEach(function (d) {
        var dd = day10(d.date);
        if (nextSq || d.done > 0 || !dd || dd < K.today || dd >= lim || !(d.exercises || []).some(function (e) { return e.lift === 'squat'; })) return;
        nextSq = { name: d.name, date: dd, day: d }; sqWeek = l.program.weekIdx + k + 1;
      }); });
      var sqWhen = nextSq ? (nextSq.date === K.today ? 'today' : K.wd(nextSq.date)) : null, sqPoss = sqWhen ? (sqWhen === 'today' ? 'today’s' : sqWhen + '’s') : 'the next';
      var capTop = nextSq ? (nextSq.day.exercises.filter(function (e) { return e.lift === 'squat'; })[0] || {}).sets : null, cap = REST[l.id] || {};
      add({ id: 'words-' + l.id, ids: [l.id], group: 'words', tone: part ? 't-pain' : 't-msg', kicker: 'Session note', at: ord('note', l), later: later('note', l),
        reason: gist(note.note), context: waitWords(note.date),
        title: cap1((sentences(note.note)[0] || '').replace(/\bfelt\s+/i, '')),
        meaning: (top ? K.wd(day10(day.date)) + ': ' + n(top.set.w) + ' × ' + top.set.r + ' ' + feltAt(top.set) + '. ' : '') + cap1(her(l)) + ' note asks: keep going as written?',
        rec: 'Cap ' + sqPoss + ' squats at RPE 7, then ask again.',
        ev: [{ t: 'quote', l: l, text: note.note, when: K.When(note.date) }, day ? { t: 'sets', l: l, day: day, title: day.name + ', ' + K.when(day.date, { bare: true }) } : null],
        answers: [note.date],
        acts: [{ id: 'cap', kind: 'primary', label: 'Cap squats at RPE 7', button: 'Cap and reply to ' + l.first, silent: 'Cap squats at RPE 7', done: 'Squats capped at RPE 7, replied', tell: 'reply',
            says: nextSq ? l.first + ', ' + dmy(nextSq.date) + ': squat ' + (capTop ? '1 × ' + capTop[0].r + ' @7' : '@7') + (cap.cap ? ', ' + n(cap.cap) : '') : l.first + ': squats capped at RPE 7',
            reply: 'Keep going, but nothing over RPE 7 on ' + sqPoss + ' squats. Tell me how the ' + (part ? part[1].toLowerCase() : 'knee') + ' feels after them.',
            ride: 'Also cap ' + sqPoss + ' squats at RPE 7',
            ops: nextSq ? [{ op: 'cap', week: sqWeek, lift: 'squat', day: nextSq.name, rpe: 7 }] : [] },
          { id: 'msg', label: 'Reply to ' + l.first, button: 'Send to ' + l.first, done: 'Replied to ' + l.first, tell: 'words', reply: '' },
          { id: 'keep', label: 'Keep as written', done: 'Kept as written' }] });
    }
  });

  /* ================= TO APPROVE ================= */
  D.lifters.forEach(function (l) {
    if (!l.request || !job(l, 'busy')) return;
    var FULL = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }, rq = l.request, wk = K.week(l);
    var ses = wk ? wk.days.filter(function (d) { return d.exercises && d.exercises.length; }) : [], a0 = (rq.assign || [])[0], a1 = (rq.assign || [])[1];
    var first = ses[0], rest2 = ses.slice(1), mins = (l.intake && l.intake.sessionMinutes) || 60;
    var said = (l.answers || []).filter(function (x) { return x.text === rq.note; })[0];
    add({ id: 'busy-' + l.id, ids: [l.id], group: 'approve', tone: 't-write', kicker: 'A busy week', at: ord('busy', l), later: later('busy', l),
      reason: 'Can only train ' + K.list(rq.days, 3), context: whyOf(rq.note, /only train/i),
      title: 'Only ' + K.list(rq.days.map(function (d) { return FULL[d] || d; })) + ' this week',
      meaning: rq.days[0] + ': ' + (first ? first.name : 'the first session') + '. ' + rq.days[1] + ': ' + K.list(rest2.map(function (d) { return d.name; })) + ' in one session.',
      rec: '',
      ev: [{ t: 'quote', l: l, text: rq.note, when: said ? K.When(said.day) + '’s check-in' : 'With ' + her(l) + ' request' }, { t: 'plan2', rows: [[FULL[rq.days[0]] || rq.days[0], first ? first.name : '', 'as written'], [FULL[rq.days[1]] || rq.days[1], rest2.map(function (d) { return d.name; }).join(' and '), 'one session, ' + mins + ' minutes']] }],
      acts: [{ id: 'ok', kind: 'primary', label: 'Approve ' + K.list(rq.days, 3), button: 'Approve and tell ' + l.first, silent: 'Approve ' + K.list(rq.days, 3), done: K.list(rq.days, 3) + ' this week, told ' + l.first,
          says: l.first + ' this week: ' + rq.days[0] + ' ' + (first ? first.name.replace(/ Day$/, '').toLowerCase() + 's' : 'session') + ', ' + rq.days[1] + ' ' + K.list(rest2.map(function (d) { return d.name.replace(/ Day$/, '').toLowerCase(); })), tell: 'tell',
          reply: (FULL[rq.days[0]] || rq.days[0]) + ': ' + (first ? first.name.replace(/ Day$/, '').toLowerCase() + 's' : 'the first session') + '. ' + (FULL[rq.days[1]] || rq.days[1]) + ': ' + K.list(rest2.map(function (d) { return d.name.replace(/ Day$/, '').toLowerCase(); })) + ' in one session, about an hour. Back to your usual days next week.',
          ops: first && a0 && a1 ? [{ op: 'moveDay', week: l.program.weekIdx + 1, day: first.name, to: a0.date, scope: 'week' }, { op: 'merge', week: l.program.weekIdx + 1, days: rest2.map(function (d) { return d.name; }), into: a1.date, minutes: mins }] : [] },
        { id: 'edit', label: 'Change the days', keep: true, go: go('programs', 'id=' + l.id) },
        { id: 'keep', label: 'Keep as written', done: 'Kept as written' }] });
  });
  (D.applications || []).forEach(function (a, i) {
    var first = a.name.split(' ')[0];
    add({ id: 'app-' + i, ids: [], group: 'approve', tone: 't-write', kicker: 'New lifter', at: 420 + i, person: a.name,
      reason: 'Wants to join', context: a.years + ' years lifting',
      title: a.name + ' wants to train with you',
      meaning: a.years + ' years lifting. ' + n(a.s) + ' / ' + n(a.b) + ' / ' + n(a.d) + ' at ' + n(a.bw) + ' kg.',
      rec: 'You have ' + (D.coach.limit - D.coach.seats) + ' seats free.',
      ev: [{ t: 'quote', text: a.goals, when: 'Goal', name: a.name }, { t: 'quote', text: a.note, when: 'From the application', name: a.name }],
      acts: [{ id: 'yes', kind: 'primary', label: 'Accept ' + first + '…', done: 'Invite sent to ' + first, says: 'Invite sent to ' + first }, { id: 'msg', label: 'Reply to ' + first, button: 'Send to ' + first, done: 'Replied to ' + first, tell: 'words', reply: '' }, { id: 'no', label: 'Decline ' + first, done: 'Declined ' + first, says: 'Declined ' + first }] });
  });

  /* ================= TO WRITE ================= */
  /* A FIRST BLOCK (first-time-coach.md §3.5, function-polish F4.4): one item, first-<id>, from the intake to the first
     send. Stage 'start' (intake in or typed by the coach, no program): reason "No program yet", the main move opens the
     start panel. Stage 'send' (a first block written, nothing sent): reason "First block not sent", the main move opens
     the lifter in Programs, where "Send weeks 1 to 4 to <First>" is the crimson. Neither move settles the item: the
     store settles it on the lifter's first send. The row's ⋯ menu (it.menu, not a row button) holds "Do it Saturday":
     a reminder for the coming Saturday at 09:00 that brings the row back then.
       o: { stage: 'start' | 'send', startsOn: 'YYYY-MM-DD' (the block's first session, stage send), weeks (sent at once,
            default 4), at, later }   */
  function firstItem(l, o) {
    o = o || {}; var k = l.intake || {}, inj = k.injuries && k.injuries.parts && k.injuries.parts.length ? k.injuries : null, send = o.stage === 'send';
    var inOn = k.at ? day10(k.at) : null, wn = o.weeks || 4, sat = K.add(K.today, ((6 - K.d(K.today).getDay() + 7) % 7) || 7);
    var weeksTo = wn > 1 ? 'weeks 1 to ' + wn : 'week 1';
    var context = send ? (o.startsOn ? 'Starts ' + dmy(o.startsOn) : 'Not sent yet') : k.by === 'coach' ? 'Added by you' : inOn ? 'Intake came ' + (inOn === K.today ? 'today' : K.wd3(inOn)) : 'Intake in';
    var facts = (k.daysPerWeek ? k.daysPerWeek + ' days a week' : '') + (k.sessionMinutes ? ', ' + k.sessionMinutes + ' minutes' : '');
    var said = k.by === 'coach' ? 'Typed by you' : inOn ? 'Answered ' + (inOn === K.today ? 'today' : dmy(inOn)) : 'From the intake';
    return { id: 'first-' + l.id, ids: [l.id], group: 'write', tone: 't-write', kicker: send ? 'Not sent' : 'No block yet', person: l.name,
      at: o.at != null ? o.at : ord('noprogram', l), later: o.later != null ? !!o.later : (orderOf['noprogram|' + l.id] == null ? false : later('noprogram', l)),
      reason: send ? 'First block not sent' : 'No program yet', context: context,
      title: send ? l.first + '’s first block is not sent' : l.first + ' has no program yet',
      meaning: send ? 'Written' + (o.startsOn ? ', starts ' + dmy(o.startsOn) : '') + '. Nothing sent yet.' : (facts ? said + ': ' + facts + '.' : said + '.') + (inj ? ' ' + inj.parts[0] + ' noted.' : ''),
      rec: send ? 'Send ' + weeksTo + ', through the first deload.' : 'Write ' + her(l) + ' first block from ' + (k.by === 'coach' ? 'what you typed.' : 'the intake.'),
      ev: [inj ? { t: 'quote', l: l, text: inj.note, when: inj.parts.join(', ') } : null, k.goals ? { t: 'quote', l: l, text: k.goals, when: 'Goal' } : null],
      acts: [send
        ? { id: 'send', kind: 'primary', label: 'Send ' + weeksTo + ' to ' + l.first, keep: true, go: go('programs', 'id=' + l.id), done: 'First block sent' }
        : { id: 'start', kind: 'primary', label: 'Start ' + l.first + '’s first block', keep: true, go: go('programs', 'id=' + l.id + '&start=first'), done: 'First block started' }],
      menu: [{ id: 'later', label: 'Do it Saturday', done: 'Back on ' + dmy(sat) + ', 09:00', says: 'Back on ' + dmy(sat) + ', 09:00',
        remind: { on: sat + 'T09:00', kind: 'first-block', text: (send ? 'Send ' : 'Start ') + l.first + '’s first block' } }] };
  }
  /* AN INVITE NOT TAKEN (first-time-coach.md §3.5): join-<id>, under Keep an eye on once an invited lifter has not
     joined after 48 hours. One move, one click: "Send the link again" (the store sends it; no draft; undo: false, so
     the toast carries no Undo).
       o: { invitedAt: 'YYYY-MM-DDTHH:MM', email, at }   */
  function joinItem(l, o) {
    o = o || {}; var on = o.invitedAt ? day10(o.invitedAt) : K.today, d = Math.max(0, -K.daysTo(on)), ago = d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago';
    return { id: 'join-' + l.id, ids: [l.id], group: 'quiet', tone: 't-quiet', kicker: 'Not joined', person: l.name, at: o.at != null ? o.at : 470, later: true,
      reason: 'Hasn’t joined yet', context: 'Invited ' + ago,
      title: l.first + ' hasn’t joined yet',
      meaning: 'Invited ' + dmy(on) + (o.invitedAt && o.invitedAt.length > 10 ? ', ' + o.invitedAt.slice(11, 16) : '') + '. No intake yet.',
      rec: 'Send the link again, or text it yourself.',
      ev: [],
      acts: [{ id: 'resend', kind: 'primary', label: 'Send the link again', done: 'Link sent again', undo: false,
        says: o.email ? 'Invite sent again to ' + o.email : l.first + '’s link copied' }] };
  }
  /* A LIFTER ADDED BY HAND, NOT ON THE APP (FIX-LOGIC, first-time walk s6, Maya): offapp-<id>, in Needs you once a block
     went to someone the coach typed in and who has not opened their link yet. Until then nothing sent reaches them, so the
     desk says so in its first list, with the one move: copy the link (the store copies it and the toast shows it). Done
     for today when copied; the store opens it again the next day while they are still not on the app.
       o: { link: 'powalifta.com/j/<code>', url, weeks: 'Weeks 1 to 4' (what went), at }   */
  function offAppItem(l, o) {
    o = o || {}; var obj = l.sex === 'M' ? 'him' : l.sex === 'F' ? 'her' : 'them', pos = l.sex === 'M' ? 'his' : l.sex === 'F' ? 'her' : 'their', she = l.sex === 'M' ? 'He' : l.sex === 'F' ? 'She' : 'They';
    return { id: 'offapp-' + l.id, ids: [l.id], group: 'write', tone: 't-write', kicker: 'Not on the app', person: l.name, at: o.at != null ? o.at : 480, later: false,
      reason: 'Can’t see ' + pos + ' program yet', context: 'Not on the app',
      title: l.first + ' can’t see ' + pos + ' program yet',
      meaning: (o.weeks ? o.weeks + ' sent. ' : '') + she + (she === 'They' ? ' aren’t' : ' isn’t') + ' on the app yet.',
      rec: 'Send ' + obj + ' the link' + (o.link ? ': ' + o.link + '.' : '.'),
      ev: [],
      acts: [{ id: 'copy', kind: 'primary', label: 'Copy ' + l.first + '’s link', short: 'Copy link', done: 'Link copied', copy: o.url || null,
        says: l.first + '’s link copied' + (o.link ? ': ' + o.link : '') }] };
  }
  D.lifters.forEach(function (l) {
    if (!job(l, 'noprogram')) return;
    add(firstItem(l, { stage: 'start' }));
  });
  D.lifters.forEach(function (l) {
    if (!(job(l, 'blockend') || job(l, 'blockdone')) || !l.program) return;
    var meetDay = !!(l.meet && l.meet.days === 0), type = job(l, 'blockend') ? 'blockend' : 'blockdone';
    add({ id: 'blockend-' + l.id, ids: [l.id], group: 'write', tone: 't-write', kicker: 'Block ends', at: ord(type, l), later: true,
      reason: meetDay ? 'Block ends today' : 'Block ends this week', context: l.program.name,
      title: l.program.name + (meetDay ? ' ends with today’s meet' : ' ends this week'),
      meaning: meetDay ? 'Nothing written after the platform.' : 'Nothing written after this week.',
      rec: meetDay ? 'A week off, then the next block from today’s total.' : 'Plan the next block before this one ends.',
      ev: [{ t: 'people', rows: [{ l: l, text: l.program.name + ', week ' + (l.week.idx + 1) + ' of ' + l.week.total, end: meetDay ? 'Ends today' : 'Ends this week', tone: 't-quiet' }] }],
      acts: [{ id: 'next', kind: 'primary', label: 'Plan what’s next', keep: true, go: go('programs', 'id=' + l.id + '&start=next') },
        { id: 'off', label: 'Week off, then remind me', done: 'Week off, reminder set' }] });
  });

  /* ================= GONE QUIET ================= */
  D.lifters.forEach(function (l) {
    var jc = job(l, 'checkin'), jq = job(l, 'quiet'), jn = job(l, 'nocheckin'), js = job(l, 'stalling'), wk = K.week(l), wN = l.program ? l.program.weekIdx + 1 : null;
    if (jc) {
      var hr = /resting HR \+(\d+) · (\d+) days/.exec((l.readiness && l.readiness.text) || ''), sl = l.answers.filter(function (x) { return /sleep/i.test(x.q) && x.num != null; })[0];
      var missed = (wk ? wk.days : []).some(function (d) { return day10(d.date) === K.add(K.today, -1) && d.exercises && d.exercises.length && !(d.done > 0); });
      /* every main-lift top set this week not yet lifted goes to RPE 7 at BLOCK.lighter's load (shared.md §4.1) */
      var todo = (wk ? wk.days : []).filter(function (d) { return d.exercises && d.exercises.length && !(d.done > 0); }), lt = (REST[l.id] || {}).light || {}, caps = [];
      todo.forEach(function (d) { (d.exercises || []).forEach(function (e) { if (K.LIFT[e.lift] && (!e.variant || e.variant === 'Competition')) caps.push({ op: 'cap', week: wN, lift: e.lift, day: d.name, rpe: 7, date: day10(d.date) }); }); });
      /* LOGIC-FIX-4 (walk 2, Tomas): a session missed this week (Monday's bench) is not rewritten for a day that has passed: it
         moves to the first free day from today (moveDay, this week only), and the words name the day it moves to */
      var moves = [], taken = {}; (wk ? wk.days : []).forEach(function (d) { if (d.date && d.exercises && d.exercises.length) taken[day10(d.date)] = 1; });
      todo.forEach(function (d) {
        var dd0 = day10(d.date); if (!dd0 || dd0 >= K.today) return;
        var sun = K.add(K.monday(K.today), 6), to = null; for (var q = K.today; q <= sun && !to; q = K.add(q, 1)) if (!taken[q]) to = q;
        if (!to) return; taken[to] = 1; moves.push({ op: 'moveDay', week: wN, day: d.name, to: to, scope: 'week' });
        caps.forEach(function (c) { if (c.day === d.name) c.date = to; });
      });
      var whenOf = function (c) { return !c.date ? '' : c.date === K.today ? ' today' : ' on ' + K.wd(c.date); };
      var capOrder = moves.length ? caps.slice().sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); }) : caps.slice().sort(function (a, b) { return a.lift === 'deadlift' ? -1 : b.lift === 'deadlift' ? 1 : 0; });
      var capWords = capOrder.map(function (c) { return c.lift + (lt[c.lift] ? ' ' + n(lt[c.lift]) : ''); });
      var dlCap = caps.filter(function (c) { return c.lift === 'deadlift' && c.date && c.date >= K.today; })[0];
      add({ id: 'low-' + l.id, ids: [l.id], group: 'quiet', tone: 't-warn', kicker: 'Run down', at: ord('checkin', l), later: later('checkin', l),
        reason: 'Slept ' + (sl ? n(sl.num) : '5') + ' h', context: hr ? 'Resting heart rate up ' + hr[1] : '',
        title: 'Slept ' + (sl ? n(sl.num) : '5') + ' h, ' + (missed ? 'missed yesterday’s session' : 'no session since ' + (l.lastDate ? K.wd3(l.lastDate) : 'last week')),
        meaning: (hr ? 'Resting heart rate up ' + hr[1] + ' bpm for ' + hr[2] + ' days. ' : '') + (l.week ? l.week.done + ' of ' + l.week.planned + ' this week.' : ''),
        rec: 'Take the edge off this week: top sets at RPE 7.',
        ev: [{ t: 'health', l: l }],
        acts: [{ id: 'light', kind: 'primary', label: 'Make this week lighter', button: 'Lighten and tell ' + l.first, silent: 'Make this week lighter', done: 'Top sets at RPE 7, told ' + l.first,
          says: l.first + ' this week: ' + capWords.join(', '), tell: 'tell',
          reply: 'Short nights this week, so top sets are at RPE 7: ' + capOrder.map(function (c, i) { return c.lift + (lt[c.lift] ? ' ' + n(lt[c.lift]) : '') + (moves.length ? whenOf(c) : !i && dlCap && c === dlCap ? ' on ' + K.wd(dlCap.date) : ''); }).join(', ') + '. Get to bed early.',
          ops: moves.concat(caps.map(function (c) { return { op: 'cap', week: c.week, lift: c.lift, day: c.day, rpe: 7 }; })) }] });
    }
    if (jq) {
      var T0 = D.team, onTeam = !!(T0 && l.program && T0.members.some(function (m) { return m.id === l.id; })), nowW = onTeam ? Math.max(0, Math.min(T0.weeks.length - 1, Math.floor(-K.daysTo(T0.startsOn) / 7))) : null, hw = onTeam && nowW + 2 <= T0.weeks.length ? nowW + 2 : null;
      add({ id: 'quiet-' + l.id, ids: [l.id], group: 'quiet', tone: 't-quiet', kicker: 'Gone quiet', at: ord('quiet', l), later: later('quiet', l),
        reason: K.plural(l.ago, 'day') + ' since a session', context: 'Last session ' + K.dm(l.lastDate),
        title: 'No session in ' + K.plural(l.ago, 'day'),
        meaning: 'No session or message since ' + K.dm(l.lastDate) + '.',
        rec: 'Check in before you write anything new.',
        ev: [{ t: 'gap', l: l }],
        acts: [{ id: 'msg', kind: 'primary', label: 'Check in with ' + l.first, button: 'Send to ' + l.first, done: 'Checked in with ' + l.first, tell: 'words',
            reply: 'Haven’t seen a session since ' + K.dm(l.lastDate) + '. All good? Tell me your week and I’ll fit the training to it.',
            remind: { on: K.add(K.today, 2), text: 'Remind me ' + K.wd3(K.add(K.today, 2)) + ' if ' + (l.sex === 'M' ? 'he hasn’t' : 'she hasn’t') + ' answered' } },
          hw ? { id: 'hold', label: 'Hold week ' + hw, done: 'Week ' + hw + ' held', says: l.first + '’s week ' + hw + ' is held', ride: 'Also hold week ' + hw } : null] });
    }
    if (jn) {
      var nci = (l.reasons || []).filter(function (r) { return r.type === 'nocheckin'; })[0], nd = nci && /(\d+) days/.exec(nci.text), g = prOf(l);
      add({ id: 'nocheck-' + l.id, ids: [l.id], group: 'quiet', tone: 't-quiet', kicker: 'No check-in', at: ord('nocheckin', l), later: later('nocheckin', l),
        reason: 'No check-in for ' + (nd ? nd[1] + ' days' : 'a while'), context: 'Still training',
        title: 'No check-in for ' + (nd ? nd[1] + ' days' : 'a while'),
        meaning: 'Still training: ' + (l.week ? l.week.done + ' of ' + l.week.planned + ' this week' : 'sessions logged') + (g ? ', ' + g.lift + ' PR ' + K.wd3(g.d) : '') + '.',
        rec: 'A nudge is enough.',
        ev: [],
        acts: [{ id: 'nudge', kind: 'primary', label: 'Ask ' + l.first + ' to check in', button: 'Send to ' + l.first, done: 'Asked ' + l.first + ' to check in', tell: 'words', reply: 'Two minutes for your check-in when you can.' }] });
    }
    if (js) {
      var st = (l.reasons || []).filter(function (r) { return r.type === 'stalling'; })[0], wkN = st && /(\d+) wk/.exec(st.text), nextN = (l.program ? l.program.weekIdx + 2 : 2);
      var nwk = l.program ? l.program.weeks[nextN - 1] : null, bd = nwk ? nwk.days.filter(function (d) { return (d.exercises || []).some(function (e) { return e.lift === 'bench'; }); })[0] : null, be = bd ? bd.exercises.filter(function (e) { return e.lift === 'bench'; })[0] : null;
      add({ id: 'flat-' + l.id, ids: [l.id], group: 'train', tone: 't-quiet', kicker: 'Flat', at: ord('stalling', l), later: later('stalling', l),
        reason: 'Strength flat for ' + (wkN ? wkN[1] : 3) + ' weeks', context: 'All sessions done',
        title: 'Strength flat for ' + (wkN ? wkN[1] : 3) + ' weeks',
        meaning: 'Squat ' + Math.round(l.lifts.squat.e1) + ', bench ' + Math.round(l.lifts.bench.e1) + ', deadlift ' + Math.round(l.lifts.deadlift.e1) + '. Every session done.',
        rec: 'Change the stimulus: paused bench back-offs from week ' + nextN + '.',
        ev: [{ t: 'trend', l: l }],
        /* LOGIC-FIX-4 (walk 2, Dev): back-offs only, never the top set. With back-offs written, that line is paused a second;
           with none (the team plan's one bench line), paused back-offs are added under the top set, 15% off it, so they are
           lighter than the top set every week and the top set stays as written */
        acts: [{ id: 'swap', kind: 'primary', label: 'Swap in paused back-offs', button: 'Swap and tell ' + l.first, silent: 'Swap in paused back-offs', done: 'Paused back-offs from week ' + nextN,
          says: l.first + ', bench back-offs: paused 2 × 5, 15% off', tell: 'tell',
          reply: 'From next week, after your bench top set: 2 × 5 paused back-offs, 15% lighter. Pause a full second on the chest.',
          /* function-polish F3.5: written as off cells with an RPE ("15% off top set, @7"), so each week follows its own top set */
          ops: bd ? (be && linesOf(be) > 1 ? [{ op: 'set', week: nextN, day: bd.name, row: rowKey(bd, 'bench', 1), field: 'tempo', text: 'paused 1s' }] : [{ op: 'addLine', week: nextN, day: bd.name, row: rowKey(bd, 'bench', 0), label: 'Paused back-offs', cell: '2x5 -15% @7', tempo: 'paused 1s', scope: 'on' }]) : [] }] });
    }
  });

  /* ================= MONEY ================= */
  (function () {
    var late = D.lifters.filter(function (l) { return l.billing && l.billing.status && l.billing.status.state === 'overdue'; });
    if (!late.length) return;
    var lifting = late.filter(function (l) { return l.meet && l.meet.days === 0; }), nowL = late.filter(function (l) { return lifting.indexOf(l) < 0; });
    var label = lifting.length && nowL.length ? 'Remind ' + K.list(nowL.map(function (l) { return l.first; })) + ' now, ' + K.list(lifting.map(function (l) { return l.first; })) + ' tomorrow' : late.length === 2 ? 'Remind both' : 'Remind ' + late[0].first;
    add({ id: 'money-late', ids: late.map(function (l) { return l.id; }), group: 'money', tone: 't-quiet', kicker: 'Overdue', at: 460, later: true,
      reason: K.plural(late.length, 'payment') + ' late', context: K.money(late.reduce(function (s, l) { return s + l.billing.amount; }, 0)),
      title: K.plural(late.length, 'payment') + ' overdue: ' + K.money(late.reduce(function (s, l) { return s + l.billing.amount; }, 0)),
      meaning: late.map(function (l) { return l.first + ', ' + K.money(l.billing.amount) + ', ' + (-K.daysTo(l.billing.nextDue)) + ' days late'; }).join('. ') + '.',
      rec: lifting.length ? K.list(lifting.map(function (l) { return l.first; })) + ' lifts today: that reminder can wait until tomorrow.' : 'A short reminder from you.',
      ev: [{ t: 'people', rows: late.map(function (l) { return { l: l, text: l.billing.pkg + ', ' + K.money(l.billing.amount) + ' a month', end: (-K.daysTo(l.billing.nextDue)) + ' days late', tone: 't-warn' }; }) }],
      acts: [{ id: 'remind', kind: 'primary', label: label, short: label.length > 28 ? 'Remind ' + K.list(nowL.map(function (l) { return l.first; })) + ', ' + K.list(lifting.map(function (l) { return l.first; })) + ' tomorrow' : label,
          done: (nowL.length ? 'Reminded ' + K.list(nowL.map(function (l) { return l.first; })) : '') + (lifting.length ? (nowL.length ? ', ' : 'Reminding ') + K.list(lifting.map(function (l) { return l.first; })) + ' tomorrow' : ''), says: (nowL.length ? 'Reminder to ' + K.list(nowL.map(function (l) { return l.first; })) + ' now' : '') + (lifting.length ? (nowL.length ? ', ' : '') + K.list(lifting.map(function (l) { return l.first; })) + ' tomorrow 08:00' : '') },
        { id: 'paid', label: 'Mark paid', done: 'Marked paid', says: 'Marked paid: ' + K.list(late.map(function (l) { return l.first; })) }] });
  })();

  /* ================= GOING WELL ================= */
  (function () {
    var since = K.add(K.today, -4), prs = [];
    D.lifters.forEach(function (l) { var seen = {}; l.logs.filter(function (g) { return g.pr && g.d >= since && g.lift; }).sort(function (a, b) { return b.e1 - a.e1; }).forEach(function (g) { if (!seen[g.lift]) { seen[g.lift] = 1; prs.push({ l: l, g: g }); } }); });
    prs.sort(function (a, b) { return b.g.d.localeCompare(a.g.d); }); var allPrs = prs.length; prs = prs.slice(0, 6);
    if (!prs.length) return;
    var who = []; prs.forEach(function (x) { if (who.indexOf(x.l) < 0) who.push(x.l); });
    add({ id: 'wins', ids: who.map(function (l) { return l.id; }), group: 'good', tone: 't-ok', kicker: 'PRs', at: 480, routine: true, reason: '', context: '',
      title: K.plural(allPrs, 'PR') + ' since ' + K.wd(since), meaning: K.list(who.map(function (l) { return l.first; }), 5) + '.', rec: '',
      ev: [{ t: 'prs', rows: prs }],
      acts: [{ id: 'nice', kind: 'primary', label: 'Send “Nice lift” to all ' + who.length, done: 'Sent to ' + who.length, says: '“Nice lift” to ' + who.length + ' lifters', tell: 'words', reply: 'Nice lift!' }] });
  })();

  var settle = function () {
    items.sort(function (a, b) { return (a.later ? 1 : 0) - (b.later ? 1 : 0) || a.at - b.at; });
    items.forEach(function (it, i) { it.i = i; var ls = it.ids.map(K.L).filter(Boolean); if (ls.length || !it.ls) it.ls = ls; it.g = GROUPS.filter(function (g) { return g[0] === it.group; })[0]; });
  };
  settle();

  /* ================= state: what the coach has done ================= */
  var state = { done: {} }, subs = [];
  var emit = function () { subs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); };
  var C = window.COACH = { items: items, GROUPS: GROUPS, state: state };
  C.on = function (f) { subs.push(f); };
  C.isDone = function (it) { return !!state.done[it.id]; };
  C.open = function () { return items.filter(function (it) { return !state.done[it.id]; }); };
  C.now = function () { return C.open().filter(function (it) { return !it.later; }); };
  C.groups = function (list) { list = list || items; return GROUPS.map(function (g) { return { key: g[0], name: g[1], tone: g[2], items: list.filter(function (it) { return it.group === g[0]; }) }; }).filter(function (g) { return g.items.length; }); };
  C.forLifter = function (id) { return items.filter(function (it) { return it.ids.indexOf(id) >= 0; }); };
  C.get = function (id) { return items.filter(function (it) { return it.id === id; })[0] || null; };
  C.act = function (itemId, actId) { var it = C.get(itemId); return it ? it.acts.concat(it.menu || []).filter(function (a) { return a.id === actId; })[0] || null : null; };
  C.undo = function (id) { delete state.done[id]; emit(); };
  /* Items for lifters the store creates (first-time-coach.md §3.5): C.first(l, o) and C.join(l, o) give the item with
     every word in it (firstItem and joinItem above); C.add(item) registers it, or replaces the item with its id (a
     first-<id> moving from 'start' to 'send' keeps its done state); C.remove(id) takes it away with its done state.
     Both keep the triage order and tell every subscriber. An item whose lifter K.L does not know yet reads it from
     item.lifter (its first name in toasts). */
  C.first = function (l, o) { return firstItem(l, o); };
  C.join = function (l, o) { return joinItem(l, o); };
  C.offapp = function (l, o) { return offAppItem(l, o); };
  C.add = function (it) {
    if (!it || !it.id) return null;
    var lf = it.lifter; delete it.lifter; norm(it); if (lf && !it.ids.map(K.L).filter(Boolean).length) it.ls = [lf];
    for (var i = items.length - 1; i >= 0; i--) if (items[i].id === it.id) items.splice(i, 1);
    items.push(it); settle(); emit(); return it;
  };
  C.remove = function (id) {
    var n0 = items.length; for (var i = items.length - 1; i >= 0; i--) if (items[i].id === id) items.splice(i, 1);
    if (items.length === n0) return false;
    delete state.done[id]; settle(); emit(); return true;
  };
  /* The lifters who still need the coach: everyone on an open item that is not "later" or "going well", in triage order. */
  C.needIds = function () { var out = []; C.now().forEach(function (it) { if (it.group === 'good' || it.routine) return; it.ids.forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); }); }); return out; };
  /* The toast in the one format (shared.md §5): "<says>." or "<says>. Sent to <First>: “<the words>”" */
  C.toastText = function (it, a, text) {
    var who = it.ls[0] ? it.ls[0].first : (it.person || '').split(' ')[0], says = a.says || a.done || a.label;
    return says + '.' + (text ? ' Sent to ' + who + ': “' + text + '”' : '');
  };
  /* Do a move. A move with a reply opens the composer first (the page shows it: C.composer). keep: the item stays open. */
  C.run = function (it, actId, o) {
    o = o || {}; var a = it.acts.concat(it.menu || []).filter(function (x) { return x.id === actId; })[0]; if (!a) return;
    if (a.reply != null && !o.sent) { if (o.compose) o.compose(a); return; }
    if (!a.keep) state.done[it.id] = { act: a.id, at: Date.now() };
    K.toast(C.toastText(it, a, o.text || null), a.keep || a.undo === false ? null : function () { C.undo(it.id); });
    emit();
  };

  /* ================= the evidence, drawn ================= */
  var EV = {
    sets: function (e) { return '<div class="ev ev-sets">' + (e.title ? '<div class="ev-h">' + esc(e.title) + '</div>' : '') + K.setsTable(e.day, { max: 3 }) + '</div>'; },
    pain: function (e) { return '<div class="ev ev-pain">' + e.reports.map(function (p) { var o = ''; for (var i = 0; i < 10; i++) o += '<i class="' + (i < p.sev ? 'on' : '') + '"></i>'; return '<div class="row" style="gap:14px"><span class="pips t-pain">' + o + '</span><b>' + n(p.sev) + ' out of 10</b><span class="dim">' + esc(K.When(p.day)) + ' · ' + esc(p.part) + (p.lift ? ' · ' + esc(String(p.lift).toLowerCase()) : '') + '</span></div>'; }).join('') + '</div>'; },
    check: function (e) { var a = e.l.answers.filter(function (x) { return x.day === K.today; }); return '<div class="ev ev-facts">' + (a.length ? a.map(function (x) { return '<div class="row"><span class="dim grow">' + esc(x.q) + '</span><b>' + (x.kind === 'yesno' ? (x.num ? 'Yes' : 'No') : esc(x.text != null ? x.text : n(x.num))) + '</b></div>'; }).join('') : '<div class="row"><span class="dim grow">Any pain or niggles?</span><b>Yes</b></div>') + '</div>'; },
    fact: function (e) { return '<p class="ev ev-fact dim">' + esc(e.text) + '</p>'; },
    quote: function (e) { return '<div class="ev ev-quote ' + (e.tone || 't-msg') + '">' + '<p class="quote">' + esc(String(e.text).replace(/^[“"]|[”"]$/g, '')) + '</p><span class="small dim">' + esc((e.l ? e.l.first : e.name || '') + (e.when ? ' · ' + e.when : '')) + '</span></div>'; },
    voice: function (e) { var b = ''; for (var i = 0; i < 34; i++) b += '<i style="height:' + (5 + Math.round(Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)) * 20)) + 'px"></i>'; return '<div class="ev ev-voice"><button class="btn sm" type="button" data-play>' + K.ic('play') + 'Play</button><span class="wave">' + b + '</span><b class="num">' + esc(e.len) + '</b><span class="small dim">' + esc(e.when || '') + '</span></div>'; },
    video: function (e) { return '<div class="ev ev-video"><span class="thumb">' + K.ic('play') + '</span><span class="col"><b>' + esc(e.title) + '</b><span class="small dim">0:09 · from ' + esc(e.l.first) + '</span></span></div>'; },
    bw: function (e) { var l = e.l, s = l.bwSeries.map(function (x) { return x.kg; }), cls = parseFloat(l.bw.cls); return '<div class="ev ev-bw row" style="gap:20px"><span style="color:var(--bw)">' + K.spark(s, { w: 220, h: 56, fill: true }) + '</span><span class="col"><b class="num" style="font-size:22px">' + n(bwNow(l)) + ' kg</b><span class="small dim">the class is ' + n(cls) + ' · ' + l.meet.days + ' days to go</span></span></div>'; },
    health: function (e) { var h = e.l.health.slice(-7); if (!h.length) return ''; var mx = Math.max.apply(null, h.map(function (x) { return x.rhr || 0; })), mn = Math.min.apply(null, h.map(function (x) { return x.rhr || 99; })); return '<div class="ev ev-health"><div class="ev-h">Resting heart rate and sleep, last 7 days</div><div class="hbars">' + h.map(function (x) { var f = mx > mn ? (x.rhr - mn) / (mx - mn) : 0.5; return '<span class="hb" title="' + esc(K.wd3(x.d) + ': ' + x.rhr + ' bpm, ' + n(x.sleep) + ' h') + '"><i class="' + (f > 0.6 ? 'hot' : '') + '" style="height:' + (14 + Math.round(f * 30)) + 'px"></i><b>' + x.rhr + '</b><em>' + n(x.sleep) + ' h</em><u>' + K.wd3(x.d).charAt(0) + '</u></span>'; }).join('') + '</div></div>'; },
    people: function (e) { return '<div class="ev ev-people">' + e.rows.map(function (r) { return '<div class="row prow ' + (r.tone || '') + '">' + K.face(r.l, 32) + '<b>' + esc(r.l.name) + '</b><span class="dim grow clip">' + esc(r.text) + '</span><span class="word">' + esc(r.end || '') + '</span></div>'; }).join('') + '</div>'; },
    sessions: function (e) { return '<div class="ev ev-people">' + e.rows.map(function (s) { var t = K.topSet(s.day); return '<div class="row prow">' + K.face(s.l, 32) + '<b>' + esc(s.l.first) + '</b><span class="dim">' + esc(s.day.name) + '</span><span class="grow clip">' + (t ? K.liftChip(t.ex.lift) + ' ' + K.set(t.set, { felt: true }) : '') + '</span><span class="small dim">' + esc(K.When(s.date)) + '</span></div>'; }).join('') + '</div>'; },
    changes: function (e) { return '<div class="ev ev-people">' + e.rows.map(function (x) { var r = x.r, up = r.suggest.kg > r.next.w; return '<div class="row prow">' + K.face(x.l, 32) + '<b>' + esc(x.l.first) + '</b><span class="dim">' + K.liftChip(r.lift) + ' ' + esc(r.title) + '</span><span class="grow clip small dim">lifted ' + n(r.logged.w) + ' × ' + r.logged.r + ' at ' + n(r.logged.rpe) + '</span><span class="num"><span class="dim">' + n(r.next.w) + '</span> → <b class="' + (up ? 't-ok' : 't-warn') + ' word">' + n(r.suggest.kg) + '</b></span></div>'; }).join('') + '</div>'; },
    plan2: function (e) { return '<div class="ev ev-people">' + e.rows.map(function (r) { return '<div class="row prow"><b style="width:96px">' + esc(r[0]) + '</b><span class="grow">' + esc(r[1]) + '</span><span class="small dim">' + esc(r[2]) + '</span></div>'; }).join('') + '</div>'; },
    weekdays: function (e) { var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], w = K.week(e.l), names = w ? w.days.filter(function (d) { return d.sets; }).map(function (d) { return d.name.replace(' Day', ''); }) : [], on = { Mon: names[0], Wed: names[1], Fri: names[2] }; return '<div class="ev ev-week">' + days.map(function (d) { var from = e.from.indexOf(d) === 0, to = e.to.indexOf(d) === 0; return '<span class="wd' + (from ? ' from' : '') + (to ? ' to' : '') + '"><u>' + d + '</u><b>' + (to ? esc(on[e.from.slice(0, 3)] || 'Session') : from ? '' : esc(on[d] || '')) + '</b></span>'; }).join('') + '</div>'; },
    gap: function (e) { var o = ''; for (var i = 13; i >= 0; i--) { o += '<i class="' + (i >= e.l.ago ? 'on' : '') + '" title="' + K.dm(K.add(K.today, -i)) + '"></i>'; } return '<div class="ev ev-gap"><div class="ev-h">The last 14 days</div><span class="gap">' + o + '</span></div>'; },
    trend: function (e) { return '<div class="ev ev-trend row" style="gap:28px">' + ['squat', 'bench', 'deadlift'].map(function (L) { var x = e.l.lifts[L]; return '<span class="col" style="gap:4px;color:var(--' + (L === 'squat' ? 'sq' : L === 'bench' ? 'be' : 'dl') + ')">' + K.spark(x.series, { w: 120, h: 40 }) + '<span style="color:var(--ink)"><b class="num">' + n(x.e1) + '</b> <span class="small dim">' + K.LIFT[L].toLowerCase() + ' · ' + K.sign(x.delta) + ' in 4 weeks</span></span></span>'; }).join('') + '</div>'; },
    prs: function (e) { return '<div class="ev ev-people">' + e.rows.map(function (x) { return '<div class="row prow">' + K.face(x.l, 32) + '<b>' + esc(x.l.first) + '</b><span>' + K.liftChip(x.g.lift) + ' <b class="num">' + n(x.g.w) + '</b> × ' + x.g.r + ' <span class="faint">@</span>' + n(x.g.rpe) + '</span><span class="grow small dim clip">e1RM ' + n(Math.round(x.g.e1)) + ' kg</span><span class="small dim">' + esc(K.When(x.g.d)) + '</span></div>'; }).join('') + '</div>'; }
  };
  C.evHtml = function (it, o) { o = o || {}; return it.ev.slice(0, o.max || 9).map(function (e) { return EV[e.t] ? EV[e.t](e) : ''; }).join(''); };
  C.actsHtml = function (it, o) { o = o || {}; var d = state.done[it.id]; if (d) { var a = it.acts.filter(function (x) { return x.id === d.act; })[0]; return '<div class="acts"><span class="btn done' + (o.lg ? ' lg' : '') + '">' + K.ic('check', 2.4) + esc(a ? a.label : 'Done') + '</span><button class="btn ghost' + (o.lg ? ' lg' : '') + '" type="button" data-undo="' + esc(it.id) + '">Undo</button></div>'; }
    return '<div class="acts">' + it.acts.slice(0, o.max || 9).map(function (a, i) { return '<button type="button" class="btn ' + (a.kind === 'primary' && !o.noPrimary ? 'primary' : (i ? 'line' : '')) + (o.lg && a.kind === 'primary' ? ' lg' : o.sm ? ' sm' : '') + '" data-item="' + esc(it.id) + '" data-act="' + esc(a.id) + '">' + esc(a.label) + (a.kind === 'primary' && o.key ? ' <span class="kbd" style="background:rgba(255,255,255,.22);color:#fff">' + o.key + '</span>' : '') + '</button>'; }).join('') + '</div>'; };
  /* a composer for a move that sends words: the prefilled reply, Send, a voice note. onSend(text) */
  C.composer = function (it, a, onSend, onCancel) {
    var who = it.ls[0] ? it.ls[0].first : (it.person || '').split(' ')[0], box = document.createElement('div'); box.className = 'composer';
    box.innerHTML = '<textarea class="input" rows="3" aria-label="Message ' + esc(who) + '" placeholder="Write to ' + esc(who) + '">' + esc(a.reply || '') + '</textarea><div class="row" style="margin-top:10px"><button class="btn ink" type="button" data-send>Send to ' + esc(who) + ' <span class="kbd" style="background:rgba(0,0,0,.12);color:inherit">⌘↵</span></button><button class="btn ghost" type="button" data-voice>' + K.ic('mic') + 'Voice note</button><span class="grow"></span><button class="btn ghost" type="button" data-cancel>Cancel</button></div>';
    var ta = box.querySelector('textarea'), send = function () { onSend(ta.value); };
    box.querySelector('[data-send]').addEventListener('click', send); box.querySelector('[data-cancel]').addEventListener('click', function () { if (onCancel) onCancel(); });
    box.querySelector('[data-voice]').addEventListener('click', function () { K.toast('Hold to record: a voice note goes to ' + who + ' in your own voice.'); });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } if (e.key === 'Escape') { e.preventDefault(); if (onCancel) onCancel(); } });
    setTimeout(function () { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
    return box;
  };
})();
