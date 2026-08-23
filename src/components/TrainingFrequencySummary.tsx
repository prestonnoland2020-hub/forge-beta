import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { trainedMuscles } from '../lib/muscleGroups';
import { cardioMiles, enduranceGroup } from '../lib/cardioSession';

type TimeRange='4w'|'3m'|'6m'|'1y'|'all';
const rangeDays:Record<TimeRange,number>={'4w':28,'3m':92,'6m':183,'1y':366,all:Infinity};
const weekKey=(date:string)=>{const day=new Date(`${date}T12:00:00`);const monday=new Date(day);monday.setDate(day.getDate()-((day.getDay()+6)%7));return `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,'0')}-${String(monday.getDate()).padStart(2,'0')}`};
const weekLabel=(iso:string)=>new Date(`${iso}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'});
const weekSpan=(iso:string)=>new Date(`${iso}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});

export function TrainingFrequencySummary({range,rangeLabel}:{range:TimeRange;rangeLabel:string}){
  const {records}=useWorkoutHistory();
  const cutoff=rangeDays[range]===Infinity?-Infinity:Date.now()-rangeDays[range]*86400000;
  const visible=records.filter(record=>new Date(`${record.date}T12:00:00`).getTime()>=cutoff);

  const muscles=Object.entries(visible.reduce<Record<string,number>>((counts,record)=>{trainedMuscles(record.muscles).forEach(muscle=>{counts[muscle]=(counts[muscle]||0)+1});return counts},{})).sort((a,b)=>b[1]-a[1]);

  // Running vs other endurance only. "Base", "Easy", "Speed Run" and "Long Run"
  // are run *intensities*, not different activities, so they never belonged here
  // as separate categories.
  const endurance=Object.entries(visible.reduce<Record<string,number>>((counts,record)=>{(record.cardioSessions||[]).forEach(session=>{const group=enduranceGroup(session);counts[group]=(counts[group]||0)+1});return counts},{})).sort((a,b)=>b[1]-a[1]);

  // Weekly mileage — the number an endurance athlete actually steers by.
  const weeks=new Map<string,number>();
  visible.forEach(record=>{const miles=(record.cardioSessions||[]).reduce((sum,session)=>sum+cardioMiles(session),0);if(miles>0){const key=weekKey(record.date);weeks.set(key,(weeks.get(key)||0)+miles)}});
  const weekRows=[...weeks.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-12);
  const peakWeek=Math.max(1,...weekRows.map(([,miles])=>miles));
  const totalMiles=weekRows.reduce((sum,[,miles])=>sum+miles,0);
  const averageMiles=weekRows.length?totalMiles/weekRows.length:0;

  const bars=(rows:[string,number][],empty:string)=>{
    const max=Math.max(1,...rows.map(([,count])=>count));
    return rows.length?<div className="compact-frequency-bars">{rows.map(([name,count])=><div key={name}><span>{name}</span><i><b style={{width:`${Math.max(8,count/max*100)}%`}}/></i><strong>{count}</strong></div>)}</div>:<p className="compact-frequency-empty">{empty}</p>;
  };

  return <section className="compact-frequency-section">
    <header><span className="eyebrow">TRAINING FREQUENCY · {rangeLabel.toUpperCase()}</span><h2>What you trained</h2></header>
    <div className="compact-frequency-grid">
      <article className="card"><div><span className="eyebrow">STRENGTH</span><h3>Muscle groups</h3><small>{visible.filter(record=>trainedMuscles(record.muscles).length>0).length} strength sessions</small></div>{bars(muscles,'No muscle-group sessions in this range.')}</article>
      <article className="card"><div><span className="eyebrow">ENDURANCE</span><h3>Running vs other</h3><small>{endurance.reduce((sum,[,count])=>sum+count,0)} endurance entries</small></div>{bars(endurance,'No endurance entries in this range.')}</article>
    </div>
    <article className="card weekly-mileage-card">
      <div><span className="eyebrow">ENDURANCE</span><h3>Weekly mileage</h3><small>{weekRows.length?`${averageMiles.toFixed(1)} mi average · ${peakWeek.toFixed(1)} mi peak week`:'Log a run with a distance to start this chart.'}</small></div>
      {weekRows.length>0&&<>
        <div className="weekly-mileage-bars" role="img" aria-label={`Weekly mileage across ${weekRows.length} weeks, averaging ${averageMiles.toFixed(1)} miles`}>
          {weekRows.map(([week,miles])=><div key={week}><b>{miles.toFixed(1)}</b><i style={{height:`${Math.max(4,miles/peakWeek*100)}%`}}/><span>{weekLabel(week)}</span></div>)}
        </div>
        <p className="weekly-mileage-note">{weekSpan(weekRows[0][0])} – {weekSpan(weekRows[weekRows.length-1][0])} · weeks begin Monday</p>
      </>}
    </article>
  </section>;
}
