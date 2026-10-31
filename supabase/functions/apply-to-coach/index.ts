// Supabase Edge Function: apply-to-coach (night C review fixes, 30 Oct 2026). Verify JWT OFF: the people who apply
// aren't on POWALIFTA yet. The only way an application gets in: sql/migration-coach-applications-2026-10-30.sql's
// functions run with the service role only, called from here.
//
// POST JSON, three actions:
//   { action: 'open', coachId }
//       → 200 { open }: does this coach take applications here? The profile (coach-profile.html) shows its Apply form
//         only on true, so the form never goes live before this function and the migration both do (review B1).
//   { action: 'apply', coachId, name, email, trainingYears, squat, bench, deadlift, bodyweight (kg), nextMeet
//     ('YYYY-MM-DD'), goals, note, company (a field people never see: a bot fills it) }
//       → 200 { ok: true }: stored unconfirmed, and the applicant is emailed a link (48 hours). Nothing reaches the coach
//         until it's opened, so nobody can apply as someone else (M2). The same answer for every case past the checks:
//         a filled-in company field, or a 4th application from one email in a day, is dropped silently, so the answer
//         never tells anyone what an email has done (m4).
//       → 400 { error: 'invalid', message }: the database's own words (a name too long, a lift over 700 kg…)
//       → 429 { error: 'rate_limited', message }: 10 a day from one IP, 300 an hour from everyone (M1)
//       → 502 { error: 'email_failed', message } · 503 { error: 'not_ready' } (the migration isn't in)
//   { action: 'confirm', token }   (the link: coach-profile.html?id=<coach>#confirm=<token>)
//       → 200 { ok: true, state: 'confirmed' | 'already', coach } | 200 { ok: false, state: 'unknown' }
//         On the first open the coach hears at once (M5): a push (their alerts switch decides, push-deliver.ts) and an
//         email naming who applied (never their note: that stays in the app).
//
// Limits (_shared/rate-limit.ts, fail-open like every function): apply-all 300/h, apply-ip 10/day, apply-email 3/day
// (counts every attempt, so a repeat costs what a new one does), apply-confirm-ip 30/h.
// Secrets: RESEND_API_KEY (send-invite's), the push secrets (send-push's: VAPID_*, APNS_*), SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (injected). No new secret.
// Deploy: ./deploy.sh (NO_JWT group), then run the migration. Tested under Node: test/apply-to-coach.test.mjs.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { clientIp, rateLimit } from '../_shared/rate-limit.ts';
import { deliver } from '../_shared/push-deliver.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'POWALIFTA <noreply@powalifta.com>';
const SITE = 'https://www.powalifta.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // supabase-js's functions.invoke() sends x-client-info: the preflight must allow it (send-invite's note).
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
function htmlEscape(str: string): string {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
// A name as it rides in an email: no links, no line breaks, no control or format characters, a sane length.
export function mailName(v: unknown, fallback: string): string {
  const s = String(v == null ? '' : v).replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/https?:\/\/\S+/gi, '').replace(/www\.\S+/gi, '')
    .replace(/\s{2,}/g, ' ').trim().slice(0, 60);
  return s || fallback;
}
function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(d).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The applicant's email: open the link and the application goes to the coach.
export function confirmEmail(o: { coach: string; link: string }): { subject: string; html: string; text: string } {
  const coach = mailName(o.coach, 'the coach');
  const subject = `Confirm your application to ${coach}`;
  const text = `You applied to train with ${coach} on POWALIFTA.

Open this link to send it. ${coach} sees nothing until you do, and the link works for 48 hours:
${o.link}

If it's a fit, ${coach} emails you an invite link.

Didn't apply? Ignore this email: nothing is sent without the link.

POWALIFTA`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#060607;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:36px 24px;">
  <div style="font-weight:800;font-size:15px;letter-spacing:0.08em;margin:0 0 30px;">POWALIFTA</div>
  <h1 style="font-size:26px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 14px;">Send your application to ${htmlEscape(coach)}</h1>
  <p style="color:#b9b9c1;font-size:16px;line-height:1.6;margin:0 0 26px;">${htmlEscape(coach)} sees nothing until you open this. The link works for 48 hours.</p>
  <a href="${htmlEscape(o.link)}" style="display:inline-block;background:#c41a2c;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:650;font-size:16px;">Send my application</a>
  <p style="color:#8e8e98;font-size:14px;line-height:1.6;margin:28px 0 0;">If it's a fit, ${htmlEscape(coach)} emails you an invite link.</p>
  <p style="color:#6f6f78;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:20px;border-top:1px solid #1d1d22;">Didn't apply? Ignore this email: nothing is sent without the link.</p>
</div></body></html>`;
  return { subject, html, text };
}

// The coach's email: who applied, in one line; the rest (their note too) only in the app.
export function leadSummary(a: Record<string, unknown>): string {
  const y = num(a.training_years);
  const years = y == null ? '' : y <= 0 ? 'under a year training' : y >= 10 ? '10+ years training' : y >= 5 ? '5 to 9 years training' : y + (y === 1 ? ' year' : ' years') + ' training';
  const kg = (v: unknown) => { const n = num(v); return n && n > 0 ? String(Math.round(n * 2) / 2) : '–'; };
  const lifts = [a.squat_kg, a.bench_kg, a.deadlift_kg].some((v) => (num(v) || 0) > 0) ? kg(a.squat_kg) + ' / ' + kg(a.bench_kg) + ' / ' + kg(a.deadlift_kg) + ' kg' : '';
  const bw = (num(a.bodyweight_kg) || 0) > 0 ? String(Math.round((num(a.bodyweight_kg) as number) * 10) / 10) + ' kg bodyweight' : '';
  const meet = typeof a.next_meet === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.next_meet) ? 'next meet ' + a.next_meet.slice(0, 10) : '';
  return [years, lifts, bw, meet].filter(Boolean).join(' · ');
}
export function coachEmail(o: { name: string; summary: string; link: string }): { subject: string; html: string; text: string } {
  const who = mailName(o.name, 'Someone');
  const subject = `${who} applied to train with you`;
  const text = `${who} applied to train with you on POWALIFTA${o.summary ? ': ' + o.summary : ''}.

Read it and answer on Lifters, under New lifters:
${o.link}

POWALIFTA`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#060607;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:36px 24px;">
  <div style="font-weight:800;font-size:15px;letter-spacing:0.08em;margin:0 0 30px;">POWALIFTA</div>
  <h1 style="font-size:26px;line-height:1.2;letter-spacing:-0.02em;margin:0 0 14px;">${htmlEscape(who)} applied to train with you</h1>
  ${o.summary ? `<p style="color:#b9b9c1;font-size:16px;line-height:1.6;margin:0 0 26px;">${htmlEscape(o.summary)}</p>` : ''}
  <a href="${htmlEscape(o.link)}" style="display:inline-block;background:#c41a2c;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:650;font-size:16px;">Read it in POWALIFTA</a>
  <p style="color:#6f6f78;font-size:13px;line-height:1.6;margin:28px 0 0;padding-top:20px;border-top:1px solid #1d1d22;">They confirmed their email. Their note and the rest are on Lifters, under New lifters.</p>
</div></body></html>`;
  return { subject, html, text };
}

async function sendMail(to: string, m: { subject: string; html: string; text: string }): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) { console.error('RESEND_API_KEY not set'); return false; }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!res.ok) { console.error('Resend error:', res.status, await res.text()); return false; }
    return true;
  } catch (e) {
    console.error('Resend threw:', (e as Error)?.message || e);
    return false;
  }
}

// deno-lint-ignore no-explicit-any
async function open(admin: any, payload: any): Promise<Response> {
  const coachId = String(payload?.coachId || '');
  if (!UUID.test(coachId)) return json(200, { open: false });
  const { data, error } = await admin.rpc('coach_applications_open', { p_coach: coachId });
  if (error) { console.warn('open:', error.code || '', error.message || error); return json(200, { open: false }); }
  return json(200, { open: data === true });
}

// deno-lint-ignore no-explicit-any
async function apply(admin: any, req: Request, p: any): Promise<Response> {
  const busy = await rateLimit(admin, { bucket: 'apply-all', identity: 'all', limit: 300, windowSecs: 3600 });
  if (!busy.ok) return json(429, { error: 'rate_limited', message: 'Applications are busy right now. Try again in an hour.' });
  const ip = await rateLimit(admin, { bucket: 'apply-ip', identity: clientIp(req), limit: 10, windowSecs: 86400 });
  if (!ip.ok) return json(429, { error: 'rate_limited', message: 'That’s a lot of applications from here today. Try again tomorrow.' });
  // A field nobody sees, filled in: a bot. The same answer as a real one, and nothing kept.
  if (String(p?.company || '').trim()) { console.log('apply: honeypot'); return json(200, { ok: true }); }
  const coachId = String(p?.coachId || '');
  if (!UUID.test(coachId)) return json(400, { error: 'invalid', message: 'This coach isn’t taking applications here.' });
  const email = String(p?.email || '').trim().toLowerCase().slice(0, 300);
  // Every attempt from one email counts (a repeat costs what a new one does); past 3 a day, silently nothing.
  const per = await rateLimit(admin, { bucket: 'apply-email', identity: email, limit: 3, windowSecs: 86400 });
  if (!per.ok) { console.log('apply: email over its day'); return json(200, { ok: true }); }

  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256Hex(token);
  const meet = typeof p?.nextMeet === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.nextMeet) ? p.nextMeet : null;
  const { data, error } = await admin.rpc('apply_to_coach', {
    p_coach: coachId, p_name: String(p?.name || '').slice(0, 200), p_email: email,
    p_training_years: num(p?.trainingYears), p_squat: num(p?.squat), p_bench: num(p?.bench), p_deadlift: num(p?.deadlift),
    p_bodyweight: num(p?.bodyweight), p_next_meet: meet,
    p_goals: p?.goals ? String(p.goals).slice(0, 600) : null, p_note: p?.note ? String(p.note).slice(0, 2000) : null,
    p_confirm_hash: hash,
  });
  if (error) {
    if (error.code === 'P0001' && error.message) return json(400, { error: 'invalid', message: String(error.message).slice(0, 160) });
    if (/PGRST202|42883|could not find the function|schema cache/i.test(String(error.code || '') + ' ' + String(error.message || ''))) return json(503, { error: 'not_ready' });
    console.error('apply_to_coach:', error.code || '', error.message || error);
    return json(500, { error: 'failed' });
  }
  const row = (Array.isArray(data) ? data[0] : data) || {};
  const link = `${SITE}/coach-profile.html?id=${encodeURIComponent(coachId)}#confirm=${token}`;
  const sent = await sendMail(email, confirmEmail({ coach: String(row.coach_name || ''), link }));
  if (!sent) return json(502, { error: 'email_failed', message: 'We couldn’t send the email. Try again in a few minutes.' });
  return json(200, { ok: true });
}

// deno-lint-ignore no-explicit-any
async function confirm(admin: any, req: Request, p: any): Promise<Response> {
  const rl = await rateLimit(admin, { bucket: 'apply-confirm-ip', identity: clientIp(req), limit: 30, windowSecs: 3600 });
  if (!rl.ok) return json(429, { error: 'rate_limited', message: 'Too many tries from here. Try again in an hour.' });
  const token = String(p?.token || '');
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return json(200, { ok: false, state: 'unknown' });
  const { data, error } = await admin.rpc('confirm_coach_application', { p_hash: await sha256Hex(token) });
  if (error) {
    if (/PGRST202|42883|could not find the function|schema cache/i.test(String(error.code || '') + ' ' + String(error.message || ''))) return json(503, { error: 'not_ready' });
    console.error('confirm_coach_application:', error.code || '', error.message || error);
    return json(500, { error: 'failed' });
  }
  const a = (Array.isArray(data) ? data[0] : data) || {};
  if (a.result !== 'confirmed' && a.result !== 'already') return json(200, { ok: false, state: 'unknown' });
  const coach = mailName(a.coach_name, 'the coach');
  if (a.result === 'confirmed' && a.coach_id) {
    const who = mailName(a.name, 'Someone');
    const url = '/coach.html?lead=' + encodeURIComponent(String(a.id || ''));
    try {
      await deliver(admin, String(a.coach_id), { title: 'New application', body: who + ' wants to train with you', url, tag: 'lead-' + String(a.id || '').slice(0, 40) }, 'alerts');
    } catch (e) { console.error('lead push:', (e as Error)?.message || e); }
    try {
      const { data: prof } = await admin.from('profiles').select('email').eq('id', String(a.coach_id)).maybeSingle();
      const to = String(prof?.email || '').trim();
      if (to.includes('@')) await sendMail(to, coachEmail({ name: who, summary: leadSummary(a), link: SITE + url }));
    } catch (e) { console.error('lead email:', (e as Error)?.message || e); }
  }
  return json(200, { ok: true, state: a.result, coach });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json(200, { ok: true });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  // deno-lint-ignore no-explicit-any
  let payload: any;
  try { payload = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set'); return json(500, { error: 'Server not configured' }); }
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  try {
    if (payload?.action === 'open') return await open(admin, payload);
    if (payload?.action === 'apply') return await apply(admin, req, payload);
    if (payload?.action === 'confirm') return await confirm(admin, req, payload);
    return json(400, { error: 'Unknown action' });
  } catch (e) {
    console.error('apply-to-coach crashed:', (e as Error)?.message || e);
    return json(500, { error: 'failed' });
  }
});
