// Supabase Edge Function: send-weekly-digest
//
// Scheduled (cron) batch job — NOT called from the browser. Emails every
// opted-in athlete a recap of their last 7 days of training: sessions,
// sets, tonnage, best e1RMs, current competition-equivalent total, and a
// bodyweight trend. One row per athlete in `email_preferences` gates it
// (`weekly_digest = true`; a MISSING row also counts as opted-in, but the
// backfill in migration-email-preferences.sql pre-seeds everyone so the
// unsub_token is ready). Every email carries a one-click unsubscribe link.
//
// AUTH MODEL: "Verify JWT" is OFF (a cron scheduler has no user session),
// so the function gates itself on a shared secret. The caller MUST send
// `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret: <CRON_SECRET>`).
// Without a configured CRON_SECRET the function refuses to run — it can
// never be left publicly invokable by accident.
//
// Deploy:  ./deploy.sh  (encodes --no-verify-jwt for this function), OR
//          paste into a Supabase Edge Function named "send-weekly-digest"
//          and toggle Verify JWT OFF.
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          CRON_SECRET (any long random string), and optionally
//          UNSUB_BASE (defaults to https://powalifta.com/unsubscribe.html?token=).
// Schedule (Supabase → Database → Cron, or pg_cron):
//   select cron.schedule('powa-weekly-digest', '0 14 * * 1',  -- Mondays 14:00 UTC
//     $$ select net.http_post(
//          url    := 'https://<ref>.functions.supabase.co/send-weekly-digest',
//          headers:= jsonb_build_object('Authorization','Bearer '||'<CRON_SECRET>'),
//          body   := '{}'::jsonb) $$);
//
// PREP status: everything below is complete and testable, but it cannot
// send a single email until (a) it is deployed, (b) the four secrets are
// set, and (c) the cron entry above exists. Until then nothing fires.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'POWALIFTA <noreply@powalifta.com>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';
const UNSUB_BASE = Deno.env.get('UNSUB_BASE') || 'https://powalifta.com/unsubscribe.html?token=';

const MAIN_LIFTS = ['squat', 'bench', 'deadlift'] as const;
const LIFT_LABELS: Record<string, string> = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
const DAY_MS = 86400000;

// Query caps. This is a batch job; at real scale the log pull should move to
// a SQL view / RPC that pre-aggregates per athlete. For now bound every read.
const MAX_PREFS = 5000;
const MAX_LOGS = 50000;
const MAX_BW = 20000;

interface LogRow { athlete_id: string; lift: string; weight: number; reps: number; e1rm_comp: number; date: string; }
interface BwRow { athlete_id: string; date: string; weight: number; }

function htmlEscape(str: string): string {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function round1(n: number): number { return Math.round(n * 10) / 10; }
function kg(n: number): string { return round1(n).toLocaleString('en-US') + ' kg'; }

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-cron-secret'
    }
  });
}

// --- Per-athlete recap, computed purely from stored rows (no e1RM math here:
// e1rm_comp is already competition-equivalent per row, so we just aggregate). ---
interface Recap {
  sessions: number;          // distinct training dates in the last 7d
  sets: number;              // logged sets in the last 7d
  tonnage: number;           // sum(weight*reps) in the last 7d, kg
  bestThisWeek: { lift: string; e1rm: number }[];  // best e1rm_comp per main lift, last 7d
  total: number;             // sum of best e1rm_comp per main lift over the 90d window
  bwDelta: number | null;    // kg change across the last ≤14 days (last - first)
  bwLatest: number | null;
}

function buildRecap(logs90: LogRow[], bw: BwRow[], now: number): Recap {
  const c7 = now - 7 * DAY_MS;
  const logs7 = logs90.filter(l => new Date(l.date + 'T00:00:00Z').getTime() >= c7);

  const dates = new Set<string>();
  let sets = 0, tonnage = 0;
  const bestWk: Record<string, number> = {};
  for (const l of logs7) {
    dates.add(l.date);
    sets++;
    if (Number.isFinite(l.weight) && Number.isFinite(l.reps)) tonnage += l.weight * l.reps;
    if (MAIN_LIFTS.includes(l.lift as any) && Number.isFinite(l.e1rm_comp)) {
      bestWk[l.lift] = Math.max(bestWk[l.lift] || 0, l.e1rm_comp);
    }
  }
  const bestAll: Record<string, number> = {};
  for (const l of logs90) {
    if (MAIN_LIFTS.includes(l.lift as any) && Number.isFinite(l.e1rm_comp)) {
      bestAll[l.lift] = Math.max(bestAll[l.lift] || 0, l.e1rm_comp);
    }
  }
  const total = MAIN_LIFTS.reduce((s, lift) => s + (bestAll[lift] || 0), 0);

  // Bodyweight trend across the last ≤14 days.
  const c14 = now - 14 * DAY_MS;
  const bwRecent = bw
    .filter(b => new Date(b.date + 'T00:00:00Z').getTime() >= c14 && Number.isFinite(b.weight))
    .sort((a, b) => a.date.localeCompare(b.date));
  let bwDelta: number | null = null, bwLatest: number | null = null;
  if (bwRecent.length) {
    bwLatest = bwRecent[bwRecent.length - 1].weight;
    if (bwRecent.length >= 2) bwDelta = bwLatest - bwRecent[0].weight;
  }

  return {
    sessions: dates.size,
    sets,
    tonnage,
    bestThisWeek: MAIN_LIFTS.filter(l => bestWk[l]).map(l => ({ lift: l, e1rm: bestWk[l] })),
    total,
    bwDelta,
    bwLatest
  };
}

function buildEmail(opts: { name: string; recap: Recap; unsubToken: string | null }): { subject: string; html: string; text: string } {
  const firstName = (opts.name || 'lifter').split(' ')[0];
  const safeName = htmlEscape(firstName);
  const r = opts.recap;

  const subject = `Your week: ${r.sessions} session${r.sessions === 1 ? '' : 's'}, ${kg(r.tonnage)} moved`;

  const statCell = (label: string, value: string) =>
    `<td style="padding:14px 10px; text-align:center; border:1px solid #25252c; background:#131317;">
       <div style="font-family:'Space Grotesk',monospace; font-size:1.5rem; font-weight:700; color:#f4f4f6;">${value}</div>
       <div style="font-size:0.72rem; letter-spacing:0.04em; text-transform:uppercase; color:#82828c; margin-top:4px;">${label}</div>
     </td>`;

  const prCells = r.bestThisWeek.length
    ? r.bestThisWeek.map(b =>
        `<tr>
           <td style="padding:8px 0; color:#b8b8c0;">${LIFT_LABELS[b.lift] || b.lift} e1RM</td>
           <td style="padding:8px 0; text-align:right; font-family:'Space Grotesk',monospace; font-weight:700; color:#f4f4f6;">${kg(b.e1rm)}</td>
         </tr>`).join('')
    : `<tr><td colspan="2" style="padding:8px 0; color:#82828c;">No top-set e1RMs logged on the main lifts this week.</td></tr>`;

  const bwLine = r.bwDelta != null
    ? `<p style="color:#b8b8c0; line-height:1.6; margin:0 0 22px;">Bodyweight ${r.bwDelta === 0 ? 'held steady' : (r.bwDelta > 0 ? 'up ' : 'down ') + kg(Math.abs(r.bwDelta))} over the last two weeks${r.bwLatest != null ? ` (now ${kg(r.bwLatest)})` : ''}.</p>`
    : '';

  const unsubUrl = opts.unsubToken ? UNSUB_BASE + encodeURIComponent(opts.unsubToken) : 'https://powalifta.com/athlete.html';

  const text = `Hey ${firstName},

Your last 7 days on POWALIFTA:
- ${r.sessions} session${r.sessions === 1 ? '' : 's'}
- ${r.sets} sets logged
- ${kg(r.tonnage)} total tonnage
- Competition-equivalent total: ${kg(r.total)}
${r.bestThisWeek.map(b => `- ${LIFT_LABELS[b.lift] || b.lift} best e1RM: ${kg(b.e1rm)}`).join('\n')}

Open your dashboard: https://powalifta.com/athlete.html

Don't want these? Unsubscribe: ${unsubUrl}

— POWALIFTA`;

  const html = `<!DOCTYPE html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0b0b0c; color: #f4f4f6; padding: 0; margin: 0;">
<div style="max-width: 540px; margin: 0 auto; padding: 32px 24px;">
  <div style="font-family: 'Anton', Impact, sans-serif; font-size: 1.8rem; letter-spacing: 0.02em; margin-bottom: 24px;">POWA<span style="color:#ff2d3f">LIFTA</span></div>
  <h1 style="font-size: 1.5rem; line-height: 1.25; margin: 0 0 6px;">Your week in the gym, ${safeName}.</h1>
  <p style="color: #82828c; font-size: 0.9rem; margin: 0 0 22px;">Last 7 days</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; margin: 0 0 24px;">
    <tr>
      ${statCell('Sessions', String(r.sessions))}
      ${statCell('Sets', String(r.sets))}
      ${statCell('Tonnage', kg(r.tonnage))}
    </tr>
  </table>
  <div style="border:1px solid #25252c; border-radius:12px; padding:16px 18px; margin:0 0 22px; background:#131317;">
    <div style="font-size:0.78rem; letter-spacing:0.04em; text-transform:uppercase; color:#82828c; margin-bottom:8px;">Best e1RMs this week</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${prCells}</table>
    <div style="margin-top:12px; padding-top:12px; border-top:1px solid #25252c; display:flex; justify-content:space-between;">
      <span style="color:#b8b8c0;">Competition-equivalent total</span>
      <span style="font-family:'Space Grotesk',monospace; font-weight:700; color:#ff2d3f;">${kg(r.total)}</span>
    </div>
  </div>
  ${bwLine}
  <div style="margin: 0 0 28px;">
    <a href="https://powalifta.com/athlete.html" style="display:inline-block; background:#ff2d3f; color:#fff; text-decoration:none; padding:12px 22px; border-radius:10px; font-weight:700; letter-spacing:0.02em;">Open my dashboard</a>
  </div>
  <p style="color: #82828c; font-size: 0.8rem; line-height: 1.6; margin-top: 32px; padding-top: 22px; border-top: 1px solid #25252c;">
    You're getting this because weekly progress emails are on for your account.
    <a href="${htmlEscape(unsubUrl)}" style="color:#82828c; text-decoration:underline;">Unsubscribe</a> or manage email preferences in Settings.<br>— POWALIFTA
  </p>
</div></body></html>`;

  return { subject, html, text };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return jsonResponse(200, { ok: true });
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  // --- Shared-secret gate (Verify JWT is OFF for cron). Fail closed. ---
  if (!CRON_SECRET) {
    console.error('CRON_SECRET not set — refusing to run');
    return jsonResponse(500, { error: 'Server not configured' });
  }
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const headerSecret = req.headers.get('x-cron-secret') || auth;
  if (headerSecret !== CRON_SECRET) return jsonResponse(401, { error: 'Unauthorized' });

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse(500, { error: 'Server not configured' });
  }
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.error('RESEND_API_KEY not set');
    return jsonResponse(500, { error: 'Email service not configured' });
  }

  // Optional dry-run: POST { "dryRun": true } returns the audience + computed
  // recaps WITHOUT sending anything (useful to sanity-check before scheduling).
  let dryRun = false;
  try { const b = await req.json(); dryRun = !!(b && b.dryRun); } catch { /* empty body ok */ }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = Date.now();
  const cutoff90 = new Date(now - 90 * DAY_MS).toISOString().slice(0, 10);

  // 1) Opted-in preferences (weekly_digest = true), with unsub token.
  const { data: prefs, error: prefErr } = await admin
    .from('email_preferences')
    .select('user_id, unsub_token')
    .eq('weekly_digest', true)
    .limit(MAX_PREFS);
  if (prefErr) { console.error('prefs read', prefErr); return jsonResponse(500, { error: 'Preferences read failed' }); }
  if (!prefs || !prefs.length) return jsonResponse(200, { sent: 0, note: 'No opted-in athletes' });

  const ids = prefs.map(p => p.user_id);
  const tokenById: Record<string, string | null> = {};
  prefs.forEach(p => { tokenById[p.user_id] = p.unsub_token || null; });

  // 2) Their profiles — athletes with a real email only.
  const { data: profs, error: profErr } = await admin
    .from('profiles')
    .select('id, name, email, user_type')
    .in('id', ids);
  if (profErr) { console.error('profiles read', profErr); return jsonResponse(500, { error: 'Profiles read failed' }); }
  const recipients = (profs || []).filter(p => p.user_type === 'athlete' && p.email && String(p.email).includes('@'));
  if (!recipients.length) return jsonResponse(200, { sent: 0, note: 'No athlete recipients' });
  const recipIds = recipients.map(p => p.id);

  // 3) One bounded pull of the last 90d of logs + bodyweight for those athletes;
  //    grouped in memory (no per-athlete round-trips).
  const { data: logs, error: logErr } = await admin
    .from('workout_logs')
    .select('athlete_id, lift, weight, reps, e1rm_comp, date')
    .in('athlete_id', recipIds)
    .gte('date', cutoff90)
    .limit(MAX_LOGS);
  if (logErr) { console.error('logs read', logErr); return jsonResponse(500, { error: 'Logs read failed' }); }
  const { data: bws } = await admin
    .from('bodyweight')
    .select('athlete_id, date, weight')
    .in('athlete_id', recipIds)
    .gte('date', cutoff90)
    .limit(MAX_BW);

  const logsBy: Record<string, LogRow[]> = {};
  (logs || []).forEach(l => { (logsBy[l.athlete_id] ||= []).push(l as LogRow); });
  const bwBy: Record<string, BwRow[]> = {};
  (bws || []).forEach(b => { (bwBy[b.athlete_id] ||= []).push(b as BwRow); });

  // 4) Build + send. Skip athletes with zero sessions in the last 7 days —
  //    a "you did nothing" email is worse than no email.
  let sent = 0, skipped = 0, failed = 0;
  const preview: any[] = [];
  for (const p of recipients) {
    const recap = buildRecap(logsBy[p.id] || [], bwBy[p.id] || [], now);
    if (recap.sessions === 0) { skipped++; continue; }

    if (dryRun) { preview.push({ email: p.email, sessions: recap.sessions, sets: recap.sets, tonnage: round1(recap.tonnage), total: round1(recap.total) }); sent++; continue; }

    const { subject, html, text } = buildEmail({ name: p.name || '', recap, unsubToken: tokenById[p.id] });
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [p.email], subject, html, text })
      });
      if (res.ok) sent++; else { failed++; console.error('Resend', p.email, res.status, await res.text()); }
    } catch (e) {
      failed++;
      console.error('digest send crashed', p.email, String((e as any)?.message || e));
    }
  }

  return jsonResponse(200, { dryRun, sent, skipped, failed, audience: recipients.length, preview: dryRun ? preview : undefined });
});
