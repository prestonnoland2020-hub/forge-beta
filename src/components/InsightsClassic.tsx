import { useMemo, useState, type CSSProperties } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { cardioMiles, bestRunPaceMinutesPerMile } from '../lib/cardioSession';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import '../today-picks.css';
import { Icon } from './Icon';

/* Insights rebuilt on the original Forge web app's structure: KPI tiles,
   8-week consistency, weight trend, muscle & cardio frequency, personal
   records, PR progress, PR history. Same order, same density. */

const isoOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
/* isoOf, not toISOString. The date is built at LOCAL noon, and in UTC+13/+14
   local noon is the previous UTC day — so every week bucket in New Zealand was
   labelled a week early and Monday sessions landed in the prior week's bar. */
const weekStartIso = (iso: string) => { const day = new Date(`${iso}T12:00:00`); day.setDate(day.getDate() - ((day.getDay() + 6) % 7)); return isoOf(day); };
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export function InsightsClassic() {
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const unit = setup?.units === 'Metric' ? 'kg' : 'lb';

  /* One range, every card. The 3M/6M/1Y/All chips used to steer only the two
     charts while the tiles kept private windows — KPIs at 30 days, frequency
     at 56 — so the page showed three different time periods at once and none
     of them said so. */
  const [prRange, setPrRange] = useState<'3m' | '6m' | '1y' | 'all'>('3m');
  const rangeDays: Record<'3m' | '6m' | '1y' | 'all', number> = { '3m': 90, '6m': 182, '1y': 365, all: 3650 };
  const rangeCutoffIso = useMemo(() => { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - rangeDays[prRange]); return isoOf(cutoff); }, [prRange]);
  /* ------------------------------------------------ KPI tiles (follow the range) */

  /* --------------------------------------------------- 8-week consistency */
  /* `weekPeak`, `activeWeeks`, `perWeek`, a month-of-body-weight series and a
     month-history table were all computed here and never rendered — the JSX
     for them does not exist. tsconfig has no noUnusedLocals, so it compiled
     silently and ran on every records change for nobody. Removed rather than
     wired up: the sections they fed were never designed, and computing data
     for an absent chart is not a feature in progress, it is work the app does
     for no one. */

  /* --------------------------------------- frequency (follows the range) */

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
  /* The Personal Records card shows the best set INSIDE the selected range;
     the lift picker below keeps the all-time list so no lift disappears from
     the chart dropdown when the window narrows. */

  /* --------------------------------------------------------- PR progress */
  const lifts = useMemo(() => [...bestByLift.keys()].sort(), [bestByLift]);
  const [prLift, setPrLift] = useState('');
  /* 'top' is the default: the weight actually on the bar each session, with
     its reps — what a lifter means by "my top sets over time". The estimated
     max is one tap away. */
  const [prMode, setPrMode] = useState<'top' | '1rm' | 'calc'>('top');
  const [allSessions, setAllSessions] = useState(false);
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
    const byDay = new Map<string, { value: number; reps: number }>();
    records.filter(record => record.date >= rangeCutoffIso).forEach(record => (record.topSets || []).forEach(set => {
      if (set.completed === false || set.lift !== selectedLift || !set.weight) return;
      if (prMode === '1rm' && set.reps !== 1) return;
      const value = prMode === 'calc' ? (set.calculatedMax || calculateEstimatedOneRepMax(set.weight, set.reps) || 0) : set.weight;
      if (!value) return;
      const held = byDay.get(record.date);
      /* The day's heaviest set; at the same weight, the one with more reps. */
      if (!held || value > held.value || (value === held.value && set.reps > held.reps)) byDay.set(record.date, { value, reps: set.reps });
    }));
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, entry]) => ({ date, value: entry.value, label: prMode === 'top' ? `×${entry.reps}` : undefined }));
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
      const value = prMode === 'calc' ? (set.calculatedMax || calculateEstimatedOneRepMax(set.weight, set.reps) || 0) : set.weight;
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

  /* The exact chart renderer from the original app: monotone-cubic
     smoothing through every point (straight when dense), vertical gradient area fill, 2px round
     stroke, 2.4px dots with a haloed endpoint, nice ticks, and a three-date
     strip under a hairline. viewBox 280x130 stretched to 150px tall. */
  const lineChart = (points: Array<{ date: string; value: number; label?: string }>, id: string) => {
    if (points.length < 2) return null;
    const W = 280, H = 130, PL = 30, PR = 5, PT = 8, PB = 8;
    const ts = points.map(point => new Date(`${point.date}T12:00:00`).getTime());
    const minX = Math.min(...ts), maxX = Math.max(...ts);
    const ys = points.map(point => point.value);
    /* A SIX-POUND MOVE IS NOT A MOUNTAIN. Fitting the axis to the data alone
       blew 366→372 lb across the full height of the plot, so a rounding-error
       week read as a breakthrough and a real one read the same. The window
       never closes tighter than 6% of the value being plotted; past that the
       axis fits the data as before. */
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const floorSpan = Math.abs((hi + lo) / 2) * 0.06;
    const rawSpan = Math.max(hi - lo, floorSpan) || 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rawSpan / 3)));
    const norm = rawSpan / 3 / mag;
    const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    const pad = Math.max(0, (rawSpan - (hi - lo)) / 2);
    const niceMin = Math.floor((lo - pad) / step) * step;
    const niceMax = Math.ceil((hi + pad) / step) * step;
    const ticks: number[] = [];
    for (let v = niceMin; v <= niceMax + step * .001; v += step) ticks.push(Math.round(v * 10) / 10);
    const xSpan = (maxX - minX) || 1, ySpan = (niceMax - niceMin) || 1;
    const x = (t: number) => PL + ((t - minX) / xSpan) * (W - PL - PR);
    const y = (value: number) => H - PB - ((value - niceMin) / ySpan) * (H - PT - PB);
    const pts = points.map((point, index) => ({ x: x(ts[index]), y: y(point.value) }));
    const dense = pts.length > 20;
    let lineD = `M ${pts[0].x},${pts[0].y}`;
    if (dense) lineD = 'M ' + pts.map(point => `${point.x},${point.y}`).join(' L ');
    else {
      /* THE LINE GOES THROUGH EVERY DOT. Midpoint smoothing only passed through
         the halfway points between entries, so a dip like 320 sat visibly off
         the curve. Monotone cubic (Fritsch–Carlson) hits every point and never
         overshoots past one, so the line cannot invent a peak that wasn't lifted. */
      const n = pts.length;
      const dx = pts.slice(1).map((point, i) => point.x - pts[i].x || 1e-6);
      const slope = pts.slice(1).map((point, i) => (point.y - pts[i].y) / dx[i]);
      const tangent = pts.map((_, i) => i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
      for (let i = 0; i < n - 1; i++) {
        if (slope[i] === 0) { tangent[i] = 0; tangent[i + 1] = 0; continue; }
        const a = tangent[i] / slope[i], b = tangent[i + 1] / slope[i], h = a * a + b * b;
        if (h > 9) { const t = 3 / Math.sqrt(h); tangent[i] = t * a * slope[i]; tangent[i + 1] = t * b * slope[i]; }
      }
      for (let i = 0; i < n - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1], third = dx[i] / 3;
        lineD += ` C ${p0.x + third},${p0.y + tangent[i] * third} ${p1.x - third},${p1.y - tangent[i + 1] * third} ${p1.x},${p1.y}`;
      }
    }
    const areaD = `${lineD} L ${pts[pts.length - 1].x},${H - PB} L ${pts[0].x},${H - PB} Z`;
    const last = pts[pts.length - 1];
    const mid = minX + (maxX - minX) / 2;
    const dateLabel = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return <>
      {/* Keyed by the series, so switching lift, metric or range redraws
          the line instead of snapping to the new one. Styles and motion:
          .chart-* in brand.css. */}
      <svg key={`${id}-${points.length}-${ts[0]}-${ts[ts.length - 1]}-${points[points.length - 1].value}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block' }} role="img">
        {ticks.map((tick, index) => <g key={index}><line className="chart-grid" x1={PL} y1={y(tick)} x2={W - PR} y2={y(tick)} /><text className="chart-axis" x={PL - 6} y={y(tick) + 3} fontSize="9" textAnchor="end">{step >= 1 ? Math.round(tick) : tick}</text></g>)}
        <path className="chart-area" d={areaD} />
        <path className="chart-line" d={lineD} pathLength={1} />
        {!dense && pts.slice(0, -1).map((point, index) => <circle className="chart-point" key={index} cx={point.x} cy={point.y} r="3" style={{ '--i': index } as CSSProperties} />)}
        {/* Reps over each top set, when there is room to read them. */}
        {pts.length <= 12 && points.map((point, index) => point.label ? <text className="chart-axis chart-reps" key={`r${index}`} x={index === pts.length - 1 ? pts[index].x - 9 : pts[index].x} y={Math.max(PT + 2, pts[index].y - 7)} fontSize="8.5" textAnchor={index === 0 ? 'start' : index === pts.length - 1 ? 'end' : 'middle'}>{point.label}</text> : null)}
        <circle className="chart-halo" cx={last.x} cy={last.y} r="5" />
        <circle className="chart-now" cx={last.x} cy={last.y} r="5" />
      </svg>
      <div className="ic-datebar"><span>{dateLabel(minX)}</span><span>{dateLabel(mid)}</span><span>{dateLabel(maxX)}</span></div>
    </>;
  };

  /* EVERY OTHER ZERO-DATA SCREEN IN FORGE SAYS SOMETHING. History, Goals and
     Plan all have a proper empty card with a way forward; Progress had none —
     a new athlete got six zeros, an "not enough cardio to chart" line and two
     negations, with no heading, no explanation and no route out. It read like
     the page had failed rather than like there was nothing to show yet. */
  if (!records.length) return <div className="insights-classic">
    <section className="card ic-card ic-blank">
      <header className="ic-head"><i /><h3>No progress yet</h3></header>
      <p>Log your first workout and your charts start here.</p>
      <a className="button" href="#/workout">Log today's workout <Icon name="arrow"/></a>
    </section>
  </div>;

  return <div className="insights-classic">
    {lifts.length > 0 && <section className="card ic-card">
      <header className="ic-head"><i /><h3>Lift progress</h3></header>
      <select value={selectedLift} onChange={event => setPrLift(event.target.value)}>{lifts.map(lift => <option key={lift}>{lift}</option>)}</select>
      <div className="ic-toggle" role="group" aria-label="PR metric">{([['top', 'Top set'], ['calc', 'Est. 1RM'], ['1rm', 'True 1RM']] as const).map(([value, label]) => <button type="button" key={value} className={prMode === value ? 'active' : ''} onClick={() => setPrMode(value)}>{label}</button>)}</div>
      <div className="ic-range" role="group" aria-label="Date range">{([['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['all', 'All']] as const).map(([value, label]) => <button type="button" key={value} className={prRange === value ? 'active' : ''} onClick={() => setPrRange(value)}>{label}</button>)}</div>
      {prSeries.length >= 2 ? lineChart(prSeries, 'pr') : <p className="ic-empty">{prMode === '1rm' ? `No true 1-rep-max entries for ${selectedLift} in this range. Try “Estimated 1RM” to include multi-rep sets.` : `Not enough ${selectedLift} sets in this range to chart.`}</p>}
      {prStats.best && prMode !== 'top' && <div className="kpi-grid ic-chart-kpis">
        <div className="kpi-tile"><b>{prStats.best.weight} {unit}</b><span>Weight lifted</span><small>{prStats.best.reps > 1 ? `×${prStats.best.reps} reps · ` : ''}{shortDate(prStats.best.date)}</small></div>
        <div className="kpi-tile gold"><b>{Math.round(prStats.best.value * 10) / 10} {unit}</b><span>{prMode === '1rm' ? '1RM' : 'Estimated 1RM'}</span><small>{shortDate(prStats.best.date)}</small>{prStats.delta !== null && <small className={prStats.delta > 0 ? 'ic-delta up' : prStats.delta < 0 ? 'ic-delta down' : 'ic-delta'}>{prStats.delta === 0 ? 'No change' : `${prStats.delta > 0 ? '+' : ''}${prStats.delta} ${unit}`} · {rangeLabels[prRange]}</small>}</div>
      </div>}
      {/* EVERY TOP SET, AS A LIST. The chart shows the shape; this says the
          numbers, newest first, each against the session before it. */}
      {prMode === 'top' && prSeries.length > 0 && (() => {
        const rows = prSeries.map((point, index) => ({ ...point, change: index ? point.value - prSeries[index - 1].value : null })).reverse();
        const shown = allSessions ? rows : rows.slice(0, 5);
        return <div className="ic-sessions">
          {shown.map(row => <div key={row.date} className="ic-session">
            <span>{new Date(`${row.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <b>{row.value} {unit} {row.label}</b>
            <small className={row.change === null || row.change === 0 ? '' : row.change > 0 ? 'up' : 'down'}>{row.change === null ? 'First' : row.change === 0 ? 'Same' : `${row.change > 0 ? '+' : '−'}${Math.abs(Math.round(row.change * 10) / 10)}`}</small>
          </div>)}
          {rows.length > 5 && <button type="button" className="ic-sessions-more" onClick={() => setAllSessions(value => !value)}>{allSessions ? 'Show less' : `Show all ${rows.length}`}</button>}
        </div>;
      })()}
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

    {/* PROGRESS IS TWO QUESTIONS: are my lifts going up, and is my running.
        The six count tiles, the frequency bars and the PR grid answered
        questions nobody opened this screen to ask; muscle frequency still
        feeds the coach, it just is not drawn here. */}
  </div>;
}
