-- migration-coach-challenges-2026-10-28.sql — POWALIFTA
-- Coach challenges: a coach sets their own lifters (all of them, or one team) a challenge with its
-- own board in Club: most sessions, most PRs, the biggest gain, or training as written (challenges.js).
--   coach_challenges   one row per challenge: the coach, its name, the metric, who's in it
--                      (member_ids, 1-200 lifters), the window (at most 92 days), an optional prize,
--                      and ended_at when the coach ends it early.
--   challenge_entries  one row per challenge + lifter: their name as the board shows it and their
--                      value now (the gain's baseline too). Names and values only: never a log or a
--                      program. The lifter's app writes its own row while the challenge runs; the
--                      coach's app writes everyone's (it reads their logs).
--
-- Who sees what:
--   · the coach: every right on their own challenges, and on their entries;
--   · a member: reads a challenge when they're in member_ids AND its coach is their coach right now
--     (profiles.coach_id); reads its board through public.challenge_board(), names and values only
--     (a teammate's baseline, their best total before it started, is not theirs to read); reads and
--     writes only their own entry, writing only while it runs (a day's grace either side for time
--     zones; not once the coach ended it);
--   · nobody else gets anything (no anon access at all; another coach, a lifter who isn't in it, a
--     lifter who has left the coach: no rows).
-- Guards (server side): ids and the coach can't move, created_at / ended_at / updated_at are the
-- server's, an entry must be a member's, and the gain's baseline is kept from the first write.
--
-- Run any time (it needs only profiles). Until it runs, the coach's challenges stay on their own
-- device and lifters see none (db.js COACH CHALLENGES hook). Idempotent; one transaction.
-- To take it back out: drop table public.challenge_entries; drop table public.coach_challenges;
-- drop function public.challenge_my_coach(); drop function public.challenge_coach_may(uuid);
-- drop function public.challenge_member_may(uuid, boolean); drop function public.challenge_board(uuid[]);
-- and the two guard functions.
begin;

create table if not exists public.coach_challenges (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60 and btrim(name) <> ''),
  metric      text not null check (metric in ('sessions', 'prs', 'gain', 'asWritten')),
  member_ids  uuid[] not null check (cardinality(member_ids) between 1 and 200 and array_position(member_ids, null) is null),
  starts_on   date not null,
  ends_on     date not null,
  prize       text check (char_length(prize) <= 80),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  -- ends on or after it starts, 92 days at most (ends_on - starts_on is the days between them)
  constraint coach_challenges_window check (ends_on >= starts_on and ends_on - starts_on <= 91)
);
create index if not exists coach_challenges_coach_idx on public.coach_challenges (coach_id, starts_on desc);
-- A lifter's read is filtered by member (member_ids @> array[me]): the GIN index serves it.
create index if not exists coach_challenges_members_idx on public.coach_challenges using gin (member_ids);

create table if not exists public.challenge_entries (
  challenge_id  uuid not null references public.coach_challenges(id) on delete cascade,
  athlete_id    uuid not null references public.profiles(id) on delete cascade,
  name          text check (char_length(name) <= 60),
  value         numeric check (value between -1000 and 100000),
  baseline      numeric check (baseline between 0 and 100000),
  updated_at    timestamptz not null default now(),
  primary key (challenge_id, athlete_id)
);
create index if not exists challenge_entries_athlete_idx on public.challenge_entries (athlete_id);

alter table public.coach_challenges enable row level security;
alter table public.challenge_entries enable row level security;

-- The signed-in lifter's coach right now (profiles.coach_id), read past profiles' own policies.
create or replace function public.challenge_my_coach()
returns uuid language sql stable security definer set search_path = public as $$
  select p.coach_id from public.profiles p where p.id = auth.uid();
$$;
revoke all on function public.challenge_my_coach() from public, anon;
grant execute on function public.challenge_my_coach() to authenticated;

-- This challenge is the signed-in coach's.
create or replace function public.challenge_coach_may(p_challenge uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_challenges c where c.id = p_challenge and c.coach_id = auth.uid());
$$;
revoke all on function public.challenge_coach_may(uuid) from public, anon;
grant execute on function public.challenge_coach_may(uuid) to authenticated;

-- The signed-in lifter is in this challenge and its coach is their coach right now; p_write: and it
-- is running (not ended by the coach, today within its days, a day's grace either side).
create or replace function public.challenge_member_may(p_challenge uuid, p_write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_challenges c
     where c.id = p_challenge
       and auth.uid() = any (c.member_ids)
       and c.coach_id = public.challenge_my_coach()
       and (not p_write or (c.ended_at is null and current_date between c.starts_on - 1 and c.ends_on + 1)));
$$;
revoke all on function public.challenge_member_may(uuid, boolean) from public, anon;
grant execute on function public.challenge_member_may(uuid, boolean) to authenticated;

-- Challenges: the coach's every verb; a member reads.
drop policy if exists "coach_challenges_select" on public.coach_challenges;
create policy "coach_challenges_select" on public.coach_challenges
  for select to authenticated
  using (coach_id = (select auth.uid())
         or ((select auth.uid()) = any (member_ids) and coach_id = (select public.challenge_my_coach())));

drop policy if exists "coach_challenges_insert" on public.coach_challenges;
create policy "coach_challenges_insert" on public.coach_challenges
  for insert to authenticated
  with check (coach_id = (select auth.uid()));

drop policy if exists "coach_challenges_update" on public.coach_challenges;
create policy "coach_challenges_update" on public.coach_challenges
  for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

drop policy if exists "coach_challenges_delete" on public.coach_challenges;
create policy "coach_challenges_delete" on public.coach_challenges
  for delete to authenticated
  using (coach_id = (select auth.uid()));

-- Entries: through the challenge's coach; a lifter selects only their own row (the board's names and
-- values come through public.challenge_board) and writes only their own, while it runs.
drop policy if exists "challenge_entries_select" on public.challenge_entries;
create policy "challenge_entries_select" on public.challenge_entries
  for select to authenticated
  using (public.challenge_coach_may(challenge_id) or athlete_id = (select auth.uid()));

drop policy if exists "challenge_entries_insert" on public.challenge_entries;
create policy "challenge_entries_insert" on public.challenge_entries
  for insert to authenticated
  with check (public.challenge_coach_may(challenge_id)
              or (athlete_id = (select auth.uid()) and public.challenge_member_may(challenge_id, true)));

drop policy if exists "challenge_entries_update" on public.challenge_entries;
create policy "challenge_entries_update" on public.challenge_entries
  for update to authenticated
  using (public.challenge_coach_may(challenge_id)
         or (athlete_id = (select auth.uid()) and public.challenge_member_may(challenge_id, true)))
  with check (public.challenge_coach_may(challenge_id)
              or (athlete_id = (select auth.uid()) and public.challenge_member_may(challenge_id, true)));

drop policy if exists "challenge_entries_delete" on public.challenge_entries;
create policy "challenge_entries_delete" on public.challenge_entries
  for delete to authenticated
  using (public.challenge_coach_may(challenge_id));

-- A challenge can't move to another coach or id, and its clock is the server's: created now; ended
-- when the coach ends it (never later than now, and once ended it stays ended).
create or replace function public.coach_challenges_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.coach_id := old.coach_id;
    new.created_at := old.created_at;
    if old.ended_at is not null then new.ended_at := old.ended_at;
    elsif new.ended_at is not null then new.ended_at := now();
    end if;
  else
    new.id := coalesce(new.id, gen_random_uuid());
    new.created_at := now();
    if new.ended_at is not null then new.ended_at := least(new.ended_at, now()); end if;
  end if;
  new.name := btrim(new.name);
  return new;
end $$;
drop trigger if exists trg_coach_challenges_guard on public.coach_challenges;
create trigger trg_coach_challenges_guard before insert or update on public.coach_challenges
  for each row execute function public.coach_challenges_guard();

-- An entry stays on its challenge and lifter, belongs to a member, keeps the first baseline it was
-- given (the gain is measured from it), and is stamped by the server. SECURITY DEFINER: the member
-- check reads the challenge whoever writes.
create or replace function public.challenge_entries_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  members uuid[];
begin
  if tg_op = 'UPDATE' then
    new.challenge_id := old.challenge_id;
    new.athlete_id := old.athlete_id;
    if old.baseline is not null then new.baseline := old.baseline; end if;
  end if;
  select c.member_ids into members from public.coach_challenges c where c.id = new.challenge_id;
  if members is null or not (new.athlete_id = any (members)) then
    raise exception 'Only a member of this challenge has an entry in it' using errcode = '42501';
  end if;
  new.name := nullif(btrim(coalesce(new.name, '')), '');
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.challenge_entries_guard() from public, anon;
drop trigger if exists trg_challenge_entries_guard on public.challenge_entries;
create trigger trg_challenge_entries_guard before insert or update on public.challenge_entries
  for each row execute function public.challenge_entries_guard();

-- Signed-in users only, and only the four verbs; RLS above decides which rows.
revoke all on public.coach_challenges from anon, authenticated;
revoke all on public.challenge_entries from anon, authenticated;
grant select, insert, update, delete on public.coach_challenges to authenticated;
grant select, insert, update, delete on public.challenge_entries to authenticated;

-- A challenge's board as everyone in it sees it: names and values, never a baseline. For the coach
-- of these challenges, or a member whose coach runs them right now; nobody else gets a row.
-- → (challenge_id, athlete_id, name, value, updated_at)
create or replace function public.challenge_board(p_challenges uuid[])
returns table (challenge_id uuid, athlete_id uuid, name text, value numeric, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.challenge_id, e.athlete_id, e.name, e.value, e.updated_at
    from public.challenge_entries e
   where e.challenge_id = any (coalesce(p_challenges, '{}'::uuid[]))
     and (public.challenge_coach_may(e.challenge_id) or public.challenge_member_may(e.challenge_id, false));
$$;
revoke all on function public.challenge_board(uuid[]) from public, anon;
grant execute on function public.challenge_board(uuid[]) to authenticated;

commit;

-- Verify:
--   select tablename, policyname, cmd from pg_policies
--    where tablename in ('coach_challenges', 'challenge_entries') order by 1, 2;   -- 8 rows
--   select tgname from pg_trigger where tgname in ('trg_coach_challenges_guard', 'trg_challenge_entries_guard');
--   select to_regprocedure('public.challenge_board(uuid[])');
