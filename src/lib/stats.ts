import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import type { CardioLogDraft } from './cardioSession';
import { legacyCardioIntervals, cardioMiles, summarizeCardioDraft } from './cardioSession';
import { countsAsRunVolume } from './runQuality';

/* ONE PLACE THAT COUNTS THE ATHLETE'S RUNNING.

   There were four ways to add up a week of running and they disagreed on the
   same screen. The check-in counted every mileage session including a bike;
   the coach's "miles in the last 7 days" only read legacy interval lines and
   missed a structured session entirely; the goal card dropped any run with no
   time on it; the predictor kept its own list. So "I think I did more mileage
   than that" was right, and the number the coach quoted was wrong — and once
   one number is wrong the athlete stops believing the paces built on it.

   Everything below reads the log through ONE definition of a run, and every
   number the app or the coach states about running comes from here, with the
   runs behind it available as a receipt.

   A RUN is a line of logged cardio whose activity is running — not a walk,
   not a bike, row, ski or circuit — with a distance. A HYROX session's run
   legs count toward volume (they were run) but never as a single continuous
   run. A distance with no time still counts: not knowing how long it took
   does not mean it did not happen. A distance whose pace says it was walked
   does not. */

export type RunLine = {
  date: string;
  recordId: string;
  miles: number;
  /* 0 when untimed. */
  minutes: number;
  /* What the log called it — "Run", "Easy run · 5 mi", "HYROX". */
  label: string;
  /* A single continuous effort, as opposed to a repeat or a race leg. */
  continuous: boolean;
};

const NON_RUNNING = /row|bike|cycl|ski|elliptical|erg|wall ball|sled|burpee|circuit|swim|assault|stair|jump rope/i;
const WALK = /\bwalk/i;
const HYROX = /hyrox/i;
const RUNNING = /run|jog|hyrox/i;

const toMiles = (distance: number, unit: string) => {
  const normalized = unit.trim().toLowerCase();
  if (!(distance > 0)) return 0;
  if (normalized.startsWith('km') || normalized.includes('kilomet')) return distance / 1.609344;
  if (normalized.startsWith('meter') || normalized === 'm') return distance / 1609.344;
  if (normalized.startsWith('yard') || normalized === 'yd' || normalized === 'yds') return distance / 1760;
  if (normalized.startsWith('mile') || normalized === 'mi' || normalized === '') return distance;
  return 0;
};
const clockMinutes = (value: unknown) => {
  if (typeof value === 'number') return value;
  const text = String(value || '').trim();
  if (!text) return 0;
  if (text.includes(':')) { const parts = text.split(':').map(Number); return parts.length === 3 ? parts[0] * 60 + parts[1] + parts[2] / 60 : parts[0] + parts[1] / 60; }
  return Number(text) || 0;
};
const isRunActivity = (text: string) => RUNNING.test(text) && !WALK.test(text) && (!NON_RUNNING.test(text) || HYROX.test(text));

/* The run lines inside one logged cardio session. */
export function runLinesOf(session: CardioLogDraft, date: string, recordId: string): RunLine[] {
  const sessionLabel = `${session.activity || ''} ${session.summary || ''}`.trim();
  const legacy = legacyCardioIntervals(session);
  if (legacy.length) {
    return legacy.flatMap(line => {
      const activity = String(line.cardioType || line.activity || session.activity || '');
      if (!isRunActivity(activity)) return [];
      const unit = String(line.unit || line.distanceUnit || 'miles');
      const miles = toMiles(Number(line.distance) || 0, unit);
      const minutes = clockMinutes(line.time);
      /* A HYROX time covers the stations too, so its pace says nothing about
         whether the legs were run. The distance is the run legs; it counts. */
      const hyrox = HYROX.test(activity);
      if (!(miles > 0) || !countsAsRunVolume(miles, hyrox ? 0 : minutes * 60)) return [];
      return [{ date, recordId, miles, minutes, label: activity, continuous: !hyrox && legacy.length === 1 }];
    });
  }
  if (!isRunActivity(session.activity || '') && !isRunActivity(sessionLabel)) return [];
  if (session.structure === 'intervals') {
    return (session.intervalActuals || []).flatMap(rep => {
      if (!rep.completed) return [];
      const miles = Number(rep.distance) || 0;
      const minutes = clockMinutes(rep.time);
      if (!(miles > 0) || !countsAsRunVolume(miles, minutes * 60)) return [];
      return [{ date, recordId, miles, minutes, label: session.activity || 'Run', continuous: false }];
    });
  }
  const miles = cardioMiles(session);
  const minutes = summarizeCardioDraft(session).minutes;
  if (!(miles > 0) || !countsAsRunVolume(miles, minutes * 60)) return [];
  return [{ date, recordId, miles, minutes, label: session.summary || session.activity || 'Run', continuous: true }];
}

export function runLines(records: WorkoutRecord[]): RunLine[] {
  return records.flatMap(record => (record.cardioSessions || []).flatMap(session => runLinesOf(session, record.date, record.id)));
}

export const runMilesOfRecord = (record: WorkoutRecord) => round1(runLines([record]).reduce((sum, line) => sum + line.miles, 0));

/* Days in [fromIso, toIso], inclusive. */
export const runsBetween = (records: WorkoutRecord[], fromIso: string, toIso: string) =>
  runLines(records).filter(line => line.date >= fromIso && line.date <= toIso).sort((a, b) => a.date.localeCompare(b.date));
export const milesBetween = (records: WorkoutRecord[], fromIso: string, toIso: string) =>
  round1(runsBetween(records, fromIso, toIso).reduce((sum, line) => sum + line.miles, 0));

export const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/* The last seven days, today included — a week whoever you are. */
export const last7DayMiles = (records: WorkoutRecord[], todayIso: string) => milesBetween(records, addDays(todayIso, -6), todayIso);
export const last7DayRuns = (records: WorkoutRecord[], todayIso: string) => runsBetween(records, addDays(todayIso, -6), todayIso);

/* THE LONGEST SINGLE RUN in a window ending on `todayIso` (all time when the
   window is omitted). One continuous effort: repeats and HYROX legs never
   qualify, and a 6-mile walk is not a 6-mile run. */
export function longestRun(records: WorkoutRecord[], todayIso?: string, windowDays?: number): RunLine | null {
  const from = todayIso && windowDays ? addDays(todayIso, -(windowDays - 1)) : '';
  let best: RunLine | null = null;
  for (const line of runLines(records)) {
    if (!line.continuous) continue;
    if (from && (line.date < from || (todayIso && line.date > todayIso))) continue;
    if (!best || line.miles > best.miles) best = line;
  }
  return best;
}

/* Whether a day's biggest run was the longest in the last `windowDays`
   BEFORE it — "your longest run in a month" has to be true to be said. */
export function isLongestRunInWindow(record: WorkoutRecord, history: WorkoutRecord[], windowDays = 28): boolean {
  const today = longestRun([record]);
  if (!today) return false;
  const prior = history.filter(item => item.id !== record.id && item.date < record.date && item.date >= addDays(record.date, -windowDays));
  const before = longestRun(prior);
  return !before || today.miles > before.miles;
}

/* Strength: tonnage of a day's top sets. */
export const dayTonnage = (record: WorkoutRecord) => (record.topSets || []).reduce((total, set) => total + Number(set.weight || 0) * Number(set.reps || 0), 0);

export const round1 = (value: number) => Math.round(value * 10) / 10;

/* A receipt line the athlete can read: "Tue Sep 15 · 5.0 mi · Easy run". */
export const receiptLine = (line: RunLine, metric = false) => {
  const date = new Date(`${line.date}T12:00:00`);
  const when = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const distance = metric ? `${round1(line.miles * 1.609344)} km` : `${round1(line.miles)} mi`;
  const label = line.label.replace(/\s+/g, ' ').trim();
  return `${when} · ${distance}${label && !/^run$/i.test(label) ? ` · ${label.slice(0, 40)}` : ''}`;
};
