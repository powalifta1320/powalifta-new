-- ============================================================
-- POWALIFTA — referral REWARDS ledger (on top of attribution)
--
-- WHAT: a persistent ledger of referral-tier rewards a user has CLAIMED.
-- Attribution already exists (migration-referrals.sql: `referrals` rows + the
-- shareable code). This adds the next layer: when a referrer clears a tier
-- threshold (1 / 3 / 5 / 10 / 25 referrals — see REFERRAL_TIERS in app.js) the
-- reward becomes claimable, and claiming writes one row here. Status starts
-- 'requested'; an admin/coupon flow fulfils it out-of-band (no payment backend
-- is touched by this migration — fulfilment is deliberately manual for now).
--
-- WHY a SECURITY DEFINER rpc (not a client INSERT): the claim must be gated on
-- the caller's REAL referral count, which only a trusted server-side read can
-- establish. Letting clients insert claim rows directly would let anyone claim
-- "25 referrals → top reward" without earning it. So clients get NO insert
-- policy at all — the only writer is claim_referral_reward(), which counts the
-- caller's own `referrals` and refuses an unearned tier. Same trust pattern as
-- claim_invite() / accept_coach_request().
--
-- The reward COPY (what each tier grants) lives client-side in app.js
-- (REFERRAL_TIERS[].reward) so it can be tuned without a migration; the server
-- only certifies "this user genuinely earned tier N". tier_at is the threshold
-- (1/3/5/10/25), which is the stable join key between the two.
--
-- Run once in Supabase SQL Editor, AFTER migration-referrals.sql. Idempotent
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS). Additive + safe.
-- ============================================================

-- ---------- 1. ledger table ----------
CREATE TABLE IF NOT EXISTS public.referral_reward_claims (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier_at    int  NOT NULL CHECK (tier_at >= 1),     -- referral threshold cleared
  status     text NOT NULL DEFAULT 'requested'
             CHECK (status IN ('requested', 'fulfilled', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tier_at)                           -- one claim per tier per user
);
CREATE INDEX IF NOT EXISTS referral_reward_claims_user_idx
  ON public.referral_reward_claims (user_id);

-- ---------- 2. RLS ----------
ALTER TABLE public.referral_reward_claims ENABLE ROW LEVEL SECURITY;

-- Read-only for clients: you see your own claims. There is intentionally NO
-- client INSERT/UPDATE/DELETE policy — the ONLY writer is the SECURITY DEFINER
-- function below (status transitions to 'fulfilled'/'declined' are done by an
-- admin via the service role, which bypasses RLS).
DROP POLICY IF EXISTS "reward_claims_select_own" ON public.referral_reward_claims;
CREATE POLICY "reward_claims_select_own" ON public.referral_reward_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ---------- 3. earn-gated claim function ----------
-- Counts the caller's OWN referrals and refuses any tier they haven't reached.
-- Idempotent: re-claiming an already-claimed tier returns the existing row.
CREATE OR REPLACE FUNCTION public.claim_referral_reward(p_tier_at int)
RETURNS public.referral_reward_claims
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_count int;
  v_row   public.referral_reward_claims;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_tier_at IS NULL OR p_tier_at < 1 THEN
    RAISE EXCEPTION 'invalid tier';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.referrals
   WHERE referrer_id = v_uid;

  IF v_count < p_tier_at THEN
    RAISE EXCEPTION 'reward not earned (% referrals, tier needs %)', v_count, p_tier_at
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.referral_reward_claims (user_id, tier_at)
    VALUES (v_uid, p_tier_at)
    ON CONFLICT (user_id, tier_at) DO NOTHING;

  SELECT * INTO v_row
    FROM public.referral_reward_claims
   WHERE user_id = v_uid AND tier_at = p_tier_at;

  RETURN v_row;
END;
$$;

-- Only authenticated callers may invoke it; the body re-checks earned-ness.
REVOKE ALL ON FUNCTION public.claim_referral_reward(int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral_reward(int) TO authenticated;

-- ============================================================
-- Verification (SQL Editor):
--   -- as a user with >=1 referral, claim tier 1:
--   SELECT * FROM public.claim_referral_reward(1);            -- 1 row, status 'requested'
--   SELECT * FROM public.claim_referral_reward(1);            -- same row (idempotent)
--   -- claiming an unearned tier fails:
--   SELECT * FROM public.claim_referral_reward(999);          -- ERROR: reward not earned
--   -- a user only ever sees their own claims:
--   SELECT * FROM public.referral_reward_claims;              -- own rows only
--
-- Fulfilment (admin, service role):
--   UPDATE public.referral_reward_claims SET status='fulfilled' WHERE id='<claim-id>';
-- ============================================================
