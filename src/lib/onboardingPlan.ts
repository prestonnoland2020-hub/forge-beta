/* WHAT SETUP ASKS, AND WHAT IT BUILDS FROM THE ANSWERS.

   Setup used to ask one question — "what are you training for?" — and take
   one answer. Sarah wanted guided workouts, a body-weight goal and to get
   stronger, all at once, and there was no way to say so: "Coach me" ended
   setup on the spot with no goal at all, and the goal path took one focus.

   So setup now asks three plain things, in this order:
     1. What do you want?        (pick any)
     2. Who builds the workout?  (the coach, or you)
     3. What kind of training?   (only when the coach builds it)
   and everything below is how those answers become a split, the goal
   screens to show, and the coach's own setup. Pure functions, so the rules
   are tested without a browser (onboardgoals.mjs). */
import type { AthleteSetup } from '../features/profile/ProfileSetupProvider';
import type { GuidedPrefs } from './guided/builder';

export type Want = 'strength' | 'weight' | 'run' | 'fit';
export type GuidedStyle = 'Gym' | 'Home' | 'Pilates' | 'Hybrid';
/* One goal is asked per slot. 'any' is the single lift-or-race goal a
   self-directed athlete with no specific want still has to set. */
export type GoalSlot = 'strength' | 'run' | 'weight' | 'any';
type Focus = AthleteSetup['primaryFocus'];
type SplitDays = AthleteSetup['splitDays'];

/* "Just get fit" is the answer for someone with no target, so it stands
   alone: picking it clears the others, and picking another clears it. */
export function toggleWant(wants: Want[], want: Want): Want[] {
  if (wants.includes(want)) return wants.filter(item => item !== want);
  if (want === 'fit') return ['fit'];
  return [...wants.filter(item => item !== 'fit'), want];
}

/* An account set up before wants existed said one focus; read it back. */
export const wantsFromFocus = (focus: Focus): Want[] =>
  focus === 'Strength' ? ['strength'] : focus === 'Endurance' ? ['run'] : focus === 'Body composition' ? ['weight'] : ['strength', 'run'];

/* The one-word focus the rest of the app still reads. */
export function focusOf(wants: Want[]): Focus {
  const lift = wants.includes('strength'), run = wants.includes('run');
  return lift && run ? 'Hybrid' : lift ? 'Strength' : run ? 'Endurance' : wants.includes('weight') ? 'Body composition' : 'Hybrid';
}

/* Home and Pilates workouts are built by the coach each day from what she
   has — there is no barbell day to map lifts onto. */
export const coachBuilds = (guided: boolean, style?: GuidedStyle) => guided && (style === 'Home' || style === 'Pilates');

/* The shape of the starter week. A coached gym-goer runs only if they asked
   to (Hybrid, or a running want); a self-directed athlete gets the split
   their focus always got. */
export function splitFocusFor(wants: Want[], guided: boolean, style?: GuidedStyle): Focus {
  if (guided && (style === 'Gym' || style === 'Hybrid')) return style === 'Hybrid' || wants.includes('run') ? 'Hybrid' : 'Strength';
  return focusOf(wants);
}

/* Which goals setup asks for. A barbell goal needs a barbell: a coached
   athlete at home or doing Pilates gets stronger by how each set feels, not
   by a one-rep max. A self-directed athlete always sets at least one goal,
   because the plan is built backwards from it. */
export function goalSlots(wants: Want[], guided: boolean, style?: GuidedStyle): GoalSlot[] {
  const slots: GoalSlot[] = [];
  if (wants.includes('strength') && !coachBuilds(guided, style)) slots.push('strength');
  if (wants.includes('run')) slots.push('run');
  if (wants.includes('weight')) slots.push('weight');
  if (!slots.length && !guided) slots.push('any');
  return slots;
}

/* "4 DAYS A WEEK" MEANS THREE DAYS OFF: the rest days are part of the
   cycle, spread between the training days. */
export function withRestDays(training: SplitDays): SplitDays {
  if (training.length >= 7) return training;
  const slots = new Set(training.map((_, index) => Math.round(index * 7 / training.length)));
  const rest = { name: 'Rest', type: 'Rest' as const, muscles: [] as string[] };
  let next = 0;
  return Array.from({ length: 7 }, (_, index) => slots.has(index) ? training[next++] : rest);
}

/* THE WEEK FOR A COACH-BUILT STYLE. The days carry no lifts, so Today hands
   each one to the coach, who picks the workout from her setup. With a
   running want every other day is a run. Every day gets its own name. */
export function coachSplit(style: 'Home' | 'Pilates', count: number, run: boolean): SplitDays {
  const label = style === 'Pilates' ? 'Pilates' : 'Home workout';
  const total = Math.max(1, Math.min(7, count));
  let workouts = 0, runs = 0;
  const training = Array.from({ length: total }, (_, index) => {
    if (run && index % 2 === 1) { runs += 1; return { name: runs > 1 ? `Run ${runs}` : 'Run', type: 'Cardio' as const, muscles: [] as string[] }; }
    workouts += 1;
    return { name: workouts > 1 ? `${label} ${workouts}` : label, type: 'Strength' as const, muscles: [] as string[] };
  });
  return withRestDays(training);
}

/* The coach's own setup, written from the same answers so she is not asked
   again inside Guided. Everything here can be changed there. */
export function guidedPrefsFor(style: GuidedStyle, gear: string[], wants: Want[]): GuidedPrefs {
  const level = 'A little' as const;
  if (style === 'Pilates') return { styles: ['Pilates'], vibe: [], place: 'Home', gear: ['Mat'], level };
  if (style === 'Home') return { styles: [gear.some(item => item === 'Dumbbells' || item === 'Kettlebell') ? 'Strength' : 'Bodyweight'], vibe: [], place: 'Home', gear, level };
  return { styles: [wants.includes('strength') ? 'Strength' : 'Build muscle'], vibe: [], place: 'Gym', gear: [], level };
}
