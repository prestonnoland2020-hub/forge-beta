import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdaptiveTraining } from '../features/training/AdaptiveTrainingProvider';
import { useProfileSetup } from '../features/profile/ProfileSetupProvider';
import { useWorkoutHistory } from '../features/training/WorkoutHistoryProvider';
import { isDemoMode } from '../lib/env';
import { useDailyRecommendation } from '../features/training/DailyRecommendationProvider';
import { useAthleteNotes } from '../features/training/useAthleteNotes';
import { needsFollowUp } from '../features/training/athleteNotesService';
import { loadNotificationPrefs, maybeNotifyFollowUp, maybeNotifyMorningWorkout } from '../lib/notifications';
import { getActivityConnection, syncStravaActivities } from '../features/training/activityConnectionService';
import { importStravaActivities } from '../features/training/stravaImportService';

/* One flat nav. The old "Manage" drawer hid Goals behind two taps and held a
   standalone exercise library that duplicated what the Log screen already does;
   exercises are only ever added while logging, so the library moved to Profile. */
/* Preston's nav: the AI coach lives in the floating bubble alone (a tab AND a
   bubble was the same door twice), Progress lives behind the chart bubble
   beside the log button up top, and Goals + Activities stand on their own. */
const primaryNav = [
  ['/', 'Today', 'home'],
  ['/workout', 'Log', 'plus'],
  ['/plan', 'Plan', 'calendar'],
  ['/goals', 'Goals', 'target'],
  ['/history', 'Activities', 'history'],
] as const;

type NavGlyphName = typeof primaryNav[number][2] | 'library' | 'you' | 'chart' | 'coach' | 'gear';
function NavGlyph({ name }: { name: NavGlyphName }) {
  const paths: Record<NavGlyphName, ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/></>,
    plus: <><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></>,
    history: <><path d="M4 6v5h5"/><path d="M5.5 17a8 8 0 1 0-.8-9"/><path d="M12 7v5l3 2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m15 9 6-6M17 3h4v4"/></>,
    library: <><path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4Z"/><path d="M7 16h12M9 8h6M9 11h6"/></>,
    coach: <><path d="M12 3a7 7 0 0 1 7 7c0 2.4-1.2 4.1-2.6 5.4-.6.6-.9 1.3-.9 2.1V19a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-1.5c0-.8-.3-1.5-.9-2.1C5.2 14.1 5 12.4 5 10a7 7 0 0 1 7-7Z"/><path d="M9.5 10.5 11 12l3.5-3.5"/></>,
    you: <><circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20.2c1.1-3.4 3.9-5.2 7.2-5.2s6.1 1.8 7.2 5.2"/></>,
    gear: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/></>,
  };
  return <span className="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg></span>;
}

export function AppShell({ coach }: { coach?: ReactNode }) {
  /* Deploy freshness for installed PWAs. iOS pins a Home-Screen app to the
     shell it installed with, and GitHub Pages caches index.html — so a fix
     can be live on the site while the icon on the phone still runs last
     night's engine. version.json is fetched uncached on open and whenever the
     app returns to the foreground; a mismatch surfaces one tap to reload. */
  const [updateReady,setUpdateReady]=useState(false);
  useEffect(()=>{
    let last=0;
    const check=async()=>{
      if(Date.now()-last<60000)return;last=Date.now();
      try{
        const response=await fetch(`version.json?t=${Date.now()}`,{cache:'no-store'});
        if(!response.ok)return;
        const data=await response.json() as {build?:string};
        if(data.build&&data.build!==__FORGE_BUILD__)setUpdateReady(true);
      }catch{/* offline — try again later */}
    };
    void check();
    const onVisible=()=>{if(document.visibilityState==='visible')void check()};
    document.addEventListener('visibilitychange',onVisible);
    return()=>document.removeEventListener('visibilitychange',onVisible);
  },[]);

  const location = useLocation();
  const { recovery } = useAdaptiveTraining();
  const { setup } = useProfileSetup();
  const { loading: historyLoading, syncing, syncError, retrySync, records: stravaRecords, addRecord: stravaAddRecord } = useWorkoutHistory();
  /* STRAVA SYNC RUNS WHEN THE ATHLETE LOOKS. A six-hour throttle meant a run
     recorded on the watch could sit unseen for most of a day: post it, open
     Forge, and it is not there — which reads as a broken integration, not a
     schedule. The athlete opening the app IS the signal that they want to see
     it, so the sync runs on open and again whenever they come back to the tab.
     A two-minute floor is all the throttling needed: it stops a burst of
     navigation from hammering Strava's rate limit while keeping "post a run,
     open Forge, it's there" true.

     It waits for history to load — importing against an empty record set
     would defeat the dedupe and double-log everything. */
  const SYNC_FLOOR_MS = 2 * 60 * 1000;
  const syncStravaNow = useCallback(async () => {
    if (isDemoMode || historyLoading) return;
    const throttleKey = 'forge-strava-auto-sync';
    if (Date.now() - Number(localStorage.getItem(throttleKey) || 0) < SYNC_FLOOR_MS) return;
    try {
      const status = await getActivityConnection();
      if (!status.connected) return;
      localStorage.setItem(throttleKey, String(Date.now()));
      await syncStravaActivities();
      await importStravaActivities(stravaRecords, stravaAddRecord);
    } catch { /* silent — manual sync remains in Profile → Connections */ }
  }, [historyLoading, stravaRecords, stravaAddRecord]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void syncStravaNow(); }, [historyLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    /* Coming back from Strava is the most likely moment a new activity
       exists, and on a phone that is a visibility change, not a page load. */
    const onReturn = () => { if (document.visibilityState === 'visible') void syncStravaNow(); };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    return () => { document.removeEventListener('visibilitychange', onReturn); window.removeEventListener('focus', onReturn); };
  }, [syncStravaNow]);
  const { recommendation } = useDailyRecommendation();
  const { notes } = useAthleteNotes();
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachExpanded, setCoachExpanded] = useState(false);
  const initials = (setup?.displayName || 'Forge Athlete').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const titles: Record<string, string> = {
    '/': 'Today', '/workout': 'Log workout', '/history': 'Activities', '/insights': 'Progress',
    '/coach': 'Coach', '/goals': 'Goals', '/plan': 'Plan', '/split': 'Split', '/exercises': 'Exercises', '/profile': 'Profile',
  };
  const hasRecoveryData = recovery.confidence !== 'Low';

  /* Best-effort system notifications: morning brief and body-log check-ins.
     They fire once per day when the app opens; the Coach tab always shows the
     same content in-app. */
  useEffect(() => {
    const prefs = loadNotificationPrefs();
    if (prefs.morningWorkout && recommendation) {
      const selected = recommendation.topSets.filter(set => set.selected).map(set => set.exercise);
      const summary = [recommendation.splitDay.name, selected.slice(0, 3).join(', '), recommendation.cardio?.selected ? recommendation.cardio.title : ''].filter(Boolean).join(' · ');
      maybeNotifyMorningWorkout(summary || 'Open Forge to see today’s training.');
    }
    if (prefs.injuryFollowUp) notes.filter(needsFollowUp).forEach(note => maybeNotifyFollowUp(note.area || note.kind));
  }, [recommendation, notes]);

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
    {updateReady&&<button type="button" className="update-ready-pill" onClick={()=>window.location.reload()}>Forge updated · tap to refresh</button>}
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
          {/* PROGRESS IS A BUBBLE BESIDE THE LOG BUTTON. Insights left the tab
              bar; the chart icon up here is its one home. */}
          <NavLink className="top-insights" to="/insights" aria-label="Progress and insights"><NavGlyph name="chart"/></NavLink>
          {/* LOGGING IS A HEADER ACTION, NOT A DESTINATION. Top right, beside
              the athlete's own avatar, is where every app that expects you to
              ADD something puts it. */}
          <NavLink className="top-log" to="/workout" aria-label="Log a workout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></NavLink>
          <NavLink className="top-settings" to="/profile" aria-label="Settings"><NavGlyph name="gear"/></NavLink>
          <NavLink className="avatar" to="/profile">{initials}</NavLink>
        </div>
      </header>
      {!isDemoMode && syncError && <div className="data-sync-error"><span>Your latest training data is still saved on this device, but Supabase could not sync it.</span><button onClick={retrySync}>Retry</button></div>}
      <main className="page"><Outlet /></main>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">
      <NavLink to="/" end aria-label="Today"><NavGlyph name="home"/><small>Today</small></NavLink>
      <NavLink to="/plan" aria-label="Plan"><NavGlyph name="calendar"/><small>Plan</small></NavLink>
      <NavLink to="/goals" aria-label="Goals"><NavGlyph name="target"/><small>Goals</small></NavLink>
      <NavLink to="/history" aria-label="Activities"><NavGlyph name="history"/><small>Activities</small></NavLink>
      <NavLink to="/profile" aria-label="Profile"><NavGlyph name="you"/><small>Profile</small></NavLink>
    </nav>
    {coachOpen && coachExpanded && <button className="coach-bubble-backdrop" type="button" aria-label="Close expanded Forge coach" onClick={() => setCoachExpanded(false)} />}
    <div className={`${coachExpanded ? 'coach-bubble-shell expanded' : 'coach-bubble-shell'}${location.pathname === '/coach' ? ' coach-bubble-hidden' : ''}`}>
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
