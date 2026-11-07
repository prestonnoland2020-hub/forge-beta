/* THE BILLING RULES, AS OF 2026-11-07.

   Free  — logging, history, goals and today's prescription forever.
           Forge Coach: 3 questions a day, 30 a month.
           Program build: 1 a month (so a new athlete always gets one).
           Safety questions (pain, injury, illness, pregnancy) are metered on
           their own, generous allowance and never use up the 3.
   Pro   — $9.99/month or $59.99/year. Coach 60/day (fair use), program
           rebuilds 6/day, and the coach may change the plan for you.
   Trial — 7 days of Pro, once per account, no card, started by the app when
           setup is finished. Ends on its own; nothing is billed.

   The trial lives in its own table so the Stripe/Apple mirror in
   `subscriptions` stays a pure mirror of what a payment provider said. */

create table if not exists public.pro_trials (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null
);
alter table public.pro_trials enable row level security;
drop policy if exists "Read my own trial" on public.pro_trials;
create policy "Read my own trial" on public.pro_trials
  for select to authenticated using (owner_id = (select auth.uid()));
/* No insert/update/delete policy: only start_my_trial writes, so a client
   cannot extend its own trial. */
revoke insert, update, delete on public.pro_trials from anon, authenticated;

/* Starts the one trial an account gets. Idempotent: a second call returns the
   existing trial. Refuses before setup is finished (the coach is only worth
   judging once it has numbers) and for anyone who has ever paid. */
create or replace function public.start_my_trial()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_owner uuid := auth.uid();
  v_ends timestamptz;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;

  select ends_at into v_ends from public.pro_trials where owner_id = v_owner;
  if v_ends is not null then
    return jsonb_build_object('started', false, 'endsAt', v_ends, 'reason', 'already_used');
  end if;

  if not exists (select 1 from public.profiles where id = v_owner and onboarding_completed) then
    return jsonb_build_object('started', false, 'reason', 'setup_unfinished');
  end if;

  if exists (
    select 1 from public.subscriptions s
    where s.owner_id = v_owner
      and (s.stripe_subscription_id is not null or s.apple_original_transaction_id is not null)
  ) then
    return jsonb_build_object('started', false, 'reason', 'has_paid_before');
  end if;

  insert into public.pro_trials(owner_id, started_at, ends_at)
  values (v_owner, now(), now() + interval '7 days')
  on conflict (owner_id) do nothing
  returning ends_at into v_ends;

  if v_ends is null then
    select ends_at into v_ends from public.pro_trials where owner_id = v_owner;
    return jsonb_build_object('started', false, 'endsAt', v_ends, 'reason', 'already_used');
  end if;
  return jsonb_build_object('started', true, 'endsAt', v_ends);
end;
$function$;
revoke execute on function public.start_my_trial() from public, anon;
grant execute on function public.start_my_trial() to authenticated;

/* A live trial counts as Pro. Paid status is checked first so a trial can
   never mask a real subscription's state. */
create or replace function public.forge_tier(p_owner uuid)
returns text
language plpgsql
stable security definer
set search_path to ''
as $function$
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
  if exists (select 1 from public.pro_trials t where t.owner_id = p_owner and t.ends_at > now()) then
    return 'pro';
  end if;
  return 'free';
end;
$function$;
revoke execute on function public.forge_tier(uuid) from public, anon, authenticated;

/* Safety questions get their own meter so a free athlete who has used today's
   three can still tell the coach their knee hurts. It is still a meter: the
   endpoint calls a paid model, and an unlimited bucket would be a free LLM
   for anyone who words every question as "my back hurts". */
insert into public.ai_quota_limits(tier, endpoint, daily_limit, monthly_limit) values
  ('free', 'forge-coach-safety', 10, 100),
  ('pro',  'forge-coach-safety', 20, 300)
on conflict (tier, endpoint) do update
  set daily_limit = excluded.daily_limit, monthly_limit = excluded.monthly_limit;

/* Free keeps one program build a month (a new athlete always gets one);
   rebuilding on demand is Pro. */
update public.ai_quota_limits set daily_limit = 1, monthly_limit = 1
  where tier = 'free' and endpoint = 'forge-plan';

/* Entitlements now say whether a trial is running and whether it was used, so
   the app can show "Pro trial · 5 days left" and stop offering a used trial. */
create or replace function public.my_entitlements()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_owner uuid := auth.uid();
  v_tier text;
  v_today date := (now() at time zone 'utc')::date;
  v_trial_ends timestamptz;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  v_tier := public.forge_tier(v_owner);
  select ends_at into v_trial_ends from public.pro_trials where owner_id = v_owner;
  return jsonb_build_object(
    'tier', v_tier,
    'trialEndsAt', case when v_trial_ends > now() then v_trial_ends else null end,
    'trialUsed', v_trial_ends is not null,
    'onTrial', v_trial_ends > now() and not exists (
      select 1 from public.subscriptions s where s.owner_id = v_owner
        and s.status in ('active', 'trialing') and s.plan in ('pro_monthly', 'pro_annual', 'coach')),
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
$function$;
revoke execute on function public.my_entitlements() from public, anon;
grant execute on function public.my_entitlements() to authenticated;
