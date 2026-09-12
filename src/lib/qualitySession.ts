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

/* Threshold is run a touch slower than 5K pace — about 10K to 15K effort.
   Comfortably hard: you could hold it for an hour if you had to, and you never
   do. Below 5K goal pace this is the number that actually builds the ceiling. */
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
   to get hurt before the aerobic work is done. */
const INTERVAL_MENU = [400, 400, 600, 800, 800, 1000, 1200, 1600];
const repDistanceFor = (weekIndex: number) => INTERVAL_MENU[clamp(Math.floor(weekIndex / 1.5), 0, INTERVAL_MENU.length - 1)];

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
  const thresholdPace = goalPace * THRESHOLD_PACE_MULTIPLE;

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

  const distance = repDistanceFor(weekIndex);
  const baseReps = distance <= 400 ? 8 : distance <= 800 ? 6 : distance <= 1200 ? 5 : 4;
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
    text: `${reps} × ${distance} m @ ${clockText(repSeconds)}/rep${phase === 'Specific' ? ' · goal pace' : ''}`,
    miles: round1(Math.min(miles, weeklyMiles * QUALITY_MAX_SHARE || miles)),
  };
}
