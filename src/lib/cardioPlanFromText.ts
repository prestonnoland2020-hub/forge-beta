/* "ON THE SPLIT, WHEN YOU ARE MAKING CUSTOM CARDIO FOR A DAY, CAN YOU PLEASE
   HAVE IT THE AI TEXT BOX THAT CREATES CARDIO FOR YOU?"

   The logger already has one: describe the session in a sentence and Forge
   reads it back as editable rows. The PLAN builder had nothing — a custom
   cardio day was a textarea called "Measurable planned target", which stores
   a sentence and measures nothing, so the plan could not be waved, paced or
   judged against anything.

   The same sentence reader serves both. What differs is the destination: the
   logger wants rows of what happened, the builder wants one structured
   prescription. So this maps the parser's rows onto a plan, and the mapping is
   deliberately conservative — three shapes only, and the athlete's own words
   are kept whenever the shape is not one of them:

     ONE ROW                  -> a steady session, with whichever of distance,
                                 duration and pace the sentence actually gave.
     THE SAME ROW N TIMES     -> intervals: N reps of that distance or time.
                                 "6 x 400m" parses as six identical rows.
     A REPEAT BLOCK WITH ODD  -> intervals, with the leading row as the warm-up
     ROWS AROUND IT              and the trailing row as the cooldown. This is
                                 what "1 mile warmup, 6x400m, 1 mile cooldown"
                                 is, and it is the commonest real session.
     ANYTHING ELSE            -> Custom, holding the sentence verbatim.

   Guessing a structure out of something that is not one of these would put
   numbers in the plan the athlete never said, and the plan is what the wave
   and the pace model read. Falling back to their own words is honest; an
   invented interval set is not. */

export type ParsedRow = { cardioType: string; distance: number; unit: string; timeMinutes: number };

export type PlanShape = {
  activity: string;
  structure: 'Steady' | 'Intervals' | 'Custom';
  distance?: string;
  distanceUnit?: string;
  duration?: string;
  pace?: string;
  repeats?: string;
  intervalBasis?: 'Distance' | 'Time';
  workDistance?: string;
  workUnit?: string;
  warmup?: string;
  cooldown?: string;
  customTarget?: string;
};

const TIME_UNITS = new Set(['minutes', 'seconds', 'min', 'sec']);
export const isTimeUnit = (unit: string) => TIME_UNITS.has(String(unit || '').trim().toLowerCase());

const round = (value: number, places = 2) => {
  const factor = 10 ** places;
  return String(Math.round(value * factor) / factor);
};

const clock = (minutes: number) => {
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const MILES: Record<string, number> = {
  miles: 1, mile: 1, mi: 1,
  km: 0.621371, kilometers: 0.621371, kilometres: 0.621371,
  meters: 1 / 1609.344, metres: 1 / 1609.344, m: 1 / 1609.344,
  yards: 1 / 1760, yds: 1 / 1760,
};
export const toMiles = (distance: number, unit: string) =>
  distance > 0 ? distance * (MILES[String(unit || '').trim().toLowerCase()] ?? 0) : 0;

/* Two rows are the same PIECE when the activity, the distance and the unit
   match. Times differ between reps of a real interval set and must not split
   the set into singles. */
const samePiece = (a: ParsedRow, b: ParsedRow) =>
  a.cardioType === b.cardioType && a.unit === b.unit && a.distance === b.distance;

/* "1 miles warmup" is the sort of thing that makes an app look like it was
   assembled rather than written. */
const measure = (value: string, unit: string) => `${value} ${value === '1' ? unit.replace(/s$/, '') : unit}`;
const asLeg = (row: ParsedRow) =>
  row.distance > 0 ? measure(round(row.distance), row.unit) : row.timeMinutes > 0 ? `${round(row.timeMinutes, 1)} min` : '';

export function planFromParsedRows(rows: ParsedRow[], sentence: string): PlanShape | null {
  const clean = rows.filter(row => row.cardioType && (row.distance > 0 || row.timeMinutes > 0));
  if (!clean.length) return null;
  const activity = clean[0].cardioType;
  const custom: PlanShape = { activity, structure: 'Custom', customTarget: sentence.trim() };

  if (clean.length === 1) {
    const [row] = clean;
    const miles = toMiles(row.distance, row.unit);
    const steady: PlanShape = { activity, structure: 'Steady' };
    if (row.distance > 0 && !isTimeUnit(row.unit)) { steady.distance = round(row.distance); steady.distanceUnit = row.unit; }
    if (row.timeMinutes > 0) steady.duration = round(row.timeMinutes, 1);
    /* A pace is only real when both halves of it were stated. */
    if (miles > 0 && row.timeMinutes > 0) steady.pace = `${clock(row.timeMinutes / miles)}/mi`;
    return steady;
  }

  /* The longest run of identical pieces is the work set. A session with no
     repeat at all is not an interval session. */
  let bestStart = 0; let bestLength = 1; let start = 0;
  for (let index = 1; index <= clean.length; index += 1) {
    if (index < clean.length && samePiece(clean[index], clean[start])) continue;
    if (index - start > bestLength) { bestLength = index - start; bestStart = start; }
    start = index;
  }
  if (bestLength < 2) return custom;

  const before = clean.slice(0, bestStart);
  const after = clean.slice(bestStart + bestLength);
  /* At most one leg either side, or the sentence is describing something this
     builder cannot hold — and the athlete's words say it better than a guess. */
  if (before.length > 1 || after.length > 1) return custom;

  const piece = clean[bestStart];
  const byTime = piece.distance <= 0 || isTimeUnit(piece.unit);
  const plan: PlanShape = {
    activity,
    structure: 'Intervals',
    repeats: String(bestLength),
    intervalBasis: byTime ? 'Time' : 'Distance',
    workDistance: byTime ? round(piece.timeMinutes * 60) : round(piece.distance),
    workUnit: byTime ? 'seconds' : piece.unit,
  };
  const warmup = before.length ? asLeg(before[0]) : '';
  const cooldown = after.length ? asLeg(after[0]) : '';
  if (warmup) plan.warmup = warmup;
  if (cooldown) plan.cooldown = cooldown;
  return plan;
}
