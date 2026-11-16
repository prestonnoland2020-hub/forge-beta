-- Coach replies are saved so the coach checker can verify answers against the
-- athlete's real data (approved by Preston 2026-11-16, row coach-reply-logging).
-- Additive only: a new table, owner-only RLS. Rows go when the account goes
-- (auth.users cascade, which delete_my_account() already triggers).
create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  scope text,
  question text,
  reply text,
  context jsonb
);

alter table public.coach_messages enable row level security;

create policy "coach_messages owner select" on public.coach_messages
  for select to authenticated using ((select auth.uid()) = owner_id);

create policy "coach_messages owner insert" on public.coach_messages
  for insert to authenticated with check ((select auth.uid()) = owner_id);

create index if not exists coach_messages_owner_created_idx
  on public.coach_messages (owner_id, created_at desc);

revoke all on public.coach_messages from anon;
