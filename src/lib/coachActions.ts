import type { DailyRecommendation } from './dailyRecommendationEngine';
import { SICK_AREA, EASE_BACK_DAYS, PREGNANCY_AREA, POSTPARTUM_AREA, PREGNANCY_DAYS, POSTPARTUM_DAYS, limitationIn, plainText, fatigueScope } from './bodyLog';
import { weightForReps } from './strength';
import type { CircuitStation, PlannedCardio } from '../components/CardioPlanBuilder';

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
  stations?: Array<{ name?: string | null; target?: string | number | null; unit?: string | null; load?: string | null; rest?: number | null }> | null;
  rounds?: number | null;
  format?: string | null;
  roundRest?: number | null;
};

/* ONE PIECE OF A SAVED WORKOUT, WITH ITS NUMBER. A workout the coach makes is
   only useful with the prescription in it — "SkiErg" is a station, "500 m
   SkiErg" is a workout. */
export type WorkoutStation = { name: string; target: string; unit: string; load?: string; rest: number };
export type WorkoutFormat = 'Rounds' | 'AMRAP' | 'EMOM' | 'For time';
const STATION_UNITS = ['meters', 'km', 'kilometers', 'miles', 'yards', 'calories', 'reps', 'seconds', 'minutes'];
const UNIT_SHORT: Record<string, string> = { meters: 'm', km: 'km', kilometers: 'km', miles: 'mi', yards: 'yd', calories: 'cal', reps: 'reps', seconds: 's', minutes: 'min' };
export const stationText = (station: WorkoutStation) => {
  const amount = station.unit === 'reps' ? `${station.target} ${station.name}` : `${station.target} ${UNIT_SHORT[station.unit] || station.unit} ${station.name}`;
  return `${amount}${station.load ? ` @ ${station.load}` : ''}`;
};
export const workoutShapeText = (rounds: number, format: WorkoutFormat, roundRest: number) =>
  format === 'AMRAP' ? `${rounds}-min AMRAP` : format === 'EMOM' ? `${rounds}-min EMOM` : format === 'For time' ? (rounds > 1 ? `${rounds} rounds for time` : 'For time')
    : `${rounds} round${rounds === 1 ? '' : 's'}${rounds > 1 && roundRest ? `, ${roundRest >= 60 && roundRest % 60 === 0 ? `${roundRest / 60} min` : `${roundRest} s`} between` : ''}`;

export type CoachAction =
  | { type: 'rest_today'; label: string }
  | { type: 'swap_today'; dayName: string; position: number; label: string }
  | { type: 'shorten_today'; minutes: number; label: string }
  | { type: 'log_note'; noteKind: 'injury' | 'fatigue' | 'other'; text: string; area?: string; bufferDays?: number; label: string }
  | { type: 'clear_note'; area: string; label: string }
  | { type: 'set_weekly_mileage'; miles: number; label: string }
  | { type: 'set_running_days'; days: number; label: string }
  | { type: 'set_load_bias'; percent: number; label: string }
  | { type: 'update_goal'; goalTitle: string; target?: string; date?: string; label: string }
  | { type: 'create_exercise'; name: string; muscles: string[]; label: string }
  | { type: 'create_workout'; name: string; items: string[]; stations?: WorkoutStation[]; rounds?: number; format?: WorkoutFormat; roundRest?: number; label: string };

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
      /* How long the athlete said it will last, if they said — "sick for a
         few days", "out all week". Clamped to a fortnight; past that it is a
         conversation with a doctor, not a buffer. */
      const stated = Math.round(num(entry.days));
      const bufferDays = stated >= 1 && stated <= 14 ? stated : undefined;
      /* SICK IS ITS OWN STATE. It is stored as fatigue named "Sick" (see
         lib/bodyLog), which turns every day into rest until it clears and
         eases the days after. */
      if (kindText === 'illness' || kindText === 'sick') {
        const days = bufferDays ?? 3;
        return { type, noteKind: 'fatigue', text, area: SICK_AREA, bufferDays: days, label: `Sick — rest for ${days === 1 ? 'today' : `${days} days`}, then ${EASE_BACK_DAYS} easier days back` };
      }
      /* PREGNANCY AND POSTPARTUM are whole-body states with long buffers
         (lib/bodyLog), named by their area. */
      if (kindText === 'pregnancy') return { type, noteKind: 'other', text, area: PREGNANCY_AREA, bufferDays: PREGNANCY_DAYS, label: 'Pregnancy — moderate loads, no max attempts, easy cardio' };
      if (kindText === 'postpartum') return { type, noteKind: 'other', text, area: POSTPARTUM_AREA, bufferDays: POSTPARTUM_DAYS, label: 'Postpartum — lighter loads, no running or impact until you’re cleared' };
      const noteKind: 'injury' | 'fatigue' | 'other' = kindText === 'injury' || kindText === 'fatigue' ? kindText : 'other';
      const area = str(entry.area).slice(0, 40) || undefined;
      /* Fatigue names what it eases (lib/bodyLog fatigueScope), and the card
         says so — "Lighter training" over a running-only change read as if
         the lifting would come down too. */
      if (noteKind === 'fatigue') {
        const span = bufferDays ? `${bufferDays} day${bufferDays === 1 ? '' : 's'}` : 'the next few days';
        const scope = fatigueScope(area);
        const label = scope.kind === 'running' ? `Easier running for ${span} — lifting unchanged`
          : scope.kind === 'lifting' ? `Lighter lifting for ${span} — running unchanged`
          : scope.kind === 'muscles' ? `Lighter ${area} work for ${span} — everything else unchanged`
          : scope.kind === 'lift' ? `Lighter ${area} for ${span} — everything else unchanged`
          : `Lighter training for ${span}`;
        return { type, noteKind, text, area, bufferDays, label };
      }
      const what = area || 'a note';
      const avoid = limitationIn(text);
      return { type, noteKind, text, area, bufferDays, label: avoid ? `Plan change: ${avoid}${area ? `, ${area} protected` : ''}` : noteKind === 'injury' ? `Body log: ${what} — train around it` : `Body log: ${what}` };
    }
    case 'clear_note': {
      const wanted = norm(str(entry.area));
      const area = ctx.activeNoteAreas.find(item => norm(item) === wanted) || ctx.activeNoteAreas.find(item => norm(item).includes(wanted) || wanted.includes(norm(item)));
      if (!area) return null;
      return { type, area, label: norm(area) === norm(SICK_AREA) ? `Back to training — ${EASE_BACK_DAYS} easier days first` : `Clear ${area} from the body log` };
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
      /* THE PRESCRIPTION, NOT A LIST OF NAMES. A station needs a name and a
         number in a unit Forge can log; anything vaguer is dropped. */
      const stations: WorkoutStation[] = (entry.stations || []).slice(0, 16).flatMap(raw => {
        const stationName = str(raw?.name).slice(0, 60);
        const unitText = str(raw?.unit).toLowerCase();
        const unit = STATION_UNITS.find(item => item === unitText || item === `${unitText}s` || UNIT_SHORT[item] === unitText);
        const amount = num(raw?.target);
        if (!stationName || !unit || !(amount > 0)) return [];
        const load = str(raw?.load).slice(0, 24) || undefined;
        const rest = clamp(Math.round(num(raw?.rest) || 0), 0, 600);
        return [{ name: stationName, target: String(Math.round(amount * 100) / 100), unit: unit === 'km' ? 'kilometers' : unit, load, rest }];
      });
      const items = stations.length ? stations.map(station => station.name) : (entry.items || []).map(str).filter(Boolean).slice(0, 12);
      if (!name || items.length < 2) return null;
      if (!stations.length) return { type, name, items, label: `Save workout "${name}": ${items.join(' · ')}` };
      const formatText = str(entry.format);
      const format: WorkoutFormat = (['Rounds', 'AMRAP', 'EMOM', 'For time'] as const).find(item => item.toLowerCase() === formatText.toLowerCase()) || 'Rounds';
      /* Rounds, or minutes for an AMRAP or EMOM — as the circuit builder reads them. */
      const rounds = clamp(Math.round(num(entry.rounds) || 1), 1, format === 'AMRAP' || format === 'EMOM' ? 60 : 20);
      const roundRest = clamp(Math.round(num(entry.roundRest) || 0), 0, 900);
      return { type, name, items, stations, rounds, format, roundRest,
        label: `Save "${name}" — ${workoutShapeText(rounds, format, roundRest)}: ${stations.map(stationText).join(' · ')}` };
    }
  }
  return null;
}

/* WHERE AN APPLIED CHANGE LANDS. "Done — save workout…" told the athlete it
   happened and not where, so a circuit saved to the library was a thing they
   had to go and hunt for. Every change names the screen that now shows it, and
   the coach links straight there. */
export type ChangePlace = { place: string; to: string };
export function whereItGoes(action: CoachAction): ChangePlace {
  switch (action.type) {
    case 'rest_today': case 'swap_today': case 'shorten_today': return { place: 'Today', to: '/' };
    case 'log_note': case 'clear_note': return { place: 'Body log', to: '/profile?view=coach' };
    case 'set_weekly_mileage': case 'set_running_days': case 'set_load_bias': return { place: 'Plan', to: '/plan' };
    case 'update_goal': return { place: 'Goals', to: '/goals' };
    case 'create_exercise': return { place: 'Library · Exercises', to: '/exercises' };
    case 'create_workout': return { place: 'Library · Saved circuits', to: '/exercises?show=circuits' };
  }
}

/* A WORKOUT WITH ITS PRESCRIPTION IS SAVED AS A CIRCUIT — the stations,
   their numbers, rounds and rest — so it opens in the circuit builder, shows
   under Saved circuits and logs in a tap. Returns null for a names-only
   workout (an older coach deploy), which is saved the way it always was.

   A station's type follows its UNIT, because the circuit builder offers units
   by type: reps are Strength when loaded and Bodyweight when not; a distance,
   calories or minutes is Cardio — a loaded carry or sled included — except
   unloaded metres on a non-cardio move (walking lunges), which is Bodyweight. */
export function circuitWorkoutFromAction(action: CoachAction, library: Array<{ name: string; kind: string }>) {
  if (action.type !== 'create_workout') return null;
  /* A names-only workout (an older coach deploy) still goes to Saved circuits:
     each movement becomes a station with its number left to fill in, rather
     than a list that no screen shows. */
  if (!action.stations?.length) {
    const stations: WorkoutStation[] = action.items.map(name => {
      const known = library.find(exercise => exercise.name.toLowerCase() === name.toLowerCase());
      const cardio = known?.kind === 'Cardio' || /\b(run|row|rowing|ski|skierg|bike|erg|swim|sled)\b/i.test(name);
      return { name, target: '', unit: cardio ? 'meters' : 'reps', rest: 0 };
    });
    const plan: PlannedCardio = {
      id: Date.now(), activity: action.name, structure: 'Circuit', targetSource: 'Manual plan', rounds: '1', circuitFormat: 'Rounds', roundRest: '0',
      stationEntries: stations.map((station, index) => ({ id: index + 1, kind: station.unit === 'meters' ? 'Cardio' : 'Bodyweight', name: station.name, target: '', unit: station.unit, rest: '0' })),
    };
    return { name: action.name, kind: 'Circuit' as const, source: 'Forge' as const, exercises: action.items, plan, summary: `${action.items.join(' · ')} · open to set the numbers` };
  }
  const kindOf = (station: WorkoutStation): CircuitStation['kind'] => {
    const known = library.find(exercise => exercise.name.toLowerCase() === station.name.toLowerCase());
    const cardioMove = known?.kind === 'Cardio' || /\b(run|row|rowing|ski|skierg|bike|erg|swim|sled)\b/i.test(station.name);
    if (station.unit === 'reps') return station.load ? 'Strength' : 'Bodyweight';
    if (station.unit === 'seconds') return cardioMove ? 'Cardio' : station.load ? 'Strength' : 'Bodyweight';
    if (station.unit === 'meters' && !station.load && !cardioMove) return 'Bodyweight';
    return 'Cardio';
  };
  const rounds = action.rounds || 1;
  const format = action.format || 'Rounds';
  const roundRest = action.roundRest || 0;
  const plan: PlannedCardio = {
    id: Date.now(), activity: action.name, structure: 'Circuit', targetSource: 'Manual plan',
    rounds: String(rounds), circuitFormat: format, roundRest: String(roundRest),
    stationEntries: action.stations.map((station, index) => ({ id: index + 1, kind: kindOf(station), name: station.name, target: station.target, unit: station.unit, load: station.load, rest: String(station.rest) })),
  };
  return { name: action.name, kind: 'Circuit' as const, source: 'Forge' as const, exercises: action.items, plan,
    summary: `${workoutShapeText(rounds, format, roundRest)} · ${action.stations.map(stationText).join(' · ')}` };
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

/* EASING BACK IN. The first days after being sick, or a tired stretch, keep
   the session but take the edge off it: every load 10% down to a weight the
   bar can hold, and the cardio a quarter shorter and steady — no intervals
   the morning after a fever. */
export const EASE_PERCENT = 10;
/* `only` narrows it: a fatigue note about the running eases the cardio and
   leaves every lift as written; one about a lift eases that lift alone. */
export type EaseScope = { cardio: boolean; set: (set: DailyRecommendation['topSets'][number]) => boolean };
export function easeRecommendation(rec: DailyRecommendation, metric = false, only?: EaseScope): DailyRecommendation {
  const step = metric ? 2.5 : 5;
  const topSets = rec.topSets.map(set => {
    if (!(set.weight > 0)) return set;
    if (only && !only.set(set)) return set;
    const weight = Math.max(step, Math.floor((set.weight * (1 - EASE_PERCENT / 100)) / step) * step);
    return { ...set, weight, calculatedMax: set.calculatedMax ? Math.round(set.calculatedMax * weight / set.weight) : set.calculatedMax, rationale: `Easing back in — ${EASE_PERCENT}% lighter today. ${set.rationale || ''}`.trim() };
  });
  let cardio = rec.cardio;
  if (cardio && (!only || only.cardio)) {
    const minutes = cardioMinutesOf(cardio);
    const fit = Math.max(15, Math.round(minutes * 0.75));
    const plan: Record<string, unknown> = { ...(cardio.session.plan as Record<string, unknown>), duration: String(fit), structure: 'Steady' };
    if (typeof plan.distance === 'string' && Number(plan.distance) > 0) plan.distance = String(Math.round(Number(plan.distance) * 0.75 * 10) / 10);
    delete plan.repeats; delete plan.pace;
    cardio = { ...cardio, summary: `Easy · ${fit} min`, session: { ...cardio.session, plan, stress: 'Low' } as typeof cardio.session };
  }
  return { ...rec, topSets, cardio };
}

/* MODERATE, FOR PREGNANCY. On top of easing: no set under five reps, so the
   wave's heavy doubles and max attempts become a moderate five, written from
   the calculated max with room to spare. */
export function moderateRecommendation(rec: DailyRecommendation, metric = false): DailyRecommendation {
  const step = metric ? 2.5 : 5;
  const topSets = rec.topSets.map(set => {
    if (!(set.weight > 0) || set.reps >= 5) return set;
    const fromMax = set.calculatedMax ? weightForReps(set.calculatedMax, 5) * 0.9 : set.weight * 0.85;
    const weight = Math.max(step, Math.floor(fromMax / step) * step);
    return { ...set, reps: 5, weight, rationale: 'Pregnancy — a moderate five instead of a heavy single or double.' };
  });
  return { ...rec, topSets };
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
/* THE COACH STILL ACTS WITHOUT THE AI. When forge-coach cannot be reached —
   offline, a preview build, a provider outage — the athlete's sentence is
   read for the handful of states that should change the plan, so "I'm sick"
   still rests today and holds the week instead of earning a paragraph. Every
   entry goes through parseActions like the server's do. */
const SICK = /\b(sick|ill|unwell|flu|fever|feverish|covid|virus|stomach bug|food poisoning|strep|sinus infection|chest infection|throwing up|vomiting|nauseous)\b|\b(a|the|my) cold\b|\bcaught a cold\b|\bcoming down with\b/;
const BETTER = /\b(feel(?:ing)? (?:a lot |much |way )?better|i'?m better|recovered|back to normal|over it|no longer sick|not sick anymore|healthy again)\b/;
/* Women's health, read the same plain way. A period is a few lighter days
   when she says it is hitting her, not a rule on every cycle. */
const PREGNANT = /\b(i'?m|i am|we'?re|we are)\s+(?:\d+\s+weeks\s+)?(pregnant|expecting)\b|\bfound out i'?m pregnant\b/;
const POSTPARTUM = /\b(had (?:my|the|our|a) baby|gave birth|just delivered|postpartum|post-partum|after (?:my|the) birth)\b/;
const CLEARED = /\b(cleared|clearance|doctor (?:said|says) (?:i can|it'?s ok)|ok(?:ay)?'?d to (?:run|train))\b/;
const PERIOD = /\b(my period|on my period|period cramps|cramps|menstrual|time of the month|pms|heavy flow|on my cycle)\b/;
/* "for 3 days", "a couple of days", "all week", "this week" → days. */
export function statedDays(lower: string): number | undefined {
  const words: Record<string, number> = { a: 1, one: 1, two: 2, couple: 2, three: 3, few: 3, four: 4, five: 5, six: 6, seven: 7, several: 4 };
  const days = lower.match(/\b(\d{1,2}|a|one|two|three|four|five|six|seven|couple|few|several)\s*(?:of\s*)?(?:more\s*)?(day|days|week|weeks)\b/);
  if (days) {
    const count = Number(days[1]) || words[days[1]] || 1;
    return Math.min(14, /week/.test(days[2]) ? count * 7 : count);
  }
  if (/\b(all|this|the whole) week\b/.test(lower)) return 7;
  if (/\b(today|tonight)\b/.test(lower) && !/\bdays?\b/.test(lower)) return 1;
  return undefined;
}

export function localActions(question: string, ctx: ActionContext): CoachAction[] {
  const text = question.trim();
  if (!text) return [];
  const lower = plainText(text);
  /* "Should I train if I'm sick?" is a question, not a report — unless it
     also says they are ("I'm sick, should I run?"). */
  const asks = /\?\s*$/.test(text);
  /* "…when I'm sick?", "…if I have a cold?" is asking about a situation, not
     reporting one. */
  const hypothetical = asks && /\b(if|when|whenever|in case|while)\s+(?:i|i'?m|you|you'?re)\b/.test(lower);
  const reports = !asks || (!hypothetical && /\b(i'?m|i am|i've|i have|i got|i feel|feeling)\b/.test(lower));
  if (!reports) return [];
  const raw: RawAction[] = [];
  const sickNow = ctx.activeNoteAreas.some(area => area.toLowerCase() === SICK_AREA.toLowerCase());
  if (sickNow && BETTER.test(lower)) return parseActions([{ type: 'clear_note', area: SICK_AREA }], ctx);
  const area = extractAreaWord(lower);
  const active = (wanted: string) => ctx.activeNoteAreas.some(item => item.toLowerCase() === wanted.toLowerCase());
  if (active(POSTPARTUM_AREA) && CLEARED.test(lower)) return parseActions([{ type: 'clear_note', area: POSTPARTUM_AREA }], ctx);
  if (POSTPARTUM.test(lower)) {
    if (active(PREGNANCY_AREA)) raw.push({ type: 'clear_note', area: PREGNANCY_AREA });
    raw.push({ type: 'log_note', noteKind: 'postpartum', text });
    return parseActions(raw, ctx);
  }
  if (PREGNANT.test(lower) && !active(PREGNANCY_AREA)) return parseActions([{ type: 'log_note', noteKind: 'pregnancy', text }], ctx);
  if (PERIOD.test(lower) && /\b(bad|rough|awful|heavy|wiped|tired|exhausted|cramp|cramps|pain|hurts|hurting|struggling|low energy)\b/.test(lower)) return parseActions([{ type: 'log_note', noteKind: 'fatigue', text, area: null, days: statedDays(lower) ?? 2 }], ctx);
  if (SICK.test(lower) && !/\bsick of\b/.test(lower)) {
    raw.push({ type: 'rest_today' }, { type: 'log_note', noteKind: 'illness', text, days: statedDays(lower) ?? null });
    return parseActions(raw, ctx);
  }
  /* A limitation names a movement to avoid; the plan takes it off (lib/bodyLog). */
  const limitation = limitationIn(lower);
  if (/\b(hurt|hurts|pain|painful|sore|tweak|tweaked|injur\w*|strain\w*|sprain\w*|tight|pulled|aching|sharp)\b/.test(lower)) raw.push({ type: 'log_note', noteKind: 'injury', text, area });
  else if (limitation) raw.push({ type: 'log_note', noteKind: 'other', text, area, days: statedDays(lower) ?? 14 });
  /* ONE PART OF TRAINING, NOT THE WHOLE PLAN. "Keep the running easier while
     I rebuild my base" eases the runs and leaves the lifting alone. */
  else if (/\b(rebuild(?:ing)? (?:my |the )?(?:aerobic )?base|base back)\b/.test(lower) || (/\b(run|runs|running|cardio|mileage)\b/.test(lower) && /\b(easier|easy|lighter|back off|ease off|dial back|tone down)\b/.test(lower) && !/\b(lift|lifts|lifting|squat|bench|deadlift)\b/.test(lower))) raw.push({ type: 'log_note', noteKind: 'fatigue', text, area: 'running', days: statedDays(lower) ?? 14 });
  else if (/\b(lift|lifts|lifting|weights|loads)\b/.test(lower) && /\b(lighter|easier|back off|ease off|dial back|heavy|too heavy)\b/.test(lower) && !/\b(run|runs|running|cardio)\b/.test(lower)) raw.push({ type: 'log_note', noteKind: 'fatigue', text, area: 'lifting', days: statedDays(lower) ?? 7 });
  else if (/\b(fatigued?|exhausted|drained|burn(?:ed|t) out|run down|no energy|wiped|overtrained|so tired|really tired|barely slept|didn'?t sleep|no sleep|slept \d hours?)\b/.test(lower)) raw.push({ type: 'log_note', noteKind: 'fatigue', text, area: null, days: statedDays(lower) ?? 2 });
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
