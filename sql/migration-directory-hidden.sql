-- ============================================================
-- POWALIFTA — admin control over the public coach directory
-- Adds profiles.directory_hidden: when true, the coach does not
-- appear in the landing-page "Browse coaches" grid (their account,
-- athletes, and programs are untouched — this is visibility only).
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS directory_hidden boolean NOT NULL DEFAULT false;

-- Admins can already update profiles via existing is_admin() RLS policies
-- (same path the admin plan-change dropdown uses), so no policy changes needed.

-- Verification:
-- SELECT name, directory_hidden FROM public.profiles WHERE user_type = 'coach';
