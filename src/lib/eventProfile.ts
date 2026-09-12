/* A RACE IS NOT A SCALED VERSION OF ANOTHER RACE.

   Forge alternated threshold and intervals on the same rotation whatever the
   athlete was training for, which is a 5K plan wearing six different names. A
   miler and a marathoner share almost nothing but the verb: one is limited by
   how fast they can turn over when the aerobic system is already saturated,
   the other by how long they can hold a pace that never saturates it at all.
   Same weeks, same alternation, two athletes who need opposite training.

   This is the table that fixes it, and it is deliberately a table. The ratios
   below are ordinary coaching practice, not a discovery — the value is that
   they live in ONE place and every surface reads them, rather than being
   re-derived by whichever file needed a session that day.

   Each profile says four things:

     shape        how much of the block is base before it turns race-specific.
                  Short events sharpen sooner; long ones need the base for
                  longer, because there is nothing to sharpen without it.
     longRunShare how much of the week the long run may take. A marathon long
                  run is the point of the week; a mile long run is a long easy
                  run and nothing more.
     rotation     which hard session each phase leans on, cycled by week.
     racePace     which training pace the race-specific work is run at. */

import type { TrainingPhase } from './trainingPhase';
import type { PhaseShape } from './trainingPhase';
import type { PaceModel } from './paceModel';

/* 'reps' is short and fast with full recovery — neuromuscular, not aerobic.
   'racepace' is sustained running at the goal's own pace, which for a marathon
   is most of the specific work and for a mile is the race itself. */
export type SessionKind = 'threshold' | 'intervals' | 'reps' | 'racepace' | 'fartlek' | 'strides' | 'test' | 'baseline' | 'none';

export type EventProfile = {
  key: string;
  label: string;
  miles: number;
  shape: PhaseShape;
  longRunShare: number;
  rotation: Record<'Foundation' | 'Build' | 'Specific', SessionKind[]>;
  racePace: keyof Pick<PaceModel, 'repetition' | 'interval' | 'threshold' | 'marathon'>;
  /* What the athlete is actually short of, said in one line. Shown when the
     plan explains itself; it is the reason the rotation looks like it does. */
  emphasis: string;
};

/* Ordered long to short so a lookup can fall to the nearest sane neighbour. */
export const EVENT_PROFILES: EventProfile[] = [
  {
    key: 'marathon', label: 'Marathon', miles: 26.219,
    shape: { foundationShare: 0.4, buildShare: 0.35 }, longRunShare: 0.35,
    rotation: {
      Foundation: ['threshold', 'threshold', 'intervals'],
      Build: ['threshold', 'racepace', 'threshold'],
      Specific: ['racepace', 'threshold', 'racepace'],
    },
    racePace: 'marathon',
    emphasis: 'Aerobic volume and durability first — the marathon is decided by how long the pace holds, not how fast it starts.',
  },
  {
    key: 'half', label: 'Half marathon', miles: 13.109,
    shape: { foundationShare: 0.35, buildShare: 0.35 }, longRunShare: 0.32,
    rotation: {
      Foundation: ['threshold', 'threshold', 'intervals'],
      Build: ['threshold', 'intervals', 'racepace'],
      Specific: ['racepace', 'threshold', 'intervals'],
    },
    racePace: 'threshold',
    emphasis: 'Threshold and fatigue resistance — a half is run barely under the line where the pace stops being sustainable.',
  },
  {
    key: '10k', label: '10K', miles: 6.214,
    shape: { foundationShare: 0.3, buildShare: 0.4 }, longRunShare: 0.3,
    rotation: {
      Foundation: ['threshold', 'threshold', 'intervals'],
      Build: ['threshold', 'intervals', 'threshold'],
      Specific: ['intervals', 'racepace', 'threshold'],
    },
    racePace: 'threshold',
    emphasis: 'Threshold with real aerobic volume under it, sharpened by VO2max work late.',
  },
  {
    key: '5k', label: '5K', miles: 3.107,
    shape: { foundationShare: 0.3, buildShare: 0.4 }, longRunShare: 0.3,
    rotation: {
      Foundation: ['threshold', 'threshold', 'intervals'],
      Build: ['threshold', 'intervals', 'threshold'],
      Specific: ['intervals', 'intervals', 'threshold'],
    },
    racePace: 'interval',
    emphasis: 'Threshold builds the ceiling, VO2max work raises it — the 5K sits almost exactly between the two.',
  },
  {
    key: '2mile', label: '2 Mile', miles: 2,
    shape: { foundationShare: 0.28, buildShare: 0.37 }, longRunShare: 0.28,
    rotation: {
      Foundation: ['threshold', 'intervals', 'threshold'],
      Build: ['intervals', 'threshold', 'reps'],
      Specific: ['intervals', 'reps', 'intervals'],
    },
    racePace: 'interval',
    emphasis: 'VO2max and speed endurance, on a threshold base — two miles is aerobic, but only just.',
  },
  {
    key: 'mile', label: 'Mile', miles: 1,
    shape: { foundationShare: 0.25, buildShare: 0.35 }, longRunShare: 0.25,
    rotation: {
      Foundation: ['threshold', 'intervals', 'strides'],
      Build: ['intervals', 'reps', 'threshold'],
      Specific: ['reps', 'intervals', 'racepace'],
    },
    racePace: 'repetition',
    emphasis: 'Speed, economy and speed endurance — with enough aerobic work underneath that the last 400 does not fall apart.',
  },
];

const FALLBACK = EVENT_PROFILES.find(profile => profile.key === '5k') as EventProfile;

/* The nearest profile by distance, so an event nobody thought of — a 4 mile, a
   12K — trains like the race it most resembles instead of like a 5K. */
export function eventProfileFor(miles: number | undefined | null): EventProfile {
  const distance = Number(miles) || 0;
  if (!distance) return FALLBACK;
  return EVENT_PROFILES.reduce((best, profile) =>
    Math.abs(Math.log(profile.miles / distance)) < Math.abs(Math.log(best.miles / distance)) ? profile : best, FALLBACK);
}

/* WHICH HARD SESSION THIS WEEK. The phase picks the rotation, the week index
   picks the entry. Deload, taper and race week are the same for everyone —
   they are about recovery and sharpening, not about the event. */
export function sessionKindFor(profile: EventProfile, phase: TrainingPhase, weekIndex: number): SessionKind {
  if (phase === 'Race') return 'test';
  if (phase === 'Taper') return 'strides';
  if (phase === 'Deload') return 'fartlek';
  const rotation = profile.rotation[phase];
  return rotation[((weekIndex % rotation.length) + rotation.length) % rotation.length];
}
