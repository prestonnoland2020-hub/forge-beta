-- A WATCH RUN SURVIVES A SAVE THAT DID NOT MENTION IT
-- (migration 20261108230000_keep_synced_cardio). Run by tools/db-test.sh.
\set ON_ERROR_STOP 1
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000c4d1') on conflict do nothing;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c4d1';
set request.jwt.claim.role = 'authenticated';

-- 1. The day with a Garmin run and a hand-logged session.
select public.save_my_training_day('{"date":"2026-11-08","title":"Legs","muscles":["Quads","Cardio"],
  "topSets":[],
  "cardioSessions":[{"id":"garmin-25000999","activity":"Run","summary":"Run · 2.01 mi","structure":"steady"},
                    {"id":"hand-1","activity":"Bike","summary":"Bike · 10 min","structure":"steady"}]}'::jsonb) is not null as saved;

-- 2. A stale copy of the day, written back with no cardio at all.
select public.save_my_training_day('{"date":"2026-11-08","title":"Legs","muscles":["Quads"],
  "topSets":[],"cardioSessions":[]}'::jsonb) is not null as stale_save;
select case when count(*) filter (where client_key='garmin-25000999')=1 and count(*) filter (where client_key='hand-1')=0
  then 'PASS  a stale save keeps the Garmin run and replaces hand-logged cardio as before'
  else 'FAIL  stale save left: '||coalesce(string_agg(coalesce(client_key,'?'),','),'no cardio at all — the run was deleted') end
from public.cardio_sessions where owner_id=auth.uid() and performed_on='2026-11-08';

-- 3. A save that lists the run again does not duplicate it.
select public.save_my_training_day('{"date":"2026-11-08","title":"Legs","muscles":["Quads","Cardio"],"topSets":[],
  "cardioSessions":[{"id":"garmin-25000999","activity":"Run","summary":"Run · 2.01 mi · described","structure":"intervals"}]}'::jsonb) is not null as relisted;
select case when count(*)=1 and max(summary) like '%described' then 'PASS  re-listing the run updates it, no duplicate'
  else 'FAIL  relist: '||count(*)::text end
from public.cardio_sessions where owner_id=auth.uid() and client_key='garmin-25000999';

-- 4. Deleted on purpose: named in removedCardioIds, it goes.
select public.save_my_training_day('{"date":"2026-11-08","title":"Legs","muscles":["Quads"],"topSets":[],
  "cardioSessions":[],"removedCardioIds":["garmin-25000999"]}'::jsonb) is not null as removed;
select case when count(*)=0 then 'PASS  a run the athlete deleted is deleted'
  else 'FAIL  removal kept '||count(*)::text end
from public.cardio_sessions where owner_id=auth.uid() and client_key='garmin-25000999';
