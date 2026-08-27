import { Link } from 'react-router-dom';
import { cardioPlanSummary } from '../components/CardioPlanBuilder';
import { useGoals } from '../features/goals/GoalsProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { openCoachBubble } from '../features/training/coachService';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { StravaActivityReview } from '../components/StravaActivityReview';
import { cardioMiles, formatCardioSummary } from '../lib/cardioSession';
import { useAthleteNotes } from '../features/training/useAthleteNotes';
import { isBufferActive } from '../features/training/athleteNotesService';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function HomePage() {
  const { recommendation, loading, syncError, toggleTopSet, setCardioSelected, refresh } = useDailyRecommendation();
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const { goals } = useGoals();
  const { notes } = useAthleteNotes();
  const bufferedNotes = notes.filter(isBufferActive);
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const currentDate = todayIso();
  const completedToday = records.find(record => record.date === currentDate);
  const completedSets = (completedToday?.topSets || []).filter(set => set.completed !== false);
  const priorWorkout = records.find(record => record.date < currentDate);
  const priorSets = (priorWorkout?.topSets || []).filter(set => set.completed !== false);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const weekRecords = records.filter(record => record.date >= weekStartIso && record.date <= currentDate);
  const weekTopSets = weekRecords.reduce((total, record) => total + (record.topSets || []).filter(set => set.completed !== false).length, 0);
  const weekMiles = weekRecords.reduce((total, record) => total + (record.cardioSessions || []).reduce((sum, session) => sum + cardioMiles(session), 0), 0);
  // The goal shown here should be the one today's session actually serves, not
  // whichever goal happens to be first in the list. A mile-pace cardio day was
  // headlining a Pull Ups target.
  const byNearestDate = (a: typeof goals[number], b: typeof goals[number]) => String(a.date || '9999-12-31').localeCompare(String(b.date || '9999-12-31'));
  const todayExercises = new Set((recommendation?.topSets || []).filter(set => set.selected).map(set => set.exercise.trim().toLowerCase()));
  const strengthGoal = goals.filter(goal => goal.type === 'Strength' && goal.exercise && todayExercises.has(goal.exercise.trim().toLowerCase())).sort(byNearestDate)[0];
  const enduranceGoal = recommendation?.cardio?.selected ? goals.filter(goal => goal.type === 'Endurance').sort(byNearestDate)[0] : undefined;
  const primaryGoal = strengthGoal || enduranceGoal || [...goals].sort(byNearestDate)[0];
  const goalReason = strengthGoal ? `Today’s ${strengthGoal.exercise} set moves this` : enduranceGoal ? 'Today’s run moves this' : primaryGoal ? 'Next target by date' : '';
  const firstName = (setup?.displayName || 'Athlete').trim().split(/\s+/)[0];
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  if (loading && !recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">TODAY</span><h2>Preparing your workout</h2><p>Checking your latest training.</p></section></div>;
  if (!recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">ONE QUICK SETUP</span><h2>Build your first training day</h2><p>Add a split day so Forge knows what comes next.</p><Link className="button" to="/plan?view=split">Set up my split →</Link></section></div>;

  const selectedSets = recommendation.topSets.filter(set => set.selected);
  const selectedCount = selectedSets.length + (recommendation.cardio?.selected ? 1 : 0);
  const startUrl = `/workout?source=recommendation&recommendation=${encodeURIComponent(recommendation.id || recommendation.date)}`;

  return <div className="forge-feed">
    <header className="feed-welcome"><div><span>{greeting}, {firstName}</span><h2>Today’s training</h2></div><Link to="/history">See activity</Link></header>
    {syncError && <div className="save-confirmation save-warning">Your workout is ready here. Account sync will retry automatically.</div>}
    <StravaActivityReview />
    {bufferedNotes.length > 0 && <Link className="buffer-banner" to="/coach">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2.8 19.5a1 1 0 0 0 .87 1.5h16.66a1 1 0 0 0 .87-1.5L12 3Z"/><path d="M12 10v4M12 17.5v.5"/></svg>
      <span>Training around {bufferedNotes.map(note => note.area || note.kind).join(', ')} — check in on Coach</span>
    </Link>}

    {completedToday ? <section className="feed-card today-focus-card completed">
      <header className="feed-card-header"><div className="feed-identity"><span className="feed-icon completed">✓</span><div><small>TODAY · COMPLETE</small><strong>{completedToday.title}</strong></div></div><Link to={`/workout?edit=${completedToday.id}`}>Edit</Link></header>
      <div className="feed-metric-row">{(completedSets.length > 0 || completedToday.muscles.some(muscle => muscle !== 'Cardio')) && <div><strong>{completedSets.length || '✓'}</strong><span>{completedSets.length ? (completedSets.length === 1 ? 'Top set' : 'Top sets') : 'Strength'}</span></div>}<div><strong>{completedToday.cardioSessions?.length || 0}</strong><span>Cardio</span></div></div>
      {(completedSets.length > 0 || (completedToday.cardioSessions || []).length > 0) && <div className="today-data-points">
        {completedSets.map((set, index) => <div key={set.id || `${set.lift}-${index}`}><span>{set.lift}</span><strong>{set.weight} {weightUnit} ×{set.reps}</strong></div>)}
        {(completedToday.cardioSessions || []).map(session => <div key={session.id}><span>{session.activity}</span><strong>{formatCardioSummary(session)}</strong></div>)}
      </div>}
      <footer><Link className="button" to={`/workout?edit=${completedToday.id}`}>Edit workout</Link><Link className="feed-text-link" to="/history">Open history →</Link></footer>
    </section> : <section className="feed-card today-focus-card">
      <header className="feed-card-header"><div className="feed-identity"><span className="feed-icon">{String(recommendation.splitDay.position).padStart(2, '0')}</span><div><small>NEXT IN YOUR SPLIT</small><strong>{recommendation.splitDay.name}</strong><em>{recommendation.splitDay.muscles.join(' · ') || 'Cardio and recovery'}</em></div></div><button type="button" className="today-regen" onClick={refresh} aria-label="Regenerate today's training" title="Regenerate today's training"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.3"/><path d="M21 3v6h-6"/></svg></button></header>
      <div className="today-workout-items">
        {recommendation.topSets.map(set => <label className={set.selected ? 'selected' : ''} key={set.id}><input type="checkbox" checked={set.selected} onChange={() => toggleTopSet(set.id)} /><span><small>{set.muscle}{set.optional ? ' · OPTIONAL' : ''}</small><strong>{set.exercise}</strong><em>{set.source === 'history' ? `${set.weight} ${weightUnit} × ${set.reps}` : 'Log a baseline set'}</em></span></label>)}
        {!recommendation.topSets.length && recommendation.splitDay.type !== 'rest' && <Link className="feed-empty-row" to="/exercises"><span><small>STRENGTH</small><strong>Choose exercises for this split day</strong><em>Forge needs a strength exercise mapped to this day.</em></span><b>Fix →</b></Link>}
        {recommendation.cardio && <label className={recommendation.cardio.selected ? 'selected' : ''}><input type="checkbox" checked={recommendation.cardio.selected} onChange={event => setCardioSelected(event.target.checked)} /><span><small>CARDIO</small><strong>{recommendation.cardio.title}</strong><em>{cardioPlanSummary(recommendation.cardio.session.plan)}</em></span></label>}
      </div>
      <footer><Link className="button" to={startUrl}>{selectedCount ? 'Start workout' : 'Open workout'} →</Link><button className="feed-coach-button" onClick={() => openCoachBubble('Explain today’s workout briefly and tell me the one thing that matters most.')}>Ask Forge</button></footer>
    </section>}


    <section className="feed-support-grid" aria-label="Training overview">
      <article className="feed-card compact-card"><header><span>LAST ACTIVITY</span><Link to="/history">View all</Link></header>{priorWorkout ? <><div className="compact-activity"><span className="feed-icon muted-icon">✓</span><div><strong>{priorWorkout.title}</strong><small>{shortDate(priorWorkout.date)} · {priorWorkout.muscles.filter(muscle => muscle !== 'Cardio').join(' · ') || 'Cardio'}</small></div></div><div className="compact-result-list">{priorSets.slice(0, 2).map(set => <div key={set.id || `${set.lift}-${set.weight}-${set.reps}`}><span>{set.lift}</span><strong>{set.weight} {weightUnit} ×{set.reps}</strong></div>)}{priorWorkout.cardioSessions?.slice(0, 2).map(session => <div key={session.id}><span>{session.activity}</span><strong>{formatCardioSummary(session)}</strong></div>)}</div></> : <p className="feed-empty-copy">Nothing logged yet.</p>}</article>
      
      <article className="feed-card compact-card goal-card"><header><span>GOAL FOCUS</span><Link to="/goals">Goals</Link></header>{primaryGoal ? <><strong className="goal-name">{primaryGoal.title}</strong><p>{goalReason}{primaryGoal.date ? ` · ${shortDate(primaryGoal.date)}` : ''}</p><div className="goal-target"><span>TARGET</span><strong>{primaryGoal.target}</strong></div></> : <><p className="feed-empty-copy">No goal set.</p><Link className="feed-text-link" to="/goals">Create a goal →</Link></>}</article>
    </section>
  </div>;
}
