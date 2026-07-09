-- ============================================================
-- migration-rls-hardening-2.sql  —  security-audit hardening pass #2
--
-- RUN AFTER migration-marketplace-reviews.sql, migration-marketplace.sql,
-- and migration-rls-hardening.sql (this file re-creates objects they define).
-- Idempotent (DROP ... IF EXISTS / CREATE OR REPLACE) — safe to re-run.
--
-- ORDER-SAFE: the program_reviews block below self-SKIPS (with a NOTICE) if that
-- table isn't in the DB yet, so running this before migration-marketplace-reviews
-- no longer errors — it just hardens whatever exists. Re-run after you add the
-- reviews table and the fix lands then.
--
-- Two findings from the overnight audit:
--
--  [HIGH] program_reviews trusted the client-supplied denormalized coach_id.
--         The buyer INSERT/UPDATE policies only checked buyer_id = auth.uid()
--         and that SOME sale existed for the marketplace_program_id — they never
--         checked that coach_id actually belongs to that program. A buyer who
--         made ONE real purchase could then insert a 1-star review carrying a
--         RIVAL coach's id, and the public coach-profile aggregation
--         (DB.listReviewsForCoach → .eq('coach_id', …)) would count it against
--         the rival. Fix: bind coach_id to the program's real coach in RLS.
--
--  [MED]  mp_prevent_self_publish() was declared SECURITY DEFINER with NO
--         `SET search_path`, the only DEFINER function in the repo missing it.
--         An unpinned search_path lets a caller who can create objects shadow
--         the unqualified is_admin() call. Fix: pin search_path = public
--         (matches every sibling DEFINER function).
-- ============================================================

-- ── HIGH — program_reviews: coach_id must match the program's real coach ──────
-- Guarded so it no-ops cleanly if program_reviews isn't in the DB yet.
-- INSERT: buyer, a real sale for the program, AND coach_id = the program's coach.
-- UPDATE: own review, and the (possibly edited) coach_id still matches the program.
DO $do$
BEGIN
  IF to_regclass('public.program_reviews') IS NULL THEN
    RAISE NOTICE 'program_reviews not present — skipping review-policy hardening. Run migration-marketplace-reviews.sql first, then re-run this file.';
  ELSE
    DROP POLICY IF EXISTS "pr_buyer_insert" ON program_reviews;
    EXECUTE $q$
      CREATE POLICY "pr_buyer_insert" ON program_reviews
        FOR INSERT TO authenticated
        WITH CHECK (
          buyer_id = auth.uid()
          AND EXISTS (
            SELECT 1
            FROM program_sales s
            JOIN marketplace_programs mp ON mp.id = s.marketplace_program_id
            WHERE s.marketplace_program_id = program_reviews.marketplace_program_id
              AND s.buyer_id = auth.uid()
              AND mp.coach_id = program_reviews.coach_id
          )
        )
    $q$;

    DROP POLICY IF EXISTS "pr_buyer_update" ON program_reviews;
    EXECUTE $q$
      CREATE POLICY "pr_buyer_update" ON program_reviews
        FOR UPDATE TO authenticated
        USING (buyer_id = auth.uid())
        WITH CHECK (
          buyer_id = auth.uid()
          AND EXISTS (
            SELECT 1
            FROM marketplace_programs mp
            WHERE mp.id = program_reviews.marketplace_program_id
              AND mp.coach_id = program_reviews.coach_id
          )
        )
    $q$;
    RAISE NOTICE 'program_reviews buyer policies hardened (coach_id bound to the program).';
  END IF;
END
$do$;

-- ── MED — pin search_path on the SECURITY DEFINER self-publish guard ──────────
-- Just add the config to the EXISTING function (no body change, no trigger change).
-- Guarded so it no-ops cleanly if the function isn't in the DB yet.
DO $do$
BEGIN
  IF to_regprocedure('public.mp_prevent_self_publish()') IS NOT NULL THEN
    ALTER FUNCTION public.mp_prevent_self_publish() SET search_path = public;
    RAISE NOTICE 'mp_prevent_self_publish search_path pinned to public.';
  ELSE
    RAISE NOTICE 'mp_prevent_self_publish not present — skipping search_path pin. Run migration-rls-hardening.sql first, then re-run this file.';
  END IF;
END
$do$;

-- ============================================================
-- VERIFICATION (run after applying; all should hold)
--
-- 1. Both review policies now reference marketplace_programs (the coach binding):
--    SELECT policyname, with_check
--      FROM pg_policies
--     WHERE tablename = 'program_reviews'
--       AND policyname IN ('pr_buyer_insert','pr_buyer_update');
--    -- expect with_check text to contain "marketplace_programs" + "coach_id".
--
-- 2. The self-publish guard now pins search_path:
--    SELECT proname, proconfig
--      FROM pg_proc
--     WHERE proname = 'mp_prevent_self_publish';
--    -- expect proconfig to contain "search_path=public".
--
-- 3. Manual negative test (as a buyer who bought program P from coach A):
--    -- inserting a review for P with coach_id = <coach B> must FAIL RLS now.
-- ============================================================
