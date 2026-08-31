begin;

/* BRINGING THE REPO BACK IN LINE WITH THE DATABASE.

   Three tables the app reads and writes on every screen — athlete_settings,
   training_plans, training_plan_history — exist in production but in no
   migration file. They were created through the Supabase dashboard and never
   written back to version control, so the repository has been describing a
   different database from the one running.

   That is not a security hole: production has correct per-owner RLS on all
   three (verified 31 Aug 2026 against pg_policies). It is a reproducibility
   hole, and a serious one — a fresh `supabase db reset`, a staging project, or
   anybody cloning this repo builds a schema the app cannot run on, and the
   next migration to reference these tables fails on everything except the one
   database that happens to be right.

   Everything here is `if not exists` and mirrors production exactly, so this
   is a no-op against the live database and the missing half of the schema
   everywhere else. */

create table if not exists public.athlete_settings (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  setup jsonb,
  plan jsonb,
  appearance jsonb,
  updated_at timestamptz not null default now(),
  goals jsonb
);

create table if not exists public.training_plans (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  payload jsonb not null,
  horizon_weeks smallint not null default 12,
  generated_at timestamptz not null default now(),
  revision integer not null default 1
);

create table if not exists public.training_plan_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  generated_at timestamptz not null default now()
);

create index if not exists training_plan_history_owner_generated
  on public.training_plan_history(owner_id, generated_at desc);

alter table public.athlete_settings enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_plan_history enable row level security;

/* Policy names and expressions copied from production rather than invented, so
   applying this changes nothing there. */
drop policy if exists athlete_settings_select_own on public.athlete_settings;
create policy athlete_settings_select_own on public.athlete_settings
  for select using (auth.uid() = owner_id);
drop policy if exists athlete_settings_insert_own on public.athlete_settings;
create policy athlete_settings_insert_own on public.athlete_settings
  for insert with check (auth.uid() = owner_id);
drop policy if exists athlete_settings_update_own on public.athlete_settings;
create policy athlete_settings_update_own on public.athlete_settings
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists training_plans_select_own on public.training_plans;
create policy training_plans_select_own on public.training_plans
  for select using (auth.uid() = owner_id);
drop policy if exists training_plans_insert_own on public.training_plans;
create policy training_plans_insert_own on public.training_plans
  for insert with check (auth.uid() = owner_id);
drop policy if exists training_plans_update_own on public.training_plans;
create policy training_plans_update_own on public.training_plans
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists training_plans_delete_own on public.training_plans;
create policy training_plans_delete_own on public.training_plans
  for delete using (auth.uid() = owner_id);

/* History is append-only from the athlete's side: they may write and read
   their own versions, but not rewrite what a past program said. */
drop policy if exists plan_history_select_own on public.training_plan_history;
create policy plan_history_select_own on public.training_plan_history
  for select using (auth.uid() = owner_id);
drop policy if exists plan_history_insert_own on public.training_plan_history;
create policy plan_history_insert_own on public.training_plan_history
  for insert with check (auth.uid() = owner_id);

/* Same drift, smaller: production gained an owner-scoped UPDATE policy on
   external_activities in 20260826012831 so the client can mark a synced
   activity as imported. The repo's 0018 never got it, so on any database built
   from this repository the write matched zero rows, returned no error, and
   Strava re-offered settled activities forever. Recorded here with
   production's own policy name. */
drop policy if exists external_activities_owner_mark_imported on public.external_activities;
create policy external_activities_owner_mark_imported on public.external_activities
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

commit;
