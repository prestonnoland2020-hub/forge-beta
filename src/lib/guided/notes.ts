/* ONE LINE PER MOVE IN THE LOG'S NOTES, TRUE TO WHAT WAS DONE.
   The line used to take the reps from the FIRST set and the weight from the
   LAST, so "20 lb × 8, then 20 lb × 10" was written "2×8 @ 20 lb", and
   "45, 35, 45" read as three sets at 45. The coach reads these notes. When
   every set matched it stays short ("3×10 @ 45 lb"); otherwise each set is
   listed ("20×8, 20×10 lb"). */
export type NoteSet = { reps: number; weight: number | null; timed?: boolean };
export function moveNote(name: string, sets: NoteSet[], unit: string): string {
  if (!sets.length) return name;
  const reps = (set: NoteSet) => set.timed ? `${set.reps}s` : `${set.reps}`;
  const first = sets[0];
  const same = sets.every(set => set.reps === first.reps && set.weight === first.weight);
  if (same) return `${name} ${sets.length}×${reps(first)}${first.weight !== null ? ` @ ${first.weight} ${unit}` : ''}`;
  if (sets.every(set => set.weight === null)) return `${name} ${sets.map(reps).join(', ')}`;
  return `${name} ${sets.map(set => set.weight !== null ? `${set.weight}×${reps(set)}` : reps(set)).join(', ')} ${unit}`;
}
