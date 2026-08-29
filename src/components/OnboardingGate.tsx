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
  const {completed,loading}=useProfileSetup();
  const {goals,hydrated}=useGoals();
  const location=useLocation();
  if(loading||!hydrated)return <main className="profile-loading"><span className="forge-mark">—</span><strong>FORGE</strong><p>Loading your training profile…</p></main>;
  if(!completed)return <Navigate to="/onboarding" replace state={{from:location.pathname}}/>;
  /* Set up before the goal step existed: finish the part that is missing. */
  if(!goals.length)return <Navigate to="/onboarding" replace state={{from:location.pathname,needsGoal:true}}/>;
  return <Outlet/>;
}
