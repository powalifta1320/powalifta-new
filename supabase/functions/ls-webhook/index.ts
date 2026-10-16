// Supabase Edge Function: ls-webhook
// Receives webhook events from Lemon Squeezy and updates the matching coach's
// subscription_tier in profiles. Uses service_role to bypass RLS.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Map LS variant name → POWALIFTA tier. Falls back to fuzzy substring match
// so it doesn't matter how the coach named their variants in LS
// (e.g. "Basic Plan", "POWALIFTA Pro", "Premium Tier" all resolve correctly).
const VARIANT_TO_TIER: Record<string, 'basic' | 'pro' | 'premium'> = {
  'basic': 'basic',
  'pro': 'pro',
  'premium': 'premium'
}

function resolveTier(variantName: string, priceCents?: number): 'basic' | 'pro' | 'premium' | null {
  const v = (variantName || '').toLowerCase().trim()
  // Exact match first
  if (VARIANT_TO_TIER[v]) return VARIANT_TO_TIER[v]
  // Fuzzy substring (order matters — check 'premium' before 'pro' since 'premium' contains nothing that overlaps)
  if (v.includes('premium')) return 'premium'
  if (v.includes('pro')) return 'pro'  // catches "pro plan", "powalifta pro"
  if (v.includes('basic') || v.includes('starter') || v.includes('lite')) return 'basic'
  // Last resort: map by price ($25/$50/$100 from app.js TIER_PRICES)
  if (typeof priceCents === 'number' && priceCents > 0) {
    const usd = priceCents / 100
    if (usd >= 80) return 'premium'
    if (usd >= 40) return 'pro'
    if (usd >= 15) return 'basic'
  }
  return null
}

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signed = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
    const expected = Array.from(new Uint8Array(signed))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return await timingSafeEqual(expected, signature)
  } catch (e) {
    console.error('verifySignature crashed:', e)
    return false
  }
}

// Constant-time string compare with no length side-channel. Both inputs are
// run through HMAC with a single-use random key, so we only ever compare
// fixed-length (32-byte) digests — neither the length nor the content of the
// candidate signature affects timing.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const randKey = await crypto.subtle.importKey(
    'raw', crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const da = new Uint8Array(await crypto.subtle.sign('HMAC', randKey, enc.encode(a)))
  const db = new Uint8Array(await crypto.subtle.sign('HMAC', randKey, enc.encode(b)))
  let diff = 0
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i]
  return diff === 0
}

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  // Catch absolutely everything so we never return a bare 500
  try {
    if (req.method !== 'POST') {
      return jsonResponse(405, { error: 'Method not allowed' })
    }

    let rawBody = ''
    try { rawBody = await req.text() }
    catch (e) { console.warn('LS webhook: cannot read body', String(e)); return jsonResponse(400, { error: 'cannot read body' }) }

    const signature = req.headers.get('X-Signature') || req.headers.get('x-signature') || ''
    const secret = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET') || ''

    if (!secret) {
      console.error('LEMON_SQUEEZY_WEBHOOK_SECRET env var is not set')
      return jsonResponse(500, { error: 'internal error' })
    }

    const valid = await verifySignature(rawBody, signature, secret)
    if (!valid) {
      // Return nothing beyond the verdict — body length / signature-presence /
      // hint are a free oracle for an unauthenticated caller probing the endpoint.
      return jsonResponse(401, { error: 'invalid signature' })
    }

    let payload: any
    try { payload = JSON.parse(rawBody) }
    catch (e) { console.warn('LS webhook: invalid JSON', String(e)); return jsonResponse(400, { error: 'invalid JSON' }) }

    const event = payload?.meta?.event_name as string
    const data = payload?.data
    if (!event || !data) {
      console.warn('LS webhook: unexpected payload shape', { hasMeta: !!payload?.meta, hasData: !!data })
      return jsonResponse(400, { error: 'unexpected payload shape' })
    }

    const attrs = data.attributes || {}
    const customerEmail = String(attrs.user_email || '').toLowerCase().trim()
    const subscriptionId = String(data.id || '')
    const customerId = attrs.customer_id != null ? String(attrs.customer_id) : null
    const variantName = String(attrs.variant_name || '').toLowerCase().trim()
    const status = String(attrs.status || '')
    // LS sends prices in cents on the first_subscription_item.price object, or
    // on the top-level attrs depending on event shape. Try both.
    const priceCents = Number(
      attrs?.first_subscription_item?.price ||
      attrs?.subtotal ||
      attrs?.total ||
      0
    )

    const customUserId =
      payload?.meta?.custom_data?.user_id ||
      attrs?.first_subscription_item?.custom_data?.user_id ||
      null

    // No PII in logs (function logs are retained) — log event shape only.
    console.log('LS webhook fired:', { event, variantName, priceCents, hasEmail: !!customerEmail, hasUserId: !!customUserId })

    let tier: 'free' | 'basic' | 'pro' | 'premium' | null = null
    if (
      event === 'subscription_created' ||
      event === 'subscription_updated' ||
      event === 'subscription_resumed' ||
      event === 'subscription_unpaused'
    ) {
      tier = resolveTier(variantName, priceCents)
    } else if (event === 'subscription_expired') {
      tier = 'free'
    } else if (event === 'subscription_cancelled') {
      tier = resolveTier(variantName, priceCents)
    } else {
      return jsonResponse(200, { ignored: event })
    }

    if (!tier) {
      console.warn('No tier match — webhook ignored', { variantName, priceCents })
      return jsonResponse(200, { ignored: event, reason: 'no tier match' })
    }

    const supaUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supaUrl || !serviceKey) {
      console.error('Supabase env vars missing', { hasUrl: !!supaUrl, hasServiceKey: !!serviceKey })
      return jsonResponse(500, { error: 'internal error' })
    }

    const supabase = createClient(supaUrl, serviceKey)

    // ---- Resolve the target profile, AUTHORITATIVELY ----
    // custom_data.user_id is client-controlled (it rides the checkout URL, app.js),
    // so it must NEVER be trusted on its own to pick whose tier we write — an
    // attacker could point their own paid checkout at a victim's uuid. We resolve a
    // candidate, then require the candidate profile's email to equal the LS
    // checkout email (user_email is part of the HMAC-signed body). Only an
    // email-verified match is accepted.
    let candidateId: string | null = customUserId ? String(customUserId) : null
    let profileRow: { id: string; email: string; subscription_updated_at: string | null } | null = null

    if (candidateId) {
      const byId = await supabase
        .from('profiles')
        .select('id, email, subscription_updated_at')
        .eq('id', candidateId)
        .limit(1)
      if (byId.error) { console.error('profile lookup (id) failed:', byId.error.message); return jsonResponse(500, { error: 'internal error' }) }
      const row = byId.data?.[0]
      // Accept only if the row's email matches the signed checkout email.
      if (row && customerEmail && String(row.email || '').toLowerCase().trim() === customerEmail) {
        profileRow = row as any
      } else {
        console.warn('custom_data.user_id did not match checkout email — falling back to email lookup', { hadRow: !!row })
      }
    }
    if (!profileRow && customerEmail) {
      const byEmail = await supabase
        .from('profiles')
        .select('id, email, subscription_updated_at')
        .eq('email', customerEmail)
        .limit(1)
      if (byEmail.error) { console.error('profile lookup (email) failed:', byEmail.error.message); return jsonResponse(500, { error: 'internal error' }) }
      profileRow = (byEmail.data?.[0] as any) || null
    }

    if (!profileRow) {
      // Don't echo the email back (avoid confirming which addresses have accounts).
      console.warn('LS webhook: no matching user for event', { event })
      return jsonResponse(404, { error: 'no matching user' })
    }
    const userId = profileRow.id

    // ---- Replay / out-of-order guard ----
    // The subscription webhook has no idempotency key, so a captured signed body
    // could be replayed (stale re-upgrade / downgrade), and LS retries can arrive
    // out of order. LS stamps every subscription with a monotonic `updated_at`; we
    // persist it into subscription_updated_at and refuse to apply an event that is
    // OLDER than the one we last stored. (First event for a user always applies.)
    const lsUpdatedMs = Date.parse(String(attrs.updated_at || '')) || 0
    const storedMs = Date.parse(String(profileRow.subscription_updated_at || '')) || 0
    if (lsUpdatedMs && storedMs && lsUpdatedMs < storedMs) {
      console.warn('LS webhook: stale/out-of-order event ignored', { event, lsUpdatedMs, storedMs })
      return jsonResponse(200, { ignored: event, reason: 'stale event' })
    }

    const updateRes = await supabase
      .from('profiles')
      .update({
        subscription_tier: tier,
        subscription_status: status,
        ls_subscription_id: subscriptionId,
        ls_customer_id: customerId,
        // Store LS's authoritative event time so the guard above is monotonic.
        subscription_updated_at: lsUpdatedMs ? new Date(lsUpdatedMs).toISOString() : new Date().toISOString()
      })
      .eq('id', userId)

    if (updateRes.error) {
      console.error('profile update failed:', updateRes.error.message)
      return jsonResponse(500, { error: 'internal error' })
    }

    // Success: no PII echoed (user matched, that's all the caller needs).
    return jsonResponse(200, { success: true, tier, event })
  } catch (e) {
    // Keep stack/message in the logs only — never serialize internals to the caller.
    console.error('Unhandled exception:', e, (e as any)?.stack)
    return jsonResponse(500, { error: 'internal error' })
  }
})
