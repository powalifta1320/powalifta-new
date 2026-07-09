-- ============================================================
-- POWALIFTA — let an athlete join a coach again after leaving one
--
-- BUG: "if a client had a coach and no more does, they are not able to add a
-- coach again." The athlete leaves (coach_id → null, which the profiles RLS
-- self-update policy persists fine), a NEW coach gives them a fresh 6-char
-- code, they enter it on the Coach tab → it fails.
--
-- The code path is correct: joinCoach() → DB.claimInviteCode(code) →
-- sb.rpc('claim_invite', { invite_code }). The failure is inside that RPC,
-- which was created ad-hoc in the SQL editor (it is not in this repo). The
-- live version evidently refuses a second link.
--
-- FIX: recreate `claim_invite` as a clean, reconnect-safe SECURITY DEFINER
-- function. Its contract is fully defined by its single call site (db.js):
--   in  -> invite_code text
--   out -> the coach's uuid (the client sets user.coachId to it)
--   throws on an invalid/used code.
-- It overwrites coach_id unconditionally, so it works the same whether the
-- caller currently has no coach (left one earlier) or never had one. The
-- 6-char single-use code is the security boundary (matching the "code from
-- your coach" UX); the row lock makes concurrent claims safe.
--
-- Run once in Supabase SQL Editor. Idempotent (CREATE OR REPLACE).
-- Schema used: invites(code text, coach_id uuid, used bool),
--              profiles(id uuid = auth.uid(), coach_id uuid).
-- ============================================================

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

  -- Find an unused invite with this code and lock it, so two concurrent
  -- claims of the same code can't both win.
  SELECT coach_id INTO v_coach
    FROM public.invites
   WHERE code = v_code
     AND used = false
   FOR UPDATE;

  -- No matching unused code at all (vs. a malformed row that happens to carry
  -- a null coach_id — caught separately below so we never link to nobody).
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or already-used code';
  END IF;
  IF v_coach IS NULL THEN
    RAISE EXCEPTION 'This code is not linked to a coach';
  END IF;

  -- Don't let a code link someone to themselves (e.g. a coach testing a code).
  IF v_coach = auth.uid() THEN
    RAISE EXCEPTION 'You can''t coach yourself';
  END IF;

  -- Reconnect-safe: set the link regardless of the current coach_id. An
  -- athlete who left a previous coach (coach_id already null) and one whose
  -- old link somehow lingered both end up correctly linked to the new coach.
  UPDATE public.profiles
     SET coach_id = v_coach
   WHERE id = auth.uid();

  -- Burn the single-use code.
  UPDATE public.invites
     SET used = true
   WHERE code = v_code;

  RETURN v_coach;
END;
$$;

-- Only signed-in users may claim; never anon/public.
REVOKE ALL ON FUNCTION public.claim_invite(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_invite(text) TO authenticated;

-- ============================================================
-- Verify after running (SQL Editor):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'claim_invite';
--     -- prosecdef = true (SECURITY DEFINER)
--
-- Functional check: an athlete who left a coach enters a fresh code from a new
-- coach on the Coach tab → "Joined coach!" and the new coach appears.
-- ============================================================
