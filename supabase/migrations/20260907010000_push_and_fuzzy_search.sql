begin;

/* Applied to the live project on 2026-09-07 via apply_migration; recorded here
   so a fresh database rebuilds identically. Three things:
   push subscriptions and their schedule, an athlete search that tolerates a
   missed letter, and the `discoverable` flag that governs it. */

-- ── Where a push goes ──────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  p256dh text not null, auth text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_owner_idx on public.push_subscriptions (owner_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create or replace function public.forge_save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_timezone text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'Authentication required'; end if;
  insert into public.push_subscriptions (endpoint, owner_id, p256dh, auth, timezone)
  values (p_endpoint, v_me, p_p256dh, p_auth, coalesce(nullif(p_timezone, ''), 'UTC'))
  on conflict (endpoint) do update
    set owner_id = excluded.owner_id, p256dh = excluded.p256dh, auth = excluded.auth,
        timezone = excluded.timezone, last_seen_at = now();
end; $$;
revoke all on function public.forge_save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.forge_save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.forge_delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and owner_id = auth.uid();
$$;
revoke all on function public.forge_delete_push_subscription(text) from public, anon;
grant execute on function public.forge_delete_push_subscription(text) to authenticated;

-- ── When it goes out ───────────────────────────────────────────────────────
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
create schema if not exists private;
create table if not exists private.push_config (
  id boolean primary key default true check (id),
  function_url text not null, push_secret text not null
);
revoke all on table private.push_config from public, anon, authenticated;

create or replace function private.forge_send_push(p_body jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_config private.push_config%rowtype;
begin
  select * into v_config from private.push_config where id;
  if v_config.function_url is null then return; end if;
  perform extensions.net_http_post(
    url := v_config.function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-forge-push', v_config.push_secret),
    body := p_body, timeout_milliseconds := 8000);
end; $$;

create or replace function public.forge_notify_partners()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.forge_send_push(jsonb_build_object('kind', 'partner', 'owner_id', new.owner_id));
  return new;
end; $$;
drop trigger if exists forge_partners_notified on public.workout_days;
create trigger forge_partners_notified after insert on public.workout_days
  for each row execute function public.forge_notify_partners();

select cron.unschedule('forge-morning-push') where exists (select 1 from cron.job where jobname = 'forge-morning-push');
select cron.schedule('forge-morning-push', '0 * * * *', $cron$ select private.forge_send_push('{"kind":"morning"}'::jsonb) $cron$);

-- ── Finding someone you already know ───────────────────────────────────────
create extension if not exists pg_trgm with schema extensions;
create index if not exists profiles_username_trgm on public.profiles using gin ((username::text) extensions.gin_trgm_ops);
create index if not exists profiles_display_name_trgm on public.profiles using gin (display_name extensions.gin_trgm_ops);

/* Every profile carries profile_visibility = 'private' — the column's default,
   which nothing has ever set and no screen has offered — so gating search on
   it means a search that matches nobody, forever, for a reason no athlete
   chose. A separate flag, with a switch beside it on the partner screen. */
alter table public.profiles add column if not exists discoverable boolean not null default true;
comment on column public.profiles.discoverable is
  'Whether this athlete can be found by name in partner search. An exact username always works — that is the handle they hand out.';

/* word_similarity, not similarity: plain trigram compares against the WHOLE
   string, so a five-letter typo against "coltoneilers" scores 0.25 — under any
   threshold that does not also admit strangers. word_similarity asks how well
   the query matches the best-matching PART. Measured on the real athletes:
   coltn, adm, presotn, wels and gomz all score 0.5-0.667 on the right person
   and 0 on nearly everyone else. */
create or replace function public.forge_search_athletes(query text)
returns table (id uuid, username text, display_name text, relation text)
language sql security definer set search_path = '' as $$
  with me as (select auth.uid() as id),
  needle as (select lower(btrim(query)) as value),
  links as (
    select case when f.requester_id = m.id then f.addressee_id else f.requester_id end as other,
           f.status::text as status, (f.requester_id = m.id) as outgoing
    from public.friendships f cross join me m
    where m.id in (f.requester_id, f.addressee_id) and f.status in ('accepted', 'pending')
  ),
  scored as (
    select p.id, p.username::text as username, p.display_name, p.discoverable, n.value,
      l.status, l.outgoing,
      greatest(extensions.word_similarity(n.value, lower(p.username::text)),
               extensions.word_similarity(n.value, lower(coalesce(p.display_name, '')))) as score
    from public.profiles p cross join me m cross join needle n
    left join links l on l.other = p.id
    where p.id <> m.id and length(n.value) >= 2
  )
  select s.id, s.username, s.display_name,
    case when s.status = 'accepted' then 'partner'
         when s.status = 'pending' and s.outgoing then 'requested'
         when s.status = 'pending' then 'waiting' else 'none' end
  from scored s
  where lower(s.username) = s.value
     or (s.discoverable and (lower(s.username) like '%' || s.value || '%'
          or lower(coalesce(s.display_name, '')) like '%' || s.value || '%'
          or s.score > 0.45))
  order by
    case when lower(s.username) = s.value then 0
         when lower(s.username) like s.value || '%' then 1
         when lower(coalesce(s.display_name, '')) like s.value || '%' then 2
         when lower(coalesce(s.display_name, '')) like '% ' || s.value || '%' then 3
         when lower(s.username) like '%' || s.value || '%' then 4 else 5 end,
    s.score desc, s.display_name
  limit 8;
$$;
revoke all on function public.forge_search_athletes(text) from public, anon;
grant execute on function public.forge_search_athletes(text) to authenticated;

create or replace function public.forge_partner_add_id(partner_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_username text;
begin
  select username::text into v_username from public.profiles where id = partner_id;
  if v_username is null then return 'not_found'; end if;
  return public.forge_partner_add(v_username);
end; $$;
revoke all on function public.forge_partner_add_id(uuid) from public, anon;
grant execute on function public.forge_partner_add_id(uuid) to authenticated;

create or replace function public.forge_set_discoverable(p_value boolean)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set discoverable = p_value where id = auth.uid();
$$;
revoke all on function public.forge_set_discoverable(boolean) from public, anon;
grant execute on function public.forge_set_discoverable(boolean) to authenticated;

commit;

/* Applied 2026-09-07, after Preston opened Forge at 8:57pm and Colton's
   215 x 5 was missing: the feed asked Postgres for current_date, which is UTC,
   so from early evening westward the server had already rolled into tomorrow.
   Whether a partner trained TODAY is asked from the viewer's day, so the
   viewer's device supplies it. Recorded here as it stands on the project.

     drop function if exists public.forge_partner_feed();
     create or replace function public.forge_partner_feed(p_today date default null) ...
       with day as (select coalesce(p_today, current_date) as value)

   Plus the partner comparison surface: forge_lift_key, forge_to_miles,
   forge_is_partner, forge_partner_metrics, forge_partner_series. */

/* Applied 2026-09-07, same reason one layer deeper: forge_partner_series
   opened its six-month window at Postgres's current_date, so the chart's
   last bucket belonged to the server's day, not the athlete's. The window
   now starts from the device's day like the feed does. The old three-argument
   signature is dropped first — leaving it in place makes the call ambiguous
   ("function is not unique") the moment the client sends p_today.

     drop function if exists public.forge_partner_series(uuid, text, integer);
     create or replace function public.forge_partner_series(
       partner_id uuid, metric text, weeks integer default 26,
       p_today date default null)
     ... with day as (select coalesce(p_today, current_date) as value),
         span as (select (date_trunc('week', (select value from day))
                  - ((greatest(least(weeks,104),4) - 1) || ' weeks')::interval)::date
                  as first_week)
*/
