#!/usr/bin/env node
// ============================================================
// POWALIFTA — demo account + test-data seeder
//
// Creates two real, loggable-in accounts and a full slate of test data so every
// feature can be exercised end to end:
//
//   COACH    democoach@gmail.com   / DemoCoach1     (tier: pro)
//   ATHLETE  demoathlete@gmail.com / DemoAthlete1   (linked under the coach)
//
// It seeds:
//   • both profiles, athlete linked to coach (coach_id)
//   • a 4-week coach-assigned program for the athlete, ~40% of sets completed
//   • a PUBLISHED marketplace program owned by the coach (with reference 1RMs)
//   • a pending marketplace sale (athlete bought the coach's program) so the
//     coach earnings dashboard, admin payout queue, and the athlete "Claim my
//     program" banner all have something to show
//   • ~12 weeks of workout logs + bodyweight + SBD goals for the athlete so the
//     Progress / Bodyweight / Goals charts are populated
//
// HOW TO RUN (uses your project's service-role key — NEVER commit it):
//   1. Supabase dashboard → Project Settings → API → copy the `service_role` key
//   2. From the repo root:
//        SUPABASE_SERVICE_ROLE_KEY='paste-key-here' node seed-demo.mjs
//
// Requires Node 18+ (for global fetch + crypto.randomUUID). No npm install.
// Idempotent: re-running updates the same rows instead of duplicating them.
// This is a LOCAL DEV TOOL — do not deploy it.
// ============================================================

const SUPABASE_URL = 'https://cxnotrikxvzncupswvio.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!SERVICE_KEY) {
  console.error('\n  ✗ Missing SUPABASE_SERVICE_ROLE_KEY.\n');
  console.error("    Run it like:  SUPABASE_SERVICE_ROLE_KEY='eyJ...' node seed-demo.mjs\n");
  console.error('    (Dashboard → Project Settings → API → service_role secret)\n');
  process.exit(1);
}

const H = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

const uuid = () => crypto.randomUUID();

// Fixed IDs so re-runs upsert the same rows rather than piling up duplicates.
const MARKET_PROGRAM_ID = 'a0000000-0000-4000-8000-000000000001';
const DEMO_SALE_ORDER_ID = 'demo-order-0001';
const DEMO_SALE_EVENT_ID = 'demo-event-0001';

// ---------- HTTP helpers ----------------------------------------------------
async function authApi(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST', headers: H, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200&page=${page}`, { headers: H });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const users = data.users || data || [];
    if (!users.length) break;
    const hit = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) break;
  }
  return null;
}

async function getOrCreateUser(email, password, meta) {
  const { ok, status, json } = await authApi('admin/users', {
    email, password, email_confirm: true, user_metadata: meta,
  });
  if (ok && json.id) return { id: json.id, created: true };
  // Already exists → look it up and (re)set the password so the documented creds work.
  const existing = await findUserByEmail(email);
  if (existing) {
    await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ password, email_confirm: true, user_metadata: meta }),
    });
    return { id: existing.id, created: false };
  }
  throw new Error(`Could not create or find user ${email} (status ${status}): ${JSON.stringify(json)}`);
}

async function rest(method, table, { rows, query = '', prefer = '' } = {}) {
  const headers = { ...H };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method, headers, body: rows ? JSON.stringify(rows) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${table} → ${res.status}: ${text}`);
  }
  return res;
}

const upsert = (table, rows, onConflict) =>
  rest('POST', table, {
    rows: Array.isArray(rows) ? rows : [rows],
    query: onConflict ? `?on_conflict=${onConflict}` : '',
    prefer: 'resolution=merge-duplicates,return=minimal',
  });

const insert = (table, rows) =>
  rest('POST', table, { rows: Array.isArray(rows) ? rows : [rows], prefer: 'return=minimal' });

const del = (table, query) => rest('DELETE', table, { query, prefer: 'return=minimal' });

// ---------- domain helpers --------------------------------------------------
function e1rm(weight, reps, rpe) {
  const denom = 1 - ((reps - 1) + (10 - rpe)) * 0.0333;
  return Math.max(weight / denom, weight / 0.4);
}
const round1 = x => Math.round(x * 10) / 10;
const round2_5 = x => Math.round(x / 2.5) * 2.5;

function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }
const dateAgo = n => daysAgoISO(n).slice(0, 10);

function mkSet(weight, reps, rpe) {
  return { id: uuid(), weight, reps, rpe, completed: false, actualRpe: null, completedAt: null, note: '' };
}

// Squat / Bench / Deadlift days, each with a main lift + one accessory.
const DAY_TEMPLATES = [
  { name: 'Squat Day',    main: { lift: 'squat',    base: 140 }, acc: { lift: 'legs', name: 'Leg Press',       w: 200, reps: 10, rpe: 8 } },
  { name: 'Bench Day',    main: { lift: 'bench',    base: 95  }, acc: { lift: 'push', name: 'Tricep Pushdown', w: 30,  reps: 14, rpe: 9 } },
  { name: 'Deadlift Day', main: { lift: 'deadlift', base: 180 }, acc: { lift: 'pull', name: 'Barbell Row',     w: 90,  reps: 8,  rpe: 8 } },
];

// Build a 4-week block. `completedFraction` of all sets get marked done with
// realistic completedAt dates (oldest first), so the athlete reads as mid-block.
function buildAthleteProgram(athleteId, coachId, completedFraction) {
  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const days = DAY_TEMPLATES.map(T => {
      const top = round2_5(T.main.base * (1 + w * 0.025)); // +2.5%/week progression
      return {
        id: uuid(), name: T.name, exercises: [
          { id: uuid(), lift: T.main.lift, variant: 'Competition', exerciseName: '',
            note: w === 0 ? 'Build through the block — leave 1–2 reps in the tank.' : '',
            sets: [mkSet(top, 5, 7), mkSet(top, 5, 8), mkSet(top, 5, 8)] },
          { id: uuid(), lift: T.acc.lift, variant: '', exerciseName: T.acc.name, note: '',
            sets: [mkSet(T.acc.w, T.acc.reps, T.acc.rpe), mkSet(T.acc.w, T.acc.reps, T.acc.rpe)] },
        ],
      };
    });
    weeks.push({ id: uuid(), number: w + 1, days });
  }
  const allSets = weeks.flatMap(wk => wk.days.flatMap(d => d.exercises.flatMap(e => e.sets)));
  const target = Math.floor(allSets.length * completedFraction);
  allSets.forEach((s, i) => {
    if (i < target) {
      s.completed = true;
      s.actualRpe = s.rpe;
      // spread completions across the last ~5 weeks, oldest set first
      s.completedAt = daysAgoISO(Math.round(((target - i) / target) * 35) + 1);
    }
  });
  return {
    id: uuid(), athlete_id: athleteId, coach_id: coachId,
    name: 'Spring Peaking Block', weeks, updated_at: new Date().toISOString(),
  };
}

// Marketplace payload uses the coach's own (heavier) numbers; weights are kept
// and the buyer's claim flow rescales them to the buyer's 1RMs.
function buildMarketplacePayload() {
  const base = { squat: 200, bench: 140, deadlift: 240 };
  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const days = [
      { lift: 'squat', name: 'Squat Focus', base: base.squat },
      { lift: 'bench', name: 'Bench Focus', base: base.bench },
      { lift: 'deadlift', name: 'Pull Focus', base: base.deadlift },
    ].map(D => ({
      id: uuid(), name: D.name, exercises: [
        { id: uuid(), lift: D.lift, variant: 'Competition', exerciseName: '', note: '',
          sets: [mkSet(round2_5(D.base * (0.8 + w * 0.03)), 4, 7),
                 mkSet(round2_5(D.base * (0.8 + w * 0.03)), 4, 8)] },
      ],
    }));
    weeks.push({ id: uuid(), number: w + 1, days });
  }
  return { weeks };
}

// 12 weekly top-set logs per main lift, gently progressing → progress charts.
function buildWorkoutLogs(athleteId) {
  const lifts = [
    { lift: 'squat', start: 132.5, step: 2.5, reps: 5 },
    { lift: 'bench', start: 88,    step: 1.5, reps: 5 },
    { lift: 'deadlift', start: 170, step: 3,  reps: 3 },
  ];
  const rows = [];
  for (let wk = 11; wk >= 0; wk--) {
    const date = dateAgo(wk * 7 + 2);
    const rpe = 8 + (wk < 3 ? 0.5 : 0); // heavier RPE near the end
    for (const L of lifts) {
      const weight = round2_5(L.start + (11 - wk) * L.step);
      const est = round1(e1rm(weight, L.reps, rpe));
      rows.push({
        id: uuid(), athlete_id: athleteId, lift: L.lift, variant: 'Competition',
        exercise_name: null, weight, reps: L.reps, rpe,
        e1rm: est, e1rm_comp: est, // Competition variant → multiplier 1.0
        note: null, date,
      });
    }
  }
  return rows;
}

function buildBodyweight(athleteId) {
  const rows = [];
  for (let wk = 11; wk >= 0; wk--) {
    rows.push({
      id: uuid(), athlete_id: athleteId, date: dateAgo(wk * 7 + 1),
      weight: round1(84 - (11 - wk) * 0.15 + (Math.random() - 0.5) * 0.4),
    });
  }
  return rows;
}

// ---------- main ------------------------------------------------------------
async function main() {
  console.log('\n  POWALIFTA demo seeder →', SUPABASE_URL, '\n');

  // 1) auth users
  const coach = await getOrCreateUser('democoach@gmail.com', 'DemoCoach1',
    { name: 'Marcus Holloway', user_type: 'coach', bio: 'Raw classic powerlifting. 15 years under the bar, IPF-tested.' });
  console.log(`  ${coach.created ? '＋ created' : '↻ exists '} coach   democoach@gmail.com   (${coach.id})`);

  const athlete = await getOrCreateUser('demoathlete@gmail.com', 'DemoAthlete1',
    { name: 'Priya Raghunathan', user_type: 'athlete' });
  console.log(`  ${athlete.created ? '＋ created' : '↻ exists '} athlete demoathlete@gmail.com (${athlete.id})`);

  // 2) profiles (service role bypasses RLS + the privilege guard)
  await upsert('profiles', {
    id: coach.id, name: 'Marcus Holloway', email: 'democoach@gmail.com',
    user_type: 'coach', subscription_tier: 'pro', is_admin: false,
    bio: 'Raw classic powerlifting. 15 years under the bar, IPF-tested.',
    country_code: 'US',
  }, 'id');
  await upsert('profiles', {
    id: athlete.id, name: 'Priya Raghunathan', email: 'demoathlete@gmail.com',
    user_type: 'athlete', coach_id: coach.id, subscription_tier: 'free',
    country_code: 'GB',
  }, 'id');
  console.log('  ✓ profiles upserted, athlete linked to coach');

  // 3) coach-assigned program for the athlete, ~40% complete
  await del('programs', `?athlete_id=eq.${athlete.id}`);
  await insert('programs', buildAthleteProgram(athlete.id, coach.id, 0.40));
  console.log('  ✓ assigned program "Spring Peaking Block" (40% logged)');

  // 4) published marketplace program owned by the coach
  await upsert('marketplace_programs', {
    id: MARKET_PROGRAM_ID, coach_id: coach.id,
    title: '12-Week Raw Strength Blueprint',
    description: 'A peaking block built around competition SBD. RPE-driven top sets with autoregulated back-offs. Comes pre-scaled to your own 1RMs when you claim it.',
    tier: 'block', price_cents: 4900, week_count: 4, status: 'published',
    program_payload: buildMarketplacePayload(),
    reference_1rms: { squat: 200, bench: 140, deadlift: 240 },
    ls_product_id: 'demo-product', ls_variant_id: 'demo-variant',
    ls_checkout_url: 'https://powalifta.lemonsqueezy.com/checkout/demo',
    sold_count: 1, updated_at: new Date().toISOString(),
  }, 'id');
  console.log('  ✓ published marketplace program (with reference 1RMs)');

  // 5) a pending sale so earnings / payouts / claim banner all have data
  await upsert('program_sales', {
    id: uuid(), marketplace_program_id: MARKET_PROGRAM_ID,
    buyer_id: athlete.id, coach_id: coach.id,
    amount_cents: 4900, platform_fee_cents: 980, coach_payout_cents: 3920,
    payout_status: 'pending', ls_order_id: DEMO_SALE_ORDER_ID, ls_event_id: DEMO_SALE_EVENT_ID,
  }, 'ls_event_id');
  console.log('  ✓ seeded a pending marketplace sale (athlete → coach)');

  // 6) progress data for the athlete
  await del('workout_logs', `?athlete_id=eq.${athlete.id}`);
  await insert('workout_logs', buildWorkoutLogs(athlete.id));
  await upsert('bodyweight', buildBodyweight(athlete.id), 'athlete_id,date');
  await upsert('goals', {
    athlete_id: athlete.id, squat: 185, bench: 125, deadlift: 230, total: 540,
    bodyweight: 82, bw_direction: 'maintain', updated_at: new Date().toISOString(),
  }, 'athlete_id');
  console.log('  ✓ 12 weeks of logs + bodyweight + SBD goals');

  console.log('\n  Done. Log in at your site with:');
  console.log('    coach    democoach@gmail.com   / DemoCoach1');
  console.log('    athlete  demoathlete@gmail.com / DemoAthlete1\n');
}

main().catch(e => { console.error('\n  ✗ Seed failed:', e.message, '\n'); process.exit(1); });
