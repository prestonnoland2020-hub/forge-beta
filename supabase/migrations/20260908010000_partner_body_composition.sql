/* THREE KINDS OF COMPARISON, NOT TWO.  Applied 2026-09-07.

   The partner screen offered one flat list of every measure either athlete had
   ever logged, which on a phone is a strip of pills running off the right edge
   with a lift half-visible at the end. Grouping them needs a third kind: the
   screen compared how strong and how fit the two of you are, and never what
   the training is doing to your bodies.

   Body weight is already logged per workout day. It is the one measure here
   with no good direction — up is not better and neither is down — so it is
   returned under its own kind and the client says so rather than colouring it
   green.

   Both functions keep their existing security-definer + empty search_path
   posture and their forge_is_partner gate, so a body weight is only ever
   visible to an athlete the owner has accepted as a partner. */

create or replace function public.forge_partner_metrics(partner_id uuid)
returns table(key text, label text, kind text, mine boolean, theirs boolean)
language sql stable security definer set search_path to ''
as $function$
  with me as (select auth.uid() as id),
  allowed as (select public.forge_is_partner(partner_id) as ok),
  lifts as (
    select public.forge_lift_key(t.lift_name) as lift_key,
           mode() within group (order by t.lift_name) as lift_label,
           bool_or(t.owner_id = (select id from me)) as is_mine,
           bool_or(t.owner_id = partner_id) as is_theirs
    from public.top_sets t, allowed a
    where a.ok and t.owner_id in ((select id from me), partner_id)
      and t.weight > 0 and t.reps > 0 and t.performed_on > current_date - 400
    group by 1
  ),
  runs as (
    select bool_or(c.owner_id = (select id from me)) as is_mine,
           bool_or(c.owner_id = partner_id) as is_theirs
    from public.cardio_sessions c, allowed a
    where a.ok and c.owner_id in ((select id from me), partner_id)
      and c.activity ilike '%run%' and c.performed_on > current_date - 400
  ),
  /* A single weigh-in is not a series. Two is the least that can draw a
     line, and it is what the chart itself asks for. */
  weights as (
    select bool_or(w.owner_id = (select id from me)) as is_mine,
           bool_or(w.owner_id = partner_id) as is_theirs
    from (
      select d.owner_id
      from public.workout_days d, allowed a
      where a.ok and d.owner_id in ((select id from me), partner_id)
        and d.body_weight is not null and d.body_weight > 0
        and d.workout_date > current_date - 400
      group by d.owner_id
      having count(distinct date_trunc('week', d.workout_date)) >= 2
    ) w
  ),
  everything as (
    select ('lift:' || l.lift_key)::text as key, l.lift_label::text as label,
           'strength'::text as kind, l.is_mine as mine, l.is_theirs as theirs
    from lifts l
    union all
    select 'run:miles'::text, 'Weekly miles'::text, 'endurance'::text, r.is_mine, r.is_theirs
    from runs r where r.is_mine or r.is_theirs
    union all
    select 'run:pace'::text, 'Best sustained pace'::text, 'endurance'::text, r.is_mine, r.is_theirs
    from runs r where r.is_mine or r.is_theirs
    union all
    select 'body:weight'::text, 'Body weight'::text, 'body'::text,
           coalesce(w.is_mine, false), coalesce(w.is_theirs, false)
    from weights w where w.is_mine or w.is_theirs
  )
  select e.key, e.label, e.kind, e.mine, e.theirs
  from everything e
  order by (e.mine and e.theirs) desc, e.kind, e.label;
$function$;

create or replace function public.forge_partner_series(
  partner_id uuid, metric text, weeks integer default 26, p_today date default null)
returns table(bucket date, mine numeric, theirs numeric)
language sql stable security definer set search_path to ''
as $function$
  with me as (select auth.uid() as id),
  allowed as (select public.forge_is_partner(partner_id) as ok),
  day as (select coalesce(p_today, current_date) as value),
  span as (select (date_trunc('week', (select value from day))
           - ((greatest(least(weeks, 104), 4) - 1) || ' weeks')::interval)::date as first_week),
  lift as (
    select date_trunc('week', t.performed_on)::date as bucket, t.owner_id,
      max(t.weight * (36.0 / (37 - least(greatest(round(t.reps), 1), 10)))) as value
    from public.top_sets t, allowed a, span s
    where a.ok and metric like 'lift:%'
      and public.forge_lift_key(t.lift_name) = substring(metric from 6)
      and t.owner_id in ((select id from me), partner_id)
      and t.weight > 0 and t.reps > 0 and t.performed_on >= s.first_week
    group by 1, 2
  ),
  run_rows as (
    select date_trunc('week', c.performed_on)::date as bucket, c.owner_id,
      public.forge_to_miles((i ->> 'distance')::numeric, i ->> 'unit') as miles,
      coalesce((i ->> 'time')::numeric, 0) as minutes
    from public.cardio_sessions c, allowed a, span s,
      lateral jsonb_array_elements(coalesce(c.prescription_snapshot -> 'prescription' -> 'legacyIntervals', '[]'::jsonb)) i
    where a.ok and metric like 'run:%'
      and c.owner_id in ((select id from me), partner_id)
      and c.activity ilike '%run%' and c.performed_on >= s.first_week
  ),
  /* Every continuous mile-or-more, with the pace it was covered at. */
  efforts as (
    select bucket, owner_id, miles, minutes / miles as pace
    from run_rows where miles >= 1 and minutes > 0
  ),
  /* Each athlete's own scale, from their own window. */
  scale as (select owner_id, min(pace) as best from efforts group by owner_id),
  run as (
    select r.bucket, r.owner_id,
      sum(r.miles) as miles,
      min(e.pace) as sustained_pace
    from run_rows r
    left join scale sc on sc.owner_id = r.owner_id
    left join efforts e
      on e.bucket = r.bucket and e.owner_id = r.owner_id
     and e.pace <= sc.best * 2
    group by r.bucket, r.owner_id
  ),
  /* A WEEK'S BODY WEIGHT IS ITS AVERAGE, NOT ITS PEAK. Everything else here
     asks for the best effort of the week; body weight has no best, and a
     single heavy morning is noise rather than a result. */
  body as (
    select date_trunc('week', d.workout_date)::date as bucket, d.owner_id,
      avg(d.body_weight) as value
    from public.workout_days d, allowed a, span s
    where a.ok and metric = 'body:weight'
      and d.owner_id in ((select id from me), partner_id)
      and d.body_weight is not null and d.body_weight > 0
      and d.workout_date >= s.first_week
    group by 1, 2
  ),
  points as (
    select bucket, owner_id, value from lift
    union all
    select bucket, owner_id,
      case when metric = 'run:miles' then round(miles, 2)
           when metric = 'run:pace' then round(sustained_pace, 2)
           else null end
    from run
    union all
    select bucket, owner_id, value from body
  )
  select p.bucket,
    round(max(p.value) filter (where p.owner_id = (select id from me)), 1),
    round(max(p.value) filter (where p.owner_id = partner_id), 1)
  from points p
  where p.value is not null
  group by p.bucket
  order by p.bucket;
$function$;
