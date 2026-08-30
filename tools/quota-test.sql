/* Does the meter actually hold?

   The quota gate is the only thing standing between an open Google sign-up and
   an unbounded OpenAI bill, so it gets tested rather than assumed. Run against
   a scratch Postgres with tools/supabase-shim.sql plus the full migration
   history applied. */

\set ON_ERROR_STOP on
set request.jwt.claim.role = 'service_role';

create temporary table result(step text, got text, want text);

/* Self-contained fixtures: the owner account (whose email is on the unlimited
   list, deliberately written in mixed case to prove the lookup is
   case-insensitive) and one ordinary free account. */
insert into auth.users(id, email) values
  ('11111111-1111-1111-1111-111111111111', 'PrestonNoland2020@Gmail.com'),
  ('22222222-2222-2222-2222-222222222222', 'free.user@example.com')
on conflict (id) do nothing;
insert into public.profiles(id, display_name, username) values
  ('11111111-1111-1111-1111-111111111111', 'Preston', 'preston'),
  ('22222222-2222-2222-2222-222222222222', 'Free User', 'free_user')
on conflict (id) do nothing;
insert into public.subscriptions(owner_id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict (owner_id) do nothing;

insert into result
select 'the owner resolves as founder', public.forge_tier('11111111-1111-1111-1111-111111111111'), 'founder';
insert into result
select 'everyone else resolves as free', public.forge_tier('22222222-2222-2222-2222-222222222222'), 'free';

do $$
declare
  free_user uuid := '22222222-2222-2222-2222-222222222222';
  owner_user uuid := '11111111-1111-1111-1111-111111111111';
  answer jsonb;
  allowed_count integer := 0;
begin
  delete from public.ai_usage;

  -- A free account has three coach questions a day. Ask five.
  for i in 1..5 loop
    answer := public.consume_ai_quota(free_user, 'forge-coach');
    if (answer->>'allowed')::boolean then allowed_count := allowed_count + 1; end if;
  end loop;
  insert into result values ('free tier: 5 asks, 3 allowed', allowed_count::text, '3');

  -- And the counter must reflect what was SERVED, not what was attempted:
  -- a refusal rolls its own increment back.
  insert into result values (
    'refusals are not counted',
    (select calls::text from public.ai_usage
      where owner_id = free_user and endpoint = 'forge-coach'
        and usage_date = (now() at time zone 'utc')::date), '3');

  -- The reason names the window that was hit, so the paywall can say it.
  answer := public.consume_ai_quota(free_user, 'forge-coach');
  insert into result values ('refusal names the window', answer->>'reason', 'daily');

  -- The owner is exempt in the database, not in application code.
  delete from public.ai_usage;
  allowed_count := 0;
  for i in 1..40 loop
    answer := public.consume_ai_quota(owner_user, 'forge-coach');
    if (answer->>'allowed')::boolean then allowed_count := allowed_count + 1; end if;
  end loop;
  insert into result values ('owner: 40 asks, all allowed', allowed_count::text, '40');

  -- A refund gives a use back after an upstream failure.
  delete from public.ai_usage;
  perform public.consume_ai_quota(free_user, 'forge-coach');
  perform public.consume_ai_quota(free_user, 'forge-coach');
  perform public.refund_ai_quota(free_user, 'forge-coach');
  insert into result values (
    'a refund returns the use',
    (select calls::text from public.ai_usage
      where owner_id = free_user and endpoint = 'forge-coach'
        and usage_date = (now() at time zone 'utc')::date), '1');

  -- An endpoint with no configured limit is CLOSED, not open: a typo in an
  -- endpoint name must never become a free route.
  answer := public.consume_ai_quota(free_user, 'forge-typo');
  insert into result values ('unknown endpoint is refused', (answer->>'allowed'), 'false');

  -- Program builds are metered separately from coach questions.
  delete from public.ai_usage;
  allowed_count := 0;
  for i in 1..3 loop
    answer := public.consume_ai_quota(free_user, 'forge-plan');
    if (answer->>'allowed')::boolean then allowed_count := allowed_count + 1; end if;
  end loop;
  insert into result values ('free tier: 3 plan builds, 1 allowed', allowed_count::text, '1');

  -- The monthly cap bites even when each day stays under the daily one.
  delete from public.ai_usage;
  for day_offset in 1..15 loop
    insert into public.ai_usage(owner_id, usage_date, endpoint, calls)
    values (free_user, (now() at time zone 'utc')::date - day_offset, 'forge-coach', 3);
  end loop;
  answer := public.consume_ai_quota(free_user, 'forge-coach');
  insert into result values ('monthly cap holds', answer->>'reason', 'monthly');
end $$;

\echo ''
select
  case when got is not distinct from want then '  PASS' else '  FAIL' end as status,
  step,
  case when got is not distinct from want then '' else format('got %s, wanted %s', coalesce(got,'null'), want) end as detail
from result;

\echo ''
select case when count(*) = 0 then 'All quota checks passed'
            else count(*)::text || ' FAILING' end as summary
from result where (got is not distinct from want) = false;
