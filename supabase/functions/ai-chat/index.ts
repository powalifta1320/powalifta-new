// Supabase Edge Function: ai-chat
//
// Secure server-side proxy for the POWALIFTA AI assistant. The browser
// NEVER holds the Gemini key — it calls this function with the user's
// Supabase session, and this function talks to Google on its behalf.
//
// POST { role: "athlete"|"coach", system: string, messages: [{role,content}] }
// ->   { text: string }   on success
//      { error, ... }     with 400/401/429/5xx on failure
//
// Deploy: paste into a new Edge Function named "ai-chat" in the Supabase
// dashboard. Toggle "Verify JWT" ON (only logged-in users can call it).
// Secrets to set on the function:
//   GEMINI_API_KEY      (required)  - a key from aistudio.google.com/apikey.
//                                     Requires billing enabled on the Google
//                                     Cloud project (the free tier returns a
//                                     hard 429 "check your plan and billing").
//   AI_DAILY_CAP        (optional)  - messages per user per day. Default 20.
//   SUPABASE_URL        (auto)      - injected by the platform.
//   SUPABASE_SERVICE_ROLE_KEY (auto)- injected by the platform.
//
// PROVIDER NOTE: this function is the ONLY place that knows which LLM we use.
// Swapping to OpenAI / Anthropic / Groq means changing only this file
// (endpoint + request/response shape + secret name) — the client
// (DB.aiChat), the mock fallback in ai-chat.js, and the ai_chat_usage daily
// cap are untouched.
//
// Cost is bounded three ways: (1) this function clamps max output tokens,
// system length, and history; (2) a per-user daily cap (ai_chat_usage
// table); (3) the budget you set on the Google Cloud project. Gemini 2.0
// Flash is ~$0.10/1M input + $0.40/1M output, so at the per-user cap this is
// fractions of a cent per chat.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Provider endpoints. Gemini is primary (cheapest); Groq is the automatic
// fallback so the assistant stays LIVE even when Gemini's billing/quota hiccups.
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// Server-side cost clamps — the client cannot exceed these.
const MAX_TOKENS = 800;          // output ceiling per reply
const SYSTEM_CAP = 6000;         // chars of system prompt accepted
const MSG_CAP = 4000;            // chars per message accepted
const HISTORY_CAP = 12;          // most recent turns forwarded

type Turn = { role: 'user' | 'assistant'; content: string };
type ModelResult =
  | { ok: true; text: string }
  | { ok: false; status: number; detail: string };

// ---- Gemini (primary) ------------------------------------------------------
// Maps our {user|assistant} turns to Gemini's {user|model}+system_instruction.
async function callGemini(key: string, system: string, messages: Turn[]): Promise<ModelResult> {
  const reqBody: any = {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    })),
    generationConfig: { maxOutputTokens: MAX_TOKENS }
  };
  if (system) reqBody.system_instruction = { parts: [{ text: system }] };

  const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(reqBody)
  });
  if (!res.ok) return { ok: false, status: res.status, detail: await res.text() };
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: any) => (p && typeof p.text === 'string') ? p.text : '').join('').trim()
    : '';
  return text ? { ok: true, text } : { ok: false, status: 502, detail: 'empty Gemini response' };
}

// ---- Groq (fallback) -------------------------------------------------------
// OpenAI-compatible: system prompt is just a leading system message.
async function callGroq(key: string, system: string, messages: Turn[]): Promise<ModelResult> {
  const chat = system
    ? [{ role: 'system', content: system }, ...messages]
    : messages;
  const res = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: chat, max_tokens: MAX_TOKENS, temperature: 0.6 })
  });
  if (!res.ok) return { ok: false, status: res.status, detail: await res.text() };
  const data = await res.json();
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  return text ? { ok: true, text } : { ok: false, status: 502, detail: 'empty Groq response' };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version'
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

  const system = String(payload?.system || '').slice(0, SYSTEM_CAP);
  const rawMsgs = Array.isArray(payload?.messages) ? payload.messages : [];

  let messages = rawMsgs
    .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, MSG_CAP) }))
    .slice(-HISTORY_CAP);
  // Gemini requires the conversation to open on a user turn.
  while (messages.length && messages[0].role === 'assistant') messages.shift();
  if (!messages.length) return jsonResponse(400, { error: 'No user message' });

  // ---- config ----------------------------------------------------------
  // At least one provider key must be present. Gemini is tried first (cheaper);
  // Groq is the fallback when Gemini errors (billing/quota/outage).
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!geminiKey && !groqKey) {
    console.error('No provider key set (need GEMINI_API_KEY and/or GROQ_API_KEY)');
    return jsonResponse(500, { error: 'AI not configured' });
  }
  const dailyCap = parseInt(Deno.env.get('AI_DAILY_CAP') || '20', 10) || 20;

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

  // ---- call the model: Gemini first, Groq as automatic fallback --------
  try {
    let result: ModelResult | null = null;

    if (geminiKey) {
      try {
        result = await callGemini(geminiKey, system, messages as Turn[]);
        if (!result.ok) console.error('Gemini failed:', result.status, result.detail);
      } catch (e) {
        console.error('Gemini threw:', e);
        result = { ok: false, status: 500, detail: String((e as any)?.message || e) };
      }
    }

    // Fall back to Groq if Gemini is unavailable or errored.
    if ((!result || !result.ok) && groqKey) {
      try {
        const groqResult = await callGroq(groqKey, system, messages as Turn[]);
        if (!groqResult.ok) console.error('Groq failed:', groqResult.status, groqResult.detail);
        result = groqResult;
      } catch (e) {
        console.error('Groq threw:', e);
        result = { ok: false, status: 500, detail: String((e as any)?.message || e) };
      }
    }

    if (result && result.ok) return jsonResponse(200, { text: result.text });
    return jsonResponse(502, { error: 'Model request failed', status: result?.status ?? 502 });
  } catch (e) {
    // Keep the specifics server-side only (matches the provider-failure path above);
    // never echo raw runtime exception text to the client (recon-grade info leak).
    console.error('ai-chat crashed:', e);
    return jsonResponse(500, { error: 'Unhandled exception' });
  }
});
