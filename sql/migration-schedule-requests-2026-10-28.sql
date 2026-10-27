-- migration-schedule-requests-2026-10-28.sql — POWALIFTA
-- Busy weeks (busy-week.js): a lifter marks the days they can train this week, the app proposes where
-- their sessions go, and their coach approves or declines. The request is its own row because a lifter
-- can already rewrite the whole program blob (pins): this way nothing in the coach's program moves until
-- the coach says yes, and then the coach's own program save makes the change.
--
-- The shape is fixed (server code reads the approved rows):
--   days      the weekdays the lifter can train that week: 'Mon' … 'Sun', each once (the intake's names)
--   proposal  where each session goes, one JSON object of 8 KB at most:
--             { v, weekIdx, weekNumber, sessions: [{ dayIdx, dayId, name, lifts }], assign: [{ dayIdx, dayId,
--               date }], merge: [{ from, into, fromId, intoId }], move: [{ dayIdx, dayId, to }], why }
--   status    pending → approved | declined; decided_at is the server's clock
--
-- Who:
--   the lifter     inserts their own, reads their own, and edits days / proposal / note while it's pending,
--                  only for the coach they have now (coach_id comes from profiles, never from the client);
--                  they can't approve or decline anything, their own included.
--   their coach    the coach the request was filed with, while still their coach (is_current_coach_of):
--                  reads it and moves a pending request to approved or declined (status only).
--   nobody         deletes (the row goes with the lifter's account); anon gets nothing.
--
-- Run any time after migration-security-2026-10-22.sql (it needs public.is_current_coach_of). Until it
-- runs, a lifter's request stays on their phone and their coach sees none (db.js says so). Idempotent;
-- one transaction.
-- Undo (by hand, if ever): drop table public.schedule_requests; drop function public.schedule_requests_guard();
begin;

do $$
begin
  if to_regprocedure('public.is_current_coach_of(uuid)') is null then
    raise exception 'Run migration-security-2026-10-22.sql first: it creates public.is_current_coach_of(uuid).';
  end if;
end $$;

create table if not exists public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  week_start date not null,
  days text[] not null check (cardinality(days) between 0 and 7),
  proposal jsonb not null default '{}' check (jsonb_typeof(proposal)='object' and pg_column_size(proposal) <= 8192),
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (athlete_id, week_start));

-- The coach's list (Today's busy-week jobs): their requests by week. athlete_id is covered by the unique key.
create index if not exists schedule_requests_coach_week_idx on public.schedule_requests (coach_id, week_start desc);

alter table public.schedule_requests enable row level security;

-- Read: the lifter; their coach while the request is theirs and the lifter still is.
drop policy if exists "schedule_requests_select" on public.schedule_requests;
create policy "schedule_requests_select" on public.schedule_requests
  for select to authenticated
  using (athlete_id = (select auth.uid())
         or (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id)));

-- Insert: the lifter, a pending request, filed with the coach they have now (the guard sets coach_id
-- from profiles before this check runs; a lifter with no coach has nobody to ask).
drop policy if exists "schedule_requests_insert" on public.schedule_requests;
create policy "schedule_requests_insert" on public.schedule_requests
  for insert to authenticated
  with check (athlete_id = (select auth.uid()) and status = 'pending'
              and coach_id is not null and coach_id <> athlete_id);

-- The lifter edits their own while it's pending, still with the same coach (a request filed with a coach
-- they've since left matches nothing: it isn't theirs to change any more).
drop policy if exists "schedule_requests_lifter_update" on public.schedule_requests;
create policy "schedule_requests_lifter_update" on public.schedule_requests
  for update to authenticated
  using (athlete_id = (select auth.uid()) and status = 'pending'
         and coach_id = (select p.coach_id from public.profiles p where p.id = (select auth.uid())))
  with check (athlete_id = (select auth.uid()) and status = 'pending'
              and coach_id is not null
              and coach_id = (select p.coach_id from public.profiles p where p.id = (select auth.uid())));

-- The coach decides a pending one: approved or declined. Never their own (a coach is not their own lifter).
drop policy if exists "schedule_requests_coach_decide" on public.schedule_requests;
create policy "schedule_requests_coach_decide" on public.schedule_requests
  for update to authenticated
  using (coach_id = (select auth.uid()) and athlete_id <> (select auth.uid())
         and public.is_current_coach_of(athlete_id) and status = 'pending')
  with check (coach_id = (select auth.uid()) and athlete_id <> (select auth.uid())
              and public.is_current_coach_of(athlete_id) and status in ('approved', 'declined'));

-- The guard: the row stays where it was filed (id, lifter, coach, week, created_at), the lifter can change
-- only their days, proposal and note, the coach only the decision (decided_at stamped here), and days are
-- real weekday names on a real Monday's week. SECURITY DEFINER so the coach lookup doesn't depend on
-- profiles' read policies; it reads one column of the row's own lifter and nothing else.
create or replace function public.schedule_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.coach_id := (select p.coach_id from public.profiles p where p.id = new.athlete_id);
    new.status := 'pending';
    new.decided_at := null;
    new.created_at := now();
  else
    new.id := old.id;
    new.athlete_id := old.athlete_id;
    new.week_start := old.week_start;
    new.created_at := old.created_at;
    -- A null written over the coach is the on-delete-set-null of that coach's account going: keep it.
    if not (new.coach_id is null and old.coach_id is not null) then
      new.coach_id := old.coach_id;
    end if;
    if me is not null and me = old.athlete_id then
      new.status := old.status;
      new.decided_at := old.decided_at;
    else
      new.days := old.days;
      new.proposal := old.proposal;
      new.note := old.note;
      new.decided_at := case when new.status is distinct from old.status
                             then (case when new.status = 'pending' then null else now() end)
                             else old.decided_at end;
    end if;
  end if;
  if exists (select 1 from unnest(new.days) d where d is null or d not in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'))
     or cardinality(new.days) <> (select count(distinct d) from unnest(new.days) d) then
    raise exception 'days are Mon to Sun, each once' using errcode = '23514';
  end if;
  if extract(isodow from new.week_start) <> 1 then
    raise exception 'week_start is the Monday of the week' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_schedule_requests_guard on public.schedule_requests;
create trigger trg_schedule_requests_guard before insert or update on public.schedule_requests
  for each row execute function public.schedule_requests_guard();
-- A trigger function only: nobody calls it through the API (triggers fire without EXECUTE).
revoke all on function public.schedule_requests_guard() from public, anon, authenticated;

revoke all on public.schedule_requests from anon, authenticated;
grant select, insert, update on public.schedule_requests to authenticated;

commit;

-- Verify:
--   select count(*) from public.schedule_requests;
--   select policyname, cmd from pg_policies where tablename = 'schedule_requests' order by 1;   -- 4 rows
--   select tgname from pg_trigger where tgname = 'trg_schedule_requests_guard';
