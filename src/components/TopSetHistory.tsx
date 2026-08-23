import { calculateEstimatedOneRepMax } from '../lib/strength';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';

export type TopSet={weight:number;reps:number;date:string};
type Props={lift:string;unit?:'lb'|'kg';suggestedExercises?:string[];onChoose:(lift:string,set:TopSet)=>void};

export function TopSetHistory({lift,unit='lb',suggestedExercises,onChoose}:Props){
  const {records}=useWorkoutHistory();
  const history=records.filter(record=>record.lift&&record.weight&&record.reps).reduce<Record<string,TopSet[]>>((groups,record)=>{groups[record.lift!]=[...(groups[record.lift!]||[]),{weight:record.weight!,reps:record.reps!,date:record.date}];return groups},{});
  Object.values(history).forEach(items=>items.sort((a,b)=>b.date.localeCompare(a.date)));
  const selectedHistory=history[lift]??[];const exerciseNames=suggestedExercises?.length?suggestedExercises:Object.keys(history);const recentExercises=exerciseNames.filter(exercise=>history[exercise]?.[0]).map(exercise=>({exercise,set:history[exercise][0]}));
  if(!lift&&!recentExercises.length)return null;
  return <div className="top-set-history"><div className="history-heading"><span className="field-caption">{lift?`RECENT ${lift.toUpperCase()} SETS`:suggestedExercises?.length?'EXERCISES FROM THIS WORKOUT':'RECENT EXERCISES'}</span><small>{lift?'Tap a previous result to prefill it.':'Choose an exercise to view its history.'}</small></div><div className="recent-set-row contextual">{(lift?selectedHistory.map(set=>({exercise:lift,set})):recentExercises.slice(0,6)).map(({exercise,set})=><button key={`${exercise}-${set.date}-${set.reps}`} type="button" onClick={()=>onChoose(exercise,set)}><span>{lift?new Date(`${set.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):exercise}</span><b>{set.weight}×{set.reps}</b>{lift&&<small>Calc. max {calculateEstimatedOneRepMax(set.weight,set.reps)} {unit}</small>}</button>)}</div>{lift&&!selectedHistory.length&&<p className="empty-history">No previous sets for this exercise.</p>}</div>;
}
