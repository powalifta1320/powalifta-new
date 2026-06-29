-- ============================================================
-- POWALIFTA — fix coach playback of athlete form-check videos
--
-- BUG: an athlete sends a form-check clip; on the COACH account the video
-- says "could not load". The upload + the form_checks row are fine — the
-- failure is the Storage read policy.
--
-- ROOT CAUSE: the original `fc_obj_read` policy on storage.objects let a coach
-- read an athlete's video by joining `profiles`:
--
--     EXISTS (SELECT 1 FROM profiles p
--             WHERE p.id = ((storage.foldername(name))[1])::uuid
--               AND p.coach_id = auth.uid())
--
-- That subquery runs as the CALLING user (the coach), so it is itself subject
-- to RLS on `profiles`. The coach can only SELECT profile rows the profiles
-- SELECT policy exposes to them; the ATHLETE's row keyed by the folder uid is
-- not guaranteed visible, so the EXISTS yields no row and the object read is
-- denied → "could not load". (Whether it works at all then depends on the
-- exact profiles SELECT policy, which is brittle.)
--
-- FIX: authorise off `public.form_checks` instead. That table already has a
-- member-read policy (`fc_member_read`: auth.uid() = athlete_id OR coach_id),
-- so the coach can always see the row for a clip addressed to them. We match
-- the storage object to its form_checks row by `storage_path = name` — and
-- db.js writes `storage_path` to exactly the object name on upload, so they're
-- equal by construction. Athlete self-read (folder uid = their uid) is kept.
--
-- Run once in Supabase SQL Editor. Safe to re-run (DROP POLICY IF EXISTS).
-- Policy definitions only — no data or schema change.
-- ============================================================

DROP POLICY IF EXISTS "fc_obj_read" ON storage.objects;

CREATE POLICY "fc_obj_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'form-checks'
    AND (
      -- Owner (athlete): the leading folder of the object path is their uid.
      (storage.foldername(name))[1] = auth.uid()::text
      -- Coach: a form_checks row points at this exact object and names them as
      -- the coach. fc_member_read guarantees the coach can see that row.
      OR EXISTS (
        SELECT 1 FROM public.form_checks fc
        WHERE fc.storage_path = name
          AND fc.coach_id = auth.uid()
      )
    )
  );

-- ============================================================
-- Verify after running (SQL Editor):
--   SELECT polname, polcmd, qual::text
--     FROM pg_policy
--    WHERE polrelid = 'storage.objects'::regclass
--      AND polname = 'fc_obj_read';
--
-- Functional check: athlete uploads a clip in the Coach tab → Form checks;
-- the coach opens the Form-checks inbox on the roster and the video plays.
-- ============================================================
