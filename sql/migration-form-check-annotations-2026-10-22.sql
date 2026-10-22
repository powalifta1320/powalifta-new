-- migration-form-check-annotations-2026-10-22.sql — POWALIFTA (video review, M6)
-- The coach's drawings on a form-check clip, so the lifter sees them replayed on their own video
-- at the right moments.
--
-- One row per form check (the coach's review of that clip):
--   drawings  jsonb array of vector drawings, coordinates normalised 0–1 to the video frame (so
--             they land on the same spot at any screen size), each pinned to a frame time:
--             [{"k":"angle","t":1.833,"p":[0.41,0.52,0.47,0.66,0.62,0.63]}, …]
--             k: line | arrow | circle | angle | free · t: seconds into the clip · p: x,y pairs
--   tags      judging tags: depth, lockout, pause, bar_path, setup, other
--   note      a short caption shown on the video with the drawings (the longer written reply
--             stays in form_checks.coach_reply)
--   align_t   the coach's "align here" mark for side-by-side compare (e.g. the bottom of the squat)
-- Each row is capped at 8 KB (drawings + note), so a review can never bloat the table or the
-- lifter's phone. video-review.js simplifies freehand strokes and shows the budget as it fills.
--
-- Who: the form check's coach writes (insert, update, delete) and reads, but only while the
-- athlete is still linked to them (profiles.coach_id). The athlete who sent the clip always reads.
-- Nobody else: not another coach, not the athlete's new coach, and not the old coach once the
-- athlete has left (they can't keep drawing on, or rewriting, a lifter who moved on). Deleting the
-- clip (or either account) deletes the review (on delete cascade).
--
-- Run any time: until it runs, the coach's drawings are kept on their own device (db.js) and the
-- lifter sees the written reply only. Idempotent; one transaction.
begin;

create table if not exists public.form_check_annotations (
  id             uuid primary key default gen_random_uuid(),
  form_check_id  uuid not null references public.form_checks(id) on delete cascade,
  coach_id       uuid not null references public.profiles(id) on delete cascade,
  drawings       jsonb not null default '[]'::jsonb,
  tags           text[] not null default '{}',
  note           text,
  align_t        numeric(8,3),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint fca_one_per_check unique (form_check_id),
  constraint fca_drawings_array check (jsonb_typeof(drawings) = 'array' and jsonb_array_length(drawings) <= 200),
  constraint fca_tags_known check (tags <@ array['depth','lockout','pause','bar_path','setup','other']::text[]),
  constraint fca_note_short check (note is null or char_length(note) <= 280),
  constraint fca_align_range check (align_t is null or (align_t >= 0 and align_t <= 3600)),
  -- the 8 KB cap: the drawings as stored (jsonb text form) plus the note
  constraint fca_size_cap check (octet_length(drawings::text) + coalesce(octet_length(note), 0) <= 8192)
);
create index if not exists form_check_annotations_coach_idx on public.form_check_annotations (coach_id);

alter table public.form_check_annotations enable row level security;

-- Is the signed-in user still this athlete's coach? SECURITY DEFINER because profiles RLS may
-- hide the athlete's row from the coach; it answers yes/no only and reads nothing else.
create or replace function public.is_current_coach_of(p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                  where p.id = p_athlete and p.coach_id is not null and p.coach_id = auth.uid());
$$;
revoke all on function public.is_current_coach_of(uuid) from public, anon;
grant execute on function public.is_current_coach_of(uuid) to authenticated;

-- Is the signed-in user the coach on this form check AND still the athlete's coach?
create or replace function public.fca_coach_may(p_form_check uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.form_checks fc
                  where fc.id = p_form_check and fc.coach_id = auth.uid()
                    and public.is_current_coach_of(fc.athlete_id));
$$;
revoke all on function public.fca_coach_may(uuid) from public, anon;
grant execute on function public.fca_coach_may(uuid) to authenticated;

-- Read: the athlete on the form check, always; its coach while still their coach.
drop policy if exists "fca_select" on public.form_check_annotations;
create policy "fca_select" on public.form_check_annotations
  for select to authenticated
  using (exists (select 1 from public.form_checks fc
                  where fc.id = form_check_annotations.form_check_id and fc.athlete_id = auth.uid())
         or (coach_id = auth.uid() and public.fca_coach_may(form_check_id)));

-- Write: only the form check's coach, in their own name, while still the athlete's coach.
drop policy if exists "fca_insert" on public.form_check_annotations;
create policy "fca_insert" on public.form_check_annotations
  for insert to authenticated
  with check (coach_id = auth.uid() and public.fca_coach_may(form_check_id));

drop policy if exists "fca_update" on public.form_check_annotations;
create policy "fca_update" on public.form_check_annotations
  for update to authenticated
  using (coach_id = auth.uid() and public.fca_coach_may(form_check_id))
  with check (coach_id = auth.uid() and public.fca_coach_may(form_check_id));

drop policy if exists "fca_delete" on public.form_check_annotations;
create policy "fca_delete" on public.form_check_annotations
  for delete to authenticated
  using (coach_id = auth.uid() and public.fca_coach_may(form_check_id));

-- A review can't move to another clip or coach, and its clock is the server's.
create or replace function public.form_check_annotations_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.form_check_id := old.form_check_id;
    new.coach_id := old.coach_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_form_check_annotations_guard on public.form_check_annotations;
create trigger trg_form_check_annotations_guard before insert or update on public.form_check_annotations
  for each row execute function public.form_check_annotations_guard();

revoke all on public.form_check_annotations from anon;
grant select, insert, update, delete on public.form_check_annotations to authenticated;

commit;

-- Verify:
--   select count(*) from public.form_check_annotations;
--   select policyname from pg_policies where tablename = 'form_check_annotations';
--   select proname from pg_proc where proname in ('is_current_coach_of', 'fca_coach_may');
-- Note: the clip itself (storage fc_obj_read, form_checks fc_member_read) still opens for a
-- former coach; that is the older form-checks policy, unchanged here.
