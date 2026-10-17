-- ============================================================
-- POWALIFTA — Instagram handle on profiles (2026-10-16)
--
-- A lifter or coach can add their Instagram handle. It shows as an
-- "@handle" link on their You screen, on the lifter card their club sees,
-- in their coach's quick look, and on a coach's public profile.
--
-- Stored as the bare handle (no "@", no URL), lower case, checked against
-- Instagram's own rules (letters, numbers, dots, underscores; max 30), so a
-- stored value can only ever become https://instagram.com/<handle>.
--
-- profiles.instagram       — the source of truth (own-row update via the
--                             existing profiles_self_update policy; not one of
--                             the frozen privileged columns).
-- club_members.instagram   — the copy a club sees, written with the rest of
--                             the lifter's shared stats row (members can't read
--                             each other's profiles). The club_members_guard
--                             trigger already lets a member rewrite their own
--                             stats columns, so no policy change is needed.
--
-- Idempotent. Apply any time; the app fails soft until it runs (the field
-- saves nothing and says so).
-- ============================================================

alter table public.profiles add column if not exists instagram text;
do $$ begin
  alter table public.profiles add constraint profiles_instagram_handle
    check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$');
exception when duplicate_object then null; end $$;

alter table public.club_members add column if not exists instagram text;
do $$ begin
  alter table public.club_members add constraint club_members_instagram_handle
    check (instagram is null or instagram ~ '^[a-z0-9._]{1,30}$');
exception when duplicate_object then null; end $$;

-- Existing members: copy any handle already on the profile.
update public.club_members m
   set instagram = p.instagram
  from public.profiles p
 where p.id = m.user_id
   and p.instagram is not null
   and m.instagram is distinct from p.instagram;

-- ---------- verification (run after applying)
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name in ('profiles', 'club_members') and column_name = 'instagram';
-- select conname from pg_constraint where conname in ('profiles_instagram_handle', 'club_members_instagram_handle');
