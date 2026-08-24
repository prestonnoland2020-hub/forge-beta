import { useCallback, useEffect, useState } from 'react';
import { loadNotes, saveNote, loadLocalNotes, type AthleteNote } from './athleteNotesService';

export function useAthleteNotes() {
  const [notes, setNotes] = useState<AthleteNote[]>(() => loadLocalNotes());
  useEffect(() => { let active = true; void loadNotes().then(loaded => { if (active) setNotes(loaded); }); return () => { active = false; }; }, []);
  const upsert = useCallback((note: AthleteNote) => {
    setNotes(current => {
      const index = current.findIndex(item => item.id === note.id);
      const next = index >= 0 ? current.map(item => item.id === note.id ? note : item) : [note, ...current];
      return next;
    });
    void saveNote(note);
  }, []);
  return { notes, upsert };
}
