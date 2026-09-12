import { goalFeasibility, weeksUntil } from './goalFeasibility';
import { buildMileageRamp, rampArrival, type MileageRamp } from './mileageRamp';
import type { CreatedGoal } from '../components/GoalBuilder';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';

/* THE DECISION BEHIND THE MILEAGE ALERT, ON ITS OWN SO IT CAN BE TESTED.

   Two ways an endurance goal can be short of running, and they need different
   fixes. Either the athlete's own ceiling forbids the volume the pace is built
   on — in which case nothing they do helps, because the planner may never
   write that number — or the ceiling allows it and the ramp simply starts too
   low to arrive before the date. The first moves the ceiling; the second moves
   the floor, by one safe step from what they already run.

   Either way the answer carries the RAMP: the week-by-week climb from what
   they run now to what the goal needs, and whether it lands before the date.
   "You need 22 miles a week" is a fact. "Twelve weeks at 10% a week gets you
   there, and your race is in nine" is an answer. */

/* A ceiling wants headroom above the target: a ramp that ends exactly on the
   number it needs never spends a week there. */
export const CEILING_HEADROOM = 1.1;
/* The most anyone should add to a weekly floor in one move. */
export const SAFE_STEP = 1.1;
/* Below this share of the needed volume, the ramp is not going to arrive. */
export const ARRIVAL_SHARE = 0.85;

export type MileageBounds = {
  minWeeklyMileage?: number | string;
  maxWeeklyMileage?: number | string;
  /* What the athlete said they run at setup. Stale the week after, which is
     why logged running wins — but it is the only baseline there is for someone
     who has not logged a run yet. */
  weeklyMileage?: number | string;
};
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
  /* The climb from here to there, and whether it lands in time. Only
     meaningful when `hasBaseline` — without one there is nothing to climb from
     and the card asks for a logged week instead of inventing a starting point. */
  ramp: MileageRamp;
  hasBaseline: boolean;
  /* Whether there is anything to climb. An athlete already running the volume
     whose ceiling forbids it has no ramp to build — the setting is the whole
     problem, and a chart from 26 to 26 is noise. */
  climbNeeded: boolean;
  weeksAvailable: number;
  arrives: boolean;
  /* The volume the ramp starts from — logged running, or what they stated. */
  base: number;
  /* What the ramp reaches by the goal date when it does not arrive. */
  reached: number;
  weeksShort: number;
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

  /* THE RAMP STARTS FROM SOMETHING REAL OR IT DOES NOT START.

     Logged running first, then what they said at setup, then the floor they
     set themselves. With none of those the honest answer is that Forge does
     not know where they are: drawing "1 mile → 22 miles, 52 weeks" off an
     empty history is a number invented to fill a card. */
  const base = Math.max(running, Number(bounds.weeklyMileage) || 0, floor, 0);
  const hasBaseline = base > 0;
  const dated = goals.find(goal => goal.title === blocked.goal);
  const weeksAvailable = dated?.date ? Math.floor(weeksUntil(dated.date)) : 0;
  const ramp = buildMileageRamp(base, needed, weeksAvailable);
  const arrival = rampArrival(ramp, weeksAvailable);
  const shared = { goal: blocked.goal, needed, running, ceiling, floor, ramp, weeksAvailable, hasBaseline,
    climbNeeded: hasBaseline && ramp.weeksToTarget > 0, base, ...arrival };

  if (ceiling && ceiling < needed) {
    return { kind: 'ceiling', ...shared, target: Math.ceil(needed * CEILING_HEADROOM) };
  }
  /* Permission is there; the ramp is starting too low to arrive. Never propose
     a floor above the ceiling, or one that is not actually an increase. */
  if (running > 0 && running < needed * ARRIVAL_SHARE) {
    const step = Math.max(Math.ceil(running * SAFE_STEP), running + 1);
    const target = ceiling ? Math.min(step, ceiling) : step;
    if (target <= floor || target <= running) return null;
    return { kind: 'floor', ...shared, target };
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

/* ACCEPTING THE WHOLE RAMP, not just the next step: the ceiling goes to what
   the goal needs and the floor to the ramp's first week, so the planner both
   may and must climb. This is the "build me a plan to get there" answer. */
export const applyMileageRamp = <T extends MileageBounds>(setup: T, gap: MileageGap): T => ({
  ...setup,
  maxWeeklyMileage: Math.max(Math.ceil(gap.needed * CEILING_HEADROOM), Number(setup.maxWeeklyMileage) || 0),
  minWeeklyMileage: Math.round(gap.ramp.weeks[0]?.miles || gap.ramp.from),
});
