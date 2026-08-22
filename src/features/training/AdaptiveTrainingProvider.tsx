import { createContext,useContext,useEffect,useMemo,useState,type ReactNode } from 'react';
import { deriveRecoveryState,type DailyHealthSnapshot,type RecoveryState } from '../../lib/recoveryEngine';
import { useWorkoutHistory } from './WorkoutHistoryProvider';
import { cardioMiles,isRunningCardio,summarizeCardioDraft } from '../../lib/cardioSession';

export type RunningExperience='New'|'Recreational'|'Experienced'|'Competitive';
export type Environment='Road'|'Track'|'Trail'|'Treadmill'|'Mixed';
export type RunResult={id:string;date:string;kind:'Easy'|'Long'|'Intervals'|'Race';distanceMiles:number;durationMinutes:number;completed:boolean;plannedReps?:number;completedReps?:number;averageHr?:number;elevationFeet?:number;temperatureF?:number};
export type AdaptiveProfile={weeklyMileage:number;longestRunMiles:number;runningDays:number;experience:RunningExperience;readiness:number;sleepHours:number;soreness:number;injuryConstraint:boolean;strengthFatigue:'Low'|'Moderate'|'High';environment:Environment;heatAdjusted:boolean;watchConnected:boolean;easyHrMin:number;easyHrMax:number;thresholdHrMin:number;thresholdHrMax:number};
const preferences={weeklyMileage:12,longestRunMiles:4,runningDays:3,experience:'Recreational' as RunningExperience,soreness:2,injuryConstraint:false,environment:'Road' as Environment,heatAdjusted:true,easyHrMin:135,easyHrMax:150,thresholdHrMin:165,thresholdHrMax:178};
const localDateIso=(value=new Date())=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
const today=localDateIso();
const unavailableHealth=():DailyHealthSnapshot=>({date:today,provider:'Unavailable',sleepMinutes:0,acuteLoad:0,sourceUpdatedAt:new Date().toISOString()});
const initialHistory:RunResult[]=[];
type StoredPrefs=Omit<AdaptiveProfile,'readiness'|'sleepHours'|'strengthFatigue'|'watchConnected'>;
type Value={profile:AdaptiveProfile;recovery:RecoveryState;health:DailyHealthSnapshot[];history:RunResult[];updateProfile:(change:Partial<StoredPrefs>)=>void;syncWearableHealth:(snapshots:DailyHealthSnapshot[])=>void;setHistory:(history:RunResult[])=>void};
const Context=createContext<Value|null>(null);

export function AdaptiveTrainingProvider({children}:{children:ReactNode}){
  const {records}=useWorkoutHistory();
  const [prefs,setPrefs]=useState<StoredPrefs>(()=>{try{return{...preferences,...JSON.parse(localStorage.getItem('forge-training-preferences')||'{}')}}catch{return preferences}});
  const [health,setHealth]=useState<DailyHealthSnapshot[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('forge-health-snapshots')||'null');const wearable=Array.isArray(saved)?saved.filter(item=>item?.provider&&item.provider!=='Manual'&&item.provider!=='Unavailable'):[];return wearable.length?wearable:[unavailableHealth()]}catch{return[unavailableHealth()]}});
  const [history,setHistory]=useState<RunResult[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('forge-run-history')||'null');return Array.isArray(saved)?saved:initialHistory}catch{return initialHistory}});
  const loggedRunHistory=useMemo<RunResult[]>(()=>records.flatMap(record=>(record.cardioSessions||[]).filter(session=>isRunningCardio(session)&&(session.structure==='steady'||session.structure==='custom')).map(session=>{const totals=summarizeCardioDraft(session);const distanceMiles=cardioMiles(session);const activity=session.activity.toLowerCase();const kind:RunResult['kind']=activity.includes('race')?'Race':activity.includes('long')?'Long':/speed|tempo|threshold|interval/.test(activity)?'Intervals':'Easy';return{id:`workout-${record.id}-${session.id}`,date:record.date,kind,distanceMiles,durationMinutes:totals.minutes,completed:distanceMiles>0&&totals.minutes>0}})).filter(run=>run.completed),[records]);
  const combinedHistory=useMemo(()=>{const loggedIds=new Set(loggedRunHistory.map(run=>run.id));return[...history.filter(run=>!loggedIds.has(run.id)),...loggedRunHistory].sort((a,b)=>b.date.localeCompare(a.date))},[history,loggedRunHistory]);
  const strengthLoad=useMemo(()=>{const cutoff=Date.now()-7*86400000;const effortLoad:Record<string,number>={Easy:2,Moderate:3,Hard:5,'Max effort':7};return records.filter(record=>record.lift&&new Date(`${record.date}T12:00:00`).getTime()>=cutoff).reduce((sum,record)=>sum+(effortLoad[record.effort||'']||3),0)},[records]);
  const latest=health[health.length-1]||unavailableHealth();
  const recovery=useMemo(()=>deriveRecoveryState(latest,health,strengthLoad,prefs.injuryConstraint),[latest,health,strengthLoad,prefs.injuryConstraint]);
  const profile=useMemo<AdaptiveProfile>(()=>{const cutoff=new Date();cutoff.setHours(0,0,0,0);cutoff.setDate(cutoff.getDate()-6);const cutoffIso=localDateIso(cutoff);const observedWeekly=loggedRunHistory.filter(run=>run.date>=cutoffIso&&run.date<=today).reduce((sum,run)=>sum+run.distanceMiles,0);const observedLongest=loggedRunHistory.reduce((longest,run)=>Math.max(longest,run.distanceMiles),0);return{...prefs,weeklyMileage:loggedRunHistory.length?Number(observedWeekly.toFixed(1)):prefs.weeklyMileage,longestRunMiles:loggedRunHistory.length?Number(observedLongest.toFixed(1)):prefs.longestRunMiles,readiness:recovery.confidence==='Low'?100:recovery.readiness,sleepHours:recovery.confidence==='Low'?8:latest.sleepMinutes/60,strengthFatigue:recovery.strengthFatigue,watchConnected:latest.provider!=='Unavailable'}},[prefs,recovery,latest,loggedRunHistory]);
  useEffect(()=>localStorage.setItem('forge-training-preferences',JSON.stringify(prefs)),[prefs]);
  useEffect(()=>localStorage.setItem('forge-run-history',JSON.stringify(history)),[history]);
  const syncWearableHealth=(snapshots:DailyHealthSnapshot[])=>{const verified=snapshots.filter(item=>item.provider!=='Unavailable');const next=verified.length?verified.sort((a,b)=>a.date.localeCompare(b.date)):[unavailableHealth()];setHealth(next);if(verified.length)localStorage.setItem('forge-health-snapshots',JSON.stringify(next));else localStorage.removeItem('forge-health-snapshots')};
  return <Context.Provider value={{profile,recovery,health,history:combinedHistory,updateProfile:change=>setPrefs(value=>({...value,...change})),syncWearableHealth,setHistory}}>{children}</Context.Provider>
}
export function useAdaptiveTraining(){const value=useContext(Context);if(!value)throw new Error('useAdaptiveTraining must be used inside AdaptiveTrainingProvider');return value}
