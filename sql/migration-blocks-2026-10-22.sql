-- migration-blocks-2026-10-22.sql — POWALIFTA
-- Two things a coach programs with:
--   1. programs.maxes: the max a block's % sets work from, set by the coach ({"squat": 200,
--      "bench": 130, "deadlift": 240}, kg). Empty = the lifter's best estimated max.
--   2. program_blocks: past blocks. When a program with logged training is replaced (the next
--      block, a template, a pasted sheet, a block built from a goal), the old one is kept here,
--      sets and all, so the history of every block survives. `stats` ({sets, done, sessions})
--      lets the app list blocks without downloading every block's sets; those load when one opens.
--
-- Who sees a past block: the athlete, and their coach while the athlete is on the roster.
-- Who keeps one: the athlete's coach, or a lifter training on their own. Nobody edits one.
--
-- Run any time (the app keeps working without it: % sets use the best e1RM and replaced blocks
-- aren't kept). Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
alter table public.programs add column if not exists maxes jsonb;
alter table public.programs drop constraint if exists programs_maxes_shape;
alter table public.programs add constraint programs_maxes_shape
  check (maxes is null or (jsonb_typeof(maxes) = 'object' and octet_length(maxes::text) <= 400));

-- 2 -----------------------------------------------------------------------------------
create table if not exists public.program_blocks (
  id          uuid primary key default gen_random_uuid(),
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  coach_id    uuid references public.profiles(id) on delete set null,
  name        text not null default 'Block' check (char_length(name) <= 120),
  weeks       jsonb not null default '[]'::jsonb check (jsonb_typeof(weeks) = 'array' and octet_length(weeks::text) <= 1500000),
  maxes       jsonb check (maxes is null or jsonb_typeof(maxes) = 'object'),
  stats       jsonb check (stats is null or (jsonb_typeof(stats) = 'object' and octet_length(stats::text) <= 400)),
  started_on  date,
  ended_on    date,
  created_at  timestamptz not null default now()
);
alter table public.program_blocks add column if not exists stats jsonb;
create index if not exists program_blocks_athlete_idx on public.program_blocks (athlete_id, ended_on desc);

alter table public.program_blocks enable row level security;

drop policy if exists "program_blocks_read" on public.program_blocks;
create policy "program_blocks_read" on public.program_blocks
  for select to authenticated
  using (athlete_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = program_blocks.athlete_id and p.coach_id = auth.uid()));

-- The coach of the athlete keeps a block under their own name; a lifter on their own keeps theirs.
drop policy if exists "program_blocks_insert" on public.program_blocks;
create policy "program_blocks_insert" on public.program_blocks
  for insert to authenticated
  with check ((coach_id = auth.uid()
               and exists (select 1 from public.profiles p where p.id = program_blocks.athlete_id and p.coach_id = auth.uid()))
              or (athlete_id = auth.uid() and (coach_id is null or coach_id = auth.uid())));

-- Whoever kept it can drop it again (a coach while the athlete is still theirs).
drop policy if exists "program_blocks_delete" on public.program_blocks;
create policy "program_blocks_delete" on public.program_blocks
  for delete to authenticated
  using ((coach_id = auth.uid()
          and exists (select 1 from public.profiles p where p.id = program_blocks.athlete_id and p.coach_id = auth.uid()))
         or (athlete_id = auth.uid() and (coach_id is null or coach_id = auth.uid())));

grant select, insert, delete on public.program_blocks to authenticated;

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'programs' and column_name = 'maxes';
--   select count(*) from public.program_blocks;
