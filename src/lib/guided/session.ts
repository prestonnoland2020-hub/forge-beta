/* FORGE GUIDED ↔ THE FORGE COACH.

   One coach, two places. The Ask Forge coach reads what Guided knows — her
   setup, the weights it has learned and the workout she is in right now —
   and the coach inside a Guided workout is the same forge-coach service, asked
   with that workout as its context. Guided workouts are also saved to the
   log, so everything the coach already reads from history covers them. */

export const GUIDED_KEYS = {
  prefs: 'forge-guided-prefs-v1',
  weights: 'forge-guided-weights-v1',
  last: 'forge-guided-last-v1',
  count: 'forge-guided-count-v1',
  live: 'forge-guided-live-v1',
};

export type LiveGuided = {
  focus: string;
  minutes: number;
  phase: string;
  move: string;
  set: number;
  sets: number;
  amount: string;
  weight: string | null;
  cue: string;
  moves: Array<{ name: string; sets: number; amount: string; weight: string | null }>;
  feelSoFar: Array<{ move: string; weight: string | null; feel: string }>;
  updatedAt: string;
};

const read = (store: Storage | undefined, key: string) => { try { const raw = store?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } };

export function writeLive(live: LiveGuided | null) {
  try { if (live) sessionStorage.setItem(GUIDED_KEYS.live, JSON.stringify(live)); else sessionStorage.removeItem(GUIDED_KEYS.live); } catch { /* private mode */ }
}

/* What the Ask Forge coach is told about Guided. Null when she has never
   used it, so it costs nothing in the coach's context. */
export function guidedCoachContext() {
  const local = typeof localStorage === 'undefined' ? undefined : localStorage;
  const session = typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  const prefs = read(local, GUIDED_KEYS.prefs);
  if (!prefs) return null;
  const live = read(session, GUIDED_KEYS.live) as LiveGuided | null;
  const fresh = live && Date.now() - new Date(live.updatedAt).getTime() < 3 * 60 * 60 * 1000 ? live : null;
  return {
    about: 'Forge Guided: the coach builds a beginner-friendly workout from a fixed move list and talks the athlete through it set by set. The athlete taps or says how each set felt (too easy / just right / too hard) and the next weight follows. Guided workouts are saved to the log with the title "Guided · <focus>".',
    setup: prefs,
    learnedWeights: read(local, GUIDED_KEYS.weights) || {},
    lastGuided: read(local, GUIDED_KEYS.last),
    guidedWorkoutsDone: read(local, GUIDED_KEYS.count) || 0,
    workoutInProgress: fresh,
  };
}
