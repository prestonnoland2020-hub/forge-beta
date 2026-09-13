import { localDayIso } from './time';

/* ONE ANSWER TO "HOW MUCH DO YOU RUN A WEEK".

   There were four, and they disagreed with each other on the same screen.

     The race predictor took the last 28 days and divided by four.
     The goal card took the MEDIAN of the last eight complete weeks.
     The planner took the last SEVEN DAYS, so a deload week told it the
       athlete runs half what they run.
     The cardio engine took 28 days divided by four — anchored on the date of
       the most recent run rather than on today, so someone who stopped running
       a month ago still showed their old volume forever.

   That is not four implementations of one idea, it is four different
   quantities, and the athlete sees them side by side: "you are running 0 miles
   a week" on a goal card, over a plan budgeting from eight.

   THE DEFINITION. Miles run per week, averaged over the four COMPLETE weeks
   before this one.

   Complete weeks, because a part-finished week is not a week: measured on a
   Tuesday it reports a third of the truth and reads as a collapse in fitness.
   Four of them, because one is noise and eight reaches back past a training
   block. A mean rather than a median, because a median of four is the middle
   pair anyway and a mean says what actually happened — a big week counts, a
   missed week counts against, and both are true things about the athlete.

   And when nothing complete has any running in it — a first week, or a return
   from a long layoff — what this week holds so far stands as a floor. It is
   not scaled up to a projected week: claiming someone runs 21 miles a week
   because they ran three on Monday is how a plan gets built on a fiction. */

export type DatedMiles = { date: string; miles: number };

export const VOLUME_WEEKS = 4;
const DAY = 86_400_000;

const mondayOf = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** Weekly running miles, from anything that can say a date and a distance. */
export function weeklyMilesFrom(runs: DatedMiles[], todayIso = localDayIso()): number {
  if (!runs.length) return 0;
  const thisMonday = mondayOf(todayIso);
  const start = new Date(`${thisMonday}T12:00:00`).getTime() - VOLUME_WEEKS * 7 * DAY;
  const firstComplete = new Date(start);
  const from = `${firstComplete.getFullYear()}-${String(firstComplete.getMonth() + 1).padStart(2, '0')}-${String(firstComplete.getDate()).padStart(2, '0')}`;

  const buckets = new Array<number>(VOLUME_WEEKS).fill(0);
  let thisWeek = 0;
  for (const run of runs) {
    if (!(run.miles > 0) || !run.date) continue;
    if (run.date >= thisMonday) { if (run.date <= todayIso) thisWeek += run.miles; continue; }
    if (run.date < from) continue;
    const index = Math.floor((new Date(`${run.date}T12:00:00`).getTime() - start) / (7 * DAY));
    if (index >= 0 && index < VOLUME_WEEKS) buckets[index] += run.miles;
  }
  /* THE WEEKS BEFORE THEY STARTED ARE NOT WEEKS THEY RAN NOTHING. An athlete
     two weeks into using Forge has two empty buckets in a four-week window,
     and averaging those in halves their mileage — so the floor that is meant
     to stop the plan prescribing under them did the least for exactly the
     athletes who are new. Leading empty weeks are dropped. An off week INSIDE
     their training still counts, because that is part of what they do. */
  const first = buckets.findIndex(miles => miles > 0);
  if (first >= 0) {
    const counted = buckets.slice(first);
    return counted.reduce((sum, miles) => sum + miles, 0) / counted.length;
  }
  /* Nothing in the last four finished weeks: what is on the board this week is
     the only honest thing to say, and it is a floor, never an extrapolation. */
  return thisWeek;
}
