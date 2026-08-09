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
//   - The JWS x5c certificate chain is validated leaf->intermediate->root and the
//     root must be byte-identical to Apple Root CA - G3 (fetched once from
//     apple.com over TLS and cached; pin via APPLE_ROOT_CA_B64 to remove even that).
//   - The ES256 signature is verified against the leaf certificate's public key.
//   - payload.appAccountToken must equal the caller's uid (StoreKitPlugin sets it
//     at purchase time), so a JWS replayed from another account is rejected.
//   - bundleId + productId are allowlisted; only user_type='coach' rows are written.
//   - A live Lemon Squeezy subscription blocks an Apple write (409) — one biller.
//   - Sandbox environment is accepted (App Review + TestFlight purchases are sandbox).
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected). Optional:
//   APPLE_ROOT_CA_B64 — base64 DER of Apple Root CA - G3 to pin the root offline.
//
// Deploy: WITH_JWT group in deploy.sh. Rate-limited via the #26 shared helper.

import { createClient } from "npm:@supabase/supabase-js@2";
import * as jose from "npm:jose@5";
import { X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";

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

const APPLE_ROOT_URL = "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer";
let _appleRootDer: Buffer | null = null;

async function appleRootDer(): Promise<Buffer> {
  if (_appleRootDer) return _appleRootDer;
  const pinned = Deno.env.get("APPLE_ROOT_CA_B64");
  if (pinned) {
    _appleRootDer = Buffer.from(pinned, "base64");
    return _appleRootDer;
  }
  // Bootstrap trust via TLS to apple.com; cached for the life of the isolate.
  const res = await fetch(APPLE_ROOT_URL);
  if (!res.ok) throw new Error("apple_root_fetch_failed");
  _appleRootDer = Buffer.from(await res.arrayBuffer());
  return _appleRootDer;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Validate the x5c chain and return the leaf's public key as a PEM string.
async function verifyChainAndGetLeafKey(jws: string): Promise<string> {
  const header = jose.decodeProtectedHeader(jws);
  const x5c = header.x5c as string[] | undefined;
  if (!header.alg || header.alg !== "ES256" || !x5c || x5c.length < 2) {
    throw new Error("bad_header");
  }
  const certs = x5c.map((b64) => new X509Certificate(Buffer.from(b64, "base64")));
  const now = new Date();
  for (const c of certs) {
    if (new Date(c.validFrom) > now || new Date(c.validTo) < now) throw new Error("cert_expired");
  }
  // Each cert must be signed by the next one up.
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) throw new Error("chain_broken");
  }
  // The chain's root must BE Apple's root, byte for byte.
  const root = certs[certs.length - 1];
  const appleRoot = await appleRootDer();
  if (Buffer.compare(root.raw, appleRoot) !== 0) throw new Error("untrusted_root");
  return certs[0].publicKey.export({ type: "spki", format: "pem" }) as string;
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

  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, user_type, subscription_tier, subscription_status, ls_subscription_id, apple_original_transaction_id")
    .eq("id", uid)
    .single();
  if (profErr || !profile) return json(404, { error: "profile_not_found" });

  // ---- self-downgrade: device reports no active entitlement --------------------
  if (body.action === "clear") {
    const lsLive = profile.ls_subscription_id &&
      ["active", "on_trial", "trialing", "past_due"].includes(profile.subscription_status ?? "");
    if (!profile.apple_original_transaction_id || lsLive) {
      return json(200, { ok: false, reason: "not_apple_billed" });
    }
    const { error } = await admin.from("profiles").update({
      subscription_tier: "free",
      subscription_status: "expired",
      apple_original_transaction_id: null,
      subscription_updated_at: new Date().toISOString(),
    }).eq("id", uid);
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
    const leafPem = await verifyChainAndGetLeafKey(jws);
    const key = await jose.importSPKI(leafPem, "ES256");
    const { payload: raw } = await jose.compactVerify(jws, key, { algorithms: ["ES256"] });
    payload = JSON.parse(new TextDecoder().decode(raw));
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

  if (profile.user_type !== "coach") return json(403, { error: "coach_only" });

  const lsLive = profile.ls_subscription_id &&
    ["active", "on_trial", "trialing", "past_due"].includes(profile.subscription_status ?? "");
  if (lsLive) return json(409, { error: "web_billing_active" });

  const { error: upErr } = await admin.from("profiles").update({
    subscription_tier: tier,
    subscription_status: "active",
    apple_original_transaction_id: String(payload.originalTransactionId ?? ""),
    subscription_updated_at: new Date().toISOString(),
  }).eq("id", uid);
  if (upErr) return json(500, { error: "update_failed" });

  return json(200, { ok: true, tier, expiresAt: new Date(expiresMs).toISOString() });
});
