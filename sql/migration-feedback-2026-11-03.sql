-- migration-feedback-2026-11-03.sql — POWALIFTA. STATUS-check.sql row 65.
-- The Feedback box (the owner, 3 Nov: "Everyone, admin page + email"): every signed-in coach and lifter can send an
-- idea or report a problem from the app (You › Feedback, You › Report a problem, the laptop rail's Feedback and
-- Settings › Help & account). Each one is a row here; the owner reads them on admin.html (Feedback) and gets an email.
--
-- The way in is the send-feedback edge function (supabase/functions/send-feedback, Verify JWT on): it takes the user
-- from the token only, checks the words and the technical details, caps each person at 20 in 24 hours, inserts with
-- the service role and emails every admin account (best-effort: the row is what counts).
--
-- The shape (feedback):
--   user_id     who sent it (auth.users; their rows go when their account is deleted)
--   kind        'idea' | 'problem'
--   body        their words: 1 to 4,000 characters, not only spaces
--   context     a problem's technical details when they leave "Include technical details" on (the screen, app version,
--               web or iPhone app, device and browser, screen size, theme, the last few error messages; never training
--               data, tokens or emails): a JSON object of at most 8 KB. An idea, or a problem with the switch off: {}.
--   status      new → seen → done (the owner's), admin_note (the owner's, up to 2,000 characters), handled_at (when
--               the status last moved: the server's clock; back to new clears it)
--   created_at  the server's clock
--
-- Who (RLS, one policy per command as since row 55, every check wrapped in (select ...)):
--   a signed-in user   inserts their own (user_id = their id) and reads their own; never anyone else's
--   an admin           reads, updates (status, admin_note) and deletes every row (public.is_admin())
--   anon               nothing at all (no policy, no privilege)
--   the edge function  service role (no RLS); the guard below still caps it
--
-- The guard (trg_feedback_guard, BEFORE INSERT OR UPDATE):
--   - the cap: 20 rows per person in any 24 hours, however a row arrives (the function counts first and answers 429;
--     this catches a direct API insert and two sends at the same moment, which queue on one lock per person);
--     "feedback_cap" in the error is what the function looks for
--   - a signed-in insert starts as new, unhandled, without a note, stamped now (a user can't backdate or close their own)
--   - a signed-in update (an admin, through RLS) changes status and admin_note only: who sent it, the kind, the words,
--     the details and when stay as they came
--   - handled_at is the server's: stamped when the status moves, cleared when it goes back to new
--
-- Run it before deploying send-feedback (the function answers 503 not_ready until it is in, and the app keeps the
-- draft). Idempotent; one transaction. When row 60 (two-factor) is in, this file gives the new table its powa_mfa_aal2
-- itself, as row 61 does, so row 60 stays true; before row 60, run migration-mfa-aal2-2026-10-28.sql after this file
-- as usual.
--
-- Tested in PGlite (test/feedback-sql.test.mjs): runs twice; row 65 false before, true after; a user inserts and reads
-- their own, never another's, and can't update or delete even their own; an admin reads, updates and deletes every
-- row and the guard keeps the words; anon can't insert or read; the checks refuse a bad kind, an empty or blank body,
-- 4,001 characters, a non-object or oversize context; the cap at 20 in 24 hours for a user and the service role; an
-- account's deletion takes its rows; with row 60 in, the table gets powa_mfa_aal2 (an aal1 session of a two-factor
-- account sends and reads nothing) and row 60 stays true.
--
-- Undo (by hand, if ever):
--   drop table public.feedback; drop function public.feedback_guard();
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'migration-feedback: public.profiles is missing. Run this in the POWALIFTA project. Nothing was changed.';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'migration-feedback: public.is_admin() is missing (the admin helper every admin policy uses). Nothing was changed.';
  end if;
end $$;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('idea', 'problem')),
  body text not null check (char_length(body) between 1 and 4000 and body ~ '[^[:space:]]'),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 8192),
  status text not null default 'new' check (status in ('new', 'seen', 'done')),
  admin_note text check (char_length(admin_note) <= 2000),
  handled_at timestamptz,
  created_at timestamptz not null default now());
comment on table public.feedback is
  'The Feedback box: ideas and problem reports from signed-in coaches and lifters (send-feedback inserts; admins read them on admin.html). migration-feedback-2026-11-03.sql';

-- The owner's list (newest first) and the cap's count (one person, the last 24 hours).
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at);

alter table public.feedback enable row level security;

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists feedback_delete on public.feedback;
create policy feedback_delete on public.feedback
  for delete to authenticated
  using ((select public.is_admin()));

revoke all on public.feedback from anon;
grant select, insert, update, delete on public.feedback to authenticated;
grant all on public.feedback to service_role;

-- The guard: the cap for every way in; for signed-in users, a new row starts new and an update moves only the status
-- and the note; handled_at is the server's clock.
create or replace function public.feedback_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  n integer;
  api boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('feedback:' || new.user_id::text, 0));
    select count(*) into n from public.feedback f
     where f.user_id = new.user_id and f.created_at > now() - interval '24 hours';
    if n >= 20 then
      raise exception 'feedback_cap: 20 in 24 hours' using errcode = 'P0001';
    end if;
    if api then
      new.status := 'new';
      new.admin_note := null;
      new.handled_at := null;
      new.created_at := now();
    end if;
    return new;
  end if;
  if api then
    new.id := old.id;
    new.user_id := old.user_id;
    new.kind := old.kind;
    new.body := old.body;
    new.context := old.context;
    new.created_at := old.created_at;
  end if;
  if new.status is distinct from old.status then
    new.handled_at := case when new.status = 'new' then null else now() end;
  elsif api then
    new.handled_at := old.handled_at;
  end if;
  return new;
end $$;
drop trigger if exists trg_feedback_guard on public.feedback;
create trigger trg_feedback_guard before insert or update on public.feedback
  for each row execute function public.feedback_guard();
revoke all on function public.feedback_guard() from public, anon, authenticated;

-- Two-factor (row 60): when it's in, the new table gets its restrictive policy here, as that file would make it.
do $$
begin
  if to_regprocedure('public.powa_mfa_ok()') is not null then
    drop policy if exists powa_mfa_aal2 on public.feedback;
    create policy powa_mfa_aal2 on public.feedback as restrictive for all to authenticated
      using ((select public.powa_mfa_ok())) with check ((select public.powa_mfa_ok()));
  end if;
end $$;

commit;

-- Verify (read-only):
--   select policyname, cmd, permissive from pg_policies where tablename = 'feedback' order by 1;   -- 4 (+ powa_mfa_aal2 with row 60)
--   select has_table_privilege('anon', 'public.feedback', 'insert');                              -- false
--   select tgname from pg_trigger where tgname = 'trg_feedback_guard';                            -- 1 row
--   Then STATUS-check.sql: row 65 true (and row 60 still true when it was).
