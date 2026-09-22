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
import { RIEGEL as RIEGEL_EXPONENT } from './riegel';
import { cardioMiles, summarizeCardioDraft, continuousRunEfforts } from './cardioSession';
import { effortKey, CONFIRMED_PREFIX } from './effortAudit';
import { fitnessCurve, predictFromCurve, type Effort, type Effort as CurveEffort } from './fitnessCurve';

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
/* Seconds per mile inside threshold that interval and repetition pace may reach. */
export const INTERVAL_MAX_GAP = 45;
export const REPETITION_MAX_GAP = 70;
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
  /* The fade rate the paces were carried at, and whether it is the athlete's
     own or the 1.06 population average. */
  exponent: number;
  fittedExponent: boolean;
};

type CardioRecord = { date: string; cardioSessions?: Array<Record<string, unknown>> };

/* THE CONTINUOUS RUNNING IN THE LOG, PIECE BY PIECE.

   This used to throw away any session logged as more than one line — the
   reasoning being that six times four hundred metres is not one effort and
   cannot be carried to a race distance. True, and it threw out the baby with
   it: a time trial is almost always logged as three lines, because a time
   trial is a warm-up, the effort, and a cool-down.

   Preston ran a 5:19 mile on 29 July and logged it exactly that way — one
   easy mile, the mile, one easy mile. Every training pace in his plan was
   built off the 5:48 he ran in August instead, because the 5:19 sat inside a
   three-line session and this refused to look. His threshold came out at
   7:54/mi, which is a minute and a half slower than his actual threshold, and
   the plan handed him a "hard run" at it.

   continuousRunEfforts takes a session apart and hands over each continuous
   piece on its own — which is what the race predictor has always used, and
   why the goal card could see the 5:19 while the plan could not. The guards
   that matter are per piece, not per session: runQuality rejects anything
   under half a mile, so the four-hundreds and the 0.31-mile repeats are out
   on their own merits, and the mile inside the session is in. */
export function continuousEfforts(records: CardioRecord[], sinceIso?: string, excluded: string[] = []): Effort[] {
  const blocked = new Set(excluded);
  const out: Effort[] = [];
  for (const record of records || []) {
    if (sinceIso && String(record.date) < sinceIso) continue;
    for (const raw of record.cardioSessions || []) {
      const session = raw as { activity?: string };
      if (!/run|jog|tempo|track|base|easy|speed|long/i.test(session.activity || '')) continue;
      for (const piece of continuousRunEfforts(raw as never)) {
        const seconds = piece.minutes * 60;
        if (piece.miles < 0.75 || !piece.minutes) continue;
        if (!isRaceEvidence(piece.miles, seconds)) continue;
        /* An effort the athlete has told Forge was not real cannot quietly
           come back as the source of every training pace. */
        if (blocked.has(effortKey({ date: record.date, miles: piece.miles, seconds }))) continue;
        out.push({ date: record.date, miles: piece.miles, seconds });
      }
    }
  }
  return out;
}

/* THE HARDEST CONTINUOUS RUN, over the same pieces the model is fitted from.
   It had its own copy of the filtering above, which is how the two came to
   disagree about whether a mile inside a time trial counts. */
export function hardestEffort(records: CardioRecord[], sinceIso?: string, excluded: string[] = []): PerformanceEvidence | null {
  let best: (Effort & { mileEquivalent: number }) | null = null;
  for (const effort of continuousEfforts(records, sinceIso, excluded)) {
    const mileEquivalent = equivalentSeconds(effort.seconds, effort.miles, 1);
    if (!best || mileEquivalent < best.mileEquivalent) best = { ...effort, mileEquivalent };
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
  source: 'none', supported: false, from: null, exponent: RIEGEL_EXPONENT, fittedExponent: false,
  easyFast: 0, easySlow: 0, marathon: 0, threshold: 0, interval: 0, repetition: 0,
};

/* Build the model. `today` is injectable so the tests do not depend on when
   they are run. */
export function paceModel(
  records: CardioRecord[],
  goal?: { paceSecondsPerMile: number; miles: number } | null,
  today = new Date().toISOString().slice(0, 10),
  weeklyMiles = 0,
  excluded: string[] = [],
  /* Judged sessions, already converted to dated efforts by workoutEvidence.
     Training paces built only from races go stale between races; this is the
     same fix as on the goal card and it has to be the same evidence, or the
     plan and the prediction start disagreeing about the athlete again. */
  workouts: CurveEffort[] = [],
): PaceModel {
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - RECENT_EVIDENCE_DAYS);
  const sinceIso = cutoff.toISOString().slice(0, 10);

  const recent = hardestEffort(records, sinceIso, excluded);
  const older = recent ? null : hardestEffort(records, undefined, excluded);
  const evidence = recent || older
    || (goal && goal.paceSecondsPerMile > 0
      ? { miles: goal.miles, seconds: goal.paceSecondsPerMile * goal.miles, date: today }
      : null);
  if (!evidence) return emptyPaceModel;

  const source: PaceSource = recent ? 'recent-run' : older ? 'older-run' : 'goal';

  /* THE SAME CURVE THE GOAL CARD USES, so the plan and the verdict cannot
     disagree about the athlete. Paces used to be carried off the single
     hardest run at a fixed 1.06; they are now read off the athlete's own
     fitted distance-time curve, which is set by their best few efforts and
     their own fade rate. With no logged running at all there is nothing to fit
     and the goal is carried across as before — still labelled unsupported. */
  const confirmed = new Set(excluded.filter(key => key.startsWith(CONFIRMED_PREFIX)).map(key => key.slice(CONFIRMED_PREFIX.length)));
  const curve = source === 'goal' ? null : fitnessCurve([...continuousEfforts(records, undefined, excluded), ...workouts], today, confirmed);

  /* Measured against the effort's own pace, so the correction is about the gap
     between this athlete's speed and this athlete's base — not about the
     distance they happened to run that day. */
  const shortfall = volumeShortfall(weeklyMiles, evidence.seconds / evidence.miles);
  const at = (miles: number) => {
    const fromCurve = curve ? predictFromCurve(curve, miles, shortfall) : null;
    return fromCurve ? fromCurve.seconds / miles : paceAt(evidence, miles, shortfall);
  };
  const threshold = at(THRESHOLD_MILES);
  /* The ladder's fast end is judged against the threshold their SPEED
     implies, before the volume correction — the shortfall is about endurance,
     and it must not drag a genuine fast mile's repetition pace with it. */
  const atFit = (miles: number) => { const fromCurve = curve ? predictFromCurve(curve, miles, 0) : null; return fromCurve ? fromCurve.seconds / miles : paceAt(evidence, miles, 0); };
  const thresholdFit = Math.min(threshold, atFit(THRESHOLD_MILES));
  return {
    source, supported: source !== 'goal', from: recent || older,
    exponent: curve ? curve.exponent : RIEGEL_EXPONENT,
    fittedExponent: Boolean(curve?.fitted),
    easyFast: threshold * EASY_MULTIPLE_FAST,
    easySlow: threshold * EASY_MULTIPLE_SLOW,
    /* AND MARATHON PACE STAYS A TRAINING PACE. Carried out to 26 miles on a
       steepening curve, an athlete with a sharp mile and eight miles a week
       gets a "marathon pace" slower than their easy run — which is a true
       statement about racing a marathon they should not enter, and a useless
       one to print on a workout. The ladder holds: marathon pace is never
       slower than a shade inside easy. */
    marathon: Math.min(at(MARATHON_MILES), threshold * EASY_MULTIPLE_FAST * 0.98),
    threshold,
    /* THE LADDER HOLDS AT THE FAST END TOO. Fitted through a sharp short
       effort, the curve put Preston's 3K pace at 5:11/mi under a 6:52
       threshold, and the deload fartlek printed it. Interval pace sits
       25–45 s/mi inside threshold for anyone; repetition pace a little inside
       that. Nothing on a workout card is faster than the ladder allows. */
    interval: Math.max(at(INTERVAL_MILES), thresholdFit - INTERVAL_MAX_GAP),
    repetition: Math.max(at(REPETITION_MILES) * 0.97, thresholdFit - REPETITION_MAX_GAP),
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

/* WHAT THEIR EASY RUNNING ACTUALLY IS, so the band above can be checked
   against it. Easy days are the ones run slower than threshold — a tempo is
   not an easy run that went well — and the median is taken rather than the
   mean so one hard finish does not move it. */
export const EASY_WINDOW_DAYS = 28;
export function loggedEasyPace(records: CardioRecord[], model: PaceModel, today = new Date().toISOString().slice(0, 10)): number {
  if (!model.threshold) return 0;
  const cutoff = new Date(`${today}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - EASY_WINDOW_DAYS);
  const since = cutoff.toISOString().slice(0, 10);
  const paces: number[] = [];
  for (const effort of continuousEfforts(records, since)) {
    const pace = effort.seconds / effort.miles;
    if (pace > model.threshold) paces.push(pace);
  }
  if (!paces.length) return 0;
  paces.sort((a, b) => a - b);
  const middle = paces.length >> 1;
  return paces.length % 2 ? paces[middle] : (paces[middle - 1] + paces[middle]) / 2;
}
