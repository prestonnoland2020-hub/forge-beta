import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';

export function OnboardingGate(){
  const {completed,loading}=useProfileSetup();
  const location=useLocation();
  if(loading)return <main className="profile-loading"><span className="forge-mark">—</span><strong>FORGE</strong><p>Loading your training profile…</p></main>;
  if(!completed)return <Navigate to="/onboarding" replace state={{from:location.pathname}}/>;
  return <Outlet/>;
}
