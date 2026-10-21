// apple-iap — POWALIFTA edge function
//
// Verifies a StoreKit 2 signed transaction (JWS) and writes the caller's
// subscription_tier. This is the ONLY writer for Apple-billed coach plans; the
// browser/webview never touches tier (profiles privilege guard blocks it anyway).
//
//   POST { signedTransaction: "<jws>" }   -> verify + upgrade -> { ok, tier, expiresAt }
//   POST { action: "clear" }              -> self-downgrade when the device holds no
//                                            active entitlement and the profile says
//                                            Apple-billed -> { ok, tier: "free" }
//
// Security model:
//   - Verify JWT ON: the caller is identified ONLY from their session JWT.
//   - The JWS is checked by _shared/apple-jws.ts (shared with apple-notifications):
//     three-certificate x5c chain to Apple Root CA - G3, Apple's marker
//     extensions on the intermediate and leaf, ES256 signature.
//   - A refunded / revoked transaction (revocationDate) never grants a plan, and a
//     transaction signed before the last Apple event we stored (e.g. a REFUND
//     notification) can't be replayed to win the plan back.
//   - payload.appAccountToken must equal the caller's uid (StoreKitPlugin sets it
//     at purchase time), so a JWS replayed from another account is rejected.
//   - bundleId + productId are allowlisted; only user_type='coach' rows are written.
//   - A live Lemon Squeezy subscription blocks an Apple write (409) — one biller. A web plan
//     that's cancelled (still paid up) doesn't: the coach is moving to the App Store, and
//     billing_provider then says Apple, so the old web plan's expiry can't take this one away.
//   - The period end (expiresDate) is stored: the database treats the plan as lapsed 3 days
//     after it unless a renewal moves it on (migration-payments-2026-10-22.sql).
//   - The app sends the HIGHEST current entitlement, not the purchase it just made: a
//     downgrade only takes effect at renewal, so the tier must not drop the moment it's bought.
//   - Sandbox environment is accepted (App Review + TestFlight purchases are sandbox).
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected). Optional:
//   APPLE_ROOT_CA_B64 — base64 DER of Apple Root CA - G3 to pin the root offline.
//
// Deploy: WITH_JWT group in deploy.sh. Rate-limited via the #26 shared helper.

import { createClient } from "npm:@supabase/supabase-js@2";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { verifyAppleJws } from "../_shared/apple-jws.ts";
import { lsLive, selectProfilesSoft, updateProfileSoft } from "../_shared/billing.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUNDLE_ID = "com.powalifta.app";
// Keep in sync with StoreKitPlugin.productIds + the App Store Connect products.
const PRODUCT_TIERS: Record<string, string> = {
  "com.powalifta.app.coach.basic": "basic",
  "com.powalifta.app.coach.pro": "pro",
  "com.powalifta.app.coach.premium": "premium",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  // Caller identity from their own JWT (Verify JWT is ON for this function).
  const authed = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: userData, error: userErr } = await authed.auth.getUser();
  const uid = userData?.user?.id;
  if (userErr || !uid) return json(401, { error: "unauthorized" });

  const rl = await rateLimit(admin, { bucket: "apple-iap", identity: uid, limit: 60, windowSecs: 3600 });
  if (!rl.ok) return rateLimitResponse(rl, CORS);

  let body: { signedTransaction?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_json" });
  }

  const { data: rows, error: profErr } = await selectProfilesSoft(admin,
    "id, user_type, subscription_tier, subscription_status, ls_subscription_id, apple_original_transaction_id, subscription_updated_at",
    (q) => q.eq("id", uid).limit(1));
  const profile = rows?.[0];
  if (profErr || !profile) return json(404, { error: "profile_not_found" });

  // ---- self-downgrade: device reports no active entitlement --------------------
  if (body.action === "clear") {
    if (!profile.apple_original_transaction_id || lsLive(profile)) {
      return json(200, { ok: false, reason: "not_apple_billed" });
    }
    const { error } = await updateProfileSoft(admin, uid, {
      subscription_tier: "free",
      subscription_status: "expired",
      apple_original_transaction_id: null,
      subscription_updated_at: new Date().toISOString(),
      billing_provider: null,
      subscription_period_end: new Date().toISOString(),
    });
    if (error) return json(500, { error: "update_failed" });
    return json(200, { ok: true, tier: "free" });
  }

  // ---- purchase / restore / renewal sync ---------------------------------------
  const jws = body.signedTransaction;
  if (!jws || typeof jws !== "string" || jws.length > 20000) {
    return json(400, { error: "signedTransaction required" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await verifyAppleJws(jws);
  } catch (_e) {
    return json(400, { error: "invalid_transaction" });
  }

  const productId = String(payload.productId ?? "");
  const tier = PRODUCT_TIERS[productId];
  if (payload.bundleId !== BUNDLE_ID || !tier) return json(400, { error: "unknown_product" });

  const token = String(payload.appAccountToken ?? "").toLowerCase();
  if (!token || token !== uid.toLowerCase()) {
    // Signed for a different POWALIFTA account (or an old purchase without a
    // token) — refuse rather than let a JWS be replayed across accounts.
    return json(403, { error: "account_mismatch" });
  }

  const expiresMs = Number(payload.expiresDate ?? 0);
  if (!expiresMs || expiresMs < Date.now()) return json(400, { error: "expired" });
  if (payload.revocationDate) return json(400, { error: "revoked" });

  // Apple's clock orders events: a transaction signed before the last Apple event
  // we stored (a REFUND / EXPIRED notification) is old news, not a new grant.
  const signedMs = Number(payload.signedDate ?? 0) || Date.now();
  const storedMs = Date.parse(String(profile.subscription_updated_at ?? "")) || 0;
  // ...whatever the stored id says: clearing it must not reopen the door to a replayed JWS.
  if (storedMs && signedMs < storedMs) {
    return json(200, { ok: true, tier: profile.subscription_tier, unchanged: "older_than_last_event" });
  }

  if (profile.user_type !== "coach") return json(403, { error: "coach_only" });

  if (lsLive(profile)) return json(409, { error: "web_billing_active" });

  const { error: upErr } = await updateProfileSoft(admin, uid, {
    subscription_tier: tier,
    subscription_status: "active",
    apple_original_transaction_id: String(payload.originalTransactionId ?? ""),
    subscription_updated_at: new Date(signedMs).toISOString(),
    billing_provider: "apple",
    subscription_period_end: new Date(expiresMs).toISOString(),
  });
  if (upErr) return json(500, { error: "update_failed" });

  return json(200, { ok: true, tier, expiresAt: new Date(expiresMs).toISOString() });
});
