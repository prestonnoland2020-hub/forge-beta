/* A WATCH RUN GOES STRAIGHT INTO THE LOG.

   Synced activities became training-log entries only inside the app, when it
   was opened. Adam's 20-mile run reached Forge from his Garmin at 10:54 and
   was missing from his log and from his partners' Partners screen until he
   opened Forge again. The Garmin webhook now calls this for a fresh distance
   activity, with the session already mapped exactly as the app maps it
   (supabase/functions/_shared/activitySession.ts).

   Deliberately narrow — anything the app is better placed to judge is left
   to the app:
   - a day that already has an entry (the app merges a run into a hand-logged
     day, fills blanks from the watch, keeps the athlete's own numbers),
   - a run whose twin from the other source is already in the log,
   - a session the log already holds.
   The row is marked imported once it is in, so the app's import skips it. */
create or replace function public.forge_server_import_activity(
  p_owner uuid, p_provider text, p_external_id text, p_date date, p_title text, p_session jsonb
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ext public.external_activities%rowtype;
  day_id uuid;
  key text := p_session ->> 'id';
begin
  select * into ext from public.external_activities
  where owner_id = p_owner and provider = p_provider and external_id = p_external_id;
  if not found then return 'missing'; end if;
  if ext.imported_to_workout then return 'already'; end if;
  if key is null or key !~ '^(garmin|strava|garmin-export)-' then return 'bad-session'; end if;

  if exists (select 1 from public.cardio_sessions where owner_id = p_owner and client_key = key) then
    update public.external_activities set imported_to_workout = true where id = ext.id;
    return 'present';
  end if;
  if exists (
    select 1 from public.external_activities twin
    where twin.owner_id = p_owner and twin.provider <> ext.provider and twin.imported_to_workout
      and abs(extract(epoch from twin.started_at - ext.started_at)) <= 300
  ) then
    update public.external_activities set imported_to_workout = true where id = ext.id;
    return 'twin';
  end if;
  if exists (select 1 from public.workout_days where owner_id = p_owner and workout_date = p_date) then
    return 'day-has-entry';
  end if;

  insert into public.workout_days (owner_id, workout_date, title, muscle_groups, notes, source, source_record_id, advanced_split)
  values (p_owner, p_date, coalesce(nullif(trim(p_title), ''), 'Run'), '{Cardio}', '', 'app', key, false)
  on conflict (owner_id, workout_date) do nothing
  returning id into day_id;
  if day_id is null then return 'day-has-entry'; end if;

  insert into public.cardio_sessions (owner_id, workout_day_id, performed_on, structure, activity, summary, notes, prescription_snapshot, completed_at, client_key)
  values (p_owner, day_id, p_date, coalesce(p_session ->> 'structure', 'steady'), coalesce(p_session ->> 'activity', 'Run'),
          coalesce(p_session ->> 'summary', ''), '', p_session, now(), key);

  update public.external_activities set imported_to_workout = true where id = ext.id;
  return 'imported';
end;
$$;

revoke all on function public.forge_server_import_activity(uuid, text, text, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.forge_server_import_activity(uuid, text, text, date, text, jsonb) to service_role;
