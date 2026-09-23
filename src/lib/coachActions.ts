import type { DailyRecommendation } from './dailyRecommendationEngine';

/* THE COACH CAN ACT.

   The athlete said "my knee hurts, and I only have thirty minutes" and the
   coach wrote three good sentences — then Today still said Back Squat and a
   forty-minute run. A regex on the client tried to turn certain sentences
   into changes ("increase my mileage to 25") and everything else was prose.
   That is a chatbot beside a plan, not a coach.

   Now every answer from forge-coach carries `actions`: zero or more entries
   from THIS vocabulary and nothing else. The server's JSON schema pins the
   shape; this file pins the meaning, validates every entry against what the
   athlete actually has (a split day that exists, a goal that exists), and
   writes the one-line label the confirm card shows. Nothing is applied until
   the athlete taps Apply — the server proposes, the athlete decides, and
   every applied action goes through the same authority the rest of the app
   uses (the body log, the profile, the overrides the Today card reads). */

export const ACTION_TYPES = [
  'rest_today', 'swap_today', 'shorten_today',
  'log_note', 'clear_note',
  'set_weekly_mileage', 'set_running_days', 'set_load_bias',
  'update_goal', 'create_exercise', 'create_workout',
] as const;
export type ActionType = typeof ACTION_TYPES[number];

/* The wire shape: flat, every field present (strict JSON schema), unused
   fields null. */
export type RawAction = {
  type: string;
  dayName?: string | null;
  minutes?: number | null;
  noteKind?: string | null;
  text?: string | null;
  area?: string | null;
  miles?: number | null;
  days?: number | null;
  percent?: number | null;
  goalTitle?: string | null;
  target?: string | null;
  date?: string | null;
  name?: string | null;
  items?: string[] | null;
};

export type CoachAction =
  | { type: 'rest_today'; label: string }
  | { type: 'swap_today'; dayName: string; position: number; label: string }
  | { type: 'shorten_today'; minutes: number; label: string }
  | { type: 'log_note'; noteKind: 'injury' | 'fatigue' | 'other'; text: string; area?: string; label: string }
  | { type: 'clear_note'; area: string; label: string }
  | { type: 'set_weekly_mileage'; miles: number; label: string }
  | { type: 'set_running_days'; days: number; label: string }
  | { type: 'set_load_bias'; percent: number; label: string }
  | { type: 'update_goal'; goalTitle: string; target?: string; date?: string; label: string }
  | { type: 'create_exercise'; name: string; muscles: string[]; label: string }
  | { type: 'create_workout'; name: string; items: string[]; label: string };

export type ActionContext = {
  splitDays: Array<{ position: number; name: string; type?: string }>;
  goals: Array<{ title: string }>;
  activeNoteAreas: string[];
  exercises: string[];
  weeklyMileage: number;
  runningDays: number;
  loadBiasPercent: number;
  metric?: boolean;
};

const KNOWN_MUSCLES = ['Chest', 'Back', 'Shoulders', 'Quads', 'Glutes', 'Hamstrings', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Calves', 'Cardio'];
const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : NaN; };
const str = (value: unknown) => String(value ?? '').trim();

/* Validate what the model sent against what the athlete has. An entry that
   names a day, goal or exercise the athlete does not have is dropped, never
   guessed at. */
export function parseActions(raw: unknown, ctx: ActionContext): CoachAction[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachAction[] = [];
  const seen = new Set<string>();
  for (const entry of raw.slice(0, 6)) {
    const action = parseOne((entry || {}) as RawAction, ctx);
    if (!action) continue;
    const key = `${action.type}:${'area' in action ? action.area : ''}${'dayName' in action ? action.dayName : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  /* Rest and swap and shorten contradict each other; the first wins. */
  const todayKinds = out.filter(action => action.type === 'rest_today' || action.type === 'swap_today');
  return todayKinds.length > 1 ? out.filter(action => action === todayKinds[0] || (action.type !== 'rest_today' && action.type !== 'swap_today')) : out;
}

function parseOne(entry: RawAction, ctx: ActionContext): CoachAction | null {
  const type = str(entry.type) as ActionType;
  if (!ACTION_TYPES.includes(type)) return null;
  const unit = ctx.metric ? 'km' : 'mi';
  switch (type) {
    case 'rest_today':
      return { type, label: 'Today → Rest day' };
    case 'swap_today': {
      const wanted = norm(str(entry.dayName));
      if (!wanted) return null;
      const day = ctx.splitDays.find(item => norm(item.name) === wanted) || ctx.splitDays.find(item => norm(item.name).includes(wanted) || wanted.includes(norm(item.name)));
      if (!day) return null;
      return { type, dayName: day.name, position: day.position, label: `Today → ${day.name}` };
    }
    case 'shorten_today': {
      const minutes = Math.round(num(entry.minutes));
      if (!(minutes >= 10 && minutes <= 180)) return null;
      return { type, minutes, label: `Today fits in ${minutes} minutes` };
    }
    case 'log_note': {
      const text = str(entry.text).slice(0, 240);
      if (!text) return null;
      const kindText = str(entry.noteKind).toLowerCase();
      const noteKind: 'injury' | 'fatigue' | 'other' = kindText === 'injury' || kindText === 'fatigue' ? kindText : 'other';
      const area = str(entry.area).slice(0, 40) || undefined;
      const what = area || (noteKind === 'fatigue' ? 'fatigue' : 'a note');
      return { type, noteKind, text, area, label: noteKind === 'injury' ? `Body log: ${what} — train around it` : noteKind === 'fatigue' ? 'Body log: fatigue — ease the next few days' : `Body log: ${what}` };
    }
    case 'clear_note': {
      const wanted = norm(str(entry.area));
      const area = ctx.activeNoteAreas.find(item => norm(item) === wanted) || ctx.activeNoteAreas.find(item => norm(item).includes(wanted) || wanted.includes(norm(item)));
      if (!area) return null;
      return { type, area, label: `Clear ${area} from the body log` };
    }
    case 'set_weekly_mileage': {
      const miles = clamp(Math.round(num(entry.miles) * 10) / 10, 1, 150);
      if (!(miles > 0) || miles === ctx.weeklyMileage) return null;
      return { type, miles, label: `Weekly running: ${ctx.weeklyMileage || '—'} → ${miles} ${unit}` };
    }
    case 'set_running_days': {
      const days = clamp(Math.round(num(entry.days)), 1, 7);
      if (!(days > 0) || days === ctx.runningDays) return null;
      return { type, days, label: `Running days: ${ctx.runningDays || '—'} → ${days} a week` };
    }
    case 'set_load_bias': {
      const percent = clamp(Math.round(num(entry.percent) * 2) / 2, -10, 10);
      if (!Number.isFinite(percent) || percent === ctx.loadBiasPercent) return null;
      return { type, percent, label: `Strength loads: ${ctx.loadBiasPercent > 0 ? '+' : ''}${ctx.loadBiasPercent}% → ${percent > 0 ? '+' : ''}${percent}%` };
    }
    case 'update_goal': {
      const wanted = norm(str(entry.goalTitle));
      const goal = ctx.goals.find(item => norm(item.title) === wanted) || ctx.goals.find(item => norm(item.title).includes(wanted) || wanted.includes(norm(item.title)));
      if (!goal) return null;
      const target = str(entry.target) || undefined;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(str(entry.date)) ? str(entry.date) : undefined;
      if (!target && !date) return null;
      return { type, goalTitle: goal.title, target, date, label: `${goal.title}: ${[target && `target ${target}`, date && `by ${date}`].filter(Boolean).join(', ')}` };
    }
    case 'create_exercise': {
      const name = str(entry.name).slice(0, 60);
      if (!name || ctx.exercises.some(item => norm(item) === norm(name))) return null;
      const muscles = (entry.items || []).map(str).map(item => KNOWN_MUSCLES.find(known => norm(known) === norm(item))).filter((item): item is string => Boolean(item));
      if (!muscles.length) return null;
      return { type, name, muscles, label: `Add ${name} to your library (${muscles.join(', ')})` };
    }
    case 'create_workout': {
      const name = str(entry.name).slice(0, 60);
      const items = (entry.items || []).map(str).filter(Boolean).slice(0, 12);
      if (!name || items.length < 2) return null;
      return { type, name, items, label: `Save workout "${name}": ${items.join(' · ')}` };
    }
  }
  return null;
}

/* WHAT THE TODAY CARD READS. A coach override is one day's worth of change,
   stamped with its date so it expires by itself. */
export type TodayOverride = {
  date: string;
  rest?: boolean;
  position?: number;
  dayName?: string;
  minutes?: number;
  /* The one line the Today card shows for it. */
  note: string;
};

export const overrideFromActions = (actions: CoachAction[], todayIso: string, existing?: TodayOverride | null): TodayOverride | null => {
  const base: TodayOverride = existing && existing.date === todayIso ? { ...existing } : { date: todayIso, note: '' };
  let touched = false;
  for (const action of actions) {
    if (action.type === 'rest_today') { base.rest = true; base.position = undefined; base.dayName = undefined; touched = true; }
    if (action.type === 'swap_today') { base.rest = false; base.position = action.position; base.dayName = action.dayName; touched = true; }
    if (action.type === 'shorten_today') { base.minutes = action.minutes; touched = true; }
  }
  if (!touched) return existing && existing.date === todayIso ? existing : null;
  base.note = [base.rest ? 'Rest day — you asked the coach for it.' : base.dayName ? `${base.dayName} today — swapped by the coach at your request.` : '', base.minutes ? `Trimmed to fit ${base.minutes} minutes.` : ''].filter(Boolean).join(' ');
  return base;
};

/* SHORTER, NOT DIFFERENT. Top sets stay in their order — the goal lift is
   first — and the tail is cut; cardio keeps its shape and loses minutes. A
   thirty-minute day is one top set and twenty easy minutes, not a new plan. */
export const MINUTES_PER_TOP_SET = 12;
export function shortenRecommendation(rec: DailyRecommendation, minutes: number): DailyRecommendation {
  const cardioMinutes = rec.cardio ? cardioMinutesOf(rec.cardio) : 0;
  let budget = minutes;
  const keptSets: typeof rec.topSets = [];
  for (const set of rec.topSets) {
    if (budget - MINUTES_PER_TOP_SET < (rec.cardio ? 10 : 0) && keptSets.length) break;
    keptSets.push(set);
    budget -= MINUTES_PER_TOP_SET;
  }
  let cardio = rec.cardio;
  if (cardio && cardioMinutes > budget) {
    const fit = Math.max(10, budget);
    const plan: Record<string, unknown> = { ...(cardio.session.plan as Record<string, unknown>), duration: String(fit) };
    const scale = fit / cardioMinutes;
    if (typeof plan.distance === 'string' && Number(plan.distance) > 0) plan.distance = String(Math.round(Number(plan.distance) * scale * 10) / 10);
    if (typeof plan.repeats === 'string' && Number(plan.repeats) > 1) plan.repeats = String(Math.max(2, Math.floor(Number(plan.repeats) * scale)));
    cardio = { ...cardio, summary: `${cardio.summary} · cut to ${fit} min`, session: { ...cardio.session, plan } as typeof cardio.session };
  }
  const dropped = rec.topSets.length - keptSets.length;
  return { ...rec, topSets: keptSets, cardio, explanation: `${rec.explanation} Trimmed to ${minutes} minutes${dropped ? ` — ${dropped} top set${dropped === 1 ? '' : 's'} dropped` : ''}.` };
}

const cardioMinutesOf = (cardio: NonNullable<DailyRecommendation['cardio']>) => {
  const plan = cardio.session.plan as { duration?: string; distance?: string };
  return Number(plan.duration) || Math.round((Number(plan.distance) || 0) * 9) || 30;
};

/* WHEN THE COACH CANNOT BE REACHED (preview mode, no network), the plain
   cases still work: pain is logged, "I need a rest day" rests, "only have
   30 minutes" trims. Deliberately small — anything subtler waits for the
   coach. The server never sees this; it exists so an offline athlete's
   "my knee hurts" is not lost. */
export function localActions(question: string, ctx: ActionContext): CoachAction[] {
  const text = question.trim();
  if (!text || /\?\s*$/.test(text)) return [];
  const raw: RawAction[] = [];
  const lower = text.toLowerCase();
  const area = extractAreaWord(lower);
  if (/\b(hurt|hurts|pain|painful|sore|tweak|tweaked|injur\w*|strain\w*|sprain\w*|tight|pulled|aching|sharp)\b/.test(lower)) raw.push({ type: 'log_note', noteKind: 'injury', text, area });
  else if (/\b(fatigued?|exhausted|drained|burn(?:ed|t) out|run down|no energy|wiped|overtrained|sick|ill|flu|cold)\b/.test(lower)) raw.push({ type: 'log_note', noteKind: 'fatigue', text, area: null });
  if (area && /\b(better|fine|gone|cleared|healed|good now|no longer)\b/.test(lower) && ctx.activeNoteAreas.length) raw.push({ type: 'clear_note', area });
  if (/\b(rest day|day off|need a rest|take today off|skip today|not training today)\b/.test(lower)) raw.push({ type: 'rest_today' });
  const minutes = lower.match(/\b(\d{2,3})\s*(?:min|mins|minutes)\b/);
  if (minutes && /\b(only|just|have|got)\b/.test(lower)) raw.push({ type: 'shorten_today', minutes: Number(minutes[1]) });
  const mileage = lower.match(/(\d+(?:\.\d+)?)\s*(?:mi|miles?|km)\s*(?:a|per|\/)\s*week/);
  if (mileage) raw.push({ type: 'set_weekly_mileage', miles: Number(mileage[1]) });
  return parseActions(raw, ctx);
}
const extractAreaWord = (lower: string) => {
  const match = lower.match(/\b(knee|hamstring|quad|calf|calves|shin|achilles|ankle|foot|hip|groin|glute|lower back|upper back|back|neck|shoulder|rotator cuff|chest|elbow|forearm|wrist|hand|bicep|tricep|it band)s?\b/);
  return match ? match[1] : null;
};
