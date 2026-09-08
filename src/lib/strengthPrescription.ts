import { WAVE_REPS, waveSlot, wavePrescription } from '../features/training/aiPlanService';
import { calculateEstimatedOneRepMax } from './strength';

/* THIS FILE IS AN ADAPTER, NOT A PROGRAM. It used to run its own sequence —
   6 → 8 → 4, a readiness gate that could grant a tested single to any lift,
   and `Math.round` where the canonical loader uses `ceil` — so two screens
   built from the same history disagreed by five pounds and by a rep. Forge
   has ONE strength program, the 8/6/4/2/1 wave in aiPlanService. Everything
   here defers to it and only reshapes the result for its older callers. */
export const TOP_SET_SEQUENCE = WAVE_REPS;
export type TopSetStage = { reps: number; label: string; weight: number; calculatedMax: number; targetCalculatedMax: number; percentOfGoal: number; isTest: boolean; rationale: string };

export function prescribeTopSet({ baselineMax, goalMax, weekIndex, readiness = 100, highFatigue = false, allowTest = false, bestSingle = 0, metric = false, anchors }: {
  baselineMax: number; goalMax?: number; weekIndex: number; progress?: number;
  readiness?: number; highFatigue?: boolean; allowTest?: boolean; bestSingle?: number; metric?: boolean;
  /* THE ATHLETE'S OWN SETS, BY REP COUNT — the same evidence the Plan tab
     writes from. Without them this divided a single estimated max back down
     the curve, and the estimate it divided was the athlete's highest, which
     for anyone with one high-rep set is their least reliable. Adam's best
     double is 255; a 225 x 10 estimates 300, and the logger opened on
     295 x 2 — forty pounds past anything he had done, on the same day the
     Plan tab said 260. Passing anchors makes the two agree, and makes both
     answer to his actual sets. */
  anchors?: Map<number, number>;
}): TopSetStage {
  /* `allowTest` is now the ONLY gate, and its callers pass the goal-lift
     answer from `testsOneRepMax`. Readiness can reduce a load; it can never
     grant or withhold a max attempt, because the rule is about goals. */
  const wave = wavePrescription(baselineMax, weekIndex, metric, bestSingle, allowTest, anchors);
  const recovering = readiness < 65 || highFatigue;
  /* A recovery safeguard trims the load. It does not rewrite the rep target,
     and it never converts a max week into something else — the athlete simply
     sees a lighter bar on the same slot. */
  const weight = recovering ? Math.max(5, Math.round(wave.weight * 0.94 / 5) * 5) : wave.weight;
  const calculatedMax = calculateEstimatedOneRepMax(weight, wave.reps) || 0;
  const label = wave.isMax ? 'MAX' : String(wave.reps);
  const slot = waveSlot(weekIndex);
  const rationale = wave.isMax
    ? 'Max week: a tested single, because this lift carries a Real 1RM goal that only a logged single can move.'
    : slot.isMax
      ? 'Max week, but no Real 1RM goal on this lift — it holds the heavy double instead of spending a testing session it does not owe.'
      : `${wave.reps}-rep slot of the 8/6/4/2/1 wave, ${anchors?.size ? 'loaded from your own sets nearest this rep count' : 'loaded backward from the current calculated max'}.${recovering ? ' Recovery safeguard trimmed the load.' : ''}`;
  return { reps: wave.reps, label, weight, calculatedMax, targetCalculatedMax: baselineMax, percentOfGoal: goalMax ? Math.round(calculatedMax / goalMax * 100) : 100, isTest: wave.isMax, rationale };
}
