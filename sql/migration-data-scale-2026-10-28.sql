-- migration-data-scale-2026-10-28.sql — POWALIFTA. The Monday report reads a block's planned sessions,
-- not the block.
--
-- send-weekly-digest's coach jobs (the Monday report, Thursday's missed-sessions push) need one number
-- per lifter from their program: the sessions planned this week (coach-report.js plannedPerWeek: the
-- days with work in the first week that still has a set to do; 0 for a finished block). Until now
-- they read every coached lifter's whole program JSON on the platform to work it out. This works it
-- out in the database:
--   public.program_planned_per_week(weeks jsonb) → integer   plannedPerWeek, in SQL (immutable)
--   public.programs_planned(public.programs)     → integer   the same for a programs row: a computed
--                                                             field PostgREST serves as a column
-- so the edge function asks for  select=athlete_id,coach_id,updated_at,planned:programs_planned.
-- Same answers as plannedPerWeek on well-formed blocks (PGlite-tested against coach-report.js,
-- truthiness and all: a set counts as to do unless it is completed or skipped; a block saved as a
-- JSON string is parsed once). Where plannedPerWeek would throw on a malformed block (a null
-- exercise, sets that aren't a list), these skip the odd part and still answer.
--
-- Only the cron's edge function (service_role) runs them; the app never does.
-- Idempotent: run it twice, same result. One transaction. No table, column or policy changes.
-- Rollback (if ever needed):
--   drop function if exists public.programs_planned(public.programs);
--   drop function if exists public.program_planned_per_week(jsonb);
-- The edge function copes before this runs (a missing computed field is PostgREST's 42703): it reads
-- the block's JSON as before, 25 lifters a read, and drops it page by page.
-- STATUS-check.sql row 56.
begin;

do $$
begin
  if to_regclass('public.programs') is null then
    raise exception 'public.programs is missing: run this in the POWALIFTA project.';
  end if;
end $$;

create or replace function public.program_planned_per_week(p_weeks jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_weeks jsonb := p_weeks;
  w jsonb;
  d jsonb;
  n_days integer;
  is_open boolean;
begin
  -- A block saved as a JSON string (an old client): parsed once, like plannedPerWeek's JSON.parse.
  if v_weeks is not null and jsonb_typeof(v_weeks) = 'string' then
    begin
      v_weeks := (v_weeks #>> '{}')::jsonb;
    exception when others then
      return 0;
    end;
  end if;
  if v_weeks is null or jsonb_typeof(v_weeks) <> 'array' then
    return 0;
  end if;
  for w in select x.value from jsonb_array_elements(v_weeks) as x(value) loop
    n_days := 0;
    is_open := false;
    if jsonb_typeof(w) = 'object' and jsonb_typeof(w -> 'days') = 'array' then
      for d in select y.value from jsonb_array_elements(w -> 'days') as y(value) loop
        continue when jsonb_typeof(d) is distinct from 'object' or jsonb_typeof(d -> 'exercises') is distinct from 'array';
        -- A day with work: an exercise holding a list with at least one set in it.
        continue when not exists (
          select 1 from jsonb_array_elements(d -> 'exercises') as e(value)
          where jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'sets') = 'array' and e.value -> 'sets' <> '[]'::jsonb);   -- (no array-only function: SQL needn't check the type first)
        n_days := n_days + 1;
        -- Still to do: a set (JavaScript-truthy) that isn't completed and isn't skipped (both JS-falsy).
        if not is_open then
          is_open := exists (
            select 1
            from jsonb_array_elements(d -> 'exercises') as e(value),
                 jsonb_array_elements(case when jsonb_typeof(e.value -> 'sets') = 'array' then e.value -> 'sets' else '[]'::jsonb end) as s(value)
            -- JavaScript truthiness of a JSON value: false for null, false, 0, "" and a missing key (SQL NULL).
            where (case jsonb_typeof(s.value) when 'boolean' then s.value = 'true'::jsonb when 'number' then s.value <> '0'::jsonb
                     when 'string' then s.value <> '""'::jsonb when 'object' then true when 'array' then true else false end)
              and not (case jsonb_typeof(s.value -> 'completed') when 'boolean' then s.value -> 'completed' = 'true'::jsonb when 'number' then s.value -> 'completed' <> '0'::jsonb
                     when 'string' then s.value -> 'completed' <> '""'::jsonb when 'object' then true when 'array' then true else false end)
              and not (case jsonb_typeof(s.value -> 'skipped') when 'boolean' then s.value -> 'skipped' = 'true'::jsonb when 'number' then s.value -> 'skipped' <> '0'::jsonb
                     when 'string' then s.value -> 'skipped' <> '""'::jsonb when 'object' then true when 'array' then true else false end));
        end if;
      end loop;
    end if;
    if is_open then
      return n_days;
    end if;
  end loop;
  return 0;
end;
$$;

comment on function public.program_planned_per_week(jsonb) is
  'coach-report.js plannedPerWeek in SQL: the sessions a block plans this week (days with work in the first week with a set still to do; 0 when finished). send-weekly-digest only.';

-- A computed field: GET /programs?select=athlete_id,planned:programs_planned
create or replace function public.programs_planned(p public.programs)
returns integer
language sql
immutable
set search_path = ''
as $$
  select public.program_planned_per_week(p.weeks);
$$;

comment on function public.programs_planned(public.programs) is
  'The sessions this program plans this week (program_planned_per_week of its weeks), served by PostgREST as a column. send-weekly-digest only.';

-- Only the cron's edge function (service_role). New functions are executable by PUBLIC, and Supabase
-- grants anon / authenticated on everything in public: take all three away.
revoke all on function public.program_planned_per_week(jsonb) from public, anon, authenticated;
revoke all on function public.programs_planned(public.programs) from public, anon, authenticated;
grant execute on function public.program_planned_per_week(jsonb) to service_role;
grant execute on function public.programs_planned(public.programs) to service_role;

commit;

-- Verify:
--   select has_function_privilege('authenticated', 'public.programs_planned(public.programs)', 'execute');   -- false
--   select athlete_id, public.programs_planned(p) from public.programs p limit 5;
--   (as the edge function) GET /rest/v1/programs?select=athlete_id,planned:programs_planned&limit=5
