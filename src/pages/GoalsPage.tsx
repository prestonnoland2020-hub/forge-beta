import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { GoalBuilder, type CreatedGoal } from '../components/GoalBuilder';
import { useGoals } from '../features/goals/GoalsProvider';
import { buildGoalRoadmaps } from '../lib/goalPlanEngine';
import { GoalProgressCard } from '../components/GoalProgressCard';
import { useVo2Version } from '../features/training/useVo2Version';
import { GoalPredictionCard } from '../components/GoalPredictionCard';
import { goalFeasibility } from '../lib/goalFeasibility';
import { expectedRunMiles, goalProgress, type GoalProgress, type MaxMode } from '../lib/goalProgress';
import { predictRaceFromLegacyMethod, testedRaceSeconds } from '../lib/cardioPrediction';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useWorkoutEvidence } from '../features/training/useWorkoutEvidence';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { MileageCheckOnGoal } from '../components/MileageGate';
import { land, rise, tap } from '../lib/haptics';
import { Icon } from '../components/Icon';
import { predictionFromNow } from '../lib/predictionFromNow';
import { quickWinFor, suggestGoals, type GoalDraft, type GoalJudge, type GoalSuggestion } from '../lib/goalSuggestions';
import { CORE_LIFTS } from '../lib/coreLifts';
import { canonicalLiftKey } from '../lib/liftAliases';
import { plateausFor } from '../lib/plateau';
import { useTrainingLibrary } from '../features/training/TrainingLibraryProvider';

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
    let shown = format(0);
    const start = performance.now() + delay;
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const next = to * (1 - Math.pow(1 - t, 3));
      setValue(next);
      /* Felt as well as seen: a click each time the shown figure changes, and
         a firmer tap when it lands. */
      const text = format(next);
      if (text !== shown) { shown = text; if (t < 1) rise(); }
      if (t < 1) frame = requestAnimationFrame(step); else if (to > 0) land();
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
  const vo2Version = useVo2Version();
  const verdicts = useMemo(
    () => goals.map(goal => goalFeasibility([goal], records, { maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0, excludedEfforts: setup?.excludedEfforts || [], workoutEfforts: workouts })[0]),
    [goals, records, setup?.maxWeeklyMileage, workouts, vo2Version],
  );
  /* CALCULATED OR TESTED, for every strength number on the page at once —
     the cards, their bars and the overall ring. Remembered on this device. */
  const [maxMode, setMaxMode] = useState<MaxMode>(() => { try { return localStorage.getItem('forge-goals-max-mode') === 'tested' ? 'tested' : 'calculated'; } catch { return 'calculated'; } });
  const chooseMode = (mode: MaxMode) => { if (mode === maxMode) return; tap(); setMaxMode(mode); try { localStorage.setItem('forge-goals-max-mode', mode); } catch { /* per-device convenience */ } };
  /* What logged running is worth at each endurance goal's distance today —
     the same predictor the goal detail calls CURRENT. */
  const enduranceNow = useMemo(() => goals.map(goal => {
    if (goal.type !== 'Endurance') return null;
    const miles = expectedRunMiles(goal);
    if (!miles) return null;
    /* Estimated is the race predictor; tested is a time actually run at the
       distance — the same switch the strength goals use. */
    const estimate = predictRaceFromLegacyMethod(records, miles, setup?.excludedEfforts || [], workouts)?.seconds ?? null;
    return maxMode === 'tested' ? testedRaceSeconds(records, miles, setup?.excludedEfforts || [], estimate) : estimate;
  }), [goals, records, setup?.excludedEfforts, workouts, vo2Version, maxMode]);
  const progress = useMemo<GoalProgress[]>(() => goals.map((goal, index) => goalProgress(goal, records, verdicts[index], setup, maxMode, enduranceNow[index])), [goals, records, verdicts, setup, maxMode, enduranceNow]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  /* THE COACH'S EYE ON A GOAL THAT DOES NOT EXIST YET: the number its card
     would show today and the prediction it would draw, from exactly the same
     code the cards use — so a suggested goal reads on its card the way the
     suggestion said it would. Race predictions are the slow part and are
     remembered per distance. */
  const judge = useMemo<GoalJudge>(() => {
    const cap = { maxWeeklyMileage: Number(setup?.maxWeeklyMileage) || 0, excludedEfforts: setup?.excludedEfforts || [], workoutEfforts: workouts };
    const raceNow = new Map<number, number | null>();
    const verdictCache = new Map<string, ReturnType<typeof goalFeasibility>[number] | undefined>();
    return (goal: CreatedGoal) => {
      const key = `${goal.type}|${goal.exercise}|${goal.target}|${goal.date}|${goal.current}|${goal.unit}`;
      if (!verdictCache.has(key)) verdictCache.set(key, goalFeasibility([goal], records, cap)[0]);
      const verdict = verdictCache.get(key);
      let endurance: number | null = null;
      if (goal.type === 'Endurance') {
        const miles = expectedRunMiles(goal);
        if (miles) {
          if (!raceNow.has(miles)) {
            const estimate = predictRaceFromLegacyMethod(records, miles, setup?.excludedEfforts || [], workouts)?.seconds ?? null;
            raceNow.set(miles, maxMode === 'tested' ? testedRaceSeconds(records, miles, setup?.excludedEfforts || [], estimate) : estimate);
          }
          endurance = raceNow.get(miles) ?? null;
        }
      }
      const model = verdict?.prediction;
      const now = goalProgress(goal, records, verdict, setup, maxMode, endurance).current ?? model?.start ?? null;
      return { now, model, p: model ? predictionFromNow(model, now) : undefined };
    };
  }, [records, setup, workouts, maxMode, vo2Version]);
  /* STUCK LIFTS: the plan's own stall rule (lib/plateau). A stuck lift's
     first suggested goal is a new best on the plateau plan, and its goal card
     says so. */
  const { exercises: library } = useTrainingLibrary();
  const stuck = useMemo(() => {
    const lifts = [...new Set([...CORE_LIFTS, ...goals.filter(goal => goal.type === 'Strength' && goal.exercise).map(goal => String(goal.exercise))])];
    return plateausFor(lifts, records, library);
  }, [goals, records, library]);
  const plateauOf = useCallback((lift?: string) => { const hit = lift ? stuck.get(canonicalLiftKey(lift)) : undefined; return hit ? { best: hit.plateau.best, weeks: hit.plateau.weeks } : undefined; }, [stuck]);
  const coach = useCallback((draft: GoalDraft) => suggestGoals(draft.type === 'Strength' ? { ...draft, plateau: plateauOf(draft.exercise) } : draft, judge), [judge, plateauOf]);
  /* HAVE YOU THOUGHT ABOUT THIS ONE? Before a type is even chosen, the coach
     offers the goals it would set: the attainable target on each main lift the
     athlete trains and has no goal on yet, and a 5K when they run. */
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const picks = useMemo<GoalSuggestion[]>(() => {
    if (!open || editing !== null) return [];
    const has = (lift: string) => goals.some(goal => goal.exercise && canonicalLiftKey(goal.exercise) === canonicalLiftKey(lift));
    const trained = (lift: string) => records.some(record => (record.topSets || []).some(set => set.lift && canonicalLiftKey(set.lift) === canonicalLiftKey(lift) && set.completed !== false));
    const out: GoalSuggestion[] = [];
    for (const lift of CORE_LIFTS) {
      if (lift === 'Pull Ups' || has(lift) || !trained(lift)) continue;
      const options = suggestGoals({ type: 'Strength', exercise: lift, unit: weightUnit, plateau: plateauOf(lift) }, judge);
      /* A stuck lift is offered its plateau goal; the rest their attainable one. */
      const pick = plateauOf(lift) ? options.find(item => item.tier === 'quick') : options.find(item => item.tier === 'attainable');
      if (pick) out.push(pick);
    }
    if (!goals.some(goal => goal.type === 'Endurance')) {
      const run = suggestGoals({ type: 'Endurance', exercise: '5K Run', unit: 'mm:ss', metric: 'Finish time' }, judge).find(item => item.tier === 'attainable');
      if (run) out.push(run);
    }
    return out.slice(0, 3);
  }, [open, editing, goals, records, judge, weightUnit, plateauOf]);
  /* A SLIPPING GOAL GETS A STEPPING STONE: something the athlete can hit in
     the next few weeks, offered on the card. The big goal stays. */
  const quickWins = useMemo(() => goals.map((goal, index) => {
    const item = progress[index];
    const plateau = goal.type === 'Strength' ? plateauOf(goal.exercise) : undefined;
    /* A stuck lift is pushed whatever the pill says; otherwise only goals
       that are slipping get a stepping stone. */
    if (!item || item.tone === 'reached' || (!plateau && item.tone !== 'off-track' && item.tone !== 'needs-work') || !verdicts[index]?.prediction) return null;
    const win = quickWinFor(goal, judge, undefined, plateau);
    if (!win) return null;
    /* A step is nearer than the goal it leads to: never the goal itself (a
       "test it" win on a goal that is ready to test) or past it. */
    const own = Number.parseFloat(String(goal.target)) || 0;
    const step = Number.parseFloat(win.targetText.replace(/:/g, '')) || 0;
    if (item.label === 'Ready to test' || win.targetText === String(goal.target).split(' ')[0] || (goal.type === 'Strength' && own && step >= own)) return null;
    const exists = goals.some(other => other.type === win.goal.type && other.exercise === win.goal.exercise && String(other.target).split(' ')[0] === win.targetText);
    /* Already added: still shown, saying so, so the row does not just vanish. */
    return { ...win, added: exists };
  }), [goals, progress, verdicts, judge, plateauOf]);
  const hasStrength = goals.some(goal => goal.type === 'Strength' && goal.unit !== 'reps');
  const hasRunTime = goals.some(goal => goal.type === 'Endurance' && /mm:ss|hh:mm/i.test(String(goal.unit || goal.target || '')) && expectedRunMiles(goal) !== null);
  /* The bars start empty and fill one frame after the page mounts, so the
     width transition runs; each card is a beat behind the one above it. */
  const [filled, setFilled] = useState(false);
  /* Both frames are cancelled on cleanup and nothing guards a second run, so
     StrictMode's mount-unmount-mount still ends with the bars filled. */
  useEffect(() => { let inner = 0; const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setFilled(true)); }); return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); }; }, []);
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
      coach={coach}
      picks={picks}
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

    {/* The switch and the overview share one tight block, so the goals start
       near the top of a phone; on a wide screen they sit side by side. */}
    <div className="gx-head">
    {/* A switch should look like one: a label saying what it switches, a thumb that slides, and a line saying what the chosen side counts. */}
    {/* Not before there is anything to count: the switch meant nothing to an
        athlete with no logged sets, and it was the first thing on the page. */}
    {(hasStrength || hasRunTime) && records.length > 0 && <div className="gx-mode" data-mode={maxMode}>
      <span className="gx-mode-label" id="gx-mode-label">{hasStrength && hasRunTime ? 'Strength and running goals use' : hasStrength ? 'Strength goals use' : 'Running goals use'}</span>
      <div className="gx-mode-track" role="radiogroup" aria-labelledby="gx-mode-label">
        <i className="gx-mode-thumb" aria-hidden="true" />
        {(['calculated', 'tested'] as const).map(mode => <button type="button" role="radio" aria-checked={maxMode === mode} key={mode} className={maxMode === mode ? 'active' : ''} onClick={() => chooseMode(mode)}>{mode === 'calculated' ? 'Estimated' : 'Actual'}</button>)}
      </div>
      <p className="gx-mode-hint">{maxMode === 'calculated'
        ? (hasStrength && hasRunTime ? 'Estimated from your best sets and runs.' : hasStrength ? 'Estimated from your best rep sets.' : 'Predicted from your best runs.')
        : (hasStrength && hasRunTime ? 'Only singles you lifted and distances you ran.' : hasStrength ? 'Only singles you actually lifted.' : 'Only times you actually ran at the distance.')}</p>
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
    </div>

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
                <span className="gx-now">{item.current !== null ? (item.currentText.includes(':') ? item.currentText : <CountUp to={item.current} delay={delay} format={value => `${Math.round(value * 10) / 10}`} />) : '—'}<small>{[item.current !== null && !item.currentText.includes(':') ? item.currentText.replace(/^[\d.]+\s*/, '') : '', goal.type === 'Strength' && goal.unit !== 'reps' ? (maxMode === 'tested' ? 'tested' : 'estimated') : goal.type === 'Endurance' && item.current !== null && item.currentText.includes(':') ? (maxMode === 'tested' ? 'tested' : 'est.') : item.current === null ? 'now' : ''].filter(Boolean).join(' · ')}</small></span>
                <span className="gx-arrow" aria-hidden="true"><Icon name="arrow" size={14}/></span>
                <span className="gx-target">{item.targetText}<small>goal</small></span>
              </span>
              <span className="gx-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`${goal.title}: ${Math.round(pct * 100)}%`}>
                <i style={{ width: filled ? `${Math.max(item.share === null ? 0 : 4, pct * 100)}%` : '0%' }} />
              </span>
              <span className="gx-foot"><b>{item.share === null ? (goal.type === 'Strength' ? 'Starts with your first set' : goal.type === 'Body Composition' ? 'Starts with a weigh-in' : /hyrox/i.test(`${goal.exercise || ''} ${goal.title}`) ? 'Starts with a HYROX time' : expectedRunMiles(goal) === null ? 'Starts with your first logged time' : 'Starts with your first run') : <><CountUp to={pct * 100} delay={delay} />%</>}</b><small>{dueText(goal.date)}</small></span>
            </button>
            {isOpen && verdicts[index]?.prediction && <GoalPredictionCard verdict={verdicts[index]} date={goal.date} unit={setup?.units === 'Metric' ? 'kg' : 'lb'} hoursFirst={String(goal.unit || '').includes('hh:mm:ss')} now={item.current} quickWin={quickWins[index]} onAddQuickWin={win => saveGoal(win.goal, null)} />}
            {/* With a prediction, the card above already says where the goal lands;
               the roadmap card is for goals the model cannot predict. */}
            {isOpen && roadmaps[index] && !verdicts[index]?.prediction && <div className="goal-card-detail"><GoalProgressCard goal={goal} roadmap={roadmaps[index]} /></div>}
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
          </li>;
        })}</ul>
      </section>;
    })}

    {/* Adding is the last thing on the page: the goals you have come first. */}
    <button className="gx-add" onClick={() => { tap(); openBuilder(); }}>＋ {goals.length ? 'Add a goal' : 'Create your first goal'}</button>
  </div>;
}
