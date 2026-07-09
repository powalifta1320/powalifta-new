// Supabase Edge Function: unsubscribe
//
// Powers the one-click, UNAUTHENTICATED email-unsubscribe link that every
// POWALIFTA email carries in its footer (#36). The link is
//   https://powalifta.com/unsubscribe.html?token=<unsub_token>
// and unsubscribe.html POSTs the token here.
//
// SECURITY MODEL — the `unsub_token` (a random UUID, one per user, minted by
// migration-email-preferences.sql) IS the capability. It only ever grants
// control over that user's TWO email booleans (`weekly_digest`,
// `product_emails`); it exposes no identity, no other data, and cannot be
// used to read the rest of the row. Resolution happens SERVER-SIDE via the
// service role (RLS is never opened to anon), so the token is the whole story:
//   • Verify JWT is OFF (an email recipient has no session, possibly on another
//     device) — so this function must be deployed with --no-verify-jwt.
//   • The token is validated as a UUID and looked up on `unsub_token`.
//   • An unknown / malformed token returns HTTP 200 {ok:false, reason:'invalid link'}
//     (not an error) so the landing page shows a friendly "manage in Settings".
//
// REQUEST  POST { token, set? }
//   token : the unsub_token UUID from the URL (required).
//   set   : optional patch, any subset of { weeklyDigest:boolean, productEmails:boolean }.
//           Omit `set` entirely to just READ current state (no mutation) — the
//           page uses this to render the toggles reflecting reality.
// RESPONSE 200 { ok:true, weeklyDigest, productEmails }  (the resulting state)
//       or 200 { ok:false, reason }                      (friendly fallback)
//
// The one-click default lives in the PAGE, not here: unsubscribe.html calls us
// on load with set:{weeklyDigest:false} so the click itself unsubscribes, then
// offers the product toggle + an undo. Keeping this function a pure
// token→patch primitive means the same endpoint serves read, unsubscribe,
// re-subscribe, and granular edits.
//
// Deploy: `./deploy.sh` (NO_JWT group — Verify JWT OFF). No new secret —
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected. Rate-limited via
// the shared #26 meter (fails open if that migration isn't applied yet).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clientIp, rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method not allowed' }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return json({ ok: false, reason: 'server not configured' }, 500);
  }

  let token = '';
  let set: Record<string, unknown> | null = null;
  try {
    const b = await req.json();
    token = String((b && b.token) || '').trim();
    if (b && b.set && typeof b.set === 'object') set = b.set;
  } catch { /* bad/empty body handled below */ }

  // Malformed token → friendly fallback (never leak whether a token exists).
  if (!UUID_RE.test(token)) return json({ ok: false, reason: 'invalid link' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Light abuse ceiling, keyed by BOTH the token and the caller IP (fail-open).
  const rl = await rateLimit(admin, {
    bucket: 'unsubscribe', identity: token + '|' + clientIp(req), limit: 60, windowSecs: 3600,
  });
  if (!rl.ok) return rateLimitResponse(rl, cors);

  // Resolve the row from the token alone (service role bypasses RLS).
  const { data: row, error: readErr } = await admin
    .from('email_preferences')
    .select('user_id, weekly_digest, product_emails')
    .eq('unsub_token', token)
    .maybeSingle();
  if (readErr) {
    console.error('email_preferences read failed:', readErr);
    return json({ ok: false, reason: 'unavailable' });
  }
  if (!row) return json({ ok: false, reason: 'invalid link' });

  // Build a whitelist patch — only the two booleans are ever writable here.
  const patch: Record<string, boolean> = {};
  if (set && typeof set.weeklyDigest === 'boolean') patch.weekly_digest = set.weeklyDigest as boolean;
  if (set && typeof set.productEmails === 'boolean') patch.product_emails = set.productEmails as boolean;

  if (Object.keys(patch).length) {
    const { error: upErr } = await admin
      .from('email_preferences')
      .update(patch)
      .eq('unsub_token', token);
    if (upErr) {
      console.error('email_preferences update failed:', upErr);
      return json({ ok: false, reason: 'update failed' });
    }
  }

  // Report the resulting state (patched value if we wrote it, else stored value;
  // a NULL column counts as opted-in, matching the digest's own read).
  const weeklyDigest = 'weekly_digest' in patch ? patch.weekly_digest : row.weekly_digest !== false;
  const productEmails = 'product_emails' in patch ? patch.product_emails : row.product_emails !== false;
  return json({ ok: true, weeklyDigest, productEmails });
});
