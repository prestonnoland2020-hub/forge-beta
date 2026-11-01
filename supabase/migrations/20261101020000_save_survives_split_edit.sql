/* SAVING A DAY SURVIVES A SPLIT EDIT.

   save_my_training_day failed with workout_days_split_day_id_fkey whenever a
   day still pointed at a split day that had since been re-created (editing the
   split replaces its days), and the day could never sync. Stale or foreign
   split, split-day and recommendation ids are now dropped before the insert;
   everything else is unchanged from 20261101010000. */

CREATE OR REPLACE FUNCTION public.save_my_training_day(day_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
declare
  day_id uuid;
  set_item jsonb;
  cardio_item jsonb;
  set_position smallint := 0;
  prior_advanced boolean := false;
  has_completed_training boolean := false;
  should_advance boolean := false;
  recommendation_uuid uuid := nullif(day_payload ->> 'recommendationId', '')::uuid;
  payload_split_id uuid := nullif(day_payload ->> 'splitId', '')::uuid;
  payload_split_day_id uuid := nullif(day_payload ->> 'splitDayId', '')::uuid;
  payload_split_position smallint := nullif(day_payload ->> 'splitPosition', '')::smallint;
  payload_duration numeric := nullif(day_payload ->> 'durationMinutes', '')::numeric;
  next_split_position smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(day_payload ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A valid date is required'; end if;
  if payload_duration is not null and (payload_duration <= 0 or payload_duration >= 1440) then payload_duration := null; end if;

  /* A LINK TO SOMETHING THAT IS GONE DROPS THE LINK, NOT THE DAY. Editing a
     split re-creates its days with new ids; a training day still on the phone
     carries the old one, the foreign key refused it, and the day sat in the
     outbox failing every retry ("could not sync this training day"). The
     workout is the thing that must not be lost — the link to the split day is
     a convenience. An id that no longer exists, or belongs to someone else,
     is saved as no link. */
  if payload_split_day_id is not null and not exists (
    select 1 from public.training_split_days d join public.training_splits s on s.id = d.split_id
    where d.id = payload_split_day_id and s.owner_id = auth.uid()
  ) then payload_split_day_id := null; end if;
  if payload_split_id is not null and not exists (
    select 1 from public.training_splits s where s.id = payload_split_id and s.owner_id = auth.uid()
  ) then payload_split_id := null; end if;
  if recommendation_uuid is not null and not exists (
    select 1 from public.daily_recommendations r where r.id = recommendation_uuid and r.owner_id = auth.uid()
  ) then recommendation_uuid := null; end if;

  has_completed_training :=
    jsonb_array_length(coalesce(day_payload -> 'topSets', '[]'::jsonb)) > 0
    or jsonb_array_length(coalesce(day_payload -> 'cardioSessions', '[]'::jsonb)) > 0
    or exists (
      select 1 from jsonb_array_elements_text(coalesce(day_payload -> 'muscles', '[]'::jsonb)) muscle
      where muscle <> 'Cardio'
    );

  select advanced_split into prior_advanced
  from public.workout_days
  where owner_id=auth.uid() and workout_date=(day_payload ->> 'date')::date;
  prior_advanced := coalesce(prior_advanced,false);
  should_advance := (recommendation_uuid is not null or payload_split_id is not null)
    and not prior_advanced and has_completed_training;

  insert into public.workout_days(
    owner_id,workout_date,title,muscle_groups,notes,body_weight,effort,
    source,source_record_id,recommendation_id,split_id,split_day_id,
    split_position,advanced_split,duration_minutes
  ) values(
    auth.uid(),(day_payload ->> 'date')::date,
    coalesce(nullif(trim(day_payload ->> 'title'),''),'Training day'),
    coalesce(array(select jsonb_array_elements_text(coalesce(day_payload -> 'muscles','[]'::jsonb))),'{}'),
    coalesce(day_payload ->> 'notes',''),nullif(day_payload ->> 'bodyWeight','')::numeric,
    nullif(day_payload ->> 'effort',''),coalesce(nullif(day_payload ->> 'source',''),'app'),
    nullif(day_payload ->> 'sourceRecordId',''),recommendation_uuid,payload_split_id,
    payload_split_day_id,payload_split_position,
    has_completed_training and (prior_advanced or should_advance),
    payload_duration
  )
  on conflict(owner_id,workout_date) do update set
    title=excluded.title,muscle_groups=excluded.muscle_groups,notes=excluded.notes,
    body_weight=excluded.body_weight,effort=excluded.effort,source=excluded.source,
    source_record_id=coalesce(excluded.source_record_id,public.workout_days.source_record_id),
    recommendation_id=coalesce(excluded.recommendation_id,public.workout_days.recommendation_id),
    split_id=coalesce(excluded.split_id,public.workout_days.split_id),
    split_day_id=coalesce(excluded.split_day_id,public.workout_days.split_day_id),
    split_position=coalesce(excluded.split_position,public.workout_days.split_position),
    advanced_split=excluded.advanced_split,
    duration_minutes=coalesce(excluded.duration_minutes,public.workout_days.duration_minutes)
  returning id into day_id;

  delete from public.top_sets where workout_day_id=day_id and owner_id=auth.uid();
  delete from public.cardio_sessions where workout_day_id=day_id and owner_id=auth.uid();

  for set_item in select * from jsonb_array_elements(coalesce(day_payload -> 'topSets','[]'::jsonb)) loop
    set_position := set_position+1;
    insert into public.top_sets(
      owner_id,workout_day_id,performed_on,muscle_group,lift_name,weight,reps,
      calculated_max,position,client_key,recommendation_top_set_id,
      prescribed_reps,prescribed_weight
    ) values(
      auth.uid(),day_id,(day_payload ->> 'date')::date,
      coalesce(nullif(set_item ->> 'muscle',''),'Primary'),trim(set_item ->> 'lift'),
      (set_item ->> 'weight')::numeric,(set_item ->> 'reps')::smallint,
      nullif(set_item ->> 'calculatedMax','')::numeric,set_position,
      nullif(set_item ->> 'id',''),nullif(set_item ->> 'recommendationTopSetId',''),
      nullif(set_item ->> 'prescribedReps','')::smallint,
      nullif(set_item ->> 'prescribedWeight','')::numeric
    );
  end loop;

  for cardio_item in select * from jsonb_array_elements(coalesce(day_payload -> 'cardioSessions','[]'::jsonb)) loop
    insert into public.cardio_sessions(
      owner_id,workout_day_id,performed_on,structure,activity,summary,notes,
      prescription_snapshot,completed_at,captured_timezone,client_key
    ) values(
      auth.uid(),day_id,(day_payload ->> 'date')::date,
      coalesce(cardio_item ->> 'structure','custom'),coalesce(nullif(cardio_item ->> 'activity',''),'Cardio'),
      coalesce(cardio_item ->> 'summary',''),'',cardio_item,now(),
      nullif(day_payload ->> 'timezone',''),nullif(cardio_item ->> 'id','')
    );
  end loop;

  if recommendation_uuid is not null then
    update public.daily_recommendations set
      status=case when has_completed_training then 'completed' else 'active' end,
      completed_workout_day_id=case when has_completed_training then day_id else null end,
      selected_top_set_ids=case when has_completed_training then
        coalesce(array(select jsonb_array_elements_text(coalesce(day_payload -> 'selectedRecommendationTopSetIds','[]'::jsonb))),'{}')
        else '{}' end,
      updated_at=now()
    where id=recommendation_uuid and owner_id=auth.uid();
  end if;

  if should_advance and payload_split_id is not null and payload_split_position is not null then
    select min(position) into next_split_position from public.training_split_days
    where split_id=payload_split_id and position>payload_split_position;
    if next_split_position is null then
      select min(position) into next_split_position from public.training_split_days
      where split_id=payload_split_id;
    end if;
    if next_split_position is not null then
      insert into public.training_cycle_state(
        owner_id,split_id,next_position,last_completed_workout_day_id,last_completed_at,revision
      ) values(auth.uid(),payload_split_id,next_split_position,day_id,now(),1)
      on conflict(owner_id) do update set
        split_id=excluded.split_id,next_position=excluded.next_position,
        last_completed_workout_day_id=excluded.last_completed_workout_day_id,
        last_completed_at=excluded.last_completed_at,
        revision=public.training_cycle_state.revision+1,updated_at=now();
    end if;
  elsif prior_advanced and not has_completed_training then
    perform public.rebuild_my_training_cycle(payload_split_id);
  end if;

  return day_id;
end;
$function$;
