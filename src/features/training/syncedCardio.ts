import type { WorkoutRecord } from './WorkoutHistoryProvider';

/* A session that came from a watch or Strava: its id is the provider and the
   activity's own id (garmin-25014074883, strava-20870666141). */
export const SYNCED_SESSION = /^(garmin|strava|garmin-export)-/;

/* A WATCH RUN IS NEVER LOST TO A SAVE THAT DID NOT KNOW ABOUT IT.

   A day is saved whole. Any screen holding a copy of the day from before a
   Garmin run synced — the logger, a set edit, the synced-day card — wrote that
   copy back without the run. This puts back every synced session the stored
   day has and the save left out, unless the save names it as deleted on
   purpose. Used by WorkoutHistoryProvider.updateRecord, the one place every
   save passes through; the server keeps the same rule
   (migrations/20261108230000_keep_synced_cardio). */
export function keepSyncedSessions<T extends Partial<WorkoutRecord>>(stored: Pick<WorkoutRecord, 'cardioSessions'>, draft: T, removedCardioIds: string[] = []): T {
  const removed = new Set(removedCardioIds.map(String));
  const incoming = draft.cardioSessions || [];
  const have = new Set(incoming.map(session => String(session.id || '')));
  const kept = (stored.cardioSessions || []).filter(session => SYNCED_SESSION.test(String(session.id || '')) && !have.has(String(session.id)) && !removed.has(String(session.id)));
  if (!kept.length) return draft;
  return { ...draft, cardioSessions: [...incoming, ...kept], hasCardio: true, muscles: Array.from(new Set([...(draft.muscles || []), 'Cardio'])) };
}
