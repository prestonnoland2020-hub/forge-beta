import type { GoalPrediction } from './goalFeasibility';

/* THE PROJECTION STARTS FROM THE NUMBER ON THE CARD.

   Preston's 5K card read "20:41 tested -> 18:59 goal, 92%" and, directly under
   it, "Projected by Dec 31: 16:41 -- Reached, already there". The card was in
   Actual mode and showed a time he had run; the projection was always built
   from the estimate (about 17:24), so it claimed a goal he had not reached
   and a four-minute drop in seven weeks.

   The model's curves are relative (a share per week), so the same curve is
   carried from whatever number the card is showing: the estimate in
   Estimated mode, the time actually run in Actual mode. */
export function predictionFromNow(p: GoalPrediction, now: number | null | undefined): GoalPrediction {
  if (!now || !p.start || now === p.start) return p;
  const scale = now / p.start;
  return { ...p, start: Math.round(now), typical: Math.round(p.typical * scale), ceiling: Math.round(p.ceiling * scale) };
}

export const predictionReaches = (p: GoalPrediction, value: number) => p.better === 'lower' ? value <= p.target : value >= p.target;

/* What the projection says about the goal, for the pill on the card face, so
   the pill and the projection under it cannot disagree. */
export function predictionTone(p: GoalPrediction): 'reached' | 'on-track' | 'needs-work' | 'off-track' {
  if (predictionReaches(p, p.start)) return 'reached';
  if (predictionReaches(p, p.typical)) return 'on-track';
  if (predictionReaches(p, p.ceiling)) return 'needs-work';
  return 'off-track';
}
