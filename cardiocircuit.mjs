/* "3 ROUNDS OF 500m ROW 20 WB AND 15 CAL ASSAULT BIKE IN 11 MINS TOTAL."

   Typed into the cardio logger, that came back as one 500 m bike for 11:00:
   the rounds, the row, the wall balls and the calories were gone. And when the
   AI logger did keep the counts, the unit repair written for "2 minutes" of
   running turned 15 calories into 15 miles. Rounds are now read as a circuit,
   and a count unit is never "repaired" into a distance. */
import { readFileSync } from 'node:fs';
import { parseCircuitDescription, parseCardioDescription } from './src/lib/cardioParse.ts';

let fails = 0;
const check = (label, ok, detail = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); if (!ok) fails += 1; };

console.log('\nThe sentence as written');
const c = parseCircuitDescription('3 rounds of 500m row 20 WB and 15 cal assault bike in 11 mins total');
check('it is read as a circuit', Boolean(c));
check('three rounds', c?.rounds === 3, String(c?.rounds));
check('three stations, in order', c?.stations.map(s => s.name).join('|') === 'Rowing|Wall Balls|Assault Bike', c?.stations.map(s => s.name).join('|'));
check('500 m of rowing', c?.stations[0].value === 500 && c?.stations[0].unit === 'meters');
check('20 wall-ball reps', c?.stations[1].value === 20 && c?.stations[1].unit === 'reps');
check('15 calories, not 15 miles', c?.stations[2].value === 15 && c?.stations[2].unit === 'calories');
check('11 minutes for the whole circuit', c?.minutes === 11, String(c?.minutes));

console.log('\nOther ways of writing it');
const commas = parseCircuitDescription('5 rounds: 400m run, 15 burpees, 20 KB swings — 18:42');
check('a clock at the end is the time', Math.abs((commas?.minutes || 0) - 18.7) < 0.01, String(commas?.minutes));
check('KB swings are Kettlebell Swings', commas?.stations[2].name === 'Kettlebell Swings');
const slashes = parseCircuitDescription('4 rds 10 cal ski / 10 thrusters / 10 pull ups 12:00');
check('"rds" and slashes read too', slashes?.rounds === 4 && slashes?.stations.length === 3);

console.log('\nOrdinary cardio is left alone');
check('a steady run is not a circuit', parseCircuitDescription('4 miles in 32 minutes') === null);
check('intervals are not a circuit', parseCircuitDescription('6x400m at 90s each') === null);
check('and the steady run still reads', parseCardioDescription('4 miles in 32 minutes').rows[0]?.distance === 4);

console.log('\nA count is never turned into miles');
const builder = readFileSync('./src/components/CardioBuilder.tsx', 'utf8');
check('the builder knows count units', /const isCountUnit = [^\n]*'calories', 'reps', 'floors'/.test(builder));
check('every unit repair skips counts', (builder.match(/!isDistanceUnit\(/g) || []).length === (builder.match(/!isCountUnit\([^)]*\) && !isDistanceUnit\(/g) || []).length);
const coach = readFileSync('./supabase/functions/forge-coach/index.ts', 'utf8');
check('the AI logger keeps counts too', /\['calories', 'reps', 'floors'\]\.includes\(String\(row\.unit\)\)/.test(coach));

console.log(`\n${fails ? `${fails} failed` : 'All checks passed'}`);
process.exit(fails ? 1 : 0);
