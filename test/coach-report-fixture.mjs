// The Monday report's world for the tests and the previews (test/coach-report.test.mjs, send-weekly-digest.test.mjs):
// the database's rows (snake_case, as the tables have them) for five coaches, Monday 2 Nov 2026 (the report covers
// 26 Oct to 1 Nov):
//   c-sam    Sam Ellis, 20 lifters, the app's demo team (Priya, Sarah, Tom, Nina, Elena, Marcus, Arjun, Kofi, Ines …),
//            every part of the report in play; Pro (25 seats)
//   c-mia    Mia Chen, 3 lifters, the free plan's 3 seats full
//   c-big    Big Barbell, 60 lifters (seeded), Premium
//   c-dan    Dan Ross, 5 lifters, no billing and no meets, Basic
//   c-quiet  Quiet Coach, 2 lifters who did nothing for months (a dormant team: no report)
// Then the same world as the app's Store sees it (storeFor) and as the edge function hands it to coach-report.js
// (rowsFor, with the RPCs answered the way the SQL does: PGlite-tested in test/coach-report-sql.test.mjs).
export const TODAY = '2026-11-02';
const NOW = Date.parse(TODAY + 'T14:00:00Z');

function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const MON = TODAY, LAST = addDays(MON, -7);   // this Monday; last week's Monday (26 Oct)
// Training days a week: Mon, Wed, Fri, Sat (offsets from the week's Monday).
const DAYS = [0, 2, 4, 5];
const LIFTS = ['squat', 'bench', 'deadlift'];
const r25 = (v) => Math.round(v / 2.5) * 2.5;

let idN = 0;
const nid = (p) => p + '-' + String(++idN).padStart(5, '0');

// One lifter's story → rows. s: { id, name, coach, base: [s, b, d] (their best e1RM 5 to 8 weeks ago), trend: [s, b, d]
// (kg up over the 4 weeks to last Sunday: 0 or less is flat), pr: [lifts that PR last week], perWeek, total (block
// weeks), cur (this week's index in the block), last (sessions last week), prev (the week before), finished,
// noProgram, felt: { lift: [rpe written, rpe felt] } (last week's top sets), drift (+0.5 on every top set), history
// (weeks of logs before the block: default 8), quiet (logged nothing for months) }
function lifter(T, s) {
  T.profiles.push({ id: s.id, name: s.name, user_type: 'athlete', coach_id: s.coach, email: null, unit: 'kg' });
  // The logs: 8 weeks back to last week, 3 days a week (one main lift a day), then last week and the one before as told.
  const value = (L, w) => {   // w: weeks before this Monday (1 = last week … 8)
    const i = LIFTS.indexOf(L), base = s.base[i], tr = (s.trend || [0, 0, 0])[i];
    if (w >= 5) return base - [0, 2.5, 0, 5, 2.5][w - 4];                       // the prior 4 weeks: best = base
    const peak = base + tr, pr = (s.pr || []).includes(L);
    return w === 1 ? (pr ? peak + 2.5 : peak - 2.5) : w === 2 ? peak : peak - (w === 3 ? 2.5 : 5);
  };
  const logDay = (date, L, w) => T.workout_logs.push({ id: nid('l'), athlete_id: s.id, date, lift: L, e1rm_comp: value(L, w), weight: r25(value(L, w) * 0.86), reps: 3 });
  if (!s.quiet && s.base) {
    const hist = s.history == null ? 8 : s.history;
    for (let w = Math.min(8, hist); w >= 1; w--) {
      const mon = addDays(MON, -7 * w);
      const n = w === 1 ? s.last : w === 2 ? (s.prev == null ? s.last : s.prev) : 3;
      for (let k = 0; k < n; k++) logDay(addDays(mon, DAYS[k]), LIFTS[k % 3], w);
    }
  }
  if (s.quiet) LIFTS.forEach((L, k) => T.workout_logs.push({ id: nid('l'), athlete_id: s.id, date: addDays(MON, -120 + k), lift: L, e1rm_comp: 100, weight: 85, reps: 3 }));
  // The block: written by RPE, a top set and two back-offs a day; the weeks before last all logged, last week as
  // many days as they trained, the rest to do.
  if (s.noProgram || s.quiet) return;
  const per = s.perWeek || 3, total = s.total || 4, cur = s.cur == null ? 1 : s.cur;
  const weeks = [];
  for (let wi = 0; wi < total; wi++) {
    const weekMon = addDays(MON, 7 * (wi - cur));   // the Monday this block week falls on
    const lastWeek = weekMon === LAST;
    const days = [];
    for (let di = 0; di < per; di++) {
      const L = LIFTS[di % 3], date = addDays(weekMon, DAYS[di]);
      const done = s.finished || weekMon < LAST || (lastWeek && di < s.last);
      const [wrote, felt] = (lastWeek && s.felt && s.felt[L]) || [8, s.drift && lastWeek ? 8.5 : 8];
      const top = r25(value(L, Math.max(1, Math.round((Date.parse(MON) - Date.parse(weekMon)) / 6048e5))) * 0.86);
      const set = (weight, reps, rpe, actual) => ({ weight, reps, rpe, actualRpe: done ? actual : null, completed: done, completedAt: done ? date : null });
      days.push({ name: ['Squat', 'Bench', 'Deadlift'][di % 3] + ' day', exercises: [
        { lift: L, variant: 'Competition', exerciseName: '', sets: [set(top, 3, wrote, felt), set(r25(top * 0.85), 5, 7, s.drift && lastWeek ? 7.5 : 7), set(r25(top * 0.85), 5, 7, 7)] },
        { lift: 'other', exerciseName: 'Row', sets: [{ weight: 60, reps: 10, completed: done, completedAt: done ? date : null }] }
      ] });
    }
    days.push({ name: 'Rest', exercises: [] });
    weeks.push({ number: wi + 1, days });
  }
  T.programs.push({ id: nid('p'), athlete_id: s.id, coach_id: s.coach, name: 'Block', weeks, updated_at: '2026-10-01T00:00:00Z' });
}

function coach(T, id, name, email, tier, extra) {
  T.profiles.push(Object.assign({ id, name, user_type: 'coach', coach_id: null, email, unit: 'kg', subscription_tier: tier, subscription_period_end: '2026-11-20T00:00:00Z' }, extra || {}));
  T.email_preferences.push({ user_id: id, weekly_digest: true, unsub_token: 'tok-' + id, push_alerts: true });
}

// The seeded random for the 60-lifter coach.
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const FIRST = ['Ava', 'Ben', 'Cara', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivan', 'Jade', 'Kai', 'Lena', 'Milo', 'Nora', 'Omar', 'Pia', 'Quinn', 'Rosa', 'Sven', 'Tara', 'Uma', 'Vik', 'Wren', 'Xan', 'Yara', 'Zed'];
const LASTN = ['Adler', 'Brook', 'Costa', 'Dahl', 'Evans', 'Frost', 'Grant', 'Hale', 'Ito', 'Jonas', 'Klein', 'Lund', 'Moreau', 'Novak', 'Ortiz', 'Park'];

export function world() {
  idN = 0;
  const T = { profiles: [], programs: [], workout_logs: [], pain_reports: [], checkins: [], checkin_answers: [], meets: [], form_checks: [], client_billing: [],
    bodyweight: [], messages: [], session_notes: [], coach_applications: [], invites: [], email_preferences: [], push_subscriptions: [] };
  const ago = (n) => addDays(TODAY, -n), at = (h) => new Date(NOW - h * 3600000).toISOString();

  // ---------------------------------------------------------------- Sam Ellis and the demo team
  coach(T, 'c-sam', 'Sam Ellis', 'sam@coach.test', 'pro');
  const S = (o) => lifter(T, Object.assign({ coach: 'c-sam', perWeek: 3, total: 4, cur: 1, last: 3, prev: 3 }, o));
  S({ id: 'a-priya', name: 'Priya Shah', base: [115, 67.5, 147.5], trend: [2.5, 0, 2.5], perWeek: 3, total: 3, cur: 2, last: 3, prev: 3 });
  S({ id: 'a-sarah', name: 'Sarah Kim', base: [120, 70, 150], trend: [5, 2.5, 5], last: 3, prev: 2, felt: { bench: [8, 8.5] } });
  S({ id: 'a-tom', name: 'Tom Boyle', base: [200, 140, 250], trend: [0, -2.5, 0], perWeek: 4, last: 4, prev: 3 });
  S({ id: 'a-nina', name: 'Nina Petrova', base: [90, 50, 110], trend: [0, 0, 0], history: 3, last: 1, prev: 2 });
  S({ id: 'a-elena', name: 'Elena Rossi', base: [105, 60, 135], trend: [5, 2.5, 5], total: 3, cur: 2, last: 3, prev: 3 });
  S({ id: 'a-marcus', name: 'Marcus Doyle', base: [210, 150, 250], trend: [2.5, 0, 5], perWeek: 4, last: 4, prev: 3, felt: { bench: [8, 9.5] } });
  S({ id: 'a-arjun', name: 'Arjun Mehta', base: [190, 125, 235], trend: [5, 2.5, 2.5], last: 3, prev: 3 });
  S({ id: 'a-kofi', name: 'Kofi Mensah', base: [220, 160, 265], trend: [7.5, 5, 7.5], perWeek: 4, last: 4, prev: 3, felt: { squat: [8, 8.5] } });
  S({ id: 'a-ines', name: 'Ines Duarte', base: [120, 75, 155], trend: [2.5, 2.5, 0], last: 3, prev: 3, drift: true });
  S({ id: 'a-leo', name: 'Leo Grant', base: [182.5, 125, 225], trend: [5, 2.5, 5], pr: ['squat'], perWeek: 4, last: 4, prev: 3, felt: { squat: [8, 9] } });
  S({ id: 'a-jonah', name: 'Jonah Reed', base: [160, 105, 200], trend: [-5, -2.5, -5], perWeek: 4, last: 0, prev: 1 });
  S({ id: 'a-mei', name: 'Mei Tanaka', base: [125, 72.5, 160], trend: [2.5, 0, 2.5], total: 6, cur: 3, last: 3, prev: 3 });
  S({ id: 'a-callum', name: 'Callum Ward', base: [195, 135, 240], trend: [5, 2.5, 5], finished: true, total: 3, cur: 3, last: 3, prev: 3 });
  S({ id: 'a-hannah', name: 'Hannah Berg', noProgram: true });
  S({ id: 'a-dev', name: 'Dev Patel', base: [170, 115, 215], trend: [2.5, 0, 5], pr: ['deadlift'], perWeek: 4, last: 4, prev: 3 });
  S({ id: 'a-sofia', name: 'Sofia Alvarez', base: [140, 82.5, 180], trend: [5, 2.5, 2.5], pr: ['bench'], perWeek: 4, last: 4, prev: 3 });
  S({ id: 'a-ryan', name: 'Ryan O’Neill', base: [200, 140, 235], trend: [2.5, 2.5, 2.5], perWeek: 4, last: 3, prev: 3 });
  S({ id: 'a-amara', name: 'Amara Okafor', base: [130, 80, 170], trend: [2.5, 0, 2.5], perWeek: 4, last: 4, prev: 2 });
  S({ id: 'a-tomas', name: 'Tomas Novak', base: [175, 120, 220], trend: [0, 2.5, 0], perWeek: 4, last: 1, prev: 3 });
  S({ id: 'a-grace', name: 'Grace Liu', base: [110, 62.5, 140], trend: [0, 0, 0], history: 3, last: 3, prev: 3 });
  // Pain (who and how often, never where), meets with the class and the latest weigh-in, their words, checks.
  T.pain_reports.push({ id: nid('r'), athlete_id: 'a-priya', day: ago(6), body_part: 'knee', side: 'left', severity: 4, lift: 'squat', resolved_at: null },
    { id: nid('r'), athlete_id: 'a-priya', day: ago(2), body_part: 'knee', side: 'left', severity: 5, lift: 'squat', resolved_at: null },
    { id: nid('r'), athlete_id: 'a-sarah', day: ago(4), body_part: 'low_back', side: null, severity: 6, lift: 'deadlift', resolved_at: null },
    { id: nid('r'), athlete_id: 'a-dev', day: ago(5), body_part: 'shoulder', side: 'right', severity: 2, lift: 'bench', resolved_at: ago(3) + 'T10:00:00Z' });
  T.meets.push({ id: nid('m'), athlete_id: 'a-tom', name: 'Autumn Open', meet_date: addDays(TODAY, 5), weight_class: '93 kg' },
    { id: nid('m'), athlete_id: 'a-priya', name: 'Autumn Open', meet_date: addDays(TODAY, 5), weight_class: '63 kg' },
    { id: nid('m'), athlete_id: 'a-elena', name: 'State Championships', meet_date: addDays(TODAY, 12), weight_class: '57 kg' },
    { id: nid('m'), athlete_id: 'a-sofia', name: 'Autumn Classic', meet_date: addDays(TODAY, 33), weight_class: '76 kg' },
    { id: nid('m'), athlete_id: 'a-amara', name: 'Nationals Qualifier', meet_date: addDays(TODAY, 47), weight_class: '84 kg' },
    { id: nid('m'), athlete_id: 'a-arjun', name: 'Winter Open', meet_date: addDays(TODAY, 70), weight_class: '105 kg' });
  [['a-tom', [92.6, 92.3, 92.1]], ['a-priya', [62.9, 62.6, 62.4]], ['a-elena', [59.0, 58.7, 58.4]], ['a-sofia', [75.6, 75.4, 75.1]], ['a-amara', [82.0]]].forEach(([id, ws]) => {
    ws.forEach((w, i) => T.bodyweight.push({ id: nid('b'), athlete_id: id, date: ago(id === 'a-amara' ? 30 : 10 - i * 4), weight: w }));
  });
  T.messages.push(
    { id: nid('g'), coach_id: 'c-sam', athlete_id: 'a-kofi', sender_id: 'c-sam', body: 'Good week. Hold the loads on Friday.', created_at: at(51), read_at: at(49) },
    { id: nid('g'), coach_id: 'c-sam', athlete_id: 'a-kofi', sender_id: 'a-kofi', body: 'Can we move Friday to Saturday? My knee is sore after squats.', created_at: at(31), read_at: null },
    { id: nid('g'), coach_id: 'c-sam', athlete_id: 'a-arjun', sender_id: 'a-arjun', body: 'Is the deadlift single at 230 still on?', created_at: at(52), read_at: at(40) },
    { id: nid('g'), coach_id: 'c-sam', athlete_id: 'a-tom', sender_id: 'a-tom', body: 'Weigh-in is at 8.', created_at: at(30), read_at: at(29) },
    { id: nid('g'), coach_id: 'c-sam', athlete_id: 'a-tom', sender_id: 'c-sam', body: 'Perfect, see you there.', created_at: at(29), read_at: null },
    { id: nid('g'), coach_id: 'c-sam', athlete_id: 'a-ryan', sender_id: 'a-ryan', body: 'Done for today!', created_at: at(3), read_at: null });   // 3 hours: not waiting yet
  T.session_notes.push(
    { id: nid('n'), athlete_id: 'a-mei', date: ago(2), note: 'Left knee felt tight on the last squat set. Nothing sharp. Keep going as written?', coach_comment: null },
    { id: nid('n'), athlete_id: 'a-sarah', date: ago(3), note: 'Back felt better today.', coach_comment: 'Great, keep the belt on.' },
    { id: nid('n'), athlete_id: 'a-grace', date: ago(1), note: '   ', coach_comment: null });
  T.form_checks.push({ id: nid('f'), athlete_id: 'a-arjun', coach_id: 'c-sam', coach_reply: null, note: 'Hips shooting up?' });
  T.checkins.push({ id: nid('k'), athlete_id: 'a-leo', created_at: ago(20) + 'T09:00:00Z', week_start: ago(21) },
    { id: nid('k'), athlete_id: 'a-elena', created_at: ago(4) + 'T09:00:00Z', week_start: ago(7) });
  T.client_billing.push(
    { id: nid('cb'), athlete_id: 'a-tom', coach_id: 'c-sam', amount_cents: 22000, currency: 'USD', next_due: ago(5), status: 'active' },
    { id: nid('cb'), athlete_id: 'a-tomas', coach_id: 'c-sam', amount_cents: 18000, currency: 'USD', next_due: ago(12), status: 'active' },
    { id: nid('cb'), athlete_id: 'a-sarah', coach_id: 'c-sam', amount_cents: 20000, currency: 'USD', next_due: addDays(TODAY, 2), status: 'active' },
    { id: nid('cb'), athlete_id: 'a-elena', coach_id: 'c-sam', amount_cents: 22000, currency: 'USD', next_due: addDays(TODAY, 6), status: 'active' },
    { id: nid('cb'), athlete_id: 'a-arjun', coach_id: 'c-sam', amount_cents: 26000, currency: 'USD', next_due: addDays(TODAY, 20), status: 'active' },
    { id: nid('cb'), athlete_id: 'a-jonah', coach_id: 'c-sam', amount_cents: 15000, currency: 'USD', next_due: ago(30), status: 'paused' });
  T.coach_applications.push(
    { id: nid('ap'), coach_id: 'c-sam', name: 'Rhea Kapoor', email: 'rhea@example.com', status: 'new', confirmed_at: ago(1) + 'T08:00:00Z', created_at: ago(1) + 'T07:58:00Z' },
    { id: nid('ap'), coach_id: 'c-sam', name: 'Owen Fry', email: 'owen@example.com', status: 'new', confirmed_at: ago(4) + 'T08:00:00Z', created_at: ago(4) + 'T07:58:00Z' },
    { id: nid('ap'), coach_id: 'c-sam', name: 'Unconfirmed', email: 'x@example.com', status: 'new', confirmed_at: null, created_at: ago(0) + 'T07:00:00Z' },
    { id: nid('ap'), coach_id: 'c-sam', name: 'Taken On', email: 'y@example.com', status: 'accepted', confirmed_at: ago(9) + 'T08:00:00Z', created_at: ago(9) + 'T07:00:00Z' });
  T.invites.push({ code: 'SAM001', coach_id: 'c-sam', used: false, created_at: ago(3) + 'T10:00:00Z' }, { code: 'SAM002', coach_id: 'c-sam', used: false, created_at: ago(15) + 'T10:00:00Z' },
    { code: 'SAM003', coach_id: 'c-sam', used: false, created_at: ago(90) + 'T10:00:00Z' }, { code: 'SAM004', coach_id: 'c-sam', used: true, created_at: ago(20) + 'T10:00:00Z' });

  // ---------------------------------------------------------------- Mia: 3 lifters, the free plan full
  coach(T, 'c-mia', 'Mia Chen', 'mia.coach@example.com', 'free', { subscription_period_end: null, unit: 'lbs' });
  lifter(T, { id: 'm-ana', name: 'Ana Silva', coach: 'c-mia', base: [140, 85, 170], trend: [5, 2.5, 5], pr: ['deadlift'], last: 3, prev: 3 });
  lifter(T, { id: 'm-ben', name: 'Ben Ortiz', coach: 'c-mia', base: [180, 120, 210], trend: [0, 0, -2.5], last: 1, prev: 3 });
  lifter(T, { id: 'm-cy', name: 'Cy <script>Park</script>', coach: 'c-mia', base: [150, 100, 190], trend: [2.5, 2.5, 2.5], last: 3, prev: 2 });
  T.pain_reports.push({ id: nid('r'), athlete_id: 'm-ben', day: ago(5), body_part: 'elbow', side: 'right', severity: 3, lift: 'bench', resolved_at: null });

  // ---------------------------------------------------------------- Big Barbell: 60 lifters (seeded)
  coach(T, 'c-big', 'Big Barbell', 'big@coach.test', 'premium');
  const R = rng(60);
  for (let i = 0; i < 60; i++) {
    const id = 'g-' + String(i).padStart(2, '0'), name = FIRST[i % FIRST.length] + ' ' + LASTN[(i * 7) % LASTN.length];
    const per = 3 + (i % 2), b = [120 + Math.round(R() * 100), 70 + Math.round(R() * 70), 150 + Math.round(R() * 110)];
    const last = R() < 0.2 ? Math.floor(R() * 2) : per - (R() < 0.3 ? 1 : 0);
    const felt = R() < 0.25 ? { [LIFTS[i % 3]]: [8, R() < 0.5 ? 9 : 9.5] } : null;
    lifter(T, { id, name, coach: 'c-big', base: b, trend: [r25(R() * 10 - 2.5), r25(R() * 7.5 - 2.5), r25(R() * 10 - 2.5)], pr: R() < 0.2 ? [LIFTS[i % 3]] : [],
      perWeek: per, total: 4, cur: i % 9 === 0 ? 3 : 1, last, prev: per, finished: i % 17 === 5, noProgram: i % 23 === 7, felt, drift: i % 13 === 4 });
    if (i % 8 === 3) T.pain_reports.push({ id: nid('r'), athlete_id: id, day: ago(3 + (i % 4)), body_part: 'hip', side: 'left', severity: 4, lift: 'squat', resolved_at: null });
    if (i % 6 === 1) T.messages.push({ id: nid('g'), coach_id: 'c-big', athlete_id: id, sender_id: id, body: 'Quick question about my hip', created_at: at(20 + i), read_at: null });
    if (i % 5 === 2) {
      T.meets.push({ id: nid('m'), athlete_id: id, name: ['Spring Cup', 'City Open', 'Regionals', 'Masters Classic', 'Raw Nationals', 'Push Pull', 'Novice Open', 'Club Champs'][i % 8], meet_date: addDays(TODAY, 4 + i), weight_class: ['66 kg', '74 kg', '83', '93 kg', '120+'][i % 5] });
      T.bodyweight.push({ id: nid('b'), athlete_id: id, date: ago(2), weight: [66.8, 73.1, 84.2, 92.9, 125][i % 5] });
    }
    if (i % 7 === 0) T.client_billing.push({ id: nid('cb'), athlete_id: id, coach_id: 'c-big', amount_cents: 15000, currency: i % 21 === 0 ? 'EUR' : 'USD', next_due: ago(i % 10), status: 'active' });
    if (i % 11 === 0) T.form_checks.push({ id: nid('f'), athlete_id: id, coach_id: 'c-big', coach_reply: null });
  }

  // ---------------------------------------------------------------- Dan: 5 lifters, no billing, no meets
  coach(T, 'c-dan', 'Dan Ross', 'dan@coach.test', 'basic');
  [['d-1', 'Eve Hart', 3, 3], ['d-2', 'Finn Cole', 3, 2], ['d-3', 'Gia Moss', 4, 4], ['d-4', 'Hal Pike', 4, 0], ['d-5', 'Ivy Lane', 3, 3]].forEach(([id, name, per, last], k) =>
    lifter(T, { id, name, coach: 'c-dan', base: [150 + k * 10, 95 + k * 5, 180 + k * 10], trend: [k * 2.5 - 2.5, 2.5, k * 2.5], perWeek: per, last, prev: per }));

  // ---------------------------------------------------------------- the dormant coach
  coach(T, 'c-quiet', 'Quiet Coach', 'quiet@coach.test', 'basic');
  lifter(T, { id: 'q-1', name: 'Idle Ivy', coach: 'c-quiet', quiet: true });
  lifter(T, { id: 'q-2', name: 'Still Sam', coach: 'c-quiet', quiet: true });
  return { today: TODAY, now: NOW, tables: T };
}

// ---------------------------------------------------------------- the world as the app's Store has it (db.js's mappers)
export function storeFor(tables, coachId) {
  const T = tables, of = (t) => T[t] || [];
  const coach = of('profiles').find(p => p.id === coachId) || {};
  return {
    store: {
      athletes: of('profiles').filter(p => p.coach_id).map(p => ({ id: p.id, name: p.name, coachId: p.coach_id })),
      programs: of('programs').map(p => ({ id: p.id, athleteId: p.athlete_id, coachId: p.coach_id, weeks: p.weeks })),
      workoutLogs: of('workout_logs').map(l => ({ id: l.id, athleteId: l.athlete_id, lift: l.lift, date: l.date, e1rmComp: l.e1rm_comp, weight: l.weight, reps: l.reps })),
      painReports: of('pain_reports').map(r => ({ id: r.id, athleteId: r.athlete_id, day: r.day, bodyPart: r.body_part, side: r.side, severity: r.severity, lift: r.lift, resolvedAt: r.resolved_at })),
      checkins: of('checkins').map(c => ({ athleteId: c.athlete_id, createdAt: c.created_at, weekStart: c.week_start })),
      checkinAnswers: of('checkin_answers').map(a => ({ athleteId: a.athlete_id, period: a.period })),
      meets: of('meets').map(m => ({ id: m.id, athleteId: m.athlete_id, name: m.name, date: m.meet_date, weightClass: m.weight_class || '' })),
      clientBilling: of('client_billing').map(b => ({ athleteId: b.athlete_id, coachId: b.coach_id, amountCents: b.amount_cents, currency: b.currency, nextDue: b.next_due, status: b.status })),
      bodyweight: of('bodyweight').map(b => ({ id: b.id, athleteId: b.athlete_id, date: b.date, weight: Number(b.weight) })),
      messages: of('messages').map(m => ({ id: m.id, coachId: m.coach_id, athleteId: m.athlete_id, senderId: m.sender_id, body: m.body, createdAt: m.created_at, readAt: m.read_at })),
      sessionNotes: of('session_notes').map(n => ({ id: n.id, athleteId: n.athlete_id, date: n.date, note: n.note, coachComment: n.coach_comment || null })),
      // The coach reads only their own confirmed applications (RLS).
      coachApplications: of('coach_applications').filter(a => a.coach_id === coachId && a.confirmed_at).map(a => ({ id: a.id, coachId: a.coach_id, status: a.status })),
      invites: of('invites').filter(i => i.coach_id === coachId).map(i => ({ code: i.code, coachId: i.coach_id, used: i.used, createdAt: Date.parse(i.created_at) }))
    },
    formChecks: of('form_checks').filter(f => f.coach_id === coachId).map(f => ({ id: f.id, athleteId: f.athlete_id, coachId: f.coach_id, coachReply: f.coach_reply })),
    plan: { tier: coach.subscription_tier, periodEnd: coach.subscription_period_end || null }
  };
}

// ---------------------------------------------------------------- the RPCs, answered as the SQL does
export function rpcAnswer(CR, tables, name, p) {
  const T = tables;
  if (name === 'coach_week_stats') {
    const ids = [...new Set(p.p_athletes || [])];
    return ids.map(id => {
      const logs = (T.workout_logs || []).filter(l => l.athlete_id === id && String(l.date).slice(0, 10) <= p.p_to);
      const days = new Set(logs.filter(l => l.date >= p.p_from).map(l => l.date));
      const rFrom = CR.addDays(p.p_to, -27), pFrom = CR.addDays(p.p_to, -55), lifts = {};
      logs.forEach(l => {
        const L = String(l.lift).toLowerCase(), e = Number(l.e1rm_comp);
        if (!['squat', 'bench', 'deadlift'].includes(L) || !(e > 0)) return;
        const x = lifts[L] || (lifts[L] = { during: null, before: null, recent: null, prior: null });
        const mx = (k) => { x[k] = Math.max(x[k] || 0, e); };
        if (l.date >= p.p_from) mx('during'); else mx('before');
        if (l.date >= rFrom) mx('recent'); else if (l.date >= pFrom) mx('prior');
      });
      return { athlete_id: id, sessions: days.size, lifts };
    });
  }
  if (name === 'coach_week_effort') {
    return (T.programs || []).filter(pr => (p.p_athletes || []).includes(pr.athlete_id))
      .map(pr => ({ athlete_id: pr.athlete_id, program_id: String(pr.id), sets: CR.effortSets(pr.weeks, p.p_from, p.p_to) }))
      .filter(r => r.sets.length);
  }
  if (name === 'coach_threads_last') {
    const last = {};
    (T.messages || []).filter(m => (p.p_athletes || []).includes(m.athlete_id)).forEach(m => {
      const k = m.coach_id + '|' + m.athlete_id;
      if (!last[k] || m.created_at > last[k].created_at) last[k] = m;
    });
    return Object.values(last).map(m => ({ coach_id: m.coach_id, athlete_id: m.athlete_id, last_at: m.created_at, last_sender_id: m.sender_id }));
  }
  throw new Error('no RPC ' + name);
}

// ---------------------------------------------------------------- the world as the edge function hands it to coach-report.js
export function rowsFor(CR, tables, coachId, W) {
  const T = tables, of = (t) => T[t] || [];
  const lifters = of('profiles').filter(p => p.coach_id === coachId).map(p => ({ id: p.id, name: p.name }));
  const ids = lifters.map(a => a.id), mine = (r) => ids.includes(r.athlete_id), today = W.today;
  const coach = of('profiles').find(p => p.id === coachId) || {};
  const meetRows = of('meets').filter(m => mine(m) && m.meet_date >= today && m.meet_date <= CR.addDays(today, 56));
  const meetIds = new Set(meetRows.map(m => m.athlete_id));
  return {
    athletes: lifters,
    programs: of('programs').filter(mine).map(p => ({ id: p.id, athlete_id: p.athlete_id, coach_id: p.coach_id, updated_at: p.updated_at,
      planned: CR.plannedPerWeek(p.weeks), weeks_left: CR.weeksLeft(p.weeks) })),
    stats: rpcAnswer(CR, T, 'coach_week_stats', { p_athletes: ids, p_from: W.from, p_to: W.to }),
    statsBefore: rpcAnswer(CR, T, 'coach_week_stats', { p_athletes: ids, p_from: CR.addDays(W.from, -7), p_to: CR.addDays(W.to, -7) }),
    effort: rpcAnswer(CR, T, 'coach_week_effort', { p_athletes: ids, p_from: W.from, p_to: W.to }),
    threads: rpcAnswer(CR, T, 'coach_threads_last', { p_athletes: ids }),
    pains: of('pain_reports').filter(r => mine(r) && r.day >= W.from && r.day <= W.to),
    checkins: of('checkins').filter(mine), checkinAnswers: of('checkin_answers').filter(mine),
    formChecks: of('form_checks').filter(f => f.coach_id === coachId && !f.coach_reply),
    billing: of('client_billing').filter(b => b.coach_id === coachId && b.status === 'active' && b.next_due <= CR.addDays(today, 7)),
    meets: meetRows,
    notes: of('session_notes').filter(n => mine(n) && !n.coach_comment && n.date >= CR.addDays(today, -28)),
    bodyweight: of('bodyweight').filter(b => meetIds.has(b.athlete_id) && b.date >= CR.addDays(today, -14) && b.date <= today),
    applications: of('coach_applications').filter(a => a.coach_id === coachId && a.status === 'new' && a.confirmed_at),
    invites: of('invites').filter(i => i.coach_id === coachId),
    plan: { subscription_tier: coach.subscription_tier, subscription_period_end: coach.subscription_period_end || null }
  };
}
