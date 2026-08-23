/* The legacy Sheets import wrote every top set's muscle_group as the literal
   string "Primary" — all 82 of them — so muscle-group frequency and the
   per-muscle history grouping had nothing real to group by. The exercise name
   is the only signal the imported rows carry, so the muscle is derived from it
   at read time rather than by rewriting history in the database. */

/* Plural forms matter: the account's own log has "Pull Ups", not "Pull Up",
   and \b after "up" does not match when an "s" follows. */
const patterns: Array<[RegExp, string]> = [
  [/\b(hip thrusts?|glutes?)\b/i, 'Glutes'],
  [/\b(rdls?|romanian|hamstrings?|leg curls?|good ?mornings?)\b/i, 'Hamstrings'],
  [/\b(squats?|leg press|lunges?|hack|quads?|leg extensions?|step ?ups?)\b/i, 'Quads'],
  [/\b(deadlifts?)\b/i, 'Hamstrings'],
  [/\b(lat|pulldowns?|pull ?ups?|chin ?ups?|rows?|shrugs?|back extensions?)\b/i, 'Back'],
  [/\b(bench|chest|fly|flyes?|flies|pec|push ?ups?|dips?)\b/i, 'Chest'],
  [/\b(shoulders?|overhead|ohp|lateral raises?|front raises?|delts?|upright|arnold)\b/i, 'Shoulders'],
  [/\b(triceps?|pushdowns?|skull ?crushers?|kickbacks?|close ?grip)\b/i, 'Triceps'],
  [/\b(biceps?|curls?|preacher|hammer)\b/i, 'Biceps'],
  [/\b(forearms?|wrist|grip|farmers?)\b/i, 'Forearms'],
  [/\b(abs?|crunch(?:es)?|planks?|sit ?ups?|toes to bar|hanging leg|obliques?)\b/i, 'Abs'],
];

/* Values the import used where a muscle group belonged. Anything in here means
   "not actually recorded" and should be replaced if we can do better. */
const placeholders = new Set(['primary', 'none', 'n/a', 'na', '', '-', '—', 'strength']);

export function isMusclePlaceholder(value: string | undefined | null) {
  return placeholders.has(String(value || '').trim().toLowerCase());
}

export function deriveMuscleForLift(liftName: string, dayMuscles: string[] = [], fallback = 'Primary') {
  const name = String(liftName || '');
  for (const [pattern, muscle] of patterns) if (pattern.test(name)) return muscle;
  /* Nothing matched the name. A day titled "Chest + Back" still tells us more
     than "Primary" does, so use it when it names exactly one muscle. */
  const real = dayMuscles.filter(muscle => !isMusclePlaceholder(muscle) && muscle !== 'Cardio');
  return real.length === 1 ? real[0] : fallback;
}

export function resolveTopSetMuscle(recorded: string, liftName: string, dayMuscles: string[] = []) {
  return isMusclePlaceholder(recorded) ? deriveMuscleForLift(liftName, dayMuscles, recorded || 'Primary') : recorded;
}
