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
  return {
    id: r.id, name: r.name, email: r.email, bio: r.bio || '',
    avatarUrl: r.avatar_url || null,
    countryCode: r.country_code || null,
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
    productEmails: r ? r.product_emails !== false : true,
    unsubToken: r ? (r.unsub_token || null) : null,
    // Push notification categories (#30) — default on.
    pushMessages: r ? r.push_messages !== false : true,
    pushFormChecks: r ? r.push_form_checks !== false : true,
    pushProgram: r ? r.push_program !== false : true
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
    createdAt: r.created_at,
    readAt: r.read_at || null
  };
}

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
              reason = body.error + (body.detail ? ' — ' + body.detail : '');
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
              reason = body.error + (body.detail ? ' — ' + body.detail : '');
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
    let { data, error } = await sb.from('marketplace_programs').insert(payload).select('*');
    // If the taxonomy migration hasn't run yet the `category` column is
    // missing — drop it and retry so publishing still works pre-migration.
    if (error && payload.category && /category/i.test(error.message || '')) {
      delete payload.category;
      ({ data, error } = await sb.from('marketplace_programs').insert(payload).select('*'));
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
    let q = sb.from('marketplace_programs').select('*').eq('status', 'published').order('sold_count', { ascending: false });
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
    if (!sales || !sales.length) throw new Error('No purchase record found — did the payment go through?');

    // Fetch the program payload (must be published — buyer reads via public RLS)
    const { data: progRows, error: progErr } = await sb.from('marketplace_programs')
      .select('*').eq('id', marketplaceProgramId).limit(1);
    if (progErr) throw progErr;
    if (!progRows || !progRows.length) throw new Error('Program not found or has been unpublished');
    const mp = mapDbMarketplaceProgram(progRows[0]);
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
    const weeks = mp.programPayload.weeks.map(wk => ({
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
  async sendMessage({ coachId, athleteId, senderId, body }) {
    const row = {
      coach_id: coachId,
      athlete_id: athleteId,
      sender_id: senderId,
      body: (body || '').trim()
    };
    const { data, error } = await sb.from('messages').insert(row).select('*');
    if (error) throw error;
    return data && data[0] ? mapDbMessage(data[0]) : null;
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

  // Admin manual delivery: record a sale row when the webhook didn't fire.
  // Admin pastes the buyer's email + LS order ID; we look up the buyer, create the
  // sale row, and the buyer can then hit "Claim my program" on their dashboard.
  // Requires admin RLS on program_sales (already in migration-marketplace.sql).
  async adminDeliverSale({ marketplaceProgramId, buyerEmail, amountCents, lsOrderId }) {
    if (!marketplaceProgramId || !buyerEmail) throw new Error('Program ID and buyer email required');
    const { data: profs, error: profErr } = await sb.from('profiles')
      .select('id').ilike('email', buyerEmail.trim()).limit(1);
    if (profErr) throw profErr;
    if (!profs || !profs.length) throw new Error('No POWALIFTA account with that email — buyer must sign up first.');
    const buyerId = profs[0].id;

    const { data: progs, error: pErr } = await sb.from('marketplace_programs')
      .select('*').eq('id', marketplaceProgramId).limit(1);
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
      checkins: [], meets: [],
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
      const [invs, programs, tpls, logs, bw, notes, goals, checkins, meets, mp, sales] = await Promise.all([
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
      empty.meets = meets;
      empty.marketplacePrograms = mp;
      empty.mySales = sales;
    } else {
      // Athlete: own data
      const [progs, logs, bw, notes, goals, rest, checkins, meets, purchases] = await Promise.all([
        this.listProgramsForAthlete(profile.id),
        this.listLogsForAthlete(profile.id),
        this.listBwForAthlete(profile.id),
        this.listNotesForAthlete(profile.id),
        this.getGoals(profile.id),
        this.listRestForAthlete(profile.id),
        this.listCheckins(profile.id),
        this.listMeetsForAthlete(profile.id),
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
