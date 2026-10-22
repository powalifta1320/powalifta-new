-- migration-meet-day-2026-10-22.sql — POWALIFTA (brief M8: the attempt planner + the meet-day board)
--
--   meets.attempt_plan    the coach's attempt plan on a lifter's PLANNED meet: { v, strategy, sex,
--                         squat: [opener, second, third], bench, deadlift, note } in kg. The coach writes
--                         it through the planned-meet policies (migration-meet-calendar, row 41); the
--                         lifter reads it and meet mode lifts from it. A plan is never a result.
--   meet_days             one coach's board for one meet: name, date, federation, division, flights
--                         ({ "A": { "start": "2026-10-24T09:00:00Z" } }), status setup | live | done.
--   meet_day_lifters      who lifts: the athlete (null for a guest with no account), their planned meet,
--                         flight, lot, weigh-in bodyweight, class, rack heights, and `live` (what the
--                         board says is next for them: the lifter's phone reads it).
--   meet_attempts         one row per lifter × lift × attempt: kg, status planned | declared | good | no,
--                         how many times the declared bar changed, client_at (when the mark was made on
--                         the device, ms) and updated_at (the server's stamp).
--
-- RLS: the meet day's coach reads and writes its guests and the lifters on their roster RIGHT NOW (a
-- lifter who left is out of reach, meet_day_can_touch); a lifter reads their own lifter row and their
-- own attempts (and the day's name and date), nothing about anyone else. Helpers are SECURITY DEFINER
-- with search_path pinned, so the policies never recurse into each other. A finished day's attempts and
-- lifters can't be deleted (deleting the day itself still cascades). Only the lifter's coach writes
-- meets.attempt_plan. A lifter who leaves stops getting "your next attempt" from the old coach's board.
--
-- meet_day_lifter_patch(id, patch) one lifter's CHANGED fields from the board; rack keys merge, so two
--                         laptops editing different fields of one lifter offline both keep their edit.
--
-- meet_day_sync(day, cells, live)   the board's outbox going up. Per cell: a device that saw the
--                         server's latest stamp wins; otherwise a result (good / no) beats a declaration
--                         and two of a kind go to the later mark. Mirrors meetday.js localWins.
-- finish_meet_day(day)    writes each lifter's DONE meet (their planned meet becomes the result, or a new
--                         row): best good lift per discipline, bodyweight, class, the attempts in the
--                         notes. Only a lifter on the coach's roster right now; guests are skipped. Best
--                         totals and DOTS move only then (the app counts done meets only). Only on the
--                         day or within a week after it; a NEW result row (no planned meet) only for a
--                         meet held today or yesterday, so a coach never backdates a result.
--
-- Realtime: all three tables in supabase_realtime with REPLICA IDENTITY FULL.
-- Needs migration-meet-calendar-2026-10-22.sql (meets.status) first. Run any time: the app keeps plans
-- and boards on the device until this exists. Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
alter table public.meets add column if not exists attempt_plan jsonb;
alter table public.meets drop constraint if exists meets_attempt_plan_shape;
alter table public.meets add constraint meets_attempt_plan_shape
  check (attempt_plan is null or (jsonb_typeof(attempt_plan) = 'object' and octet_length(attempt_plan::text) <= 2048));

-- 2 -----------------------------------------------------------------------------------
create table if not exists public.meet_days (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.profiles(id) on delete cascade,
  name             text not null default 'Meet' check (char_length(btrim(name)) between 1 and 80),
  meet_date        date not null,
  federation       text not null default '' check (char_length(federation) <= 40),
  division         text not null default '' check (char_length(division) <= 80),
  status           text not null default 'setup' check (status in ('setup', 'live', 'done')),
  flights          jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(flights) = 'object' and octet_length(flights::text) <= 2048),
  sec_per_attempt  smallint not null default 60 check (sec_per_attempt between 30 and 300),
  break_sec        smallint not null default 600 check (break_sec between 0 and 3600),
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.meet_days add column if not exists break_sec smallint not null default 600;
alter table public.meet_days drop constraint if exists meet_days_break_sec_range;
alter table public.meet_days add constraint meet_days_break_sec_range check (break_sec between 0 and 3600);
create index if not exists meet_days_coach_date on public.meet_days (coach_id, meet_date desc);

create table if not exists public.meet_day_lifters (
  id               uuid primary key default gen_random_uuid(),
  meet_day_id      uuid not null references public.meet_days(id) on delete cascade,
  athlete_id       uuid references public.profiles(id) on delete cascade,      -- null: a guest lifter
  meet_id          uuid references public.meets(id) on delete set null,        -- their planned meet
  name             text not null check (char_length(btrim(name)) between 1 and 80),
  sex              text check (sex is null or sex in ('male', 'female')),
  flight           text not null default 'A' check (flight ~ '^[A-Z]$'),
  lot              smallint check (lot is null or lot between 1 and 999),
  bodyweight_kg    numeric(6,2) check (bodyweight_kg is null or bodyweight_kg between 20 and 300),
  weight_class     text not null default '' check (char_length(weight_class) <= 12),
  rack             jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(rack) = 'object' and octet_length(rack::text) <= 1024),
  live             jsonb check (live is null or (jsonb_typeof(live) = 'object' and octet_length(live::text) <= 1024)),
  result_meet_id   uuid references public.meets(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (meet_day_id, athlete_id)
);
create index if not exists meet_day_lifters_day on public.meet_day_lifters (meet_day_id);
create index if not exists meet_day_lifters_athlete on public.meet_day_lifters (athlete_id) where athlete_id is not null;
create index if not exists meet_day_lifters_meet on public.meet_day_lifters (meet_id) where meet_id is not null;
create index if not exists meet_day_lifters_result on public.meet_day_lifters (result_meet_id) where result_meet_id is not null;

create table if not exists public.meet_attempts (
  id               uuid primary key default gen_random_uuid(),
  meet_day_id      uuid not null references public.meet_days(id) on delete cascade,
  lifter_id        uuid not null references public.meet_day_lifters(id) on delete cascade,
  athlete_id       uuid,                    -- copied from the lifter row (the lifter reads their own)
  lift             text not null check (lift in ('squat', 'bench', 'deadlift')),
  n                smallint not null check (n between 1 and 3),
  kg               numeric(6,2) check (kg is null or kg between 20 and 600),
  status           text not null default 'planned' check (status in ('planned', 'declared', 'good', 'no')),
  changes          smallint not null default 0 check (changes between 0 and 20),
  client_at        bigint not null default 0,          -- ms, when the mark was made on the device
  updated_at       timestamptz not null default now(), -- the server's stamp
  updated_by       uuid,
  unique (lifter_id, lift, n)
);
create index if not exists meet_attempts_day on public.meet_attempts (meet_day_id);
create index if not exists meet_attempts_athlete on public.meet_attempts (athlete_id) where athlete_id is not null;

alter table public.meet_days enable row level security;
alter table public.meet_day_lifters enable row level security;
alter table public.meet_attempts enable row level security;

-- 3 -----------------------------------------------------------------------------------
create or replace function public.meet_day_is_coach(p_day uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.meet_days d where d.id = p_day and d.coach_id = auth.uid()) $$;

create or replace function public.meet_day_has_lifter(p_day uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.meet_day_lifters l where l.meet_day_id = p_day and l.athlete_id = auth.uid()) $$;

-- The coach may touch a row of the board: their board, and a guest or a lifter on their roster RIGHT NOW.
-- A lifter who left keeps their rows, but the old coach can no longer read, mark or push to them.
create or replace function public.meet_day_can_touch(p_day uuid, p_athlete uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select public.meet_day_is_coach(p_day)
         and (p_athlete is null or exists (select 1 from public.profiles p where p.id = p_athlete and p.coach_id = auth.uid())) $$;

revoke all on function public.meet_day_is_coach(uuid) from public, anon;
revoke all on function public.meet_day_has_lifter(uuid) from public, anon;
revoke all on function public.meet_day_can_touch(uuid, uuid) from public, anon;
grant execute on function public.meet_day_is_coach(uuid) to authenticated;
grant execute on function public.meet_day_has_lifter(uuid) to authenticated;
grant execute on function public.meet_day_can_touch(uuid, uuid) to authenticated;

drop policy if exists "meet_days_coach" on public.meet_days;
create policy "meet_days_coach" on public.meet_days
  for all to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));
drop policy if exists "meet_days_lifter_read" on public.meet_days;
create policy "meet_days_lifter_read" on public.meet_days
  for select to authenticated using (public.meet_day_has_lifter(id));

drop policy if exists "meet_day_lifters_coach_read" on public.meet_day_lifters;
create policy "meet_day_lifters_coach_read" on public.meet_day_lifters
  for select to authenticated using (public.meet_day_can_touch(meet_day_id, athlete_id));
-- A lifter on the board is a guest or an athlete on the coach's roster right now.
drop policy if exists "meet_day_lifters_coach_insert" on public.meet_day_lifters;
create policy "meet_day_lifters_coach_insert" on public.meet_day_lifters
  for insert to authenticated
  with check (public.meet_day_is_coach(meet_day_id)
              and (athlete_id is null or exists (select 1 from public.profiles p where p.id = athlete_id and p.coach_id = (select auth.uid()))));
drop policy if exists "meet_day_lifters_coach_update" on public.meet_day_lifters;
create policy "meet_day_lifters_coach_update" on public.meet_day_lifters
  for update to authenticated
  using (public.meet_day_can_touch(meet_day_id, athlete_id))
  with check (public.meet_day_can_touch(meet_day_id, athlete_id));
drop policy if exists "meet_day_lifters_coach_delete" on public.meet_day_lifters;
create policy "meet_day_lifters_coach_delete" on public.meet_day_lifters
  for delete to authenticated using (public.meet_day_can_touch(meet_day_id, athlete_id));
drop policy if exists "meet_day_lifters_own_read" on public.meet_day_lifters;
create policy "meet_day_lifters_own_read" on public.meet_day_lifters
  for select to authenticated using (athlete_id = (select auth.uid()));

drop policy if exists "meet_attempts_coach" on public.meet_attempts;
create policy "meet_attempts_coach" on public.meet_attempts
  for all to authenticated
  using (public.meet_day_can_touch(meet_day_id, athlete_id))
  with check (public.meet_day_can_touch(meet_day_id, athlete_id));
drop policy if exists "meet_attempts_own_read" on public.meet_attempts;
create policy "meet_attempts_own_read" on public.meet_attempts
  for select to authenticated using (athlete_id = (select auth.uid()));

revoke all on public.meet_days, public.meet_day_lifters, public.meet_attempts from anon;
grant select, insert, update, delete on public.meet_days, public.meet_day_lifters, public.meet_attempts to authenticated;

-- 4 -----------------------------------------------------------------------------------
-- Column guards (the service role, the SQL editor and finish_meet_day are not guarded).
create or replace function public.meet_days_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.coach_id := auth.uid();
    new.created_at := now();
    new.finished_at := null;
    if new.status = 'done' then new.status := 'setup'; end if;
    return new;
  end if;
  new.id := old.id; new.coach_id := old.coach_id; new.created_at := old.created_at; new.finished_at := old.finished_at;
  if old.status = 'done' then raise exception 'this meet is finished' using errcode = '55000'; end if;
  if new.status = 'done' then raise exception 'finish a meet with finish_meet_day' using errcode = '42501'; end if;
  return new;
end;
$$;
drop trigger if exists trg_meet_days_guard on public.meet_days;
create trigger trg_meet_days_guard before insert or update on public.meet_days
  for each row execute function public.meet_days_guard();

create or replace function public.meet_day_lifters_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.name := btrim(new.name);
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'UPDATE' then
    new.id := old.id; new.meet_day_id := old.meet_day_id; new.athlete_id := old.athlete_id;
    new.created_at := old.created_at; new.result_meet_id := old.result_meet_id;
  else
    new.created_at := now(); new.result_meet_id := null;
  end if;
  if (select d.status from public.meet_days d where d.id = new.meet_day_id) = 'done' then
    raise exception 'this meet is finished' using errcode = '55000';
  end if;
  -- The planned meet must be this athlete's own (never a pointer into someone else's meets).
  if new.meet_id is not null and (new.athlete_id is null
      or not exists (select 1 from public.meets m where m.id = new.meet_id and m.athlete_id = new.athlete_id)) then
    new.meet_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_meet_day_lifters_guard on public.meet_day_lifters;
create trigger trg_meet_day_lifters_guard before insert or update on public.meet_day_lifters
  for each row execute function public.meet_day_lifters_guard();

create or replace function public.meet_attempts_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_day uuid; v_ath uuid; v_status text;
begin
  if tg_op = 'UPDATE' then
    new.id := old.id; new.lifter_id := old.lifter_id; new.lift := old.lift; new.n := old.n;
  end if;
  select l.meet_day_id, l.athlete_id into v_day, v_ath from public.meet_day_lifters l where l.id = new.lifter_id;
  new.meet_day_id := v_day; new.athlete_id := v_ath;
  new.updated_at := now();
  if current_user not in ('anon', 'authenticated') then return new; end if;
  new.updated_by := auth.uid();
  select d.status into v_status from public.meet_days d where d.id = v_day;
  if v_status = 'done' then raise exception 'this meet is finished' using errcode = '55000'; end if;
  return new;
end;
$$;
drop trigger if exists trg_meet_attempts_guard on public.meet_attempts;
create trigger trg_meet_attempts_guard before insert or update on public.meet_attempts
  for each row execute function public.meet_attempts_guard();

-- A finished meet's board is the record of its results: its attempts and lifters stay. Deleting the
-- whole meet day still cascades (the day row is gone by then, so the check passes).
create or replace function public.meet_day_rows_delete_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then return old; end if;
  if exists (select 1 from public.meet_days d where d.id = old.meet_day_id and d.status = 'done') then
    raise exception 'this meet is finished' using errcode = '55000';
  end if;
  return old;
end;
$$;
drop trigger if exists trg_meet_attempts_delete_guard on public.meet_attempts;
create trigger trg_meet_attempts_delete_guard before delete on public.meet_attempts
  for each row execute function public.meet_day_rows_delete_guard();
drop trigger if exists trg_meet_day_lifters_delete_guard on public.meet_day_lifters;
create trigger trg_meet_day_lifters_delete_guard before delete on public.meet_day_lifters
  for each row execute function public.meet_day_rows_delete_guard();

-- The attempt plan is the coach's: only the lifter's coach writes meets.attempt_plan (the lifter's own
-- edits to their planned meet keep the coach's plan as it was; meet mode calls it "your coach's plan").
create or replace function public.meet_is_my_athlete(p_athlete uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles p where p.id = p_athlete and p.coach_id = auth.uid()) $$;
revoke all on function public.meet_is_my_athlete(uuid) from public, anon;
grant execute on function public.meet_is_my_athlete(uuid) to authenticated;

create or replace function public.meets_attempt_plan_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    if new.attempt_plan is not null and not public.meet_is_my_athlete(new.athlete_id) then new.attempt_plan := null; end if;
  elsif new.attempt_plan is distinct from old.attempt_plan and not public.meet_is_my_athlete(old.athlete_id) then
    new.attempt_plan := old.attempt_plan;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_meets_attempt_plan_guard on public.meets;
create trigger trg_meets_attempt_plan_guard before insert or update on public.meets
  for each row execute function public.meets_attempt_plan_guard();

-- When a lifter leaves the coach, the old coach's unfinished boards stop telling their phone what is next.
create or replace function public.meet_day_unlink() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public.meet_day_lifters l set live = null
   where l.athlete_id = new.id and l.live is not null
     and l.meet_day_id in (select d.id from public.meet_days d where d.coach_id = old.coach_id and d.status <> 'done');
  return new;
end;
$$;
revoke all on function public.meet_day_unlink() from public, anon, authenticated;
drop trigger if exists trg_profiles_meet_day_unlink on public.profiles;
create trigger trg_profiles_meet_day_unlink after update of coach_id on public.profiles
  for each row when (old.coach_id is distinct from new.coach_id) execute function public.meet_day_unlink();

-- 5 -----------------------------------------------------------------------------------
-- The per-cell rule (meetday.js localWins): does the device's mark beat the server's row?
create or replace function public.meet_attempt_local_wins(s_status text, s_at bigint, s_stamp timestamptz,
                                                          l_status text, l_at bigint, l_base timestamptz)
returns boolean language sql immutable
set search_path = public, pg_temp
as $$
  select case
    when s_stamp is not null and l_base is not null and s_stamp <= l_base then true
    when l_status in ('good', 'no') and s_status not in ('good', 'no') then true
    when s_status in ('good', 'no') and l_status not in ('good', 'no') then false
    else coalesce(l_at, 0) > coalesce(s_at, 0)
  end
$$;

create or replace function public.meet_attempt_json(a public.meet_attempts) returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', a.id, 'lifterId', a.lifter_id, 'lift', a.lift, 'n', a.n, 'kg', a.kg, 'status', a.status,
                            'changes', a.changes, 'at', a.client_at, 'srvAt', a.updated_at, 'by', a.updated_by)
$$;

-- The board's outbox. cells: [{ lifterId, lift, n, kg, status, changes, at, base }] (≤ 500);
-- live: [{ id, live }] (what each lifter's phone shows). Returns { cells: [rows as kept], at }.
-- Security invoker: RLS decides (only the meet day's coach can write).
create or replace function public.meet_day_sync(p_day uuid, p_cells jsonb, p_live jsonb default null) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  c jsonb; x jsonb; cur public.meet_attempts; v_rows jsonb := '[]'::jsonb;
  v_lifter uuid; v_lift text; v_n int; v_status text; v_kg numeric; v_changes int; v_at bigint; v_base timestamptz;
begin
  if not public.meet_day_is_coach(p_day) then raise exception 'not your meet day' using errcode = '42501'; end if;
  if (select d.status from public.meet_days d where d.id = p_day) = 'done' then
    raise exception 'this meet is finished' using errcode = '55000';
  end if;
  if p_cells is not null and jsonb_typeof(p_cells) = 'array' then
    if jsonb_array_length(p_cells) > 500 then raise exception 'too many cells' using errcode = '22023'; end if;
    for c in select value from jsonb_array_elements(p_cells) loop
      continue when jsonb_typeof(c) <> 'object';
      v_lifter := case when coalesce(c->>'lifterId', '') ~* '^[0-9a-f-]{36}$' then (c->>'lifterId')::uuid end;
      v_lift := c->>'lift';
      v_n := case when coalesce(c->>'n', '') ~ '^[1-3]$' then (c->>'n')::int end;
      v_status := c->>'status';
      continue when v_lifter is null or v_n is null or v_lift not in ('squat', 'bench', 'deadlift')
                 or v_status not in ('planned', 'declared', 'good', 'no');
      continue when not exists (select 1 from public.meet_day_lifters l where l.id = v_lifter and l.meet_day_id = p_day);
      v_kg := case when coalesce(c->>'kg', '') ~ '^[0-9]+(\.[0-9]+)?$' and (c->>'kg')::numeric between 20 and 600
                   then round((c->>'kg')::numeric * 2) / 2 end;
      v_changes := least(20, greatest(0, case when coalesce(c->>'changes', '') ~ '^[0-9]+$' then (c->>'changes')::int else 0 end));
      v_at := case when coalesce(c->>'at', '') ~ '^[0-9]{1,15}$' then (c->>'at')::bigint else 0 end;
      v_base := null;
      begin v_base := nullif(c->>'base', '')::timestamptz; exception when others then v_base := null; end;

      select * into cur from public.meet_attempts a where a.lifter_id = v_lifter and a.lift = v_lift and a.n = v_n for update;
      if not found then
        insert into public.meet_attempts (meet_day_id, lifter_id, lift, n, kg, status, changes, client_at)
        values (p_day, v_lifter, v_lift, v_n, v_kg, v_status, v_changes, v_at)
        returning * into cur;
      elsif public.meet_attempt_local_wins(cur.status, cur.client_at, cur.updated_at, v_status, v_at, v_base) then
        update public.meet_attempts a set kg = v_kg, status = v_status, changes = greatest(cur.changes, v_changes), client_at = v_at
         where a.id = cur.id returning * into cur;
      elsif v_changes > cur.changes then
        update public.meet_attempts a set changes = v_changes where a.id = cur.id returning * into cur;
      end if;
      v_rows := v_rows || jsonb_build_array(public.meet_attempt_json(cur));
    end loop;
  end if;
  if p_live is not null and jsonb_typeof(p_live) = 'array' then
    for x in select value from jsonb_array_elements(p_live) loop
      continue when jsonb_typeof(x) <> 'object' or coalesce(x->>'id', '') !~* '^[0-9a-f-]{36}$';
      update public.meet_day_lifters l set live = case when jsonb_typeof(x->'live') = 'object' then x->'live' end
       where l.id = (x->>'id')::uuid and l.meet_day_id = p_day;
    end loop;
  end if;
  update public.meet_days d set status = 'live' where d.id = p_day and d.status = 'setup'
     and exists (select 1 from public.meet_attempts a where a.meet_day_id = p_day and a.status in ('good', 'no'));
  return jsonb_build_object('cells', v_rows, 'at', now());
end;
$$;
revoke all on function public.meet_day_sync(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.meet_day_sync(uuid, jsonb, jsonb) to authenticated;
revoke all on function public.meet_attempt_local_wins(text, bigint, timestamptz, text, bigint, timestamptz) from public, anon;
grant execute on function public.meet_attempt_local_wins(text, bigint, timestamptz, text, bigint, timestamptz) to authenticated;
revoke all on function public.meet_attempt_json(public.meet_attempts) from public, anon;
grant execute on function public.meet_attempt_json(public.meet_attempts) to authenticated;

-- One lifter's changed fields from the board (meetday.js lifterPatch): only the keys present are
-- written, and rack keys merge into the row's rack, so two laptops editing different fields of one
-- lifter offline both keep their edit. Security invoker: RLS and the column guard decide.
create or replace function public.meet_day_lifter_patch(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare r public.meet_day_lifters;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch' using errcode = '22023'; end if;
  update public.meet_day_lifters l set
    name          = case when p_patch ? 'name' and coalesce(btrim(p_patch->>'name'), '') <> '' then left(btrim(p_patch->>'name'), 80) else l.name end,
    sex           = case when p_patch ? 'sex' then case when p_patch->>'sex' in ('male', 'female') then p_patch->>'sex' end else l.sex end,
    flight        = case when p_patch ? 'flight' and coalesce(p_patch->>'flight', '') ~ '^[A-Z]$' then p_patch->>'flight' else l.flight end,
    lot           = case when p_patch ? 'lot' then case when coalesce(p_patch->>'lot', '') ~ '^[0-9]{1,3}$' and (p_patch->>'lot')::int between 1 and 999 then (p_patch->>'lot')::smallint end else l.lot end,
    bodyweight_kg = case when p_patch ? 'bodyweight_kg' then case when coalesce(p_patch->>'bodyweight_kg', '') ~ '^[0-9]{1,3}(\.[0-9]+)?$' and (p_patch->>'bodyweight_kg')::numeric between 20 and 300 then round((p_patch->>'bodyweight_kg')::numeric, 2) end else l.bodyweight_kg end,
    weight_class  = case when p_patch ? 'weight_class' then left(coalesce(p_patch->>'weight_class', ''), 12) else l.weight_class end,
    rack          = case when jsonb_typeof(p_patch->'rack') = 'object' then l.rack || (p_patch->'rack') else l.rack end
   where l.id = p_id
  returning * into r;
  if not found then return null; end if;
  return to_jsonb(r);
end;
$$;
revoke all on function public.meet_day_lifter_patch(uuid, jsonb) from public, anon;
grant execute on function public.meet_day_lifter_patch(uuid, jsonb) to authenticated;

-- 6 -----------------------------------------------------------------------------------
-- Finish: the done meets (mirrors meetday.js finishResults). Security definer, so the coach's write of
-- a RESULT passes the meets guard; who may do it is checked here: the meet day's coach, for lifters on
-- their roster right now. A planned meet becomes the result (same row); a result the lifter saved
-- themselves is never overwritten. Calling it again answers what it did the first time.
create or replace function public.finish_meet_day(p_day uuid) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  d public.meet_days; l public.meet_day_lifters;
  v_sq numeric; v_bp numeric; v_dl numeric; v_taken int; v_made int; v_notes text; v_meet uuid; v_status text;
  v_res jsonb := '[]'::jsonb; v_skip jsonb := '[]'::jsonb;
begin
  select * into d from public.meet_days where id = p_day for update;
  if not found or d.coach_id is distinct from auth.uid() then raise exception 'not your meet day' using errcode = '42501'; end if;
  if d.status <> 'done' and (d.meet_date > current_date + 1 or d.meet_date < current_date - 7) then
    raise exception 'a meet day is finished on the day (or within a week after it)' using errcode = '22023';
  end if;
  if d.status = 'done' then
    return jsonb_build_object('ok', true, 'already', true, 'results',
      coalesce((select jsonb_agg(jsonb_build_object('lifterId', x.id, 'athleteId', x.athlete_id, 'meetId', x.result_meet_id))
                  from public.meet_day_lifters x where x.meet_day_id = p_day and x.result_meet_id is not null), '[]'::jsonb), 'skipped', '[]'::jsonb);
  end if;
  for l in select * from public.meet_day_lifters x where x.meet_day_id = p_day order by x.flight, x.lot nulls last, x.name loop
    select max(a.kg) filter (where a.lift = 'squat' and a.status = 'good'),
           max(a.kg) filter (where a.lift = 'bench' and a.status = 'good'),
           max(a.kg) filter (where a.lift = 'deadlift' and a.status = 'good'),
           count(*) filter (where a.status in ('good', 'no')),
           count(*) filter (where a.status = 'good')
      into v_sq, v_bp, v_dl, v_taken, v_made
      from public.meet_attempts a where a.lifter_id = l.id;
    continue when v_taken = 0;
    if l.athlete_id is null then
      v_skip := v_skip || jsonb_build_array(jsonb_build_object('lifterId', l.id, 'name', l.name, 'reason', 'guest')); continue;
    end if;
    if not exists (select 1 from public.profiles p where p.id = l.athlete_id and p.coach_id = d.coach_id) then
      v_skip := v_skip || jsonb_build_array(jsonb_build_object('lifterId', l.id, 'name', l.name, 'reason', 'not on your roster')); continue;
    end if;
    select v_made || ' of ' || v_taken || ' made · ' || string_agg(t.part, ' · ' order by t.o) || ' kg · Meet day board' into v_notes
      from (select case a.lift when 'squat' then 1 when 'bench' then 2 else 3 end as o,
                   initcap(a.lift) || ' ' || string_agg((case when a.status = 'no' then 'x' else '' end) || trim_scale(a.kg)::text, ', ' order by a.n) as part
              from public.meet_attempts a where a.lifter_id = l.id and a.status in ('good', 'no') group by a.lift) t;
    v_meet := null; v_status := null;
    select m.id, m.status into v_meet, v_status from public.meets m where m.id = l.meet_id and m.athlete_id = l.athlete_id;
    if v_meet is null then
      select m.id, m.status into v_meet, v_status from public.meets m
       where m.athlete_id = l.athlete_id and m.meet_date = d.meet_date and m.status = 'planned' order by m.created_at limit 1;
    end if;
    if v_meet is not null and v_status = 'done' then
      v_skip := v_skip || jsonb_build_array(jsonb_build_object('lifterId', l.id, 'name', l.name, 'reason', 'already saved', 'meetId', v_meet)); continue;
    end if;
    -- No planned meet to turn into the result: a new result row only for a meet held today (or
    -- yesterday). A coach never backdates a result into a lifter's history.
    if v_meet is null and d.meet_date not between current_date - 1 and current_date + 1 then
      v_skip := v_skip || jsonb_build_array(jsonb_build_object('lifterId', l.id, 'name', l.name, 'reason', 'no planned meet')); continue;
    end if;
    if v_meet is not null then
      update public.meets m set status = 'done', name = d.name, meet_date = d.meet_date,
             federation = coalesce(nullif(d.federation, ''), m.federation), division = coalesce(nullif(d.division, ''), m.division),
             weight_class = coalesce(nullif(l.weight_class, ''), m.weight_class), bodyweight_kg = coalesce(l.bodyweight_kg, m.bodyweight_kg),
             squat_kg = v_sq, bench_kg = v_bp, deadlift_kg = v_dl, notes = left(v_notes, 500)
       where m.id = v_meet;
    else
      insert into public.meets (athlete_id, name, meet_date, federation, division, weight_class, bodyweight_kg, squat_kg, bench_kg, deadlift_kg, notes, status)
      values (l.athlete_id, d.name, d.meet_date, d.federation, d.division, l.weight_class, l.bodyweight_kg, v_sq, v_bp, v_dl, left(v_notes, 500), 'done')
      returning id into v_meet;
    end if;
    update public.meet_day_lifters x set result_meet_id = v_meet where x.id = l.id;
    v_res := v_res || jsonb_build_array(jsonb_build_object('lifterId', l.id, 'athleteId', l.athlete_id, 'meetId', v_meet,
               'squat', v_sq, 'bench', v_bp, 'deadlift', v_dl, 'made', v_made, 'taken', v_taken));
  end loop;
  update public.meet_days x set status = 'done', finished_at = now() where x.id = p_day;
  return jsonb_build_object('ok', true, 'results', v_res, 'skipped', v_skip);
end;
$$;
revoke all on function public.finish_meet_day(uuid) from public, anon;
grant execute on function public.finish_meet_day(uuid) to authenticated;

-- 7 -----------------------------------------------------------------------------------
-- Live on the lifter's phone and on a second laptop at the table. RLS still decides what arrives.
alter table public.meet_days replica identity full;
alter table public.meet_day_lifters replica identity full;
alter table public.meet_attempts replica identity full;
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['meet_days', 'meet_day_lifters', 'meet_attempts'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

commit;

-- Verify:
--   select count(*) from public.meet_days;                                  -- 0 until a coach starts one
--   select to_regprocedure('public.finish_meet_day(uuid)');                 -- not null
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename like 'meet%';
