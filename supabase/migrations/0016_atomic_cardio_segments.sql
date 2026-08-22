begin;

-- A cardio session and its completed measurements must be committed with the
-- workout day. This removes the old second browser-side save path.
create or replace function public.cardio_clock_seconds(value text)
returns numeric
language plpgsql
immutable
as $$
declare
  parts text[];
begin
  if coalesce(trim(value),'') = '' then return 0; end if;
  parts := string_to_array(trim(value), ':');
  if cardinality(parts) = 3 then
    return coalesce(parts[1]::numeric,0)*3600 + coalesce(parts[2]::numeric,0)*60 + coalesce(parts[3]::numeric,0);
  elsif cardinality(parts) = 2 then
    return coalesce(parts[1]::numeric,0)*60 + coalesce(parts[2]::numeric,0);
  end if;
  return coalesce(parts[1]::numeric,0)*60;
exception when invalid_text_representation then
  return 0;
end;
$$;

create or replace function public.capture_cardio_session_segments()
returns trigger
security invoker
language plpgsql
as $$
declare
  draft jsonb := coalesce(new.prescription_snapshot,'{}'::jsonb);
  prescription jsonb;
  item jsonb;
  recovery jsonb;
  item_position smallint := 0;
  work_seconds numeric;
  work_distance numeric;
  work_unit text;
  recovery_seconds numeric;
begin
  prescription := case when jsonb_typeof(draft -> 'prescription') = 'object'
    then draft -> 'prescription' else draft end;

  if new.structure = 'intervals' and jsonb_typeof(draft -> 'intervalActuals') = 'array' then
    work_unit := coalesce(nullif(prescription ->> 'workUnit',''),nullif(prescription ->> 'distanceUnit',''),'miles');
    for item in select * from jsonb_array_elements(draft -> 'intervalActuals') loop
      if coalesce((item ->> 'completed')::boolean,true) then
        work_seconds := public.cardio_clock_seconds(item ->> 'time');
        work_distance := nullif(item ->> 'distance','')::numeric;
        insert into public.cardio_segments(
          session_id,position,segment_role,repeat_index,segment,cardio_type,unit,
          distance,time_minutes,pace_minutes,completion_state,entry_source
        ) values(
          new.id,item_position,'work',nullif(item ->> 'repeatIndex','')::smallint,
          'Work interval',new.activity,work_unit,work_distance,nullif(work_seconds,0)/60,
          case when work_seconds>0 and work_distance>0 then (work_seconds/60)/work_distance else null end,
          'completed',coalesce(nullif(item ->> 'source',''),'manual')
        );
        item_position := item_position+1;

        recovery := coalesce(item -> 'recovery','{}'::jsonb);
        recovery_seconds := public.cardio_clock_seconds(recovery ->> 'duration');
        if recovery_seconds>0 or coalesce(nullif(recovery ->> 'distance','')::numeric,0)>0 then
          insert into public.cardio_segments(
            session_id,position,segment_role,repeat_index,segment,cardio_type,unit,
            distance,time_minutes,rest_seconds,recovery_kind,completion_state,entry_source
          ) values(
            new.id,item_position,
            case when coalesce(recovery ->> 'kind','Passive rest')='Passive rest' then 'rest' else 'recovery' end,
            nullif(item ->> 'repeatIndex','')::smallint,coalesce(nullif(recovery ->> 'kind',''),'Recovery'),
            case when coalesce(recovery ->> 'kind','Passive rest')='Passive rest' then 'Rest' else coalesce(nullif(recovery ->> 'activity',''),recovery ->> 'kind','Recovery') end,
            case when coalesce(recovery ->> 'kind','Passive rest')='Passive rest' then 'seconds' else coalesce(nullif(prescription ->> 'recoveryUnit',''),work_unit) end,
            nullif(recovery ->> 'distance','')::numeric,
            case when coalesce(recovery ->> 'kind','Passive rest')='Passive rest' then null else nullif(recovery_seconds,0)/60 end,
            case when coalesce(recovery ->> 'kind','Passive rest')='Passive rest' then nullif(recovery_seconds,0)::integer else null end,
            coalesce(nullif(recovery ->> 'kind',''),'Passive rest'),'completed',coalesce(nullif(item ->> 'source',''),'manual')
          );
          item_position := item_position+1;
        end if;
      end if;
    end loop;
  elsif new.structure = 'circuit' and jsonb_typeof(draft -> 'circuitStations') = 'array' then
    for item in select * from jsonb_array_elements(draft -> 'circuitStations') loop
      insert into public.cardio_segments(
        session_id,position,segment_role,segment,cardio_type,unit,reps_or_calories,
        rounds,completion_state,entry_source
      ) values(
        new.id,item_position,'station',coalesce(nullif(item ->> 'name',''),'Station'),
        coalesce(nullif(item ->> 'name',''),'Station'),coalesce(nullif(item ->> 'unit',''),'reps'),
        nullif(item ->> 'value','')::numeric,nullif(prescription ->> 'rounds','')::smallint,
        'completed','manual'
      );
      item_position := item_position+1;
    end loop;
  elsif new.structure in ('steady','custom') then
    work_seconds := coalesce(nullif(prescription ->> 'duration','')::numeric,0)*60;
    work_distance := nullif(prescription ->> 'distance','')::numeric;
    work_unit := coalesce(nullif(prescription ->> 'distanceUnit',''),nullif(prescription ->> 'unit',''),'minutes');
    if work_seconds>0 or coalesce(work_distance,0)>0 then
      insert into public.cardio_segments(
        session_id,position,segment_role,segment,cardio_type,unit,distance,
        time_minutes,pace_minutes,completion_state,entry_source
      ) values(
        new.id,0,'work',coalesce(nullif(new.summary,''),new.activity),new.activity,work_unit,
        work_distance,nullif(work_seconds,0)/60,
        case when work_seconds>0 and work_distance>0 then (work_seconds/60)/work_distance else null end,
        'completed','manual'
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists capture_cardio_session_segments on public.cardio_sessions;
create trigger capture_cardio_session_segments
after insert on public.cardio_sessions
for each row execute function public.capture_cardio_session_segments();

commit;
