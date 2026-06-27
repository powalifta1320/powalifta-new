-- ============================================================
-- POWALIFTA — marketplace programs: coach reference 1RMs
-- So a sold program can be rescaled to each buyer's strength.
-- The coach enters their reference S/B/D 1RMs at publish time
-- (in kg, internally), and the buyer enters theirs at claim time;
-- weights are scaled by lift category.
-- Run once in Supabase SQL Editor.
-- ============================================================

ALTER TABLE marketplace_programs
  ADD COLUMN IF NOT EXISTS reference_1rms jsonb;

-- Shape: {"squat": 200, "bench": 140, "deadlift": 250}  (all values in kg)
-- Any missing key means the program won't rescale that lift category
-- (the coach left it blank → buyer's weights stay as the coach wrote them).

-- Verification (uncomment to check):
-- SELECT id, title, reference_1rms FROM marketplace_programs;
