-- ============================================================
-- POWALIFTA — LIVE RLS VERIFICATION (read-only, changes nothing)
--
-- The 2026-07-13 security audit found that several core policies (profiles
-- SELECT/INSERT, is_admin(), and whether the hardening passes actually landed)
-- live ONLY in the Supabase dashboard and cannot be proven from git. This script
-- ANSWERS those unknowns against the real database.
--
-- HOW TO RUN: paste the whole thing into the Supabase SQL Editor and run. It only
-- SELECTs from catalogs — no writes. Read each section's PASS/CHECK notes.
-- ============================================================

-- ── 1. Which tables have RLS ENABLED? ───────────────────────────────────────
-- Every table holding user data MUST show rls_enabled = true. Any 'false' on a
-- data table (profiles, workout_logs, bodyweight, goals, programs, invites,
-- messages, form_checks, meets, program_sales, ...) = world-readable/writable
-- with the public anon key. THAT is a breach.
SELECT c.relname AS table_name,
       c.relrowsecurity  AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;   -- false (danger) sorts to the top

-- ── 2. Does any table have RLS ON but ZERO policies? ────────────────────────
-- RLS-on + no-policy = fully locked (only service role). That's SAFE for
-- ai_chat_usage / client_errors / edge_rate_limits. It is a BUG for anything the
-- app reads/writes with the anon key (users would get empty results).
SELECT c.relname AS table_name,
       count(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
GROUP BY c.relname
HAVING count(p.polname) = 0
ORDER BY c.relname;

-- ── 3. THE BIG ONE: every SELECT policy on profiles + any anon-readable table ─
-- Look at `profiles` SELECT rows. If `qual` is `true` (or the roles include
-- `anon`/`public` with a permissive qual), then email / coach_id /
-- subscription_tier / ls_customer_id / is_admin of EVERY user are readable with
-- the public key. It SHOULD be scoped (id = auth.uid(), or a coach-directory view
-- exposing only public columns). Read profiles' USING clause carefully.
SELECT p.polname AS policy,
       c.relname AS table_name,
       CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                     WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS command,
       pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr,
       ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)) AS roles
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles','workout_logs','bodyweight','goals','programs','invites')
ORDER BY c.relname, command;

-- ── 4. is_admin(): must be SECURITY DEFINER + search_path=public ─────────────
-- Every admin gate + guard trigger trusts is_admin(). If prosecdef=false it's
-- subject to profiles RLS (may misfire); if proconfig lacks search_path it's
-- shadowable. Both must be right.
SELECT p.proname,
       p.prosecdef                         AS security_definer,
       p.proconfig                         AS config_settings,   -- must contain search_path=public
       pg_get_functiondef(p.oid)           AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'is_admin';

-- ── 5. Did the hardening triggers actually land? ────────────────────────────
-- These triggers are created by migration-rls-hardening*.sql. If a base table
-- was created AFTER a hardening pass ran, the DO-blocks SILENTLY SKIPPED and the
-- guard is MISSING → the original hole is live. Each of these SHOULD appear.
SELECT c.relname AS table_name, t.tgname AS trigger_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND t.tgname IN (
    'trg_guard_profile_privileged_cols',
    'trg_enforce_athlete_limit',
    'mp_prevent_self_publish_trig'
  )
ORDER BY c.relname, t.tgname;

-- ── 6. All SECURITY DEFINER functions: confirm search_path is pinned ────────
-- Any DEFINER function whose config_settings does NOT list search_path=public is
-- shadowable. Expect claim_invite, accept_coach_request, enforce_athlete_limit,
-- guard_*, populate_referral, claim_referral_reward, rl_bump, is_admin, etc.
SELECT p.proname,
       p.prosecdef AS security_definer,
       p.proconfig AS config_settings
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
ORDER BY (p.proconfig IS NULL) DESC, p.proname;   -- unpinned (NULL) sorts to top

-- ============================================================
-- WHAT TO DO WITH THE OUTPUT:
--   §1 any data table rls_enabled=false  → run migration-rls-hardening-4.sql +
--       write the missing CREATE POLICY (this is a live breach until fixed).
--   §3 profiles SELECT using_expr = true → private columns are public. Scope it.
--   §4 is_admin not SECURITY DEFINER / no search_path → fix immediately.
--   §5 a missing trigger → re-run the hardening migration that creates it.
--   §6 any DEFINER fn with NULL config → add SET search_path = public.
-- Paste the output back and I'll tell you exactly what (if anything) to change.
-- ============================================================
