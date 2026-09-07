import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PartnerChart } from '../components/PartnerChart';
import { waveLabel } from '../components/PlanView';
import { useAuth } from '../features/auth/AuthProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { isDemoMode } from '../lib/env';
import {
  loadPartners, loadPartnerMetrics, loadPartnerSeries, didToday, lastTrainedLabel,
  formatMetric, metricUnit, lowerIsBetter,
  type Partner, type PartnerMetric, type SeriesPoint,
} from '../features/friends/partnerService';

/* ONE PARTNER, ONE CHART.

   The screen answers "how are we both going" and stops. Three numbers at the
   top for the metric in view, a filter for every lift and run measure the two
   of you have between you, and one chart with a line each. Not a dashboard:
   the metric picker is the only thing that changes what is on screen. */
export function PartnerDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { setup } = useProfileSetup();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [metrics, setMetrics] = useState<PartnerMetric[]>([]);
  const [metric, setMetric] = useState('');
  const [points, setPoints] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState({ mine: true, theirs: true });
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const myName = (setup?.displayName || 'You').split(' ')[0];

  useEffect(() => {
    if (isDemoMode || !user || !id) { setLoading(false); return; }
    let active = true;
    void Promise.all([loadPartners(), loadPartnerMetrics(id)])
      .then(([partners, available]) => {
        if (!active) return;
        setPartner(partners.find(item => item.friendId === id) || null);
        setMetrics(available);
        setMetric(current => current || available[0]?.key || '');
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

  const toggle = useCallback((which: 'mine' | 'theirs') =>
    setShow(current => ({ ...current, [which]: !current[which] })), []);

  /* THREE NUMBERS, AND THEY BELONG TO THE METRIC ON SCREEN. Best is the
     athlete's best week in the window; the trend is first logged week to last,
     which is the only "growth" this data can honestly claim. */
  const kpis = useMemo(() => {
    const pick = (which: 'mine' | 'theirs') => points.map(point => point[which]).filter((value): value is number => value !== null);
    const best = (values: number[]) => values.length ? (lowerIsBetter(metric) ? Math.min(...values) : Math.max(...values)) : null;
    const trend = (values: number[]) => values.length >= 2 ? values[values.length - 1] - values[0] : null;
    const mine = pick('mine'); const theirs = pick('theirs');
    return { myBest: best(mine), theirBest: best(theirs), myChange: trend(mine), theirChange: trend(theirs) };
  }, [points, metric]);

  const theirName = (partner?.displayName || 'Partner').split(' ')[0];
  const unit = metricUnit(metric, weightUnit);
  const label = metrics.find(item => item.key === metric)?.label || '';
  /* "Better" is not "bigger": on pace a smaller number is the good direction,
     so the tone of a trend is decided by the metric, not by the sign. */
  const direction = (change: number | null) => change === null || change === 0 ? ''
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

    {!metrics.length
      ? <section className="card"><p className="partner-empty">Nothing to compare yet. Once you have both logged the same lift, it appears here.</p></section>
      : <>
        {/* Both athletes, both numbers: a best and a six-month trend each, so
            the comparison reads across as well as down. */}
        <section className="partner-kpis">
          <div><span>Your best</span><strong>{formatMetric(metric, kpis.myBest)}</strong><small>{kpis.myBest === null ? '' : unit}</small></div>
          <div><span>{theirName} best</span><strong>{formatMetric(metric, kpis.theirBest)}</strong><small>{kpis.theirBest === null ? '' : unit}</small></div>
          <div className={direction(kpis.myChange)}><span>Your trend</span><strong>{signed(kpis.myChange)}</strong><small>{kpis.myChange === null ? 'needs 2 weeks' : `${unit} · 6 months`}</small></div>
          <div className={direction(kpis.theirChange)}><span>{theirName} trend</span><strong>{signed(kpis.theirChange)}</strong><small>{kpis.theirChange === null ? 'needs 2 weeks' : `${unit} · 6 months`}</small></div>
        </section>

        {/* Every measure the two of you have between you, the shared ones first. */}
        <section className="card partner-compare">
          <header><h3>{label}</h3></header>
          <div className="partner-metric-filter" role="tablist" aria-label="Metric">
            {metrics.map(item => <button type="button" key={item.key} role="tab"
              aria-selected={item.key === metric}
              className={`partner-metric${item.key === metric ? ' active' : ''}${item.mine && item.theirs ? ' shared' : ''}`}
              onClick={() => setMetric(item.key)}>{item.label}</button>)}
          </div>
          <PartnerChart points={points} metric={metric} unit={unit}
            myName={myName} theirName={theirName} show={show} onToggle={toggle} />
          <footer className="partner-compare-note">
            {lowerIsBetter(metric) ? 'Faster weeks sit higher. ' : ''}
            Weekly {metric.startsWith('lift:') ? 'best calculated max' : metric === 'run:miles' ? 'running total' : 'average pace'}, last six months.
          </footer>
        </section>
      </>}
  </div>;
}
