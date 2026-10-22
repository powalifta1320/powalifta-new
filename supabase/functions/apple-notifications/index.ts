// apple-notifications — POWALIFTA edge function
//
// App Store Server Notifications V2. Apple calls this whenever a coach's
// subscription renews, changes plan, fails to renew, expires, is refunded or is
// revoked, so the coach's tier follows their real Apple billing even if they
// never open the app again. (apple-iap only syncs at purchase / restore / app
// launch, so before this a coach who cancelled in Settings kept their plan on
// the web until they next opened the iPhone app.)
//
//   POST { signedPayload: "<jws>" }   (sent by Apple)   -> 200 once verified
//
// Security model:
//   - Verify JWT OFF: Apple has no session. The gate is Apple's signature: the
//     outer signedPayload AND the nested signedTransactionInfo are App Store JWS,
//     checked by _shared/apple-jws.ts (x5c chain to Apple Root CA - G3 + Apple's
//     marker OIDs + ES256 signature).
//   - bundleId + productId are allowlisted (same table as apple-iap).
//   - The profile is found ONLY by apple_original_transaction_id, which only apple-iap
//     (after checking appAccountToken == the signed-in caller) writes, and which users can't
//     edit (migration-billing-guard.sql). A notification that matches nobody is ignored: the
//     app's next signed-in sync (apple-iap, at launch) links the purchase. (2026-10-22: the
//     old fallback linked by appAccountToken alone, which the BUYER chooses, so a modified
//     client could attach its subscription to another coach and lock them out of web billing.)
//   - A Sandbox notification only grants a plan to an account in APPLE_SANDBOX_UIDS (same
//     list as apple-iap); a plan-removing one always applies.
//   - The period end (expiresDate) is stored with every decision, so the database's
//     lapse check (3 days after it) follows renewals and expiries even if a later
//     notification is lost.
//   - A live Lemon Squeezy subscription wins (one biller), same as apple-iap.
//   - Out-of-order or retried deliveries: the UPDATE only applies when its
//     signedDate is newer than subscription_updated_at, in one statement.
//   - Rate-limited per IP (fail-open), x5c capped before parsing (apple-jws.ts).
//
// Set it up: App Store Connect → the app → App Information → App Store Server
// Notifications → Production AND Sandbox URL =
//   https://cxnotrikxvzncupswvio.supabase.co/functions/v1/apple-notifications
// Version 2. Then "Request a Test Notification" — it should answer 200.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected). Optional
// APPLE_ROOT_CA_B64. Deploy: NO_JWT group in deploy.sh.

import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyAppleJws } from "../_shared/apple-jws.ts";
import { clientIp, rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { lsLive, sandboxAllowed, selectProfilesSoft, updateProfileSoft } from "../_shared/billing.ts";

const BUNDLE_ID = "com.powalifta.app";
// Keep in sync with apple-iap + StoreKitPlugin.productIds + App Store Connect.
const PRODUCT_TIERS: Record<string, string> = {
  "com.powalifta.app.coach.basic": "basic",
  "com.powalifta.app.coach.pro": "pro",
  "com.powalifta.app.coach.premium": "premium",
  // Yearly (2026-10-22): the same plans billed once a year, same subscription group.
  "com.powalifta.app.coach.basic.yearly": "basic",
  "com.powalifta.app.coach.pro.yearly": "pro",
  "com.powalifta.app.coach.premium.yearly": "premium",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// What a notification means for the coach's plan, or null when it changes
// nothing (renewal-status flips, price-increase notices, consumption requests).
// data.status: 1 active · 2 expired · 3 billing retry · 4 grace period · 5 revoked.
export function decidePlan(
  type: string,
  subtype: string,
  status: number | null,
  productTier: string,
  revoked: boolean,
): { tier: string; status: string } | null {
  const free = (s: string) => ({ tier: "free", status: s });
  if (revoked || type === "REFUND" || type === "REVOKE") return free("expired");
  if (type === "EXPIRED" || type === "GRACE_PERIOD_EXPIRED") return free("expired");
  if (status === 1 || status === 4) return { tier: productTier, status: "active" };
  if (status === 3) return free("past_due");
  if (status === 2 || status === 5) return free("expired");
  // No status on the payload: decide from the type alone.
  if (["SUBSCRIBED", "DID_RENEW", "OFFER_REDEEMED", "RENEWAL_EXTENDED", "REFUND_REVERSED"].includes(type)) {
    return { tier: productTier, status: "active" };
  }
  if (type === "DID_FAIL_TO_RENEW") {
    return subtype === "GRACE_PERIOD" ? { tier: productTier, status: "active" } : free("past_due");
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const rl = await rateLimit(admin, { bucket: "apple-notifications", identity: clientIp(req), limit: 600, windowSecs: 3600 });
  if (!rl.ok) return rateLimitResponse(rl);

  let body: { signedPayload?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_json" });
  }

  let note: Record<string, any>;
  try {
    note = await verifyAppleJws(String(body.signedPayload ?? ""));
  } catch (_e) {
    return json(400, { error: "invalid_signature" });
  }

  const type = String(note.notificationType ?? "");
  const subtype = String(note.subtype ?? "");
  const data = (note.data ?? {}) as Record<string, any>;
  console.log("apple notification", { type, subtype, env: data.environment, status: data.status });

  if (type === "TEST") return json(200, { ok: true, test: true });
  if (data.bundleId && data.bundleId !== BUNDLE_ID) return json(200, { ignored: "other_bundle" });
  if (!data.signedTransactionInfo) return json(200, { ignored: "no_transaction" });

  let txn: Record<string, any>;
  try {
    txn = await verifyAppleJws(String(data.signedTransactionInfo));
  } catch (_e) {
    return json(400, { error: "invalid_transaction" });
  }
  const productTier = PRODUCT_TIERS[String(txn.productId ?? "")];
  if (txn.bundleId !== BUNDLE_ID || !productTier) return json(200, { ignored: "unknown_product" });

  const status = typeof data.status === "number" ? data.status : null;
  const decision = decidePlan(type, subtype, status, productTier, !!txn.revocationDate);
  if (!decision) return json(200, { ok: true, unchanged: type });

  const otid = String(txn.originalTransactionId ?? "");
  if (!otid) return json(200, { ignored: "no_original_transaction" });

  const cols = "id, user_type, subscription_tier, subscription_status, ls_subscription_id, apple_original_transaction_id, subscription_updated_at";
  const byTxn = await selectProfilesSoft(admin, cols, (q) => q.eq("apple_original_transaction_id", otid).limit(1));
  if (byTxn.error) return json(500, { error: "lookup_failed" });
  const profile = byTxn.data?.[0] ?? null;
  const grants = decision.tier !== "free";
  if (!profile) return json(200, { ignored: "no_matching_coach" });
  if (profile.user_type !== "coach") return json(200, { ignored: "not_a_coach" });
  if (grants && String(data.environment ?? txn.environment ?? "Production") !== "Production" && !sandboxAllowed(profile.id)) {
    return json(200, { ignored: "sandbox" });
  }

  if (lsLive(profile)) return json(200, { ignored: "web_billing_active" });

  // Newer than what we hold, checked and written in one statement.
  const signedIso = new Date(Number(note.signedDate ?? 0) || Date.now()).toISOString();
  let expiresMs = Number(txn.expiresDate ?? 0);
  // In Apple's billing grace period (status 4, or a failed renewal flagged GRACE_PERIOD) the plan
  // runs to the grace end (up to 16 days), not to expiresDate plus our 3 days.
  if (grants && data.signedRenewalInfo && (status === 4 || subtype === "GRACE_PERIOD")) {
    try {
      const renewal = await verifyAppleJws(String(data.signedRenewalInfo));
      const graceMs = Number(renewal.gracePeriodExpiresDate ?? 0);
      if (graceMs > expiresMs) expiresMs = graceMs;
    } catch (_e) { /* keep expiresDate */ }
  }
  const patch: Record<string, unknown> = {
    subscription_tier: decision.tier,
    subscription_status: decision.status,
    subscription_updated_at: signedIso,
    billing_provider: grants ? "apple" : null,
  };
  if (expiresMs) patch.subscription_period_end = new Date(expiresMs).toISOString();
  const { data: done, error } = await updateProfileSoft(admin, profile.id, patch,
    (q) => q.or("subscription_updated_at.is.null,subscription_updated_at.lt." + signedIso).select("id"));
  if (error) return json(500, { error: "update_failed" });
  if (!done || !done.length) return json(200, { ignored: "stale" });

  return json(200, { ok: true, tier: decision.tier });
});
