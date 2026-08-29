import { createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { isDemoMode } from '../../lib/env';
import { buildDailyRecommendation,recommendationFingerprint,DAILY_RECOMMENDATION_VERSION,type DailyRecommendation,type RecommendationSplitDay } from '../../lib/dailyRecommendationEngine';
import { useAuth } from '../auth/AuthProvider';
import { useGoals } from '../goals/GoalsProvider';
import { useProfileSetup } from '../profile/ProfileSetupProvider';
import { useAdaptiveTraining } from './AdaptiveTrainingProvider';
import { useCoachingStrategy } from './CoachingStrategyProvider';
import { useTrainingLibrary } from './TrainingLibraryProvider';
import { useWorkoutHistory } from './WorkoutHistoryProvider';
import { loadCycleSnapshot,loadDailyRecommendation,saveDailyRecommendation,type CycleSnapshot } from './dailyRecommendationService';
import { readLocalAiPlan,currentWeekIndex,wavePrescription,waveSlot,goalLiftNames,testsOneRepMax,resolveWeekRunning,weekCycleDays,bestsFromHistory,chooseMaxAttemptDays,isRestDay } from './aiPlanService';
import { calculateEstimatedOneRepMax } from '../../lib/strength';
import { canonicalLiftKey,sameLift, splitDayKey } from '../../lib/liftAliases';

type Value={recommendation:DailyRecommendation|null;loading:boolean;syncError:string|null;toggleTopSet:(id:string)=>void;setCardioSelected:(selected:boolean)=>void;markCompleted:()=>void;refresh:()=>void};
const Context=createContext<Value|null>(null);
const isoToday=()=>{const date=new Date();return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};

function localSplitDays():RecommendationSplitDay[]{
  try{const saved=JSON.parse(localStorage.getItem('forge-training-plan-v1')||'null') as {days?:Array<{name:string;dayType:string;muscles?:string[];exercises?:string[];cardio?:unknown[];cardioPolicy?:string}>}|null;return(saved?.days||[]).map((day,index)=>({position:index+1,name:day.name||`Day ${index+1}`,type:['strength','cardio','mixed','rest'].includes(day.dayType)?day.dayType as RecommendationSplitDay['type']:'rest',muscles:day.muscles||[],exercises:day.exercises||[],cardioTypes:day.dayType==='cardio'||day.dayType==='mixed'?['Forge']:[]}))}catch{return[]}
}

export function DailyRecommendationProvider({children}:{children:ReactNode}){
  const {user}=useAuth();const {goals}=useGoals();const {records}=useWorkoutHistory();const {profile,recovery,history}=useAdaptiveTraining();const {setup}=useProfileSetup();const {exercises}=useTrainingLibrary();const {strategy}=useCoachingStrategy();
  const [cycle,setCycle]=useState<CycleSnapshot>({nextPosition:1,revision:0,days:[]});const [stored,setStored]=useState<DailyRecommendation|null>(null);const [loading,setLoading]=useState(!isDemoMode);const [syncError,setSyncError]=useState<string|null>(null);const [refreshKey,setRefreshKey]=useState(0);
  /* A user-requested regenerate must WIN over the saved snapshot: without
     this flag the reload finds the old row, its fingerprint still matches,
     and the button hands back exactly the card it was asked to replace. */
  const forceRegenerate=useRef(false);
  useEffect(()=>{const refreshCycle=()=>setRefreshKey(key=>key+1);window.addEventListener('forge-training-cycle-changed',refreshCycle);window.addEventListener('forge-ai-plan-changed',refreshCycle);return()=>{window.removeEventListener('forge-training-cycle-changed',refreshCycle);window.removeEventListener('forge-ai-plan-changed',refreshCycle)}},[]);
  const fallbackDays=useMemo(()=>{const local=localSplitDays();if(local.length)return local;return(setup?.splitDays||[]).map((day,index)=>({position:index+1,name:day.name||`Day ${index+1}`,type:day.type.toLowerCase() as RecommendationSplitDay['type'],muscles:day.muscles||[],exercises:[],cardioTypes:day.type==='Cardio'||day.type==='Mixed'?['Forge']:[]}))},[setup,refreshKey]);
  useEffect(()=>{if(isDemoMode||!user){setCycle(current=>({...current,days:fallbackDays}));setLoading(false);return}let active=true;setLoading(true);void loadCycleSnapshot(user.id).then(next=>{if(active){setCycle(next);setSyncError(null)}}).catch(error=>{if(active){setCycle(current=>({...current,days:fallbackDays}));setSyncError(error instanceof Error?error.message:'Could not load your split position.')}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[user,fallbackDays,refreshKey]);
  const days=cycle.days.length?cycle.days:fallbackDays;const trainingDays=days.filter(day=>day.type!=='rest');
  /* Inference walks the WHOLE split, rest included. Matching the last logged
     day against trainingDays only meant the day after a rest day's neighbour
     was the next TRAINING day — the rest day was never a candidate, so the
     cycle silently shortened by one every lap. */
  const inferredPosition=useMemo(()=>{
    if(!days.length)return 1;
    const latest=[...records].filter(record=>(record.topSets||[]).length||(record.cardioSessions||[]).length||record.muscles.some(muscle=>muscle!=='Cardio')).sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(!latest)return (trainingDays[0]||days[0]).position;
    let completedIndex=latest.splitPosition?days.findIndex(day=>day.position===latest.splitPosition):-1;
    if(completedIndex<0){
      const recordMuscles=new Set(latest.muscles.map(muscle=>muscle.toLowerCase()));
      const scored=days.map((day,index)=>({index,score:day.muscles.filter(muscle=>recordMuscles.has(muscle.toLowerCase())).length+(day.type==='cardio'&&latest.hasCardio?1:0)})).sort((a,b)=>b.score-a.score);
      if(scored[0]?.score)completedIndex=scored[0].index;
    }
    const next=days[(Math.max(-1,completedIndex)+1)%days.length];
    /* Same calendar rule as the stored cursor: rest is owed the day after
       training and no longer. */
    const gap=Math.round((new Date(`${isoToday()}T12:00:00`).getTime()-new Date(`${latest.date}T12:00:00`).getTime())/86400000);
    if(next.type==='rest'&&gap>=2){const nextIndex=days.findIndex(day=>day.position===next.position);return (days[(nextIndex+1)%days.length]||next).position}
    return next.position;
  },[records,days,trainingDays]);
  /* A REST DAY IS A DAY IN THE SPLIT. Every cursor path resolved against
     trainingDays — the split with rest filtered OUT — so a cursor landing on a
     rest day found nothing at or after it and wrapped to the first training
     day. Rest could never be shown: the cycle jumped from Sharms 2 straight to
     Chest & Back while the Plan tab was still scheduling the rest day. The
     cursor now walks the whole split.

     Rest is satisfied by the calendar, not by logging: it is due only until
     the day it fell on has passed, so the athlete rests today and the next
     training day is up tomorrow without tapping anything. Logging a workout
     anyway advances the cycle exactly as before. */
  const lastLoggedDate=useMemo(()=>[...records].filter(record=>(record.topSets||[]).length||(record.cardioSessions||[]).length).sort((a,b)=>b.date.localeCompare(a.date))[0]?.date||'',[records]);
  const nextAfter=(position:number)=>days.find(day=>day.position>position)||days[0];
  const statePosition=(()=>{
    const atCursor=days.find(day=>day.position===cycle.nextPosition)||days.find(day=>day.position>cycle.nextPosition)||days[0];
    if(!atCursor)return trainingDays[0]?.position;
    /* Rest falls on the day AFTER the last logged session, so it is due while
       that gap is a single day. Once two days have passed the rest has been
       had and the next training day is up — an athlete away for a week is not
       owed a week of rest days. */
    const daysSinceLogged=lastLoggedDate?Math.round((new Date(`${isoToday()}T12:00:00`).getTime()-new Date(`${lastLoggedDate}T12:00:00`).getTime())/86400000):0;
    if(atCursor.type==='rest'&&daysSinceLogged>=2)return nextAfter(atCursor.position)?.position??atCursor.position;
    return atCursor.position;
  })();
  const duePosition=cycle.revision>0?(statePosition||cycle.nextPosition):inferredPosition;
  const splitDay=days.find(day=>day.position===duePosition)||trainingDays[0]||days[0]||{position:1,name:'Start training',type:'strength' as const,muscles:[],exercises:[],cardioTypes:[]};
  const date=isoToday();
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  const aiPlanStamp=useMemo(()=>readLocalAiPlan()?.generatedAt||'',[refreshKey]);
  /* The goal gate decides whether max week tests a lift, so the overlay MUST
     recompute when goals arrive. Without this the memo ran once against an
     empty goals list and the athlete's goal lift held a double on max week. */
  const goalStamp=useMemo(()=>goals.filter(goal=>goal.type==='Strength').map(goal=>`${goal.exercise}`).sort().join('|'),[goals]);
  /* A daily row is keyed to the athlete's running preferences and split, not
     just the date: a snapshot saved when the split had not loaded said "no
     cardio today" and outlived the correction, because the fingerprint never
     mentioned those inputs. */
  /* The overlay reads the split list and the athlete's running preferences to
     place cardio. Both arrive asynchronously, so the memo must recompute when
     they do — otherwise it decides "no run today" against an empty split and
     never revisits it. */
  const planInputsStamp=useMemo(()=>[days.map(day=>day.name).join('|'),setup?.runningDays,setup?.minWeeklyMileage,setup?.maxWeeklyMileage].join('::'),[days,setup?.runningDays,setup?.minWeeklyMileage,setup?.maxWeeklyMileage]);
  const inputFingerprint=useMemo(()=>recommendationFingerprint({date,splitDay,exercises,records,goals,loadBiasPercent:strategy.loadBiasPercent,cycleRevision:cycle.revision,aiPlanStamp,planInputsStamp}),[planInputsStamp,date,splitDay,exercises,records,goals,strategy.loadBiasPercent,cycle.revision,aiPlanStamp]);
  const generatedBase=useMemo(()=>buildDailyRecommendation({date,splitDay,exercises,records,goals,recovery,profile,runningHistory:history,loadBiasPercent:strategy.loadBiasPercent,inputFingerprint}),[date,splitDay,exercises,records,goals,recovery,profile,history,strategy.loadBiasPercent,inputFingerprint]);
  /* The stored AI program is authoritative for today's numbers: when its
     current week prescribes a top set for this split day, that exercise,
     weight, and reps replace the engine's guess — so Today, Plan, and the
     coach all quote the same prescription. */
  const generated=useMemo(()=>{
    const storedPlan=readLocalAiPlan();
    if(!generatedBase||!storedPlan)return generatedBase;
    const rawWeek=storedPlan.plan.weeks[currentWeekIndex(storedPlan)];
    if(!rawWeek)return generatedBase;
    /* Same correction the Plan page applies: the athlete's stated running days
       and mileage floor decide the week, so Today never comes up empty on a
       day the plan simply forgot to schedule. */
    /* THE SAME WINDOW THE PLAN PAGE MEASURES — computed by the same helper,
       from the plan's own start date. Rotating the cycle to start on today
       instead produced a different set of easy days and therefore a different
       split of the week's miles: Today said 6.5 mi for the run the Plan tab
       called 3.5. One window, one answer. */
    const planRhythm=(()=>{try{return (JSON.parse(localStorage.getItem('forge-training-plan-v1')||'null')?.rhythm==='weekly'?'weekly':'rolling') as 'weekly'|'rolling'}catch{return 'rolling' as const}})();
    const windowDays=weekCycleDays(storedPlan.startDate,currentWeekIndex(storedPlan),days,planRhythm,{position:generatedBase.splitDay.position});
    const week=resolveWeekRunning(rawWeek,windowDays,{runningDays:Number(setup?.runningDays)||profile?.runningDays,minWeeklyMileage:Number(setup?.minWeeklyMileage)||0,maxWeeklyMileage:Number(setup?.maxWeeklyMileage)||0,weeklyMileage:Number(setup?.weeklyMileage)||profile?.weeklyMileage},{weekIndex:currentWeekIndex(storedPlan),blockWeeks:storedPlan.plan.weeks.length});
    /* THE PLAN OWNS TODAY'S CARDIO. The engine's weekly generator was a
       second opinion that could contradict the block — 4 × 200 m on a leg
       day the plan had given an easy run. With a stored plan, today's cardio
       is exactly the plan's placement for this split day: long run on
       longRunDay, quality on qualityDay (never on a lower-body day), the
       plan's easy run on its easy days, and NOTHING anywhere else. */
    const dayName=generatedBase.splitDay.name;
    const LOWER=['Quads','Hamstrings','Glutes','Calves'];
    const lowerBody=(generatedBase.splitDay.muscles||[]).some(muscle=>LOWER.includes(muscle))
      ||(week.topSets||[]).some(set=>splitDayKey(set.splitDay)===splitDayKey(dayName)&&/squat|deadlift|lunge|leg press|rdl/i.test(set.exercise))
      ||/\bleg/i.test(dayName);
    const planSession=(role:'Long'|'Quality'|'Easy',title:string,summary:string,rationale:string,plan:Record<string,unknown>):NonNullable<DailyRecommendation['cardio']>=>({
      id:`plan-cardio-${role.toLowerCase()}-${week.week}`,title,summary,rationale,selected:true,
      session:{id:`plan-${role.toLowerCase()}-${week.week}`,goal:'AI program',event:'Custom Run',role,title,phase:week.phase,week:week.week,
        plan:{id:Date.now(),targetSource:'Goal generated',...plan} as never,
        rationale,placement:dayName,stress:role==='Quality'?'High':role==='Long'?'Moderate':'Low',progression:'',scaleNotes:[],status:'Scheduled'},
    });
    const planCardio=(()=>{
      if(week.longRunMiles>0&&week.longRunDay===dayName)
        return planSession('Long','Long run',`Long Run · ${week.longRunMiles} mi @ ${week.longRunPace}`,`Week ${week.week} long run from your program.`,{structure:'Steady',activity:'Long Run',distance:String(week.longRunMiles),distanceUnit:'miles',pace:week.longRunPace});
      if(week.quality&&!/no goal/i.test(week.quality)&&week.qualityDay===dayName&&!lowerBody)
        return planSession('Quality',week.quality,`${week.quality}${week.qualityPace?` @ ${week.qualityPace}`:''}`,`Week ${week.week} quality session from your program.`,{structure:'Custom',activity:'Quality Run',customTarget:`${week.quality}${week.qualityPace?` @ ${week.qualityPace}`:''}`});
      if((week.easyDays||[]).includes(dayName)){
        /* Today's easy run is the distance this day was allotted, at the
           athlete's easy pace — the same number the week's mileage sums. */
        const easyIndex=(week.easyDays||[]).indexOf(dayName);
        const miles=week.easyRuns?.[easyIndex>=0?easyIndex:0];
        if(miles)return planSession('Easy','Easy run',`Easy Run · ${miles} mi @ ${week.easyPace}`,`Week ${week.week} easy volume from your program${lowerBody?' — easy only alongside heavy legs':''}.`,{structure:'Steady',activity:'Easy Run',distance:String(miles),distanceUnit:'miles',pace:week.easyPace});
        if(week.easyMinutes>0)return planSession('Easy','Easy run',`Easy Run · ${week.easyMinutes} min @ ${week.easyPace}`,`Week ${week.week} easy volume from your program${lowerBody?' — easy only alongside heavy legs':''}.`,{structure:'Steady',activity:'Easy Run',duration:String(week.easyMinutes),pace:week.easyPace});
      };
      return undefined;
    })();
    const cardioBase={...generatedBase,cardio:planCardio};
    const rawMatch=week?.topSets?.find(set=>set.splitDay===generatedBase.splitDay.name)||week?.topSets?.find(set=>splitDayKey(set.splitDay)===splitDayKey(generatedBase.splitDay.name));
    if(!rawMatch)return cardioBase;
    /* THE GOAL LIFT OWNS ITS DAY — same repair the Plan page applies, so
       Today never prescribes a machine variation on a day that maps the
       athlete's actual goal lift. */
    const dayOwner=(generatedBase.splitDay.exercises||[]).find(name=>goalLiftNames(goals).has(canonicalLiftKey(name)));
    const match=dayOwner&&canonicalLiftKey(dayOwner)!==canonicalLiftKey(rawMatch.exercise)?{...rawMatch,exercise:dayOwner}:rawMatch;
    /* EVERY recommended top set runs the same 8/6/4/2/1 wave — not just the
       day's goal lift. An accessory used to come from a separate progression,
       so one card on the day said "8-rep week" while the next said something
       else. Each lift now waves off ITS OWN calculated max through inverse
       Epley, from the athlete's current logged best: a PR yesterday raises
       today, a miss holds the wave. Only the goal-lift rule differs at the
       top of the wave — a tested single belongs to goal lifts alone; every
       other lift takes the heavy double instead. A lift with no logged
       history keeps the engine's baseline suggestion, since there is no max
       to wave off yet. */
    const weekIdx=currentWeekIndex(storedPlan);
    const metric=Boolean(setup?.units==='Metric');
    const goalLifts=goalLiftNames(goals);
    /* Shared builder. This was a fourth copy, and its bare Epley read a logged
       405x1 as a 419 max — inflating a true single by 3.3% and prescribing off
       the inflated number. */
    const {bests:liveBests,singles:liveSingles}=bestsFromHistory(records);
    /* ONE ATTEMPT PER LIFT PER WEEK, THE SAME ONE THE PLAN TAB PICKS. A
       rolling split shorter than seven days hits the same day twice inside a
       week; the Plan tab demoted the second exposure to the heavy double and
       Today did not, so the athlete was told to attempt a true single on both.
       `windowDays[0]` is today — the same window the running math uses — so
       both screens choose the same day. */
    const attemptDays=chooseMaxAttemptDays(windowDays.map((day,index)=>{
      const set=(week.topSets||[]).find(entry=>entry.splitDay===day.name);
      const key=set?canonicalLiftKey(set.exercise):'';
      const best=key?liveBests.get(key)||0:0;
      const live=best?wavePrescription(best,weekIdx,metric,liveSingles.get(key)||0,testsOneRepMax(set!.exercise,goalLifts)):null;
      return{
        exercise:set?.exercise,
        reps:live?.reps,
        hasHold:Boolean(live?.isMax),
        cost:(day.name===week.longRunDay?2:0)+(day.name===week.qualityDay?3:0)+((week.easyDays||[]).includes(day.name)?1:0)+index*0.01,
      };
    }));
    const todayHoldsTheAttempt=attemptDays.has(0);
    const isMaxWeek=waveSlot(weekIdx).isMax;
    const waveFor=(exercise:string,fallback:{weight:number;reps:number})=>{
      const key=canonicalLiftKey(exercise);
      const live={best:liveBests.get(key)||0,single:liveSingles.get(key)||0};
      const tests=testsOneRepMax(exercise,goalLifts);
      /* No logged history for this lift yet: nothing to wave off, so the
         engine's baseline stands and the card still asks for a first set. */
      if(!live.best)return{weight:fallback.weight,reps:fallback.reps,isMax:false,source:'baseline' as const,rationale:`Week ${week.week} of your program (${week.phase}) — log this lift once and it joins the wave.`};
      /* A tested single the athlete is not taking today falls back to the
         double the lift already earned, rather than being offered twice. */
      const prescription=wavePrescription(live.best,weekIdx,metric,live.single,tests&&todayHoldsTheAttempt);
      const slotLabel=prescription.isMax?'MAX WEEK — 1RM attempt':isMaxWeek?(tests?'MAX WEEK — the attempt is scheduled on another day this week':'MAX WEEK — heavy double, no goal on this lift'):`${prescription.reps}-rep week`;
      /* A waved number IS derived from logged history — Today only prints a
         weight when the set says so, and an unwaved 'baseline' flag was
         hiding real prescriptions behind "Log a baseline set". */
      return{...prescription,source:'history' as const,rationale:`8/6/4/2/1 wave · week ${week.week} (${slotLabel}) · from your best calc max ${live.best}.`};
    };
    /* The day's plan prescription leads with the goal lift; every other set
       keeps its own exercise and simply joins the wave. */
    let applied=false;
    const topSets=cardioBase.topSets.map(set=>{
      const leads=!applied&&(sameLift(set.exercise,match.exercise)||!generatedBase.topSets.some(other=>sameLift(other.exercise,match.exercise))&&set===generatedBase.topSets[0]);
      if(leads)applied=true;
      const exercise=leads?match.exercise:set.exercise;
      const wave=waveFor(exercise,set);
      return{...set,exercise,weight:wave.weight,reps:wave.reps,source:wave.source,calculatedMax:calculateEstimatedOneRepMax(wave.weight,wave.reps)||0,rationale:wave.rationale};
    });
    return{...cardioBase,topSets};
  },[generatedBase,aiPlanStamp,goalStamp,planInputsStamp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(isDemoMode||!user){setStored(current=>current?.status==='completed'||current?.inputFingerprint===inputFingerprint?current:generated);return}let active=true;setLoading(true);void loadDailyRecommendation(user.id,date).then(async existing=>{if(!active)return;if(forceRegenerate.current&&existing?.status!=='completed'){forceRegenerate.current=false;const saved=await saveDailyRecommendation(user.id,generated);if(active)setStored(saved);return}forceRegenerate.current=false;if(existing?.status==='completed'||(existing?.algorithmVersion===DAILY_RECOMMENDATION_VERSION&&existing?.inputFingerprint===inputFingerprint)){setStored(existing);return}const saved=await saveDailyRecommendation(user.id,generated);if(active)setStored(saved)}).then(()=>{if(active)setSyncError(null)}).catch(error=>{if(active){setStored(generated);setSyncError(error instanceof Error?error.message:'Could not save today’s recommendation.')}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[user,date,inputFingerprint,generated]);
  const persist=useCallback((next:DailyRecommendation)=>{setStored(next);if(!isDemoMode&&user)void saveDailyRecommendation(user.id,next).then(setStored).catch(error=>setSyncError(error instanceof Error?error.message:'Could not save recommendation choices.'))},[user]);
  const recommendation=stored||generated;
  const value=useMemo<Value>(()=>({recommendation,loading,syncError,toggleTopSet:id=>{if(!recommendation)return;persist({...recommendation,topSets:recommendation.topSets.map(set=>set.id===id?{...set,selected:!set.selected}:set)})},setCardioSelected:selected=>{if(!recommendation?.cardio)return;persist({...recommendation,cardio:{...recommendation.cardio,selected}})},markCompleted:()=>{if(recommendation)setStored({...recommendation,status:'completed'})},refresh:()=>{forceRegenerate.current=true;setStored(null);setRefreshKey(key=>key+1)}}),[recommendation,loading,syncError,persist]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDailyRecommendation(){const value=useContext(Context);if(!value)throw new Error('Daily recommendation provider missing');return value}
