-- migration-team-programs-2026-10-22.sql — POWALIFTA (brief M4: team programs)
--
--   program_groups          a coach's team: its name and ONE master program (weeks), with its own
--                           rev (compare-and-swap, like programs.rev). Coach-only.
--   program_group_members   who is on it, and which of their programs the team writes. One team per
--                           lifter. When the athlete leaves the coach (profiles.coach_id changes) or
--                           either account goes, the membership goes with it.
--   push_group_programs     writes each member's OWN program from the master (the app builds each
--                           lifter's copy: their maxes, their unit, their overrides). Per row it
--                           re-checks the athlete is still on the caller's roster (a departed
--                           athlete is never written to), compares and swaps on programs.rev (a
--                           lifter who logged meanwhile gets 'stale' and the app rebuilds that row
--                           from the fresh copy), and puts back every set the lifter logged, exactly
--                           as lifted, whatever the client sent. A lifter's own (unlinked) program
--                           that the team replaces is kept as a past block in the same transaction
--                           when it holds logged sets (refused, 'needs_archive', without
--                           program_blocks). Security invoker: the caller's own RLS on programs
--                           decides what they may write, as for any program save.
--
-- Needs migration-program-integrity-2026-10-22.sql first (programs.rev); run
-- migration-blocks-2026-10-22.sql before it too (past blocks). Until this runs the app keeps teams
-- on the coach's device and pushes with ordinary compare-and-swap program saves.
-- Idempotent; one transaction.
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'programs' and column_name = 'rev') then
    raise exception 'Run migration-program-integrity-2026-10-22.sql first (programs.rev)';
  end if;
end $$;

-- 1 -----------------------------------------------------------------------------------
-- A pushed block carries the team's dates (the roster calendar). The same two columns
-- migration-meet-calendar-2026-10-22.sql adds: whichever runs first adds them.
alter table public.programs add column if not exists starts_on date;
alter table public.programs add column if not exists meet_date date;

create table if not exists public.program_groups (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null default 'Team',
  program_name  text not null default '',
  weeks         jsonb not null default '[]'::jsonb,
  starts_on     date,
  meet_date     date,
  rev           bigint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.program_groups drop constraint if exists program_groups_name_len;
alter table public.program_groups add constraint program_groups_name_len
  check (char_length(btrim(name)) between 1 and 80 and char_length(program_name) <= 120);
alter table public.program_groups drop constraint if exists program_groups_weeks_shape;
alter table public.program_groups add constraint program_groups_weeks_shape
  check (jsonb_typeof(weeks) = 'array' and octet_length(weeks::text) <= 600000);
create index if not exists program_groups_coach_idx on public.program_groups (coach_id);

create table if not exists public.program_group_members (
  group_id    uuid not null references public.program_groups(id) on delete cascade,
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  coach_id    uuid not null references public.profiles(id) on delete cascade,
  program_id  uuid references public.programs(id) on delete set null,
  pushed_rev  bigint,
  pushed_at   timestamptz,
  added_at    timestamptz not null default now(),
  primary key (group_id, athlete_id)
);
create unique index if not exists program_group_members_one_team on public.program_group_members (athlete_id);
create index if not exists program_group_members_coach_idx on public.program_group_members (coach_id);
create index if not exists program_group_members_program_idx on public.program_group_members (program_id);

-- 2 -----------------------------------------------------------------------------------
alter table public.program_groups enable row level security;
alter table public.program_group_members enable row level security;

-- A coach's own teams. Only a coach account makes one (profiles.user_type = 'coach'; the check is
-- left out on a database without that column, where every account is the coach's own).
drop policy if exists "program_groups_coach_all" on public.program_groups;
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'user_type') then
    execute $p$create policy "program_groups_coach_all" on public.program_groups
      for all to authenticated
      using (coach_id = (select auth.uid()))
      with check (coach_id = (select auth.uid())
                  and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.user_type = 'coach'))$p$;
  else
    execute $p$create policy "program_groups_coach_all" on public.program_groups
      for all to authenticated
      using (coach_id = (select auth.uid()))
      with check (coach_id = (select auth.uid()))$p$;
  end if;
end $$;

drop policy if exists "pgm_coach_select" on public.program_group_members;
create policy "pgm_coach_select" on public.program_group_members
  for select to authenticated using (coach_id = (select auth.uid()));

-- Only an athlete on the caller's roster right now joins one of the caller's teams.
drop policy if exists "pgm_coach_insert" on public.program_group_members;
create policy "pgm_coach_insert" on public.program_group_members
  for insert to authenticated
  with check (coach_id = (select auth.uid())
              and exists (select 1 from public.program_groups g where g.id = program_group_members.group_id and g.coach_id = (select auth.uid()))
              and exists (select 1 from public.profiles p where p.id = program_group_members.athlete_id and p.coach_id = (select auth.uid())));

drop policy if exists "pgm_coach_update" on public.program_group_members;
create policy "pgm_coach_update" on public.program_group_members
  for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid())
              and exists (select 1 from public.profiles p where p.id = program_group_members.athlete_id and p.coach_id = (select auth.uid())));

drop policy if exists "pgm_coach_delete" on public.program_group_members;
create policy "pgm_coach_delete" on public.program_group_members
  for delete to authenticated using (coach_id = (select auth.uid()));

revoke all on public.program_groups from anon;
revoke all on public.program_group_members from anon;
grant select, insert, update, delete on public.program_groups to authenticated;
grant select, insert, update, delete on public.program_group_members to authenticated;

-- 3 -----------------------------------------------------------------------------------
-- The master's compare-and-swap (the same contract as programs.rev): a writer that sends rev
-- expects the row to still be there; the server bumps it. The owner, the id and created_at stay.
create or replace function public.program_groups_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.rev is distinct from old.rev then
      raise exception 'powa_rev_conflict' using errcode = 'PT409',
        detail = 'team ' || old.id || ' is at rev ' || old.rev || ', the write expected ' || coalesce(new.rev::text, 'null');
    end if;
    new.rev := old.rev + 1;
    new.coach_id := old.coach_id;
    new.created_at := old.created_at;
  else
    new.rev := 0;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_program_groups_guard on public.program_groups;
create trigger trg_program_groups_guard before insert or update on public.program_groups
  for each row execute function public.program_groups_guard();

-- A membership belongs to its team's coach; it can't be moved to another team or lifter, and the
-- program it writes must be that lifter's.
create or replace function public.program_group_members_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.group_id := old.group_id;
    new.athlete_id := old.athlete_id;
    new.coach_id := old.coach_id;
    new.added_at := old.added_at;
  else
    select g.coach_id into new.coach_id from public.program_groups g where g.id = new.group_id;
    new.added_at := now();
  end if;
  if new.program_id is not null and not exists (
       select 1 from public.programs p where p.id = new.program_id and p.athlete_id = new.athlete_id) then
    raise exception 'that program is not this lifter''s' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_program_group_members_guard on public.program_group_members;
create trigger trg_program_group_members_guard before insert or update on public.program_group_members
  for each row execute function public.program_group_members_guard();

-- The athlete leaves (or changes) coach: off every team that isn't the new coach's. Security
-- definer because whoever changes coach_id (the athlete, the coach, a claim_invite) can't see the
-- old coach's team rows; it only ever deletes that one athlete's memberships.
create or replace function public.program_group_members_on_coach_change() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.coach_id is distinct from old.coach_id then
    delete from public.program_group_members
     where athlete_id = new.id and coach_id is distinct from new.coach_id;
  end if;
  return null;
end;
$$;
revoke all on function public.program_group_members_on_coach_change() from public, anon, authenticated;
drop trigger if exists trg_pgm_coach_change on public.profiles;
create trigger trg_pgm_coach_change after update of coach_id on public.profiles
  for each row execute function public.program_group_members_on_coach_change();

-- 4 -----------------------------------------------------------------------------------
-- Every set the lifter logged in p_live (completed, skipped or missed), put back in p_new at the
-- same week / day / exercise / set ids, exactly as it is in p_live. Null when a logged set has no
-- place in p_new (the push would lose it): the caller then refuses that row.
create or replace function public.program_keep_logged_sets(p_live jsonb, p_new jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  w record; d record; e record; s record;
  wi int; di int; ei int; si int;
  v_out jsonb := p_new;
  arr  constant jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_live) is distinct from 'array' then return p_new; end if;
  if jsonb_typeof(p_new) is distinct from 'array' then return null; end if;
  for w in select x.v, x.o from jsonb_array_elements(p_live) with ordinality as x(v, o) loop
    for d in select x.v, x.o from jsonb_array_elements(case when jsonb_typeof(w.v->'days') = 'array' then w.v->'days' else arr end) with ordinality as x(v, o) loop
      for e in select x.v, x.o from jsonb_array_elements(case when jsonb_typeof(d.v->'exercises') = 'array' then d.v->'exercises' else arr end) with ordinality as x(v, o) loop
        for s in select x.v, x.o from jsonb_array_elements(case when jsonb_typeof(e.v->'sets') = 'array' then e.v->'sets' else arr end) with ordinality as x(v, o) loop
          continue when not coalesce(s.v->'completed' = 'true'::jsonb or s.v->'skipped' = 'true'::jsonb or s.v->'missed' = 'true'::jsonb, false);
          wi := null; di := null; ei := null; si := null;
          select x.o - 1 into wi from jsonb_array_elements(v_out) with ordinality as x(v, o)
           where x.v->>'id' = w.v->>'id' limit 1;
          if wi is not null then
            select x.o - 1 into di from jsonb_array_elements(case when jsonb_typeof(v_out->wi->'days') = 'array' then v_out->wi->'days' else arr end) with ordinality as x(v, o)
             where x.v->>'id' = d.v->>'id' limit 1;
          end if;
          if di is not null then
            select x.o - 1 into ei from jsonb_array_elements(case when jsonb_typeof(v_out->wi->'days'->di->'exercises') = 'array' then v_out->wi->'days'->di->'exercises' else arr end) with ordinality as x(v, o)
             where x.v->>'id' = e.v->>'id' limit 1;
          end if;
          if ei is not null then
            if s.v ? 'id' then
              select x.o - 1 into si from jsonb_array_elements(case when jsonb_typeof(v_out->wi->'days'->di->'exercises'->ei->'sets') = 'array' then v_out->wi->'days'->di->'exercises'->ei->'sets' else arr end) with ordinality as x(v, o)
               where x.v->>'id' = s.v->>'id' limit 1;
            elsif jsonb_typeof(v_out->wi->'days'->di->'exercises'->ei->'sets'->(s.o::int - 1)) = 'object'
                  and not ((v_out->wi->'days'->di->'exercises'->ei->'sets'->(s.o::int - 1)) ? 'id') then
              si := s.o - 1;   -- an old set without an id: by its place
            end if;
          end if;
          if si is null then return null; end if;
          v_out := jsonb_set(v_out, array[wi::text, 'days', di::text, 'exercises', ei::text, 'sets', si::text], s.v);
        end loop;
      end loop;
    end loop;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.program_keep_logged_sets(jsonb, jsonb) from public, anon;
grant execute on function public.program_keep_logged_sets(jsonb, jsonb) to authenticated;

-- The day a logged set was lifted (its completedAt), or null when it has none or it isn't a date.
create or replace function public.program_set_logged_on(p_set jsonb) returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if coalesce(p_set->>'completedAt', '') !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return left(p_set->>'completedAt', 10)::date;
exception when others then return null;
end;
$$;
revoke all on function public.program_set_logged_on(jsonb) from public, anon;
grant execute on function public.program_set_logged_on(jsonb) to authenticated;

-- 5 -----------------------------------------------------------------------------------
-- p_rows: [{ athlete_id, program_id, rev, weeks, name, create?, replace?, starts_on?, meet_date? }],
-- one per lifter.
--   program_id + rev   the lifter's program as the app last read it (compare-and-swap);
--   create: true       a lifter's first team program (program_id is the new row's id);
--   replace: true      their current program isn't on the team yet: it is replaced. Only honoured
--                      while it has no links. When it holds logged training (any completed, skipped
--                      or missed set), that copy, as it is NOW, is kept as a past block in this same
--                      transaction (program_blocks, migration-blocks-2026-10-22.sql); without that
--                      table the row is refused ('needs_archive'): logged sets are never dropped.
--   starts_on / meet_date  the block's dates (the team's): written on create and replace; on an
--                      update only where the lifter's program has none yet.
-- p_master_rev: the master's rev the rows were built from; a newer master refuses the whole push.
-- Returns [{ athlete_id, status, program_id, rev, archived? }], status one of created | updated |
-- stale | needs_archive | departed | not_member | not_found | denied | invalid. Nothing is written
-- for any status but the first two.
create or replace function public.push_group_programs(p_group_id uuid, p_master_rev bigint, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_group record;
  v_row   jsonb;
  v_aid   uuid;
  v_pid   uuid;
  v_exp   bigint;
  v_weeks jsonb;
  v_keep  jsonb;
  v_name  text;
  v_live  record;
  v_rev   bigint;
  v_block uuid;
  v_start date;
  v_meet  date;
  v_out   jsonb := '[]'::jsonb;
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if v_uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'rows must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 250 then raise exception 'too many rows' using errcode = '22023'; end if;

  -- Locks the team: two pushes of one team run one after the other.
  select id, name, program_name, rev into v_group from public.program_groups
   where id = p_group_id and coach_id = v_uid for update;
  if not found then raise exception 'team not found' using errcode = 'P0002'; end if;
  if v_group.rev is distinct from p_master_rev then
    raise exception 'powa_rev_conflict' using errcode = 'PT409',
      detail = 'team ' || p_group_id || ' is at rev ' || v_group.rev || ', the push was built from ' || coalesce(p_master_rev::text, 'null');
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) <> 'object' or coalesce(v_row->>'athlete_id', '') !~ uuid_re then
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_row->>'athlete_id', 'status', 'invalid'));
      continue;
    end if;
    v_aid := (v_row->>'athlete_id')::uuid;

    if not exists (select 1 from public.program_group_members m where m.group_id = p_group_id and m.athlete_id = v_aid) then
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'not_member'));
      continue;
    end if;
    -- The live link, re-checked for this row now: an athlete who left is never written to.
    if not exists (select 1 from public.profiles p where p.id = v_aid and p.coach_id = v_uid) then
      delete from public.program_group_members where group_id = p_group_id and athlete_id = v_aid;
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'departed'));
      continue;
    end if;

    v_weeks := v_row->'weeks';
    if v_weeks is null or jsonb_typeof(v_weeks) <> 'array' or octet_length(v_weeks::text) > 600000
       or coalesce(v_row->>'program_id', '') !~ uuid_re then
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'invalid'));
      continue;
    end if;
    v_pid := (v_row->>'program_id')::uuid;
    v_name := left(coalesce(nullif(btrim(v_row->>'name'), ''), nullif(v_group.program_name, ''), v_group.name), 120);
    v_start := case when coalesce(v_row->>'starts_on', '') ~ '^\d{4}-\d{2}-\d{2}$' then (v_row->>'starts_on')::date end;
    v_meet  := case when coalesce(v_row->>'meet_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then (v_row->>'meet_date')::date end;
    v_block := null;

    -- to_jsonb(p)->'maxes': programs.maxes only exists once migration-blocks has run.
    select p.id, p.athlete_id, p.coach_id, p.rev, p.weeks, p.name, p.starts_on, p.meet_date, to_jsonb(p)->'maxes' as maxes
      into v_live from public.programs p where p.id = v_pid for update;
    if not found then
      if coalesce(v_row->'create', 'false'::jsonb) <> 'true'::jsonb then
        v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'not_found', 'program_id', v_pid));
        continue;
      end if;
      begin
        insert into public.programs (id, athlete_id, coach_id, name, weeks, starts_on, meet_date, updated_at)
        values (v_pid, v_aid, v_uid, v_name, v_weeks, v_start, v_meet, now())
        returning rev into v_rev;
      exception when insufficient_privilege or check_violation or unique_violation or invalid_datetime_format or datetime_field_overflow then
        v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'denied', 'program_id', v_pid));
        continue;
      end;
      update public.program_group_members set program_id = v_pid, pushed_rev = v_group.rev, pushed_at = now()
       where group_id = p_group_id and athlete_id = v_aid;
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'created', 'program_id', v_pid, 'rev', v_rev));
      continue;
    end if;

    if v_live.athlete_id is distinct from v_aid or v_live.coach_id is distinct from v_uid then
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'not_found', 'program_id', v_pid));
      continue;
    end if;
    v_exp := case when coalesce(v_row->>'rev', '') ~ '^[0-9]{1,18}$' then (v_row->>'rev')::bigint end;
    if v_exp is null or v_live.rev is distinct from v_exp then
      -- The lifter logged (or someone saved) since the app read it: rebuild this row and try again.
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'stale', 'program_id', v_pid, 'rev', v_live.rev));
      continue;
    end if;
    if coalesce(v_row->'replace', 'false'::jsonb) = 'true'::jsonb and position('"srcId"' in coalesce(v_live.weeks::text, '')) = 0 then
      -- The lifter's own block gives way to the team's. Whatever they logged in it (as it is now,
      -- under this row lock: a set logged after the app read it is in here too) is kept as a past
      -- block first, in this transaction. No past blocks table: refused, nothing written.
      if jsonb_typeof(v_live.weeks) = 'array' and jsonb_path_exists(v_live.weeks,
           '$[*].days[*].exercises[*].sets[*] ? (@.completed == true || @.skipped == true || @.missed == true)', '{}', true) then
        if to_regclass('public.program_blocks') is null then
          v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'needs_archive', 'program_id', v_pid, 'rev', v_live.rev));
          continue;
        end if;
        begin
          insert into public.program_blocks (athlete_id, coach_id, name, weeks, maxes, stats, started_on, ended_on)
          select v_aid, v_uid, left(coalesce(nullif(btrim(v_live.name), ''), 'Block'), 120), v_live.weeks,
                 case when jsonb_typeof(v_live.maxes) = 'object' then v_live.maxes end,
                 jsonb_build_object('sets', count(s.v), 'done', count(s.v) filter (where s.v->'completed' = 'true'::jsonb),
                   'sessions', count(distinct (w.v->>'number') || '|' || coalesce(d.v->>'name', '')) filter (where s.v->'completed' = 'true'::jsonb)),
                 min(public.program_set_logged_on(s.v)) filter (where s.v->'completed' = 'true'::jsonb),
                 max(public.program_set_logged_on(s.v)) filter (where s.v->'completed' = 'true'::jsonb)
            from jsonb_array_elements(v_live.weeks) w(v)
            cross join lateral jsonb_array_elements(case when jsonb_typeof(w.v->'days') = 'array' then w.v->'days' else '[]'::jsonb end) d(v)
            cross join lateral jsonb_array_elements(case when jsonb_typeof(d.v->'exercises') = 'array' then d.v->'exercises' else '[]'::jsonb end) e(v)
            cross join lateral jsonb_array_elements(case when jsonb_typeof(e.v->'sets') = 'array' then e.v->'sets' else '[]'::jsonb end) s(v)
          returning id into v_block;
        exception when insufficient_privilege or check_violation then
          v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'needs_archive', 'program_id', v_pid, 'rev', v_live.rev));
          continue;
        end;
      end if;
      v_keep := v_weeks;
      v_live.starts_on := v_start;   -- a new block: the team's dates
      v_live.meet_date := v_meet;
    else
      v_keep := public.program_keep_logged_sets(v_live.weeks, v_weeks);
    end if;
    if v_keep is null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'stale', 'program_id', v_pid, 'rev', v_live.rev));
      continue;
    end if;
    update public.programs set weeks = v_keep, name = v_name, rev = v_live.rev, updated_at = now(),
           starts_on = coalesce(v_live.starts_on, v_start), meet_date = coalesce(v_live.meet_date, v_meet)
     where id = v_pid returning rev into v_rev;
    if not found then
      v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'denied', 'program_id', v_pid));
      continue;
    end if;
    update public.program_group_members set program_id = v_pid, pushed_rev = v_group.rev, pushed_at = now()
     where group_id = p_group_id and athlete_id = v_aid;
    v_out := v_out || jsonb_build_array(jsonb_build_object('athlete_id', v_aid, 'status', 'updated', 'program_id', v_pid, 'rev', v_rev,
      'kept', v_keep is distinct from v_weeks) || case when v_block is null then '{}'::jsonb else jsonb_build_object('archived', v_block) end);
  end loop;
  return v_out;
end;
$$;
revoke all on function public.push_group_programs(uuid, bigint, jsonb) from public, anon;
grant execute on function public.push_group_programs(uuid, bigint, jsonb) to authenticated;

commit;

-- Verify:
--   select to_regclass('public.program_groups'), to_regclass('public.program_group_members');
--   select proname, prosecdef from pg_proc where proname in ('push_group_programs', 'program_keep_logged_sets');  -- prosecdef false
--   select tgname from pg_trigger where tgname = 'trg_pgm_coach_change';
