-- STATUS-check.sql — POWALIFTA. NOT a migration: read-only, changes nothing.
-- Paste into the Supabase SQL Editor and run. One row per migration, in the order they must
-- be applied; `applied` is true when the objects that migration creates are in the live
-- database. Run every file that says false, top to bottom, then run this again.
-- (2026-10-22: the live marketplace asked for program_reviews and got a 404, so the older
-- table-creating migrations are listed too.)
with checks(n, migration, applied) as (values
  (1,  'migration-marketplace-reviews.sql',
        to_regclass('public.program_reviews') is not null),
  (2,  'migration-messages.sql',
        to_regclass('public.messages') is not null),
  (3,  'migration-form-checks.sql',
        to_regclass('public.form_checks') is not null),
  (4,  'migration-ai-chat-usage.sql',
        to_regclass('public.ai_chat_usage') is not null),
  (5,  'migration-push-subscriptions.sql',
        to_regclass('public.push_subscriptions') is not null),
  (6,  'migration-push-platform.sql',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'push_subscriptions' and column_name = 'platform')),
  (7,  'migration-referrals.sql',
        to_regclass('public.referrals') is not null),
  (8,  'migration-clubs.sql',
        to_regclass('public.clubs') is not null),
  (9,  'migration-clubs-social.sql',
        to_regclass('public.club_posts') is not null),
  (10, 'migration-clubs-social-2.sql',
        to_regclass('public.club_bans') is not null),
  (11, 'migration-reactions.sql',
        to_regclass('public.message_reactions') is not null),
  (12, 'migration-apple-iap.sql',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'apple_original_transaction_id')),
  (13, 'migration-profiles-privacy.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'list_public_coaches')),
  (14, 'migration-billing-guard.sql',
        exists (select 1 from pg_trigger where tgname = 'trg_guard_profile_billing_ids')),
  (15, 'migration-boards-tiktok.sql',
        to_regclass('public.club_buddies') is not null),
  (16, 'migration-meets.sql',
        to_regclass('public.meets') is not null),
  (17, 'migration-leaderboard.sql',
        to_regclass('public.leaderboard_entries') is not null),
  (18, 'migration-email-preferences.sql',
        to_regclass('public.email_preferences') is not null),
  (19, 'migration-content-filter.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'powa_text_blocked')),
  (20, 'migration-edge-rate-limits.sql',
        to_regclass('public.edge_rate_limits') is not null),
  (21, 'migration-account-deletion.sql',
        exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace s on s.oid = t.relnamespace
                 where s.nspname = 'public' and t.relname = 'program_sales' and c.contype = 'f' and c.confdeltype = 'n')),
  (22, 'migration-rls-hardening-3.sql',
        exists (select 1 from pg_trigger where tgname = 'trg_guard_profile_privileged_cols_insert')),
  (23, 'migration-admin-plan-comp.sql',
        exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_admin_update')),
  (24, 'migration-rls-hardening-4.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'guard_profile_privileged_cols' and p.prosrc like '%powa.link_ok%')),
  (25, 'migration-security-2026-10-20.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'get_marketplace_payload')),
  (26, 'migration-limits-2026-10-22.sql',
        exists (select 1 from pg_trigger where tgname = 'trg_guard_avatar_url')),
  (27, 'migration-payments-2026-10-22.sql  (deploy the edge functions FIRST)',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'billing_provider')),
  (28, '  ...its realtime part (profiles in supabase_realtime)',
        exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles')),
  (29, 'migration-invite-links-2026-10-22.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'invite_preview')),
  (30, 'migration-checkin-questions-2026-10-22.sql',
        to_regclass('public.checkin_answers') is not null),
  (31, 'migration-blocks-2026-10-22.sql',
        to_regclass('public.program_blocks') is not null),
  (32, 'migration-coach-brand-2026-10-22.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'my_coach_brand')),
  (33, 'migration-health-2026-10-22.sql  (1.3, Apple Health)',
        to_regclass('public.health_daily') is not null),
  (34, 'migration-history-import-2026-10-22.sql  (Switch kit: history import)',
        exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'workout_logs' and policyname = 'workout_logs_coach_import')),
  (35, 'migration-coach-notes-2026-10-22.sql',
        to_regclass('public.coach_notes') is not null),
  (36, 'migration-program-integrity-2026-10-22.sql  (programs.rev + log_program_set)',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'log_program_set')),
  (37, 'migration-pain-reports-2026-10-22.sql',
        to_regclass('public.pain_reports') is not null),
  (38, 'migration-voice-notes-2026-10-22.sql  (voice-notes bucket + messages_voice_meta)',
        exists (select 1 from storage.buckets where id = 'voice-notes')
        and exists (select 1 from pg_constraint where conname = 'messages_voice_meta')),
  (39, 'migration-readiness-cut-2026-10-22.sql  (HRV, nutrition_daily, goal cut targets)',
        to_regclass('public.nutrition_daily') is not null
        and exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'goals' and column_name = 'target_class')),
  (40, 'migration-form-check-annotations-2026-10-22.sql  (video review: drawings on form checks)',
        to_regclass('public.form_check_annotations') is not null
        and to_regprocedure('public.fca_coach_may(uuid)') is not null),
  (41, 'migration-meet-calendar-2026-10-22.sql  (planned meets, programs.starts_on/meet_date)',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'meets' and column_name = 'status')
        and exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'programs' and column_name = 'starts_on')
        and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'meets' and policyname = 'meets_coach_plan_insert')),
  (42, 'migration-team-programs-2026-10-22.sql  (team programs; needs row 36 first, and row 31 so a replaced block with logged sets is kept)',
        to_regclass('public.program_group_members') is not null
        and to_regprocedure('public.push_group_programs(uuid, bigint, jsonb)') is not null
        and to_regprocedure('public.program_set_logged_on(jsonb)') is not null),
  (43, 'migration-security-2026-10-22.sql  (security pass: former coaches out of programs / clips / pain reports, grid XSS backstop, check-in targets, invite_preview limit; after rows 29-42)',
        exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'programs' and policyname = 'programs_coach_live')
        and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'programs' and policyname = 'programs_coach_all')
        and to_regprocedure('public.my_checkin_questions()') is not null
        and exists (select 1 from pg_trigger where tgname = 'trg_programs_release_on_coach_change')),
  (44, 'migration-meet-day-2026-10-22.sql  (attempt plans + the meet-day board; needs row 41 first)',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'meets' and column_name = 'attempt_plan')
        and to_regclass('public.meet_attempts') is not null
        and to_regprocedure('public.meet_day_sync(uuid, jsonb, jsonb)') is not null
        and to_regprocedure('public.finish_meet_day(uuid)') is not null
        and to_regprocedure('public.meet_day_lifter_patch(uuid, jsonb)') is not null),
  (45, 'migration-live-desk-2026-10-22.sql  (programs, workout_logs, form_checks, checkins, checkin_answers, session_notes in Realtime; needs row 43 first)',
        (select count(*) from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'
            and tablename in ('programs', 'workout_logs', 'form_checks', 'checkins', 'checkin_answers', 'session_notes')) = 6),
  (46, 'migration-social-sign-in-2026-10-25.sql  (Continue with Apple / Google: finish_social_signup + the guard''s exemption)',
        to_regprocedure('public.finish_social_signup(text, text)') is not null
        and position('powa.social_role' in pg_get_functiondef('public.guard_profile_privileged_cols()'::regprocedure)) > 0),
  (47, 'migration-clients-2026-10-27.sql  (Clients + payments: the coach''s own record of packages and payments, never the athlete''s; after row 43)',
        to_regclass('public.client_billing') is not null
        and to_regclass('public.client_payments') is not null),
  (48, 'migration-intake-2026-10-27.sql  (the intake questionnaire a lifter fills in on joining a coach; after row 43)',
        to_regclass('public.intake') is not null),
  (49, 'migration-invite-brand-2026-10-27.sql  (the invite page wears the coach''s team name, logo and colour on Pro / Premium)',
        position('brand_name' in pg_get_function_result('public.invite_preview(text)'::regprocedure)) > 0),
  (50, 'migration-coach-challenges-2026-10-28.sql  (coach challenges: the coach''s own lifters on a board of their own in Club; needs only profiles)',
        to_regclass('public.coach_challenges') is not null
        and to_regclass('public.challenge_entries') is not null
        and to_regprocedure('public.challenge_member_may(uuid, boolean)') is not null
        and to_regprocedure('public.challenge_board(uuid[])') is not null
        and exists (select 1 from pg_trigger where tgname = 'trg_challenge_entries_guard')),
  (51, 'migration-coach-settings-2026-10-28.sql  (a coach''s own settings: progression rules, the capacity check; coach-only)',
        to_regclass('public.coach_settings') is not null
        and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'coach_settings') = 4),
  (52, 'migration-schedule-requests-2026-10-28.sql  (busy weeks: a lifter''s days for the week and the plan, their coach approves; after row 43)',
        to_regclass('public.schedule_requests') is not null
        and exists (select 1 from pg_trigger where tgname = 'trg_schedule_requests_guard')),
  (53, 'migration-coach-alerts-2026-10-28.sql  (coach alerts: the PRs and missed sessions switch, and the Monday report''s week stats; after migration-email-preferences.sql)',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'email_preferences' and column_name = 'push_alerts')
        and to_regprocedure('public.coach_week_stats(uuid[], date, date)') is not null),
  (54, 'migration-security-tidy-2026-10-28.sql  (trigger functions callable by nobody, a fixed search_path on ten functions, the edge functions'' own tables said to be theirs)',
        coalesce(not has_function_privilege('anon', to_regprocedure('public.handle_new_user()'), 'execute'), false)
        and coalesce(not has_function_privilege('authenticated', to_regprocedure('public.club_members_guard()'), 'execute'), false)
        and exists (select 1 from pg_proc where oid = to_regprocedure('public.touch_email_preferences()') and proconfig is not null)
        and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'edge_rate_limits' and policyname = 'service role only'))
)
select n, migration, applied from checks order by n;
