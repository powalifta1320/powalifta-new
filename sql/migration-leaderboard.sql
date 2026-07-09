-- ============================================================
-- POWALIFTA — opt-in public DOTS leaderboard
--
-- WHAT: a self-served, opt-in leaderboard. A lifter who wants to be ranked
-- publishes ONE denormalised row here with the numbers they choose to share
-- (display name, sex, bodyweight, competition-equivalent total, DOTS, country).
-- Anyone — signed in or not — can read the board and see where they stack up.
--
-- WHY a dedicated table (not a flag on profiles + a public profiles read):
-- exposing `profiles` to anon would leak email / coach_id / subscription columns.
-- Same lesson as program_reviews (denormalised buyer_name/coach_id so anon never
-- touches profiles). Here the row carries ONLY publishable fields, and its very
-- EXISTENCE is the opt-in: writing your row joins the board, deleting it leaves.
-- No boolean flag to keep in sync, no private column ever within anon's reach.
--
-- The numbers are computed client-side from data the lifter already owns (best
-- competition-equivalent e1RMs → total, latest weigh-in → bodyweight, the same
-- dotsScore() the Strength-score card shows). The owner re-publishes to refresh.
--
-- Run once in Supabase SQL Editor, AFTER migration-profiles-rls.sql. Idempotent
-- (IF NOT EXISTS / DROP POLICY IF EXISTS). Additive + safe.
-- ============================================================

-- ---------- 1. table ----------
CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  user_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  sex           text CHECK (sex IN ('male', 'female')),
  bodyweight_kg numeric,
  total_kg      numeric NOT NULL CHECK (total_kg > 0),
  dots          numeric NOT NULL CHECK (dots >= 0),
  basis         text NOT NULL DEFAULT 'gym' CHECK (basis IN ('gym', 'meet')),
  country_code  text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Board is read ordered by DOTS; index the sort key.
CREATE INDEX IF NOT EXISTS leaderboard_dots_idx
  ON public.leaderboard_entries (dots DESC);

-- ---------- 2. RLS ----------
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- PUBLIC read: every row here exists only because its owner opted in (publishing
-- the row IS the opt-in; deleting it is the opt-out), and every column is one the
-- owner chose to share. So anon + authenticated may read all rows. profiles is
-- never exposed — anon reads this denormalised projection instead.
DROP POLICY IF EXISTS "leaderboard_public_read" ON public.leaderboard_entries;
CREATE POLICY "leaderboard_public_read" ON public.leaderboard_entries
  FOR SELECT TO anon, authenticated
  USING (true);

-- Owner-only writes: a caller may insert / update / delete ONLY their own row.
-- (user_id is the PK and must equal auth.uid(), so nobody can publish as someone
-- else or scrub a rival off the board.)
DROP POLICY IF EXISTS "leaderboard_insert_own" ON public.leaderboard_entries;
CREATE POLICY "leaderboard_insert_own" ON public.leaderboard_entries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "leaderboard_update_own" ON public.leaderboard_entries;
CREATE POLICY "leaderboard_update_own" ON public.leaderboard_entries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "leaderboard_delete_own" ON public.leaderboard_entries;
CREATE POLICY "leaderboard_delete_own" ON public.leaderboard_entries
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- Verification (SQL Editor):
--   -- publish yourself (replace the numbers):
--   INSERT INTO public.leaderboard_entries
--     (user_id, display_name, sex, bodyweight_kg, total_kg, dots, basis)
--     VALUES (auth.uid(), 'Test Lifter', 'male', 83, 600, 405.2, 'gym')
--     ON CONFLICT (user_id) DO UPDATE
--       SET total_kg = EXCLUDED.total_kg, dots = EXCLUDED.dots, updated_at = now();
--   -- read the board (works signed-out too):
--   SELECT display_name, sex, dots, total_kg FROM public.leaderboard_entries
--     ORDER BY dots DESC;
--   -- leave the board:
--   DELETE FROM public.leaderboard_entries WHERE user_id = auth.uid();
-- ============================================================
