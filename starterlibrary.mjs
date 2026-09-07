import { primaryMusclesFor } from './src/lib/liftAliases.ts';
import { normalizeMuscleGroups } from './src/lib/muscleGroups.ts';
import { readFileSync } from 'node:fs';
import { exerciseCategories, exerciseCategory, isProgrammableStrength } from './src/features/training/TrainingLibraryProvider.tsx';
const src = readFileSync('src/features/training/TrainingLibraryProvider.tsx', 'utf8');
const block = src.match(/const starterExercises[^=]*=\[([\s\S]*?)\n\];/)[1];
const items = [...block.matchAll(/name:'([^']+)',kind:'(\w+)',muscles:\[([^\]]*)\],detail:'([^']*)'/g)];
const category = detail => /HYROX/i.test(detail) ? 'HYROX' : /CrossFit/i.test(detail) ? 'CrossFit' : 'plain';
/* Exactly what the onboarding mapper can offer: plain-category strength only,
   with muscles folded the way the provider folds them on load. */
const offerable = items.filter(i => i[2] === 'Strength' && category(i[4]) === 'plain')
  .map(i => ({ name: i[1], muscles: primaryMusclesFor(i[1], normalizeMuscleGroups(i[3].replace(/'/g, '').split(','))) }));
const MUSCLES = ['Chest','Back','Shoulders','Biceps','Triceps','Quads','Hamstrings','Glutes','Calves','Abs','Forearms'];
let fails = 0;
console.log('What a brand-new athlete can map, per muscle:\n');
for (const muscle of MUSCLES) {
  const found = offerable.filter(e => e.muscles.includes(muscle)).map(e => e.name);
  if (!found.length) fails += 1;
  console.log(`  ${found.length ? 'PASS' : 'FAIL'}  ${muscle.padEnd(11)} ${found.join(', ') || '— nothing to choose —'}`);
}
console.log(fails ? `\n${fails} muscle(s) would still corner a new athlete` : '\nNo split day can be left unmappable');

/* A movement may belong to more than one programme. The deadlift is the case:
   a barbell strength lift that is also a CrossFit movement. Tagging it CrossFit
   alone removed it from split mapping, goal building and the logger. */
const deadlift = { name: 'Deadlift', kind: 'Strength', detail: 'Barbell · Weight + reps · Primary lift · CrossFit', categories: ['Strength', 'CrossFit'] };
const thruster = { name: 'Thrusters', kind: 'Strength', detail: 'CrossFit · repetitions' };
const bench = { name: 'Bench Press', kind: 'Strength', detail: 'Barbell · Weight + reps · Primary lift' };
const run = { name: 'Run', kind: 'Cardio', detail: 'Run · distance' };
let bad = 0;
const t = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) bad += 1; };
console.log('\nDeadlift, tagged both:');
t('is programmable as a strength lift', isProgrammableStrength(deadlift));
t('and still claims CrossFit', exerciseCategories(deadlift).includes('CrossFit'), exerciseCategories(deadlift).join(' + '));
t('sorts under Strength in the library', exerciseCategory(deadlift) === 'Strength');
console.log('\nNothing else moved:');
t('a CrossFit-only movement stays out of strength programming', !isProgrammableStrength(thruster));
t('a plain barbell lift is unaffected', isProgrammableStrength(bench));
t('cardio is not a strength lift', !isProgrammableStrength(run));
t('and an untagged row still derives from its detail', exerciseCategory(thruster) === 'CrossFit');
console.log((fails + bad) ? `\n${fails + bad} check(s) failed` : '\nAll checks passed');
process.exit((fails + bad) ? 1 : 0);
