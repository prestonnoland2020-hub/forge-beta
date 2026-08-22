begin;

create extension if not exists citext;
create extension if not exists pgcrypto;

create type public.unit_system as enum ('imperial', 'metric');
create type public.experience_level as enum ('beginner', 'intermediate', 'advanced', 'competitive');
create type public.primary_goal as enum ('strength', 'muscle', 'endurance', 'general_fitness', 'weight_change');
create type public.profile_visibility as enum ('private', 'friends', 'public');
create type public.friendship_status as enum ('pending', 'accepted', 'declined', 'blocked');
create type public.goal_type as enum ('lift', 'race', 'consistency', 'bodyweight');
create type public.subscription_plan as enum ('free', 'pro_monthly', 'pro_annual', 'coach');
create type public.subscription_status as enum ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'unpaid');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique,
  display_name text not null default '',
  avatar_url text,
  bio text not null default '',
  birth_date date,
  height_cm numeric(5,2),
  starting_weight numeric(7,2),
  current_weight numeric(7,2),
  unit_system public.unit_system not null default 'imperial',
  experience_level public.experience_level not null default 'beginner',
  primary_goal public.primary_goal not null default 'general_fitness',
  equipment text[] not null default '{}',
  preferred_training_days smallint[] not null default '{}',
  brand_kit text not null default 'forge',
  font_package text not null default 'athletic',
  background_style text not null default 'grid',
  display_mode text not null default 'system',
  profile_visibility public.profile_visibility not null default 'private',
  comparison_visibility public.profile_visibility not null default 'friends',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username is null or username::text ~ '^[a-z0-9_]{3,24}$'),
  constraint adult_launch_check check (birth_date is null or birth_date <= current_date - interval '18 years'),
  constraint height_range check (height_cm is null or height_cm between 90 and 250),
  constraint starting_weight_range check (starting_weight is null or starting_weight between 40 and 1500),
  constraint current_weight_range check (current_weight is null or current_weight between 40 and 1500),
  constraint preferred_days_range check (
    preferred_training_days <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint supported_brand_kit check (brand_kit in ('forge', 'volt', 'apex', 'pulse')),
  constraint supported_font_package check (font_package in ('athletic', 'performance', 'modern')),
  constraint supported_background check (background_style in ('solid', 'grid', 'glow')),
  constraint supported_display_mode check (display_mode in ('light', 'dark', 'system'))
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status public.friendship_status not null default 'pending',
  shared_metrics text[] not null default array['strength_prs', 'consistency'],
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint cannot_friend_self check (requester_id <> addressee_id),
  constraint supported_shared_metrics check (
    shared_metrics <@ array[
      'strength_prs', 'consistency', 'cardio', 'weight_trend', 'workout_frequency'
    ]::text[]
  )
);

create unique index friendships_unique_pair
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create table public.training_splits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  anchor_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint split_name_length check (char_length(trim(name)) between 1 and 80)
);

create unique index one_active_split_per_user
  on public.training_splits(owner_id) where is_active;

create table public.training_split_days (
  id uuid primary key default gen_random_uuid(),
  split_id uuid not null references public.training_splits(id) on delete cascade,
  position smallint not null,
  name text not null default '',
  muscle_groups text[] not null default '{}',
  goal_lifts text[] not null default '{}',
  cardio_types text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (split_id, position),
  constraint split_position_positive check (position > 0)
);

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  workout_date date not null,
  muscle_groups text[] not null default '{}',
  notes text not null default '',
  body_weight numeric(7,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, workout_date),
  constraint body_weight_range check (body_weight is null or body_weight between 40 and 1500)
);

create table public.top_sets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  workout_day_id uuid references public.workout_days(id) on delete set null,
  performed_on date not null,
  lift_name text not null,
  weight numeric(8,2) not null,
  reps smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint lift_name_required check (char_length(trim(lift_name)) between 1 and 120),
  constraint top_set_weight_nonnegative check (weight >= 0),
  constraint reps_range check (reps between 1 and 100)
);

create unique index top_sets_exact_duplicate_guard
  on public.top_sets(owner_id, performed_on, lower(trim(lift_name)), weight, reps);

create index top_sets_owner_lift_date
  on public.top_sets(owner_id, lower(trim(lift_name)), performed_on desc);

create table public.cardio_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  workout_day_id uuid references public.workout_days(id) on delete set null,
  performed_on date not null,
  notes text not null default '',
  client_request_id uuid,
  created_at timestamptz not null default now()
);

create unique index cardio_request_idempotency
  on public.cardio_sessions(owner_id, client_request_id)
  where client_request_id is not null;

create table public.cardio_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cardio_sessions(id) on delete cascade,
  position smallint not null,
  segment text not null default '',
  cardio_type text not null,
  unit text not null default '',
  distance numeric(9,3),
  time_minutes numeric(9,3),
  pace_minutes numeric(9,3),
  reps_or_calories numeric(9,2),
  rest_seconds integer,
  rounds smallint,
  circuit_group text,
  unique(session_id, position),
  constraint cardio_type_required check (char_length(trim(cardio_type)) between 1 and 120)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  type public.goal_type not null,
  name text not null,
  target_value numeric(10,3) not null,
  muscle_group text,
  target_date date,
  min_weekly_mileage numeric(7,2),
  peak_weekly_mileage numeric(7,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_name_required check (char_length(trim(name)) between 1 and 120)
);

create unique index goals_unique_owner_type_name
  on public.goals(owner_id, type, lower(trim(name)));

create table public.subscriptions (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'inactive',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger friendships_updated_at before update on public.friendships
for each row execute function public.set_updated_at();
create trigger training_splits_updated_at before update on public.training_splits
for each row execute function public.set_updated_at();
create trigger workout_days_updated_at before update on public.workout_days
for each row execute function public.set_updated_at();
create trigger goals_updated_at before update on public.goals
for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
security definer set search_path = ''
language plpgsql as $$
begin
  insert into public.profiles(id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  insert into public.subscriptions(owner_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.training_splits enable row level security;
alter table public.training_split_days enable row level security;
alter table public.workout_days enable row level security;
alter table public.top_sets enable row level security;
alter table public.cardio_sessions enable row level security;
alter table public.cardio_segments enable row level security;
alter table public.goals enable row level security;
alter table public.subscriptions enable row level security;

create policy "profiles_read_self" on public.profiles for select
using (id = auth.uid());
create policy "profiles_update_self" on public.profiles for update
using (id = auth.uid()) with check (id = auth.uid());

create policy "friendships_read_participant" on public.friendships for select
using (auth.uid() in (requester_id, addressee_id));
create policy "friendships_request_self" on public.friendships for insert
with check (requester_id = auth.uid() and status = 'pending');
create policy "friendships_addressee_respond" on public.friendships for update
using (addressee_id = auth.uid())
with check (addressee_id = auth.uid());
create policy "friendships_participant_delete" on public.friendships for delete
using (auth.uid() in (requester_id, addressee_id));

create policy "splits_owner_all" on public.training_splits for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "split_days_owner_all" on public.training_split_days for all
using (exists (
  select 1 from public.training_splits s where s.id = split_id and s.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.training_splits s where s.id = split_id and s.owner_id = auth.uid()
));

create policy "workout_days_owner_all" on public.workout_days for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "top_sets_owner_all" on public.top_sets for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "cardio_sessions_owner_all" on public.cardio_sessions for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "cardio_segments_owner_all" on public.cardio_segments for all
using (exists (
  select 1 from public.cardio_sessions s where s.id = session_id and s.owner_id = auth.uid()
)) with check (exists (
  select 1 from public.cardio_sessions s where s.id = session_id and s.owner_id = auth.uid()
));
create policy "goals_owner_all" on public.goals for all
using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "subscriptions_read_self" on public.subscriptions for select
using (owner_id = auth.uid());

create or replace function public.search_public_profiles(username_query text)
returns table(id uuid, username citext, display_name text, avatar_url text)
security definer set search_path = ''
language sql stable as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and p.username is not null
    and p.profile_visibility <> 'private'
    and p.username::text ilike trim(username_query) || '%'
  order by p.username
  limit 20;
$$;

revoke all on function public.search_public_profiles(text) from public;
grant execute on function public.search_public_profiles(text) to authenticated;

create or replace function public.replace_my_training_split(split_name text, split_days jsonb)
returns uuid
security invoker
language plpgsql as $$
declare
  new_split_id uuid;
  day_item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(split_name)) not between 1 and 80 then raise exception 'Invalid split name'; end if;

  update public.training_splits set is_active = false
  where owner_id = auth.uid() and is_active;

  insert into public.training_splits(owner_id, name, is_active)
  values(auth.uid(), trim(split_name), true)
  returning id into new_split_id;

  for day_item in select * from jsonb_array_elements(coalesce(split_days, '[]'::jsonb))
  loop
    insert into public.training_split_days(
      split_id, position, name, muscle_groups, goal_lifts, cardio_types
    ) values (
      new_split_id,
      (day_item ->> 'position')::smallint,
      coalesce(day_item ->> 'name', ''),
      coalesce(array(select jsonb_array_elements_text(day_item -> 'muscleGroups')), '{}'),
      coalesce(array(select jsonb_array_elements_text(day_item -> 'goalLifts')), '{}'),
      coalesce(array(select jsonb_array_elements_text(day_item -> 'cardioTypes')), '{}')
    );
  end loop;

  return new_split_id;
end;
$$;

grant execute on function public.replace_my_training_split(text, jsonb) to authenticated;

commit;
