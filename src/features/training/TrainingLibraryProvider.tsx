import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import type { PlannedCardio } from '../../components/CardioPlanBuilder';
import { isDemoMode } from '../../lib/env';
import { canonicalLiftKey, primaryMusclesFor } from '../../lib/liftAliases';
import { normalizeMuscleGroups } from '../../lib/muscleGroups';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useSyncStatus } from '../sync/SyncStatusProvider';

export type LibraryExercise={id:number;name:string;kind:'Strength'|'Cardio';muscles:string[];detail:string;enabled:boolean;custom?:boolean;defaultTarget?:string;defaultUnit?:string;categories?:ExerciseCategory[]};
export type LibraryWorkout={id:number;name:string;kind:'Strength'|'Cardio'|'Circuit';source:'User'|'Forge';summary:string;exercises?:string[];plan?:PlannedCardio};
export type ExerciseCategory='Strength'|'Cardio'|'HYROX'|'CrossFit';

/* A MOVEMENT CAN BELONG TO MORE THAN ONE PROGRAMME.

   The category was one value derived from `detail`, and every "can Forge
   program this as a lift" check compared it to 'Strength'. The deadlift was
   the case that broke it: it is a barbell strength lift AND a CrossFit
   movement, but naming CrossFit in its detail put it in that bucket alone, so
   it vanished from split mapping, goal building and the workout logger — a
   main lift that could not be programmed.

   Categories are a set now. `categories` on the exercise wins when present;
   otherwise it is derived from `detail` exactly as before, so every saved
   library keeps the behaviour it had. */
export const exerciseCategories=(exercise:Pick<LibraryExercise,'detail'|'kind'|'categories'>):ExerciseCategory[]=>{
  if(exercise.categories?.length)return exercise.categories;
  if(/HYROX/i.test(exercise.detail))return['HYROX'];
  if(/CrossFit/i.test(exercise.detail))return['CrossFit'];
  return[exercise.kind==='Cardio'?'Cardio':'Strength'];
};
/* The bucket it sorts under — the first it claims. */
export const exerciseCategory=(exercise:Pick<LibraryExercise,'detail'|'kind'|'categories'>):ExerciseCategory=>exerciseCategories(exercise)[0];
/* The question nearly every caller was really asking: may Forge prescribe this
   as a strength lift? A movement that also belongs to CrossFit still can. */
export const isProgrammableStrength=(exercise:Pick<LibraryExercise,'detail'|'kind'|'categories'>):boolean=>exercise.kind==='Strength'&&exerciseCategories(exercise).includes('Strength');
const starterExercises:LibraryExercise[]=[
  {id:1,name:'Back Squat',kind:'Strength',muscles:['Quads','Glutes','Hamstrings'],detail:'Barbell · Weight + reps · Primary lift',enabled:true},{id:2,name:'Bench Press',kind:'Strength',muscles:['Chest'],detail:'Barbell · Weight + reps · Primary lift',enabled:true},{id:3,name:'Hack Squat',kind:'Strength',muscles:['Quads','Glutes'],detail:'Machine · Weight + reps · Accessory',enabled:true},{id:4,name:'Lat Pulldown',kind:'Strength',muscles:['Back'],detail:'Cable · Weight + reps · Accessory',enabled:true},
  {id:5,name:'Run',kind:'Cardio',muscles:['Quads','Hamstrings','Glutes','Cardio'],detail:'Run · distance',enabled:true,defaultTarget:'400',defaultUnit:'meters'},{id:6,name:'Rowing',kind:'Cardio',muscles:['Back','Quads','Hamstrings','Glutes','Cardio'],detail:'Rower · distance',enabled:true,defaultTarget:'500',defaultUnit:'meters'},
  {id:7,name:'SkiErg',kind:'Cardio',muscles:['Back','Shoulders','Abs','Cardio'],detail:'HYROX · distance',enabled:true,defaultTarget:'500',defaultUnit:'meters'},{id:8,name:'Sled Push',kind:'Strength',muscles:['Quads','Glutes','Hamstrings'],detail:'HYROX · distance',enabled:true,defaultTarget:'25',defaultUnit:'meters'},{id:9,name:'Sled Pull',kind:'Strength',muscles:['Back','Biceps','Quads','Glutes'],detail:'HYROX · distance',enabled:true,defaultTarget:'25',defaultUnit:'meters'},{id:10,name:'Burpee Broad Jumps',kind:'Strength',muscles:['Chest','Shoulders','Quads','Glutes','Abs'],detail:'HYROX · distance',enabled:true,defaultTarget:'20',defaultUnit:'meters'},{id:11,name:'Farmers Carry',kind:'Strength',muscles:['Forearms','Back','Quads','Glutes','Abs'],detail:'HYROX · distance',enabled:true,defaultTarget:'50',defaultUnit:'meters'},{id:12,name:'Sandbag Lunges',kind:'Strength',muscles:['Quads','Glutes','Hamstrings'],detail:'HYROX · distance',enabled:true,defaultTarget:'25',defaultUnit:'meters'},{id:13,name:'Wall Balls',kind:'Strength',muscles:['Quads','Glutes','Shoulders','Triceps'],detail:'HYROX · repetitions',enabled:true,defaultTarget:'25',defaultUnit:'reps'},
  /* EVERY MUSCLE A SPLIT DAY CAN NAME NEEDS SOMETHING TO MAP TO.

     The starter library had four plain-strength movements — squat, bench, hack
     squat, lat pulldown — covering chest, back and legs. HYROX and CrossFit
     entries are filtered out of the mapper by category, so a day named
     "Shoulders & Arms" opened to an empty list and setup could not be
     completed: the athlete is told to choose at least one exercise and there
     is not one to choose. A goal lift is offered on every day, so the only way
     through was to map Bench Press to a shoulders day, which then programs
     bench on it forever.

     One primary movement per muscle a split day can name. Anyone who wants
     their own can still add it in the Library; the point is that nobody is
     ever cornered. */
  {id:27,name:'Overhead Press',kind:'Strength',muscles:['Shoulders'],detail:'Barbell · Weight + reps · Primary lift',enabled:true},{id:28,name:'Barbell Row',kind:'Strength',muscles:['Back'],detail:'Barbell · Weight + reps · Primary lift',enabled:true},{id:29,name:'Romanian Deadlift',kind:'Strength',muscles:['Hamstrings'],detail:'Barbell · Weight + reps · Primary lift',enabled:true},
  {id:30,name:'Barbell Curl',kind:'Strength',muscles:['Biceps'],detail:'Barbell · Weight + reps · Accessory',enabled:true},{id:31,name:'Triceps Pushdown',kind:'Strength',muscles:['Triceps'],detail:'Cable · Weight + reps · Accessory',enabled:true},{id:32,name:'Standing Calf Raise',kind:'Strength',muscles:['Calves'],detail:'Machine · Weight + reps · Accessory',enabled:true},
  {id:33,name:'Hanging Leg Raise',kind:'Strength',muscles:['Abs'],detail:'Bodyweight · repetitions · Accessory',enabled:true,defaultTarget:'12',defaultUnit:'reps'},{id:34,name:'Incline Dumbbell Press',kind:'Strength',muscles:['Chest'],detail:'Dumbbell · Weight + reps · Accessory',enabled:true},{id:35,name:'Lateral Raise',kind:'Strength',muscles:['Shoulders'],detail:'Dumbbell · Weight + reps · Accessory',enabled:true},{id:36,name:'Hammer Curl',kind:'Strength',muscles:['Biceps'],detail:'Dumbbell · Weight + reps · Accessory',enabled:true},{id:37,name:'Wrist Curl',kind:'Strength',muscles:['Forearms'],detail:'Dumbbell · Weight + reps · Accessory',enabled:true},
  {id:14,name:'Assault Bike',kind:'Cardio',muscles:['Quads','Glutes','Hamstrings','Cardio'],detail:'CrossFit · calories',enabled:true,defaultTarget:'20',defaultUnit:'calories'},{id:15,name:'Box Jumps',kind:'Strength',muscles:['Quads','Glutes','Hamstrings'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'15',defaultUnit:'reps'},{id:16,name:'Kettlebell Swings',kind:'Strength',muscles:['Glutes','Hamstrings','Back','Shoulders'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'20',defaultUnit:'reps'},{id:17,name:'Deadlift',kind:'Strength',muscles:['Back','Glutes','Hamstrings'],detail:'Barbell · Weight + reps · Primary lift · CrossFit',categories:['Strength','CrossFit'],enabled:true,defaultTarget:'10',defaultUnit:'reps'},{id:18,name:'Thrusters',kind:'Strength',muscles:['Quads','Glutes','Shoulders','Triceps'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'12',defaultUnit:'reps'},{id:19,name:'Pull Ups',kind:'Strength',muscles:['Back'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'10',defaultUnit:'reps'},{id:20,name:'Toes to Bar',kind:'Strength',muscles:['Abs','Forearms','Shoulders'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'10',defaultUnit:'reps'},{id:21,name:'Handstand Push Ups',kind:'Strength',muscles:['Shoulders'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'10',defaultUnit:'reps'},{id:22,name:'Double Unders',kind:'Cardio',muscles:['Quads','Glutes','Calves','Cardio'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'50',defaultUnit:'reps'},{id:23,name:'Rope Climbs',kind:'Strength',muscles:['Back','Biceps','Forearms','Abs'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'3',defaultUnit:'reps'},{id:24,name:'Clean and Jerk',kind:'Strength',muscles:['Quads','Glutes','Hamstrings','Shoulders','Triceps'],detail:'CrossFit · weight + reps',enabled:true,defaultTarget:'8',defaultUnit:'reps'},{id:25,name:'Snatch',kind:'Strength',muscles:['Quads','Glutes','Hamstrings','Shoulders','Back'],detail:'CrossFit · weight + reps',enabled:true,defaultTarget:'8',defaultUnit:'reps'},{id:26,name:'Push Ups',kind:'Strength',muscles:['Chest'],detail:'CrossFit · repetitions',enabled:true,defaultTarget:'15',defaultUnit:'reps'}
];
const starterWorkouts:LibraryWorkout[]=[];
type Value={exercises:LibraryExercise[];workouts:LibraryWorkout[];addExercise:(exercise:Omit<LibraryExercise,'id'>)=>LibraryExercise;updateExercise:(id:number,change:Partial<LibraryExercise>)=>void;removeExercise:(id:number)=>void;addWorkout:(workout:Omit<LibraryWorkout,'id'>)=>LibraryWorkout;updateWorkout:(id:number,change:Partial<LibraryWorkout>)=>void;removeWorkout:(id:number)=>void;toggleExercise:(id:number)=>void};
const Context=createContext<Value|null>(null);const key='forge-training-library-v1';
/* Bumped to 2 with the shoulder/arm/hamstring/calf/ab movements: the top-up
   below adds any starter an existing library is missing, by canonical name, so
   athletes who signed up before them are not left with the gap either. */
const circuitLibraryVersion=2;

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
  /* Kept when the exercise declares them; otherwise left off so the detail
     string keeps deriving it, which is what every existing saved row does. */
  categories:item.categories?.length?item.categories:undefined,
});

export function TrainingLibraryProvider({children}:{children:ReactNode}){
  const {user}=useAuth();
  /* THE LIBRARY IS ACCOUNT DATA TOO. Every write here answered a failure with
     console.warn, so an exercise added, renamed or switched off on a phone that
     could not reach the account looked saved and was not. */
  const {report}=useSyncStatus();
  const libraryFailed=(action:string)=>({error}:{error:{message:string}|null})=>report('exercise-library',error
    ?{label:'Exercise library',message:`${action} did not reach your account (${error.message}).`}
    :null);
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
    const imported=data.map((row,index)=>normalizeExercise({id:-(index+1),name:row.name,kind:row.kind,muscles:row.muscle_groups,detail:row.detail||'Imported from your training history',enabled:row.enabled,custom:true,defaultTarget:row.default_target,defaultUnit:row.default_unit},-(index+1)));
    /* Alias-aware: an imported "Squat" makes the starter "Back Squat" a
       duplicate, not a different lift. Filtering by canonical key also heals
       libraries that already persisted both — the merge runs on every signed-in
       load, so the duplicate starter drops out the next time the app opens. */
    setState(value=>{const remoteNames=new Set(imported.map(item=>canonicalLiftKey(item.name)));return{...value,exercises:[...imported,...value.exercises.filter(item=>!remoteNames.has(canonicalLiftKey(item.name)))]}});
  });return()=>{active=false}},[user]);

  const addExercise=(exercise:Omit<LibraryExercise,'id'>)=>{const next=normalizeExercise({...exercise,id:Date.now()},Date.now());setState(value=>({...value,exercises:[...value.exercises,next]}));if(!isDemoMode&&user)void supabase.from('exercise_library').insert({owner_id:user.id,name:next.name,kind:next.kind,muscle_groups:next.muscles,detail:next.detail,enabled:next.enabled,default_target:next.defaultTarget||null,default_unit:next.defaultUnit||null}).then(({error}:{error:{message:string}|null})=>libraryFailed('A new exercise')({error}));return next};
  const updateExercise=(id:number,change:Partial<LibraryExercise>)=>{const target=state.exercises.find(item=>item.id===id);if(!target)return;const next=normalizeExercise({...target,...change,id},id);setState(value=>({...value,exercises:value.exercises.map(item=>item.id===id?next:item)}));if(!isDemoMode&&user)void supabase.from('exercise_library').update({name:next.name,kind:next.kind,muscle_groups:next.muscles,detail:next.detail,enabled:next.enabled,default_target:next.defaultTarget||null,default_unit:next.defaultUnit||null}).eq('owner_id',user.id).eq('name',target.name).then(({error}:{error:{message:string}|null})=>libraryFailed('An exercise edit')({error}));};
  const removeExercise=(id:number)=>{const target=state.exercises.find(item=>item.id===id);if(!target)return;setState(value=>({...value,exercises:value.exercises.filter(item=>item.id!==id)}));try{const plan=JSON.parse(localStorage.getItem('forge-training-plan-v1')||'null');if(plan?.days){plan.days=plan.days.map((day:{exercises?:string[]})=>({...day,exercises:(day.exercises||[]).filter(name=>name!==target.name)}));localStorage.setItem('forge-training-plan-v1',JSON.stringify(plan))}}catch{console.warn('Could not remove the exercise from the locally saved split.')}if(!isDemoMode&&user)void supabase.from('exercise_library').delete().eq('owner_id',user.id).eq('name',target.name).then(async({error})=>{if(error){window.alert(`“${target.name}” was removed here, but could not be deleted from your account. Refresh and try again.`);return}const {data:days,error:daysError}=await supabase.from('training_split_days').select('id,goal_lifts');if(daysError)return;await Promise.all((days||[]).filter(day=>Array.isArray(day.goal_lifts)&&day.goal_lifts.includes(target.name)).map(day=>supabase.from('training_split_days').update({goal_lifts:day.goal_lifts.filter((name:string)=>name!==target.name)}).eq('id',day.id)))});};
  const addWorkout=(workout:Omit<LibraryWorkout,'id'>)=>{const next={...workout,id:Date.now()};setState(value=>({...value,workouts:[...value.workouts,next]}));return next};
  const updateWorkout=(id:number,change:Partial<LibraryWorkout>)=>setState(value=>({...value,workouts:value.workouts.map(item=>item.id===id?{...item,...change}:item)}));
  const removeWorkout=(id:number)=>setState(value=>({...value,workouts:value.workouts.filter(item=>item.id!==id)}));
  /* ON/OFF IS A REAL EDIT, and it has to reach the account. It only ever
     changed local state, while the signed-in load re-imports `enabled` from the
     row on every open — so an exercise switched off came back on at the next
     launch. A starter exercise has no row yet, so this upserts rather than
     updates. */
  const toggleExercise=(id:number)=>{const target=state.exercises.find(item=>item.id===id);if(!target)return;const enabled=!target.enabled;setState(value=>({...value,exercises:value.exercises.map(item=>item.id===id?{...item,enabled}:item)}));if(!isDemoMode&&user)void supabase.from('exercise_library').upsert({owner_id:user.id,name:target.name,kind:target.kind,muscle_groups:target.muscles,detail:target.detail,enabled,default_target:target.defaultTarget||null,default_unit:target.defaultUnit||null},{onConflict:'owner_id,name'}).then(({error}:{error:{message:string}|null})=>libraryFailed('Switching an exercise on or off')({error}))};
  return <Context.Provider value={{...state,addExercise,updateExercise,removeExercise,addWorkout,updateWorkout,removeWorkout,toggleExercise}}>{children}</Context.Provider>;
}
export function useTrainingLibrary(){const value=useContext(Context);if(!value)throw new Error('Training library provider missing');return value}
