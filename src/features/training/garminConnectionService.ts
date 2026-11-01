import { supabase } from '../../lib/supabase';
import type { DailyHealthSnapshot } from '../../lib/recoveryEngine';
import { normalizeWearableDay } from './wearableService';

export type GarminConnectionStatus = {
  connected: boolean;
  configured?: boolean;
  lastSyncedAt?: string;
  importedActivities?: number;
  healthDays?: number;
  /* Whether the walk back through the athlete's whole Garmin history has
     reached the end. Until it has, opening Forge carries it on. */
  historyComplete?: boolean;
  /* Garmin refuses past data to this program (it needs Garmin's historical
     data permission). New workouts still arrive by push. */
  historyBlocked?: boolean;
};

async function callGarmin(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('garmin-connect', { body: { action, ...extra } });
  if (error) throw new Error(error.message || 'The Garmin connection is unavailable.');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getGarminConnection(): Promise<GarminConnectionStatus> {
  return callGarmin('status');
}

/* The address registered in the Garmin portal. Garmin matches it exactly,
   so it is built the same way every time. */
export async function beginGarminConnection() {
  const redirectUri = `${window.location.origin}${window.location.pathname}?garmin=callback`;
  const data = await callGarmin('authorize', { redirectUri });
  if (!data?.url) throw new Error('Garmin did not return a connection page.');
  window.location.assign(data.url);
}

export async function finishGarminConnection(code: string, state: string) {
  return callGarmin('callback', { code, state });
}

export async function syncGarmin() {
  return callGarmin('sync');
}

export async function disconnectGarmin() {
  return callGarmin('disconnect');
}

type SnapshotRow = {
  snapshot_date: string; sleep_minutes: number | null; sleep_efficiency: number | null; hrv_rmssd: number | null;
  resting_hr: number | null; respiratory_rate: number | null; steps: number | null; active_calories: number | null; source_updated_at: string;
};
const value = (n: number | null) => n === null ? undefined : Number(n);

/* What Garmin has pushed, as the snapshots the recovery engine reads. The
   last 60 days: enough for the baselines, small enough to keep on device. */
export async function loadGarminHealth(): Promise<DailyHealthSnapshot[]> {
  const since = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('health_daily_snapshots')
    .select('snapshot_date,sleep_minutes,sleep_efficiency,hrv_rmssd,resting_hr,respiratory_rate,steps,active_calories,source_updated_at')
    .eq('provider', 'garmin')
    .gte('snapshot_date', since)
    .order('snapshot_date', { ascending: true });
  if (error || !data) return [];
  return (data as SnapshotRow[]).map(row => normalizeWearableDay('Garmin', {
    date: row.snapshot_date,
    sleepMinutes: value(row.sleep_minutes),
    sleepEfficiency: value(row.sleep_efficiency),
    hrvRmssd: value(row.hrv_rmssd),
    restingHr: value(row.resting_hr),
    respiratoryRate: value(row.respiratory_rate),
    steps: value(row.steps),
    activeCalories: value(row.active_calories),
    sourceUpdatedAt: row.source_updated_at,
  }));
}
