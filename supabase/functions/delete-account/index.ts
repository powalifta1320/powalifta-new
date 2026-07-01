// Supabase Edge Function: delete-account
//
// POST {}   (no body needed — the account to erase is the CALLER)
//
// Self-serve account deletion / GDPR erasure. The caller is identified ONLY
// from their session JWT (Verify JWT ON); the function then hard-deletes THAT
// user with the service role. A caller can never delete anyone but themselves —
// the uid never comes from the request body.
//
// What gets erased:
//   1. Best-effort Storage sweep of the caller's own objects — every file under
//      `<uid>/` in the private `form-checks` bucket and the public `avatars`
//      bucket (deleting the auth user does NOT remove Storage objects).
//   2. auth.admin.deleteUser(uid) — one call that CASCADES across every table
//      whose FK to profiles(id)/auth.users(id) is ON DELETE CASCADE (profile,
//      logs, programs, bodyweight, goals, meets, messages, program_reviews,
//      referrals, referral_reward_claims, leaderboard_entries, form_checks,
//      session_notes, checkins, coach_requests, email_preferences,
//      push_subscriptions, ai_chat_usage, and the coach's marketplace_programs).
//
// What is RETAINED (by design, per the privacy policy): program_sales rows are
// financial/tax records. migration-account-deletion.sql switches their
// buyer_id / coach_id / marketplace_program_id FKs to ON DELETE SET NULL, so
// each sale survives the cascade with its personal linkage severed (amounts,
// dates and order ids kept; identity anonymized).
//
// Deploy: `./deploy.sh` (WITH_JWT group — Verify JWT ON). No new secret —
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected. Run
// sql/migration-account-deletion.sql first (otherwise the cascade is blocked by
// program_sales and deleteUser fails cleanly with an error the client surfaces).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Remove every object under `<uid>/` in a bucket. Best-effort: a Storage error
// must never block the actual account deletion, so we swallow + log.
async function purgeBucket(admin: any, bucket: string, uid: string): Promise<number> {
  try {
    const { data: list, error } = await admin.storage.from(bucket).list(uid, { limit: 1000 });
    if (error || !list || !list.length) return 0;
    const paths = list
      .filter((o: any) => o && o.name)
      .map((o: any) => `${uid}/${o.name}`);
    if (!paths.length) return 0;
    const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
    if (rmErr) { console.error(`purge ${bucket} remove failed:`, rmErr); return 0; }
    return paths.length;
  } catch (e) {
    console.error(`purge ${bucket} crashed:`, e);
    return 0;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return json({ error: 'server not configured' }, 500);
  }

  // Identify the caller from their JWT — this is the ONLY source of the uid.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'missing auth' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'invalid session' }, 401);
  const uid = userData.user.id;

  // Tight per-caller ceiling. Deletion is a rare, heavy, irreversible op; a
  // looping session has no legitimate reason to hammer it. Fails open if the
  // rl_bump meter (migration-edge-rate-limits.sql) isn't deployed yet.
  const rl = await rateLimit(admin, {
    bucket: 'delete-account', identity: uid, limit: 5, windowSecs: 3600,
  });
  if (!rl.ok) return rateLimitResponse(rl, cors);

  // 1) Best-effort Storage sweep (never fatal).
  const purgedForms = await purgeBucket(admin, 'form-checks', uid);
  const purgedAvatars = await purgeBucket(admin, 'avatars', uid);

  // 2) The erasure itself. Cascades across all ON DELETE CASCADE FKs; program_sales
  //    rows are retained with a nulled identity (see migration-account-deletion.sql).
  const { error: delErr } = await admin.auth.admin.deleteUser(uid);
  if (delErr) {
    // Most likely cause if it fails: the migration hasn't run, so a RESTRICT FK
    // (program_sales) is still blocking the cascade. Surface it — the client
    // falls back to the manual "email us" erasure path.
    console.error('deleteUser failed:', delErr);
    return json({ error: 'deletion failed', detail: String((delErr as any)?.message || delErr) }, 500);
  }

  return json({ deleted: true, purged: { forms: purgedForms, avatars: purgedAvatars } });
});
