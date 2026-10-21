-- migration-payments-2026-10-22.sql — POWALIFTA
-- Coach plans that last exactly as long as they're paid for, and reach every device at once.
-- One transaction, idempotent. Run AFTER migration-billing-guard.sql and
-- migration-admin-plan-comp.sql (it extends the functions they made). Every edge function and
-- the web app fail soft until it runs.
--
--   1. profiles.billing_provider ('apple' | 'ls'): who bills this coach now. Before this the
--      functions guessed from ids that were never cleared, so a coach who moved from the web to
--      the App Store (or back) could be refused, double-charged or downgraded by the old biller.
--   2. profiles.subscription_period_end: when the paid period ends (Apple's expiresDate, Lemon
--      Squeezy's renews_at / ends_at). Renewals push it forward.
--   3. The plan in force is the stored tier until 3 days after that end: a missed expiry
--      webhook, an undeployed Apple notification or a lapsed card can no longer leave a plan on
--      forever. The athlete-limit trigger uses it. Comped plans (no end date) never lapse.
--   4. Both columns are frozen for app users, like the other billing columns.
--   5. profiles joins the realtime publication, so an upgrade bought on one device reaches the
--      coach's other open devices immediately (RLS still decides who receives which row).
--   6. admin_set_plan(user, tier): the admin dashboard's plan change. A comp is a plan nobody
--      bills, so it also clears the biller and the end date (4. pins both for app users, the
--      admin included, so a direct update would leave a lapsed coach on Free).
--
-- DEPLOY ORDER: deploy the edge functions first (./deploy.sh functions), then run this. The
-- old ls-webhook / apple-iap don't write billing_provider, and once the column exists the app
-- reads a paid plan with no biller as complimentary.
begin;

-- 1 + 2 -------------------------------------------------------------------------------
alter table public.profiles add column if not exists billing_provider text;
alter table public.profiles add column if not exists subscription_period_end timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_billing_provider_check') then
    alter table public.profiles add constraint profiles_billing_provider_check
      check (billing_provider is null or billing_provider in ('apple', 'ls'));
  end if;
end $$;

-- Who bills the coaches already on a plan (the newest biller wins; unclear rows stay null).
update public.profiles set billing_provider = 'apple'
 where billing_provider is null and apple_original_transaction_id is not null
   and ls_subscription_id is null                -- both ids: the webhooks treated it as LS (below)
   and coalesce(subscription_status, '') = 'active';
update public.profiles set billing_provider = 'ls'
 where billing_provider is null and ls_subscription_id is not null
   and coalesce(subscription_status, '') in ('active', 'on_trial', 'trialing', 'past_due', 'cancelled', 'paused');

-- 3 -----------------------------------------------------------------------------------
create or replace function public.powa_effective_tier(p_tier text, p_end timestamptz)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when p_end is not null and p_end < now() - interval '3 days' then 'free'
    else coalesce(p_tier, 'free')
  end
$$;

create or replace function public.enforce_athlete_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  coach_tier text;
  tier_limit int;
  current_count int;
begin
  if new.coach_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.coach_id is not distinct from old.coach_id then
    return new;
  end if;

  -- Serialize concurrent links to this coach (see migration-admin-plan-comp.sql).
  perform pg_advisory_xact_lock(hashtext(new.coach_id::text));

  -- The plan in force: a paid period that ended more than 3 days ago counts as free.
  select public.powa_effective_tier(subscription_tier, subscription_period_end) into coach_tier
    from public.profiles
   where id = new.coach_id;

  tier_limit := case coalesce(coach_tier, 'free')
    when 'basic'   then 10
    when 'pro'     then 25
    when 'premium' then null   -- unlimited
    else 3                     -- free / unknown
  end;

  if tier_limit is not null then
    select count(*) into current_count
      from public.profiles
     where coach_id = new.coach_id
       and id <> new.id;
    if current_count >= tier_limit then
      raise exception 'ATHLETE_LIMIT_REACHED: this coach is at their plan limit (% athletes). Upgrade to add more.', tier_limit
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_athlete_limit() from public, anon, authenticated;

-- 4 -----------------------------------------------------------------------------------
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
    new.billing_provider := null;
    new.subscription_period_end := null;
  else
    new.apple_original_transaction_id := old.apple_original_transaction_id;
    new.ls_subscription_id := old.ls_subscription_id;
    new.ls_customer_id := old.ls_customer_id;
    new.subscription_status := old.subscription_status;
    new.subscription_updated_at := old.subscription_updated_at;
    new.billing_provider := old.billing_provider;
    new.subscription_period_end := old.subscription_period_end;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile_billing_ids on public.profiles;
create trigger trg_guard_profile_billing_ids before insert or update on public.profiles
  for each row execute function public.guard_profile_billing_ids();

-- 6 -----------------------------------------------------------------------------------
create or replace function public.admin_set_plan(p_user uuid, p_tier text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select is_admin from public.profiles where id = auth.uid()), false) then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if p_tier is null or p_tier not in ('free', 'basic', 'pro', 'premium') then
    raise exception 'unknown plan %', p_tier using errcode = '22023';
  end if;
  update public.profiles
     set subscription_tier = p_tier,
         subscription_status = case when p_tier = 'free' then 'inactive' else 'active' end,
         billing_provider = null,              -- nobody bills a comp
         subscription_period_end = null,       -- and it never lapses
         subscription_updated_at = now()
   where id = p_user;
  if not found then
    raise exception 'no such profile' using errcode = 'P0002';
  end if;
  return p_tier;
end $$;
revoke all on function public.admin_set_plan(uuid, text) from public, anon;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;

-- 5 -----------------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

commit;

-- Verify:
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'profiles'
--      and column_name in ('billing_provider', 'subscription_period_end');               -- 2 rows
--   select public.powa_effective_tier('pro', now() - interval '10 days');               -- free
--   select public.powa_effective_tier('pro', now() + interval '10 days');               -- pro
--   select public.powa_effective_tier('pro', null);                                     -- pro
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles';  -- 1 row
--   select billing_provider, count(*) from public.profiles group by 1;
