-- migration-checkin-questions-2026-10-22.sql — POWALIFTA
-- Custom check-in questions. A coach writes their own questions ("Sleep last night, hours",
-- "How sore are you? 1-10", "Any pain?"), each answered every day or every week, by everyone on
-- the roster or by chosen athletes. Athletes answer on Train; the coach sees answers and averages
-- per athlete. The fixed weekly check-in (checkins table) is unchanged.
--
--   checkin_questions  one row per question, owned by the coach who wrote it.
--   checkin_answers    one row per question, athlete and period (the day for a daily question,
--                      the Monday for a weekly one). Numbers (1-10, yes = 1 / no = 0, a number)
--                      go in value_num; a choice or a written answer in value_text.
--
-- Privacy: an athlete sees only their current coach's active questions meant for them, and only
-- their own answers. A coach sees answers only from athletes on their roster today. Nobody else.
-- Deleting an account removes their questions or answers (cascades).
--
-- Run any time (the app hides the feature's data until it exists). Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
create table if not exists public.checkin_questions (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  prompt       text not null check (char_length(btrim(prompt)) between 1 and 140),
  kind         text not null check (kind in ('scale', 'yesno', 'choice', 'number', 'text')),
  choices      text[] check (choices is null or (array_length(choices, 1) between 2 and 6)),
  cadence      text not null default 'weekly' check (cadence in ('daily', 'weekly')),
  athlete_ids  uuid[] check (athlete_ids is null or array_length(athlete_ids, 1) <= 500),
  position     int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  -- a choice question needs its choices; nothing else carries any
  check ((kind = 'choice') = (choices is not null))
);
create index if not exists checkin_questions_coach_idx on public.checkin_questions (coach_id, position);

alter table public.checkin_questions enable row level security;

drop policy if exists "checkin_questions_coach_all" on public.checkin_questions;
create policy "checkin_questions_coach_all" on public.checkin_questions
  for all to authenticated
  using (coach_id = auth.uid())
  with check (coach_id = auth.uid());

-- The athlete's current coach's active questions, if they're meant for everyone or for this athlete.
drop policy if exists "checkin_questions_athlete_read" on public.checkin_questions;
create policy "checkin_questions_athlete_read" on public.checkin_questions
  for select to authenticated
  using (active
         and coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())
         and (athlete_ids is null or auth.uid() = any (athlete_ids)));

-- 2 -----------------------------------------------------------------------------------
create table if not exists public.checkin_answers (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.checkin_questions(id) on delete cascade,
  athlete_id   uuid not null references public.profiles(id) on delete cascade,
  coach_id     uuid not null references public.profiles(id) on delete cascade,
  period       date not null,
  value_num    numeric check (value_num is null or value_num between -100000 and 100000),
  value_text   text check (value_text is null or char_length(value_text) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (question_id, athlete_id, period)
);
create index if not exists checkin_answers_athlete_idx on public.checkin_answers (athlete_id, period desc);
create index if not exists checkin_answers_coach_idx on public.checkin_answers (coach_id, period desc);

alter table public.checkin_answers enable row level security;

-- The athlete reads their own answers.
drop policy if exists "checkin_answers_athlete_read" on public.checkin_answers;
create policy "checkin_answers_athlete_read" on public.checkin_answers
  for select to authenticated
  using (athlete_id = auth.uid());

-- ...and writes them only to a question they can see (their current coach's, active, meant for
-- them), filed under that coach.
drop policy if exists "checkin_answers_athlete_insert" on public.checkin_answers;
create policy "checkin_answers_athlete_insert" on public.checkin_answers
  for insert to authenticated
  with check (athlete_id = auth.uid()
              and coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())
              and exists (select 1 from public.checkin_questions q
                           where q.id = question_id and q.coach_id = checkin_answers.coach_id and q.active
                             and (q.athlete_ids is null or auth.uid() = any (q.athlete_ids))));

drop policy if exists "checkin_answers_athlete_update" on public.checkin_answers;
create policy "checkin_answers_athlete_update" on public.checkin_answers
  for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid()
              and coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())
              and exists (select 1 from public.checkin_questions q
                           where q.id = question_id and q.coach_id = checkin_answers.coach_id and q.active
                             and (q.athlete_ids is null or auth.uid() = any (q.athlete_ids))));

-- The coach reads answers from athletes on their roster now (not from someone who has left).
drop policy if exists "checkin_answers_coach_read" on public.checkin_answers;
create policy "checkin_answers_coach_read" on public.checkin_answers
  for select to authenticated
  using (coach_id = auth.uid()
         and exists (select 1 from public.profiles p where p.id = checkin_answers.athlete_id and p.coach_id = auth.uid()));

-- updated_at follows every change
create or replace function public.checkin_answers_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_checkin_answers_touch on public.checkin_answers;
create trigger trg_checkin_answers_touch before update on public.checkin_answers
  for each row execute function public.checkin_answers_touch();

grant select, insert, update, delete on public.checkin_questions to authenticated;
grant select, insert, update on public.checkin_answers to authenticated;

commit;

-- Verify (as a coach in the app: add a question under You → Check-in questions; as one of their
-- athletes: answer it on Train; the coach's athlete sheet then shows it):
--   select kind, cadence, count(*) from public.checkin_questions group by 1, 2;
--   select count(*) from public.checkin_answers;
