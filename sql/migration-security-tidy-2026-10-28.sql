-- migration-security-tidy-2026-10-28.sql — POWALIFTA. What Supabase's security advisor still flagged on 28 Oct, tidied.
--
-- 1. Trigger functions are never called through the API, and a trigger fires without EXECUTE (PostgreSQL checks
--    it only when the trigger is created). Twelve SECURITY DEFINER trigger functions (the clubs', the marketplace's
--    self-publish guard, the sign-up trigger handle_new_user) and the event-trigger function rls_auto_enable() were
--    still executable by anon and signed-in users: no longer. The nine plain trigger functions lose EXECUTE too,
--    for the same reason. Only functions that really return trigger / event_trigger are touched.
-- 2. club_role(uuid) and is_club_member(uuid) are read only by the clubs' policies, which are for signed-in users:
--    anon loses EXECUTE, signed-in users keep it. gen_referral_code() likewise: a lifter's own profile insert (the
--    social sign-in fallback, db.js _finishSocialSignupFallback) fires set_referral_code, which calls it as them.
--    Kept as they are, on purpose:
--      is_admin()             policies that apply to every role call it (the marketplace browse among them), so an
--                             anon read would fail without it; it only ever answers for the caller.
--      invite_preview(text)   the invite page, for signed-out visitors (rate-limited inside).
--      list_public_coaches()  the public coach list.
-- 3. A fixed search_path on the ten functions that had none. All are SECURITY INVOKER and use only public objects
--    and built-ins, so `public` changes nothing they resolve.
-- 4. ai_chat_usage and edge_rate_limits belong to the edge functions (service role). RLS was on with no policy,
--    which already shut everyone else out; now it's said out loud: one deny-all policy each, and no table rights
--    for anon or signed-in users.
-- Not touched: pg_net sits in public (moving it means a drop and recreate under the cron jobs); leaked-password
-- protection is a dashboard switch (Authentication › Settings).
--
-- Idempotent, one transaction; a function this database doesn't have is skipped. STATUS-check.sql row 54.
-- Undo, if ever needed: grant execute on function public.<name>(...) to anon, authenticated;
--   alter function public.<name>(...) reset search_path;
--   drop policy "service role only" on public.ai_chat_usage; drop policy "service role only" on public.edge_rate_limits;
begin;

do $$
declare
  f text;
  p regprocedure;
begin
  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles is missing: run this in the POWALIFTA project.';
  end if;

  -- 1. Trigger-only functions: nobody calls them, so nobody needs EXECUTE.
  foreach f in array array[
    'public.club_members_after_join()', 'public.club_members_after_leave()', 'public.club_members_ban_on_remove()',
    'public.club_members_count()', 'public.club_members_end_buddy()', 'public.club_members_guard()',
    'public.club_members_owner_stays()', 'public.club_posts_stamp()', 'public.club_reports_stamp()',
    'public.clubs_guard()', 'public.handle_new_user()', 'public.mp_prevent_self_publish()', 'public.rls_auto_enable()',
    'public.guard_coach_request_update()', 'public.guard_form_checks_update()', 'public.guard_messages_update()',
    'public.guard_profiles_coach_detach()', 'public.guard_session_notes_update()', 'public.lock_referral_cols()',
    'public.prevent_self_subscription_change()', 'public.set_referral_code()', 'public.touch_email_preferences()']
  loop
    p := to_regprocedure(f);
    if p is not null and exists (select 1 from pg_proc
                                  where oid = p and prorettype in ('trigger'::regtype, 'event_trigger'::regtype)) then
      execute format('revoke all on function %s from public, anon, authenticated', p);
    end if;
  end loop;

  -- 2. Signed-in users only.
  foreach f in array array['public.club_role(uuid)', 'public.is_club_member(uuid)', 'public.gen_referral_code()']
  loop
    p := to_regprocedure(f);
    if p is not null then
      execute format('revoke all on function %s from public, anon', p);
      execute format('grant execute on function %s to authenticated, service_role', p);
    end if;
  end loop;

  -- 3. A fixed search_path.
  foreach f in array array[
    'public.guard_coach_request_update()', 'public.guard_form_checks_update()', 'public.guard_messages_update()',
    'public.guard_profiles_coach_detach()', 'public.guard_session_notes_update()', 'public.lock_referral_cols()',
    'public.prevent_self_subscription_change()', 'public.set_referral_code()', 'public.touch_email_preferences()',
    'public.gen_referral_code()']
  loop
    p := to_regprocedure(f);
    if p is not null then
      execute format('alter function %s set search_path = public', p);
    end if;
  end loop;

  -- 4. The edge functions' own tables.
  foreach f in array array['public.ai_chat_usage', 'public.edge_rate_limits']
  loop
    if to_regclass(f) is not null then
      execute format('revoke all on table %s from anon, authenticated', f);
      execute format('drop policy if exists "service role only" on %s', f);
      execute format('create policy "service role only" on %s as permissive for all to anon, authenticated '
                     'using (false) with check (false)', f);
    end if;
  end loop;
end $$;

commit;

-- Verify:
--   select p.oid::regprocedure, has_function_privilege('anon', p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as signed_in, p.proconfig
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and (p.prosecdef or p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype))
--    order by 1;
--   Supabase › Advisors › Security: the anon / signed-in SECURITY DEFINER warnings now list only the RPCs the app
--   calls and the policy helpers; no "function search path mutable", no "RLS enabled, no policy".
