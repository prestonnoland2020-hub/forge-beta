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
import { HistoryPage } from '../pages/HistoryPage';
import { InsightsPage } from '../pages/InsightsPage';
import { GoalsPage } from '../pages/GoalsPage';
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
          {/* Activities, Progress and Goals are their own pages. The tabbed
              "You" surface hid Goals two taps deep and duplicated Activities;
              Preston's call: calendar-first Activities in the tab bar, Goals
              findable on its own, Progress behind the chart bubble up top. */}
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/coach" element={<CoachPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/plan" element={<TrainingPlanPage />} />
          <Route path="/split" element={<TrainingPlanPage mode="split" />} />
          <Route path="/exercises" element={<ExerciseLibraryPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
