/* "RECOMMEND A PLAN TO GET TO WEEKLY MILEAGE STARTING AT A BASELINE AND SLOWLY
   WORKING UP."

   Telling an athlete a pace is built on 22 miles a week when they run 13 is a
   fact, not help. The answer is the climb: what this week is, what next week
   is, how long it takes, and whether that lands before the date they picked.

   This pins the arithmetic — 10% a week, an easier week every fourth, the
   back-off never costing the progress it protects — and the honesty: a ramp
   that does not arrive says so rather than compressing itself to fit. */
import { buildMileageRamp, rampArrival, STEP_RATE, DELOAD_EVERY, DELOAD_SHARE } from './src/lib/mileageRamp.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

console.log('\nPreston: 13 miles a week, a goal built on 22');
const ramp = buildMileageRamp(13, 22);
check('it starts where he actually is', ramp.weeks[0].miles === 13, `${ramp.weeks[0].miles}`);
check('it ends on the number the goal needs', ramp.to === 22 && ramp.weeks[ramp.weeks.length - 1].miles === 22, `${ramp.weeks[ramp.weeks.length - 1].miles}`);
check('and it says how long that takes', ramp.weeksToTarget > 0, `${ramp.weeksToTarget} weeks`);
console.log('   ' + ramp.weeks.map(w => `${w.miles}${w.deload ? '*' : ''}`).join(' → '));

console.log('\nNo week is a jump');
const builds = ramp.weeks.filter(week => !week.deload);
let jumped = '';
for (let i = 1; i < builds.length; i += 1) {
  const rise = (builds[i].miles - builds[i - 1].miles) / builds[i - 1].miles;
  /* Rounding to the half-mile can put a single step a hair over the rate. */
  if (rise > STEP_RATE + 0.02) jumped = `${builds[i - 1].miles} → ${builds[i].miles}`;
}
check('no build week rises more than 10%', !jumped, jumped || 'every step within 10%');
check('nothing ever exceeds the target', ramp.weeks.every(week => week.miles <= ramp.to), `${Math.max(...ramp.weeks.map(w => w.miles))}`);

console.log('\nEvery fourth week backs off, and the build resumes from where it was');
const deloads = ramp.weeks.filter(week => week.deload);
check('there are back-off weeks at all', deloads.length > 0, `${deloads.length}`);
check('they land on the fourth week', deloads.every(week => week.week % DELOAD_EVERY === 0), deloads.map(w => w.week).join(', '));
const firstDeload = deloads[0];
const before = ramp.weeks[firstDeload.week - 2];
const after = ramp.weeks[firstDeload.week];
check('a back-off is lighter than the week before it', firstDeload.miles < before.miles, `${before.miles} → ${firstDeload.miles}`);
check('and it is about four fifths of it',
  Math.abs(firstDeload.miles - before.miles * DELOAD_SHARE) <= 0.5, `${firstDeload.miles} vs ${(before.miles * DELOAD_SHARE).toFixed(1)}`);
check('the week after resumes above the week before the back-off, not above the back-off',
  after && after.miles > before.miles, `${before.miles} → ${firstDeload.miles} → ${after?.miles}`);

console.log('\nWhether it lands in time is stated, not fudged');
const roomy = rampArrival(ramp, 20);
check('with room to spare it arrives', roomy.arrives && roomy.weeksShort === 0, `${ramp.weeksToTarget} weeks into 20`);
const tight = rampArrival(ramp, 3);
check('with three weeks it does not', !tight.arrives, `${tight.reached} mi, ${tight.weeksShort} short`);
check('and it says what would actually be reached', tight.reached >= ramp.from && tight.reached < ramp.to, `${tight.reached}`);
check('the ramp is never compressed to fit the date', buildMileageRamp(13, 22, 3).weeksToTarget === ramp.weeksToTarget,
  `${buildMileageRamp(13, 22, 3).weeksToTarget} vs ${ramp.weeksToTarget}`);

console.log('\nNothing to build when there is nothing to climb');
const flat = buildMileageRamp(30, 22);
check('already above the target, the ramp holds', flat.to === 30 && flat.weeksToTarget === 0, `${flat.to}`);
const same = buildMileageRamp(22, 22);
check('exactly at it, the same', same.weeksToTarget === 0, `${same.weeksToTarget}`);

console.log('\nA ramp from nothing still starts somewhere real');
const fromZero = buildMileageRamp(0, 22);
check('it never starts at zero', fromZero.weeks[0].miles >= 1, `${fromZero.weeks[0].miles}`);
check('and it still gets there', fromZero.to === 22 && fromZero.weeksToTarget > 0, `${fromZero.weeksToTarget} weeks`);

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
