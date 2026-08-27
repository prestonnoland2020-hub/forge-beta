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
