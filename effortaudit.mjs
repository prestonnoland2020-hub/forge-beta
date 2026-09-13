/* EVERY NUMBER IN FORGE RESTS ON ONE EFFORT.

   Goal verdicts, training paces, projections — all of them are built from the
   athlete's best recent continuous run. So one bad record does not cause a
   small error, it causes a wrong plan. Preston's log held a 5.47-mile run at
   5:29/mi that never happened, and off it Forge told him his 5K was already
   inside his goal and paced his whole block from it.

   Three automatic rules were tried and are pinned here as the reason the
   fourth answer — asking — is the right one. */
import { standoutEffort, contradicted, trustedEfforts, effortKey, CONFIRMED_PREFIX,
  STANDOUT_MARGIN, DISTANCE_RATIO } from './src/lib/effortAudit.ts';
import { isRaceEvidence } from './src/lib/runQuality.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const e = (date, miles, mmss) => { const [m, s] = mmss.split(':').map(Number); return { date, miles, seconds: (m * 60 + s) * miles }; };

/* His real log, at the paces he confirmed. */
const MILE_519 = e('2026-05-09', 1.02, '5:12');
const MILE_548 = e('2026-08-30', 1.00, '5:48');
const TWO_MILE = e('2026-08-20', 2.00, '5:51');
const BAD_LONG = e('2026-06-10', 5.47, '5:29');
const REAL = [MILE_519, MILE_548, TWO_MILE, e('2026-03-22', 1.00, '5:28'), e('2026-06-04', 5.00, '6:38')];

console.log('\nWhy the automatic rules are not enough — this is the point of the feature');
check('a 5:29 five-miler is not physically impossible, so the record floor allows it',
  isRaceEvidence(BAD_LONG.miles, BAD_LONG.seconds));
check('and it does not contradict his real 5:19 mile either',
  contradicted([...REAL, BAD_LONG]).length === 0,
  contradicted([...REAL, BAD_LONG]).map(x => x.date).join(', '));
check('so nothing automatic throws it out', trustedEfforts([...REAL, BAD_LONG]).length === REAL.length + 1);

console.log('\nWhat IS automatic: a longer run faster per mile than a shorter one');
const impossible = e('2026-02-01', 5.00, '5:00');
check('is a contradiction and needs no question', contradicted([...REAL, impossible]).length === 1);
check('and the shorter effort is believed, not the longer one',
  contradicted([...REAL, impossible])[0].date === impossible.date);
/* It is NOT excluded automatically. The comparison is only meaningful against
   the athlete's best SHORT effort, and nothing in the data says whether the
   short run on file was a time trial or a warm-up jog — a test caught this
   throwing away an ordinary 3-mile tempo because the only shorter run beside
   it was a 9:00/mi jog. Self-comparison decides what to ASK about; only the
   world-record floor excludes anything on its own. */
check('but it is not thrown away on that basis alone',
  trustedEfforts([...REAL, impossible]).some(x => x.date === impossible.date));
check('a 3-mile tempo beside a warm-up jog is left completely alone',
  trustedEfforts([e('2026-01-01', 1, '9:00'), e('2026-01-02', 3, '7:00')]).length === 2);
check('two runs of similar length are not compared at all',
  contradicted([e('2026-01-01', 1.00, '6:00'), e('2026-01-02', 1.2, '5:50')]).length === 0,
  `they are within ${DISTANCE_RATIO}x`);

console.log('\nSo Forge asks — about the one effort that is actually driving the numbers');
const ask = standoutEffort([...REAL, BAD_LONG]);
check('it asks about the standout', ask?.effort.date === BAD_LONG.date, ask?.effort.date);
check('and says how far clear of the rest it is', ask.aheadBy > 10, `${Math.round(ask.aheadBy)} s/mi`);
check('and says why it matters', /every training pace/i.test(ask.question), ask.question);
check('a genuine short PR is never queried — there is nothing shorter to doubt it against',
  standoutEffort(REAL) === null, standoutEffort(REAL)?.effort.date || 'no question');
check('even though his 5:19 mile IS well clear of his 5:28 one',
  standoutEffort([MILE_519, e('2026-03-22', 1.00, '5:28')]) === null);
check('and so is one with nothing to compare', standoutEffort([MILE_519]) === null);
check('a best effort only marginally ahead is not worth a question',
  standoutEffort([MILE_519, e('2026-06-01', 1.00, '5:11')]) === null,
  `inside ${STANDOUT_MARGIN * 100}%`);

console.log('\nIt asks once, whichever way the answer goes');
check('answered "no" — never asked about again',
  standoutEffort([...REAL, BAD_LONG], [effortKey(BAD_LONG)])?.effort.date !== BAD_LONG.date);
check('and gone from what predictions may use',
  !trustedEfforts([...REAL, BAD_LONG], [effortKey(BAD_LONG)]).some(x => x.date === BAD_LONG.date));
check('answered "yes" — never asked about again either',
  standoutEffort([...REAL, BAD_LONG], [`${CONFIRMED_PREFIX}${effortKey(BAD_LONG)}`])?.effort.date !== BAD_LONG.date);
check('and still available to predict from — a confirmed PR is not thrown away',
  trustedEfforts([...REAL, BAD_LONG], [`${CONFIRMED_PREFIX}${effortKey(BAD_LONG)}`]).some(x => x.date === BAD_LONG.date));
check('the key survives a round trip through storage',
  effortKey(JSON.parse(JSON.stringify(BAD_LONG))) === effortKey(BAD_LONG));

console.log('\nAnd once the standout is gone it moves on to the next one, not silence');
/* With the 5.47 answered, nothing else in his log beats his best short effort,
   so Forge goes quiet rather than working down a list. */
const second = standoutEffort([...REAL, BAD_LONG, e('2026-07-04', 3.13, '5:39')], [effortKey(BAD_LONG)]);
check('and it does not then work through the rest of the log', second === null, second?.effort.date || 'silent');
/* A three-mile at 4:50/mi, against a best mile of 5:12, is not a question —
   it is a contradiction, and it goes without being asked about. */
check('a long run faster per mile than his best mile is asked about too',
  standoutEffort([...REAL, e('2026-07-04', 3.13, '4:50')], [])?.effort.date === '2026-07-04');
check('and contradicted() still names it, for anything that wants the signal',
  contradicted([...REAL, e('2026-07-04', 3.13, '4:50')]).length === 1);
/* One that is merely better than it should be, and still possible, IS asked. */
const borderline = standoutEffort([...REAL, e('2026-07-04', 3.13, '5:20')], []);
check('but a long run that is merely too good is asked about',
  borderline?.effort.date === '2026-07-04', borderline?.effort.date || 'none');

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
