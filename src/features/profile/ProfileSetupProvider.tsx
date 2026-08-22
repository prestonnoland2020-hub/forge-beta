import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { normalizeMuscleGroups } from '../../lib/muscleGroups';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export type AthleteSetup = {
  displayName:string; username:string; birthDate:string; units:'Imperial'|'Metric'; height:string;
  startingWeight:string; currentWeight:string; primaryFocus:'Strength'|'Endurance'|'Body composition'|'Hybrid';
  strengthExperience:'Beginner'|'Intermediate'|'Advanced'|'Competitive'; runningExperience:'New'|'Recreational'|'Experienced'|'Competitive';
  trainingDays:number; runningDays:number; weeklyMileage:number; longestRun:number; strengthSessionMinutes:number; cardioSessionMinutes:number; combinedSessionMinutes:number;
  minWeeklyMileage?:number; maxWeeklyMileage?:number;
  scheduleStyle:'Rolling cycle'|'Weekly schedule'; equipment:string; environment:'Road'|'Track'|'Trail'|'Treadmill'|'Mixed';
  splitSource:'Recommended'|'Custom'; splitDays:Array<{name:string;type:'Strength'|'Cardio'|'Mixed'|'Rest';muscles?:string[]}>;
  injuryConstraint:boolean; limitationNotes:string; wearableIntent:'Connect now'|'Connect later'|'Manual only';
  profileVisibility:'Private'|'Friends only'; acceptedSafety:boolean; completedAt:string;
};

const storageKey='forge-athlete-setup-v1';
const setupDefaults:AthleteSetup={displayName:'Athlete',username:'',birthDate:'',units:'Imperial',height:'',startingWeight:'',currentWeight:'',primaryFocus:'Hybrid',strengthExperience:'Intermediate',runningExperience:'Recreational',trainingDays:4,runningDays:3,weeklyMileage:0,longestRun:0,strengthSessionMinutes:60,cardioSessionMinutes:45,combinedSessionMinutes:75,scheduleStyle:'Rolling cycle',equipment:'',environment:'Mixed',splitSource:'Recommended',splitDays:[{name:'Upper Strength',type:'Strength',muscles:['Chest','Back','Shoulders','Biceps','Triceps']},{name:'Lower Strength',type:'Strength',muscles:['Quads','Hamstrings','Glutes']},{name:'Conditioning',type:'Cardio',muscles:[]},{name:'Recovery',type:'Rest',muscles:[]}],injuryConstraint:false,limitationNotes:'',wearableIntent:'Connect later',profileVisibility:'Private',acceptedSafety:false,completedAt:''};
const normalizeSetup=(value:unknown):AthleteSetup|null=>{if(!value||typeof value!=='object')return null;const saved=value as Partial<AthleteSetup>;const splitDays=Array.isArray(saved.splitDays)&&saved.splitDays.length?saved.splitDays.map(day=>({...day,muscles:Array.isArray(day.muscles)?day.muscles:[]})):setupDefaults.splitDays;return{...setupDefaults,...saved,splitDays,units:saved.units==='Metric'?'Metric':'Imperial'}};
type Value={setup:AthleteSetup|null;completed:boolean;saveSetup:(setup:AthleteSetup)=>void;clearSetup:()=>void};
const Context=createContext<Value|null>(null);

export function ProfileSetupProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  const [setup,setSetup]=useState<AthleteSetup|null>(()=>{try{return normalizeSetup(JSON.parse(localStorage.getItem(storageKey)||'null'))}catch{return null}});
  const saveSetup=(next:AthleteSetup)=>{localStorage.setItem(storageKey,JSON.stringify(next));setSetup(next)};
  const clearSetup=()=>{localStorage.removeItem(storageKey);setSetup(null)};
  useEffect(()=>{if(!user)return;let active=true;void supabase.from('training_splits').select('name,training_split_days(position,name,muscle_groups,goal_lifts,cardio_types)').eq('owner_id',user.id).eq('is_active',true).maybeSingle().then(({data,error})=>{if(!active||error||!data)return;const rows=[...(data.training_split_days||[])].sort((a,b)=>a.position-b.position);const days=rows.map((day,index)=>{const muscles=normalizeMuscleGroups(day.muscle_groups);const exercises=Array.isArray(day.goal_lifts)?day.goal_lifts:[];const cardio=Array.isArray(day.cardio_types)?day.cardio_types:[];const hasStrength=muscles.length>0||exercises.length>0;const hasCardio=cardio.length>0;const dayType=hasStrength&&hasCardio?'mixed':hasStrength?'strength':hasCardio?'cardio':'rest';const strengthDuration=String(setup?.strengthSessionMinutes||60);return{name:day.name||`Day ${index+1}`,weekday:['MON','TUE','WED','THU','FRI','SAT','SUN'][index%7],dayType,muscles,exercises,cardioPolicy:hasCardio?'forge':'none',cardio:[],recoveryStyle:'Full rest',strengthDuration,maxDuration:dayType==='cardio'?String(setup?.cardioSessionMinutes||45):strengthDuration}});localStorage.setItem('forge-training-plan-v1',JSON.stringify({name:data.name,rhythm:setup?.scheduleStyle==='Weekly schedule'?'weekly':'rolling',days}));setSetup(current=>{if(!current)return current;const next={...current,splitSource:'Custom' as const,trainingDays:days.filter(day=>day.dayType!=='rest').length,splitDays:days.map(day=>({name:day.name,type:(day.dayType[0].toUpperCase()+day.dayType.slice(1)) as 'Strength'|'Cardio'|'Mixed'|'Rest',muscles:day.muscles}))};localStorage.setItem(storageKey,JSON.stringify(next));return next})});return()=>{active=false}},[user]);
  return <Context.Provider value={{setup,completed:Boolean(setup?.completedAt),saveSetup,clearSetup}}>{children}</Context.Provider>;
}
export function useProfileSetup(){const value=useContext(Context);if(!value)throw new Error('useProfileSetup must be used inside ProfileSetupProvider');return value}
