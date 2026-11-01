import { Link } from 'react-router-dom';
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
  if (!recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">ONE QUICK SETUP</span><h2>Build your first training day</h2><p>Add a split day so Forge knows what comes next.</p><Link className="button" to="/split">Set up my split <Icon name="arrow"/></Link></section></div>;

  /* A stored recommendation written by an older build — or one that arrived
     half-formed — has no top sets, and reading through it turned Today into
     the crash screen. The day is still worth showing without them. */
  const recommendedSets = recommendation.topSets || [];
  const selectedSets = recommendedSets.filter(set => set.selected);
  const selectedCount = selectedSets.length + (recommendation.cardio?.selected ? 1 : 0);
  const startUrl = `/workout?source=recommendation&recommendation=${encodeURIComponent(recommendation.id || recommendation.date)}`;

  return <div className="forge-feed">
    {/* The header already says TODAY; the big line is the greeting and the
        small one is the date, so nothing on the screen names it twice. */}
    <header className="feed-welcome"><div><span>{new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</span><h2>{greeting}, {firstName}</h2></div></header>
    {syncError && <div className="save-confirmation save-warning">Your workout is ready here. Account sync will retry automatically.</div>}
    <StravaReviewModal />
    {bufferedNotes.length > 0 && <Link className="buffer-banner" to="/coach">
      {/* The coach's mark, not a hazard sign: a limitation is Forge doing its
          job, so it wears the brand rather than a warning colour. */}
      <i className="buffer-banner-mark"><Icon name="shield" size={18} stroke={2.1} /></i>
      <span><small>{bufferedNotes.some(isSickNote) ? 'Rest mode' : 'Coach adjusted'}</small>{bufferedNotes.some(isSickNote) ? 'Resting while you’re sick — tell Forge when you feel better' : `Training around ${Array.from(new Set(bufferedNotes.map(note => note.area || limitationIn(note.note || '') || (note.kind === 'fatigue' ? 'tiredness' : 'a limitation')))).join(', ')}`}</span>
      <Icon name="chevron" size={16} className="buffer-banner-go" />
    </Link>}

    {completedToday ? <section className="feed-card today-focus-card completed">
      <header className="feed-card-header"><div className="feed-identity"><span className="feed-icon completed"><Icon name="check" size={20} stroke={2.6}/></span><div><small>TODAY · COMPLETE</small><strong>{completedToday.title}</strong></div></div><Link to={`/workout?edit=${completedToday.id}`}>Edit</Link></header>
      {/* Only what was done: a zero for cardio on a lifting day was a box saying nothing happened. */}<div className="feed-metric-row">{(completedSets.length > 0 || completedToday.muscles.some(muscle => muscle !== 'Cardio')) && <div><strong>{completedSets.length || <Icon name="check" size={22} stroke={2.6}/>}</strong><span>{completedSets.length ? (completedSets.length === 1 ? 'Top set' : 'Top sets') : 'Strength'}</span></div>}{(completedToday.cardioSessions?.length || 0) > 0 && <div><strong>{completedToday.cardioSessions!.length}</strong><span>Cardio</span></div>}</div>
      {(completedSets.length > 0 || (completedToday.cardioSessions || []).length > 0) && <div className="today-data-points">
        {completedSets.map((set, index) => <div key={set.id || `${set.lift}-${index}`}><span>{set.lift}</span><strong>{set.weight} {weightUnit} ×{set.reps}</strong></div>)}
        {(completedToday.cardioSessions || []).map(session => <div key={session.id}><span>{session.activity}</span><strong>{formatCardioSummary(session)}</strong></div>)}
      </div>}
      <footer><Link className="button secondary" to={`/workout?edit=${completedToday.id}`}>Edit workout</Link></footer>
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
      /* ONE DAY, SAID ONCE, LIKE A COACH WOULD. The card was a header, a boxed
         list of checkbox rows and a button: a form to fill in. Now the day's
         name is the headline, each top set is a tile whose load is the number
         you read first, cardio is its own strip, and Start is the one action.
         Tapping a tile still drops it from today, as the tick did. */
      <section className="feed-card today-focus-card today-hero">
      <header className="feed-card-header th-head">
        <span className="th-eyebrow">Up next · Day {String(recommendation.splitDay.position).padStart(2, '0')}</span>
        <Link to="/workout?source=split">Change day</Link>
      </header>
      {(() => { const muscles = recommendation.splitDay.muscles; const named = muscles.length > 0 && muscles.every(muscle => recommendation.splitDay.name.toLowerCase().includes(muscle.toLowerCase())); return <div className="th-title"><h3>{recommendation.splitDay.name}</h3>{!named && <p>{muscles.join(' · ') || (recommendation.splitDay.type === 'hyrox' ? 'Race-specific session' : 'Cardio and recovery')}</p>}</div>; })()}
      {recommendedSets.length > 0 && <div className={`th-lifts${recommendedSets.length === 1 ? ' single' : ''}`}>
        {recommendedSets.map(set => <label className={`th-lift${set.selected ? ' selected' : ''}`} key={set.id}>
          <input type="checkbox" checked={set.selected} onChange={() => toggleTopSet(set.id)} />
          <span className="th-load">{set.source === 'history' ? <>{set.weight}<small>{weightUnit}</small><em>× {set.reps}</em></> : <span className="th-find">Find your weight</span>}</span>
          <span className="th-name">{set.exercise}{set.optional && <small>Optional</small>}</span>
          <i className="th-tick" aria-hidden="true"><Icon name="check" size={12} stroke={3.2} /></i>
        </label>)}
      </div>}
      {!recommendedSets.length && recommendation.splitDay.type !== 'rest' && recommendation.splitDay.type !== 'cardio' && recommendation.splitDay.type !== 'hyrox' && <Link className="th-quiet th-fix" to="/exercises"><strong>Choose exercises for this day</strong><span>Forge needs a strength exercise mapped to it.</span><Icon name="arrow" size={16}/></Link>}
      {recommendation.cardio && <label className={`th-cardio${recommendation.cardio.selected ? ' selected' : ''}`}>
        <input type="checkbox" checked={recommendation.cardio.selected} onChange={event => setCardioSelected(event.target.checked)} />
        <span className="th-cardio-kind">{recommendation.splitDay.type === 'hyrox' ? 'Hyrox' : 'Cardio'}</span>
        <strong>{recommendation.cardio.title}</strong>
        <span className="th-cardio-plan">{cardioPlanSummary(recommendation.cardio.session.plan)}</span>
        <i className="th-tick" aria-hidden="true"><Icon name="check" size={12} stroke={3.2} /></i>
      </label>}
      {!recommendedSets.length && !recommendation.cardio && (recommendation.splitDay.type === 'rest' || recommendation.splitDay.type === 'cardio') && <div className="th-quiet"><strong>{recommendation.splitDay.type === 'rest' ? 'Rest day' : 'No run needed today'}</strong><span>{recommendation.splitDay.type === 'rest' ? 'Nothing required. Walk, stretch or log anything you do.' : 'Your running is covered this week.'}</span></div>}
      {(recommendation.coachNote || recommendation.bodyLogNote) && <p className="th-note">{recommendation.coachNote || recommendation.bodyLogNote}</p>}
      <footer className="th-foot"><Link className="button feed-start" to={startUrl}>{selectedCount ? 'Start workout' : 'Open workout'} <Icon name="arrow"/></Link></footer>
    </section>}


    {/* Under the workout, because this is the screen where you decide whether
        to train and a partner who has already trained is the one thing that
        changes that decision. */}
    <PartnersCard unit={weightUnit} />
  </div>;
}
