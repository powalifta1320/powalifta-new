// Supabase Edge Function: ai-chat
//
// Secure server-side proxy for the POWALIFTA AI assistant. The browser
// NEVER holds the Anthropic key — it calls this function with the user's
// Supabase session, and this function talks to Anthropic on its behalf.
//
// POST { role: "athlete"|"coach", system: string, messages: [{role,content}] }
// ->   { text: string }   on success
//      { error, ... }     with 400/401/429/5xx on failure
//
// Deploy: paste into a new Edge Function named "ai-chat" in the Supabase
// dashboard. Toggle "Verify JWT" ON (only logged-in users can call it).
// Secrets to set on the function:
//   ANTHROPIC_API_KEY   (required)  - a key from console.anthropic.com,
//                                     ideally a dedicated key/workspace
//                                     with a monthly spend cap set there.
//   AI_DAILY_CAP        (optional)  - messages per user per day. Default 25.
//   SUPABASE_URL        (auto)      - injected by the platform.
//   SUPABASE_SERVICE_ROLE_KEY (auto)- injected by the platform.
//
// Cost is bounded three ways: (1) this function clamps max_tokens, system
// length, and history; (2) a per-user daily cap (ai_chat_usage table);
// (3) the spend cap you set in the Anthropic console. The console cap is
// the hard backstop — set it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';

// Server-side cost clamps — the client cannot exceed these.
const MAX_TOKENS = 800;          // output ceiling per reply
const SYSTEM_CAP = 6000;         // chars of system prompt accepted
const MSG_CAP = 4000;            // chars per message accepted
const HISTORY_CAP = 12;          // most recent turns forwarded
const MODELS: Record<string, string> = {
  athlete: 'claude-sonnet-4-5',
  coach: 'claude-sonnet-4-5'
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
    }
  });
}

// Decode the `sub` (user id) from a JWT without a network round-trip.
// Verify-JWT is ON at the gateway, so the token is already validated by
// the time we get here; we only need to read the user id from it.
function userIdFromJwt(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(payload + '==='.slice((payload.length + 3) % 4)));
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  // ---- who is calling --------------------------------------------------
  const uid = userIdFromJwt(req.headers.get('Authorization'));
  if (!uid) return jsonResponse(401, { error: 'Not authenticated' });

  // ---- parse + sanitise the request ------------------------------------
  let payload: any;
  try { payload = await req.json(); }
  catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const role = payload?.role === 'coach' ? 'coach' : 'athlete';
  const system = String(payload?.system || '').slice(0, SYSTEM_CAP);
  const rawMsgs = Array.isArray(payload?.messages) ? payload.messages : [];

  let messages = rawMsgs
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, MSG_CAP) }))
    .slice(-HISTORY_CAP);
  // Anthropic requires the conversation to open on a user turn.
  while (messages.length && messages[0].role === 'assistant') messages.shift();
  if (!messages.length) return jsonResponse(400, { error: 'No user message' });

  // ---- config ----------------------------------------------------------
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) {
    console.error('ANTHROPIC_API_KEY not set');
    return jsonResponse(500, { error: 'AI not configured' });
  }
  const dailyCap = parseInt(Deno.env.get('AI_DAILY_CAP') || '25', 10) || 25;

  // ---- per-user daily rate limit (ai_chat_usage) -----------------------
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (supabaseUrl && serviceKey) {
    try {
      const admin = createClient(supabaseUrl, serviceKey);
      const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
      const { data: row } = await admin
        .from('ai_chat_usage')
        .select('count')
        .eq('user_id', uid)
        .eq('day', today)
        .maybeSingle();
      const used = (row && typeof row.count === 'number') ? row.count : 0;
      if (used >= dailyCap) {
        return jsonResponse(429, {
          error: 'Daily limit reached',
          message: "You've hit today's assistant limit. It resets tomorrow."
        });
      }
      await admin
        .from('ai_chat_usage')
        .upsert({ user_id: uid, day: today, count: used + 1 }, { onConflict: 'user_id,day' });
    } catch (e) {
      // Don't hard-fail the chat if the meter hiccups; just log it.
      console.error('rate-limit check failed:', e);
    }
  }

  // ---- call Anthropic --------------------------------------------------
  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODELS[role],
        max_tokens: MAX_TOKENS,
        system,
        messages
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Anthropic error:', res.status, detail);
      return jsonResponse(502, { error: 'Model request failed', status: res.status });
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) return jsonResponse(502, { error: 'Empty response from the model' });
    return jsonResponse(200, { text });
  } catch (e) {
    console.error('ai-chat crashed:', e);
    return jsonResponse(500, { error: 'Unhandled exception', message: String((e as any)?.message || e) });
  }
});
