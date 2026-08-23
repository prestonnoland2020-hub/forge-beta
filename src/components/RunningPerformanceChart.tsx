import { useMemo, useState } from 'react';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import {summarizeCardioDraft, isRunningCardio} from '../lib/cardioSession';

type TimeRange='4w'|'3m'|'6m'|'1y'|'all';
type Mode='equivalent'|'actual';
type Target='mile'|'5k'|'10k'|'half';
type RunEffort={date:string;label:string;distance:number;seconds:number;kind:string};

const targets:Record<Target,{label:string;miles:number}>={mile:{label:'Mile',miles:1},'5k':{label:'5K',miles:3.10686},'10k':{label:'10K',miles:6.21371},half:{label:'Half Marathon',miles:13.1094}};
const rangeDays:Record<TimeRange,number>={'4w':28,'3m':92,'6m':183,'1y':366,all:Infinity};
const formatTime=(seconds:number)=>{const rounded=Math.round(seconds);const hours=Math.floor(rounded/3600);const minutes=Math.floor((rounded%3600)/60);const secs=rounded%60;return hours?`${hours}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`:`${minutes}:${String(secs).padStart(2,'0')}`};
const formatDistance=(miles:number)=>Math.abs(miles-1)<.02?'1 mi':Math.abs(miles-3.10686)<.02?'5K':Math.abs(miles-6.21371)<.02?'10K':`${miles.toFixed(1)} mi`;

export function RunningPerformanceChart({range,rangeLabel}:{range:TimeRange;rangeLabel:string}){
  const {records}=useWorkoutHistory();
  const [target,setTarget]=useState<Target>('5k');
  const [mode,setMode]=useState<Mode>('equivalent');
  const [activePoint,setActivePoint]=useState<number|null>(null);
  const efforts=useMemo<RunEffort[]>(()=>records.flatMap(record=>(record.cardioSessions||[]).filter(session=>isRunningCardio(session)).map(session=>{const totals=summarizeCardioDraft(session);return{date:record.date,label:new Date(`${record.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}),distance:totals.distance,seconds:totals.minutes*60,kind:session.summary}})).filter(effort=>effort.distance>0&&effort.seconds>0),[records]);
  const data=useMemo(()=>{
    const now=Date.now();
    const cutoff=rangeDays[range]===Infinity?-Infinity:now-rangeDays[range]*86400000;
    const targetMiles=targets[target].miles;
    return efforts.filter(effort=>new Date(`${effort.date}T12:00:00`).getTime()>=cutoff)
      .filter(effort=>mode==='equivalent'||Math.abs(effort.distance-targetMiles)/targetMiles<.02)
      .map(effort=>({...effort,value:mode==='actual'?effort.seconds:effort.seconds*Math.pow(targetMiles/effort.distance,1.06)}))
      .sort((a,b)=>a.date.localeCompare(b.date));
  },[efforts,mode,range,target]);
  const values=data.map(point=>point.value);
  const actualMin=values.length?Math.min(...values):0,actualMax=values.length?Math.max(...values):0;
  const padding=Math.max(20,(actualMax-actualMin)*.14);
  const min=Math.max(0,actualMin-padding),max=actualMax+padding,spread=Math.max(60,max-min);
  const plot={left:70,right:18,top:18,bottom:34,width:720,height:280};const plotWidth=plot.width-plot.left-plot.right,plotHeight=plot.height-plot.top-plot.bottom;
  const points=data.map((entry,index)=>({...entry,x:data.length===1?plot.left+plotWidth/2:plot.left+index*(plotWidth/(data.length-1)),y:plot.top+((entry.value-min)/spread)*plotHeight}));
  const ticks=Array.from({length:5},(_,index)=>min+index*(spread/4));
  const labelIndexes=new Set(points.length<5?points.map((_,index)=>index):[0,Math.round((points.length-1)/3),Math.round((points.length-1)*2/3),points.length-1]);
  const focused=activePoint===null?null:points[activePoint];
  const best=data.reduce<(typeof data)[number]|null>((winner,entry)=>!winner||entry.value<winner.value?entry:winner,null);
  const change=data.length>1?data[data.length-1].value-data[0].value:null;
  return <div className="strength-insights strength-progress-layout">
  <section className="card strength-chart progress-chart-card running-performance-card">
    <div className="running-chart-head"><div><span className="eyebrow">RUNNING PERFORMANCE · {rangeLabel.toUpperCase()}</span><h3>{targets[target].label} Time Trend</h3></div><select value={target} onChange={event=>setTarget(event.target.value as Target)} aria-label="Target running distance"><option value="mile">Mile</option><option value="5k">5K</option><option value="10k">10K</option><option value="half">Half Marathon</option></select></div>
    <div className="running-mode" role="group" aria-label="Running time metric"><button className={mode==='equivalent'?'active':''} onClick={()=>setMode('equivalent')}>Equivalent Time</button><button className={mode==='actual'?'active':''} onClick={()=>setMode('actual')}>Actual Results</button></div>
      <div>
        {points.length?<div className="running-line-chart" onMouseLeave={()=>setActivePoint(null)}><svg viewBox={`0 0 ${plot.width} ${plot.height}`} role="img">
          <defs><linearGradient id="runningArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".04"/><stop offset="100%" stopColor="currentColor" stopOpacity=".17"/></linearGradient></defs>
          {ticks.map((tick,index)=>{const y=plot.top+index*(plotHeight/4);return <g className="run-grid-line" key={index}><line x1={plot.left} y1={y} x2={plot.width-plot.right} y2={y}/><text x={plot.left-12} y={y+4} textAnchor="end">{formatTime(tick)}</text></g>})}
          <polygon className="run-chart-area" points={`${points[0].x},${plot.top+plotHeight} ${points.map(point=>`${point.x},${point.y}`).join(' ')} ${points.at(-1)!.x},${plot.top+plotHeight}`}/><polyline className="run-chart-line" points={points.map(point=>`${point.x},${point.y}`).join(' ')} fill="none"/>
          {points.map((point,index)=><g className={activePoint===index?'run-point active':'run-point'} key={`${point.date}-${point.distance}`} onMouseEnter={()=>setActivePoint(index)} onFocus={()=>setActivePoint(index)} tabIndex={0}><circle className="run-hit" cx={point.x} cy={point.y} r="14"/><circle className="run-dot" cx={point.x} cy={point.y} r="5"/></g>)}
          {points.map((point,index)=>labelIndexes.has(index)&&<text className="run-date" key={`date-${point.date}-${index}`} x={point.x} y={plot.height-8} textAnchor={index===0?'start':index===points.length-1?'end':'middle'}>{new Date(`${point.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'})}</text>)}
        </svg>{focused&&<div className="run-tooltip" style={{left:`${focused.x/plot.width*100}%`,top:`${focused.y/plot.height*100}%`}}><span>{focused.label}</span><strong>{formatTime(focused.value)}</strong><small>From {formatDistance(focused.distance)} in {formatTime(focused.seconds)}</small></div>}</div>:<div className="run-empty">No {mode==='actual'?`actual ${targets[target].label}`:'qualifying run'} results in this range. Try Equivalent Time or a wider range.</div>}
        <p className="running-method">{mode==='equivalent'?`Equivalent Time converts logged runs with both distance and duration into a comparable ${targets[target].label} time. Training-run equivalents are context, not race predictions.`:`Actual Results includes only logged runs completed at the selected distance. No conversion is applied.`}</p>
        <details className="running-data"><summary>View source efforts <span>{data.length}</span></summary><div>{data.map(entry=><article key={`${entry.date}-${entry.distance}`}><span>{entry.label}</span><strong>{formatTime(entry.value)}</strong><small>{formatDistance(entry.distance)} · {formatTime(entry.seconds)} · {entry.kind}</small></article>)}</div></details>
      </div>
  </section>
  <section className="card performance-peak-card run-performance-peak"><span className="eyebrow">BEST IN RANGE</span>{best?<><h3>{mode==='actual'?'Actual Result':`Equivalent ${targets[target].label}`}</h3><strong>{formatTime(best.value)}</strong><p>{mode==='actual'?best.kind:`Calculated ${targets[target].label} time`} · {best.label}</p>{change!==null&&<div><span>First to latest</span><b className={change<=0?'improved':'declined'}>{change<=0?'−':'+'}{formatTime(Math.abs(change))}</b></div>}</>:<><h3>No qualifying result</h3><p>Choose a wider range or switch the performance mode.</p></>}</section>
  </div>;
}
