-- migration-email-prefs-on-signup-2026-10-28.sql — POWALIFTA. Every account gets its email and push settings row.
--
-- migration-email-preferences.sql gave every profile that existed then a row, and the design says a missing row
-- counts as opted in; but the lifters' weekly digest reads only rows with weekly_digest = true, so everyone who
-- signed up since never got it (28 Oct: 4 lifters and 1 coach). Now:
--   1. a trigger on profiles gives each new account its row, whichever way the profile is made (the sign-up
--      trigger, the social sign-in fallback, an admin). The row is the column defaults: the digest on, product
--      mail off, every push on, a fresh unsubscribe token;
--   2. the accounts that have none get it now.
-- Nobody's choice changes: an existing row is never touched. Every digest carries the one-click unsubscribe.
-- Needs migration-email-preferences.sql. Idempotent; one transaction. STATUS-check.sql row 57.
-- Undo: drop trigger trg_profiles_email_prefs on public.profiles; drop function public.profiles_email_prefs();
begin;

do $$
begin
  if to_regclass('public.email_preferences') is null then
    raise exception 'Run migration-email-preferences.sql first: public.email_preferences is missing.';
  end if;
end $$;

-- SECURITY DEFINER so the row is made whoever creates the profile (a lifter's own fallback insert runs as them,
-- and email_preferences only lets them write their own row anyway); it writes the new profile's row and nothing else.
create or replace function public.profiles_email_prefs()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.email_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;
-- A trigger function only: nobody calls it through the API (triggers fire without EXECUTE).
revoke all on function public.profiles_email_prefs() from public, anon, authenticated;

drop trigger if exists trg_profiles_email_prefs on public.profiles;
create trigger trg_profiles_email_prefs after insert on public.profiles
  for each row execute function public.profiles_email_prefs();

insert into public.email_preferences (user_id)
select p.id from public.profiles p
on conflict (user_id) do nothing;

commit;

-- Verify:
--   select count(*) filter (where e.user_id is null) as without_row from public.profiles p
--     left join public.email_preferences e on e.user_id = p.id;            -- 0
--   select tgname from pg_trigger where tgname = 'trg_profiles_email_prefs';
