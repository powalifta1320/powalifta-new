-- ============================================================
-- POWALIFTA — RLS hardening pass (security audit follow-up)
--
-- A read-only audit of every sql/ policy turned up a handful of write
-- surfaces where RLS let the row pass but did not constrain WHICH columns
-- (or which path/status) the caller could change. None are reachable in
-- demo mode (every client write short-circuits on window._demoMode), but a
-- holder of the public anon key + a valid JWT for their own account could
-- exploit several of them against other users' data. This migration closes
-- them.
--
-- DESIGN NOTE — why triggers, not just policies. An RLS UPDATE policy can
-- only test the new row against a boolean; it cannot say "every column
-- except X must equal its previous value." For column-level immutability we
-- use BEFORE UPDATE/INSERT triggers that compare to_jsonb(NEW) vs to_jsonb(OLD)
-- minus the column(s) we permit to change — robust and column-list-agnostic,
-- the same pattern migration-referrals.sql already uses (lock_referral_cols).
--
-- Run once in Supabase SQL Editor. Idempotent (CREATE OR REPLACE / DROP IF
-- EXISTS). Additive + removable — it only DROPs+recreates the named policies
-- /functions/triggers below, no schema or data change, no client change
-- (every existing DB.* call path keeps working).
--
-- Apply order: AFTER all the migrations it hardens — i.e. last, after
-- migration-form-checks-rls-fix.sql, migration-marketplace.sql,
-- migration-profiles-rls.sql, migration-coach-requests.sql,
-- migration-feedback-checkins.sql, migration-messages.sql,
-- migration-coach-profile.sql.
--
-- ------------------------------------------------------------
-- NOT auto-fixed here (documented so the decision is on the record):
--   * Invite/coach-request code brute-force (6-char codes): rate limiting is
--     an edge-function concern, not SQL. Tracked under edge-fn abuse guards.
--   * profiles SELECT policy is not version-controlled in this repo (it lives
--     in the Supabase dashboard). NOT recreated here on purpose: blindly
--     adding a second permissive SELECT policy would OR-widen read access.
--     ACTION FOR OPERATOR: copy the live profiles SELECT policy into a
--     migration so the full read surface is in git.
--   * referral helper functions (gen_referral_code/set_referral_code/
--     lock_referral_cols) are not REVOKE'd from authenticated. Direct calls
--     are inert (the trigger fns need a NEW row context and error outside it;
--     gen_referral_code just returns a random string). Left as-is to avoid any
--     risk to the signup INSERT path for negligible benefit.
-- ============================================================


-- ============================================================
-- CRITICAL-1 — form_checks: an athlete could file a form-check row whose
-- storage_path pointed into ANOTHER athlete's <uid>/ folder. The storage read
-- policy (fc_obj_read, migration-form-checks-rls-fix.sql) authorises a coach
-- to read any object a form_checks row names (storage_path = name + coach_id =
-- caller), so the attacker's coach could then fetch a stranger's private video.
-- FIX: the INSERT must require storage_path to live under the caller's OWN uid
-- folder — exactly the same leading-folder check the bucket's fc_obj_insert
-- already enforces on the object itself.
-- ============================================================
DROP POLICY IF EXISTS "fc_athlete_insert" ON public.form_checks;
CREATE POLICY "fc_athlete_insert" ON public.form_checks
  FOR INSERT TO authenticated
  WITH CHECK (
    athlete_id = auth.uid()
    -- storage_path must sit under the caller's own uid folder
    AND (storage.foldername(storage_path))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.coach_id = form_checks.coach_id
    )
  );


-- ============================================================
-- HIGH-1 — marketplace_programs: the self-publish guard fired BEFORE UPDATE
-- only, so a coach could INSERT a row with status='published' (and pre-seed
-- sold_count / ls_* fields) and skip admin review entirely. FIX: fire the
-- trigger on INSERT OR UPDATE and guard the INSERT path too. Service-role
-- (webhook) still bypasses via the auth.uid() IS NULL short-circuit.
-- ============================================================
CREATE OR REPLACE FUNCTION mp_prevent_self_publish()
RETURNS TRIGGER AS $$
BEGIN
  -- Admin / service_role may do anything.
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;

  -- A coach can never set 'published' or 'rejected' directly (INSERT or UPDATE).
  IF NEW.status IN ('published', 'rejected') THEN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Only admin can publish or reject a marketplace program.';
    END IF;
  END IF;

  -- sold_count + LS identifiers are admin/webhook-managed.
  IF TG_OP = 'UPDATE' THEN
    IF NEW.sold_count    IS DISTINCT FROM OLD.sold_count
       OR NEW.ls_product_id  IS DISTINCT FROM OLD.ls_product_id
       OR NEW.ls_variant_id  IS DISTINCT FROM OLD.ls_variant_id
       OR NEW.ls_checkout_url IS DISTINCT FROM OLD.ls_checkout_url THEN
      RAISE EXCEPTION 'These fields are managed by admin / webhook only.';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    -- On INSERT a coach must not seed a non-zero sold_count or any LS field.
    IF coalesce(NEW.sold_count, 0) <> 0
       OR NEW.ls_product_id  IS NOT NULL
       OR NEW.ls_variant_id  IS NOT NULL
       OR NEW.ls_checkout_url IS NOT NULL THEN
      RAISE EXCEPTION 'These fields are managed by admin / webhook only.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS mp_prevent_self_publish_trig ON marketplace_programs;
CREATE TRIGGER mp_prevent_self_publish_trig
  BEFORE INSERT OR UPDATE ON marketplace_programs
  FOR EACH ROW EXECUTE FUNCTION mp_prevent_self_publish();


-- ============================================================
-- LOW-1 — marketplace_programs INSERT permitted ANY authenticated account
-- (incl. athletes) to seed pending listings. Tighten the INSERT WITH CHECK to
-- coach accounts (or admin). Publishing already requires admin; this just keeps
-- the review queue clean.
-- ============================================================
DROP POLICY IF EXISTS "mp_coach_insert" ON marketplace_programs;
CREATE POLICY "mp_coach_insert" ON marketplace_programs
  FOR INSERT
  WITH CHECK (
    is_admin()
    OR (
      coach_id = auth.uid()
      AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND user_type = 'coach')
    )
  );


-- ============================================================
-- HIGH-2 — profiles: the coach-detach policy (profiles_coach_detach_athlete)
-- gates by row + final coach_id IS NULL, but does NOT restrict other columns,
-- so a coach detaching an athlete could piggyback edits to that athlete's
-- name / bio / avatar / directory_hidden etc. FIX: a BEFORE UPDATE trigger that,
-- when the actor is a coach acting on someone ELSE's row (not their own, and
-- they are the current coach), forbids changing anything but coach_id. Normal
-- self-updates (auth.uid() = OLD.id) and admin are untouched, and the
-- SECURITY DEFINER link paths (accept_coach_request / claim_invite) are never
-- caught because in those auth.uid() is never equal to the target's OLD.coach_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_profiles_coach_detach()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  -- A coach is editing an athlete's row (not their own) where they are the
  -- current coach. The only legitimate action is releasing them (coach_id NULL).
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> OLD.id
     AND auth.uid() = OLD.coach_id THEN
    IF (to_jsonb(NEW) - 'coach_id') IS DISTINCT FROM (to_jsonb(OLD) - 'coach_id') THEN
      RAISE EXCEPTION 'A coach may only detach an athlete (clear coach_id), not edit their profile.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_coach_detach ON public.profiles;
CREATE TRIGGER trg_guard_profiles_coach_detach
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_coach_detach();


-- ============================================================
-- HIGH-4 — session_notes: the coach UPDATE policy let the assigned coach change
-- ANY column on the athlete's note (including athlete_id → reassign the note to
-- another user, or overwrite the athlete's own note text). FIX: a coach (non-
-- owner) may only write the feedback fields (coach_comment, coach_comment_at,
-- coach_id). The athlete owner (auth.uid() = athlete_id) and admin are untouched.
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_session_notes_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  -- Coach (anyone who is not the note's athlete) may only touch feedback fields.
  IF auth.uid() IS DISTINCT FROM OLD.athlete_id THEN
    IF (to_jsonb(NEW) - 'coach_comment' - 'coach_comment_at' - 'coach_id')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'coach_comment' - 'coach_comment_at' - 'coach_id') THEN
      RAISE EXCEPTION 'A coach may only write feedback fields on a session note.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_session_notes_update ON public.session_notes;
CREATE TRIGGER trg_guard_session_notes_update
  BEFORE UPDATE ON public.session_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_session_notes_update();


-- ============================================================
-- MEDIUM-2 — messages: the member UPDATE policy (intended only to stamp
-- read_at) let either party rewrite body / sender_id / created_at / the thread
-- pair. FIX: only read_at may change on an UPDATE.
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_messages_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - 'read_at') IS DISTINCT FROM (to_jsonb(OLD) - 'read_at') THEN
    RAISE EXCEPTION 'Only read_at may change on a message.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_messages_update ON public.messages;
CREATE TRIGGER trg_guard_messages_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_messages_update();


-- ============================================================
-- HIGH-3 — coach_requests: the athlete UPDATE policy (needed for the re-file
-- upsert) let an athlete change coach_id (redirect a pending request to a coach
-- who never consented), tamper with athlete_id/created_at, or forge
-- status='accepted'. FIX: a BEFORE UPDATE trigger pins the identity columns
-- (coach_id / athlete_id / created_at) and blocks any 'accepted' transition
-- that did not come through accept_coach_request() (which sets a txn-local flag
-- below). note / athlete_name / status(→pending|declined) / updated_at stay free.
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_coach_request_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;

  -- Identity columns are immutable post-creation.
  IF (to_jsonb(NEW) - 'note' - 'athlete_name' - 'status' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'note' - 'athlete_name' - 'status' - 'updated_at') THEN
    RAISE EXCEPTION 'coach_id / athlete_id / created_at are immutable on a coach request.';
  END IF;

  -- 'accepted' may only be set by accept_coach_request() (sets powa.cr_accept).
  IF NEW.status = 'accepted'
     AND OLD.status IS DISTINCT FROM 'accepted'
     AND coalesce(current_setting('powa.cr_accept', true), '') <> '1' THEN
    RAISE EXCEPTION 'Use accept_coach_request() to accept a coach request.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_coach_request_update ON public.coach_requests;
CREATE TRIGGER trg_guard_coach_request_update
  BEFORE UPDATE ON public.coach_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_coach_request_update();

-- accept_coach_request() rewritten to (a) set the txn-local accept flag so the
-- guard above lets the 'accepted' transition through, and (b) refuse to steal an
-- athlete who is already linked to a DIFFERENT coach (MEDIUM-4: concurrent /
-- silent re-link). Body otherwise identical to migration-coach-requests.sql.
CREATE OR REPLACE FUNCTION public.accept_coach_request(request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_athlete uuid;
  v_coach   uuid;
  v_status  text;
  v_current uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT athlete_id, coach_id, status
    INTO v_athlete, v_coach, v_status
    FROM public.coach_requests
   WHERE id = request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_coach <> auth.uid() THEN
    RAISE EXCEPTION 'Not your request to accept';
  END IF;
  IF v_status = 'accepted' THEN
    RETURN v_athlete;  -- idempotent
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending';
  END IF;

  -- Don't silently poach an athlete already linked to another coach.
  SELECT coach_id INTO v_current FROM public.profiles WHERE id = v_athlete;
  IF v_current IS NOT NULL AND v_current <> v_coach THEN
    RAISE EXCEPTION 'Athlete is already linked to another coach';
  END IF;

  -- Authorise the guarded 'accepted' transition for THIS transaction only.
  PERFORM set_config('powa.cr_accept', '1', true);

  UPDATE public.profiles
     SET coach_id = v_coach
   WHERE id = v_athlete;

  UPDATE public.coach_requests
     SET status = 'accepted', updated_at = now()
   WHERE id = request_id;

  RETURN v_athlete;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_coach_request(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_coach_request(uuid) TO authenticated;


-- ============================================================
-- MEDIUM-1 — avatars Storage UPDATE policy had no WITH CHECK, so the new-row
-- path (name) was unvalidated and an owner could rename an object out of their
-- own folder. Add the matching WITH CHECK.
-- ============================================================
DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- Verification (SQL Editor) — uncomment after running:
--
--   -- triggers in place
--   SELECT tgname, tgrelid::regclass FROM pg_trigger
--    WHERE tgname IN (
--      'mp_prevent_self_publish_trig','trg_guard_profiles_coach_detach',
--      'trg_guard_session_notes_update','trg_guard_messages_update',
--      'trg_guard_coach_request_update');
--
--   -- CRITICAL-1: this INSERT must now fail (cross-tenant storage_path)
--   -- (run as a normal athlete JWT)
--   -- INSERT INTO form_checks (athlete_id, coach_id, storage_path)
--   --   VALUES (auth.uid(), '<my-coach>', '<someone-elses-uid>/clip.mp4');
--   --   → ERROR  (was previously allowed)
--
--   -- HIGH-1: a coach INSERT with status='published' must now fail
--   -- HIGH-3: an athlete UPDATE setting status='accepted' must now fail
-- ============================================================
