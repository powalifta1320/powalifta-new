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
  let _mode = 'dots';      // board ranking: 'dots' | 'week'
  let _view = 'feed';      // club view: 'feed' | 'board'
  let _posts = null;       // club posts, newest first | null (feed not switched on)
  let _requests = [];      // owner/admin: pending requests to join
  let _container = null;
  let _dirSeq = 0;         // drops stale directory searches
  let _unsubFeed = null;   // live feed channel teardown
  let _morePosts = null;   // false once an older-posts page comes back short
  let _feedClubId = null;
  let _codeSheetShown = false;

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
    check: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="2.4"')
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
    const logs = ((Store.get().workoutLogs) || []).filter(l => l.athleteId === u.id && l.date >= wk);
    const r1 = (v) => (v > 0 ? Math.round(v * 10) / 10 : null);
    return {
      displayName: u.name || 'Lifter', sex,
      bodyweightKg: bw ? Math.round(bw * 10) / 10 : null,
      squatKg: r1(sq), benchKg: r1(bn), deadliftKg: r1(dl), totalKg: r1(total), dots: r1(dots),
      weekStart: wk,
      weekSessions: new Set(logs.map(l => l.date)).size,
      weekTonnageKg: Math.round(logs.reduce((a, l) => a + (Number(l.weight) || 0) * (Number(l.reps) || 0), 0))
    };
  }

  // ---- pure helpers (unit-tested in tests.html) -------------------------------
  // Rank members for the board. DOTS mode ranks by DOTS (members with no
  // numbers yet sit at the bottom, unranked); week mode by sessions then tonnage.
  // Standard competition ranking — ties share a rank, the next one skips.
  function rankClubMembers(members, mode, weekStart) {
    const wk = weekStart || mondayISO();
    const score = mode === 'week'
      ? (m) => (m.weekStart === wk ? (m.weekSessions || 0) * 1e7 + (m.weekTonnageKg || 0) : 0)
      : (m) => m.dots || 0;
    const sorted = (members || []).slice().sort((a, b) =>
      score(b) - score(a) || (b.totalKg || 0) - (a.totalKg || 0) ||
      String(a.displayName || '').localeCompare(String(b.displayName || '')));
    let rank = 0, prev = null;
    return sorted.map((m, i) => {
      const s = score(m);
      if (s !== prev) { rank = i + 1; prev = s; }
      return Object.assign({}, m, { rank: s > 0 ? rank : null });
    });
  }

  // The club's week in three numbers.
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
    const seed = [
      ['Sarah Kim', 'female', 62.4, 145, 82.5, 172.5, 4, 9850],
      ['Arjun Mehta', 'male', 82.1, 215, 140, 250, 3, 14200],
      ['Tom Boyle', 'male', 104.6, 240, 160, 280, 1, 5200],
      ['Nina Petrova', 'female', 71.8, 150, 87.5, 185, 5, 11800],
      ['Marcus Hale', 'male', 92.7, 230, 152.5, 270, 2, 9100],
      ['Priya Shah', 'female', 56.9, 120, 67.5, 150, 3, 6400],
      ['Jonah Reyes', 'male', 74.3, 190, 125, 225, 4, 12300],
      ['Ella Nowak', 'female', 83.5, 165, 95, 195, 0, 0],
      ['Kofi Mensah', 'male', 119.2, 275, 185, 300, 2, 13100]
    ];
    const members = seed.map((s, i) => {
      const total = s[3] + s[4] + s[5];
      return {
        clubId: 'demo-club', userId: 'demo-m' + i, role: i === 1 ? 'owner' : 'member',
        displayName: s[0], sex: s[1], bodyweightKg: s[2], squatKg: s[3], benchKg: s[4], deadliftKg: s[5],
        totalKg: total, dots: Math.round(dotsScore(total, s[2], s[1]) * 10) / 10,
        weekStart: wk, weekSessions: s[6], weekTonnageKg: s[7]
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

  // ---- load ------------------------------------------------------------------
  async function load() {
    const u = me();
    if (isDemo()) {
      _data = window._demoClubLeft ? null : demoClubData();
      _posts = _data ? demoPosts() : null;
      _requests = [];
      _loaded = true; return;
    }
    if (!u || !window.DB || !DB.getMyClub) { _data = null; _loaded = true; return; }
    try { _data = await DB.getMyClub(u.id); } catch (e) { _data = null; }
    _loaded = true;
    if (_data) {
      const staff = _data.role === 'owner' || _data.role === 'admin';
      const [posts, reqs] = await Promise.all([
        DB.listClubPosts ? DB.listClubPosts(_data.club.id).catch(() => null) : null,
        staff && DB.listClubRequests ? DB.listClubRequests(_data.club.id).catch(() => []) : []
      ]);
      _posts = posts; _requests = reqs || []; _morePosts = null;
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
    } else { _posts = null; _requests = []; watchFeed(null); }
    try { localStorage.setItem('powa-club-name', _data && _data.club ? _data.club.name : ''); } catch (e) {}
  }

  // Live feed: a member's new post slides in at the top while you're looking.
  // (Your own posts arrive here too; the id check drops the echo.)
  function watchFeed(clubId) {
    if (clubId === _feedClubId) return;
    if (_unsubFeed) { try { _unsubFeed(); } catch (e) {} _unsubFeed = null; }
    _feedClubId = clubId;
    if (!clubId || isDemo() || !window.DB || !DB.subscribeClubPosts) return;
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
    invite.addEventListener('click', () => shareClub(club));
    top.appendChild(invite);
    hero.appendChild(top);
    if (club.description) hero.appendChild(el('p', { class: 'club-desc' }, club.description));
    const stats = el('div', { class: 'rh-stats' });
    const cell = (val, unit, label, tone) => {
      const c = el('div', { class: 'rh-stat' + (tone ? ' tone-' + tone : '') });
      c.appendChild(el('b', { html: escHtml(String(val)) + (unit ? '<small>' + escHtml(unit) + '</small>' : '') }));
      c.appendChild(el('span', {}, label));
      return c;
    };
    const ton = kgToDisplay(pulse.tonnageKg) || 0;
    stats.appendChild(cell(pulse.sessions, '', 'Sessions', pulse.sessions ? 'acc' : null));
    stats.appendChild(cell(ton >= 10000 ? (Math.round(ton / 100) / 10).toLocaleString() : Math.round(ton).toLocaleString(), ton >= 10000 ? (getUnit() === 'lbs' ? 'k lb' : 't') : unitLabel(), 'Moved'));
    stats.appendChild(cell(pulse.active + '/' + pulse.total, '', 'Trained', pulse.active ? 'ok' : null));
    hero.appendChild(stats);
    root.appendChild(hero);

    // Owner/admin: who's waiting to get in.
    if (staff && _requests.length) root.appendChild(requestsRow());

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

  const KIND_LABEL = { pr: 'New PR', session: 'Session', set: '', note: '' };
  function postCard(p) {
    const card = el('article', { class: 'cp-card' + (p.kind === 'pr' ? ' is-pr' : '') + (p._fresh ? ' is-fresh' : '') });
    delete p._fresh;
    const head = el('div', { class: 'cp-head' });
    head.appendChild(el('span', { class: 'cp-av', 'data-name': p.displayName }, initials(p.displayName)));
    const who = el('div', { class: 'cp-who' });
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
    if (p.caption) card.appendChild(el('p', { class: 'cp-cap' }, p.caption));
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
        Object.assign(body, { clubId: _data.club.id, userId: u.id, caption: cap.value.trim() });
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
        } catch (e) { toast(e.message || 'Couldn\'t post. Try again'); }
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
    const head = el('div', { class: 'club-board-head' });
    head.appendChild(el('span', { class: 'cbh-title' }, 'Ranked by'));
    head.appendChild(segmented([['dots', 'DOTS'], ['week', 'This week']], _mode,
      (m) => { _mode = m; renderClub(_container); }, 'Rank the club by', 'club-rank-seg'));
    root.appendChild(head);

    const board = el('div', { class: 'club-board ui-list' });
    rankClubMembers(members, _mode, wk).forEach(m => {
      const isMe = u && m.userId === u.id;
      const medal = m.rank === 1 ? ' gold' : m.rank === 2 ? ' silver' : m.rank === 3 ? ' bronze' : '';
      const row = el('div', { class: 'club-row' + (isMe ? ' is-me' : '') + (medal ? ' medal' + medal : '') });
      row.appendChild(el('span', { class: 'cr-rank' + medal }, m.rank == null ? '–' : String(m.rank)));
      row.appendChild(el('span', { class: 'cr-av', 'data-name': m.displayName || '?' }, initials(m.displayName || '?')));
      const id = el('span', { class: 'cr-id' });
      const nm = el('span', { class: 'cr-name' }, m.displayName || 'Lifter');
      if (isMe) nm.appendChild(el('em', {}, 'You'));
      if (m.role === 'owner') nm.appendChild(el('em', { class: 'cr-tag' }, 'Owner'));
      id.appendChild(nm);
      const cls = m.bodyweightKg ? weightClassFor(m.bodyweightKg, m.sex) : null;
      const meta = [m.sex === 'female' ? 'F' : (m.sex === 'male' ? 'M' : null), cls,
        _mode === 'week' ? (m.weekStart === wk && m.weekTonnageKg ? formatWeight(m.weekTonnageKg, 0) + ' moved' : null)
                         : (m.totalKg ? formatWeight(m.totalKg, 0) + ' total' : null)].filter(Boolean).join(' · ');
      id.appendChild(el('span', { class: 'cr-meta' }, meta || 'No numbers yet'));
      row.appendChild(id);
      const val = el('span', { class: 'cr-val' });
      if (_mode === 'week') {
        const n = m.weekStart === wk ? (m.weekSessions || 0) : 0;
        val.innerHTML = '<b>' + n + '</b><small>' + (n === 1 ? 'session' : 'sessions') + '</small>';
      } else {
        val.innerHTML = '<b>' + fmtNum(m.dots) + '</b><small>DOTS</small>';
      }
      row.appendChild(val);
      board.appendChild(row);
    });
    root.appendChild(board);
    root.appendChild(el('p', { class: 'club-fine' }, 'Your club sees your name, class, best lifts, DOTS and how often you train, plus anything you post. Never your program or logs.'));
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
    const pre = new URLSearchParams(location.search).get('club');
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
    if (isDemo()) { window._demoClubLeft = false; toast('Joined: welcome to the club'); _loaded = false; renderClubTab(); return true; }
    if (btn) { btn.disabled = true; }
    try {
      await DB.joinClub(code, (me() || {}).name);
      try { localStorage.removeItem('powa-club-stats'); } catch (e) {}
      toast('Joined: welcome to the club');
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
      if (isDemo()) { toast('Preview only in demo mode'); m.classList.remove('open'); return; }
      create.disabled = true;
      try {
        await DB.createClub({ name: n, city: city.value, description: desc.value, visibility: vis.dataset.value, displayName: (me() || {}).name });
        m.classList.remove('open');
        toast('Club created: share the code to fill it');
        _loaded = false; _view = 'feed';
        await renderClubTab();
      } catch (e) { toast(e.message || 'Couldn\'t create the club'); }
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
        if (isDemo()) { toast('Preview only in demo mode'); return; }
        save.disabled = true;
        try { await DB.updateClub(club.id, { name: name.value, city: city.value, description: desc.value, visibility: vis.dataset.value }); toast('Saved'); m.classList.remove('open'); _loaded = false; renderClubTab(); }
        catch (e) { toast(e.message || 'Couldn\'t save'); }
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
  window.clubWeekPulse = clubWeekPulse;       // pure — unit-tested in tests.html
  window.shareableSets = shareableSets;       // pure — unit-tested in tests.html
  window.sessionSummary = sessionSummary;     // pure — unit-tested in tests.html
  window.PowaClubs = {
    refresh: () => { _loaded = false; return renderClubTab(); },
    cachedName: () => { if (isDemo()) return window._demoClubLeft ? null : 'Iron Temple Barbell'; if (_data && _data.club) return _data.club.name; try { return localStorage.getItem('powa-club-name') || null; } catch (e) { return null; } },
    shareLog,
    myClubStats
  };
})();
