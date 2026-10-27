import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { GoalBuilder, type CreatedGoal } from '../components/GoalBuilder';
import { useGoals } from '../features/goals/GoalsProvider';
import { buildGoalRoadmaps } from '../lib/goalPlanEngine';
import { GoalProgressCard } from '../components/GoalProgressCard';
import { goalFeasibility } from '../lib/goalFeasibility';
import { goalProgress, type GoalProgress, type MaxMode } from '../lib/goalProgress';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useWorkoutEvidence } from '../features/training/useWorkoutEvidence';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { MileageCheckOnGoal } from '../components/MileageGate';
import { tap } from '../lib/haptics';

/* THE GOALS PAGE IS THE CRUX, SO IT READS LIKE A SCOREBOARD.

   It used to be one card of titles in body-size type, a verdict word under
   each, all meshed together under a paragraph about which race the block was
   built for. Now each goal is its own card with its number large and a bar
   that fills to where the athlete is — green on track, yellow more work, red
   out of reach — grouped by what kind of goal it is, so strength, running and
   body read as three different things at a glance. The bars fill and the
   numbers count up as the page opens: the progress is the first thing seen.

   What used to sit at the top — the race-clash paragraph, the mileage gate —
   is the coach's to say, once, as a note (lib/coachNotes, MileageStartupCheck);
   it is not a heading this page lives under. */

const CATEGORIES = [
  { type: 'Strength', label: 'Strength', className: 'strength', icon: 'M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12' },
  { type: 'Endurance', label: 'Endurance', className: 'endurance', icon: 'M13 4a1.5 1.5 0 1 0 0 .01M8 20l3-6 3 2 2 5M6 12l3-3 4 1 2 3 3 1' },
  { type: 'Body Composition', label: 'Body', className: 'body', icon: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zM8.5 11a3.5 3.5 0 0 1 7 0M12 11l1.6-2.2' },
] as const;
const Glyph = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;

const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/* A number that counts up to its value when it first appears — the feeling
   of an app arriving with the score already moving. */
function CountUp({ to, delay = 0, duration = 1100, format = (value: number) => String(Math.round(value)) }: { to: number; delay?: number; duration?: number; format?: (value: number) => string }) {
  const [value, setValue] = useState(() => (reducedMotion() ? to : 0));
  useEffect(() => {
    if (reducedMotion()) { setValue(to); return; }
    let frame = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      setValue(to * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, delay, duration]);
  return <>{format(value)}</>;
}

const daysLeft = (iso: string) => Math.ceil((Date.parse(`${iso}T12:00:00`) - Date.now()) / 86400000);
const dueText = (iso: string) => { const days = daysLeft(iso); return days < 0 ? 'Past due' : days === 0 ? 'Due today' : days < 15 ? `${days} days left` : days < 120 ? `${Math.round(days / 7)} weeks left` : `by ${new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`; };

export function GoalsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { goals, saveGoal, deleteGoal, syncError } = useGoals();
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const workouts = useWorkoutEvidence();
  const roadmaps = useMemo(() => buildGoalRoadmaps(goals), [goals]);
  /* Every goal is asked about on its own, because goalFeasibility drops the
     ones it cannot judge and an index into a shortened list points at the
     wrong goal. */
  const verdicts = useMemo(
    () => goals.map(goal => goalFeasibility([goal], records, { maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0, excludedEfforts: setup?.excludedEfforts || [], workoutEfforts: workouts })[0]),
    [goals, records, setup?.maxWeeklyMileage, workouts],
  );
  /* CALCULATED OR TESTED, for every strength number on the page at once —
     the cards, their bars and the overall ring. Remembered on this device. */
  const [maxMode, setMaxMode] = useState<MaxMode>(() => { try { return localStorage.getItem('forge-goals-max-mode') === 'tested' ? 'tested' : 'calculated'; } catch { return 'calculated'; } });
  const chooseMode = (mode: MaxMode) => { if (mode === maxMode) return; tap(); setMaxMode(mode); try { localStorage.setItem('forge-goals-max-mode', mode); } catch { /* per-device convenience */ } };
  const progress = useMemo<GoalProgress[]>(() => goals.map((goal, index) => goalProgress(goal, records, verdicts[index], setup, maxMode)), [goals, records, verdicts, setup, maxMode]);
  const hasStrength = goals.some(goal => goal.type === 'Strength' && goal.unit !== 'reps');
  /* The bars start empty and fill one frame after the page mounts, so the
     width transition runs; each card is a beat behind the one above it. */
  const [filled, setFilled] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { if (mounted.current) return; mounted.current = true; const frame = requestAnimationFrame(() => requestAnimationFrame(() => setFilled(true))); return () => cancelAnimationFrame(frame); }, []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  /* Every goal's full read-out used to be open on the first goal the moment
     the page loaded, with no way to shut it again. Nothing is expanded on
     arrival now, and tapping an open goal closes it. */
  const [selected, setSelected] = useState<number | null>(null);
  /* DELETING A GOAL ASKS TWICE, IN PLACE. A goal steers the whole program, so
     removing one should not be a single mis-tap — and a browser confirm() box
     is not something this app uses anywhere else. */
  const [confirming, setConfirming] = useState<number | null>(null);
  /* A GOAL IS CHECKED AGAINST THE RUNNING THE MOMENT IT IS MADE. Finding out a
     week later that the target cannot be reached on the miles you do is worse
     than being told while you are still looking at it. */
  const [checking, setChecking] = useState<CreatedGoal | null>(null);
  const activeIndex = selected === null ? null : Math.min(selected, Math.max(0, goals.length - 1));
  /* Collapsing takes a half-pressed Delete with it — reopening a goal must
     not find it already asking "Sure?" about a tap made minutes ago. */
  const toggleGoal = (index: number) => { setConfirming(null); setSelected(current => (current === index ? null : index)); };
  const openBuilder = (index: number | null = null) => { setEditing(index); setOpen(true); };

  return <div className={embedded ? 'stack-xl goals-workspace goals-single-page embedded' : 'stack-xl goals-workspace goals-single-page'}>
    {open && <GoalBuilder
      initialGoal={editing === null ? undefined : goals[editing]}
      onClose={() => setOpen(false)}
      onSave={goal => {
        saveGoal(goal, editing);
        setOpen(false);
        setEditing(null);
        if (editing === null) setSelected(goals.length);
        if (goal.type === 'Endurance') setChecking(goal);
      }} />}

    {checking && <MileageCheckOnGoal goal={checking} onClose={() => setChecking(null)} />}

    {syncError && <p className="data-sync-error">{syncError}</p>}

    {hasStrength && <div className="gx-mode" role="radiogroup" aria-label="Strength max">
      {(['calculated', 'tested'] as const).map(mode => <button type="button" role="radio" aria-checked={maxMode === mode} key={mode} className={maxMode === mode ? 'active' : ''} onClick={() => chooseMode(mode)}>{mode === 'calculated' ? 'Calculated max' : 'Tested max'}</button>)}
    </div>}

    {goals.length > 0 && (() => {
      const known = progress.filter(item => item.share !== null);
      const average = known.length ? known.reduce((sum, item) => sum + (item.share || 0), 0) / known.length : 0;
      const counts = { good: progress.filter(item => item.tone === 'on-track' || item.tone === 'reached').length, work: progress.filter(item => item.tone === 'needs-work').length, off: progress.filter(item => item.tone === 'off-track').length };
      const ring = 2 * Math.PI * 42;
      /* The ring wears the colour most goals are in, ties going to the worse
         one — a green ring over goals that are out of reach would be a lie. */
      const ringTone = counts.off >= counts.good && counts.off >= counts.work && counts.off > 0 ? 'off' : counts.work >= counts.good && counts.work > 0 ? 'work' : counts.good > 0 ? 'good' : 'none';
      return <section className={`gx-hero ring-${ringTone}`} aria-label="Goals overview">
        <div className="gx-ring">
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" className="gx-ring-track" /><circle cx="50" cy="50" r="42" className="gx-ring-fill" style={{ strokeDasharray: ring, strokeDashoffset: filled ? ring * (1 - average) : ring }} /></svg>
          <strong><CountUp to={average * 100} />%</strong>
        </div>
        <div className="gx-hero-text">
          <span>Overall progress</span>
          <strong>{goals.length} {goals.length === 1 ? 'goal' : 'goals'} in play</strong>
          <div className="gx-tally">
            {counts.good > 0 && <b className="good">{counts.good} on track</b>}
            {counts.work > 0 && <b className="work">{counts.work} need work</b>}
            {counts.off > 0 && <b className="off">{counts.off} out of reach</b>}
          </div>
        </div>
      </section>;
    })()}

    {goals.length === 0 && <section className="gx-empty">
      <div className="gx-empty-art" aria-hidden="true">{CATEGORIES.map(category => <span key={category.type} className={category.className}><Glyph d={category.icon} /></span>)}</div>
      <h2>Set your first goal</h2>
      <p>A lift to hit, a race to run, or a weight to reach. Forge builds every week around it.</p>
    </section>}

    {CATEGORIES.map(category => {
      const members = goals.map((goal, index) => ({ goal, index })).filter(item => (item.goal.type === 'Body Composition' ? 'Body Composition' : item.goal.type === 'Endurance' ? 'Endurance' : 'Strength') === category.type);
      if (!members.length) return null;
      return <section className={`gx-group ${category.className}`} key={category.type}>
        <header className="gx-group-head"><span className="gx-group-icon"><Glyph d={category.icon} /></span><h2>{category.label}</h2><small>{members.length}</small></header>
        <ul className="gx-cards">{members.map(({ goal, index }, order) => {
          const item = progress[index];
          const isOpen = index === activeIndex;
          const delay = 120 + (index * 110);
          const pct = item.share === null ? 0 : item.share;
          return <li className={`gx-card tone-${item.tone}${isOpen ? ' open' : ''}`} key={`${goal.title}-${index}`} style={{ '--gx-delay': `${delay}ms`, animationDelay: `${order * 70}ms` } as CSSProperties}>
            <button className="gx-face" onClick={() => { tap(); toggleGoal(index); }} aria-expanded={isOpen}>
              <span className="gx-top"><strong className="gx-title">{goal.title}</strong><span className={`gx-pill tone-${item.tone}`}>{item.label}</span></span>
              <span className="gx-numbers">
                <span className="gx-now">{item.current !== null ? (item.currentText.includes(':') ? item.currentText : <CountUp to={item.current} delay={delay} format={value => `${Math.round(value * 10) / 10}`} />) : '—'}<small>{[item.current !== null && !item.currentText.includes(':') ? item.currentText.replace(/^[\d.]+\s*/, '') : '', goal.type === 'Strength' && goal.unit !== 'reps' ? (maxMode === 'tested' ? 'tested' : 'calc max') : item.current === null ? 'now' : ''].filter(Boolean).join(' · ')}</small></span>
                <span className="gx-arrow" aria-hidden="true">→</span>
                <span className="gx-target">{item.targetText}<small>goal</small></span>
              </span>
              <span className="gx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`${goal.title}: ${Math.round(pct * 100)}%`}>
                <i style={{ width: filled ? `${Math.max(item.share === null ? 0 : 4, pct * 100)}%` : '0%' }} />
              </span>
              <span className="gx-foot"><b>{item.share === null ? 'No data yet' : <><CountUp to={pct * 100} delay={delay} />%</>}</b><small>{dueText(goal.date)}</small></span>
            </button>
            {isOpen && <div className="goal-card-actions">
              <button onClick={() => openBuilder(index)} aria-label={`Edit ${goal.title}`}>Edit</button>
              <button
                className={confirming === index ? 'danger confirming' : 'danger'}
                onClick={() => { if (confirming === index) { deleteGoal(index); setConfirming(null); setSelected(null); } else setConfirming(index); }}
                onBlur={() => setConfirming(current => (current === index ? null : current))}
                aria-label={confirming === index ? `Confirm deleting ${goal.title}` : `Delete ${goal.title}`}>
                {confirming === index ? 'Sure?' : 'Delete'}
              </button>
            </div>}
            {isOpen && roadmaps[index] && <div className="goal-card-detail"><GoalProgressCard goal={goal} roadmap={roadmaps[index]} /></div>}
          </li>;
        })}</ul>
      </section>;
    })}

    {/* Adding is the last thing on the page: the goals you have come first. */}
    <button className="gx-add" onClick={() => { tap(); openBuilder(); }}>＋ {goals.length ? 'Add a goal' : 'Create your first goal'}</button>
  </div>;
}
