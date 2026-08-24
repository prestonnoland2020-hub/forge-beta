import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';

/* Coach learnings: things the athlete tells Forge about their body — an
   injury, unusual fatigue, a limitation. Each note carries a buffer window
   during which the coach and recommendations must train around it, plus
   follow-ups so the coach can check back honestly. Local-first storage with
   best-effort Supabase sync, the same posture the workout log takes. */

export type NoteFollowUp = { date: string; feeling: 'better' | 'same' | 'worse'; note?: string };
export type AthleteNote = {
  id: string;
  kind: 'injury' | 'fatigue' | 'other';
  area?: string;
  note: string;
  reportedAt: string;
  bufferUntil?: string;
  status: 'active' | 'cleared';
  followUps: NoteFollowUp[];
};

const storageKey = 'forge-athlete-notes-v1';
const todayIso = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const addDaysIso = (iso: string, days: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

/* Default buffers, in days, when the athlete doesn't set one: an injury gets a
   real window, fatigue a short one. The athlete can clear a note any time. */
export const defaultBufferDays = (kind: AthleteNote['kind']) => kind === 'injury' ? 14 : kind === 'fatigue' ? 3 : 7;

export const loadLocalNotes = (): AthleteNote[] => {
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
};
const saveLocalNotes = (notes: AthleteNote[]) => localStorage.setItem(storageKey, JSON.stringify(notes));

export const isNoteActive = (note: AthleteNote) => note.status === 'active';
export const isBufferActive = (note: AthleteNote) => isNoteActive(note) && Boolean(note.bufferUntil && note.bufferUntil >= todayIso());
export const needsFollowUp = (note: AthleteNote) => {
  if (!isNoteActive(note)) return false;
  const last = note.followUps[note.followUps.length - 1]?.date || note.reportedAt;
  return last < todayIso();
};

const rowToNote = (row: Record<string, unknown>): AthleteNote => ({
  id: String(row.id),
  kind: (row.kind as AthleteNote['kind']) || 'other',
  area: row.area ? String(row.area) : undefined,
  note: String(row.note || ''),
  reportedAt: String(row.reported_at || todayIso()),
  bufferUntil: row.buffer_until ? String(row.buffer_until) : undefined,
  status: row.status === 'cleared' ? 'cleared' : 'active',
  followUps: Array.isArray(row.follow_ups) ? row.follow_ups as NoteFollowUp[] : [],
});

export async function loadNotes(): Promise<AthleteNote[]> {
  if (isDemoMode) return loadLocalNotes();
  try {
    const { data, error } = await supabase.from('athlete_health_notes').select('*').order('created_at', { ascending: false });
    if (error || !data) return loadLocalNotes();
    const notes = data.map(rowToNote);
    saveLocalNotes(notes);
    return notes;
  } catch { return loadLocalNotes(); }
}

export async function saveNote(note: AthleteNote): Promise<void> {
  const notes = loadLocalNotes();
  const index = notes.findIndex(item => item.id === note.id);
  if (index >= 0) notes[index] = note; else notes.unshift(note);
  saveLocalNotes(notes);
  if (isDemoMode) return;
  try {
    await supabase.from('athlete_health_notes').upsert({
      id: note.id, kind: note.kind, area: note.area || null, note: note.note,
      reported_at: note.reportedAt, buffer_until: note.bufferUntil || null,
      status: note.status, follow_ups: note.followUps, updated_at: new Date().toISOString(),
      owner_id: (await supabase.auth.getUser()).data.user?.id,
    });
  } catch { /* local copy already holds it; sync retries on next save */ }
}

export function createNote(kind: AthleteNote['kind'], note: string, area?: string, bufferDays?: number): AthleteNote {
  const reported = todayIso();
  return {
    id: crypto.randomUUID(), kind, area: area?.trim() || undefined, note: note.trim(),
    reportedAt: reported, bufferUntil: addDaysIso(reported, bufferDays ?? defaultBufferDays(kind)),
    status: 'active', followUps: [],
  };
}

/* Compact context block for every coach request. */
export const notesForCoachContext = (notes: AthleteNote[]) => notes.filter(isNoteActive).map(note => ({
  kind: note.kind, area: note.area || null, note: note.note, reported: note.reportedAt,
  bufferActiveUntil: isBufferActive(note) ? note.bufferUntil : null,
  latestCheckIn: note.followUps[note.followUps.length - 1] || null,
}));
