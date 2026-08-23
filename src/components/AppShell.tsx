import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { isDemoMode } from '../lib/env';

/* One flat nav. The old "Manage" drawer hid Goals behind two taps and held a
   standalone exercise library that duplicated what the Log screen already does;
   exercises are only ever added while logging, so the library moved to Profile. */
const primaryNav = [
  ['/', 'Today', 'home'],
  ['/workout', 'Log', 'plus'],
  ['/plan', 'Plan', 'calendar'],
  ['/insights', 'Insights', 'chart'],
  ['/goals', 'Goals', 'target'],
  ['/history', 'History', 'history'],
] as const;

type NavGlyphName = typeof primaryNav[number][2] | 'library';
function NavGlyph({ name }: { name: NavGlyphName }) {
  const paths: Record<NavGlyphName, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/></>,
    plus: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
    history: <><path d="M4 6v5h5"/><path d="M5.5 17a8 8 0 1 0-.8-9"/><path d="M12 7v5l3 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m15 9 6-6M17 3h4v4"/></>,
    library: <><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z"/><path d="M7 16h12M9 8h6M9 11h6"/></>,
  };
  return <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg></span>;
}

export function AppShell({ coach }: { coach?: ReactNode }) {
  const location = useLocation();
  const { recovery } = useAdaptiveTraining();
  const { setup } = useProfileSetup();
  const { loading: historyLoading, syncing, syncError, retrySync } = useWorkoutHistory();
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachExpanded, setCoachExpanded] = useState(false);
  const initials = (setup?.displayName || 'Forge Athlete').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const titles: Record<string, string> = {
    '/': 'Today', '/workout': 'Log workout', '/history': 'History', '/insights': 'Insights',
    '/coach': 'Coach', '/goals': 'Goals', '/plan': 'Plan', '/exercises': 'Exercises', '/profile': 'Profile',
  };
  const hasRecoveryData = recovery.confidence !== 'Low';

  useEffect(() => {
    const open = () => setCoachOpen(true);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (coachExpanded) setCoachExpanded(false);
        else setCoachOpen(false);
      }
    };
    window.addEventListener('forge:open-coach', open);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('forge:open-coach', open);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [coachExpanded]);

  return <div className="app-frame">
    <aside className="sidebar">
      <NavLink className="brand" to="/" aria-label="Forge home"><span className="brand-mark"><i /></span><span>FORGE</span></NavLink>
      <nav className="side-nav" aria-label="Primary navigation">
        {primaryNav.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'}><NavGlyph name={icon}/>{label}</NavLink>)}
      </nav>
      <NavLink className="sidebar-foot" to="/profile"><div className="avatar small">{initials}</div><div><strong>{setup?.displayName || 'Athlete'}</strong><span>Profile & recovery</span></div><b>›</b></NavLink>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <div><span className="eyebrow">FORGE</span><h1>{titles[location.pathname] ?? 'Forge'}</h1></div>
        <div className="top-actions">
          {!isDemoMode && (historyLoading || syncing) && <span className="data-sync-state">{historyLoading ? 'Loading data…' : 'Saving…'}</span>}
          {hasRecoveryData && <NavLink className="top-readiness" to="/profile"><span>{recovery.readiness}</span><small>READY</small></NavLink>}
          <NavLink className="avatar" to="/profile">{initials}</NavLink>
        </div>
      </header>
      {!isDemoMode && syncError && <div className="data-sync-error"><span>Your latest training data is still saved on this device, but Supabase could not sync it.</span><button onClick={retrySync}>Retry</button></div>}
      <main className="page"><Outlet /></main>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {primaryNav.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'}><NavGlyph name={icon}/><small>{label}</small></NavLink>)}
    </nav>
    {coachOpen && coachExpanded && <button className="coach-bubble-backdrop" type="button" aria-label="Close expanded Forge coach" onClick={() => setCoachExpanded(false)} />}
    <div className={coachExpanded ? 'coach-bubble-shell expanded' : 'coach-bubble-shell'}>
      <section className={coachOpen ? 'coach-bubble-panel open' : 'coach-bubble-panel'} aria-hidden={!coachOpen} aria-label="Forge AI coach">
        <header><div><span>AI COACH</span><strong>Ask Forge</strong></div><div className="coach-window-actions"><button type="button" onClick={() => setCoachExpanded(value => !value)} aria-label={coachExpanded ? 'Restore Forge coach' : 'Expand Forge coach'} title={coachExpanded ? 'Restore' : 'Expand'}>{coachExpanded ? '↙' : '↗'}</button><button type="button" onClick={() => { setCoachOpen(false); setCoachExpanded(false); }} aria-label="Close Forge coach">×</button></div></header>
        <div className="coach-bubble-content">{coach}</div>
      </section>
      <button type="button" className={coachOpen ? 'coach-bubble-toggle active' : 'coach-bubble-toggle'} onClick={() => { setCoachOpen(open => !open); if (coachOpen) setCoachExpanded(false); }} aria-expanded={coachOpen} aria-label={coachOpen ? 'Close Forge coach' : 'Open Forge coach'}>
        <span>{coachOpen ? '×' : 'AI'}</span><b>{coachOpen ? 'Close' : 'Ask Forge'}</b>
      </button>
    </div>
  </div>;
}

export function PageIntro({ eyebrow, title, copy, action }: { eyebrow: string; title: string; copy?: string; action?: ReactNode }) {
  return <div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{copy && <p>{copy}</p>}</div>{action}</div>;
}

export function Metric({ value, label, delta }: { value: string; label: string; delta?: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span>{delta && <small>{delta}</small>}</div>;
}
