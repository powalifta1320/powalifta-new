-- migration-history-import-2026-10-22.sql — POWALIFTA
-- The Switch kit's history import (switch-kit.js): a coach brings an athlete's past
-- training in from a spreadsheet (Strong, Hevy, FitNotes, their own sheet).
--
--   1. workout_logs.source       'import' on an imported set (null / 'app' = logged in the app).
--      workout_logs.import_key   the set's fingerprint from the file (day, lift, load, reps, RPE,
--                                and which of identical sets it was). Unique per athlete, so the
--                                same file imported twice adds nothing (ON CONFLICT DO NOTHING).
--      workout_logs.imported_by  who imported it.
--   2. One new INSERT policy: a coach may add IMPORTED sets (source = 'import', with a key,
--      imported_by = themselves) for an athlete on their roster. Nothing else. A coach still
--      can't log or edit an athlete's ordinary sets.
--   3. One new DELETE policy: a coach may take back sets THEY imported (Undo / "Remove the
--      sets this file imported") while the athlete is on their roster. Never app-logged sets,
--      never sets someone else imported.
--   4. program_blocks.import_key, unique per athlete: a past block kept from a sheet once.
--
-- BEFORE APPLYING: run sql/AUDIT-verify-live-rls.sql section 3 and check workout_logs has no
-- broader coach INSERT / UPDATE / DELETE policy already live (the live policies aren't all in
-- sql/; the PGlite test assumes an own-row FOR ALL policy plus a roster read policy). If one
-- exists, parts 2 and 3 add nothing and that policy is the one to narrow.
-- STATUS-check.sql row 34: renumber at merge if another track took 34.
-- The existing workout_logs policies are not touched. Run after migration-blocks-2026-10-22.sql
-- (or again after it: part 4 needs program_blocks). Run any time (before it runs, the app
-- says history import isn't switched on yet and writes nothing). Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
alter table public.workout_logs add column if not exists source text;
alter table public.workout_logs add column if not exists import_key text;
alter table public.workout_logs add column if not exists imported_by uuid references public.profiles(id) on delete set null;

alter table public.workout_logs drop constraint if exists workout_logs_import_shape;
alter table public.workout_logs add constraint workout_logs_import_shape check (
  (source is null or source in ('app', 'import'))
  and (import_key is null or (source = 'import' and char_length(import_key) between 8 and 80))
  and (imported_by is null or source = 'import')
);

-- NULL keys never collide, so ordinary sets are unaffected. A plain (not partial) unique
-- index so PostgREST's on_conflict=athlete_id,import_key can use it.
create unique index if not exists workout_logs_import_key_uq on public.workout_logs (athlete_id, import_key);

-- 2 -----------------------------------------------------------------------------------
drop policy if exists "workout_logs_coach_import" on public.workout_logs;
create policy "workout_logs_coach_import" on public.workout_logs
  for insert to authenticated
  with check (
    source = 'import'
    and import_key is not null
    and imported_by = auth.uid()
    and exists (select 1 from public.profiles p where p.id = workout_logs.athlete_id and p.coach_id = auth.uid())
  );

-- 3 -----------------------------------------------------------------------------------
drop policy if exists "workout_logs_coach_unimport" on public.workout_logs;
create policy "workout_logs_coach_unimport" on public.workout_logs
  for delete to authenticated
  using (
    source = 'import'
    and imported_by = auth.uid()
    and exists (select 1 from public.profiles p where p.id = workout_logs.athlete_id and p.coach_id = auth.uid())
  );

-- 4 -----------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.program_blocks') is not null then
    execute 'alter table public.program_blocks add column if not exists import_key text';
    execute 'alter table public.program_blocks drop constraint if exists program_blocks_import_key_len';
    execute 'alter table public.program_blocks add constraint program_blocks_import_key_len check (import_key is null or char_length(import_key) between 8 and 80)';
    execute 'create unique index if not exists program_blocks_import_key_uq on public.program_blocks (athlete_id, import_key)';
  end if;
end $$;

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'workout_logs' and column_name in ('source', 'import_key', 'imported_by');
--   select policyname, cmd from pg_policies where tablename = 'workout_logs' order by 1;
