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
