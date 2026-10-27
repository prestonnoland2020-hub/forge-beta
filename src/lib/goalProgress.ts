import type { CreatedGoal } from '../components/GoalBuilder';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import type { Feasibility } from './goalFeasibility';
import { calculateEstimatedOneRepMax } from './strength';
import { sameLift } from './liftAliases';
import { clockToSeconds } from './time';

/* HOW FAR ALONG A GOAL IS, AS ONE NUMBER AND ONE COLOUR.

   The Goals page is the crux of the app and read as a list of titles. This is
   what lets it draw a bar instead: where the athlete is now, as a share of the
   way to the target, and how the engine rates the rest of the way.

     strength   best calculated max on the lift (or best reps, for a rep goal)
                over the target — 180 of 225 is 80%
     body       the distance covered from the starting weight toward the
                target — 200 → 185 → 180 is 75%, either direction
     endurance  a time goal is target over current (lower is better), a
                distance goal current over target

   COLOUR IS THE VERDICT, not the bar's length. Halfway to a goal due next
   week is not halfway to one due next year, and goalFeasibility already
   knows which is which: green on track (or reached), yellow needs more work,
   red out of reach. With nothing logged there is no bar to draw, and the goal
   says so rather than drawing a zero. */

/* WHICH MAX A STRENGTH GOAL IS MEASURED BY. Calculated is the best estimate
   from any completed set (Epley); tested is the heaviest completed single,
   or the starting 1RM entered on the goal — the same evidence the goal's own
   detail card calls a Real 1RM. A rep goal is reps either way. */
export type MaxMode = 'calculated' | 'tested';

export type GoalTone = 'reached' | 'on-track' | 'needs-work' | 'off-track' | 'unknown';
export type GoalProgress = {
  /* 0–1, or null when nothing is known yet. */
  share: number | null;
  current: number | null;
  /* What the bar is labelled with: "180 lb", "24:30". */
  currentText: string;
  targetText: string;
  tone: GoalTone;
  label: string;
};

const numeric = (value?: string) => Number(String(value ?? '').replace(/[^0-9.]/g, '')) || 0;
const isTime = (unit?: string) => /mm:ss|hh:mm/i.test(String(unit || ''));
const clock = (seconds: number) => {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
};
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function strengthCurrent(goal: CreatedGoal, records: WorkoutRecord[], mode: MaxMode): number | null {
  const lift = goal.exercise || '';
  const reps = goal.unit === 'reps';
  const tested = mode === 'tested' && !reps;
  let best = tested ? numeric(goal.current) : 0;
  for (const record of records) for (const set of record.topSets || []) {
    if (set.completed === false || !lift || !sameLift(set.lift, lift)) continue;
    if (tested && Number(set.reps) !== 1) continue;
    const value = reps ? Number(set.reps) || 0 : tested ? Number(set.weight) || 0 : calculateEstimatedOneRepMax(Number(set.weight) || 0, Number(set.reps) || 0) || 0;
    if (value > best) best = value;
  }
  return best || (tested ? null : numeric(goal.current) || null);
}

export function goalProgress(goal: CreatedGoal, records: WorkoutRecord[], verdict: Feasibility | undefined, setup?: { startingWeight?: string; currentWeight?: string } | null, mode: MaxMode = 'calculated'): GoalProgress {
  const unit = goal.unit || String(goal.target || '').split(' ').slice(1).join(' ');
  const time = isTime(unit);
  const hoursFirst = /hh/i.test(unit);
  const target = time ? clockToSeconds(String(goal.target).split(' ')[0], hoursFirst) : numeric(goal.target);
  const show = (value: number) => time ? clock(value) : `${Math.round(value * 10) / 10}${unit && unit !== 'reps' ? ` ${unit}` : unit === 'reps' ? ' reps' : ''}`;

  let current: number | null = null;
  let share: number | null = null;
  if (goal.type === 'Strength') {
    current = strengthCurrent(goal, records, mode);
    share = current && target ? clamp01(current / target) : null;
  } else if (goal.type === 'Body Composition') {
    const weighed = records.filter(record => Number(record.bodyWeight) > 0).sort((a, b) => a.date.localeCompare(b.date));
    const start = numeric(goal.current) || numeric(setup?.startingWeight) || Number(weighed[0]?.bodyWeight) || 0;
    current = Number(weighed.at(-1)?.bodyWeight) || numeric(setup?.currentWeight) || start || null;
    if (current && start && target) share = start === target ? 1 : clamp01((start - current) / (start - target));
  } else {
    const entered = time ? clockToSeconds(goal.current || '', hoursFirst) : numeric(goal.current);
    current = entered || null;
    if (current && target) share = clamp01(time ? target / current : current / target);
  }

  const reached = share !== null && share >= 1;
  const tone: GoalTone = reached ? 'reached'
    : !verdict || share === null ? (share === null ? 'unknown' : 'needs-work')
    : verdict.verdict === 'reachable' ? 'on-track'
    : verdict.verdict === 'out-of-reach' ? 'off-track'
    : 'needs-work';
  const label = reached ? 'Reached' : tone === 'on-track' ? 'On track' : tone === 'off-track' ? 'Out of reach' : tone === 'unknown' ? (goal.type === 'Strength' && mode === 'tested' && goal.unit !== 'reps' ? 'No tested max yet' : 'Log it to start') : verdict?.reason === 'evidence' ? 'Too early to tell' : 'Needs more work';
  return { share, current, currentText: current ? show(current) : '—', targetText: target ? show(target) : String(goal.target || ''), tone, label };
}
