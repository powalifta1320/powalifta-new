-- ============================================================
-- POWALIFTA — Form-check video uploads
--
-- An athlete uploads a short video of a lift and asks their coach to review
-- it. The coach watches and writes back a text cue. Distinct from messaging
-- (text thread) and session_notes (pinned to a training day) — this is a
-- video + a single coach reply.
--
-- TWO parts:
--   1. A private Storage bucket `form-checks` that holds the actual video
--      files. Path convention: <athlete_id>/<timestamp>-<filename>. The
--      leading folder = the owner's uid, which the storage policies key off.
--   2. A `form_checks` table holding the metadata + the coach's reply. The
--      video itself is never public — the app fetches a short-lived signed
--      URL (DB.formCheckSignedUrl) for playback.
--
-- Run once in Supabase SQL Editor. The storage-policy block must run as the
-- project owner (it does, in the SQL Editor).
-- ============================================================

-- ---------- 1. Metadata table ----------
CREATE TABLE IF NOT EXISTS form_checks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  lift           text,
  note           text,
  coach_reply    text,
  coach_reply_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS form_checks_athlete_idx ON form_checks(athlete_id);
CREATE INDEX IF NOT EXISTS form_checks_coach_idx   ON form_checks(coach_id);

ALTER TABLE form_checks ENABLE ROW LEVEL SECURITY;

-- Read: either party on the request.
DROP POLICY IF EXISTS "fc_member_read" ON form_checks;
CREATE POLICY "fc_member_read" ON form_checks
  FOR SELECT TO authenticated
  USING (auth.uid() = athlete_id OR auth.uid() = coach_id);

-- Insert: an athlete files a request for their own current coach.
DROP POLICY IF EXISTS "fc_athlete_insert" ON form_checks;
CREATE POLICY "fc_athlete_insert" ON form_checks
  FOR INSERT TO authenticated
  WITH CHECK (
    athlete_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.coach_id = form_checks.coach_id
    )
  );

-- Update: the coach writes their reply; the athlete may edit their own note.
DROP POLICY IF EXISTS "fc_member_update" ON form_checks;
CREATE POLICY "fc_member_update" ON form_checks
  FOR UPDATE TO authenticated
  USING (auth.uid() = athlete_id OR auth.uid() = coach_id)
  WITH CHECK (auth.uid() = athlete_id OR auth.uid() = coach_id);

-- Delete: the athlete who filed it, or an admin.
DROP POLICY IF EXISTS "fc_owner_delete" ON form_checks;
CREATE POLICY "fc_owner_delete" ON form_checks
  FOR DELETE TO authenticated
  USING (athlete_id = auth.uid() OR is_admin());

-- ---------- 2. Storage bucket + object policies ----------
-- Private bucket (public = false). 100 MB per-file cap, video mime types.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'form-checks', 'form-checks', false, 104857600,
  ARRAY['video/mp4','video/quicktime','video/webm','video/x-m4v','video/3gpp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Upload: an athlete may write only into their own <uid>/… folder.
DROP POLICY IF EXISTS "fc_obj_insert" ON storage.objects;
CREATE POLICY "fc_obj_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'form-checks'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Read: the owning athlete, OR the coach that athlete is currently linked to.
-- (The first path segment is the athlete's uid.)
DROP POLICY IF EXISTS "fc_obj_read" ON storage.objects;
CREATE POLICY "fc_obj_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'form-checks'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = ((storage.foldername(name))[1])::uuid
          AND p.coach_id = auth.uid()
      )
    )
  );

-- Delete: only the owning athlete may remove their own video.
DROP POLICY IF EXISTS "fc_obj_delete" ON storage.objects;
CREATE POLICY "fc_obj_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'form-checks'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Verification after running:
--   SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.form_checks'::regclass;
--   SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'form-checks';
-- ============================================================
