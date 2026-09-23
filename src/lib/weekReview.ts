import type { CoachNote, LiftMiss } from './coachNotes';
import type { RawAction } from './coachActions';
import type { VerdictOutcome } from './sessionVerdict';

/* THE WEEK, REVIEWED. Once a week the coach speaks first, in four lines:
   what happened, the one thing that matters, what changes, what is next —
   and, when a change is warranted, the change itself as a one-tap action
   through the same path the chat coach uses. Deterministic: every line is
   arithmetic on the log, so it costs no coach call and says nothing the
   numbers do not support.

   Reviewed once, keyed to the week it covers, and shown any day of the week
   after — an athlete who does not open Forge on Monday still gets Monday's
   review on Wednesday. */

export type WeekReviewInput = {
  todayIso: string;
  /* The first day of the week being reviewed — the key. */
  weekStartIso: string;
  /* Sessions logged that week vs training days the split expects. */
  trainedDays: number;
  plannedDays: number;
  /* Running that week vs what the plan asked (0 when no plan). */
  ranMiles: number;
  plannedMiles: number;
  /* And the week before, to tell a bad week from a pattern. */
  priorRanMiles: number;
  priorPlannedMiles: number;
  /* Hard sessions judged that week. */
  verdicts: Array<{ date: string; outcome: VerdictOutcome; text: string }>;
  liftMisses: LiftMiss[];
  /* New bests set that week. */
  prs: Array<{ lift: string; weight: number; reps: number }>;
  /* Average readiness over the week when a wearable is on; null otherwise. */
  readinessAvg: number | null;
  /* Current bias, so the action proposes a change from where it is. */
  loadBiasPercent: number;
  /* What is next — the next quality session or the next split day. */
  nextText: string;
  metric?: boolean;
};

export const WEEK_REVIEW_SHORT_SHARE = 0.7;
export const WEEK_REVIEW_READINESS_FLOOR = 58;

const miles = (value: number) => (Math.round(value * 10) / 10).toString();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function weekReview(input: WeekReviewInput): CoachNote | null {
  const unit = input.metric ? 'km' : 'mi';
  const distance = (value: number) => `${miles(input.metric ? value * 1.609344 : value)} ${unit}`;
  const trained = input.trainedDays;
  if (trained === 0 && input.ranMiles === 0 && !input.verdicts.length) return null;

  /* 1. WHAT HAPPENED. */
  const parts = [plural(trained, 'session')];
  if (input.ranMiles > 0) parts.push(distance(input.ranMiles));
  if (input.prs.length) parts.push(input.prs.length === 1 ? `a PR (${input.prs[0].lift} ${input.prs[0].weight} × ${input.prs[0].reps})` : `${input.prs.length} PRs`);
  const happened = `Last week: ${parts.join(', ')}.`;

  /* 2. THE ONE THING THAT MATTERS, in priority order: a lift that keeps
     missing, running well short of the plan, hard sessions coming in slow,
     hard sessions faster than asked, a low-readiness week, or a clean week. */
  const missing = input.liftMisses.filter(item => item.misses >= 2)[0];
  const shortRun = input.plannedMiles > 0 && input.ranMiles < input.plannedMiles * WEEK_REVIEW_SHORT_SHARE;
  const priorShort = input.priorPlannedMiles > 0 && input.priorRanMiles < input.priorPlannedMiles * WEEK_REVIEW_SHORT_SHARE;
  const judged = input.verdicts.filter(item => item.outcome !== 'unmeasured');
  const slow = judged.filter(item => item.outcome === 'slower' || item.outcome === 'faded' || item.outcome === 'short');
  const fast = judged.filter(item => item.outcome === 'faster');
  const lowReadiness = input.readinessAvg !== null && input.readinessAvg < WEEK_REVIEW_READINESS_FLOOR;
  const underTrained = input.plannedDays > 0 && trained <= input.plannedDays - 2;

  let matters: string;
  let changes: string;
  const actions: RawAction[] = [];
  const nulls: RawAction = { type: '', dayName: null, minutes: null, noteKind: null, text: null, area: null, miles: null, days: null, percent: null, goalTitle: null, target: null, date: null, name: null, items: null };

  if (missing) {
    matters = `${missing.lift} came in under the ask ${missing.misses === 2 ? 'twice' : `${missing.misses} times`} running${missing.askedReps ? ` at ${missing.askedReps} reps` : ''}.`;
    const percent = Math.max(-10, Math.round((input.loadBiasPercent - 2.5) * 2) / 2);
    changes = `Loads come down 2.5% across the board so the wave is answered, not chased.`;
    actions.push({ ...nulls, type: 'set_load_bias', percent });
  } else if (shortRun && priorShort) {
    const target = Math.max(1, Math.round(input.ranMiles * 1.1 * 10) / 10);
    matters = `Two weeks running under the plan: ${distance(input.ranMiles)} of ${distance(input.plannedMiles)}, and ${distance(input.priorRanMiles)} of ${distance(input.priorPlannedMiles)} before that.`;
    changes = `The plan comes down to what you are actually running — ${distance(target)} a week — and builds from there.`;
    actions.push({ ...nulls, type: 'set_weekly_mileage', miles: target });
  } else if (shortRun) {
    matters = `${distance(input.ranMiles)} of the ${distance(input.plannedMiles)} the plan wanted.`;
    changes = 'This week stays where it was; the missed miles are not added on. A second short week changes the plan.';
  } else if (slow.length >= 2) {
    matters = `${slow.length} of ${judged.length} hard sessions came in under the asked pace.`;
    changes = 'The paces hold. If this week is the same, the plan eases them.';
  } else if (fast.length >= 2 && !slow.length) {
    matters = `${fast.length} hard sessions faster than asked.`;
    changes = 'The pace model moves up off that evidence — the next hard session asks for more.';
  } else if (lowReadiness) {
    matters = `Readiness averaged ${Math.round(input.readinessAvg!)} — under the ${WEEK_REVIEW_READINESS_FLOOR} floor for hard work.`;
    changes = 'Today is a rest day; the hard sessions wait for a number above the floor.';
    actions.push({ ...nulls, type: 'rest_today' });
  } else if (underTrained) {
    matters = `${trained} of ${input.plannedDays} split days trained.`;
    changes = 'Nothing changes yet. The split does not advance on days you miss, so the week picks up where it left off.';
  } else {
    matters = judged.length ? 'Every hard session was answered.' : 'The week went as planned.';
    changes = 'Nothing changes — the block continues.';
  }

  const lines = [happened, matters, changes, input.nextText ? `Next: ${input.nextText}` : ''].filter(Boolean);
  return {
    key: `week-review:${input.weekStartIso}`,
    kind: 'week-review',
    priority: 90,
    say: happened,
    detail: matters,
    lines,
    actions: actions.length ? actions : undefined,
    ask: `Review my week: ${happened} ${matters} What should change?`,
  };
}
