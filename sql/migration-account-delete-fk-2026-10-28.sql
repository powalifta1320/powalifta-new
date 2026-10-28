-- migration-account-delete-fk-2026-10-28.sql — POWALIFTA. A coach who ever left session-note feedback can delete
-- their account again.
--
-- session_notes.coach_id (who wrote the feedback) pointed at profiles with no ON DELETE action, so deleting a coach who
-- had ever commented failed (23503) and delete-account stopped half way. Apple requires account deletion to work.
-- Now the note stays with its lifter and loses only the pointer: ON DELETE SET NULL. The guard trigger on
-- session_notes already lets coach_id change on its own, and referential actions bypass RLS, so nothing else moves.
-- (28 Oct: the only foreign key to profiles / auth.users in public without an ON DELETE action.)
--
-- Idempotent; one transaction. STATUS-check.sql row 58.
-- Undo: the same alter with no "on delete" clause.
begin;

do $$
begin
  if to_regclass('public.session_notes') is null then
    raise exception 'public.session_notes is missing: run this in the POWALIFTA project.';
  end if;
end $$;

alter table public.session_notes drop constraint if exists session_notes_coach_id_fkey;
alter table public.session_notes
  add constraint session_notes_coach_id_fkey foreign key (coach_id) references public.profiles(id) on delete set null;

commit;

-- Verify (0 rows):
--   select conrelid::regclass, conname from pg_constraint
--    where contype = 'f' and confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
--      and connamespace = 'public'::regnamespace and confdeltype in ('a', 'r');
