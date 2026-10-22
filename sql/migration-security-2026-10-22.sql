-- migration-security-2026-10-22.sql — POWALIFTA
-- From the 2026-10-22 security pass over everything shipped since 10-21. One transaction,
-- idempotent; run AFTER every *-2026-10-22.sql file above it in STATUS-check.sql (it changes
-- policies those files create). No table or column is added or dropped.
--   1. programs: a coach reaches a program only while the athlete is on their roster today.
--      (programs_coach_all let a FORMER coach read and rewrite the block the athlete still trains
--      on, and let any coach insert a program into any user whose id they knew.)
--   2. when an athlete's coach changes (they leave, join someone else, or are released), the old
--      coach's programs become the athlete's own (coach_id = the athlete, the app's "self-coached"
--      convention): the athlete can then edit or delete them, and the old coach is out. Rows
--      already in that state are fixed once.
--   3. an athlete writing a program someone else coaches can only put numbers in a set's numeric
--      fields (reps, weight, RPE...). The coach's grid rendered reps as HTML: a string there was
--      stored XSS into the coach's session. The client now escapes it too; this is the backstop.
--   4. form checks: a former coach can no longer open the clips or post replies on them.
--   5. pain reports: a coach sees and resolves only reports filed while they coached the
--      athlete, never the previous coach's (and never that coach's private note).
--   6. check-in questions: an athlete no longer reads the table directly (the row carried the
--      ids of every other athlete a targeted question went to). They get their questions from
--      my_checkin_questions(), which leaves the target list out.
--   7. invite_preview (anonymous) is rate limited per client IP and overall, so it can't be used
--      to search the 6-character code space.
begin;

-- The live-link test the other policies use (same body as migration-form-check-annotations).
create or replace function public.is_current_coach_of(p_athlete uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p
                  where p.id = p_athlete and p.coach_id is not null and p.coach_id = auth.uid());
$$;
revoke all on function public.is_current_coach_of(uuid) from public, anon;
grant execute on function public.is_current_coach_of(uuid) to authenticated;

-- 1 -----------------------------------------------------------------------------------
-- The athlete's own policies (programs_athlete_read/insert/update/delete_own) are unchanged and
-- still cover a self-coached program (athlete_id = coach_id = me). push_group_programs and
-- log_program_set are SECURITY INVOKER, so they follow these policies too.
drop policy if exists "programs_coach_all" on public.programs;
drop policy if exists "programs_coach_live" on public.programs;
create policy "programs_coach_live" on public.programs
  for all to authenticated
  using (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id))
  with check (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

drop policy if exists "programs_admin_all" on public.programs;
create policy "programs_admin_all" on public.programs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 2 -----------------------------------------------------------------------------------
-- SECURITY DEFINER: the update below runs as the function owner, so guard_program_coach (which
-- pins coach_id for an athlete's own write) and the RLS above don't apply to it.
create or replace function public.programs_release_on_coach_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.coach_id is not null and new.coach_id is distinct from old.coach_id then
    update public.programs
       set coach_id = new.id, updated_at = now()
     where athlete_id = new.id
       and coach_id = old.coach_id
       and coach_id <> new.id;         -- already the athlete's own
  end if;
  return null;
end;
$$;
revoke all on function public.programs_release_on_coach_change() from public, anon, authenticated;

drop trigger if exists trg_programs_release_on_coach_change on public.profiles;
create trigger trg_programs_release_on_coach_change
  after update of coach_id on public.profiles
  for each row execute function public.programs_release_on_coach_change();

-- Once: any program still filed under a coach the athlete has already left.
update public.programs pr
   set coach_id = pr.athlete_id, updated_at = now()
 where pr.coach_id is not null
   and pr.coach_id <> pr.athlete_id
   and not exists (select 1 from public.profiles p where p.id = pr.athlete_id and p.coach_id = pr.coach_id);

-- 3 -----------------------------------------------------------------------------------
-- true when every numeric field of every set is a JSON number, null, or a plain number written
-- as a string ("5", "182.5", ""): never markup, never an object.
create or replace function public.program_set_numbers_ok(p_weeks jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select not exists (
    select 1
      from jsonb_array_elements(case when jsonb_typeof(p_weeks) = 'array' then p_weeks else '[]'::jsonb end) w(v)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(w.v->'days') = 'array' then w.v->'days' else '[]'::jsonb end) d(v)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(d.v->'exercises') = 'array' then d.v->'exercises' else '[]'::jsonb end) e(v)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(e.v->'sets') = 'array' then e.v->'sets' else '[]'::jsonb end) s(v)
      cross join lateral (values ('weight'), ('reps'), ('rpe'), ('actualRpe'), ('plannedWeight'), ('plannedReps'),
                                 ('weightHi'), ('pct')) k(key)
     where jsonb_typeof(s.v) = 'object' and s.v ? k.key
       -- Numbers, or short text without markup characters: coaches write reps like "AMRAP" or "5+",
       -- and the athlete's save carries the whole block, so plain words must pass.
       and not (jsonb_typeof(s.v->k.key) in ('number', 'null')
                or (jsonb_typeof(s.v->k.key) = 'string' and length(s.v->>k.key) <= 40
                    and (s.v->>k.key) !~ '[<>"''`\\]')));
$$;

create or replace function public.guard_program_athlete_numbers()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ath   uuid;
  v_coach uuid;
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  -- Only the athlete of a program someone else coaches: that coach renders what they wrote.
  -- On an update, the row as it was (this runs before guard_program_coach pins coach_id, so a
  -- write that also sets coach_id to the athlete must not get past it).
  if tg_op = 'UPDATE' then v_ath := old.athlete_id; v_coach := old.coach_id;
  else v_ath := new.athlete_id; v_coach := new.coach_id; end if;
  if auth.uid() is null or v_ath is distinct from auth.uid()
     or v_coach is null or v_coach = auth.uid() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.weeks is not distinct from old.weeks then return new; end if;
  if not public.program_set_numbers_ok(new.weeks) then
    raise exception 'a set''s weight, reps and RPE must be numbers or plain text' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists programs_guard_athlete_numbers on public.programs;
create trigger programs_guard_athlete_numbers
  before insert or update on public.programs
  for each row execute function public.guard_program_athlete_numbers();

-- 4 -----------------------------------------------------------------------------------
-- The athlete keeps full access to their own clips; the coach only while still their coach
-- (the same rule form_check_annotations already uses).
drop policy if exists "fc_member_read" on public.form_checks;
create policy "fc_member_read" on public.form_checks
  for select to authenticated
  using (auth.uid() = athlete_id
         or (auth.uid() = coach_id and public.is_current_coach_of(athlete_id)));

drop policy if exists "fc_member_update" on public.form_checks;
create policy "fc_member_update" on public.form_checks
  for update to authenticated
  using (auth.uid() = athlete_id
         or (auth.uid() = coach_id and public.is_current_coach_of(athlete_id)))
  with check (auth.uid() = athlete_id
              or (auth.uid() = coach_id and public.is_current_coach_of(athlete_id)));

drop policy if exists "fc_obj_read" on storage.objects;
create policy "fc_obj_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'form-checks'
         and ((storage.foldername(name))[1] = (auth.uid())::text
              or exists (select 1 from public.form_checks fc
                          where fc.storage_path = objects.name
                            and fc.coach_id = auth.uid()
                            and public.is_current_coach_of(fc.athlete_id))));

-- 5 -----------------------------------------------------------------------------------
-- pain_reports.coach_id is stamped at insert (pain_reports_guard) with the coach the athlete had
-- then. A report filed with no coach, or with a previous coach, stays the athlete's alone.
drop policy if exists "pain_reports_coach_read" on public.pain_reports;
create policy "pain_reports_coach_read" on public.pain_reports
  for select to authenticated
  using (pain_reports.coach_id = auth.uid()
         and exists (select 1 from public.profiles p where p.id = pain_reports.athlete_id and p.coach_id = auth.uid()));

drop policy if exists "pain_reports_coach_update" on public.pain_reports;
create policy "pain_reports_coach_update" on public.pain_reports
  for update to authenticated
  using (pain_reports.coach_id = auth.uid()
         and exists (select 1 from public.profiles p where p.id = pain_reports.athlete_id and p.coach_id = auth.uid()))
  with check (pain_reports.coach_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = pain_reports.athlete_id and p.coach_id = auth.uid()));

-- 6 -----------------------------------------------------------------------------------
-- Is this question open to me now (my current coach's, active, meant for everyone or for me)?
-- SECURITY DEFINER: the answer policies below can't read checkin_questions as the athlete any more.
create or replace function public.checkin_question_open_to_me(p_question uuid, p_coach uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.checkin_questions q
                  where q.id = p_question and q.coach_id = p_coach and q.active
                    and q.coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())
                    and (q.athlete_ids is null or auth.uid() = any (q.athlete_ids)));
$$;
revoke all on function public.checkin_question_open_to_me(uuid, uuid) from public, anon;
grant execute on function public.checkin_question_open_to_me(uuid, uuid) to authenticated;

-- The athlete's questions, without athlete_ids (who else a targeted question went to).
create or replace function public.my_checkin_questions()
returns table (id uuid, coach_id uuid, prompt text, kind text, choices text[], cadence text,
               "position" int, active boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select q.id, q.coach_id, q.prompt, q.kind, q.choices, q.cadence, q.position, q.active, q.created_at
    from public.checkin_questions q
   where auth.uid() is not null
     and q.active
     and q.coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())
     and (q.athlete_ids is null or auth.uid() = any (q.athlete_ids))
   order by q.position, q.created_at;
$$;
revoke all on function public.my_checkin_questions() from public, anon;
grant execute on function public.my_checkin_questions() to authenticated;

drop policy if exists "checkin_questions_athlete_read" on public.checkin_questions;

drop policy if exists "checkin_answers_athlete_insert" on public.checkin_answers;
create policy "checkin_answers_athlete_insert" on public.checkin_answers
  for insert to authenticated
  with check (athlete_id = auth.uid()
              and coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())
              and public.checkin_question_open_to_me(question_id, coach_id));

drop policy if exists "checkin_answers_athlete_update" on public.checkin_answers;
create policy "checkin_answers_athlete_update" on public.checkin_answers
  for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid()
              and coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())
              and public.checkin_question_open_to_me(question_id, coach_id));

-- 7 -----------------------------------------------------------------------------------
-- 30 lookups an hour per client IP, 3000 an hour in all (the page only needs one per visit; past
-- the limit it raises, and join.html then stays generic: the code itself still works at sign-up).
-- A wrong code returns no row WITHOUT raising, so its count is kept. Cloudflare's
-- cf-connecting-ip is set by the edge; x-forwarded-for is only a fallback, and the overall cap
-- holds even if that one is forged.
drop function if exists public.invite_preview(text);
create function public.invite_preview(p_code text)
returns table (coach_name text, avatar_url text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_hdr json;
  v_ip  text;
  v_ok  boolean;
begin
  if to_regprocedure('public.rl_bump(text,text,integer,integer)') is not null then
    begin
      v_hdr := nullif(current_setting('request.headers', true), '')::json;
    exception when others then v_hdr := null;
    end;
    v_ip := coalesce(nullif(btrim(v_hdr->>'cf-connecting-ip'), ''),
                     nullif(btrim(v_hdr->>'x-real-ip'), ''),
                     nullif(btrim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''),
                     'unknown');
    select r.allowed into v_ok from public.rl_bump('invite-preview-all', 'all', 3600, 3000) r;
    if v_ok is false then
      raise exception 'Too many lookups. Try again later' using errcode = 'check_violation';
    end if;
    select r.allowed into v_ok from public.rl_bump('invite-preview', left(v_ip, 64), 3600, 30) r;
    if v_ok is false then
      raise exception 'Too many lookups. Try again later' using errcode = 'check_violation';
    end if;
  end if;

  return query
  select split_part(trim(coalesce(p.name, '')), ' ', 1) as coach_name,
         p.avatar_url
    from public.invites i
    join public.profiles p on p.id = i.coach_id
   where i.code = upper(trim(coalesce(p_code, '')))
     and i.used = false
     and i.created_at > now() - interval '60 days'
   limit 1;
end;
$$;
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

commit;

-- Verify (read-only):
--   select policyname from pg_policies where schemaname = 'public' and tablename = 'programs';
--     -> programs_coach_live and programs_admin_all, no programs_coach_all
--   select tgname from pg_trigger where tgname in ('trg_programs_release_on_coach_change', 'programs_guard_athlete_numbers');
--   select provolatile from pg_proc where proname = 'invite_preview';   -> v
--   select count(*) from pg_policies where tablename = 'checkin_questions' and policyname = 'checkin_questions_athlete_read';  -> 0
