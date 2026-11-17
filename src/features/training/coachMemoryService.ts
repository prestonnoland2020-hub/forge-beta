import { supabase } from '../../lib/supabase';
import { isDemoMode } from '../../lib/env';
import { capFacts, emptyFacts, mergeGuided, memorySummary, normalizeFacts, MAX_TEXT, MEDICAL_PATTERN, type CoachMemoryFacts, type GuidedFeel } from '../../../supabase/functions/_shared/coachMemory';

/* WHAT THE COACH KNOWS ABOUT ME. The coach writes this memory server-side
   after answers; the app reads it for Settings, lets the athlete edit or
   delete any item or wipe it all, and adds how each guided set felt. The
   preview build keeps it in this browser so the screen can be tried. */

const demoKey = 'forge-coach-memory-demo-v1';
export const coachMemoryChanged = 'forge-coach-memory-changed';

const readDemo = (): CoachMemoryFacts => { try { return normalizeFacts(JSON.parse(localStorage.getItem(demoKey) || 'null')); } catch { return emptyFacts(); } };
const writeDemo = (facts: CoachMemoryFacts) => { try { localStorage.setItem(demoKey, JSON.stringify(facts)); } catch { /* per-device */ } };

const ownerId = async () => (await supabase.auth.getUser()).data.user?.id || null;

export async function loadCoachMemory(): Promise<CoachMemoryFacts> {
  if (isDemoMode) return readDemo();
  const owner = await ownerId();
  if (!owner) return emptyFacts();
  const { data, error } = await supabase.from('coach_memory').select('facts').eq('owner_id', owner).maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeFacts(data?.facts);
}

async function save(facts: CoachMemoryFacts, note: string, source: 'athlete' | 'guided') {
  const next = capFacts(facts);
  if (isDemoMode) { writeDemo(next); window.dispatchEvent(new Event(coachMemoryChanged)); return next; }
  const owner = await ownerId();
  if (!owner) return next;
  const { error } = await supabase.from('coach_memory').upsert({ owner_id: owner, facts: next, summary: memorySummary(next), updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  await supabase.from('coach_memory_events').insert({ owner_id: owner, source, note: note.slice(0, 500) });
  window.dispatchEvent(new Event(coachMemoryChanged));
  return next;
}

/* An edited item becomes the athlete's own words; the coach won't replace it. */
export async function editMemoryItem(facts: CoachMemoryFacts, id: string, text: string) {
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  if (!clean) return deleteMemoryItem(facts, id);
  if (MEDICAL_PATTERN.test(clean)) throw new Error('Forge keeps training facts only, not medical details. Try something like “ease off overhead pressing”.');
  return save({ ...facts, items: facts.items.map(item => item.id === id ? { ...item, text: clean, source: 'athlete', at: new Date().toISOString() } : item) }, `edited: ${clean}`, 'athlete');
}

export const deleteMemoryItem = (facts: CoachMemoryFacts, id: string) => save({ ...facts, items: facts.items.filter(item => item.id !== id) }, 'deleted an item', 'athlete');

export const deleteGuidedLift = (facts: CoachMemoryFacts, lift: string) => { const guided = { ...facts.guided }; delete guided[lift]; return save({ ...facts, guided }, `deleted guided feel: ${lift}`, 'athlete'); };

export async function wipeCoachMemory() {
  if (isDemoMode) { try { localStorage.removeItem(demoKey); } catch { /* fine */ } window.dispatchEvent(new Event(coachMemoryChanged)); return emptyFacts(); }
  const owner = await ownerId();
  if (!owner) return emptyFacts();
  const first = await supabase.from('coach_memory').delete().eq('owner_id', owner);
  if (first.error) throw new Error(first.error.message);
  await supabase.from('coach_memory_events').delete().eq('owner_id', owner);
  window.dispatchEvent(new Event(coachMemoryChanged));
  return emptyFacts();
}

/* After a guided workout: how each lift's last set felt, so the coach (and the
   next guided workout's advice) knows 225 x 5 was too easy. Best-effort. */
export async function rememberGuidedFeel(sets: Array<{ lift: string; weight: number | null; reps: number; feel: GuidedFeel | null }>, unit: string) {
  try {
    const felt = sets.filter(set => set.feel);
    if (!felt.length) return;
    const facts = await loadCoachMemory();
    await save(mergeGuided(facts, felt, unit), `guided: ${felt.map(set => `${set.lift} ${set.feel}`).join(', ')}`, 'guided');
  } catch (error) {
    console.warn('coach memory: guided save failed', error);
  }
}
