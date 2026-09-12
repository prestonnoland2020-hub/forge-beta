import type { RecoveryState } from './recoveryEngine';

/* THE ATHLETE IS THE SENSOR FORGE ALREADY HAD AND NEVER READ.

   The engine has always been able to act on fatigue: cardioEngine cuts volume
   on poorRecovery, holds load when strengthFatigue is High, and repeats a week
   rather than progressing it. All of that was wired to a smartwatch, and
   without one `deriveRecoveryState` returned readiness 100 and said so in its
   own reasons — "Recovery is not being used to change coaching or training."
   For every athlete without a watch, which is most of them, Forge was assuming
   they woke up perfect every single day.

   A person can answer three questions in four seconds, and their answers are
   better than nothing by a distance. This turns them into the same
   RecoveryState the watch produces, so everything downstream keeps reading one
   authority and does not care where the number came from.

   TWO RULES ABOUT TIME, BOTH DELIBERATE:

     - A check-in steers training for TODAY AND TOMORROW, and then stops. One
       rough morning should not suppress a whole week, and a week-old answer is
       not evidence about this morning.
     - It never raises readiness above what the watch says. Self-report is
       trusted to say "I am beaten up"; it is not trusted to override a watch
       saying the same. Athletes are reliable about feeling bad and optimistic
       about feeling good. */

export type CheckInScale = 1 | 2 | 3 | 4 | 5;
export type CheckIn = {
  /* Local day the answer was given. */
  date: string;
  /* 1 fresh … 5 wrecked. */
  legs: CheckInScale;
  /* 1 flat … 5 great. */
  energy: CheckInScale;
  /* 1 slept badly … 5 slept well. */
  sleep: CheckInScale;
  note?: string;
  /* The workout this check-in was asked about, when it followed one. */
  aboutRecordId?: string;
  /* What Forge asked, kept so the answer can be read back in context. */
  prompt?: string;
};

/* Sub-scores, 0–100. Soreness carries most of the weight because it is the one
   an athlete judges accurately; sleep carries least because a single night
   matters less than how the legs actually feel. */
const LEGS_SCORE = [100, 88, 72, 50, 28];
const ENERGY_SCORE = [30, 52, 74, 90, 100];
const SLEEP_SCORE = [35, 58, 78, 92, 100];
const WEIGHT = { legs: 0.4, energy: 0.35, sleep: 0.25 };

const at = (table: number[], value: number) => table[Math.max(1, Math.min(5, Math.round(value))) - 1];
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

export const readinessFromCheckIn = (checkIn: CheckIn): number => Math.round(clamp(
  at(LEGS_SCORE, checkIn.legs) * WEIGHT.legs
  + at(ENERGY_SCORE, checkIn.energy) * WEIGHT.energy
  + at(SLEEP_SCORE, checkIn.sleep) * WEIGHT.sleep,
));

/* How many days an answer is allowed to speak for. */
export const CHECK_IN_HALF_LIFE_DAYS = 1;

const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);

/* The most recent check-in that is still allowed to steer today. */
export const liveCheckIn = (checkIns: CheckIn[], today: string): CheckIn | null => {
  const ordered = [...checkIns].filter(item => item.date <= today).sort((a, b) => b.date.localeCompare(a.date));
  const latest = ordered[0];
  if (!latest) return null;
  return daysBetween(latest.date, today) <= CHECK_IN_HALF_LIFE_DAYS ? latest : null;
};

/* A ROUGH MORNING IS A DAY. THREE IN A ROW IS A PROGRAM PROBLEM.

   This is the signal behind the coach offering to restructure: not one bad
   answer, but a run of them, which means the block is asking for more than the
   athlete is absorbing. */
export const STRUGGLING_THRESHOLD = 58;
export const STRUGGLING_RUN = 3;
export const strugglingStreak = (checkIns: CheckIn[], window = 5): number => {
  const recent = [...checkIns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, window);
  return recent.filter(item => readinessFromCheckIn(item) < STRUGGLING_THRESHOLD).length;
};
export const isStruggling = (checkIns: CheckIn[]) => strugglingStreak(checkIns) >= STRUGGLING_RUN;

/* Fatigue the athlete reports, folded in with the training load already
   measured. The load rule stands on its own; a bad check-in can only make the
   verdict worse, never better. */
const fatigueFromCheckIn = (checkIn: CheckIn): RecoveryState['strengthFatigue'] =>
  checkIn.legs >= 4 ? 'High' : checkIn.legs === 3 ? 'Moderate' : 'Low';
const worseFatigue = (a: RecoveryState['strengthFatigue'], b: RecoveryState['strengthFatigue']) => {
  const rank = { Low: 0, Moderate: 1, High: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
};

/* THE ONE PLACE THE TWO SOURCES MEET. Everything downstream reads a
   RecoveryState and must not know or care whether a watch or a person produced
   it — which is why this returns the same shape rather than a second opinion
   every caller would have to remember to consult. */
export function applyCheckIn(base: RecoveryState, checkIns: CheckIn[], today: string): RecoveryState {
  const checkIn = liveCheckIn(checkIns, today);
  if (!checkIn) return base;
  const reported = readinessFromCheckIn(checkIn);
  const watchIsBlind = base.confidence === 'Low';
  /* With no watch the report IS the reading. With one, the report can only
     pull the number down — see the note at the top about what athletes are
     reliable about. */
  const readiness = watchIsBlind ? reported : Math.min(base.readiness, reported);
  const age = daysBetween(checkIn.date, today);
  const said = [
    `You said legs ${['fresh', 'fine', 'a bit sore', 'sore', 'wrecked'][checkIn.legs - 1]}`,
    `energy ${['flat', 'low', 'ok', 'good', 'great'][checkIn.energy - 1]}`,
    `sleep ${['poor', 'short', 'ok', 'good', 'great'][checkIn.sleep - 1]}`,
  ].join(', ') + (age > 0 ? ` (${age} day ago)` : ' today');
  const strengthFatigue = worseFatigue(base.strengthFatigue, fatigueFromCheckIn(checkIn));
  return {
    ...base,
    readiness,
    strengthFatigue,
    /* A person answering today beats no data; it does not beat a full watch. */
    confidence: watchIsBlind ? 'Medium' : base.confidence,
    reasons: [said, ...(watchIsBlind
      ? base.reasons.filter(reason => !reason.startsWith('No smartwatch') && !reason.startsWith('Recovery is not being used'))
      : base.reasons)],
    hardTrainingAllowed: base.hardTrainingAllowed && readiness >= 55,
  };
}
