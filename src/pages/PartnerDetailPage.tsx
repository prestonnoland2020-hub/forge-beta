import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { waveLabel } from '../components/PlanView';
import { useAuth } from '../features/auth/AuthProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { isDemoMode } from '../lib/env';
import {
  loadPartners, loadPartnerRecent, lastTrainedLabel,
  type Partner, type PartnerDay,
} from '../features/friends/partnerService';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { cardioMiles } from '../lib/cardioSession';
import { growthByWeek, milesFromSummary, type GrowthWeek } from '../lib/partnerGrowth';
import { localDayIso } from '../lib/time';

/* WHAT DID THEY DO TODAY, AND ARE WE LEVEL THIS WEEK.

   Two questions, and this screen answers exactly those two. It used to answer
   a third — "what are our numbers over six months" — with four KPI tiles, a
   two-row measure picker and an indexed progress chart. All of it was true and
   none of it was what anyone opens a partner for. You tap a training partner
   to see whether they trained and what they did; the long view was a research
   tool wearing a friend's name.

   So: their session today at the top, the week head to head underneath, and
   nothing after it. The comparison chart and everything that fed it came out
   whole — it is in the history if it is ever wanted back. */
export function PartnerDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { setup } = useProfileSetup();
  const [partner, setPartner] = useState<Partner | null>(null);
  const { records } = useWorkoutHistory();
  const [recent, setRecent] = useState<PartnerDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';

  useEffect(() => {
    if (isDemoMode || !user || !id) { setLoading(false); return; }
    let active = true;
    /* Their recent days and bests load alongside; either failing leaves the
       rest of the screen standing. */
    void loadPartnerRecent(id, WEEKS * 7).then(days => { if (active) setRecent(days); }).catch(() => undefined);
    void loadPartners()
      .then(partners => { if (active) setPartner(partners.find(item => item.friendId === id) || null); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, id]);

  const theirName = (partner?.displayName || 'Partner').split(' ')[0];
  /* WHAT THEY ACTUALLY DID, AS TWO LINES. The feed already carries their top
     set and their cardio; the header was compressing both into one sentence
     with a middot, which reads as a status line rather than a session. */
  const topSet = partner?.topLift && partner.topWeight
    ? `${partner.topLift} ${partner.topWeight} ${weightUnit} × ${partner.topReps}`
    : '';
  /* The feed sends "Run · 2.27 mi · 21:04"; the activity is the label and the
     rest is the session. A bare "Run" is a session someone opened and never
     filled in — no distance, no time — so there is nothing to put on the right
     of the row and the row does not belong on the screen. */
  const cardioParts = (partner?.cardioSummary || '').split(' · ').filter(Boolean);
  const cardio = cardioParts.length > 1 ? cardioParts : [];
  const todayIso = localDayIso();
  const mine = useMemo(() => growthByWeek(
    records.flatMap(record => (record.topSets || []).filter(set => set.completed !== false && set.lift).map(set => ({ date: record.date, lift: set.lift!, weight: Number(set.weight) || 0, reps: Number(set.reps) || 0 }))),
    records.flatMap(record => (record.cardioSessions || []).map(session => ({ date: record.date, miles: cardioMiles(session) }))),
    todayIso, WEEKS), [records, todayIso]);
  const theirs = useMemo(() => growthByWeek(
    recent.flatMap(day => day.lifts.map(lift => ({ date: day.date, lift: lift.name, weight: lift.weight, reps: lift.reps }))),
    recent.flatMap(day => day.cardio.map(session => ({ date: day.date, miles: milesFromSummary(session.name, session.summary) }))),
    todayIso, WEEKS), [recent, todayIso]);

  if (loading) return <div className="stack-xl"><section className="card"><p>Loading…</p></section></div>;
  if (!partner) return <div className="stack-xl"><section className="card"><p>This partner is no longer on your list.</p></section></div>;

  return <div className="stack-xl partner-detail">
    <section className="card partner-detail-head">
      <span className="partner-mark" aria-hidden="true">{partner.displayName.slice(0, 2).toUpperCase()}</span>
      <div>
        <strong>{partner.displayName}</strong>
        <small>{partner.blockWeek && partner.blockWeeks
          ? `Week ${partner.blockWeek} of ${partner.blockWeeks} · ${waveLabel(partner.waveSlot ?? 0)}`
          : 'No block yet'}</small>
        {/* Said once. The card below carries the whole session when there is
            one, so the header only speaks up when there is not. */}
        {!partner.trainedToday && <span className="partner-quiet">{lastTrainedLabel(partner.lastTrained)}</span>}
      </div>
    </section>

    {/* TODAY, FIRST. The reason anyone taps a partner's name is to see whether
        they trained and what they did. It was a compressed middot line inside
        the header; it is the headline now. */}
    <section className="card partner-today">
      <header><h3>Today</h3></header>
      {partner.trainedToday && (topSet || cardio.length)
        ? <div className="pv-lines">
            {topSet && <div className="pv-line"><span className="pv-line-name">{partner.topLift}</span><span className="pv-line-value">{partner.topWeight} <small>{weightUnit}</small> × {partner.topReps}</span></div>}
            {cardio.length > 0 && <div className="pv-line"><span className="pv-line-name">{cardio[0]}</span><span className="pv-line-value">{cardio.slice(1).join(' · ')}</span></div>}
          </div>
        : <p className="partner-empty">{partner.trainedToday
            ? `${theirName} logged a session today without a top set or a run in it.`
            : `Nothing from ${theirName} yet today.`}</p>}
    </section>

    {/* TWO CHARTS, NOT FOUR CARDS. What a partner wants to know: is each of
        us getting stronger, and how much is each of us running — 12 weeks,
        you against them. Their day-by-day log stays one tap away. */}
    <GrowthChart title="Gym growth" unit="%" mine={mine} theirs={theirs} theirName={theirName} />
    <MilesChart mine={mine} theirs={theirs} theirName={theirName} />

    {recent.length > 0 && <section className="card partner-recent">
      <button type="button" className="partner-recent-toggle" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>
        {showAll ? `Hide ${theirName}'s sessions` : `See ${theirName}'s sessions ›`}
      </button>
      {showAll && recent.slice(0, 14).map(day => <div className="partner-day" key={day.date}>
        <span className="partner-day-date">{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <div className="pv-lines">
          {day.lifts.map((lift, index) => <div className="pv-line" key={`l${index}`}><span className="pv-line-name">{lift.name}</span><span className="pv-line-value">{lift.weight} <small>{weightUnit}</small> × {lift.reps}</span></div>)}
          {day.cardio.map((session, index) => { const parts = session.summary.split(' · ').filter(Boolean); return <div className="pv-line" key={`c${index}`}><span className="pv-line-name">{session.name}</span><span className="pv-line-value">{parts.slice(parts[0] === session.name ? 1 : 0).join(' · ')}</span></div>; })}
        </div>
      </div>)}
    </section>}
  </div>;
}

const WEEKS = 12;
const W = 320, H = 120, PAD = 8;

/* Strength growth as two lines from zero: you in the accent, them in grey. */
function GrowthChart({ title, unit, mine, theirs, theirName }: { title: string; unit: string; mine: GrowthWeek[]; theirs: GrowthWeek[]; theirName: string }) {
  const lastOf = (weeks: GrowthWeek[]) => [...weeks].reverse().find(week => week.strength !== null)?.strength ?? null;
  const a = lastOf(mine), b = lastOf(theirs);
  const values = [...mine, ...theirs].map(week => week.strength).filter((v): v is number => v !== null);
  const top = Math.max(2, ...values), bottom = Math.min(0, ...values);
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (mine.length - 1);
  const y = (v: number) => H - PAD - ((v - bottom) / (top - bottom || 1)) * (H - PAD * 2);
  const path = (weeks: GrowthWeek[]) => weeks.map((week, i) => week.strength === null ? '' : `${x(i)},${y(week.strength)}`).filter(Boolean).join(' ');
  const fmt = (v: number | null) => v === null ? '—' : `${v > 0 ? '+' : ''}${v}${unit}`;
  return <section className="card partner-chart">
    <header><h3>{title}</h3><small>Strength vs your own start · {WEEKS} weeks</small></header>
    <div className="partner-chart-legend"><span className="me"><b>{fmt(a)}</b> You</span><span className="them"><b>{fmt(b)}</b> {theirName}</span></div>
    {values.length ? <svg viewBox={`0 0 ${W} ${H}`} className="partner-chart-svg" role="img" aria-label={`Strength growth: you ${fmt(a)}, ${theirName} ${fmt(b)}`}>
      <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} className="zero" />
      <polyline points={path(theirs)} className="them" />
      <polyline points={path(mine)} className="me" />
    </svg> : <p className="partner-empty">Log a lift twice and the line starts.</p>}
  </section>;
}

/* Weekly miles as paired bars: you, then them, each week. */
function MilesChart({ mine, theirs, theirName }: { mine: GrowthWeek[]; theirs: GrowthWeek[]; theirName: string }) {
  const total = (weeks: GrowthWeek[]) => Math.round(weeks.reduce((sum, week) => sum + week.miles, 0));
  const top = Math.max(1, ...mine.map(w => w.miles), ...theirs.map(w => w.miles));
  const slot = (W - PAD * 2) / mine.length, bar = Math.max(3, slot / 2 - 2);
  const h = (v: number) => (v / top) * (H - PAD * 2);
  return <section className="card partner-chart">
    <header><h3>Running</h3><small>Miles a week · {WEEKS} weeks</small></header>
    <div className="partner-chart-legend"><span className="me"><b>{total(mine)} mi</b> You</span><span className="them"><b>{total(theirs)} mi</b> {theirName}</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} className="partner-chart-svg" role="img" aria-label={`Miles over ${WEEKS} weeks: you ${total(mine)}, ${theirName} ${total(theirs)}`}>
      {mine.map((week, i) => <g key={week.start}>
        <rect x={PAD + i * slot} y={H - PAD - h(week.miles)} width={bar} height={h(week.miles)} rx="2" className="me" />
        <rect x={PAD + i * slot + bar + 2} y={H - PAD - h(theirs[i]?.miles || 0)} width={bar} height={h(theirs[i]?.miles || 0)} rx="2" className="them" />
      </g>)}
    </svg>
  </section>;
}
