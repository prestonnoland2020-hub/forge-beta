import { goalFeasibility } from './goalFeasibility';
import type { CreatedGoal } from '../components/GoalBuilder';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';

/* THE DECISION BEHIND THE MILEAGE ALERT, ON ITS OWN SO IT CAN BE TESTED.

   Two ways an endurance goal can be short of running, and they need different
   fixes. Either the athlete's own ceiling forbids the volume the pace is built
   on — in which case nothing they do helps, because the planner may never
   write that number — or the ceiling allows it and the ramp simply starts too
   low to arrive before the date. The first moves the ceiling; the second moves
   the floor, by one safe step from what they already run. */

/* A ceiling wants headroom above the target: a ramp that ends exactly on the
   number it needs never spends a week there. */
export const CEILING_HEADROOM = 1.1;
/* The most anyone should add to a weekly floor in one move. */
export const SAFE_STEP = 1.1;
/* Below this share of the needed volume, the ramp is not going to arrive. */
export const ARRIVAL_SHARE = 0.85;

export type MileageBounds = { minWeeklyMileage?: number | string; maxWeeklyMileage?: number | string };
export type MileageGap = {
  kind: 'ceiling' | 'floor';
  goal: string;
  /* Weekly miles the goal pace is normally built on. */
  needed: number;
  /* What they are actually running now. */
  running: number;
  ceiling: number;
  floor: number;
  /* What the offered change would set. */
  target: number;
};

export function mileageGap(goals: CreatedGoal[], records: WorkoutRecord[], bounds: MileageBounds | null): MileageGap | null {
  if (!bounds) return null;
  const ceiling = Number(bounds.maxWeeklyMileage) || 0;
  const floor = Number(bounds.minWeeklyMileage) || 0;
  /* The hungriest goal wins: the volume that serves it serves the rest, and
     two alerts about one setting is one too many. */
  const blocked = goalFeasibility(goals, records, { maxWeeklyMileage: ceiling })
    .filter(verdict => verdict.verdict !== 'reachable' && (verdict.needs?.weeklyMiles || 0) > 0)
    .sort((a, b) => b.needs!.weeklyMiles - a.needs!.weeklyMiles)[0];
  if (!blocked?.needs) return null;
  const { weeklyMiles: needed, running } = blocked.needs;

  if (ceiling && ceiling < needed) {
    return { kind: 'ceiling', goal: blocked.goal, needed, running, ceiling, floor, target: Math.ceil(needed * CEILING_HEADROOM) };
  }
  /* Permission is there; the ramp is starting too low to arrive. Never propose
     a floor above the ceiling, or one that is not actually an increase. */
  if (running > 0 && running < needed * ARRIVAL_SHARE) {
    const step = Math.max(Math.ceil(running * SAFE_STEP), running + 1);
    const target = ceiling ? Math.min(step, ceiling) : step;
    if (target <= floor || target <= running) return null;
    return { kind: 'floor', goal: blocked.goal, needed, running, ceiling, floor, target };
  }
  return null;
}

/* What the accepted change writes back. Kept beside the decision so the two
   cannot drift: a raised ceiling never leaves the floor stranded above it. */
export const applyMileageGap = <T extends MileageBounds>(setup: T, gap: MileageGap): T =>
  gap.kind === 'ceiling'
    /* The floor is read off the setup being written, not off the gap that was
       computed earlier — a stale floor is how a ceiling ends up underneath the
       minimum it is supposed to bound. */
    ? { ...setup, maxWeeklyMileage: gap.target, minWeeklyMileage: Math.min(Number(setup.minWeeklyMileage) || 0, gap.target) }
    : { ...setup, minWeeklyMileage: gap.target };
