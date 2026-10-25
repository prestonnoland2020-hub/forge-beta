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
  /* SICK: every scheduled day is a rest day until the note's buffer ends or
     a check-in clears it. */
  sick: boolean;
  /* EASING BACK: the first days after being sick, or while tired — loads
     come down and the day is kept light, instead of the full week resuming
     the morning after a fever. */
  easing: boolean;
};

/* SICKNESS IS A FATIGUE NOTE WITH "SICK" AS ITS AREA. The notes table allows
   injury, fatigue and other, and being ill is a whole-body fatigue — so it is
   stored as one, named so this file can tell it from ordinary tiredness,
   without a migration on the live table. */
export const SICK_AREA = 'Sick';
export const isSickNote = (note: { kind: string; area?: string }) =>
  note.kind === 'fatigue' && (note.area || '').toLowerCase() === SICK_AREA.toLowerCase();
/* How long the plan stays light after the sickness ends. */
export const EASE_BACK_DAYS = 3;
const plusDays = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

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
  const sickNotes = notes.filter(isSickNote);
  const sick = sickNotes.some(note => note.status === 'active' && (!note.bufferUntil || note.bufferUntil >= todayIso));
  /* Easing covers the days after a sickness ended — by its buffer running
     out or by a check-in clearing it, which sets the buffer to that day — and
     any ordinary fatigue note still inside its buffer. */
  const recovering = !sick && sickNotes.some(note => {
    if (!note.bufferUntil) return false;
    /* A cleared note ends on the day it was cleared (its buffer is set to that day), so that day already eases. */
    const ended = note.status === 'cleared' ? note.bufferUntil <= todayIso : note.bufferUntil < todayIso;
    return ended && plusDays(note.bufferUntil, EASE_BACK_DAYS) >= todayIso;
  });
  const tired = notes.some(note => note.kind === 'fatigue' && !isSickNote(note) && note.status === 'active' && Boolean(note.bufferUntil) && note.bufferUntil! >= todayIso);
  return { areas, blockedMuscles, blocksRunning: areas.some(area => RUN_BLOCKING.test(area.toLowerCase())), sick, easing: recovering || tired };
}

/* An exercise is blocked when the muscle it is FOR is one the note protects.
   Judged on the primary muscle, so a note for the shoulder does not strike
   pull-ups (Back) for listing Shoulders third. */
export const exerciseBlocked = (exercise: { muscles: string[] }, state: BodyLogState) =>
  state.blockedMuscles.length > 0 && Boolean(exercise.muscles[0]) && state.blockedMuscles.includes(exercise.muscles[0]);

export const EMPTY_BODY_LOG: BodyLogState = { areas: [], blockedMuscles: [], blocksRunning: false, sick: false, easing: false };

/* WHAT BEING SICK MEANS FOR ONE DATE, for anything that draws days ahead —
   the Plan week. The same rule as bodyLogState, asked of a day instead of
   today: inside the sickness it is rest, the days after it are easier.
   A sickness with no end date is assumed to last as long as its buffer
   default, so the week does not show it ending tomorrow. */
export function sickDayStatus(notes: BodyLogNote[], iso: string): 'sick' | 'easing' | null {
  let easing = false;
  for (const note of notes) {
    if (!isSickNote(note) || !note.bufferUntil) continue;
    const end = note.bufferUntil;
    if (note.status === 'active' && iso <= end) return 'sick';
    const easeFrom = note.status === 'cleared' ? end : plusDays(end, 1);
    if (iso >= easeFrom && iso <= plusDays(end, EASE_BACK_DAYS)) easing = true;
  }
  return easing ? 'easing' : null;
}
