-- ============================================================
-- POWALIFTA — RLS hardening pass #4 (2026-07-13 audit, pre-charging)
--
-- Fixes two HIGH findings on `profiles`, both exploitable with the public anon key:
--
--   H1 — coach_id self-link bypass. profiles_self_update authorizes UPDATEs by ROW
--        (id = auth.uid()) with no column limit, and the existing guards only cover
--        a COACH editing an athlete's row — NOT an athlete editing their OWN coach_id.
--        So any athlete could `update({coach_id:'<any-coach-uuid>'})` and self-link
--        to ANY coach with no invite and no consent: fill a paying coach's tier
--        athlete-limit with fake accounts (grief / forced upgrade), and open a
--        messaging/form-check channel (those INSERTs require a "live link" this
--        fabricates). FIX: freeze self-changes to coach_id except (a) NULL-ing it
--        (leave-coach, the leaveMyCoach path) or (b) a change authorized by the
--        claim_invite RPC, which now signals via a transaction-local flag — the same
--        pattern accept_coach_request already uses (powa.cr_accept).
--
--   H2 — Lemon Squeezy linkage columns unfrozen. subscription_tier is frozen, but a
--        user could self-set ls_subscription_id / ls_customer_id to a real active
--        subscription's ids; a later renewal webhook that matches on those ids would
--        then upgrade the attacker's row (tier theft financed by the real subscriber)
--        or corrupt the real subscriber's status. FIX: freeze the four LS/subscription
--        linkage columns for ordinary callers (service role + admin still exempt).
--
-- Both fixes extend the existing guard_profile_privileged_cols trigger, so they
-- inherit its service-role (auth.uid() IS NULL) + is_admin() exemptions.
--
-- Run once in the Supabase SQL Editor AFTER migration-profiles-privilege-guard.sql,
-- migration-claim-invite-reconnect.sql, and migration-rls-hardening.sql. Idempotent
-- (CREATE OR REPLACE). No data changes. Verification queries at the bottom.
-- ============================================================

-- ---- H1 + H2: extend the profiles privileged-column guard --------------------
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side / service role (no JWT) may change anything (LS webhook, etc.).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Admins may change anything (admin dashboard).
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- Privileged columns are pinned to their existing values for ordinary callers.
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'subscription_tier is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF NEW.user_type IS DISTINCT FROM OLD.user_type THEN
    RAISE EXCEPTION 'user_type is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'is_admin is not user-editable' USING ERRCODE = '42501';
  END IF;

  -- H2 — Lemon Squeezy / subscription linkage columns. Only the service-role
  -- webhook (exempted above) may write these; freezing them stops a user from
  -- pointing their row at someone else's live subscription. Guarded with a
  -- to_jsonb column-presence check so this is a no-op on installs whose profiles
  -- table doesn't have these columns yet (they're added by
  -- migration-subscription-columns.sql).
  IF (to_jsonb(NEW) ? 'ls_subscription_id')
     AND NEW.ls_subscription_id IS DISTINCT FROM OLD.ls_subscription_id THEN
    RAISE EXCEPTION 'ls_subscription_id is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) ? 'ls_customer_id')
     AND NEW.ls_customer_id IS DISTINCT FROM OLD.ls_customer_id THEN
    RAISE EXCEPTION 'ls_customer_id is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) ? 'subscription_status')
     AND NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'subscription_status is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) ? 'subscription_updated_at')
     AND NEW.subscription_updated_at IS DISTINCT FROM OLD.subscription_updated_at THEN
    RAISE EXCEPTION 'subscription_updated_at is not user-editable' USING ERRCODE = '42501';
  END IF;

  -- H1 — coach_id self-link freeze. This trigger's OLD.id = the row being edited.
  -- When a user edits THEIR OWN row (auth.uid() = OLD.id) they may only clear
  -- coach_id (leave their coach); SETTING it to a coach must go through the
  -- claim_invite RPC (which sets powa.link_ok for its own transaction). A coach
  -- accepting a request edits the ATHLETE's row (auth.uid() <> OLD.id), so this
  -- branch is skipped for them — accept_coach_request is unaffected.
  IF auth.uid() = OLD.id
     AND NEW.coach_id IS DISTINCT FROM OLD.coach_id
     AND NEW.coach_id IS NOT NULL
     AND coalesce(current_setting('powa.link_ok', true), '') <> '1' THEN
    RAISE EXCEPTION 'coach_id can only be set by claiming an invite or an accepted coach request'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists (trg_guard_profile_privileged_cols); CREATE OR REPLACE
-- above swaps the body in place. Re-assert the lockdown for safety.
REVOKE ALL ON FUNCTION public.guard_profile_privileged_cols() FROM public, anon, authenticated;

-- ---- H1: teach claim_invite to authorize its own coach_id write --------------
-- Identical to migration-claim-invite-reconnect.sql, plus one line: it sets the
-- transaction-local powa.link_ok flag right before the coach_id UPDATE so the
-- guard above permits THAT write (and only that one).
CREATE OR REPLACE FUNCTION public.claim_invite(invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code  text := upper(trim(coalesce(invite_code, '')));
  v_coach uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF v_code = '' THEN
    RAISE EXCEPTION 'Enter a code';
  END IF;

  SELECT coach_id INTO v_coach
    FROM public.invites
   WHERE code = v_code
     AND used = false
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already-used code';
  END IF;
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'This code is not linked to a coach';
  END IF;
  IF v_coach = auth.uid() THEN
    RAISE EXCEPTION 'You can''t coach yourself';
  END IF;

  -- Authorize the guarded coach_id write for THIS transaction only.
  PERFORM set_config('powa.link_ok', '1', true);

  UPDATE public.profiles
     SET coach_id = v_coach
   WHERE id = auth.uid();

  UPDATE public.invites
     SET used = true
   WHERE code = v_code;

  RETURN v_coach;
END;
$$;

-- ============================================================
-- Verify (run in the app's browser console as a NON-admin athlete — NOT the SQL
-- Editor, where auth.uid() is NULL and everything is exempt):
--   -- must be REJECTED (42501):
--   await sb.from('profiles').update({ coach_id: '<any-coach-uuid>' }).eq('id', (await sb.auth.getUser()).data.user.id)
--   -- must still SUCCEED (leaving a coach):
--   await sb.from('profiles').update({ coach_id: null }).eq('id', (await sb.auth.getUser()).data.user.id)
--   -- claiming a real invite code must still link you:
--   await sb.rpc('claim_invite', { invite_code: '<REALCODE>' })
--   -- ls id tamper must be REJECTED (42501):
--   await sb.from('profiles').update({ ls_subscription_id: 'x' }).eq('id', (await sb.auth.getUser()).data.user.id)
-- ============================================================
