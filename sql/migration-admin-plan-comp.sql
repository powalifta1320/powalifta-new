-- ============================================================
-- POWALIFTA — admin plan comp + athlete-limit race fix
--
-- Two profiles fixes surfaced by the 2026-07-12 security audit:
--
-- 1. ADMIN PLAN CHANGE WAS SILENTLY BROKEN. admin.html does a client
--    `sb.from('profiles').update({subscription_tier}).in('id',[coachId])`.
--    The privilege-guard trigger already EXEMPTS is_admin() — but there was
--    no RLS UPDATE policy admitting an admin to another user's row, so
--    PostgREST filtered the row out and returned 0 rows with NO error. The
--    admin saw a success toast while the DB never changed (reverted on reload).
--    Fix: an is_admin()-scoped UPDATE policy. The existing guard trigger still
--    RAISEs for normal users, so this cannot become a self-escalation path.
--    (This is what lets the owner comp coaches onto Free/any tier for now.)
--
-- 2. ATHLETE-LIMIT OVERSHOOT RACE. enforce_athlete_limit() does count-then-check
--    with no lock on the coach, so two athletes claiming invites for the same
--    at-limit coach concurrently can both pass and land the coach at limit+1.
--    Fix: a per-coach transaction-scoped advisory lock before the count, so
--    concurrent links to the SAME coach evaluate the cap serially. Legitimate
--    single-link flows are unchanged.
--
-- Idempotent (DROP POLICY IF EXISTS / CREATE OR REPLACE). Run in the Supabase
-- SQL Editor. Depends on: migration-profiles-rls.sql, migration-profiles-
-- privilege-guard.sql, migration-tier-enforcement.sql, and the dashboard-defined
-- is_admin() SECURITY DEFINER helper (already trusted by every other policy).
-- ============================================================

-- ---- 1. Admin may update any profile (comp plans, moderation) --------------
DROP POLICY IF EXISTS "profiles_admin_update" ON public.profiles;
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---- 2. Serialize the athlete-limit check per coach ------------------------
CREATE OR REPLACE FUNCTION public.enforce_athlete_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER            -- must read other profiles regardless of caller's RLS
SET search_path = public
AS $$
DECLARE
  coach_tier text;
  tier_limit int;
  current_count int;
BEGIN
  IF NEW.coach_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.coach_id IS NOT DISTINCT FROM OLD.coach_id THEN
    RETURN NEW;
  END IF;

  -- Serialize all concurrent links to THIS coach so the count-and-check below
  -- can't be run in parallel by two claimants (TOCTOU overshoot). The lock is
  -- transaction-scoped (auto-released on commit/rollback) and keyed on the coach
  -- id, so links to different coaches never contend.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.coach_id::text));

  SELECT subscription_tier INTO coach_tier
  FROM public.profiles
  WHERE id = NEW.coach_id;

  tier_limit := CASE COALESCE(coach_tier, 'free')
    WHEN 'basic'   THEN 10
    WHEN 'pro'     THEN 25
    WHEN 'premium' THEN NULL   -- unlimited
    ELSE 3                     -- free / unknown
  END;

  IF tier_limit IS NOT NULL THEN
    SELECT count(*) INTO current_count
    FROM public.profiles
    WHERE coach_id = NEW.coach_id
      AND id <> NEW.id;

    IF current_count >= tier_limit THEN
      RAISE EXCEPTION 'ATHLETE_LIMIT_REACHED: this coach is at their plan limit (% athletes). Upgrade to add more.', tier_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger definition unchanged (still BEFORE INSERT OR UPDATE OF coach_id); the
-- CREATE OR REPLACE above swaps the body in place. Re-assert grants for safety.
REVOKE ALL ON FUNCTION public.enforce_athlete_limit() FROM public, anon, authenticated;

-- ============================================================
-- Verify:
-- 1. As an admin, change a coach's plan in the admin dashboard, reload → it sticks.
-- 2. As a NON-admin, `update profiles set subscription_tier='premium' where id=auth.uid()`
--    still RAISEs 42501 (privilege guard) — the new policy doesn't weaken that.
-- 3. Two concurrent invite claims for the same at-limit coach → exactly one succeeds.
-- ============================================================
