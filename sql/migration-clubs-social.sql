-- =====================================================================
-- migration-clubs-social.sql — Clubs v2: find a club, ask to join, and the
-- club feed ("social media for powerlifters").
-- ---------------------------------------------------------------------
-- 1. DIRECTORY. Every club, public AND private, is findable by name or city
--    through search_clubs(): a SECURITY DEFINER read that returns only the
--    directory card (name, city, about, visibility, member count, and the
--    caller's own status). It never returns the join code, the members or the
--    posts, so a private club stays private: you can see it exists and ask.
-- 2. JOIN OR ASK. join_or_request_club(club) joins a PUBLIC club straight
--    away. For a PRIVATE club it files a request that the owner or an admin
--    answers with respond_club_request(). A code from a member still joins
--    directly (join_club, unchanged): a code is an invitation. Max 5 open
--    requests per lifter; a declined lifter can ask again after 7 days.
-- 3. FEED. club_posts: a member shares a set, a PR, a session or a note with
--    their club. Members read; the author or an owner/admin deletes; nobody
--    edits. display_name + created_at are stamped server-side. Leaving (or
--    being removed from) a club takes your posts with you. 40 posts/day cap.
-- 4. SAFETY (App Store 1.2, user-generated content): report a post
--    (club_reports.post_id), block a lifter (club_blocks — their posts drop
--    out of your feed, enforced in RLS), owner/admin removal of posts.
--
-- Idempotent — safe to re-run. Run AFTER migration-clubs.sql.
-- Account deletion (#33) cascades through every new table via profiles(id).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 2. Join requests
-- ---------------------------------------------------------------------
create table if not exists public.club_join_requests (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  message      text check (message is null or char_length(message) <= 140),
  status       text not null default 'pending' check (status in ('pending', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  unique (club_id, user_id)
);
create index if not exists club_join_requests_club_idx on public.club_join_requests (club_id, status, created_at desc);
create index if not exists club_join_requests_user_idx on public.club_join_requests (user_id, status);
alter table public.club_join_requests enable row level security;

-- The requester sees their own; the club's owner/admins see theirs. Writes go
-- through the RPCs below only (no insert/update policy). A requester may
-- withdraw a pending request.
drop policy if exists cjr_read on public.club_join_requests;
create policy cjr_read on public.club_join_requests for select to authenticated
  using (user_id = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));
drop policy if exists cjr_cancel on public.club_join_requests;
create policy cjr_cancel on public.club_join_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- ---------------------------------------------------------------------
-- 3. Feed
-- ---------------------------------------------------------------------
create table if not exists public.club_posts (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  display_name text not null default 'Lifter',
  kind         text not null default 'set' check (kind in ('set', 'pr', 'session', 'note')),
  lift         text check (lift is null or lift in ('squat', 'bench', 'deadlift', 'push', 'pull', 'legs', 'cardio', 'other')),
  exercise     text check (exercise is null or char_length(exercise) <= 60),
  weight_kg    numeric check (weight_kg is null or weight_kg between 0 and 1000),
  reps         int     check (reps is null or reps between 0 and 100),
  rpe          numeric check (rpe is null or rpe between 1 and 10),
  e1rm_kg      numeric check (e1rm_kg is null or e1rm_kg between 0 and 1000),
  sets_count   int     check (sets_count is null or sets_count between 0 and 200),
  tonnage_kg   numeric check (tonnage_kg is null or tonnage_kg between 0 and 500000),
  caption      text    check (caption is null or char_length(caption) <= 280),
  created_at   timestamptz not null default now()
);
create index if not exists club_posts_feed_idx on public.club_posts (club_id, created_at desc);
create index if not exists club_posts_user_idx on public.club_posts (user_id, created_at desc);
alter table public.club_posts enable row level security;

-- ---------------------------------------------------------------------
-- 4. Blocks + post reports
-- ---------------------------------------------------------------------
create table if not exists public.club_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.club_blocks enable row level security;
drop policy if exists cb_own_read on public.club_blocks;
create policy cb_own_read on public.club_blocks for select to authenticated using (blocker_id = auth.uid());
drop policy if exists cb_own_insert on public.club_blocks;
create policy cb_own_insert on public.club_blocks for insert to authenticated with check (blocker_id = auth.uid());
drop policy if exists cb_own_delete on public.club_blocks;
create policy cb_own_delete on public.club_blocks for delete to authenticated using (blocker_id = auth.uid());

alter table public.club_reports add column if not exists post_id uuid references public.club_posts(id) on delete set null;
alter table public.club_reports add column if not exists reported_user_id uuid references public.profiles(id) on delete set null;

-- Feed policies: members read (minus anyone they blocked), members post as
-- themselves, the author or an owner/admin deletes. No update policy.
drop policy if exists cp_read on public.club_posts;
create policy cp_read on public.club_posts for select to authenticated
  using (public.is_club_member(club_id)
         and not exists (select 1 from public.club_blocks b
                         where b.blocker_id = auth.uid() and b.blocked_id = club_posts.user_id));
drop policy if exists cp_insert on public.club_posts;
create policy cp_insert on public.club_posts for insert to authenticated
  with check (user_id = auth.uid() and public.is_club_member(club_id));
drop policy if exists cp_delete on public.club_posts;
create policy cp_delete on public.club_posts for delete to authenticated
  using (user_id = auth.uid() or public.club_role(club_id) in ('owner', 'admin'));

-- Server-stamped name + time (a member can't post as someone else, or
-- back-date), and a daily cap so one account can't flood a club.
create or replace function public.club_posts_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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
drop trigger if exists club_posts_stamp on public.club_posts;
create trigger club_posts_stamp before insert on public.club_posts
  for each row execute function public.club_posts_stamp();

-- Membership side effects:
--   · joining any club clears your other open requests;
--   · leaving / being removed takes your posts in that club with you.
create or replace function public.club_members_after_join()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from club_join_requests where user_id = new.user_id;
  return null;
end $$;
drop trigger if exists club_members_after_join on public.club_members;
create trigger club_members_after_join after insert on public.club_members
  for each row execute function public.club_members_after_join();

create or replace function public.club_members_after_leave()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from club_posts where club_id = old.club_id and user_id = old.user_id;
  return null;
end $$;
drop trigger if exists club_members_after_leave on public.club_members;
create trigger club_members_after_leave after delete on public.club_members
  for each row execute function public.club_members_after_leave();

-- ---------------------------------------------------------------------
-- 1. Directory + join-or-ask + answer RPCs
-- ---------------------------------------------------------------------
create or replace function public.search_clubs(p_query text default null, p_limit int default 30)
returns table (id uuid, name text, city text, description text, visibility text,
               member_count int, my_status text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); q text;
begin
  if uid is null then return; end if;
  q := btrim(coalesce(p_query, ''));
  q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
  -- Clubs you've asked to join come first, then the biggest.
  return query
    select s.id, s.name, s.city, s.description, s.visibility, s.member_count, s.my_status
    from (
      select c.id, c.name, c.city, c.description, c.visibility, c.member_count, c.created_at,
             case
               when exists (select 1 from club_members m where m.club_id = c.id and m.user_id = uid) then 'member'
               when exists (select 1 from club_join_requests r
                            where r.club_id = c.id and r.user_id = uid and r.status = 'pending') then 'requested'
               else null
             end as my_status
      from clubs c
      where q = '' or c.name ilike '%' || q || '%' or c.city ilike '%' || q || '%'
    ) s
    order by (s.my_status = 'requested') desc nulls last, s.member_count desc, s.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 50);
end $$;

-- Returns 'joined' | 'requested' | 'member'.
create or replace function public.join_or_request_club(
  p_club uuid, p_display_name text default null, p_message text default null)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); c clubs; r club_join_requests; nm text; msg text;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  select * into c from clubs where id = p_club;
  if not found then raise exception 'That club doesn''t exist any more' using errcode = 'P0002'; end if;
  if exists (select 1 from club_members where club_id = c.id and user_id = uid) then return 'member'; end if;
  if exists (select 1 from club_members where user_id = uid) then
    raise exception 'You''re already in a club. Leave it first' using errcode = 'unique_violation';
  end if;
  nm := left(coalesce(nullif(btrim(p_display_name), ''),
                      (select nullif(btrim(name), '') from profiles where id = uid), 'Lifter'), 60);
  msg := nullif(btrim(left(coalesce(p_message, ''), 140)), '');

  if c.visibility = 'public' then
    insert into club_members (club_id, user_id, role, display_name) values (c.id, uid, 'member', nm);
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

-- Owner/admin answers a request. Returns 'accepted' | 'declined' | 'stale'
-- (stale = they joined another club in the meantime; the request is cleared).
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
  insert into club_members (club_id, user_id, role, display_name)
  values (r.club_id, r.user_id, 'member', r.display_name);
  -- (club_members_after_join clears this request + any others they had open)
  return 'accepted';
end $$;

revoke all on function public.search_clubs(text, int) from public;
revoke all on function public.join_or_request_club(uuid, text, text) from public;
revoke all on function public.respond_club_request(uuid, boolean) from public;
grant execute on function public.search_clubs(text, int) to authenticated;
grant execute on function public.join_or_request_club(uuid, text, text) to authenticated;
grant execute on function public.respond_club_request(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Admin moderation + live feed
-- ---------------------------------------------------------------------
-- The admin dashboard's Club reports tab (App Store 1.2: act on reports) needs
-- to see and remove any post, see the (possibly private) club a report names,
-- and dismiss reports. is_admin() is the existing SECURITY DEFINER helper.
drop policy if exists clubs_admin_read on public.clubs;
create policy clubs_admin_read on public.clubs for select to authenticated using (public.is_admin());
drop policy if exists cp_admin_read on public.club_posts;
create policy cp_admin_read on public.club_posts for select to authenticated using (public.is_admin());
drop policy if exists cp_admin_delete on public.club_posts;
create policy cp_admin_delete on public.club_posts for delete to authenticated using (public.is_admin());
drop policy if exists cr_admin_delete on public.club_reports;
create policy cr_admin_delete on public.club_reports for delete to authenticated using (public.is_admin());

-- Live feed (DB.subscribeClubPosts): stream INSERTs on club_posts. Realtime
-- still applies the cp_read policy per subscriber, so only members (minus
-- anyone who blocked the author) receive a post.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_posts') then
    alter publication supabase_realtime add table public.club_posts;
  end if;
end $$;

-- ---------- verification (run after applying)
-- select tablename, rowsecurity from pg_tables
--  where tablename in ('club_join_requests','club_posts','club_blocks');
-- select proname, prosecdef from pg_proc
--  where proname in ('search_clubs','join_or_request_club','respond_club_request','club_posts_stamp');
-- select * from search_clubs('', 5);   -- as a signed-in user: directory cards, no codes
