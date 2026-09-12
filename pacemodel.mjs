/* FITNESS IS SOMETHING YOU DEMONSTRATE, NOT SOMETHING YOU TYPE IN.

   Forge had three unrelated ideas of how fast to run. Easy pace was the median
   of everything logged, threshold was computed from the GOAL, rep pace was the
   goal itself. One athlete could be handed an easy pace built from what they
   do, a tempo built from what they want, and intervals built from a race they
   have never run — three different athletes' training on one card.

   This pins the replacement: one performance, one hierarchy, every pace. */
import { paceModel, easyBand, easyTooFast, volumeShortfall, hardestEffort,
  EASY_MULTIPLE_FAST, RECENT_EVIDENCE_DAYS } from './src/lib/paceModel.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const TODAY = '2026-09-12';
const back = days => { const d = new Date(`${TODAY}T12:00:00`); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
const run = (daysAgo, miles, seconds) => ({ date: back(daysAgo),
  cardioSessions: [{ id: `c${daysAgo}`, activity: 'Run', structure: 'steady',
    prescription: { distanceUnit: 'miles', legacyIntervals: [{ cardioType: 'Run', unit: 'miles', distance: miles, time: seconds / 60 }] } }] });
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

console.log('\nThe hierarchy: a recent performance outranks an old one, and both outrank the goal');
/* Preston's own case — a 5:48 mile logged in August, against a sub-19 5K goal
   he has not run. The goal is an aspiration; the mile is a fact. */
const goal = { paceSecondsPerMile: 1139 / 3.107, miles: 3.107 };
const withRecent = paceModel([run(13, 1, 348), run(200, 1, 320)], goal, TODAY, 28);
check('a recent run is the anchor', withRecent.source === 'recent-run', withRecent.source);
check('and it is the one that is used, not the faster stale one',
  withRecent.from.seconds === 348, `${withRecent.from.seconds}s`);
check('it is marked as supported by evidence', withRecent.supported === true);

const onlyOld = paceModel([run(RECENT_EVIDENCE_DAYS + 30, 1, 320)], goal, TODAY, 28);
check('nothing recent falls back to the older run', onlyOld.source === 'older-run', onlyOld.source);
check('which is still real evidence', onlyOld.supported === true);

const fromGoal = paceModel([], goal, TODAY, 28);
check('nothing logged at all falls back to the goal', fromGoal.source === 'goal', fromGoal.source);
check('and says plainly that nothing supports it', fromGoal.supported === false);
check('no evidence and no goal produces nothing at all',
  paceModel([], null, TODAY).source === 'none');

console.log('\nEvery pace comes from that one performance, in the right order');
const p = withRecent;
check('easy is slower than threshold', p.easyFast > p.threshold, `${clock(p.easyFast)} vs ${clock(p.threshold)}`);
check('marathon is slower than threshold', p.marathon > p.threshold, `${clock(p.marathon)} vs ${clock(p.threshold)}`);
check('threshold is slower than interval', p.threshold > p.interval, `${clock(p.threshold)} vs ${clock(p.interval)}`);
check('interval is slower than repetition', p.interval > p.repetition, `${clock(p.interval)} vs ${clock(p.repetition)}`);
check('the whole ladder is ordered', p.easySlow > p.easyFast && p.easyFast > p.marathon,
  `${clock(p.easySlow)} → ${clock(p.easyFast)} → ${clock(p.marathon)} → ${clock(p.threshold)} → ${clock(p.interval)} → ${clock(p.repetition)}`);

console.log('\nA short effort cannot be carried up in distance for free');
/* A 5:48 mile read straight across is a 7:03/mi marathon. Off eight miles a
   week that is a fantasy, and prescribing from it is how people get hurt. */
const trained = paceModel([run(13, 1, 348)], goal, TODAY, 30);
const untrained = paceModel([run(13, 1, 348)], goal, TODAY, 5);
check('the same mile predicts a slower marathon off low volume',
  untrained.marathon > trained.marathon, `${clock(untrained.marathon)} vs ${clock(trained.marathon)}`);
check('the correction is bigger the further up you go',
  untrained.marathon - trained.marathon > untrained.threshold - trained.threshold,
  `marathon +${Math.round(untrained.marathon - trained.marathon)}s vs threshold +${Math.round(untrained.threshold - trained.threshold)}s`);
check('and it barely touches the distance actually run',
  Math.abs(untrained.repetition - trained.repetition) < 12,
  `${clock(untrained.repetition)} vs ${clock(trained.repetition)}`);
check('training enough for the pace removes the correction entirely',
  volumeShortfall(50, 348) === 0, `${volumeShortfall(50, 348)}`);
check('running nothing is a full shortfall', volumeShortfall(0, 348) === 1);

console.log('\nWhat is not evidence stays out');
check('a walk is not a performance', hardestEffort([run(5, 1, 1200)]) === null);
check('an interval session is not one continuous effort',
  hardestEffort([{ date: back(5), cardioSessions: [{ activity: 'Run', structure: 'intervals',
    prescription: { distanceUnit: 'miles', legacyIntervals: [
      { cardioType: 'Run', unit: 'miles', distance: 0.25, time: 1.3 },
      { cardioType: 'Run', unit: 'miles', distance: 0.25, time: 1.3 }] } }] }]) === null);
check('a 200 m dash predicts nothing', hardestEffort([run(5, 0.125, 20)]) === null);
check('a real run does', hardestEffort([run(5, 3, 1300)])?.miles === 3);

console.log('\nEasy running: the athlete\'s own is evidence too');
const band = easyBand(p, p.easySlow + 60);
check('a band that already holds what they do is widened, not corrected',
  band.slow > p.easySlow, `${clock(band.slow)}`);
check('the fast end is still the physiological one', band.fast === p.easyFast);
check('running easy days too hard is the one thing worth naming',
  easyTooFast(p, p.threshold), `${clock(p.threshold)} is inside ${clock(p.easyFast)}`);
check('and running them properly easy is not', !easyTooFast(p, p.easySlow + 30));
check('with no model there is nothing to say', !easyTooFast({ threshold: 0 }, 400));
check('the fast end is a real multiple of threshold',
  Math.abs(p.easyFast - p.threshold * EASY_MULTIPLE_FAST) < 0.001);

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
