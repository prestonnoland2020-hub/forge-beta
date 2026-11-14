import { primaryMusclesFor } from '../liftAliases';
import type { Focus, GuidedPrefs } from './builder';

/* COACH ME PICKS FROM THE ATHLETE, NOT FROM A LIST.

   It used to rotate through a fixed order — whatever came after the last
   Coach me workout — so it offered "Glutes & core" on a rest day, the morning
   after a heavy leg day, with no reason given. A coach picks the work that
   is ready to be trained:

   - the muscles that have rested longest, from the workouts actually logged,
   - nothing the body log has flagged (an injury, or a fatigue note on them),
   - a little extra pull toward the muscles the athlete's goals depend on,
   - and if everything was trained in the last two days, stretching instead.

   On a rest day the answer is rest; a light stretch is offered, and training
   anyway is one more tap. The pick always says why. */

export type PickInput = {
  records: Array<{ date: string; muscles?: string[]; topSets?: Array<{ lift?: string; muscle?: string; completed?: boolean }> }>;
  todayIso: string;
  prefs: GuidedPrefs;
  lastFocus?: Focus;
  /* Muscles the body log blocks or eases today. */
  avoid?: string[];
  /* Muscles the athlete's strength goals train. */
  goalMuscles?: string[];
};

export type Pick = { focus: Focus; why: string };

const MUSCLES: Record<Exclude<Focus, 'Stretch it out'>, string[]> = {
  'Upper body': ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
  'Lower body': ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  'Glutes & core': ['Glutes', 'Hamstrings', 'Abs'],
  'Full body': ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes'],
};
const LABEL: Record<Exclude<Focus, 'Stretch it out'>, string> = {
  'Upper body': 'Your upper body', 'Lower body': 'Your legs', 'Glutes & core': 'Glutes and core', 'Full body': 'Your whole body',
};
/* Rested past a week counts the same as a week: fresh is fresh. */
const FRESH_DAYS = 7;
const DAY = 86_400_000;

/* The focuses the athlete's own Coach me setup allows, in its order. */
function allowed(prefs: GuidedPrefs): Array<Exclude<Focus, 'Stretch it out'>> {
  if (prefs.vibe.includes('Upper body')) return ['Upper body', 'Lower body', 'Full body'];
  if (prefs.vibe.includes('Glutes & legs')) return ['Glutes & core', 'Lower body', 'Upper body', 'Full body'];
  return ['Full body', 'Glutes & core', 'Upper body', 'Lower body'];
}

/* Days since each muscle was last trained, from logged workouts. */
export function daysSinceTrained(records: PickInput['records'], todayIso: string): Map<string, number> {
  const today = Date.parse(`${todayIso}T12:00:00`);
  const out = new Map<string, number>();
  for (const record of records) {
    if (!record.date || record.date > todayIso) continue;
    const days = Math.max(0, Math.round((today - Date.parse(`${record.date}T12:00:00`)) / DAY));
    const muscles = new Set<string>(record.muscles || []);
    for (const set of record.topSets || []) {
      if (set.completed === false) continue;
      for (const muscle of primaryMusclesFor(String(set.lift || ''), set.muscle ? [set.muscle] : [])) muscles.add(muscle);
    }
    for (const muscle of muscles) if (!out.has(muscle) || days < out.get(muscle)!) out.set(muscle, days);
  }
  return out;
}

/* "Your upper body hasn't…", "Your legs haven't…": the verb follows the label. */
const SINGULAR = new Set(['Upper body', 'Full body']);
const daysText = (days: number, singular: boolean) => days >= FRESH_DAYS ? `${singular ? 'hasn’t' : 'haven’t'} been trained in a week` : `${singular ? 'was' : 'were'} last trained ${days === 1 ? 'yesterday' : `${days} days ago`}`;

export function pickFocus(input: PickInput): Pick {
  if (input.prefs.styles.length === 1 && input.prefs.styles[0] === 'Stretch & mobility') return { focus: 'Stretch it out', why: 'You set Coach me up for stretching and mobility.' };
  const since = daysSinceTrained(input.records, input.todayIso);
  const rested = (muscle: string) => Math.min(FRESH_DAYS, since.get(muscle) ?? FRESH_DAYS);
  const avoid = new Set(input.avoid || []);
  const goal = new Set(input.goalMuscles || []);
  const options = allowed(input.prefs).map(focus => {
    const muscles = MUSCLES[focus];
    const usable = muscles.filter(muscle => !avoid.has(muscle));
    const blocked = muscles.filter(muscle => avoid.has(muscle));
    /* The least-rested muscle sets the pace: a leg day is not ready because
       the calves are fresh if the quads were trained yesterday. */
    const weakest = usable.length ? Math.min(...usable.map(rested)) : 0;
    const average = usable.length ? usable.reduce((sum, muscle) => sum + rested(muscle), 0) / usable.length : 0;
    const goalPull = usable.some(muscle => goal.has(muscle) && rested(muscle) >= 2) ? 0.5 : 0;
    /* Half the muscles flagged is half a workout: drop it down the list. */
    const score = weakest * 1.5 + average + goalPull - blocked.length * 2 - (focus === input.lastFocus ? 0.75 : 0);
    return { focus, muscles: usable, blocked, weakest, score };
  }).sort((a, b) => b.score - a.score);
  const best = options[0];
  if (!best || best.weakest < 2) {
    return { focus: 'Stretch it out', why: 'You’ve trained nearly everything in the last two days. A stretch today lets it recover.' };
  }
  const flagged = best.blocked.length ? ` Leaving out ${best.blocked.map(m => m.toLowerCase()).join(' and ')} — flagged in your body log.` : '';
  const goalNote = best.muscles.some(muscle => goal.has(muscle)) && !flagged ? ' It trains muscles your goals need.' : '';
  return { focus: best.focus, why: `${LABEL[best.focus]} ${daysText(best.weakest, SINGULAR.has(best.focus))} — the most rested.${flagged}${goalNote}` };
}
