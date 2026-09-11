import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import type { CreatedGoal } from '../../components/GoalBuilder';
import { isDemoMode } from '../../lib/env';
import { normalizeMuscleGroups } from '../../lib/muscleGroups';
import { supabase } from '../../lib/supabase';
import { loadAthleteSettings, saveAthleteSettings } from '../profile/settingsSync';
import { clockToSeconds, decimalMinutesToClock } from '../../lib/time';
import { useAuth } from '../auth/AuthProvider';
import { useSyncStatus } from '../sync/SyncStatusProvider';

/* `hydrated` is the difference between "this athlete has no goals" and "the
   goals have not arrived yet". Without it, an empty list means both, and a
   gate that redirects on emptiness would throw a returning athlete on a fresh
   device back into setup for the seconds before the server answers. */
type GoalsContextValue={goals:CreatedGoal[];saveGoal:(goal:CreatedGoal,index?:number|null)=>void;deleteGoal:(index:number)=>void;hydrated:boolean;syncError:string|null};
const GoalsContext=createContext<GoalsContextValue|null>(null);
/* A GOAL'S IDENTITY MUST NOT MOVE WHEN ITS TARGET DOES. A body-composition
   goal has no exercise, so this fell through to the TITLE — and the title of a
   body goal is "200 lb body-weight goal". Raise the target to 195 and it became
   a different goal: the table's copy and the settings copy no longer matched,
   the merge treated them as two goals, and the athlete's goal list grew a
   second body-weight target every time they edited the first. It keys on the
   metric now, which is what the row is keyed on server-side as well. */
const goalKey=(goal:CreatedGoal)=>(goal.type==='Body Composition'
  ?`${goal.type}|${goal.metric||'Body weight'}`
  :`${goal.type}|${goal.exercise||goal.title}`).trim().toLowerCase().replace(/\s+goal$/,'');

/* A GOAL ROW COMES BACK IN THE ATHLETE'S UNIT. The server stores the bare
   number; it used to be relabelled "lb" on every load, so a kg lifter's
   "140 kg Squat" read "140 lb Squat" after a refresh — and fed the plan and
   the goal card in the wrong unit. The unit is the profile's. And where this
   device already holds the same goal, its copy (with `current`, its exact
   title and target) is the one that stays. */
type GoalRow={type:string;name:string;target_value:number|string;muscle_group:string|null;target_date:string|null;min_weekly_mileage?:number|null;peak_weekly_mileage?:number|null};
const athleteUsesMetric=(userId:string)=>{try{return JSON.parse(localStorage.getItem(`forge-athlete-setup-v1:${userId}`)||'null')?.units==='Metric'}catch{return false}};
/* UNITS COME FROM THE ACCOUNT, not from a cache that may not exist yet. On a
   fresh device the local setup is written only after the profile load finishes,
   and the goals fetch usually wins that race — so a metric athlete's goals were
   imported, labelled "lb" and then saved back to localStorage that way. */
const metricFromAccount=async(userId:string)=>{const {data}=await supabase.from('profiles').select('unit_system').eq('id',userId).maybeSingle();return data?data.unit_system==='metric':athleteUsesMetric(userId)};
/* A BODY-WEIGHT GOAL IS A GOAL LIKE THE OTHERS.

   Preston has seven and six of them lived in the goals table. The seventh —
   "200 lb body-weight goal" — lived only in athlete_settings, because the
   table was built for lifts and races and nobody went back for it. That one
   difference is why it is invisible to every server-side function, why the
   Goals page only draws it after a second round trip that can fail on its own,
   and why a first read of his account concluded he had no body-composition
   goal at all.

   It is a row now, like the rest. athlete_settings keeps its copy so an older
   build on another device does not lose it. */
const importGoalRow=(row:GoalRow,metric:boolean):CreatedGoal=>{const body=row.type==='bodyweight';const strength=row.type==='lift';const value=Number(row.target_value);const unit=metric?'kg':'lb';const connection=normalizeMuscleGroups([row.muscle_group]).join(', ')||'No fixed day';
  if(body)return{type:'Body Composition',title:`${value} ${unit} body-weight goal`,target:`${value} ${unit}`,date:row.target_date||'',connection,exercise:'',metric:'Body weight',unit,trackingSource:'Workout history'} as CreatedGoal;
  return{type:strength?'Strength':'Endurance',title:strength?`${value} ${unit} ${row.name}`:`${row.name} goal`,target:strength?`${value} ${unit}`:decimalMinutesToClock(value),date:row.target_date||'',connection,exercise:row.name,metric:strength?'Real 1RM':'Finish time',unit:strength?unit:'mm:ss',trackingSource:'Workout history',minWeeklyMileage:row.min_weekly_mileage==null?undefined:String(row.min_weekly_mileage),peakWeeklyMileage:row.peak_weekly_mileage==null?undefined:String(row.peak_weekly_mileage)} as CreatedGoal};
/* THE ACCOUNT IS THE AUTHORITY ON A GOAL IT ALREADY HOLDS. This kept the local
   copy whenever both sides knew a goal, so raising a target on one phone never
   reached the other — the stale device re-saved its own copy on every open and
   the edit looked like it had been thrown away. Every save here writes to the
   table first, so a goal the server knows about is the newer one; local fields
   the row does not carry are kept underneath it. */
const mergeImported=(imported:CreatedGoal[],local:CreatedGoal[])=>{const localByKey=new Map(local.map(goal=>[goalKey(goal),goal] as const));const remoteKeys=new Set(imported.map(goalKey));return[...imported.map(goal=>{const held=localByKey.get(goalKey(goal));if(!held)return goal;const defined=Object.fromEntries(Object.entries(goal).filter(([,value])=>value!==undefined));return{...held,...defined} as CreatedGoal}),...local.filter(goal=>!remoteKeys.has(goalKey(goal)))]};
/* WHICH ROW A GOAL IS. The table is keyed (owner, type, name), so an edit that
   renames the lift writes a NEW row and leaves the old one behind — which then
   hydrates on the next device as a goal the athlete thought they had replaced. */
const rowIdentity=(goal:CreatedGoal)=>goal.type==='Body Composition'
  ?{type:'bodyweight',name:goal.metric||'Body weight'}
  :{type:goal.type==='Endurance'?'race':'lift',name:goal.exercise||goal.title};
export function GoalsProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  const [goals,setGoals]=useState<CreatedGoal[]>(()=>{try{const saved=JSON.parse(localStorage.getItem('forge-goals')||'null') as CreatedGoal[]|null;return saved?.filter(goal=>['Strength','Endurance','Body Composition'].includes(goal.type))||[]}catch{return[]}});
  /* A GOAL THAT DID NOT REACH THE SERVER IS A GOAL THE ATHLETE WILL LOSE.

     Every upsert here was rejected by Postgres with 42P10 for months — the
     onConflict spelling could not match the table's expression index — and the
     only trace was a console.warn nobody reads. The goals lived in
     localStorage; sign in on a second phone and the table was empty, so the
     onboarding gate decided they had no goals and sent them back through
     setup. Silence is what made a one-line schema fault survive that long. */
  const [syncError,setSyncError]=useState<string|null>(null);
  /* The Goals page keeps its own line — that is where the athlete is when it
     happens — and the same failure also goes to the app-wide channel, so it is
     visible from whatever screen they wander to next. */
  const {report}=useSyncStatus();
  useEffect(()=>report('goals',syncError?{label:'Goals',message:syncError}:null),[syncError,report]);
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
  useEffect(()=>{if(isDemoMode||!user)return;let active=true;void (async()=>{
    const metric=await metricFromAccount(user.id);
    const {data,error}=await supabase.from('goals').select('*').eq('owner_id',user.id).order('created_at');
    if(!active)return;
    /* Answered — even an error or an empty list settles the question. */
    setGoalsAnswered(true);
    if(error||!data?.length)return;
    const imported=data.map(row=>importGoalRow(row as GoalRow,metric));
    setGoals(local=>mergeImported(imported,local));
  })().catch(()=>{if(active)setGoalsAnswered(true)});return()=>{active=false}},[user]);
  /* Body goals hydrate from athlete_settings — a fresh device has no local
     copy and the goals table never held them. */
  useEffect(()=>{if(isDemoMode||!user)return;let active=true;void loadAthleteSettings().then(settings=>{
    if(!active)return;
    setSettingsAnswered(true);
    const stored=Array.isArray(settings?.goals)?settings?.goals as CreatedGoal[]:[];
    const bodyGoals=stored.filter(item=>item?.type==='Body Composition'&&item.title);
    if(!bodyGoals.length)return;
    /* THE TABLE IS THE AUTHORITY; THIS COPY IS A MIGRATION PATH. athlete_settings
       still carries body goals so an older build on another device does not lose
       them, but it is only ever read for a goal the table does not already hold.
       A stale copy here must never overwrite, resurrect, or duplicate the row —
       which is what "one of them wins" has to mean in practice. */
    setGoals(local=>{const keys=new Set(local.map(goalKey));return[...local,...bodyGoals.filter(item=>!keys.has(goalKey(item)))]});
  }).catch(()=>{if(active)setSettingsAnswered(true)});return()=>{active=false}},[user]);
  /* A wiped device can race auth: local storage empty, first fetch missed.
     One delayed retry restores the server copy without user action. */
  useEffect(()=>{if(isDemoMode||!user||goals.length)return;const timer=window.setTimeout(()=>{void (async()=>{
    const metric=await metricFromAccount(user.id);
    const {data,error}=await supabase.from('goals').select('*').eq('owner_id',user.id).order('created_at');
    if(error||!data?.length)return;
    const imported=data.map(row=>importGoalRow(row as GoalRow,metric));
    setGoals(local=>mergeImported(imported,local));
  })().catch(()=>undefined)},4000);return()=>window.clearTimeout(timer)},[user,goals.length]);
  /* A GOAL CAN BE WRONG, and until now there was no way to take one back: the
     builder could only add or overwrite, so a mistyped target sat in the
     athlete's program forever and kept steering the plan. */
  const deleteGoal=(index:number)=>{
    const target=goals[index];
    if(!target)return;
    const next=goals.filter((_,itemIndex)=>itemIndex!==index);
    setGoals(next);
    if(isDemoMode||!user)return;
    saveAthleteSettings({goals:next.filter(item=>item.type==='Body Composition')});
    const row=rowIdentity(target);
    void supabase.from('goals').delete().eq('owner_id',user.id).eq('type',row.type).eq('name',row.name).then(({error})=>{setSyncError(error?`This goal was removed here but not from your account (${error.message}). It may come back on your other devices.`:null)});
  };
  const saveGoal=(goal:CreatedGoal,index?:number|null)=>{
    /* An edit that renames the lift or changes the goal's kind leaves its old
       row behind unless it is cleared here. */
    const previous=index===null||index===undefined?null:goals[index];
    if(previous&&!isDemoMode&&user){
      const before=rowIdentity(previous);const after=rowIdentity(goal);
      if(before.type!==after.type||before.name!==after.name)void supabase.from('goals').delete().eq('owner_id',user.id).eq('type',before.type).eq('name',before.name);
    }
    setGoals(items=>{
      const next=index===null||index===undefined?[...items,goal]:items.map((item,itemIndex)=>itemIndex===index?goal:item);
      /* Body-composition goals live in athlete_settings — the goals table's
         lift/race enum has no row for them, and forcing one wrote a garbage
         'lift' goal that hydrated back on other devices as a fake STRENGTH
         goal. Every body-goal change re-saves the full body set. */
      if(!isDemoMode&&user)saveAthleteSettings({goals:next.filter(item=>item.type==='Body Composition')});
      return next;
    });
    if(isDemoMode||!user)return;
    /* Body goals go to the table too, so nothing about them depends on a
       second fetch that lifts and races do not need. */
    if(goal.type==='Body Composition'){
      const pounds=Number.parseFloat(String(goal.target).replace(/[^0-9.]/g,''));
      void supabase.from('goals').upsert({owner_id:user.id,type:'bodyweight',name:goal.metric||'Body weight',target_value:Number.isFinite(pounds)?pounds:0,muscle_group:null,target_date:goal.date||null},{onConflict:'owner_id,type,name'}).then(({error})=>{setSyncError(error?`This goal is saved on this device but did not reach your account (${error.message}). It may not appear on your other devices.`:null)});
      return;
    }
    const isTime=goal.type==='Endurance'&&String(goal.metric).toLowerCase().includes('time');const numericTarget=isTime?clockToSeconds(goal.target,String(goal.unit).includes('hh:mm:ss'))/60:Number.parseFloat(goal.target);const type=goal.type==='Endurance'?'race':'lift';void supabase.from('goals').upsert({owner_id:user.id,type,name:goal.exercise||goal.title,target_value:Number.isFinite(numericTarget)?numericTarget:0,muscle_group:normalizeMuscleGroups([goal.connection]).join(', ')||null,target_date:goal.date||null},{onConflict:'owner_id,type,name'}).then(({error})=>{setSyncError(error?`This goal is saved on this device but did not reach your account (${error.message}). It may not appear on your other devices.`:null)})};
  return <GoalsContext.Provider value={{goals,saveGoal,deleteGoal,hydrated,syncError}}>{children}</GoalsContext.Provider>;
}
export function useGoals(){const context=useContext(GoalsContext);if(!context)throw new Error('useGoals must be used inside GoalsProvider');return context}
