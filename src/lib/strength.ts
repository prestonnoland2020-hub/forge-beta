export function calculateEstimatedOneRepMax(weight: number, reps: number) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return null;
  if (reps === 1) return Math.round(weight);
  /* Epley is honest to about a dozen reps and fiction past that: 135 × 50
     "estimated" 360 and out-ranked a real 315 single as the athlete's best,
     then became the base the whole wave was written from. A high-rep set
     counts as the strongest thing it can prove — a twelve-rep set. */
  return Math.round(weight * (1 + Math.min(reps, 12) / 30));
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
  /* Pin the top to exactly count steps above the base so the five gridlines
     land on multiples of step rather than on an interpolated remainder. */
  return { min: niceMin, max: niceMin + count * step, step };
}
