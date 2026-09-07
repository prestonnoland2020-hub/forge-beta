/* THE 6 x 400 HE RAN ON THE SUNDAY.

   Preston's Chest & Back day carries the week's quality session. He ran it a
   day early because that is when he had the track; the next morning Forge
   offered it to him again. These are the exact rows from his log. */
import { repeatShape, findCompletedRepeats } from './src/lib/sessionAlreadyDone.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const session = (date, rows) => ({
  id: `r-${date}`, date, title: 'Run', muscles: ['Cardio'], hasCardio: true,
  cardioSessions: [{ id: `c-${date}`, activity: 'Run', structure: 'Intervals', summary: '',
    prescription: { legacyIntervals: rows } }],
});
const meters = (distance, count) => Array.from({ length: count }, () => ({ cardioType: 'Run', unit: 'meters', distance, time: 1.33 }));
const miles = (distance, count) => Array.from({ length: count }, () => ({ cardioType: 'Run', unit: 'miles', distance, time: 9 }));

/* His actual Sunday: six 400s plus a 1.81-mile cooldown. */
const HIS_LOG = [
  session('2026-09-06', [...meters(400, 6), { cardioType: 'Run', unit: 'miles', distance: 1.808, time: 0 }]),
  session('2026-09-04', miles(2, 1)),
];

console.log('\nReading the prescription');
check('"6 x 400m" is understood as repeat work', JSON.stringify(repeatShape({ title: '6 x 400m' })) === '{"repeats":6,"meters":400}', JSON.stringify(repeatShape({ title: '6 x 400m' })));
check('and so is "4 × 800 meters"', repeatShape({ title: '4 × 800 meters' })?.repeats === 4);
check('an easy run is not repeat work at all', repeatShape({ title: 'Easy run', summary: 'Easy Run · 5 mi @ 9:30' }) === null);
check('nor is a tempo described in minutes', repeatShape({ title: 'Tempo', summary: '20 min @ threshold' }) === null);

console.log('\nHis Monday');
const shape = repeatShape({ title: '6 x 400m' });
const found = findCompletedRepeats(HIS_LOG, shape, '2026-09-07');
check('Forge sees he already ran it', Boolean(found), found ? `${found.matched} × ${found.meters} m on ${found.date}` : 'not found');
check('and names the day it was done', found?.date === '2026-09-06');

console.log('\nThe ways it must NOT misfire');
const autoLapped = [session('2026-09-06', miles(1, 5))];
check('a device auto-lapping an easy run into mile splits is not a 400 session',
  findCompletedRepeats(autoLapped, shape, '2026-09-07') === null);
check('and a mile-repeat prescription is not satisfied by 400s',
  findCompletedRepeats(HIS_LOG, repeatShape({ title: '5 x 1 mile' }), '2026-09-07') === null);
check('800s are not satisfied by 400s',
  findCompletedRepeats(HIS_LOG, repeatShape({ title: '6 x 800m' }), '2026-09-07') === null);
check('work from a week ago is stale, not credit',
  findCompletedRepeats([session('2026-08-28', meters(400, 6))], shape, '2026-09-07') === null);
check('two lone repeats do not pass for a session of six',
  findCompletedRepeats([session('2026-09-06', meters(400, 2))], shape, '2026-09-07') === null);
check('but cutting six down to four still counts as done',
  Boolean(findCompletedRepeats([session('2026-09-06', meters(400, 4))], shape, '2026-09-07')));
check('a watch logging 398 and 412 still counts',
  Boolean(findCompletedRepeats([session('2026-09-06', [
    { cardioType: 'Run', unit: 'meters', distance: 398, time: 1.3 },
    { cardioType: 'Run', unit: 'meters', distance: 412, time: 1.4 },
    { cardioType: 'Run', unit: 'meters', distance: 405, time: 1.3 },
    { cardioType: 'Run', unit: 'meters', distance: 396, time: 1.3 },
  ])], shape, '2026-09-07')));
check('an empty log suppresses nothing', findCompletedRepeats([], shape, '2026-09-07') === null);

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
