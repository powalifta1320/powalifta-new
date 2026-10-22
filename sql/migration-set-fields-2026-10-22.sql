-- migration-set-fields-2026-10-22.sql — POWALIFTA
-- Custom set fields: tempo, pauses, bands and chains, and a coach's own columns ("Bar: SSB").
--
-- Where things live:
--   * The VALUES ride on each set inside programs.weeks (tempo, pause, pauseAt, acc, accTxt,
--     accKg, cx). They need no column: every copy of a set (templates, the next block, past
--     blocks, a bought program) carries them, and the lifter reads them straight off the set.
--   * programs.set_fields holds which fields the program's builder shows:
--       { "on": ["tempo", "pause", "acc"], "cols": ["Bar", "Belt"] }
--     Why a column and not inside weeks: weeks is an array every reader walks week by week
--     (the lifter's app, past blocks, the marketplace, exports); a settings object in it would
--     be a fake week to every one of them.
--
-- Who changes set_fields: the program's coach, or a lifter on a program they write themselves.
-- A coached lifter saving a logged set sends the program back; the trigger keeps the coach's
-- set_fields as they were (a stale copy on the phone can't undo the coach's choice).
--
-- Run any time: until it runs, the app keeps the builder's choice on the coach's device and
-- works it out from the sets. Idempotent; one transaction.
begin;

alter table public.programs add column if not exists set_fields jsonb;
alter table public.programs drop constraint if exists programs_set_fields_shape;
alter table public.programs add constraint programs_set_fields_shape
  check (set_fields is null or (jsonb_typeof(set_fields) = 'object' and octet_length(set_fields::text) <= 2000));

create or replace function public.guard_program_set_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  -- The athlete of a program someone else coaches: their save never changes the builder's fields.
  if auth.uid() is not null and old.athlete_id = auth.uid()
     and old.coach_id is not null and old.coach_id is distinct from auth.uid() then
    new.set_fields := old.set_fields;
  end if;
  return new;
end;
$$;
drop trigger if exists programs_guard_set_fields on public.programs;
create trigger programs_guard_set_fields
  before update on public.programs
  for each row execute function public.guard_program_set_fields();

commit;

-- Verify:
--   select column_name, data_type from information_schema.columns
--    where table_schema = 'public' and table_name = 'programs' and column_name = 'set_fields';   -- jsonb
