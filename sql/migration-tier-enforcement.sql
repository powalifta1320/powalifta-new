-- ============================================================
-- POWALIFTA — server-side athlete-limit enforcement
--
-- WHY: the 3/10/25-athlete tier limits are currently checked only
-- in client JS (app.js TIER_LIMITS / canAddAthlete). Anyone who
-- opens devtools can bypass them. This trigger makes the database
-- itself refuse to attach an athlete to a coach who is at their
-- tier limit — regardless of what the client does.
--
-- Limits mirror app.js exactly: free=3, basic=10, pro=25, premium=unlimited.
--
-- Run once in Supabase SQL Editor. Safe to re-run (CREATE OR REPLACE
-- + DROP TRIGGER IF EXISTS). No data changes, no schema changes —
-- existing rows are untouched; only NEW coach-athlete links are checked.
-- ============================================================

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
  -- Only act when an athlete is being linked to a coach
  -- (INSERT with coach_id set, or coach_id changing on UPDATE).
  IF NEW.coach_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.coach_id IS NOT DISTINCT FROM OLD.coach_id THEN
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS trg_enforce_athlete_limit ON public.profiles;
CREATE TRIGGER trg_enforce_athlete_limit
  BEFORE INSERT OR UPDATE OF coach_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_athlete_limit();

-- Lock the function down: only the trigger should run it.
REVOKE ALL ON FUNCTION public.enforce_athlete_limit() FROM public, anon, authenticated;

-- ============================================================
-- Verification after running:
-- 1. As a free coach with 3 athletes, have a 4th athlete claim an
--    invite → the claim should fail with ATHLETE_LIMIT_REACHED.
-- 2. Existing links are unaffected (trigger only fires on new links).
-- ============================================================
