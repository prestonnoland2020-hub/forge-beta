import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import type { PlannedCardio } from '../../components/CardioPlanBuilder';
import { isDemoMode } from '../../lib/env';
import { canonicalLiftKey, primaryMusclesFor } from '../../lib/liftAliases';
import { normalizeMuscleGroups } from '../../lib/muscleGroups';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';

export type LibraryExercise={id:number;name:string;kind:'Strength'|'Cardio';muscles:string[];detail:string;enabled:boolean;custom?:boolean;defaultTarget?:string;defaultUnit?:string};
export type LibraryWorkout={id:number;name:string;kind:'Strength'|'Cardio'|'Circuit';source:'User'|'Forge';summary:string;exercises?:string[];plan?:PlannedCardio};
export type ExerciseCategory='Strength'|'Cardio'|'HYROX'|'CrossFit';
/* The category is the programme bucket a movement belongs to. It was derived
   from `detail` alone, which named HYROX and CrossFit but nothing for plain
   conditioning — so Run and Rowing were labelled "Strength" in the library. */
export const exerciseCategory=(exercise:Pick<LibraryExercise,'detail'|'kind'>):ExerciseCategory=>/HYROX/i.test(exercise.detail)?'HYROX':/CrossFit/i.test(exercise.detail)?'CrossFit':exercise.kind==='Cardio'?'Cardio':'Strength';
const starterExercises:LibraryExercise[]=[
  {id:1,name:'Back Squat',kind:'Strength',muscles:['Quads','Glutes','Hamstrings'],detail:'Barbell · Weight + reps · Primary lift',enabled:true},{id:2,name:'Bench Press',kind:'Strength',muscles:['Chest'],detail:'Barbell · Weight + reps · Primary lift',enabled:true},{id:3,name:'Hack Squat',kind:'Strength',muscles:['Quads','Glutes'],detail:'Machine · Weight + reps · Accessory',enabled:true},{id:4,name:'Lat Pulldown',kind:'Strength',muscles:['Back'],detail:'Cable · Weight + reps · Accessory',enabled:true},
  {id:5,name:'Run',kind:'Cardio',muscles:['Quads','Hamstrings','Glutes','Cardio'],detail:'Run · distance',enabled:true,defaultTarget:'400',defaultUnit:'meters'},{id:6,name:'Rowing',kind:'Cardio',muscles:['Back','Quads','Hamstrings','Glutes','Cardio'],detail:'Rower · distance',enabled:true,defaultTarget:'500',defaultUnit:'meters'},
  {id:7,name:'SkiErg',kind:'Cardio',muscles:['Back','Shoulders','Abs','Cardio'],detail:'HYROX · distance',enabled:true,defaultTarget:'500',defaultUnit:'meters'},{id:8,name:'Sled Push',kind:'Strength',muscles:['Quads','Glutes','Hamstrings'],detail:'HYROX · distance',enabled:true,defaultTarget:'25',defaultUnit:'meters'},{id:9,name:'Sled Pull',kind:'Strength',muscles:['Back','Biceps','Quads','Glutes'],detail:'HYROX · distance',enabled:true,defaultTarget:'25',defaultUnit:'meters'},{id:10,name:'Burpee Broad Jumps',kind:'Strength',muscles:['Chest','Shoulders','Quads','Glutes','Abs'],detail:'HYROX · distance',enabled:true,defaultTarget:'20',defaultUnit:'meters'},{id:11,name:'Farmers Carry',kind:'Strength',muscles:['Forearms','Back','Quads','Glutes','Abs'],detail:'HYROX · distance',enabled:true,defaultTarget:'50',defaultUnit:'meters'},{id:12,name:'Sandbag Lunges',kind:'Strength',muscles:['Quads','Glutes','Hamstrings'],detail:'HYROX · distance',enabled:true,defaultTarget:'25',defaultUnit:'meters'},{id:13,name:'Wall Balls',kind:'Strength',muscles:['Quads','Glutes','Shoulders','Triceps'],detail:'HYROX · repetitions',enabled:true,defaultTarget:'25',defaultUnit:'reps'},
  {id:14,name:'Assault Bike',kind:'Cardio',muscles:['Quads','Glutes','Hamstrings','Cardio'],detail:'CrossFit · calories',enabled:true,defaultTarget:'20',defaultUnit:'calories'},{id:15,name:'Box Jumps',kind:'Strength',muscles:['Quads','Glutes','Hamstrings'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'15',defaultUnit:'reps'},{id:16,name:'Kettlebell Swings',kind:'Strength',muscles:['Glutes','Hamstrings','Back','Shoulders'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'20',defaultUnit:'reps'},{id:17,name:'Deadlift',kind:'Strength',muscles:['Back','Glutes','Hamstrings'],detail:'CrossFit · weight + reps',enabled:true,defaultTarget:'10',defaultUnit:'reps'},{id:18,name:'Thrusters',kind:'Strength',muscles:['Quads','Glutes','Shoulders','Triceps'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'12',defaultUnit:'reps'},{id:19,name:'Pull Ups',kind:'Strength',muscles:['Back'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'10',defaultUnit:'reps'},{id:20,name:'Toes to Bar',kind:'Strength',muscles:['Abs','Forearms','Shoulders'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'10',defaultUnit:'reps'},{id:21,name:'Handstand Push Ups',kind:'Strength',muscles:['Shoulders'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'10',defaultUnit:'reps'},{id:22,name:'Double Unders',kind:'Cardio',muscles:['Quads','Glutes','Calves','Cardio'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'50',defaultUnit:'reps'},{id:23,name:'Rope Climbs',kind:'Strength',muscles:['Back','Biceps','Forearms','Abs'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'3',defaultUnit:'reps'},{id:24,name:'Clean and Jerk',kind:'Strength',muscles:['Quads','Glutes','Hamstrings','Shoulders','Triceps'],detail:'CrossFit · weight + reps',enabled:true,defaultTarget:'8',defaultUnit:'reps'},{id:25,name:'Snatch',kind:'Strength',muscles:['Quads','Glutes','Hamstrings','Shoulders','Back'],detail:'CrossFit · weight + reps',enabled:true,defaultTarget:'8',defaultUnit:'reps'},{id:26,name:'Push Ups',kind:'Strength',muscles:['Chest'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'15',defaultUnit:'reps'}
];
const starterWorkouts:LibraryWorkout[]=[];
type Value={exercises:LibraryExercise[];workouts:LibraryWorkout[];addExercise:(exercise:Omit<LibraryExercise,'id'>)=>LibraryExercise;updateExercise:(id:number,change:Partial<LibraryExercise>)=>void;removeExercise:(id:number)=>void;addWorkout:(workout:Omit<LibraryWorkout,'id'>)=>LibraryWorkout;updateWorkout:(id:number,change:Partial<LibraryWorkout>)=>void;removeWorkout:(id:number)=>void;toggleExercise:(id:number)=>void};
const Context=createContext<Value|null>(null);const key='forge-training-library-v1';const circuitLibraryVersion=1;

const normalizeExercise=(item:Partial<LibraryExercise>,id:number):LibraryExercise=>({
  id:Number(item.id)||id,
  name:String(item.name||'Unnamed exercise'),
  kind:item.kind==='Cardio'?'Cardio':'Strength',
  /* Known movements carry only their PRIMARY movers — pull ups are Back, bench
     is Chest. Runs on every load, so already-synced libraries heal too. A
     custom exercise not in the map keeps the athlete's own muscle picks. */
  muscles:primaryMusclesFor(String(item.name||''),normalizeMuscleGroups(item.muscles)),
  detail:String(item.detail||'User exercise'),
  enabled:item.enabled!==false,
  custom:item.custom,
  defaultTarget:item.defaultTarget?String(item.defaultTarget):undefined,
  defaultUnit:item.defaultUnit?String(item.defaultUnit):undefined,
});

export function TrainingLibraryProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  const [state,setState]=useState<{exercises:LibraryExercise[];workouts:LibraryWorkout[];circuitLibraryVersion:number}>(()=>{try{
    const saved=JSON.parse(localStorage.getItem(key)||'{}');
    const savedExercises=Array.isArray(saved.exercises)?saved.exercises.map((item:Partial<LibraryExercise>,index:number)=>normalizeExercise(item,Date.now()+index)):[];
    const needsCircuitSeed=(saved.circuitLibraryVersion||0)<circuitLibraryVersion;
    /* Heal duplicates already persisted: when two saved rows are the same lift
       under different names (imported "Squat" beside starter "Back Squat"),
       the imported/custom one is the athlete's — the starter drops. */
    const byKey=new Map<string,LibraryExercise>();
    savedExercises.forEach((item:LibraryExercise)=>{const k=canonicalLiftKey(item.name);const held=byKey.get(k);if(!held||(item.custom&&!held.custom))byKey.set(k,item)});
    const dedupedSaved=savedExercises.filter((item:LibraryExercise)=>byKey.get(canonicalLiftKey(item.name))===item);
    const existingNames=new Set(dedupedSaved.map((item:LibraryExercise)=>canonicalLiftKey(item.name)));
    const exercises=needsCircuitSeed?[...dedupedSaved,...starterExercises.filter(item=>!existingNames.has(canonicalLiftKey(item.name)))]:(dedupedSaved.length?dedupedSaved:starterExercises);
    return{exercises,workouts:Array.isArray(saved.workouts)?saved.workouts:starterWorkouts,circuitLibraryVersion};
  }catch{return{exercises:starterExercises,workouts:starterWorkouts,circuitLibraryVersion}}});

  useEffect(()=>localStorage.setItem(key,JSON.stringify(state)),[state]);
  useEffect(()=>{if(isDemoMode||!user)return;let active=true;void supabase.from('exercise_library').select('*').eq('owner_id',user.id).order('name').then(({data,error})=>{
    if(!active||error||!data?.length)return;
    const imported=data.map((row,index)=>normalizeExercise({id:-(index+1),name:row.name,kind:row.kind,muscles:row.muscle_groups,detail:row.detail||'Imported from legacy Google Sheets',enabled:row.enabled,custom:true,defaultTarget:row.default_target,defaultUnit:row.default_unit},-(index+1)));
    /* Alias-aware: an imported "Squat" makes the starter "Back Squat" a
       duplicate, not a different lift. Filtering by canonical key also heals
       libraries that already persisted both — the merge runs on every signed-in
       load, so the duplicate starter drops out the next time the app opens. */
    setState(value=>{const remoteNames=new Set(imported.map(item=>canonicalLiftKey(item.name)));return{...value,exercises:[...imported,...value.exercises.filter(item=>!remoteNames.has(canonicalLiftKey(item.name)))]}});
  });return()=>{active=false}},[user]);

  const addExercise=(exercise:Omit<LibraryExercise,'id'>)=>{const next=normalizeExercise({...exercise,id:Date.now()},Date.now());setState(value=>({...value,exercises:[...value.exercises,next]}));if(!isDemoMode&&user)void supabase.from('exercise_library').insert({owner_id:user.id,name:next.name,kind:next.kind,muscle_groups:next.muscles,detail:next.detail,enabled:next.enabled,default_target:next.defaultTarget||null,default_unit:next.defaultUnit||null}).then(({error})=>{if(error)console.warn('Exercise sync failed',error.message)});return next};
  const updateExercise=(id:number,change:Partial<LibraryExercise>)=>{const target=state.exercises.find(item=>item.id===id);if(!target)return;const next=normalizeExercise({...target,...change,id},id);setState(value=>({...value,exercises:value.exercises.map(item=>item.id===id?next:item)}));if(!isDemoMode&&user)void supabase.from('exercise_library').update({name:next.name,kind:next.kind,muscle_groups:next.muscles,detail:next.detail,enabled:next.enabled,default_target:next.defaultTarget||null,default_unit:next.defaultUnit||null}).eq('owner_id',user.id).eq('name',target.name).then(({error})=>{if(error)console.warn('Exercise update sync failed',error.message)});};
  const removeExercise=(id:number)=>{const target=state.exercises.find(item=>item.id===id);if(!target)return;setState(value=>({...value,exercises:value.exercises.filter(item=>item.id!==id)}));try{const plan=JSON.parse(localStorage.getItem('forge-training-plan-v1')||'null');if(plan?.days){plan.days=plan.days.map((day:{exercises?:string[]})=>({...day,exercises:(day.exercises||[]).filter(name=>name!==target.name)}));localStorage.setItem('forge-training-plan-v1',JSON.stringify(plan))}}catch{console.warn('Could not remove the exercise from the locally saved split.')}if(!isDemoMode&&user)void supabase.from('exercise_library').delete().eq('owner_id',user.id).eq('name',target.name).then(async({error})=>{if(error){window.alert(`“${target.name}” was removed here, but could not be deleted from your account. Refresh and try again.`);return}const {data:days,error:daysError}=await supabase.from('training_split_days').select('id,goal_lifts');if(daysError)return;await Promise.all((days||[]).filter(day=>Array.isArray(day.goal_lifts)&&day.goal_lifts.includes(target.name)).map(day=>supabase.from('training_split_days').update({goal_lifts:day.goal_lifts.filter((name:string)=>name!==target.name)}).eq('id',day.id)))});};
  const addWorkout=(workout:Omit<LibraryWorkout,'id'>)=>{const next={...workout,id:Date.now()};setState(value=>({...value,workouts:[...value.workouts,next]}));return next};
  const updateWorkout=(id:number,change:Partial<LibraryWorkout>)=>setState(value=>({...value,workouts:value.workouts.map(item=>item.id===id?{...item,...change}:item)}));
  const removeWorkout=(id:number)=>setState(value=>({...value,workouts:value.workouts.filter(item=>item.id!==id)}));
  const toggleExercise=(id:number)=>setState(value=>({...value,exercises:value.exercises.map(item=>item.id===id?{...item,enabled:!item.enabled}:item)}));
  return <Context.Provider value={{...state,addExercise,updateExercise,removeExercise,addWorkout,updateWorkout,removeWorkout,toggleExercise}}>{children}</Context.Provider>;
}
export function useTrainingLibrary(){const value=useContext(Context);if(!value)throw new Error('Training library provider missing');return value}
