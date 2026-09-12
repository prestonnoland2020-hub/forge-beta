import { readinessFromCheckIn, strugglingStreak, STRUGGLING_RUN, type CheckIn } from './readiness';
import type { SessionTrend } from './sessionVerdict';

/* IS THE BLOCK WORKING?

   Forge has always been able to tell an athlete what to do today. It could
   never tell them the thing a coach actually earns their keep on: that the
   block itself is wrong and should be reshaped. Every signal needed was
   already being collected and none of them were being read together.

   Three rough mornings out of five is not a bad week, it is a block asking for
   more than the athlete is absorbing. A lift that has been backed off is the
   same message in a different language. And the opposite case matters just as
   much and is never said out loud: an athlete sailing through every session
   with a goal they are not on track for is being under-asked, and politely
   letting that continue is a failure of coaching, not kindness.

   What comes out of this is a sentence and a standing instruction — the exact
   text handed to the plan rebuild, so "the coach thinks this needs reshaping"
   and "rebuild my plan" are one action rather than two the athlete has to
   connect themselves. */

export const COMFORTABLE_READINESS = 80;
export const COMFORTABLE_RUN = 3;

export type PressureInput = {
  checkIns: CheckIn[];
  /* Goal lifts that have been backed off after repeated misses. */
  backedOffLifts: string[];
  /* Sessions the plan asked for and the athlete did not do, in the last
     fortnight. */
  missedSessions: number;
  /* Whether any goal is currently not on track. */
  goalsBehind: boolean;
  /* What the athlete's last few hard sessions actually did, compared to what
     they were asked to do. The one signal Forge never used to have. */
  sessions?: SessionTrend | null;
};

export type PlanPressure = {
  verdict: 'too-much' | 'too-little';
  /* One sentence, in the coach's voice, naming the evidence. */
  say: string;
  /* The change offered, in plain words. */
  offer: string;
  /* The standing instruction handed to the rebuild, written as the athlete
     would write it, because that is what the planner reads. */
  instruction: string;
};

const list = (items: string[]) =>
  items.length <= 1 ? items[0] || '' : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

export function planPressure(input: PressureInput): PlanPressure | null {
  const { checkIns, backedOffLifts, missedSessions, goalsBehind, sessions } = input;
  const rough = strugglingStreak(checkIns);

  /* THE SESSIONS THEMSELVES SPEAK FIRST. How an athlete feels is a report and
     how they show up is a habit; what they actually ran against what they were
     asked to run is a measurement, and it is the one that says whether the
     prescription — the thing Forge is responsible for — is right. Three hard
     sessions coming in short is not an athlete having a bad fortnight, it is
     the paces being wrong, and it should be said that way round. */
  if (sessions?.kind === 'asking-too-much') {
    return {
      verdict: 'too-much',
      say: sessions.say,
      offer: 'Reset the target paces to what you have been running and rebuild from there.',
      instruction: sessions.instruction,
    };
  }

  /* TOO MUCH comes first. Being under-trained costs an athlete a result;
     being over-trained costs them the season, so when both readings are
     available the cautious one is the one that speaks. */
  if (rough >= STRUGGLING_RUN) {
    return {
      verdict: 'too-much',
      say: `You have had ${rough} rough mornings out of your last five check-ins. That is the block asking for more than you are absorbing, not a bad week.`,
      offer: 'Reshape the block with less weekly load and an earlier easy week.',
      instruction: 'I am not recovering between sessions. Cut weekly running volume by about 15%, move the next easy week forward, and keep the hard run to one a week.',
    };
  }
  if (backedOffLifts.length) {
    return {
      verdict: 'too-much',
      say: `${list(backedOffLifts)} ${backedOffLifts.length === 1 ? 'has' : 'have'} been backed off after repeated misses. The loads are ahead of where you are.`,
      offer: 'Rebuild the strength side from what you are actually completing.',
      instruction: `Reset ${list(backedOffLifts)} to the loads I have actually been completing and build from there. Add a week before the next max attempt.`,
    };
  }
  if (missedSessions >= 3) {
    return {
      verdict: 'too-much',
      say: `${missedSessions} prescribed sessions went unlogged in the last two weeks. A plan nobody can fit into their week is not a plan.`,
      offer: 'Rebuild it around the days you actually train.',
      instruction: 'I am missing sessions because the week is too full. Rebuild the block around fewer training days without changing the goal date.',
    };
  }

  /* TOO LITTLE. Only said when the athlete is comfortably absorbing the work
     AND a goal is not on track — comfort on its own is fine, and an athlete
     who is on track should be left alone. */
  const recent = [...checkIns].sort((a, b) => b.date.localeCompare(a.date)).slice(0, COMFORTABLE_RUN);
  const comfortable = recent.length >= COMFORTABLE_RUN && recent.every(item => readinessFromCheckIn(item) >= COMFORTABLE_READINESS);
  /* Beating every prescription is evidence on its own and does not need the
     athlete to be behind a goal as well: a block pitched under someone is
     wasting their weeks whether or not the deadline has noticed yet. */
  if (sessions?.kind === 'paces-stale' && !missedSessions) {
    return {
      verdict: 'too-little',
      say: sessions.say,
      offer: 'Re-test your fitness and rebuild the paces from what you can actually run.',
      instruction: sessions.instruction,
    };
  }
  if (comfortable && goalsBehind && !missedSessions) {
    return {
      verdict: 'too-little',
      say: 'You have come through your last three check-ins fresh and you are not on track for your goal. There is room to ask for more.',
      offer: 'Add volume to the block, inside your own ceiling.',
      instruction: 'I am recovering well and want more work. Raise weekly running volume toward my ceiling and add a second quality session every other week.',
    };
  }
  return null;
}
