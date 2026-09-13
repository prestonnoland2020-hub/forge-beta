import type { CreatedGoal } from '../components/GoalBuilder';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { weeklyRunning } from './goalTrajectory';
import { cardioMiles, summarizeCardioDraft } from './cardioSession';
import { clockToSeconds, localDayIso } from './time';
import { calculateEstimatedOneRepMax } from './strength';
import { isRaceEvidence } from './runQuality';
import { predictRaceFromLegacyMethod } from './cardioPrediction';

const round1 = (value: number) => Math.round(value * 10) / 10;
import { sameLift } from './liftAliases';

/* IS THIS GOAL REACHABLE, AND SAY SO OUT LOUD.

   Preston's goals were a 4:59 mile, a 10:59 two-mile and an 18:59 5K, all by
   December 31. His best logged mile is 5:48, he runs about 13 miles a week, his
   long run has been five miles for seven weeks, and almost all of his running
   is at ten minutes a mile. Sub-19 for 5K is roughly a 5:25-mile fitness built
   on 25 to 35 miles a week. None of the three was going to happen, and Forge
   had been silent about it since July while prescribing HALF the volume he was
   already running.

   Every part of that was computable. The trajectory module already works out
   the rate he is moving and where it lands him; what nothing did was compare
   the goal against the training that would be needed to reach it, and say the
   word "no" when the answer was no. A coach that only ever reports the gap is
   not coaching.

   What this refuses to do is soften it. "Ambitious but achievable with
   consistency" is the kind of sentence that costs someone six months. If the
   arithmetic says a goal needs more weeks than there are, it says so, and it
   says what IS reachable in the time instead — because a reachable target is
   the thing that actually changes what they do on Monday. */

export type Feasibility = {
  goal: string;
  /* 'reachable' — the training on file supports it in the time left.
     'needs-more'  — reachable, but only if something changes; that is named.
     'out-of-reach'— not in this time frame, whatever changes. */
  verdict: 'reachable' | 'needs-more' | 'out-of-reach';
  /* One sentence, plain, no hedging. */
  say: string;
  /* What would be reachable instead, when the goal is not. */
  insteadOf?: string;
  /* WHAT THE GOAL ACTUALLY NEEDS, AS NUMBERS RATHER THAN A SENTENCE.
     A paragraph telling an athlete to "build to 32 miles a week" is a chore
     list. Given the figures, the app can offer to do it — raise the ceiling
     in their settings and let the ramp climb to it — which is the difference
     between software that reports a problem and software that fixes one. */
  needs?: {
    /* Weekly mileage the goal pace is normally built on. */
    weeklyMiles: number;
    /* What they are actually running now. */
    running: number;
    /* Their own ceiling, when it is what blocks the goal. */
    ceiling?: number;
  };
  /* The single change that matters most, when there is one. */
  change?: string;
};

const DAY = 86_400_000;
export const weeksUntil = (deadline: string) => {
  const ms = new Date(`${deadline}T12:00:00`).getTime();
  return Number.isFinite(ms) ? Math.max(0, (ms - Date.now()) / 604800000) : 12;
};
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const RACE_MILES: Record<string, number> = {
  mile: 1, '1 mile': 1, '1600': 1, '1600m': 1,
  '2 mile': 2, 'two mile': 2, '3200': 2, '3200m': 2,
  '5k': 3.10686, '8k': 4.97097, '10k': 6.21371,
  'half marathon': 13.1094, marathon: 26.2188,
};
const milesOf = (goal: CreatedGoal) => {
  const name = String(goal.exercise || goal.title || '').trim().toLowerCase();
  const direct = RACE_MILES[name];
  if (direct) return direct;
  const key = Object.keys(RACE_MILES).find(candidate => name.includes(candidate));
  return key ? RACE_MILES[key] : 0;
};

/* RIEGEL: t2 = t1 * (d2/d1)^1.06. The standard way to carry one race result to
   another distance, and what lets a 5:48 mile be compared against a 5K goal at
   all.

   THE EXPONENT IS NOT A CONSTANT THOUGH, and pretending it is flatters exactly
   the athlete this module exists for. 1.06 assumes someone trained AT the
   distance. Carry a fast mile up to a 5K for a lifter running thirteen miles a
   week and it predicts a 5K they have no aerobic base to run — the mile is a
   speed result and the 5K is an endurance one. Under-trained runners come in
   nearer 1.15. So the exponent rises with the volume shortfall, and only when
   extrapolating UP in distance: going the other way, a long-run result
   predicting a short race needs no such help. */
export { RIEGEL, RIEGEL_UNDERTRAINED, equivalentSeconds, volumeForPace } from './riegel';
import { equivalentSeconds, volumeForPace } from './riegel';

/* HOW FAST A RACE TIME CAN HONESTLY IMPROVE. Around 1% a week is a good block
   for someone with room to grow; sustained double digits over a season is not
   a thing that happens to a recreational runner already training. Capped at
   12 weeks of it, because a 16-week horizon does not compound forever. */
const WEEKLY_IMPROVEMENT = 0.01;
const MAX_IMPROVEMENT_WEEKS = 12;
export const reachableSeconds = (currentSeconds: number, weeks: number) =>
  currentSeconds * Math.pow(1 - WEEKLY_IMPROVEMENT, Math.min(weeks, MAX_IMPROVEMENT_WEEKS));

/* AND IT HAS TO BE RECENT ENOUGH TO BE ABOUT THE ATHLETE WHO EXISTS NOW.

   This had no window at all. Preston imported years of Strava history when he
   signed up, so his "best continuous effort" was a 3:54 mile from 2021 — he
   was in high school — and every 2026 goal verdict was being measured against
   it. The mislogs were the loud version of this; the quiet version is worse,
   because a genuine personal best from five years ago looks entirely
   plausible and is just as wrong an answer to "what are you worth today".

   Six months, which is the same window the other race predictor already uses,
   so the two cannot disagree about which efforts are even eligible. */
export const RACE_EVIDENCE_WINDOW_DAYS = 180;

/* The athlete's best CONTINUOUS run, as a time at a distance — the only thing a
   race prediction can honestly be built from. Intervals are not a race. */
export function bestContinuousEffort(records: WorkoutRecord[], todayIso = localDayIso()) {
  const cutoff = new Date(`${todayIso}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - RACE_EVIDENCE_WINDOW_DAYS);
  const since = cutoff.toISOString().slice(0, 10);
  let best: { miles: number; seconds: number; date: string; equivalentMile: number } | null = null;
  records.forEach(record => (record.date >= since ? record.cardioSessions || [] : []).forEach(session => {
    if (!/run/i.test(session.activity || '')) return;
    const intervals = session.prescription?.legacyIntervals;
    /* A session logged as many lines is an interval session; its parts are not
       a continuous effort and cannot be carried to a race distance. */
    if (Array.isArray(intervals) && intervals.length > 1) return;
    const miles = cardioMiles(session);
    const minutes = summarizeCardioDraft(session).minutes;
    /* Under three quarters of a mile predicts nothing at a race distance, and
       runQuality owns the rest of the judgement — what is a walk, what is a
       mislog — so this file cannot drift from every other one. */
    if (miles < 0.75 || !minutes) return;
    const seconds = minutes * 60;
    if (!isRaceEvidence(miles, seconds)) return;
    const equivalentMile = equivalentSeconds(seconds, miles, 1);
    if (!best || equivalentMile < best.equivalentMile) best = { miles, seconds, date: record.date, equivalentMile };
  }));
  return best as { miles: number; seconds: number; date: string; equivalentMile: number } | null;
}

const recentWeeklyMiles = (records: WorkoutRecord[]) => {
  const weeks = weeklyRunning(records, 8).filter(week => !week.partial);
  if (!weeks.length) return 0;
  const values = weeks.map(week => week.miles).sort((a, b) => a - b);
  const middle = values.length >> 1;
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
};

function raceFeasibility(goal: CreatedGoal, records: WorkoutRecord[], excluded: string[] = []): Feasibility | null {
  const distance = milesOf(goal);
  if (!distance) return null;
  const targetSeconds = clockToSeconds(goal.target, String(goal.unit || '').includes('hh:mm:ss'));
  if (!targetSeconds) return null;
  const weeks = weeksUntil(goal.date);
  const volume = recentWeeklyMiles(records);
  const goalPace = targetSeconds / distance;
  const volumeNeeded = volumeForPace(goalPace);

  /* ONE PREDICTOR, SO THE CARD CANNOT DISAGREE WITH ITSELF.

     This banner and the tiles under it ran different predictions, and on
     Preston's live account they contradicted each other on half his goals:
     the pill said "Behind the rate · 5:13 at today's fitness" while the
     banner directly above it said "Already within reach — worth about 4:57".
     Both were defensible in isolation. Together they are just noise, and an
     athlete has no way to know which half to believe.

     predictRaceFromLegacyMethod is now the only answer to "what are you worth
     at this distance", and it weighs every effort with a penalty for how far
     it had to be stretched rather than accepting only near-distance ones. */
  const prediction = predictRaceFromLegacyMethod(records, distance, excluded);
  const best = prediction?.source || null;

  if (!best) {
    return { goal: goal.title, verdict: 'needs-more',
      say: `Forge cannot judge this yet — no hard continuous run in the last ${RACE_EVIDENCE_WINDOW_DAYS / 30} months to predict from.`,
      change: `Run ${distance <= 1 ? 'a hard mile' : `${Math.min(distance, 3).toFixed(distance < 2 ? 0 : 1)} miles`} as one effort and log it. That one session makes every projection here real.` };
  }

  /* What they are worth at the goal distance TODAY, and the best they could
     honestly be worth by the deadline. The prediction is stretched by how far
     their running volume falls short of what the goal pace is built on, so a
     fast mile off thirteen miles a week is not read as a 5K result. */
  const volumeShortfall = volumeNeeded ? Math.max(0, 1 - volume / volumeNeeded) : 0;
  /* The volume stretch is applied INSIDE the predictor now, so applying it
     again here would charge the athlete for it twice — which read as Preston's
     5K sliding from "reachable, but not on this volume" to "out of reach"
     without anything about him changing. */
  const nowAtDistance = prediction!.seconds;
  /* WHAT THE PREDICTION IS BUILT ON, named at full precision. The distance was
     printed with toFixed(0), so a 1.4-mile effort appeared as "your 1-mile" —
     which turned an obviously bad log into a credible-sounding claim and hid
     the one detail that would have told the athlete not to believe it. */
  const from = `your ${round1(best.miles)} mi in ${clock(best.seconds)}`;
  const ceiling = reachableSeconds(nowAtDistance, weeks);
  const shortfall = (nowAtDistance - targetSeconds) / nowAtDistance;
  /* What the horizon actually buys, stated as the number it is — saying "it
     takes about 16 weeks" to someone who has 16 weeks is not an answer. */
  const affordable = 1 - reachableSeconds(1, weeks);

  if (targetSeconds >= nowAtDistance) {
    return { goal: goal.title, verdict: 'reachable',
      say: `Already within reach — ${from} is worth about ${clock(nowAtDistance)} here.`,
      needs: { weeklyMiles: Math.round(volumeNeeded), running: Math.round(volume) },
      change: volume < volumeNeeded * 0.7 ? `Hold ${Math.round(volumeNeeded)} miles a week and race it.` : undefined };
  }

  if (targetSeconds < ceiling) {
    return { goal: goal.title, verdict: 'out-of-reach',
      say: `Not by ${new Date(`${goal.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. You are worth about ${clock(nowAtDistance)} today, so this asks for ${Math.round(shortfall * 100)}% — and ${Math.round(weeks)} weeks of good training buys about ${Math.round(affordable * 100)}%.`,
      insteadOf: `${clock(ceiling)} is the reachable target for this date. Keep ${clock(targetSeconds)} for next year.`,
      needs: { weeklyMiles: Math.round(volumeNeeded), running: Math.round(volume) },
      change: volume < volumeNeeded * 0.7
        ? `${clock(goalPace)}/mi is normally built on about ${Math.round(volumeNeeded)} miles a week. You are running ${volume.toFixed(0)}.`
        : `Add work at ${clock(goalPace)}/mi — the pace has to be trained, not just the distance.` };
  }

  /* Reachable on the clock, but the volume behind it may not be there. */
  if (volume < volumeNeeded * 0.7) {
    return { goal: goal.title, verdict: 'needs-more',
      say: `Reachable, but not on ${volume.toFixed(0)} miles a week. ${clock(goalPace)}/mi is normally built on about ${Math.round(volumeNeeded)}.`,
      needs: { weeklyMiles: Math.round(volumeNeeded), running: Math.round(volume) },
      change: `Build to ${Math.round(volumeNeeded)} miles a week over the next ${Math.min(8, Math.round(weeks / 2))} weeks, no more than 10% up per week.` };
  }
  return { goal: goal.title, verdict: 'reachable',
    say: `On the numbers this holds: ${clock(nowAtDistance)} today, ${clock(targetSeconds)} needed, ${Math.round(weeks)} weeks to find ${Math.round(shortfall * 100)}%.`,
    needs: { weeklyMiles: Math.round(volumeNeeded), running: Math.round(volume) },
    change: `Keep the volume and put the quality work at ${clock(goalPace)}/mi.` };
}

/* A LIFT GOAL IS THE SAME QUESTION WITH DIFFERENT ARITHMETIC. Around 1% a week
   on a calculated max is a strong block for an intermediate lifter; a beginner
   can beat it and an advanced lifter will not come close. */
const STRENGTH_WEEKLY_GAIN = 0.01;
function liftFeasibility(goal: CreatedGoal, records: WorkoutRecord[]): Feasibility | null {
  const target = Number.parseFloat(String(goal.target).replace(/[^0-9.]/g, ''));
  if (!target || !goal.exercise) return null;
  const weeks = weeksUntil(goal.date);
  let best = 0;
  records.forEach(record => (record.topSets || []).forEach(set => {
    if (set.completed === false || !set.lift || !sameLift(set.lift, String(goal.exercise))) return;
    const max = set.calculatedMax || calculateEstimatedOneRepMax(set.weight, set.reps) || 0;
    if (max > best) best = max;
  }));
  if (!best) {
    return { goal: goal.title, verdict: 'needs-more',
      say: `No ${goal.exercise} on file, so there is nothing to project from.`,
      change: `Log one heavy set of ${goal.exercise} and this becomes a real number.` };
  }
  if (best >= target) return { goal: goal.title, verdict: 'reachable', say: `Reached — your best ${goal.exercise} already estimates ${Math.round(best)}.` };
  const ceiling = best * Math.pow(1 + STRENGTH_WEEKLY_GAIN, Math.min(weeks, MAX_IMPROVEMENT_WEEKS * 2));
  const needed = (target - best) / best;
  if (target > ceiling) {
    const weeksNeeded = Math.ceil(Math.log(target / best) / Math.log(1 + STRENGTH_WEEKLY_GAIN));
    return { goal: goal.title, verdict: 'out-of-reach',
      say: `Not by ${new Date(`${goal.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. You are at ${Math.round(best)} and ${Math.round(needed * 100)}% in ${Math.round(weeks)} weeks is not a normal block — about ${weeksNeeded} weeks is.`,
      insteadOf: `${Math.round(ceiling / 5) * 5} is the reachable target for this date.` };
  }
  return { goal: goal.title, verdict: 'reachable',
    say: `On the numbers this holds: ${Math.round(best)} today, ${Math.round(target)} needed, ${Math.round(weeks)} weeks to find ${Math.round(needed * 100)}%.` };
}

export function goalFeasibility(goals: CreatedGoal[], records: WorkoutRecord[], cap?: { maxWeeklyMileage?: number; excludedEfforts?: string[] }): Feasibility[] {
  const ceiling = Number(cap?.maxWeeklyMileage) || 0;
  const excluded = cap?.excludedEfforts || [];
  return goals.flatMap(goal => {
    const result = goal.type === 'Endurance' ? raceFeasibility(goal, records, excluded)
      : goal.type === 'Strength' ? liftFeasibility(goal, records)
      : null;
    if (!result) return [];
    /* AND A CEILING THE ATHLETE SET THEMSELVES CAN MAKE A GOAL IMPOSSIBLE.
       Preston capped his running at 25 miles a week and asked for a pace built
       on 35. Forge ramped obediently to 25 and said nothing — the goal and the
       constraint contradicted each other in his own settings for months. The
       cap is his to keep; being told it does not reach the goal is the point. */
    if (ceiling && goal.type === 'Endurance') {
      const needed = volumeForPace(clockToSeconds(goal.target, String(goal.unit || '').includes('hh:mm:ss')) / (milesOf(goal) || 1));
      if (needed > ceiling) {
        return [{ ...result,
          needs: { weeklyMiles: Math.round(needed), running: result.needs?.running ?? 0, ceiling: Math.round(ceiling) },
          change: `${result.change ? `${result.change} ` : ''}Your weekly mileage is capped at ${Math.round(ceiling)} in settings and this pace is normally built on about ${Math.round(needed)} — raise the cap or move the target.` }];
      }
    }
    return [result];
  });
}

/* SEVERAL RACES ON ONE DATE IS NOT A PLAN. Preston had a mile, a two-mile and a
   5K all due December 31 — three different builds, none of which gets one. The
   block can only peak for one, so the athlete is told to pick rather than
   quietly given a compromise that serves none of them. */
export function competingRaces(goals: CreatedGoal[]): { date: string; races: string[] } | null {
  const byDate = new Map<string, string[]>();
  goals.filter(goal => goal.type === 'Endurance' && goal.date).forEach(goal => {
    byDate.set(goal.date, [...(byDate.get(goal.date) || []), goal.title]);
  });
  const clash = [...byDate].find(([, races]) => races.length > 1);
  return clash ? { date: clash[0], races: clash[1] } : null;
}
