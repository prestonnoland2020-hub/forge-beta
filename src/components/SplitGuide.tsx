import { useMemo, useState } from 'react';
import { useGoals } from '../features/goals/GoalsProvider';
import { isProgrammableStrength, useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import { cardioPlanSummary } from './CardioPlanBuilder';
import { TEMPLATES, cardioPresets, SPLIT_MUSCLES, durationForDay, type DayType, type TrainingDay } from '../features/splits/splitModel';
import { coreFirst } from '../lib/coreLifts';
import { canonicalLiftKey } from '../lib/liftAliases';
import { tap } from '../lib/haptics';
import { Icon } from './Icon';
import { SearchField } from './SearchField';

/* BUILD YOUR SPLIT, ONE QUESTION AT A TIME.

   The split editor is a good place to change a split and a hard place to make
   one: a list of days, a sheet per day, five day types, a library of lifts and
   a cardio panel, all assuming you already know what a split is and what a
   "top set" means. Someone new opened it and did not know what they were
   building.

   This asks one thing per screen, says in plain words what each choice does,
   and shows where you are. It edits a draft and hands the finished split back
   — the split page saves it and takes the athlete to Today, which is the first
   place the split shows up. Nothing is saved until the last step. */

export type GuideResult = { name: string; rhythm: 'rolling' | 'weekly'; days: TrainingDay[] };
type Step =
  | { kind: 'intro' }
  | { kind: 'start' }
  | { kind: 'count' }
  | { kind: 'schedule' }
  | { kind: 'day'; index: number; part: 'type' | 'lifts' | 'cardio' | 'rest' }
  | { kind: 'review' };

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const blankDay = (index: number): TrainingDay => ({ name: `Day ${index + 1}`, weekday: WEEKDAYS[index % 7], dayType: 'strength', muscles: [], exercises: [], cardioPolicy: 'none', cardio: [], recoveryStyle: 'Full rest', strengthDuration: '60', maxDuration: '60' });

/* What each kind of day is, said once, the way a person would ask for it. */
const DAY_KINDS: Array<{ type: DayType; label: string; says: string }> = [
  { type: 'strength', label: 'Lifting', says: 'Strength training. Next you pick the main lifts.' },
  { type: 'cardio', label: 'Cardio', says: 'Running, biking or rowing — no lifting.' },
  { type: 'mixed', label: 'Lifting + cardio', says: 'Both on the same day: lifts first, then cardio.' },
  { type: 'rest', label: 'Rest', says: 'A day off, or something light to recover.' },
  { type: 'hyrox', label: 'HYROX', says: 'A HYROX session Forge writes for you.' },
];
const REST_STYLES: Array<{ style: TrainingDay['recoveryStyle']; says: string }> = [
  { style: 'Full rest', says: 'Nothing planned. Recover.' },
  { style: 'Mobility', says: 'Stretching and mobility work.' },
  { style: 'Active recovery', says: 'An easy walk, swim or spin.' },
];
const kindLabel = (type: DayType) => DAY_KINDS.find(kind => kind.type === type)?.label || type;
const lifts = (day: TrainingDay) => day.dayType === 'strength' || day.dayType === 'mixed';
const cardio = (day: TrainingDay) => day.dayType === 'cardio' || day.dayType === 'mixed';

/* The parts a day walks through, in order. */
const partsFor = (day: TrainingDay): Array<'type' | 'lifts' | 'cardio' | 'rest'> =>
  ['type', ...(lifts(day) ? ['lifts' as const] : []), ...(cardio(day) ? ['cardio' as const] : []), ...(day.dayType === 'rest' ? ['rest' as const] : [])];

export const describeDay = (day: TrainingDay) => {
  if (day.dayType === 'rest') return day.recoveryStyle === 'Full rest' ? 'Rest day' : `Rest · ${day.recoveryStyle}`;
  if (day.dayType === 'hyrox') return 'HYROX · Forge writes the session';
  const liftText = lifts(day) ? (day.exercises.length ? day.exercises.join(' · ') : 'No lifts picked') : '';
  const cardioText = cardio(day) ? (day.cardioPolicy === 'planned' && day.cardio.length ? cardioPlanSummary(day.cardio[0]) : 'Cardio · Forge recommends') : '';
  return [liftText, cardioText].filter(Boolean).join(' + ');
};

export function SplitGuide({ initialName, metric, onCancel, onFinish }: {
  initialName?: string;
  metric: boolean;
  onCancel: () => void;
  onFinish: (result: GuideResult) => void | Promise<void>;
}) {
  const { goals } = useGoals();
  const { exercises: library, addExercise } = useTrainingLibrary();
  const strength = useMemo(() => library.filter(exercise => exercise.enabled && isProgrammableStrength(exercise)), [library]);
  const goalKeys = useMemo(() => new Set(goals.filter(goal => goal.type === 'Strength' && goal.exercise).map(goal => canonicalLiftKey(String(goal.exercise)))), [goals]);

  const [step, setStep] = useState<Step>({ kind: 'intro' });
  const [history, setHistory] = useState<Step[]>([]);
  const [name, setName] = useState(initialName && initialName !== 'Forge starter split' ? initialName : 'My split');
  const [rhythm, setRhythm] = useState<'rolling' | 'weekly'>('rolling');
  const [days, setDays] = useState<TrainingDay[]>([]);
  const [fromTemplate, setFromTemplate] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<{ name: string; muscles: string[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const go = (next: Step) => { tap(); setHistory(items => [...items, step]); setStep(next); setQuery(''); setCreating(null); };
  const back = () => { const previous = history[history.length - 1]; if (!previous) return; tap(); setStep(previous); setHistory(history.slice(0, -1)); setQuery(''); setCreating(null); };
  const updateDay = (index: number, change: Partial<TrainingDay>) => setDays(items => items.map((day, at) => {
    if (at !== index) return day;
    const next = { ...day, ...change };
    next.maxDuration = durationForDay(next);
    return next;
  }));

  /* After the last part of a day, the next day; after the last day, review. */
  const nextAfter = (index: number, part: 'type' | 'lifts' | 'cardio' | 'rest', day = days[index]): Step => {
    const parts = partsFor(day);
    const at = parts.indexOf(part);
    if (at >= 0 && at < parts.length - 1) return { kind: 'day', index, part: parts[at + 1] };
    return index < days.length - 1 ? { kind: 'day', index: index + 1, part: 'type' } : { kind: 'review' };
  };

  const mainMuscle = (exercise: { name: string; muscles: string[] }) => /deadlift/i.test(exercise.name) ? 'Hamstrings' : exercise.muscles[0];
  const pickTemplate = (id: string) => {
    const template = TEMPLATES.find(item => item.id === id);
    if (!template) return;
    const taken = new Set<string>();
    setDays(template.days.map(([dayName, dayType, dayMuscles], index) => {
      const picks = dayType === 'strength' ? coreFirst(strength.filter(exercise => dayMuscles.includes(mainMuscle(exercise))).map(exercise => exercise.name)).filter(item => !taken.has(item)).slice(0, 2) : [];
      picks.forEach(item => taken.add(item));
      return { ...blankDay(index), name: dayName, dayType, muscles: dayMuscles, exercises: picks, cardioPolicy: dayType === 'cardio' || dayType === 'mixed' ? 'forge' : 'none' };
    }));
    setName(template.label);
    setFromTemplate(true);
    go({ kind: 'schedule' });
  };
  const setCount = (count: number) => {
    setDays(items => Array.from({ length: count }, (_, index) => items[index] || blankDay(index)));
    setFromTemplate(false);
    go({ kind: 'schedule' });
  };
  const setKind = (index: number, type: DayType) => {
    const day = days[index];
    updateDay(index, {
      dayType: type,
      ...(type === 'cardio' || type === 'rest' || type === 'hyrox' ? { muscles: [], exercises: [] } : {}),
      cardioPolicy: type === 'cardio' || type === 'mixed' ? (day.cardioPolicy === 'planned' ? 'planned' : 'forge') : 'none',
      ...(type === 'cardio' || type === 'mixed' ? {} : { cardio: [] }),
      /* A day still called "Day 3" takes the name of what it is. */
      ...(/^Day \d+$/.test(day.name) ? { name: type === 'rest' ? 'Rest' : type === 'cardio' ? 'Cardio' : type === 'hyrox' ? 'HYROX' : type === 'mixed' ? 'Lift + Cardio' : day.name } : {}),
    });
  };

  const finish = async () => {
    if (saving) return;
    setSaving(true);
    tap();
    try { await onFinish({ name: name.trim() || 'My split', rhythm, days }); } finally { setSaving(false); }
  };
  const leave = () => {
    if (days.length && !window.confirm('Leave the guide? Your split will not be saved.')) return;
    onCancel();
  };

  /* WHERE YOU ARE: four stages, the current one lit. */
  const stage = step.kind === 'intro' ? -1 : step.kind === 'start' || step.kind === 'count' ? 0 : step.kind === 'schedule' ? 1 : step.kind === 'day' ? 2 : 3;
  const STAGES = ['Start', 'Order', 'Your days', 'Review'];

  const body = (() => {
    if (step.kind === 'intro') return <>
      <h1>Let’s build your split</h1>
      <p className="sg-lede">Your <b>split</b> is the set of training days you repeat — like Upper, Lower, Rest. Forge uses it to decide what’s on <b>Today</b> each day.</p>
      <ol className="sg-preview">
        <li><b>1</b><span>Choose how many days</span></li>
        <li><b>2</b><span>Set up each day — lifting, cardio or rest</span></li>
        <li><b>3</b><span>Check it and save</span></li>
      </ol>
      <p className="sg-quiet">About two minutes. You can change anything later.</p>
    </>;
    if (step.kind === 'start') return <>
      <h1>How do you want to start?</h1>
      <p className="sg-lede">A template fills in the days for you. You’ll still see every day before you save.</p>
      <div className="sg-cards">
        {TEMPLATES.map(template => <button type="button" key={template.id} className="sg-card" onClick={() => pickTemplate(template.id)}><strong>{template.label}</strong><small>{template.copy}</small></button>)}
        <button type="button" className="sg-card sg-card-plain" onClick={() => go({ kind: 'count' })}><strong>Build my own</strong><small>Start from blank days</small></button>
      </div>
    </>;
    if (step.kind === 'count') return <>
      <h1>How many days are in your split?</h1>
      <p className="sg-lede">Count every day in the cycle, rest days too. <b>1 is fine</b> — you’d do the same workout each time.</p>
      <div className="sg-count">{[1, 2, 3, 4, 5, 6, 7].map(count => <button type="button" key={count} className={days.length === count ? 'on' : ''} onClick={() => setCount(count)}>{count}</button>)}</div>
    </>;
    if (step.kind === 'schedule') return <>
      <h1>How should your days repeat?</h1>
      <div className="sg-cards">
        <button type="button" className={`sg-card${rhythm === 'rolling' ? ' on' : ''}`} onClick={() => { setRhythm('rolling'); go({ kind: 'day', index: 0, part: 'type' }); }}>
          <strong>In order <em className="sg-badge">Recommended</em></strong>
          <small>Day 1, then Day 2, then Day 3, and around again. Miss a day and nothing is skipped — Today just shows the next one.</small>
        </button>
        <button type="button" className={`sg-card${rhythm === 'weekly' ? ' on' : ''}`} onClick={() => { setRhythm('weekly'); go({ kind: 'day', index: 0, part: 'type' }); }}>
          <strong>On fixed weekdays</strong>
          <small>Each day belongs to a day of the week — Monday is always Upper, for example.</small>
        </button>
      </div>
      {fromTemplate && <p className="sg-quiet">Next you’ll check each of the {days.length} days in the template.</p>}
    </>;
    if (step.kind === 'day') {
      const day = days[step.index];
      const counter = <p className="sg-counter">Day {step.index + 1} of {days.length}</p>;
      if (step.part === 'type') return <>
        {counter}
        <h1>What kind of day is it?</h1>
        <label className="sg-field"><span>Name this day</span><input value={day.name} onChange={event => updateDay(step.index, { name: event.target.value })} placeholder="e.g. Upper, Legs, Long Run" /></label>
        <div className="sg-cards">{DAY_KINDS.map(kind => <button type="button" key={kind.type} className={`sg-card${day.dayType === kind.type ? ' on' : ''}`} aria-pressed={day.dayType === kind.type} onClick={() => { tap(); setKind(step.index, kind.type); }}><strong>{kind.label}</strong><small>{kind.says}</small></button>)}</div>
        {rhythm === 'weekly' && <div className="sg-field"><span>Which day of the week?</span><div className="sg-chips">{WEEKDAYS.map(weekday => <button type="button" key={weekday} className={day.weekday === weekday ? 'on' : ''} onClick={() => { tap(); updateDay(step.index, { weekday }); }}>{weekday[0] + weekday.slice(1).toLowerCase()}</button>)}</div></div>}
      </>;
      if (step.part === 'lifts') {
        const picked = day.exercises;
        const fits = strength.filter(exercise => !day.muscles.length || day.muscles.includes(mainMuscle(exercise)) || exercise.muscles.some(muscle => day.muscles.includes(muscle)));
        const suggested = coreFirst(fits.map(exercise => exercise.name)).filter(item => !picked.includes(item)).slice(0, 8);
        const typed = query.trim();
        const found = typed ? strength.filter(exercise => exercise.name.toLowerCase().includes(typed.toLowerCase()) && !picked.includes(exercise.name)).slice(0, 12) : [];
        const exists = Boolean(typed) && library.some(exercise => canonicalLiftKey(exercise.name) === canonicalLiftKey(typed));
        const toggleLift = (lift: string, liftMuscles?: string[]) => updateDay(step.index, picked.includes(lift)
          ? { exercises: picked.filter(item => item !== lift) }
          : { exercises: [...picked, lift], muscles: Array.from(new Set([...day.muscles, ...(liftMuscles || strength.find(item => item.name === lift)?.muscles.filter(muscle => SPLIT_MUSCLES.includes(muscle)) || [])])) });
        const saveNew = () => {
          if (!creating?.name.trim() || !creating.muscles.length) return;
          const liftName = creating.name.trim();
          addExercise({ name: liftName, kind: 'Strength', muscles: creating.muscles, detail: 'Custom · Weight + reps', enabled: true, custom: true, categories: ['Strength'] });
          toggleLift(liftName, creating.muscles);
          setCreating(null); setQuery('');
        };
        return <>
          {counter}
          <h1>Pick the main lifts for {day.name || 'this day'}</h1>
          {/* THE ONE IDEA A NEW LIFTER NEEDS, before they pick anything. */}
          <div className="sg-explain"><Icon name="star" /><p>Each lift you pick gets one <b>top set</b> — your heaviest working set. Forge sets its weight and tracks your progress. Do any other exercises you like around it.</p></div>
          <div className="sg-field"><span>What does this day train? <em>Optional — it helps Forge suggest lifts.</em></span><div className="sg-chips">{SPLIT_MUSCLES.map(muscle => <button type="button" key={muscle} className={day.muscles.includes(muscle) ? 'on' : ''} aria-pressed={day.muscles.includes(muscle)} onClick={() => { tap(); updateDay(step.index, { muscles: day.muscles.includes(muscle) ? day.muscles.filter(item => item !== muscle) : [...day.muscles, muscle] }); }}>{muscle}</button>)}</div></div>
          {picked.length > 0 && <div className="sg-field"><span>Your lifts ({picked.length}) — tap to remove</span><div className="sg-picked">{picked.map(lift => <button type="button" key={lift} onClick={() => { tap(); toggleLift(lift); }}><Icon name="check" />{lift}{goalKeys.has(canonicalLiftKey(lift)) && <em className="sg-badge">Goal lift</em>}</button>)}</div></div>}
          {suggested.length > 0 && <div className="sg-field"><span>{picked.length ? 'Add another' : 'Suggested — tap to add'}</span><div className="sg-chips">{suggested.map(lift => <button type="button" key={lift} onClick={() => { tap(); toggleLift(lift); }}>＋ {lift}</button>)}</div></div>}
          <div className="sg-field"><span>Looking for something else?</span>
            <SearchField value={query} onChange={setQuery} placeholder="Search or type a new lift" aria-label="Search lifts" />
            {found.length > 0 && <div className="sg-chips">{found.map(exercise => <button type="button" key={exercise.id} onClick={() => { tap(); toggleLift(exercise.name); setQuery(''); }}>＋ {exercise.name}</button>)}</div>}
            {typed && !exists && !creating && <button type="button" className="sg-create" onClick={() => { tap(); setCreating({ name: typed, muscles: day.muscles }); }}>＋ Create “{typed}” as a new lift</button>}
            {!typed && !creating && <button type="button" className="sg-create" onClick={() => { tap(); setCreating({ name: '', muscles: day.muscles }); }}>＋ Create a new lift</button>}
          </div>
          {creating && <div className="sg-new" role="group" aria-label="Create a lift">
            <label className="sg-field"><span>Lift name</span><input autoFocus value={creating.name} onChange={event => setCreating({ ...creating, name: event.target.value })} placeholder="e.g. Hip thrust" /></label>
            <div className="sg-field"><span>What does it train?</span><div className="sg-chips">{SPLIT_MUSCLES.map(muscle => <button type="button" key={muscle} className={creating.muscles.includes(muscle) ? 'on' : ''} onClick={() => { tap(); setCreating({ ...creating, muscles: creating.muscles.includes(muscle) ? creating.muscles.filter(item => item !== muscle) : [...creating.muscles, muscle] }); }}>{muscle}</button>)}</div></div>
            <div className="sg-new-actions"><button type="button" className="button ghost" onClick={() => setCreating(null)}>Cancel</button><button type="button" className="button" disabled={!creating.name.trim() || !creating.muscles.length} onClick={() => { tap(); saveNew(); }}>Create &amp; add</button></div>
          </div>}
        </>;
      }
      if (step.part === 'cardio') {
        const yours = day.cardioPolicy === 'planned';
        return <>
          {counter}
          <h1>Who plans the cardio on {day.name || 'this day'}?</h1>
          {/* THE DIFFERENCE, SIDE BY SIDE. "Forge decides" and "planned" were a
              policy switch nobody could explain; this says what each one does
              to the actual session. */}
          <div className="sg-cards two">
            <button type="button" className={`sg-card${!yours ? ' on' : ''}`} aria-pressed={!yours} onClick={() => { tap(); updateDay(step.index, { cardioPolicy: 'forge', cardio: [] }); }}>
              <strong>Forge recommends <em className="sg-badge">Easiest</em></strong>
              <small>Forge writes the session for you from your goals and recent runs — easy runs, tempo, intervals — and changes it week to week as you get fitter. Nothing to set.</small>
            </button>
            <button type="button" className={`sg-card${yours ? ' on' : ''}`} aria-pressed={yours} onClick={() => { tap(); updateDay(step.index, { cardioPolicy: 'planned' }); }}>
              <strong>You decide</strong>
              <small>You pick the exact session, like an easy 30-minute run. It stays the same every time this day comes up.</small>
            </button>
          </div>
          <table className="sg-compare"><thead><tr><th /><th>Forge</th><th>You</th></tr></thead><tbody>
            <tr><td>Picks the session</td><td>Forge</td><td>You</td></tr>
            <tr><td>Changes as you improve</td><td><Icon name="check" /></td><td>—</td></tr>
            <tr><td>Same session every time</td><td>—</td><td><Icon name="check" /></td></tr>
          </tbody></table>
          {yours && <div className="sg-field"><span>Pick your session</span><div className="sg-chips">{cardioPresets(metric).map(preset => {
            const on = day.cardio.some(plan => cardioPlanSummary(plan) === cardioPlanSummary({ ...preset.plan, id: 0 }));
            return <button type="button" key={preset.label} className={on ? 'on' : ''} onClick={() => { tap(); updateDay(step.index, { cardioPolicy: 'planned', cardio: on ? [] : [{ ...preset.plan, id: Date.now() }] }); }}>{preset.label}</button>;
          })}</div><small className="sg-quiet">You can fine-tune it later in your split.</small></div>}
        </>;
      }
      return <>
        {counter}
        <h1>What kind of rest?</h1>
        <div className="sg-cards">{REST_STYLES.map(item => <button type="button" key={item.style} className={`sg-card${day.recoveryStyle === item.style ? ' on' : ''}`} aria-pressed={day.recoveryStyle === item.style} onClick={() => { tap(); updateDay(step.index, { recoveryStyle: item.style }); }}><strong>{item.style}</strong><small>{item.says}</small></button>)}</div>
      </>;
    }
    return <>
      <h1>Here’s your split</h1>
      <p className="sg-lede">{days.length} {days.length === 1 ? 'day' : 'days'}, {rhythm === 'rolling' ? 'repeating in order' : 'on fixed weekdays'}. Tap a day to change it.</p>
      <label className="sg-field"><span>Name your split</span><input value={name} onChange={event => setName(event.target.value)} /></label>
      <ol className="sg-review">{days.map((day, index) => <li key={index}><button type="button" onClick={() => go({ kind: 'day', index, part: 'type' })}>
        <b>{rhythm === 'weekly' ? day.weekday[0] + day.weekday.slice(1, 3).toLowerCase() : index + 1}</b>
        <span><strong>{day.name || `Day ${index + 1}`}</strong><small>{kindLabel(day.dayType)} · {describeDay(day)}</small></span>
        <em>Edit</em>
      </button></li>)}</ol>
      <p className="sg-quiet">When you save, you’ll go to Today and see {rhythm === 'rolling' ? `Day 1 — ${days[0]?.name || 'your first day'}` : 'today’s day'}.</p>
    </>;
  })();

  /* WHAT THE MAIN BUTTON DOES on this screen, and whether it can yet. */
  const primary = ((): { label: string; run: () => void; ready: boolean; hint?: string } | null => {
    if (step.kind === 'intro') return { label: 'Let’s go', run: () => go({ kind: 'start' }), ready: true };
    if (step.kind === 'start' || step.kind === 'count' || step.kind === 'schedule') return null;
    if (step.kind === 'day') {
      const day = days[step.index];
      if (step.part === 'lifts' && !day.exercises.length) return { label: 'Next', run: () => {}, ready: false, hint: 'Pick at least one lift' };
      if (step.part === 'cardio' && day.cardioPolicy === 'planned' && !day.cardio.length) return { label: 'Next', run: () => {}, ready: false, hint: 'Pick a session, or let Forge recommend' };
      const next = nextAfter(step.index, step.part, day);
      return { label: next.kind === 'review' ? 'Review my split' : next.kind === 'day' && next.index !== step.index ? `Next: Day ${next.index + 1}` : 'Next', run: () => go(next), ready: Boolean(day.name.trim()), hint: day.name.trim() ? undefined : 'Give this day a name' };
    }
    return { label: saving ? 'Saving…' : 'Save and see Today', run: () => void finish(), ready: !saving && days.length > 0 };
  })();

  return <div className="sg-backdrop" role="dialog" aria-modal="true" aria-label="Build your split">
    <section className="sg-sheet">
      <header className="sg-top">
        {history.length ? <button type="button" className="sg-icon" onClick={back} aria-label="Back"><Icon name="back" /></button> : <span className="sg-icon-space" />}
        {stage >= 0 ? <ol className="sg-stages" aria-label="Progress">{STAGES.map((label, index) => <li key={label} className={index < stage ? 'done' : index === stage ? 'now' : ''} aria-current={index === stage ? 'step' : undefined}><i />{label}</li>)}</ol> : <span className="sg-title">Split guide</span>}
        <button type="button" className="sg-icon" onClick={leave} aria-label="Close the guide">×</button>
      </header>
      <div className="sg-body">{body}</div>
      {(primary || step.kind === 'intro') && <footer className="sg-foot">
        {primary?.hint && !primary.ready && <small>{primary.hint}</small>}
        {step.kind === 'intro' && <button type="button" className="button ghost" onClick={onCancel}>Not now</button>}
        {primary && <button type="button" className="button" disabled={!primary.ready} onClick={primary.run}>{primary.label}</button>}
      </footer>}
    </section>
  </div>;
}
