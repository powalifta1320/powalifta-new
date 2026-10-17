// Shared: a minimal DER walker for X.509, just enough to read a certificate's
// v3 extensions (OID → value) without a parsing library. Used by apple-jws.ts to
// check Apple's marker OIDs properly (as real extensions, not as bytes that
// happen to appear somewhere in the certificate). Throws on malformed input.
// No imports, so it also runs under plain Node for testing.

type TLV = { tag: number; start: number; end: number };

function readTLV(buf: Uint8Array, off: number): TLV {
  if (off + 2 > buf.length) throw new Error("der_truncated");
  const tag = buf[off];
  let len = buf[off + 1];
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 4 || start + n > buf.length) throw new Error("der_length");
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + buf[start + i];
    start += n;
  }
  const end = start + len;
  if (end > buf.length) throw new Error("der_truncated");
  return { tag, start, end };
}

function children(buf: Uint8Array, parent: TLV): TLV[] {
  const out: TLV[] = [];
  for (let off = parent.start; off < parent.end;) {
    const t = readTLV(buf, off);
    out.push(t);
    off = t.end;
  }
  return out;
}

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// { oidHex: extnValue bytes } for every v3 extension of the certificate.
export function certExtensions(der: Uint8Array): Record<string, Uint8Array> {
  const cert = readTLV(der, 0);
  if (cert.tag !== 0x30) throw new Error("der_not_cert");
  const tbs = children(der, cert)[0];
  if (!tbs || tbs.tag !== 0x30) throw new Error("der_no_tbs");
  const out: Record<string, Uint8Array> = {};
  for (const field of children(der, tbs)) {
    if (field.tag !== 0xa3) continue; // [3] EXPLICIT Extensions
    const seq = children(der, field)[0];
    if (!seq || seq.tag !== 0x30) throw new Error("der_ext");
    for (const ext of children(der, seq)) {
      const parts = children(der, ext);
      const oid = parts[0], val = parts[parts.length - 1];
      if (!oid || oid.tag !== 0x06 || !val || val.tag !== 0x04) throw new Error("der_ext_item");
      out[hex(der.subarray(oid.start, oid.end))] = der.subarray(val.start, val.end);
    }
  }
  return out;
}

// basicConstraints (2.5.29.19) present with cA = TRUE.
export function isCaCert(der: Uint8Array): boolean {
  const v = certExtensions(der)["551d13"];
  if (!v) return false;
  const seq = readTLV(v, 0);
  if (seq.tag !== 0x30 || seq.start >= seq.end) return false;
  const first = readTLV(v, seq.start);
  return first.tag === 0x01 && v[first.start] !== 0;
}

// Apple's marker OIDs (value bytes, hex).
export const OID_APPLE_WWDR_INTERMEDIATE = "2a864886f76364060201"; // 1.2.840.113635.100.6.2.1
export const OID_APPLE_APPSTORE_LEAF = "2a864886f76364060b01";     // 1.2.840.113635.100.6.11.1
