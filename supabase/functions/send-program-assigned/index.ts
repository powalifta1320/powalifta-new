// Supabase Edge Function: send-program-assigned
//
// POST { athleteEmail, athleteName, coachName, programName, week? }
// Sends a branded email to the athlete when their coach has just
// assigned them a (first) program, or published one week of it (week:
// a whole number from 1 to 99, sent when a draft week goes out: the
// email names that week). A caller that sends no week (or an older app)
// gets the program's email, as before. Uses Resend's REST API.
//
// Deploy: paste into a new Edge Function named "send-program-assigned"
// in the Supabase dashboard. Set the env var RESEND_API_KEY in the
// function's secrets. Toggle "Verify JWT" ON — only logged-in callers
// (the coach) can trigger this.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimit, rateLimitResponse } from '../_shared/rate-limit.ts';
import { owesSecondFactor, SECOND_FACTOR } from '../_shared/aal.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'POWALIFTA <noreply@powalifta.com>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function htmlEscape(str: string): string {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// The week a caller asked the email to name: a whole number from 1 to 99 (a number or its digits), else null (the
// program's email). Anything else in the field is ignored, never echoed.
export function weekOf(v: unknown): number | null {
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (typeof v === 'string' && !/^\s*\d{1,2}\s*$/.test(v)) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

export function buildEmail(opts: { athleteName: string; coachName: string; programName: string; week?: number | null }): { subject: string; html: string; text: string } {
  const firstName = (opts.athleteName || 'lifter').split(' ')[0];
  const safeAthlete = htmlEscape(firstName);
  const safeCoach = htmlEscape(opts.coachName || 'Your coach');
  const safeProgram = htmlEscape(opts.programName || 'a new program');
  const week = weekOf(opts.week);
  // A week's email names the program when it has a name (the app sends 'a new program' when it has none).
  const named = opts.programName && opts.programName !== 'a new program' ? opts.programName : '';

  const subject = week
    ? `${opts.coachName || 'Your coach'} published week ${week} — open POWALIFTA`
    : `${opts.coachName || 'Your coach'} just programmed you — open POWALIFTA`;

  const text = `Hey ${firstName},

${week
    ? `${opts.coachName || 'Your coach'} just published week ${week} of ${named ? `"${named}"` : 'your program'} on POWALIFTA.`
    : `${opts.coachName || 'Your coach'} just assigned you a new program on POWALIFTA: "${opts.programName || 'a new program'}".`}

Open your dashboard to see this week:
https://powalifta.com/athlete.html

When you train: open Today's session, mark sets complete as you finish, log how the working sets actually felt on a 1–10 RPE scale. Your e1RM updates automatically.

— POWALIFTA`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b0b0c; color: #f4f4f6; padding: 0; margin: 0;">
<div style="max-width: 540px; margin: 0 auto; padding: 32px 24px;">
  <div style="font-family: 'Anton', Impact, sans-serif; font-size: 1.8rem; letter-spacing: 0.02em; margin-bottom: 24px;">POWA<span style="color:#ff2d3f">LIFTA</span></div>
  <h1 style="font-size: 1.5rem; line-height: 1.25; margin: 0 0 18px;">${week ? `${safeCoach} published week ${week}, ${safeAthlete}.` : `${safeCoach} programmed you, ${safeAthlete}.`}</h1>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 22px;">${week ? `Week ${week} of ${named ? `<strong style="color:#f4f4f6;">${htmlEscape(named)}</strong>` : 'your program'} is live on your dashboard.` : `Your new program <strong style="color:#f4f4f6;">${safeProgram}</strong> is live on your dashboard.`}</p>
  <div style="margin: 0 0 28px;">
    <a href="https://powalifta.com/athlete.html" style="display:inline-block; background:#ff2d3f; color:#fff; text-decoration:none; padding:12px 22px; border-radius:10px; font-weight:700; letter-spacing:0.02em;">Open my dashboard</a>
  </div>
  <p style="color: #b8b8c0; line-height: 1.6; margin: 0 0 22px;"><strong style="color:#f4f4f6;">How it works:</strong></p>
  <ol style="color: #b8b8c0; line-height: 1.7; padding-left: 20px; margin: 0 0 22px;">
    <li>Open Today's session at the gym</li>
    <li>Tick each set as you finish</li>
    <li>Log actual RPE 1–10 for working sets</li>
    <li>e1RM updates automatically</li>
  </ol>
  <p style="color: #82828c; font-size: 0.9rem; line-height: 1.6; margin: 0;"><em>Tip:</em> tap any weight in your session to see the plate breakdown.</p>
  <p style="color: #82828c; font-size: 0.85rem; line-height: 1.6; margin-top: 32px; padding-top: 22px; border-top: 1px solid #25252c;">Questions? Reply to this email.<br>— POWALIFTA</p>
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
  const athleteName = String(payload?.athleteName || '').trim();
  // Both land in the subject line: no links, no line breaks, short.
  const clean = (v: unknown) => String(v || '').replace(/https?:\/\/\S+/gi, '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  const coachName = clean(payload?.coachName);
  const programName = clean(payload?.programName);
  const week = weekOf(payload?.week);   // optional: publishing one week names it

  if (!athleteEmail || !athleteEmail.includes('@')) {
    return jsonResponse(400, { error: 'Invalid athlete email' });
  }

  // AUTHORIZATION. "Verify JWT ON" guarantees the caller is logged in, but that
  // alone lets ANY authenticated user send a POWALIFTA-branded email to ANY
  // address (a phishing / spam vector). Confirm the caller actually coaches an
  // athlete with this email before sending. The recipient is looked up with the
  // service role; the caller's identity comes only from their session JWT.
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse(500, { error: 'Server not configured' });
  }
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return jsonResponse(401, { error: 'Missing auth' });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !caller?.user) return jsonResponse(401, { error: 'Invalid session' });
  // Two-factor (migration-mfa-aal2): an account with an authenticator acts here only at aal2 (_shared/aal.ts).
  if (owesSecondFactor(jwt, caller.user)) return jsonResponse(403, SECOND_FACTOR);

  // Per-coach ceiling so a looping session can't spam program-assigned mail.
  // Fails open if the meter (rl_bump) isn't deployed yet.
  const rl = await rateLimit(admin, {
    bucket: 'program-assigned', identity: caller.user.id, limit: 60, windowSecs: 3600,
  });
  if (!rl.ok) return rateLimitResponse(rl, { 'Access-Control-Allow-Origin': '*' });

  const { data: linked } = await admin
    .from('profiles')
    .select('id')
    .eq('coach_id', caller.user.id)
    .ilike('email', athleteEmail.replace(/[\\%_]/g, '\\$&'))   // a literal match: no pattern characters
    .limit(1);
  if (!linked || !linked.length) {
    return jsonResponse(403, { error: 'Not your athlete' });
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('RESEND_API_KEY env var not set');
    return jsonResponse(500, { error: 'Email service not configured' });
  }

  const { subject, html, text } = buildEmail({ athleteName, coachName, programName, week });

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
      // The provider's own words stay in the function log; the caller gets the plain reason.
      return jsonResponse(502, { error: 'Email send failed', status: res.status });
    }
    const body = await res.json();
    return jsonResponse(200, { sent: true, id: body?.id });
  } catch (e) {
    console.error('Program-assigned email crashed:', e);
    return jsonResponse(500, { error: 'Email send failed' });
  }
});
