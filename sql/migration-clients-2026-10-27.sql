-- migration-clients-2026-10-27.sql — POWALIFTA
-- Clients + payments: the business side of coaching a lifter, kept by the coach for the coach.
--   client_billing   one row per coach + athlete: the package, its price and cadence, when the next
--                    payment is due (and the day of the month it falls on), active / paused / ended,
--                    the client's phone and timezone, a private note.
--   client_payments  the coach's own record of money they took somewhere else (bank, card, PayPal,
--                    cash). NO money moves through POWALIFTA: this is the coach's ledger, nothing more.
--
-- Who sees a row: ONLY the coach who wrote it, and only while the athlete is on their roster
-- (public.is_current_coach_of, from migration-form-check-annotations / migration-security-2026-10-22).
-- The athlete never reads either table, in the app or through the API: there is no policy for them
-- (a lifter's app shows nothing about what a coach charges or takes outside the App Store; Apple
-- 3.1.1). No other coach reads them, and a new coach starts with none. When the athlete leaves, the
-- rows stay hidden from everyone; if they come back to the same coach, that coach sees them again.
-- Account deletion (either side) removes them (on delete cascade).
--
-- Run any time after migration-security-2026-10-22.sql (it needs public.is_current_coach_of): until
-- it runs, the app keeps a coach's clients and payments on their own device and says so.
-- Idempotent; one transaction.
begin;

do $$
begin
  if to_regprocedure('public.is_current_coach_of(uuid)') is null then
    raise exception 'Run migration-security-2026-10-22.sql first: it creates public.is_current_coach_of(uuid).';
  end if;
end $$;

create table if not exists public.client_billing (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles(id) on delete cascade,
  athlete_id    uuid not null references public.profiles(id) on delete cascade,
  package       text not null default 'Online coaching'
                check (char_length(package) between 1 and 80 and btrim(package) <> ''),
  amount_cents  integer not null default 0 check (amount_cents between 0 and 100000000),
  currency      text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  cadence       text not null default 'monthly'
                check (cadence in ('weekly', 'fortnightly', '4-weekly', 'monthly', 'quarterly', 'yearly', 'one-off')),
  next_due      date,
  -- The day of the month payments fall on, so a 31st survives February (next_due clamps to the
  -- month's last day; the schedule comes back to the 31st in March).
  due_day       smallint check (due_day between 1 and 31),
  status        text not null default 'active' check (status in ('active', 'paused', 'ended')),
  started_on    date,
  phone         text check (char_length(phone) <= 40),
  timezone      text check (char_length(timezone) <= 64),
  note          text check (char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (coach_id, athlete_id)
);
-- (coach_id, athlete_id) is indexed by the unique constraint; athlete_id for the delete cascade.
create index if not exists client_billing_athlete_idx on public.client_billing (athlete_id);

create table if not exists public.client_payments (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null references public.profiles(id) on delete cascade,
  athlete_id    uuid not null references public.profiles(id) on delete cascade,
  amount_cents  integer not null check (amount_cents between 1 and 100000000),
  currency      text not null check (currency ~ '^[A-Z]{3}$'),
  paid_on       date not null,
  method        text check (method in ('bank', 'card', 'paypal', 'cash', 'other')),
  period        text check (char_length(period) <= 40),
  note          text check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index if not exists client_payments_coach_paid_idx on public.client_payments (coach_id, paid_on desc);
create index if not exists client_payments_athlete_idx on public.client_payments (athlete_id);

alter table public.client_billing enable row level security;
alter table public.client_payments enable row level security;

-- One rule for every verb, on both tables: it's mine, and the athlete is mine right now.
-- The athlete has no policy at all: they never read, write or learn these rows exist.
drop policy if exists "client_billing_select" on public.client_billing;
create policy "client_billing_select" on public.client_billing
  for select to authenticated
  using (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

drop policy if exists "client_billing_insert" on public.client_billing;
create policy "client_billing_insert" on public.client_billing
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

drop policy if exists "client_billing_update" on public.client_billing;
create policy "client_billing_update" on public.client_billing
  for update to authenticated
  using (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id))
  with check (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

drop policy if exists "client_billing_delete" on public.client_billing;
create policy "client_billing_delete" on public.client_billing
  for delete to authenticated
  using (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

drop policy if exists "client_payments_select" on public.client_payments;
create policy "client_payments_select" on public.client_payments
  for select to authenticated
  using (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

drop policy if exists "client_payments_insert" on public.client_payments;
create policy "client_payments_insert" on public.client_payments
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

drop policy if exists "client_payments_update" on public.client_payments;
create policy "client_payments_update" on public.client_payments
  for update to authenticated
  using (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id))
  with check (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

drop policy if exists "client_payments_delete" on public.client_payments;
create policy "client_payments_delete" on public.client_payments
  for delete to authenticated
  using (coach_id = (select auth.uid()) and public.is_current_coach_of(athlete_id));

-- A row can't be moved to another coach or athlete (an upsert that names a new id keeps the old
-- one), and its clock is the server's: a client-sent created_at can't back-date it.
create or replace function public.client_billing_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.coach_id := old.coach_id;
    new.athlete_id := old.athlete_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
    new.id := coalesce(new.id, gen_random_uuid());
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_client_billing_guard on public.client_billing;
create trigger trg_client_billing_guard before insert or update on public.client_billing
  for each row execute function public.client_billing_guard();

create or replace function public.client_payments_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.coach_id := old.coach_id;
    new.athlete_id := old.athlete_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
    new.id := coalesce(new.id, gen_random_uuid());
  end if;
  return new;
end $$;
drop trigger if exists trg_client_payments_guard on public.client_payments;
create trigger trg_client_payments_guard before insert or update on public.client_payments
  for each row execute function public.client_payments_guard();

-- Signed-in users only, and only the four verbs (no TRUNCATE / REFERENCES / TRIGGER); RLS above
-- decides which rows.
revoke all on public.client_billing from anon, authenticated;
revoke all on public.client_payments from anon, authenticated;
grant select, insert, update, delete on public.client_billing to authenticated;
grant select, insert, update, delete on public.client_payments to authenticated;

commit;

-- Verify:
--   select count(*) from public.client_billing;
--   select count(*) from public.client_payments;
--   select tablename, policyname, cmd from pg_policies
--    where tablename in ('client_billing', 'client_payments') order by 1, 2;   -- 8 rows
--   select tgname from pg_trigger where tgname in ('trg_client_billing_guard', 'trg_client_payments_guard');
