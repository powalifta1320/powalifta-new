-- ============================================================
-- migration-rls-hardening-3.sql  —  security-audit hardening pass #3
--
-- RUN AFTER migration-form-checks.sql, migration-form-checks-rls-fix.sql,
-- migration-profiles-rls.sql, and migration-profiles-privilege-guard.sql
-- (this file adds triggers alongside objects those define). Idempotent
-- (CREATE OR REPLACE / DROP ... IF EXISTS) — safe to re-run. No data or
-- schema changes, no client change (every existing DB.* path keeps working).
--
-- Two findings from audit pass #3 (both adversarially verified against the
-- client write paths — neither fix breaks a legitimate DB.* call):
--
--  [HIGH] form_checks UPDATE was column-unguarded (F3).
--         The hardening-1 pass added column-immutability triggers to
--         session_notes / messages / coach_requests / profiles-coach-detach,
--         and CRITICAL-1 pinned the form_checks *INSERT* storage_path to the
--         caller's own folder — but the form_checks *UPDATE* policy
--         (fc_member_update) still only checks membership
--         (auth.uid() = athlete_id OR coach_id) with NO column constraint.
--         So a member could UPDATE their own row and MOVE storage_path (and
--         coach_id) after the fact:
--           1. INSERT a legit row (athlete_id=me, coach_id=my coach,
--              storage_path='<me>/clip.mp4')  — passes CRITICAL-1.
--           2. UPDATE it: SET coach_id = me, storage_path = '<victim>/private.mp4'.
--              fc_member_update's WITH CHECK is satisfied (athlete_id=me).
--           3. The storage read policy fc_obj_read authorises a read of any
--              object named by a form_checks row where coach_id = auth.uid(),
--              so DB.formCheckSignedUrl('<victim>/private.mp4') now mints a
--              signed URL to a stranger's private form-check video.
--         (Exploit needs the victim's uuid-prefixed storage_path — not mass-
--         enumerable — so HIGH not CRITICAL, but the "owner + current coach
--         only" guarantee is broken.) Fix: a BEFORE UPDATE trigger pins the
--         identity/object columns immutable and restricts who may write which
--         reply/note field. The only legit UPDATE (db.js replyToFormCheck sets
--         coach_reply + coach_reply_at; athletes may edit note/lift) still works.
--
--  [HIGH, defensive] profiles privilege freeze was UPDATE-only (F4).
--         guard_profile_privileged_cols (migration-profiles-privilege-guard.sql)
--         is a BEFORE UPDATE trigger, so it blocks a normal user from raising
--         their own subscription_tier / user_type / is_admin via UPDATE. But
--         there is NO guard on the profiles INSERT path. If the live profiles
--         INSERT policy (which is NOT version-controlled in this repo — see
--         OPERATOR NOTE below) lets a client insert its own row, a user could
--         self-insert `is_admin = true` / `subscription_tier = 'premium'` at
--         signup, before any UPDATE guard can fire. This adds a BEFORE INSERT
--         trigger that SILENTLY PINS those columns to safe values for ordinary
--         callers (never RAISEs, so it can never break signup):
--           is_admin           -> false
--           subscription_tier  -> 'free'
--           user_type          -> clamped to 'athlete'|'coach' (never 'admin')
--         Service role (auth.uid() IS NULL — the LS webhook + any signup DB
--         trigger) and existing admins are exempt, exactly like the UPDATE guard.
--         Defensive depth: closes the window regardless of what the live INSERT
--         policy turns out to be.
--
-- ------------------------------------------------------------
-- OPERATOR NOTE — two policies still live only in the Supabase dashboard and
-- CANNOT be verified from this repo. Please export them into a migration so the
-- full security surface is in git, and confirm they are not overly permissive:
--
--   (OP1) profiles SELECT + INSERT policies. SELECT gates ALL anon PII exposure
--         (email / coach_id / subscription_* must NOT be readable by anon — the
--         whole point of the denormalised buyer_name/athlete_name/leaderboard
--         columns is to avoid exposing profiles). INSERT gates signup escalation
--         (F4). Verify with:
--           SELECT polname, polcmd, roles::regrole[] , qual::text AS using_,
--                  with_check::text AS check_
--             FROM pg_policy WHERE polrelid = 'public.profiles'::regclass
--            ORDER BY polcmd;
--         Confirm: no SELECT policy is `USING (true)` for anon that exposes the
--         whole row for NON-coach profiles; the INSERT policy (if any) does not
--         let a caller set privileged columns (F4's trigger now backstops this).
--
--   (OP2) is_admin(). Every policy in this repo trusts it. Confirm it is
--         SECURITY DEFINER with a pinned search_path and reads
--         profiles.is_admin for auth.uid():
--           SELECT proname, prosecdef, proconfig
--             FROM pg_proc WHERE proname = 'is_admin';
--         Expect prosecdef = true and proconfig to contain 'search_path=public'.
-- ============================================================


-- ============================================================
-- F3 — form_checks: pin identity/object columns; restrict reply vs note by role
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_form_checks_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;

  -- Identity + the object pointer are immutable after creation. This is the
  -- core fix: it prevents re-pointing storage_path into another user's folder
  -- or hijacking coach_id to grant oneself storage read on someone else's clip.
  IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.athlete_id  IS DISTINCT FROM OLD.athlete_id
     OR NEW.coach_id    IS DISTINCT FROM OLD.coach_id
     OR NEW.created_at  IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'storage_path / athlete_id / coach_id / created_at are immutable on a form check.';
  END IF;

  IF auth.uid() = OLD.athlete_id THEN
    -- The athlete owner may edit only their own request text (note / lift).
    IF (to_jsonb(NEW) - 'note' - 'lift')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'note' - 'lift') THEN
      RAISE EXCEPTION 'An athlete may only edit note/lift on their own form check.';
    END IF;
  ELSE
    -- The coach (the only other member fc_member_update admits) may write only
    -- the reply fields. db.js replyToFormCheck sets exactly these two.
    IF (to_jsonb(NEW) - 'coach_reply' - 'coach_reply_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'coach_reply' - 'coach_reply_at') THEN
      RAISE EXCEPTION 'A coach may only write the reply on a form check.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_form_checks_update ON public.form_checks;
CREATE TRIGGER trg_guard_form_checks_update
  BEFORE UPDATE ON public.form_checks
  FOR EACH ROW EXECUTE FUNCTION public.guard_form_checks_update();


-- ============================================================
-- F4 — profiles: pin privileged columns on INSERT for ordinary callers.
-- Silent pin (never RAISE) so it can never break the signup INSERT path.
-- Complements guard_profile_privileged_cols (which is UPDATE-only).
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_cols_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (no JWT — LS webhook, or a SECURITY DEFINER signup trigger)
  -- and admins may set anything.
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  -- Ordinary caller inserting a profile row: force privileged columns to safe
  -- values. A legitimate client signup never sets these to anything else.
  IF NEW.is_admin IS DISTINCT FROM false THEN
    NEW.is_admin := false;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM 'free' THEN
    NEW.subscription_tier := 'free';
  END IF;
  IF NEW.user_type IS NULL OR NEW.user_type NOT IN ('athlete', 'coach') THEN
    NEW.user_type := 'athlete';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_privileged_cols_insert() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_profile_privileged_cols_insert ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_cols_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profile_privileged_cols_insert();


-- ============================================================
-- VERIFICATION (run after applying; all should hold)
--
-- 1. Both new triggers exist:
--      SELECT tgname, tgrelid::regclass FROM pg_trigger
--       WHERE tgname IN ('trg_guard_form_checks_update',
--                        'trg_guard_profile_privileged_cols_insert');
--
-- 2. F3 negative test (as a normal athlete JWT who owns form_check row R):
--      -- moving the object pointer must now FAIL:
--      UPDATE form_checks SET storage_path = '<someone-else>/clip.mp4' WHERE id = R;
--        -> ERROR: storage_path / athlete_id / coach_id / created_at are immutable...
--      -- the legit coach reply path must still SUCCEED (as the coach):
--      UPDATE form_checks SET coach_reply = 'chest up', coach_reply_at = now() WHERE id = R;
--        -> OK
--
-- 3. F4 (as a normal user, via the browser console on a signed-in non-admin):
--      -- an INSERT that tries to self-escalate lands neutered, not admin/premium:
--      -- (the row is created with is_admin=false, subscription_tier='free')
--      -- Simplest check: confirm no non-service INSERT can produce is_admin=true:
--      SELECT count(*) FROM profiles WHERE is_admin = true;  -- only real admins
-- ============================================================
