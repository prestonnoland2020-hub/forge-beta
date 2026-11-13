import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CoachToday, TodayModeSwitch, TODAY_MODE_KEY } from '../components/CoachToday';
import { FROM_PLAN_KEY } from '../lib/guided/fromPlan';
import { cardioPlanSummary } from '../components/CardioPlanBuilder';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { StravaReviewModal } from '../components/StravaReviewModal';
import { formatCardioSummary } from '../lib/cardioSession';
import { useAthleteNotes } from '../features/training/useAthleteNotes';
import { isBufferActive } from '../features/training/athleteNotesService';
import { isSickNote, limitationIn } from '../lib/bodyLog';
import { Icon } from '../components/Icon';
import { sessionLength } from '../lib/time';
import { estimateMaxHr, heartRateRuns, heartRateTargets } from '../lib/heartRate';
import { WrappedEntry, WrappedReminderCard } from '../components/WrappedEntry';
import { SplitGuidePrompt, SplitReadyNote } from '../components/SplitGuidePrompt';
import { useGoals } from '../features/goals/GoalsProvider';
import { WAVE_REPS, ACCESSORY_REPS } from '../features/training/aiPlanService';
import { sameLift } from '../lib/liftAliases';
import { useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import { openWorkout } from '../lib/workoutOpen';
import { goalFeasibility } from '../lib/goalFeasibility';
import { readSwaps, writeSwap, swappedName, lastSet, swapOptions } from '../lib/todaySwaps';
import { buildFullWorkout, todaysObjective, warmupRamp } from '../lib/fullWorkout';
import '../today-picks.css';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};


/* The plan summary leads with the activity ("Easy Run · 2.5 miles · 9:20/mi");
   under a title that already says it, the detail starts after it. */
const runDetail = (title: string, summary: string) => {
  const [first, ...rest] = summary.split(' · ');
  return rest.length && title.toLowerCase().includes(first.toLowerCase()) ? rest.join(' · ') : summary;
};

export function HomePage() {
  const { recommendation: suggested, loading, syncError, toggleTopSet, setCardioSelected, recommendationFor, splitDays } = useDailyRecommendation();
  const { goals } = useGoals();
  /* WHAT ARE YOU TRAINING TODAY? Forge suggests the next split day; one tap
     on a chip shows any other day instead, with that day's lifts and targets.
     Remembered for today on this device. Nothing is skipped by choosing: the
     split moves on from whatever day is logged. */
  const pickKey = `forge-today-pick-${todayIso()}`;
  const [picked, setPicked] = useState<string>(() => { try { return localStorage.getItem(pickKey) || ''; } catch { return ''; } });
  const pick = (name: string) => { const next = name === suggested?.splitDay.name ? '' : name; setPicked(next); try { if (next) localStorage.setItem(pickKey, next); else localStorage.removeItem(pickKey); } catch { /* per-device */ } };
  const pickedDay = picked ? splitDays.find(day => day.name === picked) : undefined;
  const recommendation = useMemo(() => (pickedDay ? recommendationFor(pickedDay.position, pickedDay.name) : null) || suggested, [pickedDay, recommendationFor, suggested]);
  const choosing = Boolean(pickedDay && recommendation && recommendation !== suggested);
  /* The block's rep wave for a lift: the main lifts run 8-6-4-2-1, a lift
     with no goal runs 12-10-8-6. Shown only when today's reps sit on it. */
  const waveFor = (exercise: string, reps: number) => {
    const main = goals.some(goal => goal.exercise && sameLift(goal.exercise, exercise));
    const wave: readonly number[] = main ? WAVE_REPS : ACCESSORY_REPS;
    const at = wave.indexOf(reps);
    return at < 0 ? null : { wave, at };
  };
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  /* The day's run with its heart-rate check: a ceiling on an easy or long run,
     a band on threshold work. Only for an athlete whose watch records it. */
  const hrTargets = useMemo(() => heartRateRuns(records).length ? heartRateTargets(estimateMaxHr(records, setup?.birthDate)) : null, [records, setup?.birthDate]);
  const hrHint = (title: string) => !hrTargets ? '' : /threshold|tempo/i.test(title) ? `Heart rate ${hrTargets.thresholdLow}–${hrTargets.thresholdHigh}` : /easy|long|recovery|base/i.test(title) ? `Keep heart rate under ${hrTargets.easyCeiling}` : '';
  const { notes } = useAthleteNotes();
  const bufferedNotes = notes.filter(isBufferActive);
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const currentDate = todayIso();
  const completedToday = records.find(record => record.date === currentDate);
  const completedSets = (completedToday?.topSets || []).filter(set => set.completed !== false);
  const resumeUrl = completedToday ? openWorkout(currentDate) : null;
  /* MY PLAN | COACH ME. Which Today she sees; remembered on the device. Someone
     who chose "Coach me" in setup starts on the coach side. */
  const navigate = useNavigate();
  const [mode, setMode] = useState<'plan' | 'coach'>(() => { try { const saved = localStorage.getItem(TODAY_MODE_KEY); if (saved === 'plan' || saved === 'coach') return saved; } catch { /* fine */ } return (setup as { trainingMode?: string } | null)?.trainingMode === 'coach' ? 'coach' : 'plan'; });
  const chooseMode = (next: 'plan' | 'coach') => { setMode(next); try { localStorage.setItem(TODAY_MODE_KEY, next); } catch { /* fine */ } };
  /* TOP SETS ONLY | BUILD MY WORKOUT. The plan side is either just the top
     sets that move the goals, or a whole session written around them. */
  const [build, setBuild] = useState<'top' | 'full'>(() => { try { return localStorage.getItem('forge-today-build') === 'full' ? 'full' : 'top'; } catch { return 'top'; } });
  const chooseBuild = (next: 'top' | 'full') => { setBuild(next); try { localStorage.setItem('forge-today-build', next); } catch { /* fine */ } };
  const { exercises: library } = useTrainingLibrary();
  const feasibility = useMemo(() => goalFeasibility(goals, records), [goals, records]);
  /* Swaps for today, and which lift's swap list is open. */
  const [swaps, setSwaps] = useState(() => readSwaps(currentDate));
  const [swapOpen, setSwapOpen] = useState<string | null>(null);
  const swapTo = (from: string, to: string | null) => { setSwaps(writeSwap(currentDate, from, to)); setSwapOpen(null); };
  /* THE DAY SLIDER. Swipe through the split; the day that settles in the
     middle is the day. It opens centred on today's day. */
  const daysRef = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);
  const shownDay = recommendation?.splitDay.name;
  useEffect(() => {
    const strip = daysRef.current; if (!strip) return;
    const card = strip.querySelector<HTMLElement>('.tp-day.on'); if (!card) return;
    const left = card.offsetLeft - (strip.clientWidth - card.clientWidth) / 2;
    if (Math.abs(strip.scrollLeft - left) > 4) strip.scrollTo({ left, behavior: 'auto' });
  }, [shownDay, mode, build]);
  const onDaysScroll = () => {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const strip = daysRef.current; if (!strip) return;
      const middle = strip.scrollLeft + strip.clientWidth / 2;
      let best: HTMLElement | null = null; let gap = Infinity;
      strip.querySelectorAll<HTMLElement>('.tp-day').forEach(card => { const distance = Math.abs(card.offsetLeft + card.clientWidth / 2 - middle); if (distance < gap) { gap = distance; best = card; } });
      const name = (best as HTMLElement | null)?.dataset.day;
      if (name && name !== shownDay) pick(name);
    }, 140);
  };

  if (loading && !recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">Today</span><h2>Preparing your workout</h2><p>Checking your latest training.</p></section></div>;
  if (!recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">One quick setup</span><h2>Build your first training day</h2><p>Add a split day so Forge knows what comes next.</p><Link className="button" to="/split?guide=1&from=home">Build my split step by step <Icon name="arrow"/></Link></section><SplitGuidePrompt /></div>;

  /* A stored recommendation written by an older build — or one that arrived
     half-formed — has no top sets, and reading through it turned Today into
     the crash screen. The day is still worth showing without them. */
  const plannedSets = recommendation.topSets || [];
  /* A swapped lift stands in for the original: its own last weight and reps
     when it has them, "work up to" when it is new. */
  const recommendedSets = plannedSets.map(set => {
    const to = swappedName(swaps, set.exercise); if (!to) return { ...set, swappedFrom: undefined as string | undefined };
    const last = lastSet(records, to);
    return { ...set, exercise: to, swappedFrom: set.exercise, weight: last?.weight || 0, reps: last?.reps || 8, source: (last ? 'history' : 'baseline') as typeof set.source };
  });
  /* A day picked from the chips is the whole day: every lift on it counts. */
  const selectedSets = choosing ? recommendedSets : recommendedSets.filter(set => set.selected);
  const selectedCount = selectedSets.length + (recommendation.cardio && (choosing || recommendation.cardio.selected) ? 1 : 0);
  const startUrl = choosing && pickedDay
    ? `/workout?source=split&day=${pickedDay.position}&dayName=${encodeURIComponent(pickedDay.name)}`
    : `/workout?source=recommendation&recommendation=${encodeURIComponent(recommendation.id || recommendation.date)}`;
  /* The suggested day leads, then the rest of the split in order. */
  /* The split in its order, each day once — a split with the same day name
     twice showed it twice — rest days only when today is one. */
  const chips = splitDays.filter((day, index, list) => (day.type !== 'rest' || day.name === suggested?.splitDay.name) && list.findIndex(other => other.name === day.name) === index);
  const onDay = recommendedSets.map(set => set.exercise);
  const swapPanel = (set: { exercise: string; muscle: string; swappedFrom?: string }) => {
    const original = set.swappedFrom || set.exercise;
    if (swapOpen !== original) return null;
    const options = swapOptions(library, set.muscle, onDay, name => Boolean(lastSet(records, name)));
    return <div className="tp-swap-list">
      <p>Swap {set.exercise} for today</p>
      {set.swappedFrom && <button type="button" className="back" onClick={() => swapTo(original, null)}>Back to {set.swappedFrom}</button>}
      {options.map(option => { const last = lastSet(records, option.name); return <button type="button" key={option.name} onClick={() => swapTo(original, option.name)}><span>{option.name}</span><small>{last ? `Last: ${last.weight} ${weightUnit} × ${last.reps}` : 'New'}</small></button>; })}
      {!options.length && <small className="none">No other {set.muscle.toLowerCase()} lifts in your exercise list.</small>}
      <button type="button" className="cancel" onClick={() => setSwapOpen(null)}>Cancel</button>
    </div>;
  };
  const swapButton = (set: { exercise: string; swappedFrom?: string }) => { const original = set.swappedFrom || set.exercise; return <button type="button" className={`tp-swap${set.swappedFrom ? ' did' : ''}`} aria-expanded={swapOpen === original} onClick={() => setSwapOpen(swapOpen === original ? null : original)}>{set.swappedFrom ? 'Swapped' : 'Swap'}</button>; };

  const dayType = recommendation.splitDay.type;
  const quiet = !recommendedSets.length && !recommendation.cardio && (dayType === 'rest' || dayType === 'cardio');

  /* THE WHOLE SESSION, when "Build my workout" is chosen: each top set with
     its back-offs, and an accessory for every muscle the day trains. */
  const metric = setup?.units === 'Metric';
  const isGoalLift = (exercise: string) => goals.some(goal => goal.exercise && sameLift(goal.exercise, exercise));
  const lines = selectedSets.map(set => ({ exercise: set.exercise, muscle: set.muscle, weight: set.source === 'history' ? set.weight : 0, reps: set.reps || 5 }));
  const full = buildFullWorkout({ topSets: lines, dayMuscles: recommendation.splitDay.muscles || [], library, records, metric, unit: weightUnit });
  const accessories = full.filter(block => block.kind === 'accessory');
  const extraParam = build === 'full' && recommendedSets.length && accessories.length ? `&extra=${encodeURIComponent(JSON.stringify(accessories.map(block => ({ lift: block.exercise, muscle: block.muscle, weight: block.weight, reps: block.reps }))))}` : '';
  /* TODAY'S GOAL, said once and big: the lift that moves a goal, its load,
     and how to get there. */
  const objective = todaysObjective(lines, isGoalLift);
  const ramp = objective ? warmupRamp(objective.weight, metric) : [];
  /* WHY THIS NUMBER. The coach's reason in one line: what you did last time,
     and what today does for the goal, so the weight is not a mystery. */
  const why = (() => {
    if (!objective) return '';
    const last = lastSet(records, objective.exercise);
    const goalIndex = goals.findIndex(goal => goal.type === 'Strength' && goal.exercise && sameLift(goal.exercise, objective.exercise));
    const goal = goalIndex >= 0 ? goals[goalIndex] : undefined;
    const verdict = goalIndex >= 0 ? feasibility[goalIndex] : undefined;
    const target = goal ? `${String(goal.target).replace(/[^0-9.]/g, '')} ${weightUnit}` : '';
    const by = goal?.date ? new Date(`${goal.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const lastText = last ? `Last time ${last.weight} × ${last.reps}${last.date === currentDate ? ' (today)' : ''}.` : 'First time on this lift.';
    const goalText = !goal ? 'The next step up your rep wave.'
      : verdict?.verdict === 'reachable' ? `Keeps you on pace for ${target}${by ? ` by ${by}` : ''}.`
      : verdict?.verdict === 'needs-more' && /heavy single/.test(verdict.change || '') ? `You’re close to ${target} — a heavy single soon will show where you stand.`
      : verdict?.verdict === 'needs-more' ? `Each week like this moves you toward ${target}${by ? ` by ${by}` : ''}.`
      : `Building toward ${target}.`;
    return `${lastText} ${goalText}`;
  })();

  /* COACH ME gets the same day, written whole, to walk through with videos. */
  const coachPlan = recommendedSets.length ? {
    title: recommendation.splitDay.name,
    count: full.length,
    start: () => {
      try { sessionStorage.setItem(FROM_PLAN_KEY, JSON.stringify({ title: recommendation.splitDay.name,
        lifts: full.map(block => ({ exercise: block.exercise, muscle: block.muscle, weight: block.weight, reps: block.reps, ...(block.kind === 'accessory' ? { sets: 3, accessory: true } : {}) })),
        link: { recommendationId: recommendation.id, splitId: recommendation.splitDay.splitId, splitDayId: recommendation.splitDay.id, splitPosition: recommendation.splitDay.position, topSetIds: Object.fromEntries(selectedSets.map(set => [set.exercise, set.id])) } })); } catch { /* fine */ }
      navigate('/guided?plan=1');
    },
  } : undefined;

  const dayChips = <>
    <div className="tp-days" ref={daysRef} onScroll={onDaysScroll} role="radiogroup" aria-label="Training day">
      {chips.map(day => { const on = day.name === recommendation.splitDay.name; const isSuggested = day.name === suggested?.splitDay.name; return <button type="button" role="radio" aria-checked={on} key={`${day.position}-${day.name}`} data-day={day.name} className={`tp-day${on ? ' on' : ''}`} onClick={event => { event.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); pick(day.name); }}>
        <small>{isSuggested ? 'Suggested' : day.type === 'rest' ? 'Rest' : `Day ${day.position}`}</small>
        <b>{day.name}</b>
        {day.muscles.length > 0 && <span>{day.muscles.slice(0, 4).join(' · ')}</span>}
      </button>; })}
    </div>
    {chips.length > 1 && <div className="tp-dots" aria-hidden="true">{chips.map(day => <i key={day.name} className={day.name === recommendation.splitDay.name ? 'on' : ''} />)}</div>}
  </>;

  const cardioLine = recommendation.cardio && <li><label className={choosing || recommendation.cardio.selected ? 'on' : ''}>
    <input type="checkbox" checked={choosing || recommendation.cardio.selected} disabled={choosing} onChange={event => setCardioSelected(event.target.checked)} />
    <i className="td-tick" aria-hidden="true"><Icon name="check" size={12} stroke={3.2} /></i>
    <span className="td-stack">{recommendation.cardio.title}{hrHint(recommendation.cardio.title) && <small className="td-hr">{hrHint(recommendation.cardio.title)}</small>}
      <em className="td-detail">{runDetail(recommendation.cardio.title, cardioPlanSummary(recommendation.cardio.session.plan))}</em></span>
  </label></li>;

  return <div className="forge-feed today">
    <SplitGuidePrompt />
    <SplitReadyNote dayName={recommendation.splitDay.name} />

    {syncError && <div className="save-confirmation save-warning">Your workout is ready here. Account sync will retry automatically.</div>}
    <StravaReviewModal />
    {bufferedNotes.length > 0 && <Link className="buffer-banner" to="/coach">
      <i className="buffer-banner-mark"><Icon name="shield" size={18} stroke={2.1} /></i>
      <span><small>{bufferedNotes.some(isSickNote) ? 'Rest mode' : 'Coach adjusted'}</small>{bufferedNotes.some(isSickNote) ? 'Resting while you’re sick — tell Forge when you feel better' : `Training around ${Array.from(new Set(bufferedNotes.map(note => note.area || limitationIn(note.note || '') || (note.kind === 'fatigue' ? 'tiredness' : 'a limitation')))).join(', ')}`}</span>
      <Icon name="chevron" size={16} className="buffer-banner-go" />
    </Link>}

    {/* January only: last year's Wrapped, above the day's work for one month. */}
    <WrappedEntry />
    <WrappedReminderCard />

    {/* TODAY IS TODAY'S WORKOUT AND NOTHING ELSE. Partners have their own tab;
        the nudges and the first-week checklist made this a feed to scroll
        past before the one thing it is for. */}
    {!completedToday && <TodayModeSwitch mode={mode} onChange={chooseMode} />}
    {!completedToday && mode === 'coach' && <CoachToday plan={coachPlan} />}

    {/* IN PROGRESS UNTIL FINISHED. Sets save as they are logged, so a saved
        day is not a finished one: until Finish, the card says so and offers
        the way back in. */}
    {completedToday ? <section className={`td-card ${resumeUrl ? 'in-progress' : 'done'}`}>
      <div className="td-card-top">{resumeUrl
        ? <span className="td-chip live"><i className="td-live-dot" aria-hidden="true" />In progress</span>
        : <span className="td-chip done"><Icon name="check" size={12} stroke={3} />Complete</span>}
        {!resumeUrl && <Link to={`/workout?edit=${completedToday.id}`}>Edit</Link>}</div>
      <h3 className="td-title">{completedToday.title}</h3>
      {completedToday.durationMinutes ? <p className="td-session-length"><Icon name="watch" size={13} />{completedSets.length ? 'Lifting' : 'Session'} · {sessionLength(completedToday.durationMinutes)} · from your watch</p> : null}
      {(completedSets.length > 0 || (completedToday.cardioSessions || []).length > 0) && <ul className="td-lines">
        {completedSets.map((set, index) => <li key={set.id || `${set.lift}-${index}`}><span>{set.lift}</span><b>{set.weight} {weightUnit} × {set.reps}</b></li>)}
        {(completedToday.cardioSessions || []).map(session => <li key={session.id}><span>{session.activity}</span><b>{formatCardioSummary(session)}</b></li>)}
      </ul>}
      {resumeUrl
        ? <Link className="button wide" to={resumeUrl}>Resume workout <Icon name="arrow" /></Link>
        : <Link className="button secondary wide" to={`/workout?edit=${completedToday.id}`}>Edit workout</Link>}
    </section> : mode === 'plan' && <section className="td-card">
      <p className="tp-ask">What are you training today? <span>Swipe to change</span></p>
      {dayChips}

      {/* THE OBJECTIVE. One line that says what today is for, and three that
          say how. A first-time lift says how to find its number instead. */}
      {objective && <div className="tp-goal">
        <small>Today’s goal</small>
        <h3>{objective.exercise} {objective.weight > 0 ? <>{objective.weight}<em> {weightUnit}</em> × {objective.reps}</> : <>· find your {objective.reps}</>}</h3>
        {why && <p className="tp-why">{why}</p>}
        <ol>
          {objective.weight > 0
            ? <><li>Warm up{ramp.length ? `: ${ramp.map((value, index) => `${value} × ${[5, 3, 1][index] ?? 1}`).join(', ')}` : ' with a few lighter sets'}</li>
              <li>One top set of {objective.weight} × {objective.reps}. Stop with 1–2 reps left.</li></>
            : <><li>Warm up with a few lighter sets, fewer reps each time.</li>
              <li>Work up to a weight you could do {objective.reps} times with 2 reps left. That’s your top set.</li></>}
          <li>{build === 'full' && recommendedSets.length ? 'Then the back-offs and accessories below.' : lines.length > 1 ? 'Log it, then the same for each lift below.' : 'Log it. That’s the day.'}</li>
        </ol>
      </div>}

      {recommendedSets.length > 0 && <div className="tp-build" role="tablist" aria-label="How much to do">
        <button type="button" role="tab" aria-selected={build === 'top'} className={build === 'top' ? 'on' : ''} onClick={() => chooseBuild('top')}>Top sets only</button>
        <button type="button" role="tab" aria-selected={build === 'full'} className={build === 'full' ? 'on' : ''} onClick={() => chooseBuild('full')}>Build my workout</button>
      </div>}

      {build === 'top' && recommendedSets.length > 0 && <ul className="td-lines">
        {recommendedSets.map(set => { const wave = set.source === 'history' ? waveFor(set.exercise, set.reps) : null; const on = choosing || set.selected; return <li key={set.id}><label className={on ? 'on' : ''}>
          <input type="checkbox" checked={on} disabled={choosing} onChange={() => toggleTopSet(set.id)} />
          <i className="td-tick" aria-hidden="true"><Icon name="check" size={12} stroke={3.2} /></i>
          <span>{set.exercise}{set.optional && <small>Optional</small>}</span>
          {set.source === 'history'
            ? <b className="td-load">{set.weight}<small> {weightUnit}</small> × {set.reps}<small> reps</small></b>
            : <b className="td-load open">Work up to {set.reps || 5}</b>}
        </label>
        <div className="tp-row-foot">
          {wave ? <div className="tp-wave" aria-label={`Rep plan for ${set.exercise}: ${wave.wave.join(', ')}. This week ${set.reps}.`}>
            {wave.wave.map((reps, index) => <span key={index} className={index === wave.at ? 'now' : index < wave.at ? 'past' : ''}>{reps}</span>)}
            <em>{wave.at < wave.wave.length - 1 ? `Next: ${wave.wave[wave.at + 1]}` : 'Max week'}</em>
          </div> : <span />}
          {swapButton(set)}
        </div>
        {swapPanel(set)}
        </li>; })}
        {cardioLine}
      </ul>}

      {/* BUILD MY WORKOUT: every line is something to do, with its numbers. */}
      {build === 'full' && recommendedSets.length > 0 && <ul className="tp-full">
        {full.map((block, index) => <li key={`${block.exercise}-${index}`} className={block.kind}>
          {block.kind === 'accessory' && index === lines.length && <p className="tp-full-head">Accessories</p>}
          <div><span>{block.exercise}</span>
            <b>{block.kind === 'top' ? (block.weight > 0 ? <>{block.weight}<small> {weightUnit}</small> × {block.reps}</> : <>Work up to {block.reps}</>) : null}</b></div>
          <em>{block.kind === 'top' ? `Top set. ${block.plan}` : block.plan}</em>
          {block.kind === 'top' && (() => { const set = recommendedSets.find(item => item.exercise === block.exercise); return set ? <><div className="tp-row-foot"><span />{swapButton(set)}</div>{swapPanel(set)}</> : null; })()}
        </li>)}
        {recommendation.cardio && <li className="cardio"><div><span>{recommendation.cardio.title}</span></div><em>{runDetail(recommendation.cardio.title, cardioPlanSummary(recommendation.cardio.session.plan))}</em></li>}
      </ul>}

      {!recommendedSets.length && dayType !== 'rest' && dayType !== 'cardio' && dayType !== 'hyrox' && <Link className="td-fix" to="/exercises"><span><b>Choose exercises for this day</b>Forge needs a lift mapped to it.</span><Icon name="arrow" size={16} /></Link>}
      {dayType === 'hyrox' && !recommendation.cardio && <Link className="td-fix" to="/goals"><span><b>Add a HYROX goal</b>Forge writes HYROX sessions once you’re training for one. Today is open.</span><Icon name="arrow" size={16} /></Link>}
      {quiet && <p className="td-quiet"><b>{dayType === 'rest' ? 'Rest day' : 'No run needed today'}</b>{dayType === 'rest' ? 'Nothing required. Walk, stretch or log anything you do.' : 'Your running is covered this week.'}</p>}
      {!recommendedSets.length && recommendation.cardio && <ul className="td-lines">{cardioLine}</ul>}
      {(recommendation.coachNote || recommendation.bodyLogNote) && <p className="td-note">{recommendation.coachNote || recommendation.bodyLogNote}</p>}
      <Link className="button wide" to={`${startUrl}${extraParam}`} data-vt="">{selectedCount ? 'Start session' : 'Open workout'} <Icon name="arrow" /></Link>
      <Link className="tp-week" to="/plan">See your week</Link>
    </section>}
  </div>;
}
