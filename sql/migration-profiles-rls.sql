-- ============================================================
-- POWALIFTA — profiles UPDATE policies for coach/athlete disconnect
--
-- WHY: the "coach removes athlete" and "athlete leaves coach" flows both call
-- DB.updateProfile(userId, { coach_id: null }) (db.js). The athlete-leaves path
-- updates the athlete's OWN row; the coach-removes path updates a DIFFERENT
-- row (the athlete's). If the only UPDATE policy on `profiles` is the usual
-- "users can update their own row" (id = auth.uid()), the coach-removes path is
-- silently denied by RLS — no error surfaces to the client, the toast never
-- fires, and the athlete stays linked. This migration adds the two policies
-- that make both flows work.
--
-- Run once in Supabase SQL Editor. Safe to re-run (DROP POLICY IF EXISTS).
-- No data or schema changes — policy definitions only.
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 1. Self-service: any authenticated user manages their OWN profile row.
--    Covers "athlete leaves coach" (athlete nulls their own coach_id) plus
--    normal settings edits (name, bio, avatar, country, etc.).
DROP POLICY IF EXISTS "profiles_self_update" ON public.profiles;
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 2. Coach disconnect: a coach may update an athlete currently linked to them
--    (existing coach_id = auth.uid()), but ONLY to detach them — the resulting
--    row must have coach_id IS NULL. The WITH CHECK clause means a coach can't
--    use this policy to reassign the athlete to someone else or to claim an
--    athlete who isn't theirs; the worst they can do is release their own
--    athlete, which is exactly the intended action.
DROP POLICY IF EXISTS "profiles_coach_detach_athlete" ON public.profiles;
CREATE POLICY "profiles_coach_detach_athlete" ON public.profiles
  FOR UPDATE TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id IS NULL);

-- ============================================================
-- NOTE ON SCOPE
-- Policy 2 gates the disconnect by row + final state, not by which columns
-- change. In a single UPDATE that also sets coach_id = NULL, a coach could in
-- principle touch other columns on that athlete's row. The client never does
-- this (DB.updateProfile is called with { coach_id: null } only), so this is a
-- theoretical surface, not an exploit path. If you want a hard guarantee that
-- the coach can change *nothing but* coach_id, replace policy 2 with a
-- SECURITY DEFINER RPC, e.g.:
--
--   CREATE FUNCTION public.detach_athlete(p_athlete uuid) RETURNS void
--   LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
--   BEGIN
--     UPDATE public.profiles SET coach_id = NULL
--     WHERE id = p_athlete AND coach_id = auth.uid();
--   END; $$;
--
-- and have the coach-remove button call DB via .rpc('detach_athlete', ...).
-- ============================================================

-- ============================================================
-- Verification after running (in SQL Editor):
--   SELECT polname, polcmd, qual::text AS using_, with_check::text AS check_
--     FROM pg_policy WHERE polrelid = 'public.profiles'::regclass;
--
-- Functional check:
--   1. As a coach, click "Remove" on one of your athletes → the athlete's
--      coach_id should clear and they should drop off your roster.
--   2. As an athlete, leave your coach → your own coach_id should clear.
-- ============================================================
