/* WHAT A BODY-LOG NOTE MEANS FOR A PRESCRIPTION. "My knee hurts" in the
   coach made a note that only the coach's prompt and a Home banner could
   see; Today still asked for squats. This is the one place that turns an
   area into the muscles that load it, and into whether running is off, so
   the daily engine and the block can both read it. Deterministic: the area
   names are the ones athleteNotesService extracts. */

export type BodyLogNote = { area?: string; kind: 'injury' | 'fatigue' | 'other'; status: 'active' | 'cleared'; bufferUntil?: string };

export type BodyLogState = {
  /* Areas with an active buffer today. */
  areas: string[];
  /* Primary muscles no prescription should load. */
  blockedMuscles: string[];
  /* Whether running is off (lower leg, foot, hip, back). */
  blocksRunning: boolean;
};

const LOWER = ['Quads', 'Hamstrings', 'Glutes', 'Calves'];
const AREA_MUSCLES: Array<[RegExp, string[]]> = [
  [/knee|quad|hamstring|glute|hip|groin|it band/, LOWER],
  [/calf|shin|achilles|ankle|foot/, ['Calves', 'Quads', 'Hamstrings', 'Glutes']],
  [/lower back/, ['Back', 'Hamstrings', 'Glutes']],
  [/upper back|\bback\b|neck/, ['Back', 'Shoulders']],
  [/shoulder|rotator cuff|chest/, ['Shoulders', 'Chest', 'Triceps']],
  [/elbow|forearm|wrist|hand|bicep|tricep/, ['Biceps', 'Triceps', 'Forearms', 'Chest', 'Shoulders']],
];
const RUN_BLOCKING = /knee|calf|shin|achilles|ankle|foot|hip|groin|it band|hamstring|lower back|quad/;

export const musclesForArea = (area: string): string[] => {
  const text = area.toLowerCase();
  for (const [pattern, muscles] of AREA_MUSCLES) if (pattern.test(text)) return muscles;
  return [];
};

export function bodyLogState(notes: BodyLogNote[], todayIso: string): BodyLogState {
  const active = notes.filter(note => note.status === 'active' && note.kind === 'injury' && note.area && (!note.bufferUntil || note.bufferUntil >= todayIso));
  const areas = Array.from(new Set(active.map(note => String(note.area))));
  const blockedMuscles = Array.from(new Set(areas.flatMap(musclesForArea)));
  return { areas, blockedMuscles, blocksRunning: areas.some(area => RUN_BLOCKING.test(area.toLowerCase())) };
}

/* An exercise is blocked when the muscle it is FOR is one the note protects.
   Judged on the primary muscle, so a note for the shoulder does not strike
   pull-ups (Back) for listing Shoulders third. */
export const exerciseBlocked = (exercise: { muscles: string[] }, state: BodyLogState) =>
  state.blockedMuscles.length > 0 && Boolean(exercise.muscles[0]) && state.blockedMuscles.includes(exercise.muscles[0]);

export const EMPTY_BODY_LOG: BodyLogState = { areas: [], blockedMuscles: [], blocksRunning: false };
