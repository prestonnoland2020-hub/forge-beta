-- Cardio prescriptions and completed actuals stay separate. This migration
-- makes recoveries first-class segments instead of hiding them in rest_seconds.
alter table public.cardio_sessions
  add column if not exists structure text not null default 'steady',
  add column if not exists prescription_snapshot jsonb,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists captured_timezone text;

alter table public.cardio_sessions drop constraint if exists cardio_structure_valid;
alter table public.cardio_sessions add constraint cardio_structure_valid
  check (structure in ('steady','intervals','circuit','custom'));

alter table public.cardio_segments
  add column if not exists segment_role text not null default 'work',
  add column if not exists repeat_index smallint,
  add column if not exists round_index smallint,
  add column if not exists planned_segment_id uuid,
  add column if not exists recovery_kind text,
  add column if not exists completion_state text not null default 'completed',
  add column if not exists entry_source text not null default 'manual',
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists external_workout_id text,
  add column if not exists external_sample_id text,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

alter table public.cardio_segments drop constraint if exists cardio_segment_role_valid;
alter table public.cardio_segments add constraint cardio_segment_role_valid
  check (segment_role in ('warmup','work','recovery','cooldown','station','rest'));
alter table public.cardio_segments drop constraint if exists cardio_completion_state_valid;
alter table public.cardio_segments add constraint cardio_completion_state_valid
  check (completion_state in ('planned','completed','partial','skipped'));
alter table public.cardio_segments drop constraint if exists cardio_entry_source_valid;
alter table public.cardio_segments add constraint cardio_entry_source_valid
  check (entry_source in ('manual','wearable','imported'));

create index if not exists cardio_segments_session_role_repeat
  on public.cardio_segments(session_id,segment_role,repeat_index,round_index,position);

create unique index if not exists cardio_external_sample_guard
  on public.cardio_segments(session_id,entry_source,external_workout_id,external_sample_id)
  where external_sample_id is not null;
