-- ============================================================
-- migration-push-platform.sql  —  native push support (#32)
--
-- Adds a `platform` column to push_subscriptions and relaxes the Web-Push-only
-- key columns so NATIVE device tokens (APNs on iOS / FCM on Android) can live in
-- the same table. A native row is: endpoint = the device token, platform =
-- 'ios' | 'android', p256dh/auth = NULL (those are Web Push only).
--
-- RUN AFTER migration-push-subscriptions.sql. Idempotent — safe to re-run.
-- The client (DB.saveNativePushToken) FAILS OPEN if this hasn't run yet, so
-- deploy order doesn't matter.
-- ============================================================

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'web';

-- Web Push hands us p256dh + auth; native tokens have neither. Make them
-- nullable so native rows are legal. Existing web rows are unaffected.
ALTER TABLE push_subscriptions ALTER COLUMN p256dh DROP NOT NULL;
ALTER TABLE push_subscriptions ALTER COLUMN auth   DROP NOT NULL;

-- Optional: constrain platform to the known set (kept permissive — no hard CHECK,
-- matching the codebase convention of client-side enums).
CREATE INDEX IF NOT EXISTS push_subs_platform_idx ON push_subscriptions(platform);

-- ============================================================
-- VERIFICATION
--   SELECT column_name, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'push_subscriptions'
--      AND column_name IN ('platform','p256dh','auth');
--   -- expect: platform NOT NULL default 'web'; p256dh + auth is_nullable = YES.
-- ============================================================
