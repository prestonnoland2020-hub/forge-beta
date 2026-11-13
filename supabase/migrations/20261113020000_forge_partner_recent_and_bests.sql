-- A partner's last four weeks of top sets and runs, and their best set on the
-- lifts they train most. Both gated by forge_is_partner, like forge_partner_week.
create or replace function public.forge_partner_recent(partner_id uuid, p_today date default null)
returns table(performed_on date, kind text, name text, weight numeric, reps numeric, summary text)
language sql stable security definer set search_path to ''
as $$
  with allowed as (select public.forge_is_partner(partner_id) as ok),
  day as (select coalesce(p_today, current_date) as value)
  select t.performed_on, 'lift'::text, t.lift_name, t.weight, t.reps, null::text
  from public.top_sets t
  where (select ok from allowed) and t.owner_id = partner_id
    and t.performed_on between (select value from day) - 27 and (select value from day)
    and t.weight > 0 and t.reps > 0
  union all
  select c.performed_on, 'cardio'::text, coalesce(nullif(c.activity, ''), 'Cardio'), null, null, c.summary
  from public.cardio_sessions c
  where (select ok from allowed) and c.owner_id = partner_id
    and c.performed_on between (select value from day) - 27 and (select value from day)
  order by 1 desc, 2;
$$;
revoke all on function public.forge_partner_recent(uuid, date) from public, anon;
grant execute on function public.forge_partner_recent(uuid, date) to authenticated;

create or replace function public.forge_partner_bests(partner_id uuid)
returns table(lift text, weight numeric, reps numeric, performed_on date, estimate numeric)
language sql stable security definer set search_path to ''
as $$
  with allowed as (select public.forge_is_partner(partner_id) as ok),
  ranked as (
    select t.lift_name, t.weight, t.reps, t.performed_on,
      t.weight * (1 + t.reps / 30.0) as estimate,
      row_number() over (partition by lower(t.lift_name) order by t.weight * (1 + t.reps / 30.0) desc, t.performed_on desc) as rn,
      count(*) over (partition by lower(t.lift_name)) as sessions
    from public.top_sets t
    where (select ok from allowed) and t.owner_id = partner_id and t.weight > 0 and t.reps > 0
  )
  select lift_name, weight, reps, performed_on, round(estimate)
  from ranked where rn = 1
  order by sessions desc, estimate desc
  limit 6;
$$;
revoke all on function public.forge_partner_bests(uuid) from public, anon;
grant execute on function public.forge_partner_bests(uuid) to authenticated;
