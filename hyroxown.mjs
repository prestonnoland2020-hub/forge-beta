/* HYROX: ROUNDS SESSIONS AND SESSIONS THE ATHLETE WRITES.
   Two asks from the beta: "hyrox workouts with fewer exercises and more
   rounds — 3 rounds of 1000 m row, 50 wall balls, 1000 m run", and "no way to
   write my own hyrox workouts". Pins the rounds writer, that the rotation is
   untouched, and that an own session is shown as written. */
import { hyroxSession, hyroxShape, ownHyroxSession } from './src/lib/hyroxSession.ts';
import { hyroxStarter } from './src/features/splits/splitModel.ts';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };
const names = s => s.plan.stationEntries.map(e => e.name);

console.log('\nRounds session');
const r = hyroxSession({ sessionIndex: 0, thresholdSecondsPerMile: 420, shape: 'rounds' });
check('shape is rounds', r.shape === 'rounds');
check('3 rounds', r.plan.rounds === '3' && /^3 rounds/.test(r.summary), r.summary);
check('two stations and a 1 km run a round', names(r).length === 3 && names(r)[2] === 'Run' && r.plan.stationEntries[2].target === '1000');
check('row 1000 m and wall balls 50 reps on the first', names(r)[0] === 'Rowing' && r.plan.stationEntries[0].target === '1000' && names(r)[1] === 'Wall Balls' && r.plan.stationEntries[1].target === '50', JSON.stringify(r.plan.stationEntries));
check('no rest between pieces', r.plan.roundRest === '0' && r.plan.stationEntries.every(e => e.rest === '0'));
check('the run is paced', /\/mi/.test(r.runPace) && r.plan.stationEntries[2].pace === r.runPace);
const seen = new Set(Array.from({ length: 6 }, (_, i) => hyroxSession({ sessionIndex: i, thresholdSecondsPerMile: 420, shape: 'rounds' }).title));
check('the pair changes from session to session', seen.size === 6, [...seen].join(' | '));
check('works with no run pace known', hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: 0, shape: 'rounds' }).plan.stationEntries.length === 3);
check('race week still wins', hyroxSession({ sessionIndex: 0, thresholdSecondsPerMile: 420, shape: 'rounds', weeksToRace: 0.5 }).shape === 'race-week');

console.log('\nThe daily rotation is unchanged');
check('rotation has no rounds', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].every(i => hyroxShape(i) !== 'rounds'));

console.log('\nA session the athlete wrote');
const starter = hyroxStarter();
check('the starter is 3 × row, wall balls, run', starter.rounds === '3' && starter.stationEntries.map(e => e.name).join() === 'Rowing,Wall Balls,Run');
const own = ownHyroxSession({ ...starter, activity: 'HYROX' });
check('shown as written', own.plan.stationEntries.length === 3 && own.plan.activity === 'HYROX' && own.title === 'Your HYROX session', own.title);
check('its summary names the rounds and movements', own.summary === '3 rounds: Rowing, Wall Balls, Run', own.summary);
check('editing keeps what was saved', hyroxStarter({ ...starter, rounds: '5' }).rounds === '5');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
