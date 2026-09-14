import { parsePrescription, type VerdictOutcome } from './sessionVerdict';

/* THE PLAN REMEMBERS HOW THE LAST ONE WENT.

   Forge could already read a hard session and say how it had gone —
   sessionVerdict parses the sentence back out of the card, compares it to the
   repeats that were logged, and returns on / faster / slower / faded / short.
   That is the richest signal a training app has, and it went to a display line
   and a "this block is asking too much" nudge. Nothing fed it back into what
   got prescribed next.

   So the plan had no memory. The threshold session opened at twelve minutes in
   week one for a 5:19 miler and for a twelve-minute miler alike, grew by a
   minute and a half a week regardless of whether any of them had gone in, and
   the only way it ever changed was the athlete regenerating the whole block.

   THE FIX IS TRAINERROAD'S, AND IT IS THE RIGHT ONE. Do not try to know the
   athlete's true fitness — a number you can only get from an all-out effort
   they rarely run and which their watch measures badly. Keep a LEVEL per kind
   of session instead, 1 to 10, and let execution move it. Finish a threshold
   session on pace and the threshold level rises, so the next one is longer.
   Fade in the last rep and it falls. The level is the dose ladder, so the
   ladder is the whole model: no separate difficulty rating, nothing to
   calibrate against a population.

   NOTHING IS STORED. The levels are derived from the verdict history on every
   read, the same way every other number in Forge is derived from the log. A
   stored level is a number that can rot while the log says otherwise, and a
   migration nobody remembers to write. */

export type Zone = 'threshold' | 'interval' | 'repetition' | 'racepace';
export type Levels = Record<Zone, number>;

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 10;

/* HOW FAR A SINGLE SESSION MOVES A LEVEL.

   Asymmetric on purpose. Coming in ahead of the prescribed pace is the
   strongest evidence there is that the block is pitched under the athlete, so
   it is worth a full level. Fading is worth more than simply being slow: a
   session held at pace and then lost is a dose problem, where a session run
   slow throughout is more often a pace problem, and the dose is what this
   ladder controls. A session logged without times moves nothing — there is
   nothing in it to read. */
export const LEVEL_STEP: Record<VerdictOutcome, number> = {
  faster: 1,
  on: 0.5,
  slower: -0.5,
  faded: -0.75,
  short: -0.5,
  unmeasured: 0,
};

/* AND NO ZONE MOVES MORE THAN A LEVEL A WEEK. Two good sessions in one week
   are a good week, not a new athlete, and a plan that leaps two levels off one
   of them is the ramp-rate mistake every injured runner has made. */
export const WEEKLY_CAP = 1;

/* A first block earns its way up rather than opening at whatever the week can
   afford: an athlete whose log holds no quality at all has shown nothing about
   how much of it they absorb. */
export const UNPROVEN_CEILING = 4;

/* THE LADDERS. Each is the dose of WORK at that zone's pace, warm-up and
   cool-down excluded, and each is a real progression somebody would write by
   hand: ten minutes of threshold to forty, four four-hundreds to six twelve
   hundreds. The gaps widen as the levels rise, because the difference between
   ten and twelve minutes is a difference and the difference between thirty-six
   and thirty-eight is not. */
export const THRESHOLD_MINUTES = [10, 12, 15, 18, 21, 25, 29, 33, 37, 42];
export const INTERVAL_METRES = [1600, 2000, 2400, 2800, 3200, 3600, 4000, 4400, 4800, 5200];
export const REPETITION_METRES = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2600];

/* AND A DOSE IS NOT A REP COUNT. Divide a total by a short rep and you get a
   number nobody writes on a card: 4800 m of VO2 work at 300 m a rep is
   sixteen repetitions, which is a track session from a different sport. The
   ladder says how much fast running; these say how it may be broken up. */
export const INTERVAL_REPS = { min: 3, max: 10 };
export const REPETITION_REPS = { min: 4, max: 10 };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const rung = (ladder: number[], level: number) => ladder[clamp(Math.round(level), LEVEL_MIN, LEVEL_MAX) - 1];

export const thresholdWorkMinutes = (level: number) => rung(THRESHOLD_MINUTES, level);
export const intervalWorkMetres = (level: number) => rung(INTERVAL_METRES, level);
export const repetitionWorkMetres = (level: number) => rung(REPETITION_METRES, level);

/* The highest rung the ladder offers that is still inside a number. */
const levelFor = (ladder: number[], affordable: number) => {
  for (let index = ladder.length - 1; index >= 0; index -= 1) if (ladder[index] <= affordable) return index + 1;
  return LEVEL_MIN;
};

export type SeedInput = {
  /* What the athlete runs in a week, and the share of it a hard session may
     take — the same budget the session sizing already respects. */
  weeklyMiles: number;
  qualityShare: number;
  warmupMiles: number;
  thresholdPaceSecondsPerMile: number;
  /* Whether their log holds any hard running at all. */
  provenQuality: boolean;
};

/* WHERE A NEW ATHLETE STARTS. Not at level one — level one is ten minutes of
   threshold, which for somebody running thirty miles a week is not a session,
   it is a warm-up. The opening level is the biggest dose their week can
   actually carry, which is the same question the sizing asked before and the
   only part of the old behaviour worth keeping. */
export function seedLevels(input: SeedInput): Levels {
  const { weeklyMiles, qualityShare, warmupMiles, thresholdPaceSecondsPerMile, provenQuality } = input;
  const budgetMiles = Math.max(0, weeklyMiles * qualityShare - warmupMiles);
  const ceiling = provenQuality ? LEVEL_MAX : UNPROVEN_CEILING;
  const affordableMinutes = thresholdPaceSecondsPerMile > 0 ? (budgetMiles * thresholdPaceSecondsPerMile) / 60 : 0;
  /* EVERY ZONE OPENS AT THE SAME LEVEL, read off the time the week can afford.
     Seeding each ladder from its own units looked more precise and was worse:
     a budget of three and a half miles is five and a half thousand metres,
     which is the top of the VO2 ladder and the top of the repetition one,
     for an athlete who has never done either. Time at intensity is the honest
     common currency, and the ladders diverge through execution — which is the
     whole point of having four of them. */
  const opening = clamp(levelFor(THRESHOLD_MINUTES, affordableMinutes), LEVEL_MIN, ceiling);
  return { threshold: opening, interval: opening, repetition: opening, racepace: opening };
}

const ZONE_OF: Record<string, Zone | undefined> = {
  threshold: 'threshold',
  intervals: 'interval',
  reps: 'repetition',
  racepace: 'racepace',
  /* A race is a date in the calendar, not a dose on a ladder. */
  test: undefined,
};

/* Which ladder a judged session belongs on, read from the card Forge wrote. */
export const zoneOfPrescription = (text: string | undefined | null): Zone | undefined => {
  const parsed = parsePrescription(text);
  return parsed ? ZONE_OF[parsed.kind] : undefined;
};

export type JudgedSession = { date: string; outcome: VerdictOutcome; text: string };
export type LevelMove = { zone: Zone; from: number; to: number; date: string; outcome: VerdictOutcome };

/* REPLAY THE BLOCK. Oldest session first, because a level is the athlete's
   history in order and applying it backwards would let last month decide what
   this week is worth. The weekly cap is applied per calendar week per zone, so
   a week holding two threshold sessions can move threshold by one level and no
   more. */
export function applyVerdicts(seed: Levels, sessions: JudgedSession[]): { levels: Levels; moves: LevelMove[] } {
  const levels: Levels = { ...seed };
  const moves: LevelMove[] = [];
  const movedThisWeek = new Map<string, number>();
  const weekOf = (iso: string) => {
    const date = new Date(`${iso}T12:00:00`);
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  };
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (const session of ordered) {
    const zone = zoneOfPrescription(session.text);
    if (!zone) continue;
    const step = LEVEL_STEP[session.outcome] ?? 0;
    if (!step) continue;
    const key = `${weekOf(session.date)}|${zone}`;
    const already = movedThisWeek.get(key) || 0;
    const room = WEEKLY_CAP - Math.abs(already);
    if (room <= 0) continue;
    const allowed = Math.sign(step) * Math.min(Math.abs(step), room);
    const from = levels[zone];
    const to = clamp(from + allowed, LEVEL_MIN, LEVEL_MAX);
    if (to === from) continue;
    levels[zone] = to;
    movedThisWeek.set(key, already + (to - from));
    moves.push({ zone, from, to, date: session.date, outcome: session.outcome });
  }
  return { levels, moves };
}

/* The whole model, in the order it is meant to be read: where the athlete's
   week says they start, then what their sessions have done to it. */
export function progressionLevels(seed: SeedInput, sessions: JudgedSession[]) {
  const start = seedLevels(seed);
  const { levels, moves } = applyVerdicts(start, sessions);
  return { start, levels, moves };
}

/* WHY THE SESSION IS THE SIZE IT IS, in one sentence, for the card. A level
   that moved for a reason the athlete can see is a level they will trust; a
   number that changed silently is the thing they screenshot and ask about. */
export function levelNote(zone: Zone, levels: Levels, moves: LevelMove[]): string {
  const last = [...moves].reverse().find(move => move.zone === zone);
  const name = zone === 'threshold' ? 'Threshold' : zone === 'interval' ? 'Interval'
    : zone === 'repetition' ? 'Repetition' : 'Race-pace';
  const level = Math.round(levels[zone] * 10) / 10;
  if (!last) return `${name} level ${level} — from what your week can carry, until a session says otherwise.`;
  const direction = last.to > last.from ? 'up' : 'down';
  const why = last.outcome === 'faster' ? 'you came in ahead of the pace'
    : last.outcome === 'on' ? 'you hit it as written'
      : last.outcome === 'faded' ? 'the last repeats came apart'
        : last.outcome === 'short' ? 'the session came in short'
          : 'it came in behind the pace';
  return `${name} level ${level}, ${direction} from ${Math.round(last.from * 10) / 10} because ${why} on ${last.date}.`;
}
