// Supabase Edge Function: program-read
//
// Program from a photo: a coach sends a screenshot, a photo of a printout or a PDF of a training
// program; Gemini reads it into the builder's own cell notation (shape.ts) and the app opens it in a
// review grid where the coach checks every number before anything is saved.
//
// POST { file: base64 (no data: prefix), mime: 'image/jpeg'|'image/png'|'image/webp'|'image/heic'|
//        'image/heif'|'application/pdf', unit?: 'kg'|'lb' }
// ->   200 { read: { name, unit, weeks, days[{ name, exercises[{ name, note, cells[] }] }], unsure[] }, ms }
//      400 bad input · 401 not signed in · 413 too big · 422 { error: 'not_program' } · 429 limits · 502 read failed
//
// Nothing is stored: the file goes to Gemini for this one request and is dropped. Logs carry counts and
// timings only, never the picture or what it says.
//
// Verify JWT: ON (deploy.sh WITH_JWT, supabase/config.toml). Secrets: GEMINI_API_KEY (already set for
// ai-chat). Optional: PROGRAM_READ_DAILY_CAP (default 15 per user), PROGRAM_READ_GLOBAL_CAP (300 a day).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimit } from '../_shared/rate-limit.ts';
import { PROMPT, SCHEMA, cleanRead, parseReply } from './shape.ts';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_BYTES = 6 * 1024 * 1024;   // decoded file size
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!supabaseUrl || !serviceKey || !geminiKey) return jsonResponse(500, { error: 'Not configured' });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ---- who is calling: the session's user, checked with Supabase, not just decoded ----
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return jsonResponse(401, { error: 'Not authenticated' });
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  const uid = who && who.user && who.user.id;
  if (whoErr || !uid) return jsonResponse(401, { error: 'Not authenticated' });

  // ---- the file ----
  let body: any;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }
  const mime = String(body && body.mime || '').toLowerCase();
  const b64 = String(body && body.file || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (MIMES.indexOf(mime) < 0) return jsonResponse(400, { error: 'bad_type', message: 'Use a photo, a screenshot or a PDF.' });
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return jsonResponse(400, { error: 'no_file', message: 'That file didn\'t come through. Try again.' });
  if (Math.floor(b64.length * 3 / 4) > MAX_BYTES) return jsonResponse(413, { error: 'too_big', message: 'That file is over 6 MB. Try a screenshot of the program instead.' });
  const unit = body && body.unit === 'lb' ? 'lb' : 'kg';

  // ---- limits: per coach per day, a burst guard, and one ceiling for everyone ----
  const caps: [string, string, number, number, string][] = [
    ['program-read-day', uid, 86400, parseInt(Deno.env.get('PROGRAM_READ_DAILY_CAP') || '15', 10) || 15, 'You\'ve read the most programs for today. It resets tomorrow, and pasting the text always works.'],
    ['program-read-burst', uid, 60, 3, 'Give it a moment between programs.'],
    ['program-read-global', 'all', 86400, parseInt(Deno.env.get('PROGRAM_READ_GLOBAL_CAP') || '300', 10) || 300, 'Reading is busy today. Paste the text instead, or try again tomorrow.']
  ];
  for (const [bucket, identity, windowSecs, limit, message] of caps) {
    const v = await rateLimit(admin, { bucket, identity, windowSecs, limit });
    if (!v.ok && !v.degraded) return jsonResponse(429, { error: 'limit', message });
  }

  // ---- read it ----
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: PROMPT }] },
        contents: [{ role: 'user', parts: [
          { inline_data: { mime_type: mime, data: b64 } },
          { text: 'Transcribe this program. If a number has no unit, the coach works in ' + unit + '.' }
        ] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 24000,
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          thinkingConfig: { thinkingBudget: 1024 }
        }
      })
    });
  } catch (e) {
    console.error('program-read: gemini fetch failed', String(e).slice(0, 120));
    return jsonResponse(502, { error: 'read_failed', message: 'Couldn\'t reach the reader. Try again in a minute, or paste the text.' });
  }
  if (!res.ok) {
    console.error('program-read: gemini', res.status, (await res.text()).slice(0, 200));
    return jsonResponse(502, { error: 'read_failed', message: 'Couldn\'t read that one. Try a sharper picture, or paste the text.' });
  }
  const data = await res.json().catch(() => null);
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const reply = Array.isArray(parts) ? parts.map((p: any) => (p && typeof p.text === 'string' && !p.thought) ? p.text : '').join('') : '';
  const raw = parseReply(reply);
  const read = cleanRead(raw);
  const ms = Date.now() - t0;
  if (!read) {
    console.log('program-read: no program', JSON.stringify({ ms, mime, notProgram: !!(raw && raw.notProgram) }));
    return jsonResponse(422, { error: 'not_program', message: 'That doesn\'t look like a training program. Try a screenshot of the program itself, or paste the text.' });
  }
  const exercises = read.days.reduce((n, d) => n + d.exercises.length, 0);
  console.log('program-read: ok', JSON.stringify({ ms, mime, weeks: read.weeks, days: read.days.length, exercises, unsure: read.unsure.length }));
  return jsonResponse(200, { read, ms });
});
