create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.activity_connections (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  provider text not null default 'strava' check (provider = 'strava'),
  external_user_id text,
  athlete_name text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  oauth_state text,
  redirect_uri text,
  status text not null default 'pending',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_activities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  external_id text not null,
  activity_type text not null,
  activity_name text not null,
  started_at timestamptz not null,
  distance_meters numeric(12,2),
  moving_seconds integer,
  elapsed_seconds integer,
  average_heartrate numeric(7,2),
  max_heartrate numeric(7,2),
  raw_summary jsonb not null default '{}',
  imported_to_workout boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider, external_id)
);

alter table public.external_activities enable row level security;
create policy external_activities_owner_read on public.external_activities for select using (owner_id = auth.uid());
create policy external_activities_owner_delete on public.external_activities for delete using (owner_id = auth.uid());
create index if not exists external_activities_owner_started on public.external_activities(owner_id, started_at desc);
