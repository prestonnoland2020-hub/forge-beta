/* One lift, many spellings. Legacy sheets say "Squat" and "Bench"; the starter
   library says "Back Squat" and "Bench Press"; athletes type whatever they
   type. Exact-name matching let both versions coexist — a duplicated library,
   and a Squat goal that never recognised the Back Squat it was being trained
   through. Every surface that compares lift names goes through this key.

   Groups are deliberately conservative: only names that are unambiguously the
   SAME movement. "Smith Machine Squat" is not "Squat"; an incline bench is not
   a bench. */
const ALIAS_GROUPS: string[][] = [
  ['squat', 'back squat', 'barbell squat', 'barbell back squat'],
  ['bench', 'bench press', 'barbell bench press', 'flat bench', 'flat bench press'],
  ['deadlift', 'conventional deadlift', 'barbell deadlift'],
  ['standing overhead press', 'overhead press', 'military press', 'strict press', 'ohp'],
  ['pull ups', 'pull-ups', 'pullups', 'pull up', 'pullup'],
  ['smith machine incline bench', 'smith machine incline bench press', 'smith machine incline press'],
];

const aliasToKey = new Map<string, string>();
ALIAS_GROUPS.forEach(group => group.forEach(name => aliasToKey.set(name, group[0])));

/* The comparison key for a lift name: whitespace-collapsed lowercase, folded
   through the alias table. Two names with the same key are the same lift. */
export const canonicalLiftKey = (name: string): string => {
  const plain = String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return aliasToKey.get(plain) || plain;
};

export const sameLift = (a: string, b: string): boolean => canonicalLiftKey(a) === canonicalLiftKey(b);

/* PRIMARY MOVERS ONLY. A logged day's muscle list is driven by the split day
   (when training the plan) or by the exercises done (custom work) — and an
   exercise contributes only what it primarily trains: pull ups are Back, not
   Back + Biceps + Forearms; bench is Chest, not Chest + Triceps + Shoulders.
   Squat keeps its three because all three are prime movers. Keyed by the
   canonical lift key so every alias resolves; a name not listed here falls
   back to its library entry's muscle list (a custom exercise's muscles are
   the athlete's own primary declaration). */
const PRIMARY_MUSCLES: Record<string, string[]> = {
  'squat': ['Quads', 'Glutes', 'Hamstrings'],
  'front squat': ['Quads', 'Glutes'],
  'hack squat': ['Quads', 'Glutes'],
  'leg press': ['Quads', 'Glutes'],
  'bench': ['Chest'],
  'incline bench': ['Chest'],
  'incline bench press': ['Chest'],
  'smith machine incline bench': ['Chest'],
  'dumbbell bench press': ['Chest'],
  'push ups': ['Chest'],
  'pull ups': ['Back'],
  'chin ups': ['Back'],
  'lat pulldown': ['Back'],
  'barbell row': ['Back'],
  'bent over row': ['Back'],
  'seated row': ['Back'],
  'cable row': ['Back'],
  'dumbbell row': ['Back'],
  'romanian deadlift': ['Hamstrings'],
  'rdl': ['Hamstrings'],
  'stiff leg deadlift': ['Hamstrings'],
  'deadlift': ['Back', 'Glutes', 'Hamstrings'],
  'standing overhead press': ['Shoulders'],
  'shoulder press': ['Shoulders'],
  'seated shoulder press': ['Shoulders'],
  'dumbbell shoulder press': ['Shoulders'],
  'push press': ['Shoulders'],
  'handstand push ups': ['Shoulders'],
  'lateral raise': ['Shoulders'],
  'hip thrust': ['Glutes'],
  'lunges': ['Quads', 'Glutes'],
  'bulgarian split squat': ['Quads', 'Glutes'],
  'calf raise': ['Calves'],
  'bicep curl': ['Biceps'],
  'barbell curl': ['Biceps'],
  'dumbbell curl': ['Biceps'],
  'hammer curl': ['Biceps'],
  'tricep extension': ['Triceps'],
  'tricep pushdown': ['Triceps'],
  'skullcrushers': ['Triceps'],
  'dips': ['Triceps'],
};

/* The muscles a lift is logged against: the primary-mover override when the
   movement is known, otherwise the fallback (its library entry's list). */
export const primaryMusclesFor = (name: string, fallback: string[] = []): string[] =>
  PRIMARY_MUSCLES[canonicalLiftKey(name)] || fallback;

/* Split days repeat inside one cycle as "Legs" and "Legs 2". A plan that
   prescribes a top set for "Legs" is prescribing for BOTH instances — the
   second exposure must never fall back to "map an exercise". Strip a trailing
   instance number to compare day names. */
export const splitDayKey = (name: string): string =>
  String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s*(?:#\s*)?\d+$/, '');
