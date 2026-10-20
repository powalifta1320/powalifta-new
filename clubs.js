/* =====================================================================
 * POWALIFTA clubs.js — the CLUB tab (both dashboards).
 * ---------------------------------------------------------------------
 * Clubs are the social, non-coaching side of the app: a gym team / uni club /
 * barbell club. Two views once you're in one:
 *   · FEED  — members share a set, a PR or a whole session with the club
 *             (club_posts). One red thing on the screen: the composer's +.
 *   · BOARD — the shared leaderboard (DOTS or this week), built from the one
 *             stats row each member shares (name, sex, bodyweight, best
 *             competition-equivalent S/B/D, total, DOTS, this week's sessions
 *             + tonnage). Never a program or a raw log.
 * Not in a club yet: FIND — search every club by name or city; public clubs
 * join on a tap, private ones take a request the owner answers. A 6-character
 * code still joins any club directly (a code is an invitation).
 * No coach link, no tier limits, nothing to buy.
 *
 * Loaded after app.js + db.js on athlete.html and coach.html. Data layer
 * (db.js): getMyClub / searchClubs / joinOrRequestClub / cancelClubRequest /
 * listClubRequests / respondClubRequest / listClubPosts / createClubPost /
 * deleteClubPost / reportClubPost / blockLifter + the v1 calls, over
 * sql/migration-clubs.sql + sql/migration-clubs-social.sql. Every read fails
 * soft, so before the migrations run the tab still renders (the feed says it
 * is coming; search falls back to the public list). ?demo=1 runs entirely on
 * local seed data and never touches the network.
 * ===================================================================== */
(function () {
  'use strict';

  let _data = null;        // { club, role, members } | null (not in a club)
  let _loaded = false;
  let _mode = (() => { try { return localStorage.getItem('powa-club-board') || 'week'; } catch (e) { return 'week'; } })();   // board: 'week' | 'improved' | 'dots'
  let _view = 'feed';      // club view: 'feed' | 'board'
  let _posts = null;       // club posts, newest first | null (feed not switched on)
  let _requests = [];      // owner/admin: pending requests to join
  let _buddies = [];       // club_buddies rows I'm in (pending either way, or active)
  let _container = null;
  let _dirSeq = 0;         // drops stale directory searches
  let _unsubFeed = null;   // live feed channel teardown
  let _morePosts = null;   // false once an older-posts page comes back short
  let _feedClubId = null;
  let _codeSheetShown = false;
  let _reacts = {};        // postId → [{ userId, reaction }] (club_post_reactions)
  let _unsubReacts = null; // live reactions channel teardown

  const MAIN = ['squat', 'bench', 'deadlift'];
  const me = () => window._user || (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
  const isDemo = () => !!window._demoMode;
  const firstName = (n) => String(n || 'Lifter').trim().split(/\s+/)[0];
  const shortName = (n) => { const s = String(n || 'your club'); return s.length > 22 ? s.slice(0, 21) + '…' : s; };

  const SVG = (d, extra) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + (extra || '') + '>' + d + '</svg>';
  const IC = {
    search: SVG('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    lock: SVG('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    key: SVG('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>'),
    plus: SVG('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.4"'),
    flag: SVG('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    block: SVG('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
    trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4h6v3"/>'),
    feed: SVG('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>'),
    people: SVG('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    share: SVG('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>'),
    trophy: SVG('<path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 5h12v6a6 6 0 0 1-12 0V5zM12 17v4M9 21h6"/>'),
    check: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="2.4"'),
    crown: SVG('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>', ' stroke-width="1.8"'),
    star: SVG('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>')
  };

  // ---- dates ---------------------------------------------------------------
  const isoLocal = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  // Monday of the current week, local time, YYYY-MM-DD (the week a club pulse covers).
  function mondayISO(d) {
    const x = d ? new Date(d) : new Date();
    const day = (x.getDay() + 6) % 7;            // Mon = 0
    x.setDate(x.getDate() - day);
    return isoLocal(x);
  }
  function isoDaysAgo(n, today) {
    const x = today ? new Date(today + 'T12:00:00') : new Date();
    x.setDate(x.getDate() - n);
    return isoLocal(x);
  }
  function dayLabel(iso) {
    const t = isoLocal(new Date());
    if (iso === t) return 'Today';
    if (iso === isoDaysAgo(1)) return 'Yesterday';
    return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // The one row this lifter shares with their club, computed from their own Store data.
  function myClubStats() {
    const u = me(); if (!u) return null;
    const sex = typeof getSexPref === 'function' ? getSexPref() : 'male';
    const bw = typeof latestBodyweight === 'function' ? latestBodyweight(u.id) : null;
    const best = (lift) => { try { return bestE1RM(u.id, lift) || 0; } catch (e) { return 0; } };
    const sq = best('squat'), bn = best('bench'), dl = best('deadlift');
    const total = sq + bn + dl;
    const dots = (bw && total > 0) ? dotsScore(total, bw, sex) : 0;
    const wk = mondayISO();
    const all = ((Store.get().workoutLogs) || []).filter(l => l.athleteId === u.id);
    const logs = all.filter(l => l.date >= wk);
    const r1 = (v) => (v > 0 ? Math.round(v * 10) / 10 : null);
    const score = clubWeekScore(all, wk);
    const season = seasonOf(wk);
    return {
      displayName: u.name || 'Lifter', sex,
      instagram: u.instagram || null,
      tiktok: u.tiktok || null,
      bodyweightKg: bw ? Math.round(bw * 10) / 10 : null,
      squatKg: r1(sq), benchKg: r1(bn), deadliftKg: r1(dl), totalKg: r1(total), dots: r1(dots),
      weekStart: wk,
      weekSessions: new Set(logs.map(l => l.date)).size,
      weekTonnageKg: Math.round(logs.reduce((a, l) => a + (Number(l.weight) || 0) * (Number(l.reps) || 0), 0)),
      // The fair boards (migration-boards-tiktok.sql): points, PRs + hard sets this week, 4-week improvement.
      weekPoints: score.points, weekPrs: score.prs, weekHardSets: score.hardSets,
      improvePct: clubImprovePct(all),
      // Season board: this season so far + last season's final (for the champion).
      seasonId: season.id,
      seasonPoints: clubSeasonScore(all, season.start, wk),
      prevSeasonPoints: clubSeasonScore(all, isoDaysAgo(SEASON_WEEKS * 7, season.start), isoDaysAgo(7, season.start))
    };
  }

  // ---- pure helpers (unit-tested in tests.html) -------------------------------
  // THREE BOARDS. Ranked by DOTS alone, the same strong lifters win every week,
  // so the default board is one anyone can win:
  //   'week'     points this week — turn up, work hard, beat your own best
  //   'improved' how far your maxes moved in 4 weeks vs YOUR earlier best (%)
  //   'dots'     strongest for their bodyweight (all-time)
  const BOARD_MODES = ['week', 'season', 'improved', 'dots'];
  // Points: 10 a session (5 count), 1 a hard set (RPE 7+, 30 count), 15 a PR.
  const POINTS = { session: 10, sessionCap: 5, hardSet: 1, hardSetCap: 30, pr: 15 };

  // My week, scored from my own logs. A PR = a main lift's best competition-
  // equivalent e1RM this week beats everything logged before this week (your
  // first week has nothing to beat yet, so it can't be a PR).
  function clubWeekScore(logs, weekStart) {
    const wk = weekStart || mondayISO();
    const end = isoDaysAgo(-7, wk);                        // the Monday after
    const all = (logs || []).filter(l => l && l.lift !== 'cardio');
    const week = all.filter(l => l.date >= wk && l.date < end);
    const sessions = new Set(week.map(l => l.date)).size;
    const hardSets = week.filter(l => Number(l.rpe) >= 7 && Number(l.weight) > 0).length;
    const best = (ls) => ls.reduce((a, l) => Math.max(a, Number(l.e1rmComp) || 0), 0);
    let prs = 0;
    MAIN.forEach(lift => {
      const before = best(all.filter(l => l.lift === lift && l.date < wk));
      const now = best(week.filter(l => l.lift === lift));
      if (before > 0 && now > before + 0.01) prs++;
    });
    const points = Math.min(sessions, POINTS.sessionCap) * POINTS.session +
      Math.min(hardSets, POINTS.hardSetCap) * POINTS.hardSet + prs * POINTS.pr;
    return { points, sessions, hardSets, prs };
  }

  // Most improved: per main lift, your best competition-equivalent e1RM in the
  // last `days` vs your best before that. New lifters (nothing older) compare
  // with their first session, once a week separates the two. Average of the
  // lifts with data, as a % with one decimal; null = not enough history.
  function clubImprovePct(logs, today, days) {
    days = days || 28;
    const t = today || isoLocal(new Date());
    const from = isoDaysAgo(days, t);
    const gains = [];
    MAIN.forEach(lift => {
      const ls = (logs || []).filter(l => l && l.lift === lift && Number(l.e1rmComp) > 0 && l.date <= t);
      const recent = ls.filter(l => l.date >= from);
      if (!recent.length) return;
      const top = recent.reduce((a, l) => (Number(l.e1rmComp) > Number(a.e1rmComp) ? l : a));
      const older = ls.filter(l => l.date < from);
      let base = 0;
      if (older.length) base = older.reduce((a, l) => Math.max(a, Number(l.e1rmComp)), 0);
      else {
        const firstDay = recent.reduce((a, l) => (l.date < a ? l.date : a), recent[0].date);
        if ((Date.parse(top.date) - Date.parse(firstDay)) / 86400000 < 7) return;
        base = recent.filter(l => l.date === firstDay).reduce((a, l) => Math.max(a, Number(l.e1rmComp)), 0);
      }
      if (base > 0) gains.push(Number(top.e1rmComp) / base - 1);
    });
    if (!gains.length) return null;
    const pct = gains.reduce((a, g) => a + g, 0) / gains.length * 100;
    return Math.max(-100, Math.min(1000, Math.round(pct * 10) / 10));
  }

  // SEASONS: 8-week blocks on one calendar every club shares (season 1 began
  // Monday 5 Jan 2026), so weekly points add up and the top lifter after 8
  // weeks is champion. My season total is scored from my own logs, week by week.
  const SEASON_WEEKS = 8, SEASON_EPOCH = '2026-01-05';
  function seasonOf(weekStart) {
    const w = Math.floor((Date.parse(weekStart + 'T12:00:00Z') - Date.parse(SEASON_EPOCH + 'T12:00:00Z')) / (7 * 86400000));
    const idx = Math.floor(w / SEASON_WEEKS), inSeason = w - idx * SEASON_WEEKS;
    return { id: idx + 1, week: inSeason + 1, weeksLeft: SEASON_WEEKS - inSeason - 1, start: isoDaysAgo(-idx * SEASON_WEEKS * 7, SEASON_EPOCH) };
  }
  function clubSeasonScore(logs, seasonStart, uptoWeekStart) {
    let total = 0;
    for (let wk = seasonStart, i = 0; wk <= uptoWeekStart && i < SEASON_WEEKS; wk = isoDaysAgo(-7, wk), i++) total += clubWeekScore(logs, wk).points;
    return total;
  }
  function memberSeasonPoints(m, seasonId) {
    if (!m) return 0;
    if (m.seasonId === seasonId && m.seasonPoints != null) return Number(m.seasonPoints) || 0;
    return 0;
  }
  // Last season's total for a member, from whichever row they last synced.
  function memberPrevSeasonPoints(m, seasonId) {
    if (!m) return null;
    if (m.seasonId === seasonId && m.prevSeasonPoints != null) return Number(m.prevSeasonPoints);
    if (m.seasonId === seasonId - 1 && m.seasonPoints != null) return Number(m.seasonPoints);
    return null;
  }
  // Last season's champion: the most points, ties to whoever's first by name. null = nobody scored.
  function seasonChampion(members, seasonId) {
    const rows = (members || []).map(m => ({ m, p: memberPrevSeasonPoints(m, seasonId) })).filter(r => r.p > 0)
      .sort((a, b) => b.p - a.p || String(a.m.displayName || '').localeCompare(String(b.m.displayName || '')));
    return rows.length ? { member: rows[0].m, points: rows[0].p, seasonId: seasonId - 1 } : null;
  }

  // What a member's shared row says, read safely (rows from before a field existed).
  function memberWeekPoints(m, wk) {
    if (!m || m.weekStart !== wk) return 0;
    if (m.weekPoints != null) return Number(m.weekPoints) || 0;
    return Math.min(m.weekSessions || 0, POINTS.sessionCap) * POINTS.session;
  }
  function memberImprovePct(m, wk) {
    if (!m || m.improvePct == null || !m.weekStart) return null;
    // Two weeks without opening the app and the 4-week window has moved on.
    return (Date.parse(wk) - Date.parse(m.weekStart)) <= 14 * 86400000 ? Number(m.improvePct) : null;
  }

  // Rank members for a board. Standard competition ranking — ties share a rank,
  // the next one skips. Members with nothing to rank sit at the bottom, unranked.
  // The weekly boards never break a tie on strength (that's the whole point).
  function rankClubMembers(members, mode, weekStart) {
    const wk = weekStart || mondayISO();
    const sid = seasonOf(wk).id;
    const val = mode === 'week' ? (m) => memberWeekPoints(m, wk)
      : mode === 'season' ? (m) => memberSeasonPoints(m, sid)
      : mode === 'improved' ? (m) => memberImprovePct(m, wk)
      : (m) => m.dots || 0;
    const ranked = mode === 'improved' ? (v) => v != null : (v) => v > 0;
    const key = (m) => { const v = val(m); return ranked(v) ? v : -Infinity; };
    const tie = mode === 'dots' ? (a, b) => (b.totalKg || 0) - (a.totalKg || 0)
      : mode === 'week' ? (a, b) => (b.weekStart === wk ? b.weekSessions || 0 : 0) - (a.weekStart === wk ? a.weekSessions || 0 : 0)
      : () => 0;
    const sorted = (members || []).slice().sort((a, b) => (key(b) - key(a)) || tie(a, b) ||
      String(a.displayName || '').localeCompare(String(b.displayName || '')));
    let rank = 0, prev = null;
    return sorted.map((m, i) => {
      const k = key(m);
      if (i === 0 || k !== prev) { rank = i + 1; prev = k; }
      return Object.assign({}, m, { rank: k === -Infinity ? null : rank });
    });
  }

  // WEEKLY CHALLENGE: a different one every Monday, all things anyone can win —
  // most sessions, most hard sets, most PRs. Scored only from what the club
  // already shares. Pure: unit-tested in tests.html.
  const CHALLENGES = [
    { key: 'sessions', title: 'Most sessions', val: (m, wk) => (m.weekStart === wk ? (m.weekSessions || 0) : 0) },
    { key: 'hardsets', title: 'Most hard sets', val: (m, wk) => (m.weekStart === wk ? (m.weekHardSets || 0) : 0) },
    { key: 'prs', title: 'Most PRs', val: (m, wk, posts) => (m.weekStart === wk && m.weekPrs != null) ? m.weekPrs
      : (posts || []).filter(p => p.userId === m.userId && p.kind === 'pr' && String(p.createdAt || '').slice(0, 10) >= wk).length }
  ];
  function weekChallenge(members, posts, weekStart) {
    const weekNo = Math.floor(Date.parse(weekStart + 'T12:00:00Z') / (7 * 86400000));
    const c = CHALLENGES[((weekNo % CHALLENGES.length) + CHALLENGES.length) % CHALLENGES.length];
    const rows = (members || []).map(m => ({ m, v: c.val(m, weekStart, posts) })).filter(r => r.v > 0)
      .sort((a, b) => b.v - a.v || String(a.m.displayName || '').localeCompare(String(b.m.displayName || '')));
    let rank = 0, prev = null;
    rows.forEach((r, i) => { if (r.v !== prev) { rank = i + 1; prev = r.v; } r.rank = rank; });
    return { key: c.key, title: c.title, rows };
  }
  function challengeValueText(key, v) {
    if (key === 'hardsets') return v + (v === 1 ? ' hard set' : ' hard sets');
    if (key === 'prs') return v + (v === 1 ? ' PR' : ' PRs');
    return v + (v === 1 ? ' session' : ' sessions');
  }

  function clubWeekPulse(members, weekStart) {
    const wk = weekStart || mondayISO();
    const cur = (members || []).filter(m => m.weekStart === wk);
    return {
      sessions: cur.reduce((a, m) => a + (m.weekSessions || 0), 0),
      tonnageKg: cur.reduce((a, m) => a + (m.weekTonnageKg || 0), 0),
      active: cur.filter(m => (m.weekSessions || 0) > 0).length,
      total: (members || []).length
    };
  }

  // The sets worth sharing: the last `days` days, the best set (highest
  // competition-equivalent e1RM) per lift/exercise per day, newest day first,
  // heaviest first within a day. Weighted sets only.
  function shareableSets(logs, userId, opts) {
    opts = opts || {};
    const cutoff = isoDaysAgo(opts.days || 14, opts.today);
    const best = new Map();
    const score = (l) => Number(l.e1rmComp || l.e1rm) || 0;
    (logs || []).forEach(l => {
      if (!l || l.athleteId !== userId || !(l.date >= cutoff)) return;
      if (!(Number(l.weight) > 0) || !(Number(l.reps) > 0) || l.lift === 'cardio') return;
      const key = l.date + '|' + l.lift + '|' + (l.variant || '') + '|' + (l.exerciseName || '');
      const cur = best.get(key);
      if (!cur || score(l) > score(cur)) best.set(key, l);
    });
    return [...best.values()]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || score(b) - score(a))
      .slice(0, opts.limit || 12);
  }

  // One day's training for a "session" post: sets, tonnage, and a name from
  // the main lift with the most sets ("Squat day"), else "Training session".
  function sessionSummary(logs, userId, date) {
    const day = (logs || []).filter(l => l && l.athleteId === userId && l.date === date);
    const byLift = {};
    day.forEach(l => { if (MAIN.includes(l.lift)) byLift[l.lift] = (byLift[l.lift] || 0) + 1; });
    const top = Object.keys(byLift).sort((a, b) => byLift[b] - byLift[a])[0];
    const label = (typeof LIFT_LABELS !== 'undefined' && top) ? LIFT_LABELS[top] + ' day' : 'Training session';
    return {
      sets: day.length,
      tonnageKg: Math.round(day.reduce((a, l) => a + (Number(l.weight) || 0) * (Number(l.reps) || 0), 0)),
      name: label
    };
  }

  function logTitle(l) {
    const labels = typeof LIFT_LABELS !== 'undefined' ? LIFT_LABELS : {};
    if (MAIN.includes(l.lift)) return ((l.variant || 'Competition') + ' ' + (labels[l.lift] || l.lift)).trim();
    return l.exerciseName || labels[l.lift] || 'Lift';
  }
  const w1 = (kg) => { const v = kgToDisplay(kg, 1); return v == null ? '–' : String(v); };
  const setLine = (l) => w1(l.weight) + ' ' + unitLabel() + ' × ' + l.reps + (l.rpe ? ' · RPE ' + l.rpe : '');
  function tonnageParts(kg) {
    const v = kgToDisplay(kg) || 0;
    if (v >= 10000) return { num: (Math.round(v / 100) / 10).toLocaleString(), unit: getUnit() === 'lbs' ? 'k lb' : 't' };
    return { num: Math.round(v).toLocaleString(), unit: unitLabel() };
  }
  const tonnageText = (kg) => { const t = tonnageParts(kg); return t.num + (t.unit === 'k lb' ? 'k lb' : ' ' + t.unit); };

  // ---- demo seed (?demo=1) ---------------------------------------------------
  function demoClubData() {
    const wk = mondayISO();
    const u = me() || { id: 'demo-athlete', name: 'Demo Lifter' };
    const mine = Object.assign({ clubId: 'demo-club', userId: u.id, role: 'member' }, myClubStats() || {});
    // name, sex, bw, squat, bench, deadlift, sessions, tonnage, hard sets, PRs, 4-week gain %.
    // Different lifters lead each board: Nina this week, Priya most improved, the heavies on DOTS.
    const seed = [
      ['Sarah Kim', 'female', 62.4, 145, 82.5, 172.5, 4, 9850, 18, 1, 3.1],
      ['Arjun Mehta', 'male', 82.1, 215, 140, 250, 3, 14200, 14, 0, 0.8],
      ['Tom Boyle', 'male', 104.6, 240, 160, 310, 1, 5200, 5, 0, -1.2],
      ['Nina Petrova', 'female', 71.8, 150, 87.5, 185, 5, 11800, 24, 2, 4.6],
      ['Marcus Hale', 'male', 92.7, 230, 187.5, 270, 2, 9100, 10, 0, 0.4],
      ['Priya Shah', 'female', 56.9, 120, 67.5, 150, 3, 6400, 16, 2, 9.8],
      ['Jonah Reyes', 'male', 74.3, 190, 125, 225, 4, 12300, 20, 1, 2.2],
      ['Ella Nowak', 'female', 83.5, 165, 95, 195, 0, 0, 0, 0, 6.5],
      ['Kofi Mensah', 'male', 119.2, 275, 185, 300, 2, 13100, 9, 0, 0.6]
    ];
    const members = seed.map((s, i) => {
      const total = s[3] + s[4] + s[5];
      return {
        clubId: 'demo-club', userId: 'demo-m' + i, role: i === 1 ? 'owner' : 'member',
        displayName: s[0], sex: s[1], bodyweightKg: s[2], squatKg: s[3], benchKg: s[4], deadliftKg: s[5],
        totalKg: total, dots: Math.round(dotsScore(total, s[2], s[1]) * 10) / 10,
        weekStart: wk, weekSessions: s[6], weekTonnageKg: s[7],
        weekHardSets: s[8], weekPrs: s[9], improvePct: s[10],
        // Seasons: this season = this week + a usual week for each week before it
        // (so the totals always add up); Priya (newer, lighter) won the last one.
        seasonId: seasonOf(wk).id,
        seasonPoints: Math.min(s[6], POINTS.sessionCap) * POINTS.session + Math.min(s[8], POINTS.hardSetCap) + s[9] * POINTS.pr +
          [60, 45, 20, 85, 35, 70, 62, 40, 30][i] * (seasonOf(wk).week - 1),
        prevSeasonPoints: [520, 480, 210, 590, 400, 615, 505, 380, 430][i],
        weekPoints: Math.min(s[6], POINTS.sessionCap) * POINTS.session + Math.min(s[8], POINTS.hardSetCap) + s[9] * POINTS.pr,
        instagram: ['sarah.lifts', 'arjun.pulls', null, 'nina.deadlifts', 'marcus.benches', null, 'jonah.squats', null, 'kofi.totals'][i] || null,
        tiktok: ['sarahkim.lifts', null, null, 'nina.pulls', null, 'priya.lifts', 'jonah.lifts', null, null][i] || null
      };
    });
    members.push(mine);
    return {
      club: { id: 'demo-club', name: 'Iron Temple Barbell', city: 'Leeds', description: 'Thursday heavy night. Chalk is free.',
        code: 'IRNTMP', visibility: 'public', ownerId: 'demo-m1', memberCount: members.length },
      role: 'member', members
    };
  }
  function demoPosts() {
    if (window._demoClubPosts) return window._demoClubPosts;
    const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
    const P = (i, name, mins, f) => Object.assign({ id: 'demo-p' + i, clubId: 'demo-club', userId: 'demo-m' + i, displayName: name, createdAt: ago(mins) }, f);
    window._demoClubPosts = [
      P(3, 'Nina Petrova', 38, { kind: 'pr', lift: 'deadlift', exercise: 'Competition Deadlift', weightKg: 175, reps: 2, rpe: 9, e1rmKg: 190.4, caption: 'Finally. Hips stayed down the whole way.' }),
      P(1, 'Arjun Mehta', 140, { kind: 'set', lift: 'bench', exercise: 'Pause Bench', weightKg: 122.5, reps: 3, rpe: 8, e1rmKg: 150.2, caption: 'Long pause, still moving.' }),
      P(6, 'Jonah Reyes', 300, { kind: 'session', exercise: 'Squat day', setsCount: 17, tonnageKg: 9400, caption: 'Volume Thursday done. Legs gone.' }),
      P(0, 'Sarah Kim', 1500, { kind: 'set', lift: 'squat', exercise: 'Competition Squat', weightKg: 130, reps: 4, rpe: 8.5, e1rmKg: 150.6, caption: '' }),
      P(8, 'Kofi Mensah', 2900, { kind: 'pr', lift: 'squat', exercise: 'Competition Squat', weightKg: 260, reps: 1, rpe: 9.5, e1rmKg: 268.7, caption: 'Comp is in 5 weeks.' })
    ];
    return window._demoClubPosts;
  }
  function demoDirectory() {
    const req = window._demoClubRequested || {};
    return [
      { id: 'demo-club', name: 'Iron Temple Barbell', city: 'Leeds', memberCount: 10, visibility: 'public', code: 'IRNTMP' },
      { id: 'demo-ucl', name: 'UCL Powerlifting', city: 'London', memberCount: 41, visibility: 'private' },
      { id: 'demo-nrth', name: 'Northside Strength', city: 'Manchester', memberCount: 23, visibility: 'public', code: 'NRTHSD' },
      { id: 'demo-gls', name: 'Glasgow Barbell Club', city: 'Glasgow', memberCount: 17, visibility: 'private' },
      { id: 'demo-sbd', name: 'Sunday SBD', city: 'Bristol', memberCount: 8, visibility: 'public', code: 'SNDSBD' }
    ].map(c => Object.assign({ myStatus: req[c.id] ? 'requested' : null }, c));
  }

  // ---- reactions ---------------------------------------------------------------
  function demoReacts() {
    if (window._demoPostReacts) return window._demoPostReacts;
    const r = {};
    const add = (pid, arr) => { r[pid] = arr.map(([uid, k]) => ({ userId: uid, reaction: k })); };
    add('demo-p3', [['demo-m0', 'fire'], ['demo-m1', 'trophy'], ['demo-m4', 'fire'], ['demo-m6', 'strong'], ['demo-m8', 'clap'], ['demo-m5', 'fire']]);
    add('demo-p1', [['demo-m3', 'strong'], ['demo-m0', 'fire']]);
    add('demo-p6', [['demo-m1', 'clap'], ['demo-m3', 'strong']]);
    add('demo-p0', [['demo-m3', 'fire']]);
    add('demo-p8', [['demo-m1', 'trophy'], ['demo-m3', 'fire'], ['demo-m4', 'trophy'], ['demo-m6', 'fire']]);
    window._demoPostReacts = r;
    return r;
  }
  function putReact(r) {
    if (!r || !r.postId) return;
    const arr = _reacts[r.postId] || (_reacts[r.postId] = []);
    const i = arr.findIndex(x => x.userId === r.userId);
    if (i >= 0) arr[i] = { userId: r.userId, reaction: r.reaction }; else arr.push({ userId: r.userId, reaction: r.reaction });
  }
  function reactRow(p) {
    const u = me();
    return reactionChips(reactionSummary(_reacts[p.id], u && u.id), POST_REACT_KEYS, (key) => reactToPost(p, key), { add: true, addLabel: 'React', cls: 'cp-reacts' });
  }
  function repaintReacts(postId, bumpKey) {
    if (!_container) return;
    const card = Array.prototype.find.call(_container.querySelectorAll('.cp-card'), c => c.dataset.postId === postId);
    const p = (_posts || []).find(x => x.id === postId);
    if (!card || !p) return;
    const fresh = reactRow(p);
    if (bumpKey) { const b = fresh.children[POST_REACT_KEYS.indexOf(bumpKey)]; if (b) b.classList.add('bump'); }
    const old = card.querySelector('.cp-reacts');
    if (old) old.replaceWith(fresh); else card.appendChild(fresh);
  }
  async function reactToPost(p, key) {
    const u = me(); if (!u || !_data) return;
    const before = (_reacts[p.id] || []).map(x => Object.assign({}, x));
    putReact({ postId: p.id, userId: u.id, reaction: key });
    repaintReacts(p.id, key);
    try { if (window.PowaNative && PowaNative.isNative && PowaNative.isNative()) PowaNative.haptic('LIGHT'); } catch (e) {}
    if (isDemo()) { window._demoPostReacts = _reacts; return; }
    try { await DB.setPostReaction({ postId: p.id, clubId: _data.club.id, userId: u.id, reaction: key }); }
    catch (e) { _reacts[p.id] = before; repaintReacts(p.id); toast(e.message || 'Could not react'); }
  }
  const reactTotal = (pid) => (_reacts[pid] || []).filter(r => r.reaction).length;

  // ---- load ------------------------------------------------------------------
  async function load() {
    const u = me();
    if (isDemo()) {
      _data = window._demoClubLeft ? null : demoClubData();
      _posts = _data ? demoPosts() : null;
      _reacts = _data ? demoReacts() : {};
      _requests = [];
      // Demo: Nina is your training buddy and nudged you this morning.
      if (!window._demoBuddies) window._demoBuddies = _data ? [{ id: 'demo-bud', clubId: 'demo-club', requesterId: 'demo-m3', addresseeId: (u && u.id) || 'demo-athlete', status: 'active',
        lastNudgeBy: 'demo-m3', lastNudgeAt: new Date(Date.now() - 2 * 3600000).toISOString() }] : [];
      _buddies = window._demoBuddies;
      _loaded = true; return;
    }
    if (!u || !window.DB || !DB.getMyClub) { _data = null; _loaded = true; return; }
    try { _data = await DB.getMyClub(u.id); } catch (e) { _data = null; }
    _loaded = true;
    if (_data) {
      const staff = _data.role === 'owner' || _data.role === 'admin';
      const [posts, reqs, buds] = await Promise.all([
        DB.listClubPosts ? DB.listClubPosts(_data.club.id).catch(() => null) : null,
        staff && DB.listClubRequests ? DB.listClubRequests(_data.club.id).catch(() => []) : [],
        DB.listMyBuddies ? DB.listMyBuddies().catch(() => []) : []
      ]);
      _posts = posts; _requests = reqs || []; _morePosts = null;
      _buddies = (buds || []).filter(b => b.clubId === _data.club.id);
      _reacts = {};
      if (posts && posts.length && DB.listPostReactions) {
        const rx = await DB.listPostReactions(posts.map(p => p.id)).catch(() => []);
        (rx || []).forEach(putReact);
      }
      watchFeed(_data.club.id);
      // Refresh the row this lifter shares (only when something changed since last push).
      const stats = myClubStats();
      if (stats) {
        const mineIdx = _data.members.findIndex(m => m.userId === u.id);
        const key = JSON.stringify(stats);
        let last = null; try { last = localStorage.getItem('powa-club-stats'); } catch (e) {}
        if (last !== key) {
          DB.updateMyClubStats(u.id, stats).then(ok => { if (ok) { try { localStorage.setItem('powa-club-stats', key); } catch (e) {} } });
        }
        if (mineIdx >= 0) _data.members[mineIdx] = Object.assign({}, _data.members[mineIdx], stats);
      }
    } else { _posts = null; _requests = []; _buddies = []; watchFeed(null); }
    try { localStorage.setItem('powa-club-name', _data && _data.club ? _data.club.name : ''); } catch (e) {}
  }

  // Live feed: a member's new post slides in at the top while you're looking.
  // (Your own posts arrive here too; the id check drops the echo.)
  function watchFeed(clubId) {
    if (clubId === _feedClubId) return;
    if (_unsubFeed) { try { _unsubFeed(); } catch (e) {} _unsubFeed = null; }
    if (_unsubReacts) { try { _unsubReacts(); } catch (e) {} _unsubReacts = null; }
    _feedClubId = clubId;
    if (!clubId || isDemo() || !window.DB || !DB.subscribeClubPosts) return;
    if (_unsubReacts) { try { _unsubReacts(); } catch (e) {} _unsubReacts = null; }
    if (DB.subscribePostReactions) {
      _unsubReacts = DB.subscribePostReactions(clubId, (r) => {
        const u = me();
        if (!r || (u && r.userId === u.id)) return;
        putReact(r);
        repaintReacts(r.postId);
      });
    }
    _unsubFeed = DB.subscribeClubPosts(clubId, (p) => {
      if (!p || !_posts || _posts.some(x => x.id === p.id)) return;
      p._fresh = true;
      _posts = [p].concat(_posts);
      const list = _container && _container.querySelector('.club-feed');
      if (list) list.insertBefore(postCard(p), list.firstChild);
      else if (_container && _view === 'feed' && _data) renderClub(_container);
    });
  }

  // ---- render ----------------------------------------------------------------
  async function renderClubTab(container) {
    _container = container || _container || document.getElementById('clubArea');
    if (!_container) return;
    if (!_loaded) _container.innerHTML = '<div class="ui-skel"><i style="height:190px"></i><i style="height:46px"></i><i style="height:120px"></i><i style="height:120px"></i></div>';
    await load();
    if (_data && _data.club) renderClub(_container); else renderJoin(_container);
  }

  const fmtNum = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toLocaleString());

  function segmented(opts, value, onPick, label, cls) {
    const seg = el('div', { class: 'ui-seg ' + (cls || ''), role: 'tablist', 'aria-label': label });
    opts.forEach(([k, text]) => {
      const b = el('button', { class: value === k ? 'on' : '', type: 'button', role: 'tab', 'aria-selected': value === k ? 'true' : 'false' }, text);
      b.addEventListener('click', () => { if (value !== k) onPick(k); });
      seg.appendChild(b);
    });
    return seg;
  }

  function renderClub(root) {
    const { club, role, members } = _data;
    try { localStorage.removeItem('powa-club-code'); } catch (e) {}   // already in a club
    const staff = role === 'owner' || role === 'admin';
    const wk = mondayISO();
    root.innerHTML = '';

    // The club card: crest, name + a round Invite (share) button, what it's
    // about, this week in three numbers. The red action is the composer's +.
    const pulse = clubWeekPulse(members, wk);
    const hero = el('div', { class: 'ui-hero club-hero' });
    const top = el('div', { class: 'club-hero-top' });
    top.appendChild(el('span', { class: 'club-crest', 'aria-hidden': 'true' }, initials(club.name || 'Club')));
    const idc = el('div', { class: 'club-hero-id' });
    const metaBits = [club.city, members.length + (members.length === 1 ? ' member' : ' members')].filter(Boolean).join(' · ');
    const meta = el('div', { class: 'ui-hero-label' }, metaBits);
    if (club.visibility === 'private') meta.insertAdjacentHTML('beforeend', '<span class="club-priv">' + IC.lock + 'Private</span>');
    idc.appendChild(meta);
    idc.appendChild(el('h2', { class: 'club-hero-name' }, club.name));
    top.appendChild(idc);
    const invite = el('button', { class: 'club-invite-icon', type: 'button', 'aria-label': 'Invite lifters to ' + club.name, html: IC.share });
    invite.addEventListener('click', () => openInviteSheet(club));
    top.appendChild(invite);
    hero.appendChild(top);
    if (club.description) hero.appendChild(el('p', { class: 'club-desc' }, maskUserText(club.description)));
    // Who's in this week: faces of everyone who trained, the rest stay off.
    const trained = members.filter(m => m.weekStart === wk && (m.weekSessions || 0) > 0)
      .sort((a, b) => (b.weekSessions || 0) - (a.weekSessions || 0));
    const stack = el('div', { class: 'club-stack' });
    const avs = el('span', { class: 'cs-avs', 'aria-hidden': 'true' });
    trained.slice(0, 7).forEach((m, i) => avs.appendChild(el('span', { class: 'cs-av', 'data-name': m.displayName || '?', style: '--i:' + i }, firstName(m.displayName).charAt(0).toUpperCase())));
    if (trained.length > 7) avs.appendChild(el('span', { class: 'cs-av more' }, '+' + (trained.length - 7)));
    if (trained.length) stack.appendChild(avs);
    // Calm (v7): the week is one line under the faces, not a band of three
    // numbers (and not tonnage, which is a strength contest by another name).
    const prsWeek = members.some(m => m.weekStart === wk && m.weekPrs != null)
      ? members.reduce((a, m) => a + (m.weekStart === wk ? (m.weekPrs || 0) : 0), 0)
      : (_posts || []).filter(x => x.kind === 'pr' && String(x.createdAt || '').slice(0, 10) >= wk).length;
    const sub = [pulse.sessions ? pulse.sessions + (pulse.sessions === 1 ? ' session' : ' sessions') : null,
      prsWeek ? prsWeek + (prsWeek === 1 ? ' PR' : ' PRs') : null].filter(Boolean).join(' · ');
    const txt = el('span', { class: 'cs-txt' }, trained.length
      ? (trained.length === members.length ? 'Everyone trained this week' : trained.length + ' of ' + members.length + ' trained this week')
      : 'Nobody has trained yet this week');
    if (sub) txt.appendChild(el('small', {}, sub));
    stack.appendChild(txt);
    hero.appendChild(stack);
    root.appendChild(hero);

    // Owner/admin: who's waiting to get in.
    if (staff && _requests.length) root.appendChild(requestsRow());
    const bud = buddyRow();
    if (bud) root.appendChild(bud);

    root.appendChild(segmented([['feed', 'Feed'], ['board', 'Board']], _view,
      (v) => { _view = v; renderClub(root); }, 'Club view', 'club-view-seg'));
    const body = el('div', { class: 'club-view' });
    if (_view === 'feed') renderFeed(body); else renderBoard(body);
    root.appendChild(body);

    const foot = el('div', { class: 'club-foot' });
    foot.appendChild(el('span', { class: 'club-code' }, 'Code ' + club.code));
    if (staff) {
      const manage = el('button', { class: 'club-link', type: 'button' }, 'Manage club');
      manage.addEventListener('click', () => openManageModal());
      foot.appendChild(manage);
    }
    if (role !== 'owner') {
      const leave = el('button', { class: 'club-link', type: 'button' }, 'Leave');
      leave.addEventListener('click', () => leaveClub());
      foot.appendChild(leave);
      const report = el('button', { class: 'club-link', type: 'button' }, 'Report');
      report.addEventListener('click', () => reportClub(club));
      foot.appendChild(report);
    }
    root.appendChild(foot);
  }

  // ---- FEED ------------------------------------------------------------------
  function renderFeed(root) {
    const u = me();
    if (_posts === null) {
      root.appendChild(uiEmpty({ icon: IC.feed, title: 'The club feed is almost here',
        text: 'Sharing lifts switches on with the next update. The board works now.',
        secondary: { label: 'See the board', onClick: () => { _view = 'board'; renderClub(_container); } } }));
      return;
    }
    // Composer: you, a prompt, and the one red + on the screen.
    const comp = el('button', { class: 'club-compose', type: 'button', 'aria-label': 'Share a lift with ' + _data.club.name });
    comp.appendChild(el('span', { class: 'cp-av', 'data-name': (u && u.name) || 'You' }, initials((u && u.name) || 'You')));
    comp.appendChild(el('span', { class: 'cc-text' }, 'Share a lift with ' + shortName(_data.club.name)));
    comp.appendChild(el('span', { class: 'cc-plus', html: IC.plus }));
    comp.addEventListener('click', () => openShareSheet());
    root.appendChild(comp);

    if (!_posts.length) {
      root.appendChild(uiEmpty({ icon: IC.feed, title: 'No posts yet', text: 'Share your best set this week and get the club going.' }));
      return;
    }
    const spot = liftOfTheWeek();
    if (spot) root.appendChild(spot);
    const list = el('div', { class: 'club-feed' });
    _posts.forEach((p, i) => { const c = postCard(p); c.style.setProperty('--i', String(Math.min(i, 8))); list.appendChild(c); });
    root.appendChild(list);
    // Pages of 40: offer the next page while the last fetch came back full.
    if (!isDemo() && _posts.length >= 40 && _morePosts !== false) {
      const more = el('button', { class: 'ui-text-btn club-more-posts', type: 'button' }, 'Show older posts');
      more.addEventListener('click', async () => {
        more.disabled = true; more.textContent = 'Loading…';
        const last = _posts[_posts.length - 1];
        const older = await DB.listClubPosts(_data.club.id, { before: last.createdAt, limit: 40 }).catch(() => null);
        if (!older) { more.disabled = false; more.textContent = 'Show older posts'; toast('Couldn\'t load more. Try again'); return; }
        const seen = new Set(_posts.map(p => p.id));
        older.filter(p => !seen.has(p.id)).forEach(p => { _posts.push(p); list.appendChild(postCard(p)); });
        if (older.length < 40) { _morePosts = false; more.remove(); }
        else { more.disabled = false; more.textContent = 'Show older posts'; }
      });
      root.appendChild(more);
    }
  }

  // The week's most-loved lift (2+ reactions): a gold strip at the top of the feed.
  function liftOfTheWeek() {
    const wk = mondayISO();
    const cand = (_posts || []).filter(p => p.kind !== 'note' && String(p.createdAt || '').slice(0, 10) >= wk)
      .map(p => ({ p, n: reactTotal(p.id) })).filter(x => x.n >= 2)
      .sort((a, b) => b.n - a.n || String(b.p.createdAt).localeCompare(String(a.p.createdAt)))[0];
    if (!cand) return null;
    const p = cand.p;
    const b = el('button', { class: 'club-spot', type: 'button' });
    b.appendChild(el('span', { class: 'cs-ic', html: IC.star }));
    const t = el('span', { class: 'cs-main' });
    t.appendChild(el('span', { class: 'cs-k' }, 'Lift of the week'));
    const what = p.kind === 'session' ? (p.exercise || 'Session') : (String(p.exercise || 'Lift').replace(/^Competition /, '') + (p.weightKg ? ' ' + w1(p.weightKg) + ' ' + unitLabel() + (p.reps ? ' × ' + p.reps : '') : ''));
    t.appendChild(el('span', { class: 'cs-t' }, firstName(p.displayName) + ' · ' + what));
    b.appendChild(t);
    const sum = reactionSummary(_reacts[p.id]);
    const top = Object.keys(sum.counts).sort((a, c) => sum.counts[c] - sum.counts[a]).slice(0, 3).map(k => REACT_EMOJI[k]).join('');
    b.appendChild(el('span', { class: 'cs-n' }, top + ' ' + sum.total));
    b.addEventListener('click', () => {
      const card = Array.prototype.find.call(_container.querySelectorAll('.cp-card'), c => c.dataset.postId === p.id);
      if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('is-flash'); setTimeout(() => card.classList.remove('is-flash'), 1300); }
    });
    return b;
  }
  // What a board shows for a member: the number + its unit, and one quiet line.
  function boardValue(m, mode, wk) {
    if (mode === 'week') return { num: String(memberWeekPoints(m, wk)), unit: 'pts' };
    if (mode === 'season') return { num: String(memberSeasonPoints(m, seasonOf(wk).id)), unit: 'pts' };
    if (mode === 'improved') {
      const x = memberImprovePct(m, wk);
      return x == null ? { num: '–', unit: '' } : { num: (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(1) + '%', unit: '' };
    }
    return { num: fmtNum(m.dots), unit: 'DOTS' };
  }
  function boardMeta(m, mode, wk) {
    if (mode === 'week') {
      if (m.weekStart !== wk || !(m.weekSessions > 0)) return 'Not in yet this week';
      const s = m.weekSessions, p = m.weekPrs || 0;
      return s + (s === 1 ? ' session' : ' sessions') + (p ? ' · ' + p + (p === 1 ? ' PR' : ' PRs') : '');
    }
    if (mode === 'season') {
      const w = memberWeekPoints(m, wk);
      return w ? '+' + w + ' this week' : 'Nothing yet this week';
    }
    const cls = m.bodyweightKg ? weightClassFor(m.bodyweightKg, m.sex) : null;
    const who = [m.sex === 'female' ? 'F' : (m.sex === 'male' ? 'M' : null), cls];
    if (mode === 'improved') return memberImprovePct(m, wk) == null ? 'Needs a few weeks of lifts' : (who.filter(Boolean).join(' · ') || 'Lifter');
    return who.concat([m.totalKg ? formatWeight(m.totalKg, 0) + ' total' : null]).filter(Boolean).join(' · ') || 'No numbers yet';
  }
  const BOARD_NOTE = {
    week: 'Points this week: 10 a session, 1 a hard set, 15 a PR. Resets Monday.',
    season: '',   // built per week in renderBoard (season N · week W of 8)
    improved: 'Your best in the last 4 weeks against your own earlier best.',
    dots: 'DOTS: total adjusted for bodyweight, so every size competes.'
  };

  // Top three on a podium: second · first · third.
  function podium(ranked, mode, wk) {
    const top = ranked.filter(m => m.rank != null).slice(0, 3);
    if (top.length < 3) return null;
    const u = me();
    const wrap = el('div', { class: 'club-podium', role: 'list', 'aria-label': 'Top three' });
    [top[1], top[0], top[2]].forEach(m => {
      const place = m === top[0] ? 1 : m === top[1] ? 2 : 3;
      const col = el('button', { type: 'button', class: 'cpd-col p' + place + (u && m.userId === u.id ? ' is-me' : ''), role: 'listitem', 'aria-label': (m.displayName || 'Lifter') + ', place ' + place });
      col.addEventListener('click', () => openLifterCard(m));
      if (place === 1) col.appendChild(el('span', { class: 'cpd-crown', html: IC.crown }));
      col.appendChild(el('span', { class: 'cpd-av', 'data-name': m.displayName || '?' }, initials(m.displayName || '?')));
      col.appendChild(el('span', { class: 'cpd-name' }, u && m.userId === u.id ? 'You' : firstName(m.displayName)));
      const bv = boardValue(m, mode, wk);
      col.appendChild(el('span', { class: 'cpd-val', html: '<b>' + escHtml(bv.num) + '</b>' + (bv.unit ? '<small>' + bv.unit + '</small>' : '') }));
      col.appendChild(el('span', { class: 'cpd-block' }, String(place)));
      wrap.appendChild(col);
    });
    return wrap;
  }
  // Who holds each lift in the club (best competition-equivalent e1RM shared).
  function clubRecords(members) {
    const u = me();
    const recs = [['squat', 'squatKg', 'Squat'], ['bench', 'benchKg', 'Bench'], ['deadlift', 'deadliftKg', 'Deadlift'], ['total', 'totalKg', 'Total']];
    const row = el('div', { class: 'club-records' });
    recs.forEach(([k, f, label]) => {
      const best = (members || []).filter(m => (m[f] || 0) > 0).sort((a, b) => b[f] - a[f])[0];
      if (!best) return;
      const c = el('div', { class: 'crec lift-' + k });
      c.appendChild(el('span', { class: 'crec-lbl' }, label));
      c.appendChild(el('b', { class: 'crec-val', html: Math.round(kgToDisplay(best[f])).toLocaleString() + '<small>' + unitLabel() + '</small>' }));
      const who = el('span', { class: 'crec-who' });
      who.appendChild(el('span', { class: 'crec-av', 'data-name': best.displayName || '?' }, initials(best.displayName || '?')));
      who.appendChild(el('span', {}, u && best.userId === u.id ? 'You' : firstName(best.displayName)));
      c.appendChild(who);
      row.appendChild(c);
    });
    return row.children.length ? row : null;
  }

  const KIND_LABEL = { pr: 'New PR', session: 'Session', set: '', note: '' };
  function postCard(p) {
    const card = el('article', { class: 'cp-card' + (p.kind === 'pr' ? ' is-pr' : '') + (p._fresh ? ' is-fresh' : '') });
    card.dataset.postId = p.id;
    delete p._fresh;
    const head = el('div', { class: 'cp-head' });
    const openCard = () => { const m = _data && _data.members ? _data.members.find(x => x.userId === p.userId) : null; openLifterCard(m || { userId: p.userId, displayName: p.displayName }); };
    const avBtn = el('button', { class: 'cp-av', type: 'button', 'data-name': p.displayName, 'aria-label': 'See ' + p.displayName + '\'s lifter card' }, initials(p.displayName));
    avBtn.addEventListener('click', (e) => { e.stopPropagation(); openCard(); });
    head.appendChild(avBtn);
    const who = el('div', { class: 'cp-who' });
    who.addEventListener('click', (e) => { if (e.target.closest('b')) { e.stopPropagation(); openCard(); } });
    const nameLine = el('b', {}, p.displayName);
    // Staff are marked by their ROLE, never their name (names can collide).
    const author = _data && _data.members ? _data.members.find(m => m.userId === p.userId) : null;
    if (author && (author.role === 'owner' || author.role === 'admin')) nameLine.appendChild(el('em', { class: 'cp-role' }, author.role === 'owner' ? 'Owner' : 'Admin'));
    who.appendChild(nameLine);
    who.appendChild(el('span', {}, [fmtRelative(p.createdAt), KIND_LABEL[p.kind]].filter(Boolean).join(' · ')));
    head.appendChild(who);
    const more = el('button', { class: 'cp-more', type: 'button', 'aria-label': 'Options for ' + p.displayName + '\'s post', html: UI_DOTS });
    more.addEventListener('click', () => postMenu(p));
    head.appendChild(more);
    card.appendChild(head);
    if (p.kind === 'session') card.appendChild(sessionBlock(p));
    else if (p.kind !== 'note') card.appendChild(liftBlock(p));
    if (p.caption) card.appendChild(el('p', { class: 'cp-cap' }, maskUserText(p.caption)));
    card.appendChild(reactRow(p));
    // Long-press / double-tap the card: the quick picker (double-tap = a fire).
    uiLongPress(card, (e) => {
      if (e && e.target && e.target.closest && e.target.closest('button')) return;
      const u = me();
      openReactionPicker(card.querySelector('.cp-lift') || card, POST_REACT_KEYS, reactionSummary(_reacts[p.id], u && u.id).mine, (k) => reactToPost(p, k));
    });
    return card;
  }
  function liftBlock(p) {
    const lift = MAIN.includes(p.lift) ? p.lift : 'other';
    const b = el('div', { class: 'cp-lift lift-' + lift });
    const ex = el('div', { class: 'cp-ex' });
    if (lift !== 'other') ex.appendChild(el('span', { class: 'lift-dot lift-' + lift, 'aria-hidden': 'true' }));
    ex.appendChild(el('span', { class: 'cp-ex-name' }, p.exercise || 'Lift'));
    if (p.kind === 'pr') ex.appendChild(el('span', { class: 'cp-pr', html: IC.trophy + '<span>PR</span>' }));
    b.appendChild(ex);
    const nums = el('div', { class: 'cp-nums' });
    nums.innerHTML =
      (p.weightKg != null ? '<b>' + escHtml(w1(p.weightKg)) + '</b><small>' + unitLabel() + '</small>' : '') +
      (p.reps != null ? '<i>×</i><b>' + escHtml(String(p.reps)) + '</b>' : '') +
      (p.rpe ? '<span class="cp-rpe">RPE <b>' + escHtml(String(p.rpe)) + '</b></span>' : '');
    b.appendChild(nums);
    if (p.e1rmKg) b.appendChild(el('div', { class: 'cp-e1' }, 'e1RM ' + formatWeight(p.e1rmKg, 0)));
    if (p.weightKg > 0 && typeof uiBarbell === 'function') {
      b.classList.add('has-bar');
      b.appendChild(el('span', { class: 'cp-bar', 'aria-hidden': 'true', html: uiBarbell(p.weightKg) }));
    }
    return b;
  }
  function sessionBlock(p) {
    const b = el('div', { class: 'cp-lift cp-session' });
    b.appendChild(el('div', { class: 'cp-ex' }, el('span', { class: 'cp-ex-name' }, p.exercise || 'Training session')));
    const nums = el('div', { class: 'cp-nums' });
    const t = tonnageParts(p.tonnageKg || 0);
    nums.innerHTML = '<b>' + escHtml(String(p.setsCount || 0)) + '</b><small>sets</small><i>·</i><b>' +
      escHtml(t.num) + '</b><small>' + escHtml(t.unit) + ' moved</small>';
    b.appendChild(nums);
    return b;
  }

  function postMenu(p) {
    const u = me();
    const mine = u && p.userId === u.id;
    const staff = _data && (_data.role === 'owner' || _data.role === 'admin');
    const acts = [];
    if (mine || staff) acts.push({ label: mine ? 'Delete post' : 'Remove post', danger: true, icon: IC.trash, onClick: () => deletePost(p) });
    if (!mine) {
      acts.push({ label: 'Report post', icon: IC.flag, onClick: () => reportPost(p) });
      acts.push({ label: 'Block ' + firstName(p.displayName), icon: IC.block, danger: true, onClick: () => blockAuthor(p) });
    }
    uiActionSheet(null, acts);
  }
  async function deletePost(p) {
    if (isDemo()) { window._demoClubPosts = (window._demoClubPosts || []).filter(x => x.id !== p.id); _posts = window._demoClubPosts; renderClub(_container); toast('Post deleted'); return; }
    try { await DB.deleteClubPost(p.id); _posts = (_posts || []).filter(x => x.id !== p.id); renderClub(_container); toast('Post deleted'); }
    catch (e) { toast(e.message || 'Couldn\'t delete. Try again'); }
  }
  const REPORT_REASONS = ['Spam', 'Harassment or hate', 'Nudity or violence', 'Fake or misleading lift', 'Something else'];
  function reportPost(p) {
    uiActionSheet('Why are you reporting this post?', REPORT_REASONS.map(r => ({ label: r, onClick: async () => {
      if (isDemo()) { toast('Thanks: report sent'); return; }
      try { await DB.reportClubPost(p, me().id, r); toast('Thanks: we\'ll take a look'); }
      catch (e) { toast(e.message || 'Couldn\'t send the report'); }
    } })));
  }
  function blockAuthor(p) {
    uiActionSheet('Block ' + p.displayName + '? Their posts disappear from your feed. They aren\'t told.', [
      { label: 'Block ' + firstName(p.displayName), danger: true, icon: IC.block, onClick: async () => {
        if (isDemo()) {
          window._demoClubPosts = (window._demoClubPosts || []).filter(x => x.userId !== p.userId);
          _posts = window._demoClubPosts; renderClub(_container); toast(firstName(p.displayName) + ' blocked'); return;
        }
        try {
          await DB.blockLifter(me().id, p.userId);
          _posts = (_posts || []).filter(x => x.userId !== p.userId);
          renderClub(_container); toast(firstName(p.displayName) + ' blocked');
        } catch (e) { toast(e.message || 'Couldn\'t block. Try again'); }
      } }
    ]);
  }

  // Share sheet: pick today's session or one of the best recent sets, add a
  // caption, post. `preLog` preselects a set (from the PR moment).
  function openShareSheet(preLog) {
    const u = me(); if (!u || !_data) return;
    const logs = (Store.get().workoutLogs || []);
    const today = isoLocal(new Date());
    const sets = shareableSets(logs, u.id, { days: 14, limit: 12 });
    if (preLog && !sets.some(l => l.id === preLog.id)) sets.unshift(preLog);
    const sess = sessionSummary(logs, u.id, today);
    const prOf = {};
    sets.forEach(l => { try { prOf[l.id] = MAIN.includes(l.lift) && isPRForLog(u.id, l); } catch (e) { prOf[l.id] = false; } });
    uiSheet('Share a lift', (sheet, close) => {
      if (!sets.length && !sess.sets) {
        sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Log a set first, then share it with your club here.'));
        const ok = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Got it');
        ok.addEventListener('click', close);
        sheet.appendChild(ok);
        return;
      }
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Your club sees the lift, weight, reps and RPE. Nothing else.'));
      let pick = preLog ? { type: 'set', log: preLog } : (sess.sets ? { type: 'session' } : { type: 'set', log: sets[0] });
      const list = el('div', { class: 'ui-list share-pick', role: 'radiogroup', 'aria-label': 'What to share' });
      const rows = [];
      const addRow = (key, lead, title, sub, endNode, onPick) => {
        const r = el('button', { class: 'ui-row share-opt', type: 'button', role: 'radio' });
        r.dataset.key = key;
        r.appendChild(el('span', { class: 'share-radio', 'aria-hidden': 'true', html: IC.check }));
        if (lead) r.appendChild(lead);
        const m = el('span', { class: 'ui-row-main' });
        m.appendChild(el('span', { class: 'ui-row-title' }, title));
        m.appendChild(el('span', { class: 'ui-row-sub' }, sub));
        r.appendChild(m);
        if (endNode) { const e = el('span', { class: 'ui-row-end' }); e.appendChild(endNode); r.appendChild(e); }
        r.addEventListener('click', () => { onPick(); paint(); });
        rows.push(r); list.appendChild(r);
      };
      if (sess.sets) addRow('session', el('span', { class: 'lift-dot lift-session', 'aria-hidden': 'true' }), 'Today\'s session', sess.sets + ' sets · ' + tonnageText(sess.tonnageKg) + ' moved', null, () => { pick = { type: 'session' }; });
      sets.forEach(l => {
        // Every row keeps the dot column (grey for accessories) so titles share one left edge.
        const dot = el('span', { class: 'lift-dot lift-' + (MAIN.includes(l.lift) ? l.lift : 'other'), 'aria-hidden': 'true' });
        addRow('log:' + l.id, dot, logTitle(l), setLine(l) + ' · ' + dayLabel(l.date),
          prOf[l.id] ? el('span', { class: 'cp-pr', html: IC.trophy + '<span>PR</span>' }) : null,
          () => { pick = { type: 'set', log: l }; });
      });
      const paint = () => rows.forEach(r => {
        const on = (pick.type === 'session' && r.dataset.key === 'session') || (pick.type === 'set' && pick.log && r.dataset.key === 'log:' + pick.log.id);
        r.classList.toggle('on', on); r.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      sheet.appendChild(list);
      const cap = el('textarea', { class: 'share-cap', rows: '2', maxlength: '280', placeholder: 'Add a caption (optional)', 'aria-label': 'Caption' });
      sheet.appendChild(cap);
      const post = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Post to ' + shortName(_data.club.name));
      post.addEventListener('click', async () => {
        const body = pick.type === 'session'
          ? { kind: 'session', exercise: sess.name, setsCount: sess.sets, tonnageKg: sess.tonnageKg }
          : { kind: prOf[pick.log.id] ? 'pr' : 'set', lift: pick.log.lift, exercise: logTitle(pick.log),
              weightKg: pick.log.weight, reps: pick.log.reps, rpe: pick.log.rpe, e1rmKg: pick.log.e1rmComp || pick.log.e1rm };
        const capOk = checkUserText([cap.value.trim()]);   // the content filter (Apple 1.2): refuse slurs, star swearing
        if (!capOk) { cap.focus(); return; }
        Object.assign(body, { clubId: _data.club.id, userId: u.id, caption: capOk[0] });
        if (isDemo()) {
          const p = Object.assign({ id: 'demo-p' + Date.now(), displayName: u.name || 'Demo Lifter', createdAt: new Date().toISOString(), _fresh: true }, body);
          window._demoClubPosts = [p].concat(window._demoClubPosts || []);
          _posts = window._demoClubPosts;
          close(); afterPost(); return;
        }
        post.disabled = true;
        try {
          const saved = await DB.createClubPost(body);
          if (saved) { saved._fresh = true; _posts = [saved].concat(_posts || []); }
          close(); afterPost();
        } catch (e) { toast(filterErrorText(e) || e.message || 'Couldn\'t post. Try again'); }
        finally { post.disabled = false; }
      });
      sheet.appendChild(post);
      paint();
    }, { cls: 'share-sheet' });
  }
  function afterPost() {
    toast('Posted to ' + shortName(_data.club.name));
    try { if (window.PowaNative && PowaNative.isNative && PowaNative.isNative()) PowaNative.haptic('MEDIUM'); } catch (e) {}
    _view = 'feed';
    // Stay where the lifter is (mid-session on Train, say); refresh the feed if it's on screen.
    const clubTab = document.getElementById('tab-club');
    if (_container && (!clubTab || clubTab.classList.contains('active'))) renderClub(_container);
  }

  // ---- BOARD -----------------------------------------------------------------
  function renderBoard(root) {
    const { members } = _data;
    const u = me();
    const wk = mondayISO();
    if (BOARD_MODES.indexOf(_mode) < 0) _mode = 'week';
    root.appendChild(segmented([['week', 'This week'], ['season', 'Season'], ['improved', 'Improved'], ['dots', 'Strongest']], _mode,
      (m) => { _mode = m; try { localStorage.setItem('powa-club-board', m); } catch (e) {} renderClub(_container); }, 'Club board', 'club-rank-seg'));
    const season = seasonOf(wk);
    root.appendChild(el('p', { class: 'club-board-note' }, _mode === 'season'
      ? 'Season ' + season.id + ' · week ' + season.week + ' of ' + SEASON_WEEKS + '. Weekly points add up; the most after ' + SEASON_WEEKS + ' weeks is champion.'
      : BOARD_NOTE[_mode]));
    // Last season's champion: one line with a crown, on the season board.
    if (_mode === 'season') {
      const champ = seasonChampion(members, season.id);
      if (champ) {
        const isMe = u && champ.member.userId === u.id;
        const line = el('button', { type: 'button', class: 'club-champ' });
        line.addEventListener('click', () => openLifterCard(champ.member));
        line.appendChild(el('span', { class: 'club-champ-ic', 'aria-hidden': 'true', html: IC.crown }));
        line.appendChild(el('span', { class: 'club-champ-t' }, (isMe ? 'You' : (champ.member.displayName || 'Lifter')) + (isMe ? ' won' : ' won') + ' season ' + champ.seasonId,
          el('small', {}, champ.points + ' pts')));
        root.appendChild(line);
      }
    }

    // The weekly challenge belongs to the weekly board; the others stay simple.
    if (_mode === 'week') { const ch = challengeCard(members, wk); if (ch) root.appendChild(ch); }

    const ranked = rankClubMembers(members, _mode, wk);
    const pod = podium(ranked, _mode, wk);
    if (pod) root.appendChild(pod);
    const board = el('div', { class: 'club-board ui-list' });
    const onPodium = new Set(pod ? ranked.filter(m => m.rank != null).slice(0, 3).map(m => m.userId) : []);
    ranked.filter(m => !onPodium.has(m.userId)).forEach(m => {
      const isMe = u && m.userId === u.id;
      const medal = m.rank === 1 ? ' gold' : m.rank === 2 ? ' silver' : m.rank === 3 ? ' bronze' : '';
      const row = el('button', { type: 'button', class: 'club-row' + (isMe ? ' is-me' : '') + (medal ? ' medal' + medal : '') });
      row.addEventListener('click', () => openLifterCard(m));
      row.appendChild(el('span', { class: 'cr-rank' + medal }, m.rank == null ? '–' : String(m.rank)));
      row.appendChild(el('span', { class: 'cr-av', 'data-name': m.displayName || '?' }, initials(m.displayName || '?')));
      const id = el('span', { class: 'cr-id' });
      const nm = el('span', { class: 'cr-name' }, m.displayName || 'Lifter');
      if (isMe) nm.appendChild(el('em', {}, 'You'));
      if (m.role === 'owner') nm.appendChild(el('em', { class: 'cr-tag' }, 'Owner'));
      id.appendChild(nm);
      id.appendChild(el('span', { class: 'cr-meta' }, boardMeta(m, _mode, wk)));
      row.appendChild(id);
      const bv = boardValue(m, _mode, wk);
      const val = el('span', { class: 'cr-val' + (_mode === 'improved' && /^\+/.test(bv.num) ? ' is-up' : '') });
      val.innerHTML = '<b>' + escHtml(bv.num) + '</b>' + (bv.unit ? '<small>' + bv.unit + '</small>' : '');
      row.appendChild(val);
      board.appendChild(row);
    });
    if (board.children.length) root.appendChild(board);
    if (_mode === 'dots') {
      const recs = clubRecords(members);
      if (recs) {
        root.appendChild(uiLabel('Club records'));
        root.appendChild(recs);
        root.appendChild(el('p', { class: 'club-fine tight' }, 'Best estimated maxes, competition equivalent.'));
      }
    }
    root.appendChild(el('p', { class: 'club-fine' }, 'Your club sees your name, class, best lifts, DOTS and how often you train, plus anything you post. Never your program or logs.'));
  }

  // ---- LIFTER CARD -------------------------------------------------------------
  // Tap anyone on the board or in the feed: who they are, their numbers, what
  // they did this week, and their Instagram. Only what a club already shares.
  function openLifterCard(m) {
    if (!m) return;
    const u = me();
    const mine = !!(u && m.userId === u.id);
    const wk = mondayISO();
    const rankIn = (mode) => { const x = _data ? rankClubMembers(_data.members, mode, wk).find(y => y.userId === m.userId) : null; return x && x.rank; };
    const wkRank = rankIn('week'), dotsRank = rankIn('dots');
    uiSheet('', (sheet, close) => {
      const head = el('div', { class: 'lc-head' });
      head.appendChild(el('span', { class: 'lc-av', 'data-name': m.displayName || '?' }, initials(m.displayName || '?')));
      const id = el('div', { class: 'lc-id' });
      const nm = el('h3', {}, mine ? 'You' : (m.displayName || 'Lifter'));
      if (m.role === 'owner' || m.role === 'admin') nm.appendChild(el('em', { class: 'cp-role' }, m.role === 'owner' ? 'Owner' : 'Admin'));
      id.appendChild(nm);
      const cls = m.bodyweightKg ? weightClassFor(m.bodyweightKg, m.sex) : null;
      const meta = [m.sex === 'female' ? 'Women' : (m.sex === 'male' ? 'Men' : null), cls ? cls + ' class' : null,
        wkRank ? '#' + wkRank + ' this week' : null, dotsRank ? '#' + dotsRank + ' strongest' : null].filter(Boolean).join(' · ');
      if (meta) id.appendChild(el('div', { class: 'lc-meta' }, meta));
      const champ = _data ? seasonChampion(_data.members, seasonOf(wk).id) : null;
      if (champ && champ.member.userId === m.userId) id.appendChild(el('div', { class: 'lc-champ', html: IC.crown + '<span>Season ' + champ.seasonId + ' champion</span>' }));
      head.appendChild(id);
      sheet.appendChild(head);
      const lifts = el('div', { class: 'lc-lifts' });
      [['squat', m.squatKg, 'Squat'], ['bench', m.benchKg, 'Bench'], ['deadlift', m.deadliftKg, 'Deadlift'], ['total', m.totalKg, 'Total']].forEach(([k, v, label]) => {
        const c = el('div', { class: 'lc-lift lift-' + k });
        c.appendChild(el('span', { class: 'lc-l' }, label));
        c.appendChild(el('b', { html: v ? Math.round(kgToDisplay(v)).toLocaleString() + '<small>' + unitLabel() + '</small>' : '–' }));
        lifts.appendChild(c);
      });
      sheet.appendChild(lifts);
      const imp = boardValue(m, 'improved', wk).num;
      sheet.appendChild(uiStats([
        { value: memberWeekPoints(m, wk), label: 'Points this week' },
        { value: imp, label: 'Improved', tone: /^\+/.test(imp) ? 'ok' : null },
        { value: m.dots ? fmtNum(m.dots) : '–', label: 'DOTS' }
      ]));
      const socials = typeof uiSocialChips === 'function' ? uiSocialChips(m, { big: true })
        : (m.instagram ? uiInstagramChip(m.instagram, { big: true }) : null);
      if (socials) sheet.appendChild(socials);
      else if (mine) {
        const add = el('button', { class: 'btn btn-lg ui-btn-soft lc-add-ig', type: 'button', html: '<span class="ig-ic">' + IG_GLYPH + '</span><span>Add your Instagram or TikTok</span>' });
        add.addEventListener('click', () => { close(); setTimeout(() => openProfileSheet(), 220); });
        sheet.appendChild(add);
      }
      // Training buddies: ask, say yes, or stop (one buddy each).
      if (!mine) {
        const st = buddyState(m.userId);
        const nm = firstName(m.displayName);
        const inc = st.incoming.find(x => x.id === m.userId);
        let bb = null;
        if (st.active && st.active.id === m.userId) {
          bb = el('button', { class: 'btn btn-lg ui-btn-soft lc-buddy is-on', type: 'button' }, 'Training buddies · stop');
          bb.addEventListener('click', () => endBuddy(nm, close));
        } else if (inc) {
          bb = el('button', { class: 'btn btn-lg btn-primary lc-buddy', type: 'button' }, 'Say yes to ' + nm);
          bb.addEventListener('click', () => { close(); answerBuddy(inc, true); });
        } else if (st.outgoing && st.outgoing.addresseeId === m.userId) {
          bb = el('button', { class: 'btn btn-lg ui-btn-soft lc-buddy', type: 'button' }, 'Asked. Waiting for ' + nm);
          bb.disabled = true;
        } else if (!st.active) {
          bb = el('button', { class: 'btn btn-lg ui-btn-soft lc-buddy', type: 'button' }, 'Be training buddies');
          bb.addEventListener('click', () => askBuddy(m, close));
        }
        if (bb) sheet.appendChild(bb);
      }
      sheet.appendChild(el('p', { class: 'club-fine tight' }, 'Best estimated maxes, competition equivalent. Shared with the club only.'));
    }, { cls: 'lifter-sheet' });
  }
  // Push my shared row now (after a profile edit) instead of on the next visit.
  function syncMyStats() {
    const u = me(); if (!u || isDemo() || !window.DB || !DB.updateMyClubStats) return;
    const stats = myClubStats(); if (!stats) return;
    DB.updateMyClubStats(u.id, stats).then(ok => { if (ok) { try { localStorage.setItem('powa-club-stats', JSON.stringify(stats)); } catch (e) {} } });
    if (_data) { const i = _data.members.findIndex(x => x.userId === u.id); if (i >= 0) _data.members[i] = Object.assign({}, _data.members[i], stats); }
  }

  // ---- TRAINING BUDDIES -----------------------------------------------------------
  // Two members pair up (ask → yes). Each sees the other's week and can nudge
  // once every 12 hours; the nudge arrives as a push with fixed words.
  const NUDGE_GAP = 12 * 3600000;
  function buddyState(userId) {
    const u = me(); if (!u) return {};
    const active = _buddies.find(b => b.status === 'active');
    const other = (b) => (b.requesterId === u.id ? b.addresseeId : b.requesterId);
    const member = (id) => (_data && _data.members || []).find(m => m.userId === id) || null;
    const out = {
      active: active ? { row: active, id: other(active), member: member(other(active)) } : null,
      incoming: _buddies.filter(b => b.status === 'pending' && b.addresseeId === u.id).map(b => ({ row: b, id: b.requesterId, member: member(b.requesterId) })),
      outgoing: _buddies.find(b => b.status === 'pending' && b.requesterId === u.id) || null
    };
    if (userId) {
      out.withThem = _buddies.find(b => b.requesterId === userId || b.addresseeId === userId) || null;
    }
    return out;
  }
  const ago = (iso) => {
    const m = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
    return m < 60 ? m + 'm ago' : m < 1440 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
  };
  // One row above Feed/Board: your buddy's week + Nudge, or an ask waiting for you.
  function buddyRow() {
    const u = me(); if (!u || !_data) return null;
    const st = buddyState();
    const wk = mondayISO();
    if (st.active && st.active.member) {
      const b = st.active, m = b.member;
      const row = el('div', { class: 'club-buddy' });
      const av = el('button', { class: 'cbud-av', type: 'button', 'data-name': m.displayName || '?', 'aria-label': 'See ' + (m.displayName || 'your buddy') + '\'s lifter card' }, initials(m.displayName || '?'));
      av.addEventListener('click', () => openLifterCard(m));
      row.appendChild(av);
      const mine = (_data.members || []).find(x => x.userId === u.id) || {};
      const n = (x) => (x && x.weekStart === wk ? (x.weekSessions || 0) : 0);
      const t = el('div', { class: 'cbud-t' });
      t.appendChild(el('b', {}, 'You & ' + firstName(m.displayName)));
      const theyNudged = b.row.lastNudgeBy === b.id && b.row.lastNudgeAt && (Date.now() - Date.parse(b.row.lastNudgeAt)) < 24 * 3600000;
      t.appendChild(el('span', {}, theyNudged
        ? firstName(m.displayName) + ' nudged you ' + ago(b.row.lastNudgeAt)
        : 'This week: ' + firstName(m.displayName) + ' ' + n(m) + ', you ' + n(mine)));
      row.appendChild(t);
      const iNudged = b.row.lastNudgeBy === u.id && b.row.lastNudgeAt && (Date.now() - Date.parse(b.row.lastNudgeAt)) < NUDGE_GAP;
      const btn = el('button', { class: 'btn btn-sm cbud-nudge', type: 'button' }, iNudged ? 'Nudged' : 'Nudge');
      btn.disabled = !!iNudged;
      btn.addEventListener('click', () => nudgeBuddy(b, btn));
      row.appendChild(btn);
      return row;
    }
    const inc = st.incoming.find(x => x.member);
    if (inc) {
      const row = el('div', { class: 'club-buddy is-ask' });
      row.appendChild(el('span', { class: 'cbud-av', 'data-name': inc.member.displayName || '?' }, initials(inc.member.displayName || '?')));
      const t = el('div', { class: 'cbud-t' });
      t.appendChild(el('b', {}, firstName(inc.member.displayName) + ' wants to be training buddies'));
      t.appendChild(el('span', {}, 'You\'ll see each other\'s week and can nudge'));
      row.appendChild(t);
      const yes = el('button', { class: 'btn btn-sm btn-primary', type: 'button' }, 'Yes');
      yes.addEventListener('click', () => answerBuddy(inc, true));
      const no = el('button', { class: 'ui-text-btn cbud-no', type: 'button' }, 'Not now');
      no.addEventListener('click', () => answerBuddy(inc, false));
      row.appendChild(yes); row.appendChild(no);
      return row;
    }
    return null;
  }
  async function refreshBuddies() {
    if (isDemo()) { _buddies = window._demoBuddies || []; return; }
    if (window.DB && DB.listMyBuddies) _buddies = (await DB.listMyBuddies().catch(() => [])).filter(b => _data && b.clubId === _data.club.id);
  }
  async function askBuddy(m, done) {
    if (isDemo()) {
      window._demoBuddies = [{ id: 'demo-bud', clubId: 'demo-club', requesterId: me().id, addresseeId: m.userId, status: 'active', lastNudgeBy: null, lastNudgeAt: null }];
      await refreshBuddies(); toast('You and ' + firstName(m.displayName) + ' are training buddies (demo)'); if (done) done(); renderClub(_container); return;
    }
    try {
      const r = await DB.requestBuddy(m.userId);
      toast(r === 'active' ? 'You and ' + firstName(m.displayName) + ' are training buddies' : 'Asked ' + firstName(m.displayName) + '. You\'ll pair up when they say yes');
      await refreshBuddies(); if (done) done(); renderClub(_container);
    } catch (e) { toast(e.message || 'Could not ask'); }
  }
  async function answerBuddy(inc, yes) {
    if (isDemo()) { toast('Preview only in demo mode'); return; }
    try {
      const r = await DB.respondBuddy(inc.row.id, yes);
      toast(r === 'active' ? 'You and ' + firstName(inc.member.displayName) + ' are training buddies' : r === 'taken' ? 'They already have a buddy' : 'Okay, not now');
      await refreshBuddies(); renderClub(_container);
    } catch (e) { toast(e.message || 'Could not answer'); }
  }
  async function endBuddy(name, done) {
    uiActionSheet('Stop being training buddies with ' + name + '?', [{ label: 'Stop', danger: true, onClick: async () => {
      if (isDemo()) { window._demoBuddies = []; await refreshBuddies(); toast('Done (demo)'); if (done) done(); renderClub(_container); return; }
      try { await DB.endBuddy(); await refreshBuddies(); toast('You\'re not buddies any more'); if (done) done(); renderClub(_container); }
      catch (e) { toast(e.message || 'Could not do that'); }
    } }]);
  }
  async function nudgeBuddy(b, btn) {
    const name = firstName(b.member && b.member.displayName);
    if (btn) btn.disabled = true;
    if (isDemo()) { toast('Nudged ' + name + ' (demo)'); if (btn) btn.textContent = 'Nudged'; return; }
    try {
      const other = await DB.nudgeBuddy();
      if (!other) { toast('You nudged ' + name + ' already today'); if (btn) btn.textContent = 'Nudged'; return; }
      // send-push writes the words itself for a buddy ("<name> nudged you"); these are placeholders.
      if (DB.sendPush) DB.sendPush({ toUserId: other, title: 'Nudge', body: 'Nudge', url: '/athlete.html?tab=club', tag: 'powa-buddy', category: 'buddy' }).catch(() => {});
      try { hapticTap(); } catch (e) {}
      toast('Nudged ' + name);
      if (btn) btn.textContent = 'Nudged';
      await refreshBuddies();
    } catch (e) { toast(e.message || 'Could not nudge'); if (btn) btn.disabled = false; }
  }

  // ---- REQUESTS (owner / admin) -------------------------------------------------
  function requestsRow() {
    const n = _requests.length;
    const row = el('button', { class: 'club-req-row', type: 'button' });
    const stack = el('span', { class: 'crq-stack', 'aria-hidden': 'true' });
    _requests.slice(0, 3).forEach(r => stack.appendChild(el('span', { class: 'cp-av', 'data-name': r.displayName }, initials(r.displayName))));
    row.appendChild(stack);
    const t = el('span', { class: 'crq-text' });
    t.appendChild(el('b', {}, n === 1 ? firstName(_requests[0].displayName) + ' wants to join' : n + ' lifters want to join'));
    t.appendChild(el('span', {}, 'Tap to review'));
    row.appendChild(t);
    row.insertAdjacentHTML('beforeend', UI_CHEV);
    row.addEventListener('click', openRequestsSheet);
    return row;
  }
  function openRequestsSheet() {
    let changed = false;
    uiSheet('Requests to join', (sheet, close) => {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Accepted lifters see the feed and the board straight away.'));
      const list = el('div', { class: 'ui-list' });
      const draw = () => {
        list.innerHTML = '';
        if (!_requests.length) { list.appendChild(uiRow({ title: 'All caught up', sub: 'No one is waiting.' })); return; }
        _requests.forEach(r => {
          const row = el('div', { class: 'ui-row req-row' });
          row.appendChild(el('span', { class: 'ui-av', 'data-name': r.displayName }, initials(r.displayName)));
          const m = el('span', { class: 'ui-row-main' });
          m.appendChild(el('span', { class: 'ui-row-title' }, r.displayName));
          m.appendChild(el('span', { class: 'ui-row-sub' }, r.message ? '"' + r.message + '"' : 'Asked ' + fmtRelative(r.createdAt)));
          row.appendChild(m);
          const acts = el('span', { class: 'req-acts' });
          const no = el('button', { class: 'req-btn', type: 'button', 'aria-label': 'Decline ' + r.displayName }, 'Decline');
          const yes = el('button', { class: 'req-btn yes', type: 'button', 'aria-label': 'Accept ' + r.displayName }, 'Accept');
          const go = async (accept) => {
            no.disabled = yes.disabled = true;
            try {
              const res = isDemo() ? (accept ? 'accepted' : 'declined') : await DB.respondClubRequest(r.id, accept);
              _requests = _requests.filter(x => x.id !== r.id);
              if (res === 'accepted') { changed = true; toast(firstName(r.displayName) + ' is in'); }
              else if (res === 'stale') toast(firstName(r.displayName) + ' joined another club');
              else toast('Declined');
              draw();
            } catch (e) { toast(e.message || 'Couldn\'t answer. Try again'); no.disabled = yes.disabled = false; }
          };
          no.addEventListener('click', () => go(false));
          yes.addEventListener('click', () => go(true));
          acts.appendChild(no); acts.appendChild(yes);
          row.appendChild(acts);
          list.appendChild(row);
        });
      };
      draw();
      sheet.appendChild(list);
      const done = el('button', { class: 'btn btn-ghost btn-lg btn-block', type: 'button' }, 'Done');
      done.addEventListener('click', close);
      sheet.appendChild(done);
    }, { cls: 'req-sheet', onClose: () => { if (changed) { _loaded = false; renderClubTab(); } else if (_container) renderClub(_container); } });
  }

  // ---- FIND (not in a club) -----------------------------------------------------
  function renderJoin(root) {
    root.innerHTML = '';
    const hero = el('div', { class: 'ui-hero club-hero club-hero-join' });
    const top = el('div', { class: 'club-hero-top' });
    top.appendChild(el('span', { class: 'club-crest', 'aria-hidden': 'true', html: IC.people }));
    const idc = el('div', { class: 'club-hero-id' });
    idc.appendChild(el('div', { class: 'ui-hero-label' }, 'Clubs'));
    idc.appendChild(el('h2', { class: 'club-hero-name' }, 'Find your club'));
    top.appendChild(idc);
    hero.appendChild(top);
    hero.appendChild(el('p', { class: 'club-desc' }, 'Share lifts, climb the board, train with your crew. Free, and separate from coaching.'));
    root.appendChild(hero);

    const search = el('label', { class: 'club-search' });
    search.insertAdjacentHTML('beforeend', IC.search);
    const input = el('input', { type: 'search', placeholder: 'Search clubs or cities', 'aria-label': 'Search clubs or cities',
      autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'search' });
    search.appendChild(input);
    root.appendChild(search);

    const list = el('div', { class: 'ui-list club-dir' });
    list.innerHTML = '<div class="ui-skel club-dir-skel"><i></i><i></i><i></i></div>';
    root.appendChild(list);

    let t = null;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => fetchDir(list, input.value.trim()), 250); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(t); input.blur(); fetchDir(list, input.value.trim()); } });

    const more = uiList([
      uiRow({ lead: el('span', { class: 'yr-ic t-gold', html: IC.key }), title: 'Got a code?', sub: 'Join a club straight away', chevron: true, onClick: () => openCodeSheet() }),
      uiRow({ lead: el('span', { class: 'yr-ic t-green', html: IC.plus }), title: 'Start a club', sub: 'Free. Public or private, your call', chevron: true, onClick: () => openCreateModal() })
    ]);
    more.classList.add('club-more');
    root.appendChild(more);
    root.appendChild(el('p', { class: 'club-fine' }, 'Joining shares your name, class, best lifts, DOTS and how often you train with that club only. Never your program or logs.'));

    fetchDir(list, '');
    let pre = new URLSearchParams(location.search).get('club');
    if (!pre) { try { pre = localStorage.getItem('powa-club-code'); } catch (e) {} }
    if (pre && !_codeSheetShown) { _codeSheetShown = true; setTimeout(() => openCodeSheet(pre), 250); }
  }

  async function fetchDir(list, q) {
    const seq = ++_dirSeq;
    let clubs = [];
    if (isDemo()) {
      const ql = q.toLowerCase();
      clubs = demoDirectory().filter(c => !ql || c.name.toLowerCase().includes(ql) || (c.city || '').toLowerCase().includes(ql));
    } else if (window.DB && DB.searchClubs) {
      try { clubs = await DB.searchClubs(q, 30); } catch (e) { clubs = []; }
    }
    if (seq !== _dirSeq) return;
    list.innerHTML = '';
    if (!clubs.length) {
      list.appendChild(uiRow({ title: q ? 'No clubs match "' + q + '"' : 'No clubs yet', sub: q ? 'Try a city, or start one' : 'Start the first one below' }));
      return;
    }
    clubs.forEach((c, i) => { const r = dirRow(c, list); r.style.setProperty('--i', String(Math.min(i, 8))); list.appendChild(r); });
  }

  function dirRow(c, list) {
    const r = el('div', { class: 'ui-row club-dir-row' });
    r.appendChild(el('span', { class: 'cd-crest', 'data-name': c.name }, initials(c.name)));
    const m = el('span', { class: 'ui-row-main' });
    m.appendChild(el('span', { class: 'ui-row-title' }, c.name));
    const sub = el('span', { class: 'ui-row-sub cd-meta' });
    sub.textContent = [c.city, c.memberCount + (c.memberCount === 1 ? ' member' : ' members')].filter(Boolean).join(' · ');
    if (c.visibility === 'private') sub.insertAdjacentHTML('beforeend', '<span class="club-priv">' + IC.lock + 'Private</span>');
    m.appendChild(sub);
    r.appendChild(m);
    const btn = el('button', { class: 'cd-act', type: 'button' });
    const paint = (status) => {
      btn.className = 'cd-act' + (status === 'requested' ? ' is-wait' : status === 'member' ? ' is-in' : '');
      btn.textContent = status === 'member' ? 'Joined' : status === 'requested' ? 'Requested' : (c.visibility === 'private' ? 'Request' : 'Join');
      btn.setAttribute('aria-label', btn.textContent + ': ' + c.name);
      btn.disabled = status === 'member';
    };
    paint(c.myStatus);
    btn.addEventListener('click', () => {
      if (c.myStatus === 'requested') {
        uiActionSheet('Your request to ' + c.name + ' is waiting for the owner.', [
          { label: 'Cancel request', danger: true, onClick: () => cancelRequest(c, paint) }
        ]);
        return;
      }
      joinOrRequest(c, btn, paint);
    });
    r.appendChild(btn);
    return r;
  }

  async function joinOrRequest(c, btn, paint) {
    const u = me();
    if (isDemo()) {
      if (c.visibility === 'private') {
        window._demoClubRequested = Object.assign({}, window._demoClubRequested, { [c.id]: true });
        c.myStatus = 'requested'; paint('requested'); toast('Request sent to ' + c.name); return;
      }
      window._demoClubLeft = false; toast('Welcome to ' + c.name); _loaded = false; return renderClubTab();
    }
    if (c.legacy && c.code) return joinWithCode(c.code, btn);   // pre-migration fallback
    btn.disabled = true;
    try {
      const res = await DB.joinOrRequestClub(c.id, u && u.name);
      if (res === 'requested') { c.myStatus = 'requested'; paint('requested'); toast('Request sent to ' + c.name); }
      else {
        try { localStorage.removeItem('powa-club-stats'); } catch (e) {}
        toast('Welcome to ' + c.name);
        _loaded = false; _view = 'feed';
        await renderClubTab();
      }
    } catch (e) { toast(e.message || 'Couldn\'t join. Try again'); }
    finally { if (btn.isConnected && c.myStatus !== 'member') btn.disabled = false; }
  }
  async function cancelRequest(c, paint) {
    if (isDemo()) {
      const m = Object.assign({}, window._demoClubRequested); delete m[c.id]; window._demoClubRequested = m;
      c.myStatus = null; paint(null); toast('Request cancelled'); return;
    }
    try { await DB.cancelClubRequest(c.id, me().id); c.myStatus = null; paint(null); toast('Request cancelled'); }
    catch (e) { toast(e.message || 'Couldn\'t cancel. Try again'); }
  }

  function openCodeSheet(prefill) {
    uiSheet('Join with a code', (sheet, close) => {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Ask anyone in the club for its 6-character code.'));
      const input = el('input', { class: 'club-code-input', type: 'text', maxlength: '6', placeholder: 'CODE', autocomplete: 'off',
        autocapitalize: 'characters', spellcheck: 'false', 'aria-label': 'Club code', enterkeyhint: 'go' });
      input.value = String(prefill || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      sheet.appendChild(input);
      const go = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Join club');
      const submit = async () => { const ok = await joinWithCode(input.value, go); if (ok) close(); };
      go.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      sheet.appendChild(go);
      setTimeout(() => { try { input.focus(); } catch (e) {} }, 320);
    }, { cls: 'code-sheet' });
  }

  // ---- actions ---------------------------------------------------------------
  async function joinWithCode(code, btn) {
    code = String(code || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { toast('Club codes are 6 characters'); return false; }
    if (isDemo()) { window._demoClubLeft = false; toast('Joined: welcome to the club'); try { localStorage.removeItem('powa-club-code'); } catch (e) {} _loaded = false; renderClubTab(); return true; }
    if (btn) { btn.disabled = true; }
    try {
      await DB.joinClub(code, (me() || {}).name);
      try { localStorage.removeItem('powa-club-stats'); } catch (e) {}
      toast('Joined: welcome to the club'); try { localStorage.removeItem('powa-club-code'); } catch (e) {}
      _loaded = false; _view = 'feed';
      await renderClubTab();
      return true;
    } catch (e) {
      toast(e.message || 'Couldn\'t join: check the code');
      return false;
    } finally { if (btn) btn.disabled = false; }
  }

  function leaveClub() {
    const name = _data && _data.club ? _data.club.name : 'this club';
    uiActionSheet('Leave ' + name + '? Your row and your posts come off straight away.', [
      { label: 'Leave club', danger: true, onClick: async () => {
        if (isDemo()) { window._demoClubLeft = true; toast('You left the club'); _loaded = false; return renderClubTab(); }
        try {
          await DB.leaveClub(me().id); toast('You left the club'); _data = null; _posts = null;
          try { localStorage.removeItem('powa-club-name'); } catch (e) {}
          renderClubTab();
        } catch (e) { toast(e.message || 'Couldn\'t leave. Try again'); }
      } }
    ]);
  }

  function reportClub(club) {
    uiActionSheet('What\'s wrong with this club?', REPORT_REASONS.map(r => ({ label: r, onClick: async () => {
      if (isDemo()) { toast('Thanks: report sent'); return; }
      try { await DB.reportClub(club.id, me().id, r); toast('Thanks: we\'ll take a look'); }
      catch (e) { toast(e.message || 'Couldn\'t send the report'); }
    } })));
  }

  // ---- WEEKLY CHALLENGE card (Board) --------------------------------------------
  function challengeCard(members, wk) {
    const ch = weekChallenge(members, _posts, wk);
    const u = me();
    const card = el('div', { class: 'club-ch' });
    const head = el('div', { class: 'club-ch-head' });
    head.appendChild(el('span', { class: 'club-ch-ic', 'aria-hidden': 'true', html: IC.trophy || '' }));
    const t = el('div', { class: 'club-ch-t' });
    t.appendChild(el('span', { class: 'club-ch-lbl' }, 'This week\'s challenge'));
    t.appendChild(el('b', {}, ch.title));
    head.appendChild(t);
    const daysLeft = 7 - ((new Date().getDay() + 6) % 7);
    head.appendChild(el('span', { class: 'club-ch-left' }, daysLeft <= 1 ? 'Ends today' : daysLeft + ' days left'));
    card.appendChild(head);
    // Calm (v7): two lines, not a second top-three above the podium.
    if (!ch.rows.length) {
      card.appendChild(el('p', { class: 'club-ch-empty' }, 'Nobody on it yet. First one in takes the lead.'));
      return card;
    }
    const lead = ch.rows[0];
    const mine = u && ch.rows.find(r => r.m.userId === u.id);
    const nth = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
    const leadName = u && lead.m.userId === u.id ? 'You lead' : firstName(lead.m.displayName) + ' leads';
    const you = !u || (mine && mine.rank === 1) ? '' : mine ? ' · you\'re ' + nth(mine.rank) : ' · you\'re not on it yet';
    card.appendChild(el('p', { class: 'club-ch-you' }, leadName + ' with ' + challengeValueText(ch.key, lead.v) + you));
    return card;
  }

  // ---- INVITE: QR, gym poster, gym TV --------------------------------------------
  function inviteUrl(club) { return 'https://www.powalifta.com/athlete.html?tab=club&club=' + encodeURIComponent(club.code); }
  function openInviteSheet(club) {
    const staff = _data && (_data.role === 'owner' || _data.role === 'admin');
    const canPoster = club.visibility !== 'private' || staff;
    uiSheet('Invite to ' + club.name, (sheet, close) => {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, club.visibility === 'private'
        ? 'Anyone with this code can join, so share it with lifters you know.'
        : 'Point a phone camera at the code to join.'));
      if (typeof qrSvg === 'function') sheet.appendChild(el('div', { class: 'club-qr', html: qrSvg(inviteUrl(club), { dark: '#0b0b0c', light: '#ffffff', quiet: 2 }) }));
      sheet.appendChild(el('div', { class: 'club-qr-code' }, el('span', {}, 'Code'), el('b', {}, club.code)));
      const acts = el('div', { class: 'club-qr-acts' });
      const share = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Share invite');
      share.addEventListener('click', () => shareClub(club));
      acts.appendChild(share);
      if (canPoster && typeof qrDraw === 'function') {
        const poster = el('button', { class: 'btn btn-lg btn-block ui-btn-soft', type: 'button' }, 'Make a poster for the gym');
        poster.addEventListener('click', () => makeClubPoster(club));
        acts.appendChild(poster);
      }
      if (staff) {
        const tv = el('button', { class: 'btn btn-lg btn-block ui-btn-soft', type: 'button' }, 'Gym TV mode');
        tv.addEventListener('click', () => { close(); setTimeout(openClubTV, 240); });
        acts.appendChild(tv);
      }
      sheet.appendChild(acts);
    }, { cls: 'invite-sheet' });
  }
  function _round(x, X, Y, W, H, R, fill) {
    x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R);
    x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); x.fillStyle = fill; x.fill();
  }
  // A 1080 × 1350 poster for the gym wall: club name, the QR, the code.
  async function makeClubPoster(club) {
    const W = 1080, H = 1350, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    try { await document.fonts.load('800 80px Archivo'); await document.fonts.load('600 40px Archivo'); } catch (e) {}
    x.fillStyle = '#0b0b0c'; x.fillRect(0, 0, W, H);
    const g = x.createRadialGradient(W / 2, -80, 60, W / 2, -80, 980);
    g.addColorStop(0, 'rgba(242, 194, 91, 0.24)'); g.addColorStop(1, 'rgba(242, 194, 91, 0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.textAlign = 'center';
    x.font = '600 40px Archivo'; x.fillStyle = 'rgba(244, 244, 246, 0.62)';
    x.fillText('Join our club on POWALIFTA', W / 2, 150);
    let fs = 96; x.font = '800 ' + fs + 'px Archivo';
    while (x.measureText(club.name).width > W - 140 && fs > 44) { fs -= 4; x.font = '800 ' + fs + 'px Archivo'; }
    x.fillStyle = '#f4f4f6'; x.fillText(club.name, W / 2, 262);
    const q = 560, qx = (W - q) / 2, qy = 350;
    _round(x, qx - 30, qy - 30, q + 60, q + 60, 40, '#ffffff');
    qrDraw(x, inviteUrl(club), qx, qy, q, { quiet: 0, dark: '#0b0b0c' });
    x.font = '600 38px Archivo'; x.fillStyle = 'rgba(244, 244, 246, 0.7)';
    x.fillText('Point your phone camera at it', W / 2, qy + q + 112);
    x.font = '800 66px Archivo'; x.fillStyle = '#f2c25b';
    x.fillText('Code ' + club.code, W / 2, qy + q + 200);
    x.font = '600 32px Archivo'; x.fillStyle = 'rgba(244, 244, 246, 0.5)';
    x.fillText('Share lifts · climb the board · train together', W / 2, H - 112);
    x.fillText('powalifta.com', W / 2, H - 62);
    await shareCardFromCanvas(c, 'powalifta-club-' + club.code + '.png', 'Join ' + club.name + ' on POWALIFTA: ' + inviteUrl(club));
  }
  // GYM TV MODE: the club on the gym's screen. Rotates the board, the week's
  // challenge and the club records every 15 s, refreshes every 2 min, keeps the
  // screen awake, and shows the join QR in the corner. Any tap closes it.
  function openClubTV() {
    if (!_data || !_data.club) return;
    const tv = el('div', { class: 'club-tv', role: 'dialog', 'aria-label': 'Gym TV mode' });
    document.body.appendChild(tv);
    document.documentElement.classList.add('club-tv-open');
    let lock = null, panel = 0;
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => {}); } catch (e) {}
    try { if (tv.requestFullscreen) tv.requestFullscreen().catch(() => {}); } catch (e) {}
    const PANELS = ['board', 'challenge', 'records'];
    const paint = () => {
      const { club, members } = _data;
      const wk = mondayISO();
      tv.innerHTML = '';
      const head = el('div', { class: 'tv-head' });
      head.appendChild(el('span', { class: 'club-crest', 'aria-hidden': 'true' }, initials(club.name || 'Club')));
      const id = el('div', { class: 'tv-id' });
      id.appendChild(el('div', { class: 'tv-name' }, club.name));
      const titles = { board: 'This week · points', challenge: 'This week\'s challenge', records: 'Club records' };
      id.appendChild(el('div', { class: 'tv-panel' }, titles[PANELS[panel]]));
      head.appendChild(id);
      if (typeof qrSvg === 'function') {
        const j = el('div', { class: 'tv-join' });
        j.appendChild(el('div', { class: 'tv-qr', html: qrSvg(inviteUrl(club), { dark: '#0b0b0c', light: '#ffffff', quiet: 2 }) }));
        j.appendChild(el('div', { class: 'tv-join-t' }, el('b', {}, 'Join us'), el('span', {}, 'Code ' + club.code)));
        head.appendChild(j);
      }
      tv.appendChild(head);
      const body = el('div', { class: 'tv-body' });
      if (PANELS[panel] === 'board') {
        // The gym screen shows the board anyone can win this week.
        rankClubMembers(members, 'week', wk).filter(m => m.rank != null).slice(0, 7).forEach(m => {
          body.appendChild(el('div', { class: 'tv-row' + (m.rank <= 3 ? ' top' + m.rank : '') },
            el('span', { class: 'tv-rank' }, String(m.rank)),
            el('span', { class: 'tv-who' }, m.displayName || 'Lifter'),
            el('span', { class: 'tv-meta' }, boardMeta(m, 'week', wk)),
            el('span', { class: 'tv-val' }, memberWeekPoints(m, wk) + ' pts')));
        });
      } else if (PANELS[panel] === 'challenge') {
        const ch = weekChallenge(members, _posts, wk);
        body.appendChild(el('div', { class: 'tv-ch-title' }, ch.title));
        if (!ch.rows.length) body.appendChild(el('div', { class: 'tv-empty' }, 'Wide open. Log a session and take the lead.'));
        ch.rows.slice(0, 6).forEach(r => body.appendChild(el('div', { class: 'tv-row' + (r.rank <= 3 ? ' top' + r.rank : '') },
          el('span', { class: 'tv-rank' }, String(r.rank)), el('span', { class: 'tv-who' }, r.m.displayName || 'Lifter'),
          el('span', { class: 'tv-meta' }, ''), el('span', { class: 'tv-val' }, challengeValueText(ch.key, r.v)))));
      } else {
        const recs = clubRecords(members);
        if (recs) { recs.classList.add('tv-recs'); body.appendChild(recs); }
        else body.appendChild(el('div', { class: 'tv-empty' }, 'No records yet. Somebody set the first one.'));
      }
      tv.appendChild(body);
      tv.appendChild(el('div', { class: 'tv-dots', 'aria-hidden': 'true' }, ...PANELS.map((p, i) => el('i', { class: i === panel ? 'on' : '' }))));
    };
    const rot = setInterval(() => { panel = (panel + 1) % PANELS.length; paint(); }, 15000);
    const refresh = setInterval(async () => { try { _loaded = false; await load(); } catch (e) {} paint(); }, 120000);
    const exit = () => {
      clearInterval(rot); clearInterval(refresh);
      tv.remove(); document.documentElement.classList.remove('club-tv-open');
      try { if (lock) lock.release(); } catch (e) {}
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') exit(); };
    tv.addEventListener('click', exit);
    document.addEventListener('keydown', onKey);
    paint();
  }

  async function shareClub(club) {
    const url = 'https://www.powalifta.com/athlete.html?tab=club&club=' + encodeURIComponent(club.code);
    const text = 'Join ' + club.name + ' on POWALIFTA: club code ' + club.code;
    try {
      if (navigator.share) { await navigator.share({ title: club.name, text, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + '\n' + url); toast('Invite copied: paste it in your club chat'); }
    catch (e) { toast('Club code: ' + club.code); }
  }

  // ---- modals (create / manage) ---------------------------------------------
  function modalShell(id, title) {
    let m = document.getElementById(id);
    if (m) m.remove();
    m = el('div', { class: 'modal-backdrop', id });
    const box = el('div', { class: 'modal club-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    const x = el('button', { class: 'modal-close', type: 'button', 'aria-label': 'Close' }, '×');
    x.addEventListener('click', () => m.classList.remove('open'));
    box.appendChild(x);
    box.appendChild(el('h3', {}, title));
    m.appendChild(box);
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('open'); });
    document.body.appendChild(m);
    return { m, box };
  }
  function field(label, input) {
    const g = el('div', { class: 'form-group' });
    g.appendChild(el('label', { for: input.id }, label));
    g.appendChild(input);
    return g;
  }
  // Public = anyone can find it and join on a tap. Private = anyone can find it,
  // joining takes your OK (or a code from a member).
  function visibilityPicker(value) {
    const wrap = el('div', { class: 'ui-seg club-vis', role: 'radiogroup', 'aria-label': 'Who can join' });
    wrap.dataset.value = value || 'public';
    const note = el('p', { class: 'club-vis-note' });
    const notes = { public: 'Anyone can find it and join.', private: 'Anyone can find it. You approve who joins.' };
    [['public', 'Public'], ['private', 'Private']].forEach(([k, label]) => {
      const b = el('button', { class: wrap.dataset.value === k ? 'on' : '', type: 'button', role: 'radio', 'aria-checked': wrap.dataset.value === k ? 'true' : 'false' }, label);
      b.addEventListener('click', () => {
        wrap.dataset.value = k;
        wrap.querySelectorAll('button').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        note.textContent = notes[k];
      });
      wrap.appendChild(b);
    });
    note.textContent = notes[wrap.dataset.value];
    wrap.note = note;
    return wrap;
  }

  function openCreateModal() {
    const { m, box } = modalShell('clubCreateModal', 'Start a club');
    box.appendChild(el('p', { class: 'text-sm dim' }, 'Free. You\'ll get a code to share with your lifters.'));
    const name = el('input', { id: 'clubNameIn', type: 'text', maxlength: '60', placeholder: 'Iron Temple Barbell' });
    const city = el('input', { id: 'clubCityIn', type: 'text', maxlength: '60', placeholder: 'Optional' });
    const desc = el('textarea', { id: 'clubDescIn', maxlength: '280', rows: '2', placeholder: 'Optional: when you train, who it\'s for' });
    box.appendChild(field('Club name', name));
    box.appendChild(field('City', city));
    box.appendChild(field('About', desc));
    box.appendChild(el('div', { class: 'club-vis-title' }, 'Who can join'));
    const vis = visibilityPicker('public');
    box.appendChild(vis);
    box.appendChild(vis.note);
    const create = el('button', { class: 'btn btn-primary btn-block mt-16', type: 'button' }, 'Create club');
    create.addEventListener('click', async () => {
      const n = name.value.trim();
      if (n.length < 2) { toast('Give your club a name'); name.focus(); return; }
      const f = checkUserText([n, city.value, desc.value]);
      if (!f) return;
      if (isDemo()) { toast('Preview only in demo mode'); m.classList.remove('open'); return; }
      create.disabled = true;
      try {
        await DB.createClub({ name: f[0], city: f[1], description: f[2], visibility: vis.dataset.value, displayName: (me() || {}).name });
        m.classList.remove('open');
        toast('Club created: share the code to fill it');
        _loaded = false; _view = 'feed';
        await renderClubTab();
      } catch (e) { toast(filterErrorText(e) || e.message || 'Couldn\'t create the club'); }
      finally { create.disabled = false; }
    });
    box.appendChild(create);
    m.classList.add('open');
    setTimeout(() => { try { name.focus(); } catch (e) {} }, 60);
  }

  function openManageModal() {
    if (!_data) return;
    const { club, role, members } = _data;
    const { m, box } = modalShell('clubManageModal', 'Manage club');
    const name = el('input', { id: 'clubNameEd', type: 'text', maxlength: '60', value: club.name });
    const city = el('input', { id: 'clubCityEd', type: 'text', maxlength: '60', value: club.city || '' });
    const desc = el('textarea', { id: 'clubDescEd', maxlength: '280', rows: '2' }); desc.value = club.description || '';
    const vis = visibilityPicker(club.visibility);
    if (role === 'owner') {
      box.appendChild(field('Club name', name));
      box.appendChild(field('City', city));
      box.appendChild(field('About', desc));
      box.appendChild(el('div', { class: 'club-vis-title' }, 'Who can join'));
      box.appendChild(vis);
      box.appendChild(vis.note);
      const save = el('button', { class: 'btn btn-primary btn-block mt-16', type: 'button' }, 'Save');
      save.addEventListener('click', async () => {
        const f = checkUserText([name.value, city.value, desc.value]);
        if (!f) return;
        if (isDemo()) { toast('Preview only in demo mode'); return; }
        save.disabled = true;
        try { await DB.updateClub(club.id, { name: f[0], city: f[1], description: f[2], visibility: vis.dataset.value }); toast('Saved'); m.classList.remove('open'); _loaded = false; renderClubTab(); }
        catch (e) { toast(filterErrorText(e) || e.message || 'Couldn\'t save'); }
        finally { save.disabled = false; }
      });
      box.appendChild(save);
    }
    box.appendChild(el('div', { class: 'club-vis-title', style: 'margin-top:22px' }, 'Members'));
    const list = el('div', { class: 'ui-list' });
    members.filter(x => x.role !== 'owner').forEach(x => {
      const r = el('div', { class: 'ui-row' });
      r.appendChild(el('span', { class: 'ui-av', 'data-name': x.displayName || 'Lifter' }, initials(x.displayName || 'Lifter')));
      const mm = el('span', { class: 'ui-row-main' });
      mm.appendChild(el('span', { class: 'ui-row-title' }, x.displayName || 'Lifter'));
      r.appendChild(mm);
      const rm = el('button', { class: 'req-btn', type: 'button' }, 'Remove');
      rm.addEventListener('click', () => {
        uiActionSheet('Remove ' + (x.displayName || 'this lifter') + '? Their posts go too, and they can\'t rejoin until you let them back.', [
          { label: 'Remove', danger: true, onClick: async () => {
            if (isDemo()) { toast('Preview only in demo mode'); return; }
            try { await DB.removeClubMember(club.id, x.userId); r.remove(); _loaded = false; renderClubTab(); }
            catch (e) { toast(e.message || 'Couldn\'t remove'); }
          } }
        ]);
      });
      r.appendChild(rm);
      list.appendChild(r);
    });
    if (!list.children.length) list.appendChild(uiRow({ title: 'Just you so far', sub: 'Share the code to fill it' }));
    box.appendChild(list);

    // Invite code: show it, and let staff swap it if it leaked.
    box.appendChild(el('div', { class: 'club-vis-title', style: 'margin-top:22px' }, 'Invite code'));
    const codeRow = el('div', { class: 'ui-row' });
    const codeMain = el('span', { class: 'ui-row-main' });
    const codeVal = el('span', { class: 'ui-row-title club-code-big' }, club.code);
    codeMain.appendChild(codeVal);
    codeMain.appendChild(el('span', { class: 'ui-row-sub' }, 'A new code stops the old one working'));
    codeRow.appendChild(codeMain);
    const newCode = el('button', { class: 'req-btn', type: 'button' }, 'New code');
    newCode.addEventListener('click', async () => {
      if (isDemo()) { toast('Preview only in demo mode'); return; }
      newCode.disabled = true;
      try { const c = await DB.rotateClubCode(club.id); if (c) { club.code = c; codeVal.textContent = c; if (_container) renderClub(_container); } toast('New code ready: share it again'); }
      catch (e) { toast(e.message || 'Couldn\'t change the code'); }
      finally { newCode.disabled = false; }
    });
    codeRow.appendChild(newCode);
    box.appendChild(uiList([codeRow]));

    // Removed lifters stay out until staff let them back.
    const bansWrap = el('div');
    box.appendChild(bansWrap);
    if (!isDemo() && DB.listClubBans) {
      DB.listClubBans(club.id).then(bans => {
        if (!bans.length) return;
        bansWrap.appendChild(el('div', { class: 'club-vis-title', style: 'margin-top:22px' }, 'Removed'));
        const bl = el('div', { class: 'ui-list' });
        bans.forEach(b => {
          const r = el('div', { class: 'ui-row' });
          r.appendChild(el('span', { class: 'ui-av', 'data-name': b.displayName }, initials(b.displayName)));
          const mm = el('span', { class: 'ui-row-main' });
          mm.appendChild(el('span', { class: 'ui-row-title' }, b.displayName));
          mm.appendChild(el('span', { class: 'ui-row-sub' }, 'Can\'t rejoin'));
          r.appendChild(mm);
          const back = el('button', { class: 'req-btn', type: 'button' }, 'Allow back');
          back.addEventListener('click', async () => {
            back.disabled = true;
            try { await DB.unbanClubMember(club.id, b.userId); r.remove(); toast(firstName(b.displayName) + ' can join again'); if (!bl.children.length) bansWrap.innerHTML = ''; }
            catch (e) { toast(e.message || 'Couldn\'t update that'); back.disabled = false; }
          });
          r.appendChild(back);
          bl.appendChild(r);
        });
        bansWrap.appendChild(bl);
      });
    }
    if (role === 'owner') {
      const del = el('button', { class: 'btn btn-danger btn-block mt-16', type: 'button' }, 'Delete club');
      del.addEventListener('click', () => {
        uiActionSheet('Delete ' + club.name + ' for everyone? The board and every post go. This can\'t be undone.', [
          { label: 'Delete club', danger: true, onClick: async () => {
            if (isDemo()) { toast('Preview only in demo mode'); return; }
            try { await DB.deleteClub(club.id); m.classList.remove('open'); toast('Club deleted'); _data = null; _posts = null; _loaded = false; renderClubTab(); }
            catch (e) { toast(e.message || 'Couldn\'t delete'); }
          } }
        ]);
      });
      box.appendChild(del);
    }
    m.classList.add('open');
  }

  // Share a specific log from elsewhere (the PR moment). Loads the club first.
  async function shareLog(log) {
    if (!_loaded) await load();
    if (!_data || !_data.club) { toast('Join a club to share lifts with it'); return; }
    if (_posts === null) { toast('The club feed is almost here'); return; }
    openShareSheet(log);
  }

  window.renderClubTab = renderClubTab;
  window.rankClubMembers = rankClubMembers;   // pure — unit-tested in tests.html
  window.weekChallenge = weekChallenge;       // pure — unit-tested in tests.html
  window.clubWeekPulse = clubWeekPulse;       // pure — unit-tested in tests.html
  window.shareableSets = shareableSets;       // pure — unit-tested in tests.html
  window.sessionSummary = sessionSummary;     // pure — unit-tested in tests.html
  window.clubWeekScore = clubWeekScore;       // pure — unit-tested in tests.html
  window.clubImprovePct = clubImprovePct;     // pure — unit-tested in tests.html
  window.seasonOf = seasonOf;                 // pure — unit-tested in tests.html
  window.clubSeasonScore = clubSeasonScore;   // pure — unit-tested in tests.html
  window.seasonChampion = seasonChampion;     // pure — unit-tested in tests.html
  const cachedName = () => { if (isDemo()) return window._demoClubLeft ? null : 'Iron Temple Barbell'; if (_data && _data.club) return _data.club.name; try { return localStorage.getItem('powa-club-name') || null; } catch (e) { return null; } };
  // After a logged set: push my row a little later (one write per burst of sets),
  // so the weekly board is live without anyone opening the Club tab.
  let _syncT = null;
  function syncSoon() {
    if (isDemo() || !cachedName()) return;
    clearTimeout(_syncT);
    _syncT = setTimeout(syncMyStats, 20000);
  }
  window.PowaClubs = {
    refresh: () => { _loaded = false; return renderClubTab(); },
    cachedName,
    shareLog,
    myClubStats,
    syncMyStats,
    syncSoon,
    openLifterCard,
    openClubTV,
    openInviteSheet: () => { if (_data && _data.club) openInviteSheet(_data.club); }
  };
})();
