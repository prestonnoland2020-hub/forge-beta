begin;

create or replace function public.normalize_training_cycle_position()
returns trigger
security invoker
language plpgsql
as $$
declare
  normalized_position smallint;
begin
  if new.split_id is null then return new; end if;
  select min(position) into normalized_position
  from public.training_split_days
  where split_id = new.split_id
    and position >= new.next_position
    and (
      cardinality(muscle_groups) > 0
      or cardinality(goal_lifts) > 0
      or cardinality(cardio_types) > 0
    );
  if normalized_position is null then
    select min(position) into normalized_position
    from public.training_split_days
    where split_id = new.split_id
      and (
        cardinality(muscle_groups) > 0
        or cardinality(goal_lifts) > 0
        or cardinality(cardio_types) > 0
      );
  end if;
  if normalized_position is not null then new.next_position := normalized_position; end if;
  return new;
end;
$$;

drop trigger if exists normalize_training_cycle_position on public.training_cycle_state;
create trigger normalize_training_cycle_position
before insert or update of split_id, next_position on public.training_cycle_state
for each row execute function public.normalize_training_cycle_position();

commit;
