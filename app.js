/* POWALIFTA — shared utilities, e1RM, variants
 * Storage is now Supabase via db.js. The Store object below is an
 * in-memory cache populated by DB.hydrateAll() on bootstrap.
 */

// =========================================================
// IN-MEMORY STORE
// =========================================================
const defaultStore = () => ({
  coaches: [],
  athletes: [],
  invites: [],
  programs: [],
  programTemplates: [],
  workoutLogs: [],
  bodyweight: [],
  sessionNotes: [],
  goals: [],
  restDays: [],
  messages: [],
  meets: []
});

const Store = {
  _data: defaultStore(),
  get() { return this._data; },
  set(s) { this._data = s; },
  update(fn) { fn(this._data); return this._data; },
  reset() { this._data = defaultStore(); }
};
window.Store = Store;

// =========================================================
// AUTH
// =========================================================
// IDs for top-level rows (prog/tpl/log/bw/note/rest) hit Postgres uuid columns,
// so we generate real UUID v4. Nested JSONB IDs (week/day/ex/set) live inside
// the weeks blob and don't need to be UUIDs but we use the same generator
// for consistency.
function _randomUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function uid(prefix = 'id') {
  // Always return a valid UUID (Postgres uuid columns require it).
  // The prefix arg is ignored — kept for callsite compatibility.
  return _randomUUID();
}

// Auth lives in Supabase. Current user is hydrated on bootstrap.
function getCurrentUser() {
  return window._user || null;
}
// Leaving for the welcome screen on purpose (signed out, stale session, deleted
// account): forget the remembered role and tell index.html's launch script not to
// route straight back into a dashboard.
function _toWelcome() {
  try { localStorage.removeItem('powa-last-role'); sessionStorage.setItem('powa-no-autoroute', '1'); } catch (e) {}
  location.href = 'index.html';
}
function requireAuth(expectedType) {
  const user = getCurrentUser();
  if (!user) { _toWelcome(); return null; }
  if (expectedType && user.userType !== expectedType) {
    location.href = user.userType === 'coach' ? 'coach.html' : 'athlete.html';
    return null;
  }
  return user;
}
async function logout() {
  try { if (window._user && window._user.id) _clearSnapshot(window._user.id); } catch (e) {}
  // Wipe the offline write queue too: it holds the OUTGOING user's edits, keyed
  // by their athlete id. Leaving it would replay their writes under the next
  // user's session — RLS rejects them, the attempt counter burns up, and they're
  // silently dropped while the new user sees bogus "couldn't sync" toasts.
  try { localStorage.removeItem(_OUTBOX_KEY); localStorage.removeItem(_OUTBOX_ATTEMPTS_KEY); } catch (e) {}
  try { await DB.signOut(); } catch (e) { console.warn(e); }
  window._user = null;
  Store.reset();
  _toWelcome();
}

// =========================================================
// LIVE DEMO MODE — the full athlete dashboard with a generated
// 16-week training history. No account, no writes, no risk.
// Activated by ?demo=1 on athlete.html. All persistence no-ops.
// =========================================================
window._demoMode = /[?&]demo=1/.test(location.search);

function _buildDemoData() {
  const DA = 'demo-athlete', DC = 'demo-coach';
  const iso = d => d.toISOString().slice(0, 10);
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  // Deterministic jitter so the demo looks organic but identical every load
  const j = (seed, range) => Math.round((Math.sin(seed * 12.9898) * 0.5 + 0.5) * range * 2) / 2;

  const user = {
    id: DA, name: 'Demo Lifter', email: 'demo@powalifta.com', bio: '',
    coachId: DC, userType: 'athlete', isAdmin: false,
    subscriptionTier: 'free', subscriptionStatus: 'inactive', avatarUrl: null, countryCode: null,
    instagram: 'demo.lifter',
    tiktok: 'demo.lifter',
    referralCode: 'DEMO42', referredByCode: null
  };
  const coaches = [{ id: DC, name: 'Demo Coach', email: 'coach@powalifta.com', bio: 'This is what your coach sees and writes.', avatarUrl: null, countryCode: null, createdAt: Date.now() }];

  // --- 16 weeks of logged history: Mon=squat, Wed=bench, Fri=deadlift ---
  const workoutLogs = [];
  const cfg = [
    { lift: 'squat', base: 142.5, perWk: 1.25, variant: 'Paused', varPct: 0.82, acc: ['legs', 'Leg Press'] },
    { lift: 'bench', base: 92.5, perWk: 0.75, variant: 'Close Grip', varPct: 0.88, acc: ['push', 'DB Incline Press'] },
    { lift: 'deadlift', base: 175, perWk: 1.5, variant: 'Deficit', varPct: 0.85, acc: ['pull', 'Barbell Row'] }
  ];
  let logSeq = 1;
  for (let w = 15; w >= 0; w--) {
    cfg.forEach((c2, di) => {
      const date = daysAgo(w * 7 + (5 - di * 2)); // Fri/Wed/Mon spread
      const top = c2.base + (15 - w) * c2.perWk + j(w * 3 + di, 2.5) - 1.25;
      // Top sets
      [[5, 7.5], [5, 8], [3, 8.5]].forEach(([reps, rpe], si) => {
        const wgt = Math.round((top - si * 2.5) / 2.5) * 2.5;
        workoutLogs.push({
          id: 'demo-log-' + (logSeq++), athleteId: DA, lift: c2.lift, variant: 'Competition', exerciseName: '',
          weight: wgt, reps: reps, rpe: rpe,
          e1rm: calcE1RM(wgt, reps, rpe), e1rmComp: calcCompE1RM(wgt, reps, rpe, c2.lift, 'Competition'),
          date: date, note: ''
        });
      });
      // Variant work
      const vw = Math.round(top * c2.varPct / 2.5) * 2.5;
      workoutLogs.push({
        id: 'demo-log-' + (logSeq++), athleteId: DA, lift: c2.lift, variant: c2.variant, exerciseName: '',
        weight: vw, reps: 4, rpe: 8,
        e1rm: calcE1RM(vw, 4, 8), e1rmComp: calcCompE1RM(vw, 4, 8, c2.lift, c2.variant),
        date: date, note: ''
      });
      // Accessory
      const aw = 40 + (15 - w) * 0.5;
      workoutLogs.push({
        id: 'demo-log-' + (logSeq++), athleteId: DA, lift: c2.acc[0], variant: '', exerciseName: c2.acc[1],
        weight: aw, reps: 10, rpe: 8,
        e1rm: calcE1RM(aw, 10, 8), e1rmComp: calcE1RM(aw, 10, 8),
        date: date, note: ''
      });
    });
  }

  // --- Bodyweight: gentle recomp over 16 weeks ---
  const bodyweight = [];
  for (let d = 110; d >= 0; d -= 2) {
    bodyweight.push({ id: 'demo-bw-' + d, athleteId: DA, date: daysAgo(d), weight: Math.round((84.2 - (110 - d) * 0.012 + j(d, 0.6) - 0.3) * 10) / 10 });
  }

  const goals = [{ id: DA, athleteId: DA, squat: 200, bench: 130, deadlift: 240, total: 570, bodyweight: 83, bwDirection: 'maintain' }];
  const restDays = [2, 9, 16, 23].map(d => ({ id: 'demo-rest-' + d, athleteId: DA, date: daysAgo(d), note: '' }));

  // --- Current program: 4 weeks, today's session pinned and ready to tick ---
  const mkSet = (weight, reps, rpe, done, dt) => ({
    id: uid('set'), weight, reps, rpe,
    completed: !!done, actualRpe: done ? rpe + 0.5 : null, completedAt: done ? dt : null
  });
  const mkDay = (name, exs, done, dt, pin) => {
    const day = { id: uid('day'), name, exercises: exs.map(e2 => ({ id: uid('ex'), lift: e2[0], variant: e2[1], exerciseName: e2[2] || '', note: e2[4] || '', sets: e2[3].map(s2 => mkSet(s2[0], s2[1], s2[2], done, dt)) })) };
    if (pin) day.scheduledDate = pin;
    return day;
  };
  const weeks = [];
  for (let wn = 1; wn <= 4; wn++) {
    const bump = (wn - 1) * 2.5;
    const wkDone = wn <= 2;            // weeks 1–2 fully logged
    const dt = daysAgo((4 - wn) * 7 + 3);
    const pinToday = (wn === 3);       // week 3, day 1 = today's live session
    weeks.push({
      id: uid('wk'), number: wn, days: [
        mkDay('Squat Day', [
          ['squat', 'Competition', '', [[160 + bump, 5, 7.5], [160 + bump, 5, 8], [157.5 + bump, 3, 8.5]], 'Stay tight at the bottom. Drive up hard.'],
          ['squat', 'Paused', '', [[132.5 + bump, 4, 8], [132.5 + bump, 4, 8]], '2-count pause.'],
          ['legs', '', 'Leg Press', [[120, 10, 8], [120, 10, 8]]]
        ], wkDone, dt, pinToday ? iso(new Date()) : null),
        mkDay('Bench Day', [
          ['bench', 'Competition', '', [[105 + bump, 5, 7.5], [105 + bump, 5, 8], [102.5 + bump, 3, 8.5]], 'Leg drive. Touch and go.'],
          ['bench', 'Close Grip', '', [[92.5 + bump, 4, 8], [92.5 + bump, 4, 8]]],
          ['push', '', 'DB Incline Press', [[32.5, 10, 8], [32.5, 10, 8]]]
        ], wkDone, dt),
        mkDay('Deadlift Day', [
          ['deadlift', 'Competition', '', [[197.5 + bump, 4, 7.5], [197.5 + bump, 4, 8], [195 + bump, 2, 8.5]], 'Slack out of the bar before you pull.'],
          ['deadlift', 'Deficit', '', [[167.5 + bump, 3, 8], [167.5 + bump, 3, 8]]],
          ['pull', '', 'Barbell Row', [[80, 10, 8], [80, 10, 8]]]
        ], wkDone, dt),
        mkDay('Rest', [], false, null)
      ]
    });
  }
  const programs = [{ id: 'demo-prog', athleteId: DA, coachId: DC, name: 'Strength Block · Wave 2', weeks }];

  const sessionNotes = [
    // Dated TODAY so the live session leads with the "Coach feedback" card —
    // the clearest signal in the demo that a real coach is programming for you.
    { id: 'demo-note-today', athleteId: DA, weekId: null, dayId: null, date: iso(new Date()), note: '', coachComment: 'Before today: the top set is RPE 8.5. Leave 1–2 in the tank, this isn\'t a max. Back-offs at 8. Film the heavy single and drop it in the form-check tab, I want eyes on your brace out of the hole.', coachCommentAt: iso(new Date()) + 'T08:30:00Z', coachId: DC },
    { id: 'demo-note-1', athleteId: DA, weekId: null, dayId: null, date: daysAgo(2), note: 'Pulls felt heavy off the floor today but lockout was easy.', coachComment: 'Bar speed on video looked fine. That\'s just deficit fatigue. We deload in two weeks. Keep the openers honest.', coachCommentAt: daysAgo(1) + 'T10:00:00Z', coachId: DC },
    { id: 'demo-note-2', athleteId: DA, weekId: null, dayId: null, date: daysAgo(7), note: 'Bench PR! Moved fast.', coachComment: 'Saw it. Adding 2.5kg to your top sets.', coachCommentAt: daysAgo(6) + 'T10:00:00Z', coachId: DC }
  ];
  const checkins = [{ id: 'demo-ci-1', athleteId: DA, weekStart: daysAgo(9), sleep: 7, soreness: 6, stress: 4, feel: 8, note: 'Good week.', createdAt: daysAgo(9) + 'T08:00:00Z' }];

  // A live thread with the coach. The Coach tab weaves these together with the
  // session notes above into one conversation history (see renderMessageThread).
  const at = (n, hh, mm) => daysAgo(n) + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00Z';
  const messages = [
    { id: 'demo-amsg-1', coachId: DC, athleteId: DA, senderId: DC, body: 'Heavy single on squat today. Film it and drop it in the form-check tab. I want eyes on your brace out of the hole.', createdAt: at(2, 8, 30), readAt: at(2, 9, 0) },
    { id: 'demo-amsg-2a', coachId: DC, athleteId: DA, senderId: DA, body: 'Competition Squat: 160 kg × 3 @ RPE 8 (e1RM 179 kg)', meta: { type: 'set', lift: 'squat', name: 'Competition Squat', weightKg: 160, reps: 3, rpe: 8, e1rmKg: 179.0 }, createdAt: at(2, 18, 3), readAt: at(2, 19, 0) },
    { id: 'demo-amsg-2', coachId: DC, athleteId: DA, senderId: DA, body: 'Will do. Felt a little soft out of the bottom last week, not sure if it was the brace or just fatigue.', createdAt: at(2, 18, 5), readAt: at(2, 19, 0) },
    { id: 'demo-amsg-3', coachId: DC, athleteId: DA, senderId: DC, body: 'Could be both. Big air, brace hard, then break at the hips. Send the clip and I\'ll tell you which one it is.', createdAt: at(1, 7, 45), readAt: null }
  ];

  // --- Competition history: two past meets so Progress shows a best total + a
  // PR trend. Best successful lift per discipline (kg). ---
  const meets = [
    { id: 'demo-meet-1', athleteId: DA, name: 'Winter Open', date: daysAgo(217), federation: 'USAPL', weightClass: '83kg', bodyweight: 82.6, squat: 175, bench: 110, deadlift: 205, notes: 'First meet: went 8/9, missed third squat.', createdAt: daysAgo(217) + 'T18:00:00Z' },
    { id: 'demo-meet-2', athleteId: DA, name: 'Spring Classic', date: daysAgo(96), federation: 'USAPL', weightClass: '83kg', bodyweight: 82.9, squat: 185, bench: 115, deadlift: 215, notes: '9/9 day. New total PR.', createdAt: daysAgo(96) + 'T18:00:00Z' }
  ];

  return {
    user: user,
    store: {
      coaches, athletes: [], invites: [], programs, programTemplates: [],
      workoutLogs, bodyweight, sessionNotes, goals, restDays, checkins, messages, meets,
      messageReactions: [{ messageId: 'demo-amsg-2a', userId: DC, reaction: 'fire' }],
      marketplacePrograms: [], mySales: [], myPurchases: []
    }
  };
}

// Coach-side demo: a living roster — flags, compliance, notes inbox, check-ins.
function _buildCoachDemoData() {
  const DC = 'demo-coach';
  const iso = d => d.toISOString().slice(0, 10);
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

  const user = {
    id: DC, name: 'Demo Coach', email: 'demo-coach@powalifta.com', bio: 'This is your seat.',
    coachId: null, userType: 'coach', isAdmin: false,
    subscriptionTier: 'pro', subscriptionStatus: 'active', avatarUrl: null, countryCode: null,
    referralCode: 'COACH7', referredByCode: null
  };

  // Roster engineered to show every flag state
  const roster = [
    { id: 'demo-a1', name: 'Arjun Mehta', email: 'arjun@demo.com', lastTrained: 0, base: { s: 170, b: 110, d: 210 } },
    { id: 'demo-a2', name: 'Sarah Kim', email: 'sarah@demo.com', lastTrained: 2, base: { s: 120, b: 70, d: 150 } },
    { id: 'demo-a3', name: 'Tom Boyle', email: 'tom@demo.com', lastTrained: 9, base: { s: 200, b: 140, d: 250 } },
    { id: 'demo-a4', name: 'Nina Petrova', email: 'nina@demo.com', lastTrained: null, base: { s: 90, b: 50, d: 110 } }
  ];
  const igs = { 'demo-a1': 'arjun.pulls', 'demo-a2': 'sarah.lifts' };
  const athletes = roster.map(r => ({ id: r.id, name: r.name, email: r.email, coachId: DC, avatarUrl: null, countryCode: null, instagram: igs[r.id] || null }));

  const workoutLogs = [];
  let seq = 1;
  roster.forEach(r => {
    if (r.lastTrained == null) return; // Nina hasn't started
    for (let w = 5; w >= 0; w--) {
      [['squat', r.base.s], ['bench', r.base.b], ['deadlift', r.base.d]].forEach(([lift, base], di) => {
        const off = w * 7 + di * 2 + r.lastTrained;
        if (off > 42) return;
        const date = daysAgo(off);
        const top = base + (5 - w) * 1.25;
        [[5, 7.5], [5, 8], [3, 8.5]].forEach(([reps, rpe], si) => {
          const wgt = Math.round((top - si * 2.5) / 2.5) * 2.5;
          workoutLogs.push({
            id: 'demo-clog-' + (seq++), athleteId: r.id, lift, variant: 'Competition', exerciseName: '',
            weight: wgt, reps, rpe, e1rm: calcE1RM(wgt, reps, rpe),
            e1rmComp: calcCompE1RM(wgt, reps, rpe, lift, 'Competition'), date, note: ''
          });
        });
      });
    }
  });

  // One 3-week program per athlete; completion mirrors their training recency
  const mkSet2 = (weight, reps, rpe, done) => ({ id: uid('set'), weight, reps, rpe, completed: !!done, actualRpe: done ? rpe : null, completedAt: done ? daysAgo(3) : null });
  const programs = roster.map((r, ri) => ({
    id: 'demo-cprog-' + ri, athleteId: r.id, coachId: DC, name: ['Strength Block', 'Hypertrophy Wave', 'Meet Prep', 'Foundation'][ri],
    weeks: [1, 2, 3].map(wn => ({
      id: uid('wk'), number: wn, days: [
        { id: uid('day'), name: 'Squat Day', exercises: [{ id: uid('ex'), lift: 'squat', variant: 'Competition', exerciseName: '', note: 'Drive hard out of the hole.', sets: [mkSet2(r.base.s, 5, 7.5, r.lastTrained != null && wn === 1), mkSet2(r.base.s, 5, 8, r.lastTrained != null && wn === 1)] }] },
        { id: uid('day'), name: 'Bench Day', exercises: [{ id: uid('ex'), lift: 'bench', variant: 'Competition', exerciseName: '', note: '', sets: [mkSet2(r.base.b, 5, 7.5, r.lastTrained != null && wn === 1), mkSet2(r.base.b, 5, 8, false)] }] },
        { id: uid('day'), name: 'Deadlift Day', exercises: [{ id: uid('ex'), lift: 'deadlift', variant: 'Competition', exerciseName: '', note: '', sets: [mkSet2(r.base.d, 4, 7.5, false), mkSet2(r.base.d, 4, 8, false)] }] },
        { id: uid('day'), name: 'Rest', exercises: [] }
      ]
    }))
  }));

  const sessionNotes = [
    { id: 'demo-cn-1', athleteId: 'demo-a1', weekId: null, dayId: null, date: daysAgo(0), note: 'Top set moved like an opener. Want to try 175 next week?', coachComment: null, coachCommentAt: null, coachId: null },
    { id: 'demo-cn-2', athleteId: 'demo-a3', weekId: null, dayId: null, date: daysAgo(9), note: 'Work has been brutal, missed two sessions. Back Monday.', coachComment: null, coachCommentAt: null, coachId: null },
    { id: 'demo-cn-3', athleteId: 'demo-a2', weekId: null, dayId: null, date: daysAgo(2), note: 'Bench paused reps felt way stronger.', coachComment: 'That\'s the pause work paying off. Same weights next week, then we move.', coachCommentAt: daysAgo(1) + 'T09:00:00Z', coachId: DC }
  ];
  const checkins = [
    { id: 'demo-cci-1', athleteId: 'demo-a1', weekStart: daysAgo(3), sleep: 8, soreness: 4, stress: 3, feel: 9, note: 'Feeling strong.', createdAt: daysAgo(3) + 'T08:00:00Z' },
    { id: 'demo-cci-2', athleteId: 'demo-a3', weekStart: daysAgo(10), sleep: 4, soreness: 8, stress: 9, feel: 3, note: 'Rough week.', createdAt: daysAgo(10) + 'T08:00:00Z' }
  ];
  // Per-athlete bodyweight so the pound-for-pound board has data. Weights are
  // picked so relative-strength rank differs from raw total (Arjun, lightest,
  // outranks heavier Tom) — that contrast is the whole point of the board.
  // Nina never started, so she's left out and the board skips her.
  const bodyweight = [];
  [{ a: 'demo-a1', kg: 74.8 }, { a: 'demo-a2', kg: 62.9 }, { a: 'demo-a3', kg: 105.3 }].forEach(b => {
    [14, 7, 1].forEach((d, i) => {
      bodyweight.push({ id: 'demo-cbw-' + b.a + '-' + d, athleteId: b.a, date: daysAgo(d), weight: Math.round((b.kg + (2 - i) * 0.5) * 10) / 10, unit: 'kg' });
    });
  });
  // Seeded conversations so the Messages inbox is alive: an active back-and-forth
  // (Arjun, ends on an unread question), a wrapped-up exchange (Sarah), a re-engaged
  // absentee (Tom, unread), and Nina with nothing yet (shows the empty state).
  const at = (n, hh, mm) => daysAgo(n) + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00Z';
  const messages = [
    { id: 'demo-msg-1', coachId: DC, athleteId: 'demo-a1', senderId: DC, body: 'Squat day today: one top single at RPE 8.5, then two back-offs at 8. Don\'t chase a max, just move it clean.', createdAt: at(4, 9, 15), readAt: at(4, 18, 0) },
    { id: 'demo-msg-1b', coachId: DC, athleteId: 'demo-a1', senderId: 'demo-a1', body: 'Competition Squat: 172.5 kg × 1 @ RPE 8 (e1RM 185 kg)', meta: { type: 'set', lift: 'squat', name: 'Competition Squat', weightKg: 172.5, reps: 1, rpe: 8, e1rmKg: 184.8, pr: true }, createdAt: at(4, 18, 38), readAt: at(4, 19, 0) },
    { id: 'demo-msg-2', coachId: DC, athleteId: 'demo-a1', senderId: 'demo-a1', body: 'Hit 172.5 for the single, honestly felt like an opener.', createdAt: at(4, 18, 40), readAt: at(4, 19, 0) },
    { id: 'demo-msg-3', coachId: DC, athleteId: 'demo-a1', senderId: DC, body: 'That\'s exactly what I wanted to see. We\'ll go to 175 next week and hold the back-offs.', createdAt: at(4, 19, 2), readAt: at(4, 20, 0) },
    { id: 'demo-msg-4', coachId: DC, athleteId: 'demo-a1', senderId: 'demo-a1', body: 'Quick one: sleeves on for the heavy sets or save them for the meet?', createdAt: at(1, 7, 30), readAt: null },
    { id: 'demo-msg-5', coachId: DC, athleteId: 'demo-a2', senderId: 'demo-a2', body: 'Paused bench is finally clicking, the reps moved way faster this week.', createdAt: at(3, 12, 10), readAt: at(2, 8, 0) },
    { id: 'demo-msg-6', coachId: DC, athleteId: 'demo-a2', senderId: DC, body: 'Good. Same weights once more, then we add load. The pause is buying you a stronger press off the chest.', createdAt: at(2, 8, 20), readAt: at(2, 9, 0) },
    { id: 'demo-msg-7', coachId: DC, athleteId: 'demo-a3', senderId: DC, body: 'Haven\'t seen a log in over a week. Everything alright?', createdAt: at(8, 10, 0), readAt: at(8, 11, 0) },
    { id: 'demo-msg-8', coachId: DC, athleteId: 'demo-a3', senderId: 'demo-a3', body: 'Yeah man, work\'s been brutal. Back in Monday, promise.', createdAt: at(1, 22, 15), readAt: null }
  ];
  const invites = [{ code: 'DEMO42', coachId: DC, email: '', used: false, createdAt: Date.now() }];
  const programTemplates = [{
    id: 'demo-tpl-1', coachId: DC, name: '8-Week Strength Block', createdAt: Date.now(),
    payload: { weeks: programs[0].weeks }
  }];

  // Marketplace — two live listings + one in review, so the earnings
  // dashboard has real numbers (per-program breakdown, pending vs paid,
  // a "this month" figure, and a refund) instead of an empty state.
  const tsAgo = n => daysAgo(n) + 'T12:00:00Z';
  const marketplacePrograms = [
    { id: 'demo-mkt-1', coachId: DC, title: '8-Week Strength Block', description: 'A linear-to-RPE strength block for intermediate lifters chasing a bigger squat and pull. Wave loading, autoregulated top sets, built-in deloads.', tier: 'block', category: 'strength', priceCents: 2999, weekCount: 8, status: 'published', soldCount: 9, createdAt: tsAgo(120), programPayload: { weeks: programs[0].weeks }, reference1RMs: { squat: 215, bench: 140, deadlift: 260 } },
    { id: 'demo-mkt-2', coachId: DC, title: 'Peaking Protocol', description: 'A 4-week meet peak. Taper volume, sharpen openers, and walk in primed. Includes attempt-selection guidance and a final-week template.', tier: 'short', category: 'peaking', priceCents: 3999, weekCount: 4, status: 'published', soldCount: 5, createdAt: tsAgo(90), programPayload: { weeks: programs[2].weeks }, reference1RMs: { squat: 215, bench: 140, deadlift: 260 } },
    { id: 'demo-mkt-3', coachId: DC, title: 'Bench Specialization', description: 'Six weeks to a stronger press: paused work, larsen presses, and triceps overload. Built for lifters whose bench lags their squat and pull.', tier: 'short', category: 'bench', priceCents: 1999, weekCount: 6, status: 'pending_review', soldCount: 0, createdAt: tsAgo(6), programPayload: { weeks: programs[1].weeks }, reference1RMs: { bench: 140 } }
  ];
  // Sale rows: payout = 80% of price (the platform fee is 20%). Mix of
  // statuses — older sales paid out, recent ones pending, one refunded.
  // Dates are precise instants (now − N days) rather than UTC date-strings,
  // so an offset of 0 lands exactly at "now" and always counts toward the
  // current month regardless of the viewer's timezone (a date-string pinned
  // to noon UTC can fall on the wrong side of a local month boundary).
  const tsAgoMs = n => new Date(Date.now() - n * 86400000).toISOString();
  const mkSale = (i, progId, price, ago, status) => {
    const payout = Math.round(price * 0.8);
    return {
      id: 'demo-sale-' + i, marketplaceProgramId: progId, buyerId: 'demo-buyer-' + i, coachId: DC,
      amountCents: price, platformFeeCents: price - payout, coachPayoutCents: payout,
      payoutStatus: status, paidAt: status === 'paid' ? tsAgoMs(ago - 2) : null,
      lsOrderId: 'demo-ord-' + i, lsEventId: 'demo-evt-' + i, createdAt: tsAgoMs(ago)
    };
  };
  // Newest few are dated today so the "This month" tile always has a figure
  // in the demo, regardless of which day of the month it's viewed.
  const mySales = [
    mkSale(1,  'demo-mkt-1', 2999, 96, 'paid'),
    mkSale(2,  'demo-mkt-1', 2999, 88, 'paid'),
    mkSale(3,  'demo-mkt-2', 3999, 74, 'paid'),
    mkSale(4,  'demo-mkt-1', 2999, 70, 'paid'),
    mkSale(5,  'demo-mkt-2', 3999, 61, 'cancelled'), // refunded
    mkSale(6,  'demo-mkt-1', 2999, 48, 'paid'),
    mkSale(7,  'demo-mkt-2', 3999, 40, 'paid'),
    mkSale(8,  'demo-mkt-1', 2999, 33, 'paid'),
    mkSale(9,  'demo-mkt-1', 2999, 12, 'pending'),
    mkSale(10, 'demo-mkt-2', 3999, 8,  'pending'),
    mkSale(11, 'demo-mkt-1', 2999, 0,  'pending'),
    mkSale(12, 'demo-mkt-2', 3999, 0,  'pending'),
    mkSale(13, 'demo-mkt-1', 2999, 0,  'pending'),
    mkSale(14, 'demo-mkt-1', 2999, 0,  'pending')
  ];
  // Newest-first, to mirror what DB.listMySales returns (created_at desc) so
  // the "Recent sales" list shows the latest activity at the top.
  mySales.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return {
    user: user,
    store: {
      coaches: [], athletes, invites, programs, programTemplates,
      workoutLogs, bodyweight, sessionNotes, goals: [], restDays: [], checkins, messages, meets: [],
      messageReactions: [{ messageId: 'demo-msg-1b', userId: DC, reaction: 'fire' }, { messageId: 'demo-msg-6', userId: 'demo-a2', reaction: 'strong' }],
      marketplacePrograms, mySales, myPurchases: []
    }
  };
}

function _injectDemoBanner(type) {
  const bar = document.createElement('div');
  bar.className = 'demo-banner';
  const text = type === 'coach'
    ? '<strong>Live demo</strong>: fake roster, real product. Open the builder, reply to notes, check the flags. Nothing saves.'
    : '<strong>Live demo</strong>: fake lifter, real product. Tick sets, hit PRs, make share cards. Nothing saves.';
  bar.innerHTML =
    '<span class="demo-banner-dot"></span>' +
    '<span class="demo-banner-text">' + text + '</span>' +
    '<a class="btn btn-primary btn-sm" href="index.html">Start yours free</a>';
  document.body.appendChild(bar);
}

// =========================================================
// BOOTSTRAP — runs at the top of every page
//
// usage:
//   bootstrap('coach', () => { /* render coach page */ });
//   bootstrap('athlete', () => { /* render athlete page */ });
//   bootstrap(null,    () => { /* homepage — public OK */ });
//
// Redirects if auth doesn't match expected type. Hydrates Store.
// =========================================================
// ---------- REFERRALS: capture + deferred attribution ----------
const REF_KEY = 'powa-ref';
// Read ?ref=CODE off the URL and remember it until the visitor signs up / logs
// in. Codes are the 6-char unambiguous set the SQL generator produces.
function captureReferralFromUrl() {
  try {
    const m = /[?&]ref=([A-Za-z0-9]{4,16})/.exec(location.search || '');
    if (m && m[1]) localStorage.setItem(REF_KEY, m[1].toUpperCase());
  } catch (e) {}
}
// Attribute a stashed referral to the now-authenticated user. The column is
// write-once + self-referral-proof server-side, so this is safe to call on
// every load; it clears the stash once attribution is on the profile.
async function applyPendingReferral(userId, alreadyReferred) {
  let code = null;
  try { code = localStorage.getItem(REF_KEY); } catch (e) {}
  if (!userId) return;
  if (alreadyReferred) { try { localStorage.removeItem(REF_KEY); } catch (e) {} return; }
  if (!code) return;
  try {
    await DB.applyReferral(userId, code);
    try { localStorage.removeItem(REF_KEY); } catch (e) {}
  } catch (e) { console.warn('applyReferral', e); }
}
window.captureReferralFromUrl = captureReferralFromUrl;
// Club invite links (?club=CODE, the QR on a gym poster): keep the code through
// sign-up, so the Club tab offers it once the lifter is in (clubs.js renderJoin).
function captureClubFromUrl() {
  try {
    const m = /[?&]club=([A-Za-z0-9]{6})\b/.exec(location.search || '');
    if (m && m[1]) localStorage.setItem('powa-club-code', m[1].toUpperCase());
  } catch (e) {}
}
window.applyPendingReferral = applyPendingReferral;

async function bootstrap(expectedType, onReady, opts) {
  opts = opts || {};

  // Stash any ?ref=CODE the moment a page loads, before auth resolves, so the
  // attribution survives the whole signup round-trip (incl. email confirmation).
  captureReferralFromUrl();
  captureClubFromUrl();

  // Live demo: skip auth + hydration entirely, run on generated data.
  if (window._demoMode && (expectedType === 'athlete' || expectedType === 'coach')) {
    const demo = expectedType === 'coach' ? _buildCoachDemoData() : _buildDemoData();
    window._user = demo.user;
    Store._data = demo.store;
    _injectDemoBanner(expectedType);
    onReady && onReady();
    return;
  }

  let session = null;
  try { session = await DB.getSession(); }
  catch (e) {
    console.error('getSession failed', e);
    // If we can't even talk to Supabase, still let public pages render
    if (!expectedType) { onReady && onReady(); return; }
    toast('Could not reach the server. Check your connection.');
    return;
  }
  if (!session) {
    if (expectedType) { _toWelcome(); return; }
    try { Store._data.coaches = await DB.listCoaches(); } catch (e) { console.warn('coach list', e); }
    onReady && onReady();
    return;
  }
  let profile;
  try { profile = await DB.getProfile(session.user.id); }
  catch (e) {
    console.error('profile fetch failed', e);
    // Offline cold open: the session reads from local storage but the profile
    // fetch needs the network. Rather than bounce a logged-in user to the login
    // page, run from the cached snapshot if we have one for this session.
    if (expectedType && !navigator.onLine) {
      const snap = _readSnapshot(session.user.id);
      if (snap && snap.user && snap.user.userType === expectedType) {
        window._user = snap.user;
        Store._data = snap.store;
        _refreshConnBanner();
        onReady && onReady();
        return;
      }
    }
    try { await DB.signOut(); } catch {}
    if (!expectedType) { onReady && onReady(); return; }
    _toWelcome();
    return;
  }

  window._user = {
    id: profile.id, name: profile.name, email: profile.email, bio: profile.bio || '',
    coachId: profile.coach_id || null,
    userType: profile.user_type,
    isAdmin: !!profile.is_admin,
    subscriptionTier: profile.subscription_tier || 'free',
    subscriptionStatus: profile.subscription_status || 'inactive',
    avatarUrl: profile.avatar_url || null,
    countryCode: profile.country_code || null,
    instagram: profile.instagram || null,
    tiktok: profile.tiktok || null,
    referralCode: profile.referral_code || null,
    referredByCode: profile.referred_by_code || null,
    // Apple-billed coach sub (IAP)? Drives which "manage" surface shows on iOS.
    appleBilled: !!profile.apple_original_transaction_id
  };

  // Remember the role so the app can open straight into the right dashboard next
  // launch (index.html head script) instead of flashing the welcome screen.
  try { localStorage.setItem('powa-last-role', profile.user_type); } catch (e) {}

  // If a referral was stashed before this user signed up / logged in, attribute
  // it now (own-row write, idempotent + write-once server-side). Fire-and-forget
  // so it never delays the dashboard render.
  applyPendingReferral(window._user.id, !!profile.referred_by_code);

  if (!expectedType) {
    if (opts.staticPublic) {
      // Legal/info page — just populate user + coach list, don't redirect
      try { Store._data.coaches = await DB.listCoaches(); } catch (e) {}
      onReady && onReady();
      return;
    }
    // Homepage: bounce logged-in users to dashboard
    location.href = profile.user_type === 'coach' ? 'coach.html' : 'athlete.html';
    return;
  }

  if (expectedType !== profile.user_type) {
    location.href = profile.user_type === 'coach' ? 'coach.html' : 'athlete.html';
    return;
  }

  try {
    Store._data = await DB.hydrateAll(profile);
    _saveSnapshot(window._user, Store._data);
  } catch (e) {
    console.error('hydrate failed', e);
    // Flaky / offline: fall back to the cached snapshot so the dashboard still
    // renders the program + history instead of a blank "try refreshing" page.
    const snap = _readSnapshot(profile.id);
    if (snap && snap.store) {
      Store._data = snap.store;
      _refreshConnBanner();
      onReady && onReady();
      return;
    }
    toast('Could not load your data. Try refreshing.');
    return;
  }

  onReady && onReady();
}
window.bootstrap = bootstrap;

// =========================================================
// THEME (light / dark)
// Stored in localStorage as 'powa-theme'. Applied via a
// data-theme attribute on <html>. Default: dark.
// =========================================================
const THEME_KEY = 'powa-theme';
function getTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  // Native shell is dark-first, ALWAYS: a light-mode POWALIFTA on a light-appearance
  // phone reads as off-brand/generic. Ignore the OS pref there (the head snippet already
  // set data-theme=dark) — the user can still switch explicitly via the Settings toggle.
  try {
    if (document.documentElement.classList.contains('native')) return 'dark';
  } catch {}
  // Web: honor system preference for first-time visitors (a11y). Dark otherwise —
  // the brand is dark-first; only auto-adopt an explicit "light" OS pref.
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch {}
  return 'dark';
}
function applyTheme(theme) {
  const t = (theme === 'light') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  // Update theme-color meta so mobile chrome/safari status bar matches.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#ffffff' : '#0b0b0c');
  // Notify listeners (charts, custom widgets) so they can re-render
  // with theme-aware colors. Wrap in try in case CustomEvent is unavailable.
  try { window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } })); } catch {}
}
function toggleTheme() {
  applyTheme(getTheme() === 'light' ? 'dark' : 'light');
}
window.toggleTheme = toggleTheme;
// Apply ASAP, before paint, so we don't get a dark flash in light mode.
applyTheme(getTheme());

// =========================================================
// PWA — service worker registration + install prompt banner
// We register sw.js so the site qualifies as installable. On Android/desktop
// Chrome we capture the beforeinstallprompt event and show our own button.
// On iOS we show a banner with the "Share → Add to Home Screen" instructions
// since iOS doesn't expose a programmatic install path.
// =========================================================
const PWA_DISMISSED_KEY = 'powa-pwa-dismissed';
let _deferredInstallPrompt = null;

function _isStandalone() {
  // PWA is already installed if the page is in standalone display mode
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}
function _isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function _isAndroid() {
  return /android/i.test(navigator.userAgent);
}
function _pwaDismissedRecently() {
  try {
    const t = Number(localStorage.getItem(PWA_DISMISSED_KEY) || 0);
    if (!t) return false;
    // Hide banner for 14 days after dismissal
    return (Date.now() - t) < 14 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}
function _markPwaDismissed() {
  try { localStorage.setItem(PWA_DISMISSED_KEY, String(Date.now())); } catch {}
}

// Register the service worker — WEB ONLY.
// In the native Capacitor shell the app already bundles every file (inherently
// offline) and uses APNs (not Web Push), so the SW is redundant — and worse, its
// cache served STALE assets after a bundle update ("looks old" after a sync). So
// in the native shell we skip registration AND proactively unregister + purge any
// SW/cache a previous build left behind, so the app always loads the fresh bundle.
if ('serviceWorker' in navigator) {
  const _isNativeShell = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (_isNativeShell) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
    try { if (window.caches && caches.keys) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(() => {}); } catch (e) {}
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW register failed:', err));
    });
  }
}

// ============================================================
// WEB PUSH — opt-in notifications (rest-day reminders, coach pings…)
//
// Paste your VAPID *public* key below (the private half lives only in the
// `send-push` edge function's secrets). Generate a pair once with:
//   npx web-push generate-vapid-keys
// Until this is filled in, enable() degrades to a clear toast — nothing breaks.
// On iOS, Web Push only works for a PWA added to the Home Screen (iOS 16.4+).
// ============================================================
const VAPID_PUBLIC_KEY = 'BP5JKLidsYTPOiC6V7_FrQApU6LoMgyIxrrsGpX7hYzSzsHTCNwSlkVjVUljnIZvbw2vhPbRY2GWQhZ4SlsDBcI'; // public half; private lives only in send-push secrets (see .env.vapid)

function _b64ToUint8(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const _isNativeShell = () => !!(window.PowaNative && PowaNative.isNative());

const PowaPush = {
  supported() {
    if (_isNativeShell()) return true; // native push via the Capacitor plugin
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },
  configured() {
    if (_isNativeShell()) return true; // configured natively via APNs/FCM entitlements
    return typeof VAPID_PUBLIC_KEY === 'string' && VAPID_PUBLIC_KEY.length > 20;
  },
  permission() {
    if (_isNativeShell()) return PowaNative._perm === 'granted' ? 'granted' : 'default';
    return this.supported() ? Notification.permission : 'unsupported';
  },
  async isSubscribed() {
    if (_isNativeShell()) return !!PowaNative._subscribed;
    if (!this.supported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      return !!(await reg.pushManager.getSubscription());
    } catch { return false; }
  },
  // Ask permission, subscribe, persist. Returns true on success.
  async enable() {
    // Native shell: register with APNs/FCM through the Capacitor plugin instead
    // of Web Push. The rest of the app (Settings toggle, send-push) is unchanged.
    if (_isNativeShell()) {
      if (window._demoMode) { toast('Notifications need a real account'); return false; }
      const ok = await PowaNative.registerPush();
      toast(ok ? 'Notifications on' : 'Couldn’t enable notifications: check iOS Settings › POWALIFTA');
      return ok;
    }
    if (!this.supported()) { toast('Notifications are not supported on this browser'); return false; }
    if (!this.configured()) { toast('Push not configured yet. Add a VAPID key'); return false; }
    if (window._demoMode) { toast('Notifications need a real account'); return false; }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(perm === 'denied' ? 'Notifications blocked: enable them in browser settings' : 'Notifications not enabled'); return false; }

    // Need a real signed-in user before we subscribe — there's nowhere to save it otherwise.
    const userId = window.DB ? await DB.getUserId() : null;
    if (!userId) { toast('Sign in to enable notifications'); return false; }

    // 1) Subscribe with the browser's push service (FCM / Mozilla / Apple).
    //    This is the step that fails on http origins or browsers without a push service.
    let sub;
    try {
      const reg = await navigator.serviceWorker.ready;
      sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: _b64ToUint8(VAPID_PUBLIC_KEY)
        });
      }
    } catch (err) {
      console.warn('Push subscribe failed:', err);
      toast(window.isSecureContext
        ? 'Your browser couldn’t reach a push service. Try Chrome or the installed app'
        : 'Notifications need HTTPS or the installed app');
      return false;
    }

    // 2) Persist it so the server can actually reach this device.
    //    If this fails, undo the browser subscription so the toggle never shows a false "on".
    try {
      await DB.savePushSubscription(userId, sub.toJSON(), navigator.userAgent);
    } catch (err) {
      console.warn('Saving push subscription failed:', err);
      try { await sub.unsubscribe(); } catch {}
      toast('Couldn’t save your alert settings. Please try again');
      return false;
    }

    toast('Notifications on');
    return true;
  },
  // Unsubscribe this device and forget it server-side.
  async disable() {
    if (_isNativeShell()) {
      // The OS keeps the app's registration; we just drop the token so the
      // server stops targeting this device. Full mute is in iOS/Android Settings.
      try { if (window.DB && PowaNative._token) await DB.deletePushSubscription(PowaNative._token); } catch (e) {}
      PowaNative._subscribed = false;
      toast('Notifications off');
      return true;
    }
    if (!this.supported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        if (window.DB) { try { await DB.deletePushSubscription(sub.endpoint); } catch {} }
        await sub.unsubscribe();
      }
      toast('Notifications off');
      return true;
    } catch (err) {
      console.warn('Push unsubscribe failed:', err);
      return false;
    }
  },
  // Fire a push at yourself to confirm the round-trip works.
  async test() {
    if (!window.DB) return;
    const userId = await DB.getUserId();
    if (!userId) return;
    await DB.sendPush({
      toUserId: userId,
      title: 'POWALIFTA',
      body: 'Notifications are live. Back to the bar.',
      url: '/athlete.html',
      tag: 'powa-test'
    });
  }
};
window.PowaPush = PowaPush;

// Capture the install prompt on Android/desktop Chrome
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // Show our banner if not dismissed (never in the native shell)
  if (!_isNativeShell() && !_pwaDismissedRecently() && !_isStandalone()) showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  hideInstallBanner();
});

function showInstallBanner() {
  // Never inside the native app — it's already installed from the App Store,
  // and prompting to "Add to Home Screen" would fail App Store review (3.2.2 /
  // web-wrapper signals) besides being nonsense to the user.
  if (_isNativeShell()) return;
  if (document.getElementById('pwaInstallBanner')) return;
  if (_isStandalone()) return;
  if (_pwaDismissedRecently()) return;

  // Only show on mobile or where we have a deferred prompt
  const showableOnIOS = _isIOS();
  const showableViaPrompt = !!_deferredInstallPrompt;
  if (!showableOnIOS && !showableViaPrompt) return;

  const banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';
  banner.className = 'pwa-banner';
  let body, action;
  if (_deferredInstallPrompt) {
    body = '<strong>Install POWALIFTA</strong><span>Quicker access from your home screen.</span>';
    action = '<button class="pwa-banner-cta" onclick="triggerInstall()">Install</button>';
  } else {
    // iOS: the real app is on the App Store, so point there (not "Add to Home Screen").
    // iPhone Safari already shows Apple's own app banner on pages that carry the
    // apple-itunes-app meta tag, so stay quiet there; in-app browsers (Instagram,
    // TikTok) and Chrome/Firefox on iOS have no such banner, so they get this one.
    const ua = navigator.userAgent || '';
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|musical_ly|TikTok|Line\//.test(ua);
    if (!otherBrowser && document.querySelector('meta[name="apple-itunes-app"]')) return;
    body = '<strong>Get the iPhone app</strong><span>POWALIFTA is on the App Store.</span>';
    action = '<a class="pwa-banner-cta" href="https://apps.apple.com/app/powalifta/id6788506689" target="_blank" rel="noopener" onclick="dismissInstallBanner()">Get</a>';
  }
  banner.innerHTML =
    '<div class="pwa-banner-body">' + body + '</div>' +
    action +
    '<button class="pwa-banner-close" onclick="dismissInstallBanner()" aria-label="Dismiss">×</button>';
  document.body.appendChild(banner);
}

function hideInstallBanner() {
  const b = document.getElementById('pwaInstallBanner');
  if (b) b.remove();
}
function dismissInstallBanner() {
  _markPwaDismissed();
  hideInstallBanner();
}
async function triggerInstall() {
  if (!_deferredInstallPrompt) { hideInstallBanner(); return; }
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  hideInstallBanner();
  if (outcome === 'dismissed') _markPwaDismissed();
}
window.dismissInstallBanner = dismissInstallBanner;
window.triggerInstall = triggerInstall;

// On iOS, show the banner ~3 seconds after first paint (since there's no event)
if (_isIOS() && !_isStandalone() && !_pwaDismissedRecently()) {
  window.addEventListener('load', () => setTimeout(showInstallBanner, 3000));
}

// =========================================================
// ONBOARDING TOUR
// Lightweight tour engine. Each step points at a DOM element via a CSS selector,
// shows a spotlight cutout + floating tooltip, advances with Next / closes with Skip.
// Completion is persisted per tour name in localStorage so it only auto-runs once.
//
// Usage:
//   startTour('coach', [
//     { selector: '#tab-roster', title: 'Your roster', body: 'All athletes live here.' },
//     ...
//   ]);
//
//   // To replay later:
//   resetTour('coach'); startTour('coach', [...]);
// =========================================================
const _TOUR_KEY = name => 'powa-tour-' + name + '-done';

function isTourDone(name) {
  try { return localStorage.getItem(_TOUR_KEY(name)) === '1'; }
  catch { return false; }
}
function markTourDone(name) {
  try { localStorage.setItem(_TOUR_KEY(name), '1'); } catch {}
}
function resetTour(name) {
  try { localStorage.removeItem(_TOUR_KEY(name)); } catch {}
}
window.isTourDone = isTourDone;
window.resetTour = resetTour;

let _tourState = { name: null, steps: [], idx: 0 };
let _tourRepos = null; // active scroll/resize reposition handler, torn down on close

function startTour(name, steps) {
  if (!steps || !steps.length) return;
  _tourState = { name, steps, idx: 0 };
  // Wait one frame so layout has settled
  requestAnimationFrame(() => requestAnimationFrame(renderTourStep));
}
window.startTour = startTour;

function renderTourStep() {
  _closeTourOverlay();
  const step = _tourState.steps[_tourState.idx];
  if (!step) return;

  // If the step has a "before" hook (e.g. open a tab to expose the target), run it first
  if (typeof step.before === 'function') {
    try { step.before(); } catch (e) { console.warn('tour before hook failed', e); }
  }

  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const mount = () => {
    const overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.className = 'tour-overlay';
    const tip = document.createElement('div');
    tip.className = 'tour-tip';
    const isLast = _tourState.idx === _tourState.steps.length - 1;
    tip.innerHTML =
      '<div class="tour-tip-step">' + (_tourState.idx + 1) + ' / ' + _tourState.steps.length + '</div>' +
      '<h3 class="tour-tip-title">' + (step.title || '') + '</h3>' +
      '<p class="tour-tip-body">' + (step.body || '') + '</p>' +
      '<div class="tour-tip-actions">' +
        '<button class="btn btn-sm btn-ghost" onclick="endTour(true)">' + (isLast ? 'Close' : 'Skip') + '</button>' +
        (_tourState.idx > 0 ? '<button class="btn btn-sm" onclick="prevTourStep()">Back</button>' : '') +
        '<button class="btn btn-sm btn-primary" onclick="nextTourStep()">' + (isLast ? 'Done' : 'Next') + '</button>' +
      '</div>';
    overlay.appendChild(tip);
    document.body.appendChild(overlay);

    // Place the spotlight cutout + tip against the target's LIVE rect. Re-queried
    // every call (not captured once) so a late-rendered target from a before()
    // pane-switch, plus any scroll/resize, keeps everything aligned. The overlay is
    // position:fixed inset:0, so getBoundingClientRect() viewport coords map 1:1 to
    // the fixed spotlight vars and the absolutely-positioned tip inside it.
    const place = () => {
      if (!document.getElementById('tourOverlay')) return;
      let target = step.selector ? document.querySelector(step.selector) : null;
      // A sidebar tab that isn't on screen (the app's bottom bar replaces the
      // sidebar; sub-screens are hidden from it) → spotlight its bottom-bar twin,
      // or its parent's, instead of a zero-size rect in the corner.
      if (target && target.classList.contains('sidebar-tab') && !target.offsetWidth) {
        const twin = document.querySelector('.bottom-tab[data-src="' + target.dataset.tab + '"]') ||
                     document.querySelector('.bottom-tab[data-src="' + (target.dataset.parent || '') + '"]') ||
                     document.querySelector('.sidebar-tab[data-tab="' + (target.dataset.parent || '') + '"]');
        if (twin && twin.offsetWidth) target = twin;
      }
      if (!target) {
        overlay.style.setProperty('--tx', '50%');
        overlay.style.setProperty('--ty', '50%');
        overlay.style.setProperty('--tw', '0px');
        overlay.style.setProperty('--th', '0px');
        tip.style.transform = 'translate(-50%, -50%)';
        tip.style.top = '50%';
        tip.style.left = '50%';
        return;
      }
      const rect = target.getBoundingClientRect();
      const pad = 6;
      overlay.style.setProperty('--tx', (rect.left - pad) + 'px');
      overlay.style.setProperty('--ty', (rect.top - pad) + 'px');
      overlay.style.setProperty('--tw', (rect.width + pad * 2) + 'px');
      overlay.style.setProperty('--th', (rect.height + pad * 2) + 'px');

      // Tip: below the target by default; flip above if it would spill past the
      // bottom; clamp within a margin on all sides (belt-and-braces vs the global
      // overflow guard, and keeps clear of the notch/home-indicator).
      const tipRect = tip.getBoundingClientRect();
      const margin = 16;
      tip.style.transform = '';
      let top = rect.bottom + margin;
      if (top + tipRect.height > window.innerHeight - margin) {
        top = rect.top - tipRect.height - margin;
      }
      top = Math.max(margin, Math.min(window.innerHeight - tipRect.height - margin, top));
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
    };

    // Bring the target on-screen FIRST, then place — so we never measure a
    // pre-scroll rect. Reduced motion → instant scroll (no animation to chase).
    const target = step.selector ? document.querySelector(step.selector) : null;
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 160) {
        target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      }
    }

    // rAF-debounced reposition, run now + across the smooth-scroll settle window,
    // and on every scroll/resize while the step is open. Capture-phase scroll
    // catches the inner .dash-main scroll container (its events don't bubble to window).
    let raf = 0;
    const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); };
    place();
    if (!reduce) { setTimeout(place, 260); setTimeout(place, 440); }
    else { setTimeout(place, 0); }

    _tourRepos = schedule;
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule, { passive: true });
  };

  // Give the DOM a couple of frames to settle if before() switched panes.
  if (step.before) requestAnimationFrame(() => requestAnimationFrame(mount));
  else mount();
}

function nextTourStep() {
  if (_tourState.idx < _tourState.steps.length - 1) {
    _tourState.idx++;
    renderTourStep();
  } else {
    endTour(true);
  }
}
function prevTourStep() {
  if (_tourState.idx > 0) {
    _tourState.idx--;
    renderTourStep();
  }
}
function endTour(complete) {
  _closeTourOverlay();
  if (complete && _tourState.name) markTourDone(_tourState.name);
  _tourState = { name: null, steps: [], idx: 0 };
}
function _closeTourOverlay() {
  if (_tourRepos) {
    window.removeEventListener('scroll', _tourRepos, { capture: true });
    window.removeEventListener('resize', _tourRepos);
    _tourRepos = null;
  }
  const o = document.getElementById('tourOverlay');
  if (o) o.remove();
}
window.nextTourStep = nextTourStep;
window.prevTourStep = prevTourStep;
window.endTour = endTour;

// =========================================================
// WEIGHT UNITS (kg / lbs)
// All data stored in kg. Display layer converts. User input from a "weight"
// field is interpreted in the current display unit and converted back to kg.
// Stored per-device in localStorage; toggle reloads the page to avoid
// re-rendering every dependent component manually.
// =========================================================
const UNIT_KEY = 'powa-unit';
const KG_PER_LB = 0.45359237;
function getUnit() {
  try { return localStorage.getItem(UNIT_KEY) === 'lbs' ? 'lbs' : 'kg'; }
  catch { return 'kg'; }
}
function setUnit(u) {
  const v = u === 'lbs' ? 'lbs' : 'kg';
  try { localStorage.setItem(UNIT_KEY, v); } catch {}
}
function toggleUnit() {
  setUnit(getUnit() === 'kg' ? 'lbs' : 'kg');
  // Hard reload — easiest way to guarantee every view re-renders with the new unit.
  location.reload();
}
window.toggleUnit = toggleUnit;

// Display: kg internal value → number in the user's chosen unit.
// `decimals` defaults to 1 for lbs (220.5) and 0 for kg (100), or pass to override.
function kgToDisplay(kg, decimals) {
  if (kg == null || kg === '') return null;
  const n = Number(kg);
  if (!isFinite(n)) return null;
  const u = getUnit();
  if (u === 'kg') return decimals != null ? Number(n.toFixed(decimals)) : n;
  const lbs = n / KG_PER_LB;
  return Number(lbs.toFixed(decimals != null ? decimals : 1));
}
// Inverse: a number the user entered in the display unit → kg for storage.
function displayToKg(val) {
  if (val == null || val === '') return val;
  const n = Number(val);
  if (!isFinite(n)) return n;
  return getUnit() === 'kg' ? n : (n * KG_PER_LB);
}
function unitLabel() { return getUnit(); }
// "145 kg" or "319.7 lbs"
function formatWeight(kg, decimals) {
  const v = kgToDisplay(kg, decimals);
  if (v == null) return '–';
  return v + ' ' + unitLabel();
}
window.getUnit = getUnit;
window.kgToDisplay = kgToDisplay;
window.displayToKg = displayToKg;
window.unitLabel = unitLabel;
window.formatWeight = formatWeight;

// =========================================================
// SUBSCRIPTION TIERS + LEMON SQUEEZY CHECKOUT
// =========================================================
const TIER_LIMITS = {
  free: 3,
  basic: 10,
  pro: 25,
  premium: 9999
};
const TIER_LABELS = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  premium: 'Premium'
};
const TIER_PRICES = {
  basic: 25,
  pro: 50,
  premium: 100
};
const LS_CHECKOUT_URLS = {
  basic:   'https://powalifta.lemonsqueezy.com/checkout/buy/d9320c9a-e603-402c-b2c0-f88189ccde14',
  pro:     'https://powalifta.lemonsqueezy.com/checkout/buy/20e2ec1f-744c-46c9-8a86-62fa13bcb899',
  premium: 'https://powalifta.lemonsqueezy.com/checkout/buy/a5dbff0b-9950-4831-ab91-99e10d20c3a0'
};

// Build checkout URL with prefilled email + the coach's user id as custom data
// so the (future) webhook can match the subscription back to the right coach.
function buildCheckoutUrl(tier, user) {
  const base = LS_CHECKOUT_URLS[tier];
  if (!base) return '#';
  const params = new URLSearchParams();
  if (user?.email) params.set('checkout[email]', user.email);
  if (user?.id)    params.set('checkout[custom][user_id]', user.id);
  if (user?.name)  params.set('checkout[name]', user.name);
  return base + '?' + params.toString();
}

function getCurrentTier() {
  const u = getCurrentUser();
  return u?.subscriptionTier || 'free';
}
function getCurrentTierLimit() {
  return TIER_LIMITS[getCurrentTier()] || 3;
}
function getAthleteCount(coachId) {
  return Store.get().athletes.filter(a => a.coachId === coachId).length;
}
function getPendingInviteCount(coachId) {
  return Store.get().invites.filter(i => i.coachId === coachId && !i.used).length;
}
// "Occupied slots" = athletes already signed up + pending invites that could turn into athletes.
// We cap on this so a coach can't generate more codes than their plan allows.
function getOccupiedSlots(coachId) {
  return getAthleteCount(coachId) + getPendingInviteCount(coachId);
}
function canAddAthlete(coachId) {
  return getOccupiedSlots(coachId) < getCurrentTierLimit();
}

// =========================================================
// UPGRADE MODAL — shown when coach hits cap or clicks Upgrade
// =========================================================
function ensureUpgradeModal() {
  if (document.getElementById('upgradeModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="modal-backdrop" id="upgradeModal">' +
      '<div class="modal modal-lg">' +
        '<button class="modal-close" aria-label="Close" onclick="closeModal(\'upgradeModal\')">&times;</button>' +
        '<h3 id="upgradeTitle">Choose your plan</h3>' +
        '<p class="dim text-sm mb-16" id="upgradeSubtitle">Scale your coaching as your roster grows. Cancel anytime from Lemon Squeezy.</p>' +
        '<div class="upgrade-grid" id="upgradeTiers"></div>' +
        '<p class="faded text-xs center mt-16">Payment handled securely by Lemon Squeezy. After purchase, your plan updates within minutes.</p>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap.firstChild);
}

function openUpgradeModal(reason) {
  const u = getCurrentUser();
  if (!u) return;
  // Native shell: tiers are now purchasable IN-APP via StoreKit (Apple 3.1.1
  // compliant), so the paywall may show — but ONLY when StoreKit is actually
  // available (window._iapReady, set by native-bridge). Old iOS / missing
  // plugin → stay fully tier-blind: neutral cap message, nothing else. The web
  // Lemon Squeezy modal below never renders in the shell either way.
  if (_isNativeShell()) {
    if (window._iapReady) { openNativePaywall(reason); return; }
    if (reason === 'cap') toast('You\'ve reached your athlete limit.');
    return;
  }
  ensureUpgradeModal();
  if (reason === 'cap') {
    document.getElementById('upgradeTitle').textContent = 'You\'ve hit your plan limit';
    const aCount = getAthleteCount(u.id);
    const pCount = getPendingInviteCount(u.id);
    let breakdown = aCount + ' athlete' + (aCount === 1 ? '' : 's');
    if (pCount > 0) breakdown += ' + ' + pCount + ' pending invite' + (pCount === 1 ? '' : 's');
    document.getElementById('upgradeSubtitle').innerHTML =
      'Your <strong>' + TIER_LABELS[getCurrentTier()] + '</strong> plan supports up to ' +
      getCurrentTierLimit() + ' athletes. You\'re at ' + breakdown + '. Upgrade to add more.';
  } else {
    document.getElementById('upgradeTitle').textContent = 'Choose your plan';
    document.getElementById('upgradeSubtitle').textContent = 'Scale your coaching as your roster grows. Cancel anytime from Lemon Squeezy.';
  }
  const tiers = [
    { key: 'basic',   limit: 10,   price: 25,  blurb: 'Solo coach, growing roster.' },
    { key: 'pro',     limit: 25,   price: 50,  blurb: 'Full-time independent coach.', featured: true },
    { key: 'premium', limit: 9999, price: 100, blurb: 'Studios, teams, federations.' }
  ];
  const grid = document.getElementById('upgradeTiers');
  grid.innerHTML = '';
  const current = getCurrentTier();
  tiers.forEach(t => {
    const isCurrent = t.key === current;
    const card = el('div', { class: 'upgrade-tier' + (t.featured ? ' featured' : '') + (isCurrent ? ' current' : '') });
    if (t.featured) card.appendChild(el('div', { class: 'upgrade-badge' }, 'POPULAR'));
    card.appendChild(el('h4', {}, TIER_LABELS[t.key]));
    card.appendChild(el('div', { class: 'upgrade-price' }, '$' + t.price, el('span', { class: 'unit' }, '/mo')));
    card.appendChild(el('div', { class: 'upgrade-limit' }, t.limit >= 9999 ? 'Unlimited athletes' : 'Up to ' + t.limit + ' athletes'));
    card.appendChild(el('p', { class: 'upgrade-blurb' }, t.blurb));
    if (isCurrent) {
      card.appendChild(el('button', { class: 'btn btn-block', disabled: 'true', style: 'opacity:0.6; cursor: default;' }, 'Current plan'));
    } else {
      const cta = el('a', {
        class: 'btn btn-primary btn-block',
        href: buildCheckoutUrl(t.key, u),
        target: '_blank',
        rel: 'noopener'
      }, current === 'free' ? 'Subscribe' : (TIER_PRICES[t.key] > (TIER_PRICES[current] || 0) ? 'Upgrade' : 'Switch'));
      card.appendChild(cta);
    }
    grid.appendChild(card);
  });
  document.getElementById('upgradeModal').classList.add('open');
}
window.openUpgradeModal = openUpgradeModal;

// =========================================================
// NATIVE PAYWALL — StoreKit In-App Purchase (iOS shell only)
// The 3.1.1-compliant twin of the web upgrade modal: same .upgrade-* look,
// but every price is Apple's localized displayPrice and every CTA is a real
// StoreKit purchase. Includes the affordances Apple requires on subscription
// paywalls: a Restore Purchases action, Terms + Privacy links, and a renewal
// disclosure. Never renders on the web (openUpgradeModal routes there first).
// =========================================================
const IAP_TIER_META = {
  'com.powalifta.app.coach.basic':   { key: 'basic',   limit: 10,   blurb: 'Solo coach, growing roster.' },
  'com.powalifta.app.coach.pro':     { key: 'pro',     limit: 25,   blurb: 'Full-time independent coach.', featured: true },
  'com.powalifta.app.coach.premium': { key: 'premium', limit: 9999, blurb: 'Studios, teams, federations.' }
};

function ensureIapPaywall() {
  if (document.getElementById('iapPaywallModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="modal-backdrop" id="iapPaywallModal">' +
      '<div class="modal modal-lg">' +
        '<button class="modal-close" aria-label="Close" onclick="closeModal(\'iapPaywallModal\')">&times;</button>' +
        '<h3 id="iapPaywallTitle">Choose your plan</h3>' +
        '<p class="dim text-sm mb-16" id="iapPaywallSubtitle">Scale your coaching as your roster grows.</p>' +
        '<div class="upgrade-grid" id="iapPaywallTiers"></div>' +
        '<div class="center mt-16">' +
          '<button class="btn btn-sm btn-ghost" onclick="iapRestorePurchases(this)">Restore Purchases</button>' +
        '</div>' +
        '<p class="faded text-xs center mt-12">Subscriptions are billed monthly through your Apple ID and renew ' +
          'automatically until cancelled in your App Store settings at least 24 hours before the period ends.</p>' +
        '<p class="faded text-xs center mt-8">' +
          '<a href="terms.html" class="dim">Terms of Use</a> &nbsp;·&nbsp; <a href="privacy.html" class="dim">Privacy Policy</a>' +
        '</p>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap.firstChild);
}

async function openNativePaywall(reason) {
  const u = getCurrentUser();
  if (!u) return;
  if (window._demoMode) { toast('Preview only in demo mode.'); return; }
  ensureIapPaywall();
  const grid = document.getElementById('iapPaywallTiers');
  if (reason === 'cap') {
    document.getElementById('iapPaywallTitle').textContent = 'You\'ve hit your plan limit';
    document.getElementById('iapPaywallSubtitle').textContent =
      'Your roster is full on the ' + (TIER_LABELS[getCurrentTier()] || 'Free') + ' plan. Upgrade to add more athletes.';
  } else {
    document.getElementById('iapPaywallTitle').textContent = 'Choose your plan';
    document.getElementById('iapPaywallSubtitle').textContent = 'Scale your coaching as your roster grows.';
  }
  grid.innerHTML = '<p class="dim text-sm">Loading plans…</p>';
  document.getElementById('iapPaywallModal').classList.add('open');

  const products = await PowaNative.iapProducts();
  if (!products.length) {
    // Honest failure — never invent prices the App Store didn't return.
    grid.innerHTML = '<p class="dim text-sm">Couldn\'t reach the App Store. Check your connection and try again.</p>';
    return;
  }
  grid.innerHTML = '';
  const current = getCurrentTier();
  // Stable order: basic → pro → premium regardless of App Store response order.
  const ordered = Object.keys(IAP_TIER_META)
    .map(id => products.find(p => p.id === id)).filter(Boolean);
  ordered.forEach(p => {
    const meta = IAP_TIER_META[p.id];
    const isCurrent = meta.key === current;
    const card = el('div', { class: 'upgrade-tier' + (meta.featured ? ' featured' : '') + (isCurrent ? ' current' : '') });
    if (meta.featured) card.appendChild(el('div', { class: 'upgrade-badge' }, 'POPULAR'));
    card.appendChild(el('h4', {}, TIER_LABELS[meta.key] || p.displayName));
    card.appendChild(el('div', { class: 'upgrade-price' }, p.displayPrice, el('span', { class: 'unit' }, '/mo')));
    card.appendChild(el('div', { class: 'upgrade-limit' }, meta.limit >= 9999 ? 'Unlimited athletes' : 'Up to ' + meta.limit + ' athletes'));
    card.appendChild(el('p', { class: 'upgrade-blurb' }, meta.blurb));
    if (isCurrent) {
      card.appendChild(el('button', { class: 'btn btn-block', disabled: 'true', style: 'opacity:0.6; cursor: default;' }, 'Current plan'));
    } else {
      const cta = el('button', { class: 'btn btn-primary btn-block' }, current === 'free' ? 'Subscribe' : 'Switch');
      cta.addEventListener('click', () => iapBuy(p.id, cta));
      card.appendChild(cta);
    }
    grid.appendChild(card);
  });
}

async function iapBuy(productId, btn) {
  const u = getCurrentUser();
  if (!u) return;
  if (btn) { btn.disabled = true; btn.textContent = 'Waiting for App Store…'; }
  const done = (label) => { if (btn) { btn.disabled = false; btn.textContent = label || 'Subscribe'; } };
  try {
    const res = await PowaNative.iapPurchase(productId, u.id);
    if (res.state === 'cancelled') { done(); return; }
    if (res.state === 'pending') { done(); toast('Purchase pending approval.'); return; }
    if (res.state !== 'purchased' || !res.jws) { done(); toast('Purchase didn\'t complete: nothing was charged.'); return; }
    if (btn) btn.textContent = 'Activating…';
    const sync = await DB.appleIapSync(res.jws);
    if (sync.ok) {
      await refreshMyPlan();
      closeModal('iapPaywallModal');
      toast('You\'re on ' + (TIER_LABELS[sync.tier] || sync.tier) + '. Welcome aboard.');
      try { if (window.renderPlanPill) renderPlanPill(); } catch (e) {}
      try { const box = document.getElementById('setPlanBox'); if (box && box.offsetParent) renderPlanManageCard(box); } catch (e) {}
    } else if (sync.reason === 'web_billing_active') {
      done(); toast('This account already has an active plan.');
    } else {
      // Purchase exists on Apple's side; the entitlement re-syncs on next launch.
      done(); toast('Purchased: activating shortly.');
    }
  } catch (e) {
    done(); toast('Purchase failed: nothing was charged.');
  }
}

async function iapRestorePurchases(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  const done = () => { if (btn) { btn.disabled = false; btn.textContent = 'Restore Purchases'; } };
  try {
    const ents = await PowaNative.iapRestore();
    if (!ents.length) { done(); toast('No active subscription found for this Apple ID.'); return; }
    let mismatch = false;
    for (const ent of ents) {
      const sync = await DB.appleIapSync(ent.jws);
      if (sync.ok) {
        await refreshMyPlan();
        closeModal('iapPaywallModal');
        toast('Subscription restored: you\'re on ' + (TIER_LABELS[sync.tier] || sync.tier) + '.');
        try { if (window.renderPlanPill) renderPlanPill(); } catch (e) {}
        done(); return;
      }
      if (sync.reason === 'account_mismatch') mismatch = true;
    }
    done();
    toast(mismatch ? 'That subscription belongs to a different POWALIFTA account.' : 'Couldn\'t restore. Try again later.');
  } catch (e) { done(); toast('Couldn\'t restore. Try again later.'); }
}
window.openNativePaywall = openNativePaywall;
window.iapBuy = iapBuy;
window.iapRestorePurchases = iapRestorePurchases;

// =========================================================
// SUBSCRIPTION MANAGEMENT (#34) — for EXISTING subscribers
//
// The upgrade modal above handles buying a NEW plan. This block is the other
// half: letting a coach who already pays see their plan status and reach the
// Lemon Squeezy customer portal to update their card, switch, pause, or cancel.
//
// Two tiers of "Manage billing":
//   1. Buildable NOW, no secret — the LS no-code portal (email magic-link):
//      LS_BILLING_PORTAL. Works for any customer with just their email.
//   2. PREP enhancement — a per-subscription SIGNED deep link from the LS API,
//      served by the `ls-portal` edge function (gated on LEMON_SQUEEZY_API_KEY).
//      openBillingPortal() prefers the signed link and silently falls back to
//      the no-code portal, so it's correct before OR after the secret is set.
// =========================================================
const LS_BILLING_PORTAL = 'https://powalifta.lemonsqueezy.com/billing';

// Map Lemon Squeezy's raw subscription_status (stored verbatim by ls-webhook)
// to a human label + a tone for the badge. Returns null for statuses that mean
// "no live paid subscription" (expired / inactive / unknown) so the card can
// treat them as effectively free. Pure — unit-testable.
function subscriptionStatusInfo(status) {
  switch (String(status || '').toLowerCase()) {
    case 'active':    return { label: 'Active', tone: 'ok' };
    case 'on_trial':  return { label: 'On trial', tone: 'ok' };
    case 'paused':    return { label: 'Paused', tone: 'warn' };
    case 'past_due':  return { label: 'Payment problem', tone: 'bad' };
    case 'unpaid':    return { label: 'Payment problem', tone: 'bad' };
    case 'cancelled': return { label: 'Cancels at period end', tone: 'warn' };
    default:          return null; // expired / inactive / '' / unknown
  }
}
window.subscriptionStatusInfo = subscriptionStatusInfo;

// Tone → colour for the status badge (theme-aware where a token exists).
function _subStatusColor(tone) {
  if (tone === 'ok')   return 'var(--green)';
  if (tone === 'bad')  return 'var(--red)';
  return '#f5a623'; // warn — amber, reads on both themes
}

// Open the Lemon Squeezy customer portal. Opens the tab synchronously (so the
// popup blocker doesn't eat it after the await), then upgrades the URL to the
// signed per-subscription deep link if the ls-portal function returns one.
async function openBillingPortal() {
  if (window._demoMode) { toast('Preview only in demo mode.'); return; }
  // Native shell: Apple-billed subs manage through Apple's own subscription
  // sheet (that's IAP management, not external purchasing — allowed). Web-billed
  // subs get nothing here — naming the website would be steering (3.1.1).
  if (_isNativeShell()) {
    const nu = getCurrentUser();
    if (nu && nu.appleBilled) {
      try { window.open('https://apps.apple.com/account/subscriptions', '_blank'); } catch (e) {}
    }
    return;
  }
  const tab = window.open('', '_blank'); // reserve the tab inside the click gesture
  let url = LS_BILLING_PORTAL;
  try {
    const res = await DB.subscriptionPortal();
    if (res && res.ok && res.url) url = res.url;
  } catch (_) { /* fall back to the no-code portal */ }
  if (tab) { try { tab.opener = null; } catch (_) {} tab.location = url; }
  else { location.href = url; } // popup blocked → navigate this tab
}
window.openBillingPortal = openBillingPortal;

// Settings-modal card: current plan + status + usage + manage buttons.
// Coaches only (athletes never subscribe) — clears the box for everyone else.
// Follows the same async-fill pattern as renderReferralCard / renderEmailPrefs.
function renderPlanManageCard(container) {
  const u = getCurrentUser();
  if (!container) return;
  // Athletes never subscribe — collapse the box entirely (no stray hairline/gap).
  // Native shell: shows ONLY when StoreKit IAP is live (window._iapReady) —
  // tiers are then purchasable in-app, which is what makes displaying them
  // 3.1.1-compliant. No StoreKit → stay tier-blind and collapse.
  if (!u || u.userType !== 'coach' || (_isNativeShell() && !window._iapReady)) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = '';
  const native = _isNativeShell();

  const tier = getCurrentTier();
  const limit = getCurrentTierLimit();
  const occupied = getOccupiedSlots(u.id);
  const info = tier !== 'free' ? subscriptionStatusInfo(u.subscriptionStatus) : null;
  const badge = info
    ? '<span style="display:inline-block;margin-left:8px;padding:2px 9px;border-radius:999px;' +
      'font-size:11px;font-weight:700;letter-spacing:0.02em;vertical-align:middle;' +
      'color:' + _subStatusColor(info.tone) + ';border:1px solid ' + _subStatusColor(info.tone) + ';' +
      'background:transparent">' + escHtml(info.label) + '</span>'
    : '';

  const usage = 'Using ' + occupied + ' of ' + (limit >= 9999 ? 'unlimited' : limit) +
    ' athlete slot' + (limit === 1 ? '' : 's') + '.';

  // Payment-problem statuses get a one-line nudge in danger tone. The card-update
  // copy is Lemon Squeezy-specific — suppressed on native (Apple runs its own
  // billing retry + grace period for IAP subs).
  const problem = !native && info && info.tone === 'bad'
    ? '<p class="text-xs" style="margin:8px 0 0;color:' + _subStatusColor('bad') + ';line-height:1.5">' +
      'We couldn\'t take your last payment. Update your card in the billing portal to keep your plan.</p>'
    : (info && info.tone === 'warn' && u.subscriptionStatus === 'cancelled'
        ? '<p class="dim text-xs" style="margin:8px 0 0;line-height:1.5">' +
          'Your plan stays active until the end of the current period, then reverts to Free.</p>'
        : '');

  const changeLabel = tier === 'free' ? 'See plans' : 'Change plan';
  // Manage button: web → LS billing portal. Native → Apple's own subscription
  // management, and ONLY for Apple-billed subs (a web-billed sub viewed on iOS
  // gets no manage affordance at all — pointing at the website is steering).
  const manageBtn = tier !== 'free' && (!native || u.appleBilled)
    ? '<button class="btn btn-block btn-ghost" onclick="openBillingPortal()">' +
      (native ? 'Manage subscription' : 'Manage billing') + '</button>'
    : '';

  container.innerHTML =
    '<p class="dim text-sm mb-8">Your plan</p>' +
    '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;margin-bottom:4px">' +
      '<span style="font-family:var(--font-display);font-stretch:var(--display-stretch);font-weight:800;font-size:22px;letter-spacing:0.01em">' +
        escHtml((TIER_LABELS[tier] || 'Free').toUpperCase()) + '</span>' + badge +
    '</div>' +
    '<p class="dim text-xs" style="line-height:1.5">' + escHtml(usage) + '</p>' +
    problem +
    '<div class="flex gap-8 mt-12">' +
      '<button class="btn btn-block btn-ghost" onclick="closeSettingsModal();openUpgradeModal()">' + changeLabel + '</button>' +
      manageBtn +
    '</div>' +
    (tier !== 'free' && !native
      ? '<p class="dim text-xs mt-8" style="opacity:.7;line-height:1.5">Update your card, switch plans, or cancel. All in the secure Lemon Squeezy portal.</p>'
      : (tier !== 'free' && native && u.appleBilled
          ? '<p class="dim text-xs mt-8" style="opacity:.7;line-height:1.5">Billed through your Apple ID. Cancel or switch anytime in your App Store settings.</p>'
          : ''));
}
window.renderPlanManageCard = renderPlanManageCard;

// =========================================================
// DUNNING BANNER (#35) — failed-payment / plan-lapse UX
//
// A prominent, page-top banner on the coach dashboard that fires off the raw
// `subscription_status` (stored verbatim by ls-webhook). The Settings plan card
// (#34) is where you go to fix it; THIS is what makes sure you SEE it in the
// first place, because a silent past_due means a coach loses roster access with
// no warning. Three severities:
//   • past_due / unpaid  → CRITICAL (red, non-dismissible) — card declined,
//     access is at risk. "Fix billing" → the LS portal.
//   • cancelled          → WARN (amber, dismissible) — set to cancel at period
//     end; offer to resume.
//   • paused             → WARN (amber, dismissible) — subscription paused.
// Anything else (active / on_trial / free) → nothing.
//
// Dismissal is per-session + keyed by status (sessionStorage) so a warn banner
// doesn't nag on every tab switch but re-appears next session / if status
// changes. Critical banners ignore dismissal — they stay until billing is fixed.
// =========================================================
function dunningInfo() {
  const u = getCurrentUser();
  if (!u || u.userType !== 'coach') return null;
  const tier = getCurrentTier();
  if (tier === 'free') return null; // nothing to dun on the free plan
  const status = String(u.subscriptionStatus || '').toLowerCase();
  const label = TIER_LABELS[tier] || 'your';
  const floor = 'Free (' + (TIER_LIMITS.free || 3) + ' athletes)';
  switch (status) {
    case 'past_due':
    case 'unpaid':
      return {
        key: status, severity: 'critical', icon: '⚠',
        title: 'Payment problem',
        body: 'We couldn\'t process the payment for your ' + label + ' plan. ' +
              'Update your card to keep your roster access. Repeated failures drop you to ' + floor + '.',
        cta: 'Fix billing'
      };
    case 'cancelled':
      return {
        key: status, severity: 'warn', icon: '⏳',
        title: 'Your plan is set to cancel',
        body: 'You\'ll keep ' + label + ' until the end of the current billing period, then revert to ' + floor + '. ' +
              'Changed your mind? You can resume anytime.',
        cta: 'Resume plan'
      };
    case 'paused':
      return {
        key: status, severity: 'warn', icon: '⏸',
        title: 'Your plan is paused',
        body: 'Billing for your ' + label + ' plan is paused. Resume it whenever you\'re ready to pick coaching back up.',
        cta: 'Resume plan'
      };
    default:
      return null;
  }
}
window.dunningInfo = dunningInfo;

function dismissDunning(key) {
  try { sessionStorage.setItem('powa-dun-dismiss-' + key, '1'); } catch (_) {}
  const b = document.getElementById('dunningBanner');
  if (b) b.remove();
}
window.dismissDunning = dismissDunning;

// Render (or clear) the banner into `container`. Idempotent — call it on every
// dashboard render; it rebuilds from the live status each time.
function renderDunningBanner(container) {
  if (!container) return;
  // Apple 3.1.1: this banner exists solely to route a coach to an external
  // billing portal ("Fix billing" / "Resume plan"), so the native shell renders
  // nothing at all. Plan lapses are surfaced on the web, where they subscribed.
  if (_isNativeShell()) { container.innerHTML = ''; return; }
  const info = dunningInfo();
  if (!info) { container.innerHTML = ''; return; }

  // Warn banners honour a per-session dismissal; critical ones never hide.
  if (info.severity === 'warn') {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem('powa-dun-dismiss-' + info.key) === '1'; } catch (_) {}
    if (dismissed) { container.innerHTML = ''; return; }
  }

  const dismissBtn = info.severity === 'warn'
    ? '<button class="dun-dismiss" type="button" aria-label="Dismiss" ' +
      'onclick="dismissDunning(\'' + info.key + '\')">&times;</button>'
    : '';

  container.innerHTML =
    '<div id="dunningBanner" class="dunning-banner ' + info.severity + '" role="alert">' +
      '<span class="dun-icon" aria-hidden="true">' + info.icon + '</span>' +
      '<div class="dun-text">' +
        '<strong class="dun-title">' + escHtml(info.title) + '</strong>' +
        '<span class="dun-body">' + escHtml(info.body) + '</span>' +
      '</div>' +
      '<div class="dun-actions">' +
        '<button class="btn btn-sm ' + (info.severity === 'critical' ? 'btn-primary' : '') + '" ' +
          'type="button" onclick="openBillingPortal()">' + escHtml(info.cta) + '</button>' +
        dismissBtn +
      '</div>' +
    '</div>';
}
window.renderDunningBanner = renderDunningBanner;

// =========================================================
// PERSISTENCE WRAPPERS
// Each helper updates Supabase. Local Store mutation is the
// caller's responsibility (so reads stay sync). Failures toast.
// =========================================================
const _persistTimers = {};

function persistProgram(programId) { if (window._demoMode) return;
  if (!programId) return;
  clearTimeout(_persistTimers['prog_' + programId]);
  _persistTimers['prog_' + programId] = setTimeout(async () => {
    const prog = Store.get().programs.find(p => p.id === programId);
    if (!prog) return;
    try { await DB.upsertProgram(prog); }
    catch (e) {
      console.error('persistProgram', e);
      _enqueueOutbox('program', prog, 'program:' + prog.id);
      toast('No connection: saved on this device, will sync');
    }
  }, 350);
}

// =========================================================
// OFFLINE-SAFE LOGGING
// If a set fails to save (gym wifi died), it's queued in
// localStorage and retried on reconnect / next page load.
// Sets are never silently lost.
// =========================================================
const _PENDING_LOGS_KEY = 'powa-pending-logs';
const _PENDING_ATTEMPTS_KEY = 'powa-pending-log-attempts';
// A set that keeps failing for a non-transient reason (RLS denial, deleted
// athlete, malformed row) must not live in the queue forever — past this many
// attempts we drop it so it can't block every future flush.
const _MAX_LOG_ATTEMPTS = 5;
function _readPendingLogs() {
  try { return JSON.parse(localStorage.getItem(_PENDING_LOGS_KEY) || '[]'); } catch (e) { return []; }
}
function _writePendingLogs(q) {
  try { localStorage.setItem(_PENDING_LOGS_KEY, JSON.stringify(q)); } catch (e) { /* storage full — nothing we can do */ }
}
function _readLogAttempts() {
  try { return JSON.parse(localStorage.getItem(_PENDING_ATTEMPTS_KEY) || '{}'); } catch (e) { return {}; }
}
function _writeLogAttempts(m) {
  try { localStorage.setItem(_PENDING_ATTEMPTS_KEY, JSON.stringify(m)); } catch (e) { /* storage full */ }
}
function _queuePendingLog(log) {
  const q = _readPendingLogs();
  if (!q.some(l => l.id === log.id)) q.push(log);
  _writePendingLogs(q);
}
let _flushingLogs = false;
async function flushPendingLogs() {
  if (window._demoMode) return;
  if (_flushingLogs) return;
  const q = _readPendingLogs();
  if (!q.length) return;
  _flushingLogs = true;
  const attempts = _readLogAttempts();
  const failed = [];
  let synced = 0;
  let dropped = 0;
  for (const log of q) {
    try { await DB.addLog(log); synced++; }
    catch (e) {
      const msg = String((e && e.message) || '');
      // Duplicate key = it actually saved on a previous attempt → safe to drop.
      if (/duplicate|unique|23505/i.test(msg)) { synced++; continue; }
      const n = (attempts[log.id] || 0) + 1;
      if (n >= _MAX_LOG_ATTEMPTS) {
        // Give up on this one — it's never going to land. Drop it rather than
        // re-queueing forever (which would also suppress the synced toast).
        console.error('flushPendingLogs: dropping set after ' + n + ' failed attempts', log.id, msg);
        delete attempts[log.id];
        dropped++;
      } else {
        attempts[log.id] = n;
        failed.push(log);
      }
    }
  }
  // Forget attempt counters for anything no longer queued.
  const stillQueued = new Set(failed.map(l => l.id));
  for (const id of Object.keys(attempts)) { if (!stillQueued.has(id)) delete attempts[id]; }
  _writePendingLogs(failed);
  _writeLogAttempts(attempts);
  _flushingLogs = false;
  if (synced > 0 && !failed.length) toast(synced + (synced === 1 ? ' set' : ' sets') + ' synced');
  if (dropped > 0) toast(dropped + (dropped === 1 ? ' set' : ' sets') + " couldn't be synced: please re-log");
  if (typeof _refreshConnBanner === 'function') _refreshConnBanner();
}
window.addEventListener('online', () => { setTimeout(flushPendingLogs, 800); });
window.addEventListener('load', () => { setTimeout(() => { if (navigator.onLine) flushPendingLogs(); }, 3500); });

async function persistAddLog(log) {
  if (window._demoMode) return;
  try { await DB.addLog(log); }
  catch (e) {
    console.error('addLog', e);
    _queuePendingLog(log);
    _scheduleConnBanner();
    toast('No connection: set saved on this device, will sync automatically');
  }
}
async function persistDeleteLog(id) {
  if (window._demoMode) return;
  // If the set is still waiting in the offline queue, deleting it just means
  // removing it from the queue (it never reached the server).
  const q = _readPendingLogs();
  if (q.some(l => l.id === id)) { _writePendingLogs(q.filter(l => l.id !== id)); return; }
  try { await DB.deleteLog(id); } catch (e) { console.error('deleteLog', e); }
}
async function persistAddInvite(inv)      { if (window._demoMode) return; try { await DB.addInvite(inv); } catch (e) { console.error('addInvite', e); toast('Could not save invite'); } }
async function persistDeleteInvite(code)  { if (window._demoMode) return; try { await DB.deleteInvite(code); } catch (e) { console.error('deleteInvite', e); } }
async function persistAddNote(n)          { if (window._demoMode) return; try { await DB.addNote(n); } catch (e) { console.error('addNote', e); } }
async function persistGoals(g)            { if (window._demoMode) return; try { await DB.upsertGoals(g); } catch (e) { console.error('goals', e); _enqueueOutbox('goals', g, 'goals:' + (g.athleteId || g.id || 'me')); toast('No connection: saved on this device, will sync'); } }
async function persistBw(b)               { if (window._demoMode) return; try { await DB.upsertBw(b); } catch (e) { console.error('bw', e); _enqueueOutbox('bw', b, 'bw:' + (b.athleteId || '') + ':' + (b.date || '')); toast('No connection: saved on this device, will sync'); } }
async function persistRest(r)             { if (window._demoMode) return; try { await DB.upsertRest(r); } catch (e) { console.error('rest', e); _enqueueOutbox('rest', r, 'rest:' + (r.athleteId || '') + ':' + (r.date || '')); } }
async function persistDeleteRest(aid, d)  { if (window._demoMode) return; try { await DB.deleteRest(aid, d); } catch (e) { console.error('rest del', e); _enqueueOutbox('deleteRest', { athleteId: aid, date: d }, 'rest:' + aid + ':' + d); } }
async function persistAddTemplate(t)      { if (window._demoMode) return; try { await DB.addTemplate(t); } catch (e) { console.error('template', e); toast('Could not save template'); } }
async function persistDeleteTemplate(id)  { if (window._demoMode) return; try { await DB.deleteTemplate(id); } catch (e) { console.error('template del', e); } }

// =========================================================
// OFFLINE SNAPSHOT
// Mirror the signed-in user's working set to localStorage on each
// load (and as the tab hides). A COLD open in airplane mode then
// hydrates the Store from it, so the program / history still show.
// Supabase remains the source of truth — this is a read-through
// convenience cache, last-write-wins. Skipped in demo mode.
// =========================================================
const _SNAP_PREFIX = 'powa-snapshot-';
function _snapKey(uid) { return _SNAP_PREFIX + uid; }
function _saveSnapshot(user, store) {
  if (window._demoMode || !user || !user.id || !store) return;
  try {
    localStorage.setItem(_snapKey(user.id), JSON.stringify({ user, store, ts: Date.now() }));
  } catch (e) { /* quota (e.g. big coach roster) — skip; online still works */ }
}
function _readSnapshot(uid) {
  try {
    const snap = JSON.parse(localStorage.getItem(_snapKey(uid)) || 'null');
    return (snap && snap.store) ? snap : null;
  } catch (e) { return null; }
}
function _clearSnapshot(uid) {
  try { localStorage.removeItem(_snapKey(uid)); } catch (e) {}
}
// Re-snapshot the live Store right before the tab is hidden / closed, so the
// offline cache reflects anything logged this session.
function _snapshotNow() { if (window._user) _saveSnapshot(window._user, Store.get()); }

// Re-read the signed-in user's subscription fields from the DB and reconcile the
// in-memory user. This is how a coach's athlete-limit reflects a payment WITHOUT a
// full reload: LS checkout opens in a new tab, the webhook writes subscription_tier,
// and when the coach tabs back here we pull the fresh tier so canAddAthlete() and the
// plan card update immediately. Returns true if the tier/status actually changed.
// No-ops in demo mode and for signed-out/unknown users; never throws into the caller.
async function refreshMyPlan() {
  try {
    const u = window._user;
    if (!u || !u.id || window._demoMode) return false;
    if (!(typeof DB !== 'undefined' && DB.getProfile)) return false;
    const p = await DB.getProfile(u.id);
    if (!p) return false;
    const nextTier = p.subscription_tier || 'free';
    const nextStatus = p.subscription_status || 'inactive';
    const changed = nextTier !== u.subscriptionTier || nextStatus !== u.subscriptionStatus;
    u.subscriptionTier = nextTier;
    u.subscriptionStatus = nextStatus;
    u.appleBilled = !!p.apple_original_transaction_id;
    if (changed) {
      try { _saveSnapshot(u, Store.get()); } catch (e) {}
    }
    return changed;
  } catch (e) { return false; }
}
window.refreshMyPlan = refreshMyPlan;
window.addEventListener('pagehide', _snapshotNow);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _snapshotNow(); });

// =========================================================
// OFFLINE WRITE OUTBOX
// Generalizes the set-log queue above to the rest of the athlete's
// writes (bodyweight, goals, program, rest days). Failed writes are
// stored locally and replayed on reconnect, with the same attempt
// cap. Coalesced by a logical key so repeated edits to one row — or
// a large program blob — keep only the latest copy.
// =========================================================
const _OUTBOX_KEY = 'powa-outbox';
const _OUTBOX_ATTEMPTS_KEY = 'powa-outbox-attempts';
const _MAX_OUTBOX_ATTEMPTS = 5;
const _OUTBOX_DISPATCH = {
  bw:         (p) => DB.upsertBw(p),
  goals:      (p) => DB.upsertGoals(p),
  program:    (p) => DB.upsertProgram(p),
  rest:       (p) => DB.upsertRest(p),
  deleteRest: (p) => DB.deleteRest(p.athleteId, p.date),
};
function _readOutbox()  { try { return JSON.parse(localStorage.getItem(_OUTBOX_KEY) || '[]'); } catch (e) { return []; } }
function _writeOutbox(q){ try { localStorage.setItem(_OUTBOX_KEY, JSON.stringify(q)); } catch (e) {} }
function _readOutboxAttempts()  { try { return JSON.parse(localStorage.getItem(_OUTBOX_ATTEMPTS_KEY) || '{}'); } catch (e) { return {}; } }
function _writeOutboxAttempts(m) { try { localStorage.setItem(_OUTBOX_ATTEMPTS_KEY, JSON.stringify(m)); } catch (e) {} }
function _enqueueOutbox(kind, payload, key) {
  if (!_OUTBOX_DISPATCH[kind] || !key) return;
  const q = _readOutbox().filter(e => e.key !== key); // coalesce: replace any older edit of this row
  q.push({ key, kind, payload, ts: Date.now() });
  _writeOutbox(q);
  _scheduleConnBanner();
}
let _flushingOutbox = false;
async function flushOutbox() {
  if (window._demoMode || _flushingOutbox) return;
  const q = _readOutbox();
  if (!q.length) return;
  _flushingOutbox = true;
  const attempts = _readOutboxAttempts();
  const failed = [];
  let synced = 0, dropped = 0;
  for (const e of q) {
    const fn = _OUTBOX_DISPATCH[e.kind];
    if (!fn) continue; // unknown kind (stale build) — drop quietly
    try { await fn(e.payload); synced++; }
    catch (err) {
      const msg = String((err && err.message) || '');
      const n = (attempts[e.key] || 0) + 1;
      if (n >= _MAX_OUTBOX_ATTEMPTS) {
        console.error('flushOutbox: dropping ' + e.kind + ' after ' + n + ' attempts', e.key, msg);
        delete attempts[e.key];
        dropped++;
      } else { attempts[e.key] = n; failed.push(e); }
    }
  }
  const stillQueued = new Set(failed.map(e => e.key));
  for (const k of Object.keys(attempts)) { if (!stillQueued.has(k)) delete attempts[k]; }
  _writeOutbox(failed);
  _writeOutboxAttempts(attempts);
  _flushingOutbox = false;
  if (synced > 0 && !failed.length) toast('Changes synced');
  if (dropped > 0) toast("Some changes couldn't be synced. Please re-check");
  _refreshConnBanner();
}

// =========================================================
// CONNECTION BANNER
// A quiet "Offline · changes will sync" pill. Shows while the
// browser is offline (or while queued writes drain on reconnect),
// hides once everything is reconciled. Reduced-motion safe.
// =========================================================
function _pendingCount() { return _readOutbox().length + _readPendingLogs().length; }
function _connBannerEl() {
  let b = document.getElementById('powa-conn-banner');
  if (b || !document.body) return b;
  if (!document.getElementById('powa-conn-style')) {
    const st = document.createElement('style');
    st.id = 'powa-conn-style';
    st.textContent =
      '#powa-conn-banner{position:fixed;left:50%;bottom:18px;transform:translate(-50%,150%);z-index:1200;' +
      'display:flex;align-items:center;gap:9px;max-width:calc(100vw - 24px);padding:9px 15px;border-radius:999px;' +
      'background:#161618;color:#f4f4f5;border:1px solid rgba(255,45,63,0.5);box-shadow:0 10px 34px rgba(0,0,0,0.4);' +
      'font:600 13px/1 Archivo,system-ui,sans-serif;letter-spacing:.01em;white-space:nowrap;opacity:0;pointer-events:none;' +
      'transition:transform .34s cubic-bezier(.16,1,.3,1),opacity .34s}' +
      '#powa-conn-banner.show{transform:translate(-50%,0);opacity:1}' +
      '#powa-conn-banner .pcb-dot{width:8px;height:8px;border-radius:50%;background:#ff2d3f;flex:none;' +
      'box-shadow:0 0 0 0 rgba(255,45,63,.55);animation:pcbPulse 1.8s ease-out infinite}' +
      '@keyframes pcbPulse{to{box-shadow:0 0 0 7px rgba(255,45,63,0)}}' +
      '@media (prefers-reduced-motion: reduce){#powa-conn-banner{transition:opacity .2s}' +
      '#powa-conn-banner .pcb-dot{animation:none}}';
    document.head.appendChild(st);
  }
  b = document.createElement('div');
  b.id = 'powa-conn-banner';
  b.setAttribute('role', 'status');
  b.setAttribute('aria-live', 'polite');
  b.innerHTML = '<span class="pcb-dot"></span><span class="pcb-text"></span>';
  document.body.appendChild(b);
  return b;
}
function _refreshConnBanner() {
  const b = _connBannerEl();
  if (!b) return;
  const pending = _pendingCount();
  const offline = !navigator.onLine;
  let show = false, msg = '';
  if (offline) {
    show = true;
    msg = pending ? ('Offline · ' + pending + ' change' + (pending === 1 ? '' : 's') + ' will sync') : 'Offline · changes will sync';
  } else if (pending) {
    show = true;
    msg = 'Syncing ' + pending + ' change' + (pending === 1 ? '' : 's') + '…';
  }
  const txt = b.querySelector('.pcb-text');
  if (txt) txt.textContent = msg;
  b.classList.toggle('show', show);
}
function _scheduleConnBanner() { try { requestAnimationFrame(_refreshConnBanner); } catch (e) { _refreshConnBanner(); } }

// Reconnect / disconnect: flush queues and update the banner. (The set-log
// queue keeps its own original online/load triggers above; these add the
// generalized outbox + banner without disturbing that battle-tested path.)
window.addEventListener('online',  () => { setTimeout(() => { flushPendingLogs(); flushOutbox(); }, 900); _refreshConnBanner(); });
window.addEventListener('offline', _refreshConnBanner);
window.addEventListener('load',    () => { setTimeout(() => { if (navigator.onLine) flushOutbox(); }, 3600); _refreshConnBanner(); });

// =========================================================
// SHARE CARDS — branded 1080×1350 canvas images for IG/stories.
// One engine, many cards: PR cards, meet-day plans, weekly recaps.
// =========================================================
async function generateShareCard(opts) {
  // opts: { tag, big, bigUnit, sub, lines: [{l, r}], footer }
  try {
    await Promise.all([
      document.fonts.load('800 100px Archivo'),
      document.fonts.load('700 40px Archivo'),
      document.fonts.load('400 40px Archivo')
    ]);
  } catch (e) { /* fonts may already be loaded — canvas falls back gracefully */ }

  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // Background
  x.fillStyle = '#0b0b0c';
  x.fillRect(0, 0, W, H);
  // Faint grid
  x.strokeStyle = 'rgba(255,255,255,0.035)';
  x.lineWidth = 1;
  for (let i = 0; i <= W; i += 90) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let i = 0; i <= H; i += 90) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  // One soft overhead light — neutral, like the app (red is spent on the mark only).
  const g = x.createRadialGradient(W / 2, -160, 0, W / 2, -160, 1050);
  g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  if ('fontStretch' in x) x.fontStretch = 'expanded';   // Archivo's wide display cut where supported

  // Logo — the plate mark (the ONE red element) + an all-ink wordmark, centred.
  x.textBaseline = 'alphabetic';
  x.font = '800 64px Archivo, \"Arial Black\", sans-serif';
  const word = 'POWALIFTA';
  const wordW = x.measureText(word).width;
  const markW = 88, gap = 22;
  const lx = (W - markW - gap - wordW) / 2, ly = 104;
  const rr = (rx, ry, rw, rh, r) => { x.beginPath(); if (x.roundRect) x.roundRect(rx, ry, rw, rh, r); else x.rect(rx, ry, rw, rh); x.fill(); };
  const s = markW / 32;                                   // the 32-unit BRAND_MARK grid
  x.fillStyle = '#f4f4f6'; rr(lx + 1.5 * s, ly + 14.6 * s, 29 * s, 2.8 * s, 1.4 * s);
  x.fillStyle = '#ff2d3f'; rr(lx + 8 * s, ly + 3 * s, 7.5 * s, 26 * s, 2.2 * s);
  x.fillStyle = '#f4f4f6'; rr(lx + 17 * s, ly + 7.5 * s, 4 * s, 17 * s, 1.6 * s);
  rr(lx + 22.5 * s, ly + 12 * s, 2.6 * s, 8 * s, 1.1 * s);
  x.textAlign = 'left';
  x.fillText(word, lx + markW + gap, ly + 16 * s + 22);

  // Tag pill — quiet ink, not red
  x.textAlign = 'center';
  x.font = '700 32px Archivo, sans-serif';
  const tagW = x.measureText(opts.tag).width + 80;
  x.fillStyle = 'rgba(255,255,255,0.06)';
  x.strokeStyle = 'rgba(255,255,255,0.22)';
  x.lineWidth = 2;
  if (x.roundRect) {
    x.beginPath(); x.roundRect((W - tagW) / 2, 250, tagW, 72, 36); x.fill(); x.stroke();
  } else {
    x.fillRect((W - tagW) / 2, 250, tagW, 72); x.strokeRect((W - tagW) / 2, 250, tagW, 72);
  }
  x.fillStyle = '#f4f4f6';
  x.fillText(opts.tag, W / 2, 297);

  // Big number — solid ink, the loudest thing on the card
  // Number + unit are centred as ONE group, and the group steps down in size
  // until it fits the card — the wide display face makes "400.4 DOTS" long.
  let bigSize = 260, unitSize = 80, bigW = 0, unitW = 0;
  for (;;) {
    x.font = '800 ' + bigSize + 'px Archivo, \"Arial Black\", sans-serif';
    bigW = x.measureText(opts.big).width;
    x.font = '800 ' + unitSize + 'px Archivo, \"Arial Black\", sans-serif';
    unitW = opts.bigUnit ? x.measureText(opts.bigUnit).width + 24 : 0;
    if (bigW + unitW <= W - 160 || bigSize <= 140) break;
    bigSize -= 10; unitSize = Math.round(bigSize * 0.31);
  }
  const gx = (W - bigW - unitW) / 2;
  x.textAlign = 'left';
  x.fillStyle = '#f4f4f6';
  x.font = '800 ' + bigSize + 'px Archivo, \"Arial Black\", sans-serif';
  x.fillText(opts.big, gx, 700);
  if (opts.bigUnit) {
    x.fillStyle = '#82828c';
    x.font = '800 ' + unitSize + 'px Archivo, \"Arial Black\", sans-serif';
    x.fillText(opts.bigUnit, gx + bigW + 24, 700);
  }
  x.textAlign = 'center';

  // Sub line
  x.fillStyle = '#f4f4f6';
  x.font = '800 52px Archivo, \"Arial Black\", sans-serif';
  x.fillText(opts.sub.toUpperCase(), W / 2, 810);

  // Detail lines (left/right pairs)
  let y = 930;
  (opts.lines || []).forEach(ln => {
    x.strokeStyle = 'rgba(255,255,255,0.10)';
    x.beginPath(); x.moveTo(140, y - 44); x.lineTo(W - 140, y - 44); x.stroke();
    x.textAlign = 'left';
    x.font = '700 34px Archivo, sans-serif';
    x.fillStyle = '#82828c';
    x.fillText(ln.l.toUpperCase(), 140, y);
    x.textAlign = 'right';
    x.font = '700 38px Archivo, sans-serif';
    x.fillStyle = '#f4f4f6';
    x.fillText(ln.r, W - 140, y);
    x.textAlign = 'center';
    y += 92;
  });

  // Footer
  x.font = '700 34px Archivo, sans-serif';
  x.fillStyle = '#808089';
  x.fillText(opts.footer || 'powalifta.com', W / 2, H - 70);

  return c;
}

async function shareCardFromCanvas(canvas, filename, shareText) {
  return new Promise(resolve => {
    canvas.toBlob(async blob => {
      if (!blob) { toast('Could not create image'); return resolve(false); }
      const file = new File([blob], filename, { type: 'image/png' });
      // Native share sheet where supported (iOS/Android) — download elsewhere
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: shareText || '' }); return resolve(true); }
        catch (e) { /* user cancelled — fall through to download */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Card saved: post it');
      resolve(true);
    }, 'image/png');
  });
}

// =========================================================
// SETTINGS MODAL
// Injected on demand into the body. Updates name, password, deletes account.
// =========================================================
function ensureSettingsModal() {
  if (document.getElementById('settingsModal')) return;
  const wrap = document.createElement('div');
  // Country <option> list, prepended with a "no country" option.
  const countryOpts = '<option value="">None</option>' +
    COUNTRIES.map(c => '<option value="' + c.code + '">' + flagEmoji(c.code) + ' ' + escHtml(c.name) + '</option>').join('');
  wrap.innerHTML = '<div class="modal-backdrop" id="settingsModal">' +
    '<div class="modal">' +
      '<button class="modal-close" aria-label="Close" onclick="closeSettingsModal()">&times;</button>' +
      '<h3>Settings</h3>' +

      // ---- Profile essentials (always visible) ----
      '<div class="flex gap-12 mt-8" style="align-items:center">' +
        '<div id="setAvatarPreview" class="av" style="width:72px;height:72px;font-size:1.25rem;flex:0 0 auto"></div>' +
        '<div style="flex:1; min-width:0">' +
          '<label class="block dim text-xs mb-4">Profile picture (square works best, &lt; 3 MB)</label>' +
          '<input type="file" id="setAvatarFile" accept="image/png,image/jpeg,image/webp" style="font-size: 13px">' +
          '<div id="setAvatarStatus" class="dim text-xs mt-4"></div>' +
        '</div>' +
      '</div>' +

      '<div class="form-group mt-12"><label>Display name</label><input type="text" id="setName"></div>' +
      '<div class="form-group"><label>Country (shown as flag on your profile)</label>' +
        '<select id="setCountry" style="width:100%">' + countryOpts + '</select>' +
      '</div>' +
      '<div id="setBioGroup" class="form-group" style="display:none"><label>Coach bio</label><textarea id="setBio"></textarea></div>' +
      '<div class="flex gap-8 mt-16"><button class="btn btn-block" onclick="closeSettingsModal()">Cancel</button><button class="btn btn-primary btn-block" onclick="saveSettings()">Save</button></div>' +

      // ---- Quick prefs: theme + units. Instant-apply, no Save needed. Also the ONLY
      //      dark/light control inside the native shell (the nav toggle is hidden there). ----
      '<div class="set-quick">' +
        '<button type="button" class="set-quick-btn" id="setThemeBtn" onclick="toggleTheme(); _syncSetQuick();"></button>' +
        '<button type="button" class="set-quick-btn" id="setUnitBtn" onclick="toggleUnit()"></button>' +
      '</div>' +

      // ---- Everything else: collapsed groups. Boxes keep their ids so the existing
      //      render fns (plan / referral / email / push / MFA) mount unchanged. ----
      '<details class="set-group" id="sgPlan"><summary>Plan &amp; billing</summary><div class="sg-body">' +
        '<div id="setPlanBox"></div>' +
      '</div></details>' +
      '<details class="set-group" id="sgNotif"><summary>Notifications</summary><div class="sg-body">' +
        '<div id="setNotifPrefsBox"></div>' +
        '<div id="setEmailPrefsBox" class="mt-16"></div>' +
      '</div></details>' +
      '<details class="set-group" id="sgSecurity"><summary>Security</summary><div class="sg-body">' +
        '<div class="form-group"><label>Account email</label><input type="email" id="setEmail" disabled style="opacity:0.5"></div>' +
        '<div class="form-group"><label>New password (leave blank to keep current)</label><input type="password" id="setPwd" placeholder="At least 6 chars"></div>' +
        '<p class="dim text-xs mb-8" style="line-height:1.5">A new password is applied when you hit Save above.</p>' +
        '<div id="setMfaBox" class="mt-12"></div>' +
      '</div></details>' +
      '<details class="set-group" id="sgReferral"><summary>Refer a lifter</summary><div class="sg-body">' +
        '<div id="setReferralBox"></div>' +
      '</div></details>' +
      '<details class="set-group" id="sgData"><summary>Your data &amp; account</summary><div class="sg-body">' +
        '<p class="dim text-xs mb-8" style="line-height:1.5">Download everything we hold for your account. JSON is the complete archive; CSV is your training log, ready to re-import anywhere.</p>' +
        '<div class="flex gap-8">' +
          '<button class="btn btn-block btn-ghost" onclick="exportMyData(\'json\')">Export JSON</button>' +
          '<button class="btn btn-block btn-ghost" onclick="exportMyData(\'csv\')">Export CSV</button>' +
        '</div>' +
        '<button class="btn btn-block btn-ghost mt-12" onclick="replaySettingsTour()">↺ Replay onboarding tour</button>' +
        '<div class="sg-danger">' +
          '<p class="dim text-xs mb-8" style="line-height:1.5">Deleting your account erases your data permanently.</p>' +
          '<button class="btn btn-danger btn-block" onclick="deleteMyAccount()">Delete my account</button>' +
        '</div>' +
      '</div></details>' +
    '</div>' +
  '</div>';
  document.body.appendChild(wrap.firstChild);

  // Wire up the file input — upload immediately on choose.
  const fileInput = document.getElementById('setAvatarFile');
  if (fileInput) fileInput.addEventListener('change', handleAvatarUpload);
}

async function handleAvatarUpload(ev) {
  const u = getCurrentUser();
  if (!u) return;
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  if (window._demoMode) { toast('Preview only in demo mode'); return; }
  const status = document.getElementById('setAvatarStatus');
  const preview = document.getElementById('setAvatarPreview');
  if (status) status.textContent = 'Uploading…';
  try {
    const url = await DB.uploadAvatar(file, u.id);
    window._user.avatarUrl = url;
    if (status) status.textContent = 'Uploaded ✓';
    if (preview) {
      preview.style.padding = '0';
      preview.style.overflow = 'hidden';
      preview.style.background = 'transparent';
      preview.innerHTML = '<img src="' + escHtml(url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    }
    renderNav('#nav');
  } catch (e) {
    console.error('avatar upload', e);
    if (status) status.textContent = 'Error: ' + (e.message || 'upload failed');
    toast(e.message || 'Could not upload avatar');
  }
}
window.handleAvatarUpload = handleAvatarUpload;

function openSettingsModal() {
  const u = getCurrentUser();
  if (!u) return;
  ensureSettingsModal();
  document.getElementById('setName').value = u.name || '';
  document.getElementById('setEmail').value = u.email || '';
  document.getElementById('setPwd').value = '';
  const bioGroup = document.getElementById('setBioGroup');
  if (u.userType === 'coach') {
    bioGroup.style.display = 'block';
    document.getElementById('setBio').value = u.bio || '';
  } else {
    bioGroup.style.display = 'none';
  }

  // Avatar preview
  const preview = document.getElementById('setAvatarPreview');
  if (preview) {
    if (u.avatarUrl) {
      preview.style.padding = '0';
      preview.style.overflow = 'hidden';
      preview.style.background = 'transparent';
      preview.innerHTML = '<img src="' + escHtml(u.avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    } else {
      preview.style.padding = '';
      preview.style.overflow = '';
      preview.style.background = '';
      preview.innerHTML = escHtml(initials(u.name));
    }
  }

  // Country select
  const country = document.getElementById('setCountry');
  if (country) country.value = u.countryCode || '';
  const status = document.getElementById('setAvatarStatus');
  if (status) status.textContent = '';
  const fileInput = document.getElementById('setAvatarFile');
  if (fileInput) fileInput.value = '';

  // Quick prefs — labels reflect live state (theme flips without closing the modal)
  _syncSetQuick();

  // Plan & billing is a coach-only concept — hide the whole group for athletes
  // (renderPlanManageCard would only blank the inner box, leaving an empty shell).
  // Native shell: visible only when StoreKit IAP is live (tiers purchasable
  // in-app = compliant); without it the header alone reveals a paid-tier system.
  const planGroup = document.getElementById('sgPlan');
  if (planGroup) planGroup.style.display = (u.userType === 'coach' && (!_isNativeShell() || !!window._iapReady)) ? '' : 'none';

  // Plan management (coaches only) — tier + status + manage-billing (#34)
  const planBox = document.getElementById('setPlanBox');
  if (planBox) renderPlanManageCard(planBox);

  // Referral card — link + who's joined (async-fills its own list)
  const refBox = document.getElementById('setReferralBox');
  if (refBox) renderReferralCard(refBox);

  // Email preferences — weekly digest + product emails (async-fills)
  const emailBox = document.getElementById('setEmailPrefsBox');
  if (emailBox) renderEmailPrefs(emailBox);

  // Push notifications — device enable + per-category toggles (async-fills)
  const notifBox = document.getElementById('setNotifPrefsBox');
  if (notifBox) renderNotifPrefs(notifBox);

  // Two-factor authentication — status + enable/disable (async-fills, #37)
  const mfaBox = document.getElementById('setMfaBox');
  if (mfaBox) renderMfaCard(mfaBox);

  document.getElementById('settingsModal').classList.add('open');
  attachPwdToggles();
}
function closeSettingsModal() { const m = document.getElementById('settingsModal'); if (m) m.classList.remove('open'); }
// Keep the Settings quick-pref buttons honest about live state. Called on open
// and after each toggle (theme flips in place; the unit toggle hard-reloads, so
// its label only needs to be right at render time).
function _syncSetQuick() {
  const tb = document.getElementById('setThemeBtn');
  if (tb) {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    tb.innerHTML = (light ? '☀️' : '🌙') + ' <span>' + (light ? 'Light mode' : 'Dark mode') + '</span>';
    tb.title = 'Switch to ' + (light ? 'dark' : 'light') + ' mode';
  }
  const ub = document.getElementById('setUnitBtn');
  if (ub) {
    ub.innerHTML = '🏋️ <span>Units: ' + getUnit().toUpperCase() + '</span>';
    ub.title = 'Switch to ' + (getUnit() === 'kg' ? 'lbs' : 'kg');
  }
}
window._syncSetQuick = _syncSetQuick;
// Dispatches to whichever page-specific replay hook is loaded (coach.html or athlete.html)
function replaySettingsTour() {
  closeSettingsModal();
  setTimeout(() => {
    if (typeof window.replayCoachTour === 'function') window.replayCoachTour();
    else if (typeof window.replayAthleteTour === 'function') window.replayAthleteTour();
    else toast('Tour not available on this page.');
  }, 200);
}
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;

// ---------- Two-factor authentication (#37) ----------
// Client-only TOTP 2FA on top of Supabase Auth's native MFA. No secret, no
// edge function, no migration — see DB.mfa* wrappers in db.js. The Settings
// card shows status + enable/disable; the enroll modal renders the QR + secret
// and verifies a code; the login-time challenge lives in index.html's doLogin.
let _mfaPendingFactor = null;

// Status line + tinted pill, mirroring renderPlanManageCard's badge treatment.
function _mfaStatusRow(label, tone, sub) {
  const c = _subStatusColor(tone);
  return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
      '<span style="font-family:var(--font-display);font-stretch:var(--display-stretch);font-weight:800;font-size:22px;letter-spacing:0.01em">2FA</span>' +
      '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:11px;' +
        'font-weight:700;letter-spacing:0.02em;color:' + c + ';border:1px solid ' + c + ';background:transparent">' +
        escHtml(label) + '</span>' +
    '</div>' +
    '<p class="dim text-xs" style="line-height:1.5">' + escHtml(sub) + '</p>';
}

async function renderMfaCard(container) {
  if (!container) return;
  const u = getCurrentUser();
  if (!u) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = '';
  const head = '<p class="dim text-sm mb-8">Two-factor authentication</p>';

  // Demo has no real auth session — show the off-state, gate the action.
  if (window._demoMode) {
    container.innerHTML = head +
      _mfaStatusRow('Off', 'bad', 'Add a second step at login with an authenticator app.') +
      '<button class="btn btn-block btn-ghost mt-12" onclick="openMfaEnrollModal()">Enable 2FA</button>';
    return;
  }

  container.innerHTML = head + '<p class="dim text-xs" style="line-height:1.5">Checking…</p>';
  const res = await DB.mfaListFactors();

  // Project has TOTP MFA disabled in the dashboard → hide the whole section.
  if (!res.ok && res.unsupported) { container.innerHTML = ''; container.style.display = 'none'; return; }
  if (!res.ok) {
    container.innerHTML = head + '<p class="dim text-xs" style="line-height:1.5">Couldn\'t load your security settings. Reopen Settings to retry.</p>';
    return;
  }

  if (res.verified.length > 0) {
    const fid = res.verified[0].id;
    container.innerHTML = head +
      _mfaStatusRow('On', 'ok', 'Logins require a code from your authenticator app.') +
      '<button class="btn btn-block btn-ghost mt-12" onclick="disableMfa(\'' + escHtml(fid) + '\')">Turn off 2FA</button>';
  } else {
    container.innerHTML = head +
      _mfaStatusRow('Off', 'bad', 'Add a second step at login with an authenticator app (Google Authenticator, Authy, 1Password).') +
      '<button class="btn btn-block btn-ghost mt-12" onclick="openMfaEnrollModal()">Enable 2FA</button>';
  }
}

function ensureMfaEnrollModal() {
  if (document.getElementById('mfaEnrollModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = '<div class="modal-backdrop" id="mfaEnrollModal">' +
    '<div class="modal">' +
      '<button class="modal-close" aria-label="Close" onclick="closeModal(\'mfaEnrollModal\')">&times;</button>' +
      '<h2 style="margin-bottom:6px">Enable two-factor</h2>' +
      '<p class="dim text-sm mb-16" style="line-height:1.5">Scan the QR code with an authenticator app, then enter the 6-digit code it shows.</p>' +
      '<div id="mfaEnrollBody"><p class="dim text-sm">Preparing…</p></div>' +
    '</div>' +
  '</div>';
  document.body.appendChild(wrap.firstChild);
}

async function openMfaEnrollModal() {
  if (window._demoMode) return toast('Preview only in demo mode');
  ensureMfaEnrollModal();
  const body = document.getElementById('mfaEnrollBody');
  if (body) body.innerHTML = '<p class="dim text-sm">Preparing…</p>';
  openModal('mfaEnrollModal');
  const res = await DB.mfaEnrollTotp('POWALIFTA');
  if (!res.ok) {
    if (body) body.innerHTML = '<p style="color:var(--red);line-height:1.5">' +
      (res.unsupported ? 'Two-factor isn\'t enabled on this account yet.' : escHtml(res.reason || 'Could not start enrollment.')) + '</p>';
    return;
  }
  _mfaPendingFactor = res.factorId;
  const qr = res.qr
    ? '<img src="' + escHtml(res.qr) + '" alt="Two-factor QR code" style="width:180px;height:180px;display:block"/>'
    : '<p class="dim text-xs" style="width:180px;text-align:center">QR unavailable: use the key below.</p>';
  if (body) body.innerHTML =
    '<div style="display:flex;justify-content:center;margin-bottom:14px">' +
      '<div style="background:#fff;padding:12px;border-radius:12px;line-height:0">' + qr + '</div>' +
    '</div>' +
    '<p class="dim text-xs mb-4" style="text-align:center">Can\'t scan? Enter this key manually:</p>' +
    '<p style="text-align:center;font-family:var(--font-num);font-size:15px;letter-spacing:0.05em;word-break:break-all;margin:0 0 16px;color:var(--text-2)">' + escHtml(res.secret || '') + '</p>' +
    '<div class="form-group"><label>6-digit code</label>' +
      '<input type="text" id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="letter-spacing:0.3em;text-align:center;font-size:16px"></div>' +
    '<div id="mfaEnrollErr" class="text-xs" style="color:var(--red);min-height:16px;margin-bottom:8px"></div>' +
    '<button class="btn btn-primary btn-block" id="mfaVerifyBtn" onclick="submitMfaEnroll()">Verify &amp; turn on</button>';
  const inp = document.getElementById('mfaCode');
  if (inp) { try { inp.focus(); } catch (_) {} inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitMfaEnroll(); }); }
}

async function submitMfaEnroll() {
  const inp = document.getElementById('mfaCode');
  const err = document.getElementById('mfaEnrollErr');
  const btn = document.getElementById('mfaVerifyBtn');
  const code = ((inp && inp.value) || '').replace(/\D/g, '');
  if (code.length !== 6) { if (err) err.textContent = 'Enter the 6-digit code.'; return; }
  if (!_mfaPendingFactor) { if (err) err.textContent = 'Enrollment expired: close and try again.'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
  if (err) err.textContent = '';
  const res = await DB.mfaVerifyEnroll(_mfaPendingFactor, code);
  if (btn) { btn.disabled = false; btn.innerHTML = 'Verify &amp; turn on'; }
  if (!res.ok) {
    if (err) err.textContent = /invalid|incorrect|expired|match/i.test(res.reason || '')
      ? 'That code didn\'t match. Enter the current one.' : (res.reason || 'Verification failed.');
    return;
  }
  _mfaPendingFactor = null;
  closeModal('mfaEnrollModal');
  toast('Two-factor is on');
  const box = document.getElementById('setMfaBox');
  if (box) renderMfaCard(box);
}

async function disableMfa(factorId) {
  if (window._demoMode) return toast('Preview only in demo mode');
  if (!confirm('Turn off two-factor authentication? Your account will be protected by password only.')) return;
  const res = await DB.mfaUnenroll(factorId);
  if (!res.ok) return toast(res.reason || 'Could not turn off 2FA');
  toast('Two-factor turned off');
  const box = document.getElementById('setMfaBox');
  if (box) renderMfaCard(box);
}

window.renderMfaCard = renderMfaCard;
window.openMfaEnrollModal = openMfaEnrollModal;
window.submitMfaEnroll = submitMfaEnroll;
window.disableMfa = disableMfa;
window.replaySettingsTour = replaySettingsTour;

// =========================================================
// REFERRALS — shareable link + who you've brought in
// =========================================================
function referralLink(code) {
  return 'https://www.powalifta.com/?ref=' + encodeURIComponent(code || '');
}
// Milestone progress toward referral tiers. Pure status/recognition — names are
// achievement labels, NOT a monetary promise (there is no payout backend yet).
// Visualises the real referral count against round thresholds to motivate sharing.
// `reward` is the perk each tier grants — copy lives here (client-side) so it can
// be tuned without a migration; the server only certifies the tier was earned.
// These are comp/coupon perks an admin fulfils by hand (no payout backend), in
// keeping with the honest "recognition, not a cash promise" framing.
const REFERRAL_TIERS = [
  { at: 1,  name: 'First referral',   reward: 'Founding Referrer badge' },
  { at: 3,  name: 'Spotter',          reward: '1 month of Basic, on us' },
  { at: 5,  name: 'Training partner', reward: '3 months of Basic, on us' },
  { at: 10, name: 'Crew',             reward: '1 year of Pro, on us' },
  { at: 25, name: 'Powerhouse',       reward: 'Lifetime Premium + featured spot' }
];
// Pure: merge tier defs with the real referral `count` + the user's `claimed`
// rows. `claimed` accepts claim objects ({tierAt,status}) or plain tier numbers.
// Returns one row per tier with earned/claimed/status/remaining so the UI can
// render locked / claimable / requested / fulfilled states without more logic.
function referralRewardsLedger(count, claimed) {
  const n = Math.max(0, Number(count) || 0);
  const byTier = {};
  (claimed || []).forEach(c => {
    if (typeof c === 'number') byTier[c] = 'requested';
    else if (c && c.tierAt != null) byTier[c.tierAt] = c.status || 'requested';
  });
  return REFERRAL_TIERS.map(t => ({
    at: t.at,
    name: t.name,
    reward: t.reward || '',
    earned: n >= t.at,
    claimed: byTier[t.at] != null,
    status: byTier[t.at] || null,
    remaining: Math.max(0, t.at - n)
  }));
}
// Renders the rewards ledger from a pre-computed `ledger` (see above). Earned +
// unclaimed tiers get a Claim button; claimed tiers show their status; locked
// tiers show how many more referrals remain.
function referralRewardsHtml(ledger) {
  const rows = (ledger || []).map(r => {
    let action;
    if (r.claimed) {
      const done = r.status === 'fulfilled';
      action = '<span class="rr-state' + (done ? ' is-done' : '') + '">' +
        (done ? 'Fulfilled ✓' : 'Requested') + '</span>';
    } else if (r.earned) {
      action = '<button class="btn btn-sm btn-primary rr-claim" onclick="claimReferralReward(' + r.at + ', this)">Claim</button>';
    } else {
      action = '<span class="rr-lock">' + r.remaining + ' more</span>';
    }
    const cls = 'ref-reward' + (r.earned ? '' : ' is-locked') + (r.earned && !r.claimed ? ' is-ready' : '');
    return '<div class="' + cls + '">' +
        '<span class="rr-tier">' + r.at + '</span>' +
        '<div class="rr-copy">' +
          '<span class="rr-name">' + escHtml(r.name) + '</span>' +
          '<span class="rr-reward">' + escHtml(r.reward) + '</span>' +
        '</div>' + action +
      '</div>';
  }).join('');
  return '<div class="ref-rewards mt-12">' +
    '<p class="dim text-xs mb-8" style="text-transform:uppercase; letter-spacing:0.08em">Rewards</p>' +
    rows + '</div>';
}
function referralMilestoneHtml(count) {
  const next = REFERRAL_TIERS.find(t => t.at > count);
  const prevAt = REFERRAL_TIERS.reduce((a, t) => (t.at <= count ? t.at : a), 0);
  const pct = next ? Math.max(6, Math.round((count - prevAt) / (next.at - prevAt) * 100)) : 100;
  const label = next
    ? '<strong style="color:var(--text)">' + (next.at - count) + '</strong> more to <span style="color:var(--red)">' + escHtml(next.name) + '</span>'
    : '<span style="color:var(--red)">Powerhouse</span>: every tier cleared';
  return '<div style="margin-top:14px">' +
      '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:7px; font-size:13px">' +
        '<span style="color:var(--text-2)">' + label + '</span>' +
        '<span style="font-family:var(--font-num); color:var(--text-2)">' + count + (next ? ' / ' + next.at : '') + '</span>' +
      '</div>' +
      '<div style="height:8px; background:rgba(255,255,255,0.07); border-radius:999px; overflow:hidden">' +
        '<div style="height:100%; width:100%; transform:scaleX(' + (pct / 100) + '); transform-origin:left; background:linear-gradient(90deg, var(--brand-red), #ff6b78); border-radius:999px; transition:transform .6s cubic-bezier(0.22,1,0.36,1)"></div>' +
      '</div>' +
    '</div>';
}
// Renders the referral card into `container`. Shows the user's link + a copy
// button immediately, then fills in who's joined (async). No-ops cleanly when
// the account has no code yet (pre-migration rows) or in demo mode.
async function renderReferralCard(container) {
  const u = getCurrentUser();
  if (!container || !u) return;
  // Apple 3.1.1 round 3: the REWARDS LADDER names the paid tiers as prizes
  // ("1 month of Basic, on us" / "1 year of Pro" / "Lifetime Premium") — the
  // App Review rejection quoted BASIC/PRO/PREMIUM verbatim from this card. In
  // the native shell the referral link + count still render (sharing is fine);
  // the tier-comp ladder does not. Web unchanged.
  const _tierBlind = _isNativeShell();
  const code = u.referralCode;
  if (!code) { container.innerHTML = ''; return; }   // older account / demo — hide
  const link = referralLink(code);
  container.innerHTML =
    '<p class="dim text-sm mb-8">Refer a lifter</p>' +
    '<p class="dim text-xs mb-8" style="line-height:1.5">Share your link. Anyone who signs up through it shows up here. Athletes and coaches both count.</p>' +
    '<div class="flex gap-8" style="align-items:stretch">' +
      '<input type="text" id="refLinkInput" readonly value="' + escHtml(link) + '" ' +
        'style="flex:1; min-width:0; font-family:var(--font-num); font-size:13px" onclick="this.select()">' +
      '<button class="btn btn-ghost" id="refCopyBtn" onclick="copyReferralLink()" style="flex:0 0 auto">Copy</button>' +
    '</div>' +
    '<div id="refList" class="mt-12 text-xs"></div>';

  const list = document.getElementById('refList');
  if (window._demoMode) {
    // Demo: 2 referrals → only tier 1 is earned, so it shows a live Claim button
    // (locked tiers below it). Clicking it appends to _demoRewardClaims and
    // re-renders → the tier flips to 'Requested', demoing both states with no net.
    const demoCount = 2;
    const demoClaims = (window._demoRewardClaims || []);
    if (list) list.innerHTML = referralMilestoneHtml(demoCount) +
      '<p class="mb-4 mt-12" style="color:var(--text)"><strong>2</strong> lifters joined through you</p>' +
      '<p style="color:var(--text-2)">Share your link and everyone who signs up shows up right here.</p>' +
      (_tierBlind ? '' : referralRewardsHtml(referralRewardsLedger(demoCount, demoClaims)));
    return;
  }
  if (list) list.innerHTML = '<span style="color:var(--text-2)">Loading…</span>';
  try {
    const [refs, claims] = await Promise.all([
      DB.listMyReferrals(u.id),
      DB.listMyRewardClaims(u.id)
    ]);
    const live = document.getElementById('refList');
    if (!live) return;
    const rewards = _tierBlind ? '' : referralRewardsHtml(referralRewardsLedger(refs.length, claims));
    if (!refs.length) {
      live.innerHTML = referralMilestoneHtml(0) +
        '<p class="mt-12" style="color:var(--text-2)">No referrals yet. Share your link to get started.</p>' +
        rewards;
      return;
    }
    const rows = refs.map(r =>
      '<div class="flex" style="justify-content:space-between; gap:12px; padding:7px 0; border-bottom:1px solid var(--line)">' +
        '<span style="color:var(--text); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap">' + escHtml(r.referredName) + '</span>' +
        '<span style="color:var(--text-2); flex:0 0 auto">' + escHtml(fmtDate(new Date(r.createdAt).toISOString().slice(0, 10))) + '</span>' +
      '</div>').join('');
    live.innerHTML = referralMilestoneHtml(refs.length) +
      '<p class="mb-4 mt-12" style="color:var(--text)"><strong>' + refs.length + '</strong> ' +
        (refs.length === 1 ? 'lifter' : 'lifters') + ' joined through you</p>' + rows + rewards;
  } catch (e) {
    const live = document.getElementById('refList');
    if (live) live.innerHTML = '<span style="color:var(--text-2)">Couldn\'t load your referrals right now.</span>';
  }
}
// Claim an earned referral tier. Demo: flips locally to 'Requested' (no network).
// Real: the SECURITY DEFINER rpc re-checks earned-ness server-side, then we
// re-render so the tier shows its new claimed state.
async function claimReferralReward(tierAt, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  if (window._demoMode) {
    window._demoRewardClaims = (window._demoRewardClaims || []).concat([{ tierAt: tierAt, status: 'requested' }]);
    toast('Reward requested: we\'ll be in touch to set it up.');
    const box = document.getElementById('setReferralBox');
    if (box) renderReferralCard(box);
    return;
  }
  try {
    await DB.claimReferralReward(tierAt);
    toast('Reward requested: we\'ll be in touch to set it up.');
  } catch (e) {
    toast('Couldn\'t claim that reward right now.');
    if (btn) { btn.disabled = false; btn.textContent = 'Claim'; }
    return;
  }
  const box = document.getElementById('setReferralBox');
  if (box) renderReferralCard(box);
}
window.claimReferralReward = claimReferralReward;

// =========================================================
// EMAIL PREFERENCES — weekly digest opt-out + product emails
// Two toggles in the Settings modal. `weekly_digest` gates the scheduled
// send-weekly-digest edge fn; `product_emails` gates announcements. Both
// default ON (a recap of your OWN training is a service email). Missing row
// = opted in, so the first toggle-off is what creates the row (upsert).
// Demo-safe: renders the defaults, no network on change.
// =========================================================
function emailPrefRow(id, label, sub, checked) {
  return '<label class="email-pref-row" for="' + id + '">' +
    '<span class="epr-text">' +
      '<span class="epr-label">' + escHtml(label) + '</span>' +
      '<span class="epr-sub dim text-xs">' + escHtml(sub) + '</span>' +
    '</span>' +
    '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' +
  '</label>';
}
async function renderEmailPrefs(container) {
  const u = getCurrentUser();
  if (!container || !u) { if (container) container.innerHTML = ''; return; }
  const paint = (prefs, demo) =>
    '<p class="dim text-sm mb-8">Email</p>' +
    emailPrefRow('epWeekly', 'Weekly progress email',
      'A Monday recap of your last 7 days. Sessions, tonnage, best e1RMs.', prefs.weeklyDigest) +
    emailPrefRow('epProduct', 'Product tips & announcements',
      'Occasional notes on new features. No spam, unsubscribe anytime.', prefs.productEmails) +
    (demo ? '<p class="dim text-xs mt-8" style="opacity:.7">Preview only in demo mode.</p>' : '') +
    '<p class="dim text-xs mt-8" style="line-height:1.5">Every email has a one-click unsubscribe link in the footer too.</p>';

  if (window._demoMode) {
    container.innerHTML = paint({ weeklyDigest: true, productEmails: true }, true);
    // Demo: reflect the flip visually, but never hit the network.
    const wire = (id) => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => toast('Preview only in demo mode.')); };
    wire('epWeekly'); wire('epProduct');
    return;
  }

  container.innerHTML = '<p class="dim text-sm mb-8">Email</p><p class="dim text-xs">Loading…</p>';
  let prefs;
  try { prefs = await DB.getEmailPrefs(u.id); }
  catch (e) { prefs = { weeklyDigest: true, productEmails: true }; }
  container.innerHTML = paint(prefs, false);

  const save = async (patch, box) => {
    const prev = !box.checked; // we're in the change handler; prev is the pre-toggle state
    try {
      await DB.updateEmailPrefs(u.id, patch);
      toast('Email preferences saved.');
    } catch (e) {
      box.checked = prev;           // revert the toggle on failure
      toast('Couldn\'t save that right now.');
    }
  };
  const w = document.getElementById('epWeekly');
  if (w) w.addEventListener('change', () => save({ weeklyDigest: w.checked }, w));
  const p = document.getElementById('epProduct');
  if (p) p.addEventListener('change', () => save({ productEmails: p.checked }, p));
}
window.renderEmailPrefs = renderEmailPrefs;

// Push-notification preferences (#30) — shared Settings card on BOTH dashboards.
// Two layers: (1) a DEVICE control (this browser's Web Push subscription, via
// PowaPush) and (2) per-CATEGORY toggles that live on the account (email_prefs
// push_* columns) so they apply to every device and are read server-side by
// send-push before it delivers. Demo-safe: preview only, no network.
async function renderNotifPrefs(container) {
  const u = getCurrentUser();
  if (!container || !u) { if (container) container.innerHTML = ''; return; }
  const supported = !!(window.PowaPush && PowaPush.supported());

  const catRows = (prefs) =>
    emailPrefRow('npMsg',  'Messages',
      'A push when your coach or an athlete sends you a message.', prefs.pushMessages) +
    emailPrefRow('npForm', 'Form-check replies',
      'A push when a coach replies to a form-check you uploaded.', prefs.pushFormChecks) +
    emailPrefRow('npProg', 'Program updates',
      'A push when a new or updated program is assigned to you.', prefs.pushProgram);

  // DEMO — reflect the flips visually, never hit the network.
  if (window._demoMode) {
    container.innerHTML =
      '<p class="dim text-sm mb-8">Push notifications</p>' +
      '<p class="dim text-xs mb-8" style="line-height:1.5">Get alerts even when POWALIFTA is closed. Choose what gets pushed:</p>' +
      catRows({ pushMessages: true, pushFormChecks: true, pushProgram: true }) +
      '<p class="dim text-xs mt-8" style="opacity:.7">Preview only in demo mode.</p>';
    ['npMsg', 'npForm', 'npProg'].forEach(id => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('change', () => toast('Preview only in demo mode.'));
    });
    return;
  }

  container.innerHTML = '<p class="dim text-sm mb-8">Push notifications</p><p class="dim text-xs">Loading…</p>';
  let prefs;
  try { prefs = await DB.getEmailPrefs(u.id); }
  catch (e) { prefs = { pushMessages: true, pushFormChecks: true, pushProgram: true }; }

  const perm = supported ? PowaPush.permission() : 'unsupported';
  let on = false;
  if (supported && perm === 'granted') { try { on = await PowaPush.isSubscribed(); } catch (e) {} }

  const deviceHtml = () => {
    const wrap = (inner) => '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px">' + inner + '</div>';
    if (!supported) return wrap('<span class="dim text-xs">This browser doesn’t support push. On iPhone, add POWALIFTA to your Home Screen to get alerts.</span>');
    if (perm === 'denied') return wrap('<span class="dim text-xs">Alerts are blocked: turn notifications back on for POWALIFTA in your browser settings.</span>');
    return wrap(
      '<span class="text-sm">' + (on ? '🔔 Alerts on for this device' : '🔕 Off on this device') + '</span>' +
      '<button class="btn btn-sm ' + (on ? 'btn-ghost' : 'btn-primary') + '" id="npDeviceBtn" type="button">' +
        (on ? 'Turn off' : 'Enable on this device') + '</button>'
    );
  };

  const paint = () => {
    container.innerHTML =
      '<p class="dim text-sm mb-8">Push notifications</p>' +
      deviceHtml() +
      '<p class="dim text-xs mt-8 mb-8" style="line-height:1.5">Choose what gets pushed. Applies to every device where alerts are on.</p>' +
      catRows(prefs);

    const dbtn = document.getElementById('npDeviceBtn');
    if (dbtn) dbtn.addEventListener('click', async () => {
      dbtn.disabled = true;
      if (on) { await PowaPush.disable(); }
      else { const ok = await PowaPush.enable(); if (ok) PowaPush.test(); }
      on = (supported && PowaPush.permission() === 'granted') ? await PowaPush.isSubscribed() : false;
      paint();
    });

    const wire = (id, key) => {
      const box = document.getElementById(id);
      if (!box) return;
      box.addEventListener('change', async () => {
        const prev = !box.checked;
        try {
          await DB.updateEmailPrefs(u.id, { [key]: box.checked });
          prefs[key] = box.checked;
          toast('Notification preferences saved.');
        } catch (e) {
          box.checked = prev;
          toast('Couldn’t save that right now.');
        }
      });
    };
    wire('npMsg', 'pushMessages');
    wire('npForm', 'pushFormChecks');
    wire('npProg', 'pushProgram');
  };
  paint();
}
window.renderNotifPrefs = renderNotifPrefs;

function copyReferralLink() {
  const input = document.getElementById('refLinkInput');
  if (!input) return;
  const btn = document.getElementById('refCopyBtn');
  const flash = () => { if (btn) { btn.textContent = 'Copied ✓'; setTimeout(() => { btn.textContent = 'Copy'; }, 1600); } };
  const fallback = () => { try { input.select(); document.execCommand('copy'); flash(); } catch (e) {} };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(flash).catch(fallback);
    } else { fallback(); }
  } catch (e) { fallback(); }
}
window.renderReferralCard = renderReferralCard;
window.copyReferralLink = copyReferralLink;

// =========================================================
// SELF-SERVE DATA EXPORT (GDPR portability — promised in privacy/FAQ)
// =========================================================
// Gathers everything in the Store that belongs to the current user and
// downloads it client-side. No server round-trip, works in demo mode.
function _downloadBlob(filename, mime, text) {
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
    return true;
  } catch (e) { console.error('download', e); return false; }
}
function _csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildExportPayload() {
  const u = getCurrentUser();
  const s = Store.get();
  if (!u) return null;
  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'powalifta.com',
    account: { id: u.id, name: u.name, email: u.email, userType: u.userType, countryCode: u.countryCode || null, coachId: u.coachId || null }
  };
  if (u.userType === 'coach') {
    payload.roster = (s.athletes || []).filter(a => a.coachId === u.id).map(a => ({ id: a.id, name: a.name, email: a.email, countryCode: a.countryCode || null }));
    payload.programs = (s.programs || []).filter(p => p.coachId === u.id);
    payload.templates = (s.programTemplates || []).filter(t => t.coachId === u.id);
    payload.sessionNotes = (s.sessionNotes || []).filter(n => n.coachId === u.id);
  } else {
    payload.workoutLogs = (s.workoutLogs || []).filter(l => l.athleteId === u.id);
    payload.bodyweight = (s.bodyweight || []).filter(b => b.athleteId === u.id);
    payload.goals = (s.goals || []).filter(g => g.athleteId === u.id);
    payload.program = (s.programs || []).find(p => p.athleteId === u.id) || null;
    payload.sessionNotes = (s.sessionNotes || []).filter(n => n.athleteId === u.id);
    payload.checkins = (s.checkins || []).filter(c => c.athleteId === u.id);
    payload.restDays = (s.restDays || []).filter(r => r.athleteId === u.id);
  }
  return payload;
}
function _logsToCsv() {
  const u = getCurrentUser();
  const s = Store.get();
  // Coach export covers all roster logs; athlete export covers their own.
  let logs;
  if (u.userType === 'coach') {
    const roster = new Set((s.athletes || []).filter(a => a.coachId === u.id).map(a => a.id));
    logs = (s.workoutLogs || []).filter(l => roster.has(l.athleteId));
  } else {
    logs = (s.workoutLogs || []).filter(l => l.athleteId === u.id);
  }
  logs = logs.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const nameOf = id => ((s.athletes || []).find(a => a.id === id) || {}).name || '';
  const isCoach = u.userType === 'coach';
  // Weights exported in kg (internal unit) so a re-import with unit=kg is lossless.
  // Accessory names live in the `lift` column (no separate `exercise` column —
  // that would collide with `lift` on re-import). e1rm_kg is informational only
  // (the importer ignores it and recomputes).
  const header = (isCoach ? ['athlete'] : []).concat(['date', 'lift', 'variant', 'weight_kg', 'reps', 'rpe', 'e1rm_kg', 'note']);
  const rows = [header.map(_csvEscape).join(',')];
  logs.forEach(l => {
    const base = isCoach ? [nameOf(l.athleteId)] : [];
    const liftCol = (l.lift && l.lift !== 'accessory') ? l.lift : (l.exerciseName || l.lift || '');
    rows.push(base.concat([
      l.date, liftCol, l.variant || '',
      l.weight, l.reps, l.rpe, (l.e1rm != null ? Math.round(l.e1rm * 10) / 10 : ''), l.note || ''
    ]).map(_csvEscape).join(','));
  });
  return rows.join('\n');
}
function exportMyData(format) {
  const u = getCurrentUser();
  if (!u) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = (u.name || 'powalifta').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'powalifta';
  if (format === 'csv') {
    const csv = _logsToCsv();
    const lines = csv.split('\n').length - 1;
    if (lines < 1) return toast('No training logs to export yet');
    if (_downloadBlob('powalifta-logs-' + safe + '-' + stamp + '.csv', 'text/csv;charset=utf-8', csv)) {
      toast('Exported ' + lines + ' set' + (lines === 1 ? '' : 's') + ' as CSV');
    }
  } else {
    const payload = buildExportPayload();
    if (!payload) return;
    if (_downloadBlob('powalifta-export-' + safe + '-' + stamp + '.json', 'application/json', JSON.stringify(payload, null, 2))) {
      toast('Your data archive is downloading');
    }
  }
}
window.exportMyData = exportMyData;
window.buildExportPayload = buildExportPayload;

// =========================================================
// PROGRAM → SPREADSHEET (offline tracking)
// Flattens a coach-built program into a CSV grid: one row per
// prescribed set, plus empty done/actual columns the athlete fills
// at the gym. Weights are in the user's selected unit (kg/lbs).
// =========================================================
function _progExLabel(ex) {
  if (MAIN_LIFTS.includes(ex.lift)) return LIFT_LABELS[ex.lift] || ex.lift;
  if (ACCESSORY_LIFTS.includes(ex.lift)) return ex.exerciseName || LIFT_LABELS[ex.lift] || ex.lift;
  if (ex.lift === 'cardio') return ex.exerciseName || 'Cardio';
  return ex.exerciseName || ex.lift || '';
}
function buildProgramCsv(program) {
  const u = unitLabel();
  const header = ['week', 'day', 'exercise', 'variant', 'set',
    'weight (' + u + ')', 'reps', 'target_rpe', 'done', 'actual_weight', 'actual_rpe', 'notes'];
  const rows = [header.map(_csvEscape).join(',')];
  if (!program || !Array.isArray(program.weeks)) return rows.join('\n');
  program.weeks.forEach(wk => {
    const wkLabel = 'Week ' + (wk.number != null ? wk.number : '');
    (wk.days || []).forEach(day => {
      const dayName = day.name || 'Day';
      const isRest = /\b(rest|off|recovery)\b/i.test(dayName) && !(day.exercises || []).length;
      if (isRest || !(day.exercises || []).length) {
        rows.push([wkLabel, dayName, isRest ? 'Rest day' : 'No exercises', '', '', '', '', '', '', '', '', '']
          .map(_csvEscape).join(','));
        return;
      }
      day.exercises.forEach(ex => {
        const label = _progExLabel(ex);
        const variant = MAIN_LIFTS.includes(ex.lift) ? (ex.variant || '') : (ex.variant || '');
        const note = ex.note || '';
        if (!(ex.sets || []).length) {
          rows.push([wkLabel, dayName, label, variant, '', '', '', '', '', '', '', note].map(_csvEscape).join(','));
          return;
        }
        ex.sets.forEach((st, si) => {
          const w = st.weight != null && st.weight !== '' ? kgToDisplay(st.weight) : '';
          rows.push([
            wkLabel, dayName, label, variant, si + 1,
            w, st.reps != null ? st.reps : '', st.rpe != null ? st.rpe : '',
            '', '', '', si === 0 ? note : ''
          ].map(_csvEscape).join(','));
        });
      });
    });
  });
  return rows.join('\n');
}
function exportProgramCsv(athleteId, athleteName) {
  const u = getCurrentUser();
  if (!u) return;
  const aid = athleteId || u.id;
  const program = (Store.get().programs || []).find(p => p.athleteId === aid);
  const setCount = program ? (program.weeks || []).flatMap(w => w.days || []).flatMap(d => d.exercises || []).flatMap(e => e.sets || []).length : 0;
  if (!program || !setCount) return toast('No program to export yet');
  const stamp = new Date().toISOString().slice(0, 10);
  const base = (athleteName || u.name || 'powalifta').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'athlete';
  const csv = buildProgramCsv(program);
  if (_downloadBlob('powalifta-program-' + base + '-' + stamp + '.csv', 'text/csv;charset=utf-8', csv)) {
    toast('Exported ' + setCount + ' set' + (setCount === 1 ? '' : 's') + ' to spreadsheet');
  }
}
window.buildProgramCsv = buildProgramCsv;
window.exportProgramCsv = exportProgramCsv;

// =========================================================
// MARKETPLACE REVIEWS — shared display helpers (pure).
// Used by marketplace.html (browse badges + detail) and
// coach-profile.html (catalog-wide social proof).
// =========================================================
// Aggregate a list of {rating} into { count, avg, rounded, dist:{1..5} }.
function reviewStats(reviews) {
  const list = Array.isArray(reviews) ? reviews.filter(r => r && r.rating >= 1 && r.rating <= 5) : [];
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  list.forEach(r => { const n = Math.round(r.rating); dist[n]++; sum += n; });
  const count = list.length;
  const avg = count ? Math.round((sum / count) * 10) / 10 : 0;
  return { count, avg, rounded: Math.round(avg), dist };
}
// Five-star string. `value` 0..5; fills round(value) stars. Returns plain text
// (★/☆) so it works in titles, alt text, and innerHTML alike.
function starString(value) {
  const filled = Math.max(0, Math.min(5, Math.round(value || 0)));
  return '★★★★★'.slice(0, filled) + '☆☆☆☆☆'.slice(0, 5 - filled);
}
// HTML stars with the brand red on filled glyphs. `value` 0..5.
function starsHtml(value, cls) {
  const filled = Math.max(0, Math.min(5, Math.round(value || 0)));
  let out = '<span class="stars' + (cls ? ' ' + cls : '') + '" aria-hidden="true">';
  for (let i = 1; i <= 5; i++) out += '<span class="' + (i <= filled ? 'st-on' : 'st-off') + '">★</span>';
  return out + '</span>';
}
window.reviewStats = reviewStats;
window.starString = starString;
window.starsHtml = starsHtml;

// =========================================================
// MARKETPLACE TAXONOMY — training-focus categories.
// Distinct from `tier` (length/format: short/block/premium).
// `category` is what the program is FOR. Client-side source of
// truth for the labels (DB column is a free-text key, no CHECK)
// so new categories ship without a migration. See
// sql/migration-marketplace-taxonomy.sql.
// =========================================================
const MARKET_CATEGORIES = [
  { key: 'strength',    label: 'Max Strength' },
  { key: 'hypertrophy', label: 'Hypertrophy' },
  { key: 'peaking',     label: 'Peaking / Meet Prep' },
  { key: 'beginner',    label: 'Beginner' },
  { key: 'bench',       label: 'Bench Focus' },
  { key: 'weakpoint',   label: 'Weak-Point Focus' },
];
// key → label (returns '' for null/unknown so callers can hide the badge).
function marketCategoryLabel(key) {
  const c = MARKET_CATEGORIES.find(x => x.key === key);
  return c ? c.label : '';
}
window.MARKET_CATEGORIES = MARKET_CATEGORIES;
window.marketCategoryLabel = marketCategoryLabel;

// =========================================================
// COACH EARNINGS — pure rollup over program_sales (camelCase
// store shape, see mapDbSale). Powers the coach marketplace
// earnings dashboard. No DB, no globals → unit-testable.
//
// Cancelled sales = refunded/voided by the marketplace refund
// webhook (payout_status='cancelled'); they NEVER count toward
// earnings, and are surfaced separately as refunds so a coach
// can see money that was clawed back. `now` is injectable so
// the "this month" boundary is deterministic in tests.
// =========================================================
function coachEarningsSummary(sales, now) {
  const list = Array.isArray(sales) ? sales : [];
  const ref = now != null ? new Date(now) : new Date();
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1).getTime();
  const out = {
    salesCount: 0, totalEarned: 0, thisMonth: 0, pending: 0, paid: 0,
    refundCount: 0, refundedCents: 0, perProgram: {}
  };
  list.forEach(s => {
    const cents = s.coachPayoutCents || 0;
    if (s.payoutStatus === 'cancelled') {
      out.refundCount++;
      out.refundedCents += cents;
      return;
    }
    out.salesCount++;
    out.totalEarned += cents;
    if (s.payoutStatus === 'paid') out.paid += cents; else out.pending += cents;
    const t = s.createdAt ? new Date(s.createdAt).getTime() : 0;
    if (t >= monthStart) out.thisMonth += cents;
    const pid = s.marketplaceProgramId || '_';
    const pp = out.perProgram[pid] || (out.perProgram[pid] = { count: 0, earned: 0 });
    pp.count++;
    pp.earned += cents;
  });
  return out;
}
window.coachEarningsSummary = coachEarningsSummary;

// Cents → "$1,234.56". Used across the earnings dashboard (coach-facing, USD).
function fmtMoneyCents(c) {
  return '$' + ((c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
window.fmtMoneyCents = fmtMoneyCents;

// Platform growth + revenue analytics for the admin Overview (#31). PURE +
// unit-testable: takes the profile rows (admin.html keeps them RAW snake_case)
// and the mapped sale rows (camelCase via mapDbSale) and returns every KPI the
// dashboard renders. Tolerant of snake_case OR camelCase on BOTH inputs so it
// works against mapped or raw data and stays trivial to test. `opts.now` is
// injectable for deterministic tests; `opts.tierPrices` / `opts.weeks` override
// the defaults.
//
//   MRR  = Σ each PAYING coach's monthly tier price, counting only subs whose
//          status is billing-live (active | on_trial | past_due). ARR = 12·MRR.
//   GMV  = gross marketplace $ over every non-cancelled sale (amount_cents).
//          Platform take = our fee slice (platform_fee_cents) on the same set.
//   Signups = total, last-30-days, and a `weeks`-long Monday-bucketed series
//          split coach vs athlete (catch-all → athlete) for the line chart.
//   Conversion = paying coaches ÷ all coaches.
function computePlatformAnalytics(profiles, sales, opts) {
  opts = opts || {};
  const prices = opts.tierPrices || { basic: 25, pro: 50, premium: 100 };
  const weeks = opts.weeks || 12;
  const now = opts.now ? new Date(opts.now) : new Date();
  const nowMs = now.getTime();
  profiles = profiles || [];
  sales = sales || [];

  const pick = (o, ...keys) => { for (const k of keys) { if (o && o[k] != null) return o[k]; } return undefined; };
  // Billing-live LS statuses: money is flowing or imminently retried. paused /
  // unpaid / cancelled / expired are NOT counted toward MRR.
  const LIVE = { active: 1, on_trial: 1, trialing: 1, past_due: 1 };

  // ---- Subscriptions / MRR ----
  const byTier = { basic: 0, pro: 0, premium: 0 };
  let payingCoaches = 0, coachCount = 0, athleteCount = 0, mrr = 0;
  profiles.forEach(p => {
    const type = pick(p, 'user_type', 'userType');
    if (type === 'coach') coachCount++;
    else if (type === 'athlete') athleteCount++;
    const tier = pick(p, 'subscription_tier', 'subscriptionTier');
    const status = pick(p, 'subscription_status', 'subscriptionStatus');
    const price = prices[tier];
    // Paid tier + billing-live (or status absent — e.g. an admin manual tier
    // set, which writes tier without a LS status) → counts toward MRR.
    if (price && (status == null || LIVE[status])) {
      mrr += price;
      if (byTier[tier] != null) byTier[tier]++;
      payingCoaches++;
    }
  });

  // ---- Marketplace GMV / platform take ----
  let gmvCents = 0, takeCents = 0, salesCount = 0, gmv30Cents = 0;
  const cutoff30 = nowMs - 30 * 864e5;
  sales.forEach(s => {
    const status = pick(s, 'payoutStatus', 'payout_status');
    if (status === 'cancelled') return; // refunded / voided — not revenue
    const amt = pick(s, 'amountCents', 'amount_cents') || 0;
    const fee = pick(s, 'platformFeeCents', 'platform_fee_cents') || 0;
    gmvCents += amt; takeCents += fee; salesCount++;
    const created = pick(s, 'createdAt', 'created_at');
    const t = created ? new Date(created).getTime() : 0;
    if (t && t >= cutoff30) gmv30Cents += amt;
  });

  // ---- Signups: total, 30d, Monday-bucketed split series ----
  const startOfWeek = (ms) => {
    const d = new Date(ms); d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7;    // 0 = Mon … 6 = Sun
    d.setDate(d.getDate() - day);
    return d;
  };
  const thisMon = startOfWeek(nowMs);
  const buckets = [], idx = {};
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(thisMon); d.setDate(d.getDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    idx[key] = buckets.length;
    buckets.push({ x: key, coaches: 0, athletes: 0 });
  }
  let signups30 = 0;
  profiles.forEach(p => {
    const created = pick(p, 'created_at', 'createdAt');
    const t = created ? new Date(created).getTime() : NaN;
    if (!t || isNaN(t)) return;
    if (t >= cutoff30) signups30++;
    const b = buckets[idx[startOfWeek(t).toISOString().slice(0, 10)]];
    if (b) { if (pick(p, 'user_type', 'userType') === 'coach') b.coaches++; else b.athletes++; }
  });

  return {
    coachCount, athleteCount, totalUsers: profiles.length,
    payingCoaches, mrr, arr: mrr * 12, mrrByTier: byTier,
    conversionPct: coachCount ? (payingCoaches / coachCount) * 100 : 0,
    gmvCents, takeCents, salesCount, gmv30Cents,
    signups30, signupSeries: buckets
  };
}
window.computePlatformAnalytics = computePlatformAnalytics;

// Locale-aware BUYER-FACING price formatter for the marketplace. Programs are
// stored + charged in USD — Lemon Squeezy is Merchant of Record and shows each
// buyer their exact localized total at checkout — so this formats the USD
// *reference* price through the viewer's own locale. Two wins, zero network:
//   1. grouping reads naturally per locale (1,299 / 1.299 / 1 299);
//   2. most non-US locales render USD as "US$…", disambiguating it from the
//      viewer's local dollar (AUD/CAD/NZD/etc.) — the actual point of the task.
// Pure Intl: no FX rate table to go stale, no secret, demo-safe. Falls back to
// a plain "$X" string if Intl/currency is somehow unavailable.
function fmtPrice(cents, opts) {
  opts = opts || {};
  const v = (cents || 0) / 100;
  const whole = v % 1 === 0;
  let locale;
  try { locale = (navigator.languages && navigator.languages[0]) || navigator.language; } catch (e) {}
  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: (whole && !opts.cents) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(v);
  } catch (e) {
    return '$' + (whole && !opts.cents ? v.toFixed(0) : v.toFixed(2));
  }
}
window.fmtPrice = fmtPrice;

// ----------------------------------------------------------------------
// Coach ↔ athlete message thread — shared UI used by BOTH the athlete
// dashboard (Coach tab) and the coach dashboard (per-athlete). Renders a
// scrollable bubble list + a composer into `container`.
//
// opts = { coachId, athleteId, viewerId, otherName }
//   viewerId — the signed-in user (decides sent vs received alignment)
//   otherName — display name of the person on the far side of the thread
// ----------------------------------------------------------------------
function _msgTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
           ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch (e) { return ''; }
}

// Renders one coach<->athlete conversation: chat bubbles PLUS the session notes
// for this pair, merged into a single time-ordered history. Notes are read-only
// context (replying to a note still happens in the Notes inbox), so they render
// as distinct annotations, not chat bubbles. Pass weaveNotes:false to suppress.
// Demo mode reads/writes the in-memory Store — no Supabase, nothing persists.
async function renderMessageThread(container, opts) {
  const { coachId, athleteId, viewerId, otherName } = opts || {};
  const weaveNotes = !opts || opts.weaveNotes !== false;
  const demo = !!window._demoMode;
  if (!container) return;
  // Tear down a realtime channel left over from a previous render of this host
  // (re-render, modal reopen, athlete switching threads) before rebuilding.
  if (container._msgCleanup) { try { container._msgCleanup(); } catch (e) {} container._msgCleanup = null; }
  container.innerHTML = '';

  const wrap = el('div', { class: 'msg-thread' });
  const list = el('div', { class: 'msg-list' });
  list.appendChild(el('div', { class: 'msg-loading dim text-sm' }, 'Loading messages…'));
  wrap.appendChild(list);

  // Composer. The athlete side gets a + that sends a logged set as a card.
  const composer = el('div', { class: 'msg-composer' });
  if (opts && typeof opts.onAttach === 'function') {
    const plus = el('button', { class: 'msg-attach', type: 'button', 'aria-label': 'Send a set', html: ICONS.plus });
    plus.addEventListener('click', () => opts.onAttach());
    composer.appendChild(plus);
  }
  const ta = el('textarea', { class: 'msg-input', rows: '1', placeholder: 'Message ' + (otherName || '') + '…', maxlength: '2000' });
  const sendBtn = el('button', { class: 'btn btn-primary msg-send' }, 'Send');
  composer.appendChild(ta);
  composer.appendChild(sendBtn);
  wrap.appendChild(composer);
  container.appendChild(wrap);

  // Reactions: messageId → [{ userId, reaction }]. Demo keeps them in memory.
  const reacts = {};
  const putReaction = (r) => {
    if (!r || !r.messageId) return;
    const arr = reacts[r.messageId] || (reacts[r.messageId] = []);
    const i = arr.findIndex(x => x.userId === r.userId);
    if (i >= 0) arr[i] = { userId: r.userId, reaction: r.reaction }; else arr.push({ userId: r.userId, reaction: r.reaction });
  };

  // Merge chat messages + session notes into one chronological timeline.
  function buildTimeline(messages, notes) {
    const items = [];
    (messages || []).forEach(m => items.push({
      kind: 'msg', id: m.id, ts: m.createdAt || '', mine: m.senderId === viewerId, body: m.body, meta: m.meta || null, readAt: m.readAt || null
    }));
    (notes || []).forEach(n => {
      if (n.note && n.note.trim()) items.push({
        kind: 'note', label: 'Session note', ts: (n.date || '') + 'T00:00:01Z', body: n.note, meta: ''
      });
      if (n.coachComment && n.coachComment.trim()) items.push({
        kind: 'note', label: 'Coach note', ts: n.coachCommentAt || ((n.date || '') + 'T00:00:02Z'),
        body: n.coachComment, meta: n.coachCommentAt ? _msgTime(n.coachCommentAt) : ''
      });
    });
    items.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    return items;
  }

  // A set or a whole session, sent from Train: a card in the lift's colour.
  function setCard(meta) {
    if (meta.type === 'session') {
      const c = el('div', { class: 'msg-card msg-card-session' });
      c.appendChild(el('div', { class: 'mc-kind' }, 'Session'));
      c.appendChild(el('div', { class: 'mc-title' }, meta.name || 'Training session'));
      const ton = Number(meta.tonnageKg) || 0;
      c.appendChild(el('div', { class: 'mc-nums', html: '<b>' + escHtml(String(meta.sets || 0)) + '</b><small>sets</small><i>·</i><b>' + Math.round(kgToDisplay(ton)).toLocaleString() + '</b><small>' + unitLabel() + ' moved</small>' }));
      const best = meta.best || {};
      const lifts = ['squat', 'bench', 'deadlift'].filter(l => best[l]);
      if (lifts.length) {
        const strip = el('div', { class: 'mc-best' });
        lifts.forEach(l => strip.appendChild(el('span', { class: 'mc-best-lift lift-' + l }, el('span', { class: 'lift-dot lift-' + l, 'aria-hidden': 'true' }),
          LIFT_LABELS[l] + ' ', el('b', {}, String(Math.round(kgToDisplay(best[l])))))));
        c.appendChild(strip);
      }
      return c;
    }
    const lift = ['squat', 'bench', 'deadlift'].includes(meta.lift) ? meta.lift : 'acc';
    const c = el('div', { class: 'msg-card lift-' + lift + (meta.pr ? ' is-pr' : '') });
    const w = Number(meta.weightKg) || 0;
    const top = el('div', { class: 'mc-top' });
    const id = el('div', { class: 'mc-id' });
    id.appendChild(el('div', { class: 'mc-kind' }, meta.pr ? 'New PR' : 'Set'));
    id.appendChild(el('div', { class: 'mc-title' }, lift !== 'acc' ? el('span', { class: 'lift-dot lift-' + lift, 'aria-hidden': 'true' }) : null, meta.name || 'Set'));
    top.appendChild(id);
    if (w > 0 && typeof uiBarbell === 'function') top.appendChild(el('span', { class: 'mc-bar', 'aria-hidden': 'true', html: uiBarbell(w) }));
    c.appendChild(top);
    c.appendChild(el('div', { class: 'mc-nums', html: (w > 0 ? '<b>' + kgToDisplay(w) + '</b><small>' + unitLabel() + '</small><i>×</i>' : '') +
      '<b>' + escHtml(String(meta.reps || 0)) + '</b>' + (meta.rpe ? '<span class="mc-rpe" style="--rc:' + rpeColor(meta.rpe) + '">RPE ' + escHtml(String(meta.rpe)) + '</span>' : '') }));
    if (meta.e1rmKg) c.appendChild(el('div', { class: 'mc-e1' }, 'e1RM ' + formatWeight(Math.round(meta.e1rmKg))));
    return c;
  }

  let lastItems = [];
  function paint(items, keepScroll) {
    lastItems = items;
    const prevTop = list.scrollTop;
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(el('div', { class: 'msg-empty dim text-sm' },
        'No messages yet. Say hi to ' + (otherName || 'them') + '.'));
      return;
    }
    // The most recent message I sent is the only one that carries a Sent/Seen
    // receipt (iMessage-style — the status rides the last of mine).
    let lastMineIdx = -1;
    items.forEach((it, i) => { if (it.kind === 'msg' && it.mine) lastMineIdx = i; });
    let lastDay = '';
    items.forEach((it, i) => {
      const day = (it.ts || '').slice(0, 10);
      if (day && day !== lastDay) {
        lastDay = day;
        let label = day;
        try { label = new Date(it.ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) {}
        list.appendChild(el('div', { class: 'msg-daysep' }, label));
      }
      if (it.kind === 'note') {
        const note = el('div', { class: 'msg-note' });
        note.appendChild(el('div', { class: 'msg-note-lbl' }, it.label));
        note.appendChild(el('div', { class: 'msg-note-body' }, it.body));
        if (it.meta) note.appendChild(el('div', { class: 'msg-note-meta' }, it.meta));
        list.appendChild(note);
        return;
      }
      const sum = reactionSummary(reacts[it.id], viewerId);
      const row = el('div', { class: 'msg-row ' + (it.mine ? 'mine' : 'theirs') + (sum.total ? ' has-react' : '') });
      const isCard = it.meta && (it.meta.type === 'set' || it.meta.type === 'session');
      const bubble = el('div', { class: 'msg-bubble' + (isCard ? ' is-card' : '') });
      if (isCard) bubble.appendChild(setCard(it.meta));
      else bubble.appendChild(el('div', { class: 'msg-body' }, it.body));
      bubble.appendChild(el('div', { class: 'msg-meta' }, _msgTime(it.ts)));
      if (sum.total) {
        const tb = el('button', { class: 'msg-react', type: 'button', 'aria-label': 'Reactions' });
        Object.keys(sum.counts).forEach(k => tb.appendChild(el('span', {}, REACT_EMOJI[k])));
        if (sum.total > 1) tb.appendChild(el('b', {}, String(sum.total)));
        if (sum.mine) tb.classList.add('mine');
        tb.addEventListener('click', (e) => { e.stopPropagation(); openPicker(it, bubble); });
        bubble.appendChild(tb);
      }
      uiLongPress(bubble, () => openPicker(it, bubble));
      row.appendChild(bubble);
      list.appendChild(row);
      if (i === lastMineIdx) {
        const seen = !!it.readAt;
        const rt = seen ? _msgTime(it.readAt) : '';
        list.appendChild(el('div', { class: 'msg-status' + (seen ? ' is-seen' : '') },
          seen ? ('Seen' + (rt ? ' · ' + rt : '')) : 'Sent'));
      }
    });
    list.scrollTop = keepScroll ? prevTop : list.scrollHeight;
  }

  // Long-press / double-tap a bubble: react, or copy the text.
  function openPicker(it, bubble) {
    const sum = reactionSummary(reacts[it.id], viewerId);
    const extra = [];
    if (!(it.meta && it.meta.type) && navigator.clipboard) extra.push({ label: 'Copy', onClick: () => { navigator.clipboard.writeText(it.body || '').then(() => toast('Copied'), () => {}); } });
    openReactionPicker(bubble, MSG_REACT_KEYS, sum.mine, (key) => react(it, key), extra);
  }
  async function react(it, key) {
    const before = (reacts[it.id] || []).map(x => Object.assign({}, x));
    putReaction({ messageId: it.id, userId: viewerId, reaction: key });
    paint(lastItems, true);
    if (demo || String(it.id).indexOf('demo-') === 0) {
      const s = Store.get(); const arr = s.messageReactions || (s.messageReactions = []);
      const i = arr.findIndex(x => x.messageId === it.id && x.userId === viewerId);
      if (i >= 0) arr[i].reaction = key; else arr.push({ messageId: it.id, userId: viewerId, reaction: key });
      return;
    }
    try {
      await DB.setMessageReaction({ messageId: it.id, coachId, athleteId, userId: viewerId, reaction: key });
    } catch (e) {
      reacts[it.id] = before; paint(lastItems, true);
      toast(e.message || 'Could not react');
    }
  }

  // Session notes for this pair (woven into the thread). Best-effort — a notes
  // failure must never blank the conversation.
  async function loadNotes() {
    if (!weaveNotes) return [];
    try {
      if (demo) return (Store.get().sessionNotes || []).filter(n => n.athleteId === athleteId);
      return await DB.listNotesForAthlete(athleteId);
    } catch (e) { console.warn('thread notes', e); return []; }
  }

  let messages = [];
  let notes = [];
  if (demo) {
    messages = (Store.get().messages || [])
      .filter(m => m.coachId === coachId && m.athleteId === athleteId)
      .slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    (Store.get().messageReactions || []).forEach(r => { if (messages.some(m => m.id === r.messageId)) putReaction(r); });
    notes = await loadNotes();
    paint(buildTimeline(messages, notes));
    // Clear unread on open (in-memory only — nothing persists in demo).
    (Store.get().messages || []).forEach(m => {
      if (m.coachId === coachId && m.athleteId === athleteId && m.senderId !== viewerId && !m.readAt) {
        m.readAt = new Date().toISOString();
      }
    });
  } else {
    try {
      const [msgs, nts, rx] = await Promise.all([DB.listMessages(coachId, athleteId), loadNotes(),
        (typeof DB.listMessageReactions === 'function' ? DB.listMessageReactions(coachId, athleteId).catch(() => []) : [])]);
      messages = msgs; notes = nts;
      (rx || []).forEach(putReaction);
      paint(buildTimeline(messages, notes));
      // Mark the ones addressed to me as read (fire and forget).
      DB.markThreadRead(coachId, athleteId, viewerId).catch(() => {});
    } catch (e) {
      console.warn('renderMessageThread load', e);
      list.innerHTML = '';
      list.appendChild(el('div', { class: 'msg-empty dim text-sm' }, 'Could not load messages. Try reloading.'));
    }

    // Live updates — append messages the moment they land (real mode only).
    // Filtered server-side on athlete_id (one thread per athlete); we re-check
    // coachId client-side and dedupe by id so the sender's own echo is a no-op.
    const insertCleanup = (typeof DB.subscribeMessages === 'function')
      ? DB.subscribeMessages({ column: 'athlete_id', value: athleteId }, (m) => {
          if (!m || m.coachId !== coachId || m.athleteId !== athleteId) return;
          if (messages.some(x => x.id === m.id)) return;
          messages.push(m);
          paint(buildTimeline(messages, notes));
          if (m.senderId !== viewerId) DB.markThreadRead(coachId, athleteId, viewerId).catch(() => {});
        })
      : null;
    // Live read-receipts — when the other party opens the thread, their read of
    // my messages stamps read_at; reflect it as "Seen" without a reload.
    const readCleanup = (typeof DB.subscribeMessageReads === 'function')
      ? DB.subscribeMessageReads({ column: 'athlete_id', value: athleteId }, (m) => {
          if (!m || m.coachId !== coachId || m.athleteId !== athleteId) return;
          const local = messages.find(x => x.id === m.id);
          if (!local || local.readAt === m.readAt) return;
          local.readAt = m.readAt;
          paint(buildTimeline(messages, notes), true);
        })
      : null;
    // Live reactions from the other side.
    const reactCleanup = (typeof DB.subscribeMessageReactions === 'function')
      ? DB.subscribeMessageReactions({ column: 'athlete_id', value: athleteId }, (r) => {
          if (!r || r.coachId !== coachId || r.userId === viewerId) return;
          putReaction(r);
          paint(lastItems, true);
        })
      : null;
    if (insertCleanup || readCleanup || reactCleanup) {
      container._msgCleanup = () => {
        try { if (insertCleanup) insertCleanup(); } catch (e) {}
        try { if (readCleanup) readCleanup(); } catch (e) {}
        try { if (reactCleanup) reactCleanup(); } catch (e) {}
      };
    }
  }

  async function doSend() {
    const body = ta.value.trim();
    if (!body) return;
    sendBtn.disabled = true; ta.disabled = true;
    try {
      let msg;
      if (demo) {
        msg = { id: 'demo-msg-' + Date.now(), coachId, athleteId, senderId: viewerId, body, createdAt: new Date().toISOString(), readAt: null };
        const s = Store.get(); (s.messages || (s.messages = [])).push(msg);
      } else {
        msg = await DB.sendMessage({ coachId, athleteId, senderId: viewerId, body });
        // Fire-and-forget push to the OTHER party (never block the send on it).
        // Recipient = whoever isn't the sender; deep-link to their dashboard.
        const toUserId = viewerId === coachId ? athleteId : coachId;
        const recipientIsAthlete = toUserId === athleteId;
        if (toUserId && typeof DB.sendPush === 'function') {
          let fromName = '';
          try { const me = getCurrentUser(); fromName = (me && me.name || '').split(' ')[0]; } catch (e) {}
          DB.sendPush({
            toUserId,
            title: fromName ? ('New message from ' + fromName) : 'New message',
            body: body.slice(0, 140),
            url: recipientIsAthlete ? '/athlete.html' : '/coach.html',
            tag: 'powa-msg-' + (recipientIsAthlete ? athleteId : coachId),
            category: 'messages'
          }).catch(() => {});
        }
      }
      if (msg) { messages.push(msg); paint(buildTimeline(messages, notes)); }
      ta.value = '';
      autosize();
    } catch (e) {
      console.error('sendMessage', e);
      toast('Could not send: are you still connected to them?');
    } finally {
      sendBtn.disabled = false; ta.disabled = false; ta.focus();
    }
  }
  sendBtn.addEventListener('click', doSend);
  // Enter sends, Shift+Enter newlines.
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  function autosize() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }
  ta.addEventListener('input', autosize);
  // Anything sent from elsewhere (Train's "Send to coach") lands here on repaint.
  container._msgRefresh = () => {
    if (!demo) return;
    messages = (Store.get().messages || []).filter(m => m.coachId === coachId && m.athleteId === athleteId)
      .slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    paint(buildTimeline(messages, notes));
  };
}
window.renderMessageThread = renderMessageThread;

async function saveSettings() {
  const u = getCurrentUser();
  if (!u) return;
  if (window._demoMode) { toast('Preview only in demo mode'); return; }
  const name = document.getElementById('setName').value.trim();
  const pwd = document.getElementById('setPwd').value;
  const bio = u.userType === 'coach' ? document.getElementById('setBio').value.trim() : null;
  const countrySel = document.getElementById('setCountry');
  const country = countrySel ? (countrySel.value || null) : null;
  if (!name) return toast('Name required');
  if (pwd && pwd.length < 6) return toast('Password must be at least 6 chars');

  try {
    const patch = { name, country_code: country };
    if (bio != null) patch.bio = bio;
    await DB.updateProfile(u.id, patch);
    window._user.name = name;
    window._user.countryCode = country;
    if (bio != null) window._user.bio = bio;
    if (pwd) {
      const { error } = await sb.auth.updateUser({ password: pwd });
      if (error) throw error;
    }
    toast('Settings saved');
    closeSettingsModal();
    renderNav('#nav');
  } catch (e) {
    toast(e.message || 'Could not save');
  }
}
window.saveSettings = saveSettings;

// Type-to-confirm account deletion. Replaces the old double-confirm() facade
// that ran a client-side profiles.delete() — an RLS-blocked no-op that never
// removed the auth user and never cascaded. Real erasure now happens
// server-side in the `delete-account` edge function (uid derived from the JWT →
// auth.admin.deleteUser + Storage sweep); this modal is the honest UX in front
// of it: export-first, type DELETE, and a truthful failure path (we do NOT sign
// you out or pretend it worked if the server call fails).
function deleteMyAccount() {
  if (window._demoMode) { toast('Account deletion is disabled in the demo.'); return; }
  ensureDeleteAccountModal();
  const input = document.getElementById('delAcctInput');
  const btn = document.getElementById('delAcctConfirm');
  const err = document.getElementById('delAcctError');
  if (input) input.value = '';
  if (err) err.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Delete everything'; }
  const m = document.getElementById('deleteAccountModal');
  if (m) m.classList.add('open');
  if (input) setTimeout(() => { try { input.focus(); } catch (_) {} }, 60);
}
window.deleteMyAccount = deleteMyAccount;

function ensureDeleteAccountModal() {
  if (document.getElementById('deleteAccountModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = '<div class="modal-backdrop" id="deleteAccountModal">' +
    '<div class="modal">' +
      '<button class="modal-close" aria-label="Close" onclick="closeDeleteAccountModal()">&times;</button>' +
      '<h3>Delete account</h3>' +
      '<p class="text-sm" style="line-height:1.6;color:var(--text-2)">This permanently erases your account and all your training data. <strong style="color:var(--text)">It cannot be undone.</strong></p>' +
      '<div style="margin:14px 0; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:rgba(255,255,255,0.02)">' +
        '<p class="text-xs" style="line-height:1.65;margin:0;color:var(--text-3)"><strong style="color:var(--text-2)">Erased:</strong> your profile, programs, logs, bodyweight, goals, meets, messages, form-check videos, reviews, referrals, notifications and coaching links.<br><strong style="color:var(--text-2)">Kept (anonymized):</strong> past marketplace purchase records we\'re legally required to retain for tax. With your identity removed.</p>' +
      '</div>' +
      '<p class="text-xs mb-8" style="color:var(--text-3)">Want a copy of your data first?</p>' +
      '<div class="flex gap-8 mb-16">' +
        '<button class="btn btn-block btn-ghost" onclick="exportMyData(\'json\')">Export JSON</button>' +
        '<button class="btn btn-block btn-ghost" onclick="exportMyData(\'csv\')">Export CSV</button>' +
      '</div>' +
      '<label class="block text-xs mb-4" style="color:var(--text-3)">Type <strong style="color:var(--red);letter-spacing:0.1em">DELETE</strong> to confirm</label>' +
      '<input type="text" id="delAcctInput" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" placeholder="DELETE" oninput="onDelAcctInput()" style="width:100%">' +
      '<div id="delAcctError" class="text-xs mt-8" style="color:var(--red);line-height:1.5"></div>' +
      '<div class="flex gap-8 mt-16">' +
        '<button class="btn btn-block" onclick="closeDeleteAccountModal()">Cancel</button>' +
        '<button class="btn btn-danger btn-block" id="delAcctConfirm" disabled onclick="confirmDeleteMyAccount()">Delete everything</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  document.body.appendChild(wrap.firstChild);
}

function onDelAcctInput() {
  const input = document.getElementById('delAcctInput');
  const btn = document.getElementById('delAcctConfirm');
  if (!input || !btn) return;
  btn.disabled = input.value.trim().toUpperCase() !== 'DELETE';
}
window.onDelAcctInput = onDelAcctInput;

function closeDeleteAccountModal() {
  const m = document.getElementById('deleteAccountModal');
  if (m) m.classList.remove('open');
}
window.closeDeleteAccountModal = closeDeleteAccountModal;

async function confirmDeleteMyAccount() {
  const input = document.getElementById('delAcctInput');
  const btn = document.getElementById('delAcctConfirm');
  const err = document.getElementById('delAcctError');
  if (!input || input.value.trim().toUpperCase() !== 'DELETE') return;
  if (err) err.textContent = '';
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
  const res = await DB.deleteAccount();
  if (res && res.ok) {
    toast('Account deleted. Signing you out…');
    try { await DB.signOut(); } catch (_) {}
    _toWelcome();
    return;
  }
  // Honest failure — never sign out or pretend it worked. Surface the real
  // reason and point at the manual erasure fallback.
  const reason = (res && res.reason) || 'Deletion failed';
  if (err) err.textContent = reason + '. Email powalifta1320@gmail.com and we\'ll erase it manually.';
  if (btn) { btn.disabled = false; btn.textContent = 'Delete everything'; }
}
window.confirmDeleteMyAccount = confirmDeleteMyAccount;

// =========================================================
// CALENDAR HEATMAP — GitHub-style training history
// renderCalendarHeatmap(container, { athleteId, weeks: 16 })
// =========================================================
function renderCalendarHeatmap(container, opts) {
  opts = opts || {};
  const weeks = opts.weeks || 16;
  const athleteId = opts.athleteId;
  if (!athleteId) return;

  container.innerHTML = '';

  const trainSet = new Set(Store.get().workoutLogs.filter(l => l.athleteId === athleteId).map(l => l.date));
  const restSet = new Set(Store.get().restDays.filter(r => r.athleteId === athleteId).map(r => r.date));

  // Volume per day (count of sets logged)
  const volume = {};
  Store.get().workoutLogs.filter(l => l.athleteId === athleteId).forEach(l => {
    volume[l.date] = (volume[l.date] || 0) + 1;
  });
  const maxV = Math.max(1, ...Object.values(volume));

  const today = new Date(); today.setHours(0,0,0,0);
  // Find the most recent Sunday (so columns align)
  const dayOfWeek = today.getDay(); // 0=Sun
  const lastSun = new Date(today); lastSun.setDate(today.getDate() - dayOfWeek);
  const start = new Date(lastSun); start.setDate(lastSun.getDate() - (weeks - 1) * 7);

  const grid = document.createElement('div');
  grid.className = 'cal-heatmap';
  // Day labels column
  const labels = document.createElement('div');
  labels.className = 'cal-labels';
  ['Mon', 'Wed', 'Fri'].forEach(d => labels.appendChild(el('div', { class: 'cal-lbl' }, d)));
  grid.appendChild(labels);

  for (let w = 0; w < weeks; w++) {
    const col = document.createElement('div');
    col.className = 'cal-col';
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const iso = date.toISOString().slice(0, 10);
      const isFuture = date > today;
      let cls = 'cal-cell';
      let title = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      if (isFuture) {
        cls += ' future';
      } else if (trainSet.has(iso)) {
        const v = volume[iso] || 1;
        const level = Math.min(4, Math.ceil((v / maxV) * 4));
        cls += ' lvl-' + level;
        title += ' · ' + v + ' set' + (v === 1 ? '' : 's');
      } else if (restSet.has(iso)) {
        cls += ' rest';
        title += ' · rest day';
      }
      const cell = el('div', { class: cls, title });
      col.appendChild(cell);
    }
    grid.appendChild(col);
  }

  container.appendChild(grid);

  // Legend
  const legend = el('div', { class: 'cal-legend' });
  legend.appendChild(el('span', { class: 'cal-legend-label' }, 'Less'));
  [0, 1, 2, 3, 4].forEach(l => legend.appendChild(el('div', { class: 'cal-cell lvl-' + l })));
  legend.appendChild(el('span', { class: 'cal-legend-label' }, 'More'));
  legend.appendChild(el('div', { class: 'cal-cell rest', style: 'margin-left: 14px;' }));
  legend.appendChild(el('span', { class: 'cal-legend-label' }, 'Rest'));
  container.appendChild(legend);
}
window.renderCalendarHeatmap = renderCalendarHeatmap;

// =========================================================
// GLOBAL MODAL HELPERS
// Always close any open modal before opening a new one.
// Click outside the modal (on the backdrop) closes it.
// =========================================================
window.closeAllModals = function() {
  document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
};
document.addEventListener('click', function(e) {
  // If user clicked the backdrop element itself (not a child), close it
  if (e.target.classList && e.target.classList.contains('modal-backdrop') && e.target.classList.contains('open')) {
    e.target.classList.remove('open');
  }
});
// Press Esc to close any open modal
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') window.closeAllModals();
});

// =========================================================
// GLOBAL HASH → MODAL HANDLER
// Opens login/signup modal whenever the URL hash changes to #login / #signup,
// AND on initial page load. Works on whatever page has the modals (homepage).
// =========================================================
function checkHashForModal() {
  if (location.hash === '#login' && typeof window.openLoginModal === 'function') {
    window.closeAllModals();
    window.openLoginModal();
  } else if (location.hash === '#signup' && typeof window.openSignupModal === 'function') {
    window.closeAllModals();
    window.openSignupModal('athlete');
  }
}
window.addEventListener('hashchange', checkHashForModal);
// On load, the inline script defining openLoginModal hasn't run yet when app.js executes.
// Defer the initial check until after everything's loaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(checkHashForModal, 50));
} else {
  setTimeout(checkHashForModal, 50);
}

// =========================================================
// VARIANTS & EXERCISES
// =========================================================
const VARIANTS = {
  squat:    { 'Competition': 1.0, 'Paused': 1.07, 'Tempo': 1.12, 'Pin': 1.08 },
  bench:    { 'Competition': 1.0, 'Paused': 1.06, 'Close Grip': 1.09, 'Pin Press': 1.08, 'Incline': 1.12 },
  deadlift: { 'Competition': 1.0, 'Paused': 1.07, 'Deficit': 1.06, 'RDL': 1.10 }
};

const ACCESSORY_EXERCISES = {
  push: ['Overhead Press', 'Dumbbell Bench Press', 'Push-ups', 'Tricep Pushdown', 'Tricep Extensions', 'Lateral Raises', 'Dips', 'Front Raises'],
  pull: ['Pull-ups', 'Chin-ups', 'Barbell Row', 'Pendlay Row', 'Lat Pulldown', 'Cable Row', 'Face Pulls', 'Bicep Curls', 'Hammer Curls', 'Shrugs'],
  legs: ['Front Squat', 'Hack Squat', 'Leg Press', 'Romanian Deadlift', 'Lunges', 'Bulgarian Split Squats', 'Leg Curls', 'Leg Extensions', 'Calf Raises', 'Hip Thrust']
};

const LIFT_LABELS = {
  squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift',
  push: 'Push', pull: 'Pull', legs: 'Legs', cardio: 'Cardio', other: 'Other'
};

const MAIN_LIFTS = ['squat', 'bench', 'deadlift'];
const ACCESSORY_LIFTS = ['push', 'pull', 'legs'];
const CARDIO_TYPES = ['Running', 'Cycling', 'Rowing', 'Stair Master', 'Walking', 'Swimming', 'Elliptical', 'Sled Push'];

function variantsFor(lift) { return VARIANTS[lift] ? Object.keys(VARIANTS[lift]) : []; }
function multiplierFor(lift, variant) {
  if (VARIANTS[lift] && VARIANTS[lift][variant] != null) return VARIANTS[lift][variant];
  return 1.0;
}
function exercisesFor(lift) { return ACCESSORY_EXERCISES[lift] || []; }

// =========================================================
// EXERCISE LIBRARY — coaching cues for the competition lifts, their
// training variants, and the core accessories. Pure data + lookups,
// keyed off the SAME lift/variant taxonomy as logging (VARIANTS /
// ACCESSORY_EXERCISES) so the log flow can pull contextual cues via
// cuesForLift(). Surfaced as the public reference page exercises.html.
// All content is authored/trusted — safe to template into HTML.
// =========================================================
const EXERCISE_GROUP_LABELS = {
  squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift',
  push: 'Push', pull: 'Pull', legs: 'Legs'
};

const EXERCISE_LIBRARY = [
  // ---------------- SQUAT ----------------
  {
    key: 'squat-competition', group: 'squat', lift: 'squat', variant: 'Competition', multiplier: 1.0,
    name: 'Competition Squat', pattern: 'Squat · knees + hips',
    summary: 'Low-bar back squat to legal depth. The contested movement and the 1.0 baseline every squat variant is scored against.',
    setup: [
      'Bar across the rear delts, not the neck. Pull the shoulder blades together to build the shelf.',
      'Grip as narrow as the shoulders allow pain-free; elbows tucked down, wrists stacked over the bar.',
      'Feet just outside hip width, toes turned out 20–30°, weight centred over the mid-foot.'
    ],
    cues: [
      'Take a full belly of air and brace against your belt before you unrack; walk it out in three steps.',
      'Break at the hips and knees together and spread the floor with your feet.',
      'Hit depth (hip crease below the top of the knee) then drive the whole foot through the platform.'
    ],
    faults: [
      'Knees caving: think "push the knees out to track over the toes".',
      'Chest folding forward out of the hole: more upper-back tightness and a harder brace, not a lighter bar.',
      'Cutting depth: film from the side at hip height. Front-on hides it.'
    ]
  },
  {
    key: 'squat-paused', group: 'squat', lift: 'squat', variant: 'Paused', multiplier: 1.07,
    name: 'Paused Squat', pattern: 'Squat · positional',
    summary: 'A 2–3s hold at depth kills the stretch reflex, so it carries over above competition. That is why it scores 1.07× of a comp squat.',
    cues: [
      'Stay braced through the pause; do not bleed air or let the chest drop.',
      'Hold at your true competition depth, not an inch higher.',
      'Explode out of the hole on the count. No rocking or re-bending to build momentum.'
    ]
  },
  {
    key: 'squat-tempo', group: 'squat', lift: 'squat', variant: 'Tempo', multiplier: 1.12,
    name: 'Tempo Squat', pattern: 'Squat · control',
    summary: 'A slow eccentric (commonly 3–4s down) builds position and control under load; the time under tension is why it carries the highest squat multiplier at 1.12×.',
    cues: [
      'Count the descent honestly. Most lifters rush the last third.',
      'Keep the bar over the mid-foot the whole way down; control is the point, not speed.',
      'Normal, hard drive up once you reach depth.'
    ]
  },
  {
    key: 'squat-pin', group: 'squat', lift: 'squat', variant: 'Pin', multiplier: 1.08,
    name: 'Pin Squat', pattern: 'Squat · dead-stop',
    summary: 'Squatting up from pins set near depth removes all stretch reflex and trains a dead-stop drive out of the hole. Scored at 1.08×.',
    cues: [
      'Set the pins at or just above your sticking point.',
      'Settle on the pins for a beat (relax slightly without losing your brace) then drive.',
      'No bouncing the bar off the pins; the dead-stop is the whole exercise.'
    ]
  },
  // ---------------- BENCH ----------------
  {
    key: 'bench-competition', group: 'bench', lift: 'bench', variant: 'Competition', multiplier: 1.0,
    name: 'Competition Bench Press', pattern: 'Horizontal press',
    summary: 'Paused bench to a motionless chest touch. The contested press and the 1.0 baseline for every bench variant.',
    setup: [
      'Shoulder blades retracted and pinned down; build a tight upper-back arch.',
      'Eyes under the bar, feet planted for leg drive, glutes stay on the bench.',
      'Grip width inside the rings. Find the width that keeps the forearms vertical at the chest.'
    ],
    cues: [
      'Pull the bar out of the rack rather than press it out; keep the lats tight.',
      'Lower under control to the same touch point each rep and pause it dead-still.',
      'Press back and slightly toward the rack, driving through the legs without lifting the hips.'
    ],
    faults: [
      'Flaring the elbows to 90°: tuck toward 45–70° to protect the shoulders and keep the press in the groove.',
      'Bouncing the bar off the chest: a real comp pause exposes the weak range. Train it.',
      'Hips rising on the drive: more leg drive into the bench, not up off it.'
    ]
  },
  {
    key: 'bench-paused', group: 'bench', lift: 'bench', variant: 'Paused', multiplier: 1.06,
    name: 'Paused Bench (long pause)', pattern: 'Horizontal press · positional',
    summary: 'A deliberate 2–3s pause on the chest (longer than a meet command) overloads the dead-stop press, scoring 1.06×.',
    cues: [
      'Stay tight and keep the air in during the pause; do not sink into the chest.',
      'Hold at your true touch point, not high on the belly.',
      'Press the instant the count ends. Explosive off the chest.'
    ]
  },
  {
    key: 'bench-closegrip', group: 'bench', lift: 'bench', variant: 'Close Grip', multiplier: 1.09,
    name: 'Close-Grip Bench Press', pattern: 'Horizontal press · triceps',
    summary: 'A grip ~2 hands narrower shifts load to the triceps and the lockout. A top builder for a weak finish, scored at 1.09×.',
    cues: [
      'Grip about shoulder width. Narrow enough to load the triceps, not so narrow the wrists hurt.',
      'Keep the elbows tucked; the bar tracks lower on the torso than a comp bench.',
      'Drive the lockout with the triceps, not by flaring.'
    ]
  },
  {
    key: 'bench-pinpress', group: 'bench', lift: 'bench', variant: 'Pin Press', multiplier: 1.08,
    name: 'Pin Press', pattern: 'Horizontal press · dead-stop',
    summary: 'Pressing from pins at a chosen height trains a dead-stop drive through a specific sticking point; scored at 1.08×.',
    cues: [
      'Set the pins at your sticking height. Usually 2–4cm off the chest.',
      'Let the bar settle dead on the pins, stay tight, then press.',
      'No pre-load bounce; start each rep from a true stop.'
    ]
  },
  {
    key: 'bench-incline', group: 'bench', lift: 'bench', variant: 'Incline', multiplier: 1.12,
    name: 'Incline Bench Press', pattern: 'Incline press · upper chest',
    summary: 'A 15–30° incline biases the upper chest and front delts and lengthens the press. The hardest bench variant, scored at 1.12×.',
    cues: [
      'Keep the same retracted, tight setup; the bench angle does the work.',
      'Touch high on the chest, just below the collarbone.',
      'Press straight up over the shoulders, not back toward your face.'
    ]
  },
  // ---------------- DEADLIFT ----------------
  {
    key: 'deadlift-competition', group: 'deadlift', lift: 'deadlift', variant: 'Competition', multiplier: 1.0,
    name: 'Competition Deadlift', pattern: 'Hip hinge',
    summary: 'Conventional or sumo pull to lockout. The contested lift and the 1.0 baseline for every deadlift variant.',
    setup: [
      'Bar over the mid-foot, roughly an inch from the shins.',
      'Take the slack out of the bar. Pull the chest up until the plates just lift the bar tension.',
      'Lats engaged, shoulders slightly ahead of or over the bar, neutral spine.'
    ],
    cues: [
      'Push the floor away rather than yanking the bar up.',
      'Keep the bar dragging up the legs. Let it drift forward and the lift stalls.',
      'Finish by driving the hips through to a tall lockout; do not lean back past straight.'
    ],
    faults: [
      'Hips shooting up first: the bar should leave the floor with the hips and chest rising together.',
      'Rounding the lower back: brace harder and set the lats before the pull, or drop the load.',
      'Bar drifting away from the shins: think "lats on, bar in".'
    ]
  },
  {
    key: 'deadlift-paused', group: 'deadlift', lift: 'deadlift', variant: 'Paused', multiplier: 1.07,
    name: 'Paused Deadlift', pattern: 'Hip hinge · positional',
    summary: 'A 1–2s pause just below the knee overloads the most common sticking point off the floor; scored at 1.07×.',
    cues: [
      'Pause about 2–5cm below the knee with the bar against the legs.',
      'Stay braced and keep the lats tight through the hold.',
      'Resume in one piece. No hitching or re-bending the hips.'
    ]
  },
  {
    key: 'deadlift-deficit', group: 'deadlift', lift: 'deadlift', variant: 'Deficit', multiplier: 1.06,
    name: 'Deficit Deadlift', pattern: 'Hip hinge · range',
    summary: 'Standing on a 2–5cm block lengthens the pull and builds strength off the floor; scored at 1.06×.',
    cues: [
      'Use only as much deficit as you can keep a flat back through.',
      'Same mid-foot setup: the extra range comes from the higher start, not a forward bar.',
      'Drive the floor away; expect the bottom to feel heavier than a comp pull.'
    ]
  },
  {
    key: 'deadlift-rdl', group: 'deadlift', lift: 'deadlift', variant: 'RDL', multiplier: 1.10,
    name: 'Romanian Deadlift (RDL)', pattern: 'Hip hinge · hamstrings',
    summary: 'A top-down hinge with soft knees that overloads the hamstrings and glutes through the eccentric. The highest-carryover deadlift accessory, scored at 1.10×.',
    cues: [
      'Start standing; push the hips back and slide the bar down the thighs.',
      'Keep a slight, fixed knee bend. This is a hinge, not a squat.',
      'Stop when the hamstrings run out of stretch (usually mid-shin), then drive the hips back through.'
    ]
  },
  // ---------------- PUSH (accessory) ----------------
  {
    key: 'push-ohp', group: 'push', lift: 'push', name: 'Overhead Press', pattern: 'Vertical press',
    summary: 'Standing barbell press: the anchor upper-body push accessory; builds delts, triceps and the bench lockout.',
    cues: [
      'Squeeze the glutes and brace so the press does not become a lean-back.',
      'Bar starts on the front delts; move the head back to clear it, then press around the face.',
      'Finish with the bar stacked over the mid-foot, biceps by the ears.'
    ]
  },
  {
    key: 'push-dips', group: 'push', lift: 'push', name: 'Weighted Dips', pattern: 'Vertical press · chest/triceps',
    summary: 'A loaded bodyweight press that hammers the lower chest and triceps through a deep range.',
    cues: [
      'Lean the torso forward slightly for chest, stay upright for triceps.',
      'Lower until the upper arms reach parallel. No deeper if the shoulders complain.',
      'Lock out fully at the top without shrugging.'
    ]
  },
  {
    key: 'push-pushdown', group: 'push', lift: 'push', name: 'Triceps Pushdown', pattern: 'Isolation · triceps',
    summary: 'Cable isolation for the triceps. Cheap volume for the bench lockout with no axial fatigue.',
    cues: [
      'Pin the elbows to your sides and keep them there.',
      'Lock out fully and squeeze, then control the weight back up.',
      'Chase reps and a stretch, not a heavy ego load.'
    ]
  },
  // ---------------- PULL (accessory) ----------------
  {
    key: 'pull-row', group: 'pull', lift: 'pull', name: 'Barbell Row', pattern: 'Horizontal pull',
    summary: 'A hinged barbell row. The workhorse back builder that supports the squat brace and deadlift lockout.',
    cues: [
      'Hinge to around 45° and hold the torso angle still. No jerking upright each rep.',
      'Row to the lower ribs / upper stomach, leading with the elbows.',
      'Control the bar down; do not let it pull you out of position.'
    ]
  },
  {
    key: 'pull-pullup', group: 'pull', lift: 'pull', name: 'Pull-ups', pattern: 'Vertical pull',
    summary: 'Bodyweight (or loaded) vertical pull for lats and upper-back width.',
    cues: [
      'Start from a full dead hang with the shoulders set down.',
      'Drive the elbows down and back; clear the chin over the bar.',
      'Lower all the way under control. Half reps train half a back.'
    ]
  },
  {
    key: 'pull-facepull', group: 'pull', lift: 'pull', name: 'Face Pulls', pattern: 'Isolation · rear delts',
    summary: 'Rear-delt and external-rotation work. Cheap shoulder insurance for big benchers.',
    cues: [
      'Pull the rope to your forehead with the elbows high.',
      'Externally rotate at the end. Thumbs back, like a double biceps pose.',
      'Light weight, high reps, full control.'
    ]
  },
  // ---------------- LEGS (accessory) ----------------
  {
    key: 'legs-frontsquat', group: 'legs', lift: 'legs', name: 'Front Squat', pattern: 'Squat · quads',
    summary: 'A front-loaded squat that builds the quads and the upright torso strength your back squat depends on.',
    cues: [
      'Rack the bar on the front delts with the elbows high; fingertips only is fine.',
      'Stay as upright as possible and keep the elbows up through the whole rep.',
      'Squat to full depth. Losing the elbows means losing the bar.'
    ]
  },
  {
    key: 'legs-legpress', group: 'legs', lift: 'legs', name: 'Leg Press', pattern: 'Squat · quads',
    summary: 'Machine quad volume with low systemic fatigue. Easy to load and easy to recover from.',
    cues: [
      'Set the feet so the knees track over the toes; do not let the lower back round off the pad.',
      'Lower to a deep but pain-free knee bend.',
      'Stop short of locking the knees out hard at the top.'
    ]
  },
  {
    key: 'legs-bulgarian', group: 'legs', lift: 'legs', name: 'Bulgarian Split Squat', pattern: 'Single-leg',
    summary: 'A single-leg squat that builds quads and glutes and irons out left/right imbalances.',
    cues: [
      'Rear foot on the bench, front foot far enough out to keep the knee behind the toes at the bottom.',
      'Drop straight down and drive through the whole front foot.',
      'Keep the torso tall; lean forward slightly to bias the glute.'
    ]
  },
  {
    key: 'legs-hipthrust', group: 'legs', lift: 'legs', name: 'Hip Thrust', pattern: 'Hip extension · glutes',
    summary: 'Loaded hip extension for the glutes. Direct lockout power for both the squat and the deadlift.',
    cues: [
      'Upper back on the bench, chin tucked, bar over the hips on a pad.',
      'Drive through the heels to full hip extension and squeeze the glutes hard.',
      'Stop at a flat torso. Do not hyperextend the lower back to chase height.'
    ]
  }
];

function exerciseLibrary() { return EXERCISE_LIBRARY.slice(); }
function exerciseGroups() {
  const seen = [];
  EXERCISE_LIBRARY.forEach(e => { if (seen.indexOf(e.group) === -1) seen.push(e.group); });
  return seen;
}
function exerciseGroupLabel(g) { return EXERCISE_GROUP_LABELS[g] || (g ? g.charAt(0).toUpperCase() + g.slice(1) : ''); }
function findExercise(key) { return EXERCISE_LIBRARY.find(e => e.key === key) || null; }

// Best cue entry for a logged lift+variant — used for contextual cues in the log flow.
function cuesForLift(lift, variant) {
  if (!lift) return null;
  const L = String(lift).toLowerCase();
  if (variant) {
    const V = String(variant).toLowerCase();
    const exact = EXERCISE_LIBRARY.find(e => e.lift === L && e.variant && e.variant.toLowerCase() === V);
    if (exact) return exact;
  }
  const base = EXERCISE_LIBRARY.find(e => e.lift === L && (e.variant === 'Competition' || !e.variant));
  if (base) return base;
  return EXERCISE_LIBRARY.find(e => e.lift === L) || null;
}

// Free-text search across name / pattern / summary / cues / faults.
function searchExercises(q) {
  const s = String(q == null ? '' : q).trim().toLowerCase();
  if (!s) return EXERCISE_LIBRARY.slice();
  return EXERCISE_LIBRARY.filter(e => {
    const hay = [e.name, e.pattern, e.summary, e.variant || '',
      (e.setup || []).join(' '), (e.cues || []).join(' '), (e.faults || []).join(' ')
    ].join(' ').toLowerCase();
    return hay.indexOf(s) !== -1;
  });
}

// Pure HTML for one exercise's cue body (summary + setup/cues/faults lists).
// Authored/trusted content — safe to template. Used by exercises.html and the log-flow cue popover.
// ⚠️ SECURITY INVARIANT: `e` MUST come only from the static EXERCISE_LIBRARY constant
// (via cuesForLift/findExercise). The fields below are interpolated into innerHTML
// WITHOUT escaping. If this is ever fed coach/DB/user-authored data, escHtml() every
// interpolation first or it becomes stored XSS. (2026-07-13 audit note.)
function exerciseCueBodyHtml(e) {
  if (!e) return '';
  let h = '<p class="exlib-summary">' + e.summary + '</p>';
  const block = (title, items, cls) => {
    if (!items || !items.length) return '';
    return '<div class="exlib-block ' + cls + '">' +
      '<h4 class="exlib-block-title">' + title + '</h4><ul>' +
      items.map(i => '<li>' + i + '</li>').join('') + '</ul></div>';
  };
  h += block('Set up', e.setup, 'exlib-setup');
  h += block('Execution', e.cues, 'exlib-cues');
  h += block('Fix the common faults', e.faults, 'exlib-faults');
  return h;
}

// =========================================================
// E1RM (RPE-percentage / Tuchscherer-style)
// =========================================================
function calcE1RM(weight, reps, rpe) {
  if (!weight || !reps || !rpe) return 0;
  const adj = (reps - 1) + (10 - rpe);
  if (adj <= 0) return weight;
  const pct = 1 - adj * 0.0333;
  if (pct < 0.4) return weight / 0.4;
  return weight / pct;
}

function calcCompE1RM(weight, reps, rpe, lift, variant) {
  return calcE1RM(weight, reps, rpe) * multiplierFor(lift, variant);
}

// =========================================================
// SMART NEXT SET — autoregulation. When a set feels harder or easier than its
// target, the next set of the same exercise moves by the same amount of
// "today", using the e1RM maths above. Pure: unit-tested in tests.html.
//   prev: { weight, planned (kg the plan had for it), reps, rpe (felt), target }
//   next: { weight (kg planned; 0 = no load given), reps, rpe (target) }
//   unit: 'kg' | 'lbs' → rounds to a loadable jump (2.5 kg / 5 lb)
// Half an RPE off is noise, so it doesn't move anything. An earlier adjustment
// carries forward (lifted 152.5 instead of 160 and it felt right → stay there).
// Never more than 10% from the plan. Returns { kg, fromKg, delta, dir } or null.
// =========================================================
function rpeLoadPct(reps, rpe) {
  const adj = (Number(reps) - 1) + (10 - Number(rpe));
  return adj <= 0 ? 1 : Math.max(0.4, 1 - adj * 0.0333);
}
function smartNextLoad(prev, next, unit) {
  if (!prev || !next) return null;
  const okR = v => isFinite(v) && v >= 5 && v <= 10;
  const pw = Number(prev.weight), pr = Number(prev.reps), felt = Number(prev.rpe), tgt = Number(prev.target);
  const nr = Number(next.reps), nt = Number(next.rpe), planned = Number(next.weight) || 0;
  if (!(pw > 0) || !(pr > 0) || !(nr > 0) || !okR(felt) || !okR(nt)) return null;
  let raw;
  if (planned > 0) {
    if (!okR(tgt)) return null;
    const prevPlan = Number(prev.planned) > 0 ? Number(prev.planned) : pw;
    const feltEff = Math.abs(felt - tgt) <= 0.5 ? tgt : felt;
    const ratio = (pw / rpeLoadPct(pr, feltEff)) / (prevPlan / rpeLoadPct(pr, tgt));
    raw = Math.min(planned * 1.1, Math.max(planned * 0.9, planned * ratio));
  } else {
    raw = pw / rpeLoadPct(pr, felt) * rpeLoadPct(nr, nt);
  }
  const step = unit === 'lbs' ? 5 * KG_PER_LB : 2.5;
  const kg = Math.round(raw / step) * step;
  if (!(kg > 0)) return null;
  if (planned > 0 && Math.abs(kg - planned) < step / 2) return null;
  return { kg: Math.round(kg * 1000) / 1000, fromKg: planned, delta: Math.round((kg - planned) * 1000) / 1000, dir: planned > 0 ? (kg < planned ? 'down' : 'up') : 'set' };
}
// The load the PLAN had for a set, even after smart next set moved it (copies,
// templates and duplicated weeks must carry the coach's number, not today's).
function planWeight(set) { return set && set.plannedWeight != null ? set.plannedWeight : (set ? set.weight : 0); }
// =========================================================
// PLATE MILESTONES — "your first 3-plate squat". Counted in the plate the
// lifter's gym counts in: 25 kg plates on a 20 kg bar (70 / 120 / 170 / 220 /
// 270 kg) or 45 lb plates on a 45 lb bar (135 / 225 / 315 / 405 / 495 lb).
// Pure: unit-tested in tests.html.
// =========================================================
function plateCountFor(kg, unit) {
  const w = Number(kg) || 0;
  const n = unit === 'lbs' ? Math.floor((w / KG_PER_LB - 45 + 0.5) / 90) : Math.floor((w - 20 + 0.01) / 50);
  return Math.max(0, Math.min(8, n));
}
function plateMilestoneKg(n, unit) { return unit === 'lbs' ? (45 + 90 * n) * KG_PER_LB : 20 + 50 * n; }
function newPlateMilestone(prevBestKg, newKg, unit) {
  const now = plateCountFor(newKg, unit);
  return now >= 1 && now > plateCountFor(prevBestKg || 0, unit) ? now : null;
}
// Every milestone a lifter holds on the big three, with the day it first happened.
function plateClub(logs, athleteId, unit) {
  const out = { squat: [], bench: [], deadlift: [] }, best = { squat: 0, bench: 0, deadlift: 0 };
  (logs || []).filter(l => l && l.athleteId === athleteId && out[l.lift] && Number(l.weight) > 0)
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .forEach(l => {
      const before = plateCountFor(best[l.lift], unit), now = plateCountFor(l.weight, unit);
      for (let n = before + 1; n <= now; n++) out[l.lift].push({ n, date: l.date, kg: Number(l.weight) });
      if (Number(l.weight) > best[l.lift]) best[l.lift] = Number(l.weight);
    });
  return out;
}

// =========================================================
// BODYWEIGHT MILESTONES — the gym's own goals, fair to every size because
// they're relative: your first bodyweight bench, a 1.5× bodyweight squat, a
// double-bodyweight deadlift. Women's ladders start lower (that's where the
// standards sit). Counts the weight actually on the bar, against today's
// bodyweight. Pure: unit-tested in tests.html.
// =========================================================
const BW_LADDER = {
  male:   { squat: [1, 1.5, 2, 2.5], bench: [0.75, 1, 1.25, 1.5], deadlift: [1, 1.5, 2, 2.5, 3] },
  female: { squat: [0.75, 1, 1.5, 2], bench: [0.5, 0.75, 1, 1.25], deadlift: [1, 1.5, 2, 2.5] }
};
function bwMilestoneTitle(lift, ratio) {
  const l = (LIFT_LABELS[lift] || lift).toLowerCase();
  if (ratio === 1) return 'Bodyweight ' + l;
  if (ratio === 2) return 'Double bodyweight ' + l;
  if (ratio === 3) return 'Triple bodyweight ' + l;
  return ratio + '× bodyweight ' + l;
}
// The highest rung a new set crosses for the first time (null = none).
function newBwMilestone(prevBestKg, newKg, bodyweightKg, lift, sex) {
  const bw = Number(bodyweightKg), w = Number(newKg), prev = Number(prevBestKg) || 0;
  const ladder = (BW_LADDER[sex === 'female' ? 'female' : 'male'] || {})[lift];
  if (!ladder || !(bw > 0) || !(w > 0)) return null;
  const crossed = ladder.filter(x => w >= x * bw - 0.01 && prev < x * bw - 0.01);
  if (!crossed.length) return null;
  const x = crossed[crossed.length - 1];
  return { lift, ratio: x, kg: Math.round(x * bw * 10) / 10, title: bwMilestoneTitle(lift, x) };
}
// Per lift: the rungs already held (by best weight on the bar) and the next one.
function bwMilestoneLadder(bestKgByLift, bodyweightKg, sex) {
  const bw = Number(bodyweightKg);
  if (!(bw > 0)) return [];
  const lad = BW_LADDER[sex === 'female' ? 'female' : 'male'];
  return MAIN_LIFTS.map(lift => {
    const best = Number((bestKgByLift || {})[lift]) || 0;
    const held = lad[lift].filter(x => best >= x * bw - 0.01);
    const next = lad[lift].find(x => best < x * bw - 0.01) || null;
    return { lift, best, held, next, nextKg: next ? Math.round(next * bw * 10) / 10 : null, toGoKg: next ? Math.max(0, Math.round((next * bw - best) * 10) / 10) : 0 };
  });
}

// =========================================================
// WEEKLY GOAL — how many sessions a week (2–6). The streak counts weeks in a
// row the goal was hit, so a planned rest day can never break it: only a
// whole week short does. A week in progress never breaks it (it only adds once
// it's hit). Dates are YYYY-MM-DD session days. Pure: unit-tested.
// =========================================================
function _monISO(iso) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); }
function _addDaysISO(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weeklyGoalStatus(dates, goal, today) {
  goal = Math.max(2, Math.min(6, Math.round(Number(goal) || 3)));
  const perWeek = {};
  new Set((dates || []).filter(Boolean)).forEach(d => { const w = _monISO(d); perWeek[w] = (perWeek[w] || 0) + 1; });
  const thisWk = _monISO(today);
  const done = perWeek[thisWk] || 0;
  let streak = done >= goal ? 1 : 0;
  for (let wk = _addDaysISO(thisWk, -7), i = 0; (perWeek[wk] || 0) >= goal && i < 520; wk = _addDaysISO(wk, -7), i++) streak++;
  return { goal, done, met: done >= goal, left: Math.max(0, goal - done), streak };
}
function getWeekGoal() { try { const n = Number(localStorage.getItem('powa-week-goal')); return n >= 2 && n <= 6 ? n : null; } catch (e) { return null; } }
function setWeekGoal(n) { try { localStorage.setItem('powa-week-goal', String(Math.max(2, Math.min(6, Math.round(n))))); } catch (e) {} }

// =========================================================
// READINESS — one tap before a session: fresh / normal / beat up. Beat up
// takes ~5% off today's planned loads (the nearest weight you can load); the
// smart next set carries on from there. Stored per day on this device.
// =========================================================
const READINESS = { fresh: { label: 'Fresh', factor: 1 }, normal: { label: 'Normal', factor: 1 }, rough: { label: 'Beat up', factor: 0.95 } };
function readinessLoad(kg, level, unit) {
  const r = READINESS[level];
  const w = Number(kg) || 0;
  if (!r || r.factor === 1 || !(w > 0)) return null;
  const step = unit === 'lbs' ? 5 * KG_PER_LB : 2.5;
  // Nearest loadable weight to 95%; if that rounds back up to the plan, one step down.
  let out = Math.round(w * r.factor / step) * step;
  if (out >= w) out = Math.floor(w * r.factor / step) * step;
  return out > 0 && out < w ? Math.round(out * 1000) / 1000 : null;
}
function getReadiness(dateIso) { try { const v = localStorage.getItem('powa-ready-' + dateIso); return READINESS[v] ? v : null; } catch (e) { return null; } }
function setReadiness(dateIso, level) { try { localStorage.setItem('powa-ready-' + dateIso, level); } catch (e) {} }

if (typeof window !== 'undefined') Object.assign(window, { BW_LADDER, bwMilestoneTitle, newBwMilestone, bwMilestoneLadder,
  weeklyGoalStatus, getWeekGoal, setWeekGoal, READINESS, readinessLoad, getReadiness, setReadiness });
function getSmartLoadOn() { try { return localStorage.getItem('powa-smart-load') !== '0'; } catch (e) { return true; } }
function setSmartLoadOn(on) { try { localStorage.setItem('powa-smart-load', on ? '1' : '0'); } catch (e) {} }

// =========================================================
// SCORING — DOTS, weight class, strength standards
// Powerlifters live and die by these. All bodyweight-relative, so they
// reuse the e1RM + bodyweight we already store. Sex is a client-side
// preference (localStorage) — no profile column, no migration.
// =========================================================
function getSexPref() {
  try { return localStorage.getItem('powa-sex') === 'female' ? 'female' : 'male'; }
  catch (e) { return 'male'; }
}
function setSexPref(s) {
  try { localStorage.setItem('powa-sex', s === 'female' ? 'female' : 'male'); } catch (e) {}
}

// DOTS — the modern bodyweight-adjusted coefficient (replaced Wilks at most feds).
// total + bw in kg. Returns points (≈ 0–600). Coefficients are the official DOTS set.
function dotsScore(totalKg, bwKg, sex) {
  if (!totalKg || !bwKg || bwKg <= 0) return 0;
  const bw = Math.min(Math.max(bwKg, 40), sex === 'female' ? 150 : 210);
  const c = (sex === 'female')
    ? [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288]
    : [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076];
  const denom = c[0] * Math.pow(bw, 4) + c[1] * Math.pow(bw, 3) + c[2] * bw * bw + c[3] * bw + c[4];
  if (!denom) return 0;
  return Math.round((500 / denom) * totalKg * 100) / 100;
}

// IPF GoodLift (GL) points — the IPF's official bodyweight-adjusted score, using
// the Classic (raw) coefficients that replaced the old IPF points in 2020.
// total + bw in kg. Formula: 100 / (A − B·e^(−C·bw)) · total. World-class ≈ 100.
// Complements DOTS (different feds prefer different scores) — same inputs.
function ipfGlPoints(totalKg, bwKg, sex) {
  if (!totalKg || !bwKg || bwKg <= 0) return 0;
  const c = (sex === 'female')
    ? { A: 610.32796, B: 1045.59282, C: 0.03048 }
    : { A: 1199.72839, B: 1025.18162, C: 0.00921 };
  const denom = c.A - c.B * Math.exp(-c.C * bwKg);
  if (denom <= 0) return 0;
  const pts = (100 / denom) * totalKg;
  return isFinite(pts) && pts > 0 ? Math.round(pts * 100) / 100 : 0;
}
window.ipfGlPoints = ipfGlPoints;

// IPF weight classes (open). Returns e.g. "83kg" or "120kg+".
const IPF_CLASSES = {
  male:   [59, 66, 74, 83, 93, 105, 120],
  female: [47, 52, 57, 63, 69, 76, 84]
};
function weightClassFor(bwKg, sex) {
  if (!bwKg || bwKg <= 0) return null;
  const arr = IPF_CLASSES[sex === 'female' ? 'female' : 'male'];
  for (const c of arr) if (bwKg <= c) return c + 'kg';
  return arr[arr.length - 1] + 'kg+';
}

// "Make weight" math: where the lifter sits inside their IPF class and what it
// takes to move. All kg (classes are inherently kg; the view converts the gaps
// to the user's unit). Returns:
//   { cls, limit, isTop, toCeiling, belowLimit, toCutKg }
//   - limit      = kg ceiling of the current class (null when top class+)
//   - toCeiling  = limit - bw (room before they're bumped UP a class)
//   - belowLimit = the next class DOWN's ceiling (a realistic cut target)
//   - toCutKg    = bw - belowLimit (kg to drop to make that class; >0 = work to do)
function weightClassInfo(bwKg, sex) {
  if (!bwKg || bwKg <= 0) return null;
  const arr = IPF_CLASSES[sex === 'female' ? 'female' : 'male'];
  let limit = null, idx = -1;
  for (let i = 0; i < arr.length; i++) { if (bwKg <= arr[i]) { limit = arr[i]; idx = i; break; } }
  const isTop = limit == null;
  const cls = isTop ? (arr[arr.length - 1] + 'kg+') : (limit + 'kg');
  const toCeiling = isTop ? null : (limit - bwKg);
  const belowLimit = isTop ? arr[arr.length - 1] : (idx > 0 ? arr[idx - 1] : null);
  const toCutKg = belowLimit != null ? (bwKg - belowLimit) : null;
  return { cls, limit, isTop, toCeiling, belowLimit, toCutKg };
}

// The weigh-in habit: days in a row, and this week's average against last
// week's (the number that means something; one morning is noise).
// series: [{ date: 'YYYY-MM-DD', weight }] in any order. Pure: unit-tested.
function bwHabit(series, todayIso) {
  const byDate = {};
  (series || []).forEach(b => { if (b && b.date && Number(b.weight) > 0) byDate[b.date] = Number(b.weight); });
  const shift = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const loggedToday = byDate[todayIso] != null;
  let streak = 0, cur = loggedToday ? todayIso : shift(todayIso, -1);
  while (byDate[cur] != null) { streak++; cur = shift(cur, -1); }
  const avg = (from, to) => {
    const v = [];
    for (let i = from; i <= to; i++) { const w = byDate[shift(todayIso, -i)]; if (w != null) v.push(w); }
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const weekAvg = avg(0, 6), prevWeekAvg = avg(7, 13);
  return { loggedToday, streak, weekAvg, prevWeekAvg, delta: weekAvg != null && prevWeekAvg != null ? weekAvg - prevWeekAvg : null };
}

// Strength standards as e1RM÷bodyweight ratios (male raw). Four thresholds →
// five tiers. Women scale by ~0.72 (rough but motivating, not a ranking).
const STRENGTH_LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
const STRENGTH_STANDARDS = {
  squat:    [1.0, 1.5, 2.0, 2.5],
  bench:    [0.75, 1.0, 1.25, 1.6],
  deadlift: [1.25, 1.75, 2.25, 2.75]
};
// Returns { index, level, ratio, nextRatio, toNextKg } or null when not computable.
function strengthLevel(e1rmKg, bwKg, lift, sex) {
  const base = STRENGTH_STANDARDS[lift];
  if (!base || !e1rmKg || !bwKg || bwKg <= 0) return null;
  const scale = (sex === 'female') ? 0.72 : 1.0;
  const tiers = base.map(t => t * scale);
  const ratio = e1rmKg / bwKg;
  let index = 0;
  for (let i = 0; i < tiers.length; i++) if (ratio >= tiers[i]) index = i + 1;
  const nextRatio = index < tiers.length ? tiers[index] : null;
  const toNextKg = nextRatio != null ? Math.max(0, nextRatio * bwKg - e1rmKg) : null;
  return { index, level: STRENGTH_LEVELS[index], ratio, nextRatio, toNextKg };
}

// =========================================================
// MEET DAY — countdown to the platform
// daysUntil() powers the "X days out" chip + phase hint on the meet-day planner.
// (The planner's attempt math + warm-up ramps already live inline in
// athlete.html — getMeetPlan / buildWarmupHtml — so this is the only piece that
// belonged in the shared, unit-tested library.) Both sides parse at LOCAL
// midnight so the count never drifts by a timezone offset.
// =========================================================
// Whole days from `now` (default today) until an ISO meet date. Negative = past,
// 0 = today. now accepts a Date or an ISO string; bad input → null.
function daysUntil(dateStr, now) {
  const parse = (v) => {
    if (!v) return null;
    if (v instanceof Date) { const x = new Date(v); x.setHours(0, 0, 0, 0); return x; }
    const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  };
  const target = parse(dateStr);
  if (!target) return null;
  let base = parse(now);
  if (!base) { base = new Date(); base.setHours(0, 0, 0, 0); }
  return Math.round((target - base) / 86400000);
}

// =========================================================
// MEET RESULTS — competition history math (pure, unit-tested)
// A meet stores the best SUCCESSFUL lift per discipline in kg; null = bombed /
// not contested. The total sums only the good lifts, so a bombed bench still
// yields a (lower) squat+deadlift sub-total rather than NaN.
// =========================================================
function meetTotal(meet) {
  if (!meet) return 0;
  return ['squat', 'bench', 'deadlift'].reduce((s, k) => {
    const v = meet[k];
    return s + (v == null || isNaN(v) ? 0 : Number(v));
  }, 0);
}
// True only when all three lifts have a good attempt — a "full" total
// (a bombed lift makes the number not comparable as a competition total).
function meetIsFullTotal(meet) {
  if (!meet) return false;
  return ['squat', 'bench', 'deadlift'].every(k => meet[k] != null && !isNaN(meet[k]));
}
// Best (highest) FULL total across a list of meets, optionally filtered to one
// athlete. Returns { total, meet } or null when no full-total meet exists.
function bestMeet(meets, athleteId) {
  if (!Array.isArray(meets)) return null;
  let best = null;
  meets.forEach(m => {
    if (athleteId && m.athleteId !== athleteId) return;
    if (!meetIsFullTotal(m)) return;
    const t = meetTotal(m);
    if (!best || t > best.total) best = { total: t, meet: m };
  });
  return best;
}
// DOTS for a finished meet from its REAL total + weigh-in bodyweight (kg).
// Falls back to null when bodyweight is missing. sex is the client-side pref.
function meetDots(meet, sex) {
  if (!meet || !meet.bodyweight) return null;
  const t = meetTotal(meet);
  if (!t) return null;
  return dotsScore(t, meet.bodyweight, sex);
}

// =========================================================
// PLATE CALCULATOR
// (assumes 20kg bar, common kg plates)
// =========================================================
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_KG = 20;
// Pound-mode plate set — standard US powerlifting plates
const PLATE_SIZES_LB = [45, 35, 25, 10, 5, 2.5];
const BAR_LB = 45;

// Plate breakdown — calculates in the user's selected unit (kg or lbs).
// `targetWeight` is the kg-internal weight; the function converts to lbs internally
// when the user is in lb mode, so the plate sizes match what the gym actually has.
// barOverride (optional) is the empty-bar weight in the active DISPLAY unit.
// Omit it for the standard competition bar (20 kg / 45 lb).
function plateBreakdown(targetWeight, barOverride) {
  const isLbs = getUnit() === 'lbs';
  const sizes = isLbs ? PLATE_SIZES_LB : PLATE_SIZES;
  const bar   = (barOverride != null && barOverride > 0) ? barOverride : (isLbs ? BAR_LB : BAR_KG);
  const u     = isLbs ? 'lbs' : 'kg';

  // Convert target from internal kg to display unit
  const target = isLbs ? (targetWeight / KG_PER_LB) : targetWeight;

  if (!target || target < bar) {
    return { plates: [], perSide: 0, unit: u, error: 'Below bar weight (' + bar + ' ' + u + ')' };
  }
  let perSide = (target - bar) / 2;
  const plates = [];
  sizes.forEach(p => {
    while (perSide >= p - 0.001) {
      plates.push(p);
      perSide -= p;
    }
  });
  if (perSide > 0.05) {
    return { plates, perSide: (target - bar) / 2, unit: u, error: 'Cannot reach exactly. ' + (perSide * 2).toFixed(2) + ' ' + u + ' short.' };
  }
  return { plates, perSide: (target - bar) / 2, unit: u, error: null };
}

// =========================================================
// INVITE
// =========================================================
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// =========================================================
// PROGRAM HELPERS
// =========================================================
function newDay(name) { return { id: uid('day'), name, exercises: [] }; }
function newWeek(num, dayCount = 4) {
  const days = [];
  for (let i = 1; i <= dayCount; i++) days.push(newDay('Day ' + i));
  return { id: uid('wk'), number: num, days };
}
function newExercise(lift, variant, exerciseName) {
  return { id: uid('ex'), lift, variant: variant || '', exerciseName: exerciseName || '', note: '', sets: [] };
}
function newSet(weight, reps, rpe, tempo) {
  // RPE is optional — null means no prescribed RPE (typical of back-down sets in PL).
  // Tempo is an optional cue string like "0-2-0" (eccentric-pause-concentric).
  const rpeVal = (rpe === null || rpe === undefined || rpe === '') ? null : Number(rpe);
  return {
    id: uid('set'),
    weight: Number(weight) || 0,
    reps: Number(reps) || 0,
    rpe: (rpeVal != null && !isNaN(rpeVal)) ? rpeVal : null,
    tempo: tempo || '',
    completed: false, actualRpe: null, completedAt: null, note: ''
  };
}
function getProgramForAthlete(athleteId) {
  return Store.get().programs.find(p => p.athleteId === athleteId);
}

// =========================================================
// AI PROGRAM GENERATOR — "let the AI design the program directly"
// Pure + deterministic. Returns a full, schema-correct program object (fresh
// uids everywhere) the builder/Store/DB can use as-is. RPE-native: when an
// athlete e1RM is known for a main lift, each set's weight is back-computed
// from its prescribed reps+RPE (inverse of calcE1RM) and rounded to the
// nearest 2.5kg; when unknown, weight stays 0 so it reads as a pure
// "work up to the RPE" prescription — legit PL programming, on brand.
//   opts = { name?, weeks=4, daysPerWeek=4, focus?(squat|bench|deadlift),
//            e1rms?:{squat,bench,deadlift}, athleteId?, coachId? }
// =========================================================
function _roundToPlate(kg) {
  if (!kg || kg <= 0) return 0;
  return Math.round(kg / 2.5) * 2.5;
}
// Weight that sits at reps@rpe given a known 1RM-equivalent (inverse calcE1RM).
function weightForTarget(e1rm, reps, rpe) {
  if (!e1rm || !reps || !rpe) return 0;
  const pct = 1 - ((reps - 1) + (10 - rpe)) * 0.0333;
  return _roundToPlate(e1rm * Math.max(0.4, pct));
}
// =========================================================
// GOAL FEASIBILITY — "I squat 150, I want 180, I have 10 weeks."
//
// generateProgram() below already builds a sound block FROM a set of current
// e1RMs. What it could never answer is whether the lifter's GOAL is reachable
// in the time they have, or what to aim at when it isn't. That's this.
//
// Deliberately arithmetic, not an LLM call: a language model asked to judge
// "is +30kg in 10 weeks realistic" will give a different answer each time and
// charges a round-trip to do it. Rate-of-gain is a well-studied number; the
// honest version is a lookup and a division.
//
// The most valuable output here is often the REFUSAL — telling someone that
// +40kg on their bench in 8 weeks is not happening, and handing them the
// number that is, beats generating a block built on a fantasy that will bury
// them in missed reps by week 4.
// =========================================================

// Ceilings on rate of gain, as a fraction of current 1RM per WEEK, for a
// well-run block. Bench climbs slowest — least muscle mass, shortest range of
// motion, least room to grow — so it carries its own band rather than being
// lumped in with the lower-body lifts.
const GAIN_RATE = {
  squat:    { comfortable: 0.006, realistic: 0.011, aggressive: 0.017 },
  bench:    { comfortable: 0.004, realistic: 0.008, aggressive: 0.013 },
  deadlift: { comfortable: 0.006, realistic: 0.012, aggressive: 0.018 }
};

// How developed a lift already is changes what's plausible: a 60kg bench has
// far more headroom than a 160kg bench. Scaled against bodyweight, because
// that's the only normaliser we reliably have. Novices really do add faster.
function gainCeilingFactor(currentKg, bodyweightKg, lift) {
  if (!bodyweightKg || bodyweightKg <= 0) return 1;
  const developed = lift === 'bench' ? 1.5 : lift === 'squat' ? 2.0 : 2.5; // × bodyweight
  const pct = Math.min(1.4, (currentKg / bodyweightKg) / developed);
  return Math.max(0.55, 1.85 - pct * 0.95);   // ~1.85× early, ~0.6× when advanced
}

// One lift: required weekly rate vs the ceiling it's judged against, plus the
// target that IS reachable if the ask is too big.
function liftFeasibility(lift, startKg, targetKg, weeks, bodyweightKg) {
  const s = Number(startKg) || 0, t = Number(targetKg) || 0, w = Number(weeks) || 0;
  if (s <= 0 || w <= 0) return null;
  const gainKg = t - s;
  const weeklyPct = (gainKg / s) / w;
  const band = GAIN_RATE[lift] || GAIN_RATE.squat;
  const f = gainCeilingFactor(s, bodyweightKg, lift);
  const comfortable = band.comfortable * f, realistic = band.realistic * f, aggressive = band.aggressive * f;

  let verdict;
  if (gainKg <= 0) verdict = 'maintain';
  else if (weeklyPct <= comfortable) verdict = 'comfortable';
  else if (weeklyPct <= realistic) verdict = 'realistic';
  else if (weeklyPct <= aggressive) verdict = 'aggressive';
  else verdict = 'unrealistic';

  return {
    lift, startKg: s, targetKg: t, gainKg, weeklyPct, verdict,
    reachableKg: Math.round(s * (1 + realistic * w) * 2) / 2,   // hard but sane
    stretchKg:   Math.round(s * (1 + aggressive * w) * 2) / 2   // everything goes right
  };
}

// Whole plan across S/B/D. `verdict` is the worst lift — a block is only as
// feasible as its most over-reaching lift.
function planFeasibility(start, target, weeks, bodyweightKg) {
  const LIFTS = ['squat', 'bench', 'deadlift'];
  const ORDER = ['maintain', 'comfortable', 'realistic', 'aggressive', 'unrealistic'];
  const perLift = {};
  let worst = 'maintain';
  LIFTS.forEach(function (l) {
    const r = liftFeasibility(l, (start || {})[l], (target || {})[l], weeks, bodyweightKg);
    if (!r) return;
    perLift[l] = r;
    if (ORDER.indexOf(r.verdict) > ORDER.indexOf(worst)) worst = r.verdict;
  });
  const sum = function (o, k) { return LIFTS.reduce(function (a, l) { return a + (Number((o || {})[l]) || 0); }, 0); };
  const startTotal = sum(start), targetTotal = sum(target);
  const reachableTotal = LIFTS.reduce(function (a, l) { return a + (perLift[l] ? perLift[l].reachableKg : 0); }, 0);
  return {
    perLift, verdict: worst,
    feasible: worst !== 'unrealistic',
    startTotal, targetTotal, gainTotal: targetTotal - startTotal,
    reachableTotal, weeks: Number(weeks) || 0
  };
}

// The target actually worth training toward: the ask where it's achievable,
// the reachable number where it isn't. Feeds generateProgram({targets}).
function feasibleTargets(start, target, weeks, bodyweightKg) {
  const feas = planFeasibility(start, target, weeks, bodyweightKg);
  const out = {};
  ['squat', 'bench', 'deadlift'].forEach(function (l) {
    const f = feas.perLift[l];
    if (!f) return;
    out[l] = f.verdict === 'unrealistic' ? f.reachableKg : f.targetKg;
  });
  return { targets: out, feasibility: feas };
}

if (typeof window !== 'undefined') {
  window.GAIN_RATE = GAIN_RATE;
  window.gainCeilingFactor = gainCeilingFactor;
  window.liftFeasibility = liftFeasibility;
  window.planFeasibility = planFeasibility;
  window.feasibleTargets = feasibleTargets;
}

function generateProgram(opts) {
  opts = opts || {};
  const weeks = Math.max(1, Math.min(16, Math.round(opts.weeks || 4)));
  const dpw = Math.max(2, Math.min(6, Math.round(opts.daysPerWeek || 4)));
  const focus = (opts.focus && MAIN_LIFTS.indexOf(opts.focus) !== -1) ? opts.focus : null;
  const e1 = opts.e1rms || {};
  // Optional GOAL. Without it the block holds today's e1RM flat and only waves
  // RPE — which is exactly why generated loads never climbed toward anything.
  // With it, each week's prescription comes from an e1RM interpolated between
  // where the lifter is and where they're going, so the numbers on the page
  // walk to the target instead of restating the present.
  // Expects targets already filtered through feasibleTargets(); this function
  // trusts them and does not re-judge whether the goal is sane.
  const targets = opts.targets || null;
  function e1At(lift, weekIdx) {
    const from = e1[lift] || 0;
    const to = targets && targets[lift];
    if (!from || !to) return from;
    const p = weeks <= 1 ? 1 : weekIdx / (weeks - 1);
    return from + (to - from) * p;
  }

  // RPE/rep wave across the block: build → overreach, last week deloads (≥4wk).
  const lastIsDeload = weeks >= 4;
  const span = Math.max(1, (lastIsDeload ? weeks - 1 : weeks) - 1);
  const isDeloadWeek = (w) => lastIsDeload && w === weeks - 1;
  function mainScheme(w) {
    if (isDeloadWeek(w)) return { sets: 3, reps: 3, rpe: 6 };
    const f = span ? w / span : 0;                  // 0..1 across working weeks
    return { sets: 4, reps: Math.max(2, Math.round(5 - f * 3)), rpe: Math.round((7 + f * 1.5) * 2) / 2 };
  }
  function backoffScheme(w) {
    if (isDeloadWeek(w)) return null;
    const f = span ? w / span : 0;
    return { sets: 3, reps: Math.max(4, Math.round(6 - f * 2)), rpe: Math.round((7 + f) * 2) / 2 };
  }

  // Which main lift(s) anchor each training day. Focus lift gets an extra day.
  const rot = {
    2: [['squat', 'bench'], ['deadlift', 'bench']],
    3: [['squat'], ['bench'], ['deadlift']],
    4: [['squat'], ['bench'], ['deadlift'], ['bench']],
    5: [['squat'], ['bench'], ['deadlift'], ['squat'], ['bench']],
    6: [['squat'], ['bench'], ['deadlift'], ['squat'], ['bench'], ['deadlift']]
  }[dpw].map(a => a.slice());
  if (focus && rot.length) {
    rot[rot.length - 1] = [focus];
    rot.sort((a, b) => (b[0] === focus) - (a[0] === focus));
  }
  const accessoryByMain = { squat: 'legs', bench: 'push', deadlift: 'pull' };
  const dayName = (mains) => mains.map(m => LIFT_LABELS[m]).join(' / ') + ' day';

  const wks = [];
  for (let w = 0; w < weeks; w++) {
    const days = [];
    for (let d = 0; d < dpw; d++) {
      const mains = rot[d] || [MAIN_LIFTS[d % 3]];
      const day = newDay(dayName(mains));
      mains.forEach(m => {
        const e = e1At(m, w);
        const ex = newExercise(m, 'Competition', '');
        const ms = mainScheme(w);
        for (let s = 0; s < ms.sets; s++) ex.sets.push(newSet(weightForTarget(e, ms.reps, ms.rpe), ms.reps, ms.rpe, ''));
        const bs = backoffScheme(w);
        if (bs) for (let s = 0; s < bs.sets; s++) ex.sets.push(newSet(weightForTarget(e, bs.reps, bs.rpe), bs.reps, bs.rpe, ''));
        day.exercises.push(ex);
        // One matched accessory (RPE-free hypertrophy work).
        const grp = accessoryByMain[m];
        const list = (ACCESSORY_EXERCISES[grp]) || [];
        if (list.length) {
          const accEx = newExercise(grp, '', list[(w + d) % list.length]);
          for (let s = 0; s < 3; s++) accEx.sets.push(newSet(0, 8, null, ''));
          day.exercises.push(accEx);
        }
      });
      days.push(day);
    }
    wks.push({ id: uid('wk'), number: w + 1, days });
  }

  const name = (opts.name && String(opts.name).trim())
    || ((focus ? LIFT_LABELS[focus] + '-focus ' : '') + weeks + '-week block');
  return { id: uid('prog'), athleteId: opts.athleteId || null, coachId: opts.coachId || null, name, weeks: wks };
}
if (typeof window !== 'undefined') { window.generateProgram = generateProgram; window.weightForTarget = weightForTarget; }

// STARTER PROGRAM — for someone new to the barbell who doesn't know a max (and
// shouldn't be testing one). No numbers needed: starting weights come from
// bodyweight with deliberately low novice ratios (never below the empty bar),
// then it's 3 × 5 on three full-body days, the load climbing ~2% a week while
// the target RPE walks 7 → 8. The smart next set does the fine-tuning: too
// easy and the next set goes up, too hard and it comes down. Pure.
const STARTER_RATIO = { male: { squat: 0.8, bench: 0.6, deadlift: 1.0 }, female: { squat: 0.6, bench: 0.35, deadlift: 0.75 } };
function starterE1rms(bodyweightKg, sex) {
  const fem = sex === 'female';
  const bw = Number(bodyweightKg) > 30 ? Number(bodyweightKg) : (fem ? 62 : 78);
  const r = STARTER_RATIO[fem ? 'female' : 'male'];
  return { squat: bw * r.squat, bench: bw * r.bench, deadlift: bw * r.deadlift };
}
function generateStarterProgram(opts) {
  opts = opts || {};
  const weeks = Math.max(4, Math.min(12, Math.round(opts.weeks || 8)));
  const base = starterE1rms(opts.bodyweightKg, opts.sex);
  Object.keys(opts.e1rms || {}).forEach(k => { if (Number(opts.e1rms[k]) > 0) base[k] = Number(opts.e1rms[k]); });
  const bar = opts.unit === 'lbs' ? 45 * KG_PER_LB : 20;
  // Target RPE 7 → 8 (3 → 2 reps left). Not lower: the scale's floor is RPE 6,
  // so "4+ left" must sit a full step under the target to move the next set up.
  const rpeAt = (w) => Math.round((7 + (weeks <= 1 ? 1 : w / (weeks - 1))) * 2) / 2;
  const load = (lift, w, reps) => Math.max(bar, weightForTarget(base[lift] * (1 + 0.02 * w), reps, rpeAt(w)));
  const main = (lift, w, sets) => {
    const ex = newExercise(lift, 'Competition', '');
    for (let s = 0; s < sets; s++) ex.sets.push(newSet(load(lift, w, 5), 5, rpeAt(w), ''));
    return ex;
  };
  // Accessories you can do on day one: push-ups and lunges need no load; the row starts at the bar.
  const acc = (grp, name, reps, kg) => {
    const ex = newExercise(grp, '', name);
    for (let s = 0; s < 3; s++) ex.sets.push(newSet(kg, reps, 7, ''));
    return ex;
  };
  const wks = [];
  for (let w = 0; w < weeks; w++) {
    const a = newDay('Squat + bench'); a.exercises.push(main('squat', w, 3), main('bench', w, 3), acc('push', 'Push-ups', 10, 0));
    const b = newDay('Squat + deadlift'); b.exercises.push(main('squat', w, 3), main('deadlift', w, 2), acc('legs', 'Lunges', 8, 0));
    const c = newDay('Squat + bench'); c.exercises.push(main('squat', w, 3), main('bench', w, 3), acc('pull', 'Barbell Row', 8, Math.max(bar, weightForTarget(base.bench, 8, 7))));
    wks.push({ id: uid('wk'), number: w + 1, days: [a, b, c] });
  }
  return { id: uid('prog'), athleteId: opts.athleteId || null, coachId: opts.coachId || null, name: 'Starter strength', starter: true, weeks: wks };
}
if (typeof window !== 'undefined') { window.generateStarterProgram = generateStarterProgram; window.starterE1rms = starterE1rms; }

// FIRST MEET — a block that ends on meet week (8–16 weeks, 12 by default):
// base (5s at RPE 7 → 7.5), strength (triples at 7.5 → 8.5), peak (a heavy
// single at RPE 8 → 9 plus doubles), then meet week: openers early in the week
// (a single at RPE 7 ≈ 90%), light technique after. Meet day itself is meet
// mode (attempts + judges' lights), not a session. Three days a week: squat +
// bench, deadlift + bench, squat + bench. Loads come from the lifter's e1RMs,
// nudged up ~1% a week. Pure: unit-tested.
function generateMeetPrep(opts) {
  opts = opts || {};
  const W = Math.max(8, Math.min(16, Math.round(opts.weeks || 12)));
  const e1 = opts.e1rms || {};
  const bar = opts.unit === 'lbs' ? 45 * KG_PER_LB : 20;
  const strengthStart = Math.round((W - 4) / 2), peakStart = W - 4, meetWk = W - 1;
  const half = (v) => Math.round(v * 2) / 2;
  const at = (w, a, b, from, to) => half(a + (b - a) * (to > from ? (w - from) / (to - from) : 1));
  const load = (lift, w, reps, rpe) => Math.max(bar, weightForTarget((Number(e1[lift]) || 0) * (1 + 0.01 * Math.min(w, 10)), reps, rpe));
  // [sets, reps, rpe] for the day's main lift and its second lift, by week.
  function scheme(w, second) {
    if (w < strengthStart) return second ? [3, 6, 7] : [4, 5, at(w, 7, 7.5, 0, strengthStart - 1)];
    if (w < peakStart) return second ? [3, 4, 7.5] : [4, 3, at(w, 7.5, 8.5, strengthStart, peakStart - 1)];
    return second ? [3, 3, 7.5] : null;   // peak: built below (single + doubles)
  }
  const rot = [['squat', 'bench'], ['deadlift', 'bench'], ['squat', 'bench']];
  const NAMES = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  const wks = [];
  for (let w = 0; w < W; w++) {
    const days = [];
    if (w === meetWk) {
      const op = newDay('Openers');
      ['squat', 'bench'].forEach(l => { const ex = newExercise(l, 'Competition', ''); ex.sets.push(newSet(load(l, w, 1, 7), 1, 7, '')); op.exercises.push(ex); });
      const dl = newExercise('deadlift', 'Competition', ''); dl.sets.push(newSet(load('deadlift', w, 1, 7), 1, 7, '')); op.exercises.push(dl);
      const lt = newDay('Light technique');
      ['squat', 'bench'].forEach(l => { const ex = newExercise(l, 'Competition', ''); for (let s = 0; s < 2; s++) ex.sets.push(newSet(load(l, w, 2, 6), 2, 6, '')); lt.exercises.push(ex); });
      days.push(op, lt);
    } else {
      rot.forEach((pair, d) => {
        const day = newDay(pair.map(l => NAMES[l]).join(' + '));
        pair.forEach((l, i) => {
          const ex = newExercise(l, 'Competition', '');
          const sc = scheme(w, i > 0);
          if (sc) { for (let s = 0; s < sc[0]; s++) ex.sets.push(newSet(load(l, w, sc[1], sc[2]), sc[1], sc[2], '')); }
          else {
            const top = at(w, 8, 9, peakStart, meetWk - 1);
            ex.sets.push(newSet(load(l, w, 1, top), 1, top, ''));
            for (let s = 0; s < 3; s++) ex.sets.push(newSet(load(l, w, 2, 8), 2, 8, ''));
          }
          day.exercises.push(ex);
        });
        days.push(day);
      });
    }
    wks.push({ id: uid('wk'), number: w + 1, days });
  }
  return { id: uid('prog'), athleteId: opts.athleteId || null, coachId: opts.coachId || null, name: 'First meet · ' + W + ' weeks', meetPrep: true, meetDate: opts.meetDate || null, weeks: wks };
}
if (typeof window !== 'undefined') window.generateMeetPrep = generateMeetPrep;

// SIMPLE EFFORT SCALE — new lifters answer "how many more reps could you have
// done?" (4+ · 3 · 2 · 1 · 0) instead of nine RPE numbers. Same data underneath
// (RPE 6–10); the read-out still names the RPE so the word gets learnt.
function isSimpleEffort() { try { return localStorage.getItem('powa-simple-effort') === '1'; } catch (e) { return false; } }
function setSimpleEffort(on) { try { localStorage.setItem('powa-simple-effort', on ? '1' : '0'); } catch (e) {} }
if (typeof window !== 'undefined') { window.isSimpleEffort = isSimpleEffort; window.setSimpleEffort = setSimpleEffort; }

// PLAIN WORDS. The app's jargon, the way a coach would say it out loud.
// (The numbers in the e1RM line come from calcE1RM: 100 kg × 5 @ RPE 8 ≈ 125.)
const GLOSSARY = [
  { key: 'rpe', term: 'RPE', text: 'How hard a set was, out of 10. 10 means you had nothing left. 8 means you could have done two more reps. Most training sits between 6 and 9.' },
  { key: 'rir', term: 'Reps left in the tank', text: 'How many more reps you could have done with good form. It\'s RPE said the other way round: two reps left is RPE 8. Not sure? Pick the closer one. You get better at judging it every week.' },
  { key: 'e1rm', term: 'e1RM, your estimated max', text: 'The most you could lift once, worked out from a set you did. 100 kg for 5 at RPE 8 works out to about 125 kg. You never have to test it.' },
  { key: 'pr', term: 'PR', text: 'Personal record: your best ever. Here it means your estimated max went up, so a better set of 5 counts as much as a heavier single.' },
  { key: 'hard', term: 'Hard set', text: 'A set at RPE 7 or more, so three or fewer reps left. These are the sets that build strength, and the ones club points count.' },
  { key: 'top', term: 'Top set and back-off sets', text: 'The top set is the heaviest set of the day. Back-off sets come after it, a little lighter, for more good practice.' },
  { key: 'comp', term: 'Competition equivalent', text: 'Harder variations, like a paused squat, are scaled up to what that effort means for the normal lift, so your charts compare like with like.' },
  { key: 'deload', term: 'Deload', text: 'A planned easier week so your body catches up. You come back stronger, not weaker.' },
  { key: 'total', term: 'Total', text: 'Your best squat, bench and deadlift added together. It\'s what decides a powerlifting meet.' },
  { key: 'dots', term: 'DOTS', text: 'A score that adjusts your total for bodyweight, so a 60 kg lifter and a 120 kg lifter can be compared fairly.' }
];
function openGlossary(focusKey) {
  uiSheet('Lifting words, explained', (sheet) => {
    const list = el('div', { class: 'ui-list gloss-list' });
    GLOSSARY.forEach(g => {
      const item = el('div', { class: 'gloss-item' + (g.key === focusKey ? ' is-focus' : ''), id: 'gloss-' + g.key });
      item.appendChild(el('b', {}, g.term));
      item.appendChild(el('p', {}, g.text));
      list.appendChild(item);
    });
    sheet.appendChild(list);
    if (focusKey) setTimeout(() => { const f = document.getElementById('gloss-' + focusKey); if (f) f.scrollIntoView({ block: 'center' }); }, 80);
  }, { cls: 'gloss-sheet' });
}
if (typeof window !== 'undefined') { window.GLOSSARY = GLOSSARY; window.openGlossary = openGlossary; }

// =========================================================
// BUILD FROM A GOAL — "here's where they are, here's where they're going,
// here's how long I've got." The generator and the feasibility engine already
// exist in app.js; this is the surface that finally makes them reachable
// without typing a sentence into a chat box and hoping.
//
// Current numbers pre-fill from logged e1RMs when there are any, but every
// field stays editable — a new athlete has no history, and "I know he squats
// 150" should be enough to get a block. That gap was the actual reason the
// AI kept producing programs with no weights in them: it could only ever read
// history, so an athlete without history got zeros.
// =========================================================
const GOAL_LIFTS = ['squat', 'bench', 'deadlift'];

function _goalNum(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const v = parseFloat(el.value);
  if (!isFinite(v) || v <= 0) return 0;
  return displayToKg(v);   // fields are in the user's display unit
}

function ensureGoalModal() {
  if (document.getElementById('goalModal')) return;
  const u = unitLabel();
  const row = (lift, label) =>
    '<div class="goal-row">' +
      '<span class="goal-lift">' + label + '</span>' +
      '<input type="number" step="2.5" min="0" id="goalNow-' + lift + '" placeholder="now" aria-label="Current ' + label + '">' +
      '<span class="goal-arrow" aria-hidden="true">&rarr;</span>' +
      '<input type="number" step="2.5" min="0" id="goalTgt-' + lift + '" placeholder="target" aria-label="Target ' + label + '">' +
      '<span class="goal-unit">' + u + '</span>' +
      '<span class="goal-verdict" id="goalV-' + lift + '"></span>' +
    '</div>';

  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="modal-backdrop" id="goalModal">' +
      '<div class="modal modal-lg">' +
        '<button class="modal-close" aria-label="Close" onclick="closeModal(\'goalModal\')">&times;</button>' +
        '<h3>Build from a goal</h3>' +
        '<p class="dim text-sm mb-16">Where they are now, where you want them, and how long you have. ' +
          'The block gets built backwards from that &mdash; and if the goal will not fit in the time, you get told before you write it.</p>' +
        '<div class="goal-grid">' +
          row('squat', 'Squat') + row('bench', 'Bench') + row('deadlift', 'Deadlift') +
        '</div>' +
        '<div class="form-row mt-16">' +
          '<div class="form-group"><label for="goalWeeks">Weeks</label>' +
            '<input type="number" id="goalWeeks" min="3" max="16" step="1" value="10"></div>' +
          '<div class="form-group"><label for="goalDays">Days / week</label>' +
            '<select id="goalDays"><option value="3">3</option><option value="4" selected>4</option><option value="5">5</option></select></div>' +
        '</div>' +
        '<div id="goalReadout" class="goal-readout"></div>' +
        '<div class="flex gap-8 mt-16">' +
          '<button class="btn btn-primary btn-block" id="goalBuildBtn" onclick="buildFromGoal()">Build the block</button>' +
          '<button class="btn btn-ghost" onclick="closeModal(\'goalModal\')">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap.firstChild);

  // Live feasibility as they type. Cheap (pure arithmetic), so no debounce
  // needed and the verdict never lags behind the number they just entered.
  ['goalWeeks', 'goalDays'].concat(
    GOAL_LIFTS.flatMap(l => ['goalNow-' + l, 'goalTgt-' + l])
  ).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', refreshGoalReadout);
  });
}

// Pre-fill "now" from logged history where it exists. Blank when it doesn't —
// a placeholder is honest, a zero is a lie.
function openGoalModal(athleteId) {
  ensureGoalModal();
  window._goalAthleteId = athleteId || null;
  GOAL_LIFTS.forEach(l => {
    const best = athleteId && typeof bestE1RM === 'function' ? bestE1RM(athleteId, l) : 0;
    const now = document.getElementById('goalNow-' + l);
    const tgt = document.getElementById('goalTgt-' + l);
    if (now) now.value = best ? Math.round(kgToDisplay(best) * 2) / 2 : '';
    if (tgt) tgt.value = '';
  });
  refreshGoalReadout();
  openModal('goalModal');
}

// "Squat, Bench and Deadlift" — not "Squat and Bench and Deadlift".
function _goalJoin(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return items[0] + ' and ' + items[1];
  return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
}
// "an aggressive ask" / "a realistic ask" — the verdict words are a closed set,
// so a vowel test is exact here rather than a guess.
function _goalArticle(word) {
  return (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word;
}

const _GOAL_TONE = {
  maintain:    { cls: 'ok',   word: 'maintenance' },
  comfortable: { cls: 'ok',   word: 'comfortable' },
  realistic:   { cls: 'ok',   word: 'realistic' },
  aggressive:  { cls: 'warn', word: 'aggressive' },
  unrealistic: { cls: 'bad',  word: 'not in this timeframe' }
};

function refreshGoalReadout() {
  const start = {}, target = {};
  GOAL_LIFTS.forEach(l => { start[l] = _goalNum('goalNow-' + l); target[l] = _goalNum('goalTgt-' + l); });
  const weeks = Math.max(3, Math.min(16, parseInt((document.getElementById('goalWeeks') || {}).value, 10) || 10));
  const bw = typeof latestBodyweight === 'function' ? (latestBodyweight(window._goalAthleteId) || 0) : 0;
  const out = document.getElementById('goalReadout');
  const btn = document.getElementById('goalBuildBtn');
  if (!out) return;

  const anyStart = GOAL_LIFTS.some(l => start[l] > 0);
  const anyTarget = GOAL_LIFTS.some(l => target[l] > 0);
  GOAL_LIFTS.forEach(l => { const v = document.getElementById('goalV-' + l); if (v) { v.textContent = ''; v.className = 'goal-verdict'; } });

  if (!anyStart) {
    out.innerHTML = '<p class="dim text-sm">Enter at least one current lift to begin.</p>';
    if (btn) btn.disabled = true;
    return;
  }
  if (btn) btn.disabled = false;
  if (!anyTarget) {
    out.innerHTML = '<p class="dim text-sm">No targets set &mdash; the block will wave RPE around their current numbers. ' +
      'Add a target to make the loads climb.</p>';
    return;
  }

  const feas = planFeasibility(start, target, weeks, bw);
  GOAL_LIFTS.forEach(l => {
    const f = feas.perLift[l];
    const v = document.getElementById('goalV-' + l);
    if (!v || !f || !target[l]) return;
    const tone = _GOAL_TONE[f.verdict] || _GOAL_TONE.realistic;
    v.className = 'goal-verdict ' + tone.cls;
    v.textContent = f.verdict === 'unrealistic'
      ? '→ ' + Math.round(kgToDisplay(f.reachableKg) * 2) / 2 + ' realistic'
      : tone.word;
  });

  const over = GOAL_LIFTS.filter(l => feas.perLift[l] && feas.perLift[l].verdict === 'unrealistic');
  const gain = Math.round(kgToDisplay(feas.gainTotal));
  if (over.length) {
    out.innerHTML =
      '<p class="goal-msg bad"><strong>That will not fit in ' + weeks + ' weeks.</strong> ' +
      escHtml(_goalJoin(over.map(l => LIFT_LABELS[l] || l))) +
      (over.length === 1 ? ' is' : ' are') + ' asking for more than a well-run block gives. ' +
      'Build it anyway and the numbers get capped at what is reachable &mdash; the rest of the plan is unchanged.</p>';
  } else {
    out.innerHTML =
      '<p class="goal-msg ok"><strong>+' + gain + unitLabel() + ' on the total across ' + weeks + ' weeks.</strong> ' +
      'That is ' + escHtml(_goalArticle((_GOAL_TONE[feas.verdict] || {}).word || 'realistic')) + ' ask. Loads climb week to week and deload before the heaviest work.</p>';
  }
}

// Build + install. Replaces the athlete's program, so it confirms first.
function buildFromGoal() {
  const athleteId = window._goalAthleteId;
  const start = {}, target = {};
  GOAL_LIFTS.forEach(l => { start[l] = _goalNum('goalNow-' + l); target[l] = _goalNum('goalTgt-' + l); });
  if (!GOAL_LIFTS.some(l => start[l] > 0)) { toast('Enter at least one current lift.'); return; }

  const weeks = Math.max(3, Math.min(16, parseInt((document.getElementById('goalWeeks') || {}).value, 10) || 10));
  const daysPerWeek = parseInt((document.getElementById('goalDays') || {}).value, 10) || 4;
  const bw = typeof latestBodyweight === 'function' ? (latestBodyweight(athleteId) || 0) : 0;

  // Only pass targets the lifter actually set; feasibleTargets caps anything
  // out of reach so the block is built toward a number they can hit.
  const hasTargets = GOAL_LIFTS.some(l => target[l] > 0);
  let targets = null, feas = null;
  if (hasTargets) {
    const ft = feasibleTargets(start, target, weeks, bw);
    targets = ft.targets; feas = ft.feasibility;
  }

  const prog = generateProgram({ weeks, daysPerWeek, e1rms: start, targets });
  if (!prog || !prog.weeks || !prog.weeks.length) { toast('Could not build that block.'); return; }

  if (typeof window.__applyGeneratedProgram === 'function') {
    const ok = window.__applyGeneratedProgram(prog, athleteId);
    if (!ok) return;
  } else { toast('Open a program in the builder first.'); return; }

  closeModal('goalModal');
  const capped = feas && GOAL_LIFTS.filter(l => feas.perLift[l] && feas.perLift[l].verdict === 'unrealistic');
  toast(capped && capped.length
    ? 'Built ' + weeks + ' weeks: ' + capped.map(l => LIFT_LABELS[l] || l).join(' & ') + ' capped to what is reachable.'
    : 'Built ' + weeks + ' weeks. Loads climb to the target.');
}

window.openGoalModal = openGoalModal;
window.buildFromGoal = buildFromGoal;
window.refreshGoalReadout = refreshGoalReadout;

// =========================================================
// PEAKING BLOCK — a meet taper, distinct from generateProgram (a general
// build→deload block). Here intensity ASCENDS while volume DESCENDS into the
// platform, and the final week is openers only (one fast single per lift,
// accessories gone). Same schema + fresh uids, so the builder/Store/DB take it
// as-is. RPE-native (weights back-computed from reps@RPE, 0 when e1RM unknown).
// Pure + deterministic.
//   opts = { name?, weeks=4 (to meet, clamp 2..8), daysPerWeek=3 (clamp 2..4),
//            e1rms?:{squat,bench,deadlift}, athleteId?, coachId? }
// =========================================================
function generatePeakingBlock(opts) {
  opts = opts || {};
  const weeks = Math.max(2, Math.min(8, Math.round(opts.weeks || 4)));
  const dpw = Math.max(2, Math.min(4, Math.round(opts.daysPerWeek || 3)));
  const e1 = opts.e1rms || {};
  const last = weeks - 1;
  const OPENER_RPE = 7;   // a fast, easy single — what you'd open with on the platform

  // Per-week scheme by fraction f across the block (0 = first week, 1 = meet week).
  function topScheme(w) {
    const f = last ? w / last : 0;
    return { sets: 1, reps: Math.max(1, Math.round(3 - f * 2)), rpe: Math.round((7.5 + f * 1.5) * 2) / 2 };
  }
  function backoffScheme(w) {
    if (w === last) return null;                       // meet week: no back-offs
    const f = last ? w / last : 0;
    return { sets: Math.max(1, Math.round(4 - f * 3)), reps: Math.max(2, Math.round(5 - f * 2)), rpe: Math.round((7 + f) * 2) / 2 };
  }

  const rot = {
    2: [['squat', 'bench'], ['deadlift', 'bench']],
    3: [['squat'], ['bench'], ['deadlift']],
    4: [['squat'], ['bench'], ['deadlift'], ['bench']]
  }[dpw].map(a => a.slice());
  const accessoryByMain = { squat: 'legs', bench: 'push', deadlift: 'pull' };
  const dayName = (mains, isMeet) =>
    mains.map(m => LIFT_LABELS[m]).join(' / ') + (isMeet ? ' · openers' : ' day');

  const wks = [];
  for (let w = 0; w < weeks; w++) {
    const isMeet = w === last;
    const days = [];
    for (let d = 0; d < dpw; d++) {
      const mains = rot[d] || [MAIN_LIFTS[d % 3]];
      const day = newDay(dayName(mains, isMeet));
      mains.forEach(m => {
        const e = e1[m] || 0;
        const ex = newExercise(m, 'Competition', '');
        if (isMeet) {
          ex.sets.push(newSet(weightForTarget(e, 1, OPENER_RPE), 1, OPENER_RPE, 'Opener: fast and easy'));
        } else {
          const ts = topScheme(w);
          for (let s = 0; s < ts.sets; s++) ex.sets.push(newSet(weightForTarget(e, ts.reps, ts.rpe), ts.reps, ts.rpe, s === 0 ? 'Top set' : ''));
          const bs = backoffScheme(w);
          if (bs) for (let s = 0; s < bs.sets; s++) ex.sets.push(newSet(weightForTarget(e, bs.reps, bs.rpe), bs.reps, bs.rpe, ''));
        }
        day.exercises.push(ex);
        // Accessory volume tapers out as the meet nears; none in the meet week.
        const accSets = isMeet ? 0 : Math.max(0, 3 - Math.round((last ? w / last : 0) * 3));
        const grp = accessoryByMain[m];
        const list = (ACCESSORY_EXERCISES[grp]) || [];
        if (accSets && list.length) {
          const accEx = newExercise(grp, '', list[(w + d) % list.length]);
          for (let s = 0; s < accSets; s++) accEx.sets.push(newSet(0, 8, null, ''));
          day.exercises.push(accEx);
        }
      });
      days.push(day);
    }
    wks.push({ id: uid('wk'), number: w + 1, days });
  }

  const name = (opts.name && String(opts.name).trim()) || (weeks + '-week peaking block');
  return { id: uid('prog'), athleteId: opts.athleteId || null, coachId: opts.coachId || null, name, weeks: wks };
}
if (typeof window !== 'undefined') { window.generatePeakingBlock = generatePeakingBlock; }

// Migrate older exercises/sets that may not have `note`
function ensureExerciseShape(ex) {
  if (typeof ex.note !== 'string') ex.note = '';
  if (Array.isArray(ex.sets)) ex.sets.forEach(s => {
    if (typeof s.note !== 'string') s.note = '';
    if (typeof s.tempo !== 'string') s.tempo = '';
    // Old data stored rpe=0 to mean "no rpe" — normalize to null
    if (s.rpe === 0 || s.rpe === '0') s.rpe = null;
  });
  return ex;
}

// =========================================================
// SET GROUPING — collapse consecutive identical sets into "blocks".
// A typical PL exercise looks like:
//   Top set:    1 set × 4 @ 92.5kg @ RPE 5.5
//   Back-downs: 4 sets × 5 @ 90kg (no RPE — fatigue-driven)
// We render this as 2 blocks, not 5 separate rows.
// =========================================================
function groupSets(sets) {
  if (!sets || !sets.length) return [];
  const groups = [];
  let cur = null;
  sets.forEach((s, idx) => {
    const sig = [s.weight, s.reps, (s.rpe == null ? '_' : s.rpe), s.tempo || ''].join('|');
    if (cur && cur.sig === sig) {
      cur.count++;
    } else {
      cur = { startIdx: idx, count: 1, weight: s.weight, reps: s.reps, rpe: s.rpe, tempo: s.tempo || '', sig };
      groups.push(cur);
    }
  });
  return groups;
}

// =========================================================
// REORDER / DUPLICATE / COPY
// =========================================================
function moveItem(arr, from, dir) {
  const to = from + dir;
  if (to < 0 || to >= arr.length) return false;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return true;
}

function reorderExercise(programId, weekIdx, dayIdx, exIdx, dir) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (p && p.weeks[weekIdx]?.days[dayIdx]?.exercises) {
      moveItem(p.weeks[weekIdx].days[dayIdx].exercises, exIdx, dir);
    }
  });
}

function reorderDay(programId, weekIdx, dayIdx, dir) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (p && p.weeks[weekIdx]?.days) moveItem(p.weeks[weekIdx].days, dayIdx, dir);
  });
}

function copyExercise(programId, weekIdx, dayIdx, exIdx) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (!p) return;
    const ex = p.weeks[weekIdx].days[dayIdx].exercises[exIdx];
    const cloned = {
      id: uid('ex'),
      lift: ex.lift, variant: ex.variant, exerciseName: ex.exerciseName, note: ex.note,
      sets: ex.sets.map(set => ({
        id: uid('set'),
        weight: planWeight(set), reps: set.reps, rpe: set.rpe,
        completed: false, actualRpe: null, completedAt: null, note: ''
      }))
    };
    p.weeks[weekIdx].days[dayIdx].exercises.splice(exIdx + 1, 0, cloned);
  });
}

function duplicateWeek(programId, weekIdx) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (!p || !p.weeks[weekIdx]) return;
    const src = p.weeks[weekIdx];
    const newNum = (p.weeks.at(-1)?.number || 0) + 1;
    const cloned = {
      id: uid('wk'), number: newNum,
      days: src.days.map(d => ({
        id: uid('day'), name: d.name,
        exercises: d.exercises.map(ex => ({
          id: uid('ex'),
          lift: ex.lift, variant: ex.variant, exerciseName: ex.exerciseName, note: ex.note,
          sets: ex.sets.map(set => ({
            id: uid('set'),
            weight: planWeight(set), reps: set.reps, rpe: set.rpe,
            completed: false, actualRpe: null, completedAt: null, note: ''
          }))
        }))
      }))
    };
    p.weeks.push(cloned);
  });
}

// =========================================================
// PROGRAM TEMPLATES
// =========================================================
function saveProgramAsTemplate(programId, name) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (!p) return;
    s.programTemplates = s.programTemplates || [];
    s.programTemplates.push({
      id: uid('tpl'), coachId: p.coachId, name: name || p.name,
      createdAt: Date.now(),
      payload: {
        weeks: p.weeks.map(wk => ({
          number: wk.number,
          days: wk.days.map(d => ({
            name: d.name,
            exercises: d.exercises.map(ex => ({
              lift: ex.lift, variant: ex.variant, exerciseName: ex.exerciseName, note: ex.note,
              sets: ex.sets.map(set => ({ weight: planWeight(set), reps: set.reps, rpe: set.rpe }))
            }))
          }))
        }))
      }
    });
  });
}

function applyTemplate(templateId, athleteId, coachId) {
  Store.update(s => {
    const tpl = (s.programTemplates || []).find(t => t.id === templateId);
    if (!tpl) return;
    const newProg = {
      id: uid('prog'), athleteId, coachId, name: tpl.name,
      weeks: tpl.payload.weeks.map(wk => ({
        id: uid('wk'), number: wk.number,
        days: wk.days.map(d => ({
          id: uid('day'), name: d.name,
          exercises: d.exercises.map(ex => ({
            id: uid('ex'),
            lift: ex.lift, variant: ex.variant, exerciseName: ex.exerciseName, note: ex.note,
            sets: ex.sets.map(set => ({
              id: uid('set'), weight: set.weight, reps: set.reps, rpe: set.rpe,
              completed: false, actualRpe: null, completedAt: null, note: ''
            }))
          }))
        }))
      }))
    };
    // Replace existing program for this athlete
    s.programs = s.programs.filter(p => p.athleteId !== athleteId);
    s.programs.push(newProg);
  });
}

function deleteTemplate(templateId) {
  Store.update(s => { s.programTemplates = (s.programTemplates || []).filter(t => t.id !== templateId); });
}

// =========================================================
// LAST SET FOR EXERCISE (for "see last RPE" while programming)
// =========================================================
function getLastSetForExercise(athleteId, lift, variant, exerciseName) {
  const logs = Store.get().workoutLogs.filter(l => {
    if (l.athleteId !== athleteId) return false;
    if (l.lift !== lift) return false;
    if (MAIN_LIFTS.includes(lift)) return l.variant === variant;
    return l.exerciseName === exerciseName;
  });
  if (!logs.length) return null;
  return logs.sort((a, b) => b.date.localeCompare(a.date))[0];
}

function getProgressionHint(athleteId, lift, variant, exerciseName, prescribedWeight, prescribedRpe) {
  const logs = Store.get().workoutLogs.filter(l => {
    if (l.athleteId !== athleteId) return false;
    if (l.lift !== lift) return false;
    if (MAIN_LIFTS.includes(lift)) return l.variant === variant;
    return l.exerciseName === exerciseName;
  }).sort((a, b) => b.date.localeCompare(a.date));
  if (logs.length < 2) return null;
  const recent = logs.slice(0, 3);
  const allEasier = recent.every(l => l.weight >= prescribedWeight && l.rpe <= prescribedRpe - 1);
  if (allEasier) return { text: 'Last ' + recent.length + ' sessions felt at or below RPE ' + (prescribedRpe - 1) + '. Try +2.5kg?', kind: 'easy' };
  const allHard = recent.every(l => l.weight <= prescribedWeight && l.rpe >= prescribedRpe + 1);
  if (allHard) return { text: 'Last ' + recent.length + ' sessions felt above RPE ' + (prescribedRpe + 1) + '. Back off 2.5kg?', kind: 'hard' };
  return null;
}

// =========================================================
// PRs
// =========================================================
// Was this log a new comp-equivalent PR for the lift (any variant)?
function isPRForLog(athleteId, log) {
  const earlier = Store.get().workoutLogs.filter(l =>
    l.athleteId === athleteId &&
    l.lift === log.lift &&
    l.id !== log.id &&
    (l.date < log.date || (l.date === log.date && l.id < log.id))
  );
  if (!earlier.length) return true;
  const prevMax = Math.max(...earlier.map(l => l.e1rmComp));
  return log.e1rmComp > prevMax + 0.05;
}

function getLifetimePRs(athleteId) {
  const logs = Store.get().workoutLogs.filter(l => l.athleteId === athleteId);
  const result = {};
  ['squat', 'bench', 'deadlift'].forEach(lift => {
    const liftLogs = logs.filter(l => l.lift === lift);
    if (!liftLogs.length) return;
    const best = liftLogs.reduce((max, l) => l.e1rmComp > max.e1rmComp ? l : max);
    result[lift] = best;
  });
  return result;
}

// Chronological PR feed — pure. Walks each main lift's logs oldest→newest,
// tracking the running best competition-equivalent e1RM; every set that beats the
// prior best (by >0.05) is a PR event. Returns events NEWEST-first:
// { date, lift, e1rm, prev, jump } — prev 0 = first ever for that lift, jump = kg
// over the old best. `opts.limit` caps the count. Never mutates input.
function prTimeline(logs, athleteId, opts) {
  opts = opts || {};
  const events = [];
  ['squat', 'bench', 'deadlift'].forEach(lift => {
    const mine = (logs || [])
      .filter(l => l && l.athleteId === athleteId && l.lift === lift && Number(l.e1rmComp) > 0)
      .slice()
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    let best = 0;
    mine.forEach(l => {
      const e = Number(l.e1rmComp);
      if (e > best + 0.05) {
        events.push({
          date: l.date, lift,
          e1rm: Math.round(e * 10) / 10,
          prev: Math.round(best * 10) / 10,
          jump: Math.round((e - best) * 10) / 10
        });
        best = e;
      }
    });
  });
  events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return opts.limit ? events.slice(0, opts.limit) : events;
}
window.prTimeline = prTimeline;

function getWeeklyDelta(athleteId) {
  const logs = Store.get().workoutLogs.filter(l => l.athleteId === athleteId);
  const today = new Date(); today.setHours(0,0,0,0);
  const range = (offset) => {
    const end = new Date(today); end.setDate(end.getDate() - 7 * offset);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  };
  const cur = range(0), prev = range(1);
  const result = {};
  ['squat', 'bench', 'deadlift'].forEach(lift => {
    const inRange = (rg) => logs.filter(l => l.lift === lift && l.date >= rg.start && l.date <= rg.end);
    const curBest = inRange(cur).reduce((max, l) => Math.max(max, l.e1rmComp), 0);
    const prevBest = inRange(prev).reduce((max, l) => Math.max(max, l.e1rmComp), 0);
    if (curBest && prevBest) result[lift] = { current: curBest, previous: prevBest, delta: curBest - prevBest };
    else if (curBest) result[lift] = { current: curBest, previous: 0, delta: null };
  });
  return result;
}

// =========================================================
// ROSTER OVERVIEW (coach)
// =========================================================
function getRosterOverview(coachId) {
  const s = Store.get();
  return s.athletes.filter(a => a.coachId === coachId).map(a => {
    const prog = s.programs.find(p => p.athleteId === a.id);
    const logs = s.workoutLogs.filter(l => l.athleteId === a.id);
    const lastLog = logs.sort((x, y) => y.date.localeCompare(x.date))[0];
    const today = new Date(); today.setHours(0,0,0,0);
    const ago = lastLog ? Math.round((today - new Date(lastLog.date)) / 86400000) : null;
    const flag = ago == null ? 'never' : ago === 0 ? 'today' : ago <= 3 ? 'recent' : ago <= 7 ? 'week' : 'stale';
    const allSets = prog ? prog.weeks.flatMap(w => w.days).flatMap(d => d.exercises).flatMap(e => e.sets) : [];
    const completed = allSets.filter(s => s.completed).length;
    const total = allSets.length;
    const lastNote = (s.sessionNotes.filter(n => n.athleteId === a.id).sort((x, y) => y.date.localeCompare(x.date))[0]) || null;
    const lastRpe = lastLog ? lastLog.rpe : null;
    return { athlete: a, program: prog, lastLog, ago, flag, completedSets: completed, totalSets: total, lastNote, lastRpe };
  });
}

// =========================================================
// E1RM MOMENTUM (windowed) — is this lifter still progressing?
// Weekly deltas are noisy in powerlifting (you don't top-set every lift
// every week), so this compares the best comp-equivalent e1RM in the last
// `windowDays` days against the best in the window before it. Per lift it
// returns { recent, prior, delta } when BOTH windows have data (delta null
// when only the recent window does). `stalling` = at least one main lift
// is paired across both windows and NONE improved past `tol` — i.e. flat or
// regressing across the board. Pure read over Store; no DB.
// =========================================================
function getE1RMMomentum(athleteId, windowDays) {
  const win = windowDays || 21;
  const tol = 0.05; // kg — ignore float noise
  const dayMs = 86400000;
  const now = Date.now();
  const recentFrom = now - win * dayMs;
  const priorFrom = now - 2 * win * dayMs;
  const logs = Store.get().workoutLogs.filter(l => l.athleteId === athleteId && MAIN_LIFTS.includes(l.lift));
  const perLift = {};
  let anyPaired = false, anyUp = false;
  MAIN_LIFTS.forEach(lift => {
    const ll = logs.filter(l => l.lift === lift);
    const bestIn = (from, to) => ll.reduce((mx, l) => {
      const t = Date.parse(l.date);
      return (t >= from && t < to && l.e1rmComp > mx) ? l.e1rmComp : mx;
    }, 0);
    const recent = bestIn(recentFrom, now + dayMs);
    const prior = bestIn(priorFrom, recentFrom);
    if (recent && prior) {
      anyPaired = true;
      const delta = recent - prior;
      if (delta > tol) anyUp = true;
      perLift[lift] = { recent, prior, delta };
    } else if (recent) {
      perLift[lift] = { recent, prior: 0, delta: null };
    }
  });
  return { perLift, hasData: anyPaired, stalling: anyPaired && !anyUp };
}

// =========================================================
// ROSTER ATTENTION TRIAGE (coach) — who needs the coach THIS week, and why.
// Synthesises inactivity (getRosterOverview flags), e1RM stalling (windowed
// momentum), and weak program adherence into one prioritised list, plus a
// `prCount` of last-7-day PRs so the panel can also celebrate wins. Each item:
//   { athlete, overview, reasons:[{type,...}], severity, momentum, prCount }
// severity: 3 = inactive/never, 2 = stalling, 1 = low adherence, 0 = fine.
// reasons carry structured data (lift keys, day counts, %); the view formats
// the copy so this stays unit/label-agnostic.
// =========================================================
function getRosterAttention(coachId) {
  const overview = getRosterOverview(coachId);
  const weekAgo = Date.now() - 7 * 86400000;
  return overview.map(o => {
    const aId = o.athlete.id;
    const reasons = [];
    let severity = 0;
    // 1) Inactivity
    if (o.flag === 'never') { reasons.push({ type: 'inactive', days: null }); severity = Math.max(severity, 3); }
    else if (o.flag === 'stale') { reasons.push({ type: 'inactive', days: o.ago }); severity = Math.max(severity, 3); }
    // 2) e1RM stalling (only meaningful once they're training)
    const momentum = getE1RMMomentum(aId);
    if (o.flag !== 'never' && momentum.stalling) {
      const flat = MAIN_LIFTS.filter(L => momentum.perLift[L] && momentum.perLift[L].delta != null && momentum.perLift[L].delta <= 0.05);
      reasons.push({ type: 'stalling', lifts: flat });
      severity = Math.max(severity, 2);
    }
    // 3) Low program adherence — assigned work barely touched, and slipping
    if (o.totalSets > 0) {
      const pct = o.completedSets / o.totalSets;
      if (pct < 0.4 && (o.flag === 'week' || o.flag === 'stale')) {
        reasons.push({ type: 'adherence', pct: Math.round(pct * 100) });
        severity = Math.max(severity, 1);
      }
    }
    // Wins — main-lift PRs in the last 7 days
    const prCount = Store.get().workoutLogs.filter(l =>
      l.athleteId === aId && MAIN_LIFTS.includes(l.lift) && Date.parse(l.date) >= weekAgo && isPRForLog(aId, l)
    ).length;
    return { athlete: o.athlete, overview: o, reasons, severity, momentum, prCount };
  });
}

// =========================================================
// STREAK (athlete)
// Counts consecutive days where the athlete either logged sets OR
// marked the day as a rest day. Rest days bridge — they neither
// break nor grow training streak, but they preserve adherence.
// =========================================================
function getStreak(athleteId) {
  const s = Store.get();
  const trainSet = new Set(s.workoutLogs.filter(l => l.athleteId === athleteId).map(l => l.date));
  const restSet = new Set(s.restDays.filter(r => r.athleteId === athleteId).map(r => r.date));
  if (!trainSet.size) return 0;

  let trainingStreak = 0;
  let cursor = new Date(); cursor.setHours(0,0,0,0);
  // walk back day-by-day from today (or yesterday if today has nothing)
  let started = false;
  for (let i = 0; i < 365; i++) {
    const dStr = cursor.toISOString().slice(0, 10);
    if (trainSet.has(dStr)) { trainingStreak++; started = true; }
    else if (restSet.has(dStr)) { /* bridge — don't increment, don't break */ }
    else if (started) { break; }
    else if (i > 1) { break; } // give 1 grace day before any logging
    cursor.setDate(cursor.getDate() - 1);
  }
  return trainingStreak;
}

// =========================================================
// REST DAYS
// =========================================================
function isRestDay(athleteId, date) {
  return Store.get().restDays.some(r => r.athleteId === athleteId && r.date === date);
}
function getRestDay(athleteId, date) {
  return Store.get().restDays.find(r => r.athleteId === athleteId && r.date === date);
}
function markRestDay(athleteId, date, note) {
  Store.update(s => {
    const existing = s.restDays.find(r => r.athleteId === athleteId && r.date === date);
    if (existing) { existing.note = note || ''; }
    else s.restDays.push({ id: uid('rest'), athleteId, date, note: note || '' });
  });
}
function removeRestDay(athleteId, date) {
  Store.update(s => { s.restDays = s.restDays.filter(r => !(r.athleteId === athleteId && r.date === date)); });
}
function hasAnyLogOnDate(athleteId, date) {
  return Store.get().workoutLogs.some(l => l.athleteId === athleteId && l.date === date);
}

// =========================================================
// DATE HELPERS
// =========================================================
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtDateShort(iso) { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
// Compact relative stamp for inbox/feed rows: "now", "3m", "2h", "4d", else a short date.
function fmtRelative(iso) {
  if (!iso) return '';
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    if (isNaN(then)) return '';
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'now';
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    const d = Math.floor(h / 24);
    if (d < 7) return d + 'd';
    return fmtDateShort(iso);
  } catch (e) { return ''; }
}

// =========================================================
// UI HELPERS
// =========================================================
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') e.appendChild(document.createTextNode(String(child)));
    else e.appendChild(child);
  }
  return e;
}

// Shared client-side pager for paginated grids (landing coach directory,
// marketplace browse). Returns a <nav.grid-pager> with prev / windowed page
// numbers / next, or null when everything fits on one page. onGo(page) is the
// caller's "render this page" callback. Pure + stateless: the caller owns the
// current-page variable and re-invokes its render on each onGo.
function buildPager(totalItems, perPage, currentPage, onGo) {
  const pages = Math.max(1, Math.ceil(totalItems / perPage));
  if (pages <= 1) return null;
  currentPage = Math.min(Math.max(1, currentPage), pages);
  const nav = el('nav', { class: 'grid-pager', 'aria-label': 'Pagination' });
  const btn = (label, page, opts = {}) => {
    const b = el('button', { class: 'gp-btn' + (opts.active ? ' active' : '') + (opts.nav ? ' gp-nav' : ''), type: 'button', 'aria-label': opts.aria || ('Page ' + label) }, label);
    if (opts.disabled) b.disabled = true;
    else b.addEventListener('click', () => onGo(page));
    if (opts.active) b.setAttribute('aria-current', 'page');
    return b;
  };
  nav.appendChild(btn('‹', currentPage - 1, { disabled: currentPage <= 1, nav: true, aria: 'Previous page' }));
  // Windowed numbers: always first + last, plus a ±1 window around current.
  // Collapse the rest into ellipses so the control never overflows on mobile.
  const nums = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - currentPage) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  nums.forEach(n => {
    nav.appendChild(n === '…'
      ? el('span', { class: 'gp-ellip', 'aria-hidden': 'true' }, '…')
      : btn(String(n), n, { active: n === currentPage }));
  });
  nav.appendChild(btn('›', currentPage + 1, { disabled: currentPage >= pages, nav: true, aria: 'Next page' }));
  return nav;
}
window.buildPager = buildPager;

function toast(msg, ms = 2400) {
  // remove any existing
  document.querySelectorAll('.toast').forEach(t => t.remove());
  // role=status + aria-live so screen readers announce transient feedback
  const t = el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// Password strength hint (pure). Hand-rolled, no libs. 6 chars is the signup
// floor; below that = "Too short" (score 0). Otherwise score 1..4 from length
// + character variety. Purely advisory UI — never blocks submit.
function pwdStrength(pw) {
  pw = String(pw || '');
  if (pw.length < 6) return { score: 0, label: 'Too short', pct: 12 };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  s = Math.max(1, Math.min(4, s));
  return { score: s, label: { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' }[s], pct: s * 25 };
}
window.pwdStrength = pwdStrength;

// =========================================================
// FLAGS — convert ISO-3166-1 alpha-2 country code → 🇺🇸 emoji
// =========================================================
function flagEmoji(code) {
  if (!code || typeof code !== 'string' || code.length !== 2) return '';
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  const offset = 127397; // 'A' (65) + offset = 0x1F1E6 (regional indicator A)
  return String.fromCodePoint(cc.charCodeAt(0) + offset, cc.charCodeAt(1) + offset);
}
window.flagEmoji = flagEmoji;

// =========================================================
// NATIVE BOTTOM TAB BAR (Capacitor shell only)
// Mirrors the dashboard's .sidebar-tab set into an iOS-style fixed bottom bar. It's a
// PURE PROXY: each bottom button .click()s its source .sidebar-tab, so every bit of the
// existing tab-switching logic is reused untouched. Active state stays in sync via a
// MutationObserver on the source tabs' class — no new state machine. ≤5 tabs render
// inline; more collapse the tail into a "More" bottom sheet. Native-only + built once;
// a total no-op on the web (guard on html.native). Called from each dashboard bootstrap
// after the tab labels/icons are set.
// =========================================================
const BTAB_SHORT = {
  today: 'Train', program: 'Program', progress: 'Progress', bodyweight: 'Weight',
  coach: 'Coach', library: 'Library', marketplace: 'Market',
  athletes: 'Roster', templates: 'Templates', messages: 'Messages',
  club: 'Club', you: 'You'
};

// =========================================================
// SUB-SCREENS — a pane that belongs to a parent tab (Bodyweight → Progress,
// Library → You) gets a "‹ Parent" back link at the top while it's open.
// Driven by data-parent on its .sidebar-tab; one call after each tab switch.
// =========================================================
function syncPaneBack() {
  document.querySelectorAll('.pane-back').forEach(b => b.remove());
  const active = document.querySelector('.sidebar-tab.active[data-parent]');
  if (!active) return;
  const pane = document.querySelector('[data-pane="' + active.dataset.tab + '"]');
  const parent = document.querySelector('.sidebar-tab[data-tab="' + active.dataset.parent + '"]');
  if (!pane || !parent) return;
  const label = (parent.querySelector('span') && parent.querySelector('span').textContent) || BTAB_SHORT[active.dataset.parent] || 'Back';
  const back = el('button', { class: 'pane-back', type: 'button' });
  back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span>' + escHtml(label) + '</span>';
  back.addEventListener('click', () => parent.click());
  pane.insertBefore(back, pane.firstChild);
}
window.syncPaneBack = syncPaneBack;
function buildBottomTabs(primaryKeys) {
  try {
    if (!document.documentElement.classList.contains('native')) return; // native shell only
    if (document.getElementById('bottomTabs')) return;                  // build once
    // Tabs kept out of the bottom bar (feature/code stays — still reachable via the
    // in-app "View templates" buttons). Dropping 'templates' takes the coach from
    // 6 tabs to 5, so all 5 (incl. Progress) render as primary instead of Progress
    // getting pushed into the "More" overflow sheet.
    // 'marketplace' is dropped for Apple 3.1.1 / 3.1.3(c): it lists digital
    // programs with prices and an external Lemon Squeezy checkout, which the iOS
    // app must not offer. Nothing already bought is lost — purchased programs
    // live in "My library", which keeps its own tab and can reinstall any of them.
    // On native the sidebar is hidden, so the bottom bar IS the nav: removing the
    // tab here removes the only route to the pane.
    const BTAB_HIDE = { templates: true, marketplace: true };
    // A tab with data-parent is a SUB-SCREEN (Bodyweight under Progress, Library
    // under You): it never takes a slot in the bar or spills into "More" — you
    // reach it from its parent screen, and while it's open the parent's button
    // stays lit. That's what lets the bar be five real destinations and nothing else.
    const allTabs = Array.from(document.querySelectorAll('.sidebar-tab')); // athlete wraps in .dash-tablist, coach doesn't
    const tabs = allTabs.filter(t => !BTAB_HIDE[t.dataset.tab] && !t.dataset.parent);
    if (tabs.length < 2) return;

    const labelFor = (t) => BTAB_SHORT[t.dataset.tab] || (t.querySelector('span') && t.querySelector('span').textContent) || t.dataset.tab;
    const iconOf = (t) => { const s = t.querySelector('svg'); return s ? s.cloneNode(true) : null; };

    // Primary vs overflow. A caller may pass an explicit ordered list of
    // data-tab keys (e.g. the athlete bar shows Coach only when linked, else
    // Program); those become the bar in that order and everything else spills
    // to "More". Without it, fall back to the first-4 heuristic.
    let primary, overflow;
    if (Array.isArray(primaryKeys) && primaryKeys.length) {
      const byKey = {};
      tabs.forEach(t => { byKey[t.dataset.tab] = t; });
      primary = primaryKeys.map(k => byKey[k]).filter(Boolean);
      const inPrimary = new Set(primary);
      overflow = tabs.filter(t => !inPrimary.has(t));
    } else {
      primary  = tabs.length <= 5 ? tabs : tabs.slice(0, 4);
      overflow = tabs.length <= 5 ? []   : tabs.slice(4);
    }

    const bar = el('nav', { class: 'bottom-tabs', id: 'bottomTabs', role: 'tablist', 'aria-label': 'Primary sections' });
    // The lit pill behind the active icon. It slides between tabs (transform only)
    // and takes the destination's accent, so switching tabs reads as one motion.
    const pill = el('span', { class: 'bt-pill', 'aria-hidden': 'true' });
    bar.appendChild(pill);
    let moreBtn = null, sheet = null;
    const closeMore = () => { if (sheet) sheet.classList.remove('open'); if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false'); };

    const makeBtn = (src) => {
      const b = el('button', { class: 'bottom-tab', type: 'button', 'data-src': src.dataset.tab, 'aria-label': labelFor(src) });
      const ic = iconOf(src); if (ic) b.appendChild(ic);
      b.appendChild(el('span', { class: 'bt-label' }, labelFor(src)));
      b.addEventListener('click', () => { closeMore(); src.click(); });
      return b;
    };
    primary.forEach(t => bar.appendChild(makeBtn(t)));

    if (overflow.length) {
      moreBtn = el('button', { class: 'bottom-tab', id: 'btabMore', type: 'button', 'aria-label': 'More sections', 'aria-expanded': 'false' });
      const mi = el('span', { class: 'bt-ico' }); mi.innerHTML = ICONS.dots || '•••'; moreBtn.appendChild(mi);
      moreBtn.appendChild(el('span', { class: 'bt-label' }, 'More'));

      sheet = el('div', { class: 'bottom-more-sheet', id: 'btabSheet', role: 'menu' });
      const inner = el('div', { class: 'bms-inner' });
      inner.appendChild(el('div', { class: 'bms-grip', 'aria-hidden': 'true' }));
      overflow.forEach(src => {
        const row = el('button', { class: 'bms-item', type: 'button' });
        const ic = iconOf(src); if (ic) row.appendChild(ic);
        row.appendChild(el('span', {}, labelFor(src)));
        row.addEventListener('click', () => { closeMore(); src.click(); });
        inner.appendChild(row);
      });
      sheet.appendChild(inner);
      sheet.addEventListener('click', (e) => { if (e.target === sheet) closeMore(); }); // tap backdrop closes
      moreBtn.addEventListener('click', () => {
        const open = sheet.classList.toggle('open');
        moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      bar.appendChild(moreBtn);
      document.body.appendChild(sheet);
    }
    document.body.appendChild(bar);

    const placePill = (btn) => {
      if (!btn) { pill.style.opacity = '0'; return; }
      const w = Math.max(56, Math.min(72, btn.offsetWidth - 14));
      pill.style.width = w + 'px';
      pill.style.transform = 'translateX(' + Math.round(btn.offsetLeft + (btn.offsetWidth - w) / 2) + 'px)';
      pill.style.opacity = '1';
    };
    // Mirror active state from the source tabs (no new state — pure reflection).
    let lit = null;
    const sync = () => {
      const active = allTabs.find(t => t.classList.contains('active'));
      bar.querySelectorAll('.bottom-tab').forEach(b => b.classList.remove('active'));
      if (!active) { placePill(null); return; }
      const key = active.dataset.parent || active.dataset.tab;   // sub-screen → its parent
      const match = bar.querySelector('.bottom-tab[data-src="' + key + '"]');
      lit = match || (moreBtn && overflow.indexOf(active) !== -1 ? moreBtn : null);
      if (lit) lit.classList.add('active');
      placePill(lit);
    };
    const obs = new MutationObserver(sync);
    allTabs.forEach(t => obs.observe(t, { attributes: true, attributeFilter: ['class'] }));
    sync();
    // First placement snaps; after that the pill glides.
    setTimeout(() => bar.classList.add('bt-ready'), 60);
    window.addEventListener('resize', () => placePill(lit));
  } catch (e) { console.warn('buildBottomTabs failed', e); }
}
window.buildBottomTabs = buildBottomTabs;

// =========================================================
// COMMAND PALETTE (⌘K / Ctrl+K) — quick jump to any tab or action.
// Auto-discovers the page's .sidebar-tab buttons + a few global actions, so it
// works on both dashboards with zero per-page wiring. Isolated: a keydown
// listener + a lazily-built modal; it touches no existing flow, and does
// nothing on pages without sidebar tabs (public pages).
// =========================================================
function _cmdCommands() {
  const cmds = [];
  document.querySelectorAll('.sidebar-tab').forEach(btn => {
    // Read the label's own <span> (set by setLbl), not the whole button — the
    // button can also hold a badge (e.g. the Library unclaimed-count span), which
    // would otherwise leak into the label as "My library1".
    const labelEl = btn.querySelector('span');
    const label = ((labelEl ? labelEl.textContent : btn.textContent) || '').trim();
    if (label) cmds.push({ label: 'Go to ' + label, kind: 'Tab', run: () => btn.click() });
  });
  if (typeof openSettingsModal === 'function') cmds.push({ label: 'Settings', kind: 'Action', run: () => openSettingsModal() });
  if (typeof toggleUnit === 'function') cmds.push({ label: 'Toggle kg / lb', kind: 'Action', run: () => toggleUnit() });
  if (typeof toggleTheme === 'function') cmds.push({ label: 'Toggle light / dark', kind: 'Action', run: () => toggleTheme() });
  return cmds;
}
let _cmdEl = null, _cmdIdx = 0, _cmdFiltered = [];
function _cmdEnsure() {
  if (_cmdEl) return _cmdEl;
  const back = document.createElement('div');
  back.className = 'cmdk-backdrop';
  back.innerHTML =
    '<div class="cmdk" role="dialog" aria-label="Command palette">' +
      '<input class="cmdk-input" type="text" placeholder="Jump to a tab or action…" aria-label="Command search" autocomplete="off">' +
      '<div class="cmdk-list" role="listbox"></div>' +
    '</div>';
  back.addEventListener('click', e => { if (e.target === back) closeCommandPalette(); });
  document.body.appendChild(back);
  const input = back.querySelector('.cmdk-input');
  input.addEventListener('input', () => _cmdRender(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); _cmdMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdMove(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); _cmdRun(_cmdIdx); }
    else if (e.key === 'Escape') { e.preventDefault(); closeCommandPalette(); }
  });
  _cmdEl = back;
  return back;
}
function _cmdRender(q) {
  const all = _cmdCommands();
  q = (q || '').trim().toLowerCase();
  _cmdFiltered = q ? all.filter(c => c.label.toLowerCase().includes(q)) : all;
  _cmdIdx = 0;
  const list = _cmdEl.querySelector('.cmdk-list');
  list.innerHTML = '';
  if (!_cmdFiltered.length) {
    const e = document.createElement('div'); e.className = 'cmdk-empty'; e.textContent = 'No matches';
    list.appendChild(e); return;
  }
  _cmdFiltered.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'cmdk-item' + (i === 0 ? ' active' : '');
    row.setAttribute('role', 'option');
    const t = document.createElement('span'); t.className = 'cmdk-label'; t.textContent = c.label;
    const k = document.createElement('span'); k.className = 'cmdk-kind'; k.textContent = c.kind;
    row.appendChild(t); row.appendChild(k);
    row.addEventListener('mouseenter', () => { _cmdIdx = i; _cmdHighlight(); });
    row.addEventListener('click', () => _cmdRun(i));
    list.appendChild(row);
  });
}
function _cmdHighlight() {
  const items = _cmdEl.querySelectorAll('.cmdk-item');
  items.forEach((it, i) => it.classList.toggle('active', i === _cmdIdx));
  const active = items[_cmdIdx];
  if (active) active.scrollIntoView({ block: 'nearest' });
}
function _cmdMove(d) {
  if (!_cmdFiltered.length) return;
  _cmdIdx = (_cmdIdx + d + _cmdFiltered.length) % _cmdFiltered.length;
  _cmdHighlight();
}
function _cmdRun(i) {
  const c = _cmdFiltered[i];
  closeCommandPalette();
  if (c && typeof c.run === 'function') setTimeout(c.run, 0);
}
function openCommandPalette() {
  if (!document.querySelector('.sidebar-tab')) return; // dashboards only
  _cmdEnsure();
  _cmdEl.classList.add('open');
  const input = _cmdEl.querySelector('.cmdk-input');
  input.value = '';
  _cmdRender('');
  setTimeout(() => input.focus(), 0);
}
function closeCommandPalette() { if (_cmdEl) _cmdEl.classList.remove('open'); }
window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
    if (!document.querySelector('.sidebar-tab')) return; // no-op on public pages
    e.preventDefault();
    if (_cmdEl && _cmdEl.classList.contains('open')) closeCommandPalette();
    else openCommandPalette();
  }
});

// Common country list used in settings dropdown. Code + display name.
// Curated — extend as needed. Sorted alphabetically by name.
const COUNTRIES = [
  { code: 'AR', name: 'Argentina' }, { code: 'AU', name: 'Australia' }, { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' }, { code: 'BR', name: 'Brazil' }, { code: 'BG', name: 'Bulgaria' },
  { code: 'CA', name: 'Canada' }, { code: 'CL', name: 'Chile' }, { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' }, { code: 'HR', name: 'Croatia' }, { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' }, { code: 'EG', name: 'Egypt' }, { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' }, { code: 'FR', name: 'France' }, { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' }, { code: 'HK', name: 'Hong Kong' }, { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' }, { code: 'IN', name: 'India' }, { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' }, { code: 'IL', name: 'Israel' }, { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' }, { code: 'KZ', name: 'Kazakhstan' }, { code: 'KE', name: 'Kenya' },
  { code: 'KR', name: 'Korea' }, { code: 'LV', name: 'Latvia' }, { code: 'LT', name: 'Lithuania' },
  { code: 'MY', name: 'Malaysia' }, { code: 'MX', name: 'Mexico' }, { code: 'MA', name: 'Morocco' },
  { code: 'NL', name: 'Netherlands' }, { code: 'NZ', name: 'New Zealand' }, { code: 'NG', name: 'Nigeria' },
  { code: 'NO', name: 'Norway' }, { code: 'PK', name: 'Pakistan' }, { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' }, { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' }, { code: 'RU', name: 'Russia' }, { code: 'SA', name: 'Saudi Arabia' },
  { code: 'RS', name: 'Serbia' }, { code: 'SG', name: 'Singapore' }, { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' }, { code: 'ZA', name: 'South Africa' }, { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' }, { code: 'CH', name: 'Switzerland' }, { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' }, { code: 'TR', name: 'Turkey' }, { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' }, { code: 'UY', name: 'Uruguay' }, { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' }
];
window.COUNTRIES = COUNTRIES;

// Build an avatar element: real photo if avatarUrl set, otherwise initials.
// opts: { size: 'sm'|'md'|'lg', user: { name, avatarUrl, countryCode } }
function avatarHtml(user, opts) {
  opts = opts || {};
  const cls = opts.cls || '';
  const sz = opts.size || 'md';
  const sizeStyle = sz === 'sm' ? 'width:32px;height:32px;font-size:13px'
                   : sz === 'lg' ? 'width:80px;height:80px;font-size:22px'
                   : 'width:48px;height:48px;font-size:1rem';
  if (user && user.avatarUrl) {
    return '<div class="av ' + cls + '" style="' + sizeStyle + ';padding:0;overflow:hidden;background:transparent">' +
      '<img src="' + escHtml(user.avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' +
    '</div>';
  }
  return '<div class="av ' + cls + '" data-name="' + escHtml(user ? (user.name || '?') : '?') + '" style="' + sizeStyle + '">' + escHtml(initials(user ? user.name : '?')) + '</div>';
}
window.avatarHtml = avatarHtml;

// =========================================================
// ICONS (inline SVG strings)
// =========================================================
const ICONS = {
  bar: '<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="11" width="3" height="6" rx="1" fill="currentColor"/><rect x="6" y="9" width="2" height="10" rx="0.5" fill="currentColor"/><rect x="9" y="13" width="10" height="2" fill="currentColor"/><rect x="20" y="9" width="2" height="10" rx="0.5" fill="currentColor"/><rect x="23" y="11" width="3" height="6" rx="1" fill="currentColor"/></svg>',
  athletes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  program: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M8 10a4.5 4.5 0 0 1 8 0"/><path d="M12 10.2l1.6-2.3"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  weight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="6"/><path d="M9.5 9V7a2.5 2.5 0 0 1 5 0v2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 5h12v6a6 6 0 0 1-12 0V5zM12 17v4M9 21h6"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>',
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

// Brand mark — barbell SVG
// The mark: one sleeve of a loaded bar, side on — a red 25 kg plate (the IPF colour for
// the heaviest disc), a smaller plate and the collar. The plate is the only red in the
// identity; bar, plates and wordmark take the ink colour (currentColor).
const BRAND_MARK = '<svg class="brand-mark" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1.5" y="14.6" width="29" height="2.8" rx="1.4" fill="currentColor"/><rect x="8" y="3" width="7.5" height="26" rx="2.2" fill="#ff2d3f"/><rect x="17" y="7.5" width="4" height="17" rx="1.6" fill="currentColor"/><rect x="22.5" y="12" width="2.6" height="8" rx="1.1" fill="currentColor"/></svg>';

// =========================================================
// NAV
// =========================================================
function renderNav(target) {
  const user = getCurrentUser();
  const navInner = el('div', { class: 'nav-inner' });
  // Logo destination: a signed-in user goes STRAIGHT to their own dashboard.
  // Pointing it at index.html made the marketing page flash for a beat before
  // index.html's own location.replace() bounced them back to the dashboard —
  // most visible inside the native shell. Logged-out users still get the landing page.
  const brandHref = user
    ? (user.userType === 'coach' ? 'coach.html'
       : user.userType === 'admin' ? 'admin.html'
       : 'athlete.html')
    : 'index.html';
  const brand = el('a', { href: brandHref, class: 'brand' });
  brand.innerHTML = BRAND_MARK + '<span class="brand-word">POWALIFTA</span>';
  navInner.appendChild(brand);

  const actions = el('div', { class: 'nav-actions ' + (user ? 'auth' : 'guest') });

  // Theme toggle — always shown, anywhere in the nav
  const themeBtn = el('button', { class: 'theme-toggle', title: 'Toggle light / dark', 'aria-label': 'Toggle theme' });
  themeBtn.innerHTML =
    '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
    '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  themeBtn.setAttribute('onclick', 'toggleTheme()');
  actions.appendChild(themeBtn);

  // Unit toggle (kg / lbs) — always visible, swaps and reloads
  const unitBtn = el('button', { class: 'unit-toggle', title: 'Toggle weight units (' + getUnit() + ')', 'aria-label': 'Toggle weight units' });
  unitBtn.textContent = getUnit().toUpperCase();
  unitBtn.setAttribute('onclick', 'toggleUnit()');
  actions.appendChild(unitBtn);

  if (user) {
    // Ask AI — in the app (and on phones) the assistant opens from the top bar
    // instead of a floating button that sat on top of the set checkboxes.
    if (document.querySelector('.dash-main') && user.userType !== 'admin') {
      const aiBtn = el('button', { class: 'nav-ai', type: 'button', title: 'Ask AI', 'aria-label': 'Ask the AI assistant' });
      aiBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
      aiBtn.setAttribute('onclick', 'openAIAssistant()');
      actions.appendChild(aiBtn);
    }
    // Signal center bell — only on the dashboards (skip marketing pages + admin).
    if (document.querySelector('.dash-main') && user.userType !== 'admin') {
      const sigWrap = el('div', { class: 'sig-wrap' });
      const bell = el('button', { class: 'sig-bell', title: 'Notifications', 'aria-label': 'Notifications' });
      bell.innerHTML = _SIG_BELL + '<span class="sig-badge" hidden></span>';
      bell.setAttribute('onclick', 'toggleSignalCenter(event)');
      const panel = el('div', { class: 'sig-panel', id: 'sigPanel', hidden: '' });
      sigWrap.appendChild(bell);
      sigWrap.appendChild(panel);
      actions.appendChild(sigWrap);
    }
    // The user pill. In the app it's gone: everything it opened lives under You.
    // On a web dashboard it opens You; on public pages, the Settings sheet.
    const onDash = !!document.querySelector('.dash-main');
    const inShell = document.documentElement.classList.contains('native');
    const userPill = el('button', { class: 'nav-user', title: onDash ? 'You' : 'Settings' });
    const avInner = user.avatarUrl
      ? '<div class="av" style="padding:0;overflow:hidden;background:transparent"><img src="' + escHtml(user.avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
      : '<div class="av" data-name="' + escHtml(user.name || '?') + '">' + escHtml(initials(user.name)) + '</div>';
    const flagPart = user.countryCode ? '<span style="margin-left:4px">' + flagEmoji(user.countryCode) + '</span>' : '';
    userPill.innerHTML = avInner + '<span>' + escHtml(user.name) + '</span>' + flagPart;
    userPill.setAttribute('onclick', onDash
      ? "var t=document.getElementById('tab-you');if(t){t.click();window.scrollTo(0,0);}else if(window.openSettingsModal){openSettingsModal()}"
      : 'if(window.openSettingsModal){openSettingsModal()}');
    if (!(onDash && inShell)) actions.appendChild(userPill);
    if (user.userType === 'coach') {
      actions.appendChild(el('a', { href: 'coach.html', class: 'btn btn-sm btn-ghost nav-dash-link' }, 'Dashboard'));
    } else {
      actions.appendChild(el('a', { href: 'athlete.html', class: 'btn btn-sm btn-ghost nav-dash-link' }, 'Dashboard'));
    }
    if (user.isAdmin) {
      const adminA = el('a', { href: 'admin.html', class: 'btn btn-sm', style: 'border-color: var(--gold); color: var(--gold);' }, '★ Admin');
      actions.appendChild(adminA);
    }
    const logoutBtn = el('button', { class: 'btn btn-sm btn-ghost nav-logout', title: 'Log out', 'aria-label': 'Log out' });
    logoutBtn.innerHTML = ICONS.logout + '<span>Log out</span>';
    logoutBtn.setAttribute('onclick', 'logout()');
    actions.appendChild(logoutBtn);
  } else {
    // BULLETPROOF: inline string onclick — browser evaluates in global scope at click time.
    // This is the same mechanism as the hero CTAs which always work.
    const loginA = el('a', { href: 'javascript:void(0)', class: 'btn btn-sm btn-ghost' }, 'Log in');
    loginA.setAttribute('onclick', "if(window.openLoginModal){openLoginModal()}else{location.href='/index.html#login'}");
    actions.appendChild(loginA);
    const cta = el('a', { href: 'javascript:void(0)', class: 'btn btn-sm btn-primary' }, 'Get started');
    cta.setAttribute('onclick', "if(window.openSignupModal){openSignupModal('solo')}else{location.href='/index.html#signup'}");
    actions.appendChild(cta);
  }
  navInner.appendChild(actions);

  const wrap = document.querySelector(target);
  if (wrap) { wrap.innerHTML = ''; wrap.appendChild(navInner); }
  if (typeof refreshSignalBadge === 'function') refreshSignalBadge();
}

// =========================================================
// SIGNAL CENTER — in-app notifications
// =========================================================
// No notifications table. Signals are derived client-side from data already
// hydrated into the Store (coach replies, check-ins, at-risk athletes), and
// read-state is kept per-user in localStorage. Read-only → demo-safe.
const _SIG_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
const _SIG_ICON = {
  reply:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  checkin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  alert:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};
function _sigReadKey(uid) { return 'powa-signals-read-' + uid; }
function _sigSeen(uid) {
  try { return new Set(JSON.parse(localStorage.getItem(_sigReadKey(uid)) || '[]')); }
  catch (e) { return new Set(); }
}
function _sigMarkSeen(uid, ids) {
  const s = _sigSeen(uid);
  ids.forEach(i => s.add(i));
  try { localStorage.setItem(_sigReadKey(uid), JSON.stringify([...s].slice(-300))); } catch (e) {}
}
function _sigTimeAgo(ts) {
  const d = (typeof ts === 'number') ? ts : Date.parse(ts);
  if (!isFinite(d)) return '';
  const sec = Math.max(0, (Date.now() - d) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  if (sec < 604800) return Math.floor(sec / 86400) + 'd ago';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function _sigWeekStartISO() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setDate(now.getDate() - day); mon.setHours(0, 0, 0, 0);
  return mon.toISOString().slice(0, 10);
}
function computeSignals() {
  const u = getCurrentUser();
  if (!u) return [];
  const s = Store.get();
  const out = [];
  if (u.userType === 'coach') {
    const roster = new Set((s.athletes || []).filter(a => a.coachId === u.id).map(a => a.id));
    const nameOf = id => ((s.athletes || []).find(a => a.id === id) || {}).name || 'An athlete';
    (s.sessionNotes || []).forEach(n => {
      if (!roster.has(n.athleteId) || n.coachComment) return;
      out.push({ id: 'cnote-' + n.id, type: 'reply', title: nameOf(n.athleteId) + ' left a note', body: n.note, ts: n.date, tab: 'athletes' });
    });
    (s.checkins || []).forEach(c => {
      if (!roster.has(c.athleteId)) return;
      out.push({ id: 'cci-' + c.id, type: 'checkin', title: nameOf(c.athleteId) + ' submitted a check-in', body: 'Feeling ' + c.feel + '/10 · sleep ' + c.sleep + 'h · stress ' + c.stress + '/10', ts: c.createdAt || c.weekStart, tab: 'athletes' });
    });
    (s.athletes || []).filter(a => a.coachId === u.id).forEach(a => {
      const logs = (s.workoutLogs || []).filter(l => l.athleteId === a.id);
      if (!logs.length) return;
      const last = logs.reduce((m, l) => l.date > m ? l.date : m, logs[0].date);
      const days = Math.floor((Date.now() - Date.parse(last)) / 86400000);
      if (days >= 10) out.push({ id: 'cstale-' + a.id + '-' + last, type: 'alert', title: a.name + ' has gone quiet', body: 'No sets logged in ' + days + ' days', ts: last, tab: 'athletes' });
    });
  } else {
    const coach = (s.coaches || []).find(c => c.id === u.coachId) || (s.athletes || []).find(c => c.id === u.coachId);
    const coachName = (coach && coach.name) || 'Your coach';
    (s.sessionNotes || []).forEach(n => {
      if (n.athleteId !== u.id || !n.coachComment) return;
      out.push({ id: 'areply-' + n.id, type: 'reply', title: coachName + ' replied to your note', body: n.coachComment, ts: n.coachCommentAt || n.date, tab: 'coach' });
    });
    const ws = _sigWeekStartISO();
    const submitted = (s.checkins || []).some(c => c.athleteId === u.id && c.weekStart >= ws);
    if (u.coachId && !submitted) {
      out.push({ id: 'aci-due-' + ws, type: 'checkin', title: 'Weekly check-in is due', body: 'Let your coach know how training went this week.', ts: ws + 'T06:00:00Z', tab: 'coach' });
    }
  }
  out.sort((a, b) => (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0));
  return out.slice(0, 40);
}
function refreshSignalBadge() {
  const badge = document.querySelector('.sig-badge');
  if (!badge) return;
  const u = getCurrentUser();
  if (!u) { badge.hidden = true; return; }
  const seen = _sigSeen(u.id);
  const unread = computeSignals().filter(sg => !seen.has(sg.id)).length;
  if (unread > 0) { badge.textContent = unread > 9 ? '9+' : String(unread); badge.hidden = false; }
  else { badge.hidden = true; }
}
function _sigGo(tab) {
  const panel = document.getElementById('sigPanel');
  if (panel) panel.hidden = true;
  const t = document.getElementById('tab-' + tab) || document.querySelector('[data-tab="' + tab + '"]');
  if (t) t.click();
}
function renderSignalPanel() {
  const panel = document.getElementById('sigPanel');
  if (!panel) return;
  const u = getCurrentUser();
  if (!u) return;
  const sigs = computeSignals();
  const seen = _sigSeen(u.id);
  panel.innerHTML = '';
  const head = el('div', { class: 'sig-head' });
  head.appendChild(el('span', {}, 'Notifications'));
  if (sigs.length) {
    const clr = el('button', { class: 'sig-clear' }, 'Mark all read');
    clr.onclick = (e) => { e.stopPropagation(); _sigMarkSeen(u.id, sigs.map(sg => sg.id)); renderSignalPanel(); refreshSignalBadge(); };
    head.appendChild(clr);
  }
  panel.appendChild(head);
  if (!sigs.length) {
    panel.appendChild(el('div', { class: 'sig-empty' }, "You're all caught up."));
    return;
  }
  const list = el('div', { class: 'sig-list' });
  sigs.forEach(sg => {
    const unread = !seen.has(sg.id);
    const item = el('button', { class: 'sig-item' + (unread ? ' unread' : '') });
    item.innerHTML =
      '<span class="sig-ic">' + (_SIG_ICON[sg.type] || _SIG_ICON.alert) + '</span>' +
      '<span class="sig-main">' +
        '<span class="sig-title">' + escHtml(sg.title) + '</span>' +
        '<span class="sig-sub">' + escHtml((sg.body || '').slice(0, 100)) + '</span>' +
        '<span class="sig-time">' + _sigTimeAgo(sg.ts) + '</span>' +
      '</span>';
    item.onclick = (e) => { e.stopPropagation(); _sigMarkSeen(u.id, [sg.id]); _sigGo(sg.tab); };
    list.appendChild(item);
  });
  panel.appendChild(list);
}
function toggleSignalCenter(ev) {
  if (ev) ev.stopPropagation();
  const panel = document.getElementById('sigPanel');
  if (!panel) return;
  const opening = panel.hidden;
  panel.hidden = !opening;
  if (opening) {
    renderSignalPanel();
    const u = getCurrentUser();
    // After a beat of looking, clear the unread badge (items keep their dot until reopened).
    setTimeout(() => { if (u) { _sigMarkSeen(u.id, computeSignals().map(sg => sg.id)); refreshSignalBadge(); } }, 1500);
  }
}
window.toggleSignalCenter = toggleSignalCenter;
// Close the panel when clicking anywhere outside it.
if (!window.__sigOutsideBound) {
  window.__sigOutsideBound = true;
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('sigPanel');
    if (!panel || panel.hidden) return;
    if (e.target.closest && e.target.closest('.sig-wrap')) return;
    panel.hidden = true;
  });
}

// =========================================================
// PASSWORD INPUT WITH TOGGLE
// =========================================================
// Call after DOM is ready. Wraps any input with [data-pwd] inside a wrapper
// and adds an eye toggle.
function attachPwdToggles() {
  document.querySelectorAll('input[type="password"]:not([data-pwd-bound])').forEach(inp => {
    inp.setAttribute('data-pwd-bound', '1');
    const wrap = el('div', { class: 'input-wrap' });
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const btn = el('button', { type: 'button', class: 'input-toggle', 'aria-label': 'Show password' });
    btn.innerHTML = ICONS.eye;
    btn.addEventListener('click', () => {
      if (inp.type === 'password') { inp.type = 'text'; btn.innerHTML = ICONS.eyeOff; btn.setAttribute('aria-label', 'Hide password'); }
      else { inp.type = 'password'; btn.innerHTML = ICONS.eye; btn.setAttribute('aria-label', 'Show password'); }
    });
    wrap.appendChild(btn);
  });
}

// =========================================================
// CUSTOM SVG LINE CHART
//
// drawLineChart(container, {
//   series:  [{ name, color, data: [{x: 'YYYY-MM-DD', y: number}] }],
//   unit:    'kg',
//   height:  320,
//   area:    true | false,
//   goal:    { value: 250, label: 'Goal · 250kg' }
// })
// Replaces the Chart.js dependency. Container should have position: relative
// (chart-wrap class already provides this).
// =========================================================
const SVG_NS = 'http://www.w3.org/2000/svg';

// Read a CSS custom property from :root (or [data-theme])
function _cv(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

// Registry of active charts so we can re-render on theme change.
const _activeCharts = new WeakMap();
window.addEventListener('themechange', () => {
  // Walk the DOM for chart containers we know about. We re-render in a microtask
  // so the new CSS variables are guaranteed flushed.
  setTimeout(() => {
    document.querySelectorAll('[data-chart-bound="1"]').forEach(c => {
      const cfg = _activeCharts.get(c);
      if (cfg) drawLineChart(c, cfg);
    });
  }, 0);
});

function drawLineChart(container, config) {
  const { series = [], unit = '', height = 320, area = false, goal = null } = config;
  container.innerHTML = '';
  // Track for re-render on theme change
  container.setAttribute('data-chart-bound', '1');
  _activeCharts.set(container, config);

  // Resolve theme colors at draw time so the chart re-renders correctly when the user toggles theme.
  const C_GRID  = _cv('--chart-grid', '#1d1d22');
  const C_AXIS  = _cv('--chart-axis', '#82828c');
  const C_GOAL  = _cv('--gold', '#ffb547');
  const C_DOT   = _cv('--dot-stroke', '#0b0b0c');
  const C_CROSS = _cv('--chart-cross', '#56565e');
  const C_TIP_BG    = _cv('--chart-tip-bg', '#16161a');
  const C_TIP_LINE  = _cv('--chart-tip-line', '#34343d');
  const C_TIP_TITLE = _cv('--chart-tip-title', '#82828c');
  const C_TIP_NAME  = _cv('--chart-tip-name', '#b8b8c0');
  const C_TIP_VAL   = _cv('--chart-tip-val', '#f4f4f6');

  const hasData = series.some(s => s.data && s.data.length);
  if (!hasData) {
    const e = el('div', { class: 'chart-empty' });
    e.innerHTML = ICONS.chart + '<p>No data yet: log some sets and your trend will appear here.</p>';
    container.appendChild(e);
    return;
  }

  // Layout
  const w = Math.max(320, container.clientWidth || 600);
  const h = height;
  const PAD = { top: 20, right: 24, bottom: 38, left: 52 };
  const innerW = w - PAD.left - PAD.right;
  const innerH = h - PAD.top - PAD.bottom;

  // Compute domain
  const allDates = [...new Set(series.flatMap(s => s.data.map(d => d.x)))].sort();
  let allYs = series.flatMap(s => s.data.map(d => d.y).filter(y => y != null));
  if (goal && goal.value != null) allYs.push(goal.value);
  const yMin = Math.min(...allYs);
  const yMax = Math.max(...allYs);
  const yRange = (yMax - yMin) || Math.max(1, yMax * 0.05);
  const yLow = Math.max(0, yMin - yRange * 0.12);
  const yHigh = yMax + yRange * 0.12;

  const xScale = i => allDates.length === 1 ? PAD.left + innerW / 2 : (i / (allDates.length - 1)) * innerW + PAD.left;
  const yScale = y => PAD.top + innerH - ((y - yLow) / (yHigh - yLow)) * innerH;

  // SVG
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.display = 'block';
  svg.style.overflow = 'visible';

  // <defs> with gradients
  const defs = document.createElementNS(SVG_NS, 'defs');
  series.forEach((s, i) => {
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', 'plg-' + i + '-' + Math.random().toString(36).slice(2,7));
    s._gradId = grad.getAttribute('id');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    [['0%', '0.45'], ['100%', '0']].forEach(([off, op]) => {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', off);
      stop.setAttribute('stop-color', s.color);
      stop.setAttribute('stop-opacity', op);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
  });
  svg.appendChild(defs);

  // Y gridlines + labels
  const tickCount = 5;
  const niceStep = niceTickStep((yHigh - yLow) / tickCount);
  const tickStart = Math.ceil(yLow / niceStep) * niceStep;
  for (let v = tickStart; v <= yHigh; v += niceStep) {
    const yv = yScale(v);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', PAD.left); line.setAttribute('x2', w - PAD.right);
    line.setAttribute('y1', yv); line.setAttribute('y2', yv);
    line.setAttribute('stroke', C_GRID); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', PAD.left - 10); t.setAttribute('y', yv + 4);
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('fill', C_AXIS); t.setAttribute('font-size', '11');
    t.setAttribute('font-family', "'Archivo', sans-serif");
    // Keep the decimals the step needs: a 0.5-step bodyweight axis read "84 84 83 83".
    t.textContent = niceStep < 1 ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v);
    svg.appendChild(t);
  }

  // Goal line
  if (goal && goal.value != null) {
    const yv = yScale(goal.value);
    if (yv >= PAD.top - 5 && yv <= h - PAD.bottom + 5) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', PAD.left); line.setAttribute('x2', w - PAD.right);
      line.setAttribute('y1', yv); line.setAttribute('y2', yv);
      line.setAttribute('stroke', C_GOAL); line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '6 4');
      svg.appendChild(line);
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', w - PAD.right - 4); lbl.setAttribute('y', yv - 6);
      lbl.setAttribute('text-anchor', 'end');
      lbl.setAttribute('fill', C_GOAL); lbl.setAttribute('font-size', '11');
      lbl.setAttribute('font-weight', '700');
      lbl.setAttribute('font-family', "'Archivo', sans-serif");
      lbl.textContent = goal.label || ('Goal · ' + goal.value + unit);
      svg.appendChild(lbl);
    }
  }

  // X labels
  const labelStep = Math.max(1, Math.ceil(allDates.length / 7));
  for (let i = 0; i < allDates.length; i += labelStep) {
    const x = xScale(i);
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', h - PAD.bottom + 18);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', C_AXIS); t.setAttribute('font-size', '11');
    t.setAttribute('font-family', "'Archivo', sans-serif");
    const d = new Date(allDates[i]);
    t.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    svg.appendChild(t);
  }

  // Series
  series.forEach((s, sIdx) => {
    if (!s.data || !s.data.length) return;
    const byDate = {};
    s.data.forEach(d => { if (d.y != null) byDate[d.x] = d.y; });
    const points = [];
    allDates.forEach((dt, i) => {
      if (byDate[dt] != null) points.push({ x: xScale(i), y: yScale(byDate[dt]), value: byDate[dt], date: dt });
    });
    if (!points.length) return;

    const pathStr = smoothPath(points);

    if (area && !s.noArea) {
      const baseY = h - PAD.bottom;
      const areaPath = document.createElementNS(SVG_NS, 'path');
      const areaStr = pathStr + ' L ' + points[points.length - 1].x + ' ' + baseY +
                                ' L ' + points[0].x + ' ' + baseY + ' Z';
      areaPath.setAttribute('d', areaStr);
      areaPath.setAttribute('fill', 'url(#' + s._gradId + ')');
      svg.appendChild(areaPath);
    }

    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('d', pathStr);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', s.color);
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    line.style.filter = 'drop-shadow(0 0 5px ' + s.color + '66)';
    // animate
    const len = approxPathLength(points);
    line.setAttribute('stroke-dasharray', len);
    line.setAttribute('stroke-dashoffset', len);
    line.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.22, 0.8, 0.36, 1)';
    requestAnimationFrame(() => requestAnimationFrame(() => { line.style.strokeDashoffset = '0'; }));
    svg.appendChild(line);

    // One dot: the latest value. A marker on every point read as a spreadsheet
    // chart (the hover crosshair below still shows any point's value).
    points.forEach((p, pi) => {
      if (pi !== points.length - 1) return;
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
      c.setAttribute('r', pi === points.length - 1 ? 4.5 : 3.2);
      c.setAttribute('fill', s.color);
      c.setAttribute('stroke', C_DOT); c.setAttribute('stroke-width', '2');
      c.style.opacity = '0';
      c.style.transition = 'opacity 0.3s';
      const delay = 600 + (pi * 50);
      setTimeout(() => { c.style.opacity = '1'; }, delay);
      svg.appendChild(c);
    });
  });

  // Hover crosshair + tooltip
  const cross = document.createElementNS(SVG_NS, 'line');
  cross.setAttribute('y1', PAD.top); cross.setAttribute('y2', h - PAD.bottom);
  cross.setAttribute('stroke', C_CROSS); cross.setAttribute('stroke-width', '1');
  cross.setAttribute('stroke-dasharray', '3 3'); cross.setAttribute('opacity', '0');
  cross.style.pointerEvents = 'none';
  svg.appendChild(cross);

  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute; pointer-events:none; opacity:0; background:' + C_TIP_BG + '; border:1px solid ' + C_TIP_LINE + '; border-radius:8px; padding:10px 14px; box-shadow:0 12px 30px rgba(0,0,0,0.18); transition:opacity 0.12s; z-index:10; min-width:140px;';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative; width:100%;';
  wrap.appendChild(svg);
  wrap.appendChild(tooltip);
  container.appendChild(wrap);

  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (w / rect.width);
    if (px < PAD.left - 5 || px > w - PAD.right + 5) {
      cross.setAttribute('opacity', '0');
      tooltip.style.opacity = '0';
      return;
    }
    const ratio = (px - PAD.left) / innerW;
    const idx = Math.max(0, Math.min(allDates.length - 1, Math.round(ratio * (allDates.length - 1))));
    const date = allDates[idx];
    const xPos = xScale(idx);
    cross.setAttribute('x1', xPos); cross.setAttribute('x2', xPos);
    cross.setAttribute('opacity', '1');

    let html = '<div style="font-size:12px; color:' + C_TIP_TITLE + '; font-weight:650; margin-bottom:8px;">' +
               new Date(date).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) + '</div>';
    let any = false;
    series.forEach(s => {
      const d = s.data.find(x => x.x === date);
      if (d != null && d.y != null) {
        any = true;
        html += '<div style="display:flex; justify-content:space-between; gap:18px; align-items:center; padding:3px 0;">' +
                  '<span style="display:flex; align-items:center; gap:8px; font-size:13px;"><span style="width:8px; height:8px; border-radius:50%; background:' + s.color + ';"></span><span style="color:' + C_TIP_NAME + ';">' + s.name + '</span></span>' +
                  '<span style="font-family:var(--font-num); color:' + C_TIP_VAL + '; font-weight:700; font-variant-numeric: tabular-nums;">' + (Math.round(d.y * 10) / 10) + ' ' + unit + '</span>' +
                '</div>';
      }
    });
    if (!any) {
      cross.setAttribute('opacity', '0');
      tooltip.style.opacity = '0';
      return;
    }
    tooltip.innerHTML = html;
    // Position relative to wrap container (svg's parent)
    const svgRect = svg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const xInWrap = (xPos / w) * svgRect.width;
    const ttW = tooltip.offsetWidth || 180;
    let left = xInWrap + 14;
    if (left + ttW > svgRect.width) left = xInWrap - ttW - 14;
    tooltip.style.left = left + 'px';
    tooltip.style.top = '12px';
    tooltip.style.opacity = '1';
  });
  svg.addEventListener('mouseleave', () => {
    cross.setAttribute('opacity', '0');
    tooltip.style.opacity = '0';
  });
  // Touch: drag a finger along the line to read any day (iOS sends no
  // mousemove while a finger moves). Sideways drags scrub, up/down still scrolls,
  // and each new day under the finger gives a selection click.
  svg.style.touchAction = 'pan-y';
  let tx0 = 0, ty0 = 0, scrubbing = false, lastX = null;
  svg.addEventListener('touchstart', e => { if (e.touches.length !== 1) return; tx0 = e.touches[0].clientX; ty0 = e.touches[0].clientY; scrubbing = false; }, { passive: true });
  svg.addEventListener('touchmove', e => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (!scrubbing) {
      const ax = Math.abs(t.clientX - tx0), ay = Math.abs(t.clientY - ty0);
      if (ax < 6 || ax < ay) return;
      scrubbing = true;
    }
    e.preventDefault();
    svg.dispatchEvent(new MouseEvent('mousemove', { clientX: t.clientX, clientY: t.clientY }));
    const x = cross.getAttribute('x1');
    if (x !== lastX) { lastX = x; hapticTick(); }
  }, { passive: false });
  svg.addEventListener('touchend', () => {
    if (!scrubbing) return;
    scrubbing = false;
    setTimeout(() => { cross.setAttribute('opacity', '0'); tooltip.style.opacity = '0'; }, 1400);
  });
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
  if (points.length === 2) return 'M ' + points[0].x + ' ' + points[0].y + ' L ' + points[1].x + ' ' + points[1].y;
  let path = 'M ' + points[0].x + ' ' + points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ' C ' + cp1x + ' ' + cp1y + ', ' + cp2x + ' ' + cp2y + ', ' + p2.x + ' ' + p2.y;
  }
  return path;
}

function approxPathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    total += Math.sqrt(dx*dx + dy*dy);
  }
  return Math.ceil(total * 1.15);
}

function niceTickStep(rawStep) {
  if (!isFinite(rawStep) || rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const f = rawStep / Math.pow(10, exp);
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}

// =========================================================
// GOALS
// =========================================================
function getGoals(athleteId) {
  const s = Store.get();
  return s.goals.find(g => g.athleteId === athleteId) || null;
}

function setGoals(athleteId, patch) {
  Store.update(s => {
    let g = s.goals.find(g => g.athleteId === athleteId);
    if (!g) { g = { id: uid('goal'), athleteId, ...patch, updatedAt: Date.now() }; s.goals.push(g); }
    else { Object.assign(g, patch, { updatedAt: Date.now() }); }
  });
}

function bestE1RM(athleteId, lift) {
  const logs = Store.get().workoutLogs.filter(l => l.athleteId === athleteId && l.lift === lift);
  return logs.length ? Math.max(...logs.map(l => l.e1rmComp)) : 0;
}

function currentTotal(athleteId) {
  return ['squat', 'bench', 'deadlift'].reduce((sum, lift) => sum + bestE1RM(athleteId, lift), 0);
}

// Typical raw-powerlifting share of total, as midpoint + a typical band.
// Heuristic for spotting a lagging lift — not a rule; leverages vary it a lot.
const SBD_SPLIT = {
  squat:    { lo: 0.32, hi: 0.38 },
  bench:    { lo: 0.20, hi: 0.25 },
  deadlift: { lo: 0.39, hi: 0.45 }
};

// Pure: given three e1RMs (any single unit), return each lift's share of the
// total, a balanced/lagging/strong status vs SBD_SPLIT, and the weakest link.
function liftBalance(squat, bench, deadlift) {
  const vals = { squat, bench, deadlift };
  const total = squat + bench + deadlift;
  if (!(total > 0) || !(squat > 0) || !(bench > 0) || !(deadlift > 0)) return null;
  const rows = ['squat', 'bench', 'deadlift'].map(lift => {
    const share = vals[lift] / total;
    const ref = SBD_SPLIT[lift];
    let status = 'balanced';
    if (share < ref.lo) status = 'lagging';
    else if (share > ref.hi) status = 'strong';
    return { lift, value: vals[lift], share, lo: ref.lo, hi: ref.hi, status, gap: ref.lo - share };
  });
  let weakest = null;
  rows.forEach(r => { if (r.status === 'lagging' && (!weakest || r.gap > weakest.gap)) weakest = r; });
  return { total, rows, weakest };
}

function latestBodyweight(athleteId) {
  const bw = Store.get().bodyweight.filter(b => b.athleteId === athleteId).sort((a, b) => b.date.localeCompare(a.date));
  return bw[0]?.weight || null;
}

// ================= VOLUME LANDMARKS (weekly working sets) =================
// Evidence-informed weekly working-set ranges per movement pattern.
//   MEV — minimum effective volume (least that still drives progress)
//   MAV — the productive working range you live in most of a block
//   MRV — max recoverable volume (past this, fatigue outpaces recovery)
// A fatigue-management guide, NOT a prescription — individual recovery,
// intensity, and exercise selection move these a lot. Sets count off the log's
// own `lift` bucket (squat/bench/deadlift + push/pull/legs accessories), so no
// fuzzy name-matching; cardio/other never count.
const VOLUME_LANDMARKS = {
  squat:    { label: 'Squat',    mev: 8,  mav: 14, mrv: 20 },
  bench:    { label: 'Bench',    mev: 10, mav: 16, mrv: 22 },
  deadlift: { label: 'Deadlift', mev: 6,  mav: 10, mrv: 14 },
  push:     { label: 'Push',     mev: 8,  mav: 14, mrv: 22 },
  pull:     { label: 'Pull',     mev: 10, mav: 16, mrv: 25 },
  legs:     { label: 'Legs',     mev: 8,  mav: 14, mrv: 20 }
};
const VOLUME_BUCKET_ORDER = ['squat', 'bench', 'deadlift', 'push', 'pull', 'legs'];
const VOLUME_ZONE_LABEL = {
  none: 'Untrained', under: 'Below minimum', productive: 'Productive',
  high: 'Near the max', over: 'Over the max', unknown: ''
};

// Which landmark bucket a logged set counts toward (null = cardio/other/unknown).
function volumeBucketFor(log) {
  const lift = log && (log.lift || '').toLowerCase();
  return (lift && VOLUME_LANDMARKS[lift]) ? lift : null;
}

// Zone of a weekly set count against a bucket's landmarks.
function volumeZone(sets, lm) {
  if (!lm) return 'unknown';
  if (sets <= 0) return 'none';
  if (sets < lm.mev) return 'under';
  if (sets < lm.mav) return 'productive';
  if (sets <= lm.mrv) return 'high';
  return 'over';
}

// Pure: weekly working-set volume per movement bucket within [from, to)
// (ms timestamps). Counts every logged working set; `hardSets` = sets at
// RPE ≥ 7. Returns buckets in fixed order with landmark, zone, label and
// percent-of-MRV (for a progress bar). Independent of Store/DB — testable.
function weeklyVolumeLandmarks(logs, athleteId, from, to) {
  const out = VOLUME_BUCKET_ORDER.map(k => ({
    key: k, label: VOLUME_LANDMARKS[k].label, lm: VOLUME_LANDMARKS[k],
    sets: 0, hardSets: 0
  }));
  const idx = {};
  out.forEach(o => { idx[o.key] = o; });
  (logs || []).forEach(l => {
    if (!l || l.athleteId !== athleteId) return;
    const t = Date.parse(l.date);
    if (!(t >= from && t < to)) return;
    const b = volumeBucketFor(l);
    if (!b) return;
    idx[b].sets += 1;
    if (Number(l.rpe) >= 7) idx[b].hardSets += 1;
  });
  out.forEach(o => {
    o.zone = volumeZone(o.sets, o.lm);
    o.zoneLabel = VOLUME_ZONE_LABEL[o.zone] || '';
    o.pctOfMrv = o.lm.mrv ? Math.min(100, Math.round((o.sets / o.lm.mrv) * 100)) : 0;
  });
  return out;
}

// Deload suggestion — pure. Powerlifting blocks accumulate fatigue; after ~3
// consecutive weeks of RISING working-set tonnage at sustained high RPE with no
// down week, a deload banks that fatigue into strength. Returns a nudge ONLY when
// the pattern is unambiguous (never nags on noisy/thin data). Weeks are 7-day
// windows counting back from `now`; the current partial week (index 0) is
// EXCLUDED so an in-progress week can't fake a trend. Every completed week in the
// lookback must have logged sets — a gap → null (not enough continuous data).
// Returns { suggest, risingStreak, recentAvgRpe, weeks:[{tonnage,avgRpe,sets}], note } | null.
function deloadSignal(logs, athleteId, now, opts) {
  opts = opts || {};
  const lookback = opts.weeks || 3;   // completed weeks the pattern must span
  const rpeThresh = opts.rpe || 8;    // "high" recent average RPE
  const nowMs = now == null ? Date.now() : (typeof now === 'number' ? now : Date.parse(now));
  if (!isFinite(nowMs)) return null;
  const WEEK = 7 * 864e5;
  const buckets = {};
  (logs || []).forEach(l => {
    if (!l || l.athleteId !== athleteId) return;
    const t = Date.parse(l.date);
    if (!isFinite(t) || t > nowMs) return;
    const wi = Math.floor((nowMs - t) / WEEK);   // 0 = current partial week
    if (wi < 1 || wi > lookback) return;          // only completed weeks in range
    const w = Number(l.weight) || 0, reps = Number(l.reps) || 0, rpe = Number(l.rpe);
    const b = buckets[wi] || (buckets[wi] = { tonnage: 0, rpeSum: 0, rpeN: 0, sets: 0 });
    b.tonnage += w * reps;
    b.sets += 1;
    if (rpe > 0) { b.rpeSum += rpe; b.rpeN += 1; }
  });
  const weeks = [];
  for (let wi = lookback; wi >= 1; wi--) {         // oldest → newest
    const b = buckets[wi];
    if (!b || b.sets === 0) return null;           // gap = not enough continuous data
    weeks.push({ tonnage: b.tonnage, avgRpe: b.rpeN ? b.rpeSum / b.rpeN : 0, sets: b.sets });
  }
  let risingStreak = 1;
  for (let i = 1; i < weeks.length; i++) {
    if (weeks[i].tonnage > weeks[i - 1].tonnage) risingStreak++;
    else risingStreak = 1;
  }
  const recentAvgRpe = weeks[weeks.length - 1].avgRpe;
  const recentRounded = Math.round(recentAvgRpe * 10) / 10;
  const suggest = risingStreak >= lookback && recentAvgRpe >= rpeThresh;
  return {
    suggest,
    risingStreak,
    recentAvgRpe: recentRounded,
    weeks,
    note: suggest
      ? (lookback + ' weeks of rising load at RPE ' + recentRounded + '. A deload week could turn that fatigue into strength.')
      : ''
  };
}
window.deloadSignal = deloadSignal;

// Training achievements + weekly streak — pure. A distinct training DAY = a
// session. weekStreak = consecutive calendar weeks (UTC Mon–Sun) each with ≥1
// session, counting back from the current week; if the current week has no
// session yet the streak counts from last week (so Monday doesn't reset it).
// Returns { stats:{totalSessions, prCount, weekStreak}, badges:[{key,label,icon,earned}] }.
const ACHIEVEMENTS = [
  { key: 'first-session', label: 'First session', icon: '🎯', test: s => s.totalSessions >= 1 },
  { key: 'sessions-10',   label: '10 sessions',   icon: '💪', test: s => s.totalSessions >= 10 },
  { key: 'sessions-50',   label: '50 sessions',   icon: '🔥', test: s => s.totalSessions >= 50 },
  { key: 'sessions-100',  label: '100 sessions',  icon: '🏛️', test: s => s.totalSessions >= 100 },
  { key: 'first-pr',      label: 'First PR',       icon: '🏆', test: s => s.prCount >= 1 },
  { key: 'pr-10',         label: '10 PRs',         icon: '📈', test: s => s.prCount >= 10 },
  { key: 'streak-4',      label: '4-week streak',  icon: '⚡', test: s => s.weekStreak >= 4 },
  { key: 'streak-12',     label: '12-week streak', icon: '🗓️', test: s => s.weekStreak >= 12 }
];
function trainingAchievements(logs, athleteId, now) {
  const nowMs = now == null ? Date.now() : (typeof now === 'number' ? now : Date.parse(now));
  const DAY = 864e5, WEEK = 7 * DAY;
  const monKey = (ms) => { const d = new Date(ms); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - dow * DAY; };
  const days = new Set(), weeks = new Set();
  (logs || []).forEach(l => {
    if (!l || l.athleteId !== athleteId) return;
    const t = Date.parse(l.date);
    if (!isFinite(t)) return;
    days.add(new Date(t).toISOString().slice(0, 10));
    weeks.add(monKey(t));
  });
  let streak = 0;
  if (isFinite(nowMs)) {
    const curMon = monKey(nowMs);
    let wk = weeks.has(curMon) ? curMon : curMon - WEEK;
    while (weeks.has(wk)) { streak++; wk -= WEEK; }
  }
  const stats = { totalSessions: days.size, prCount: prTimeline(logs, athleteId).length, weekStreak: streak };
  const badges = ACHIEVEMENTS.map(a => ({ key: a.key, label: a.label, icon: a.icon, earned: !!a.test(stats) }));
  return { stats, badges };
}
window.trainingAchievements = trainingAchievements;

// ================= LEADERBOARD (opt-in public DOTS board) =================
// Pure: rank published board entries. Drops non-positive DOTS, sorts by DOTS desc
// then total desc (tiebreak), and assigns STANDARD competition ranks — ties share
// a rank and the next rank skips (1, 2, 2, 4). Never mutates the input array.
function rankLeaderboard(entries) {
  const rows = (entries || [])
    .filter(e => e && Number(e.dots) > 0)
    .map(e => Object.assign({}, e, { dots: Number(e.dots), totalKg: Number(e.totalKg) || 0 }))
    .sort((a, b) => (b.dots - a.dots) || (b.totalKg - a.totalKg));
  let lastDots = null, lastRank = 0;
  return rows.map((e, i) => {
    let rank;
    if (lastDots != null && e.dots === lastDots) { rank = lastRank; }
    else { rank = i + 1; lastRank = rank; lastDots = e.dots; }
    return Object.assign({}, e, { rank });
  });
}

// Pure: ranked entries → HTML string. opts: { highlightUserId, emptyHtml }.
// Top-3 get a medal class; the caller's own row is flagged. Weight class is
// derived from bodyweight + sex; total respects the viewer's unit pref.
function leaderboardRowsHtml(ranked, opts = {}) {
  const list = ranked || [];
  if (!list.length) {
    return opts.emptyHtml ||
      '<div class="lb-empty dim">No lifters on the board yet. Be the first to publish.</div>';
  }
  return list.map(e => {
    const me = opts.highlightUserId && e.userId === opts.highlightUserId;
    const medal = e.rank <= 3 ? ' lb-medal lb-medal-' + e.rank : '';
    const cls = e.sex ? weightClassFor(e.bodyweightKg, e.sex) : null;
    const sexBadge = e.sex
      ? '<span class="lb-sex lb-sex-' + e.sex + '">' + (e.sex === 'female' ? 'F' : 'M') + '</span>' : '';
    const flag = e.countryCode ? '<span class="lb-flag">' + flagEmoji(e.countryCode) + '</span>' : '';
    const meetBadge = e.basis === 'meet'
      ? '<span class="lb-meet" title="From a logged meet total">MEET</span>' : '';
    const youTag = me ? '<span class="lb-you">YOU</span>' : '';
    return '<div class="lb-row' + medal + (me ? ' lb-me' : '') + '" data-rank="' + e.rank + '">' +
        '<span class="lb-rank mono">' + e.rank + '</span>' +
        '<span class="lb-id">' +
          '<span class="lb-name">' + escHtml(e.displayName || 'Lifter') + '</span>' +
          sexBadge + meetBadge + youTag +
        '</span>' +
        '<span class="lb-cls mono">' + (cls || '–') + flag + '</span>' +
        '<span class="lb-total mono">' + formatWeight(e.totalKg, 0) + '</span>' +
        '<span class="lb-dots mono">' + (Math.round(e.dots * 10) / 10).toFixed(1) + '</span>' +
      '</div>';
  }).join('');
}

// A believable demo board so the ?demo=1 showcase + signed-out preview render.
// DOTS is computed from each total+bw+sex so the numbers are internally honest.
function demoLeaderboard() {
  const seed = [
    { userId: 'lb_a', displayName: 'Priya Nair',      sex: 'female', bodyweightKg: 63, totalKg: 467.5, basis: 'meet', countryCode: 'IN' },
    { userId: 'lb_b', displayName: 'Marcus Okonkwo',  sex: 'male',   bodyweightKg: 92, totalKg: 832.5, basis: 'meet', countryCode: 'GB' },
    { userId: 'lb_c', displayName: 'Sofia Almeida',   sex: 'female', bodyweightKg: 57, totalKg: 412.5, basis: 'gym',  countryCode: 'BR' },
    { userId: 'lb_d', displayName: 'Kenji Tanaka',    sex: 'male',   bodyweightKg: 74, totalKg: 705,   basis: 'gym',  countryCode: 'JP' },
    { userId: 'DEMO_ME', displayName: 'You (demo)',   sex: 'male',   bodyweightKg: 83, totalKg: 600,   basis: 'gym',  countryCode: null },
    { userId: 'lb_e', displayName: 'Lena Fischer',    sex: 'female', bodyweightKg: 69, totalKg: 445,   basis: 'gym',  countryCode: 'DE' },
    { userId: 'lb_f', displayName: 'Diego Ramirez',   sex: 'male',   bodyweightKg: 83, totalKg: 580,   basis: 'meet', countryCode: 'MX' },
    { userId: 'lb_g', displayName: 'Amara Diallo',    sex: 'female', bodyweightKg: 76, totalKg: 397.5, basis: 'gym',  countryCode: 'SN' }
  ];
  return seed.map(e => Object.assign({}, e, {
    dots: dotsScore(e.totalKg, e.bodyweightKg, e.sex), updatedAt: Date.now()
  }));
}

// Async: fetch (or demo-seed) → rank → render into a container. opts:
//   { sex, limit, highlightUserId, demo }. Safe to call on any page.
async function renderLeaderboard(container, opts = {}) {
  if (!container) return;
  const sex = (opts.sex === 'male' || opts.sex === 'female') ? opts.sex : null;
  const limit = opts.limit || 100;
  let entries;
  if (window._demoMode || opts.demo) {
    entries = demoLeaderboard().filter(e => !sex || e.sex === sex);
  } else {
    try { entries = await DB.listLeaderboard({ sex, limit }); }
    catch (e) { console.warn('renderLeaderboard', e); entries = []; }
  }
  const ranked = rankLeaderboard(entries).slice(0, limit);
  container.innerHTML = leaderboardRowsHtml(ranked, { highlightUserId: opts.highlightUserId });
  return ranked;
}

// Build the caller's OWN board row from data they already own, or null if they
// don't have enough to be ranked (need a bodyweight AND a positive total → DOTS).
function computeMyLeaderboardEntry() {
  const u = window._user;
  if (!u || !u.id) return null;
  const bw = latestBodyweight(u.id);
  const total = currentTotal(u.id);
  const sex = getSexPref();
  if (!bw || !(total > 0)) return null;
  const dots = dotsScore(total, bw, sex);
  if (!(dots > 0)) return null;
  return {
    userId: u.id,
    displayName: u.name || 'Lifter',
    sex,
    bodyweightKg: Math.round(bw * 10) / 10,
    totalKg: Math.round(total * 10) / 10,
    dots,
    basis: 'gym',
    countryCode: u.countryCode || null
  };
}

// Reflect current membership onto an opt-in button (label + data-on + class).
async function refreshLeaderboardButton(btn) {
  if (!btn) return;
  const u = window._user;
  let on = false;
  if (window._demoMode) on = !!window._demoOnBoard;
  else if (u && u.id) { try { on = !!(await DB.myLeaderboardEntry(u.id)); } catch (e) {} }
  btn.setAttribute('data-on', on ? '1' : '0');
  btn.textContent = on ? 'On the leaderboard: tap to leave' : 'Publish to leaderboard';
  btn.classList.toggle('is-on', on);
}

// Toggle the caller's board membership. Publishing writes their denormalised row;
// leaving deletes it. Demo-safe (flips a local flag, never touches the network).
async function toggleLeaderboard(btn) {
  const entry = computeMyLeaderboardEntry();
  if (!entry) { toast('Log a weigh-in and your big three first'); return; }
  const on = btn && btn.getAttribute('data-on') === '1';
  if (window._demoMode) {
    window._demoOnBoard = !on;
    toast(on ? 'Removed from the leaderboard' : 'Published: you’re on the board');
    refreshLeaderboardButton(btn);
    return;
  }
  try {
    if (on) { await DB.removeLeaderboardEntry(entry.userId); toast('Removed from the leaderboard'); }
    else { await DB.upsertLeaderboardEntry(entry); toast('Published: you’re on the board'); }
  } catch (e) { console.error('leaderboard toggle', e); toast('Could not update the leaderboard'); return; }
  refreshLeaderboardButton(btn);
}
window.renderLeaderboard = renderLeaderboard;
window.toggleLeaderboard = toggleLeaderboard;

// Pure head-to-head: given two athletes' stat blocks, return comparison rows for
// a "tale of the tape" coach view. Each input: { squat, bench, deadlift, total?, bw? }
// (kg; bw nullable). Total is derived from S+B+D when omitted. Pound-for-pound
// (total ÷ bw) is the great equalizer — a lighter lifter can out-rank a heavier
// one. Bodyweight itself is shown but neutral (no "winner"). Rows carry the
// leader ('a' | 'b' | 'tie' | 'none') and absolute diff so the UI just renders.
function compareMetricRows(A, B) {
  A = A || {}; B = B || {};
  const total = (o) => o.total != null ? o.total : (o.squat || 0) + (o.bench || 0) + (o.deadlift || 0);
  const tA = total(A), tB = total(B);
  const p4p = (t, bw) => (t && bw) ? t / bw : null;
  function row(key, label, a, b, mode, decimals) {
    let leader = 'none';
    if (mode === 'high' && a != null && b != null) leader = a > b ? 'a' : (b > a ? 'b' : 'tie');
    const diff = (a != null && b != null) ? Math.abs(a - b) : null;
    return { key, label, a, b, mode, leader, diff, decimals: decimals || 0 };
  }
  return [
    row('squat', 'Squat e1RM', A.squat || 0, B.squat || 0, 'high'),
    row('bench', 'Bench e1RM', A.bench || 0, B.bench || 0, 'high'),
    row('deadlift', 'Deadlift e1RM', A.deadlift || 0, B.deadlift || 0, 'high'),
    row('total', 'Total', tA, tB, 'high'),
    row('bw', 'Bodyweight', A.bw || null, B.bw || null, 'neutral', 1),
    row('p4p', 'Pound-for-pound', p4p(tA, A.bw), p4p(tB, B.bw), 'high', 2)
  ];
}
if (typeof window !== 'undefined') { window.compareMetricRows = compareMetricRows; }

// Returns 0..100. Direction-aware for bw. Optional `start` (the first logged
// weigh-in) turns cut/gain into a true start→goal fraction instead of a rough
// ratio. Backward-compatible: omit `start` and the old approximation stands, so
// the three existing 3-arg callers keep working unchanged.
function goalProgressPct(current, goal, direction, start) {
  if (!goal || goal <= 0) return 0;
  if (direction === 'cut') {
    if (current <= goal) return 100;
    // goal < starting weight; fraction of the journey already covered.
    if (start != null && start > goal) {
      return Math.max(0, Math.min(100, Math.round(((start - current) / (start - goal)) * 100)));
    }
    return Math.max(0, Math.round((goal / current) * 100));
  }
  if (direction === 'gain') {
    if (current >= goal) return 100;
    if (start != null && start < goal) {
      return Math.max(0, Math.min(100, Math.round(((current - start) / (goal - start)) * 100)));
    }
    return Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
  }
  // strength goals (always increasing)
  return Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
}

// Least-squares slope of ys over xs → units-of-y per unit-of-x (or null).
function linregSlope(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx; num += dx * (ys[i] - my); den += dx * dx; }
  if (den === 0) return null;
  return num / den;
}

// e1RM trend — pure. Least-squares slope of a lift's best-per-day competition
// e1RM over the last `windowDays` (default 56 = 8 weeks), returned in kg/WEEK
// (+ = rising). null if fewer than 2 distinct training days in the window.
// Reuses the shared linregSlope. Safe text-readout companion to the e1RM chart.
function e1rmTrend(logs, athleteId, lift, now, windowDays) {
  windowDays = windowDays || 56;
  const nowMs = now == null ? Date.now() : (typeof now === 'number' ? now : Date.parse(now));
  if (!isFinite(nowMs)) return null;
  const DAY = 864e5;
  const from = nowMs - windowDays * DAY;
  const byDate = {};
  (logs || []).forEach(l => {
    if (!l || l.athleteId !== athleteId || l.lift !== lift) return;
    const t = Date.parse(l.date);
    if (!isFinite(t) || t < from || t > nowMs) return;
    const e = Number(l.e1rmComp);
    if (!(e > 0)) return;
    const k = new Date(t).toISOString().slice(0, 10);
    if (byDate[k] == null || e > byDate[k]) byDate[k] = e;
  });
  const keys = Object.keys(byDate).sort();
  if (keys.length < 2) return null;
  const perDay = linregSlope(keys.map(k => Date.parse(k) / DAY), keys.map(k => byDate[k]));
  if (perDay == null) return null;
  return Math.round(perDay * 7 * 10) / 10; // kg/week
}
window.e1rmTrend = e1rmTrend;

const DAY_MS = 86400000;

// Cut / bulk analytics over a bodyweight series. Pure + unit-agnostic: feed it
// raw store kg and it returns kg-based rates; the caller converts for display.
//   series    [{date:'YYYY-MM-DD', weight:Number}, ...] ascending by date
//   goalKg    target weight (may be null)
//   direction 'cut' | 'gain' | 'maintain'
// → { trend, slopePerWeek, smoothedCurrent, start, remaining, etaWeeks,
//     pctPerWeek, pace:{tone,text} }   (fields null when not computable)
function bwCutBulkStats(series, goalKg, direction) {
  const out = { trend: [], slopePerWeek: null, smoothedCurrent: null, start: null,
                remaining: null, etaWeeks: null, pctPerWeek: null, pace: null };
  if (!series || !series.length) return out;
  out.start = series[0].weight;

  // 7-day trailing moving average — smooths daily water-weight noise. Window is
  // by date (not index) so irregular logging cadence stays honest.
  out.trend = series.map((pt, i) => {
    const t = Date.parse(pt.date);
    let sum = 0, n = 0;
    for (let j = i; j >= 0; j--) {
      if (t - Date.parse(series[j].date) <= 7 * DAY_MS) { sum += series[j].weight; n++; }
      else break;
    }
    return { date: pt.date, weight: sum / n };
  });
  out.smoothedCurrent = out.trend[out.trend.length - 1].weight;

  // Rate of change: least-squares over the last 28 days (need ≥2 points), else
  // fall back to the whole series.
  const lastT = Date.parse(series[series.length - 1].date);
  let win = series.filter(p => lastT - Date.parse(p.date) <= 28 * DAY_MS);
  if (win.length < 2) win = series.slice();
  if (win.length >= 2) {
    const perDay = linregSlope(win.map(p => Date.parse(p.date) / DAY_MS), win.map(p => p.weight));
    if (perDay != null) out.slopePerWeek = perDay * 7;
  }

  if (goalKg && goalKg > 0 && direction && direction !== 'maintain') {
    const cur = out.smoothedCurrent;
    out.remaining = direction === 'cut' ? cur - goalKg : goalKg - cur; // >0 = still to go
    if (out.slopePerWeek != null) {
      const toward = direction === 'cut' ? -out.slopePerWeek : out.slopePerWeek; // >0 = right way
      if (out.remaining <= 0) out.etaWeeks = 0;
      else if (toward > 0.02) out.etaWeeks = out.remaining / toward;
    }
  }

  if (out.slopePerWeek != null && out.smoothedCurrent) {
    out.pctPerWeek = out.slopePerWeek / out.smoothedCurrent * 100; // signed
    out.pace = bwPace(out.slopePerWeek, out.smoothedCurrent, direction);
  }
  return out;
}

// Powerlifting-appropriate pace read. kg/week in → tone + one-liner out.
// Cut sweet spot ≈ 0.5–1.0 %BW/week (strength-sparing); lean bulk ≈ 0.2–0.5 kg/week.
function bwPace(slopeKgWk, curKg, direction) {
  const pctWk = slopeKgWk / curKg * 100; // signed %BW/week
  if (direction === 'cut') {
    if (slopeKgWk > 0.05) return { tone: 'away', text: 'trending up: not cutting' };
    const loss = -pctWk; // %/wk lost
    if (loss < 0.2) return { tone: 'flat', text: 'holding steady' };
    if (loss < 0.5) return { tone: 'slow', text: 'gentle cut: strength-sparing' };
    if (loss <= 1.2) return { tone: 'good', text: 'solid cut pace' };
    return { tone: 'fast', text: 'aggressive: strength may suffer' };
  }
  if (direction === 'gain') {
    if (slopeKgWk < -0.05) return { tone: 'away', text: 'trending down: not gaining' };
    if (slopeKgWk < 0.05) return { tone: 'flat', text: 'holding steady' };
    if (slopeKgWk < 0.2) return { tone: 'slow', text: 'slow gain: near recomp' };
    if (slopeKgWk <= 0.6) return { tone: 'good', text: 'lean bulk pace' };
    return { tone: 'fast', text: 'fast: expect more fat gain' };
  }
  // maintain
  if (Math.abs(pctWk) < 0.25) return { tone: 'good', text: 'steady: holding weight' };
  return { tone: 'slow', text: 'drifting ' + (slopeKgWk > 0 ? 'up' : 'down') };
}

// =========================================================
// SEED DEMO DATA — DEPRECATED (data now lives in Supabase)
// =========================================================
function seedDemoIfEmpty() { /* no-op — Supabase is the source of truth */ }

// =========================================================
// STAT COUNT-UP — big dashboard numbers tick up when they
// scroll into view. Self-wiring: observes existing + future
// .stat-value nodes, animates each once. Reduced-motion safe.
// =========================================================
function _countUpEl(valEl) {
  const unitSpan = valEl.querySelector('.unit, small');
  const unitHTML = unitSpan ? unitSpan.outerHTML : '';
  // Read ONLY the number, excluding the .unit span — the unit text can itself
  // contain digits (e.g. "of 4"), which would otherwise be parsed into the
  // target ("1 of 4" → 14). The number is the leading text before the unit.
  let numText = '';
  if (unitSpan) {
    for (const node of valEl.childNodes) {
      if (node === unitSpan) break;
      numText += node.textContent || '';
    }
  } else {
    numText = valEl.textContent || '';
  }
  // Split into a non-numeric prefix (e.g. "$"), the numeric core (with optional
  // thousands separators + decimals), and a trailing suffix (e.g. "%", "kg").
  // Preserving all three means money and unit-bearing values count up WITHOUT
  // losing their symbol or precision — "$1,234.56" stays "$1,234.56", not
  // "1234.6". Faithful to the source format frame by frame.
  const m = numText.trim().match(/^(\D*?)(-?[\d,]*\.?\d+)(\D*)$/);
  if (!m) return;
  const prefix = m[1], coreRaw = m[2], suffix = m[3];
  const core = coreRaw.replace(/,/g, '');
  const target = parseFloat(core);
  if (!isFinite(target) || target === 0) return;
  const dotIdx = core.indexOf('.');
  const decimals = dotIdx === -1 ? 0 : (core.length - dotIdx - 1);
  const grouped = coreRaw.indexOf(',') !== -1;
  const fmt = (n) => prefix + (grouped
    ? n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : n.toFixed(decimals)) + suffix;
  const dur = 950;
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
    valEl.innerHTML = fmt(target * eased) + unitHTML;
    if (t < 1) requestAnimationFrame(frame);
    else valEl.innerHTML = fmt(target) + unitHTML;
  }
  requestAnimationFrame(frame);
}

function _initStatCountUp() {
  if (typeof IntersectionObserver === 'undefined') return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      // Inside the app, numbers count up as their screen opens, not on every re-render.
      if (document.body.classList.contains('powa-app') && !document.body.classList.contains('screen-enter')) return;
      _countUpEl(en.target);
    });
  }, { threshold: 0.45 });
  const scan = () => {
    document.querySelectorAll('.stat-value, body.powa-app .ui-num-xl, body.powa-app .ui-stat b').forEach((e) => {
      if (e.__cuSeen) return;
      e.__cuSeen = true;
      io.observe(e);
    });
  };
  scan();
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initStatCountUp);
} else {
  _initStatCountUp();
}

/* Removed legacy seed function. Kept structure for reference:
function _legacy_seedDemo() {
  const s = {};
  return;

  const coach = {
    id: uid('coach'),
    name: 'Demo Coach',
    email: 'demo@coach.com',
    pwd: hashPwd('demo'),
    bio: 'IPF certified powerlifting coach. 10+ years experience. Specializes in raw classic powerlifting and RPE-based programming.',
    createdAt: Date.now()
  };
  s.coaches.push(coach);

  const athlete = {
    id: uid('athlete'),
    name: 'Demo Lifter',
    email: 'demo@lifter.com',
    pwd: hashPwd('demo'),
    coachId: coach.id,
    createdAt: Date.now()
  };
  s.athletes.push(athlete);

  const program = {
    id: uid('prog'),
    athleteId: athlete.id,
    coachId: coach.id,
    name: 'Hypertrophy Block',
    weeks: [
      {
        id: uid('wk'), number: 1, days: [
          {
            id: uid('day'), name: 'Squat Day', exercises: [
              { id: uid('ex'), lift: 'squat', variant: 'Competition', exerciseName: '', note: 'Slow controlled descent. Stay tight at the bottom.', sets: [
                  { id: uid('set'), weight: 140, reps: 5, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 140, reps: 5, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 140, reps: 5, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'squat', variant: 'Paused', exerciseName: '', note: '2-second pause at the bottom.', sets: [
                  { id: uid('set'), weight: 110, reps: 4, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 110, reps: 4, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'legs', variant: '', exerciseName: 'Leg Curls', note: '', sets: [
                  { id: uid('set'), weight: 30, reps: 12, rpe: 8, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 30, reps: 12, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]}
            ]
          },
          {
            id: uid('day'), name: 'Bench Day', exercises: [
              { id: uid('ex'), lift: 'bench', variant: 'Competition', exerciseName: '', note: 'Touch and pause for 1s.', sets: [
                  { id: uid('set'), weight: 95, reps: 5, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 95, reps: 5, rpe: 8, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 95, reps: 5, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'bench', variant: 'Close Grip', exerciseName: '', note: '', sets: [
                  { id: uid('set'), weight: 80, reps: 6, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'push', variant: '', exerciseName: 'Tricep Pushdown', note: '', sets: [
                  { id: uid('set'), weight: 25, reps: 15, rpe: 9, completed: false, actualRpe: null, completedAt: null }
              ]}
            ]
          },
          {
            id: uid('day'), name: 'Deadlift Day', exercises: [
              { id: uid('ex'), lift: 'deadlift', variant: 'Competition', exerciseName: '', note: 'Reset between reps. No bouncing.', sets: [
                  { id: uid('set'), weight: 180, reps: 3, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 180, reps: 3, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'deadlift', variant: 'Deficit', exerciseName: '', note: 'Stand on a 2.5kg plate.', sets: [
                  { id: uid('set'), weight: 150, reps: 5, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]}
            ]
          }
        ]
      }
    ]
  };
  s.programs.push(program);

  // Historical logs for chart drama
  const today = new Date();
  const histDates = [];
  for (let i = 28; i >= 0; i -= 4) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    histDates.push(d.toISOString().slice(0, 10));
  }
  let baseSquat = 130, baseBench = 85, baseDead = 165;
  histDates.forEach((d, i) => {
    s.workoutLogs.push({ id: uid('log'), athleteId: athlete.id, lift: 'squat', variant: 'Competition', exerciseName: '', weight: baseSquat + i * 3.5, reps: 5, rpe: 8,
      e1rm: calcE1RM(baseSquat + i * 3.5, 5, 8), e1rmComp: calcCompE1RM(baseSquat + i * 3.5, 5, 8, 'squat', 'Competition'), date: d });
    s.workoutLogs.push({ id: uid('log'), athleteId: athlete.id, lift: 'bench', variant: 'Competition', exerciseName: '', weight: baseBench + i * 1.5, reps: 5, rpe: 8,
      e1rm: calcE1RM(baseBench + i * 1.5, 5, 8), e1rmComp: calcCompE1RM(baseBench + i * 1.5, 5, 8, 'bench', 'Competition'), date: d });
    s.workoutLogs.push({ id: uid('log'), athleteId: athlete.id, lift: 'deadlift', variant: 'Competition', exerciseName: '', weight: baseDead + i * 4, reps: 3, rpe: 8,
      e1rm: calcE1RM(baseDead + i * 4, 3, 8), e1rmComp: calcCompE1RM(baseDead + i * 4, 3, 8, 'deadlift', 'Competition'), date: d });
    s.bodyweight.push({ id: uid('bw'), athleteId: athlete.id, date: d, weight: 82 + Math.sin(i / 3) * 0.6, unit: 'kg' });
  });

}
*/

// =========================================================
// YOU — the profile hub (both dashboards).
// One screen for everything that isn't the day's work: who you are, your three
// headline numbers, and grouped rows into every secondary screen (bodyweight,
// library, settings, units, log out…). It's what lets the bottom bar stay at five
// real destinations, and it takes units + log out off the top bar.
// model = { name, avatarUrl, sub, stats:[{label,value,unit}], action:{label,onClick},
//           groups:[{ title, rows:[{ label, value, onClick, tone, id }] }] }
// =========================================================
const _YOU_CHEV = '<svg class="yr-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
// Settings-style icon tiles for the YOU rows: each destination gets a glyph and a
// colour, so the list reads at a glance instead of as a wall of grey labels.
const _YI = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const YOU_ROW_META = {
  'Full program':        { tint: 'sky',    icon: () => ICONS.program },
  'Bodyweight':          { tint: 'teal',   icon: () => ICONS.scale },
  'Goals':               { tint: 'gold',   icon: () => _YI('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>') },
  'Rest timer':          { tint: 'orange', icon: () => _YI('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.4 2"/><path d="M9.5 2.5h5"/><path d="M12 2.5V6"/>') },
  'Year in lifting':     { tint: 'gold',   icon: () => _YI('<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z"/>') },
  'Rest and sets':       { tint: 'orange', icon: () => _YI('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.4 2"/><path d="M9.5 2.5h5"/><path d="M12 2.5V6"/>') },
  'My library':          { tint: 'iris',   icon: () => _YI('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5z"/><path d="M8 7h7"/>') },
  'Browse programs':     { tint: 'orange', icon: () => _YI('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>') },
  'Leaderboard':         { tint: 'gold',   icon: () => _YI('<path d="M8 21V11h8v10"/><path d="M3 21v-6h5"/><path d="M16 21v-8h5v8"/><path d="M2 21h20"/>') },
  'Find a coach':        { tint: 'green',  icon: () => ICONS.athletes },
  'Refer a lifter':      { tint: 'pink',   icon: () => _YI('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13"/><path d="M3 12h18"/><path d="M12 8c-2-4-6-4-6-1.5S10 8 12 8zM12 8c2-4 6-4 6-1.5S14 8 12 8z"/>') },
  'Ask AI':              { tint: 'iris',   icon: () => _YI('<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>') },
  'Settings':            { tint: 'gray',   icon: () => _YI('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>') },
  'Units':               { tint: 'sky',    icon: () => ICONS.weight },
  'Replay the tour':     { tint: 'gray',   icon: () => _YI('<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z"/>') },
  'Lifting words, explained': { tint: 'sky', icon: () => _YI('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2.5z"/><path d="M9 8h6M9 12h4"/>') },
  'Log out':             { tint: 'red',    icon: () => ICONS.logout },
  'Athlete progress':    { tint: 'sky',    icon: () => ICONS.chart },
  'Templates':           { tint: 'iris',   icon: () => ICONS.copy },
  'Marketplace listings':{ tint: 'orange', icon: () => _YI('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>') },
  'Invite an athlete':   { tint: 'green',  icon: () => _YI('<path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>') },
  'Profile':             { tint: 'gray',   icon: () => _YI('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>') },
  'Notifications':       { tint: 'red',    icon: () => _YI('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>') },
  'Security':            { tint: 'green',  icon: () => _YI('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>') },
  'Plan & billing':      { tint: 'iris',   icon: () => _YI('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>') },
  'Your data':           { tint: 'sky',    icon: () => _YI('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>') }
};

function renderYouHub(container, model) {
  if (!container) return;
  container.innerHTML = '';
  // Who you are, in the screen's hue: avatar, name, the three numbers that
  // matter, and the one thing worth doing from here.
  const hero = el('div', { class: 'ui-hero you-hero' });
  const head = el('div', { class: 'you-head' });
  const av = el(model.onAvatar ? 'button' : 'div', { class: 'you-av' + (model.onAvatar ? ' is-tap' : '') });
  if (model.onAvatar) { av.setAttribute('type', 'button'); av.setAttribute('aria-label', 'Change profile photo'); av.addEventListener('click', model.onAvatar); }
  if (model.avatarUrl) av.innerHTML = '<img src="' + escHtml(model.avatarUrl) + '" alt="">';
  else { av.textContent = initials(model.name || ''); av.setAttribute('data-name', model.name || ''); }
  if (model.onAvatar) av.appendChild(el('span', { class: 'you-av-cam', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>' }));
  head.appendChild(av);
  const id = el('div', { class: 'you-id' });
  id.appendChild(el('h2', {}, model.name || 'You'));
  if (model.sub) id.appendChild(el('div', { class: 'you-sub' }, model.sub));
  const igc = uiSocialChips(model);   // Instagram + TikTok, whichever they have
  if (igc) id.appendChild(igc);
  head.appendChild(id);
  hero.appendChild(head);
  if (model.stats && model.stats.length) {
    const st = el('div', { class: 'rh-stats you-stats-v3' });
    model.stats.forEach(s => {
      const c = el('div', { class: 'rh-stat' });
      c.appendChild(el('b', { html: escHtml(String(s.value)) + (s.unit ? '<small>' + escHtml(s.unit) + '</small>' : '') }));
      c.appendChild(el('span', {}, s.label));
      st.appendChild(c);
    });
    hero.appendChild(st);
  }
  if (model.action || model.edit) {
    const acts = el('div', { class: 'you-actions' });
    if (model.edit) {
      const e = el('button', { class: 'ui-btn-soft you-action', type: 'button' }, 'Edit profile');
      e.addEventListener('click', model.edit);
      acts.appendChild(e);
    }
    if (model.action) {
      const a = el('button', { class: 'ui-btn-soft you-action', type: 'button' }, model.action.label);
      a.addEventListener('click', model.action.onClick);
      acts.appendChild(a);
    }
    hero.appendChild(acts);
  }
  container.appendChild(hero);
  if (model.afterHero) container.appendChild(model.afterHero);

  (model.groups || []).forEach(g => {
    const rows = (g.rows || []).filter(Boolean);
    if (!rows.length) return;
    const grp = el('div', { class: 'you-group' + (g.title ? '' : ' no-title') });
    if (g.title) grp.appendChild(el('div', { class: 'yg-title' }, g.title));
    const list = el('div', { class: 'yg-list ui-list' });
    rows.forEach(r => {
      const row = el('button', { class: 'you-row' + (r.tone ? ' tone-' + r.tone : ''), type: 'button' });
      if (r.id) row.id = r.id;
      const meta = r.icon ? { tint: r.tint || 'gray', icon: () => r.icon } : YOU_ROW_META[r.label];
      if (meta) row.appendChild(el('span', { class: 'yr-ic t-' + meta.tint, html: meta.icon() || '' }));
      row.appendChild(el('span', { class: 'yr-label' }, r.label));
      const v = el('span', { class: 'yr-value' }, r.value == null ? '' : String(r.value));
      row.appendChild(v);
      if (r.tone !== 'plain') row.insertAdjacentHTML('beforeend', _YOU_CHEV);
      row.addEventListener('click', () => r.onClick && r.onClick(row, v));
      list.appendChild(row);
    });
    grp.appendChild(list);
    container.appendChild(grp);
  });
}
window.renderYouHub = renderYouHub;

// Open the AI assistant from anywhere (the floating launcher is hidden in the app,
// where it covered the set checkboxes — the top bar + YOU carry the entry instead).
function openAIAssistant() {
  const l = document.querySelector('.ai-launcher');
  if (l) l.click(); else toast('Assistant is still loading. Try again in a second');
}
window.openAIAssistant = openAIAssistant;

// Lift colours for charts + legends — the same identity colours the app uses
// everywhere (styles.css --lift-*): squat cyan, bench iris, deadlift gold. Red
// stays the action colour, so no lift is red. Light theme gets deeper shades so
// every line holds 3:1 against a white card.
function liftColors() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return light
    ? { squat: '#0a86c9', bench: '#6a4fe0', deadlift: '#a86f00', line: '#0f8f7d' }
    : { squat: '#38c6ff', bench: '#a98bff', deadlift: '#ffbf3c', line: '#2fe0c2' };
}
window.liftColors = liftColors;

// =========================================================
// SMART REST (2026-10-16). The owner asked why the timer was "stuck at 3 mins":
// it was a flat 180 s after every main-lift set and 90 s after everything else.
// Now the rest follows the set. Fewer reps (heavier) and higher RPE (harder) earn
// longer, deadlifts a touch more, accessories less. A coach-prescribed rest on
// the exercise (restSec) wins outright; the lifter's preference (Short /
// Standard / Long) scales the smart value. Pure: unit-tested in tests.html.
// =========================================================
const REST_PREFS = { short: 0.75, standard: 1, long: 1.3 };
const REST_PREF_LABEL = { short: 'Short', standard: 'Standard', long: 'Long' };
function getRestPref() {
  let v = null; try { v = localStorage.getItem('powa-rest-pref'); } catch (e) {}
  return REST_PREFS[v] ? v : 'standard';
}
function setRestPref(v) { try { localStorage.setItem('powa-rest-pref', REST_PREFS[v] ? v : 'standard'); } catch (e) {} }
function getRestAuto() { try { return localStorage.getItem('powa-rest-auto') !== '0'; } catch (e) { return true; } }
function setRestAuto(on) { try { localStorage.setItem('powa-rest-auto', on ? '1' : '0'); } catch (e) {} }

// opts: { lift, reps, rpe, restSec (coach override, seconds), pref }
function smartRestSeconds(opts) {
  opts = opts || {};
  const fixed = Number(opts.restSec);
  if (fixed > 0) return Math.max(15, Math.min(600, Math.round(fixed / 15) * 15));
  const main = opts.lift === 'squat' || opts.lift === 'bench' || opts.lift === 'deadlift';
  const reps = Math.max(1, Number(opts.reps) || (main ? 5 : 10));
  const rpe = Number(opts.rpe) || 0;
  let s = main ? (reps <= 3 ? 210 : reps <= 6 ? 180 : 150)
               : (reps <= 6 ? 120 : reps <= 12 ? 90 : 60);
  if (rpe >= 9.5) s += main ? 60 : 30;
  else if (rpe >= 9) s += 30;
  else if (rpe > 0 && rpe <= 7) s -= main ? 30 : 15;
  if (opts.lift === 'deadlift' && reps <= 5) s += 30;
  s *= REST_PREFS[opts.pref] || 1;
  const lo = main ? 90 : 45, hi = main ? 360 : 240;
  return Math.max(lo, Math.min(hi, Math.round(s / 15) * 15));
}
function fmtClock(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

// iOS-style switch. Returns the <label>; read/write state on .input.
function uiSwitch(checked, onChange, ariaLabel) {
  const wrap = el('label', { class: 'ui-switch' });
  const input = el('input', { type: 'checkbox', role: 'switch', 'aria-label': ariaLabel || '' });
  input.checked = !!checked;
  input.addEventListener('change', () => { hapticTick(); if (onChange) onChange(input.checked); });
  wrap.appendChild(input);
  wrap.appendChild(el('span', { class: 'ui-switch-track', 'aria-hidden': 'true' }, el('span', { class: 'ui-switch-knob' })));
  wrap.input = input;
  return wrap;
}

// iOS can deliver a late synthetic click from the tap that OPENED a sheet; it then
// lands on whatever row of the new sheet sits under the finger. Like a native
// sheet, ignore clicks while it's still presenting.
function _sheetSwallowEarlyClicks(veil) {
  const openedAt = Date.now();
  veil.addEventListener('click', (e) => {
    if (Date.now() - openedAt < 400) { e.stopPropagation(); e.preventDefault(); }
  }, true);
}

// A bottom sheet with arbitrary content (uiActionSheet is the menu version).
// build(sheet, close) fills it. Returns close().
function uiSheet(title, build, opts) {
  opts = opts || {};
  const veil = el('div', { class: 'ui-sheet-veil', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Sheet' });
  const sheet = el('div', { class: 'ui-sheet ui-sheet-form' + (opts.cls ? ' ' + opts.cls : '') });
  sheet.appendChild(el('div', { class: 'ui-sheet-grip', 'aria-hidden': 'true' }));
  if (title) sheet.appendChild(el('h3', { class: 'ui-sheet-h' }, title));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    veil.classList.add('leaving');
    setTimeout(() => { veil.remove(); if (opts.onClose) opts.onClose(); }, 200);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  veil.appendChild(sheet);
  _sheetSwallowEarlyClicks(veil);
  _sheetDrag(veil, sheet, close);
  veil.addEventListener('click', (e) => { if (e.target === veil) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(veil);
  build(sheet, close);
  return close;
}

// Rest settings: how long (Short / Standard / Long, previewed on three real
// sets) and whether the timer starts on its own after each set.
function openRestSettings(onDone) {
  uiSheet('Rest and sets', (sheet, close) => {
    sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Rest follows the set. Heavier and harder sets rest longer.'));
    const seg = el('div', { class: 'ui-seg rest-seg', role: 'radiogroup', 'aria-label': 'Rest length' });
    const examples = [
      { title: 'Heavy triple', sub: 'Squat · 3 reps at RPE 9', lift: 'squat', reps: 3, rpe: 9 },
      { title: 'Volume set', sub: 'Bench · 8 reps at RPE 7', lift: 'bench', reps: 8, rpe: 7 },
      { title: 'Accessory', sub: 'Rows · 12 reps at RPE 8', lift: 'pull', reps: 12, rpe: 8 }
    ];
    const ends = [];
    const preview = uiList(examples.map(x => {
      const end = el('b', { class: 'rest-ex-val' });
      ends.push(end);
      return uiRow({ title: x.title, sub: x.sub, endNode: end });
    }));
    preview.classList.add('rest-preview');
    const paint = () => {
      const p = getRestPref();
      seg.querySelectorAll('button').forEach(b => { const on = b.dataset.v === p; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
      examples.forEach((x, i) => { ends[i].textContent = fmtClock(smartRestSeconds(Object.assign({ pref: p }, x))); });
    };
    Object.keys(REST_PREFS).forEach(k => {
      const b = el('button', { type: 'button', role: 'radio', 'data-v': k }, REST_PREF_LABEL[k]);
      b.addEventListener('click', () => { setRestPref(k); paint(); });
      seg.appendChild(b);
    });
    sheet.appendChild(seg);
    sheet.appendChild(preview);
    const autoRow = el('div', { class: 'ui-row rest-auto' });
    const autoMain = el('span', { class: 'ui-row-main' });
    autoMain.appendChild(el('span', { class: 'ui-row-title' }, 'Start after each set'));
    autoMain.appendChild(el('span', { class: 'ui-row-sub' }, 'Off: no timer pops up when you tick a set'));
    autoRow.appendChild(autoMain);
    autoRow.appendChild(uiSwitch(getRestAuto(), on => setRestAuto(on), 'Start the rest timer after each set'));
    sheet.appendChild(uiList([autoRow]));
    // Smart next set (smartNextLoad): a harder or easier set moves the next one.
    const smartRow = el('div', { class: 'ui-row rest-auto' });
    const smartMain = el('span', { class: 'ui-row-main' });
    smartMain.appendChild(el('span', { class: 'ui-row-title' }, 'Adjust the next set'));
    smartMain.appendChild(el('span', { class: 'ui-row-sub' }, 'When a set feels harder or easier than planned, the next one moves to match'));
    smartRow.appendChild(smartMain);
    smartRow.appendChild(uiSwitch(getSmartLoadOn(), on => setSmartLoadOn(on), 'Adjust the next set to how the last one felt'));
    // New to RPE: answer "how many reps were left?" instead of a number.
    const simpleRow = el('div', { class: 'ui-row rest-auto' });
    const simpleMain = el('span', { class: 'ui-row-main' });
    simpleMain.appendChild(el('span', { class: 'ui-row-title' }, 'Simple effort scale'));
    simpleMain.appendChild(el('span', { class: 'ui-row-sub' }, 'Tap how many reps you had left (4+ to 0) instead of an RPE number'));
    simpleRow.appendChild(simpleMain);
    simpleRow.appendChild(uiSwitch(isSimpleEffort(), on => setSimpleEffort(on), 'Use the simple reps-left effort scale'));
    sheet.appendChild(uiList([smartRow, simpleRow]));
    const done = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Done');
    done.addEventListener('click', close);
    sheet.appendChild(done);
    paint();
  }, { cls: 'rest-sheet', onClose: onDone });
}
function restSettingsSummary() {
  return getRestAuto() ? 'Smart · ' + REST_PREF_LABEL[getRestPref()] : 'Off';
}
Object.assign(window, { REST_PREFS, getRestPref, setRestPref, getRestAuto, setRestAuto, smartRestSeconds, fmtClock, uiSwitch, uiSheet, openRestSettings, restSettingsSummary });

// =========================================================
// UI v2 BUILDERS — every rebuilt screen is assembled from these, so the
// whole app shares one row, one stat strip, one empty state, one sheet.
// (Styles: "UI v2 — PRIMITIVES" in styles.css.)
// =========================================================
const UI_CHEV = '<svg class="ui-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const UI_DOTS = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

function uiLabel(text, opts) {
  opts = opts || {};
  const l = el('div', { class: 'ui-label' }, text);
  if (opts.count) l.appendChild(el('span', { class: 'ui-count' }, String(opts.count)));
  if (opts.action) {
    const b = el('button', { class: 'ui-label-end', type: 'button' }, opts.action.label);
    b.addEventListener('click', opts.action.onClick);
    l.appendChild(b);
  }
  return l;
}

// opts: { title, sub, subTone ('alert'|'ok'), av (name for initials), avUrl, lead (node),
//         end (text), endHtml, endNode, chevron (bool), onClick }
function uiRow(opts) {
  const row = el(opts.onClick ? 'button' : 'div', { class: 'ui-row', type: opts.onClick ? 'button' : null });
  if (!opts.onClick) row.removeAttribute('type');
  if (opts.av != null || opts.avUrl) {
    const av = el('span', { class: 'ui-av' });
    if (opts.avUrl) av.innerHTML = '<img src="' + escHtml(opts.avUrl) + '" alt="">';
    else { av.textContent = initials(opts.av || '?'); av.setAttribute('data-name', opts.av || '?'); av.classList.add('av-h' + avatarHue(opts.av || '?')); }
    row.appendChild(av);
  }
  if (opts.lead) row.appendChild(opts.lead);
  const main = el('span', { class: 'ui-row-main' });
  main.appendChild(el('span', { class: 'ui-row-title' }, opts.title || ''));
  if (opts.sub) main.appendChild(el('span', { class: 'ui-row-sub' + (opts.subTone ? ' ' + opts.subTone : '') }, opts.sub));
  row.appendChild(main);
  if (opts.end != null || opts.endHtml || opts.endNode || opts.chevron) {
    const end = el('span', { class: 'ui-row-end' });
    if (opts.endNode) end.appendChild(opts.endNode);
    else if (opts.endHtml) end.innerHTML = opts.endHtml;
    else if (opts.end != null) end.textContent = String(opts.end);
    if (opts.chevron) end.insertAdjacentHTML('beforeend', UI_CHEV);
    row.appendChild(end);
  }
  if (opts.onClick) row.addEventListener('click', opts.onClick);
  return row;
}

function uiList(rows) {
  const list = el('div', { class: 'ui-list' });
  rows.filter(Boolean).forEach(r => list.appendChild(r));
  return list;
}

// items: [{ value, unit, label }]
function uiStats(items) {
  const s = el('div', { class: 'ui-stats' });
  items.filter(Boolean).forEach(it => {
    const c = el('div', { class: 'ui-stat' + (it.tone ? ' tone-' + it.tone : '') });
    c.appendChild(el('b', { html: escHtml(String(it.value)) + (it.unit ? '<small>' + escHtml(it.unit) + '</small>' : '') }));
    c.appendChild(el('span', {}, it.label));
    s.appendChild(c);
  });
  return s;
}

// opts: { icon (svg), title, text, primary: {label, onClick}, secondary: {label, onClick} }
function uiEmpty(opts) {
  const e = el('div', { class: 'ui-empty' });
  if (opts.icon) e.appendChild(el('div', { class: 'ui-empty-icon', html: opts.icon }));
  e.appendChild(el('h3', {}, opts.title));
  if (opts.text) e.appendChild(el('p', {}, opts.text));
  if (opts.primary) {
    const b = el('button', { class: 'btn btn-primary btn-lg', type: 'button' }, opts.primary.label);
    b.addEventListener('click', opts.primary.onClick);
    e.appendChild(b);
  }
  if (opts.secondary) {
    const t = el('button', { class: 'ui-text-btn', type: 'button', style: 'display:block;margin:10px auto 0' }, opts.secondary.label);
    t.addEventListener('click', opts.secondary.onClick);
    e.appendChild(t);
  }
  return e;
}

// ⋯ menu as a bottom sheet. actions: [{ label, icon?, danger?, onClick }]
function uiActionSheet(title, actions) {
  const veil = el('div', { class: 'ui-sheet-veil', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Options' });
  const sheet = el('div', { class: 'ui-sheet' });
  sheet.appendChild(el('div', { class: 'ui-sheet-grip', 'aria-hidden': 'true' }));
  if (title) sheet.appendChild(el('div', { class: 'ui-sheet-title' }, title));
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    document.removeEventListener('keydown', onKey);
    veil.classList.add('leaving');
    setTimeout(() => veil.remove(), 200);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  actions.filter(Boolean).forEach(a => {
    const b = el('button', { type: 'button', class: a.danger ? 'danger' : '' });
    b.innerHTML = (a.icon || '') + '<span>' + escHtml(a.label) + '</span>';
    b.addEventListener('click', () => { close(); a.onClick && a.onClick(); });
    sheet.appendChild(b);
  });
  const cancel = el('button', { type: 'button', class: 'ui-sheet-cancel' }, 'Cancel');
  cancel.addEventListener('click', close);
  sheet.appendChild(cancel);
  veil.appendChild(sheet);
  _sheetSwallowEarlyClicks(veil);
  _sheetDrag(veil, sheet, close);
  veil.addEventListener('click', (e) => { if (e.target === veil) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(veil);
  const first = sheet.querySelector('button:not(.ui-sheet-cancel)');
  if (first) setTimeout(() => { try { first.focus(); } catch (e) {} }, 30);
  return close;
}

// Tiny inline sparkline (no axes) — values: number[]. Ink line + soft fill.
function uiSparkline(values) {
  const v = (values || []).filter(n => isFinite(n));
  if (v.length < 2) return '';
  const W = 300, H = 56, pad = 3;
  const min = Math.min(...v), max = Math.max(...v), span = (max - min) || 1;
  const pts = v.map((n, i) => [pad + (i / (v.length - 1)) * (W - pad * 2), H - pad - ((n - min) / span) * (H - pad * 2)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z';
  const last = pts[pts.length - 1];
  return '<svg class="ui-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="' + area + '" fill="currentColor" opacity="0.08"/>' +
    '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
    '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.2" fill="currentColor"/></svg>';
}

// Goal rows for one athlete: where they are on the right, the target and
// what's left underneath, a thin bar for the distance. Returns a .ui-list, or
// null when no target is set. Shared by the athlete History view and the
// coach's per-athlete progress view.
function uiGoalList(goals, athleteId, includeBw) {
  if (!goals) return null;
  const u = unitLabel();
  const defs = [
    { key: 'squat', label: 'Squat', current: bestE1RM(athleteId, 'squat') },
    { key: 'bench', label: 'Bench', current: bestE1RM(athleteId, 'bench') },
    { key: 'deadlift', label: 'Deadlift', current: bestE1RM(athleteId, 'deadlift') },
    { key: 'total', label: 'Total', current: currentTotal(athleteId) }
  ];
  if (includeBw && goals.bodyweight) {
    const cur = latestBodyweight(athleteId);
    if (cur != null) defs.push({ key: 'bodyweight', label: 'Bodyweight', current: cur, direction: goals.bwDirection });
  }
  const rows = [];
  defs.forEach(def => {
    const target = goals[def.key];
    if (!target || target <= 0) return;
    const pct = goalProgressPct(def.current, target, def.direction);
    const done = def.direction === 'cut' ? def.current <= target : def.current >= target;
    const remainKg = def.direction === 'cut' ? (def.current - target) : (target - def.current);
    const row = uiRow({
      title: def.label,
      sub: 'Goal ' + kgToDisplay(target) + ' ' + u + ' · ' + (done ? 'done' : kgToDisplay(remainKg, 1) + ' ' + u + ' to go'),
      subTone: done ? 'ok' : null,
      endHtml: '<b>' + kgToDisplay(def.current, 1) + '</b>' + u
    });
    row.querySelector('.ui-row-main').appendChild(
      el('span', { class: 'goal-bar' + (done ? ' done' : '') }, el('i', { style: 'width:' + Math.max(0, Math.min(100, pct)) + '%' })));
    rows.push(row);
  });
  return rows.length ? uiList(rows) : null;
}

Object.assign(window, { UI_CHEV, UI_DOTS, uiLabel, uiRow, uiList, uiStats, uiEmpty, uiActionSheet, uiSparkline, uiGoalList });

// =========================================================
// UI v3 · LIVING DARK (2026-10-16)
// The owner's verdict on v2: "all grey, dead, plain". v3 gives colour a job and
// makes the app answer the finger:
//   · each of the five destinations owns one hue (wayfinding) — Train/Roster
//     fire, Progress/Program cyan, Club gold, Coach/Messages green, You violet;
//     sub-screens wear their parent's hue. body[data-accent] drives it all.
//   · every person gets a stable avatar colour (hash of their name/initials).
//   · lists rise in when a screen opens, big numbers count up, rings fill.
// Styles: "UI v3 · LIVING DARK" at the end of styles.css.
// =========================================================
const SCREEN_ACCENT = {
  today: 'fire', athletes: 'fire',
  progress: 'cyan', bodyweight: 'cyan', program: 'cyan', templates: 'cyan',
  club: 'gold',
  coach: 'green', messages: 'green',
  you: 'violet', library: 'violet', marketplace: 'violet'
};
function screenAccentFor(key) {
  // The athlete's own Program sits in the Coach slot when self-coached.
  if (key === 'program' && !/coach\.html/.test(location.pathname)) return 'green';
  return SCREEN_ACCENT[key] || 'fire';
}

// Mark the screen as "entering" for a moment so its lists stagger in and its
// numbers count up, once per visit (re-renders while you stay don't replay it).
let _enterTimer = null;
function markScreenEnter() {
  const b = document.body;
  if (!b) return;
  b.classList.remove('screen-enter');
  void b.offsetWidth; // restart the CSS animations on a quick tab change
  b.classList.add('screen-enter');
  clearTimeout(_enterTimer);
  _enterTimer = setTimeout(() => b.classList.remove('screen-enter'), 900);
}

function initScreenAccent() {
  const b = document.body;
  if (!b || !b.classList.contains('powa-app')) return;
  const tabs = Array.from(document.querySelectorAll('.sidebar-tab'));
  if (!tabs.length) return;
  let lastKey = null;
  const apply = () => {
    const active = tabs.find(t => t.classList.contains('active'));
    if (!active) return;
    const key = active.dataset.parent || active.dataset.tab;
    b.dataset.accent = screenAccentFor(key);
    b.dataset.screen = active.dataset.tab;
    if (active.dataset.tab !== lastKey) { lastKey = active.dataset.tab; markScreenEnter(); }
  };
  const obs = new MutationObserver(apply);
  tabs.forEach(t => obs.observe(t, { attributes: true, attributeFilter: ['class', 'data-parent'] }));
  apply();
}

// Stable avatar colour per person: the same lifter is the same colour on the
// roster, in messages and in the club. 8 hues, picked by a hash of the name.
function avatarHue(name) {
  // FNV-1a + a final avalanche, so short names and initials still spread across
  // all eight hues instead of clumping.
  const s = String(name || '').trim().toUpperCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h = (h ^ s.charCodeAt(i)) >>> 0; h = Math.imul(h, 0x01000193) >>> 0; }
  h = (h ^ (h >>> 15)) >>> 0; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h = (h ^ (h >>> 12)) >>> 0;
  return h % 8;
}
// Paint every initials avatar the app renders (uiRow, legacy .av, inbox rows,
// club members) without touching each renderer: one batched observer pass.
const AVATAR_SEL = '.ui-av, .av, .msg-inbox-av, .cr-av, .club-av, .cm-av, .coach-av, .you-av, .cp-av, .cd-crest, .cs-av, .cpd-av, .crec-av, .rs-av, .rq-av, .lc-av';
function paintAvatars(root) {
  (root || document).querySelectorAll(AVATAR_SEL).forEach(a => {
    if (a.querySelector('img')) { a.classList.add('has-img'); return; }
    const key = a.getAttribute('data-name') || a.textContent;
    const h = avatarHue(key);
    if (a.dataset.h === String(h)) return;
    for (let i = 0; i < 8; i++) a.classList.remove('av-h' + i);
    a.classList.add('av-h' + h);
    a.dataset.h = String(h);
  });
}
function initAvatarPaint() {
  if (!document.body) return;
  paintAvatars(document);
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(() => { queued = false; paintAvatars(document); });
  }).observe(document.body, { childList: true, subtree: true });
}

// Progress ring (Apple-Fitness style): track + gradient arc in the screen's
// accent. frac 0..1. The arc fills in when its screen opens.
let _ringSeq = 0;
function uiRing(frac, opts) {
  opts = opts || {};
  const size = opts.size || 72, sw = opts.stroke || 8;
  const r = (size - sw) / 2, cx = size / 2, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  const id = 'uiRingG' + (++_ringSeq);
  const wrap = el('span', { class: 'ui-ring' + (opts.cls ? ' ' + opts.cls : ''), style: 'width:' + size + 'px;height:' + size + 'px' });
  wrap.innerHTML =
    '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="ui-ring-s1"/><stop offset="1" class="ui-ring-s2"/></linearGradient></defs>' +
      '<circle class="ui-ring-track" cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke-width="' + sw + '"/>' +
      '<circle class="ui-ring-fill" cx="' + cx + '" cy="' + cx + '" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + sw + '" stroke-linecap="round"' +
        ' stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - f)).toFixed(2) + '" style="--c:' + c.toFixed(2) + '"' +
        ' transform="rotate(-90 ' + cx + ' ' + cx + ')"/>' +
    '</svg>';
  // One inner span so the number and its small unit share a baseline AND the pair
  // centres in the ring (WebKit puts baseline-aligned flex items at the top).
  if (opts.label != null) wrap.appendChild(el('span', { class: 'ui-ring-label', html: '<span>' + opts.label + '</span>' }));
  return wrap;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initScreenAccent(); initAvatarPaint(); });
} else {
  initScreenAccent(); initAvatarPaint();
}
// iOS WebKit only applies :active press states when the page listens for touches.
try { document.addEventListener('touchstart', function () {}, { passive: true }); } catch (e) {}

// Hero with a progress ring: the ring on the left, the headline beside it,
// optional mini stats underneath. Wears the screen's accent like every .ui-hero.
// opts: { frac, ringLabel (html), label, title, sub, stats: [{ value, label, tone }] }
function uiRingHero(opts) {
  const hero = el('div', { class: 'ui-hero ring-hero' });
  const top = el('div', { class: 'rh-top' });
  top.appendChild(uiRing(opts.frac, { size: 88, stroke: 9, label: opts.ringLabel }));
  const txt = el('div', { class: 'rh-text' });
  if (opts.label) txt.appendChild(el('div', { class: 'ui-hero-label' }, opts.label));
  txt.appendChild(el('div', { class: 'rh-title' }, opts.title || ''));
  if (opts.sub) txt.appendChild(el('div', { class: 'rh-sub' }, opts.sub));
  top.appendChild(txt);
  hero.appendChild(top);
  if (opts.stats && opts.stats.length) {
    const row = el('div', { class: 'rh-stats' });
    opts.stats.forEach(s => {
      const c = el('div', { class: 'rh-stat' + (s.tone ? ' tone-' + s.tone : '') });
      c.appendChild(el('b', {}, String(s.value)));
      c.appendChild(el('span', {}, s.label));
      row.appendChild(c);
    });
    hero.appendChild(row);
  }
  return hero;
}

// Commit a primary action on finger-up instead of waiting for WebKit's synthetic
// click, which iOS sometimes withholds (hover-reveal heuristics) — the set you
// just lifted must never fail to log. Movement over 10px is a scroll, not a tap;
// the trailing click is swallowed so the action fires exactly once.
let _fastTap = { at: 0, x: 0, y: 0 };
function uiFastTap(node, fn) {
  if (!node || typeof fn !== 'function') return node;
  let sx = 0, sy = 0, down = false;
  node.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; down = true; sx = e.clientX; sy = e.clientY; }, { passive: true });
  node.addEventListener('pointercancel', () => { down = false; });
  node.addEventListener('pointerup', (e) => {
    if (!down || e.pointerType === 'mouse') return;
    down = false;
    if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) return;
    _fastTap = { at: Date.now(), x: e.clientX, y: e.clientY };
    fn(e);
  });
  node.addEventListener('click', (e) => { if (Date.now() - _fastTap.at < 700) return; fn(e); });
  return node;
}
// The action may re-render the screen, so iOS's late synthetic click can land on
// whatever now sits under the finger (e.g. the NEXT set's Log button). Swallow any
// click at that spot just after a fast tap — page-wide, capture phase.
document.addEventListener('click', (e) => {
  if (Date.now() - _fastTap.at < 700 && Math.abs(e.clientX - _fastTap.x) < 40 && Math.abs(e.clientY - _fastTap.y) < 40) {
    e.stopPropagation(); e.preventDefault();
  }
}, true);

// Same idea for every sheet: while a modal sheet or ui-sheet is still sliding up,
// a click inside it is the late echo of the tap that opened it, not a choice.
document.addEventListener('click', (e) => {
  const t = e.target;
  if (!t || !t.closest) return;
  const m = t.closest('.modal-backdrop.open .modal, .ui-sheet');
  if (!m || typeof m.getAnimations !== 'function') return;
  const presenting = m.getAnimations().some(a => a.playState === 'running' && /SheetUp/.test(a.animationName || ''));
  if (presenting) { e.stopPropagation(); e.preventDefault(); }
}, true);

Object.assign(window, { SCREEN_ACCENT, screenAccentFor, markScreenEnter, initScreenAccent, avatarHue, paintAvatars, uiRing, uiRingHero, uiFastTap });

// =========================================================
// UI v6 · ALIVE (2026-10-16). Owner review after v5: Train "plain and boring
// and hard to use", Clubs "too simple", Roster "not sexy and fun", tools that
// read as web forms, Settings buried behind the avatar. The shared pieces the
// rebuilt screens use:
//   uiBarbell(kg)    one sleeve of the loaded bar, side-on, in competition plate
//                    colours: the brand mark, showing the real load
//   uiRpeScale()     tap-to-pick RPE 6–10 (green → red) with the "reps left in
//                    the tank" read under it
//   uiStepper()      − value + for weights and reps (hold to repeat)
//   toastAction()    a toast that carries one action ("Send to coach")
//   uiLongPress()    long-press / double-tap / right-click → callback
//   reactions        fixed keys (never free text) for messages + club posts
// =========================================================

// IPF competition colours: [colour, height %, thickness]. lb plates wear the
// colour of the kg plate they stand in for (45 ≈ 20, 35 ≈ 15, 25 ≈ 10, 10 ≈ 5).
const PLATE_LOOK = {
  kg:  { 25: ['#e5262f', 100, 15], 20: ['#2563eb', 100, 13], 15: ['#f5c518', 88, 11], 10: ['#1f9d55', 76, 10], 5: ['#ececef', 58, 8], 2.5: ['#2b2b30', 48, 7], 1.25: ['#b8bcc6', 40, 6] },
  lbs: { 45: ['#2563eb', 100, 14], 35: ['#f5c518', 92, 12], 25: ['#1f9d55', 80, 10], 10: ['#ececef', 60, 8], 5: ['#2b2b30', 50, 7], 2.5: ['#b8bcc6', 42, 6] }
};
function _barDisplay() { try { return typeof activeBarDisplay === 'function' ? activeBarDisplay() : undefined; } catch (e) { return undefined; } }
// The plates on ONE side, heaviest first, in the active unit.
function plateLoadout(kg) {
  const r = plateBreakdown(Number(kg) || 0, _barDisplay());
  return { plates: r.plates || [], unit: r.unit === 'lbs' ? 'lbs' : 'kg', error: r.error || null };
}
function plateColor(p, unit) { const l = PLATE_LOOK[unit === 'lbs' ? 'lbs' : 'kg'][p]; return l ? l[0] : '#9aa0aa'; }
function plateSummaryText(kg) {
  const r = plateLoadout(kg);
  if (!r.plates.length) return 'Empty bar';
  return r.plates.map(p => String(p)).join(' · ') + ' ' + (r.unit === 'lbs' ? 'lb' : 'kg') + ' a side';
}
// Plate chips, grouped: "2×25  15  2.5".
function plateChipsHtml(kg) {
  const r = plateLoadout(kg);
  if (!r.plates.length) return '<span class="pl-chip is-bar">Just the bar</span>';
  const groups = [];
  r.plates.forEach(p => { const g = groups[groups.length - 1]; if (g && g.p === p) g.n++; else groups.push({ p, n: 1 }); });
  return groups.map(g => '<span class="pl-chip" style="--pc:' + plateColor(g.p, r.unit) + '">' + (g.n > 1 ? '<i>' + g.n + '×</i>' : '') + g.p + '</span>').join('');
}
function uiBarbell(kg, opts) {
  opts = opts || {};
  const r = plateLoadout(kg);
  const look = PLATE_LOOK[r.unit];
  const mid = 50, gap = 1.6;
  let x = 31, body = '';
  r.plates.filter(p => look[p]).forEach((p, i) => {
    const l = look[p], h = l[1] * 0.92, w = l[2], y = mid - h / 2;
    body += '<g class="bb-plate" style="--i:' + i + '"><rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w + '" height="' + h.toFixed(1) + '" rx="2.2" fill="' + l[0] + '" stroke="rgba(255,255,255,' + (l[0] === '#2b2b30' ? '0.34' : '0.16') + ')" stroke-width="0.9"/>' +
      '<rect x="' + (x + w * 0.6).toFixed(1) + '" y="' + (y + 3).toFixed(1) + '" width="' + (w * 0.22).toFixed(1) + '" height="' + (h - 6).toFixed(1) + '" rx="1" fill="#fff" opacity="0.16"/></g>';
    x += w + gap;
  });
  const collarX = x + 0.4, end = collarX + 7 + 16, W = end + 1;
  return '<svg class="ui-barbell' + (opts.cls ? ' ' + opts.cls : '') + '" viewBox="0 0 ' + W.toFixed(1) + ' 100" preserveAspectRatio="xMinYMid meet" role="img" aria-label="' + escHtml(plateSummaryText(kg)) + '">' +
    '<rect x="0" y="' + (mid - 3.4) + '" width="26" height="6.8" rx="1.6" fill="#5d616a"/>' +
    '<rect x="23" y="' + (mid - 13) + '" width="7" height="26" rx="1.8" fill="#8e949e"/>' +
    '<rect x="30" y="' + (mid - 5.6) + '" width="' + (end - 30).toFixed(1) + '" height="11.2" rx="2.4" fill="#a3a9b3"/>' +
    body +
    (r.plates.length ? '<rect x="' + collarX.toFixed(1) + '" y="' + (mid - 10) + '" width="7" height="20" rx="1.8" fill="#d4d7dd"/>' : '') +
    '</svg>';
}

// RPE: 6 is easy speed, 10 is a true max. Colours run green → amber → red.
const RPE_STEPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const RPE_COLORS = { 6: '#34d982', 6.5: '#5ad672', 7: '#93d35d', 7.5: '#cfcb4c', 8: '#ffbf3c', 8.5: '#ffa142', 9: '#ff8045', 9.5: '#ff6048', 10: '#ff3b4a' };
const RPE_TANK = {
  6: 'Four or more reps left. Moving fast', 6.5: 'Three or four reps left', 7: 'Three reps left in the tank',
  7.5: 'Two or three reps left', 8: 'Two reps left in the tank', 8.5: 'One or two reps left',
  9: 'One rep left in the tank', 9.5: 'Maybe one more. Could have added a little', 10: 'Nothing left. A true max'
};
function rpeColor(r) { const n = Math.round(Number(r) * 2) / 2; return RPE_COLORS[n] || (n > 10 ? RPE_COLORS[10] : RPE_COLORS[6]); }
function rpeTankText(r) { return RPE_TANK[Math.round(Number(r) * 2) / 2] || ''; }
const SIMPLE_SHORT = { 6: '4+', 7: '3', 8: '2', 9: '1', 10: '0' };
const SIMPLE_LEFT = { 6: 'Four or more reps left', 7: 'Three reps left', 8: 'Two reps left', 9: 'One rep left', 10: 'Nothing left' };
function uiRpeScale(value, onPick, opts) {
  opts = opts || {};
  // Simple mode (new lifters; You → Rest and sets): five "reps left" buttons
  // instead of nine RPE numbers. Half steps round to the nearest whole one.
  const simple = opts.simple != null ? !!opts.simple : isSimpleEffort();
  const steps = simple ? [6, 7, 8, 9, 10] : RPE_STEPS;
  const near = (v) => (v == null ? null : simple ? Math.max(6, Math.min(10, Math.round(v))) : v);
  const wrap = el('div', { class: 'rpe-scale' + (simple ? ' is-simple' : '') + (opts.cls ? ' ' + opts.cls : '') });
  const row = el('div', { class: 'rpe-steps', role: 'radiogroup', 'aria-label': opts.label || (simple ? 'Reps left in the tank' : 'How hard was it? RPE') });
  const hint = el('div', { class: 'rpe-hint', 'aria-live': 'polite' });
  let cur = near((value == null || value === '') ? null : Number(value));
  // opts.target: the planned RPE. It gets the one quiet tick under the scale, and
  // the read-out names it once you pick something else. No rainbow of ticks.
  const target = near((opts.target == null || opts.target === '') ? null : Number(opts.target));
  const paint = () => {
    row.querySelectorAll('button').forEach(b => {
      const on = Number(b.dataset.rpe) === cur;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    wrap.classList.toggle('has-value', cur != null);
    if (cur != null) wrap.style.setProperty('--rc', rpeColor(cur));
    const off = target != null && cur !== target;
    hint.innerHTML = cur == null
      ? escHtml(simple ? 'How many more reps could you have done?' : (opts.empty || 'Tap how hard it felt'))
      : simple
        ? '<b>' + SIMPLE_LEFT[cur] + '</b> · RPE ' + cur + (off ? ' · plan was ' + SIMPLE_SHORT[target] + ' left' : '')
        : '<b>RPE ' + cur + '</b> · ' + escHtml(rpeTankText(cur)) + (off ? ' · target ' + target : '');
  };
  steps.forEach(r => {
    const b = el('button', { type: 'button', role: 'radio', class: target === r ? 'is-target' : '', 'data-rpe': String(r), style: '--rc:' + rpeColor(r) }, simple ? SIMPLE_SHORT[r] : String(r));
    if (simple) b.setAttribute('aria-label', SIMPLE_LEFT[r]);
    b.addEventListener('click', () => {
      cur = r; paint();
      hapticTick();
      if (onPick) onPick(r);
    });
    row.appendChild(b);
  });
  wrap.appendChild(row);
  if (opts.hint !== false) wrap.appendChild(hint);
  if (simple && opts.hint !== false) {
    const what = el('button', { class: 'ui-text-btn rpe-what', type: 'button' }, 'What does this mean?');
    what.addEventListener('click', () => openGlossary('rir'));
    wrap.appendChild(what);
  }
  wrap.setValue = (v) => { cur = near((v == null || v === '') ? null : Number(v)); paint(); };
  wrap.getValue = () => cur;
  wrap.nudge = () => { wrap.classList.remove('nudge'); void wrap.offsetWidth; wrap.classList.add('nudge'); };
  paint();
  return wrap;
}

// − value +. opts: { value, step, min, max, fmt(v) → html, onChange(v), label,
// input: true → the value is a typeable number field, suffix: unit after it }
function uiStepper(opts) {
  opts = opts || {};
  const step = Number(opts.step) || 1;
  const w = el('div', { class: 'ui-stepper' + (opts.input ? ' is-input' : '') + (opts.cls ? ' ' + opts.cls : '') });
  const minus = el('button', { type: 'button', class: 'st-btn', 'aria-label': 'Less ' + (opts.label || '') }, '−');
  const plus = el('button', { type: 'button', class: 'st-btn', 'aria-label': 'More ' + (opts.label || '') }, '+');
  const dec = (String(step).split('.')[1] || '').length;
  let v = Number(opts.value) || 0;
  const clamp = (n) => { if (opts.min != null) n = Math.max(opts.min, n); if (opts.max != null) n = Math.min(opts.max, n); return Number(n.toFixed(dec)); };
  let val, inp = null;
  if (opts.input) {
    val = el('label', { class: 'st-val' });
    inp = el('input', { type: 'number', inputmode: 'decimal', step: String(step), class: 'st-input', 'aria-label': opts.label || 'Value' });
    val.appendChild(inp);
    if (opts.suffix) val.appendChild(el('small', {}, opts.suffix));
    inp.addEventListener('input', () => { const n = Number(inp.value); if (inp.value !== '' && isFinite(n)) { v = n; syncBtns(); if (opts.onChange) opts.onChange(v); } });
    inp.addEventListener('blur', () => { v = clamp(v); paint(); });
  } else {
    val = el('span', { class: 'st-val', 'aria-live': 'polite' });
  }
  const syncBtns = () => {
    minus.disabled = opts.min != null && v <= opts.min;
    plus.disabled = opts.max != null && v >= opts.max;
  };
  const paint = () => {
    if (inp) inp.value = v.toFixed(dec);
    else val.innerHTML = opts.fmt ? opts.fmt(v) : String(v);
    syncBtns();
  };
  const bump = (d) => { const n = clamp(v + d); if (n === v) return; v = n; paint(); hapticTick(); if (opts.onChange) opts.onChange(v); };
  [[minus, -step], [plus, step]].forEach(([b, d]) => {
    let t = null, rep = null;
    const stop = () => { clearTimeout(t); clearInterval(rep); t = rep = null; };
    b.addEventListener('pointerdown', () => { stop(); t = setTimeout(() => { rep = setInterval(() => bump(d), 80); }, 420); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
    b.addEventListener('click', () => bump(d));
  });
  w.appendChild(minus); w.appendChild(val); w.appendChild(plus);
  w.setValue = (n) => { v = clamp(Number(n) || 0); paint(); };
  w.getValue = () => { if (inp && inp.value !== '' && isFinite(Number(inp.value))) v = clamp(Number(inp.value)); return v; };
  paint();
  return w;
}

// A toast with one action button. Stays up a little longer than a plain one.
function toastAction(msg, label, onAction, ms) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = el('div', { class: 'toast toast-act', role: 'status', 'aria-live': 'polite' });
  t.appendChild(el('span', { class: 'ta-msg' }, msg));
  const b = el('button', { class: 'ta-btn', type: 'button' }, label);
  b.addEventListener('click', (e) => { e.stopPropagation(); t.remove(); if (onAction) onAction(); });
  t.appendChild(b);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms || 4600);
  return t;
}

// Long-press (≈0.42 s), double-tap and right-click all call fn(event). The
// click that ends a long-press is swallowed so it can't also "tap" the node.
function uiLongPress(node, fn) {
  if (!node || typeof fn !== 'function') return node;
  let timer = null, sx = 0, sy = 0, fired = false, lastTap = 0;
  const clear = () => { clearTimeout(timer); timer = null; };
  node.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    fired = false; sx = e.clientX; sy = e.clientY; clear();
    timer = setTimeout(() => { fired = true; fn(e); }, 420);
  });
  node.addEventListener('pointermove', (e) => { if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) clear(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => node.addEventListener(ev, clear));
  node.addEventListener('click', (e) => {
    if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; return; }
    const now = Date.now();
    if (now - lastTap < 300) { lastTap = 0; fn(e); return; }
    lastTap = now;
  });
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!fired) fn(e); });
  return node;
}

// Reactions are fixed keys, never free text, so they need no moderation path.
const REACT_EMOJI = { fire: '🔥', strong: '💪', clap: '👏', trophy: '🏆', heart: '❤️', up: '👍', laugh: '😂', q: '❓' };
const POST_REACT_KEYS = ['fire', 'strong', 'clap', 'trophy'];
const MSG_REACT_KEYS = ['heart', 'up', 'fire', 'strong', 'laugh', 'q'];
// rows: [{ userId, reaction }] → { counts: {key:n}, mine: key|null, total }
function reactionSummary(rows, myId) {
  const counts = {}; let mine = null, total = 0;
  (rows || []).forEach(r => {
    if (!r || !r.reaction || !REACT_EMOJI[r.reaction]) return;
    counts[r.reaction] = (counts[r.reaction] || 0) + 1; total++;
    if (myId && r.userId === myId) mine = r.reaction;
  });
  return { counts, mine, total };
}
// A floating row of reactions above (or below) the anchor. Returns close().
function openReactionPicker(anchor, keys, current, onPick, extra) {
  document.querySelectorAll('.react-pop-veil').forEach(v => v.remove());
  const veil = el('div', { class: 'react-pop-veil' });
  const pop = el('div', { class: 'react-pop', role: 'menu', 'aria-label': 'React' });
  const close = () => { veil.classList.add('leaving'); setTimeout(() => veil.remove(), 160); };
  keys.forEach(k => {
    const b = el('button', { type: 'button', role: 'menuitem', class: k === current ? 'on' : '', 'aria-label': 'React ' + k }, REACT_EMOJI[k]);
    b.addEventListener('click', (e) => {
      e.stopPropagation(); close();
      try { if (window.PowaNative && PowaNative.isNative && PowaNative.isNative()) PowaNative.haptic('LIGHT'); } catch (er) {}
      onPick(k === current ? null : k);
    });
    pop.appendChild(b);
  });
  if (extra && extra.length) {
    const ex = el('div', { class: 'react-extra' });
    extra.forEach(x => {
      const b = el('button', { type: 'button' }, x.label);
      b.addEventListener('click', (e) => { e.stopPropagation(); close(); x.onClick(); });
      ex.appendChild(b);
    });
    pop.appendChild(ex);
  }
  veil.appendChild(pop);
  veil.addEventListener('click', (e) => { if (e.target === veil) close(); });
  _sheetSwallowEarlyClicks(veil);
  document.body.appendChild(veil);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(10, Math.min(window.innerWidth - pw - 10, left));
  let top = r.top - ph - 10;
  const below = top < (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0) + 54;
  if (below) top = r.bottom + 10;
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
  pop.style.transformOrigin = (r.left + r.width / 2 - left) + 'px ' + (below ? '0' : '100%');
  try { if (window.PowaNative && PowaNative.isNative && PowaNative.isNative()) PowaNative.haptic('MEDIUM'); } catch (e) {}
  return close;
}
// Reaction chips under a post / bubble. onToggle(key) flips my reaction.
const _REACT_ADD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.2A8.5 8.5 0 1 1 12.8 3.5"/><path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8"/><path d="M9 9.5h.01M15 9.5h.01"/><path d="M19 2v6M16 5h6"/></svg>';
// Chips for the reactions a post / message has, then one "add" button that
// opens the picker. opts.add = show the add button; opts.showAll = legacy.
function reactionChips(summary, keys, onToggle, opts) {
  opts = opts || {};
  const wrap = el('div', { class: 'react-chips' + (opts.cls ? ' ' + opts.cls : '') });
  keys.forEach(k => {
    const n = summary.counts[k] || 0;
    if (!n && !opts.showAll) return;
    const b = el('button', { type: 'button', class: 'react-chip' + (summary.mine === k ? ' mine' : ''), 'aria-pressed': summary.mine === k ? 'true' : 'false', 'aria-label': k + ' ' + n },
      el('span', { class: 'rc-e' }, REACT_EMOJI[k]), n ? el('b', {}, String(n)) : null);
    b.addEventListener('click', (e) => { e.stopPropagation(); onToggle(summary.mine === k ? null : k); });
    wrap.appendChild(b);
  });
  if (opts.add) {
    const add = el('button', { type: 'button', class: 'react-add' + (summary.total ? '' : ' is-first'), 'aria-label': 'Add a reaction', html: _REACT_ADD });
    if (!summary.total && opts.addLabel) add.appendChild(el('span', {}, opts.addLabel));
    add.addEventListener('click', (e) => { e.stopPropagation(); openReactionPicker(add, keys, summary.mine, (k) => onToggle(k)); });
    wrap.appendChild(add);
  }
  return wrap;
}

// INSTAGRAM. A profile can carry one handle. Stored bare + lower case and
// checked against Instagram's own rules, so it can only ever open
// instagram.com/<handle>. '' = cleared, null = not a handle.
function normalizeInstagram(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^(www\.)?(instagram\.com|instagr\.am)\//i, '');
  s = s.split(/[/?#]/)[0].replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(s) ? s : null;
}
function instagramUrl(handle) { return 'https://instagram.com/' + encodeURIComponent(handle); }
const IG_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>';
function openInstagram(handle) {
  const h = normalizeInstagram(handle);
  if (!h) return;
  if (window._demoMode) { toast('Opens @' + h + ' on Instagram'); return; }
  try { window.open(instagramUrl(h), '_blank', 'noopener'); } catch (e) {}
}
// "@handle" link. opts.big = the full-width button used on lifter cards.
function uiInstagramChip(handle, opts) {
  opts = opts || {};
  const h = normalizeInstagram(handle);
  if (!h) return null;
  const a = el('a', { class: 'ig-chip' + (opts.big ? ' is-big' : ''), href: instagramUrl(h), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Instagram: @' + h });
  a.innerHTML = '<span class="ig-ic">' + IG_GLYPH + '</span><span class="ig-h">@' + escHtml(h) + '</span>';
  a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openInstagram(h); });
  return a;
}

// TIKTOK. Same deal: one handle, bare + lower case, TikTok's rules (2–24
// letters, numbers, _ and ., never ending in a period), so it can only ever
// open tiktok.com/@<handle>. '' = cleared, null = not a handle. Short links
// (vm.tiktok.com/…) carry no handle, so they're refused rather than guessed.
function normalizeTikTok(v) {
  let s = String(v == null ? '' : v).trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^((www|m)\.)?tiktok\.com\//i, '');
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(s)) return null;   // another site, or a short link
  s = s.split(/[/?#]/)[0].replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]{1,23}[a-z0-9_]$/.test(s) ? s : null;
}
function tiktokUrl(handle) { return 'https://www.tiktok.com/@' + encodeURIComponent(handle); }
const TT_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.4 2.6 2.2 4.4 5 4.8"/></svg>';
function openTikTok(handle) {
  const h = normalizeTikTok(handle);
  if (!h) return;
  if (window._demoMode) { toast('Opens @' + h + ' on TikTok'); return; }
  try { window.open(tiktokUrl(h), '_blank', 'noopener'); } catch (e) {}
}
function uiTikTokChip(handle, opts) {
  opts = opts || {};
  const h = normalizeTikTok(handle);
  if (!h) return null;
  const a = el('a', { class: 'ig-chip tt-chip' + (opts.big ? ' is-big' : ''), href: tiktokUrl(h), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'TikTok: @' + h });
  a.innerHTML = '<span class="ig-ic">' + TT_GLYPH + '</span><span class="ig-h">@' + escHtml(h) + '</span>';
  a.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openTikTok(h); });
  return a;
}
// Instagram + TikTok side by side, whichever the lifter has. null = neither.
function uiSocialChips(model, opts) {
  const ig = model && model.instagram ? uiInstagramChip(model.instagram, opts) : null;
  const tt = model && model.tiktok ? uiTikTokChip(model.tiktok, opts) : null;
  if (!ig && !tt) return null;
  const row = el('div', { class: 'social-chips' + (opts && opts.big ? ' is-big' : '') });
  if (ig) row.appendChild(ig);
  if (tt) row.appendChild(tt);
  return row;
}

Object.assign(window, { normalizeInstagram, instagramUrl, openInstagram, uiInstagramChip, IG_GLYPH,
  normalizeTikTok, tiktokUrl, openTikTok, uiTikTokChip, uiSocialChips, TT_GLYPH, PLATE_LOOK, plateLoadout, plateColor, plateSummaryText, plateChipsHtml, uiBarbell,
  RPE_STEPS, rpeColor, rpeTankText, uiRpeScale, uiStepper, toastAction, uiLongPress,
  REACT_EMOJI, POST_REACT_KEYS, MSG_REACT_KEYS, reactionSummary, openReactionPicker, reactionChips });

// =========================================================
// SETTINGS, UNDER YOU (v6). The owner: the avatar menu at the top "is very
// dirty… allat can come under You". In the app the avatar is gone from the top
// bar; every part of the old Settings sheet is its own clean sheet, opened from
// a You row (same render fns, same backend).
// =========================================================
function pickAvatar(onDone) {
  const u = getCurrentUser(); if (!u) return;
  if (window._demoMode) { toast('Preview only in demo mode'); return; }
  const inp = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'position:fixed;left:-9999px;top:0' });
  document.body.appendChild(inp);
  inp.addEventListener('change', async () => {
    const file = inp.files && inp.files[0];
    inp.remove();
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast('That photo is over 3 MB. Try a smaller one'); return; }
    toast('Uploading…', 9000);
    try {
      const url = await DB.uploadAvatar(file, u.id);
      window._user.avatarUrl = url;
      toast('Photo updated');
      try { renderNav('#nav'); } catch (e) {}
      if (onDone) onDone(url);
    } catch (e) { toast(e.message || 'Could not upload that photo'); }
  });
  inp.click();
}
function _fieldRow(label, input, stacked) {
  const r = el('label', { class: 'ui-field' + (stacked ? ' stacked' : '') });
  r.appendChild(el('span', { class: 'uf-label' }, label));
  r.appendChild(input);
  return r;
}
function openProfileSheet(onSaved) {
  const u = getCurrentUser(); if (!u) return;
  uiSheet('Profile', (sheet, close) => {
    const top = el('div', { class: 'ps-top' });
    const av = el('button', { class: 'you-av is-tap ps-av', type: 'button', 'aria-label': 'Change profile photo' });
    const paintAv = () => {
      if (window._user && window._user.avatarUrl) av.innerHTML = '<img src="' + escHtml(window._user.avatarUrl) + '" alt="">';
      else { av.textContent = initials(u.name || ''); av.setAttribute('data-name', u.name || ''); }
    };
    paintAv();
    av.addEventListener('click', () => pickAvatar(paintAv));
    top.appendChild(av);
    const ch = el('button', { class: 'ui-text-btn', type: 'button' }, 'Change photo');
    ch.addEventListener('click', () => pickAvatar(paintAv));
    top.appendChild(ch);
    sheet.appendChild(top);
    const form = el('div', { class: 'ui-list ps-form' });
    const name = el('input', { type: 'text', autocomplete: 'name', maxlength: '60', 'aria-label': 'Display name' });
    name.value = u.name || '';
    form.appendChild(_fieldRow('Name', name));
    const sel = el('select', { 'aria-label': 'Country' });
    sel.appendChild(el('option', { value: '' }, 'None'));
    (window.COUNTRIES || []).forEach(c => sel.appendChild(el('option', { value: c.code }, flagEmoji(c.code) + ' ' + c.name)));
    sel.value = u.countryCode || '';
    form.appendChild(_fieldRow('Country', sel));
    const ig = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', maxlength: '80', placeholder: '@yourhandle', 'aria-label': 'Instagram handle' });
    ig.value = u.instagram ? '@' + u.instagram : '';
    form.appendChild(_fieldRow('Instagram', ig));
    const tt = el('input', { type: 'text', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', maxlength: '80', placeholder: '@yourhandle', 'aria-label': 'TikTok handle' });
    tt.value = u.tiktok ? '@' + u.tiktok : '';
    form.appendChild(_fieldRow('TikTok', tt));
    let bio = null;
    if (u.userType === 'coach') {
      bio = el('textarea', { rows: '4', maxlength: '600', 'aria-label': 'Coach bio', placeholder: 'Who you coach and how' });
      bio.value = u.bio || '';
      form.appendChild(_fieldRow('Bio', bio, true));
    }
    sheet.appendChild(form);
    sheet.appendChild(el('p', { class: 'ui-sheet-note' }, 'Your name, flag, Instagram and TikTok show on your club board and lifter card.'));
    const save = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Save');
    save.addEventListener('click', async () => {
      if (window._demoMode) { toast('Preview only in demo mode'); return; }
      const nm = name.value.trim();
      if (!nm) { toast('Add your name'); name.focus(); return; }
      const handle = normalizeInstagram(ig.value);
      if (handle === null) { toast('That isn\'t an Instagram handle'); ig.focus(); return; }
      const ttHandle = normalizeTikTok(tt.value);
      if (ttHandle === null) { toast('That isn\'t a TikTok handle. Paste tiktok.com/@you or just @you'); tt.focus(); return; }
      save.disabled = true;
      const done = (msg) => {
        window._user.name = nm; window._user.countryCode = sel.value || null;
        if (bio) window._user.bio = bio.value.trim();
        toast(msg);
        close();
        try { renderNav('#nav'); } catch (e) {}
        try { if (window.PowaClubs && PowaClubs.syncMyStats) PowaClubs.syncMyStats(); } catch (e) {}
        if (onSaved) onSaved();
      };
      try {
        const patch = { name: nm, country_code: sel.value || null, instagram: handle || null, tiktok: ttHandle || null };
        if (bio) patch.bio = bio.value.trim();
        await DB.updateProfile(u.id, patch);
        window._user.instagram = handle || null;
        window._user.tiktok = ttHandle || null;
        done('Profile saved');
      } catch (e) {
        if (e && e.partial) {   // one column isn't live yet: keep the one that saved
          if (!/tiktok/i.test(e.message)) window._user.tiktok = ttHandle || null;
          if (!/instagram/i.test(e.message)) window._user.instagram = handle || null;
          done(e.message); return;
        }
        save.disabled = false; toast(e.message || 'Could not save');
      }
    });
    sheet.appendChild(save);
  }, { cls: 'profile-sheet' });
}
function openNotificationsSheet() {
  uiSheet('Notifications', (sheet) => {
    const a = el('div', { class: 'set-sheet-box' });
    const b = el('div', { class: 'set-sheet-box' });
    sheet.appendChild(a); sheet.appendChild(b);
    renderNotifPrefs(a); renderEmailPrefs(b);
  }, { cls: 'settings-sheet' });
}
function openSecuritySheet() {
  const u = getCurrentUser(); if (!u) return;
  uiSheet('Security', (sheet) => {
    sheet.appendChild(uiList([uiRow({ title: 'Account email', end: u.email || '–' })]));
    const pwd = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'At least 6 characters', 'aria-label': 'New password' });
    const f = el('div', { class: 'ui-list ps-form' });
    f.appendChild(_fieldRow('New password', pwd, true));
    sheet.appendChild(f);
    const save = el('button', { class: 'btn btn-lg btn-block ui-btn-soft set-gap', type: 'button' }, 'Change password');
    save.addEventListener('click', async () => {
      if (window._demoMode) { toast('Preview only in demo mode'); return; }
      const v = pwd.value;
      if (!v || v.length < 6) { toast('Use at least 6 characters'); pwd.focus(); return; }
      save.disabled = true;
      try { const { error } = await sb.auth.updateUser({ password: v }); if (error) throw error; pwd.value = ''; toast('Password changed'); }
      catch (e) { toast(e.message || 'Could not change it'); }
      finally { save.disabled = false; }
    });
    sheet.appendChild(save);
    const mfa = el('div', { class: 'set-sheet-box' });
    sheet.appendChild(mfa);
    renderMfaCard(mfa);
    try { attachPwdToggles(); } catch (e) {}
  }, { cls: 'settings-sheet' });
}
function openPlanSheet() {
  uiSheet('Plan & billing', (sheet) => { const b = el('div', { class: 'set-sheet-box' }); sheet.appendChild(b); renderPlanManageCard(b); }, { cls: 'settings-sheet' });
}
function openReferralSheet() {
  uiSheet('Refer a lifter', (sheet) => { const b = el('div', { class: 'set-sheet-box' }); sheet.appendChild(b); renderReferralCard(b); }, { cls: 'settings-sheet' });
}
function openDataSheet() {
  uiSheet('Your data', (sheet, close) => {
    sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Download everything we hold for your account. JSON is the full archive; CSV is your training log, ready to re-import anywhere.'));
    const row = el('div', { class: 'set-sheet-2' });
    const j = el('button', { class: 'btn btn-lg ui-btn-soft', type: 'button' }, 'Export JSON');
    j.addEventListener('click', () => exportMyData('json'));
    const c = el('button', { class: 'btn btn-lg ui-btn-soft', type: 'button' }, 'Export CSV');
    c.addEventListener('click', () => exportMyData('csv'));
    row.appendChild(j); row.appendChild(c);
    sheet.appendChild(row);
    const danger = el('div', { class: 'set-danger' });
    danger.appendChild(el('p', {}, 'Deleting your account erases your training data for good.'));
    const del = el('button', { class: 'btn btn-danger btn-lg btn-block', type: 'button' }, 'Delete my account');
    del.addEventListener('click', () => { close(); setTimeout(() => deleteMyAccount(), 240); });
    danger.appendChild(del);
    sheet.appendChild(danger);
  }, { cls: 'settings-sheet' });
}
// The Settings rows both You hubs share.
function youSettingsRows(role, rerender) {
  const u = getCurrentUser() || {};
  const inShell = document.documentElement.classList.contains('native');
  const showPlan = role === 'coach' && (!inShell || !!window._iapReady);
  const tier = (window._user && window._user.subscriptionTier) || 'free';
  return [
    { label: 'Profile', value: u.countryCode ? flagEmoji(u.countryCode) : '', onClick: () => openProfileSheet(rerender) },
    showPlan ? { label: 'Plan & billing', value: (typeof TIER_LABELS !== 'undefined' && TIER_LABELS[tier]) || '', onClick: () => openPlanSheet() } : null,
    { label: 'Notifications', onClick: () => openNotificationsSheet() },
    { label: 'Security', onClick: () => openSecuritySheet() },
    { label: 'Units', value: getUnit() === 'lbs' ? 'lb' : 'kg', onClick: () => toggleUnit() },
    { label: 'Your data', onClick: () => openDataSheet() }
  ];
}
Object.assign(window, { pickAvatar, openProfileSheet, openNotificationsSheet, openSecuritySheet, openPlanSheet, openReferralSheet, openDataSheet, youSettingsRows });

// =========================================================
// NATIVE FEEL (2026-10-17): the physical details an iPhone app has.
//   hapticTick()   the selection click (RPE pick, stepper, switch, chart scrub)
//   _sheetDrag()   drag any bottom sheet down to close it (flick or pull a third)
//   edge swipe     from the left edge on a sub-screen goes back to its parent
//   folding title  the large title moves into the top bar as you scroll
// The swipe and the title only run in the native shell (html.native).
// =========================================================
function hapticTick() { try { if (window.PowaNative && PowaNative.tick) PowaNative.tick(); } catch (e) {} }
function hapticTap(style) { try { if (window.PowaNative && PowaNative.isNative && PowaNative.isNative()) PowaNative.haptic(style || 'LIGHT'); } catch (e) {} }

// The sheet follows the finger 1:1 from the top of its scroll after 8px of
// downward travel (so taps, fields and inner scrolling behave as before). Past a
// third of its height, or a downward flick, it closes; anything less springs back.
function _sheetDrag(veil, sheet, close) {
  let y0 = 0, x0 = 0, dy = 0, armed = false, dragging = false, crossed = false, samples = [];
  const height = () => sheet.getBoundingClientRect().height || 1;
  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable], .no-sheet-drag')) return;
    for (let n = t; n && n !== veil; n = n.parentElement) { if (n.scrollTop > 0) return; }
    armed = true; dragging = false; crossed = false; dy = 0;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX;
    samples = [{ y: y0, t: e.timeStamp }];
  }, { passive: true });
  sheet.addEventListener('touchmove', (e) => {
    if (!armed) return;
    const y = e.touches[0].clientY, x = e.touches[0].clientX, d = y - y0;
    if (!dragging) {
      if (Math.abs(x - x0) > 10 && Math.abs(x - x0) > Math.abs(d)) { armed = false; return; }
      if (d < -8) { armed = false; return; }
      if (d < 8) return;
      dragging = true;
      sheet.style.transition = 'none';
    }
    e.preventDefault();
    dy = Math.max(0, d - 8);
    sheet.style.transform = 'translateY(' + dy + 'px)';
    veil.style.backgroundColor = 'rgba(0, 0, 0, ' + (0.55 * Math.max(0, 1 - dy / height())).toFixed(3) + ')';
    samples.push({ y, t: e.timeStamp }); if (samples.length > 6) samples.shift();
    const over = dy > height() / 3;
    if (over !== crossed) { crossed = over; hapticTick(); }
  }, { passive: false });
  const end = () => {
    if (!armed) return;
    armed = false;
    if (!dragging) return;
    dragging = false;
    // The finger-up after a drag must not also tap whatever is under it.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    sheet.addEventListener('click', swallow, true);
    setTimeout(() => sheet.removeEventListener('click', swallow, true), 350);
    // Release speed over the last ~100 ms (needs a real 16 ms+ span to count).
    const b = samples[samples.length - 1];
    const a = samples.find(p => b.t - p.t <= 100) || samples[0];
    const v = (b && a && b.t - a.t >= 16) ? (b.y - a.y) / (b.t - a.t) : 0;   // px per ms
    if (dy > height() / 3 || (v > 0.6 && dy > 24)) {
      veil.style.backgroundColor = '';
      close();
    } else {
      sheet.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
      sheet.style.transform = '';
      veil.style.backgroundColor = '';
      setTimeout(() => { sheet.style.transition = ''; }, 340);
    }
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}

// Swipe from the left edge on a sub-screen ("‹ Progress" above it) to go back.
(function edgeSwipeBack() {
  let x0 = 0, y0 = 0, dx = 0, vx = 0, lastX = 0, lastT = 0, pane = null, back = null, armed = false, live = false;
  document.addEventListener('touchstart', (e) => {
    if (!document.documentElement.classList.contains('native') || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > 24) return;
    if (document.querySelector('.ui-sheet-veil, .pr-toast')) return;
    back = document.querySelector('.pane-back');
    pane = back && back.closest('[data-pane]');
    if (!pane) return;
    armed = true; live = false; dx = 0; vx = 0;
    x0 = lastX = t.clientX; y0 = t.clientY; lastT = e.timeStamp;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!armed) return;
    const t = e.touches[0], mx = t.clientX - x0, my = t.clientY - y0;
    if (!live) {
      if (Math.abs(my) > 10 && Math.abs(my) > mx) { armed = false; return; }
      if (mx < 8) return;
      live = true;
      pane.style.transition = 'none';
    }
    e.preventDefault();
    dx = Math.max(0, mx);
    if (e.timeStamp > lastT) vx = (t.clientX - lastX) / (e.timeStamp - lastT);
    lastX = t.clientX; lastT = e.timeStamp;
    pane.style.transform = 'translateX(' + dx + 'px)';
    pane.style.opacity = String(Math.max(0.55, 1 - dx / innerWidth * 0.6));
  }, { passive: false });
  const end = () => {
    if (!armed) return;
    armed = false;
    if (!live) return;
    live = false;
    const p = pane, b = back, w = innerWidth;
    p.style.transition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms cubic-bezier(0.22, 1, 0.36, 1)';
    if (dx > w * 0.35 || (vx > 0.5 && dx > 40)) {
      p.style.transform = 'translateX(' + w + 'px)';
      p.style.opacity = '0.55';
      hapticTap('LIGHT');
      setTimeout(() => { b.click(); p.style.transition = ''; p.style.transform = ''; p.style.opacity = ''; }, 200);
    } else {
      p.style.transform = ''; p.style.opacity = '';
      setTimeout(() => { p.style.transition = ''; }, 260);
    }
  };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
})();

// The large page title folds into the top bar once it scrolls under it.
(function foldingTitle() {
  let mini = null, queued = false;
  const update = () => {
    queued = false;
    if (!document.documentElement.classList.contains('native')) return;
    const nav = document.querySelector('.nav');
    if (!nav) return;
    if (!mini) { mini = el('div', { class: 'nav-mini-title', 'aria-hidden': 'true' }); nav.appendChild(mini); }
    const pane = Array.from(document.querySelectorAll('.dash-main > section[data-pane]')).find(p => p.offsetParent !== null);
    const h = pane && pane.querySelector('h1, h2');
    const show = !!(h && h.textContent.trim() && h.getBoundingClientRect().bottom < nav.getBoundingClientRect().bottom + 2);
    if (show) mini.textContent = h.textContent.trim();
    mini.classList.toggle('on', show);
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  document.addEventListener('scroll', queue, { capture: true, passive: true });
  document.addEventListener('click', () => setTimeout(queue, 80), true);
})();
Object.assign(window, { hapticTick, hapticTap });

// =========================================================
// RATE THE APP (2026-10-17): ask for an App Store rating at a high point (a PR,
// a plate milestone), once every four months at most and only after three
// training days. iOS decides whether the prompt shows (3 times a year at most).
// Native only; inert until the shell exposes PowaIAP.requestReview (build 4).
// =========================================================
function maybeAskForRating(reason) {
  try {
    if (!(window.PowaNative && PowaNative.isNative && PowaNative.isNative()) || window._demoMode) return;
    const P = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.PowaIAP;
    if (!P || typeof P.requestReview !== 'function') return;
    const last = Number(localStorage.getItem('powa-rate-asked') || 0);
    if (Date.now() - last < 120 * 86400000) return;
    const me = window._user && window._user.id;
    const days = new Set((Store.get().workoutLogs || []).filter(l => !me || l.athleteId === me).map(l => l.date));
    if (days.size < 3) return;
    localStorage.setItem('powa-rate-asked', String(Date.now()));
    setTimeout(() => { try { P.requestReview({ reason: reason || '' }); } catch (e) {} }, 3500);
  } catch (e) {}
}
window.maybeAskForRating = maybeAskForRating;

// =========================================================
// MEET MODE (2026-10-17): meet day, live. Three attempts a lift; the lifter (or
// their handler) marks the three judge lights and how the bar moved, and the
// next attempt is picked from that. Pure helpers, unit-tested in tests.html.
// =========================================================
function meetStep(unit) { return unit === 'lbs' ? 5 * KG_PER_LB : 2.5; }
function roundMeet(kg, unit) { const s = meetStep(unit); return Math.round(Number(kg) / s) * s; }
// Good lift = two or more white lights. null until all three are in.
function meetLightsResult(lights) {
  const l = lights || [];
  const w = l.filter(x => x === 'white').length, r = l.filter(x => x === 'red').length;
  return w + r < 3 ? null : (w >= 2 ? 'good' : 'no');
}
// Made it: the planned jump, a step bigger if the bar flew, two steps smaller if
// it ground (never under one step). Missed it: take it again.
function meetNextAttempt(prevKg, result, feel, plannedNextKg, unit) {
  const step = meetStep(unit);
  if (result !== 'good') return roundMeet(prevKg, unit);
  let jump = Math.max(step, (Number(plannedNextKg) || 0) - prevKg);
  if (feel === 'fast') jump += step;
  else if (feel === 'grind') jump = Math.max(step, jump - 2 * step);
  return roundMeet(prevKg + jump, unit);
}
// Best good lift per discipline, total so far, made / taken, and bomb-outs.
function meetStanding(lifts) {
  const out = { best: {}, total: 0, made: 0, taken: 0, bombed: [] };
  ['squat', 'bench', 'deadlift'].forEach(l => {
    const att = (lifts && lifts[l] && lifts[l].attempts) || [];
    const good = att.filter(a => a.result === 'good').map(a => Number(a.kg));
    out.taken += att.filter(a => a.result).length;
    out.made += good.length;
    out.best[l] = good.length ? Math.max(...good) : null;
    if (out.best[l]) out.total += out.best[l];
    if (att.length === 3 && att.every(a => a.result === 'no')) out.bombed.push(l);
  });
  return out;
}
// Warm-up caller: when to take each warm-up, counted in attempts still to go
// before yours (about a minute each); the last one about four out.
function warmupCaller(openerKg, unit) {
  const barKg = unit === 'lbs' ? 45 * KG_PER_LB : 20, step = meetStep(unit);
  const r = (p) => Math.max(barKg, Math.round(openerKg * p / step) * step);
  const ramp = [
    { kg: barKg, reps: 5, out: 24 }, { kg: r(0.5), reps: 3, out: 20 }, { kg: r(0.65), reps: 2, out: 16 },
    { kg: r(0.75), reps: 1, out: 12 }, { kg: r(0.85), reps: 1, out: 8 }, { kg: r(0.92), reps: 1, out: 4 }
  ];
  const seen = new Set();
  return ramp.filter(s => s.kg < openerKg && !seen.has(s.kg) && seen.add(s.kg));
}
Object.assign(window, { meetStep, roundMeet, meetLightsResult, meetNextAttempt, meetStanding, warmupCaller });

// =========================================================
// PROGRAM FROM A SPREADSHEET (2026-10-17): a coach pastes a program straight
// out of Google Sheets, Excel or Notes and it becomes a POWALIFTA program.
// Reads both shapes coaches use: a table with a header row (Week | Day |
// Exercise | Sets | Reps | Load | RPE …) or written blocks ("Week 1",
// "Day 1", "Squat 3x5 @8", "Bench 5x3 @ 82.5kg"). Percentages ride along in
// the exercise note (the program has no %-of-max field). Pure: tests.html.
// =========================================================
function _sheetCells(line, delim) {
  if (delim === '\t') return line.split('\t').map(c => c.trim());
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
// "Paused bench" → { lift: 'bench', variant: 'Paused' }; accessories keep their name.
function matchExercise(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim(), s = n.toLowerCase();
  const variantOf = (lift) => Object.keys(VARIANTS[lift]).find(v => v !== 'Competition' && s.includes(v.toLowerCase())) || 'Competition';
  if (/\brdl\b|romanian/.test(s)) return { lift: 'deadlift', variant: 'RDL', exerciseName: '' };
  if (/front squat|hack squat|split squat|goblet|leg press|lunge|leg curl|leg extension|calf|hip thrust|glute|hamstring|\bquad/.test(s)) return { lift: 'legs', variant: '', exerciseName: n };
  if (/squat/.test(s)) return { lift: 'squat', variant: variantOf('squat'), exerciseName: '' };
  if (/bench/.test(s) && !/dumbbell|\bdb\b/.test(s)) return { lift: 'bench', variant: variantOf('bench'), exerciseName: '' };
  if (/deadlift|\bdl\b|\bdead\b|\bdeads\b/.test(s)) return { lift: 'deadlift', variant: variantOf('deadlift'), exerciseName: '' };
  if (/row|pull|chin|lat\b|pulldown|curl|face pull|shrug|rear delt/.test(s)) return { lift: 'pull', variant: '', exerciseName: n };
  if (/press|dip|tricep|push|raise|fly|flye|pec/.test(s)) return { lift: 'push', variant: '', exerciseName: n };
  return { lift: 'other', variant: '', exerciseName: n };
}
// "3x5 @8", "5 x 3 @ RPE 7.5", "1x2 82.5kg", "4x8 70%", "3 sets of 10".
function parsePrescription(str, unit) {
  const s = String(str || '');
  let m, sets = null, reps = null, rpe = null, kg = null, pct = null;
  if ((m = s.match(/(\d+)\s*(?:x|×|\*|sets?\s*(?:of|x)?)\s*(\d+)/i))) { sets = +m[1]; reps = +m[2]; }
  if ((m = s.match(/(?:@\s*rpe\s*|\brpe\s*@?\s*|@\s*)(\d{1,2}(?:\.5)?)(?!\d|\.\d|\s*(?:kg|lb|%))/i))) { const v = +m[1]; if (v >= 5 && v <= 10) rpe = v; }
  if ((m = s.match(/\brir\s*(\d)/i)) && rpe == null) rpe = 10 - +m[1];
  if ((m = s.match(/(\d+(?:\.\d+)?)\s*(kgs?|lbs?)\b/i))) kg = /lb/i.test(m[2]) ? +m[1] * KG_PER_LB : +m[1];
  if ((m = s.match(/(\d{2,3}(?:\.\d+)?)\s*%/))) pct = +m[1];
  if (kg == null && sets != null) {
    // A bare load after the scheme ("Squat 3x5 180") is in the coach's unit.
    const rest = s.replace(/(\d+)\s*(?:x|×|\*|sets?\s*(?:of|x)?)\s*(\d+)/i, ' ').replace(/(?:@\s*rpe\s*|\brpe\s*@?\s*|@\s*)\d{1,2}(?:\.5)?/i, ' ').replace(/\d{2,3}(?:\.\d+)?\s*%/, ' ');
    const b = rest.match(/(?:^|\s)(\d{2,3}(?:\.\d+)?)(?=\s|$)/);
    if (b && +b[1] >= 20) kg = unit === 'lbs' ? +b[1] * KG_PER_LB : +b[1];
  }
  return { sets, reps, rpe, kg, pct };
}
function parseProgramSheet(text, opts) {
  opts = opts || {};
  const unit = opts.unit || 'kg';
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim());
  const weeks = [], warnings = [];
  let wk = null, day = null, lastEx = null;
  const ensureWeek = (n) => {
    if (wk && (n == null || wk.number === n)) return wk;
    wk = weeks.find(w => w.number === n) || null;
    if (!wk) { wk = { id: uid('wk'), number: n != null ? n : weeks.length + 1, days: [] }; weeks.push(wk); }
    day = null; lastEx = null;
    return wk;
  };
  const ensureDay = (name) => {
    ensureWeek(wk ? wk.number : 1);
    const nm = (name || 'Day ' + (wk.days.length + 1)).trim();
    if (day && day.name === nm) return day;
    day = wk.days.find(d => d.name === nm) || null;
    if (!day) { day = { id: uid('day'), name: nm, exercises: [] }; wk.days.push(day); }
    lastEx = null;
    return day;
  };
  const addSets = (name, p, note) => {
    if (!day) ensureDay(null);
    const ex = matchExercise(name);
    const key = ex.lift + '|' + ex.variant + '|' + ex.exerciseName;
    let target = lastEx && lastEx._key === key ? lastEx : null;
    if (!target) {
      target = newExercise(ex.lift, ex.variant, ex.exerciseName);
      target._key = key;
      day.exercises.push(target);
      lastEx = target;
    }
    const n = Math.max(1, Math.min(20, p.sets || 1));
    for (let i = 0; i < n; i++) target.sets.push(newSet(p.kg ? Math.round(p.kg * 100) / 100 : 0, p.reps || 0, p.rpe));
    const bits = [];
    if (p.pct) bits.push(p.pct + '%');
    if (note) bits.push(note);
    if (bits.length) target.note = (target.note ? target.note + ' · ' : '') + bits.join(' · ');
  };

  const delim = lines.some(l => l.includes('\t')) ? '\t' : (lines.some(l => l.includes(',')) ? ',' : null);
  let header = null, hi = -1;
  if (delim) {
    for (let i = 0; i < Math.min(lines.length, 6) && !header; i++) {
      const cells = _sheetCells(lines[i], delim).map(c => c.toLowerCase());
      const col = (re) => cells.findIndex(c => re.test(c));
      const ex = col(/exercise|movement|^lift$|^lifts?\b/);
      if (ex >= 0 && (col(/^reps?$|sets?\s*x\s*reps?|scheme|prescription/) >= 0 || col(/^sets?$/) >= 0)) {
        header = { week: col(/^w(ee)?k/), day: col(/^day|session/), ex, sets: col(/^sets?$/), reps: col(/^reps?$/),
          scheme: col(/sets?\s*x\s*reps?|scheme|prescription/), load: col(/load|weight|^kg|^lbs?$|intensity/),
          rpe: col(/^rpe|^@|^rir/), pct: col(/%|percent/), note: col(/note|cue|comment/) };
        header.rir = header.rpe >= 0 && /rir/.test(cells[header.rpe]);
        hi = i;
      }
    }
  }
  if (header) {
    lines.slice(hi + 1).forEach(line => {
      const c = _sheetCells(line, delim);
      const get = (k) => (header[k] >= 0 ? (c[header[k]] || '').trim() : '');
      const wkTxt = get('week'), dayTxt = get('day'), name = get('ex');
      if (wkTxt) { const n = parseInt(wkTxt.replace(/[^0-9]/g, ''), 10); if (n) ensureWeek(n); }
      if (dayTxt) ensureDay(/^\d+$/.test(dayTxt) ? 'Day ' + dayTxt : dayTxt);
      if (!name) { if (!wkTxt && !dayTxt) warnings.push(line.trim()); return; }
      const scheme = parsePrescription(get('scheme') + ' ' + get('load') + ' ' + (get('rpe') ? '@' + get('rpe') : ''), unit);
      const p = {
        sets: parseInt(get('sets'), 10) || scheme.sets || 1,
        reps: parseInt(get('reps'), 10) || scheme.reps || 0,
        rpe: scheme.rpe,
        kg: scheme.kg,
        pct: (get('pct') ? parseFloat(get('pct')) : null) || scheme.pct
      };
      if (header.rir) { const r = parseFloat(get('rpe')); p.rpe = !isNaN(r) && r >= 0 && r <= 5 ? 10 - r : null; }
      if (p.kg == null && get('load') && /^\d+(\.\d+)?$/.test(get('load'))) p.kg = unit === 'lbs' ? +get('load') * KG_PER_LB : +get('load');
      if (!p.reps) { warnings.push(line.trim()); return; }
      addSets(name, p, get('note'));
    });
  } else {
    const DAY_RE = /^(day\s*\d+\b.*|(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b.*|session\s*\d+.*)$/i;
    lines.forEach(raw => {
      const line = raw.replace(/^[\s•\-*–]+/, '').trim();
      let m;
      if ((m = line.match(/^(?:week|wk)\s*(\d+)\b/i))) { ensureWeek(+m[1]); const after = line.slice(m[0].length).replace(/^[\s:–\-,|]+/, ''); if (DAY_RE.test(after)) ensureDay(after.replace(/[:\s]+$/, '')); return; }
      const p = parsePrescription(line, unit);
      if (p.sets != null && p.reps) {
        const idx = line.search(/(\d+)\s*(?:x|×|\*|sets?\s*(?:of|x)?)\s*(\d+)/i);
        const name = line.slice(0, idx).replace(/[\s:–\-,|@]+$/, '').trim();
        if (!name) { warnings.push(raw.trim()); return; }
        addSets(name, p, null);
        return;
      }
      if (DAY_RE.test(line) || (/:$/.test(line) && !/\d+\s*x\s*\d+/i.test(line))) { ensureDay(line.replace(/[:\s]+$/, '')); return; }
      warnings.push(raw.trim());
    });
  }
  weeks.forEach(w => w.days.forEach(d => d.exercises.forEach(e => { delete e._key; })));
  const days = weeks.reduce((a, w) => a + w.days.length, 0);
  const exercises = weeks.reduce((a, w) => a + w.days.reduce((b, d) => b + d.exercises.length, 0), 0);
  const sets = weeks.reduce((a, w) => a + w.days.reduce((b, d) => b + d.exercises.reduce((c, e) => c + e.sets.length, 0), 0), 0);
  return { name: opts.name || 'Imported program', weeks: weeks.sort((a, b) => a.number - b.number), warnings, stats: { weeks: weeks.length, days, exercises, sets } };
}
Object.assign(window, { parseProgramSheet, parsePrescription, matchExercise });

// =========================================================
// YOUR YEAR IN LIFTING (2026-10-17): POWALIFTA Wrapped. Everything here comes
// from the lifter's own logs and weigh-ins. Pure: unit-tested in tests.html.
//   logs: workout logs (any athlete), bw: bodyweight rows, year: 2026
// =========================================================
const WRAP_DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const WRAP_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function yearInLifting(logs, bw, athleteId, year) {
  const y = String(year);
  const all = (logs || []).filter(l => l && l.athleteId === athleteId && String(l.date || '').slice(0, 4) <= y).slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id || '').localeCompare(String(b.id || '')));
  const mine = all.filter(l => String(l.date).slice(0, 4) === y);
  const lifting = mine.filter(l => l.lift !== 'cardio');
  const days = Array.from(new Set(mine.map(l => l.date))).sort();
  const tonnageKg = Math.round(lifting.reduce((a, l) => a + (Number(l.weight) || 0) * (Number(l.reps) || 0), 0));
  // PRs: a main-lift set whose competition-equivalent e1RM beats everything before it.
  const best = {}, startOfYear = {}, prs = { count: 0 };
  all.forEach(l => {
    if (!['squat', 'bench', 'deadlift'].includes(l.lift) || !(l.e1rmComp > 0)) return;
    const inYear = String(l.date).slice(0, 4) === y;
    if (!inYear) { best[l.lift] = Math.max(best[l.lift] || 0, l.e1rmComp); return; }
    if (startOfYear[l.lift] == null) startOfYear[l.lift] = best[l.lift] || null;
    if (!(best[l.lift] > 0) || l.e1rmComp > best[l.lift] + 0.05) { if (best[l.lift] > 0) prs.count++; best[l.lift] = l.e1rmComp; }
  });
  const yearBest = {};
  lifting.forEach(l => { if (['squat', 'bench', 'deadlift'].includes(l.lift) && l.e1rmComp > (yearBest[l.lift] || 0)) yearBest[l.lift] = l.e1rmComp; });
  let jump = null;
  Object.keys(yearBest).forEach(k => {
    const from = startOfYear[k] || lifting.filter(l => l.lift === k).map(l => l.e1rmComp).find(v => v > 0) || 0;
    const d = yearBest[k] - from;
    if (from > 0 && d > 0 && (!jump || d > jump.gainKg)) jump = { lift: k, fromKg: from, toKg: yearBest[k], gainKg: d };
  });
  const byDow = [0, 0, 0, 0, 0, 0, 0], byMonth = new Array(12).fill(0);
  days.forEach(d => { const dt = new Date(d + 'T12:00:00Z'); byDow[dt.getUTCDay()]++; byMonth[dt.getUTCMonth()]++; });
  const topDow = days.length ? byDow.indexOf(Math.max(...byDow)) : null;
  const topMonth = days.length ? byMonth.indexOf(Math.max(...byMonth)) : null;
  // Longest run of consecutive ISO weeks with at least one session.
  const weekKey = (d) => { const dt = new Date(d + 'T12:00:00Z'); const dow = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dow); return dt.getTime(); };
  const weeks = Array.from(new Set(days.map(weekKey))).sort((a, b) => a - b);
  let streak = weeks.length ? 1 : 0, run = 1;
  for (let i = 1; i < weeks.length; i++) { run = weeks[i] - weeks[i - 1] === 7 * 86400000 ? run + 1 : 1; streak = Math.max(streak, run); }
  const bws = (bw || []).filter(b => b && b.athleteId === athleteId && String(b.date).slice(0, 4) === y && b.weight > 0).sort((a, b) => a.date.localeCompare(b.date));
  return {
    year: Number(year), sessions: days.length, sets: mine.length, tonnageKg,
    prs: prs.count, jump, best: yearBest,
    topDay: topDow == null ? null : WRAP_DAYS[topDow], topMonth: topMonth == null ? null : WRAP_MONTHS[topMonth],
    longestStreakWeeks: streak,
    bw: bws.length >= 2 ? { startKg: bws[0].weight, endKg: bws[bws.length - 1].weight } : null
  };
}
// "That's 52 elephants": the friendliest big comparison for a tonnage.
function tonnageComparison(kg) {
  const things = [
    { kg: 150000, one: 'blue whale', many: 'blue whales' },
    { kg: 6000, one: 'African elephant', many: 'African elephants' },
    { kg: 1500, one: 'car', many: 'cars' },
    { kg: 450, one: 'grand piano', many: 'grand pianos' },
    { kg: 20, one: 'Olympic bar', many: 'Olympic bars' }
  ];
  const t = things.find(x => kg / x.kg >= 2) || things[things.length - 1];
  const n = Math.round(kg / t.kg);
  return n + ' ' + (n === 1 ? t.one : t.many);
}
Object.assign(window, { yearInLifting, tonnageComparison });
