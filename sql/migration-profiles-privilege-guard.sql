-- ============================================================
-- POWALIFTA — block client-side privilege / tier self-escalation on profiles
--
-- WHY: profiles_self_update (migration-profiles-rls.sql) authorizes UPDATEs by
-- ROW ONLY — USING/WITH CHECK are both just (id = auth.uid()), with no COLUMN
-- restriction. The Supabase anon key is public (it ships in db.js), so any
-- authenticated user can call the REST API directly and rewrite their OWN
-- privileged columns:
--
--   sb.from('profiles')
--     .update({ subscription_tier: 'premium', user_type: 'coach' })
--     .eq('id', auth.uid())
--
-- The enforce_athlete_limit trigger only fires ON coach_id, so a self-promoted
-- 'premium' coach immediately reads as unlimited — the entire paid-tier wall is
-- gone — and if is_admin() resolves from user_type, the admin gate falls too.
--
-- This BEFORE UPDATE trigger freezes the privileged columns for ordinary callers.
-- Exemptions:
--   * service role (auth.uid() IS NULL) — the Lemon Squeezy webhook sets tiers
--   * is_admin() — the admin dashboard may still edit anything
--
-- Run once in Supabase SQL Editor, AFTER migration-profiles-rls.sql.
-- Safe to re-run (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). No data changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_profile_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side / service role (no JWT in context) may change anything.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Admins may change anything (admin dashboard).
  IF is_admin() THEN
    RETURN NEW;
  END IF;
  -- Everyone else: privileged columns are pinned to their existing values.
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'subscription_tier is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF NEW.user_type IS DISTINCT FROM OLD.user_type THEN
    RAISE EXCEPTION 'user_type is not user-editable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_cols ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_cols();

-- Only the trigger should ever call this.
REVOKE ALL ON FUNCTION public.guard_profile_privileged_cols() FROM public, anon, authenticated;

-- ============================================================
-- IF your profiles table has a SEPARATE is_admin boolean column (rather than
-- is_admin() deriving from user_type), add it to the freeze list above:
--   IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
--     RAISE EXCEPTION 'is_admin is not user-editable' USING ERRCODE = '42501';
--   END IF;
-- Same for the Lemon Squeezy linkage columns (ls_customer_id / ls_subscription_id)
-- if you want them frozen against client tampering.
--
-- Verification after running:
--   -- as a normal signed-in user, this must now FAIL with 42501:
--   UPDATE public.profiles SET subscription_tier = 'premium' WHERE id = auth.uid();
--   -- a normal settings edit must still SUCCEED:
--   UPDATE public.profiles SET name = 'New Name' WHERE id = auth.uid();
-- ============================================================
