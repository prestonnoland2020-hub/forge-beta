/* PLATEAU: the plan's stall rule, said out loud, and the work changed —
   one more back-off set, a variation for the sticking point, a new best to
   beat in six weeks. Same rule for every lifter. */
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
import { plateauFor, plateausFor, plateauLine } from './src/lib/plateau.ts';
import { buildFullWorkout } from './src/lib/fullWorkout.ts';
import { suggestGoals } from './src/lib/goalSuggestions.ts';
import { goalFeasibility } from './src/lib/goalFeasibility.ts';
import { goalProgress } from './src/lib/goalProgress.ts';
import { predictionFromNow } from './src/lib/predictionFromNow.ts';
import { localDayIso } from './src/lib/time.ts';
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : ` — ${detail}`}`); if (!ok) fails += 1; };
const iso = days => { const d = new Date(); d.setDate(d.getDate() + days); return localDayIso(d); };
const sets = rows => rows.map(([ago, weight, reps]) => ({ date: iso(-ago), topSets: [{ lift: 'Bench Press', weight, reps, completed: true }] }));
/* Best 225 x 5 eleven weeks ago, then two months of 215-220 x 5. */
const stuck = sets([[77, 225, 5], [63, 215, 5], [49, 220, 5], [35, 215, 5], [21, 220, 5], [7, 215, 5]]);
const climbing = sets([[63, 205, 5], [49, 210, 5], [35, 215, 5], [21, 220, 5], [7, 225, 5]]);
const library = [{ name: 'Paused Bench Press', enabled: true, kind: 'Strength', muscles: ['Chest'], detail: '' }, { name: 'Close-Grip Bench Press', enabled: false, kind: 'Strength', muscles: ['Chest'], detail: '' }, { name: 'Cable Fly', enabled: true, kind: 'Strength', muscles: ['Chest'], detail: 'accessory' }];

console.log('\nDetection');
const p = plateauFor('Bench Press', stuck);
check('two months under the old best: stuck', p && p.best > p.recentBest, JSON.stringify(p));
check('weeks since the best', p && p.weeks >= 10 && p.weeks <= 12, String(p?.weeks));
check('a climbing lift is not stuck', plateauFor('Bench Press', climbing) === null);
check('too little history is not stuck', plateauFor('Bench Press', sets([[14, 215, 5], [7, 215, 5]])) === null);

console.log('\nThe plan changes');
const found = plateausFor(['Bench Press'], stuck, library);
const hit = found.get([...found.keys()][0]);
check('variation from the enabled library only', hit?.variation === 'Paused Bench Press', String(hit?.variation));
const full = buildFullWorkout({ topSets: [{ exercise: 'Bench Press', muscle: 'Chest', weight: 205, reps: 5 }], dayMuscles: ['Chest'], library, records: stuck, metric: false, unit: 'lb', plateaus: new Map([...found].map(([k, v]) => [k, v.variation])) });
check('one more back-off set', /Then 3 ×/.test(full[0].plan), full[0].plan);
check('plateau breaker first among accessories', full[1]?.exercise === 'Paused Bench Press' && /Plateau breaker/.test(full[1].plan), JSON.stringify(full[1]));
const normal = buildFullWorkout({ topSets: [{ exercise: 'Bench Press', muscle: 'Chest', weight: 205, reps: 5 }], dayMuscles: ['Chest'], library, records: climbing, metric: false, unit: 'lb' });
check('not stuck: two back-offs, no breaker', /Then 2 ×/.test(normal[0].plan) && !normal.some(b => /Plateau/.test(b.plan)));

console.log('\nThe coach says it');
const line = plateauLine(p, 'lb', 'Paused Bench Press');
check('names the lift, the number, the weeks, the plan and a date', /stuck under \d+ lb for \d+ weeks/.test(line) && /paused bench press/.test(line) && /Beat \d+ by \w+ \d+/.test(line), line);

console.log('\nThe goal pushes it');
const judge = goal => { const v = goalFeasibility([goal], stuck)[0]; const model = v?.prediction; const now = goalProgress(goal, stuck, v, null, 'calculated', null).current ?? model?.start ?? null; return { now, model, p: model ? predictionFromNow(model, now) : undefined }; };
const s = suggestGoals({ type: 'Strength', exercise: 'Bench Press', unit: 'lb', plateau: { best: p.best, weeks: p.weeks } }, judge);
check('first suggestion: break the plateau', s[0]?.name === 'Break the plateau' && Number(s[0].targetText) > p.best - 5, JSON.stringify(s[0]));
check('six weeks out', s[0] && Math.round((Date.parse(s[0].date) - Date.now()) / 6048e5) === 6);

if (fails) { console.log(`\n${fails} failed`); process.exit(1); }
console.log('\nall passed');
