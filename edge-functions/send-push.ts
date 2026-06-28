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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:powalifta1320@gmail.com'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const clip = (s: unknown, n: number) =>
  typeof s === 'string' ? s.slice(0, n) : ''

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

  let payload: any
  try { payload = await req.json() } catch { return json({ error: 'invalid json' }, 400) }

  const toUserId = clip(payload.toUserId, 64)
  const title = clip(payload.title, 120) || 'POWALIFTA'
  const body = clip(payload.body, 300)
  const url = clip(payload.url, 300) || '/athlete.html'
  const tag = clip(payload.tag, 60) || 'powa'
  if (!toUserId) return json({ error: 'toUserId required' }, 400)

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

  // Look up the recipient's devices.
  const { data: subs, error: subErr } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', toUserId)
  if (subErr) return json({ error: 'lookup failed' }, 500)
  if (!subs || !subs.length) return json({ ok: true, sent: 0, note: 'no devices' })

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
  const notification = JSON.stringify({ title, body, url, tag })

  let sent = 0
  const dead: string[] = []
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        notification,
      )
      sent++
    } catch (err: any) {
      // 404/410 = subscription is gone; mark for pruning.
      const code = err?.statusCode
      if (code === 404 || code === 410) dead.push(s.id)
    }
  }))

  if (dead.length) {
    await admin.from('push_subscriptions').delete().in('id', dead)
  }

  return json({ ok: true, sent, pruned: dead.length })
})
