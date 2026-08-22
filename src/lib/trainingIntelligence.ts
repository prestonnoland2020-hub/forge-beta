import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import type { RecoveryState } from './recoveryEngine';
import { epleyMax, prescribeTopSet } from './strengthPrescription';

export type LiftTemplate = { exercise:string; calculatedMax:number; exposureIndex?:number };
export type IntelligentTopSet = LiftTemplate & {
  weight:number;
  reps:number;
  backoffSets:number;
  backoffReps:number;
  backoffWeight:number;
  stage:string;
  rationale:string;
  source:'history'|'baseline';
};

export type TrainingIntelligence = {
  activeDays7:number;
  activeDaysPrior7:number;
  workloadTrend:'Building'|'Steady'|'Easing';
  daysSinceTraining:number|null;
  headline:string;
  reason:string;
  topSets:IntelligentTopSet[];
};

const dayMs=86_400_000;
const parseDay=(date:string)=>new Date(`${date}T12:00:00`).getTime();
const uniqueDates=(records:WorkoutRecord[])=>[...new Set(records.map(record=>record.date))];
const strengthResults=(records:WorkoutRecord[])=>records.flatMap(record=>record.topSets?.length?record.topSets.filter(set=>set.completed!==false).map(set=>({date:record.date,lift:set.lift,weight:set.weight,reps:set.reps,calculatedMax:set.calculatedMax})):(record.lift&&record.weight&&record.reps?[{date:record.date,lift:record.lift,weight:record.weight,reps:record.reps,calculatedMax:record.calculatedMax}]:[]));

export function buildTrainingIntelligence({records,recovery,templates,goalMaxByLift={},today=new Date(),loadBiasPercent=0}:{records:WorkoutRecord[];recovery:RecoveryState;templates:LiftTemplate[];goalMaxByLift?:Record<string,number|undefined>;today?:Date;loadBiasPercent?:number}):TrainingIntelligence{
  const todayStart=new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime();
  const ages=uniqueDates(records).map(date=>Math.floor((todayStart-parseDay(date))/dayMs)).filter(age=>age>=0);
  const activeDays7=ages.filter(age=>age<7).length;
  const activeDaysPrior7=ages.filter(age=>age>=7&&age<14).length;
  const workloadTrend=activeDays7>activeDaysPrior7?'Building':activeDays7<activeDaysPrior7?'Easing':'Steady';
  const daysSinceTraining=ages.length?Math.min(...ages):null;
  let headline='Build your first reliable baseline';
  let reason='Log a completed strength or cardio session so Forge can begin adapting the next recommendation.';
  if(daysSinceTraining===0){headline='Protect today’s adaptation';reason='A session is already logged today. Keep additional work easy unless this is an intentional two-a-day.'}
  else if(!recovery.hardTrainingAllowed){headline='Recovery safeguard active';reason=`Readiness is ${recovery.readiness}%. Forge reduced loading and will not schedule a max test.`}
  else if(daysSinceTraining===1){headline='Train around recent fatigue';reason='You trained yesterday. Use a different movement pattern or keep today’s work submaximal.'}
  else if(daysSinceTraining!==null){headline='Productive training is available';reason=recovery.confidence==='Low'?`It has been ${daysSinceTraining} days since your last logged session. No smartwatch recovery data was used.`:`It has been ${daysSinceTraining} days since your last logged session and readiness is ${recovery.readiness}%.`}

  const topSets=templates.map(template=>{
    const history=strengthResults(records).filter(record=>record.lift===template.exercise&&record.weight&&record.reps).sort((a,b)=>b.date.localeCompare(a.date)||(b.calculatedMax??epleyMax(b.weight,b.reps))-(a.calculatedMax??epleyMax(a.weight,a.reps)));
    const latest=history[0];
    if(!latest)return{...template,weight:0,reps:0,backoffSets:0,backoffReps:0,backoffWeight:0,calculatedMax:0,stage:'BASELINE',rationale:`Log a recent ${template.exercise} set before Forge recommends a load. Its first completed set establishes this movement’s independent 6 → 8 → 4 cycle.`,source:'baseline' as const};
    const recentCutoff=todayStart-90*dayMs;
    const recentHistory=history.filter(result=>parseDay(result.date)>=recentCutoff);
    const comparablePool=recentHistory.length?recentHistory:history;
    const strongestRecent=comparablePool.reduce((winner,result)=>(result.calculatedMax??epleyMax(result.weight!,result.reps!))>(winner.calculatedMax??epleyMax(winner.weight!,winner.reps!))?result:winner);
    const baselineMax=strongestRecent.calculatedMax??epleyMax(strongestRecent.weight!,strongestRecent.reps!);
    const latestMax=latest.calculatedMax??epleyMax(latest.weight!,latest.reps!);
    const supportsProgress=comparablePool.length>=2&&latestMax>=baselineMax*.98;
    const destination=goalMaxByLift[template.exercise]&&goalMaxByLift[template.exercise]!>baselineMax?goalMaxByLift[template.exercise]!:baselineMax*1.04;
    const evidenceStep=supportsProgress?baselineMax*.006:0;
    const evidenceProgress=Math.max(0,Math.min(1,(destination-baselineMax)>0?evidenceStep/(destination-baselineMax):0));
    const completedProgrammedExposures=template.exposureIndex??Math.max(0,history.length-1);
    const stage=prescribeTopSet({baselineMax,goalMax:goalMaxByLift[template.exercise],weekIndex:completedProgrammedExposures,progress:evidenceProgress,readiness:recovery.confidence==='Low'?100:recovery.readiness,highFatigue:recovery.strengthFatigue==='High'});
    const safeBias=Math.max(-10,Math.min(10,loadBiasPercent));const adjustedWeight=Math.max(0,Math.round(stage.weight*(1+safeBias/100)/5)*5);const adjustedMax=epleyMax(adjustedWeight,stage.reps);
    const source='history' as const;
    const rationale=`${stage.rationale} Best recent comparable estimate came from ${strongestRecent.weight} lb ×${strongestRecent.reps}; latest was ${latest.weight} lb ×${latest.reps} on ${latest.date}.${supportsProgress?' Recent performance supports one small progression step.':' Forge is holding the demonstrated level until another comparable result confirms progress.'}`;
    const backoffSets=stage.isTest?2:3;const backoffReps=stage.reps<=2?Math.max(3,stage.reps+2):stage.reps;const backoffWeight=Math.max(5,Math.round(adjustedWeight*(stage.isTest?.85:.9)/5)*5);
    return {...template,weight:adjustedWeight,reps:stage.reps,backoffSets,backoffReps,backoffWeight,calculatedMax:adjustedMax,stage:stage.label,rationale:`${rationale}${goalMaxByLift[template.exercise]?` This load is progressing toward the ${goalMaxByLift[template.exercise]} lb goal.`:' No movement-specific goal is set, so Forge targets a conservative improvement over demonstrated strength.'}${safeBias?` Coach load adjustment: ${safeBias>0?'+':''}${safeBias}%.`:''}`,source};
  });
  return{activeDays7,activeDaysPrior7,workloadTrend,daysSinceTraining,headline,reason,topSets};
}
