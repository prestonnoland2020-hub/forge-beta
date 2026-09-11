/* ONE CURVE, READ IN BOTH DIRECTIONS.

   Forge used Epley — weight × (1 + reps/30). Measured against real athletes
   it runs optimistic at the low-rep end of a long extrapolation: an all-out
   415 × 8 "estimated" 526, and the double the block wrote from it (495) was
   a weight the athlete could get one grinding rep with. Brzycki, the same
   family of formula with a flatter curve, called the same set 515 and lands
   a conversion of a rep or two much closer.

   It is capped at ten reps, which is exactly where Brzycki crosses Epley and
   starts climbing faster than any estimate deserves. Past ten, a set counts
   as the strongest thing it can prove — a ten-rep set.

   `repMaxCoefficient` is the whole formula. Everything that estimates a max
   multiplies by it and everything that prescribes a load divides by it, so
   the two can never drift: a set converted to a max and back is itself. */
export const REP_MAX_CAP = 10;
/* PRESCRIBING FURTHER OUT THAN CREDITING. Accessory lifts run a 12/10/8/6
   cycle, and a 12-rep prescription read through a ten-rep cap asks for the
   ten-rep bar — too heavy by a plate or two. The curve is extended to twelve
   for WRITING a load, while a LOGGED set is still credited no higher than the
   ten-rep cap above: asking for twelve is a choice the plan makes, whereas
   crediting a twelve as proof of a bigger max is the extrapolation the cap
   exists to refuse. It is the same curve either way — only the point at which
   it stops believing the reps differs. */
export const PRESCRIPTION_REP_CAP = 12;
export function repMaxCoefficient(reps: number, cap: number = REP_MAX_CAP): number {
  const capped = Math.min(Math.max(Math.round(reps), 1), cap);
  return capped === 1 ? 1 : 36 / (37 - capped);
}

export function calculateEstimatedOneRepMax(weight: number, reps: number) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return null;
  return Math.round(weight * repMaxCoefficient(reps));
}

/* The same curve backwards: what a given max is worth at a rep count. */
export function weightForReps(max: number, reps: number): number {
  return max / repMaxCoefficient(reps, PRESCRIPTION_REP_CAP);
}

/* Chart axes were labelled straight off the data range, which produced ticks
   like 451.5 and 470.5 on a barbell chart. Rounding the domain out to a "nice"
   step puts the gridlines on numbers a person would actually write down. */
export function niceAxis(min: number, max: number, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    const base = Number.isFinite(max) ? max : 1;
    return { min: base - count, max: base + count, step: 2 };
  }
  const rawStep = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;
  const niceMin = Math.floor(min / step) * step;
  /* THE TOP HAS TO REACH THE DATA. Pinning it to exactly `count` steps above a
     base that had been rounded DOWN could leave the ceiling below the highest
     point: niceAxis(405, 505) returned a top of 500, so a 505 lb PR was drawn
     above the last gridline and off the chart. Steps are added until the top
     covers the maximum — the gridlines still land on multiples of step, there
     is just sometimes one more of them. */
  const steps = Math.max(count, Math.ceil((max - niceMin) / step));
  return { min: niceMin, max: niceMin + steps * step, step };
}
