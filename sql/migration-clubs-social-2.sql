-- =====================================================================
-- migration-clubs-social-2.sql — security fixes for Clubs v2
-- ---------------------------------------------------------------------
-- An adversarial review of migration-clubs.sql + migration-clubs-social.sql
-- found one HIGH and several LOW issues. This file fixes all of them.
-- RUN AFTER migration-clubs-social.sql. Idempotent — safe to re-run.
--
--  HIGH  Join codes never changed, so private-club approval could be skipped:
--        anyone who saw a public club's code could still join after it went
--        private, and a removed member could rejoin straight away with the
--        code they'd seen.
--        → the code rotates when a club goes public → private; the owner can
--          rotate it any time (rotate_club_code); removing a member BANS them
--          (club_bans) and every join path refuses banned lifters; the owner
--          can lift a ban from Manage club.
--  LOW   join_club had no rate limit and told members-of-other-clubs whether a
--        code was real → membership checked first, 20 tries/hour (fail-open if
--        migration-edge-rate-limits.sql isn't applied), a wrong code returns
--        NULL instead of raising (a raise would roll back the counter).
--        Codes now come from gen_random_uuid() bytes, not random().
--  LOW   The 7-day decline cooldown could be skipped by joining + leaving any
--        public club (joining deleted declined rows too) → only pending
--        requests are cleared. A lifter blocked by the club's owner/admin
--        can't request to join it.
--  LOW   Reports trusted the client's club/post/user ids and lost the evidence
--        when the post or club was deleted → a trigger fills club + reported
--        user from the post itself, keeps a snapshot of the post and the club
--        name, post reports require membership, and deleting a club keeps its
--        reports (club_id → NULL).
--  LOW   A member could rename to match the owner and post as them → a
--        rename that collides with another member's name in the same club is
--        ignored, and joining lifters get "Name 2"-style unique names.
--  LOW   Post/request caps could be raced, and the post trigger ran before
--        RLS (leaking another user's daily post count) → per-user advisory
--        locks, and the trigger forces user_id = the caller.
--  INFO  Supabase grants EXECUTE to anon/authenticated by default →
--        revoked on internal helpers and from anon on the RPCs.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Codes: stronger generator, rotate on public → private, owner rotation
-- ---------------------------------------------------------------------
create or replace function public.gen_club_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; c text; i int; b bytea;
begin
  loop
    b := uuid_send(gen_random_uuid());          -- bytes 0..5 are fully random in a v4 uuid
    c := '';
    for i in 0..5 loop
      c := c || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);   -- 256 % 32 = 0 → unbiased
    end loop;
    exit when not exists (select 1 from clubs where code = c);
  end loop;
  return c;
end $$;

create or replace function public.clubs_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('powa.club_sys', true) = '1' then return new; end if;
  new.id := old.id; new.code := old.code; new.owner_id := old.owner_id;
  new.member_count := old.member_count; new.created_at := old.created_at;
  -- Going private: the old code may be all over the internet. Issue a new one.
  if old.visibility = 'public' and new.visibility = 'private' then
    new.code := gen_club_code();
  end if;
  return new;
end $$;

create or replace function public.rotate_club_code(p_club uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  -- coalesce: a NULL role (not a member) must FAIL this check, not slip past it.
  if coalesce(public.club_role(p_club), '') not in ('owner', 'admin') then
    raise exception 'Only the club owner can do that' using errcode = '42501';
  end if;
  c := gen_club_code();
  perform set_config('powa.club_sys', '1', true);
  update clubs set code = c where id = p_club;
  perform set_config('powa.club_sys', '', true);
  return c;
end $$;

-- ---------------------------------------------------------------------
-- 2. Bans: removing a member keeps them out until the owner lets them back
-- ---------------------------------------------------------------------
create table if not exists public.club_bans (
  club_id      uuid not null references public.clubs(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  display_name text not null default 'Lifter',
  banned_by    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (club_id, user_id)
);
alter table public.club_bans enable row level security;
-- Owner/admin see and lift their club's bans. No insert/update policy: the
-- removal trigger below is the only writer. The banned lifter can't read it.
drop policy if exists cban_staff_read on public.club_bans;
create policy cban_staff_read on public.club_bans for select to authenticated
  using (public.club_role(club_id) in ('owner', 'admin'));
drop policy if exists cban_staff_delete on public.club_bans;
create policy cban_staff_delete on public.club_bans for delete to authenticated
  using (public.club_role(club_id) in ('owner', 'admin'));

create or replace function public.is_club_banned(p_club uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_bans where club_id = p_club and user_id = p_user);
$$;

-- Removed by someone else (owner/admin) → ban. Not on a self-leave, and not
-- when the club or the account itself is being deleted (the parent row is
-- already gone in a cascade, and inserting would violate club_bans' FKs).
create or replace function public.club_members_ban_on_remove()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and auth.uid() is distinct from old.user_id
     and exists (select 1 from clubs where id = old.club_id)
     and exists (select 1 from profiles where id = old.user_id) then
    insert into club_bans (club_id, user_id, display_name, banned_by)
    values (old.club_id, old.user_id, old.display_name, auth.uid())
    on conflict (club_id, user_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists club_members_ban_on_remove on public.club_members;
create trigger club_members_ban_on_remove after delete on public.club_members
  for each row execute function public.club_members_ban_on_remove();

-- ---------------------------------------------------------------------
-- 3. Names: one name per person per club, so nobody can post as the owner
-- ---------------------------------------------------------------------
create or replace function public.club_unique_name(p_club uuid, p_name text, p_user uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare base text := left(coalesce(nullif(btrim(p_name), ''), 'Lifter'), 56); cand text := base; n int := 1;
begin
  while exists (select 1 from club_members
                where club_id = p_club and user_id is distinct from p_user
                  and lower(btrim(display_name)) = lower(cand)) loop
    n := n + 1;
    cand := base || ' ' || n;
  end loop;
  return cand;
end $$;

-- A member rewrites their stats + display name, never club / user / role /
-- joined_at — and a rename onto another member's name is ignored.
create or replace function public.club_members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('powa.club_sys', true) = '1' then return new; end if;
  new.club_id := old.club_id; new.user_id := old.user_id;
  new.role := old.role; new.joined_at := old.joined_at;
  if new.display_name is distinct from old.display_name and exists (
       select 1 from club_members m
       where m.club_id = old.club_id and m.user_id <> old.user_id
         and lower(btrim(m.display_name)) = lower(btrim(new.display_name))) then
    new.display_name := old.display_name;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 4. Join paths: membership first, bans, blocks, rate limit, unique names
-- ---------------------------------------------------------------------
-- Returns the club, or NULL for a wrong code (a raise would roll back the
-- rate-limit counter and make guessing free).
create or replace function public.join_club(p_code text, p_display_name text default null)
returns public.clubs language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c clubs; nm text; ok boolean;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  -- Already in a club? Say so before looking at the code, so a code can't be
  -- tested for existence from inside another club.
  select cl.* into c from clubs cl join club_members m on m.club_id = cl.id where m.user_id = uid;
  if found then
    if c.code = upper(btrim(coalesce(p_code, ''))) then return c; end if;
    raise exception 'You''re already in a club. Leave it first' using errcode = 'unique_violation';
  end if;
  if to_regprocedure('public.rl_bump(text,text,integer,integer)') is not null then
    select r.allowed into ok from public.rl_bump('join-club', uid::text, 3600, 20) r;
    if ok is false then
      raise exception 'Too many tries. Wait a bit and try again' using errcode = 'check_violation';
    end if;
  end if;
  select * into c from clubs where code = upper(btrim(coalesce(p_code, '')));
  if not found then return null; end if;
  if public.is_club_banned(c.id, uid) then
    raise exception 'You can''t join this club' using errcode = '42501';
  end if;
  nm := public.club_unique_name(c.id, coalesce(nullif(btrim(p_display_name), ''),
          (select nullif(btrim(name), '') from profiles where id = uid), 'Lifter'));
  insert into club_members (club_id, user_id, role, display_name) values (c.id, uid, 'member', nm);
  select * into c from clubs where id = c.id;
  return c;
end $$;

create or replace function public.join_or_request_club(
  p_club uuid, p_display_name text default null, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c clubs; r club_join_requests; nm text; msg text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext('club-join:' || uid::text));   -- serialise this lifter's joins/requests
  select * into c from clubs where id = p_club;
  if not found then raise exception 'That club doesn''t exist any more' using errcode = 'P0002'; end if;
  if exists (select 1 from club_members where club_id = c.id and user_id = uid) then return 'member'; end if;
  if exists (select 1 from club_members where user_id = uid) then
    raise exception 'You''re already in a club. Leave it first' using errcode = 'unique_violation';
  end if;
  if public.is_club_banned(c.id, uid)
     or exists (select 1 from club_blocks b join club_members s on s.user_id = b.blocker_id
                where s.club_id = c.id and s.role in ('owner', 'admin') and b.blocked_id = uid) then
    raise exception 'You can''t join this club' using errcode = '42501';
  end if;
  nm := left(coalesce(nullif(btrim(p_display_name), ''),
                      (select nullif(btrim(name), '') from profiles where id = uid), 'Lifter'), 60);
  msg := nullif(btrim(left(coalesce(p_message, ''), 140)), '');

  if c.visibility = 'public' then
    insert into club_members (club_id, user_id, role, display_name)
    values (c.id, uid, 'member', public.club_unique_name(c.id, nm));
    return 'joined';
  end if;

  select * into r from club_join_requests where club_id = c.id and user_id = uid;
  if found then
    if r.status = 'pending' then return 'requested'; end if;
    if r.responded_at is not null and r.responded_at > now() - interval '7 days' then
      raise exception 'You can ask this club again in a few days' using errcode = 'check_violation';
    end if;
    update club_join_requests
       set status = 'pending', display_name = nm, message = msg, created_at = now(), responded_at = null
     where id = r.id;
    return 'requested';
  end if;
  if (select count(*) from club_join_requests where user_id = uid and status = 'pending') >= 5 then
    raise exception 'You have 5 requests waiting. Cancel one first' using errcode = 'check_violation';
  end if;
  insert into club_join_requests (club_id, user_id, display_name, message) values (c.id, uid, nm, msg);
  return 'requested';
end $$;

create or replace function public.respond_club_request(p_request uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r club_join_requests; my_role text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select * into r from club_join_requests where id = p_request for update;
  if not found then raise exception 'That request is gone' using errcode = 'P0002'; end if;
  select role into my_role from club_members where club_id = r.club_id and user_id = uid;
  if my_role is null or my_role not in ('owner', 'admin') then
    raise exception 'Only the club owner can answer requests' using errcode = '42501';
  end if;
  if r.status <> 'pending' then return r.status; end if;
  if not coalesce(p_accept, false) then
    update club_join_requests set status = 'declined', responded_at = now() where id = r.id;
    return 'declined';
  end if;
  if exists (select 1 from club_members where user_id = r.user_id) then
    delete from club_join_requests where id = r.id;
    return 'stale';
  end if;
  -- Accepting someone the club had removed lifts their ban (the owner chose to).
  delete from club_bans where club_id = r.club_id and user_id = r.user_id;
  insert into club_members (club_id, user_id, role, display_name)
  values (r.club_id, r.user_id, 'member', public.club_unique_name(r.club_id, r.display_name));
  return 'accepted';
end $$;

-- Joining clears your PENDING requests elsewhere; declined ones stay so the
-- 7-day cooldown holds.
create or replace function public.club_members_after_join()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from club_join_requests where user_id = new.user_id and status = 'pending';
  return null;
end $$;

-- ---------------------------------------------------------------------
-- 5. Posts: the caller is the author, caps can't be raced
-- ---------------------------------------------------------------------
create or replace function public.club_posts_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext('club-post:' || auth.uid()::text));
  new.user_id := auth.uid();
  new.id := gen_random_uuid();
  if (select count(*) from club_posts
      where user_id = new.user_id and created_at > now() - interval '1 day') >= 40 then
    raise exception 'That''s a lot of posts today. Try again tomorrow' using errcode = 'check_violation';
  end if;
  new.display_name := coalesce(
    (select display_name from club_members where club_id = new.club_id and user_id = new.user_id), 'Lifter');
  new.created_at := now();
  new.caption := nullif(btrim(new.caption), '');
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6. Reports: facts from the server, evidence kept
-- ---------------------------------------------------------------------
alter table public.club_reports add column if not exists post_snapshot jsonb;
alter table public.club_reports add column if not exists club_name text;

-- Deleting a club keeps its reports (club_id → NULL; club_name keeps the name).
do $$
declare con record;
begin
  for con in
    select c.conname, c.confdeltype from pg_constraint c
    where c.conrelid = 'public.club_reports'::regclass and c.contype = 'f'
      and c.confrelid = 'public.clubs'::regclass
  loop
    if con.confdeltype <> 'n' then
      execute format('alter table public.club_reports drop constraint %I', con.conname);
      alter table public.club_reports add constraint club_reports_club_id_fkey
        foreign key (club_id) references public.clubs(id) on delete set null;
    end if;
  end loop;
end $$;

create or replace function public.club_reports_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare p club_posts; cname text;
begin
  new.reporter_id := auth.uid();
  new.created_at := now();
  if new.post_id is not null then
    select * into p from club_posts where id = new.post_id;
    if not found then raise exception 'That post is gone' using errcode = 'P0002'; end if;
    new.club_id := p.club_id;
    new.reported_user_id := p.user_id;
    new.post_snapshot := to_jsonb(p);
  else
    new.reported_user_id := null;
    new.post_snapshot := null;
  end if;
  select name into cname from clubs where id = new.club_id;
  new.club_name := cname;
  return new;
end $$;
drop trigger if exists club_reports_stamp on public.club_reports;
create trigger club_reports_stamp before insert on public.club_reports
  for each row execute function public.club_reports_stamp();

-- A post report must come from a member of that post's club (the trigger has
-- already replaced club_id with the post's real club by the time this runs).
drop policy if exists cr_insert on public.club_reports;
create policy cr_insert on public.club_reports for insert to authenticated
  with check (reporter_id = auth.uid() and (post_id is null or public.is_club_member(club_id)));

-- ---------------------------------------------------------------------
-- 6b. Re-assert migration-clubs-social section 5 (admin moderation + live
--     feed), in case an earlier copy of that file was applied without it.
-- ---------------------------------------------------------------------
drop policy if exists clubs_admin_read on public.clubs;
create policy clubs_admin_read on public.clubs for select to authenticated using (public.is_admin());
drop policy if exists cp_admin_read on public.club_posts;
create policy cp_admin_read on public.club_posts for select to authenticated using (public.is_admin());
drop policy if exists cp_admin_delete on public.club_posts;
create policy cp_admin_delete on public.club_posts for delete to authenticated using (public.is_admin());
drop policy if exists cr_admin_delete on public.club_reports;
create policy cr_admin_delete on public.club_reports for delete to authenticated using (public.is_admin());
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_posts') then
    alter publication supabase_realtime add table public.club_posts;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
revoke all on function public.gen_club_code() from public, anon, authenticated;
revoke all on function public.club_unique_name(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.is_club_banned(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rotate_club_code(uuid) from public, anon;
revoke all on function public.join_club(text, text) from public, anon;
revoke all on function public.join_or_request_club(uuid, text, text) from public, anon;
revoke all on function public.respond_club_request(uuid, boolean) from public, anon;
revoke all on function public.search_clubs(text, int) from public, anon;
revoke all on function public.create_club(text, text, text, text, text) from public, anon;
grant execute on function public.rotate_club_code(uuid) to authenticated;
grant execute on function public.join_club(text, text) to authenticated;
grant execute on function public.join_or_request_club(uuid, text, text) to authenticated;
grant execute on function public.respond_club_request(uuid, boolean) to authenticated;
grant execute on function public.search_clubs(text, int) to authenticated;
grant execute on function public.create_club(text, text, text, text, text) to authenticated;

-- ---------- verification (run after applying)
-- select proname, prosecdef from pg_proc
--  where proname in ('rotate_club_code','club_members_ban_on_remove','club_reports_stamp','club_unique_name');
-- select tablename, rowsecurity from pg_tables where tablename = 'club_bans';
-- select confdeltype from pg_constraint where conname = 'club_reports_club_id_fkey';   -- expect 'n'
