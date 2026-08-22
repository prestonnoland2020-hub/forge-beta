begin;

alter table public.top_sets
  alter column reps type numeric(5,2) using reps::numeric;

do $$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.import_legacy_training_data(uuid,jsonb,boolean)'::regprocedure)
    into function_definition;

  function_definition := replace(
    function_definition,
    '(set_item ->> ''reps''::text)::smallint',
    '(set_item ->> ''reps''::text)::numeric'
  );

  if function_definition like '%(set_item ->> ''reps''::text)::smallint%' then
    raise exception 'Legacy import function still casts reps to smallint';
  end if;

  execute function_definition;
end;
$$;

commit;
