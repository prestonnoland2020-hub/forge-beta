begin;

alter table public.workout_days
  add column if not exists title text not null default 'Training day',
  add column if not exists effort text,
  add column if not exists source text not null default 'app',
  add column if not exists source_record_id text;

alter table public.top_sets
  add column if not exists muscle_group text not null default 'Primary',
  add column if not exists calculated_max numeric(8,2),
  add column if not exists position smallint not null default 1,
  add column if not exists client_key text;

alter table public.cardio_sessions
  add column if not exists activity text not null default 'Cardio',
  add column if not exists summary text not null default '',
  add column if not exists client_key text;

drop index if exists public.top_sets_exact_duplicate_guard;
create index if not exists workout_days_owner_date_desc on public.workout_days(owner_id, workout_date desc);
create index if not exists top_sets_workout_position on public.top_sets(workout_day_id, position);
create index if not exists cardio_sessions_workout_created on public.cardio_sessions(workout_day_id, created_at);

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
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(day_payload ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A valid date is required'; end if;

  insert into public.workout_days(owner_id, workout_date, title, muscle_groups, notes, body_weight, effort, source, source_record_id)
  values(
    auth.uid(), (day_payload ->> 'date')::date, coalesce(nullif(trim(day_payload ->> 'title'), ''), 'Training day'),
    coalesce(array(select jsonb_array_elements_text(coalesce(day_payload -> 'muscles', '[]'::jsonb))), '{}'),
    coalesce(day_payload ->> 'notes', ''), nullif(day_payload ->> 'bodyWeight', '')::numeric,
    nullif(day_payload ->> 'effort', ''), coalesce(nullif(day_payload ->> 'source', ''), 'app'), nullif(day_payload ->> 'sourceRecordId', '')
  )
  on conflict(owner_id, workout_date) do update set
    title=excluded.title, muscle_groups=excluded.muscle_groups, notes=excluded.notes, body_weight=excluded.body_weight,
    effort=excluded.effort, source=excluded.source, source_record_id=coalesce(excluded.source_record_id, public.workout_days.source_record_id)
  returning id into day_id;

  delete from public.top_sets where workout_day_id=day_id and owner_id=auth.uid();
  delete from public.cardio_sessions where workout_day_id=day_id and owner_id=auth.uid();

  for set_item in select * from jsonb_array_elements(coalesce(day_payload -> 'topSets', '[]'::jsonb)) loop
    set_position := set_position + 1;
    insert into public.top_sets(owner_id, workout_day_id, performed_on, muscle_group, lift_name, weight, reps, calculated_max, position, client_key)
    values(auth.uid(), day_id, (day_payload ->> 'date')::date, coalesce(nullif(set_item ->> 'muscle', ''), 'Primary'),
      trim(set_item ->> 'lift'), (set_item ->> 'weight')::numeric, (set_item ->> 'reps')::smallint,
      nullif(set_item ->> 'calculatedMax', '')::numeric, set_position, nullif(set_item ->> 'id', ''));
  end loop;

  for cardio_item in select * from jsonb_array_elements(coalesce(day_payload -> 'cardioSessions', '[]'::jsonb)) loop
    insert into public.cardio_sessions(owner_id, workout_day_id, performed_on, structure, activity, summary, notes, prescription_snapshot, completed_at, captured_timezone, client_key)
    values(auth.uid(), day_id, (day_payload ->> 'date')::date, coalesce(cardio_item ->> 'structure', 'custom'),
      coalesce(nullif(cardio_item ->> 'activity', ''), 'Cardio'), coalesce(cardio_item ->> 'summary', ''), '',
      cardio_item, now(), nullif(day_payload ->> 'timezone', ''), nullif(cardio_item ->> 'id', ''));
  end loop;

  return day_id;
end;
$$;

revoke all on function public.save_my_training_day(jsonb) from public;
grant execute on function public.save_my_training_day(jsonb) to authenticated;

commit;
