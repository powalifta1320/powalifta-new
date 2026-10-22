-- migration-meet-calendar-2026-10-22.sql — POWALIFTA (brief M3: planned meets + the roster calendar)
--
--   programs.starts_on      the Monday a block's week 1 began, so every week has a date on the
--   programs.meet_date      calendar and a W-n label counted down to the meet. Back-filled where the
--                           program itself says so (a pinned day, logged sets, a planned meet in it).
--   meets.status            'planned' (a date, a federation, a class, a weigh-in: never a result) or
--                           'done' (what happened on the platform). Every existing meet is 'done',
--                           except a future-dated one with no lifts, which can only be a plan.
--                           A planned meet holds no lifts (meets_planned_no_results), so it can never
--                           change a best total, a best single or DOTS.
--   meets.division          'Open', 'Masters 1', 'Junior', 'Equipped Open' ... (scoring follows it)
--   meets.weigh_in          '2h' or '24h'; meets.weigh_in_at the weigh-in time.
--   coach policies          a coach plans, moves and cancels a PLANNED meet for an athlete on their
--                           roster right now. Never a result: the guard refuses a coach's write of
--                           any lift or the weigh-in bodyweight, and a coach can't mark a meet done.
--                           The athlete keeps full ownership of their own meets, planned or done.
--
-- Run any time (the app copes before it runs: a planned meet is then a future meet with no lifts,
-- and only the athlete can save one). Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
alter table public.programs add column if not exists starts_on date;
alter table public.programs add column if not exists meet_date date;

-- 2 -----------------------------------------------------------------------------------
alter table public.meets add column if not exists status text not null default 'done';
alter table public.meets drop constraint if exists meets_status_check;
alter table public.meets add constraint meets_status_check check (status in ('planned', 'done'));
alter table public.meets add column if not exists division text not null default '';
alter table public.meets drop constraint if exists meets_division_len;
alter table public.meets add constraint meets_division_len check (char_length(division) <= 80);
alter table public.meets add column if not exists weigh_in text;
alter table public.meets drop constraint if exists meets_weigh_in_check;
alter table public.meets add constraint meets_weigh_in_check check (weigh_in is null or weigh_in in ('2h', '24h'));
alter table public.meets add column if not exists weigh_in_at timestamptz;

-- A meet in the future with no lifts is a plan (that's how the app saved one before this ran).
update public.meets set status = 'planned'
 where status = 'done' and meet_date > current_date
   and squat_kg is null and bench_kg is null and deadlift_kg is null;

alter table public.meets drop constraint if exists meets_planned_no_results;
alter table public.meets add constraint meets_planned_no_results
  check (status <> 'planned' or (squat_kg is null and bench_kg is null and deadlift_kg is null));

create index if not exists meets_planned_date_idx on public.meets (meet_date) where status = 'planned';

-- 3 -----------------------------------------------------------------------------------
-- A coach plans a meet for an athlete on their roster now (the same live link as meets_coach_read).
drop policy if exists "meets_coach_plan_insert" on public.meets;
create policy "meets_coach_plan_insert" on public.meets
  for insert to authenticated
  with check (status = 'planned'
              and exists (select 1 from public.profiles p where p.id = meets.athlete_id and p.coach_id = (select auth.uid())));

drop policy if exists "meets_coach_plan_update" on public.meets;
create policy "meets_coach_plan_update" on public.meets
  for update to authenticated
  using (status = 'planned'
         and exists (select 1 from public.profiles p where p.id = meets.athlete_id and p.coach_id = (select auth.uid())))
  with check (status = 'planned'
              and exists (select 1 from public.profiles p where p.id = meets.athlete_id and p.coach_id = (select auth.uid())));

drop policy if exists "meets_coach_plan_delete" on public.meets;
create policy "meets_coach_plan_delete" on public.meets
  for delete to authenticated
  using (status = 'planned'
         and exists (select 1 from public.profiles p where p.id = meets.athlete_id and p.coach_id = (select auth.uid())));

-- The column guard. Results are the lifter's own: a coach's insert or update may not carry a lift
-- or the weigh-in bodyweight, nor turn the meet into a result. Nobody moves a meet to another
-- lifter. The SQL editor and the service role are unaffected.
create or replace function public.meets_plan_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.athlete_id := old.athlete_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if auth.uid() is distinct from new.athlete_id then
    if new.status <> 'planned' then
      raise exception 'a coach can plan a meet, not record its result' using errcode = '42501';
    end if;
    if new.squat_kg is not null or new.bench_kg is not null or new.deadlift_kg is not null
       or new.bodyweight_kg is distinct from (case when tg_op = 'UPDATE' then old.bodyweight_kg else null end) then
      raise exception 'meet results are the lifter''s own' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_meets_plan_guard on public.meets;
create trigger trg_meets_plan_guard before insert or update on public.meets
  for each row execute function public.meets_plan_guard();

-- 4 -----------------------------------------------------------------------------------
-- Back-fill programs.starts_on the way app.js programStartsOn() reads it: from a pinned day
-- (the earliest), else from when sets were logged (the most common week-1 Monday); then
-- programs.meet_date from a planned meet that falls inside the block. A program that says
-- neither stays null (the app counts back from a meet once one is set).
do $$
declare
  r record; w record; d record;
  v_pinned date; v_mode date; v_cand date; v_meet date; v_n int;
  v_counts jsonb;
begin
  for r in select id, athlete_id, weeks from public.programs
            where starts_on is null and jsonb_typeof(weeks) = 'array' and jsonb_array_length(weeks) > 0 loop
    v_pinned := null; v_counts := '{}'::jsonb;
    for w in select x.v, x.o from jsonb_array_elements(r.weeks) with ordinality as x(v, o) loop
      continue when jsonb_typeof(w.v->'days') is distinct from 'array';
      for d in select y.v from jsonb_array_elements(w.v->'days') as y(v) loop
        begin
          if coalesce(d.v->>'scheduledDate', '') ~ '^\d{4}-\d{2}-\d{2}' then
            v_cand := (date_trunc('week', left(d.v->>'scheduledDate', 10)::date) - (w.o - 1) * interval '7 days')::date;
            if v_pinned is null or v_cand < v_pinned then v_pinned := v_cand; end if;
          end if;
        exception when others then null;   -- a malformed date in the JSON: ignore it
        end;
        if jsonb_typeof(d.v->'exercises') = 'array' then
          begin
          select coalesce(v_counts, '{}'::jsonb) || coalesce(jsonb_object_agg(k, coalesce((v_counts->>k)::int, 0) + c), '{}'::jsonb) into v_counts
            from (select (date_trunc('week', left(s->>'completedAt', 10)::date) - (w.o - 1) * interval '7 days')::date::text as k, count(*)::int as c
                    from jsonb_array_elements(d.v->'exercises') e,
                         jsonb_array_elements(case when jsonb_typeof(e->'sets') = 'array' then e->'sets' else '[]'::jsonb end) s
                   where coalesce(s->>'completedAt', '') ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
                   group by 1) q;
          exception when others then null;   -- an impossible date in one day's sets: skip that day
          end;
        end if;
      end loop;
    end loop;
    v_mode := null;
    if v_pinned is null and v_counts <> '{}'::jsonb then
      select k::date into v_mode from jsonb_each_text(v_counts) as t(k, c) order by c::int desc, k asc limit 1;
    end if;
    v_cand := coalesce(v_pinned, v_mode);
    if v_cand is not null then
      v_n := jsonb_array_length(r.weeks);
      select m.meet_date into v_meet from public.meets m
       where m.athlete_id = r.athlete_id and m.status = 'planned'
         and m.meet_date between v_cand and v_cand + (7 * v_n + 6)
       order by m.meet_date limit 1;
      update public.programs set starts_on = v_cand, meet_date = coalesce(meet_date, v_meet) where id = r.id;
    end if;
  end loop;
end $$;

commit;

-- Verify:
--   select status, count(*) from public.meets group by 1;
--   select count(*) filter (where starts_on is not null) as dated, count(*) from public.programs;
--   select policyname from pg_policies where tablename = 'meets';   -- + meets_coach_plan_insert/update/delete
