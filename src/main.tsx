import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './features/auth/AuthProvider';
import { AppearanceProvider } from './features/preferences/AppearanceProvider';
import { GoalsProvider } from './features/goals/GoalsProvider';
import { AdaptiveTrainingProvider } from './features/training/AdaptiveTrainingProvider';
import { WorkoutHistoryProvider } from './features/training/WorkoutHistoryProvider';
import { ProfileSetupProvider } from './features/profile/ProfileSetupProvider';
import { CoachingStrategyProvider } from './features/training/CoachingStrategyProvider';
import { TrainingLibraryProvider } from './features/training/TrainingLibraryProvider';
import { DailyRecommendationProvider } from './features/training/DailyRecommendationProvider';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './styles.css';
import './workout.css';
import './top-set-history.css';
import './insights-range.css';
import './strength-progress.css';
import './muscle-frequency.css';
import './cardio-insights.css';
import './running-performance.css';
import './insights-layout.css';
import './insights-overview.css';
import './insights-coaching.css';
import './goals-workspace.css';
import './readable-plan.css';
import './cardio.css';
import './interval-actuals.css';
import './plan.css';
import './plan-workflow.css';
import './rhythm.css';
import './library.css';
import './split-muscles.css';
import './goal-builder.css';
import './goal-edit.css';
import './goal-tracking.css';
import './goal-tracker-filter.css';
import './goal-chart-pro.css';
import './goal-chart-redesign.css';
import './goal-evidence-filter.css';
import './goal-trajectory-state.css';
import './endurance-goals.css';
import './plan-navigation.css';
import './coach-home.css';
import './coaching-insights.css';
import './coach-page.css';
import './profile-pro.css';
import './profile-hub.css';
import './appearance.css';
import './appearance-elite.css';
import './appearance-system.css';
import './adaptive-plan.css';
import './friends-pro.css';
import './home-simple.css';
import './history.css';
import './onboarding.css';
import './onboarding-equipment.css';
import './onboarding-split.css';
import './long-range-plan.css';
import './simplified-platform.css';
import './frontend-polish.css';
import './profile-customization.css';
import './mobile-calm.css';
/* Loaded last: the authoritative token + primitive layer every earlier
   stylesheet now reads from. See the header comment in forge-system.css. */
import './forge-system.css';
/* UI packages override the system tokens per selected look — after the system
   layer so a package always wins. */
import './forge-packages.css';

// OAuth providers return to the public app URL before the hash route. Send the
// callback into Profile, where the signed-in user can finish the connection.
const callbackQuery = new URLSearchParams(window.location.search);
if (callbackQuery.get('strava') === 'callback' && !window.location.hash) {
  window.location.hash = '/profile';
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary><HashRouter>
      <AuthProvider>
        <AppearanceProvider><GoalsProvider><WorkoutHistoryProvider><AdaptiveTrainingProvider><ProfileSetupProvider><TrainingLibraryProvider><CoachingStrategyProvider><DailyRecommendationProvider><App /></DailyRecommendationProvider></CoachingStrategyProvider></TrainingLibraryProvider></ProfileSetupProvider></AdaptiveTrainingProvider></WorkoutHistoryProvider></GoalsProvider></AppearanceProvider>
      </AuthProvider>
    </HashRouter></AppErrorBoundary>
  </StrictMode>,
);
