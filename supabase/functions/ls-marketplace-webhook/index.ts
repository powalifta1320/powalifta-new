// Supabase Edge Function: ls-marketplace-webhook
// Receives Lemon Squeezy `order_created` + `order_refunded` events for
// marketplace program purchases.
//
// On order_created this function:
//   1) Records a row in program_sales with an 80/20 coach/platform split
//   2) Increments sold_count on the marketplace_program
//   (It does NOT clone the program — the buyer claims it from their dashboard
//    via DB.claimPurchase, which rescales the weights to their own 1RMs.)
//
// On order_refunded it:
//   1) Voids the matching sale (payout_status='cancelled') so the coach isn't
//      paid out for it and it stops counting as revenue
//   2) Decrements sold_count on the listing
//   (An already-claimed program is left in place — a refund stops billing +
//    payout + future claims, not a training block already in progress.)
//
// Deploy via Supabase dashboard → Edge Functions → Deploy new function "ls-marketplace-webhook".
// Toggle "Verify JWT" OFF (Lemon Squeezy doesn't pass a JWT).
// Set secrets:
//   LEMON_SQUEEZY_WEBHOOK_SECRET = (the signing secret you put on this webhook in LS)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY = auto-injected
//
// Then in Lemon Squeezy → Settings → Webhooks:
//   - Enable events: order_created AND order_refunded
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
      return jsonResponse(401, { error: 'invalid signature' })
    }

    let payload: any
    try { payload = JSON.parse(rawBody) }
    catch (e) { return jsonResponse(400, { error: 'invalid JSON' }) }

    const event = payload?.meta?.event_name as string
    // Test-mode events (the 4242 card) are signed exactly like live ones. They count only
    // while LS_ALLOW_TEST=1 AND the buyer is in LS_TEST_EMAILS (fails closed with no list):
    // a test order would otherwise release a paid program and add a payout row. Drop both
    // secrets at go-live.
    if (payload?.meta?.test_mode === true) {
      const testers = (Deno.env.get('LS_TEST_EMAILS') || '').toLowerCase().split(',').map(t => t.trim()).filter(Boolean)
      const buyer = String(payload?.data?.attributes?.user_email || '').toLowerCase().trim()
      if (Deno.env.get('LS_ALLOW_TEST') !== '1' || !buyer || !testers.includes(buyer)) {
        return jsonResponse(200, { ignored: event, reason: 'test_mode' })
      }
    }
    // We handle one-time order creation + refunds here. Subscription events go to ls-webhook.
    if (event !== 'order_created' && event !== 'order_refunded') {
      return jsonResponse(200, { ignored: event })
    }

    const data = payload?.data
    const attrs = data?.attributes || {}
    const lsOrderId = String(data?.id || '')
    const lsEventId = String(payload?.meta?.event_id || lsOrderId) // idempotency key
    // What the program sold for, in USD cents, before tax and after any discount: the coach's 80%
    // is worked out on it (attrs.total includes sales tax, which isn't revenue, and is in the
    // buyer's currency). The price check uses the pre-discount USD subtotal.
    const cents = (v: unknown): number | null => (v === undefined || v === null || v === '') ? null : (Number(v) || 0)
    const subtotalUsdCents = cents(attrs.subtotal_usd) ?? cents(attrs.subtotal) ?? (Number(attrs.total) || 0)
    const discountUsdCents = cents(attrs.discount_total_usd) ?? cents(attrs.discount_total) ?? 0
    const totalCents = Math.max(0, subtotalUsdCents - discountUsdCents)
    const buyerEmail = String(attrs.user_email || '').toLowerCase().trim()
    // Pull custom_data — we passed user_id + marketplace_program_id in the checkout URL
    const custom = payload?.meta?.custom_data
                   || attrs?.first_order_item?.custom_data
                   || {}
    const buyerUserId = custom?.user_id || null
    const programId = custom?.marketplace_program_id || null

    const supaUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supaUrl || !serviceKey) return jsonResponse(500, { error: 'Supabase env vars missing' })
    const supabase = createClient(supaUrl, serviceKey)

    // ---- Refund path -------------------------------------------------------
    // order_refunded fires when a buyer is refunded (by the coach or support).
    // We VOID the sale (payout_status='cancelled') so the coach isn't paid out
    // for it and it stops counting as revenue, and we decrement the listing's
    // sold_count. We deliberately do NOT rip an already-claimed program out of
    // the buyer's dashboard — a refund stops billing + payout + future claims,
    // it isn't a clawback of a training block already in progress. The sale is
    // matched by ls_order_id (always present on the order object), so refunds
    // work even when the refund event carries no checkout custom_data.
    if (event === 'order_refunded') {
      if (!lsOrderId) return jsonResponse(400, { error: 'refund has no order id' })
      const { data: saleRows, error: findErr } = await supabase.from('program_sales')
        .select('id, marketplace_program_id, payout_status')
        .eq('ls_order_id', lsOrderId).limit(1)
      if (findErr) { console.error('mkt-webhook: sale lookup failed', findErr.message); return jsonResponse(500, { error: 'internal error' }) }
      const sale = saleRows?.[0]
      if (!sale) return jsonResponse(200, { refund: true, note: 'no matching sale on file', lsOrderId })
      if (sale.payout_status === 'cancelled') {
        return jsonResponse(200, { refund: true, alreadyVoided: true, sale_id: sale.id })
      }
      const { error: voidErr } = await supabase.from('program_sales')
        .update({ payout_status: 'cancelled' }).eq('id', sale.id)
      if (voidErr) { console.error('mkt-webhook: void failed', voidErr.message); return jsonResponse(500, { error: 'internal error' }) }
      // Decrement sold_count (floor at 0) so the listing's social proof stays honest.
      const { data: progRow } = await supabase.from('marketplace_programs')
        .select('sold_count').eq('id', sale.marketplace_program_id).limit(1)
      const cur = Number(progRow?.[0]?.sold_count) || 0
      await supabase.from('marketplace_programs')
        .update({ sold_count: Math.max(0, cur - 1), updated_at: new Date().toISOString() })
        .eq('id', sale.marketplace_program_id)
      return jsonResponse(200, { refund: true, voided_sale_id: sale.id })
    }
    // ---- Purchase path (order_created) ------------------------------------

    if (!programId) {
      // A coach-plan order from the same store (ls-webhook handles those) or a stray one:
      // acknowledge it, so Lemon Squeezy's delivery log only shows real failures.
      return jsonResponse(200, { ignored: event, reason: 'not a marketplace order' })
    }

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
      console.warn('mkt-webhook: program not found', programId, progErr?.message); return jsonResponse(404, { error: 'not found' })
    }
    const program = progRows[0]

    // Resolve buyer AUTHORITATIVELY (mirrors ls-webhook). custom_data.user_id rides
    // the checkout URL and is client-controlled, so it must NEVER decide the entitled
    // account on its own — a buyer could tamper it to grant the program to a victim, or
    // decouple the paying email from the entitled account. We accept the custom user_id
    // only when THAT profile's email equals the HMAC-signed checkout email; otherwise we
    // resolve strictly by the signed email. Bug parity with the ls-webhook hardening.
    let buyerId: string | null = null
    if (buyerUserId) {
      const { data: byId } = await supabase.from('profiles')
        .select('id, email').eq('id', String(buyerUserId)).limit(1)
      const row = byId?.[0]
      if (row && buyerEmail && String(row.email || '').toLowerCase().trim() === buyerEmail) {
        buyerId = row.id
      } else {
        console.warn('mkt-webhook: custom_data.user_id did not match signed checkout email — falling back to email lookup')
      }
    }
    if (!buyerId && buyerEmail) {
      const { data: lookup } = await supabase.from('profiles').select('id').eq('email', buyerEmail).limit(1)
      buyerId = lookup?.[0]?.id || null
    }
    if (!buyerId) {
      console.warn('mkt-webhook: buyer not found for order', { lsOrderId })
      return jsonResponse(404, {
        error: 'buyer not found',
        hint: 'The email used at checkout must match an existing POWALIFTA account. Have them sign up first, then try again.'
      })
    }

    // The program id came from the checkout URL (editable), so the paid variant and the
    // amount must match the program, and the order must actually be paid.
    if (event === 'order_created') {
      if (String(attrs.status || '') !== 'paid') return jsonResponse(200, { ignored: event, reason: 'not paid' })
      const paidVariant = String(attrs?.first_order_item?.variant_id ?? '')
      if (program.ls_variant_id && paidVariant !== String(program.ls_variant_id)) return jsonResponse(400, { error: 'variant does not match the program' })
      if (subtotalUsdCents < Number(program.price_cents || 0)) return jsonResponse(400, { error: 'amount below the program price' })
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
      console.error('mkt-webhook: record sale failed', saleErr.message); return jsonResponse(500, { error: 'internal error' })
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
    // Keep stack/message in the logs only — never serialize internals to the caller.
    console.error('Unhandled exception:', e, (e as any)?.stack)
    return jsonResponse(500, { error: 'internal error' })
  }
})
