-- Partner growth charts read 12 weeks, not 4. Additive: a new function with
-- the same partner check and columns as forge_partner_recent.
create or replace function public.forge_partner_history(partner_id uuid, p_today date default null, p_days integer default 84)
returns table(performed_on date, kind text, name text, weight numeric, reps numeric, summary text)
language sql stable security definer set search_path to ''
as $function$
  with allowed as (select public.forge_is_partner(partner_id) as ok),
  day as (select coalesce(p_today, current_date) as value, least(greatest(coalesce(p_days, 84), 7), 182) as span)
  select t.performed_on, 'lift'::text, t.lift_name, t.weight, t.reps, null::text
  from public.top_sets t
  where (select ok from allowed) and t.owner_id = partner_id
    and t.performed_on between (select value from day) - (select span from day) + 1 and (select value from day)
    and t.weight > 0 and t.reps > 0
  union all
  select c.performed_on, 'cardio'::text, coalesce(nullif(c.activity, ''), 'Cardio'), null, null, c.summary
  from public.cardio_sessions c
  where (select ok from allowed) and c.owner_id = partner_id
    and c.performed_on between (select value from day) - (select span from day) + 1 and (select value from day)
  order by 1 desc, 2;
$function$;
revoke all on function public.forge_partner_history(uuid, date, integer) from public, anon;
grant execute on function public.forge_partner_history(uuid, date, integer) to authenticated;
