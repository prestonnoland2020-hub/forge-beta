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

/* THE BODYWEIGHT MOVES, READ BACK OUT OF THE NOTES. A set with no weight is
   not a top set, so a Home or Pilates workout logged nothing the Today card
   or the Logbook could show: Today read "Session · 1 min" over an empty card,
   and the Logbook said "no historical top set recorded" for seven moves just
   done (Nov 28). These are the notes' moves with no weight, as name and each
   set ("Bodyweight squat", "12, 14, 14 reps"; "Plank", "30s, 40s"), for a
   guided or coached day only. */
export function bodyweightLines(notes: string | undefined): Array<{ name: string; detail: string }> {
  const match = /^(?:Forge Guided|Coached) · [^.]*\.\s*(.*)$/s.exec(notes || '');
  if (!match) return [];
  return match[1].split(' · ').flatMap(part => {
    const line = /^(.+?) (\d[\d×s, ]*)$/.exec(part.trim());
    if (!line) return [];
    const same = /^(\d+)×(\d+s?)$/.exec(line[2]);
    const sets = same ? Array(Number(same[1])).fill(same[2]).join(', ') : line[2];
    return [{ name: line[1], detail: /s$/.test(sets) ? sets : `${sets} reps` }];
  });
}
