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

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'POWALIFTA <noreply@powalifta.com>';
const SITE = 'https://powalifta.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function htmlEscape(str: string): string {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildEmail(opts: { coachName: string; code: string }): { subject: string; html: string; text: string } {
  const safeCoach = htmlEscape(opts.coachName || 'Your coach');
  const safeCode = htmlEscape(opts.code);
  const signupUrl = `${SITE}/index.html?code=${encodeURIComponent(opts.code)}#signup-athlete`;

  const subject = `${opts.coachName || 'Your coach'} invited you to POWALIFTA`;

  const text = `Hey,

${opts.coachName || 'Your coach'} has invited you to train on POWALIFTA — the platform powerlifting coaches use to program training and track progress.

Sign up with one click (your invite is pre-filled):
${signupUrl}

Or go to ${SITE} and enter this invite code at signup:

    ${opts.code}

POWALIFTA logs every set, calculates your e1RM automatically, tracks your goals, and lets your coach see your progress in real time. Free for athletes, forever.

See you in the gym.
— POWALIFTA`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b0b0c; color: #f4f4f6; padding: 0; margin: 0;">
<div style="max-width: 540px; margin: 0 auto; padding: 32px 24px;">
  <div style="font-family: 'Anton', Impact, sans-serif; font-size: 1.8rem; letter-spacing: 0.02em; margin-bottom: 24px;">POWA<span style="color:#ff2d3f">LIFTA</span></div>
  <h1 style="font-size: 1.5rem; line-height: 1.25; margin: 0 0 18px;">${safeCoach} invited you to train.</h1>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 22px;">They coach on POWALIFTA — RPE-native programming, automatic e1RM tracking, free for athletes forever.</p>
  <div style="margin: 0 0 26px;">
    <a href="${signupUrl}" style="display:inline-block; background:#ff2d3f; color:#fff; text-decoration:none; padding:12px 22px; border-radius:10px; font-weight:700; letter-spacing:0.02em;">Accept invite &amp; sign up</a>
  </div>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 8px;">Or enter this code at signup:</p>
  <div style="font-family: 'Space Grotesk', monospace; font-size: 1.6rem; font-weight: 700; letter-spacing: 0.2em; color:#f4f4f6; background:#16161a; border:1px solid #25252c; border-radius:10px; padding:14px 18px; text-align:center; margin: 0 0 26px;">${safeCode}</div>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 22px;">Once you're in: log every set, mark RPE 1–10 on your working sets, and your e1RM updates itself. Your coach sees it in real time.</p>
  <p style="color: #82828c; font-size: 0.85rem; line-height: 1.6; margin-top: 32px; padding-top: 22px; border-top: 1px solid #25252c;">Didn't expect this? You can ignore the email — nothing happens until you sign up.<br>— POWALIFTA</p>
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
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

  const { data: invites, error: invErr } = await admin
    .from('invites')
    .select('code, created_at')
    .eq('coach_id', caller.user.id)
    .ilike('email', athleteEmail)
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
  const code = String(invites[0].code || '');
  if (!code) return jsonResponse(409, { error: 'Invite has no code' });

  // Coach display name, resolved server-side (don't trust the client for it).
  let coachName = 'Your coach';
  const { data: prof } = await admin
    .from('profiles')
    .select('name')
    .eq('id', caller.user.id)
    .limit(1)
    .single();
  if (prof?.name) coachName = String(prof.name);

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
