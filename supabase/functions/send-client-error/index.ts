// Supabase Edge Function: send-client-error
//
// Optional companion to error-log.js. Receives client-side error
// payloads, writes them to a `client_errors` table.
//
// Deploy as a Supabase edge function:
//   supabase functions deploy send-client-error
// Then in error-log.js, set SUPABASE_ERROR_ENDPOINT to:
//   https://YOUR_PROJECT.supabase.co/functions/v1/send-client-error
//
// Required env vars (set with `supabase secrets set`):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//
// Required table (run as migration):
//
//   create table public.client_errors (
//     id uuid primary key default gen_random_uuid(),
//     kind text not null,
//     ts timestamptz not null,
//     url text,
//     ua text,
//     msg text,
//     stack text,
//     src text,
//     line int,
//     col int,
//     received_at timestamptz default now()
//   );
//   alter table public.client_errors enable row level security;
//   -- No public read/write; only service_role (this edge function) can insert.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clientIp, rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'server not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Server-side flood guard, keyed by client IP. The client-side caps in
  // error-log.js only slow honest browsers; this stops a scripted loop from
  // stuffing client_errors. Generous ceiling — a legit page can throw a burst.
  // Fails open if the meter (rl_bump) isn't deployed yet.
  const rl = await rateLimit(sb, {
    bucket: 'client-error', identity: clientIp(req), limit: 60, windowSecs: 60,
  })
  if (!rl.ok) return rateLimitResponse(rl, corsHeaders)

  // Reject oversized bodies BEFORE parsing — the stored fields sum to <12KB, so
  // anything past ~20KB is abuse. Guards this unauthenticated (Verify-JWT-OFF)
  // endpoint against multi-MB buffer+parse amplification even if the rate meter
  // is failing open. Checks the declared length, then hard-caps the actual read.
  const MAX_BODY = 20000
  const declaredLen = Number(req.headers.get('content-length') || 0)
  if (declaredLen > MAX_BODY) {
    return new Response(JSON.stringify({ error: 'payload too large' }), {
      status: 413,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
  let payload: any
  try {
    const raw = await req.text()
    if (raw.length > MAX_BODY) {
      return new Response(JSON.stringify({ error: 'payload too large' }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
    payload = JSON.parse(raw)
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Light sanity: cap field sizes so a malicious client can't flood
  const clip = (s: unknown, n: number) =>
    typeof s === 'string' ? s.slice(0, n) : (s == null ? null : String(s).slice(0, n))

  // Validate the client-supplied timestamp rather than trusting it into a
  // `timestamptz NOT NULL` column; fall back to server time on anything invalid.
  const _tsParsed = typeof payload.ts === 'string' ? Date.parse(payload.ts) : NaN
  const _tsIso = Number.isFinite(_tsParsed) ? new Date(_tsParsed).toISOString() : new Date().toISOString()

  const row = {
    kind: clip(payload.kind, 32),
    ts: _tsIso,
    url: clip(payload.url, 800),
    ua: clip(payload.ua, 400),
    msg: clip(payload.msg, 2000),
    stack: clip(payload.stack, 8000),
    src: clip(payload.src, 800),
    line: typeof payload.line === 'number' ? payload.line : null,
    col: typeof payload.col === 'number' ? payload.col : null
  }

  const { error } = await sb.from('client_errors').insert(row)
  if (error) {
    console.error('insert failed:', error)
    return new Response(JSON.stringify({ error: 'insert failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
