/* WHICH RACE THE PLAN IS BUILT FOR, AND WHEN. A finished race stops steering,
   a tune-up does not get a taper, the race lands in a whole week, and the
   taper is as long as the event needs. */
import { nextRace, enduranceTarget, isTuneUp, raceIsHistory, raceWeekIndex } from './src/lib/qualitySession.ts';
import { phaseFor } from './src/lib/trainingPhase.ts';
import { eventProfileFor } from './src/lib/eventProfile.ts';
import { buildLongRangePlan } from './src/lib/longRangePlanEngine.ts';
import { localDayIso } from './src/lib/time.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const inDays = days => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() + days); return localDayIso(date); };
const today = localDayIso();
const race = (exercise, days, target) => ({ type: 'Endurance', exercise, title: exercise, target, date: inDays(days) });

console.log('\nA race that has happened is history');
const pastMarathon = race('Marathon', -30, '3:30:00');
const nextHalf = race('Half Marathon', 49, '1:35:00');
check('a month-old race is history', raceIsHistory(pastMarathon, today));
check('last weekend\'s race still counts — it owns the recovery week', !raceIsHistory(race('5K', -3, '20:00'), today));
check('the next race is the one coming up, not last month\'s', nextRace([pastMarathon, nextHalf], today)?.exercise === 'Half Marathon');
check('and it sets the pace', enduranceTarget([pastMarathon, nextHalf], today)?.goal.exercise === 'Half Marathon');
check('with nothing upcoming, the last race still gives a pace', enduranceTarget([pastMarathon], today)?.goal.exercise === 'Marathon');
check('but it steers no taper', nextRace([pastMarathon], today) === null);

console.log('\nA tune-up is a race on the way to a bigger one');
const tuneUp = race('5K', 28, '20:00');
const marathon = race('Marathon', 56, '3:30:00');
check('a 5K four weeks before a marathon is a tune-up', isTuneUp(tuneUp, [tuneUp, marathon]));
check('the marathon is not', !isTuneUp(marathon, [tuneUp, marathon]));
check('the block is built for the marathon', nextRace([tuneUp, marathon], today)?.exercise === 'Marathon');
check('and paced for it', enduranceTarget([tuneUp, marathon], today)?.goal.exercise === 'Marathon');
check('a 5K with no longer race behind it is the goal', nextRace([tuneUp], today)?.exercise === '5K');
check('a 5K a season before the marathon is its own race', !isTuneUp(tuneUp, [tuneUp, race('Marathon', 28 + 120, '3:30:00')]));
check('a HYROX after a 10K does not make the 10K a tune-up', !isTuneUp(race('10K', 20, '45:00'), [race('10K', 20, '45:00'), race('HYROX', 40, '1:25:00')]));

console.log('\nThe race lands in a whole week');
check('race day is week 3 of a calendar that started 21 days before', raceWeekIndex(inDays(21), today) === 3);
check('two days in, it is still week 0', raceWeekIndex(inDays(2), today) === 0);
check('a race before the calendar is a negative week', raceWeekIndex(inDays(-3), today) === -1);
const phases = weeksToRace => Array.from({ length: 9 }, (_, index) => phaseFor({ weekIndex: index, blockWeeks: 10, weeksToRace }));
check('a fractional horizon still has a race week', phases(5.3).includes('Race'), phases(5.3).join(' '));
check('and a recovery week after it', phases(5.3)[6] === 'Deload', phases(5.3).join(' '));

console.log('\nThe taper is as long as the event needs');
const taperOf = miles => Array.from({ length: 12 }, (_, index) => phaseFor({ weekIndex: index, blockWeeks: 12, weeksToRace: 11, shape: eventProfileFor(miles).shape })).filter(phase => phase === 'Taper').length;
check('a 5K tapers for one week', taperOf(3.107) === 1, String(taperOf(3.107)));
check('a half for two', taperOf(13.109) === 2, String(taperOf(13.109)));
check('a marathon for three', taperOf(26.219) === 3, String(taperOf(26.219)));

console.log('\nThe roadmap follows the next real race');
const profile = { weeklyMileage: 30, runningDays: 5, readiness: 100, strengthFatigue: 'Low', experience: 'advanced', longestRunMiles: 12 };
const stale = buildLongRangePlan([{ ...pastMarathon, unit: 'hh:mm:ss', metric: 'Finish time', connection: '' }, { ...nextHalf, unit: 'hh:mm:ss', metric: 'Finish time', connection: '' }], profile, 16, []);
check('a finished marathon does not shrink it to one week', stale.length === raceWeekIndex(nextHalf.date, today) + 1, `${stale.length} weeks`);
check('it ends on the half', stale.at(-1).phase === 'Race', stale.map(week => week.phase).join(' → '));
check('no week before the end is a race week', stale.slice(0, -1).every(week => week.phase !== 'Race'));

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
