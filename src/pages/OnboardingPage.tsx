import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useProfileSetup, type AthleteSetup } from '../features/profile/ProfileSetupProvider';
import { saveProfile } from '../features/profile/profileService';
import { saveTrainingSplit } from '../features/splits/splitService';
import { useGoals } from '../features/goals/GoalsProvider';
import { GoalBuilder, type CreatedGoal } from '../components/GoalBuilder';

/* THREE STEPS, AND THE GOAL IS ONE OF THEM. Forge programs toward a goal —
   the wave, the mileage ramp and max week all exist to move one. An athlete
   who finished setup without one landed on a home screen of empty states and
   never met the thing that makes the app different; four of the first seven
   accounts sat there. So setup does not complete until a goal exists. */
const steps = [
  ['The essentials', 'Tell Forge what your training should serve.'],
  ['Train safely', 'Add only the limits that can change a workout.'],
  ['Your first goal', 'Name what the training is for.'],
] as const;
const LAST_STEP = steps.length - 1;

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
  return Array.from({ length: Math.max(1, Math.min(7, count)) }, (_, index) => source[index % source.length]);
}

export function OnboardingPage() {
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
  const [step, setStep] = useState(needsGoal ? LAST_STEP : 0);
  const [goalOpen, setGoalOpen] = useState(false);
  const [disclaimerChecked, setDisclaimerChecked] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [data, setData] = useState<AthleteSetup>(() => ({ ...blank, ...(setup || {}), displayName: setup?.displayName || suggestedName }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof AthleteSetup>(key: K, value: AthleteSetup[K]) => setData(current => ({ ...current, [key]: value }));
  const isEditing = Boolean(setup?.completedAt);

  const next = () => {
    if (step === 0) {
      if (!data.displayName.trim()) return setError('Enter your name.');
      if (data.trainingDays < 1 || data.trainingDays > 7) return setError('Choose 1–7 training days.');
    }
    if (step === 1 && !data.acceptedSafety) return setError('Confirm the safety note to continue.');
    setError(''); setStep(current => Math.min(LAST_STEP, current + 1)); window.scrollTo(0, 0);
  };

  const finish = async () => {
    if (!data.acceptedSafety) return setError('Confirm the safety note to finish.');
    /* THE GATE. Nothing below this line runs without a goal — not the profile
       write that sets onboarding_completed, and not saveSetup. */
    if (!goals.length) return setError('Add one goal to finish. Forge builds the plan around it.');
    setSaving(true); setError('');
    let username = (data.username || data.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '')).slice(0, 18);
    if (username.length < 3) username = `athlete${user?.id.slice(0, 6) || 'fit'}`;
    const splitDays = setup?.splitDays?.length ? setup.splitDays : starterSplit(data.primaryFocus, data.trainingDays);
    const completed = { ...data, username, splitDays, splitSource: 'Recommended' as const, completedAt: new Date().toISOString() };
    try {
      await saveProfile({
        username, displayName: data.displayName, birthDate: data.birthDate || null, heightCm: null,
        startingWeight: null, currentWeight: Number(data.currentWeight) || null,
        unitSystem: data.units === 'Metric' ? 'metric' : 'imperial', experienceLevel: 'intermediate',
        primaryGoal: data.primaryFocus === 'Strength' ? 'strength' : data.primaryFocus === 'Endurance' ? 'endurance' : data.primaryFocus === 'Body composition' ? 'weight_change' : 'general_fitness',
        equipment: [], preferredTrainingDays: Array.from({ length: data.trainingDays }, (_, index) => index),
      });
      if (!isEditing) {
        await saveTrainingSplit('Forge starter split', splitDays.map((day, index) => ({
          position: index + 1, name: day.name, muscleGroups: day.muscles || [], goalLifts: [],
          cardioTypes: day.type === 'Cardio' || day.type === 'Mixed' ? ['Forge'] : [],
        })));
      }
      saveSetup(completed);
      updateProfile({ runningDays: Math.min(data.trainingDays, data.runningDays), injuryConstraint: data.injuryConstraint });
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/onboarding' ? from : '/', { replace: true });
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
          <p>You are responsible for choosing loads, paces, and movements that are safe for you. Tell Forge about pain, injury, or unusual fatigue on the Coach tab so training can work around it — and see a professional when something does not resolve.</p>
        </div>
        <label className="setup-check safety full"><input type="checkbox" checked={disclaimerChecked} onChange={event => setDisclaimerChecked(event.target.checked)} /><span><strong>I understand and accept this.</strong><small>Forge provides training guidance, not medical advice.</small></span></label>
        <footer className="setup-actions"><span /><button className="button" disabled={!disclaimerChecked} onClick={() => { setDisclaimerAccepted(true); window.scrollTo(0, 0); }}>Continue to setup →</button></footer>
      </section>
    </div>
  </main>;

  return <main className="onboarding-shell onboarding-simple">
    <header className="onboarding-brand"><span className="forge-mark">—</span><strong>FORGE</strong><span>{isEditing && !needsGoal ? 'EDIT PROFILE' : `SETUP ${step + 1} OF ${steps.length}`}</span></header>
    <div className="onboarding-grid">
      <aside><span className="eyebrow">START SIMPLE</span><h1>Ready in three steps.</h1><p>Forge learns performance from completed workouts. You do not need to estimate maxes, pace, equipment, or recovery during setup.</p><ol>{steps.map(([name], index) => <li className={index === step ? 'active' : index < step ? 'done' : ''} key={name}><i>{index < step ? '✓' : index + 1}</i><span>{name}</span></li>)}</ol></aside>
      <section className="onboarding-card">
        <div className="setup-heading"><span className="eyebrow">{steps[step][0]}</span><h2>{steps[step][1]}</h2></div>
        {step === 0 && <div className="setup-fields">
          <label className="full">Your name <em>Required</em><input autoFocus value={data.displayName} onChange={event => set('displayName', event.target.value)} placeholder="Preston" /></label>
          <fieldset className="full"><legend>Main training focus</legend><div className="setup-choices">{(['Hybrid', 'Strength', 'Endurance', 'Body composition'] as const).map(item => <button type="button" className={data.primaryFocus === item ? 'active' : ''} onClick={() => set('primaryFocus', item)} key={item}>{item}</button>)}</div></fieldset>
          <label>Training days per cycle <input type="number" inputMode="numeric" min="1" max="7" value={data.trainingDays} onChange={event => set('trainingDays', Number(event.target.value))} /></label>
          <label>Units <select value={data.units} onChange={event => set('units', event.target.value as AthleteSetup['units'])}><option>Imperial</option><option>Metric</option></select></label>
          <label className="full">Current weight <span>Optional</span><input type="number" inputMode="decimal" min="1" value={data.currentWeight} onChange={event => set('currentWeight', event.target.value)} placeholder={data.units === 'Metric' ? 'kg' : 'lb'} /></label>
          <div className="setup-note full"><strong>That is enough to begin.</strong><span>Forge creates a starter split. You can adjust its days and exercises later from Plan.</span></div>
        </div>}
        {step === 1 && <div className="setup-fields">
          <label className="setup-check full"><input type="checkbox" checked={data.injuryConstraint} onChange={event => set('injuryConstraint', event.target.checked)} /><span><strong>I have a current injury or training limitation</strong><small>Forge will treat this as a hard constraint.</small></span></label>
          {data.injuryConstraint && <label className="full">What should Forge avoid?<textarea rows={4} value={data.limitationNotes} onChange={event => set('limitationNotes', event.target.value)} placeholder="Movements, impact, or medical restrictions…" /></label>}
          <div className="setup-note full"><strong>Your first workouts establish the baseline.</strong><span>Strength comes from completed weight and reps. Endurance comes from recorded distance, time, and pace. A connected activity service can be added after setup.</span></div>
          <label className="setup-check safety full"><input type="checkbox" checked={data.acceptedSafety} onChange={event => set('acceptedSafety', event.target.checked)} /><span><strong>I’ll report pain, injury, or unusual fatigue.</strong><small>Forge provides training guidance, not medical diagnosis.</small></span></label>
        </div>}
        {step === LAST_STEP && <div className="setup-fields">
          {goals.length
            ? <div className="setup-goal-list full">
                {goals.map(goal => <div className="setup-goal-row" key={`${goal.type}-${goal.title}`}>
                  <span><strong>{goal.title}</strong><small>{goal.type}{goal.date ? ` · by ${goal.date}` : ''}</small></span>
                  <b>✓</b>
                </div>)}
                <button type="button" className="button ghost" onClick={() => setGoalOpen(true)}>Add another goal</button>
              </div>
            : <div className="setup-note full setup-goal-empty">
                <strong>One goal is all Forge needs.</strong>
                <span>A lift you want to hit, or a race you want to run. The 8/6/4/2/1 wave, your weekly mileage and max week all exist to move it — without one, Forge has nothing to program toward.</span>
                <button type="button" className="button" onClick={() => setGoalOpen(true)}>Set your first goal</button>
              </div>}
          {goalOpen && <GoalBuilder onClose={() => setGoalOpen(false)} onSave={(goal: CreatedGoal) => { saveGoal(goal, null); setGoalOpen(false); setError(''); }} />}
        </div>}
        {error && <div className="setup-error">{error}</div>}
        <footer className="setup-actions">{step ? <button className="button ghost" disabled={saving} onClick={() => { setError(''); setStep(current => Math.max(0, current - 1)); }}>← Back</button> : <span />}<button className="button" disabled={saving} onClick={step === LAST_STEP ? finish : next}>{step === LAST_STEP ? saving ? 'Saving…' : isEditing ? 'Save profile' : 'Enter Forge' : 'Continue'} →</button></footer>
      </section>
    </div>
  </main>;
}
