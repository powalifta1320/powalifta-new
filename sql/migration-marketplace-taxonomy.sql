-- ============================================================
-- POWALIFTA — marketplace programs: training-focus category
-- Adds a real taxonomy ON TOP of `tier` (which is length/format:
-- short cycle / full block / premium). `category` is the training
-- intent of the program (max strength, hypertrophy, peaking, etc.)
-- so buyers can filter the marketplace by what a program is FOR,
-- not just how long it runs.
-- Nullable text, no CHECK constraint — keeps the key list
-- forward-compatible (new categories ship from the client only).
-- Run once in Supabase SQL Editor.
-- ============================================================

ALTER TABLE marketplace_programs
  ADD COLUMN IF NOT EXISTS category text;

CREATE INDEX IF NOT EXISTS idx_mp_category
  ON marketplace_programs(category);

-- Known keys (client-side source of truth — MARKET_CATEGORIES in app.js):
--   strength    → Max Strength
--   hypertrophy → Hypertrophy
--   peaking     → Peaking / Meet Prep
--   beginner    → Beginner
--   bench       → Bench Focus
--   weakpoint   → Weak-Point Focus
-- NULL means the coach published before this column existed (or skipped it);
-- such listings simply don't match a category filter but still show under "All".

-- Verification (uncomment to check):
-- SELECT id, title, tier, category FROM marketplace_programs;
