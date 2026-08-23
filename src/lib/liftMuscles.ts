/* The legacy Sheets import wrote every top set's muscle_group as the literal
   string "Primary" — all 82 of them — so muscle-group frequency and the
   per-muscle history grouping had nothing real to group by. The exercise name
   is the only signal the imported rows carry, so the muscle is derived from it
   at read time rather than by rewriting history in the database. */

const patterns: Array<[RegExp, string]> = [
  [/\b(hip thrust|glute)\b/i, 'Glutes'],
  [/\b(rdl|romanian|hamstring|leg curl|good ?morning)\b/i, 'Hamstrings'],
  [/\b(squat|leg press|lunge|hack|quad|leg extension|step ?up)\b/i, 'Quads'],
  [/\b(deadlift)\b/i, 'Hamstrings'],
  [/\b(lat|pulldown|pull ?up|chin ?up|row|shrug|back extension)\b/i, 'Back'],
  [/\b(bench|chest|fly|flye|pec|push ?up|dip)\b/i, 'Chest'],
  [/\b(shoulder|overhead|ohp|lateral raise|front raise|delt|upright|arnold)\b/i, 'Shoulders'],
  [/\b(tricep|pushdown|skull ?crusher|kickback|close ?grip)\b/i, 'Triceps'],
  [/\b(bicep|curl|preacher|hammer)\b/i, 'Biceps'],
  [/\b(forearm|wrist|grip|farmer)\b/i, 'Forearms'],
  [/\b(ab|abs|crunch|plank|sit ?up|toes to bar|hanging leg|oblique)\b/i, 'Abs'],
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
