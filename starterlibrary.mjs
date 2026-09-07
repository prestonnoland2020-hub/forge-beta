import { primaryMusclesFor } from './src/lib/liftAliases.ts';
import { normalizeMuscleGroups } from './src/lib/muscleGroups.ts';
import { readFileSync } from 'node:fs';
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
process.exit(fails ? 1 : 0);
