import { supabase } from '../../lib/supabase';
import type { CardioLogDraft } from '../../lib/cardioSession';
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
const queueStravaReviews = (sessionIds: string[]) => { if (!sessionIds.length) return; try { localStorage.setItem(reviewKey, JSON.stringify(Array.from(new Set([...pendingStravaReviews(), ...sessionIds])).slice(-12))); } catch { /* fine */ } window.dispatchEvent(new Event('forge-strava-review-changed')); };
export const runShapedActivity = (activity: string) => !/bike|ride|swim|row|elliptical|stair|ski|weight|yoga|workout|crossfit/i.test(activity);

/* THE HAND LOG WINS. A run recorded in the app and the same run recorded by
   the watch are one session, not two — but they never look alike: Forge names
   a run by its role ("Easy", "Base", "Speed Run", "Long Run") and Strava names
   it by its sport ("Run", "Trail Run"), so nothing matches on the name and the
   day ended up with the run counted twice in every mileage total. Compare by
   what kind of training it is instead: one hand-logged run on a date means
   every Strava run on that date is the same work, already logged. Nothing else
   is touched — a Strava ride on the day of a hand-logged run is a real second
   session and stays. */
export const cardioClass = (activity: string): string => {
  const name = String(activity || '').toLowerCase();
  if (/run|easy|base|tempo|threshold|speed|jog|interval|fartlek/.test(name)) return 'run';
  if (/walk|hike/.test(name)) return 'walk';
  if (/bike|ride|cycl/.test(name)) return 'bike';
  if (/row/.test(name)) return 'row';
  if (/swim/.test(name)) return 'swim';
  if (/weight|strength|lift/.test(name)) return 'strength';
  return 'other';
};
const handLoggedClasses = (records: WorkoutRecord[]): Map<string, Set<string>> => {
  const byDate = new Map<string, Set<string>>();
  for (const record of records) {
    for (const session of record.cardioSessions || []) {
      /* Imported sessions carry a strava- id; anything else the athlete typed. */
      if (String(session.id || '').startsWith('strava-')) continue;
      const classes = byDate.get(record.date) || new Set<string>();
      classes.add(cardioClass(session.activity || ''));
      byDate.set(record.date, classes);
    }
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
  const alreadyLogged = handLoggedClasses(records);
  const byDate = new Map<string, { sessions: CardioLogDraft[]; rowIds: string[]; titles: string[] }>();
  let skipped = 0;
  /* Superseded rows are marked imported like any other, so a day the athlete
     logged by hand is settled once and never re-offered on the next sync. */
  const supersededRowIds: string[] = [];
  for (const row of rows) {
    const mapped = externalToSession(row);
    if (existingIds.has(mapped.session.id as string) || row.imported_to_workout) { skipped++; continue; }
    if (alreadyLogged.get(mapped.date)?.has(cardioClass(mapped.session.activity || ''))) { skipped++; supersededRowIds.push(row.id); continue; }
    const entry = byDate.get(mapped.date) || { sessions: [], rowIds: [], titles: [] };
    entry.sessions.push(mapped.session); entry.rowIds.push(row.id); entry.titles.push(row.activity_name || mapped.session.activity);
    byDate.set(mapped.date, entry);
  }
  let imported = 0; const importedRowIds: string[] = []; const reviewIds: string[] = [];
  const reviewCutoff = new Date(); reviewCutoff.setDate(reviewCutoff.getDate() - 3);
  const reviewCutoffIso = reviewCutoff.toISOString().slice(0, 10);
  for (const [date, entry] of byDate) {
    const result = addRecord({
      date,
      title: entry.titles[0] || 'Imported activity',
      muscles: ['Cardio'],
      hasCardio: true,
      cardioSessions: entry.sessions,
    } as Omit<WorkoutRecord, 'id'>);
    if (result.ok) {
      imported += entry.sessions.length; importedRowIds.push(...entry.rowIds);
      if (date >= reviewCutoffIso) reviewIds.push(...entry.sessions.filter(session => runShapedActivity(session.activity || '')).map(session => String(session.id)));
    }
  }
  queueStravaReviews(reviewIds);
  /* .in() takes a URL-length-bounded list, so a full history's worth of ids
     has to be marked in batches — one oversized request would fail and leave
     every row looking un-imported. */
  const settledRowIds = [...importedRowIds, ...supersededRowIds];
  for (let start = 0; start < settledRowIds.length; start += 200) {
    try { await supabase.from('external_activities').update({ imported_to_workout: true }).in('id', settledRowIds.slice(start, start + 200)); } catch { /* dedupe covers it */ }
  }
  return { imported, skipped };
}
