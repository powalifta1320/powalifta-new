-- ============================================================
-- migration-rls-hardening-2.sql  —  security-audit hardening pass #2
--
-- RUN AFTER migration-marketplace-reviews.sql, migration-marketplace.sql,
-- and migration-rls-hardening.sql (this file re-creates objects they define).
-- Idempotent (DROP ... IF EXISTS / CREATE OR REPLACE) — safe to re-run.
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
-- INSERT: buyer, a real sale for the program, AND coach_id = the program's coach.
DROP POLICY IF EXISTS "pr_buyer_insert" ON program_reviews;
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
        AND mp.coach_id = program_reviews.coach_id     -- the binding the old policy lacked
    )
  );

-- UPDATE: own review, and the (possibly edited) coach_id still matches the program.
DROP POLICY IF EXISTS "pr_buyer_update" ON program_reviews;
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
  );

-- ── MED — pin search_path on the SECURITY DEFINER self-publish guard ──────────
-- Re-create the function body verbatim + `SET search_path = public`. The trigger
-- already bound to this function name keeps working (no trigger change needed).
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
    IF coalesce(NEW.sold_count, 0) <> 0
       OR NEW.ls_product_id  IS NOT NULL
       OR NEW.ls_variant_id  IS NOT NULL
       OR NEW.ls_checkout_url IS NOT NULL THEN
      RAISE EXCEPTION 'These fields are managed by admin / webhook only.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
