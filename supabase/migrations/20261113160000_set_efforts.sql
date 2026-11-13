-- How each top set felt (Easy / Good / Grinder), per lifter, day and lift.
create table if not exists public.set_efforts (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  performed_on date not null,
  lift_key text not null,
  effort text not null check (effort in ('easy','good','hard')),
  updated_at timestamptz not null default now(),
  primary key (owner_id, performed_on, lift_key)
);
alter table public.set_efforts enable row level security;
create policy "set_efforts own select" on public.set_efforts for select to authenticated using (owner_id = (select auth.uid()));
create policy "set_efforts own insert" on public.set_efforts for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "set_efforts own update" on public.set_efforts for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "set_efforts own delete" on public.set_efforts for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.set_efforts to authenticated;
