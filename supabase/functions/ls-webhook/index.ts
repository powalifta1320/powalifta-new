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
    catch (e) { return jsonResponse(400, { error: 'cannot read body', detail: String(e) }) }

    const signature = req.headers.get('X-Signature') || req.headers.get('x-signature') || ''
    const secret = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET') || ''

    if (!secret) {
      console.error('LEMON_SQUEEZY_WEBHOOK_SECRET env var is not set')
      return jsonResponse(500, { error: 'webhook secret not configured', hint: 'Add LEMON_SQUEEZY_WEBHOOK_SECRET to Edge Function secrets' })
    }

    const valid = await verifySignature(rawBody, signature, secret)
    if (!valid) {
      // Return nothing beyond the verdict — body length / signature-presence /
      // hint are a free oracle for an unauthenticated caller probing the endpoint.
      return jsonResponse(401, { error: 'invalid signature' })
    }

    let payload: any
    try { payload = JSON.parse(rawBody) }
    catch (e) { return jsonResponse(400, { error: 'invalid JSON', detail: String(e) }) }

    const event = payload?.meta?.event_name as string
    const data = payload?.data
    if (!event || !data) {
      return jsonResponse(400, { error: 'unexpected payload shape', meta: payload?.meta, hasData: !!data })
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
      return jsonResponse(200, { ignored: event, reason: 'no tier match', variantName, priceCents })
    }

    const supaUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supaUrl || !serviceKey) {
      return jsonResponse(500, {
        error: 'Supabase env vars missing',
        hasUrl: !!supaUrl,
        hasServiceKey: !!serviceKey,
        hint: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY should be auto-injected; add manually if not'
      })
    }

    const supabase = createClient(supaUrl, serviceKey)

    let userId: string | null = customUserId
    if (!userId && customerEmail) {
      const lookup = await supabase
        .from('profiles')
        .select('id')
        .eq('email', customerEmail)
        .limit(1)
      if (lookup.error) {
        return jsonResponse(500, { error: 'profile lookup failed', detail: lookup.error.message })
      }
      userId = lookup.data?.[0]?.id || null
    }

    if (!userId) {
      return jsonResponse(404, {
        error: 'no matching user',
        email: customerEmail,
        hint: 'The email used at LS checkout must match a POWALIFTA account email exactly.'
      })
    }

    const updateRes = await supabase
      .from('profiles')
      .update({
        subscription_tier: tier,
        subscription_status: status,
        ls_subscription_id: subscriptionId,
        ls_customer_id: customerId,
        subscription_updated_at: new Date().toISOString()
      })
      .eq('id', userId)

    if (updateRes.error) {
      return jsonResponse(500, { error: 'profile update failed', detail: updateRes.error.message })
    }

    return jsonResponse(200, {
      success: true,
      user_id: userId,
      tier,
      event,
      status,
      email: customerEmail
    })
  } catch (e) {
    // Keep stack/message in the logs only — never serialize internals to the caller.
    console.error('Unhandled exception:', e, (e as any)?.stack)
    return jsonResponse(500, { error: 'internal error' })
  }
})
