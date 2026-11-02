-- migration-coach-report-v2-2026-11-02.sql — POWALIFTA. The Monday report, version 2. STATUS-check.sql row 63.
--
-- The owner, 2 Nov, after the first real Monday run: "monday report works but can include more data if possible".
-- send-weekly-digest's Monday report (supabase/functions/_shared/coach-report.js) now also says how the team's
-- strength moved over 4 weeks, how last week's top sets felt against what was written, who wrote the coach and is
-- waiting for an answer, and whose block needs writing next. It reads those from the database as a few small
-- answers per lifter, never by paging raw sets or messages (PostgREST stops every read at 1,000 rows):
--   1. public.coach_week_stats(athletes, from, to)   as before (sessions; each lift's during and before), and each
--      lift's jsonb also carries
--        recent   the best e1rm_comp in the 28 days ending `to`, and
--        prior    the best in the 28 days before those
--      (the app's getE1RMMomentum windows, ended on the report's Sunday). Same signature, same old keys: Thursday's
--      check and the PRs read it exactly as before.
--   2. public.program_planned_per_week(weeks)        as before, except that a week the coach hasn't published yet
--      ("draft": true, the drafts feature) is skipped: it isn't the lifter's block. No week has it today.
--   3. public.program_weeks_left(weeks) → integer     the weeks from the block's current week (the first with a set
--      still to do) to its end, that week counted: 1 is the block's last week, 0 = every set done (finished),
--      null = no weeks at all. Drafts skipped.
--      public.programs_weeks_left(public.programs)    the same for a programs row: a computed field PostgREST serves
--      as a column (select=…,weeks_left:programs_weeks_left).
--   4. public.program_effort_sets(weeks, from, to)   every logged set in [from, to] with an RPE written and one felt,
--      in the block's order, as jsonb: [{ d, l, v, n, w, r, h, f }] (the day it was logged, its exercise's lift,
--      variant and name, weight, rpe, rpeHi, actualRpe; values as the block has them). coach-report.js picks each
--      day's top set per lift and places it against what was written: one definition, in JS, for the app and the
--      server. Drafts skipped.
--      public.coach_week_effort(athletes, from, to)   per program of those athletes with any such set:
--      (athlete_id, program_id, sets).
--   5. public.coach_threads_last(athletes)            per coach and lifter thread of those athletes: when the last
--      message was sent and who sent it. Never the words: the report never quotes a message.
--   6. public.powa_js_truthy(jsonb)                   JavaScript's truthiness of a JSON value (false for null, false,
--      0, "" and a missing key), so 3 and 4 read a set's completed, skipped, attempt, rir and completedAt exactly
--      as the app's JavaScript does.
-- Each answers as coach-report.js does on the same blocks, logs and messages (PGlite-tested against it:
-- test/coach-report-sql.test.mjs). Where the old JS threw on a malformed block (a null exercise, sets that aren't a
-- list), these skip the odd part and still answer, and so does the JS now.
--
-- Only the cron's edge function (service_role) runs them: not anon, not a signed-in user. No table, column or
-- policy changes (row 60's two-factor policies stay as they are). Idempotent: run it twice, same result. One
-- transaction.
-- Order: after row 53 (migration-coach-alerts-2026-10-28.sql) and row 56 (migration-data-scale-2026-10-28.sql): it
-- replaces their coach_week_stats and program_planned_per_week. If either of those files is ever run again, run
-- this one after it (row 63 says false until then).
-- The edge function copes before this runs: everything it reads from here is optional (that part of the report is
-- left out), and it reads the blocks' JSON for the weeks left, as it did before row 56. coach_threads_last is
-- plpgsql: a project without public.messages still takes this file, and the call answers with an error the edge
-- function leaves out.
-- Rollback (if ever needed): run migration-coach-alerts-2026-10-28.sql and migration-data-scale-2026-10-28.sql again
-- (their function bodies), then
--   drop function if exists public.coach_threads_last(uuid[]);
--   drop function if exists public.coach_week_effort(uuid[], date, date);
--   drop function if exists public.program_effort_sets(jsonb, date, date);
--   drop function if exists public.programs_weeks_left(public.programs);
--   drop function if exists public.program_weeks_left(jsonb);
--   drop function if exists public.powa_js_truthy(jsonb);
begin;

do $$
begin
  if to_regclass('public.programs') is null or to_regclass('public.workout_logs') is null then
    raise exception 'public.programs or public.workout_logs is missing: run this in the POWALIFTA project. Nothing was changed.';
  end if;
end $$;

-- 6 (first: 2, 3 and 4 use it) -----------------------------------------------------------------------------------
create or replace function public.powa_js_truthy(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case jsonb_typeof(p)
    when 'boolean' then p = 'true'::jsonb
    when 'number' then p <> '0'::jsonb
    when 'string' then p <> '""'::jsonb
    when 'object' then true
    when 'array' then true
    else false   -- JSON null, or the key isn't there (SQL NULL)
  end
$$;

comment on function public.powa_js_truthy(jsonb) is
  'JavaScript truthiness of a JSON value (false for null, false, 0, "" and a missing key): the Monday report reads a program''s sets as the app does. service_role only.';

-- 1 ---------------------------------------------------------------------------------------------------------------
create or replace function public.coach_week_stats(p_athletes uuid[], p_from date, p_to date)
returns table (athlete_id uuid, sessions integer, lifts jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select distinct a as athlete_id
    from unnest(coalesce(p_athletes, '{}'::uuid[])) as a
    where a is not null and p_from is not null and p_to is not null and p_from <= p_to
  ),
  logs as (
    select l.athlete_id, lower(l.lift::text) as lift, left(l.date::text, 10) as d, l.e1rm_comp::numeric as e
    from public.workout_logs l
    where l.athlete_id = any (p_athletes)
      and l.date is not null
      and left(l.date::text, 10) <= p_to::text
  ),
  per_athlete as (
    select logs.athlete_id, count(distinct logs.d) filter (where logs.d >= p_from::text) as n
    from logs
    group by logs.athlete_id
  ),
  per_lift as (
    select logs.athlete_id, logs.lift,
      max(logs.e) filter (where logs.d >= p_from::text) as during,
      max(logs.e) filter (where logs.d < p_from::text) as before,
      -- strength over 4 weeks: the 28 days ending p_to, and the 28 before them
      max(logs.e) filter (where logs.d >= (p_to - 27)::text) as recent,
      max(logs.e) filter (where logs.d >= (p_to - 55)::text and logs.d < (p_to - 27)::text) as prior
    from logs
    where logs.lift in ('squat', 'bench', 'deadlift') and logs.e > 0
    group by logs.athlete_id, logs.lift
  )
  select ids.athlete_id,
    coalesce(per_athlete.n, 0)::integer as sessions,
    coalesce((select jsonb_object_agg(pl.lift, jsonb_build_object('during', pl.during, 'before', pl.before, 'recent', pl.recent, 'prior', pl.prior))
              from per_lift pl where pl.athlete_id = ids.athlete_id), '{}'::jsonb) as lifts
  from ids
  left join per_athlete on per_athlete.athlete_id = ids.athlete_id;
$$;

comment on function public.coach_week_stats(uuid[], date, date) is
  'Monday report / Thursday check (send-weekly-digest): per athlete, distinct days logged in [from, to] and each main lift''s best e1rm_comp in and before the window, in the 28 days ending `to` (recent) and the 28 before (prior). service_role only.';

-- 2 ---------------------------------------------------------------------------------------------------------------
-- migration-data-scale-2026-10-28.sql's body, with drafts skipped (the one added line is marked).
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
    -- A week the coach hasn't published (the drafts feature) isn't the lifter's block.   (v2)
    continue when jsonb_typeof(w) = 'object' and w -> 'draft' = 'true'::jsonb;
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
  'coach-report.js plannedPerWeek in SQL: the sessions a block plans this week (days with work in the first week with a set still to do; 0 when finished; draft weeks skipped). send-weekly-digest only.';

-- 3 ---------------------------------------------------------------------------------------------------------------
create or replace function public.program_weeks_left(p_weeks jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_weeks jsonb := p_weeks;
  w jsonb;
  n_live integer := 0;
  open_at integer := null;
begin
  if v_weeks is not null and jsonb_typeof(v_weeks) = 'string' then
    begin
      v_weeks := (v_weeks #>> '{}')::jsonb;
    exception when others then
      return null;
    end;
  end if;
  if v_weeks is null or jsonb_typeof(v_weeks) <> 'array' then
    return null;
  end if;
  for w in select x.value from jsonb_array_elements(v_weeks) with ordinality as x(value, i) order by x.i loop
    continue when jsonb_typeof(w) = 'object' and w -> 'draft' = 'true'::jsonb;
    n_live := n_live + 1;
    -- The block's current week: the first with a day with work (an exercise with sets) holding a set still to do
    -- (JavaScript-truthy, not completed, not skipped): coach-report.js weekOpen.
    if open_at is null and jsonb_typeof(w) = 'object' and jsonb_typeof(w -> 'days') = 'array' and exists (
      select 1
      from jsonb_array_elements(w -> 'days') as d(value)
      where jsonb_typeof(d.value) = 'object' and jsonb_typeof(d.value -> 'exercises') = 'array'
        and exists (select 1 from jsonb_array_elements(d.value -> 'exercises') as e(value)
                    where jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'sets') = 'array' and e.value -> 'sets' <> '[]'::jsonb)
        and exists (select 1
                    from jsonb_array_elements(d.value -> 'exercises') as e(value),
                         jsonb_array_elements(case when jsonb_typeof(e.value -> 'sets') = 'array' then e.value -> 'sets' else '[]'::jsonb end) as s(value)
                    where public.powa_js_truthy(s.value)
                      and not public.powa_js_truthy(s.value -> 'completed')
                      and not public.powa_js_truthy(s.value -> 'skipped'))) then
      open_at := n_live;
    end if;
  end loop;
  if n_live = 0 then
    return null;
  end if;
  if open_at is null then
    return 0;
  end if;
  return n_live - open_at + 1;
end;
$$;

comment on function public.program_weeks_left(jsonb) is
  'coach-report.js weeksLeft in SQL: weeks from the block''s current week (the first with a set still to do) to its end, that week counted; 0 = finished, null = no weeks; draft weeks skipped. send-weekly-digest only.';

-- A computed field: GET /programs?select=athlete_id,weeks_left:programs_weeks_left
create or replace function public.programs_weeks_left(p public.programs)
returns integer
language sql
immutable
set search_path = ''
as $$
  select public.program_weeks_left(p.weeks);
$$;

comment on function public.programs_weeks_left(public.programs) is
  'The weeks left in this program (program_weeks_left of its weeks), served by PostgREST as a column. send-weekly-digest only.';

-- 4 ---------------------------------------------------------------------------------------------------------------
create or replace function public.program_effort_sets(p_weeks jsonb, p_from date, p_to date)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_weeks jsonb := p_weeks;
  v_out jsonb;
begin
  if v_weeks is not null and jsonb_typeof(v_weeks) = 'string' then
    begin
      v_weeks := (v_weeks #>> '{}')::jsonb;
    exception when others then
      return '[]'::jsonb;
    end;
  end if;
  if v_weeks is null or jsonb_typeof(v_weeks) <> 'array' or p_from is null or p_to is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('d', x.d, 'l', x.e -> 'lift', 'v', x.e -> 'variant', 'n', x.e -> 'exerciseName',
                                               'w', x.s -> 'weight', 'r', x.s -> 'rpe', 'h', x.s -> 'rpeHi', 'f', x.s -> 'actualRpe')
                            order by x.wi, x.di, x.ei, x.si), '[]'::jsonb)
    into v_out
    from (
      select w.i as wi, d.i as di, e.i as ei, s.i as si, e.value as e, s.value as s,
             -- The day it was logged: completedAt's first 10 characters when it is JS-truthy (String(x || '').slice(0, 10)).
             case when public.powa_js_truthy(s.value -> 'completedAt') then left(s.value -> 'completedAt' #>> '{}', 10) else '' end as d
        from jsonb_array_elements(v_weeks) with ordinality as w(value, i)
        cross join lateral jsonb_array_elements(case when jsonb_typeof(w.value) = 'object' and (w.value -> 'draft') is distinct from 'true'::jsonb
                                                       and jsonb_typeof(w.value -> 'days') = 'array' then w.value -> 'days' else '[]'::jsonb end) with ordinality as d(value, i)
        cross join lateral jsonb_array_elements(case when jsonb_typeof(d.value) = 'object' and jsonb_typeof(d.value -> 'exercises') = 'array'
                                                     then d.value -> 'exercises' else '[]'::jsonb end) with ordinality as e(value, i)
        cross join lateral jsonb_array_elements(case when jsonb_typeof(e.value) = 'object' and jsonb_typeof(e.value -> 'sets') = 'array'
                                                     then e.value -> 'sets' else '[]'::jsonb end) with ordinality as s(value, i)
       where jsonb_typeof(s.value) = 'object'
         -- logged (app.js programLoggedSets); a meet attempt or an RIR set isn't an RPE set (coach-lifters.js clEffort)
         and public.powa_js_truthy(s.value -> 'completed')
         and not public.powa_js_truthy(s.value -> 'attempt')
         and not public.powa_js_truthy(s.value -> 'rir')
         -- an RPE felt and one written: not null, not missing, not ""
         and coalesce(s.value -> 'actualRpe', 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb)
         and coalesce(s.value -> 'rpe', 'null'::jsonb) not in ('null'::jsonb, '""'::jsonb)
    ) x
   -- compared as JavaScript compares strings (code point by code point), whatever the database's collation
   where x.d <> '' and x.d collate "C" >= p_from::text collate "C" and x.d collate "C" <= p_to::text collate "C";
  return v_out;
end;
$$;

comment on function public.program_effort_sets(jsonb, date, date) is
  'coach-report.js effortSets in SQL: every logged set in [from, to] with an RPE written and felt, in block order, as [{ d, l, v, n, w, r, h, f }]; draft weeks skipped. send-weekly-digest only.';

create or replace function public.coach_week_effort(p_athletes uuid[], p_from date, p_to date)
returns table (athlete_id uuid, program_id text, sets jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select x.athlete_id, x.program_id, x.sets
  from (
    select p.athlete_id, p.id::text as program_id, public.program_effort_sets(p.weeks, p_from, p_to) as sets
    from public.programs p
    where p.athlete_id = any (coalesce(p_athletes, '{}'::uuid[]))
      and p_from is not null and p_to is not null and p_from <= p_to
  ) x
  where x.sets <> '[]'::jsonb;
$$;

comment on function public.coach_week_effort(uuid[], date, date) is
  'Monday report (send-weekly-digest): per program of these athletes, its logged RPE sets in [from, to] (program_effort_sets); programs with none are left out. service_role only.';

-- 5 ---------------------------------------------------------------------------------------------------------------
create or replace function public.coach_threads_last(p_athletes uuid[])
returns table (coach_id uuid, athlete_id uuid, last_at timestamptz, last_sender_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The newest message of each thread (messages_thread_idx: coach_id, athlete_id, created_at). Not its body.
  return query
    select distinct on (m.coach_id, m.athlete_id) m.coach_id, m.athlete_id, m.created_at, m.sender_id
    from public.messages m
    where m.athlete_id = any (coalesce(p_athletes, '{}'::uuid[]))
    order by m.coach_id, m.athlete_id, m.created_at desc, m.id desc;
end;
$$;

comment on function public.coach_threads_last(uuid[]) is
  'Monday report (send-weekly-digest): per coach and lifter thread of these athletes, when the last message was sent and by whom (never its words). service_role only.';

-- Only the cron's edge function (service_role). New functions are executable by PUBLIC, and Supabase grants anon /
-- authenticated on everything in public: take all three away. (A replaced function keeps its grants; revoking again
-- changes nothing.)
revoke all on function public.powa_js_truthy(jsonb) from public, anon, authenticated;
revoke all on function public.coach_week_stats(uuid[], date, date) from public, anon, authenticated;
revoke all on function public.program_planned_per_week(jsonb) from public, anon, authenticated;
revoke all on function public.program_weeks_left(jsonb) from public, anon, authenticated;
revoke all on function public.programs_weeks_left(public.programs) from public, anon, authenticated;
revoke all on function public.program_effort_sets(jsonb, date, date) from public, anon, authenticated;
revoke all on function public.coach_week_effort(uuid[], date, date) from public, anon, authenticated;
revoke all on function public.coach_threads_last(uuid[]) from public, anon, authenticated;
grant execute on function public.powa_js_truthy(jsonb) to service_role;
grant execute on function public.coach_week_stats(uuid[], date, date) to service_role;
grant execute on function public.program_planned_per_week(jsonb) to service_role;
grant execute on function public.program_weeks_left(jsonb) to service_role;
grant execute on function public.programs_weeks_left(public.programs) to service_role;
grant execute on function public.program_effort_sets(jsonb, date, date) to service_role;
grant execute on function public.coach_week_effort(uuid[], date, date) to service_role;
grant execute on function public.coach_threads_last(uuid[]) to service_role;

commit;

-- Verify:
--   select has_function_privilege('authenticated', 'public.coach_week_effort(uuid[], date, date)', 'execute');   -- false
--   select athlete_id, lifts from public.coach_week_stats(array[(select id from public.profiles where coach_id is not null limit 1)], current_date - 7, current_date - 1);
--   select athlete_id, public.programs_weeks_left(p), public.programs_planned(p) from public.programs p limit 5;
--   select athlete_id, jsonb_array_length(sets) from public.coach_week_effort(array(select id from public.profiles where coach_id is not null limit 20), current_date - 7, current_date - 1);
--   select * from public.coach_threads_last(array(select id from public.profiles where coach_id is not null limit 20));
--   (as the edge function) GET /rest/v1/programs?select=athlete_id,weeks_left:programs_weeks_left&limit=5
