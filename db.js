/* POWALIFTA — Supabase data layer
 * Loaded after the Supabase JS client (window.supabase namespace).
 * Exposes:
 *   - sb        : Supabase client
 *   - DB        : auth + table operations
 *   - mapDb*    : row mappers (snake_case → camelCase)
 *   - mapJs*    : reverse mappers
 */

const SUPABASE_URL = 'https://cxnotrikxvzncupswvio.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bm90cmlreHZ6bmN1cHN3dmlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3OTgwNDAsImV4cCI6MjA5MzM3NDA0MH0.fLl1sXdHnI8IeKUIKOB9Sh0HVATCdshcLXZs5oKuCuU';

// A password-reset link that lands anywhere but the reset page goes there first, token and
// all, before the client below reads it and signs the visitor in. (Supabase falls back to the
// site's home page when a reset's return address isn't on its allow list; the lifter then saw
// their account instead of a "choose a new password" page.)
(function routeRecoveryLink() {
  try {
    if (/(^|[#&])type=recovery(&|$)/.test(location.hash) && !/\/reset-password\.html$/.test(location.pathname)) {
      location.replace('/reset-password.html' + location.hash);
    }
  } catch (e) {}
})();

if (!window.supabase || !window.supabase.createClient) {
  console.error('Supabase JS not loaded. Make sure <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> is included BEFORE db.js');
}
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// MAPPERS — DB row (snake_case) ↔ JS object (camelCase)
// ============================================================
function mapDbProfileToCoach(r) {
  return {
    id: r.id, name: r.name, email: r.email, bio: r.bio || '',
    avatarUrl: r.avatar_url || null,
    countryCode: r.country_code || null,
    instagram: r.instagram || null,
    tiktok: r.tiktok || null,
    referralCode: r.referral_code || null,
    referredByCode: r.referred_by_code || null,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
  };
}
function mapDbProfileToAthlete(r) {
  return {
    id: r.id, name: r.name, email: r.email, coachId: r.coach_id,
    avatarUrl: r.avatar_url || null,
    countryCode: r.country_code || null,
    instagram: r.instagram || null,
    tiktok: r.tiktok || null,
    referralCode: r.referral_code || null,
    referredByCode: r.referred_by_code || null,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
  };
}
function mapDbReferral(r) {
  return {
    id: r.id, referrerId: r.referrer_id, referredId: r.referred_id,
    referredName: r.referred_name || 'New lifter', status: r.status || 'joined',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
  };
}
function mapDbRewardClaim(r) {
  return {
    id: r.id, userId: r.user_id, tierAt: r.tier_at,
    status: r.status || 'requested',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
  };
}
function mapDbClientError(r) {
  return {
    id: r.id, kind: r.kind || 'error',
    msg: r.msg || '', stack: r.stack || null,
    url: r.url || null, ua: r.ua || null,
    src: r.src || null, line: r.line, col: r.col,
    ts: r.ts ? new Date(r.ts).getTime() : null,
    receivedAt: r.received_at ? new Date(r.received_at).getTime() : (r.ts ? new Date(r.ts).getTime() : Date.now())
  };
}
function mapDbEmailPrefs(r) {
  // Missing row = opted in (the digest job treats absence as default-true too).
  // The push_* columns arrive with migration-notification-prefs.sql; before that
  // migration runs they're simply absent → still default-true here (opted in),
  // and send-push falls back to sending. So reads are safe pre- or post-migration.
  return {
    userId: r ? r.user_id : null,
    weeklyDigest: r ? r.weekly_digest !== false : true,
    // Marketing is opt-in (2026-10-21): off unless the person switched it on.
    productEmails: r ? r.product_emails === true : false,
    unsubToken: r ? (r.unsub_token || null) : null,
    // Push notification categories (#30) — default on.
    pushMessages: r ? r.push_messages !== false : true,
    pushFormChecks: r ? r.push_form_checks !== false : true,
    pushProgram: r ? r.push_program !== false : true
  };
}
// ---------- CLUBS (migration-clubs.sql) ----------
function mapDbClub(r) {
  if (!r) return null;
  return {
    id: r.id, name: r.name, city: r.city || '', description: r.description || '',
    code: r.code, visibility: r.visibility || 'public', ownerId: r.owner_id,
    memberCount: r.member_count || 0, createdAt: r.created_at
  };
}
function mapDbClubMember(r) {
  const n = (v) => (v == null ? null : Number(v));   // keep null ≠ 0 (no stats ≠ zero stats)
  return {
    clubId: r.club_id, userId: r.user_id, role: r.role, displayName: r.display_name,
    sex: r.sex || null, bodyweightKg: n(r.bodyweight_kg),
    squatKg: n(r.squat_kg), benchKg: n(r.bench_kg), deadliftKg: n(r.deadlift_kg),
    totalKg: n(r.total_kg), dots: n(r.dots),
    weekStart: r.week_start || null, weekSessions: r.week_sessions || 0,
    weekTonnageKg: Number(r.week_tonnage_kg) || 0,
    instagram: r.instagram || null,
    tiktok: r.tiktok || null,
    // Fair boards (migration-boards-tiktok.sql); null on rows from before it.
    weekPoints: n(r.week_points), weekPrs: n(r.week_prs), weekHardSets: n(r.week_hard_sets),
    improvePct: n(r.improve_pct),
    seasonId: n(r.season_id), seasonPoints: n(r.season_points), prevSeasonPoints: n(r.prev_season_points),
    statsUpdatedAt: r.stats_updated_at || null, joinedAt: r.joined_at
  };
}
function mapJsClubStats(s) {
  return {
    display_name: String(s.displayName || 'Lifter').slice(0, 60),
    sex: s.sex === 'female' ? 'female' : (s.sex === 'male' ? 'male' : null),
    bodyweight_kg: s.bodyweightKg, squat_kg: s.squatKg, bench_kg: s.benchKg, deadlift_kg: s.deadliftKg,
    total_kg: s.totalKg, dots: s.dots,
    week_start: s.weekStart || null, week_sessions: s.weekSessions || 0, week_tonnage_kg: s.weekTonnageKg || 0,
    instagram: s.instagram || null,
    tiktok: s.tiktok || null,
    week_points: s.weekPoints == null ? null : Math.max(0, Math.min(1000, Math.round(s.weekPoints))),
    week_prs: s.weekPrs == null ? null : Math.max(0, Math.min(10, s.weekPrs)),
    week_hard_sets: s.weekHardSets == null ? null : Math.max(0, Math.min(500, s.weekHardSets)),
    improve_pct: s.improvePct == null ? null : Math.max(-100, Math.min(1000, s.improvePct)),
    season_id: s.seasonId == null ? null : Math.round(s.seasonId),
    season_points: s.seasonPoints == null ? null : Math.max(0, Math.min(10000, Math.round(s.seasonPoints))),
    prev_season_points: s.prevSeasonPoints == null ? null : Math.max(0, Math.min(10000, Math.round(s.prevSeasonPoints))),
    stats_updated_at: new Date().toISOString()
  };
}
// Which of `cols` a PostgREST error says is missing ("Could not find the 'tiktok'
// column of 'profiles' in the schema cache"), or null when it's some other error.
function _missingCol(error, cols) {
  const msg = String((error && (error.message || error.details || error.hint)) || '');
  return (cols || []).find(c => new RegExp("['\"\\s.]" + c + "['\"\\s]|column[^a-z]*" + c + "\\b", 'i').test(msg)) || null;
}
// A friendly Error from a PostgREST/RPC failure. Before the migration runs the
// tables/functions don't exist — say so plainly instead of leaking SQL.
function _clubErr(error, notReadyMsg) {
  const m = String((error && (error.message || error.details)) || '');
  if (/does not exist|could not find the function|schema cache|PGRST20[0-9]|42P01|42883/i.test(m + ' ' + (error && error.code))) {
    const e = new Error(notReadyMsg || 'Clubs aren\'t switched on yet.'); e.notReady = true; return e;
  }
  return new Error(m.replace(/^.*?:\s*/, '') || 'Something went wrong. Try again.');
}
// ---------- CLUBS v2 (migration-clubs-social.sql): requests + feed ----------
function mapDbBuddy(r) {
  return { id: r.id, clubId: r.club_id, requesterId: r.requester_id, addresseeId: r.addressee_id, status: r.status,
    createdAt: r.created_at, acceptedAt: r.accepted_at || null, lastNudgeBy: r.last_nudge_by || null, lastNudgeAt: r.last_nudge_at || null };
}
function mapDbClubRequest(r) {
  return { id: r.id, clubId: r.club_id, userId: r.user_id, displayName: r.display_name || 'Lifter',
    message: r.message || '', status: r.status || 'pending', createdAt: r.created_at };
}
function mapDbClubPost(r) {
  const n = (v) => (v == null ? null : Number(v));
  return {
    id: r.id, clubId: r.club_id, userId: r.user_id, displayName: r.display_name || 'Lifter',
    kind: r.kind || 'set', lift: r.lift || null, exercise: r.exercise || '',
    weightKg: n(r.weight_kg), reps: n(r.reps), rpe: n(r.rpe), e1rmKg: n(r.e1rm_kg),
    setsCount: n(r.sets_count), tonnageKg: n(r.tonnage_kg), caption: r.caption || '', createdAt: r.created_at
  };
}
const CLUB_POST_LIFTS = ['squat', 'bench', 'deadlift', 'push', 'pull', 'legs', 'cardio', 'other'];
function mapJsClubPost(p) {
  const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(Number(v) * 10) / 10);
  const int = (v) => (v == null || !isFinite(v) ? null : Math.round(Number(v)));
  return {
    club_id: p.clubId, user_id: p.userId,
    kind: ['set', 'pr', 'session', 'note'].includes(p.kind) ? p.kind : 'set',
    lift: CLUB_POST_LIFTS.includes(p.lift) ? p.lift : (p.lift ? 'other' : null),
    exercise: p.exercise ? String(p.exercise).slice(0, 60) : null,
    weight_kg: r1(p.weightKg), reps: int(p.reps), rpe: p.rpe >= 1 && p.rpe <= 10 ? r1(p.rpe) : null, e1rm_kg: r1(p.e1rmKg),
    sets_count: int(p.setsCount), tonnage_kg: int(p.tonnageKg),
    caption: p.caption ? String(p.caption).slice(0, 280) : null
  };
}

function mapDbLeaderboardEntry(r) {
  return {
    userId: r.user_id,
    displayName: r.display_name || 'Lifter',
    sex: r.sex || null,
    bodyweightKg: r.bodyweight_kg != null ? Number(r.bodyweight_kg) : null,
    totalKg: r.total_kg != null ? Number(r.total_kg) : 0,
    dots: r.dots != null ? Number(r.dots) : 0,
    basis: r.basis || 'gym',
    countryCode: r.country_code || null,
    updatedAt: r.updated_at ? new Date(r.updated_at).getTime() : Date.now()
  };
}
function mapJsLeaderboardEntry(e) {
  const row = {
    user_id: e.userId,
    display_name: e.displayName || 'Lifter',
    total_kg: e.totalKg,
    dots: e.dots,
    basis: e.basis || 'gym',
    updated_at: new Date().toISOString()
  };
  if (e.sex) row.sex = e.sex;
  if (e.bodyweightKg != null) row.bodyweight_kg = e.bodyweightKg;
  if (e.countryCode) row.country_code = e.countryCode;
  return row;
}
function mapDbCoachRequest(r) {
  return {
    id: r.id, athleteId: r.athlete_id, coachId: r.coach_id,
    athleteName: r.athlete_name || 'An athlete', note: r.note || '',
    status: r.status || 'pending',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
  };
}
// Program JSON is written by a coach or a seller: a week's number must be a number before
// anything renders it (a string there reached innerHTML once).
function _cleanWeekNumbers(weeks) {
  return (Array.isArray(weeks) ? weeks : []).map((w, i) => {
    const n = Number(w && w.number);
    return Object.assign({}, w, { number: n > 0 && n < 1000 ? Math.round(n) : i + 1 });
  });
}
function mapDbProgram(r) {
  return { id: r.id, athleteId: r.athlete_id, coachId: r.coach_id, name: r.name, weeks: _cleanWeekNumbers(r.weeks) };
}
function mapJsProgram(p) {
  return { id: p.id, athlete_id: p.athleteId, coach_id: p.coachId, name: p.name, weeks: p.weeks || [], updated_at: new Date().toISOString() };
}
function mapDbTemplate(r) {
  return { id: r.id, coachId: r.coach_id, name: r.name, createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(), payload: r.payload };
}
function mapJsTemplate(t) {
  return { id: t.id, coach_id: t.coachId, name: t.name, payload: t.payload };
}
function mapDbLog(r) {
  return { id: r.id, athleteId: r.athlete_id, lift: r.lift, variant: r.variant || '', exerciseName: r.exercise_name || '',
    weight: Number(r.weight), reps: Number(r.reps), rpe: Number(r.rpe), e1rm: Number(r.e1rm), e1rmComp: Number(r.e1rm_comp),
    note: r.note || '', date: r.date };
}
function mapJsLog(l) {
  return { id: l.id, athlete_id: l.athleteId, lift: l.lift, variant: l.variant || null, exercise_name: l.exerciseName || null,
    weight: l.weight, reps: l.reps, rpe: l.rpe, e1rm: l.e1rm, e1rm_comp: l.e1rmComp,
    note: l.note || null, date: l.date };
}
function mapDbBw(r) { return { id: r.id, athleteId: r.athlete_id, date: r.date, weight: Number(r.weight) }; }
function mapJsBw(b) { return { id: b.id, athlete_id: b.athleteId, date: b.date, weight: b.weight }; }

// MEETS — a finished competition result. Best successful lift per discipline
// is stored in kg (internal unit); null = bombed / not contested (so the total
// must sum only the non-null lifts, never coerce null → 0).
function mapDbMeet(r) {
  const n = (v) => (v == null ? null : Number(v));
  return {
    id: r.id, athleteId: r.athlete_id,
    name: r.name || 'Meet', date: r.meet_date,
    federation: r.federation || '', weightClass: r.weight_class || '',
    bodyweight: n(r.bodyweight_kg),
    squat: n(r.squat_kg), bench: n(r.bench_kg), deadlift: n(r.deadlift_kg),
    notes: r.notes || '', createdAt: r.created_at
  };
}
function mapJsMeet(m) {
  const n = (v) => (v == null || v === '' ? null : Number(v));
  const out = {
    athlete_id: m.athleteId,
    name: m.name || 'Meet', meet_date: m.date,
    federation: m.federation || '', weight_class: m.weightClass || '',
    bodyweight_kg: n(m.bodyweight),
    squat_kg: n(m.squat), bench_kg: n(m.bench), deadlift_kg: n(m.deadlift),
    notes: m.notes || ''
  };
  if (m.id) out.id = m.id;   // present → upsert on PK; absent → DB generates
  return out;
}
function mapDbNote(r) {
  return {
    id: r.id, athleteId: r.athlete_id, weekId: r.week_id, dayId: r.day_id,
    note: r.note, date: r.date,
    coachComment: r.coach_comment || null,
    coachCommentAt: r.coach_comment_at || null,
    coachId: r.coach_id || null
  };
}
function mapJsNote(n) {
  const out = { id: n.id, athlete_id: n.athleteId, week_id: n.weekId, day_id: n.dayId, note: n.note, date: n.date };
  if (n.coachComment !== undefined) out.coach_comment = n.coachComment;
  if (n.coachCommentAt !== undefined) out.coach_comment_at = n.coachCommentAt;
  if (n.coachId !== undefined) out.coach_id = n.coachId;
  return out;
}
// Marketplace program — db ↔ js shape
// Every column but program_payload (sql/migration-security-2026-10-20.sql revokes it from
// the public role; buyers, the owner and admins read it through get_marketplace_payload).
const MP_COLS = 'category, coach_id, created_at, description, id, ls_checkout_url, ls_product_id, ls_variant_id, price_cents, reference_1rms, sold_count, status, tier, title, updated_at, week_count';
// A program's contents: through the RPC once the security migration has run; until then
// (PGRST202, no such function) the column is still readable directly, so read it that way.
async function _marketplacePayload(id) {
  const { data, error } = await sb.rpc('get_marketplace_payload', { p_id: id });
  if (!error) return data || null;
  if (error.code !== 'PGRST202') throw error;
  const { data: rows, error: e2 } = await sb.from('marketplace_programs').select('program_payload').eq('id', id).limit(1);
  if (e2) throw e2;
  return rows && rows[0] ? rows[0].program_payload : null;
}
function mapDbMarketplaceProgram(r) {
  return {
    id: r.id,
    coachId: r.coach_id,
    title: r.title,
    description: r.description || '',
    tier: r.tier,
    category: r.category || null,
    priceCents: r.price_cents,
    weekCount: r.week_count || 0,
    status: r.status,
    lsProductId: r.ls_product_id || null,
    lsVariantId: r.ls_variant_id || null,
    lsCheckoutUrl: r.ls_checkout_url || null,
    programPayload: r.program_payload,
    reference1RMs: r.reference_1rms || null,
    soldCount: r.sold_count || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}
function mapJsMarketplaceProgram(m) {
  const out = {
    id: m.id, coach_id: m.coachId,
    title: m.title, description: m.description || null,
    tier: m.tier, price_cents: m.priceCents,
    week_count: m.weekCount || 0,
    status: m.status || 'pending_review',
    program_payload: m.programPayload,
    reference_1rms: m.reference1RMs || null,
    updated_at: new Date().toISOString()
  };
  // Only send `category` when set — keeps inserts working before the
  // taxonomy migration has been applied (missing column → key absent).
  if (m.category) out.category = m.category;
  return out;
}
function mapDbSale(r) {
  return {
    id: r.id,
    marketplaceProgramId: r.marketplace_program_id,
    buyerId: r.buyer_id,
    coachId: r.coach_id,
    amountCents: r.amount_cents,
    platformFeeCents: r.platform_fee_cents,
    coachPayoutCents: r.coach_payout_cents,
    payoutStatus: r.payout_status,
    paidAt: r.paid_at,
    lsOrderId: r.ls_order_id,
    lsEventId: r.ls_event_id,
    createdAt: r.created_at
  };
}

function mapDbReview(r) {
  return {
    id: r.id,
    marketplaceProgramId: r.marketplace_program_id,
    coachId: r.coach_id,
    buyerId: r.buyer_id,
    buyerName: r.buyer_name || 'Verified buyer',
    rating: r.rating,
    body: r.body || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

function mapDbMessage(r) {
  return {
    id: r.id,
    coachId: r.coach_id,
    athleteId: r.athlete_id,
    senderId: r.sender_id,
    body: r.body || '',
    meta: (r.meta && typeof r.meta === 'object') ? r.meta : null,
    createdAt: r.created_at,
    readAt: r.read_at || null
  };
}
function mapDbReaction(r) {
  return { messageId: r.message_id || null, postId: r.post_id || null, userId: r.user_id, reaction: r.reaction || null,
    coachId: r.coach_id || null, athleteId: r.athlete_id || null, clubId: r.club_id || null, updatedAt: r.updated_at };
}
const _isNotReady = (error) => /does not exist|could not find|schema cache|PGRST20[0-9]|42P01|42703|42883/i.test(String((error && (error.message || error.details)) || '') + ' ' + (error && error.code));

function mapDbFormCheck(r) {
  return {
    id: r.id,
    athleteId: r.athlete_id,
    coachId: r.coach_id,
    storagePath: r.storage_path,
    lift: r.lift || '',
    note: r.note || '',
    coachReply: r.coach_reply || null,
    coachReplyAt: r.coach_reply_at || null,
    createdAt: r.created_at
  };
}

function mapDbCheckinQuestion(r) {
  return { id: r.id, coachId: r.coach_id, prompt: r.prompt || '', kind: r.kind, choices: r.choices || null,
    cadence: r.cadence || 'weekly', athleteIds: r.athlete_ids || null, position: r.position || 0, active: r.active !== false,
    createdAt: r.created_at };
}
function mapJsCheckinQuestion(q) {
  return { coach_id: q.coachId, prompt: String(q.prompt || '').trim().slice(0, 140), kind: q.kind,
    choices: q.kind === 'choice' ? (q.choices || []).map(c => String(c).trim().slice(0, 40)).filter(Boolean).slice(0, 6) : null,
    cadence: q.cadence === 'daily' ? 'daily' : 'weekly', athlete_ids: q.athleteIds && q.athleteIds.length ? q.athleteIds : null,
    position: Number(q.position) || 0, active: q.active !== false };
}
function mapDbCheckinAnswer(r) {
  return { id: r.id, questionId: r.question_id, athleteId: r.athlete_id, coachId: r.coach_id, period: r.period,
    num: r.value_num == null ? null : Number(r.value_num), text: r.value_text, updatedAt: r.updated_at };
}
function mapJsCheckinAnswer(a) {
  return { question_id: a.questionId, athlete_id: a.athleteId, coach_id: a.coachId, period: a.period,
    value_num: a.num == null || a.num === '' ? null : Number(a.num), value_text: a.text == null || a.text === '' ? null : String(a.text).slice(0, 500) };
}
function mapDbCheckin(r) {
  return {
    id: r.id, athleteId: r.athlete_id, weekStart: r.week_start,
    sleep: r.sleep, soreness: r.soreness, stress: r.stress, feel: r.feel,
    note: r.note || '', createdAt: r.created_at
  };
}
function mapJsCheckin(c) {
  return {
    athlete_id: c.athleteId, week_start: c.weekStart,
    sleep: c.sleep, soreness: c.soreness, stress: c.stress, feel: c.feel,
    note: c.note || null
  };
}
function mapDbGoals(r) {
  return { id: r.athlete_id, athleteId: r.athlete_id,
    squat: r.squat || null, bench: r.bench || null, deadlift: r.deadlift || null, total: r.total || null,
    bodyweight: r.bodyweight || null, bwDirection: r.bw_direction || 'maintain' };
}
function mapJsGoals(g) {
  return { athlete_id: g.athleteId, squat: g.squat, bench: g.bench, deadlift: g.deadlift, total: g.total,
    bodyweight: g.bodyweight, bw_direction: g.bwDirection || 'maintain', updated_at: new Date().toISOString() };
}
function mapDbRest(r) { return { id: r.id, athleteId: r.athlete_id, date: r.date, note: r.note || '' }; }
function mapJsRest(r) { return { id: r.id, athlete_id: r.athleteId, date: r.date, note: r.note || null }; }
function mapDbInvite(r) { return { code: r.code, coachId: r.coach_id, email: r.email, used: r.used, createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now() }; }
function mapJsInvite(i) { return { code: i.code, coach_id: i.coachId, email: i.email, used: !!i.used }; }

// Rescale every exercise weight in a program by the buyer's relative strength.
// Both coach1RMs and buyer1RMs are { squat, bench, deadlift } in kg.
// Per-lift exercises scale by their own ratio; accessories scale by the average.
// Round to nearest 2.5 kg (the smallest plate jump). Returns a new weeks array.
function scaleWeeksToBuyer(weeks, coach1RMs, buyer1RMs) {
  const ratios = {};
  ['squat', 'bench', 'deadlift'].forEach(lift => {
    const c = Number(coach1RMs?.[lift]);
    const b = Number(buyer1RMs?.[lift]);
    if (c > 0 && b > 0) ratios[lift] = b / c;
  });
  const vals = Object.values(ratios);
  if (!vals.length) return weeks; // nothing to scale against
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

  const roundTo = (w) => Math.round(w / 2.5) * 2.5;
  const scaleSet = (s, ratio) => {
    if (!s || !ratio) return s;
    const w = Number(s.weight);
    if (!isFinite(w) || w <= 0) return s;
    return { ...s, weight: roundTo(w * ratio) };
  };

  return weeks.map(wk => ({
    ...wk,
    days: (wk.days || []).map(day => ({
      ...day,
      exercises: (day.exercises || []).map(ex => {
        const lift = String(ex.lift || '').toLowerCase();
        let ratio;
        if (ratios[lift]) ratio = ratios[lift];
        else if (lift === 'squat' || lift === 'bench' || lift === 'deadlift') ratio = avg;
        else ratio = avg; // accessories
        return { ...ex, sets: (ex.sets || []).map(s => scaleSet(s, ratio)) };
      })
    }))
  }));
}

// ============================================================
// DB API — async wrappers around Supabase queries
// ============================================================
const DB = {
  // ---------- AUTH ----------
  async getSession() {
    const { data } = await sb.auth.getSession();
    return data.session || null;
  },
  async getUserId() {
    const s = await this.getSession();
    return s ? s.user.id : null;
  },

  // ---------- AI ASSISTANT ----------
  // Calls the JWT-gated `ai-chat` edge function. The Gemini key lives
  // server-side; sb.functions.invoke auto-attaches the user's session, so
  // the browser never sees a secret. Returns { text } or throws.
  async aiChat(payload) {
    const { data, error } = await sb.functions.invoke('ai-chat', { body: payload });
    if (error) {
      // Surface the function's JSON body (e.g. 429 daily-limit message) if present.
      let detail = null;
      try { detail = await error.context?.json?.(); } catch (_) { /* ignore */ }
      const e = new Error((detail && (detail.message || detail.error)) || error.message || 'AI request failed');
      e.detail = detail;
      throw e;
    }
    return data;
  },

  // ---------- WEB PUSH ----------
  // Save (upsert by endpoint) the browser's PushManager subscription for the
  // signed-in user. `sub` is a raw PushSubscription.toJSON() shape.
  async savePushSubscription(userId, sub, userAgent) {
    const row = {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys && sub.keys.p256dh,
      auth: sub.keys && sub.keys.auth,
      user_agent: userAgent || null
    };
    const { error } = await sb.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
    if (error) throw error;
    return true;
  },
  async deletePushSubscription(endpoint) {
    const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw error;
    return true;
  },
  // Save a NATIVE push token (APNs on iOS / FCM on Android) for the signed-in
  // user. The device token goes in `endpoint` (still the UNIQUE key) with
  // platform ios|android; p256dh/auth are Web-Push-only so they're left null
  // (needs migration-push-platform.sql). Retries without `platform` if that
  // column isn't there yet, so this is safe to ship before the migration runs.
  async saveNativePushToken(userId, token, platform, userAgent) {
    const base = { user_id: userId, endpoint: token, user_agent: userAgent || null };
    let { error } = await sb.from('push_subscriptions').upsert(
      Object.assign({}, base, { platform: platform || 'ios', p256dh: null, auth: null }),
      { onConflict: 'endpoint' }
    );
    if (error && /platform|p256dh|auth|column/i.test(error.message || '')) {
      // Pre-migration DB: platform col missing OR p256dh/auth still NOT NULL.
      ({ error } = await sb.from('push_subscriptions').upsert(
        Object.assign({}, base, { p256dh: '', auth: '' }), { onConflict: 'endpoint' }
      ));
    }
    if (error) throw error;
    return true;
  },
  // Fire a push at another user (self for a test, or a linked coach/athlete).
  // Routes through the JWT-gated `send-push` edge function; never throws fatally.
  async sendPush({ toUserId, title, body, url, tag, category }) {
    try {
      const { data, error } = await sb.functions.invoke('send-push', {
        body: { toUserId, title, body, url, tag, category }
      });
      if (error) return { ok: false, error };
      return data || { ok: true };
    } catch (e) {
      return { ok: false, error: e };
    }
  },

  // ---------- INVITE EMAIL ----------
  // Emails a prospective athlete that their coach invited them. The code +
  // coach name are resolved server-side from the caller's own unused invite
  // (see send-invite/index.ts), so the client only passes the recipient.
  // Routes through the JWT-gated `send-invite` edge function; never throws
  // fatally — caller keeps the manual "📧 Send via email" mailto as fallback.
  async sendInvite(athleteEmail) {
    try {
      const { data, error } = await sb.functions.invoke('send-invite', {
        body: { athleteEmail }
      });
      if (error) {
        // supabase-js surfaces non-2xx as a FunctionsHttpError and hides the
        // function's JSON body in error.context (the raw Response). Dig it out
        // so the real cause ("No matching invite" / "Email send failed" / …)
        // reaches the UI + console instead of a generic failure.
        let status, reason = error.message || String(error);
        try {
          if (error.context && typeof error.context.clone === 'function') {
            status = error.context.status;
            const body = await error.context.clone().json();
            if (body && (body.error || body.detail)) {
              reason = body.error + (body.detail ? ' – ' + body.detail : '');
            }
          }
        } catch (_) { /* body wasn't JSON */ }
        console.error('sendInvite failed', status, reason, error);
        return { ok: false, status, reason, error };
      }
      if (data && data.sent) return { ok: true, id: data.id };
      console.error('sendInvite unexpected response', data);
      return { ok: false, reason: (data && data.error) || 'Unexpected response', error: data };
    } catch (e) {
      console.error('sendInvite threw', e);
      return { ok: false, reason: String((e && e.message) || e), error: e };
    }
  },

  // ---------- ACCOUNT DELETION / GDPR ERASURE ----------
  // Hard-deletes the CALLER's account + all cascading data. The uid is derived
  // server-side from the session JWT (never sent), so a caller can only ever
  // erase themselves. Routes through the JWT-gated `delete-account` edge
  // function (service role → auth.admin.deleteUser + Storage sweep). Never
  // throws fatally — the caller decides what to do with {ok:false} (we do NOT
  // sign the user out on failure; we surface the reason + the email fallback).
  async deleteAccount() {
    try {
      const { data, error } = await sb.functions.invoke('delete-account', { body: {} });
      if (error) {
        // Same FunctionsHttpError unwrap as sendInvite — the function's JSON
        // body (real cause) is hidden in error.context (the raw Response).
        let status, reason = error.message || String(error);
        try {
          if (error.context && typeof error.context.clone === 'function') {
            status = error.context.status;
            const body = await error.context.clone().json();
            if (body && (body.error || body.detail)) {
              reason = body.error + (body.detail ? ' – ' + body.detail : '');
            }
          }
        } catch (_) { /* body wasn't JSON */ }
        console.error('deleteAccount failed', status, reason, error);
        return { ok: false, status, reason, error };
      }
      if (data && data.deleted) return { ok: true, purged: data.purged };
      console.error('deleteAccount unexpected response', data);
      return { ok: false, reason: (data && data.error) || 'Unexpected response', error: data };
    } catch (e) {
      console.error('deleteAccount threw', e);
      return { ok: false, reason: String((e && e.message) || e), error: e };
    }
  },

  // ---------- SUBSCRIPTION / BILLING PORTAL (#34) ----------
  // Asks the `ls-portal` edge function for a SIGNED per-subscription Lemon
  // Squeezy customer-portal link. The uid is derived server-side from the JWT;
  // the function resolves the caller's own ls_subscription_id via service role
  // and calls the LS API (gated on LEMON_SQUEEZY_API_KEY). Returns {ok,url} on
  // success. Never throws fatally — on any {ok:false} the client falls back to
  // the no-code email-magic-link portal, so this is safe to call before the
  // secret/function are deployed (the invoke just errors → {ok:false}).
  async subscriptionPortal() {
    try {
      const { data, error } = await sb.functions.invoke('ls-portal', { body: {} });
      if (error) {
        let reason = error.message || String(error);
        try {
          if (error.context && typeof error.context.clone === 'function') {
            const body = await error.context.clone().json();
            if (body && (body.error || body.reason)) reason = body.error || body.reason;
          }
        } catch (_) { /* body wasn't JSON */ }
        return { ok: false, reason };
      }
      if (data && data.ok && data.url) return { ok: true, url: data.url };
      return { ok: false, reason: (data && (data.reason || data.error)) || 'no portal link' };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  },

  // Realtime nudge when my own profiles row changes (a plan bought on another
  // device, a billing webhook landing). Needs profiles in the supabase_realtime
  // publication (migration-payments-2026-10-22.sql); before that it never fires and
  // the app relies on refreshing at focus. RLS still decides who hears which row.
  subscribeMyProfile(uid, onChange) {
    try {
      const ch = sb.channel('profile-' + uid)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: 'id=eq.' + uid },
          () => { try { onChange(); } catch (e) { console.warn('subscribeMyProfile cb', e); } })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { console.warn('subscribeMyProfile', e); return null; }
  },

  // ---- Apple In-App Purchase (native shell only) --------------------------
  // Redeem a StoreKit 2 signed transaction: the `apple-iap` edge function
  // verifies Apple's signature chain server-side and writes subscription_tier.
  // Same FunctionsHttpError unwrap pattern as subscriptionPortal above.
  async appleIapSync(signedTransaction) {
    try {
      const { data, error } = await sb.functions.invoke('apple-iap', { body: { signedTransaction } });
      if (error) {
        let reason = error.message || String(error);
        try {
          if (error.context && typeof error.context.clone === 'function') {
            const body = await error.context.clone().json();
            if (body && (body.error || body.reason)) reason = body.error || body.reason;
          }
        } catch (_) { /* body wasn't JSON */ }
        return { ok: false, reason };
      }
      if (data && data.ok) return { ok: true, tier: data.tier, expiresAt: data.expiresAt || null };
      return { ok: false, reason: (data && (data.reason || data.error)) || 'sync failed' };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  },
  // Device reports no active Apple entitlement → self-downgrade (server checks
  // the profile really is Apple-billed before touching anything).
  async appleIapClear() {
    try {
      const { data, error } = await sb.functions.invoke('apple-iap', { body: { action: 'clear' } });
      if (error) return { ok: false };
      return data && data.ok ? { ok: true, tier: data.tier } : { ok: false };
    } catch (_) { return { ok: false }; }
  },

  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },
  async signOut() {
    await sb.auth.signOut();
  },

  // Password reset — sends an email with a recovery link that lands on
  // /reset-password.html with a recovery token in the URL hash. Supabase
  // picks the token up automatically when the page loads + the JS client runs.
  async requestPasswordReset(email) {
    // Always the website's reset page: from the iPhone app the origin is capacitor://localhost,
    // which Supabase rejects (and the email is usually opened on another device anyway).
    const base = /^https?:$/.test(location.protocol) ? location.origin : 'https://www.powalifta.com';
    const redirectTo = base + '/reset-password.html';
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },
  // Called from reset-password.html after the recovery session is established.
  async updatePassword(newPassword) {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  // ---------- 2FA / MFA (TOTP, Supabase Auth native) ----------
  // All of this runs entirely against Supabase Auth (GoTrue) with the anon
  // client — NO service role, NO edge function, NO migration, NO new secret.
  // Every wrapper is soft-failing: it returns {ok:false, reason} instead of
  // throwing, so the UI can degrade gracefully if the project has TOTP MFA
  // disabled in the dashboard (Authentication → Multi-Factor). `unsupported`
  // is surfaced so callers can hide the feature rather than show an error.
  _mfaUnavailable(reason) {
    const r = String(reason || '').toLowerCase();
    return r.includes('not enabled') || r.includes('disabled') ||
           r.includes('unsupported') || r.includes('mfa_') || r.includes('not available');
  },
  // List this user's TOTP factors. `verified` = the ones actually protecting
  // the account (an abandoned enroll leaves an `unverified` factor behind).
  async mfaListFactors() {
    try {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) return { ok: false, reason: error.message, unsupported: this._mfaUnavailable(error.message), factors: [], verified: [] };
      const totp = (data && data.totp) || [];
      return { ok: true, factors: totp, verified: totp.filter(f => f.status === 'verified') };
    } catch (e) { const m = String((e && e.message) || e); return { ok: false, reason: m, unsupported: this._mfaUnavailable(m), factors: [], verified: [] }; }
  },
  // Begin TOTP enrollment. Prunes abandoned unverified factors first so a
  // repeat enroll never collides. Returns the QR (SVG data URL), the manual
  // secret, and the otpauth URI + the new factor id to verify against.
  async mfaEnrollTotp(friendlyName) {
    try {
      try {
        const list = await sb.auth.mfa.listFactors();
        const all = (list && list.data && (list.data.all || list.data.totp)) || [];
        for (const f of all) { if (f && f.status === 'unverified') { try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch (_) {} } }
      } catch (_) { /* pruning is best-effort */ }
      const opts = { factorType: 'totp' };
      if (friendlyName) opts.friendlyName = friendlyName;
      const { data, error } = await sb.auth.mfa.enroll(opts);
      if (error) return { ok: false, reason: error.message, unsupported: this._mfaUnavailable(error.message) };
      const totp = (data && data.totp) || {};
      return { ok: true, factorId: data.id, qr: totp.qr_code || '', secret: totp.secret || '', uri: totp.uri || '' };
    } catch (e) { const m = String((e && e.message) || e); return { ok: false, reason: m, unsupported: this._mfaUnavailable(m) }; }
  },
  // Confirm enrollment: challenge the new factor then verify the 6-digit code.
  // On success the current session is auto-elevated to AAL2 by Supabase.
  async mfaVerifyEnroll(factorId, code) {
    try {
      const ch = await sb.auth.mfa.challenge({ factorId });
      if (ch.error) return { ok: false, reason: ch.error.message };
      const { error } = await sb.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: String(code || '').trim() });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
  },
  // Turn 2FA off by removing a factor.
  async mfaUnenroll(factorId) {
    try {
      const { error } = await sb.auth.mfa.unenroll({ factorId });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
  },
  // Current vs required assurance level. After a password login on an account
  // WITH 2FA, currentLevel='aal1' + nextLevel='aal2' → a challenge is owed.
  async mfaAssurance() {
    try {
      const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) return { ok: false, reason: error.message };
      return { ok: true, currentLevel: data.currentLevel, nextLevel: data.nextLevel };
    } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
  },
  // Login-time step-up: verify a 6-digit code against the first VERIFIED TOTP
  // factor to lift the fresh session from AAL1 → AAL2.
  async mfaChallengeVerify(code) {
    try {
      const list = await sb.auth.mfa.listFactors();
      if (list.error) return { ok: false, reason: list.error.message };
      const factor = ((list.data && list.data.totp) || []).find(f => f.status === 'verified');
      if (!factor) return { ok: false, reason: 'no verified authenticator on this account' };
      const ch = await sb.auth.mfa.challenge({ factorId: factor.id });
      if (ch.error) return { ok: false, reason: ch.error.message };
      const { error } = await sb.auth.mfa.verify({ factorId: factor.id, challengeId: ch.data.id, code: String(code || '').trim() });
      if (error) return { ok: false, reason: error.message };
      return { ok: true };
    } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
  },

  // `consent` ({ age_16_plus, terms_accepted_at }) rides in the auth user's metadata: the record
  // that they confirmed they're 16+ and accepted the Terms at sign-up (privacy.html "Children").
  async signUpCoach(name, email, password, bio, consent) {
    // Profile row is created by the on_auth_user_created trigger using this metadata.
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name, user_type: 'coach', bio: bio || '', ...(consent || {}) } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Signup did not return a user.');
    return data.user;
  },
  async signUpAthlete(name, email, password, code, consent) {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name, user_type: 'athlete', ...(consent || {}) } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Signup did not return a user.');
    if (code) {
      // claim_invite needs the user to be authenticated. Only works if email
      // confirmation is OFF (immediate session). If ON, claim happens after first login.
      try { await sb.rpc('claim_invite', { invite_code: code }); }
      catch (e) { console.warn('Could not claim code now (will retry after login):', e.message); }
    }
    return data.user;
  },
  async claimInviteCode(code) {
    const { data, error } = await sb.rpc('claim_invite', { invite_code: code });
    if (error) throw error;
    // The function returns NULL for a wrong, used or self code (a raise would undo its rate limit).
    if (!data) throw new Error('Invalid or already-used code');
    return data;
  },

  // ---------- PROFILES ----------
  async getProfile(userId) {
    const { data, error } = await sb.from('profiles').select('*').in('id', [userId]);
    if (error) throw error;
    if (!data || !data.length) throw new Error('Profile not found for ' + userId);
    return data[0];
  },
  async updateProfile(userId, patch) {
    // Before a column's migration runs (instagram, tiktok) PostgREST names the
    // missing column: drop just that one, save the rest, and say so.
    const rest = Object.assign({}, patch);
    let { error } = await sb.from('profiles').update(rest).in('id', [userId]);
    let dropped = null;
    for (let i = 0; error && i < 2; i++) {
      const col = _missingCol(error, ['instagram', 'tiktok'].filter(c => c in rest));
      if (!col) break;
      delete rest[col]; dropped = col;
      ({ error } = await sb.from('profiles').update(rest).in('id', [userId]));
    }
    if (!error && dropped) {
      const e = new Error('Saved. ' + (dropped === 'tiktok' ? 'TikTok' : 'Instagram') + ' links switch on with the next update'); e.partial = true; throw e;
    }
    if (error) throw error;
  },
  async listCoaches() {
    // Public directory: safe columns only (migration-profiles-privacy.sql). Before
    // that migration runs the function doesn't exist and we fall back to the old read.
    const rpc = await sb.rpc('list_public_coaches');
    if (!rpc.error) return (rpc.data || []).map(mapDbProfileToCoach);
    const { data, error } = await sb.from('profiles').select('*').eq('user_type', 'coach');
    if (error) { console.warn('listCoaches', error); return []; }
    // Filter client-side (not .eq) so this works whether or not the
    // directory_hidden column exists yet — rows without it are visible.
    return (data || []).filter(r => !r.directory_hidden).map(mapDbProfileToCoach);
  },

  // ---------- COACH REQUESTS (coachless athlete → coach "request to join") ----------
  // Athlete files/refiles a request. Upsert on the (athlete_id, coach_id) unique
  // pair so re-requesting after a decline flips it back to 'pending' instead of
  // erroring. athlete_name is denormalised so the coach (who can't read an
  // unlinked athlete's profile) can show who's asking. See migration-coach-requests.sql.
  async createCoachRequest(athleteId, athleteName, coachId, note) {
    const row = {
      athlete_id: athleteId, coach_id: coachId,
      athlete_name: athleteName || 'An athlete', note: note || '',
      status: 'pending', updated_at: new Date().toISOString()
    };
    const { error } = await sb.from('coach_requests').upsert(row, { onConflict: 'athlete_id,coach_id' });
    if (error) throw error;
    return true;
  },
  // Athlete: my outstanding requests (drives the "Requested" button state).
  async listMyCoachRequests(athleteId) {
    const { data, error } = await sb.from('coach_requests').select('*').in('athlete_id', [athleteId]);
    if (error) { console.warn('listMyCoachRequests', error); return []; }
    return (data || []).map(mapDbCoachRequest);
  },
  // Coach: pending requests addressed to me (Roster-tab panel).
  async listCoachRequestsForCoach(coachId) {
    const { data, error } = await sb.from('coach_requests')
      .select('*').in('coach_id', [coachId]).eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) { console.warn('listCoachRequestsForCoach', error); return []; }
    return (data || []).map(mapDbCoachRequest);
  },
  // Coach accepts → SECURITY DEFINER links the athlete + marks accepted. Returns athlete uuid.
  async acceptCoachRequest(requestId) {
    const { data, error } = await sb.rpc('accept_coach_request', { request_id: requestId });
    if (error) throw error;
    return data;
  },
  // Coach declines → ordinary status UPDATE (allowed by cr_coach_update).
  async declineCoachRequest(requestId) {
    const { error } = await sb.from('coach_requests')
      .update({ status: 'declined', updated_at: new Date().toISOString() }).in('id', [requestId]);
    if (error) throw error;
    return true;
  },

  // Upload a profile picture for the current user. File lives at avatars/{user_id}/avatar.{ext}
  // and is publicly readable. Returns the public URL.
  async uploadAvatar(file, userId) {
    if (!file) throw new Error('No file given');
    if (!userId) throw new Error('Missing user id');
    if (file.size > 3 * 1024 * 1024) throw new Error('Image too large (max 3 MB)');
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = userId + '/avatar.' + ext;
    const { error: upErr } = await sb.storage.from('avatars').upload(path, file, {
      upsert: true,
      cacheControl: '3600',
      contentType: file.type || undefined
    });
    if (upErr) throw upErr;
    const { data } = sb.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so the new image shows immediately
    const url = data.publicUrl + '?t=' + Date.now();
    // Persist URL on the profile
    await this.updateProfile(userId, { avatar_url: url });
    return url;
  },

  // ---------- ADMIN ----------
  async listAllProfiles() {
    const { data, error } = await sb.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('admin listAllProfiles', error); return []; }
    return data || [];
  },
  async listAllInvites() {
    const { data, error } = await sb.from('invites').select('*').order('created_at', { ascending: false });
    if (error) { console.warn('admin listAllInvites', error); return []; }
    return (data || []).map(mapDbInvite);
  },
  async listAllPrograms() {
    const { data, error } = await sb.from('programs').select('*').order('updated_at', { ascending: false });
    if (error) { console.warn('admin listAllPrograms', error); return []; }
    return (data || []).map(mapDbProgram);
  },
  async listAllLogs() {
    const { data, error } = await sb.from('workout_logs').select('*').order('date', { ascending: false }).limit(500);
    if (error) { console.warn('admin listAllLogs', error); return []; }
    return (data || []).map(mapDbLog);
  },
  async listAllBw() {
    const { data, error } = await sb.from('bodyweight').select('*').order('date', { ascending: false }).limit(500);
    if (error) { console.warn('admin listAllBw', error); return []; }
    return (data || []).map(mapDbBw);
  },
  async listAllGoals() {
    const { data, error } = await sb.from('goals').select('*');
    if (error) { console.warn('admin listAllGoals', error); return []; }
    return (data || []).map(mapDbGoals);
  },
  // Forwarded client-side errors (send-client-error edge fn → client_errors).
  // Admin-only read (migration-client-errors-admin-read.sql). Returns [] when
  // the table/policy/endpoint isn't live yet, so the Errors tab stays graceful.
  async listClientErrors(limit) {
    const { data, error } = await sb.from('client_errors')
      .select('*').order('received_at', { ascending: false }).limit(limit || 500);
    if (error) { console.warn('admin listClientErrors', error); return []; }
    return (data || []).map(mapDbClientError);
  },
  // Club + post reports for the admin Reports tab (App Store 1.2: act on
  // reports). Admin read/delete policies live in migration-clubs-social.sql.
  // Returns { reports, posts: {id: post}, clubs: {id: club} }; empty pre-migration.
  async listClubReportsAdmin(limit) {
    const { data, error } = await sb.from('club_reports').select('*')
      .order('created_at', { ascending: false }).limit(limit || 200);
    if (error) { console.warn('admin listClubReports', error); return { reports: [], posts: {}, clubs: {} }; }
    const reports = (data || []).map(r => ({ id: r.id, clubId: r.club_id, postId: r.post_id || null,
      reportedUserId: r.reported_user_id || null, reporterId: r.reporter_id || null, reason: r.reason || '', createdAt: r.created_at,
      clubName: r.club_name || '', postSnapshot: r.post_snapshot ? mapDbClubPost(r.post_snapshot) : null }));
    const postIds = [...new Set(reports.map(r => r.postId).filter(Boolean))];
    const clubIds = [...new Set(reports.map(r => r.clubId).filter(Boolean))];
    const [pRes, cRes] = await Promise.all([
      postIds.length ? sb.from('club_posts').select('*').in('id', postIds) : Promise.resolve({ data: [] }),
      clubIds.length ? sb.from('clubs').select('*').in('id', clubIds) : Promise.resolve({ data: [] })
    ]);
    const posts = {}; ((pRes && pRes.data) || []).forEach(p => { posts[p.id] = mapDbClubPost(p); });
    const clubs = {}; ((cRes && cRes.data) || []).forEach(c => { clubs[c.id] = mapDbClub(c); });
    return { reports, posts, clubs };
  },
  async dismissClubReport(reportId) {
    const { error } = await sb.from('club_reports').delete().in('id', [reportId]);
    if (error) throw _clubErr(error);
  },
  async adminDeleteClubPost(postId) {
    const { data, error } = await sb.from('club_posts').delete().in('id', [postId]).select('id');
    if (error) throw _clubErr(error);
    if (!data || !data.length) throw new Error('Couldn\'t remove that post');
  },
  // ---------- ADMIN · CLUBS (migration-clubs-admin.sql) ----------
  // The admin Clubs tab: every club (public AND private), its members, pending
  // requests, bans and recent posts, plus edit / remove / allow back / delete.
  // Admin-only RLS lives in migration-clubs-admin.sql (all keyed on is_admin()).
  // Reads fail soft ([] / nulls) so the tab shows its setup state before the
  // migrations land. Writes .select() what they touched and treat 0 rows as a
  // failure: an RLS-filtered write returns no error, it just changes nothing.
  // Biggest first. Each club also carries ownerName (the owner's club display
  // name) as a fallback for when the owner's profile isn't in the admin cache.
  async listAllClubsAdmin() {
    const [cRes, oRes] = await Promise.all([
      sb.from('clubs').select('*')
        .order('member_count', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
      sb.from('club_members').select('club_id, display_name').eq('role', 'owner').limit(1000)
    ]).catch(e => [{ error: e }, { error: e }]);
    if (!cRes || cRes.error) { console.warn('admin listAllClubs', cRes && cRes.error); return []; }
    const owners = {};
    ((oRes && !oRes.error && oRes.data) || []).forEach(m => { owners[m.club_id] = m.display_name || ''; });
    return (cRes.data || []).map(r => Object.assign(mapDbClub(r), { ownerName: owners[r.id] || '' }));
  },
  async listClubMembersAdmin(clubId) {
    const { data, error } = await sb.from('club_members').select('*').in('club_id', [clubId])
      .order('joined_at', { ascending: true });
    if (error) { console.warn('admin listClubMembers', error); return []; }
    return (data || []).map(mapDbClubMember);
  },
  // Newest first.
  async listClubPostsAdmin(clubId, limit = 50) {
    const { data, error } = await sb.from('club_posts').select('*').in('club_id', [clubId])
      .order('created_at', { ascending: false }).limit(limit || 50);
    if (error) { console.warn('admin listClubPosts', error); return []; }
    return (data || []).map(mapDbClubPost);
  },
  // Pending only, oldest first (declined rows only exist to hold the 7-day cooldown).
  async listClubRequestsAdmin(clubId) {
    const { data, error } = await sb.from('club_join_requests').select('*').in('club_id', [clubId])
      .eq('status', 'pending').order('created_at', { ascending: true });
    if (error) { console.warn('admin listClubRequests', error); return []; }
    return (data || []).map(mapDbClubRequest);
  },
  async listClubBansAdmin(clubId) {
    const { data, error } = await sb.from('club_bans').select('*').in('club_id', [clubId])
      .order('created_at', { ascending: false });
    if (error) { console.warn('admin listClubBans', error); return []; }
    return (data || []).map(r => ({ clubId: r.club_id, userId: r.user_id, displayName: r.display_name || 'Lifter',
      bannedBy: r.banned_by || null, createdAt: r.created_at }));
  },
  // Header counts for the Clubs tab (HEAD requests, no rows shipped). null = couldn't count.
  async clubActivityCountsAdmin(sinceIso) {
    const n = async (q) => { try { const { count, error } = await q; return error || count == null ? null : count; } catch (e) { return null; } };
    const [postsSince, openReports] = await Promise.all([
      n(sb.from('club_posts').select('id', { count: 'exact', head: true }).gte('created_at', sinceIso)),
      n(sb.from('club_reports').select('id', { count: 'exact', head: true }))
    ]);
    return { postsSince, openReports };
  },
  // Name / city / description / visibility only. clubs_guard freezes code /
  // owner / count regardless, and rotates the code on a public → private switch.
  // Lengths mirror the clubs CHECK constraints so the admin gets a plain message.
  async adminUpdateClub(clubId, patch) {
    const p = patch || {};
    const len = (s) => Array.from(s).length;   // code points, like Postgres char_length
    const row = {};
    if (p.name != null) {
      const v = String(p.name).trim();
      if (len(v) < 2 || len(v) > 60) throw new Error('The club name needs 2 to 60 characters');
      row.name = v;
    }
    if (p.city != null) {
      const v = String(p.city).trim();
      if (len(v) > 60) throw new Error('City can be 60 characters at most');
      row.city = v || null;
    }
    if (p.description != null) {
      const v = String(p.description).trim();
      if (len(v) > 280) throw new Error('About can be 280 characters at most');
      row.description = v || null;
    }
    if (p.visibility != null) {
      if (p.visibility !== 'public' && p.visibility !== 'private') throw new Error('Visibility must be public or private');
      row.visibility = p.visibility;
    }
    if (!Object.keys(row).length) throw new Error('Nothing to save');
    const { data, error } = await sb.from('clubs').update(row).in('id', [clubId]).select('*');
    if (error) throw _clubErr(error);
    if (!data || !data.length) throw new Error('Nothing was saved. The club may be gone, or sql/migration-clubs-admin.sql hasn\'t been run');
    return mapDbClub(data[0]);
  },
  // Never the owner (club_members_owner_stays refuses; delete the club instead).
  // The ban-on-remove trigger bans them from this club, banned_by = the admin.
  async adminRemoveClubMember(clubId, userId) {
    const { data, error } = await sb.from('club_members').delete()
      .in('club_id', [clubId]).in('user_id', [userId]).select('user_id');
    if (error) throw _clubErr(error);
    if (!data || !data.length) throw new Error('Nobody was removed. They may have left already, or sql/migration-clubs-admin.sql hasn\'t been run');
  },
  async adminUnbanClubMember(clubId, userId) {
    const { data, error } = await sb.from('club_bans').delete()
      .in('club_id', [clubId]).in('user_id', [userId]).select('user_id');
    if (error) throw _clubErr(error);
    if (!data || !data.length) throw new Error('No ban was lifted. It may be gone already, or sql/migration-clubs-admin.sql hasn\'t been run');
  },
  // Cascades members, posts, requests and bans. Reports stay (club_id → NULL, club_name kept).
  async adminDeleteClub(clubId) {
    const { data, error } = await sb.from('clubs').delete().in('id', [clubId]).select('id');
    if (error) throw _clubErr(error);
    if (!data || !data.length) throw new Error('Nothing was deleted. The club may be gone already, or sql/migration-clubs-admin.sql hasn\'t been run');
  },
  async listAthletesForCoach(coachId) {
    // RLS allows coach to read profiles where coach_id = auth.uid() — combined
    // with user_type filter, this returns only athletes coached by current user.
    // Filter on coach_id too: an admin who also coaches can read every profile,
    // and must still only load their own roster.
    let q = sb.from('profiles').select('*').eq('user_type', 'athlete');
    if (coachId) q = q.eq('coach_id', coachId);
    const { data, error } = await q;
    if (error) { console.warn('listAthletesForCoach', error); return []; }
    return (data || []).map(mapDbProfileToAthlete);
  },

  // ---------- INVITES ----------
  async listInvites(coachId) {
    // RLS already filters to current coach's invites — no need for explicit eq
    const { data, error } = await sb.from('invites').select('*');
    if (error) { console.warn('listInvites', error); return []; }
    return (data || []).map(mapDbInvite);
  },
  async addInvite(invite) {
    const { error } = await sb.from('invites').insert(mapJsInvite(invite));
    if (error) throw error;
  },
  async deleteInvite(code) {
    const { error } = await sb.from('invites').delete().eq('code', code);
    if (error) throw error;
  },

  // ---------- REFERRALS ----------
  // RLS returns only rows where the current user is the referrer (or referred).
  async listMyReferrals(userId) {
    const { data, error } = await sb.from('referrals')
      .select('*').in('referrer_id', [userId])
      .order('created_at', { ascending: false });
    if (error) { console.warn('listMyReferrals', error); return []; }
    return (data || []).map(mapDbReferral);
  },
  // Stamp the code that referred the current user onto their own profile.
  // A SECURITY DEFINER trigger resolves code → referrer and writes the
  // referrals row; the column is write-once, so calling this again is a no-op.
  // Self-referrals and unknown codes are ignored server-side.
  async applyReferral(userId, code) {
    if (!userId || !code) return;
    const { error } = await sb.from('profiles')
      .update({ referred_by_code: String(code).trim().toUpperCase() })
      .in('id', [userId]);
    if (error) throw error;
  },
  // Reward claims the current user has already made (RLS: own rows only).
  async listMyRewardClaims(userId) {
    const { data, error } = await sb.from('referral_reward_claims')
      .select('*').in('user_id', [userId])
      .order('tier_at', { ascending: true });
    if (error) { console.warn('listMyRewardClaims', error); return []; }
    return (data || []).map(mapDbRewardClaim);
  },
  // Claim a referral tier reward. A SECURITY DEFINER rpc counts the caller's OWN
  // referrals and refuses any tier they haven't earned (clients have no direct
  // INSERT policy). Idempotent server-side — re-claiming returns the same row.
  async claimReferralReward(tierAt) {
    const { data, error } = await sb.rpc('claim_referral_reward', { p_tier_at: tierAt });
    if (error) throw error;
    return Array.isArray(data) ? (data[0] ? mapDbRewardClaim(data[0]) : null)
                               : (data ? mapDbRewardClaim(data) : null);
  },

  // ---------- EMAIL PREFERENCES ----------
  // One row per user (RLS: own row only). Backs the weekly-digest opt-out (#19)
  // and product-email/unsubscribe prefs (#36). Absence of a row = opted in, so
  // a read miss returns sensible defaults rather than erroring.
  async getEmailPrefs(userId) {
    if (!userId) return mapDbEmailPrefs(null);
    const { data, error } = await sb.from('email_preferences')
      .select('*').in('user_id', [userId]).limit(1);
    if (error) { console.warn('getEmailPrefs', error); return mapDbEmailPrefs(null); }
    return mapDbEmailPrefs((data && data[0]) || null);
  },
  // Toggle the caller's own flags. UPSERT so the first toggle creates the row
  // (WITH CHECK user_id = auth.uid() on both insert + update). Never touches
  // unsub_token (server default / stable). `patch` keys: weeklyDigest, productEmails.
  // `patch` keys: weeklyDigest, productEmails (email) + pushMessages,
  // pushFormChecks, pushProgram (#30). If the push_* columns don't exist yet
  // (migration-notification-prefs.sql not run), the upsert fails with a
  // column-missing error → we strip the push keys and retry with just the email
  // columns, so email prefs keep working before the notif migration lands
  // (same forward-compat pattern as the marketplace-category writes).
  async updateEmailPrefs(userId, patch) {
    if (!userId) throw new Error('No user');
    const full = { user_id: userId };
    if (typeof patch.weeklyDigest === 'boolean')   full.weekly_digest = patch.weeklyDigest;
    if (typeof patch.productEmails === 'boolean')  full.product_emails = patch.productEmails;
    if (typeof patch.pushMessages === 'boolean')   full.push_messages = patch.pushMessages;
    if (typeof patch.pushFormChecks === 'boolean') full.push_form_checks = patch.pushFormChecks;
    if (typeof patch.pushProgram === 'boolean')    full.push_program = patch.pushProgram;
    let res = await sb.from('email_preferences')
      .upsert(full, { onConflict: 'user_id' }).select('*').limit(1);
    if (res.error && /push_(messages|form_checks|program)/.test(res.error.message || '')) {
      const { push_messages, push_form_checks, push_program, ...safe } = full;
      res = await sb.from('email_preferences')
        .upsert(safe, { onConflict: 'user_id' }).select('*').limit(1);
    }
    if (res.error) throw res.error;
    return mapDbEmailPrefs((res.data && res.data[0]) || full);
  },

  // One-click email unsubscribe by token (#36). UNAUTHENTICATED — powers
  // unsubscribe.html, which the footer link in every email points at. The
  // `unsub_token` is the capability; the `unsubscribe` edge function (Verify
  // JWT OFF) resolves it server-side via the service role. Pass `set` to
  // mutate ({ weeklyDigest?, productEmails? }) or omit it to just read state.
  // Always resolves to { ok, weeklyDigest?, productEmails?, reason? } — never
  // throws, so the landing page can render a friendly state on any failure.
  async unsubscribeEmail(token, set) {
    try {
      const body = { token: String(token || '') };
      if (set && typeof set === 'object') body.set = set;
      const { data, error } = await sb.functions.invoke('unsubscribe', { body });
      if (error) {
        let reason = error.message || String(error);
        try {
          if (error.context && typeof error.context.clone === 'function') {
            const b = await error.context.clone().json();
            if (b && (b.reason || b.error)) reason = b.reason || b.error;
          }
        } catch (_) {}
        return { ok: false, reason };
      }
      if (data && data.ok) {
        return { ok: true, weeklyDigest: data.weeklyDigest !== false, productEmails: data.productEmails !== false };
      }
      return { ok: false, reason: (data && (data.reason || data.error)) || 'unavailable' };
    } catch (e) {
      return { ok: false, reason: String((e && e.message) || e) };
    }
  },

  // ---------- LEADERBOARD ----------
  // Public, opt-in DOTS board. Every row exists only because its owner published
  // it (publishing IS the opt-in; deleting IS the opt-out) and every column is one
  // the owner chose to share — so anon + authenticated read all rows. profiles is
  // never exposed; this denormalised projection is read instead (same pattern as
  // program_reviews). Ordered by DOTS desc (indexed).
  async listLeaderboard(opts = {}) {
    let q = sb.from('leaderboard_entries').select('*')
      .order('dots', { ascending: false });
    if (opts.sex === 'male' || opts.sex === 'female') q = q.eq('sex', opts.sex);
    if (opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) { console.warn('listLeaderboard', error); return []; }
    return (data || []).map(mapDbLeaderboardEntry);
  },
  // The current user's own row, or null if they haven't opted in.
  async myLeaderboardEntry(userId) {
    if (!userId) return null;
    const { data, error } = await sb.from('leaderboard_entries')
      .select('*').in('user_id', [userId]).limit(1);
    if (error) { console.warn('myLeaderboardEntry', error); return null; }
    return data && data[0] ? mapDbLeaderboardEntry(data[0]) : null;
  },
  // Publish / refresh the caller's row. UPDATE-then-INSERT (RLS-safe upsert: the
  // UPDATE path succeeds for an existing row where a plain INSERT-with-CHECK can
  // trip RLS). user_id must equal auth.uid() per the owner-only write policies.
  async upsertLeaderboardEntry(entry) {
    const row = mapJsLeaderboardEntry(entry);
    const { data: upd, error: uErr } = await sb.from('leaderboard_entries')
      .update(row).in('user_id', [entry.userId]).select();
    if (uErr) throw uErr;
    if (upd && upd.length) return mapDbLeaderboardEntry(upd[0]);
    const { data: ins, error: iErr } = await sb.from('leaderboard_entries')
      .insert(row).select();
    if (iErr) throw iErr;
    return ins && ins[0] ? mapDbLeaderboardEntry(ins[0]) : null;
  },
  // Leave the board. RLS lets a caller delete only their own row.
  async removeLeaderboardEntry(userId) {
    const { error } = await sb.from('leaderboard_entries')
      .delete().in('user_id', [userId]);
    if (error) throw error;
  },

  // ---------- CLUBS (migration-clubs.sql) ----------
  // Reads fail soft (null / []) so the Club tab falls back to its join screen
  // before the migration lands; writes throw a readable Error (see _clubErr).
  // UUID columns are filtered with .in(col, [id]), same as the leaderboard.
  async getMyClub(userId) {
    if (!userId) return null;
    const { data: mine, error } = await sb.from('club_members').select('club_id, role').in('user_id', [userId]).limit(1);
    if (error || !mine || !mine[0]) return null;
    const clubId = mine[0].club_id;
    const [cRes, mRes] = await Promise.all([
      sb.from('clubs').select('*').in('id', [clubId]).limit(1),
      sb.from('club_members').select('*').in('club_id', [clubId])
    ]);
    if (cRes.error || !cRes.data || !cRes.data[0]) return null;
    return { club: mapDbClub(cRes.data[0]), role: mine[0].role, members: (mRes.data || []).map(mapDbClubMember) };
  },
  async listPublicClubs(opts = {}) {
    let q = sb.from('clubs').select('*').eq('visibility', 'public')
      .order('member_count', { ascending: false }).limit(opts.limit || 30);
    // .or() takes a filter STRING — strip the characters that would break out of it.
    const s = String(opts.search || '').replace(/[%,()*\\]/g, ' ').trim();
    if (s) q = q.or('name.ilike.%' + s + '%,city.ilike.%' + s + '%');
    const { data, error } = await q;
    if (error) { console.warn('listPublicClubs', error); return []; }
    return (data || []).map(mapDbClub);
  },
  async createClub(fields) {
    const { data, error } = await sb.rpc('create_club', {
      p_name: fields.name, p_city: fields.city || null, p_description: fields.description || null,
      p_visibility: fields.visibility === 'private' ? 'private' : 'public', p_display_name: fields.displayName || null
    });
    if (error) throw _clubErr(error);
    return mapDbClub(Array.isArray(data) ? data[0] : data);
  },
  async joinClub(code, displayName) {
    const { data, error } = await sb.rpc('join_club', { p_code: String(code || '').trim().toUpperCase(), p_display_name: displayName || null });
    if (error) throw _clubErr(error);
    // A wrong code comes back empty (NULL), not as an error (see migration-clubs-social-2).
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.id) throw new Error('No club with that code');
    return mapDbClub(row);
  },
  async leaveClub(userId) {
    const { error } = await sb.from('club_members').delete().in('user_id', [userId]);
    if (error) throw _clubErr(error);
  },
  // The caller's own shared stats row (RLS: self-update only; club/role are trigger-guarded).
  async updateMyClubStats(userId, stats) {
    const row = mapJsClubStats(stats);
    let { error } = await sb.from('club_members').update(row).in('user_id', [userId]);
    // Columns that arrive with later migrations: drop whichever one isn't there yet.
    const optional = ['instagram', 'tiktok', 'week_points', 'week_prs', 'week_hard_sets', 'improve_pct', 'season_id', 'season_points', 'prev_season_points'];
    for (let i = 0; error && i < optional.length; i++) {
      const col = _missingCol(error, optional.filter(c => c in row));
      if (!col) break;
      delete row[col];
      ({ error } = await sb.from('club_members').update(row).in('user_id', [userId]));
    }
    if (error) { console.warn('updateMyClubStats', error); return false; }
    return true;
  },
  async updateClub(clubId, patch) {
    const row = {};
    if (patch.name != null) row.name = String(patch.name).trim();
    if (patch.city != null) row.city = String(patch.city).trim() || null;
    if (patch.description != null) row.description = String(patch.description).trim() || null;
    if (patch.visibility) row.visibility = patch.visibility === 'private' ? 'private' : 'public';
    const { data, error } = await sb.from('clubs').update(row).in('id', [clubId]).select();
    if (error) throw _clubErr(error);
    return data && data[0] ? mapDbClub(data[0]) : null;
  },
  async removeClubMember(clubId, userId) {
    const { error } = await sb.from('club_members').delete().in('club_id', [clubId]).in('user_id', [userId]);
    if (error) throw _clubErr(error);
  },
  async deleteClub(clubId) {
    const { error } = await sb.from('clubs').delete().in('id', [clubId]);
    if (error) throw _clubErr(error);
  },
  async reportClub(clubId, reporterId, reason) {
    const { error } = await sb.from('club_reports').insert({ club_id: clubId, reporter_id: reporterId, reason: String(reason || '').slice(0, 500) });
    if (error) throw _clubErr(error);
  },

  // ---------- CLUBS v2 (migration-clubs-social.sql) ----------
  // Directory: public AND private clubs (cards only, never codes or members),
  // with the caller's status. Before the migration lands it falls back to the
  // v1 public-only read, so the join screen still lists something.
  async searchClubs(query, limit) {
    const { data, error } = await sb.rpc('search_clubs', { p_query: query || null, p_limit: limit || 30 });
    if (error) {
      const list = await this.listPublicClubs({ search: query, limit: limit || 30 });
      return list.map(c => Object.assign({}, c, { myStatus: null, legacy: true }));
    }
    return (data || []).map(r => ({
      id: r.id, name: r.name, city: r.city || '', description: r.description || '',
      visibility: r.visibility || 'public', memberCount: r.member_count || 0, myStatus: r.my_status || null
    }));
  },
  // 'joined' (public) | 'requested' (private) | 'member' (already in it).
  async joinOrRequestClub(clubId, displayName, message) {
    const { data, error } = await sb.rpc('join_or_request_club', { p_club: clubId, p_display_name: displayName || null, p_message: message || null });
    if (error) throw _clubErr(error, 'Finding clubs needs one more update. Use a club code for now.');
    return Array.isArray(data) ? data[0] : data;
  },
  async cancelClubRequest(clubId, userId) {
    const { error } = await sb.from('club_join_requests').delete().in('club_id', [clubId]).in('user_id', [userId]);
    if (error) throw _clubErr(error);
  },
  // Owner/admin: who's waiting. [] before the migration (fails soft).
  async listClubRequests(clubId) {
    const { data, error } = await sb.from('club_join_requests').select('*').in('club_id', [clubId])
      .eq('status', 'pending').order('created_at', { ascending: true });
    if (error) return [];
    return (data || []).map(mapDbClubRequest);
  },
  // 'accepted' | 'declined' | 'stale' (they joined another club meanwhile).
  async respondClubRequest(requestId, accept) {
    const { data, error } = await sb.rpc('respond_club_request', { p_request: requestId, p_accept: !!accept });
    if (error) throw _clubErr(error);
    return Array.isArray(data) ? data[0] : data;
  },
  // Newest first. null = the feed isn't switched on yet (pre-migration).
  async listClubPosts(clubId, opts = {}) {
    let q = sb.from('club_posts').select('*').in('club_id', [clubId])
      .order('created_at', { ascending: false }).limit(opts.limit || 40);
    if (opts.before) q = q.lt('created_at', opts.before);
    const { data, error } = await q;
    if (error) { console.warn('listClubPosts', error); return null; }
    return (data || []).map(mapDbClubPost);
  },
  async createClubPost(post) {
    const { data, error } = await sb.from('club_posts').insert(mapJsClubPost(post)).select('*');
    if (error) throw _clubErr(error, 'The club feed isn\'t switched on yet.');
    return data && data[0] ? mapDbClubPost(data[0]) : null;
  },
  // .select() so a delete RLS quietly skipped (0 rows) reads as a failure, not "deleted".
  async deleteClubPost(postId) {
    const { data, error } = await sb.from('club_posts').delete().in('id', [postId]).select('id');
    if (error) throw _clubErr(error);
    if (!data || !data.length) throw new Error('Couldn\'t delete that post');
  },
  // Owner/admin: a fresh join code (the old one stops working).
  async rotateClubCode(clubId) {
    const { data, error } = await sb.rpc('rotate_club_code', { p_club: clubId });
    if (error) throw _clubErr(error, 'This needs the latest club update.');
    return Array.isArray(data) ? data[0] : data;
  },
  // Owner/admin: lifters removed from the club (they can't rejoin until let back).
  async listClubBans(clubId) {
    const { data, error } = await sb.from('club_bans').select('*').in('club_id', [clubId]).order('created_at', { ascending: false });
    if (error) return [];
    return (data || []).map(r => ({ clubId: r.club_id, userId: r.user_id, displayName: r.display_name || 'Lifter', createdAt: r.created_at }));
  },
  async unbanClubMember(clubId, userId) {
    const { data, error } = await sb.from('club_bans').delete().in('club_id', [clubId]).in('user_id', [userId]).select('user_id');
    if (error) throw _clubErr(error);
    if (!data || !data.length) throw new Error('Couldn\'t update that');
  },
  async reportClubPost(post, reporterId, reason) {
    const { error } = await sb.from('club_reports').insert({
      club_id: post.clubId, post_id: post.id, reported_user_id: post.userId,
      reporter_id: reporterId, reason: String(reason || '').slice(0, 500)
    });
    if (error) throw _clubErr(error);
  },
  // Block: their posts drop out of your feed (enforced by the club_posts RLS).
  // Live feed: new posts in this club as they land (club_posts is on the
  // supabase_realtime publication; RLS still decides who receives what, so
  // non-members and blockers get nothing). Returns an unsubscribe fn or null.
  subscribeClubPosts(clubId, onInsert) {
    if (!clubId || typeof onInsert !== 'function') return null;
    try {
      const ch = sb.channel('clubposts:' + clubId + ':' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'club_posts', filter: 'club_id=eq.' + clubId },
          payload => { try { onInsert(mapDbClubPost(payload.new)); } catch (e) { console.warn('subscribeClubPosts cb', e); } })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { console.warn('subscribeClubPosts', e); return null; }
  },
  async blockLifter(blockerId, blockedId) {
    const { error } = await sb.from('club_blocks')
      .upsert({ blocker_id: blockerId, blocked_id: blockedId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true });
    if (error) throw _clubErr(error);
  },

  // ---------- CLUB TRAINING BUDDIES (migration-boards-tiktok.sql) ----------
  // RLS only returns rows I'm in; writes are RPCs (one buddy each, blocks respected,
  // one nudge per 12 h). Reads fail soft to [] before the migration runs.
  async listMyBuddies() {
    const { data, error } = await sb.from('club_buddies').select('*');
    if (error) return [];
    return (data || []).map(mapDbBuddy);
  },
  async requestBuddy(buddyId) {
    const { data, error } = await sb.rpc('request_club_buddy', { p_buddy: buddyId });
    if (error) throw _clubErr(error, 'Training buddies switch on with the next update.');
    return Array.isArray(data) ? data[0] : data;   // 'pending' | 'active'
  },
  async respondBuddy(id, accept) {
    const { data, error } = await sb.rpc('respond_club_buddy', { p_id: id, p_accept: !!accept });
    if (error) throw _clubErr(error, 'Training buddies switch on with the next update.');
    return Array.isArray(data) ? data[0] : data;   // 'active' | 'declined' | 'taken'
  },
  async endBuddy() {
    const { error } = await sb.rpc('end_club_buddy');
    if (error) throw _clubErr(error, 'Training buddies switch on with the next update.');
  },
  // The buddy's id when a nudge went out; null when I already nudged in the last 12 hours.
  async nudgeBuddy() {
    const { data, error } = await sb.rpc('nudge_club_buddy');
    if (error) throw _clubErr(error, 'Training buddies switch on with the next update.');
    return (Array.isArray(data) ? data[0] : data) || null;
  },

  // ---------- PROGRAMS ----------
  async listProgramsForAthlete(athleteId) {
    // RLS gives athlete access to their own program only (or coach to programs they coach).
    // Use .in() instead of .eq() — .eq() fails on UUID columns with RLS in this project.
    const { data, error } = await sb.from('programs').select('*').in('athlete_id', [athleteId]);
    if (error) { console.warn('listProgramsForAthlete', error); return []; }
    return (data || []).map(mapDbProgram);
  },
  async listProgramsForCoach(coachId) {
    // RLS already filters to current coach's programs. No need for explicit filter.
    const { data, error } = await sb.from('programs').select('*');
    if (error) { console.warn('listProgramsForCoach', error); return []; }
    return (data || []).map(mapDbProgram);
  },
  async upsertProgram(prog) {
    // Postgres upsert runs INSERT-with-CHECK + UPDATE — athletes can't pass the
    // INSERT policy (coach-only). So: UPDATE first; if no row hit, INSERT.
    const row = mapJsProgram(prog);
    const updateRes = await sb.from('programs').update(row).in('id', [prog.id]).select();
    if (updateRes.error) throw updateRes.error;
    if (updateRes.data && updateRes.data.length) return;
    // No existing row — try INSERT (only the coach can succeed here per RLS)
    const insertRes = await sb.from('programs').insert(row);
    if (insertRes.error) throw insertRes.error;
  },
  async deleteProgram(id) {
    const { error } = await sb.from('programs').delete().in('id', [id]);
    if (error) throw error;
  },

  // ---------- PROGRAM TEMPLATES ----------
  async listTemplates(coachId) {
    // RLS already filters to current coach's templates
    const { data, error } = await sb.from('program_templates').select('*');
    if (error) { console.warn('listTemplates', error); return []; }
    return (data || []).map(mapDbTemplate);
  },
  async addTemplate(tpl) {
    const { error } = await sb.from('program_templates').insert(mapJsTemplate(tpl));
    if (error) throw error;
  },
  async deleteTemplate(id) {
    const { error } = await sb.from('program_templates').delete().in('id', [id]);
    if (error) throw error;
  },

  // ---------- WORKOUT LOGS ----------
  async listLogsForAthlete(athleteId) {
    // Use .in() — .eq() fails on UUID columns under RLS in this project.
    const { data, error } = await sb.from('workout_logs').select('*').in('athlete_id', [athleteId]).order('date', { ascending: true });
    if (error) { console.warn('listLogsForAthlete', error); return []; }
    return (data || []).map(mapDbLog);
  },
  async listLogsForAthletes(athleteIds) {
    if (!athleteIds.length) return [];
    const { data, error } = await sb.from('workout_logs').select('*').in('athlete_id', athleteIds);
    if (error) { console.warn('listLogsForAthletes', error); return []; }
    return (data || []).map(mapDbLog);
  },
  async addLog(log) {
    const { error } = await sb.from('workout_logs').insert(mapJsLog(log));
    if (error) throw error;
  },
  async deleteLog(id) {
    const { error } = await sb.from('workout_logs').delete().in('id', [id]);
    if (error) throw error;
  },

  // ---------- BODYWEIGHT ----------
  async listBwForAthlete(athleteId) {
    const { data, error } = await sb.from('bodyweight').select('*').in('athlete_id', [athleteId]).order('date', { ascending: true });
    if (error) { console.warn('listBw', error); return []; }
    return (data || []).map(mapDbBw);
  },
  async listBwForAthletes(athleteIds) {
    if (!athleteIds.length) return [];
    const { data, error } = await sb.from('bodyweight').select('*').in('athlete_id', athleteIds);
    if (error) { console.warn('listBwForAthletes', error); return []; }
    return (data || []).map(mapDbBw);
  },
  async upsertBw(b) {
    const { error } = await sb.from('bodyweight').upsert(mapJsBw(b), { onConflict: 'athlete_id,date' });
    if (error) throw error;
  },

  // ---------- MEETS (competition results) ----------
  async listMeetsForAthlete(athleteId) {
    const { data, error } = await sb.from('meets').select('*').in('athlete_id', [athleteId]).order('meet_date', { ascending: false });
    if (error) { console.warn('listMeets', error); return []; }
    return (data || []).map(mapDbMeet);
  },
  async listMeetsForAthletes(athleteIds) {
    if (!athleteIds.length) return [];
    const { data, error } = await sb.from('meets').select('*').in('athlete_id', athleteIds).order('meet_date', { ascending: false });
    if (error) { console.warn('listMeetsForAthletes', error); return []; }
    return (data || []).map(mapDbMeet);
  },
  // Insert (no id) or update (id present) — upsert on the PK. Returns the saved
  // row so the caller picks up the DB-generated id on first save.
  async saveMeet(m) {
    const { data, error } = await sb.from('meets').upsert(mapJsMeet(m)).select('*');
    if (error) throw error;
    return (data && data.length) ? mapDbMeet(data[0]) : null;
  },
  async deleteMeet(id) {
    const { error } = await sb.from('meets').delete().in('id', [id]);
    if (error) throw error;
  },

  // ---------- SESSION NOTES ----------
  async listNotesForAthlete(athleteId) {
    const { data, error } = await sb.from('session_notes').select('*').in('athlete_id', [athleteId]);
    if (error) { console.warn('listNotes', error); return []; }
    return (data || []).map(mapDbNote);
  },
  async listNotesForAthletes(athleteIds) {
    if (!athleteIds.length) return [];
    const { data, error } = await sb.from('session_notes').select('*').in('athlete_id', athleteIds);
    if (error) { console.warn('listNotesForAthletes', error); return []; }
    return (data || []).map(mapDbNote);
  },
  async addNote(n) {
    const { error } = await sb.from('session_notes').insert(mapJsNote(n));
    if (error) throw error;
  },

  // Upsert coach feedback for a session (athlete_id + date). Creates a row
  // if no athlete note exists yet, otherwise updates the coach_comment columns.
  async upsertCoachComment({ athleteId, date, coachId, comment }) {
    // First, check if a session_notes row already exists for this athlete/date.
    const { data: existing, error: selErr } = await sb.from('session_notes')
      .select('id')
      .eq('athlete_id', athleteId)
      .eq('date', date)
      .limit(1);
    if (selErr) throw selErr;

    if (existing && existing.length) {
      const { error } = await sb.from('session_notes')
        .update({
          coach_comment: comment,
          coach_comment_at: new Date().toISOString(),
          coach_id: coachId
        })
        .in('id', [existing[0].id]);
      if (error) throw error;
      return existing[0].id;
    }
    // Create a fresh row with just the coach feedback.
    const { data: ins, error } = await sb.from('session_notes')
      .insert({
        athlete_id: athleteId,
        date,
        coach_comment: comment,
        coach_comment_at: new Date().toISOString(),
        coach_id: coachId
      })
      .select('id');
    if (error) throw error;
    return ins?.[0]?.id;
  },

  // ---------- CHECK-INS ----------
  async listCheckins(athleteId) {
    const { data, error } = await sb.from('checkins')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('week_start', { ascending: false });
    if (error) { console.warn('listCheckins', error); return []; }
    return (data || []).map(mapDbCheckin);
  },
  async listCheckinsForAthletes(athleteIds) {
    if (!athleteIds.length) return [];
    const { data, error } = await sb.from('checkins')
      .select('*')
      .in('athlete_id', athleteIds)
      .order('week_start', { ascending: false });
    if (error) { console.warn('listCheckinsForAthletes', error); return []; }
    return (data || []).map(mapDbCheckin);
  },
  // Upsert by (athlete_id, week_start) — if a check-in for that week exists, replace it.
  async upsertCheckin(c) {
    const payload = mapJsCheckin(c);
    const { error } = await sb.from('checkins')
      .upsert(payload, { onConflict: 'athlete_id,week_start' });
    if (error) throw error;
  },

  // ---------- CHECK-IN QUESTIONS (migration-checkin-questions-2026-10-22.sql) ----------
  // RLS decides what comes back: a coach gets their own questions, an athlete their current
  // coach's active questions meant for them. Before the migration runs everything here returns
  // empty / { ok: false, notReady: true }, so the app simply shows no questions.
  async listCheckinQuestions() {
    const { data, error } = await sb.from('checkin_questions').select('*').order('position', { ascending: true }).order('created_at', { ascending: true });
    if (error) { if (!_isNotReady(error)) console.warn('listCheckinQuestions', error); return []; }
    return (data || []).map(mapDbCheckinQuestion);
  },
  async saveCheckinQuestion(q) {
    const row = mapJsCheckinQuestion(q);
    const { data, error } = q.id && !String(q.id).startsWith('tmp-')
      ? await sb.from('checkin_questions').update(row).eq('id', q.id).select().single()
      : await sb.from('checkin_questions').insert(row).select().single();
    if (error) return { ok: false, notReady: _isNotReady(error), error };
    return { ok: true, question: mapDbCheckinQuestion(data) };
  },
  async deleteCheckinQuestion(id) {
    const { error } = await sb.from('checkin_questions').delete().eq('id', id);
    if (error) return { ok: false, notReady: _isNotReady(error), error };
    return { ok: true };
  },
  // Answers since a date (YYYY-MM-DD): a coach gets their roster's, an athlete their own.
  async listCheckinAnswers(sinceIso) {
    let q = sb.from('checkin_answers').select('*').order('period', { ascending: false }).limit(2000);
    if (sinceIso) q = q.gte('period', sinceIso);
    const { data, error } = await q;
    if (error) { if (!_isNotReady(error)) console.warn('listCheckinAnswers', error); return []; }
    return (data || []).map(mapDbCheckinAnswer);
  },
  async saveCheckinAnswers(answers) {
    if (!answers || !answers.length) return { ok: true };
    const rows = answers.map(mapJsCheckinAnswer);
    const { error } = await sb.from('checkin_answers').upsert(rows, { onConflict: 'question_id,athlete_id,period' });
    if (error) return { ok: false, notReady: _isNotReady(error), error };
    return { ok: true };
  },

  // ---------- GOALS ----------
  async getGoals(athleteId) {
    const { data, error } = await sb.from('goals').select('*').in('athlete_id', [athleteId]);
    if (error) { console.warn('getGoals', error); return null; }
    return (data && data.length) ? mapDbGoals(data[0]) : null;
  },
  async listGoalsForAthletes(athleteIds) {
    if (!athleteIds.length) return [];
    const { data, error } = await sb.from('goals').select('*').in('athlete_id', athleteIds);
    if (error) { console.warn('listGoalsForAthletes', error); return []; }
    return (data || []).map(mapDbGoals);
  },
  async upsertGoals(g) {
    const { error } = await sb.from('goals').upsert(mapJsGoals(g), { onConflict: 'athlete_id' });
    if (error) throw error;
  },

  // ---------- REST DAYS ----------
  async listRestForAthlete(athleteId) {
    const { data, error } = await sb.from('rest_days').select('*').in('athlete_id', [athleteId]);
    if (error) { console.warn('listRest', error); return []; }
    return (data || []).map(mapDbRest);
  },
  async upsertRest(r) {
    const { error } = await sb.from('rest_days').upsert(mapJsRest(r), { onConflict: 'athlete_id,date' });
    if (error) throw error;
  },
  async deleteRest(athleteId, date) {
    const { error } = await sb.from('rest_days').delete().in('athlete_id', [athleteId]).eq('date', date);
    if (error) throw error;
  },

  // ============================================================
  // MARKETPLACE — coach publishes a program for sale, athletes buy
  // ============================================================

  // Coach submits a new marketplace program. Lands in pending_review until admin
  // creates the Lemon Squeezy product and flips status to 'published'.
  async submitMarketplaceProgram(prog) {
    const payload = mapJsMarketplaceProgram(prog);
    if (!payload.id) delete payload.id; // let DB generate it
    let { data, error } = await sb.from('marketplace_programs').insert(payload).select(MP_COLS);
    // If the taxonomy migration hasn't run yet the `category` column is
    // missing — drop it and retry so publishing still works pre-migration.
    if (error && payload.category && /category/i.test(error.message || '')) {
      delete payload.category;
      ({ data, error } = await sb.from('marketplace_programs').insert(payload).select(MP_COLS));
    }
    if (error) throw error;
    return mapDbMarketplaceProgram(data[0]);
  },

  // Update editable fields of one of your own marketplace programs (title, desc, etc.).
  // Status moves between 'pending_review' ↔ 'unpublished' from the coach side;
  // 'published' is admin-only.
  async updateMarketplaceProgram(id, patch) {
    const allowed = {};
    if (patch.title !== undefined)        allowed.title = patch.title;
    if (patch.description !== undefined)  allowed.description = patch.description;
    if (patch.tier !== undefined)         allowed.tier = patch.tier;
    if (patch.category !== undefined)     allowed.category = patch.category;
    if (patch.priceCents !== undefined)   allowed.price_cents = patch.priceCents;
    if (patch.weekCount !== undefined)    allowed.week_count = patch.weekCount;
    if (patch.status !== undefined)       allowed.status = patch.status;
    if (patch.programPayload !== undefined) allowed.program_payload = patch.programPayload;
    allowed.updated_at = new Date().toISOString();
    let { error } = await sb.from('marketplace_programs').update(allowed).eq('id', id);
    // Retry without category if the column doesn't exist yet (pre-migration).
    if (error && allowed.category !== undefined && /category/i.test(error.message || '')) {
      delete allowed.category;
      ({ error } = await sb.from('marketplace_programs').update(allowed).eq('id', id));
    }
    if (error) throw error;
  },

  async deleteMarketplaceProgram(id) {
    const { error } = await sb.from('marketplace_programs').delete().eq('id', id);
    if (error) throw error;
  },

  // Public: list all published marketplace programs (anyone — signed in or not)
  async listPublishedPrograms({ tier, search } = {}) {
    let q = sb.from('marketplace_programs').select(MP_COLS).eq('status', 'published').order('sold_count', { ascending: false });
    if (tier) q = q.eq('tier', tier);
    if (search) {
      // Match title OR description so search isn't title-only. Sanitize the term
      // for PostgREST's .or() grammar (commas/parens are separators there).
      const term = String(search).replace(/[,()]/g, ' ').trim();
      if (term) q = q.or('title.ilike.%' + term + '%,description.ilike.%' + term + '%');
    }
    const { data, error } = await q;
    if (error) { console.warn('listPublishedPrograms', error); return []; }
    return (data || []).map(mapDbMarketplaceProgram);
  },

  // Coach: list every marketplace program I've published (any status)
  async listMyPublishedPrograms(coachId) {
    const { data, error } = await sb.from('marketplace_programs')
      .select(MP_COLS)
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listMyPublishedPrograms', error); return []; }
    return (data || []).map(mapDbMarketplaceProgram);
  },

  // Single program fetch for the buy page
  async getMarketplaceProgram(id) {
    const { data, error } = await sb.from('marketplace_programs').select(MP_COLS).eq('id', id).limit(1);
    if (error) throw error;
    return (data && data[0]) ? mapDbMarketplaceProgram(data[0]) : null;
  },

  // Sales — buyer side: list everything I've ever bought
  async listMyPurchases(buyerId) {
    const { data, error } = await sb.from('program_sales')
      .select('*')
      .eq('buyer_id', buyerId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listMyPurchases', error); return []; }
    return (data || []).map(mapDbSale);
  },

  // Buyer claims a program they've purchased. This is the manual fallback when the
  // webhook hasn't auto-delivered. Verifies a sale exists for this buyer + program,
  // then clones the program_payload into the buyer's `programs` table (replacing
  // any existing program — single-program model, same as the webhook).
  // Sets coach_id = buyer (self-coach) so the athlete RLS policy allows the insert.
  //
  // buyer1RMs (optional): { squat, bench, deadlift } in kg. If supplied AND the
  // coach published their reference 1RMs, every exercise's weights are scaled by
  // the per-lift ratio (squat exercises scale by squat ratio, etc.). Accessories
  // use the average of the three ratios. Without buyer or reference 1RMs, weights
  // are copied as-is.
  async claimPurchase(marketplaceProgramId, buyer1RMs) {
    const uid = await this.getUserId();
    if (!uid) throw new Error('Not signed in');
    // A coached athlete runs their coach's program (which they can't delete), so installing a
    // bought one would leave two. It stays in their library for when they train on their own.
    {
      const { data: me } = await sb.from('profiles').select('coach_id').eq('id', uid).limit(1);
      if (me && me[0] && me[0].coach_id && me[0].coach_id !== uid) {
        throw new Error('Your coach sets your program. You can install this one when you train on your own.');
      }
    }

    // Verify the buyer actually purchased this program — and that the sale
    // hasn't been refunded/voided (payout_status='cancelled' is set by the
    // marketplace webhook's order_refunded path). A refunded buyer must not be
    // able to claim/re-claim the program.
    const { data: sales, error: salesErr } = await sb.from('program_sales')
      .select('id')
      .eq('buyer_id', uid)
      .eq('marketplace_program_id', marketplaceProgramId)
      .neq('payout_status', 'cancelled')
      .limit(1);
    if (salesErr) throw salesErr;
    if (!sales || !sales.length) throw new Error('No purchase record found. Did the payment go through?');

    // Fetch the program payload (must be published — buyer reads via public RLS)
    const { data: progRows, error: progErr } = await sb.from('marketplace_programs')
      .select(MP_COLS).eq('id', marketplaceProgramId).limit(1);
    if (progErr) throw progErr;
    if (!progRows || !progRows.length) throw new Error('Program not found or has been unpublished');
    const mp = mapDbMarketplaceProgram(progRows[0]);
    mp.programPayload = await _marketplacePayload(marketplaceProgramId);
    if (!mp.programPayload || !mp.programPayload.weeks || !mp.programPayload.weeks.length) {
      throw new Error('Purchased program is empty (contact support).');
    }

    // Strip weights AND ensure every week/day/exercise/set has a unique ID.
    // Marketplace payloads sometimes arrive without IDs (depends on how the
    // coach's template was serialised) — missing IDs cause the dropdown to
    // collapse all days into one ambiguous option.
    const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0, v = c==='x'?r:(r&0x3|0x8); return v.toString(16); });
    const weeks = _cleanWeekNumbers(mp.programPayload.weeks).map(wk => ({
      ...wk,
      id: wk.id || newId(),
      days: (wk.days || []).map(day => ({
        ...day,
        id: day.id || newId(),
        exercises: (day.exercises || []).map(ex => ({
          ...ex,
          id: ex.id || newId(),
          sets: (ex.sets || []).map(s => ({
            ...s,
            id: s.id || newId(),
            weight: 0,
            completed: false,
            completedAt: null
          }))
        }))
      }))
    }));

    // Replace any existing program (single-program model)
    await sb.from('programs').delete().eq('athlete_id', uid);

    // Insert as self-coached so the athlete RLS policy (athlete_id=uid AND coach_id=uid) allows it.
    // Reuse the newId helper defined above.
    const row = {
      id: newId(),
      athlete_id: uid,
      coach_id: uid,
      name: mp.title,
      weeks: weeks,
      updated_at: new Date().toISOString()
    };
    const { error: insErr } = await sb.from('programs').insert(row);
    if (insErr) throw insErr;
    return mapDbProgram(row);
  },

  // Sales — coach side: list every sale of my programs (earnings dashboard)
  async listMySales(coachId) {
    const { data, error } = await sb.from('program_sales')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listMySales', error); return []; }
    return (data || []).map(mapDbSale);
  },

  // ----- Marketplace reviews -------------------------------------------------
  // Public read. Buyers (verified via program_sales by RLS) upsert one review
  // per program. See migration-marketplace-reviews.sql.

  // Public: all reviews for one program, newest first.
  async listProgramReviews(marketplaceProgramId) {
    const { data, error } = await sb.from('program_reviews')
      .select('*')
      .eq('marketplace_program_id', marketplaceProgramId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listProgramReviews', error); return []; }
    return (data || []).map(mapDbReview);
  },

  // Public: reviews for a set of programs at once (browse-grid rating badges).
  async listReviewsForPrograms(ids) {
    if (!ids || !ids.length) return [];
    const { data, error } = await sb.from('program_reviews')
      .select('*')
      .in('marketplace_program_id', ids);
    if (error) { console.warn('listReviewsForPrograms', error); return []; }
    return (data || []).map(mapDbReview);
  },

  // Public: every review across a coach's catalog (coach-profile social proof).
  async listReviewsForCoach(coachId) {
    const { data, error } = await sb.from('program_reviews')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listReviewsForCoach', error); return []; }
    return (data || []).map(mapDbReview);
  },

  // Has the signed-in buyer purchased this program? (gates the review form)
  async hasPurchasedProgram(marketplaceProgramId, buyerId) {
    if (!buyerId) return false;
    const { data, error } = await sb.from('program_sales')
      .select('id')
      .eq('marketplace_program_id', marketplaceProgramId)
      .eq('buyer_id', buyerId)
      .limit(1);
    if (error) { console.warn('hasPurchasedProgram', error); return false; }
    return !!(data && data.length);
  },

  // Buyer upserts their review (one per program — onConflict updates in place).
  async upsertProgramReview({ marketplaceProgramId, coachId, buyerId, buyerName, rating, body }) {
    const row = {
      marketplace_program_id: marketplaceProgramId,
      coach_id: coachId,
      buyer_id: buyerId,
      buyer_name: buyerName || null,
      rating: rating,
      body: body || null,
      updated_at: new Date().toISOString()
    };
    const { data, error } = await sb.from('program_reviews')
      .upsert(row, { onConflict: 'marketplace_program_id,buyer_id' })
      .select('*');
    if (error) throw error;
    return data && data[0] ? mapDbReview(data[0]) : null;
  },

  async deleteProgramReview(id) {
    const { error } = await sb.from('program_reviews').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  // ---- Coach ↔ athlete messaging --------------------------------------
  // Full thread between one coach and one athlete, oldest → newest.
  async listMessages(coachId, athleteId) {
    if (!coachId || !athleteId) return [];
    const { data, error } = await sb.from('messages')
      .select('*')
      .eq('coach_id', coachId)
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: true });
    if (error) { console.warn('listMessages', error); return []; }
    return (data || []).map(mapDbMessage);
  },

  // Post a message. `senderId` is whichever party is currently signed in.
  async sendMessage({ coachId, athleteId, senderId, body, meta }) {
    const row = {
      coach_id: coachId,
      athlete_id: athleteId,
      sender_id: senderId,
      body: (body || '').trim()
    };
    if (meta && typeof meta === 'object') row.meta = meta;
    let { data, error } = await sb.from('messages').insert(row).select('*');
    // Before migration-reactions.sql there is no `meta` column: send the text alone.
    if (error && row.meta && _isNotReady(error)) {
      delete row.meta;
      ({ data, error } = await sb.from('messages').insert(row).select('*'));
    }
    if (error) throw error;
    const m = data && data[0] ? mapDbMessage(data[0]) : null;
    if (m && !m.meta && meta) m.meta = meta;
    return m;
  },

  // ---- Reactions (migration-reactions.sql). One per person per message / post;
  // reaction null = removed. Reads fail soft to [] before the migration runs.
  async listMessageReactions(coachId, athleteId) {
    if (!coachId || !athleteId) return [];
    const { data, error } = await sb.from('message_reactions').select('*').eq('coach_id', coachId).eq('athlete_id', athleteId);
    if (error) { if (_isNotReady(error)) return []; throw error; }
    return (data || []).map(mapDbReaction);
  },
  async setMessageReaction({ messageId, coachId, athleteId, userId, reaction }) {
    const { error } = await sb.from('message_reactions').upsert({
      message_id: messageId, user_id: userId, coach_id: coachId, athlete_id: athleteId, reaction: reaction || null
    }, { onConflict: 'message_id,user_id' });
    if (error) { const e = new Error(_isNotReady(error) ? 'Reactions switch on with the next update' : (error.message || 'Could not react')); e.notReady = _isNotReady(error); throw e; }
    return true;
  },
  subscribeMessageReactions(filter, onChange) {
    if (!filter || !filter.column || !filter.value || typeof onChange !== 'function') return null;
    try {
      const tag = 'msgreact:' + filter.column + ':' + filter.value + ':' + Math.random().toString(36).slice(2, 8);
      const cb = payload => { try { if (payload.new) onChange(mapDbReaction(payload.new)); } catch (e) { console.warn('subscribeMessageReactions cb', e); } };
      const ch = sb.channel(tag)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: filter.column + '=eq.' + filter.value }, cb)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reactions', filter: filter.column + '=eq.' + filter.value }, cb)
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { console.warn('subscribeMessageReactions', e); return null; }
  },
  async listPostReactions(postIds) {
    const ids = (postIds || []).filter(Boolean);
    if (!ids.length) return [];
    const { data, error } = await sb.from('club_post_reactions').select('*').in('post_id', ids.slice(0, 200));
    if (error) { if (_isNotReady(error)) return []; throw error; }
    return (data || []).map(mapDbReaction);
  },
  async setPostReaction({ postId, clubId, userId, reaction }) {
    const { error } = await sb.from('club_post_reactions').upsert({
      post_id: postId, user_id: userId, club_id: clubId, reaction: reaction || null
    }, { onConflict: 'post_id,user_id' });
    if (error) { const e = new Error(_isNotReady(error) ? 'Reactions switch on with the next update' : (error.message || 'Could not react')); e.notReady = _isNotReady(error); throw e; }
    return true;
  },
  subscribePostReactions(clubId, onChange) {
    if (!clubId || typeof onChange !== 'function') return null;
    try {
      const cb = payload => { try { if (payload.new) onChange(mapDbReaction(payload.new)); } catch (e) { console.warn('subscribePostReactions cb', e); } };
      const ch = sb.channel('postreact:' + clubId + ':' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'club_post_reactions', filter: 'club_id=eq.' + clubId }, cb)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'club_post_reactions', filter: 'club_id=eq.' + clubId }, cb)
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { console.warn('subscribePostReactions', e); return null; }
  },

  // Stamp read_at on every unread message in this thread that the signed-in
  // user did NOT send (i.e. the ones addressed to them). Clears their badge.
  async markThreadRead(coachId, athleteId, viewerId) {
    if (!coachId || !athleteId || !viewerId) return false;
    const { error } = await sb.from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('coach_id', coachId)
      .eq('athlete_id', athleteId)
      .neq('sender_id', viewerId)
      .is('read_at', null);
    if (error) { console.warn('markThreadRead', error); return false; }
    return true;
  },

  // All messages addressed TO this user that are still unread — used to paint
  // per-athlete (coach side) or single (athlete side) unread badges. One query.
  async listUnreadForUser(viewerId) {
    if (!viewerId) return [];
    const { data, error } = await sb.from('messages')
      .select('*')
      .neq('sender_id', viewerId)
      .is('read_at', null)
      .or('coach_id.eq.' + viewerId + ',athlete_id.eq.' + viewerId);
    if (error) { console.warn('listUnreadForUser', error); return []; }
    return (data || []).map(mapDbMessage);
  },

  // Thread digest for a coach's Messages inbox: the most-recent message per
  // athlete + that athlete's unread count, in ONE query. Pulls the coach's
  // recent messages (newest first, capped) and reduces client-side — no extra
  // round-trip per thread. Returns [{ athleteId, lastBody, lastAt, lastSenderId,
  // unread }], newest thread first.
  async listThreadsForCoach(coachId) {
    if (!coachId) return [];
    const { data, error } = await sb.from('messages')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) { console.warn('listThreadsForCoach', error); return []; }
    const byAthlete = {};
    (data || []).map(mapDbMessage).forEach(m => {
      let t = byAthlete[m.athleteId];
      if (!t) {
        t = byAthlete[m.athleteId] = { athleteId: m.athleteId, lastBody: m.body, lastAt: m.createdAt, lastSenderId: m.senderId, unread: 0 };
      }
      // Rows arrive newest-first, so the first one seen per athlete is the last message.
      if (m.senderId !== coachId && !m.readAt) t.unread += 1;
    });
    return Object.values(byAthlete).sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  },

  // Live message stream via Supabase Realtime. `filter` is { column, value } —
  // e.g. { column:'athlete_id', value } for one thread, or { column:'coach_id',
  // value } to watch a whole roster for badge updates. Fires onInsert(message)
  // for every new row matching the server-side filter; returns an unsubscribe
  // function (or null when unavailable). Requires the `messages` table to be in
  // the supabase_realtime publication — see migration-messages-realtime.sql.
  subscribeMessages(filter, onInsert) {
    if (!filter || !filter.column || !filter.value || typeof onInsert !== 'function') return null;
    try {
      const tag = 'msg:' + filter.column + ':' + filter.value + ':' + Math.random().toString(36).slice(2, 8);
      const ch = sb.channel(tag)
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: filter.column + '=eq.' + filter.value },
          payload => { try { onInsert(mapDbMessage(payload.new)); } catch (e) { console.warn('subscribeMessages cb', e); } })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { console.warn('subscribeMessages', e); return null; }
  },

  // Live read-receipt stream. Same shape as subscribeMessages but listens for
  // UPDATE (read_at stamped when the other party opens the thread). Fires
  // onUpdate(message) with the full mapped row — possible only because
  // migration-messages-realtime.sql sets REPLICA IDENTITY FULL on `messages`,
  // so UPDATE payloads carry every column, not just the PK. Returns an
  // unsubscribe function (or null when unavailable).
  subscribeMessageReads(filter, onUpdate) {
    if (!filter || !filter.column || !filter.value || typeof onUpdate !== 'function') return null;
    try {
      const tag = 'msgread:' + filter.column + ':' + filter.value + ':' + Math.random().toString(36).slice(2, 8);
      const ch = sb.channel(tag)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: filter.column + '=eq.' + filter.value },
          payload => { try { onUpdate(mapDbMessage(payload.new)); } catch (e) { console.warn('subscribeMessageReads cb', e); } })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { console.warn('subscribeMessageReads', e); return null; }
  },

  // ---- Form-check video uploads ---------------------------------------
  // Athlete uploads a video to the private `form-checks` bucket, then records
  // the metadata row. Returns the created form_check (mapped) or throws.
  async uploadFormCheck({ athleteId, coachId, file, lift, note }) {
    if (!athleteId || !coachId || !file) throw new Error('Missing upload fields');
    // Path: <athlete_id>/<timestamp>-<sanitised filename>. Leading folder must
    // be the athlete uid for the storage RLS policy to allow the write.
    const safeName = (file.name || 'clip.mp4').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
    const path = athleteId + '/' + Date.now() + '-' + safeName;
    const up = await sb.storage.from('form-checks').upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: file.type || 'video/mp4'
    });
    if (up.error) throw up.error;
    const row = {
      athlete_id: athleteId,
      coach_id: coachId,
      storage_path: path,
      lift: lift || null,
      note: (note || '').trim() || null
    };
    const { data, error } = await sb.from('form_checks').insert(row).select('*');
    if (error) {
      // Roll back the orphaned upload so we don't leak storage on a failed row.
      try { await sb.storage.from('form-checks').remove([path]); } catch (e) {}
      throw error;
    }
    return data && data[0] ? mapDbFormCheck(data[0]) : null;
  },

  async listFormChecksForAthlete(athleteId) {
    if (!athleteId) return [];
    const { data, error } = await sb.from('form_checks')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listFormChecksForAthlete', error); return []; }
    return (data || []).map(mapDbFormCheck);
  },

  async listFormChecksForCoach(coachId) {
    if (!coachId) return [];
    const { data, error } = await sb.from('form_checks')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listFormChecksForCoach', error); return []; }
    return (data || []).map(mapDbFormCheck);
  },

  // Short-lived signed URL for private playback (default 1 hour).
  async formCheckSignedUrl(storagePath, expiresInSeconds) {
    if (!storagePath) return null;
    const { data, error } = await sb.storage.from('form-checks')
      .createSignedUrl(storagePath, expiresInSeconds || 3600);
    if (error) { console.warn('formCheckSignedUrl', error); return null; }
    return data ? data.signedUrl : null;
  },

  async replyToFormCheck(id, reply) {
    const { data, error } = await sb.from('form_checks')
      .update({ coach_reply: (reply || '').trim() || null, coach_reply_at: new Date().toISOString() })
      .eq('id', id)
      .select('*');
    if (error) throw error;
    return data && data[0] ? mapDbFormCheck(data[0]) : null;
  },

  async deleteFormCheck(id, storagePath) {
    if (storagePath) { try { await sb.storage.from('form-checks').remove([storagePath]); } catch (e) {} }
    const { error } = await sb.from('form_checks').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  // Admin: list all pending payouts grouped by coach (for monthly payout run)
  async listPendingPayouts() {
    const { data, error } = await sb.from('program_sales')
      .select('*')
      .eq('payout_status', 'pending')
      .order('created_at', { ascending: false });
    if (error) { console.warn('listPendingPayouts', error); return []; }
    return (data || []).map(mapDbSale);
  },

  // Admin: every marketplace program (any status) — used by admin review queue
  async listAllMarketplaceProgramsAdmin() {
    const { data, error } = await sb.from('marketplace_programs')
      .select(MP_COLS)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listAllMarketplaceProgramsAdmin', error); return []; }
    const rows = (data || []).map(mapDbMarketplaceProgram);
    // The review queue needs the payloads: the RPC hands them to an admin.
    await Promise.all(rows.map(async r => { try { r.programPayload = await _marketplacePayload(r.id); } catch (e) { r.programPayload = null; } }));
    return rows;
  },

  // Admin: every sale (any status) — used for payout dashboard
  async listAllSalesAdmin() {
    const { data, error } = await sb.from('program_sales')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.warn('listAllSalesAdmin', error); return []; }
    return (data || []).map(mapDbSale);
  },

  // Admin: reject a marketplace submission
  async adminRejectProgram(id, reason) {
    const { error } = await sb.from('marketplace_programs').update({
      status: 'rejected',
      // Stash reason in description for now (no separate field) — admin can DM the coach
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
  },

  // Admin: mark a sale (or batch of sales) as paid out to the coach
  async markPayoutsPaid(saleIds) {
    if (!saleIds || !saleIds.length) return;
    const { error } = await sb.from('program_sales')
      .update({ payout_status: 'paid', paid_at: new Date().toISOString() })
      .in('id', saleIds);
    if (error) throw error;
  },

  // Admin manual delivery: record a sale row when the webhook didn't fire.
  // Admin pastes the buyer's email + LS order ID; we look up the buyer, create the
  // sale row, and the buyer can then hit "Claim my program" on their dashboard.
  // Requires admin RLS on program_sales (already in migration-marketplace.sql).
  async adminDeliverSale({ marketplaceProgramId, buyerEmail, amountCents, lsOrderId }) {
    if (!marketplaceProgramId || !buyerEmail) throw new Error('Program ID and buyer email required');
    const { data: profs, error: profErr } = await sb.from('profiles')
      .select('id').ilike('email', buyerEmail.trim()).limit(1);
    if (profErr) throw profErr;
    if (!profs || !profs.length) throw new Error('No POWALIFTA account with that email. Buyer must sign up first.');
    const buyerId = profs[0].id;

    const { data: progs, error: pErr } = await sb.from('marketplace_programs')
      .select(MP_COLS).eq('id', marketplaceProgramId).limit(1);
    if (pErr) throw pErr;
    if (!progs || !progs.length) throw new Error('Marketplace program not found.');
    const prog = progs[0];

    const total = Number(amountCents) || prog.price_cents;
    const fee = Math.round(total * 0.20);
    const payout = total - fee;
    const eventKey = 'manual-' + (lsOrderId || Date.now()) + '-' + buyerId.slice(0, 8);

    const { data, error } = await sb.from('program_sales').insert({
      marketplace_program_id: prog.id,
      buyer_id: buyerId,
      coach_id: prog.coach_id,
      amount_cents: total,
      platform_fee_cents: fee,
      coach_payout_cents: payout,
      payout_status: 'pending',
      ls_order_id: lsOrderId || null,
      ls_event_id: eventKey
    }).select('*');
    if (error) {
      if (String(error.message || '').includes('duplicate')) {
        throw new Error('A sale already exists for this LS order ID.');
      }
      throw error;
    }
    await sb.from('marketplace_programs').update({
      sold_count: (prog.sold_count || 0) + 1,
      updated_at: new Date().toISOString()
    }).eq('id', prog.id);
    return data?.[0];
  },

  // Admin (in-dashboard): flip a marketplace program to published once the LS product is wired
  async adminPublishProgram(id, lsProductId, lsVariantId, lsCheckoutUrl) {
    const { error } = await sb.from('marketplace_programs').update({
      status: 'published',
      ls_product_id: lsProductId,
      ls_variant_id: lsVariantId,
      ls_checkout_url: lsCheckoutUrl,
      updated_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;
  },

  // ============================================================
  // HYDRATION — populate the in-memory Store from Supabase
  // Called once on login / page load with active session.
  // ============================================================
  async hydrateAll(profile) {
    const empty = {
      coaches: [], athletes: [], invites: [], programs: [], programTemplates: [],
      workoutLogs: [], bodyweight: [], sessionNotes: [], goals: [], restDays: [],
      checkins: [], meets: [], checkinQuestions: [], checkinAnswers: [],
      marketplacePrograms: [], mySales: [], myPurchases: []
    };
    // Custom check-in answers: the last 10 weeks is plenty for "today", "this week" and averages.
    const _ciSince = (() => { const d = new Date(); d.setDate(d.getDate() - 70); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();

    // Always pull coach directory (public)
    empty.coaches = await this.listCoaches();

    if (!profile) return empty;

    if (profile.user_type === 'coach') {
      // Coach: pull own athletes + their training data
      const ath = await this.listAthletesForCoach(profile.id);
      empty.athletes = ath;
      const athleteIds = ath.map(a => a.id);
      const [invs, programs, tpls, logs, bw, notes, goals, checkins, meets, mp, sales, ciQs, ciAs] = await Promise.all([
        this.listInvites(profile.id),
        this.listProgramsForCoach(profile.id),
        this.listTemplates(profile.id),
        this.listLogsForAthletes(athleteIds),
        this.listBwForAthletes(athleteIds),
        this.listNotesForAthletes(athleteIds),
        this.listGoalsForAthletes(athleteIds),
        this.listCheckinsForAthletes(athleteIds),
        this.listMeetsForAthletes(athleteIds),
        this.listMyPublishedPrograms(profile.id).catch(() => []),
        this.listMySales(profile.id).catch(() => []),
        this.listCheckinQuestions().catch(() => []),
        this.listCheckinAnswers(_ciSince).catch(() => [])
      ]);
      empty.checkinQuestions = ciQs;
      empty.checkinAnswers = ciAs;
      empty.invites = invs;
      empty.programs = programs;
      empty.programTemplates = tpls;
      empty.workoutLogs = logs;
      empty.bodyweight = bw;
      empty.sessionNotes = notes;
      empty.goals = goals;
      empty.checkins = checkins;
      empty.meets = meets;
      empty.marketplacePrograms = mp;
      empty.mySales = sales;
    } else {
      // Athlete: own data
      const [progs, logs, bw, notes, goals, rest, checkins, meets, purchases, ciQs, ciAs] = await Promise.all([
        this.listProgramsForAthlete(profile.id),
        this.listLogsForAthlete(profile.id),
        this.listBwForAthlete(profile.id),
        this.listNotesForAthlete(profile.id),
        this.getGoals(profile.id),
        this.listRestForAthlete(profile.id),
        this.listCheckins(profile.id),
        this.listMeetsForAthlete(profile.id),
        this.listMyPurchases(profile.id).catch(() => []),
        profile.coach_id ? this.listCheckinQuestions().catch(() => []) : Promise.resolve([]),
        profile.coach_id ? this.listCheckinAnswers(_ciSince).catch(() => []) : Promise.resolve([])
      ]);
      empty.checkinQuestions = ciQs;
      empty.checkinAnswers = ciAs;
      empty.myPurchases = purchases;
      empty.programs = progs;
      empty.workoutLogs = logs;
      empty.bodyweight = bw;
      empty.sessionNotes = notes;
      empty.goals = goals ? [goals] : [];
      empty.restDays = rest;
      empty.checkins = checkins;
      empty.meets = meets;

      // Athlete also needs to see their own profile + their coach
      empty.athletes = [mapDbProfileToAthlete(profile)];
      // Coach already in coaches list from listCoaches()
    }

    return empty;
  }
};

window.DB = DB;
window.sb = sb;
