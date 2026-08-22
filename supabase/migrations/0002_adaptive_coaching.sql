begin;

create type public.wearable_provider as enum ('apple_health','health_connect','garmin','fitbit','manual');
create type public.plan_status as enum ('draft','active','completed','superseded');

create table public.wearable_connections (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  provider public.wearable_provider not null, external_user_id text, encrypted_refresh_token text,
  scopes text[] not null default '{}', status text not null default 'active', last_synced_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,provider)
);

create table public.health_daily_snapshots (
  owner_id uuid not null references public.profiles(id) on delete cascade, snapshot_date date not null,
  provider public.wearable_provider not null, sleep_minutes integer, sleep_efficiency numeric(5,2), hrv_rmssd numeric(8,2),
  resting_hr numeric(6,2), respiratory_rate numeric(6,2), skin_temp_delta_c numeric(5,2), steps integer,
  active_calories numeric(9,2), acute_load numeric(9,2), source_updated_at timestamptz not null,
  raw_source_ids text[] not null default '{}', created_at timestamptz not null default now(),
  primary key(owner_id,snapshot_date,provider)
);

create table public.coaching_daily_state (
  owner_id uuid not null references public.profiles(id) on delete cascade, state_date date not null,
  readiness smallint not null, strength_fatigue text not null, confidence text not null,
  sleep_score smallint not null, autonomic_score smallint not null, load_score smallint not null,
  hard_training_allowed boolean not null, reasons jsonb not null default '[]', algorithm_version text not null,
  inputs_as_of timestamptz not null, created_at timestamptz not null default now(),
  primary key(owner_id,state_date), constraint readiness_range check(readiness between 0 and 100)
);

create table public.training_plan_versions (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  generated_at timestamptz not null default now(), starts_on date not null, ends_on date not null,
  status public.plan_status not null default 'draft', algorithm_version text not null,
  goal_ids uuid[] not null default '{}', input_snapshot jsonb not null, explanation jsonb not null default '{}'
);
create unique index one_active_generated_plan on public.training_plan_versions(owner_id) where status='active';

create table public.planned_sessions (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.training_plan_versions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade, planned_for date not null,
  split_day_id uuid references public.training_split_days(id) on delete set null, session_kind text not null,
  goal_id uuid references public.goals(id) on delete set null, title text not null, prescription jsonb not null,
  stress text not null, phase text not null, progression_gate jsonb not null default '{}', status text not null default 'planned',
  completed_workout_day_id uuid references public.workout_days(id) on delete set null, created_at timestamptz not null default now()
);
create index planned_sessions_owner_date on public.planned_sessions(owner_id,planned_for);

alter table public.wearable_connections enable row level security;alter table public.health_daily_snapshots enable row level security;
alter table public.coaching_daily_state enable row level security;alter table public.training_plan_versions enable row level security;alter table public.planned_sessions enable row level security;
create policy wearable_owner on public.wearable_connections using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy health_owner on public.health_daily_snapshots using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy coaching_owner_read on public.coaching_daily_state for select using(owner_id=auth.uid());
create policy plans_owner on public.training_plan_versions using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy sessions_owner on public.planned_sessions using(owner_id=auth.uid()) with check(owner_id=auth.uid());

commit;
