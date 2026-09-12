-- HOW THE ATHLETE FELT, ON A DAY.
--
-- Forge could already act on fatigue — cardioEngine cuts volume on poor
-- recovery, holds load when strength fatigue is high, repeats a week rather
-- than progressing it. All of it was wired to a smartwatch, and without one
-- the recovery state came back as readiness 100 every single day. This is the
-- input for everyone who does not wear one, which is most people.
--
-- One row per athlete per day: answering again the same day corrects the
-- answer rather than adding a second opinion.
create table if not exists public.athlete_check_ins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  check_in_date date not null default current_date,
  -- 1 fresh … 5 wrecked
  legs smallint not null check (legs between 1 and 5),
  -- 1 flat … 5 great
  energy smallint not null check (energy between 1 and 5),
  -- 1 slept badly … 5 slept well
  sleep smallint not null check (sleep between 1 and 5),
  note text,
  -- The workout this check-in followed, so the same session is never asked
  -- about twice.
  about_record_id text,
  -- What Forge asked, kept so the answer can be read back in context.
  prompt text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, check_in_date)
);

alter table public.athlete_check_ins enable row level security;

create policy "athlete_check_ins_select_own" on public.athlete_check_ins
  for select using (auth.uid() = owner_id);
create policy "athlete_check_ins_insert_own" on public.athlete_check_ins
  for insert with check (auth.uid() = owner_id);
create policy "athlete_check_ins_update_own" on public.athlete_check_ins
  for update using (auth.uid() = owner_id);
create policy "athlete_check_ins_delete_own" on public.athlete_check_ins
  for delete using (auth.uid() = owner_id);

create index if not exists athlete_check_ins_owner_date_idx
  on public.athlete_check_ins (owner_id, check_in_date desc);
