import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { OnboardingGate } from '../components/OnboardingGate';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { AppShell } from '../components/AppShell';
import { WorkoutPage } from '../pages/ProductPages';
import { OnboardingPage } from '../pages/OnboardingPage';
import { TrainingPlanPage } from '../pages/TrainingPlanPage';
import { InsightsPage } from '../pages/InsightsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { CoachPage } from '../pages/CoachPage';
import { GoalsPage } from '../pages/GoalsPage';
import { HistoryPage } from '../pages/HistoryPage';
import { ExerciseLibraryPage } from '../pages/ExerciseLibraryPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<Navigate to="/" replace />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<OnboardingGate />}>
          <Route element={<AppShell coach={<CoachPage />} />}>
          <Route index element={<HomePage />} />
          <Route path="/workout" element={<WorkoutPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/goals" element={<GoalsPage />} />
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
