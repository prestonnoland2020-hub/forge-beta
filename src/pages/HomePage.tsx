import { Link } from 'react-router-dom';
import { cardioPlanSummary } from '../components/CardioPlanBuilder';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { openCoachBubble } from '../features/training/coachService';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { StravaReviewModal } from '../components/StravaReviewModal';
import { formatCardioSummary } from '../lib/cardioSession';
import { useAthleteNotes } from '../features/training/useAthleteNotes';
import { isBufferActive } from '../features/training/athleteNotesService';

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};


export function HomePage() {
  const { recommendation, loading, syncError, toggleTopSet, setCardioSelected } = useDailyRecommendation();
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const { notes } = useAthleteNotes();
  const bufferedNotes = notes.filter(isBufferActive);
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const currentDate = todayIso();
  const completedToday = records.find(record => record.date === currentDate);
  const completedSets = (completedToday?.topSets || []).filter(set => set.completed !== false);
  const firstName = (setup?.displayName || 'Athlete').trim().split(/\s+/)[0];
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  if (loading && !recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">TODAY</span><h2>Preparing your workout</h2><p>Checking your latest training.</p></section></div>;
  if (!recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">ONE QUICK SETUP</span><h2>Build your first training day</h2><p>Add a split day so Forge knows what comes next.</p><Link className="button" to="/split">Set up my split →</Link></section></div>;

  const selectedSets = recommendation.topSets.filter(set => set.selected);
  const selectedCount = selectedSets.length + (recommendation.cardio?.selected ? 1 : 0);
  const startUrl = `/workout?source=recommendation&recommendation=${encodeURIComponent(recommendation.id || recommendation.date)}`;

  return <div className="forge-feed">
    <header className="feed-welcome"><div><span>{greeting}, {firstName}</span><h2>Today’s training</h2></div><Link to="/history">See activity</Link></header>
    {syncError && <div className="save-confirmation save-warning">Your workout is ready here. Account sync will retry automatically.</div>}
    <StravaReviewModal />
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
    </section> : /* THE HEADER ACTION HAS TO DO SOMETHING. This slot held a circular
         regenerate button, and today's card is a pure derivation — the split
         position, the block's prescription for that day, and the athlete's
         logged bests. There was nothing to re-roll, so pressing it rewrote
         the identical card and the screen never changed. (It also rendered as
         an oval: a 30px circle stretched to 44px by the flex header.)

         The real want behind it is "today is not the day I want to train",
         and that has an answer now — the log's From Split mode, where the
         athlete picks the day. The completed card puts Edit in this same
         slot, so this is the same kind of link, doing the same kind of job. */
      <section className="feed-card today-focus-card">
      <header className="feed-card-header"><div className="feed-identity"><span className="feed-icon">{String(recommendation.splitDay.position).padStart(2, '0')}</span><div><small>NEXT IN YOUR SPLIT</small><strong>{recommendation.splitDay.name}</strong><em>{recommendation.splitDay.muscles.join(' · ') || 'Cardio and recovery'}</em></div></div><Link to="/workout?source=split">Change day</Link></header>
      <div className="today-workout-items">
        {recommendation.topSets.map(set => <label className={set.selected ? 'selected' : ''} key={set.id}><input type="checkbox" checked={set.selected} onChange={() => toggleTopSet(set.id)} /><span><small>{set.muscle}{set.optional ? ' · OPTIONAL' : ''}</small><strong>{set.exercise}</strong><em>{set.source === 'history' ? `${set.weight} ${weightUnit} × ${set.reps}` : 'Log a baseline set'}</em></span></label>)}
        {/* A CARDIO DAY IS NOT MISSING ITS LIFT. The engine deliberately
            prescribes no top sets on a cardio-only split day, but this row
            excluded only rest days — so the Hybrid starter split's "Quality
            Cardio" day showed a red "Fix →" demanding a strength exercise for
            a day that is not meant to have one, and following it to the
            library fixed nothing. */}
        {!recommendation.topSets.length && recommendation.splitDay.type !== 'rest' && recommendation.splitDay.type !== 'cardio' && <Link className="feed-empty-row" to="/exercises"><span><small>STRENGTH</small><strong>Choose exercises for this split day</strong><em>Forge needs a strength exercise mapped to this day.</em></span><b>Fix →</b></Link>}
        {recommendation.cardio && <label className={recommendation.cardio.selected ? 'selected' : ''}><input type="checkbox" checked={recommendation.cardio.selected} onChange={event => setCardioSelected(event.target.checked)} /><span><small>CARDIO</small><strong>{recommendation.cardio.title}</strong><em>{cardioPlanSummary(recommendation.cardio.session.plan)}</em></span></label>}
      </div>
      <footer><Link className="button" to={startUrl}>{selectedCount ? 'Start workout' : 'Open workout'} →</Link><button className="feed-coach-button" onClick={() => openCoachBubble('Explain today’s workout briefly and tell me the one thing that matters most.')}>Ask Forge</button></footer>
    </section>}


  </div>;
}
