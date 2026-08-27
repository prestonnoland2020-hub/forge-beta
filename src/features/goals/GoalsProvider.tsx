import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import type { CreatedGoal } from '../../components/GoalBuilder';
import { isDemoMode } from '../../lib/env';
import { normalizeMuscleGroups } from '../../lib/muscleGroups';
import { supabase } from '../../lib/supabase';
import { loadAthleteSettings, saveAthleteSettings } from '../profile/settingsSync';
import { clockToSeconds, decimalMinutesToClock } from '../../lib/time';
import { useAuth } from '../auth/AuthProvider';

type GoalsContextValue={goals:CreatedGoal[];saveGoal:(goal:CreatedGoal,index?:number|null)=>void};
const GoalsContext=createContext<GoalsContextValue|null>(null);
const goalKey=(goal:CreatedGoal)=>`${goal.type}|${goal.exercise||goal.title}`.trim().toLowerCase().replace(/\s+goal$/,'');

export function GoalsProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  const [goals,setGoals]=useState<CreatedGoal[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('forge-goals')||'null') as CreatedGoal[]|null;return saved?.filter(goal=>['Strength','Endurance','Body Composition'].includes(goal.type))||[]}catch{return[]}});
  useEffect(()=>localStorage.setItem('forge-goals',JSON.stringify(goals)),[goals]);
  useEffect(()=>{if(isDemoMode||!user)return;let active=true;void supabase.from('goals').select('*').eq('owner_id',user.id).order('created_at').then(({data,error})=>{
    if(!active||error||!data?.length)return;
    const imported=data.map(row=>{const strength=row.type==='lift';const value=Number(row.target_value);const connection=normalizeMuscleGroups([row.muscle_group]).join(', ')||'No fixed day';return{type:strength?'Strength':'Endurance',title:strength?`${value} lb ${row.name}`:`${row.name} goal`,target:strength?`${value} lb`:decimalMinutesToClock(value),date:row.target_date||'',connection,exercise:row.name,metric:strength?'Real 1RM':'Finish time',unit:strength?'lb':'mm:ss',trackingSource:'Workout history',minWeeklyMileage:row.min_weekly_mileage==null?undefined:String(row.min_weekly_mileage),peakWeeklyMileage:row.peak_weekly_mileage==null?undefined:String(row.peak_weekly_mileage)} as CreatedGoal});
    setGoals(local=>{const remoteKeys=new Set(imported.map(goalKey));return[...imported,...local.filter(goal=>!remoteKeys.has(goalKey(goal)))]});
  });return()=>{active=false}},[user]);
  /* Body goals hydrate from athlete_settings — a fresh device has no local
     copy and the goals table never held them. */
  useEffect(()=>{if(isDemoMode||!user)return;let active=true;void loadAthleteSettings().then(settings=>{
    if(!active)return;
    const stored=Array.isArray(settings?.goals)?settings?.goals as CreatedGoal[]:[];
    const bodyGoals=stored.filter(item=>item?.type==='Body Composition'&&item.title);
    if(!bodyGoals.length)return;
    setGoals(local=>{const keys=new Set(local.map(goalKey));return[...local,...bodyGoals.filter(item=>!keys.has(goalKey(item)))]});
  });return()=>{active=false}},[user]);
  /* A wiped device can race auth: local storage empty, first fetch missed.
     One delayed retry restores the server copy without user action. */
  useEffect(()=>{if(isDemoMode||!user||goals.length)return;const timer=window.setTimeout(()=>{void supabase.from('goals').select('*').eq('owner_id',user.id).order('created_at').then(({data,error})=>{
    if(error||!data?.length)return;
    const imported=data.map(row=>{const strength=row.type==='lift';const value=Number(row.target_value);const connection=normalizeMuscleGroups([row.muscle_group]).join(', ')||'No fixed day';return{type:strength?'Strength':'Endurance',title:strength?`${value} lb ${row.name}`:`${row.name} goal`,target:strength?`${value} lb`:decimalMinutesToClock(value),date:row.target_date||'',connection,exercise:row.name,metric:strength?'Real 1RM':'Finish time',unit:strength?'lb':'mm:ss',trackingSource:'Workout history'} as CreatedGoal});
    setGoals(local=>{const remoteKeys=new Set(imported.map(goalKey));return[...imported,...local.filter(goal=>!remoteKeys.has(goalKey(goal)))]});
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
  return <GoalsContext.Provider value={{goals,saveGoal}}>{children}</GoalsContext.Provider>;
}
export function useGoals(){const context=useContext(GoalsContext);if(!context)throw new Error('useGoals must be used inside GoalsProvider');return context}
