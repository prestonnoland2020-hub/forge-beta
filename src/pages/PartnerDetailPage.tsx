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
    const mine = pick('mine'); const theirs = pick('theirs');
    const change = mine.length >= 2 ? mine[mine.length - 1] - mine[0] : null;
    return { myBest: best(mine), theirBest: best(theirs), change };
  }, [points, metric]);

  const theirName = (partner?.displayName || 'Partner').split(' ')[0];
  const unit = metricUnit(metric, weightUnit);
  const label = metrics.find(item => item.key === metric)?.label || '';
  const better = kpis.change === null ? '' : lowerIsBetter(metric)
    ? (kpis.change < 0 ? 'up' : kpis.change > 0 ? 'down' : '')
    : (kpis.change > 0 ? 'up' : kpis.change < 0 ? 'down' : '');

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
        <section className="partner-kpis">
          <div><span>Your best</span><strong>{formatMetric(metric, kpis.myBest)}</strong><small>{kpis.myBest === null ? '' : unit}</small></div>
          <div><span>{theirName} best</span><strong>{formatMetric(metric, kpis.theirBest)}</strong><small>{kpis.theirBest === null ? '' : unit}</small></div>
          <div className={better}><span>Your trend</span><strong>{kpis.change === null ? '—' : `${kpis.change > 0 ? '+' : ''}${formatMetric(metric, Math.abs(kpis.change) * (kpis.change < 0 ? -1 : 1))}`}</strong><small>{kpis.change === null ? 'need 2 weeks' : `${unit} · 6 months`}</small></div>
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
