/* A RACE MODEL PREDICTS FROM A RUN SOMEBODY RAN IN ONE GO.

   Preston's 5K goal read: CURRENT "Not logged", PROJECTED 7:30, TARGET 18:59,
   TO GO "—", and a green ON TRACK. Seven-thirty for a 5K is a world record by
   six minutes, and the card said in the same breath that it had no logged
   evidence.

   The projection came from his Saturday: 6 x 400 m repeats, plus a separate
   1.81 mile piece logged with a distance and no time. The model read the
   SESSION rather than its pieces — 3.31 miles summed against 8:00 of repeats —
   and Riegel-adjusted 2:25/mi down to a 5K.

   Two faults, both in that sentence. An interval workout is not one continuous
   effort. And a piece with distance but no time gave its miles away for free. */
import { predictRaceFromLegacyMethod } from './src/lib/cardioPrediction.ts';
import { continuousRunEfforts } from './src/lib/cardioSession.ts';

let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };
const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const session = (id, activity, summary, lines) => ({ id, activity, structure: 'custom', summary,
  prescription: { legacyIntervals: lines.map(([distance, unit, time]) => ({ distance, unit, time, cardioType: 'Run' })) } });
const record = (date, ...sessions) => ({ id: date, date, title: 'Run', muscles: ['Cardio'], hasCardio: true, cardioSessions: sessions });

/* His Saturday, exactly as the database holds it. */
const SATURDAY = record(day(4), session('sat', 'Run', 'Run · 2400 meters + 1.81 miles · 8:00 · 2:25 /mi · 7 lines',
  [[400, 'meters', 1.3333], [400, 'meters', 1.3333], [400, 'meters', 1.3333], [400, 'meters', 1.3333],
   [400, 'meters', 1.3333], [400, 'meters', 1.3333], [1.81, 'miles', 0]]));

console.log('\n  the session that produced 7:30');
const efforts = continuousRunEfforts(SATURDAY.cardioSessions[0]);
check('its repeats are six separate efforts, not one', efforts.length === 6, `${efforts.length} efforts`);
check('none of them is three miles long', efforts.every(effort => effort.miles < 0.3),
  efforts.map(effort => `${effort.miles.toFixed(2)}mi`).join(' '));
check('the untimed 1.81 miles is not an effort at all',
  !efforts.some(effort => Math.abs(effort.miles - 1.81) < 0.01));
check('so it can never give its distance away for free',
  efforts.every(effort => effort.minutes > 0));

console.log('\n  and the 5K projection it fed');
const fromIntervals = predictRaceFromLegacyMethod([SATURDAY], 3.10686);
check('an interval day alone predicts nothing', fromIntervals === null,
  fromIntervals ? clock(fromIntervals.seconds) : 'null');

/* A real continuous run, logged as one line. */
const STEADY = record(day(8), session('steady', 'Run', 'Run · 3 miles · 21:00 · 7:00 /mi', [[3, 'miles', 21]]));
console.log('\n  a run he actually ran in one go');
const real = predictRaceFromLegacyMethod([STEADY], 3.10686);
check('still predicts, as it always did', real !== null);
check('and the number is a 5K time a person could run',
  real.seconds > 1200 && real.seconds < 1500, clock(real.seconds));
check('drawn from the three-mile piece', Math.abs(real.source.miles - 3) < 0.01, `${real.source.miles} mi`);

console.log('\n  the two together');
const both = predictRaceFromLegacyMethod([SATURDAY, STEADY], 3.10686);
check('the intervals cannot beat the real run', both.seconds === real.seconds, clock(both.seconds));
check('and nothing claims 7:30', both.seconds > 1000, clock(both.seconds));

/* A leg inside a mixed session is still a continuous piece. */
const MIXED = record(day(12), session('mixed', 'Run', 'Run · 4 miles · 30:00 · 2 lines',
  [[1, 'miles', 9], [3, 'miles', 21]]));
console.log('\n  a warm-up mile then a hard three');
const legs = continuousRunEfforts(MIXED.cardioSessions[0]);
check('two pieces, each with its own time', legs.length === 2, JSON.stringify(legs.map(l => `${l.miles}mi/${l.minutes}min`)));
const mixed = predictRaceFromLegacyMethod([MIXED], 3.10686);
check('the three-mile piece is the effort, not the four-mile total',
  Math.abs(mixed.source.miles - 3) < 0.01, `${mixed.source.miles} mi in ${clock(mixed.source.seconds)}`);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
