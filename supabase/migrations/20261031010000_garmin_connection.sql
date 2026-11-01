/* GARMIN, DIRECT. Garmin's Health API pushes data to Forge rather than being
   polled, so the connection row has two jobs the Strava one does not: it holds
   the PKCE verifier between authorize and callback, and it maps Garmin's
   userId — the only identity a push carries — back to a Forge account.

   Same rule as Strava: tokens live in `private`, which the API does not
   expose, and every read and write goes through a SECURITY DEFINER wrapper
   that only the service role may execute. */

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.garmin_connections (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  garmin_user_id text unique,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  oauth_state text,
  code_verifier text,
  redirect_uri text,
  status text not null default 'pending',
  last_synced_at timestamptz,
  last_push_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.garmin_connection_begin(p_owner uuid, p_state text, p_verifier text, p_redirect text)
returns void language sql security definer set search_path to '' as $$
  insert into private.garmin_connections (owner_id, oauth_state, code_verifier, redirect_uri, status, updated_at)
  values (p_owner, p_state, p_verifier, p_redirect, 'pending', now())
  on conflict (owner_id) do update
    set oauth_state = excluded.oauth_state,
        code_verifier = excluded.code_verifier,
        redirect_uri = excluded.redirect_uri,
        /* Reconnecting an active account must not knock it offline before
           the new tokens arrive. */
        status = case when private.garmin_connections.status = 'active' then 'active' else 'pending' end,
        updated_at = now();
$$;

create or replace function public.garmin_connection_get(p_owner uuid)
returns jsonb language sql security definer set search_path to '' as $$
  select to_jsonb(c) from private.garmin_connections c where c.owner_id = p_owner;
$$;

/* A Garmin account can belong to one Forge account. Connecting it somewhere
   new releases it from the old one, so pushes are never split between two. */
create or replace function public.garmin_connection_complete(p_owner uuid, p_garmin_user text, p_access text, p_refresh text, p_expires timestamptz, p_refresh_expires timestamptz)
returns void language plpgsql security definer set search_path to '' as $$
begin
  delete from private.garmin_connections where garmin_user_id = p_garmin_user and owner_id <> p_owner;
  update private.garmin_connections
     set garmin_user_id = p_garmin_user, access_token = p_access, refresh_token = p_refresh,
         expires_at = p_expires, refresh_expires_at = p_refresh_expires,
         oauth_state = null, code_verifier = null, status = 'active', updated_at = now()
   where owner_id = p_owner;
end;
$$;

create or replace function public.garmin_connection_refresh(p_owner uuid, p_access text, p_refresh text, p_expires timestamptz, p_refresh_expires timestamptz)
returns void language sql security definer set search_path to '' as $$
  update private.garmin_connections
     set access_token = p_access, refresh_token = p_refresh, expires_at = p_expires,
         refresh_expires_at = coalesce(p_refresh_expires, refresh_expires_at), updated_at = now()
   where owner_id = p_owner;
$$;

create or replace function public.garmin_connection_synced(p_owner uuid, p_synced timestamptz)
returns void language sql security definer set search_path to '' as $$
  update private.garmin_connections set last_synced_at = p_synced, updated_at = p_synced where owner_id = p_owner;
$$;

create or replace function public.garmin_connection_delete(p_owner uuid)
returns void language sql security definer set search_path to '' as $$
  delete from private.garmin_connections where owner_id = p_owner;
$$;

/* The push side: Garmin's userId → the Forge connection, tokens included so a
   ping's callback URL can be fetched. Stamps last_push_at as it reads. */
create or replace function public.garmin_connection_for_user(p_garmin_user text)
returns jsonb language sql security definer set search_path to '' as $$
  update private.garmin_connections c set last_push_at = now()
   where c.garmin_user_id = p_garmin_user and c.status = 'active'
  returning to_jsonb(c);
$$;

/* Garmin tells Forge when an athlete disconnects from Garmin Connect's side. */
create or replace function public.garmin_connection_deregister(p_garmin_user text)
returns void language sql security definer set search_path to '' as $$
  delete from private.garmin_connections where garmin_user_id = p_garmin_user;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'garmin_connection_begin(uuid,text,text,text)',
    'garmin_connection_get(uuid)',
    'garmin_connection_complete(uuid,text,text,text,timestamptz,timestamptz)',
    'garmin_connection_refresh(uuid,text,text,timestamptz,timestamptz)',
    'garmin_connection_synced(uuid,timestamptz)',
    'garmin_connection_delete(uuid)',
    'garmin_connection_for_user(text)',
    'garmin_connection_deregister(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
