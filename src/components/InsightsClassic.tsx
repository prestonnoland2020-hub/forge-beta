import { useMemo, useState } from 'react';
import { useWorkoutHistory, type WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { cardioMiles, summarizeCardioDraft, bestRunPaceMinutesPerMile } from '../lib/cardioSession';
import { calculateEstimatedOneRepMax } from '../lib/strength';

/* Insights rebuilt on the original Forge web app's structure: KPI tiles,
   8-week consistency, weight trend, muscle & cardio frequency, personal
   records, PR progress, PR history. Same order, same density. */

const isoOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const weekStartIso = (iso: string) => { const day = new Date(`${iso}T12:00:00`); day.setDate(day.getDate() - ((day.getDay() + 6) % 7)); return day.toISOString().slice(0, 10); };
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
const isStrengthSession = (record: WorkoutRecord) => (record.topSets || []).some(set => set.completed !== false) || (record.muscles || []).some(muscle => !['cardio', 'rest', 'none'].includes(muscle.trim().toLowerCase()));
const hasCardioSession = (record: WorkoutRecord) => (record.cardioSessions || []).length > 0;

export function InsightsClassic() {
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const unit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const todayIso = isoOf(new Date());

  /* ------------------------------------------------ KPI tiles (last 30 days) */
  const kpi = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
    const cutoffIso = isoOf(cutoff);
    const window = records.filter(record => record.date >= cutoffIso);
    const liftDays = new Set(window.filter(isStrengthSession).map(record => record.date)).size;
    const cardioDays = new Set(window.filter(hasCardioSession).map(record => record.date)).size;
    const miles = window.reduce((total, record) => total + (record.cardioSessions || []).reduce((sum, session) => sum + cardioMiles(session), 0), 0);
    const weights = window.filter(record => typeof record.bodyWeight === 'number' && record.bodyWeight! > 0).sort((a, b) => a.date.localeCompare(b.date));
    const weightEnd = weights.length ? weights[weights.length - 1].bodyWeight! : null;
    const weightChange = weights.length >= 2 ? weights[weights.length - 1].bodyWeight! - weights[0].bodyWeight! : null;
    const daysLogged = new Set(window.map(record => record.date)).size;
    return { liftDays, cardioDays, miles, weightEnd, weightChange, adherence: Math.round(daysLogged / 30 * 100), sessions: window.length };
  }, [records]);

  /* --------------------------------------------------- 8-week consistency */
  const weeks = useMemo(() => {
    const thisWeek = weekStartIso(todayIso);
    return Array.from({ length: 8 }, (_, index) => {
      const start = new Date(`${thisWeek}T12:00:00`); start.setDate(start.getDate() - (7 - index) * 7);
      const startIso = start.toISOString().slice(0, 10);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const endIso = end.toISOString().slice(0, 10);
      const inWeek = records.filter(record => record.date >= startIso && record.date <= endIso);
      return { startIso, lift: inWeek.filter(isStrengthSession).length, cardio: inWeek.filter(hasCardioSession).length };
    });
  }, [records, todayIso]);
  const weekPeak = Math.max(1, ...weeks.map(week => week.lift + week.cardio));
  const completedWeeks = weeks.slice(0, 7);
  const activeWeeks = completedWeeks.filter(week => week.lift + week.cardio > 0).length;
  const perWeek = completedWeeks.reduce((sum, week) => sum + week.lift + week.cardio, 0) / Math.max(1, completedWeeks.length);

  /* -------------------------------------------------- weight trend · month */
  const weightPoints = useMemo(() => {
    const monthStart = todayIso.slice(0, 8) + '01';
    return records.filter(record => record.date >= monthStart && typeof record.bodyWeight === 'number' && record.bodyWeight! > 0)
      .map(record => ({ date: record.date, value: record.bodyWeight! }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [records, todayIso]);

  /* ------------------------------------------- frequency (last 8 weeks) */
  const frequency = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 56);
    const cutoffIso = isoOf(cutoff);
    const window = records.filter(record => record.date >= cutoffIso);
    const muscles = new Map<string, number>();
    window.forEach(record => (record.muscles || []).forEach(muscle => { if (muscle !== 'Cardio') muscles.set(muscle, (muscles.get(muscle) || 0) + 1); }));
    const cardioTypes = new Map<string, number>();
    window.forEach(record => (record.cardioSessions || []).forEach(session => { const type = session.activity || 'Cardio'; cardioTypes.set(type, (cardioTypes.get(type) || 0) + 1); }));
    return {
      muscles: [...muscles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      cardio: [...cardioTypes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    };
  }, [records]);

  /* ------------------------------------------------------ PRs (all time) */
  const bestByLift = useMemo(() => {
    const best = new Map<string, { weight: number; reps: number; date: string }>();
    records.forEach(record => (record.topSets || []).forEach(set => {
      if (set.completed === false || !set.lift || !set.weight) return;
      const current = best.get(set.lift);
      if (!current || set.weight > current.weight) best.set(set.lift, { weight: set.weight, reps: set.reps, date: record.date });
    }));
    return best;
  }, [records]);
  const prTiles = [...bestByLift.entries()].sort((a, b) => b[1].weight - a[1].weight).slice(0, 4);

  /* --------------------------------------------------------- PR progress */
  const lifts = useMemo(() => [...bestByLift.keys()].sort(), [bestByLift]);
  const [prLift, setPrLift] = useState('');
  const [prMode, setPrMode] = useState<'1rm' | 'calc'>('calc');
  const [prRange, setPrRange] = useState<'3m' | '6m' | '1y' | 'all'>('3m');
  const rangeDays: Record<'3m' | '6m' | '1y' | 'all', number> = { '3m': 90, '6m': 182, '1y': 365, all: 3650 };
  const rangeCutoffIso = useMemo(() => { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - rangeDays[prRange]); return isoOf(cutoff); }, [prRange]);
  /* Endurance, weekly and readable: miles per week, or the week's best pace. */
  const [endMetric, setEndMetric] = useState<'miles' | 'pace'>('miles');
  const enduranceSeries = useMemo(() => {
    const byWeek = new Map<string, { miles: number; bestPace: number }>();
    records.filter(record => record.date >= rangeCutoffIso).forEach(record => (record.cardioSessions || []).forEach(session => {
      const miles = cardioMiles(session);
      if (!miles) return;
      const week = weekStartIso(record.date);
      const entry = byWeek.get(week) || { miles: 0, bestPace: Infinity };
      /* Weekly mileage and best pace are RUNNING stats — synced rides, swims,
         and gym work keep their own day entries but stay out of this chart. */
      const runShaped = !/bike|ride|swim|row|elliptical|stair|ski|weight|yoga|workout|crossfit/i.test(session.activity || '');
      if (!runShaped) return;
      entry.miles += miles;
      /* A pace only counts when one continuous segment covered at least a
         mile — no whole-session averages over interval days. */
      const pace = bestRunPaceMinutesPerMile(session);
      if (pace) entry.bestPace = Math.min(entry.bestPace, pace);
      byWeek.set(week, entry);
    }));
    return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([week, entry]) => ({ date: week, value: endMetric === 'miles' ? Number(entry.miles.toFixed(1)) : entry.bestPace === Infinity ? 0 : Number(entry.bestPace.toFixed(2)) }))
      .filter(point => point.value > 0);
  }, [records, rangeCutoffIso, endMetric]);
  const selectedLift = prLift || lifts[0] || '';
  const prSeries = useMemo(() => {
    const byDay = new Map<string, number>();
    records.filter(record => record.date >= rangeCutoffIso).forEach(record => (record.topSets || []).forEach(set => {
      if (set.completed === false || set.lift !== selectedLift || !set.weight) return;
      if (prMode === '1rm' && set.reps !== 1) return;
      const value = prMode === '1rm' ? set.weight : (set.calculatedMax || calculateEstimatedOneRepMax(set.weight, set.reps) || 0);
      if (!value) return;
      byDay.set(record.date, Math.max(byDay.get(record.date) || 0, value));
    }));
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  }, [records, selectedLift, prMode, rangeCutoffIso]);
  /* Old-app parity: the chart is accompanied by the actual numbers — the best
     entry in the window (raw weight ×reps, and its 1RM/calculated value) plus
     the first-to-last change across the selected range. */
  const rangeLabels: Record<'3m' | '6m' | '1y' | 'all', string> = { '3m': '3M', '6m': '6M', '1y': '1Y', all: 'All time' };
  const prStats = useMemo(() => {
    let best: { weight: number; reps: number; date: string; value: number } | null = null;
    const entries: Array<{ date: string; value: number }> = [];
    records.filter(record => record.date >= rangeCutoffIso).forEach(record => (record.topSets || []).forEach(set => {
      if (set.completed === false || set.lift !== selectedLift || !set.weight) return;
      if (prMode === '1rm' && set.reps !== 1) return;
      const value = prMode === '1rm' ? set.weight : (set.calculatedMax || calculateEstimatedOneRepMax(set.weight, set.reps) || 0);
      if (!value) return;
      entries.push({ date: record.date, value });
      if (!best || value > best.value) best = { weight: set.weight, reps: set.reps, date: record.date, value };
    }));
    entries.sort((a, b) => a.date.localeCompare(b.date));
    const delta = entries.length >= 2 ? Math.round((entries[entries.length - 1].value - entries[0].value) * 10) / 10 : null;
    return { best: best as { weight: number; reps: number; date: string; value: number } | null, delta };
  }, [records, selectedLift, prMode, rangeCutoffIso]);
  const paceText = (value: number) => { let minutes = Math.floor(value); let seconds = Math.round((value - minutes) * 60); if (seconds === 60) { minutes += 1; seconds = 0; } return `${minutes}:${String(seconds).padStart(2, '0')}`; };
  const endStats = useMemo(() => {
    if (!enduranceSeries.length) return null;
    const latest = enduranceSeries[enduranceSeries.length - 1];
    const best = enduranceSeries.reduce((top, point) => (endMetric === 'pace' ? point.value < top.value : point.value > top.value) ? point : top, enduranceSeries[0]);
    const delta = enduranceSeries.length >= 2 ? Number((latest.value - enduranceSeries[0].value).toFixed(endMetric === 'pace' ? 2 : 1)) : null;
    return { latest, best, delta };
  }, [enduranceSeries, endMetric]);

  /* ------------------------------------------------- PR history · month */
  const monthHistory = useMemo(() => {
    const monthStart = todayIso.slice(0, 8) + '01';
    const rows: Array<{ lift: string; weight: number; reps: number; date: string }> = [];
    records.filter(record => record.date >= monthStart).forEach(record => (record.topSets || []).forEach(set => {
      if (set.completed === false || !set.lift || !set.weight) return;
      rows.push({ lift: set.lift, weight: set.weight, reps: set.reps, date: record.date });
    }));
    return rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [records, todayIso]);

  /* The exact chart renderer from the original app: quadratic-midpoint
     smoothing (straight when dense), vertical gradient area fill, 2px round
     stroke, 2.4px dots with a haloed endpoint, nice ticks, and a three-date
     strip under a hairline. viewBox 280x130 stretched to 150px tall. */
  const lineChart = (points: Array<{ date: string; value: number }>, id: string) => {
    if (points.length < 2) return null;
    const W = 280, H = 130, PL = 30, PR = 5, PT = 8, PB = 8;
    const ts = points.map(point => new Date(`${point.date}T12:00:00`).getTime());
    const minX = Math.min(...ts), maxX = Math.max(...ts);
    const ys = points.map(point => point.value);
    const rawSpan = (Math.max(...ys) - Math.min(...ys)) || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rawSpan / 3)));
    const norm = rawSpan / 3 / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const niceMin = Math.floor(Math.min(...ys) / step) * step;
    const niceMax = Math.ceil(Math.max(...ys) / step) * step;
    const ticks: number[] = [];
    for (let v = niceMin; v <= niceMax + step * .001; v += step) ticks.push(Math.round(v * 10) / 10);
    const xSpan = (maxX - minX) || 1, ySpan = (niceMax - niceMin) || 1;
    const x = (t: number) => PL + ((t - minX) / xSpan) * (W - PL - PR);
    const y = (value: number) => H - PB - ((value - niceMin) / ySpan) * (H - PT - PB);
    const pts = points.map((point, index) => ({ x: x(ts[index]), y: y(point.value) }));
    const dense = pts.length > 20;
    let lineD = `M ${pts[0].x},${pts[0].y}`;
    if (dense) lineD = 'M ' + pts.map(point => `${point.x},${point.y}`).join(' L ');
    else for (let i = 1; i < pts.length; i++) { const point = pts[i]; const isLast = i === pts.length - 1; const endX = isLast ? point.x : (point.x + pts[i + 1].x) / 2; const endY = isLast ? point.y : (point.y + pts[i + 1].y) / 2; lineD += ` Q ${point.x},${point.y} ${endX},${endY}`; }
    const areaD = `${lineD} L ${pts[pts.length - 1].x},${H - PB} L ${pts[0].x},${H - PB} Z`;
    const gid = `icGrad-${id}`;
    const last = pts[pts.length - 1];
    const mid = minX + (maxX - minX) / 2;
    const dateLabel = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }} role="img">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((tick, index) => <g key={index}><line x1={PL} y1={y(tick)} x2={W - PR} y2={y(tick)} stroke="var(--hairline)" strokeWidth="1" /><text x={PL - 6} y={y(tick) + 3} fontSize="9" textAnchor="end" fill="var(--ink-3)">{step >= 1 ? Math.round(tick) : tick}</text></g>)}
        <path d={areaD} fill={`url(#${gid})`} stroke="none" />
        <path d={lineD} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {!dense && pts.slice(0, -1).map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="2.4" fill="var(--accent)" />)}
        <circle cx={last.x} cy={last.y} r="7" fill="var(--accent)" opacity="0.18" />
        <circle cx={last.x} cy={last.y} r="4" fill="var(--accent)" stroke="var(--surface-1)" strokeWidth="1.5" />
      </svg>
      <div className="ic-datebar"><span>{dateLabel(minX)}</span><span>{dateLabel(mid)}</span><span>{dateLabel(maxX)}</span></div>
    </>;
  };

  return <div className="insights-classic">
    {lifts.length > 0 && <section className="card ic-card">
      <header className="ic-head"><i /><h3>PR progress</h3></header>
      <select value={selectedLift} onChange={event => setPrLift(event.target.value)}>{lifts.map(lift => <option key={lift}>{lift}</option>)}</select>
      <div className="ic-toggle" role="group" aria-label="PR metric">{([['1rm', '1RM'], ['calc', 'Calculated Max']] as const).map(([value, label]) => <button type="button" key={value} className={prMode === value ? 'active' : ''} onClick={() => setPrMode(value)}>{label}</button>)}</div>
      <div className="ic-range" role="group" aria-label="Date range">{([['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All']] as const).map(([value, label]) => <button type="button" key={value} className={prRange === value ? 'active' : ''} onClick={() => setPrRange(value)}>{label}</button>)}</div>
      {prSeries.length >= 2 ? lineChart(prSeries, 'pr') : <p className="ic-empty">{prMode === '1rm' ? `No true 1-rep-max entries for ${selectedLift} in this range. Try “Calculated Max” to include multi-rep sets.` : `Not enough ${selectedLift} sets in this range to chart.`}</p>}
      {prStats.best && <div className="kpi-grid ic-chart-kpis">
        <div className="kpi-tile"><b>{prStats.best.weight} {unit}</b><span>Weight lifted</span><small>{prStats.best.reps > 1 ? `×${prStats.best.reps} reps · ` : ''}{shortDate(prStats.best.date)}</small></div>
        <div className="kpi-tile gold"><b>{Math.round(prStats.best.value * 10) / 10} {unit}</b><span>{prMode === '1rm' ? '1RM' : 'Calculated max'}</span><small>{shortDate(prStats.best.date)}</small>{prStats.delta !== null && <small className={prStats.delta > 0 ? 'ic-delta up' : prStats.delta < 0 ? 'ic-delta down' : 'ic-delta'}>{prStats.delta === 0 ? 'No change' : `${prStats.delta > 0 ? '+' : ''}${prStats.delta} ${unit}`} · {rangeLabels[prRange]}</small>}</div>
      </div>}
    </section>}

    <section className="card ic-card">
      <header className="ic-head"><i /><h3>Endurance</h3></header>
      <div className="ic-toggle" role="group" aria-label="Endurance metric">{([['miles', 'Miles / week'], ['pace', 'Best pace']] as const).map(([value, label]) => <button type="button" key={value} className={endMetric === value ? 'active' : ''} onClick={() => setEndMetric(value)}>{label}</button>)}</div>
      {enduranceSeries.length >= 2 ? <>{lineChart(enduranceSeries, 'end')}<p className="ic-sub">{endMetric === 'miles' ? 'Total miles each week' : 'Fastest continuous mile-plus effort (min/mi) — lower is better'} · follows the range above</p></> : <p className="ic-empty">Not enough cardio in this range to chart.</p>}
      {endStats && <div className="kpi-grid ic-chart-kpis">
        <div className="kpi-tile"><b>{endMetric === 'miles' ? `${endStats.latest.value.toFixed(1)} mi` : `${paceText(endStats.latest.value)} /mi`}</b><span>{endMetric === 'miles' ? 'Latest week' : 'Latest best pace'}</span><small>Week of {shortDate(endStats.latest.date)}</small></div>
        <div className="kpi-tile sage"><b>{endMetric === 'miles' ? `${endStats.best.value.toFixed(1)} mi` : `${paceText(endStats.best.value)} /mi`}</b><span>{endMetric === 'miles' ? 'Best week' : 'Best pace'}</span><small>Week of {shortDate(endStats.best.date)}</small>{endStats.delta !== null && <small className={(endMetric === 'pace' ? endStats.delta < 0 : endStats.delta > 0) ? 'ic-delta up' : endStats.delta === 0 ? 'ic-delta' : 'ic-delta down'}>{endStats.delta === 0 ? 'No change' : endMetric === 'pace' ? `${endStats.delta < 0 ? '−' : '+'}${paceText(Math.abs(endStats.delta))} /mi` : `${endStats.delta > 0 ? '+' : ''}${endStats.delta.toFixed(1)} mi`} · {rangeLabels[prRange]}</small>}</div>
      </div>}
    </section>

    <div className="kpi-grid">
      <div className="kpi-tile gold"><b>{kpi.liftDays}</b><span>Lift days</span></div>
      <div className="kpi-tile sage"><b>{kpi.cardioDays}</b><span>Cardio days</span></div>
      <div className="kpi-tile"><b>{kpi.miles.toFixed(1)}</b><span>Total miles</span></div>
      <div className="kpi-tile"><b>{kpi.weightEnd === null ? '—' : kpi.weightEnd.toFixed(1)}</b><span>Weight</span><small>{kpi.weightChange === null ? 'No weight logged' : kpi.weightChange === 0 ? 'No change' : `${kpi.weightChange > 0 ? '+' : ''}${kpi.weightChange.toFixed(1)} ${unit}`}</small></div>
      <div className="kpi-tile"><b>{kpi.adherence}%</b><span>Days logged</span></div>
      <div className="kpi-tile"><b>{kpi.sessions}</b><span>Total sessions</span></div>
    </div>

    <section className="card ic-card">
      <header className="ic-head"><i /><h3>Muscle group frequency</h3></header>
      {frequency.muscles.length ? <div className="ic-freq">{frequency.muscles.map(([muscle, count]) => { const peak = frequency.muscles[0][1]; return <div key={muscle}><span>{muscle}</span><div className="ic-track"><i style={{ width: `${count / peak * 100}%` }} /></div><b>{count}</b></div>; })}</div> : <p className="ic-empty">No strength sessions in the last 8 weeks.</p>}
    </section>

    <section className="card ic-card">
      <header className="ic-head"><i /><h3>Cardio type frequency</h3></header>
      {frequency.cardio.length ? <div className="ic-freq muted">{frequency.cardio.map(([type, count]) => { const peak = frequency.cardio[0][1]; return <div key={type}><span>{type}</span><div className="ic-track"><i style={{ width: `${count / peak * 100}%` }} /></div><b>{count}</b></div>; })}</div> : <p className="ic-empty">No cardio in the last 8 weeks.</p>}
    </section>

    {prTiles.length > 0 && <section className="card ic-card">
      <header className="ic-head"><i /><h3>Personal records</h3></header>
      <div className="ic-pr-grid">{prTiles.map(([lift, best]) => <div key={lift}><b>{best.weight} {unit} ×{best.reps}</b><span>{lift}</span><small>{shortDate(best.date)}</small></div>)}</div>
    </section>}
  </div>;
}
