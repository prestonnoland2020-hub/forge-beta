import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import type { CreatedGoal } from '../../components/GoalBuilder';
import { isDemoMode } from '../../lib/env';
import { normalizeMuscleGroups } from '../../lib/muscleGroups';
import { supabase } from '../../lib/supabase';
import { loadAthleteSettings, saveAthleteSettings } from '../profile/settingsSync';
import { clockToSeconds, decimalMinutesToClock } from '../../lib/time';
import { useAuth } from '../auth/AuthProvider';

/* `hydrated` is the difference between "this athlete has no goals" and "the
   goals have not arrived yet". Without it, an empty list means both, and a
   gate that redirects on emptiness would throw a returning athlete on a fresh
   device back into setup for the seconds before the server answers. */
type GoalsContextValue={goals:CreatedGoal[];saveGoal:(goal:CreatedGoal,index?:number|null)=>void;hydrated:boolean};
const GoalsContext=createContext<GoalsContextValue|null>(null);
const goalKey=(goal:CreatedGoal)=>`${goal.type}|${goal.exercise||goal.title}`.trim().toLowerCase().replace(/\s+goal$/,'');

/* A GOAL ROW COMES BACK IN THE ATHLETE'S UNIT. The server stores the bare
   number; it used to be relabelled "lb" on every load, so a kg lifter's
   "140 kg Squat" read "140 lb Squat" after a refresh — and fed the plan and
   the goal card in the wrong unit. The unit is the profile's. And where this
   device already holds the same goal, its copy (with `current`, its exact
   title and target) is the one that stays. */
type GoalRow={type:string;name:string;target_value:number|string;muscle_group:string|null;target_date:string|null;min_weekly_mileage?:number|null;peak_weekly_mileage?:number|null};
const athleteUsesMetric=(userId:string)=>{try{return JSON.parse(localStorage.getItem(`forge-athlete-setup-v1:${userId}`)||'null')?.units==='Metric'}catch{return false}};
const importGoalRow=(row:GoalRow,userId:string):CreatedGoal=>{const strength=row.type==='lift';const value=Number(row.target_value);const unit=athleteUsesMetric(userId)?'kg':'lb';const connection=normalizeMuscleGroups([row.muscle_group]).join(', ')||'No fixed day';return{type:strength?'Strength':'Endurance',title:strength?`${value} ${unit} ${row.name}`:`${row.name} goal`,target:strength?`${value} ${unit}`:decimalMinutesToClock(value),date:row.target_date||'',connection,exercise:row.name,metric:strength?'Real 1RM':'Finish time',unit:strength?unit:'mm:ss',trackingSource:'Workout history',minWeeklyMileage:row.min_weekly_mileage==null?undefined:String(row.min_weekly_mileage),peakWeeklyMileage:row.peak_weekly_mileage==null?undefined:String(row.peak_weekly_mileage)} as CreatedGoal};
const mergeImported=(imported:CreatedGoal[],local:CreatedGoal[])=>{const localByKey=new Map(local.map(goal=>[goalKey(goal),goal] as const));const remoteKeys=new Set(imported.map(goalKey));return[...imported.map(goal=>localByKey.get(goalKey(goal))||goal),...local.filter(goal=>!remoteKeys.has(goalKey(goal)))]};
export function GoalsProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  const [goals,setGoals]=useState<CreatedGoal[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('forge-goals')||'null') as CreatedGoal[]|null;return saved?.filter(goal=>['Strength','Endurance','Body Composition'].includes(goal.type))||[]}catch{return[]}});
  useEffect(()=>localStorage.setItem('forge-goals',JSON.stringify(goals)),[goals]);
  /* A goal can arrive from either of two places, and BOTH have to answer
     before emptiness means anything. The goals TABLE holds lift and race
     goals; body-composition goals live in athlete_settings, because the
     table's lift/race enum has no row for them. Flipping `hydrated` when only
     the table replied is what threw an athlete whose only goal is a body-
     weight target back into onboarding on every fresh device: the table is
     legitimately empty for them, the gate saw an empty list it believed was
     final, and the settings copy arrived a moment too late to matter. */
  const [goalsAnswered,setGoalsAnswered]=useState(isDemoMode);
  const [settingsAnswered,setSettingsAnswered]=useState(isDemoMode);
  const hydrated=goalsAnswered&&settingsAnswered;
  /* Signed out, or in the preview build, there is nothing to wait for. */
  useEffect(()=>{if(isDemoMode||!user){setGoalsAnswered(true);setSettingsAnswered(true)}},[user]);
  useEffect(()=>{if(isDemoMode||!user)return;let active=true;void supabase.from('goals').select('*').eq('owner_id',user.id).order('created_at').then(({data,error})=>{
    if(!active)return;
    /* Answered — even an error or an empty list settles the question. */
    setGoalsAnswered(true);
    if(error||!data?.length)return;
    const imported=data.map(row=>importGoalRow(row,user.id));
    setGoals(local=>mergeImported(imported,local));
  });return()=>{active=false}},[user]);
  /* Body goals hydrate from athlete_settings — a fresh device has no local
     copy and the goals table never held them. */
  useEffect(()=>{if(isDemoMode||!user)return;let active=true;void loadAthleteSettings().then(settings=>{
    if(!active)return;
    setSettingsAnswered(true);
    const stored=Array.isArray(settings?.goals)?settings?.goals as CreatedGoal[]:[];
    const bodyGoals=stored.filter(item=>item?.type==='Body Composition'&&item.title);
    if(!bodyGoals.length)return;
    setGoals(local=>{const keys=new Set(local.map(goalKey));return[...local,...bodyGoals.filter(item=>!keys.has(goalKey(item)))]});
  }).catch(()=>{if(active)setSettingsAnswered(true)});return()=>{active=false}},[user]);
  /* A wiped device can race auth: local storage empty, first fetch missed.
     One delayed retry restores the server copy without user action. */
  useEffect(()=>{if(isDemoMode||!user||goals.length)return;const timer=window.setTimeout(()=>{void supabase.from('goals').select('*').eq('owner_id',user.id).order('created_at').then(({data,error})=>{
    if(error||!data?.length)return;
    const imported=data.map(row=>importGoalRow(row,user.id));
    setGoals(local=>mergeImported(imported,local));
  })},4000);return()=>window.clearTimeout(timer)},[user,goals.length]);
  const saveGoal=(goal:CreatedGoal,index?:number|null)=>{
    setGoals(items=>{
      const next=index===null||index===undefined?[...items,goal]:items.map((item,itemIndex)=>itemIndex===index?goal:item);
      /* Body-composition goals live in athlete_settings — the goals table's
         lift/race enum has no row for them, and forcing one wrote a garbage
         'lift' goal that hydrated back on other devices as a fake STRENGTH
         goal. Every body-goal change re-saves the full body set. */
      if(!isDemoMode&&user)saveAthleteSettings({goals:next.filter(item=>item.type==='Body Composition')});
      return next;
    });
    if(isDemoMode||!user||goal.type==='Body Composition')return;const isTime=goal.type==='Endurance'&&String(goal.metric).toLowerCase().includes('time');const numericTarget=isTime?clockToSeconds(goal.target,String(goal.unit).includes('hh:mm:ss'))/60:Number.parseFloat(goal.target);const type=goal.type==='Endurance'?'race':'lift';void supabase.from('goals').upsert({owner_id:user.id,type,name:goal.exercise||goal.title,target_value:Number.isFinite(numericTarget)?numericTarget:0,muscle_group:normalizeMuscleGroups([goal.connection]).join(', ')||null,target_date:goal.date||null},{onConflict:'owner_id,type,name'}).then(({error})=>{if(error)console.warn('Goal sync failed',error.message)})};
  return <GoalsContext.Provider value={{goals,saveGoal,hydrated}}>{children}</GoalsContext.Provider>;
}
export function useGoals(){const context=useContext(GoalsContext);if(!context)throw new Error('useGoals must be used inside GoalsProvider');return context}
