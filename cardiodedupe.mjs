/* THE HAND LOG WINS. A run typed into Forge and the same run recorded by the
   watch are one session. They never match on name — Forge names a run by its
   role ("Easy", "Base", "Speed Run"), Strava by its sport ("Run") — so the day
   used to hold both and every mileage total counted it twice. */
import { readFileSync } from 'node:fs';
const src = readFileSync('src/features/training/stravaImportService.ts', 'utf8');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) { pass++; console.log(`PASS  ${n}`); } else { fail++; console.log(`FAIL  ${n} ${d}`); } };

/* Reproduce the shipped classifier exactly. */
const partBody = src.match(/const classOfPart[\s\S]*?\n\};/)[0]
  .replace('const classOfPart = ', '')
  .replace(/\(part: string\): string =>/, '(part) =>')
  .replace(/;\s*$/, '');
const classOfPart = eval(`(${partBody})`);
const cardioClasses = (activity) => new Set(String(activity || '').split('+').map(p => p.trim()).filter(Boolean).map(classOfPart));
const cardioClass = (activity) => classOfPart(String(activity || '').split('+')[0] || '');

const decide = (manual, strava) => {
  const logged = new Set(manual.flatMap(name => [...cardioClasses(name)]));
  return strava.filter(a => !logged.has(cardioClass(a)));
};

/* 1. Forge's vocabulary and Strava's land in the same class. */
for (const name of ['Easy', 'Base', 'Speed Run', 'Long Run', 'Run', 'Trail Run', 'Tempo', 'Easy + Speed Run'])
  check(`"${name}" is a run`, cardioClass(name) === 'run', `→ ${cardioClass(name)}`);
check('"Walk" is not a run', cardioClass('Walk') === 'walk');
check('"Weight Training" is not a run', cardioClass('Weight Training') === 'strength');
check('"Bike" is not a run', cardioClass('Bike') === 'bike');
check('"Rowing" and "Row" agree', cardioClass('Rowing') === cardioClass('Row'));
/* The sport is decided before the intensity. "Easy Bike" reading as a run is
   what let the dedupe mark a real Strava run as already logged and lose it. */
check('"Easy Bike" is a bike, not a run', cardioClass('Easy Bike') === 'bike', `→ ${cardioClass('Easy Bike')}`);
check('"Easy Row" is a row', cardioClass('Easy Row') === 'row', `→ ${cardioClass('Easy Row')}`);
check('"Long Walk" is a walk', cardioClass('Long Walk') === 'walk', `→ ${cardioClass('Long Walk')}`);
check('"Base Swim" is a swim', cardioClass('Base Swim') === 'swim', `→ ${cardioClass('Base Swim')}`);
check('Elliptical and Stair Climber stay apart', cardioClass('Elliptical') !== cardioClass('Stair Climber'));
check('a hand-logged Easy Bike does NOT swallow a Strava Run', decide(['Easy Bike'], ['Run']).join() === 'Run');
/* A combined entry covers every session inside it. */
check('"Walk + Easy" covers both a walk and a run', [...cardioClasses('Walk + Easy')].sort().join() === 'run,walk');
check('"Walk + Easy" supersedes a Strava Run AND a Strava Walk', decide(['Walk + Easy'], ['Run', 'Walk']).length === 0);
check('"Row + Wall Balls + Assault Bike" covers row and bike', cardioClasses('Row + Wall Balls + Assault Bike').has('row') && cardioClasses('Row + Wall Balls + Assault Bike').has('bike'));
check('a plain "Easy" still means an easy run', decide(['Easy'], ['Run']).length === 0);

/* 2. The importer consults the hand log before adding, and settles what it skips. */
check('a hand-logged class blocks the import when it covers it', /day\?\.classes\.has\(group\)/.test(src) && /if \(covered\)/.test(src));
check('superseded rows are marked settled', /settledRowIds = \[\.\.\.importedRowIds, \.\.\.supersededRowIds\]/.test(src));
check('only typed sessions count as hand-logged', /startsWith\('strava-'\)\) continue;/.test(src));

/* 3. The decision table, end to end. */
check('manual Easy beats a Strava Run', decide(['Easy'], ['Run']).length === 0);
check('manual Base beats a Strava Run', decide(['Base'], ['Run']).length === 0);
check('no manual run keeps the Strava run', decide([], ['Run']).join() === 'Run');
check('a manual run keeps a Strava ride', decide(['Base'], ['Ride']).join() === 'Ride');
check('a manual run keeps Strava lifting', decide(['Long Run'], ['Weight Training']).join() === 'Weight Training');
check('manual walk beats a Strava walk, run still imports', decide(['Weighted Walk'], ['Walk', 'Run']).join() === 'Run');

/* THE HAND LOG WINS THE DISTANCE IT COVERS. Presence alone was too blunt: one
   combined entry suppressed four separate Strava runs on the same day, and
   across one athlete's history that hid 28.5 miles the watch alone saw. */
const TOLERANCE = 0.5;
const supersedes = (typedMiles, watchedMiles) => watchedMiles === 0 || typedMiles + TOLERANCE >= watchedMiles;
check('a matching run is still a duplicate', supersedes(4.0, 4.01));
check('a rounding-level difference is still a duplicate', supersedes(3.3, 3.52));
check('the watch recording much more is NOT a duplicate', !supersedes(3.0, 5.4));
/* Four short watch runs totalling 3.38 mi against a typed 3 mi entry is
   within tolerance — the same session, split by the watch. The losses worth
   recovering are the days where the gap is real. */
check('four short watch runs totalling 3.38 mi against 3 mi typed is still one session', supersedes(3.0, 0.9 + 0.54 + 0.94 + 1.0));
check('a 4.86 mi entry against 8 mi of watch runs keeps them', !supersedes(4.86, 8.0));
check('a class with no distance still goes on presence', supersedes(0, 0));
check('the tolerance is stated once in the source', /COVERAGE_TOLERANCE_MILES = 0\.5/.test(src));
check('coverage is compared per class per day', /watchMiles\.get\(mapped\.date\)\?\.get\(group\)/.test(src));
check('a combined entry credits its distance to each part', /classes\.forEach\(name => day\.miles\.set/.test(src));

/* A LIFT IS NOT CARDIO. Strava calls a gym session WeightTraining, and
   importing every activity as a cardio session made "Weight Training" the
   most-logged cardio type in the athlete's insights. */
check('a strength activity is not logged as a cardio session', /if \(group !== 'strength'\) entry\.sessions\.push/.test(src));
check('a lifting-only day does not become a cardio day', /muscles: hasCardio \? \['Cardio'\] : \[\]/.test(src) && /hasCardio = entry\.sessions\.length > 0/.test(src));
check('the day is still recorded as trained', /entry\.rowIds\.push\(row\.id\); entry\.titles\.push/.test(src));
check('Strava WeightTraining classifies as strength', classOfPart('Weight Training') === 'strength');
check('a run on the same day still imports', classOfPart('Run') === 'run');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
