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
function requireAuth(expectedType) {
  const user = getCurrentUser();
  if (!user) { location.href = 'index.html'; return null; }
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
  location.href = 'index.html';
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
  const programs = [{ id: 'demo-prog', athleteId: DA, coachId: DC, name: 'Strength Block — Wave 2', weeks }];

  const sessionNotes = [
    // Dated TODAY so the live session leads with the "Coach feedback" card —
    // the clearest signal in the demo that a real coach is programming for you.
    { id: 'demo-note-today', athleteId: DA, weekId: null, dayId: null, date: iso(new Date()), note: '', coachComment: 'Before today: the top set is RPE 8.5 — leave 1–2 in the tank, this isn\'t a max. Back-offs at 8. Film the heavy single and drop it in the form-check tab, I want eyes on your brace out of the hole.', coachCommentAt: iso(new Date()) + 'T08:30:00Z', coachId: DC },
    { id: 'demo-note-1', athleteId: DA, weekId: null, dayId: null, date: daysAgo(2), note: 'Pulls felt heavy off the floor today but lockout was easy.', coachComment: 'Bar speed on video looked fine — that\'s just deficit fatigue. We deload in two weeks. Keep the openers honest.', coachCommentAt: daysAgo(1) + 'T10:00:00Z', coachId: DC },
    { id: 'demo-note-2', athleteId: DA, weekId: null, dayId: null, date: daysAgo(7), note: 'Bench PR! Moved fast.', coachComment: 'Saw it. Adding 2.5kg to your top sets.', coachCommentAt: daysAgo(6) + 'T10:00:00Z', coachId: DC }
  ];
  const checkins = [{ id: 'demo-ci-1', athleteId: DA, weekStart: daysAgo(9), sleep: 7, soreness: 6, stress: 4, feel: 8, note: 'Good week.', createdAt: daysAgo(9) + 'T08:00:00Z' }];

  // A live thread with the coach. The Coach tab weaves these together with the
  // session notes above into one conversation history (see renderMessageThread).
  const at = (n, hh, mm) => daysAgo(n) + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00Z';
  const messages = [
    { id: 'demo-amsg-1', coachId: DC, athleteId: DA, senderId: DC, body: 'Heavy single on squat today — film it and drop it in the form-check tab. I want eyes on your brace out of the hole.', createdAt: at(2, 8, 30), readAt: at(2, 9, 0) },
    { id: 'demo-amsg-2', coachId: DC, athleteId: DA, senderId: DA, body: 'Will do. Felt a little soft out of the bottom last week, not sure if it was the brace or just fatigue.', createdAt: at(2, 18, 5), readAt: at(2, 19, 0) },
    { id: 'demo-amsg-3', coachId: DC, athleteId: DA, senderId: DC, body: 'Could be both. Big air, brace hard, then break at the hips. Send the clip and I\'ll tell you which one it is.', createdAt: at(1, 7, 45), readAt: null }
  ];

  // --- Competition history: two past meets so Progress shows a best total + a
  // PR trend. Best successful lift per discipline (kg). ---
  const meets = [
    { id: 'demo-meet-1', athleteId: DA, name: 'Winter Open', date: daysAgo(217), federation: 'USAPL', weightClass: '83kg', bodyweight: 82.6, squat: 175, bench: 110, deadlift: 205, notes: 'First meet — went 8/9, missed third squat.', createdAt: daysAgo(217) + 'T18:00:00Z' },
    { id: 'demo-meet-2', athleteId: DA, name: 'Spring Classic', date: daysAgo(96), federation: 'USAPL', weightClass: '83kg', bodyweight: 82.9, squat: 185, bench: 115, deadlift: 215, notes: '9/9 day. New total PR.', createdAt: daysAgo(96) + 'T18:00:00Z' }
  ];

  return {
    user: user,
    store: {
      coaches, athletes: [], invites: [], programs, programTemplates: [],
      workoutLogs, bodyweight, sessionNotes, goals, restDays, checkins, messages, meets,
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
  const athletes = roster.map(r => ({ id: r.id, name: r.name, email: r.email, coachId: DC, avatarUrl: null, countryCode: null }));

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
    { id: 'demo-msg-1', coachId: DC, athleteId: 'demo-a1', senderId: DC, body: 'Squat day today — one top single at RPE 8.5, then two back-offs at 8. Don\'t chase a max, just move it clean.', createdAt: at(4, 9, 15), readAt: at(4, 18, 0) },
    { id: 'demo-msg-2', coachId: DC, athleteId: 'demo-a1', senderId: 'demo-a1', body: 'Hit 172.5 for the single, honestly felt like an opener.', createdAt: at(4, 18, 40), readAt: at(4, 19, 0) },
    { id: 'demo-msg-3', coachId: DC, athleteId: 'demo-a1', senderId: DC, body: 'That\'s exactly what I wanted to see. We\'ll go to 175 next week and hold the back-offs.', createdAt: at(4, 19, 2), readAt: at(4, 20, 0) },
    { id: 'demo-msg-4', coachId: DC, athleteId: 'demo-a1', senderId: 'demo-a1', body: 'Quick one — sleeves on for the heavy sets or save them for the meet?', createdAt: at(1, 7, 30), readAt: null },
    { id: 'demo-msg-5', coachId: DC, athleteId: 'demo-a2', senderId: 'demo-a2', body: 'Paused bench is finally clicking, the reps moved way faster this week.', createdAt: at(3, 12, 10), readAt: at(2, 8, 0) },
    { id: 'demo-msg-6', coachId: DC, athleteId: 'demo-a2', senderId: DC, body: 'Good. Same weights once more, then we add load. The pause is buying you a stronger press off the chest.', createdAt: at(2, 8, 20), readAt: at(2, 9, 0) },
    { id: 'demo-msg-7', coachId: DC, athleteId: 'demo-a3', senderId: DC, body: 'Haven\'t seen a log in over a week — everything alright?', createdAt: at(8, 10, 0), readAt: at(8, 11, 0) },
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
    { id: 'demo-mkt-2', coachId: DC, title: 'Peaking Protocol', description: 'A 4-week meet peak — taper volume, sharpen openers, and walk in primed. Includes attempt-selection guidance and a final-week template.', tier: 'short', category: 'peaking', priceCents: 3999, weekCount: 4, status: 'published', soldCount: 5, createdAt: tsAgo(90), programPayload: { weeks: programs[2].weeks }, reference1RMs: { squat: 215, bench: 140, deadlift: 260 } },
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
      marketplacePrograms, mySales, myPurchases: []
    }
  };
}

function _injectDemoBanner(type) {
  const bar = document.createElement('div');
  bar.className = 'demo-banner';
  const text = type === 'coach'
    ? '<strong>Live demo</strong> — fake roster, real product. Open the builder, reply to notes, check the flags. Nothing saves.'
    : '<strong>Live demo</strong> — fake lifter, real product. Tick sets, hit PRs, make share cards. Nothing saves.';
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
window.applyPendingReferral = applyPendingReferral;

async function bootstrap(expectedType, onReady, opts) {
  opts = opts || {};

  // Stash any ?ref=CODE the moment a page loads, before auth resolves, so the
  // attribution survives the whole signup round-trip (incl. email confirmation).
  captureReferralFromUrl();

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
    toast('Could not reach the server — check your connection.');
    return;
  }
  if (!session) {
    if (expectedType) { location.href = 'index.html'; return; }
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
    location.href = 'index.html';
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
    referralCode: profile.referral_code || null,
    referredByCode: profile.referred_by_code || null
  };

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
    toast('Could not load your data — try refreshing.');
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
  // Fall back to system preference for first-time visitors. We default to dark
  // because the brand is dark-first; only honor explicit "light" pref.
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

// Register the service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW register failed:', err));
  });
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

const PowaPush = {
  supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },
  configured() {
    return typeof VAPID_PUBLIC_KEY === 'string' && VAPID_PUBLIC_KEY.length > 20;
  },
  permission() {
    return this.supported() ? Notification.permission : 'unsupported';
  },
  async isSubscribed() {
    if (!this.supported()) return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      return !!(await reg.pushManager.getSubscription());
    } catch { return false; }
  },
  // Ask permission, subscribe, persist. Returns true on success.
  async enable() {
    if (!this.supported()) { toast('Notifications are not supported on this browser'); return false; }
    if (!this.configured()) { toast('Push not configured yet — add a VAPID key'); return false; }
    if (window._demoMode) { toast('Notifications need a real account'); return false; }

    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(perm === 'denied' ? 'Notifications blocked — enable them in browser settings' : 'Notifications not enabled'); return false; }

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
        ? 'Your browser couldn’t reach a push service — try Chrome or the installed app'
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
      toast('Couldn’t save your alert settings — please try again');
      return false;
    }

    toast('Notifications on');
    return true;
  },
  // Unsubscribe this device and forget it server-side.
  async disable() {
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
  // Show our banner if not dismissed
  if (!_pwaDismissedRecently() && !_isStandalone()) showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  hideInstallBanner();
});

function showInstallBanner() {
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
    // iOS instructions — no programmatic install
    body = '<strong>Install POWALIFTA</strong><span>Tap <span class="pwa-share-icon">⬆︎</span> Share, then "Add to Home Screen".</span>';
    action = '';
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

  // Allow the DOM a moment to update if before() switched panes
  setTimeout(() => {
    const target = step.selector ? document.querySelector(step.selector) : null;
    const overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.className = 'tour-overlay';

    if (target) {
      const rect = target.getBoundingClientRect();
      const pad = 6;
      overlay.style.setProperty('--tx', (rect.left - pad) + 'px');
      overlay.style.setProperty('--ty', (rect.top - pad) + 'px');
      overlay.style.setProperty('--tw', (rect.width + pad * 2) + 'px');
      overlay.style.setProperty('--th', (rect.height + pad * 2) + 'px');
      // Scroll target into view if it's off-screen
      if (rect.top < 80 || rect.bottom > window.innerHeight - 120) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      // No target — full screen dim, centered tip
      overlay.style.setProperty('--tx', '50%');
      overlay.style.setProperty('--ty', '50%');
      overlay.style.setProperty('--tw', '0px');
      overlay.style.setProperty('--th', '0px');
    }

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

    // Position the tip relative to the target (below by default, fallback above)
    if (target) {
      const rect = target.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const margin = 16;
      let top = rect.bottom + margin;
      if (top + tipRect.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - tipRect.height - margin);
      }
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
    } else {
      // Centered when no target
      tip.style.top = '50%';
      tip.style.left = '50%';
      tip.style.transform = 'translate(-50%, -50%)';
    }
  }, step.before ? 200 : 0);
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
  if (v == null) return '—';
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
  if (!u || u.userType !== 'coach') { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = '';

  const tier = getCurrentTier();
  const limit = getCurrentTierLimit();
  const occupied = getOccupiedSlots(u.id);
  const info = tier !== 'free' ? subscriptionStatusInfo(u.subscriptionStatus) : null;
  const badge = info
    ? '<span style="display:inline-block;margin-left:8px;padding:2px 9px;border-radius:999px;' +
      'font-size:0.72rem;font-weight:700;letter-spacing:0.02em;vertical-align:middle;' +
      'color:' + _subStatusColor(info.tone) + ';border:1px solid ' + _subStatusColor(info.tone) + ';' +
      'background:transparent">' + escHtml(info.label) + '</span>'
    : '';

  const usage = 'Using ' + occupied + ' of ' + (limit >= 9999 ? 'unlimited' : limit) +
    ' athlete slot' + (limit === 1 ? '' : 's') + '.';

  // Payment-problem statuses get a one-line nudge in danger tone.
  const problem = info && info.tone === 'bad'
    ? '<p class="text-xs" style="margin:8px 0 0;color:' + _subStatusColor('bad') + ';line-height:1.5">' +
      'We couldn\'t take your last payment. Update your card in the billing portal to keep your plan.</p>'
    : (info && info.tone === 'warn' && u.subscriptionStatus === 'cancelled'
        ? '<p class="dim text-xs" style="margin:8px 0 0;line-height:1.5">' +
          'Your plan stays active until the end of the current period, then reverts to Free.</p>'
        : '');

  const changeLabel = tier === 'free' ? 'See plans' : 'Change plan';
  const manageBtn = tier !== 'free'
    ? '<button class="btn btn-block btn-ghost" onclick="openBillingPortal()">Manage billing</button>'
    : '';

  container.innerHTML =
    '<p class="dim text-sm mb-8">Your plan</p>' +
    '<div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;margin-bottom:4px">' +
      '<span style="font-family:\'Anton\',sans-serif;font-size:1.35rem;letter-spacing:0.01em">' +
        escHtml((TIER_LABELS[tier] || 'Free').toUpperCase()) + '</span>' + badge +
    '</div>' +
    '<p class="dim text-xs" style="line-height:1.5">' + escHtml(usage) + '</p>' +
    problem +
    '<div class="flex gap-8 mt-12">' +
      '<button class="btn btn-block btn-ghost" onclick="closeSettingsModal();openUpgradeModal()">' + changeLabel + '</button>' +
      manageBtn +
    '</div>' +
    (tier !== 'free'
      ? '<p class="dim text-xs mt-8" style="opacity:.7;line-height:1.5">Update your card, switch plans, or cancel — all in the secure Lemon Squeezy portal.</p>'
      : '');
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
              'Update your card to keep your roster access — repeated failures drop you to ' + floor + '.',
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
      toast('No connection — saved on this device, will sync');
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
  if (dropped > 0) toast(dropped + (dropped === 1 ? ' set' : ' sets') + " couldn't be synced — please re-log");
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
    toast('No connection — set saved on this device, will sync automatically');
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
async function persistGoals(g)            { if (window._demoMode) return; try { await DB.upsertGoals(g); } catch (e) { console.error('goals', e); _enqueueOutbox('goals', g, 'goals:' + (g.athleteId || g.id || 'me')); toast('No connection — saved on this device, will sync'); } }
async function persistBw(b)               { if (window._demoMode) return; try { await DB.upsertBw(b); } catch (e) { console.error('bw', e); _enqueueOutbox('bw', b, 'bw:' + (b.athleteId || '') + ':' + (b.date || '')); toast('No connection — saved on this device, will sync'); } }
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
  if (dropped > 0) toast("Some changes couldn't be synced — please re-check");
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
      'font:600 13px/1 "Plus Jakarta Sans",system-ui,sans-serif;letter-spacing:.01em;white-space:nowrap;opacity:0;pointer-events:none;' +
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
      document.fonts.load('400 100px Anton'),
      document.fonts.load('700 40px "Plus Jakarta Sans"'),
      document.fonts.load('400 40px "Plus Jakarta Sans"')
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
  // Red glow top + bottom
  let g = x.createRadialGradient(W / 2, -100, 0, W / 2, -100, 1000);
  g.addColorStop(0, 'rgba(255,45,63,0.30)'); g.addColorStop(1, 'rgba(255,45,63,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(W / 2, H + 150, 0, W / 2, H + 150, 800);
  g.addColorStop(0, 'rgba(255,45,63,0.18)'); g.addColorStop(1, 'rgba(255,45,63,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // Wordmark — POWA white, LIFTA red
  x.textBaseline = 'alphabetic';
  x.font = '400 72px Anton, Impact, sans-serif';
  const wPowa = x.measureText('POWA').width;
  const wLifta = x.measureText('LIFTA').width;
  let sx = (W - wPowa - wLifta) / 2;
  x.textAlign = 'left';
  x.fillStyle = '#f4f4f6'; x.fillText('POWA', sx, 150);
  x.fillStyle = '#ff2d3f'; x.fillText('LIFTA', sx + wPowa, 150);

  // Tag pill
  x.textAlign = 'center';
  x.font = '700 34px "Plus Jakarta Sans", sans-serif';
  const tagW = x.measureText(opts.tag).width + 80;
  x.fillStyle = 'rgba(255,45,63,0.12)';
  x.strokeStyle = 'rgba(255,45,63,0.45)';
  x.lineWidth = 2;
  if (x.roundRect) {
    x.beginPath(); x.roundRect((W - tagW) / 2, 250, tagW, 72, 36); x.fill(); x.stroke();
  } else {
    x.fillRect((W - tagW) / 2, 250, tagW, 72); x.strokeRect((W - tagW) / 2, 250, tagW, 72);
  }
  x.fillStyle = '#ff2d3f';
  x.fillText(opts.tag, W / 2, 298);

  // Big number with gradient
  const bigGrad = x.createLinearGradient(0, 480, 0, 760);
  bigGrad.addColorStop(0, '#ff2d3f'); bigGrad.addColorStop(1, '#b71629');
  x.fillStyle = bigGrad;
  x.font = '400 260px Anton, Impact, sans-serif';
  const bigW = x.measureText(opts.big).width;
  x.fillText(opts.big, W / 2 - (opts.bigUnit ? 50 : 0), 700);
  if (opts.bigUnit) {
    x.fillStyle = '#82828c';
    x.font = '400 80px Anton, Impact, sans-serif';
    x.textAlign = 'left';
    x.fillText(opts.bigUnit, W / 2 - (opts.bigUnit ? 50 : 0) + bigW / 2 + 24, 700);
    x.textAlign = 'center';
  }

  // Sub line
  x.fillStyle = '#f4f4f6';
  x.font = '400 52px Anton, Impact, sans-serif';
  x.fillText(opts.sub.toUpperCase(), W / 2, 810);

  // Detail lines (left/right pairs)
  let y = 930;
  (opts.lines || []).forEach(ln => {
    x.strokeStyle = 'rgba(255,255,255,0.10)';
    x.beginPath(); x.moveTo(140, y - 44); x.lineTo(W - 140, y - 44); x.stroke();
    x.textAlign = 'left';
    x.font = '700 34px "Plus Jakarta Sans", sans-serif';
    x.fillStyle = '#82828c';
    x.fillText(ln.l.toUpperCase(), 140, y);
    x.textAlign = 'right';
    x.font = '700 38px "Plus Jakarta Sans", sans-serif';
    x.fillStyle = '#f4f4f6';
    x.fillText(ln.r, W - 140, y);
    x.textAlign = 'center';
    y += 92;
  });

  // Footer
  x.font = '700 36px "Plus Jakarta Sans", sans-serif';
  x.fillStyle = '#56565e';
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
      toast('Card saved — post it');
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
  const countryOpts = '<option value="">— None —</option>' +
    COUNTRIES.map(c => '<option value="' + c.code + '">' + flagEmoji(c.code) + ' ' + escHtml(c.name) + '</option>').join('');
  wrap.innerHTML = '<div class="modal-backdrop" id="settingsModal">' +
    '<div class="modal">' +
      '<button class="modal-close" aria-label="Close" onclick="closeSettingsModal()">&times;</button>' +
      '<h3>Settings</h3>' +

      // Avatar + country row
      '<div class="flex gap-12 mt-8" style="align-items:center">' +
        '<div id="setAvatarPreview" class="av" style="width:72px;height:72px;font-size:1.25rem;flex:0 0 auto"></div>' +
        '<div style="flex:1; min-width:0">' +
          '<label class="block dim text-xs mb-4">Profile picture (square works best, &lt; 3 MB)</label>' +
          '<input type="file" id="setAvatarFile" accept="image/png,image/jpeg,image/webp" style="font-size: 0.85rem">' +
          '<div id="setAvatarStatus" class="dim text-xs mt-4"></div>' +
        '</div>' +
      '</div>' +

      '<div class="form-group mt-12"><label>Country (shown as flag on your profile)</label>' +
        '<select id="setCountry" style="width:100%">' + countryOpts + '</select>' +
      '</div>' +

      '<div class="form-group"><label>Display name</label><input type="text" id="setName"></div>' +
      '<div class="form-group"><label>Email</label><input type="email" id="setEmail" disabled style="opacity:0.5"></div>' +
      '<div id="setBioGroup" class="form-group" style="display:none"><label>Coach bio</label><textarea id="setBio"></textarea></div>' +
      '<div class="form-group"><label>New password (leave blank to keep current)</label><input type="password" id="setPwd" placeholder="At least 6 chars"></div>' +
      '<div class="flex gap-8 mt-16"><button class="btn btn-block" onclick="closeSettingsModal()">Cancel</button><button class="btn btn-primary btn-block" onclick="saveSettings()">Save</button></div>' +
      '<div id="setPlanBox" style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line);"></div>' +
      '<div id="setReferralBox" style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line);"></div>' +
      '<div id="setEmailPrefsBox" style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line);"></div>' +
      '<div id="setNotifPrefsBox" style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line);"></div>' +
      '<div id="setMfaBox" style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line);"></div>' +
      '<div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line);">' +
        '<p class="dim text-sm mb-8">Your data</p>' +
        '<p class="dim text-xs mb-8" style="line-height:1.5">Download everything we hold for your account. JSON is the complete archive; CSV is your training log, ready to re-import anywhere.</p>' +
        '<div class="flex gap-8">' +
          '<button class="btn btn-block btn-ghost" onclick="exportMyData(\'json\')">⬇ Export JSON</button>' +
          '<button class="btn btn-block btn-ghost" onclick="exportMyData(\'csv\')">⬇ Export CSV</button>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top: 16px; padding-top: 18px; border-top: 1px solid var(--line);">' +
        '<button class="btn btn-block btn-ghost" onclick="replaySettingsTour()">↺ Replay onboarding tour</button>' +
      '</div>' +
      '<div style="margin-top: 16px; padding-top: 18px; border-top: 1px solid var(--line);">' +
        '<p class="dim text-sm mb-8">Danger zone</p>' +
        '<button class="btn btn-danger btn-block" onclick="deleteMyAccount()">Delete my account</button>' +
      '</div>' +
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
      '<span style="font-family:\'Anton\',sans-serif;font-size:1.35rem;letter-spacing:0.01em">2FA</span>' +
      '<span style="display:inline-block;padding:2px 9px;border-radius:999px;font-size:0.72rem;' +
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
    container.innerHTML = head + '<p class="dim text-xs" style="line-height:1.5">Couldn\'t load your security settings — reopen Settings to retry.</p>';
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
    : '<p class="dim text-xs" style="width:180px;text-align:center">QR unavailable — use the key below.</p>';
  if (body) body.innerHTML =
    '<div style="display:flex;justify-content:center;margin-bottom:14px">' +
      '<div style="background:#fff;padding:12px;border-radius:12px;line-height:0">' + qr + '</div>' +
    '</div>' +
    '<p class="dim text-xs mb-4" style="text-align:center">Can\'t scan? Enter this key manually:</p>' +
    '<p style="text-align:center;font-family:\'Space Grotesk\',monospace;font-size:0.9rem;letter-spacing:0.05em;word-break:break-all;margin:0 0 16px;color:var(--text-2)">' + escHtml(res.secret || '') + '</p>' +
    '<div class="form-group"><label>6-digit code</label>' +
      '<input type="text" id="mfaCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000" style="letter-spacing:0.3em;text-align:center;font-size:1.1rem"></div>' +
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
  if (!_mfaPendingFactor) { if (err) err.textContent = 'Enrollment expired — close and try again.'; return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
  if (err) err.textContent = '';
  const res = await DB.mfaVerifyEnroll(_mfaPendingFactor, code);
  if (btn) { btn.disabled = false; btn.innerHTML = 'Verify &amp; turn on'; }
  if (!res.ok) {
    if (err) err.textContent = /invalid|incorrect|expired|match/i.test(res.reason || '')
      ? 'That code didn\'t match — enter the current one.' : (res.reason || 'Verification failed.');
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
    : '<span style="color:var(--red)">Powerhouse</span> — every tier cleared';
  return '<div style="margin-top:14px">' +
      '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:7px; font-size:0.78rem">' +
        '<span style="color:var(--text-2)">' + label + '</span>' +
        '<span style="font-family:\'Space Grotesk\',monospace; color:var(--text-2)">' + count + (next ? ' / ' + next.at : '') + '</span>' +
      '</div>' +
      '<div style="height:8px; background:rgba(255,255,255,0.07); border-radius:999px; overflow:hidden">' +
        '<div style="height:100%; width:' + pct + '%; background:linear-gradient(90deg, var(--red), #ff6b78); border-radius:999px; transition:width .6s cubic-bezier(0.22,1,0.36,1)"></div>' +
      '</div>' +
    '</div>';
}
// Renders the referral card into `container`. Shows the user's link + a copy
// button immediately, then fills in who's joined (async). No-ops cleanly when
// the account has no code yet (pre-migration rows) or in demo mode.
async function renderReferralCard(container) {
  const u = getCurrentUser();
  if (!container || !u) return;
  const code = u.referralCode;
  if (!code) { container.innerHTML = ''; return; }   // older account / demo — hide
  const link = referralLink(code);
  container.innerHTML =
    '<p class="dim text-sm mb-8">Refer a lifter</p>' +
    '<p class="dim text-xs mb-8" style="line-height:1.5">Share your link. Anyone who signs up through it shows up here — athletes and coaches both count.</p>' +
    '<div class="flex gap-8" style="align-items:stretch">' +
      '<input type="text" id="refLinkInput" readonly value="' + escHtml(link) + '" ' +
        'style="flex:1; min-width:0; font-family:\'Space Grotesk\',monospace; font-size:0.8rem" onclick="this.select()">' +
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
      referralRewardsHtml(referralRewardsLedger(demoCount, demoClaims));
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
    const rewards = referralRewardsHtml(referralRewardsLedger(refs.length, claims));
    if (!refs.length) {
      live.innerHTML = referralMilestoneHtml(0) +
        '<p class="mt-12" style="color:var(--text-2)">No referrals yet — share your link to get started.</p>' +
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
    toast('Reward requested — we\'ll be in touch to set it up.');
    const box = document.getElementById('setReferralBox');
    if (box) renderReferralCard(box);
    return;
  }
  try {
    await DB.claimReferralReward(tierAt);
    toast('Reward requested — we\'ll be in touch to set it up.');
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
      'A Monday recap of your last 7 days — sessions, tonnage, best e1RMs.', prefs.weeklyDigest) +
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
    if (perm === 'denied') return wrap('<span class="dim text-xs">Alerts are blocked — turn notifications back on for POWALIFTA in your browser settings.</span>');
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
        rows.push([wkLabel, dayName, isRest ? '— Rest day —' : '— No exercises —', '', '', '', '', '', '', '', '', '']
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

  // Composer
  const composer = el('div', { class: 'msg-composer' });
  const ta = el('textarea', { class: 'msg-input', rows: '1', placeholder: 'Message ' + (otherName || '') + '…', maxlength: '2000' });
  const sendBtn = el('button', { class: 'btn btn-primary msg-send' }, 'Send');
  composer.appendChild(ta);
  composer.appendChild(sendBtn);
  wrap.appendChild(composer);
  container.appendChild(wrap);

  // Merge chat messages + session notes into one chronological timeline.
  function buildTimeline(messages, notes) {
    const items = [];
    (messages || []).forEach(m => items.push({
      kind: 'msg', id: m.id, ts: m.createdAt || '', mine: m.senderId === viewerId, body: m.body, readAt: m.readAt || null
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

  function paint(items) {
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
      } else {
        const row = el('div', { class: 'msg-row ' + (it.mine ? 'mine' : 'theirs') });
        const bubble = el('div', { class: 'msg-bubble' });
        bubble.appendChild(el('div', { class: 'msg-body' }, it.body));
        bubble.appendChild(el('div', { class: 'msg-meta' }, _msgTime(it.ts)));
        row.appendChild(bubble);
        list.appendChild(row);
        if (i === lastMineIdx) {
          const seen = !!it.readAt;
          const rt = seen ? _msgTime(it.readAt) : '';
          list.appendChild(el('div', { class: 'msg-status' + (seen ? ' is-seen' : '') },
            seen ? ('Seen' + (rt ? ' · ' + rt : '')) : 'Sent'));
        }
      }
    });
    list.scrollTop = list.scrollHeight;
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
      const [msgs, nts] = await Promise.all([DB.listMessages(coachId, athleteId), loadNotes()]);
      messages = msgs; notes = nts;
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
          paint(buildTimeline(messages, notes));
        })
      : null;
    if (insertCleanup || readCleanup) {
      container._msgCleanup = () => {
        try { if (insertCleanup) insertCleanup(); } catch (e) {}
        try { if (readCleanup) readCleanup(); } catch (e) {}
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
      toast('Could not send — are you still connected to them?');
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
        '<p class="text-xs" style="line-height:1.65;margin:0;color:var(--text-3)"><strong style="color:var(--text-2)">Erased:</strong> your profile, programs, logs, bodyweight, goals, meets, messages, form-check videos, reviews, referrals, notifications and coaching links.<br><strong style="color:var(--text-2)">Kept (anonymized):</strong> past marketplace purchase records we\'re legally required to retain for tax — with your identity removed.</p>' +
      '</div>' +
      '<p class="text-xs mb-8" style="color:var(--text-3)">Want a copy of your data first?</p>' +
      '<div class="flex gap-8 mb-16">' +
        '<button class="btn btn-block btn-ghost" onclick="exportMyData(\'json\')">⬇ Export JSON</button>' +
        '<button class="btn btn-block btn-ghost" onclick="exportMyData(\'csv\')">⬇ Export CSV</button>' +
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
    location.href = 'index.html';
    return;
  }
  // Honest failure — never sign out or pretend it worked. Surface the real
  // reason and point at the manual erasure fallback.
  const reason = (res && res.reason) || 'Deletion failed';
  if (err) err.textContent = reason + ' — email powalifta1320@gmail.com and we\'ll erase it manually.';
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
  legend.appendChild(el('span', { class: 'cal-legend-label', style: 'margin-left: 16px;' }, '🛌 Rest day'));
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
    summary: 'Low-bar back squat to legal depth — the contested movement and the 1.0 baseline every squat variant is scored against.',
    setup: [
      'Bar across the rear delts, not the neck — pull the shoulder blades together to build the shelf.',
      'Grip as narrow as the shoulders allow pain-free; elbows tucked down, wrists stacked over the bar.',
      'Feet just outside hip width, toes turned out 20–30°, weight centred over the mid-foot.'
    ],
    cues: [
      'Take a full belly of air and brace against your belt before you unrack; walk it out in three steps.',
      'Break at the hips and knees together and spread the floor with your feet.',
      'Hit depth — hip crease below the top of the knee — then drive the whole foot through the platform.'
    ],
    faults: [
      'Knees caving: think "push the knees out to track over the toes".',
      'Chest folding forward out of the hole: more upper-back tightness and a harder brace, not a lighter bar.',
      'Cutting depth: film from the side at hip height — front-on hides it.'
    ]
  },
  {
    key: 'squat-paused', group: 'squat', lift: 'squat', variant: 'Paused', multiplier: 1.07,
    name: 'Paused Squat', pattern: 'Squat · positional',
    summary: 'A 2–3s hold at depth kills the stretch reflex, so it carries over above competition — that is why it scores 1.07× of a comp squat.',
    cues: [
      'Stay braced through the pause; do not bleed air or let the chest drop.',
      'Hold at your true competition depth, not an inch higher.',
      'Explode out of the hole on the count — no rocking or re-bending to build momentum.'
    ]
  },
  {
    key: 'squat-tempo', group: 'squat', lift: 'squat', variant: 'Tempo', multiplier: 1.12,
    name: 'Tempo Squat', pattern: 'Squat · control',
    summary: 'A slow eccentric (commonly 3–4s down) builds position and control under load; the time under tension is why it carries the highest squat multiplier at 1.12×.',
    cues: [
      'Count the descent honestly — most lifters rush the last third.',
      'Keep the bar over the mid-foot the whole way down; control is the point, not speed.',
      'Normal, hard drive up once you reach depth.'
    ]
  },
  {
    key: 'squat-pin', group: 'squat', lift: 'squat', variant: 'Pin', multiplier: 1.08,
    name: 'Pin Squat', pattern: 'Squat · dead-stop',
    summary: 'Squatting up from pins set near depth removes all stretch reflex and trains a dead-stop drive out of the hole — scored at 1.08×.',
    cues: [
      'Set the pins at or just above your sticking point.',
      'Settle on the pins for a beat — relax slightly without losing your brace — then drive.',
      'No bouncing the bar off the pins; the dead-stop is the whole exercise.'
    ]
  },
  // ---------------- BENCH ----------------
  {
    key: 'bench-competition', group: 'bench', lift: 'bench', variant: 'Competition', multiplier: 1.0,
    name: 'Competition Bench Press', pattern: 'Horizontal press',
    summary: 'Paused bench to a motionless chest touch — the contested press and the 1.0 baseline for every bench variant.',
    setup: [
      'Shoulder blades retracted and pinned down; build a tight upper-back arch.',
      'Eyes under the bar, feet planted for leg drive, glutes stay on the bench.',
      'Grip width inside the rings — find the width that keeps the forearms vertical at the chest.'
    ],
    cues: [
      'Pull the bar out of the rack rather than press it out; keep the lats tight.',
      'Lower under control to the same touch point each rep and pause it dead-still.',
      'Press back and slightly toward the rack, driving through the legs without lifting the hips.'
    ],
    faults: [
      'Flaring the elbows to 90°: tuck toward 45–70° to protect the shoulders and keep the press in the groove.',
      'Bouncing the bar off the chest: a real comp pause exposes the weak range — train it.',
      'Hips rising on the drive: more leg drive into the bench, not up off it.'
    ]
  },
  {
    key: 'bench-paused', group: 'bench', lift: 'bench', variant: 'Paused', multiplier: 1.06,
    name: 'Paused Bench (long pause)', pattern: 'Horizontal press · positional',
    summary: 'A deliberate 2–3s pause on the chest — longer than a meet command — overloads the dead-stop press, scoring 1.06×.',
    cues: [
      'Stay tight and keep the air in during the pause; do not sink into the chest.',
      'Hold at your true touch point, not high on the belly.',
      'Press the instant the count ends — explosive off the chest.'
    ]
  },
  {
    key: 'bench-closegrip', group: 'bench', lift: 'bench', variant: 'Close Grip', multiplier: 1.09,
    name: 'Close-Grip Bench Press', pattern: 'Horizontal press · triceps',
    summary: 'A grip ~2 hands narrower shifts load to the triceps and the lockout — a top builder for a weak finish, scored at 1.09×.',
    cues: [
      'Grip about shoulder width — narrow enough to load the triceps, not so narrow the wrists hurt.',
      'Keep the elbows tucked; the bar tracks lower on the torso than a comp bench.',
      'Drive the lockout with the triceps, not by flaring.'
    ]
  },
  {
    key: 'bench-pinpress', group: 'bench', lift: 'bench', variant: 'Pin Press', multiplier: 1.08,
    name: 'Pin Press', pattern: 'Horizontal press · dead-stop',
    summary: 'Pressing from pins at a chosen height trains a dead-stop drive through a specific sticking point; scored at 1.08×.',
    cues: [
      'Set the pins at your sticking height — usually 2–4cm off the chest.',
      'Let the bar settle dead on the pins, stay tight, then press.',
      'No pre-load bounce; start each rep from a true stop.'
    ]
  },
  {
    key: 'bench-incline', group: 'bench', lift: 'bench', variant: 'Incline', multiplier: 1.12,
    name: 'Incline Bench Press', pattern: 'Incline press · upper chest',
    summary: 'A 15–30° incline biases the upper chest and front delts and lengthens the press — the hardest bench variant, scored at 1.12×.',
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
    summary: 'Conventional or sumo pull to lockout — the contested lift and the 1.0 baseline for every deadlift variant.',
    setup: [
      'Bar over the mid-foot, roughly an inch from the shins.',
      'Take the slack out of the bar — pull the chest up until the plates just lift the bar tension.',
      'Lats engaged, shoulders slightly ahead of or over the bar, neutral spine.'
    ],
    cues: [
      'Push the floor away rather than yanking the bar up.',
      'Keep the bar dragging up the legs — let it drift forward and the lift stalls.',
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
      'Resume in one piece — no hitching or re-bending the hips.'
    ]
  },
  {
    key: 'deadlift-deficit', group: 'deadlift', lift: 'deadlift', variant: 'Deficit', multiplier: 1.06,
    name: 'Deficit Deadlift', pattern: 'Hip hinge · range',
    summary: 'Standing on a 2–5cm block lengthens the pull and builds strength off the floor; scored at 1.06×.',
    cues: [
      'Use only as much deficit as you can keep a flat back through.',
      'Same mid-foot setup — the extra range comes from the higher start, not a forward bar.',
      'Drive the floor away; expect the bottom to feel heavier than a comp pull.'
    ]
  },
  {
    key: 'deadlift-rdl', group: 'deadlift', lift: 'deadlift', variant: 'RDL', multiplier: 1.10,
    name: 'Romanian Deadlift (RDL)', pattern: 'Hip hinge · hamstrings',
    summary: 'A top-down hinge with soft knees that overloads the hamstrings and glutes through the eccentric — the highest-carryover deadlift accessory, scored at 1.10×.',
    cues: [
      'Start standing; push the hips back and slide the bar down the thighs.',
      'Keep a slight, fixed knee bend — this is a hinge, not a squat.',
      'Stop when the hamstrings run out of stretch (usually mid-shin), then drive the hips back through.'
    ]
  },
  // ---------------- PUSH (accessory) ----------------
  {
    key: 'push-ohp', group: 'push', lift: 'push', name: 'Overhead Press', pattern: 'Vertical press',
    summary: 'Standing barbell press — the anchor upper-body push accessory; builds delts, triceps and the bench lockout.',
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
      'Lower until the upper arms reach parallel — no deeper if the shoulders complain.',
      'Lock out fully at the top without shrugging.'
    ]
  },
  {
    key: 'push-pushdown', group: 'push', lift: 'push', name: 'Triceps Pushdown', pattern: 'Isolation · triceps',
    summary: 'Cable isolation for the triceps — cheap volume for the bench lockout with no axial fatigue.',
    cues: [
      'Pin the elbows to your sides and keep them there.',
      'Lock out fully and squeeze, then control the weight back up.',
      'Chase reps and a stretch, not a heavy ego load.'
    ]
  },
  // ---------------- PULL (accessory) ----------------
  {
    key: 'pull-row', group: 'pull', lift: 'pull', name: 'Barbell Row', pattern: 'Horizontal pull',
    summary: 'A hinged barbell row — the workhorse back builder that supports the squat brace and deadlift lockout.',
    cues: [
      'Hinge to around 45° and hold the torso angle still — no jerking upright each rep.',
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
      'Lower all the way under control — half reps train half a back.'
    ]
  },
  {
    key: 'pull-facepull', group: 'pull', lift: 'pull', name: 'Face Pulls', pattern: 'Isolation · rear delts',
    summary: 'Rear-delt and external-rotation work — cheap shoulder insurance for big benchers.',
    cues: [
      'Pull the rope to your forehead with the elbows high.',
      'Externally rotate at the end — thumbs back, like a double biceps pose.',
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
      'Squat to full depth — losing the elbows means losing the bar.'
    ]
  },
  {
    key: 'legs-legpress', group: 'legs', lift: 'legs', name: 'Leg Press', pattern: 'Squat · quads',
    summary: 'Machine quad volume with low systemic fatigue — easy to load and easy to recover from.',
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
    summary: 'Loaded hip extension for the glutes — direct lockout power for both the squat and the deadlift.',
    cues: [
      'Upper back on the bench, chin tucked, bar over the hips on a pad.',
      'Drive through the heels to full hip extension and squeeze the glutes hard.',
      'Stop at a flat torso — do not hyperextend the lower back to chase height.'
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
function generateProgram(opts) {
  opts = opts || {};
  const weeks = Math.max(1, Math.min(16, Math.round(opts.weeks || 4)));
  const dpw = Math.max(2, Math.min(6, Math.round(opts.daysPerWeek || 4)));
  const focus = (opts.focus && MAIN_LIFTS.indexOf(opts.focus) !== -1) ? opts.focus : null;
  const e1 = opts.e1rms || {};

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
        const e = e1[m] || 0;
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
    mains.map(m => LIFT_LABELS[m]).join(' / ') + (isMeet ? ' — openers' : ' day');

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
          ex.sets.push(newSet(weightForTarget(e, 1, OPENER_RPE), 1, OPENER_RPE, 'Opener — fast and easy'));
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
        weight: set.weight, reps: set.reps, rpe: set.rpe,
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
            weight: set.weight, reps: set.reps, rpe: set.rpe,
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
              sets: ex.sets.map(set => ({ weight: set.weight, reps: set.reps, rpe: set.rpe }))
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
  if (allEasier) return { text: 'Last ' + recent.length + ' sessions felt at or below RPE ' + (prescribedRpe - 1) + ' — try +2.5kg?', kind: 'easy' };
  const allHard = recent.every(l => l.weight <= prescribedWeight && l.rpe >= prescribedRpe + 1);
  if (allHard) return { text: 'Last ' + recent.length + ' sessions felt above RPE ' + (prescribedRpe + 1) + ' — back off 2.5kg?', kind: 'hard' };
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
  const sizeStyle = sz === 'sm' ? 'width:32px;height:32px;font-size:0.75rem'
                   : sz === 'lg' ? 'width:80px;height:80px;font-size:1.5rem'
                   : 'width:48px;height:48px;font-size:1rem';
  if (user && user.avatarUrl) {
    return '<div class="av ' + cls + '" style="' + sizeStyle + ';padding:0;overflow:hidden;background:transparent">' +
      '<img src="' + escHtml(user.avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' +
    '</div>';
  }
  return '<div class="av ' + cls + '" style="' + sizeStyle + '">' + escHtml(initials(user ? user.name : '?')) + '</div>';
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
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h20l-2 13H4z"/><path d="M8 7V4a4 4 0 0 1 8 0v3"/></svg>',
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
  logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>'
};

// Brand mark — barbell SVG
const BRAND_MARK = '<svg class="brand-mark" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="bg-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff2d3f"/><stop offset="100%" stop-color="#b71629"/></linearGradient></defs><rect x="2" y="11" width="3.5" height="6" rx="1" fill="url(#bg-r)"/><rect x="6.5" y="9" width="2.2" height="10" rx="0.5" fill="url(#bg-r)"/><rect x="9.5" y="13" width="9" height="2" fill="url(#bg-r)"/><rect x="19.3" y="9" width="2.2" height="10" rx="0.5" fill="url(#bg-r)"/><rect x="22.5" y="11" width="3.5" height="6" rx="1" fill="url(#bg-r)"/></svg>';

// =========================================================
// NAV
// =========================================================
function renderNav(target) {
  const user = getCurrentUser();
  const navInner = el('div', { class: 'nav-inner' });
  const brand = el('a', { href: 'index.html', class: 'brand' });
  brand.innerHTML = BRAND_MARK + '<span>POWA<span class="accent">LIFTA</span></span>';
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
    // Clickable user pill → opens settings modal
    const userPill = el('button', { class: 'nav-user', title: 'Settings' });
    const avInner = user.avatarUrl
      ? '<div class="av" style="padding:0;overflow:hidden;background:transparent"><img src="' + escHtml(user.avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
      : '<div class="av">' + escHtml(initials(user.name)) + '</div>';
    const flagPart = user.countryCode ? '<span style="margin-left:4px">' + flagEmoji(user.countryCode) + '</span>' : '';
    userPill.innerHTML = avInner + '<span>' + escHtml(user.name) + '</span>' + flagPart;
    userPill.setAttribute('onclick', 'if(window.openSettingsModal){openSettingsModal()}');
    actions.appendChild(userPill);
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
    e.innerHTML = ICONS.chart + '<p>No data yet — log some sets and your trend will appear here.</p>';
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
    t.setAttribute('font-family', "'Space Grotesk', monospace");
    t.textContent = Math.round(v);
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
      lbl.setAttribute('font-family', "'Plus Jakarta Sans', sans-serif");
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
    t.setAttribute('font-family', "'Plus Jakarta Sans', sans-serif");
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

    // Dots
    points.forEach((p, pi) => {
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

    let html = '<div style="font-size:0.7rem; color:' + C_TIP_TITLE + '; text-transform:uppercase; letter-spacing:0.1em; font-weight:700; margin-bottom:8px;">' +
               new Date(date).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) + '</div>';
    let any = false;
    series.forEach(s => {
      const d = s.data.find(x => x.x === date);
      if (d != null && d.y != null) {
        any = true;
        html += '<div style="display:flex; justify-content:space-between; gap:18px; align-items:center; padding:3px 0;">' +
                  '<span style="display:flex; align-items:center; gap:8px; font-size:0.85rem;"><span style="width:8px; height:8px; border-radius:50%; background:' + s.color + ';"></span><span style="color:' + C_TIP_NAME + ';">' + s.name + '</span></span>' +
                  '<span style="font-family:\'Space Grotesk\',monospace; color:' + C_TIP_VAL + '; font-weight:700; font-variant-numeric: tabular-nums;">' + (Math.round(d.y * 10) / 10) + ' ' + unit + '</span>' +
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
  none: 'Untrained', under: 'Below MEV', productive: 'Productive',
  high: 'Near MRV', over: 'Over MRV', unknown: ''
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
      ? (lookback + ' weeks of rising load at RPE ' + recentRounded + ' — a deload week could turn that fatigue into strength.')
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
      '<div class="lb-empty dim">No lifters on the board yet — be the first to publish.</div>';
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
        '<span class="lb-cls mono">' + (cls || '—') + flag + '</span>' +
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
  btn.textContent = on ? 'On the leaderboard — tap to leave' : 'Publish to leaderboard';
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
    toast(on ? 'Removed from the leaderboard' : 'Published — you’re on the board');
    refreshLeaderboardButton(btn);
    return;
  }
  try {
    if (on) { await DB.removeLeaderboardEntry(entry.userId); toast('Removed from the leaderboard'); }
    else { await DB.upsertLeaderboardEntry(entry); toast('Published — you’re on the board'); }
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
    if (slopeKgWk > 0.05) return { tone: 'away', text: 'trending up — not cutting' };
    const loss = -pctWk; // %/wk lost
    if (loss < 0.2) return { tone: 'flat', text: 'holding steady' };
    if (loss < 0.5) return { tone: 'slow', text: 'gentle cut — strength-sparing' };
    if (loss <= 1.2) return { tone: 'good', text: 'solid cut pace' };
    return { tone: 'fast', text: 'aggressive — strength may suffer' };
  }
  if (direction === 'gain') {
    if (slopeKgWk < -0.05) return { tone: 'away', text: 'trending down — not gaining' };
    if (slopeKgWk < 0.05) return { tone: 'flat', text: 'holding steady' };
    if (slopeKgWk < 0.2) return { tone: 'slow', text: 'slow gain — near recomp' };
    if (slopeKgWk <= 0.6) return { tone: 'good', text: 'lean bulk pace' };
    return { tone: 'fast', text: 'fast — expect more fat gain' };
  }
  // maintain
  if (Math.abs(pctWk) < 0.25) return { tone: 'good', text: 'steady — holding weight' };
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
  const unitSpan = valEl.querySelector('.unit');
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
      _countUpEl(en.target);
    });
  }, { threshold: 0.45 });
  const scan = () => {
    document.querySelectorAll('.stat-value').forEach((e) => {
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
