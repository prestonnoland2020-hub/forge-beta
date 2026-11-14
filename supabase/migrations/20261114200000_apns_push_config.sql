/* NATIVE PUSH FOR THE IPHONE APP: where forge-push finds Apple's key.

   Same pattern as the VAPID pair: private.push_config holds it (env vars win
   when set), forge_push_settings hands it to the function, and nothing a
   client can call ever reads it. The .p8 key, its key id and the team id
   come from the Apple Developer account (Certificates, IDs & Profiles →
   Keys → Apple Push Notifications service). */
alter table private.push_config
  add column if not exists apns_key_p8 text,
  add column if not exists apns_key_id text,
  add column if not exists apns_team_id text,
  add column if not exists apns_topic text default 'com.forgetraining.forge';

create or replace function public.forge_push_settings()
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'push_secret',   push_secret,
    'vapid_public',  vapid_public,
    'vapid_private', vapid_private,
    'vapid_subject', vapid_subject,
    'apns_key_p8',   apns_key_p8,
    'apns_key_id',   apns_key_id,
    'apns_team_id',  apns_team_id,
    'apns_topic',    apns_topic
  ) from private.push_config where id;
$function$;
