import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';

type TimeRange='4w'|'3m'|'6m'|'1y'|'all';
const rangeDays:Record<TimeRange,number>={'4w':28,'3m':92,'6m':183,'1y':366,all:Infinity};

export function TrainingFrequencySummary({range,rangeLabel}:{range:TimeRange;rangeLabel:string}){
  const {records}=useWorkoutHistory();const cutoff=rangeDays[range]===Infinity?-Infinity:Date.now()-rangeDays[range]*86400000;const visible=records.filter(record=>new Date(`${record.date}T12:00:00`).getTime()>=cutoff);
  const muscles=Object.entries(visible.reduce<Record<string,number>>((counts,record)=>{[...new Set(record.muscles.filter(muscle=>muscle!=='Cardio'))].forEach(muscle=>counts[muscle]=(counts[muscle]||0)+1);return counts},{})).sort((a,b)=>b[1]-a[1]);
  const cardio=Object.entries(visible.reduce<Record<string,number>>((counts,record)=>{(record.cardioSessions||[]).forEach(session=>{const activity=session.structure==='circuit'?'Circuit':session.activity;counts[activity]=(counts[activity]||0)+1});return counts},{})).sort((a,b)=>b[1]-a[1]);
  const bars=(rows:[string,number][],empty:string)=>{const max=Math.max(1,...rows.map(([,count])=>count));return rows.length?<div className="compact-frequency-bars">{rows.map(([name,count])=><div key={name}><span>{name}</span><i><b style={{width:`${Math.max(8,count/max*100)}%`}}/></i><strong>{count}</strong></div>)}</div>:<p className="compact-frequency-empty">{empty}</p>};
  return <section className="compact-frequency-section"><header><span className="eyebrow">TRAINING FREQUENCY · {rangeLabel.toUpperCase()}</span><h2>What you trained</h2></header><div className="compact-frequency-grid"><article className="card"><div><span className="eyebrow">STRENGTH</span><h3>Muscle groups</h3><small>{visible.filter(record=>record.muscles.some(muscle=>muscle!=='Cardio')).length} strength sessions</small></div>{bars(muscles,'No muscle-group sessions in this range.')}</article><article className="card"><div><span className="eyebrow">ENDURANCE</span><h3>Cardio types</h3><small>{cardio.reduce((sum,[,count])=>sum+count,0)} cardio entries</small></div>{bars(cardio,'No cardio entries in this range.')}</article></div></section>;
}
