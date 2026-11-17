/* WHAT THE COACH REMEMBERS ABOUT ONE ATHLETE (approved by Preston 2026-11-17,
   row coach-memory-2026-11).

   The coach used to re-read the logs every time and forget everything said in
   chat: that she trains Monday/Wednesday/Friday before work, hates lunges, has
   only dumbbells at home, and found the last three squat sets too easy. This
   is the small, durable memory that fixes that. It is shared by the forge-coach
   edge function (Deno) and the app (Vite), so it imports nothing.

   Rules this file enforces, whatever the model returns:
   - training facts only: schedule, exercises liked/disliked, how they respond
     to load, equipment, limits, goal context, tone. Never diagnoses, conditions
     or medication — a stated pain becomes "ease off X", a training constraint.
   - small: at most MAX_ITEMS facts of MAX_TEXT characters, MAX_LIFTS guided
     lifts, and a summary under SUMMARY_LIMIT characters.
   - the athlete owns it: every item can be read, edited and deleted in
     Settings, and the whole thing can be wiped. */

export const MEMORY_CATEGORIES = ['schedule', 'exercises', 'dislikes', 'load', 'equipment', 'limits', 'goals', 'tone'] as const;
export type MemoryCategory = typeof MEMORY_CATEGORIES[number];
export type MemorySource = 'coach' | 'guided' | 'athlete';
export type MemoryItem = { id: string; category: MemoryCategory; text: string; source: MemorySource; at: string };
export type GuidedFeel = 'easy' | 'right' | 'hard';
export type GuidedLift = { weight: number | null; reps: number; feel: GuidedFeel; unit: string; at: string };
export type CoachMemoryFacts = { items: MemoryItem[]; guided: Record<string, GuidedLift> };

export const MAX_ITEMS = 30;
export const MAX_TEXT = 140;
export const MAX_LIFTS = 20;
export const SUMMARY_LIMIT = 800;
/* The extra model call after a reply is capped per athlete per day. */
export const DAILY_EXTRACTIONS = 15;

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  schedule: 'Schedule', exercises: 'Likes', dislikes: 'Dislikes', load: 'How you respond to load',
  equipment: 'Equipment', limits: 'Limits', goals: 'Goals', tone: 'How you like to be coached',
};

/* Diagnoses, conditions and medication never get stored — even if the athlete
   typed them and the model copied them. "Ease off overhead pressing" is kept;
   "rotator cuff tendinitis" is not. */
export const MEDICAL_PATTERN = /\b(diagnos\w*|tendin\w*|arthriti\w*|bursiti\w*|fracture\w*|torn|tear|herniat\w*|disc|sciatica|surgery|surgical|asthma\w*|diabet\w*|insulin|cancer|chemo\w*|depress\w*|anxiety|adhd|bipolar|pregnan\w*|postpartum|medication\w*|meds|prescri\w*|ibuprofen|advil|tylenol|steroid\w*|ssri|blood pressure|hypertension|cardiac|heart condition|epilep\w*|concussion|eating disorder|anorexi\w*|bulimi\w*|therap(y|ist)|physio\w*|doctor|disease|syndrome|disorder|condition)\b/i;

export const emptyFacts = (): CoachMemoryFacts => ({ items: [], guided: {} });

const isCategory = (value: unknown): value is MemoryCategory => (MEMORY_CATEGORIES as readonly string[]).includes(String(value));
const clean = (text: unknown) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* Read whatever is in the column back into a safe shape. */
export function normalizeFacts(raw: unknown): CoachMemoryFacts {
  const value = (raw && typeof raw === 'object' ? raw : {}) as { items?: unknown; guided?: unknown };
  const items: MemoryItem[] = (Array.isArray(value.items) ? value.items : [])
    .map(item => item as Partial<MemoryItem>)
    .filter(item => isCategory(item.category) && clean(item.text) && !MEDICAL_PATTERN.test(String(item.text)))
    .map(item => ({ id: String(item.id || newId()), category: item.category as MemoryCategory, text: clean(item.text), source: (['coach', 'guided', 'athlete'].includes(String(item.source)) ? item.source : 'coach') as MemorySource, at: String(item.at || new Date(0).toISOString()) }));
  const guided: Record<string, GuidedLift> = {};
  const rawGuided = value.guided && typeof value.guided === 'object' ? value.guided as Record<string, Partial<GuidedLift>> : {};
  for (const [lift, entry] of Object.entries(rawGuided)) {
    if (!entry || !['easy', 'right', 'hard'].includes(String(entry.feel))) continue;
    const weight = entry.weight === null || entry.weight === undefined ? null : Number(entry.weight);
    guided[clean(lift).slice(0, 60)] = { weight: weight !== null && Number.isFinite(weight) && weight > 0 ? weight : null, reps: Math.max(0, Math.round(Number(entry.reps) || 0)), feel: entry.feel as GuidedFeel, unit: entry.unit === 'kg' ? 'kg' : 'lb', at: String(entry.at || '') };
  }
  return capFacts({ items, guided });
}

/* Newest wins: the oldest facts and lifts fall off first. */
export function capFacts(facts: CoachMemoryFacts): CoachMemoryFacts {
  const items = [...facts.items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_ITEMS);
  const guided = Object.fromEntries(Object.entries(facts.guided).sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, MAX_LIFTS));
  return { items, guided };
}

/* What the extraction call returns: facts to add, and ids of remembered facts
   the athlete has now contradicted ("I moved to evenings"). */
export type Extraction = { add?: Array<{ category?: unknown; text?: unknown }>; remove?: unknown[] };

export function mergeExtraction(facts: CoachMemoryFacts, extraction: Extraction, at = new Date().toISOString()): { facts: CoachMemoryFacts; added: string[]; removed: string[] } {
  const remove = new Set((Array.isArray(extraction.remove) ? extraction.remove : []).map(String));
  const removed = facts.items.filter(item => remove.has(item.id)).map(item => item.text);
  let items = facts.items.filter(item => !remove.has(item.id));
  const added: string[] = [];
  for (const candidate of (Array.isArray(extraction.add) ? extraction.add : []).slice(0, 5)) {
    const text = clean(candidate?.text);
    if (!text || !isCategory(candidate?.category) || MEDICAL_PATTERN.test(text)) continue;
    if (items.some(item => norm(item.text) === norm(text))) continue;
    /* One schedule, one tone: a new statement replaces the old one in these
       categories instead of piling up contradictions. */
    if (candidate.category === 'schedule' || candidate.category === 'tone') items = items.filter(item => item.category !== candidate.category || item.source === 'athlete');
    items.push({ id: newId(), category: candidate.category, text, source: 'coach', at });
    added.push(text);
  }
  return { facts: capFacts({ items, guided: facts.guided }), added, removed };
}

/* A guided workout's feel answers: the last answer per lift is what counts. */
export function mergeGuided(facts: CoachMemoryFacts, sets: Array<{ lift: string; weight: number | null; reps: number; feel: GuidedFeel | null }>, unit: string, at = new Date().toISOString()): CoachMemoryFacts {
  const guided = { ...facts.guided };
  for (const set of sets) {
    if (!set.feel || !clean(set.lift)) continue;
    guided[clean(set.lift).slice(0, 60)] = { weight: set.weight !== null && set.weight > 0 ? set.weight : null, reps: Math.max(0, Math.round(set.reps)), feel: set.feel, unit: unit === 'kg' ? 'kg' : 'lb', at };
  }
  return capFacts({ items: facts.items, guided });
}

const FEEL_WORDS: Record<GuidedFeel, string> = { easy: 'too easy', right: 'just right', hard: 'too hard' };
export const guidedLine = (lift: string, entry: GuidedLift) => `${lift}: ${entry.weight !== null ? `${entry.weight} ${entry.unit} x ${entry.reps}` : `${entry.reps} reps`} felt ${FEEL_WORDS[entry.feel]}${entry.at ? ` (${entry.at.slice(0, 10)})` : ''}`;

/* The block the coach reads before every answer, under SUMMARY_LIMIT. */
export function memorySummary(facts: CoachMemoryFacts): string {
  const lines: string[] = [];
  for (const category of MEMORY_CATEGORIES) {
    const texts = facts.items.filter(item => item.category === category).map(item => item.text);
    if (texts.length) lines.push(`${CATEGORY_LABELS[category]}: ${texts.join('; ')}`);
  }
  const lifts = Object.entries(facts.guided).slice(0, 8).map(([lift, entry]) => guidedLine(lift, entry));
  if (lifts.length) lines.push(`Last guided feel: ${lifts.join('; ')}`);
  let out = '';
  for (const line of lines) {
    if ((out + line).length + 1 > SUMMARY_LIMIT) break;
    out += (out ? '\n' : '') + line;
  }
  return out;
}

/* Worth an extraction call at all? Short acknowledgements ("ok", "thanks")
   and pure lookups carry nothing durable; skipping them is most of the cost
   control. */
export const MEMORY_HINT = /\b(i|i'm|im|i've|my|me)\b.*\b(train|lift|run|gym|home|work|morning|evening|night|week|days?|hate|love|like|prefer|dislike|enjoy|can't|cannot|only|have|don't|avoid|hurt|sore|knee|back|shoulder|hip|ankle|elbow|wrist|neck|easy|hard|heavy|light|dumbbell|barbell|kettlebell|bands?|machine|rack|bench|goal|race|wedding|season|busy|schedule|blunt|short|explain|detail|push|motivat)/i;
export const worthRemembering = (question: string) => question.trim().length >= 12 && MEMORY_HINT.test(question);

export const extractionInstructions = `You maintain a small memory of durable training facts an athlete has told their coach. Read the athlete's latest message and the facts already remembered. Return only NEW durable facts the athlete stated about themselves, in short plain third-person-free phrases (e.g. "Trains Mon/Wed/Fri at 6am", "Dislikes lunges", "Only dumbbells up to 50 lb at home", "Responds well to small jumps", "Wants blunt, short answers").
Categories: schedule (usual training days/times, time limits), exercises (lifts or sessions they like), dislikes (exercises they dislike or refuse), load (how they respond to load changes), equipment, limits (things to avoid or ease off, as a training constraint), goals (context behind their goals: an event, a reason, a date), tone (how they want to be coached).
Never store a diagnosis, medical condition, medication, body weight, or anything about health beyond a training constraint they stated: "my knee hurts on squats" becomes limits: "Ease off deep knee bending (said knee hurts on squats)" without naming any condition. Never store one-off states (tired today, ate badly), numbers already in their logs, questions, or anything the coach said. If a new message contradicts a remembered fact, put that fact's id in remove. Most messages contain nothing durable: then return empty lists.`;

export const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    add: {
      type: 'array', maxItems: 5,
      items: { type: 'object', additionalProperties: false, properties: { category: { type: 'string', enum: [...MEMORY_CATEGORIES] }, text: { type: 'string' } }, required: ['category', 'text'] },
    },
    remove: { type: 'array', maxItems: 5, items: { type: 'string' } },
  },
  required: ['add', 'remove'],
};
