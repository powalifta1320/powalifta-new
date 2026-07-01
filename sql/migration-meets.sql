-- ============================================================
-- POWALIFTA — competition meet results + history
--
-- The forward-looking meet-day ATTEMPT PLANNER (openers / seconds / thirds
-- from current e1RMs, warm-up ramps, countdown) already lives inline in
-- athlete.html and needs no storage — it recomputes from logged sets. THIS
-- table stores the OUTCOME: a finished meet and the best good lift the athlete
-- actually hit on the platform, so "history + best total" can render on the
-- Progress tab and a real competition total can anchor DOTS.
--
-- We store the best SUCCESSFUL attempt per discipline (not all 9 attempts):
-- that is everything the history view + best-total need, and it keeps the
-- schema a single flat, queryable row instead of a 9-row attempt child table.
-- A null lift = bombed / not contested; total sums the good lifts only.
--
-- RLS mirrors the proven own-rows-only shape (migration-push-subscriptions):
-- an athlete fully owns their own meets. A coach additionally gets READ-ONLY
-- visibility of a currently-linked athlete's meets (same live-link join used
-- across the app) — useful for coaching, and strictly SELECT so it can never
-- mutate an athlete's record.
--
-- Run once in Supabase SQL Editor. Idempotent (IF NOT EXISTS / OR REPLACE).
-- Schema used: profiles(id uuid = auth.uid(), coach_id uuid).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Meet',
  meet_date     date NOT NULL,
  federation    text NOT NULL DEFAULT '',
  weight_class  text NOT NULL DEFAULT '',
  bodyweight_kg numeric,           -- weigh-in bodyweight (kg, internal unit)
  -- best SUCCESSFUL attempt per lift, in kg. null = bombed / not contested.
  squat_kg      numeric,
  bench_kg      numeric,
  deadlift_kg   numeric,
  notes         text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meets_athlete_date_idx
  ON public.meets (athlete_id, meet_date DESC);

ALTER TABLE public.meets ENABLE ROW LEVEL SECURITY;

-- Read: your own meets.
DROP POLICY IF EXISTS "meets_own_read" ON public.meets;
CREATE POLICY "meets_own_read" ON public.meets
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

-- Read: a coach may see a currently-linked athlete's meets (read-only).
DROP POLICY IF EXISTS "meets_coach_read" ON public.meets;
CREATE POLICY "meets_coach_read" ON public.meets
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = meets.athlete_id
       AND p.coach_id = auth.uid()
  ));

-- Insert: only a meet owned by yourself.
DROP POLICY IF EXISTS "meets_own_insert" ON public.meets;
CREATE POLICY "meets_own_insert" ON public.meets
  FOR INSERT TO authenticated
  WITH CHECK (athlete_id = auth.uid());

-- Update: only your own.
DROP POLICY IF EXISTS "meets_own_update" ON public.meets;
CREATE POLICY "meets_own_update" ON public.meets
  FOR UPDATE TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

-- Delete: your own; admins can clean up any.
DROP POLICY IF EXISTS "meets_own_delete" ON public.meets;
CREATE POLICY "meets_own_delete" ON public.meets
  FOR DELETE TO authenticated
  USING (athlete_id = auth.uid() OR is_admin());

-- ============================================================
-- Verification after running:
--   SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.meets'::regclass;
--   -- expect: meets_own_read, meets_coach_read (SELECT),
--   --         meets_own_insert, meets_own_update, meets_own_delete
-- ============================================================
