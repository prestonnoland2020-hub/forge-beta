/* NO NEW ATHLETE COULD FINISH SETUP.

   Applied to the live project on 2026-09-07, after Eli became the first person
   to sign up since late August and could not get in.

   profiles carried a SELECT policy and an UPDATE policy and nothing for
   INSERT. saveProfile writes with upsert rather than update — deliberately,
   because an update against a row that does not exist reports success while
   changing nothing, which used to leave an account permanently stuck behind
   the onboarding gate. But PostgREST implements upsert as INSERT ... ON
   CONFLICT, and Postgres checks the INSERT policy whether or not the row turns
   out to conflict. With no such policy the write was denied every time:

     new row violates row-level security policy for table "profiles"

   That is the last step of onboarding, the one that sets onboarding_completed,
   so every account created after the upsert landed could map a split, save it,
   and then be thrown back to the setup screen for good. Riley on 2026-08-28
   was the last athlete to complete setup; nobody signed up in between, so the
   regression sat unnoticed for ten days.

   The policy states the same rule the other two already do: you may write your
   own row and no one else's. */
begin;

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

commit;

/* ---- and, the same afternoon, a second silent opt-out ---------------- */

/* A LAUNCH MUST NOT BE ABLE TO TURN SOMEONE'S NOTIFICATIONS OFF.

   syncPushSubscription runs on every app launch — it has to, because iOS
   retires subscriptions quietly and re-subscribing is the only way to notice.
   It also sent the athlete's notification preferences, read from localStorage,
   where they default to all-false. So a launch on a device whose local copy
   had been cleared (a PWA update, or an account switch, which deliberately
   wipes the forge-* keys) wrote wants_morning=false and wants_partner=false
   over a choice the athlete had already made, and the sender then correctly
   obeyed them. The switches read as ON in the app and were OFF in the
   database — found because a partner push reported "sent 0, skipped 0" with
   an accepted friendship and a live subscription sitting right there.

   The server's copy is the athlete's choice. Null now means "leave it as it
   is", so the launch sync sends no preferences at all and only the settings
   toggle changes them. A brand-new subscription still defaults to on, which is
   what someone who just accepted the iOS prompt is asking for.

     create or replace function public.forge_save_push_subscription(
       p_endpoint text, p_p256dh text, p_auth text, p_timezone text,
       p_wants_morning boolean default null, p_wants_partner boolean default null)
     ... on conflict (endpoint) do update set
           wants_morning = coalesce(p_wants_morning, public.push_subscriptions.wants_morning),
           wants_partner = coalesce(p_wants_partner, public.push_subscriptions.wants_partner)
*/
