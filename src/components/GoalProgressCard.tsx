import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreatedGoal } from './GoalBuilder';
import type { GoalRoadmap } from '../lib/goalPlanEngine';
import { useWorkoutHistory, type WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import { cardioMiles, summarizeCardioDraft } from '../lib/cardioSession';
import { clockToSeconds, formatGoalTarget } from '../lib/time';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { calculateEstimatedOneRepMax } from '../lib/strength';
import { requestForgeCoach } from '../features/training/coachService';
import { predictRaceFromLegacyMethod } from '../lib/cardioPrediction';

type GoalEvidence = { date: string; value: number; label: string };
type GoalCoachTurn = { question: string; answer: string; source: 'ai' | 'local' };
type CachedAssessment = { createdAt: number; fingerprint: string; estimate: { seconds: number; confidence: string; reason: string }; error?: string };
type StrengthForecast = { predicted: number; low: number; high: number; weeklyRate: number; confidence: 'Low' | 'Medium' | 'High'; reason: string };
const goalCoachStorageKey = (goal: CreatedGoal) => `forge-goal-coach-v1:${goal.type}:${goal.title}:${goal.date}`;
const goalAssessmentStorageKey = (goal: CreatedGoal) => `forge-goal-assessment-v1:${goal.type}:${goal.title}:${goal.date}`;
const assessmentCacheAgeMs = 24 * 60 * 60 * 1000;
const loadGoalCoachTurns = (key: string): GoalCoachTurn[] => { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } };

const numeric = (value?: string) => Number(String(value ?? '').replace(/[^0-9.]/g, '')) || 0;
const formatClock = (seconds: number, hoursFirst = false) => {
  const rounded = Math.round(seconds);
  if (hoursFirst || rounded >= 3600) {
    const hours = Math.floor(rounded / 3600);
    const minutes = Math.floor((rounded % 3600) / 60);
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(rounded % 60).padStart(2, '0')}`;
  }
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
};
const formatDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const expectedRunMiles = (goal: CreatedGoal) => {
  if (goal.eventDistance) {
    const distance = Number(goal.eventDistance);
    return goal.eventDistanceUnit?.toLowerCase().startsWith('kilo') ? distance * 0.621371 : distance;
  }
  const name = `${goal.exercise || ''} ${goal.title}`.toLowerCase();
  if (name.includes('half marathon')) return 13.1094;
  if (name.includes('marathon')) return 26.2188;
  if (name.includes('10k')) return 6.21371;
  if (name.includes('5k')) return 3.10686;
  const namedMiles=name.match(/\b(\d+(?:\.\d+)?)\s*miles?\b/);
  if(namedMiles)return Number(namedMiles[1]);
  if (/\b1\s*mile|\bmile\b/.test(name)) return 1;
  return null;
};
const best = (items: GoalEvidence[], lowerIsBetter: boolean) => items.reduce<GoalEvidence | undefined>((winner, item) => !winner || (lowerIsBetter ? item.value < winner.value : item.value > winner.value) ? item : winner, undefined);
const distanceInMiles=(distance:number,unit:unknown)=>String(unit||'miles').toLowerCase().startsWith('kilo')?distance*0.621371:distance;
const median=(values:number[])=>{const sorted=[...values].sort((a,b)=>a-b);if(!sorted.length)return 0;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2};
const strongestPerDay=(items:GoalEvidence[],lowerIsBetter=false)=>[...items.reduce<Map<string,GoalEvidence>>((days,item)=>{const existing=days.get(item.date);if(!existing||(lowerIsBetter?item.value<existing.value:item.value>existing.value))days.set(item.date,item);return days},new Map()).values()].sort((a,b)=>a.date.localeCompare(b.date));
const buildStrengthForecast=(evidence:GoalEvidence[],currentEstimate:number,deadline:string):StrengthForecast|null=>{
  if(!currentEstimate)return null;
  const dated=strongestPerDay(evidence).filter(item=>item.date&&item.value>0);
  const latestDate=dated.at(-1)?.date;
  if(!latestDate)return{predicted:currentEstimate,low:currentEstimate,high:currentEstimate,weeklyRate:0,confidence:'Low',reason:'One comparable top set establishes the estimate; more completed exposures are needed for a trend.'};
  const latestMs=new Date(`${latestDate}T12:00:00`).getTime();
  const recent=dated.filter(item=>latestMs-new Date(`${item.date}T12:00:00`).getTime()<=120*86400000).slice(-8);
  const slopes:number[]=[];
  recent.forEach((left,leftIndex)=>recent.slice(leftIndex+1).forEach(right=>{const weeks=(new Date(`${right.date}T12:00:00`).getTime()-new Date(`${left.date}T12:00:00`).getTime())/604800000;if(weeks>=.5)slopes.push((right.value-left.value)/weeks)}));
  const rawWeeklyRate=median(slopes);
  const lastThree=recent.slice(-3);
  const confirmedDecline=lastThree.length===3&&lastThree.every((item,index)=>index===0||item.value<lastThree[index-1].value)&&lastThree.at(-1)!.value<Math.max(...recent.map(item=>item.value))*.95;
  const evidenceWeeklyRate=rawWeeklyRate<0&&!confirmedDecline?0:rawWeeklyRate;
  const cappedWeeklyRate=Math.max(-currentEstimate*.004,Math.min(currentEstimate*.006,evidenceWeeklyRate));
  const deadlineMs=new Date(`${deadline}T12:00:00`).getTime();
  const weeksRemaining=Math.max(0,(deadlineMs-Date.now())/604800000);
  const central=Math.max(0,currentEstimate+cappedWeeklyRate*weeksRemaining);
  const predicted=!confirmedDecline?Math.max(currentEstimate,central):central;
  const sampleConfidence:StrengthForecast['confidence']=recent.length>=6?'High':recent.length>=3?'Medium':'Low';
  const uncertainty=currentEstimate*(sampleConfidence==='High'?.04:sampleConfidence==='Medium'?.07:.1);
  const low=!confirmedDecline?currentEstimate:Math.max(0,predicted-uncertainty);
  const high=Math.max(predicted,predicted+uncertainty);
  const reason=recent.length<3?'More comparable top sets are needed before Forge calls this a trend.':confirmedDecline?'Three comparable period-best estimates declined by more than 5%, so Forge is showing a cautious regression.':cappedWeeklyRate>0?'Recent comparable top sets support a guarded improvement rate; extreme extrapolation is capped.':'Normal top-set variation does not prove lost strength, so Forge holds the best recent estimate instead of projecting a decline.';
  return{predicted,low,high,weeklyRate:cappedWeeklyRate,confidence:sampleConfidence,reason};
};
function CardioGoalChart({efforts,target,assessment,event,miles}:{efforts:GoalEvidence[];target:number;assessment:number;event:string;miles:number|null}){
  const focusedMile=miles!==null&&Math.abs(miles-1)<.01;
  const displayedEfforts=focusedMile?efforts.filter(item=>Math.abs(item.value-target)<=90):efforts;
  const values=[target,assessment,...displayedEfforts.map(item=>item.value)].filter(value=>value>0);
  if(!displayedEfforts.length&&!assessment)return <section className="card cardio-goal-chart"><header><div><span className="eyebrow">VERIFIED EFFORT TREND</span><h3>{event} performance</h3></div></header><p>No recent exact-distance hard efforts or AI assessment are available for this graph.</p></section>;
  const width=720,height=280,left=70,right=18,top=20,bottom=38,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const min=Math.min(...values),max=Math.max(...values),padding=Math.max(12,(max-min)*.15),low=Math.max(0,min-padding),high=max+padding,spread=Math.max(30,high-low);
  const x=(index:number)=>displayedEfforts.length===1?left+plotWidth/2:left+index*(plotWidth/(displayedEfforts.length-1));
  const y=(seconds:number)=>top+((seconds-low)/spread)*plotHeight;
  const ticks=Array.from({length:5},(_,index)=>low+index*spread/4);
  const points=displayedEfforts.map((item,index)=>({...item,x:x(index),y:y(item.value)}));
  return <section className="card cardio-goal-chart"><header><div><span className="eyebrow">VERIFIED EFFORT TREND</span><h3>{event} performance</h3></div><small>Faster times appear higher</small></header><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${event} exact-distance performance trend`}>{ticks.map((tick,index)=><g className="cardio-goal-grid" key={index}><line x1={left} y1={y(tick)} x2={width-right} y2={y(tick)}/><text x={left-12} y={y(tick)+4} textAnchor="end">{formatClock(tick)}</text></g>)}<line className="cardio-goal-target" x1={left} x2={width-right} y1={y(target)} y2={y(target)}/>{assessment>0&&<circle className="cardio-goal-ai-marker" cx={width-right} cy={y(assessment)} r="7"/>}<polyline className="cardio-goal-actual" points={points.map(point=>`${point.x},${point.y}`).join(' ')} fill="none"/>{points.map((point,index)=><g className="cardio-goal-point" key={`${point.date}-${index}`}><circle cx={point.x} cy={point.y} r="5"/><title>{formatDate(point.date)} · {formatClock(point.value)} · {point.label}</title></g>)}{points.map((point,index)=>(index===0||index===points.length-1||index%Math.max(1,Math.ceil(points.length/4))===0)&&<text className="cardio-goal-date" x={point.x} y={height-9} textAnchor={index===0?'start':index===points.length-1?'end':'middle'} key={`date-${point.date}`}>{new Date(`${point.date}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</text>)}<text className="cardio-goal-line-label target" x={width-right-4} y={Math.max(14,y(target)-7)} textAnchor="end">TARGET {formatClock(target)}</text>{assessment>0&&<text className="cardio-goal-line-label ai" x={width-right-12} y={Math.max(14,y(assessment)-10)} textAnchor="end">ASSESSMENT {formatClock(assessment)}</text>}</svg><footer><span>Exact-distance efforts · faster is higher</span></footer></section>;
}

export function GoalProgressCard({ goal, roadmap }: { goal: CreatedGoal; roadmap: GoalRoadmap }) {
  const coachKey=goalCoachStorageKey(goal);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachSource, setCoachSource] = useState<'ai' | 'local' | null>(null);
  const [coachTurns,setCoachTurns]=useState<GoalCoachTurn[]>(()=>loadGoalCoachTurns(coachKey));
  const [aiEstimate,setAiEstimate]=useState<{seconds:number;confidence:string;reason:string}|null>(null);
  const [aiEstimateLoading,setAiEstimateLoading]=useState(false);
  const [aiEstimateError,setAiEstimateError]=useState('');
  const { records } = useWorkoutHistory();
  const { setup } = useProfileSetup();
  const weightUnit = setup?.units === 'Metric' ? 'kg' : 'lb';
  const goalText = `${goal.exercise || ''} ${goal.title}`.toLowerCase();
  const isHyrox = goalText.includes('hyrox');
  const hoursFirst = String(goal.unit).toLowerCase().includes('hh:mm:ss') || isHyrox;
  const timeGoal = goal.type === 'Endurance' && (String(goal.metric).toLowerCase().includes('time') || String(goal.unit).includes(':'));
  const expectedMiles = isHyrox ? null : expectedRunMiles(goal);
  const target = timeGoal ? clockToSeconds(goal.target, hoursFirst) : numeric(goal.target);
  const entered = timeGoal ? clockToSeconds(goal.current || '', hoursFirst) : numeric(goal.current);
  const lowerIsBetter = timeGoal || (goal.type === 'Body Composition' && target < entered);
  const recentCutoff=new Date();recentCutoff.setDate(recentCutoff.getDate()-120);const recentCutoffIso=recentCutoff.toISOString().slice(0,10);
  useEffect(()=>{setQuestion('');setAnswer('');setCoachSource(null);setCoachTurns(loadGoalCoachTurns(coachKey))},[coachKey]);

  let currentEvidence: GoalEvidence | undefined;
  let calculatedEvidence: GoalEvidence | undefined;
  const trajectoryEvidence: GoalEvidence[] = [];
  const demonstratedTrajectory: GoalEvidence[] = [];

  if (goal.type === 'Strength') {
    const matchingSets=records.flatMap(record=>{const topSets=(record.topSets||[]).filter(set=>set.completed!==false&&set.lift===(goal.exercise||'')&&set.weight>0&&set.reps>0);if(topSets.length)return topSets.map(set=>({date:record.date,weight:set.weight,reps:set.reps,calculatedMax:set.calculatedMax}));return record.lift===(goal.exercise||'')&&record.weight&&record.reps?[{date:record.date,weight:record.weight,reps:record.reps,calculatedMax:record.calculatedMax}]:[]});
    matchingSets.forEach(set=>{trajectoryEvidence.push({date:set.date,value:set.calculatedMax||calculateEstimatedOneRepMax(set.weight,set.reps)||set.weight,label:`Calculated from ${set.weight} ${weightUnit} × ${set.reps}`});if(set.reps===1)demonstratedTrajectory.push({date:set.date,value:set.weight,label:`Real 1RM · ${set.weight} ${weightUnit}`})});
    const loadRecord=matchingSets.filter(set=>set.reps===1).reduce<(typeof matchingSets)[number]|undefined>((winner,set)=>!winner||set.weight>winner.weight?set:winner,undefined);
    const calculatedRecord=matchingSets.reduce<(typeof matchingSets)[number]|undefined>((winner,set)=>{const value=set.calculatedMax||calculateEstimatedOneRepMax(set.weight,set.reps)||set.weight;const winnerValue=winner&&(winner.calculatedMax||calculateEstimatedOneRepMax(winner.weight,winner.reps)||winner.weight);return!winner||value>(winnerValue||0)?set:winner},undefined);
    const demonstrated: GoalEvidence[] = [];
    if (entered) demonstrated.push({ date: '', value: entered, label: 'Starting Real 1RM you entered' });
    if (loadRecord?.weight) demonstrated.push({ date: loadRecord.date, value: loadRecord.weight, label: `Real 1RM · ${loadRecord.weight} ${weightUnit}` });
    currentEvidence = best(demonstrated, false);
    if (calculatedRecord?.weight && calculatedRecord.reps) {
      calculatedEvidence = { date: calculatedRecord.date, value: calculatedRecord.calculatedMax || calculateEstimatedOneRepMax(calculatedRecord.weight, calculatedRecord.reps) || calculatedRecord.weight, label: `From ${calculatedRecord.weight} ${weightUnit} × ${calculatedRecord.reps}` };
    }
  } else if (goal.type === 'Body Composition') {
    records.filter(record => record.bodyWeight).forEach(record => {const point={ date: record.date, value: record.bodyWeight!, label: 'Body-weight check-in' };trajectoryEvidence.push(point);demonstratedTrajectory.push(point)});
    const latest = [...records].reverse().find(record => record.bodyWeight);
    currentEvidence = latest?.bodyWeight ? { date: latest.date, value: latest.bodyWeight, label: 'Body-weight check-in' } : entered ? { date: '', value: entered, label: 'Starting result you entered' } : undefined;
  } else if (goal.type === 'Endurance') {
    const demonstrated: GoalEvidence[] = entered ? [{ date: '', value: entered, label: 'Starting result you entered' }] : [];
    const projections: GoalEvidence[] = [];
    records.forEach(record => (record.cardioSessions || []).forEach(session => {
      if(record.date<recentCutoffIso)return;
      const totals = summarizeCardioDraft(session);
      if (!totals.minutes) return;
      if (isHyrox) {
        const hyroxSpecific = session.structure === 'circuit' && /hyrox/i.test(session.summary);
        if (hyroxSpecific) demonstrated.push({ date: record.date, value: totals.minutes * 60, label: 'Completed HYROX simulation' });
        return;
      }
      const runMiles=cardioMiles(session)||distanceInMiles(totals.distance,session.prescription.distanceUnit);
      const effortText=`${session.activity} ${session.summary}`.toLowerCase();
      const recoveryEffort=/\beasy\b|recovery|warm.?up|cool.?down|walk|zone\s*[12]|conversational/.test(effortText);
      const looksLikeRun=/run|jog|walk/i.test(session.activity)||/\bmi(?:le|les)?\b/i.test(session.summary)||runMiles>0;
      if (expectedMiles === null || !looksLikeRun || (session.structure !== 'steady' && session.structure !== 'custom') || !runMiles) return;
      const totalSeconds = totals.minutes * 60;
      const exact = Math.abs(runMiles - expectedMiles) <= Math.max(0.03, expectedMiles * 0.01);
      if (exact&&!recoveryEffort){const actual={ date: record.date, value: totalSeconds, label: `Exact-distance ${goal.exercise || 'event'} effort` };demonstrated.push(actual);demonstratedTrajectory.push(actual);trajectoryEvidence.push(actual)}
    }));
    currentEvidence = best(demonstrated, true);
    calculatedEvidence = best(projections, true);
  }

  const datedTrajectory=strongestPerDay(trajectoryEvidence.filter(item=>item.date&&item.value>0),lowerIsBetter);
  const datedDemonstrated=strongestPerDay(demonstratedTrajectory.filter(item=>item.date&&item.value>0),lowerIsBetter);
  /* ONE progress series: best result per day across calculated and real-1RM
     evidence, windowed to the last six months so years-old history stops
     crushing the recent trend. */
  const mergedProgress=strongestPerDay([...trajectoryEvidence,...demonstratedTrajectory].filter(item=>item.date&&item.value>0),lowerIsBetter);
  const windowStartMs=Date.now()-182*86400000;
  const recentProgress=mergedProgress.filter(item=>new Date(`${item.date}T12:00:00`).getTime()>=windowStartMs);
  const shownProgress=recentProgress.length>=3?recentProgress:mergedProgress.slice(-6);
  const aiEvidenceKey=JSON.stringify(datedDemonstrated.map(item=>[item.date,Math.round(item.value)]));
  const aiEvidence=useMemo(()=>JSON.parse(aiEvidenceKey) as Array<[string,number]>,[aiEvidenceKey]);
  const legacyPrediction=useMemo(()=>goal.type==='Endurance'&&expectedMiles?predictRaceFromLegacyMethod(records,expectedMiles):null,[goal.type,expectedMiles,records]);
  useEffect(() => {
    if (goal.type !== 'Endurance' || !expectedMiles) {
      setAiEstimate(null); setAiEstimateError(''); return;
    }
    if (!legacyPrediction) {
      setAiEstimate(null);
      setAiEstimateError('Forge needs at least three recent two-week running periods for the legacy race assessment.');
      return;
    }
    const assessmentFingerprint=JSON.stringify([Math.round(legacyPrediction.seconds),legacyPrediction.supportingRuns,legacyPrediction.recentRunMiles,legacyPrediction.recentRunDays,aiEvidence]);
    const cacheKey = goalAssessmentStorageKey(goal);
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null') as CachedAssessment | null;
      if (cached && cached.fingerprint===assessmentFingerprint && Date.now() - cached.createdAt < assessmentCacheAgeMs) {
        setAiEstimate(cached.estimate); setAiEstimateError(cached.error || ''); setAiEstimateLoading(false); return;
      }
    } catch { /* A malformed old cache is safely replaced. */ }
    let active = true;
    const baseEstimate: CachedAssessment['estimate'] = { seconds: legacyPrediction.seconds, confidence: legacyPrediction.confidence, reason: legacyPrediction.reason };
    setAiEstimate(baseEstimate); setAiEstimateLoading(true); setAiEstimateError('');
    const save = (estimate: CachedAssessment['estimate'], error = '') => localStorage.setItem(cacheKey, JSON.stringify({ createdAt: Date.now(), fingerprint:assessmentFingerprint, estimate, error }));
    const recentTraining = records.filter(record => record.date >= recentCutoffIso).slice(0, 60).map(record => ({ date: record.date, effort: record.effort, notes: record.notes, cardio: (record.cardioSessions || []).map(session => ({ activity: session.activity, summary: session.summary, totals: summarizeCardioDraft(session) })) }));
    void requestForgeCoach({ scope: 'goal', question: 'Review this legacy race-model assessment. Do not change its number or invent a new performance. Return exactly: CONFIDENCE=<low|medium|high>; REASON=<one short sentence naming the most important training-context qualifier>.', context: { event: goal.exercise || goal.title, eventMiles: expectedMiles, targetSeconds: target, legacyAssessment: { seconds: legacyPrediction.seconds, confidence: legacyPrediction.confidence, method: '180-day window; continuous runs only; 80–125% goal-distance filter; Riegel 1.06 distance adjustment; fastest qualifying result', supportingPeriods: legacyPrediction.supportingRuns, recentRunMiles: legacyPrediction.recentRunMiles, recentRunDays: legacyPrediction.recentRunDays }, exactNonRecoveryEfforts: aiEvidence.map(([date, seconds]) => ({ date, seconds })), recentTraining, rules: { legacyMethodControlsTheNumber: true, assessmentIsNotActual: true, noInventedData: true } } }, '').then(response => {
      if (!active) return;
      if (response.source !== 'ai') { const error = response.error || 'AI review is unavailable; the legacy assessment is still shown.'; setAiEstimateError(error); save(baseEstimate, error); return; }
      const match = response.answer.match(/CONFIDENCE=(low|medium|high);\s*REASON=(.+)/i);
      if (match) {
        const estimate: CachedAssessment['estimate'] = { seconds: legacyPrediction.seconds, confidence: match[1].toLowerCase(), reason: match[2].trim() };
        setAiEstimate(estimate); save(estimate);
      } else { const error = 'AI review returned an unexpected format; the legacy assessment is still shown.'; setAiEstimateError(error); save(baseEstimate, error); }
    }).finally(() => { if (active) setAiEstimateLoading(false); });
    return () => { active = false; };
  }, [goal.type, goal.exercise, goal.title, expectedMiles, target, aiEvidence, recentCutoffIso, records, legacyPrediction]);
  const actualCurrent = currentEvidence?.value || 0;
  const calculated = goal.type==='Endurance'?(aiEstimate?.seconds||0):(calculatedEvidence?.value || 0);
  const comparisonValue = goal.type==='Endurance'?actualCurrent:(actualCurrent||calculated);
  const difference = comparisonValue && target ? comparisonValue - target : 0;
  const atTarget = Boolean(comparisonValue && target && (lowerIsBetter ? comparisonValue <= target : comparisonValue >= target));
  const goalReached = Boolean(actualCurrent && target && (lowerIsBetter ? actualCurrent <= target : actualCurrent >= target));
  const goalGapRatio = comparisonValue && target ? Math.abs(difference) / Math.abs(target) : null;
  const differenceStatus = goalGapRatio === null ? 'unknown' : atTarget || goalGapRatio <= 0.05 ? 'close' : goalGapRatio <= 0.15 ? 'within-reach' : 'far';
  const formatValue = (value: number) => timeGoal ? formatClock(value, hoursFirst) : `${Math.round(value * 10) / 10} ${goal.unit || ''}`.trim();
  const currentText = actualCurrent ? formatValue(actualCurrent) : 'Not logged';
  const calculatedText = calculated ? formatValue(calculated) : '—';
  const differenceText = !comparisonValue ? '—' : timeGoal ? `${formatClock(Math.abs(difference), hoursFirst)} ${atTarget ? 'ahead' : 'to go'}` : `${Math.round(Math.abs(difference) * 10) / 10} ${goal.unit || ''} ${atTarget ? 'ahead' : 'to go'}`;
  const currentSource = currentEvidence?.label || 'No valid event evidence yet';
  const calculatedSource = goal.type==='Endurance'?(aiEstimate?`Legacy race assessment · ${aiEstimate.confidence} confidence`:aiEstimateLoading?'Legacy assessment in progress':aiEstimateError||'No legacy assessment available'):(calculatedEvidence?.label || (isHyrox ? 'Requires HYROX or simulation data' : 'No calculation available'));
  const trajectoryRef=useRef<HTMLDivElement|null>(null);
  const [trajectoryWidth,setTrajectoryWidth]=useState(720);
  useEffect(()=>{
    const node=trajectoryRef.current;
    if(!node||typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(entries=>{
      const measured=entries[0]?.contentRect.width;
      if(measured)setTrajectoryWidth(Math.max(300,Math.min(760,Math.round(measured))));
    });
    observer.observe(node);
    return ()=>observer.disconnect();
  },[]);
  /* 1:1 between user units and CSS pixels keeps 11px text at 11px. */
  const TW=trajectoryWidth,TH=230,TL=46,TR=TW-16,TSPAN=TR-TL;
  const chartStart=shownProgress[0]?.date||datedTrajectory[0]?.date||new Date().toISOString().slice(0,10);const chartStartMs=new Date(`${chartStart}T12:00:00`).getTime();const deadlineMs=new Date(`${goal.date}T12:00:00`).getTime();const chartSpan=Math.max(86400000,deadlineMs-chartStartMs);const chartX=(date:string)=>TL+Math.max(0,Math.min(1,(new Date(`${date}T12:00:00`).getTime()-chartStartMs)/chartSpan))*TSPAN;
  const regression=goal.type==='Body Composition'&&datedTrajectory.length>=2?(()=>{const points=datedTrajectory.map(item=>({x:(new Date(`${item.date}T12:00:00`).getTime()-chartStartMs)/86400000,y:item.value}));const meanX=points.reduce((sum,item)=>sum+item.x,0)/points.length,meanY=points.reduce((sum,item)=>sum+item.y,0)/points.length;const denominator=points.reduce((sum,item)=>sum+(item.x-meanX)**2,0);const slope=denominator?points.reduce((sum,item)=>sum+(item.x-meanX)*(item.y-meanY),0)/denominator:0;const intercept=meanY-slope*meanX;const deadlineX=(deadlineMs-chartStartMs)/86400000;return{slope,intercept,predicted:intercept+slope*deadlineX}})():null;
  const strengthForecast=goal.type==='Strength'?buildStrengthForecast(datedTrajectory,calculated,goal.date):null;
  const predictedAtDeadline=strengthForecast?.predicted??regression?.predicted;
  const chartValues=[target,calculated,...shownProgress.map(item=>item.value),...(predictedAtDeadline?[predictedAtDeadline]:[])].filter(value=>Number.isFinite(value)&&value>0);const minValue=Math.min(...chartValues),maxValue=Math.max(...chartValues),padding=Math.max(1,(maxValue-minValue)*.18);const chartY=(value:number)=>goal.type==='Endurance'?50+(value-(minValue-padding))/Math.max(1,(maxValue+padding)-(minValue-padding))*140:190-(value-(minValue-padding))/Math.max(1,(maxValue+padding)-(minValue-padding))*140;const evidencePoints=shownProgress.map(item=>`${chartX(item.date)},${chartY(item.value)}`).join(' ');const trajectoryStatus=goalReached?'Goal reached':goal.type==='Endurance'?(calculated?'AI assessed':'Assessment needed'):!predictedAtDeadline?'More data needed':lowerIsBetter?predictedAtDeadline<=target?'On track':'More progress needed':predictedAtDeadline>=target?'On track':strengthForecast&&strengthForecast.predicted>calculated?'Progressing':'More progress needed';

  const askCoach = async () => {
    const context = !comparisonValue
      ? `Forge does not have valid evidence for this goal yet. ${isHyrox ? 'Log a HYROX result or a structured simulation with running and stations.' : `Log a workout that directly measures ${goal.exercise || goal.metric}.`}`
      : goalReached
        ? 'Your demonstrated performance has reached this goal. Confirm it with another comparable effort before increasing the target.'
        : `You are ${differenceText} from the target with ${roadmap.weeksRemaining} weeks remaining. ${calculated ? `The ${calculatedText} calculation is a projection, while ${currentText} is the demonstrated floor.` : 'Forge is withholding a projection until the workout type matches the goal.'}`;
    const asksForMissingData = /missing|need.*data|confidence|accurate/i.test(question);
    const missingData = isHyrox ? 'A full HYROX result or structured simulation with run and station splits is required. Heart rate and split data can refine confidence when recorded.' : goal.type === 'Strength' ? `A completed ${goal.exercise || 'lift'} set supplies a demonstrated load; a one-rep attempt supplies a direct 1RM.` : goal.type === 'Endurance' ? `A continuous ${goal.exercise || 'goal-distance'} effort is strongest. A longer continuous run can support a distance-adjusted projection; splits, heart rate, terrain, and elevation improve confidence when recorded.` : 'Another comparable check-in improves the trend.';
    const fallback = asksForMissingData ? `${missingData} Forge will not fill absent fields with assumptions.` : `${context}${question.trim() ? ` For “${question.trim()},” change one training variable at a time and use the next valid result to test whether it helped.` : ''}`;
    setCoachLoading(true);
    const response = await requestForgeCoach({ question, scope: 'goal', context: { goal: { title: goal.title, type: goal.type, exercise: goal.exercise, target: goal.target, deadline: goal.date }, demonstrated: { value: currentText, source: currentSource }, calculated: { value: calculatedText, source: calculatedSource }, forecast: strengthForecast ? { estimate: formatValue(strengthForecast.predicted), range: `${formatValue(strengthForecast.low)}–${formatValue(strengthForecast.high)}`, weeklyRate: `${Math.round(strengthForecast.weeklyRate*10)/10} ${goal.unit||''}/week`, confidence: strengthForecast.confidence, reason: strengthForecast.reason } : null, difference: differenceText, weeksRemaining: roadmap.weeksRemaining, evidenceRules: { calculationsAreReadOnly: true, forecastCannotAssumeGoalAchievement: true, aiMustNotReplaceForecast: true, hyroxRequiresSpecificData: isHyrox } } }, fallback);
    setAnswer(response.answer);
    setCoachSource(response.source);
    const turn={question,answer:response.answer,source:response.source};setCoachTurns(turns=>{const next=[...turns,turn];localStorage.setItem(coachKey,JSON.stringify(next));return next});
    setQuestion('');
    setCoachLoading(false);
  };

  return <article className={`goal-progress-card goal-tracker-simple${goal.type==='Endurance'?' endurance-goal':''}${goalReached?' goal-complete':''}`}>
    <header><div><span>{goal.type.toUpperCase()} · {goal.exercise || goal.metric}</span><h3>{goal.title}</h3></div><div className="goal-head-side"><b className={goalReached ? 'on-track' : ''}>{goalReached ? 'Goal reached' : 'In progress'}</b><small>{roadmap.weeksRemaining} wks left · {formatDate(goal.date)}</small></div></header>
    <section className="goal-stat-row">
      <div className="goal-value-current"><span>CURRENT</span><strong>{currentText}</strong></div>
      <div className="goal-value-calculated"><span>{goal.type==='Endurance'?'ASSESSED':'PROJECTED'}</span><strong>{aiEstimateLoading?'…':calculatedText}</strong></div>
      <div><span>TARGET</span><strong>{formatGoalTarget(goal.target,goal.metric,goal.unit)}</strong></div>
      <div className={`goal-value-difference ${differenceStatus}`}><span>TO GO</span><strong>{differenceText}</strong></div>
    </section>
    <details className="goal-sources-details"><summary>Where these numbers come from</summary>
      <div><span>CURRENT</span><p>{currentSource}{currentEvidence?.date ? ` · ${formatDate(currentEvidence.date)}` : ''}. The best performance your logged data demonstrates.</p></div>
      <div><span>{goal.type==='Endurance'?'ASSESSED':'PROJECTED'}</span><p>{calculatedSource}{goal.type==='Endurance'?(aiEstimate?` · ${aiEstimate.reason}`:''):(calculatedEvidence?.date?` · ${formatDate(calculatedEvidence.date)}`:'')}. A goal-specific projection — it never substitutes unrelated workouts.</p></div>
    </details>
    {goal.type==='Endurance'&&<CardioGoalChart efforts={datedTrajectory} target={target} assessment={calculated} event={goal.exercise||goal.title} miles={expectedMiles}/>}
    {goal.type!=='Endurance'&&<section className="goal-trajectory-chart simple"><header><div><span>{goalReached?'GOAL COMPLETED':'TRAJECTORY'}</span><strong>{goalReached?'Target reached':`Last 6 months → ${formatDate(goal.date)}`}</strong></div><b className={trajectoryStatus==='Goal reached'||trajectoryStatus==='On track'||trajectoryStatus==='Progressing'?'on-track':trajectoryStatus==='More progress needed'?'behind':''}>{trajectoryStatus}</b></header><div className="trajectory-plot" ref={trajectoryRef}><svg viewBox={`0 0 ${TW} ${TH}`} width={TW} height={TH} role="img" aria-label={`Goal trajectory: ${trajectoryStatus}`}><g className="trajectory-grid"><line x1={TL} y1={chartY(target)} x2={TR} y2={chartY(target)} strokeDasharray="6 7"/></g>{shownProgress.length>0&&<polyline className="trajectory-calculated" points={evidencePoints}/>}{predictedAtDeadline&&!goalReached&&shownProgress.length>0&&<line className="trajectory-forecast" x1={chartX(shownProgress.at(-1)!.date)} y1={chartY(shownProgress.at(-1)!.value)} x2={TR} y2={chartY(predictedAtDeadline)}/>}{shownProgress.map((item,index)=><circle className="trajectory-point calculated" cx={chartX(item.date)} cy={chartY(item.value)} r={index===shownProgress.length-1?6:4.5} key={`calculated-${item.date}-${index}`}><title>{formatDate(item.date)} · {formatValue(item.value)} · {item.label}</title></circle>)}<circle className="trajectory-target" cx={TR} cy={chartY(target)} r="6"/>{predictedAtDeadline&&!goalReached&&<text className="trajectory-proj-label" x={TR-14} y={Math.min(TH-30,Math.max(16,chartY(predictedAtDeadline)+(chartY(predictedAtDeadline)>chartY(target)?18:-10)))} textAnchor="end">PROJECTED {formatValue(predictedAtDeadline)}</text>}<text x={TL} y={TH-8}>{formatDate(chartStart)}</text><text x={TR} y={TH-8} textAnchor="end">GOAL · {formatDate(goal.date)}</text><text className="trajectory-target-label" x={TR-10} y={Math.max(16,chartY(target)-10)} textAnchor="end">TARGET {goal.target}</text></svg></div><footer>{goalReached?<strong>Reached {currentEvidence?.date?formatDate(currentEvidence.date):'from your saved baseline'}</strong>:strengthForecast?<strong>Likely {formatValue(strengthForecast.low)}–{formatValue(strengthForecast.high)} by deadline · {strengthForecast.confidence.toLowerCase()} confidence</strong>:predictedAtDeadline?<strong>Estimated at deadline: {formatValue(predictedAtDeadline)}</strong>:null}</footer></section>}
    <section className="goal-coach-inline goal-coach-visible"><div><span className="eyebrow">FORGE COACH · {goal.title.toUpperCase()}</span></div><div className="goal-coach-prompts">{['Am I on track for this goal?','How close am I really?','What data is missing?','What should I do next?'].map(prompt=><button type="button" onClick={()=>setQuestion(prompt)} key={prompt}>{prompt}</button>)}</div><div className="goal-coach-entry"><textarea rows={2} value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about this goal…"/><button className="button" disabled={coachLoading||!question.trim()} onClick={askCoach}>{coachLoading?'Thinking…':'Ask Forge'}</button></div>{coachTurns.map((turn,index)=><div className="goal-coach-answer" key={`${turn.question}-${index}`}><span>YOU</span><p>{turn.question}</p><span>FORGE · {turn.source==='ai'?'AI ANALYSIS':'PREVIEW GUIDANCE'}</span><p>{turn.answer}</p></div>)}</section>
  </article>;
}
