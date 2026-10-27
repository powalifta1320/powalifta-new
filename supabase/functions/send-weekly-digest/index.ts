// Supabase Edge Function: send-weekly-digest
//
// Scheduled (cron) batch job — NOT called from the browser. Three jobs, one function:
//   digest        Mondays    every opted-in athlete's recap of their last 7 days (below, unchanged)
//   coach-report  Mondays    every coach with a lifter: last week's report as a push and an email
//   midweek       Thursdays  every coach with a lifter behind by Wednesday: one push
// The cron runs it at 14:00 UTC on Mondays and Thursdays with an empty body; the UTC weekday picks
// the jobs (_shared/coach-report.js jobPlan). Each job runs in its own try/catch: one failing never
// stops another. What the coach report says (the week, the push, the email) is coach-report.js, the
// same core the app's "Last week" uses; coach-jobs.ts groups the rows; _shared/push-deliver.ts sends.
//
// LIFTER DIGEST: emails every opted-in athlete a recap of their last 7 days of training: sessions,
// sets, tonnage, best e1RMs, current competition-equivalent total, and a
// bodyweight trend. One row per athlete in `email_preferences` gates it
// (`weekly_digest = true`; a MISSING row also counts as opted-in, but the
// backfill in migration-email-preferences.sql pre-seeds everyone so the
// unsub_token is ready). Every email carries a one-click unsubscribe link.
//
// COACH REPORT (Mondays): for every coach with at least one lifter, last Monday–Sunday: who trained,
// who needs them (pain reported, behind, form checks waiting, check-ins missing), PRs, meets in the
// next 4 weeks, payments overdue. A team with nothing at all (nobody trained, nothing waiting) gets
// nothing. The push (category alerts, so push_alerts mutes it) opens /coach.html?report=week; the email
// goes unless weekly_digest is explicitly false (no row = opted in). A coach with no preferences row
// gets one made at send time (defaults only: weekly email on, product emails off, pushes on) so the
// email's one-click unsubscribe has a token; the link carries r=coach so the page says "Monday report".
// MIDWEEK (Thursdays): Monday to Wednesday count as gone; a lifter on N sessions should have
// floor(N × 3/7) done. One push per coach naming who's behind (alerts again); no email.
// Reads are paged (PostgREST returns at most 1000 rows a read) in chunks of 200 ids, logs are summed
// in the database (public.coach_week_stats, sql/migration-coach-alerts-2026-10-28.sql), programs are
// read lean (planned sessions kept, the JSON dropped). At a few thousand lifters, move the planned
// sessions into SQL and the emails to Resend's batch endpoint.
//
// AUTH MODEL: "Verify JWT" is OFF (a cron scheduler has no user session),
// so the function gates itself on a shared secret. The caller MUST send
// `Authorization: Bearer <CRON_SECRET>` (or `x-cron-secret: <CRON_SECRET>`).
// Without a configured CRON_SECRET the function refuses to run — it can
// never be left publicly invokable by accident. Only then is the body read:
// POST { job?: 'digest' | 'coach-report' | 'midweek', dryRun?: true, today?: 'YYYY-MM-DD' }.
// dryRun returns what would go out (subjects, texts, pushes; coaches' emails masked) and sends,
// writes and mints nothing.
//
// Deploy:  ./deploy.sh  (encodes --no-verify-jwt for this function), OR
//          paste into a Supabase Edge Function named "send-weekly-digest"
//          and toggle Verify JWT OFF. It imports ../_shared (coach-report.js, push-deliver.ts,
//          push-rules.ts) and ./coach-jobs.ts: deploy from the repo, not by pasting.
// Secrets: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//          CRON_SECRET (any long random string), and optionally
//          UNSUB_BASE (defaults to https://powalifta.com/unsubscribe.html?token=).
//          The coach pushes use send-push's VAPID_* and APNS_* secrets (no new secret).
// Schedule (Supabase → Database → Cron, or pg_cron): sql/cron-weekly-digest.sql, then
//          sql/cron-coach-alerts-2026-10-28.sql moves it to '0 14 * * 1,4' (Mondays and Thursdays).
//
// Needs sql/migration-coach-alerts-2026-10-28.sql for the coach jobs (they say so if it's missing;
// the lifters' digest doesn't need it).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import '../_shared/coach-report.js';
import { deliver } from '../_shared/push-deliver.ts';
import { chunk, indexByAthlete, leanPrograms, maskEmail, pick, rosterByCoach, unsubLink } from './coach-jobs.ts';

// deno-lint-ignore no-explicit-any
const CR = (globalThis as any).CoachReport;
const APP_URL = 'https://www.powalifta.com/coach.html';

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

// Constant-time secret compare with no length side-channel (same helper the LS
// webhooks use). Both inputs are HMAC'd under a single-use random key, so only
// fixed-length digests are compared — neither length nor content leaks via timing.
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const randKey = await crypto.subtle.importKey(
    'raw', crypto.getRandomValues(new Uint8Array(32)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const da = new Uint8Array(await crypto.subtle.sign('HMAC', randKey, enc.encode(a)));
  const db = new Uint8Array(await crypto.subtle.sign('HMAC', randKey, enc.encode(b)));
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
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

// ---------------------------------------------------------------- the lifters' digest (unchanged)
// deno-lint-ignore no-explicit-any
async function runLifterDigest(admin: any, apiKey: string, dryRun: boolean): Promise<Record<string, unknown>> {
  const now = Date.now();
  const cutoff90 = new Date(now - 90 * DAY_MS).toISOString().slice(0, 10);

  // 1) Opted-in preferences (weekly_digest = true), with unsub token.
  const { data: prefs, error: prefErr } = await admin
    .from('email_preferences')
    .select('user_id, unsub_token')
    .eq('weekly_digest', true)
    .limit(MAX_PREFS);
  if (prefErr) { console.error('prefs read', prefErr); return { error: 'Preferences read failed' }; }
  if (!prefs || !prefs.length) return { sent: 0, note: 'No opted-in athletes' };

  const ids = prefs.map(p => p.user_id);
  const tokenById: Record<string, string | null> = {};
  prefs.forEach(p => { tokenById[p.user_id] = p.unsub_token || null; });

  // 2) Their profiles — athletes with a real email only.
  const { data: profs, error: profErr } = await admin
    .from('profiles')
    .select('id, name, email, user_type')
    .in('id', ids);
  if (profErr) { console.error('profiles read', profErr); return { error: 'Profiles read failed' }; }
  const recipients = (profs || []).filter(p => p.user_type === 'athlete' && p.email && String(p.email).includes('@'));
  if (!recipients.length) return { sent: 0, note: 'No athlete recipients' };
  const recipIds = recipients.map(p => p.id);

  // 3) One bounded pull of the last 90d of logs + bodyweight for those athletes;
  //    grouped in memory (no per-athlete round-trips).
  const { data: logs, error: logErr } = await admin
    .from('workout_logs')
    .select('athlete_id, lift, weight, reps, e1rm_comp, date')
    .in('athlete_id', recipIds)
    .gte('date', cutoff90)
    .limit(MAX_LOGS);
  if (logErr) { console.error('logs read', logErr); return { error: 'Logs read failed' }; }
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

  return { dryRun, sent, skipped, failed, audience: recipients.length, preview: dryRun ? preview : undefined };
}

// ---------------------------------------------------------------- the coaches' jobs
type Row = Record<string, unknown>;
const PAGE = 1000;        // PostgREST's most rows a read
const IDS = 200;          // ids per .in() read
const MAX_ROWS = 100000;  // a runaway guard per read
const SEND_GAP_MS = 550;  // Resend's default is 2 emails a second
const DEADLINE_MS = 120000;
function errMsg(e: unknown): string { return String((e as { message?: string })?.message || e).slice(0, 300); }
function isMissing(e: unknown): boolean { return /does not exist|could not find|schema cache|PGRST20[0-9]|42P01|42703/i.test(errMsg(e) + ' ' + String((e as { code?: string })?.code || '')); }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Every page of a read (ordered, so pages don't overlap).
// deno-lint-ignore no-explicit-any
async function readAll(build: (from: number, to: number) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
async function byIds(ids: string[], read: (c: string[]) => Promise<Row[]>): Promise<Row[]> {
  const out: Row[] = [];
  for (const c of chunk(ids, IDS)) out.push(...await read(c));
  return out;
}
// A table an older project may not have yet (pain_reports, client_billing, schedule_requests…): the
// report goes out without that part rather than not at all.
async function optional(name: string, fn: () => Promise<Row[]>): Promise<Row[]> {
  try { return await fn(); } catch (e) { console.warn('coach jobs: ' + name + ' left out: ' + errMsg(e)); return []; }
}
function indexBy(rows: Row[], key: string): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) { const k = String(r[key] || ''); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return m;
}

// The coaches, their lifters, programs (lean) and the week's stats: what both coach jobs need.
// deno-lint-ignore no-explicit-any
async function loadTeams(admin: any, from: string, to: string) {
  const profiles = await readAll((f, t) => admin.from('profiles').select('id, name, coach_id').not('coach_id', 'is', null).order('id').range(f, t));
  const roster = rosterByCoach(profiles);
  const coachIds = [...roster.keys()];
  const athleteIds = [...roster.values()].flat().map((a) => a.id);
  let coaches: Row[];
  try { coaches = await byIds(coachIds, (c) => readAll((f, t) => admin.from('profiles').select('id, name, email, unit').in('id', c).order('id').range(f, t))); }
  catch (e) {
    if (!isMissing(e)) throw e;   // profiles.unit arrives with migration-program-integrity-2026-10-22.sql
    coaches = await byIds(coachIds, (c) => readAll((f, t) => admin.from('profiles').select('id, name, email').in('id', c).order('id').range(f, t)));
  }
  const prefs = await optional('email_preferences', async () => {
    try { return await byIds(coachIds, (c) => readAll((f, t) => admin.from('email_preferences').select('user_id, weekly_digest, unsub_token, push_alerts').in('user_id', c).order('user_id').range(f, t))); }
    catch (e) {
      if (!isMissing(e)) throw e;
      return await byIds(coachIds, (c) => readAll((f, t) => admin.from('email_preferences').select('user_id, weekly_digest, unsub_token').in('user_id', c).order('user_id').range(f, t)));
    }
  });
  const programs = await byIds(athleteIds, async (c) => leanPrograms(await readAll((f, t) => admin.from('programs').select('id, athlete_id, coach_id, weeks, updated_at').in('athlete_id', c).order('id').range(f, t))));
  const stats = await byIds(athleteIds, async (c) => {
    const { data, error } = await admin.rpc('coach_week_stats', { p_athletes: c, p_from: from, p_to: to });
    if (error) throw new Error('coach_week_stats failed (run sql/migration-coach-alerts-2026-10-28.sql): ' + errMsg(error));
    return (data || []) as Row[];
  });
  const busy = await optional('schedule_requests', () => byIds(athleteIds, (c) => readAll((f, t) => admin.from('schedule_requests').select('*').in('athlete_id', c).order('id').range(f, t))));
  return {
    roster, coachIds, athleteIds,
    coachBy: new Map(coaches.map((c) => [String(c.id), c])),
    prefBy: new Map(prefs.map((p) => [String(p.user_id), p])),
    programs: indexByAthlete(programs as Row[]), stats: indexByAthlete(stats), busy: indexByAthlete(busy),
  };
}

// A coach without a preferences row gets one now (defaults only; product emails stay off) so the
// email's one-click unsubscribe has a token to carry. null when it can't be made.
// deno-lint-ignore no-explicit-any
async function tokenFor(admin: any, coachId: string, pref: Row | undefined): Promise<string | null> {
  if (pref && pref.unsub_token) return String(pref.unsub_token);
  try {
    const { error } = await admin.from('email_preferences').upsert({ user_id: coachId, product_emails: false }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) { console.warn('coach-report: no preferences row for', coachId, errMsg(error)); return null; }
    const { data } = await admin.from('email_preferences').select('unsub_token').eq('user_id', coachId).limit(1).maybeSingle();
    return data && data.unsub_token ? String(data.unsub_token) : null;
  } catch (e) { console.warn('coach-report: token for', coachId, errMsg(e)); return null; }
}
async function sendEmail(apiKey: string, msg: Record<string, unknown>): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(RESEND_ENDPOINT, { method: 'POST', headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(msg) });
    if (res.ok) return true;
    if (res.status === 429 && attempt === 0) { await sleep(Math.min(5, Number(res.headers.get('retry-after')) || 1) * 1000); continue; }
    console.error('coach-report: Resend', res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return false;
}

// Mondays: last week's report to every coach with a lifter.
// deno-lint-ignore no-explicit-any
async function runCoachReport(admin: any, apiKey: string, today: string, dryRun: boolean): Promise<Record<string, unknown>> {
  const started = Date.now();
  const W = CR.lastWeek(today);
  const T = await loadTeams(admin, W.from, W.to);
  const ids = T.athleteIds;
  const ciFrom = CR.addDays(W.from, -28);
  const pains = await optional('pain_reports', () => byIds(ids, (c) => readAll((f, t) => admin.from('pain_reports').select('id, athlete_id, day, resolved_at').in('athlete_id', c).gte('day', W.from).lte('day', W.to).order('id').range(f, t))));
  const checkins = await optional('checkins', () => byIds(ids, (c) => readAll((f, t) => admin.from('checkins').select('id, athlete_id, created_at, week_start').in('athlete_id', c).gte('created_at', ciFrom).order('id').range(f, t))));
  const answers = await optional('checkin_answers', () => byIds(ids, (c) => readAll((f, t) => admin.from('checkin_answers').select('id, athlete_id, period').in('athlete_id', c).gte('period', ciFrom).lte('period', W.to).order('id').range(f, t))));
  const meets = await optional('meets', () => byIds(ids, (c) => readAll((f, t) => admin.from('meets').select('id, athlete_id, name, meet_date').in('athlete_id', c).gte('meet_date', today).lte('meet_date', CR.addDays(today, 28)).order('id').range(f, t))));
  const formChecks = await optional('form_checks', () => byIds(T.coachIds, (c) => readAll((f, t) => admin.from('form_checks').select('id, athlete_id, coach_id, coach_reply').in('coach_id', c).is('coach_reply', null).order('id').range(f, t))));
  const billing = await optional('client_billing', () => byIds(T.coachIds, (c) => readAll((f, t) => admin.from('client_billing').select('id, athlete_id, coach_id, amount_cents, currency, next_due, status').in('coach_id', c).eq('status', 'active').lt('next_due', today).order('id').range(f, t))));
  const painBy = indexByAthlete(pains), ciBy = indexByAthlete(checkins), ansBy = indexByAthlete(answers), meetBy = indexByAthlete(meets);
  const fcBy = indexBy(formChecks, 'coach_id'), billBy = indexBy(billing, 'coach_id');

  const out = { coaches: T.coachIds.length, emails: 0, pushes: 0, quiet: 0, emailOff: 0, failed: 0, left: 0, preview: [] as Row[] };
  for (const coachId of T.coachIds) {
    if (!dryRun && Date.now() - started > DEADLINE_MS) { out.left = T.coachIds.length - T.coachIds.indexOf(coachId); console.error('coach-report: out of time, ' + out.left + ' coaches left'); break; }
    try {
      const lifters = T.roster.get(coachId) || [];
      const lid = lifters.map((a) => a.id);
      const team = CR.teamWeek(CR.fromRows({
        athletes: lifters, programs: pick(T.programs, lid), stats: pick(T.stats, lid), busy: pick(T.busy, lid),
        pains: pick(painBy, lid), checkins: pick(ciBy, lid), checkinAnswers: pick(ansBy, lid), meets: pick(meetBy, lid),
        formChecks: fcBy.get(coachId) || [], billing: billBy.get(coachId) || [],
      }, { coachId, today }), W);
      if (!CR.worthSending(team)) { out.quiet++; continue; }
      const coach: Row = T.coachBy.get(coachId) || {};
      const pref = T.prefBy.get(coachId);
      const push = CR.reportPush(team);
      const email = String(coach.email || '');
      const emailOn = !(pref && pref.weekly_digest === false) && email.includes('@') && !!apiKey;
      const unit = coach.unit === 'lb' || coach.unit === 'lbs' ? 'lbs' : 'kg';
      if (dryRun) {
        const m = CR.reportEmail(team, { coachName: coach.name, unsubUrl: emailOn ? unsubLink(UNSUB_BASE, 'token-made-at-send') : '', appUrl: APP_URL, unit });
        out.preview.push({ coach: coachId, to: emailOn ? maskEmail(email) : null, subject: m.subject, text: m.text, push, pushMuted: !!(pref && pref.push_alerts === false) });
        continue;
      }
      const r = await deliver(admin, coachId, { title: push.title, body: push.body, url: '/coach.html?report=week', tag: 'powa-report' }, 'alerts', { pref: pref || null });
      if (r.sent) out.pushes++;
      if (!emailOn) { out.emailOff++; continue; }
      const token = await tokenFor(admin, coachId, pref);
      const unsub = unsubLink(UNSUB_BASE, token);
      const m = CR.reportEmail(team, { coachName: coach.name, unsubUrl: unsub, appUrl: APP_URL, unit });
      const msg: Record<string, unknown> = { from: FROM, to: [email], subject: m.subject, html: m.html, text: m.text };
      if (unsub) msg.headers = { 'List-Unsubscribe': '<' + unsub + '>' };
      if (await sendEmail(apiKey, msg)) out.emails++; else out.failed++;
      await sleep(SEND_GAP_MS);
    } catch (e) {
      out.failed++;
      console.error('coach-report failed for', coachId, errMsg(e));
    }
  }
  return dryRun ? out : { ...out, preview: undefined };
}

// Thursdays: who's behind by Wednesday, one push per coach.
// deno-lint-ignore no-explicit-any
async function runMidweek(admin: any, today: string, dryRun: boolean): Promise<Record<string, unknown>> {
  const W = CR.weekSoFar(today);
  const T = await loadTeams(admin, W.from, W.to);
  const out = { coaches: T.coachIds.length, pushes: 0, nobody: 0, failed: 0, preview: [] as Row[] };
  for (const coachId of T.coachIds) {
    try {
      const lifters = T.roster.get(coachId) || [];
      const lid = lifters.map((a) => a.id);
      const list = CR.midweekBehind(CR.fromRows({ athletes: lifters, programs: pick(T.programs, lid), stats: pick(T.stats, lid), busy: pick(T.busy, lid) }, { coachId, today }), today);
      const push = CR.midweekPush(list);
      if (!push) { out.nobody++; continue; }
      const pref = T.prefBy.get(coachId);
      if (dryRun) { out.preview.push({ coach: coachId, push, behind: list.length, pushMuted: !!(pref && pref.push_alerts === false) }); continue; }
      const r = await deliver(admin, coachId, { title: push.title, body: push.body, url: '/coach.html', tag: 'powa-midweek' }, 'alerts', { pref: pref || null });
      if (r.sent) out.pushes++;
    } catch (e) {
      out.failed++;
      console.error('midweek failed for', coachId, errMsg(e));
    }
  }
  return dryRun ? out : { ...out, preview: undefined };
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
  if (!headerSecret || !(await timingSafeEqual(headerSecret, CRON_SECRET))) {
    return jsonResponse(401, { error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse(500, { error: 'Server not configured' });
  }
  const apiKey = Deno.env.get('RESEND_API_KEY') || '';
  if (!apiKey) console.error('RESEND_API_KEY not set: no emails, pushes still go');

  // Only now, behind the secret: { job, dryRun, today } (the cron sends {}: the weekday decides).
  let body: unknown = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const plan = CR.jobPlan(body, new Date().toISOString());
  if (plan.error) return jsonResponse(400, { error: plan.error });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const result: Record<string, unknown> = { today: plan.today, dryRun: plan.dryRun, jobs: plan.jobs };
  for (const job of plan.jobs) {
    try {
      if (job === 'digest') result.digest = apiKey ? await runLifterDigest(admin, apiKey, plan.dryRun) : { error: 'Email service not configured' };
      else if (job === 'coach-report') result['coach-report'] = await runCoachReport(admin, apiKey, plan.today, plan.dryRun);
      else if (job === 'midweek') result.midweek = await runMidweek(admin, plan.today, plan.dryRun);
    } catch (e) {
      console.error(job + ' failed:', errMsg(e));
      result[job] = { error: errMsg(e) };
    }
  }
  return jsonResponse(200, result);
});
