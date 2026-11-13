import type { CreatedGoal } from '../components/GoalBuilder';
import type { GoalPrediction } from './goalFeasibility';
import { liftTypical, raceGainScale, raceMiles, reachableSeconds, volumeForRace } from './goalFeasibility';
import { secondsToClock } from './goalInput';
import { localDayIso } from './time';

/* THE COACH OFFERS THE GOAL, NOT JUST A FORM.

   Somebody opening "new goal" mostly does not know what number to type. A
   coach would say: here is one you can hit in a few weeks, here is the one a
   good block gets you, and here is the one that will take everything you
   have. Each comes with a date and the pace that gets there, built from the
   same model that will later judge the goal on its card, so a suggestion can
   never be called "too steep" the moment it is saved.

   Typing your own goal is still fine; these sit above the fields. */

export type SuggestionTier = 'quick' | 'attainable' | 'stretch';

export type GoalSuggestion = {
  tier: SuggestionTier;
  /* "Quick win", "Attainable", "Stretch". */
  name: string;
  /* What goes in the Target field: "375", "21:30", "1:45:00". */
  targetText: string;
  /* Human readable target: "375 lb", "21:30". */
  label: string;
  date: string;
  dateLabel: string;
  /* How you get there, in one line. */
  how: string;
  /* How the goal card will read it once saved. */
  verdict: 'Realistic' | 'Ambitious' | 'Test it' | 'Breaks a plateau';
  goal: CreatedGoal;
};

/* What the Goals page knows about a draft goal: the number its card would
   show today, and the prediction the card would draw. */
export type GoalJudge = (goal: CreatedGoal) => { now: number | null; model?: GoalPrediction; p?: GoalPrediction };

export type GoalDraft = {
  type: 'Strength' | 'Endurance' | 'Body Composition';
  exercise?: string;
  unit: string;
  metric?: string;
  current?: string;
  /* Body weight only. */
  direction?: 'lose' | 'gain';
};

const DAY = 86_400_000;
const addWeeks = (weeks: number, today = new Date()) => localDayIso(new Date(today.getTime() + Math.round(weeks * 7) * DAY));
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const trim = (value: number) => (Math.round(value * 10) / 10).toString();
const NAMES: Record<SuggestionTier, string> = { quick: 'Quick win', attainable: 'Attainable', stretch: 'Stretch' };

function base(draft: GoalDraft, targetText: string, date: string): CreatedGoal {
  const unit = draft.unit;
  const lift = draft.exercise || '';
  const title = draft.type === 'Strength' ? `${targetText} ${unit} ${lift}`
    : draft.type === 'Endurance' ? `${lift} · ${targetText} ${unit}`
    : `${targetText} ${unit} body-weight goal`;
  return {
    type: draft.type, title, target: `${targetText} ${unit}`.trim(), date,
    connection: draft.type === 'Endurance' ? 'Cardio only' : 'No fixed day',
    exercise: draft.type === 'Body Composition' ? '' : lift,
    metric: draft.type === 'Strength' ? 'Real 1RM' : draft.type === 'Body Composition' ? 'Body weight' : draft.metric || 'Finish time',
    current: draft.current || '', unit, trackingSource: 'Workout history', checkInFrequency: 'Automatic', reminderEnabled: false,
  };
}

/* ---------- strength: higher is better ---------- */

function liftStep(now: number, unit: string) {
  if (unit === 'kg') return now < 90 ? 1.25 : 2.5;
  return now < 200 ? 2.5 : 5;
}

function strength(draft: GoalDraft, judge: GoalJudge, today: Date): GoalSuggestion[] {
  const unit = draft.unit;
  if (unit !== 'lb' && unit !== 'kg') return [];
  const first = judge(base(draft, '9999', addWeeks(12, today)));
  const now = first.now;
  if (!now || !first.p || !first.model) return [];
  const step = liftStep(now, unit);
  const down = (value: number) => Math.floor(value / step + 1e-9) * step;
  const up = (value: number) => Math.ceil(value / step - 1e-9) * step;
  const show = (value: number) => trim(value);
  const out: Array<{ tier: SuggestionTier; target: number; weeks: number; how: string; test?: boolean }> = [];

  /* QUICK WIN. If the athlete's sets already estimate well past what they
     have tested, the fastest goal there is: test it — and the bigger goals
     then build from that estimate, since the test is what proves it. */
  const estimate = first.model.start;
  const testFirst = estimate - now >= 2 * step;
  const from = testFirst ? estimate : now;
  const curve = (weeks: number) => { const r = judge(base(draft, '9999', addWeeks(weeks, today))); return testFirst ? r.model : r.p; };
  if (testFirst) {
    out.push({ tier: 'quick', target: down(estimate), weeks: 3, test: true,
      how: `Your sets already estimate ${Math.round(estimate)}. Work up to a heavy single and it is yours.` });
  } else {
    /* A real step, not two pounds: the next plate past 1% more. */
    /* A real step, not two pounds: the next plate past 1% more on a steady
       block; failing that the next plate; failing that the best case. */
    const plate = down(now) + step;
    const tries: Array<[number, 'typical' | 'ceiling']> = [[up(now + Math.max(step, now * 0.01)), 'typical'], [plate, 'typical'], [plate, 'ceiling']];
    let pick: { target: number; weeks: number } | null = null;
    for (const [target, line] of tries) {
      for (let w = 3; w <= 10 && !pick; w++) { const p = curve(w); if (p && p[line] >= target) pick = { target, weeks: w }; }
      if (pick) break;
    }
    if (pick) out.push({ tier: 'quick', target: pick.target, weeks: pick.weeks, how: `+${trim((pick.target - now) / pick.weeks)} ${unit} a week. One heavier top set at a time.` });
  }

  /* ATTAINABLE: where a steady block lands — the athlete's own measured rate
     when the history shows one — pushed out until it is worth having. */
  const floor = Math.max(out[0]?.target ?? from, from);
  const worth = Math.max(floor + step, up(from * 1.025));
  let mid: { target: number; weeks: number; measured?: boolean } | null = null;
  for (let weeks = 12; weeks <= 26 && !mid; weeks += 2) {
    const p = curve(weeks);
    if (p && down(p.typical) >= worth) mid = { target: down(p.typical), weeks, measured: p.measured };
  }
  /* A slow recent pace: the furthest a steady block goes in six months,
     as long as it is still a step past the quick win. */
  if (!mid) for (let weeks = 16; weeks <= 26 && !mid; weeks += 2) {
    const p = curve(weeks);
    if (p && down(p.typical) >= floor + step && (weeks === 26 || down(curve(weeks + 2)?.typical ?? 0) <= down(p.typical))) mid = { target: down(p.typical), weeks, measured: p.measured };
  }
  if (!mid) for (let weeks = 12; weeks <= 26 && !mid; weeks += 2) { const p = curve(weeks); if (p && down(p.typical) >= floor + step) mid = { target: down(p.typical), weeks, measured: p.measured }; }
  /* STALLED: their own recent pace goes almost nowhere, so "attainable" by
     it would be a goal not worth setting. A steady block is the target, and
     getting there means changing the work — said plainly. */
  let plateau = false;
  if (!mid) {
    const target = down(liftTypical(from, 12));
    const pace = curve(12);
    if (target >= floor + step) {
      plateau = true;
      out.push({ tier: 'attainable', target, weeks: 12,
        how: `Your recent pace is near flat (+${trim(Math.max(0, ((pace?.typical ?? from) - from) / 12))} ${unit} a week). A steady block is +${trim((target - from) / 12)} — Forge changes the work to restart it.` });
    }
  }
  if (mid) out.push({ tier: 'attainable', target: mid.target, weeks: mid.weeks,
    how: `${testFirst ? `From the ${Math.round(estimate)} you test: ` : ''}+${trim((mid.target - from) / mid.weeks)} ${unit} a week — ${mid.measured ? 'the pace you have been gaining at' : 'a steady block'}. Forge adds weight as you earn it.` });

  /* STRETCH: two thirds of the way from a steady block to the best case.
     Every session, sleep and food dialed. */
  const midTarget = mid?.target ?? out.find(item => item.tier === 'attainable')?.target;
  const stretchWeeks = (mid?.weeks ?? 12) + 4;
  const sp = curve(stretchWeeks);
  if (sp) {
    const target = down(sp.typical + (sp.ceiling - sp.typical) * 2 / 3);
    if (target >= (midTarget ?? floor) + step) out.push({ tier: 'stretch', target, weeks: stretchWeeks,
      how: `+${trim((target - from) / stretchWeeks)} ${unit} a week. Every session, sleep and food dialed — this one takes everything.` });
  }

  return out.map(item => {
    const made = finish(draft, judge, item.tier, show(item.target), `${show(item.target)} ${unit}`, addWeeks(item.weeks, today), item.how, item.test, false, testFirst);
    return plateau && item.tier === 'attainable' && made.verdict === 'Ambitious' ? { ...made, verdict: 'Breaks a plateau' as const } : made;
  });
}

/* ---------- running: lower is better ---------- */

function raceStep(miles: number) {
  return miles <= 2 ? 2 : miles <= 4 ? 5 : miles <= 7 ? 10 : miles <= 14 ? 30 : 60;
}

function endurance(draft: GoalDraft, judge: GoalJudge, today: Date): GoalSuggestion[] {
  const miles = raceMiles(String(draft.exercise || ''));
  if (!miles || (draft.metric && draft.metric !== 'Finish time')) return [];
  const hours = /hh/.test(draft.unit) || miles >= 13;
  const probeGoal = (weeks: number) => base(draft, hours ? '0:01:00' : '0:01', addWeeks(weeks, today));
  const first = judge(probeGoal(12));
  const now = first.now;
  /* No logged runs to predict from: a typed current time is enough to start. */
  const typed = !first.p;
  if (!now) return [];
  const step = raceStep(miles);
  const up = (value: number) => Math.ceil(value / step - 1e-9) * step;
  const clock = (value: number) => secondsToClock(value, hours);
  const estimate = first.model?.start ?? now;
  const testFirst = now - estimate >= 2 * step;
  const from = testFirst ? estimate : now;
  const at = (weeks: number) => {
    if (!typed) { const r = judge(probeGoal(weeks)); return testFirst ? r.model : r.p; }
    /* The card's own two curves: typical is 60% of the best-case rate. */
    return { start: now, typical: reachableSeconds(now, weeks, 0.01 * 0.6 / raceGainScale(miles).rate, miles), ceiling: reachableSeconds(now, weeks, 0.01, miles), target: 0, better: 'lower' as const, weeks };
  };
  const paceText = (target: number, weeks: number) => {
    const perMile = (from - target) / miles / weeks;
    const volume = Math.round(volumeForRace(target / miles, miles));
    return `${trim(perMile)} sec/mi faster a week, built on about ${volume} miles a week.`;
  };
  const down = (value: number) => Math.floor(value / step + 1e-9) * step;
  const out: Array<{ tier: SuggestionTier; target: number; weeks: number; how: string; test?: boolean }> = [];

  if (testFirst) {
    out.push({ tier: 'quick', target: up(estimate), weeks: 3, test: true, how: `Your runs already say ${clock(estimate)}. Race the distance and it is yours.` });
  } else {
    const next = down(now - Math.max(step, now * 0.01));
    let weeks = 0;
    for (let w = 3; w <= 10 && !weeks; w++) { const p = at(w); if (p && p.typical <= next) weeks = w; }
    for (let w = 3; w <= 10 && !weeks; w++) { const p = at(w); if (p && p.ceiling <= next) weeks = w; }
    if (weeks) out.push({ tier: 'quick', target: next, weeks, how: paceText(next, weeks) });
  }
  const floor = Math.min(out[0]?.target ?? from, from);
  const worth = Math.min(floor - step, down(from * 0.975));
  let mid: { target: number; weeks: number } | null = null;
  for (let weeks = 12; weeks <= 26 && !mid; weeks += 2) {
    const p = at(weeks);
    if (p && up(p.typical) <= worth) mid = { target: up(p.typical), weeks };
  }
  if (!mid) { const p = at(20); if (p && up(p.typical) <= floor - step) mid = { target: up(p.typical), weeks: 20 }; }
  if (mid) out.push({ tier: 'attainable', target: mid.target, weeks: mid.weeks, how: `${testFirst ? `From the ${clock(estimate)} you race: ` : ''}${paceText(mid.target, mid.weeks)}` });
  const stretchWeeks = (mid?.weeks ?? 12) + 4;
  const sp = at(stretchWeeks);
  if (sp) {
    const target = up(sp.typical - (sp.typical - sp.ceiling) * 2 / 3);
    if (target <= (mid?.target ?? floor) - step) out.push({ tier: 'stretch', target, weeks: stretchWeeks, how: `${paceText(target, stretchWeeks)} Every run counts.` });
  }
  const unit = hours ? 'hh:mm:ss' : 'mm:ss';
  const withUnit = { ...draft, unit };
  return out.map(item => finish(withUnit, judge, item.tier, clock(item.target), clock(item.target), addWeeks(item.weeks, today), item.how, item.test, typed, testFirst));
}

/* ---------- body weight: the athlete says which way ---------- */

/* Rates a coach would sign off on: loss at ½–1% of body weight a week, gain
   at ¼–½% so it is mostly muscle. */
const BODY_RATES = { lose: { quick: 0.005, attainable: 0.005, stretch: 0.009 }, gain: { quick: 0.0025, attainable: 0.0025, stretch: 0.005 } };
const BODY_WEEKS = { quick: 4, attainable: 12, stretch: 12 };

function body(draft: GoalDraft, judge: GoalJudge, today: Date): GoalSuggestion[] {
  const now = judge(base(draft, '0', addWeeks(12, today))).now;
  if (!now) return [];
  const direction = draft.direction || 'lose';
  const unit = draft.unit;
  const round = unit === 'kg' ? (value: number) => Math.round(value * 2) / 2 : (value: number) => Math.round(value);
  const calories = unit === 'kg' ? 7700 / 7 : 3500 / 7;
  return (['quick', 'attainable', 'stretch'] as SuggestionTier[]).map(tier => {
    const weeks = BODY_WEEKS[tier];
    const rate = BODY_RATES[direction][tier];
    const change = now * rate * weeks;
    const target = round(direction === 'lose' ? now - change : now + change);
    const per = Math.abs(target - now) / weeks;
    const kcal = Math.round(per * calories / 50) * 50;
    const how = direction === 'lose'
      ? `−${trim(per)} ${unit} a week: about ${kcal} calories under maintenance a day. Forge keeps the lifting heavy so it comes off fat.`
      : `+${trim(per)} ${unit} a week: about ${kcal} calories over maintenance a day. Lift heavy so it goes on as muscle.`;
    const date = addWeeks(weeks, today);
    return { tier, name: NAMES[tier], targetText: trim(target), label: `${trim(target)} ${unit}`, date, dateLabel: dateLabel(date), how,
      verdict: tier === 'stretch' ? 'Ambitious' : 'Realistic', goal: base(draft, trim(target), date) } as GoalSuggestion;
  }).filter(item => Math.abs(Number(item.targetText) - now) >= (unit === 'kg' ? 0.5 : 1));
}

function finish(draft: GoalDraft, judge: GoalJudge, tier: SuggestionTier, targetText: string, label: string, date: string, how: string, test: boolean | undefined, typed = false, fromModel = false): GoalSuggestion {
  const goal = base(draft, targetText, date);
  /* The card's own reading of the finished goal, so the suggestion says what
     the card will say. */
  let verdict: GoalSuggestion['verdict'] = tier === 'stretch' ? 'Ambitious' : 'Realistic';
  if (test) verdict = 'Test it';
  else if (!typed) {
    const judged = judge(goal);
    const p = fromModel ? (judged.model ? { ...judged.model, target: judged.p?.target ?? judged.model.target } : undefined) : judged.p;
    if (p) {
      const reach = (value: number) => p.better === 'lower' ? value <= p.target : value >= p.target;
      verdict = reach(p.typical) ? 'Realistic' : 'Ambitious';
    }
  }
  return { tier, name: NAMES[tier], targetText, label, date, dateLabel: dateLabel(date), how, verdict, goal };
}

export function suggestGoals(draft: GoalDraft, judge: GoalJudge, today = new Date()): GoalSuggestion[] {
  try {
    if (draft.type === 'Strength') return strength(draft, judge, today);
    if (draft.type === 'Endurance') return endurance(draft, judge, today);
    if (draft.type === 'Body Composition') return body(draft, judge, today);
  } catch { /* a suggestion is a convenience; the form still works */ }
  return [];
}

/* A GOAL THAT IS SLIPPING NEEDS A WIN SOON. The big goal stays; the coach
   offers a stepping stone a few weeks out so the athlete has something to hit
   now. Only for goals that are not on track. */
export function quickWinFor(goal: CreatedGoal, judge: GoalJudge, today = new Date()): GoalSuggestion | null {
  const type = goal.type === 'Strength' ? 'Strength' : goal.type === 'Endurance' ? 'Endurance' : null;
  if (!type) return null;
  const unit = goal.unit || String(goal.target || '').split(' ').slice(1).join(' ');
  const quick = suggestGoals({ type, exercise: goal.exercise, unit, metric: goal.metric, current: goal.current }, judge, today).find(item => item.tier === 'quick');
  if (!quick || quick.date >= goal.date) return null;
  return quick;
}
