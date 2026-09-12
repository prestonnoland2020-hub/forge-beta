/* DID THE SESSION GO THE WAY IT WAS ASKED FOR?

   Forge could tell an athlete what to run, and it could tell that they had run
   it — sessionAlreadyDone exists precisely so a session is not prescribed
   twice. What it could never tell was HOW IT WENT. "5 × 1200 m @ 4:42" went
   out; nothing ever came back.

   That is the richest signal a training app has and it was on the floor. An
   athlete hitting every repeat ten seconds fast is telling you their threshold
   is stale and the whole block is pitched under them. An athlete whose last
   two repeats fall apart every single week is telling you the pace is wrong,
   and they will read it as their own failure rather than the plan's until
   somebody says otherwise. Both are invisible from "did they log something".

   So the prescription is parsed back out of the sentence Forge wrote, the
   logged repeats are read off the session, and the two are compared. What
   comes out is a verdict and one sentence in the coach's voice — which is
   what the check-in asks about the next morning, and what tells the block it
   is asking too much or not enough. */

import type { LegacyCardioInterval } from './cardioSession';

/* Tolerances, and they are deliberately generous. Track repeats off a watch
   land at 398 m and 412 m; a stopwatch caught by hand is a second out either
   way. The job is to notice a pattern, never to referee a single rep. */
export const ON_PACE = 0.03;
/* Faster than this is not "a good day", it is evidence the target is stale. */
export const CLEARLY_FASTER = 0.04;
/* Slower than this is the session not having gone in. */
export const CLEARLY_SLOWER = 0.05;
/* A finish this much slower than the start is a fade, however good the average
   looked — the average hides exactly the thing worth seeing. */
export const FADE_MARGIN = 0.05;
/* Missing this share of the prescribed repeats is a short session. */
export const SHORT_SHARE = 0.75;
/* How many sessions in a row make a trend rather than a day. */
export const TREND_RUN = 3;

const METRES_PER_MILE = 1609.344;
const clockSeconds = (minutes: number, seconds: number) => minutes * 60 + seconds;

export type PrescriptionKind = 'intervals' | 'reps' | 'racepace' | 'threshold' | 'test';
export type Prescription = {
  kind: PrescriptionKind;
  /* Repeats asked for; 1 for a continuous effort. */
  reps: number;
  /* Metres per repeat, when the session is measured by distance. */
  metres?: number;
  /* Minutes per repeat, when it is measured by time. */
  minutes?: number;
  /* Seconds per mile the work is meant to be run at. */
  targetPace: number;
};

/* THE SENTENCE FORGE WROTE, READ BACK. Parsing our own output looks circular
   and is the opposite: the card is the contract with the athlete, so the card
   is what the verdict has to be measured against. A session whose text cannot
   be parsed returns null and is simply not judged. */
export function parsePrescription(text: string | undefined | null): Prescription | null {
  const raw = String(text || '').trim();
  if (!raw || /no goal|easy only|recovered|owns it|fartlek|strides|baseline/i.test(raw)) return null;

  const paceMatch = raw.match(/@\s*(\d+):(\d{2})\s*\/\s*mi/i);
  const repMatch = raw.match(/@\s*(\d+):(\d{2})\s*\/\s*rep/i);

  /* "12 min continuous @ 7:23/mi · threshold" and
     "3 × 8 min @ 7:23/mi · 90 s jog between · threshold" */
  const minutes = raw.match(/(?:(\d+)\s*[x×]\s*)?(\d+)\s*min/i);
  if (minutes && paceMatch && /threshold/i.test(raw)) {
    return {
      kind: 'threshold',
      reps: Number(minutes[1] || 1),
      minutes: Number(minutes[2]),
      targetPace: clockSeconds(Number(paceMatch[1]), Number(paceMatch[2])),
    };
  }

  /* "8 × 400 m @ 1:34/rep", "8 × 300 m @ 1:03/rep · full recovery" */
  const metres = raw.match(/(\d+)\s*[x×]\s*(\d+)\s*m\b/i);
  if (metres && repMatch) {
    const each = Number(metres[2]);
    const seconds = clockSeconds(Number(repMatch[1]), Number(repMatch[2]));
    return {
      kind: /full recovery/i.test(raw) ? 'reps' : /race pace/i.test(raw) ? 'racepace' : 'intervals',
      reps: Number(metres[1]),
      metres: each,
      targetPace: (seconds / each) * METRES_PER_MILE,
    };
  }

  /* "3 × 1.5 mi @ 7:00/mi · race pace", "7 mi @ 9:09/mi · race pace", and
     "4 × 1 mi @ 6:16/rep" — a rep long enough to be written in miles still
     carries a per-REP target, because that is the number you run it off. */
  const miles = raw.match(/(?:(\d+)\s*[x×]\s*)?([\d.]+)\s*mi\b/i);
  if (miles && (paceMatch || repMatch)) {
    const each = Number(miles[2]) * METRES_PER_MILE;
    const targetPace = paceMatch
      ? clockSeconds(Number(paceMatch[1]), Number(paceMatch[2]))
      : (clockSeconds(Number(repMatch![1]), Number(repMatch![2])) / each) * METRES_PER_MILE;
    return {
      kind: /race pace/i.test(raw) ? 'racepace' : 'intervals',
      reps: Number(miles[1] || 1),
      metres: each,
      targetPace,
    };
  }
  return null;
}

/* THE REPEATS THE ATHLETE ACTUALLY RAN. A logged session carries warm-up and
   cool-down lines alongside the work; judging a session on its warm-up is the
   obvious way to get this wrong, so only work segments count. Older logs have
   no segment at all, in which case the short, fast lines are the work and the
   long slow ones at either end are not. */
export type Effort = { metres: number; seconds: number };

const toMetres = (distance: number, unit: string) => {
  const value = Number(distance) || 0;
  if (!value) return 0;
  const name = String(unit || '').toLowerCase();
  if (/^m(eter|etre)?s?$/.test(name)) return value;
  if (/^k(m|ilometer|ilometre)s?$/.test(name)) return value * 1000;
  if (/^(yd|yard)s?$/.test(name)) return value * 0.9144;
  return value * METRES_PER_MILE;
};

export function workEfforts(rows: LegacyCardioInterval[] | undefined | null): Effort[] {
  const lines = (rows || []).map(row => {
    const entry = row as LegacyCardioInterval & { segment?: string };
    return {
      segment: String(entry.segment || '').toLowerCase(),
      metres: toMetres(Number(entry.distance) || 0, String(entry.unit || entry.distanceUnit || 'miles')),
      seconds: (Number(entry.time) || 0) * 60,
      type: String(entry.cardioType || entry.activity || ''),
    };
  }).filter(line => line.metres > 0 && line.seconds > 0);
  if (!lines.length) return [];

  const tagged = lines.filter(line => line.segment === 'work');
  if (tagged.length) return tagged.map(({ metres, seconds }) => ({ metres, seconds }));

  /* No segments recorded. The work is whatever was run faster than the session
     average; a warm-up and a cool-down are not. With fewer than three lines
     there is nothing to separate and the whole thing is the effort. */
  if (lines.length < 3) return lines.map(({ metres, seconds }) => ({ metres, seconds }));
  const paces = lines.map(line => line.seconds / line.metres);
  const average = paces.reduce((total, pace) => total + pace, 0) / paces.length;
  const fast = lines.filter((line, index) => paces[index] <= average);
  return (fast.length ? fast : lines).map(({ metres, seconds }) => ({ metres, seconds }));
}

export type VerdictOutcome = 'on' | 'faster' | 'slower' | 'faded' | 'short' | 'unmeasured';
export type SessionVerdict = {
  outcome: VerdictOutcome;
  /* Seconds per mile actually run across the work. */
  actualPace: number;
  targetPace: number;
  /* Positive means slower than asked. */
  driftShare: number;
  completed: number;
  prescribed: number;
  /* One sentence, in the coach's voice, naming the numbers. */
  say: string;
  /* What the next morning's check-in should open with. */
  ask: string;
};

const clock = (seconds: number) => {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const plusMinus = (seconds: number) => `${seconds >= 0 ? '+' : '−'}${Math.abs(Math.round(seconds))} s`;

export function sessionVerdict(prescription: Prescription | null, efforts: Effort[]): SessionVerdict | null {
  if (!prescription) return null;
  const done = efforts.filter(effort => effort.metres > 0 && effort.seconds > 0);
  const blank = { targetPace: prescription.targetPace, prescribed: prescription.reps };
  if (!done.length) {
    return { ...blank, outcome: 'unmeasured', actualPace: 0, driftShare: 0, completed: 0,
      say: 'That session was logged without times, so there is nothing to read from it.',
      ask: 'How did that session go?' };
  }

  const metres = done.reduce((total, effort) => total + effort.metres, 0);
  const seconds = done.reduce((total, effort) => total + effort.seconds, 0);
  const actualPace = (seconds / metres) * METRES_PER_MILE;
  const driftShare = (actualPace - prescription.targetPace) / prescription.targetPace;
  const perRep = (pace: number) => prescription.metres ? (pace / METRES_PER_MILE) * prescription.metres : 0;
  const gap = perRep(actualPace) - perRep(prescription.targetPace);
  /* A continuous effort is described as what it is. "1 × 15 min" is the kind
     of phrasing that tells an athlete a machine wrote it. */
  const shape = prescription.metres
    ? `${done.length} × ${Math.round(prescription.metres)} m`
    : prescription.reps > 1
      ? `${done.length} × ${prescription.minutes} min`
      : `${prescription.minutes} min`;

  /* SHORT FIRST. A session cut in half that happened to be fast is not a fast
     session, and calling it one teaches the athlete that stopping early is
     rewarded. */
  if (prescription.reps > 1 && done.length < prescription.reps * SHORT_SHARE) {
    return { ...blank, outcome: 'short', actualPace, driftShare, completed: done.length,
      say: `You got through ${done.length} of ${prescription.reps}. Stopping there is a decision worth understanding before the next one is written.`,
      ask: `You stopped at ${done.length} of ${prescription.reps} reps. Was that the legs, the pace, or the day?` };
  }

  /* THEN THE FADE, because an average hides it. Three quick repeats and two
     that fell apart average out to a session that looks fine on paper and was
     not, and the fade is the part that says the pace was wrong. */
  if (done.length >= 4) {
    const third = Math.max(1, Math.floor(done.length / 3));
    const paceOf = (list: Effort[]) =>
      (list.reduce((total, e) => total + e.seconds, 0) / list.reduce((total, e) => total + e.metres, 0)) * METRES_PER_MILE;
    const opened = paceOf(done.slice(0, third));
    const finished = paceOf(done.slice(-third));
    if (opened > 0 && (finished - opened) / opened > FADE_MARGIN) {
      return { ...blank, outcome: 'faded', actualPace, driftShare, completed: done.length,
        say: `You opened at ${clock(opened)}/mi and finished at ${clock(finished)}/mi. The session went out too hard for the shape you are in, which is a pacing problem rather than a fitness one.`,
        ask: `You faded over the last few reps — ${clock(opened)}/mi out, ${clock(finished)}/mi home. Was that the legs or did it just go out hot?` };
    }
  }

  if (driftShare < -CLEARLY_FASTER) {
    return { ...blank, outcome: 'faster', actualPace, driftShare, completed: done.length,
      say: `${shape} at ${clock(actualPace)}/mi against ${clock(prescription.targetPace)}/mi asked${gap ? ` — ${plusMinus(gap)} a rep` : ''}. That is comfortably ahead of the target this block was built on.`,
      ask: `You ran that ${Math.abs(Math.round(gap)) || Math.round(Math.abs(driftShare) * 100)}${gap ? ' s a rep' : '%'} faster than asked. Did it feel like a session or like a race?` };
  }
  if (driftShare > CLEARLY_SLOWER) {
    return { ...blank, outcome: 'slower', actualPace, driftShare, completed: done.length,
      say: `${shape} at ${clock(actualPace)}/mi against ${clock(prescription.targetPace)}/mi asked${gap ? ` — ${plusMinus(gap)} a rep` : ''}.`,
      ask: `That one came in slower than the target. Was it the legs, the weather, or is the pace too hot?` };
  }
  return { ...blank, outcome: 'on', actualPace, driftShare, completed: done.length,
    say: `${shape} at ${clock(actualPace)}/mi, against ${clock(prescription.targetPace)}/mi asked. That is the session as written.`,
    ask: 'You hit that one on the nose. How did it feel?' };
}

/* A DAY IS NOT A TREND. One fast session is a good day and one slow session is
   a bad night's sleep; three of either is the plan being wrong, and the plan
   is the thing Forge can actually change. */
export type SessionTrend = { kind: 'paces-stale' | 'asking-too-much'; run: number; say: string; instruction: string };

export function sessionTrend(verdicts: Array<Pick<SessionVerdict, 'outcome'>>, run = TREND_RUN): SessionTrend | null {
  const judged = verdicts.filter(verdict => verdict.outcome !== 'unmeasured').slice(0, run);
  if (judged.length < run) return null;
  if (judged.every(verdict => verdict.outcome === 'faster')) {
    return { kind: 'paces-stale', run: judged.length,
      say: `Your last ${judged.length} hard sessions all came in ahead of the pace they were written at. The block is pitched under you.`,
      instruction: 'My quality sessions are coming in faster than prescribed. Re-test my fitness and rebuild the paces from a recent hard effort.' };
  }
  if (judged.every(verdict => verdict.outcome === 'slower' || verdict.outcome === 'faded' || verdict.outcome === 'short')) {
    return { kind: 'asking-too-much', run: judged.length,
      say: `Your last ${judged.length} hard sessions all came in short of what was asked. That is the prescription being wrong, not you.`,
      instruction: 'I am not hitting my quality sessions. Ease the target paces back to what I have actually been running and rebuild from there.' };
  }
  return null;
}
