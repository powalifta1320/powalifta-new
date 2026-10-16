-- migration-apple-iap.sql — POWALIFTA
--
-- Apple In-App Purchase support (#App-Store 3.1.1 remediation, 2026-07):
-- coach tiers become purchasable inside the iOS app via StoreKit 2. The
-- `apple-iap` edge function (service role) is the ONLY writer of these columns;
-- the existing privilege guard (migration-profiles-privilege-guard.sql) already
-- freezes subscription_tier & friends against client self-escalation, and that
-- protection extends to this column automatically ONLY via the service-role
-- path — clients cannot set it (no UPDATE policy grants it).
--
-- Provider inference (no new enum column needed):
--   apple_original_transaction_id IS NOT NULL AND ls_subscription_id IS NULL
--     -> Apple-billed (managed in iOS Settings; no LS billing UI shown)
--   ls_subscription_id IS NOT NULL
--     -> Lemon Squeezy-billed (web; existing webhook owns the row)
--
-- Idempotent. Additive. Order-independent (any time after profiles exists).

alter table public.profiles
  add column if not exists apple_original_transaction_id text;

-- One Apple subscription lineage may only ever map to one profile — a replayed
-- originalTransactionId cannot be attached to a second account.
create unique index if not exists profiles_apple_otxn_uniq
  on public.profiles (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

comment on column public.profiles.apple_original_transaction_id is
  'StoreKit originalTransactionId of the coach subscription when billed via Apple IAP. Written only by the apple-iap edge function (service role). NULL for web (Lemon Squeezy) billing.';
