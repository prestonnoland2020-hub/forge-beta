import { supabase } from '../../lib/supabase';
import { cardioMiles, type CardioLogDraft } from '../../lib/cardioSession';
import type { WorkoutRecord } from './WorkoutHistoryProvider';

/* Bridge: synced Strava activities (external_activities) become real training
   days in the log — merged into existing days, deduped by external id, so a
   watch-recorded run counts everywhere a hand-logged one does. */

type ExternalRow = {
  id: string; external_id: string; activity_type: string; activity_name: string;
  started_at: string; distance_meters: number | null; moving_seconds: number | null;
  elapsed_seconds: number | null; average_heartrate: number | null;
  /* The athlete's local clock, pulled out of the payload by the query instead
     of dragging every raw Strava blob across the wire — a full history is
     thousands of rows and the blobs alone would be tens of megabytes. */
  local_start: string | null; raw_summary?: { start_date_local?: string } | null;
  imported_to_workout: boolean | null;
};

const METERS_PER_MILE = 1609.344;
/* Review queue: freshly imported activities surface on Today with an AI box
   so the athlete can turn a flat device summary ("3 mi @ 9:00") into what
   actually happened ("6×300 at :37 with walking rests"). */
const reviewKey = 'forge-strava-review-v1';
export const pendingStravaReviews = (): string[] => { try { const list = JSON.parse(localStorage.getItem(reviewKey) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };
export const markStravaReviewed = (sessionId: string) => { try { localStorage.setItem(reviewKey, JSON.stringify(pendingStravaReviews().filter(id => id !== sessionId))); } catch { /* fine */ } window.dispatchEvent(new Event('forge-strava-review-changed')); };
/* A SYNCED LIFT IS HALF A RECORD. Strava knows the athlete was in the gym for
   54 minutes; it does not know which split day that was or what they lifted —
   and those are the two facts Forge's whole program runs on. So a strength
   activity queues its DATE for a one-tap follow-up: pick the day, add the top
   set, done. Keyed by date rather than session id because a strength import
   creates no cardio session to hang an id on. */
const strengthKey = 'forge-strava-strength-review-v1';
export const pendingStrengthReviews = (): string[] => { try { const list = JSON.parse(localStorage.getItem(strengthKey) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };
export const markStrengthReviewed = (date: string) => { try { localStorage.setItem(strengthKey, JSON.stringify(pendingStrengthReviews().filter(item => item !== date))); } catch { /* fine */ } window.dispatchEvent(new Event('forge-strava-review-changed')); };
const queueStrengthReviews = (dates: string[]) => { if (!dates.length) return; try { localStorage.setItem(strengthKey, JSON.stringify(Array.from(new Set([...pendingStrengthReviews(), ...dates])).slice(-12))); } catch { /* fine */ } window.dispatchEvent(new Event('forge-strava-review-changed')); };
const queueStravaReviews = (sessionIds: string[]) => { if (!sessionIds.length) return; try { localStorage.setItem(reviewKey, JSON.stringify(Array.from(new Set([...pendingStravaReviews(), ...sessionIds])).slice(-12))); } catch { /* fine */ } window.dispatchEvent(new Event('forge-strava-review-changed')); };
export const runShapedActivity = (activity: string) => !/bike|ride|swim|row|elliptical|stair|ski|weight|yoga|workout|crossfit/i.test(activity);

/* THE HAND LOG WINS THE DISTANCE IT COVERS. A run typed into Forge and the
   same run recorded by the watch are one session, not two — but they never
   look alike: Forge names a run by its role ("Easy", "Base", "Speed Run") and
   Strava names it by its sport ("Run", "Trail Run"), so nothing matched and
   the day counted the run twice in every mileage total.

   Presence alone was too blunt a test. On a day with four separate Strava
   runs and one combined "Easy + Speed Run · 3 mi" entry, that single entry
   suppressed all four — and across one athlete's history it hid 28.5 miles
   the watch was the only witness to. So the hand log supersedes the watch for
   the distance it actually accounts for: if the day's typed running covers
   what Strava recorded, the watch copy is a duplicate and goes; if the watch
   recorded materially more, the typed entry is an incomplete record of that
   day and the Strava runs stay.

   A class with no distance to compare (a lifting session) still goes on
   presence, and a Strava ride on the day of a hand-logged run was never
   touched — it is a real second session. */
const COVERAGE_TOLERANCE_MILES = 0.5;
const classOfPart = (part: string): string => {
  const name = part.toLowerCase();
  /* THE SPORT IS DECIDED BEFORE THE INTENSITY. Forge's run names are mostly
     intensity words — "Easy", "Base", "Tempo" — but those words attach to any
     sport, and checking them first classified "Easy Bike" as a run. The
     consequence was not cosmetic: the dedupe then treated a genuine Strava
     RUN that day as already logged, marked it settled, and the miles were
     gone for good. A named sport always wins; intensity only decides when no
     sport is named, where an unqualified "Easy" means an easy run. */
  if (/bike|ride|cycl|spin/.test(name)) return 'bike';
  if (/row|erg/.test(name)) return 'row';
  if (/swim/.test(name)) return 'swim';
  if (/walk|hike/.test(name)) return 'walk';
  if (/weight|strength|lift/.test(name)) return 'strength';
  if (/elliptical/.test(name)) return 'elliptical';
  if (/stair|step/.test(name)) return 'stairs';
  if (/ski/.test(name)) return 'ski';
  if (/run|jog|tempo|threshold|fartlek|interval|speed|easy|base|long/.test(name)) return 'run';
  return 'other';
};

/* ONE ENTRY CAN HOLD MORE THAN ONE SESSION. Athletes write "Walk + Easy" for
   a walk and an easy run, and "Row + Wall Balls + Assault Bike" for a
   circuit. Forcing a single class onto those names decides wrongly whichever
   way it is ordered — as a run it swallowed a real Strava walk, as a walk it
   swallowed a real Strava run. The plus sign separates sessions, so each part
   is classified on its own and the entry covers all of them. An adjective and
   a noun with no plus ("Easy Bike") is still one session. */
export const cardioClasses = (activity: string): Set<string> =>
  new Set(String(activity || '').split('+').map(part => part.trim()).filter(Boolean).map(classOfPart));

/* The entry's leading class, for callers that need exactly one. */
export const cardioClass = (activity: string): string =>
  classOfPart(String(activity || '').split('+')[0] || '');
type DayCoverage = { classes: Set<string>; miles: Map<string, number> };
const handLoggedCoverage = (records: WorkoutRecord[]): Map<string, DayCoverage> => {
  const byDate = new Map<string, DayCoverage>();
  for (const record of records) {
    for (const session of record.cardioSessions || []) {
      /* Imported sessions carry a strava- id; anything else the athlete typed. */
      if (String(session.id || '').startsWith('strava-')) continue;
      const day = byDate.get(record.date) || { classes: new Set<string>(), miles: new Map<string, number>() };
      const classes = [...cardioClasses(session.activity || '')];
      const miles = cardioMiles(session);
      classes.forEach(name => day.classes.add(name));
      /* A combined entry's distance is not split between its parts — Forge
         does not know how much of "Walk + Easy" was the run. Crediting the
         whole distance to each part is the generous reading, and generous is
         the right direction here: it errs toward trusting what the athlete
         typed, which is the rule they asked for. */
      if (miles > 0) classes.forEach(name => day.miles.set(name, (day.miles.get(name) || 0) + miles));
      byDate.set(record.date, day);
    }
  }
  return byDate;
};
/* What the watch recorded per class per day, so coverage can be compared. */
const stravaMilesByDay = (rows: ExternalRow[]): Map<string, Map<string, number>> => {
  const byDate = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const mapped = externalToSession(row);
    const miles = cardioMiles(mapped.session);
    if (!(miles > 0)) continue;
    const day = byDate.get(mapped.date) || new Map<string, number>();
    const name = cardioClass(mapped.session.activity || '');
    day.set(name, (day.get(name) || 0) + miles);
    byDate.set(mapped.date, day);
  }
  return byDate;
};
/* Strava sport types → Forge activity names. Unknown types pass through with
   spaces ("TrailRun" → "Trail Run") so nothing is dropped. */
const typeMap: Record<string, string> = {
  Run: 'Run', TrailRun: 'Trail Run', VirtualRun: 'Run', Treadmill: 'Run',
  Ride: 'Bike', VirtualRide: 'Bike', GravelRide: 'Bike', MountainBikeRide: 'Bike', EBikeRide: 'Bike',
  Swim: 'Swimming', Walk: 'Walk', Hike: 'Hike', Rowing: 'Rowing', VirtualRow: 'Rowing',
  Elliptical: 'Elliptical', StairStepper: 'Stair Climber', WeightTraining: 'Weight Training',
  Workout: 'Workout', Yoga: 'Yoga', Crossfit: 'CrossFit', NordicSki: 'Nordic Ski', AlpineSki: 'Ski',
};
const activityName = (type: string) => typeMap[type] || type.replace(/([a-z])([A-Z])/g, '$1 $2');
/* Distance sports get miles; everything else imports as duration only. */
const distanceSport = (activity: string) => !/weight training|workout|yoga|crossfit|pilates|strength/i.test(activity);
const paceText = (minutes: number, miles: number) => { const pace = minutes / miles; const whole = Math.floor(pace); const seconds = Math.round((pace - whole) * 60); return `${whole}:${String(seconds === 60 ? 0 : seconds).padStart(2, '0')} /mi`; };
const clock = (minutes: number) => { const whole = Math.round(minutes * 60); const m = Math.floor(whole / 60); const s = whole % 60; return `${m}:${String(s).padStart(2, '0')}`; };

export function externalToSession(row: ExternalRow): { date: string; session: CardioLogDraft } {
  const localStart = row.local_start || row.raw_summary?.start_date_local || row.started_at;
  const date = String(localStart).slice(0, 10);
  const activity = activityName(row.activity_type);
  const miles = distanceSport(activity) && row.distance_meters ? Math.round((row.distance_meters / METERS_PER_MILE) * 100) / 100 : 0;
  const minutes = Math.round(((row.moving_seconds || row.elapsed_seconds || 0) / 60) * 10) / 10;
  const summary = miles
    ? `${activity} · ${miles} mi · ${clock(minutes)}${minutes ? ` · ${paceText(minutes, miles)}` : ''}`
    : `${activity} · ${Math.round(minutes)} min`;
  return {
    date,
    session: {
      id: `strava-${row.external_id}`,
      structure: 'steady',
      activity,
      summary,
      prescription: { legacyIntervals: [{ cardioType: activity, unit: 'miles', distance: miles, time: minutes }], distanceUnit: 'miles', note: row.activity_name && row.activity_name !== activity ? `Strava: ${row.activity_name}` : 'Imported from Strava' },
    } as CardioLogDraft,
  };
}

export async function importStravaActivities(
  records: WorkoutRecord[],
  addRecord: (record: Omit<WorkoutRecord, 'id'>) => { ok: boolean },
): Promise<{ imported: number; skipped: number }> {
  /* A CEILING IS NOT A SYNC EITHER. This read used to stop at the newest 400
     rows, and because it always asked for the SAME newest 400, an athlete with
     a full Strava history could never reach anything older: every pass
     re-fetched rows already imported, skipped them, and finished. Page the
     whole table oldest-to-newest so a complete history lands in the log. */
  const columns = 'id,external_id,activity_type,activity_name,started_at,distance_meters,moving_seconds,elapsed_seconds,average_heartrate,imported_to_workout,local_start:raw_summary->>start_date_local';
  const rows: ExternalRow[] = [];
  const pageSize = 500;
  for (let page = 0; page < 40; page++) {
    const { data, error } = await supabase
      .from('external_activities')
      .select(columns)
      .eq('provider', 'strava')
      .order('started_at', { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error) return { imported: 0, skipped: 0 };
    if (!data || !data.length) break;
    rows.push(...(data as unknown as ExternalRow[]));
    if (data.length < pageSize) break;
  }
  if (!rows.length) return { imported: 0, skipped: 0 };
  const existingIds = new Set(records.flatMap(record => (record.cardioSessions || []).map(session => String(session.id || ''))));
  const handLogged = handLoggedCoverage(records);
  const watchMiles = stravaMilesByDay(rows);
  const byDate = new Map<string, { sessions: CardioLogDraft[]; rowIds: string[]; titles: string[]; strength: boolean }>();
  let skipped = 0;
  /* Superseded rows are marked imported like any other, so a day the athlete
     logged by hand is settled once and never re-offered on the next sync. */
  const supersededRowIds: string[] = [];
  for (const row of rows) {
    const mapped = externalToSession(row);
    if (existingIds.has(mapped.session.id as string) || row.imported_to_workout) { skipped++; continue; }
    /* Superseded only when the athlete's own entry covers this class for the
       day. A lifting session has no distance to compare, so presence decides;
       running is judged on miles. */
    const group = cardioClass(mapped.session.activity || '');
    const day = handLogged.get(mapped.date);
    if (day?.classes.has(group)) {
      const watched = watchMiles.get(mapped.date)?.get(group) || 0;
      const typed = day.miles.get(group) || 0;
      const covered = watched === 0 || typed + COVERAGE_TOLERANCE_MILES >= watched;
      if (covered) { skipped++; supersededRowIds.push(row.id); continue; }
    }
    const entry = byDate.get(mapped.date) || { sessions: [], rowIds: [], titles: [], strength: false };
    /* A LIFT IS NOT CARDIO. Strava reports a gym session as WeightTraining,
       and importing every activity as a cardio session made "Weight Training"
       the athlete's most-logged cardio type — 139 barbell sessions filed under
       running and rowing, skewing every cardio insight. A strength activity
       still marks the day as trained, but it is not a cardio session and the
       day does not become a cardio day because of it. */
    if (group !== 'strength') entry.sessions.push(mapped.session); else entry.strength = true;
    entry.rowIds.push(row.id); entry.titles.push(row.activity_name || mapped.session.activity);
    byDate.set(mapped.date, entry);
  }
  let imported = 0; const importedRowIds: string[] = []; const reviewIds: string[] = []; const strengthDates: string[] = [];
  const reviewCutoff = new Date(); reviewCutoff.setDate(reviewCutoff.getDate() - 3);
  const reviewCutoffIso = reviewCutoff.toISOString().slice(0, 10);
  for (const [date, entry] of byDate) {
    const hasCardio = entry.sessions.length > 0;
    const result = addRecord({
      date,
      title: entry.titles[0] || 'Imported activity',
      /* Only a real cardio session earns the Cardio marker. */
      muscles: hasCardio ? ['Cardio'] : [],
      hasCardio,
      cardioSessions: entry.sessions,
    } as Omit<WorkoutRecord, 'id'>);
    if (result.ok) {
      imported += entry.sessions.length; importedRowIds.push(...entry.rowIds);
      if (date >= reviewCutoffIso) {
        reviewIds.push(...entry.sessions.filter(session => runShapedActivity(session.activity || '')).map(session => String(session.id)));
        /* Ask about a gym session only while it is fresh enough to remember. */
        if (entry.strength) strengthDates.push(date);
      }
    }
  }
  queueStravaReviews(reviewIds);
  queueStrengthReviews(strengthDates);
  /* .in() takes a URL-length-bounded list, so a full history's worth of ids
     has to be marked in batches — one oversized request would fail and leave
     every row looking un-imported. */
  const settledRowIds = [...importedRowIds, ...supersededRowIds];
  for (let start = 0; start < settledRowIds.length; start += 200) {
    try { await supabase.from('external_activities').update({ imported_to_workout: true }).in('id', settledRowIds.slice(start, start + 200)); } catch { /* dedupe covers it */ }
  }
  return { imported, skipped };
}
