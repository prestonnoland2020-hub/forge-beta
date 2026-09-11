/* A DAY OF THE SPLIT MUST NOT VANISH.

   Preston's split is eight days: Chest & Back, Legs, Sharms, Long Run, Chest &
   Back 2, Legs 2, Sharms 2, Rest. He trained Chest & Back 2 on the Friday and
   the week read Chest & Back 2 → Sharms 2 → Rest → Chest & Back. Legs 2, the
   next day in his own split, appeared nowhere.

   The anchor is the split day AFTER the last session logged, and the calendar
   assumed that day was always today's. On a day already trained it is
   tomorrow's — so the whole week was drawn one day early, and the session that
   belonged to tomorrow was painted onto today, behind the logged one. */
import { weekCycleDays } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const iso = offset => { const day = new Date(); day.setHours(12, 0, 0, 0); day.setDate(day.getDate() + offset); return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`; };

const SPLIT = ['Chest & Back', 'Legs', 'Sharms', 'Long Run', 'Chest & Back 2', 'Legs 2', 'Sharms 2', 'Rest']
  .map(name => ({ name, dayType: /run/i.test(name) ? 'cardio' : /rest/i.test(name) ? 'rest' : 'strength' }));

const week = anchor => weekCycleDays(iso(0), 0, SPLIT, 'rolling', anchor).map(day => day.name);

console.log('\n  the morning he has not trained yet');
/* Last logged was Sharms (3), so the next day is Long Run (4) and it is today's. */
const untrained = week({ position: 4, dateIso: iso(0) });
check('today is the day he is owed', untrained[0] === 'Long Run', untrained[0]);
check('and the week runs the split in order', untrained.join(' → ')
  === 'Long Run → Chest & Back 2 → Legs 2 → Sharms 2 → Rest → Chest & Back → Legs', untrained.join(' → '));

console.log('\n  the evening of a day he has already trained');
/* He logged Chest & Back 2 (5), so the next day is Legs 2 (6) — and it is
   TOMORROW's, because today is finished. */
const trained = week({ position: 6, dateIso: iso(1) });
check('today still shows the day he trained', trained[0] === 'Chest & Back 2', trained[0]);
check('and Legs 2 is tomorrow, where it belongs', trained[1] === 'Legs 2', trained[1]);
check('the week is his split in order', trained.join(' → ')
  === 'Chest & Back 2 → Legs 2 → Sharms 2 → Rest → Chest & Back → Legs → Sharms', trained.join(' → '));

console.log('\n  and no day of the split is skipped, whatever the anchor');
for (let position = 1; position <= SPLIT.length; position += 1) {
  for (const offset of [0, 1]) {
    const names = week({ position, dateIso: iso(offset) });
    const positions = names.map(name => SPLIT.findIndex(day => day.name === name));
    /* Seven consecutive rungs of an eight-day cycle: each one is the one after
       the last, wrapping. A skip is exactly what put Legs 2 nowhere. */
    const consecutive = positions.every((value, index) =>
      index === 0 || value === (positions[index - 1] + 1) % SPLIT.length);
    check(`position ${position}${offset ? ' (trained today)' : ''} runs consecutively`, consecutive, names.join(' → '));
  }
}

console.log('\n  the old behaviour is what the bug looked like');
/* Anchoring "the next day" at today is what dropped one: the week starts on the
   day that should have been tomorrow. */
const shifted = week({ position: 6, dateIso: iso(0) });
check('anchoring tomorrow’s day at today loses the day he just did', shifted[0] === 'Legs 2', shifted[0]);
check('and that is why Sharms 2 came next', shifted[1] === 'Sharms 2', shifted[1]);

console.log('\n  a missing anchor date still means today');
check('the default is unchanged', week({ position: 4 }).join() === week({ position: 4, dateIso: iso(0) }).join());

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
