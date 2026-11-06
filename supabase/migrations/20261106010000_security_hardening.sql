/* SECURITY HARDENING: WHO MAY CALL WHAT.

   Supabase grants EXECUTE on every new function to PUBLIC, anon and
   authenticated. For a SECURITY DEFINER function that means anyone holding the
   publishable key in the app bundle — no sign-in — can call it over
   /rest/v1/rpc, and it runs as the table owner. Each of these already checked
   auth.uid() inside, so none leaked data; but "safe because every body
   remembers to check" is one forgotten line from not being safe. The grant is
   now the first gate and the check inside is the second. */

/* Signed-in only. Each reads auth.uid() and returns nothing without it. */
revoke execute on function public.forge_account_overview() from public, anon;
revoke execute on function public.forge_push_health() from public, anon;
revoke execute on function public.forge_push_last() from public, anon;
revoke execute on function public.forge_send_test_push() from public, anon;
revoke execute on function public.search_public_profiles(text) from public, anon;
grant execute on function public.forge_account_overview() to authenticated;
grant execute on function public.forge_push_health() to authenticated;
grant execute on function public.forge_push_last() to authenticated;
grant execute on function public.forge_send_test_push() to authenticated;
grant execute on function public.search_public_profiles(text) to authenticated;

/* Trigger functions. Nobody calls these; the database does, on insert. */
revoke execute on function public.forge_notify_partners() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

/* Server-side only. forge_tier(any_user) answered "is this person Pro?" about
   ANY account to any signed-in caller. Its real callers — consume_ai_quota and
   my_entitlements — run as the owner and keep working. */
revoke execute on function public.forge_tier(uuid) from public, anon, authenticated;

/* Deliberately LEFT callable signed out, because the service worker that calls
   them has no session: forge_push_delivered and forge_rotate_push_subscription
   (both need the push endpoint, an unguessable URL only the browser holds) and
   forge_push_public_key (the VAPID PUBLIC key — public by definition). */

/* THE OWNER DASHBOARD IS GATED ON AN ID, NOT A NAME. "username is
   prestonnoland" was the whole check: release that name and whoever claims it
   reads every account's overview. A user id cannot be claimed. */
create or replace function public.forge_account_overview()
 returns table(username text, display_name text, joined date, onboarded boolean, goals integer, days_logged integer, last_logged date, weekly_miles numeric, push_installs integer, push_last_delivered timestamp with time zone)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select
    p.username,
    p.display_name,
    p.created_at::date as joined,
    p.onboarding_completed as onboarded,
    (select count(*)::integer from public.goals g where g.owner_id = p.id) as goals,
    (select count(*)::integer from public.workout_days w where w.owner_id = p.id) as days_logged,
    (select max(w.workout_date) from public.workout_days w where w.owner_id = p.id) as last_logged,
    (select round(coalesce(sum(
        case when c.summary ~ '([0-9]+\.?[0-9]*)\s*(mi|mile)'
             then (regexp_match(c.summary, '([0-9]+\.?[0-9]*)\s*(mi|mile)'))[1]::numeric
             else 0 end), 0) / 4.0, 1)
      from public.cardio_sessions c
      where c.owner_id = p.id and c.performed_on > current_date - 28) as weekly_miles,
    (select count(*)::integer from public.push_subscriptions s where s.owner_id = p.id) as push_installs,
    (select max(l.delivered_at) from private.push_log l where l.owner_id = p.id) as push_last_delivered
  from public.profiles p
  where auth.uid() = 'e6418c64-5ca8-44db-a6bb-27b57b6615cc'::uuid
  order by p.created_at desc;
$function$;
revoke execute on function public.forge_account_overview() from public, anon;
grant execute on function public.forge_account_overview() to authenticated;

/* A FIXED search_path on every remaining function. Without one, a function
   resolves table names through whatever path the caller set — the hole that
   lets a crafted schema shadow a real table. */
alter function public.set_updated_at() set search_path = public;
alter function public.save_my_training_day(jsonb) set search_path = public;
alter function public.replace_my_training_split(text, jsonb) set search_path = public;
alter function public.normalize_training_cycle_position() set search_path = public;
alter function public.rebuild_my_training_cycle(uuid) set search_path = public;
alter function public.delete_my_training_day(uuid) set search_path = public;
alter function public.cardio_clock_seconds(text) set search_path = public;
alter function public.capture_cardio_session_segments() set search_path = public;
alter function public.save_my_daily_recommendation(jsonb) set search_path = public;
alter function public.stamp_generated_at() set search_path = public;
alter function public.freeze_friendship_parties() set search_path = public;
