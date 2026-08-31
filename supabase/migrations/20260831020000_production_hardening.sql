begin;

/* PRODUCTION HARDENING — rewritten against the live database, 31 Aug 2026.

   The first draft of this migration was written from the repository alone, and
   inspecting production before applying it changed three of its claims and
   caught one regression it would have introduced.

   WHAT THE REPO GOT WRONG:

   - athlete_settings, training_plans and training_plan_history are missing from
     the repo's migration folder, but they exist in production with correct,
     per-owner RLS (select/insert/update/delete all scoped to
     `auth.uid() = owner_id`). They were created by migrations applied through
     the dashboard that were never written back to version control. That was a
     versioning problem, NOT the data exposure the first draft assumed. This
     migration no longer touches them.

   - external_activities already has an owner-scoped UPDATE policy
     (`external_activities_owner_mark_imported`, from 20260826012831). The
     "Strava re-offers settled activities forever" bug does not exist here.

   - The first draft added a second permissive UPDATE policy to friendships
     letting EITHER party update the row. Postgres ORs permissive policies
     together, so that would have let a REQUESTER accept their own friend
     request — strictly worse than what production has today. Removed.

   WHAT IS ACTUALLY MISSING, AND IS WHAT THIS APPLIES:

   1. The AI endpoints are unmetered. forge-coach has no rate limit at all, and
      forge-plan's cooldown reads `training_plans.generated_at` — a column the
      CLIENT writes, with no trigger stamping it — so the clock belongs to the
      caller. Anyone who can complete a Google sign-in can hold both endpoints
      open against the OpenAI key.

   2. private.activity_connections — the table holding every athlete's live
      Strava access and refresh tokens — has RLS DISABLED. The schema is
      unexposed and usage is revoked, which is the real defence, but a token
      table should not rest on a single GRANT.

   3. There is no way to delete an account, which App Store Review Guideline
      5.1.1(v) requires before submission.

   4. subscriptions cannot record an Apple purchase, so iOS has no rail.

   5. A friendship's two endpoints are mutable by the addressee.

   Additive only. Nothing here drops an existing policy, alters an existing
   column, or touches a row of training data. */


/* ---------------------------------------------------------------------------
   1. TIERS, THE FOUNDER ALLOWLIST, AND AI QUOTAS
   ------------------------------------------------------------------------ */

/* Plain lower-cased text rather than citext: the functions below run with
   `search_path = ''`, where an unqualified `citext` cannot resolve — and this
   project has citext in `public`, which a future Supabase advisory may move.
   Lower-casing on the way in needs no extension at all. */
create table if not exists public.unlimited_accounts (
  email text primary key,
  note text not null default '',
  created_at timestamptz not null default now(),
  constraint unlimited_accounts_lowercase check (email = lower(email))
);
alter table public.unlimited_accounts enable row level security;

insert into public.unlimited_accounts(email, note)
values (lower('prestonnoland2020@gmail.com'), 'Forge owner — unmetered')
on conflict (email) do nothing;

/* Limits are data, not code, so they can be retuned from the SQL editor once
   real usage shows what a session costs.

   The free numbers are arithmetic, not generosity. A coach answer costs about
   $0.015 and a program build about $0.07. Freemium conversion for a new
   Health & Fitness app runs near 1.5%, so each paying subscriber carries
   roughly 65 free accounts, and nets about $8.50 after Apple's cut. A free
   tier able to spend $0.90 a month loses money on volume and gets worse as it
   grows. 30 coach questions and 2 program builds a month caps a maxed-out free
   account near $0.59. */
create table if not exists public.ai_quota_limits (
  tier text not null,
  endpoint text not null,
  daily_limit integer not null,
  monthly_limit integer not null,
  primary key (tier, endpoint)
);
alter table public.ai_quota_limits enable row level security;

drop policy if exists ai_quota_limits_read on public.ai_quota_limits;
create policy ai_quota_limits_read on public.ai_quota_limits
  for select using (auth.uid() is not null);

insert into public.ai_quota_limits(tier, endpoint, daily_limit, monthly_limit) values
  ('free', 'forge-coach', 3,  30),
  ('free', 'forge-plan',  1,  2),
  ('pro',  'forge-coach', 60, 900),
  ('pro',  'forge-plan',  6,  60)
on conflict (tier, endpoint) do update
  set daily_limit = excluded.daily_limit, monthly_limit = excluded.monthly_limit;

create table if not exists public.ai_usage (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null,
  endpoint text not null,
  calls integer not null default 0,
  primary key (owner_id, usage_date, endpoint)
);
alter table public.ai_usage enable row level security;

/* Readable so the app can honestly say "2 of 3 coach questions left today".
   Deliberately not writable: there is no INSERT, UPDATE or DELETE policy, so
   only the service role moves these numbers. Moving your own counter is
   moving your own bill. */
drop policy if exists ai_usage_read_self on public.ai_usage;
create policy ai_usage_read_self on public.ai_usage
  for select using (owner_id = auth.uid());

create index if not exists ai_usage_owner_date on public.ai_usage(owner_id, usage_date desc);

/* One place that answers "what is this account allowed to do". Reads the
   verified auth email for the founder check — a value the user cannot change
   without re-verifying it with the identity provider — then the subscription
   the Stripe webhook owns. Never trusts anything the client sent. */
create or replace function public.forge_tier(p_owner uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_plan public.subscription_plan;
  v_status public.subscription_status;
begin
  select lower(email) into v_email from auth.users where id = p_owner;
  if v_email is not null and exists (
    select 1 from public.unlimited_accounts u where u.email = v_email
  ) then
    return 'founder';
  end if;
  select plan, status into v_plan, v_status
    from public.subscriptions where owner_id = p_owner;
  if v_status in ('active', 'trialing')
     and v_plan in ('pro_monthly', 'pro_annual', 'coach') then
    return 'pro';
  end if;
  return 'free';
end;
$$;

revoke all on function public.forge_tier(uuid) from public, anon;
grant execute on function public.forge_tier(uuid) to authenticated, service_role;

/* What the billing screen shows. Scoped to the caller — the parameterless
   signature is the whole defence, there is no user id to pass. */
create or replace function public.my_entitlements()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_tier text;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  v_tier := public.forge_tier(v_owner);
  return jsonb_build_object(
    'tier', v_tier,
    'endpoints', coalesce((
      select jsonb_object_agg(e.endpoint, jsonb_build_object(
        'dailyLimit',   case when v_tier = 'founder' then null else l.daily_limit end,
        'monthlyLimit', case when v_tier = 'founder' then null else l.monthly_limit end,
        'usedToday', coalesce((select u.calls from public.ai_usage u
          where u.owner_id = v_owner and u.usage_date = v_today
            and u.endpoint = e.endpoint), 0),
        'usedThisMonth', coalesce((select sum(u.calls) from public.ai_usage u
          where u.owner_id = v_owner and u.endpoint = e.endpoint
            and u.usage_date >= date_trunc('month', v_today)::date), 0)
      ))
      from (select unnest(array['forge-coach', 'forge-plan']) as endpoint) e
      left join public.ai_quota_limits l
        on l.endpoint = e.endpoint
       and l.tier = (case when v_tier = 'founder' then 'pro' else v_tier end)
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;

/* The gate. Atomic: the row is inserted-or-incremented and the NEW count is
   what decides, so two concurrent requests cannot both read "2 used" and both
   proceed. Over the limit, the increment rolls back, keeping the counter
   honest about what was actually served. */
create or replace function public.consume_ai_quota(p_owner uuid, p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tier text;
  v_daily integer;
  v_monthly integer;
  v_day_calls integer;
  v_month_calls integer;
  v_today date := (now() at time zone 'utc')::date;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  v_tier := public.forge_tier(p_owner);

  insert into public.ai_usage(owner_id, usage_date, endpoint, calls)
  values (p_owner, v_today, p_endpoint, 1)
  on conflict (owner_id, usage_date, endpoint)
  do update set calls = public.ai_usage.calls + 1
  returning calls into v_day_calls;

  if v_tier = 'founder' then
    return jsonb_build_object('allowed', true, 'tier', v_tier, 'usedToday', v_day_calls);
  end if;

  select daily_limit, monthly_limit into v_daily, v_monthly
    from public.ai_quota_limits where tier = v_tier and endpoint = p_endpoint;

  /* An endpoint with no configured limit is CLOSED, not open. A typo in an
     endpoint name must never become an unmetered route. */
  if v_daily is null then
    update public.ai_usage set calls = calls - 1
      where owner_id = p_owner and usage_date = v_today and endpoint = p_endpoint;
    return jsonb_build_object('allowed', false, 'tier', v_tier, 'reason', 'unknown_endpoint');
  end if;

  select coalesce(sum(calls), 0) into v_month_calls from public.ai_usage
    where owner_id = p_owner and endpoint = p_endpoint
      and usage_date >= date_trunc('month', v_today)::date;

  if v_day_calls > v_daily or v_month_calls > v_monthly then
    update public.ai_usage set calls = calls - 1
      where owner_id = p_owner and usage_date = v_today and endpoint = p_endpoint;
    return jsonb_build_object(
      'allowed', false,
      'tier', v_tier,
      'reason', case when v_day_calls > v_daily then 'daily' else 'monthly' end,
      'dailyLimit', v_daily,
      'monthlyLimit', v_monthly
    );
  end if;

  return jsonb_build_object('allowed', true, 'tier', v_tier,
                            'usedToday', v_day_calls, 'dailyLimit', v_daily);
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text) to service_role;

/* A request that never produced an answer should not cost the athlete one. */
create or replace function public.refund_ai_quota(p_owner uuid, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  update public.ai_usage set calls = greatest(0, calls - 1)
    where owner_id = p_owner
      and usage_date = (now() at time zone 'utc')::date
      and endpoint = p_endpoint;
end;
$$;

revoke all on function public.refund_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(uuid, text) to service_role;


/* ---------------------------------------------------------------------------
   2. THE COOLDOWN CLOCK STOPS BELONGING TO THE CALLER
   ------------------------------------------------------------------------ */

/* training_plans.generated_at exists but nothing stamps it, so the client
   writes the value that forge-plan's own cooldown then reads back — a rate
   limit whose clock the rate-limited party sets. */
create or replace function public.stamp_generated_at()
returns trigger language plpgsql as $$
begin
  new.generated_at = now();
  return new;
end;
$$;

drop trigger if exists training_plans_generated_at on public.training_plans;
create trigger training_plans_generated_at
  before insert or update on public.training_plans
  for each row execute function public.stamp_generated_at();


/* ---------------------------------------------------------------------------
   3. TWO PAYMENT RAILS
   ------------------------------------------------------------------------ */

/* The web sells through Stripe; the iOS app must sell through StoreKit (App
   Store Review Guideline 3.1.1 — an app may not use its own mechanism to
   unlock features). Both write this same row, and forge_tier above reads
   entitlement without caring which rail paid. */
alter table public.subscriptions
  add column if not exists source text not null default 'stripe',
  add column if not exists apple_original_transaction_id text,
  add column if not exists apple_product_id text;

do $$ begin
  alter table public.subscriptions add constraint subscriptions_source_check
    check (source in ('stripe', 'apple'));
exception when duplicate_object then null; end $$;

/* One Apple purchase entitles one Forge account. Without this, a family
   sharing a purchase could each claim Pro from the same transaction. */
create unique index if not exists subscriptions_apple_original_transaction
  on public.subscriptions(apple_original_transaction_id)
  where apple_original_transaction_id is not null;


/* ---------------------------------------------------------------------------
   4. THE REMAINING RLS GAPS
   ------------------------------------------------------------------------ */

/* The Strava token table. RLS is currently DISABLED on it. The schema is
   unexposed and usage is revoked, which is the real defence — but a table
   holding live access and refresh tokens for every athlete should not depend
   on one GRANT. RLS with no policy denies every role that is not the owner or
   service_role; the SECURITY DEFINER accessors are unaffected. */
alter table private.activity_connections enable row level security;

/* A friendship's two endpoints are immutable once the row exists. Production's
   UPDATE policy pins the ADDRESSEE but not the requester, so an addressee can
   re-point a request at someone who never sent one. Enforced as a trigger
   rather than a second policy, because permissive policies OR together and a
   second one here would have handed the requester the ability to accept their
   own request. */
create or replace function public.freeze_friendship_parties()
returns trigger language plpgsql as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id then
    raise exception 'A friendship cannot change who it is between';
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_freeze_parties on public.friendships;
create trigger friendships_freeze_parties
  before update on public.friendships
  for each row execute function public.freeze_friendship_parties();

/* athlete_health_notes' UPDATE policy has a USING clause and no WITH CHECK,
   so it relies on Postgres reusing USING for the check. Correct today, and the
   only policy in the schema leaving it implicit. Say it out loud. */
drop policy if exists "athlete_health_notes_update_own" on public.athlete_health_notes;
create policy "athlete_health_notes_update_own" on public.athlete_health_notes
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

/* A top set may not point at another athlete's training day. Reads were always
   filtered, so this is integrity rather than disclosure — but a child row
   whose parent belongs to someone else is a bug waiting for a future join to
   surface it. */
create unique index if not exists workout_days_id_owner
  on public.workout_days(id, owner_id);


/* ---------------------------------------------------------------------------
   5. ACCOUNT DELETION — App Store Review Guideline 5.1.1(v)
   ------------------------------------------------------------------------ */

/* An app that supports account creation must offer account deletion inside the
   app. Not a support email, not a web form: a control that actually deletes.
   Everything in public references profiles(id) on delete cascade and profiles
   references auth.users(id) on delete cascade, so removing the auth user
   removes the athlete. The Strava tokens sit outside that chain and are
   cleared explicitly. */
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  delete from private.activity_connections where owner_id = v_owner;
  delete from auth.users where id = v_owner;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
