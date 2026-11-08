/* THE COACH FIXES THE PART THAT IS WEAK, NOT THE WHOLE PLAN.

   Preston told the coach "Let's just do the running a bit easier for a while
   until I build base back". It offered "Lighter training for the next few
   days" — a whole-body fatigue note, which takes ten percent off every lift
   too. A fatigue note now names what it is about, and only that part eases. */
import { parseActions, localActions, easeRecommendation } from './src/lib/coachActions.ts';
import { bodyLogState, fatigueScope, easyRunWeeks } from './src/lib/bodyLog.ts';
import { resolveWeekRunning } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };
const CTX = { splitDays: [], goals: [], activeNoteAreas: [], exercises: [], weeklyMileage: 15, runningDays: 3, loadBiasPercent: 0 };
const today = '2026-11-08';

console.log('\nWhat a fatigue note is about');
check('no area is the whole body', fatigueScope(null).kind === 'all' && fatigueScope('fatigue').kind === 'all');
check('"running" is the running', fatigueScope('running').kind === 'running' && fatigueScope('aerobic base').kind === 'running');
check('"lifting" is the lifting', fatigueScope('Lifting').kind === 'lifting' && fatigueScope('strength').kind === 'lifting');
check('"legs" is the leg lifts', fatigueScope('legs').kind === 'muscles' && fatigueScope('legs').muscles.includes('Quads'));
check('a lift name is that lift', fatigueScope('Bench').kind === 'lift');

console.log('\nThe coach says what it would change');
const [running] = parseActions([{ type: 'log_note', noteKind: 'fatigue', text: 'running easier', area: 'running', days: 14 }], CTX);
check('a running note reads as running only', /^Easier running for 14 days — lifting unchanged$/.test(running.label), running.label);
const [lifting] = parseActions([{ type: 'log_note', noteKind: 'fatigue', text: 'lifts feel heavy', area: 'lifting', days: 5 }], CTX);
check('a lifting note reads as lifting only', /Lighter lifting .* running unchanged/.test(lifting.label), lifting.label);
const [whole] = parseActions([{ type: 'log_note', noteKind: 'fatigue', text: 'wiped', area: null, days: null }], CTX);
check('plain fatigue still eases everything', whole.label === 'Lighter training for the next few days', whole.label);

console.log('\nOffline, the sentence is read the same way');
const said = localActions('Let’s just do the running a bit easier for a while until I build base back', CTX);
check('Preston\'s sentence becomes an easier-running note', said.length === 1 && said[0].area === 'running', JSON.stringify(said));
check('not a whole-body one', !/Lighter training/.test(said[0]?.label || ''), said[0]?.label);
const liftSaid = localActions('my lifts have felt too heavy, can we go lighter on lifting this week', CTX);
check('and "lighter on lifting" becomes a lifting note', liftSaid[0]?.area === 'lifting', JSON.stringify(liftSaid));
check('while "I\'m exhausted" is still whole-body', localActions('I am exhausted', CTX)[0]?.area == null);

console.log('\nOnly that part of the day eases');
const note = area => ({ kind: 'fatigue', status: 'active', area, bufferUntil: '2026-11-21', note: 'x' });
const runState = bodyLogState([note('running')], today);
check('a running note does not switch on whole-body easing', runState.easing === false && runState.easeRunning === true);
const day = { topSets: [{ exercise: 'Squat', muscle: 'Quads', weight: 405, reps: 5, calculatedMax: 470 }, { exercise: 'Bench', muscle: 'Chest', weight: 300, reps: 5, calculatedMax: 350 }],
  cardio: { summary: 'Threshold', session: { plan: { duration: '40', structure: 'Intervals', repeats: '5' }, stress: 'High' } }, explanation: '' };
const scope = state => ({ cardio: Boolean(state.easeRunning), set: set => Boolean(state.easeLifting) || (state.easeMuscles || []).includes(set.muscle) || (state.easeLifts || []).some(lift => lift.toLowerCase() === set.exercise.toLowerCase()) });
const easedRun = easeRecommendation(day, false, scope(runState));
check('the run goes easy', easedRun.cardio.session.stress === 'Low' && easedRun.cardio.session.plan.structure === 'Steady');
check('every lift stays as written', easedRun.topSets.every((set, i) => set.weight === day.topSets[i].weight), easedRun.topSets.map(s => s.weight).join(', '));
const legState = bodyLogState([note('legs')], today);
const easedLegs = easeRecommendation(day, false, scope(legState));
check('a legs note lightens the squat', easedLegs.topSets[0].weight < 405, String(easedLegs.topSets[0].weight));
check('but not the bench or the run', easedLegs.topSets[1].weight === 300 && easedLegs.cardio.session.stress === 'High');
const wholeEased = easeRecommendation(day, false);
check('and with no scope everything eases, as before', wholeEased.topSets.every(set => set.weight < 405 + 1 && set.weight !== 405 && set.weight !== 300) && wholeEased.cardio.session.stress === 'Low');

console.log('\nThe Plan tab shows the same easy weeks');
check('a two-week running note covers this week and next', easyRunWeeks([note('running')], today) === 2, String(easyRunWeeks([note('running')], today)));
check('a lifting note covers no running weeks', easyRunWeeks([note('lifting')], today) === 0);
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(name => ({ name, dayType: name === 'Sun' ? 'Rest' : 'Cardio' }));
const athlete = { runningDays: 4, minWeeklyMileage: 10, maxWeeklyMileage: 30, weeklyMileage: 20, recentWeeklyMileage: 18, goalPaceSecondsPerMile: 367, goalMiles: 3.107 };
const week = { week: 2, phase: 'Build', mileage: 20, longRunMiles: 6, longRunPace: '9:00', longRunDay: 'Sat', quality: 'Threshold', qualityPace: '7:00', qualityDay: 'Tue', easyDays: ['Mon', 'Thu'], easyMinutes: 40, easyPace: '9:00', topSets: [], note: '' };
const block = weekIndex => ({ weekIndex, currentWeekIndex: 1, blockWeeks: 10, waveIndex: weekIndex });
const normal = resolveWeekRunning(week, days, athlete, block(1));
const rebuilding = resolveWeekRunning(week, days, { ...athlete, easyRunWeeks: 2 }, block(1));
const later = resolveWeekRunning(week, days, { ...athlete, easyRunWeeks: 2 }, block(3));
check('normally the week has its hard run', !/Easy/.test(normal.quality), normal.quality);
check('while rebuilding, the hard run waits', /rebuild your base/.test(rebuilding.quality), rebuilding.quality);
check('and the week keeps its volume as easy miles', rebuilding.mileage >= normal.mileage * 0.9, `${rebuilding.mileage} vs ${normal.mileage}`);
check('past the window the hard run is back', !/rebuild/.test(later.quality), later.quality);

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
