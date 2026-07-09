// Supabase Edge Function: ls-portal
//
// POST {}   (no body — the subscription to manage is the CALLER's own)
//
// Returns a SIGNED, single-use Lemon Squeezy customer-portal URL for the
// caller's own subscription, so an existing subscriber can update their card,
// switch plan, pause, or cancel — without ever touching the Supabase dashboard
// or exposing the LS API key to the browser.
//
// SECURITY MODEL (same spirit as send-invite / delete-account):
//   • The caller is identified ONLY from their session JWT (Verify JWT ON).
//   • Their `ls_subscription_id` is resolved SERVER-SIDE from THEIR OWN profile
//     row via the service role — never taken from the request body. So a caller
//     can only ever get a portal link for a subscription that is actually theirs.
//   • The LS API key (LEMON_SQUEEZY_API_KEY) lives only in this function's
//     secrets. The signed URL LS returns is what goes to the browser.
//
// GRACEFUL DEGRADATION — this function is safe to deploy BEFORE the secret is
// set. Every "can't build a signed link" branch returns HTTP 200 with
// {ok:false, reason}, NOT an error status, so the client (DB.subscriptionPortal)
// cleanly falls back to the no-code email-magic-link portal
// (https://powalifta.lemonsqueezy.com/billing). Reasons it may fall back:
//   • LEMON_SQUEEZY_API_KEY not set        → reason:'portal not configured'
//   • caller has no ls_subscription_id     → reason:'no subscription'
//   • LS API error / unexpected shape      → reason:'portal unavailable'
//
// Deploy: `./deploy.sh` (WITH_JWT group — Verify JWT ON). Secret:
// LEMON_SQUEEZY_API_KEY (create at app.lemonsqueezy.com → Settings → API).
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const LS_API_KEY = Deno.env.get('LEMON_SQUEEZY_API_KEY') || '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return json({ error: 'server not configured' }, 500);
  }

  // Identify the caller from their JWT — the ONLY source of the uid.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'missing auth' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'invalid session' }, 401);
  const uid = userData.user.id;

  // Light per-caller ceiling (fails open if the meter isn't deployed).
  const rl = await rateLimit(admin, {
    bucket: 'ls-portal', identity: uid, limit: 30, windowSecs: 3600,
  });
  if (!rl.ok) return rateLimitResponse(rl, cors);

  // No API key → tell the client to use the no-code portal instead (not an error).
  if (!LS_API_KEY) return json({ ok: false, reason: 'portal not configured' });

  // Resolve the caller's OWN subscription id, server-side.
  const { data: profile, error: pErr } = await admin
    .from('profiles')
    .select('ls_subscription_id')
    .eq('id', uid)
    .maybeSingle();
  if (pErr) {
    console.error('profile lookup failed:', pErr);
    return json({ ok: false, reason: 'portal unavailable' });
  }
  const subId = profile?.ls_subscription_id;
  if (!subId) return json({ ok: false, reason: 'no subscription' });

  // Ask Lemon Squeezy for the signed customer-portal URL on this subscription.
  try {
    const resp = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${encodeURIComponent(String(subId))}`, {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Authorization': `Bearer ${LS_API_KEY}`,
      },
    });
    if (!resp.ok) {
      console.error('LS API error', resp.status, await resp.text().catch(() => ''));
      return json({ ok: false, reason: 'portal unavailable' });
    }
    const body = await resp.json();
    const urls = body?.data?.attributes?.urls || {};
    // Prefer the customer_portal link; LS also exposes a direct update-payment link.
    const url = urls.customer_portal || urls.update_payment_method || null;
    if (!url) return json({ ok: false, reason: 'portal unavailable' });
    return json({ ok: true, url });
  } catch (e) {
    console.error('LS portal fetch threw:', e);
    return json({ ok: false, reason: 'portal unavailable' });
  }
});
