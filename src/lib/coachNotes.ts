/* THE COACH SPEAKS FIRST.

   "You said the crux is the AI coach, but Forge only answers when asked. It
   never says 'your threshold moved', 'you're behind on mileage', 'that's
   three weeks of missed long runs'. A coach that waits to be asked is a
   search box." Preston: "This is huge, implement this in the absolute best
   way."

   The best way is not a model writing observations. Everything below is a
   FACT the engine already computes — a judged session and the level it moved,
   a trend across three of them, this week's miles against the plan's, a lift
   that has come up short twice at its rung, a goal whose verdict changed
   since the athlete last saw it, a readiness score on a day the plan asks for
   hard work, easy runs run at tempo. The app has known every one of these for
   weeks and said them nowhere, or only on a screen nobody opens on the day
   they matter.

   THREE RULES, because a coach that nags is worse than one that is silent.

     One thing at a time. The notes are ranked and the card shows the top
     one; the rest wait their turn.

     Each thing once. Every note has a stable key — the session's date, the
     week it is about, the verdict it moved to — and once it has been seen it
     is never shown again. A fact does not become news twice.

     Nothing without a number. A note that cannot name the pace, the miles,
     the rung or the score is not a note; it is a mood. The sentences below
     all carry the figure they are about, so the athlete can disagree with it.

   This file is pure. What each note needs is handed in already computed, by
   the hook beside it, so the rules can be read and tested without a browser
   and the engines that produce the facts stay the single source of them. */

import type { VerdictOutcome, SessionTrend } from './sessionVerdict';
import type { LevelMove, Zone } from './progressionLevels';

export type CoachNoteKind = 'readiness' | 'trend' | 'goal-moved' | 'session' | 'week-miles' | 'week-closed' | 'lift-miss' | 'easy-too-fast';

export type CoachNote = {
  /* Stable across renders and days: what this note is ABOUT, so it is shown
     once. `session:2026-09-14`, `goal-moved:5K goal:reachable`. */
  key: string;
  kind: CoachNoteKind;
  /* Higher first. Time-sensitive beats retrospective; a change beats a state. */
  priority: number;
  /* The one line. Always carries its number. */
  say: string;
  /* An optional second line — the consequence, or the instruction. */
  detail?: string;
  /* What to hand the coach if the athlete taps "Ask Forge" on this note. */
  ask: string;
};

/* A judged hard session, as the coach needs it. */
export type NoteVerdict = {
  date: string;
  outcome: VerdictOutcome;
  /* The engine's own coach-voice sentence for this session, with the paces. */
  say: string;
  /* The prescription text, e.g. "3 × 1 mi @ 6:53/mi". */
  text: string;
};

export type WeekMiles = {
  /* The plan week the athlete is in. */
  startIso: string;
  planned: number;
  ran: number;
  daysLeft: number;
};

export type ClosedWeek = { startIso: string; planned: number; ran: number };

export type LiftMiss = { lift: string; misses: number; askedReps?: number };

export type GoalVerdictChange = { goal: string; from: string; to: string; say: string };

export type ReadinessToday = { score: number; hardSessionToday: string | null };

export type CoachNoteInput = {
  todayIso: string;
  verdicts: NoteVerdict[];
  levelMoves: LevelMove[];
  trend: SessionTrend | null;
  week: WeekMiles | null;
  closedWeek: ClosedWeek | null;
  liftMisses: LiftMiss[];
  goalChanges: GoalVerdictChange[];
  readiness: ReadinessToday | null;
  easyTooFast: { loggedPace: string; easyRange: string } | null;
};

/* A session is news for this many days. After that it is history, and the
   Plan tab is where history lives. */
export const SESSION_FRESH_DAYS = 3;
/* A week is "behind" when this much of it is left and no more than this share
   is run. Friday of a Monday-week at 60% done is worth a word; Tuesday at 20%
   is just Tuesday. */
export const WEEK_WARN_DAYS_LEFT = 3;
export const WEEK_WARN_SHARE = 0.6;
/* And a closed week is worth a word only if it fell short by a real margin. */
export const WEEK_SHORT_SHARE = 0.8;
/* Two consecutive misses at a rung is a pattern; one is a day. */
export const LIFT_MISS_MIN = 2;
/* Below this, hard work is the wrong call. Matches readiness.ts. */
export const READINESS_HARD_FLOOR = 58;

const ZONE_NAME: Record<Zone, string> = { threshold: 'Threshold', interval: 'Intervals', repetition: 'Reps', racepace: 'Race pace' };
const level = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const miles = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);
const verdictWord: Record<string, string> = { reachable: 'reachable', 'needs-more': 'needs more', 'out-of-reach': 'out of reach' };

export function coachNotes(input: CoachNoteInput): CoachNote[] {
  const notes: CoachNote[] = [];

  /* READINESS ON A HARD DAY. The most time-sensitive thing the coach can say,
     because it is about the next few hours. Only when the plan actually asks
     for hard work today — a low score on a rest day is not advice. */
  if (input.readiness && input.readiness.hardSessionToday && input.readiness.score < READINESS_HARD_FLOOR) {
    notes.push({
      key: `readiness:${input.todayIso}`,
      kind: 'readiness',
      priority: 100,
      say: `Readiness ${Math.round(input.readiness.score)} today. Make the ${input.readiness.hardSessionToday} an easy run.`,
      detail: 'Hard work on a low score buys nothing and costs the next session.',
      ask: `My readiness is ${Math.round(input.readiness.score)} and today is ${input.readiness.hardSessionToday}. What should I do instead?`,
    });
  }

  /* A TREND ACROSS SESSIONS outranks any one session: three in a row slower
     than asked is about the paces, not about a day. */
  if (input.trend && input.verdicts.length) {
    notes.push({
      key: `trend:${input.trend.kind}:${input.verdicts[0].date}`,
      kind: 'trend',
      priority: 95,
      say: input.trend.say,
      detail: input.trend.instruction,
      ask: input.trend.instruction,
    });
  }

  /* A GOAL WHOSE VERDICT MOVED since the athlete last saw it. Getting better
     is news; getting worse is news that needs acting on. */
  for (const change of input.goalChanges) {
    const improved = change.to === 'reachable' || (change.from === 'out-of-reach' && change.to === 'needs-more');
    notes.push({
      key: `goal-moved:${change.goal}:${change.to}`,
      kind: 'goal-moved',
      priority: improved ? 85 : 88,
      say: `${change.goal}: ${verdictWord[change.from] || change.from} → ${verdictWord[change.to] || change.to}.`,
      detail: change.say,
      ask: `My ${change.goal} just moved from ${verdictWord[change.from] || change.from} to ${verdictWord[change.to] || change.to}. Why, and what changes?`,
    });
  }

  /* THE LAST HARD SESSION, while it is still fresh, with the level it moved.
     The engine already wrote the sentence with the paces in it. */
  const latest = input.verdicts.find(verdict => verdict.outcome !== 'unmeasured');
  if (latest && daysBetween(latest.date, input.todayIso) <= SESSION_FRESH_DAYS && daysBetween(latest.date, input.todayIso) >= 0) {
    const move = input.levelMoves.find(item => item.date === latest.date && item.from !== item.to);
    notes.push({
      key: `session:${latest.date}`,
      kind: 'session',
      priority: 80,
      say: latest.say,
      detail: move ? `${ZONE_NAME[move.zone]} ${level(move.from)} → ${level(move.to)}.` : undefined,
      ask: `How did my last hard session (${latest.text}) go, and what does it change?`,
    });
  }

  /* THIS WEEK'S MILES AGAINST THE PLAN'S, when the week is nearly gone. */
  if (input.week && input.week.planned > 0 && input.week.daysLeft <= WEEK_WARN_DAYS_LEFT && input.week.daysLeft >= 0
    && input.week.ran <= input.week.planned * WEEK_WARN_SHARE) {
    const left = input.week.daysLeft;
    notes.push({
      key: `week-miles:${input.week.startIso}`,
      kind: 'week-miles',
      priority: 70,
      say: `${miles(input.week.ran)} of ${miles(input.week.planned)} mi this week, ${left === 0 ? 'no days' : left === 1 ? '1 day' : `${left} days`} left.`,
      detail: `${miles(Math.max(0, input.week.planned - input.week.ran))} mi short of the plan.`,
      ask: `I've run ${miles(input.week.ran)} of ${miles(input.week.planned)} miles this week with ${left} days left. Should I make it up or let it go?`,
    });
  }

  /* AND LAST WEEK, ONCE IT HAS CLOSED, if it came in short. A retrospective
     fact, told once, on the first day of the new week. */
  if (input.closedWeek && input.closedWeek.planned > 0 && input.closedWeek.ran < input.closedWeek.planned * WEEK_SHORT_SHARE) {
    notes.push({
      key: `week-closed:${input.closedWeek.startIso}`,
      kind: 'week-closed',
      priority: 60,
      say: `Last week: ${miles(input.closedWeek.ran)} of ${miles(input.closedWeek.planned)} mi.`,
      detail: 'The plan keeps this week where it was; the missed miles are not added on.',
      ask: `I ran ${miles(input.closedWeek.ran)} of ${miles(input.closedWeek.planned)} planned miles last week. Does the plan need to change?`,
    });
  }

  /* A LIFT THAT HAS COME UP SHORT TWICE AT ITS RUNG. The wave already holds
     the load in that case; saying so is what makes the held load read as a
     decision rather than a stall. */
  for (const miss of input.liftMisses) {
    if (miss.misses < LIFT_MISS_MIN) continue;
    const rung = miss.askedReps ? ` at ${miss.askedReps} reps` : '';
    notes.push({
      key: `lift-miss:${miss.lift}:${miss.misses}`,
      kind: 'lift-miss',
      priority: 65,
      say: `${miss.lift} has come in under the ask ${miss.misses === 2 ? 'twice' : `${miss.misses} times`} running${rung}.`,
      detail: 'The plan holds the load until it is answered.',
      ask: `${miss.lift} has missed the prescribed set ${miss.misses} times in a row${rung}. Is the load wrong, or am I?`,
    });
  }

  /* EASY RUNS RUN AT TEMPO — the commonest self-coaching error, said once a
     week rather than on every visit to the Plan tab. */
  if (input.easyTooFast && input.week) {
    notes.push({
      key: `easy-too-fast:${input.week.startIso}`,
      kind: 'easy-too-fast',
      priority: 50,
      say: `Your easy runs are averaging ${input.easyTooFast.loggedPace}/mi. Easy is ${input.easyTooFast.easyRange}/mi.`,
      detail: 'Running them harder costs the hard days, which is where the progress is.',
      ask: `My easy runs are averaging ${input.easyTooFast.loggedPace}/mi but easy is ${input.easyTooFast.easyRange}/mi. How much does it matter?`,
    });
  }

  return notes.sort((a, b) => b.priority - a.priority);
}

/* The one the card shows: the highest-ranked note the athlete has not seen. */
export const nextNote = (notes: CoachNote[], seen: Record<string, string>) =>
  notes.find(note => !seen[note.key]) || null;
