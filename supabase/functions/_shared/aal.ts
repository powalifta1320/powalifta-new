// Two-factor for the edge functions (sql/migration-mfa-aal2-2026-10-28.sql, STATUS-check row 60).
//
// The database refuses an aal1 session of an account with a verified authenticator (RLS), but the functions
// below act with the service role, which RLS never sees. So every function that acts for a signed-in user
// checks it itself, right after auth.getUser(jwt) has accepted the token:
//
//   if (owesSecondFactor(jwt, userData.user)) return json(SECOND_FACTOR, 403);
//
// getUser is what proves the token is real (Auth checks the signature and the session); this only reads the
// aal claim of that same token and the factors Auth returned with the user (GoTrue's /user lists them: the
// list supabase-js's mfa.listFactors() reads). Used by delete-account, ls-portal, apple-iap, send-invite,
// send-program-assigned, send-push, program-read and ai-chat (the eight Verify-JWT functions).
//
// Fails closed: when the account has a verified factor, a token without a readable aal2 claim is refused.
// The refusal's words contain "Not authenticated" on purpose: app.js treats that as a session to sign in again.

export type AuthUser = { factors?: unknown } | null | undefined;

export const SECOND_FACTOR = {
  error: 'Not authenticated: this account needs its two-factor code',
  code: 'aal2_required',
};

// true = refuse: the account has a verified authenticator and this token is not at aal2.
export function owesSecondFactor(jwt: string, user: AuthUser): boolean {
  const factors = user && Array.isArray(user.factors) ? user.factors : [];
  const verified = factors.some((f) => !!f && typeof f === 'object' && (f as { status?: unknown }).status === 'verified');
  if (!verified) return false;
  return jwtAal(jwt) !== 'aal2';
}

// The aal claim of a JWT's payload, or null when there is none or it can't be read.
export function jwtAal(jwt: string): string | null {
  try {
    const part = String(jwt || '').split('.')[1] || '';
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims.aal === 'string' ? claims.aal : null;
  } catch {
    return null;
  }
}
