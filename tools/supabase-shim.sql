/* Enough of Supabase to let the migration history run against a stock
   Postgres, so a migration can be proven to APPLY before it is pushed at a
   live database. This is a test fixture, never deployed: Supabase provides all
   of it for real.

   What Supabase gives that plain Postgres does not: the `auth` schema with a
   users table, the `auth.uid()` / `auth.role()` helpers every RLS policy is
   written against, and the anon / authenticated / service_role roles that
   grants and revokes name. */

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

/* Supabase reads these from the request JWT. Here they read from a session
   setting so a test can say "now I am this user" and watch RLS respond. */
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;

/* Supabase grants table privileges to anon and authenticated by default and
   relies on RLS — not on GRANT — to decide who sees which rows. Mirroring that
   matters: without it a test would get "permission denied" where production
   gets an empty result, and an RLS hole would look like a pass. */
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

grant select on auth.users to service_role;
