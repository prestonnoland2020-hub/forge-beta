begin;

alter table public.top_sets
  drop constraint if exists top_set_weight_positive;

/* Idempotent, because 0001 has since been edited to declare this constraint at
   table-creation time. On the live database — where 0001 ran before that edit
   — this ALTER is what actually adds it. On a fresh one (a staging project, a
   local `supabase db reset`) the constraint already exists, and a bare ADD
   aborts this migration and every later file with it. Both histories now
   converge on the same schema. */
do $$ begin
  alter table public.top_sets
    add constraint top_set_weight_nonnegative check (weight >= 0);
exception when duplicate_object then null; end $$;

commit;
