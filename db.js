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
    // The lifter's kg / lb (profiles.unit, migration-program-integrity-2026-10-22.sql), null until set.
    unit: r.unit === 'lb' ? 'lbs' : r.unit === 'kg' ? 'kg' : null,
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
// programs.set_fields (migration-set-fields-2026-10-22.sql): which set fields a program's builder
// shows ({ on: ['tempo', …], cols: ['Bar', …] }). Until the column exists it's kept on this device
// (the values themselves live on the sets, in weeks, so nothing the lifter sees depends on it).
function _sfDefLocal(id, def) {
  const k = 'powa-setfields-' + id;
  try {
    if (def === undefined) { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
    if (def) localStorage.setItem(k, JSON.stringify(def)); else localStorage.removeItem(k);
  } catch (e) {}
  return null;
}
function _cleanSfDef(d) { return typeof cleanSetFieldsDef === 'function' ? cleanSetFieldsDef(d) : null; }
function mapDbProgram(r) {
  const p = _mapDbProgramRow(r);
  _rememberProgBase(p);
  return p;
}
// The row as a program, without making it this device's base (a live row is merged first: app.js liveFlush).
function _mapDbProgramRow(r) {
  const p = { id: r.id, athleteId: r.athlete_id, coachId: r.coach_id, name: r.name, weeks: _cleanWeekNumbers(r.weeks), maxes: r.maxes || null };
  if (r.rev != null) p.rev = Number(r.rev);   // migration-program-integrity-2026-10-22.sql
  // migration-meet-calendar-2026-10-22.sql: the block's first Monday and its meet (W-n labels).
  if (r.starts_on) p.startsOn = String(r.starts_on).slice(0, 10);
  if (r.meet_date) p.meetDate = String(r.meet_date).slice(0, 10);
  const sf = r.set_fields !== undefined ? _cleanSfDef(r.set_fields) : _cleanSfDef(_sfDefLocal(r.id));
  if (sf) p.setFields = sf;
  return p;
}
// programs.maxes arrives with migration-blocks-2026-10-22.sql; until then it's left out.
let _noProgramMaxes = false;
// programs.rev arrives with migration-program-integrity-2026-10-22.sql; until then saves are plain.
let _noProgramRev = false;
// programs.starts_on / meet_date arrive with migration-meet-calendar-2026-10-22.sql.
let _noProgramDates = false;
const _isoOrNull = (v) => { const d = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null; };
let _noSetFields = false;
function mapJsProgram(p) {
  const row = { id: p.id, athlete_id: p.athleteId, coach_id: p.coachId, name: p.name, weeks: p.weeks || [], updated_at: new Date().toISOString() };
  if (!_noProgramMaxes && p.maxes !== undefined) row.maxes = p.maxes && Object.keys(p.maxes).length ? p.maxes : null;
  if (!_noSetFields && p.setFields !== undefined) row.set_fields = _cleanSfDef(p.setFields);
  if (!_noProgramRev && typeof p.rev === 'number' && isFinite(p.rev)) row.rev = p.rev;
  if (!_noProgramDates) {
    if (p.startsOn !== undefined) row.starts_on = _isoOrNull(p.startsOn);
    if (p.meetDate !== undefined) row.meet_date = _isoOrNull(p.meetDate);
  }
  return row;
}
// SAFE SAVING: the last copy of each program this device read from or wrote to the server, the
// common ancestor a three-way merge needs (app.js mergeProgramVersions). A JSON string, so nothing
// edits it by accident.
const _progBase = {};
function _progSnap(p) { return JSON.stringify({ name: (p && p.name) || '', weeks: (p && p.weeks) || [], maxes: (p && p.maxes) || null }); }
// A block's dates (starts_on, meet_date) as this device last read or wrote them: the base the
// conflict merge needs so a calendar drag on another device isn't written back over.
const _progDatesBase = {};
// The rev each remembered copy is at: a copy older than the one remembered never replaces it (a slow
// save reply landing after a live row already brought a newer one in).
const _progBaseRev = {};
function _rememberProgBase(p, rev) {
  if (!p || !p.id) return;
  const r = typeof rev === 'number' ? rev : (typeof p.rev === 'number' ? p.rev : null);
  if (r != null && typeof _progBaseRev[p.id] === 'number' && r < _progBaseRev[p.id]) return;
  if (r != null) _progBaseRev[p.id] = r; else delete _progBaseRev[p.id];
  _progBase[p.id] = _progSnap(p);
  _progDatesBase[p.id] = { startsOn: _isoOrNull(p.startsOn), meetDate: _isoOrNull(p.meetDate) };
}
// Three-way, per date: mine when this device changed it since base, else theirs. A device that
// doesn't know its base keeps the server's (dates are moved through setProgramDates).
function _mergeProgDates(base, mine, theirs) {
  const out = {};
  ['startsOn', 'meetDate'].forEach(k => {
    if (mine[k] === undefined) return;
    const t = _isoOrNull(theirs && theirs[k]), m = _isoOrNull(mine[k]);
    out[k] = base && k in base && _isoOrNull(base[k]) !== m ? m : t;
  });
  return out;
}
function _isRevConflict(error) {
  return !!error && (error.code === 'PT409' || /powa_rev_conflict/.test(String(error.message || '') + ' ' + String(error.details || '')));
}
// weeks is null until the block is opened (getProgramBlockWeeks): the list carries stats only.
function mapDbBlock(r) {
  return { id: r.id, athleteId: r.athlete_id, coachId: r.coach_id, name: r.name || 'Block', weeks: r.weeks ? _cleanWeekNumbers(r.weeks) : null, maxes: r.maxes || null,
    stats: r.stats || null, startedOn: r.started_on, endedOn: r.ended_on, createdAt: r.created_at };
}
const _BLOCK_COLS = 'id, athlete_id, coach_id, name, maxes, stats, started_on, ended_on, created_at';
// Coach-private notes (migration-coach-notes-2026-10-22.sql): only the coach who wrote one reads it.
function mapDbCoachNote(r) {
  return { id: r.id, coachId: r.coach_id, athleteId: r.athlete_id, body: r.body || '', createdAt: r.created_at, updatedAt: r.updated_at || r.created_at };
}
const _COACH_NOTE_COLS = 'id, coach_id, athlete_id, body, created_at, updated_at';
// Clients + payments (migration-clients-2026-10-27.sql): the coach's own record of a lifter's package
// and of the payments they took elsewhere (no money moves through the app). Coach-only: the athlete
// never reads either table. The lists mirror the tables' check constraints (clients.js has them too).
const _CLIENT_CADENCES = ['weekly', 'fortnightly', '4-weekly', 'monthly', 'quarterly', 'yearly', 'one-off'];
const _CLIENT_METHODS = ['bank', 'card', 'paypal', 'cash', 'other'];
function _clStr(v, max) { const t = String(v == null ? '' : v).trim(); return t ? t.slice(0, max) : null; }
function _clCur(c) { const t = String(c || '').trim().toUpperCase(); return /^[A-Z]{3}$/.test(t) ? t : 'USD'; }
function mapDbClientBilling(r) {
  return { id: r.id, coachId: r.coach_id, athleteId: r.athlete_id, package: r.package || 'Online coaching',
    amountCents: Number(r.amount_cents) || 0, currency: r.currency || 'USD', cadence: r.cadence || 'monthly',
    nextDue: r.next_due || null, dueDay: r.due_day == null ? null : Number(r.due_day), status: r.status || 'active',
    startedOn: r.started_on || null, phone: r.phone || null, timezone: r.timezone || null, note: r.note || null,
    createdAt: r.created_at || null, updatedAt: r.updated_at || r.created_at || null };
}
// Only the fields the caller gave go to the server (undefined = not given, null = clear it), so a
// partial save (just nextDue, say) never resets the package to the defaults; a new row takes the
// table's defaults for the rest.
function mapJsClientBilling(b) {
  const row = { coach_id: b.coachId, athlete_id: b.athleteId };
  const has = (k) => b[k] !== undefined;
  if (has('package')) row.package = _clStr(b.package, 80) || 'Online coaching';
  if (has('amountCents')) row.amount_cents = Math.max(0, Math.min(100000000, Math.round(Number(b.amountCents) || 0)));
  if (has('currency')) row.currency = _clCur(b.currency);
  if (has('cadence')) row.cadence = _CLIENT_CADENCES.includes(b.cadence) ? b.cadence : 'monthly';
  if (has('nextDue')) row.next_due = _isoOrNull(b.nextDue);
  if (has('dueDay')) { const d = Math.round(Number(b.dueDay)); row.due_day = d >= 1 && d <= 31 ? d : null; }
  if (has('status')) row.status = b.status === 'paused' || b.status === 'ended' ? b.status : 'active';
  if (has('startedOn')) row.started_on = _isoOrNull(b.startedOn);
  if (has('phone')) row.phone = _clStr(b.phone, 40);
  if (has('timezone')) row.timezone = _clStr(b.timezone, 64);
  if (has('note')) row.note = _clStr(b.note, 500);
  return row;
}
const _CLIENT_BILLING_DEFAULTS = { package: 'Online coaching', amountCents: 0, currency: 'USD', cadence: 'monthly', nextDue: null, dueDay: null,
  status: 'active', startedOn: null, phone: null, timezone: null, note: null };
const _CLIENT_BILLING_COLS = 'id, coach_id, athlete_id, package, amount_cents, currency, cadence, next_due, due_day, status, started_on, phone, timezone, note, created_at, updated_at';
function mapDbClientPayment(r) {
  return { id: r.id, coachId: r.coach_id, athleteId: r.athlete_id, amountCents: Number(r.amount_cents) || 0, currency: r.currency || 'USD',
    paidOn: r.paid_on || null, method: r.method || null, period: r.period || null, note: r.note || null, createdAt: r.created_at || null };
}
function mapJsClientPayment(p) {
  return { coach_id: p.coachId, athlete_id: p.athleteId, amount_cents: Math.max(1, Math.min(100000000, Math.round(Number(p.amountCents) || 0))),
    currency: _clCur(p.currency), paid_on: _isoOrNull(p.paidOn), method: _CLIENT_METHODS.includes(p.method) ? p.method : null,
    period: _clStr(p.period, 40), note: _clStr(p.note, 200) };
}
const _CLIENT_PAYMENT_COLS = 'id, coach_id, athlete_id, amount_cents, currency, paid_on, method, period, note, created_at';
// The intake (migration-intake-2026-10-27.sql): the lifter's answers, which their current coach reads.
// answers is one object (the questionnaire's shape lives in clients.js); coach_id is set by the server.
function mapDbIntake(r) {
  return { athleteId: r.athlete_id, coachId: r.coach_id || null,
    answers: r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers) ? r.answers : {},
    submittedAt: r.submitted_at || null, updatedAt: r.updated_at || null };
}
const _INTAKE_COLS = 'athlete_id, coach_id, answers, submitted_at, updated_at';
function mapDbTemplate(r) {
  return { id: r.id, coachId: r.coach_id, name: r.name, createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(), payload: r.payload };
}
function mapJsTemplate(t) {
  return { id: t.id, coach_id: t.coachId, name: t.name, payload: t.payload };
}
function mapDbLog(r) {
  const l = { id: r.id, athleteId: r.athlete_id, lift: r.lift, variant: r.variant || '', exerciseName: r.exercise_name || '',
    weight: Number(r.weight), reps: Number(r.reps), rpe: Number(r.rpe), e1rm: Number(r.e1rm), e1rmComp: Number(r.e1rm_comp),
    note: r.note || '', date: r.date };
  if (Array.isArray(r.gear) && r.gear.length) l.gear = r.gear;   // raw / equipped tags (unused by the app yet)
  return l;
}
function mapJsLog(l) {
  const row = { id: l.id, athlete_id: l.athleteId, lift: l.lift, variant: l.variant || null, exercise_name: l.exerciseName || null,
    weight: l.weight, reps: l.reps, rpe: l.rpe, e1rm: l.e1rm, e1rm_comp: l.e1rmComp,
    note: l.note || null, date: l.date };
  // workout_logs.gear (migration-program-integrity-2026-10-22.sql): only sent when a set carries tags.
  if (Array.isArray(l.gear) && l.gear.length) row.gear = l.gear.slice(0, 6);
  return row;
}
// PAIN FLAGS: what hurt, where, how much; the coach's resolution beside it.
function mapDbPainReport(r) {
  return { id: r.id, athleteId: r.athlete_id, coachId: r.coach_id || null, day: r.day, bodyPart: r.body_part, side: r.side || null,
    severity: Number(r.severity), phase: r.phase || null, lift: r.lift || null, setRef: (r.set_ref && typeof r.set_ref === 'object') ? r.set_ref : null,
    note: r.note || '', createdAt: r.created_at, resolvedAt: r.resolved_at || null, resolvedBy: r.resolved_by || null, coachNote: r.coach_note || '' };
}
function mapJsPainReport(p) {
  const sev = Math.max(0, Math.min(10, Math.round(Number(p.severity) || 0)));
  return { id: p.id, athlete_id: p.athleteId, day: p.day || null, body_part: p.bodyPart, side: p.side || null, severity: sev,
    phase: p.phase || null, lift: p.lift ? String(p.lift).slice(0, 40) : null, set_ref: p.setRef || null, note: p.note ? String(p.note).slice(0, 500) : null };
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
    notes: r.notes || '', createdAt: r.created_at,
    // migration-meet-calendar-2026-10-22.sql (before it: no status; app.js isPlannedMeet reads a
    // future meet with no lifts as planned).
    status: r.status || null, planned: r.status === 'planned',
    division: r.division || '', weighIn: r.weigh_in || null, weighInAt: r.weigh_in_at || null,
    // MEET DAY hook: the coach's attempt plan (migration-meet-day-2026-10-22.sql); never sent by saveMeet.
    attemptPlan: (r.attempt_plan && typeof r.attempt_plan === 'object') ? r.attempt_plan : null
  };
}
let _noMeetPlanCols = false;
const _dbUuid = () => (typeof uid === 'function' ? uid() : crypto.randomUUID());
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
  const planned = m.status === 'planned' || m.planned === true;
  if (planned) { out.squat_kg = null; out.bench_kg = null; out.deadlift_kg = null; }   // a plan is never a result
  if (!_noMeetPlanCols) {
    out.status = planned ? 'planned' : 'done';
    out.division = String(m.division || '').slice(0, 80);
    out.weigh_in = m.weighIn === '2h' || m.weighIn === '24h' ? m.weighIn : null;
    out.weigh_in_at = m.weighInAt || null;
  }
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
    bodyweight: r.bodyweight || null, bwDirection: r.bw_direction || 'maintain',
    // The cut (migration-readiness-cut-2026-10-22.sql); absent before it runs.
    kcalTarget: r.kcal_target != null ? Number(r.kcal_target) : null, proteinTarget: r.protein_g_target != null ? Number(r.protein_g_target) : null,
    cutBy: r.cut_by || null, targetClass: r.target_class != null ? Number(r.target_class) : null };
}
const GOAL_CUT_COLS = ['kcal_target', 'protein_g_target', 'cut_by', 'target_class'];
function mapJsGoals(g) {
  const row = { athlete_id: g.athleteId, squat: g.squat, bench: g.bench, deadlift: g.deadlift, total: g.total,
    bodyweight: g.bodyweight, bw_direction: g.bwDirection || 'maintain', updated_at: new Date().toISOString() };
  if (g.kcalTarget !== undefined) row.kcal_target = g.kcalTarget || null;
  if (g.proteinTarget !== undefined) row.protein_g_target = g.proteinTarget || null;
  if (g.cutBy !== undefined) row.cut_by = g.cutBy || null;
  if (g.targetClass !== undefined) row.target_class = g.targetClass || null;
  return row;
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
  // null = signed out (no session, or the server refused the token). A refresh that couldn't reach the
  // server is not a sign-out: it throws { transient: true } so the caller can wait or open from the snapshot.
  async getSession() {
    const { data, error } = await sb.auth.getSession();
    if (data && data.session) return data.session;
    if (error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || /fetch|network|timed? ?out|load failed/i.test(String(error.message || '')))) {
      const e = new Error(error.message || 'Network error'); e.transient = true; throw e;
    }
    return null;
  },
  async getUserId() {
    try { const s = await this.getSession(); return s ? s.user.id : null; } catch (e) { return null; }
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
  // Program from a photo (program-photo.js): the picture or PDF goes to the program-read function,
  // which returns the program in the builder's cell notation. Nothing is stored on the server.
  async readProgramPhoto(payload) {
    const { data, error } = await sb.functions.invoke('program-read', { body: payload });
    if (error) {
      let detail = null;
      try { detail = await error.context?.json?.(); } catch (_) { /* ignore */ }
      const e = new Error((detail && (detail.message || detail.error)) || error.message || 'Read failed');
      e.detail = detail;
      e.status = error.context && error.context.status;
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
      // Note where this person's voice notes are while the rows still exist (read only), but
      // delete nothing until the account is really gone: a failed deletion keeps every recording.
      // The redeployed function sweeps them itself (purged.voice); the older one doesn't, so then
      // we remove them here (the storage policy only checks the token's uid against the path).
      let voicePaths = [];
      try { const s = await sb.auth.getSession(); const uid = s && s.data && s.data.session && s.data.session.user && s.data.session.user.id; if (uid) voicePaths = await this._myVoicePaths(uid); } catch (e) {}
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
      if (data && data.deleted) {
        if (voicePaths.length && !(data.purged && data.purged.voice != null)) await this._removeVoicePaths(voicePaths);
        return { ok: true, purged: data.purged };
      }
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

  // ---------- SOCIAL SIGN-IN (Continue with Apple / Google — social-auth.js) ----------
  // Website: Supabase's redirect flow. The tab leaves for the provider and comes back to
  // redirectTo (it must be on the dashboard's Redirect URLs list, see docs/social-sign-in-
  // runbook.md) with the session in the URL hash, which this client reads as it loads.
  // routeRecoveryLink above moves only password-reset links, so the two never collide.
  async signInWithProvider(provider, redirectTo) {
    const options = { redirectTo };
    if (provider === 'google') options.queryParams = { prompt: 'select_account' };   // several Google accounts: pick one
    const { data, error } = await sb.auth.signInWithOAuth({ provider, options });
    if (error) throw error;
    return data;
  },
  // iPhone app: the native Apple / Google sheet hands back an identity token and Supabase
  // checks it and opens a session. Apple: `nonce` is the RAW nonce (its SHA-256 went to
  // Apple). Google: `accessToken` lets Supabase check the token's at_hash claim.
  async signInWithIdToken(provider, token, nonce, accessToken) {
    const creds = { provider, token };
    if (nonce) creds.nonce = nonce;
    if (accessToken) creds.access_token = accessToken;
    const { data, error } = await sb.auth.signInWithIdToken(creds);
    if (error) throw error;
    if (!data || !data.session) throw new Error('Sign-in did not return a session.');
    return data;
  },
  async getProfileOrNull(userId) {
    const { data, error } = await sb.from('profiles').select('*').in('id', [userId]);
    if (error) throw error;
    return (data && data[0]) || null;
  },
  // A first-time Apple / Google account picks athlete or coach after signing in (the email
  // form asks before). finish_social_signup (migration-social-sign-in-2026-10-25.sql) writes
  // the role once, server-side, and marks the account so it can't be chosen twice. Until
  // that migration runs the sign-up trigger has already made an athlete row: an athlete
  // just gets their name saved, a coach is told to use email for now.
  async finishSocialSignup(userType, name) {
    const role = userType === 'coach' ? 'coach' : 'athlete';
    const { data, error } = await sb.rpc('finish_social_signup', { p_user_type: role, p_name: name || null });
    if (!error) return data || { ok: true, user_type: role };
    if (!_isNotReady(error)) throw error;
    return this._finishSocialSignupFallback(role, name);
  },
  async _finishSocialSignupFallback(role, name) {
    const { data: u } = await sb.auth.getUser();
    const user = u && u.user;
    if (!user) throw new Error('Sign in first');
    const row = await this.getProfileOrNull(user.id);
    if (!row) {
      // profiles_insert_self + the INSERT guard (migration-rls-hardening-3.sql) allow this own-row insert.
      const { error } = await sb.from('profiles').insert({ id: user.id, name: name || String(user.email || '').split('@')[0] || 'Lifter', email: user.email, user_type: role, coach_id: null });
      if (error) throw error;
    } else if (row.user_type === role || row.user_type === 'admin') {
      if (name && name !== row.name) await this.updateProfile(user.id, { name });
    } else {
      const e = new Error(role === 'coach'
        ? 'Coach accounts through Apple or Google switch on with the next update. For now, sign up as a coach with your email.'
        : 'This account is already set up as a ' + row.user_type + '.');
      e.notReady = true;
      throw e;
    }
    return { ok: true, user_type: role, fallback: true };
  },
  // Writes into the account's own metadata (what the email sign-up sends as options.data).
  async setUserMetadata(patch) {
    const { error } = await sb.auth.updateUser({ data: patch || {} });
    if (error) throw error;
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
  // Compare-and-swap: the save carries the rev it was edited from. When the row has moved on
  // (another device, the coach, the lifter's set log), the server says powa_rev_conflict; we fetch
  // the new copy, merge both edits (app.js mergeProgramVersions) and save again. Never a silent
  // overwrite. Before the migration (no rev column) it's the old plain save.
  async upsertProgram(prog) {
    if (!prog || !prog.id) return;
    const sentJson = _progSnap(prog);
    let base = prog._base || this.programBase(prog.id);
    let mine = { id: prog.id, athleteId: prog.athleteId, coachId: prog.coachId, name: prog.name, weeks: prog.weeks, maxes: prog.maxes, rev: prog.rev, setFields: prog.setFields,
      startsOn: prog.startsOn, meetDate: prog.meetDate };
    let merged = false, rev, tries = 0, lastSent = sentJson;
    for (;;) {
      if (++tries > 8) throw new Error('Could not save the program: it kept changing. Try again');
      const row = mapJsProgram(mine);
      // What this attempt sends, as text now: mine.weeks may be the Store's own (still being edited).
      lastSent = _progSnap(mine);
      // Postgres upsert runs INSERT-with-CHECK + UPDATE: athletes can't pass the INSERT policy
      // (coach-only). So: UPDATE first; if no row hit, INSERT.
      const res = await sb.from('programs').update(row).in('id', [prog.id]).select(_noProgramRev ? 'id' : 'id, rev');
      if (res.error && 'maxes' in row && _missingCol(res.error, ['maxes'])) { _noProgramMaxes = true; continue; }   // save without it
      if (res.error && 'set_fields' in row && _missingCol(res.error, ['set_fields'])) { _noSetFields = true; continue; }   // set fields stay on this device
      if (res.error && !_noProgramRev && _missingCol(res.error, ['rev'])) { _noProgramRev = true; continue; }
      if (res.error && !_noProgramDates && _missingCol(res.error, ['starts_on', 'meet_date'])) { _noProgramDates = true; continue; }
      if (res.error && _isRevConflict(res.error) && tries <= 5) {
        const theirs = await this.getProgramRow(prog.id);
        if (!theirs) throw res.error;
        const m = typeof mergeProgramVersions === 'function' ? mergeProgramVersions(base, mine, theirs) : mine;
        mine = Object.assign({}, mine, { name: m.name, weeks: m.weeks, maxes: m.maxes, rev: theirs.rev }, _mergeProgDates(base, mine, theirs));
        base = { name: theirs.name, weeks: theirs.weeks, maxes: theirs.maxes, startsOn: _isoOrNull(theirs.startsOn), meetDate: _isoOrNull(theirs.meetDate) };
        merged = true;
        continue;
      }
      if (res.error) throw res.error;
      if (res.data && res.data.length) { if (res.data[0].rev != null) rev = Number(res.data[0].rev); break; }
      // No existing row: try INSERT (only the coach can succeed here per RLS)
      const insertRes = await sb.from('programs').insert(row);
      if (insertRes.error && 'maxes' in row && _missingCol(insertRes.error, ['maxes'])) { _noProgramMaxes = true; continue; }
      if (insertRes.error && 'set_fields' in row && _missingCol(insertRes.error, ['set_fields'])) { _noSetFields = true; continue; }
      if (insertRes.error && !_noProgramRev && _missingCol(insertRes.error, ['rev'])) { _noProgramRev = true; continue; }
      if (insertRes.error && !_noProgramDates && _missingCol(insertRes.error, ['starts_on', 'meet_date'])) { _noProgramDates = true; continue; }
      if (insertRes.error) throw insertRes.error;
      if (!_noProgramRev) rev = typeof row.rev === 'number' ? row.rev : 0;
      break;
    }
    if (_noSetFields && prog.setFields !== undefined) _sfDefLocal(prog.id, _cleanSfDef(prog.setFields));
    // The base is what reached the server, not the live object (edits typed meanwhile aren't on it).
    const written = JSON.parse(lastSent);
    _rememberProgBase(Object.assign({ id: prog.id, startsOn: mine.startsOn, meetDate: mine.meetDate }, written), typeof rev === 'number' ? rev : undefined);
    // The dates a merge settled on (another device's calendar drag) come back with it, so the
    // next save from this copy doesn't carry the old ones again.
    const dates = {};
    if (merged) { if (mine.startsOn !== undefined) dates.startsOn = _isoOrNull(mine.startsOn); if (mine.meetDate !== undefined) dates.meetDate = _isoOrNull(mine.meetDate); }
    if (typeof programWriteLanded === 'function') programWriteLanded(prog, sentJson, written, rev, merged, dates);
    else if (typeof rev === 'number') prog.rev = rev;
    return { rev, merged };
  },
  async getProgramRow(id) {
    const { data, error } = await sb.from('programs').select('*').in('id', [id]).limit(1);
    if (error) throw error;
    return data && data[0] ? mapDbProgram(data[0]) : null;
  },
  // The version this device last read or wrote (null when unknown, e.g. a cold offline open).
  programBase(id) { try { return _progBase[id] ? Object.assign(JSON.parse(_progBase[id]), _progDatesBase[id] || {}) : null; } catch (e) { return null; } },
  rememberProgramBase(p) { _rememberProgBase(p); },
  // True once a save found no programs.starts_on / meet_date (the calendar migration hasn't run).
  programDatesMissing() { return _noProgramDates; },
  // A set patch landed with the next rev: the remembered copy gets the same patch.
  patchProgramBase(id, path, patch, rev) {
    const b = this.programBase(id);
    if (!b || typeof _findProgramSet !== 'function') return;
    if (typeof rev === 'number' && typeof _progBaseRev[id] === 'number' && rev <= _progBaseRev[id]) return;   // already in it
    const s = _findProgramSet(b, path);
    if (!s) { delete _progBase[id]; delete _progBaseRev[id]; return; }
    applySetPatch(s, patch);
    _progBase[id] = _progSnap(b);
    if (typeof rev === 'number') _progBaseRev[id] = rev;
  },
  // One set logged / un-logged (log_program_set): the new rev, or null when the set isn't there.
  // Throws { notReady } before the migration runs; any other throw = offline (the outbox retries).
  async logProgramSet(programId, path, patch) {
    const { data, error } = await sb.rpc('log_program_set', { p_program_id: programId, p_path: (path || []).map(String), p_patch: patch });
    if (error) {
      if (_isNotReady(error)) { const e = new Error('log_program_set is not there yet'); e.notReady = true; throw e; }
      // 22023: the server refused the patch's shape (a field or a type). Retrying can't help.
      if (error.code === '22023') { const e = new Error(error.message || 'bad set patch'); e.badPatch = true; throw e; }
      throw error;
    }
    const v = Array.isArray(data) ? data[0] : data;
    return v == null ? null : Number(v);
  },
  // The lifter's kg / lb on their profile ('kg' | 'lbs'). Quiet before the migration.
  async setMyUnit(unit) {
    const uid = await this.getUserId();
    if (!uid) return { ok: false };
    const { error } = await sb.from('profiles').update({ unit: unit === 'lbs' || unit === 'lb' ? 'lb' : 'kg' }).in('id', [uid]);
    if (error) return { ok: false, notReady: _isNotReady(error) || !!_missingCol(error, ['unit']), error };
    return { ok: true };
  },
  async deleteProgram(id) {
    const { error } = await sb.from('programs').delete().in('id', [id]);
    if (error) throw error;
  },
  // ---------- APPLE HEALTH SHARING (migration-health-2026-10-22.sql) ----------
  // The lifter's choice to share sleep + resting heart rate with their coach.
  async setShareHealth(on) {
    const uid = await this.getUserId();
    if (!uid) return { ok: false };
    const { error } = await sb.from('profiles').update({ share_health_with_coach: !!on }).in('id', [uid]);
    if (error) return { ok: false, notReady: _isNotReady(error) || !!_missingCol(error, ['share_health_with_coach']), error };
    return { ok: true };
  },
  // Nights and resting heart rate, one row a day ({ day, sleepMin, rhr }); only while sharing.
  async saveHealthDaily(rows) {
    const uid = await this.getUserId();
    if (!uid || !rows || !rows.length) return { ok: true };
    const out = rows.map(r => {
      const o = { athlete_id: uid, day: r.day,
        sleep_min: r.sleepMin == null ? null : Math.max(0, Math.min(1440, Math.round(r.sleepMin))),
        rhr_bpm: r.rhr == null ? null : Math.round(Number(r.rhr)) };
      if (r.hrv != null && Number(r.hrv) > 0) o.hrv_ms = Math.round(Math.min(500, Number(r.hrv)) * 10) / 10;
      return o;
    });
    let { error } = await sb.from('health_daily').upsert(out, { onConflict: 'athlete_id,day' });
    // Before migration-readiness-cut-2026-10-22.sql: no HRV column, share sleep + HR as before.
    if (error && _missingCol(error, ['hrv_ms'])) {
      out.forEach(o => delete o.hrv_ms);
      ({ error } = await sb.from('health_daily').upsert(out.filter(o => o.sleep_min != null || o.rhr_bpm != null), { onConflict: 'athlete_id,day' }));
    }
    if (error) return { ok: false, notReady: _isNotReady(error), error };
    return { ok: true };
  },
  // Food sharing, its own switch (migration-readiness-cut-2026-10-22.sql).
  async setShareNutrition(on) {
    const uid = await this.getUserId();
    if (!uid) return { ok: false };
    const { error } = await sb.from('profiles').update({ share_nutrition_with_coach: !!on }).in('id', [uid]);
    if (error) return { ok: false, notReady: _isNotReady(error) || !!_missingCol(error, ['share_nutrition_with_coach']), error };
    return { ok: true };
  },
  // Days with food logged ({ day, kcal, proteinG }); a day without data is never sent.
  async saveNutritionDaily(rows) {
    const uid = await this.getUserId();
    const out = (rows || []).filter(r => r && r.day && (Number(r.kcal) > 0 || Number(r.proteinG) > 0)).map(r => ({ athlete_id: uid, day: r.day,
      kcal: Number(r.kcal) > 0 ? Math.min(20000, Math.round(Number(r.kcal))) : null,
      protein_g: Number(r.proteinG) > 0 ? Math.min(1000, Math.round(Number(r.proteinG) * 10) / 10) : null }));
    if (!uid || !out.length) return { ok: true };
    const { error } = await sb.from('nutrition_daily').upsert(out, { onConflict: 'athlete_id,day' });
    if (error) return { ok: false, notReady: _isNotReady(error), error };
    return { ok: true };
  },
  async listNutritionDaily(athleteIds) {
    if (!athleteIds || !athleteIds.length) return [];
    const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await sb.from('nutrition_daily').select('athlete_id, day, kcal, protein_g').in('athlete_id', athleteIds).gte('day', since).order('day', { ascending: false });
    if (error) { if (!_isNotReady(error)) console.warn('listNutritionDaily', error); return []; }
    return (data || []).map(r => ({ athleteId: r.athlete_id, day: r.day, kcal: r.kcal, proteinG: r.protein_g == null ? null : Number(r.protein_g) }));
  },
  // A coach: the shared rows of their roster (RLS hands over only what's shared), last 14 days.
  // 35 days: readiness compares the last days with the lifter's own 28 before them.
  async listHealthDaily(athleteIds) {
    if (!athleteIds || !athleteIds.length) return [];
    const since = new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10);
    const q = (cols) => sb.from('health_daily').select(cols).in('athlete_id', athleteIds).gte('day', since).order('day', { ascending: false }).limit(5000);
    let { data, error } = await q('athlete_id, day, sleep_min, rhr_bpm, hrv_ms');
    if (error && _missingCol(error, ['hrv_ms'])) ({ data, error } = await q('athlete_id, day, sleep_min, rhr_bpm'));
    if (error) { if (!_isNotReady(error)) console.warn('listHealthDaily', error); return []; }
    return (data || []).map(r => ({ athleteId: r.athlete_id, day: r.day, sleepMin: r.sleep_min, rhr: r.rhr_bpm == null ? null : Number(r.rhr_bpm), hrv: r.hrv_ms == null ? null : Number(r.hrv_ms) }));
  },

  // ---------- PAIN FLAGS (migration-pain-reports-2026-10-22.sql) ----------
  // "Something hurt": the lifter's reports, read by them and their current coach. Reads fail soft
  // to [] before the migration; writes throw { notReady } so the app can say so.
  async listPainReports(athleteIds, sinceIso) {
    if (!athleteIds || !athleteIds.length) return [];
    const since = sinceIso || new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await sb.from('pain_reports').select('*').in('athlete_id', athleteIds).gte('day', since).order('created_at', { ascending: false }).limit(500);
    if (error) { if (!_isNotReady(error)) console.warn('listPainReports', error); return []; }
    return (data || []).map(mapDbPainReport);
  },
  // Idempotent by id (an outbox replay of a report that did land is fine).
  async addPainReport(r) {
    const { data, error } = await sb.from('pain_reports').insert(mapJsPainReport(r)).select('*');
    if (error) {
      // Already there (an outbox replay of a report that did land): say so, so no second push goes.
      if (/duplicate|unique|23505/i.test(String(error.message || '') + ' ' + error.code)) return Object.assign({}, r, { duplicate: true });
      if (_isNotReady(error)) { const e = new Error('Pain flags switch on with the next update'); e.notReady = true; throw e; }
      throw error;
    }
    return data && data[0] ? mapDbPainReport(data[0]) : r;
  },
  async deletePainReport(id) {
    const { error } = await sb.from('pain_reports').delete().in('id', [id]);
    if (error) throw error;
  },
  // The coach: resolved (with a note) or open again. The server stamps who resolved it.
  async resolvePainReport(id, resolved, coachNote) {
    const row = { resolved_at: resolved ? new Date().toISOString() : null, coach_note: coachNote ? String(coachNote).slice(0, 1000) : null };
    const { data, error } = await sb.from('pain_reports').update(row).in('id', [id]).select('*');
    if (error) throw error;
    return data && data[0] ? mapDbPainReport(data[0]) : null;
  },
  // Live: a new, resolved or deleted report (RLS decides what arrives). onChange(report, eventType);
  // on 'DELETE' the report is just { id }. Returns an unsubscribe, or null.
  subscribePainReports(onChange) {
    if (typeof onChange !== 'function') return null;
    try {
      const ch = sb.channel('pain:' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pain_reports' },
          payload => {
            try {
              // A DELETE (the lifter's Undo on a mis-tap) carries only the old row's id.
              if (payload.eventType === 'DELETE') { if (payload.old && payload.old.id) onChange({ id: payload.old.id }, 'DELETE'); return; }
              if (payload.new && payload.new.id) onChange(mapDbPainReport(payload.new), payload.eventType);
            } catch (e) { console.warn('subscribePainReports cb', e); }
          })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { console.warn('subscribePainReports', e); return null; }
  },

  // ---------- COACH BRANDING (migration-coach-brand-2026-10-22.sql) ----------
  // An athlete's coach's team name, logo and colour: answered only while that coach is on Pro or
  // Premium (the server decides), else null. Null too before the migration runs.
  async getMyCoachBrand() {
    const { data, error } = await sb.rpc('my_coach_brand');
    if (error) { if (!_isNotReady(error)) console.warn('getMyCoachBrand', error); return null; }
    const r = (data || [])[0];
    return r ? { coachId: r.coach_id, name: r.brand_name || null, logoUrl: r.brand_logo_url || null, color: r.brand_color || null } : null;
  },
  // A coach's own branding: { name, color, logoUrl }; undefined leaves a field, null clears it.
  async saveBrand(userId, fields) {
    const row = {};
    if (fields.name !== undefined) row.brand_name = fields.name ? String(fields.name).trim().slice(0, 40) : null;
    if (fields.color !== undefined) row.brand_color = fields.color || null;
    if (fields.logoUrl !== undefined) row.brand_logo_url = fields.logoUrl || null;
    const { error } = await sb.from('profiles').update(row).in('id', [userId]);
    if (error) return { ok: false, notReady: _isNotReady(error) || !!_missingCol(error, ['brand_name', 'brand_color', 'brand_logo_url']), error };
    return { ok: true };
  },
  // The logo file: avatars/<id>/brand.png (the database accepts only this path for a logo).
  async uploadBrandLogo(blob, userId) {
    const path = userId + '/brand.png';
    const { error } = await sb.storage.from('avatars').upload(path, blob, { upsert: true, cacheControl: '3600', contentType: 'image/png' });
    if (error) throw error;
    const { data } = sb.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl + '?t=' + Date.now();
  },

  // ---------- PAST BLOCKS (migration-blocks-2026-10-22.sql) ----------
  async listProgramBlocks(athleteIds) {
    if (!athleteIds || !athleteIds.length) return [];
    const { data, error } = await sb.from('program_blocks').select(_BLOCK_COLS).in('athlete_id', athleteIds).order('ended_on', { ascending: false }).limit(300);
    if (error) { if (!_isNotReady(error)) console.warn('listProgramBlocks', error); return []; }
    return (data || []).map(mapDbBlock);
  },
  async getProgramBlockWeeks(id) {
    const { data, error } = await sb.from('program_blocks').select('weeks').in('id', [id]).maybeSingle();
    if (error || !data) { if (error) console.warn('getProgramBlockWeeks', error); return null; }
    return _cleanWeekNumbers(data.weeks || []);
  },
  async addProgramBlock(b) {
    const row = { athlete_id: b.athleteId, coach_id: b.coachId || null, name: String(b.name || 'Block').slice(0, 120), weeks: b.weeks || [], maxes: b.maxes || null,
      stats: b.stats || null, started_on: b.startedOn || null, ended_on: b.endedOn || null };
    const { data, error } = await sb.from('program_blocks').insert(row).select(_BLOCK_COLS).single();
    if (error) return { ok: false, notReady: _isNotReady(error), error };
    return { ok: true, block: Object.assign(mapDbBlock(data), { weeks: b.weeks || [] }) };
  },
  async deleteProgramBlock(id) {
    const { error } = await sb.from('program_blocks').delete().eq('id', id);
    if (error) return { ok: false, notReady: _isNotReady(error), error };
    return { ok: true };
  },

  // ---------- COACH-PRIVATE NOTES (migration-coach-notes-2026-10-22.sql) ----------
  // Until the migration runs, a coach's notes live on this device (localStorage, per coach) and
  // every answer carries local: true, so the desk can say so. Once the table exists, the next
  // load moves any device notes up and clears them here.
  _cnKey(coachId) { return 'powa-coach-notes-' + coachId; },
  _cnLocal(coachId, list) {
    try {
      if (list === undefined) return JSON.parse(localStorage.getItem(this._cnKey(coachId)) || '[]') || [];
      if (!list.length) localStorage.removeItem(this._cnKey(coachId)); else localStorage.setItem(this._cnKey(coachId), JSON.stringify(list));
    } catch (e) {}
    return list || [];
  },
  _cnNew(n) { return { id: n.id || ('local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)), coachId: n.coachId, athleteId: n.athleteId, body: String(n.body || '').slice(0, 4000), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), local: true }; },
  async listCoachNotes(coachId) {
    const { data, error } = await sb.from('coach_notes').select(_COACH_NOTE_COLS).eq('coach_id', coachId).order('created_at', { ascending: false }).limit(2000);
    if (error) {
      if (_isNotReady(error)) this._cnReady = false; else console.warn('listCoachNotes', error);
      return this._cnLocal(coachId).map(n => Object.assign(n, { local: true }));
    }
    this._cnReady = true;
    const out = (data || []).map(mapDbCoachNote);
    const loc = this._cnLocal(coachId);
    if (loc.length) {
      const rows = loc.map(n => ({ coach_id: coachId, athlete_id: n.athleteId, body: n.body }));
      const up = await sb.from('coach_notes').insert(rows).select(_COACH_NOTE_COLS);
      if (!up.error) { this._cnLocal(coachId, []); (up.data || []).forEach(r => out.unshift(mapDbCoachNote(r))); }
      else loc.forEach(n => out.unshift(Object.assign(n, { local: true })));
    }
    return out;
  },
  async addCoachNote(n) {
    if (this._cnReady !== false) {
      const { data, error } = await sb.from('coach_notes').insert({ coach_id: n.coachId, athlete_id: n.athleteId, body: String(n.body || '').slice(0, 4000) }).select(_COACH_NOTE_COLS).single();
      if (!error) return { ok: true, note: mapDbCoachNote(data) };
      if (!_isNotReady(error)) return { ok: false, error };
      this._cnReady = false;
    }
    const note = this._cnNew(n);
    this._cnLocal(n.coachId, [note].concat(this._cnLocal(n.coachId)));
    return { ok: true, note, local: true };
  },
  async updateCoachNote(note, body) {
    const text = String(body || '').slice(0, 4000);
    if (!note.local && this._cnReady !== false) {
      const { data, error } = await sb.from('coach_notes').update({ body: text }).eq('id', note.id).select(_COACH_NOTE_COLS).single();
      if (!error) return { ok: true, note: mapDbCoachNote(data) };
      return { ok: false, error };
    }
    const list = this._cnLocal(note.coachId).map(x => x.id === note.id ? Object.assign(x, { body: text, updatedAt: new Date().toISOString() }) : x);
    this._cnLocal(note.coachId, list);
    return { ok: true, note: Object.assign({}, note, { body: text, local: true }), local: true };
  },
  async deleteCoachNote(note) {
    if (!note.local && this._cnReady !== false) {
      const { error } = await sb.from('coach_notes').delete().eq('id', note.id);
      return error ? { ok: false, error } : { ok: true };
    }
    this._cnLocal(note.coachId, this._cnLocal(note.coachId).filter(x => x.id !== note.id));
    return { ok: true, local: true };
  },

  // ---------- CLIENTS + PAYMENTS (migration-clients-2026-10-27.sql) ----------
  // Coach-only: the package, price and cadence a coach keeps per lifter, and the payments they took
  // elsewhere (bank, card, PayPal, cash). No money moves through the app and the athlete never reads
  // any of it. Until the migration runs, a coach's packages and payments live on this device
  // (localStorage, per coach) and every answer carries local: true, so the page can say so. Once the
  // tables exist, the next load moves the device rows up and clears them here. Nothing here throws.
  //   listClientBilling(coachId)   → [billing]
  //   upsertClientBilling(row)     → { ok, billing, local? } | { ok: false, error }   (one row per coach + lifter)
  //   listClientPayments(coachId)  → [payment] (the last 400 days, newest first)
  //   addClientPayment(row)        → { ok, payment, local? } | { ok: false, error }
  //   deleteClientPayment(id)      → { ok, local? } | { ok: false, error }   (an id, or the payment)
  _clKey(kind, coachId) { return 'powa-client-' + kind + '-' + coachId; },
  _clLocal(kind, coachId, list) {
    try {
      if (list === undefined) return JSON.parse(localStorage.getItem(this._clKey(kind, coachId)) || '[]') || [];
      if (!list.length) localStorage.removeItem(this._clKey(kind, coachId)); else localStorage.setItem(this._clKey(kind, coachId), JSON.stringify(list));
    } catch (e) {}
    return list || [];
  },
  _clLocalId() { return 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  // A row in the device's list, shaped and trimmed exactly as the server would keep it.
  _clLocalBilling(row, old) {
    const now = new Date().toISOString();
    const merged = Object.assign({}, _CLIENT_BILLING_DEFAULTS, old || {});
    Object.keys(row).forEach(k => { if (row[k] !== undefined) merged[k] = row[k]; });
    return Object.assign(mapDbClientBilling(Object.assign({ id: (old && old.id) || this._clLocalId(), created_at: (old && old.createdAt) || now, updated_at: now },
      mapJsClientBilling(merged))), { local: true });
  },
  async listClientBilling(coachId) {
    if (!coachId) return [];
    const { data, error } = await sb.from('client_billing').select(_CLIENT_BILLING_COLS).eq('coach_id', coachId).limit(1000);
    if (error) {
      if (_isNotReady(error)) this._cbReady = false; else console.warn('listClientBilling', error);
      return this._clLocal('billing', coachId).map(b => Object.assign(b, { local: true }));
    }
    this._cbReady = true;
    const out = (data || []).map(mapDbClientBilling);
    // Device rows go up, except for a lifter the server already has a package for (that one was
    // saved after the tables arrived, so it's the newer).
    const all = this._clLocal('billing', coachId);
    if (all.length) {
      const loc = all.filter(b => b && b.athleteId && !out.some(x => x.athleteId === b.athleteId));
      const rows = loc.map(b => mapJsClientBilling(Object.assign({}, _CLIENT_BILLING_DEFAULTS, b, { coachId })));
      const up = rows.length ? await sb.from('client_billing').upsert(rows, { onConflict: 'coach_id,athlete_id' }).select(_CLIENT_BILLING_COLS) : { data: [] };
      const keep = [];
      if (up.error) {
        // One lifter who has left fails the whole batch: send them one at a time and keep the misses here.
        for (let i = 0; i < rows.length; i++) {
          const one = await sb.from('client_billing').upsert(rows[i], { onConflict: 'coach_id,athlete_id' }).select(_CLIENT_BILLING_COLS).single();
          if (one.error) keep.push(loc[i]); else out.push(mapDbClientBilling(one.data));
        }
      } else (up.data || []).forEach(r => out.push(mapDbClientBilling(r)));
      this._clLocal('billing', coachId, keep);
      keep.forEach(b => out.push(Object.assign(b, { local: true })));
    }
    return out;
  },
  async upsertClientBilling(row) {
    if (!row || !row.coachId || !row.athleteId) return { ok: false, error: new Error('A package needs a coach and a lifter') };
    if (this._cbReady !== false) {
      const { data, error } = await sb.from('client_billing').upsert(mapJsClientBilling(row), { onConflict: 'coach_id,athlete_id' }).select(_CLIENT_BILLING_COLS).single();
      if (!error) return { ok: true, billing: mapDbClientBilling(data) };
      if (!_isNotReady(error)) return { ok: false, error };
      this._cbReady = false;
    }
    const list = this._clLocal('billing', row.coachId);
    const billing = this._clLocalBilling(row, list.find(b => b.athleteId === row.athleteId));
    this._clLocal('billing', row.coachId, list.filter(b => b.athleteId !== row.athleteId).concat([billing]));
    return { ok: true, billing, local: true };
  },
  async listClientPayments(coachId) {
    if (!coachId) return [];
    const since = (() => { const d = new Date(); d.setDate(d.getDate() - 400); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const PAGE = 1000, out = [];
    const newestFirst = (list) => list.filter(p => !p.paidOn || p.paidOn >= since)
      .sort((a, b) => String(b.paidOn).localeCompare(String(a.paidOn)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    for (let from = 0; from < 20000; from += PAGE) {
      const { data, error } = await sb.from('client_payments').select(_CLIENT_PAYMENT_COLS).eq('coach_id', coachId).gte('paid_on', since)
        .order('paid_on', { ascending: false }).order('id', { ascending: true }).range(from, from + PAGE - 1);
      if (error) {
        if (from > 0) { console.warn('listClientPayments', error); break; }   // keep the pages that came
        if (_isNotReady(error)) this._cpReady = false; else console.warn('listClientPayments', error);
        return newestFirst(this._clLocal('payments', coachId).filter(Boolean).map(p => Object.assign(p, { local: true })));
      }
      out.push(...(data || []).map(mapDbClientPayment));
      if (!data || data.length < PAGE) break;
    }
    this._cpReady = true;
    const all = this._clLocal('payments', coachId);
    if (all.length) {
      const loc = all.filter(p => p && p.athleteId && Number(p.amountCents) >= 1);
      const rows = loc.map(p => mapJsClientPayment(Object.assign({}, p, { coachId, paidOn: _isoOrNull(p.paidOn) || since })));
      const up = rows.length ? await sb.from('client_payments').insert(rows).select(_CLIENT_PAYMENT_COLS) : { data: [] };
      const keep = [];
      if (up.error) {
        for (let i = 0; i < rows.length; i++) {
          const one = await sb.from('client_payments').insert(rows[i]).select(_CLIENT_PAYMENT_COLS).single();
          if (one.error) keep.push(loc[i]); else out.push(mapDbClientPayment(one.data));
        }
      } else (up.data || []).forEach(r => out.push(mapDbClientPayment(r)));
      this._clLocal('payments', coachId, keep);
      keep.forEach(p => out.push(Object.assign(p, { local: true })));
    }
    return newestFirst(out);
  },
  async addClientPayment(p) {
    if (!p || !p.coachId || !p.athleteId) return { ok: false, error: new Error('A payment needs a coach and a lifter') };
    const cents = Math.round(Number(p.amountCents) || 0);
    if (!(cents >= 1 && cents <= 100000000)) return { ok: false, error: new Error('Enter an amount above zero') };
    const today = typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10);
    const row = mapJsClientPayment(Object.assign({}, p, { paidOn: _isoOrNull(p.paidOn) || today }));
    if (this._cpReady !== false) {
      const { data, error } = await sb.from('client_payments').insert(row).select(_CLIENT_PAYMENT_COLS).single();
      if (!error) return { ok: true, payment: mapDbClientPayment(data) };
      if (!_isNotReady(error)) return { ok: false, error };
      this._cpReady = false;
    }
    const payment = Object.assign(mapDbClientPayment(Object.assign({ id: this._clLocalId(), created_at: new Date().toISOString() }, row)), { local: true });
    this._clLocal('payments', p.coachId, [payment].concat(this._clLocal('payments', p.coachId)));
    return { ok: true, payment, local: true };
  },
  async deleteClientPayment(idOrPayment) {
    const pay = idOrPayment && typeof idOrPayment === 'object' ? idOrPayment : null;
    const id = pay ? pay.id : idOrPayment;
    if (!id) return { ok: false, error: new Error('No payment to delete') };
    if (!(pay && pay.local) && !/^local-/.test(String(id)) && this._cpReady !== false) {
      const { error } = await sb.from('client_payments').delete().eq('id', id);
      return error ? { ok: false, error } : { ok: true };
    }
    // A device payment: in its coach's list on this device (the signed-in coach's, or whichever holds it).
    const coachId = (pay && pay.coachId) || (window._user && window._user.id), prefix = this._clKey('payments', '');
    const coaches = [];
    if (coachId) coaches.push(coachId);
    else { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(prefix) === 0) coaches.push(k.slice(prefix.length)); } } catch (e) {} }
    let hit = false;
    coaches.forEach(c => {
      const list = this._clLocal('payments', c), next = list.filter(x => x && x.id !== id);
      if (next.length !== list.length) { hit = true; this._clLocal('payments', c, next); }
    });
    return hit ? { ok: true, local: true } : { ok: false, local: true, error: new Error('That payment isn\'t on this device') };
  },

  // ---------- INTAKE (migration-intake-2026-10-27.sql) ----------
  // The questionnaire a lifter fills in on joining a coach: one row per lifter, the answers one
  // object. The lifter reads and writes their own; their current coach reads it; nobody deletes.
  // The server sets coach_id (never sent from here). Until the migration runs, the lifter's answers
  // stay on their device (localStorage, per lifter; local: true) and go up on the next load after
  // it; a coach sees none until then. Nothing here throws.
  //   getMyIntake(athleteId)        → intake | null
  //   saveMyIntake(row)             → { ok, intake, local? } | { ok: false, error, tooLong? }   (an upsert)
  //   listIntakes(coachId, ids?)    → [intake] for the roster (ids), else whatever RLS lets the coach read
  _inKey(athleteId) { return 'powa-intake-' + athleteId; },
  _inLocal(athleteId, row) {
    try {
      if (row === undefined) return JSON.parse(localStorage.getItem(this._inKey(athleteId)) || 'null');
      if (!row) localStorage.removeItem(this._inKey(athleteId)); else localStorage.setItem(this._inKey(athleteId), JSON.stringify(row));
    } catch (e) {}
    return row || null;
  },
  _inPayload(athleteId, row) {
    const out = { athlete_id: athleteId, answers: row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers) ? row.answers : {} };
    if (row.submittedAt !== undefined) out.submitted_at = row.submittedAt || null;   // undefined = leave it as it is
    return out;
  },
  async getMyIntake(athleteId) {
    if (!athleteId) return null;
    const { data, error } = await sb.from('intake').select(_INTAKE_COLS).eq('athlete_id', athleteId).maybeSingle();
    if (error) {
      if (_isNotReady(error)) this._inReady = false; else console.warn('getMyIntake', error);
      const loc = this._inLocal(athleteId);
      return loc ? Object.assign(loc, { local: true }) : null;
    }
    this._inReady = true;
    let out = data ? mapDbIntake(data) : null;
    const loc = this._inLocal(athleteId);
    if (loc && out) this._inLocal(athleteId, null);   // the server's copy was saved after the table arrived: it's the newer
    else if (loc) {
      const up = await sb.from('intake').upsert(this._inPayload(athleteId, loc), { onConflict: 'athlete_id' }).select(_INTAKE_COLS).single();
      if (!up.error) { this._inLocal(athleteId, null); out = mapDbIntake(up.data); }
      else out = Object.assign(loc, { local: true });
    }
    return out;
  },
  async saveMyIntake(row) {
    const athleteId = row && row.athleteId;
    if (!athleteId) return { ok: false, error: new Error('No lifter to save the answers for') };
    const payload = this._inPayload(athleteId, row);
    let bytes = 0;
    try { const j = JSON.stringify(payload.answers); bytes = typeof TextEncoder === 'function' ? new TextEncoder().encode(j).length : j.length; }
    catch (e) { return { ok: false, error: e }; }
    if (bytes > 8192) return { ok: false, tooLong: true, error: new Error('The answers are too long to save. Shorten the longest one.') };
    if (this._inReady !== false) {
      const { data, error } = await sb.from('intake').upsert(payload, { onConflict: 'athlete_id' }).select(_INTAKE_COLS).single();
      if (!error) return { ok: true, intake: mapDbIntake(data) };
      if (!_isNotReady(error)) return { ok: false, error, tooLong: error.code === '23514' || /intake_answers_check/.test(String(error.message || '')) };
      this._inReady = false;
    }
    const old = this._inLocal(athleteId);
    const intake = { athleteId, coachId: row.coachId !== undefined ? (row.coachId || null) : (old ? old.coachId || null : null), answers: payload.answers,
      submittedAt: 'submitted_at' in payload ? payload.submitted_at : (old ? old.submittedAt || null : null), updatedAt: new Date().toISOString(), local: true };
    this._inLocal(athleteId, intake);
    return { ok: true, intake, local: true };
  },
  async listIntakes(coachId, athleteIds) {
    if (!coachId) return [];
    if (Array.isArray(athleteIds) && !athleteIds.length) return [];
    let q = sb.from('intake').select(_INTAKE_COLS);
    q = Array.isArray(athleteIds) ? q.in('athlete_id', athleteIds) : q.neq('athlete_id', coachId);
    const { data, error } = await q.limit(1000);
    if (error) {
      if (_isNotReady(error)) this._inReady = false; else console.warn('listIntakes', error);
      return [];   // a lifter's answers are on their own device until the table exists
    }
    this._inReady = true;
    return (data || []).map(mapDbIntake);
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
    let { data, error } = await sb.from('meets').upsert(mapJsMeet(m)).select('*');
    if (error && !_noMeetPlanCols && _missingCol(error, ['status', 'division', 'weigh_in', 'weigh_in_at'])) {
      _noMeetPlanCols = true;
      ({ data, error } = await sb.from('meets').upsert(mapJsMeet(m)).select('*'));
    }
    if (error) throw error;
    return (data && data.length) ? mapDbMeet(data[0]) : null;
  },
  async deleteMeet(id) {
    const { error } = await sb.from('meets').delete().in('id', [id]);
    if (error) throw error;
  },
  // A coach plans (or moves) a meet for an athlete on their roster: always 'planned', never a
  // result (the server's guard refuses lifts and the weigh-in bodyweight from a coach).
  // → { ok, meet } | { ok: false, notReady } before migration-meet-calendar-2026-10-22.sql.
  async savePlannedMeet(m) {
    const row = mapJsMeet(Object.assign({}, m, { status: 'planned', bodyweight: null }));
    delete row.bodyweight_kg;
    if (_noMeetPlanCols) return { ok: false, notReady: true };
    const q = m.id ? sb.from('meets').update(row).in('id', [m.id]).select('*') : sb.from('meets').insert(row).select('*');
    const { data, error } = await q;
    if (error) {
      const nr = _isNotReady(error) || !!_missingCol(error, ['status', 'division', 'weigh_in', 'weigh_in_at']) || /row-level security/i.test(String(error.message || ''));
      if (nr && _missingCol(error, ['status', 'division', 'weigh_in', 'weigh_in_at'])) _noMeetPlanCols = true;
      return { ok: false, notReady: nr, error };
    }
    if (!data || !data.length) return { ok: false, error: new Error('Meet not found') };
    return { ok: true, meet: mapDbMeet(data[0]) };
  },
  async deletePlannedMeet(id) {
    const { data, error } = await sb.from('meets').delete().in('id', [id]).select('id');
    if (error) return { ok: false, notReady: _isNotReady(error), error };
    return { ok: !!(data && data.length) };
  },
  // The calendar drag: a block's first Monday and/or its meet date, as one narrow compare-and-swap
  // update (a conflict only means the rev moved: dates never clash with sets, so retry on the new
  // rev). dates: { startsOn?, meetDate? } (null clears). → { ok, rev } | { ok: false, notReady }.
  async setProgramDates(prog, dates) {
    if (!prog || !prog.id || _noProgramDates) return { ok: false, notReady: _noProgramDates };
    const patch = {};
    if (dates && dates.startsOn !== undefined) patch.starts_on = _isoOrNull(dates.startsOn);
    if (dates && dates.meetDate !== undefined) patch.meet_date = _isoOrNull(dates.meetDate);
    if (!Object.keys(patch).length) return { ok: true, rev: prog.rev };
    let rev = prog.rev;
    for (let i = 0; i < 4; i++) {
      const row = Object.assign({}, patch);
      if (!_noProgramRev && typeof rev === 'number') row.rev = rev;
      const { data, error } = await sb.from('programs').update(row).in('id', [prog.id]).select(_noProgramRev ? 'id' : 'id, rev');
      if (error && _missingCol(error, ['starts_on', 'meet_date'])) { _noProgramDates = true; return { ok: false, notReady: true }; }
      if (error && _isRevConflict(error)) { const t = await this.getProgramRow(prog.id); if (!t) return { ok: false, error }; rev = t.rev; continue; }
      if (error) return { ok: false, error };
      if (!data || !data.length) return { ok: false, error: new Error('Program not found') };
      // The program (and this device's base for its dates) now carries the new dates and rev.
      const nrev = data[0].rev != null ? Number(data[0].rev) : undefined;
      if ('starts_on' in patch) prog.startsOn = patch.starts_on;
      if ('meet_date' in patch) prog.meetDate = patch.meet_date;
      // Only when nothing else landed in between (a retry means the weeks may have moved: the
      // next save must still meet that change as a conflict and merge it).
      if (typeof nrev === 'number' && i === 0 && prog.rev === rev) prog.rev = nrev;
      const db = _progDatesBase[prog.id] || (_progDatesBase[prog.id] = { startsOn: null, meetDate: null });
      if ('starts_on' in patch) db.startsOn = patch.starts_on;
      if ('meet_date' in patch) db.meetDate = patch.meet_date;
      return { ok: true, rev: nrev };
    }
    return { ok: false, error: new Error('The program kept changing') };
  },

  // ---------- TEAM PROGRAMS (migration-team-programs-2026-10-22.sql) ----------
  // Until the migration runs, a coach's teams live on this device (localStorage, per coach) with
  // local: true, and a push is one compare-and-swap program save per lifter (upsertProgram merges
  // and keeps logged sets on a conflict). The next load after the migration moves them up.
  _tmKey(coachId) { return 'powa-teams-' + coachId; },
  _tmLocal(coachId, list) {
    try {
      if (list === undefined) return JSON.parse(localStorage.getItem(this._tmKey(coachId)) || '[]') || [];
      if (!list.length) localStorage.removeItem(this._tmKey(coachId)); else localStorage.setItem(this._tmKey(coachId), JSON.stringify(list));
    } catch (e) {}
    return list || [];
  },
  _mapTeam(r, members) {
    return { id: r.id, coachId: r.coach_id, name: r.name || 'Team', programName: r.program_name || '', weeks: Array.isArray(r.weeks) ? r.weeks : [],
      startsOn: r.starts_on || null, meetDate: r.meet_date || null, rev: Number(r.rev) || 0, createdAt: r.created_at, updatedAt: r.updated_at,
      members: (members || []).filter(m => m.group_id === r.id).map(m => ({ athleteId: m.athlete_id, programId: m.program_id || null,
        pushedRev: m.pushed_rev == null ? null : Number(m.pushed_rev), pushedAt: m.pushed_at || null, addedAt: m.added_at })) };
  },
  async listTeams(coachId) {
    const g = await sb.from('program_groups').select('*').eq('coach_id', coachId).order('created_at', { ascending: true });
    if (g.error) {
      if (_isNotReady(g.error)) this._teamsReady = false; else console.warn('listTeams', g.error);
      return this._tmLocal(coachId).map(t => Object.assign(t, { local: true }));
    }
    this._teamsReady = true;
    const ids = (g.data || []).map(r => r.id);
    const m = ids.length ? await sb.from('program_group_members').select('*').in('group_id', ids) : { data: [] };
    const out = (g.data || []).map(r => this._mapTeam(r, m.data || []));
    // Teams kept on this device before the migration: up they go (members who left are skipped).
    const loc = this._tmLocal(coachId);
    if (loc.length) {
      const left = [];
      for (const t of loc) {
        const up = await sb.from('program_groups').insert({ id: t.id, coach_id: coachId, name: t.name, program_name: t.programName || '', weeks: t.weeks || [],
          starts_on: t.startsOn || null, meet_date: t.meetDate || null }).select('*').single();
        if (up.error) { left.push(t); continue; }
        // One by one (as addTeamMembers): a lifter who left meanwhile, or is on another team, is
        // refused alone; everyone else still comes up with the team.
        const got = [];
        for (const x of (t.members || [])) {
          const one = await sb.from('program_group_members').insert({ group_id: t.id, athlete_id: x.athleteId, coach_id: coachId, program_id: x.programId || null }).select('*');
          if (one.error) console.warn('listTeams: member not moved up', x.athleteId, one.error.message);
          else got.push(...(one.data || []));
        }
        out.push(this._mapTeam(up.data, got));
      }
      this._tmLocal(coachId, left);
      left.forEach(t => out.push(Object.assign(t, { local: true })));
    }
    return out;
  },
  // New team (no rev yet) or a master edit (compare-and-swap on rev). → { ok, team } |
  // { ok: false, conflict: true, latest } when someone saved the master meanwhile.
  async saveTeam(team) {
    if (!team || !team.coachId) return { ok: false, error: new Error('No coach') };
    const row = { name: String(team.name || 'Team').slice(0, 80), program_name: String(team.programName || '').slice(0, 120), weeks: team.weeks || [],
      starts_on: _isoOrNull(team.startsOn), meet_date: _isoOrNull(team.meetDate) };
    if (this._teamsReady === false || team.local) {
      const list = this._tmLocal(team.coachId);
      const i = list.findIndex(t => t.id === team.id);
      const saved = Object.assign({}, team, { id: team.id || _dbUuid(), rev: (Number(team.rev) || 0) + (i >= 0 ? 1 : 0), local: true, members: team.members || [] });
      if (i >= 0) list[i] = saved; else list.push(saved);
      this._tmLocal(team.coachId, list);
      return { ok: true, team: saved, local: true };
    }
    const isNew = typeof team.rev !== 'number';
    const q = isNew
      ? sb.from('program_groups').insert(Object.assign({ id: team.id || _dbUuid(), coach_id: team.coachId }, row)).select('*').single()
      : sb.from('program_groups').update(Object.assign({ rev: team.rev }, row)).eq('id', team.id).select('*').single();
    const { data, error } = await q;
    if (error && _isNotReady(error)) { this._teamsReady = false; return this.saveTeam(team); }
    if (error && _isRevConflict(error)) {
      const latest = await sb.from('program_groups').select('*').eq('id', team.id).single();
      return { ok: false, conflict: true, latest: latest.data ? this._mapTeam(latest.data, []) : null, error };
    }
    if (error) return { ok: false, error };
    return { ok: true, team: Object.assign(this._mapTeam(data, []), { members: team.members || [] }) };
  },
  async deleteTeam(team) {
    if (this._teamsReady === false || team.local) { this._tmLocal(team.coachId, this._tmLocal(team.coachId).filter(t => t.id !== team.id)); return { ok: true, local: true }; }
    const { error } = await sb.from('program_groups').delete().eq('id', team.id);
    return error ? { ok: false, error } : { ok: true };
  },
  // Add lifters (their programs stay theirs until the first push). → { ok, added: [ids], refused: [{ athleteId, reason }] }
  async addTeamMembers(team, athleteIds) {
    const ids = Array.from(new Set(athleteIds || [])).filter(Boolean);
    if (this._teamsReady === false || team.local) {
      const list = this._tmLocal(team.coachId);
      const t = list.find(x => x.id === team.id) || Object.assign({}, team, { members: [] });
      const taken = new Set(list.filter(x => x.id !== team.id).flatMap(x => (x.members || []).map(m => m.athleteId)));
      const added = [], refused = [];
      ids.forEach(a => { if (taken.has(a)) refused.push({ athleteId: a, reason: 'other-team' }); else if (!(t.members || []).some(m => m.athleteId === a)) { (t.members = t.members || []).push({ athleteId: a, programId: null }); added.push(a); } });
      if (!list.some(x => x.id === team.id)) list.push(t);
      this._tmLocal(team.coachId, list);
      return { ok: true, added, refused, local: true };
    }
    const added = [], refused = [];
    for (const a of ids) {
      const { error } = await sb.from('program_group_members').insert({ group_id: team.id, athlete_id: a, coach_id: team.coachId });
      if (!error) added.push(a);
      else refused.push({ athleteId: a, reason: /duplicate|unique/i.test(String(error.message)) ? 'other-team' : (/row-level/i.test(String(error.message)) ? 'not-on-roster' : 'error') });
    }
    return { ok: true, added, refused };
  },
  async removeTeamMember(team, athleteId) {
    if (this._teamsReady === false || team.local) {
      const list = this._tmLocal(team.coachId).map(t => t.id === team.id ? Object.assign(t, { members: (t.members || []).filter(m => m.athleteId !== athleteId) }) : t);
      this._tmLocal(team.coachId, list);
      return { ok: true, local: true };
    }
    const { error } = await sb.from('program_group_members').delete().eq('group_id', team.id).eq('athlete_id', athleteId);
    return error ? { ok: false, error } : { ok: true };
  },
  // The push (app.js pushTeamProgram builds the rows with teamPushPlan). rebuild(athleteId, fresh)
  // makes a lifter's row again from their fresh program when theirs moved meanwhile (a 'stale'
  // row): up to 3 rounds. → { results: [{ athlete_id, status, program_id, rev, weeks, retried,
  // loggedDuring }], local }. Throws { conflict: true } when the master moved (save, then push).
  // archive(prog) → { kept }: keeps a program with logged sets as a past block (app.js
  // archiveProgramIfTrained). Only the pre-migration path uses it; the RPC keeps the block itself,
  // in the push's own transaction, and says so with result.archived (the block's id).
  async pushTeamPrograms(team, rows, rebuild, archive) {
    const logged = (weeks) => { let n = 0; (weeks || []).forEach(w => (w.days || []).forEach(d => (d.exercises || []).forEach(e => (e.sets || []).forEach(s => { if (s.completed || s.skipped || s.missed) n++; })))); return n; };
    const toRpc = (r) => ({ athlete_id: r.athleteId, program_id: r.programId || r.newId || (r.newId = _dbUuid()), rev: r.rev, weeks: r.weeks, name: r.name,
      create: r.action === 'create', replace: r.action === 'replace', starts_on: _isoOrNull(r.startsOn), meet_date: _isoOrNull(r.meetDate) });
    if (this._teamsReady === false || team.local) return this._pushTeamLocal(team, rows, archive);
    const results = [];
    let pending = rows.slice();
    const meta = {};
    for (let round = 0; round < 4 && pending.length; round++) {
      const { data, error } = await sb.rpc('push_group_programs', { p_group_id: team.id, p_master_rev: team.rev, p_rows: pending.map(toRpc) });
      if (error) {
        if (_isRevConflict(error)) { const e = new Error('The team program changed: save it, then publish'); e.conflict = true; throw e; }
        if (_isNotReady(error)) { this._teamsReady = false; return this._pushTeamLocal(team, pending, archive); }
        throw error;
      }
      const byId = new Map(pending.map(r => [r.athleteId, r]));
      const next = [];
      for (const x of (Array.isArray(data) ? data : [])) {
        const row = byId.get(x.athlete_id);
        if (x.status === 'stale' && row && typeof rebuild === 'function' && round < 3) {
          const fresh = await this.getProgramRow(x.program_id).catch(() => null);
          if (fresh) {
            const again = rebuild(x.athlete_id, fresh);
            meta[x.athlete_id] = { retried: true, loggedDuring: (meta[x.athlete_id] && meta[x.athlete_id].loggedDuring) || logged(fresh.weeks) > logged(row.weeks) };
            if (again && again.action === 'same') { results.push(Object.assign({ athlete_id: x.athlete_id, status: 'same', program_id: fresh.id, rev: fresh.rev }, meta[x.athlete_id])); continue; }
            if (again) { next.push(again); continue; }
          }
        }
        const out = Object.assign({}, x, meta[x.athlete_id] || {});
        if ((x.status === 'updated' || x.status === 'created') && row) {
          out.weeks = row.weeks;
          if (x.kept) { const f = await this.getProgramRow(x.program_id).catch(() => null); if (f) out.weeks = f.weeks; }
        }
        results.push(out);
      }
      pending = next;
    }
    return { results, local: false };
  },
  // Before the migration: each lifter's program is saved with the usual compare-and-swap save,
  // after a live-link check (only lifters still on the roster come back from profiles).
  // A replaced program (not on the team yet) is read fresh, its logged sets kept as a past block
  // (archive), then overwritten with one compare-and-swap write, no merge: a set logged after that
  // read makes it 'stale' (nothing written; the block kept is only a copy). No archive, or it
  // fails: 'needs_archive', nothing written.
  async _pushTeamLocal(team, rows, archive) {
    const ids = rows.map(r => r.athleteId);
    const { data } = await sb.from('profiles').select('id, coach_id').in('id', ids);
    const linked = new Set((data || []).filter(p => p.coach_id === team.coachId).map(p => p.id));
    const anyLogged = (weeks) => (weeks || []).some(w => (w.days || []).some(d => (d.exercises || []).some(e => (e.sets || []).some(s => s && (s.completed || s.skipped || s.missed)))));
    const results = [];
    for (const r of rows) {
      if (!linked.has(r.athleteId)) { results.push({ athlete_id: r.athleteId, status: 'departed' }); continue; }
      if (r.action === 'replace' && r.programId) {
        const fresh = await this.getProgramRow(r.programId).catch(() => null);
        if (!fresh) { results.push({ athlete_id: r.athleteId, status: 'not_found', program_id: r.programId }); continue; }
        if (anyLogged(fresh.weeks)) {
          const a = typeof archive === 'function' ? await archive(fresh).catch(() => null) : null;
          if (!a || !a.kept) { results.push({ athlete_id: r.athleteId, status: 'needs_archive', program_id: r.programId }); continue; }
        }
        const row = { name: r.name, weeks: r.weeks, updated_at: new Date().toISOString() };
        if (!_noProgramRev && typeof fresh.rev === 'number') row.rev = fresh.rev;
        if (!_noProgramDates) { row.starts_on = _isoOrNull(r.startsOn); row.meet_date = _isoOrNull(r.meetDate); }
        let w = await sb.from('programs').update(row).in('id', [r.programId]).select(_noProgramRev ? 'id' : 'id, rev');
        if (w.error && 'starts_on' in row && _missingCol(w.error, ['starts_on', 'meet_date'])) {
          _noProgramDates = true; delete row.starts_on; delete row.meet_date;
          w = await sb.from('programs').update(row).in('id', [r.programId]).select(_noProgramRev ? 'id' : 'id, rev');
        }
        if (w.error && _isRevConflict(w.error)) { results.push({ athlete_id: r.athleteId, status: 'stale', program_id: r.programId }); continue; }
        if (w.error || !w.data || !w.data.length) { results.push({ athlete_id: r.athleteId, status: 'denied', program_id: r.programId, error: w.error ? String(w.error.message || w.error) : 'not written' }); continue; }
        const nrev = w.data[0].rev != null ? Number(w.data[0].rev) : undefined;
        _rememberProgBase({ id: r.programId, name: r.name, weeks: r.weeks, maxes: fresh.maxes, startsOn: row.starts_on, meetDate: row.meet_date });
        results.push({ athlete_id: r.athleteId, status: 'updated', program_id: r.programId, rev: nrev, weeks: r.weeks });
        continue;
      }
      const prog = { id: r.programId || _dbUuid(), athleteId: r.athleteId, coachId: team.coachId, name: r.name, weeks: r.weeks, rev: r.rev == null ? undefined : r.rev,
        startsOn: r.startsOn || undefined, meetDate: r.meetDate || undefined };
      try {
        const res = await this.upsertProgram(prog);
        results.push({ athlete_id: r.athleteId, status: r.programId ? 'updated' : 'created', program_id: prog.id, rev: res && res.rev, weeks: prog.weeks, retried: !!(res && res.merged), loggedDuring: !!(res && res.merged) });
      } catch (e) { results.push({ athlete_id: r.athleteId, status: 'denied', error: String(e && e.message || e) }); }
    }
    return { results, local: true };
  },

  // Several new meets in one insert (the OpenPowerlifting import).
  async addMeets(list) {
    if (!list || !list.length) return [];
    const rows = () => list.map(m => { const r = mapJsMeet(m); delete r.id; return r; });
    let { data, error } = await sb.from('meets').insert(rows()).select('*');
    if (error && !_noMeetPlanCols && _missingCol(error, ['status', 'division', 'weigh_in', 'weigh_in_at'])) {
      _noMeetPlanCols = true;
      ({ data, error } = await sb.from('meets').insert(rows()).select('*'));
    }
    if (error) throw error;
    return (data || []).map(mapDbMeet);
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
  // A coach reads their own questions from the table (RLS). An athlete gets their current coach's
  // active questions meant for them from my_checkin_questions(), which leaves out who else a
  // targeted question went to (migration-security-2026-10-22.sql; before it runs the table
  // policy still serves the athlete, and the RPC 404s). Before the feature's migration everything
  // here returns empty / { ok: false, notReady: true }, so the app simply shows no questions.
  async listCheckinQuestions() {
    const [own, mine] = await Promise.all([
      sb.from('checkin_questions').select('*').order('position', { ascending: true }).order('created_at', { ascending: true }),
      sb.rpc('my_checkin_questions')
    ]);
    if (own.error && !_isNotReady(own.error)) console.warn('listCheckinQuestions', own.error);
    if (mine.error && !_isNotReady(mine.error)) console.warn('my_checkin_questions', mine.error);
    const out = [], seen = new Set();
    [].concat(own.error ? [] : (own.data || []), mine.error ? [] : (mine.data || [])).forEach(r => {
      if (!r || seen.has(r.id)) return;
      seen.add(r.id); out.push(mapDbCheckinQuestion(r));
    });
    return out.sort((a, b) => (a.position - b.position) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
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
    const row = mapJsGoals(g);
    let { error } = await sb.from('goals').upsert(row, { onConflict: 'athlete_id' });
    // Before migration-readiness-cut-2026-10-22.sql there are no cut columns: save the rest.
    if (error && (_missingCol(error, GOAL_CUT_COLS) || _isNotReady(error))) {
      GOAL_CUT_COLS.forEach(c => delete row[c]);
      ({ error } = await sb.from('goals').upsert(row, { onConflict: 'athlete_id' }));
      if (!error) return { cutSaved: false };
    }
    if (error) throw error;
    return { cutSaved: true };
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

  // ---- Voice notes (migration-voice-notes-2026-10-22.sql) ----------------
  // The file goes to the private `voice-notes` bucket at <coach>/<athlete>/<sender>/<id>.<ext>,
  // then the message row points at it. `id` is made on the phone, so a queued note sent twice
  // (an outbox replay) lands once. If the row can't be written the upload is removed again, so
  // a failed send never leaves an orphaned recording behind.
  // Throws an Error with .offline (keep it queued), .notReady (migration not run) or neither.
  voiceNotePath({ coachId, athleteId, senderId, id, mime }) {
    const b = String(mime || '').split(';')[0].trim().toLowerCase();
    const ext = b === 'audio/webm' ? 'webm' : b === 'audio/ogg' ? 'ogg' : b === 'audio/aac' ? 'aac' : 'm4a';
    return coachId + '/' + athleteId + '/' + senderId + '/' + id + '.' + ext;
  },
  _voiceErr(error, fallback) {
    const msg = String((error && (error.message || error.error || error.details)) || fallback || 'voice note failed');
    const e = new Error(msg);
    const status = String((error && (error.statusCode || error.status)) || '');
    e.offline = (typeof navigator !== 'undefined' && navigator.onLine === false) || /failed to fetch|networkerror|network request|load failed|timed? ?out|aborted/i.test(msg);
    e.notReady = !e.offline && (/bucket not found/i.test(msg) || (status === '404' && /bucket/i.test(msg)) || _isNotReady(error));
    e.status = status; e.code = String((error && error.code) || '');
    // A definite no (policy, link gone, file too big / wrong type): retrying can never work.
    // Anything else (5xx, 429, an expired token, unknown) is worth another go later.
    e.refused = !e.offline && (e.notReady || e.code === '42501' || e.code === '23503' || status === '403' || status === '413' || status === '415'
      || /row-level security|violates|payload too large|too large|mime type|not supported/i.test(msg));
    return e;
  },
  async sendVoiceNote({ id, coachId, athleteId, senderId, blob, mime, dur, peaks }) {
    if (!id || !coachId || !athleteId || !senderId || !blob) throw new Error('bad voice note');
    const type = String(mime || blob.type || 'audio/mp4').split(';')[0].trim().toLowerCase();
    const path = this.voiceNotePath({ coachId, athleteId, senderId, id, mime: type });
    let up;
    try { up = await sb.storage.from('voice-notes').upload(path, blob, { contentType: type, upsert: false, cacheControl: '31536000' }); }
    catch (e) { throw this._voiceErr(e); }
    // Already there: a replay of a note whose upload landed last time. Carry on to the row.
    if (up && up.error && !/already exists|duplicate|409/i.test(String(up.error.message || '') + ' ' + String(up.error.statusCode || ''))) throw this._voiceErr(up.error);
    const d = Math.round(Math.max(0.1, Math.min(120, Number(dur) || 0)) * 10) / 10;
    const meta = { type: 'voice', path, dur: d, peaks: (peaks || []).slice(0, 32).map(v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))), mime: type };
    const s = Math.round(d);
    const row = { id, coach_id: coachId, athlete_id: athleteId, sender_id: senderId, body: 'Voice note · ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'), meta };
    let res;
    try { res = await sb.from('messages').insert(row).select('*'); }
    catch (e) { res = { error: e }; }
    if (res.error && /duplicate|unique|23505/i.test(String(res.error.message || '') + ' ' + res.error.code)) {
      const again = await sb.from('messages').select('*').eq('id', id).maybeSingle();
      if (again && again.data) return mapDbMessage(again.data);
    }
    if (res.error) {
      // The row didn't land: take the file back out (best effort; the queue re-uploads on retry).
      try { await sb.storage.from('voice-notes').remove([path]); } catch (e) {}
      throw this._voiceErr(res.error);
    }
    const m = res.data && res.data[0] ? mapDbMessage(res.data[0]) : null;
    if (m && !m.meta) m.meta = meta;
    return m;
  },
  // The newest voice note `senderId` sent in this thread (Train's "voice note" row), or null.
  async latestVoiceFrom(senderId, coachId, athleteId) {
    if (!senderId || !coachId || !athleteId) return null;
    const { data, error } = await sb.from('messages').select('*')
      .eq('coach_id', coachId).eq('athlete_id', athleteId).eq('sender_id', senderId).eq('meta->>type', 'voice')
      .order('created_at', { ascending: false }).limit(1);
    if (error || !data || !data[0]) return null;   // before the migration there's no meta: nothing to show
    return mapDbMessage(data[0]);
  },
  // A short-lived link to play a note (either person on the thread). Cached until near expiry.
  _voiceUrls: {},
  async voiceNoteUrl(path) {
    if (!path) return null;
    const c = this._voiceUrls[path];
    if (c && c.until > Date.now()) return c.url;
    const { data, error } = await sb.storage.from('voice-notes').createSignedUrl(path, 3600);
    if (error || !data) throw this._voiceErr(error, 'no link');
    const url = data.signedUrl || data.signedURL;
    this._voiceUrls[path] = { url, until: Date.now() + 50 * 60000 };
    return url;
  },
  // Account deletion: remove every recording this person made (the storage policy lets only the
  // sender delete; the delete-account function sweeps the other side of their threads).
  async purgeMyVoiceNotes(uid) {
    return this._removeVoicePaths(await this._myVoicePaths(uid));
  },
  async _myVoicePaths(uid) {
    if (!uid) return [];
    try {
      const { data, error } = await sb.from('messages').select('meta').eq('sender_id', uid).eq('meta->>type', 'voice').limit(5000);
      if (error) return [];
      return (data || []).map(r => r.meta && r.meta.path).filter(p => typeof p === 'string' && p.indexOf(uid + '/') > 0);
    } catch (e) { return []; }
  },
  async _removeVoicePaths(paths) {
    paths = paths || [];
    for (let i = 0; i < paths.length; i += 100) {
      try { await sb.storage.from('voice-notes').remove(paths.slice(i, i + 100)); } catch (e) {}
    }
    return paths.length;
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
      // The coach's last week's note (weekly-note.js), so another device knows it went.
      if (!t.weeklyAt && m.senderId === coachId && m.meta && m.meta.weekly) t.weeklyAt = m.createdAt;
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
      checkins: [], meets: [], checkinQuestions: [], checkinAnswers: [], programBlocks: [], painReports: [],
      marketplacePrograms: [], mySales: [], myPurchases: [],
      // Clients + payments (coach only, never the athlete's) and the intake (the athlete's own; their coach's roster's).
      clientBilling: [], clientPayments: [], intakes: []
    };
    // Custom check-in answers: the last 10 weeks is plenty for "today", "this week" and averages.
    const _ciSince = (() => { const d = new Date(); d.setDate(d.getDate() - 70); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();

    // The coach directory (public) loads beside everything else, never in front of it.
    const coachesP = this.listCoaches().catch((e) => { console.warn('coach list', e); return []; });

    if (!profile) { empty.coaches = await coachesP; return empty; }

    if (profile.user_type === 'coach') {
      // Coach: the roster, and beside it everything that doesn't need the roster's ids.
      const ownP = Promise.all([this.listInvites(profile.id), this.listProgramsForCoach(profile.id), this.listTemplates(profile.id)]);
      const ath = await this.listAthletesForCoach(profile.id);
      empty.athletes = ath;
      const athleteIds = ath.map(a => a.id);
      const [[invs, programs, tpls], logs, bw, notes, goals, checkins, meets, mp, sales, ciQs, ciAs, blocks, healthDaily, painReports, nutritionDaily, coachNotes, teams, clientBilling, clientPayments, intakes] = await Promise.all([
        ownP,
        this.listLogsForAthletes(athleteIds),
        this.listBwForAthletes(athleteIds),
        this.listNotesForAthletes(athleteIds),
        this.listGoalsForAthletes(athleteIds),
        this.listCheckinsForAthletes(athleteIds),
        this.listMeetsForAthletes(athleteIds),
        this.listMyPublishedPrograms(profile.id).catch(() => []),
        this.listMySales(profile.id).catch(() => []),
        this.listCheckinQuestions().catch(() => []),
        this.listCheckinAnswers(_ciSince).catch(() => []),
        this.listProgramBlocks(athleteIds).catch(() => []),
        this.listHealthDaily(athleteIds).catch(() => []),
          this.listPainReports(athleteIds).catch(() => []),
          this.listNutritionDaily(athleteIds).catch(() => []),
          this.listCoachNotes(profile.id).catch(() => []),
          this.listTeams(profile.id).catch(() => []),
          this.listClientBilling(profile.id).catch(() => []),
          this.listClientPayments(profile.id).catch(() => []),
          this.listIntakes(profile.id, athleteIds).catch(() => [])
        ]);
        empty.clientBilling = clientBilling;
        empty.clientPayments = clientPayments;
        empty.intakes = intakes;
        empty.teams = teams;
        empty.healthDaily = healthDaily;
        empty.nutritionDaily = nutritionDaily;
        empty.painReports = painReports;
        empty.coachNotes = coachNotes;
      empty.checkinQuestions = ciQs;
      empty.checkinAnswers = ciAs;
      empty.programBlocks = blocks;
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
      empty.coaches = await coachesP;
    } else {
      // Athlete: own data
      const [progs, logs, bw, notes, goals, rest, checkins, meets, purchases, ciQs, ciAs, blocks, brand, painReports, intake] = await Promise.all([
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
        profile.coach_id ? this.listCheckinAnswers(_ciSince).catch(() => []) : Promise.resolve([]),
        this.listProgramBlocks([profile.id]).catch(() => []),
        profile.coach_id ? this.getMyCoachBrand().catch(() => null) : Promise.resolve(null),
        this.listPainReports([profile.id]).catch(() => []),
        this.getMyIntake(profile.id).catch(() => null)
      ]);
      // The intake questionnaire: their own answers only (never another lifter's, never billing).
      empty.intakes = intake ? [intake] : [];
      empty.coachBrand = brand;
      empty.painReports = painReports;
      empty.programBlocks = blocks;
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
      empty.coaches = await coachesP;

      // Athlete also needs to see their own profile + their coach
      empty.athletes = [mapDbProfileToAthlete(profile)];
      // Coach already in coaches list from listCoaches()
    }

    return empty;
  }
};

window.DB = DB;
window.sb = sb;

// ---------- SWITCH KIT hook (switch-kit.js · sql/migration-history-import-2026-10-22.sql) ----------
// History import and the full export. Before the migration runs, an import answers
// { notReady: true } and nothing is written; the export works either way.
Object.assign(DB, {
  // Every row of `table` the signed-in user may read, 1,000 at a time (one API read is
  // capped). col + ids filter (e.g. athlete_id in the roster); RLS decides the rest.
  // → { rows } | { missing: true } (the table isn't there yet) | { error }
  async skListAll(table, col, ids, order) {
    const PAGE = 1000, rows = [];
    let orders = [order, 'id'].filter(Boolean);
    for (let from = 0; from < 500000; from += PAGE) {
      let q = sb.from(table).select('*');
      if (col) q = q.in(col, ids || []);
      orders.forEach(o => { q = q.order(o, { ascending: true }); });
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) {
        if (from === 0 && orders.includes('id') && _missingCol(error, ['id'])) { orders = orders.filter(o => o !== 'id'); from -= PAGE; continue; }
        if (/42P01|PGRST205|does not exist|could not find the table/i.test(String(error.code) + ' ' + String(error.message))) return { missing: true };
        console.warn('skListAll', table, error);
        return { error };
      }
      rows.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    return { rows };
  },
  // Imported sets, 250 per request. A set whose import key the athlete already has is
  // skipped by the server (ON CONFLICT DO NOTHING), so a file imported twice adds nothing.
  // → { ok, notReady, insertedIds }
  async skImportLogs(logs, onProgress) {
    const insertedIds = [];
    for (let i = 0; i < logs.length; i += 250) {
      const rows = logs.slice(i, i + 250).map(l => Object.assign(mapJsLog(l), { source: 'import', import_key: l.importKey, imported_by: l.importedBy || null }));
      const { data, error } = await sb.from('workout_logs').upsert(rows, { onConflict: 'athlete_id,import_key', ignoreDuplicates: true }).select('id');
      if (error) {
        const notReady = _isNotReady(error) || !!_missingCol(error, ['source', 'import_key', 'imported_by']) || /42P10|no unique or exclusion constraint/i.test(String(error.code) + ' ' + String(error.message));
        if (!notReady) console.warn('skImportLogs', error);
        return { ok: false, notReady, error, insertedIds };
      }
      (data || []).forEach(r => insertedIds.push(r.id));
      if (onProgress) onProgress(Math.min(logs.length, i + 250));
    }
    return { ok: true, insertedIds };
  },
  // Takes an import back out (Undo, or "Remove the sets this file imported"). Only rows
  // marked as imported; the coach's delete policy also limits it to rows they imported.
  async skRemoveImported(athleteId, ids) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from('workout_logs').delete().in('athlete_id', [athleteId]).eq('source', 'import').in('id', ids.slice(i, i + 200));
      if (error) { console.warn('skRemoveImported', error); return { ok: false, error }; }
    }
    return { ok: true };
  },
  // A past block from a sheet, keyed so the same sheet can't be kept twice. Without the
  // migration's import_key column it falls back to a plain past block.
  async skAddImportedBlock(b) {
    const row = { athlete_id: b.athleteId, coach_id: b.coachId || null, name: String(b.name || 'Block').slice(0, 120), weeks: b.weeks || [], maxes: b.maxes || null,
      stats: b.stats || null, started_on: b.startedOn || null, ended_on: b.endedOn || null, import_key: b.importKey || null };
    const { data, error } = await sb.from('program_blocks').insert(row).select(_BLOCK_COLS).single();
    if (error) {
      if (String(error.code) === '23505') return { ok: false, duplicate: true };
      if (_missingCol(error, ['import_key'])) {
        // No key column yet: refuse a block this athlete already has under the same name
        // with the same sets and sessions (the same sheet kept twice).
        const have = await this.skBlockKeys(b.athleteId);
        const st = b.stats || {};
        if (have.some(x => x.name === row.name && x.stats && x.stats.sets === st.sets && x.stats.sessions === st.sessions)) return { ok: false, duplicate: true };
        return this.addProgramBlock(b);
      }
      return { ok: false, notReady: _isNotReady(error), error };
    }
    return { ok: true, block: Object.assign(mapDbBlock(data), { weeks: b.weeks || [] }) };
  },
  // The athlete's past blocks without their weeks, with import_key once the migration
  // has run (the desk's block list doesn't read it). → [{ id, name, stats, started_on, import_key }]
  async skBlockKeys(athleteId) {
    let cols = 'id, name, stats, started_on, import_key';
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data, error } = await sb.from('program_blocks').select(cols).eq('athlete_id', athleteId).limit(1000);
      if (!error) return data || [];
      if (attempt === 0 && _missingCol(error, ['import_key'])) { cols = 'id, name, stats, started_on'; continue; }
      if (!_isNotReady(error)) console.warn('skBlockKeys', error);
      return [];
    }
    return [];
  }
});

// ---------- VIDEO REVIEW hook (video-review.js · sql/migration-form-check-annotations-2026-10-22.sql) ----------
// The coach's drawings on a form check: one row per clip (drawings normalised 0–1 with a frame
// time each, judging tags, a short caption, the compare align mark). Until the migration runs,
// a coach's review is kept on their own device (localStorage) and the lifter sees the written
// reply only; { local: true } tells the review tool to say so.
function mapDbFcAnnotation(r) {
  return { id: r.id, formCheckId: r.form_check_id, coachId: r.coach_id, drawings: Array.isArray(r.drawings) ? r.drawings : [],
    tags: r.tags || [], note: r.note || '', alignT: r.align_t == null ? null : Number(r.align_t), updatedAt: r.updated_at };
}
function _fcaLocal(fcId, doc) {
  const k = 'powa-fca-' + fcId;
  try {
    if (doc === undefined) { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; }
    localStorage.setItem(k, JSON.stringify(doc)); return doc;
  } catch (e) { return null; }
}
Object.assign(DB, {
  // → { ok, notReady, doc|null }
  async getFormCheckAnnotations(formCheckId) {
    if (!formCheckId) return { ok: false, doc: null };
    const { data, error } = await sb.from('form_check_annotations').select('*').eq('form_check_id', formCheckId).limit(1);
    if (error) {
      const notReady = _isNotReady(error);
      if (!notReady) console.warn('getFormCheckAnnotations', error);
      return { ok: false, notReady, doc: notReady ? _fcaLocal(formCheckId) : null };
    }
    if (data && data[0]) return { ok: true, doc: mapDbFcAnnotation(data[0]) };
    return { ok: true, doc: _fcaLocal(formCheckId) };   // a review made on this device before the table existed
  },
  // doc: { formCheckId, coachId, drawings, tags, note, alignT } → { ok, local?, notReady?, doc?, error? }
  async saveFormCheckAnnotations(doc) {
    const row = { form_check_id: doc.formCheckId, coach_id: doc.coachId, drawings: doc.drawings || [], tags: doc.tags || [],
      note: (doc.note || '').trim() || null, align_t: doc.alignT == null ? null : doc.alignT };
    const { data, error } = await sb.from('form_check_annotations').upsert(row, { onConflict: 'form_check_id' }).select('*');
    if (error) {
      if (_isNotReady(error)) { _fcaLocal(doc.formCheckId, doc); return { ok: false, local: true, notReady: true }; }
      console.warn('saveFormCheckAnnotations', error);
      return { ok: false, error };
    }
    try { localStorage.removeItem('powa-fca-' + doc.formCheckId); } catch (e) {}
    return { ok: true, doc: data && data[0] ? mapDbFcAnnotation(data[0]) : null };
  },
  // Just the compare align mark on another clip (keeps its drawings as they are).
  async saveFormCheckAlign(formCheckId, coachId, alignT) {
    const { error } = await sb.from('form_check_annotations')
      .upsert({ form_check_id: formCheckId, coach_id: coachId, align_t: alignT == null ? null : alignT }, { onConflict: 'form_check_id' });
    if (error && !_isNotReady(error)) console.warn('saveFormCheckAlign', error);
    return { ok: !error };
  }
});

// ---------- MEET DAY hook (meetday.js · sql/migration-meet-day-2026-10-22.sql) ----------
// Attempt plans ride on the planned meet (meets.attempt_plan). The board is three tables; marks go up
// through meet_day_sync (the per-cell rule lives there and in meetday.js localWins) and the results
// through finish_meet_day. Every call answers { ok, notReady } instead of throwing, so the board can stay
// local-first: before the migration runs it lives on the device (meetday.js) and Finish waits.
let _noAttemptPlan = false;
function mapDbMeetDay(r) {
  return { id: r.id, coachId: r.coach_id, name: r.name || 'Meet', date: r.meet_date, federation: r.federation || '', division: r.division || '',
    status: r.status || 'setup', flights: (r.flights && typeof r.flights === 'object') ? r.flights : {}, sec: Number(r.sec_per_attempt) || 60,
    breakSec: r.break_sec == null ? 600 : Number(r.break_sec), finishedAt: r.finished_at || null, createdAt: r.created_at, updatedAt: r.updated_at };
}
function mapDbMdLifter(r) {
  const n = (v) => (v == null ? null : Number(v));
  return { id: r.id, dayId: r.meet_day_id, athleteId: r.athlete_id || null, meetId: r.meet_id || null, name: r.name || '', sex: r.sex || null,
    flight: r.flight || 'A', lot: n(r.lot), bodyweight: n(r.bodyweight_kg), weightClass: r.weight_class || '',
    rack: (r.rack && typeof r.rack === 'object') ? r.rack : {}, live: (r.live && typeof r.live === 'object') ? r.live : null, resultMeetId: r.result_meet_id || null };
}
function mapDbMdAttempt(r) {
  return { id: r.id, lifterId: r.lifter_id || r.lifterId, lift: r.lift, n: Number(r.n), kg: r.kg == null ? null : Number(r.kg), status: r.status || 'planned',
    changes: Number(r.changes) || 0, at: Number(r.client_at != null ? r.client_at : r.at) || 0, srvAt: r.updated_at || r.srvAt || null, by: r.updated_by || r.by || null };
}
function mapJsMdLifter(l, dayId) {
  const kg = Number(l.bodyweight);
  const out = { meet_day_id: dayId || l.dayId, athlete_id: l.athleteId || null, meet_id: l.meetId || null, name: String(l.name || 'Lifter').trim().slice(0, 80),
    sex: l.sex === 'male' || l.sex === 'female' ? l.sex : null, flight: /^[A-Z]$/.test(String(l.flight || '')) ? l.flight : 'A',
    lot: Number(l.lot) >= 1 && Number(l.lot) <= 999 ? Math.round(Number(l.lot)) : null,
    bodyweight_kg: kg >= 20 && kg <= 300 ? Math.round(kg * 100) / 100 : null, weight_class: String(l.weightClass || '').slice(0, 12),
    rack: l.rack && typeof l.rack === 'object' ? l.rack : {} };
  if (l.id && !String(l.id).startsWith('local-')) out.id = l.id;
  return out;
}
Object.assign(DB, {
  _mdMap: { day: mapDbMeetDay, lifter: mapDbMdLifter, attempt: mapDbMdAttempt },
  // The coach's plan for one planned meet. → { ok, meet } | { ok: false, notReady }.
  async saveAttemptPlan(meetId, plan) {
    if (_noAttemptPlan) return { ok: false, notReady: true };
    const { data, error } = await sb.from('meets').update({ attempt_plan: plan || null }).in('id', [meetId]).select('*');
    if (error) {
      const nr = _isNotReady(error) || !!_missingCol(error, ['attempt_plan']);
      if (nr) _noAttemptPlan = true;
      return { ok: false, notReady: nr, error };
    }
    if (!data || !data.length) return { ok: false, error: new Error('Meet not found') };
    return { ok: true, meet: mapDbMeet(data[0]) };
  },
  async listMeetDays() {
    const { data, error } = await sb.from('meet_days').select('*').order('meet_date', { ascending: false }).limit(60);
    if (error) return { ok: false, notReady: _isNotReady(error), days: [] };
    return { ok: true, days: (data || []).map(mapDbMeetDay) };
  },
  async getMeetDay(id) {
    const [d, l, a] = await Promise.all([
      sb.from('meet_days').select('*').in('id', [id]).limit(1),
      sb.from('meet_day_lifters').select('*').eq('meet_day_id', id),
      sb.from('meet_attempts').select('*').eq('meet_day_id', id)
    ]);
    const err = d.error || l.error || a.error;
    if (err) return { ok: false, notReady: _isNotReady(err), error: err };
    if (!d.data || !d.data.length) return { ok: false, error: new Error('Meet day not found') };
    return { ok: true, day: mapDbMeetDay(d.data[0]), lifters: (l.data || []).map(mapDbMdLifter), attempts: (a.data || []).map(mapDbMdAttempt) };
  },
  // A new board, made on the device (meetday.js startMeetDay): the day and its lifters carry the ids
  // the device made, so a retry after a lost answer is a no-op (on conflict do nothing) and marks made
  // meanwhile are already keyed to these rows. The planned attempts go up through meet_day_sync like
  // any mark (the board's outbox), never here. → { ok } | { ok: false, notReady?, error }
  async createMeetDay(day, lifters) {
    const row = { id: day.id, name: String(day.name || 'Meet').slice(0, 80), meet_date: day.date,
      federation: String(day.federation || '').slice(0, 40), division: String(day.division || '').slice(0, 80), flights: day.flights || {},
      sec_per_attempt: Math.max(30, Math.min(300, Number(day.sec) || 60)) };
    if (day.breakSec != null) row.break_sec = Math.max(0, Math.min(3600, Math.round(Number(day.breakSec) || 0)));
    try {
      const d = await sb.from('meet_days').upsert(row, { onConflict: 'id', ignoreDuplicates: true });
      if (d.error) return { ok: false, notReady: _isNotReady(d.error), error: d.error };
      const rows = (lifters || []).map(l => mapJsMdLifter(l, day.id));
      if (rows.length) {
        const ins = await sb.from('meet_day_lifters').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
        if (ins.error) return { ok: false, notReady: _isNotReady(ins.error), error: ins.error };
      }
      return { ok: true };
    } catch (e) { return { ok: false, offline: true, error: e }; }
  },
  async updateMeetDay(id, patch) {
    const row = {};
    if (patch.name !== undefined) row.name = String(patch.name || 'Meet').slice(0, 80);
    if (patch.date !== undefined) row.meet_date = patch.date;
    if (patch.federation !== undefined) row.federation = String(patch.federation || '').slice(0, 40);
    if (patch.division !== undefined) row.division = String(patch.division || '').slice(0, 80);
    if (patch.flights !== undefined) row.flights = patch.flights || {};
    if (patch.sec !== undefined) row.sec_per_attempt = Math.max(30, Math.min(300, Number(patch.sec) || 60));
    if (patch.breakSec !== undefined && patch.breakSec != null) row.break_sec = Math.max(0, Math.min(3600, Math.round(Number(patch.breakSec) || 0)));
    try {
      const { data, error } = await sb.from('meet_days').update(row).in('id', [id]).select('*');
      if (error) return { ok: false, notReady: _isNotReady(error), error };
      return { ok: !!(data && data.length), day: data && data[0] ? mapDbMeetDay(data[0]) : null };
    } catch (e) { return { ok: false, offline: true, error: e }; }
  },
  // A lifter added at the table (a guest from another team), with the id the device made.
  async insertMeetDayLifter(l, dayId) {
    try {
      const { error } = await sb.from('meet_day_lifters').upsert(mapJsMdLifter(l, dayId), { onConflict: 'id', ignoreDuplicates: true });
      if (error) return { ok: false, notReady: _isNotReady(error), error };
      return { ok: true };
    } catch (e) { return { ok: false, offline: true, error: e }; }
  },
  // Only the fields this laptop changed (meetday.js lifterPatch: name, sex, flight, lot, bodyweight,
  // weightClass, rack keys). Rack keys merge on the server, so two laptops never undo each other.
  async patchMeetDayLifter(id, dayId, patch) {
    const p = {};
    const map = { name: 'name', sex: 'sex', flight: 'flight', lot: 'lot', bodyweight: 'bodyweight_kg', weightClass: 'weight_class' };
    Object.keys(map).forEach(k => { if (patch && patch[k] !== undefined) p[map[k]] = patch[k] == null ? null : patch[k]; });
    if (p.bodyweight_kg != null) { const kg = Number(p.bodyweight_kg); p.bodyweight_kg = kg >= 20 && kg <= 300 ? Math.round(kg * 100) / 100 : null; }
    if (p.lot != null) { const n = Math.round(Number(p.lot)); p.lot = n >= 1 && n <= 999 ? n : null; }
    if (p.weight_class != null) p.weight_class = String(p.weight_class).slice(0, 12);
    if (patch && patch.rack && typeof patch.rack === 'object') {
      p.rack = {}; Object.keys(patch.rack).slice(0, 12).forEach(k => { p.rack[String(k).slice(0, 16)] = String(patch.rack[k] == null ? '' : patch.rack[k]).slice(0, 8); });
    }
    try {
      const { data, error } = await sb.rpc('meet_day_lifter_patch', { p_id: id, p_patch: p });
      if (error) return { ok: false, notReady: _isNotReady(error), error };
      return { ok: !!data, lifter: data ? mapDbMdLifter(data) : null };
    } catch (e) { return { ok: false, offline: true, error: e }; }
  },
  async deleteMeetDayLifter(id) {
    try {
      const { error } = await sb.from('meet_day_lifters').delete().in('id', [id]);
      return { ok: !error, error };
    } catch (e) { return { ok: false, offline: true, error: e }; }
  },
  // The outbox. cells: [{ lifterId, lift, n, kg, status, changes, at, base }]; live: [{ id, live }].
  // → { ok, cells: [rows as the server kept them] } | { ok: false, offline?, notReady?, error }.
  async syncMeetDay(dayId, cells, live) {
    try {
      const { data, error } = await sb.rpc('meet_day_sync', { p_day: dayId, p_cells: cells || [], p_live: live || null });
      if (error) return { ok: false, notReady: _isNotReady(error), finished: /finished/i.test(String(error.message || '')), error };
      return { ok: true, cells: ((data && data.cells) || []).map(mapDbMdAttempt), at: data && data.at };
    } catch (e) { return { ok: false, offline: true, error: e }; }
  },
  async finishMeetDay(dayId) {
    try {
      const { data, error } = await sb.rpc('finish_meet_day', { p_day: dayId });
      if (error) return { ok: false, notReady: _isNotReady(error), error };
      return Object.assign({ ok: true }, data || {});
    } catch (e) { return { ok: false, offline: true, error: e }; }
  },
  // Live marks from another device at the table (RLS decides). onAttempt(row), onLifter(row, gone),
  // onDay(day): a flight start or setting moved, or the meet was finished there. → unsubscribe | null.
  subscribeMeetDay(dayId, onAttempt, onLifter, onDay) {
    try {
      const ch = sb.channel('meetday:' + dayId + ':' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meet_attempts', filter: 'meet_day_id=eq.' + dayId },
          p => { try { if (p.new && p.new.id && onAttempt) onAttempt(mapDbMdAttempt(p.new)); } catch (e) { console.warn('meetday attempt', e); } })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meet_day_lifters', filter: 'meet_day_id=eq.' + dayId },
          p => { try {
            if (p.eventType === 'DELETE' && p.old && p.old.id && onLifter) onLifter(mapDbMdLifter(p.old), true);
            else if (p.new && p.new.id && onLifter) onLifter(mapDbMdLifter(p.new));
          } catch (e) { console.warn('meetday lifter', e); } })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'meet_days', filter: 'id=eq.' + dayId },
          p => { try { if (p.new && p.new.id && onDay) onDay(mapDbMeetDay(p.new)); } catch (e) { console.warn('meetday day', e); } })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { console.warn('subscribeMeetDay', e); return null; }
  },
  // The lifter's side: their board rows for days not finished (with the day), and their own attempts.
  // Only this lifter's own rows (a coach's account would otherwise read its lifters' rows through the
  // coach policy), only days not finished (filtered in the query, before any limit), newest day first.
  async myMeetDay() {
    const uid = await this.getUserId().catch(() => null);
    if (!uid) return { ok: true, lifter: null };
    const { data, error } = await sb.from('meet_day_lifters').select('*, meet_days!inner(*)').eq('athlete_id', uid)
      .neq('meet_days.status', 'done').limit(20);
    if (error) return { ok: false, notReady: _isNotReady(error) };
    const rows = (data || []).filter(r => r.meet_days && r.meet_days.status !== 'done')
      .sort((a, b) => String(b.meet_days.meet_date).localeCompare(String(a.meet_days.meet_date)));
    if (!rows.length) return { ok: true, lifter: null };
    const r = rows[0];
    const at = await sb.from('meet_attempts').select('*').eq('lifter_id', r.id);
    return { ok: true, lifter: mapDbMdLifter(r), day: mapDbMeetDay(r.meet_days), attempts: (at.data || []).map(mapDbMdAttempt) };
  },
  subscribeMyMeetDay(lifterId, onChange) {
    try {
      const ch = sb.channel('mymeetday:' + lifterId + ':' + Math.random().toString(36).slice(2, 8))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meet_day_lifters', filter: 'id=eq.' + lifterId }, p => { if (p.new && onChange) onChange('lifter', mapDbMdLifter(p.new)); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'meet_attempts', filter: 'lifter_id=eq.' + lifterId }, p => { if (p.new && onChange) onChange('attempt', mapDbMdAttempt(p.new)); })
        .subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { return null; }
  }
});

// ---------- LIVE DESK (sql/migration-live-desk-2026-10-22.sql) ----------
// Per signed-in user: a 'prog' channel (programs: the coach's, or the lifter's own, so a set logged
// lands on the desk and a coach's edit reaches the phone) and, for a coach, a 'roster' channel (the
// roster's logged sets, form checks, weekly check-ins, check-in answers, session notes). Two channels
// so programs stay live even if one of the other tables is ever left out of supabase_realtime
// (Realtime refuses a whole join when one binding's table isn't published).
// Every listener is filtered server-side (coach_id, athlete_id or the roster's ids, 100 per listener)
// and Realtime still checks each row against the subscriber's SELECT policies, so a coach only ever
// receives rows of their current lifters. No DELETE listeners: a DELETE can't be filtered or
// RLS-checked, so it would reach every subscriber of the table.
// Rows go to onRow(kind, row, eventType) mapped like the rest of db.js; a program row too big for
// Realtime (or an update that left `weeks` out) arrives as { id, athleteId, coachId, rev, partial: true }
// and app.js fetches it. onStatus(status, info): status is the programs channel's ('live' | 'retry' |
// 'down' | 'paused' | 'off'); info.joined names a channel that just (re)joined, and app.js then
// reads what it may have missed (rows written before the join, or during a gap).
// The channels go on sign-out, 30 s after the tab is hidden (back when it shows) and on pagehide;
// a dropped channel comes back with backoff (1 s, 2 s, 4 s ... 30 s), then every 60 s.
const _LIVE_IN_MAX = 100;            // Realtime's in-filter takes at most 100 values
const _LIVE_HIDE_MS = 30000;
const _LIVE_MAX_TRIES = 8;
const _LIVE_SLOW_MS = 60000;         // after the backoff runs out
const _live = { spec: null, handlers: null, chans: {}, everUp: {}, hideT: null, paused: false, wired: false, status: 'off' };
function _liveNames(spec) { return spec && spec.role === 'coach' ? ['prog', 'roster'] : ['prog']; }
function _liveSetStatus(st, info) {
  _live.status = st;
  try { if (_live.handlers && _live.handlers.onStatus) _live.handlers.onStatus(st, info || {}); } catch (e) { console.warn('live status cb', e); }
}
function _liveDropOne(name) {
  const c = _live.chans[name];
  if (!c) return;
  clearTimeout(c.retryT); c.retryT = null;
  const ch = c.ch;
  c.ch = null;
  if (ch) { try { sb.removeChannel(ch); } catch (e) {} }
}
function _liveDrop() { Object.keys(_live.chans).forEach(_liveDropOne); }
function _liveEmit(kind, row, ev) {
  try { if (_live.handlers && _live.handlers.onRow) _live.handlers.onRow(kind, row, ev); } catch (e) { console.warn('live row cb', kind, e); }
}
function _liveProgramRow(raw) {
  if (!raw || !raw.id) return null;
  if (!Array.isArray(raw.weeks)) return { id: raw.id, athleteId: raw.athlete_id, coachId: raw.coach_id, rev: raw.rev != null ? Number(raw.rev) : undefined, partial: true };
  return _mapDbProgramRow(raw);
}
function _liveOpen() {
  if (!_live.spec || !_live.spec.uid || _live.paused) return;
  _liveNames(_live.spec).forEach(_liveOpenOne);
}
function _liveOpenOne(name) {
  const spec = _live.spec;
  if (!spec || !spec.uid || _live.paused) return;
  const c = _live.chans[name] || (_live.chans[name] = { ch: null, tries: 0, retryT: null, st: 'off' });
  _liveDropOne(name);
  const tag = 'live:' + spec.role + ':' + name + ':' + spec.uid + ':' + Math.random().toString(36).slice(2, 8);
  let ch;
  try {
    ch = sb.channel(tag);
    const on = (table, events, filter, kind, map) => events.forEach(event => {
      ch.on('postgres_changes', { event, schema: 'public', table, filter }, payload => {
        if (c.ch !== ch || !payload || !payload.new) return;
        const row = map(payload.new);
        if (row) _liveEmit(kind, row, payload.eventType || event);
      });
    });
    const UI = ['INSERT', 'UPDATE'];
    if (name === 'prog') {
      on('programs', UI, (spec.role === 'coach' ? 'coach_id=eq.' : 'athlete_id=eq.') + spec.uid, 'program', _liveProgramRow);
    } else {
      on('form_checks', UI, 'coach_id=eq.' + spec.uid, 'formcheck', mapDbFormCheck);
      on('checkin_answers', UI, 'coach_id=eq.' + spec.uid, 'answer', mapDbCheckinAnswer);
      const ids = (spec.athleteIds || []).filter(id => /^[0-9a-f-]{36}$/i.test(String(id)));
      for (let i = 0; i < ids.length; i += _LIVE_IN_MAX) {
        const f = 'athlete_id=in.(' + ids.slice(i, i + _LIVE_IN_MAX).join(',') + ')';
        on('workout_logs', ['INSERT'], f, 'log', mapDbLog);
        on('checkins', UI, f, 'checkin', mapDbCheckin);
        on('session_notes', UI, f, 'note', mapDbNote);
      }
    }
    c.ch = ch;
    ch.subscribe((status) => {
      if (c.ch !== ch) return;   // an old channel closing
      if (status === 'SUBSCRIBED') {
        const resumed = !!_live.everUp[name];
        _live.everUp[name] = true; c.tries = 0; c.st = 'live';
        if (name === 'prog') _live.status = 'live';
        _liveSetStatus(_live.status, { joined: name, resumed });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        _liveRetry(name);
      }
    });
  } catch (e) {
    console.warn('liveSubscribe', name, e);
    if (ch && c.ch !== ch) { try { sb.removeChannel(ch); } catch (e2) {} }
    _liveRetry(name);
  }
}
function _liveRetry(name) {
  _liveDropOne(name);
  const c = _live.chans[name];
  if (!c || !_live.spec || _live.paused) return;
  let wait, st;
  if (c.tries >= _LIVE_MAX_TRIES) { wait = _LIVE_SLOW_MS; st = 'down'; }   // still trying, slowly (and at once on online / show)
  else { wait = Math.min(30000, 1000 * Math.pow(2, c.tries)) + Math.floor(Math.random() * 400); c.tries++; st = 'retry'; }
  c.st = st;
  c.retryT = setTimeout(() => _liveOpenOne(name), wait);
  if (name === 'prog') _liveSetStatus(st, { wait });
}
// Back from hidden / offline: a fresh channel now for any that isn't up (app.js reads what was missed).
function _liveWake() {
  clearTimeout(_live.hideT); _live.hideT = null;
  if (!_live.spec) return;
  const wasPaused = _live.paused;
  _live.paused = false;
  _liveNames(_live.spec).forEach(name => {
    const c = _live.chans[name];
    if (wasPaused || !c || !c.ch || c.st === 'down') { if (c) c.tries = 0; _liveOpenOne(name); }
  });
}
function _livePause() {
  clearTimeout(_live.hideT); _live.hideT = null;
  if (!_live.spec || _live.paused) return;
  _live.paused = true;
  _liveDrop();
  Object.keys(_live.chans).forEach(n => { _live.chans[n].st = 'paused'; });
  _liveSetStatus('paused');
}
function _liveWire() {
  if (_live.wired) return;
  _live.wired = true;
  document.addEventListener('visibilitychange', () => {
    if (!_live.spec) return;
    if (document.visibilityState === 'hidden') { clearTimeout(_live.hideT); _live.hideT = setTimeout(_livePause, _LIVE_HIDE_MS); }
    else _liveWake();
  });
  window.addEventListener('pagehide', () => { if (_live.spec) _livePause(); });
  window.addEventListener('pageshow', (e) => { if (_live.spec && e && e.persisted) _liveWake(); });
  window.addEventListener('online', () => { if (_live.spec && document.visibilityState !== 'hidden') _liveWake(); });
  try { sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') DB.liveUnsubscribe(); }); } catch (e) {}
}
Object.assign(DB, {
  // spec: { role: 'coach' | 'athlete', uid, athleteIds }. handlers: { onRow(kind, row, ev), onStatus(st, info) }.
  // Calling it again replaces the channels (a new roster): never two sets at once. → unsubscribe fn.
  liveSubscribe(spec, handlers) {
    if (!spec || !spec.uid) return () => {};
    _liveWire();
    const same = _live.spec && _live.spec.uid === spec.uid && _live.spec.role === spec.role;
    _liveDrop();
    _live.spec = { role: spec.role === 'coach' ? 'coach' : 'athlete', uid: spec.uid, athleteIds: (spec.athleteIds || []).slice().sort() };
    _live.handlers = handlers || {};
    if (!same) _live.everUp = {};
    _live.chans = {};
    if (document.visibilityState === 'hidden') { _live.paused = true; return () => DB.liveUnsubscribe(); }
    _live.paused = false;
    _liveOpen();
    return () => DB.liveUnsubscribe();
  },
  liveUnsubscribe() {
    clearTimeout(_live.hideT); _live.hideT = null;
    _liveDrop();
    _live.spec = null; _live.handlers = null; _live.everUp = {}; _live.paused = false; _live.chans = {};
    _live.status = 'off';
  },
  // The programs channel's status ('off' | 'live' | 'retry' | 'down' | 'paused'), each channel's, and
  // the roster the channels were built for.
  liveState() {
    const channels = {};
    Object.keys(_live.chans).forEach(n => { channels[n] = _live.chans[n].st; });
    return { status: _live.status, role: _live.spec && _live.spec.role, athleteIds: _live.spec ? _live.spec.athleteIds.slice() : [],
      open: Object.keys(_live.chans).some(n => !!_live.chans[n].ch), channels };
  },
  // Program rows as the server has them now, NOT made this device's base (app.js merges them first):
  // by { coachId } / { athleteId } (all of them), or { ids } (100 per read; throws when a read fails,
  // so app.js can ask again).
  async liveProgramRows(by) {
    if (by && by.ids) {
      const out = [];
      for (let i = 0; i < by.ids.length; i += 100) {
        const { data, error } = await sb.from('programs').select('*').in('id', by.ids.slice(i, i + 100));
        if (error) { const e = new Error('liveProgramRows: ' + (error.message || 'failed')); e.ids = by.ids.slice(i); e.rows = out; throw e; }
        (data || []).forEach(r => out.push(_mapDbProgramRow(r)));
      }
      return out;
    }
    let q = sb.from('programs').select('*');
    if (by && by.coachId) q = q.in('coach_id', [by.coachId]);
    else if (by && by.athleteId) q = q.in('athlete_id', [by.athleteId]);
    else return [];
    const { data, error } = await q;
    if (error) throw new Error('liveProgramRows: ' + (error.message || 'failed'));
    return (data || []).map(_mapDbProgramRow);
  },
  // Just { id, athleteId, rev } of the same programs (the catch-up reads only what moved), or null
  // before programs.rev exists.
  async liveProgramRevs(by) {
    let q = sb.from('programs').select('id, athlete_id, rev');
    if (by && by.coachId) q = q.in('coach_id', [by.coachId]);
    else if (by && by.athleteId) q = q.in('athlete_id', [by.athleteId]);
    else return [];
    const { data, error } = await q;
    if (error) { if (_missingCol(error, ['rev'])) return null; throw new Error('liveProgramRevs: ' + (error.message || 'failed')); }
    return (data || []).map(r => ({ id: r.id, athleteId: r.athlete_id, rev: r.rev == null ? null : Number(r.rev) }));
  },
  // The roster's sets logged since a day (the catch-up after a gap): newest first, read in pages of
  // 1000 (PostgREST's cap) until a short page, at most 20 000 rows. Throws when a read fails.
  async liveLogsSince(athleteIds, sinceIso) {
    if (!athleteIds || !athleteIds.length) return [];
    const out = [], PAGE = 1000;
    for (let i = 0; i < athleteIds.length; i += 200) {
      const chunk = athleteIds.slice(i, i + 200);
      for (let from = 0; from < 20000; from += PAGE) {
        const { data, error } = await sb.from('workout_logs').select('*').in('athlete_id', chunk).gte('date', sinceIso)
          .order('date', { ascending: false }).order('id', { ascending: true }).range(from, from + PAGE - 1);
        if (error) throw new Error('liveLogsSince: ' + (error.message || 'failed'));
        (data || []).forEach(r => out.push(mapDbLog(r)));
        if (!data || data.length < PAGE) break;
      }
    }
    return out;
  }
});
