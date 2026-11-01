import { useEffect,useMemo,useRef,useState } from 'react';
import { Link } from 'react-router-dom';
import { CardioPlanBuilder,cardioPlanSummary,type PlannedCardio } from '../components/CardioPlanBuilder';
import { useGoals } from '../features/goals/GoalsProvider';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { LongRangeTrainingPlan } from '../components/LongRangeTrainingPlan';
import { AiProgramPlan } from '../components/AiProgramPlan';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { buildLongRangePlan } from '../lib/longRangePlanEngine';
import { useCoachingStrategy } from '../features/training/CoachingStrategyProvider';
import { isProgrammableStrength,useTrainingLibrary } from '../features/training/TrainingLibraryProvider';
import { requestForgeCoach } from '../features/training/coachService';
import { useAuth } from '../features/auth/AuthProvider';
import { saveTrainingSplit } from '../features/splits/splitService';
import { saveAthleteSettings } from '../features/profile/settingsSync';
import { isDemoMode } from '../lib/env';
import { useEditingSplit } from '../features/profile/splitEditing';
import { NumberInput } from '../components/NumberInput';
import { coreFirst } from '../lib/coreLifts';
import { tap } from '../lib/haptics';
import { Icon } from '../components/Icon';
import { SearchField } from '../components/SearchField';

/* STARTING POINTS. Building a split from a blank day means naming days,
   picking a type, picking muscles and picking lifts, seven times over. Most
   people want one of four shapes; each is a tap, and every day stays
   editable after. */
const TEMPLATES:Array<{id:string;label:string;copy:string;days:Array<[string,DayType,string[]]>}>=[
  {id:'full',label:'Full body',copy:'3 days · every muscle each day',days:[['Full Body A','strength',['Quads','Chest','Back']],['Full Body B','strength',['Hamstrings','Shoulders','Back']],['Full Body C','strength',['Glutes','Chest','Biceps','Triceps']]]},
  {id:'upper-lower',label:'Upper / Lower',copy:'4 days · upper and lower twice',days:[['Upper A','strength',['Chest','Back','Shoulders']],['Lower A','strength',['Quads','Hamstrings','Glutes']],['Upper B','strength',['Back','Chest','Biceps','Triceps']],['Lower B','strength',['Hamstrings','Quads','Glutes']]]},
  {id:'ppl',label:'Push / Pull / Legs',copy:'3 days · push, pull, legs',days:[['Push','strength',['Chest','Shoulders','Triceps']],['Pull','strength',['Back','Biceps']],['Legs','strength',['Quads','Hamstrings','Glutes']]]},
  {id:'hybrid',label:'Hybrid',copy:'4 days · lifting and running',days:[['Upper','strength',['Chest','Back','Shoulders']],['Quality Run','cardio',[]],['Lower','strength',['Quads','Hamstrings','Glutes']],['Long Run','cardio',[]]]},
];
const DAY_TYPES:Array<[DayType,string]>=[['strength','Lift'],['cardio','Run'],['mixed','Both'],['rest','Rest'],['hyrox','HYROX']];

const muscles=['Chest','Back','Shoulders','Quads','Hamstrings','Glutes','Biceps','Triceps','Forearms','Abs'];
type CardioPolicy='none'|'forge'|'planned';
type DayType='strength'|'cardio'|'mixed'|'rest'|'hyrox';
type TrainingDay={name:string;weekday:string;dayType:DayType;muscles:string[];exercises:string[];cardioPolicy:CardioPolicy;cardio:PlannedCardio[];recoveryStyle:'Full rest'|'Mobility'|'Active recovery';maxDuration:string;strengthDuration:string};
/* SAVED SPLITS ride inside the plan record, so they reach the account through
   the same athlete_settings write as the split itself and need no table of
   their own. The live split is the one the plan trains from; the library is
   what the athlete can switch it to. */
type SavedSplit={id:string;name:string;rhythm:'rolling'|'weekly';days:TrainingDay[];savedAt:string};
type SavedPlan={name:string;rhythm:'rolling'|'weekly';days:TrainingDay[];minWeeklyMileage?:number;maxWeeklyMileage?:number;activeId?:string|null;library?:SavedSplit[]};
const planStorageKey='forge-training-plan-v1';
const loadSavedPlan=():SavedPlan|null=>{try{return JSON.parse(localStorage.getItem(planStorageKey)||'null')}catch{return null}};
const plannedCardioMinutes=(plan:PlannedCardio)=>{if(plan.structure==='Steady'||plan.structure==='Custom')return Math.max(0,Number(plan.duration)||0);if(plan.structure==='Intervals'){const work=/seconds?/i.test(plan.workUnit||'')?Number(plan.workDistance||0)/60:/minutes?/i.test(plan.workUnit||'')?Number(plan.workDistance||0):0;return Math.ceil(Math.max(0,Number(plan.repeats)||0)*work+Math.max(0,(Number(plan.repeats)||0)-1)*(Number(plan.rest)||0)/60)}if(plan.structure==='Circuit'){if(plan.circuitFormat==='For time'&&Number(plan.duration)>0)return Number(plan.duration);if(plan.circuitFormat==='AMRAP'||plan.circuitFormat==='EMOM')return Math.max(0,Number(plan.rounds)||0);const rounds=Math.max(0,Number(plan.rounds)||0);return Math.ceil(rounds*8+Math.max(0,rounds-1)*(Number(plan.roundRest)||0)/60)}return 0};
const durationForDay=(day:TrainingDay,cardio=day.cardio)=>{const cardioMinutes=cardio.reduce((total,plan)=>total+plannedCardioMinutes(plan),0);if(day.dayType==='strength')return day.strengthDuration;if(day.dayType==='cardio')return cardioMinutes?String(cardioMinutes):'';if(day.dayType==='hyrox')return '';if(day.dayType==='mixed')return String((Number(day.strengthDuration)||0)+cardioMinutes);return ''};

/* /plan is the program; /split is the split editor, reached from Profile.
   They were two tabs on one page — Preston's call: Plan opens on the plan,
   and the split lives under Profile with a way back. */
export function TrainingPlanPage({mode='program'}:{mode?:'program'|'split'}={}){
  /* This screen empties and refills split days, so it declares itself rather
     than relying on the gate recognising its URL. */
  useEditingSplit();
  const {user}=useAuth();
  const {goals}=useGoals();const {records}=useWorkoutHistory();const {profile}=useAdaptiveTraining();
  const {strategy}=useCoachingStrategy();
  const {exercises:libraryExercises,workouts:libraryWorkouts}=useTrainingLibrary();const strengthExercises=libraryExercises.filter(exercise=>exercise.enabled&&isProgrammableStrength(exercise));const exercises=strengthExercises.map(exercise=>exercise.name);const cardioWorkouts=libraryWorkouts.filter(workout=>Boolean(workout.plan));
  const {setup,saveSetup}=useProfileSetup();
  const savedPlan=useMemo(loadSavedPlan,[]);
  const tab:'split'|'program'=mode==='split'?'split':'program';
  const [rhythm,setRhythm]=useState<'rolling'|'weekly'>(savedPlan?.rhythm??(setup?.scheduleStyle==='Weekly schedule'?'weekly':'rolling'));
  const [splitName,setSplitName]=useState(savedPlan?.name||'My training split');
  const [minWeeklyMileage,setMinWeeklyMileage]=useState(savedPlan?.minWeeklyMileage??setup?.minWeeklyMileage??Math.max(0,Math.round(profile.weeklyMileage*.8)));
  const [maxWeeklyMileage,setMaxWeeklyMileage]=useState(savedPlan?.maxWeeklyMileage??setup?.maxWeeklyMileage??Math.max(0,Math.round(profile.weeklyMileage*1.2)));
  const [selectedDay,setSelectedDay]=useState(0);
  const [library,setLibrary]=useState<SavedSplit[]>(savedPlan?.library||[]);
  const [activeId,setActiveId]=useState<string|null>(savedPlan?.activeId??null);
  const [exerciseQuery,setExerciseQuery]=useState('');
  const [syncState,setSyncState]=useState<'saving'|'saved'|'local'|'error'>(isDemoMode?'local':'saving');
  const [reviewOpen,setReviewOpen]=useState(false);
  const [reviewQuestion,setReviewQuestion]=useState('');
  const [reviewAnswer,setReviewAnswer]=useState('');
  const [reviewLoading,setReviewLoading]=useState(false);
  const [cardioEditor,setCardioEditor]=useState<{dayIndex:number;cardioIndex:number|null}|null>(null);
  const [draggingDay,setDraggingDay]=useState<number|null>(null);
  const [dragOverDay,setDragOverDay]=useState<number|null>(null);
  const dayTouchStart=useRef<number|null>(null);
  const [days,setDays]=useState<TrainingDay[]>(()=>savedPlan?.days?.length?savedPlan.days.map(day=>({...day,strengthDuration:day.strengthDuration||day.maxDuration||'60'})):setup?.splitDays?.length?setup.splitDays.map((day,index)=>({name:day.name,weekday:['MON','TUE','WED','THU','FRI','SAT','SUN'][index%7],dayType:day.type.toLowerCase() as DayType,muscles:day.muscles||[],exercises:[],cardioPolicy:day.type==='Rest'?'none':'forge',cardio:[],recoveryStyle:'Full rest',strengthDuration:String(setup.strengthSessionMinutes),maxDuration:String(day.type==='Cardio'?setup.cardioSessionMinutes:day.type==='Mixed'?setup.combinedSessionMinutes:setup.strengthSessionMinutes)})):[{name:'Training Day 1',weekday:'MON',dayType:'strength',muscles:[],exercises:[],cardioPolicy:'none',cardio:[],recoveryStyle:'Full rest',strengthDuration:'60',maxDuration:'60'}]);
  const active=days[selectedDay];
  /* LOOKING IS NOT EDITING. Both effects below run on mount, not only on
     change — so merely opening the Plan tab out of curiosity rewrote the
     athlete's split: splitSource flipped from 'Recommended' to 'Custom',
     invented mileage bounds were persisted to athlete_settings, and 1.2 s
     later the server split was overwritten with whatever localStorage
     happened to hold. Nothing had been touched.

     The signature is the state these effects persist. Until it differs from
     what the page opened with, there is nothing to save. */
  const persistSignature=JSON.stringify({splitName,rhythm,days,minWeeklyMileage,maxWeeklyMileage,activeId,library});
  const openedWith=useRef(persistSignature);
  const edited=persistSignature!==openedWith.current;
  useEffect(()=>{if(!edited)return;const min=Math.max(0,minWeeklyMileage);const max=Math.max(min,maxWeeklyMileage);const savedPlanState={name:splitName,rhythm,days,minWeeklyMileage:min,maxWeeklyMileage:max,activeId,library} satisfies SavedPlan;localStorage.setItem(planStorageKey,JSON.stringify(savedPlanState));if(setup)saveSetup({...setup,minWeeklyMileage:min,maxWeeklyMileage:max,scheduleStyle:rhythm==='weekly'?'Weekly schedule':'Rolling cycle',splitSource:'Custom',trainingDays:days.filter(day=>day.dayType!=='rest').length,splitDays:days.map(day=>({name:day.name,type:(day.dayType[0].toUpperCase()+day.dayType.slice(1)) as 'Strength'|'Cardio'|'Mixed'|'Rest',muscles:day.muscles}))});const settingsTimer=window.setTimeout(()=>saveAthleteSettings({plan:savedPlanState}),1500);return()=>window.clearTimeout(settingsTimer)},[edited,splitName,rhythm,days,minWeeklyMileage,maxWeeklyMileage,activeId,library]);
  useEffect(()=>{if(isDemoMode||!user){setSyncState('local');return}if(!edited){setSyncState('saved');return}setSyncState('saving');const timer=window.setTimeout(()=>{void saveTrainingSplit(splitName,days.map((day,index)=>({position:index+1,name:day.name,muscleGroups:day.dayType==='strength'||day.dayType==='mixed'?day.muscles:[],goalLifts:day.dayType==='strength'||day.dayType==='mixed'?day.exercises:[],cardioTypes:day.dayType==='hyrox'?['HYROX']:day.dayType==='cardio'||day.dayType==='mixed'?(day.cardioPolicy==='planned'?(day.cardio.length?day.cardio.map(cardioPlanSummary):['Planned']):['Forge']):[]}))).then(()=>{setSyncState('saved');window.dispatchEvent(new Event('forge-training-cycle-changed'))}).catch(()=>setSyncState('error'))},1200);return()=>window.clearTimeout(timer)},[edited,user,splitName,days]);
  const updateDay=(change:Partial<TrainingDay>)=>setDays(items=>items.map((day,index)=>{if(index!==selectedDay)return day;const next={...day,...change};next.maxDuration=durationForDay(next);return next}));
  /* Functional update — two fast taps must both land, never overwrite each
     other through a stale closure. */
  const toggleMuscle=(muscle:string)=>setDays(items=>items.map((day,index)=>index!==selectedDay?day:{...day,muscles:day.muscles.includes(muscle)?day.muscles.filter(item=>item!==muscle):[...day.muscles,muscle]}));
  /* Scrolling one flat list of every strength movement on a phone is the slowest
     part of building a split, so the picker filters by muscle group first and
     the day's own selections sort to the top. */
  /* The picker used to list the whole library behind its own row of muscle
     filter chips — a second muscle control sitting directly under the day's
     own muscle selection, saying the same thing. The day's muscles ARE the
     filter now: a Chest + Back day offers chest and back movements and
     nothing else. An exercise already on the day always stays visible, so
     removing a muscle can never hide something you picked. */
  const dayMuscles=active.muscles.filter(muscle=>muscles.includes(muscle));
  const libraryMatches=strengthExercises.filter(exercise=>{
    if(!exercise.name.toLowerCase().includes(exerciseQuery.trim().toLowerCase()))return false;
    if(active.exercises.includes(exercise.name))return true;
    return !dayMuscles.length||exercise.muscles.some(muscle=>dayMuscles.includes(muscle));
  }).map(exercise=>exercise.name);
  /* A day can hold an exercise the library no longer lists — renamed, disabled,
     or carried in from a legacy import. The removed chip panel used to be the
     only place those showed; without this they would be invisible AND
     unremovable, silently stuck on the day. */
  const orphanExercises=active.exercises.filter(name=>!strengthExercises.some(exercise=>exercise.name===name)&&name.toLowerCase().includes(exerciseQuery.trim().toLowerCase()));
  const visibleExercises=[...orphanExercises,...libraryMatches].sort((a,b)=>Number(active.exercises.includes(b))-Number(active.exercises.includes(a)));
  const musclesForExercises=(names:string[])=>Array.from(new Set(names.flatMap(name=>strengthExercises.find(item=>item.name===name)?.muscles.filter(muscle=>muscles.includes(muscle))||[])));
  /* Muscles are the athlete's to choose; exercises ADD their muscles to the
     day, they never replace a manual selection. */
  const addExercise=(exercise:string)=>{if(!exercise||active.exercises.includes(exercise))return;const next=[...active.exercises,exercise];updateDay({exercises:next,muscles:Array.from(new Set([...active.muscles,...musclesForExercises(next)]))})};
  const removeExercise=(exercise:string)=>{const next=active.exercises.filter(item=>item!==exercise);const remaining=musclesForExercises(next);const removedMuscles=strengthExercises.find(item=>item.name===exercise)?.muscles||[];updateDay({exercises:next,muscles:active.muscles.filter(muscle=>remaining.includes(muscle)||!removedMuscles.includes(muscle))})};
  const toggleExercise=(exercise:string)=>active.exercises.includes(exercise)?removeExercise(exercise):addExercise(exercise);
  const setPolicy=(policy:CardioPolicy)=>updateDay({cardioPolicy:policy});
  const setDayType=(dayType:DayType)=>updateDay({dayType,...(dayType==='strength'?{cardioPolicy:active.cardioPolicy==='planned'?'planned' as const:'forge' as const} : dayType==='cardio'?{muscles:[],exercises:[],cardioPolicy:'forge' as const}:dayType==='hyrox'?{muscles:[],exercises:[],cardioPolicy:'forge' as const,cardio:[]}:dayType==='mixed'?{cardioPolicy:active.cardioPolicy==='none'?'forge' as const:active.cardioPolicy}:{muscles:[],exercises:[],cardioPolicy:'none' as const,cardio:[]})});
  const saveCardio=(plan:PlannedCardio)=>{if(!cardioEditor)return;setDays(items=>items.map((day,index)=>{if(index!==cardioEditor.dayIndex)return day;const cardio=cardioEditor.cardioIndex===null?[...day.cardio,plan]:day.cardio.map((entry,entryIndex)=>entryIndex===cardioEditor.cardioIndex?plan:entry);return{...day,cardio,maxDuration:durationForDay(day,cardio)}}));setCardioEditor(null)};
  const removeCardio=(cardioIndex:number)=>{const cardio=active.cardio.filter((_,index)=>index!==cardioIndex);updateDay({cardio,maxDuration:durationForDay(active,cardio)})};
  const attachLibraryCardio=(workoutId:string)=>{const workout=cardioWorkouts.find(item=>String(item.id)===workoutId);if(workout?.plan){const cardio=[...active.cardio,{...workout.plan,id:Date.now()}];updateDay({cardio,cardioPolicy:'planned',maxDuration:durationForDay(active,cardio)})}};
  const reviewFindings=useMemo(()=>{const findings:string[]=[];const strengthDays=days.filter(day=>day.dayType==='strength'||day.dayType==='mixed');const cardioDays=days.filter(day=>day.cardioPolicy!=='none');const restDays=days.filter(day=>day.dayType==='rest');const emptyStrength=strengthDays.filter(day=>!day.exercises.length);if(emptyStrength.length)findings.push(`${emptyStrength.length} strength day${emptyStrength.length===1?' has':'s have'} no exercises selected.`);if(!cardioDays.length&&goals.some(goal=>goal.type==='Endurance'))findings.push('An endurance goal is active, but no split day currently permits cardio.');if(!restDays.length)findings.push('The cycle has no dedicated recovery day.');restDays.filter(day=>day.recoveryStyle==='Full rest'&&day.cardioPolicy!=='none').forEach(day=>findings.push(`${day.name} is marked Full rest but also permits cardio; confirm that is intentional.`));days.filter(day=>day.cardioPolicy==='planned'&&!day.cardio.length).forEach(day=>findings.push(`${day.name} expects planned cardio but has no attached option.`));return findings},[days,goals]);
  const openSplitReview=()=>{setReviewOpen(true);setTimeout(()=>document.getElementById('splitReviewPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),0)};
  const askSplitCoach=async()=>{const question=reviewQuestion.trim();if(!question)return;setReviewLoading(true);const fallback=reviewFindings.length?`The clearest issues are: ${reviewFindings.join(' ')} Keep the rolling strength order separate from calendar-week mileage and attach multiple cardio workouts as alternatives, not stacked sessions.`:`This split is structurally complete. Forge would preserve the rolling strength order, reconcile cardio by calendar week, and recommend only one attached cardio option per day.`;const response=await requestForgeCoach({question,scope:'plan',context:{rhythm,weeklyMileageBoundary:{minimum:minWeeklyMileage,maximum:maxWeeklyMileage},coachStrategy:strategy,days:days.map(day=>({name:day.name,type:day.dayType,muscles:day.muscles,exercises:day.exercises,cardioPolicy:day.cardioPolicy,cardioOptions:day.cardio.map(cardioPlanSummary),recoveryStyle:day.recoveryStyle,maxDuration:day.maxDuration})),findings:reviewFindings,goals:goals.map(goal=>({title:goal.title,type:goal.type,target:goal.target,date:goal.date}))}},fallback);setReviewAnswer(response.answer);setReviewLoading(false)};
  const addDay=()=>{const next:TrainingDay={name:`Training Day ${days.length+1}`,weekday:'MON',dayType:'strength',muscles:[],exercises:[],cardioPolicy:'none',cardio:[],recoveryStyle:'Full rest',strengthDuration:'60',maxDuration:'60'};setDays(items=>[...items,next]);setSelectedDay(days.length)};
  /* SWITCHING NEVER LOSES A SPLIT. Leaving the live split for another one, or
     for a new one, keeps it in the library first — saved or not — so the
     athlete can always switch back to what they had. */
  const savedEntry=library.find(item=>item.id===activeId);
  const unsaved=!savedEntry||savedEntry.name!==splitName||savedEntry.rhythm!==rhythm||JSON.stringify(savedEntry.days)!==JSON.stringify(days);
  const keepCurrent=()=>{const id=savedEntry?savedEntry.id:`split-${Date.now().toString(36)}`;const entry:SavedSplit={id,name:splitName.trim()||'My training split',rhythm,days,savedAt:new Date().toISOString()};return{id,items:savedEntry?library.map(item=>item.id===id?entry:item):[...library,entry]}};
  const saveSplit=()=>{tap();const kept=keepCurrent();setLibrary(kept.items);setActiveId(kept.id)};
  const switchSplit=(id:string)=>{const target=library.find(item=>item.id===id);if(!target||id===activeId)return;tap();setLibrary(keepCurrent().items);setActiveId(id);setSplitName(target.name);setRhythm(target.rhythm);setDays(target.days);setSelectedDay(0);setSheetDay(null);setShowTemplates(false)};
  const newSplit=()=>{tap();setLibrary(keepCurrent().items);setActiveId(null);setSplitName('New split');setDays([{name:'Training Day 1',weekday:'MON',dayType:'strength',muscles:[],exercises:[],cardioPolicy:'none',cardio:[],recoveryStyle:'Full rest',strengthDuration:'60',maxDuration:'60'}]);setSelectedDay(0);setSheetDay(null);setShowTemplates(true)};
  const forgetSplit=()=>{if(!savedEntry)return;tap();setLibrary(items=>items.filter(item=>item.id!==savedEntry.id));setActiveId(null)};
  const removeDay=()=>{if(days.length===1)return;setDays(items=>items.filter((_,index)=>index!==selectedDay));setSelectedDay(Math.max(0,selectedDay-1))};
  const moveDay=(direction:-1|1)=>{const destination=selectedDay+direction;if(destination<0||destination>=days.length)return;setDays(items=>{const next=[...items];[next[selectedDay],next[destination]]=[next[destination],next[selectedDay]];return next});setSelectedDay(destination)};
  const reorderDay=(from:number,to:number)=>{if(from===to||from<0||to<0||from>=days.length||to>=days.length)return;setDays(items=>{const next=[...items];const [moved]=next.splice(from,1);next.splice(to,0,moved);return next});setSelectedDay(current=>{if(current===from)return to;if(from<current&&to>=current)return current-1;if(from>current&&to<=current)return current+1;return current})};
  const policyLabel=(day:TrainingDay)=>day.cardioPolicy==='none'?'No cardio':day.cardioPolicy==='forge'?'Forge decides':day.cardio.length?cardioPlanSummary(day.cardio[0]):'Planned cardio needed';
  const downloadPlan=()=>{const weeks=buildLongRangePlan(goals,profile,24,records);const lines=['FORGE ADAPTIVE TRAINING PLAN',`${splitName} · ${rhythm==='rolling'?'Rolling cycle':'Weekly schedule'}`,`${weeks.length}-week goal-driven progression`,'',`Starting running volume: ${profile.weeklyMileage} mi/week`,`Running availability: ${profile.runningDays} days`,`Active goals: ${goals.map(goal=>goal.title).join(' · ')||'Baseline development'}`,'','AUTHORIZED SPLIT',...days.flatMap((day,index)=>[`${index+1}. ${day.name}${rhythm==='weekly'?` · ${day.weekday}`:''} · ${day.dayType.toUpperCase()}`,`   Focus: ${day.muscles.join(', ')||'Not set'}`,`   Strength: ${day.exercises.join(', ')||'None'}`,`   Cardio: ${policyLabel(day)}`]),'','LONG-RANGE ROADMAP',...weeks.flatMap(week=>[`WEEK ${week.week} · ${week.start} · ${week.phase}`,`   Weekly volume: ${week.mileage} mi${week.change?` · ${week.change>0?'+':''}${week.change}%`:''}`,`   Strength priority: ${week.topSet}`,`   Quality session: ${week.quality}`,`   Long run: ${week.longRun}`,`   Easy / recovery: ${week.easy}`,`   Coaching rationale: ${week.why} ${week.adjustment}`,'']),'ADAPTATION POLICY','Forge may change upcoming volume, interval structure, target load, session timing, substitutions, recovery work, deloads, and taper timing.','Forge will not silently change goals, protected rest days, assigned muscle groups, injury constraints, completed history, or an athlete-authored workout.'];const blob=new Blob([lines.join('\n')],{type:'text/plain'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='forge-adaptive-training-plan.txt';link.click();URL.revokeObjectURL(url)};
  const [sheetDay,setSheetDay]=useState<number|null>(null);
  const [editMuscles,setEditMuscles]=useState(false);
  const [showTemplates,setShowTemplates]=useState(()=>days.length<=1&&!days[0]?.exercises.length);
  const openDay=(index:number)=>{tap();setSelectedDay(index);setEditMuscles(false);setExerciseQuery('');setSheetDay(index)};
  const closeSheet=()=>setSheetDay(null);
  /* Two core lifts per day from the muscles it trains, so a template arrives
     ready to train rather than as seven empty days. */
  /* Matched on the lift's MAIN muscle, so Bench lands on a chest day and not
     on a day that only lists triceps. Deadlifts are hinges and belong to the
     legs, whatever muscle the library lists first (Back) — without this an
     Upper day was handed a Deadlift. */
  const mainMuscle=(exercise:{name:string;muscles:string[]})=>/deadlift/i.test(exercise.name)?'Hamstrings':exercise.muscles[0];
  const liftsFor=(dayMuscles:string[],taken:Set<string>)=>{const fits=strengthExercises.filter(exercise=>dayMuscles.includes(mainMuscle(exercise))).map(exercise=>exercise.name);const picked=coreFirst(fits).filter(name=>!taken.has(name)).slice(0,2);picked.forEach(name=>taken.add(name));return picked};
  const applyTemplate=(id:string)=>{const template=TEMPLATES.find(item=>item.id===id);if(!template)return;if(days.some(day=>day.exercises.length)&&!window.confirm('Replace your current split with this template?'))return;tap();const taken=new Set<string>();setDays(template.days.map(([name,dayType,dayMuscles],index)=>({name,weekday:['MON','TUE','WED','THU','FRI','SAT','SUN'][index%7],dayType,muscles:dayMuscles,exercises:dayType==='strength'?liftsFor(dayMuscles,taken):[],cardioPolicy:dayType==='strength'?'none':'forge',cardio:[],recoveryStyle:'Full rest',strengthDuration:'60',maxDuration:'60'})));setSelectedDay(0);setShowTemplates(false);if(splitName==='New split')setSplitName(template.label)};
  const daySummary=(day:TrainingDay)=>day.dayType==='rest'?(day.recoveryStyle==='Full rest'?'Rest':day.recoveryStyle):day.dayType==='hyrox'?'HYROX · Forge writes it':day.dayType==='cardio'?(day.cardioPolicy==='planned'&&day.cardio.length?cardioPlanSummary(day.cardio[0]):'Run · Forge plans it'):[day.exercises.slice(0,3).join(' · ')||'No lifts yet',day.dayType==='mixed'?'+ run':''].filter(Boolean).join(' ');
  const hasRunning=days.some(day=>day.dayType==='cardio'||day.dayType==='mixed'||day.dayType==='hyrox')||goals.some(goal=>goal.type==='Endurance');
  return <div className="stack-xl training-plan-page plan-studio">
    {cardioEditor&&<CardioPlanBuilder initial={cardioEditor.cardioIndex===null?undefined:days[cardioEditor.dayIndex].cardio[cardioEditor.cardioIndex]} onClose={()=>setCardioEditor(null)} onSave={saveCardio}/>}
    {tab==='split'&&strategy.updatedAt&&<section className="coach-plan-banner"><div><span>AI COACH ADJUSTMENT ACTIVE</span><strong>{profile.weeklyMileage} mi/week · {strategy.loadBiasPercent>0?'+':''}{strategy.loadBiasPercent}% generated load · {strategy.splitEmphasis} emphasis</strong><small>{strategy.lastAdjustment||'Your confirmed coaching preferences now shape future Forge workouts.'}</small></div><button className="button ghost" onClick={openSplitReview}>Review split</button></section>}
    {tab==='split'&&reviewOpen&&<section className="card split-review-panel" id="splitReviewPanel"><header><div><span className="eyebrow">FORGE SPLIT REVIEW</span><h2>{reviewFindings.length?`${reviewFindings.length} item${reviewFindings.length===1?'':'s'} to review`:'Split structure looks complete'}</h2><p>Forge reviews the saved structure without rewriting completed history or applying changes automatically.</p></div><button className="text-button" onClick={()=>setReviewOpen(false)}>Close</button></header><div className="split-review-summary"><div><strong>{days.length}</strong><span>cycle days</span></div><div><strong>{days.filter(day=>day.dayType==='strength'||day.dayType==='mixed').length}</strong><span>strength days</span></div><div><strong>{days.filter(day=>day.cardioPolicy!=='none').length}</strong><span>cardio windows</span></div><div><strong>{days.reduce((sum,day)=>sum+day.cardio.length,0)}</strong><span>attached options</span></div></div><div className="split-review-findings">{reviewFindings.length?reviewFindings.map((finding,index)=><div key={finding}><span>{index+1}</span><p>{finding}</p></div>):<div className="clear"><span><Icon name="check"/></span><p>Every strength day has exercises, every cardio day has a source, and the cycle includes recovery.</p></div>}</div><div className="split-review-coach"><div><span className="eyebrow">ASK FORGE ABOUT THIS SPLIT</span><p>Ask about balance, recovery, exercise order, cardio scheduling, or a specific day.</p></div><div><textarea rows={2} value={reviewQuestion} onChange={event=>setReviewQuestion(event.target.value)} placeholder="Example: Is my lower-body work too close to the long run?"/><button className="button" disabled={reviewLoading||!reviewQuestion.trim()} onClick={askSplitCoach}>{reviewLoading?'Reviewing…':'Ask Forge'}</button></div>{reviewAnswer&&<article><span>FORGE REVIEW</span><p>{reviewAnswer}</p></article>}</div></section>}
    {tab==='program'&&(goals.length?<AiProgramPlan goals={goals} profile={{...profile,weeklyMileage:Math.max(minWeeklyMileage,Math.min(maxWeeklyMileage||Infinity,profile.weeklyMileage))}} rhythm={rhythm} minWeeklyMileage={minWeeklyMileage} maxWeeklyMileage={maxWeeklyMileage} splitDays={days.map(day=>({name:day.name,dayType:day.dayType,muscles:day.muscles,exercises:day.exercises,cardioPolicy:day.cardioPolicy,cardio:day.cardio}))}/>:<section className="card plan-empty"><h2>Add a goal to build your plan</h2><p>Your split tells Forge when you can train. A goal tells it what progression to build.</p><Link className="button" to="/goals">Create a goal</Link></section>)}
    {tab==='split'&&<div className="split-simple">
      {/* ONE LIST, ONE SHEET. The split was a sideways strip of day cards over
          a single long form — name, time, up/down/remove, ten muscle chips,
          five day types, the whole exercise library, cardio policy and three
          recovery styles, all at once for whichever day was selected. Now the
          days are a list that reads like the week, and a day opens into a
          sheet that shows only what its type needs. */}
      {/* YOUR SPLITS, AT THE TOP. Tap one to train from it, ＋ New to start
          another from a template; the live split is always the highlighted one. */}
      <section className="ss-library" aria-label="Your splits">
        <div className="ss-library-row">
          {library.map(item=><button type="button" key={item.id} className={item.id===activeId?'active':''} aria-pressed={item.id===activeId} onClick={()=>switchSplit(item.id)}>{item.id===activeId?(splitName.trim()||item.name):item.name}</button>)}
          {!savedEntry&&<button type="button" className="active" aria-pressed="true">{splitName.trim()||'My training split'}</button>}
          <button type="button" className="ss-library-new" onClick={newSplit}>＋ New</button>
        </div>
        <button type="button" className="ss-library-save" disabled={!unsaved} onClick={saveSplit}>{!savedEntry?'Add to my splits':unsaved?'Update':'In my splits'}</button>
      </section>
      <header className="ss-head"><div><h2>{splitName}</h2><small>{days.length} {days.length===1?'day':'days'} · {rhythm==='weekly'?'by weekday':'repeats in order'}</small></div><small className={`split-autosave ${syncState}`}>{syncState==='saving'?'Saving…':syncState==='error'?'Saved here · will retry':'Saved'}</small></header>
      {/* Only for someone who runs: a lifter's split opened on two empty mileage boxes.
          It leads the split: the week's running is the frame the days sit in. */}
      {hasRunning&&<section className="card ss-mileage"><div><strong>Weekly running</strong><small>Forge keeps your running between these, in miles a week.</small></div><div className="ss-mileage-fields"><label>From<NumberInput min="0" allowDecimal={false} value={minWeeklyMileage} onChange={next=>setMinWeeklyMileage(next ?? 0)}/></label><label>To<NumberInput min={minWeeklyMileage} allowDecimal={false} value={maxWeeklyMileage} onChange={next=>setMaxWeeklyMileage(next ?? 0)}/></label></div></section>}
      {showTemplates?<section className="ss-templates"><div className="ss-templates-head"><strong>Start from a template</strong>{days.some(day=>day.exercises.length)&&<button type="button" className="text-button" onClick={()=>setShowTemplates(false)}>Cancel</button>}</div>
        {TEMPLATES.map(template=><button type="button" key={template.id} onClick={()=>applyTemplate(template.id)}><strong>{template.label}</strong><small>{template.copy}</small></button>)}
      </section>:null}
      <ol className="ss-days">{days.map((day,index)=><li key={`${day.name}-${index}`} className={`ss-day ss-${day.dayType}`}>
        <button type="button" onClick={()=>openDay(index)}>
          <span className="ss-num">{rhythm==='weekly'?day.weekday.slice(0,2):index+1}</span>
          <span className="ss-text"><strong>{day.name}</strong><small>{daySummary(day)}</small></span>
          <span className="ss-chev" aria-hidden="true">›</span>
        </button>
      </li>)}</ol>
      <div className="ss-actions"><button type="button" className="ss-add" onClick={()=>{tap();addDay();setSheetDay(days.length)}}>＋ Add a day</button>{!showTemplates&&<button type="button" className="text-button" onClick={()=>setShowTemplates(true)}>Use a template</button>}</div>
      <details className="card ss-settings"><summary><span><strong>Name &amp; schedule</strong><small>{splitName} · {rhythm==='weekly'?'Weekly':'Rolling'}</small></span></summary><div><label>Split name<input value={splitName} onChange={event=>setSplitName(event.target.value)}/></label><label>Schedule<select value={rhythm} onChange={event=>setRhythm(event.target.value as 'rolling'|'weekly')}><option value="rolling">Repeat in order (rolling)</option><option value="weekly">Fixed weekdays</option></select></label><small>Rolling means the next day is whatever comes after the last one you trained. Fixed weekdays ties each day to a day of the week.</small>{savedEntry&&<button type="button" className="text-button ss-forget" onClick={forgetSplit}>Remove from saved splits</button>}</div></details>
    </div>}
    {tab==='split'&&sheetDay!==null&&active&&<div className="ss-backdrop" onClick={event=>{if(event.target===event.currentTarget)closeSheet()}}>
      <section className="ss-sheet" role="dialog" aria-modal="true" aria-label={`Edit ${active.name}`}>
        <span className="ss-grabber" aria-hidden="true"/>
        <header className="ss-sheet-head"><span>Day {selectedDay+1}</span><strong>{active.name||'New day'}</strong><button type="button" className="ss-done" onClick={()=>{tap();closeSheet()}}>Done</button></header>
        <div className="ss-sheet-body">
          <label className="ss-field">Name<input value={active.name} onChange={event=>updateDay({name:event.target.value})} placeholder="e.g. Upper, Legs, Long Run"/></label>
          <div className="ss-segment" role="radiogroup" aria-label="Day type">{DAY_TYPES.map(([type,label])=><button type="button" role="radio" aria-checked={active.dayType===type} key={type} className={active.dayType===type?'active':''} onClick={()=>{tap();setDayType(type)}}>{label}</button>)}</div>
          {rhythm==='weekly'&&<div className="ss-chips" aria-label="Weekday">{['MON','TUE','WED','THU','FRI','SAT','SUN'].map(weekday=><button type="button" key={weekday} className={active.weekday===weekday?'active':''} onClick={()=>{tap();updateDay({weekday})}}>{weekday[0]+weekday.slice(1).toLowerCase()}</button>)}</div>}
          {(active.dayType==='strength'||active.dayType==='mixed')&&<section className="ss-block">
            <div className="ss-block-head"><strong>Lifts</strong><small>{active.exercises.length?`${active.exercises.length} chosen`:'Pick at least one'}</small></div>
            {/* Lifts first; the muscles follow from them. The muscle list is one
                line under the lifts, editable but rarely needed. */}
            <p className="ss-trains">Trains {active.muscles.length?active.muscles.join(' · '):'—'} <button type="button" className="text-button" onClick={()=>setEditMuscles(open=>!open)}>{editMuscles?'Done':'Edit'}</button></p>
            {editMuscles&&<div className="ss-chips">{muscles.map(muscle=><button type="button" key={muscle} className={active.muscles.includes(muscle)?'active':''} onClick={()=>{tap();toggleMuscle(muscle)}}>{muscle}</button>)}</div>}
            <SearchField className="ss-search" value={exerciseQuery} onChange={setExerciseQuery} placeholder="Search lifts" aria-label="Search lifts"/>
            <div className="ss-lifts">{visibleExercises.length?visibleExercises.map(exercise=>{const selected=active.exercises.includes(exercise);return <button type="button" key={exercise} aria-pressed={selected} className={selected?'selected':''} onClick={()=>{tap();toggleExercise(exercise)}}><span className="ss-check" aria-hidden="true">{selected?<Icon name="check" size={14} stroke={3}/>:''}</span>{exercise}</button>}):<p className="ss-empty">{exerciseQuery.trim()?'No lifts match that search.':'No lifts in your library for these muscles yet.'}</p>}</div>
            <div className="ss-block-head"><strong>Time</strong></div>
            <div className="ss-chips">{['30','45','60','75','90'].map(value=><button type="button" key={value} className={(active.strengthDuration||'60')===value?'active':''} onClick={()=>{tap();updateDay({strengthDuration:value})}}>{value} min</button>)}</div>
          </section>}
          {(active.dayType==='cardio'||active.dayType==='mixed')&&<section className="ss-block">
            <div className="ss-block-head"><strong>Running</strong></div>
            <div className="ss-segment two"><button type="button" className={active.cardioPolicy!=='planned'?'active':''} onClick={()=>{tap();setPolicy('forge')}}>Forge plans it</button><button type="button" className={active.cardioPolicy==='planned'?'active':''} onClick={()=>{tap();setPolicy('planned')}}>My own workout</button></div>
            {active.cardioPolicy==='planned'&&<div className="planned-cardio-list">{active.cardio.map((plan,index)=><article key={plan.id}><div><strong>{cardioPlanSummary(plan)}</strong></div><div><button onClick={()=>setCardioEditor({dayIndex:selectedDay,cardioIndex:index})}>Edit</button><button onClick={()=>removeCardio(index)}>Remove</button></div></article>)}{cardioWorkouts.length>0&&<label className="attach-library-cardio">Saved workouts<select value="" onChange={event=>attachLibraryCardio(event.target.value)}><option value="">Choose one</option>{cardioWorkouts.map(workout=><option value={workout.id} key={workout.id}>{workout.name} · {workout.summary}</option>)}</select></label>}<button onClick={()=>setCardioEditor({dayIndex:selectedDay,cardioIndex:null})}>＋ Build a workout</button></div>}
          </section>}
          {active.dayType==='hyrox'&&<p className="ss-note">Forge writes this session: stations at race distance and runs paced off your threshold. Set a HYROX goal for your division and date.</p>}
          {active.dayType==='rest'&&<section className="ss-block"><div className="ss-block-head"><strong>Rest day</strong></div><div className="ss-segment three">{(['Full rest','Mobility','Active recovery'] as const).map(style=><button type="button" key={style} className={active.recoveryStyle===style?'active':''} onClick={()=>{tap();updateDay({recoveryStyle:style})}}>{style==='Active recovery'?'Active':style}</button>)}</div></section>}
        </div>
        <footer className="ss-sheet-foot">
          <button type="button" onClick={()=>{tap();moveDay(-1);setSheetDay(Math.max(0,selectedDay-1))}} disabled={selectedDay===0}><Icon name="up" size={15}/> Earlier</button>
          <button type="button" onClick={()=>{tap();moveDay(1);setSheetDay(Math.min(days.length-1,selectedDay+1))}} disabled={selectedDay===days.length-1}><Icon name="down" size={15}/> Later</button>
          <button type="button" className="danger" disabled={days.length===1} onClick={()=>{if(!window.confirm(`Delete ${active.name}?`))return;removeDay();closeSheet()}}>Delete</button>
        </footer>
      </section>
    </div>}
  </div>;
}
