import { RunningPerformanceChart } from './RunningPerformanceChart';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { cardioMiles, enduranceGroup, summarizeCardioDraft , formatCardioSummary} from '../lib/cardioSession';

type TimeRange = '4w' | '3m' | '6m' | '1y' | 'all';

const rangeDays:Record<TimeRange,number>={'4w':28,'3m':92,'6m':183,'1y':366,all:Infinity};
const formatDuration=(minutes:number)=>`${Math.floor(minutes/60)?`${Math.floor(minutes/60)}h `:''}${minutes%60}m`;

export function CardioInsightsPanel({range,rangeLabel,frequencyOnly=false,hideFrequency=false}:{range:TimeRange;rangeLabel:string;frequencyOnly?:boolean;hideFrequency?:boolean}){
  const {records}=useWorkoutHistory();
  const loggedSessions=records.flatMap(record=>(record.cardioSessions||[]).map(draft=>{const totals=summarizeCardioDraft(draft);return{date:record.date,activity:enduranceGroup(draft),minutes:totals.minutes,recoveryMinutes:totals.recoveryMinutes,miles:cardioMiles(draft)||undefined,detail:formatCardioSummary(draft)}}));
  const sessions=loggedSessions;
  const now=Date.now();
  const cutoff=rangeDays[range]===Infinity?-Infinity:now-rangeDays[range]*86400000;
  const visible=sessions.filter(session=>new Date(`${session.date}T12:00:00`).getTime()>=cutoff);
  const totalMinutes=visible.reduce((sum,session)=>sum+session.minutes,0);
  const recoveryMinutes=visible.reduce((sum,session)=>sum+(session.recoveryMinutes||0),0);
  const runMiles=visible.reduce((sum,session)=>sum+(session.miles??0),0);
  const activityCounts=Object.entries(visible.reduce<Record<string,number>>((counts,session)=>({...counts,[session.activity]:(counts[session.activity]??0)+1}),{})).sort((a,b)=>b[1]-a[1]);
  const maxCount=Math.max(1,...activityCounts.map(([,count])=>count));
  const mostFrequent=activityCounts[0];
  return <div className="cardio-insights-view insight-domain-stack">
    {!frequencyOnly&&<RunningPerformanceChart range={range} rangeLabel={rangeLabel}/>}
    {!hideFrequency&&<>
    <section className="frequency-kpis cardio-frequency-kpis">
      <div><span>CARDIO SESSIONS</span><strong>{visible.length}</strong><small>{rangeLabel}</small></div>
      <div><span>WORK / RECOVERY</span><strong>{formatDuration(Math.round(Math.max(0,totalMinutes-recoveryMinutes)))} / {formatDuration(Math.round(recoveryMinutes))}</strong><small>Active recovery kept separate</small></div>
      <div><span>RUN MILES</span><strong>{runMiles.toFixed(1)}</strong><small>Work + active-recovery distance</small></div>
    </section>
    <div className="frequency-layout cardio-frequency-layout">
      <section className="card frequency-chart-card cardio-frequency-card">
        <div className="frequency-title"><div><span className="eyebrow">{rangeLabel.toUpperCase()}</span><h3>Cardio Type Frequency</h3></div><small>Logged cardio sessions</small></div>
        <div className="frequency-bars cardio-frequency-bars">{activityCounts.map(([activity,count])=><div className="frequency-row" key={activity}><strong>{activity}</strong><div className="frequency-track"><i style={{width:`${Math.max(7,count/maxCount*100)}%`}}/></div><b>{count}</b><small>{count} logged session{count===1?'':'s'}</small></div>)}</div>
        {!activityCounts.length&&<p className="cardio-empty">No cardio sessions in this range.</p>}
        <details className="cardio-session-data"><summary>View recent sessions <span>{visible.length}</span></summary><div>{visible.slice().reverse().map(session=><article key={`${session.date}-${session.activity}`}><time>{new Date(`${session.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'})}</time><strong>{session.activity}</strong><span>{session.detail}</span><b>{session.minutes} min</b></article>)}</div></details>
      </section>
      <aside className="card frequency-coach-card cardio-frequency-coach"><span className="eyebrow">AI COACH INTERPRETATION</span><h3>{mostFrequent?`${mostFrequent[0]} is your primary cardio mode`:'Log cardio to see your mix'}</h3><p>{mostFrequent?`${mostFrequent[0]} accounts for ${Math.round(mostFrequent[1]/Math.max(1,visible.length)*100)}% of your cardio sessions in this period. Forge considers duration, intensity, goals, and recovery—not frequency alone—when evaluating aerobic balance.`:'Cardio frequency becomes useful once sessions are logged.'}</p><div className="frequency-rule"><span>COUNTING RULE</span><small>Each saved cardio entry counts once by activity type. Distance and duration remain separate performance measures.</small></div></aside>
    </div></>}
  </div>;
}
