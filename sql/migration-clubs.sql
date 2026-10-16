-- =====================================================================
-- migration-clubs.sql — POWALIFTA Clubs (non-coaching communities)
-- ---------------------------------------------------------------------
-- A club is a gym team, uni club or barbell club. Lifters join with a
-- 6-character code (or straight from the public directory). Joining shares
-- ONE denormalised stats row with fellow members only — display name, sex,
-- bodyweight, best competition-equivalent squat/bench/deadlift, total, DOTS,
-- and this week's sessions + tonnage. Never programs, never logs, never email.
--
-- Clubs are deliberately separate from coaching: no coach_id, no athlete-slot
-- tier limits, nothing to buy (so nothing for Apple 3.1.1 to object to).
-- One club per lifter in v1 (UNIQUE user_id). Anyone can start one, free.
--
-- Writes go through SECURITY DEFINER RPCs (create_club / join_club) — there is
-- no client INSERT policy on either table, same trust pattern as claim_invite.
-- A member may only rewrite their OWN stats row (column guard trigger), the
-- owner may edit the club's name/city/description/visibility, and the owner
-- or an admin may remove members. Fully idempotent — safe to re-run.
-- Depends on: profiles. Apply any time after migration-profiles-rls.sql.
-- Account deletion (#33) cascades through both tables via profiles(id).
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.clubs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 2 and 60),
  city         text check (city is null or char_length(city) <= 60),
  description  text check (description is null or char_length(description) <= 280),
  code         text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  visibility   text not null default 'public' check (visibility in ('public', 'private')),
  owner_id     uuid not null references public.profiles(id) on delete cascade,
  member_count int  not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists clubs_directory_idx on public.clubs (visibility, member_count desc);

create table if not exists public.club_members (
  club_id          uuid not null references public.clubs(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  role             text not null default 'member' check (role in ('owner', 'admin', 'member')),
  display_name     text not null check (char_length(btrim(display_name)) between 1 and 60),
  sex              text check (sex in ('male', 'female')),
  bodyweight_kg    numeric check (bodyweight_kg is null or bodyweight_kg between 20 and 400),
  squat_kg         numeric check (squat_kg is null or squat_kg between 0 and 700),
  bench_kg         numeric check (bench_kg is null or bench_kg between 0 and 500),
  deadlift_kg      numeric check (deadlift_kg is null or deadlift_kg between 0 and 700),
  total_kg         numeric check (total_kg is null or total_kg between 0 and 1600),
  dots             numeric check (dots is null or dots between 0 and 800),
  week_start       date,
  week_sessions    int     not null default 0 check (week_sessions between 0 and 21),
  week_tonnage_kg  numeric not null default 0 check (week_tonnage_kg between 0 and 500000),
  stats_updated_at timestamptz,
  joined_at        timestamptz not null default now(),
  primary key (club_id, user_id),
  unique (user_id)
);
create index if not exists club_members_club_idx on public.club_members (club_id);

-- Apple 1.2 (user-generated content): a way to report an objectionable club.
create table if not exists public.club_reports (
  id          uuid primary key default gen_random_uuid(),
  club_id     uuid references public.clubs(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  reason      text not null check (char_length(btrim(reason)) between 3 and 500),
  created_at  timestamptz not null default now()
);

alter table public.clubs        enable row level security;
alter table public.club_members enable row level security;
alter table public.club_reports enable row level security;

-- ---------- helpers (DEFINER so policies never recurse into club_members RLS)
create or replace function public.is_club_member(p_club uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = p_club and user_id = auth.uid());
$$;
create or replace function public.club_role(p_club uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from club_members where club_id = p_club and user_id = auth.uid();
$$;

-- ---------- policies
-- Directory: public clubs are visible to any signed-in user; private ones to members only.
drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select to authenticated
  using (visibility = 'public' or public.is_club_member(id));
drop policy if exists clubs_owner_update on public.clubs;
create policy clubs_owner_update on public.clubs for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists clubs_owner_delete on public.clubs;
create policy clubs_owner_delete on public.clubs for delete to authenticated
  using (owner_id = auth.uid());

-- Fellow members see each other's shared stats row. Nobody else does.
drop policy if exists cm_read on public.club_members;
create policy cm_read on public.club_members for select to authenticated
  using (public.is_club_member(club_id));
drop policy if exists cm_self_update on public.club_members;
create policy cm_self_update on public.club_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Leave (yourself) or remove (owner/admin). The owner can't leave — trigger below.
drop policy if exists cm_delete on public.club_members;
create policy cm_delete on public.club_members for delete to authenticated
  using (user_id = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

drop policy if exists cr_insert on public.club_reports;
create policy cr_insert on public.club_reports for insert to authenticated
  with check (reporter_id = auth.uid());
drop policy if exists cr_admin_read on public.club_reports;
create policy cr_admin_read on public.club_reports for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- column guards
-- Owner edits name/city/description/visibility only; code, owner, count are system-owned.
create or replace function public.clubs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('powa.club_sys', true) = '1' then return new; end if;
  new.id := old.id; new.code := old.code; new.owner_id := old.owner_id;
  new.member_count := old.member_count; new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists clubs_guard on public.clubs;
create trigger clubs_guard before update on public.clubs
  for each row execute function public.clubs_guard();

-- A member rewrites their stats + display name, never club / user / role / joined_at.
create or replace function public.club_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('powa.club_sys', true) = '1' then return new; end if;
  new.club_id := old.club_id; new.user_id := old.user_id;
  new.role := old.role; new.joined_at := old.joined_at;
  return new;
end $$;
drop trigger if exists club_members_guard on public.club_members;
create trigger club_members_guard before update on public.club_members
  for each row execute function public.club_members_guard();

-- The owner can't simply leave (they delete the club instead) — unless the club
-- or their whole account is already being deleted (cascades must go through).
create or replace function public.club_members_owner_stays()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and exists (select 1 from clubs where id = old.club_id)
     and exists (select 1 from profiles where id = old.user_id) then
    raise exception 'The owner can''t leave — delete the club instead' using errcode = 'check_violation';
  end if;
  return old;
end $$;
drop trigger if exists club_members_owner_stays on public.club_members;
create trigger club_members_owner_stays before delete on public.club_members
  for each row execute function public.club_members_owner_stays();

-- Keep clubs.member_count honest for the directory.
create or replace function public.club_members_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('powa.club_sys', '1', true);
  if tg_op = 'INSERT' then
    update clubs set member_count = member_count + 1 where id = new.club_id;
  elsif tg_op = 'DELETE' then
    update clubs set member_count = greatest(member_count - 1, 0) where id = old.club_id;
  end if;
  perform set_config('powa.club_sys', '', true);
  return null;
end $$;
drop trigger if exists club_members_count on public.club_members;
create trigger club_members_count after insert or delete on public.club_members
  for each row execute function public.club_members_count();

-- ---------- RPCs (the only way to create a club or a membership)
create or replace function public.gen_club_code()
returns text language plpgsql security definer set search_path = public as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from clubs where code = c);
  end loop;
  return c;
end $$;

create or replace function public.create_club(
  p_name text, p_city text default null, p_description text default null,
  p_visibility text default 'public', p_display_name text default null)
returns public.clubs language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c clubs; nm text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if exists (select 1 from club_members where user_id = uid) then
    raise exception 'You''re already in a club — leave it first' using errcode = 'unique_violation';
  end if;
  nm := coalesce(nullif(btrim(p_display_name), ''),
                 (select nullif(btrim(name), '') from profiles where id = uid), 'Lifter');
  perform set_config('powa.club_sys', '1', true);
  insert into clubs (name, city, description, code, visibility, owner_id)
  values (btrim(p_name), nullif(btrim(p_city), ''), nullif(btrim(p_description), ''),
          gen_club_code(), case when p_visibility = 'private' then 'private' else 'public' end, uid)
  returning * into c;
  insert into club_members (club_id, user_id, role, display_name)
  values (c.id, uid, 'owner', left(nm, 60));
  perform set_config('powa.club_sys', '', true);
  select * into c from clubs where id = c.id;
  return c;
end $$;

create or replace function public.join_club(p_code text, p_display_name text default null)
returns public.clubs language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c clubs; nm text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select * into c from clubs where code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'No club with that code' using errcode = 'P0002'; end if;
  if exists (select 1 from club_members where user_id = uid and club_id = c.id) then return c; end if;
  if exists (select 1 from club_members where user_id = uid) then
    raise exception 'You''re already in a club — leave it first' using errcode = 'unique_violation';
  end if;
  nm := coalesce(nullif(btrim(p_display_name), ''),
                 (select nullif(btrim(name), '') from profiles where id = uid), 'Lifter');
  insert into club_members (club_id, user_id, role, display_name)
  values (c.id, uid, 'member', left(nm, 60));
  select * into c from clubs where id = c.id;
  return c;
end $$;

revoke all on function public.gen_club_code() from public;
revoke all on function public.create_club(text, text, text, text, text) from public;
revoke all on function public.join_club(text, text) from public;
grant execute on function public.create_club(text, text, text, text, text) to authenticated;
grant execute on function public.join_club(text, text) to authenticated;
grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.club_role(uuid) to authenticated;

-- ---------- verification (run after applying)
-- select tablename, rowsecurity from pg_tables where tablename in ('clubs','club_members','club_reports');
-- select proname, prosecdef from pg_proc where proname in ('create_club','join_club','is_club_member');
