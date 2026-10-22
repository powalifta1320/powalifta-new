-- migration-coach-notes-2026-10-22.sql — POWALIFTA
-- Coach-private notes: what a coach keeps about an athlete for themselves (injury history, life
-- context, "night shifts Tue and Thu"). Pinned in the laptop desk's athlete workspace.
--
-- Who sees a note: ONLY the coach who wrote it, and only while the athlete is on their roster.
-- The athlete never reads them, nor does any other coach (a new coach starts with none). When the
-- athlete leaves, the notes stay hidden from everyone; if they come back, their coach sees them
-- again. Account deletion (either side) removes them (on delete cascade).
--
-- Run any time: until it runs, the app keeps notes on the coach's own device and says so.
-- Idempotent; one transaction.
begin;

create table if not exists public.coach_notes (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists coach_notes_coach_athlete_idx on public.coach_notes (coach_id, athlete_id, created_at desc);

alter table public.coach_notes enable row level security;

-- One rule for every verb: it's mine, and the athlete is mine right now.
drop policy if exists "coach_notes_select" on public.coach_notes;
create policy "coach_notes_select" on public.coach_notes
  for select to authenticated
  using (coach_id = auth.uid()
         and exists (select 1 from public.profiles p where p.id = coach_notes.athlete_id and p.coach_id = auth.uid()));

drop policy if exists "coach_notes_insert" on public.coach_notes;
create policy "coach_notes_insert" on public.coach_notes
  for insert to authenticated
  with check (coach_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = coach_notes.athlete_id and p.coach_id = auth.uid()));

drop policy if exists "coach_notes_update" on public.coach_notes;
create policy "coach_notes_update" on public.coach_notes
  for update to authenticated
  using (coach_id = auth.uid()
         and exists (select 1 from public.profiles p where p.id = coach_notes.athlete_id and p.coach_id = auth.uid()))
  with check (coach_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = coach_notes.athlete_id and p.coach_id = auth.uid()));

drop policy if exists "coach_notes_delete" on public.coach_notes;
create policy "coach_notes_delete" on public.coach_notes
  for delete to authenticated
  using (coach_id = auth.uid()
         and exists (select 1 from public.profiles p where p.id = coach_notes.athlete_id and p.coach_id = auth.uid()));

-- A note can't be moved to another coach or athlete, and its clock is the server's.
create or replace function public.coach_notes_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.coach_id := old.coach_id;
    new.athlete_id := old.athlete_id;
    new.created_at := old.created_at;
  else
    -- A new note is stamped by the server: a client-sent created_at can't back-date it.
    new.created_at := now();
    new.id := coalesce(new.id, gen_random_uuid());
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_coach_notes_guard on public.coach_notes;
create trigger trg_coach_notes_guard before insert or update on public.coach_notes
  for each row execute function public.coach_notes_guard();

revoke all on public.coach_notes from anon;
grant select, insert, update, delete on public.coach_notes to authenticated;

commit;

-- Verify:
--   select count(*) from public.coach_notes;
--   select policyname from pg_policies where tablename = 'coach_notes';
