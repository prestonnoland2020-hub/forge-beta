/* A WORKOUT THE COACH MAKES IS THE WORKOUT, NOT A LIST OF NAMES.

   "Can you make me a circuit workout to add to library?" came back as
   Save workout "HYROX Base Circuit": Run · SkiErg · Sled Push · … — eight
   names, no distance, no reps, no load, no rounds. And it was saved as a
   names-only Strength entry, which the Saved circuits list never shows.

   Now the action carries every station with its number, and saves as a real
   circuit that opens in the builder. */
import { readFileSync } from 'node:fs';
import { parseActions, whereItGoes, circuitWorkoutFromAction } from './src/lib/coachActions.ts';
import { stationLine, formatLine } from './src/components/CircuitWorkoutBuilder.tsx';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : d ? ` — ${d}` : ''}`); if (!c) fails++; };
const CTX = { splitDays: [], goals: [], activeNoteAreas: [], exercises: ['Run', 'SkiErg', 'Sled Push', 'Wall Balls'], weeklyMileage: 15, runningDays: 3, loadBiasPercent: 0 };

console.log('\nThe card shows the workout itself');
const [made] = parseActions([{ type: 'create_workout', name: 'HYROX Base Circuit', items: ['Run', 'SkiErg', 'Sled Push', 'Wall Balls'],
  stations: [
    { name: 'Run', target: '400', unit: 'meters', load: null, rest: 0 },
    { name: 'SkiErg', target: '500', unit: 'm', load: null, rest: 0 },
    { name: 'Sled Push', target: '20', unit: 'meters', load: '102 kg sled', rest: 0 },
    { name: 'Wall Balls', target: '20', unit: 'reps', load: '6 kg', rest: 60 },
  ], rounds: 3, format: 'Rounds', roundRest: 90 }], CTX);
check('it is kept', Boolean(made), 'dropped');
check('with every station and its number', made?.stations?.length === 4 && made.stations[1].target === '500' && made.stations[1].unit === 'meters', JSON.stringify(made?.stations));
check('the card says rounds and rest', /3 rounds, 90 s between/.test(made?.label || ''), made?.label);
check('and each piece with its distance, reps and load',
  /400 m Run · 500 m SkiErg · 20 m Sled Push @ 102 kg sled · 20 Wall Balls @ 6 kg/.test(made?.label || ''), made?.label);

console.log('\nOther shapes read the way a coach says them');
const [amrap] = parseActions([{ type: 'create_workout', name: 'Engine', items: null,
  stations: [{ name: 'SkiErg', target: '15', unit: 'calories', load: null, rest: 0 }, { name: 'Wall Balls', target: '15', unit: 'reps', load: null, rest: 0 }],
  rounds: 20, format: 'AMRAP', roundRest: 0 }], CTX);
check('an AMRAP is its minutes', /20-min AMRAP: 15 cal SkiErg · 15 Wall Balls/.test(amrap?.label || ''), amrap?.label);

console.log('\nA vague station is not saved as if it were a prescription');
const [vague] = parseActions([{ type: 'create_workout', name: 'Loose', items: ['Run', 'SkiErg', 'Sled Push'],
  stations: [{ name: 'Run', target: 'some', unit: 'meters', load: null, rest: 0 }, { name: 'SkiErg', target: '500', unit: 'furlongs', load: null, rest: 0 },
    { name: 'Sled Push', target: '20', unit: 'meters', load: null, rest: 0 }, { name: 'Wall Balls', target: '20', unit: 'reps', load: null, rest: 0 }],
  rounds: 2, format: 'Rounds', roundRest: 0 }], CTX);
check('pieces with no number or no known unit are dropped', vague?.stations?.length === 2, JSON.stringify(vague?.stations));
const [names] = parseActions([{ type: 'create_workout', name: 'Old deploy', items: ['Run', 'SkiErg'] }], CTX);
check('an older coach that sends only names still saves as before', names && !names.stations && /Run · SkiErg/.test(names.label), names?.label);

console.log('\nIt is saved as a circuit, and the coach is told to write it in full');
const apply = readFileSync('src/features/training/useCoachActions.ts', 'utf8');
check('the coach screen saves it through the shared circuit builder', /circuitWorkoutFromAction\(action, exercises\)/.test(apply));
const server = readFileSync('supabase/functions/forge-coach/index.ts', 'utf8');
check('the schema carries stations, rounds, format and rest', /stations: \{ type: \['array', 'null'\]/.test(server) && /'stations', 'rounds', 'format', 'roundRest'\]/.test(server));
check('and the coach is told never to send a list of names', /Write the WHOLE prescription, never a list of names/.test(server));

console.log('\nAfter Apply, it says where it went and always lands in Saved circuits');
check('a saved workout goes to Library · Saved circuits', whereItGoes(made).place === 'Library · Saved circuits' && /show=circuits/.test(whereItGoes(made).to));
check('the other changes name their screen too', whereItGoes({ type: 'shorten_today' }).place === 'Today' && whereItGoes({ type: 'update_goal' }).place === 'Goals' && whereItGoes({ type: 'set_weekly_mileage' }).place === 'Plan');
const namesOnly = circuitWorkoutFromAction(names, [{ name: 'Run', kind: 'Cardio' }]);
check('even a names-only workout is saved as a circuit', namesOnly?.kind === 'Circuit' && namesOnly.plan.stationEntries.length === 2, JSON.stringify(namesOnly));
check('with its numbers left to fill in, and said so', namesOnly.plan.stationEntries.every(entry => entry.target === '') && /open to set the numbers/.test(namesOnly.summary));
check('the coach screen links to it, on that circuit', /show=circuits&circuit=\$\{saved\.id\}/.test(apply));
check('no path saves a coach workout anywhere but Saved circuits', !/kind: cardioOnly/.test(apply));
const coachPage = readFileSync('src/pages/CoachPage.tsx', 'utf8');
check('the Done message carries a See-it link that closes the coach', /coach-applied-link/.test(coachPage) && /forge:close-coach/.test(coachPage));
check('and the library scrolls to and marks the circuit', /just-saved/.test(readFileSync('src/components/WorkoutLibrary.tsx', 'utf8')));

console.log('\nThe builder reads like a workout');
check('a station is one plain line', stationLine({ name: 'Sled Push', target: '20', unit: 'meters', load: '102 kg' }) === '20 m Sled Push @ 102 kg');
check('reps read as a count', stationLine({ name: 'Wall Balls', target: '15', unit: 'reps' }) === '15 Wall Balls');
check('a station with no amount still names the movement', stationLine({ name: 'Burpee Broad Jumps', target: '', unit: 'meters' }) === 'Burpee Broad Jumps');
check('the format is one line', formatLine('Rounds', '3', '60') === '3 rounds · 1 min between' && formatLine('AMRAP', '20', '0') === '20-min AMRAP');
const builder = readFileSync('src/components/CircuitWorkoutBuilder.tsx', 'utf8');
check('no movement from Forge is dropped for being outside a filtered list', /name: exercise\?\.name \|\| station\.name/.test(builder));

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
