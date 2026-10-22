-- migration-program-integrity-2026-10-22.sql — POWALIFTA (brief M0a, data integrity, no UI)
-- Two people writing one program can no longer wipe each other's work.
--
--   programs.rev            a version number the server bumps on every update. The app sends the
--                           rev it last read; when the row has moved on since, the update fails with
--                           'powa_rev_conflict' (SQLSTATE PT409, HTTP 409) and the app refetches,
--                           merges both edits and tries again. An update that doesn't send rev
--                           (an older app build, the SQL editor, another function) still works and
--                           still bumps it, so nothing that runs today breaks.
--   log_program_set(...)    logging a set patches that one set inside programs.weeks instead of
--                           writing the whole blob, so a lifter's offline replay can never undo a
--                           coach's edit. Security invoker: the caller's own RLS decides, exactly
--                           as for a whole-program update.
--   profiles.unit           the lifter's kg / lb choice, so a coach's loads can round in it.
--   workout_logs.gear       raw / equipped tags per set ('sleeves', 'wraps', 'shirt', ...). Nullable,
--                           unused by the app for now (open question 3: capture the column first).
--
-- Run any time (the app copes before it runs: no rev = no compare-and-swap, no function = the old
-- whole-program save). Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
alter table public.programs add column if not exists rev bigint not null default 0;

create or replace function public.programs_rev_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- A writer that sent a rev expects the row to still be at that rev.
  if new.rev is distinct from old.rev then
    raise exception 'powa_rev_conflict' using errcode = 'PT409',
      detail = 'program ' || old.id || ' is at rev ' || old.rev || ', the write expected ' || coalesce(new.rev::text, 'null');
  end if;
  new.rev := old.rev + 1;
  return new;
end;
$$;
drop trigger if exists trg_programs_rev on public.programs;
create trigger trg_programs_rev before update on public.programs
  for each row execute function public.programs_rev_guard();

-- 2 -----------------------------------------------------------------------------------
-- p_path = [week id, day id, exercise id, set id or set index]. p_patch = the logged fields of that
-- one set; a null value removes the field. Returns the program's new rev, or null when the set
-- isn't there any more (the coach removed it) or the caller can't see the program.
create or replace function public.log_program_set(p_program_id uuid, p_path text[], p_patch jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_weeks jsonb;
  v_rev   bigint;
  wi int; di int; ei int; si int;
  v_set   jsonb;
  v_key   text;
  v_drop  text[];
  v_want  text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch must be an object' using errcode = '22023';
  end if;
  if length(p_patch::text) > 4000 then
    raise exception 'patch too large' using errcode = '22023';
  end if;
  if p_path is null or coalesce(array_length(p_path, 1), 0) <> 4 then
    raise exception 'path must be [week, day, exercise, set]' using errcode = '22023';
  end if;
  -- Only what logging a set changes: never the prescription, never anything outside the set.
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (array['completed', 'skipped', 'missed', 'actualRpe', 'completedAt', 'lastLogId',
                               'note', 'weight', 'reps', 'plannedWeight', 'plannedReps'])) then
      raise exception 'field % cannot be logged', v_key using errcode = '22023';
    end if;
    -- And only the right shape for each, so a bad client can't leave a set the app reads as NaN.
    -- (A CASE inside IF's condition would end at its first THEN in plpgsql: hence the variable.)
    v_want := case when v_key in ('weight', 'reps', 'actualRpe', 'plannedWeight', 'plannedReps') then 'number'
                   when v_key in ('completed', 'skipped', 'missed') then 'boolean'
                   else 'string' end;
    if jsonb_typeof(p_patch->v_key) not in ('null', v_want) then
      raise exception 'field % has the wrong type', v_key using errcode = '22023';
    end if;
  end loop;

  select weeks into v_weeks from public.programs where id = p_program_id for update;
  if not found or v_weeks is null or jsonb_typeof(v_weeks) <> 'array' then return null; end if;

  select x.o - 1 into wi from jsonb_array_elements(v_weeks) with ordinality as x(v, o)
   where x.v->>'id' = p_path[1] limit 1;
  if wi is null then return null; end if;
  select x.o - 1 into di from jsonb_array_elements(coalesce(v_weeks->wi->'days', '[]')) with ordinality as x(v, o)
   where x.v->>'id' = p_path[2] limit 1;
  if di is null then return null; end if;
  select x.o - 1 into ei from jsonb_array_elements(coalesce(v_weeks->wi->'days'->di->'exercises', '[]')) with ordinality as x(v, o)
   where x.v->>'id' = p_path[3] limit 1;
  if ei is null then return null; end if;
  -- The set by its id; an older set without one by its index.
  select x.o - 1 into si from jsonb_array_elements(coalesce(v_weeks->wi->'days'->di->'exercises'->ei->'sets', '[]')) with ordinality as x(v, o)
   where x.v->>'id' = p_path[4] limit 1;
  if si is null and p_path[4] ~ '^[0-9]{1,3}$' then
    si := p_path[4]::int;
    if jsonb_typeof(v_weeks->wi->'days'->di->'exercises'->ei->'sets'->si) is distinct from 'object' then return null; end if;
    -- An index only addresses a set that has no id of its own.
    if (v_weeks->wi->'days'->di->'exercises'->ei->'sets'->si) ? 'id' then return null; end if;
  end if;
  if si is null then return null; end if;

  v_set := v_weeks->wi->'days'->di->'exercises'->ei->'sets'->si;
  select coalesce(array_agg(key), '{}') into v_drop from jsonb_each(p_patch) where value = 'null'::jsonb;
  v_set := (v_set || jsonb_strip_nulls(p_patch)) - v_drop;

  update public.programs
     set weeks = jsonb_set(weeks, array[wi::text, 'days', di::text, 'exercises', ei::text, 'sets', si::text], v_set),
         updated_at = now()
   where id = p_program_id
   returning rev into v_rev;
  return v_rev;
end;
$$;
revoke all on function public.log_program_set(uuid, text[], jsonb) from public, anon;
grant execute on function public.log_program_set(uuid, text[], jsonb) to authenticated;

-- 3 -----------------------------------------------------------------------------------
alter table public.profiles add column if not exists unit text;
alter table public.profiles drop constraint if exists profiles_unit_check;
alter table public.profiles add constraint profiles_unit_check check (unit is null or unit in ('kg', 'lb'));

-- 4 -----------------------------------------------------------------------------------
alter table public.workout_logs add column if not exists gear text[];
alter table public.workout_logs drop constraint if exists workout_logs_gear_check;
alter table public.workout_logs add constraint workout_logs_gear_check
  check (gear is null or (cardinality(gear) <= 6
         and gear <@ array['raw', 'sleeves', 'wraps', 'belt', 'suit', 'shirt', 'briefs', 'straps']::text[]));

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'programs' and column_name = 'rev';
--   select proname, prosecdef from pg_proc where proname = 'log_program_set';   -- prosecdef false (invoker)
