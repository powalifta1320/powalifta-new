// Shared: verify a JWS signed by the App Store (StoreKit 2 transactions,
// renewal info, and App Store Server Notifications V2 payloads all use it).
//
// Checks, in order:
//   - header alg is ES256 and carries an x5c chain (leaf, intermediate, root)
//   - every certificate is inside its validity window
//   - each certificate is signed by the next one up the chain
//   - the root is byte-identical to Apple Root CA - G3 (fetched once from
//     apple.com over TLS and cached; pin it offline with APPLE_ROOT_CA_B64)
//   - the intermediate carries Apple's WWDR marker OID 1.2.840.113635.100.6.2.1
//     and the leaf carries the App Store signing OID 1.2.840.113635.100.6.11.1,
//     so a certificate Apple issued for some other purpose (which also chains
//     to the G3 root) can't be used to sign a fake transaction
//   - the ES256 signature verifies against the leaf's public key
//
// Returns the decoded JSON payload. Throws on any failure.

import * as jose from "npm:jose@5";
import { X509Certificate } from "node:crypto";
import { Buffer } from "node:buffer";

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

// DER encodings of the two marker OIDs (tag 06, length 0A, value).
const OID_WWDR_INTERMEDIATE = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x02, 0x01]);
const OID_APPSTORE_LEAF = Buffer.from([0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01]);

export async function verifyAppleJws(jws: string): Promise<Record<string, unknown>> {
  if (!jws || typeof jws !== "string" || jws.length > 30000) throw new Error("bad_jws");
  const header = jose.decodeProtectedHeader(jws);
  const x5c = header.x5c as string[] | undefined;
  if (header.alg !== "ES256" || !x5c || x5c.length < 3) throw new Error("bad_header");

  const certs = x5c.map((b64) => new X509Certificate(Buffer.from(b64, "base64")));
  const now = new Date();
  for (const c of certs) {
    if (new Date(c.validFrom) > now || new Date(c.validTo) < now) throw new Error("cert_expired");
  }
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) throw new Error("chain_broken");
  }
  const root = certs[certs.length - 1];
  if (Buffer.compare(root.raw, await appleRootDer()) !== 0) throw new Error("untrusted_root");
  if (certs[1].raw.indexOf(OID_WWDR_INTERMEDIATE) < 0) throw new Error("bad_intermediate");
  if (certs[0].raw.indexOf(OID_APPSTORE_LEAF) < 0) throw new Error("bad_leaf");

  const leafPem = certs[0].publicKey.export({ type: "spki", format: "pem" }) as string;
  const key = await jose.importSPKI(leafPem, "ES256");
  const { payload } = await jose.compactVerify(jws, key, { algorithms: ["ES256"] });
  return JSON.parse(new TextDecoder().decode(payload));
}
