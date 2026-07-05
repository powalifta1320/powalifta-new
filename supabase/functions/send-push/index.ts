// Supabase Edge Function: send-push
//
// Delivers a Web Push notification to every device a given user has
// registered (rows in `push_subscriptions`). The browser's service
// worker `push` handler renders it (see sw.js).
//
// Auth model (Verify JWT **ON**): the CALLER is identified from their
// session JWT. A caller may push to:
//   - themselves (the "send a test notification" button), or
//   - the other party of a LIVE coach↔athlete link (so a coach can
//     ping their athlete when a program/message lands, and vice-versa).
// This mirrors the messages-table RLS exactly. Anyone else → 403.
//
// The recipient's subscription rows are read with the SERVICE ROLE
// (bypasses RLS) — callers can never read someone else's push tokens.
// Dead endpoints (404/410 from the push service) are pruned on the fly.
//
// Deploy:
//   supabase functions deploy send-push
//
// Required secrets (`supabase secrets set ...`):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   VAPID_PUBLIC_KEY     -- same key the browser subscribes with
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT        -- e.g. mailto:powalifta1320@gmail.com
//
// Generate a VAPID keypair once (Node): `npx web-push generate-vapid-keys`
// Put the PUBLIC key in app.js (VAPID_PUBLIC_KEY) and here; PRIVATE stays a secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:powalifta1320@gmail.com'

// --- Native push (APNs) — PREP. Set these secrets to deliver to iOS devices
// (rows with platform='ios'). Until set, native rows are skipped (Web Push is
// unaffected). Get the .p8 key + Key ID from developer.apple.com → Keys, Team ID
// from Membership. APNS_KEY = the FULL .p8 file contents (BEGIN/END included).
const APNS_KEY = Deno.env.get('APNS_KEY') || ''
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') || ''
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') || ''
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') || 'com.powalifta.app'
const APNS_PRODUCTION = (Deno.env.get('APNS_PRODUCTION') || 'true') !== 'false'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const clip = (s: unknown, n: number) =>
  typeof s === 'string' ? s.slice(0, n) : ''

// --- APNs (iOS native push) helpers -----------------------------------------
function b64url(input: Uint8Array | string): string {
  const s = typeof input === 'string' ? input : String.fromCharCode(...input)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function importApnsKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}
// ES256-signed provider JWT (reusable up to ~1h; we mint one per invocation).
async function apnsJwt(): Promise<string> {
  const key = await importApnsKey(APNS_KEY)
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID }))
  const claims = b64url(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(header + '.' + claims)))
  return header + '.' + claims + '.' + b64url(sig)
}
// Deliver one alert to an iOS device token. Returns 'sent' | 'dead' | 'skip'.
async function sendApns(jwt: string, token: string, n: { title: string; body: string; url: string; tag: string }): Promise<'sent' | 'dead' | 'skip'> {
  try {
    const host = APNS_PRODUCTION ? 'api.push.apple.com' : 'api.sandbox.push.apple.com'
    const res = await fetch(`https://${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwt}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ aps: { alert: { title: n.title, body: n.body }, sound: 'default' }, url: n.url, tag: n.tag }),
    })
    if (res.status === 200) return 'sent'
    if (res.status === 410) return 'dead' // Unregistered — token no longer valid
    return 'skip'
  } catch { return 'skip' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (!SUPABASE_URL || !SERVICE_ROLE || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    return json({ error: 'server not configured' }, 500)
  }

  // Identify the caller from their JWT.
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'missing auth' }, 401)

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) return json({ error: 'invalid session' }, 401)
  const callerId = userData.user.id

  // Per-caller ceiling. Push is authorized to self or a linked party, but a
  // looping session could still spam a target's devices — cap the send rate.
  // Higher than the mail limits (notifications are legitimately chattier).
  // Fails open if the meter (rl_bump) isn't deployed yet.
  const rl = await rateLimit(admin, {
    bucket: 'push', identity: callerId, limit: 180, windowSecs: 3600,
  })
  if (!rl.ok) return rateLimitResponse(rl, cors)

  let payload: any
  try { payload = await req.json() } catch { return json({ error: 'invalid json' }, 400) }

  const toUserId = clip(payload.toUserId, 64)
  const title = clip(payload.title, 120) || 'POWALIFTA'
  const body = clip(payload.body, 300)
  const url = clip(payload.url, 300) || '/athlete.html'
  const tag = clip(payload.tag, 60) || 'powa'
  const category = clip(payload.category, 30) // 'messages' | 'form_checks' | 'program' | ''
  if (!toUserId) return json({ error: 'toUserId required' }, 400)
  // toUserId is interpolated into the PostgREST .or() filter below and comes
  // straight from the request body. Pin it to a bare UUID — a crafted value
  // containing PostgREST operator chars ( . , ( ) ) could otherwise rewrite the
  // authorization filter and let a caller notify users they aren't linked to.
  if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(toUserId)) {
    return json({ error: 'toUserId must be a uuid' }, 400)
  }

  // Authorize: self, or a live coach↔athlete link in either direction.
  let allowed = callerId === toUserId
  if (!allowed) {
    const { data: link } = await admin
      .from('profiles')
      .select('id, coach_id')
      .or(`and(id.eq.${callerId},coach_id.eq.${toUserId}),and(id.eq.${toUserId},coach_id.eq.${callerId})`)
      .limit(1)
    allowed = !!(link && link.length)
  }
  if (!allowed) return json({ error: 'not authorized to notify this user' }, 403)

  // Respect the RECIPIENT's per-category push preference (#30). The column set
  // ships with migration-notification-prefs.sql; until then (or if the row is
  // absent) we FAIL OPEN and send — matching "absence = opted in" everywhere
  // else. Only an explicit `false` mutes the delivery.
  const CATEGORY_COL: Record<string, string> = {
    messages: 'push_messages',
    form_checks: 'push_form_checks',
    program: 'push_program',
  }
  const prefCol = CATEGORY_COL[category]
  if (prefCol) {
    try {
      const { data: pref, error: prefErr } = await admin
        .from('email_preferences')
        .select(prefCol)
        .eq('user_id', toUserId)
        .limit(1)
        .maybeSingle()
      // Only skip on an explicit opt-out; ignore errors (e.g. column not yet migrated).
      if (!prefErr && pref && (pref as Record<string, unknown>)[prefCol] === false) {
        return json({ ok: true, sent: 0, note: 'muted' })
      }
    } catch (_e) { /* fail open */ }
  }

  // Look up the recipient's devices.
  // `select('*')` so the platform column is included when present; a
  // pre-migration DB simply has no `platform` field → those rows are web.
  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', toUserId)
  if (subErr) return json({ error: 'lookup failed' }, 500)
  if (!subs || !subs.length) return json({ ok: true, sent: 0, note: 'no devices' })

  const notif = { title, body, url, tag }
  const webSubs = subs.filter((s: any) => !s.platform || s.platform === 'web')
  const iosSubs = subs.filter((s: any) => s.platform === 'ios')
  // Android/FCM is a later phase; those rows are skipped for now.

  let sent = 0
  const dead: string[] = []

  // Web Push (VAPID) — unchanged.
  if (webSubs.length) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    const notification = JSON.stringify(notif)
    await Promise.all(webSubs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notification,
        )
        sent++
      } catch (err: any) {
        const code = err?.statusCode
        if (code === 404 || code === 410) dead.push(s.id) // gone → prune
      }
    }))
  }

  // APNs (iOS native). Gated on the APNS_* secrets; skipped cleanly if unset,
  // so Web Push still works before the native push credentials are configured.
  if (iosSubs.length && APNS_KEY && APNS_KEY_ID && APNS_TEAM_ID) {
    try {
      const jwt = await apnsJwt()
      await Promise.all(iosSubs.map(async (s: any) => {
        const r = await sendApns(jwt, s.endpoint, notif)
        if (r === 'sent') sent++
        else if (r === 'dead') dead.push(s.id)
      }))
    } catch (_e) { /* bad/absent APNs key → skip native; web already delivered */ }
  }

  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('id', dead)
  }

  return json({ ok: true, sent, pruned: dead.length })
})
