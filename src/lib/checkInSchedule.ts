import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import type { CheckIn } from './readiness';
import { cardioMiles, summarizeCardioDraft } from './cardioSession';
import { countsAsRunVolume } from './runQuality';

/* WHEN THE COACH ASKS, AND WHEN IT SHUTS UP.

   A coach who asks how you feel every single day is noise, and noise gets
   dismissed without being read — at which point the feature is worse than not
   existing, because now there is a habit of ignoring Forge. A coach who never
   asks learns nothing. The line between them is the whole design:

     - The morning after something HARD. A tested single, a long run, a session
       well above what this athlete normally does. That is when the answer
       actually changes what should be prescribed, and it is when the athlete
       has something to say.
     - Otherwise on a slow cadence, and only if they have been training. Asking
       someone who has not trained in a week how their legs feel is a question
       with no purpose.
     - Never twice in a day, and never twice about the same session. */

export const CADENCE_DAYS = 3;
/* How long after a hard session the answer is still worth having. */
export const BIG_DAY_WINDOW = 2;

export type CheckInAsk = {
  reason: 'big-day' | 'cadence';
  /* The session being asked about, when there is one. */
  aboutRecordId?: string;
  /* What Forge says, in its own voice, naming the thing it saw. */
  prompt: string;
};

const iso = (date: Date) => date.toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);

const topSetsOf = (record: WorkoutRecord) => record.topSets || [];
const runMilesOf = (record: WorkoutRecord) => (record.cardioSessions || []).reduce((total, session) => {
  const miles = cardioMiles(session);
  const minutes = summarizeCardioDraft(session).minutes;
  return total + (countsAsRunVolume(miles, minutes * 60) ? miles : 0);
}, 0);

/* WHAT COUNTS AS A HARD DAY, measured against this athlete rather than against
   a number someone picked. A single is always hard. Everything else has to
   STAND OUT from their own normal, and the comparison is against the median of
   recent work rather than against the maximum — compared against the maximum,
   an athlete who runs three miles every single day has a personal best every
   single day, and would be asked how they pulled up from a jog they do in
   their sleep. A question that arrives when nothing happened is the fastest
   way to teach someone to dismiss Forge without reading it. */
export const HARD_MARGIN = 1.3;
/* Below this, no run is worth a next-morning question whatever the ratio. */
export const HARD_RUN_FLOOR_MILES = 4;
export const HARD_TONNAGE_MARGIN = 1.25;

const median = (values: number[]) => {
  const sorted = [...values].filter(value => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export type DayWeight = { maxAttempt: boolean; miles: number; tonnage: number };
export const weighDay = (record: WorkoutRecord): DayWeight => ({
  maxAttempt: topSetsOf(record).some(set => Number(set.reps) === 1 && Number(set.weight) > 0),
  miles: runMilesOf(record),
  tonnage: topSetsOf(record).reduce((total, set) => total + Number(set.weight || 0) * Number(set.reps || 0), 0),
});

/* WHY a day was big — the question has to say the true reason. A 405 × 8
   squat day with a 3.1-mile run on it fired on tonnage and then asked "that
   was your longest run in a while", which it was not. */
export type BigDayReason = 'max' | 'run' | 'tonnage';
export function bigDayReason(record: WorkoutRecord, history: WorkoutRecord[]): BigDayReason | null {
  const weight = weighDay(record);
  if (weight.maxAttempt) return 'max';
  /* Their own recent normal, taken over the last month and excluding the day
     being judged, so the day cannot help decide what normal is. */
  const prior = history.filter(item => item.id !== record.id && daysBetween(item.date, record.date) > 0 && daysBetween(item.date, record.date) <= 28);
  const usualRun = median(prior.map(runMilesOf));
  if (weight.miles >= HARD_RUN_FLOOR_MILES && usualRun > 0 && weight.miles >= usualRun * HARD_MARGIN) return 'run';
  const usualTonnage = median(prior.map(item => weighDay(item).tonnage));
  return weight.tonnage > 0 && usualTonnage > 0 && weight.tonnage >= usualTonnage * HARD_TONNAGE_MARGIN ? 'tonnage' : null;
}
export const isBigDay = (record: WorkoutRecord, history: WorkoutRecord[]): boolean => bigDayReason(record, history) !== null;

const bigDayPrompt = (record: WorkoutRecord, reason: BigDayReason): string => {
  const weight = weighDay(record);
  if (reason === 'max') {
    const set = topSetsOf(record).find(item => Number(item.reps) === 1);
    return `You took ${set?.lift || 'a single'}${set?.weight ? ` at ${set.weight}` : ''} yesterday. How did you pull up?`;
  }
  if (reason === 'run') return `That was your longest run in a while — ${weight.miles.toFixed(1)} miles. How do the legs feel?`;
  const heaviest = [...topSetsOf(record)].sort((a, b) => Number(b.weight || 0) * Number(b.reps || 0) - Number(a.weight || 0) * Number(a.reps || 0))[0];
  return heaviest ? `${heaviest.lift} ${heaviest.weight} × ${heaviest.reps} yesterday — a big one. How did you pull up?` : `${record.title || 'That session'} was a big one for you. How did you pull up?`;
};

/* Whether the coach should ask today, and what about. */
/* When the coach knows how the session actually went, it opens with that
   instead of with a generic question. "How did you pull up" is small talk;
   "you faded over the last few reps — was that the legs or did it go out hot"
   is the reason the athlete answers at all. */
export type VerdictLookup = (recordId: string) => { ask: string } | null | undefined;

export function dueCheckIn(records: WorkoutRecord[], checkIns: CheckIn[], todayIso = iso(new Date()), verdictFor?: VerdictLookup, snoozedIso?: string): CheckInAsk | null {
  /* One a day, always — and "Not now" is an answer for the day too. It was
     local state, so every reopen of the app asked the same question again. */
  if (checkIns.some(item => item.date === todayIso)) return null;
  if (snoozedIso === todayIso) return null;
  const answered = new Set(checkIns.map(item => item.aboutRecordId).filter(Boolean) as string[]);
  const lastAsked = [...checkIns].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;

  /* A hard session in the window that has not been asked about. Yesterday's
     first — the morning after is when the answer means most. */
  const recent = records
    .filter(record => {
      const age = daysBetween(record.date, todayIso);
      return age >= 1 && age <= BIG_DAY_WINDOW;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const big = recent.find(record => !answered.has(record.id) && isBigDay(record, records));
  if (big) return { reason: 'big-day', aboutRecordId: big.id, prompt: verdictFor?.(big.id)?.ask || bigDayPrompt(big, bigDayReason(big, records) || 'tonnage') };

  /* Otherwise the slow cadence — and only for someone who has actually been
     training, because the question is about training. */
  if (lastAsked && daysBetween(lastAsked, todayIso) < CADENCE_DAYS) return null;
  /* "BEFORE TODAY" MEANS BEFORE. The cadence question is about how the
     athlete arrives at a session, so it is never asked on a day they have
     already trained — a runner's first ever log was followed by "how do the
     legs feel?", which reads as an app that did not notice the run. */
  if (records.some(record => record.date === todayIso)) return null;
  const trainedRecently = records.some(record => {
    const age = daysBetween(record.date, todayIso);
    return age >= 1 && age <= CADENCE_DAYS + 1;
  });
  if (!trainedRecently) return null;
  return { reason: 'cadence', prompt: 'Quick check before today — how are you holding up?' };
}
