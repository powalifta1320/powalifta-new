-- migration-voice-notes-2026-10-22.sql — POWALIFTA (brief 3.8 / 4.4, milestone M5)
-- Voice notes in the coach <-> athlete thread. No transcripts (open question 6).
--
--   storage bucket  voice-notes   private, 5 MB a file, audio only (audio/mp4 preferred; webm/ogg
--                                 where the browser can't record mp4)
--   object path     <coach_id>/<athlete_id>/<sender_id>/<message_id>.<ext>
--                   the thread first, then who recorded it, then the message it belongs to
--   messages.meta   {type:'voice', path, dur (seconds), peaks (32 ints 0-100), mime}
--                   the body is always filled too ("Voice note · 0:23"), so older builds still
--                   show something
--
-- Who can do what with a file:
--   upload   only the sender, only into a thread they belong to, only while the coach -> athlete
--            link is live (the same rule as sending a text message)
--   play     either person on the thread (history stays readable after a disconnect, like text)
--   delete   only the person who recorded it (the app removes an upload whose message insert
--            failed; deleting the account sweeps the rest, see delete-account)
--
-- A voice message must point at a file inside its own thread and its own sender's folder, so a
-- message can never borrow someone else's recording.
--
-- Run after migration-messages.sql (and, ideally, migration-reactions.sql, which adds meta; this
-- adds it too if it is missing). The app says "Voice notes switch on with the next update" until
-- it runs. Idempotent; one transaction. The storage part must run as the project owner (the SQL
-- Editor does).
begin;

-- 1. messages.meta + the voice shape -----------------------------------------------------
alter table public.messages add column if not exists meta jsonb;

alter table public.messages drop constraint if exists messages_voice_meta;
alter table public.messages add constraint messages_voice_meta check (
  meta is null
  or (meta->>'type') is distinct from 'voice'
  or coalesce((
        jsonb_typeof(meta->'path') = 'string'
    and (meta->>'path') like (coach_id::text || '/' || athlete_id::text || '/' || sender_id::text || '/%')
    and position('..' in (meta->>'path')) = 0
    and length(meta->>'path') <= 200
    and jsonb_typeof(meta->'dur') = 'number'
    and (meta->>'dur')::numeric > 0 and (meta->>'dur')::numeric <= 125
    and (meta->'peaks' is null or (jsonb_typeof(meta->'peaks') = 'array' and jsonb_array_length(meta->'peaks') <= 64))
  ), false)   -- a missing field reads as null: refuse it rather than let null pass the check
);

-- 2. the bucket ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 5242880,
        array['audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. the object policies ------------------------------------------------------------------
-- foldername(objects.name) = {coach_id, athlete_id, sender_id}. Always qualified: inside the
-- profiles sub-select a bare `name` would be the profile's name. Compared as text, so a malformed path
-- simply matches nothing (no uuid cast to throw).
drop policy if exists "vn_obj_insert" on storage.objects;
create policy "vn_obj_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(objects.name))[3] = auth.uid()::text
    and auth.uid()::text in ((storage.foldername(objects.name))[1], (storage.foldername(objects.name))[2])
    and exists (
      select 1 from public.profiles p
       where p.id::text = (storage.foldername(objects.name))[2]
         and p.coach_id::text = (storage.foldername(objects.name))[1]
    )
  );

drop policy if exists "vn_obj_read" on storage.objects;
create policy "vn_obj_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and auth.uid()::text in ((storage.foldername(objects.name))[1], (storage.foldername(objects.name))[2])
  );

drop policy if exists "vn_obj_delete" on storage.objects;
create policy "vn_obj_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(objects.name))[3] = auth.uid()::text
  );

commit;

-- Verify:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'voice-notes';
--   select polname from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'vn_%';
--   select conname from pg_constraint where conname = 'messages_voice_meta';
