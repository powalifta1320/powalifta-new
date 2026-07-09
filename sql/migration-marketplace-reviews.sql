-- ============================================================
-- POWALIFTA — Marketplace reviews / ratings
--
-- Buyers of a marketplace program can leave a 1–5 star rating + written
-- review. Reviews are PUBLIC (anyone browsing the marketplace or a coach
-- profile sees them), but only a verified BUYER of that program can write
-- one — enforced in RLS via an EXISTS check against program_sales.
--
-- One review per buyer per program (UNIQUE) — writing again UPSERTs.
--
-- Denormalised columns so public/anon viewers don't need to read `profiles`
-- or `program_sales`:
--   coach_id   — lets a coach profile aggregate ratings across their catalog
--   buyer_name — reviewer display name shown publicly (snapshot at write time)
--
-- Run once in Supabase SQL Editor (after migration-marketplace.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS program_reviews (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_program_id uuid NOT NULL REFERENCES marketplace_programs(id) ON DELETE CASCADE,
  coach_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_id               uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  buyer_name             text,
  rating                 int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body                   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marketplace_program_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS program_reviews_program_idx ON program_reviews(marketplace_program_id);
CREATE INDEX IF NOT EXISTS program_reviews_coach_idx   ON program_reviews(coach_id);

ALTER TABLE program_reviews ENABLE ROW LEVEL SECURITY;

-- Public read — ratings are social proof, visible to everyone (even logged-out).
DROP POLICY IF EXISTS "pr_public_read" ON program_reviews;
CREATE POLICY "pr_public_read" ON program_reviews
  FOR SELECT
  USING (true);

-- A buyer may INSERT a review only for a program they actually purchased,
-- and only as themselves. The EXISTS check ties the review to a real sale.
DROP POLICY IF EXISTS "pr_buyer_insert" ON program_reviews;
CREATE POLICY "pr_buyer_insert" ON program_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM program_sales s
      WHERE s.marketplace_program_id = program_reviews.marketplace_program_id
        AND s.buyer_id = auth.uid()
    )
  );

-- A buyer may edit/delete their OWN review.
DROP POLICY IF EXISTS "pr_buyer_update" ON program_reviews;
CREATE POLICY "pr_buyer_update" ON program_reviews
  FOR UPDATE TO authenticated
  USING (buyer_id = auth.uid())
  WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS "pr_buyer_delete" ON program_reviews;
CREATE POLICY "pr_buyer_delete" ON program_reviews
  FOR DELETE TO authenticated
  USING (buyer_id = auth.uid() OR is_admin());

-- ============================================================
-- Verification after running:
--   SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.program_reviews'::regclass;
--
-- Aggregate sanity (avg rating per program):
--   SELECT marketplace_program_id, round(avg(rating),2) avg, count(*) n
--     FROM program_reviews GROUP BY 1;
-- ============================================================
