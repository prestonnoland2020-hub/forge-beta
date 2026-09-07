/* THE NIGHT PUSH ACTUALLY STARTED WORKING.

   Everything below was applied to the live project on 2026-09-07 and is
   recorded here so the repository and the database agree. The order matters:
   the log has to exist before the sender can write to it.

   What was wrong, in the order it was found:

   1. private.forge_send_push called extensions.net_http_post(url, headers,
      body, timeout). pg_net exposes net.http_post(url, body, params, headers,
      timeout) — wrong schema, wrong name, wrong argument order. Every hourly
      cron run since the feature shipped had failed with "function does not
      exist", which is why not one notification had ever left the database.

   2. Worse: forge_notify_partners is an AFTER INSERT trigger on workout_days,
      and a raising trigger rolls back the statement that fired it. The next
      athlete to finish a session would have watched the save fail because of
      a notification they never asked for. It had not bitten yet only because
      the most recent workout predated the trigger.

   3. The settings toggles were decorative. "Morning workout" and "A partner
      trained" were saved to localStorage and read by nothing; the sender
      pushed both kinds to every subscription regardless.

   4. Nothing anywhere recorded whether a push was attempted, so every
      question about a missing notification was a matter of opinion.
*/
begin;

/* ---- 1. what the sender needs, in one row --------------------------- */
alter table private.push_config
  add column if not exists vapid_public  text,
  add column if not exists vapid_private text,
  add column if not exists vapid_subject text;

/* The public half is public by definition — the browser must have it to mint
   a subscription at all. Serving it from here rather than baking it into the
   bundle makes rotating the pair an UPDATE instead of a rebuild, and lets a
   fresh clone subscribe with no build-time secret. The private half is NOT
   seeded here: it stays an edge-function environment secret. */
create or replace function public.forge_push_public_key()
returns text language sql stable security definer set search_path = '' as $$
  select vapid_public from private.push_config where id;
$$;
revoke all on function public.forge_push_public_key() from public;
grant execute on function public.forge_push_public_key() to anon, authenticated;

/* ---- 2. the log ------------------------------------------------------ */
create table if not exists private.push_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  kind        text not null,
  owner_id    uuid,
  endpoint    text,
  local_date  date,
  status      integer,
  outcome     text,
  note        text
);
create index if not exists push_log_at_idx on private.push_log (at desc);
create index if not exists push_log_dedupe_idx
  on private.push_log (owner_id, kind, local_date) where outcome = 'sent';

create or replace function private.forge_prune_push_log()
returns void language sql security definer set search_path = '' as $$
  delete from private.push_log where at < now() - interval '30 days';
$$;

/* ---- 3. the dispatch, corrected and made harmless ------------------- */
create or replace function private.forge_send_push(p_body jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_config private.push_config%rowtype;
begin
  select * into v_config from private.push_config where id;
  if v_config.function_url is null then return; end if;
  perform net.http_post(
    url := v_config.function_url,
    body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-forge-push', v_config.push_secret),
    timeout_milliseconds := 8000
  );
exception when others then
  /* A notification is a courtesy and must never cost someone their training
     log. The push is lost; the transaction is not. */
  insert into private.push_log (kind, note) values (coalesce(p_body ->> 'kind', 'unknown'), 'dispatch failed: ' || sqlerrm);
end; $$;

/* ---- 4. how the edge function reaches a schema PostgREST won't serve -- */
create or replace function public.forge_push_settings()
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('push_secret', push_secret, 'vapid_public', vapid_public,
                            'vapid_private', vapid_private, 'vapid_subject', vapid_subject)
  from private.push_config where id;
$$;
revoke all on function public.forge_push_settings() from public, anon, authenticated;
grant execute on function public.forge_push_settings() to service_role;

create or replace function public.forge_push_record(p_rows jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into private.push_log (kind, owner_id, endpoint, local_date, status, outcome, note)
  select row_value ->> 'kind', nullif(row_value ->> 'owner_id', '')::uuid, row_value ->> 'endpoint',
         nullif(row_value ->> 'local_date', '')::date, nullif(row_value ->> 'status', '')::integer,
         row_value ->> 'outcome', row_value ->> 'note'
  from jsonb_array_elements(p_rows) as row_value;
$$;
revoke all on function public.forge_push_record(jsonb) from public, anon, authenticated;
grant execute on function public.forge_push_record(jsonb) to service_role;

create or replace function public.forge_push_already_sent(p_owner uuid, p_kind text, p_date date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.push_log
                 where owner_id = p_owner and kind = p_kind and local_date = p_date and outcome = 'sent');
$$;
revoke all on function public.forge_push_already_sent(uuid, text, date) from public, anon, authenticated;
grant execute on function public.forge_push_already_sent(uuid, text, date) to service_role;

/* ---- 5. the toggles the server now obeys ---------------------------- */
alter table public.push_subscriptions
  add column if not exists wants_morning boolean not null default true,
  add column if not exists wants_partner boolean not null default true;

/* The four-argument form is dropped rather than left beside the new one:
   leaving both makes the call ambiguous the moment the client sends the
   preferences, and "function is not unique" arrives at runtime with the
   subscription silently unsaved. */
drop function if exists public.forge_save_push_subscription(text, text, text, text);

create or replace function public.forge_save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_timezone text,
  p_wants_morning boolean default true, p_wants_partner boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Authentication required'; end if;
  insert into public.push_subscriptions (endpoint, owner_id, p256dh, auth, timezone, wants_morning, wants_partner)
  values (p_endpoint, v_me, p_p256dh, p_auth, coalesce(nullif(p_timezone, ''), 'UTC'),
          coalesce(p_wants_morning, true), coalesce(p_wants_partner, true))
  on conflict (endpoint) do update
    set owner_id = excluded.owner_id, p256dh = excluded.p256dh, auth = excluded.auth,
        timezone = excluded.timezone, wants_morning = excluded.wants_morning,
        wants_partner = excluded.wants_partner, last_seen_at = now();
end; $$;
revoke all on function public.forge_save_push_subscription(text, text, text, text, boolean, boolean) from public, anon;
grant execute on function public.forge_save_push_subscription(text, text, text, text, boolean, boolean) to authenticated;

/* ---- 6. keeping a subscription alive when nobody is signed in -------- */

/* A push service may retire an endpoint and issue a replacement at any time;
   it announces this by firing `pushsubscriptionchange` at the service worker,
   which has no session — it runs with the app closed, which is the point. If
   nothing answers, the server keeps posting to an address that no longer
   exists and the athlete simply stops being notified, with nothing to see.

   The old endpoint is the credential: a long unguessable URL that only the
   push service and that one install have ever held. Presenting it is proof
   enough to rename the row it belongs to, and nothing else is possible with
   it — this only ever moves an existing subscription to a new address, never
   creates one, never reassigns it, and never reveals who owns it. */
create or replace function public.forge_rotate_push_subscription(
  p_old_endpoint text, p_new_endpoint text, p_p256dh text, p_auth text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if coalesce(length(p_old_endpoint), 0) < 32 or coalesce(length(p_new_endpoint), 0) < 32
     or coalesce(length(p_p256dh), 0) < 16 or coalesce(length(p_auth), 0) < 8 then
    return false;
  end if;
  select owner_id into v_owner from public.push_subscriptions where endpoint = p_old_endpoint;
  if v_owner is null then return false; end if;
  /* The replacement may already be on file if a launch-time sync got there
     first; that is a success, not a conflict. */
  delete from public.push_subscriptions where endpoint = p_new_endpoint and owner_id = v_owner;
  update public.push_subscriptions
     set endpoint = p_new_endpoint, p256dh = p_p256dh, auth = p_auth
   where endpoint = p_old_endpoint;
  insert into private.push_log (kind, owner_id, endpoint, outcome, note)
  values ('rotate', v_owner, p_new_endpoint, 'sent', 'endpoint rotated by the service worker');
  return true;
end; $$;
revoke all on function public.forge_rotate_push_subscription(text, text, text, text) from public;
grant execute on function public.forge_rotate_push_subscription(text, text, text, text) to anon, authenticated;

commit;

/* Seeded separately, by hand, on the live project:

     update private.push_config
        set vapid_public  = '<the public half — already in the client bundle>',
            vapid_subject = 'mailto:prestonnoland2020@gmail.com'
      where id;

   VAPID_PRIVATE_KEY is set as an edge-function environment secret and
   deliberately appears nowhere in this repository or this database. */
