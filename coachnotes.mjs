/* THE COACH SPEAKS FIRST — and every word of it is a fact with a number in it.

   These checks are the three rules: one thing at a time (ranking), each thing
   once (stable keys, seen-set), nothing without a number (every sentence
   names its figure). And the gates — a note fires when its fact is true and
   stays silent when it is not, because a coach that nags is worse than one
   that is silent. */
import { coachNotes, nextNote, SESSION_FRESH_DAYS, READINESS_HARD_FLOOR, LIFT_MISS_MIN } from './src/lib/coachNotes.ts';

let fails = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : detail ? ` — ${detail}` : ''}`);
  if (!ok) fails += 1;
};
const quiet = () => ({
  todayIso: '2026-09-17', verdicts: [], levelMoves: [], trend: null, week: null, closedWeek: null,
  liftMisses: [], goalChanges: [], readiness: null, easyTooFast: null,
});
const kinds = (notes) => notes.map(n => n.kind);

console.log('\nSilence when nothing has happened');
check('an empty week says nothing', coachNotes(quiet()).length === 0);

console.log('\nA judged session, while it is fresh, with the level it moved');
const v = { date: '2026-09-15', outcome: 'on', say: 'Tuesday: 12 min at 6:47/mi, against 6:53/mi asked.', text: '12 min @ 6:53/mi' };
let notes = coachNotes({ ...quiet(), verdicts: [v], levelMoves: [{ zone: 'threshold', from: 4, to: 4.5, date: '2026-09-15', outcome: 'on' }] });
check('it fires', kinds(notes).includes('session'));
check('the engine’s own sentence is the line', notes[0].say === v.say);
check('the level move is the detail', notes[0].detail === 'Threshold 4 → 4.5.', notes[0].detail);
check('the key is the session’s date', notes[0].key === 'session:2026-09-15');
notes = coachNotes({ ...quiet(), todayIso: '2026-09-25', verdicts: [v], levelMoves: [] });
check(`and after ${SESSION_FRESH_DAYS} days it is history, not news`, !kinds(notes).includes('session'));
notes = coachNotes({ ...quiet(), verdicts: [{ ...v, outcome: 'unmeasured' }] });
check('an unmeasured session is not a session', !kinds(notes).includes('session'));
notes = coachNotes({ ...quiet(), verdicts: [v], levelMoves: [{ zone: 'threshold', from: 4, to: 4, date: '2026-09-15', outcome: 'on' }] });
check('a move that did not move is not reported', notes[0].detail === undefined, notes[0].detail);

console.log('\nA trend outranks the session it is made of');
const trend = { kind: 'paces-stale', run: 3, say: 'Three hard sessions in a row came in faster than asked.', instruction: 'Rebuild the paces off the last three sessions.' };
notes = coachNotes({ ...quiet(), verdicts: [v], trend });
check('both fire', kinds(notes).includes('trend') && kinds(notes).includes('session'));
check('the trend comes first', notes[0].kind === 'trend');
check('its instruction is what the coach is asked', notes[0].ask === trend.instruction);

console.log('\nThis week’s miles, only when the week is nearly gone and short');
notes = coachNotes({ ...quiet(), week: { startIso: '2026-09-14', planned: 20, ran: 12, daysLeft: 2 } });
check('12 of 20 with two days left fires', kinds(notes).includes('week-miles'));
check('and says exactly that', notes[0].say === '12 of 20 mi this week, 2 days left.', notes[0].say);
check('with the shortfall as the detail', notes[0].detail === '8 mi short of the plan.', notes[0].detail);
notes = coachNotes({ ...quiet(), week: { startIso: '2026-09-14', planned: 20, ran: 4, daysLeft: 5 } });
check('Tuesday at 4 of 20 is just Tuesday', !kinds(notes).includes('week-miles'));
notes = coachNotes({ ...quiet(), week: { startIso: '2026-09-14', planned: 20, ran: 15, daysLeft: 1 } });
check('15 of 20 with a day left is fine', !kinds(notes).includes('week-miles'));
notes = coachNotes({ ...quiet(), week: { startIso: '2026-09-14', planned: 0, ran: 0, daysLeft: 1 } });
check('a week with no planned miles has nothing to be short of', !kinds(notes).includes('week-miles'));
notes = coachNotes({ ...quiet(), week: { startIso: '2026-09-14', planned: 20, ran: 7.5, daysLeft: 1 } });
check('a fraction keeps one decimal', /^7\.5 of 20 mi this week, 1 day left\.$/.test(notes[0].say), notes[0].say);

console.log('\nLast week, once it has closed');
notes = coachNotes({ ...quiet(), closedWeek: { startIso: '2026-09-07', planned: 20, ran: 14 } });
check('14 of 20 is told', kinds(notes).includes('week-closed') && notes[0].say === 'Last week: 14 of 20 mi.');
notes = coachNotes({ ...quiet(), closedWeek: { startIso: '2026-09-07', planned: 20, ran: 17 } });
check('17 of 20 is close enough to leave alone', !kinds(notes).includes('week-closed'));

console.log('\nA lift that keeps coming up short');
notes = coachNotes({ ...quiet(), liftMisses: [{ lift: 'Bench Press', misses: 2, askedReps: 6 }] });
check('two misses is a pattern', kinds(notes).includes('lift-miss'));
check('said with the rung', notes[0].say === 'Bench Press has come in under the ask twice running at 6 reps.', notes[0].say);
notes = coachNotes({ ...quiet(), liftMisses: [{ lift: 'Bench Press', misses: 1, askedReps: 6 }] });
check(`${LIFT_MISS_MIN - 1} miss is a day`, !kinds(notes).includes('lift-miss'));
notes = coachNotes({ ...quiet(), liftMisses: [{ lift: 'Squat', misses: 3 }] });
check('three reads as three, no rung when none is known', notes[0].say === 'Squat has come in under the ask 3 times running.', notes[0].say);

console.log('\nA goal whose verdict moved');
notes = coachNotes({ ...quiet(), goalChanges: [{ goal: '5K goal', from: 'needs-more', to: 'reachable', say: 'Your best 5K effort now projects inside 19:00.' }] });
check('it fires', kinds(notes).includes('goal-moved'));
check('from → to, in words', notes[0].say === '5K goal: needs more → reachable.', notes[0].say);
check('the feasibility sentence is the detail', notes[0].detail === 'Your best 5K effort now projects inside 19:00.');
const worse = coachNotes({ ...quiet(), goalChanges: [{ goal: '5K goal', from: 'reachable', to: 'needs-more', say: '' }] });
check('getting worse ranks above getting better', worse[0].priority > notes[0].priority);
check('the key names the verdict it moved to, so the next move is new news', notes[0].key === 'goal-moved:5K goal:reachable');

console.log('\nReadiness, only on a day the plan asks for hard work');
notes = coachNotes({ ...quiet(), readiness: { score: 52, hardSessionToday: 'tempo' } });
check('52 on a tempo day fires', kinds(notes).includes('readiness'));
check('and names both', notes[0].say === 'Readiness 52 today. Make the tempo an easy run.', notes[0].say);
notes = coachNotes({ ...quiet(), readiness: { score: 52, hardSessionToday: null } });
check('52 on a rest day is not advice', !kinds(notes).includes('readiness'));
notes = coachNotes({ ...quiet(), readiness: { score: READINESS_HARD_FLOOR, hardSessionToday: 'tempo' } });
check('at the floor it is fine', !kinds(notes).includes('readiness'));

console.log('\nEasy runs run at tempo, once a week');
notes = coachNotes({ ...quiet(), week: { startIso: '2026-09-14', planned: 20, ran: 15, daysLeft: 5 }, easyTooFast: { loggedPace: '7:40', easyRange: '8:29–9:27' } });
check('it fires', kinds(notes).includes('easy-too-fast'));
check('keyed to the week, so it is said once a week', notes[0].key === 'easy-too-fast:2026-09-14');

console.log('\nOne thing at a time, each thing once');
const everything = coachNotes({
  ...quiet(),
  verdicts: [v], levelMoves: [], trend,
  week: { startIso: '2026-09-14', planned: 20, ran: 12, daysLeft: 2 },
  closedWeek: { startIso: '2026-09-07', planned: 20, ran: 14 },
  liftMisses: [{ lift: 'Bench Press', misses: 2, askedReps: 6 }],
  goalChanges: [{ goal: '5K goal', from: 'needs-more', to: 'reachable', say: '' }],
  readiness: { score: 52, hardSessionToday: 'tempo' },
  easyTooFast: { loggedPace: '7:40', easyRange: '8:29–9:27' },
});
check('all eight fire', everything.length === 8, String(everything.length));
check('readiness leads, because it is about the next few hours', everything[0].kind === 'readiness');
check('then the trend, then the goal, then the session',
  kinds(everything).slice(0, 4).join(',') === 'readiness,trend,goal-moved,session', kinds(everything).join(','));
check('the card shows the first', nextNote(everything, {}).kind === 'readiness');
check('and the next once that is seen', nextNote(everything, { [everything[0].key]: '2026-09-17' }).kind === 'trend');
const allSeen = Object.fromEntries(everything.map(n => [n.key, '2026-09-17']));
check('and nothing once all are seen', nextNote(everything, allSeen) === null);
/* The trend sentence is the engine's own and counts its run in words. */
const hasFigure = (text) => /\d|\b(two|three|four|five|six)\b/i.test(text);
check('every note carries a number', everything.every(n => hasFigure(n.say)), everything.filter(n => !hasFigure(n.say)).map(n => n.kind).join(','));
check('every note can be asked about', everything.every(n => n.ask.length > 20));
check('keys are unique', new Set(everything.map(n => n.key)).size === everything.length);

console.log(fails ? `\n${fails} failing\n` : '\nAll checks passed\n');
process.exit(fails ? 1 : 0);
