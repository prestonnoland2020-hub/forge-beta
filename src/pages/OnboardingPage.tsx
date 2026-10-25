import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useProfileSetup, type AthleteSetup } from '../features/profile/ProfileSetupProvider';
import { saveProfile } from '../features/profile/profileService';
import { saveTrainingSplit } from '../features/splits/splitService';
import { useGoals } from '../features/goals/GoalsProvider';
import { type CreatedGoal } from '../components/GoalBuilder';
import { isProgrammableStrength, useTrainingLibrary, type LibraryExercise } from '../features/training/TrainingLibraryProvider';
import { canonicalLiftKey } from '../lib/liftAliases';
import { coreFirst, coreOnly, CORE_LIFTS, CORE_LIFT_LABELS, isWeightedBodyweight } from '../lib/coreLifts';
import { normalizeGoalValue } from '../lib/goalInput';
import { createNote, extractArea, saveNote } from '../features/training/athleteNotesService';

/* ONE QUESTION A SCREEN. Setup was three dense screens — a form of six
   controls, the full goal builder, and a lift picker per day — headed by
   taglines nobody could parse. Now every screen asks one plain question, most
   answer with a single tap that moves on, and the only typing is a name and a
   target number.

   What Forge needs to write week one has not changed: a name, a focus, days a
   week, one goal, a split whose lifting days each name a movement, a runner's
   weekly miles, and the safety promise. So:

     name → focus → days → goal → target → running → your week

   The goal pair is skipped when goals already exist (editing a profile), the
   lift/race pick when the goal is a body weight, and running when the split
   has no cardio. Everything the builder offers beyond the common case —
   custom events, pace metrics, other lifts — is one tap away on Goals. */
type StepId = 'name' | 'focus' | 'days' | 'goal' | 'target' | 'running' | 'week';

const blank: AthleteSetup = {
  displayName: '', username: '', birthDate: '', units: 'Imperial', height: '', startingWeight: '', currentWeight: '',
  primaryFocus: 'Hybrid', strengthExperience: 'Intermediate', runningExperience: 'Recreational', trainingDays: 4,
  runningDays: 0, weeklyMileage: 0, longestRun: 0, strengthSessionMinutes: 60, cardioSessionMinutes: 45,
  combinedSessionMinutes: 75, scheduleStyle: 'Rolling cycle', equipment: '', environment: 'Mixed',
  splitSource: 'Recommended', splitDays: [], injuryConstraint: false, limitationNotes: '', wearableIntent: 'Connect later',
  profileVisibility: 'Private', acceptedSafety: false, completedAt: '',
};

/* Imperial for the US, Liberia and Myanmar; metric everywhere else. A guess
   the athlete can flip in one tap, not a question. */
const guessUnits = (): AthleteSetup['units'] => {
  try { return /-(US|LR|MM)$/i.test(navigator.language || '') ? 'Imperial' : 'Metric'; } catch { return 'Imperial'; }
};

const focusCards: Array<{ id: AthleteSetup['primaryFocus']; label: string; copy: string }> = [
  { id: 'Strength', label: 'Get stronger', copy: 'Lift more on the big lifts' },
  { id: 'Endurance', label: 'Run faster', copy: 'Train for a race or a time' },
  { id: 'Hybrid', label: 'Both', copy: 'Strength and running together' },
  { id: 'Body composition', label: 'Change my weight', copy: 'Lose or gain, steadily' },
];

/* The races a first goal is almost always one of. The distance decides the
   clock: anything a recreational runner finishes inside an hour is mm:ss. */
const races = [
  { name: '1 Mile Run', label: '1 mile', unit: 'mm:ss', placeholder: '7:30' },
  { name: '5K Run', label: '5K', unit: 'mm:ss', placeholder: '25:00' },
  { name: '10K Run', label: '10K', unit: 'mm:ss', placeholder: '52:00' },
  { name: 'Half Marathon', label: 'Half marathon', unit: 'hh:mm:ss', placeholder: '1:55:00' },
  { name: 'Marathon', label: 'Marathon', unit: 'hh:mm:ss', placeholder: '3:59:00' },
  { name: 'HYROX', label: 'HYROX', unit: 'hh:mm:ss', placeholder: '1:25:00' },
];
const hyroxDivisions = ["Women's Open", "Men's Open", "Women's Pro", "Men's Pro"];

/* Ranges, not a dial. Nobody knows their weekly mileage to the mile on day
   one, and the ramp only needs to know where to start. */
const mileageChoices = {
  Imperial: [['Not running yet', 0], ['Under 10 miles', 5], ['10–20 miles', 15], ['20–30 miles', 25], ['30+ miles', 35]],
  Metric: [['Not running yet', 0], ['Under 15 km', 8], ['15–30 km', 22], ['30–50 km', 40], ['50+ km', 55]],
} as const;

/* THE COLONS ARE TYPED FOR THEM. iOS's number pad has no colon key, so a
   time field that wants "24:30" and opens the number pad cannot be filled on
   a phone. Digits are grouped from the right as they arrive: 2430 → 24:30,
   15500 → 1:55:00. A bare one or two digits stay minutes. */
export const formatClock = (raw: string) => {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d{3})/, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, -2)}:${digits.slice(-2)}`;
  return `${digits.slice(0, -4)}:${digits.slice(-4, -2)}:${digits.slice(-2)}`;
};

const weeksFromNow =(weeks: number) => { const date = new Date(); date.setDate(date.getDate() + weeks * 7); return date.toISOString().slice(0, 10); };
const goalWeeks = [8, 12, 16];

export function starterSplit(focus: AthleteSetup['primaryFocus'], count: number): AthleteSetup['splitDays'] {
  const strength = [
    { name: 'Chest & Back', type: 'Strength' as const, muscles: ['Chest', 'Back'] },
    { name: 'Shoulders & Arms', type: 'Strength' as const, muscles: ['Shoulders', 'Biceps', 'Triceps'] },
    { name: 'Lower Body', type: 'Strength' as const, muscles: ['Quads', 'Hamstrings', 'Glutes'] },
  ];
  const endurance = [
    { name: 'Quality Cardio', type: 'Cardio' as const, muscles: [] },
    { name: 'Easy Cardio', type: 'Cardio' as const, muscles: [] },
    { name: 'Long Cardio', type: 'Cardio' as const, muscles: [] },
  ];
  const source = focus === 'Strength' ? strength : focus === 'Endurance' ? endurance : [strength[0], endurance[0], strength[1], strength[2]];
  /* EVERY DAY GETS ITS OWN NAME. The plan matches days by name, so a 4-day
     strength split with "Chest & Back" twice was one day to the plan and two
     to the cursor. A repeat is numbered: Chest & Back, …, Chest & Back 2. */
  return Array.from({ length: Math.max(1, Math.min(7, count)) }, (_, index) => {
    const day = source[index % source.length];
    const repeat = Math.floor(index / source.length);
    return repeat ? { ...day, name: `${day.name} ${repeat + 1}` } : day;
  });
}

/* ONE LIFT PER LIFTING DAY, CHOSEN FOR THEM. The goal lift lands on the first
   day whose muscles it trains; every other day gets its first core lift.
   Nothing is asked that a starter split can answer itself. */
export function defaultLifts(days: AthleteSetup['splitDays'], library: LibraryExercise[], goalLifts: string[]): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  const goalKeys = new Set(goalLifts.map(canonicalLiftKey));
  const placedGoals = new Set<string>();
  days.forEach((day, index) => {
    if (day.type !== 'Strength' && day.type !== 'Mixed') return;
    if (day.exercises?.length) { out[index] = [...day.exercises]; return; }
    const muscles = day.muscles || [];
    const fits = library.filter(exercise => !muscles.length || exercise.muscles.some(muscle => muscles.includes(muscle)));
    const goal = fits.find(exercise => goalKeys.has(canonicalLiftKey(exercise.name)) && !placedGoals.has(canonicalLiftKey(exercise.name)));
    if (goal) { out[index] = [goal.name]; placedGoals.add(canonicalLiftKey(goal.name)); return; }
    /* A repeat day takes the next core lift, so Chest & Back 2 gets a row
       rather than a second bench day. */
    const used = new Set(Object.values(out).flat().map(canonicalLiftKey));
    const ordered = coreFirst(fits.map(exercise => exercise.name));
    const first = ordered.find(name => !used.has(canonicalLiftKey(name))) || ordered[0];
    out[index] = first ? [first] : [];
  });
  return out;
}

/* THE FORM READS THE PROFILE AND THE GOALS ONCE, on its first render, so it
   must not be mounted before both have arrived — which steps exist depends on
   whether this athlete already has a goal. */
export function OnboardingPage() {
  const { loading } = useProfileSetup();
  const { hydrated } = useGoals();
  if (loading || !hydrated) return <main className="profile-loading"><span className="forge-mark">—</span><strong>FORGE</strong><p>Loading your training profile…</p></main>;
  return <OnboardingForm />;
}

function OnboardingForm() {
  const { user } = useAuth();
  const { setup, saveSetup } = useProfileSetup();
  const { goals, saveGoal } = useGoals();
  const { updateProfile } = useAdaptiveTraining();
  const navigate = useNavigate();
  const location = useLocation();
  const suggestedName = String(user?.user_metadata?.full_name || user?.email?.split('@')[0] || '');
  const needsGoal = Boolean((location.state as { needsGoal?: boolean } | null)?.needsGoal);
  const needsExercises = Boolean((location.state as { needsExercises?: boolean } | null)?.needsExercises);
  const isEditing = Boolean(setup?.completedAt);
  const editingFreely = isEditing && !needsGoal && !needsExercises;
  /* Decided once: a goal saved on the last screen must not make the goal
     screens vanish from under the progress bar mid-save. */
  const [askGoal] = useState(() => !goals.length);

  const [data, setData] = useState<AthleteSetup>(() => ({ ...blank, units: guessUnits(), ...(setup || {}), displayName: setup?.displayName || suggestedName }));
  const set = <K extends keyof AthleteSetup>(key: K, value: AthleteSetup[K]) => { setError(''); setData(current => ({ ...current, [key]: value })); };
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);

  /* THE GOAL IS HELD, NOT SAVED, until Enter Forge. Saving it on its own
     screen meant Back-and-change wrote a second goal; held here, the last
     answer is the only one that lands. */
  const [goalExercise, setGoalExercise] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');
  const [goalDate, setGoalDate] = useState(() => weeksFromNow(12));
  const [pickDate, setPickDate] = useState(false);
  const [pullUpReps, setPullUpReps] = useState(true);
  const [division, setDivision] = useState('');

  const { exercises: libraryExercises } = useTrainingLibrary();
  const strengthLibrary = useMemo(() => libraryExercises.filter(exercise => exercise.enabled && isProgrammableStrength(exercise)), [libraryExercises]);
  const liftChoices = useMemo(() => {
    const names = coreOnly(strengthLibrary.map(exercise => exercise.name));
    return names.length ? names : [...CORE_LIFTS];
  }, [strengthLibrary]);
  const plannedDays = useMemo(() => data.splitDays?.length ? data.splitDays : starterSplit(data.primaryFocus, data.trainingDays), [data.splitDays, data.primaryFocus, data.trainingDays]);
  const runningPlanned = plannedDays.some(day => /Cardio|Mixed/i.test(day.type));
  const plannedCardioDays = plannedDays.filter(day => /Cardio|Mixed/i.test(day.type)).length;

  const weightGoal = data.primaryFocus === 'Body composition';
  const race = races.find(item => item.name === goalExercise);
  const goalKind: 'lift' | 'race' | 'weight' = weightGoal ? 'weight' : race ? 'race' : 'lift';
  const massUnit = data.units === 'Metric' ? 'kg' : 'lb';
  const goalUnit = goalKind === 'race' ? race!.unit : goalKind === 'lift' && isWeightedBodyweight(goalExercise) && pullUpReps ? 'reps' : massUnit;
  const goalMetric = goalKind === 'race' ? 'Finish time' : goalKind === 'weight' ? 'Body weight' : 'Real 1RM';

  const steps = useMemo<StepId[]>(() => [
    'name', 'focus', 'days',
    ...(askGoal ? (weightGoal ? ['target'] : ['goal', 'target']) as StepId[] : []),
    ...(runningPlanned ? ['running'] as StepId[] : []),
    'week',
  ], [askGoal, weightGoal, runningPlanned]);
  const [stepId, setStepId] = useState<StepId>(needsExercises ? 'week' : needsGoal && askGoal ? (weightGoal ? 'target' : 'goal') : 'name');
  const stepIndex = Math.max(0, steps.indexOf(stepId));
  const go = (offset: number) => { setError(''); setStepId(steps[Math.min(steps.length - 1, Math.max(0, stepIndex + offset))]); window.scrollTo(0, 0); };
  /* A tap answers and moves on — with a beat in between, so the athlete sees
     which card they pressed before it slides away. */
  const tapThen = (apply: () => void) => { apply(); window.setTimeout(() => go(1), 160); };

  const pendingGoalLift = goalKind === 'lift' && goalExercise ? [goalExercise] : [];
  const goalLiftKeys = new Set([...goals.map(goal => goal.exercise ? String(goal.exercise) : ''), ...pendingGoalLift].filter(Boolean).map(canonicalLiftKey));

  /* The mapping is filled the first time the week is shown — after the goal
     is chosen, so the goal lift takes its day. Keyed by the split shape and
     the goal, so a changed focus, day count or lift reseeds. */
  const [dayExercises, setDayExercises] = useState<Record<number, string[]>>({});
  const [seededFor, setSeededFor] = useState('');
  const seedKey = `${plannedDays.map(day => `${day.name}:${day.type}`).join('|')}#${pendingGoalLift.join()}`;
  if (stepId === 'week' && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setDayExercises(defaultLifts(plannedDays, strengthLibrary, [...goals.filter(goal => goal.type === 'Strength' && goal.exercise).map(goal => String(goal.exercise)), ...pendingGoalLift]));
  }
  const [openDay, setOpenDay] = useState(-1);
  const toggleDayExercise = (index: number, name: string) => {
    setError('');
    setDayExercises(current => {
      const list = current[index] || [];
      return { ...current, [index]: list.includes(name) ? list.filter(item => item !== name) : [...list, name] };
    });
  };
  const optionsForDay = (index: number) => {
    const muscles = plannedDays[index]?.muscles || [];
    const chosen = dayExercises[index] || [];
    const options = strengthLibrary.filter(exercise => chosen.includes(exercise.name) || goalLiftKeys.has(canonicalLiftKey(exercise.name)) || !muscles.length || exercise.muscles.some(muscle => muscles.includes(muscle)));
    return coreFirst(options.map(item => item.name)).map(name => options.find(item => item.name === name)!).filter(Boolean);
  };
  const strengthDayIndexes = plannedDays.map((day, index) => ({ day, index })).filter(item => item.day.type === 'Strength' || item.day.type === 'Mixed');
  const unmappedDays = strengthDayIndexes.filter(item => !(dayExercises[item.index] || []).length);

  /* The same goal the builder writes, field for field, so Goals, the plan and
     the coach read it exactly as they read one made there. */
  const buildGoal = (target: string, current: string): CreatedGoal => {
    const label = CORE_LIFT_LABELS[goalExercise] || goalExercise;
    const common = { target: `${target} ${goalUnit}`, date: goalDate, metric: goalMetric, current, unit: goalUnit, trackingSource: 'Workout history', checkInFrequency: 'Automatic', reminderEnabled: false };
    if (goalKind === 'race') return { ...common, type: 'Endurance', title: `${goalExercise} · ${target} ${goalUnit}`, connection: 'Cardio only', exercise: goalExercise, eventTemplate: goalExercise === 'HYROX' ? 'hyrox-standard' : undefined, eventDivision: goalExercise === 'HYROX' ? division : undefined };
    if (goalKind === 'weight') return { ...common, type: 'Body Composition', title: `${target} ${goalUnit} body-weight goal`, connection: 'No fixed day', exercise: '' };
    return { ...common, type: 'Strength', title: `${target} ${goalUnit} ${label}`, connection: 'No fixed day', exercise: goalExercise };
  };
  const [pendingGoal, setPendingGoal] = useState<CreatedGoal | null>(null);

  const submitName = () => {
    if (!data.displayName.trim()) return setError('Enter your name.');
    go(1);
  };
  const submitTarget = () => {
    if (goalKind !== 'weight' && !goalExercise) return setError('Pick a goal first.');
    if (goalExercise === 'HYROX' && !division) return setError('Pick your HYROX division.');
    if (!goalTarget.trim()) return setError('Enter your target to continue.');
    const target = normalizeGoalValue(goalTarget, goalUnit, goalMetric);
    if (!target.ok) return setError(target.message);
    let current = '';
    if (goalCurrent.trim()) {
      const checked = normalizeGoalValue(goalCurrent, goalUnit, goalMetric);
      if (!checked.ok) return setError(`Right now: ${checked.message}`);
      current = checked.value;
    }
    if (goalKind === 'weight') {
      const weight = Number(target.value);
      if (weight < 40 || weight > 1500) return setError(`Enter a weight between 40 and 1500 ${massUnit}.`);
      if (current) set('currentWeight', current);
    }
    setGoalTarget(target.value); setGoalCurrent(current);
    setPendingGoal(buildGoal(target.value, current));
    go(1);
  };

  const finish = async () => {
    if (!isEditing && !data.acceptedSafety) return setError('Tick the safety box to finish.');
    /* THE GATE. Nothing below this line runs without a goal — not the profile
       write that sets onboarding_completed, and not saveSetup. */
    if (!goals.length && !pendingGoal) return setError('Set a goal first. Forge builds the plan around it.');
    if (unmappedDays.length) return setError(`Pick a movement for ${unmappedDays.map(item => item.day.name).join(', ')}.`);
    const weight = Number(data.currentWeight);
    const weightGiven = Boolean(String(data.currentWeight || '').trim()) && Number.isFinite(weight) && weight > 0;
    setSaving(true); setError('');
    const requested = (data.username || data.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '')).slice(0, 18);
    const splitDays = plannedDays.map((day, index) => ({ ...day, exercises: dayExercises[index] || [] }));
    try {
      /* THE SPLIT IS WRITTEN FIRST; the irreversible onboarding flag goes last,
         so a failure here is only ever a retry. */
      await saveTrainingSplit(setup?.splitSource === 'Custom' ? 'My training split' : 'Forge starter split', splitDays.map((day, index) => ({
        position: index + 1, name: day.name, muscleGroups: day.muscles || [], goalLifts: day.exercises || [],
        cardioTypes: day.type === 'Hyrox' ? ['HYROX'] : day.type === 'Cardio' || day.type === 'Mixed' ? ['Forge'] : [],
      })));
      try {
        const existing = JSON.parse(localStorage.getItem('forge-training-plan-v1') || 'null') as { days?: Array<Record<string, unknown>> } | null;
        const days = splitDays.map((day, index) => {
          const previous = existing?.days?.[index] as Record<string, unknown> | undefined;
          const dayType = day.type.toLowerCase();
          return {
            name: day.name, weekday: (previous?.weekday as string) || ['MON','TUE','WED','THU','FRI','SAT','SUN'][index % 7],
            dayType, muscles: day.muscles || [], exercises: day.exercises || [],
            cardioPolicy: dayType === 'rest' ? 'none' : (previous?.cardioPolicy as string) || 'forge',
            cardio: (previous?.cardio as unknown[]) || [], recoveryStyle: (previous?.recoveryStyle as string) || 'Full rest',
            strengthDuration: String(data.strengthSessionMinutes || 60), maxDuration: String(data.strengthSessionMinutes || 60),
          };
        });
        localStorage.setItem('forge-training-plan-v1', JSON.stringify({ name: 'My training split', rhythm: data.scheduleStyle === 'Weekly schedule' ? 'weekly' : 'rolling', days }));
      } catch { /* the account copy is the one that matters */ }
      const username = await saveProfile({
        username: requested.length >= 3 ? requested : `athlete${(user?.id || '').replace(/[^a-z0-9]/g, '').slice(0, 6) || 'fit'}`,
        displayName: data.displayName, birthDate: data.birthDate || null, heightCm: null,
        startingWeight: null, currentWeight: weightGiven ? weight : null,
        unitSystem: data.units === 'Metric' ? 'metric' : 'imperial', experienceLevel: 'intermediate',
        primaryGoal: data.primaryFocus === 'Strength' ? 'strength' : data.primaryFocus === 'Endurance' ? 'endurance' : data.primaryFocus === 'Body composition' ? 'weight_change' : 'general_fitness',
        equipment: [], preferredTrainingDays: Array.from({ length: data.trainingDays }, (_, index) => index),
      });
      /* A runner's days default to the cardio days in the split. Never more
         days than they train. */
      const runningDays = Math.min(data.trainingDays, data.runningDays || plannedCardioDays || 0);
      const completed = { ...data, username, runningDays, splitDays, splitSource: 'Recommended' as const, acceptedSafety: true, completedAt: new Date().toISOString() };
      /* The goal lands after every await, so a failed save above can be
         retried without writing it twice. */
      if (pendingGoal && !goals.length) saveGoal(pendingGoal, null);
      saveSetup(completed);
      updateProfile({ runningDays, injuryConstraint: data.injuryConstraint });
      /* "WHAT SHOULD FORGE AVOID?" GOES INTO THE BODY LOG, where the daily
         engine reads it — it used to reach only the circuit builder's prompt. */
      if (data.injuryConstraint && data.limitationNotes.trim() && !isEditing) void saveNote(createNote('injury', data.limitationNotes.trim(), extractArea(data.limitationNotes)));
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/onboarding' ? from : isEditing ? '/profile' : '/', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your profile could not be saved. Please try again.'); setSaving(false);
    }
  };

  const unitToggle = <div className="ob-units" role="radiogroup" aria-label="Units">{(['Imperial', 'Metric'] as const).map(item =>
    <button type="button" role="radio" aria-checked={data.units === item} className={data.units === item ? 'active' : ''} onClick={() => set('units', item)} key={item}>{item === 'Imperial' ? (goalKind === 'race' || stepId === 'running' ? 'Miles' : 'lb') : (goalKind === 'race' || stepId === 'running' ? 'Km' : 'kg')}</button>)}</div>;

  const screen = (() => {
    switch (stepId) {
      case 'name': return <>
        <h1>What should we call you?</h1>
        <form className="ob-form" onSubmit={event => { event.preventDefault(); submitName(); }}>
          <input className="ob-input" autoFocus autoComplete="given-name" enterKeyHint="next" value={data.displayName} onChange={event => set('displayName', event.target.value)} placeholder="First name" aria-label="Your name" />
          <button className="button ob-next" type="submit">Continue</button>
        </form>
      </>;
      case 'focus': return <>
        <h1>What are you training for?</h1>
        <div className="ob-cards">{focusCards.map(card =>
          <button type="button" key={card.id} className={data.primaryFocus === card.id ? 'ob-card active' : 'ob-card'}
            onClick={() => tapThen(() => { if (data.primaryFocus !== card.id) { set('primaryFocus', card.id); set('splitDays', []); setGoalExercise(''); setGoalTarget(''); setGoalCurrent(''); setPendingGoal(null); } })}>
            <strong>{card.label}</strong><small>{card.copy}</small>
          </button>)}</div>
      </>;
      case 'days': return <>
        <h1>How many days a week can you train?</h1>
        <p className="ob-lead">Most people start with 3 or 4. You can change it any time.</p>
        <div className="ob-days">{[2, 3, 4, 5, 6].map(count =>
          <button type="button" key={count} className={data.trainingDays === count ? 'active' : ''} aria-pressed={data.trainingDays === count}
            onClick={() => tapThen(() => { if (data.trainingDays !== count) { set('trainingDays', count); set('splitDays', []); } })}>{count}</button>)}</div>
      </>;
      case 'goal': {
        const showLifts = data.primaryFocus !== 'Endurance';
        const showRaces = data.primaryFocus !== 'Strength';
        const pick = (name: string) => tapThen(() => { if (goalExercise !== name) { setGoalExercise(name); setGoalTarget(''); setGoalCurrent(''); setPendingGoal(null); setDivision(''); } });
        return <>
          <h1>{showLifts && showRaces ? 'Pick one goal to start with' : showLifts ? 'Which lift do you want to improve?' : 'What are you training for?'}</h1>
          <p className="ob-lead">Forge builds every week around it. You can add more goals later.</p>
          {showLifts && <>{showRaces && <h2 className="ob-group">A lift</h2>}<div className="ob-chips">{liftChoices.map(name =>
            <button type="button" key={name} className={goalExercise === name ? 'active' : ''} aria-pressed={goalExercise === name} onClick={() => pick(name)}>{CORE_LIFT_LABELS[name] || name}</button>)}</div></>}
          {showRaces && <>{showLifts && <h2 className="ob-group">A race</h2>}<div className="ob-chips">{races.map(item =>
            <button type="button" key={item.name} className={goalExercise === item.name ? 'active' : ''} aria-pressed={goalExercise === item.name} onClick={() => pick(item.name)}>{item.label}</button>)}</div></>}
        </>;
      }
      case 'target': {
        const label = CORE_LIFT_LABELS[goalExercise] || goalExercise;
        const question = goalKind === 'race' ? `What ${race!.label} time are you aiming for?` : goalKind === 'weight' ? 'What weight are you aiming for?' : goalUnit === 'reps' ? `How many ${label.toLowerCase()} do you want to do?` : `What do you want to ${label === 'Pull Ups' ? 'add on pull ups' : `${label.toLowerCase()} for one rep`}?`;
        /* "e.g." on purpose: a bare 315 in grey reads as already filled in, and
           the first person through tapped Continue on an empty field. */
        const placeholder = `e.g. ${goalKind === 'race' ? race!.placeholder : goalUnit === 'reps' ? '12' : goalKind === 'weight' ? (massUnit === 'kg' ? '75' : '170') : (massUnit === 'kg' ? '140' : '315')}`;
        return <>
          <h1>{question}</h1>
          {goalKind === 'lift' && isWeightedBodyweight(goalExercise) && <div className="ob-units ob-measure">
            <button type="button" className={pullUpReps ? 'active' : ''} onClick={() => { setPullUpReps(true); setGoalTarget(''); setGoalCurrent(''); }}>Reps</button>
            <button type="button" className={!pullUpReps ? 'active' : ''} onClick={() => { setPullUpReps(false); setGoalTarget(''); setGoalCurrent(''); }}>Added weight</button>
          </div>}
          <form className="ob-form" onSubmit={event => { event.preventDefault(); submitTarget(); }}>
            <div className="ob-target">
              <input className="ob-input" autoFocus inputMode={goalKind === 'race' ? 'numeric' : 'decimal'} enterKeyHint="next" value={goalTarget} onChange={event => { setError(''); setGoalTarget(goalKind === 'race' ? formatClock(event.target.value) : event.target.value); }} placeholder={placeholder} aria-label="Target" />
              {goalKind === 'race' ? <span className="ob-suffix">{goalUnit === 'mm:ss' ? 'min:sec' : 'h:mm:ss'}</span> : goalUnit === 'reps' ? <span className="ob-suffix">reps</span> : unitToggle}
            </div>
            {goalExercise === 'HYROX' && <><h2 className="ob-group">Division</h2><div className="ob-chips">{hyroxDivisions.map(item =>
              <button type="button" key={item} className={division === item ? 'active' : ''} aria-pressed={division === item} onClick={() => { setError(''); setDivision(item); }}>{item}</button>)}</div></>}
            <label className="ob-optional"><span>{goalKind === 'weight' ? 'Your weight today' : goalKind === 'race' ? 'Your best time now' : 'Your best right now'} <em>optional</em></span>
              <input className="ob-input small" inputMode={goalKind === 'race' ? 'numeric' : 'decimal'} value={goalCurrent} onChange={event => { setError(''); setGoalCurrent(goalKind === 'race' ? formatClock(event.target.value) : event.target.value); }} placeholder={goalKind === 'race' ? 'Leave blank if you don’t know' : 'Leave blank if unsure'} />
            </label>
            <h2 className="ob-group">By when?</h2>
            <div className="ob-chips">{goalWeeks.map(weeks =>
              <button type="button" key={weeks} className={!pickDate && goalDate === weeksFromNow(weeks) ? 'active' : ''} onClick={() => { setPickDate(false); setGoalDate(weeksFromNow(weeks)); }}>{weeks} weeks</button>)}
              <button type="button" className={pickDate || !goalWeeks.some(weeks => goalDate === weeksFromNow(weeks)) ? 'active' : ''} onClick={() => setPickDate(true)}>Pick a date</button></div>
            {pickDate && <input className="ob-input small" type="date" min={weeksFromNow(2)} value={goalDate} onChange={event => event.target.value && setGoalDate(event.target.value)} aria-label="Goal date" />}
            <button className="button ob-next" type="submit">Continue</button>
          </form>
        </>;
      }
      case 'running': return <>
        <h1>How much do you run in a week right now?</h1>
        <p className="ob-lead">A rough guess is fine. Forge starts from here and builds up safely.</p>
        {unitToggle}
        <div className="ob-cards">{mileageChoices[data.units].map(([label, miles]) =>
          <button type="button" key={label} className={data.weeklyMileage === miles ? 'ob-card active' : 'ob-card'} onClick={() => tapThen(() => set('weeklyMileage', miles))}><strong>{label}</strong></button>)}</div>
      </>;
      case 'week': return <>
        <h1>{editingFreely ? 'Your week' : 'Your week is ready'}</h1>
        <p className="ob-lead">Forge picked a lift for each day. Tap any day to change it — or just start.</p>
        {/* The stored title is the builder's ("5K Run · 24:30 mm:ss") so Goals
            reads it the same; this card says it the way a person would. */}
        {pendingGoal && <div className="ob-goal"><span>Your goal</span><strong>{goalKind === 'race' ? `${race!.label} in ${goalTarget}` : goalKind === 'weight' ? `Reach ${goalTarget} ${goalUnit}` : pendingGoal.title}</strong><small>by {new Date(`${pendingGoal.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</small></div>}
        <div className="ob-week">{plannedDays.map((day, index) => {
          const lifting = day.type === 'Strength' || day.type === 'Mixed';
          const chosen = dayExercises[index] || [];
          const open = openDay === index;
          return <section className={open ? 'setup-day open' : 'setup-day'} key={`${day.name}-${index}`}>
            <button type="button" className="setup-day-head" onClick={() => lifting && setOpenDay(open ? -1 : index)} aria-expanded={lifting ? open : undefined} disabled={!lifting}>
              <span><strong>Day {index + 1} · {day.name}</strong><small>{lifting ? (chosen.length ? chosen.join(' · ') : 'Pick a movement') : 'Running — Forge plans it'}</small></span>
              {lifting && <span className={chosen.length ? 'setup-day-count set' : 'setup-day-count'}>{open ? 'Done' : 'Change'}</span>}
            </button>
            {open && <div className="muscle-picker compact-muscle-picker setup-day-options">
              {optionsForDay(index).map(exercise => {
                const selected = chosen.includes(exercise.name);
                return <button type="button" key={exercise.id} aria-pressed={selected} className={selected ? 'muscle-chip active' : 'muscle-chip'} onClick={() => toggleDayExercise(index, exercise.name)}>
                  {exercise.name}{goalLiftKeys.has(canonicalLiftKey(exercise.name)) ? <i className="setup-goal-flag" title="Goal lift"> ★</i> : null}</button>;
              })}
            </div>}
          </section>;
        })}</div>
        <label className="setup-check"><input type="checkbox" checked={data.injuryConstraint} onChange={event => set('injuryConstraint', event.target.checked)} /><span><strong>I have an injury or limitation</strong><small>Forge will train around it.</small></span></label>
        {data.injuryConstraint && <label className="ob-optional">What should Forge avoid?<textarea className="ob-input small" rows={3} value={data.limitationNotes} onChange={event => set('limitationNotes', event.target.value)} placeholder="e.g. no running on my left knee, no overhead pressing" /></label>}
        {!isEditing && <label className="setup-check safety"><input type="checkbox" checked={data.acceptedSafety} onChange={event => set('acceptedSafety', event.target.checked)} /><span><strong>I understand Forge is training guidance, not medical advice, and I’ll stop and report any pain.</strong><small><button type="button" className="text-button" onClick={() => setSafetyOpen(value => !value)}>{safetyOpen ? 'Hide details' : 'Read details'}</button></small></span></label>}
        {safetyOpen && <div className="disclaimer-copy">
          <p><strong>Forge is a training log and coaching tool, not a medical service.</strong> Its recommendations are generated from the workouts you record; they are general fitness guidance and never medical advice, diagnosis, or treatment.</p>
          <p>Strength and endurance training carry real risk. Check with a physician before starting or changing a program — especially with a heart condition, injury, chronic illness, or during pregnancy. Stop any exercise that causes pain, dizziness, or unusual shortness of breath.</p>
          <p>You are responsible for choosing loads, paces, and movements that are safe for you. Tell Forge about pain, injury, or unusual fatigue in Ask Forge so training can work around it — and see a professional when something does not resolve.</p>
        </div>}
        <button className="button ob-next" disabled={saving} onClick={finish}>{saving ? 'Saving…' : editingFreely ? 'Save' : 'Enter Forge'}</button>
      </>;
    }
  })();

  return <main className="onboarding-shell ob-shell">
    <header className="ob-top">
      {stepIndex > 0 && !(needsExercises && stepId === 'week') ? <button type="button" className="ob-back" aria-label="Back" onClick={() => go(-1)} disabled={saving}>←</button> : <span className="ob-back-spacer" />}
      <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={stepIndex + 1} aria-label={`Step ${stepIndex + 1} of ${steps.length}`}><i style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div>
      {editingFreely ? <button type="button" className="ob-cancel" onClick={() => navigate('/profile')}>Cancel</button> : <span className="ob-back-spacer" />}
    </header>
    <section className="ob-screen" key={stepId}>
      {screen}
      {error && <div className="setup-error" role="alert">{error}</div>}
    </section>
  </main>;
}
