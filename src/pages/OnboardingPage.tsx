import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useProfileSetup, type AthleteSetup } from '../features/profile/ProfileSetupProvider';
import { saveProfile } from '../features/profile/profileService';
import { saveTrainingSplit } from '../features/splits/splitService';
import { useGoals } from '../features/goals/GoalsProvider';
import { DialField } from '../components/NumberDial';
import { GoalBuilder, type CreatedGoal } from '../components/GoalBuilder';
import { isProgrammableStrength, useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import { canonicalLiftKey } from '../lib/liftAliases';
import { coreFirst, CORE_LIFT_LABELS } from '../lib/coreLifts';
import { firstWeekPreview } from '../lib/firstWeekPreview';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { localDayIso } from '../lib/time';

/* THREE STEPS, AND THE GOAL IS ONE OF THEM. Forge programs toward a goal —
   the wave, the mileage ramp and max week all exist to move one. An athlete
   who finished setup without one landed on a home screen of empty states and
   never met the thing that makes the app different; four of the first seven
   accounts sat there. So setup does not complete until a goal exists. */
/* A FOURTH STEP, BECAUSE A SPLIT DAY WITH NO EXERCISES CANNOT BE PROGRAMMED.
   The starter split arrives with empty days, and nothing ever made the athlete
   fill them — so the block was built for days that named no movement, a goal
   lift could sit in the block's focus line while no day trained it, and Today
   asked for a lift it had never been told about. Setup is not finished until
   every strength day names at least one exercise. */
/* AND TWO MORE, BECAUSE SETUP NEVER ASKED FOR THE TWO THINGS THE PLAN IS BUILT
   FROM AND NEVER SHOWED WHAT IT BUILT.

   Weekly mileage and the athlete's current bests both live in the setup shape
   and neither was ever collected: weeklyMileage defaulted to 0 and the first
   block was written for somebody who runs nothing, off lifts with no evidence
   behind them. And the last screen of setup dropped them onto a home screen
   without once showing what any of it was for.

   Both are optional and both are quick. The baseline step fills the preview as
   they type, which is the only argument for entering it that matters. */
const steps = [
  ['The essentials', 'What your training should serve.'],
  ['Train safely', 'Only the limits that change a workout.'],
  ['Your first goal', 'What the training is for.'],
  ['What each day trains', 'The movement Forge measures each day by.'],
  ['Where you are now', 'Optional — it makes the first week real.'],
  ['Your first week', 'Built from what you just entered.'],
] as const;
const LAST_STEP = steps.length - 1;
const GOAL_STEP = 2;
const MAP_STEP = 3;
const BASELINE_STEP = 4;
const PREVIEW_STEP = 5;

const blank: AthleteSetup = {
  displayName: '', username: '', birthDate: '', units: 'Imperial', height: '', startingWeight: '', currentWeight: '',
  primaryFocus: 'Hybrid', strengthExperience: 'Intermediate', runningExperience: 'Recreational', trainingDays: 4,
  runningDays: 2, weeklyMileage: 0, longestRun: 0, strengthSessionMinutes: 60, cardioSessionMinutes: 45,
  combinedSessionMinutes: 75, scheduleStyle: 'Rolling cycle', equipment: '', environment: 'Mixed',
  splitSource: 'Recommended', splitDays: [], injuryConstraint: false, limitationNotes: '', wearableIntent: 'Connect later',
  profileVisibility: 'Private', acceptedSafety: false, completedAt: '',
};

function starterSplit(focus: AthleteSetup['primaryFocus'], count: number): AthleteSetup['splitDays'] {
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

/* THE FORM READS THE PROFILE ONCE, on its first render, so it must not be
   mounted before the profile has arrived. Opening /onboarding directly during
   the first seconds after sign-in used to start the athlete on a blank form
   over a complete profile — and saving it wrote the blanks back. The wrapper
   holds the door until the profile is loaded; the form below then initialises
   from the real thing. */
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
  /* An athlete sent back by the gate has a finished profile and no goal —
     open straight on the goal step rather than making them re-walk setup. */
  const needsGoal = Boolean((location.state as { needsGoal?: boolean } | null)?.needsGoal);
  /* Sent back by the gate for a missing goal opens on the goal step; sent back
     for unmapped days opens on the day-mapping step. */
  const needsExercises = Boolean((location.state as { needsExercises?: boolean } | null)?.needsExercises);
  const [step, setStep] = useState(needsExercises ? MAP_STEP : needsGoal ? GOAL_STEP : 0);
  const [goalOpen, setGoalOpen] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [data, setData] = useState<AthleteSetup>(() => ({ ...blank, ...(setup || {}), displayName: setup?.displayName || suggestedName }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { exercises: libraryExercises } = useTrainingLibrary();
  const { addRecord } = useWorkoutHistory();
  const strengthLibrary = libraryExercises.filter(exercise => exercise.enabled && isProgrammableStrength(exercise));
  /* The days this step is about: the ones Forge prescribes lifting on. */
  const plannedDays = (data.splitDays?.length ? data.splitDays : starterSplit(data.primaryFocus, data.trainingDays));
  const strengthDayIndexes = plannedDays.map((day, index) => ({ day, index })).filter(item => item.day.type === 'Strength' || item.day.type === 'Mixed');
  const [dayExercises, setDayExercises] = useState<Record<number, string[]>>(() => {
    const seed: Record<number, string[]> = {};
    plannedDays.forEach((day, index) => { seed[index] = [...(day.exercises || [])]; });
    return seed;
  });
  const [openDay, setOpenDay] = useState<number>(() => strengthDayIndexes[0]?.index ?? 0);
  const toggleDayExercise = (index: number, name: string) => {
    setError('');
    setDayExercises(current => {
      const list = current[index] || [];
      return { ...current, [index]: list.includes(name) ? list.filter(item => item !== name) : [...list, name] };
    });
  };
  /* A day offers the movements its own muscles train; a goal lift is offered on
     any day it could belong to, because a goal nobody trains never moves. */
  /* Alias-folded, because a goal named "Bench" and a library entry named
     "Bench Press" are the same lift — matching on the raw string told the
     athlete no day trained their goal while the day plainly did. */
  const goalLiftKeys = new Set(goals.map(goal => goal.exercise ? canonicalLiftKey(String(goal.exercise)) : '').filter(Boolean));
  const optionsForDay = (index: number) => {
    const muscles = plannedDays[index]?.muscles || [];
    const chosen = dayExercises[index] || [];
    return strengthLibrary.filter(exercise =>
      chosen.includes(exercise.name)
      || goalLiftKeys.has(canonicalLiftKey(exercise.name))
      || !muscles.length
      || exercise.muscles.some(muscle => muscles.includes(muscle)));
  };
  /* THE FOUR LIFTS AT THE TOP OF EVERY DAY'S LIST. The options are filtered
     by the day's muscles and then arrive in library order, which puts "Hack
     Squat" above "Back Squat" on a leg day. See lib/coreLifts. */
  const coreFirstOptions = <T extends { name: string }>(options: T[]): T[] => {
    const ordered = coreFirst(options.map(item => item.name));
    return ordered.map(name => options.find(item => item.name === name)!).filter(Boolean);
  };
  const unmappedDays = strengthDayIndexes.filter(item => !(dayExercises[item.index] || []).length);
  /* A goal lift no day trains is a goal the block cannot move. */
  const untrainedGoalLifts = goals
    .filter(goal => goal.type === 'Strength' && goal.exercise)
    .map(goal => String(goal.exercise))
    .filter(name => !Object.values(dayExercises).some(list => list.some(item => canonicalLiftKey(item) === canonicalLiftKey(name))));
  /* WHERE THEY ARE STARTING FROM, which setup never asked. Keyed by the
     library's own name for the lift so the top set it becomes can be matched
     against everything logged afterwards. */
  const [baseline, setBaseline] = useState<Record<string, { weight: string; reps: string }>>({});
  const setBase = (lift: string, field: 'weight' | 'reps', value: string) =>
    setBaseline(current => ({ ...current, [lift]: { weight: current[lift]?.weight || '', reps: current[lift]?.reps || '', [field]: value } }));
  /* Every movement they have put on a day, core lifts first — those are the
     ones worth a baseline and the ones they can actually remember a number
     for. A day nobody mapped contributes nothing to ask about. */
  const baselineLifts = useMemo(() => {
    const named = Array.from(new Set(Object.values(dayExercises).flat().filter(Boolean)));
    return coreFirst(named).slice(0, 6);
  }, [dayExercises]);
  const enteredBaseline = baselineLifts
    .map(lift => ({ lift, weight: Number(baseline[lift]?.weight), reps: Number(baseline[lift]?.reps) }))
    .filter(item => item.weight > 0 && item.reps > 0);
  const runningPlanned = plannedDays.some(day => /Cardio|Mixed/i.test(day.type));

  const preview = useMemo(() => firstWeekPreview({
    days: plannedDays.map((day, index) => ({ name: day.name, type: day.type, muscles: day.muscles, exercises: dayExercises[index] || [] })),
    baseline: Object.fromEntries(enteredBaseline.map(item => [item.lift, { weight: item.weight, reps: item.reps }])),
    weeklyMiles: Number(data.weeklyMileage) || 0,
    unit: data.units === 'Metric' ? 'kg' : 'lb',
  }), [plannedDays, dayExercises, baseline, data.weeklyMileage, data.units]);

  const set = <K extends keyof AthleteSetup>(key: K, value: AthleteSetup[K]) => setData(current => ({ ...current, [key]: value }));
  const isEditing = Boolean(setup?.completedAt);

  const next = () => {
    if (step === 0) {
      if (!data.displayName.trim()) return setError('Enter your name.');
      if (data.trainingDays < 1 || data.trainingDays > 7) return setError('Choose 1–7 training days.');
    }
    if (step === 1 && !data.acceptedSafety) return setError('Confirm the safety note to continue.');
    if (step === GOAL_STEP && !goals.length) return setError('Add one goal to continue. Forge builds the plan around it.');
    /* The day map is now a step in the middle rather than the last one, so its
       own rule has to be checked on the way past — otherwise an athlete walks
       to the preview with empty days and the preview has nothing to show. */
    if (step === MAP_STEP && unmappedDays.length) return setError(`Choose at least one exercise for ${unmappedDays.map(item => item.day.name).join(', ')}.`);
    setError(''); setStep(current => Math.min(LAST_STEP, current + 1)); window.scrollTo(0, 0);
  };

  const finish = async () => {
    /* The safety note is confirmed on step 2, which the `needsGoal` re-entry
       deliberately skips — it opens straight on the goal step for an athlete
       who already finished setup. Demanding the checkbox here asked them to
       confirm something that was not on screen, and on the fresh device that
       sends them here in the first place the stored value is `false`. The
       result was an unfinishable screen: "Confirm the safety note to finish",
       no checkbox anywhere, and Back reaching only steps that have none.
       Someone who already accepted it is not asked twice. */
    if (!isEditing && !needsGoal && !data.acceptedSafety) return setError('Confirm the safety note to finish.');
    /* THE GATE. Nothing below this line runs without a goal — not the profile
       write that sets onboarding_completed, and not saveSetup. */
    if (!goals.length) return setError('Add one goal to finish. Forge builds the plan around it.');
    /* EVERY STRENGTH DAY NAMES A MOVEMENT. Forge cannot prescribe a top set for
       a day that lists none, and a block built over empty days is a block of
       blanks. */
    if (unmappedDays.length) return setError(`Choose at least one exercise for ${unmappedDays.map(item => item.day.name).join(', ')}.`);
    /* profiles.current_weight is constrained to 40–1500 but the dial offers
       values from 0 and zod only asked for "positive", so spinning the
       optional weight too far down failed the finish button with a raw
       check-constraint violation. */
    const weight = Number(data.currentWeight);
    const weightGiven = Boolean(String(data.currentWeight || '').trim()) && Number.isFinite(weight) && weight > 0;
    if (weightGiven && (weight < 40 || weight > 1500)) {
      return setError(`Enter a body weight between 40 and 1500 ${data.units === 'Metric' ? 'kg' : 'lb'}, or leave it blank.`);
    }
    setSaving(true); setError('');
    const requested = (data.username || data.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '')).slice(0, 18);
    const splitDays = plannedDays.map((day, index) => ({ ...day, exercises: dayExercises[index] || [] }));
    try {
      /* THE SPLIT IS WRITTEN FIRST. saveProfile is what sets
         onboarding_completed, and doing that before the split meant a failed
         split write left an account flagged complete with no split: the
         athlete retried, the gate now waved them through, and they entered
         Forge on the generic default days instead of the focus-matched split
         they had just been shown — no error, and no way to notice. The
         irreversible flag goes last, so a failure here is only ever a retry. */
      /* The mapping is written every time, not only on first setup — an
         athlete sent back here to fill in empty days must have that stick. */
      await saveTrainingSplit(setup?.splitSource === 'Custom' ? 'My training split' : 'Forge starter split', splitDays.map((day, index) => ({
        position: index + 1, name: day.name, muscleGroups: day.muscles || [], goalLifts: day.exercises || [],
        cardioTypes: day.type === 'Cardio' || day.type === 'Mixed' ? ['Forge'] : [],
      })));
      /* The Plan tab reads its days from this local plan; writing the mapping
         to the account without it would leave the split editor showing the
         empty days the athlete just filled in. */
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
      /* saveProfile resolves the username it actually reserved, which carries
         a suffix when the derived one was already taken. */
      const username = await saveProfile({
        username: requested.length >= 3 ? requested : `athlete${(user?.id || '').replace(/[^a-z0-9]/g, '').slice(0, 6) || 'fit'}`,
        displayName: data.displayName, birthDate: data.birthDate || null, heightCm: null,
        startingWeight: null, currentWeight: weightGiven ? weight : null,
        unitSystem: data.units === 'Metric' ? 'metric' : 'imperial', experienceLevel: 'intermediate',
        primaryGoal: data.primaryFocus === 'Strength' ? 'strength' : data.primaryFocus === 'Endurance' ? 'endurance' : data.primaryFocus === 'Body composition' ? 'weight_change' : 'general_fitness',
        equipment: [], preferredTrainingDays: Array.from({ length: data.trainingDays }, (_, index) => index),
      });
      const completed = { ...data, username, splitDays, splitSource: 'Recommended' as const, acceptedSafety: true, completedAt: new Date().toISOString() };
      saveSetup(completed);
      /* A BASELINE HAS TO BE A LOGGED SET OR IT IS INVISIBLE. Every number in
         Forge is derived from completed top sets — the wave, the calculated
         max, the whole block — so a "current best" kept anywhere else would be
         a number the plan could not see. It is written as one day, titled so
         nobody mistakes it for training they did, and it is ordinary evidence
         from then on: beat it and it stops mattering. */
      if (enteredBaseline.length) {
        addRecord({
          date: localDayIso(), title: 'Baseline', muscles: [], hasCardio: false,
          notes: 'Current bests entered during setup.',
          topSets: enteredBaseline.map((item, index) => ({
            id: `baseline-${index}`, muscle: 'Primary', lift: item.lift,
            weight: item.weight, reps: item.reps,
            calculatedMax: calculateEstimatedOneRepMax(item.weight, item.reps) || 0, completed: true,
          })),
        });
      }
      updateProfile({ runningDays: Math.min(data.trainingDays, data.runningDays), injuryConstraint: data.injuryConstraint });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/onboarding' ? from : isEditing ? '/profile' : '/', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your profile could not be saved. Please try again.'); setSaving(false);
    }
  };

  if (!isEditing && !disclaimerAccepted) return <main className="onboarding-shell onboarding-simple">
    <header className="onboarding-brand"><span className="forge-mark">—</span><strong>FORGE</strong><span>BEFORE YOU START</span></header>
    <div className="onboarding-grid single">
      <section className="onboarding-card disclaimer-card">
        <div className="setup-heading"><span className="eyebrow">READ THIS FIRST</span><h2>Train hard. Train honestly. Know the limits.</h2></div>
        <div className="disclaimer-copy">
          <p><strong>Forge is a training log and coaching tool, not a medical service.</strong> Its recommendations are generated from the workouts you record; they are general fitness guidance and never medical advice, diagnosis, or treatment.</p>
          <p>Strength and endurance training carry real risk. Check with a physician before starting or changing a program — especially with a heart condition, injury, chronic illness, or during pregnancy. Stop any exercise that causes pain, dizziness, or unusual shortness of breath.</p>
          <p>You are responsible for choosing loads, paces, and movements that are safe for you. Tell Forge about pain, injury, or unusual fatigue in Ask Forge so training can work around it — and see a professional when something does not resolve.</p>
        </div>
        <label className="setup-check safety full"><input type="checkbox" checked={disclaimerChecked} onChange={event => setDisclaimerChecked(event.target.checked)} /><span><strong>I understand and accept this.</strong><small>Forge provides training guidance, not medical advice.</small></span></label>
        <footer className="setup-actions"><span /><button className="button" disabled={!disclaimerChecked} onClick={() => { setDisclaimerAccepted(true); window.scrollTo(0, 0); }}>Continue to setup →</button></footer>
      </section>
    </div>
  </main>;

  return <main className="onboarding-shell onboarding-simple">
    <header className="onboarding-brand"><span className="forge-mark">—</span><strong>FORGE</strong><span>{isEditing && !needsGoal && !needsExercises ? 'EDIT PROFILE' : `SETUP ${step + 1} OF ${steps.length}`}</span>
      {/* AN EDIT MUST BE ESCAPABLE. Opened from Profile, this screen had no
          way out but completing all three steps — Save was the only door. */}
      {/* …but not when the gate sent them here to finish something: Cancel
          would bounce straight back and read as a broken button. */}
      {isEditing && !needsGoal && !needsExercises && <button type="button" className="onboarding-cancel" onClick={() => navigate('/profile')}>Cancel</button>}
    </header>
    <div className="onboarding-grid">
      {/* The panel said, in four lines, that setup is short and that Forge
          learns from logged work. The numbered list beside it already says the
          first thing and the app says the second every day. One line. */}
      <aside><span className="eyebrow">START SIMPLE</span><h1>Six short steps.</h1><p>Forge learns from what you log — nothing here has to be exact.</p><ol>{steps.map(([name], index) => <li className={index === step ? 'active' : index < step ? 'done' : ''} key={name}><i>{index < step ? '✓' : index + 1}</i><span>{name}</span></li>)}</ol></aside>
      <section className="onboarding-card">
        <div className="setup-heading"><span className="eyebrow">{steps[step][0]}</span><h2>{steps[step][1]}</h2></div>
        {step === 0 && <div className="setup-fields">
          <label className="full">Your name <em>Required</em><input autoFocus value={data.displayName} onChange={event => set('displayName', event.target.value)} placeholder="Preston" /></label>
          <fieldset className="full"><legend>Main training focus</legend><div className="setup-choices">{(['Hybrid', 'Strength', 'Endurance', 'Body composition'] as const).map(item => <button type="button" className={data.primaryFocus === item ? 'active' : ''} onClick={() => set('primaryFocus', item)} key={item}>{item}</button>)}</div></fieldset>
          <DialField label="Training days per cycle" kind="days" value={String(data.trainingDays || '')} onChange={next => set('trainingDays', Number(next))} />
          <label>Units <select value={data.units} onChange={event => set('units', event.target.value as AthleteSetup['units'])}><option>Imperial</option><option>Metric</option></select></label>
          <div className="full"><DialField label="Current weight" kind="bodyweight" unit={data.units === 'Metric' ? 'kg' : 'lb'} value={data.currentWeight} onChange={next => set('currentWeight', next)} hint="Optional" /></div>
          <div className="setup-note full"><strong>That is enough to begin.</strong><span>Forge creates a starter split. You can adjust its days and exercises later from Plan.</span></div>
        </div>}
        {step === 1 && <div className="setup-fields">
          <label className="setup-check full"><input type="checkbox" checked={data.injuryConstraint} onChange={event => set('injuryConstraint', event.target.checked)} /><span><strong>I have a current injury or training limitation</strong><small>Forge will treat this as a hard constraint.</small></span></label>
          {data.injuryConstraint && <label className="full">What should Forge avoid?<textarea rows={4} value={data.limitationNotes} onChange={event => set('limitationNotes', event.target.value)} placeholder="Movements, impact, or medical restrictions…" /></label>}
          <div className="setup-note full"><strong>Your first workouts establish the baseline.</strong><span>Strength comes from completed weight and reps. Endurance comes from recorded distance, time, and pace. A connected activity service can be added after setup.</span></div>
          <label className="setup-check safety full"><input type="checkbox" checked={data.acceptedSafety} onChange={event => set('acceptedSafety', event.target.checked)} /><span><strong>I’ll report pain, injury, or unusual fatigue.</strong><small>Forge provides training guidance, not medical diagnosis.</small></span></label>
        </div>}
        {step === GOAL_STEP && <div className="setup-fields">
          {goals.length
            ? <div className="setup-goal-list full">
                {goals.map(goal => <div className="setup-goal-row" key={`${goal.type}-${goal.title}`}>
                  <span><strong>{goal.title}</strong><small>{goal.type}{goal.date ? ` · by ${goal.date}` : ''}</small></span>
                  <b>✓</b>
                </div>)}
                <button type="button" className="button ghost" onClick={() => setGoalOpen(true)}>Add another goal</button>
              </div>
            : <div className="setup-note full setup-goal-empty">
                {/* HOW GOALS WORK, IN THREE LINES. The old copy was one long
                    paragraph naming the wave, the mileage ramp and max week —
                    three mechanisms nobody has met yet. What they need to know
                    is that the goal drives everything and that one is enough. */}
                <strong>One goal drives the whole plan.</strong>
                <span>A lift to hit or a race to run. Forge writes every week backwards from it — the loads, the miles, and when you test.</span>
                <button type="button" className="button" onClick={() => setGoalOpen(true)}>Set your first goal</button>
              </div>}
          {/* The split does not exist in the database yet — it is written by
              the finish button — so hand the builder the days it is about to
              create. Without this the first goal an athlete ever sets has an
              empty "training connection" list. */}
          {goalOpen && <GoalBuilder
            coreLiftsOnly
            splitDays={setup?.splitDays?.length ? setup.splitDays : starterSplit(data.primaryFocus, data.trainingDays)}
            onClose={() => setGoalOpen(false)}
            onSave={(goal: CreatedGoal) => { saveGoal(goal, null); setGoalOpen(false); setError(''); }} />}
        </div>}
        {step === MAP_STEP && <div className="setup-fields setup-day-map">
          <div className="setup-note full">
            <strong>One movement per day is enough.</strong>
            <span>The lift you measure that day by. Add the rest later in Profile → Split.</span>
          </div>
          {untrainedGoalLifts.length > 0 && <div className="setup-note full setup-goal-warning">
            <strong>No day trains {untrainedGoalLifts.join(' or ')} yet.</strong>
            <span>A goal lift no day prescribes never gets waved or tested. Add it to the day you train it on.</span>
          </div>}
          {strengthDayIndexes.map(({ day, index }) => {
            const chosen = dayExercises[index] || [];
            const open = openDay === index;
            return <section className={open ? 'setup-day open full' : 'setup-day full'} key={`${day.name}-${index}`}>
              <button type="button" className="setup-day-head" onClick={() => setOpenDay(open ? -1 : index)} aria-expanded={open}>
                <span><strong>{day.name}</strong><small>{(day.muscles || []).join(' · ') || 'Strength'}</small></span>
                <span className={chosen.length ? 'setup-day-count set' : 'setup-day-count'}>{chosen.length || 'none'}</span>
              </button>
              {chosen.length > 0 && <div className="setup-day-chosen">{chosen.map(name => <button type="button" key={name} onClick={() => toggleDayExercise(index, name)}>{name}<span aria-hidden="true">×</span></button>)}</div>}
              {open && <div className="muscle-picker compact-muscle-picker setup-day-options">
                {coreFirstOptions(optionsForDay(index)).map(exercise => {
                  const selected = chosen.includes(exercise.name);
                  const isGoal = goalLiftKeys.has(canonicalLiftKey(exercise.name));
                  return <button type="button" key={exercise.id} aria-pressed={selected}
                    className={selected ? 'muscle-chip active' : 'muscle-chip'}
                    onClick={() => toggleDayExercise(index, exercise.name)}>{exercise.name}{isGoal ? <i className="setup-goal-flag" title="Goal lift"> ★</i> : null}</button>;
                })}
                {!optionsForDay(index).length && <small>No strength movements match this day&rsquo;s muscles yet.</small>}
              </div>}
            </section>;
          })}
          {!strengthDayIndexes.length && <div className="setup-note full"><strong>Your split has no lifting days.</strong><span>Nothing to map — endurance days are programmed from your goals and logged runs.</span></div>}
        </div>}
        {step === BASELINE_STEP && <div className="setup-fields setup-baseline">
          {/* NEITHER OF THESE WAS EVER ASKED, and the plan is built from both.
              weeklyMileage sat at 0, so the first block was written for
              somebody who runs nothing; the lifts had no evidence, so week one
              opened at a number derived from nothing. Both optional, both
              quick, and the preview on the next step fills in as they type —
              which is the only argument for entering them that matters. */}
          <div className="setup-note full">
            <strong>Skip anything you are not sure of.</strong>
            <span>Your first logged workouts replace all of it. This only decides where week one starts.</span>
          </div>
          {baselineLifts.length > 0 && <fieldset className="full setup-baseline-lifts">
            <legend>Your best recent set</legend>
            {baselineLifts.map(lift => <div className="setup-baseline-row" key={lift}>
              <span>{CORE_LIFT_LABELS[lift] || lift}</span>
              <DialField label="Weight" kind="weight" unit={data.units === 'Metric' ? 'kg' : 'lb'}
                value={baseline[lift]?.weight || ''} onChange={next => setBase(lift, 'weight', next)} hint="Optional" />
              <DialField label="Reps" kind="reps" value={baseline[lift]?.reps || ''} onChange={next => setBase(lift, 'reps', next)} hint="Optional" />
            </div>)}
          </fieldset>}
          {runningPlanned && <fieldset className="full setup-baseline-running">
            <legend>Your running now</legend>
            <DialField label="Miles a week" kind="distance" unit="mi" value={data.weeklyMileage ? String(data.weeklyMileage) : ''} onChange={next => set('weeklyMileage', Number(next))} hint="Roughly" />
            <DialField label="Longest recent run" kind="distance" unit="mi" value={data.longestRun ? String(data.longestRun) : ''} onChange={next => set('longestRun', Number(next))} hint="Optional" />
            <DialField label="Run days a week" kind="days" value={String(data.runningDays || '')} onChange={next => set('runningDays', Number(next))} />
          </fieldset>}
          {!baselineLifts.length && !runningPlanned && <div className="setup-note full"><strong>Nothing to ask yet.</strong><span>Your split has no lifting or running days.</span></div>}
        </div>}
        {step === PREVIEW_STEP && <div className="setup-fields setup-preview">
          {/* THE LAST SCREEN OF SETUP USED TO SHOW NOTHING. Everything the
              athlete entered became a plan somewhere out of sight, and the
              first block they ever saw was one they had no part in. This is
              week one, from the real derivation — same wavePrescription, same
              8-rep opening week. A flattering mock-up would be worse than
              nothing: they would meet the real numbers on Monday. */}
          <div className="setup-note full">
            <strong>Week one, from what you just entered.</strong>
            <span>Eight reps to start — the lightest week of the wave. It moves as you log.</span>
          </div>
          <ul className="setup-preview-days full">
            {preview.map((day, index) => <li key={`${day.name}-${index}`} className={day.kind}>
              <strong>{day.name}</strong>
              <span>
                {day.lift ? `${CORE_LIFT_LABELS[day.lift.exercise] || day.lift.exercise} ${day.lift.weight} × ${day.lift.reps}` : ''}
                {day.unknownLift ? `${CORE_LIFT_LABELS[day.unknownLift] || day.unknownLift} — load set by your first session` : ''}
                {day.run ? `${day.lift || day.unknownLift ? ' · ' : ''}${day.run}` : ''}
                {day.kind === 'rest' ? 'Rest' : ''}
              </span>
            </li>)}
          </ul>
          {!enteredBaseline.length && <p className="setup-preview-note full">No loads yet because no bests were entered — your first session sets them. <button type="button" className="text-button" onClick={() => { setError(''); setStep(BASELINE_STEP); }}>Add them</button></p>}
        </div>}
        {error && <div className="setup-error">{error}</div>}
        <footer className="setup-actions">{step ? <button className="button ghost" disabled={saving} onClick={() => { setError(''); setStep(current => Math.max(0, current - 1)); }}>← Back</button> : <span />}<button className="button" disabled={saving} onClick={step === LAST_STEP ? finish : next}>{step === LAST_STEP ? saving ? 'Saving…' : isEditing ? 'Save profile' : 'Enter Forge' : 'Continue'} →</button></footer>
      </section>
    </div>
  </main>;
}
