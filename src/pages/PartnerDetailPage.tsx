import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PartnerChart } from '../components/PartnerChart';
import { waveLabel } from '../components/PlanView';
import { useAuth } from '../features/auth/AuthProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { isDemoMode } from '../lib/env';
import {
  loadPartners, loadPartnerMetrics, loadPartnerSeries, loadPartnerWeek, didToday, lastTrainedLabel,
  formatMetric, metricUnit, lowerIsBetter, hasVerdict, METRIC_KINDS,
  type MetricKind, type Partner, type PartnerMetric, type PartnerWeek, type SeriesPoint,
} from '../features/friends/partnerService';
import { fittedChange, repeatableBest, share } from '../lib/partnerStats';

/* AM I KEEPING UP?

   That is the question a training partner has, and the screen used to answer a
   different one — "what are our numbers" — with six months of history and a
   metric picker. History is the wrong tense for it. The week you are both in
   is the comparison people actually make, so it goes first and needs no
   choosing: days trained, miles, sets, streak, side by side.

   Underneath, for the athlete who wants the long view, one metric at a time —
   but plotted as progress against each athlete's own starting point rather
   than raw numbers, because two people at different levels comparing absolutes
   only teaches the weaker one to stop looking. */
/* The four things worth comparing in a week. Streak is last because it is the
   one that rewards not breaking, rather than doing more on any given day. */
const HEAD_TO_HEAD: Array<{ key: string; label: string; value: (week: PartnerWeek) => number; format: (value: number) => string }> = [
  { key: 'days', label: 'Days trained', value: week => week.daysTrained, format: value => String(value) },
  { key: 'miles', label: 'Miles run', value: week => week.miles, format: value => value ? `${Math.round(value * 10) / 10}` : '0' },
  { key: 'sets', label: 'Top sets', value: week => week.topSets, format: value => String(value) },
  { key: 'streak', label: 'Day streak', value: week => week.streak, format: value => String(value) },
];

export function PartnerDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { setup } = useProfileSetup();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [metrics, setMetrics] = useState<PartnerMetric[]>([]);
  const [metric, setMetric] = useState('');
  const [kind, setKind] = useState<MetricKind | ''>('');
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [week, setWeek] = useState<{ mine: PartnerWeek; theirs: PartnerWeek } | null>(null);
  const [loading, setLoading] = useState(true);
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const myName = (setup?.displayName || 'You').split(' ')[0];

  useEffect(() => {
    if (isDemoMode || !user || !id) { setLoading(false); return; }
    let active = true;
    void Promise.all([loadPartners(), loadPartnerMetrics(id), loadPartnerWeek(id)])
      .then(([partners, available, thisWeek]) => {
        if (!active) return;
        setPartner(partners.find(item => item.friendId === id) || null);
        /* ONLY WHAT YOU BOTH HAVE. A measure only one of you logs draws a
           single line on a chart whose whole subject is the pair of you, and
           it padded the picker with lifts the partner has never touched. */
        const shared = available.filter(item => item.mine && item.theirs);
        setMetrics(shared);
        setWeek(thisWeek);
        setMetric(current => current || shared[0]?.key || '');
        setKind(current => current || shared[0]?.kind || '');
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, id]);

  useEffect(() => {
    if (!metric || !id) return;
    let active = true;
    void loadPartnerSeries(id, metric).then(rows => { if (active) setPoints(rows); }).catch(() => { if (active) setPoints([]); });
    return () => { active = false; };
  }, [metric, id]);

  /* FOUR NUMBERS THAT SURVIVE A BAD WEEK.

     Best was the single best week in the window, so one lucky set or one
     downhill mile became the athlete's headline ability; it is the
     second-best week now, which drops exactly one outlier. The trend was the
     last logged week minus the first — two arbitrary weeks, and Preston's read
     +12:12 /mi because his most recent entry was a walk. It is a median-of-
     pairs slope across the window now, so no single week can decide it. */
  const kpis = useMemo(() => {
    const lower = lowerIsBetter(metric);
    const mine = points.map(point => point.mine);
    const theirs = points.map(point => point.theirs);
    /* Where each bucket actually sits on the calendar. The series only carries
       the weeks somebody logged, so counting array positions turned six months
       of Adam's weigh-ins into eleven weeks and overstated every change. */
    const first = points[0] ? Date.parse(`${points[0].bucket}T12:00:00`) : 0;
    const at = points.map(point => Math.round((Date.parse(`${point.bucket}T12:00:00`) - first) / 604800000));
    /* A "best" body weight is a category error, so that card shows the most
       recent weigh-in instead. */
    const latest = (series: Array<number | null>) => [...series].reverse().find(value => value !== null) ?? null;
    const headline = hasVerdict(metric)
      ? (series: Array<number | null>) => repeatableBest(series, lower)
      : latest;
    return {
      myBest: headline(mine), theirBest: headline(theirs),
      myChange: fittedChange(mine, at), theirChange: fittedChange(theirs, at),
    };
  }, [points, metric]);

  /* THE PICKER IS TWO SHORT DECISIONS, NOT ONE LONG ONE.

     One flat strip of every shared measure was, for Preston and Adam, eight
     pills on a 390px phone: a horizontal scroll whose last item was sliced in
     half by the edge of the card, which is how a control announces that it has
     more to say and no room to say it. Split by kind, the first decision is
     three fixed segments that always fit, and the second is only the measures
     inside that kind — which wrap onto a second line rather than running off
     the screen. A kind holding a single measure asks nothing at all. */
  const kinds = useMemo(
    () => METRIC_KINDS.filter(entry => metrics.some(item => item.kind === entry.kind)),
    [metrics]);
  const inKind = useMemo(
    () => metrics.filter(item => item.kind === (kind || kinds[0]?.kind)),
    [metrics, kind, kinds]);
  /* Choosing a kind lands on its first measure, so the chart never sits on a
     metric the picker is no longer showing. */
  const chooseKind = (next: MetricKind) => {
    setKind(next);
    const first = metrics.find(item => item.kind === next);
    if (first) setMetric(first.key);
  };

  const theirName = (partner?.displayName || 'Partner').split(' ')[0];
  /* Body weight has no best and no trend — it has a latest and a change, and
     saying otherwise would put a verdict on a number Forge cannot judge. */
  const best = hasVerdict(metric) ? 'best' : 'latest';
  const move = hasVerdict(metric) ? 'trend' : 'change';
  const unit = metricUnit(metric, weightUnit);
  const label = metrics.find(item => item.key === metric)?.label || '';
  const note = metric.startsWith('body:')
    ? 'Each of you against your own starting weight. Weekly average, last six months — a change, not a score.'
    : `Each of you against your own starting point, so the lines compare progress rather than who started ahead. Weekly ${metric.startsWith('lift:') ? 'best calculated max' : metric === 'run:miles' ? 'running total' : 'best sustained pace over a mile'}, last six months.`;
  /* "Better" is not "bigger": on pace a smaller number is the good direction,
     so the tone of a trend is decided by the metric, not by the sign. */
  const direction = (change: number | null) => change === null || change === 0 || !hasVerdict(metric) ? ''
    : lowerIsBetter(metric) ? (change < 0 ? 'up' : 'down') : (change > 0 ? 'up' : 'down');
  /* A signed number reads as a change; the sign is written, never implied. */
  const signed = (change: number | null) =>
    change === null ? '—' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatMetric(metric, Math.abs(change))}`;

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
        <span className={partner.trainedToday ? 'partner-did' : 'partner-quiet'}>
          {partner.trainedToday ? didToday(partner, weightUnit) : lastTrainedLabel(partner.lastTrained)}
        </span>
      </div>
    </section>

    {/* THIS WEEK, AND NOTHING TO CHOOSE. Four rows, both athletes on each,
        the bar showing the split rather than a number needing arithmetic. The
        leader is named in text as well as position, so the row does not depend
        on reading a bar. */}
    {week && <section className="card partner-week">
      <header><h3>This week</h3><small>Since Monday</small></header>
      {HEAD_TO_HEAD.map(row => {
        const mine = row.value(week.mine); const theirs = row.value(week.theirs);
        const split = share(mine, theirs);
        const leader = mine === theirs ? 'level' : mine > theirs ? 'mine' : 'theirs';
        return <div className={`h2h h2h-lead-${leader}`} key={row.key}>
          <span className="h2h-mine"><b>{row.format(mine)}</b><small>You</small></span>
          <div className="h2h-track" role="img"
            aria-label={`${row.label}: you ${row.format(mine)}, ${theirName} ${row.format(theirs)}`}>
            <span className="h2h-label">{row.label}</span>
            <div className="h2h-bar">
              <i className={mine > 0 ? 'h2h-fill-mine' : 'h2h-fill-mine none'} style={{ flexGrow: split.mine }} />
              <i className={theirs > 0 ? 'h2h-fill-theirs' : 'h2h-fill-theirs none'} style={{ flexGrow: split.theirs }} />
            </div>
          </div>
          <span className="h2h-theirs"><b>{row.format(theirs)}</b><small>{theirName}</small></span>
        </div>;
      })}
      <footer className="partner-week-note">
        {week.mine.daysTrained === week.theirs.daysTrained
          ? `Level with ${theirName} on days trained this week.`
          : week.mine.daysTrained > week.theirs.daysTrained
            ? `You are ${week.mine.daysTrained - week.theirs.daysTrained} day${week.mine.daysTrained - week.theirs.daysTrained === 1 ? '' : 's'} up on ${theirName} this week.`
            : `${theirName} is ${week.theirs.daysTrained - week.mine.daysTrained} day${week.theirs.daysTrained - week.mine.daysTrained === 1 ? '' : 's'} up on you this week.`}
      </footer>
    </section>}

    {!metrics.length
      ? <section className="card"><p className="partner-empty">Nothing in common yet. A lift you have both logged — or a run, or a weigh-in — is all it takes for a comparison to appear here.</p></section>
      : <>
        {/* Both athletes, both numbers: a best and a six-month trend each, so
            the comparison reads across as well as down. */}
        <section className="partner-kpis">
          <div><span>Your {best}</span><strong>{formatMetric(metric, kpis.myBest)}</strong><small>{kpis.myBest === null ? '' : unit}</small></div>
          <div><span>{theirName} {best}</span><strong>{formatMetric(metric, kpis.theirBest)}</strong><small>{kpis.theirBest === null ? '' : unit}</small></div>
          <div className={direction(kpis.myChange)}><span>Your {move}</span><strong>{signed(kpis.myChange)}</strong><small>{kpis.myChange === null ? 'needs 3 weeks' : `${unit} · 6 months`}</small></div>
          <div className={direction(kpis.theirChange)}><span>{theirName} {move}</span><strong>{signed(kpis.theirChange)}</strong><small>{kpis.theirChange === null ? 'needs 3 weeks' : `${unit} · 6 months`}</small></div>
        </section>

        {/* Kind first, then the measure inside it. */}
        <section className="card partner-compare">
          <header><h3>{label}</h3></header>
          {kinds.length > 1 && <div className="partner-kinds" role="tablist" aria-label="What to compare">
            {kinds.map(entry => <button type="button" key={entry.kind} role="tab"
              aria-selected={entry.kind === (kind || kinds[0]?.kind)}
              className={`partner-kind${entry.kind === (kind || kinds[0]?.kind) ? ' active' : ''}`}
              onClick={() => chooseKind(entry.kind)}>{entry.label}</button>)}
          </div>}
          {inKind.length > 1 && <div className="partner-metrics" role="tablist" aria-label="Measure">
            {inKind.map(item => <button type="button" key={item.key} role="tab"
              aria-selected={item.key === metric}
              className={`partner-metric${item.key === metric ? ' active' : ''}`}
              onClick={() => setMetric(item.key)}>{item.label}</button>)}
          </div>}
          <PartnerChart points={points} metric={metric} unit={unit}
            myName={myName} theirName={theirName} />
          <footer className="partner-compare-note">{note}</footer>
        </section>
      </>}
  </div>;
}
