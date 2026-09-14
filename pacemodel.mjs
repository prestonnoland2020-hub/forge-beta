/* FITNESS IS SOMETHING YOU DEMONSTRATE, NOT SOMETHING YOU TYPE IN.

   Forge had three unrelated ideas of how fast to run. Easy pace was the median
   of everything logged, threshold was computed from the GOAL, rep pace was the
   goal itself. One athlete could be handed an easy pace built from what they
   do, a tempo built from what they want, and intervals built from a race they
   have never run — three different athletes' training on one card.

   This pins the replacement: one performance, one hierarchy, every pace. */
import { paceModel, easyBand, easyTooFast, loggedEasyPace, volumeShortfall, hardestEffort, continuousEfforts,
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



console.log('\nA time trial is logged as three lines, and it still counts');
/* THE BUG THIS PINS. A time trial is a warm-up, the effort, and a cool-down —
   three lines — and this file threw away any session with more than one line
   on the grounds that six times four hundred is not one effort. True, and it
   took the time trials with it. Preston ran a 5:19 mile on 29 July and logged
   it exactly that way; every training pace in his plan came off the 5:48 he
   ran in August instead, and his threshold came out at 7:54/mi — a minute and
   a half slower than his real threshold, which the plan then called a hard
   run. The goal card could see the 5:19 the whole time, because the race
   predictor takes a session apart and this did not. */
const line = (distance, time, cardioType = 'Run', unit = 'miles') => ({ cardioType, unit, distance, time });
const session = (id, activity, legacy) => ({ id, activity, structure: 'intervals', summary: '',
  prescription: { legacyIntervals: legacy, distanceUnit: 'miles' } });
const timeTrial = [{ date: back(20), cardioSessions: [session('tt', 'Easy + Speed Run',
  [line(1, 10, 'Easy'), line(1, 5.32, 'Speed Run'), line(1, 10, 'Easy')])] }];
const seen = continuousEfforts(timeTrial).map(e => `${e.miles}mi ${clock(e.seconds)}`);
check('the mile inside the session is the effort', seen.includes('1mi 5:19'), JSON.stringify(seen));
check('and the easy miles either side are not thrown away with it', seen.length === 3, JSON.stringify(seen));
check('the hardest effort is the mile, not the average of the session',
  Math.round(hardestEffort(timeTrial).seconds) === 319, String(hardestEffort(timeTrial)?.seconds));
/* And the reason the rule existed still holds: a set of four-hundreds is not a
   mile, and each piece is judged on its own rather than the session being
   judged as a whole. */
const repeats = [{ date: back(10), cardioSessions: [session('reps', 'Base + Speed Run',
  [line(1, 10, 'Base'), ...Array.from({ length: 8 }, () => line(0.2, 1, 'Speed Run')), line(1, 10, 'Base')])] }];
const repSeen = continuousEfforts(repeats);
check('eight two-hundreds at 5:00 pace are not a 5:00 effort',
  !repSeen.some(e => e.miles < 0.75), JSON.stringify(repSeen.map(e => e.miles)));
check('and six four-hundreds are not a mile either',
  continuousEfforts([{ date: back(8), cardioSessions: [session('q', 'Run',
    Array.from({ length: 6 }, () => line(400, 1.333, 'Run', 'meters')))] }]).length === 0);
check('a 5:19 mile sets the threshold pace, not the 5:48 three weeks later',
  paceModel([...timeTrial, run(5, 1, 348)], goal, TODAY, 18).threshold
    < paceModel([run(5, 1, 348)], goal, TODAY, 18).threshold,
  `${clock(paceModel([...timeTrial, run(5, 1, 348)], goal, TODAY, 18).threshold)} vs ${clock(paceModel([run(5, 1, 348)], goal, TODAY, 18).threshold)}`);

console.log('\nAnd what their easy running actually is, so the band can be checked');
/* THE WARNING THAT WAS COMPUTED AND SHOWN NOWHERE. Running easy days at tempo
   pace is the most common error in self-coached training, and it is the one a
   plan cannot fix by prescribing anything — the session already says "easy".
   easyTooFast could detect it for months and said it on no screen; the plan
   tab names it now, which needs a number for what the athlete is doing. */
const easyRun = (daysAgo, miles, secondsPerMile) => run(daysAgo, miles, miles * secondsPerMile);
const model = paceModel([run(13, 1, 348)], goal, TODAY, 28);
const slowLog = [easyRun(2, 5, model.easySlow + 20), easyRun(5, 4, model.easySlow + 40), easyRun(9, 6, model.easySlow + 10)];
const fastLog = [easyRun(2, 5, model.easyFast - 30), easyRun(5, 4, model.easyFast - 20), easyRun(9, 6, model.easyFast - 40)];
check('easy running is read from the days run slower than threshold',
  loggedEasyPace(slowLog, model, TODAY) > model.easySlow, clock(loggedEasyPace(slowLog, model, TODAY)));
check('and someone running them properly easy is told nothing',
  !easyTooFast(model, loggedEasyPace(slowLog, model, TODAY)));
check('someone running every easy day at tempo is told once',
  easyTooFast(model, loggedEasyPace(fastLog, model, TODAY)), clock(loggedEasyPace(fastLog, model, TODAY)));
check('one hard finish does not move it — the median is taken, not the mean',
  Math.abs(loggedEasyPace([...slowLog, easyRun(3, 3, model.easyFast - 90)], model, TODAY)
    - loggedEasyPace(slowLog, model, TODAY)) < 25);
check('with nothing logged there is nothing to say', loggedEasyPace([], model, TODAY) === 0);
check('and with no model at all, nothing either', loggedEasyPace(slowLog, { threshold: 0 }, TODAY) === 0);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
