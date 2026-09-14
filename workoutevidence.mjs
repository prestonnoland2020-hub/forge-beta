/* HE TRAINS FIFTY WEEKS A YEAR AND RACES TWICE.

   Every number Forge predicted came off races and time trials. So an athlete
   who hits every session for three months watched their projection do nothing
   but decay — the mile from July ageing out week by week while the work that
   should have been moving it said nothing at all. Preston: "completing the
   prescribed workouts should absolutely improve projections if it's real."

   He is right, and the word doing the work is REAL. A system that lets a
   workout raise a race prediction is one bad rule away from being a flattery
   machine, so this pins the safety properties as hard as it pins the feature:
   what counts, what it is worth, and — most of it — what must never move the
   number at all. */
import { effortFromWorkout, workoutEfforts, CONTINUOUS_SHARE,
  MIN_EVIDENCE_MILES, IMPLAUSIBLE_GAIN } from './src/lib/workoutEvidence.ts';
import { fitnessCurve, predictFromCurve } from './src/lib/fitnessCurve.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const TODAY = '2026-09-14';
const ago = n => { const d = new Date(`${TODAY}T12:00:00`); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const clock = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const e = (days, miles, mmss) => { const [m, s] = mmss.split(':').map(Number); return { date: ago(days), miles, seconds: Math.round((m * 60 + s) * miles) }; };

/* Preston's real shape: a 5:19 mile in July, easy running since, and paces
   written off that — threshold 6:57/mi, interval 5:43/mi. */
const RACES = [e(47, 1, '5:19'), e(176, 1, '5:29'), e(10, 5, '8:10'), e(4, 4, '8:20'), e(18, 6, '8:35')];
const CURVE = fitnessCurve(RACES, TODAY);
const mile = () => predictFromCurve(CURVE, 1).seconds;
const session = (over) => ({ date: ago(3), outcome: 'on', actualPace: 417, completed: 3,
  text: '3 × 8 min @ 6:57/mi · 90 s jog between · threshold', ...over });

console.log('\nA completed session becomes a dated effort on the same curve');
const tempo = effortFromWorkout(session());
check('a threshold session is evidence', Boolean(tempo), JSON.stringify(tempo));
check('and it is dated the day it was run', tempo.date === ago(3));
check('it is credited as a distance, at the pace actually run',
  Math.abs(tempo.seconds / tempo.miles - 417) < 2, `${clock(tempo.seconds / tempo.miles)}/mi`);
check('and for less than the total fast running, because a set of pieces is not one effort',
  tempo.miles < (3 * 8 * 60) / 417, `${tempo.miles} vs ${((3 * 8 * 60) / 417).toFixed(2)} mi of work`);

console.log('\nHitting the pace on the card cannot inflate anything, and that is the design');
/* THE PROPERTY THAT MAKES THIS SAFE. The pace on the card was computed FROM
   the curve, so running it exactly lands at or behind where the curve already
   sits. A plan being right about you is not new information about you. */
const held = fitnessCurve([...RACES, effortFromWorkout(session())], TODAY);
check('a session run exactly as written leaves the mile projection alone',
  Math.abs(predictFromCurve(held, 1).seconds - mile()) <= 1,
  `${clock(predictFromCurve(held, 1).seconds)} vs ${clock(mile())}`);

console.log('\nBeating it does move the number, by about what you beat it by');
/* 5 × 600 at interval pace is close to a race over the total distance — I pace
   IS 3K-5K race pace — so this is the session an athlete has fifty of and the
   one that should be able to say something. */
const onPace = effortFromWorkout(session({ actualPace: 343, completed: 5, text: '5 × 600 m @ 2:08/rep · 2 min jog between' }));
const beat = effortFromWorkout(session({ actualPace: 326, completed: 5, text: '5 × 600 m @ 2:08/rep · 2 min jog between' }));
const after = fitnessCurve([...RACES, beat], TODAY);
check('intervals run five percent up pull the curve with them',
  predictFromCurve(after, 1).seconds < mile(), `${clock(predictFromCurve(after, 1).seconds)} vs ${clock(mile())}`);
check('but by a few percent, not to the workout pace itself',
  predictFromCurve(after, 1).seconds > mile() * 0.9,
  `${clock(predictFromCurve(after, 1).seconds)}`);
check('and the same session on pace does not', onPace.seconds / onPace.miles > beat.seconds / beat.miles);

console.log('\nOnly a session that went in counts');
/* The downside is already carried by the progression level, which makes the
   next dose smaller. Letting a bad day drag the race prediction down as well
   would punish it twice — and would mean training through a hard week costs
   you your projections. */
for (const outcome of ['slower', 'faded', 'short', 'unmeasured']) {
  check(`a ${outcome} session is not evidence of fitness`, effortFromWorkout(session({ outcome })) === null);
}
check('on-pace and faster both are',
  Boolean(effortFromWorkout(session({ outcome: 'on' }))) && Boolean(effortFromWorkout(session({ outcome: 'faster' }))));

console.log('\nWhat a set of repeats is worth depends on what kind of repeats');
check('threshold work is nearly continuous and counts almost in full', CONTINUOUS_SHARE.threshold > 0.9);
check('intervals count for most of it', CONTINUOUS_SHARE.intervals > 0.8 && CONTINUOUS_SHARE.intervals < CONTINUOUS_SHARE.threshold);
/* Eight three-hundreds at mile pace with full recovery does not mean you could
   race that far at mile pace. Crediting it as though it did is the obvious way
   to turn a speed session into a fake personal best. */
check('and fully-recovered speed work counts for well under half', CONTINUOUS_SHARE.reps <= 0.4);
check('a rep session is not a race prediction',
  effortFromWorkout(session({ actualPace: 307, completed: 8, text: '8 × 300 m @ 0:58/rep · full recovery (~2:30)' })) === null);

console.log('\nA race is not counted twice');
/* The test week IS a race. It is already in the log as a continuous effort,
   and letting one good day vote twice is how a single row becomes load-bearing
   again — which is the whole thing fitnessCurve exists to stop. */
check('the goal-effort assessment is left to the log',
  effortFromWorkout(session({ completed: 1, actualPace: 319, text: 'Goal effort assessment over 1 mi' })) === null);

console.log('\nAnd a short equivalent is not credited at all');
/* Below about a mile the conversion to a common distance is dominated by the
   exponent rather than by the running: half a mile of fast repeats converts to
   a flattering mile whatever the athlete is worth. */
check(`nothing under ${MIN_EVIDENCE_MILES} mi of equivalent is used`,
  effortFromWorkout(session({ completed: 2, actualPace: 343, text: '5 × 600 m @ 2:08/rep · 2 min jog between' })) === null);
check('a full session of the same reps is', Boolean(onPace), JSON.stringify(onPace));

console.log('\nA session run wildly faster than asked is a measurement problem');
/* Nobody beats a target built from their own log by a sixth. A watch that lost
   the track, a rep logged in the wrong unit, or a card parsed wrong will — and
   each would otherwise go into the curve as a personal best. */
const absurd = effortFromWorkout(session({ outcome: 'faster', actualPace: 343 * (1 - IMPLAUSIBLE_GAIN - 0.05), completed: 5,
  text: '5 × 600 m @ 2:08/rep · 2 min jog between' }));
check('it is thrown out rather than believed', absurd === null);
check('and a big, plausible breakthrough still counts',
  Boolean(effortFromWorkout(session({ outcome: 'faster', actualPace: 343 * 0.92, completed: 5,
    text: '5 × 600 m @ 2:08/rep · 2 min jog between' }))));

console.log('\nAnd only what credits comes back');
check('a block of sessions yields only the ones that qualify',
  workoutEfforts([session(), session({ outcome: 'faded' }), session({ text: 'Easy only — the hard run moves to when you have recovered' })]).length === 1);
check('nothing at all is answered with nothing', workoutEfforts(null).length === 0 && workoutEfforts([]).length === 0);

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
