-- migration-invite-links-2026-10-22.sql — POWALIFTA
-- Coach invite LINKS (powalifta.com/j/ABC123). The join page shows who sent the invite, so the
-- athlete knows it's real before installing the app. This adds ONE read-only lookup:
--
--   invite_preview(code) -> the coach's FIRST name and photo, only for an invite that is still
--   unused and less than 60 days old. Nothing else: no email, no full name, no coach id. An
--   unknown or used code returns no row (the page then says the link doesn't work).
--
-- Joining is unchanged: the athlete signs up with the code and claim_invite links them (it is
-- rate limited and marks the code used). Run any time; idempotent; no table changes.
begin;

create or replace function public.invite_preview(p_code text)
returns table (coach_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select split_part(trim(coalesce(p.name, '')), ' ', 1) as coach_name,
         p.avatar_url
    from public.invites i
    join public.profiles p on p.id = i.coach_id
   where i.code = upper(trim(coalesce(p_code, '')))
     and i.used = false
     and i.created_at > now() - interval '60 days'
   limit 1;
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

commit;

-- Verify (expect one row with a first name for a fresh unused code you made, none for a used one):
--   select * from public.invite_preview('ABC123');
