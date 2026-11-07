/* Garmin's daily VO2 max estimate (Health API "User Metrics"), blended into
   the race predictions when the athlete's hard efforts are old. */
alter table public.health_daily_snapshots add column if not exists vo2_max numeric;
