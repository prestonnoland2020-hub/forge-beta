import { useMemo, useState } from 'react';
import { GoalBuilder, type CreatedGoal } from '../components/GoalBuilder';
import { useGoals } from '../features/goals/GoalsProvider';
import { buildGoalRoadmaps } from '../lib/goalPlanEngine';
import { GoalProgressCard } from '../components/GoalProgressCard';
import { formatGoalTarget } from '../lib/time';
import { competingRaces, goalFeasibility } from '../lib/goalFeasibility';
import { enduranceTarget } from '../lib/qualitySession';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { MileageGate, MileageCheckOnGoal } from '../components/MileageGate';

/* A GOAL'S OWN NAME IS THE POINT OF THE ROW. This page used to be a
   six-column table — type, title, target, due, edit, delete — squeezed into a
   phone. "Bench 365" came out as "Be…" and "Sub-20 5K" as "Sub…", so the one
   thing an athlete scans for was the one thing the layout threw away. It is a
   list of cards now: the title gets the full width and wraps if it needs to,
   the numbers sit under it where they have room, and Forge's verdict — which
   was buried behind a tap — rides on the face of the card. */

const verdictLabel = (verdict: string) =>
  verdict === 'reachable' ? 'On track' : verdict === 'needs-more' ? 'Needs more' : 'Out of reach';

const typeLabel = (type: string) => (type === 'Strength' ? 'Strength' : type === 'Endurance' ? 'Endurance' : 'Body');

export function GoalsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { goals, saveGoal, deleteGoal, syncError } = useGoals();
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const roadmaps = useMemo(() => buildGoalRoadmaps(goals), [goals]);
  const clash = useMemo(() => competingRaces(goals), [goals]);
  const built = useMemo(() => enduranceTarget(goals), [goals]);
  /* Every goal is asked about on its own, because goalFeasibility drops the
     ones it cannot judge and an index into a shortened list points at the
     wrong goal. */
  const verdicts = useMemo(
    () => goals.map(goal => goalFeasibility([goal], records, { maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0 })[0]),
    [goals, records, setup?.maxWeeklyMileage],
  );
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
  const toggleGoal = (index: number) => setSelected(current => (current === index ? null : index));
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

    {/* SEVERAL RACES ON ONE DATE IS NOT A PLAN. A mile, a two-mile and a 5K all
        due the same day are three different builds and the block can only peak
        for one, so none of them gets one. The athlete is told to pick rather
        than quietly handed a compromise that serves nothing. */}
    {clash && <section className="card goal-clash">
      <strong>{clash.races.length} races on the same date</strong>
      <p>{clash.races.join(', ')} are all set for {new Date(`${clash.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. A block peaks for one race — pick the one that matters and move the others out by a few weeks, or they all get a compromise.</p>
      {/* AND SAY WHICH ONE IT CHOSE. Telling someone to pick while quietly
          picking for them is the same silence in a friendlier voice: the plan
          is paced off one of these races today, and they cannot judge the
          advice without knowing which. The longest race wins, because a build
          for it gives the shorter ones a base and the reverse gives nothing. */}
      {built && <p className="goal-clash-built">Until you do, the plan is built for the <strong>{built.goal.title || built.goal.exercise}</strong> — the longest of them — and paced off it. The shorter races are trained inside that build.</p>}
    </section>}

    <MileageGate />

    <section className="card compact-goal-list">
      {syncError && <p className="data-sync-error">{syncError}</p>}
      <header>
        <div>
          <span className="eyebrow">Active goals</span>
          <h2>{goals.length ? `${goals.length} ${goals.length === 1 ? 'goal' : 'goals'}` : 'No goals yet'}</h2>
        </div>
        {goals.length ? <button className="button secondary small-button" onClick={() => openBuilder()}>＋ New</button> : null}
      </header>

      {goals.length ? <ul className="goal-cards">
        {goals.map((goal, index) => {
          const verdict = verdicts[index];
          const isOpen = index === activeIndex;
          return <li className={isOpen ? 'goal-card open' : 'goal-card'} key={`${goal.title}-${index}`}>
            <button className="goal-card-face" onClick={() => toggleGoal(index)} aria-pressed={isOpen} aria-expanded={isOpen}>
              <span className="goal-card-meta">
                <b className={`goal-type-tag ${goal.type.toLowerCase()}`}>{typeLabel(goal.type)}</b>
                <small className="goal-card-due">{new Date(`${goal.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</small>
              </span>
              <strong className="goal-card-title">{goal.title}</strong>
              <span className="goal-card-target">{formatGoalTarget(goal.target, goal.metric, goal.unit)}<small>{goal.metric}</small></span>
              {verdict && <span className={`goal-card-verdict ${verdict.verdict}`}><i aria-hidden="true" />{verdictLabel(verdict.verdict)}</span>}
            </button>
            <div className="goal-card-actions">
              <button onClick={() => openBuilder(index)} aria-label={`Edit ${goal.title}`}>Edit</button>
              <button
                className={confirming === index ? 'danger confirming' : 'danger'}
                onClick={() => { if (confirming === index) { deleteGoal(index); setConfirming(null); setSelected(null); } else setConfirming(index); }}
                onBlur={() => setConfirming(current => (current === index ? null : current))}
                aria-label={confirming === index ? `Confirm deleting ${goal.title}` : `Delete ${goal.title}`}>
                {confirming === index ? 'Sure?' : 'Delete'}
              </button>
            </div>
            {isOpen && roadmaps[index] && <div className="goal-card-detail"><GoalProgressCard goal={goal} roadmap={roadmaps[index]} /></div>}
          </li>;
        })}
      </ul> : <div className="compact-goal-empty">
        <p>Create one clear strength, endurance, or body-composition target.</p>
        <button className="button" onClick={() => openBuilder()}>Create your first goal</button>
      </div>}
    </section>
  </div>;
}
