import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';

export type ActivityConnectionStatus = {
  connected: boolean;
  athleteName?: string;
  lastSyncedAt?: string;
  importedActivities?: number;
  configured?: boolean;
};

async function callStrava(action: string, extra: Record<string, unknown> = {}) {
  /* The preview build has no server; it would only log a failed request. */
  if (isDemoMode) throw new Error('Connections are off in the preview.');
  const { data, error } = await supabase.functions.invoke('strava-connect', { body: { action, ...extra } });
  if (error) throw new Error(error.message || 'The activity connection is unavailable.');
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getActivityConnection(): Promise<ActivityConnectionStatus> {
  return callStrava('status');
}

export async function beginStravaConnection() {
  const redirectUri = `${window.location.origin}${window.location.pathname}?strava=callback`;
  const data = await callStrava('authorize', { redirectUri });
  if (!data?.url) throw new Error('Strava did not return a connection page.');
  window.location.assign(data.url);
}

export async function finishStravaConnection(code: string, state: string) {
  return callStrava('callback', { code, state });
}

export async function syncStravaActivities() {
  return callStrava('sync');
}

export async function disconnectStrava() {
  return callStrava('disconnect');
}
