-- migration-coach-brand-2026-10-22.sql — POWALIFTA
-- Coach branding (Pro and Premium): a coach's team name, logo and colour on their athletes' app.
--
--   profiles.brand_name      the team name ("Barbell Lab"), 1-40 characters
--   profiles.brand_logo_url  the coach's own upload: avatars/<their id>/brand.<ext>
--   profiles.brand_color     a #rrggbb colour (the app offers a fixed palette that reads well)
--
-- The coach writes their own (the existing update-self policy). Athletes never read the coach's
-- profile row: they ask my_coach_brand(), which answers only for their current coach and only
-- while that coach's plan in force is Pro or Premium (a paid period that ended more than 3 days
-- ago counts as Free, as everywhere else). So a coach on a lower plan can save branding, but
-- nobody sees it, and branding switches off by itself when a plan lapses.
--
-- Run any time (the app hides branding until it exists). Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
alter table public.profiles add column if not exists brand_name text;
alter table public.profiles add column if not exists brand_logo_url text;
alter table public.profiles add column if not exists brand_color text;
-- (From migration-payments-2026-10-22.sql; added here too so this file stands alone.)
alter table public.profiles add column if not exists subscription_period_end timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_brand_name_len') then
    alter table public.profiles add constraint profiles_brand_name_len
      check (brand_name is null or char_length(btrim(brand_name)) between 1 and 40);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_brand_color_hex') then
    alter table public.profiles add constraint profiles_brand_color_hex
      check (brand_color is null or brand_color ~ '^#[0-9a-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_brand_logo_len') then
    alter table public.profiles add constraint profiles_brand_logo_len
      check (brand_logo_url is null or char_length(brand_logo_url) <= 500);
  end if;
end $$;

-- 2 -----------------------------------------------------------------------------------
-- A new logo must be the coach's own upload in our avatars bucket (no outside images); a new
-- team name passes the same word filter as club names, when that filter is installed.
create or replace function public.guard_coach_brand()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  blocked boolean;
begin
  if new.brand_logo_url is not null and new.brand_logo_url <> ''
     and (tg_op = 'INSERT' or new.brand_logo_url is distinct from old.brand_logo_url)
     and new.brand_logo_url !~ ('^https://cxnotrikxvzncupswvio\.supabase\.co/storage/v1/object/public/avatars/'
                                || new.id::text || '/brand[A-Za-z0-9._-]{0,60}(\?t=[0-9]{1,16})?$') then
    raise exception 'the logo must be a picture you uploaded' using errcode = '22023';
  end if;
  if new.brand_name is not null
     and (tg_op = 'INSERT' or new.brand_name is distinct from old.brand_name)
     and to_regprocedure('public.powa_text_blocked(text)') is not null then
    execute 'select public.powa_text_blocked($1)' into blocked using new.brand_name;
    if blocked then
      raise exception 'that team name isn''t allowed' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_coach_brand on public.profiles;
create trigger trg_guard_coach_brand before insert or update of brand_name, brand_logo_url on public.profiles
  for each row execute function public.guard_coach_brand();
revoke all on function public.guard_coach_brand() from public, anon, authenticated;

-- 3 -----------------------------------------------------------------------------------
-- The plan in force (same body as migration-payments-2026-10-22.sql).
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

-- An athlete's coach's branding: only their current coach, only on Pro or Premium.
create or replace function public.my_coach_brand()
returns table (coach_id uuid, brand_name text, brand_logo_url text, brand_color text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.brand_name, c.brand_logo_url, c.brand_color
    from public.profiles me
    join public.profiles c on c.id = me.coach_id
   where me.id = (select auth.uid())
     and public.powa_effective_tier(c.subscription_tier, c.subscription_period_end) in ('pro', 'premium')
     and (c.brand_name is not null or c.brand_logo_url is not null or c.brand_color is not null)
$$;
revoke all on function public.my_coach_brand() from public, anon;
grant execute on function public.my_coach_brand() to authenticated;

commit;

-- Verify (as a Pro coach: You → Branding; as one of their athletes, Train shows the team name):
--   select brand_name, brand_color from public.profiles where brand_name is not null;
