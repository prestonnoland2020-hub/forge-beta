begin;

-- Autosave updates the active split in place instead of creating an inactive
-- historical copy after every small editor change.
create or replace function public.replace_my_training_split(split_name text, split_days jsonb)
returns uuid
security invoker
language plpgsql as $$
declare
  active_split_id uuid;
  day_item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(split_name)) not between 1 and 80 then raise exception 'Invalid split name'; end if;

  select id into active_split_id
  from public.training_splits
  where owner_id = auth.uid() and is_active
  order by updated_at desc
  limit 1
  for update;

  if active_split_id is null then
    insert into public.training_splits(owner_id, name, is_active)
    values(auth.uid(), trim(split_name), true)
    returning id into active_split_id;
  else
    update public.training_splits
    set name = trim(split_name), updated_at = now()
    where id = active_split_id;
    delete from public.training_split_days where split_id = active_split_id;
  end if;

  for day_item in select * from jsonb_array_elements(coalesce(split_days, '[]'::jsonb))
  loop
    insert into public.training_split_days(
      split_id, position, name, muscle_groups, goal_lifts, cardio_types
    ) values (
      active_split_id,
      (day_item ->> 'position')::smallint,
      coalesce(day_item ->> 'name', ''),
      coalesce(array(select jsonb_array_elements_text(day_item -> 'muscleGroups')), '{}'),
      coalesce(array(select jsonb_array_elements_text(day_item -> 'goalLifts')), '{}'),
      coalesce(array(select jsonb_array_elements_text(day_item -> 'cardioTypes')), '{}')
    );
  end loop;

  return active_split_id;
end;
$$;

grant execute on function public.replace_my_training_split(text, jsonb) to authenticated;

commit;
