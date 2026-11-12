import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CoachToday, TodayModeSwitch, TODAY_MODE_KEY } from '../components/CoachToday';
import { FROM_PLAN_KEY } from '../lib/guided/fromPlan';
import { PartnersCard } from '../components/PartnersCard';
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
import { TodayNudges } from '../components/TodayNudges';
import { RunningBehindNudge } from '../components/RunningBehindCard';
import { WrappedEntry, WrappedReminderCard } from '../components/WrappedEntry';
import { SplitGuidePrompt, SplitReadyNote } from '../components/SplitGuidePrompt';
import { openCoachBubble } from '../features/training/coachService';

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
  const { recommendation, loading, syncError, toggleTopSet, setCardioSelected } = useDailyRecommendation();
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
  /* THE FIRST WEEK, AS THREE THINGS TO DO. A new athlete's Today is mostly
     promises ("projections", "readiness", "Forge noticed") that need data
     first. This says what unlocks them and ticks itself off as it happens;
     it leaves on its own after three training days, or when hidden. */
  const trainedDays = new Set(records.map(record => record.date)).size;
  const runner = Boolean(setup && (Number(setup.runningDays) > 0 || setup.primaryFocus === 'Endurance' || setup.primaryFocus === 'Hybrid'));
  const ranLogged = records.some(record => record.hasCardio || (record.cardioSessions || []).length > 0);
  const [firstWeekHidden, setFirstWeekHidden] = useState(() => { try { return localStorage.getItem('forge-first-week-hidden') === '1'; } catch { return false; } });
  const [coachTried, setCoachTried] = useState(() => { try { return localStorage.getItem('forge-coach-opened') === '1'; } catch { return false; } });
  const markCoachTried = () => { setCoachTried(true); try { localStorage.setItem('forge-coach-opened', '1'); } catch { /* per-device */ } };
  /* MY PLAN | COACH ME. Which Today she sees; remembered on the device. Someone
     who chose "Coach me" in setup starts on the coach side. */
  const navigate = useNavigate();
  const [mode, setMode] = useState<'plan' | 'coach'>(() => { try { const saved = localStorage.getItem(TODAY_MODE_KEY); if (saved === 'plan' || saved === 'coach') return saved; } catch { /* fine */ } return (setup as { trainingMode?: string } | null)?.trainingMode === 'coach' ? 'coach' : 'plan'; });
  const chooseMode = (next: 'plan' | 'coach') => { setMode(next); try { localStorage.setItem(TODAY_MODE_KEY, next); } catch { /* fine */ } };
  const hideFirstWeek = () => { setFirstWeekHidden(true); try { localStorage.setItem('forge-first-week-hidden', '1'); } catch { /* per-device convenience */ } };

  if (loading && !recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">Today</span><h2>Preparing your workout</h2><p>Checking your latest training.</p></section></div>;
  if (!recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">One quick setup</span><h2>Build your first training day</h2><p>Add a split day so Forge knows what comes next.</p><Link className="button" to="/split?guide=1&from=home">Build my split step by step <Icon name="arrow"/></Link></section><SplitGuidePrompt /></div>;

  /* A stored recommendation written by an older build — or one that arrived
     half-formed — has no top sets, and reading through it turned Today into
     the crash screen. The day is still worth showing without them. */
  const recommendedSets = recommendation.topSets || [];
  const selectedSets = recommendedSets.filter(set => set.selected);
  const selectedCount = selectedSets.length + (recommendation.cardio?.selected ? 1 : 0);
  const startUrl = `/workout?source=recommendation&recommendation=${encodeURIComponent(recommendation.id || recommendation.date)}`;

  const dayType = recommendation.splitDay.type;
  const quiet = !recommendedSets.length && !recommendation.cardio && (dayType === 'rest' || dayType === 'cardio');

  return <div className="forge-feed today">
    <SplitGuidePrompt />
    <SplitReadyNote dayName={recommendation.splitDay.name} />

    {syncError && <div className="save-confirmation save-warning">Your workout is ready here. Account sync will retry automatically.</div>}
    <StravaReviewModal />
    {bufferedNotes.length > 0 && <Link className="buffer-banner" to="/coach">
      {/* The coach's mark, not a hazard sign: a limitation is Forge doing its
          job, so it wears the brand rather than a warning colour. */}
      <i className="buffer-banner-mark"><Icon name="shield" size={18} stroke={2.1} /></i>
      <span><small>{bufferedNotes.some(isSickNote) ? 'Rest mode' : 'Coach adjusted'}</small>{bufferedNotes.some(isSickNote) ? 'Resting while you’re sick — tell Forge when you feel better' : `Training around ${Array.from(new Set(bufferedNotes.map(note => note.area || limitationIn(note.note || '') || (note.kind === 'fatigue' ? 'tiredness' : 'a limitation')))).join(', ')}`}</span>
      <Icon name="chevron" size={16} className="buffer-banner-go" />
    </Link>}

    {/* January only: last year's Wrapped, above the day's work for one month. */}
    <WrappedEntry />
    <WrappedReminderCard />

    <TodayModeSwitch mode={mode} onChange={chooseMode} />
    {mode === 'coach' && <CoachToday />}

    {/* ONE CARD, ONE ACTION. The guide's Today: a status chip, the day's name
        as the headline, each lift as one line with its load on the right, and
        Start as the only button. Tapping a line still drops it from today. */}
    {mode === 'plan' && (completedToday ? <section className="td-card done">
      <div className="td-card-top"><span className="td-chip done"><Icon name="check" size={12} stroke={3} />Done</span><Link to={`/workout?edit=${completedToday.id}`}>Edit</Link></div>
      <h3 className="td-title">{completedToday.title}</h3>
      {/* How long the lifting took, from the watch's strength session — matched
          to the day by date, so it sits with the top set it belongs to. */}
      {completedToday.durationMinutes ? <p className="td-session-length"><Icon name="watch" size={13} />{completedSets.length ? 'Lifting' : 'Session'} · {sessionLength(completedToday.durationMinutes)} · from your watch</p> : null}
      {(completedSets.length > 0 || (completedToday.cardioSessions || []).length > 0) && <ul className="td-lines">
        {completedSets.map((set, index) => <li key={set.id || `${set.lift}-${index}`}><span>{set.lift}</span><b>{set.weight} {weightUnit} × {set.reps}</b></li>)}
        {(completedToday.cardioSessions || []).map(session => <li key={session.id}><span>{session.activity}</span><b>{formatCardioSummary(session)}</b></li>)}
      </ul>}
      <Link className="button secondary wide" to={`/workout?edit=${completedToday.id}`}>Edit workout</Link>
    </section> : <section className="td-card">
      <div className="td-card-top"><span className="td-chip">Suggested · Day {recommendation.splitDay.position}</span><Link to="/workout?source=split">Change day</Link></div>
      <h3 className="td-title">{recommendation.splitDay.name}</h3>
      {(recommendedSets.length > 0 || recommendation.cardio) && <ul className="td-lines">
        {recommendedSets.map(set => <li key={set.id}><label className={set.selected ? 'on' : ''}>
          <input type="checkbox" checked={set.selected} onChange={() => toggleTopSet(set.id)} />
          <i className="td-tick" aria-hidden="true"><Icon name="check" size={12} stroke={3.2} /></i>
          <span>{set.exercise}{set.optional && <small>Optional</small>}</span>
          {/* A load is a record, set in mono with its unit small; an open
              instruction stays in words. The text reads the same either way. */}
          {set.source === 'history'
            ? <b className="td-load">{set.weight}<small> {weightUnit}</small> × {set.reps}<small> reps</small></b>
            : <b className="td-load open">Work up to {set.reps || 5}</b>}
        </label></li>)}
        {recommendation.cardio && <li><label className={recommendation.cardio.selected ? 'on' : ''}>
          <input type="checkbox" checked={recommendation.cardio.selected} onChange={event => setCardioSelected(event.target.checked)} />
          <i className="td-tick" aria-hidden="true"><Icon name="check" size={12} stroke={3.2} /></i>
          {/* A run's detail is a sentence, not a number, so it goes under its
              name rather than in the number column — where it could not wrap
              and pushed the whole card wider than the screen. */}
          <span className="td-stack">{recommendation.cardio.title}{hrHint(recommendation.cardio.title) && <small className="td-hr">{hrHint(recommendation.cardio.title)}</small>}
            <em className="td-detail">{runDetail(recommendation.cardio.title, cardioPlanSummary(recommendation.cardio.session.plan))}</em></span>
        </label></li>}
      </ul>}
      {!recommendedSets.length && dayType !== 'rest' && dayType !== 'cardio' && dayType !== 'hyrox' && <Link className="td-fix" to="/exercises"><span><b>Choose exercises for this day</b>Forge needs a lift mapped to it.</span><Icon name="arrow" size={16} /></Link>}
      {/* A HYROX day only gets HYROX work for a HYROX goal; without one it is
          open, and says where to set the goal. */}
      {dayType === 'hyrox' && !recommendation.cardio && <Link className="td-fix" to="/goals"><span><b>Add a HYROX goal</b>Forge writes HYROX sessions once you’re training for one. Today is open.</span><Icon name="arrow" size={16} /></Link>}
      {quiet && <p className="td-quiet"><b>{dayType === 'rest' ? 'Rest day' : 'No run needed today'}</b>{dayType === 'rest' ? 'Nothing required. Walk, stretch or log anything you do.' : 'Your running is covered this week.'}</p>}
      {/* A FIRST SESSION IS A TEST, AND IT SAYS SO. A lift with no logged
          set and no starting number has no load to give; instead of "Find
          your weight" it tells the athlete how to find it, once. */}
      {recommendedSets.some(set => set.source !== 'history') && <p className="td-note td-first">{(() => { const fresh = recommendedSets.filter(set => set.source !== 'history'); const reps = fresh[0].reps || 5; return <><b>First time on {fresh.length === 1 ? fresh[0].exercise : 'these lifts'}?</b> Work up to a weight you could do for {reps} with 2 reps left in the tank, and log that one set. Forge sets your numbers from it.</>; })()}</p>}
      {(recommendation.coachNote || recommendation.bodyLogNote) && <p className="td-note">{recommendation.coachNote || recommendation.bodyLogNote}</p>}
      <Link className="button wide" to={startUrl} data-vt="">{selectedCount ? 'Start session' : 'Open workout'} <Icon name="arrow" /></Link>
      {/* COACH ME THROUGH IT: the same planned lifts, with the coach talking
          her through the warm-up and each top set. */}
      {recommendedSets.length > 0 && <button type="button" className="td-coach-btn" onClick={() => {
        const sets = selectedSets.length ? selectedSets : recommendedSets;
        try { sessionStorage.setItem(FROM_PLAN_KEY, JSON.stringify({ title: recommendation.splitDay.name, lifts: sets.map(set => ({ exercise: set.exercise, muscle: set.muscle, weight: set.weight, reps: set.reps })), link: { recommendationId: recommendation.id, splitId: recommendation.splitDay.splitId, splitDayId: recommendation.splitDay.id, splitPosition: recommendation.splitDay.position, topSetIds: Object.fromEntries(sets.map(set => [set.exercise, set.id])) } })); } catch { /* fine */ }
        navigate('/guided?plan=1');
      }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/></svg>Coach me through it</button>}
    </section>)}

    {/* THE PLAN LIVES ONE TAP UNDER TODAY. It was its own tab whose first row
        repeated this card with a second Start button; now Today says what to
        do and this row opens the rest of the week. */}
    {mode === 'plan' && <Link className="td-week-link" to="/plan"><span><b>See your week</b><small>Every session, week by week</small></span><Icon name="right" size={16} /></Link>}

    {mode === 'plan' && !firstWeekHidden && trainedDays < 3 && (() => {
      const steps = [
        { label: 'Log your first workout', detail: 'One top set per lift is enough.', done: trainedDays > 0, to: startUrl },
        ...(runner ? [{ label: 'Bring in your runs', detail: 'Connect your watch, or log a run.', done: ranLogged, to: '/profile?view=connections' }] : []),
        { label: 'Ask your coach', detail: 'Tap Ask coach at the bottom. Ask why a weight was picked, or to change your week.', done: coachTried, to: '', action: () => { markCoachTried(); openCoachBubble(); } },
        { label: 'Train three times', detail: 'Then Forge starts spotting patterns and projecting your goals.', done: trainedDays >= 3, to: '' },
      ];
      return <section className="fw-card" aria-label="Your first week">
        <header><small>Your first week</small><span>{steps.filter(step => step.done).length} of {steps.length}</span><button type="button" aria-label="Hide your first week" onClick={hideFirstWeek}><Icon name="close" size={14} /></button></header>
        <ol>{steps.map((step, index) => {
          const body = <><i aria-hidden="true">{step.done ? <Icon name="check" size={12} stroke={3} /> : index + 1}</i><span><b>{step.label}</b><small>{step.detail}</small></span>{(step.to || (step as { action?: () => void }).action) && !step.done && <Icon name="right" size={14} className="fw-go" />}</>;
          const act = (step as { action?: () => void }).action;
          return <li key={step.label} className={step.done ? 'done' : ''}>{act && !step.done ? <button type="button" onClick={act}>{body}</button> : step.to && !step.done ? <Link to={step.to}>{body}</Link> : <div>{body}</div>}</li>;
        })}</ol>
      </section>;
    })()}


    {/* Below the workout, never above it: the day's training is the card
        Today exists for. */}
    <TodayNudges />
    <RunningBehindNudge />

    {/* Under the workout, because this is the screen where you decide whether
        to train and a partner who has already trained is the one thing that
        changes that decision. */}
    <PartnersCard unit={weightUnit} />
  </div>;
}
