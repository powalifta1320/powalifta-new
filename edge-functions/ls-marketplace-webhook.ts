// Supabase Edge Function: ls-marketplace-webhook
// Receives Lemon Squeezy `order_created` events for marketplace program purchases.
// On a successful purchase, this function:
//   1) Records a row in program_sales with 80/20 split
//   2) Clones the program payload into the buyer's `programs` table
//   3) Increments sold_count on the marketplace_program
//
// Deploy via Supabase dashboard → Edge Functions → Deploy new function "ls-marketplace-webhook".
// Toggle "Verify JWT" OFF (Lemon Squeezy doesn't pass a JWT).
// Set secrets:
//   LEMON_SQUEEZY_WEBHOOK_SECRET = (the signing secret you put on this webhook in LS)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY = auto-injected
//
// Then in Lemon Squeezy → Settings → Webhooks:
//   - Add a webhook for events: order_created (and optionally order_refunded later)
//   - URL: https://<your-project>.supabase.co/functions/v1/ls-marketplace-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLATFORM_FEE_BPS = 2000 // 20% = 2000 basis points

async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false
  try {
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signed = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
    const expected = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, '0')).join('')
    return await timingSafeEqual(expected, signature)
  } catch (e) {
    console.error('verifySignature error', e)
    return false
  }
}

// Constant-time string compare with no length side-channel. Both inputs are
// run through HMAC with a single-use random key, so we only ever compare
// fixed-length (32-byte) digests — neither length nor content affects timing.
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
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

    const rawBody = await req.text()
    const signature = req.headers.get('X-Signature') || req.headers.get('x-signature') || ''
    const secret = Deno.env.get('LEMON_SQUEEZY_WEBHOOK_SECRET') || ''
    if (!secret) return jsonResponse(500, { error: 'webhook secret not configured' })
    if (!await verifySignature(rawBody, signature, secret)) {
      return jsonResponse(401, { error: 'invalid signature', signaturePresent: !!signature })
    }

    let payload: any
    try { payload = JSON.parse(rawBody) }
    catch (e) { return jsonResponse(400, { error: 'invalid JSON' }) }

    const event = payload?.meta?.event_name as string
    // We only handle one-time order creation here. Subscription events go to ls-webhook.
    if (event !== 'order_created') {
      return jsonResponse(200, { ignored: event })
    }

    const data = payload?.data
    const attrs = data?.attributes || {}
    const lsOrderId = String(data?.id || '')
    const lsEventId = String(payload?.meta?.event_id || lsOrderId) // idempotency key
    const totalCents = Number(attrs.total) || 0
    const buyerEmail = String(attrs.user_email || '').toLowerCase().trim()
    // Pull custom_data — we passed user_id + marketplace_program_id in the checkout URL
    const custom = payload?.meta?.custom_data
                   || attrs?.first_order_item?.custom_data
                   || {}
    const buyerUserId = custom?.user_id || null
    const programId = custom?.marketplace_program_id || null

    if (!programId) {
      return jsonResponse(400, { error: 'no marketplace_program_id in custom_data', custom })
    }

    const supaUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supaUrl || !serviceKey) return jsonResponse(500, { error: 'Supabase env vars missing' })
    const supabase = createClient(supaUrl, serviceKey)

    // Idempotency: if we've already recorded this LS event, return success but skip
    const { data: existingSale } = await supabase.from('program_sales')
      .select('id').eq('ls_event_id', lsEventId).limit(1)
    if (existingSale && existingSale.length) {
      return jsonResponse(200, { duplicate: true, sale_id: existingSale[0].id })
    }

    // Load the marketplace program
    const { data: progRows, error: progErr } = await supabase.from('marketplace_programs')
      .select('*').eq('id', programId).limit(1)
    if (progErr || !progRows || !progRows.length) {
      return jsonResponse(404, { error: 'marketplace program not found', programId, detail: progErr?.message })
    }
    const program = progRows[0]

    // Resolve buyer (prefer user_id from custom_data, fall back to email lookup)
    let buyerId = buyerUserId
    if (!buyerId && buyerEmail) {
      const { data: lookup } = await supabase.from('profiles').select('id').eq('email', buyerEmail).limit(1)
      buyerId = lookup?.[0]?.id || null
    }
    if (!buyerId) {
      return jsonResponse(404, {
        error: 'buyer not found',
        hint: 'The email used at checkout must match an existing POWALIFTA account. Have them sign up first, then try again.',
        email: buyerEmail
      })
    }

    // Split: coach 80%, platform 20%
    const platformFeeCents = Math.round((totalCents * PLATFORM_FEE_BPS) / 10000)
    const coachPayoutCents = totalCents - platformFeeCents

    // Insert the sale row (idempotent via ls_event_id unique constraint)
    const { data: saleRows, error: saleErr } = await supabase.from('program_sales').insert({
      marketplace_program_id: program.id,
      buyer_id: buyerId,
      coach_id: program.coach_id,
      amount_cents: totalCents,
      platform_fee_cents: platformFeeCents,
      coach_payout_cents: coachPayoutCents,
      payout_status: 'pending',
      ls_order_id: lsOrderId,
      ls_event_id: lsEventId
    }).select('id')
    if (saleErr) {
      // If we hit a UNIQUE violation, treat as already-processed (idempotent)
      if (String(saleErr.message || '').includes('duplicate key')) {
        return jsonResponse(200, { duplicate: true })
      }
      return jsonResponse(500, { error: 'failed to record sale', detail: saleErr.message })
    }
    const saleId = saleRows?.[0]?.id

    // Bump sold_count on the listing
    await supabase.from('marketplace_programs').update({
      sold_count: (program.sold_count || 0) + 1,
      updated_at: new Date().toISOString()
    }).eq('id', program.id)

    // NOTE: we intentionally do NOT clone the program here anymore.
    // The buyer claims it from their dashboard via DB.claimPurchase(programId, buyer1RMs).
    // That flow asks for the buyer's S/B/D 1RMs and rescales the coach's weights
    // to match — installing an unscaled program would give the buyer weights that
    // don't match their strength at all.
    // The sale row above is enough to surface the "Claim my program" banner.

    return jsonResponse(200, {
      success: true,
      sale_id: saleId,
      buyer_id: buyerId,
      program_id: program.id,
      amount_cents: totalCents,
      coach_payout_cents: coachPayoutCents,
      platform_fee_cents: platformFeeCents
    })
  } catch (e) {
    console.error('Unhandled exception:', e)
    return jsonResponse(500, {
      error: 'unhandled exception',
      message: String((e as any)?.message || e),
      stack: String((e as any)?.stack || '')
    })
  }
})
