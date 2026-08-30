/* Can one athlete reach another athlete's training, or grant themselves Pro?

   Row-level security is the only thing standing between the two, and it is
   written once per table and then trusted forever. These are the claims worth
   proving rather than assuming. */

\set ON_ERROR_STOP on

create temporary table rls_result(step text, got text, want text);
/* The harness switches into the `authenticated` role partway through, so the
   scratch table it writes findings to has to be reachable from there too. */
grant all on rls_result to authenticated, service_role;

-- Two athletes and one day of training each, written as the service role.
set request.jwt.claim.role = 'service_role';
insert into auth.users(id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@example.com')
on conflict do nothing;
insert into public.profiles(id, display_name, username) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Athlete A', 'athlete_a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Athlete B', 'athlete_b')
on conflict do nothing;
insert into public.subscriptions(owner_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002')
on conflict do nothing;
insert into public.workout_days(id, owner_id, workout_date, title) values
  ('dddddddd-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, 'A''s chest day'),
  ('dddddddd-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', current_date, 'B''s leg day')
on conflict do nothing;
insert into public.athlete_settings(owner_id, setup) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '{"displayName":"A"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '{"displayName":"B"}')
on conflict do nothing;

-- Now become athlete A, through the same role the browser uses.
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into rls_result
select 'A sees only A''s workout days', count(*)::text, '1' from public.workout_days;

insert into rls_result
select 'A sees only A''s settings', count(*)::text, '1' from public.athlete_settings;

insert into rls_result
select 'A cannot read B''s profile row', count(*)::text, '0'
from public.profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- The subscriptions table is the entitlement. A user may read their own and
-- write nothing at all: there is no INSERT, UPDATE or DELETE policy anywhere.
do $$
declare granted boolean := false;
begin
  begin
    update public.subscriptions
      set plan = 'pro_annual', status = 'active'
      where owner_id = auth.uid();
    granted := (select count(*) from public.subscriptions
                where owner_id = auth.uid() and status = 'active') > 0;
  exception when others then granted := false;
  end;
  insert into rls_result values ('A cannot grant themselves Pro', granted::text, 'false');
end $$;

-- The usage meter is readable so the app can say what is left, and writable by
-- nobody: moving your own counter is moving your own bill.
do $$
declare moved boolean := false;
begin
  begin
    insert into public.ai_usage(owner_id, usage_date, endpoint, calls)
    values (auth.uid(), (now() at time zone 'utc')::date, 'forge-coach', 0);
    moved := true;
  exception when others then moved := false;
  end;
  insert into rls_result values ('A cannot reset their own AI usage', moved::text, 'false');
end $$;

-- The founder allowlist has RLS on and no policy at all, so it is invisible.
insert into rls_result
select 'the unlimited-account list is invisible', count(*)::text, '0' from public.unlimited_accounts;

-- Strava tokens live outside the exposed schema entirely.
do $$
declare reachable boolean := false;
begin
  begin
    perform 1 from private.activity_connections limit 1;
    reachable := true;
  exception when others then reachable := false;
  end;
  insert into rls_result values ('Strava tokens are unreachable', reachable::text, 'false');
end $$;

-- external_activities gained an UPDATE policy in 0021: without it the client's
-- "already imported" write silently matched zero rows and Strava re-offered
-- settled activities forever.
reset role;
set request.jwt.claim.role = 'service_role';
insert into public.external_activities(owner_id, provider, external_id, activity_type, activity_name, started_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'strava', 'act-1', 'Run', 'Morning Run', now())
on conflict do nothing;
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.external_activities set imported_to_workout = true where external_id = 'act-1';
insert into rls_result
select 'A can mark an activity imported', count(*)::text, '1'
from public.external_activities where external_id = 'act-1' and imported_to_workout;

-- A friendship's two ends are immutable once the row exists, so an addressee
-- cannot forge an accepted friendship with someone who never asked.
reset role;
set request.jwt.claim.role = 'service_role';
insert into public.friendships(id, requester_id, addressee_id, status)
values ('ffffffff-0000-0000-0000-00000000000f',
        'bbbbbbbb-0000-0000-0000-000000000002',
        'aaaaaaaa-0000-0000-0000-000000000001', 'pending')
on conflict do nothing;
set role authenticated;
set request.jwt.claim.role = 'authenticated';
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
declare forged boolean := false;
begin
  begin
    update public.friendships
      set requester_id = 'aaaaaaaa-0000-0000-0000-000000000001', status = 'accepted'
      where id = 'ffffffff-0000-0000-0000-00000000000f';
    forged := true;
  exception when others then forged := false;
  end;
  insert into rls_result values ('a friendship cannot be re-pointed', forged::text, 'false');
end $$;

reset role;

select
  case when got is not distinct from want then '  PASS' else '  FAIL' end as status,
  step,
  case when got is not distinct from want then '' else format('got %s, wanted %s', coalesce(got, 'null'), want) end as detail
from rls_result;

select case when count(*) = 0 then 'All RLS checks passed'
            else count(*)::text || ' FAILING' end as summary
from rls_result where (got is not distinct from want) = false;
