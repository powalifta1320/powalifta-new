-- migration-limits-2026-10-22.sql — POWALIFTA
-- Caps on what one account can push into pages everyone loads (security sweep 2026-10-21, F4/F9).
-- One transaction, idempotent, run any time after migration-coach-profile.sql and
-- migration-leaderboard.sql. The app already limits these in its forms; this makes the database
-- refuse a direct API write of, say, an 8 MB bio that every visitor would then download.
--
--   1. profiles: name <= 100, bio <= 2000, avatar_url <= 500 characters.
--   2. leaderboard_entries (public): display_name <= 100, dots <= 1000, total_kg <= 2000,
--      bodyweight 20-400 kg. A forged #1 rank or a giant name can't be posted.
--   3. A NEW avatar_url must be one of our own avatar files (the uploader writes exactly that,
--      plus a ?t= cache-buster), so a profile picture can't be a tracking pixel on another
--      host. Existing values are left alone.
--   4. The avatars bucket can no longer be listed by anyone (it listed every uploader's id).
--      Pictures still load: the bucket is public, and public links don't need a read rule.
--      People keep read access to their own folder, which the upload's upsert needs.
--
-- The checks are NOT VALID: they bind every new write and leave old rows untouched (the limits
-- are generous enough that no real row should be near them).
begin;

-- 1 + 2 -------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'name')
     and not exists (select 1 from pg_constraint where conname = 'profiles_name_len') then
    alter table public.profiles add constraint profiles_name_len
      check (name is null or char_length(name) <= 100) not valid;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'bio')
     and not exists (select 1 from pg_constraint where conname = 'profiles_bio_len') then
    alter table public.profiles add constraint profiles_bio_len
      check (bio is null or char_length(bio) <= 2000) not valid;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url')
     and not exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_len') then
    alter table public.profiles add constraint profiles_avatar_url_len
      check (avatar_url is null or char_length(avatar_url) <= 500) not valid;
  end if;

  if to_regclass('public.leaderboard_entries') is not null then
    if not exists (select 1 from pg_constraint where conname = 'leaderboard_display_name_len') then
      alter table public.leaderboard_entries add constraint leaderboard_display_name_len
        check (char_length(display_name) <= 100) not valid;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'leaderboard_numbers_sane') then
      alter table public.leaderboard_entries add constraint leaderboard_numbers_sane
        check (dots <= 1000 and total_kg <= 2000 and (bodyweight_kg is null or bodyweight_kg between 20 and 400)) not valid;
    end if;
  end if;
end $$;

-- 3 -----------------------------------------------------------------------------------
create or replace function public.guard_avatar_url()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Only app users are held to it; the service role and the SQL editor can fix data freely.
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.avatar_url is null or new.avatar_url = '' then return new; end if;
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url then return new; end if;
  if new.avatar_url !~ '^https://cxnotrikxvzncupswvio\.supabase\.co/storage/v1/object/public/avatars/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}(\?t=[0-9]{1,16})?$' then
    raise exception 'avatar must be an uploaded picture' using errcode = '22023';
  end if;
  return new;
end $$;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url') then
    drop trigger if exists trg_guard_avatar_url on public.profiles;
    create trigger trg_guard_avatar_url before insert or update of avatar_url on public.profiles
      for each row execute function public.guard_avatar_url();
  end if;
end $$;

-- 4 -----------------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "avatars_public_read" on storage.objects;
    drop policy if exists "avatars_owner_read" on storage.objects;
    create policy "avatars_owner_read" on storage.objects
      for select to authenticated
      using (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);
  end if;
end $$;

commit;

-- Verify:
--   select conname, convalidated from pg_constraint where conname in
--     ('profiles_name_len','profiles_bio_len','profiles_avatar_url_len','leaderboard_display_name_len','leaderboard_numbers_sane');
--   select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars%';
