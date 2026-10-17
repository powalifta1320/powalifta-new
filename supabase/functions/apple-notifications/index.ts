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
//   - The profile is found by apple_original_transaction_id (written by
//     apple-iap). A first SUBSCRIBED / DID_RENEW can arrive before the app has
//     called apple-iap, so an event that GRANTS a plan may also match by the
//     transaction's appAccountToken (the buyer's uid, set by StoreKitPlugin and
//     covered by Apple's signature). An event that REMOVES a plan only ever
//     matches the stored original transaction id.
//   - A live Lemon Squeezy subscription wins (one biller), same as apple-iap.
//   - Out-of-order or retried deliveries: signedDate is compared with
//     subscription_updated_at and older notifications are acknowledged unchanged.
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

const BUNDLE_ID = "com.powalifta.app";
// Keep in sync with apple-iap + StoreKitPlugin.productIds + App Store Connect.
const PRODUCT_TIERS: Record<string, string> = {
  "com.powalifta.app.coach.basic": "basic",
  "com.powalifta.app.coach.pro": "pro",
  "com.powalifta.app.coach.premium": "premium",
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

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cols = "id, user_type, subscription_status, ls_subscription_id, apple_original_transaction_id, subscription_updated_at";

  const byTxn = await admin.from("profiles").select(cols).eq("apple_original_transaction_id", otid).limit(1);
  if (byTxn.error) return json(500, { error: "lookup_failed" });
  let profile = byTxn.data?.[0] ?? null;

  if (!profile && decision.tier !== "free") {
    const token = String(txn.appAccountToken ?? "").toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(token)) {
      const byUser = await admin.from("profiles").select(cols).eq("id", token).limit(1);
      if (byUser.error) return json(500, { error: "lookup_failed" });
      const p = byUser.data?.[0];
      if (p && (!p.apple_original_transaction_id || p.apple_original_transaction_id === otid)) profile = p;
    }
  }
  if (!profile) return json(200, { ignored: "no_matching_coach" });
  if (profile.user_type !== "coach") return json(200, { ignored: "not_a_coach" });

  const lsLive = profile.ls_subscription_id &&
    ["active", "on_trial", "trialing", "past_due"].includes(profile.subscription_status ?? "");
  if (lsLive) return json(200, { ignored: "web_billing_active" });

  const signedMs = Number(note.signedDate ?? 0) || Date.now();
  const storedMs = Date.parse(String(profile.subscription_updated_at ?? "")) || 0;
  if (storedMs && signedMs < storedMs) return json(200, { ignored: "stale" });

  const { error } = await admin.from("profiles").update({
    subscription_tier: decision.tier,
    subscription_status: decision.status,
    apple_original_transaction_id: otid,
    subscription_updated_at: new Date(signedMs).toISOString(),
  }).eq("id", profile.id);
  if (error) return json(500, { error: "update_failed" });

  return json(200, { ok: true, tier: decision.tier });
});
