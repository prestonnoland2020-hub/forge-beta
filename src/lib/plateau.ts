import { bestsFromHistory, stallFrom } from '../features/training/aiPlanService';
import { canonicalLiftKey } from './liftAliases';
import { effortOf, estimateWithEffort } from './setEffort';
import { localDayIso } from './time';

/* A PLATEAU, AND WHAT THE COACH DOES ABOUT IT.

   The plan has always restarted a stalled lift quietly (STALL_EASE of the
   last two months' best, then climb). Quietly is the problem: the athlete
   sees a lighter number and no reason, and nothing else about the training
   changes. A coach names it — "you've been stuck under 245 for nine weeks" —
   changes the work, and gives a date to beat it by.

   The changes are the classic ones, the same for everybody:
   - the reset the plan already makes (build back from a little lighter),
   - one more back-off set (more volume at the weight that matters),
   - a variation that trains the sticking point (paused, close-grip, front),
   - and a goal: a new best within six weeks.

   Detection is the plan's own stall rule (stallFrom), so the screen and the
   plan can never disagree about whether a lift is stuck. */

export type Plateau = {
  lift: string;
  /* The best the lift has been worth (calculated max). */
  best: number;
  /* The best of the last ten weeks, under it. */
  recentBest: number;
  /* Weeks since the best was set. */
  weeks: number;
  /* What the plan restarts the top sets from. */
  restart: number;
};

export const PLATEAU_WEEKS_TO_BEAT = 6;

type Rec = { date?: string; topSets?: Array<{ lift?: string; weight?: number; reps?: number; completed?: boolean; calculatedMax?: number; prescribedReps?: number }> };

export function plateauFor(lift: string, records: Rec[], todayIso = localDayIso(), history = bestsFromHistory(records, todayIso)): Plateau | null {
  if (!lift) return null;
  const key = canonicalLiftKey(lift);
  const best = history.bests.get(key) || 0;
  const stall = stallFrom(best, history.latest.get(key));
  if (!stall) return null;
  /* When the best was set: the newest set worth (nearly) all of it. */
  let since = '';
  for (const record of records) for (const set of record.topSets || []) {
    if (set.completed === false || !set.lift || canonicalLiftKey(set.lift) !== key || !record.date) continue;
    const max = estimateWithEffort(Number(set.weight) || 0, Number(set.reps) || 0, effortOf(record.date, set.lift));
    if (max >= best * 0.995 && record.date > since) since = record.date;
  }
  const weeks = since ? Math.max(1, Math.round((Date.parse(`${todayIso}T12:00:00`) - Date.parse(`${since}T12:00:00`)) / (7 * 86_400_000))) : 10;
  return { lift, best: Math.round(best), recentBest: Math.round(stall.recentBest), weeks, restart: Math.round(stall.restart) };
}

/* Variations that train the sticking point of each main lift, best first. Only
   ones already enabled in the athlete's library are ever used. */
const VARIATIONS: Record<string, string[]> = {
  [canonicalLiftKey('Bench Press')]: ['Paused Bench Press', 'Close-Grip Bench Press', 'Incline Bench Press', 'Dumbbell Bench Press', 'Incline Dumbbell Press'],
  [canonicalLiftKey('Back Squat')]: ['Paused Squat', 'Front Squat', 'Hack Squat', 'Bulgarian Split Squat', 'Leg Press'],
  [canonicalLiftKey('Deadlift')]: ['Deficit Deadlift', 'Paused Deadlift', 'Romanian Deadlift', 'Barbell Row'],
  [canonicalLiftKey('Overhead Press')]: ['Push Press', 'Seated Dumbbell Shoulder Press', 'Dumbbell Shoulder Press', 'Incline Bench Press'],
  [canonicalLiftKey('Pull Ups')]: ['Lat Pulldown', 'Barbell Row', 'Chin Ups'],
};

export function plateauVariation(lift: string, library: Array<{ name: string; enabled: boolean }>, exclude: Set<string> = new Set()): string | null {
  const options = VARIATIONS[canonicalLiftKey(lift)] || [];
  const enabled = new Map(library.filter(item => item.enabled).map(item => [canonicalLiftKey(item.name), item.name]));
  for (const name of options) {
    const key = canonicalLiftKey(name);
    if (key === canonicalLiftKey(lift) || exclude.has(key)) continue;
    const found = enabled.get(key);
    if (found) return found;
  }
  return null;
}

/* The coach's sentence: what is stuck, what changes, and when to beat it. */
export function plateauLine(p: Plateau, unit: string, variation: string | null, today = new Date()): string {
  const by = new Date(today.getTime() + PLATEAU_WEEKS_TO_BEAT * 7 * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const changes = ['top sets build back from a little lighter', 'one more back-off set', ...(variation ? [`${variation.toLowerCase()} for the sticking point`] : [])];
  const list = changes.length > 2 ? `${changes.slice(0, -1).join(', ')} and ${changes.at(-1)}` : changes.join(' and ');
  return `${p.lift} has been stuck under ${p.best} ${unit} for ${p.weeks} weeks. Plateau plan: ${list}. Beat ${p.best} by ${by}.`;
}

/* Every stuck lift among `lifts`, keyed by canonical name, with the variation
   picked for it. The history is read once. */
export function plateausFor(lifts: string[], records: Rec[], library: Array<{ name: string; enabled: boolean }>, todayIso = localDayIso()): Map<string, { plateau: Plateau; variation: string | null }> {
  const out = new Map<string, { plateau: Plateau; variation: string | null }>();
  if (!lifts.length) return out;
  const history = bestsFromHistory(records, todayIso);
  const taken = new Set(lifts.map(canonicalLiftKey));
  for (const lift of lifts) {
    const plateau = plateauFor(lift, records, todayIso, history);
    if (!plateau) continue;
    const variation = plateauVariation(lift, library, taken);
    if (variation) taken.add(canonicalLiftKey(variation));
    out.set(canonicalLiftKey(lift), { plateau, variation });
  }
  return out;
}
