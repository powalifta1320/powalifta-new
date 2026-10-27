// Shared push delivery for server-side jobs (send-weekly-digest's coach report and Thursday check).
// The delivery half of send-push, copied rather than shared so send-push stays exactly as it was:
// Web Push (VAPID) to every web subscription, APNs to every iOS token when the APNS_* secrets are
// set, dead endpoints pruned. The caller is trusted server code (no JWT here): it decides who gets
// what, and this honours the RECIPIENT's switch for the category (push-rules.ts: alerts →
// push_alerts, form_checks → push_form_checks, messages → push_messages, program → push_program;
// a missing row or column delivers, only an explicit false mutes).
//
// Secrets (the same names as send-push): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (optional),
// APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID (optional: no APNs without them), APNS_BUNDLE_ID, APNS_PRODUCTION.
// Without the VAPID pair, deliver() sends nothing and says so ({ sent: 0, note: 'push not configured' }).
import webpush from 'npm:web-push@3.6.7'
import { collapseId, isApnsToken, isMuted, isPushHost, prefColumn, safePath } from './push-rules.ts'

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:powalifta1320@gmail.com'
const APNS_KEY = Deno.env.get('APNS_KEY') || ''
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') || ''
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') || ''
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') || 'com.powalifta.app'
const APNS_PRODUCTION = (Deno.env.get('APNS_PRODUCTION') || 'true') !== 'false'

export interface PushPayload { title: string; body: string; url?: string; tag?: string }
export interface DeliverResult { sent: number; pruned: number; muted?: boolean; note?: string }

// --- APNs (iOS native push), as send-push ------------------------------------------------------
function b64url(input: Uint8Array | string): string {
  const s = typeof input === 'string' ? input : String.fromCharCode(...input)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function importApnsKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}
// One ES256 provider token per run, reused for up to 40 minutes (Apple accepts one for an hour and
// refuses a new one more often than every 20 minutes), so a batch of coaches doesn't sign one each.
let _apns: { jwt: string; at: number } | null = null
async function apnsJwt(): Promise<string> {
  if (_apns && Date.now() - _apns.at < 40 * 60 * 1000) return _apns.jwt
  const key = await importApnsKey(APNS_KEY)
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }))
  const claims = b64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(header + '.' + claims)))
  _apns = { jwt: header + '.' + claims + '.' + b64url(sig), at: Date.now() }
  return _apns.jwt
}
async function sendApns(jwt: string, token: string, n: { title: string; body: string; url: string; tag: string }): Promise<'sent' | 'dead' | 'skip'> {
  try {
    const host = APNS_PRODUCTION ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'
    const headers: Record<string, string> = {
      'authorization': `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    }
    const cid = collapseId(n.tag)
    if (cid) headers['apns-collapse-id'] = cid
    const res = await fetch(`https://${host}/3/device/${token}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ aps: { alert: { title: n.title, body: n.body }, sound: 'default' }, url: n.url, tag: n.tag }),
    })
    if (res.status === 200) return 'sent'
    if (res.status === 410) return 'dead'
    return 'skip'
  } catch { return 'skip' }
}

// deliver(admin, userId, payload, category[, { pref }]): every device of one user. `pref` is the
// recipient's email_preferences row when the caller already has it (a batch reads them all at once);
// without it the row is read here. Never throws for a delivery problem; a failed device lookup does.
// deno-lint-ignore no-explicit-any
export async function deliver(admin: any, userId: string, payload: PushPayload, category: string, opts?: { pref?: Record<string, unknown> | null }): Promise<DeliverResult> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return { sent: 0, pruned: 0, note: 'push not configured' }
  const col = prefColumn(category)
  if (col) {
    let pref = opts && 'pref' in opts ? opts.pref : undefined
    if (pref === undefined) {
      try {
        const { data, error } = await admin.from('email_preferences').select(col).eq('user_id', userId).limit(1).maybeSingle()
        pref = error ? null : data   // a missing column / row: send (absence = opted in)
      } catch (_) { pref = null }
    }
    if (isMuted(pref, category)) return { sent: 0, pruned: 0, muted: true }
  }

  const { data: subs, error: subErr } = await admin.from('push_subscriptions').select('*').eq('user_id', userId)
  if (subErr) throw new Error('push lookup failed')
  if (!subs || !subs.length) return { sent: 0, pruned: 0, note: 'no devices' }

  const notif = {
    title: String(payload.title || 'POWALIFTA').slice(0, 120),
    body: String(payload.body || '').slice(0, 300),
    url: safePath(payload.url, '/coach.html'),
    tag: String(payload.tag || 'powa').slice(0, 60),
  }
  // deno-lint-ignore no-explicit-any
  const webSubs = subs.filter((s: any) => !s.platform || s.platform === 'web')
  // deno-lint-ignore no-explicit-any
  const iosSubs = subs.filter((s: any) => s.platform === 'ios')
  let sent = 0
  const dead: string[] = []

  if (webSubs.length) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    const body = JSON.stringify(notif)
    // deno-lint-ignore no-explicit-any
    await Promise.all(webSubs.map(async (s: any) => {
      if (!isPushHost(s.endpoint)) { dead.push(s.id); return }   // not a push service: never contacted, pruned
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body)
        sent++
      } catch (err) {
        // deno-lint-ignore no-explicit-any
        const code = (err as any)?.statusCode
        if (code === 404 || code === 410) dead.push(s.id)
      }
    }))
  }
  if (iosSubs.length && APNS_KEY && APNS_KEY_ID && APNS_TEAM_ID) {
    try {
      const jwt = await apnsJwt()
      // deno-lint-ignore no-explicit-any
      await Promise.all(iosSubs.map(async (s: any) => {
        if (!isApnsToken(s.endpoint)) { dead.push(s.id); return }
        const r = await sendApns(jwt, String(s.endpoint), notif)
        if (r === 'sent') sent++
        else if (r === 'dead') dead.push(s.id)
      }))
    } catch (_) { /* a bad or missing APNs key: web pushes already went */ }
  }
  if (dead.length) {
    try { await admin.from('push_subscriptions').delete().in('id', dead) } catch (_) { /* pruned next time */ }
  }
  return { sent, pruned: dead.length }
}
