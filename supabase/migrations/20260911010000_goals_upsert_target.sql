/* THE GOAL UPSERT HAD NOWHERE TO LAND.

   Every goal the client saved went out as an upsert on (owner_id, type, name),
   and Postgres rejected all of them:

     42P10  there is no unique or exclusion constraint matching the
            ON CONFLICT specification

   The table had no such constraint. The only trace was a console.warn, so the
   goals lived in localStorage and nowhere else — sign in on a second device
   and the table was empty, the onboarding gate saw no goals, and the athlete
   was sent back through setup. Three of eight accounts had a goal row at all.

   This was applied to the live project before it was written down here; this
   file is the record, and it is idempotent so a fresh environment lands in the
   same place. */
begin;

/* Duplicates would block the constraint. Newest wins — an older row under the
   same (owner, type, name) is a copy the client has already replaced. */
delete from public.goals a
using public.goals b
where a.owner_id = b.owner_id
  and a.type = b.type
  and a.name = b.name
  and (a.created_at, a.id) < (b.created_at, b.id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.goals'::regclass and conname = 'goals_owner_type_name_key'
  ) then
    alter table public.goals
      add constraint goals_owner_type_name_key unique (owner_id, type, name);
  end if;
end $$;

commit;
