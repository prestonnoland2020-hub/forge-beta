import { MOVES, MOVE, type Move, type Pattern, type Style, type Equip } from './catalog';

/* FORGE GUIDED — THE WORKOUT BUILDER.

   Rules, not a model, so every workout is safe and the same answers give the
   same workout. Four answers from setup, the time she has today and a focus
   become a warm-up, the main moves and a cool-down, each with sets, reps (or
   seconds), a starting weight and a rest. The AI coach can sit on top of this
   later; it should never be the thing deciding a beginner's load. */

export type Place = 'Gym' | 'Home' | 'Anywhere';
export type Level = 'New to this' | 'A little' | 'Comfortable';
export type Focus = 'Glutes & core' | 'Full body' | 'Upper body' | 'Lower body' | 'Stretch it out';
export type GuidedPrefs = { styles: Style[]; vibe: string[]; place: Place; gear: string[]; level: Level };
export type Feel = 'easy' | 'right' | 'hard';

export type Step = {
  move: Move;
  sets: number;
  reps: number;          // reps, or seconds when move.timed
  weight: number | null; // in the athlete's unit; null = no weight / pick your own
  weightNote?: string;   // "Start light" on a machine she has never used
  rest: number;          // seconds after each set
  part: 'warmup' | 'main' | 'cooldown';
};
export type Workout = { title: string; focus: Focus; minutes: number; steps: Step[] };

export const FOCUSES: Focus[] = ['Glutes & core', 'Full body', 'Upper body', 'Lower body', 'Stretch it out'];

/* What each focus is made of, in order. The first REQUIRED slots are the
   muscle groups the name promises — a full body day trains legs (front and
   back), chest, back, shoulders and core every time, however short. Later
   slots are added when there is time. A slot can ask for a muscle (arms:
   biceps); if no move for her equipment fits, it is skipped when another
   move already works that muscle. */
type Slot = Pattern | `${Pattern}:${string}`;
const SHAPES: Record<Focus, Slot[]> = {
  'Glutes & core': ['glute', 'hinge:Hamstrings', 'lunge', 'core', 'core', 'glute', 'squat'],
  'Full body': ['squat', 'hinge:Hamstrings', 'push:Chest', 'pull:Back', 'shoulder:Shoulders', 'core', 'lunge', 'arms:Biceps', 'glute'],
  'Upper body': ['push:Chest', 'pull:Back', 'shoulder:Shoulders', 'arms:Biceps', 'arms:Triceps', 'push', 'pull', 'core'],
  'Lower body': ['squat', 'hinge:Hamstrings', 'glute', 'lunge', 'calf', 'glute', 'core'],
  'Stretch it out': ['warmup', 'warmup', 'stretch', 'core', 'stretch', 'stretch'],
};
export const REQUIRED: Record<Focus, number> = { 'Glutes & core': 5, 'Full body': 6, 'Upper body': 5, 'Lower body': 5, 'Stretch it out': 0 };
/* The muscles each focus must hit, checked by the tests. */
export const MUST_HIT: Record<Focus, string[]> = {
  'Full body': ['Quads', 'Hamstrings', 'Glutes', 'Chest', 'Back', 'Shoulders', 'Abs'],
  'Upper body': ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps'],
  'Lower body': ['Quads', 'Hamstrings', 'Glutes', 'Calves'],
  'Glutes & core': ['Glutes', 'Hamstrings', 'Abs'],
  'Stretch it out': [],
};
const MAIN_COUNT: Record<number, number> = { 20: 3, 30: 5, 45: 6, 60: 7 };

/* What she owns. The gym has everything; "Anywhere" has nothing. */
export function owned(prefs: Pick<GuidedPrefs, 'place' | 'gear'>): Set<Equip> {
  if (prefs.place === 'Gym') return new Set<Equip>(['none', 'mat', 'dumbbell', 'kettlebell', 'bench', 'gym']);
  const have = new Set<Equip>(['none']);
  if (prefs.place === 'Home') for (const item of prefs.gear) {
    const key = ({ Dumbbells: 'dumbbell', Kettlebell: 'kettlebell', Mat: 'mat', Bench: 'bench' } as Record<string, Equip>)[item];
    if (key) have.add(key);
  }
  return have;
}
export const canDo = (move: Move, have: Set<Equip>) => move.equip.every(item => have.has(item));

/* The day's main style: the first she picked that the focus suits. */
function leadStyle(prefs: GuidedPrefs): Style {
  return prefs.styles[0] || 'Strength';
}

/* Sets, reps and rest by style and level. Beginners get fewer sets; Pilates
   and bodyweight work is slower and higher-rep with short rests; building
   muscle sits at 10–12; HIIT is time on, short rest. */
export function dose(move: Move, style: Style, level: Level, part: Step['part']): Pick<Step, 'sets' | 'reps' | 'rest'> {
  const lvl = level === 'New to this' ? 0 : level === 'A little' ? 1 : 2;
  if (part !== 'main') return { sets: 1, reps: move.perSide ? 60 : 45, rest: 10 };
  const hiit = style === 'HIIT / CrossFit-style';
  if (move.timed) return { sets: [2, 3, 3][lvl], reps: hiit ? [30, 40, 45][lvl] : [20, 30, 40][lvl], rest: hiit ? 20 : 30 };
  if (hiit) return { sets: [2, 3, 3][lvl], reps: [10, 12, 15][lvl], rest: 30 };
  if (style === 'Pilates' || style === 'Bodyweight') return { sets: [2, 3, 3][lvl], reps: [10, 12, 15][lvl], rest: 40 };
  if (style === 'Build muscle') return { sets: [2, 3, 4][lvl], reps: [12, 10, 10][lvl], rest: [60, 75, 90][lvl] };
  /* Strength */
  return { sets: [2, 3, 4][lvl], reps: [10, 8, 6][lvl], rest: [75, 90, 120][lvl] };
}

/* A first weight she can do. Dumbbells start light by level; a machine or a
   barbell gets "start light" instead of a number we cannot know. After one
   set the weight is hers (see nextWeight). Pounds; metric converts. */
const START_DB: Record<Level, number> = { 'New to this': 10, 'A little': 15, 'Comfortable': 20 };
const LIGHTER_DB = new Set(['lateral-raise', 'curl']);
export function startWeight(move: Move, level: Level, remembered: Record<string, number>, metric: boolean): Pick<Step, 'weight' | 'weightNote'> {
  if (move.load === 'none') return { weight: null };
  if (remembered[move.id] !== undefined) return { weight: remembered[move.id] };
  if (move.load === 'dumbbell' || move.load === 'kettlebell') {
    let pounds = START_DB[level] - (LIGHTER_DB.has(move.id) ? 5 : 0);
    if (move.load === 'kettlebell') pounds = Math.max(15, pounds + 5);
    return { weight: metric ? Math.round(pounds / 2.2046 / 2) * 2 : pounds };
  }
  return { weight: null, weightNote: 'Start light. Pick a weight you could do 15 times.' };
}

/* One tap after a set moves the next one. A step is one dumbbell jump. */
export function nextWeight(weight: number | null, feel: Feel, load: Move['load'], metric: boolean): number | null {
  if (weight === null) return null;
  const step = metric ? (load === 'barbell' || load === 'machine' ? 5 : 2) : (load === 'barbell' || load === 'machine' ? 10 : 5);
  if (feel === 'easy') return weight + step;
  if (feel === 'hard') return Math.max(step, weight - step);
  return weight;
}

/* A seeded shuffle, so tomorrow's glutes day is not today's. */
function seeded(seed: number) { let s = seed || 1; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

export function buildWorkout(prefs: GuidedPrefs, minutes: number, focus: Focus, options: { seed?: number; recent?: string[]; remembered?: Record<string, number>; metric?: boolean } = {}): Workout {
  const have = owned(prefs);
  const style = focus === 'Stretch it out' ? 'Stretch & mobility' : leadStyle(prefs);
  const rand = seeded(options.seed ?? Date.now() % 100000);
  const recent = new Set(options.recent || []);
  const used = new Set<string>();
  const pick = (slot: Slot) => {
    const [pattern, muscle] = slot.split(':') as [Pattern, string | undefined];
    let pool = MOVES.filter(move => move.pattern === pattern && canDo(move, have) && !used.has(move.id) && (!muscle || move.muscles.includes(muscle)));
    /* No move of that kind for her gear: any move that trains the muscle. */
    if (!pool.length && muscle) pool = MOVES.filter(move => move.muscles.includes(muscle) && canDo(move, have) && !used.has(move.id) && !['warmup', 'stretch'].includes(move.pattern));
    if (muscle && steps.some(step => step.part === 'main' && step.move.muscles.includes(muscle)) && !pool.some(move => move.pattern === pattern)) return undefined;
    if (!pool.length) return undefined;
    /* Her styles first, then moves she did not do last time, then the rest. */
    const score = (move: Move) => (prefs.styles.some(item => move.styles.includes(item)) ? 2 : 0) + (move.styles.includes(style) ? 2 : 0) + (recent.has(move.id) ? -1.5 : 0)
      + (prefs.vibe.includes('Low impact') && pattern === 'cardio' ? -3 : 0) + rand() * 1.2;
    return pool.sort((a, b) => score(b) - score(a))[0];
  };
  const steps: Step[] = [];
  const add = (move: Move | undefined, part: Step['part']) => {
    if (!move) return;
    used.add(move.id);
    const base = dose(move, style, prefs.level, part);
    const load = part === 'main' ? startWeight(move, prefs.level, options.remembered || {}, Boolean(options.metric)) : { weight: null };
    steps.push({ move, part, ...base, ...load });
  };
  if (focus !== 'Stretch it out') add(pick('warmup'), 'warmup');
  /* Never fewer moves than the focus promises; more when there is time. */
  const count = Math.max(REQUIRED[focus], MAIN_COUNT[minutes] ?? (minutes <= 20 ? 3 : minutes <= 30 ? 5 : minutes <= 45 ? 6 : 7));
  let shape = SHAPES[focus];
  if (prefs.vibe.includes('Core focus') && focus !== 'Stretch it out') shape = [...shape.slice(0, REQUIRED[focus]), 'core', ...shape.slice(REQUIRED[focus])];
  if (style === 'HIIT / CrossFit-style' && focus !== 'Stretch it out') shape = [...shape.slice(0, REQUIRED[focus]), 'cardio', ...shape.slice(REQUIRED[focus]), 'cardio'];
  const part: Step['part'] = focus === 'Stretch it out' ? 'cooldown' : 'main';
  const mains = () => steps.filter(step => step.part !== 'warmup').length;
  for (const slot of shape) { if (mains() >= count) break; add(pick(slot), part); }
  /* Short of moves for her gear: fill from anything she can do in the focus's patterns. */
  for (const slot of shape) { if (mains() >= count) break; add(pick(slot.split(':')[0] as Pattern), part); }
  if (focus !== 'Stretch it out') add(pick('stretch'), 'cooldown');
  const workout = { title: focus, focus, minutes, steps };
  /* FILL THE TIME SHE GAVE. Two sets of five moves is about 20 minutes; if
     she has 30, add a set to the main moves, one at a time, up to four. */
  const cap = prefs.level === 'New to this' ? 3 : 4;
  for (let round = 0; round < 12 && estimateMinutes(workout) < minutes * 0.85; round += 1) {
    const open = steps.filter(step => step.part === 'main' && step.sets < cap);
    if (!open.length) break;
    open.sort((a, b) => a.sets - b.sets)[0].sets += 1;
  }
  /* A short full body day has more moves than usual: trim to fit, keeping
     every move — fewer sets first (never below two), then shorter rests. */
  for (let round = 0; round < 40 && estimateMinutes(workout) > minutes * 1.1; round += 1) {
    const extra = steps.filter(step => step.part === 'main' && step.sets > 2).sort((a, b) => b.sets - a.sets)[0];
    if (extra) { extra.sets -= 1; continue; }
    const slow = steps.filter(step => step.part === 'main' && step.rest > 45).sort((a, b) => b.rest - a.rest)[0];
    if (slow) { slow.rest = Math.max(45, slow.rest - 15); continue; }
    break;
  }
  return workout;
}

/* The coach rotates the focus so muscles rest: the next one after the last. */
export function suggestFocus(lastFocus: Focus | undefined, prefs: GuidedPrefs): Focus {
  if (prefs.styles.length === 1 && prefs.styles[0] === 'Stretch & mobility') return 'Stretch it out';
  const order: Focus[] = prefs.vibe.includes('Upper body') ? ['Upper body', 'Lower body', 'Full body'] : prefs.vibe.includes('Glutes & legs') ? ['Glutes & core', 'Upper body', 'Lower body', 'Full body'] : ['Full body', 'Glutes & core', 'Upper body'];
  if (!lastFocus) return order[0];
  const index = order.indexOf(lastFocus);
  return order[(index + 1) % order.length];
}

/* Rough minutes, so the preview can say "about 30 min" honestly. */
export function estimateMinutes(workout: Workout): number {
  const seconds = workout.steps.reduce((sum, step) => sum + step.sets * ((step.move.timed ? step.reps : step.reps * 4) * (step.move.perSide && !step.move.timed ? 2 : 1) + step.rest), 0);
  return Math.max(5, Math.round(seconds / 60));
}

/* What the card says for the amount: "10 reps", "8 each side", "30 sec". */
export function amountText(step: Step): string {
  if (step.move.timed) return `${step.reps} sec${step.move.perSide && step.part === 'main' ? ' each side' : ''}`;
  return `${step.reps}${step.move.perSide ? ' each side' : ' reps'}`;
}

export const swapFor = (step: Step, way: 'easier' | 'harder', have: Set<Equip>): Move | undefined => {
  const id = way === 'easier' ? step.move.easier : step.move.harder;
  const move = id ? MOVE(id) : undefined;
  return move && canDo(move, have) ? move : undefined;
};

/* BUILD MY OWN. She picks the moves from the Guided list, in her order; the
   coach still sets the sets, reps, rest and starting weight, and still talks
   her through it. Warm-up and stretch moves stay warm-up and cool-down. */
export const CUSTOM_KEY = 'forge-guided-custom-v1';
export function customWorkout(prefs: GuidedPrefs, ids: string[], style: Style, options: { remembered?: Record<string, number>; metric?: boolean } = {}): Workout {
  const steps: Step[] = [];
  for (const id of ids) {
    const move = MOVES.find(item => item.id === id);
    if (!move) continue;
    const part: Step['part'] = move.pattern === 'warmup' ? 'warmup' : move.pattern === 'stretch' ? 'cooldown' : 'main';
    const load = part === 'main' ? startWeight(move, prefs.level, options.remembered || {}, Boolean(options.metric)) : { weight: null };
    steps.push({ move, part, ...dose(move, style, prefs.level, part), ...load });
  }
  const workout: Workout = { title: 'My workout', focus: 'Full body', minutes: 0, steps };
  workout.minutes = estimateMinutes(workout);
  return workout;
}
