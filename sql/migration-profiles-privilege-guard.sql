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
-- gone. profiles also has a real is_admin boolean column (confirmed: db.js
-- select('*'), app.js maps profile.is_admin -> isAdmin, admin.html gates on it),
-- so a self-set is_admin = true escalates straight to admin too.
--
-- This BEFORE UPDATE trigger freezes all three privileged columns
-- (subscription_tier, user_type, is_admin) for ordinary callers.
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
  -- is_admin is a REAL boolean column on profiles (db.js selects it, app.js maps
  -- profile.is_admin -> isAdmin, admin.html gates on it). Without this freeze a
  -- normal caller could `update({ is_admin: true })` their own row and self-
  -- promote to admin via the public anon key. Pin it.
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'is_admin is not user-editable' USING ERRCODE = '42501';
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
-- OPTIONAL — Lemon Squeezy linkage columns (ls_customer_id / ls_subscription_id):
-- if your profiles table has them and you want them frozen against client
-- tampering too, add the same IS DISTINCT FROM guard for each to the list above.
--
-- Verification after running (must be run as a NORMAL signed-in user — NOT in the
-- SQL Editor, where auth.uid() is NULL and the service-role exemption applies, so
-- the writes would succeed regardless). Easiest path: open the app as a non-admin
-- account and run in the browser console, e.g.
--   await sb.from('profiles').update({ is_admin: true }).eq('id', sb.auth.getUser ? (await sb.auth.getUser()).data.user.id : null)
-- These must now be REJECTED with code 42501:
--   UPDATE public.profiles SET subscription_tier = 'premium' WHERE id = auth.uid();
--   UPDATE public.profiles SET user_type = 'coach'         WHERE id = auth.uid();
--   UPDATE public.profiles SET is_admin = true             WHERE id = auth.uid();
-- A normal settings edit must still SUCCEED:
--   UPDATE public.profiles SET name = 'New Name' WHERE id = auth.uid();
-- ============================================================
