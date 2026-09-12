/* A MILEAGE GOAL IS A PLAN, NOT A NUMBER.

   Telling an athlete "this pace is built on 22 miles a week" when they run 13
   is a fact, not help. The useful answer is the ramp: what this week is, what
   next week is, how many weeks it takes to arrive, and — the part Forge kept
   quiet about — whether that is before or after the date they picked.

   The shape is the one every coach uses. Build weeks add 10%; every fourth
   week backs off to 80% and the build resumes from where it left, not from the
   deload. Nothing here changes training on its own: it is arithmetic the
   MileageGate shows before the athlete agrees to any of it. */

export const STEP_RATE = 0.1;
export const DELOAD_EVERY = 4;
export const DELOAD_SHARE = 0.8;
/* A ramp longer than this is not a ramp, it is a different goal. */
export const MAX_RAMP_WEEKS = 52;

export type RampWeek = { week: number; miles: number; deload: boolean };
export type MileageRamp = {
  weeks: RampWeek[];
  /* Weeks of building before the target volume is first reached. */
  weeksToTarget: number;
  /* The volume it starts from and the one it is climbing to. */
  from: number;
  to: number;
};

const round = (miles: number) => Math.round(miles * 2) / 2;

/* The week-by-week climb from what they run now to what the goal needs. */
export function buildMileageRamp(from: number, to: number, weeksWanted = 0): MileageRamp {
  const start = Math.max(1, round(from));
  const target = round(to);
  if (target <= start) {
    const weeks = Array.from({ length: Math.max(1, weeksWanted) }, (_, index) => ({ week: index + 1, miles: start, deload: false }));
    return { weeks, weeksToTarget: 0, from: start, to: start };
  }
  const weeks: RampWeek[] = [];
  /* `build` is the level the ramp has actually reached. A deload week is drawn
     below it and does NOT become the base for the next step — otherwise every
     back-off week permanently costs the athlete the progress it was meant to
     protect. */
  let build = start;
  let weeksToTarget = 0;
  for (let index = 0; index < MAX_RAMP_WEEKS; index += 1) {
    const isDeload = (index + 1) % DELOAD_EVERY === 0 && build < target;
    if (isDeload) {
      weeks.push({ week: index + 1, miles: round(build * DELOAD_SHARE), deload: true });
    } else {
      if (index > 0 && build < target) build = Math.min(target, round(build * (1 + STEP_RATE)));
      weeks.push({ week: index + 1, miles: build, deload: false });
      if (!weeksToTarget && build >= target) weeksToTarget = index + 1;
    }
    if (weeksToTarget && weeks.length >= Math.max(weeksToTarget, weeksWanted)) break;
  }
  return { weeks, weeksToTarget: weeksToTarget || weeks.length, from: start, to: target };
}

/* Whether the ramp lands before the date the athlete picked, and what it
   reaches if it does not. The honest version of "you have twelve weeks". */
export function rampArrival(ramp: MileageRamp, weeksAvailable: number): { arrives: boolean; reached: number; weeksShort: number } {
  const available = Math.max(0, Math.floor(weeksAvailable));
  if (ramp.weeksToTarget <= available) return { arrives: true, reached: ramp.to, weeksShort: 0 };
  const last = ramp.weeks[Math.max(0, Math.min(ramp.weeks.length, available) - 1)];
  return { arrives: false, reached: last ? last.miles : ramp.from, weeksShort: ramp.weeksToTarget - available };
}
