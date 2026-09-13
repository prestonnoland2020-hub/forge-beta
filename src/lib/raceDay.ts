import { reachableSeconds } from './goalFeasibility';

/* A TIME PREDICTED MID-BLOCK IS NOT A TIME PREDICTED ON RACE DAY.

   Forge printed one number and let it stand for both. It is read off runs the
   athlete did while tired, in the middle of a training week, on their own, and
   then shown against a goal that will be raced fresh, tapered, and with other
   people around — twelve weeks from now, after twelve more weeks of training.
   Those are different questions and they have different answers, and using the
   first as the second is how a card says "on track" about a goal the athlete
   is nowhere near, or "behind" about one they will comfortably beat.

   So there are two numbers now.

     WHAT YOU ARE WORTH TODAY — the curve, read straight. Falsifiable this
     weekend, which is what makes it worth printing.

     WHAT RACE DAY IS WORTH — today's number, improved by what the remaining
     weeks can honestly buy, and then by the taper.

   The second is given as a RANGE rather than a point, because the honest
   answer spans one: the slow end is today's fitness raced fresh (training from
   here adds nothing, which happens), and the fast end is the most those weeks
   can buy. Forge does not know where in that range the athlete will land, and
   a card that pretends otherwise is inventing the part that matters. */

/* What racing rested is worth over the same effort run mid-block, tired, and
   alone. Small, and real — and it needs a week to collect. */
export const TAPER_GAIN = 0.015;
export const TAPER_WEEKS_NEEDED = 1;

export type RaceDayOutlook = {
  /* Fastest the remaining weeks could honestly produce. */
  best: number;
  /* Today's fitness, raced fresh — the floor if training adds nothing. */
  likely: number;
  weeks: number;
  tapered: boolean;
};

export function raceDayOutlook(todaySeconds: number, weeks: number): RaceDayOutlook | null {
  if (!(todaySeconds > 0)) return null;
  const remaining = Math.max(0, weeks);
  const tapered = remaining >= TAPER_WEEKS_NEEDED;
  const taper = tapered ? 1 - TAPER_GAIN : 1;
  return {
    best: Math.round(reachableSeconds(todaySeconds, remaining) * taper),
    likely: Math.round(todaySeconds * taper),
    weeks: remaining,
    tapered,
  };
}
