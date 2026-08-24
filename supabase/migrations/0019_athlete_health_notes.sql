-- Coach learnings: injuries, fatigue, and limitations the athlete reports,
-- with a buffer window recommendations and the AI coach train around.
create table if not exists public.athlete_health_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('injury','fatigue','other')),
  area text,
  note text not null,
  reported_at date not null default current_date,
  buffer_until date,
  status text not null default 'active' check (status in ('active','cleared')),
  follow_ups jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.athlete_health_notes enable row level security;

create policy "athlete_health_notes_select_own" on public.athlete_health_notes
  for select using (auth.uid() = owner_id);
create policy "athlete_health_notes_insert_own" on public.athlete_health_notes
  for insert with check (auth.uid() = owner_id);
create policy "athlete_health_notes_update_own" on public.athlete_health_notes
  for update using (auth.uid() = owner_id);
create policy "athlete_health_notes_delete_own" on public.athlete_health_notes
  for delete using (auth.uid() = owner_id);

create index if not exists athlete_health_notes_owner_idx on public.athlete_health_notes (owner_id, status);
