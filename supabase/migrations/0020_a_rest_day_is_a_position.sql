begin;

/* A REST DAY IS A POSITION IN THE SPLIT.

   0014 normalised the cycle cursor off any day with no muscles, no goal
   lifts and no cardio types. That description is not "an unconfigured day"
   — it is exactly what a REST day looks like, so the cursor could never
   come to rest on one. Completing position 7 of an eight-day split set the
   cursor to 8 (Rest) and this trigger silently rewrote it to 1, which is
   why a scheduled rest day never appeared and the athlete was handed the
   next training day instead.

   Normalisation still has a real job: a cursor can point at a position
   that no longer exists after a split is edited. So the rule narrows to
   exactly that — land on a position that EXISTS, wrapping to the first
   day when the cursor runs off the end. What that day contains, including
   nothing at all, is the athlete's business. */
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
  where split_id = new.split_id and position >= new.next_position;
  if normalized_position is null then
    select min(position) into normalized_position
    from public.training_split_days
    where split_id = new.split_id;
  end if;
  if normalized_position is not null then new.next_position := normalized_position; end if;
  return new;
end;
$$;

commit;
