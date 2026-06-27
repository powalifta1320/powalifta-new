-- ============================================================
-- POWALIFTA — Program marketplace
-- Coaches publish programs as one-time purchases. POWALIFTA collects
-- payments, takes 20% platform fee, pays out 80% to coaches monthly.
-- Run once in Supabase SQL Editor (after migration-self-coached.sql).
-- ============================================================

-- ----- 1) marketplace_programs ----------------------------------------------
-- A program a coach has published for sale.
-- program_payload is a SNAPSHOT of the program data taken at publish time —
-- if the coach edits their master template later, this snapshot doesn't change,
-- so existing buyers' copies are unaffected.
CREATE TABLE IF NOT EXISTS marketplace_programs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title             text NOT NULL,
  description       text,
  tier              text NOT NULL CHECK (tier IN ('short', 'block', 'premium')),
  price_cents       int NOT NULL CHECK (price_cents > 0),
  week_count        int DEFAULT 0,
  status            text NOT NULL DEFAULT 'pending_review'
                       CHECK (status IN ('pending_review', 'published', 'unpublished', 'rejected')),
  ls_product_id     text,           -- Lemon Squeezy product ID (set by admin)
  ls_variant_id    text,            -- Lemon Squeezy variant ID
  ls_checkout_url  text,            -- Direct checkout link (set by admin)
  program_payload  jsonb NOT NULL,  -- Frozen snapshot of the full program
  sold_count       int NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketplace_programs_status_idx ON marketplace_programs(status);
CREATE INDEX IF NOT EXISTS marketplace_programs_coach_idx ON marketplace_programs(coach_id);

ALTER TABLE marketplace_programs ENABLE ROW LEVEL SECURITY;

-- Anyone can read PUBLISHED programs (browse the marketplace anonymously).
DROP POLICY IF EXISTS "mp_public_read_published" ON marketplace_programs;
CREATE POLICY "mp_public_read_published" ON marketplace_programs
  FOR SELECT
  USING (status = 'published');

-- Coaches can read their own (any status) and update them.
DROP POLICY IF EXISTS "mp_coach_own_read" ON marketplace_programs;
CREATE POLICY "mp_coach_own_read" ON marketplace_programs
  FOR SELECT
  USING (coach_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "mp_coach_insert" ON marketplace_programs;
CREATE POLICY "mp_coach_insert" ON marketplace_programs
  FOR INSERT
  WITH CHECK (coach_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "mp_coach_update_own" ON marketplace_programs;
CREATE POLICY "mp_coach_update_own" ON marketplace_programs
  FOR UPDATE
  USING (coach_id = auth.uid() OR is_admin())
  WITH CHECK (coach_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "mp_coach_delete_own" ON marketplace_programs;
CREATE POLICY "mp_coach_delete_own" ON marketplace_programs
  FOR DELETE
  USING (coach_id = auth.uid() OR is_admin());

-- Coaches CANNOT self-publish (status='published' is admin-only).
-- A trigger enforces this so the coach can only set 'pending_review' or 'unpublished'.
CREATE OR REPLACE FUNCTION mp_prevent_self_publish()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow admin / service_role to do anything
  IF auth.uid() IS NULL OR is_admin() THEN RETURN NEW; END IF;
  -- Coach cannot directly set status to 'published' or 'rejected'
  IF NEW.status IN ('published', 'rejected') AND
     (OLD.status IS DISTINCT FROM NEW.status) THEN
    RAISE EXCEPTION 'Only admin can publish or reject a marketplace program.';
  END IF;
  -- Coach cannot touch sold_count or ls_* fields
  IF NEW.sold_count IS DISTINCT FROM OLD.sold_count
     OR NEW.ls_product_id IS DISTINCT FROM OLD.ls_product_id
     OR NEW.ls_variant_id IS DISTINCT FROM OLD.ls_variant_id
     OR NEW.ls_checkout_url IS DISTINCT FROM OLD.ls_checkout_url THEN
    RAISE EXCEPTION 'These fields are managed by admin / webhook only.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS mp_prevent_self_publish_trig ON marketplace_programs;
CREATE TRIGGER mp_prevent_self_publish_trig
  BEFORE UPDATE ON marketplace_programs
  FOR EACH ROW EXECUTE FUNCTION mp_prevent_self_publish();

-- ----- 2) program_sales ----------------------------------------------
-- Every successful purchase logs one row here. Used for:
--   - The buyer's "my programs" history
--   - The coach's earnings dashboard
--   - Admin payout tracking
CREATE TABLE IF NOT EXISTS program_sales (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_program_id uuid NOT NULL REFERENCES marketplace_programs(id),
  buyer_id             uuid NOT NULL REFERENCES profiles(id),
  coach_id             uuid NOT NULL REFERENCES profiles(id),
  amount_cents         int NOT NULL,
  platform_fee_cents   int NOT NULL,
  coach_payout_cents   int NOT NULL,
  payout_status        text NOT NULL DEFAULT 'pending'
                          CHECK (payout_status IN ('pending', 'paid', 'cancelled')),
  paid_at              timestamptz,
  ls_order_id          text UNIQUE,
  ls_event_id          text UNIQUE,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS program_sales_buyer_idx ON program_sales(buyer_id);
CREATE INDEX IF NOT EXISTS program_sales_coach_idx ON program_sales(coach_id);
CREATE INDEX IF NOT EXISTS program_sales_payout_idx ON program_sales(payout_status, coach_id);

ALTER TABLE program_sales ENABLE ROW LEVEL SECURITY;

-- Buyer can see their own purchases
DROP POLICY IF EXISTS "ps_buyer_read" ON program_sales;
CREATE POLICY "ps_buyer_read" ON program_sales
  FOR SELECT
  USING (buyer_id = auth.uid());

-- Coach can see sales of their programs (for earnings dashboard)
DROP POLICY IF EXISTS "ps_coach_read" ON program_sales;
CREATE POLICY "ps_coach_read" ON program_sales
  FOR SELECT
  USING (coach_id = auth.uid());

-- Admin sees + manages everything (for payout admin)
DROP POLICY IF EXISTS "ps_admin_all" ON program_sales;
CREATE POLICY "ps_admin_all" ON program_sales
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Only service_role (webhook) inserts new sales — neither buyer nor coach should
-- write directly. The webhook function bypasses RLS by using service_role.

-- ============================================================
-- Verification queries — uncomment after running
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('marketplace_programs', 'program_sales');
-- SELECT polname FROM pg_policy WHERE polrelid IN ('marketplace_programs'::regclass, 'program_sales'::regclass);
