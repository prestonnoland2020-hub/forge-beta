begin;

create or replace function public.save_my_daily_recommendation(row_payload jsonb)
returns jsonb
security invoker
language plpgsql
as $$
declare
  saved public.daily_recommendations%rowtype;
  incoming_status text := coalesce(nullif(row_payload ->> 'status',''),'active');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if incoming_status not in ('active','completed','superseded') then raise exception 'Invalid recommendation status'; end if;

  insert into public.daily_recommendations(
    owner_id,recommendation_date,split_id,split_day_id,split_position,status,
    algorithm_version,input_fingerprint,recommendation,selected_top_set_ids
  ) values(
    auth.uid(),(row_payload ->> 'recommendationDate')::date,
    nullif(row_payload ->> 'splitId','')::uuid,nullif(row_payload ->> 'splitDayId','')::uuid,
    nullif(row_payload ->> 'splitPosition','')::smallint,incoming_status,
    row_payload ->> 'algorithmVersion',row_payload ->> 'inputFingerprint',
    row_payload -> 'recommendation',
    coalesce(array(select jsonb_array_elements_text(coalesce(row_payload -> 'selectedTopSetIds','[]'::jsonb))),'{}')
  )
  on conflict(owner_id,recommendation_date) do update set
    split_id=case when public.daily_recommendations.status='completed' and excluded.status<>'completed' then public.daily_recommendations.split_id else excluded.split_id end,
    split_day_id=case when public.daily_recommendations.status='completed' and excluded.status<>'completed' then public.daily_recommendations.split_day_id else excluded.split_day_id end,
    split_position=case when public.daily_recommendations.status='completed' and excluded.status<>'completed' then public.daily_recommendations.split_position else excluded.split_position end,
    status=case when public.daily_recommendations.status='completed' and excluded.status<>'completed' then public.daily_recommendations.status else excluded.status end,
    algorithm_version=case when public.daily_recommendations.status='completed' and excluded.status<>'completed' then public.daily_recommendations.algorithm_version else excluded.algorithm_version end,
    input_fingerprint=case when public.daily_recommendations.status='completed' and excluded.status<>'completed' then public.daily_recommendations.input_fingerprint else excluded.input_fingerprint end,
    recommendation=case when public.daily_recommendations.status='completed' and excluded.status<>'completed' then public.daily_recommendations.recommendation else excluded.recommendation end,
    selected_top_set_ids=case when public.daily_recommendations.status='completed' and excluded.status<>'completed' then public.daily_recommendations.selected_top_set_ids else excluded.selected_top_set_ids end,
    updated_at=now()
  returning * into saved;

  return jsonb_build_object('id',saved.id,'status',saved.status,'recommendation',saved.recommendation);
end;
$$;

revoke all on function public.save_my_daily_recommendation(jsonb) from public;
grant execute on function public.save_my_daily_recommendation(jsonb) to authenticated;

commit;
