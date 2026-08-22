begin;

create or replace function public.import_legacy_training_data(target_owner uuid, payload jsonb, perform_commit boolean default false)
returns jsonb
security definer set search_path=''
language plpgsql
as $$
declare
  run_id uuid;
  day_item jsonb;
  set_item jsonb;
  cardio_item jsonb;
  day_id uuid;
  imported_days integer := 0;
  imported_sets integer := 0;
  imported_cardio integer := 0;
  duplicate_days integer := 0;
  warnings jsonb := '[]'::jsonb;
  source_count_payload jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  if not exists(select 1 from public.profiles where id=target_owner) then raise exception 'Target profile does not exist'; end if;
  if coalesce(payload->>'version','') <> 'forge-legacy-export-v1' then raise exception 'Unsupported export version'; end if;
  source_count_payload := jsonb_build_object('days',jsonb_array_length(coalesce(payload->'days','[]'::jsonb)),'topSets',jsonb_array_length(coalesce(payload->'topSets','[]'::jsonb)),'cardioSessions',jsonb_array_length(coalesce(payload->'cardioSessions','[]'::jsonb)));
  insert into public.data_import_runs(owner_id,source,source_person,source_version,dry_run,status,source_counts)
  values(target_owner,'google_sheets',coalesce(payload->>'person','unknown'),payload->>'version',not perform_commit,case when perform_commit then 'validating' else 'ready' end,source_count_payload)
  returning id into run_id;
  if not perform_commit then
    update public.data_import_runs set completed_at=now(),imported_counts=source_count_payload where id=run_id;
    return jsonb_build_object('runId',run_id,'dryRun',true,'source',source_count_payload,'wouldImport',source_count_payload,'warnings',warnings);
  end if;
  for day_item in select * from jsonb_array_elements(coalesce(payload->'days','[]'::jsonb)) loop
    if coalesce(day_item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then warnings:=warnings||jsonb_build_array('Skipped day with invalid date: '||coalesce(day_item->>'sourceRow','unknown'));continue;end if;
    if exists(select 1 from public.workout_days where owner_id=target_owner and workout_date=(day_item->>'date')::date) then duplicate_days:=duplicate_days+1;end if;
    insert into public.workout_days(owner_id,workout_date,title,muscle_groups,notes,body_weight,source,source_record_id)
    values(target_owner,(day_item->>'date')::date,coalesce(nullif(day_item->>'title',''),'Imported training day'),coalesce(array(select jsonb_array_elements_text(coalesce(day_item->'muscles','[]'::jsonb))),'{}'),coalesce(day_item->>'notes',''),nullif(day_item->>'bodyWeight','')::numeric,'google_sheets',day_item->>'sourceRow')
    on conflict(owner_id,workout_date) do update set muscle_groups=case when cardinality(excluded.muscle_groups)>0 then excluded.muscle_groups else public.workout_days.muscle_groups end,notes=case when excluded.notes<>'' then excluded.notes else public.workout_days.notes end,body_weight=coalesce(excluded.body_weight,public.workout_days.body_weight),source_record_id=coalesce(excluded.source_record_id,public.workout_days.source_record_id)
    returning id into day_id;imported_days:=imported_days+1;
  end loop;
  for set_item in select * from jsonb_array_elements(coalesce(payload->'topSets','[]'::jsonb)) loop
    select id into day_id from public.workout_days where owner_id=target_owner and workout_date=(set_item->>'date')::date;
    if day_id is null then insert into public.workout_days(owner_id,workout_date,title,source,source_record_id) values(target_owner,(set_item->>'date')::date,'Imported top sets','google_sheets','pr:'||(set_item->>'sourceRow')) returning id into day_id;end if;
    if not exists(select 1 from public.top_sets where owner_id=target_owner and client_key='legacy-pr:'||(set_item->>'sourceRow')) then
      insert into public.top_sets(owner_id,workout_day_id,performed_on,muscle_group,lift_name,weight,reps,calculated_max,position,client_key)
      values(target_owner,day_id,(set_item->>'date')::date,coalesce(nullif(set_item->>'muscle',''),'Primary'),trim(set_item->>'lift'),(set_item->>'weight')::numeric,(set_item->>'reps')::numeric,nullif(set_item->>'calculatedMax','')::numeric,coalesce((set_item->>'position')::smallint,1),'legacy-pr:'||(set_item->>'sourceRow'));imported_sets:=imported_sets+1;
    end if;
  end loop;
  for cardio_item in select * from jsonb_array_elements(coalesce(payload->'cardioSessions','[]'::jsonb)) loop
    select id into day_id from public.workout_days where owner_id=target_owner and workout_date=(cardio_item->>'date')::date;
    if day_id is null then insert into public.workout_days(owner_id,workout_date,title,muscle_groups,source,source_record_id) values(target_owner,(cardio_item->>'date')::date,'Imported cardio',array['Cardio'],'google_sheets','cardio:'||(cardio_item->>'sourceId')) returning id into day_id;end if;
    if not exists(select 1 from public.cardio_sessions where owner_id=target_owner and client_key='legacy-cardio:'||(cardio_item->>'sourceId')) then
      insert into public.cardio_sessions(owner_id,workout_day_id,performed_on,structure,activity,summary,notes,prescription_snapshot,completed_at,client_key)
      values(target_owner,day_id,(cardio_item->>'date')::date,coalesce(cardio_item->>'structure','custom'),coalesce(nullif(cardio_item->>'activity',''),'Cardio'),coalesce(cardio_item->>'summary',''),coalesce(cardio_item->>'notes',''),cardio_item->'draft',now(),'legacy-cardio:'||(cardio_item->>'sourceId'));imported_cardio:=imported_cardio+1;
    end if;
  end loop;
  update public.data_import_runs set status='completed',completed_at=now(),warnings=warnings,imported_counts=jsonb_build_object('days',imported_days,'topSets',imported_sets,'cardioSessions',imported_cardio,'existingDaysMerged',duplicate_days) where id=run_id;
  return jsonb_build_object('runId',run_id,'dryRun',false,'source',source_count_payload,'imported',jsonb_build_object('days',imported_days,'topSets',imported_sets,'cardioSessions',imported_cardio,'existingDaysMerged',duplicate_days),'warnings',warnings);
exception when others then
  if run_id is not null then update public.data_import_runs set status='failed',completed_at=now(),warnings=jsonb_build_array(sqlerrm) where id=run_id;end if;
  raise;
end;
$$;

revoke all on function public.import_legacy_training_data(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.import_legacy_training_data(uuid,jsonb,boolean) to service_role;

commit;
