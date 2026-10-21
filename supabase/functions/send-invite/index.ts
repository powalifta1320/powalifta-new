// Supabase Edge Function: send-invite
//
// POST { athleteEmail }
// Sends a branded "your coach invited you" email to a prospective athlete the
// moment a coach generates an invite code. Uses Resend's REST API.
//
// The CODE and the COACH NAME are resolved server-side from the caller's own
// invites, never trusted from the client: the function looks up the newest
// UNUSED invite row this coach created for this email and emails that code.
// So a caller can only ever email an invite they actually made.
//
// Deploy: paste into a new Edge Function named "send-invite". Set RESEND_API_KEY
// (shared with send-welcome / send-program-assigned) plus SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY in the function's secrets. Toggle "Verify JWT" ON —
// only the logged-in coach can fire it.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'POWALIFTA <noreply@powalifta.com>';
const SITE = 'https://www.powalifta.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function htmlEscape(str: string): string {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildEmail(opts: { coachName: string; code: string }): { subject: string; html: string; text: string } {
  const safeCoach = htmlEscape(opts.coachName || 'Your coach');
  const safeCode = htmlEscape(opts.code);
  // The join page: shows who invited them, sends iPhones to the App Store, and keeps the code.
  const signupUrl = `${SITE}/j/${encodeURIComponent(opts.code)}`;

  const subject = `${opts.coachName || 'Your coach'} invited you to train on POWALIFTA`;

  const text = `Hey,

${opts.coachName || 'Your coach'} invited you to train on POWALIFTA. They'll write your program there and see every set you log.

Accept the invite:
${signupUrl}

On an iPhone, the link takes you to the app. Sign up with "I have a coach" and use this code:

    ${opts.code}

POWALIFTA is free for athletes. See you in the gym.

POWALIFTA`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#060607;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:36px 24px;">
  <div style="font-weight:800;font-size:15px;letter-spacing:0.08em;margin:0 0 30px;">POWALIFTA</div>
  <h1 style="font-size:26px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 14px;">${safeCoach} invited you to train.</h1>
  <p style="color:#b9b9c1;font-size:16px;line-height:1.6;margin:0 0 26px;">They'll write your program on POWALIFTA and see every set you log. Free for athletes.</p>
  <a href="${signupUrl}" style="display:inline-block;background:#ee2b3b;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:650;font-size:16px;">Accept the invite</a>
  <p style="color:#8e8e98;font-size:14px;line-height:1.6;margin:28px 0 8px;">On an iPhone, sign up in the app with "I have a coach" and this code:</p>
  <div style="font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:24px;font-weight:700;letter-spacing:0.22em;color:#f5f5f7;background:#0f0f11;border:1px solid #232327;border-radius:16px;padding:16px 18px;text-align:center;margin:0 0 30px;">${safeCode}</div>
  <p style="color:#6f6f78;font-size:13px;line-height:1.6;margin:0;padding-top:20px;border-top:1px solid #1d1d22;">Didn't expect this? Ignore it: nothing happens until you sign up.</p>
</div></body></html>`;

  return { subject, html, text };
}

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      // Must include x-client-info: supabase-js's functions.invoke() attaches it,
      // so the browser's CORS preflight asks for it. Omitting it makes the
      // preflight fail with "Failed to send a request to the Edge Function"
      // (the POST never fires). Mirror send-push / ai-chat exactly.
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version'
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  let payload: any;
  try { payload = await req.json(); }
  catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const athleteEmail = String(payload?.athleteEmail || '').trim().toLowerCase();
  if (!athleteEmail || !athleteEmail.includes('@')) {
    return jsonResponse(400, { error: 'Invalid athlete email' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse(500, { error: 'Server not configured' });
  }

  // AUTHORIZATION. "Verify JWT ON" guarantees the caller is logged in, but that
  // alone would let any authenticated user send a POWALIFTA-branded email to any
  // address (a phishing / spam vector). Gate on the caller having actually made
  // an UNUSED invite for this email, and use THAT row's code — so the email can
  // only ever carry a real invite the caller owns.
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return jsonResponse(401, { error: 'Missing auth' });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !caller?.user) return jsonResponse(401, { error: 'Invalid session' });

  // Per-coach ceiling: a logged-in caller is already gated to their own unused
  // invites, but cap the rate so a compromised/looping session can't fan out
  // POWALIFTA-branded mail. Fails open if the meter isn't deployed.
  const rl = await rateLimit(admin, {
    bucket: 'invite', identity: caller.user.id, limit: 40, windowSecs: 3600,
  });
  if (!rl.ok) return rateLimitResponse(rl, { 'Access-Control-Allow-Origin': '*' });

  const { data: invites, error: invErr } = await admin
    .from('invites')
    .select('code, created_at')
    .eq('coach_id', caller.user.id)
    .ilike('email', athleteEmail.replace(/[\\%_]/g, '\\$&'))   // a literal match: no pattern characters
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1);
  if (invErr) {
    console.error('invite lookup failed:', invErr);
    return jsonResponse(500, { error: 'Lookup failed' });
  }
  if (!invites || !invites.length) {
    return jsonResponse(403, { error: 'No matching invite for this email' });
  }
  const code = String(invites[0].code || '').toUpperCase();
  if (!code) return jsonResponse(409, { error: 'Invite has no code' });
  // Only a code the app could have made (generateInviteCode: 6 of A-Z without I/O, 2-9): the
  // row is client-written, and anything else (a URL, a sentence) would ride our email.
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return jsonResponse(422, { error: 'Invite code is not valid' });

  // Coach display name, resolved server-side (don't trust the client for it).
  let coachName = 'Your coach';
  const { data: prof } = await admin
    .from('profiles')
    .select('name')
    .eq('id', caller.user.id)
    .limit(1)
    .single();
  // The name is whatever the coach typed: no links, no line breaks, a sane length, so it can't
  // turn the subject line or the email into someone else's message.
  if (prof?.name) {
    const cleaned = String(prof.name).replace(/https?:\/\/\S+/gi, '').replace(/www\.\S+/gi, '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 60);
    if (cleaned) coachName = cleaned;
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('RESEND_API_KEY env var not set');
    return jsonResponse(500, { error: 'Email service not configured' });
  }

  const { subject, html, text } = buildEmail({ coachName, code });

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM, to: [athleteEmail], subject, html, text })
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend error:', res.status, detail);
      return jsonResponse(502, { error: 'Email send failed', status: res.status, detail });
    }
    const body = await res.json();
    return jsonResponse(200, { sent: true, id: body?.id });
  } catch (e) {
    console.error('send-invite crashed:', e);
    return jsonResponse(500, { error: 'Unhandled exception', message: String((e as any)?.message || e) });
  }
});
