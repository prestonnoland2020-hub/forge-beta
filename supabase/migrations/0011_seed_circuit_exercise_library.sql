begin;

alter table public.exercise_library
  add column if not exists default_target text,
  add column if not exists default_unit text;

create or replace function public.seed_circuit_exercise_library(target_owner uuid)
returns void
security definer
set search_path = public
language sql
as $$
  insert into public.exercise_library (owner_id, name, kind, muscle_groups, detail, enabled, default_target, default_unit)
  values
    (target_owner, 'Run', 'Cardio', array['Quads','Hamstrings','Glutes','Cardio'], 'Run · distance', true, '400', 'meters'),
    (target_owner, 'Rowing', 'Cardio', array['Back','Quads','Hamstrings','Glutes','Cardio'], 'Rower · distance', true, '500', 'meters'),
    (target_owner, 'SkiErg', 'Cardio', array['Back','Shoulders','Abs','Cardio'], 'HYROX · distance', true, '500', 'meters'),
    (target_owner, 'Sled Push', 'Strength', array['Quads','Glutes','Hamstrings'], 'HYROX · distance', true, '25', 'meters'),
    (target_owner, 'Sled Pull', 'Strength', array['Back','Biceps','Quads','Glutes'], 'HYROX · distance', true, '25', 'meters'),
    (target_owner, 'Burpee Broad Jumps', 'Strength', array['Chest','Shoulders','Quads','Glutes','Abs'], 'HYROX · distance', true, '20', 'meters'),
    (target_owner, 'Farmers Carry', 'Strength', array['Forearms','Back','Quads','Glutes','Abs'], 'HYROX · distance', true, '50', 'meters'),
    (target_owner, 'Sandbag Lunges', 'Strength', array['Quads','Glutes','Hamstrings'], 'HYROX · distance', true, '25', 'meters'),
    (target_owner, 'Wall Balls', 'Strength', array['Quads','Glutes','Shoulders','Triceps'], 'HYROX · repetitions', true, '25', 'reps'),
    (target_owner, 'Assault Bike', 'Cardio', array['Quads','Glutes','Hamstrings','Cardio'], 'CrossFit · calories', true, '20', 'calories'),
    (target_owner, 'Box Jumps', 'Strength', array['Quads','Glutes','Hamstrings'], 'CrossFit · repetitions', true, '15', 'reps'),
    (target_owner, 'Kettlebell Swings', 'Strength', array['Glutes','Hamstrings','Back','Shoulders'], 'CrossFit · repetitions', true, '20', 'reps'),
    (target_owner, 'Deadlift', 'Strength', array['Back','Glutes','Hamstrings'], 'CrossFit · weight + reps', true, '10', 'reps'),
    (target_owner, 'Thrusters', 'Strength', array['Quads','Glutes','Shoulders','Triceps'], 'CrossFit · repetitions', true, '12', 'reps'),
    (target_owner, 'Pull Ups', 'Strength', array['Back','Biceps','Forearms'], 'CrossFit · repetitions', true, '10', 'reps'),
    (target_owner, 'Toes to Bar', 'Strength', array['Abs','Forearms','Shoulders'], 'CrossFit · repetitions', true, '10', 'reps'),
    (target_owner, 'Handstand Push Ups', 'Strength', array['Shoulders','Triceps','Abs'], 'CrossFit · repetitions', true, '10', 'reps'),
    (target_owner, 'Double Unders', 'Cardio', array['Quads','Glutes','Cardio'], 'CrossFit · repetitions', true, '50', 'reps'),
    (target_owner, 'Rope Climbs', 'Strength', array['Back','Biceps','Forearms','Abs'], 'CrossFit · repetitions', true, '3', 'reps'),
    (target_owner, 'Clean and Jerk', 'Strength', array['Quads','Glutes','Hamstrings','Shoulders','Triceps'], 'CrossFit · weight + reps', true, '8', 'reps'),
    (target_owner, 'Snatch', 'Strength', array['Quads','Glutes','Hamstrings','Shoulders','Back'], 'CrossFit · weight + reps', true, '8', 'reps'),
    (target_owner, 'Push Ups', 'Strength', array['Chest','Shoulders','Triceps','Abs'], 'CrossFit · repetitions', true, '15', 'reps')
  on conflict (owner_id, name) do nothing;
$$;

create or replace function public.seed_new_profile_circuit_library()
returns trigger
security definer
set search_path = public
language plpgsql
as $$
begin
  perform public.seed_circuit_exercise_library(new.id);
  return new;
end;
$$;

drop trigger if exists profile_seed_circuit_exercise_library on public.profiles;
create trigger profile_seed_circuit_exercise_library
  after insert on public.profiles
  for each row execute function public.seed_new_profile_circuit_library();

revoke all on function public.seed_circuit_exercise_library(uuid) from public, anon, authenticated;
revoke all on function public.seed_new_profile_circuit_library() from public, anon, authenticated;

commit;
