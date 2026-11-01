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
import { TodayNudges } from '../components/TodayNudges';

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

  if (loading && !recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">TODAY</span><h2>Preparing your workout</h2><p>Checking your latest training.</p></section></div>;
  if (!recommendation) return <div className="forge-feed"><section className="feed-state card"><span className="eyebrow">ONE QUICK SETUP</span><h2>Build your first training day</h2><p>Add a split day so Forge knows what comes next.</p><Link className="button" to="/split">Set up my split <Icon name="arrow"/></Link></section></div>;

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

    {/* NO WEEK STRIP. Seven date squares sat over the card, drawn like tabs,
        and tapping one did nothing — Today never left today. Plan's week
        list is where the days live, so the strip only promised a picker
        that was not there. */}

    {syncError && <div className="save-confirmation save-warning">Your workout is ready here. Account sync will retry automatically.</div>}
    <StravaReviewModal />
    {bufferedNotes.length > 0 && <Link className="buffer-banner" to="/coach">
      {/* The coach's mark, not a hazard sign: a limitation is Forge doing its
          job, so it wears the brand rather than a warning colour. */}
      <i className="buffer-banner-mark"><Icon name="shield" size={18} stroke={2.1} /></i>
      <span><small>{bufferedNotes.some(isSickNote) ? 'Rest mode' : 'Coach adjusted'}</small>{bufferedNotes.some(isSickNote) ? 'Resting while you’re sick — tell Forge when you feel better' : `Training around ${Array.from(new Set(bufferedNotes.map(note => note.area || limitationIn(note.note || '') || (note.kind === 'fatigue' ? 'tiredness' : 'a limitation')))).join(', ')}`}</span>
      <Icon name="chevron" size={16} className="buffer-banner-go" />
    </Link>}

    {/* ONE CARD, ONE ACTION. The guide's Today: a status chip, the day's name
        as the headline, each lift as one line with its load on the right, and
        Start as the only button. Tapping a line still drops it from today. */}
    {completedToday ? <section className="td-card done">
      <div className="td-card-top"><span className="td-chip done"><Icon name="check" size={12} stroke={3} />Done</span><Link to={`/workout?edit=${completedToday.id}`}>Edit</Link></div>
      <h3 className="td-title">{completedToday.title}</h3>
      {(completedSets.length > 0 || (completedToday.cardioSessions || []).length > 0) && <ul className="td-lines">
        {completedSets.map((set, index) => <li key={set.id || `${set.lift}-${index}`}><span>{set.lift}</span><b>{set.weight} {weightUnit} × {set.reps}</b></li>)}
        {(completedToday.cardioSessions || []).map(session => <li key={session.id}><span>{session.activity}</span><b>{formatCardioSummary(session)}</b></li>)}
      </ul>}
      <Link className="button secondary wide" to={`/workout?edit=${completedToday.id}`}>Edit workout</Link>
    </section> : <section className="td-card">
      <div className="td-card-top"><span className="td-chip">Up next · Day {recommendation.splitDay.position}</span><Link to="/workout?source=split">Change day</Link></div>
      <h3 className="td-title">{recommendation.splitDay.name}</h3>
      {(recommendedSets.length > 0 || recommendation.cardio) && <ul className="td-lines">
        {recommendedSets.map(set => <li key={set.id}><label className={set.selected ? 'on' : ''}>
          <input type="checkbox" checked={set.selected} onChange={() => toggleTopSet(set.id)} />
          <i className="td-tick" aria-hidden="true"><Icon name="check" size={12} stroke={3.2} /></i>
          <span>{set.exercise}{set.optional && <small>Optional</small>}</span>
          <b>{set.source === 'history' ? `${set.weight} ${weightUnit} × ${set.reps}` : 'Find your weight'}</b>
        </label></li>)}
        {recommendation.cardio && <li><label className={recommendation.cardio.selected ? 'on' : ''}>
          <input type="checkbox" checked={recommendation.cardio.selected} onChange={event => setCardioSelected(event.target.checked)} />
          <i className="td-tick" aria-hidden="true"><Icon name="check" size={12} stroke={3.2} /></i>
          <span>{recommendation.cardio.title}</span>
          <b>{cardioPlanSummary(recommendation.cardio.session.plan)}</b>
        </label></li>}
      </ul>}
      {!recommendedSets.length && dayType !== 'rest' && dayType !== 'cardio' && dayType !== 'hyrox' && <Link className="td-fix" to="/exercises"><span><b>Choose exercises for this day</b>Forge needs a lift mapped to it.</span><Icon name="arrow" size={16} /></Link>}
      {quiet && <p className="td-quiet"><b>{dayType === 'rest' ? 'Rest day' : 'No run needed today'}</b>{dayType === 'rest' ? 'Nothing required. Walk, stretch or log anything you do.' : 'Your running is covered this week.'}</p>}
      {(recommendation.coachNote || recommendation.bodyLogNote) && <p className="td-note">{recommendation.coachNote || recommendation.bodyLogNote}</p>}
      <Link className="button wide" to={startUrl}>{selectedCount ? 'Start session' : 'Open workout'} <Icon name="arrow" /></Link>
    </section>}


    {/* Below the workout, never above it: the day's training is the card
        Today exists for. */}
    <TodayNudges />

    {/* Under the workout, because this is the screen where you decide whether
        to train and a partner who has already trained is the one thing that
        changes that decision. */}
    <PartnersCard unit={weightUnit} />
  </div>;
}
