begin;

create table if not exists public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  kind text not null default 'Strength',
  muscle_groups text[] not null default '{}',
  detail text not null default 'Imported from legacy Google Sheets',
  enabled boolean not null default true,
  source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercise_name_required check (char_length(trim(name)) between 1 and 120),
  constraint exercise_kind_valid check (kind in ('Strength','Cardio')),
  unique(owner_id, name)
);

alter table public.exercise_library enable row level security;
drop policy if exists exercise_library_owner_all on public.exercise_library;
create policy exercise_library_owner_all on public.exercise_library for all
using (owner_id=auth.uid()) with check (owner_id=auth.uid());

create or replace function public.import_legacy_library_data(target_owner uuid, payload jsonb, perform_commit boolean default false)
returns jsonb security definer set search_path='' language plpgsql as $$
declare item jsonb; exercise_count integer:=0; goal_count integer:=0;
begin
  if not perform_commit then
    return jsonb_build_object('dryRun',true,'exercises',jsonb_array_length(coalesce(payload->'exercises','[]'::jsonb)),'goals',jsonb_array_length(coalesce(payload->'goals','[]'::jsonb)));
  end if;
  for item in select * from jsonb_array_elements(coalesce(payload->'exercises','[]'::jsonb)) loop
    insert into public.exercise_library(owner_id,name,kind,muscle_groups,enabled,source_id)
    values(target_owner,trim(item->>'name'),coalesce(nullif(item->>'kind',''),'Strength'),coalesce(array(select jsonb_array_elements_text(item->'muscles')),'{}'),coalesce((item->>'enabled')::boolean,true),nullif(item->>'sourceId',''))
    on conflict(owner_id,name) do update set muscle_groups=excluded.muscle_groups,enabled=excluded.enabled,source_id=excluded.source_id,updated_at=now();
    exercise_count:=exercise_count+1;
  end loop;
  for item in select * from jsonb_array_elements(coalesce(payload->'goals','[]'::jsonb)) loop
    insert into public.goals(owner_id,type,name,target_value,muscle_group,target_date,min_weekly_mileage,peak_weekly_mileage)
    values(target_owner,case when item->>'type'='race' then 'race'::public.goal_type else 'lift'::public.goal_type end,trim(item->>'name'),(item->>'value')::numeric,nullif(item->>'muscleGroup',''),nullif(item->>'targetDate','')::date,nullif(item->>'minWeeklyMileage','')::numeric,nullif(item->>'peakWeeklyMileage','')::numeric)
    on conflict(owner_id,type,(lower(trim(name)))) do update set target_value=excluded.target_value,muscle_group=excluded.muscle_group,target_date=excluded.target_date,min_weekly_mileage=excluded.min_weekly_mileage,peak_weekly_mileage=excluded.peak_weekly_mileage,updated_at=now();
    goal_count:=goal_count+1;
  end loop;
  return jsonb_build_object('dryRun',false,'exercises',exercise_count,'goals',goal_count);
end;
$$;

revoke all on function public.import_legacy_library_data(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.import_legacy_library_data(uuid,jsonb,boolean) to service_role;
commit;
