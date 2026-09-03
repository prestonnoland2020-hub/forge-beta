import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useGoals } from '../features/goals/GoalsProvider';

/* A GOAL IS PART OF BEING SET UP. Forge's whole claim is that it programs
   toward something; without a goal there is no wave to run, no mileage to ramp
   toward, and no max week — the athlete lands on a home screen full of empty
   states and never sees the thing that makes the app different. Four of the
   first seven accounts sat in exactly that state.

   The gate waits for `hydrated` before judging emptiness. An empty list on a
   fresh device means "the server has not answered yet" for the first seconds
   after sign-in, and redirecting on that would throw an athlete who has goals
   back into setup. */
export function OnboardingGate(){
  const {completed,loading,setup}=useProfileSetup();
  const {goals,hydrated}=useGoals();
  const location=useLocation();
  if(loading||!hydrated)return <main className="profile-loading"><span className="forge-mark">—</span><strong>FORGE</strong><p>Loading your training profile…</p></main>;
  if(!completed)return <Navigate to="/onboarding" replace state={{from:location.pathname}}/>;
  /* Set up before the goal step existed: finish the part that is missing. */
  if(!goals.length)return <Navigate to="/onboarding" replace state={{from:location.pathname,needsGoal:true}}/>;
  /* AND A LIFTING DAY MUST NAME A MOVEMENT. The starter split arrives with
     empty days; a block built over them prescribes nothing, and a goal lift can
     sit in the block's focus line while no day trains it — which is exactly how
     Bench ended up in the header and nowhere in the week. The athlete is sent
     to the step that fills them, not through setup again.

     The editor itself is exempt: a split day emptied while editing must not
     eject the athlete from the screen they are editing it on. */
  /* Read BOTH copies before judging. The Plan tab's local split is the richer
     one and is what the athlete actually edits; deciding from the account copy
     alone would eject someone whose split is fully mapped on this device. */
  const localPlanDays=(()=>{try{return (JSON.parse(localStorage.getItem('forge-training-plan-v1')||'null') as {days?:Array<{dayType?:string;exercises?:string[]}>}|null)?.days||[]}catch{return []}})();
  const lifting=(setup?.splitDays||[]).filter(day=>day.type==='Strength'||day.type==='Mixed');
  const localLifting=localPlanDays.filter(day=>day.dayType==='strength'||day.dayType==='mixed');
  const mappedAnywhere=lifting.some(day=>(day.exercises||[]).length)||localLifting.some(day=>(day.exercises||[]).length);
  const unmapped=(lifting.length>0||localLifting.length>0)&&!mappedAnywhere;
  const editingSplit=location.pathname.startsWith('/split')||location.pathname.startsWith('/plan');
  if(unmapped&&!editingSplit)return <Navigate to="/onboarding" replace state={{from:location.pathname,needsExercises:true}}/>;
  return <Outlet/>;
}
