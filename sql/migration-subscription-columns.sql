-- ============================================================
-- POWALIFTA — guarantee the profiles subscription columns exist
--
-- WHY: ls-webhook.ts (the Lemon Squeezy subscription webhook) writes FIVE
-- columns in a single statement when a coach subscribes / changes plan:
--
--   .update({
--     subscription_tier, subscription_status, ls_subscription_id,
--     ls_customer_id, subscription_updated_at
--   })
--
-- A Postgres UPDATE is all-or-nothing: if ANY one of those columns is missing
-- the entire write 400s and the coach's tier never activates — they paid and
-- nothing happens, with no error surfaced to them. Yet NO migration in this
-- repo actually creates these columns; they were added by hand in the Supabase
-- dashboard. `subscription_tier` provably exists (enforce_athlete_limit() reads
-- it and the app works), but the other four are unverified and a single missing
-- one silently breaks every subscription. The tier-enforcement and privilege-
-- guard migrations both ASSUME subscription_tier already exists; nothing
-- guarantees the rest.
--
-- This migration makes the schema match what the webhook needs. Every statement
-- is `IF NOT EXISTS`, so it's a no-op for columns that are already there and
-- only fills the gaps. No data is touched.
--
-- Run once in Supabase SQL Editor. Safe to re-run. No data changes.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier       text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_status     text,
  ADD COLUMN IF NOT EXISTS ls_subscription_id      text,
  ADD COLUMN IF NOT EXISTS ls_customer_id          text,
  ADD COLUMN IF NOT EXISTS subscription_updated_at timestamptz;

-- The webhook resolves a returning customer by ls_customer_id / ls_subscription_id
-- on later events (renewal, cancel, expire). Index them so those lookups stay
-- fast as the table grows. Partial (WHERE NOT NULL) — only paying coaches have
-- these set, so the index stays tiny.
CREATE INDEX IF NOT EXISTS profiles_ls_customer_idx
  ON public.profiles(ls_customer_id) WHERE ls_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_ls_subscription_idx
  ON public.profiles(ls_subscription_id) WHERE ls_subscription_id IS NOT NULL;

-- ============================================================
-- Verification (optional). After running, this should list all five columns:
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'profiles'
--     AND column_name IN ('subscription_tier','subscription_status',
--       'ls_subscription_id','ls_customer_id','subscription_updated_at')
--   ORDER BY column_name;
-- ============================================================
