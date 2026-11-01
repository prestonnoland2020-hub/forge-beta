-- WHAT FORGE PREDICTED FOR A GOAL, AND WHAT HAPPENED.
--
-- The goal model's rates were set on 2026-11-01 from a backtest of five
-- athletes, fitted and scored on the same data. That is a start, not proof.
-- Every goal Forge can judge now writes down its prediction the first time it
-- can — where the athlete is, where a typical block and the ceiling put them
-- by the date, and the verdict shown — and on the goal date the app writes
-- what actually happened beside it. Over time this is the honest test: are
-- "Realistic" goals hit about half the time, is the ceiling almost never
-- beaten?
--
-- One row per athlete per goal. A goal has no id of its own, so it is keyed
-- by what defines it (type, exercise, target, date); editing any of those is a
-- new goal and a new prediction.
create table if not exists public.goal_predictions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_key text not null,
  goal_type text not null,
  exercise text,
  goal_date date not null,
  -- Seconds for a race (lower is better), the lift's max for a lift.
  better text not null check (better in ('higher', 'lower')),
  target numeric not null,
  start_value numeric not null,
  typical numeric not null,
  ceiling numeric not null,
  weeks numeric not null,
  verdict text not null,
  model_version text not null,
  predicted_at timestamptz not null default now(),
  -- Filled once the goal date has passed: Forge's same measure, taken from
  -- what was logged up to a week after the date.
  outcome_value numeric,
  reached boolean,
  scored_at timestamptz,
  unique (owner_id, goal_key)
);

alter table public.goal_predictions enable row level security;

create policy "goal_predictions_select_own" on public.goal_predictions
  for select using (auth.uid() = owner_id);
create policy "goal_predictions_insert_own" on public.goal_predictions
  for insert with check (auth.uid() = owner_id);
-- Only the outcome is ever written after the fact; the prediction itself is
-- not edited, so a model cannot quietly be scored against a revised guess.
-- USING is checked against the row before the update and WITH CHECK after,
-- so a scored row cannot be touched again while scoring it is allowed.
create policy "goal_predictions_update_own" on public.goal_predictions
  for update using (auth.uid() = owner_id and scored_at is null)
  with check (auth.uid() = owner_id);

create or replace function private.goal_predictions_freeze_prediction()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.goal_key, new.goal_type, new.exercise, new.goal_date, new.better, new.target, new.start_value, new.typical, new.ceiling, new.weeks, new.verdict, new.model_version, new.predicted_at, new.owner_id)
     is distinct from
     (old.goal_key, old.goal_type, old.exercise, old.goal_date, old.better, old.target, old.start_value, old.typical, old.ceiling, old.weeks, old.verdict, old.model_version, old.predicted_at, old.owner_id) then
    raise exception 'A goal prediction cannot be changed once made';
  end if;
  return new;
end $$;

create trigger goal_predictions_freeze
  before update on public.goal_predictions
  for each row execute function private.goal_predictions_freeze_prediction();

create index if not exists goal_predictions_unscored_idx
  on public.goal_predictions (owner_id, goal_date) where scored_at is null;
