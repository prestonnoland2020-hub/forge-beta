/* FORGE VOICE. The Guided coach's cloud speech-to-text is metered like the
   other AI endpoints. Clips are one to three seconds and cost a fraction of a
   cent each, so the allowance is generous: a long workout is ~150 clips.
   An endpoint with no row here is closed (see consume_ai_quota), so this row
   is what turns forge-voice on. */
insert into public.ai_quota_limits(tier, endpoint, daily_limit, monthly_limit) values
  ('free', 'forge-voice', 200, 1500),
  ('pro',  'forge-voice', 800, 12000)
on conflict (tier, endpoint) do update
  set daily_limit = excluded.daily_limit, monthly_limit = excluded.monthly_limit;
