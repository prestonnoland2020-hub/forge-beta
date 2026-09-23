import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useProfileSetup, type AthleteSetup } from '../features/profile/ProfileSetupProvider';
import { saveProfile } from '../features/profile/profileService';
import { saveTrainingSplit } from '../features/splits/splitService';
import { useGoals } from '../features/goals/GoalsProvider';
import { DialField } from '../components/NumberDial';
import { GoalBuilder, noop, type CreatedGoal } from '../components/GoalBuilder';
import { isProgrammableStrength, useTrainingLibrary, type LibraryExercise } from '../features/training/TrainingLibraryProvider';
import { canonicalLiftKey } from '../lib/liftAliases';
import { coreFirst } from '../lib/coreLifts';
import { createNote, extractArea, saveNote } from '../features/training/athleteNotesService';

/* THREE SCREENS. Setup was six steps and a disclaimer before an athlete saw
   the app: two consent boxes in a row, a goal builder with three sub-steps of
   its own that asked a brand-new user to pick a "training connection" from
   days they had never seen, a mapping step that said one movement was enough
   and then refused to continue until every day had one, an empty step for
   runners, and a baseline step nobody filled in.

   What Forge actually needs to write week one: who you are and how many days
   you train, one goal, and a split whose lifting days each name a movement.
   Everything else — bests, paces, body weight — arrives with the first
   workouts and is better for it. So:

     1. About you  — name, focus, days a week, units, one safety box.
     2. Your goal  — the builder, inline, one screen.
     3. Your week  — the starter split with a lift already on every lifting
                     day (the goal lift on the day that trains it), a tap to
                     change any of them, and a runner's weekly miles. */
const steps = [
  ['About you', 'Three things and one promise.'],
  ['Your goal', 'What the training is for.'],
  ['Your week', 'Forge picked a movement for each day. Change any of them.'],
] as const;
const LAST_STEP = steps.length - 1;
const GOAL_STEP = 1;
const WEEK_STEP = 2;

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

/* THE FORM READS THE PROFILE ONCE, on its first render, so it must not be
   mounted before the profile has arrived. */
export function OnboardingPage() {
  const { loading } = useProfileSetup();
  if (loading) return <main className="profile-loading"><span className="forge-mark">—</span><strong>FORGE</strong><p>Loading your training profile…</p></main>;
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
  /* Sent back by the gate for a missing goal opens on the goal step; sent back
     for unmapped days opens on the week step. */
  const needsGoal = Boolean((location.state as { needsGoal?: boolean } | null)?.needsGoal);
  const needsExercises = Boolean((location.state as { needsExercises?: boolean } | null)?.needsExercises);
  const isEditing = Boolean(setup?.completedAt);
  const [step, setStep] = useState(needsExercises ? WEEK_STEP : needsGoal ? GOAL_STEP : 0);
  const [goalOpen, setGoalOpen] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [data, setData] = useState<AthleteSetup>(() => ({ ...blank, units: guessUnits(), ...(setup || {}), displayName: setup?.displayName || suggestedName }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { exercises: libraryExercises } = useTrainingLibrary();
  const strengthLibrary = useMemo(() => libraryExercises.filter(exercise => exercise.enabled && isProgrammableStrength(exercise)), [libraryExercises]);
  const plannedDays = useMemo(() => data.splitDays?.length ? data.splitDays : starterSplit(data.primaryFocus, data.trainingDays), [data.splitDays, data.primaryFocus, data.trainingDays]);
  const strengthDayIndexes = plannedDays.map((day, index) => ({ day, index })).filter(item => item.day.type === 'Strength' || item.day.type === 'Mixed');
  const runningPlanned = plannedDays.some(day => /Cardio|Mixed/i.test(day.type));
  const plannedCardioDays = plannedDays.filter(day => /Cardio|Mixed/i.test(day.type)).length;
  const goalLiftKeys = new Set(goals.map(goal => goal.exercise ? canonicalLiftKey(String(goal.exercise)) : '').filter(Boolean));

  /* The mapping is filled with defaults the first time the week step is
     shown — after the goal exists, so the goal lift can take its day. Keyed
     by the split shape, so a changed focus or day count reseeds. */
  const [dayExercises, setDayExercises] = useState<Record<number, string[]>>({});
  const [seededFor, setSeededFor] = useState('');
  const splitKey = plannedDays.map(day => `${day.name}:${day.type}`).join('|');
  if (step === WEEK_STEP && seededFor !== splitKey) {
    setSeededFor(splitKey);
    setDayExercises(defaultLifts(plannedDays, strengthLibrary, goals.filter(goal => goal.type === 'Strength' && goal.exercise).map(goal => String(goal.exercise))));
  }
  const [openDay, setOpenDay] = useState<number>(-1);
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
    const options = strengthLibrary.filter(exercise =>
      chosen.includes(exercise.name)
      || goalLiftKeys.has(canonicalLiftKey(exercise.name))
      || !muscles.length
      || exercise.muscles.some(muscle => muscles.includes(muscle)));
    const ordered = coreFirst(options.map(item => item.name));
    return ordered.map(name => options.find(item => item.name === name)!).filter(Boolean);
  };
  const unmappedDays = strengthDayIndexes.filter(item => !(dayExercises[item.index] || []).length);
  const untrainedGoalLifts = goals
    .filter(goal => goal.type === 'Strength' && goal.exercise)
    .map(goal => String(goal.exercise))
    .filter(name => !Object.values(dayExercises).some(list => list.some(item => canonicalLiftKey(item) === canonicalLiftKey(name))));

  const set = <K extends keyof AthleteSetup>(key: K, value: AthleteSetup[K]) => setData(current => ({ ...current, [key]: value }));

  const next = () => {
    if (step === 0) {
      if (!data.displayName.trim()) return setError('Enter your name.');
      if (data.trainingDays < 1 || data.trainingDays > 7) return setError('Choose 1–7 training days.');
      if (!isEditing && !data.acceptedSafety) return setError('Tick the safety box to continue.');
    }
    if (step === GOAL_STEP && !goals.length) return setError('Save one goal to continue. Forge builds the plan around it.');
    setError(''); setStep(current => Math.min(LAST_STEP, current + 1)); window.scrollTo(0, 0);
  };

  const finish = async () => {
    if (!isEditing && !needsGoal && !needsExercises && !data.acceptedSafety) return setError('Tick the safety box on the first screen to finish.');
    /* THE GATE. Nothing below this line runs without a goal — not the profile
       write that sets onboarding_completed, and not saveSetup. */
    if (!goals.length) return setError('Save one goal to finish. Forge builds the plan around it.');
    if (unmappedDays.length) return setError(`Pick a movement for ${unmappedDays.map(item => item.day.name).join(', ')}.`);
    const weight = Number(data.currentWeight);
    const weightGiven = Boolean(String(data.currentWeight || '').trim()) && Number.isFinite(weight) && weight > 0;
    if (weightGiven && (weight < 40 || weight > 1500)) return setError(`Enter a body weight between 40 and 1500 ${data.units === 'Metric' ? 'kg' : 'lb'}, or leave it blank.`);
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
      /* A runner's days default to the cardio days in the split; the field on
         the week step overrides it. Never more days than they train. */
      const cardioDays = splitDays.filter(day => /Cardio|Mixed/i.test(day.type)).length;
      const runningDays = Math.min(data.trainingDays, data.runningDays || cardioDays || 0);
      const completed = { ...data, username, runningDays, splitDays, splitSource: 'Recommended' as const, acceptedSafety: true, completedAt: new Date().toISOString() };
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

  const editingFreely = isEditing && !needsGoal && !needsExercises;
  return <main className="onboarding-shell onboarding-simple">
    <header className="onboarding-brand"><span className="forge-mark">—</span><strong>FORGE</strong><span>{editingFreely ? 'EDIT PROFILE' : `SETUP ${step + 1} OF ${steps.length}`}</span>
      {editingFreely && <button type="button" className="onboarding-cancel" onClick={() => navigate('/profile')}>Cancel</button>}
    </header>
    <div className="onboarding-grid">
      <aside><span className="eyebrow">START SIMPLE</span><h1>Three short steps.</h1><p>Forge learns from what you log — nothing here has to be exact.</p><ol>{steps.map(([name], index) => <li className={index === step ? 'active' : index < step ? 'done' : ''} key={name}><i>{index < step ? '✓' : index + 1}</i><span>{name}</span></li>)}</ol></aside>
      <section className="onboarding-card">
        <div className="setup-heading"><span className="eyebrow">{steps[step][0]}</span><h2>{steps[step][1]}</h2></div>

        {step === 0 && <div className="setup-fields">
          <label className="full">Your name<input autoFocus value={data.displayName} onChange={event => set('displayName', event.target.value)} placeholder="Your first name" /></label>
          <fieldset className="full"><legend>What are you training for?</legend><div className="setup-choices">{(['Hybrid', 'Strength', 'Endurance', 'Body composition'] as const).map(item => <button type="button" className={data.primaryFocus === item ? 'active' : ''} onClick={() => { set('primaryFocus', item); set('splitDays', []); }} key={item}>{item}</button>)}</div></fieldset>
          <fieldset className="full"><legend>Days a week</legend><div className="setup-choices setup-days">{[2, 3, 4, 5, 6].map(count => <button type="button" className={data.trainingDays === count ? 'active' : ''} onClick={() => { set('trainingDays', count); set('splitDays', []); }} key={count}>{count}</button>)}</div></fieldset>
          <fieldset className="full"><legend>Units</legend><div className="setup-choices setup-units">{(['Imperial', 'Metric'] as const).map(item => <button type="button" className={data.units === item ? 'active' : ''} onClick={() => set('units', item)} key={item}>{item === 'Imperial' ? 'lb · miles' : 'kg · km'}</button>)}</div></fieldset>
          {data.primaryFocus === 'Body composition' && <div className="full"><DialField label="Current weight" kind="bodyweight" unit={data.units === 'Metric' ? 'kg' : 'lb'} value={data.currentWeight} onChange={next => set('currentWeight', next)} hint="Optional — it starts the trend line" /></div>}
          <label className="setup-check full"><input type="checkbox" checked={data.injuryConstraint} onChange={event => set('injuryConstraint', event.target.checked)} /><span><strong>I have an injury or limitation right now</strong><small>Forge trains around it.</small></span></label>
          {data.injuryConstraint && <label className="full">What should Forge avoid?<textarea rows={3} value={data.limitationNotes} onChange={event => set('limitationNotes', event.target.value)} placeholder="Movements, impact, or medical restrictions…" /></label>}
          {/* ONE BOX, NOT TWO SCREENS. The disclaimer and the "report pain" promise
              were separate consents; this is both, with the full text one tap away. */}
          <label className="setup-check safety full"><input type="checkbox" checked={data.acceptedSafety} onChange={event => { set('acceptedSafety', event.target.checked); setError(''); }} /><span><strong>Forge is training guidance, not medical advice. I’ll report pain or injury.</strong><small><button type="button" className="text-button" onClick={() => setSafetyOpen(open => !open)}>{safetyOpen ? 'Hide the full note' : 'Read the full note'}</button></small></span></label>
          {safetyOpen && <div className="disclaimer-copy full">
            <p><strong>Forge is a training log and coaching tool, not a medical service.</strong> Its recommendations are generated from the workouts you record; they are general fitness guidance and never medical advice, diagnosis, or treatment.</p>
            <p>Strength and endurance training carry real risk. Check with a physician before starting or changing a program — especially with a heart condition, injury, chronic illness, or during pregnancy. Stop any exercise that causes pain, dizziness, or unusual shortness of breath.</p>
            <p>You are responsible for choosing loads, paces, and movements that are safe for you. Tell Forge about pain, injury, or unusual fatigue in Ask Forge so training can work around it — and see a professional when something does not resolve.</p>
          </div>}
        </div>}

        {step === GOAL_STEP && <div className="setup-fields">
          {goals.length > 0 && <div className="setup-goal-list full">
            {goals.map(goal => <div className="setup-goal-row" key={`${goal.type}-${goal.title}`}>
              <span><strong>{goal.title}</strong><small>{goal.type}{goal.date ? ` · by ${goal.date}` : ''}</small></span>
              <b>✓</b>
            </div>)}
            {!goalOpen && <button type="button" className="button ghost" onClick={() => setGoalOpen(true)}>Add another goal</button>}
          </div>}
          {(goalOpen || !goals.length) && <div className="full">
            {!goals.length && <p className="setup-goal-lead">A lift to hit or a race to run. Forge writes every week backwards from it.</p>}
            <GoalBuilder inline coreLiftsOnly
              splitDays={plannedDays}
              onClose={goals.length ? () => setGoalOpen(false) : noop}
              onSave={(goal: CreatedGoal) => { saveGoal(goal, null); setGoalOpen(false); setError(''); window.scrollTo(0, 0); }} />
          </div>}
        </div>}

        {step === WEEK_STEP && <div className="setup-fields setup-day-map">
          {untrainedGoalLifts.length > 0 && <div className="setup-note full setup-goal-warning">
            <strong>No day trains {untrainedGoalLifts.join(' or ')} yet.</strong>
            <span>Add it to the day you train it on, or it never gets programmed.</span>
          </div>}
          {plannedDays.map((day, index) => {
            const lifting = day.type === 'Strength' || day.type === 'Mixed';
            const chosen = dayExercises[index] || [];
            const open = openDay === index;
            return <section className={open ? 'setup-day open full' : 'setup-day full'} key={`${day.name}-${index}`}>
              <button type="button" className="setup-day-head" onClick={() => lifting && setOpenDay(open ? -1 : index)} aria-expanded={lifting ? open : undefined} disabled={!lifting}>
                <span><strong>{day.name}</strong><small>{lifting ? (chosen.length ? chosen.join(' · ') : 'Pick a movement') : 'Forge programs the running'}</small></span>
                {lifting && <span className={chosen.length ? 'setup-day-count set' : 'setup-day-count'}>{open ? 'Done' : 'Change'}</span>}
              </button>
              {open && <div className="muscle-picker compact-muscle-picker setup-day-options">
                {optionsForDay(index).map(exercise => {
                  const selected = chosen.includes(exercise.name);
                  const isGoal = goalLiftKeys.has(canonicalLiftKey(exercise.name));
                  return <button type="button" key={exercise.id} aria-pressed={selected}
                    className={selected ? 'muscle-chip active' : 'muscle-chip'}
                    onClick={() => toggleDayExercise(index, exercise.name)}>{exercise.name}{isGoal ? <i className="setup-goal-flag" title="Goal lift"> ★</i> : null}</button>;
                })}
              </div>}
            </section>;
          })}
          {runningPlanned && <fieldset className="full setup-baseline-running">
            <legend>Your running now</legend>
            <DialField label={data.units === 'Metric' ? 'Km a week' : 'Miles a week'} kind="distance" unit={data.units === 'Metric' ? 'km' : 'mi'} value={data.weeklyMileage ? String(data.weeklyMileage) : ''} onChange={next => set('weeklyMileage', Number(next))} hint="Roughly — 0 means starting from nothing" />
            <DialField label="Run days a week" kind="days" value={String(data.runningDays || plannedCardioDays || '')} onChange={next => set('runningDays', Number(next))} hint="Defaults to the running days in your split" />
          </fieldset>}
          <p className="setup-preview-note full">Loads and paces come from your first workouts. Every day here can be changed later in Profile → Split.</p>
        </div>}

        {error && <div className="setup-error">{error}</div>}
        {(step !== GOAL_STEP || (goals.length > 0 && !goalOpen)) && <footer className="setup-actions">{step ? <button className="button ghost" disabled={saving} onClick={() => { setError(''); setStep(current => Math.max(0, current - 1)); }}>← Back</button> : <span />}<button className="button" disabled={saving} onClick={step === LAST_STEP ? finish : next}>{step === LAST_STEP ? saving ? 'Saving…' : isEditing ? 'Save profile' : 'Enter Forge' : 'Continue'} →</button></footer>}
        {step === GOAL_STEP && !(goals.length > 0 && !goalOpen) && <footer className="setup-actions setup-actions-quiet"><button className="button ghost" onClick={() => { setError(''); setStep(0); }}>← Back</button><span /></footer>}
      </section>
    </div>
  </main>;
}
