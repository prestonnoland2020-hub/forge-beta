import { daysSinceHyrox, hyroxSession, hyroxTargets, hyroxPlanDetail, hyroxTrainingPaces, withHyroxPaces, GOAL_OFFSET, hyroxShape, hyroxSessionsDone, stationsHalf, simulationFull, formatRunPace, kmSplit, divisionKey, HYROX_STATIONS, RUN_OFFSET, EASED_OFFSET } from './src/lib/hyroxSession.ts';
import { buildDailyRecommendation, recommendationFingerprint } from './src/lib/dailyRecommendationEngine.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const T = 412; // 6:52/mi threshold

console.log('\nRotation');
check('sessions 0..5 rotate stations, compromised, stations, compromised, stations, simulation',
  [0, 1, 2, 3, 4, 5].map(i => hyroxShape(i)).join(',') === 'stations,compromised,stations,compromised,stations,simulation',
  [0, 1, 2, 3, 4, 5].map(i => hyroxShape(i)).join(','));
check('session 6 starts the cycle again', hyroxShape(6) === 'stations');
check('race week overrides the rotation', hyroxShape(5, 1) === 'race-week' && hyroxShape(0, 0.5) === 'race-week');
check('two weeks out is not race week', hyroxShape(0, 2) === 'stations');
check('stations days alternate halves', stationsHalf(0) === 'front' && stationsHalf(2) === 'back' && stationsHalf(4) === 'front' && stationsHalf(6) === 'back');
check('first simulation is half, second is full', !simulationFull(5) && simulationFull(11) && !simulationFull(17));
check('negative index does not break the rotation', hyroxShape(-1) === 'simulation');

console.log('\nPaces');
check('threshold 6:52 → stations runs at 7:27/mi', hyroxSession({ sessionIndex: 0, thresholdSecondsPerMile: T }).runPace === '7:27/mi');
check('compromised runs at 7:07/mi', hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T }).runPace === '7:07/mi');
check('simulation runs at 7:17/mi', hyroxSession({ sessionIndex: 5, thresholdSecondsPerMile: T }).runPace === '7:17/mi');
check('metric pace is per km', hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T, metric: true }).runPace === '4:25/km');
check('km split matches the pace', kmSplit(T + RUN_OFFSET.compromised) === '4:25');
check('no threshold → controlled effort, and the rationale says a run is needed', (() => {
  const s = hyroxSession({ sessionIndex: 0, thresholdSecondsPerMile: 0 });
  return s.runPace === 'controlled effort' && /no run pace until a run/.test(s.rationale);
})());
check('low readiness eases the pace by 20 s/mi and says so', (() => {
  const s = hyroxSession({ sessionIndex: 0, thresholdSecondsPerMile: T, readiness: 50 });
  return s.runPace === formatRunPace(T + RUN_OFFSET.stations + EASED_OFFSET) && /eased by 20/.test(s.rationale);
})());
check('readiness at the floor is not eased', hyroxSession({ sessionIndex: 0, thresholdSecondsPerMile: T, readiness: 58 }).runPace === '7:27/mi');

console.log('\nStations day');
const stations = hyroxSession({ sessionIndex: 0, thresholdSecondsPerMile: T, division: "Men's Open" });
const entries = stations.plan.stationEntries;
check('four runs and four stations, alternating', entries.length === 8 && entries.every((e, i) => i % 2 === 0 ? e.name === 'Run' : e.name !== 'Run'), entries.map(e => e.name).join(','));
check('front half is SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps', entries.filter(e => e.name !== 'Run').map(e => e.name).join(',') === 'SkiErg,Sled Push,Sled Pull,Burpee Broad Jumps');
check('every run is 1000 m with the pace on it', entries.filter(e => e.name === 'Run').every(e => e.target === '1000' && e.unit === 'meters' && e.pace === '7:27/mi'));
check('stations at race distance', entries.filter(e => e.name !== 'Run').map(e => e.target).join(',') === '1000,50,50,80');
check("men's open sled push load", entries.find(e => e.name === 'Sled Push').load === '152 kg');
check('a minute of rest after each station', entries.filter(e => e.name !== 'Run').every(e => e.rest === '60'));
check('plan is a for-time circuit tagged HYROX', stations.plan.activity === 'HYROX' && stations.plan.structure === 'Circuit' && stations.plan.circuitFormat === 'For time');
check('summary names the runs, pace and stations', /4 × 1 km at 7:27\/mi · SkiErg, Sled Push, Sled Pull, Burpee Broad Jumps at race distance/.test(stations.summary), stations.summary);
check('duration is estimated', Number(stations.plan.duration) > 25 && Number(stations.plan.duration) < 60, stations.plan.duration);
check('back half on the next stations day', hyroxSession({ sessionIndex: 2, thresholdSecondsPerMile: T }).plan.stationEntries.filter(e => e.name !== 'Run').map(e => e.name).join(',') === 'Rowing,Farmers Carry,Sandbag Lunges,Wall Balls');

console.log('\nCompromised running');
const comp = hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T, division: "Women's Pro" });
const compStations = comp.plan.stationEntries.filter(e => e.name !== 'Run');
check('covers the other half of the course', compStations.map(e => e.name).join(',') === 'Rowing,Farmers Carry,Sandbag Lunges,Wall Balls');
check('stations at half distance', compStations.map(e => e.target).join(',') === '500,100,50,50', compStations.map(e => e.target).join(','));
check('no rest between pieces', comp.plan.stationEntries.every(e => e.rest === '0'));
check("women's pro farmers load", compStations.find(e => e.name === 'Farmers Carry').load === '2 × 24 kg');
check('eased compromised day cuts stations to 40%', hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T, readiness: 40 }).plan.stationEntries.filter(e => e.name !== 'Run').map(e => e.target).join(',') === '400,80,40,40');

console.log('\nSimulation and race week');
const half = hyroxSession({ sessionIndex: 5, thresholdSecondsPerMile: T });
check('half simulation is the first four stations in order', half.title === 'HYROX half simulation' && half.plan.stationEntries.filter(e => e.name !== 'Run').map(e => e.name).join(',') === HYROX_STATIONS.slice(0, 4).map(s => s.name).join(','));
const full = hyroxSession({ sessionIndex: 11, thresholdSecondsPerMile: T, division: "Women's Open" });
check('full simulation is all eight, 16 entries', full.title === 'HYROX full simulation' && full.plan.stationEntries.length === 16);
check("women's open wall balls are 75 reps at 4 kg", full.plan.stationEntries.at(-1).load === '4 kg · 9 ft' && full.plan.stationEntries.at(-1).target === '75');
check('simulation rationale says it feeds the goal', /evidence for your HYROX goal/.test(full.rationale));
const race = hyroxSession({ sessionIndex: 3, thresholdSecondsPerMile: T, weeksToRace: 0.7 });
check('race week is three runs and a third of three stations', race.shape === 'race-week' && race.runs === 3 && race.plan.stationEntries.filter(e => e.name !== 'Run').map(e => `${e.name} ${e.target}`).join(',') === 'Sled Push 20,Wall Balls 35,SkiErg 330', race.plan.stationEntries.filter(e => e.name !== 'Run').map(e => `${e.name} ${e.target}`).join(','));

console.log('\nCounting sessions done');
const records = [
  { date: '2026-09-01', title: 'Push day', cardioSessions: [] },
  { date: '2026-09-03', title: 'HYROX day', cardioSessions: [] },
  { date: '2026-09-08', title: 'Training day', cardioSessions: [{ activity: 'HYROX', summary: 'HYROX stations · front half' }] },
  { date: '2026-09-10', title: 'Training day', cardioSessions: [{ activity: 'Run', summary: 'Run · 5 mi' }] },
  { date: '2026-09-21', title: 'HYROX day', cardioSessions: [] },
];
check('counts days with HYROX in the title or a HYROX cardio entry', hyroxSessionsDone(records) === 3);
check('only counts days before the one being built', hyroxSessionsDone(records, '2026-09-21') === 2);
check('division key', divisionKey("Men's Pro") === 'mp' && divisionKey('Doubles Women') === 'wo' && divisionKey(undefined) === 'mo');

console.log('\nThrough the engine');
const splitDay = { position: 3, name: 'HYROX', type: 'hyrox', muscles: [], exercises: [], cardioTypes: ['HYROX'] };
const goals = [{ type: 'Endurance', title: 'HYROX under 75', target: '1:15:00', date: '2026-12-05', connection: '', exercise: 'HYROX', eventDivision: "Men's Open" }];
const rec = buildDailyRecommendation({ date: '2026-09-21', splitDay, exercises: [], records, goals, recovery: { confidence: 'Low', readiness: 80 }, profile: { weeklyMileage: 20, runningDays: 3 }, runningHistory: [], loadBiasPercent: 0, thresholdSecondsPerMile: T, inputFingerprint: recommendationFingerprint({ date: '2026-09-21', splitDay, exercises: [], records, goals, loadBiasPercent: 0 }) });
check('a hyrox day prescribes no top sets', rec.topSets.length === 0);
check('cardio is the HYROX session, third in the rotation (stations, back half)', rec.cardio?.title === 'HYROX stations · back half', rec.cardio?.title);
check('summary carries the goal pace — a 1:15:00 asks for 4:20/km, eased 15 s/mi on a stations day', /7:13\/mi/.test(rec.cardio?.summary || ''), rec.cardio?.summary);
check('headline is HYROX day', rec.headline === 'HYROX day');
check('the plan stationEntries reach the card', rec.cardio?.session.plan.stationEntries?.length === 8);
const raceRec = buildDailyRecommendation({ date: '2026-12-01', splitDay, exercises: [], records, goals, recovery: { confidence: 'Low', readiness: 80 }, profile: { weeklyMileage: 20, runningDays: 3 }, runningHistory: [], loadBiasPercent: 0, thresholdSecondsPerMile: T, inputFingerprint: 'x' });
check('four days out it is the race-week sharpener', raceRec.cardio?.title === 'HYROX race-week sharpener', raceRec.cardio?.title);

console.log('\nHYROX work only for a HYROX goal');
const build = (day, date, withGoals, extra = {}) => buildDailyRecommendation({ date, splitDay: day, exercises: [], records, goals: withGoals, recovery: { confidence: 'Low', readiness: 80 }, profile: { weeklyMileage: 20, runningDays: 3 }, runningHistory: [], loadBiasPercent: 0, thresholdSecondsPerMile: T, inputFingerprint: 'x', ...extra });
const runGoals = [{ type: 'Endurance', title: '5K', target: '22:30', date: '2026-12-05', connection: '', exercise: '5K Run' }];
check('a HYROX day with no HYROX goal writes no HYROX session', !build(splitDay, '2026-09-21', runGoals).cardio && !build(splitDay, '2026-09-21', []).cardio);
const cardioDay = { position: 2, name: 'Conditioning', type: 'cardio', muscles: ['Cardio'], exercises: [], cardioTypes: ['Forge'] };
const stationsRec = build(cardioDay, '2026-09-21', goals);
check('with a HYROX goal and a week without HYROX, a cardio day becomes stations', /HYROX stations/.test(stationsRec.cardio?.title || ''), stationsRec.cardio?.title);
check('and says why', /No HYROX station work in the last week/.test(stationsRec.cardio?.session.rationale || ''));
check('and its summary names the runs and stations', /× 1 km at .* at race distance/.test(stationsRec.cardio?.summary || ''), stationsRec.cardio?.summary);
check('HYROX inside the last week leaves the cardio day alone', !/HYROX/.test(build(cardioDay, '2026-09-12', goals).cardio?.title || ''), build(cardioDay, '2026-09-12', goals).cardio?.title);
check('never on a leg day', !/HYROX/.test(build({ ...cardioDay, muscles: ['Quads'] }, '2026-09-21', goals).cardio?.title || ''));
check('never on a mixed day', !/HYROX/.test(build({ ...cardioDay, type: 'mixed' }, '2026-09-21', goals).cardio?.title || ''));
check('no HYROX goal, no stations on a cardio day', !/HYROX/.test(build(cardioDay, '2026-09-21', runGoals).cardio?.title || ''));
check('daysSinceHyrox counts back to the last HYROX day', daysSinceHyrox(records, '2026-09-21') === 13 && daysSinceHyrox([], '2026-09-21') === Infinity);


console.log('\nGoal time → race pace (Hunger in the Wild chart)');
const at = target => hyroxTargets(target);
check('90 min → 5:00/km, 5:30 a station', at('1:30:00')?.runSecondsPerKm === 300 && at('1:30:00')?.stationSeconds === 330);
check('75 min → 4:20/km, 4:20 a station', at('1:15:00')?.runSecondsPerKm === 260 && at('1:15:00')?.stationSeconds === 260);
check('60 min → 3:45/km, 3:15 a station', at('1:00:00')?.runSecondsPerKm === 225 && at('1:00:00')?.stationSeconds === 195);
check('85 min sits between the anchors', at('1:25:00')?.runSecondsPerKm === 287, String(at('1:25:00')?.runSecondsPerKm));
check('the unit after the time still reads', at('1:25:00 hh:mm:ss')?.runSecondsPerKm === 287);
check('the chart adds back up: 4–7 min left for the Roxzone (four at the elite end)',
  ['1:00:00', '1:15:00', '1:30:00', '1:50:00'].every(t => { const r = at(t).roxzoneSeconds / 60; return r >= 4 && r <= 7; }),
  ['1:00:00', '1:15:00', '1:30:00', '1:50:00'].map(t => (at(t).roxzoneSeconds / 60).toFixed(1)).join(', '));
check('a slower finish never gets a faster pace', at('1:50:00').runSecondsPerKm > at('1:30:00').runSecondsPerKm);
check('no time, or a nonsense one, gives nothing', at('') === null && at('0:20:00') === null && at('4:00:00') === null);

console.log('\nThe goal paces the HYROX day');
const G = '1:25:00 hh:mm:ss';
check('compromised runs at goal pace: 4:47/km', hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T, goalTarget: G, metric: true }).runPace === '4:47/km',
  hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T, goalTarget: G, metric: true }).runPace);
check('a simulation banks nothing — also goal pace', hyroxSession({ sessionIndex: 5, thresholdSecondsPerMile: T, goalTarget: G, metric: true }).runPace === '4:47/km');
check('a stations day eases off goal pace a little', hyroxSession({ sessionIndex: 0, thresholdSecondsPerMile: T, goalTarget: G }).runPace === formatRunPace(287 * 1.609344 + GOAL_OFFSET.stations));
check('the rationale says what the finish asks for', /1:25:00 finish is 4:47\/km on all eight runs, about 5:07 per station/.test(hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T, goalTarget: G }).rationale),
  hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T, goalTarget: G }).rationale);
check('a goal faster than threshold holds at threshold, and says so', (() => {
  const s = hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: 420, goalTarget: '1:00:00' });
  return s.runPace === formatRunPace(420) && /quicker than your threshold/.test(s.rationale);
})());
check('a goal with no threshold still paces the runs', hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: 0, goalTarget: G, metric: true }).runPace === '4:47/km');
check('low readiness still eases a goal pace', hyroxSession({ sessionIndex: 1, thresholdSecondsPerMile: T, goalTarget: G, readiness: 50 }).runPace === formatRunPace(287 * 1.609344 + EASED_OFFSET));
check("Plan's HYROX row names the race pace", /Your 1:25:00 asks for 4:47\/km runs and about 5:07 per station/.test(hyroxPlanDetail([{ type: 'Endurance', exercise: 'HYROX', title: 'HYROX · 1:25:00 hh:mm:ss', target: G }])));
check('without a HYROX goal the row is an open day', /Open day — add a HYROX goal/.test(hyroxPlanDetail([])));
check('a HYROX goal with no time says it paces off threshold', /paced off your threshold/.test(hyroxPlanDetail([{ type: 'Endurance', exercise: 'HYROX', title: 'HYROX', target: '' }])));


console.log('\nDoubles reads its own table');
const dbl = t => hyroxTargets(t, 'Doubles Mixed');
check('a 1:11 doubles is 5:00/km', dbl('1:11:00')?.runSecondsPerKm === 300);
check('a 1:23 doubles is 6:00/km', dbl('1:23:00')?.runSecondsPerKm === 360);
check('a 2:00 doubles is 9:20/km', dbl('2:00:00')?.runSecondsPerKm === 560);
check('between rows it interpolates: 1:12:30 → 5:08/km', dbl('1:12:30')?.runSecondsPerKm === 308, String(dbl('1:12:30')?.runSecondsPerKm));
check('the same time is a faster run in singles than doubles', hyroxTargets('1:25:00').runSecondsPerKm < dbl('1:25:00').runSecondsPerKm);
check('a relay gets no table', hyroxTargets('1:25:00', 'Relay Mixed') === null);

console.log('\nTraining paces from race pace (Repz)');
const rp = hyroxTrainingPaces(300);
check('5:00/km race → 6:07 recovery, 5:45 long, 4:41 threshold, 4:14 VO2', rp.recovery === 367 && rp.long === 345 && rp.threshold === 281 && rp.vo2 === 254, JSON.stringify(rp));
const mid = hyroxTrainingPaces(315);
check('between rows it interpolates', mid.threshold > 281 && mid.threshold < 309, JSON.stringify(mid));

console.log('\nThe HYROX goal sets the plan paces');
const empty = { source: 'none', supported: false, from: null, exponent: 1.06, fittedExponent: false, easyFast: 0, easySlow: 0, marathon: 0, threshold: 0, interval: 0, repetition: 0 };
const hyroxGoal = [{ type: 'Endurance', exercise: 'HYROX', title: 'HYROX', target: '1:30:00 hh:mm:ss', date: '2027-01-24', eventDivision: "Men's Open" }];
const fromGoal = withHyroxPaces(empty, hyroxGoal);
check('no logged runs: the table sets threshold (4:41/km)', Math.round(fromGoal.threshold / 1.609344) === 281, String(fromGoal.threshold / 1.609344));
check('and easy runs sit between long and recovery pace', Math.round(fromGoal.easyFast / 1.609344) === 345 && Math.round(fromGoal.easySlow / 1.609344) === 367);
const slowLog = { ...empty, source: 'recent-run', supported: true, easyFast: 700, easySlow: 760, marathon: 600, threshold: 520, interval: 480, repetition: 460 };
const held = withHyroxPaces(slowLog, hyroxGoal);
check('a pace the log has not shown is not handed out', held.threshold === 520 && held.interval === 480);
const fastLog = { ...slowLog, threshold: 380, interval: 350, repetition: 330, easyFast: 470, easySlow: 520, marathon: 420 };
check('a fitter athlete trains at the goal\'s paces', Math.round(withHyroxPaces(fastLog, hyroxGoal).threshold / 1.609344) === 281);
check('a running race goal still owns the paces', withHyroxPaces(slowLog, [...hyroxGoal, { type: 'Endurance', exercise: '5K Run', title: '5K', target: '22:30 mm:ss', date: '2027-03-01' }]) === slowLog);
check('no HYROX goal, nothing changes', withHyroxPaces(slowLog, []) === slowLog);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
