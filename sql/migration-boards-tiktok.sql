-- ============================================================
-- POWALIFTA — fair club boards + TikTok links (2026-10-17)
--
-- Owner: "not just ranked by DOTS… if it's DOTS the same people dominate", and
-- "add TikTok along with Instagram".
--
-- 1. TikTok handle on profiles + club_members, stored bare and lower case like
--    instagram (migration-instagram.sql). TikTok's rules: 2–24 letters, numbers,
--    _ and ., never ending in a period. Backfills the club copy.
-- 2. Four numbers each member's app writes on its own club row, for the boards
--    anyone can win: points this week, PRs this week, hard sets this week, and
--    4-week improvement % against their own earlier best. club_members_guard
--    (migration-clubs-social-2.sql) only pins club_id / user_id / role /
--    joined_at, so members can already write new columns on their own row; the
--    CHECKs keep the numbers in range.
-- 3. The public coach directory (list_public_coaches) returns tiktok too. Its
--    return type changes, so it is dropped and recreated with exactly the rules
--    of migration-profiles-privacy.sql (safe columns only, hidden coaches stay
--    hidden except to their own athletes).
--
-- 4. Seasons: season_id / season_points / prev_season_points on club_members
--    (8-week seasons of weekly points; last season's champion is read off them).
-- 5. Training buddies: club_buddies + request / respond / end / nudge RPCs.
--
-- One transaction; safe to run twice. Run AFTER migration-profiles-privacy.sql.
-- The app already sends these fields and drops any column that isn't there
-- yet, so nothing breaks before this runs.
-- ============================================================

begin;

-- 1. TikTok -------------------------------------------------------------------
alter table public.profiles add column if not exists tiktok text;
do $$ begin
  alter table public.profiles add constraint profiles_tiktok_handle
    check (tiktok is null or tiktok ~ '^[a-z0-9._]{1,23}[a-z0-9_]$');
exception when duplicate_object then null; end $$;

alter table public.club_members add column if not exists tiktok text;
do $$ begin
  alter table public.club_members add constraint club_members_tiktok_handle
    check (tiktok is null or tiktok ~ '^[a-z0-9._]{1,23}[a-z0-9_]$');
exception when duplicate_object then null; end $$;

update public.club_members m set tiktok = p.tiktok
  from public.profiles p
 where p.id = m.user_id and p.tiktok is not null and m.tiktok is distinct from p.tiktok;

-- 2. Fair boards ---------------------------------------------------------------
alter table public.club_members add column if not exists week_points int;
alter table public.club_members add column if not exists week_prs int;
alter table public.club_members add column if not exists week_hard_sets int;
alter table public.club_members add column if not exists improve_pct numeric;
do $$ begin
  alter table public.club_members add constraint club_members_week_points_range
    check (week_points is null or week_points between 0 and 1000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.club_members add constraint club_members_week_prs_range
    check (week_prs is null or week_prs between 0 and 10);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.club_members add constraint club_members_week_hard_sets_range
    check (week_hard_sets is null or week_hard_sets between 0 and 500);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.club_members add constraint club_members_improve_pct_range
    check (improve_pct is null or improve_pct between -100 and 1000);
exception when duplicate_object then null; end $$;

-- Seasons (8-week blocks): this season's points so far + last season's final,
-- each written by the member's own app (the champion is read off these).
alter table public.club_members add column if not exists season_id int;
alter table public.club_members add column if not exists season_points int;
alter table public.club_members add column if not exists prev_season_points int;
do $$ begin
  alter table public.club_members add constraint club_members_season_points_range
    check ((season_points is null or season_points between 0 and 10000)
       and (prev_season_points is null or prev_season_points between 0 and 10000));
exception when duplicate_object then null; end $$;

-- 4. Training buddies ------------------------------------------------------------
-- Two members of the same club pair up (ask → yes). Each sees the other's week
-- (already on the board) and can send one nudge every 12 hours, which arrives
-- as a push with fixed words (send-push only lets a buddy say "nudged you").
-- One buddy per lifter; one open ask at a time; blocks either way stop it;
-- leaving the club ends it. No client INSERT/UPDATE/DELETE: RPCs only.
create table if not exists public.club_buddies (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_nudge_by uuid,
  last_nudge_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index if not exists club_buddies_pair
  on public.club_buddies (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists club_buddies_requester_idx on public.club_buddies (requester_id);
create index if not exists club_buddies_addressee_idx on public.club_buddies (addressee_id);
alter table public.club_buddies enable row level security;
drop policy if exists cbud_read on public.club_buddies;
create policy cbud_read on public.club_buddies for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
revoke all on public.club_buddies from anon;

create or replace function public.club_blocked_either(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_blocks
                  where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.request_club_buddy(p_buddy uuid)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); my_club uuid; their_club uuid; r public.club_buddies%rowtype;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  if p_buddy is null or p_buddy = uid then raise exception 'Pick someone else' using errcode = 'check_violation'; end if;
  perform pg_advisory_xact_lock(hashtext('club-buddy:' || least(uid, p_buddy)::text || greatest(uid, p_buddy)::text));
  select club_id into my_club from club_members where user_id = uid;
  select club_id into their_club from club_members where user_id = p_buddy;
  if my_club is null or their_club is distinct from my_club then
    raise exception 'You can only pair up with someone in your club' using errcode = '42501'; end if;
  if public.club_blocked_either(uid, p_buddy) then
    raise exception 'You can''t pair up with this lifter' using errcode = '42501'; end if;
  if exists (select 1 from club_buddies where status = 'active' and uid in (requester_id, addressee_id)) then
    raise exception 'You already have a training buddy' using errcode = 'check_violation'; end if;
  if exists (select 1 from club_buddies where status = 'active' and p_buddy in (requester_id, addressee_id)) then
    raise exception 'They already have a training buddy' using errcode = 'check_violation'; end if;
  -- They asked me first: that's a yes from both sides.
  select * into r from club_buddies where requester_id = p_buddy and addressee_id = uid;
  if found then
    update club_buddies set status = 'active', accepted_at = now() where id = r.id;
    delete from club_buddies where status = 'pending' and id <> r.id
      and (uid in (requester_id, addressee_id) or p_buddy in (requester_id, addressee_id));
    return 'active';
  end if;
  delete from club_buddies where requester_id = uid and status = 'pending';   -- one open ask at a time
  insert into club_buddies (club_id, requester_id, addressee_id) values (my_club, uid, p_buddy)
    on conflict do nothing;
  return 'pending';
end $$;

create or replace function public.respond_club_buddy(p_id uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.club_buddies%rowtype;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select * into r from club_buddies where id = p_id for update;
  if not found or r.addressee_id <> uid then raise exception 'That request is gone' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then return r.status; end if;
  if not coalesce(p_accept, false) or public.club_blocked_either(uid, r.requester_id) then
    delete from club_buddies where id = p_id; return 'declined';
  end if;
  if exists (select 1 from club_buddies where status = 'active' and id <> p_id
              and (uid in (requester_id, addressee_id) or r.requester_id in (requester_id, addressee_id))) then
    delete from club_buddies where id = p_id; return 'taken';
  end if;
  update club_buddies set status = 'active', accepted_at = now() where id = p_id;
  delete from club_buddies where status = 'pending' and id <> p_id
    and (uid in (requester_id, addressee_id) or r.requester_id in (requester_id, addressee_id));
  return 'active';
end $$;

-- Ends my pair, cancels my open ask, and turns down anything waiting for me.
create or replace function public.end_club_buddy()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  delete from club_buddies where auth.uid() in (requester_id, addressee_id);
end $$;

-- Returns the buddy's id when a nudge goes out; NULL when I already nudged in
-- the last 12 hours (no raise, so nothing is rolled back).
create or replace function public.nudge_club_buddy()
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.club_buddies%rowtype; other uuid;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select * into r from club_buddies where status = 'active' and uid in (requester_id, addressee_id) for update;
  if not found then raise exception 'No training buddy yet' using errcode = 'P0002'; end if;
  other := case when r.requester_id = uid then r.addressee_id else r.requester_id end;
  if public.club_blocked_either(uid, other) then raise exception 'You can''t nudge this lifter' using errcode = '42501'; end if;
  if r.last_nudge_by = uid and r.last_nudge_at > now() - interval '12 hours' then return null; end if;
  update club_buddies set last_nudge_by = uid, last_nudge_at = now() where id = r.id;
  return other;
end $$;

-- Leaving (or being removed from) the club ends the pair and any open ask.
create or replace function public.club_members_end_buddy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from club_buddies where club_id = old.club_id and old.user_id in (requester_id, addressee_id);
  return null;
end $$;
drop trigger if exists club_members_end_buddy on public.club_members;
create trigger club_members_end_buddy after delete on public.club_members
  for each row execute function public.club_members_end_buddy();

revoke all on function public.club_blocked_either(uuid, uuid) from public, anon, authenticated;
revoke all on function public.request_club_buddy(uuid) from public, anon;
revoke all on function public.respond_club_buddy(uuid, boolean) from public, anon;
revoke all on function public.end_club_buddy() from public, anon;
revoke all on function public.nudge_club_buddy() from public, anon;
grant execute on function public.request_club_buddy(uuid) to authenticated;
grant execute on function public.respond_club_buddy(uuid, boolean) to authenticated;
grant execute on function public.end_club_buddy() to authenticated;
grant execute on function public.nudge_club_buddy() to authenticated;

-- 3. Coach directory with TikTok ------------------------------------------------
drop function if exists public.list_public_coaches();
create function public.list_public_coaches()
returns table (id uuid, name text, bio text, avatar_url text, country_code text, instagram text, tiktok text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.bio, p.avatar_url, p.country_code, p.instagram, p.tiktok, p.created_at
    from public.profiles p
   where p.user_type = 'coach'
     and (coalesce(p.directory_hidden, false) = false
          or p.id = (select me.coach_id from public.profiles me where me.id = (select auth.uid())))
   order by p.created_at
$$;
revoke all on function public.list_public_coaches() from public;
grant execute on function public.list_public_coaches() to anon, authenticated;

commit;

-- Verify (optional):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'club_members'
--    and column_name in ('tiktok','week_points','week_prs','week_hard_sets','improve_pct');
-- select * from public.list_public_coaches() limit 3;   -- has a tiktok column
