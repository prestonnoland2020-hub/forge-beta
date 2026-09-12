/* THE HARD RUN OF THE WEEK.

   Forge prescribed short reps at goal pace and easy miles, and nothing else. A
   5K build with no threshold running is an incomplete build — tempo work is
   the single highest-return session for that distance, because the limit on a
   5K is how long you can hold just under the point where lactate runs away
   from you, and that is trained by running at it, not by 400s.

   ONE HARD RUN A WEEK, NOT TWO. This athlete also squats heavy four days a
   week. Two hard runs stacked on that is how people get hurt, and a plan that
   is right on paper and wrong for a human body is wrong. So the quality slot
   alternates rather than doubles, weighted by phase:

     - FOUNDATION leans threshold. Aerobic strength first; there is no point
       sharpening a blade that has no steel behind it.
     - BUILD alternates evenly.
     - SPECIFIC leans intervals at goal pace, with a threshold session kept in
       the rotation so the engine underneath does not go stale.

   And it gets out of the way when it should: a deload week gets a fartlek the
   athlete stops while still fresh, a taper gets strides, the test week is the
   test, and a rough check-in downgrades whatever was scheduled. */

export type QualityPhase = 'Foundation' | 'Build' | 'Specific' | 'Deload' | 'Taper' | 'Test';
export type QualityKind = 'threshold' | 'intervals' | 'fartlek' | 'strides' | 'test' | 'baseline' | 'none';

export type QualityContext = {
  phase: QualityPhase;
  /* Zero-based week within the block. */
  weekIndex: number;
  /* Goal pace in seconds per mile; 0 when there is no dated race goal. */
  goalPaceSecondsPerMile: number;
  /* The week's total running, so a hard session can never eat it. */
  weeklyMiles: number;
  /* 0–100. Below 70 the session softens, below 55 it comes off. */
  readiness?: number;
  /* False before the athlete has logged any running. */
  hasBaseline?: boolean;
  /* Goal distance in miles, used to size threshold reps for the event. */
  goalMiles?: number;
};

export type QualitySession = { kind: QualityKind; text: string; miles: number };

/* THRESHOLD IS A PHYSIOLOGY, NOT A PERCENTAGE OF WHATEVER YOU ENTERED.

   This used to be a flat 1.06 x goal pace, which is only ever right for one
   distance. It is calibrated on a 5K, and every other goal it is handed comes
   out wrong in the direction of that goal's distance:

     - a 4:59 mile goal became a 5:17/mi "threshold" — the athlete's own race
       pace, prescribed as a fifteen-minute comfortably-hard effort;
     - a 4:00 marathon goal became 9:42/mi, which is that athlete's easy pace.
       A session that is easier than easy running trains nothing.

   Threshold is the pace you could hold for about an hour, so that is what it
   is computed as: the goal performance carried to a one-hour race distance by
   the same Riegel curve the goal predictions already use. One derivation that
   lands on 5:33/mi for the miler, 6:22/mi for the 5K and 8:24/mi for the
   marathoner, from their own goals, with no per-distance table to maintain. */
export const THRESHOLD_EQUIVALENT_MILES = 6.214;
const RIEGEL = 1.06;
export const thresholdPaceFor = (goalPaceSecondsPerMile: number, goalMiles: number): number => {
  if (!goalPaceSecondsPerMile) return 0;
  const miles = goalMiles > 0 ? goalMiles : 3.107;
  const total = goalPaceSecondsPerMile * miles;
  return total * Math.pow(THRESHOLD_EQUIVALENT_MILES / miles, RIEGEL) / THRESHOLD_EQUIVALENT_MILES;
};
/* Kept for the tests and callers that still reason in multiples of 5K pace. */
export const THRESHOLD_PACE_MULTIPLE = 1.06;
/* Warm-up and cool-down, which are real miles and have to be counted or the
   week's total is a lie. */
export const WARMUP_COOLDOWN_MILES = 2;
/* No single session is allowed past this share of the week. */
export const QUALITY_MAX_SHARE = 0.3;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
export const clockText = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/* Rep distance walks up as the block goes on: short and sharp early is a way
   to get hurt before the aerobic work is done.

   AND IT IS SIZED TO THE RACE. The menu below is written for a 5K; handed to a
   marathon goal it prescribes 400s at 9:09/mi, which is a jog with a rest in
   it, and handed to a mile goal it prescribes 1600s at mile pace, which is the
   race. Reps are a share of the event — roughly an eighth to a half of it — so
   the ladder is scaled by the goal's own distance and then rounded to a
   distance a track can actually measure. */
const INTERVAL_MENU = [400, 400, 600, 800, 800, 1000, 1200, 1600];
const TRACK_STEPS = [200, 300, 400, 600, 800, 1000, 1200, 1600, 2000, 2400, 3200, 4800];
const snapToTrack = (metres: number) => TRACK_STEPS.reduce((best, step) =>
  Math.abs(step - metres) < Math.abs(best - metres) ? step : best, TRACK_STEPS[0]);
const repDistanceFor = (weekIndex: number, goalMiles = 3.107) => {
  const base = INTERVAL_MENU[clamp(Math.floor(weekIndex / 1.5), 0, INTERVAL_MENU.length - 1)];
  const scale = clamp((goalMiles > 0 ? goalMiles : 3.107) / 3.107, 0.5, 4.2);
  return snapToTrack(base * scale);
};

/* How long a threshold effort runs, growing through the block and capped by
   what the week can actually hold. */
export function thresholdMinutes(weekIndex: number, weeklyMiles: number, paceSecondsPerMile: number): number {
  const wanted = clamp(12 + weekIndex * 1.5, 12, 30);
  if (!paceSecondsPerMile || !weeklyMiles) return Math.round(wanted);
  const budgetMiles = Math.max(0, weeklyMiles * QUALITY_MAX_SHARE - WARMUP_COOLDOWN_MILES);
  const budgetMinutes = (budgetMiles * paceSecondsPerMile) / 60;
  return Math.max(8, Math.round(Math.min(wanted, budgetMinutes)));
}

/* WHICH KIND OF HARD, THIS WEEK. Phase sets the lean; the week index breaks
   the tie, so the two alternate rather than one of them never appearing. */
export function qualityKindFor(phase: QualityPhase, weekIndex: number): QualityKind {
  if (phase === 'Test') return 'test';
  if (phase === 'Taper') return 'strides';
  if (phase === 'Deload') return 'fartlek';
  if (phase === 'Foundation') return weekIndex % 3 === 2 ? 'intervals' : 'threshold';
  if (phase === 'Specific') return weekIndex % 3 === 2 ? 'threshold' : 'intervals';
  return weekIndex % 2 === 0 ? 'threshold' : 'intervals';
}

export function qualitySession(context: QualityContext): QualitySession {
  const { phase, weekIndex, goalPaceSecondsPerMile: goalPace, weeklyMiles, readiness, hasBaseline = true, goalMiles = 3.107 } = context;
  if (!goalPace) return { kind: 'none', text: 'No goal-driven cardio', miles: 0 };
  if (!hasBaseline) return { kind: 'baseline', text: 'Establish a comfortable running baseline', miles: 0 };

  /* A ROUGH MORNING OUTRANKS THE CALENDAR. The block does not know the athlete
     slept badly; the check-in does, and a hard session taken on a body that
     cannot absorb it is worse than no session at all. */
  if (typeof readiness === 'number' && readiness < 55) {
    return { kind: 'fartlek', text: 'Easy only — the hard run moves to when you have recovered', miles: 0 };
  }
  const soften = typeof readiness === 'number' && readiness < 70;

  const kind = qualityKindFor(phase, weekIndex);
  const thresholdPace = thresholdPaceFor(goalPace, goalMiles);

  if (kind === 'test') {
    return { kind, text: `Goal effort assessment${goalMiles ? ` over ${goalMiles < 2 ? goalMiles.toFixed(1) : goalMiles.toFixed(goalMiles % 1 ? 1 : 0)} mi` : ''}`, miles: round1(goalMiles + WARMUP_COOLDOWN_MILES) };
  }
  if (kind === 'strides') {
    return { kind, text: '4–6 × 20 s strides at goal effort, full recovery', miles: round1(Math.min(3, weeklyMiles * QUALITY_MAX_SHARE)) };
  }
  if (kind === 'fartlek') {
    return { kind, text: 'Short fartlek — 6 × 1 min brisk, easy between. Stop while fresh', miles: round1(Math.min(4, Math.max(2, weeklyMiles * 0.22))) };
  }

  if (kind === 'threshold') {
    const minutes = Math.max(8, thresholdMinutes(weekIndex, weeklyMiles, thresholdPace) - (soften ? 5 : 0));
    const paceText = `${clockText(thresholdPace)}/mi`;
    /* Past twenty minutes the effort is broken into cruise intervals — the
       physiology is the same and it is far likelier to be run at the right
       pace instead of drifting into a race. */
    const text = minutes > 20
      ? `${Math.round(minutes / 8)} × 8 min @ ${paceText} · 90 s jog between`
      : `${minutes} min continuous @ ${paceText}`;
    const miles = round1(minutes * 60 / thresholdPace + WARMUP_COOLDOWN_MILES);
    return { kind, text: `${text} · threshold`, miles: round1(Math.min(miles, weeklyMiles * QUALITY_MAX_SHARE || miles)) };
  }

  const distance = repDistanceFor(weekIndex, goalMiles);
  const baseReps = distance <= 400 ? 8 : distance <= 800 ? 6 : distance <= 1200 ? 5 : distance <= 2400 ? 4 : 3;
  const reps = Math.max(3, baseReps - (soften ? 2 : 0));
  /* Foundation runs reps a shade slower than goal pace; Specific runs them at
     it. Nothing is ever prescribed faster than goal pace — a rep session run
     too hard is a race nobody entered. */
  const ease = phase === 'Foundation' ? 1.04 : phase === 'Build' ? 1.02 : 1;
  /* Rounded UP, always. To the nearest second a 1200 m rep can land a shade
     under goal pace, and "never faster than goal pace" is a rule about what is
     printed on the card, not about the arithmetic behind it. */
  const repSeconds = Math.ceil((goalPace * ease) / 1609.344 * distance);
  const miles = round1(reps * distance / 1609.344 + WARMUP_COOLDOWN_MILES);
  return {
    kind: 'intervals',
    text: `${reps} × ${distance >= 1600 ? `${round1(distance / 1609.344)} mi` : `${distance} m`} @ ${clockText(repSeconds)}/rep${phase === 'Specific' ? ' · goal pace' : ''}`,
    miles: round1(Math.min(miles, weeklyMiles * QUALITY_MAX_SHARE || miles)),
  };
}

/* THE GOAL THE HARD RUN IS FOR.

   The pre-program roadmap derived goal pace inside its own module, so the
   stored AI block — the thing the Plan tab actually renders — had no idea
   what pace anything should be run at and kept whatever prose the model wrote.
   That is why a 5K build showed no threshold work: the function that decides
   what a hard run is was only ever called by the roadmap. One derivation,
   exported, so both paths read the same numbers. */
export type EnduranceGoalRef = { type?: string; exercise?: string; title?: string; target?: string; date?: string };

export const goalClockSeconds = (value?: string): number => {
  const match = String(value || '').match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
};

export const goalEventMiles = (goal?: EnduranceGoalRef): number => {
  const name = `${goal?.exercise || ''} ${goal?.title || ''}`.toLowerCase();
  if (name.includes('marathon') && !name.includes('half')) return 26.219;
  if (name.includes('half')) return 13.109;
  if (name.includes('10k')) return 6.214;
  if (name.includes('5k')) return 3.107;
  if (/\b2[\s-]?mile/.test(name)) return 2;
  if (/\bmile\b/.test(name)) return 1;
  return 3.107;
};

/* WHICH RACE THE BLOCK IS FOR, WHEN THERE IS MORE THAN ONE.

   Sorting by date and taking the first is only a rule while the dates differ.
   Preston has a mile, a two mile and a 5K all dated the 31st of December, so
   the "soonest" goal was whichever the database happened to return first — the
   mile — and his entire running plan was paced off 4:59/mi while the other two
   goals were ignored outright. Arbitrary is the one thing a training plan
   cannot be.

   The tie goes to the LONGEST race on that date. Every coach builds the season
   around the longest event and treats the shorter ones as sharpening inside
   it: a 5K build gives a miler an aerobic base and some speed, while a mile
   build gives a 5K runner neither the volume nor the durability, and it
   prescribes the shorter athlete paces they cannot survive at volume. The
   safe, sane direction is down from the longest, not up from the shortest. */
export type EnduranceTarget = { paceSecondsPerMile: number; miles: number; goal: EnduranceGoalRef; others: EnduranceGoalRef[] };
export function enduranceTarget(goals: EnduranceGoalRef[] | undefined | null): EnduranceTarget | null {
  const dated = (goals || [])
    .filter(entry => entry?.type === 'Endurance' && entry?.date && goalClockSeconds(entry.target) > 0)
    .sort((a, b) => {
      const byDate = String(a.date).localeCompare(String(b.date));
      if (byDate) return byDate;
      return goalEventMiles(b) - goalEventMiles(a);
    });
  const goal = dated[0];
  if (!goal) return null;
  const seconds = goalClockSeconds(goal.target);
  const miles = goalEventMiles(goal);
  if (!seconds || !miles) return null;
  return { paceSecondsPerMile: seconds / miles, miles, goal, others: dated.slice(1) };
}

/* The AI block writes its phases in the strength block's language; the hard
   run thinks in the running block's. A running deload outranks both, because
   the week's volume has already been cut and a threshold session on top of a
   cut week is not a deload. */
export function qualityPhaseFor(planPhase: string | undefined, deloading: boolean): QualityPhase {
  /* Race week and the taper outrank it: the volume cut IS the taper, and
     turning the last sharpening session before a race into a deload fartlek
     is how an athlete arrives flat. */
  const phase = String(planPhase || '');
  if (phase === 'Race') return 'Test';
  if (phase === 'Taper') return 'Taper';
  if (deloading) return 'Deload';
  switch (phase) {
    case 'Race': return 'Test';
    case 'Taper': return 'Taper';
    case 'Deload': return 'Deload';
    case 'Peak': return 'Specific';
    case 'Base': return 'Foundation';
    default: return 'Build';
  }
}
