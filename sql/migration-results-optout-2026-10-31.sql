-- migration-results-optout-2026-10-31.sql — POWALIFTA. STATUS-check.sql row 62.
-- Results cards (night C: a coach's "My lifters gained 7.5 kg this block" and this week's PR wall, made to post on
-- Instagram) name each lifter by first name and initial. A lifter can keep their name off them (the owner, 31 Oct:
-- "lifters can opt out"): the block card then says "A lifter" for them, still counted in the average, and the PR wall
-- leaves them off. The switch is the lifter's: You › Community › Name on your coach's posts.
--
-- The shape:
--   profiles.name_on_results   the lifter's choice: on (true) until they turn it off
--
-- Who changes it: only the lifter (their own row, through profiles_update), an admin, or the service role. A coach can
-- update a lifter's row only to take them off the roster (profiles_update's "coach_id is null" check); the guard keeps
-- the lifter's choice through that too, so nobody but the lifter can put their name back on a post.
-- Idempotent: safe to run twice. Row 60 (two-factor) needs nothing here: no new table.
begin;

alter table public.profiles add column if not exists name_on_results boolean not null default true;

create or replace function public.profiles_results_name_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.name_on_results is distinct from old.name_on_results
     and (select auth.uid()) is not null
     and (select auth.uid()) <> old.id
     and not coalesce((select public.is_admin()), false) then
    new.name_on_results := old.name_on_results;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profiles_results_name_guard on public.profiles;
create trigger trg_profiles_results_name_guard before update of name_on_results on public.profiles
  for each row execute function public.profiles_results_name_guard();
revoke all on function public.profiles_results_name_guard() from public, anon, authenticated;

commit;

-- Verify:
--   select count(*) filter (where not name_on_results) as off from public.profiles;   -- 0 until a lifter turns it off
--   select tgname from pg_trigger where tgname = 'trg_profiles_results_name_guard';
