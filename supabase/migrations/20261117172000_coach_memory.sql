-- Per-athlete coach memory (approved by Preston 2026-11-17, row
-- coach-memory-2026-11). Durable training facts the athlete told the coach and
-- how their guided sets felt; the coach reads it before every answer. The
-- athlete can read, edit and delete every item in Settings, or wipe it all.
-- Additive only: two new tables, owner-only RLS, rows go with the account.
create table if not exists public.coach_memory (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  facts jsonb not null default '{}'::jsonb,
  summary text,
  updated_at timestamptz not null default now(),
  constraint coach_memory_facts_size check (pg_column_size(facts) < 16384),
  constraint coach_memory_summary_size check (summary is null or char_length(summary) <= 1000)
);

create table if not exists public.coach_memory_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  source text not null,
  note text,
  constraint coach_memory_events_note_size check (note is null or char_length(note) <= 600)
);

alter table public.coach_memory enable row level security;
alter table public.coach_memory_events enable row level security;

create policy "coach_memory owner select" on public.coach_memory for select to authenticated using ((select auth.uid()) = owner_id);
create policy "coach_memory owner insert" on public.coach_memory for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "coach_memory owner update" on public.coach_memory for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "coach_memory owner delete" on public.coach_memory for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "coach_memory_events owner select" on public.coach_memory_events for select to authenticated using ((select auth.uid()) = owner_id);
create policy "coach_memory_events owner insert" on public.coach_memory_events for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "coach_memory_events owner delete" on public.coach_memory_events for delete to authenticated using ((select auth.uid()) = owner_id);

create index if not exists coach_memory_events_owner_created_idx on public.coach_memory_events (owner_id, created_at desc);

revoke all on public.coach_memory from anon;
revoke all on public.coach_memory_events from anon;
