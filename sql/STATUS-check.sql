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
        to_regclass('public.program_blocks') is not null)
)
select n, migration, applied from checks order by n;
