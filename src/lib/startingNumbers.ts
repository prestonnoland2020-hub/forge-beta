/* WHAT A NEW ATHLETE ALREADY KNOWS, BEFORE THEY HAVE LOGGED ANYTHING.

   A first-day athlete has no history, so every load in the app read "Find
   your weight" and every goal read "No data yet". Most lifters can say "about
   185 for 5" on the spot, and that is enough to write a first week from. Setup
   asks for it once and keeps it on the athlete's settings.

   It is NOT a workout. It is never written to history, never counts as a
   training day, and only speaks for a lift that has no logged set at all: the
   first real set of that lift replaces it everywhere at once, because
   bestsFromHistory checks for evidence before it ever looks here.

   Held at module level so the one pure function every surface already calls
   (bestsFromHistory) can read it without a new argument threaded through
   seven callers. ProfileSetupProvider keeps it in step with the setup. */
export type StartingNumber = { lift: string; weight: number; reps: number };

let current: StartingNumber[] = [];

export function setStartingNumbers(list: StartingNumber[] | undefined | null) {
  current = (list || []).filter(item => item && item.lift && item.weight > 0 && item.reps > 0);
}

export const startingNumbers = (): StartingNumber[] => current;
