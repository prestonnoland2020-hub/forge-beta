/* THE HAND LOG WINS. A run typed into Forge and the same run recorded by the
   watch are one session. They never match on name — Forge names a run by its
   role ("Easy", "Base", "Speed Run"), Strava by its sport ("Run") — so the day
   used to hold both and every mileage total counted it twice. */
import { readFileSync } from 'node:fs';
const src = readFileSync('src/features/training/stravaImportService.ts', 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };

/* Reproduce the shipped classifier exactly. */
const body = src.match(/export const cardioClass[\s\S]*?\n\};/)[0]
  .replace('export const cardioClass = ', '')
  .replace(/\(activity: string\): string =>/, '(activity) =>')
  .replace(/const name: string/, 'const name')
  .replace(/;\s*$/, '');
const cardioClass = eval(`(${body})`);

/* 1. Forge's vocabulary and Strava's land in the same class. */
for (const name of ['Easy', 'Base', 'Speed Run', 'Long Run', 'Run', 'Trail Run', 'Tempo', 'Easy + Speed Run'])
  check(`"${name}" is a run`, cardioClass(name) === 'run', `→ ${cardioClass(name)}`);
check('"Walk" is not a run', cardioClass('Walk') === 'walk');
check('"Weight Training" is not a run', cardioClass('Weight Training') === 'strength');
check('"Bike" is not a run', cardioClass('Bike') === 'bike');
check('"Rowing" and "Row" agree', cardioClass('Rowing') === cardioClass('Row'));

/* 2. The importer consults the hand log before adding, and settles what it skips. */
check('a hand-logged class blocks the import', /alreadyLogged\.get\(mapped\.date\)\?\.has\(cardioClass/.test(src));
check('superseded rows are marked settled', /settledRowIds = \[\.\.\.importedRowIds, \.\.\.supersededRowIds\]/.test(src));
check('only typed sessions count as hand-logged', /startsWith\('strava-'\)\) continue;/.test(src));

/* 3. The decision table, end to end. */
const decide = (manual, strava) => {
  const logged = new Set(manual.map(cardioClass));
  return strava.filter(a => !logged.has(cardioClass(a)));
};
check('manual Easy beats a Strava Run', decide(['Easy'], ['Run']).length === 0);
check('manual Base beats a Strava Run', decide(['Base'], ['Run']).length === 0);
check('no manual run keeps the Strava run', decide([], ['Run']).join() === 'Run');
check('a manual run keeps a Strava ride', decide(['Base'], ['Ride']).join() === 'Ride');
check('a manual run keeps Strava lifting', decide(['Long Run'], ['Weight Training']).join() === 'Weight Training');
check('manual walk beats a Strava walk, run still imports', decide(['Weighted Walk'], ['Walk', 'Run']).join() === 'Run');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
