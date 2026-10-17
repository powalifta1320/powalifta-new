-- ============================================================
-- POWALIFTA — reactions + set cards in the chat (2026-10-16, UI v6)
--
-- 1) messages.meta (jsonb, nullable) — a structured attachment on a chat
--    message. Today: {type:'set'|'session', …} so an athlete can send a logged
--    set or a finished session to their coach as a card. The plain-text body
--    is ALWAYS filled as well, so older app builds still read the message.
--    Insert-only: the existing guard_messages_update trigger
--    (migration-rls-hardening.sql) already freezes every column but read_at.
--
-- 2) message_reactions — one reaction per person per message (an iMessage
--    tapback). Fixed keys only, never free text, so there is nothing to
--    moderate. Thread members read; you write only your own row; the row's
--    coach_id / athlete_id must match the message's real thread.
--
-- 3) club_post_reactions — one reaction per member per club post. Members of
--    the club read; you write only your own row, only in a club you belong to,
--    only on a post that is in that club. Admins can read/delete (moderation).
--
-- A NULL reaction means "removed" (the client upserts null instead of deleting,
-- so realtime filters keep working). Both tables join supabase_realtime so the
-- counts move live.
--
-- Idempotent. Run AFTER migration-messages.sql and migration-clubs-social.sql.
-- Every client path FAILS SOFT until this runs (reactions just don't save,
-- sets go to the coach as plain text).
-- ============================================================

-- ---------------------------------------------------------------------
-- 1. messages.meta
alter table public.messages add column if not exists meta jsonb;
do $$ begin
  alter table public.messages add constraint messages_meta_size
    check (meta is null or (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 4096));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. message_reactions
create table if not exists public.message_reactions (
  message_id  uuid not null references public.messages(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  coach_id    uuid not null,
  athlete_id  uuid not null,
  reaction    text check (reaction is null or reaction in ('heart','up','fire','strong','laugh','q','clap','trophy')),
  updated_at  timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_thread_idx on public.message_reactions (coach_id, athlete_id);
create index if not exists message_reactions_athlete_idx on public.message_reactions (athlete_id);
alter table public.message_reactions enable row level security;

drop policy if exists mr_member_read on public.message_reactions;
create policy mr_member_read on public.message_reactions for select to authenticated
  using ((select auth.uid()) = coach_id or (select auth.uid()) = athlete_id);

drop policy if exists mr_own_insert on public.message_reactions;
create policy mr_own_insert on public.message_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and ((select auth.uid()) = coach_id or (select auth.uid()) = athlete_id)
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and m.coach_id = message_reactions.coach_id
        and m.athlete_id = message_reactions.athlete_id
    )
  );

drop policy if exists mr_own_update on public.message_reactions;
create policy mr_own_update on public.message_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists mr_own_delete on public.message_reactions;
create policy mr_own_delete on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Only the reaction (and its stamp) may change once a row exists.
create or replace function public.guard_reaction_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - 'reaction' - 'updated_at') is distinct from (to_jsonb(old) - 'reaction' - 'updated_at') then
    raise exception 'Only the reaction may change.';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_guard_message_reaction on public.message_reactions;
create trigger trg_guard_message_reaction before update on public.message_reactions
  for each row execute function public.guard_reaction_update();

-- ---------------------------------------------------------------------
-- 3. club_post_reactions
create table if not exists public.club_post_reactions (
  post_id     uuid not null references public.club_posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  club_id     uuid not null references public.clubs(id) on delete cascade,
  reaction    text check (reaction is null or reaction in ('heart','up','fire','strong','laugh','q','clap','trophy')),
  updated_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists club_post_reactions_club_idx on public.club_post_reactions (club_id);
alter table public.club_post_reactions enable row level security;

drop policy if exists cpr_member_read on public.club_post_reactions;
create policy cpr_member_read on public.club_post_reactions for select to authenticated
  using (public.is_club_member(club_id) or (select public.is_admin()));

drop policy if exists cpr_own_insert on public.club_post_reactions;
create policy cpr_own_insert on public.club_post_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_club_member(club_id)
    and exists (select 1 from public.club_posts p where p.id = club_post_reactions.post_id and p.club_id = club_post_reactions.club_id)
  );

drop policy if exists cpr_own_update on public.club_post_reactions;
create policy cpr_own_update on public.club_post_reactions for update to authenticated
  using (user_id = (select auth.uid()) and public.is_club_member(club_id))
  with check (user_id = (select auth.uid()) and public.is_club_member(club_id));

drop policy if exists cpr_own_delete on public.club_post_reactions;
create policy cpr_own_delete on public.club_post_reactions for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop trigger if exists trg_guard_post_reaction on public.club_post_reactions;
create trigger trg_guard_post_reaction before update on public.club_post_reactions
  for each row execute function public.guard_reaction_update();

revoke all on public.message_reactions, public.club_post_reactions from anon;

-- ---------------------------------------------------------------------
-- 4. Live counts. Realtime applies the read policies above per subscriber.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions') then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_post_reactions') then
    alter publication supabase_realtime add table public.club_post_reactions;
  end if;
end $$;

-- ---------- verification (run after applying)
-- select column_name, data_type from information_schema.columns where table_name = 'messages' and column_name = 'meta';
-- select tablename, rowsecurity from pg_tables where tablename in ('message_reactions', 'club_post_reactions');
-- select polname, polcmd from pg_policy where polrelid in ('public.message_reactions'::regclass, 'public.club_post_reactions'::regclass);
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename like '%reactions';
