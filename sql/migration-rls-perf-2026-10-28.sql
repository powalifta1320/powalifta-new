-- migration-rls-perf-2026-10-28.sql — POWALIFTA
-- Speed only: nobody can read or write a row they couldn't before. Supabase's performance advisor (28 Oct)
-- flagged policies that work out auth.uid() again for every row they look at (auth_rls_initplan, 111),
-- tables where two or more permissive policies answer the same role and command (each one is checked
-- for every row: multiple_permissive_policies, 55) and foreign keys with no index (24). Today, with 33
-- profiles and ~80 logged sets, nobody feels it; with a few thousand sets every list in the app slows down.
--
-- What it does:
--   1. Wraps the per-row calls so Postgres works them out once per query: auth.uid() becomes
--      (select auth.uid()) and the admin helper is_admin() becomes (select is_admin()). is_admin() is
--      STABLE, takes no argument and reads only the signed-in user's own profile row, so one answer per
--      query is the same answer. (powa_is_admin() and challenge_my_coach(), the other zero-argument
--      helpers policies call, are STABLE and row-free too, and are already wrapped wherever they're used.)
--      No policy calls auth.jwt(), auth.role() or current_setting().
--      85 policies are rewritten in place: the 111 the advisor flags less the 29 that step 2 merges, plus
--      3 that call is_admin() the same way with no auth.uid() (client_errors_admin_read, ps_admin_all, programs_admin_all).
--      Each keeps its name, table, command, roles and PERMISSIVE; USING / WITH CHECK change only by the
--      wrapping.
--      The texts were generated from the LIVE policies (pg_policies, 28 Oct): many were made in the
--      dashboard and are in no file in git.
--   2. Merges 26 sets of overlapping permissive policies (55 policies; same table, same roles, same command)
--      into one policy each, whose USING / WITH CHECK is the plain OR of the originals' (wrapped as in step 1).
--      That OR is exactly how Postgres combines permissive policies, so the rows are the same; it just
--      stops checking them one policy at a time. The merged ones get new names (<table>_select,
--      _insert, _update, _delete): re-running an older migration can then only add its own policy back
--      beside them (same rows), never narrow them. Not merged, and why:
--        - a FOR ALL policy overlapping a single-command one (bodyweight, checkins, goals, meet_attempts,
--          meet_days, programs, rest_days, session_notes, workout_logs, program_sales' ps_admin_all):
--          merging across commands would need the ALL policy split up, which this file doesn't do;
--        - session_notes' coach policies are TO public, the athlete's TO authenticated (different roles);
--        - program_sales ps_buyer_read + ps_coach_read, programs programs_admin_all + programs_coach_live:
--          a FOR ALL policy still overlaps them, so merging wouldn't clear the finding.
--      STATUS-check rows 23 and 41 look for profiles_admin_update and meets_coach_plan_insert, which
--      this merges away: they now accept profiles_update / meets_insert too.
--   3. Adds 7 indexes (plain create index: the tables are tiny):
--        workout_logs (athlete_id, date): a lifter's sets by date: the Progress charts, the coach's desk, the Monday report
--        messages (coach_id, created_at desc): the coach's Messages inbox (newest first across all threads)
--        programs (coach_id): the coach's programs; covers programs_coach_id_fkey
--        session_notes (athlete_id, date): a lifter's session notes (and the coach's comment lookup by day); covers session_notes_athlete_id_fkey
--        pain_reports (coach_id): the coach's side of pain_reports_select; covers pain_reports_coach_id_fkey
--        invites (coach_id): the coach's invite list; covers invites_coach_id_fkey
--        program_templates (coach_id): the coach's templates; covers program_templates_coach_id_fkey
--      Not indexed, the other 19 flagged foreign keys:
--        - club tables, read through their club-first keys (and small): club_bans (banned_by, user_id),
--          club_blocks (blocked_id), club_buddies (club_id), club_post_reactions (user_id), clubs (owner_id),
--          club_reports (club_id, post_id, reported_user_id, reporter_id: admin moderation only);
--        - read through another index already: coach_notes (athlete_id: coach_id first), messages
--          (sender_id: the thread), message_reactions (user_id: the message), program_blocks (coach_id:
--          by athlete), program_reviews (buyer_id: by program), program_sales (marketplace_program_id:
--          always with buyer_id);
--        - never filtered on, only touched when an account is deleted: pain_reports (resolved_by),
--          session_notes (coach_id), workout_logs (imported_by).
--      Kept: the 38 indexes the advisor calls unused (too little traffic to judge), and these duplicates
--      (noted, not dropped): checkins_athlete_week_idx repeats the unique (athlete_id, week_start);
--      email_prefs_unsub_token_idx repeats the unique unsub_token; club_members_club_idx,
--      meet_day_lifters_day, messages_coach_idx, program_reviews_program_idx and
--      referral_reward_claims_user_idx are the leading column of another index on the same table.
--   Function grants and search_path are not touched (STATUS row 54's security migration does those).
--
-- How: compare-and-swap. The list below holds each policy's USING / WITH CHECK as live printed them on
-- 28 Oct (using_was / check_was) and as pg_policies prints them after this file (using_now / check_now).
-- A policy is changed only while it still reads as on 28 Oct (whitespace aside), so this file can't undo a
-- later change, row 54's included: anything changed since is left as it is and named in a WARNING. A merge
-- happens only when every policy in it still reads as on 28 Oct. A second run finds everything already
-- done and changes nothing.
--
-- Undo (if ever): run   set powa.rls_perf_undo = 'on';   and then this file again. Every policy this file
-- changed goes back to its 28 Oct text exactly, the merged ones split back into the originals, and the
-- 7 indexes are dropped.
--
-- Tested in PGlite (scratchpad/pgtest/rls-perf-equivalence.mjs): the live schema rebuilt from the
-- catalog (tables, constraints, every function and grant, triggers, every policy, each of which prints
-- back identically); a seeded world (admin, two coaches and their lifters, a coachless lifter, a stranger, an
-- auth user with no profile, clubs, a meet day, challenges, busy weeks, messages, form checks, the
-- marketplace...); every table x anon and 9 users: rows visible (also FOR UPDATE) and every insert,
-- insert-returning, upsert, update and delete probe allowed or refused the same before and after, after a
-- second run and after undo, and also when policies changed since 28 Oct are left alone. Undo gives back
-- the 28 Oct catalog byte for byte; five deliberately wrong edits are all caught.
--
-- Run after STATUS-check rows 1-53; row 54 (security) can go before or after. One transaction.
begin;

-- The right database: every table this file touches, and the helpers its policies call.
do $$
declare missing text[];
begin
  select array_agg(t order by t) into missing
    from unnest(array['bodyweight', 'checkin_answers', 'checkin_questions', 'checkins', 'client_errors', 'club_bans', 'club_blocks', 'club_join_requests', 'club_members', 'club_posts', 'club_reports', 'clubs', 'coach_notes', 'coach_requests', 'email_preferences', 'form_check_annotations', 'form_checks', 'goals', 'health_daily', 'invites', 'leaderboard_entries', 'marketplace_programs', 'meet_day_lifters', 'meets', 'messages', 'nutrition_daily', 'pain_reports', 'profiles', 'program_blocks', 'program_reviews', 'program_sales', 'program_templates', 'programs', 'push_subscriptions', 'referral_reward_claims', 'referrals', 'rest_days', 'schedule_requests', 'session_notes', 'workout_logs']) t
   where to_regclass('public.' || t) is null;
  if missing is not null then
    raise exception 'migration-rls-perf: public.% not found. This is not the POWALIFTA database this file was made for (cxnotrikxvzncupswvio, STATUS rows 1-53 applied). Nothing was changed.', array_to_string(missing, ', public.');
  end if;
  if to_regprocedure('public.is_admin()') is null or to_regprocedure('public.powa_is_admin()') is null
     or to_regprocedure('public.is_current_coach_of(uuid)') is null then
    raise exception 'migration-rls-perf: public.is_admin() / powa_is_admin() / is_current_coach_of(uuid) missing. Nothing was changed.';
  end if;
end $$;

set local search_path = public;

-- 1 + 2. The policies: (table, policy, command, roles, merged into, using_was, check_was, using_now, check_now).
-- Texts are as pg_policies prints them, whitespace runs folded to one space.
create temp table rls_perf_policy (tbl text, pol text, cmd text, roles text[], merge_into text,
  using_was text, check_was text, using_now text, check_now text) on commit drop;
insert into rls_perf_policy values
-- bodyweight.bw_athlete_all (ALL to authenticated)
('bodyweight', 'bw_athlete_all', 'ALL', '{authenticated}', null,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- bodyweight.bw_coach_read (SELECT to authenticated)
('bodyweight', 'bw_coach_read', 'SELECT', '{authenticated}', null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = auth.uid()))) OR is_admin())$q$,
  null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- checkin_answers.checkin_answers_athlete_insert (INSERT to authenticated)
('checkin_answers', 'checkin_answers_athlete_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((athlete_id = auth.uid()) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = auth.uid()))) AND checkin_question_open_to_me(question_id, coach_id))$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid)))) AND checkin_question_open_to_me(question_id, coach_id))$q$),
-- checkin_answers.checkin_answers_athlete_read (SELECT to authenticated) -> checkin_answers_select
('checkin_answers', 'checkin_answers_athlete_read', 'SELECT', '{authenticated}', 'checkin_answers_select',
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- checkin_answers.checkin_answers_athlete_update (UPDATE to authenticated)
('checkin_answers', 'checkin_answers_athlete_update', 'UPDATE', '{authenticated}', null,
  $q$(athlete_id = auth.uid())$q$,
  $q$((athlete_id = auth.uid()) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = auth.uid()))) AND checkin_question_open_to_me(question_id, coach_id))$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid)))) AND checkin_question_open_to_me(question_id, coach_id))$q$),
-- checkin_answers.checkin_answers_coach_read (SELECT to authenticated) -> checkin_answers_select
('checkin_answers', 'checkin_answers_coach_read', 'SELECT', '{authenticated}', 'checkin_answers_select',
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = checkin_answers.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = checkin_answers.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null),
-- checkin_questions.checkin_questions_coach_all (ALL to authenticated)
('checkin_questions', 'checkin_questions_coach_all', 'ALL', '{authenticated}', null,
  $q$(coach_id = auth.uid())$q$,
  $q$(coach_id = auth.uid())$q$,
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$),
-- checkins.checkins_athlete_all (ALL to public)
('checkins', 'checkins_athlete_all', 'ALL', '{public}', null,
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
-- checkins.checkins_coach_select (SELECT to public)
('checkins', 'checkins_coach_select', 'SELECT', '{public}', null,
  $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = checkins.athlete_id) AND (p.coach_id = auth.uid())))) OR is_admin())$q$,
  null,
  $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = checkins.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- client_errors.client_errors_admin_read (SELECT to public)
('client_errors', 'client_errors_admin_read', 'SELECT', '{public}', null,
  $q$is_admin()$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- club_bans.cban_admin_delete (DELETE to authenticated) -> club_bans_delete (nothing to wrap)
('club_bans', 'cban_admin_delete', 'DELETE', '{authenticated}', 'club_bans_delete',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- club_bans.cban_admin_read (SELECT to authenticated) -> club_bans_select (nothing to wrap)
('club_bans', 'cban_admin_read', 'SELECT', '{authenticated}', 'club_bans_select',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- club_bans.cban_staff_delete (DELETE to authenticated) -> club_bans_delete (nothing to wrap)
('club_bans', 'cban_staff_delete', 'DELETE', '{authenticated}', 'club_bans_delete',
  $q$(club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))$q$,
  null,
  $q$(club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))$q$,
  null),
-- club_bans.cban_staff_read (SELECT to authenticated) -> club_bans_select (nothing to wrap)
('club_bans', 'cban_staff_read', 'SELECT', '{authenticated}', 'club_bans_select',
  $q$(club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))$q$,
  null,
  $q$(club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))$q$,
  null),
-- club_blocks.cb_own_delete (DELETE to authenticated)
('club_blocks', 'cb_own_delete', 'DELETE', '{authenticated}', null,
  $q$(blocker_id = auth.uid())$q$,
  null,
  $q$(blocker_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- club_blocks.cb_own_insert (INSERT to authenticated)
('club_blocks', 'cb_own_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$(blocker_id = auth.uid())$q$,
  null,
  $q$(blocker_id = ( SELECT auth.uid() AS uid))$q$),
-- club_blocks.cb_own_read (SELECT to authenticated)
('club_blocks', 'cb_own_read', 'SELECT', '{authenticated}', null,
  $q$(blocker_id = auth.uid())$q$,
  null,
  $q$(blocker_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- club_join_requests.cjr_admin_read (SELECT to authenticated) -> club_join_requests_select (nothing to wrap)
('club_join_requests', 'cjr_admin_read', 'SELECT', '{authenticated}', 'club_join_requests_select',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- club_join_requests.cjr_cancel (DELETE to authenticated)
('club_join_requests', 'cjr_cancel', 'DELETE', '{authenticated}', null,
  $q$((user_id = auth.uid()) AND (status = 'pending'::text))$q$,
  null,
  $q$((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text))$q$,
  null),
-- club_join_requests.cjr_read (SELECT to authenticated) -> club_join_requests_select
('club_join_requests', 'cjr_read', 'SELECT', '{authenticated}', 'club_join_requests_select',
  $q$((user_id = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))$q$,
  null,
  $q$((user_id = ( SELECT auth.uid() AS uid)) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))$q$,
  null),
-- club_members.cm_admin_delete (DELETE to authenticated) -> club_members_delete (nothing to wrap)
('club_members', 'cm_admin_delete', 'DELETE', '{authenticated}', 'club_members_delete',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- club_members.cm_admin_read (SELECT to authenticated) -> club_members_select (nothing to wrap)
('club_members', 'cm_admin_read', 'SELECT', '{authenticated}', 'club_members_select',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- club_members.cm_delete (DELETE to authenticated) -> club_members_delete
('club_members', 'cm_delete', 'DELETE', '{authenticated}', 'club_members_delete',
  $q$((user_id = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))$q$,
  null,
  $q$((user_id = ( SELECT auth.uid() AS uid)) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))$q$,
  null),
-- club_members.cm_read (SELECT to authenticated) -> club_members_select (nothing to wrap)
('club_members', 'cm_read', 'SELECT', '{authenticated}', 'club_members_select',
  $q$is_club_member(club_id)$q$,
  null,
  $q$is_club_member(club_id)$q$,
  null),
-- club_members.cm_self_update (UPDATE to authenticated)
('club_members', 'cm_self_update', 'UPDATE', '{authenticated}', null,
  $q$(user_id = auth.uid())$q$,
  $q$(user_id = auth.uid())$q$,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$),
-- club_posts.cp_admin_delete (DELETE to authenticated) -> club_posts_delete (nothing to wrap)
('club_posts', 'cp_admin_delete', 'DELETE', '{authenticated}', 'club_posts_delete',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- club_posts.cp_admin_read (SELECT to authenticated) -> club_posts_select (nothing to wrap)
('club_posts', 'cp_admin_read', 'SELECT', '{authenticated}', 'club_posts_select',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- club_posts.cp_delete (DELETE to authenticated) -> club_posts_delete
('club_posts', 'cp_delete', 'DELETE', '{authenticated}', 'club_posts_delete',
  $q$((user_id = auth.uid()) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))$q$,
  null,
  $q$((user_id = ( SELECT auth.uid() AS uid)) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))$q$,
  null),
-- club_posts.cp_insert (INSERT to authenticated)
('club_posts', 'cp_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((user_id = auth.uid()) AND is_club_member(club_id))$q$,
  null,
  $q$((user_id = ( SELECT auth.uid() AS uid)) AND is_club_member(club_id))$q$),
-- club_posts.cp_read (SELECT to authenticated) -> club_posts_select
('club_posts', 'cp_read', 'SELECT', '{authenticated}', 'club_posts_select',
  $q$(is_club_member(club_id) AND (NOT (EXISTS ( SELECT 1 FROM club_blocks b WHERE ((b.blocker_id = auth.uid()) AND (b.blocked_id = club_posts.user_id))))))$q$,
  null,
  $q$(is_club_member(club_id) AND (NOT (EXISTS ( SELECT 1 FROM club_blocks b WHERE ((b.blocker_id = ( SELECT auth.uid() AS uid)) AND (b.blocked_id = club_posts.user_id))))))$q$,
  null),
-- club_reports.cr_insert (INSERT to authenticated)
('club_reports', 'cr_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((reporter_id = auth.uid()) AND ((post_id IS NULL) OR is_club_member(club_id)))$q$,
  null,
  $q$((reporter_id = ( SELECT auth.uid() AS uid)) AND ((post_id IS NULL) OR is_club_member(club_id)))$q$),
-- clubs.clubs_admin_delete (DELETE to authenticated) -> clubs_delete (nothing to wrap)
('clubs', 'clubs_admin_delete', 'DELETE', '{authenticated}', 'clubs_delete',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- clubs.clubs_admin_read (SELECT to authenticated) -> clubs_select (nothing to wrap)
('clubs', 'clubs_admin_read', 'SELECT', '{authenticated}', 'clubs_select',
  $q$( SELECT is_admin() AS is_admin)$q$,
  null,
  $q$( SELECT is_admin() AS is_admin)$q$,
  null),
-- clubs.clubs_admin_update (UPDATE to authenticated) -> clubs_update (nothing to wrap)
('clubs', 'clubs_admin_update', 'UPDATE', '{authenticated}', 'clubs_update',
  $q$( SELECT is_admin() AS is_admin)$q$,
  $q$( SELECT is_admin() AS is_admin)$q$,
  $q$( SELECT is_admin() AS is_admin)$q$,
  $q$( SELECT is_admin() AS is_admin)$q$),
-- clubs.clubs_owner_delete (DELETE to authenticated) -> clubs_delete
('clubs', 'clubs_owner_delete', 'DELETE', '{authenticated}', 'clubs_delete',
  $q$(owner_id = auth.uid())$q$,
  null,
  $q$(owner_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- clubs.clubs_owner_update (UPDATE to authenticated) -> clubs_update
('clubs', 'clubs_owner_update', 'UPDATE', '{authenticated}', 'clubs_update',
  $q$(owner_id = auth.uid())$q$,
  $q$(owner_id = auth.uid())$q$,
  $q$(owner_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(owner_id = ( SELECT auth.uid() AS uid))$q$),
-- clubs.clubs_read (SELECT to authenticated) -> clubs_select (nothing to wrap)
('clubs', 'clubs_read', 'SELECT', '{authenticated}', 'clubs_select',
  $q$((visibility = 'public'::text) OR is_club_member(id))$q$,
  null,
  $q$((visibility = 'public'::text) OR is_club_member(id))$q$,
  null),
-- coach_notes.coach_notes_delete (DELETE to authenticated)
('coach_notes', 'coach_notes_delete', 'DELETE', '{authenticated}', null,
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null),
-- coach_notes.coach_notes_insert (INSERT to authenticated)
('coach_notes', 'coach_notes_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$),
-- coach_notes.coach_notes_select (SELECT to authenticated)
('coach_notes', 'coach_notes_select', 'SELECT', '{authenticated}', null,
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null),
-- coach_notes.coach_notes_update (UPDATE to authenticated)
('coach_notes', 'coach_notes_update', 'UPDATE', '{authenticated}', null,
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = coach_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$),
-- coach_requests.cr_athlete_insert (INSERT to authenticated)
('coach_requests', 'cr_athlete_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
-- coach_requests.cr_athlete_select (SELECT to authenticated) -> coach_requests_select
('coach_requests', 'cr_athlete_select', 'SELECT', '{authenticated}', 'coach_requests_select',
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- coach_requests.cr_athlete_update (UPDATE to authenticated) -> coach_requests_update
('coach_requests', 'cr_athlete_update', 'UPDATE', '{authenticated}', 'coach_requests_update',
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
-- coach_requests.cr_coach_select (SELECT to authenticated) -> coach_requests_select
('coach_requests', 'cr_coach_select', 'SELECT', '{authenticated}', 'coach_requests_select',
  $q$(coach_id = auth.uid())$q$,
  null,
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- coach_requests.cr_coach_update (UPDATE to authenticated) -> coach_requests_update
('coach_requests', 'cr_coach_update', 'UPDATE', '{authenticated}', 'coach_requests_update',
  $q$(coach_id = auth.uid())$q$,
  $q$(coach_id = auth.uid())$q$,
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$),
-- email_preferences.emailprefs_own_insert (INSERT to authenticated)
('email_preferences', 'emailprefs_own_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$(user_id = auth.uid())$q$,
  null,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$),
-- email_preferences.emailprefs_own_read (SELECT to authenticated)
('email_preferences', 'emailprefs_own_read', 'SELECT', '{authenticated}', null,
  $q$(user_id = auth.uid())$q$,
  null,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- email_preferences.emailprefs_own_update (UPDATE to authenticated)
('email_preferences', 'emailprefs_own_update', 'UPDATE', '{authenticated}', null,
  $q$(user_id = auth.uid())$q$,
  $q$(user_id = auth.uid())$q$,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$),
-- form_check_annotations.fca_delete (DELETE to authenticated)
('form_check_annotations', 'fca_delete', 'DELETE', '{authenticated}', null,
  $q$((coach_id = auth.uid()) AND fca_coach_may(form_check_id))$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND fca_coach_may(form_check_id))$q$,
  null),
-- form_check_annotations.fca_insert (INSERT to authenticated)
('form_check_annotations', 'fca_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((coach_id = auth.uid()) AND fca_coach_may(form_check_id))$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND fca_coach_may(form_check_id))$q$),
-- form_check_annotations.fca_select (SELECT to authenticated)
('form_check_annotations', 'fca_select', 'SELECT', '{authenticated}', null,
  $q$((EXISTS ( SELECT 1 FROM form_checks fc WHERE ((fc.id = form_check_annotations.form_check_id) AND (fc.athlete_id = auth.uid())))) OR ((coach_id = auth.uid()) AND fca_coach_may(form_check_id)))$q$,
  null,
  $q$((EXISTS ( SELECT 1 FROM form_checks fc WHERE ((fc.id = form_check_annotations.form_check_id) AND (fc.athlete_id = ( SELECT auth.uid() AS uid))))) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND fca_coach_may(form_check_id)))$q$,
  null),
-- form_check_annotations.fca_update (UPDATE to authenticated)
('form_check_annotations', 'fca_update', 'UPDATE', '{authenticated}', null,
  $q$((coach_id = auth.uid()) AND fca_coach_may(form_check_id))$q$,
  $q$((coach_id = auth.uid()) AND fca_coach_may(form_check_id))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND fca_coach_may(form_check_id))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND fca_coach_may(form_check_id))$q$),
-- form_checks.fc_athlete_insert (INSERT to authenticated)
('form_checks', 'fc_athlete_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((athlete_id = auth.uid()) AND ((storage.foldername(storage_path))[1] = (auth.uid())::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.coach_id = form_checks.coach_id)))))$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND ((storage.foldername(storage_path))[1] = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.coach_id = form_checks.coach_id)))))$q$),
-- form_checks.fc_member_read (SELECT to authenticated)
('form_checks', 'fc_member_read', 'SELECT', '{authenticated}', null,
  $q$((auth.uid() = athlete_id) OR ((auth.uid() = coach_id) AND is_current_coach_of(athlete_id)))$q$,
  null,
  $q$((( SELECT auth.uid() AS uid) = athlete_id) OR ((( SELECT auth.uid() AS uid) = coach_id) AND is_current_coach_of(athlete_id)))$q$,
  null),
-- form_checks.fc_member_update (UPDATE to authenticated)
('form_checks', 'fc_member_update', 'UPDATE', '{authenticated}', null,
  $q$((auth.uid() = athlete_id) OR ((auth.uid() = coach_id) AND is_current_coach_of(athlete_id)))$q$,
  $q$((auth.uid() = athlete_id) OR ((auth.uid() = coach_id) AND is_current_coach_of(athlete_id)))$q$,
  $q$((( SELECT auth.uid() AS uid) = athlete_id) OR ((( SELECT auth.uid() AS uid) = coach_id) AND is_current_coach_of(athlete_id)))$q$,
  $q$((( SELECT auth.uid() AS uid) = athlete_id) OR ((( SELECT auth.uid() AS uid) = coach_id) AND is_current_coach_of(athlete_id)))$q$),
-- form_checks.fc_owner_delete (DELETE to authenticated)
('form_checks', 'fc_owner_delete', 'DELETE', '{authenticated}', null,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- goals.goals_athlete_all (ALL to authenticated)
('goals', 'goals_athlete_all', 'ALL', '{authenticated}', null,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- goals.goals_coach_read (SELECT to authenticated)
('goals', 'goals_coach_read', 'SELECT', '{authenticated}', null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = auth.uid()))) OR is_admin())$q$,
  null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- health_daily.health_daily_athlete_delete (DELETE to authenticated)
('health_daily', 'health_daily_athlete_delete', 'DELETE', '{authenticated}', null,
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- health_daily.health_daily_athlete_insert (INSERT to authenticated)
('health_daily', 'health_daily_athlete_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((athlete_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND p.share_health_with_coach))))$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.share_health_with_coach))))$q$),
-- health_daily.health_daily_athlete_read (SELECT to authenticated) -> health_daily_select
('health_daily', 'health_daily_athlete_read', 'SELECT', '{authenticated}', 'health_daily_select',
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- health_daily.health_daily_athlete_update (UPDATE to authenticated)
('health_daily', 'health_daily_athlete_update', 'UPDATE', '{authenticated}', null,
  $q$(athlete_id = auth.uid())$q$,
  $q$((athlete_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND p.share_health_with_coach))))$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.share_health_with_coach))))$q$),
-- health_daily.health_daily_coach_read (SELECT to authenticated) -> health_daily_select
('health_daily', 'health_daily_coach_read', 'SELECT', '{authenticated}', 'health_daily_select',
  $q$(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = health_daily.athlete_id) AND (p.coach_id = auth.uid()) AND p.share_health_with_coach)))$q$,
  null,
  $q$(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = health_daily.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)) AND p.share_health_with_coach)))$q$,
  null),
-- invites.invites_owner (ALL to authenticated)
('invites', 'invites_owner', 'ALL', '{authenticated}', null,
  $q$((coach_id = auth.uid()) OR is_admin())$q$,
  $q$((coach_id = auth.uid()) OR is_admin())$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- leaderboard_entries.leaderboard_delete_own (DELETE to authenticated)
('leaderboard_entries', 'leaderboard_delete_own', 'DELETE', '{authenticated}', null,
  $q$(user_id = auth.uid())$q$,
  null,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- leaderboard_entries.leaderboard_insert_own (INSERT to authenticated)
('leaderboard_entries', 'leaderboard_insert_own', 'INSERT', '{authenticated}', null,
  null,
  $q$(user_id = auth.uid())$q$,
  null,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$),
-- leaderboard_entries.leaderboard_update_own (UPDATE to authenticated)
('leaderboard_entries', 'leaderboard_update_own', 'UPDATE', '{authenticated}', null,
  $q$(user_id = auth.uid())$q$,
  $q$(user_id = auth.uid())$q$,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$),
-- marketplace_programs.mp_coach_delete_own (DELETE to public)
('marketplace_programs', 'mp_coach_delete_own', 'DELETE', '{public}', null,
  $q$((coach_id = auth.uid()) OR is_admin())$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- marketplace_programs.mp_coach_insert (INSERT to public)
('marketplace_programs', 'mp_coach_insert', 'INSERT', '{public}', null,
  null,
  $q$(is_admin() OR ((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.user_type = 'coach'::text))))))$q$,
  null,
  $q$(( SELECT is_admin() AS is_admin) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type = 'coach'::text))))))$q$),
-- marketplace_programs.mp_coach_own_read (SELECT to public) -> marketplace_programs_select
('marketplace_programs', 'mp_coach_own_read', 'SELECT', '{public}', 'marketplace_programs_select',
  $q$((coach_id = auth.uid()) OR is_admin())$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- marketplace_programs.mp_coach_update_own (UPDATE to public)
('marketplace_programs', 'mp_coach_update_own', 'UPDATE', '{public}', null,
  $q$((coach_id = auth.uid()) OR is_admin())$q$,
  $q$((coach_id = auth.uid()) OR is_admin())$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- marketplace_programs.mp_public_read_published (SELECT to public) -> marketplace_programs_select (nothing to wrap)
('marketplace_programs', 'mp_public_read_published', 'SELECT', '{public}', 'marketplace_programs_select',
  $q$(status = 'published'::text)$q$,
  null,
  $q$(status = 'published'::text)$q$,
  null),
-- meet_day_lifters.meet_day_lifters_coach_read (SELECT to authenticated) -> meet_day_lifters_select (nothing to wrap)
('meet_day_lifters', 'meet_day_lifters_coach_read', 'SELECT', '{authenticated}', 'meet_day_lifters_select',
  $q$meet_day_can_touch(meet_day_id, athlete_id)$q$,
  null,
  $q$meet_day_can_touch(meet_day_id, athlete_id)$q$,
  null),
-- meet_day_lifters.meet_day_lifters_own_read (SELECT to authenticated) -> meet_day_lifters_select (nothing to wrap)
('meet_day_lifters', 'meet_day_lifters_own_read', 'SELECT', '{authenticated}', 'meet_day_lifters_select',
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- meets.meets_coach_plan_delete (DELETE to authenticated) -> meets_delete (nothing to wrap)
('meets', 'meets_coach_plan_delete', 'DELETE', '{authenticated}', 'meets_delete',
  $q$((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null,
  $q$((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null),
-- meets.meets_coach_plan_insert (INSERT to authenticated) -> meets_insert (nothing to wrap)
('meets', 'meets_coach_plan_insert', 'INSERT', '{authenticated}', 'meets_insert',
  null,
  $q$((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null,
  $q$((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$),
-- meets.meets_coach_plan_update (UPDATE to authenticated) -> meets_update (nothing to wrap)
('meets', 'meets_coach_plan_update', 'UPDATE', '{authenticated}', 'meets_update',
  $q$((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  $q$((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  $q$((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  $q$((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$),
-- meets.meets_coach_read (SELECT to authenticated) -> meets_select
('meets', 'meets_coach_read', 'SELECT', '{authenticated}', 'meets_select',
  $q$(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = auth.uid()))))$q$,
  null,
  $q$(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))$q$,
  null),
-- meets.meets_own_delete (DELETE to authenticated) -> meets_delete
('meets', 'meets_own_delete', 'DELETE', '{authenticated}', 'meets_delete',
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- meets.meets_own_insert (INSERT to authenticated) -> meets_insert
('meets', 'meets_own_insert', 'INSERT', '{authenticated}', 'meets_insert',
  null,
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
-- meets.meets_own_read (SELECT to authenticated) -> meets_select
('meets', 'meets_own_read', 'SELECT', '{authenticated}', 'meets_select',
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- meets.meets_own_update (UPDATE to authenticated) -> meets_update
('meets', 'meets_own_update', 'UPDATE', '{authenticated}', 'meets_update',
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
-- messages.msg_member_insert (INSERT to authenticated)
('messages', 'msg_member_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((sender_id = auth.uid()) AND ((auth.uid() = coach_id) OR (auth.uid() = athlete_id)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = messages.athlete_id) AND (p.coach_id = messages.coach_id)))))$q$,
  null,
  $q$((sender_id = ( SELECT auth.uid() AS uid)) AND ((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = messages.athlete_id) AND (p.coach_id = messages.coach_id)))))$q$),
-- messages.msg_member_read (SELECT to authenticated)
('messages', 'msg_member_read', 'SELECT', '{authenticated}', null,
  $q$((auth.uid() = coach_id) OR (auth.uid() = athlete_id))$q$,
  null,
  $q$((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id))$q$,
  null),
-- messages.msg_member_update (UPDATE to authenticated)
('messages', 'msg_member_update', 'UPDATE', '{authenticated}', null,
  $q$((auth.uid() = coach_id) OR (auth.uid() = athlete_id))$q$,
  $q$((auth.uid() = coach_id) OR (auth.uid() = athlete_id))$q$,
  $q$((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id))$q$,
  $q$((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id))$q$),
-- messages.msg_sender_delete (DELETE to authenticated)
('messages', 'msg_sender_delete', 'DELETE', '{authenticated}', null,
  $q$((sender_id = auth.uid()) OR is_admin())$q$,
  null,
  $q$((sender_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- nutrition_daily.nutrition_daily_athlete_delete (DELETE to authenticated)
('nutrition_daily', 'nutrition_daily_athlete_delete', 'DELETE', '{authenticated}', null,
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- nutrition_daily.nutrition_daily_athlete_insert (INSERT to authenticated)
('nutrition_daily', 'nutrition_daily_athlete_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((athlete_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND p.share_nutrition_with_coach))))$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.share_nutrition_with_coach))))$q$),
-- nutrition_daily.nutrition_daily_athlete_read (SELECT to authenticated) -> nutrition_daily_select
('nutrition_daily', 'nutrition_daily_athlete_read', 'SELECT', '{authenticated}', 'nutrition_daily_select',
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- nutrition_daily.nutrition_daily_athlete_update (UPDATE to authenticated)
('nutrition_daily', 'nutrition_daily_athlete_update', 'UPDATE', '{authenticated}', null,
  $q$(athlete_id = auth.uid())$q$,
  $q$((athlete_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND p.share_nutrition_with_coach))))$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND p.share_nutrition_with_coach))))$q$),
-- nutrition_daily.nutrition_daily_coach_read (SELECT to authenticated) -> nutrition_daily_select
('nutrition_daily', 'nutrition_daily_coach_read', 'SELECT', '{authenticated}', 'nutrition_daily_select',
  $q$(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = nutrition_daily.athlete_id) AND (p.coach_id = auth.uid()) AND p.share_nutrition_with_coach)))$q$,
  null,
  $q$(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = nutrition_daily.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)) AND p.share_nutrition_with_coach)))$q$,
  null),
-- pain_reports.pain_reports_athlete_delete (DELETE to authenticated)
('pain_reports', 'pain_reports_athlete_delete', 'DELETE', '{authenticated}', null,
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- pain_reports.pain_reports_athlete_insert (INSERT to authenticated)
('pain_reports', 'pain_reports_athlete_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
-- pain_reports.pain_reports_athlete_read (SELECT to authenticated) -> pain_reports_select
('pain_reports', 'pain_reports_athlete_read', 'SELECT', '{authenticated}', 'pain_reports_select',
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- pain_reports.pain_reports_athlete_update (UPDATE to authenticated) -> pain_reports_update
('pain_reports', 'pain_reports_athlete_update', 'UPDATE', '{authenticated}', 'pain_reports_update',
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
-- pain_reports.pain_reports_coach_read (SELECT to authenticated) -> pain_reports_select
('pain_reports', 'pain_reports_coach_read', 'SELECT', '{authenticated}', 'pain_reports_select',
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  null,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null),
-- pain_reports.pain_reports_coach_update (UPDATE to authenticated) -> pain_reports_update
('pain_reports', 'pain_reports_coach_update', 'UPDATE', '{authenticated}', 'pain_reports_update',
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  $q$((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$),
-- profiles.profiles_admin_update (UPDATE to authenticated) -> profiles_update
('profiles', 'profiles_admin_update', 'UPDATE', '{authenticated}', 'profiles_update',
  $q$is_admin()$q$,
  $q$is_admin()$q$,
  $q$( SELECT is_admin() AS is_admin)$q$,
  $q$( SELECT is_admin() AS is_admin)$q$),
-- profiles.profiles_coach_detach_athlete (UPDATE to authenticated) -> profiles_update
('profiles', 'profiles_coach_detach_athlete', 'UPDATE', '{authenticated}', 'profiles_update',
  $q$(coach_id = auth.uid())$q$,
  $q$(coach_id IS NULL)$q$,
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(coach_id IS NULL)$q$),
-- profiles.profiles_coach_reads_roster (SELECT to authenticated) -> profiles_select (nothing to wrap)
('profiles', 'profiles_coach_reads_roster', 'SELECT', '{authenticated}', 'profiles_select',
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
  null,
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- profiles.profiles_insert_self (INSERT to authenticated)
('profiles', 'profiles_insert_self', 'INSERT', '{authenticated}', null,
  null,
  $q$(id = auth.uid())$q$,
  null,
  $q$(id = ( SELECT auth.uid() AS uid))$q$),
-- profiles.profiles_read_admin (SELECT to authenticated) -> profiles_select (nothing to wrap)
('profiles', 'profiles_read_admin', 'SELECT', '{authenticated}', 'profiles_select',
  $q$( SELECT powa_is_admin() AS powa_is_admin)$q$,
  null,
  $q$( SELECT powa_is_admin() AS powa_is_admin)$q$,
  null),
-- profiles.profiles_read_self (SELECT to authenticated) -> profiles_select (nothing to wrap)
('profiles', 'profiles_read_self', 'SELECT', '{authenticated}', 'profiles_select',
  $q$(id = ( SELECT auth.uid() AS uid))$q$,
  null,
  $q$(id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- profiles.profiles_self_update (UPDATE to authenticated) -> profiles_update
('profiles', 'profiles_self_update', 'UPDATE', '{authenticated}', 'profiles_update',
  $q$(id = auth.uid())$q$,
  $q$(id = auth.uid())$q$,
  $q$(id = ( SELECT auth.uid() AS uid))$q$,
  $q$(id = ( SELECT auth.uid() AS uid))$q$),
-- profiles.profiles_update_self (UPDATE to authenticated) -> profiles_update
('profiles', 'profiles_update_self', 'UPDATE', '{authenticated}', 'profiles_update',
  $q$((id = auth.uid()) OR is_admin())$q$,
  $q$((id = auth.uid()) OR is_admin())$q$,
  $q$((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- program_blocks.program_blocks_delete (DELETE to authenticated)
('program_blocks', 'program_blocks_delete', 'DELETE', '{authenticated}', null,
  $q$(((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = program_blocks.athlete_id) AND (p.coach_id = auth.uid()))))) OR ((athlete_id = auth.uid()) AND ((coach_id IS NULL) OR (coach_id = auth.uid()))))$q$,
  null,
  $q$(((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = program_blocks.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))) OR ((athlete_id = ( SELECT auth.uid() AS uid)) AND ((coach_id IS NULL) OR (coach_id = ( SELECT auth.uid() AS uid)))))$q$,
  null),
-- program_blocks.program_blocks_insert (INSERT to authenticated)
('program_blocks', 'program_blocks_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$(((coach_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = program_blocks.athlete_id) AND (p.coach_id = auth.uid()))))) OR ((athlete_id = auth.uid()) AND ((coach_id IS NULL) OR (coach_id = auth.uid()))))$q$,
  null,
  $q$(((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = program_blocks.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))) OR ((athlete_id = ( SELECT auth.uid() AS uid)) AND ((coach_id IS NULL) OR (coach_id = ( SELECT auth.uid() AS uid)))))$q$),
-- program_blocks.program_blocks_read (SELECT to authenticated)
('program_blocks', 'program_blocks_read', 'SELECT', '{authenticated}', null,
  $q$((athlete_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = program_blocks.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = program_blocks.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null),
-- program_reviews.pr_buyer_delete (DELETE to authenticated)
('program_reviews', 'pr_buyer_delete', 'DELETE', '{authenticated}', null,
  $q$((buyer_id = auth.uid()) OR is_admin())$q$,
  null,
  $q$((buyer_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- program_reviews.pr_buyer_insert (INSERT to authenticated)
('program_reviews', 'pr_buyer_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((buyer_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM (program_sales s JOIN marketplace_programs mp ON ((mp.id = s.marketplace_program_id))) WHERE ((s.marketplace_program_id = program_reviews.marketplace_program_id) AND (s.buyer_id = auth.uid()) AND (mp.coach_id = program_reviews.coach_id)))))$q$,
  null,
  $q$((buyer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM (program_sales s JOIN marketplace_programs mp ON ((mp.id = s.marketplace_program_id))) WHERE ((s.marketplace_program_id = program_reviews.marketplace_program_id) AND (s.buyer_id = ( SELECT auth.uid() AS uid)) AND (mp.coach_id = program_reviews.coach_id)))))$q$),
-- program_reviews.pr_buyer_update (UPDATE to authenticated)
('program_reviews', 'pr_buyer_update', 'UPDATE', '{authenticated}', null,
  $q$(buyer_id = auth.uid())$q$,
  $q$((buyer_id = auth.uid()) AND (EXISTS ( SELECT 1 FROM marketplace_programs mp WHERE ((mp.id = program_reviews.marketplace_program_id) AND (mp.coach_id = program_reviews.coach_id)))))$q$,
  $q$(buyer_id = ( SELECT auth.uid() AS uid))$q$,
  $q$((buyer_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM marketplace_programs mp WHERE ((mp.id = program_reviews.marketplace_program_id) AND (mp.coach_id = program_reviews.coach_id)))))$q$),
-- program_sales.ps_admin_all (ALL to public)
('program_sales', 'ps_admin_all', 'ALL', '{public}', null,
  $q$is_admin()$q$,
  $q$is_admin()$q$,
  $q$( SELECT is_admin() AS is_admin)$q$,
  $q$( SELECT is_admin() AS is_admin)$q$),
-- program_sales.ps_buyer_read (SELECT to public)
('program_sales', 'ps_buyer_read', 'SELECT', '{public}', null,
  $q$(buyer_id = auth.uid())$q$,
  null,
  $q$(buyer_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- program_sales.ps_coach_read (SELECT to public)
('program_sales', 'ps_coach_read', 'SELECT', '{public}', null,
  $q$(coach_id = auth.uid())$q$,
  null,
  $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- program_templates.tpl_coach_all (ALL to authenticated)
('program_templates', 'tpl_coach_all', 'ALL', '{authenticated}', null,
  $q$((coach_id = auth.uid()) OR is_admin())$q$,
  $q$((coach_id = auth.uid()) OR is_admin())$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- programs.programs_admin_all (ALL to authenticated)
('programs', 'programs_admin_all', 'ALL', '{authenticated}', null,
  $q$is_admin()$q$,
  $q$is_admin()$q$,
  $q$( SELECT is_admin() AS is_admin)$q$,
  $q$( SELECT is_admin() AS is_admin)$q$),
-- programs.programs_athlete_delete_own (DELETE to authenticated)
('programs', 'programs_athlete_delete_own', 'DELETE', '{authenticated}', null,
  $q$((athlete_id = auth.uid()) AND ((coach_id IS NULL) OR (coach_id = auth.uid())))$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND ((coach_id IS NULL) OR (coach_id = ( SELECT auth.uid() AS uid))))$q$,
  null),
-- programs.programs_athlete_insert (INSERT to authenticated)
('programs', 'programs_athlete_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$((athlete_id = auth.uid()) AND ((coach_id IS NULL) OR (coach_id = auth.uid()) OR (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = auth.uid())))))$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND ((coach_id IS NULL) OR (coach_id = ( SELECT auth.uid() AS uid)) OR (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid))))))$q$),
-- programs.programs_athlete_read (SELECT to authenticated)
('programs', 'programs_athlete_read', 'SELECT', '{authenticated}', null,
  $q$(athlete_id = auth.uid())$q$,
  null,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- programs.programs_athlete_update (UPDATE to authenticated)
('programs', 'programs_athlete_update', 'UPDATE', '{authenticated}', null,
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = auth.uid())$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
-- push_subscriptions.push_own_delete (DELETE to authenticated)
('push_subscriptions', 'push_own_delete', 'DELETE', '{authenticated}', null,
  $q$((user_id = auth.uid()) OR is_admin())$q$,
  null,
  $q$((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- push_subscriptions.push_own_insert (INSERT to authenticated)
('push_subscriptions', 'push_own_insert', 'INSERT', '{authenticated}', null,
  null,
  $q$(user_id = auth.uid())$q$,
  null,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$),
-- push_subscriptions.push_own_read (SELECT to authenticated)
('push_subscriptions', 'push_own_read', 'SELECT', '{authenticated}', null,
  $q$(user_id = auth.uid())$q$,
  null,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- push_subscriptions.push_own_update (UPDATE to authenticated)
('push_subscriptions', 'push_own_update', 'UPDATE', '{authenticated}', null,
  $q$(user_id = auth.uid())$q$,
  $q$(user_id = auth.uid())$q$,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$),
-- referral_reward_claims.reward_claims_select_own (SELECT to authenticated)
('referral_reward_claims', 'reward_claims_select_own', 'SELECT', '{authenticated}', null,
  $q$(user_id = auth.uid())$q$,
  null,
  $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
  null),
-- referrals.referrals_select_own (SELECT to authenticated)
('referrals', 'referrals_select_own', 'SELECT', '{authenticated}', null,
  $q$((referrer_id = auth.uid()) OR (referred_id = auth.uid()))$q$,
  null,
  $q$((referrer_id = ( SELECT auth.uid() AS uid)) OR (referred_id = ( SELECT auth.uid() AS uid)))$q$,
  null),
-- rest_days.rest_athlete_all (ALL to authenticated)
('rest_days', 'rest_athlete_all', 'ALL', '{authenticated}', null,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- rest_days.rest_coach_read (SELECT to authenticated)
('rest_days', 'rest_coach_read', 'SELECT', '{authenticated}', null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = auth.uid()))) OR is_admin())$q$,
  null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- schedule_requests.schedule_requests_coach_decide (UPDATE to authenticated) -> schedule_requests_update (nothing to wrap)
('schedule_requests', 'schedule_requests_coach_decide', 'UPDATE', '{authenticated}', 'schedule_requests_update',
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (athlete_id <> ( SELECT auth.uid() AS uid)) AND is_current_coach_of(athlete_id) AND (status = 'pending'::text))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (athlete_id <> ( SELECT auth.uid() AS uid)) AND is_current_coach_of(athlete_id) AND (status = ANY (ARRAY['approved'::text, 'declined'::text])))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (athlete_id <> ( SELECT auth.uid() AS uid)) AND is_current_coach_of(athlete_id) AND (status = 'pending'::text))$q$,
  $q$((coach_id = ( SELECT auth.uid() AS uid)) AND (athlete_id <> ( SELECT auth.uid() AS uid)) AND is_current_coach_of(athlete_id) AND (status = ANY (ARRAY['approved'::text, 'declined'::text])))$q$),
-- schedule_requests.schedule_requests_lifter_update (UPDATE to authenticated) -> schedule_requests_update (nothing to wrap)
('schedule_requests', 'schedule_requests_lifter_update', 'UPDATE', '{authenticated}', 'schedule_requests_update',
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid)))))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (coach_id IS NOT NULL) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid)))))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid)))))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (coach_id IS NOT NULL) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid)))))$q$),
-- session_notes.notes_athlete_all (ALL to authenticated)
('session_notes', 'notes_athlete_all', 'ALL', '{authenticated}', null,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- session_notes.notes_coach_read (SELECT to authenticated)
('session_notes', 'notes_coach_read', 'SELECT', '{authenticated}', null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = auth.uid()))) OR is_admin())$q$,
  null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- session_notes.session_notes_coach_insert (INSERT to public)
('session_notes', 'session_notes_coach_insert', 'INSERT', '{public}', null,
  null,
  $q$((athlete_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = auth.uid())))) OR is_admin())$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$),
-- session_notes.session_notes_coach_select (SELECT to public)
('session_notes', 'session_notes_coach_select', 'SELECT', '{public}', null,
  $q$((athlete_id = auth.uid()) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = auth.uid())))) OR is_admin())$q$,
  null,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- session_notes.session_notes_coach_update (UPDATE to public)
('session_notes', 'session_notes_coach_update', 'UPDATE', '{public}', null,
  $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = auth.uid())))) OR is_admin())$q$,
  null,
  $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- workout_logs.logs_athlete_all (ALL to authenticated)
('workout_logs', 'logs_athlete_all', 'ALL', '{authenticated}', null,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = auth.uid()) OR is_admin())$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
-- workout_logs.logs_coach_read (SELECT to authenticated)
('workout_logs', 'logs_coach_read', 'SELECT', '{authenticated}', null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = auth.uid()))) OR is_admin())$q$,
  null,
  $q$((athlete_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.coach_id = ( SELECT auth.uid() AS uid)))) OR ( SELECT is_admin() AS is_admin))$q$,
  null),
-- workout_logs.workout_logs_coach_import (INSERT to authenticated)
('workout_logs', 'workout_logs_coach_import', 'INSERT', '{authenticated}', null,
  null,
  $q$((source = 'import'::text) AND (import_key IS NOT NULL) AND (imported_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = workout_logs.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  null,
  $q$((source = 'import'::text) AND (import_key IS NOT NULL) AND (imported_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = workout_logs.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$),
-- workout_logs.workout_logs_coach_unimport (DELETE to authenticated)
('workout_logs', 'workout_logs_coach_unimport', 'DELETE', '{authenticated}', null,
  $q$((source = 'import'::text) AND (imported_by = auth.uid()) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = workout_logs.athlete_id) AND (p.coach_id = auth.uid())))))$q$,
  null,
  $q$((source = 'import'::text) AND (imported_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = workout_logs.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))))$q$,
  null);

create temp table rls_perf_merged (tbl text, pol text, cmd text, roles text[], using_now text, check_now text) on commit drop;
insert into rls_perf_merged values
-- checkin_answers_athlete_read + checkin_answers_coach_read
('checkin_answers', 'checkin_answers_select', 'SELECT', '{authenticated}',
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = checkin_answers.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))))$q$,
  null),
-- cban_admin_delete + cban_staff_delete
('club_bans', 'club_bans_delete', 'DELETE', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))$q$,
  null),
-- cban_admin_read + cban_staff_read
('club_bans', 'club_bans_select', 'SELECT', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text])))$q$,
  null),
-- cjr_admin_read + cjr_read
('club_join_requests', 'club_join_requests_select', 'SELECT', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR ((user_id = ( SELECT auth.uid() AS uid)) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))$q$,
  null),
-- cm_admin_delete + cm_delete
('club_members', 'club_members_delete', 'DELETE', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR ((user_id = ( SELECT auth.uid() AS uid)) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))$q$,
  null),
-- cm_admin_read + cm_read
('club_members', 'club_members_select', 'SELECT', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR is_club_member(club_id))$q$,
  null),
-- cp_admin_delete + cp_delete
('club_posts', 'club_posts_delete', 'DELETE', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR ((user_id = ( SELECT auth.uid() AS uid)) OR (club_role(club_id) = ANY (ARRAY['owner'::text, 'admin'::text]))))$q$,
  null),
-- cp_admin_read + cp_read
('club_posts', 'club_posts_select', 'SELECT', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR (is_club_member(club_id) AND (NOT (EXISTS ( SELECT 1 FROM club_blocks b WHERE ((b.blocker_id = ( SELECT auth.uid() AS uid)) AND (b.blocked_id = club_posts.user_id)))))))$q$,
  null),
-- clubs_admin_delete + clubs_owner_delete
('clubs', 'clubs_delete', 'DELETE', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR (owner_id = ( SELECT auth.uid() AS uid)))$q$,
  null),
-- clubs_admin_read + clubs_read
('clubs', 'clubs_select', 'SELECT', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR ((visibility = 'public'::text) OR is_club_member(id)))$q$,
  null),
-- clubs_admin_update + clubs_owner_update
('clubs', 'clubs_update', 'UPDATE', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR (owner_id = ( SELECT auth.uid() AS uid)))$q$,
  $q$(( SELECT is_admin() AS is_admin) OR (owner_id = ( SELECT auth.uid() AS uid)))$q$),
-- cr_athlete_select + cr_coach_select
('coach_requests', 'coach_requests_select', 'SELECT', '{authenticated}',
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (coach_id = ( SELECT auth.uid() AS uid)))$q$,
  null),
-- cr_athlete_update + cr_coach_update
('coach_requests', 'coach_requests_update', 'UPDATE', '{authenticated}',
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (coach_id = ( SELECT auth.uid() AS uid)))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (coach_id = ( SELECT auth.uid() AS uid)))$q$),
-- health_daily_athlete_read + health_daily_coach_read
('health_daily', 'health_daily_select', 'SELECT', '{authenticated}',
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = health_daily.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)) AND p.share_health_with_coach))))$q$,
  null),
-- mp_coach_own_read + mp_public_read_published
('marketplace_programs', 'marketplace_programs_select', 'SELECT', '{public}',
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin) OR (status = 'published'::text))$q$,
  null),
-- meet_day_lifters_coach_read + meet_day_lifters_own_read
('meet_day_lifters', 'meet_day_lifters_select', 'SELECT', '{authenticated}',
  $q$(meet_day_can_touch(meet_day_id, athlete_id) OR (athlete_id = ( SELECT auth.uid() AS uid)))$q$,
  null),
-- meets_coach_plan_delete + meets_own_delete
('meets', 'meets_delete', 'DELETE', '{authenticated}',
  $q$(((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))) OR ((athlete_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)))$q$,
  null),
-- meets_coach_plan_insert + meets_own_insert
('meets', 'meets_insert', 'INSERT', '{authenticated}',
  null,
  $q$(((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))) OR (athlete_id = ( SELECT auth.uid() AS uid)))$q$),
-- meets_coach_read + meets_own_read
('meets', 'meets_select', 'SELECT', '{authenticated}',
  $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR (athlete_id = ( SELECT auth.uid() AS uid)))$q$,
  null),
-- meets_coach_plan_update + meets_own_update
('meets', 'meets_update', 'UPDATE', '{authenticated}',
  $q$(((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))) OR (athlete_id = ( SELECT auth.uid() AS uid)))$q$,
  $q$(((status = 'planned'::text) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = meets.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))) OR (athlete_id = ( SELECT auth.uid() AS uid)))$q$),
-- nutrition_daily_athlete_read + nutrition_daily_coach_read
('nutrition_daily', 'nutrition_daily_select', 'SELECT', '{authenticated}',
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = nutrition_daily.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)) AND p.share_nutrition_with_coach))))$q$,
  null),
-- pain_reports_athlete_read + pain_reports_coach_read
('pain_reports', 'pain_reports_select', 'SELECT', '{authenticated}',
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))))$q$,
  null),
-- pain_reports_athlete_update + pain_reports_coach_update
('pain_reports', 'pain_reports_update', 'UPDATE', '{authenticated}',
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))))$q$,
  $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = pain_reports.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid)))))))$q$),
-- profiles_coach_reads_roster + profiles_read_admin + profiles_read_self
('profiles', 'profiles_select', 'SELECT', '{authenticated}',
  $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT powa_is_admin() AS powa_is_admin) OR (id = ( SELECT auth.uid() AS uid)))$q$,
  null),
-- profiles_admin_update + profiles_coach_detach_athlete + profiles_self_update + profiles_update_self
('profiles', 'profiles_update', 'UPDATE', '{authenticated}',
  $q$(( SELECT is_admin() AS is_admin) OR (coach_id = ( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid)) OR ((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)))$q$,
  $q$(( SELECT is_admin() AS is_admin) OR (coach_id IS NULL) OR (id = ( SELECT auth.uid() AS uid)) OR ((id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)))$q$),
-- schedule_requests_coach_decide + schedule_requests_lifter_update
('schedule_requests', 'schedule_requests_update', 'UPDATE', '{authenticated}',
  $q$(((coach_id = ( SELECT auth.uid() AS uid)) AND (athlete_id <> ( SELECT auth.uid() AS uid)) AND is_current_coach_of(athlete_id) AND (status = 'pending'::text)) OR ((athlete_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid))))))$q$,
  $q$(((coach_id = ( SELECT auth.uid() AS uid)) AND (athlete_id <> ( SELECT auth.uid() AS uid)) AND is_current_coach_of(athlete_id) AND (status = ANY (ARRAY['approved'::text, 'declined'::text]))) OR ((athlete_id = ( SELECT auth.uid() AS uid)) AND (status = 'pending'::text) AND (coach_id IS NOT NULL) AND (coach_id = ( SELECT p.coach_id FROM profiles p WHERE (p.id = ( SELECT auth.uid() AS uid))))))$q$);

-- 3. Indexes. (In undo mode the block below drops them again.)
create index if not exists workout_logs_athlete_date_idx on public.workout_logs (athlete_id, date);
create index if not exists messages_coach_created_idx on public.messages (coach_id, created_at desc);
create index if not exists programs_coach_idx on public.programs (coach_id);
create index if not exists session_notes_athlete_date_idx on public.session_notes (athlete_id, date);
create index if not exists pain_reports_coach_idx on public.pain_reports (coach_id);
create index if not exists invites_coach_idx on public.invites (coach_id);
create index if not exists program_templates_coach_idx on public.program_templates (coach_id);

-- The compare-and-swap.
do $$
declare
  undo boolean := coalesce(current_setting('powa.rls_perf_undo', true), '') = 'on';
  m record; r record; cur record;
  n_merged int := 0; n_members int := 0; n_redropped int := 0; n_split int := 0; n_changed int := 0;
  n_merged_before int := 0; n_same int := 0;
  left_alone text[] := '{}';
  ok boolean;
begin
  create or replace temp view rls_perf_cur as
    select c.relname::text tbl, p.polname::text pol,
           case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end cmd,
           (select array_agg(case when x = 0 then 'public' else x::regrole::text end order by case when x = 0 then 'public' else x::regrole::text end) from unnest(p.polroles) x) roles,
           p.polpermissive perm,
           regexp_replace(btrim(pg_get_expr(p.polqual, p.polrelid)), '\s+', ' ', 'g') using_txt,
           regexp_replace(btrim(pg_get_expr(p.polwithcheck, p.polrelid)), '\s+', ' ', 'g') check_txt
      from pg_policy p join pg_class c on c.oid = p.polrelid
     where c.relnamespace = 'public'::regnamespace;

  if not undo then
    -- Merges: only when every member still reads as on 28 Oct.
    for m in select * from rls_perf_merged order by tbl, pol loop
      select bool_and(c.pol is not null and c.cmd = p.cmd and c.roles = p.roles and c.perm
                      and c.using_txt is not distinct from p.using_was and c.check_txt is not distinct from p.check_was)
        into ok
        from rls_perf_policy p left join rls_perf_cur c on c.tbl = p.tbl and c.pol = p.pol
       where p.merge_into = m.pol and p.tbl = m.tbl;
      if ok then
        for r in select * from rls_perf_policy where merge_into = m.pol and tbl = m.tbl loop
          execute format('drop policy %I on public.%I', r.pol, r.tbl);
          n_members := n_members + 1;
        end loop;
        if exists (select 1 from rls_perf_cur c where c.tbl = m.tbl and c.pol = m.pol) then
          execute format('drop policy %I on public.%I', m.pol, m.tbl);
        end if;
        execute format('create policy %I on public.%I as permissive for %s to %s%s%s', m.pol, m.tbl, m.cmd,
                       (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(m.roles) x),
                       coalesce(' using (' || m.using_now || ')', ''), coalesce(' with check (' || m.check_now || ')', ''));
        n_merged := n_merged + 1;
      elsif exists (select 1 from rls_perf_cur c where c.tbl = m.tbl and c.pol = m.pol
                      and c.using_txt is not distinct from m.using_now and c.check_txt is not distinct from m.check_now) then
        -- Merged on an earlier run. A member put back since with its 28 Oct text (an older migration run
        -- again, say) is already one arm of the merged policy: drop it again.
        n_merged_before := n_merged_before + 1;
        for r in select p.* from rls_perf_policy p join rls_perf_cur c on c.tbl = p.tbl and c.pol = p.pol
                  where p.merge_into = m.pol and p.tbl = m.tbl and c.cmd = p.cmd and c.roles = p.roles and c.perm
                    and c.using_txt is not distinct from p.using_was and c.check_txt is not distinct from p.check_was loop
          execute format('drop policy %I on public.%I', r.pol, r.tbl);
          n_redropped := n_redropped + 1;
        end loop;
      else
        left_alone := left_alone || format('merge %s.%s (a policy in it changed since 28 Oct; each one is wrapped on its own if it can be)', m.tbl, m.pol);
      end if;
    end loop;
    -- Rewrites in place.
    for r in select * from rls_perf_policy order by tbl, pol loop
      select * into cur from rls_perf_cur c where c.tbl = r.tbl and c.pol = r.pol;
      if not found then
        if r.merge_into is not null and exists (select 1 from rls_perf_cur c where c.tbl = r.tbl and c.pol = r.merge_into) then
          continue;
        end if;
        left_alone := left_alone || format('%s.%s (not found)', r.tbl, r.pol);
      elsif cur.cmd = r.cmd and cur.roles = r.roles and cur.perm
            and cur.using_txt is not distinct from r.using_was and cur.check_txt is not distinct from r.check_was then
        if r.using_now is distinct from r.using_was or r.check_now is distinct from r.check_was then
          execute format('alter policy %I on public.%I%s%s', r.pol, r.tbl,
                         coalesce(' using (' || r.using_now || ')', ''), coalesce(' with check (' || r.check_now || ')', ''));
          n_changed := n_changed + 1;
        end if;
      elsif cur.using_txt is not distinct from r.using_now and cur.check_txt is not distinct from r.check_now then
        n_same := n_same + 1;
      else
        left_alone := left_alone || format('%s.%s (changed since 28 Oct)', r.tbl, r.pol);
      end if;
    end loop;
    raise notice 'rls-perf: % policies merged into % new ones, % rewritten in place; already so from an earlier run: % merged policies, % rewritten ones; % put back since and dropped again',
      n_members, n_merged, n_changed, n_merged_before, n_same, n_redropped;
  else
    -- Undo: split the merged policies back into their 28 Oct members ...
    for m in select * from rls_perf_merged order by tbl, pol loop
      if exists (select 1 from rls_perf_cur c where c.tbl = m.tbl and c.pol = m.pol
                   and c.using_txt is not distinct from m.using_now and c.check_txt is not distinct from m.check_now) then
        execute format('drop policy %I on public.%I', m.pol, m.tbl);
        for r in select p.* from rls_perf_policy p where p.merge_into = m.pol and p.tbl = m.tbl
                    and not exists (select 1 from rls_perf_cur c where c.tbl = p.tbl and c.pol = p.pol) loop
          execute format('create policy %I on public.%I as permissive for %s to %s%s%s', r.pol, r.tbl, r.cmd,
                         (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(r.roles) x),
                         coalesce(' using (' || r.using_was || ')', ''), coalesce(' with check (' || r.check_was || ')', ''));
        end loop;
        n_split := n_split + 1;
      elsif exists (select 1 from rls_perf_cur c where c.tbl = m.tbl and c.pol = m.pol) then
        left_alone := left_alone || format('merged %s.%s (changed since this file made it)', m.tbl, m.pol);
      end if;
    end loop;
    -- ... and put every rewritten policy back to its 28 Oct text.
    for r in select * from rls_perf_policy order by tbl, pol loop
      select * into cur from rls_perf_cur c where c.tbl = r.tbl and c.pol = r.pol;
      if not found then
        left_alone := left_alone || format('%s.%s (not found)', r.tbl, r.pol);
      elsif cur.using_txt is not distinct from r.using_was and cur.check_txt is not distinct from r.check_was then
        n_same := n_same + 1;
      elsif cur.using_txt is not distinct from r.using_now and cur.check_txt is not distinct from r.check_now then
        execute format('alter policy %I on public.%I%s%s', r.pol, r.tbl,
                       coalesce(' using (' || r.using_was || ')', ''), coalesce(' with check (' || r.check_was || ')', ''));
        n_changed := n_changed + 1;
      else
        left_alone := left_alone || format('%s.%s (changed since this file rewrote it)', r.tbl, r.pol);
      end if;
    end loop;
    drop index if exists public.workout_logs_athlete_date_idx;
    drop index if exists public.messages_coach_created_idx;
    drop index if exists public.programs_coach_idx;
    drop index if exists public.session_notes_athlete_date_idx;
    drop index if exists public.pain_reports_coach_idx;
    drop index if exists public.invites_coach_idx;
    drop index if exists public.program_templates_coach_idx;
    raise notice 'rls-perf undo: % merged policies split back into their originals, % policies put back to their 28 Oct text, % already as on 28 Oct', n_split, n_changed, n_same;
  end if;
  if cardinality(left_alone) > 0 then
    raise warning 'rls-perf: left as they are: %', array_to_string(left_alone, '; ');
  end if;
  drop view rls_perf_cur;
end $$;

commit;

-- Verify:
--   select count(*) from pg_policies where schemaname = 'public'
--      and ((qual like '%auth.uid()%' and qual not like '%SELECT auth.uid()%')
--        or (with_check like '%auth.uid()%' and with_check not like '%SELECT auth.uid()%'));   -- 0
--   select tablename, policyname, cmd from pg_policies
--    where schemaname = 'public' and policyname in ('checkin_answers_select', 'club_bans_delete', 'club_bans_select', 'club_join_requests_select', 'club_members_delete', 'club_members_select', 'club_posts_delete', 'club_posts_select', 'clubs_delete', 'clubs_select', 'clubs_update', 'coach_requests_select', 'coach_requests_update', 'health_daily_select', 'marketplace_programs_select', 'meet_day_lifters_select', 'meets_delete', 'meets_insert', 'meets_select', 'meets_update', 'nutrition_daily_select', 'pain_reports_select', 'pain_reports_update', 'profiles_select', 'profiles_update', 'schedule_requests_update')
--    order by 1, 2;   -- 26 rows
--   select indexname from pg_indexes where schemaname = 'public'
--      and indexname in ('workout_logs_athlete_date_idx', 'messages_coach_created_idx', 'programs_coach_idx', 'session_notes_athlete_date_idx', 'pain_reports_coach_idx', 'invites_coach_idx', 'program_templates_coach_idx');   -- 7 rows
--   Advisors > Performance: auth_rls_initplan 0, multiple_permissive_policies 25, unindexed_foreign_keys 19
--   (unused_index shows the 7 new indexes too until queries use them).
