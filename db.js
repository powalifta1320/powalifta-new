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

if (!window.supabase || !window.supabase.createClient) {
  console.error('Supabase JS not loaded — make sure <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> is included BEFORE db.js');
}
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// MAPPERS — DB row (snake_case) ↔ JS object (camelCase)
// ============================================================
function mapDbProfileToCoach(r) {
  return { id: r.id, name: r.name, email: r.email, bio: r.bio || '', createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now() };
}
function mapDbProfileToAthlete(r) {
  return { id: r.id, name: r.name, email: r.email, coachId: r.coach_id, createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now() };
}
function mapDbProgram(r) {
  return { id: r.id, athleteId: r.athlete_id, coachId: r.coach_id, name: r.name, weeks: r.weeks || [] };
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
    weight: Number(r.weight), reps: r.reps, rpe: Number(r.rpe), e1rm: Number(r.e1rm), e1rmComp: Number(r.e1rm_comp),
    note: r.note || '', date: r.date };
}
function mapJsLog(l) {
  return { id: l.id, athlete_id: l.athleteId, lift: l.lift, variant: l.variant || null, exercise_name: l.exerciseName || null,
    weight: l.weight, reps: l.reps, rpe: l.rpe, e1rm: l.e1rm, e1rm_comp: l.e1rmComp,
    note: l.note || null, date: l.date };
}
function mapDbBw(r) { return { id: r.id, athleteId: r.athlete_id, date: r.date, weight: Number(r.weight) }; }
function mapJsBw(b) { return { id: b.id, athlete_id: b.athleteId, date: b.date, weight: b.weight }; }
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
function mapDbMarketplaceProgram(r) {
  return {
    id: r.id,
    coachId: r.coach_id,
    title: r.title,
    description: r.description || '',
    tier: r.tier,
    priceCents: r.price_cents,
    weekCount: r.week_count || 0,
    status: r.status,
    lsProductId: r.ls_product_id || null,
    lsVariantId: r.ls_variant_id || null,
    lsCheckoutUrl: r.ls_checkout_url || null,
    programPayload: r.program_payload,
    soldCount: r.sold_count || 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}
function mapJsMarketplaceProgram(m) {
  return {
    id: m.id, coach_id: m.coachId,
    title: m.title, description: m.description || null,
    tier: m.tier, price_cents: m.priceCents,
    week_count: m.weekCount || 0,
    status: m.status || 'pending_review',
    program_payload: m.programPayload,
    updated_at: new Date().toISOString()
  };
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
    const redirectTo = window.location.origin + '/reset-password.html';
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  },
  // Called from reset-password.html after the recovery session is established.
  async updatePassword(newPassword) {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },
  async signUpCoach(name, email, password, bio) {
    // Profile row is created by the on_auth_user_created trigger using this metadata.
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name, user_type: 'coach', bio: bio || '' } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Signup did not return a user.');
    return data.user;
  },
  async signUpAthlete(name, email, password, code) {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { name, user_type: 'athlete' } }
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
    const { error } = await sb.from('profiles').update(patch).in('id', [userId]);
    if (error) throw error;
  },
  async listCoaches() {
    const { data, error } = await sb.from('profiles').select('*').eq('user_type', 'coach');
    if (error) { console.warn('listCoaches', error); return []; }
    return (data || []).map(mapDbProfileToCoach);
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
  async listAthletesForCoach(coachId) {
    // RLS allows coach to read profiles where coach_id = auth.uid() — combined
    // with user_type filter, this returns only athletes coached by current user.
    const { data, error } = await sb.from('profiles').select('*').eq('user_type', 'athlete');
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
    const { data, error } = await sb.from('marketplace_programs').insert(payload).select('*');
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
    if (patch.priceCents !== undefined)   allowed.price_cents = patch.priceCents;
    if (patch.weekCount !== undefined)    allowed.week_count = patch.weekCount;
    if (patch.status !== undefined)       allowed.status = patch.status;
    if (patch.programPayload !== undefined) allowed.program_payload = patch.programPayload;
    allowed.updated_at = new Date().toISOString();
    const { error } = await sb.from('marketplace_programs').update(allowed).eq('id', id);
    if (error) throw error;
  },

  async deleteMarketplaceProgram(id) {
    const { error } = await sb.from('marketplace_programs').delete().eq('id', id);
    if (error) throw error;
  },

  // Public: list all published marketplace programs (anyone — signed in or not)
  async listPublishedPrograms({ tier, search } = {}) {
    let q = sb.from('marketplace_programs').select('*').eq('status', 'published').order('sold_count', { ascending: false });
    if (tier) q = q.eq('tier', tier);
    if (search) q = q.ilike('title', '%' + search + '%');
    const { data, error } = await q;
    if (error) { console.warn('listPublishedPrograms', error); return []; }
    return (data || []).map(mapDbMarketplaceProgram);
  },

  // Coach: list every marketplace program I've published (any status)
  async listMyPublishedPrograms(coachId) {
    const { data, error } = await sb.from('marketplace_programs')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listMyPublishedPrograms', error); return []; }
    return (data || []).map(mapDbMarketplaceProgram);
  },

  // Single program fetch for the buy page
  async getMarketplaceProgram(id) {
    const { data, error } = await sb.from('marketplace_programs').select('*').eq('id', id).limit(1);
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

  // Sales — coach side: list every sale of my programs (earnings dashboard)
  async listMySales(coachId) {
    const { data, error } = await sb.from('program_sales')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('listMySales', error); return []; }
    return (data || []).map(mapDbSale);
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
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.warn('listAllMarketplaceProgramsAdmin', error); return []; }
    return (data || []).map(mapDbMarketplaceProgram);
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
      checkins: [],
      marketplacePrograms: [], mySales: [], myPurchases: []
    };

    // Always pull coach directory (public)
    empty.coaches = await this.listCoaches();

    if (!profile) return empty;

    if (profile.user_type === 'coach') {
      // Coach: pull own athletes + their training data
      const ath = await this.listAthletesForCoach(profile.id);
      empty.athletes = ath;
      const athleteIds = ath.map(a => a.id);
      const [invs, programs, tpls, logs, bw, notes, goals, checkins, mp, sales] = await Promise.all([
        this.listInvites(profile.id),
        this.listProgramsForCoach(profile.id),
        this.listTemplates(profile.id),
        this.listLogsForAthletes(athleteIds),
        this.listBwForAthletes(athleteIds),
        this.listNotesForAthletes(athleteIds),
        this.listGoalsForAthletes(athleteIds),
        this.listCheckinsForAthletes(athleteIds),
        this.listMyPublishedPrograms(profile.id).catch(() => []),
        this.listMySales(profile.id).catch(() => [])
      ]);
      empty.invites = invs;
      empty.programs = programs;
      empty.programTemplates = tpls;
      empty.workoutLogs = logs;
      empty.bodyweight = bw;
      empty.sessionNotes = notes;
      empty.goals = goals;
      empty.checkins = checkins;
      empty.marketplacePrograms = mp;
      empty.mySales = sales;
    } else {
      // Athlete: own data
      const [progs, logs, bw, notes, goals, rest, checkins, purchases] = await Promise.all([
        this.listProgramsForAthlete(profile.id),
        this.listLogsForAthlete(profile.id),
        this.listBwForAthlete(profile.id),
        this.listNotesForAthlete(profile.id),
        this.getGoals(profile.id),
        this.listRestForAthlete(profile.id),
        this.listCheckins(profile.id),
        this.listMyPurchases(profile.id).catch(() => [])
      ]);
      empty.myPurchases = purchases;
      empty.programs = progs;
      empty.workoutLogs = logs;
      empty.bodyweight = bw;
      empty.sessionNotes = notes;
      empty.goals = goals ? [goals] : [];
      empty.restDays = rest;
      empty.checkins = checkins;

      // Athlete also needs to see their own profile + their coach
      empty.athletes = [mapDbProfileToAthlete(profile)];
      // Coach already in coaches list from listCoaches()
    }

    return empty;
  }
};

window.DB = DB;
window.sb = sb;
