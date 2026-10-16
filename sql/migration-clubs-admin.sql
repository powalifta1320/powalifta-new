-- =====================================================================
-- migration-clubs-admin.sql — platform-admin moderation for Clubs
-- ---------------------------------------------------------------------
-- The admin dashboard's Clubs tab (admin.html) lets the platform admin see and
-- moderate EVERY club, public and private: edit a club's name / city / about /
-- visibility, remove a member, see pending join requests, lift a ban, remove a
-- post, or delete the whole club. migration-clubs-social(-2).sql only gave the
-- admin read on clubs + read/delete on posts and reports (for the Club reports
-- tab); members, requests and bans were visible to that club's own owner/admins
-- only, and only the owner could edit or delete a club. This file adds the
-- missing admin-only policies, all keyed on public.is_admin() (the existing
-- SECURITY DEFINER helper; this file depends on it, it does not redefine it):
--
--   clubs               SELECT (re-assert) · UPDATE · DELETE
--                       clubs_admin_read · clubs_admin_update · clubs_admin_delete
--   club_members        SELECT · DELETE          cm_admin_read · cm_admin_delete
--   club_join_requests  SELECT                   cjr_admin_read
--   club_bans           SELECT · DELETE          cban_admin_read · cban_admin_delete
--   club_posts          SELECT · DELETE (re-assert)   cp_admin_read · cp_admin_delete
--   club_reports        SELECT · DELETE (re-assert)   cr_admin_read · cr_admin_delete
--
-- Policies are permissive, so they OR with the existing member / owner ones:
-- nothing changes for ordinary lifters. No INSERT policy anywhere, so the admin
-- can't create clubs or memberships, add bans, or post as anyone. Answering a
-- join request stays the club owner's call (respond_club_request). Each check
-- is written (select public.is_admin()) so Postgres evaluates it once per
-- statement, not once per row, on the hot member/feed reads it now ORs into.
--
-- How the existing triggers treat an admin (checked against migration-clubs.sql,
-- -social.sql and -social-2.sql):
--   · clubs_guard (BEFORE UPDATE) still freezes id / code / owner_id /
--     member_count / created_at unless powa.club_sys is set, so an admin edit
--     can only change name / city / description / visibility, same as the
--     owner's. Public → private still rotates the join code.
--   · club_members_owner_stays (BEFORE DELETE) still refuses to delete the
--     OWNER's membership while the club exists. The admin UI never offers
--     "Remove" for the owner; it offers "Delete club" instead.
--   · club_members_ban_on_remove (AFTER DELETE) fires on an admin removal:
--     auth.uid() is the admin, not the member, so the lifter is BANNED from that
--     club with banned_by = the admin. That's intended: a lifter the platform
--     removed shouldn't walk straight back in with the code. The admin (or the
--     club's owner) can lift it with "Allow back" (cban_admin_delete).
--   · club_members_after_leave + club_members_count (SECURITY DEFINER) still
--     run: the removed lifter's posts in that club go, member_count stays true.
--   · Deleting a club cascades club_members, club_posts, club_join_requests and
--     club_bans (all ON DELETE CASCADE). owner_stays and ban_on_remove both see
--     the club already gone during the cascade, so neither blocks nor bans.
--     club_reports are KEPT: club_id → NULL (FK is SET NULL since -social-2),
--     club_name + post_snapshot keep the evidence, post_id → NULL as posts go.
--
-- Run AFTER migration-clubs-social-2.sql. Idempotent — safe to re-run.
-- =====================================================================

-- Fail loudly (and change nothing) if the prerequisites aren't there yet.
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_admin') then
    raise exception 'public.is_admin() is missing. It ships with the base admin migrations; create it first.';
  end if;
  if to_regclass('public.club_join_requests') is null or to_regclass('public.club_bans') is null then
    raise exception 'Run migration-clubs.sql, migration-clubs-social.sql and migration-clubs-social-2.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- clubs: read every club (private too), edit the owner-editable fields,
-- delete. clubs_guard keeps code / owner / count system-owned.
-- ---------------------------------------------------------------------
drop policy if exists clubs_admin_read on public.clubs;
create policy clubs_admin_read on public.clubs for select to authenticated
  using ((select public.is_admin()));
drop policy if exists clubs_admin_update on public.clubs;
create policy clubs_admin_update on public.clubs for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists clubs_admin_delete on public.clubs;
create policy clubs_admin_delete on public.clubs for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- club_members: read every member row, remove a member (never the owner:
-- club_members_owner_stays refuses; removing bans them, see header).
-- ---------------------------------------------------------------------
drop policy if exists cm_admin_read on public.club_members;
create policy cm_admin_read on public.club_members for select to authenticated
  using ((select public.is_admin()));
drop policy if exists cm_admin_delete on public.club_members;
create policy cm_admin_delete on public.club_members for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- club_join_requests: read-only for the admin.
-- ---------------------------------------------------------------------
drop policy if exists cjr_admin_read on public.club_join_requests;
create policy cjr_admin_read on public.club_join_requests for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- club_bans: see who was removed from a club, and let them back.
-- ---------------------------------------------------------------------
drop policy if exists cban_admin_read on public.club_bans;
create policy cban_admin_read on public.club_bans for select to authenticated
  using ((select public.is_admin()));
drop policy if exists cban_admin_delete on public.club_bans;
create policy cban_admin_delete on public.club_bans for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- club_posts + club_reports: re-assert the moderation policies from
-- migration-clubs-social.sql §5 / -social-2 §6b (cr_admin_read moves from an
-- inline profiles lookup to is_admin(), same as every other admin policy).
-- ---------------------------------------------------------------------
drop policy if exists cp_admin_read on public.club_posts;
create policy cp_admin_read on public.club_posts for select to authenticated
  using ((select public.is_admin()));
drop policy if exists cp_admin_delete on public.club_posts;
create policy cp_admin_delete on public.club_posts for delete to authenticated
  using ((select public.is_admin()));
drop policy if exists cr_admin_read on public.club_reports;
create policy cr_admin_read on public.club_reports for select to authenticated
  using ((select public.is_admin()));
drop policy if exists cr_admin_delete on public.club_reports;
create policy cr_admin_delete on public.club_reports for delete to authenticated
  using ((select public.is_admin()));

-- ---------- verification (run after applying)
-- 1. All 12 admin policies are in place (expect 12 rows):
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public'
--    and policyname in ('clubs_admin_read','clubs_admin_update','clubs_admin_delete',
--                       'cm_admin_read','cm_admin_delete','cjr_admin_read',
--                       'cban_admin_read','cban_admin_delete',
--                       'cp_admin_read','cp_admin_delete','cr_admin_read','cr_admin_delete')
--  order by tablename, policyname;
-- 2. is_admin() is SECURITY DEFINER with a pinned search_path (expect prosecdef = true):
-- select proname, prosecdef, proconfig from pg_proc where proname = 'is_admin';
-- 3. The triggers the admin actions rely on are still there (expect 5 rows):
-- select tgrelid::regclass, tgname from pg_trigger
--  where tgname in ('clubs_guard','club_members_owner_stays','club_members_ban_on_remove',
--                   'club_members_after_leave','club_members_count');
-- 4. What deleting a club does to each child table (expect 'c' = cascade for
--    club_members, club_posts, club_join_requests, club_bans; 'n' = set null for club_reports):
-- select conrelid::regclass as child, confdeltype from pg_constraint
--  where confrelid = 'public.clubs'::regclass and contype = 'f' order by 1;
-- 5. Ordinary lifters are unaffected: in the SQL Editor's role picker,
--    impersonate a NON-admin user (the default postgres role bypasses RLS);
--    this still returns only their own club's member rows (0 if in no club):
-- select count(*) from club_members;
