/* A WATCH ACTIVITY AS A FORGE CARDIO SESSION — the server's copy of
   externalToSession in src/features/training/stravaImportService.ts.

   The app turns synced activities into training-log entries, but only when
   it is opened: Adam's 20-mile run reached Forge from his Garmin at 10:54 and
   sat outside his log — and off his partners' screens — until he next opened
   the app. The webhook now writes a run straight into the log when the day is
   otherwise empty, using this mapping so the entry is exactly what the app
   would have made (same id, same summary, same watch numbers), and the app's
   own import then recognises it and leaves it alone.

   Keep the two in step: the ids (`garmin-<id>`), the activity names, the
   summary text and `recorded` must match the app's. */

const METERS_PER_MILE = 1609.344;
const typeMap: Record<string, string> = {
  Run: 'Run', TrailRun: 'Trail Run', VirtualRun: 'Run', Treadmill: 'Run',
  Ride: 'Bike', VirtualRide: 'Bike', GravelRide: 'Bike', MountainBikeRide: 'Bike', EBikeRide: 'Bike',
  Swim: 'Swimming', Walk: 'Walk', Hike: 'Hike', Rowing: 'Rowing', VirtualRow: 'Rowing',
  Elliptical: 'Elliptical', StairStepper: 'Stair Climber', WeightTraining: 'Weight Training',
  Workout: 'Workout', Yoga: 'Yoga', Crossfit: 'CrossFit', NordicSki: 'Nordic Ski', AlpineSki: 'Ski',
};
const activityName = (type: string) => typeMap[type] || type.replace(/([a-z])([A-Z])/g, '$1 $2');
const distanceSport = (activity: string) => !/weight training|workout|yoga|crossfit|pilates|strength/i.test(activity);
const paceText = (minutes: number, miles: number) => { const pace = minutes / miles; const whole = Math.floor(pace); const seconds = Math.round((pace - whole) * 60); return `${whole}:${String(seconds === 60 ? 0 : seconds).padStart(2, '0')} /mi`; };
const clock = (minutes: number) => { const whole = Math.round(minutes * 60); const m = Math.floor(whole / 60); const s = whole % 60; return `${m}:${String(s).padStart(2, '0')}`; };

export type ActivityRow = {
  provider: string; external_id: string; activity_type: string; activity_name?: string | null;
  started_at: string; distance_meters: number | null; moving_seconds: number | null; elapsed_seconds: number | null;
  average_heartrate: number | null; max_heartrate: number | null; raw_summary?: { start_date_local?: string } | null;
};

/* Only distance sports go in from the server. A lift on a day the athlete
   logs by hand is the app's to merge (it knows the sets); a run is the case
   that goes missing. */
export function serverSession(row: ActivityRow): { date: string; title: string; session: Record<string, unknown> } | null {
  const garmin = row.provider === 'garmin' || row.provider === 'garmin-export';
  const source = garmin ? 'Garmin' : 'Strava';
  const activity = activityName(row.activity_type);
  if (!distanceSport(activity) || !(row.distance_meters && row.distance_meters > 0)) return null;
  const localStart = row.raw_summary?.start_date_local || row.started_at;
  const date = String(localStart).slice(0, 10);
  const miles = Math.round((row.distance_meters / METERS_PER_MILE) * 100) / 100;
  const minutes = Math.round(((row.moving_seconds || row.elapsed_seconds || 0) / 60) * 10) / 10;
  const summary = `${activity} · ${miles} mi · ${clock(minutes)}${minutes ? ` · ${paceText(minutes, miles)}` : ''}`;
  return {
    date,
    title: row.activity_name || activity,
    session: {
      id: `${garmin ? 'garmin' : 'strava'}-${row.external_id}`,
      structure: 'steady', activity, summary,
      prescription: { legacyIntervals: [{ cardioType: activity, unit: 'miles', distance: miles, time: minutes }], distanceUnit: 'miles', note: row.activity_name && row.activity_name !== activity ? `${source}: ${row.activity_name}` : `Imported from ${source}` },
      recorded: {
        source, externalId: String(row.external_id),
        ...(minutes > 0 ? { minutes } : {}), ...(miles > 0 ? { miles } : {}),
        ...(row.average_heartrate ? { averageHr: Math.round(row.average_heartrate) } : {}),
        ...(row.max_heartrate ? { maxHr: Math.round(row.max_heartrate) } : {}),
      },
    },
  };
}
