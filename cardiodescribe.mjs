/* DESCRIBE IT, FORGE MAPS IT — AND A WATCH RUN IS NEVER LOGGED TWICE.

   The cardio card is one box now: the athlete writes what they did and the
   reader turns it into fields. These are the sentences it used to get wrong —
   time repeats read as mile repeats, floors dropped, an EMOM read as twenty
   minutes of rowing — and the rule that tops a described interval set up to
   what the watch measured, so describing a synced run adds detail to it
   instead of shrinking it. */
import { parseCardioDescription, parseCircuitDescription, circuitSummary, fillToWatch } from './src/lib/cardioParse.ts';
import { build } from 'esbuild';

/* cardioSession imports its neighbours without extensions, which Node will
   not resolve on its own; bundle it for the one helper this needs. */
const bundled = await build({ entryPoints: ['./src/lib/cardioSession.ts'], bundle: true, format: 'esm', write: false, logLevel: 'silent' });
const { syncedProvider } = await import(`data:text/javascript,${encodeURIComponent(bundled.outputFiles[0].text)}`);

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };
const rowsOf = text => parseCardioDescription(text).rows;

console.log('\nTime repeats are time, not miles');
let rows = rowsOf('10 x 1 min hard / 1 min easy on the treadmill');
check('ten repeats', rows.length === 10, String(rows.length));
check('each one minute on the clock', rows.every(row => row.timeMinutes === 1), JSON.stringify(rows[0]));
check('and no distance claimed', rows.every(row => row.distance === 0 && row.unit === 'minutes'), JSON.stringify(rows[0]));
check('the recovery is kept as a note', parseCardioDescription('10 x 1 min hard / 1 min easy').note === '1 min easy between repeats', parseCardioDescription('10 x 1 min hard / 1 min easy').note);
rows = rowsOf('8 x 30s strides');
check('seconds read as seconds', rows.length === 8 && rows[0].timeMinutes === 0.5, JSON.stringify(rows[0]));

console.log('\nDistance repeats keep their recovery in words');
let parsed = parseCardioDescription('4x800 @ 3:10 w/ 400 jog rec');
check('four 800 m repeats at 3:10', parsed.rows.length === 4 && parsed.rows.every(row => row.distance === 800 && row.unit === 'meters' && Math.abs(row.timeMinutes - 3.1667) < 0.01), JSON.stringify(parsed.rows[0]));
check('the 400 m jog is the note', parsed.note === '400m jog between repeats', parsed.note);
parsed = parseCardioDescription('1 mile warmup, 6x400m at 90s with 2 min jog, 1 mile cooldown');
check('warmup, six repeats, cooldown', parsed.rows.length === 8, String(parsed.rows.length));
check('a 2 min jog is named as one', parsed.note === '2 min jog between repeats', parsed.note);

console.log('\nCounts are counts');
rows = rowsOf('stairmaster 20 min 60 floors');
check('60 floors in 20 minutes', rows.length === 1 && rows[0].distance === 60 && rows[0].unit === 'floors' && rows[0].timeMinutes === 20, JSON.stringify(rows));
rows = rowsOf('assault bike 300 cal in 25 min');
check('300 calories in 25 minutes', rows.length === 1 && rows[0].distance === 300 && rows[0].unit === 'calories', JSON.stringify(rows));

console.log('\nAn EMOM or AMRAP is a circuit on a clock');
let circuit = parseCircuitDescription('EMOM 20 min: 12 cal row, 10 burpees');
check('read as an EMOM', circuit?.format === 'EMOM', JSON.stringify(circuit));
check('twenty minutes on the clock', circuit?.minutes === 20);
check('both stations, in order', circuit?.stations.map(station => `${station.value} ${station.unit} ${station.name}`).join('|') === '12 calories Rowing|10 reps Burpees', circuit?.stations.map(station => station.name).join('|'));
check('ten rounds of the pair', circuit?.rounds === 10, String(circuit?.rounds));
circuit = parseCircuitDescription('20 min AMRAP: 5 pull ups, 10 push ups, 15 air squats - 8 rounds');
check('an AMRAP keeps the rounds the athlete got', circuit?.format === 'AMRAP' && circuit.rounds === 8 && circuit.minutes === 20, JSON.stringify(circuit));
check('and says so in its summary', /^AMRAP 20 min · 8 rounds · 5 Pull Ups/.test(circuitSummary(circuit)), circuitSummary(circuit));
circuit = parseCircuitDescription('3 rounds: 400m run, 15 burpees, 20 wall balls - 18:20');
check('rounds for time still read the same', circuit?.rounds === 3 && circuit.format === 'For time' && Math.abs(circuit.minutes - 18.333) < 0.01, JSON.stringify(circuit));
check('and their summary did not change', circuitSummary(circuit).startsWith('3 rounds · 400 m Run'), circuitSummary(circuit));

console.log('\nDescribing a watch run tops it up to what the watch measured');
const watch = { miles: 3.12, minutes: 26.67 };
let filled = fillToWatch(rowsOf('1 mi warmup, 6x400m at 90s with 2 min jog'), watch);
const miles = filled.rows.reduce((total, row) => total + (row.unit === 'miles' ? row.distance : row.unit === 'meters' ? row.distance / 1609.344 : 0), 0);
const minutes = filled.rows.reduce((total, row) => total + row.timeMinutes, 0);
check('the described pieces lead', filled.rows.length === 8 && filled.rows[1].distance === 400);
check('one line carries the rest', Boolean(filled.added) && filled.rows[7] === filled.added);
check('the total distance is the watch’s', Math.abs(miles - 3.12) < 0.02, miles.toFixed(3));
check('the total time is the watch’s', Math.abs(minutes - 26.67) < 0.02, minutes.toFixed(2));
filled = fillToWatch(rowsOf('10 x 1 min hard / 1 min easy'), watch);
check('time repeats with no distance still keep the watch’s miles', filled.added?.distance === 3.12, JSON.stringify(filled.added));
filled = fillToWatch(rowsOf('3.1 miles in 26:40'), watch);
check('a description that covers the run adds nothing', !filled.added && filled.rows.length === 1, JSON.stringify(filled.rows));
filled = fillToWatch(rowsOf('5 miles in 40:00'), watch);
check('a description longer than the watch is never trimmed', !filled.added && filled.rows[0].distance === 5);

console.log('\nWhich sessions came from a watch');
check('a Strava import', syncedProvider({ id: 'strava-1234', prescription: {} }) === 'Strava');
check('a Garmin import', syncedProvider({ id: 'garmin-99', prescription: {} }) === 'Garmin');
check('a wearable source with its provider', syncedProvider({ id: 'x1', prescription: { source: 'wearable', provider: 'COROS' } }) === 'COROS');
check('a hand-logged session is not', syncedProvider({ id: '6f1c2b9a-0000-4000-8000-000000000000', prescription: {} }) === null);

console.log(fails ? `\n${fails} check(s) failed` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
