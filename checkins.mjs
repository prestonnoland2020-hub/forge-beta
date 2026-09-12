/* FORGE WAS ASSUMING EVERY ATHLETE WOKE UP PERFECT.

   The engine could always act on fatigue — cardioEngine cuts volume on poor
   recovery, holds load when strength fatigue is high, repeats a week rather
   than progressing it. All of it was wired to a smartwatch, and without one
   deriveRecoveryState returned readiness 100 and said so in its own reasons:
   "Recovery is not being used to change coaching or training."

   This pins the loop that closes it: what an answer is worth, how long it is
   allowed to speak for, when the coach asks, and when it shuts up. */
import { readinessFromCheckIn, applyCheckIn, liveCheckIn, isStruggling, strugglingStreak, CHECK_IN_HALF_LIFE_DAYS } from './src/lib/readiness.ts';
import { dueCheckIn, isBigDay, CADENCE_DAYS } from './src/lib/checkInSchedule.ts';
import { planPressure } from './src/lib/planPressure.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

const back = days => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
const TODAY = back(0);
const answer = (days, legs, energy, sleep, extra = {}) => ({ date: back(days), legs, energy, sleep, ...extra });

console.log('\nAn answer becomes a number');
check('fresh, good, slept well is near the top', readinessFromCheckIn(answer(0, 1, 5, 5)) >= 95, `${readinessFromCheckIn(answer(0, 1, 5, 5))}`);
check('wrecked, flat, slept badly is near the floor', readinessFromCheckIn(answer(0, 5, 1, 1)) <= 35, `${readinessFromCheckIn(answer(0, 5, 1, 1))}`);
check('the middle is the middle', Math.abs(readinessFromCheckIn(answer(0, 3, 3, 3)) - 75) <= 5, `${readinessFromCheckIn(answer(0, 3, 3, 3))}`);
check('sore legs matter more than one bad night',
  readinessFromCheckIn(answer(0, 5, 3, 3)) < readinessFromCheckIn(answer(0, 3, 3, 1)),
  `${readinessFromCheckIn(answer(0, 5, 3, 3))} vs ${readinessFromCheckIn(answer(0, 3, 3, 1))}`);

console.log('\nAn answer speaks for today and tomorrow, then stops');
check('today counts', Boolean(liveCheckIn([answer(0, 3, 3, 3)], TODAY)));
check('yesterday still counts', Boolean(liveCheckIn([answer(1, 3, 3, 3)], TODAY)));
check(`${CHECK_IN_HALF_LIFE_DAYS + 1} days old does not`, liveCheckIn([answer(CHECK_IN_HALF_LIFE_DAYS + 1, 5, 1, 1)], TODAY) === null);
check('a week of silence does not suppress training', liveCheckIn([answer(7, 5, 1, 1)], TODAY) === null);

console.log('\nWith no watch, the athlete is the sensor');
const blind = { date: TODAY, readiness: 100, strengthFatigue: 'Low', confidence: 'Low', sleepScore: 0, autonomicScore: 0, loadScore: 0, reasons: ['No smartwatch data synced', 'Recovery is not being used to change coaching or training'], hardTrainingAllowed: true };
const rough = applyCheckIn(blind, [answer(0, 5, 1, 1)], TODAY);
check('readiness stops being 100', rough.readiness < 60, `${rough.readiness}`);
check('hard training comes off the table', rough.hardTrainingAllowed === false);
check('strength fatigue reflects the legs', rough.strengthFatigue === 'High', rough.strengthFatigue);
check('and it no longer claims recovery is unused',
  !rough.reasons.some(reason => /not being used/i.test(reason)), rough.reasons[0]);
const fine = applyCheckIn(blind, [answer(0, 1, 5, 5)], TODAY);
check('a good morning leaves training alone', fine.hardTrainingAllowed === true && fine.readiness >= 95, `${fine.readiness}`);

console.log('\nWith a watch, the report can lower the number and never raise it');
const watch = { ...blind, readiness: 52, confidence: 'High', strengthFatigue: 'Moderate', reasons: ['7.1 hr sleep'], hardTrainingAllowed: false };
check('claiming to feel great does not override a poor reading',
  applyCheckIn(watch, [answer(0, 1, 5, 5)], TODAY).readiness === 52, `${applyCheckIn(watch, [answer(0, 1, 5, 5)], TODAY).readiness}`);
check('saying you feel awful does lower it',
  applyCheckIn(watch, [answer(0, 5, 1, 1)], TODAY).readiness < 52);

console.log('\nThree rough mornings is a program problem, not a bad week');
check('one is not', !isStruggling([answer(0, 5, 1, 1)]));
check('two is not', !isStruggling([answer(0, 5, 1, 1), answer(1, 5, 2, 2)]));
const three = [answer(0, 5, 1, 1), answer(1, 5, 2, 2), answer(2, 4, 2, 2)];
check('three is', isStruggling(three), `${strugglingStreak(three)} of the last five`);

console.log('\nWhen the coach asks');
const day = (id, date, sets = [], cardio = []) => ({ id, date, title: 'Session', muscles: [], hasCardio: Boolean(cardio.length), topSets: sets, cardioSessions: cardio });
const run = miles => [{ id: `c${miles}`, activity: 'Run', structure: 'steady', prescription: { distanceUnit: 'miles', legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: miles, time: miles * 9 }] } }];
const normalWeeks = Array.from({ length: 8 }, (_, i) => day(`n${i}`, back(i + 3), [{ lift: 'Squat', weight: 300, reps: 8, completed: true }], run(3)));

const single = day('max', back(1), [{ lift: 'Squat', weight: 495, reps: 1, completed: true }]);
const askedMax = dueCheckIn([single, ...normalWeeks], [], TODAY);
check('the morning after a single, it asks', askedMax?.reason === 'big-day', `${askedMax?.reason}`);
check('and it names what it saw', /squat/i.test(askedMax?.prompt || ''), askedMax?.prompt);

const longRun = day('long', back(1), [], run(9));
const askedRun = dueCheckIn([longRun, ...normalWeeks], [], TODAY);
check('the morning after a long run, it asks', askedRun?.reason === 'big-day', askedRun?.prompt);

console.log('\nAnd when it does not');
check('never twice in a day', dueCheckIn([single, ...normalWeeks], [answer(0, 3, 3, 3)], TODAY) === null);
check('never twice about the same session',
  dueCheckIn([single, ...normalWeeks], [answer(1, 3, 3, 3, { aboutRecordId: 'max' })], TODAY) === null);
check('an ordinary day is not a big day', !isBigDay(normalWeeks[0], normalWeeks));
check('someone who has not trained is not asked how training feels',
  dueCheckIn([day('old', back(30), [], run(3))], [], TODAY) === null);
const recentlyAsked = dueCheckIn(normalWeeks, [answer(1, 3, 3, 3)], TODAY);
check('and the slow cadence stays slow', recentlyAsked === null, `${recentlyAsked?.reason}`);
const overdue = dueCheckIn([day('t', back(1), [{ lift: 'Squat', weight: 300, reps: 8, completed: true }], run(3)), ...normalWeeks], [answer(CADENCE_DAYS + 1, 3, 3, 3)], TODAY);
check('after a few quiet days it checks in anyway', overdue?.reason === 'cadence', `${overdue?.reason}`);

console.log('\nThe block itself gets a verdict');
check('three rough mornings means the block is too much',
  planPressure({ checkIns: three, backedOffLifts: [], missedSessions: 0, goalsBehind: true })?.verdict === 'too-much');
check('a backed-off lift says the same thing',
  planPressure({ checkIns: [], backedOffLifts: ['squat'], missedSessions: 0, goalsBehind: false })?.verdict === 'too-much');
check('and the instruction is written for the planner, not for a log',
  /cut|reset|rebuild/i.test(planPressure({ checkIns: three, backedOffLifts: [], missedSessions: 0, goalsBehind: true })?.instruction || ''),
  planPressure({ checkIns: three, backedOffLifts: [], missedSessions: 0, goalsBehind: true })?.instruction);
const easy = [answer(0, 1, 5, 5), answer(1, 1, 5, 4), answer(2, 2, 5, 5)];
check('sailing through with a goal off track means there is room for more',
  planPressure({ checkIns: easy, backedOffLifts: [], missedSessions: 0, goalsBehind: true })?.verdict === 'too-little');
check('but an athlete on track is left alone',
  planPressure({ checkIns: easy, backedOffLifts: [], missedSessions: 0, goalsBehind: false }) === null);
check('and a quiet block says nothing at all',
  planPressure({ checkIns: [answer(0, 3, 3, 3)], backedOffLifts: [], missedSessions: 0, goalsBehind: true }) === null);

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
