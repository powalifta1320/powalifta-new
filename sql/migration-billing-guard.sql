-- ============================================================
-- POWALIFTA — billing ids nobody can edit from the app (2026-10-17)
--
-- Found by ECC's security-reviewer on 2026-10-17: profiles_self_update lets a
-- lifter edit their own row, and nothing froze apple_original_transaction_id.
-- A coach could buy an Apple plan, blank that column, then cancel or refund:
-- Apple's EXPIRED / REFUND notifications (apple-notifications) find a profile
-- only by that id, so the plan would never be taken away. Writing someone
-- else's id onto your own row was possible too.
--
-- This trigger pins every billing column for app users (roles anon and
-- authenticated): on INSERT they start empty, on UPDATE they keep their old
-- value. Edge functions (service_role), the SQL editor and migrations are not
-- affected, and neither is subscription_tier (admin comps still work through
-- their own policy; the existing privilege guard keeps freezing tier for
-- everyone else). It never raises, so a normal profile save can't fail on it.
--
-- Separate from guard_profile_privileged_cols (migration-rls-hardening-4.sql)
-- on purpose: it adds to it without needing to know how it was last changed.
-- Idempotent; apply any time.
-- ============================================================

create or replace function public.guard_profile_billing_ids()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.apple_original_transaction_id := null;
    new.ls_subscription_id := null;
    new.ls_customer_id := null;
    new.subscription_status := null;
    new.subscription_updated_at := null;
  else
    new.apple_original_transaction_id := old.apple_original_transaction_id;
    new.ls_subscription_id := old.ls_subscription_id;
    new.ls_customer_id := old.ls_customer_id;
    new.subscription_status := old.subscription_status;
    new.subscription_updated_at := old.subscription_updated_at;
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_billing_ids on public.profiles;
create trigger trg_guard_profile_billing_ids before insert or update on public.profiles
  for each row execute function public.guard_profile_billing_ids();

-- ---------- verification (run after applying)
-- select tgname from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'trg_guard_profile_billing_ids';
