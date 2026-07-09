// Supabase Edge Function: send-welcome
// POST { email, name, type: 'athlete' | 'coach' }
// Sends a branded welcome email via Resend's REST API.
// Deploy: paste into a new Edge Function named "send-welcome" in Supabase dashboard,
// then set the env var RESEND_API_KEY in the function's secrets.
// Toggle "Verify JWT" OFF — this needs to be callable during signup before login.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clientIp, rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'POWALIFTA <noreply@powalifta.com>';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
};

function htmlEscape(str: string): string {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildEmail(name: string, type: 'athlete' | 'coach'): { subject: string, html: string, text: string } {
  const firstName = (name || 'lifter').split(' ')[0];
  const safeName = htmlEscape(firstName);

  if (type === 'coach') {
    const subject = 'Welcome to POWALIFTA — let\'s get your first athlete on';
    const text = `Hey ${firstName},

Welcome to POWALIFTA. You're set up as a coach, which means you can start building programs and inviting athletes immediately.

Your next steps:
1. Open your dashboard → coach.html
2. Generate an invite code (one per athlete)
3. Send it to your first athlete — they sign up with that code
4. Build their first program: weeks, days, exercises, sets

Free plan covers 3 athletes. When you grow past that, the upgrade modal will walk you through the paid tiers ($25 / $50 / $100 per month).

Questions? Just reply to this email.

— POWALIFTA
https://powalifta.com`;
    const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b0b0c; color: #f4f4f6; padding: 0; margin: 0;">
<div style="max-width: 540px; margin: 0 auto; padding: 32px 24px;">
  <div style="font-family: 'Anton', Impact, sans-serif; font-size: 1.8rem; letter-spacing: 0.02em; margin-bottom: 24px;">POWA<span style="color:#ff2d3f">LIFTA</span></div>
  <h1 style="font-size: 1.5rem; line-height: 1.25; margin: 0 0 18px;">Welcome, ${safeName}.</h1>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 14px;">You're set up as a coach. Build programs, invite athletes, watch them get strong.</p>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 22px;"><strong style="color:#f4f4f6;">Your next steps:</strong></p>
  <ol style="color: #b8b8c0; line-height: 1.7; padding-left: 20px; margin: 0 0 22px;">
    <li>Open your <a href="https://powalifta.com/coach.html" style="color:#ff2d3f; text-decoration: none;">coach dashboard</a></li>
    <li>Generate an invite code (one per athlete)</li>
    <li>Send it to your first athlete — they sign up with that code</li>
    <li>Build their first program: weeks, days, exercises, sets</li>
  </ol>
  <p style="color: #82828c; font-size: 0.9rem; line-height: 1.6; margin: 0 0 14px;">Free plan covers 3 athletes. Upgrade tiers ($25 / $50 / $100 per month) appear when you grow past that.</p>
  <p style="color: #82828c; font-size: 0.85rem; line-height: 1.6; margin-top: 32px; padding-top: 22px; border-top: 1px solid #25252c;">Questions? Just reply to this email.<br>— POWALIFTA</p>
</div></body></html>`;
    return { subject, html, text };
  }

  // Athlete copy
  const subject = 'Welcome to POWALIFTA — let\'s get you training';
  const text = `Hey ${firstName},

Welcome to POWALIFTA. You're in.

If your coach gave you an invite code, your program is already loaded. If you signed up without one, you can self-coach using the same tools.

Start here:
1. Open athlete.html — that's your dashboard
2. Set your SBD goals (squat / bench / deadlift) so you can track progress
3. Log your bodyweight
4. When you train, open Today, mark sets complete, enter actual RPE
5. Watch your e1RM chart climb

Tip: tap any weight in your session to see the plate breakdown.

Questions? Just reply to this email.

— POWALIFTA
https://powalifta.com`;
  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b0b0c; color: #f4f4f6; padding: 0; margin: 0;">
<div style="max-width: 540px; margin: 0 auto; padding: 32px 24px;">
  <div style="font-family: 'Anton', Impact, sans-serif; font-size: 1.8rem; letter-spacing: 0.02em; margin-bottom: 24px;">POWA<span style="color:#ff2d3f">LIFTA</span></div>
  <h1 style="font-size: 1.5rem; line-height: 1.25; margin: 0 0 18px;">Welcome, ${safeName}.</h1>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 22px;">You're in. If your coach gave you an invite code, your program is already loaded. Otherwise you can self-coach.</p>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 14px;"><strong style="color:#f4f4f6;">Start here:</strong></p>
  <ol style="color: #b8b8c0; line-height: 1.7; padding-left: 20px; margin: 0 0 22px;">
    <li>Open your <a href="https://powalifta.com/athlete.html" style="color:#ff2d3f; text-decoration: none;">athlete dashboard</a></li>
    <li>Set your SBD goals (squat / bench / deadlift)</li>
    <li>Log your bodyweight</li>
    <li>When you train, mark sets complete + log actual RPE</li>
    <li>Watch your e1RM chart climb</li>
  </ol>
  <p style="color: #82828c; font-size: 0.9rem; line-height: 1.6; margin: 0;"><em>Tip:</em> tap any weight in your session to see the plate breakdown.</p>
  <p style="color: #82828c; font-size: 0.85rem; line-height: 1.6; margin-top: 32px; padding-top: 22px; border-top: 1px solid #25252c;">Questions? Just reply to this email.<br>— POWALIFTA</p>
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
  // CORS preflight
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  let payload: any;
  try { payload = await req.json(); }
  catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const email = String(payload?.email || '').trim().toLowerCase();
  const name = String(payload?.name || '').trim();
  const type = (payload?.type === 'coach') ? 'coach' : 'athlete';
  if (!email || !email.includes('@')) return jsonResponse(400, { error: 'Invalid email' });

  // Abuse guard. This is unauthenticated (signup fires it before login), so
  // without a ceiling anyone could loop it to email-bomb a victim and burn
  // Resend quota + domain reputation. Two limits, keyed by the service role
  // (SUPABASE_* are auto-injected in every edge function): burst-per-IP and a
  // strict per-recipient/day cap so one address can't be flooded. Fails open
  // if the meter isn't deployed yet, so this never blocks a real signup.
  const rlUrl = Deno.env.get('SUPABASE_URL');
  const rlKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (rlUrl && rlKey) {
    const admin = createClient(rlUrl, rlKey);
    const ipRl = await rateLimit(admin, {
      bucket: 'welcome-ip', identity: clientIp(req), limit: 20, windowSecs: 3600,
    });
    if (!ipRl.ok) return rateLimitResponse(ipRl, CORS);
    const emailRl = await rateLimit(admin, {
      bucket: 'welcome-email', identity: email, limit: 3, windowSecs: 86400,
    });
    if (!emailRl.ok) return rateLimitResponse(emailRl, CORS);
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('RESEND_API_KEY env var not set');
    return jsonResponse(500, { error: 'Email service not configured' });
  }

  const { subject, html, text } = buildEmail(name, type as 'athlete' | 'coach');

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: FROM, to: [email], subject, html, text })
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('Resend error:', res.status, detail);
      return jsonResponse(502, { error: 'Email send failed', status: res.status, detail });
    }
    const body = await res.json();
    return jsonResponse(200, { sent: true, id: body?.id });
  } catch (e) {
    console.error('Welcome email crashed:', e);
    return jsonResponse(500, { error: 'Unhandled exception', message: String((e as any)?.message || e) });
  }
});
