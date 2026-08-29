import { useMemo, useState } from 'react';
import { sameLift } from '../lib/liftAliases';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';

type TimeRange = '4w' | '3m' | '6m' | '1y' | 'all';
type Mode = 'calculated' | 'tested';
type StrengthEntry = { date: string; label: string; weight: number; reps: number };

const rangeDays: Record<TimeRange, number> = { '4w': 28, '3m': 92, '6m': 183, '1y': 366, all: Infinity };

export function StrengthProgressPanel({ range, rangeLabel, onLiftChange }: { range: TimeRange; rangeLabel: string; onLiftChange?:(lift:string)=>void }) {
  const {records}=useWorkoutHistory();
  const {setup}=useProfileSetup();const unit=setup?.units==='Metric'?'kg':'lb';
  const availableLifts=[...new Set(records.map(record=>record.lift).filter((value):value is string=>Boolean(value)))].sort();
  const [lift, setLift] = useState('');const effectiveLift=availableLifts.includes(lift)?lift:(availableLifts[0]||'');
  const [mode, setMode] = useState<Mode>('calculated');
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const entries = useMemo(() => {
    const cutoff = rangeDays[range] === Infinity ? -Infinity : Date.now() - rangeDays[range] * 86400000;
    return records.filter(record=>sameLift(record.lift||'',effectiveLift)&&record.weight&&record.reps).map(record=>({date:record.date,label:new Date(`${record.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),weight:record.weight!,reps:record.reps!} as StrengthEntry))
      .filter(entry => new Date(`${entry.date}T12:00:00`).getTime() >= cutoff)
      .filter(entry => mode === 'calculated' || entry.reps === 1)
      .sort((a,b)=>a.date.localeCompare(b.date))
      .map(entry => ({ ...entry, value: calculateEstimatedOneRepMax(entry.weight, entry.reps) ?? entry.weight }));
  }, [effectiveLift, mode, range,records]);

  const values = entries.map(entry => entry.value);
  const dataMin = values.length ? Math.min(...values) : 0;
  const dataMax = values.length ? Math.max(...values) : 0;
  const padding = Math.max(10, Math.ceil((dataMax - dataMin) * .12));
  const min = Math.floor((dataMin - padding) / 10) * 10;
  const max = Math.ceil((dataMax + padding) / 10) * 10;
  const spread = Math.max(20, max - min);
  const plot = { left: 58, right: 18, top: 18, bottom: 34, width: 720, height: 280 };
  const plotWidth = plot.width - plot.left - plot.right;
  const plotHeight = plot.height - plot.top - plot.bottom;
  const points = entries.map((entry, index) => ({
    ...entry,
    x: entries.length === 1 ? plot.left + plotWidth / 2 : plot.left + index * (plotWidth / (entries.length - 1)),
    y: plot.top + plotHeight - ((entry.value - min) / spread) * plotHeight,
  }));
  const yTicks = Array.from({ length: 5 }, (_, index) => Math.round(max - index * (spread / 4)));
  const labelStep = Math.max(1, Math.ceil(points.length / 5));
  const shownDateIndexes = new Set(points.map((_, index) => index).filter(index => index === 0 || index === points.length - 1 || index % labelStep === 0));
  const focusedPoint = activePoint === null ? null : points[activePoint];
  const best = entries.reduce<(typeof entries)[number] | null>((winner, entry) => !winner || entry.value > winner.value ? entry : winner, null);
  const change = entries.length > 1 ? entries[entries.length - 1].value - entries[0].value : null;

  return <div className="strength-insights strength-progress-layout">
    <section className="card strength-chart progress-chart-card">
      <div className="strength-chart-controls">
        <div><span className="eyebrow">PR PROGRESS · {rangeLabel.toUpperCase()}</span><h3>Comparable performance</h3></div>
        <select className="compact-select" value={effectiveLift} disabled={!availableLifts.length} onChange={event => {setLift(event.target.value);onLiftChange?.(event.target.value)}} aria-label="Exercise">{!availableLifts.length&&<option>No logged lifts</option>}{availableLifts.map(name=><option key={name}>{name}</option>)}</select>
      </div>
      <div className="performance-mode" role="group" aria-label="Performance metric">
        <button className={mode === 'calculated' ? 'active' : ''} onClick={() => setMode('calculated')}>Calculated Max</button>
        <button className={mode === 'tested' ? 'active' : ''} onClick={() => setMode('tested')}>Tested 1RM</button>
      </div>
      {points.length ? <>
        <div className="performance-line-chart" aria-label={`${effectiveLift} ${mode === 'calculated' ? 'calculated max' : 'tested one rep max'} history`} onMouseLeave={() => setActivePoint(null)}>
          <svg viewBox={`0 0 ${plot.width} ${plot.height}`} role="img">
            <defs><linearGradient id="performanceArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".18"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
            {yTicks.map((tick,index) => { const y=plot.top+index*(plotHeight/4); return <g className="chart-grid-line" key={tick}><line x1={plot.left} y1={y} x2={plot.width-plot.right} y2={y}/><text x={plot.left-12} y={y+4} textAnchor="end">{tick}</text></g> })}
            <polygon className="chart-area" points={`${points[0].x},${plot.top+plotHeight} ${points.map(point=>`${point.x},${point.y}`).join(' ')} ${points[points.length-1].x},${plot.top+plotHeight}`} />
            <polyline className="chart-line" points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" />
            {points.map((point,index) => <g className={activePoint===index?'chart-point active':'chart-point'} key={`${point.date}-${point.reps}`} onMouseEnter={()=>setActivePoint(index)} onFocus={()=>setActivePoint(index)} tabIndex={0} role="button" aria-label={`${point.label}: ${point.weight} ${unit} for ${point.reps} reps, ${point.value} ${unit} ${mode === 'tested' ? 'tested one rep max' : 'calculated max'}`}><circle className="point-hit" cx={point.x} cy={point.y} r="14"/><circle className="point-dot" cx={point.x} cy={point.y} r="5"/></g>)}
            {points.map((point,index) => shownDateIndexes.has(index)&&<text className="chart-date" key={`date-${point.date}`} x={point.x} y={plot.height-8} textAnchor={index===0?'start':index===points.length-1?'end':'middle'}>{point.label.replace(', 2026','').replace(', 2025','')}</text>)}
          </svg>
          {focusedPoint&&<div className="chart-tooltip" style={{left:`${(focusedPoint.x/plot.width)*100}%`,top:`${(focusedPoint.y/plot.height)*100}%`}}><span>{focusedPoint.label}</span><strong>{focusedPoint.value} {unit}</strong><small>{focusedPoint.weight} {unit} ×{focusedPoint.reps}</small></div>}
        </div>
        <details className="performance-data"><summary>View data <span>{entries.length} entries</span></summary><div className="performance-records">{entries.map(entry => <div key={`${entry.date}-${entry.reps}`}><span>{entry.label}</span><strong>{entry.value} {unit}</strong><small>{entry.weight} {unit} ×{entry.reps}</small></div>)}</div></details>
      </> : <div className="performance-empty">{effectiveLift?`No ${mode==='tested'?'true 1-rep-max':'top-set'} entries for ${effectiveLift} in ${rangeLabel.toLowerCase()}.`:'Log a strength set to begin your strength trend.'}</div>}
      <p>{mode === 'calculated' ? 'Calculated Max uses the Epley formula on every weighted top set so different rep counts remain comparable.' : 'Tested 1RM includes actual single-rep entries only. Multi-rep estimates are intentionally excluded.'}</p>
    </section>
    <section className="card performance-peak-card">
      <span className="eyebrow">BEST IN RANGE</span>
      {best ? <><h3>{mode === 'tested' ? 'Tested 1RM' : 'Calculated Max'}</h3><strong>{best.value} {unit}</strong><p>{best.weight} {unit} ×{best.reps} · {best.label}</p>{change !== null && <div><span>First to latest</span><b className={change >= 0 ? 'positive-change' : 'negative-change'}>{change > 0 ? '+' : ''}{change} {unit}</b></div>}</> : <><h3>No qualifying entry</h3><p>Choose a wider range or switch the performance mode.</p></>}
    </section>
  </div>;
}
