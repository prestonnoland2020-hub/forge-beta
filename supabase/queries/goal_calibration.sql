-- HOW WELL FORGE'S GOAL PREDICTIONS HELD UP.
--
-- Run as the project owner (it reads every athlete's rows). Each row of
-- goal_predictions is what Forge said when a goal was first judged; scored
-- rows also hold what the athlete actually reached by the goal date.
--
-- What good looks like:
--   • "Realistic" (target within the typical curve) is hit roughly half the
--     time or more — the typical curve is the median athlete.
--   • The ceiling is beaten rarely (under ~10%).
--   • "Too steep" goals are seldom reached.
-- If not, change the rates in src/lib/goalFeasibility.ts and bump
-- GOAL_MODEL_VERSION so new predictions are scored separately.
with scored as (
  select *,
    case when better = 'higher' then target <= typical else target >= typical end as within_typical,
    case when better = 'higher' then target <= ceiling else target >= ceiling end as within_ceiling,
    case when better = 'higher' then outcome_value > ceiling else outcome_value < ceiling end as beat_ceiling,
    case when better = 'higher' then outcome_value >= typical else outcome_value <= typical end as reached_typical
  from public.goal_predictions
  where scored_at is not null
)
select model_version,
  goal_type,
  case when within_typical then 'Realistic' when within_ceiling then 'Ambitious' else 'Too steep' end as shown_as,
  count(*) as goals,
  count(distinct owner_id) as athletes,
  round(100.0 * avg(reached::int), 0) as reached_goal_pct,
  round(100.0 * avg(reached_typical::int), 0) as reached_typical_pct,
  round(100.0 * avg(beat_ceiling::int), 0) as beat_ceiling_pct
from scored
group by 1, 2, 3
order by 1, 2, 3;
