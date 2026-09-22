/* "MY KNEE HURTS" CHANGES TODAY. The note used to be read only by the
   coach's prompt and a Home banner; Today still asked for squats. The daily
   engine now reads the body log: a lift whose muscle the note protects is
   held, running is swapped for bike or row when the lower leg is logged,
   and the card says so. */
import { bodyLogState, musclesForArea, exerciseBlocked } from './src/lib/bodyLog.ts';
import { buildDailyRecommendation, recommendationFingerprint } from './src/lib/dailyRecommendationEngine.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const today = '2026-09-22';

console.log('\nAreas to muscles');
check('a knee protects the lower body', musclesForArea('left knee').join(',') === 'Quads,Hamstrings,Glutes,Calves');
check('a shoulder protects pressing', musclesForArea('shoulder').includes('Chest') && musclesForArea('shoulder').includes('Shoulders'));
check('an elbow protects arms and pressing', musclesForArea('elbow').includes('Triceps'));
check('an unknown area protects nothing', musclesForArea('ego').length === 0);

console.log('\nState from notes');
const knee = bodyLogState([{ area: 'knee', kind: 'injury', status: 'active', bufferUntil: '2026-10-01' }], today);
check('an active knee note blocks the lower body and running', knee.blockedMuscles.includes('Quads') && knee.blocksRunning);
check('a cleared note blocks nothing', bodyLogState([{ area: 'knee', kind: 'injury', status: 'cleared' }], today).areas.length === 0);
check('an expired buffer blocks nothing', bodyLogState([{ area: 'knee', kind: 'injury', status: 'active', bufferUntil: '2026-09-01' }], today).areas.length === 0);
check('fatigue is not an injury — nothing is struck', bodyLogState([{ area: 'legs', kind: 'fatigue', status: 'active', bufferUntil: '2026-10-01' }], today).blockedMuscles.length === 0);
check('a shoulder note does not block running', !bodyLogState([{ area: 'shoulder', kind: 'injury', status: 'active', bufferUntil: '2026-10-01' }], today).blocksRunning);
check('judged on the primary muscle: pull-ups survive a shoulder note', !exerciseBlocked({ muscles: ['Back', 'Biceps', 'Shoulders'] }, bodyLogState([{ area: 'shoulder', kind: 'injury', status: 'active', bufferUntil: '2026-10-01' }], today)));

console.log('\nThrough the engine');
const exercises = [
  { id: 1, name: 'Back Squat', kind: 'Strength', muscles: ['Quads', 'Glutes', 'Hamstrings'], detail: 'Primary', enabled: true },
  { id: 2, name: 'Bench Press', kind: 'Strength', muscles: ['Chest', 'Triceps', 'Shoulders'], detail: 'Primary', enabled: true },
  { id: 3, name: 'Barbell Row', kind: 'Strength', muscles: ['Back', 'Biceps'], detail: 'Primary', enabled: true },
];
const splitDay = { position: 1, name: 'Full Body', type: 'mixed', muscles: ['Quads', 'Chest', 'Back'], exercises: ['Back Squat', 'Bench Press', 'Barbell Row'], cardioTypes: ['Forge'] };
const goals = [{ type: 'Endurance', title: '5K Run · 22:00 mm:ss', target: '22:00 mm:ss', date: '2026-12-01', connection: 'Cardio only', exercise: '5K Run', metric: 'Finish time', unit: 'mm:ss' }];
const build = bodyLog => buildDailyRecommendation({ date: today, splitDay, exercises, records: [], goals, recovery: { confidence: 'Low', readiness: 100 }, profile: { weeklyMileage: 20, runningDays: 3 }, runningHistory: [], loadBiasPercent: 0, bodyLog, inputFingerprint: recommendationFingerprint({ date: today, splitDay, exercises, records: [], goals, loadBiasPercent: 0 }) });
const clean = build(undefined);
check('with no note the day prescribes all three lifts', clean.topSets.map(s => s.exercise).sort().join(',') === 'Back Squat,Barbell Row,Bench Press', clean.topSets.map(s => s.exercise).join(','));
check('and a run', /run/i.test(`${clean.cardio?.session.plan.activity} ${clean.cardio?.title}`), clean.cardio?.title);
const held = build(knee);
check('with a knee in the log the squat is held, bench and row stay', held.topSets.map(s => s.exercise).sort().join(',') === 'Barbell Row,Bench Press', held.topSets.map(s => s.exercise).join(','));
check('the run becomes bike or row for the same minutes', /Bike or row/.test(held.cardio?.title || '') && held.cardio?.session.plan.activity === 'Bike', held.cardio?.title);
check('and the card says what was left out and why', /Knee in your body log: Back Squat held, running swapped for bike or row/.test(held.bodyLogNote || ''), held.bodyLogNote);
const shoulder = build(bodyLogState([{ area: 'shoulder', kind: 'injury', status: 'active', bufferUntil: '2026-10-01' }], today));
check('a shoulder note holds the bench and keeps the run', shoulder.topSets.map(s => s.exercise).sort().join(',') === 'Back Squat,Barbell Row' && !/Bike or row/.test(shoulder.cardio?.title || ''), `${shoulder.topSets.map(s => s.exercise).join(',')} / ${shoulder.cardio?.title}`);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
