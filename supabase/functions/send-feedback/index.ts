// Supabase Edge Function: send-feedback (the Feedback box, 3 Nov 2026). Verify JWT ON: only a signed-in coach or lifter
// sends one, and who sent it comes from the token alone (auth.getUser), never from the body.
//
// POST { kind: 'idea' | 'problem', body: their words (1 to 4,000 characters), context?: a problem's technical details
//        (feedback.js buildContext: allow-listed keys only, at most 8 KB; {} for an idea or with the switch off) }
//   → 200 { ok: true, id }                     saved (sql/migration-feedback-2026-11-03.sql), then every admin account
//                                              is emailed. The email is best-effort: a failed one still answers 200,
//                                              the row is what counts (admin.html › Feedback).
//   → 400 { error: 'invalid', message }        a kind, a body or details the app would never send
//   → 401 Missing auth / Invalid session · 403 { code: 'aal2_required' } (two-factor, _shared/aal.ts)
//   → 429 { error: 'rate_limited', message }   20 in 24 hours a person, counted here with the service role (the table's
//                                              guard holds the same cap for two sends at once)
//   → 503 { error: 'not_ready' }               the migration isn't in yet: the app keeps the draft
//   → 500 { error: 'save_failed' }
//
// The email: "Problem from Sarah Kim (lifter)", the words, who (name, role, email), the details, a link to the admin
// page; Reply goes to the sender. Everything they wrote is HTML-escaped; names lose links and line breaks. Nothing they
// wrote reaches the function log (counts only).
// Secrets: RESEND_API_KEY (send-invite's), SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (injected). No new secret.
// Deploy: ./deploy.sh functions (WITH_JWT group; config.toml verify_jwt = true), after the migration.
// Tested under Node: test/send-feedback.test.mjs (the handler with fakes) and test/edge-aal.test.mjs (two-factor).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { owesSecondFactor, SECOND_FACTOR } from '../_shared/aal.ts';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'POWALIFTA <noreply@powalifta.com>';
const SITE = 'https://www.powalifta.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export const KINDS = ['idea', 'problem'];
export const MAX_BODY = 4000;
export const MAX_CONTEXT = 8192;
export const DAILY_CAP = 20;
// The technical details' keys, as feedback.js builds them (a unit test holds the two lists equal).
export const CONTEXT_KEYS = ['screen', 'route', 'app', 'version', 'device', 'ua', 'viewport', 'theme', 'layout', 'errors'];
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  // supabase-js's functions.invoke() sends x-client-info: the preflight must allow it (send-invite's note).
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
export function htmlEscape(str: unknown): string {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
// A name as it rides in a subject line: no links, no line breaks, no control or format characters, a sane length.
export function mailName(v: unknown, fallback: string): string {
  const s = String(v == null ? '' : v).replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/https?:\/\/\S+/gi, '').replace(/www\.\S+/gi, '')
    .replace(/\s{2,}/g, ' ').trim().slice(0, 60);
  return s || fallback;
}
// What never belongs in the details (feedback.js scrub does the same in the app): an email becomes [email], a token
// (a JWT, a Bearer value, 32+ characters of hex or base64) becomes [token], a link loses its query and fragment.
export function scrub(v: unknown): string {
  return String(v == null ? '' : v)
    .replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, ' ')
    .replace(/\b(https?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, '$1')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[token]')
    .replace(/\b(Bearer|token|apikey|access_token|refresh_token)([\s:=]+)[A-Za-z0-9._~+\/-]{8,}=*/gi, '$1$2[token]')
    .replace(/\b[A-Za-z0-9_\-+\/]{32,}={0,2}/g, (m) => /[0-9]/.test(m) && /[A-Za-z]/.test(m) ? '[token]' : m)
    .replace(/\s{2,}/g, ' ').trim();
}
const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  // by code point: never half an emoji (a lone surrogate is JSON Postgres refuses)
  const s = Array.from(scrub(v)).slice(0, max).join('').trim();
  return s ? s : null;
};
const chars = (s: string) => Array.from(s).length;   // as Postgres char_length counts (code points)

// The details as they're kept: only the allow-listed keys, each typed and cut to size; anything else is dropped.
export function cleanContext(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v != null && v !== '') out[k] = v; };
  put('screen', str(raw.screen, 80));
  const route = str(raw.route, 200);
  put('route', route ? route.replace(/[?#].*$/, '') : null);
  put('app', ['web', 'iphone', 'android'].includes(raw.app as string) ? raw.app : null);
  put('version', str(raw.version, 60));
  put('device', str(raw.device, 120));
  put('ua', str(raw.ua, 300));
  put('viewport', str(raw.viewport, 40));
  put('theme', ['dark', 'light'].includes(raw.theme as string) ? raw.theme : null);
  put('layout', ['phone', 'desk'].includes(raw.layout as string) ? raw.layout : null);
  if (Array.isArray(raw.errors)) {
    const errs = raw.errors.slice(-5).map((e) => {
      if (!e || typeof e !== 'object') return null;
      const r = e as Record<string, unknown>;
      const msg = str(r.msg, 300);
      if (!msg) return null;
      const at = typeof r.at === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(r.at) ? r.at.slice(0, 30) : null;
      const kind = ['error', 'promise', 'warn'].includes(r.kind as string) ? r.kind : 'error';
      return at ? { kind, msg, at } : { kind, msg };
    }).filter(Boolean);
    if (errs.length) out.errors = errs;
  }
  return out;
}

// → { ok: true, kind, body, context } | { ok: false, message }
export function validateFeedback(p: unknown): { ok: true; kind: string; body: string; context: Record<string, unknown> } | { ok: false; message: string } {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, message: 'Send { kind, body }.' };
  const o = p as Record<string, unknown>;
  if (!KINDS.includes(o.kind as string)) return { ok: false, message: 'kind is idea or problem.' };
  if (typeof o.body !== 'string') return { ok: false, message: 'Write something first.' };
  // Line breaks kept, other control characters out, trimmed.
  const body = o.body.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/\p{Cs}/gu, '').trim();
  if (!/\S/.test(body)) return { ok: false, message: 'Write something first.' };
  if (chars(body) > MAX_BODY) return { ok: false, message: 'That’s over 4,000 characters.' };
  let context: Record<string, unknown> = {};
  if (o.context != null) {
    if (typeof o.context !== 'object' || Array.isArray(o.context)) return { ok: false, message: 'context is an object.' };
    if (new TextEncoder().encode(JSON.stringify(o.context)).length > MAX_CONTEXT) return { ok: false, message: 'The technical details are over 8 KB.' };
    context = cleanContext(o.context as Record<string, unknown>);
    // The table measures the details as jsonb text (wider than this compact JSON): stay well under its 8 KB by letting
    // the oldest errors go, then the browser line, so a send never fails at the table for being near the edge.
    const size = () => new TextEncoder().encode(JSON.stringify(context)).length;
    while (size() > 7000 && Array.isArray(context.errors) && (context.errors as unknown[]).length) {
      (context.errors as unknown[]).shift();
      if (!(context.errors as unknown[]).length) delete context.errors;
    }
    if (size() > 7000) delete context.ua;
  }
  // An idea carries no technical details (the app only offers them with a problem).
  if (o.kind === 'idea') context = {};
  return { ok: true, kind: o.kind as string, body, context };
}

const ROLE_WORD: Record<string, string> = { athlete: 'lifter', coach: 'coach', admin: 'admin' };
export function roleWord(userType: unknown): string { return ROLE_WORD[String(userType || '')] || 'lifter'; }
const APP_WORD: Record<string, string> = { web: 'Web', iphone: 'iPhone app', android: 'Android app' };
// The details as lines for the email: [label, value].
export function contextLines(c: Record<string, unknown>): [string, string][] {
  const L: [string, string][] = [];
  if (c.screen) L.push(['Screen', String(c.screen)]);
  if (c.route) L.push(['Page', String(c.route)]);
  if (c.app || c.version) L.push(['App', [APP_WORD[String(c.app)] || '', c.version ? String(c.version) : ''].filter(Boolean).join(' ')]);
  if (c.device) L.push(['Device', String(c.device)]);
  if (c.viewport || c.layout) L.push(['Screen size', [c.viewport, c.layout === 'desk' ? 'laptop layout' : c.layout === 'phone' ? 'phone layout' : ''].filter(Boolean).join(', ')]);
  if (c.theme) L.push(['Theme', c.theme === 'light' ? 'Light' : 'Dark']);
  if (c.ua) L.push(['Browser', String(c.ua)]);
  return L;
}

// The admins' email. o: { kind, body, context, sender: { name, role, email }, id, createdAt }
export function feedbackEmail(o: { kind: string; body: string; context: Record<string, unknown>; sender: { name?: string; role?: string; email?: string }; id?: string; createdAt?: string }): { subject: string; html: string; text: string } {
  const Kind = o.kind === 'problem' ? 'Problem' : 'Idea';
  const name = mailName(o.sender && o.sender.name, 'Someone');
  const role = o.sender && o.sender.role ? o.sender.role : 'lifter';
  const email = o.sender && o.sender.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.sender.email) ? o.sender.email : '';
  const subject = `${Kind} from ${name} (${role})`;
  const who = name + ' · ' + role + (email ? ' · ' + email : '');
  const lines = contextLines(o.context || {});
  const errs = Array.isArray(o.context && o.context.errors) ? (o.context.errors as { kind?: string; msg?: string; at?: string }[]) : [];
  const link = SITE + '/admin.html#feedback';
  const when = o.createdAt ? new Date(o.createdAt).toUTCString().replace(/ GMT$/, ' UTC') : '';
  const text = [
    `${Kind} from ${who}${when ? '\n' + when : ''}`,
    '',
    o.body,
    '',
    lines.length || errs.length ? 'Technical details:' : (o.kind === 'problem' ? 'No technical details (they turned them off).' : ''),
    ...lines.map(([k, v]) => '  ' + k + ': ' + v),
    ...(errs.length ? ['  Recent errors:', ...errs.map((e) => '    - ' + (e.at ? e.at.slice(11, 16) + ' UTC ' : '') + (e.msg || ''))] : []),
    '',
    'Read it, mark it seen or done, and keep a note: ' + link,
    email ? `Reply to this email to write back to ${name}.` : '',
    '',
    'POWALIFTA',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  const row = (k: string, v: string) => `<tr><td style="padding:4px 14px 4px 0;color:#8e8e98;white-space:nowrap;vertical-align:top;">${htmlEscape(k)}</td><td style="padding:4px 0;color:#d6d6dc;word-break:break-word;">${htmlEscape(v)}</td></tr>`;
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#060607;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:36px 24px;">
  <div style="font-weight:800;font-size:15px;letter-spacing:0.08em;margin:0 0 26px;">POWALIFTA</div>
  <p style="margin:0 0 6px;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid ${o.kind === 'problem' ? '#ffb547' : '#34343d'};color:${o.kind === 'problem' ? '#ffb547' : '#c9c9d1'};font-size:13px;font-weight:650;">${Kind}</span></p>
  <h1 style="font-size:22px;line-height:1.3;letter-spacing:-0.01em;margin:12px 0 4px;">${htmlEscape(name)} <span style="color:#8e8e98;font-weight:500;">(${htmlEscape(role)})</span></h1>
  <p style="color:#8e8e98;font-size:14px;line-height:1.5;margin:0 0 20px;">${email ? `<a href="mailto:${htmlEscape(email)}" style="color:#b9b9c1;">${htmlEscape(email)}</a>` : 'No email on the account'}${when ? ' · ' + htmlEscape(when) : ''}</p>
  <div style="font-size:16px;line-height:1.6;color:#f5f5f7;white-space:pre-wrap;word-break:break-word;background:#0f0f11;border:1px solid #232327;border-radius:14px;padding:16px 18px;margin:0 0 22px;">${htmlEscape(o.body)}</div>
  ${lines.length || errs.length ? `<p style="font-size:13px;font-weight:650;color:#b9b9c1;margin:0 0 6px;">Technical details</p>
  <table role="presentation" style="border-collapse:collapse;font-size:13px;line-height:1.5;margin:0 0 ${errs.length ? 10 : 22}px;">${lines.map(([k, v]) => row(k, v)).join('')}</table>
  ${errs.length ? `<p style="font-size:13px;color:#8e8e98;margin:0 0 4px;">Recent errors</p><ul style="margin:0 0 22px;padding-left:18px;font-size:13px;line-height:1.5;color:#d6d6dc;">${errs.map((e) => `<li style="word-break:break-word;">${e.at ? htmlEscape(e.at.slice(11, 16) + ' UTC') + ' · ' : ''}${htmlEscape(e.msg || '')}</li>`).join('')}</ul>` : ''}`
    : (o.kind === 'problem' ? '<p style="font-size:13px;color:#8e8e98;margin:0 0 22px;">No technical details: they turned them off.</p>' : '')}
  <a href="${link}" style="display:inline-block;background:#c41a2c;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:650;font-size:15px;">Open it on the admin page</a>
  <p style="color:#6f6f78;font-size:13px;line-height:1.6;margin:24px 0 0;padding-top:18px;border-top:1px solid #1d1d22;">${email ? `Reply to this email to write back to ${htmlEscape(name)}.` : 'The account has no email to reply to.'}</p>
</div></body></html>`;
  return { subject, html, text };
}

const NOT_READY = /PGRST20[0-9]|42P01|schema cache|does not exist|could not find/i;
const errText = (e: { code?: string; message?: string; details?: string } | null) => e ? String(e.code || '') + ' ' + String(e.message || '') + ' ' + String(e.details || '') : '';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json(200, { ok: true });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('send-feedback: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set'); return json(500, { error: 'Server not configured' }); }

  let payload: unknown;
  try { payload = await req.json(); } catch { return json(400, { error: 'invalid', message: 'Invalid JSON' }); }

  // Who: the token's user, as Auth reads it. Verify JWT is on as well (config.toml, deploy.sh).
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'Missing auth' });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt);
  if (callerErr || !caller?.user) return json(401, { error: 'Invalid session' });
  if (owesSecondFactor(jwt, caller.user)) return json(403, SECOND_FACTOR);
  const uid = caller.user.id;

  const v = validateFeedback(payload);
  if (!v.ok) return json(400, { error: 'invalid', message: v.message });

  // The cap, counted with the service role: 20 in the last 24 hours.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: countErr } = await admin.from('feedback').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('created_at', since);
  if (countErr) {
    if (NOT_READY.test(errText(countErr))) return json(503, { error: 'not_ready' });
    console.error('send-feedback: count failed', countErr.code || '');
    return json(500, { error: 'save_failed' });
  }
  if ((count || 0) >= DAILY_CAP) return json(429, { error: 'rate_limited', message: 'That’s 20 today. Send the rest tomorrow.' });

  const { data: row, error: insErr } = await admin.from('feedback').insert({ user_id: uid, kind: v.kind, body: v.body, context: v.context }).select('id, created_at').single();
  if (insErr) {
    const t = errText(insErr);
    if (/feedback_cap/.test(t)) return json(429, { error: 'rate_limited', message: 'That’s 20 today. Send the rest tomorrow.' });
    if (NOT_READY.test(t)) return json(503, { error: 'not_ready' });
    console.error('send-feedback: insert failed', insErr.code || '');
    return json(500, { error: 'save_failed' });
  }
  const id = (row && row.id) || null;

  // The email: best-effort. Whatever happens here, the row is saved and the answer is 200.
  let emailed = 0;
  try {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) throw new Error('RESEND_API_KEY not set');
    const [{ data: prof }, { data: admins }] = await Promise.all([
      admin.from('profiles').select('name, user_type').eq('id', uid).maybeSingle(),
      admin.from('profiles').select('id').eq('is_admin', true).limit(10),
    ]);
    const ids = (admins || []).map((a: { id: string }) => a.id).filter(Boolean);
    const found = await Promise.all(ids.map(async (aid: string) => {
      try { const { data } = await admin.auth.admin.getUserById(aid); return data && data.user && data.user.email ? String(data.user.email).toLowerCase() : null; }
      catch { return null; }
    }));
    const to = Array.from(new Set(found.filter((e): e is string => !!e && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))));
    if (to.length) {
      const senderEmail = caller.user.email || '';
      const mail = feedbackEmail({ kind: v.kind, body: v.body, context: v.context, id: id || undefined, createdAt: (row && row.created_at) || new Date().toISOString(),
        sender: { name: prof && prof.name, role: roleWord(prof && prof.user_type), email: senderEmail } });
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      try {
        const res = await fetch(RESEND_ENDPOINT, {
          method: 'POST', signal: ctl.signal,
          headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ from: FROM, to, subject: mail.subject, html: mail.html, text: mail.text },
            /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(senderEmail) ? { reply_to: senderEmail } : {})),
        });
        if (res.ok) emailed = to.length; else console.error('send-feedback: email refused', res.status);
      } finally { clearTimeout(timer); }
    }
  } catch (e) {
    console.error('send-feedback: email skipped', e instanceof Error ? e.message.slice(0, 80) : 'error');
  }
  console.log('send-feedback: saved', v.kind, 'emailed', emailed);
  return json(200, { ok: true, id });
});
