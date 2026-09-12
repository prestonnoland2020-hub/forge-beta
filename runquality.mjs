/* A WALK MUST NOT SET THE PROGRAM'S TEMPO.

   Preston logs a mile in 20:00. People do — the dog walk, a warm-up logged as
   a run, a watch that auto-laps. Forge read every one of them as running: the
   walk dragged his median easy pace down so the plan prescribed slower easy
   runs, it padded his weekly volume so the feasibility model thought he had
   more base than he does, and it sat in the pool of efforts a race prediction
   could be built from. He asked for it to be fixed rather than curated, and he
   was right: an app that needs clean data to give an honest answer has a
   calculating problem.

   One classifier, and every surface reads it. */
import { classifyEffort, anchorsPace, countsAsRunVolume, isRaceEvidence, fastestPlausibleSeconds, WALK_PACE_SECONDS } from './src/lib/runQuality.ts';
import { weeklyRunning, medianWeeklyMiles, longestContinuousRun } from './src/lib/goalTrajectory.ts';
import { predictRaceFromLegacyMethod } from './src/lib/cardioPrediction.ts';
import { bestContinuousEffort } from './src/lib/goalFeasibility.ts';
import { bestRunPaceMinutesPerMile } from './src/lib/cardioSession.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const mm = (m, s = 0) => m * 60 + s;

console.log('\n  what a logged effort is');
check('3 miles in 24:00 is running', classifyEffort(3, mm(24)) === 'run');
check('a recovery jog at 13:30 is still running', classifyEffort(3, mm(40, 30)) === 'run', classifyEffort(3, mm(40, 30)));
check('a mile in 20:00 is a walk', classifyEffort(1, mm(20)) === 'walk');
check('1.31 miles at 15:16 is a walk', classifyEffort(1.31, mm(20)) === 'walk', classifyEffort(1.31, mm(20)));
/* His Saturday: 2400 m of repeats plus a separate 1.81-mile piece, summed by
   the old code into 3.3 miles in 8:00 — the 2:25/mi that projected a 7:30 5K.
   A hard 1.81 in 8:00 is 4:25/mi, which is a real human performance and stays. */
check('3.3 miles in 8:00 — 2:25 a mile — is not a human', classifyEffort(3.3, mm(8)) === 'implausible', classifyEffort(3.3, mm(8)));
check('but a hard 1.81 in 8:00 is left alone', classifyEffort(1.81, mm(8)) === 'run', classifyEffort(1.81, mm(8)));
check('a distance with no time is unmeasured', classifyEffort(3, 0) === 'unmeasured');
check('and a time with no distance is too', classifyEffort(0, mm(30)) === 'unmeasured');

console.log('\n  the fast end is a curve, because a 400 is not a mile');
check('a 400 m in 60s is allowed', classifyEffort(0.2486, 60) === 'run', classifyEffort(0.2486, 60));
check('a real 3:55 mile is allowed', classifyEffort(1, mm(3, 55)) === 'run', classifyEffort(1, mm(3, 55)));
check('the gate sits faster than any human mile', fastestPlausibleSeconds(1) < mm(3, 43), String(Math.round(fastestPlausibleSeconds(1))));
check('and scales up with distance', fastestPlausibleSeconds(3.1) > fastestPlausibleSeconds(1) * 3);

console.log('\n  each consumer takes only what it is entitled to');
check('a walk anchors no pace', !anchorsPace(1, mm(20)));
check('a walk is not running volume', !countsAsRunVolume(1, mm(20)));
check('a walk is not race evidence', !isRaceEvidence(1, mm(20)));
check('an untimed 5 miles still counts as volume', countsAsRunVolume(5, 0));
check('but anchors no pace', !anchorsPace(5, 0));
check('and is not race evidence', !isRaceEvidence(5, 0));
check('a 200 m sprint is running but too short to anchor an easy pace', classifyEffort(0.124, 30) === 'run' && !anchorsPace(0.124, 30));

/* His actual log, walks and all. */
const run = (ago, miles, minutes, activity = 'Run') => ({ id: `r${ago}-${miles}`, date: day(ago), title: activity, muscles: ['Cardio'], hasCardio: true, topSets: [],
  cardioSessions: [{ id: `c${ago}-${miles}`, activity, structure: 'steady', summary: `${activity} · ${miles} mi`,
    prescription: { legacyIntervals: [{ distance: miles, unit: 'miles', time: minutes, cardioType: activity }] } }] });
const REAL = [
  run(1, 3, 24), run(3, 5.1, 40), run(5, 2.5, 25), run(8, 4, 30), run(10, 2.5, 25),
  run(12, 1, 5.8), run(15, 5.5, 46), run(17, 2.5, 25), run(19, 3, 28), run(22, 2.5, 25),
];
/* The three that were distorting everything. */
const WALKS = [run(2, 1, 20), run(6, 1, 20), run(9, 1.31, 20)];

console.log('\n  his weekly volume, with the walks in the log');
const clean = medianWeeklyMiles(REAL);
const withWalks = medianWeeklyMiles([...REAL, ...WALKS]);
check('the walks do not pad it', withWalks === clean, `${clean} clean vs ${withWalks} with walks`);
check('and it is a real number', clean > 5, String(clean));
/* AND AN ATHLETE THREE WEEKS IN IS NOT AN ATHLETE RUNNING ZERO. Five empty
   buckets before their first run used to drag the median to nothing, so the
   floor that stops the plan prescribing under them did nothing for exactly the
   people who had just started. */
const newcomer = [run(9, 4, 32), run(11, 3, 25), run(13, 4, 34), run(16, 4, 32), run(18, 3, 25)];
check('two weeks of running reads as running, not as six weeks of zero',
  medianWeeklyMiles(newcomer) > 3, String(medianWeeklyMiles(newcomer)));
/* An off week INSIDE their training is part of what they actually do and pulls
   the median down. Only the weeks before they ever ran are dropped. */
const tookAWeekOff = [run(9, 6, 50), run(11, 5, 42), run(30, 6, 50), run(32, 5, 42)];
check('and an off week inside training still counts',
  medianWeeklyMiles(tookAWeekOff) < 11, String(medianWeeklyMiles(tookAWeekOff)));
check('an empty log is still zero', medianWeeklyMiles([]) === 0);
check('a log of nothing but walks is zero too', medianWeeklyMiles(WALKS) === 0, String(medianWeeklyMiles(WALKS)));

console.log('\n  his longest run');
check('5.5 miles, not a 6-mile walk', longestContinuousRun([...REAL, ...WALKS, run(4, 6, 100)]) === 5.5,
  String(longestContinuousRun([...REAL, ...WALKS, run(4, 6, 100)])));

console.log('\n  his easy pace is anchored to running');
check('a 20:00 mile is not his best run pace',
  bestRunPaceMinutesPerMile(WALKS[0].cardioSessions[0]) === 0, String(bestRunPaceMinutesPerMile(WALKS[0].cardioSessions[0])));
check('his 5.8-minute mile is', Math.round(bestRunPaceMinutesPerMile(REAL[5].cardioSessions[0]) * 10) / 10 === 5.8,
  String(bestRunPaceMinutesPerMile(REAL[5].cardioSessions[0])));

console.log('\n  and a race prediction is built from running only');
const predicted = predictRaceFromLegacyMethod([...REAL, ...WALKS], 3.10686);
check('a 5K is predicted at all', Boolean(predicted), JSON.stringify(predicted && predicted.seconds));
check('and it is not a walking time', predicted ? predicted.seconds < 30 * 60 : false,
  predicted ? `${Math.floor(predicted.seconds / 60)}:${String(predicted.seconds % 60).padStart(2, '0')}` : 'none');
const walkOnly = predictRaceFromLegacyMethod(WALKS, 1);
check('a log of nothing but walks predicts nothing', walkOnly === null, JSON.stringify(walkOnly));

console.log('\n  the feasibility model’s best effort is a real one');
const best = bestContinuousEffort([...REAL, ...WALKS]);
check('the 5:48 mile, not the 20:00 one', Math.round(best.seconds) === 348, `${best.miles} mi in ${best.seconds}s`);

console.log('\n  and nothing else was thrown out with them');
check('every real run survived', weeklyRunning(REAL, 8).reduce((sum, w) => sum + w.miles, 0) > 25,
  String(weeklyRunning(REAL, 8).reduce((sum, w) => sum + w.miles, 0)));
check(`the walk line sits at ${Math.floor(WALK_PACE_SECONDS / 60)}:00 a mile`, WALK_PACE_SECONDS === 840);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
