/* A WORKOUT IN PROGRESS.

   Logging a set saves it to the day straight away, so a saved day alone does
   not mean the workout is over: the athlete may have stepped away mid-session.
   The day stays "in progress" from the first set logged until Finish, and
   remembers where to resume. Per device: it is the phone in the gym. */

const key = (date: string) => `forge-workout-open-${date}`;

export function markWorkoutOpen(date: string, resume: string) {
  try { localStorage.setItem(key(date), resume || '/workout'); } catch { /* per-device */ }
}

export function markWorkoutDone(date: string) {
  try { localStorage.removeItem(key(date)); } catch { /* per-device */ }
}

/* Where to resume, or null when the day is finished (or never started). */
export function openWorkout(date: string): string | null {
  try { return localStorage.getItem(key(date)); } catch { return null; }
}
