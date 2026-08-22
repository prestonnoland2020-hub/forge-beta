import { createContext,useCallback,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import { isDemoMode } from '../../lib/env';
import { buildDailyRecommendation,recommendationFingerprint,type DailyRecommendation,type RecommendationSplitDay } from '../../lib/dailyRecommendationEngine';
import { useAuth } from '../auth/AuthProvider';
import { useGoals } from '../goals/GoalsProvider';
import { useProfileSetup } from '../profile/ProfileSetupProvider';
import { useAdaptiveTraining } from './AdaptiveTrainingProvider';
import { useCoachingStrategy } from './CoachingStrategyProvider';
import { useTrainingLibrary } from './TrainingLibraryProvider';
import { useWorkoutHistory } from './WorkoutHistoryProvider';
import { loadCycleSnapshot,loadDailyRecommendation,saveDailyRecommendation,type CycleSnapshot } from './dailyRecommendationService';

type Value={recommendation:DailyRecommendation|null;loading:boolean;syncError:string|null;toggleTopSet:(id:string)=>void;setCardioSelected:(selected:boolean)=>void;markCompleted:()=>void;refresh:()=>void};
const Context=createContext<Value|null>(null);
const isoToday=()=>{const date=new Date();return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`};

function localSplitDays():RecommendationSplitDay[]{
  try{const saved=JSON.parse(localStorage.getItem('forge-training-plan-v1')||'null') as {days?:Array<{name:string;dayType:string;muscles?:string[];exercises?:string[];cardio?:unknown[];cardioPolicy?:string}>}|null;return(saved?.days||[]).map((day,index)=>({position:index+1,name:day.name||`Day ${index+1}`,type:['strength','cardio','mixed','rest'].includes(day.dayType)?day.dayType as RecommendationSplitDay['type']:'rest',muscles:day.muscles||[],exercises:day.exercises||[],cardioTypes:day.dayType==='cardio'||day.dayType==='mixed'?['Forge']:[]}))}catch{return[]}
}

export function DailyRecommendationProvider({children}:{children:ReactNode}){
  const {user}=useAuth();const {goals}=useGoals();const {records}=useWorkoutHistory();const {profile,recovery,history}=useAdaptiveTraining();const {setup}=useProfileSetup();const {exercises}=useTrainingLibrary();const {strategy}=useCoachingStrategy();
  const [cycle,setCycle]=useState<CycleSnapshot>({nextPosition:1,revision:0,days:[]});const [stored,setStored]=useState<DailyRecommendation|null>(null);const [loading,setLoading]=useState(!isDemoMode);const [syncError,setSyncError]=useState<string|null>(null);const [refreshKey,setRefreshKey]=useState(0);
  useEffect(()=>{const refreshCycle=()=>setRefreshKey(key=>key+1);window.addEventListener('forge-training-cycle-changed',refreshCycle);return()=>window.removeEventListener('forge-training-cycle-changed',refreshCycle)},[]);
  const fallbackDays=useMemo(()=>{const local=localSplitDays();if(local.length)return local;return(setup?.splitDays||[]).map((day,index)=>({position:index+1,name:day.name||`Day ${index+1}`,type:day.type.toLowerCase() as RecommendationSplitDay['type'],muscles:day.muscles||[],exercises:[],cardioTypes:day.type==='Cardio'||day.type==='Mixed'?['Forge']:[]}))},[setup,refreshKey]);
  useEffect(()=>{if(isDemoMode||!user){setCycle(current=>({...current,days:fallbackDays}));setLoading(false);return}let active=true;setLoading(true);void loadCycleSnapshot(user.id).then(next=>{if(active){setCycle(next);setSyncError(null)}}).catch(error=>{if(active){setCycle(current=>({...current,days:fallbackDays}));setSyncError(error instanceof Error?error.message:'Could not load your split position.')}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[user,fallbackDays,refreshKey]);
  const days=cycle.days.length?cycle.days:fallbackDays;const trainingDays=days.filter(day=>day.type!=='rest');
  const inferredPosition=useMemo(()=>{if(!trainingDays.length)return days[0]?.position||1;const latest=[...records].filter(record=>(record.topSets||[]).length||(record.cardioSessions||[]).length).sort((a,b)=>b.date.localeCompare(a.date))[0];if(!latest)return trainingDays[0].position;let completedIndex=latest.splitPosition?trainingDays.findIndex(day=>day.position===latest.splitPosition):-1;if(completedIndex<0){const recordMuscles=new Set(latest.muscles.map(muscle=>muscle.toLowerCase()));const scored=trainingDays.map((day,index)=>({index,score:day.muscles.filter(muscle=>recordMuscles.has(muscle.toLowerCase())).length+(day.type==='cardio'&&latest.hasCardio?1:0)})).sort((a,b)=>b.score-a.score);if(scored[0]?.score)completedIndex=scored[0].index}return trainingDays[(Math.max(-1,completedIndex)+1)%trainingDays.length].position},[records,days,trainingDays]);
  const statePosition=trainingDays.find(day=>day.position===cycle.nextPosition)?.position||trainingDays.find(day=>day.position>cycle.nextPosition)?.position||trainingDays[0]?.position;
  const duePosition=cycle.revision>0?(statePosition||cycle.nextPosition):inferredPosition;
  const splitDay=days.find(day=>day.position===duePosition)||trainingDays[0]||days[0]||{position:1,name:'Start training',type:'strength' as const,muscles:[],exercises:[],cardioTypes:[]};
  const date=isoToday();
  const inputFingerprint=useMemo(()=>recommendationFingerprint({date,splitDay,exercises,records,goals,loadBiasPercent:strategy.loadBiasPercent,cycleRevision:cycle.revision}),[date,splitDay,exercises,records,goals,strategy.loadBiasPercent,cycle.revision]);
  const generated=useMemo(()=>buildDailyRecommendation({date,splitDay,exercises,records,goals,recovery,profile,runningHistory:history,loadBiasPercent:strategy.loadBiasPercent,inputFingerprint}),[date,splitDay,exercises,records,goals,recovery,profile,history,strategy.loadBiasPercent,inputFingerprint]);
  useEffect(()=>{if(isDemoMode||!user){setStored(current=>current?.status==='completed'||current?.inputFingerprint===inputFingerprint?current:generated);return}let active=true;setLoading(true);void loadDailyRecommendation(user.id,date).then(async existing=>{if(!active)return;if(existing?.status==='completed'||existing?.inputFingerprint===inputFingerprint){setStored(existing);return}const saved=await saveDailyRecommendation(user.id,generated);if(active)setStored(saved)}).then(()=>{if(active)setSyncError(null)}).catch(error=>{if(active){setStored(generated);setSyncError(error instanceof Error?error.message:'Could not save today’s recommendation.')}}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[user,date,inputFingerprint,generated]);
  const persist=useCallback((next:DailyRecommendation)=>{setStored(next);if(!isDemoMode&&user)void saveDailyRecommendation(user.id,next).then(setStored).catch(error=>setSyncError(error instanceof Error?error.message:'Could not save recommendation choices.'))},[user]);
  const recommendation=stored||generated;
  const value=useMemo<Value>(()=>({recommendation,loading,syncError,toggleTopSet:id=>{if(!recommendation)return;persist({...recommendation,topSets:recommendation.topSets.map(set=>set.id===id?{...set,selected:!set.selected}:set)})},setCardioSelected:selected=>{if(!recommendation?.cardio)return;persist({...recommendation,cardio:{...recommendation.cardio,selected}})},markCompleted:()=>{if(recommendation)setStored({...recommendation,status:'completed'})},refresh:()=>{setStored(null);setRefreshKey(key=>key+1)}}),[recommendation,loading,syncError,persist]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDailyRecommendation(){const value=useContext(Context);if(!value)throw new Error('Daily recommendation provider missing');return value}
