-- ============================================================
-- POWALIFTA — Web Push subscriptions
--
-- One row per browser/device the user has granted notification
-- permission on. The browser's PushManager hands us an endpoint URL
-- plus two keys (p256dh, auth); the `send-push` edge function uses
-- those to deliver a push via the VAPID protocol.
--
-- A user may have several rows (phone PWA + desktop, etc). `endpoint`
-- is globally unique, so re-subscribing the same device UPSERTs rather
-- than piling up duplicates.
--
-- RLS: a user may only see/manage THEIR OWN subscriptions. The
-- `send-push` function reads a *recipient's* rows via the service role
-- (which bypasses RLS) — clients can never read anyone else's tokens.
--
-- Run once in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subs_user_idx ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Read: only your own subscriptions.
DROP POLICY IF EXISTS "push_own_read" ON push_subscriptions;
CREATE POLICY "push_own_read" ON push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Insert: you may only register a subscription owned by yourself.
DROP POLICY IF EXISTS "push_own_insert" ON push_subscriptions;
CREATE POLICY "push_own_insert" ON push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Update: used by the upsert path when an existing endpoint re-subscribes.
DROP POLICY IF EXISTS "push_own_update" ON push_subscriptions;
CREATE POLICY "push_own_update" ON push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Delete: you can remove your own; admins can clean up any.
DROP POLICY IF EXISTS "push_own_delete" ON push_subscriptions;
CREATE POLICY "push_own_delete" ON push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR is_admin());

-- ============================================================
-- Verification after running:
--   SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.push_subscriptions'::regclass;
-- ============================================================
