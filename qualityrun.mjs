/* A 5K BUILD WITH NO TEMPO RUNNING IS AN INCOMPLETE BUILD.

   Forge prescribed short reps at goal pace and easy miles, and nothing else.
   The limit on a 5K is how long you can hold just under the point where
   lactate runs away from you, and that is trained by running at it. This pins
   that threshold work exists, that it is paced off the goal, that there is
   never more than one hard run in a week, and that a rough check-in takes it
   away rather than the calendar insisting. */
import { qualitySession, qualityKindFor, thresholdMinutes, THRESHOLD_PACE_MULTIPLE, QUALITY_MAX_SHARE } from './src/lib/qualitySession.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

/* Preston: sub-19 5K is 6:06/mi. */
const GOAL_PACE = 366;
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
check('by about the threshold multiple',
  Math.abs(tempoSeconds - GOAL_PACE * THRESHOLD_PACE_MULTIPLE) <= 1, `${tempoSeconds} vs ${Math.round(GOAL_PACE * THRESHOLD_PACE_MULTIPLE)}`);

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

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
