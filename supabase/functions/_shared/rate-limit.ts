// Shared rate-limiter for POWALIFTA edge functions.
//
// Backed by the `edge_rate_limits` table + `rl_bump` RPC
// (sql/migration-edge-rate-limits.sql). A fixed-window counter keyed by
// (bucket, identity, window). One atomic round-trip per check.
//
// DESIGN: fail-OPEN. A rate limiter must never take the app down. If the RPC
// is missing (migration not applied yet), errors, or times out, `rateLimit`
// returns { ok: true, degraded: true } and the caller proceeds as normal.
// That's what makes wiring this into a function SAFE to deploy before the
// migration runs — worst case it's a no-op until the table exists.
//
// Files under _shared/ are bundled into each function that imports them; the
// Supabase CLI does NOT deploy a leading-underscore dir as its own function.
//
// Usage inside a function (after you have a service-role `admin` client):
//
//   import { clientIp, rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
//   const rl = await rateLimit(admin, {
//     bucket: 'welcome-ip', identity: clientIp(req), limit: 20, windowSecs: 3600,
//   });
//   if (!rl.ok) return rateLimitResponse(rl, corsHeaders);
//
// For an unauthenticated function with no service client yet, create one from
// the platform-injected env vars (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are
// auto-populated in every edge function). If they're absent (self-hosted), the
// limiter degrades to fail-open.

// deno-lint-ignore no-explicit-any
type Admin = any; // SupabaseClient — kept loose so this file has no hard import.

export interface RateVerdict {
  ok: boolean;          // true = under the cap (proceed); false = over (429)
  count: number;        // requests seen in this window (0 when degraded)
  limit: number;        // the cap that was applied
  resetAt: string | null; // ISO time the window rolls over, when known
  retryAfter: number;   // seconds until reset (for the Retry-After header)
  degraded: boolean;    // true = meter unavailable, decision defaulted to allow
}

export interface RateOpts {
  bucket: string;       // logical limiter name, e.g. 'client-error'
  identity: string;     // IP / user id / email being limited
  limit: number;        // max requests per window
  windowSecs: number;   // window length in seconds
}

// Best-effort client IP. Supabase/Cloud fronts requests with x-forwarded-for;
// the first hop is the real client. Never throws — returns 'unknown' if absent.
export function clientIp(req: Request): string {
  try {
    const xff = req.headers.get('x-forwarded-for') || '';
    const first = xff.split(',')[0].trim();
    if (first) return first.slice(0, 64);
    const real = (req.headers.get('x-real-ip') || '').trim();
    if (real) return real.slice(0, 64);
  } catch { /* fall through */ }
  return 'unknown';
}

function secondsUntil(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t - Date.now()) / 1000));
}

// Increment the counter for (bucket, identity) and report whether the caller
// is still under the cap. Fail-open on any error.
export async function rateLimit(admin: Admin, opts: RateOpts): Promise<RateVerdict> {
  const base: RateVerdict = {
    ok: true, count: 0, limit: opts.limit, resetAt: null, retryAfter: 0, degraded: true,
  };
  if (!admin || !opts.identity) return base; // nothing to key on → allow
  try {
    const { data, error } = await admin.rpc('rl_bump', {
      p_bucket: opts.bucket,
      p_identity: String(opts.identity).slice(0, 128),
      p_window_secs: opts.windowSecs,
      p_limit: opts.limit,
    });
    if (error) {
      // Missing RPC (migration not applied) or a transient DB error → fail open.
      console.error('rate-limit rl_bump error:', error.message || error);
      return base;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return base;
    const resetAt = row.reset_at ?? null;
    return {
      ok: !!row.allowed,
      count: typeof row.cur === 'number' ? row.cur : 0,
      limit: typeof row.limit_val === 'number' ? row.limit_val : opts.limit,
      resetAt,
      retryAfter: secondsUntil(resetAt),
      degraded: false,
    };
  } catch (e) {
    console.error('rate-limit threw:', (e as Error)?.message || e);
    return base;
  }
}

// Standard 429 for an over-limit verdict, with a Retry-After header.
export function rateLimitResponse(
  verdict: RateVerdict,
  extraHeaders: Record<string, string> = {},
): Response {
  const retry = verdict.retryAfter || 60;
  return new Response(
    JSON.stringify({
      error: 'rate_limited',
      message: 'Too many requests. Please slow down and try again shortly.',
      retryAfter: retry,
    }),
    {
      status: 429,
      headers: {
        ...extraHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(retry),
      },
    },
  );
}
