-- migration-invite-brand-2026-10-27.sql — POWALIFTA
-- Branded onboarding: the invite page (join.html, /j/CODE) shows the inviting coach's team name,
-- logo and colour, not only their first name and photo, when the coach's plan includes branding
-- (Pro or Premium, the same test as my_coach_brand(): powa_effective_tier in ('pro', 'premium')).
-- A coach on Free or Basic, an unused branding field, or an expired plan sends nulls, and the page
-- stays POWALIFTA's.
--
-- invite_preview gains three columns. Postgres can't change a function's return type in place, so
-- it is dropped and created again: the same body, the same rate limits (per client IP and overall),
-- SECURITY DEFINER with a fixed search_path, and the same grants (anon + authenticated execute).
-- Idempotent; one transaction.
begin;

drop function if exists public.invite_preview(text);
create function public.invite_preview(p_code text)
returns table (coach_name text, avatar_url text, brand_name text, brand_logo_url text, brand_color text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hdr json;
  v_ip  text;
  v_ok  boolean;
begin
  if to_regprocedure('public.rl_bump(text,text,integer,integer)') is not null then
    begin
      v_hdr := nullif(current_setting('request.headers', true), '')::json;
    exception when others then v_hdr := null;
    end;
    v_ip := coalesce(nullif(btrim(v_hdr->>'cf-connecting-ip'), ''),
                     nullif(btrim(v_hdr->>'x-real-ip'), ''),
                     nullif(btrim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''),
                     'unknown');
    select r.allowed into v_ok from public.rl_bump('invite-preview-all', 'all', 3600, 3000) r;
    if v_ok is false then
      raise exception 'Too many lookups. Try again later' using errcode = 'check_violation';
    end if;
    select r.allowed into v_ok from public.rl_bump('invite-preview', left(v_ip, 64), 3600, 30) r;
    if v_ok is false then
      raise exception 'Too many lookups. Try again later' using errcode = 'check_violation';
    end if;
  end if;

  return query
  select split_part(trim(coalesce(p.name, '')), ' ', 1) as coach_name,
         p.avatar_url,
         case when b.ok then p.brand_name end as brand_name,
         case when b.ok then p.brand_logo_url end as brand_logo_url,
         case when b.ok then p.brand_color end as brand_color
    from public.invites i
    join public.profiles p on p.id = i.coach_id
    cross join lateral (
      select public.powa_effective_tier(p.subscription_tier, p.subscription_period_end) in ('pro', 'premium') as ok
    ) b
   where i.code = upper(trim(coalesce(p_code, '')))
     and i.used = false
     and i.created_at > now() - interval '60 days'
   limit 1;
end;
$$;
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

commit;

-- Verify:
--   select * from public.invite_preview('XXXXXX');   -- no row for an unknown code
--   select pg_get_function_result('public.invite_preview(text)'::regprocedure);
