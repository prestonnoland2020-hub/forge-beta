import { useState } from 'react';
import { PageIntro } from '../components/AppShell';
import { ExerciseLibrary } from '../components/ExerciseLibrary';
import { WorkoutLibrary } from '../components/WorkoutLibrary';

export function ExerciseLibraryPage(){
  const [tab,setTab]=useState<'exercises'|'cardio'>('exercises');
  return <div className="stack-xl"><PageIntro copy="Pick, map, and manage what Forge can recommend."/><nav className="plan-tabs"><button className={tab==='exercises'?'active':''} onClick={()=>setTab('exercises')}>Exercises</button><button className={tab==='cardio'?'active':''} onClick={()=>setTab('cardio')}>Cardio & circuits</button></nav>{tab==='exercises'?<ExerciseLibrary/>:<WorkoutLibrary/>}</div>;
}
