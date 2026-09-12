/* ONE PACE MODEL, FROM THE BEST EVIDENCE THE ATHLETE HAS GIVEN.

   Forge had three unrelated derivations of how fast to run. Easy pace was the
   median of everything logged. Threshold was computed from the GOAL. Rep pace
   was the goal itself. Nothing reconciled them, so a single athlete could be
   handed an easy pace built from what they do, a tempo built from what they
   want, and intervals built from a race they have not run — three different
   athletes' training, printed on one card.

   This is the fix, and it is the same one every serious system makes: pick the
   single most reliable performance the athlete has actually produced, and
   derive every training pace from that one number. Fitness is a thing you
   demonstrate. It is not a thing you enter into a form.

   THE HIERARCHY (PART 8 of the coaching brief, and ordinary coaching sense):

     1. a recent hard continuous run — the closest thing to a race
     2. an older hard continuous run, when nothing recent exists
     3. the goal, used ONLY as a last resort and labelled as unsupported

   A goal is not evidence of fitness. When the model is running off a goal it
   says so, and every consumer is free to refuse to prescribe from it. */

import { equivalentSeconds, volumeForPace } from './goalFeasibility';
import { isRaceEvidence } from './runQuality';
import { cardioMiles, summarizeCardioDraft } from './cardioSession';

/* Canonical race durations the training paces are anchored to. These are the
   standard physiological anchors, not arbitrary distances: threshold is about
   an hour of racing, VO2max work is run at about 3K effort, and repetition
   work at about mile effort. */
export const THRESHOLD_MILES = 6.214;   /* ~10K: about an hour for most people */
export const INTERVAL_MILES = 1.864;    /* 3K */
export const REPETITION_MILES = 1;
export const MARATHON_MILES = 26.219;

/* Easy pace as a multiple of threshold. The wide end is deliberate: easy
   running has a range, and an athlete who is already running easy inside it
   should not be told they are doing it wrong. */
export const EASY_MULTIPLE_FAST = 1.24;
export const EASY_MULTIPLE_SLOW = 1.40;

/* An effort older than this stops being a statement about current fitness.
   It is still the best thing available when nothing newer exists, and the
   model says which it used. */
export const RECENT_EVIDENCE_DAYS = 70;

export type PaceSource = 'recent-run' | 'older-run' | 'goal' | 'none';

export type PerformanceEvidence = { miles: number; seconds: number; date: string };

export type PaceModel = {
  source: PaceSource;
  /* True only when a real performance is behind these numbers. */
  supported: boolean;
  from: PerformanceEvidence | null;
  /* All seconds per mile. */
  easyFast: number;
  easySlow: number;
  marathon: number;
  threshold: number;
  interval: number;
  repetition: number;
};

type CardioRecord = { date: string; cardioSessions?: Array<Record<string, unknown>> };

/* THE HARDEST CONTINUOUS RUN, which is the only kind that predicts a race.
   An interval session logged as many lines is not one effort and cannot be
   carried to a race distance; runQuality decides what is a run at all, so
   this file cannot drift from the rest of the app. */
export function hardestEffort(records: CardioRecord[], sinceIso?: string): PerformanceEvidence | null {
  let best: (PerformanceEvidence & { mileEquivalent: number }) | null = null;
  for (const record of records || []) {
    if (sinceIso && String(record.date) < sinceIso) continue;
    for (const raw of record.cardioSessions || []) {
      const session = raw as { activity?: string; prescription?: { legacyIntervals?: unknown[] } };
      if (!/run/i.test(session.activity || '')) continue;
      const intervals = session.prescription?.legacyIntervals;
      if (Array.isArray(intervals) && intervals.length > 1) continue;
      const miles = cardioMiles(raw as never);
      const minutes = summarizeCardioDraft(raw as never).minutes;
      if (miles < 0.75 || !minutes) continue;
      const seconds = minutes * 60;
      if (!isRaceEvidence(miles, seconds)) continue;
      const mileEquivalent = equivalentSeconds(seconds, miles, 1);
      if (!best || mileEquivalent < best.mileEquivalent) best = { miles, seconds, date: record.date, mileEquivalent };
    }
  }
  return best ? { miles: best.miles, seconds: best.seconds, date: best.date } : null;
}

/* CARRYING A SHORT EFFORT UP IN DISTANCE IS THE EASIEST WAY TO LIE.

   Preston's best recent run is a 5:48 mile. Read straight across, that is a
   7:03/mi marathon — off eight miles a week. The mile is a speed result and
   the marathon is an endurance one, and the gap between them is exactly the
   aerobic base he has not built. goalFeasibility already knows this and
   stretches its predictions by how far the athlete's volume falls short of
   what the pace is normally built on; the training paces have to use the same
   correction or the plan prescribes off a fitness nobody has.

   Going DOWN in distance needs no such help — a long-run result predicting a
   short race is if anything conservative. */
const paceAt = (evidence: PerformanceEvidence, miles: number, shortfall = 0) =>
  equivalentSeconds(evidence.seconds, evidence.miles, miles, shortfall) / miles;

/* How far the athlete's running falls short of the volume their own demonstrated
   pace is normally built on. Zero when they are training enough for it. */
export const volumeShortfall = (weeklyMiles: number, secondsPerMile: number) => {
  const needed = secondsPerMile ? volumeForPace(secondsPerMile) : 0;
  if (!needed || !(weeklyMiles > 0)) return needed ? 1 : 0;
  return Math.max(0, Math.min(1, 1 - weeklyMiles / needed));
};

export const emptyPaceModel: PaceModel = {
  source: 'none', supported: false, from: null,
  easyFast: 0, easySlow: 0, marathon: 0, threshold: 0, interval: 0, repetition: 0,
};

/* Build the model. `today` is injectable so the tests do not depend on when
   they are run. */
export function paceModel(
  records: CardioRecord[],
  goal?: { paceSecondsPerMile: number; miles: number } | null,
  today = new Date().toISOString().slice(0, 10),
  weeklyMiles = 0,
): PaceModel {
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - RECENT_EVIDENCE_DAYS);
  const sinceIso = cutoff.toISOString().slice(0, 10);

  const recent = hardestEffort(records, sinceIso);
  const older = recent ? null : hardestEffort(records);
  const evidence = recent || older
    || (goal && goal.paceSecondsPerMile > 0
      ? { miles: goal.miles, seconds: goal.paceSecondsPerMile * goal.miles, date: today }
      : null);
  if (!evidence) return emptyPaceModel;

  const source: PaceSource = recent ? 'recent-run' : older ? 'older-run' : 'goal';
  /* Measured against the effort's own pace, so the correction is about the gap
     between this athlete's speed and this athlete's base — not about the
     distance they happened to run that day. */
  const shortfall = volumeShortfall(weeklyMiles, evidence.seconds / evidence.miles);
  const threshold = paceAt(evidence, THRESHOLD_MILES, shortfall);
  return {
    source, supported: source !== 'goal', from: recent || older,
    easyFast: threshold * EASY_MULTIPLE_FAST,
    easySlow: threshold * EASY_MULTIPLE_SLOW,
    marathon: paceAt(evidence, MARATHON_MILES, shortfall),
    threshold,
    interval: paceAt(evidence, INTERVAL_MILES, shortfall),
    repetition: paceAt(evidence, REPETITION_MILES, shortfall) * 0.97,
  };
}

/* THE ATHLETE'S OWN EASY RUNNING IS EVIDENCE TOO. A derived band is the honest
   physiological answer, and someone already running easy slower than it is not
   doing anything wrong — telling them to speed up their recovery runs is the
   exact opposite of the point. So the band widens to hold what they actually
   do, and only ever narrows toward "too fast", which is the one error worth
   naming. */
export function easyBand(model: PaceModel, loggedEasySecondsPerMile = 0): { fast: number; slow: number } {
  if (!model.threshold) return { fast: loggedEasySecondsPerMile, slow: loggedEasySecondsPerMile };
  const slow = loggedEasySecondsPerMile > model.easySlow ? loggedEasySecondsPerMile : model.easySlow;
  return { fast: model.easyFast, slow };
}

/* Whether the athlete is running their easy days harder than easy — the single
   most common error in self-coached training, and the one the plan can fix by
   naming it once rather than by prescribing anything new. */
export const easyTooFast = (model: PaceModel, loggedEasySecondsPerMile: number) =>
  Boolean(model.threshold && loggedEasySecondsPerMile > 0 && loggedEasySecondsPerMile < model.easyFast);
