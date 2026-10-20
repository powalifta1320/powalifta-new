-- AUDIT-signup-trigger.sql — NOT a migration. Read-only check from the 2026-10-20 security pass.
--
-- The function that turns a new auth user into a profiles row lives only in the live
-- database (it isn't in git). db.js sends user_type in the sign-up metadata, which the
-- client controls, and the INSERT guard (migration-rls-hardening-3) steps aside when
-- auth.uid() is null — exactly the context that trigger runs in. If the trigger copies the
-- metadata as-is, a sign-up with {user_type:'admin', is_admin:true, subscription_tier:
-- 'premium', coach_id:'<uuid>'} would land as written.
--
-- 1. See what the trigger does:
select t.tgname, p.proname, pg_get_functiondef(p.oid)
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'auth.users'::regclass
   and not t.tgisinternal;

-- 2. It must set, from raw_user_meta_data, ONLY:
--      user_type := case when (meta->>'user_type') = 'coach' then 'coach' else 'athlete' end
--    and hard-code is_admin = false, subscription_tier = 'free', coach_id = null,
--    ignoring every other key. If it doesn't, edit the function body accordingly
--    (CREATE OR REPLACE FUNCTION ... keeping its name) and re-run this file to confirm.
--
-- 3. Prove it from a spare account: sign up with the metadata above, then
--      select user_type, is_admin, subscription_tier, coach_id from public.profiles where id = '<new uid>';
--    expected: athlete | false | free | null.
