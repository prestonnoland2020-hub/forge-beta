/* A 5K BUILD WITH NO TEMPO RUNNING IS AN INCOMPLETE BUILD.

   Forge prescribed short reps at goal pace and easy miles, and nothing else.
   The limit on a 5K is how long you can hold just under the point where
   lactate runs away from you, and that is trained by running at it. This pins
   that threshold work exists, that it is paced off the goal, that there is
   never more than one hard run in a week, and that a rough check-in takes it
   away rather than the calendar insisting. */
import { qualitySession, qualityKindFor, thresholdMinutes, enduranceTarget, qualityPhaseFor, thresholdPaceFor, THRESHOLD_PACE_MULTIPLE, QUALITY_MAX_SHARE } from './src/lib/qualitySession.ts';
import { resolveWeekRunning } from './src/features/training/aiPlanService.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

/* Preston: sub-19 5K is 6:06/mi. */
const GOAL_PACE = 366;
const ahead = weeks => { const d = new Date(); d.setDate(d.getDate() + weeks * 7); return d.toISOString().slice(0, 10); };
const ctx = (over = {}) => ({ phase: 'Build', weekIndex: 2, goalPaceSecondsPerMile: GOAL_PACE, weeklyMiles: 22, ...over });

console.log('\nThreshold work exists at all');
const kinds = new Set();
for (let week = 0; week < 10; week += 1) {
  for (const phase of ['Foundation', 'Build', 'Specific']) kinds.add(qualityKindFor(phase, week));
}
check('threshold appears in the rotation', kinds.has('threshold'), [...kinds].join(', '));
check('so do intervals', kinds.has('intervals'));

console.log('\nEvery phase gets both, so neither goes stale');
for (const phase of ['Foundation', 'Build', 'Specific']) {
  const seen = new Set(Array.from({ length: 9 }, (_, week) => qualityKindFor(phase, week)));
  check(`${phase} rotates threshold and intervals`, seen.has('threshold') && seen.has('intervals'), [...seen].join('/'));
}
console.log('  Foundation:', Array.from({ length: 9 }, (_, w) => qualityKindFor('Foundation', w)[0]).join(''));
console.log('  Specific:  ', Array.from({ length: 9 }, (_, w) => qualityKindFor('Specific', w)[0]).join(''));

console.log('\nOne hard run a week, never two');
for (let week = 0; week < 10; week += 1) {
  const session = qualitySession(ctx({ weekIndex: week }));
  const hard = ['threshold', 'intervals'].includes(session.kind);
  check(`week ${week + 1} prescribes exactly one${hard ? ' hard' : ''} session`, typeof session.text === 'string' && session.text.length > 0, `${session.kind}: ${session.text}`);
}

console.log('\nThreshold is paced off the goal, slower than 5K pace');
const tempo = qualitySession(ctx({ phase: 'Build', weekIndex: 0 }));
check('it is a threshold week', tempo.kind === 'threshold', tempo.text);
const paced = tempo.text.match(/(\d+):(\d\d)\/mi/);
const tempoSeconds = paced ? Number(paced[1]) * 60 + Number(paced[2]) : 0;
check('the pace is in the text', tempoSeconds > 0, `${paced?.[0]}`);
check('and it is slower than goal pace, not faster', tempoSeconds > GOAL_PACE, `${tempoSeconds}s vs goal ${GOAL_PACE}s`);
/* Derived from the goal now rather than multiplied by a constant, so for a 5K
   — the distance the old constant was tuned on — it lands in the same place. */
check('by the amount an hour of racing is slower than a 5K',
  Math.abs(tempoSeconds - thresholdPaceFor(GOAL_PACE, 3.107)) <= 1,
  `${tempoSeconds} vs ${Math.round(thresholdPaceFor(GOAL_PACE, 3.107))}`);
check('which is within a few seconds of the old 1.06 constant it replaces',
  Math.abs(tempoSeconds - GOAL_PACE * THRESHOLD_PACE_MULTIPLE) <= 10,
  `${tempoSeconds} vs ${Math.round(GOAL_PACE * THRESHOLD_PACE_MULTIPLE)}`);

console.log('\nNo session eats the week');
for (const miles of [10, 14, 22, 35]) {
  for (let week = 0; week < 10; week += 1) {
    const session = qualitySession(ctx({ weeklyMiles: miles, weekIndex: week }));
    if (session.miles > miles * QUALITY_MAX_SHARE + 0.05 && session.kind !== 'test') {
      check(`${miles} mi week, week ${week + 1} stays inside its budget`, false, `${session.miles} of ${miles}`);
    }
  }
}
check('every session fits its week', true, `checked 40 combinations against ${Math.round(QUALITY_MAX_SHARE * 100)}%`);

console.log('\nIntervals are never faster than goal pace');
for (const phase of ['Foundation', 'Build', 'Specific']) {
  for (let week = 0; week < 9; week += 1) {
    const session = qualitySession(ctx({ phase, weekIndex: week }));
    if (session.kind !== 'intervals') continue;
    const m = session.text.match(/(\d+) × (\d+) m @ (\d+):(\d\d)\/rep/);
    if (!m) { check(`${phase} week ${week + 1} states a rep pace`, false, session.text); continue; }
    const perMile = (Number(m[3]) * 60 + Number(m[4])) / (Number(m[2]) / 1609.344);
    if (perMile < GOAL_PACE - 1) check(`${phase} week ${week + 1} is not faster than goal pace`, false, `${Math.round(perMile)}s/mi`);
  }
}
check('no rep session is prescribed faster than the goal', true);

console.log('\nA rough morning outranks the calendar');
const wrecked = qualitySession(ctx({ readiness: 40 }));
check('below 55 the hard run comes off', wrecked.kind === 'fartlek' && /easy only/i.test(wrecked.text), wrecked.text);
const tired = qualitySession(ctx({ phase: 'Specific', weekIndex: 1, readiness: 62 }));
const fresh = qualitySession(ctx({ phase: 'Specific', weekIndex: 1 }));
check('between 55 and 70 it is cut back, not cancelled', tired.kind === fresh.kind && tired.text !== fresh.text, `${fresh.text} → ${tired.text}`);
check('and cutting back means less of it', tired.miles <= fresh.miles, `${fresh.miles} → ${tired.miles}`);

console.log('\nDeload, taper and test are themselves');
check('a deload stops while fresh', qualitySession(ctx({ phase: 'Deload' })).kind === 'fartlek');
check('a taper is strides', qualitySession(ctx({ phase: 'Taper' })).kind === 'strides');
check('the test week is the test', qualitySession(ctx({ phase: 'Test' })).kind === 'test');

console.log('\nNothing invented without a goal or a baseline');
check('no goal pace, no prescription', qualitySession(ctx({ goalPaceSecondsPerMile: 0 })).kind === 'none');
check('no logged running, ask for a baseline first', qualitySession(ctx({ hasBaseline: false })).kind === 'baseline');

console.log('\nThe effort grows through the block but stays sane');
const early = thresholdMinutes(0, 30, GOAL_PACE * THRESHOLD_PACE_MULTIPLE);
const late = thresholdMinutes(9, 30, GOAL_PACE * THRESHOLD_PACE_MULTIPLE);
check('later weeks hold it longer', late > early, `${early} min → ${late} min`);
check('and it never runs past half an hour', late <= 30, `${late}`);
check('a small week gets a shorter effort', thresholdMinutes(9, 10, GOAL_PACE * THRESHOLD_PACE_MULTIPLE) < late,
  `${thresholdMinutes(9, 10, GOAL_PACE * THRESHOLD_PACE_MULTIPLE)} min on 10 mi`);

console.log('\nAnd it reaches the block the athlete actually trains from');
/* "i also see no threshold work." qualitySession was wired only into the
   pre-program roadmap; the stored AI block — the thing the Plan tab renders —
   kept whatever prose the model wrote, which for a block generated before the
   goal existed was "No goal-driven cardio" in all ten weeks. The resolver now
   writes the session, so the two surfaces cannot disagree. */
const goal = enduranceTarget([{ type: 'Endurance', exercise: '5K', target: '19:00', date: ahead(10) }]);
check('a 5K goal resolves to its own pace', Math.round(goal.paceSecondsPerMile) === 367, `${Math.round(goal.paceSecondsPerMile)} s/mi`);

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(name => ({ name, dayType: name === 'Sun' ? 'Rest' : 'Cardio' }));
const PHASES = ['Base', 'Base', 'Build', 'Build', 'Deload', 'Build', 'Peak', 'Peak', 'Taper', 'Race'];
const athlete = { runningDays: 4, minWeeklyMileage: 14, maxWeeklyMileage: 40, weeklyMileage: 17, recentWeeklyMileage: 8, recentLongestRun: 6,
  goalPaceSecondsPerMile: goal.paceSecondsPerMile, goalMiles: goal.miles };
const resolved = PHASES.map((phase, index) => resolveWeekRunning(
  { week: index + 1, phase, mileage: 17, longRunMiles: 6, longRunPace: '9:00', longRunDay: 'Sat',
    quality: 'No goal-driven cardio', qualityPace: '7:00', qualityDay: 'Tue',
    easyDays: ['Thu'], easyMinutes: 40, easyPace: '9:00', topSets: [], note: '' },
  days, athlete, { weekIndex: index, blockWeeks: 10, waveIndex: index }));

check('the stale "no goal" text does not survive the goal',
  resolved.every(week => !/no goal/i.test(week.quality)));
check('threshold running appears in the block',
  resolved.some(week => /threshold/i.test(week.quality)),
  resolved.map(week => week.quality).find(text => /threshold/i.test(text)) || 'none');
check('every hard run is paced off the goal, never faster',
  resolved.filter(week => /threshold/i.test(week.quality)).every(week => /6:2\d\/mi/.test(week.quality)),
  resolved.find(week => /threshold/i.test(week.quality))?.quality);
check('race week is the test, not a tempo run', /assessment/i.test(resolved[9].quality), resolved[9].quality);
check('taper week sharpens rather than deloading', /strides/i.test(resolved[8].quality), resolved[8].quality);
check('the written session owns its pace, so the card cannot contradict it',
  resolved.every(week => !week.qualityPace));
check('no hard session eats the week',
  resolved.every(week => week.mileage <= athlete.maxWeeklyMileage), `${Math.max(...resolved.map(w => w.mileage))} mi`);

console.log('\nA rough morning still outranks the block');
const rough = resolveWeekRunning(
  { week: 3, phase: 'Build', mileage: 17, longRunMiles: 6, longRunPace: '9:00', longRunDay: 'Sat',
    quality: 'No goal-driven cardio', qualityPace: '', qualityDay: 'Tue',
    easyDays: ['Thu'], easyMinutes: 40, easyPace: '9:00', topSets: [], note: '' },
  days, { ...athlete, readiness: 48 }, { weekIndex: 2, blockWeeks: 10, waveIndex: 2 });
check('below 55 the hard run comes off', /recovered/i.test(rough.quality), rough.quality);

console.log('\nPhase mapping keeps the two calendars in step');
check('a running deload is a deload', qualityPhaseFor('Build', true) === 'Deload');
check('but never at the cost of the taper', qualityPhaseFor('Taper', true) === 'Taper');
check('nor of race week', qualityPhaseFor('Race', true) === 'Test');

console.log('\nThe plan is tailored to the goal, not to one distance it was tuned on');
/* "each person is not the same its dependant on their goals." Threshold used
   to be a flat 1.06 x goal pace, which is only ever right for a 5K. Carried to
   the goals either side of it, it prescribed a 4:59 miler their own race pace
   as a comfortably-hard effort, and a 4:00 marathoner their easy pace as a
   hard session. It is now the pace they could hold for about an hour, carried
   from their own goal by the same Riegel curve the predictions use. */
const paceOf = (secs, miles) => secs / miles;
const EVENTS = [
  { label: 'Mile 4:59', miles: 1, seconds: 299 },
  { label: '2 Mile 10:59', miles: 2, seconds: 659 },
  { label: '5K 18:59', miles: 3.107, seconds: 1139 },
  { label: '10K 40:00', miles: 6.214, seconds: 2400 },
  { label: 'Half 1:35', miles: 13.109, seconds: 5700 },
  { label: 'Marathon 4:00', miles: 26.219, seconds: 14400 },
];
const thresholds = EVENTS.map(event => ({ ...event, goal: paceOf(event.seconds, event.miles), thr: thresholdPaceFor(paceOf(event.seconds, event.miles), event.miles) }));
for (const event of thresholds) {
  console.log(`    ${event.label.padEnd(14)} goal ${Math.round(event.goal)} s/mi → threshold ${Math.round(event.thr)} s/mi`);
}
const find = label => thresholds.find(event => event.label.startsWith(label));
check('a miler runs threshold SLOWER than their race pace', find('Mile 4').thr > find('Mile 4').goal,
  `${Math.round(find('Mile 4').thr)} vs ${Math.round(find('Mile 4').goal)} s/mi`);
check('and not by a token amount — the old 1.06 gave 318', find('Mile 4').thr > 325, `${Math.round(find('Mile 4').thr)} s/mi`);
check('a marathoner runs threshold FASTER than their race pace', find('Marathon').thr < find('Marathon').goal,
  `${Math.round(find('Marathon').thr)} vs ${Math.round(find('Marathon').goal)} s/mi`);
check('a 4:00 marathoner gets about 8:24/mi, not 9:42', Math.abs(find('Marathon').thr - 504) < 20, `${Math.round(find('Marathon').thr)} s/mi`);
check('the 5K case the old constant was tuned on barely moves',
  Math.abs(find('5K').thr - find('5K').goal * 1.06) < 15, `${Math.round(find('5K').thr)} vs ${Math.round(find('5K').goal * 1.06)}`);
check('threshold crosses goal pace at about an hour of racing',
  find('10K').thr <= find('10K').goal * 1.02 && find('10K').thr >= find('10K').goal * 0.98, `${Math.round(find('10K').thr)} vs ${Math.round(find('10K').goal)}`);
check('threshold gets slower as the goal gets longer, every step',
  thresholds.every((event, index) => index === 0 || event.thr > thresholds[index - 1].thr));

console.log('\nReps are sized to the race, not to a 5K');
const repsFor = event => qualitySession({ phase: 'Specific', weekIndex: 4, goalPaceSecondsPerMile: paceOf(event.seconds, event.miles), weeklyMiles: 40, goalMiles: event.miles }).text;
check('a miler gets short reps', /\b[23]00 m\b/.test(repsFor(find('Mile 4'))), repsFor(find('Mile 4')));
check('a marathoner gets long ones', /mi @/.test(repsFor(find('Marathon'))), repsFor(find('Marathon')));
check('nobody is asked to race the session', EVENTS.every(event => {
  const text = repsFor(event);
  const rep = text.match(/@ (\d+):(\d{2})\/rep/);
  return Boolean(rep);
}));

console.log('\nWhich race the block is for is decided, not left to database order');
/* Preston's live goals: a mile, a two mile and a 5K, all dated the same day.
   Sorting by date alone left the winner to whatever came back first — the
   mile — so the whole plan ran at 4:59/mi and two goals were ignored. */
const sameDay = [
  { type: 'Endurance', exercise: 'Mile', title: 'Mile goal', target: '4:59', date: '2026-12-31' },
  { type: 'Endurance', exercise: '5K', title: '5K goal', target: '18:59', date: '2026-12-31' },
  { type: 'Endurance', exercise: '2 Mile', title: '2 Mile goal', target: '10:59', date: '2026-12-31' },
];
const chosen = enduranceTarget(sameDay);
check('the longest race on the date wins', chosen.goal.exercise === '5K', `${chosen.goal.title}`);
check('and the others are reported, not dropped silently', chosen.others.length === 2,
  chosen.others.map(goal => goal.title).join(', '));
check('the order they arrive in does not change the answer',
  enduranceTarget([...sameDay].reverse()).goal.exercise === '5K');
check('a genuinely sooner race still outranks a longer later one',
  enduranceTarget([...sameDay, { type: 'Endurance', exercise: 'Full Marathon', title: 'Marathon', target: '3:30:00', date: '2027-04-19' }]).goal.exercise === '5K');
check('and a sooner race wins even when it is the shortest',
  enduranceTarget([...sameDay, { type: 'Endurance', exercise: 'Mile', title: 'Spring mile', target: '4:55', date: '2026-10-01' }]).goal.title === 'Spring mile');
check('a goal with no time set cannot steer the block',
  enduranceTarget([{ type: 'Endurance', exercise: '10K', title: '10K', target: '', date: '2026-10-01' }, ...sameDay]).goal.exercise === '5K');
check('no endurance goals, nothing to build for', enduranceTarget([{ type: 'Strength', title: 'Squat' }]) === null);

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
