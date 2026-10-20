-- ============================================================
-- migration-content-filter.sql — the server-side half of the club content filter
-- (Apple App Review 1.2: apps with user content need a filter, reports, blocking
-- and contact details; clubs already have the last three).
--
-- The app runs filterUserText() (app.js) on every club post caption, club name,
-- city and description before saving: slurs, sexual content and threats are
-- refused and everyday swearing is starred. This makes the database refuse the
-- same BLOCKED words too, so posting straight to the API can't get round it.
-- The pattern below is GENERATED from FILTER_BLOCKED + FILTER_PHRASES in app.js
-- (every letter may repeat; whole words only, so "Scunthorpe" or "Niger" pass).
-- Change the list there, then regenerate this pattern.
--
-- RUN AFTER migration-clubs.sql + migration-clubs-social.sql. Idempotent: safe to re-run.
-- ============================================================
begin;

create or replace function public.powa_text_blocked(t text)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select coalesce(translate(lower(t), '013457@$', 'oieastas') ~ '\m(?:(?:n+i+g+g+[a-z]*|s+a+n+d+n+i+g+g+[a-z]*|n+i+g+a+|n+i+g+a+s+|f+a+g+g+[a-z]*|f+a+g+|f+a+g+s+|r+e+t+a+r+d+[a-z]*|t+r+a+n+n+y+|t+r+a+n+n+i+e+s+|k+i+k+e+|k+i+k+e+s+|s+p+i+c+|s+p+i+c+s+|c+h+i+n+k+|c+h+i+n+k+s+|g+o+o+k+|g+o+o+k+s+|w+e+t+b+a+c+k+[a-z]*|p+a+k+i+|p+a+k+i+s+|r+a+g+h+e+a+d+[a-z]*|t+o+w+e+l+h+e+a+d+[a-z]*|c+o+o+n+|c+o+o+n+s+|b+e+a+n+e+r+[a-z]*|c+u+n+t+[a-z]*|s+l+u+t+[a-z]*|w+h+o+r+e+[a-z]*|p+o+r+n+[a-z]*|n+u+d+e+s+|o+n+l+y+f+a+n+s+|b+l+o+w+j+o+b+[a-z]*|h+a+n+d+j+o+b+[a-z]*|d+i+l+d+o+[a-z]*|c+u+m+|c+u+m+s+h+o+t+[a-z]*|r+a+p+e+|r+a+p+e+d+|r+a+p+e+s+|r+a+p+i+n+g+|r+a+p+i+s+t+|r+a+p+i+s+t+s+|p+e+d+o+|p+e+d+o+s+|p+e+d+o+p+h+i+l+[a-z]*|p+a+e+d+o+|p+a+e+d+o+s+|p+a+e+d+o+p+h+i+l+[a-z]*|m+o+l+e+s+t+[a-z]*|k+y+s+)|k+i+l+l+\s+y+o+u+r+s+e+l+f+|k+i+l+l+\s+u+r+s+e+l+f+|k+i+l+l+\s+y+o+u+r+\s+s+e+l+f+|h+a+n+g+\s+y+o+u+r+s+e+l+f+|n+e+c+k+\s+y+o+u+r+s+e+l+f+|h+e+i+l+\s+h+i+t+l+e+r+|s+i+e+g+\s+h+e+i+l+)\M', false);
$fn$;

create or replace function public.powa_club_text_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if tg_table_name = 'club_posts' then
    if public.powa_text_blocked(new.caption) then
      raise exception 'content_blocked' using errcode = 'check_violation',
        hint = 'That has a word we don''t allow on POWALIFTA. Please change it.';
    end if;
  elsif public.powa_text_blocked(concat_ws(' ', new.name, new.city, new.description)) then
    raise exception 'content_blocked' using errcode = 'check_violation',
      hint = 'That has a word we don''t allow on POWALIFTA. Please change it.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists club_posts_text_guard on public.club_posts;
create trigger club_posts_text_guard
  before insert or update of caption on public.club_posts
  for each row execute function public.powa_club_text_guard();

drop trigger if exists clubs_text_guard on public.clubs;
create trigger clubs_text_guard
  before insert or update of name, city, description on public.clubs
  for each row execute function public.powa_club_text_guard();

commit;

-- Check it worked (expect: true, false):
-- select public.powa_text_blocked('kill yourself'), public.powa_text_blocked('Scunthorpe class grape');
