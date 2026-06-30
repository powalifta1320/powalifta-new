-- ============================================================
-- POWALIFTA — let a coachless athlete ask a coach to take them on
--
-- FEATURE: athletes with no coach can browse the coach directory (already
-- public via profiles/listCoaches) and send a "request to join". The coach
-- sees pending requests on their Roster tab and Accepts (links the athlete)
-- or Declines. This is the in-app "how to contact a coach" channel that pairs
-- with the existing 6-char invite-code path.
--
-- WHY A NEW TABLE + SECURITY DEFINER: a coach cannot, under profiles RLS, set
-- coach_id on an athlete's row they don't yet own — same wall claim_invite
-- works around. So Accept runs through accept_coach_request() (SECURITY
-- DEFINER), which writes profiles.coach_id for them. The pending request the
-- athlete created (athlete_id = auth.uid()) is the consent/security boundary:
-- the coach can only accept a request the athlete themselves filed.
--
-- athlete_name is DENORMALISED onto the request: the coach can't read an
-- unlinked athlete's profile row, so we carry the display name on the request
-- itself (same trick as program_reviews.buyer_name).
--
-- Run once in Supabase SQL Editor. Idempotent (IF NOT EXISTS / OR REPLACE).
-- Schema used: profiles(id uuid = auth.uid(), coach_id uuid, user_type text).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coach_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  athlete_name text NOT NULL DEFAULT 'An athlete',
  note         text NOT NULL DEFAULT '',
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- One standing request per athlete↔coach pair; re-requesting upserts it back
  -- to 'pending' rather than piling up rows.
  UNIQUE (athlete_id, coach_id)
);

CREATE INDEX IF NOT EXISTS coach_requests_coach_pending_idx
  ON public.coach_requests (coach_id) WHERE status = 'pending';

ALTER TABLE public.coach_requests ENABLE ROW LEVEL SECURITY;

-- Athlete owns their side: create, read, and re-file (upsert) their own rows.
DROP POLICY IF EXISTS "cr_athlete_insert" ON public.coach_requests;
CREATE POLICY "cr_athlete_insert" ON public.coach_requests
  FOR INSERT TO authenticated
  WITH CHECK (athlete_id = auth.uid());

DROP POLICY IF EXISTS "cr_athlete_select" ON public.coach_requests;
CREATE POLICY "cr_athlete_select" ON public.coach_requests
  FOR SELECT TO authenticated
  USING (athlete_id = auth.uid());

DROP POLICY IF EXISTS "cr_athlete_update" ON public.coach_requests;
CREATE POLICY "cr_athlete_update" ON public.coach_requests
  FOR UPDATE TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

-- Coach sees requests addressed to them and may Decline (status UPDATE).
-- Accept goes through the SECURITY DEFINER function below.
DROP POLICY IF EXISTS "cr_coach_select" ON public.coach_requests;
CREATE POLICY "cr_coach_select" ON public.coach_requests
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid());

DROP POLICY IF EXISTS "cr_coach_update" ON public.coach_requests;
CREATE POLICY "cr_coach_update" ON public.coach_requests
  FOR UPDATE TO authenticated
  USING (coach_id = auth.uid())
  WITH CHECK (coach_id = auth.uid());

-- ============================================================
-- accept_coach_request(request_id) — coach links the athlete.
--   in  -> request_id uuid
--   out -> the athlete's uuid (client refreshes roster)
--   throws on a request that isn't a live pending one addressed to the caller.
-- Mirrors claim_invite: SECURITY DEFINER so it can write profiles.coach_id on
-- the athlete's row, with the pending request as the authorisation boundary.
-- ============================================================
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  -- Lock the request so two Accept clicks can't both link.
  SELECT athlete_id, coach_id, status
    INTO v_athlete, v_coach, v_status
    FROM public.coach_requests
   WHERE id = request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  -- Only the addressed coach may accept.
  IF v_coach <> auth.uid() THEN
    RAISE EXCEPTION 'Not your request to accept';
  END IF;
  IF v_status = 'accepted' THEN
    RETURN v_athlete;  -- idempotent
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending';
  END IF;

  -- Link the athlete to this coach (overwrites unconditionally, reconnect-safe).
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
-- Verify after running (SQL Editor):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'accept_coach_request';
--     -- prosecdef = true
--   SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.coach_requests'::regclass;
--
-- Functional check: a coachless athlete opens Coach tab → "Find a coach",
-- clicks Request to join on a coach; that coach sees the request on Roster and
-- clicks Accept → the athlete appears on their roster and is linked.
-- ============================================================
