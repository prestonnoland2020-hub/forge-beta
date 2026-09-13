/* ONE BAD ROW USED TO BE THE WHOLE PLAN.

   Every number in Forge came off the single best continuous effort in the last
   six months, converted at a fixed 1.06. Preston's log held a 5.47-mile run at
   5:29/mi that never happened; off that one line Forge told him his 5K was
   already inside his goal and paced his entire block from it.

   This pins the four things that had to change together, because they are the
   same change: the curve is fitted from the athlete's best few efforts rather
   than one, at their own fade rate rather than the population's, with a range
   rather than a bare figure, and carried to race day rather than left standing
   for today. */
import { fitnessCurve, predictFromCurve, leaveOneOutGap, OUTLIER_GAP,
  EXPONENT_MIN, EXPONENT_MAX, MIN_LOG_TO_SET_ASIDE } from './src/lib/fitnessCurve.ts';
import { standoutEffort, ASK_GAP, effortKey, CONFIRMED_PREFIX } from './src/lib/effortAudit.ts';
import { raceDayOutlook, TAPER_GAIN } from './src/lib/raceDay.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const TODAY = '2026-09-13';
const ago = n => { const d = new Date(`${TODAY}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const e = (days, miles, mmss) => { const [m, s] = mmss.split(':').map(Number); return { date: ago(days), miles, seconds: Math.round((m * 60 + s) * miles) }; };
const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const at = (curve, miles) => predictFromCurve(curve, miles);

/* A real log: a mile time trial, a two-mile, a 5K, a 10K, and easy running. */
const LOG = [
  e(7, 1, '5:19'), e(45, 1, '5:28'), e(20, 2, '5:50'), e(35, 3.11, '6:00'), e(60, 6.2, '6:27'),
  e(4, 5, '8:10'), e(11, 4, '8:20'), e(18, 6, '8:35'),
];

console.log('\nThe curve is fitted from the athlete, not from a constant');
const curve = fitnessCurve(LOG, TODAY);
check('it uses more than one effort', curve.sources.length === 3, `${curve.sources.length} sources`);
check('and names them', curve.sources.every(s => s.miles && s.seconds));
check('the fade rate is the athlete\'s own', curve.fitted, `${curve.exponent.toFixed(3)}`);
check('and stays inside what a human actually does',
  curve.exponent >= EXPONENT_MIN && curve.exponent <= EXPONENT_MAX, String(curve.exponent));

console.log('\nEasy running is not evidence about how fast anyone races');
/* Same athlete, same hard efforts, with twenty more easy miles on the log. */
const WITH_JOGS = [...LOG, ...Array.from({ length: 12 }, (_, i) => e(2 + i * 2, 4, '9:10'))];
const jogged = fitnessCurve(WITH_JOGS, TODAY);
check('twelve easy four-milers do not move the curve',
  Math.abs(at(jogged, 3.107).seconds - at(curve, 3.107).seconds) <= 2,
  `${clock(at(jogged, 3.107).seconds)} vs ${clock(at(curve, 3.107).seconds)}`);
check('and do not move the fade rate either', Math.abs(jogged.exponent - curve.exponent) < 0.01);

console.log('\nA record that cannot be true is set aside until it is answered');
const FAKE_LONG = e(25, 5.47, '5:29');
const withFake = [...LOG, FAKE_LONG];
const fakeCurve = fitnessCurve(withFake, TODAY);
check('the prediction barely moves',
  Math.abs(at(fakeCurve, 3.107).seconds - at(curve, 3.107).seconds) <= 5,
  `${clock(at(fakeCurve, 3.107).seconds)} vs ${clock(at(curve, 3.107).seconds)}`);
check('and Forge asks about that exact row',
  standoutEffort(withFake, [], TODAY)?.effort.date === FAKE_LONG.date,
  standoutEffort(withFake, [], TODAY)?.effort.date || 'no question');
const confirmedCurve = fitnessCurve(withFake, TODAY, new Set([effortKey(FAKE_LONG)]));
check('answering "yes, that was real" puts it back in full',
  at(confirmedCurve, 3.107).seconds < at(curve, 3.107).seconds - 30,
  `${clock(at(confirmedCurve, 3.107).seconds)} vs ${clock(at(curve, 3.107).seconds)}`);
check('and it is never asked about twice',
  standoutEffort(withFake, [`${CONFIRMED_PREFIX}${effortKey(FAKE_LONG)}`], TODAY)?.effort.date !== FAKE_LONG.date);

console.log('\nA fake fast MILE is the case the old rule could not see');
/* Nothing is shorter than a mile, so "a long run beating a short one" never
   fires. The curve gap does, because it does not care about shape. */
const FAKE_MILE = e(12, 1, '4:20');
check('it stands clear of the athlete\'s own curve',
  leaveOneOutGap([...LOG, FAKE_MILE], FAKE_MILE, TODAY) > ASK_GAP,
  `${(leaveOneOutGap([...LOG, FAKE_MILE], FAKE_MILE, TODAY) * 100).toFixed(1)}%`);
check('so Forge asks about it',
  standoutEffort([...LOG, FAKE_MILE], [], TODAY)?.effort.date === FAKE_MILE.date);

console.log('\nAnd a genuine personal best is left alone');
check('a 5:19 after a 5:28 is not a question',
  leaveOneOutGap(LOG, LOG[0], TODAY) < ASK_GAP,
  `${(leaveOneOutGap(LOG, LOG[0], TODAY) * 100).toFixed(1)}% clear`);
check('nothing in a clean log is queried at all',
  standoutEffort(LOG, [], TODAY) === null, standoutEffort(LOG, [], TODAY)?.effort.date || '');
/* THE FALSE POSITIVE THAT KILLED THE FIRST VERSION OF THIS. An athlete who
   runs one hard mile and jogs the rest is 17% clear of his own second-best
   effort every time, because his second-best effort is a jog. */
const ONE_HARD_MILE = [e(12, 1, '5:48'), e(9, 5.12, '7:49'), e(17, 4, '7:30'),
  ...[2, 5, 11, 16, 21, 25, 30].map(days => e(days, 2.5, '10:00'))];
const jogger = fitnessCurve(ONE_HARD_MILE, TODAY);
check('the one hard mile in a log of jogs is still the evidence',
  Math.abs(jogger.sources[0].seconds - 348) < 2, `${jogger.sources[0].miles} mi in ${clock(jogger.sources[0].seconds)}`);
check('and it is not thrown away as an outlier', at(jogger, 1).seconds < 400, clock(at(jogger, 1).seconds));
console.log(`  note  nothing is set aside below ${MIN_LOG_TO_SET_ASIDE} logged efforts, and never a short one`);

console.log('\nA warm-up mile beside a hard three is not a bad record either');
const WARMUP = [e(12, 1, '9:00'), e(12, 3, '7:00')];
const mixed = fitnessCurve(WARMUP, TODAY);
check('the tempo is the evidence, not the jog',
  Math.abs(mixed.sources[0].miles - 3) < 0.01, `${mixed.sources[0].miles} mi`);

console.log('\nThe number carries a range, and the range is honest about thin evidence');
const wide = fitnessCurve([e(7, 1, '5:19'), e(45, 1, '5:28')], TODAY);
const narrow = predictFromCurve(curve, 3.107);
const thin = predictFromCurve(wide, 3.107);
check('a well-covered distance gets a tight band',
  (narrow.high - narrow.low) / narrow.seconds < 0.06, `${clock(narrow.low)}–${clock(narrow.high)}`);
check('two efforts at one distance get a wider one',
  (thin.high - thin.low) / thin.seconds > (narrow.high - narrow.low) / narrow.seconds,
  `${clock(thin.low)}–${clock(thin.high)}`);
check('the band always contains the number',
  narrow.low <= narrow.seconds && narrow.seconds <= narrow.high);

console.log('\nPast the longest thing they have run, the curve steepens');
const half = predictFromCurve(curve, 13.109);
const marathon = predictFromCurve(curve, 26.219);
check('inside the evidence the fitted exponent is used',
  Math.abs(predictFromCurve(curve, 3.107).exponent - curve.exponent) < 1e-9);
check('a marathon off a 10K is carried at a steeper one', marathon.exponent > curve.exponent,
  `${marathon.exponent.toFixed(3)} vs ${curve.exponent.toFixed(3)}`);
check('and says so with low confidence', marathon.confidence === 'low');
check('the stretch is reported, not hidden', marathon.stretch > half.stretch && half.stretch > 0);
/* Riegel at a flat 1.06 is the number people post and never run. */
const flat = at(curve, 6.214).seconds * Math.pow(26.219 / 6.214, 1.06);
check('which is slower than a flat 1.06 would have promised', marathon.seconds > flat,
  `${clock(marathon.seconds)} vs ${clock(flat)}`);

console.log('\nAnd race day is a different question from today');
const today5k = at(curve, 3.107).seconds;
const outlook = raceDayOutlook(today5k, 12);
check('twelve weeks of training buys something', outlook.best < today5k, `${clock(outlook.best)} vs ${clock(today5k)}`);
check('but the slow end is today\'s fitness raced fresh — training can add nothing',
  Math.abs(outlook.likely - today5k * (1 - TAPER_GAIN)) < 1, clock(outlook.likely));
check('and the range is the answer, not a single number', outlook.best < outlook.likely);
const raceWeek = raceDayOutlook(today5k, 0);
check('with no weeks left there is no taper to collect', raceWeek.tapered === false);
check('and nothing left to train for it either', raceWeek.best === Math.round(today5k));

console.log('\nAn old best effort is still an effort');
/* THE BUG THIS PINS. Credibility and recency were multiplied together before
   the cut, so Preston's real log came back with NO CURVE AT ALL — a goal card
   with no prediction on it. His best effort is a 5:32 mile from four months
   ago: entirely credible, and old enough that recency had decayed its weight
   to just under the bar. Everything behind it was slower, so nothing cleared
   it. An effort earns its place by being plausible; age only decides how
   loudly it speaks once it is in. */
const OLD_BEST = [e(127, 1.02, '5:32'), e(60, 1, '6:23'), e(40, 3.01, '6:43'),
  e(20, 5.01, '7:07'), e(8, 3.5, '8:34'), e(3, 5.03, '8:46')];
const stale = fitnessCurve(OLD_BEST, TODAY);
check('a four-month-old best effort still produces a curve', stale !== null);
check('and it is the effort the curve is built on',
  stale && Math.abs(stale.sources[0].miles - 1.02) < 0.01, stale?.sources[0]?.miles);
check('with a prediction on the other side of it', stale && at(stale, 3.107).seconds > 0,
  stale ? clock(at(stale, 3.107).seconds) : '');

console.log('\nNothing to fit is answered honestly rather than invented');
check('an empty log produces no curve', fitnessCurve([], TODAY) === null);
check('and a single effort still produces one', fitnessCurve([e(7, 1, '5:19')], TODAY) !== null);
check('with the population fade rate, because one point has no slope',
  fitnessCurve([e(7, 1, '5:19')], TODAY).fitted === false);
console.log(`  note  a record is set aside by the fit only above ${OUTLIER_GAP * 100}% clear, and only when it is long`);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
