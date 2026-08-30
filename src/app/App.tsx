import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { OnboardingGate } from '../components/OnboardingGate';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { LegalPage } from '../pages/LegalPage';
import { AppShell } from '../components/AppShell';
import { WorkoutPage } from '../pages/ProductPages';
import { OnboardingPage } from '../pages/OnboardingPage';
import { TrainingPlanPage } from '../pages/TrainingPlanPage';
import { YouPage } from '../pages/YouPage';
import { ProfilePage } from '../pages/ProfilePage';
import { CoachPage } from '../pages/CoachPage';


import { ExerciseLibraryPage } from '../pages/ExerciseLibraryPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Outside ProtectedRoute on purpose: an App Store reviewer, and anyone
          deciding whether to sign up at all, has to be able to read these
          without an account (Guideline 5.1.1(i)). */}
      <Route path="/legal/:document" element={<LegalPage />} />
      <Route path="/auth/callback" element={<Navigate to="/" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<OnboardingGate />}>
          <Route element={<AppShell coach={<CoachPage />} />}>
          <Route index element={<HomePage />} />
          <Route path="/workout" element={<WorkoutPage />} />
          <Route path="/history" element={<YouPage />} />
          <Route path="/insights" element={<YouPage />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/goals" element={<YouPage />} />
          <Route path="/plan" element={<TrainingPlanPage />} />
          <Route path="/exercises" element={<ExerciseLibraryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
