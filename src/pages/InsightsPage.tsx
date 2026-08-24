import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageIntro } from '../components/AppShell';
import { ProgressOverviewChart } from '../components/ProgressOverviewChart';
import { TrainingFrequencySummary } from '../components/TrainingFrequencySummary';

export function InsightsPage({embedded=false}:{embedded?:boolean}={}){
  type TimeRange='4w'|'3m'|'6m'|'1y'|'all';const [params,setParams]=useSearchParams();const initialRange=(params.get('range') as TimeRange)??'3m';const [range,setRangeState]=useState<TimeRange>(['4w','3m','6m','1y','all'].includes(initialRange)?initialRange:'3m');const setRange=(next:TimeRange)=>{setRangeState(next);setParams({range:next})};const labels:Record<TimeRange,string>={'4w':'Last 4 weeks','3m':'Last 3 months','6m':'Last 6 months','1y':'Last 12 months',all:'All time'};
  return <div className="stack-xl insights-pro">{!embedded&&<PageIntro eyebrow="INSIGHTS" title="See what is changing" copy="Completed workouts, comparable measurements, and training frequency in one place."/>}
    <div className="insights-range-bar"><div><span className="field-caption">TIME RANGE</span><strong>{labels[range]}</strong></div><div className="range-options" role="group" aria-label="Insights time range">{([['4w','4W'],['3m','3M'],['6m','6M'],['1y','1Y'],['all','All']] as [TimeRange,string][]).map(([value,label])=><button type="button" className={range===value?'active':''} aria-pressed={range===value} onClick={()=>setRange(value)} key={value}>{label}</button>)}</div></div>
    <ProgressOverviewChart range={range} rangeLabel={labels[range]}/>
    <TrainingFrequencySummary range={range} rangeLabel={labels[range]}/>
  </div>;
}
