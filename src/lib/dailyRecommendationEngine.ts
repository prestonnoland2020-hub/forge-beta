import type { CreatedGoal } from '../components/GoalBuilder';
import type { LibraryExercise } from '../features/training/TrainingLibraryProvider';
import type { AdaptiveProfile, RunResult } from '../features/training/AdaptiveTrainingProvider';
import type { WorkoutRecord } from '../features/training/WorkoutHistoryProvider';
import type { RecoveryState } from './recoveryEngine';
import { buildWeeklyCardio, type GeneratedSession } from './cardioEngine';
import { normalizeMuscleGroups } from './muscleGroups';
import { buildTrainingIntelligence } from './trainingIntelligence';

export const DAILY_RECOMMENDATION_VERSION='completed-split-v2';

export type RecommendationSplitDay={
  id?:string;
  splitId?:string;
  position:number;
  name:string;
  type:'strength'|'cardio'|'mixed'|'rest';
  muscles:string[];
  exercises:string[];
  cardioTypes:string[];
};

export type RecommendedTopSet={
  id:string;
  muscle:string;
  exercise:string;
  weight:number;
  reps:number;
  calculatedMax:number;
  stage:string;
  rationale:string;
  source:'history'|'baseline';
  selected:boolean;
  optional:boolean;
};

export type RecommendedCardio={
  id:string;
  title:string;
  summary:string;
  rationale:string;
  session:GeneratedSession;
  selected:boolean;
};

export type DailyRecommendation={
  id?:string;
  date:string;
  status:'active'|'completed'|'superseded';
  algorithmVersion:string;
  inputFingerprint:string;
  splitDay:RecommendationSplitDay;
  topSets:RecommendedTopSet[];
  cardio?:RecommendedCardio;
  headline:string;
  explanation:string;
  evidence:{lastCompletedDate?:string;activeDays7:number;historyCount:number;goalNames:string[]};
};

type EngineInput={
  date:string;
  splitDay:RecommendationSplitDay;
  exercises:LibraryExercise[];
  records:WorkoutRecord[];
  goals:CreatedGoal[];
  recovery:RecoveryState;
  profile:AdaptiveProfile;
  runningHistory:RunResult[];
  loadBiasPercent:number;
};

const normalized=(value:string)=>value.trim().toLowerCase();
const strengthResults=(records:WorkoutRecord[])=>records.flatMap(record=>(record.topSets||[]).filter(set=>set.completed!==false&&set.lift&&set.weight>0&&set.reps>0).map(set=>({date:record.date,lift:set.lift,muscle:set.muscle})));
const stableHash=(value:string)=>{let hash=2166136261;for(let index=0;index<value.length;index++){hash^=value.charCodeAt(index);hash=Math.imul(hash,16777619)}return(hash>>>0).toString(36)};
const goalTarget=(goal:CreatedGoal)=>Number(String(goal.target||'').replace(/[^0-9.]/g,''))||0;
const formatCardio=(session:GeneratedSession)=>session.plan.structure==='Intervals'
  ?`${session.plan.activity} · ${session.plan.repeats} × ${session.plan.workDistance} ${session.plan.workUnit} · ${session.plan.pace}`
  :session.plan.structure==='Steady'
    ?`${session.plan.activity} · ${session.plan.duration||session.plan.distance} ${session.plan.duration?'min':session.plan.distanceUnit||''} · ${session.plan.pace||'controlled effort'}`
    :`${session.title} · ${session.plan.rounds||1} rounds`;

export function recommendationFingerprint(input:Omit<EngineInput,'recovery'|'profile'|'runningHistory'|'loadBiasPercent'> & {cycleRevision?:number;loadBiasPercent:number;aiPlanStamp?:string}){
  const history=input.records.slice(0,120).map(record=>[record.id,record.date,(record.topSets||[]).map(set=>[set.lift,set.weight,set.reps,set.completed]),(record.cardioSessions||[]).map(session=>[session.id,session.summary])]);
  const goals=input.goals.map(goal=>[goal.type,goal.title,goal.target,goal.date,goal.exercise]);
  const library=input.exercises.filter(exercise=>exercise.enabled).map(exercise=>[exercise.id,exercise.name,exercise.kind,exercise.muscles,exercise.detail]);
  return stableHash(JSON.stringify([DAILY_RECOMMENDATION_VERSION,input.date,input.splitDay,input.cycleRevision||0,input.loadBiasPercent,input.aiPlanStamp||'',history,goals,library]));
}

export function buildDailyRecommendation(input:EngineInput & {inputFingerprint:string}):DailyRecommendation{
  const completed=strengthResults(input.records);
  const lastCompletedByLift=completed.reduce<Record<string,string>>((map,result)=>{if(!map[result.lift]||result.date>map[result.lift])map[result.lift]=result.date;return map},{});
  const strengthLibrary=input.exercises.filter(exercise=>exercise.enabled&&exercise.kind==='Strength'&&!/HYROX|CrossFit/i.test(exercise.detail));
  const strengthGoals=input.goals.filter(goal=>goal.type==='Strength'&&goal.exercise);
  const goalByLift=new Map(strengthGoals.map(goal=>[normalized(goal.exercise||''),goal]));
  const goalMaxByLift=strengthGoals.reduce<Record<string,number>>((map,goal)=>{const target=goalTarget(goal);if(goal.exercise&&target)map[goal.exercise]=target;return map},{});
  const dueMuscles=normalizeMuscleGroups(input.splitDay.muscles).filter(muscle=>muscle!=='Cardio');
  const explicitNames=new Set(input.splitDay.exercises.map(normalized));
  const compareExercise=(a:LibraryExercise,b:LibraryExercise)=>{
    const aExplicit=explicitNames.has(normalized(a.name));const bExplicit=explicitNames.has(normalized(b.name));
    if(aExplicit!==bExplicit)return aExplicit?-1:1;
    const aGoal=goalByLift.has(normalized(a.name));const bGoal=goalByLift.has(normalized(b.name));
    if(aGoal!==bGoal)return aGoal?-1:1;
    const aLast=lastCompletedByLift[a.name]||'';const bLast=lastCompletedByLift[b.name]||'';
    if(Boolean(aLast)!==Boolean(bLast))return aLast?1:-1;
    if(aLast!==bLast)return aLast.localeCompare(bLast);
    const aPrimary=/primary/i.test(a.detail);const bPrimary=/primary/i.test(b.detail);
    if(aPrimary!==bPrimary)return aPrimary?-1:1;
    return a.name.localeCompare(b.name);
  };

  const used=new Set<string>();
  const coveredMuscles=new Set<string>();
  const selectedExercises:Array<{muscle:string;exercise:LibraryExercise;optional:boolean}>=[];
  const explicitlyMapped=strengthLibrary.filter(exercise=>explicitNames.has(normalized(exercise.name))).sort(compareExercise);
  explicitlyMapped.forEach(exercise=>{
    // Label a mapped exercise with its own primary muscle. Matching against the
    // day's muscle list first meant Bench showed as "Triceps" simply because
    // Triceps happened to come earlier in that list than Chest.
    const muscle=exercise.muscles[0]||dueMuscles.find(item=>exercise.muscles.includes(item))||'Primary';
    // Every exercise mapped to this split day is prescribed. Sharing a muscle with
    // another mapped lift does not make one of them optional.
    selectedExercises.push({muscle,exercise,optional:false});
    used.add(normalized(exercise.name));coveredMuscles.add(muscle);
  });
  // Gate on what the day *declares*, not on what resolved. A day naming an exercise
  // that is missing or disabled in the library must not quietly fill itself from the
  // library instead — the Today card's "map an exercise to this day" prompt is the
  // honest outcome.
  if(!input.splitDay.exercises.length){
    dueMuscles.forEach(muscle=>{
      if(coveredMuscles.has(muscle))return;
      // Prefer a movement this muscle actually leads. Matching on mere
      // involvement put Bench Press — whose primary muscle is Chest but whose
      // list also names Shoulders — on a shoulders day as if it were a
      // shoulder press. When only a secondary match exists it is still worth
      // offering, but it is marked optional rather than presented as the
      // prescribed work for that muscle.
      const leads=strengthLibrary.filter(exercise=>exercise.muscles[0]===muscle);
      const involves=strengthLibrary.filter(exercise=>exercise.muscles.includes(muscle));
      const pool=leads.length?leads:involves;
      const candidate=pool.sort(compareExercise).find(exercise=>!used.has(normalized(exercise.name)));
      if(!candidate)return;
      selectedExercises.push({muscle,exercise:candidate,optional:!leads.length});
      used.add(normalized(candidate.name));coveredMuscles.add(muscle);
    });
  }
  const templates=selectedExercises.map(({exercise})=>({exercise:exercise.name,calculatedMax:0,exposureIndex:new Set(completed.filter(result=>result.lift===exercise.name).map(result=>result.date)).size}));
  const intelligence=buildTrainingIntelligence({records:input.records,recovery:input.recovery,templates,goalMaxByLift,today:new Date(`${input.date}T12:00:00`),loadBiasPercent:input.loadBiasPercent});
  /* A cardio-only split day prescribes no strength: no top set appears on
     Today or in the workout log for that day. */
  const topSets=input.splitDay.type==='cardio'?[]:selectedExercises.map(selection=>{
    const target=intelligence.topSets.find(item=>item.exercise===selection.exercise.name)!;
    return{id:`top-${selection.exercise.id}-${normalized(selection.muscle).replace(/[^a-z0-9]+/g,'-')}`,muscle:selection.muscle,exercise:target.exercise,weight:target.weight,reps:target.reps,calculatedMax:target.calculatedMax,stage:target.stage,rationale:target.rationale,source:target.source,selected:!selection.optional,optional:selection.optional};
  });

  /* The split day's NAME owns its cardio role: a "Long Run" day gets the long
     run, never the week's intervals. Unnamed cardio days take the highest-
     priority scheduled session as before. */
  const roleForDayName=(name:string):GeneratedSession['role']|null=>{const value=name.toLowerCase();if(value.includes('long'))return 'Long';if(value.includes('easy')||value.includes('aerobic')||value.includes('recovery'))return 'Easy';if(value.includes('quality')||value.includes('speed')||value.includes('interval')||value.includes('track')||value.includes('tempo'))return 'Quality';return null};
  const cardioCandidate=(()=>{
    if(input.splitDay.type!=='cardio'&&input.splitDay.type!=='mixed')return undefined;
    const weekly=buildWeeklyCardio(input.goals,0,{profile:input.profile,history:input.runningHistory});
    const wanted=roleForDayName(input.splitDay.name);
    const pick=(role:GeneratedSession['role'])=>weekly.scheduled.find(session=>session.role===role)||weekly.deferred.find(session=>session.role===role);
    if(wanted){
      const found=pick(wanted)||(wanted==='Long'?pick('Easy'):undefined);
      if(found)return{...found,status:'Scheduled' as const};
    }
    return weekly.scheduled[0];
  })();
  const cardio=cardioCandidate?{id:`cardio-${cardioCandidate.id}`,title:cardioCandidate.title,summary:formatCardio(cardioCandidate),rationale:cardioCandidate.rationale,session:cardioCandidate,selected:true}:undefined;
  const lastCompletedDate=input.records.map(record=>record.date).sort().at(-1);
  const selectedCount=topSets.filter(set=>set.selected).length;
  const explanation=input.splitDay.type==='rest'
    ?'The completed-workout cursor reached a rest day. No hard work is required; any displayed strength option is optional and does not replace recovery.'
    :`${input.splitDay.name} is next because the last completed recommendation advanced the split to position ${input.splitDay.position}. ${selectedCount?`${selectedCount} history-grounded top-set ${selectedCount===1?'option is':'options are'} ready.`:''}${cardio?' Cardio comes from the same goals, pace history, and recovery inputs.':''}`;
  return{id:undefined,date:input.date,status:'active',algorithmVersion:DAILY_RECOMMENDATION_VERSION,inputFingerprint:input.inputFingerprint,splitDay:input.splitDay,topSets,cardio,headline:input.splitDay.type==='rest'?'Recovery is next':`${input.splitDay.name} is next`,explanation,evidence:{lastCompletedDate,activeDays7:intelligence.activeDays7,historyCount:input.records.length,goalNames:input.goals.map(goal=>goal.title)}};
}
