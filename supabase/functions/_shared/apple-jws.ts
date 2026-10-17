// Shared: verify a JWS signed by the App Store (StoreKit 2 transactions,
// renewal info, and App Store Server Notifications V2 payloads all use it).
// apple-iap and apple-notifications both call this one function.
//
// Checks, in order:
//   - header alg is ES256 and carries exactly three x5c certificates
//     (leaf, intermediate, root), none oversized
//   - every certificate is inside its validity window
//   - each certificate is signed by the next one up the chain
//   - the root is byte-identical to Apple Root CA - G3 (fetched once from
//     apple.com over TLS and cached; pin it offline with APPLE_ROOT_CA_B64)
//   - the intermediate is a CA (basicConstraints) and carries Apple's WWDR
//     marker extension 1.2.840.113635.100.6.2.1; the leaf carries the App Store
//     signing extension 1.2.840.113635.100.6.11.1. Both are read as real v3
//     extensions (der.ts), so a certificate Apple issued for some other purpose
//     that also chains to the G3 root can't sign a fake transaction.
//   - the ES256 signature verifies against the leaf's public key
//
// Returns the decoded JSON payload. Throws on any failure.

import * as jose from "npm:jose@5";
import { X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";
import { certExtensions, isCaCert, OID_APPLE_APPSTORE_LEAF, OID_APPLE_WWDR_INTERMEDIATE } from "./der.ts";

const APPLE_ROOT_URL = "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer";
let _appleRootDer: Buffer | null = null;

async function appleRootDer(): Promise<Buffer> {
  if (_appleRootDer) return _appleRootDer;
  const pinned = Deno.env.get("APPLE_ROOT_CA_B64");
  if (pinned) {
    _appleRootDer = Buffer.from(pinned, "base64");
    return _appleRootDer;
  }
  const res = await fetch(APPLE_ROOT_URL);
  if (!res.ok) throw new Error("apple_root_fetch_failed");
  _appleRootDer = Buffer.from(await res.arrayBuffer());
  return _appleRootDer;
}

export async function verifyAppleJws(jws: string): Promise<Record<string, unknown>> {
  if (!jws || typeof jws !== "string" || jws.length > 30000) throw new Error("bad_jws");
  const header = jose.decodeProtectedHeader(jws);
  const x5c = header.x5c as string[] | undefined;
  if (header.alg !== "ES256" || !Array.isArray(x5c) || x5c.length !== 3) throw new Error("bad_header");
  if (x5c.some((b64) => typeof b64 !== "string" || b64.length > 8000)) throw new Error("bad_header");

  const ders = x5c.map((b64) => Buffer.from(b64, "base64"));
  const certs = ders.map((d) => new X509Certificate(d));
  const now = new Date();
  for (const c of certs) {
    if (new Date(c.validFrom) > now || new Date(c.validTo) < now) throw new Error("cert_expired");
  }
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) throw new Error("chain_broken");
  }
  if (Buffer.compare(certs[2].raw, await appleRootDer()) !== 0) throw new Error("untrusted_root");
  if (!isCaCert(ders[1]) || !certExtensions(ders[1])[OID_APPLE_WWDR_INTERMEDIATE]) throw new Error("bad_intermediate");
  if (!certExtensions(ders[0])[OID_APPLE_APPSTORE_LEAF]) throw new Error("bad_leaf");

  const leafPem = certs[0].publicKey.export({ type: "spki", format: "pem" }) as string;
  const key = await jose.importSPKI(leafPem, "ES256");
  const { payload } = await jose.compactVerify(jws, key, { algorithms: ["ES256"] });
  return JSON.parse(new TextDecoder().decode(payload));
}
