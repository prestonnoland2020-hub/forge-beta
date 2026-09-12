/* TWO PLANS ON ONE SCREEN IS NOT A COMBINED PLAN.

   This is the part no running app has to think about and no lifting app has to
   think about, which is exactly why it is the part Forge has to get right.
   Until something reconciles them the athlete gets a squat max week and the
   hardest running week of the block in the same seven days, a heavy lower day
   the evening before a long run, and two deloads that never line up — each
   decision defensible alone and the sum of them unsurvivable. */
import { bestRunDay, peakConflict, deloadWeek, longRunClash, interferenceNotes, near } from './src/lib/interference.ts';
import { resolveWeekRunning } from './src/features/training/aiPlanService.ts';
import { enduranceTarget } from './src/lib/qualitySession.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const day = (name, index, over = {}) => ({ name, index, lowerBody: false, rest: false, ...over });
/* Preston's shape: legs Monday and Friday, rest Sunday. */
const WEEK = [
  day('Legs', 0, { lowerBody: true }),
  day('Push', 1), day('Pull', 2), day('Cardio', 3),
  day('Legs 2', 4, { lowerBody: true }),
  day('Upper', 5),
  day('Rest', 6, { rest: true }),
];

console.log('\nThe hard run goes as far from heavy legs as the split allows');
const placed = bestRunDay(WEEK);
check('not merely "the first day that is not a leg day"', placed !== 1, `${WEEK[placed].name}`);
check('it is the day furthest from squatting', placed === 2, `${WEEK[placed].name}`);
check('a rest day is never handed a hard run', !WEEK[bestRunDay(WEEK)].rest);
check('a day already carrying the long run is not reused',
  bestRunDay(WEEK, [2]) !== 2, `${WEEK[bestRunDay(WEEK, [2])].name}`);
check('a split with no room still answers rather than failing',
  bestRunDay(WEEK.map(entry => ({ ...entry, lowerBody: !entry.rest }))) >= 0);
check('and a week of nothing but rest says so', bestRunDay(WEEK.map(entry => ({ ...entry, rest: true }))) === -1);
check('with no lifting at all any day will do', bestRunDay(WEEK.map(entry => ({ ...entry, lowerBody: false }))) >= 0);

console.log('\nProximity is what matters, and it wraps around the week');
check('Friday and Saturday are too close', near(4, 5, 7));
check('Friday and Sunday are not', !near(4, 6, 7));
check('and Sunday runs into Monday', near(6, 0, 7), 'the cycle has no seam');

console.log('\nOne peak at a time — and the nearer goal owns the week');
check('a max week with no hard running is no conflict',
  peakConflict({ liftingMaxWeek: true, runningPeakWeek: false }) === null);
check('a hard running week with no max is no conflict',
  peakConflict({ liftingMaxWeek: false, runningPeakWeek: true }) === null);
const raceSooner = peakConflict({ liftingMaxWeek: true, runningPeakWeek: true, weeksToRace: 3, weeksToLiftGoal: 14 });
check('the race is closer, so the running keeps the week', raceSooner?.owner === 'running');
check('and the max attempt backs off rather than disappearing',
  /heavy double/.test(raceSooner.say), raceSooner.say);
const liftSooner = peakConflict({ liftingMaxWeek: true, runningPeakWeek: true, weeksToRace: 20, weeksToLiftGoal: 2 });
check('the lift goal is closer, so the attempt keeps the week', liftSooner?.owner === 'lifting');
check('with no race date at all the lift wins by default',
  peakConflict({ liftingMaxWeek: true, runningPeakWeek: true, weeksToLiftGoal: 5 })?.owner === 'lifting');

console.log('\nAnd the engine actually acts on it');
const goal = enduranceTarget([{ type: 'Endurance', exercise: '5K', title: '5K', target: '18:59', date: '2027-06-01' }]);
const days = WEEK.map(entry => ({ name: entry.name, dayType: entry.rest ? 'Rest' : 'Cardio' }));
const base = { runningDays: 4, minWeeklyMileage: 14, maxWeeklyMileage: 40, weeklyMileage: 20, recentWeeklyMileage: 18,
  goalPaceSecondsPerMile: goal.paceSecondsPerMile, goalMiles: goal.miles };
const week = { week: 6, phase: 'Peak', mileage: 20, longRunMiles: 6, longRunPace: '9:00', longRunDay: 'Cardio',
  quality: 'No goal-driven cardio', qualityPace: '7:00', qualityDay: 'Pull',
  easyDays: ['Upper'], easyMinutes: 40, easyPace: '9:00', topSets: [], note: '' };
const normal = resolveWeekRunning(week, days, base, { weekIndex: 5, blockWeeks: 10, waveIndex: 5 });
const yielded = resolveWeekRunning(week, days, base,
  { weekIndex: 5, blockWeeks: 10, waveIndex: 5, liftingMaxWeek: true, weeksToRace: 30, weeksToLiftGoal: 2 });
check('normally the specific week runs hard', !/Easy/.test(normal.quality), normal.quality);
check('with the max attempt owning the week, the hard run steps back',
  /max attempt/i.test(yielded.quality), yielded.quality);
check('but the week keeps its volume — backing off is not skipping',
  yielded.mileage >= normal.mileage * 0.9, `${yielded.mileage} vs ${normal.mileage} mi`);
const raceOwns = resolveWeekRunning(week, days, base,
  { weekIndex: 5, blockWeeks: 10, waveIndex: 5, liftingMaxWeek: true, weeksToRace: 2, weeksToLiftGoal: 30 });
check('and when the race is the near goal the running is untouched',
  !/max attempt/i.test(raceOwns.quality), raceOwns.quality);

console.log('\nThe deloads are the same deload');
check('the lifting wave cuts on its 2-rep week', deloadWeek(3));
check('and nothing else does', [0, 1, 2, 4].every(index => !deloadWeek(index)));
check('it repeats with the wave', deloadWeek(8) && deloadWeek(13));
check('which is the same week the mileage cuts', [3, 8, 13].every(index => deloadWeek(index) === (index % 5 === 3)));

console.log('\nA long run on legs that lifted yesterday');
check('is caught', longRunClash(1, WEEK)?.name === 'Legs');
check('and a clear day before it is not', longRunClash(3, WEEK) === null);
check('the check wraps the week too', longRunClash(0, WEEK) === null, 'Sunday is a rest day');

console.log('\nThe week says why it looks the way it does — at most one thing at a time');
const notes = interferenceNotes({ days: WEEK, longRunIndex: 1, hardRunIndex: 2,
  liftingMaxWeek: true, runningPeakWeek: true, weeksToRace: 2, weeksToLiftGoal: 20 });
check('the peak conflict is said first', notes[0]?.kind === 'peak', notes.map(note => note.kind).join(', '));
check('the long-run clash is said too', notes.some(note => note.kind === 'long-run'));
check('and it names the day, not just the problem',
  /Legs/.test(notes.find(note => note.kind === 'long-run').say),
  notes.find(note => note.kind === 'long-run')?.say);
check('a clean week says nothing at all',
  interferenceNotes({ days: WEEK, longRunIndex: 3, hardRunIndex: 2, liftingMaxWeek: false, runningPeakWeek: false }).length === 0);
const crowded = WEEK.map(entry => ({ ...entry, lowerBody: !entry.rest && entry.index !== 2 }));
check('a split with nowhere clear says that instead of pretending',
  interferenceNotes({ days: crowded, longRunIndex: 5, hardRunIndex: 2, liftingMaxWeek: false, runningPeakWeek: false })
    .some(note => note.kind === 'crowding'));

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
