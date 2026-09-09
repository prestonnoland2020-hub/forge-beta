/* "APPLE ACCEPTED IT" IS NOT "IT ARRIVED".  Applied 2026-09-09.

   Every push in the log read sent/201 while the phone stayed dark. 201 means a
   push service took the message; it says nothing about whether a notification
   was ever drawn. Without that second fact there is no way to tell a broken
   sender from a dead install, and both read to the athlete as "I'm not getting
   notifications". That gap has cost more time than any actual bug in this
   feature.

   Three things: a place to record delivery, a function the service worker
   calls when it draws the notification, and the pair a Settings button needs
   to send a test and say what became of it. */

alter table private.push_log add column if not exists delivered_at timestamptz;
create index if not exists push_log_endpoint_at_idx on private.push_log (endpoint, at desc);

/* Called by the service worker with no session — a push arrives with the app
   closed. The endpoint is the only credential it has, and it is enough: a long
   unguessable URL that only that one install has ever held, the same proof
   forge_rotate_push_subscription accepts. This can do nothing but stamp a time
   on a row that already exists for that endpoint, so the worst a leaked
   endpoint buys is a false receipt on its own notification. */
create or replace function public.forge_push_delivered(p_endpoint text, p_tag text default null)
returns void
language plpgsql security definer set search_path to ''
as $function$
begin
  if p_endpoint is null or length(p_endpoint) < 40 then return; end if;
  update private.push_log
     set delivered_at = now()
   where id = (
     select id from private.push_log
      where endpoint = p_endpoint
        and delivered_at is null
        and at > now() - interval '2 days'
      order by at desc
      limit 1
   );
end;
$function$;

/* A TEST THE ATHLETE CAN RUN THEMSELVES. "I'm not getting notifications" has
   at least four causes that look identical from the outside — the switch is
   off in the database, the install is gone and the push service has not
   noticed, the permission was revoked in iOS settings, or the send genuinely
   failed — and until now the only way to tell them apart was someone with the
   SQL editor open. */
create or replace function public.forge_send_test_push()
returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  me uuid := auth.uid();
  subs integer;
  recent integer;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'not signed in'); end if;

  select count(*) into subs from public.push_subscriptions where owner_id = me;
  if subs = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no subscription');
  end if;

  /* Nobody needs more than a few of these a minute, and the button is one tap
     away from a loop. */
  select count(*) into recent from private.push_log
   where owner_id = me and kind = 'test' and at > now() - interval '1 minute';
  if recent >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too many');
  end if;

  perform private.forge_send_push(jsonb_build_object(
    'kind', 'test', 'owner_id', me,
    'title', 'Forge', 'body', 'Notifications are working.'));
  return jsonb_build_object('ok', true, 'subscriptions', subs);
end;
$function$;

/* What happened to the last thing Forge tried to send you. `delivered` is the
   only field that means a phone actually showed it. */
create or replace function public.forge_push_last()
returns table(at timestamptz, kind text, outcome text, status integer, delivered boolean, note text)
language sql stable security definer set search_path to ''
as $function$
  select l.at, l.kind, l.outcome, l.status, l.delivered_at is not null, l.note
  from private.push_log l
  where l.owner_id = auth.uid()
  order by l.at desc
  limit 1;
$function$;

revoke all on function public.forge_push_delivered(text, text) from public;
revoke all on function public.forge_send_test_push() from public;
revoke all on function public.forge_push_last() from public;
grant execute on function public.forge_push_delivered(text, text) to anon, authenticated;
grant execute on function public.forge_send_test_push() to authenticated;
grant execute on function public.forge_push_last() to authenticated;
