/* THE DAY SAVE CARRIES THE PRESCRIPTION.

   top_sets now has prescribed_reps and prescribed_weight — what the plan asked
   for on the set that answered it — and this is the only writer, so nothing
   reaches those columns until it passes them through. Everything else about the
   function is unchanged; only the top_sets insert gains two values.

   Null stays null: a set logged with no plan behind it is free training, not a
   failed prescription, and the progression reads it as such. */
create or replace function public.save_my_training_day(day_payload jsonb)
returns uuid
security invoker
language plpgsql
as $function$
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
  next_split_position smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(day_payload ->> 'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'A valid date is required'; end if;

  -- A muscles-selected strength day IS completed training, even with no top
  -- set logged yet: the split day defines the session, top sets are optional.
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
  -- A split-day override sends split info without a recommendation id; it must
  -- still advance the cycle so tomorrow continues from the chosen day.
  should_advance := (recommendation_uuid is not null or payload_split_id is not null)
    and not prior_advanced and has_completed_training;

  insert into public.workout_days(
    owner_id,workout_date,title,muscle_groups,notes,body_weight,effort,
    source,source_record_id,recommendation_id,split_id,split_day_id,
    split_position,advanced_split
  ) values(
    auth.uid(),(day_payload ->> 'date')::date,
    coalesce(nullif(trim(day_payload ->> 'title'),''),'Training day'),
    coalesce(array(select jsonb_array_elements_text(coalesce(day_payload -> 'muscles','[]'::jsonb))),'{}'),
    coalesce(day_payload ->> 'notes',''),nullif(day_payload ->> 'bodyWeight','')::numeric,
    nullif(day_payload ->> 'effort',''),coalesce(nullif(day_payload ->> 'source',''),'app'),
    nullif(day_payload ->> 'sourceRecordId',''),recommendation_uuid,payload_split_id,
    payload_split_day_id,payload_split_position,
    has_completed_training and (prior_advanced or should_advance)
  )
  on conflict(owner_id,workout_date) do update set
    title=excluded.title,muscle_groups=excluded.muscle_groups,notes=excluded.notes,
    body_weight=excluded.body_weight,effort=excluded.effort,source=excluded.source,
    source_record_id=coalesce(excluded.source_record_id,public.workout_days.source_record_id),
    recommendation_id=coalesce(excluded.recommendation_id,public.workout_days.recommendation_id),
    split_id=coalesce(excluded.split_id,public.workout_days.split_id),
    split_day_id=coalesce(excluded.split_day_id,public.workout_days.split_day_id),
    split_position=coalesce(excluded.split_position,public.workout_days.split_position),
    advanced_split=excluded.advanced_split
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
