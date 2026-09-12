/* WHAT COUNTS AS RUNNING, DECIDED ONCE.

   Preston logs a mile in 20:00. That is a walk, and it was being read as a run
   everywhere: it dragged his median easy pace down so the plan prescribed
   slower easy runs, it padded his weekly running volume so the feasibility
   model thought he had more aerobic base than he does, and it sat in the pool
   of efforts a race prediction could be built from. The fix he asked for — and
   he was right — is not to delete the entry. People log walks. They log a
   warm-up as a run, they log the dog walk, they let a watch auto-lap. An app
   that needs its data curated to give an honest answer has a calculating
   problem, not a data problem.

   So every logged effort is classified here, by its pace, and each consumer
   takes what it is entitled to:

     'run'          real running. Counts everywhere.
     'walk'         slower than anyone runs. Never a pace anchor, never running
                    volume, never race evidence. Still a logged activity.
     'implausible'  faster than the distance allows — a unit mix-up, a watch
                    glitch, an interval session read as one piece. Never
                    evidence of anything.
     'unmeasured'   a distance with no time, or a time with no distance. Real
                    distance still counts as volume; it can anchor no pace.

   The thresholds are deliberately generous. The job is to throw out what is
   obviously not the thing, not to referee a hard session. */

/* Slower than 14:00 a mile is walking. A genuine recovery jog at 13:30 still
   counts as a run; nothing at 15:00 is running, whatever it is labelled. */
export const WALK_PACE_SECONDS = 840;

/* Faster than a 3:05 mile, scaled by distance the way race times actually
   scale. That is comfortably faster than any human has run, so it catches unit
   mix-ups and mislogs without ever second-guessing a real performance. A short
   repeat is allowed to be much faster per mile than a mile is, which is why
   this is a curve and not a number. */
const FASTEST_MILE_SECONDS = 185;
export const fastestPlausibleSeconds = (miles: number) => FASTEST_MILE_SECONDS * Math.pow(Math.max(miles, 0.01), 1.06);

export type EffortQuality = 'run' | 'walk' | 'implausible' | 'unmeasured';

export function classifyEffort(miles: number, seconds: number): EffortQuality {
  const distance = Number(miles) || 0;
  const time = Number(seconds) || 0;
  if (distance <= 0 || time <= 0) return 'unmeasured';
  if (time < fastestPlausibleSeconds(distance)) return 'implausible';
  if (time / distance > WALK_PACE_SECONDS) return 'walk';
  return 'run';
}

/* A pace is only worth anchoring anything to when the effort was real
   running — and over far enough to mean something. A 200 m dash is a true
   effort and a useless anchor for an easy-run pace. */
export const anchorsPace = (miles: number, seconds: number) =>
  classifyEffort(miles, seconds) === 'run' && miles >= 0.5;

/* RUNNING VOLUME is distance the athlete covered on their feet, running. A
   walk is not running volume — counting it tells the plan the athlete has a
   base they have not built. An unmeasured distance still counts: not knowing
   how long it took does not mean it did not happen. */
export const countsAsRunVolume = (miles: number, seconds: number) => {
  const quality = classifyEffort(miles, seconds);
  return quality === 'run' || quality === 'unmeasured';
};

/* NOBODY HAS RUN FASTER THAN THIS, so an effort that claims to is a mislog.

   classifyEffort's plausibility curve is deliberately loose — it is built off
   a 3:05 mile so that it never second-guesses a real performance at a short
   repeat, where a genuinely fast 400 is far quicker per mile than any mile
   ever run. That is right for deciding what counts as running at all, and far
   too loose for deciding what may PREDICT A RACE: a 1.4-mile effort at
   3:39/mi sailed through, and Forge told Preston his two-mile was worth 7:27
   — a time no human has run, presented to him as his own current fitness.

   Race evidence gets the real line instead: the mile world record, scaled the
   way race times scale. It binds only at half a mile and up, which is the only
   place race evidence is taken from, so short repeats are untouched. */
export const WORLD_RECORD_MILE_SECONDS = 223;
export const recordPaceSeconds = (miles: number) =>
  WORLD_RECORD_MILE_SECONDS * Math.pow(Math.max(miles, 0.01), 1.06);

/* RACE EVIDENCE is the strictest of the three: real running, timed, long
   enough that the conversion to another distance means something, and inside
   what a human being has actually done. */
export const isRaceEvidence = (miles: number, seconds: number) =>
  classifyEffort(miles, seconds) === 'run' && miles >= 0.5 && seconds >= recordPaceSeconds(miles);
