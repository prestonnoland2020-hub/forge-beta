import { cardioMiles, summarizeCardioDraft, type CardioLogDraft } from './cardioSession';

/* THE SAME RUN, LOGGED TWICE. Strava syncs the morning run at 7:05; at 7:40
   the athlete logs it by hand from the Today card, with the intervals the
   watch did not know about. Two sessions, one run — and every number that
   reads the log (7-day miles, weekly volume, the race predictor) doubled it.

   The import side already skips a watch activity the athlete has typed. This
   is the other direction: a typed session that lands on a day where the
   watch already put the same effort. Same class of activity, distance within
   five percent (or time within five percent when neither has a distance) —
   it is the same run. The typed one wins, because it carries what the athlete
   knew; it keeps the watch's id, so the next sync still sees it as imported. */

const classOf = (activity: string) => {
  const name = String(activity || '').toLowerCase();
  if (/bike|ride|cycl|spin/.test(name)) return 'bike';
  if (/row|erg/.test(name)) return 'row';
  if (/swim/.test(name)) return 'swim';
  if (/walk|hike/.test(name)) return 'walk';
  if (/ski/.test(name)) return 'ski';
  if (/run|jog|tempo|threshold|fartlek|interval|easy|long/.test(name)) return 'run';
  return 'other';
};
export const isImportedSession = (session: CardioLogDraft) => /^strava-/.test(String(session.id || ''));

export const SAME_EFFORT_TOLERANCE = 0.05;
const within = (a: number, b: number) => a > 0 && b > 0 && Math.abs(a - b) <= Math.max(a, b) * SAME_EFFORT_TOLERANCE;

export function sameEffort(a: CardioLogDraft, b: CardioLogDraft): boolean {
  if (classOf(a.activity) !== classOf(b.activity)) return false;
  const milesA = cardioMiles(a), milesB = cardioMiles(b);
  if (milesA > 0 || milesB > 0) return within(milesA, milesB);
  return within(summarizeCardioDraft(a).minutes, summarizeCardioDraft(b).minutes);
}

/* Merge an incoming typed session into a day's list: replace the imported
   twin if there is one, otherwise append. Returns the new list and whether a
   twin was replaced. */
export function mergeSession(existing: CardioLogDraft[], incoming: CardioLogDraft): { sessions: CardioLogDraft[]; matched: boolean } {
  if (isImportedSession(incoming)) return { sessions: [...existing, incoming], matched: false };
  const index = existing.findIndex(saved => isImportedSession(saved) && sameEffort(saved, incoming));
  if (index < 0) return { sessions: [...existing, incoming], matched: false };
  const sessions = [...existing];
  sessions[index] = { ...incoming, id: existing[index].id };
  return { sessions, matched: true };
}
