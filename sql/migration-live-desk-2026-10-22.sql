-- migration-live-desk-2026-10-22.sql
-- The live desk: a set the lifter logs lands on the coach's desk as it happens, and a coach's edit
-- of today's session reaches the lifter's phone without a reload.
--
-- What the app listens to (db.js DB.liveSubscribe, app.js liveFlush):
--   coach   programs        INSERT/UPDATE  filter coach_id=eq.<coach>       (log_program_set bumps the row)
--           workout_logs    INSERT         filter athlete_id=in.(<roster>)  (the set's e1RM row)
--           form_checks     INSERT/UPDATE  filter coach_id=eq.<coach>
--           checkins        INSERT/UPDATE  filter athlete_id=in.(<roster>)
--           checkin_answers INSERT/UPDATE  filter coach_id=eq.<coach>
--           session_notes   INSERT/UPDATE  filter athlete_id=in.(<roster>)  (the post-session note)
--   lifter  programs        INSERT/UPDATE  filter athlete_id=eq.<lifter>
--
-- Who receives what: Realtime checks each row against the subscriber's own SELECT policies, so the
-- server filters above only narrow the stream; RLS decides. The policies this relies on are the
-- live ones (all check the CURRENT coach link, so a former coach receives nothing):
--   programs        programs_coach_live   coach_id = auth.uid() and is_current_coach_of(athlete_id)
--                   programs_athlete_read athlete_id = auth.uid()
--   workout_logs    logs_coach_read       athlete_id in (profiles where coach_id = auth.uid())
--   form_checks     fc_member_read        athlete, or coach_id = auth.uid() and is_current_coach_of
--   checkins        checkins_coach_select profiles.coach_id = auth.uid()
--   checkin_answers checkin_answers_coach_read  coach_id = auth.uid() and the live link
--   session_notes   notes_coach_read / session_notes_coach_select  the live link
-- Several also say "or is_admin()": the app always sends the roster / coach filter, so an admin's
-- desk still only streams their own roster (and the client drops any row outside it).
--
-- No REPLICA IDENTITY change: the app listens to no DELETE (a DELETE can't be filtered or checked
-- against RLS, so it would reach every subscriber of the table). An undone set reaches the desk as
-- the program UPDATE that un-ticks it, and the app removes that set's log by its lastLogId.
--
-- Needs migration-security-2026-10-22.sql (STATUS-check row 43) first: before it, the old
-- programs_coach_all policy let a former coach read the program, and Realtime would stream it.
-- Idempotent; one transaction. Run any time: until it runs the app loads as before (no live rows).
begin;

do $$
declare t text;
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'programs' and policyname = 'programs_coach_all') then
    raise exception 'Run migration-security-2026-10-22.sql first (programs_coach_all still lets a former coach read programs)';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'programs' and policyname = 'programs_coach_live') then
    raise exception 'Run migration-security-2026-10-22.sql first (programs_coach_live is missing)';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['programs', 'workout_logs', 'form_checks', 'checkins', 'checkin_answers', 'session_notes'] loop
      if to_regclass('public.' || t) is not null
         and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

commit;

-- Verify:
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
--   -- programs, workout_logs, form_checks, checkins, checkin_answers, session_notes are listed
-- Undo (the desk falls back to loading once):
--   alter publication supabase_realtime drop table public.programs, public.workout_logs, public.form_checks,
--     public.checkins, public.checkin_answers, public.session_notes;
