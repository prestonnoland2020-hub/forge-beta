/* WHEN DID A NOTIFICATION LAST REACH THIS PHONE.

   Delivery receipts existed and nothing surfaced them, so an athlete whose
   subscription had gone stale simply stopped getting notifications. Preston's
   went quiet for three weeks and the only way to find out was to read the log
   table by hand. forge_push_last answers "what happened to the last thing Forge
   tried to send" — an attempt, not an arrival, and only the most recent one.

   This answers the question the athlete actually asks, per install: is this
   phone registered, and when did something last actually show up on it. */
create or replace function public.forge_push_health()
returns table(
  endpoint_tail text,
  registered_at timestamptz,
  last_attempt_at timestamptz,
  last_attempt_outcome text,
  last_delivered_at timestamptz
)
language sql stable security definer set search_path to ''
as $function$
  select
    right(s.endpoint, 12) as endpoint_tail,
    s.created_at as registered_at,
    (select l.at from private.push_log l
      where l.endpoint = s.endpoint order by l.at desc limit 1) as last_attempt_at,
    (select l.outcome from private.push_log l
      where l.endpoint = s.endpoint order by l.at desc limit 1) as last_attempt_outcome,
    (select l.delivered_at from private.push_log l
      where l.endpoint = s.endpoint and l.delivered_at is not null
      order by l.delivered_at desc limit 1) as last_delivered_at
  from public.push_subscriptions s
  where s.owner_id = auth.uid()
  order by s.created_at desc;
$function$;

revoke all on function public.forge_push_health() from public;
grant execute on function public.forge_push_health() to authenticated;
