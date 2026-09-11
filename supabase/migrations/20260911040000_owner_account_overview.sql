/* WHO IS ACTUALLY USING THIS.

   Eight accounts, three with a goal, five that have never logged a day — and no
   way to see that from inside the app. Every launch problem this month was
   visible in the database weeks before anyone looked, and invisible everywhere
   else: goals that never reached the table, push subscriptions that had gone
   stale, athletes sitting in setup. A founder cannot fix what they cannot see.

   Read-only, one row per account, restricted to the owner — and it returns
   nothing at all to anybody else rather than raising, so it cannot be used to
   probe for who is on the list. */
create or replace function public.forge_account_overview()
returns table(
  username text,
  display_name text,
  joined date,
  onboarded boolean,
  goals integer,
  days_logged integer,
  last_logged date,
  weekly_miles numeric,
  push_installs integer,
  push_last_delivered timestamptz
)
language sql stable security definer set search_path to ''
as $function$
  select
    p.username,
    p.display_name,
    p.created_at::date as joined,
    p.onboarding_completed as onboarded,
    (select count(*)::integer from public.goals g where g.owner_id = p.id) as goals,
    (select count(*)::integer from public.workout_days w where w.owner_id = p.id) as days_logged,
    (select max(w.workout_date) from public.workout_days w where w.owner_id = p.id) as last_logged,
    (select round(coalesce(sum(
        case when c.summary ~ '([0-9]+\.?[0-9]*)\s*(mi|mile)'
             then (regexp_match(c.summary, '([0-9]+\.?[0-9]*)\s*(mi|mile)'))[1]::numeric
             else 0 end), 0) / 4.0, 1)
      from public.cardio_sessions c
      where c.owner_id = p.id and c.performed_on > current_date - 28) as weekly_miles,
    (select count(*)::integer from public.push_subscriptions s where s.owner_id = p.id) as push_installs,
    (select max(l.delivered_at) from private.push_log l where l.owner_id = p.id) as push_last_delivered
  from public.profiles p
  where exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and lower(coalesce(me.username,'')) = 'prestonnoland'
  )
  order by p.created_at desc;
$function$;

revoke all on function public.forge_account_overview() from public;
grant execute on function public.forge_account_overview() to authenticated;
