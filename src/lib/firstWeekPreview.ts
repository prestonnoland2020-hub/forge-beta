import { calculateEstimatedOneRepMax } from './strength';
import { wavePrescription, isRestDay } from '../features/training/aiPlanService';

/* SHOW THEM THE PLAN BEFORE THEY FINISH SETTING IT UP.

   Setup asked for a name, a focus, a goal and a day map, and then dropped the
   athlete onto a home screen. Everything they had just typed became a plan
   somewhere out of sight, so the last screen of setup was the only one that
   never showed them what any of it was for — and the first thing they saw was
   a block they had no part in and no reason to trust.

   This is week one, computed from exactly what they entered, on the last step.
   It is deliberately the REAL derivation — the same wavePrescription the block
   uses, the same 8-rep opening week — because a mock-up that flatters the
   numbers is worse than no preview at all: they would meet the real ones on
   Monday and wonder which was lying.

   A lift with no baseline shows no load. That is honest and it is also the
   argument for entering one: the preview fills in as they type. */

export type PreviewBaseline = Record<string, { weight: number; reps: number }>;
export type PreviewDayInput = { name: string; type: string; muscles?: string[]; exercises?: string[] };

export type PreviewDay = {
  name: string;
  kind: 'lift' | 'run' | 'rest';
  /* The day's headline top set, when a baseline supports one. */
  lift?: { exercise: string; weight: number; reps: number };
  /* What the athlete has not told Forge yet, named rather than hidden. */
  unknownLift?: string;
  run?: string;
};

/* HOW A WEEK'S MILES ARE SPLIT, and it is the same shape the block uses: one
   long run at about a third of the week, the rest easy and even. Precise to
   the tenth is false precision on a number they just guessed, so it rounds. */
export const LONG_RUN_SHARE = 0.32;

export function firstWeekPreview(input: {
  days: PreviewDayInput[];
  baseline: PreviewBaseline;
  weeklyMiles: number;
  unit: 'lb' | 'kg';
}): PreviewDay[] {
  const { days, baseline, weeklyMiles } = input;
  const runDays = days.filter(day => !isRestDay(day) && /cardio|mixed/i.test(day.type)).length;
  const long = weeklyMiles > 0 && runDays > 0 ? Math.max(1, Math.round(weeklyMiles * LONG_RUN_SHARE)) : 0;
  const easyEach = weeklyMiles > 0 && runDays > 1 ? Math.max(1, Math.round((weeklyMiles - long) / (runDays - 1))) : 0;
  let runsSeen = 0;

  return days.map(day => {
    if (isRestDay(day)) return { name: day.name, kind: 'rest' as const };
    const isRun = /cardio|mixed/i.test(day.type);
    const lifts = day.exercises || [];
    /* The day's headline is its first named movement — the same rule the plan
       uses when no goal lift is on the day. */
    const headline = lifts[0];
    const evidence = headline ? baseline[headline] : undefined;
    const best = evidence && evidence.weight > 0 && evidence.reps > 0
      ? calculateEstimatedOneRepMax(evidence.weight, evidence.reps) || 0 : 0;
    /* Week one of the wave is eight reps — the lightest loads, the most reps —
       so the preview is the gentlest week of the block and cannot read as a
       threat. Written with the real function, not a percentage. */
    const set = best > 0 ? wavePrescription(best, 0, { metric: input.unit === 'kg' }) : null;

    const run = isRun && weeklyMiles > 0
      ? (() => {
          const miles = runsSeen === 0 ? long : easyEach;
          runsSeen += 1;
          return miles > 0 ? `${runsSeen === 1 ? 'Long run' : 'Easy run'} ${miles} mi` : '';
        })()
      : '';

    if (!lifts.length && isRun) return { name: day.name, kind: 'run' as const, run: run || 'Easy run' };
    return {
      name: day.name,
      kind: isRun && !lifts.length ? ('run' as const) : ('lift' as const),
      lift: set && headline ? { exercise: headline, weight: set.weight, reps: set.reps } : undefined,
      unknownLift: set ? undefined : headline,
      run: run || undefined,
    };
  });
}
