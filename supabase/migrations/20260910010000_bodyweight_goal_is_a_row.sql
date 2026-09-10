/* TWO GOAL STORES, AND ONE GOAL IN THE WRONG ONE.  Applied 2026-09-10.

   Preston has seven goals. Six lived in public.goals; the seventh — his
   200 lb body-weight goal — lived only in athlete_settings.goals, because the
   table was built for lifts and races and nobody went back for it when body
   composition arrived. That one difference is why it was invisible to every
   server-side function, why the Goals page only drew it after a second round
   trip that could fail on its own, and why a read of his account concluded he
   had no body-composition goal at all.

   The goal_type enum has carried a 'bodyweight' value since the table was
   created and nothing ever wrote one. This moves the existing goals across;
   the client writes them there from now on and keeps the athlete_settings copy
   so an older build on another device does not lose it. */

insert into public.goals (owner_id, type, name, target_value, muscle_group, target_date)
select s.owner_id, 'bodyweight'::goal_type,
       coalesce(nullif(trim(g->>'metric'), ''), 'Body weight'),
       nullif(regexp_replace(g->>'target', '[^0-9.]', '', 'g'), '')::numeric,
       null,
       nullif(g->>'date','')::date
from public.athlete_settings s,
  lateral jsonb_array_elements(coalesce(s.goals, '[]'::jsonb)) g
where g->>'type' = 'Body Composition'
  and nullif(regexp_replace(g->>'target', '[^0-9.]', '', 'g'), '') is not null
on conflict (owner_id, type, lower(trim(name))) do nothing;
