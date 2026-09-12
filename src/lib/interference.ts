/* WHERE THE LIFTING AND THE RUNNING COLLIDE.

   This is the part no running app has to think about and no lifting app has
   to think about, which is exactly why it is the part Forge has to get right.
   Two plans printed on one screen is not a combined plan. Until something
   reconciles them, the athlete gets a squat max week and the hardest running
   week of the block in the same seven days, a heavy lower day the evening
   before a twelve-mile long run, and two deloads that never line up — each
   decision defensible on its own and the sum of them unsurvivable.

   The reconciliation is not complicated. It is three facts about a human body:

     1. HEAVY LEGS AND HARD RUNNING DO NOT SHARE A DAY, or the day either side
        of one. Concurrent-training interference is real and it is mostly about
        proximity; the same two sessions 48 hours apart cost almost nothing.

     2. ONE PEAK AT A TIME. A max single and a race-effort week are both
        all-out. Whichever the athlete's nearest goal is, that one owns the
        week and the other one steps back to maintenance. It does not
        disappear — backing off is not the same as skipping.

     3. THE DELOADS ARE THE SAME DELOAD. A lifting wave that cuts on its 2-rep
        week and a mileage ramp that cuts on a different week means the athlete
        never actually gets a light week; they get two medium ones.

   Everything here returns a DECISION and a REASON. The reason is shown to the
   athlete, because "your long run moved to Sunday" is an instruction and "your
   long run moved to Sunday — you squat heavy on Friday" is coaching. */

export type HardRunKind = 'threshold' | 'intervals' | 'reps' | 'racepace' | 'test';

/* A day of the athlete's week, as far as this file is concerned. */
export type PlannedDay = {
  name: string;
  /* Position in the cycle, so "the day before" is answerable. */
  index: number;
  lowerBody: boolean;
  rest: boolean;
  /* Whether this day carries a max attempt. */
  maxAttempt?: boolean;
};

/* Hours, expressed in days of the split, that must sit between heavy legs and
   a hard run. One clear day either side — a Friday squat and a Sunday long run
   are fine; Friday and Saturday are not. */
export const SEPARATION_DAYS = 1;

export const near = (a: number, b: number, cycleLength: number, span = SEPARATION_DAYS) => {
  const raw = Math.abs(a - b);
  const distance = Math.min(raw, cycleLength - raw);
  return distance <= span;
};

/* WHICH DAY THE HARD RUN GOES ON. Not "any day that is not a leg day" — the
   day furthest from the athlete's heavy lifting, which is a different and
   better answer whenever the split has no clean day at all. Returns -1 when
   there is genuinely nowhere, and the caller decides what to do about it. */
export function bestRunDay(days: PlannedDay[], taken: number[] = []): number {
  const cycle = days.length;
  if (!cycle) return -1;
  const heavy = days.filter(day => day.lowerBody).map(day => day.index);
  const candidates = days.filter(day => !day.rest && !taken.includes(day.index));
  if (!candidates.length) return -1;
  const distanceFromHeavy = (day: PlannedDay) => heavy.length
    ? Math.min(...heavy.map(index => {
      const raw = Math.abs(day.index - index);
      return Math.min(raw, cycle - raw);
    }))
    : Infinity;
  return candidates.reduce((best, day) =>
    distanceFromHeavy(day) > distanceFromHeavy(best) ? day : best, candidates[0]).index;
}

/* ONE PEAK AT A TIME. */
export type PeakConflict = {
  /* Which side keeps its peak this week. */
  owner: 'lifting' | 'running';
  /* What the other side does instead. */
  say: string;
};

export type PeakContext = {
  /* The lifting wave is on its max week. */
  liftingMaxWeek: boolean;
  /* The running week is a race, a test, or race-specific work. */
  runningPeakWeek: boolean;
  /* Weeks until each goal's date; Infinity when there is no such goal. */
  weeksToRace?: number;
  weeksToLiftGoal?: number;
};

export function peakConflict({ liftingMaxWeek, runningPeakWeek, weeksToRace = Infinity, weeksToLiftGoal = Infinity }: PeakContext): PeakConflict | null {
  if (!liftingMaxWeek || !runningPeakWeek) return null;
  /* THE NEARER GOAL OWNS THE WEEK. Not the bigger one, not the one the athlete
     mentioned first — the one that runs out of time soonest, because that is
     the only one where this week is irreplaceable. */
  const runningFirst = weeksToRace <= weeksToLiftGoal;
  return runningFirst
    ? { owner: 'running', say: 'Your race is closer than your lift goal, so this week belongs to the running. The max attempt holds at a heavy double and moves to the next wave.' }
    : { owner: 'lifting', say: 'Your lift goal is closer than your race, so this week belongs to the max attempt. The hard run drops to an easy effort and the race-specific work moves a week.' };
}

/* THE DELOADS ARE THE SAME DELOAD. The lifting wave owns the clock, because it
   is the one with a fixed five-week cycle the athlete can feel; the mileage
   cut is moved onto it rather than the other way round. */
export const deloadWeek = (waveIndex: number, waveLength = 5) =>
  ((waveIndex % waveLength) + waveLength) % waveLength === waveLength - 2;

/* THE LONG RUN AND THE DAY BEFORE IT. A long run on legs that squatted
   yesterday is not a long run, it is a survival exercise, and the athlete
   reads the slow pace as lost fitness. */
export function longRunClash(longRunIndex: number, days: PlannedDay[]): PlannedDay | null {
  if (longRunIndex < 0 || !days.length) return null;
  const cycle = days.length;
  const previous = days.find(day => day.index === ((longRunIndex - 1 + cycle) % cycle));
  return previous && previous.lowerBody ? previous : null;
}

/* THE WHOLE WEEK'S VERDICT, in the order the athlete would ask about it. At
   most one line is shown — a card with four warnings on it is a card nobody
   reads, and these are ordered by how much damage ignoring them does. */
export type InterferenceNote = { kind: 'peak' | 'long-run' | 'crowding'; say: string };

export type WeekContext = PeakContext & {
  days: PlannedDay[];
  longRunIndex: number;
  hardRunIndex: number;
  /* How many of the week's lifting days are lower body. */
  lowerBodyDays?: number;
  hardRunKind?: HardRunKind;
};

export function interferenceNotes(context: WeekContext): InterferenceNote[] {
  const notes: InterferenceNote[] = [];
  const peak = peakConflict(context);
  if (peak) notes.push({ kind: 'peak', say: peak.say });

  const clash = longRunClash(context.longRunIndex, context.days);
  if (clash) notes.push({ kind: 'long-run', say: `Your long run follows ${clash.name} — run it easy and by effort, or move it a day. Legs that lifted heavy yesterday will read slow however fit you are.` });

  /* A hard run boxed in on both sides by heavy lifting is not a placement
     problem the schedule can solve; it is a split that has no room in it, and
     saying so is more useful than quietly picking the least bad day. */
  const cycle = context.days.length;
  if (cycle && context.hardRunIndex >= 0) {
    const heavy = context.days.filter(day => day.lowerBody);
    /* Crowded means the BEST available day is still next to heavy lifting.
       Not "most days are leg days" — a split can be mostly legs and still have
       one clear day, and that day is a fine answer. The problem worth naming
       is the split where no clear day exists at all, because then no amount of
       rearranging fixes it and only the athlete can. */
    const boxedIn = heavy.length > 0 && heavy.some(day => near(day.index, context.hardRunIndex, cycle));
    if (boxedIn) notes.push({ kind: 'crowding', say: 'There is no day in this split clear of heavy legs, so the hard run will always be run tired. Worth moving a lower-body day if the race matters more than the lift.' });
  }
  return notes;
}
