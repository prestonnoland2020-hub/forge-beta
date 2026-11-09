/* FORGE SPEAK. The Guided coach's natural voice: one call per spoken line the
   device has not heard before (lines are cached on the device). A workout is
   roughly 40–80 lines, most repeated across workouts. */
insert into public.ai_quota_limits(tier, endpoint, daily_limit, monthly_limit) values
  ('free', 'forge-speak', 300, 2500),
  ('pro',  'forge-speak', 1200, 20000)
on conflict (tier, endpoint) do update
  set daily_limit = excluded.daily_limit, monthly_limit = excluded.monthly_limit;
