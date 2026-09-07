import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';

/* WORK THE ATHLETE ALREADY DID DOES NOT GET PRESCRIBED AGAIN.

   Forge places a quality session on a named split day. Preston's Chest & Back
   day carries 6 × 400 m — and he ran it on the Sunday, a day early, because
   that is when he had the track. On Monday the card offered him 6 × 400 m,
   with the six repeats sitting in his log one day back.

   The naive detector — "was there an interval-looking run recently" — is the
   one to avoid. A Strava import auto-laps a steady run into mile splits, and
   that reads as five identical repeats; suppressing a workout because a device
   chopped up an easy run would be a worse bug than the one being fixed.

   So this never asks "did they do intervals". It asks whether they did THIS
   session: the repeat distance Forge was about to prescribe has to appear,
   at that distance, about that many times, in a single logged session inside
   the window. A mile-lapped easy run does not match a 400 m prescription, and
   nothing is suppressed unless the evidence is specifically the prescribed
   work. */

const METERS_PER_MILE = 1609.344;
const toMeters = (distance: number, unit: string) => {
  const value = Number(distance);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const key = String(unit || '').toLowerCase();
  if (key.startsWith('meter')) return value;
  if (key.startsWith('yard')) return value * 0.9144;
  if (key.startsWith('kilometer') || key === 'km') return value * 1000;
  if (key.startsWith('mile')) return value * METERS_PER_MILE;
  return 0;
};

/* "6 x 400 meters", "6x400m", "4 × 800m" — and the plan's own structured
   fields when it has them. Returns null when the session is not repeat work,
   which is the common case and means nothing is suppressed. */
export function repeatShape(session: { title?: string; summary?: string; plan?: Record<string, unknown> } | null | undefined) {
  if (!session) return null;
  const plan = (session.plan || {}) as Record<string, unknown>;
  const repeats = Number(plan.repeats);
  const distance = Number(plan.workDistance);
  const unit = String(plan.workUnit || plan.distanceUnit || '');
  const planned = toMeters(distance, unit);
  if (repeats >= 2 && planned > 0) return { repeats: Math.round(repeats), meters: planned };

  const text = `${session.title || ''} ${session.summary || ''}`;
  const match = text.match(/(\d{1,2})\s*[x×]\s*(\d{2,5}(?:\.\d+)?)\s*(m\b|meters?|yd\b|yards?|k?m\b|miles?|mi\b)/i);
  if (!match) return null;
  const meters = toMeters(Number(match[2]), /^m(\b|eters?)/i.test(match[3]) ? 'meters' : match[3]);
  if (!meters) return null;
  return { repeats: Number(match[1]), meters };
}

/* Rows inside one logged cardio session, in metres. */
const sessionRows = (session: { prescription?: Record<string, unknown> }) => {
  const rows = (session.prescription || {}).legacyIntervals;
  return (Array.isArray(rows) ? rows : []).map(row => {
    const entry = row as Record<string, unknown>;
    return toMeters(Number(entry.distance), String(entry.unit || ''));
  }).filter(meters => meters > 0);
};

/* A repeat counts as the same effort within 8% — a 400 m track repeat logged
   off a watch lands at 398 or 412, and a 400 is never confused with an 800. */
const SAME_REPEAT = 0.08;

export type AlreadyDone = { date: string; matched: number; meters: number };

export function findCompletedRepeats(
  records: WorkoutRecord[], shape: { repeats: number; meters: number },
  today: string, withinDays = 3,
): AlreadyDone | null {
  if (!shape || shape.repeats < 2 || shape.meters <= 0) return null;
  const todayTime = new Date(`${today}T12:00:00`).getTime();
  /* Two thirds of the prescription, and never fewer than two repeats: an
     athlete who cut a 6 × 400 to four still did the session, and two matching
     repeats is the floor at which this stops being a coincidence. */
  const needed = Math.max(2, Math.ceil(shape.repeats * (2 / 3)));

  for (const record of records) {
    const age = Math.round((todayTime - new Date(`${record.date}T12:00:00`).getTime()) / 86400000);
    if (age < 0 || age > withinDays) continue;
    for (const session of record.cardioSessions || []) {
      const matched = sessionRows(session).filter(meters =>
        Math.abs(meters - shape.meters) / shape.meters <= SAME_REPEAT).length;
      if (matched >= needed) return { date: record.date, matched, meters: shape.meters };
    }
  }
  return null;
}
