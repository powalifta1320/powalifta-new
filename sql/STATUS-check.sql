-- STATUS-check.sql — POWALIFTA. NOT a migration: read-only, changes nothing.
-- Paste into the Supabase SQL Editor and run. One row per migration, in the order they must
-- be applied; `applied` is true when the objects that migration creates are in the live
-- database. Run every file that says false, top to bottom, then run this again.
-- (migration-security-2026-10-20.sql must wait until the 2026-10-22 web push is live: the old
-- db.js selects marketplace_programs.* and would lose the listings.)
with checks(n, migration, applied) as (values
  (1,  'migration-ai-chat-usage.sql',
        to_regclass('public.ai_chat_usage') is not null),
  (2,  'migration-push-platform.sql',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'push_subscriptions' and column_name = 'platform')),
  (3,  'migration-apple-iap.sql',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'apple_original_transaction_id')),
  (4,  'migration-profiles-privacy.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'list_public_coaches')),
  (5,  'migration-billing-guard.sql',
        exists (select 1 from pg_trigger where tgname = 'trg_guard_profile_billing_ids')),
  (6,  'migration-boards-tiktok.sql',
        to_regclass('public.club_buddies') is not null),
  (7,  'migration-content-filter.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'powa_text_blocked')),
  (8,  'migration-edge-rate-limits.sql',
        to_regclass('public.edge_rate_limits') is not null),
  (9,  'migration-account-deletion.sql',
        exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace s on s.oid = t.relnamespace
                 where s.nspname = 'public' and t.relname = 'program_sales' and c.contype = 'f' and c.confdeltype = 'n')),
  (10, 'migration-rls-hardening-3.sql',
        exists (select 1 from pg_trigger where tgname = 'trg_guard_profile_privileged_cols_insert')),
  (11, 'migration-admin-plan-comp.sql',
        exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_admin_update')),
  (12, 'migration-rls-hardening-4.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'guard_profile_privileged_cols' and p.prosrc like '%powa.link_ok%')),
  (13, 'migration-security-2026-10-20.sql',
        exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public' and p.proname = 'get_marketplace_payload')),
  (14, 'migration-payments-2026-10-22.sql',
        exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'billing_provider')),
  (15, '  ...its realtime part (profiles in supabase_realtime)',
        exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'))
)
select n, migration, applied from checks order by n;
