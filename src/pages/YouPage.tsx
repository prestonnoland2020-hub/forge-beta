import { NavLink, useLocation, Link } from 'react-router-dom';
import { InsightsPage } from './InsightsPage';
import { GoalsPage } from './GoalsPage';
import { HistoryPage } from './HistoryPage';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { cardioMiles } from '../lib/cardioSession';

/* One consolidated "You" surface, patterned after Strava's You tab: a compact
   identity header, then Progress / Goals / Activities as peer views. The old
   standalone pages still exist at their old routes — they render here with
   their intros hidden so links keep working. */
const tabs = [
  ['/insights', 'Progress'],
  ['/goals', 'Goals'],
  ['/history', 'Activities'],
] as const;

export function YouPage() {
  const { pathname } = useLocation();
  const { setup } = useProfileSetup();
  const { records } = useWorkoutHistory();
  const initials = (setup?.displayName || 'Forge Athlete').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const now = new Date();
  const weekStart = new Date(now); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekIso = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
  const weekRecords = records.filter(record => record.date >= weekIso);
  const weekSets = weekRecords.reduce((total, record) => total + (record.topSets || []).filter(set => set.completed !== false).length, 0);
  const weekMiles = weekRecords.reduce((total, record) => total + (record.cardioSessions || []).reduce((sum, session) => sum + cardioMiles(session), 0), 0);
  const active = tabs.find(([to]) => pathname.startsWith(to))?.[0] || '/insights';
  return <div className="you-page stack-xl">
    <header className="you-header">
      <Link className="you-identity" to="/profile">
        <span className="avatar large">{initials}</span>
        <span><strong>{setup?.displayName || 'Athlete'}</strong><small>This week · {weekRecords.length} {weekRecords.length === 1 ? 'session' : 'sessions'} · {weekSets} top {weekSets === 1 ? 'set' : 'sets'} · {weekMiles ? `${weekMiles.toFixed(1)} mi` : '0 mi'}</small></span>
      </Link>
      <Link className="you-settings" to="/profile" aria-label="Profile and settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></svg></Link>
    </header>
    <nav className="you-tabs" aria-label="Your training views">
      {tabs.map(([to, label]) => <NavLink key={to} to={to} className={active === to ? 'active' : ''}>{label}</NavLink>)}
    </nav>
    <div className="you-tab-body">
      {active === '/insights' && <InsightsPage embedded />}
      {active === '/goals' && <GoalsPage embedded />}
      {active === '/history' && <HistoryPage embedded />}
    </div>
  </div>;
}
