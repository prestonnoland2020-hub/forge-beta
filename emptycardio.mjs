/* A SESSION NEEDS ONE REAL NUMBER.

   Adam's Saturday run reached Preston's phone as "Run —". It was saved with a
   distance of zero and a time of zero: the builder was opened, the activity
   was picked, and the numbers never went in. Forge wrote it anyway, so his day
   carried a run worth no miles, no minutes and no pace.

   Time alone is still a session — a forty-five minute bike has no distance and
   is real training. Neither is not. */
import { isLoggedCardio, cardioMiles, summarizeCardioDraft } from './src/lib/cardioSession.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const legacy = (activity, lines) => ({ id: 'c', activity, structure: 'steady', summary: activity,
  prescription: { legacyIntervals: lines.map(([distance, unit, time]) => ({ distance, unit, time, cardioType: activity })) } });

console.log('\n  Adam’s row, exactly as the database holds it');
const empty = legacy('Run', [[0, 'minutes', 0]]);
check('it is not a session', isLoggedCardio(empty) === false);
check('and it was never worth any miles', cardioMiles(empty) === 0, String(cardioMiles(empty)));
check('nor any minutes', summarizeCardioDraft(empty).minutes === 0);

console.log('\n  what is a session');
check('his real run the day before', isLoggedCardio(legacy('Run', [[3.01, 'miles', 24.6]])) === true);
check('a bike with a time and no distance', isLoggedCardio(legacy('Bike', [[0, 'minutes', 45]])) === true);
check('a distance with no time, which is still something he covered',
  isLoggedCardio(legacy('Run', [[1.81, 'miles', 0]])) === true);
check('a walk', isLoggedCardio(legacy('Walk', [[0.84, 'miles', 15.3]])) === true);

console.log('\n  and one empty leg among real ones does not condemn the session');
check('six repeats plus an untimed piece is a session',
  isLoggedCardio(legacy('Run', [[400, 'meters', 1.33], [400, 'meters', 1.33], [1.81, 'miles', 0]])) === true);

console.log('\n  a steady session with nothing typed into it');
check('no legs, no numbers, no session',
  isLoggedCardio({ id: 'c', activity: 'Run', structure: 'steady', summary: 'Run', prescription: { distance: 0, duration: 0 } }) === false);
check('but a duration alone is one',
  isLoggedCardio({ id: 'c', activity: 'Bike', structure: 'steady', summary: 'Bike', prescription: { distance: 0, duration: 45 } }) === true);

/* The logger is where it must never be written in the first place. */
import { readFileSync } from 'node:fs';
const logger = readFileSync('src/pages/ProductPages.tsx', 'utf8');
console.log('\n  and the logger refuses to write one');
check('every entry is filtered before it is persisted', /const entries=allEntries\.filter\(isLoggedCardio\)/.test(logger));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
