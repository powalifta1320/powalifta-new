-- ============================================================
-- POWALIFTA — referral / affiliate program
--
-- WHAT: every user gets a short shareable referral_code. When a new user signs
-- up through someone's link (?ref=CODE), the client stamps that code onto their
-- OWN profile (referred_by_code) right after signup — exactly mirroring how the
-- coach-invite flow claims a code post-signup. A SECURITY DEFINER trigger then
-- resolves code → referrer and writes one row into `referrals`, so each referrer
-- can see who they brought in. Self-serve, no coach gating, works for athletes
-- AND coaches.
--
-- WHY a trigger (not a client INSERT into referrals): the referrer_id must be
-- derived from a trusted lookup of the code, and the row must be idempotent +
-- self-referral-proof. Letting clients write `referrals` directly would let
-- anyone fabricate "X referred me" rows. The client only ever sets its own
-- profiles.referred_by_code (RLS: id = auth.uid()); the server does the rest.
--
-- Columns added to profiles:
--   referral_code     text UNIQUE  — this user's own shareable code (auto-gen)
--   referred_by_code  text         — the code that referred them (write-once)
--
-- Run once in Supabase SQL Editor, AFTER migration-profiles-rls.sql and
-- migration-profiles-privilege-guard.sql. Safe to re-run (IF NOT EXISTS / CREATE
-- OR REPLACE / DROP ... IF EXISTS).
-- ============================================================

-- ---------- 1. profiles columns ----------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code    text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by_code text;

-- Unique, case-sensitive code per user. Partial unique index ignores NULLs so
-- the backfill below can run before codes are assigned.
DROP INDEX IF EXISTS profiles_referral_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
  ON public.profiles (referral_code) WHERE referral_code IS NOT NULL;

-- ---------- 2. code generator ----------
-- 6 chars from an unambiguous alphabet (no 0/O/1/I/L). Loops until the code is
-- unused, so collisions are impossible even as the table grows.
CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  code text;
  i int;
  taken boolean;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE referral_code = code) INTO taken;
    EXIT WHEN NOT taken;
  END LOOP;
  RETURN code;
END;
$$;

-- ---------- 3. assign a code to every new profile ----------
CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.gen_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_referral_code ON public.profiles;
CREATE TRIGGER trg_set_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referral_code();

-- ---------- 4. backfill existing rows ----------
-- One row at a time so each gen_referral_code() call sees the codes already
-- assigned earlier in the loop (a single bulk UPDATE could collide).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE referral_code IS NULL LOOP
    UPDATE public.profiles SET referral_code = public.gen_referral_code() WHERE id = r.id;
  END LOOP;
END $$;

-- ---------- 5. write-once lock on the two code columns ----------
-- referral_code is system-assigned; referred_by_code is set exactly once (the
-- first time a referral is attributed). Both are silently pinned back to their
-- existing value on any later change, so an ordinary settings UPDATE that
-- happens to echo these fields can't rewrite attribution or re-roll a code.
-- (Silent pin, not RAISE — so it never breaks an unrelated profile save.)
CREATE OR REPLACE FUNCTION public.lock_referral_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.referral_code IS NOT NULL
     AND NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    NEW.referral_code := OLD.referral_code;
  END IF;
  IF OLD.referred_by_code IS NOT NULL
     AND NEW.referred_by_code IS DISTINCT FROM OLD.referred_by_code THEN
    NEW.referred_by_code := OLD.referred_by_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_referral_cols ON public.profiles;
CREATE TRIGGER trg_lock_referral_cols
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_referral_cols();

-- ---------- 6. referrals table ----------
CREATE TABLE IF NOT EXISTS public.referrals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_name text,
  status        text NOT NULL DEFAULT 'joined',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referred_id)            -- a user can only have been referred once
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id);

-- ---------- 7. populate referrals from referred_by_code ----------
CREATE OR REPLACE FUNCTION public.populate_referral()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer uuid;
BEGIN
  -- Only act when a code is freshly attached (NULL on INSERT, or NULL→value on UPDATE).
  IF NEW.referred_by_code IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.referred_by_code IS NOT DISTINCT FROM OLD.referred_by_code THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_referrer
    FROM public.profiles
   WHERE referral_code = NEW.referred_by_code
   LIMIT 1;

  -- Unknown code or self-referral → ignore silently (attribution just doesn't stick).
  IF v_referrer IS NULL OR v_referrer = NEW.id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, referred_name, status)
    VALUES (v_referrer, NEW.id, NEW.name, 'joined')
    ON CONFLICT (referred_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_referral ON public.profiles;
CREATE TRIGGER trg_populate_referral
  AFTER INSERT OR UPDATE OF referred_by_code ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_referral();

-- Only the trigger should ever call this.
REVOKE ALL ON FUNCTION public.populate_referral() FROM public, anon, authenticated;

-- ---------- 8. RLS on referrals ----------
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Read-only for clients: you see referrals where you're either side. No client
-- INSERT/UPDATE/DELETE policies exist, so the ONLY writer is the SECURITY
-- DEFINER trigger above (which runs as the table owner and bypasses RLS).
DROP POLICY IF EXISTS "referrals_select_own" ON public.referrals;
CREATE POLICY "referrals_select_own" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_id = auth.uid() OR referred_id = auth.uid());

-- ============================================================
-- Verification (SQL Editor):
--   -- every profile has a code, all distinct:
--   SELECT count(*) total, count(referral_code) coded,
--          count(DISTINCT referral_code) distinct_codes FROM public.profiles;
--
--   -- simulate an attribution (replace with two real ids / a real code):
--   UPDATE public.profiles SET referred_by_code =
--     (SELECT referral_code FROM public.profiles WHERE id = '<referrer-id>')
--    WHERE id = '<referred-id>';
--   SELECT * FROM public.referrals WHERE referred_id = '<referred-id>';  -- 1 row
--
--   -- self-referral is ignored:
--   UPDATE public.profiles SET referred_by_code = referral_code WHERE id = '<some-id>';
--   -- → no referrals row for that id
-- ============================================================
