/* A PUSH WHEN THE WATCH SYNCS.

   Garmin delivers an activity to garmin-webhook seconds after the watch syncs,
   but nothing told the athlete it had landed — they opened Forge to find out
   whether the session was there. This sends one notification per delivery
   naming what arrived and, for a lift, the day's top set it was matched to.

   It fires from the database, on the rows that were actually INSERTED: the
   webhook upserts, and an AFTER INSERT statement trigger's transition table
   holds only the new rows, so Garmin resending a summary (it retries, and a
   manual edit on Garmin Connect arrives as a second delivery) updates the
   row without buzzing the phone again. Only fresh Garmin pushes count — not
   the export upload ('garmin-export') and not anything older than two days,
   so a backlog arriving at once is not a pile of notifications.

   The dispatch is private.forge_send_push, the same path the partner
   notification takes; forge-push composes the words from stored data. */

alter table public.push_subscriptions
  add column if not exists wants_sync boolean not null default true;

/* The switch travels like the other two: null leaves the stored choice. */
drop function if exists public.forge_save_push_subscription(text, text, text, text, boolean, boolean);
create or replace function public.forge_save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_timezone text,
  p_wants_morning boolean default null, p_wants_partner boolean default null, p_wants_sync boolean default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Authentication required'; end if;
  insert into public.push_subscriptions (endpoint, owner_id, p256dh, auth, timezone, wants_morning, wants_partner, wants_sync)
  values (p_endpoint, v_me, p_p256dh, p_auth, coalesce(nullif(p_timezone, ''), 'UTC'),
          coalesce(p_wants_morning, true), coalesce(p_wants_partner, true), coalesce(p_wants_sync, true))
  on conflict (endpoint) do update
    set owner_id = excluded.owner_id, p256dh = excluded.p256dh, auth = excluded.auth,
        timezone = excluded.timezone,
        wants_morning = coalesce(p_wants_morning, public.push_subscriptions.wants_morning),
        wants_partner = coalesce(p_wants_partner, public.push_subscriptions.wants_partner),
        wants_sync = coalesce(p_wants_sync, public.push_subscriptions.wants_sync),
        last_seen_at = now();
end; $function$;
revoke all on function public.forge_save_push_subscription(text, text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.forge_save_push_subscription(text, text, text, text, boolean, boolean, boolean) to authenticated;

create or replace function private.external_activities_notify_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_row record;
begin
  for v_row in
    select owner_id, array_agg(external_id order by started_at) as ids
    from fresh
    where provider = 'garmin' and started_at > now() - interval '2 days'
    group by owner_id
  loop
    perform private.forge_send_push(jsonb_build_object('kind', 'sync', 'owner_id', v_row.owner_id, 'external_ids', to_jsonb(v_row.ids)));
  end loop;
  return null;
exception when others then
  /* A notification is never the reason an activity fails to save. */
  return null;
end; $function$;

drop trigger if exists external_activities_notify_sync on public.external_activities;
create trigger external_activities_notify_sync
  after insert on public.external_activities
  referencing new table as fresh
  for each statement execute function private.external_activities_notify_sync();
