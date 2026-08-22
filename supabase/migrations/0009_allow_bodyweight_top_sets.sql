begin;

alter table public.top_sets
  drop constraint if exists top_set_weight_positive;

alter table public.top_sets
  add constraint top_set_weight_nonnegative check (weight >= 0);

commit;
