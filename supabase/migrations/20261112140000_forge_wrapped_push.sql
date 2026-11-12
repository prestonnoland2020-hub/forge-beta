/* FORGE WRAPPED IS OUT: Jan 1, 9 am in each athlete's own timezone. Hourly
   all year; forge-push does nothing unless it is Jan 1, 9 am somewhere a
   subscriber lives, and tells each athlete once (push log). */
select cron.schedule('forge-wrapped-push', '7 * * * *', $cron$ select private.forge_send_push('{"kind":"wrapped"}'::jsonb) $cron$);
