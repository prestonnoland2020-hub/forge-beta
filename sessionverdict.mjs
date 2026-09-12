/* "5 × 1200 m @ 4:42" GOES OUT AND NOTHING COMES BACK.

   Forge could say what to run and could tell that it had been run. It could
   never say HOW IT WENT — the richest signal a training app has, sitting on
   the floor. An athlete hitting every repeat ten seconds fast is telling you
   their threshold is stale; an athlete whose last two repeats fall apart every
   week is telling you the pace is wrong, and will read it as their own failure
   until somebody says otherwise.

   This pins that the prescription Forge writes can be read back, that the
   comparison is fair, and that a bad day is never mistaken for a trend. */
import { parsePrescription, workEfforts, sessionVerdict, sessionTrend } from './src/lib/sessionVerdict.ts';
import { qualitySession } from './src/lib/qualitySession.ts';
import { paceModel } from './src/lib/paceModel.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const M = 1609.344;

console.log('\nEVERY session Forge writes can be read back — it is the contract with the athlete');
/* Generated, not hand-typed: if the wording of a session ever changes, this
   fails rather than silently going blind. */
const paces = { source: 'recent-run', supported: true, from: null,
  easyFast: 550, easySlow: 620, marathon: 480, threshold: 443, interval: 378, repetition: 338 };
const EVENTS = [1, 2, 3.107, 6.214, 13.109, 26.219];
const PHASES = ['Foundation', 'Build', 'Specific'];
let generated = 0, parsed = 0, unparsed = [];
for (const goalMiles of EVENTS) {
  for (const phase of PHASES) {
    for (let week = 0; week < 12; week += 1) {
      const session = qualitySession({ phase, weekIndex: week, goalPaceSecondsPerMile: 367, goalMiles, weeklyMiles: 35, paces });
      if (!['threshold', 'intervals', 'reps', 'racepace'].includes(session.kind)) continue;
      generated += 1;
      if (parsePrescription(session.text)) parsed += 1; else unparsed.push(session.text);
    }
  }
}
check(`every hard session is machine-readable (${parsed}/${generated})`, parsed === generated, unparsed.slice(0, 2).join(' | '));
check('and the soft ones are correctly left unjudged',
  [null, '', 'No goal-driven cardio', 'Easy only — the hard run moves to when you have recovered',
   'Short fartlek — 6 × 1 min brisk, easy between. Stop while fresh',
   '4–6 × 20 s strides at goal effort, full recovery',
   'Easy — your max attempt is this week and owns it'].every(text => parsePrescription(text) === null));

console.log('\nThe numbers come back out the way they went in');
const reps = parsePrescription('5 × 1200 m @ 4:42/rep');
check('repeats, distance and pace', reps.reps === 5 && reps.metres === 1200, `${reps?.reps} × ${reps?.metres} m`);
check('and the pace is per mile, not per rep', Math.round(reps.targetPace) === Math.round((282 / 1200) * M), `${Math.round(reps.targetPace)} s/mi`);
const tempo = parsePrescription('3 × 8 min @ 7:23/mi · 90 s jog between · threshold');
check('a broken threshold run', tempo.kind === 'threshold' && tempo.reps === 3 && tempo.minutes === 8);
check('and a continuous one', parsePrescription('20 min continuous @ 7:23/mi · threshold')?.reps === 1);
check('race-pace miles', parsePrescription('3 × 1.5 mi @ 7:00/mi · race pace · 3 min jog between')?.kind === 'racepace');
check('and race-pace metres', parsePrescription('3 × 400 m @ 1:24/rep · race pace')?.kind === 'racepace');
check('repetition work is its own kind', parsePrescription('8 × 300 m @ 1:03/rep · full recovery')?.kind === 'reps');

console.log('\nThe warm-up is not the session');
const logged = (rows) => workEfforts(rows);
const row = (distance, time, segment, unit = 'miles') => ({ distance, time, segment, unit, cardioType: 'Run' });
const withSegments = logged([
  row(1, 10, 'warmup'), row(0.2, 1, 'work'), row(0.2, 1, 'work'), row(0.2, 1.05, 'work'), row(1, 11, 'cooldown'),
]);
check('only work segments count', withSegments.length === 3, `${withSegments.length} efforts`);
check('a session with no segments separates the fast lines from the slow ends',
  logged([row(1, 10), row(0.25, 1.3), row(0.25, 1.3), row(0.25, 1.3), row(1, 11)]).length === 3);
check('two lines with no segments are both the session', logged([row(1, 6), row(1, 6.2)]).length === 2);
check('lines with no time are not evidence', logged([row(1, 0, 'work'), row(0.25, 1.3, 'work')]).length === 1);
check('nothing logged, nothing read', logged([]).length === 0 && logged(null).length === 0);

console.log('\nThe verdict');
const at = (metres, secondsPerMile, count) => Array.from({ length: count }, () => ({ metres, seconds: (secondsPerMile / M) * metres }));
const p = parsePrescription('5 × 1200 m @ 4:42/rep');
check('run as written, it says so', sessionVerdict(p, at(1200, p.targetPace, 5)).outcome === 'on');
check('a couple of seconds either way is still on', sessionVerdict(p, at(1200, p.targetPace * 1.02, 5)).outcome === 'on');
check('clearly faster is called out', sessionVerdict(p, at(1200, p.targetPace * 0.93, 5)).outcome === 'faster');
check('clearly slower is too', sessionVerdict(p, at(1200, p.targetPace * 1.09, 5)).outcome === 'slower');
const fasterSay = sessionVerdict(p, at(1200, p.targetPace * 0.93, 5)).say;
check('and it names what was run AND what was asked', (fasterSay.match(/\d+:\d\d\/mi/g) || []).length === 2, fasterSay);
check('and how far off a rep that is', /[+−]\d+ s a rep/.test(fasterSay));

const faded = [...at(1200, p.targetPace * 0.97, 2), ...at(1200, p.targetPace * 1.12, 3)];
const fadeVerdict = sessionVerdict(p, faded);
check('a fade is caught even when the average looks fine', fadeVerdict.outcome === 'faded', fadeVerdict.say.slice(0, 60));
check('and it is blamed on the pacing, not the athlete', /pacing problem/.test(fadeVerdict.say));
check('stopping early outranks how fast the reps were',
  sessionVerdict(p, at(1200, p.targetPace * 0.9, 2)).outcome === 'short');
check('four of five is finishing, not stopping', sessionVerdict(p, at(1200, p.targetPace, 4)).outcome === 'on');
check('a session logged with no times is not judged', sessionVerdict(p, []).outcome === 'unmeasured');
check('no prescription, no verdict', sessionVerdict(null, at(1200, 300, 5)) === null);

console.log('\nThe check-in asks about what it saw');
check('a fade becomes a question about the legs', /legs|hot/.test(fadeVerdict.ask), fadeVerdict.ask);
check('a short session asks why it stopped', /Was that the legs/.test(sessionVerdict(p, at(1200, p.targetPace, 2)).ask));
check('and a session on the nose still gets a question', sessionVerdict(p, at(1200, p.targetPace, 5)).ask.length > 10);

console.log('\nA day is not a trend');
const v = outcome => ({ outcome });
check('one fast session is a good day', sessionTrend([v('faster'), v('on'), v('on')]) === null);
check('three is the block being pitched under you', sessionTrend([v('faster'), v('faster'), v('faster')])?.kind === 'paces-stale');
check('three short ones is the prescription being wrong', sessionTrend([v('slower'), v('faded'), v('short')])?.kind === 'asking-too-much');
check('and it says so in those words', /not you/.test(sessionTrend([v('slower'), v('slower'), v('slower')]).say));
check('a mixed run is not a trend', sessionTrend([v('faster'), v('slower'), v('on')]) === null);
check('unmeasured sessions do not count toward one', sessionTrend([v('faster'), v('unmeasured'), v('faster')]) === null);
check('too few sessions, no verdict yet', sessionTrend([v('faster'), v('faster')]) === null);
check('each trend carries the instruction the rebuild reads',
  Boolean(sessionTrend([v('faster'), v('faster'), v('faster')]).instruction) &&
  Boolean(sessionTrend([v('slower'), v('slower'), v('slower')]).instruction));

console.log('\nAnd it only judges a log that was an ATTEMPT at the session');
/* Every guard here exists because it fired on Preston's real log and said
   something false about a run he actually did.

   Note the block below never sets the session text: resolveWeekRunning WRITES
   the hard session from the engine, so the prescription is decided by which
   week of the block the run fell in. Trying to control it by storing a
   different string is exactly the bug that was fixed earlier. */
import('./src/features/training/sessionVerdicts.ts').then(async ({ sessionVerdicts }) => {
  const paces2 = { easyFast: 550, easySlow: 620, marathon: 480, threshold: 443, interval: 378, repetition: 338,
    source: 'recent-run', supported: true, from: null };
  const split = ['Cardio', 'Rest'].map(name => ({ name, dayType: name }));
  const block = { startDate: '2026-09-01',
    plan: { weeks: Array.from({ length: 6 }, (_, i) => ({ week: i + 1, phase: 'Base', mileage: 24,
      longRunMiles: 7, longRunPace: '9:35', longRunDay: 'Cardio', quality: 'x', qualityPace: '', qualityDay: 'Cardio',
      easyDays: [], easyMinutes: 60, easyPace: '9:25', topSets: [], note: '' })) } };
  const athlete = { runningDays: 4, minWeeklyMileage: 2, maxWeeklyMileage: 40, weeklyMileage: 24,
    recentWeeklyMileage: 24, recentLongestRun: 8, longestRunMiles: 8,
    goalPaceSecondsPerMile: 367, goalMiles: 3.107, paces: paces2 };
  const log = (date, lines) => ({ id: date, date,
    cardioSessions: [{ activity: 'Run', structure: 'intervals', prescription: { legacyIntervals: lines } }] });
  const rep = (miles, minutes) => ({ distance: miles, time: minutes, unit: 'miles', segment: 'work', cardioType: 'Run' });
  const judge = records => sessionVerdicts(records, block, split, athlete, '2026-10-03', 8);

  /* Week 1 is Foundation, which is a threshold week — 12 min @ 7:23/mi. */
  const WEEK1 = '2026-09-03';
  const tempo = log(WEEK1, [rep(1.63, 12)]);          /* 12 min at 7:22/mi */
  const jog = log(WEEK1, [rep(1.2, 12)]);             /* 12 min at 10:00/mi */
  const long = log(WEEK1, [rep(6, 54)]);              /* an hour, at tempo pace */
  check('the tempo it asked for is judged', judge([tempo]).length === 1, judge([tempo])[0]?.outcome);
  check('a jog of the same LENGTH is not the tempo', judge([jog]).length === 0);
  check('and neither is a run four times as long at the right pace', judge([long]).length === 0);

  /* Week 5 is an interval week. */
  const WEEK3 = '2026-09-29';
  const reps8 = log(WEEK3, Array.from({ length: 8 }, () => rep(0.2487, 1.32)));
  const easyRun = log(WEEK3, [rep(4, 38)]);
  const judgedReps = judge([reps8]);
  check('a rep session on a rep week is judged', judgedReps.length === 1, judgedReps[0]?.say?.slice(0, 46));
  check('and an easy run on the same day is not a slow set of 400s', judge([easyRun]).length === 0);

  check('a day with no running at all is skipped',
    judge([{ id: 'x', date: WEEK1, cardioSessions: [] }]).length === 0);
  check('nothing logged before the block started counts',
    judge([log('2026-08-01', [rep(1.63, 12)])]).length === 0);

  console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
  process.exit(fails ? 1 : 0);
});
