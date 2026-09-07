/* WHAT "PROGRESS" MEANS WHEN TWO PEOPLE COMPARE TRAINING.

   The partner screen used to report a trend as `last − first`: the most recent
   week minus the oldest one in the window. Two arbitrary weeks decided the
   number, so Preston's six-month "trend" on pace read +12:12 /mi — his
   twenty-minute walk this Monday against a run back in March. One bad endpoint
   and the figure is worse than nothing, because it looks authoritative.

   Two ideas replace it.

   A fitted slope uses every week, so one outlier moves it a little instead of
   deciding it. And progress is expressed as a PERCENTAGE of where that athlete
   started, which is the only comparison between two people at different levels
   that either of them can win: an athlete adding 5 lb to a 500 lb squat and one
   adding 5 lb to a 150 lb squat are not doing the same work, and the ratio says
   so. It is also what makes the chart honest — both lines start at zero. */

export type Series = Array<number | null>;

/* THEIL-SEN, NOT LEAST SQUARES.

   Least squares was the obvious choice and it failed on the real data: it
   gives the points at the ends of the window the most leverage, and the point
   on the end of Preston's window was a twenty-minute mile. Fitting his six
   months still reported six minutes per mile of decline, which is the same lie
   the old code told, arrived at more slowly.

   Theil-Sen takes the median of the slopes between every pair of weeks. A
   walk, a downhill mile, a missed lift — any single week can only move the
   median by one place, so the estimate follows what the athlete usually does.
   It costs O(n squared) on at most 104 weeks, which is nothing. */
/* `at` is where each value sits on the week axis. It matters because the
   series only carries the weeks SOMEBODY logged: Adam weighed in twelve times
   across six months, so his twelve readings sat at positions 0..11 and a
   change measured over them came out over "eleven weeks" rather than the
   twenty-five he actually lived. Any gap in either athlete's logging inflated
   every per-week number on the screen. Given real week offsets the slope is
   per real week; without them it falls back to position, which is right only
   when nothing is missing. */
export function slopePerWeek(values: Series, at?: number[]): number | null {
  const points = values.map((value, index) => ({ index: at?.[index] ?? index, value })).filter((p): p is { index: number; value: number } => p.value !== null);
  if (points.length < 3) return null;
  const slopes: number[] = [];
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const run = points[b].index - points[a].index;
      if (run > 0) slopes.push((points[b].value - points[a].value) / run);
    }
  }
  if (!slopes.length) return null;
  slopes.sort((x, y) => x - y);
  const middle = slopes.length >> 1;
  return slopes.length % 2 ? slopes[middle] : (slopes[middle - 1] + slopes[middle]) / 2;
}

/* The fitted change from the first logged week to the last, which is what the
   athlete actually lived through — not the slope of one week. */
export function fittedChange(values: Series, at?: number[]): number | null {
  const slope = slopePerWeek(values, at);
  if (slope === null) return null;
  const logged = values.map((value, index) => ({ index: at?.[index] ?? index, value })).filter(p => p.value !== null);
  const span = logged[logged.length - 1].index - logged[0].index;
  return span > 0 ? slope * span : null;
}

/* THE BEST THAT IS ACTUALLY REPEATABLE.

   A single week can be a fluke — one lucky set, one downhill mile. The best
   here is the second-best week once there are enough of them, which throws out
   exactly one outlier and nothing more. With three weeks or fewer it is simply
   the best, because there is not enough to call anything an outlier. */
export function repeatableBest(values: Series, lowerIsBetter: boolean): number | null {
  const logged = values.filter((value): value is number => value !== null);
  if (!logged.length) return null;
  const sorted = [...logged].sort((a, b) => lowerIsBetter ? a - b : b - a);
  return sorted.length > 3 ? sorted[1] : sorted[0];
}

/* Each athlete against their OWN starting point, in percent. Pace is inverted
   so that "better" is always up: getting a minute quicker per mile is
   progress, and a chart where one metric runs backwards is a chart people
   misread. Baseline is the first logged week; weeks before it are null so the
   line starts where the athlete's evidence starts, not at a fabricated zero. */
export function indexToStart(values: Series, lowerIsBetter: boolean): Series {
  const firstIndex = values.findIndex(value => value !== null && value !== 0);
  if (firstIndex < 0) return values.map(() => null);
  const baseline = values[firstIndex] as number;
  return values.map((value, index) => {
    if (value === null || index < firstIndex) return null;
    const change = ((value - baseline) / Math.abs(baseline)) * 100;
    return Math.round((lowerIsBetter ? -change : change) * 10) / 10;
  });
}

/* Who is ahead on a head-to-head row, and by how much of the pair's total —
   used for the width of the two halves of the bar. A pair of zeroes splits
   evenly rather than dividing by nothing. */
export function share(mine: number, theirs: number): { mine: number; theirs: number } {
  const total = mine + theirs;
  if (!Number.isFinite(total) || total <= 0) return { mine: 0.5, theirs: 0.5 };
  return { mine: mine / total, theirs: theirs / total };
}
