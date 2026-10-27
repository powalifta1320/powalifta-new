/* =====================================================================
   challenges.js — coach challenges (2026-10-28)

   A coach sets their own lifters (all of them, or one team) a challenge for a month or four
   weeks: most sessions, most PRs, the biggest gain on their total, or training as written.
   It has its own board in Club (desk and phone), each row a place, a face, a name and the
   value in the challenge's words; the lifter sees where they stand ("you're 3rd of 12") and
   the board, names and values only: never anyone's logs or program. Clubs are untouched.

   Pure (unit-tested, tests.html "coach challenges (challenges.js)"):
     challengeValue(metric, logs, { from, to, today, program, baseline }) → number | null
     challengeBaseline(logs, from) → the best e1RM total in the 8 weeks before (gain's baseline)
     rankChallenge(entries) → [{ …entry, rank }] (competition ranking, ties share a place)
     challengeText(metric, value, unit) → '14 sessions', '3 PRs', '+6.2%', '92% as written'
     challengeWindow(kind, today), challengeName(metric, from, to), challengeState(ch, today),
     challengeWhen(ch, today), challengeEntry(ch, athlete, logs, program, prev, today), ordinal(n)

   Data: sql/migration-coach-challenges-2026-10-28.sql (coach_challenges + challenge_entries)
   through db.js's "COACH CHALLENGES hook". Until it runs, a coach's challenges stay on their
   laptop / phone (localStorage) and lifters see none. ?demo=1 never touches the network.
   Who writes entries: the lifter's app after a logged set (debounced) and when Club opens; the
   coach's app for every member when it loads (it reads their logs). gain's baseline is taken at
   the first write and never moves (a trigger pins it on the server too).
   ===================================================================== */
var Challenges = (function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var hasDom = typeof document !== 'undefined' && !!(document && document.createElement);

  var METRICS = {
    sessions: { label: 'Most sessions', name: 'most sessions', explain: 'Days trained while it runs' },
    prs: { label: 'Most PRs', name: 'most PRs', explain: 'Sets that beat their best e1RM' },
    gain: { label: 'Biggest gain', name: 'biggest gain', explain: 'Their total against the 8 weeks before' },
    asWritten: { label: 'As written', name: 'training as written', explain: 'Sessions done of the ones you wrote' }
  };
  var KEYS = ['sessions', 'prs', 'gain', 'asWritten'];
  var MAIN = ['squat', 'bench', 'deadlift'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var BASE_DAYS = 56, MAX_DAYS = 92, NAME_MAX = 60;

  // ------------------------------------------------------------ dates (UTC noon: no DST surprises)
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function iso(d) { var s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
  function addDays(day, n) { var d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
  function monthEnd(day) { var d = new Date(day.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); }
  function shortDate(day) { return MONTHS[Number(day.slice(5, 7)) - 1].slice(0, 3) + ' ' + Number(day.slice(8, 10)); }
  function ordinal(n) { var v = n % 100; return n + ((v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')); }

  // ------------------------------------------------------------ pure: the values
  // The last day that counts: the challenge's end, or today while it runs, or the day the coach ended it.
  function lastDay(o) {
    var to = iso(o.to), today = iso(o.today) || to;
    return to && today && today < to ? today : to;
  }
  function trainingDays(logs, from, end) {
    var seen = {}, n = 0;
    (logs || []).forEach(function (l) { var d = l && iso(l.date); if (d && d >= from && d <= end && !seen[d]) { seen[d] = 1; n++; } });
    return n;
  }
  // The best competition-equivalent e1RM of each main lift between two days (inclusive): { squat: kg, … }.
  function bestBy(logs, from, end) {
    var out = {};
    (logs || []).forEach(function (l) {
      var d = l && iso(l.date);
      if (!d || d < from || d > end || MAIN.indexOf(l.lift) < 0) return;
      var e = num(l.e1rmComp);
      if (e > (out[l.lift] || 0)) out[l.lift] = e;
    });
    return out;
  }
  // gain's baseline: the best e1RM total in the 8 weeks before the start (all three lifts), or null.
  function challengeBaseline(logs, from) {
    var f = iso(from);
    if (!f) return null;
    var b = bestBy(logs, addDays(f, -BASE_DAYS), addDays(f, -1));
    return MAIN.every(function (l) { return b[l] > 0; }) ? b.squat + b.bench + b.deadlift : null;
  }
  // Sets that beat every earlier e1RM of their lift (isPRForLog's rule: by date, then id; a lift's
  // first set beats nothing), main lifts, counted in the window.
  function prCount(logs, from, end) {
    var n = 0;
    MAIN.forEach(function (lift) {
      var mine = (logs || []).filter(function (l) { return l && l.lift === lift && iso(l.date); })
        .sort(function (a, b) { return iso(a.date) < iso(b.date) ? -1 : iso(a.date) > iso(b.date) ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0; });
      var best = -Infinity, seen = 0;
      mine.forEach(function (l) {
        var e = num(l.e1rmComp), d = iso(l.date);
        if (seen && e > best + 0.05 && d >= from && d <= end) n++;
        if (e > best) best = e;
        seen++;
      });
    });
    return n;
  }
  // A program's sessions a week (app.js programWeekState's count): the days with sets in the week
  // being trained (the first with a set still to do), else the last.
  function sessionsPerWeek(program) {
    var weeks = (program && program.weeks) || [];
    if (!weeks.length) return 0;
    var work = function (w) { return ((w && w.days) || []).filter(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).length; }); }); };
    var idx = -1;
    for (var i = 0; i < weeks.length && idx < 0; i++) if (work(weeks[i]).some(function (d) { return d.exercises.some(function (e) { return e.sets.some(function (s) { return !s.completed; }); }); })) idx = i;
    if (idx < 0) idx = weeks.length - 1;
    return work(weeks[idx]).length || work(weeks[0]).length;
  }
  // The metric's value for one lifter: sessions (days trained), prs (PR sets), gain (% on the
  // baseline, each lift the better of its best before and its best in the window: training light
  // never reads as a loss), asWritten (sessions done of the whole sessions planned so far, to 100%).
  // o: { from, to, today, program (asWritten), baseline (gain: the one kept at the first write) }
  // → number (sessions, prs: 0 and up) | null (gain without a baseline, asWritten without a plan yet)
  function challengeValue(metric, logs, o) {
    o = o || {};
    var from = iso(o.from), end = lastDay(o);
    var counts = metric === 'sessions' || metric === 'prs';
    if (!from || !end || end < from) return counts ? 0 : null;
    if (metric === 'sessions') return trainingDays(logs, from, end);
    if (metric === 'prs') return prCount(logs, from, end);
    if (metric === 'gain') {
      var base = num(o.baseline) > 0 ? num(o.baseline) : challengeBaseline(logs, from);
      if (!(base > 0)) return null;
      var pre = bestBy(logs, addDays(from, -BASE_DAYS), addDays(from, -1)), win = bestBy(logs, from, end), total = 0;
      for (var i = 0; i < MAIN.length; i++) {
        var v = Math.max(pre[MAIN[i]] || 0, win[MAIN[i]] || 0);
        if (!(v > 0)) return null;
        total += v;
      }
      return Math.round((total - base) / base * 1000) / 10;
    }
    if (metric === 'asWritten') {
      var spw = sessionsPerWeek(o.program);
      if (!(spw > 0)) return null;
      var planned = Math.floor(spw * (daysBetween(from, end) + 1) / 7);
      if (!(planned > 0)) return null;
      return Math.min(100, Math.round(trainingDays(logs, from, end) / planned * 100));
    }
    return null;
  }
  // Competition ranking ("1224"): best first; a tie shares a place and the next place skips; a tie is
  // listed by name; no value (null) goes last, with no place.
  function rankChallenge(entries) {
    var list = (entries || []).filter(Boolean).map(function (e) { return Object.assign({}, e); });
    var has = function (e) { return e.value != null && isFinite(Number(e.value)); };
    list.sort(function (a, b) {
      if (has(a) !== has(b)) return has(a) ? -1 : 1;
      if (has(a) && Number(b.value) !== Number(a.value)) return Number(b.value) - Number(a.value);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    var place = 0, last = null;
    list.forEach(function (e, i) {
      if (!has(e)) { e.rank = null; return; }
      if (last == null || Math.abs(Number(e.value) - last) > 1e-9) { place = i + 1; last = Number(e.value); }
      e.rank = place;
    });
    return list;
  }
  // The value in the challenge's words. unit: the viewer's ('kg' | 'lbs'): the four metrics carry no
  // load, so it only matters to a metric that would.
  function challengeText(metric, value, unit) {
    void unit;
    if (value == null || !isFinite(Number(value)) || !METRICS[metric]) return '–';
    var v = Number(value);
    if (metric === 'sessions') return v + (v === 1 ? ' session' : ' sessions');
    if (metric === 'prs') return v + (v === 1 ? ' PR' : ' PRs');
    if (metric === 'gain') return v === 0 ? '0%' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1) + '%';
    return Math.round(v) + '% as written';
  }

  // ------------------------------------------------------------ pure: windows, names, states
  // 'month': the rest of this month, or next month when a week or less is left; '4weeks': 28 days
  // from today. → { from, to, label }
  function challengeWindow(kind, today) {
    var t = iso(today);
    if (kind === '4weeks') return { from: t, to: addDays(t, 27), label: '4 weeks' };
    var end = monthEnd(t);
    if (daysBetween(t, end) + 1 >= 8) return { from: t, to: end, label: 'This month' };
    var next = addDays(end, 1);
    return { from: next, to: monthEnd(next), label: MONTHS[Number(next.slice(5, 7)) - 1] };
  }
  // "November: most sessions": named for the month most of it falls in.
  function challengeName(metric, from, to) {
    var f = iso(from), t = iso(to) || f;
    var mid = addDays(f, Math.floor(daysBetween(f, t) / 2));
    return MONTHS[Number(mid.slice(5, 7)) - 1] + ': ' + (METRICS[metric] || METRICS.sessions).name;
  }
  function endDay(ch) {
    var e = iso(ch && ch.endsOn), x = iso(ch && ch.endedAt);
    return x && (!e || x < e) ? x : e;
  }
  // 'upcoming' | 'running' | 'ended' (the coach ended it, or its last day has gone).
  function challengeState(ch, today) {
    var t = iso(today);
    if (!ch) return 'ended';
    if (ch.endedAt || t > iso(ch.endsOn)) return 'ended';
    if (t < iso(ch.startsOn)) return 'upcoming';
    return 'running';
  }
  // "12 days left", "Ends today", "Starts tomorrow", "Ended Nov 28".
  function challengeWhen(ch, today) {
    var t = iso(today), st = challengeState(ch, t);
    if (st === 'upcoming') { var s = daysBetween(t, iso(ch.startsOn)); return s === 1 ? 'Starts tomorrow' : 'Starts in ' + s + ' days'; }
    if (st === 'running') { var left = daysBetween(t, iso(ch.endsOn)) + 1; return left <= 1 ? 'Ends today' : left + ' days left'; }
    return 'Ended ' + shortDate(endDay(ch));
  }
  // One lifter's row: the value now (counted to the end, or to the day the coach ended it); gain's
  // baseline is the first write's, kept. → { challengeId, athleteId, name, value, baseline }
  function challengeEntry(ch, athlete, logs, program, prev, today) {
    var base = null;
    if (ch.metric === 'gain') base = prev && num(prev.baseline) > 0 ? num(prev.baseline) : challengeBaseline(logs, ch.startsOn);
    var value = challengeValue(ch.metric, logs, { from: ch.startsOn, to: endDay(ch), today: today, program: program, baseline: base });
    return { challengeId: ch.id, athleteId: athlete.id, name: String((athlete && athlete.name) || 'Lifter').trim().slice(0, NAME_MAX) || 'Lifter',
      value: value, baseline: base };
  }

  // =====================================================================
  // The screens (the top of Club, desk and phone). Everything below touches the Store, the
  // network or the DOM. Names, challenge names and prizes are coach- or lifter-written: they only
  // ever go in as text (el's string children), never as markup.
  // =====================================================================
  function S() { return root.Store && root.Store.get ? root.Store.get() : {}; }
  function me() { return root._user || null; }
  function isDemo() { return !!root._demoMode; }
  function today() { return typeof root.todayISO === 'function' ? root.todayISO() : new Date().toISOString().slice(0, 10); }
  function E() { return root.el.apply(null, arguments); }
  function say(m) { if (typeof root.toast === 'function') root.toast(m); }
  function haptic(s) { try { if (typeof root.hapticTap === 'function') root.hapticTap(s || 'LIGHT'); } catch (e) {} }
  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || 'Your coach'; }
  function unitNow() { return typeof root.getUnit === 'function' ? root.getUnit() : 'kg'; }
  function isCoachView() { var u = me(); return !!u && u.userType !== 'athlete'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  var SVG = function (d, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 20) + '" height="' + (w || 20) + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var IC = {
    trophy: SVG('<path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 3M17 6h2.5a2.5 2.5 0 0 1-2.6 3M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>'),
    chev: '<svg class="ui-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
  };
  function challengesNow() { return S().challenges || []; }
  function entriesOf(ch) { return (S().challengeEntries || []).filter(function (e) { return e.challengeId === ch.id; }); }
  function athleteById(id) { return (S().athletes || []).filter(function (a) { return a.id === id; })[0] || null; }
  function logsBy() { var m = {}; (S().workoutLogs || []).forEach(function (l) { if (l && l.athleteId) (m[l.athleteId] = m[l.athleteId] || []).push(l); }); return m; }
  function programOf(id) { return (S().programs || []).filter(function (x) { return x.athleteId === id; })[0] || null; }
  function hueOf(name) { return typeof root.avatarHue === 'function' ? root.avatarHue(name || '?') : 0; }
  function initialsOf(name) { return typeof root.initials === 'function' ? root.initials(name || '?') : String(name || '?').slice(0, 1).toUpperCase(); }
  function avatar(name, url) {
    var a = E('span', { class: 'ui-av chl-av av-h' + hueOf(name), 'data-name': name || '?', 'aria-hidden': 'true' });
    if (url && /^https:\/\//.test(String(url))) { var img = document.createElement('img'); img.src = url; img.alt = ''; a.appendChild(img); }
    else a.textContent = initialsOf(name);
    return a;
  }
  // The rows a board shows: entries ranked, the coach's roster naming them (a lifter who left keeps the
  // name on their entry), the signed-in lifter's own value live from their logs.
  function boardRows(ch, opts) {
    opts = opts || {};
    var u = me(), list = entriesOf(ch).map(function (e) { return Object.assign({}, e); });
    if (opts.live) {
      var i = list.findIndex(function (e) { return e.athleteId === opts.live.athleteId; });
      if (i >= 0) list[i] = Object.assign({}, list[i], opts.live); else list.push(opts.live);
    }
    list.forEach(function (e) {
      var a = athleteById(e.athleteId);
      if (a && a.name) e.name = a.name;
      if (a && a.avatarUrl) e.avatarUrl = a.avatarUrl;
      e.mine = !!(u && e.athleteId === u.id);
    });
    return rankChallenge(list);
  }
  function whoText(ch) {
    var n = (ch.memberIds || []).length, team = ch.teamName;
    if (!isCoachView()) return plural(n, 'lifter');
    return team ? team + ' · ' + plural(n, 'lifter') : 'All ' + plural(n, 'lifter');
  }
  function metaText(ch) {
    var bits = [whoText(ch), challengeWhen(ch, today())];
    if (ch.prize) bits.push('Prize: ' + ch.prize);
    return bits.join(' · ');
  }

  // ---------- one board row: place, face, name, value ----------
  function rowEl(r, ch, i) {
    var li = E('li', { class: 'chl-row' + (r.mine ? ' is-me' : '') + (r.rank === 1 ? ' is-first' : ''), style: '--i:' + Math.min(i, 7) });
    li.appendChild(E('span', { class: 'chl-rank', 'aria-label': r.rank ? ordinal(r.rank) + ' place' : 'No place yet' }, r.rank ? String(r.rank) : ''));
    li.appendChild(avatar(r.name, r.avatarUrl));
    li.appendChild(E('span', { class: 'chl-name' }, r.mine ? 'You' : (r.name || 'Lifter')));
    li.appendChild(E('span', { class: 'chl-val' }, challengeText(ch.metric, r.value, unitNow())));
    return li;
  }
  // opts.group: four or more sharing a place fold into one row ("+9 · Amara, Elena and 9 more · 7
  // sessions") that opens in place, so a team that all trains as written stays calm at 25 or 60;
  // your own row is never folded away.
  function rowsEl(rows, ch, max, opts) {
    var ol = E('ol', { class: 'chl-rows', 'aria-label': ch.name + ': places' });
    var list = rows.slice(0, max || rows.length), k = 0, i = 0;
    while (i < list.length) {
      var j = i;
      while (j + 1 < list.length && list[i].rank != null && list[j + 1].rank === list[i].rank) j++;
      var same = list.slice(i, j + 1);
      if (opts && opts.group && same.length >= 4) {
        same.filter(function (r) { return r.mine; }).forEach(function (r) { ol.appendChild(rowEl(r, ch, k++)); });
        ol.appendChild(tieEl(same.filter(function (r) { return !r.mine; }), ch, k++, same.some(function (r) { return r.mine; })));
      } else same.forEach(function (r) { ol.appendChild(rowEl(r, ch, k++)); });
      i = j + 1;
    }
    return ol;
  }
  function tieEl(group, ch, i, withMe) {
    var names = group.map(function (r) { return firstName(r.name); });
    var shown = names.slice(0, 2).join(', ') + ' and ' + (names.length - 2) + ' more';
    var li = E('li', { class: 'chl-row chl-tie', style: '--i:' + Math.min(i, 7) });
    var b = E('button', { type: 'button', class: 'chl-tie-btn', 'aria-expanded': 'false',
      'aria-label': (withMe ? 'Level with you: ' : '') + group.length + ' lifters share ' + ordinal(group[0].rank) + ' place on ' + challengeText(ch.metric, group[0].value, unitNow()) + '. Show them' },
      E('span', { class: 'chl-rank' }, String(group[0].rank)), E('span', { class: 'chl-more', 'aria-hidden': 'true' }, '+' + group.length),
      E('span', { class: 'chl-name' }, (withMe ? 'Level with you: ' : '') + shown), E('span', { class: 'chl-val' }, challengeText(ch.metric, group[0].value, unitNow())));
    b.addEventListener('click', function () {
      var frag = document.createDocumentFragment();
      group.forEach(function (r, n) { frag.appendChild(rowEl(r, ch, n)); });
      li.replaceWith(frag);
    });
    li.appendChild(b);
    return li;
  }

  // ---------- the board, whole: a sheet ----------
  function openBoard(ch) {
    if (typeof root.uiSheet !== 'function') return;
    var coach = isCoachView(), st = challengeState(ch, today());
    var rows = boardRows(ch, { live: coach ? null : myLive(ch) });
    root.uiSheet(ch.name, function (sheet, close) {
      sheet.classList.add('chl-sheet');
      sheet.appendChild(E('p', { class: 'ui-sheet-sub chl-sub' }, metaText(ch)));
      if (st === 'upcoming') sheet.appendChild(E('p', { class: 'chl-note' }, 'The board fills from ' + shortDate(ch.startsOn) + '.'));
      if (rows.length) sheet.appendChild(rowsEl(rows, ch, 0, { group: true }));
      else if (st !== 'upcoming') sheet.appendChild(E('p', { class: 'chl-note' }, 'Nobody on the board yet: it fills as they train.'));
      var none = rows.filter(function (r) { return r.rank == null; }).length;
      if (none && ch.metric === 'gain') sheet.appendChild(E('p', { class: 'chl-note' }, 'No value yet: no total in the 8 weeks before it started.'));
      if (none && ch.metric === 'asWritten') sheet.appendChild(E('p', { class: 'chl-note' }, 'No value yet: no block, or nothing planned so far.'));
      if (!coach) sheet.appendChild(E('p', { class: 'chl-note' }, 'Names and values only: nobody sees your sessions.'));
      if (coach && st !== 'ended') {
        var end = E('button', { type: 'button', class: 'ui-text-btn danger chl-end' }, 'End challenge');
        end.addEventListener('click', function () { close(); setTimeout(function () { confirmEnd(ch); }, 220); });
        sheet.appendChild(end);
      }
    }, { cls: 'chl-board-sheet' });
  }
  function confirmEnd(ch) {
    if (typeof root.uiActionSheet !== 'function') return;
    root.uiActionSheet('End ' + ch.name + ' now? The board keeps today\'s places.', [
      { label: 'End challenge', danger: true, onClick: function () { endIt(ch); } }
    ]);
  }
  function endIt(ch) {
    var put = function (at) {
      if (root.Store) root.Store.update(function (x) { (x.challenges || []).forEach(function (c) { if (c.id === ch.id) c.endedAt = at; }); });
      say('Challenge ended'); haptic('MEDIUM'); refresh();
    };
    if (isDemo() || !root.DB || !root.DB.endChallenge) { put(new Date().toISOString()); return; }
    root.DB.endChallenge(ch).then(function (r) { if (r && r.ok) put(r.endedAt); else say('Couldn\'t end it. Try again'); });
  }

  // ---------- the coach: the card at the top of Club ----------
  function rosterNow() { var u = me(); return (S().athletes || []).filter(function (a) { return !u || !a.coachId || a.coachId === u.id; }); }
  function boardCard(ch) {
    var rows = boardRows(ch), st = challengeState(ch, today());
    var card = E('div', { class: 'chl-card', role: 'group', 'aria-label': ch.name });
    var top = E('div', { class: 'chl-top' }, E('span', { class: 'chl-title' }, ch.name), E('span', { class: 'chl-when' + (st === 'upcoming' ? ' is-soon' : '') }, challengeWhen(ch, today())));
    card.appendChild(top);
    card.appendChild(E('div', { class: 'chl-meta' }, whoText(ch) + (ch.prize ? ' · Prize: ' + ch.prize : '')));
    if (st === 'upcoming') card.appendChild(E('p', { class: 'chl-note' }, 'The board fills from ' + shortDate(ch.startsOn) + '.'));
    else if (rows.length) card.appendChild(rowsEl(rows, ch, 5));
    else card.appendChild(E('p', { class: 'chl-note' }, 'The board fills as they train.'));
    var n = (ch.memberIds || []).length;
    var all = E('button', { type: 'button', class: 'chl-all' }, E('span', {}, n > 5 ? 'See all ' + n : 'See the board'));
    all.insertAdjacentHTML('beforeend', IC.chev);
    all.addEventListener('click', function () { openBoard(ch); });
    card.appendChild(all);
    return card;
  }
  function pastList(past) {
    var wrap = E('div', { class: 'chl-past' });
    var open = false;
    try { open = localStorage.getItem('powa-challenges-past') === '1'; } catch (e) {}
    var btn = E('button', { type: 'button', class: 'chl-past-btn', 'aria-expanded': open ? 'true' : 'false' }, E('span', {}, 'Past challenges'), E('span', { class: 'chl-past-n' }, String(past.length)));
    btn.insertAdjacentHTML('beforeend', IC.chev);
    var list = E('div', { class: 'chl-past-list' });
    if (!open) list.hidden = true;
    past.forEach(function (ch) {
      var rows = boardRows(ch), lead = rows.filter(function (r) { return r.rank === 1; });
      var won = lead.length ? (lead.length === 1 ? 'Won by ' + firstName(lead[0].name) : 'Shared by ' + lead.map(function (r) { return firstName(r.name); }).slice(0, 2).join(' and ') + (lead.length > 2 ? ' and ' + (lead.length - 2) + ' more' : '')) + ' · ' + challengeText(ch.metric, lead[0].value, unitNow()) : 'No winner';
      var b = E('button', { type: 'button', class: 'chl-past-row' }, E('span', { class: 'chl-past-main' }, E('span', { class: 'chl-past-name' }, ch.name), E('span', { class: 'chl-past-sub' }, won + ' · ' + challengeWhen(ch, today()))));
      b.insertAdjacentHTML('beforeend', IC.chev);
      b.addEventListener('click', function () { openBoard(ch); });
      list.appendChild(b);
    });
    btn.addEventListener('click', function () {
      open = !open; list.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      try { localStorage.setItem('powa-challenges-past', open ? '1' : '0'); } catch (e) {}
    });
    wrap.appendChild(btn); wrap.appendChild(list);
    return wrap;
  }
  function renderCoach(host) {
    var u = me(), t = today();
    var mine = challengesNow().filter(function (c) { return !u || c.coachId === u.id; });
    var live = mine.filter(function (c) { return challengeState(c, t) !== 'ended'; }).sort(function (a, b) { return a.startsOn < b.startsOn ? -1 : 1; });
    var past = mine.filter(function (c) { return challengeState(c, t) === 'ended'; }).sort(function (a, b) { return endDay(a) < endDay(b) ? 1 : -1; });
    var roster = rosterNow();
    var wrap = E('div', { class: 'chl chl-coach' });
    wrap.appendChild(E('h3', { class: 'ui-label chl-h' }, live.length > 1 ? 'Challenges' : 'Challenge'));
    if (live.length) live.forEach(function (ch) { wrap.appendChild(boardCard(ch)); });
    else {
      var empty = E('div', { class: 'chl-card chl-empty' });
      var ic = E('span', { class: 'chl-empty-ic', html: IC.trophy });
      empty.appendChild(ic);
      empty.appendChild(E('div', { class: 'chl-empty-main' },
        E('b', {}, roster.length ? 'Set your lifters a challenge' : 'Challenges are for your lifters'),
        E('span', {}, roster.length ? 'Most sessions, most PRs, the biggest gain or training as written, with a board of its own.' : 'Invite your first lifter, then set them one.')));
      wrap.appendChild(empty);
    }
    var acts = E('div', { class: 'chl-acts' });
    if (roster.length) {
      var nb = E('button', { type: 'button', class: 'chl-btn' }, 'New challenge');
      nb.addEventListener('click', function () { openNew(); });
      acts.appendChild(nb);
    } else if (typeof root.openInviteModal === 'function') {
      var inv = E('button', { type: 'button', class: 'chl-btn' }, 'Invite a lifter');
      inv.addEventListener('click', function () { root.openInviteModal(); });
      acts.appendChild(inv);
    }
    wrap.appendChild(acts);
    if (past.length) wrap.appendChild(pastList(past));
    host.innerHTML = '';
    host.appendChild(wrap);
  }

  // ---------- the lifter: "Coach's challenge" at the top of Club ----------
  function myLive(ch) {
    var u = me();
    if (!u || (ch.memberIds || []).indexOf(u.id) < 0) return null;
    var logs = (S().workoutLogs || []).filter(function (l) { return l.athleteId === u.id; });
    var prev = entriesOf(ch).filter(function (e) { return e.athleteId === u.id; })[0] || null;
    if (challengeState(ch, today()) === 'ended') return prev ? Object.assign({}, prev, { name: u.name || prev.name }) : null;
    return challengeEntry(ch, u, logs, programOf(u.id), prev, today());
  }
  function renderLifter(host) {
    var u = me(), t = today();
    host.innerHTML = '';
    if (!u || !u.coachId) return;
    var mine = challengesNow().filter(function (c) { return (c.memberIds || []).indexOf(u.id) >= 0; });
    // Running or starting soon; else the last one, for a week after it ends.
    var show = mine.filter(function (c) { return challengeState(c, t) !== 'ended'; });
    if (!show.length) show = mine.filter(function (c) { return challengeState(c, t) === 'ended' && daysBetween(endDay(c), t) <= 7; }).slice(0, 1);
    if (!show.length) return;
    var coach = (S().coaches || []).filter(function (c) { return c.id === u.coachId; })[0];
    var wrap = E('div', { class: 'chl chl-lifter' });
    show.forEach(function (ch) {
      var st = challengeState(ch, t), rows = boardRows(ch, { live: myLive(ch) }), mineRow = rows.filter(function (r) { return r.mine; })[0];
      var n = (ch.memberIds || []).length;
      var line = st === 'upcoming' ? 'Starts ' + shortDate(ch.startsOn) + ' · ' + plural(n, 'lifter')
        : mineRow && mineRow.rank ? (st === 'ended' ? 'You finished ' : 'You\'re ') + (rows.filter(function (r) { return r.rank === mineRow.rank; }).length > 1 ? 'tied ' : '') + ordinal(mineRow.rank) + ' of ' + n + ' · ' + challengeText(ch.metric, mineRow.value, unitNow())
        : 'You\'re on the board once you train';
      var b = E('button', { type: 'button', class: 'chl-card chl-mine', 'aria-label': 'Your coach\'s challenge' + (coach && coach.name ? ' (' + coach.name + ')' : '') + ': ' + ch.name + '. ' + line + '. ' + challengeWhen(ch, t) + '. Open the board' });
      b.appendChild(E('span', { class: 'chl-mine-ic', html: IC.trophy }));
      b.appendChild(E('span', { class: 'chl-mine-main' },
        E('span', { class: 'chl-mine-k' }, 'Coach\'s challenge · ' + challengeWhen(ch, t)),
        E('span', { class: 'chl-mine-name' }, ch.name),
        E('span', { class: 'chl-mine-line' }, line)));
      b.insertAdjacentHTML('beforeend', IC.chev);
      b.addEventListener('click', function () { openBoard(ch); });
      wrap.appendChild(b);
    });
    host.appendChild(wrap);
  }

  // ---------- New challenge (the coach) ----------
  function openNew() {
    if (typeof root.uiSheet !== 'function') return;
    var u = me(), t = today(), roster = rosterNow(), teams = (S().teams || []).filter(function (x) { return x && (x.members || []).length; });
    var st = { metric: 'sessions', who: 'all', when: 'month', from: t, to: addDays(t, 27), name: '', nameTouched: false, prize: '' };
    root.uiSheet('New challenge', function (sheet, close) {
      sheet.classList.add('chl-sheet', 'chl-new');
      // What counts: four choices, each with its one line.
      sheet.appendChild(E('div', { class: 'ui-label chl-label' }, 'What counts'));
      var grid = E('div', { class: 'chl-metrics', role: 'radiogroup', 'aria-label': 'What counts' });
      KEYS.forEach(function (k) {
        var m = METRICS[k];
        var b = E('button', { type: 'button', role: 'radio', class: 'chl-metric', 'data-k': k }, E('b', {}, m.label), E('span', {}, m.explain));
        b.addEventListener('click', function () { st.metric = k; haptic(); paint(); });
        grid.appendChild(b);
      });
      sheet.appendChild(grid);
      // Who: everyone, or one team.
      sheet.appendChild(E('div', { class: 'ui-label chl-label' }, 'Who'));
      var who = E('div', { class: 'ui-chips chl-who', role: 'radiogroup', 'aria-label': 'Who' });
      [{ k: 'all', label: 'All my lifters · ' + roster.length }].concat(teams.map(function (tm) { return { k: tm.id, label: tm.name + ' · ' + tm.members.length }; })).forEach(function (o) {
        var c = E('button', { type: 'button', role: 'radio', class: 'ui-chip', 'data-k': o.k }, o.label);
        c.addEventListener('click', function () { st.who = o.k; paint(); });
        who.appendChild(c);
      });
      sheet.appendChild(who);
      // When: this month (or next), four weeks, or the coach's own dates.
      sheet.appendChild(E('div', { class: 'ui-label chl-label' }, 'When'));
      var monthW = challengeWindow('month', t);
      var seg = E('div', { class: 'ui-seg chl-when-seg', role: 'radiogroup', 'aria-label': 'When' });
      [['month', monthW.label], ['4weeks', '4 weeks'], ['dates', 'Pick dates']].forEach(function (o) {
        var b = E('button', { type: 'button', role: 'radio', 'data-k': o[0] }, o[1]);
        b.addEventListener('click', function () { st.when = o[0]; paint(); });
        seg.appendChild(b);
      });
      sheet.appendChild(seg);
      var fromIn = E('input', { type: 'date', value: st.from, min: addDays(t, -31), 'aria-label': 'Starts' });
      var toIn = E('input', { type: 'date', value: st.to, min: addDays(t, -31), 'aria-label': 'Ends' });
      var dates = E('div', { class: 'ui-list chl-dates' }, fieldRow('Starts', fromIn), fieldRow('Ends', toIn));
      fromIn.addEventListener('change', function () { st.from = fromIn.value; paint(); });
      toIn.addEventListener('change', function () { st.to = toIn.value; paint(); });
      sheet.appendChild(dates);
      // Its name (written for them, theirs to change) and a prize if they like.
      var nameIn = E('input', { type: 'text', maxlength: '60', 'aria-label': 'Name', autocomplete: 'off' });
      var prizeIn = E('input', { type: 'text', maxlength: '80', placeholder: 'Optional', 'aria-label': 'Prize', autocomplete: 'off' });
      nameIn.addEventListener('input', function () { st.name = nameIn.value; st.nameTouched = true; paintFoot(); });
      prizeIn.addEventListener('input', function () { st.prize = prizeIn.value; });
      sheet.appendChild(E('div', { class: 'ui-list chl-fields' }, fieldRow('Name', nameIn), fieldRow('Prize', prizeIn)));
      var sum = E('p', { class: 'chl-sum', role: 'status' });
      sheet.appendChild(sum);
      var go = E('button', { type: 'button', class: 'btn btn-primary btn-block chl-go' }, 'Start challenge');
      sheet.appendChild(go);
      var win = function () {
        if (st.when === 'dates') return { from: st.from, to: st.to };
        var w = challengeWindow(st.when, t); return { from: w.from, to: w.to };
      };
      var members = function () {
        if (st.who === 'all') return roster.map(function (a) { return a.id; });
        var tm = teams.filter(function (x) { return x.id === st.who; })[0];
        return tm ? tm.members.map(function (m) { return m.athleteId; }).filter(function (id) { return roster.some(function (a) { return a.id === id; }); }) : [];
      };
      var problem = function () {
        var w = win();
        if (!iso(w.from) || !iso(w.to)) return 'Pick a start and an end';
        if (w.to < w.from) return 'It ends before it starts';
        if (daysBetween(w.from, w.to) > MAX_DAYS - 1) return 'At most 92 days';
        if (w.to < t) return 'It ends before today';
        if (!members().length) return 'Nobody to race yet';
        if (!String(st.name || '').trim()) return 'Give it a name';
        return '';
      };
      var paintFoot = function () {
        var w = win(), n = members().length, why = problem();
        sum.textContent = why || (plural(n, 'lifter') + ' · ' + shortDate(w.from) + ' to ' + shortDate(w.to) + (isDemo() ? '' : ' · they get a notification'));
        sum.classList.toggle('is-warn', !!why);
        go.disabled = !!why;
      };
      var paint = function () {
        grid.querySelectorAll('.chl-metric').forEach(function (b) { var on = b.getAttribute('data-k') === st.metric; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        who.querySelectorAll('.ui-chip').forEach(function (b) { var on = b.getAttribute('data-k') === st.who; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        seg.querySelectorAll('button').forEach(function (b) { var on = b.getAttribute('data-k') === st.when; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
        dates.hidden = st.when !== 'dates';
        var w = win();
        if (!st.nameTouched && iso(w.from)) { st.name = challengeName(st.metric, w.from, w.to); nameIn.value = st.name; }
        paintFoot();
      };
      go.addEventListener('click', function () {
        if (problem()) return;
        var w = win(), tm = st.who === 'all' ? null : teams.filter(function (x) { return x.id === st.who; })[0];
        var ch = { coachId: u.id, name: String(st.name).trim().slice(0, 60), metric: st.metric, memberIds: members().slice(0, 200), startsOn: w.from, endsOn: w.to,
          prize: String(st.prize || '').trim().slice(0, 80), teamName: tm ? tm.name : null };
        go.disabled = true; go.textContent = 'Starting…';
        start(ch).then(function (saved) {
          if (!saved) { go.disabled = false; go.textContent = 'Start challenge'; return; }
          close();
        });
      });
      paint();
    }, { cls: 'chl-new-sheet' });
  }
  function fieldRow(label, input) {
    if (typeof root._fieldRow === 'function') return root._fieldRow(label, input);
    var r = E('label', { class: 'ui-field' }); r.appendChild(E('span', { class: 'uf-label' }, label)); r.appendChild(input); return r;
  }
  // Save it, put it on the board (everyone's value now), tell the lifters. → Promise<challenge | null>
  function start(ch) {
    var u = me();
    var done = function (saved) {
      saved.teamName = ch.teamName || null;
      if (root.Store) root.Store.update(function (x) { (x.challenges = x.challenges || []).unshift(saved); });
      syncCoach({ only: saved.id });
      haptic('MEDIUM');
      say(isDemo() ? 'Challenge started (demo)' : 'Challenge started. They see it in Club');
      if (!isDemo() && !saved.local && root.DB && root.DB.sendPush) {
        var who = firstName(u && u.name);
        (saved.memberIds || []).forEach(function (id) {
          root.DB.sendPush({ toUserId: id, title: who + ' started a challenge', body: saved.name, url: '/athlete.html?tab=club', tag: 'powa-challenge-' + saved.id, category: 'program' }).catch(function () {});
        });
      }
      refresh();
      return saved;
    };
    if (isDemo() || !root.DB || !root.DB.saveChallenge) {
      return Promise.resolve(done(Object.assign({ id: 'demo-ch-' + Date.now(), createdAt: new Date().toISOString(), endedAt: null }, ch)));
    }
    return root.DB.saveChallenge(ch).then(function (r) {
      if (r && r.ok) { if (r.local) say('Saved on this device until the challenges update is installed'); return done(r.challenge); }
      say('Couldn\'t start it. Try again');
      return null;
    }, function () { say('Couldn\'t start it. Try again'); return null; });
  }

  // ---------- who writes the boards ----------
  // Same value, same name, same baseline: nothing to send.
  function sameEntry(a, b) {
    var n = function (v) { return v == null ? null : Math.round(Number(v) * 10) / 10; };
    return !!a && !!b && n(a.value) === n(b.value) && String(a.name || '') === String(b.name || '') && n(a.baseline) === n(b.baseline);
  }
  function putEntries(list) {
    if (!list.length || !root.Store) return;
    root.Store.update(function (x) {
      x.challengeEntries = x.challengeEntries || [];
      list.forEach(function (e) {
        var i = x.challengeEntries.findIndex(function (y) { return y.challengeId === e.challengeId && y.athleteId === e.athleteId; });
        if (i >= 0) x.challengeEntries[i] = Object.assign({}, x.challengeEntries[i], e); else x.challengeEntries.push(e);
      });
    });
  }
  // The coach's app: every member of every running challenge (and those ended this past week, for a
  // late log), from the logs it holds; only what changed goes up, in one request.
  function syncCoach(opts) {
    var u = me(), t = today();
    if (!u || !isCoachView()) return Promise.resolve(0);
    var by = logsBy(), changed = [];
    challengesNow().forEach(function (ch) {
      if (ch.coachId !== u.id || (opts && opts.only && ch.id !== opts.only)) return;
      var st = challengeState(ch, t);
      if (st === 'upcoming' || (st === 'ended' && daysBetween(endDay(ch), t) > 7)) return;
      var have = entriesOf(ch);
      (ch.memberIds || []).forEach(function (id) {
        var a = athleteById(id);
        if (!a) return;   // left the roster: their row stays as it was
        var prev = have.filter(function (e) { return e.athleteId === id; })[0] || null;
        var e = challengeEntry(ch, a, by[id] || [], programOf(id), prev, t);
        if (!sameEntry(e, prev)) changed.push(e);
      });
    });
    if (!changed.length) return Promise.resolve(0);
    putEntries(changed);
    if (isDemo() || !root.DB || !root.DB.upsertChallengeEntry) return Promise.resolve(changed.length);
    return root.DB.upsertChallengeEntry(changed, { coachId: u.id }).then(function () { return changed.length; }, function () { return 0; });
  }
  // The lifter's app: their own row in every challenge they're in while it runs.
  function syncMine() {
    var u = me(), t = today();
    if (!u || isCoachView() || !u.coachId) return Promise.resolve(0);
    var changed = [];
    challengesNow().forEach(function (ch) {
      if ((ch.memberIds || []).indexOf(u.id) < 0) return;
      var st = challengeState(ch, t);
      if (st === 'ended' && daysBetween(endDay(ch), t) > 1) return;
      if (st === 'upcoming') return;
      var prev = entriesOf(ch).filter(function (e) { return e.athleteId === u.id; })[0] || null;
      var e = myLive(ch);
      if (e && !sameEntry(e, prev)) changed.push(e);
    });
    if (!changed.length) return Promise.resolve(0);
    putEntries(changed);
    if (isDemo() || !root.DB || !root.DB.upsertChallengeEntry) return Promise.resolve(changed.length);
    return root.DB.upsertChallengeEntry(changed).then(function () { return changed.length; }, function () { return 0; });
  }
  var _soon = null;
  // After a logged set: the lifter's row goes up a little later (one write per burst of sets).
  function syncSoon() { clearTimeout(_soon); _soon = setTimeout(function () { syncMine(); }, 20000); }

  // ---------- the demos (?demo=1): written into the demo's Store, never the network ----------
  // The coach's: a running "November: most sessions" (four weeks, twelve days left, named for the month
  // it ends in) over the whole roster, its values from their demo logs; and last month's most PRs,
  // finished, on its final board (the team's on the laptop, where the demo has one).
  function seedCoachDemo(store, h) {
    var days = h.daysAgo, coachId = h.coachId, ids = (store.athletes || []).map(function (a) { return a.id; });
    if (!ids.length) return;
    var from = days(16), to = days(-11), pastFrom = days(47), pastTo = days(20);
    var month = function (d) { return MONTHS[Number(d.slice(5, 7)) - 1]; };
    var team = (store.teams || []).filter(function (x) { return x && (x.members || []).length >= 3; })[0];
    var pastIds = team ? team.members.map(function (m) { return m.athleteId; }).filter(function (id) { return ids.indexOf(id) >= 0; }) : ids;
    var run = { id: 'demo-ch-run', coachId: coachId, name: month(to) + ': most sessions', metric: 'sessions', memberIds: ids.slice(0, 200), startsOn: from, endsOn: to,
      prize: 'Coffee on me', createdAt: from + 'T08:00:00Z', endedAt: null };
    var past = { id: 'demo-ch-past', coachId: coachId, name: month(pastTo) + ': most PRs', metric: 'prs', memberIds: pastIds, startsOn: pastFrom, endsOn: pastTo,
      prize: '', createdAt: pastFrom + 'T08:00:00Z', endedAt: null, teamName: team ? team.name : null };
    var by = {}; (store.workoutLogs || []).forEach(function (l) { (by[l.athleteId] = by[l.athleteId] || []).push(l); });
    var entries = [];
    [run, past].forEach(function (ch) {
      ch.memberIds.forEach(function (id) {
        var a = (store.athletes || []).filter(function (x) { return x.id === id; })[0];
        var prog = (store.programs || []).filter(function (x) { return x.athleteId === id; })[0] || null;
        entries.push(challengeEntry(ch, a || { id: id, name: 'Lifter' }, by[id] || [], prog, null, days(0)));
      });
    });
    // A month of PRs on the laptop's sixteen is thin in the demo's logs: the board keeps what they lifted,
    // and the lifters with a PR shape in their block carry the month (Leo, Sofia), the rest a few each.
    entries.filter(function (e) { return e.challengeId === past.id; }).forEach(function (e, i) {
      if (!(e.value > 0)) e.value = [3, 1, 2, 0, 4, 1, 2, 3, 0, 1, 2, 1, 5, 2, 1, 0, 2, 1, 3, 1][i % 20];
    });
    store.challenges = [run, past];
    store.challengeEntries = entries;
  }
  // The coached lifter's: the same challenge from their side, twelve on the board. Their own row comes
  // from their log (Mon / Wed / Fri: 7 in the 17 days so far); the others are their coach's lifters.
  function seedLifterDemo(store, h) {
    var days = h.daysAgo, me0 = h.athleteId, coachId = h.coachId;
    var from = days(16), to = days(-11);
    var others = [['demo-a10', 'Dev Patel', 9], ['demo-a5', 'Leo Grant', 8], ['demo-a1', 'Arjun Mehta', 6], ['demo-a12', 'Sofia Alvarez', 6], ['demo-a6', 'Priya Shah', 5],
      ['demo-a7', 'Marcus Doyle', 5], ['demo-a8', 'Elena Rossi', 4], ['demo-a2', 'Sarah Kim', 3], ['demo-a9', 'Mei Tanaka', 3], ['demo-a3', 'Tom Boyle', 2], ['demo-a4', 'Nina Petrova', 1]];
    var run = { id: 'demo-ch-run', coachId: coachId, name: MONTHS[Number(to.slice(5, 7)) - 1] + ': most sessions', metric: 'sessions',
      memberIds: [me0].concat(others.map(function (o) { return o[0]; })), startsOn: from, endsOn: to, prize: 'Coffee on me', createdAt: from + 'T08:00:00Z', endedAt: null };
    store.challenges = [run];
    store.challengeEntries = others.map(function (o) { return { challengeId: run.id, athleteId: o[0], name: o[1], value: o[2], baseline: null }; });
  }

  // ---------- render ----------
  var _host = null;
  function render(host) {
    _host = host || _host || (hasDom ? document.getElementById('challengeArea') : null);
    if (!_host || !root.el) return;
    if (isCoachView()) { syncCoach(); renderCoach(_host); }
    else { syncMine(); renderLifter(_host); }
  }
  function refresh() { if (_host && hasDom && document.body.contains(_host)) render(_host); }
  // The coach's boards come up to date a moment after the app opens (it holds every lifter's logs).
  function boot() {
    if (!hasDom || !me()) return;
    if (isCoachView()) setTimeout(function () { syncCoach(); }, 2500);
    else setTimeout(function () { syncMine(); }, 3000);
  }
  if (hasDom && typeof document !== 'undefined') {
    var bootTry = 0, waitBoot = function () { if (me() && root.Store) boot(); else if (++bootTry < 60) setTimeout(waitBoot, 250); };
    if (typeof setTimeout === 'function' && typeof location !== 'undefined' && /^https?:|^capacitor:/.test(String(location.protocol || ''))) setTimeout(waitBoot, 400);
  }

  var pure = { METRICS: METRICS, KEYS: KEYS, MAX_DAYS: MAX_DAYS, challengeValue: challengeValue, challengeBaseline: challengeBaseline, rankChallenge: rankChallenge,
    challengeText: challengeText, challengeWindow: challengeWindow, challengeName: challengeName, challengeState: challengeState, challengeWhen: challengeWhen,
    challengeEntry: challengeEntry, ordinal: ordinal, sessionsPerWeek: sessionsPerWeek, addDays: addDays, daysBetween: daysBetween };
  Object.assign(root, { challengeValue: challengeValue, rankChallenge: rankChallenge, challengeText: challengeText });
  return Object.assign({ pure: pure, render: render, refresh: refresh, openNew: openNew, openBoard: openBoard, syncCoach: syncCoach, syncMine: syncMine, syncSoon: syncSoon,
    seedCoachDemo: seedCoachDemo, seedLifterDemo: seedLifterDemo }, pure);
})();
(typeof window !== 'undefined' ? window : globalThis).Challenges = Challenges;
