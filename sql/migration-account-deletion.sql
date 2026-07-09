-- migration-account-deletion.sql
-- Groundwork for self-serve account deletion / erasure (#33).
--
-- Full erasure is performed by the `delete-account` edge function, which calls
-- auth.admin.deleteUser(uid) with the service role. That single delete cascades
-- across every table whose FK to profiles(id) / auth.users(id) is already
-- ON DELETE CASCADE (logs, programs, bodyweight, goals, meets, messages,
-- program_reviews, referrals, referral_reward_claims, leaderboard_entries,
-- form_checks, session_notes, checkins, coach_requests, email_preferences,
-- push_subscriptions, ai_chat_usage, and the coach's marketplace_programs).
--
-- Two things stand in the way of a clean cascade, and this migration fixes both.
--
-- (1) program_sales — RETAINED, NOT DELETED.
--     Sales are financial/tax records the privacy policy commits to retaining.
--     But buyer_id / coach_id / marketplace_program_id are NOT NULL with the
--     default RESTRICT FK, so deleting a buyer, a coach, or a coach's listing
--     would be BLOCKED by these rows — erasure would fail outright.
--     Fix: keep the row (amounts, dates, tax/order ids) but let the personal
--     linkage go NULL on erasure. We drop NOT NULL and switch the three FKs to
--     ON DELETE SET NULL. After a user is erased their sale rows survive with a
--     severed identity — the standard "retain the invoice, anonymize the party"
--     pattern. The surviving counterparty (e.g. the coach when a buyer leaves)
--     still sees their side; RLS already keys on buyer_id/coach_id = auth.uid()
--     so a NULL side is simply invisible to everyone but admin.
--
-- (2) profiles -> auth.users — MUST be ON DELETE CASCADE.
--     The canonical Supabase pattern is `profiles.id references auth.users(id)
--     on delete cascade`. If that constraint were RESTRICT, deleteUser() would
--     be blocked by the profile row. The guarded DO block below verifies it and
--     upgrades it to CASCADE if (and only if) it isn't already — idempotent, and
--     a no-op on a standard install.
--
-- Idempotent. Order-independent. Apply any time (before deploying delete-account).

-- ---------------------------------------------------------------------------
-- (1) program_sales: retain-but-anonymize on erasure
-- ---------------------------------------------------------------------------
ALTER TABLE public.program_sales ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE public.program_sales ALTER COLUMN coach_id DROP NOT NULL;
ALTER TABLE public.program_sales ALTER COLUMN marketplace_program_id DROP NOT NULL;

-- buyer_id -> profiles(id) ON DELETE SET NULL
ALTER TABLE public.program_sales DROP CONSTRAINT IF EXISTS program_sales_buyer_id_fkey;
ALTER TABLE public.program_sales
  ADD CONSTRAINT program_sales_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- coach_id -> profiles(id) ON DELETE SET NULL
ALTER TABLE public.program_sales DROP CONSTRAINT IF EXISTS program_sales_coach_id_fkey;
ALTER TABLE public.program_sales
  ADD CONSTRAINT program_sales_coach_id_fkey
  FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- marketplace_program_id -> marketplace_programs(id) ON DELETE SET NULL
-- (a coach's listings cascade-delete with their profile; the sale must outlive them)
ALTER TABLE public.program_sales DROP CONSTRAINT IF EXISTS program_sales_marketplace_program_id_fkey;
ALTER TABLE public.program_sales
  ADD CONSTRAINT program_sales_marketplace_program_id_fkey
  FOREIGN KEY (marketplace_program_id) REFERENCES public.marketplace_programs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- (2) profiles -> auth.users must cascade so deleteUser() isn't blocked
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  con  record;
BEGIN
  -- Find the FK on public.profiles that references auth.users.
  SELECT c.conname, c.confdeltype
    INTO con
  FROM pg_constraint c
  JOIN pg_class    t  ON t.oid  = c.conrelid
  JOIN pg_namespace tn ON tn.oid = t.relnamespace
  JOIN pg_class    rt ON rt.oid = c.confrelid
  JOIN pg_namespace rn ON rn.oid = rt.relnamespace
  WHERE c.contype = 'f'
    AND tn.nspname = 'public' AND t.relname = 'profiles'
    AND rn.nspname = 'auth'   AND rt.relname = 'users'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'account-deletion: no FK from public.profiles to auth.users found; '
                 'verify profiles.id references auth.users(id) ON DELETE CASCADE manually.';
  ELSIF con.confdeltype = 'c' THEN
    RAISE NOTICE 'account-deletion: profiles->auth.users FK already ON DELETE CASCADE (%).', con.conname;
  ELSE
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', con.conname);
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
    RAISE NOTICE 'account-deletion: upgraded profiles->auth.users FK (% ) to ON DELETE CASCADE.', con.conname;
  END IF;
END $$;
