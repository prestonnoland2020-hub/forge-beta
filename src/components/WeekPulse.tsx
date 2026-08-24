import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { cardioMiles, summarizeCardioDraft } from '../lib/cardioSession';

/* Strava-style week pulse for the Today feed: this week's totals up top, the
   last twelve weeks as a filled trend underneath. Chips flip the lens between
   running volume and lifting volume; both read from the same history. */
type Lens = 'run' | 'lift';
const weekStartIso = (date: Date) => {
  const day = new Date(date); day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
};
const addDays = (iso: string, days: number) => {
  const day = new Date(`${iso}T12:00:00`); day.setDate(day.getDate() + days);
  return day.toISOString().slice(0, 10);
};
const formatHours = (minutes: number) => {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
};

export function WeekPulse() {
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [plotWidth, setPlotWidth] = useState(340);
  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => { const w = entries[0]?.contentRect.width; if (w) setPlotWidth(Math.max(260, Math.round(w))); });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const weeks = useMemo(() => {
    const thisWeek = weekStartIso(new Date());
    const list = Array.from({ length: 12 }, (_, index) => addDays(thisWeek, (index - 11) * 7));
    return list.map(start => {
      const end = addDays(start, 6);
      const inWeek = records.filter(record => record.date >= start && record.date <= end);
      const miles = inWeek.reduce((total, record) => total + (record.cardioSessions || []).reduce((sum, session) => sum + cardioMiles(session), 0), 0);
      const cardioMinutes = inWeek.reduce((total, record) => total + (record.cardioSessions || []).reduce((sum, session) => sum + summarizeCardioDraft(session).minutes, 0), 0);
      const sets = inWeek.reduce((total, record) => total + (record.topSets || []).filter(set => set.completed !== false).length, 0);
      const runs = inWeek.reduce((total, record) => total + (record.cardioSessions || []).length, 0);
      return { start, miles: Number(miles.toFixed(2)), cardioMinutes, sets, sessions: inWeek.length, runs };
    });
  }, [records]);

  const hasMiles = weeks.some(week => week.miles > 0);
  const hasSets = weeks.some(week => week.sets > 0);
  const [lens, setLens] = useState<Lens>(hasMiles || !hasSets ? 'run' : 'lift');
  const current = weeks[weeks.length - 1];
  const heaviest = useMemo(() => {
    const start = current.start;
    let best: { lift: string; weight: number } | null = null;
    records.filter(record => record.date >= start).forEach(record => (record.topSets || []).forEach(set => {
      if (set.completed !== false && set.weight > 0 && (!best || set.weight > best.weight)) best = { lift: set.lift, weight: set.weight };
    }));
    return best as { lift: string; weight: number } | null;
  }, [records, current.start]);

  const values = weeks.map(week => lens === 'run' ? week.miles : week.sets);
  const peak = Math.max(1, ...values);
  const W = plotWidth, H = 130, PADX = 6, AXIS = 54, TOP = 12, BASE = H - 24;
  const span = W - PADX - AXIS;
  const x = (index: number) => PADX + (values.length === 1 ? span / 2 : index * span / (values.length - 1));
  const y = (value: number) => BASE - (value / peak) * (BASE - TOP);
  const linePoints = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const areaPath = `M${x(0)},${BASE} L${linePoints.split(' ').join(' L')} L${x(values.length - 1)},${BASE} Z`;
  const monthLabels = weeks.reduce<Array<{ index: number; label: string }>>((list, week, index) => {
    const month = new Date(`${week.start}T12:00:00`).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    if (!list.length || list[list.length - 1].label !== month) list.push({ index, label: month });
    return list;
  }, []).filter((item, index, all) => index === 0 ? all.length < 4 || item.index > 0 : true);
  const axisSteps = [peak, peak / 2, 0];
  const unitLabel = lens === 'run' ? 'mi' : 'lifts';
  /* Hover or tap a point to read it — the same tooltip Insights uses. */
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => { setPicked(null); }, [lens]);
  const pickedWeek = picked === null ? null : weeks[picked];

  return <section className="feed-card week-pulse-card">
    <header className="week-pulse-head">
      <div className="week-pulse-chips" role="group" aria-label="This week lens">
        <button type="button" className={lens === 'run' ? 'active' : ''} onClick={() => setLens('run')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 0 0-3.6 0Z"/><path d="m6 20 3.2-5.4L7.6 11l3-3.6 2.9 1.5 3 1.1"/><path d="m10.5 8 1.6-2.7 3.3 2.2 2.6.6"/><path d="m9.2 14.6 2.6 1.6L13 21"/></svg>Run</button>
        <button type="button" className={lens === 'lift' ? 'active' : ''} onClick={() => setLens('lift')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="M3.5 12h2M18.5 12h2M7 12h10"/><path d="M6 8.5v7M9 6.5v11M15 6.5v11M18 8.5v7"/></svg>Lifts</button>
      </div>
      <Link className="week-pulse-more" to="/insights">Progress →</Link>
    </header>
    <h3 className="week-pulse-title">This week</h3>
    <div className="week-pulse-stats">
      {lens === 'run' ? <>
        <div><span>Distance</span><strong>{current.miles.toFixed(current.miles >= 10 ? 1 : 2)} <small>mi</small></strong></div>
        <div><span>Time</span><strong>{formatHours(current.cardioMinutes)}</strong></div>
        <div><span>Sessions</span><strong>{current.runs}</strong></div>
      </> : <>
        <div><span>Lifts</span><strong>{current.sets}</strong></div>
        <div><span>Sessions</span><strong>{current.sessions}</strong></div>
        <div><span>Heaviest</span><strong>{heaviest ? <>{heaviest.weight} <small>{weightUnit}</small></> : '—'}</strong></div>
      </>}
    </div>
    <div className="week-pulse-plot" ref={plotRef} onMouseLeave={() => setPicked(null)}>
      <span className="week-pulse-caption">Past 12 weeks</span>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Weekly ${lens === 'run' ? 'distance' : 'top sets'} for the past 12 weeks`}>
        {axisSteps.map((step, index) => <g key={index} className="week-pulse-grid">
          <line x1={PADX} y1={y(step)} x2={W - AXIS + 6} y2={y(step)} />
          <text x={W - AXIS + 10} y={y(step) + 4}>{Math.round(step * 10) / 10} {unitLabel}</text>
        </g>)}
        <path className="week-pulse-area" d={areaPath} />
        <polyline className="week-pulse-line" points={linePoints} fill="none" />
        {values.map((value, index) => <g key={index} className={picked === index ? 'week-pulse-point picked' : 'week-pulse-point'} tabIndex={0} role="button" aria-label={`Week of ${new Date(`${weeks[index].start}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${value} ${unitLabel}`} onMouseEnter={() => setPicked(index)} onFocus={() => setPicked(index)} onClick={() => setPicked(current => current === index ? null : index)}>
          <circle className="week-pulse-hit" cx={x(index)} cy={y(value)} r={13} />
          <circle className="week-pulse-dot" cx={x(index)} cy={y(value)} r={index === values.length - 1 || picked === index ? 5 : 3} />
        </g>)}
        {monthLabels.map(item => <text key={item.label + item.index} className="week-pulse-month" x={x(item.index)} y={H - 6}>{item.label}</text>)}
      </svg>
      {picked !== null && pickedWeek && <div className="overview-chart-tooltip" style={{ left: `${x(picked) / W * 100}%`, top: `${(Math.max(18, y(values[picked])) + 18) / (H + 18) * 100}%` }}>
        <span>Wk of {new Date(`${pickedWeek.start}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <strong>{lens === 'run' ? values[picked].toFixed(values[picked] >= 10 ? 1 : 2) : values[picked]}</strong>
        <small>{lens === 'run' ? 'miles' : 'lifts logged'}</small>
      </div>}
    </div>
  </section>;
}
