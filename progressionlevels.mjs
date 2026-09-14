/* THE PLAN HAD NO MEMORY.

   Forge could read a hard session and say how it went — on / faster / slower /
   faded / short — and that verdict went to a display line and a nudge. Nothing
   fed it back into what got prescribed next. So the threshold session opened
   at twelve minutes in week one for a 5:19 miler and a twelve-minute miler
   alike, grew a minute and a half a week whether or not any of it had gone in,
   and the only way it ever changed was regenerating the whole block.

   This pins the model that replaces it: a level per kind of session, moved by
   execution, where the level IS the dose. */
import { progressionLevels, seedLevels, applyVerdicts, levelNote,
  zoneOfPrescription, thresholdWorkMinutes, intervalWorkMetres, repetitionWorkMetres,
  LEVEL_STEP, WEEKLY_CAP, LEVEL_MIN, LEVEL_MAX, UNPROVEN_CEILING,
  INTERVAL_REPS, REPETITION_REPS } from './src/lib/progressionLevels.ts';
import { qualitySession, QUALITY_MAX_SHARE, WARMUP_COOLDOWN_MILES } from './src/lib/qualitySession.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};

/* Preston: ~18 miles a week, threshold 6:52/mi off his 5:19 mile. */
const HIS_WEEK = { weeklyMiles: 18, qualityShare: QUALITY_MAX_SHARE, warmupMiles: WARMUP_COOLDOWN_MILES,
  thresholdPaceSecondsPerMile: 412, provenQuality: true };
const session = (date, outcome, text) => ({ date, outcome, text });
const THRESHOLD = '18 min continuous @ 6:52/mi · threshold';
const INTERVALS = '5 × 1200 m @ 5:08/rep';

console.log('\nThe ladder is the model — no separate difficulty rating');
check('a level is a dose of threshold work', thresholdWorkMinutes(1) === 10 && thresholdWorkMinutes(10) === 42,
  `${thresholdWorkMinutes(1)}–${thresholdWorkMinutes(10)} min`);
check('and it climbs the whole way', THRESHOLD_RISES());
function THRESHOLD_RISES() {
  for (let level = 2; level <= LEVEL_MAX; level += 1) if (thresholdWorkMinutes(level) <= thresholdWorkMinutes(level - 1)) return false;
  return true;
}
check('interval work is metres of fast running, not a rep count',
  intervalWorkMetres(1) === 1600 && intervalWorkMetres(10) === 5200,
  `${intervalWorkMetres(1)}–${intervalWorkMetres(10)} m`);
/* A DOSE IS NOT A REP COUNT. Divide a total by a short rep and you get a
   number nobody writes on a card: the first cut of this handed a miler
   16 × 300 m, which is a track session from a different sport. */
check('and it is broken into a number of repeats somebody would actually write',
  INTERVAL_REPS.max <= 10 && REPETITION_REPS.max <= 10,
  `${INTERVAL_REPS.max} / ${REPETITION_REPS.max}`);
check('repetition work is its own, smaller ladder',
  repetitionWorkMetres(10) < intervalWorkMetres(10), `${repetitionWorkMetres(10)} vs ${intervalWorkMetres(10)}`);
check('off the end of the ladder it holds rather than throwing',
  thresholdWorkMinutes(0) === thresholdWorkMinutes(LEVEL_MIN) && thresholdWorkMinutes(99) === thresholdWorkMinutes(LEVEL_MAX));

console.log('\nWhere somebody starts is what their week can carry');
/* EVERY ZONE OPENS AT THE SAME LEVEL, off the time the week can afford.
   Seeding each ladder in its own units looked more precise and was worse: a
   three-and-a-half-mile budget is five and a half thousand metres, which is
   the top of the VO2 ladder, for an athlete who has never done any. */
const seeded = seedLevels(HIS_WEEK);
check('eighteen miles a week opens at a real threshold session, not twelve minutes',
  thresholdWorkMinutes(seeded.threshold) >= 18, `level ${seeded.threshold} = ${thresholdWorkMinutes(seeded.threshold)} min`);
const tiny = seedLevels({ ...HIS_WEEK, weeklyMiles: 8 });
check('and eight miles a week opens lower', tiny.threshold < seeded.threshold,
  `${tiny.threshold} vs ${seeded.threshold}`);
check('a bigger week opens higher still',
  seedLevels({ ...HIS_WEEK, weeklyMiles: 45 }).threshold > seeded.threshold);
check('and every ladder opens together, then diverges on execution',
  seeded.interval === seeded.threshold && seeded.repetition === seeded.threshold,
  JSON.stringify(seeded));
/* A first block earns its way up: an athlete with no quality in their log has
   shown nothing about how much of it they absorb. */
const unproven = seedLevels({ ...HIS_WEEK, weeklyMiles: 45, provenQuality: false });
check('nobody with no hard running on file starts at the top',
  unproven.threshold <= UNPROVEN_CEILING, `level ${unproven.threshold}`);

console.log('\nExecution moves it, and that is the whole point');
const faster = applyVerdicts(seeded, [session('2026-09-07', 'faster', THRESHOLD)]);
check('coming in ahead of the pace raises the level', faster.levels.threshold > seeded.threshold,
  `${seeded.threshold} → ${faster.levels.threshold}`);
check('so the next session is longer',
  thresholdWorkMinutes(faster.levels.threshold) > thresholdWorkMinutes(seeded.threshold));
const faded = applyVerdicts(seeded, [session('2026-09-07', 'faded', THRESHOLD)]);
check('fading in the last repeats lowers it', faded.levels.threshold < seeded.threshold,
  `${seeded.threshold} → ${faded.levels.threshold}`);
check('and fading costs more than simply being slow — the dose is what this controls',
  LEVEL_STEP.faded < LEVEL_STEP.slower, `${LEVEL_STEP.faded} vs ${LEVEL_STEP.slower}`);
check('a session logged without times moves nothing, because there is nothing in it to read',
  applyVerdicts(seeded, [session('2026-09-07', 'unmeasured', THRESHOLD)]).levels.threshold === seeded.threshold);

console.log('\nOne zone at a time — a threshold session says nothing about VO2');
const crossed = applyVerdicts(seeded, [session('2026-09-07', 'faster', THRESHOLD)]);
check('the threshold level moved', crossed.levels.threshold > seeded.threshold);
check('and the interval level did not', crossed.levels.interval === seeded.interval);
check('the card is what decides which ladder a session was on',
  zoneOfPrescription(THRESHOLD) === 'threshold' && zoneOfPrescription(INTERVALS) === 'interval',
  `${zoneOfPrescription(THRESHOLD)} / ${zoneOfPrescription(INTERVALS)}`);
check('a race is a date in the calendar, not a dose on a ladder',
  zoneOfPrescription('Goal effort assessment over 1 mi') === undefined);

console.log('\nNo zone moves more than a level a week');
/* Two good sessions in one week are a good week, not a new athlete — and a
   plan that leaps two levels off them is the ramp-rate mistake every injured
   runner has made. */
const twoInAWeek = applyVerdicts(seeded, [
  session('2026-09-07', 'faster', THRESHOLD),
  session('2026-09-10', 'faster', THRESHOLD),
]);
check('two faster sessions in one week move it by one level',
  twoInAWeek.levels.threshold - seeded.threshold === WEEKLY_CAP,
  `${seeded.threshold} → ${twoInAWeek.levels.threshold}`);
const twoWeeks = applyVerdicts(seeded, [
  session('2026-09-07', 'faster', THRESHOLD),
  session('2026-09-14', 'faster', THRESHOLD),
]);
check('across two weeks it moves twice', twoWeeks.levels.threshold > twoInAWeek.levels.threshold,
  `${twoInAWeek.levels.threshold} vs ${twoWeeks.levels.threshold}`);

console.log('\nAnd it is replayed in order, oldest first');
/* A level is the athlete's history in order; applying it backwards would let
   last month decide what this week is worth. */
const climbThenFall = applyVerdicts(seeded, [
  session('2026-08-10', 'faster', THRESHOLD),
  session('2026-08-17', 'faster', THRESHOLD),
  session('2026-09-07', 'faded', THRESHOLD),
]);
const shuffled = applyVerdicts(seeded, [
  session('2026-09-07', 'faded', THRESHOLD),
  session('2026-08-17', 'faster', THRESHOLD),
  session('2026-08-10', 'faster', THRESHOLD),
]);
check('the order the sessions arrive in does not change the answer',
  climbThenFall.levels.threshold === shuffled.levels.threshold,
  `${climbThenFall.levels.threshold} vs ${shuffled.levels.threshold}`);
check('and the last move is the one the card explains',
  /came apart/.test(levelNote('threshold', climbThenFall.levels, climbThenFall.moves)),
  levelNote('threshold', climbThenFall.levels, climbThenFall.moves));
check('with nothing to explain yet, it says where the number came from',
  /what your week can carry/.test(levelNote('threshold', seeded, [])),
  levelNote('threshold', seeded, []));

console.log('\nIt never runs off either end');
const battered = applyVerdicts(seeded, Array.from({ length: 30 }, (_, index) =>
  session(`2026-0${1 + Math.floor(index / 4)}-0${1 + (index % 4) * 7}`.slice(0, 10), 'faded', THRESHOLD)));
check('a run of bad sessions bottoms out at the lowest rung',
  battered.levels.threshold >= LEVEL_MIN, String(battered.levels.threshold));
const flying = applyVerdicts({ ...seeded, threshold: LEVEL_MAX }, [session('2026-09-07', 'faster', THRESHOLD)]);
check('and a good one at the top stays at the top', flying.levels.threshold === LEVEL_MAX);

console.log('\nThe session that comes out is the size the level says');
const context = { phase: 'Build', weekIndex: 0, goalPaceSecondsPerMile: 299, weeklyMiles: 18,
  goalMiles: 1, paces: { threshold: 412, interval: 343, repetition: 309, easyFast: 511, easySlow: 577 } };
const atFour = qualitySession({ ...context, levels: { ...seeded, threshold: 4, interval: 4, repetition: 4, racepace: 4 } });
const atSeven = qualitySession({ ...context, levels: { ...seeded, threshold: 7, interval: 7, repetition: 7, racepace: 7 } });
check('a higher level is a bigger session', atSeven.miles > atFour.miles, `${atFour.miles} vs ${atSeven.miles} mi`);
check('and both are still inside the week',
  atSeven.miles <= 18 * QUALITY_MAX_SHARE + WARMUP_COOLDOWN_MILES + 0.1, `${atSeven.miles} mi`);
/* A block generated before any of this existed has no levels on it, and must
   still produce a session rather than a blank. */
const withoutLevels = qualitySession(context);
check('no levels at all falls back to the old ramp rather than breaking',
  withoutLevels.miles > 0 && Boolean(withoutLevels.text), JSON.stringify(withoutLevels.text));

console.log('\nAnd the whole model reads in one call');
const full = progressionLevels(HIS_WEEK, [session('2026-09-07', 'faster', THRESHOLD)]);
check('it says where he started', full.start.threshold === seeded.threshold);
check('where he is now', full.levels.threshold > full.start.threshold);
check('and what moved him', full.moves.length === 1 && full.moves[0].outcome === 'faster');

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
