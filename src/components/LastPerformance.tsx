import { sameLift } from '../lib/liftAliases';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { calculateEstimatedOneRepMax } from '../lib/strength';

export function lastCompletedSet(records:WorkoutRecord[],exercise:string){
  return records.flatMap(record=>record.topSets?.length?record.topSets.filter(set=>set.completed!==false&&sameLift(set.lift,exercise)).map(set=>({date:record.date,weight:set.weight,reps:set.reps})):(sameLift(record.lift||'',exercise)&&record.weight&&record.reps?[{date:record.date,weight:record.weight,reps:record.reps}]:[])).sort((a,b)=>b.date.localeCompare(a.date))[0];
}

export function LastPerformanceBanner({exercise,records,unit,onClose,onUse}:{exercise:string;records:WorkoutRecord[];unit:string;onClose:()=>void;onUse?:(weight:number,reps:number)=>void}){
  const previous=lastCompletedSet(records,exercise);
  return <aside className="last-performance-banner" aria-label={`Last completed ${exercise}`}><div><span className="eyebrow">LAST TOP SET · {exercise}</span>{previous?<><strong>{previous.weight} {unit} × {previous.reps}</strong><small>Calculated max {calculateEstimatedOneRepMax(previous.weight,previous.reps)??previous.weight} {unit} · {new Date(`${previous.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</small></>:<><strong>No completed top set yet</strong><small>This result will establish the exercise baseline.</small></>}</div><div>{previous&&onUse&&<button className="text-button" onClick={()=>onUse(previous.weight,previous.reps)}>Use values</button>}<button className="text-button" onClick={onClose}>Hide</button></div></aside>;
}
