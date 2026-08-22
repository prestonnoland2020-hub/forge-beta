begin;

create table if not exists public.training_cycle_state (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  split_id uuid references public.training_splits(id) on delete cascade,
  next_position smallint not null default 1,
  last_completed_workout_day_id uuid references public.workout_days(id) on delete set null,
  last_completed_at timestamptz,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint training_cycle_position_positive check (next_position > 0)
);

create table if not exists public.daily_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  recommendation_date date not null,
  split_id uuid references public.training_splits(id) on delete set null,
  split_day_id uuid references public.training_split_days(id) on delete set null,
  split_position smallint,
  status text not null default 'active',
  algorithm_version text not null,
  input_fingerprint text not null,
  recommendation jsonb not null,
  selected_top_set_ids text[] not null default '{}',
  completed_workout_day_id uuid references public.workout_days(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, recommendation_date),
  constraint daily_recommendation_status check (status in ('active','completed','superseded'))
);

alter table public.workout_days
  add column if not exists recommendation_id uuid references public.daily_recommendations(id) on delete set null,
  add column if not exists split_id uuid references public.training_splits(id) on delete set null,
  add column if not exists split_day_id uuid references public.training_split_days(id) on delete set null,
  add column if not exists split_position smallint,
  add column if not exists advanced_split boolean not null default false;

create index if not exists daily_recommendations_owner_date
  on public.daily_recommendations(owner_id, recommendation_date desc);
create index if not exists workout_days_recommendation
  on public.workout_days(owner_id, recommendation_id);

alter table public.training_cycle_state enable row level security;
alter table public.daily_recommendations enable row level security;

drop policy if exists training_cycle_state_owner_all on public.training_cycle_state;
create policy training_cycle_state_owner_all on public.training_cycle_state for all
using(owner_id = auth.uid()) with check(owner_id = auth.uid());

drop policy if exists daily_recommendations_owner_all on public.daily_recommendations;
create policy daily_recommendations_owner_all on public.daily_recommendations for all
using(owner_id = auth.uid()) with check(owner_id = auth.uid());

create trigger training_cycle_state_updated_at before update on public.training_cycle_state
for each row execute function public.set_updated_at();
create trigger daily_recommendations_updated_at before update on public.daily_recommendations
for each row execute function public.set_updated_at();

create or replace function public.save_my_training_day(day_payload jsonb)
returns uuid
security invoker
language plpgsql
as $$
declare
  day_id uuid;
  set_item jsonb;
  cardio_item jsonb;
  set_position smallint := 0;
  prior_advanced boolean := false;
  should_advance boolean := false;
  recommendation_uuid uuid := nullif(day_payload ->> 'recommendationId', '')::uuid;
  payload_split_id uuid := nullif(day_payload ->> 'splitId', '')::uuid;
  payload_split_day_id uuid := nullif(day_payload ->> 'splitDayId', '')::uuid;
  payload_split_position smallint := nullif(day_payload ->> 'splitPosition', '')::smallint;
  next_split_position smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(day_payload ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A valid date is required'; end if;

  select advanced_split into prior_advanced
  from public.workout_days
  where owner_id = auth.uid() and workout_date = (day_payload ->> 'date')::date;
  prior_advanced := coalesce(prior_advanced, false);
  should_advance := recommendation_uuid is not null
    and not prior_advanced
    and (
      jsonb_array_length(coalesce(day_payload -> 'topSets', '[]'::jsonb)) > 0
      or jsonb_array_length(coalesce(day_payload -> 'cardioSessions', '[]'::jsonb)) > 0
    );

  insert into public.workout_days(
    owner_id, workout_date, title, muscle_groups, notes, body_weight, effort,
    source, source_record_id, recommendation_id, split_id, split_day_id,
    split_position, advanced_split
  ) values(
    auth.uid(), (day_payload ->> 'date')::date,
    coalesce(nullif(trim(day_payload ->> 'title'), ''), 'Training day'),
    coalesce(array(select jsonb_array_elements_text(coalesce(day_payload -> 'muscles', '[]'::jsonb))), '{}'),
    coalesce(day_payload ->> 'notes', ''), nullif(day_payload ->> 'bodyWeight', '')::numeric,
    nullif(day_payload ->> 'effort', ''), coalesce(nullif(day_payload ->> 'source', ''), 'app'),
    nullif(day_payload ->> 'sourceRecordId', ''), recommendation_uuid, payload_split_id,
    payload_split_day_id, payload_split_position, prior_advanced or should_advance
  )
  on conflict(owner_id, workout_date) do update set
    title=excluded.title, muscle_groups=excluded.muscle_groups, notes=excluded.notes,
    body_weight=excluded.body_weight, effort=excluded.effort, source=excluded.source,
    source_record_id=coalesce(excluded.source_record_id, public.workout_days.source_record_id),
    recommendation_id=coalesce(excluded.recommendation_id, public.workout_days.recommendation_id),
    split_id=coalesce(excluded.split_id, public.workout_days.split_id),
    split_day_id=coalesce(excluded.split_day_id, public.workout_days.split_day_id),
    split_position=coalesce(excluded.split_position, public.workout_days.split_position),
    advanced_split=public.workout_days.advanced_split or excluded.advanced_split
  returning id into day_id;

  delete from public.top_sets where workout_day_id=day_id and owner_id=auth.uid();
  delete from public.cardio_sessions where workout_day_id=day_id and owner_id=auth.uid();

  for set_item in select * from jsonb_array_elements(coalesce(day_payload -> 'topSets', '[]'::jsonb)) loop
    set_position := set_position + 1;
    insert into public.top_sets(owner_id, workout_day_id, performed_on, muscle_group, lift_name, weight, reps, calculated_max, position, client_key)
    values(auth.uid(), day_id, (day_payload ->> 'date')::date,
      coalesce(nullif(set_item ->> 'muscle', ''), 'Primary'), trim(set_item ->> 'lift'),
      (set_item ->> 'weight')::numeric, (set_item ->> 'reps')::smallint,
      nullif(set_item ->> 'calculatedMax', '')::numeric, set_position, nullif(set_item ->> 'id', ''));
  end loop;

  for cardio_item in select * from jsonb_array_elements(coalesce(day_payload -> 'cardioSessions', '[]'::jsonb)) loop
    insert into public.cardio_sessions(owner_id, workout_day_id, performed_on, structure, activity, summary, notes, prescription_snapshot, completed_at, captured_timezone, client_key)
    values(auth.uid(), day_id, (day_payload ->> 'date')::date,
      coalesce(cardio_item ->> 'structure', 'custom'), coalesce(nullif(cardio_item ->> 'activity', ''), 'Cardio'),
      coalesce(cardio_item ->> 'summary', ''), '', cardio_item, now(),
      nullif(day_payload ->> 'timezone', ''), nullif(cardio_item ->> 'id', ''));
  end loop;

  if recommendation_uuid is not null then
    update public.daily_recommendations
    set status = 'completed', completed_workout_day_id = day_id,
      selected_top_set_ids = coalesce(array(select jsonb_array_elements_text(coalesce(day_payload -> 'selectedRecommendationTopSetIds', '[]'::jsonb))), '{}'),
      updated_at = now()
    where id = recommendation_uuid and owner_id = auth.uid();
  end if;

  if should_advance and payload_split_id is not null and payload_split_position is not null then
    select min(position) into next_split_position
    from public.training_split_days
    where split_id = payload_split_id and position > payload_split_position;
    if next_split_position is null then
      select min(position) into next_split_position
      from public.training_split_days where split_id = payload_split_id;
    end if;
    if next_split_position is not null then
      insert into public.training_cycle_state(owner_id, split_id, next_position, last_completed_workout_day_id, last_completed_at, revision)
      values(auth.uid(), payload_split_id, next_split_position, day_id, now(), 1)
      on conflict(owner_id) do update set
        split_id=excluded.split_id, next_position=excluded.next_position,
        last_completed_workout_day_id=excluded.last_completed_workout_day_id,
        last_completed_at=excluded.last_completed_at,
        revision=public.training_cycle_state.revision+1, updated_at=now();
    end if;
  end if;

  return day_id;
end;
$$;

revoke all on function public.save_my_training_day(jsonb) from public;
grant execute on function public.save_my_training_day(jsonb) to authenticated;

commit;
