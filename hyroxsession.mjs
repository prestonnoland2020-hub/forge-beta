import { hyroxSession, hyroxShape, hyroxSessionsDone, stationsHalf, simulationFull, formatRunPace, kmSplit, divisionKey, HYROX_STATIONS, RUN_OFFSET, EASED_OFFSET } from './src/lib/hyroxSession.ts';
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
check('summary carries the pace', /7:27\/mi/.test(rec.cardio?.summary || ''), rec.cardio?.summary);
check('headline is HYROX day', rec.headline === 'HYROX day');
check('the plan stationEntries reach the card', rec.cardio?.session.plan.stationEntries?.length === 8);
const raceRec = buildDailyRecommendation({ date: '2026-12-01', splitDay, exercises: [], records, goals, recovery: { confidence: 'Low', readiness: 80 }, profile: { weeklyMileage: 20, runningDays: 3 }, runningHistory: [], loadBiasPercent: 0, thresholdSecondsPerMile: T, inputFingerprint: 'x' });
check('four days out it is the race-week sharpener', raceRec.cardio?.title === 'HYROX race-week sharpener', raceRec.cardio?.title);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
