import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';

export function OnboardingGate(){
  const {completed}=useProfileSetup();
  const location=useLocation();
  if(!completed)return <Navigate to="/onboarding" replace state={{from:location.pathname}}/>;
  return <Outlet/>;
}
