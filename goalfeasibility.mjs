/* WOULD IT HAVE TOLD HIM IN JULY.

   Preston's goals were a 4:59 mile, a 10:59 two-mile and an 18:59 5K, all by
   December 31. His best logged mile is 5:48, he runs about 13 miles a week, and
   his long run has been five miles for seven weeks. None of the three was
   going to happen, and Forge had been silent about it since July while
   prescribing half the volume he was already running.

   This is the arithmetic that says no. */
import { goalFeasibility, competingRaces, equivalentSeconds, volumeForPace, reachableSeconds, bestContinuousEffort } from './src/lib/goalFeasibility.ts';
import { calculateEstimatedOneRepMax } from './src/lib/strength.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const inWeeks = n => { const d = new Date(); d.setDate(d.getDate() + n * 7); return d.toISOString().slice(0, 10); };

const run = (ago, miles, minutes, lines = 1) => ({ id: `r${ago}-${miles}`, date: day(ago), title: 'Run', muscles: ['Cardio'], hasCardio: true, topSets: [],
  cardioSessions: [{ id: `c${ago}-${miles}`, activity: 'Run', structure: 'steady', summary: `Run · ${miles} mi`,
    prescription: { legacyIntervals: Array.from({ length: lines }, () => ({ distance: miles / lines, unit: 'miles', time: minutes / lines, cardioType: 'Run' })) } }] });

/* Preston's real shape: a 5:48 mile, easy running at ten minutes, ~13 a week. */
const PRESTON = [
  run(12, 1, 5.8), run(40, 5.5, 46), run(9, 5.12, 40), run(17, 4, 30),
  ...[2, 4, 5, 7, 11, 14, 16, 18, 21, 23, 25, 28, 30, 32].map(ago => run(ago, 2.5, 25)),
];

console.log('\n  Riegel carries one result to another distance');
check('a well-trained 5:48 miler is about a 19:17 5K', Math.round(equivalentSeconds(348, 1, 3.10686)) === 1157,
  String(Math.round(equivalentSeconds(348, 1, 3.10686))));
/* And the same mile off a fraction of the volume is worth a good deal less —
   the whole reason the exponent is not a constant. */
check('the same mile on a third of the volume is worth 20:34',
  Math.round(equivalentSeconds(348, 1, 3.10686, 0.64)) === 1235, String(Math.round(equivalentSeconds(348, 1, 3.10686, 0.64))));
check('and going DOWN in distance is never stretched',
  equivalentSeconds(1157, 3.10686, 1, 1) === equivalentSeconds(1157, 3.10686, 1, 0));
check('and about a 12:05 two-mile', Math.round(equivalentSeconds(348, 1, 2)) === 726, String(Math.round(equivalentSeconds(348, 1, 2))));

console.log('\n  the volume a pace is built on');
check('6:07/mi wants about 22 a week', volumeForPace(367) === 22, String(volumeForPace(367)));
check('5:30/mi wants about 35', volumeForPace(330) === 35, String(volumeForPace(330)));
check('8:00/mi wants 12', volumeForPace(480) === 12, String(volumeForPace(480)));

console.log('\n  and how fast a time can honestly move');
check('16 weeks is capped at 12 weeks of gain', reachableSeconds(1210, 16) === reachableSeconds(1210, 12));
check('which is about 11%', Math.round((1 - reachableSeconds(1210, 16) / 1210) * 100) === 11,
  String(Math.round((1 - reachableSeconds(1210, 16) / 1210) * 100)));

console.log('\n  his best continuous effort is found, and intervals are not it');
const best = bestContinuousEffort([...PRESTON, run(3, 3, 8, 7)]);
check('the 5:48 mile is his best', Math.round(best.seconds) === 348, `${best.miles} mi in ${best.seconds}`);
check('a 7-line interval session is not a race prediction', Math.round(best.equivalentMile) === 348);
check('and neither is a walk', bestContinuousEffort([run(1, 1, 20)]) === null);

console.log('\n  the three goals he actually has');
const GOALS = [
  { type: 'Endurance', title: 'Mile', exercise: 'Mile', target: '4:59', unit: 'mm:ss', date: inWeeks(16), metric: 'Finish time', connection: '' },
  { type: 'Endurance', title: '2 Mile', exercise: '2 Mile', target: '10:59', unit: 'mm:ss', date: inWeeks(16), metric: 'Finish time', connection: '' },
  { type: 'Endurance', title: '5K', exercise: '5K', target: '18:59', unit: 'mm:ss', date: inWeeks(16), metric: 'Finish time', connection: '' },
];
const verdicts = goalFeasibility(GOALS, PRESTON);
const of = title => verdicts.find(v => v.goal === title);
check('all three are judged', verdicts.length === 3, verdicts.map(v => `${v.goal}:${v.verdict}`).join(' '));
/* NOT ONE OF THEM IS CALLED ACHIEVABLE AS IT STANDS, and the verdicts are not
   all the same word — which matters, because "no" to everything is as useless
   as "yes" to everything. The mile and the two-mile ask for more than any
   sixteen weeks buys. The 5K is reachable on the clock and not on this
   training, which is a different answer and the more useful one. */
for (const title of ['Mile', '2 Mile']) {
  check(`${title} is out of reach in the time`, of(title).verdict === 'out-of-reach', `${of(title).verdict} — ${of(title).say}`);
  check(`${title} says what IS reachable instead`, /reachable target/.test(of(title).insteadOf || ''), of(title).insteadOf || '');
  check(`${title} compares what is asked against what the weeks buy`, /buys about \d+%/.test(of(title).say), of(title).say);
}
check('the 5K is reachable but not on this volume', of('5K').verdict === 'needs-more', `${of('5K').verdict} — ${of('5K').say}`);
check('and it names the volume it is built on', /normally built on about \d+/.test(of('5K').say), of('5K').say);
check('every one of them names the change that matters',
  verdicts.every(v => /miles a week/.test(v.change || '')), verdicts.map(v => v.change).join(' | '));
check('none of them says "ambitious but achievable"', !verdicts.some(v => /ambitious|achievable with|stay consistent/i.test(`${v.say} ${v.change || ''}`)));

console.log('\n  three races on one date is not a plan');
const clash = competingRaces(GOALS);
check('the clash is reported', clash?.races.length === 3, JSON.stringify(clash?.races));
check('a single race is not a clash', competingRaces([GOALS[0]]) === null);

console.log('\n  a goal that does hold is not talked out of');
const easy = goalFeasibility([{ ...GOALS[2], target: '24:00' }], PRESTON);
check('a 24:00 5K off a 5:48 mile is already there', easy[0].verdict === 'reachable', `${easy[0].verdict} — ${easy[0].say}`);

console.log('\n  and nothing to predict from says so, with the session that fixes it');
const blind = goalFeasibility([GOALS[2]], []);
check('it does not pretend', blind[0].verdict === 'needs-more', blind[0].verdict);
check('and names the run that would answer it', /log it/i.test(blind[0].change || ''), blind[0].change || '');

console.log('\n  lift goals get the same treatment');
const bench = weight => ({ id: `b${weight}`, date: day(10), title: 'Push', muscles: ['Chest'], hasCardio: false, cardioSessions: [],
  topSets: [{ id: `s${weight}`, muscle: 'Chest', lift: 'Bench', weight, reps: 6, completed: true, calculatedMax: calculateEstimatedOneRepMax(weight, 6) }] });
const lift = goalFeasibility([{ type: 'Strength', title: '400 lb Bench', exercise: 'Bench', target: '400', unit: 'lb', date: inWeeks(16), metric: 'Real 1RM', connection: '' }], [bench(320)]);
check('372 to 400 in 16 weeks holds', lift[0].verdict === 'reachable', `${lift[0].verdict} — ${lift[0].say}`);
const wild = goalFeasibility([{ type: 'Strength', title: '600 lb Bench', exercise: 'Bench', target: '600', unit: 'lb', date: inWeeks(8), metric: 'Real 1RM', connection: '' }], [bench(320)]);
check('372 to 600 in 8 weeks does not', wild[0].verdict === 'out-of-reach', `${wild[0].verdict} — ${wild[0].say}`);
check('and it names the number that does', /reachable target/.test(wild[0].insteadOf || ''), wild[0].insteadOf || '');

console.log('\n  and a ceiling he set himself can make a goal impossible');
/* He capped his running at 25 a week and asked for a pace built on 35. Forge
   ramped obediently to 25 and said nothing about the contradiction. */
const capped = goalFeasibility([GOALS[1]], PRESTON, { maxWeeklyMileage: 25 });
check('the cap is named against the pace', /capped at 25/.test(capped[0].change || ''), capped[0].change || '');
check('and it says which one has to move', /raise the cap or move the target/.test(capped[0].change || ''));
const roomy = goalFeasibility([GOALS[1]], PRESTON, { maxWeeklyMileage: 60 });
check('a cap with room in it is not mentioned', !/capped at/.test(roomy[0].change || ''), roomy[0].change || '');

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
