// Shared push rules (pure: no Deno, no network), used by _shared/push-deliver.ts and tested under Node
// (test/coach-jobs.test.mjs). The same rules send-push applies inline: which email_preferences switch
// mutes a category, the same-origin path a push may open, the push services a web endpoint may point
// at, and what an APNs device token looks like.

// A category → the recipient's switch (email_preferences). Only an explicit false mutes; a missing row
// or column sends ("absence = opted in", as everywhere else). Unknown categories are never muted.
export const CATEGORY_COL: Record<string, string> = {
  messages: 'push_messages',
  form_checks: 'push_form_checks',
  program: 'push_program',
  alerts: 'push_alerts', // coach alerts: a lifter's PR, Thursday's missed sessions, Monday's summary
}

export function prefColumn(category: string): string | null {
  return Object.prototype.hasOwnProperty.call(CATEGORY_COL, category) ? CATEGORY_COL[category] : null
}

export function isMuted(pref: Record<string, unknown> | null | undefined, category: string): boolean {
  const col = prefColumn(category)
  return !!(col && pref && pref[col] === false)
}

// Only a leading-slash path on our own origin, never a protocol-relative "//host" (send-push's rule,
// with its comment's "leading slash" enforced: a bare "nope" is the fallback, not "/nope").
export function safePath(raw: unknown, fallback = '/athlete.html'): string {
  const s = typeof raw === 'string' ? raw.slice(0, 300) : ''
  if (!s || s.charAt(0) !== '/') return fallback
  try {
    const u = new URL(s, 'https://www.powalifta.com')
    if (u.origin === 'https://www.powalifta.com' && !/[\\\u0000-\u001f]/.test(s) && !u.pathname.startsWith('//')) return u.pathname + u.search
  } catch (_) { /* the fallback */ }
  return fallback
}

// A stored web endpoint that isn't a push service is never contacted (and gets pruned).
export const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)\//i
export function isPushHost(endpoint: unknown): boolean { return PUSH_HOST.test(String(endpoint || '')) }
export function isApnsToken(token: unknown): boolean { return /^[0-9a-f]{64,200}$/i.test(String(token || '')) }

// APNs collapses notifications that share an apns-collapse-id (at most 64 bytes): a newer Monday
// summary replaces last week's on iOS, the way the tag already does on the web.
export function collapseId(tag: unknown): string | null {
  const s = typeof tag === 'string' ? tag : ''
  return s && s.length <= 64 && /^[\x20-\x7e]+$/.test(s) ? s : null
}
