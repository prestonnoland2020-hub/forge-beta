begin;

/* PRODUCTION HARDENING.

   Three things this migration exists to fix, in order of how much they cost
   if left alone:

   1. THE AI ENDPOINTS ARE UNMETERED. forge-coach has no rate limit at all and
      forge-plan's only cooldown reads `training_plans` -- a table no migration
      ever created -- while discarding the error it gets back, so the cooldown
      has never once fired. Anyone who can sign up (open Google OAuth) can hold
      both endpoints open in a loop and spend the OpenAI budget. Metering lives
      here, in the database, written only by the service role, so a client
      cannot move its own clock.

   2. THREE TABLES THE APP DEPENDS ON EXIST IN NO MIGRATION. athlete_settings,
      training_plans and training_plan_history are read and written by the
      client with no owner filter, trusting an RLS policy that is not in
      version control. If they were created by hand without RLS, every
      athlete's setup, goals and stored program is world-readable. Created
      here idempotently, so this is safe whether they exist or not.

   3. RLS GAPS. external_activities is written by the client but has no UPDATE
      policy, so "already imported" never sticks and Strava re-offers settled
      activities forever. friendships lets an addressee rewrite requester_id.
      Two SECURITY DEFINER functions take an arbitrary target_owner with no
      role check, protected only by a grant that one careless statement undoes.

   Everything is `if not exists` / `create or replace` / `drop policy if
   exists` so this migration is safe to re-run and safe against a live
   database that has drifted from the migration history. */


/* ---------------------------------------------------------------------------
   1. TABLES THE APP USES THAT NO MIGRATION CREATED
   ------------------------------------------------------------------------ */

create table if not exists public.athlete_settings (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  setup jsonb,
  plan jsonb,
  appearance jsonb,
  goals jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.training_plans (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  payload jsonb not null,
  horizon_weeks integer,
  /* Server-owned. The client used to supply this value and the forge-plan
     cooldown read it back -- a rate limit whose clock the attacker sets. The
     trigger below stamps it on every write and ignores whatever was sent. */
  generated_at timestamptz not null default now()
);

create table if not exists public.training_plan_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists training_plan_history_owner_created
  on public.training_plan_history(owner_id, created_at desc);

alter table public.athlete_settings enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_plan_history enable row level security;

drop policy if exists athlete_settings_own on public.athlete_settings;
create policy athlete_settings_own on public.athlete_settings
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists training_plans_own on public.training_plans;
create policy training_plans_own on public.training_plans
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

/* History is append-only from the athlete's side: they may write and read
   their own versions, but not rewrite what a past program said. */
drop policy if exists training_plan_history_read on public.training_plan_history;
create policy training_plan_history_read on public.training_plan_history
  for select using (owner_id = auth.uid());
drop policy if exists training_plan_history_insert on public.training_plan_history;
create policy training_plan_history_insert on public.training_plan_history
  for insert with check (owner_id = auth.uid());
drop policy if exists training_plan_history_delete on public.training_plan_history;
create policy training_plan_history_delete on public.training_plan_history
  for delete using (owner_id = auth.uid());

create or replace function public.stamp_generated_at()
returns trigger language plpgsql as $$
begin
  new.generated_at = now();
  return new;
end;
$$;

drop trigger if exists training_plans_generated_at on public.training_plans;
create trigger training_plans_generated_at before insert or update on public.training_plans
for each row execute function public.stamp_generated_at();

drop trigger if exists athlete_settings_updated_at on public.athlete_settings;
create trigger athlete_settings_updated_at before update on public.athlete_settings
for each row execute function public.set_updated_at();


/* ---------------------------------------------------------------------------
   2. WHO GETS WHAT: TIERS, THE FOUNDER ALLOWLIST, AND AI QUOTAS
   ------------------------------------------------------------------------ */

/* The founder allowlist is a table rather than a constant so the account that
   runs without limits can be changed without a deploy. It is readable and
   writable by nobody through the API -- no policy is created for it, and RLS
   is on -- so only the service role and SECURITY DEFINER functions see it. */
create table if not exists public.unlimited_accounts (
  email citext primary key,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.unlimited_accounts enable row level security;

insert into public.unlimited_accounts(email, note)
values ('prestonnoland2020@gmail.com', 'Forge owner — unmetered')
on conflict (email) do nothing;

/* Limits are data, not code, so they can be tuned live when real usage shows
   what a session actually costs. Both endpoints carry a daily and a monthly
   cap: the daily cap stops a bad afternoon, the monthly cap stops a patient
   attacker who stays just under it every day. */
create table if not exists public.ai_quota_limits (
  tier text not null,
  endpoint text not null,
  daily_limit integer not null,
  monthly_limit integer not null,
  primary key (tier, endpoint)
);
alter table public.ai_quota_limits enable row level security;

drop policy if exists ai_quota_limits_read on public.ai_quota_limits;
create policy ai_quota_limits_read on public.ai_quota_limits for select using (auth.uid() is not null);

/* The free numbers are set by arithmetic, not generosity. A coach answer costs
   roughly $0.015 and a full program build roughly $0.07 at current provider
   prices. Freemium conversion for a new Health & Fitness app runs about 1.5%,
   so every paying subscriber is carrying around 65 free accounts — and at
   $9.99/month less Apple's 15% that subscriber nets about $8.50. A free tier
   that can spend $0.90 a month is therefore a tier that loses money on volume
   and gets worse as it grows.

   30 coach questions and 2 program builds a month caps a maxed-out free
   account near $0.59 — enough to prove the coach is real and worth paying
   for, cheap enough that growth is not a liability. */
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

/* Readable so the app can honestly say "2 of 5 coach questions left today".
   Deliberately not writable: there is no INSERT, UPDATE or DELETE policy, so
   only the service role -- via consume_ai_quota below -- moves these numbers. */
drop policy if exists ai_usage_read_self on public.ai_usage;
create policy ai_usage_read_self on public.ai_usage for select using (owner_id = auth.uid());

create index if not exists ai_usage_owner_date on public.ai_usage(owner_id, usage_date desc);

/* One place that answers "what is this account allowed to do". Reads the
   verified auth email for the founder check -- a value the user cannot change
   without re-verifying it with the identity provider -- then the subscription
   the Stripe webhook owns. Never trusts anything the client sent. */
create or replace function public.forge_tier(p_owner uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email citext;
  v_plan public.subscription_plan;
  v_status public.subscription_status;
begin
  select email into v_email from auth.users where id = p_owner;
  if v_email is not null and exists (select 1 from public.unlimited_accounts u where u.email = v_email) then
    return 'founder';
  end if;
  select plan, status into v_plan, v_status from public.subscriptions where owner_id = p_owner;
  if v_status in ('active', 'trialing') and v_plan in ('pro_monthly', 'pro_annual', 'coach') then
    return 'pro';
  end if;
  return 'free';
end;
$$;

revoke all on function public.forge_tier(uuid) from public, anon;
grant execute on function public.forge_tier(uuid) to authenticated, service_role;

/* What the app shows on the billing screen. Scoped to the caller -- the
   parameterless signature is the whole defence, there is no user id to pass. */
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
        'dailyLimit', case when v_tier = 'founder' then null else l.daily_limit end,
        'monthlyLimit', case when v_tier = 'founder' then null else l.monthly_limit end,
        'usedToday', coalesce((select u.calls from public.ai_usage u
          where u.owner_id = v_owner and u.usage_date = v_today and u.endpoint = e.endpoint), 0),
        'usedThisMonth', coalesce((select sum(u.calls) from public.ai_usage u
          where u.owner_id = v_owner and u.endpoint = e.endpoint
            and u.usage_date >= date_trunc('month', v_today)::date), 0)
      ))
      from (select unnest(array['forge-coach', 'forge-plan']) as endpoint) e
      left join public.ai_quota_limits l
        on l.endpoint = e.endpoint and l.tier = (case when v_tier = 'founder' then 'pro' else v_tier end)
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;

/* The gate itself. Atomic: the row is inserted-or-incremented and the new
   count is what decides, so two concurrent requests cannot both read "4 used"
   and both proceed. Over the limit, the increment is rolled back to keep the
   counter honest about what was actually served. */
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

  /* An endpoint with no configured limit is closed, not open. A typo in an
     endpoint name must not become an unmetered route. */
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

  return jsonb_build_object('allowed', true, 'tier', v_tier, 'usedToday', v_day_calls, 'dailyLimit', v_daily);
end;
$$;

revoke all on function public.consume_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text) to service_role;

/* A request that fails upstream should not spend the athlete's quota. */
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
    where owner_id = p_owner and usage_date = (now() at time zone 'utc')::date and endpoint = p_endpoint;
end;
$$;

revoke all on function public.refund_ai_quota(uuid, text) from public, anon, authenticated;
grant execute on function public.refund_ai_quota(uuid, text) to service_role;


/* A subscription can now arrive down two rails. The web sells through Stripe;
   the iOS app must sell through Apple's In-App Purchase (App Store Review
   Guideline 3.1.1 -- an app may not use its own mechanism to unlock features).
   Both write the same row, and everything downstream -- forge_tier, the quota
   gate, the billing screen -- reads entitlement without caring which rail paid
   for it. */
alter table public.subscriptions
  add column if not exists source text not null default 'stripe',
  add column if not exists apple_original_transaction_id text,
  add column if not exists apple_product_id text;

do $$ begin
  alter table public.subscriptions add constraint subscriptions_source_check
    check (source in ('stripe', 'apple'));
exception when duplicate_object then null; end $$;

/* One Apple subscription belongs to one account. Without this, a family
   sharing a purchase could each claim Pro from the same transaction. */
create unique index if not exists subscriptions_apple_original_transaction
  on public.subscriptions(apple_original_transaction_id)
  where apple_original_transaction_id is not null;


/* ---------------------------------------------------------------------------
   3. RLS GAPS
   ------------------------------------------------------------------------ */

/* external_activities: the client sets imported_to_workout so a settled
   activity is never re-offered, but no UPDATE policy existed -- the statement
   matched zero rows, returned no error, and every sync re-walked the whole
   history. */
drop policy if exists external_activities_owner_update on public.external_activities;
create policy external_activities_owner_update on public.external_activities
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

/* friendships: the addressee could rewrite requester_id, forging an accepted
   friendship with someone who never sent one. Responding and editing what you
   share are now two different permissions. */
drop policy if exists "friendships_addressee_respond" on public.friendships;
create policy "friendships_addressee_respond" on public.friendships
  for update using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid() and status in ('accepted', 'declined', 'blocked'));

drop policy if exists "friendships_participant_sharing" on public.friendships;
create policy "friendships_participant_sharing" on public.friendships
  for update using (auth.uid() in (requester_id, addressee_id))
  with check (auth.uid() in (requester_id, addressee_id));

/* Belt and braces for both policies above: the two endpoints of a friendship
   are immutable once the row exists, whichever policy admitted the write. */
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
create trigger friendships_freeze_parties before update on public.friendships
for each row execute function public.freeze_friendship_parties();

/* athlete_health_notes relied on Postgres reusing USING as WITH CHECK. Correct
   today, implicit, and the only policy in the schema that leaves it to the
   engine. Say it out loud. */
drop policy if exists "athlete_health_notes_update_own" on public.athlete_health_notes;
create policy "athlete_health_notes_update_own" on public.athlete_health_notes
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

/* The Strava token table. The schema is unexposed and usage is revoked, which
   is the real defence -- but a table holding live access and refresh tokens
   for every athlete should not depend on a single GRANT. RLS with no policy
   denies every role that is not the owner or service_role, and the SECURITY
   DEFINER accessors are unaffected. */
alter table private.activity_connections enable row level security;

/* Two SECURITY DEFINER functions take an arbitrary target_owner, so a caller
   who reaches them could write exercises and goals into somebody else's
   account. Nothing but a GRANT stands in the way today.

   Re-assert those grants rather than rewriting the function bodies. Both are
   long data-seeding routines, one of them fires from the new-profile trigger
   during signup (where auth.role() is the auth service, not service_role), and
   reproducing either body to bolt on a role check risks breaking a working
   import to defend against a grant statement nobody has written. The revoke IS
   the control; state it explicitly so it survives a `create or replace` that
   forgets it. */
revoke all on function public.seed_circuit_exercise_library(uuid) from public, anon, authenticated;
grant execute on function public.seed_circuit_exercise_library(uuid) to service_role;
revoke all on function public.import_legacy_library_data(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_legacy_library_data(uuid, jsonb, boolean) to service_role;

/* A top set may not point at another athlete's training day. Reads were always
   filtered, so this was integrity rather than disclosure -- but a child row
   whose parent belongs to someone else is a bug waiting to be surfaced by any
   future join. */
create unique index if not exists workout_days_id_owner on public.workout_days(id, owner_id);


/* ---------------------------------------------------------------------------
   4. ACCOUNT DELETION -- App Store Review Guideline 5.1.1(v)
   ------------------------------------------------------------------------ */

/* An app that supports account creation must offer account deletion inside
   the app. Not a support email, not a web form: a control in the app that
   actually deletes. Everything in public references profiles(id) on delete
   cascade and profiles references auth.users(id) on delete cascade, so
   removing the auth user removes the athlete. The Strava tokens live outside
   that chain and are cleared explicitly. */
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
